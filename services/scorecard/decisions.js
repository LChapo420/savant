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

module.exports = { EDGES, POP_SD, enabled, decide, drivers, pWrong, expectedGain, decisionImportance, decisionScore, cdf };
