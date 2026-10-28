/**
 * Small statistics for the staged skill gates: the regularized incomplete beta
 * (for Beta-posterior proportion gates), binomial tails (how often a gate passes by
 * luck), the Elo/Glicko expected score, and the Bayes update the app's
 * learnerPath.unitBelief uses (re-implemented here to count questions needed).
 */
'use strict';

function lgamma(x) {
  // Lanczos approximation (g = 7, n = 9).
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

function betacf(a, b, x) {
  const MAXIT = 300; const EPS = 3e-14; const FPMIN = 1e-300;
  const qab = a + b; const qap = a + 1; const qam = a - 1;
  let c = 1; let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d; let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c; h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** I_x(a, b): the Beta(a, b) CDF at x. */
function betaCdf(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) return (bt * betacf(a, b, x)) / a;
  return 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/** P(true rate >= thr | makes of n), uniform prior. */
function pAtLeast(thr, makes, n) { return 1 - betaCdf(thr, 1 + makes, 1 + n - makes); }

/** Fewest makes out of n that pass a gate P(rate >= thr) >= conf. */
function makesNeeded(thr, n, conf = 0.8) {
  for (let k = 0; k <= n; k++) if (pAtLeast(thr, k, n) >= conf) return k;
  return null;
}

function binomPmf(k, n, p) {
  return Math.exp(lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1) + k * Math.log(p) + (n - k) * Math.log(1 - p));
}
/** P(X >= k), X ~ Binomial(n, p). */
function binomUpper(k, n, p) { let s = 0; for (let i = k; i <= n; i++) s += binomPmf(i, n, p); return Math.min(1, s); }

/** Logistic Elo expectation and its inverse. */
const expected = (diff) => 1 / (1 + Math.pow(10, -diff / 400));
const diffFor = (e) => 400 * Math.log10(e / (1 - e));
/** Standard error (Elo points) of a performance rating from n games scored near p. */
const perfSE = (n, p = 0.5) => (400 / Math.LN10) * Math.sqrt(p * (1 - p) / n) / (p * (1 - p));

/** learnerPath.unitBelief's update, re-implemented: rights needed from a prior to reach knownAt. */
function rightsToProve(prior, guess, { slip = 0.05, luck = 0.15, knownAt = 0.985 } = {}) {
  let p = prior; let k = 0;
  while (p < knownAt && k < 50) {
    const pr = 1 - slip; const pu = Math.min(1, guess + luck);
    p = (p * pr) / (p * pr + (1 - p) * pu); k++;
  }
  return { rights: k, p: Math.round(p * 10000) / 10000 };
}

module.exports = { lgamma, betaCdf, pAtLeast, makesNeeded, binomPmf, binomUpper, expected, diffFor, perfSE, rightsToProve };
