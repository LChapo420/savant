/**
 * Simulated learners with planted gaps, run end to end through gap-only paths.
 *
 *   NODE_PATH=../node_modules node scripts/gap-path-sim.js            all subjects, modes, profiles
 *   NODE_PATH=../node_modules node scripts/gap-path-sim.js --quick    a few seeds, for a fast look
 *   ... --subjects=math --modes=quick --profiles=holes --seeds=60 --answer=calibrated --verbose
 *
 * The owner's goal (curriculum-build/GAP-PATHS-SPEC.md): after placement each
 * learner works only on what they don't know. The question this script answers is
 * whether the shipped code does that, for learners whose knowledge is not a clean
 * line: a hole here and there, a gap in the grade below, an island of something
 * learned early.
 *
 * A learner is a true set of known units across a subject's grades. They answer a
 * question right with a small chance of a slip if they know the unit it tests, and
 * otherwise only by guessing among its options. They then sit everything the app
 * would put in front of them, through the app's own code:
 *
 *   1. the subject walk (services/subject-placement.js start / submitBlock /
 *      recommend), which picks the grade;
 *   2. the in-grade unit placement (routes/placement.js /start, /answer, /finish);
 *   3. the quick checks of the units it skipped (/quick-check);
 *   4. the test-outs of units after the start (/test-out, services/learner-path.js);
 *   5. the gap scan of earlier grades (routes/gap-scan.js), accepting every offer;
 *   6. the catch-up quiz after placement (routes/gap-scan.js `catch_up: true`):
 *      every grade below the recommended one, on its own clock, accepting the
 *      whole ordered catch-up (`/decide` with `all: true`). --catch-up=no
 *      leaves it out, for the before/after comparison;
 *
 * and the resulting unit_plan (and the catch-up enrollment's plan) is compared
 * with what the learner really knows.
 *
 * What a learner knows decides their answers; what the app concludes is read back
 * from the app. Keeping the two apart is the point, the same as the simulated
 * testers in scripts/placement-testers.js, whose ideas this reuses: a slip on known
 * material, guessing beyond it, and key verdicts from the judge caches in
 * curriculum-build/placement-judge (a question whose key the judges found wrong is
 * answered at the guessing rate even by a learner who knows it).
 *
 * Time is simulated: the clock the app reads (Date) is moved on by SECS seconds a
 * question, so every deadline in the app binds exactly as it would for a real
 * learner. Nothing touches data/db.json: the run uses a slim copy holding only the
 * placement question sets, read-only, and no model or network call is possible
 * (fetch and http(s) requests throw).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// ── arguments ──────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
function opt(name, fallback) {
  const a = argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : fallback;
}
const QUICK = argv.includes('--quick');
const VERBOSE = argv.includes('--verbose');
const SEEDS = Number(opt('seeds', QUICK ? 6 : 40));
const SECS = Number(opt('secs', 25)); // seconds a question takes, for the clock
const SUBJECTS = opt('subjects', 'math,english,reading').split(',');
const MODE_LIST = opt('modes', 'quick,balanced,accurate').split(',');
const PROFILE_LIST = opt('profiles', 'clean,holes,below,deep,islands,mixed,strong').split(',');
// What a unit question tests: the unit it is filed under ("written": an ideal bank,
// so every error is the logic's own), or where the judges say it really sits
// ("calibrated": a question filed under unit 5 but answerable from unit 3 does not
// catch a hole at 5, which is what the real bank does).
const ANSWER_MODELS = opt('answer', 'written').split(',');
// Whether the learner says roughly which grade they are in before the subject walk
// (the app's start hint). "near" is their true grade, give or take one.
const HINT = opt('hint', 'near');
// Accept every catch-up offer (the learner who wants to close gaps), or decline.
const ACCEPT = opt('accept', 'yes') !== 'no';
// Where the gap scan sits: after the subject walk (before the in-grade placement),
// or at the end.
const SCAN_AT = opt('scan-at', 'after-subject');
// The learner also takes "keep checking <grade below>" after the scan (outside the budget).
const KEEP_CHECKING = argv.includes('--keep-checking');
// The learner takes the catch-up quiz after placement (its own clock, outside the budget).
const CATCH_UP_QUIZ = opt('catch-up', 'yes') !== 'no';
// Child processes to spread the run over (one per answer model, subject and mode).
const CHILD = argv.includes('--child');
const JOBS = Number(opt('jobs', Math.max(1, Math.min(9, os.cpus().length - 1))));

/** Whole-placement budgets in minutes (spec: Quick 20, Accurate 90; Balanced 45 from unit-placement.js). */
const BUDGET = { quick: 20, balanced: 45, accurate: 90 };

/** Targets the run is judged against. */
const TARGETS = {
  falseSkipPct: 1, // truly unknown units marked known, % of units with a status
  missedGapPct: 2, // unknown units before the frontier left off every path, % of units in scope
  budgetExceeded: 0, // learners whose placement ran past the mode's budget
};

// ── a sandbox: the DB copy, the clock, no network ──────────────────────────

/**
 * A slim copy of data/db.json with only the placement question sets (math and
 * reading keep theirs in the database). Made once and reused while data/db.json
 * is unchanged; the run opens it read-only, so it is never written.
 */
function slimDb() {
  const source = path.join(ROOT, 'data', 'db.json');
  const target = path.join(os.tmpdir(), 'gap-path-sim-base.json');
  const stale = !fs.existsSync(target) || fs.statSync(target).mtimeMs < fs.statSync(source).mtimeMs;
  if (stale) {
    const full = JSON.parse(fs.readFileSync(source, 'utf8'));
    fs.writeFileSync(target, JSON.stringify({ placement_question_sets: full.placement_question_sets || [] }));
  }
  return target;
}

process.env.NODE_ENV = 'test';
process.env.DB_FILE = slimDb();
process.env.DB_READONLY = '1';

// The app's clock, moved on by hand. `new Date()` and Date.now() both read it, so
// every deadline the app sets and checks runs on simulated time.
const RealDate = Date;
let clockMs = RealDate.UTC(2026, 9, 22, 12, 0, 0);
class SimDate extends RealDate {
  constructor(...args) {
    if (args.length) super(...args);
    else super(clockMs);
  }

  static now() { return clockMs; }
}
global.Date = SimDate;
function tick(seconds) { clockMs += seconds * 1000; }

// The app stats its content files (banks, calibrations, revisions) on every
// lookup to notice a rewrite; a subject walk does that thousands of times a
// learner. A stat is remembered for a second of real time, so a bank rewritten
// mid-run is still picked up.
const realStat = fs.statSync;
const statCache = new Map();
fs.statSync = function statSyncCached(file, options) {
  const key = String(file);
  if (options || !key.includes(`${path.sep}content${path.sep}`)) return realStat.call(fs, file, options);
  const hit = statCache.get(key);
  const now = RealDate.now();
  if (hit && now - hit.at < 1000) { if (hit.err) throw hit.err; return hit.stat; }
  try {
    const stat = realStat.call(fs, file);
    statCache.set(key, { at: now, stat });
    return stat;
  } catch (err) {
    statCache.set(key, { at: now, err });
    throw err;
  }
};

// No model and no network: anything that tries is a bug in the run.
const blocked = () => { throw new Error('gap-path-sim: network calls are blocked'); };
global.fetch = blocked;
for (const mod of ['http', 'https']) {
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const m = require(mod);
  m.request = blocked;
  m.get = blocked;
}

const db = require('../config/db');
const curriculum = require('../config/curriculum');
const rules = require('../config/subject-placement');
const adaptive = require('../services/adaptive-placement');
const subjectPlacement = require('../services/subject-placement');
const unitPlacement = require('../services/unit-placement');

// Finishing a placement writes the first lesson ahead and the learner's own
// version of it; those are model calls, and nothing here needs them.
const lessons = require('../services/lessons');
const levelEditor = require('../services/level-editor');
const scorecardHooks = require('../services/scorecard/hooks');

lessons.prefetch = () => {};
levelEditor.ensure = async () => null;
levelEditor.prefetchNext = () => {};
scorecardHooks.onPlacement = () => {};

const placementRouter = require('../routes/placement');

/** A/B's files, when they exist (they are being written alongside this script). */
function optional(rel) {
  try {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    return require(rel);
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND' && String(err.message).includes(path.basename(rel))) return null;
    throw err;
  }
}
const learnerPath = optional('../services/learner-path');

const gapScanRouter = optional('../routes/gap-scan');

// ── calling a route in-process ─────────────────────────────────────────────

/** One request through an express router, with the learner signed in. */
function call(router, method, url, body, learner) {
  return new Promise((resolve, reject) => {
    const req = {
      method,
      url,
      originalUrl: url,
      body: body || {},
      query: {},
      params: {},
      headers: {},
      user: learner.user,
      ip: learner.ip,
      socket: { remoteAddress: learner.ip },
      get() { return undefined; },
      header() { return undefined; },
    };
    const res = {
      statusCode: 200,
      headers: {},
      status(code) { this.statusCode = code; return this; },
      set(k, v) { this.headers[k] = v; return this; },
      setHeader(k, v) { this.headers[k] = v; },
      json(payload) { resolve({ status: this.statusCode, body: payload }); return this; },
      send(payload) { resolve({ status: this.statusCode, body: payload }); return this; },
      end() { resolve({ status: this.statusCode, body: null }); return this; },
    };
    router.handle(req, res, (err) => (err ? reject(err) : resolve({ status: 404, body: null })));
  });
}

// ── randomness ─────────────────────────────────────────────────────────────

function hashOf(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

/** mulberry32: small, seeded, good enough for drawing learners and answers. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickDistinct(random, list, count) {
  const pool = list.slice();
  const out = [];
  while (out.length < count && pool.length) out.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  return out;
}

// ── the curriculum as the learner model sees it ────────────────────────────

const judgeCaches = new Map();
function judgeCache(name) {
  if (!judgeCaches.has(name)) {
    let data = {};
    try { data = JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum-build', 'placement-judge', `${name}.json`), 'utf8')); } catch { data = {}; }
    judgeCaches.set(name, data);
  }
  return judgeCaches.get(name);
}

const subjectInfo = new Map();
/** A subject's grades and how many units each has (bank units, or 8 slices without a bank). */
function subjectOf(trackId) {
  if (subjectInfo.has(trackId)) return subjectInfo.get(trackId);
  const gradeIds = rules.gradesFor(trackId);
  const grades = gradeIds.map((id, index) => {
    const units = unitPlacement.unitsFor(trackId, id);
    return { id, index, units, n: units ? units.length : 8 };
  });
  const info = { trackId, gradeIds, grades };
  subjectInfo.set(trackId, info);
  return info;
}

/** A unit's number from its key, in one grade. */
function unitNumberOf(grade, key) {
  const i = (grade.units || []).findIndex((u) => u.key === key);
  return i >= 0 ? i + 1 : null;
}

// ── learners ───────────────────────────────────────────────────────────────

const SLIP = Number(process.env.SIM_SLIP || 0.05);

/**
 * Profiles. Every learner sits at a true frontier (grade T, k units into it) and
 * knows everything before it, except what the profile takes away or adds.
 *   clean    the line itself
 *   holes    1-3 units missing inside grade T before the frontier
 *   below    1-3 units missing in grade T-1
 *   deep     1-3 units missing in grade T-2 (two grades down; T is at least 2)
 *   islands  1-3 units known past the frontier in grade T
 *   mixed    holes, below and islands together
 *   strong   mixed, answering what they do not know with a strong guess
 *            (ruling out options: the guess rate plus 25 points, at most 60%)
 */
const PROFILES = {
  clean: {},
  holes: { holes: true },
  below: { below: true },
  deep: { deep: true },
  islands: { islands: true },
  mixed: { holes: true, below: true, islands: true },
  strong: { holes: true, below: true, islands: true, strong: true },
};

function makeLearner(trackId, profileName, seed) {
  const subject = subjectOf(trackId);
  const profile = PROFILES[profileName];
  const random = rng(hashOf(`${trackId}|${profileName}|${seed}`));
  // A grade with a grade below it, so "below" always has somewhere to go (and
  // two below it for "deep").
  const lowest = profile.deep ? 2 : 1;
  const T = lowest + Math.floor(random() * (subject.grades.length - lowest));
  const nT = subject.grades[T].n;
  const k = Math.max(3, Math.min(nT - 2, Math.round((0.25 + random() * 0.6) * nT)));
  const known = subject.grades.map((g) => {
    const s = new Set();
    if (g.index < T) for (let u = 1; u <= g.n; u++) s.add(u);
    if (g.index === T) for (let u = 1; u <= k; u++) s.add(u);
    return s;
  });
  const planted = { holes: [], below: [], deep: [], islands: [] };
  if (profile.holes) {
    // Not the unit right at the frontier: a hole is something skipped and then built past.
    const candidates = Array.from({ length: k - 1 }, (_, i) => i + 1);
    for (const u of pickDistinct(random, candidates, 1 + Math.floor(random() * 3))) { known[T].delete(u); planted.holes.push(u); }
  }
  if (profile.below) {
    const g = subject.grades[T - 1];
    const candidates = Array.from({ length: g.n }, (_, i) => i + 1);
    for (const u of pickDistinct(random, candidates, 1 + Math.floor(random() * 3))) { known[T - 1].delete(u); planted.below.push(u); }
  }
  if (profile.deep) {
    const g = subject.grades[T - 2];
    const candidates = Array.from({ length: g.n }, (_, i) => i + 1);
    for (const u of pickDistinct(random, candidates, 1 + Math.floor(random() * 3))) { known[T - 2].delete(u); planted.deep.push(u); }
  }
  if (profile.islands) {
    const candidates = [];
    for (let u = k + 2; u <= nT; u++) candidates.push(u);
    for (const u of pickDistinct(random, candidates, 1 + Math.floor(random() * 3))) { known[T].add(u); planted.islands.push(u); }
  }
  return {
    trackId, profileName, seed, T, k, known, planted,
    strong: !!profile.strong,
    knows(gradeIndex, unit) { return !!(known[gradeIndex] && known[gradeIndex].has(unit)); },
    /** Before the true frontier: everything in a grade below T, units 1..k of T. */
    beforeFrontier(gradeIndex, unit) { return gradeIndex < T || (gradeIndex === T && unit <= k); },
  };
}

function guessRate(learner, choices) {
  const base = choices ? 1 / Math.max(2, choices.length) : 0.02;
  return learner.strong ? Math.min(0.6, base + 0.25) : base;
}

/** The chance of a right answer when the question tests (gradeIndex, unit) and the judges gave its key this verdict. */
function chanceRight(learner, gradeIndex, unit, choices, verdict) {
  const guess = guessRate(learner, choices);
  if (!learner.knows(gradeIndex, unit)) return guess;
  const key = verdict ? verdict.key : 'correct';
  if (key === 'wrong' || key === 'flawed') return guess;
  if (key === 'ambiguous') return 0.5;
  return 1 - SLIP;
}

/** The answer text a learner gives: the key when right, the first other option when not. */
function answerText(question, right) {
  if (right) return question.answer;
  const wrong = (question.choices || []).find((c) => String(c).trim().toLowerCase() !== String(question.answer).trim().toLowerCase());
  return wrong === undefined ? `not ${question.answer}` : wrong;
}

/** Which unit a subject question at calibrated position `pos` tests. */
function unitAtPosition(subject, pos) {
  const gi = Math.max(0, Math.min(subject.grades.length - 1, Math.floor(pos)));
  const frac = Math.max(0, Math.min(0.9999, pos - gi));
  return { gradeIndex: gi, unit: Math.min(subject.grades[gi].n, Math.floor(frac * subject.grades[gi].n) + 1) };
}

/** Which unit a unit-bank question tests, under the answer model. */
function unitTested(subject, gradeIndex, unit, question, model) {
  if (model !== 'calibrated' || !Number.isFinite(question.at)) return { gradeIndex, unit };
  if (question.at < 0) {
    // Answerable before the grade starts: it tests the end of the grade below.
    return gradeIndex > 0 ? { gradeIndex: gradeIndex - 1, unit: subject.grades[gradeIndex - 1].n } : { gradeIndex, unit: 1 };
  }
  return { gradeIndex, unit: Math.max(1, Math.min(subject.grades[gradeIndex].n, Math.floor(question.at) + 1)) };
}

/** Answer one unit-bank question (placement, quick check, test-out or gap scan). */
function answerUnitQuestion(ctx, gradeIndex, unit, slot) {
  const { learner, subject, random, model } = ctx;
  const grade = subject.grades[gradeIndex];
  const q = grade.units[unit - 1].questions[slot];
  const tested = unitTested(subject, gradeIndex, unit, q, model);
  const verdict = judgeCache(`${learner.trackId}-units-both`)[adaptive.questionKey(q)];
  if (!verdict) ctx.counts.unjudged++;
  const right = random() < chanceRight(learner, tested.gradeIndex, tested.unit, q.choices, verdict);
  tick(SECS);
  return { right, text: answerText(q, right) };
}

// ── the run of one learner ─────────────────────────────────────────────────

let learnerCount = 0;

/** A fresh user per learner, and a clean slate: each learner's rows are dropped when they finish. */
function freshLearnerRows() {
  for (const name of ['users', 'enrollments', 'sessions', 'items', 'subject_placements', 'skill_states', 'events', 'learner_records', 'scorecards']) {
    try { db.all(name).length = 0; } catch { /* not a collection here */ }
  }
  learnerCount++;
  const user = db.insert('users', { email: `gap-sim-${learnerCount}@example.test`, display_name: 'gap sim', password_hash: 'x', onboarded: true });
  return { user, ip: `10.${(learnerCount >> 16) & 255}.${(learnerCount >> 8) & 255}.${learnerCount & 255}` };
}

/** Stage 1: the subject walk, through the service the route calls. */
async function subjectWalk(ctx, mode) {
  const { learner, subject, random, signedIn } = ctx;
  let hint = null;
  if (HINT === 'near') {
    const off = Math.floor(random() * 3) - 1;
    hint = subject.gradeIds[Math.max(0, Math.min(subject.gradeIds.length - 1, learner.T + off))];
  }
  let p = subjectPlacement.start(signedIn.user.id, learner.trackId, { restart: true, mode, startGradeId: hint });
  let guard = 0;
  while (guard++ < 400) {
    const now = subjectPlacement.currentQuestions(p);
    if (!now || !now.questions.length) break;
    const all = subjectPlacement.questionsFor(learner.trackId, now.grade_id);
    const gi = subject.gradeIds.indexOf(now.grade_id);
    const answers = now.questions.map((shown) => {
      const q = all[shown.index];
      const at = unitAtPosition(subject, adaptive.positionOf(q, gi));
      const verdict = judgeCache(`${learner.trackId}-both`)[adaptive.questionKey(q)];
      const right = random() < chanceRight(learner, at.gradeIndex, at.unit, q.choices, verdict);
      tick(SECS);
      ctx.counts.subject++;
      if (!right) ctx.subjectMisses.push(at);
      return { index: shown.index, answer: answerText(q, right) };
    });
    const out = subjectPlacement.submitBlock(signedIn.user.id, learner.trackId, answers);
    if (out.error) throw new Error(`subject walk: ${out.error}`);
    p = out.placement;
    if (out.stopped) break;
  }
  const done = await subjectPlacement.recommend(signedIn.user.id, learner.trackId);
  return { placement: done, gradeIndex: subject.gradeIds.indexOf(done.recommended_grade_id) };
}

function enroll(ctx, gradeIndex) {
  const { learner, subject, signedIn } = ctx;
  const grade = curriculum.getGrade(learner.trackId, subject.gradeIds[gradeIndex]);
  return db.insert('enrollments', {
    user_id: signedIn.user.id,
    track_id: learner.trackId,
    grade_id: subject.gradeIds[gradeIndex],
    target_level: grade.pathLength,
    current_level: 1,
    level_items: 0,
    levels_completed: 0,
    xp: 0,
    status: 'placement_pending',
    pending_checkpoint: null,
    placed_at: null,
  });
}

/** Stage 2: the in-grade unit placement, through routes/placement.js. */
async function unitWalk(ctx, enrollment, gradeIndex, mode) {
  const started = await call(placementRouter, 'POST', '/start', { enrollment_id: enrollment.id, mode }, ctx.signedIn);
  if (started.status >= 400) throw new Error(`placement start: ${JSON.stringify(started.body)}`);
  const sessionId = started.body.session_id;
  let item = started.body.items[0];
  let guard = 0;
  while (item && guard++ < 200) {
    const row = db.byId('items', item.id);
    const a = answerUnitQuestion(ctx, gradeIndex, row.unit, row.slot);
    ctx.counts.unit++;
    const res = await call(placementRouter, 'POST', '/answer', { session_id: sessionId, item_id: row.id, answer: a.text, ms: SECS * 1000 }, ctx.signedIn);
    if (res.status >= 400) throw new Error(`placement answer: ${JSON.stringify(res.body)}`);
    item = res.body.next_item || null;
  }
  const fin = await call(placementRouter, 'POST', '/finish', { session_id: sessionId }, ctx.signedIn);
  if (fin.status >= 400) throw new Error(`placement finish: ${JSON.stringify(fin.body)}`);
  // Is the route writing the unit plan yet? If not (A's routes still being
  // wired), the plan is written here exactly as the spec says the route will:
  // learnerPath.initFromPlacement with the score and the answers.
  const fresh = db.byId('enrollments', enrollment.id);
  const plan = learnerPath ? learnerPath.planFor(fresh) : null;
  ctx.wired = !!(plan && plan.placed_unit);
  if (learnerPath && !ctx.wired) {
    ctx.notes.add('routes/placement.js /finish does not write unit_plan yet: learner-path services called directly');
    const answered = db.find('items', (i) => i.session_id === sessionId && i.correct !== null)
      .map((i) => ({ unit: i.unit, slot: i.slot, correct: !!i.correct }));
    learnerPath.initFromPlacement(fresh, fin.body.result, answered);
  }
  return fin.body.result;
}

/** The bank slots of a unit not yet asked on the plan, in bank order (learner-path's own rule). */
function unaskedSlots(gradeUnits, n, entry) {
  const used = new Set(((entry && entry.asked) || []).map((a) => a.slot));
  return gradeUnits[n - 1].questions.map((_, s) => s).filter((s) => !used.has(s));
}

/** Stage 3 without the route: every unseen unit before the placed one, checked through recordCheck. */
function quickChecksDirect(ctx, enrollment, gradeIndex) {
  const units = ctx.subject.grades[gradeIndex].units;
  let guard = 0;
  for (;;) {
    const plan = learnerPath.planFor(db.byId('enrollments', enrollment.id));
    let pick = null;
    for (let n = 1; n < (plan.placed_unit || 0) && !pick; n++) {
      const entry = plan.units[units[n - 1].key];
      if (!entry || entry.status !== 'unseen') continue;
      const slots = unaskedSlots(units, n, entry);
      if (slots.length) pick = { unit: n, slot: slots[0] };
    }
    if (!pick || guard++ > 300) break;
    const a = answerUnitQuestion(ctx, gradeIndex, pick.unit, pick.slot);
    ctx.counts.quickCheck++;
    learnerPath.recordCheck(db.byId('enrollments', enrollment.id), pick.unit, a.right, { slot: pick.slot });
  }
}

/** Stage 4 without the route: learnerPath.nextTestOut / recordCheck. */
function testOutsDirect(ctx, enrollment, gradeIndex) {
  let guard = 0;
  for (;;) {
    const q = learnerPath.nextTestOut(db.byId('enrollments', enrollment.id));
    if (!q || guard++ > 300) break;
    const a = answerUnitQuestion(ctx, gradeIndex, q.unit, q.slot);
    ctx.counts.testOut++;
    learnerPath.recordCheck(db.byId('enrollments', enrollment.id), q.unit, a.right, { slot: q.slot });
  }
}

/** Stage 3: the quick checks. */
async function quickChecks(ctx, enrollment, gradeIndex) {
  if (learnerPath && !ctx.wired) { quickChecksDirect(ctx, enrollment, gradeIndex); return; }
  let res = await call(placementRouter, 'GET', `/quick-check/${enrollment.id}`, {}, ctx.signedIn);
  let guard = 0;
  while (res.body && res.body.question && guard++ < 200) {
    const q = res.body.question;
    const a = answerUnitQuestion(ctx, gradeIndex, q.unit, q.slot);
    ctx.counts.quickCheck++;
    res = await call(placementRouter, 'POST', '/quick-check', { enrollment_id: enrollment.id, unit: q.unit, slot: q.slot, answer: a.text }, ctx.signedIn);
    if (res.status >= 400) throw new Error(`quick check: ${JSON.stringify(res.body)}`);
  }
}

/** Stage 4: the test-outs (A's /test-out routes). Their reply shape is read loosely. */
async function testOuts(ctx, enrollment, gradeIndex) {
  if (!learnerPath) return;
  if (!ctx.wired) { testOutsDirect(ctx, enrollment, gradeIndex); return; }
  let res = await call(placementRouter, 'GET', `/test-out/${enrollment.id}`, {}, ctx.signedIn);
  if (res.status === 404 && !res.body) {
    ctx.notes.add('no GET /test-out route: learner-path test-out called directly');
    testOutsDirect(ctx, enrollment, gradeIndex);
    return;
  }
  let guard = 0;
  for (;;) {
    const q = res.body && (res.body.question || (res.body.unit && Number.isInteger(res.body.slot) ? res.body : null));
    if (!q || res.body.done === true || guard++ > 200) break;
    const a = answerUnitQuestion(ctx, gradeIndex, q.unit, q.slot);
    ctx.counts.testOut++;
    res = await call(placementRouter, 'POST', '/test-out', { enrollment_id: enrollment.id, unit: q.unit, slot: q.slot, answer: a.text }, ctx.signedIn);
    if (res.status >= 400) throw new Error(`test-out: ${JSON.stringify(res.body)}`);
  }
}

/** Stage 5: the gap scan (B's routes), accepting (or declining) every offer. */
async function gapScanStage(ctx, enrollment, subjectRun, mode) {
  if (!gapScanRouter) return { gaps: [] };
  const { learner, subject } = ctx;
  let res = await call(gapScanRouter, 'POST', '/start', {
    track_id: learner.trackId,
    mode,
    recommended_grade_id: subject.gradeIds[subjectRun.gradeIndex],
    subject_session_id: subjectRun.placement.id,
    enrollment_id: enrollment.id,
  }, ctx.signedIn);
  if (res.status >= 400) throw new Error(`gap scan start: ${JSON.stringify(res.body)}`);
  let guard = 0;
  while (res.body && !res.body.done && guard++ < 300) {
    const q = res.body.question;
    if (!q) break;
    const gi = subject.gradeIds.indexOf(q.grade_id);
    const a = answerUnitQuestion(ctx, gi, q.unit, q.slot);
    ctx.counts.scan++;
    ctx.scanned.add(`${gi}:${q.unit}`);
    res = await call(gapScanRouter, 'POST', '/answer', {
      scan_id: res.body.scan_id,
      session_id: res.body.session_id,
      track_id: learner.trackId,
      grade_id: q.grade_id,
      unit: q.unit,
      slot: q.slot,
      answer: a.text,
    }, ctx.signedIn);
    if (res.status >= 400) throw new Error(`gap scan answer: ${JSON.stringify(res.body)}`);
  }
  let gaps = (res.body && res.body.gaps) || [];
  // "Keep checking <grade below>": the same walk outside the placement budget,
  // for the learner who asks for it on the offer screen (--keep-checking).
  if (KEEP_CHECKING && subjectRun.gradeIndex >= 1) {
    const below = subject.gradeIds[subjectRun.gradeIndex - 1];
    let ext = await call(gapScanRouter, 'POST', '/start', { track_id: learner.trackId, extended: true, grade_id: below }, ctx.signedIn);
    let guard2 = 0;
    while (ext.status < 400 && ext.body && !ext.body.done && ext.body.question && guard2++ < 300) {
      const q = ext.body.question;
      const gi = subject.gradeIds.indexOf(q.grade_id);
      const a = answerUnitQuestion(ctx, gi, q.unit, q.slot);
      ctx.counts.keep++;
      ctx.scanned.add(`${gi}:${q.unit}`);
      ext = await call(gapScanRouter, 'POST', '/answer', {
        extended: true, track_id: learner.trackId, grade_id: q.grade_id, unit: q.unit, slot: q.slot, answer: a.text,
      }, ctx.signedIn);
    }
    if (ext.status >= 400 && ext.status !== 409) ctx.notes.add(`keep checking: ${JSON.stringify(ext.body).slice(0, 120)}`);
    if (ext.body && Array.isArray(ext.body.gaps)) gaps = ext.body.gaps;
  }
  for (const g of gaps) {
    const d = await call(gapScanRouter, 'POST', '/decide', { enrollment_id: enrollment.id, grade_id: g.grade_id, accept: ACCEPT }, ctx.signedIn);
    if (d.status >= 400) throw new Error(`gap scan decide: ${JSON.stringify(d.body)}`);
  }
  return { gaps };
}

/** The catch-up quiz's own clock, minutes by mode (services/gap-scan.js CATCH_UP). */
const CATCH_UP_MINUTES = { quick: 10, balanced: 20, accurate: 40 };

/**
 * Stage 6: the catch-up quiz after placement (the learner who starts at the
 * recommended grade and wants everything before it caught up), then the whole
 * ordered catch-up taken (or turned down) at once.
 */
async function catchUpStage(ctx, enrollment, subjectRun, mode) {
  if (!gapScanRouter || !CATCH_UP_QUIZ || subjectRun.gradeIndex < 1) return { route: null };
  const { learner, subject } = ctx;
  let res = await call(gapScanRouter, 'POST', '/start', {
    track_id: learner.trackId, catch_up: true, mode, recommended_grade_id: subject.gradeIds[subjectRun.gradeIndex],
  }, ctx.signedIn);
  if (res.status >= 400) throw new Error(`catch-up start: ${JSON.stringify(res.body)}`);
  if (res.body.kind !== 'catch_up') throw new Error(`catch-up start answered kind ${res.body.kind}`);
  let guard = 0;
  while (res.body && !res.body.done && guard++ < 400) {
    const q = res.body.question;
    if (!q) break;
    const gi = subject.gradeIds.indexOf(q.grade_id);
    const a = answerUnitQuestion(ctx, gi, q.unit, q.slot);
    ctx.counts.catchUp++;
    ctx.scanned.add(`${gi}:${q.unit}`);
    res = await call(gapScanRouter, 'POST', '/answer', {
      track_id: learner.trackId, grade_id: q.grade_id, unit: q.unit, slot: q.slot, answer: a.text,
    }, ctx.signedIn);
    if (res.status >= 400) throw new Error(`catch-up answer: ${JSON.stringify(res.body)}`);
  }
  const d = await call(gapScanRouter, 'POST', '/decide', { enrollment_id: enrollment.id, all: true, accept: ACCEPT }, ctx.signedIn);
  if (d.status >= 400) throw new Error(`catch-up decide: ${JSON.stringify(d.body)}`);
  const route = d.body.route;
  // The route is one plan, lowest grade first.
  const order = (route && route.steps ? route.steps : []).map((st) => subject.gradeIds.indexOf(st.grade_id));
  if (order.some((x, i) => i && x < order[i - 1])) ctx.notes.add('catch-up route out of grade order');
  return { route };
}

// ── reading back what the app concluded ────────────────────────────────────

/**
 * The plan for an enrollment. With A's learner-path, its unit_plan. Without it,
 * what today's code does, for a baseline: units wholly before current_level are
 * skipped (known), everything from it on is worked.
 */
function statusesOf(enrollment, grade) {
  const fresh = db.byId('enrollments', enrollment.id);
  const plan = learnerPath ? learnerPath.planFor(fresh) : null;
  const out = new Map();
  if (plan && plan.units) {
    grade.units.forEach((u, i) => {
      const row = plan.units[u.key];
      out.set(i + 1, row ? { status: row.status, source: row.source } : { status: 'missing', source: null });
    });
    return { statuses: out, plan, legacy: false };
  }
  grade.units.forEach((u, i) => {
    out.set(i + 1, { status: u.end < fresh.current_level ? 'known' : (u.start <= fresh.current_level ? 'learn' : 'unseen'), source: 'legacy' });
  });
  return { statuses: out, plan: null, legacy: true };
}

/** Walk the path rule from where the learner stands; return the units it visits. */
function pathUnits(enrollment, grade, gradeRow) {
  if (!learnerPath) return null;
  const fresh = db.byId('enrollments', enrollment.id);
  const units = new Set();
  let level = learnerPath.firstLevel(fresh, gradeRow);
  // The path can go back (units to learn first, then unproved ones behind the
  // learner), and marks units done as they are finished, so the walk finishes
  // each level as the learner would and stops only on a level it has already
  // stood on. The plan is put back afterwards: the walk is a look ahead.
  const seenLevels = new Set([level]);
  const savedPlan = JSON.parse(JSON.stringify(fresh.unit_plan || null));
  let guard = 0;
  while (Number.isFinite(level) && level >= 1 && level <= gradeRow.pathLength && guard++ < 5000) {
    const i = grade.units.findIndex((u) => u.start <= level && level <= u.end);
    if (i >= 0) units.add(i + 1);
    const next = learnerPath.nextLevelAfter(db.byId('enrollments', enrollment.id), gradeRow, level);
    learnerPath.finishLevel(db.byId('enrollments', enrollment.id), level);
    if (!Number.isFinite(next) || next === level || seenLevels.has(next)) break;
    seenLevels.add(next);
    level = next;
  }
  db.update('enrollments', enrollment.id, { unit_plan: savedPlan });
  return units;
}

// ── one learner, end to end ────────────────────────────────────────────────

async function runLearner(trackId, mode, profileName, seed, model) {
  const subject = subjectOf(trackId);
  const learner = makeLearner(trackId, profileName, seed);
  const ctx = {
    learner,
    subject,
    model,
    random: rng(hashOf(`${trackId}|${mode}|${profileName}|${seed}|${model}|answers`)),
    signedIn: freshLearnerRows(),
    counts: { subject: 0, unit: 0, quickCheck: 0, testOut: 0, scan: 0, keep: 0, catchUp: 0, unjudged: 0 },
    subjectMisses: [],
    scanned: new Set(),
    notes: new Set(),
  };
  const t0 = clockMs;
  const subjectRun = await subjectWalk(ctx, mode);
  const G = subjectRun.gradeIndex;
  const enrollment = enroll(ctx, G);
  let scan = { gaps: [] };
  if (SCAN_AT === 'after-subject') scan = await gapScanStage(ctx, enrollment, subjectRun, mode);
  const placed = await unitWalk(ctx, enrollment, G, mode);
  await quickChecks(ctx, enrollment, G);
  await testOuts(ctx, enrollment, G);
  if (SCAN_AT !== 'after-subject') scan = await gapScanStage(ctx, enrollment, subjectRun, mode);
  const cuT0 = clockMs;
  await catchUpStage(ctx, enrollment, subjectRun, mode);
  const catchUpMinutes = (clockMs - cuT0) / 60000;
  const minutesAll = (cuT0 - t0) / 60000;
  // The mode budget covers the whole placement including quick checks (spec v2);
  // test-outs are outside it by design and are counted apart.
  const c = ctx.counts;
  const placementMinutes = ((c.subject + c.unit + c.quickCheck + c.scan) * SECS) / 60;

  // What the app concluded, beside what is true.
  const out = {
    trackId, mode, profileName, seed, model, T: learner.T, k: learner.k, G,
    placedUnit: placed && placed.unit,
    counts: ctx.counts,
    minutesAll,
    placementMinutes,
    catchUpMinutes,
    unitsJudged: 0,
    falseSkips: [], // {grade, unit, source}
    catchUpAssumedFalse: 0, // unknown units marked known in a catch-up plan without being scanned
    wasted: 0,
    knownInScope: 0,
    cuWasted: 0, // known units a catch-up enrollment still has the learner work (learn or unchecked)
    cuKnown: 0,
    unchecked: 0, // units left unchecked in the placed grade
    cuUnchecked: 0,
    cuUnits: 0,
    gapsInScope: 0, // unknown units before the frontier in grades G and G-1
    missedGaps: [], // of those, left off every path
    unitsInScope: 0,
    belowPlanted: 0,
    belowFound: 0,
    deepPlanted: 0,
    deepFound: 0,
    pathMismatch: 0,
    mismatches: [],
    wasteBy: {},
    legacy: false,
    notes: ctx.notes,
  };

  const gradeRow = curriculum.getGrade(trackId, subject.gradeIds[G]);
  const main = statusesOf(enrollment, subject.grades[G]);
  out.legacy = main.legacy;
  const nG = subject.grades[G].n;
  out.unitsInScope += nG;
  // What the learner will actually work: the path rule walked from where it
  // stands them. Without learner-path, everything from current_level on.
  const visited = pathUnits(enrollment, subject.grades[G], gradeRow);
  for (let u = 1; u <= nG; u++) {
    const s = main.statuses.get(u);
    const skipped = visited ? !visited.has(u) : s.status === 'known';
    const knows = learner.knows(G, u);
    out.unitsJudged++;
    if (s.status === 'unchecked') out.unchecked++;
    if (skipped && !knows) out.falseSkips.push({ grade: G, unit: u, source: s.status === 'known' ? s.source : `stepped over ${s.status}` });
    if (knows) {
      out.knownInScope++;
      if (!skipped) {
        out.wasted++;
        // Where the waste sits: its status, and before (<), at (=) or after (>) the placed unit.
        const where = u < out.placedUnit ? '<' : u === out.placedUnit ? '=' : '>';
        const key = `${s.status}${where}`;
        out.wasteBy[key] = (out.wasteBy[key] || 0) + 1;
      }
    }
    if (!knows && learner.beforeFrontier(G, u)) {
      out.gapsInScope++;
      if (skipped) out.missedGaps.push({ grade: G, unit: u });
    }
    // The path and the statuses must agree: known units stepped over, the rest
    // worked (except units before the placed one the path rule steps over).
    if (visited && ((s.status === 'known') === visited.has(u))) {
      out.pathMismatch++;
      out.mismatches.push(`u${u}:${s.status}/${visited.has(u) ? 'on path' : 'stepped over'}`);
    }
  }

  // Earlier grades: the catch-up plans (accepted), and every grade below G.
  const catchUp = (main.plan && main.plan.catch_up) || [];
  const queuedBelow = new Map(); // grade index -> Set of units confirmed as gaps (learn)
  const workedBelow = new Map(); // grade index -> Set of units the catch-up path works (not known or done)
  const knownBelow = new Map();
  for (const c of catchUp) {
    const gi = subject.gradeIds.indexOf(c.grade_id);
    if (gi < 0) continue;
    const g = subject.grades[gi];
    if (!queuedBelow.has(gi)) queuedBelow.set(gi, new Set());
    if (!workedBelow.has(gi)) workedBelow.set(gi, new Set());
    if (c.status === 'accepted' || c.status === 'done') {
      for (const key of c.unit_keys || []) { const u = unitNumberOf(g, key); if (u) queuedBelow.get(gi).add(u); }
    }
    if (c.enrollment_id) {
      const ce = db.byId('enrollments', c.enrollment_id);
      const plan = ce && learnerPath ? learnerPath.planFor(ce) : null;
      if (plan && plan.units) {
        g.units.forEach((unit, i) => {
          const row = plan.units[unit.key];
          if (!row) return;
          out.unitsJudged++;
          out.cuUnits++;
          const knows = learner.knows(gi, i + 1);
          const worked = row.status !== 'known' && row.status !== 'done';
          if (row.status === 'learn') queuedBelow.get(gi).add(i + 1);
          if (worked) workedBelow.get(gi).add(i + 1);
          if (row.status === 'unchecked') out.cuUnchecked++;
          if (knows) { out.cuKnown++; if (worked) out.cuWasted++; }
          if (row.status === 'known' && !knows) {
            if (ctx.scanned.has(`${gi}:${i + 1}`)) out.falseSkips.push({ grade: gi, unit: i + 1, source: row.source || 'gap_scan' });
            else { out.catchUpAssumedFalse++; out.falseSkips.push({ grade: gi, unit: i + 1, source: 'catch-up, never scanned' }); }
          }
          if (row.status === 'known') { if (!knownBelow.has(gi)) knownBelow.set(gi, new Set()); knownBelow.get(gi).add(i + 1); }
        });
      }
    }
  }
  for (let gi = 0; gi < G; gi++) {
    const g = subject.grades[gi];
    for (let u = 1; u <= g.n; u++) {
      if (learner.knows(gi, u) || !learner.beforeFrontier(gi, u)) continue;
      const found = !!(queuedBelow.get(gi) && queuedBelow.get(gi).has(u));
      const worked = !!(workedBelow.get(gi) && workedBelow.get(gi).has(u));
      if (gi === G - 1) {
        out.belowPlanted++;
        if (found) out.belowFound++;
        out.gapsInScope++;
        if (!worked) out.missedGaps.push({ grade: gi, unit: u });
      } else {
        out.deepPlanted++;
        if (found) out.deepFound++;
      }
    }
  }
  if (G >= 1) out.unitsInScope += subject.grades[G - 1].n;
  out.scanGaps = scan.gaps.length;
  return out;
}

// ── aggregation and the table ──────────────────────────────────────────────

function emptyCell() {
  return {
    n: 0, exact: 0, within1: 0, unitsJudged: 0, falseSkips: 0, learnersFS: 0, fsBySource: {}, catchUpAssumedFalse: 0,
    wasted: 0, knownInScope: 0, gapsInScope: 0, missed: 0, unitsInScope: 0,
    cuWasted: 0, cuKnown: 0, unchecked: 0, mainUnits: 0, cuUnchecked: 0, cuUnits: 0,
    belowPlanted: 0, belowFound: 0, deepPlanted: 0, deepFound: 0,
    q: { subject: 0, unit: 0, quickCheck: 0, testOut: 0, scan: 0, keep: 0, catchUp: 0 }, minAll: 0, maxAll: 0, minPlace: 0, maxPlace: 0,
    over: 0, overAll: 0, cuOver: 0, pathMismatch: 0, unjudged: 0, legacy: 0, wasteBy: {},
  };
}

function add(cell, r) {
  cell.n++;
  if (r.G === r.T) cell.exact++;
  if (Math.abs(r.G - r.T) <= 1) cell.within1++;
  cell.unitsJudged += r.unitsJudged;
  cell.falseSkips += r.falseSkips.length;
  if (r.falseSkips.length) cell.learnersFS++;
  for (const f of r.falseSkips) cell.fsBySource[f.source] = (cell.fsBySource[f.source] || 0) + 1;
  cell.catchUpAssumedFalse += r.catchUpAssumedFalse;
  cell.wasted += r.wasted;
  cell.knownInScope += r.knownInScope;
  cell.cuWasted += r.cuWasted;
  cell.cuKnown += r.cuKnown;
  cell.unchecked += r.unchecked;
  cell.mainUnits += r.unitsJudged - r.cuUnits;
  cell.cuUnchecked += r.cuUnchecked;
  cell.cuUnits += r.cuUnits;
  cell.gapsInScope += r.gapsInScope;
  cell.missed += r.missedGaps.length;
  cell.unitsInScope += r.unitsInScope;
  cell.belowPlanted += r.belowPlanted;
  cell.belowFound += r.belowFound;
  cell.deepPlanted += r.deepPlanted;
  cell.deepFound += r.deepFound;
  for (const k of Object.keys(cell.q)) cell.q[k] += r.counts[k];
  cell.minAll += r.minutesAll;
  cell.maxAll = Math.max(cell.maxAll, r.minutesAll);
  cell.minPlace += r.placementMinutes;
  cell.maxPlace = Math.max(cell.maxPlace, r.placementMinutes);
  if (r.placementMinutes > BUDGET[r.mode] + 1e-9) cell.over++;
  if (r.minutesAll > BUDGET[r.mode] + 1e-9) cell.overAll++;
  if ((r.catchUpMinutes || 0) > CATCH_UP_MINUTES[r.mode] + 1e-9) cell.cuOver++;
  cell.pathMismatch += r.pathMismatch;
  for (const [k, v] of Object.entries(r.wasteBy || {})) cell.wasteBy[k] = (cell.wasteBy[k] || 0) + v;
  cell.unjudged += r.counts.unjudged;
  if (r.legacy) cell.legacy++;
}

const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}` : '-');
const avg = (a, n) => (n ? (a / n).toFixed(1) : '-');

function row(label, c, mode) {
  const qTotal = Object.values(c.q).reduce((s, x) => s + x, 0);
  return [
    label.padEnd(26),
    String(c.n).padStart(4),
    `${pct(c.exact, c.n)}/${pct(c.within1, c.n)}`.padStart(11),
    `${pct(c.falseSkips, c.unitsJudged)}%`.padStart(7),
    `${pct(c.learnersFS, c.n)}%`.padStart(7),
    `${pct(c.missed, c.unitsInScope)}%`.padStart(7),
    `${c.belowPlanted ? pct(c.belowFound, c.belowPlanted) : '-'}`.padStart(6),
    `${c.deepPlanted ? pct(c.deepFound, c.deepPlanted) : '-'}`.padStart(6),
    `${pct(c.wasted, c.knownInScope)}%`.padStart(7),
    `${pct(c.unchecked, c.mainUnits)}%`.padStart(6),
    `${pct(c.cuWasted, c.cuKnown)}/${pct(c.cuUnchecked, c.cuUnits)}`.padStart(11),
    `${avg(c.q.subject, c.n)}+${avg(c.q.unit, c.n)}+${avg(c.q.quickCheck, c.n)}+${avg(c.q.scan, c.n)} | ${avg(c.q.testOut, c.n)}+${avg(c.q.keep, c.n)}+${avg(c.q.catchUp, c.n)}`.padStart(35),
    `${avg(qTotal, c.n)}`.padStart(6),
    `${avg(c.minPlace, c.n)}/${c.maxPlace.toFixed(1)}`.padStart(10),
    `${avg(c.minAll, c.n)}/${c.maxAll.toFixed(1)}`.padStart(10),
    `${mode ? BUDGET[mode] : '-'}`.padStart(4),
    `${c.over}/${c.overAll}/${c.cuOver}`.padStart(8),
  ].join(' ');
}

const HEADER = [
  'subject/mode/profile'.padEnd(26), '   n', 'grade ex/±1', '  FS%u', ' FSlrn', ' miss%', 'G-1rc', 'G-2rc', ' waste', ' unchk', ' cuWst/unck',
  'Qs subj+unit+qc+scan | to+keep+cu'.padStart(35), '  Qtot', ' minPl a/mx', 'minAll a/mx', ' bud', '    over',
].join(' ');

const LEGEND = [
  'grade ex/±1  % of learners placed in their true grade / within one grade',
  'FS%u         FALSE SKIPS: truly unknown units marked known, % of units given a status (main + catch-up plans)',
  'FSlrn        % of learners with at least one false skip',
  'miss%        MISSED GAPS: unknown units before the true frontier in grades G and G-1 left off every path, % of units in G and G-1',
  'G-1rc        unknown units in the grade below confirmed as gaps (learn) by the catch-up, %',
  'G-2rc        unknown units two or more grades below confirmed as gaps (learn) by the catch-up, % (deep profile: planted two grades down)',
  'waste        WASTED: known units the path of the placed grade still has the learner work, % of known units in that grade',
  'unchk        units left unchecked (worked, test-out any time) in the placed grade, % of its units',
  'cuWst/unck   catch-up enrollments: known units still worked, % of known units there / units left unchecked, % of units there',
  'Qs           average questions inside the budget (subject walk + unit placement + quick checks + gap scan) | outside it (test-outs + keep checking + catch-up quiz)',
  'minPl        minutes of placement (subject + unit + gap scan + quick checks) avg/max; minAll adds test-outs (outside the budget by design)',
  'over         learners past the mode budget: placement / with test-outs (only the first is a target) / catch-up quizzes past their own clock (target 0)',
].join('\n');

/** Every learner of the run, one after another in this process. */
async function runHere() {
  const all = [];
  const errors = [];
  for (const model of ANSWER_MODELS) {
    for (const trackId of SUBJECTS) {
      for (const mode of MODE_LIST) {
        for (const profileName of PROFILE_LIST) {
          for (let s = 1; s <= SEEDS; s++) {
            try {
              // eslint-disable-next-line no-await-in-loop
              all.push(await runLearner(trackId, mode, profileName, s, model));
            } catch (err) {
              errors.push(`${model} ${trackId} ${mode} ${profileName} #${s}: ${err.stack.split('\n').slice(0, 3).join(' | ')}`);
            }
          }
        }
      }
    }
  }
  return { all, errors };
}

/**
 * The same run split across child processes, one per answer model, subject and
 * mode (a Math walk re-reads all 49 grades' questions after every answer, so one
 * process is slow). Each child is this script with --child, printing its rows.
 */
async function runInChildren() {
  // eslint-disable-next-line global-require
  const { spawn } = require('child_process');
  const jobs = [];
  for (const model of ANSWER_MODELS) for (const trackId of SUBJECTS) for (const mode of MODE_LIST) jobs.push({ model, trackId, mode });
  const keep = argv.filter((a) => !/^--(subjects|modes|answer|jobs)=/.test(a) && a !== '--verbose');
  const all = [];
  const errors = [];
  let next = 0;
  async function worker() {
    while (next < jobs.length) {
      const job = jobs[next++];
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => {
        const args = [__filename, ...keep, '--child', `--subjects=${job.trackId}`, `--modes=${job.mode}`, `--answer=${job.model}`];
        const child = spawn(process.execPath, args, { env: process.env });
        let buf = '';
        let errText = '';
        child.stdout.on('data', (d) => { buf += d; });
        child.stderr.on('data', (d) => { errText += d; });
        child.on('close', (code) => {
          for (const line of buf.split('\n')) {
            if (line.startsWith('RESULT ')) all.push(JSON.parse(line.slice(7)));
            else if (line.startsWith('ERROR ')) errors.push(line.slice(6));
          }
          if (code) errors.push(`child ${job.model} ${job.trackId}/${job.mode} exited ${code}: ${errText.slice(0, 400)}`);
          resolve();
        });
      });
    }
  }
  await Promise.all(Array.from({ length: Math.min(JOBS, jobs.length) }, worker));
  return { all, errors };
}

async function main() {
  const t0 = RealDate.now();
  if (!CHILD) {
    console.log(`gap-path-sim: learner-path ${learnerPath ? 'present' : 'MISSING (baseline: today\'s linear path)'}, gap-scan ${gapScanRouter ? 'present' : 'MISSING (no catch-up)'}`);
    console.log(`seeds ${SEEDS}, ${SECS}s a question, hint ${HINT}, accept ${ACCEPT ? 'yes' : 'no'}, scan ${SCAN_AT}${KEEP_CHECKING ? ' + keep checking' : ''}, catch-up quiz ${CATCH_UP_QUIZ ? 'yes' : 'no'}, slip ${SLIP}, jobs ${JOBS}, answer model ${ANSWER_MODELS.join('+')}`);
  }
  const { all, errors } = JOBS > 1 && !CHILD ? await runInChildren() : await runHere();
  if (CHILD) {
    for (const r of all) process.stdout.write(`RESULT ${JSON.stringify({ ...r, notes: [...r.notes] })}\n`);
    for (const e of errors) process.stdout.write(`ERROR ${e.replace(/\n/g, ' ')}\n`);
    return;
  }

  const verdicts = [];
  for (const model of ANSWER_MODELS) {
    console.log(`\n=== answer model: ${model} ===`);
    console.log(HEADER);
    for (const trackId of SUBJECTS) {
      for (const mode of MODE_LIST) {
        const total = emptyCell();
        for (const profileName of PROFILE_LIST) {
          const cell = emptyCell();
          for (const r of all.filter((x) => x.model === model && x.trackId === trackId && x.mode === mode && x.profileName === profileName)) { add(cell, r); add(total, r); }
          console.log(row(`${trackId}/${mode}/${profileName}`, cell, mode));
        }
        console.log(row(`${trackId}/${mode} ALL`, total, mode));
        const fs1 = total.unitsJudged ? (100 * total.falseSkips) / total.unitsJudged : 0;
        const mg = total.unitsInScope ? (100 * total.missed) / total.unitsInScope : 0;
        verdicts.push({ label: `${model} ${trackId}/${mode}`, fs: fs1, mg, over: total.over, overAll: total.overAll, cuOver: total.cuOver, cell: total });
        console.log('');
      }
    }
    const grand = emptyCell();
    for (const r of all.filter((x) => x.model === model)) add(grand, r);
    console.log(row('ALL', grand, null));
    const src = Object.entries(grand.fsBySource).map(([k, v]) => `${k} ${v}`).join(', ');
    console.log(`false skips by source: ${src || 'none'}; catch-up units marked known without a scan that were unknown: ${grand.catchUpAssumedFalse}`);
    console.log(`wasted units by status and place (< before, = at, > after the placed unit): ${Object.entries(grand.wasteBy).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')} of ${grand.wasted}`);
    console.log(`catch-up recall: grade below ${grand.belowFound}/${grand.belowPlanted} (${pct(grand.belowFound, grand.belowPlanted)}%), two or more grades below ${grand.deepFound}/${grand.deepPlanted} (${pct(grand.deepFound, grand.deepPlanted)}%)`);
    console.log(`deeper-grade gaps (G-2 and below) queued: ${grand.deepFound}/${grand.deepPlanted}; path-rule mismatches: ${grand.pathMismatch}; unit questions without a judge verdict: ${grand.unjudged}`);
  }

  console.log(`\n${LEGEND}`);
  console.log(`\nTARGETS: false skips <= ${TARGETS.falseSkipPct}% of units, missed gaps <= ${TARGETS.missedGapPct}% of units in G and G-1, placement (with quick checks) never past the mode budget`);
  let failed = 0;
  for (const v of verdicts) {
    const okFs = v.fs <= TARGETS.falseSkipPct;
    const okMg = v.mg <= TARGETS.missedGapPct;
    const okB = v.over <= TARGETS.budgetExceeded && v.cuOver <= TARGETS.budgetExceeded;
    if (!(okFs && okMg && okB)) failed++;
    console.log(`  ${okFs && okMg && okB ? 'PASS' : 'FAIL'} ${v.label.padEnd(28)} false skips ${v.fs.toFixed(2)}% ${okFs ? 'ok' : 'FAIL'}; missed gaps ${v.mg.toFixed(2)}% ${okMg ? 'ok' : 'FAIL'}; over budget ${v.over} ${okB ? 'ok' : 'FAIL'} (with test-outs: ${v.overAll}; catch-up past its clock: ${v.cuOver}); waste ${pct(v.cell.wasted, v.cell.knownInScope)}%, unchecked ${pct(v.cell.unchecked, v.cell.mainUnits)}%`);
  }
  const notes = new Set(all.flatMap((r) => [...r.notes]));
  if (notes.size) console.log(`\nnotes: ${[...notes].join('; ')}`);
  if (errors.length) {
    console.log(`\n${errors.length} learners failed to run:`);
    errors.slice(0, 20).forEach((e) => console.log(`  ${e}`));
  }
  if (VERBOSE) {
    console.log('\nfalse skips and missed gaps, learner by learner:');
    for (const r of all.filter((x) => x.falseSkips.length || x.missedGaps.length)) {
      console.log(`  ${r.model} ${r.trackId}/${r.mode}/${r.profileName} #${r.seed} T=${r.T} k=${r.k} G=${r.G} placed U${r.placedUnit}: `
        + `FS ${r.falseSkips.map((f) => `g${f.grade}u${f.unit}(${f.source})`).join(' ')} | missed ${r.missedGaps.map((m) => `g${m.grade}u${m.unit}`).join(' ')}${r.mismatches.length ? ` | path mismatch ${r.mismatches.join(' ')}` : ''}`);
    }
  }
  console.log(`\n${all.length} learners in ${((RealDate.now() - t0) / 1000).toFixed(1)}s; ${failed ? `${failed} subject/mode rows FAIL` : 'all rows PASS'}`);
  process.exitCode = failed || errors.length ? 1 : 0;
}

module.exports = { runLearner, makeLearner, chanceRight, unitAtPosition, unitTested, PROFILES, TARGETS, BUDGET };

if (require.main === module) {
  main().then(() => process.exit()).catch((err) => { console.error(err); process.exit(1); });
}
