/**
 * The forgetting model: how fast this learner forgets, from their memory tests
 * read against a forgetting curve fitted to everyone's.
 *
 * A memory test is an answer on a skill last practised a day or more ago
 * (scorecard/irt.js marks it `delayed`). Its chance of being right is
 *
 *   P = g + (pk - g) * 2^(-dt / h)        half-life regression
 *   log2 h = a + b*nc + c*nw + m          (Settles & Meeder 2016)
 *
 *   dt   days since the skill was last practised (the review interval)
 *   pk   what the ability model expected of the answer had it been fresh
 *        (scorecard/irt.js, which learns only from fresh answers)
 *   g    the guessing floor: 1 / options for multiple choice, near 0 typed
 *   nc   earlier right answers on the skill, nw earlier wrong ones (capped)
 *   a,b,c  the POPULATION curve, fitted by maximum likelihood to every
 *        learner's recent memory tests (fitCurve)
 *   m    THIS learner's half-life multiplier, in doublings: the stat
 *
 * Because dt is in the model, the review schedule no longer moves the stat: a
 * learner reviewed after a week and one reviewed after a day are judged
 * against what the curve says each interval should leave. Because pk is in it,
 * ability is out: a miss on something they never knew is not forgetting.
 *
 * Fallbacks, in order: the population's fitted curve once there are enough
 * memory tests (MIN_FIT_TESTS from MIN_FIT_LEARNERS learners), the default
 * curve until then; the learner's own multiplier shrunk toward the population
 * by how many tests they have. The score is read against the population's
 * median multiplier, and until there is a population the stat is never
 * confident: an unfitted curve would push every learner the same way (the
 * rejected step 5 of round 1).
 */
const KEEP = 200;                  // memory tests kept per learner (most recent)
const CAP = 15;                     // counts above this add nothing more (40 and 100 measured no better)
const DEFAULT_CURVE = { a: 1, b: 0.3, c: -0.1, d: 0, e: 0 };
// Round 5: earlier answers that were themselves memory tests (a day or more
// after the skill was last practised) as their own terms, d and e, beside all
// earlier answers (b, c). 'basic' fits a, b, c only (rounds 2-4) and stays the
// default: measured at four seeds (scorecard-sim BASELINE step 30), 'spaced'
// predicted 30-day recall with less bias but ranked worse, lowered decay r,
// and gave LOWER 30-day recall when reviews were scheduled by it. The rows
// still record the spaced counts (ns, nsw), so a later refit has them.
const FEATURES = process.env.SCORECARD_FORGET_FEATURES || 'basic';
const NP = FEATURES === 'basic' ? 3 : 5;
const KEYS = ['a', 'b', 'c', 'd', 'e'].slice(0, NP);
// Round 5: the curve's SHAPE. 'exp' is 2^(-dt/h) (rounds 2-4). 'fit' also lets
// the population choose a power-law tail, R = (1 + F dt / h)^-k with
// F = 2^(1/k) - 1 (so h is still the half-life), k from SHAPES by likelihood:
// pooled memory data forget by a power law more often than exponentially
// (Wixted & Ebbesen 1991; FSRS moved to a power curve in v4 for the same
// reason), and an exponential fitted to power-law data under-predicts recall
// at long intervals. Infinity is the exponential, so 'fit' contains 'exp'.
// Not the default: see step 30 (on the simulation's exponential memory it
// over-predicted at two seeds and lowered decay r); JOINT likewise (a refit
// with each learner's multiplier as an offset gained nothing measurable).
const SHAPE = process.env.SCORECARD_FORGET_SHAPE || 'exp';
const SHAPES = [0.2, 0.35, 0.6, 1, 2, 4, Infinity];
const SHAPE_SAMPLE = 3000;
const JOINT = process.env.SCORECARD_FORGET_JOINT === 'on';
const PRIOR_SD = 0.8;              // spread of multipliers between learners (doublings) until the population says
const SCALE = 38;                  // points per doubling of half-life
const MIN_FIT_TESTS = 400;
const MIN_FIT_LEARNERS = 20;
const MIN_LEARNER_TESTS = 30;      // tests a learner needs to count toward the population's norm
const HALF_LIFE_DAYS = 90;         // old tests weigh less, like all evidence
const LN2 = Math.log(2);
const REF_SD = 25;
const MAX_MASS = 8;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const r4 = (v) => Number(v.toFixed(4));

/**
 * One memory test as a compact row: [dt, nc, nw, pk, g, y, day, open, review, ns, nsw]
 * (ns / nsw: earlier spaced right / wrong answers; rows from before round 5 have none).
 */
function row({ dt, nc, nw, pk, g, y, day, open = false, review = false, ns = 0, nsw = 0 }) {
  return [r4(dt), Math.min(CAP, nc), Math.min(CAP, nw), r4(pk), r4(g), y ? 1 : 0, r4(day), open ? 1 : 0, review ? 1 : 0,
    Math.min(CAP, Number(ns) || 0), Math.min(CAP, Number(nsw) || 0)];
}

/** A row's terms for the curve's coefficients, in KEYS order. */
function terms(r) {
  const x = [1, r[1], r[2], Number(r[9]) || 0, Number(r[10]) || 0];
  return x.slice(0, NP);
}

function predict(curve, r, m) {
  const [dt, , , pk, g] = r;
  const L = curve.a + curve.b * r[1] + curve.c * r[2] + (curve.d || 0) * (Number(r[9]) || 0) + (curve.e || 0) * (Number(r[10]) || 0) + m;
  const h = 2 ** clamp(L, -6, 12);
  const top = Math.max(g, pk);
  const k = curve.k;
  let R;
  let slope; // dR/dL divided by R
  if (Number.isFinite(k) && k > 0) {
    const F = 2 ** (1 / k) - 1;
    const u = (F * dt) / h;
    R = (1 + u) ** -k;
    slope = (k * u * LN2) / (1 + u);
  } else {
    R = 2 ** (-dt / h);
    slope = LN2 * LN2 * (dt / h);
  }
  const P = clamp(g + (top - g) * R, 0.001, 0.999);
  // dP/dL: how the chance moves with one more doubling of half-life.
  const dP = (top - g) * R * slope;
  return { P, dP };
}

/** Weight of a test by its age, in days since the reference day. */
function ageWeight(r, today) {
  return today === undefined ? 1 : 2 ** (-Math.max(0, today - r[6]) / HALF_LIFE_DAYS);
}

/**
 * The population curve: Fisher scoring on (a, b, c) over everyone's tests,
 * with a weak ridge toward the default so a thin sample cannot run away.
 */
function fitCurve(rows, offs = null) {
  if (SHAPE !== 'fit') return fitCoefficients(rows, Infinity, offs);
  // The shape is chosen on an even subsample (at most SHAPE_SAMPLE tests), then
  // the coefficients are fitted to every test with that shape: one full fit
  // per refresh, as before, however many learners there are.
  const step = Math.max(1, Math.ceil(rows.length / SHAPE_SAMPLE));
  const sample = step === 1 ? rows : rows.filter((_, i) => i % step === 0);
  const sOffs = offs ? (step === 1 ? offs : offs.filter((_, i) => i % step === 0)) : null;
  let best = null;
  for (const k of SHAPES) {
    const curve = fitCoefficients(sample, k, sOffs);
    let ll = 0;
    for (let i = 0; i < sample.length; i++) {
      const r = sample[i];
      const { P } = predict(curve, r, sOffs ? sOffs[i] : 0);
      ll += r[5] ? Math.log(P) : Math.log(1 - P);
    }
    if (!best || ll > best.ll) best = { ll, k };
  }
  return fitCoefficients(rows, best.k, offs);
}

/** The coefficients for one curve shape k (Infinity: exponential). */
function fitCoefficients(rows, shapeK, offs = null) {
  const withK = (c) => (Number.isFinite(shapeK) ? { ...c, k: shapeK } : c);
  let p = KEYS.map((k) => DEFAULT_CURVE[k]);
  const ridge = [0.5, 5, 5, 5, 5].slice(0, NP);
  for (let iter = 0; iter < 30; iter++) {
    const grad = p.map((v, i) => -ridge[i] * (v - DEFAULT_CURVE[KEYS[i]]));
    const info = p.map((_, i) => p.map((__, j) => (i === j ? ridge[i] : 0)));
    const curve = withK(Object.fromEntries(KEYS.map((k, i) => [k, p[i]])));
    for (let ri = 0; ri < rows.length; ri++) {
      const r = rows[ri];
      const { P, dP } = predict(curve, r, offs ? offs[ri] : 0);
      const x = terms(r);
      const s = ((r[5] - P) / (P * (1 - P))) * dP;
      const w = (dP * dP) / (P * (1 - P));
      for (let i = 0; i < NP; i++) {
        grad[i] += s * x[i];
        for (let j = 0; j < NP; j++) info[i][j] += w * x[i] * x[j];
      }
    }
    const step = solve(info, grad);
    if (!step) break;
    p = p.map((v, i) => v + clamp(step[i], -1, 1));
    if (Math.max(...step.map(Math.abs)) < 1e-4) break;
  }
  return withK(Object.fromEntries(KEYS.map((k, i) => [k, r4(p[i])])));
}

/** Solve A x = b by Gaussian elimination with partial pivoting (small n). */
function solve(A, b) {
  const n = b.length;
  const M = A.map((rowA, i) => [...rowA, b[i]]);
  for (let i = 0; i < n; i++) {
    let piv = i;
    for (let k = i + 1; k < n; k++) if (Math.abs(M[k][i]) > Math.abs(M[piv][i])) piv = k;
    if (Math.abs(M[piv][i]) < 1e-12) return null;
    [M[i], M[piv]] = [M[piv], M[i]];
    for (let k = 0; k < n; k++) {
      if (k === i) continue;
      const f = M[k][i] / M[i][i];
      for (let j = i; j <= n; j++) M[k][j] -= f * M[i][j];
    }
  }
  return M.map((rowM, i) => rowM[n] / rowM[i]);
}

/** One learner's multiplier m: the posterior mean and SD, against a normal prior. */
function fitLearner(curve, rows, { mean = 0, sd = PRIOR_SD, today } = {}) {
  let m = mean;
  let info = 1 / sd ** 2;
  for (let iter = 0; iter < 25; iter++) {
    let grad = -(m - mean) / sd ** 2;
    info = 1 / sd ** 2;
    for (const r of rows) {
      const wt = ageWeight(r, today);
      const { P, dP } = predict(curve, r, m);
      grad += wt * ((r[5] - P) / (P * (1 - P))) * dP;
      info += wt * (dP * dP) / (P * (1 - P));
    }
    const step = clamp(grad / info, -1, 1);
    m += step;
    if (Math.abs(step) < 1e-4) break;
  }
  return { m, sd: 1 / Math.sqrt(info) };
}

/**
 * The population's figures from every learner's kept tests: the fitted curve,
 * and the median and spread of learners' multipliers against it.
 *
 * @param {object[][]} lists  each learner's memory rows
 */
function population(lists, today) {
  const usable = lists.filter((l) => Array.isArray(l) && l.length);
  const all = usable.flat();
  if (usable.length < MIN_FIT_LEARNERS || all.length < MIN_FIT_TESTS) return null;
  let curve = fitCurve(all);
  if (JOINT) {
    // Round 5: refit the curve with each learner's own multiplier as an offset
    // (one alternating step of the mixed model). Pooled over learners who
    // forget at different speeds, a single curve sees a mixture, which looks
    // flatter at long intervals than any one learner's.
    const offs = [];
    for (const l of usable) {
      const e = fitLearner(curve, l, { mean: 0, sd: PRIOR_SD, today });
      for (let i = 0; i < l.length; i++) offs.push(e.m);
    }
    curve = fitCurve(all, offs);
  }
  const est = usable.filter((l) => l.length >= MIN_LEARNER_TESTS)
    .map((l) => fitLearner(curve, l, { mean: 0, sd: 2, today }));
  if (est.length < MIN_FIT_LEARNERS) return { curve, norm: null, tau: null };
  const ms = est.map((e) => e.m).sort((x, y) => x - y);
  const avg = ms.reduce((a, v) => a + v, 0) / ms.length;
  const varM = ms.reduce((a, v) => a + (v - avg) ** 2, 0) / (ms.length - 1);
  const noise = est.reduce((a, e) => a + e.sd ** 2, 0) / est.length;
  return { curve, norm: ms[Math.floor(ms.length / 2)], tau: Math.sqrt(Math.max(0.1 ** 2, varM - noise)), tests: all.length, learners: usable.length };
}

/**
 * This learner's decay-rate score and evidence mass. High decay = forgets
 * faster = a shorter half-life than the population's typical learner.
 */
function estimate(rows, pop, today) {
  if (!rows || !rows.length) return { score: 50, mass: 0, m: 0, tests: 0 };
  const curve = (pop && pop.curve) || DEFAULT_CURVE;
  const norm = pop && pop.norm !== null && pop.norm !== undefined ? pop.norm : 0;
  const tau = pop && pop.tau ? pop.tau : PRIOR_SD;
  const { m, sd } = fitLearner(curve, rows, { mean: norm, sd: tau, today });
  const se = SCALE * sd;
  // Without a population norm the stat may be shown but never trusted.
  const mass = pop && pop.norm !== null && pop.norm !== undefined
    ? clamp((REF_SD / Math.max(se, 0.01)) ** 2 - (REF_SD / (SCALE * tau)) ** 2, 0, MAX_MASS) : 0;
  const out = { score: clamp(50 - SCALE * (m - norm), 0, 100), mass, m, tests: rows.length };
  // The learner's standing among learners (scorecard/index.js standing()): the
  // posterior of their multiplier in between-learner SDs, once there is a
  // population with a fitted spread.
  if (pop && pop.norm !== null && pop.norm !== undefined && pop.tau) {
    out.z = (m - norm) / tau;
    out.zsd = Math.min(0.999, sd / tau);
  }
  return out;
}

/**
 * The curve to schedule reviews with (services/adaptation.js predictedRecall):
 * the population's fitted curve once there is one, else DEFAULT_CURVE, and
 * the half-life multiplier m to read it with: this learner's (their own memory
 * tests, shrunk toward the population's typical learner) when rows are given
 * and there is a population; the typical learner's (the population median)
 * when not; 0 on the default curve. Pure: index.js forgettingCurve() feeds it.
 */
function recallCurve(pop, rows, today) {
  const fitted = !!(pop && pop.curve);
  const curve = fitted ? { ...pop.curve } : { ...DEFAULT_CURVE };
  const norm = fitted && pop.norm !== null && pop.norm !== undefined ? pop.norm : 0;
  const tau = fitted && pop.tau ? pop.tau : PRIOR_SD;
  const out = {
    curve, fitted, source: fitted ? 'population' : 'default',
    m: r4(norm), mSd: r4(tau), mSource: fitted && pop.norm !== null && pop.norm !== undefined ? 'population' : 'none',
    norm: fitted ? pop.norm : null, tau: fitted ? pop.tau : null,
    tests: fitted ? pop.tests || 0 : 0, learners: fitted ? pop.learners || 0 : 0, learnerTests: 0,
    cap: CAP,
  };
  if (fitted && Array.isArray(rows) && rows.length) {
    const own = fitLearner(curve, rows, { mean: norm, sd: tau, today });
    Object.assign(out, { m: r4(own.m), mSd: r4(own.sd), mSource: 'learner', learnerTests: rows.length });
  }
  return out;
}

/**
 * Predicted recall from a recallCurve() result, with named inputs so a caller
 * does not depend on the curve's coefficient layout.
 *
 * @param {object} rc       recallCurve() / scorecard.forgettingCurve() result
 * @param {object} o
 * @param {number} o.days   days since the skill was last practised
 * @param {number} o.right  earlier right answers on the skill (all of them; capped at rc.cap)
 * @param {number} o.wrong  earlier wrong answers on the skill (capped at rc.cap)
 * @param {number} [o.spacedRight=0]  of those, right answers given a day or more after the skill was last practised
 * @param {number} [o.spacedWrong=0]  ... and wrong ones (memory checks / reviews missed)
 * @param {number} [o.fresh=0.95]  chance of a right answer had it been practised just now
 * @param {number} [o.guess=0]     chance of a right answer by guessing alone
 * @param {number} [o.m=rc.m]      half-life multiplier in doublings (0 = the curve as fitted)
 */
function recallAt(rc, { days, right = 0, wrong = 0, spacedRight = 0, spacedWrong = 0, fresh = 0.95, guess = 0, m } = {}) {
  const curve = (rc && rc.curve) || DEFAULT_CURVE;
  const mm = Number.isFinite(m) ? m : (rc && Number.isFinite(rc.m) ? rc.m : 0);
  const r = [Math.max(0, Number(days) || 0), Math.min(CAP, right), Math.min(CAP, wrong), fresh, guess, 0, 0, 0, 0,
    Math.min(CAP, spacedRight), Math.min(CAP, spacedWrong)];
  return predict(curve, r, mm).P;
}

module.exports = { row, predict, fitCurve, fitLearner, population, estimate, recallCurve, recallAt, KEEP, CAP, DEFAULT_CURVE };
