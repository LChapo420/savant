/**
 * Statistics for the built-in beta comparison (tailored vs base): pure functions, no database, no clock, no model.
 * docs/BETA-COMPARISON.md is the plain-language version.
 *
 * An arm is summarised as `{ n, estimate, v }`: the number of learners, the arm's estimate (a mean, or a ratio of totals such as
 * retained skills per practice hour) and the estimated variance OF that estimate. The difference of two arms is
 * `estimate_tailored - estimate_base` with variance `v_tailored + v_base` (the arms are different people).
 *
 * The headline interval is ALWAYS-VALID: a normal-mixture sequential probability ratio test (mSPRT, Robbins 1970; Johari, Pekelis and
 * Walsh 2017, "Peeking at A/B tests") inverted into a confidence sequence. Read it any day, as often as you like: the chance that it EVER
 * excludes the true difference is at most alpha, however many times the report was opened. That is why the daily report needs no
 * "look schedule" and cannot be spoiled by peeking. The price is width: it is wider than the textbook interval at any one look
 * (its coverage at a single look is above the nominal 95%, about 99%). The ordinary Welch interval is also written, labelled "single look
 * only", so the two can be compared; it is not used for any verdict.
 *
 * The mixture's variance tau^2 is set in units of the per-learner standard deviation (TAU_STD = 0.3, a "small to medium" standardised
 * effect, the size worth detecting); it is chosen before any data and never tuned on results. The pooled standard deviation is
 * estimated from the data (a plug-in, as in the published method), so validity is asymptotic: scripts/beta-compare-sim.js measures
 * the actual coverage and the false-positive rate, including daily peeking, on skewed and zero-heavy data.
 */

const TAU_STD = 0.3;
const DEFAULT_ALPHA = 0.05;
/** An outcome is not read until each arm has this many learners with a value for it (the simulation checks the false-positive rate from here on). */
const MIN_ARM_N = 20;

// ── normal and t quantiles ──────────────────────────────────────────────────
/** Standard normal quantile (Acklam's rational approximation, relative error below 1.2e-9). */
function qnorm(p) {
  if (!(p > 0 && p < 1)) return p <= 0 ? -Infinity : Infinity;
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const lo = 0.02425;
  let q; let r;
  if (p < lo) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - lo) return -qnorm(1 - p);
  q = p - 0.5; r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/** Student t quantile by the Cornish-Fisher expansion in 1/df (good to about 3 decimals for df >= 4). */
function qt(p, df) {
  const z = qnorm(p);
  if (!(df > 0) || !Number.isFinite(df)) return z;
  const z3 = z ** 3; const z5 = z ** 5; const z7 = z ** 7;
  return z + (z3 + z) / (4 * df) + (5 * z5 + 16 * z3 + 3 * z) / (96 * df ** 2) + (3 * z7 + 19 * z5 + 17 * z3 - 15 * z) / (384 * df ** 3);
}

// ── arm summaries ───────────────────────────────────────────────────────────
/** A mean of per-learner values. */
function summarizeMean(values) {
  const x = values.filter((v) => Number.isFinite(v));
  const n = x.length;
  if (!n) return { n: 0, estimate: null, v: null, unit_var: null };
  const mean = x.reduce((s, v) => s + v, 0) / n;
  if (n < 2) return { n, estimate: mean, v: null, unit_var: null };
  const s2 = x.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
  return { n, estimate: mean, v: s2 / n, unit_var: s2 };
}

/**
 * A ratio of totals, such as retained skills per practice hour: sum(y) / sum(x) over learners, with the linearised (delta-method)
 * variance. A learner with no x (no practice hours) is left out: there is no rate to speak of.
 * @param {Array<[number, number]>} pairs [y, x] per learner
 */
function summarizeRatio(pairs) {
  const p = pairs.filter(([y, x]) => Number.isFinite(y) && Number.isFinite(x) && x > 0);
  const n = p.length;
  if (!n) return { n: 0, estimate: null, v: null, unit_var: null };
  const sx = p.reduce((s, [, x]) => s + x, 0);
  const sy = p.reduce((s, [y]) => s + y, 0);
  const r = sy / sx;
  if (n < 2) return { n, estimate: r, v: null, unit_var: null };
  const e2 = p.reduce((s, [y, x]) => s + (y - r * x) ** 2, 0);
  const v = (n / (n - 1)) * e2 / (sx * sx);
  // The per-learner variance on the arm's own scale: v = unit_var / n.
  return { n, estimate: r, v, unit_var: v * n };
}

// ── intervals on the difference ─────────────────────────────────────────────
/**
 * The always-valid confidence sequence for tailored - base at level 1 - alpha.
 * @returns {{estimate:number, lo:number, hi:number, se:number, radius:number, method:string}|null}
 */
function sequentialInterval(t, b, alpha = DEFAULT_ALPHA, tauStd = TAU_STD) {
  if (!t || !b || t.n < 2 || b.n < 2 || t.v === null || b.v === null) return null;
  const V = Math.max(t.v + b.v, 1e-300);
  const est = t.estimate - b.estimate;
  // sigma_eff^2 = V * nT * nB / (nT + nB) is the per-learner variance when both arms share one (the harmonic scaling of a two-sample SE).
  const sigmaEff2 = V * (t.n * b.n) / (t.n + b.n);
  const tau2 = (tauStd ** 2) * sigmaEff2;
  const radius = Math.sqrt((2 * V * (V + tau2) / tau2) * Math.log((1 / alpha) * Math.sqrt((V + tau2) / V)));
  return { estimate: est, lo: est - radius, hi: est + radius, se: Math.sqrt(V), radius, method: 'mSPRT confidence sequence' };
}

/** The ordinary Welch interval: right at ONE planned look, wrong if read repeatedly. Written for comparison only. */
function welchInterval(t, b, alpha = DEFAULT_ALPHA) {
  if (!t || !b || t.n < 2 || b.n < 2 || t.v === null || b.v === null) return null;
  const V = t.v + b.v;
  const df = V ** 2 / (((t.v ** 2) / (t.n - 1)) + ((b.v ** 2) / (b.n - 1)) || Infinity);
  const half = qt(1 - alpha / 2, df) * Math.sqrt(V);
  const est = t.estimate - b.estimate;
  return { estimate: est, lo: est - half, hi: est + half, df, method: 'Welch, single look only' };
}

// ── how many learners it takes ──────────────────────────────────────────────
const power80 = () => qnorm(0.975) + qnorm(0.8);

/**
 * Learners per arm for 80% power at a two-sided 5% test (fixed sample, one look) to detect `delta` (absolute), from the arms'
 * per-learner variances and the allocation (share of learners in the base arm).
 */
function nForPower(unitVarT, unitVarB, delta, shareBase, { alpha = DEFAULT_ALPHA, power = 0.8 } = {}) {
  if (!(delta > 0) || !Number.isFinite(unitVarT) || !Number.isFinite(unitVarB) || !(shareBase > 0 && shareBase < 1)) return null;
  const z = qnorm(1 - alpha / 2) + qnorm(power);
  // Total N = z^2 (uT/(1-s) + uB/s) / delta^2; arm sizes follow the allocation.
  const total = (z ** 2) * (unitVarT / (1 - shareBase) + unitVarB / shareBase) / (delta ** 2);
  return { total: Math.ceil(total), tailored: Math.ceil(total * (1 - shareBase)), base: Math.ceil(total * shareBase) };
}

/**
 * Learners in total at which an observed difference of exactly `delta` would just exclude zero from the always-valid interval, at the
 * given allocation and per-learner variances: roughly the sample at which a true gain of that size has a coin-flip to be called
 * conclusive, and the honest "n needed" for this interval (the fixed-sample figure above is the optimistic bound).
 */
function nForSequential(unitVarT, unitVarB, delta, shareBase, alpha = DEFAULT_ALPHA, tauStd = TAU_STD) {
  if (!(delta > 0) || !Number.isFinite(unitVarT) || !Number.isFinite(unitVarB) || !(shareBase > 0 && shareBase < 1)) return null;
  const radiusAt = (N) => {
    const nT = N * (1 - shareBase); const nB = N * shareBase;
    const V = unitVarT / nT + unitVarB / nB;
    const sigmaEff2 = V * (nT * nB) / (nT + nB);
    const tau2 = (tauStd ** 2) * sigmaEff2;
    return Math.sqrt((2 * V * (V + tau2) / tau2) * Math.log((1 / alpha) * Math.sqrt((V + tau2) / V)));
  };
  let lo = 4; let hi = 4;
  while (radiusAt(hi) > delta && hi < 1e9) hi *= 2;
  if (hi >= 1e9) return null;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (radiusAt(mid) > delta) lo = mid; else hi = mid; }
  const total = Math.ceil(hi);
  return { total, tailored: Math.ceil(total * (1 - shareBase)), base: Math.ceil(total * shareBase) };
}

module.exports = {
  TAU_STD, DEFAULT_ALPHA, MIN_ARM_N,
  qnorm, qt, summarizeMean, summarizeRatio, sequentialInterval, welchInterval, nForPower, nForSequential, power80,
};
