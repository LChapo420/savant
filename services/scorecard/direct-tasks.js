/**
 * Direct measurement (docs/SCORE-MONTH.md part 1): short in-flow tasks that read a trait where the trait IS something a task can measure, instead of inferring it from habits.
 * Pure functions, no I/O. Everything here is behind SCORECARD_MONTH=1 (default off) at the wiring layer (month-stats.js); the module itself has no switch so tests can call it.
 *
 * Tasks (marginal minutes of study time per sitting, in brackets):
 *   reading_speed  words per minute on the lesson text the learner is reading anyway (0): robust median over passages, outliers and skim-throughs dropped.
 *   speed_task     processing speed: median reaction time over a block of trivial choices (1.5).
 *   span_task      working-memory span: forward/backward span (2.5; 2 for children, shorter lists).
 *   precheck       adaptive pre-check per objective or ability: Rasch posterior on a grid, next item picked near the current mean (0.33 an item).
 *   calibration    confidence rating after answers the learner gives anyway (0.05 an answer): bias and resolution of confidence against correctness.
 *   decay          per-learner forgetting from their own spaced reviews (0): half-life multiplier on the population curve, grid posterior (FSRS-style per-learner parameter; the
 *                  population curve and the review scheduler already live in forgetting.js, this reads the learner's multiplier with its own sd).
 *
 * Each reading is a value in scorecard points (0-100, population mean 50, sd 17) with a NOMINAL noise model: trial noise (sd of one sitting's number), day noise (a bad day, shared
 * within a day) and task bias (task-specific, persistent: device lag, a strategy). `combine` weighs readings by inverse variance and shrinks to the population, returning { est, sd }.
 * The task-bias term does not average away with more sittings; that is why direct measurement has a ceiling below 100 (reported in the sim, not hidden).
 *
 * Budget: at most 5% of the learner's study time in month 1 (BUDGET_SHARE), at most DAILY_CAP_MIN minutes of tasks in one day, at most MAX_BLOCKS_PER_DAY separate blocks (never a
 * test wall). Children get shorter versions (AGE.child) and the same share; learners under 13 without parent consent get none (consent flag).
 */
'use strict';

const BUDGET_SHARE = 0.05;
const DAILY_CAP_MIN = 3;
const MAX_BLOCKS_PER_DAY = 2;
const POP = { mean: 50, sd: 17 };

/** Age-appropriate parameters: shorter lists, fewer items, a lower minimum words count for reading, bigger trial noise. */
const AGE = {
  child: { band: 'child', spanLen: [2, 6], speedTrials: 20, precheckItems: 6, readMinWords: 60, noise: 1.35 },
  teen: { band: 'teen', spanLen: [3, 9], speedTrials: 30, precheckItems: 8, readMinWords: 120, noise: 1.1 },
  adult: { band: 'adult', spanLen: [3, 10], speedTrials: 40, precheckItems: 8, readMinWords: 150, noise: 1 },
};
const ageBand = (age) => (age != null && age <= 11 ? 'child' : age != null && age <= 17 ? 'teen' : 'adult');

/** Nominal noise (points) per task: trial, day, bias. Cited anchors: operation-span retest .83 (Unsworth 2005, in ceilings.js), RT medians retest ~.8-.9 within days (Hedge 2018 range 0-.82 for difference scores; a plain median RT is not a difference score). Our judgement, replaced by a refit on real sittings. */
const TASKS = {
  speed_task: { measures: ['processing_velocity'], cost: 1.5, trial: 7, day: 6, bias: 5 },
  span_task: { measures: ['working_memory_span'], cost: 2.5, trial: 9, day: 5, bias: 5 },
  precheck: { measures: ['prior_knowledge', 'vocabulary_ceiling', 'notation_comfort'], cost: 8 * 0.33, trial: null, day: 2, bias: 3 },
  calibration: { measures: ['confidence_calibration'], cost: 0, perAnswer: 0.05, trial: 6, day: 2, bias: 4 },
  decay: { measures: ['decay_rate', 'retention_index'], cost: 0, trial: null, day: 0, bias: 6 },
  reading_speed: { measures: ['reading_wpm'], cost: 0, trial: 5, day: 4, bias: 4 },
};

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const median = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };

/** Population norms for reading speed (words/min, log scale). Anchors: adult silent non-fiction about 238 wpm (Brysbaert 2019), grade bands from oral-fluency norms (Hasbrouck & Tindal); both quoted from memory, not re-read this round. */
const WPM_NORM = { child: { mu: Math.log(120), sd: 0.3 }, teen: { mu: Math.log(190), sd: 0.28 }, adult: { mu: Math.log(238), sd: 0.25 } };
/** words per minute -> scorecard points (log-normal norm, 0.5 sd = 8.5 points). */
const wpmToPoints = (wpm, band = 'adult') => { const n = WPM_NORM[band] || WPM_NORM.adult; return clamp(POP.mean + POP.sd * (Math.log(Math.max(wpm, 1)) - n.mu) / n.sd, 0, 100); };

/**
 * Reading speed from passages: [{ words, ms }]. Passages under the age's minimum, faster than 1000 wpm (skim) or slower than 25 wpm (walked away) are dropped; the learner's number is the
 * median wpm of what is left. Returns null with fewer than 2 usable passages.
 */
function readingSpeed(passages, band = 'adult') {
  const minW = (AGE[band] || AGE.adult).readMinWords;
  const w = (passages || []).filter((p) => p && p.words >= minW && p.ms > 0).map((p) => p.words / (p.ms / 60000)).filter((x) => x >= 25 && x <= 1000);
  if (w.length < 2) return null;
  const wpm = median(w);
  return { wpm, points: wpmToPoints(wpm, band), n: w.length };
}

// ── adaptive pre-check: Rasch on a grid ───────────────────────────────────
const GRID = Array.from({ length: 81 }, (_, i) => -4 + i * 0.1);
const pRasch = (theta, b, guess = 0.2, slip = 0.03) => guess + (1 - guess - slip) / (1 + Math.exp(-(theta - b)));
function newPosterior(priorSd = 1.4) { const w = GRID.map((g) => Math.exp(-0.5 * (g / priorSd) ** 2)); const s = w.reduce((a, b) => a + b, 0); return w.map((x) => x / s); }
function moments(post) { let m = 0; for (let i = 0; i < GRID.length; i++) m += post[i] * GRID[i]; let v = 0; for (let i = 0; i < GRID.length; i++) v += post[i] * (GRID[i] - m) ** 2; return { mean: m, sd: Math.sqrt(v) }; }
/** Update with one answer on an item of difficulty b (logits). guess is 1/options for multiple choice, 0.02 typed. */
function updatePosterior(post, correct, b, guess = 0.2) {
  const next = post.map((p, i) => { const q = pRasch(GRID[i], b, guess); return p * (correct ? q : 1 - q); });
  const s = next.reduce((a, c) => a + c, 0) || 1; return next.map((x) => x / s);
}
/** Difficulty of the next item: the posterior mean nudged up a little, where an item is most informative for a guess-free reading. */
const nextDifficulty = (post) => moments(post).mean + 0.2;
/** Posterior on the logit scale -> scorecard points (1 logit = 12 points, centred on 50). */
const LOGIT_POINTS = 12;
const thetaToPoints = (t) => clamp(POP.mean + LOGIT_POINTS * t, 0, 100);
function precheckReading(post) { const m = moments(post); return { est: thetaToPoints(m.mean), sd: LOGIT_POINTS * m.sd }; }

/**
 * Per-objective prior knowledge: given { objective: posterior }, which objectives are KNOWN (skip or compress), SHAKY (short refresh), NEW (teach in full), by the posterior mean and its sd.
 * An objective with sd above 1.1 logits is UNSURE: the lesson treats it as new and the next pre-check goes there first.
 */
function objectiveStates(byObjective, { known = 0.9, shaky = -0.3 } = {}) {
  const out = {};
  for (const [o, post] of Object.entries(byObjective || {})) {
    const m = moments(post);
    out[o] = m.sd > 1.1 ? 'unsure' : m.mean >= known ? 'known' : m.mean >= shaky ? 'shaky' : 'new';
  }
  return out;
}

// ── combining readings ────────────────────────────────────────────────────
/**
 * readings: [{ task, value, day, n }]; value in points. Variance of the average of k sittings over d distinct days, with the nominal noise model:
 *   var = trial^2 * noiseMult / k + day^2 / d + bias^2     (bias does not shrink)
 * Then the precision-weighted mean with the population (mean 50, sd 17) as a prior. Returns { est, sd, reliability, k, days }. reliability = 1 - sd^2/POP.sd^2 (of the posterior, nominal model).
 */
function combine(readings, task, { band = 'adult', priorMean = POP.mean, priorSd = POP.sd } = {}) {
  const t = TASKS[task]; if (!t || !readings || !readings.length) return { est: priorMean, sd: priorSd, reliability: 0, k: 0, days: 0 };
  const k = readings.length; const days = new Set(readings.map((r) => r.day)).size || 1;
  const mult = (AGE[band] || AGE.adult).noise;
  const mean = readings.reduce((a, r) => a + r.value, 0) / k;
  const v = ((t.trial || 0) * mult) ** 2 / k + (t.day * mult) ** 2 / days + t.bias ** 2;
  const w1 = 1 / v; const w0 = 1 / priorSd ** 2;
  const est = (w1 * mean + w0 * priorMean) / (w1 + w0); const sd = Math.sqrt(1 / (w1 + w0));
  return { est, sd, reliability: clamp(1 - (sd / POP.sd) ** 2, 0, 1), k, days };
}
/** Combine a direct reading with another estimate (behaviour read-out or card) by inverse variance. */
function fuse(a, b) { const wa = 1 / a.sd ** 2; const wb = 1 / b.sd ** 2; return { est: (wa * a.est + wb * b.est) / (wa + wb), sd: Math.sqrt(1 / (wa + wb)) }; }

// ── confidence calibration from ratings ───────────────────────────────────
/** answers: [{ correct: 0|1, conf: 0..1 }]. bias = mean confidence - accuracy (positive = overconfident); resolution = how much higher confidence is on right answers (slope). Needs 40 answers. */
function calibrationReading(answers) {
  const a = (answers || []).filter((x) => x && Number.isFinite(x.conf));
  if (a.length < 40) return null;
  const n = a.length; const acc = a.reduce((s, x) => s + (x.correct ? 1 : 0), 0) / n; const conf = a.reduce((s, x) => s + x.conf, 0) / n;
  const hi = a.filter((x) => x.correct); const lo = a.filter((x) => !x.correct);
  const resolution = hi.length && lo.length ? hi.reduce((s, x) => s + x.conf, 0) / hi.length - lo.reduce((s, x) => s + x.conf, 0) / lo.length : 0;
  const brier = a.reduce((s, x) => s + (x.conf - (x.correct ? 1 : 0)) ** 2, 0) / n;
  return { n, bias: conf - acc, resolution, brier };
}
/** Calibration index in points: 50 = on target, +17 per 0.17 of UNDER-confidence side... high = well calibrated: 100 - |bias| scaled (0.25 bias = 0 points of calibration headroom). Documented, not validated. */
const biasToPoints = (bias) => clamp(POP.mean - (bias / 0.25) * 50, 0, 100);

// ── per-learner forgetting from own reviews ───────────────────────────────
const DECAY_GRID = Array.from({ length: 61 }, (_, i) => -3 + i * 0.1); // doublings of half-life
/**
 * Reviews: [{ correct, dt (days since last practice), p0 (expected fresh success, default 0.9), g (guess floor, default .2), h0 (population half-life in days at this skill's state, default 6) }].
 * Posterior on the learner's half-life multiplier m (doublings): P(correct) = g + (p0-g) 2^(-dt/(h0 2^m)). Prior N(0, 1). Returns { m, sd, points, n }.
 */
function decayReading(reviews, { priorSd = 1 } = {}) {
  const r = (reviews || []).filter((x) => x && x.dt > 0); if (r.length < 8) return null;
  const lp = DECAY_GRID.map((m) => {
    let s = -0.5 * (m / priorSd) ** 2;
    for (const x of r) { const p0 = x.p0 || 0.9; const g = x.g == null ? 0.2 : x.g; const h = (x.h0 || 6) * 2 ** m; const p = clamp(g + (p0 - g) * 2 ** (-x.dt / h), 0.01, 0.99); s += Math.log(x.correct ? p : 1 - p); }
    return s;
  });
  const mx = Math.max(...lp); const w = lp.map((x) => Math.exp(x - mx)); const z = w.reduce((a, b) => a + b, 0);
  let m = 0; for (let i = 0; i < w.length; i++) m += (w[i] / z) * DECAY_GRID[i];
  let v = 0; for (let i = 0; i < w.length; i++) v += (w[i] / z) * (DECAY_GRID[i] - m) ** 2;
  const sd = Math.sqrt(v);
  // slower forgetting (positive m) = higher retention measures; 1 doubling = 21 points (pop sd of m taken as 0.8 doublings).
  return { m, sd, points: clamp(POP.mean + (POP.sd / 0.8) * m, 0, 100), pointsSd: (POP.sd / 0.8) * sd, n: r.length };
}

// ── the month plan ────────────────────────────────────────────────────────
/**
 * Which task blocks to run on a given day. state = { studyMinutesMonth (expected or so far), spentMin, perTask: { task: { k, sd } }, consent (default true), band, minutesToday }.
 * Greedy by posterior sd per minute: the task whose reading is least sure and cheapest first, up to DAILY_CAP_MIN and MAX_BLOCKS_PER_DAY, never past BUDGET_SHARE of study time.
 * Zero-cost tasks (reading speed, calibration, decay) are passive and not scheduled here: they ride on what the learner does.
 */
function planDay(state) {
  const s = state || {}; if (s.consent === false) return [];
  const left = BUDGET_SHARE * (s.studyMinutesMonth || 0) - (s.spentMin || 0) - (s.reserveMin || 0); // reserveMin: kept back for the confirm card's questions
  let cap = Math.min(DAILY_CAP_MIN - (s.minutesToday || 0), left); const out = [];
  const cands = Object.entries(TASKS).filter(([, t]) => t.cost > 0).map(([name, t]) => {
    const per = (s.perTask || {})[name] || { k: 0, sd: POP.sd };
    return { name, cost: t.cost * (s.band === 'child' && name === 'span_task' ? 0.8 : 1), score: (per.sd - (t.bias || 0)) / t.cost };
  }).sort((a, b) => b.score - a.score);
  for (const c of cands) { if (out.length >= MAX_BLOCKS_PER_DAY) break; if (c.cost <= cap && c.score > 1.5) { out.push(c.name); cap -= c.cost; } }
  return out;
}

module.exports = { BUDGET_SHARE, DAILY_CAP_MIN, MAX_BLOCKS_PER_DAY, POP, AGE, TASKS, ageBand, median, wpmToPoints, readingSpeed, GRID, pRasch, newPosterior, moments, updatePosterior, nextDifficulty, thetaToPoints, precheckReading, objectiveStates, combine, fuse, calibrationReading, biasToPoints, decayReading, planDay, LOGIT_POINTS };
