/**
 * The write-ahead: lessons never keep a learner waiting (owner's decision,
 * 2026-10-25; WRITE_AHEAD, on by default; =off restores prefetchAhead as it was).
 *
 * The level the learner stands on and the next WRITE_AHEAD_LEVELS (normally 3)
 * are kept written ahead. The horizon can rise as high as WRITE_AHEAD_MAX (10)
 * so writing stays ahead at twice the learner's observed finishing pace; every
 * level is kept with its check:
 *
 *   position 0   the level they stand on (the jump target after a jump): written
 *                first, on the free check so it can be served as soon as that
 *                passes, then Sonnet-checked straight after;
 *   1 ahead      the key's Sonnet check, in advance (WRITE_AHEAD_SONNET = 1);
 *   2-3 ahead    the free check: the claim read on the app's own route and a blind
 *                re-solve by another model family (block-levels LEVEL_SELF_CHECK,
 *                key-gate.blindResolve). When the learner moves on and one becomes
 *                the next level, its Sonnet check runs in the background.
 *
 * A level opened before its Sonnet check is done is served once its free check
 * has passed, and its Sonnet check runs on open (block-levels forLevel). Nothing
 * unchecked is ever served (block-levels servable). With no key, every level gets
 * the self-check, as before. Past the ledger's $24 stop the next level gets the
 * free check too (block-levels sonnetAffordable).
 *
 * Who gets what: a tailored learner their own levels; the owner, and every account
 * on the base product, the shared base levels (user_id null), which every base
 * user then reuses. Nothing is written for an account that may not cause a model
 * call (block-levels mayGenerate) or while no model is ready (aiReady); a child's
 * consent is applied inside services/ai.js on every call of the write. Nothing is
 * pre-built in bulk: only ahead of where each learner is.
 *
 * Every trigger is fire-and-forget. Work is queued, best first (the level the
 * learner stands on before anything ahead, then the enrollment with the higher
 * measured pace), de-duplicated by the level's plan key
 * (the same key as block-levels' in-flight map, so a request and a write-ahead
 * never write one level twice), and capped per account (WRITE_AHEAD_PER_USER, 2)
 * and in all (WRITE_AHEAD_GLOBAL, 4): the free models rate-limit. The provider
 * order is the app's own (NVIDIA first; never a paid OpenRouter model).
 * A level whose write failed is tried again later, with a growing pause.
 *
 * Re-tailoring rides the same queue: when a tailored level's learner profile has
 * drifted enough, a separate job replaces that level with a newly tailored one.
 */
const curriculum = require('../config/curriculum');

const blockLevels = () => require('./block-levels'); // eslint-disable-line global-require

function num(name, fallback, min, max) {
  const raw = process.env[name];
  const n = Math.floor(Number(raw));
  if (raw === undefined || raw === '' || !Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

const on = () => blockLevels().writeAheadOn();
const aheadCount = () => num('WRITE_AHEAD_LEVELS', 3, 0, 10);
const sonnetCount = () => Math.min(aheadCount(), num('WRITE_AHEAD_SONNET', 1, 0, 10));
const perUserCap = () => num('WRITE_AHEAD_PER_USER', 2, 1, 10);
// How many levels are written at once. WRITE_AHEAD_GLOBAL (when set) wins, as before. Otherwise 4, or
// more when the model pool (services/pool.js) has free capacity to absorb it: every AI call of a
// level write goes through the pool, which holds each slot to its own concurrency and RPM and
// hedges slow calls, so the cap only needs to keep the free slots busy. Half the free parallelism,
// between 4 and 8. A level write is several calls in a row (layout, fill, checks), not one item,
// so the pool is used per call (services/ai.js callHedged) rather than as one runBatch.
const globalCap = () => {
  const raw = process.env.WRITE_AHEAD_GLOBAL;
  if (raw !== undefined && raw !== '') return num('WRITE_AHEAD_GLOBAL', 4, 1, 50);
  if (String(process.env.AI_POOL || '1') === '0') return 4;
  // eslint-disable-next-line global-require
  const free = require('./pool').freeParallelism({ role: 'blocks', task: 'block_fill', dataClass: 'pipeline' });
  return Math.min(8, Math.max(4, Math.ceil(free / 2)));
};
const retryMs = () => num('WRITE_AHEAD_RETRY_MS', 10 * 60 * 1000, 0, 24 * 3600 * 1000);
const MAX_QUEUE = 500;

const STRENGTH = { free: 0, sonnet: 1, open: 2 };

const queue = [];
const running = new Map(); // plan key -> job
const runningFor = new Map(); // account id -> jobs running
const failures = new Map(); // plan key -> { n, at }
const events = []; // the last 300, for tests and ops
const triggeredEnrollments = new Map(); // enrollment id -> { enrollmentId, levelsPerHour, ahead }
let seq = 0;
let idleWaiters = [];

/**
 * Measure the learner's demonstrated pace for one enrollment. Only sessions
 * that both started and ended in the last seven days count; the level count
 * is the session's own count when present, otherwise its level span. Active
 * time gives every session at least one minute so a very short burst does not
 * exaggerate the rate. One session is too little evidence, so two are required.
 */
function paceFor(enrollment) {
  // eslint-disable-next-line global-require
  const db = require('../config/db');
  const asTimestamp = (value) => {
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.trim() !== '') {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) return numeric;
    }
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  };
  const now = Date.now();
  const cutoff = now - 7 * 24 * 60 * 60 * 1000;
  const rows = db.find('sessions', (row) => {
    const endedAt = asTimestamp(row.ended_at);
    const startedAt = asTimestamp(row.started_at);
    return row.enrollment_id === enrollment.id
      && Number.isFinite(startedAt)
      && Number.isFinite(endedAt)
      && endedAt >= cutoff
      && endedAt <= now;
  });
  if (rows.length < 2) return { levelsPerHour: 0, sessions: rows.length };

  let levels = 0;
  let activeMs = 0;
  for (const row of rows) {
    const endedAt = asTimestamp(row.ended_at);
    const startedAt = asTimestamp(row.started_at);
    levels += typeof row.levels === 'number'
      ? row.levels
      : Math.max(0, (row.end_level || 0) - (row.start_level || 0));
    activeMs += Math.max(60000, endedAt - startedAt);
  }
  return { levelsPerHour: levels / (activeMs / 3.6e6), sessions: rows.length };
}

/**
 * Estimate write time from the slow tail rather than the average. The
 * nearest-rank p90 of the last 30 completed writes that reported a duration
 * keeps one unusually slow run from distorting the estimate. Five samples are
 * the minimum; until then, use the conservative four-minute default.
 */
function writeMinutes() {
  const samples = events
    .filter((event) => event.type === 'done' && event.ok && typeof event.ms === 'number' && Number.isFinite(event.ms))
    .slice(-30)
    .map((event) => event.ms / 60000);
  if (samples.length < 5) return 4;
  samples.sort((a, b) => a - b);
  return samples[Math.ceil(samples.length * 0.9) - 1];
}

/**
 * Choose how many levels this enrollment must keep ahead. The configured
 * baseline remains in force when pace is unknown, while a measured pace raises
 * the horizon to cover twice the writing time needed for the learner's rate.
 * WRITE_AHEAD_MAX keeps that adaptive horizon bounded.
 */
function aheadFor(enrollment, pace = paceFor(enrollment)) {
  return Math.min(
    num('WRITE_AHEAD_MAX', 10, 3, 20),
    Math.max(aheadCount(), Math.ceil(2 * pace.levelsPerHour * writeMinutes() / 60) + 1),
  );
}

function note(event) {
  events.push({ at: Date.now(), ...event });
  if (events.length > 300) events.splice(0, events.length - 300);
}

/**
 * What the write-ahead would do for this learner now: one step per level, the
 * level they stand on first. A lesson or retention level gets a tier; a
 * checkpoint gets the tailored checkpoint prefetch (tailored learners only, as
 * prefetchAhead did); any other level is skipped. Essays keep their own prefetch.
 */
function planFor({ user, enrollment, grade }) {
  const bl = blockLevels();
  const tailored = bl.tailorsFor(user);
  const from = enrollment.current_level || 1;
  const horizon = aheadFor(enrollment);
  // "Levels" are the ones that have to be written: lesson and retention levels.
  // A practice level is the ordinary session, served at once from the bank, so
  // the path is read on (WRITE_AHEAD_SCAN, 40 levels at most) to the next ones
  // that are written. Measured on the sheets: up to 7 practice levels lie between
  // two written levels, so counting path positions (as prefetchAhead did) left
  // the next lesson cold.
  const levels = bl.levelsAhead(enrollment, grade, from, num('WRITE_AHEAD_SCAN', 40, 1, 200));
  const steps = [];
  let ahead = 0;
  for (const level of levels) {
    const kind = bl.kindFor(grade, level);
    const here = level === from;
    if (kind === 'lesson' || kind === 'retention') {
      if (!here && ahead >= horizon) break;
      const position = here ? 0 : ++ahead;
      if (!bl.visibleTo(user)) continue;
      const tier = position === 0 ? 'open' : position <= sonnetCount() ? 'sonnet' : 'free';
      steps.push({ level, position, kind, tier, tailored });
    } else if (kind === 'checkpoint' && tailored) {
      // The tailored checkpoint prefetch, as prefetchAhead did, for a checkpoint
      // reached before the last written level ahead.
      if (!here && ahead >= horizon) break;
      steps.push({ level, position: here ? 0 : ahead + 1, kind, tier: null, tailored });
    }
  }
  return steps;
}

/**
 * Start writing ahead for this learner. Never throws, never awaited.
 * Returns the steps it queued (for tests).
 */
function trigger({ user, enrollment, grade, reason = null }) {
  try {
    if (!on() || !user || !enrollment) return [];
    const bl = blockLevels();
    const g = grade || curriculum.getGrade(enrollment.track_id, enrollment.grade_id);
    if (!g || enrollment.status === 'graduated' || enrollment.status === 'placement_pending') return [];
    if (enrollment.user_id && user.id && enrollment.user_id !== user.id) return [];
    if (!bl.aiReady() || !bl.mayGenerate(user)) return [];
    const pace = paceFor(enrollment);
    const ahead = aheadFor(enrollment, pace);
    // A nearer test date is written first (services/retention-goal.js); no test date sorts last, so forever changes nothing.
    const testDays = testDaysOf(user.id, enrollment);
    const steps = planFor({ user, enrollment, grade: g });
    const trackId = enrollment.track_id;
    const gradeId = enrollment.grade_id;
    const where = { trackId, gradeId };
    const wanted = new Set();

    // Keep the last 20 enrollments in trigger order for operational status.
    triggeredEnrollments.delete(enrollment.id);
    triggeredEnrollments.set(enrollment.id, {
      enrollmentId: enrollment.id, levelsPerHour: pace.levelsPerHour, ahead,
    });
    if (triggeredEnrollments.size > 20) {
      triggeredEnrollments.delete(triggeredEnrollments.keys().next().value);
    }
    for (const step of steps) {
      if (step.kind === 'checkpoint') {
        // eslint-disable-next-line global-require
        require('./block-checkpoints').prefetch({ userId: user.id, enrollment, grade: g, level: step.level });
        continue;
      }
      const key = bl.planKey(step.tailored ? user.id : null, where.trackId, where.gradeId, step.level);
      wanted.add(key);
      enqueue({ user, step, key, enrollmentId: enrollment.id, levelsPerHour: pace.levelsPerHour, testDays, reason, ...where });
      if (!step.tailored) continue;
      const due = bl.retailorDue({ userId: user.id, trackId, gradeId, level: step.level });
      if (!due) continue;
      const retailorKey = `${key}:retailor`;
      wanted.add(retailorKey);
      if (running.has(retailorKey) || queue.some((job) => job.key === retailorKey)) continue;
      if (queue.length >= MAX_QUEUE) continue;
      queue.push({
        key: retailorKey, kind: 'retailor', user, userId: user.id, enrollmentId: enrollment.id,
        levelsPerHour: pace.levelsPerHour, testDays, reason, trackId, gradeId, level: step.level,
        tailored: step.tailored, tier: step.tier, priority: step.position + 0.5, seq: seq++,
      });
      note({ type: 'queued', key: retailorKey, kind: 'retailor', level: step.level });
    }
    // Only ahead of where the learner is: queued work for this enrollment that is
    // no longer ahead of them (they jumped, or moved on) is dropped.
    for (let i = queue.length - 1; i >= 0; i--) {
      const job = queue[i];
      if (job.userId === user.id && job.enrollmentId === enrollment.id && !wanted.has(job.key)) {
        queue.splice(i, 1);
        note({ type: 'dropped', key: job.key, why: 'no longer ahead' });
      }
    }
    note({ type: 'trigger', userId: user.id, enrollmentId: enrollment.id, reason, levels: steps.map((s) => `${s.level}:${s.tier || 'checkpoint'}`) });
    setImmediate(pump);
    return steps;
  } catch (err) {
    console.warn(`write-ahead: ${err.message}`);
    return [];
  }
}

/** Write ahead on every enrollment the dashboard shows that the learner is working on, most recent first (WRITE_AHEAD_ENROLLMENTS, 4: every subject of the four, so the next level loads rather than generates whichever subject is opened). */
function triggerForUser({ user, reason = 'dashboard' }) {
  try {
    if (!on() || !user) return;
    // eslint-disable-next-line global-require
    const db = require('../config/db');
    const rows = db.find('enrollments', (e) => e.user_id === user.id && e.status !== 'graduated' && e.status !== 'placement_pending')
      .sort((a, b) => String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || '')))
      .slice(0, num('WRITE_AHEAD_ENROLLMENTS', 4, 0, 20));
    for (const enrollment of rows) trigger({ user, enrollment, reason });
  } catch (err) {
    console.warn(`write-ahead: ${err.message}`);
  }
}

/** Days to the learner's test in this subject (null: none set, or the test has passed). */
function testDaysOf(userId, enrollment) {
  try {
    // eslint-disable-next-line global-require
    const eff = require('./retention-goal').forEnrollment(userId, enrollment);
    return eff.status === 'date' ? eff.days_left : null;
  } catch { return null; }
}
const soonest = (job) => (Number.isFinite(job.testDays) ? job.testDays : 1e9);

function enqueue({ user, step, key, enrollmentId, levelsPerHour, testDays = null, reason, trackId, gradeId }) {
  const bl = blockLevels();
  const owner = step.tailored ? user.id : null;
  const plan = bl.findPlan({ userId: owner, trackId, gradeId, level: step.level });
  let kind = 'write';
  if (plan) {
    // Written and servable: nothing to do, unless it is still to be Sonnet-checked
    // and has become the level they stand on or the next one.
    if (!(bl.sonnetPending(plan) && step.tier !== 'free')) return;
    kind = 'upgrade';
  } else {
    const failed = failures.get(key);
    if (failed && Date.now() - failed.at < retryMs() * 2 ** Math.min(failed.n - 1, 5)) {
      note({ type: 'waiting-retry', key });
      return;
    }
  }
  const live = running.get(key);
  if (live) {
    if (STRENGTH[step.tier] > STRENGTH[live.tier]) live.tier = step.tier;
    return;
  }
  const queued = queue.find((j) => j.key === key);
  if (queued) {
    queued.priority = Math.min(queued.priority, step.position);
    if (STRENGTH[step.tier] > STRENGTH[queued.tier]) queued.tier = step.tier;
    if (kind === 'write') queued.kind = 'write';
    return;
  }
  if (queue.length >= MAX_QUEUE) return;
  queue.push({
    key, kind, user, userId: user.id, enrollmentId, levelsPerHour, testDays, reason, trackId, gradeId,
    level: step.level, tailored: step.tailored, tier: step.tier, priority: step.position, seq: seq++,
  });
  note({ type: 'queued', key, kind, tier: step.tier, level: step.level });
}

function pump() {
  queue.sort((a, b) => a.priority - b.priority || soonest(a) - soonest(b) || (b.levelsPerHour || 0) - (a.levelsPerHour || 0) || a.seq - b.seq);
  for (let i = 0; i < queue.length && running.size < globalCap();) {
    const job = queue[i];
    if ((runningFor.get(job.userId) || 0) >= perUserCap() || running.has(job.key)) { i++; continue; }
    queue.splice(i, 1);
    start(job);
  }
  if (!queue.length && !running.size) {
    const waiters = idleWaiters;
    idleWaiters = [];
    for (const w of waiters) w();
  }
}

function start(job) {
  const startedAt = Date.now();
  const bl = blockLevels();
  running.set(job.key, job);
  runningFor.set(job.userId, (runningFor.get(job.userId) || 0) + 1);
  note({ type: 'start', key: job.key, kind: job.kind, tier: job.tier });
  const where = { userId: job.userId, trackId: job.trackId, gradeId: job.gradeId, level: job.level, tailored: job.tailored };
  let work;
  if (job.kind === 'upgrade') {
    work = Promise.resolve(bl.findPlan({ ...where, userId: job.tailored ? job.userId : null })).then((p) => (p ? bl.upgrade(p) : null));
  } else if (job.kind === 'retailor') {
    work = bl.retailor({ userId: job.userId, trackId: job.trackId, gradeId: job.gradeId, level: job.level });
  } else {
    // The level stood on is written on the free check (so it can be served at
    // once) and Sonnet-checked after, as an upgrade below.
    work = bl.ensure({ ...where, tier: job.tier === 'open' ? 'free' : job.tier });
  }
  Promise.resolve(work)
    .then((plan) => {
      if (job.kind === 'write') {
        if (plan) failures.delete(job.key);
        else {
          const before = failures.get(job.key);
          failures.set(job.key, { n: before ? before.n + 1 : 1, at: Date.now() });
        }
      }
      const done = {
        type: 'done',
        key: job.key,
        kind: job.kind,
        ok: !!plan,
        ms: Date.now() - startedAt,
      };
      if (job.kind !== 'retailor') {
        done.tier = job.tier;
        done.check_tier = plan ? plan.check_tier || null : null;
      }
      note(done);
      // Its Sonnet check, when it is the level stood on or the next one.
      if (job.kind === 'write' && plan && job.tier !== 'free' && bl.sonnetPending(plan)) {
        queue.push({ ...job, kind: 'upgrade', seq: seq++ });
        note({ type: 'queued', key: job.key, kind: 'upgrade', tier: job.tier, level: job.level });
      }
    })
    .catch((err) => {
      note({ type: 'error', key: job.key, error: err.message, ms: Date.now() - startedAt });
    })
    .finally(() => {
      running.delete(job.key);
      const n = (runningFor.get(job.userId) || 1) - 1;
      if (n > 0) runningFor.set(job.userId, n); else runningFor.delete(job.userId);
      pump();
    });
}

/** Resolves once nothing is queued or running (tests). */
function idle() {
  if (!queue.length && !running.size) return Promise.resolve();
  return new Promise((resolve) => { idleWaiters.push(resolve); });
}

function status() {
  return {
    on: on(),
    levels: aheadCount(),
    sonnet: sonnetCount(),
    per_user: perUserCap(),
    global: globalCap(),
    writeMinutes: writeMinutes(),
    enrollments: [...triggeredEnrollments.values()],
    queued: queue.map((j) => ({ key: j.key, kind: j.kind, tier: j.tier, priority: j.priority })),
    running: [...running.values()].map((j) => ({ key: j.key, kind: j.kind, tier: j.tier })),
    failures: [...failures].map(([key, f]) => ({ key, ...f })),
  };
}

/** Forget queued work, recorded failures, event history, and trigger history (tests). Running work is left to finish. */
function reset() {
  queue.length = 0;
  failures.clear();
  events.length = 0;
  triggeredEnrollments.clear();
}

module.exports = { trigger, triggerForUser, planFor, idle, status, reset, events, paceFor, writeMinutes, aheadFor, testDaysOf };
