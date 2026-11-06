/**
 * Speed levers (docs/SPEED-4X.md): spend fewer of the learner's minutes on what they already have, without losing material or retention.
 * Every lever is OFF unless its switch says on, and off is today's behaviour exactly. The decision rules live here so the app and the simulation
 * (scripts/faster-by-goal-sim.js --speed-arms=...) run the same code.
 *
 *   SPEED_TESTOUT=on       retrieval first: a lesson level opens on its check questions; a learner whose answers show the skill is known skips the page
 *                          and is TOLD so, with the page one tap away (never silent loss of material).
 *   SPEED_SHORT_LESSON=on  after a miss, only the part of the page that this miss calls for; the whole page stays one tap away, a second miss adds the next part.
 *   SPEED_MASTERY_STOP=on  a practice block ends once the tracker below is confident the skill is understood; the rest of its focus items are set aside, marked, unscored.
 *   SPEED_REVIEW_TARGET=on a level review is asked only when predicted recall (understanding x memory) falls under the learner's chosen target (plus a margin) on the days
 *                          the goal covers; overshoot is not reviewed. Reads the goal through services/retention-goal.js.
 *   SPEED_IMPLICIT=on      a right answer on a skill also counts as a partial review of its stated prerequisite (needs a prerequisite in the course's data).
 *   SPEED_ALL=off          every lever off.
 *
 * The tracker is a small Bayes filter over a skill's understanding k: each answer is right with chance k + (1 - k) x guess, then k rises as the learning model says.
 * Its constants are ASSUMED (the audited v2 simulation's), not fitted to real learners. docs/SPEED-4X.md shows what happens when they are wrong.
 */

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

const SWITCH = { testout: 'SPEED_TESTOUT', short: 'SPEED_SHORT_LESSON', stop: 'SPEED_MASTERY_STOP', target: 'SPEED_REVIEW_TARGET', implicit: 'SPEED_IMPLICIT' };
const DEFAULT = { testout: 'off', short: 'off', stop: 'off', target: 'off', implicit: 'off' };

/** Is this lever on? SPEED_ALL=off beats everything. A base-arm learner (efficiency.forLearner) reads every lever off, as the older levers do. */
function enabled(lever) {
  const efficiency = require('./efficiency'); // eslint-disable-line global-require
  if (efficiency.isSuspended && efficiency.isSuspended()) return false;
  if (String(process.env.SPEED_ALL || '').toLowerCase() === 'off') return false;
  return String(process.env[SWITCH[lever]] || DEFAULT[lever]).toLowerCase() === 'on';
}

const PARAMS = {
  understood: 0.85,   // k at or above this counts as understood (the same bar as the simulation's and docs/FASTER-BY-GOAL.md)
  conf: Number(process.env.SPEED_STOP_CONF || 0.9),   // chance that k >= understood, needed to stop asking or skip the page
  minAnswers: Number(process.env.SPEED_STOP_MIN || 2),
  maxAnswers: 25,
  guess: 0.25,
  gain: 0.2,          // share of the gap to full understanding closed by a right answer with feedback (v2 LM.a); half that after a wrong one
  pageGain: 0.5,      // share of the gap closed by a whole page read (v2 LM.page)
  safety: Number(process.env.SPEED_SAFETY || 1),      // the tracker's belief in how much is learned is scaled by this (under 1 stops later)
  chunk: Number(process.env.SPEED_CHUNK || 0.4),      // share of the page shown after a miss
  priorStrength: 3,
  priorMean: 0.35,
  reviewMargin: Number(process.env.SPEED_REVIEW_MARGIN || 0.05), // above the learner's target, because the memory estimate is noisy
  defaultTarget: 0.7,
};

// ---------- the tracker ----------
const GRID = 41;
const gridK = Array.from({ length: GRID }, (_, i) => i / (GRID - 1));

/** A new tracker. priorMean: the expected understanding before any answer (priorFromHistory gives a learner's own). lr: the learner's learning-rate multiplier. */
function newTracker({ priorMean = PARAMS.priorMean, lr = 1, gainMult = 1 } = {}) {
  const m = clamp(priorMean, 0.03, 0.9); const a = m * PARAMS.priorStrength; const b = (1 - m) * PARAMS.priorStrength;
  const p = gridK.map((k) => (clamp(k, 0.005, 0.995) ** (a - 1)) * ((1 - clamp(k, 0.005, 0.995)) ** (b - 1)));
  const s = p.reduce((x, y) => x + y, 0);
  return { p: p.map((x) => x / s), lr, gainMult, n: 0, right: 0, misses: 0, streak: 0 };
}
/** Moves the belief as understanding rises by share `g` of its gap. */
function shift(tr, g) {
  const out = new Array(GRID).fill(0);
  for (let i = 0; i < GRID; i++) {
    const k = gridK[i]; const x = (k + (1 - k) * g) * (GRID - 1); const lo = Math.min(GRID - 1, Math.floor(x)); const hi = Math.min(GRID - 1, lo + 1); const w = x - lo;
    out[lo] += tr.p[i] * (1 - w); out[hi] += tr.p[i] * w;
  }
  tr.p = out;
}
/** An answer. `recall`: the learner's predicted memory for it at this moment (1 during first learning). */
function observe(tr, right, { guess = PARAMS.guess, recall = 1 } = {}) {
  let s = 0;
  for (let i = 0; i < GRID; i++) {
    const c = gridK[i] * recall; const pr = c + (1 - c) * guess;
    tr.p[i] *= right ? pr : 1 - pr; s += tr.p[i];
  }
  if (s > 0) tr.p = tr.p.map((x) => x / s);
  tr.n++;
  if (right) { tr.right++; tr.streak++; } else { tr.misses++; tr.streak = 0; }
  shift(tr, clamp(PARAMS.gain * tr.lr * tr.gainMult * (right ? 1 : 0.5), 0, 0.95));
  return tr;
}
/** Part of the page was read (share f of it). */
function taught(tr, f) { shift(tr, clamp(PARAMS.pageGain * tr.lr * tr.gainMult * f, 0, 0.95)); return tr; }
const pKnown = (tr, at = PARAMS.understood) => tr.p.reduce((s, x, i) => s + (gridK[i] >= at - 1e-9 ? x : 0), 0);
const kMean = (tr) => tr.p.reduce((s, x, i) => s + x * gridK[i], 0);

/** Has the check shown enough? Used for both the skip and the practice stop. */
function shown(tr, { conf = PARAMS.conf, minAnswers = PARAMS.minAnswers } = {}) { return tr.n >= minAnswers && pKnown(tr) >= conf; }

/** A learner's own prior for the next skill, from how their first answers on earlier skills went (right share, net of guessing). */
function priorFromHistory(firstRight, firstN, guess = PARAMS.guess) {
  const shrunk = (firstRight + (PARAMS.priorMean + (1 - PARAMS.priorMean) * guess) * 6) / (firstN + 6);
  return clamp((shrunk - guess) / (1 - guess), 0.03, 0.9);
}

/** Replays a skill's answers, oldest first: [{ correct, guess?, recall? }]. */
function trackerFromAnswers(answers, opts = {}) {
  const tr = newTracker(opts);
  for (const a of answers) observe(tr, !!a.correct, { guess: a.guess === undefined ? PARAMS.guess : a.guess, recall: a.recall === undefined ? 1 : a.recall });
  return tr;
}

// ---------- first pass: what happens next on this skill ----------
/**
 * Retrieval first. state: { pageLeft: share of the page not yet shown }.
 * Returns 'stop' (shown), 'teach' (show the next part of the page: the last answer was a miss) or 'ask'.
 */
function nextStep(tr, state, { conf = PARAMS.conf, minAnswers = PARAMS.minAnswers, lastRight = null, at = PARAMS.understood } = {}) {
  if (tr.n >= minAnswers && pKnown(tr, at) >= conf) return 'stop';
  if (tr.n >= PARAMS.maxAnswers) return 'stop';
  if (lastRight === false && state.pageLeft > 1e-9) return 'teach';
  return 'ask';
}

// ---------- reviews ----------
/**
 * Does this skill need a review now? k: estimated understanding; recallNow / recallAtEnd: predicted memory now and on the goal's last day (null when no last day is known).
 * target: the learner's own target. mode 'through' keeps predicted recall at the target on every day of the goal; 'end' asks only in the final window before the last day.
 * A skill that holds the target to the last day is never asked (the overshoot removed), and after the last day nothing is asked.
 */
function reviewDue({ k, recallNow, recallAtEnd = null, daysToEnd = null, target = PARAMS.defaultTarget, margin = PARAMS.reviewMargin, mode = 'through', window = 5, endMargin = null }) {
  const floor = clamp(target + margin, 0, 0.98);
  const endFloor = clamp(target + (endMargin === null || endMargin === undefined ? margin : endMargin), 0, 0.98);
  if (daysToEnd !== null && daysToEnd < 0) return false;
  if (recallAtEnd !== null && k * recallAtEnd >= endFloor) return false;
  if (mode === 'end' && daysToEnd !== null) return daysToEnd <= window;
  return k * recallNow < floor;
}
/** Days the final window needs: two full passes at this learner's own pace, at least 3. */
function endWindow(skills, minutesPerAnswer, minutesPerDay) { return Math.max(3, Math.ceil((2 * skills * minutesPerAnswer) / Math.max(1, minutesPerDay)) + 1); }

// ---------- implicit review ----------
/** A right answer on a skill reviews its prerequisite in part: the memory gain is scaled by this (shown both ways in docs/SPEED-4X.md). */
const IMPLICIT_CREDIT = Number(process.env.SPEED_IMPLICIT_CREDIT || 0.5);

module.exports = {
  SWITCH, DEFAULT, PARAMS, IMPLICIT_CREDIT, enabled,
  newTracker, observe, taught, pKnown, kMean, shown, priorFromHistory, trackerFromAnswers, nextStep,
  reviewDue, endWindow,
};
