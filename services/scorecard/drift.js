/**
 * The forgetting / drift layer (docs/SCORECARD-90.md section 11.7): a learner's true value on a measure moves, so old evidence about it is worth
 * less, and how much less depends on the measure. A state-like measure (emotional engagement, boredom) is stale in weeks; an ability (working memory,
 * vocabulary) in many months.
 *
 * The right-rate fade the toy found best (scripts/scorecard-drift-sim.js) is a Kalman fade whose rate matches the real one-year stability s of the
 * measure: each day the true value keeps r = s^(1/365) of itself, the variance of a stale estimate grows by 1 - r^2, and a new reading moves it more.
 * This module turns that into the exponential half-life the scorecard already uses, one per measure: the half-life of evidence mass at the mass cap
 * (the Kalman halving time of a precision of MAX_MASS + 1 = 9 against a prior of 1, which is where r^2 = 0.9 per halving):
 *
 *     halfLife = 365 ln(0.9) / (2 ln s)   days,  clamped to 21 .. 365
 *
 * s = 0.81 gives the old fixed 90 days, so the default is close to today's for a typical measure, faster for a state-like one and slower for an
 * ability. Applied in services/scorecard/index.js (ageFactor, and the fade of a rate's counts) and indicators.js (addUnits).
 *
 * THE STABILITIES ARE ASSUMED, not measured: set by measure category with a few named overrides, from the usual finding that personality-like traits
 * are stable over a year at 0.7 to 0.9 and mood-like states much less (figures from memory, not re-checked), to be replaced by the app's own
 * re-measurements. What is NOT done here: the mean of a stale estimate is not pulled back toward the population (variance inflation only), and the
 * taps' and side counts' own fades keep 90 days.
 *
 * SCORECARD_DRIFT=off restores today's behaviour exactly (every half-life is the caller's fallback). Default on.
 */
'use strict';
const { STATS } = require('./stats');

const isOn = () => String(process.env.SCORECARD_DRIFT || 'on').toLowerCase() !== 'off';

// One-year stability by category (ASSUMED).
const BY_CATEGORY = {
  intake: 0.9, reasoning: 0.85, pacing: 0.8, engagement: 0.7, memory: 0.85,
  resilience: 0.8, metacognition: 0.8, representation: 0.85, motivation: 0.7, transfer: 0.85,
};
// Named overrides (ASSUMED): states that change within weeks, and abilities that hold for years.
const OVERRIDES = {
  emotional_engagement: 0.5, intrinsic_motivation: 0.5, boredom_susceptibility: 0.5, fatigue_curve: 0.5, evaluation_anxiety: 0.6,
  working_memory_span: 0.92, vocabulary_ceiling: 0.92, intake_baseline: 0.9,
};
const CATEGORY_OF = Object.fromEntries(STATS.map((s) => [s.id, s.category]));

const MIN_DAYS = 21;
const MAX_DAYS = 365;
const DEFAULT_STABILITY = 0.81;

function stabilityOf(statId) {
  if (OVERRIDES[statId] !== undefined) return OVERRIDES[statId];
  const c = CATEGORY_OF[statId];
  return c && BY_CATEGORY[c] !== undefined ? BY_CATEGORY[c] : DEFAULT_STABILITY;
}

/** The evidence half-life of a stability s, in days (see the header). */
function halfLifeFromStability(s) {
  const d = (365 * Math.log(0.9)) / (2 * Math.log(s));
  return Math.min(MAX_DAYS, Math.max(MIN_DAYS, d));
}

/** The half-life in days for a measure: its own with drift on, else `fallback` (today's constant). An unknown measure gets the fallback. */
function halfLife(statId, fallback) {
  if (!isOn() || !statId || CATEGORY_OF[statId] === undefined) return fallback;
  // A fallback other than the default 90 (the SCORECARD_HALF_LIFE_DAYS knob) scales every measure's half-life the same way.
  return halfLifeFromStability(stabilityOf(statId)) * (fallback / 90);
}

/** An indicator's half-life: the geometric mean over the measures it reads (so it fades like the measures it informs). */
function halfLifeOfMeasures(statIds, fallback) {
  if (!isOn() || !statIds || !statIds.length) return fallback;
  const logs = statIds.map((s) => Math.log(halfLife(s, fallback)));
  return Math.exp(logs.reduce((a, b) => a + b, 0) / logs.length);
}

module.exports = { isOn, stabilityOf, halfLife, halfLifeOfMeasures, halfLifeFromStability, BY_CATEGORY, OVERRIDES, MIN_DAYS, MAX_DAYS };
