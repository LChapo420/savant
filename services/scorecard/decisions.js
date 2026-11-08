/**
 * Content decisions behind each scorecard measure, and how well they are made (docs/SCORE-95.md). Pure functions, no I/O.
 *
 * Every measure steers content through its two sides (STATS[id].low / .high and the directive text): the lesson writer is told to lean to the low side when the learner reads low, to the
 * high side when high, and to leave the default alone in between. A DECISION is therefore one of -1 (low side), 0 (default), +1 (high side), taken from the number with two edges:
 *   hard  30 / 70  the card's own directive edge (the app acts only on a confident read past it)
 *   soft  40 / 60  a smaller lean, for measures where a gentle tilt is cheap to be wrong about
 * Decision accuracy = how often the decision made from the ESTIMATED number equals the decision from the TRUE number. It can sit well above raw trait accuracy (most learners are in the
 * middle, where small errors do not change what is done), and it is reported next to it, never instead of it. A wrong-way decision (low where true is high, or the reverse) is counted apart.
 *
 * SCORECARD_DECISION_VOI=1 (default off): the daily-check planner weighs each measure by how likely its decision is to be wrong right now times the measure's impact (decisionImportance),
 * so the next probe goes where a decision is most in doubt, not where the number is merely uncertain. With the switch off nothing here is called from the app.
 */
'use strict';
const { STATS } = require('./stats');
const { INDEX } = require('./ceilings');

const EDGES = { hard: { lo: 30, hi: 70 }, soft: { lo: 40, hi: 60 } };
const POP_SD = 17; // services/onboarding/model.js POP_SD, kept equal by scripts/score-95-test.js
const BY_ID = Object.fromEntries(STATS.map((s) => [s.id, s]));

const enabled = () => process.env.SCORECARD_DECISION_VOI === '1';

/** -1, 0 or +1. */
const decide = (value, edges = EDGES.hard) => (value <= edges.lo ? -1 : value >= edges.hi ? 1 : 0);

/** What a measure steers: its sides and category, the structure knob when it has one. */
function drivers(id) {
  const s = BY_ID[id]; if (!s) return null;
  return { id, category: s.category, impact: s.impact, class: INDEX[id] || null, low: s.low, high: s.high, whatItDoes: s.dir };
}

// Standard normal CDF (Abramowitz-Stegun 7.1.26 for erf).
function cdf(z) {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const e = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z / 2);
  return z >= 0 ? 0.5 * (1 + e) : 0.5 * (1 - e);
}

/** P(decision from the true value differs from the decision made from `mean`), true ~ N(mean, sd) in points. */
function pWrong(mean, sd, edges = EDGES.hard) {
  const d = decide(mean, edges);
  const s = Math.max(sd, 1e-6);
  const pLow = cdf((edges.lo - mean) / s); const pHigh = 1 - cdf((edges.hi - mean) / s);
  const pMid = Math.max(0, 1 - pLow - pHigh);
  return 1 - (d < 0 ? pLow : d > 0 ? pHigh : pMid);
}

// 7-point Gauss-Hermite (probabilists' weights) for the preposterior average.
const GH = [[-3.7504, 0.000548], [-2.3668, 0.030757], [-1.1544, 0.240123], [0, 0.457143], [1.1544, 0.240123], [2.3668, 0.030757], [3.7504, 0.000548]];

/**
 * Expected drop in P(wrong decision) from one more reading that takes the posterior sd from `sd` to `sdAfter` (points). The posterior mean after the reading moves by a draw of
 * sd sqrt(sd^2 - sdAfter^2); the decision is retaken from the new mean and judged against the new, tighter posterior.
 */
function expectedGain(mean, sd, sdAfter, edges = EDGES.hard) {
  if (!(sdAfter < sd)) return 0;
  const shift = Math.sqrt(sd * sd - sdAfter * sdAfter);
  let after = 0; let w = 0;
  for (const [x, wt] of GH) { after += wt * pWrong(mean + shift * x, sdAfter, edges); w += wt; }
  return Math.max(0, pWrong(mean, sd, edges) - after / w);
}

/** Weight for the planner: 1 when the decision is safe, up to 1 + 2 x impact/3 when it is a coin flip. impact is the measure's STATS impact (0-3). */
function decisionImportance(id, mean, sd) {
  const s = BY_ID[id]; const imp = s ? s.impact : 1;
  return 1 + 2 * (imp / 3) * 2 * Math.min(0.5, pWrong(mean, sd, EDGES.soft) * 0.5 + pWrong(mean, sd, EDGES.hard) * 0.5);
}

/** Decision accuracy over { est, truth } pairs: right, wrong-way, the share of clearly high or low learners whose side was caught, and, of the leans actually made, how many were right (leanPrecision) or at least on the right side of the soft edge (leanSafe). */
function decisionScore(pairs, edges = EDGES.hard) {
  let right = 0; let wrongWay = 0; let clear = 0; let caught = 0; let leans = 0; let leanRight = 0; let leanSafe = 0;
  for (const { est, truth } of pairs) {
    const a = decide(est, edges); const b = decide(truth, edges);
    if (a !== 0) { leans += 1; if (a === b) leanRight += 1; if (a * decide(truth, EDGES.soft) === 1) leanSafe += 1; }
    if (a === b) right += 1; else if (a * b === -1) wrongWay += 1;
    if (b !== 0) { clear += 1; if (a === b) caught += 1; }
  }
  const n = pairs.length || 1;
  return { n: pairs.length, accuracy: 100 * right / n, wrongWay: 100 * wrongWay / n, clear, caught: clear ? 100 * caught / clear : null, leans, leanPrecision: leans ? 100 * leanRight / leans : null, leanSafe: leans ? 100 * leanSafe / leans : null };
}

// ── score-month (docs/SCORE-MONTH.md part 4): the new stats, wired to the content knob each one moves. New exports only; nothing above changed. ──
/** stat -> what it modifies and the rule. A table for the profile screen, the docs and the tests; modificationPlan below is the code that applies it. */
const MODIFIERS = {
  reading_wpm: { moves: 'passage length and chunk size', rule: "words per chunk = about 75 seconds of reading at the learner's speed, 80-400 words; fast readers get no re-read prompts" },
  prior_knowledge: { moves: 'which objectives are taught in full', rule: 'known: one check item and skip; shaky: a short refresher; new/unsure: full lesson, unsure ones pre-checked first' },
  decay_rate: { moves: 'review interval', rule: 'interval multiplier = 2^m (m = learner half-life multiplier in doublings), clamped 0.5-2.5' },
  horizon: { moves: 'target retention and review depth', rule: 'a horizon of 3 days or fewer: compress to the horizon; 14 or fewer: stop reviewing after it; longer: full spacing' },
  time_of_day: { moves: 'when to nudge, not what to teach', rule: 'suggest the confident best part of day; no change when the gap is under 4 points' },
  session_dropoff: { moves: 'session length and break prompts', rule: 'cap a sitting at the minutes before accuracy fell 8+ points; a break prompt at 80% of that' },
  error_types: { moves: 'remediation kind', rule: 'misconception share 40%+: refutation with a contrasting case; slip share 40%+: a check-before-submit habit, not a re-teach' },
  confidence_calibration: { moves: 'confidence prompts', rule: 'overconfident (bias +0.12): predict-then-check on hard items; underconfident (-0.12): show the evidence of past successes' },
  device: { moves: 'item format', rule: 'phone or tablet main: tap items over typed ones, shorter prompts' },
  schedule: { moves: 'coverage priority', rule: 'a test in 3 days or fewer (cram): cover what the test needs, then retrieval only; 4-14 days: build with weekly review; else steady' },
  span_and_speed: { moves: 'step size and pacing', rule: 'low working memory (below 40): one new idea at a time; low processing speed (below 35): no timed items' },
  confirmed_prefs: { moves: 'tone, framing, humour', rule: "the learner's stated side wins over inference; benefit decisions still go to the outcome-tested bandit" },
  bandit: { moves: 'explanation style, example type, worked-vs-problem, spacing gap, chunk size, modality', rule: "the option the learner's own results favour (confident), else the next test assignment" },
};

const clampN = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
/**
 * The content plan from a learner's stats (all optional; each missing stat leaves its knob at the default). stats: { readingWpm, spanPoints, speedPoints, prior: { objective: 'known'|'shaky'|'new'|'unsure' },
 * decayM, horizonDays, timeOfDay, dropoff, errors, calibration: { bias }, device, schedule, confirmed: { measureId: points }, bandit: { decisionId: { option, confident } }, assignment }.
 * Returns { passage, session, objectives, review, remediation, confidence, nudge, input, tone, choices, notes } with one reason line per change in notes. Pure.
 */
function modificationPlan(stats = {}) {
  const st = stats; const notes = []; const plan = { passage: {}, session: {}, objectives: {}, review: {}, remediation: null, confidence: null, nudge: null, input: {}, tone: {}, choices: {}, notes };
  if (Number.isFinite(st.readingWpm)) {
    const w = clampN(Math.round((st.readingWpm * 1.25) / 10) * 10, 80, 400); plan.passage = { wordsPerChunk: w, maxPassageWords: w * 4, rereadPrompts: st.readingWpm < 260 };
    notes.push(`reading ${Math.round(st.readingWpm)} wpm: chunks of about ${w} words`);
  }
  if (st.prior) {
    const o = { skip: [], refresh: [], full: [], pretest: [] };
    for (const [k, v] of Object.entries(st.prior)) { if (v === 'known') o.skip.push(k); else if (v === 'shaky') o.refresh.push(k); else { o.full.push(k); if (v === 'unsure') o.pretest.push(k); } }
    plan.objectives = o; notes.push(`objectives: ${o.skip.length} known, ${o.refresh.length} shaky, ${o.full.length} full`);
  }
  const mult = Number.isFinite(st.decayM) ? clampN(2 ** st.decayM, 0.5, 2.5) : 1; plan.review.intervalMultiplier = mult;
  if (Number.isFinite(st.decayM)) notes.push(`forgetting: intervals x${mult.toFixed(2)}`);
  if (Number.isFinite(st.horizonDays)) { plan.review.horizonDays = st.horizonDays; plan.review.compress = st.horizonDays <= 3; plan.review.stopAfterHorizon = st.horizonDays <= 14; notes.push(`horizon ${st.horizonDays} days`); }
  if (st.dropoff && st.dropoff.minutes) { plan.session = { maxMinutes: st.dropoff.minutes, breakPromptAtMin: Math.round(st.dropoff.minutes * 0.8) }; notes.push(`attention holds about ${st.dropoff.minutes} min`); }
  if (st.errors && st.errors.confident) {
    plan.remediation = st.errors.misconceptionShare >= 0.4 ? 'refutation_contrast' : st.errors.slipShare >= 0.4 ? 'check_before_submit' : 'standard';
    notes.push(`errors: ${Math.round(100 * st.errors.misconceptionShare)}% misconception, ${Math.round(100 * st.errors.slipShare)}% slip`);
  }
  if (st.calibration && Number.isFinite(st.calibration.bias)) { plan.confidence = st.calibration.bias >= 0.12 ? 'predict_then_check' : st.calibration.bias <= -0.12 ? 'show_past_successes' : 'none'; if (plan.confidence !== 'none') notes.push(`confidence bias ${st.calibration.bias.toFixed(2)}`); }
  if (st.timeOfDay && st.timeOfDay.confident) { plan.nudge = st.timeOfDay.best; notes.push(`best part of day: ${st.timeOfDay.best}`); }
  if (st.device && st.device.mobileMain) plan.input = { preferTap: true, shortPrompts: true };
  if (st.schedule) { plan.review.mode = st.schedule.mode; if (st.schedule.mode === 'cram') plan.review.coverageFirst = true; }
  if (Number.isFinite(st.spanPoints) && st.spanPoints < 40) { plan.passage.oneIdeaPerStep = true; notes.push('low working-memory span: one new idea per step'); }
  if (Number.isFinite(st.speedPoints) && st.speedPoints < 35) { plan.input.noTimedItems = true; notes.push('low processing speed: no timed items'); }
  if (st.confirmed) for (const [id, v] of Object.entries(st.confirmed)) { if (v <= EDGES.hard.lo) plan.tone[id] = -1; else if (v >= EDGES.hard.hi) plan.tone[id] = 1; }
  if (st.bandit) for (const [id, b] of Object.entries(st.bandit)) if (b && b.confident) plan.choices[id] = b.option;
  if (st.assignment) for (const [id, o] of Object.entries(st.assignment)) if (!(id in plan.choices)) plan.choices[id] = o;
  return plan;
}
/** The plan as lines for a writer prompt (short; nothing for a default plan). */
function planLines(plan) {
  const L = []; const p = plan || {};
  if (p.passage && p.passage.wordsPerChunk) L.push(`Passages: about ${p.passage.wordsPerChunk} words per chunk${p.passage.oneIdeaPerStep ? ', one new idea per step' : ''}.`);
  if (p.objectives && p.objectives.skip && p.objectives.skip.length) L.push(`Already known (one check item, then skip): ${p.objectives.skip.slice(0, 6).join(', ')}.`);
  if (p.objectives && p.objectives.refresh && p.objectives.refresh.length) L.push(`Short refresher only: ${p.objectives.refresh.slice(0, 6).join(', ')}.`);
  if (p.session && p.session.maxMinutes) L.push(`Plan sittings of at most ${p.session.maxMinutes} minutes.`);
  if (p.remediation === 'refutation_contrast') L.push('When they err, state the wrong idea and refute it with a contrasting case.');
  if (p.remediation === 'check_before_submit') L.push('Their errors are mostly slips: prompt a quick check before they answer, do not re-teach.');
  if (p.confidence === 'predict_then_check') L.push('They run overconfident: ask for a confidence guess before hard items, then show the result.');
  if (p.confidence === 'show_past_successes') L.push('They run underconfident: point to evidence of what they got right.');
  if (p.input && p.input.noTimedItems) L.push('No timed items.');
  if (p.choices) for (const [id, o] of Object.entries(p.choices)) L.push(`${id.replace(/_/g, ' ')}: ${String(o).replace(/_/g, ' ')}.`);
  return L;
}

module.exports = { EDGES, POP_SD, enabled, decide, drivers, pWrong, expectedGain, decisionImportance, decisionScore, cdf, MODIFIERS, modificationPlan, planLines };
