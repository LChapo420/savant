/**
 * Synthetic-learner recovery simulation for the learning scorecard.
 *
 *   NODE_PATH=../node_modules node scripts/scorecard-recovery-sim.js            the baseline (writes
 *                                                                              curriculum-build/scorecard-sim/)
 *   NODE_PATH=../node_modules node scripts/scorecard-recovery-sim.js --quick    a few learners, prints only
 *   ... --learners=200 --levels=100 --modes=off,honest,confirming --seed=7 --write --verbose
 *
 * The question it answers: when a learner really is a certain way, does the
 * scorecard end up saying so — and when it tells a lesson writer something, is
 * it true? It is a measuring stick, not a change: every later change to the
 * scorecard (curriculum-build/SCORECARD-RESEARCH-2026-10-22.md, section 5) has
 * to beat the numbers this prints.
 *
 * How it works, in four parts:
 *
 *   1. A synthetic learner gets a TRUE value, 0–100, for every stat, drawn from a
 *      population where 50 is typical and about one learner in eight is past
 *      each directive edge (70 / 30). Where a stat has a meaning the app's data
 *      could show, that true value drives behaviour (TRUTH_MODEL below). Where it
 *      has none, the sim says so and the value is only visible to the idealised
 *      "honest" model read — it is never turned into invented behaviour.
 *
 *   2. The learner then does levels: practice levels of ten questions planned the
 *      way services/sessions.js planLesson plans them (due reviews first, from
 *      the real services/mastery.js schedule; a support item; focus items; a
 *      stretch item last), and creator lesson pages every third level whose
 *      holdout / experiment arm comes from the real personalize.armFor. Answers
 *      come from a Rasch model (ability against a true item difficulty; the
 *      difficulty label the app sees is a noisy copy), with forgetting by a
 *      half-life, rapid guesses, coach use, confidence taps, revisions,
 *      misconception tags, quitting, feedback taps and sittings spread over days.
 *
 *   3. Everything goes through the app's own update path, unmodified:
 *      scorecard/hooks.js (onPlacement, onAnswer, onBlockResolved with its credit
 *      of the lesson page before it, onBaseLessonFinished, onFeedback,
 *      onSessionFinished), scorecard.seedFromStyleQuiz for the questionnaire, and
 *      learner-record.applyDebrief for the after-level read — the same one-point
 *      and big-move rules a real model's reply goes through. Only the model is a
 *      stub (LLM_MODES): off, honest-noisy, or self-confirming.
 *
 *   4. At 10, 30 and 100 levels the card is read back (scorecard.read, and
 *      translate.directives for what a writer would actually be told) and
 *      compared with the truth.
 *
 * What is wrapped, and why (nothing in services/ is edited):
 *
 *   - config/db is replaced in require.cache by an in-memory store, reset for
 *     every learner. data/db.json is never opened. DB_FILE is also pointed at a
 *     temp file and DB_READONLY=1 set, so even a stray load of the real module
 *     could not write the real data.
 *   - the global Date is replaced by a simulated clock, so review gaps, the
 *     30-day experiment window and the days between sittings are real days
 *     without waiting for them.
 *   - scorecard.observe and scorecard.shift are wrapped to count, per stat, how
 *     much evidence weight arrived from which source (behaviour, feedback taps,
 *     experiments, the questionnaire, the model read). The wrappers call the
 *     originals unchanged.
 *   - console.warn is wrapped to count the hooks' swallowed errors, which would
 *     otherwise hide a broken input.
 *
 * No model or API is called. The script reads app source only to list which
 * stats signals.js can move.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// ── options ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const has = (flag) => argv.includes(`--${flag}`);
function opt(name, dflt) {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
}
const QUICK = has('quick');
const LEARNERS = Number(opt('learners', QUICK ? 24 : 200));
const MAX_LEVELS = Number(opt('levels', 100));
const CHECKPOINTS = [10, 30, 100].filter((c) => c <= MAX_LEVELS);
if (!CHECKPOINTS.includes(MAX_LEVELS)) CHECKPOINTS.push(MAX_LEVELS);
const MODES = opt('modes', 'off,honest,confirming').split(',').map((m) => m.trim()).filter(Boolean);
const SEED = Number(opt('seed', 20261022));
const POPULATION = Number(opt('population', QUICK ? 30 : 60));
const VERBOSE = has('verbose');
// The full run writes the baseline; --quick only prints unless asked.
const WRITE = has('write') || (!QUICK && !has('no-write'));
const OUT_DIR = path.resolve(opt('out', path.join(ROOT, 'curriculum-build', 'scorecard-sim')));
// --name=step-1 writes step-1.json and puts a row in BASELINE.md's progress
// table instead of rewriting the baseline write-up.
const OUT_NAME = opt('name', QUICK ? 'quick' : 'baseline');
const NOTE = opt('note', '');
// --only=3,17 runs just those learners (debugging); --debug=stat1,stat2 prints their final records and sides.
const ONLY = opt('only', '') ? new Set(opt('only', '').split(',').map(Number)) : null;
const DEBUG = opt('debug', '').split(',').filter(Boolean);

// ── the database: in memory, never data/db.json ────────────────────────────
// Belt and braces: if anything ever loaded the real module, it would open a
// throwaway file and never write it.
process.env.DB_FILE = path.join(os.tmpdir(), 'scorecard-recovery-sim-unused.json');
process.env.DB_READONLY = '1';

let store = {};
let counters = {};
// The other learners. The app's population priors and rate norms
// (scorecard/index.js populationPriors) and its shared item calibration
// (scorecard/irt.js) are built from everyone's rows. With --population=N the
// sim first runs N learners of its own (a different seed), keeps their
// scorecards as read-only rows every measured learner can see, and restores
// the shared tables as those learners left them before each measured learner,
// so measured learners stay independent of each other and of their order.
// --population=0 reproduces round 1's measurement (each learner alone).
const POP_READ = new Set(['scorecards']);
const SHARED = new Set(['content_cache']);
const popRows = { scorecards: [] };
let sharedSnapshot = {};
function col(name) {
  if (!store[name]) store[name] = [];
  return store[name];
}
function rowsFor(name) {
  return POP_READ.has(name) && popRows[name].length ? col(name).concat(popRows[name]) : col(name);
}
const memoryDb = {
  all: (name) => rowsFor(name),
  insert(name, doc) {
    counters[name] = (counters[name] || 0) + 1;
    const row = { id: counters[name], created_at: new Date().toISOString(), ...doc };
    col(name).push(row);
    return row;
  },
  insertMany(name, docs) { return docs.map((d) => memoryDb.insert(name, d)); },
  find: (name, predicate) => rowsFor(name).filter(predicate),
  findOne: (name, predicate) => col(name).find(predicate) || (POP_READ.has(name) ? popRows[name].find(predicate) : null) || null,
  byId: (name, id) => col(name).find((r) => r.id === Number(id)) || null,
  update(name, id, patch) {
    const row = memoryDb.byId(name, id);
    if (!row) return null;
    Object.assign(row, patch, { updated_at: new Date().toISOString() });
    return row;
  },
  upsert(name, predicate, build) {
    const existing = memoryDb.findOne(name, predicate);
    if (existing) {
      Object.assign(existing, build(existing), { updated_at: new Date().toISOString() });
      return existing;
    }
    return memoryDb.insert(name, build(null));
  },
  remove(name, predicate) {
    const rows = col(name);
    let removed = 0;
    for (let i = rows.length - 1; i >= 0; i--) if (predicate(rows[i])) { rows.splice(i, 1); removed++; }
    return removed;
  },
  flush() {},
  path: '(scorecard-recovery-sim: in memory)',
};
function resetStore() {
  store = {};
  counters = {};
  for (const [name, rows] of Object.entries(sharedSnapshot)) {
    store[name] = JSON.parse(JSON.stringify(rows));
    counters[name] = rows.reduce((m, r) => Math.max(m, r.id || 0), 0);
  }
}
const dbModulePath = require.resolve(path.join(ROOT, 'config', 'db'));
require.cache[dbModulePath] = { id: dbModulePath, filename: dbModulePath, loaded: true, exports: memoryDb };

// ── the clock: simulated days ──────────────────────────────────────────────
const RealDate = Date;
const START = RealDate.UTC(2026, 0, 5, 17, 0, 0);
let simNow = START;
class SimDate extends RealDate {
  constructor(...args) {
    if (args.length === 0) super(simNow);
    else super(...args);
  }

  static now() { return simNow; }
}
global.Date = SimDate;
function advance(ms) { simNow += Math.max(0, Math.round(ms)); }

// ── the app's own modules ──────────────────────────────────────────────────
const scorecard = require('../services/scorecard');
const { STATS, BY_ID } = require('../services/scorecard/stats');
const translate = require('../services/scorecard/translate');
const contract = require('../services/scorecard/contract');
const hooks = require('../services/scorecard/hooks');
const signals = require('../services/scorecard/signals');
const personalize = require('../services/personalize');
const learnerRecord = require('../services/learner-record');
const mastery = require('../services/mastery');
const irt = require('../services/scorecard/irt');

// The hooks swallow their own errors (a scorecard failure must never break a
// lesson). In a simulation that would hide a broken input, so count them.
let hookFailures = 0;
const realWarn = console.warn;
console.warn = (...args) => {
  if (String(args[0] || '').startsWith('scorecard:')) hookFailures++;
  if (VERBOSE || hookFailures <= 3) realWarn(...args);
};

// ── evidence ledger: which source moved which stat ─────────────────────────
// Wrapping the module's exported functions catches every call hooks.js and
// learner-record.js make, because both call them through the module object.
let ledger = null;
function credit(stat, cls, w) {
  if (!ledger || !BY_ID[stat] || !(w > 0)) return;
  const row = ledger[stat] || (ledger[stat] = { beh: 0, tap: 0, exp: 0, quiz: 0, llm: 0 });
  row[cls] += w;
}
function sourceClass(o, source) {
  if (source === 'questionnaire') return 'quiz';
  const note = String(o.note || '');
  if (/^(lesson taught|taught |delayed recall after a lesson)/.test(note)) return 'exp';
  if (source === 'learner feedback') return 'tap';
  return 'beh';
}
const realObserve = scorecard.observe;
scorecard.observe = function observeCounted(userId, observations, meta = {}) {
  for (const o of observations || []) {
    if (!o) continue;
    // A rate observation has chances, not a weight: count each chance as a
    // small unit of behavioural evidence (0.05), for the ledger only.
    // A model-scored observation (a contrast, a shift against expectation, a
    // difficulty tap read against the level, a memory test) carries no weight of its own; it
    // is counted as one small unit of behaviour (0.05), or of a tap (0.25).
    if (o.contrast || o.shift || o.tap || o.memory || o.velocity || o.pace || o.reach) {
      // A memory test feeds the forgetting model, which sets all three memory stats.
      const ids = o.memory ? ['decay_rate', 'retention_index', 'retrieval_strength'] : [o.stat];
      for (const id of ids) credit(id, o.tap ? 'tap' : 'beh', o.tap ? 0.25 : 0.05);
      continue;
    }
    const w = o.trials !== undefined ? 0.05 * (Number(o.trials) || 0) : Number(o.weight) || 0;
    credit(o.stat, sourceClass(o, meta.source), o.test ? w : Math.min(1, w)); // a designed test may weigh more than 1
  }
  return realObserve.call(this, userId, observations, meta);
};
const realShift = scorecard.shift;
scorecard.shift = function shiftCounted(userId, statId, delta, meta = {}) {
  if (Number(delta)) credit(statId, 'llm', Math.min(1, 0.1 + Math.abs(Number(delta)) / 25));
  return realShift.call(this, userId, statId, delta, meta);
};

// ── deterministic randomness ───────────────────────────────────────────────
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashSeed(...parts) {
  let h = 2166136261;
  for (const ch of parts.join(':')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
class Rng {
  constructor(seed) { this.r = mulberry32(seed); }
  u() { return this.r(); }
  range(a, b) { return a + (b - a) * this.r(); }
  chance(p) { return this.r() < p; }
  int(n) { return Math.floor(this.r() * n); }
  normal() {
    let u = 0;
    while (!u) u = this.r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * this.r());
  }
  logn(sd) { return Math.exp(sd * this.normal()); }
  poisson(lambda) {
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do { k++; p *= this.r(); } while (p > L);
    return k - 1;
  }
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const sigmoid = (x) => 1 / (1 + Math.exp(-x));

// ── which stats each evidence source can reach (read from the code) ────────
// The research report's split, frozen as signals.js had it on 2026-10-22, so
// every later run is grouped the same way however the rules change.
const SIGNAL_STATS = new Set(['rush_tendency', 'guessing_propensity', 'processing_velocity', 'deliberation_depth',
  'confidence_calibration', 'self_monitoring', 'self_efficacy', 'hint_dependency', 'help_seeking', 'perfectionism',
  'retrieval_strength', 'decay_rate', 'retention_index', 'challenge_appetite', 'failure_response', 'error_recovery_speed',
  'frustration_threshold', 'persistence', 'fatigue_curve', 'warmup_latency', 'momentum_dependence',
  'open_response_performance', 'recognition_recall_gap', 'misconception_persistence', 'error_driven_learning',
  'interleaving_tolerance', 'instruction_adherence', 'attention_runway', 'consolidation_need', 'text_density_tolerance',
  'intake_baseline', 'mastery_orientation', 'brevity_preference', 'depth_breadth', 'step_explicitness',
  'repetition_tolerance', 'reflection_depth', 'mastery_velocity', 'reentry_cost', 'session_rhythm', 'prior_knowledge',
  // Round 4: scaffolding fade read from how far ahead of the course the learner
  // is now (the expertise-reversal construct; its truth is defined below).
  'scaffolding_fade']);
// Round 5: with --text-load, language level drives answers on wordy items.
if (Number(opt('text-load', 0.6))) SIGNAL_STATS.add('vocabulary_ceiling');
const EXPERIMENT_STATS = personalize.EXPERIMENTS.map((e) => e.stat);
// The questionnaire's reach is measured, not copied: seed a throwaway card with
// every answer at the top and see which stats moved.
const QUIZ_DIMS = ['explanation_depth', 'example_order', 'visual_support', 'practice_density', 'session_pacing',
  'challenge_appetite', 'verbalization', 'error_focus', 'retrieval_style'];
const QUIZ_STATS = (() => {
  resetStore();
  const card = scorecard.seedFromStyleQuiz(999999, Object.fromEntries(QUIZ_DIMS.map((d) => [d, 1])));
  const moved = STATS.filter((s) => card.stats[s.id].w > 0).map((s) => s.id);
  resetStore();
  return new Set(moved);
})();

/**
 * The research report's split, made disjoint for aggregation: a stat in an
 * experiment is "experiment" (brevity_preference also has feedback-tap rules,
 * which the report counts among the 41 behavioural); otherwise "behavioural" if
 * signals.js has a rule for it; otherwise "questionnaire" if only the
 * questionnaire seeds it; otherwise "llm-only".
 */
function groupOf(id) {
  if (EXPERIMENT_STATS.includes(id)) return 'experiment';
  if (SIGNAL_STATS.has(id)) return 'behavioural';
  if (QUIZ_STATS.has(id)) return 'questionnaire';
  return 'llm-only';
}
const GROUPS = ['behavioural', 'experiment', 'questionnaire', 'llm-only'];

// ── what each true value means in the simulated world ──────────────────────
/**
 * For each stat: how its true value shows up, if it does. The rule followed:
 * where signals.js assumes a trait causes some behaviour, the sim makes the
 * trait cause exactly that behaviour — giving the code its best case — and then
 * adds the confounds a real learner has (ability, item difficulty and order,
 * the review schedule, other traits). A stat whose meaning nothing in the app's
 * data would show is listed as such, and only the honest model stub sees it.
 */
const ALIASES = [
  // [stat, the stat it is the same latent as, inverted?]
  ['self_monitoring', 'confidence_calibration', false],
  ['retrieval_strength', 'decay_rate', true],
  ['retention_index', 'decay_rate', true],
  ['error_recovery_speed', 'failure_response', false],
  ['recognition_recall_gap', 'open_response_performance', true],
  ['error_driven_learning', 'misconception_persistence', true],
  ['deductive_trajectory', 'inductive_trajectory', true],
];
const GENERATIVE = {
  prior_knowledge: 'starting ability (Rasch theta) and the placement result',
  mastery_velocity: 'how fast ability grows per level',
  rush_tendency: 'share of rapid guesses on any item, and skimming lesson pages',
  guessing_propensity: 'extra rapid guesses on multiple-choice items',
  processing_velocity: 'answer-time multiplier and reading speed (wpm); pace taps',
  deliberation_depth: 'share of long, careful answers (more often right)',
  perfectionism: 'share of typed answers revised 3+ times',
  confidence_calibration: 'how well "how sure are you?" taps track the true chance of being right',
  self_efficacy: 'a bias toward tapping "sure"',
  hint_dependency: 'coach use on items the learner could do alone',
  help_seeking: 'coach use when stuck',
  decay_rate: 'memory half-life multiplier; recall on a review = 2^(-gap/half-life)',
  challenge_appetite: 'the success rate the learner wants (drives "too easy / too hard" taps)',
  failure_response: 'accuracy shift on the item right after a miss',
  frustration_threshold: 'chance of rushing the item after a miss',
  persistence: 'chance of quitting the sitting after three misses in a row',
  fatigue_curve: 'accuracy drop in the second half of a level',
  warmup_latency: 'accuracy drop on the first three items',
  momentum_dependence: 'accuracy drop after two opening misses',
  open_response_performance: 'typed-answer accuracy shift (on top of a population-wide recall penalty)',
  misconception_persistence: 'chance a misconception already shown comes back',
  interleaving_tolerance: 'accuracy shift on review items mixed into a level',
  instruction_adherence: 'chance of skimming a lesson page (its own rule reads telemetry the app never records)',
  attention_runway: 'levels per sitting and leaving early',
  intake_baseline: 'accuracy after a long lesson page; pace taps',
  brevity_preference: 'preferred length (length taps); also an experiment effect',
  depth_breadth: 'preferred length, weakly (the code reads "too short" taps)',
  step_explicitness: 'more "too fast" pace taps',
  repetition_tolerance: 'fewer "too slow" pace taps',
  reflection_depth: 'length of written feedback',
  reentry_cost: 'accuracy drop on the first level after 3+ days away',
  session_rhythm: 'regularity of the days between sittings',
  // Recorded by the app since round 2 (lesson pages count scroll-backs).
  consolidation_need: 'scroll-backs over a lesson page (going back over it)',
  // Round 4. Expertise relative to the material is the one learner-by-teaching
  // interaction with a replicated effect (the expertise reversal effect): full
  // support for a learner behind what the lesson assumes, fading it for one
  // ahead. Its truth is not a fixed draw but where the learner stands NOW: true
  // ability minus the difficulty the course is pitched at for them at this
  // level, as a standing among the measured learners at the checkpoint
  // (50 + 17 z). The fixed draw is used only by the honest model-read stub.
  scaffolding_fade: 'how far ahead of (high) or behind (low) the course the learner is now: true ability minus the difficulty of the course at this level, as a standing among learners',
  text_density_tolerance: 'fewer scroll-backs over a lesson page',
};
const DEAD_WIRED = {};
const NO_GENERATIVE_NOTE = {
  mastery_orientation: 'its only rule scores check accuracy on AI-lesson levels (ability, not orientation); no behaviour in the app\'s data reflects it',
};
if (Number(opt('text-load', 0.6))) GENERATIVE.vocabulary_ceiling = 'answers on wordier items fall below ability for a low language level (--text-load)';
function truthModelOf(id) {
  const alias = ALIASES.find((a) => a[0] === id);
  if (alias) return { model: 'alias', note: `${alias[2] ? 'inverse of ' : 'same latent as '}${alias[1]}` };
  if (EXPERIMENT_STATS.includes(id)) {
    return { model: 'experiment', note: `arm effect on the next level's accuracy (and delayed recall)${GENERATIVE[id] ? `; ${GENERATIVE[id]}` : ''}` };
  }
  if (GENERATIVE[id]) return { model: 'generative', note: GENERATIVE[id] };
  if (DEAD_WIRED[id]) return { model: 'dead-wired', note: DEAD_WIRED[id] };
  if (NO_GENERATIVE_NOTE[id]) return { model: 'none', note: NO_GENERATIVE_NOTE[id] };
  if (QUIZ_STATS.has(id)) return { model: 'self-report', note: 'only the questionnaire answer (r = 0.4 with truth) and the model read reflect it' };
  return { model: 'none', note: 'no channel in the app\'s data; only the idealised honest model read can see it' };
}
const TRUTH_MODEL = Object.fromEntries(STATS.map((s) => [s.id, truthModelOf(s.id)]));

// ── constants of the simulated world ───────────────────────────────────────
const TRACK = 'math';
const GRADE = 'sim';
const POP_SD = 17;            // population spread of every true value (50 = typical)
const EXP_EFFECT = 0.8;       // logits between arms for an extreme learner (~17 pp at p = 0.7)
const SELF_REPORT_R = 0.4;    // how well a questionnaire answer reflects the true value
const QUIZ_RATE = 0.7;        // share of learners who fill in the questionnaire
const FEEDBACK_RATE = 0.3;    // share of levels the learner leaves feedback on
const TAP_RATE = Number(opt('tap-rate', 1 / 3));
// --tap-pick=random|hard (round 5, product-call measurement only): which
// questions show "how sure are you?". random: any question, TAP_RATE of them
// (the app). hard: the same number of taps, but weighted toward the level's
// harder questions (stretch 3, review 1.5, focus 0.8, support 0.4 relative to
// the level's mix), where misses are common: the ROC area behind calibration
// rests on the rarer side (misses), so balancing right and wrong taps should
// need fewer taps for the same precision.
const TAP_PICK = opt('tap-pick', 'random');
const TAP_WEIGHTS = { stretch: 3, review: 1.5, focus: 0.8, support: 0.4 }; // "how sure are you?" is shown on about one question in three (--tap-rate: a product call, for measuring)
// A level left partway leaves the sitting open (the app has no way to finish a
// practice level halfway). Next time, the learner opens a different level
// (the app then closes the open sitting as abandoned) this share of the time,
// and otherwise comes back to it (the app resumes it). Nothing in the app's
// data says which is more common; half is a guess, and --abandon=0..1 sets it.
const ABANDON_SHARE = Number(opt('abandon', 0.5));
const REVIEW_PICK = opt('review-pick', 'app');
// --review-pick=model / oracle (round 4, product-call measurement only): review
// a skill when its PREDICTED recall has fallen below --review-target (FSRS's
// "desired retention"), lowest first, at most three per level. model: the
// app's own forgetting model (the population curve fitted by forgetting.js to
// the other learners' memory tests, and this learner's multiplier fitted to
// their own); oracle: the learner's true half-lives (an upper bound).
const REVIEW_TARGET = Number(opt('review-target', 0.85));
// --reading-test=K (round 4, product-call measurement only): a calibrated
// reading/vocabulary test K times per learner (the first level, then evenly
// spaced), each read like a placement: one designed test of 10 points' error
// on vocabulary_ceiling (language level), which nothing in the app measures
// today. It stands for an onboarding passage test (or periodic passage
// checks indexed by readability); the app has no such channel yet.
const READING_TESTS = Number(opt('reading-test', 0));
// --text-load=B (round 5): language level shows in the answers. An item's text
// load is its prompt's length (12-29 words, as standardised z); a learner's
// answer logit moves by B * z(vocabulary_ceiling) * load z, so a learner with a
// low language level (z = (truth - 50) / 50 < 0) answers wordier items below
// their ability, a high one does not lose (or gains a little) on them. The
// direction is replicated: the more non-mathematical lexical and syntactic
// complexity in a math item, the larger its difficulty gap against English
// learners of the same ability (Martiniello 2008, Harvard Educational Review;
// Abedi & Lord 2001). The size is an assumption: B = 0.6 makes a learner at 20
// lose about 0.36 logits per SD of text load. Default 0.6 since round 5 step 31;
// 0 = rounds 1-4 (no channel). Measured: at 0 the app's text-load reading gives
// r 0 and no directive; at 0.3, r about 0.5 and no directive.
const TEXT_LOAD = Number(opt('text-load', 0.6));
const forgettingModel = require('../services/scorecard/forgetting');
/** The mean tap weight over a level's plan (--tap-pick=hard keeps the tap count). */
const tapMean = (plan) => plan.reduce((acc, x) => acc + (TAP_WEIGHTS[x.role] || 1), 0) / Math.max(1, plan.length);
// --memory=sim|fsrs (round 5, a robustness knob for the measuring stick): the
// learners' TRUE memory. sim (default, rounds 1-4): exponential forgetting,
// R = 2^(-t/H); every right answer multiplies H by 1.3 + 1.5 (1 - R), a miss by
// 0.7. fsrs: the FSRS-6 memory model with its published default parameters
// (open-spaced-repetition wiki "The Algorithm", fitted to Anki review logs):
// power-law forgetting R = (1 + F t / S)^-w20, a same-day answer barely moves
// stability (S e^{w17 (G - 3 + w18)} S^-w19), a spaced right answer multiplies
// it by 1 + e^{w8} (11 - D) S^-w9 (e^{w10 (1 - R)} - 1), a spaced miss resets it
// (w11 D^-w12 ((S + 1)^w13 - 1) e^{w14 (1 - R)}), with difficulty D. The
// learner's decay trait scales time (t / halfLifeMult) in both.
const MEMORY_MODEL = opt('memory', 'sim');
const FW = [0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542];
const FF = 0.9 ** (-1 / FW[20]) - 1;
const fsrsD0 = (g) => FW[4] - Math.exp(FW[5] * (g - 1)) + 1;
/** True recall of a skill's memory `days` after it was last practised. */
function trueRecall(m, days) {
  if (!m || m.last === null) return 1;
  if (MEMORY_MODEL === 'fsrs') return (1 + FF * (days / m.mult) / m.S) ** -FW[20];
  return 2 ** (-days / m.H);
}
/** A new skill's memory, before its first answer. */
function newMemory(mult) {
  return MEMORY_MODEL === 'fsrs' ? { S: null, D: null, mult, H: null, last: null } : { H: 2 * mult, mult, last: null };
}
/** One answer's effect on the true memory (recall: its R at the answer; days: since last practised). */
function trueUpdate(m, correct, recall, days) {
  if (MEMORY_MODEL !== 'fsrs') {
    if (correct) m.H = m.H * (1.3 + 1.5 * (1 - recall)) + 0.2 * m.mult;
    else m.H = Math.max(2 * m.mult, m.H * 0.7);
    return;
  }
  const G = correct ? 3 : 1;
  const init = m.S === null;
  if (init) {
    m.S = correct ? FW[2] : FW[0];
    m.D = Math.max(1, Math.min(10, fsrsD0(G)));
  } else if (days < 1) {
    m.S = m.S * Math.exp(FW[17] * (G - 3 + FW[18])) * m.S ** -FW[19];
  } else if (correct) {
    m.S *= 1 + Math.exp(FW[8]) * (11 - m.D) * m.S ** -FW[9] * (Math.exp(FW[10] * (1 - recall)) - 1);
  } else {
    m.S = Math.min(m.S, FW[11] * m.D ** -FW[12] * ((m.S + 1) ** FW[13] - 1) * Math.exp(FW[14] * (1 - recall)));
  }
  if (!init) {
    const dD = -FW[6] * (G - 3) * ((10 - m.D) / 9);
    m.D = Math.max(1, Math.min(10, FW[7] * fsrsD0(4) + (1 - FW[7]) * (m.D + dD)));
  }
  m.S = Math.max(0.01, m.S);
  // Days to fall to 50% recall, for the half-life report.
  m.H = m.mult * m.S * (2 ** (1 / FW[20]) - 1) / FF;
}
let simForgettingPop = null; // the population curve, fitted once after the population has run
const LEVEL_ITEMS = 10;
const LLM_STATS_PER_READ = 5;
const PET_STATS = 8;          // confirming mode: the stats one learner's reads keep returning to
const PET_PICKS_PER_READ = 2;
const KEPT = {
  expertise: 'prior_knowledge',
  forgetting_rate: 'decay_rate',
  reading_speed: 'processing_velocity',
  length_budget: 'brevity_preference',
  interest_context: 'interest_transfer',
  misconceptions: 'misconception_persistence',
  target_difficulty: 'challenge_appetite',
  quit_risk: 'persistence',
  rapid_guess_rate: 'rush_tendency',
  calibration: 'confidence_calibration',
  coach_reliance: 'hint_dependency',
  language_level: 'vocabulary_ceiling',
};

function drawTruth(rng) {
  const T = {};
  for (const s of STATS) T[s.id] = clamp(50 + POP_SD * rng.normal(), 2, 98);
  for (const [id, base, inv] of ALIASES) T[id] = inv ? 100 - T[base] : T[base];
  return T;
}

/** The behaviour a set of true values produces, as rates and shifts. */
function paramsFor(T) {
  const z = (id) => (T[id] - 50) / 50; // -1 .. 1
  const u = (id) => T[id] / 100;       //  0 .. 1
  return {
    theta0: (T.prior_knowledge - 50) / 25,
    learnRate: 0.02 + 0.015 * z('mastery_velocity'),
    rushRate: 0.01 + 0.22 * u('rush_tendency') ** 2,
    mcGuessRate: 0.12 * u('guessing_propensity') ** 2,
    timeMult: Math.exp(-0.6 * z('processing_velocity')),
    wpm: 230 * Math.exp(0.45 * z('processing_velocity')),
    delibRate: 0.03 + 0.15 * u('deliberation_depth'),
    perfRate: 0.25 * u('perfectionism') ** 2,
    calib: 0.15 + 0.85 * u('confidence_calibration'),
    sureBias: 0.15 * z('self_efficacy'),
    hintRate: 0.005 + 0.12 * u('hint_dependency') ** 2,
    helpRate: 0.4 * u('help_seeking'),
    halfLifeMult: Math.exp(-0.9 * z('decay_rate')),
    prefSuccess: 0.9 - 0.3 * u('challenge_appetite'),
    postError: 0.8 * z('failure_response'),
    frustRush: 0.35 * (1 - u('frustration_threshold')) ** 2,
    quitRun: 0.6 * (1 - u('persistence')) ** 2,
    fatigue: -1.0 * u('fatigue_curve'),
    warmup: -1.0 * u('warmup_latency'),
    momentum: -0.9 * u('momentum_dependence'),
    typed: -0.6 + 0.8 * z('open_response_performance'),
    misRecur: 0.1 + 0.75 * u('misconception_persistence'),
    interleave: 0.8 * z('interleaving_tolerance'),
    skimRate: 0.03 + 0.25 * (1 - u('instruction_adherence')) ** 2,
    levelsPerSitting: 0.4 + 2.2 * u('attention_runway'),
    leaveEarly: 0.15 * (1 - u('attention_runway')) ** 2,
    intake: 0.6 * z('intake_baseline'),
    lengthPref: Math.exp(-0.8 * z('brevity_preference') + 0.3 * z('depth_breadth')),
    reflection: u('reflection_depth'),
    reentry: -1.2 * u('reentry_cost'),
    gapSd: 0.15 + 1.1 * (1 - u('session_rhythm')),
    scrollBacks: 0.3 + 1.5 * u('consolidation_need') ** 2 + 0.8 * (1 - u('text_density_tolerance')) ** 2,
    z,
  };
}

// ── the model read stubs ───────────────────────────────────────────────────
/**
 * The after-level read, minus the model. Each mode returns stat_changes in the
 * shape DEBRIEF_SCHEMA asks for, and they go through the real
 * learner-record.applyDebrief, so the one-point rule, the big-move rule and the
 * trend / confident-score holds all apply exactly as they would to a real reply.
 *
 *   off         no read at all (or a model that never suggests a stat change)
 *   honest      reads LLM_STATS_PER_READ random stats' TRUE values with noise
 *               (SD 15) and suggests the gap from the current score. An upper
 *               bound: it assumes the model can perceive traits that nothing in
 *               the level shows.
 *   confirming  never looks at the truth. Two of its five suggestions go to a
 *               fixed set of PET_STATS stats per learner (what the model keeps
 *               "seeing" in this learner's levels), the rest to stats the card
 *               already leans on (weighted by how far from 50). Each pushes
 *               further the way the card already leans, or, at 50, in a
 *               direction fixed per learner. This is the anchoring + "the lesson
 *               was written to the directive and went fine" loop the research
 *               report describes.
 */
function modelRead(mode, card, T, rng, fixedDir) {
  if (mode === 'off') return [];
  const ids = STATS.map((s) => s.id);
  const current = (id) => scorecard.read(card, id, { trackId: TRACK }).score;
  const changes = [];
  if (mode === 'honest') {
    const picked = new Set();
    while (picked.size < LLM_STATS_PER_READ) picked.add(ids[rng.int(ids.length)]);
    for (const id of picked) {
      const perceived = T[id] + 15 * rng.normal();
      const d = Math.round(clamp(perceived - current(id), -25, 25));
      if (Math.abs(d) >= 4) changes.push({ stat: id, delta: d, reason: 'sim: honest read' });
    }
    return changes;
  }
  if (mode === 'confirming') {
    // Some of every read goes to the same few stats the model "believes" this
    // level evidences (a fixed set per learner, a fixed direction each)...
    const picked = new Set();
    while (picked.size < PET_PICKS_PER_READ) picked.add(fixedDir.pets[rng.int(fixedDir.pets.length)]);
    // ...and the rest to whatever the card already leans on, weighted by how far.
    const weights = ids.map((id) => 1 + Math.abs(current(id) - 50));
    const total = weights.reduce((a, w) => a + w, 0);
    while (picked.size < LLM_STATS_PER_READ) {
      let x = rng.u() * total;
      let i = 0;
      while (x > weights[i]) { x -= weights[i]; i++; }
      picked.add(ids[Math.min(i, ids.length - 1)]);
    }
    for (const id of picked) {
      const lean = current(id) - 50;
      const dir = Math.abs(lean) >= 3 ? Math.sign(lean) : fixedDir[id];
      changes.push({ stat: id, delta: dir * Math.round(rng.range(6, 22)), reason: 'sim: self-confirming read' });
    }
    return changes;
  }
  throw new Error(`unknown model mode: ${mode}`);
}

// ── reading the card back ──────────────────────────────────────────────────
const COMBINED_SIDES = Object.fromEntries(translate.COMBINED.map(([a, sa, b, sb]) => [`${a}+${b}`, { [a]: sa, [b]: sb }]));
/** The lesson directives a writer would be given, as stat -> side. */
function directiveSides(card) {
  const list = translate.directives(card, { use: 'L', trackId: TRACK, hasInterests: true });
  const sides = {};
  for (const d of list) {
    if (d.parts) Object.assign(sides, COMBINED_SIDES[d.stat] || {});
    else sides[d.stat] = d.side;
  }
  // Round 6: the insertion contract must hand every consumer these same sides.
  const c = contract.read(null, { card, trackId: TRACK, hasInterests: true, memory: false });
  CONTRACT_CHECK.reads++;
  const a = JSON.stringify(Object.entries(sides).sort());
  const b = JSON.stringify(Object.entries(c.lesson.sides).sort());
  if (a !== b || contract.validate(c).length) CONTRACT_CHECK.mismatches++;
  return sides;
}
const CONTRACT_CHECK = { reads: 0, mismatches: 0 };

const tokens = (text) => Math.round(String(text).length / 4);
/** What the scorecard adds to prompts at this moment, in tokens (characters / 4). */
function promptSizes(userId, level) {
  const card = scorecard.get(userId);
  const brief = personalize.scorecardSection(userId, { trackId: TRACK, gradeId: GRADE }).join('\n');
  const coach = translate.directives(card, { use: 'C', max: 8, hasInterests: true });
  const coachText = coach.length ? `FROM THIS LEARNER'S MEASURED SCORECARD\n${coach.map((d) => `- ${d.text}`).join('\n')}` : '';
  // The after-level read differs by mode: a level with something the learner
  // wrote (feedback mode) and one without (performance mode). The sim's
  // learners leave feedback on FEEDBACK_RATE of levels, so the read's cost per
  // level is the mix of the two.
  const build = (feedback, blank = false) => learnerRecord.buildDebriefPrompt({
    row: { track_id: TRACK, grade_id: GRADE, level },
    record: blank ? { facts: [], recommendations: [], conclusions: [] } : learnerRecord.get(userId),
    card: blank ? { stats: {}, subjects: {} } : card,
    content: { kind: 'sim', text: '' },
    items: [],
    feedback,
  });
  const said = [{ liked: 'x' }];
  const guideOf = (p) => {
    const at = p.user.indexOf('THE 100 STATS');
    return at < 0 ? '' : p.user.slice(at, p.user.indexOf('THIS LEARNER\'S RECORD'));
  };
  const perf = build([]);
  const fb = build(said);
  const mix = (x, y) => Math.round(FEEDBACK_RATE * x + (1 - FEEDBACK_RATE) * y);
  const guide = mix(tokens(guideOf(fb)), tokens(guideOf(perf)));
  const system = mix(tokens(fb.system), tokens(perf.system));
  // The part of the read that is the same text for every learner and level can
  // be served from the provider's prompt cache: the system prompt, plus the
  // guide when it carries no learner's numbers (checked against a blank card).
  const cacheOf = (p, blankUser) => tokens(p.system) + (guideOf(p) && blankUser.includes(guideOf(p)) ? tokens(guideOf(p)) : 0);
  const cacheable = mix(cacheOf(fb, build(said, true).user), cacheOf(perf, build([], true).user));
  return {
    brief: tokens(brief),
    coach: tokens(coachText),
    read_stat_guide: guide,
    read_system_rules: system,
    // block-levels.js sends the brief to both the layout and the fill call.
    per_tailored_level: tokens(brief) * 2 + guide + system,
    read_cacheable_prefix: cacheable,
    per_tailored_level_uncached: tokens(brief) * 2 + guide + system - cacheable,
  };
}

// Whether the app's after-level read asks for stat changes on a level the
// learner said nothing about (round 2 stopped doing so). The stub model reads
// only where the real read would be shown the stats.
const READS_STATS_WITHOUT_FEEDBACK = learnerRecord.buildDebriefPrompt({
  row: { track_id: TRACK, grade_id: GRADE, level: 1 }, record: { facts: [], recommendations: [], conclusions: [] },
  card: { stats: {}, subjects: {} }, content: { kind: 'sim', text: '' }, items: [], feedback: [],
}).user.includes('THE 100 STATS');

// ── one learner ────────────────────────────────────────────────────────────
const wordsOf = (n) => Array(n).fill('w').join(' ');
const CHOICES = ['a', 'b', 'c', 'd'];

function runLearner(index, mode, { population = false } = {}) {
  resetStore();
  simNow = START;
  ledger = {};
  // Population figures are recomputed for every learner, so no learner (or
  // mode) inherits figures that happened to include the previous learner's card.
  if (scorecard.refreshPopulation) scorecard.refreshPopulation();
  // Population learners (the "other learners" of the app) have their own seeds
  // and user ids, so they never overlap with a measured learner.
  const tag = population ? 'pop-' : '';
  const userId = population ? 1000000 + index : index + 1;
  const where = { trackId: TRACK, gradeId: GRADE };
  // The learner (truth and behaviour) is the same in every mode; only the model
  // read's own randomness is separate, so modes are compared on the same people.
  const T = drawTruth(new Rng(hashSeed(SEED, `${tag}truth`, index)));
  const P = paramsFor(T);
  const rng = new Rng(hashSeed(SEED, `${tag}behaviour`, index));
  const llmRng = new Rng(hashSeed(SEED, `${tag}llm`, mode, index));
  // Its own stream, so adding scroll-backs left every other behaviour as it was.
  const scrollRng = new Rng(hashSeed(SEED, `${tag}scroll`, index));
  // Its own stream too: whether a sitting left open is resumed or abandoned.
  const openRng = new Rng(hashSeed(SEED, `${tag}open`, index));
  // And for the reading test knob (round 4).
  const readingRng = new Rng(hashSeed(SEED, `${tag}reading`, index));
  const readingDone = new Set();
  const fixedDir = Object.fromEntries(STATS.map((s) => [s.id, llmRng.chance(0.5) ? 1 : -1]));
  const allIds = STATS.map((s) => s.id);
  const pets = new Set();
  while (pets.size < PET_STATS) pets.add(allIds[llmRng.int(allIds.length)]);
  fixedDir.pets = [...pets];

  memoryDb.insert('profiles', { user_id: userId, survey: { interests: 'basketball' } });

  // Placement: the app's estimate of ability is the truth plus placement error.
  const thetaHat0 = P.theta0 + 0.4 * rng.normal();
  const pkHat = clamp(50 + 25 * thetaHat0, 0, 100);
  hooks.onPlacement(userId, { trackId: TRACK, placedLevel: Math.round(100 * clamp((pkHat - 10) / 85, 0, 1)), pathLength: 100 });

  // The questionnaire: a self-report of the dimension's main stat, weakly valid.
  if (rng.chance(QUIZ_RATE)) {
    const reportOf = (t) => clamp(0.5 + 0.22 * (SELF_REPORT_R * (t - 50) / 50 * 3
      + Math.sqrt(1 - SELF_REPORT_R ** 2) * rng.normal()), 0, 1);
    const vector = {
      explanation_depth: reportOf(T.step_explicitness),
      example_order: reportOf(T.inductive_trajectory),
      visual_support: reportOf(T.spatial_anchoring),
      practice_density: reportOf(100 - T.chunk_granularity),
      session_pacing: reportOf(T.attention_runway),
      challenge_appetite: reportOf(T.challenge_appetite),
      verbalization: reportOf(T.elaboration_benefit),
      error_focus: reportOf(T.feedback_granularity),
      retrieval_style: reportOf(T.generation_effect),
    };
    // seedFromStyleQuiz calls observe inside its own module, past the wrapper,
    // so its evidence is counted here.
    for (const s of QUIZ_STATS) credit(s, 'quiz', 0.6);
    scorecard.seedFromStyleQuiz(userId, vector);
  }

  // Memory: each skill's true half-life (days) and when it was last practised.
  const memory = {};
  const misconception = {};    // skill -> { has, seen }
  let pendingPage = null;      // the lesson page the next practice level is the test of
  const experimentsBySkill = {}; // skill -> { stat, arm, until }
  let lastSessionEnd = null;

  const out = {
    snapshots: {},
    firstConfident: {},
    firstDirective: {},
    experiments: 0,
    holdouts: 0,
    quits: 0,
    reviewItems: 0,
    answered: { all: [0, 0], review: [0, 0], focus: [0, 0] },
    leftEarly: 0,
    resumed: 0,
    abandoned: 0,
    practiceMs: 0, // answering and reading time, for the outcome metrics (round 4)
    pages: [],     // lesson pages judged by the level after them (round 4)
  };
  const skillCounts = {}; // skill -> [right, wrong] answers, as the app's records hold them
  const spacedCounts = {}; // skill -> [right, wrong] answers a day or more after the skill was last practised (memory tests)
  let done = 0;
  let theta = P.theta0;

  const focusSkill = (L) => `s${Math.ceil(L / 2)}`;
  const introduced = (L) => Array.from({ length: Math.ceil(L / 2) }, (_, i) => `s${i + 1}`);

  /** Skills whose predicted recall is below the target, lowest first (--review-pick=model|oracle). */
  function pickByRecall(L) {
    let curve = forgettingModel.DEFAULT_CURVE;
    let m = 0;
    if (REVIEW_PICK === 'model') {
      const pop = simForgettingPop;
      if (pop && pop.curve) curve = pop.curve;
      const card = scorecard.get(userId);
      const rows = Object.values((card && card.memory) || {}).flat();
      if (rows.length) {
        const norm = pop && pop.norm !== null && pop.norm !== undefined ? pop.norm : 0;
        m = forgettingModel.fitLearner(curve, rows, { mean: norm, sd: (pop && pop.tau) || 0.8, today: simNow / 86400000 }).m;
      }
    }
    return introduced(L).filter((k) => k !== focusSkill(L) && memory[k] && memory[k].last !== null)
      .map((k) => {
        const days = (simNow - memory[k].last) / 86400000;
        const [nc, nw] = skillCounts[k] || [0, 0];
        const [ns, nsw] = spacedCounts[k] || [0, 0];
        if (REVIEW_PICK === 'oracle') return { skill_id: k, R: trueRecall(memory[k], days) };
        return { skill_id: k, R: forgettingModel.recallAt({ curve, m }, { days, right: nc, wrong: nw, spacedRight: ns, spacedWrong: nsw, fresh: 1, guess: 0 }) };
      })
      .filter((x) => x.R < REVIEW_TARGET)
      .sort((a, b) => a.R - b.R)
      .slice(0, 3);
  }

  function practiceLevel(L, session, sessionItems, ctx, resume = null) {
    const plan = [];
    if (resume) plan.push(...resume.plan);
    else {
      // --review-pick=oldest: a product-call measurement only (review scheduling): the three
      // skills practised longest ago, in place of the app's due reviews.
      const due = REVIEW_PICK === 'oldest'
        ? introduced(L).filter((k) => k !== focusSkill(L) && memory[k] && memory[k].last !== null).sort((a, b) => memory[a].last - memory[b].last).slice(0, 3).map((k) => ({ skill_id: k }))
        : REVIEW_PICK === 'model' || REVIEW_PICK === 'oracle' ? pickByRecall(L)
          : mastery.dueReviews(userId, introduced(L), 3);
      for (const st of due) plan.push({ skill: st.skill_id, role: 'review' });
      const weak = mastery.weakSkills(userId, introduced(L));
      plan.push({ skill: (weak[0] && weak[0].skill_id) || focusSkill(L), role: 'support' });
      while (plan.length < LEVEL_ITEMS - 1) plan.push({ skill: focusSkill(L), role: 'focus' });
      plan.push({ skill: focusSkill(L), role: 'stretch' });
    }

    const content = thetaHat0 + 0.02 * L;   // the course's difficulty at this level
    // Pitched so a typical learner lands near 70% overall, the success rate the
    // app's levels are built around (support easiest, stretch hardest).
    const offsets = { review: -2.6, support: -2.9, focus: -2.2, stretch: -0.8 };
    const labels = { review: -1, support: -1.5, focus: 0, stretch: 1.5 };
    // Resumed: the answered part of the level stands; the rest is answered now,
    // in the same sitting's rows, after the break.
    const items = resume ? resume.rows.filter((r) => r.correct !== null) : [];
    const first = items.length;
    let missRun = 0;
    let prevWrong = false;
    let quit = false;
    let leaveAt = -1;
    if (ctx.firstOfSitting && rng.chance(P.leaveEarly)) leaveAt = first + 2 + rng.int(5);

    const page = pendingPage;
    for (let i = first; i < plan.length; i++) {
      const { skill, role } = plan[i];
      const kept = resume ? resume.rows[i] : null;
      const format = kept ? kept.format : rng.chance(0.7) ? 'multiple_choice' : 'typed';
      const label = kept ? kept.difficulty : clamp(Math.round(5 + labels[role] + 0.8 * rng.normal()), 1, 10);
      const base = kept ? { ...kept } : {
        // No track_id or grade_id: the app's practice rows carry their sitting (session_id), not their subject.
        user_id: userId, session_id: session.id, level: L, index: i,
        skill_id: skill, role, format, difficulty: label,
        prompt: wordsOf(12 + rng.int(18)), choices: format === 'multiple_choice' ? CHOICES : undefined,
        answer: 'x', confidence: null, coach_used: false, answer_changes: 0, error_tag: null,
      };
      if (quit || (leaveAt >= 0 && i >= leaveAt)) {
        // Left with questions unanswered: they exist, but have no answer.
        const row = kept || memoryDb.insert('items', { ...base, correct: null, ms: 0 });
        items.push(row);
        if (!kept) sessionItems.push(row);
        continue;
      }

      // The chance of being right, from ability, true difficulty and the
      // within-level effects the behavioural stats are about.
      const b = content + offsets[role] + 0.5 * rng.normal();
      let logit = theta - b;
      if (i < 3) logit += P.warmup;
      if (i >= plan.length / 2) logit += P.fatigue;
      if (prevWrong) logit += P.postError;
      if (i >= 2 && items[0].correct === false && items[1].correct === false) logit += P.momentum;
      if (role === 'review') logit += P.interleave;
      if (format === 'typed') logit += P.typed;
      if (TEXT_LOAD) logit += TEXT_LOAD * P.z('vocabulary_ceiling') * ((String(base.prompt || '').split(' ').length - 20.5) / 5.2);
      if (ctx.reentry) logit += P.reentry;
      if (page && (role === 'focus' || role === 'stretch')) {
        if (page.skimmed) logit -= 0.4;
        if (page.words > 2200) logit += P.intake;
        if (page.experiment) logit += (page.experiment.arm === 'high' ? 1 : -1) * 0.5 * EXP_EFFECT * P.z(page.experiment.stat);
      }
      const delayedExp = experimentsBySkill[skill];
      if (role === 'review' && delayedExp && simNow < delayedExp.until) {
        logit += (delayedExp.arm === 'high' ? 1 : -1) * 0.25 * EXP_EFFECT * P.z(delayedExp.stat);
      }
      const guess = format === 'multiple_choice' ? 0.25 : 0.03;
      let pKnow = sigmoid(logit);
      const mem = memory[skill];
      let recall = 1;
      if (mem && mem.last !== null) recall = trueRecall(mem, (simNow - mem.last) / 86400000);
      let p = recall * pKnow + (1 - recall) * guess;

      const expected = signals.expectedMs(base);
      const rushed = rng.chance(P.rushRate + (format === 'multiple_choice' ? P.mcGuessRate : 0)
        + (prevWrong ? P.frustRush : 0));
      let coach = false;
      let deliberate = false;
      let ms;
      if (rushed) {
        p = guess;
        ms = expected * rng.range(0.06, 0.28);
      } else {
        const stuck = pKnow * recall < 0.55 || prevWrong;
        coach = rng.chance(P.hintRate + (stuck ? P.helpRate * 0.5 : 0));
        if (coach) p += (1 - p) * 0.5;
        deliberate = rng.chance(P.delibRate);
        if (deliberate) p = sigmoid(Math.log(p / (1 - p)) + 0.7);
        ms = expected * P.timeMult * rng.logn(0.35) * (1 + 0.3 * (1 - p));
        if (deliberate) ms *= rng.range(2.6, 4);
        if (coach) ms += rng.range(15000, 45000);
      }
      const correct = rng.chance(p);

      let confidence = null;
      if (rng.chance(TAP_PICK === 'hard' ? Math.min(1, TAP_RATE * TAP_WEIGHTS[role] / tapMean(plan)) : TAP_RATE)) {
        const felt = P.calib * p + (1 - P.calib) * 0.65 + P.sureBias + 0.07 * rng.normal();
        confidence = felt >= 0.75 ? 'sure' : felt < 0.45 ? 'guess' : 'think';
      }
      let changes = 0;
      if (format === 'typed' && !rushed) changes = rng.chance(P.perfRate + (deliberate ? 0.3 : 0)) ? 3 : rng.int(2);

      let errorTag = null;
      if (!correct && !rushed) {
        const mis = misconception[skill] || (misconception[skill] = { has: rng.chance(0.6), seen: false });
        if (mis.has && rng.chance(mis.seen ? P.misRecur : 0.45)) {
          errorTag = `mis_${skill}`;
          mis.seen = true;
        } else if (rng.chance(0.3)) {
          errorTag = `slip_${rng.int(4)}`;
        }
      }

      advance(ms + 3000);
      const answer = {
        correct, ms: Math.round(ms), confidence, coach_used: coach, answer_changes: changes,
        error_tag: errorTag, user_answer: correct ? 'x' : 'y',
      };
      const row = kept ? memoryDb.update('items', kept.id, answer) : memoryDb.insert('items', { ...base, ...answer });
      items.push(row);
      if (!kept) sessionItems.push(row);
      if (role === 'review') out.reviewItems++;
      out.practiceMs += ms;
      const sc = skillCounts[skill] || (skillCounts[skill] = [0, 0]);
      sc[correct ? 0 : 1]++;
      if (mem && mem.last !== null && simNow - mem.last >= 86400000 && !rushed && !coach) {
        const spc = spacedCounts[skill] || (spacedCounts[skill] = [0, 0]);
        spc[correct ? 0 : 1]++;
      }
      for (const k of ['all', role]) if (out.answered[k]) { out.answered[k][0] += correct ? 1 : 0; out.answered[k][1] += 1; }

      // The order sessions.js uses: mastery first (it schedules the next review),
      // then the scorecard.
      mastery.recordAttempt({
        userId, skillId: skill, correct, difficulty: label, levelDifficulty: 5, latencyMs: Math.round(ms),
        errorTag, hintUsed: coach, itemId: row.id,
      });
      hooks.onAnswer(userId, row, { trackId: TRACK });

      // True memory: a hard-won recall strengthens it most; a miss weakens it.
      const m = memory[skill] || (memory[skill] = newMemory(P.halfLifeMult));
      trueUpdate(m, correct, recall, m.last === null ? 0 : (simNow - m.last) / 86400000);
      m.last = simNow;

      prevWrong = !correct;
      missRun = correct ? 0 : missRun + 1;
      if (missRun >= 3 && rng.chance(P.quitRun)) quit = true;
    }
    theta += P.learnRate;

    const answered = items.filter((it) => it.correct !== null);
    if (quit || leaveAt >= 0) {
      if (!quit) out.leftEarly++;
      // The level was not finished: no block result, and the sitting stays open.
      out.quits++;
      return { finished: false, accuracy: null, resume: { plan, rows: items } };
    }
    if (page) pendingPage = null;
    hooks.onBlockResolved(userId, { session, kind: 'practice', level: L, items, trackId: TRACK });
    const accuracy = answered.filter((it) => it.correct).length / Math.max(1, answered.length);
    if (page) {
      // The page judged by this level, for the holdout comparison's power (round
      // 4): raw accuracy, and accuracy against the ability model's expectation
      // (the app's own contexts), over the same answers.
      const res = signals.residuals(answered, irt.contextsFor(userId, answered));
      out.pages.push({ arm: page.arm, acc: accuracy, res: res.n ? res.r / res.n : null });
    }
    return { finished: true, accuracy };
  }

  function pageLevel(L) {
    const arm = personalize.armFor(userId, { trackId: TRACK, gradeId: GRADE, level: L });
    const tailored = arm.arm === 'tailored';
    let words = Math.round(rng.range(1200, 3200));
    if (tailored) {
      // A tailored page follows the length directive, so length taps close the loop.
      const side = directiveSides(scorecard.get(userId)).brevity_preference;
      if (side === 'high') words = Math.round(words * 0.6);
      if (side === 'low') words = Math.round(words * 1.35);
      if (arm.experiment && arm.experiment.stat === 'brevity_preference') words = Math.round(words * (arm.experiment.arm === 'high' ? 0.6 : 1.3));
    }
    const experiment = tailored ? arm.experiment : null;
    if (experiment) out.experiments++;
    if (!tailored) out.holdouts++;
    const skimmed = rng.chance(P.skimRate + 0.5 * P.rushRate);
    const fullMs = (words / P.wpm) * 60000 * rng.logn(0.25);
    const readMs = skimmed ? fullMs * rng.range(0.05, 0.18) : fullMs;
    advance(readMs);
    out.practiceMs += readMs;
    hooks.onBaseLessonFinished(userId, {
      trackId: TRACK, gradeId: GRADE, level: L, skillId: focusSkill(L), readMs, words,
      basis: tailored ? 'edited' : 'base', experiment, arm: arm.arm,
      scrollBacks: skimmed ? 0 : scrollRng.poisson(P.scrollBacks * Math.min(2, words / 2000)),
    });
    pendingPage = { level: L, words, skimmed, experiment, arm: arm.arm };
    if (experiment) experimentsBySkill[focusSkill(L)] = { stat: experiment.stat, arm: experiment.arm, until: simNow + 30 * 86400000 };
    return { finished: true, accuracy: null, words };
  }

  function feedback(L, result, isPage) {
    if (!rng.chance(FEEDBACK_RATE)) return false;
    const fb = {};
    if (rng.chance(0.8)) {
      const ratio = (isPage ? result.words / (1900 * P.lengthPref) : LEVEL_ITEMS / (10 * P.lengthPref)) * rng.logn(0.2);
      fb.length = ratio > 1.3 ? 'long' : ratio < 0.75 ? 'short' : 'right';
    }
    if (rng.chance(0.8)) {
      const fast = -0.7 * P.z('processing_velocity') + 0.4 * P.z('step_explicitness') - 0.4 * P.z('intake_baseline') + 0.45 * rng.normal();
      const slow = 0.7 * P.z('processing_velocity') - 0.5 * P.z('repetition_tolerance') + 0.45 * rng.normal();
      fb.pace = fast > 0.55 && fast >= slow ? 'fast' : slow > 0.55 ? 'slow' : 'right';
    }
    if (!isPage && result.accuracy !== null && rng.chance(0.8)) {
      const gap = result.accuracy - P.prefSuccess + 0.08 * rng.normal();
      fb.difficulty = gap > 0.12 ? 'easy' : gap < -0.18 ? 'hard' : 'right';
    }
    const chars = Math.round((5 + 120 * P.reflection) * rng.range(0.3, 1.3));
    const text = 'x'.repeat(chars);
    hooks.onFeedback(userId, { trackId: TRACK, gradeId: GRADE, level: L, ...fb, liked: text, disliked: '' });
    return true;
  }

  // Learning outcomes from the simulated learner's TRUE memory (round 4): how
  // much of what they practised they would still recall 7 and 30 days from now
  // with no more practice, and the practice time it took. Read only; nothing
  // here feeds back into the learner or the app.
  function outcomeNow() {
    const skills = Object.values(memory).filter((m) => m.last !== null);
    const at = (days) => mean(skills.map((m) => trueRecall(m, (simNow + days * 86400000 - m.last) / 86400000)));
    const r30 = skills.length ? at(30) : null;
    const hours = out.practiceMs / 3600000;
    return {
      skills: skills.length,
      retention7: skills.length ? at(7) : null,
      retention30: r30,
      practice_hours: hours,
      review_answers: out.reviewItems,
      // skills still recalled at 30 days per hour of practice
      retained30_per_hour: hours > 0 && r30 !== null ? (r30 * skills.length) / hours : null,
      median_half_life_days: median(skills.map((m) => m.H)),
      ...predictionNow(),
    };
  }

  // How well the app's forgetting model, as exported to review scheduling
  // (scorecard.forgettingCurve: the fitted population curve and this learner's
  // multiplier), predicts the learner's TRUE recall of each practised skill 7
  // and 30 days from now (round 5). Read only. Pooled errors per learner: the
  // sum of absolute errors, the signed sum (bias) and the pairs for r.
  function predictionNow() {
    if (!scorecard.forgettingCurve) return {};
    const rc = scorecard.forgettingCurve({ userId });
    const out7 = { ae: 0, e: 0, n: 0, pairs: [] };
    const out30 = { ae: 0, e: 0, n: 0, pairs: [] };
    const def30 = { ae: 0, e: 0, n: 0, pairs: [] }; // the default curve adaptation.js used before, for comparison
    const dc = forgettingModel.recallCurve(null, null);
    for (const [k, m] of Object.entries(memory)) {
      if (m.last === null) continue;
      const [nc, nw] = skillCounts[k] || [0, 0];
      const sp = spacedCounts[k] || [0, 0];
      for (const [days, acc] of [[7, out7], [30, out30]]) {
        const t = (simNow + days * 86400000 - m.last) / 86400000;
        const truth = trueRecall(m, t);
        const pred = forgettingModel.recallAt(rc, { days: t, right: nc, wrong: nw, spacedRight: sp[0], spacedWrong: sp[1], fresh: 1, guess: 0 });
        acc.ae += Math.abs(pred - truth);
        acc.e += pred - truth;
        acc.n += 1;
        acc.pairs.push([pred, truth]);
        if (days === 30) {
          const pd = forgettingModel.recallAt(dc, { days: t, right: nc, wrong: nw, fresh: 1, guess: 0 });
          def30.ae += Math.abs(pd - truth);
          def30.e += pd - truth;
          def30.n += 1;
          def30.pairs.push([pd, truth]);
        }
      }
    }
    return { pred7: out7, pred30: out30, pred30_default: def30, curve_fitted: rc.fitted };
  }

  function afterLevel(L, said) {
    done++;
    const changes = said || READS_STATS_WITHOUT_FEEDBACK ? modelRead(mode, scorecard.get(userId), T, llmRng, fixedDir) : [];
    if (changes.length) {
      learnerRecord.applyDebrief(userId, { conclusion: '', emotions: [], stat_changes: changes, facts: [], recommendation_votes: [] },
        { trackId: TRACK, gradeId: GRADE, level: L, mode: said ? 'feedback' : 'performance' });
    }
    const card = scorecard.get(userId);
    const sides = directiveSides(card);
    for (const s of STATS) {
      if (out.firstConfident[s.id] === undefined && scorecard.read(card, s.id, { trackId: TRACK }).confidence >= translate.MIN_CONF) out.firstConfident[s.id] = done;
      if (out.firstDirective[s.id] === undefined && sides[s.id]) out.firstDirective[s.id] = done;
    }
    if (CHECKPOINTS.includes(done)) {
      const est = {};
      // Where the learner truly stands against the course now (scaffolding_fade's truth).
      const rel = theta - (thetaHat0 + 0.02 * L);
      for (const s of STATS) {
        est[s.id] = scorecard.read(card, s.id, { trackId: TRACK });
        // The standing posterior (what the directive gate reads), for its own recovery r (round 4).
        const st = scorecard.standing ? scorecard.standing(card, s.id, { trackId: TRACK }) : null;
        if (st) est[s.id].standing = { z: Number(st.z.toFixed(4)), sd: Number(st.sd.toFixed(4)) };
      }
      out.snapshots[done] = {
        est,
        sides,
        tokens: promptSizes(userId, L),
        outcome: outcomeNow(),
        rel,
        ledger: JSON.parse(JSON.stringify(ledger)),
      };
    }
  }

  // Sittings, with the days between them set by how regular the learner is.
  let level = 1;
  let open = null; // a sitting left open on a level left partway
  while (done < MAX_LEVELS) {
    if (lastSessionEnd !== null) {
      const gapDays = Math.max(0.3, 1.4 * Math.exp(P.gapSd * rng.normal() - P.gapSd ** 2 / 2));
      simNow = lastSessionEnd + gapDays * 86400000;
    }
    const reentry = lastSessionEnd !== null && (simNow - lastSessionEnd) >= 3 * 86400000;
    let resume = null;
    let session;
    let sessionItems;
    if (open && !openRng.chance(ABANDON_SHARE)) {
      // Back to their level: the app resumes the open sitting.
      ({ session, sessionItems, resume } = open);
      out.resumed++;
    } else {
      if (open) {
        // Another level opened (in the app: routes/learn.js closes the open
        // sitting as abandoned, and tells the scorecard).
        memoryDb.update('sessions', open.session.id, { ended_at: new Date().toISOString(), abandoned: true });
        if (typeof hooks.onSessionAbandoned === 'function') {
          hooks.onSessionAbandoned(userId, memoryDb.byId('sessions', open.session.id), open.sessionItems);
        }
        out.abandoned++;
      }
      session = memoryDb.insert('sessions', {
        user_id: userId, track_id: TRACK, grade_id: GRADE, kind: 'lesson', started_at: new Date().toISOString(), levels: [],
      });
      sessionItems = [];
    }
    open = null;
    const planned = Math.min(6, 1 + rng.poisson(P.levelsPerSitting));
    let firstPractice = true;
    let leftOpen = null;
    for (let k = 0; k < planned && done < MAX_LEVELS; k++) {
      if (READING_TESTS > 0 && !readingDone.has(level) && (level - 1) % Math.max(1, Math.floor(MAX_LEVELS / READING_TESTS)) === 0 && (level - 1) / Math.max(1, Math.floor(MAX_LEVELS / READING_TESTS)) < READING_TESTS) {
        readingDone.add(level);
        scorecard.observe(userId, [{ stat: 'vocabulary_ceiling', value: clamp(T.vocabulary_ceiling + 10 * readingRng.normal(), 0, 100), weight: 4, test: true, note: 'reading test (sim knob)' }], { source: 'placement' });
      }
      const isPage = level % 3 === 1;
      let result;
      if (isPage) {
        result = pageLevel(level);
      } else {
        result = practiceLevel(level, session, sessionItems, { firstOfSitting: k === 0, reentry: reentry && firstPractice }, k === 0 ? resume : null);
        firstPractice = false;
      }
      if (!result.finished) { leftOpen = result.resume; break; }
      session.levels.push(level);
      const said = feedback(level, result, isPage);
      afterLevel(level, said);
      level++;
      advance(30000);
    }
    if (leftOpen) {
      // Left partway: the sitting stays open, unfinished, as in the app.
      open = { session, sessionItems, resume: leftOpen };
    } else {
      const answered = sessionItems.filter((i) => i.correct !== null);
      memoryDb.update('sessions', session.id, {
        ended_at: new Date().toISOString(),
        score: answered.length ? answered.filter((i) => i.correct).length / answered.length : 0,
        levels: session.levels,
      });
      hooks.onSessionFinished(userId, memoryDb.byId('sessions', session.id), sessionItems);
    }
    lastSessionEnd = simNow;
  }
  out.truth = T;
  if (DEBUG.length && !population) {
    const card = scorecard.get(userId);
    realWarn(`learner ${index}: ${DEBUG.map((id) => `${id} truth ${Math.round(T[id])} standing ${JSON.stringify(scorecard.standing ? scorecard.standing(card, id, { trackId: TRACK }) : null)} rec ${JSON.stringify(card.stats[id])}`).join(' | ')}`);
    realWarn(`  sides ${JSON.stringify(card.sides)}`);
    if (card.ability && card.ability.trend) realWarn(`  trend fit ${JSON.stringify(card.ability.trend.fit)} truth_mv ${Math.round(T.mastery_velocity)}`);
  }
  out.days = Math.round((simNow - START) / 86400000);
  return out;
}

// ── metrics ────────────────────────────────────────────────────────────────
const EDGE = translate.EDGE;
const MIN_CONF = translate.MIN_CONF;
const CONF_FOR_GATE_MASS = -3 * Math.log(1 - MIN_CONF / 100); // evidence mass the confidence gate needs

function pearson(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const mx = xs.reduce((a, v) => a + v, 0) / n;
  const my = ys.reduce((a, v) => a + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  if (sxx < 1e-9 || syy < 1e-6) return null;
  return sxy / Math.sqrt(sxx * syy);
}
const mean = (a) => (a.length ? a.reduce((x, v) => x + v, 0) / a.length : null);
const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};
const round = (v, d = 3) => (v === null || v === undefined || Number.isNaN(v) ? null : Number(v.toFixed(d)));

// ── what a directive is worth to learning (round 4) ───────────────────────
// Only one learner-by-teaching interaction has a replicated effect size: the
// expertise reversal effect. Tetzlaff, Simonsmeier, Peters & Brod (2025, Learning
// and Instruction 98, 102142; 60 experiments, 5,924 learners): novices learn
// more from high-assistance instruction (d = 0.505), learners with high prior
// knowledge more from low assistance (d = 0.428). So a prior-knowledge
// directive is valued in d: +0.505 for "assume no background" given to a
// learner truly at the low edge (30 or below), +0.428 for "skip the basics"
// given to one truly at the high edge (70 or above), scaled linearly in
// between (0 at 50), and the same amount NEGATIVE on the wrong side (assistance
// withheld from a novice costs what giving it would have gained). Every other
// stat's directive has no replicated matching effect (Pashler et al. 2008) and
// is counted, not valued. Experiment stats are valued with the sim's own arm
// model instead (0.5 x EXP_EFFECT x the learner's true z, in logits on the
// next level's main questions): what a page following that directive would do
// in this simulated world. Read only: nothing here changes a learner.
const ATI_D = {
  prior_knowledge: { low: 0.505, high: 0.428 },
  // Round 4: the same effect read against the course itself (full support for a
  // learner behind it, fade it for one ahead).
  scaffolding_fade: { low: 0.505, high: 0.428 },
};
function atiValue(statId, side, truth) {
  const d = ATI_D[statId];
  if (!d || !side) return 0;
  const g = clamp((truth - 50) / 20, -1, 1);
  const towardHigh = g >= 0 ? d.high * g : d.low * g; // value of the 'high' directive
  return side === 'high' ? towardHigh : -towardHigh;
}

/**
 * A stat's truth at a checkpoint: the fixed draw, except scaffolding_fade, whose
 * truth is the learner's standing against the course at that moment (round 4).
 */
function truthFns(runs, cp) {
  const rels = runs.map((r) => r.snapshots[cp] && r.snapshots[cp].rel).filter((v) => Number.isFinite(v));
  const m = rels.length ? rels.reduce((a, v) => a + v, 0) / rels.length : 0;
  const sd = rels.length > 2 ? Math.sqrt(rels.reduce((a, v) => a + (v - m) ** 2, 0) / (rels.length - 1)) : 1;
  return (run, id) => {
    if (id === 'scaffolding_fade' && run.snapshots[cp] && Number.isFinite(run.snapshots[cp].rel)) {
      return clamp(50 + POP_SD * (run.snapshots[cp].rel - m) / (sd || 1), 2, 98);
    }
    return run.truth[id];
  };
}

/** Per-stat and per-group numbers for one mode at one checkpoint. */
function summarize(runs, cp) {
  const truthOf = truthFns(runs, cp);
  const perStat = {};
  const dirLog = [];
  const falseList = []; // every false directive, for diagnosis
  // Recall, per learner: of the traits truly past an edge that the app's data
  // can show (a generative, alias or experiment truth model) and that have
  // directive text on that side, how many got that directive.
  const perLearner = runs.map(() => ({ extreme: 0, hit: 0, trueDirs: 0 }));
  let rightSide = 0;
  for (const s of STATS) {
    const measurable = ['generative', 'alias', 'experiment'].includes(TRUTH_MODEL[s.id].model);
    const t = [];
    const e = [];
    const em = [];  // the measured score, where the app keeps one (what directives are built from)
    const ts = [];  // truth and standing z, for learners with a standing
    const zs = [];
    const conf = [];
    let past = 0;
    let fired = 0;
    let falseDir = 0;
    let severeFalse = 0;
    let edgeRight = 0;
    let unmeasured = 0;
    let truthPast = 0;
    let truthPastFired = 0;
    for (const run of runs) {
      const snap = run.snapshots[cp];
      if (!snap) continue;
      const truth = truthOf(run, s.id);
      const r = snap.est[s.id];
      t.push(truth);
      e.push(r.score);
      const measured = r.measured !== undefined ? r.measured : r.score;
      em.push(measured);
      if (r.standing) { ts.push(truth); zs.push(r.standing.z); }
      conf.push(r.confidence);
      if (r.confidence >= MIN_CONF && Math.abs(measured - 50) >= EDGE) past++;
      const side = snap.sides[s.id];
      const truthSide = truth >= 50 + EDGE ? 'high' : truth <= 50 - EDGE ? 'low' : null;
      const canFire = truthSide && s.use.includes('L') && s.dir[truthSide === 'high' ? 1 : 0];
      if (canFire) {
        truthPast++;
        if (side === truthSide) truthPastFired++;
        if (measurable && snap) {
          const pl = perLearner[runs.indexOf(run)];
          pl.extreme++;
          if (side === truthSide) pl.hit++;
        }
      }
      if (side && side === truthSide) perLearner[runs.indexOf(run)].trueDirs++;
      if (side && ((side === 'high' && truth > 50) || (side === 'low' && truth < 50))) rightSide++;
      if (side) {
        fired++;
        const wrong = (side === 'high' && truth < 50) || (side === 'low' && truth > 50);
        if (wrong) falseDir++;
        if ((side === 'high' && truth <= 50 - EDGE) || (side === 'low' && truth >= 50 + EDGE)) severeFalse++;
        if (side === truthSide) edgeRight++;
        const led = snap.ledger[s.id] || {};
        const measured = (led.beh || 0) + (led.tap || 0) + (led.exp || 0);
        if (measured < CONF_FOR_GATE_MASS) unmeasured++;
        dirLog.push({ stat: s.id, wrong });
        if (wrong) falseList.push({ learner: runs.indexOf(run), stat: s.id, side, truth: Math.round(truth), measured: Math.round(r.measured !== undefined ? r.measured : r.score), confidence: r.confidence, se: r.se === undefined ? null : Math.round(r.se) });
      }
    }
    const n = t.length;
    const mae = mean(t.map((v, i) => Math.abs(v - e[i])));
    perStat[s.id] = {
      group: groupOf(s.id),
      truth_model: TRUTH_MODEL[s.id].model,
      mae: round(mae, 1),
      mae_if_always_50: round(mean(t.map((v) => Math.abs(v - 50))), 1),
      r: round(pearson(t, e), 2),
      r_measured: round(pearson(t, em), 2),
      r_standing: round(pearson(ts, zs), 2),
      with_standing: ts.length,
      mae_measured: round(mean(t.map((v, i) => Math.abs(v - em[i]))), 1),
      mean_confidence: round(mean(conf), 0),
      past_threshold: round(past / n, 3),
      directives: fired,
      false_directives: falseDir,
      severe_false_directives: severeFalse,
      correct_edge_directives: edgeRight,
      unmeasured_directives: unmeasured,
      recall: truthPast ? round(truthPastFired / truthPast, 3) : null,
      n,
    };
  }
  const nLearners = runs.filter((r) => r.snapshots[cp]).length;
  function agg(ids) {
    const rows = ids.map((id) => perStat[id]);
    const dirs = rows.reduce((a, r) => a + r.directives, 0);
    const falses = rows.reduce((a, r) => a + r.false_directives, 0);
    const rs = rows.map((r) => r.r).filter((v) => v !== null);
    const rms = rows.map((r) => r.r_measured).filter((v) => v !== null);
    return {
      stats: ids.length,
      mae: round(mean(rows.map((r) => r.mae)), 1),
      mae_if_always_50: round(mean(rows.map((r) => r.mae_if_always_50)), 1),
      mean_r: round(mean(rs), 2),
      stats_with_r: rs.length,
      stats_r_ge_0_7: rs.filter((v) => v >= 0.7).length,
      mean_r_measured: round(mean(rms), 2),
      mae_measured: round(mean(rows.map((r) => r.mae_measured)), 1),
      past_threshold: round(mean(rows.map((r) => r.past_threshold)), 3),
      directives_per_learner: round(dirs / nLearners, 2),
      false_directive_rate: dirs ? round(falses / dirs, 3) : null,
      false_directives_per_learner: round(falses / nLearners, 2),
      severe_false_per_learner: round(rows.reduce((a, r) => a + r.severe_false_directives, 0) / nLearners, 2),
      unmeasured_directive_share: dirs ? round(rows.reduce((a, r) => a + r.unmeasured_directives, 0) / dirs, 3) : null,
    };
  }
  const groups = {};
  for (const g of GROUPS) groups[g] = agg(STATS.filter((s) => groupOf(s.id) === g).map((s) => s.id));
  const overall = agg(STATS.map((s) => s.id));
  const tokenRows = runs.map((r) => r.snapshots[cp] && r.snapshots[cp].tokens).filter(Boolean);
  const tok = {};
  for (const k of Object.keys(tokenRows[0] || {})) tok[k] = round(mean(tokenRows.map((x) => x[k])), 0);
  const ledgerMean = {};
  for (const g of GROUPS) {
    const ids = STATS.filter((s) => groupOf(s.id) === g).map((s) => s.id);
    const sums = { beh: 0, tap: 0, exp: 0, quiz: 0, llm: 0 };
    for (const run of runs) {
      const led = run.snapshots[cp] ? run.snapshots[cp].ledger : {};
      for (const id of ids) for (const k of Object.keys(sums)) sums[k] += (led[id] && led[id][k]) || 0;
    }
    ledgerMean[g] = Object.fromEntries(Object.entries(sums).map(([k, v]) => [k, round(v / (nLearners * ids.length), 2)]));
  }
  const live = perLearner.filter((_, i) => runs[i].snapshots[cp]);
  const sumOf = (k) => live.reduce((a, p) => a + p[k], 0);
  overall.true_directives_per_learner = round(sumOf('trueDirs') / nLearners, 2);
  overall.right_side_directives_per_learner = round(rightSide / nLearners, 2);
  overall.recall_measurable = sumOf('extreme') ? round(sumOf('hit') / sumOf('extreme'), 3) : null;
  overall.extreme_measurable_traits_per_learner = round(sumOf('extreme') / nLearners, 2);
  overall.learners_with_a_true_directive = round(live.filter((p) => p.trueDirs > 0).length / nLearners, 3);
  overall.mean_learner_recall = round(mean(live.filter((p) => p.extreme > 0).map((p) => p.hit / p.extreme)), 3);
  // Learning value of the directives (round 4; see ATI_D above).
  const liveRuns = runs.filter((r) => r.snapshots[cp]);
  let atiSum = 0;
  let atiOracle = 0;
  let expSum = 0;
  let expOracle = 0;
  for (const run of liveRuns) {
    const sides = run.snapshots[cp].sides;
    for (const id of Object.keys(ATI_D)) {
      atiSum += atiValue(id, sides[id], truthOf(run, id));
      const t = truthOf(run, id);
      const best = t >= 50 + EDGE ? 'high' : t <= 50 - EDGE ? 'low' : null;
      atiOracle += atiValue(id, best, t);
    }
    for (const id of EXPERIMENT_STATS) {
      const z = (run.truth[id] - 50) / 50;
      const st = BY_ID[id];
      if (sides[id]) expSum += (sides[id] === 'high' ? 1 : -1) * 0.5 * EXP_EFFECT * z;
      const t = run.truth[id];
      const best = !st.use.includes('L') ? null : t >= 50 + EDGE && st.dir[1] ? 'high' : t <= 50 - EDGE && st.dir[0] ? 'low' : null;
      if (best) expOracle += (best === 'high' ? 1 : -1) * 0.5 * EXP_EFFECT * z;
    }
  }
  overall.expertise_value_d_per_learner = round(atiSum / nLearners, 4);
  overall.expertise_value_oracle_d_per_learner = round(atiOracle / nLearners, 4);
  overall.experiment_value_logits_per_learner = round(expSum / nLearners, 4);
  overall.experiment_value_oracle_logits_per_learner = round(expOracle / nLearners, 4);
  // Learning outcomes from true memory (round 4).
  const outs = liveRuns.map((r) => r.snapshots[cp].outcome).filter(Boolean);
  const om = (k) => round(mean(outs.map((o) => o[k]).filter((v) => v !== null && v !== undefined)), 3);
  overall.outcomes = {
    retention7: om('retention7'), retention30: om('retention30'), practice_hours: om('practice_hours'),
    review_answers: om('review_answers'), retained30_per_hour: om('retained30_per_hour'),
    median_half_life_days: om('median_half_life_days'), skills: om('skills'),
  };
  // The exported forgetting curve's predictions against true recall (round 5).
  for (const key of ['pred7', 'pred30', 'pred30_default']) {
    const ps = outs.map((o) => o[key]).filter((v) => v && v.n);
    const n = ps.reduce((a, v) => a + v.n, 0);
    if (!n) continue;
    const pairs = ps.flatMap((v) => v.pairs);
    overall.outcomes[key] = {
      mae: round(ps.reduce((a, v) => a + v.ae, 0) / n, 4),
      bias: round(ps.reduce((a, v) => a + v.e, 0) / n, 4),
      r: round(pearson(pairs.map((x) => x[0]), pairs.map((x) => x[1])), 3),
      fitted_share: round(outs.filter((o) => o.curve_fitted).length / Math.max(1, outs.length), 2),
    };
  }
  const kept = {};
  for (const [construct, id] of Object.entries(KEPT)) kept[construct] = { stat: id, group: groupOf(id), r: perStat[id].r, r_measured: perStat[id].r_measured, r_standing: perStat[id].r_standing, with_standing: perStat[id].with_standing, mae: perStat[id].mae, recall: perStat[id].recall };
  return { learners: nLearners, overall, groups, perStat, tokens: tok, evidence_weight_per_stat: ledgerMean, kept, false_list: falseList };
}

/**
 * How well the holdout comparison (scripts/scorecard-report.js) can answer "do
 * tailored pages teach better?" (round 4): the spread between pages of raw
 * next-level accuracy and of next-level accuracy against expectation, the pages
 * per arm each would need to detect a 5-point difference (two-sided 5%, 80%
 * power), and the tailored - holdout difference each measures here.
 */
function holdoutPower(runs) {
  const pages = runs.flatMap((r) => r.pages || []).filter((p) => p.arm === 'tailored' || p.arm === 'holdout');
  const withRes = pages.filter((p) => p.res !== null);
  const sdOf = (xs) => { const m = mean(xs); return xs.length > 1 ? Math.sqrt(xs.reduce((t, x) => t + (x - m) ** 2, 0) / (xs.length - 1)) : null; };
  const need = (sd) => (sd ? Math.ceil(2 * (1.96 + 0.84) ** 2 * sd * sd / 0.05 ** 2) : null);
  const diff = (key, list) => {
    const t = list.filter((p) => p.arm === 'tailored').map((p) => p[key]);
    const h = list.filter((p) => p.arm === 'holdout').map((p) => p[key]);
    if (t.length < 2 || h.length < 2) return null;
    const se = Math.sqrt(sdOf(t) ** 2 / t.length + sdOf(h) ** 2 / h.length);
    return { diff: round(mean(t) - mean(h), 4), se: round(se, 4), tailored: t.length, holdout: h.length };
  };
  const sdRaw = sdOf(withRes.map((p) => p.acc));
  const sdRes = sdOf(withRes.map((p) => p.res));
  return {
    pages: pages.length,
    pages_with_residual: withRes.length,
    sd_raw: round(sdRaw, 4),
    sd_residual: round(sdRes, 4),
    pages_per_arm_for_5pt_raw: need(sdRaw),
    pages_per_arm_for_5pt_residual: need(sdRes),
    tailored_minus_holdout_raw: diff('acc', withRes),
    tailored_minus_holdout_residual: diff('res', withRes),
  };
}

function timeToConfidence(runs) {
  const per = {};
  for (const s of STATS) {
    const conf = runs.map((r) => r.firstConfident[s.id]).filter((v) => v !== undefined);
    const dir = runs.map((r) => r.firstDirective[s.id]).filter((v) => v !== undefined);
    per[s.id] = {
      reached_confidence: round(conf.length / runs.length, 3),
      median_levels_to_confidence: median(conf),
      reached_directive: round(dir.length / runs.length, 3),
      median_levels_to_directive: median(dir),
    };
  }
  const groups = {};
  for (const g of GROUPS) {
    const ids = STATS.filter((s) => groupOf(s.id) === g).map((s) => s.id);
    groups[g] = {
      share_of_stats_ever_confident: round(mean(ids.map((id) => per[id].reached_confidence)), 3),
      median_levels_to_confidence: median(ids.map((id) => per[id].median_levels_to_confidence).filter((v) => v !== null)),
      share_of_stats_ever_directive: round(mean(ids.map((id) => per[id].reached_directive)), 3),
    };
  }
  return { per_stat: per, groups };
}

// ── run ────────────────────────────────────────────────────────────────────
const t0 = RealDate.now();
// The other learners first: their finished scorecards become the population
// every measured learner's priors and norms come from, as in the app. The
// population's cache is refreshed after each one (in the app it refreshes every
// ten minutes; the simulated clock restarts for every learner).
if (POPULATION > 0) {
  for (let i = 0; i < POPULATION; i++) {
    runLearner(i, 'off', { population: true });
    const card = col('scorecards').find((r) => r.user_id === 1000000 + i);
    if (card) popRows.scorecards.push({ ...JSON.parse(JSON.stringify(card)), id: 1000000 + i });
    for (const name of SHARED) if (store[name]) sharedSnapshot[name] = JSON.parse(JSON.stringify(store[name]));
    if (scorecard.refreshPopulation) scorecard.refreshPopulation();
  }
}
if (REVIEW_PICK === 'model') {
  simForgettingPop = forgettingModel.population(popRows.scorecards.map((c) => Object.values(c.memory || {}).flat()), START / 86400000 + 65);
}
const results = {};
const raw = {};
for (const mode of MODES) {
  const runs = [];
  for (let i = 0; i < LEARNERS; i++) if (!ONLY || ONLY.has(i)) runs.push(runLearner(i, mode));
  raw[mode] = runs;
  results[mode] = { checkpoints: {}, time_to_confidence: timeToConfidence(runs) };
  for (const cp of CHECKPOINTS) results[mode].checkpoints[cp] = summarize(runs, cp);
  // How much the headline numbers move between independent groups of learners:
  // a change smaller than this spread is not a change.
  const batches = 4;
  const spread = {};
  for (const cp of CHECKPOINTS) {
    const parts = Array.from({ length: batches }, (_, b) => summarize(runs.filter((_, i) => i % batches === b), cp).overall);
    const range = (k) => {
      const v = parts.map((p) => p[k]).filter((x) => x !== null);
      return v.length ? [Math.min(...v), Math.max(...v)] : null;
    };
    spread[cp] = { batches, false_directive_rate: range('false_directive_rate'), mean_r: range('mean_r'), directives_per_learner: range('directives_per_learner') };
  }
  results[mode].batch_spread = spread;
  results[mode].activity = {
    mean_days: round(mean(runs.map((r) => r.days)), 0),
    experiments_per_learner: round(mean(runs.map((r) => r.experiments)), 2),
    holdout_pages_per_learner: round(mean(runs.map((r) => r.holdouts)), 2),
    abandoned_levels_per_learner: round(mean(runs.map((r) => r.quits)), 2),
    review_items_per_learner: round(mean(runs.map((r) => r.reviewItems)), 1),
    accuracy: Object.fromEntries(['all', 'review', 'focus'].map((k) => [k, round(mean(runs.map((r) => r.answered[k][0] / Math.max(1, r.answered[k][1]))), 2)])),
    left_early_levels_per_learner: round(mean(runs.map((r) => r.leftEarly)), 2),
    holdout_power: holdoutPower(runs),
    resumed_sittings_per_learner: round(mean(runs.map((r) => r.resumed)), 2),
    abandoned_sittings_per_learner: round(mean(runs.map((r) => r.abandoned)), 2),
  };
  if (VERBOSE) realWarn(`mode ${mode}: ${LEARNERS} learners in ${((RealDate.now() - t0) / 1000).toFixed(1)}s`);
}
const seconds = (RealDate.now() - t0) / 1000;

// ── print ──────────────────────────────────────────────────────────────────
const pct = (v) => (v === null || v === undefined ? '  —  ' : `${(v * 100).toFixed(1)}%`.padStart(6));
const num = (v, w = 5) => (v === null || v === undefined ? '—'.padStart(w) : String(v).padStart(w));
const lines = [];
const say = (s = '') => lines.push(s);
say(`Scorecard recovery simulation: ${LEARNERS} learners x ${MODES.length} model-read modes, up to ${MAX_LEVELS} levels, seed ${SEED}, population ${POPULATION} (${seconds.toFixed(1)}s)`);
say(`Stat groups (research split): behavioural ${STATS.filter((s) => groupOf(s.id) === 'behavioural').length} (+brevity = ${SIGNAL_STATS.size} with a signals.js rule), experiment ${EXPERIMENT_STATS.length}, questionnaire-only ${STATS.filter((s) => groupOf(s.id) === 'questionnaire').length}, LLM-only ${STATS.filter((s) => groupOf(s.id) === 'llm-only').length}`);
say('');
say('OVERALL (all 100 stats)        levels   MAE  (vs 50) mean r  past-edge  dirs/learner  FALSE dir  false/lrn  LLM-only dirs/lrn  unmeasured  tokens/tailored level');
for (const mode of MODES) {
  for (const cp of CHECKPOINTS) {
    const c = results[mode].checkpoints[cp];
    const o = c.overall;
    say(`  ${mode.padEnd(28)} ${num(cp, 6)} ${num(o.mae, 5)} ${num(o.mae_if_always_50, 7)} ${num(o.mean_r, 6)}  ${pct(o.past_threshold)}  ${num(o.directives_per_learner, 12)}  ${pct(o.false_directive_rate)}  ${num(o.false_directives_per_learner, 9)}  ${num(c.groups['llm-only'].directives_per_learner, 17)}  ${pct(o.unmeasured_directive_share)}  ${num(c.tokens.per_tailored_level, 8)}`);
  }
}
say('');
say('RECALL (measurable traits truly past an edge)  levels  true dirs/lrn  right-side dirs/lrn  recall  mean learner recall  learners with >=1 true dir  extreme traits/lrn');
for (const mode of MODES) {
  for (const cp of CHECKPOINTS) {
    const o = results[mode].checkpoints[cp].overall;
    say(`  ${mode.padEnd(45)} ${num(cp, 4)}  ${num(o.true_directives_per_learner, 12)}  ${num(o.right_side_directives_per_learner, 19)}  ${pct(o.recall_measurable)}  ${pct(o.mean_learner_recall).padStart(19)}  ${pct(o.learners_with_a_true_directive).padStart(26)}  ${num(o.extreme_measurable_traits_per_learner, 18)}`);
  }
}
say('');
say('LEARNING OUTCOMES (true memory; round 4)  levels  recall at +7d  recall at +30d  practice h  review answers  skills recalled at 30d per practice hour  expertise value d/lrn (oracle)  experiment-stat value logits/lrn (oracle)');
for (const mode of MODES) {
  for (const cp of CHECKPOINTS) {
    const o = results[mode].checkpoints[cp].overall;
    const oc = o.outcomes;
    say(`  ${mode.padEnd(40)} ${num(cp, 4)}  ${num(oc.retention7, 12)}  ${num(oc.retention30, 14)}  ${num(oc.practice_hours, 10)}  ${num(oc.review_answers, 14)}  ${num(oc.retained30_per_hour, 40)}  ${num(o.expertise_value_d_per_learner, 7)} (${o.expertise_value_oracle_d_per_learner})  ${num(o.experiment_value_logits_per_learner, 7)} (${o.experiment_value_oracle_logits_per_learner})`);
  }
}
say('FORGETTING CURVE AS EXPORTED (scorecard.forgettingCurve; round 5): predicted vs true recall of practised skills  levels  +7d MAE / bias / r  +30d MAE / bias / r  share with a fitted curve');
for (const mode of MODES) {
  for (const cp of CHECKPOINTS) {
    const oc = results[mode].checkpoints[cp].overall.outcomes;
    const f = (x) => (x ? `${x.mae} / ${x.bias} / ${x.r}` : '—');
    say(`  ${mode.padEnd(40)} ${num(cp, 4)}  ${f(oc.pred7).padStart(22)}  ${f(oc.pred30).padStart(22)}  ${oc.pred30 ? oc.pred30.fitted_share : '—'}   default curve +30d: ${f(oc.pred30_default)}`);
  }
}
const lastCp = CHECKPOINTS[CHECKPOINTS.length - 1];
const rangeText = (r, asPct) => (r ? r.map((v) => (asPct ? `${(v * 100).toFixed(0)}%` : v)).join('–') : '—');
for (const mode of MODES) {
  const sp = results[mode].batch_spread[lastCp];
  say(`  ${mode} at ${lastCp} levels, range over ${sp.batches} learner batches: false dir ${rangeText(sp.false_directive_rate, true)}, mean r ${rangeText(sp.mean_r)}, dirs/learner ${rangeText(sp.directives_per_learner)}`);
}
say('');
say(`MOST FREQUENT DIRECTIVES at ${lastCp} levels (stat fired/learners, false)`);
for (const mode of MODES) {
  const per = results[mode].checkpoints[lastCp].perStat;
  const top = Object.entries(per).filter(([, r]) => r.directives > 0).sort((a, b) => b[1].directives - a[1].directives).slice(0, 7);
  say(`  ${mode.padEnd(11)} ${top.map(([id, r]) => `${id} ${r.directives}/${r.n} (${r.false_directives} false)`).join(', ') || 'none'}`);
}
say('');
say(`BY EVIDENCE SOURCE at ${lastCp} levels   MAE  mean r (n, >=.7)   past-edge  dirs/lrn  FALSE dir  confident ever  median lvls to 30%`);
for (const mode of MODES) {
  for (const g of GROUPS) {
    const a = results[mode].checkpoints[lastCp].groups[g];
    const tc = results[mode].time_to_confidence.groups[g];
    say(`  ${mode.padEnd(11)} ${g.padEnd(14)} ${num(a.mae, 5)}  ${num(a.mean_r, 5)} (${String(a.stats_with_r).padStart(2)}, ${String(a.stats_r_ge_0_7).padStart(2)})  ${pct(a.past_threshold)}  ${num(a.directives_per_learner, 8)}  ${pct(a.false_directive_rate)}  ${pct(tc.share_of_stats_ever_confident)}  ${num(tc.median_levels_to_confidence, 6)}`);
  }
}
say('');
say(`KEPT CONSTRUCTS (research 2.4), recovery r at ${lastCp} levels, by mode`);
say(`  ${'construct'.padEnd(18)} ${'stat'.padEnd(26)} ${MODES.map((m) => m.padStart(11)).join('')}`);
for (const construct of Object.keys(KEPT)) {
  say(`  ${construct.padEnd(18)} ${KEPT[construct].padEnd(26)} ${MODES.map((m) => num(results[m].checkpoints[lastCp].kept[construct].r, 11)).join('')}`);
}
say(`  (${MODES[0]}: r of the standing posterior the gate reads, learners with one, recall) ${Object.keys(KEPT).map((c) => { const k = results[MODES[0]].checkpoints[lastCp].kept[c]; return `${c} ${k.r_standing === null || k.r_standing === undefined ? '—' : k.r_standing}/${k.with_standing || 0}/${k.recall === null ? '—' : k.recall}`; }).join(', ')}`);
for (const mode of MODES) {
  const per = results[mode].checkpoints[lastCp].perStat;
  const worst = Object.entries(per).filter(([, r]) => r.false_directives > 0)
    .sort((a, b) => b[1].false_directives - a[1].false_directives).slice(0, 8);
  say('');
  say(`WORST FALSE DIRECTIVES, ${mode}, at ${lastCp} levels (stat: false of fired; truth model)`);
  if (!worst.length) say('  none');
  for (const [id, r] of worst) say(`  ${id.padEnd(28)} ${String(r.false_directives).padStart(4)} of ${String(r.directives).padEnd(4)} (${r.group}, truth: ${r.truth_model}; r ${r.r === null ? '—' : r.r})`);
}
say('');
const act = results[MODES[0]].activity;
say(`Activity per learner (${MODES[0]}): ${act.mean_days} days, ${act.experiments_per_learner} experiments, ${act.holdout_pages_per_learner} holdout pages, ${act.review_items_per_learner} review answers, ${act.abandoned_levels_per_learner} levels left partway (${act.left_early_levels_per_learner} left early, the rest quit after misses; the sitting was then resumed ${act.resumed_sittings_per_learner} and abandoned ${act.abandoned_sittings_per_learner} times); accuracy ${act.accuracy.all} (focus ${act.accuracy.focus}, review ${act.accuracy.review})`);
const hp = act.holdout_power;
if (hp && hp.sd_raw !== null) {
  const d = (x) => (x ? `${(x.diff * 100).toFixed(1)} +/- ${(1.96 * x.se * 100).toFixed(1)} points (${x.tailored} tailored, ${x.holdout} holdout pages)` : '—');
  say(`Holdout comparison (${MODES[0]}): spread between pages raw ${(hp.sd_raw * 100).toFixed(1)} points, against expectation ${(hp.sd_residual * 100).toFixed(1)}; pages per arm to see 5 points: raw ${hp.pages_per_arm_for_5pt_raw}, against expectation ${hp.pages_per_arm_for_5pt_residual}; tailored - holdout: raw ${d(hp.tailored_minus_holdout_raw)}, against expectation ${d(hp.tailored_minus_holdout_residual)}`);
}
const tk = results[MODES[0]].checkpoints[lastCp].tokens;
say(`Insertion contract (round 6): ${CONTRACT_CHECK.reads} reads of the card, ${CONTRACT_CHECK.mismatches} where contract.read's sides or shape differed from translate.directives`);
say(`Tokens at ${lastCp} levels (${MODES[0]}): brief ${tk.brief} (x2 calls), coach ${tk.coach}, after-level read stat guide ${tk.read_stat_guide} + system/rules ${tk.read_system_rules}; per tailored level ${tk.per_tailored_level}`);
if (hookFailures) say(`WARNING: ${hookFailures} scorecard hook calls failed inside the app's error guard`);
console.log(lines.join('\n'));

// ── write ──────────────────────────────────────────────────────────────────
if (WRITE) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const json = {
    generated: new RealDate().toISOString(),
    command: `node scripts/scorecard-recovery-sim.js ${argv.join(' ')}`.trim(),
    config: {
      learners: LEARNERS, max_levels: MAX_LEVELS, checkpoints: CHECKPOINTS, modes: MODES, seed: SEED, population: POPULATION,
      population_sd: POP_SD, experiment_effect_logits: EXP_EFFECT, self_report_r: SELF_REPORT_R,
      questionnaire_rate: QUIZ_RATE, feedback_rate: FEEDBACK_RATE, confidence_tap_rate: TAP_RATE,
      items_per_practice_level: LEVEL_ITEMS, lesson_page_every: 3, model_read_stats_per_level: LLM_STATS_PER_READ,
      directive_edge: EDGE, directive_min_confidence: MIN_CONF, max_directives: translate.MAX_DIRECTIVES,
      evidence_mass_for_gate: round(CONF_FOR_GATE_MASS, 2),
    },
    definitions: {
      false_directive: 'a lesson directive (translate.directives, use L) whose side contradicts the side of 50 the true value is on',
      severe_false_directive: 'a directive whose true value is past the OPPOSITE edge (e.g. "high" fired, truth <= 30)',
      unmeasured_directive: `a directive on a stat that received less behavioural + feedback-tap + experiment weight than the confidence gate needs (${round(CONF_FOR_GATE_MASS, 2)}); i.e. the questionnaire and the model read carried it`,
      past_threshold: `confidence >= ${MIN_CONF} and |score - 50| >= ${EDGE}`,
      recall: 'of learners whose true value is past an edge with directive text on that side, the share with that directive',
      mae_if_always_50: 'the error of a card that never moves: the bar a stat has to beat to have learned anything',
    },
    stat_groups: Object.fromEntries(GROUPS.map((g) => [g, STATS.filter((s) => groupOf(s.id) === g).map((s) => s.id)])),
    truth_model: TRUTH_MODEL,
    seconds: round(seconds, 1),
    hook_failures: hookFailures,
    results,
  };
  fs.writeFileSync(path.join(OUT_DIR, `${OUT_NAME}.json`), JSON.stringify(json, null, 1));
  const mdPath = path.join(OUT_DIR, 'BASELINE.md');
  if (OUT_NAME === 'baseline') fs.writeFileSync(mdPath, baselineMarkdown(json, lines));
  if (!QUICK && fs.existsSync(mdPath)) fs.writeFileSync(mdPath, withProgressRow(fs.readFileSync(mdPath, 'utf8'), json));
  console.log(`\nwrote ${path.relative(ROOT, path.join(OUT_DIR, `${OUT_NAME}.json`))}${QUICK ? '' : ' and the progress row in BASELINE.md'}`);
}

/**
 * One row per run name in BASELINE.md's progress table, replaced on a rerun,
 * so the table always reads as the history of the targets step by step.
 */
function withProgressRow(md, json) {
  const R = json.results;
  const at = (mode) => R[mode] && R[mode].checkpoints[lastCp];
  const pctS = (v) => (v === null || v === undefined ? '—' : `${(v * 100).toFixed(1)}%`);
  const keptOk = at('off') ? Object.values(at('off').kept).filter((v) => v.r !== null && v.r >= 0.7).length : null;
  const cells = [
    OUT_NAME,
    json.generated.slice(0, 10),
    MODES.map((m) => `${m} ${pctS(at(m).overall.false_directive_rate)}`).join(', '),
    MODES.map((m) => `${m} ${at(m).overall.false_directives_per_learner}`).join(', '),
    MODES.map((m) => `${m} ${at(m).groups['llm-only'].directives_per_learner}`).join(', '),
    at('off') ? `${keptOk}/${Object.keys(KEPT).length}` : '—',
    MODES.map((m) => `${m} ${at(m).overall.mean_r}`).join(', '),
    MODES.map((m) => `${m} ${at(m).overall.directives_per_learner}`).join(', '),
    at('off') ? `${at('off').tokens.per_tailored_level}${at('off').tokens.per_tailored_level_uncached !== undefined ? ` (${at('off').tokens.per_tailored_level_uncached} uncached)` : ''}` : '—',
    NOTE.replace(/\|/g, '/'),
  ];
  const row = `| ${cells.join(' | ')} |`;
  const header = '## Progress\n\nOne row per change, same seed and learners, at '
    + `${lastCp} levels. Targets: false directives ≤ 2%, LLM-only directives 0, kept constructs r ≥ 0.7 (all ${Object.keys(KEPT).length}).\n\n`
    + '| run | date | FALSE directive rate | false per learner | LLM-only directives per learner | kept r ≥ 0.7 (read off) | mean r | directives per learner | tokens per tailored level | change |\n'
    + '|---|---|---|---|---|---|---|---|---|---|\n';
  let out = md;
  if (!out.includes('## Progress')) out = `${out.trimEnd()}\n\n${header}`;
  const rows = out.split('\n');
  const i = rows.findIndex((l) => l.startsWith(`| ${OUT_NAME} |`));
  if (i >= 0) rows[i] = row;
  else {
    let last = rows.findIndex((l) => l.startsWith('| run |')) + 1; // the |---| line
    while (last + 1 < rows.length && rows[last + 1].startsWith('|')) last++;
    rows.splice(last + 1, 0, row);
  }
  return `${rows.join('\n').trimEnd()}\n`;
}

/** The short write-up: what the numbers mean, the baseline, and the bar to beat. */
function baselineMarkdown(json, printed) {
  const R = json.results;
  const m = (mode) => R[mode] && R[mode].checkpoints[lastCp];
  const off = m('off');
  const conf = m('confirming');
  const honest = m('honest');
  const pctS = (v) => (v === null || v === undefined ? '—' : `${(v * 100).toFixed(1)}%`);
  const byModel = {};
  for (const [id, tm] of Object.entries(TRUTH_MODEL)) (byModel[tm.model] = byModel[tm.model] || []).push(id);
  const out = [];
  out.push('# Scorecard recovery simulation: baseline');
  out.push('');
  out.push(`Generated ${json.generated.slice(0, 10)} by \`NODE_PATH=../node_modules node scripts/scorecard-recovery-sim.js\` `
    + `(${json.config.learners} synthetic learners per mode, ${json.config.max_levels} levels, seed ${json.config.seed}, ${json.seconds}s). `
    + 'Full numbers: `baseline.json` next to this file. This is the measuring stick for item 1 of the plan in '
    + '`curriculum-build/SCORECARD-RESEARCH-2026-10-22.md`; nothing in the app was changed to make it.');
  out.push('');
  out.push('## What it does');
  out.push('');
  out.push('Each synthetic learner has a known true value for every stat (population mean 50, SD 17, so about one learner in '
    + 'eight is past each directive edge). Where a stat means something the app\'s data could show, that value drives the '
    + 'learner\'s behaviour: answers from a Rasch model with noisy difficulty labels, forgetting by half-life on the real '
    + '`mastery.js` review schedule, rapid guesses, coach use, confidence taps, revisions, misconception tags, quitting, '
    + 'feedback taps, reading time and days between sittings. Lesson pages (every third level) get their holdout / '
    + 'experiment arm from the real `personalize.armFor`, and an experiment arm really changes the next level\'s accuracy '
    + `(up to ${json.config.experiment_effect_logits} logits between arms for an extreme learner). All of it goes through the `
    + 'app\'s own `scorecard/hooks.js`, `seedFromStyleQuiz` and `learner-record.applyDebrief`, against an in-memory database.');
  out.push('');
  out.push('The after-level model read is a stub in three modes: **off**; **honest** (reads 5 stats\' true values with noise '
    + 'and suggests the gap; an upper bound, since it assumes a model can perceive traits nothing in the level shows); '
    + '**confirming** (ignores the truth: two of its five suggestions per level go to a fixed set of eight "pet" stats per '
    + 'learner, the rest to stats the card already leans on, always pushing further the way the card leans — anchoring '
    + 'plus the "the lesson followed the directive and went fine" loop). Its suggestions go through the real one-point, '
    + 'big-move and hold rules.');
  out.push('');
  out.push('## What the numbers mean');
  out.push('');
  out.push('- **MAE**: mean |card score − true value| on the 0–100 scale. A card that never moves scores about 13.5 '
    + '("vs 50"); anything not clearly below that has learned nothing.');
  out.push('- **r**: correlation between card score and true value across learners. Scale-free; "—" means the stat never moved.');
  out.push(`- **past-edge**: share of (learner, stat) pairs at ≥${json.config.directive_min_confidence}% confidence and ≥${json.config.directive_edge} from 50.`);
  out.push('- **FALSE directive**: a directive a lesson writer actually receives (`translate.directives`, cap 22) whose side '
    + 'contradicts the truth (says "high" when the learner is below 50, or the reverse). This is the critical error: '
    + 'it makes a lesson worse for that learner on purpose.');
  out.push('- **unmeasured**: directives on stats whose behavioural + feedback-tap + experiment evidence is below what the '
    + 'confidence gate needs, so the questionnaire and/or the model read carried them over the gate.');
  out.push('- **tokens**: characters ÷ 4 of what the scorecard adds per tailored level: the brief section twice (layout and '
    + 'fill calls) plus the after-level read\'s 100-stat guide and its system prompt.');
  out.push('');
  out.push('## Baseline');
  out.push('');
  out.push('```');
  out.push(...printed);
  out.push('```');
  out.push('');
  out.push('## What it exposes');
  out.push('');
  if (off) {
    const g = off.groups;
    out.push(`- **With no model read at all**, the scorecard still issues ${off.overall.directives_per_learner} directives per learner `
      + `at ${lastCp} levels, and ${pctS(off.overall.false_directive_rate)} of them contradict the truth `
      + `(${off.overall.false_directives_per_learner} per learner). Behavioural stats: ${pctS(g.behavioural.false_directive_rate)} false; `
      + `experiment stats reach a directive for ${pctS(g.experiment.past_threshold)} of pairs.`);
  }
  if (conf) {
    out.push(`- **A self-confirming model read** gives ${conf.overall.directives_per_learner} directives per learner, `
      + `${pctS(conf.overall.false_directive_rate)} false, and ${conf.groups['llm-only'].directives_per_learner} of them on LLM-only stats `
      + `(which have no measured evidence at all; ${pctS(conf.groups['llm-only'].false_directive_rate)} of those are false).`);
  }
  if (honest) {
    const tc = R.honest.time_to_confidence.groups['llm-only'];
    out.push(`- **An honest read that sees the truth** recovers LLM-only stats well in ranking (mean r ${honest.groups['llm-only'].mean_r}) `
      + `but, under the one-point rule, only ${pctS(tc.share_of_stats_ever_confident)} of them ever reach the confidence gate in ${lastCp} levels. `
      + 'So the read\'s rules cap the damage a biased model does only by also capping what a good one could add; and nothing '
      + 'checks which of the two the model is.');
  }
  if (off) {
    const per = Object.entries(off.perStat);
    const n = off.learners;
    const oneSided = per.filter(([, p]) => p.directives >= n / 2).sort((a, b) => b[1].directives - a[1].directives);
    if (oneSided.length) {
      out.push(`- **One-sided signals fire for almost everyone.** ${oneSided.map(([id, p]) => `${id} ${p.directives}/${n} learners (${p.false_directives} false)`).join('; ')}. `
        + 'They only ever emit one value, so they record "has this ever happened", and they account for nearly all false directives with the read off.');
    }
    const confidentWrong = per.filter(([, p]) => p.mean_confidence >= 50 && p.mae >= p.mae_if_always_50 && p.truth_model !== 'none')
      .sort((a, b) => (b[1].mae - b[1].mae_if_always_50) - (a[1].mae - a[1].mae_if_always_50));
    if (confidentWrong.length) {
      out.push(`- **Confident but no better than never moving** (mean confidence ≥ 50%, MAE ≥ the always-50 card): `
        + `${confidentWrong.map(([id, p]) => `${id} (${p.mean_confidence}% sure, MAE ${p.mae} vs ${p.mae_if_always_50}, r ${p.r})`).join('; ')}. Confidence measures how much evidence arrived, not whether it measures the trait.`);
    }
    const gated = per.filter(([, p]) => p.r !== null && p.r >= 0.7 && p.past_threshold <= 0.1);
    if (gated.length) {
      out.push(`- **Well recovered but almost never acted on** (r ≥ 0.7, past the edge for ≤ 10% of learners): `
        + `${gated.map(([id, p]) => `${id} (r ${p.r}, ${p.mean_confidence}% sure, recall ${p.recall === null ? '—' : pctS(p.recall)})`).join('; ')}. `
        + 'prior_knowledge in particular has one observation (placement, weight 1 = 28% confidence) and never passes the 30% gate.');
    }
    const ex = off.evidence_weight_per_stat.experiment;
    out.push(`- **Experiments are too weak to act.** ${R.off.activity.experiments_per_learner} experiments per learner in ${lastCp} levels, `
      + `spread over ${EXPERIMENT_STATS.length} stats: about ${ex.exp} experiment weight per stat. Experiment-stat mean r ${off.groups.experiment.mean_r}, `
      + `past the edge for ${pctS(off.groups.experiment.past_threshold)} of pairs, although the simulated arm effects are real (up to `
      + `${json.config.experiment_effect_logits} logits).`);
    const keptLow = Object.entries(off.kept).filter(([, v]) => v.r === null || v.r < 0.7);
    out.push(`- **Kept constructs below r 0.7 with the read off**: ${keptLow.map(([k, v]) => `${k} (${v.stat}, ${v.r === null ? 'never moves' : v.r})`).join(', ')}.`);
    out.push(`- **Tokens.** ${off.tokens.per_tailored_level} scorecard tokens per tailored level with the read off; `
      + `${off.tokens.read_stat_guide + off.tokens.read_system_rules} of them (${pctS((off.tokens.read_stat_guide + off.tokens.read_system_rules) / off.tokens.per_tailored_level)}) are the after-level read's stat guide and rules, which are the same size whatever the card says. `
      + `The brief grows with directives (${off.tokens.brief} tokens off, ${conf ? conf.tokens.brief : '—'} with the confirming read).`);
  }
  out.push('- Per-stat detail (r, recall, false directives, evidence weight by source, time to confidence) is in `baseline.json`.');
  out.push('');
  out.push('## Stats the sim cannot give a generative meaning');
  out.push('');
  out.push('Said plainly rather than invented. These have a true value, but nothing the simulated learner does depends on it:');
  out.push('');
  out.push(`- **No channel in the app\'s data (${(byModel.none || []).length})**: ${(byModel.none || []).join(', ')}. Only the honest model stub sees them.`);
  out.push(`- **Self-report only (${(byModel['self-report'] || []).length})**: ${(byModel['self-report'] || []).join(', ')}: the questionnaire answer (r = ${json.config.self_report_r}) and the model read.`);
  out.push(`- **Dead-wired (${(byModel['dead-wired'] || []).length})**: ${(byModel['dead-wired'] || []).map((id) => `${id} (${TRUTH_MODEL[id].note})`).join('; ')}.`);
  out.push(`- **Aliases (${(byModel.alias || []).length})**: ${(byModel.alias || []).map((id) => `${id} = ${TRUTH_MODEL[id].note}`).join('; ')}. The scorecard stores them as separate stats; the sim treats them as one latent each.`);
  out.push('');
  out.push('What the sim does **not** model: whether following a directive improves learning (no outcome model for tailoring '
    + 'other than the experiment arms and page length); AI-lesson (`lessons`) levels, checkpoints, games and block levels; '
    + 'the population prior (each learner runs alone, so priors stay at 50); facts and recommendations reviews in the '
    + 'learner record (the review is a second model call); the questionnaire\'s real question wording.');
  out.push('');
  out.push('## Targets future changes must beat');
  out.push('');
  out.push('Run the same command (same seed) after each change and compare:');
  out.push('');
  out.push(`1. **False directives ≤ 2%** of directives produced, at every checkpoint and in every model-read mode (baseline at ${lastCp} levels: `
    + `${MODES.map((mm) => `${mm} ${pctS(R[mm].checkpoints[lastCp].overall.false_directive_rate)}`).join(', ')}).`);
  out.push(`2. **No LLM-only stat ever produces a directive**: 0 per learner in every mode (baseline: `
    + `${MODES.map((mm) => `${mm} ${R[mm].checkpoints[lastCp].groups['llm-only'].directives_per_learner}`).join(', ')}).`);
  out.push('3. **Recovery r ≥ 0.7 on the kept constructs** (research section 2.4) at 100 levels with the model read off. '
    + `Baseline: ${off ? Object.entries(off.kept).map(([k, v]) => `${k} ${v.r === null ? '—' : v.r}`).join(', ') : 'n/a'}.`);
  out.push('4. Also watch: unmeasured-directive share → 0; experiment-stat recall above 0 for real effects; '
    + `scorecard tokens per tailored level from ${off ? off.tokens.per_tailored_level : '—'} toward the research estimate of 400–800.`);
  out.push('');
  return out.join('\n');
}
