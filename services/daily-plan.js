/**
 * The daily plan (owner's subjects audit, gap 2; docs/DAILY-PLAN.md has the design and the SIMULATED numbers).
 *
 * Given the minutes a learner has today, planFor(userId, { minutes, now }) builds the day across every
 * enrolled subject, from what Savant already knows:
 *
 *   reviews      first, ordered by forgetting risk times the goal's weight (services/retention-goal.js: a test
 *                date soon outranks a goal of forever). One review sitting per subject, as the review page serves it
 *                (services/review-session.js, the same list the dashboard shows), plus the learner's own courses
 *                that have skills or cards due. What does not fit is deferred, not cut in half.
 *   new material split across subjects by need: test dates (an exponential in the days left), how far a subject lags
 *                the learner's others, a catch-up in progress, momentum, and a hard floor: no subject goes more than
 *                2 days untouched (a subject at that limit gets its next level first) unless its goal is met.
 *                Levels already written ahead (services/write-ahead.js: they load instantly) are preferred.
 *   time         a level's minutes come from the learner's own pace (write-ahead paceFor, two sessions in seven days),
 *                else grade defaults scaled by the spec's session minutes (learning-spec scaleMinutes).
 *   spec         session.breakEveryMinutes and session.breakMinutes put breaks between blocks and count against the
 *                minutes given; a block is never longer than session.minutes (a longer level is flagged, not split).
 *   catch-up     an accepted catch-up (services/gap-scan.js route) is worked before the grade it leads to; a placement
 *                not yet taken comes before that subject's levels.
 *   enforcers    services/enforcers.js is read, never changed (the owner's calendar stays exactly): an enforcer left
 *                half done goes first, today's scheduled one goes last ("End day session"), and its time is taken off
 *                the day. With the daily review folded into the enforcers (ENFORCER_FOLD_REVIEW, the default) the
 *                review already skips what an enforcer covers; unfolded, the review rows an enforcer's window covers
 *                are dropped, so nothing is counted in both.
 *
 * allocate() is pure (the simulation, scripts/daily-plan-sim.js, calls it with simulated subjects); gather() reads the
 * database and the services above. No model is called and nothing is measured that was not already: a plan only
 * re-reads what the learner has already done.
 */
const db = require('../config/db');
const curriculum = require('../config/curriculum');

const lazy = (p) => require(p); // eslint-disable-line global-require, import/no-dynamic-require

const DAY = 24 * 3600 * 1000;
const PRESETS = [30, 45, 60, 90, 120];
const MIN_MINUTES = 10;
const MAX_MINUTES = 240;
const DEFAULT_MINUTES = 45;
const LOOKAHEAD = 14; // levels read ahead per subject
const MAX_GAP_DAYS = 2; // a subject is never untouched for more than this many days
const PLACEMENT_MINUTES = 12;
const REVIEW_SHARE = 0.5; // of the day's study time, raised when a test is close
const REVIEW_SHARE_URGENT = 0.8;
const LEVEL_DEFAULT_MIN = { lesson: 10, practice: 6, retention: 7, master: 12, grand: 18, graduation: 25, essay: 15 };
const CHECKPOINTS = new Set(['master', 'grand', 'graduation', 'essay']);

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const round1 = (x) => Math.round(x * 10) / 10;

/** A valid minutes value (whole, 10 to 240) or null. */
function cleanMinutes(raw) {
  const n = Number(raw);
  if (raw === null || raw === undefined || raw === '' || !Number.isFinite(n)) return null;
  const m = Math.round(n);
  return m >= MIN_MINUTES && m <= MAX_MINUTES ? m : null;
}

/** The learner's remembered choice (PUT /api/plan/minutes), else DEFAULT_MINUTES. */
function savedMinutes(userId) {
  const u = db.byId('users', userId);
  return cleanMinutes(u && u.daily_plan_minutes) || DEFAULT_MINUTES;
}

function saveMinutes(userId, minutes) {
  const m = cleanMinutes(minutes);
  if (!m) return null;
  db.update('users', userId, { daily_plan_minutes: m });
  return m;
}

// ── time estimates ────────────────────────────────────────────────────────

/**
 * Minutes for one level. With a measured pace (levels an hour over the last week) the level takes the average
 * time that pace implies, scaled by how long its kind runs against the average level; without one, the grade
 * default for its kind scaled by the spec's session minutes.
 */
function levelMinutes(kind, pace, session) {
  const base = LEVEL_DEFAULT_MIN[kind] || 8;
  if (pace && pace.levelsPerHour > 0) {
    return { minutes: Math.round(clamp((60 / pace.levelsPerHour) * (base / 8), 2, 45)), paceBased: true };
  }
  const f = clamp(((session && session.minutes) || 20) / 20, 0.6, 1.5);
  return { minutes: Math.max(3, Math.round(base * f)), paceBased: false };
}

// ── needs ─────────────────────────────────────────────────────────────────

/** How much a goal raises the weight of a review: a test date soon far above forever. */
function goalWeight(goal) {
  if (!goal || goal.status === 'forever' || goal.status === 'after_test') return 0.8;
  if (goal.status === 'date') return 1 + 1.2 * Math.exp(-Math.max(0, goal.days_left) / 10);
  const byHorizon = { months: 1.0, year: 0.9, years: 0.85 };
  return byHorizon[goal.horizon] || 0.8;
}

/** The weight a test date gives a subject's new material (zero without one; 4.5 on the day, about 0.7 at 30 days). */
function dateNeed(goal, progress) {
  if (!goal || goal.status !== 'date' || !Number.isFinite(goal.days_left)) return 0;
  return 0.5 + 4 * Math.exp(-Math.max(0, goal.days_left) / 10) * (0.5 + 0.5 * (1 - progress));
}

/** A subject whose goal is met: it takes no time in the plan. */
const goalMet = (s) => s.graduated || (s.goal && s.goal.status === 'stopped');

function needOf(s, avgProgress) {
  let need = 1;
  need += dateNeed(s.goal, s.progress);
  need += 4 * clamp(avgProgress - s.progress, 0, 1);
  if (s.role === 'catchup') need += 0.6;
  need += 0.3 * clamp(s.momentum || 0, 0, 1);
  if (s.gapDays >= 1) need *= 1.5;
  return need;
}

// ── the allocation (pure) ─────────────────────────────────────────────────

/** The study minutes that leave room for breaks inside `minutes`. */
function studyBudget(minutes, session) {
  const every = Math.max(4, session.breakEveryMinutes || 15);
  const rest = Math.max(0, session.breakMinutes || 0);
  let s = minutes;
  while (s > 0 && s + Math.floor((s - 1) / every) * rest > minutes) s -= 1;
  return s;
}

const num1 = (x) => (Number.isInteger(x) ? String(x) : String(round1(x)));
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

function levelWhy(s, lv, extra = []) {
  const parts = [];
  if (s.goal && s.goal.status === 'date') parts.push(`test in ${plural(s.goal.days_left, 'day')}`);
  if (s.role === 'catchup') parts.push('catch-up comes before the grade it leads to');
  else if (s.gapDays >= MAX_GAP_DAYS) parts.push(`${plural(s.gapDays, 'day')} since you last studied it`);
  else if (s.lag > 0.2) parts.push('furthest behind your other subjects');
  parts.push(lv.ready ? 'written ahead, opens at once' : 'written when you open it');
  parts.push(`about ${num1(lv.estMinutes)} min${lv.paceBased ? ' at your pace' : ''}`);
  return [...parts, ...extra].join('; ');
}

function reviewWhy(r, goal) {
  const bits = [];
  if (r.memoryChecks) bits.push(`${plural(r.memoryChecks, 'memory check')} waiting`);
  if (r.items) bits.push(`${plural(r.items, 'question')} on skills fading`);
  if (r.reteach) bits.push(`${plural(r.reteach, 'objective')} to re-teach`);
  if (goal && goal.status === 'date') bits.push(`test in ${plural(goal.days_left, 'day')}`);
  else if (goal && goal.status === 'horizon') bits.push(`kept for ${goal.horizon === 'months' ? 'a few months' : goal.horizon === 'year' ? 'a year' : 'years'}`);
  if (r.minRecall !== null && r.minRecall !== undefined) bits.push(`lowest recall ${Math.round(r.minRecall * 100)}%`);
  return bits.join('; ') || 'due for review';
}

/**
 * Build the day from simulated or gathered state.
 *
 * input: { minutes, session: { minutes, breakEveryMinutes, breakMinutes },
 *          subjects: [{ enrollmentId, trackId, gradeId, title, group, role: 'main'|'catchup', status,
 *                       blocked: null|string, graduated, goal, progress, lag, gapDays, momentum, placement: null|{href},
 *                       levels: [{ level, kind, estMinutes, ready, paceBased }], review: null|{...}, hrefOf(level)|href }],
 *          materials: [{ materialId, title, estMinutes, items, goal }],
 *          enforcers: { resume: [{ enforcerId, estMinutes, label }], scheduled: null|{ estMinutes, label } } }
 */
function allocate(input) {
  const session = input.session || { minutes: 20, breakEveryMinutes: 15, breakMinutes: 3 };
  const minutes = input.minutes;
  const S = studyBudget(minutes, session);
  const cap = Math.max(4, session.minutes || 20);
  const subjects = (input.subjects || []).filter((s) => !goalMet(s));
  const avgProgress = subjects.length ? subjects.reduce((n, s) => n + s.progress, 0) / subjects.length : 0;
  for (const s of subjects) { s.lag = Math.max(0, avgProgress - s.progress); s.need = needOf(s, avgProgress); }
  const skipped = [];
  const lead = []; // enforcers left half done
  const reviews = [];
  const entries = new Map(); // enrollmentId -> blocks of new material
  const touched = new Set(); // groups with any block today
  let used = 0;
  const room = () => S - used;
  const groupOf = (s) => s.group || s.enrollmentId;

  // 0. what the enforcers already hold: half-done ones now, today's scheduled one at the end (taken off the day, capped at a third of it).
  for (const r of (input.enforcers && input.enforcers.resume) || []) {
    const est = clamp(r.estMinutes || 4, 1, cap);
    if (est > room()) { skipped.push({ kind: 'review', enforcerId: r.enforcerId, reason: 'no time left today' }); continue; }
    used += est;
    lead.push({ enrollmentId: null, trackId: null, kind: 'review', level: null, estMinutes: round1(est), enforcer: true, enforcerId: r.enforcerId, href: `/enforcer?id=${r.enforcerId}&then=start`, why: `Finish your ${String(r.label || 'retention').toLowerCase()} retention enforcer first: it is half done, and it locks in what you did before` });
  }
  let tail = null;
  const sched = input.enforcers && input.enforcers.scheduled;
  if (sched) {
    const est = Math.min(clamp(sched.estMinutes || 4, 1, cap), Math.floor(S / 3) || 1);
    if (est <= room()) {
      used += est;
      tail = { enrollmentId: null, trackId: null, kind: 'review', level: null, estMinutes: round1(est), enforcer: true, scheduledEnforcer: true, href: '/enforcer', why: `End day session today is your ${String(sched.label || 'scheduled').toLowerCase()} retention enforcer${sched.absorbs && sched.absorbs.length ? ` (it takes in ${sched.absorbs.join(' and ')})` : ''}: one sitting for it and today together; already counted, so the reviews above leave out what it covers` };
    }
  }

  // 1. reviews by forgetting risk times goal weight, inside a share of the day.
  const urgent = subjects.some((s) => s.goal && s.goal.status === 'date' && s.goal.days_left <= 7 && s.review)
    || subjects.some((s) => s.review && s.review.memoryChecks);
  const reviewRoom = Math.max(0, Math.floor(S * (urgent ? REVIEW_SHARE_URGENT : REVIEW_SHARE)) - used);
  const cand = [];
  for (const s of subjects) {
    if (s.review && s.review.estMinutes > 0) cand.push({ s, r: s.review, weight: clamp(s.review.risk, 0.05, 1) * goalWeight(s.goal) });
  }
  for (const m of input.materials || []) {
    if (m.estMinutes > 0) cand.push({ m, r: { ...m, risk: m.risk || 0.5 }, weight: clamp(m.risk || 0.5, 0.05, 1) * goalWeight(m.goal) });
  }
  cand.sort((a, b) => b.weight - a.weight);
  let reviewUsed = 0;
  for (const c of cand) {
    const est = Math.min(c.r.estMinutes, cap);
    const first = reviews.length === 0;
    if (est > room() || (!first && reviewUsed + est > reviewRoom)) {
      skipped.push({ kind: 'review', enrollmentId: c.s ? c.s.enrollmentId : null, trackId: c.s ? c.s.trackId : null, reason: est > room() ? 'no time left today' : 'kept for tomorrow: the day\'s review share is full' });
      continue;
    }
    used += est; reviewUsed += est;
    if (c.s) touched.add(groupOf(c.s));
    reviews.push(c.s
      ? { enrollmentId: c.s.enrollmentId, trackId: c.s.trackId, kind: 'review', level: null, estMinutes: round1(est), items: c.r.items + (c.r.reteach || 0), href: c.r.href || `/review?enrollment=${c.s.enrollmentId}`, subject: c.s.title, why: reviewWhy(c.r, c.s.goal) }
      : { enrollmentId: null, trackId: null, kind: 'review', level: null, estMinutes: round1(est), items: c.m.items, materialId: c.m.materialId, href: `/my-material-study?id=${encodeURIComponent(c.m.materialId)}`, subject: c.m.title, why: `${plural(c.m.items, 'skill or card')} due in your own course ${c.m.title}${c.m.goal && c.m.goal.status === 'date' ? `; test in ${plural(c.m.goal.days_left, 'day')}` : ''}` });
  }

  // 2. new material: the next level of a subject, one at a time. A level goes in whole (a block is a level).
  const open = subjects.filter((s) => !s.blocked && (s.levels.length || s.placement));
  const next = new Map(open.map((s) => [s.enrollmentId, 0]));
  const alloc = new Map(open.map((s) => [s.enrollmentId, 0]));
  const push = (s, block) => {
    if (!entries.has(s.enrollmentId)) entries.set(s.enrollmentId, []);
    entries.get(s.enrollmentId).push(block);
    used += block.estMinutes;
    alloc.set(s.enrollmentId, alloc.get(s.enrollmentId) + block.estMinutes);
    touched.add(groupOf(s));
  };
  const hrefOf = (s, lv) => (typeof s.hrefOf === 'function' ? s.hrefOf(lv.level, lv) : `/session?enrollment=${s.enrollmentId}`);
  const take = (s, slack = 1) => {
    const lv = s.levels[next.get(s.enrollmentId)];
    if (!lv) return false;
    if (lv.estMinutes > room() * slack + 1e-9) return false;
    next.set(s.enrollmentId, next.get(s.enrollmentId) + 1);
    push(s, {
      enrollmentId: s.enrollmentId, trackId: s.trackId, kind: s.role === 'catchup' ? 'catchup' : 'level', level: lv.level, estMinutes: lv.estMinutes, ready: !!lv.ready,
      checkpoint: !!lv.checkpoint, long: lv.estMinutes > cap, href: hrefOf(s, lv), subject: s.title, why: levelWhy(s, lv),
    });
    return true;
  };
  // 2a. a placement not yet taken comes before that subject's levels.
  for (const s of open.filter((x) => x.placement)) {
    const est = clamp(s.placement.estMinutes || PLACEMENT_MINUTES, 4, cap);
    if (est > room()) { skipped.push({ kind: 'catchup', enrollmentId: s.enrollmentId, trackId: s.trackId, reason: 'no time left today' }); continue; }
    push(s, { enrollmentId: s.enrollmentId, trackId: s.trackId, kind: 'catchup', level: null, estMinutes: est, placement: true, ready: true, href: s.placement.href || `/placement?enrollment=${s.enrollmentId}`, subject: s.title, why: 'Placement first: it cuts the path to what you do not know yet; no levels until it is taken' });
    next.set(s.enrollmentId, s.levels.length); // its levels wait for the placement
  }
  // 2b. a subject at the limit of days untouched gets its next level before anything else (longest untouched first).
  for (const s of open.filter((x) => !x.placement && x.gapDays >= MAX_GAP_DAYS && !touched.has(groupOf(x))).sort((a, b) => b.gapDays - a.gapDays)) {
    if (!take(s)) skipped.push({ kind: 'level', enrollmentId: s.enrollmentId, trackId: s.trackId, reason: 'at the untouched limit but no time left today' });
  }
  // 2c. the rest by need: a subject's weight over what it already has (so shares follow need), unwritten levels a little behind written ones.
  const pick = () => {
    let best = null;
    for (const s of open) {
      if (s.placement) continue;
      const lv = s.levels[next.get(s.enrollmentId)];
      if (!lv || lv.estMinutes > room() + 1e-9) continue;
      const score = (s.need / (alloc.get(s.enrollmentId) + 6)) * (lv.ready ? 1.25 : 0.85);
      if (!best || score > best.score) best = { s, score };
    }
    return best && best.s;
  };
  for (let guard = 0; guard < 200; guard++) {
    const s = pick();
    if (!s || !take(s)) break;
  }
  for (const s of open) {
    if (!touched.has(groupOf(s)) && !s.placement && s.levels.length) skipped.push({ kind: 'level', enrollmentId: s.enrollmentId, trackId: s.trackId, reason: 'no time left for it today' });
  }

  // 3. order: half-done enforcers, reviews by priority, new material in runs (highest need first, one subject at a time), the day's scheduled enforcer.
  const runs = [...entries.entries()].map(([id, blocks]) => ({ s: open.find((x) => x.enrollmentId === id), blocks }))
    // A run whose first level is not yet written goes a little later, so the write-ahead has the earlier blocks' time to finish it.
    .sort((a, b) => (b.blocks[0].placement ? 1 : 0) - (a.blocks[0].placement ? 1 : 0) || b.s.need * (b.blocks[0].ready ? 1 : 0.6) - a.s.need * (a.blocks[0].ready ? 1 : 0.6));
  const ordered = [...lead, ...reviews, ...runs.flatMap((r) => r.blocks), ...(tail ? [tail] : [])];

  // 4. breaks every breakEveryMinutes of study, at a block boundary, counted against the minutes given; trim the end if they push past.
  let blocks = withBreaks(ordered, session);
  while (total(blocks) > minutes + 1e-9) {
    const at = ordered.map((b) => !b.enforcer).lastIndexOf(true);
    if (at < 0) break;
    const [cut] = ordered.splice(at, 1);
    skipped.push({ kind: cut.kind, enrollmentId: cut.enrollmentId, trackId: cut.trackId, reason: 'breaks left no room for it' });
    blocks = withBreaks(ordered, session);
  }
  const studyMinutes = blocks.filter((b) => b.kind !== 'break').reduce((n, b) => n + b.estMinutes, 0);
  const breakMinutes = blocks.filter((b) => b.kind === 'break').reduce((n, b) => n + b.estMinutes, 0);
  const levelBlocks = blocks.filter((b) => b.kind === 'level' || b.kind === 'catchup');
  const levelMin = levelBlocks.reduce((n, b) => n + b.estMinutes, 0);
  return {
    minutes,
    blocks,
    study_minutes: round1(studyMinutes),
    break_minutes: breakMinutes,
    minutes_used: round1(studyMinutes + breakMinutes),
    ready_share: levelMin ? round1((levelBlocks.filter((b) => b.ready).reduce((n, b) => n + b.estMinutes, 0) / levelMin) * 100) / 100 : null,
    subjects_touched: touched.size,
    // Levels in the plan that are not written yet (what the write-ahead would have to finish while the earlier blocks are done).
    unwritten: levelBlocks.filter((b) => !b.ready).map((b) => ({ enrollmentId: b.enrollmentId, level: b.level })),
    skipped,
    session: { minutes: session.minutes, break_every: session.breakEveryMinutes, break_minutes: session.breakMinutes },
  };
}

const total = (blocks) => blocks.reduce((n, b) => n + b.estMinutes, 0);

/** Put a break after the block that takes study time past each breakEveryMinutes mark, never at the end. */
function withBreaks(blocks, session) {
  const every = Math.max(4, session.breakEveryMinutes || 15);
  const rest = Math.max(0, session.breakMinutes || 0);
  const out = [];
  let since = 0;
  const rest1 = () => ({ enrollmentId: null, trackId: null, kind: 'break', level: null, estMinutes: rest, why: `A ${rest}-minute break after ${Math.round(since)} minutes of study` });
  blocks.forEach((b, i) => {
    // The break falls at a block boundary: before a block that would carry the stretch well past the mark, else after the block that reaches it.
    if (rest && i > 0 && since >= 0.6 * every && since + b.estMinutes > 1.3 * every) { out.push(rest1()); since = 0; }
    out.push(b);
    since += b.estMinutes;
    if (rest && since >= every && i < blocks.length - 1) { out.push(rest1()); since = 0; }
  });
  return out;
}

// ── gathering (reads the database and the services) ───────────────────────

/** Whole local days between the learner's last session in a group and today, minus one: the days passed with nothing (0: yesterday or today). */
function gapDaysOf(userId, ids, enrollments, now, tz) {
  const schedule = lazy('./retention-schedule');
  const today = schedule.dateNumber(schedule.localDate(now, tz));
  let last = 0;
  for (const s of db.find('sessions', (x) => x.user_id === userId && ids.has(x.enrollment_id))) {
    const t = Date.parse(s.ended_at || s.started_at || 0);
    if (Number.isFinite(t) && t > last && t <= now) last = t;
  }
  if (!last) for (const e of enrollments) { const t = Date.parse(e.created_at || 0); if (Number.isFinite(t)) last = Math.max(last, t); }
  if (!last) return 0;
  return Math.max(0, today - schedule.dateNumber(schedule.localDate(last, tz)) - 1);
}

/** The next levels of an enrollment as the planner reads them. */
function levelsOf(user, e, grade, pace, session, now) {
  const bl = lazy('./block-levels');
  if (e.checkpoint_retry_at && Date.parse(e.checkpoint_retry_at) > now) return { levels: [], blocked: 'a checkpoint retry is cooling down' };
  let list;
  try { list = bl.levelsAhead(e, grade, e.current_level || 1, LOOKAHEAD); } catch { list = [e.current_level || 1]; }
  let tailored = false;
  try { tailored = bl.tailorsFor(user); } catch { tailored = false; }
  const levels = [];
  for (const level of list) {
    let kind = curriculum.levelKind(level, grade.pathLength, grade);
    let bk = null;
    try { bk = bl.kindFor(grade, level); } catch { bk = null; }
    if (bk === 'retention') kind = 'retention';
    let ready = true;
    try {
      if (bk && bl.visibleTo(user) && !(bk === 'checkpoint' && !tailored)) ready = !!bl.findPlan({ userId: tailored ? user.id : null, trackId: e.track_id, gradeId: e.grade_id, level });
    } catch { ready = false; }
    const est = levelMinutes(kind, pace, session);
    const checkpoint = CHECKPOINTS.has(kind) || (bk === 'checkpoint');
    levels.push({ level, kind, estMinutes: est.minutes, paceBased: est.paceBased, ready, checkpoint });
    if (checkpoint) break; // what comes after waits on the checkpoint's result
  }
  return { levels, blocked: null };
}

function reviewOf(userId, e, now, sched) {
  let rev = null;
  try {
    const reviewSession = lazy('./review-session');
    if (!reviewSession.enabled()) return null;
    rev = reviewSession.today(userId, e, { now });
  } catch { return null; }
  if (!rev || rev.done_today) return null;
  let retrieve = rev.retrieve || [];
  const reteach = rev.reteach || [];
  // Unfolded daily review: what today's scheduled enforcer covers is the enforcer's, not the review's.
  if (sched && sched.covered && !lazy('./enforcers').foldsReview()) {
    retrieve = retrieve.filter((r) => !sched.covered.has(r.objective) && !sched.covered.has(`skill:${r.skill}`));
  }
  const itemMin = lazy('./adaptation').knobs().ITEM_MINUTES;
  const est = retrieve.length * itemMin + reteach.reduce((n, r) => n + (Number(r.minutes) || 0), 0);
  if (!retrieve.length && !reteach.length) return null;
  const recalls = retrieve.filter((r) => Number.isFinite(r.recall)).map((r) => r.recall);
  const minRecall = recalls.length ? Math.min(...recalls) : null;
  const memoryChecks = retrieve.filter((r) => r.reason === 'memory_check').length;
  const risk = memoryChecks ? 1 : reteach.length && minRecall === null ? 0.9 : clamp(1 - (minRecall === null ? 0.5 : minRecall), 0.05, 1);
  return { estMinutes: round1(Math.max(1, est)), items: retrieve.length, reteach: reteach.length, memoryChecks, minRecall, risk, href: `/review?enrollment=${e.id}` };
}

/** Today's scheduled enforcer, an estimate of its minutes, and the objectives its window covers (read-only: enforcers.offers would write rows). */
function enforcerState(userId, now) {
  const out = { resume: [], scheduled: null, covered: null };
  let enforcers;
  try { enforcers = lazy('./enforcers'); if (!enforcers.enabled()) return out; } catch { return out; }
  const params = lazy('./retention-params');
  const study = lazy('./study-sessions');
  const schedule = lazy('./retention-schedule');
  try {
    const validity = params.load().validity_ms;
    for (const row of db.find('enforcers', (x) => x.user_id === userId && (x.status === 'running' || x.status === 'choosing'))) {
      // An end-of-session offer lapses after 24 hours, an end-of-day one after 48 (enforcers.expire retires them; read-only here).
      if (!enforcers.SCHEDULED.has(row.scope) && now - (Date.parse(row.offered_at || row.created_at) || now) > (row.scope === 'day' ? validity.day : validity.session)) continue;
      let est = 4;
      try { est = clamp(enforcers.budgetFor(row, row.tier || 'medium') / 60000, 2, 12) - (row.elapsed_ms || 0) / 60000; } catch { /* estimate stays */ }
      out.resume.push({ enforcerId: row.id, status: row.status, scope: row.scope, estMinutes: Math.max(1.5, round1(est)), label: schedule.LABEL[row.scope] || row.scope || 'retention' });
    }
    const t = enforcers.scheduledToday(userId, now);
    if (t && !t.done && !out.resume.some((r) => r.enforcerId === t.enforcer_id)) {
      const anchor = study.anchorOf(userId);
      const tz = study.zoneFor(userId);
      const day = schedule.dayIndex(anchor, schedule.localDate(now, tz));
      const w = schedule.windowFor(t.type, day);
      const from = schedule.addDays(anchor, w.from);
      const to = schedule.addDays(anchor, w.to);
      const active = study.inDays(userId, from, to).reduce((n, x) => n + (Number(x.active_ms) || 0), 0);
      const cap = params.load().daily_cap_ms / 60000;
      const est = clamp(params.FULL_CAP * (active / 60000) * (1 + 0.25 * t.absorbs.length), 2, cap);
      const covered = new Set();
      for (const r of enforcers.windowItems(userId, { from_date: from, to_date: to }, tz)) {
        if (r.item.objective_id) covered.add(r.item.objective_id);
        if (r.item.skill_id) covered.add(`skill:${r.item.skill_id}`);
      }
      out.scheduled = { estMinutes: round1(est), label: t.label, absorbs: t.absorbs.map((a) => a.label), enforcerId: t.enforcer_id };
      out.covered = covered;
      // An unchosen scheduled offer waiting from an earlier day is taken in by today's at End day session (enforcers.scheduledOffer merges them): one sitting, one block.
      for (const r of out.resume.filter((x) => x.status === 'choosing' && enforcers.SCHEDULED.has(x.scope))) {
        out.scheduled.estMinutes = Math.max(out.scheduled.estMinutes, r.estMinutes);
        if (!out.scheduled.absorbs.includes(r.label) && r.label !== out.scheduled.label) out.scheduled.absorbs.push(r.label);
      }
      out.resume = out.resume.filter((x) => !(x.status === 'choosing' && enforcers.SCHEDULED.has(x.scope)));
    }
  } catch (err) { console.warn(`daily-plan: enforcers not read: ${err.message}`); }
  return out;
}

/** The learner's subjects, catch-ups and courses as allocate() reads them. */
function gather(userId, { now = Date.now(), minutes = DEFAULT_MINUTES, paces = null } = {}) {
  const user = db.byId('users', userId);
  const study = lazy('./study-sessions');
  const retentionGoal = lazy('./retention-goal');
  const writeAhead = lazy('./write-ahead');
  const gapScan = lazy('./gap-scan');
  const baseLessons = lazy('../config/base-lessons');
  const tz = study.zoneFor(userId);
  let session = { minutes: 20, breakEveryMinutes: 15, breakMinutes: 3 };
  try { const spec = lazy('./learning-spec').buildSpec(userId, {}); if (spec && spec.session) session = spec.session; } catch { /* the default stands */ }

  const rows = db.find('enrollments', (e) => e.user_id === userId && (e.status === 'active' || e.status === 'placement_pending'));
  // Catch-up enrollments hang under the grade they lead to, in the route's order.
  const parentOf = new Map();
  const routes = new Map();
  for (const e of rows) {
    if (e.status !== 'active') continue;
    let route = null;
    try { route = gapScan.routeForEnrollment(userId, e); } catch { route = null; }
    routes.set(e.id, route);
    if (route && route.status === 'accepted') {
      for (const st of route.steps || []) if (st.enrollment_id && st.enrollment_id !== e.id && st.status !== 'done' && !parentOf.has(st.enrollment_id)) parentOf.set(st.enrollment_id, e.id);
    }
  }
  const sched = enforcerState(userId, now);
  const groups = new Map();
  for (const e of rows) { const g = parentOf.get(e.id) || e.id; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(e); }

  const subjects = [];
  for (const e of rows) {
    const grade = curriculum.getGrade(e.track_id, e.grade_id);
    const track = curriculum.getTrack(e.track_id);
    if (!grade) continue;
    const group = parentOf.get(e.id) || e.id;
    const members = groups.get(group) || [e];
    const catchupOpen = [...parentOf.entries()].some(([, p]) => p === e.id);
    const pace = paces && paces[e.id] ? paces[e.id] : writeAhead.paceFor(e);
    const goalEnrollment = db.byId('enrollments', group) || e;
    const goal = retentionGoal.forEnrollment(userId, goalEnrollment, now);
    const base = {
      enrollmentId: e.id, trackId: e.track_id, gradeId: e.grade_id, group, role: parentOf.has(e.id) ? 'catchup' : 'main', status: e.status,
      title: `${track ? track.name : e.track_id}, ${grade.name}`, graduated: false, goal,
      progress: grade.pathLength ? clamp(((e.current_level || 1) - 1) / grade.pathLength, 0, 1) : 0,
      gapDays: gapDaysOf(userId, new Set(members.map((m) => m.id)), members, now, tz),
      momentum: pace.levelsPerHour > 0 ? 1 : pace.sessions ? 0.5 : 0, blocked: null, placement: null, levels: [], review: null,
    };
    if (e.status === 'placement_pending') {
      subjects.push({ ...base, placement: { estMinutes: PLACEMENT_MINUTES, href: `/placement?enrollment=${e.id}` } });
      continue;
    }
    const built = levelsOf(user, e, grade, pace, session, now);
    const canBase = (() => { try { return baseLessons.canSeeBaseLessons(user); } catch { return false; } })();
    const s = {
      ...base, levels: built.levels, blocked: catchupOpen ? 'catch-up first' : built.blocked,
      hrefOf: (level) => {
        let has = false;
        try { has = canBase && baseLessons.levelsFor(e.track_id, e.grade_id).includes(level); } catch { has = false; }
        return has ? `/base-lesson?track=${encodeURIComponent(e.track_id)}&grade=${encodeURIComponent(e.grade_id)}&level=${level}&enrollment=${e.id}` : `/session?enrollment=${e.id}`;
      },
    };
    if (grade.pathLength && (e.current_level || 1) > grade.pathLength) s.graduated = true;
    if (curriculum.levelKind(e.current_level || 1, grade.pathLength, grade) === 'graduation' && !s.blocked) {
      try {
        const held = lazy('./consolidation').forEnrollment(userId, e, grade, { now });
        if (held && held.active) { s.blocked = 'consolidation: review days before the Final'; s.levels = []; }
      } catch { /* not held */ }
    }
    s.review = reviewOf(userId, e, now, sched);
    subjects.push(s);
  }

  const materials = [];
  try {
    for (const m of lazy('./material-study').dueSummary(userId, now).materials) {
      const goal = retentionGoal.forMaterial(userId, m.material_id, now);
      if (!retentionGoal.reviewsWanted(goal)) continue;
      const items = (m.due_count || 0) + (m.cards_due || 0);
      materials.push({ materialId: m.material_id, title: m.title, items, estMinutes: clamp(Math.round(items * 0.6), 2, 8), goal, risk: 0.5 });
    }
  } catch { /* no courses */ }
  return { minutes, session, subjects, materials, enforcers: sched };
}

/**
 * The plan for today. planFor(userId, { minutes, now }) -> { minutes, blocks: [{ enrollmentId, trackId, kind: review|level|catchup|break,
 * level, estMinutes, why, ... }], study_minutes, break_minutes, minutes_used, ready_share, skipped, session, today }.
 * `minutes` defaults to the learner's remembered choice.
 */
function planFor(userId, { minutes, now = Date.now(), paces = null } = {}) {
  const m = cleanMinutes(minutes) || savedMinutes(userId);
  const input = gather(userId, { now, minutes: m, paces });
  const plan = allocate(input);
  const tz = lazy('./study-sessions').zoneFor(userId);
  return { ...plan, today: lazy('./retention-schedule').localDate(now, tz), presets: PRESETS, saved_minutes: savedMinutes(userId) };
}

module.exports = {
  PRESETS, MIN_MINUTES, MAX_MINUTES, DEFAULT_MINUTES, MAX_GAP_DAYS, LEVEL_DEFAULT_MIN,
  cleanMinutes, savedMinutes, saveMinutes, levelMinutes, goalWeight, dateNeed, studyBudget, withBreaks, allocate, gather, planFor,
};
