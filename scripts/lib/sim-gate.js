/**
 * The accuracy gate of scripts/scorecard-recovery-sim.js: for every scorecard measure, at one, two, three and four weeks of use, how far
 * the app's estimate is from the learner's true value (mean absolute error), how often its own 90% interval holds the truth, and how
 * that error compares with the best that could be done with the SAME data.
 *
 * "Best achievable" is an empirical ideal observer, never a claim of perfection. Across the simulated learners, with the true value as
 * the label (which no real system has), it takes the lowest leave-one-out error of three read-outs of what the sim generated:
 *   - the app's own number recalibrated (truth regressed on the measured score and its evidence): the best any bias or shrinkage fix
 *     of the number could do;
 *   - a ridge read-out of the learner's whole answer log (accuracy, speed, rapid guesses, coach use, revisions, taps, post-miss and
 *     first-items effects, quits, spacing...) plus the app's number and (round 9) the learner's indicator means for the measure
 *     (what they wrote, how they used the app: scorecard/indicators.js): the best a linear reading of the same observations does;
 *   - the population mean, which is what the data adds nothing to.
 * A measure passes when the app's error is within 10% of the achievable. When even the achievable cannot beat the population mean by
 * 5%, the data holds no signal about it ("no signal"): neither pass nor fail. A failing measure is given its reason: the number
 * is biased or miscalibrated (recalibrating it would help), it discards information the log holds (the log read-out beats it), or it
 * rests on too few observations (low evidence).
 *
 * The limit: the log read-out is linear and has the 16 features below, so it can miss structure a better model would use. Where it cannot
 * beat the app the gate says "no better is found", not "this is optimal".
 */

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Solve (A) x = B by Gauss-Jordan for a small dense A (p x p), B (p x m). Returns A^-1 B. */
function solve(A, B) {
  const n = A.length;
  const M = A.map((row, i) => [...row, ...B[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c] || 1e-12;
    for (let k = c; k < M[c].length; k++) M[c][k] /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c];
      if (!f) continue;
      for (let k = c; k < M[r].length; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row) => row.slice(n));
}

/** Leave-one-out predictions of a ridge regression of y on the columns of X (standardised, with an intercept left unpenalised). */
function ridgeLOO(X, y, lambda = 1) {
  const n = y.length;
  if (n < 8 || !X.length) return y.map(() => mean(y));
  const p = X[0].length;
  const mu = Array.from({ length: p }, (_, j) => mean(X.map((r) => r[j])));
  const sd = Array.from({ length: p }, (_, j) => Math.sqrt(mean(X.map((r) => (r[j] - mu[j]) ** 2))) || 1);
  const Z = X.map((r) => [1, ...r.map((v, j) => (v - mu[j]) / sd[j])]);
  const q = p + 1;
  const XtX = Array.from({ length: q }, () => new Array(q).fill(0));
  for (const z of Z) for (let a = 0; a < q; a++) for (let b = 0; b < q; b++) XtX[a][b] += z[a] * z[b];
  for (let a = 1; a < q; a++) XtX[a][a] += lambda;
  const inv = solve(XtX, Array.from({ length: q }, (_, i) => Array.from({ length: q }, (_, j) => (i === j ? 1 : 0))));
  const Zty = new Array(q).fill(0);
  for (let i = 0; i < n; i++) for (let a = 0; a < q; a++) Zty[a] += Z[i][a] * y[i];
  const beta = inv.map((row) => row.reduce((acc, v, b) => acc + v * Zty[b], 0));
  return y.map((yi, i) => {
    const z = Z[i];
    const fit = z.reduce((s, v, a) => s + v * beta[a], 0);
    let h = 0;
    for (let a = 0; a < q; a++) { let t = 0; for (let b = 0; b < q; b++) t += inv[a][b] * z[b]; h += z[a] * t; }
    h = Math.min(h, 0.98);
    return (fit - h * yi) / (1 - h);
  });
}

const FEATURES = ['acc', 'accReview', 'logMs', 'rapid', 'coach', 'revised', 'sure', 'guess', 'calib', 'afterMiss', 'firstItems', 'secondHalf', 'typedGap', 'quitRate', 'levelsPerDay', 'gapSd'];

/**
 * The learner's answer log reduced to FEATURES: only what the app's own data holds (answers, times, taps, coach use, revisions, sittings).
 * `rows` are the items with an answer, in order; `gaps` the days between sittings; `quits`, `levels` and `days` counts.
 */
function featuresOf(rows, { gaps = [], quits = 0, levels = 0, days = 1 } = {}) {
  const ans = rows.filter((r) => r.correct !== null && r.correct !== undefined);
  const acc = (xs) => (xs.length ? xs.filter((r) => r.correct).length / xs.length : 0.5);
  const rate = (xs, f) => (xs.length ? xs.filter(f).length / xs.length : 0);
  const typed = ans.filter((r) => r.format === 'typed');
  const mc = ans.filter((r) => r.format !== 'typed');
  const byLevel = new Map();
  for (const r of ans) { if (!byLevel.has(r.level)) byLevel.set(r.level, []); byLevel.get(r.level).push(r); }
  const first = []; const rest = []; const h1 = []; const h2 = [];
  for (const rs of byLevel.values()) { rs.forEach((r, i) => { (i < 3 ? first : rest).push(r); (i < rs.length / 2 ? h1 : h2).push(r); }); }
  const afterMiss = []; const afterRight = [];
  ans.forEach((r, i) => { if (i > 0 && r.level === ans[i - 1].level) (ans[i - 1].correct ? afterRight : afterMiss).push(r); });
  const sureRows = ans.filter((r) => r.confidence === 'sure'); const guessRows = ans.filter((r) => r.confidence === 'guess');
  const gm = mean(gaps);
  return {
    acc: acc(ans), accReview: acc(ans.filter((r) => r.role === 'review')), logMs: mean(ans.filter((r) => r.ms > 0).map((r) => Math.log(r.ms))),
    rapid: rate(ans, (r) => r.ms > 0 && r.ms < 3000), coach: rate(ans, (r) => r.coach_used), revised: rate(typed, (r) => (r.answer_changes || 0) >= 3),
    sure: rate(ans, (r) => r.confidence === 'sure'), guess: rate(ans, (r) => r.confidence === 'guess'),
    calib: sureRows.length && guessRows.length ? acc(sureRows) - acc(guessRows) : 0,
    afterMiss: afterMiss.length && afterRight.length ? acc(afterMiss) - acc(afterRight) : 0, firstItems: first.length && rest.length ? acc(first) - acc(rest) : 0,
    secondHalf: h1.length && h2.length ? acc(h2) - acc(h1) : 0, typedGap: typed.length && mc.length ? acc(typed) - acc(mc) : 0,
    quitRate: levels ? quits / levels : 0, levelsPerDay: days > 0 ? levels / days : 0, gapSd: gaps.length > 1 ? Math.sqrt(mean(gaps.map((g) => (g - gm) ** 2))) : 0,
  };
}

const MIN_N = 12;
const PASS_RATIO = 1.1;
const NO_SIGNAL_SHARE = 0.95;

/**
 * One measure at one week. `rows`: [{ truth, measured, se, confidence, feat }] over the learners with a snapshot.
 * Returns { n, mae, achievable, ratio, coverage90, status: 'pass' | 'fail' | 'no_signal', reason, ... }.
 */
function gateMeasure(rows, { lambda = 8 } = {}) {
  const n = rows.length;
  if (n < MIN_N) return { n, status: 'too_few_learners' };
  const t = rows.map((r) => r.truth);
  const m = rows.map((r) => r.measured);
  const mae = mean(t.map((v, i) => Math.abs(v - m[i])));
  const bias = mean(t.map((v, i) => v - m[i]));
  const Xcal = rows.map((r) => [r.measured, (r.confidence / 100) * (r.measured - 50)]);
  // Round 9: a row may carry extra columns (the learner's indicator means for this measure, scorecard/indicators.js): the read-out sees them too.
  const Xlog = rows.map((r) => [...FEATURES.map((f) => r.feat[f]), r.measured, (r.confidence / 100) * (r.measured - 50), ...(r.extra || [])]);
  const calPred = ridgeLOO(Xcal, t, 0.5);
  const logPred = ridgeLOO(Xlog, t, lambda);
  const floorCal = mean(t.map((v, i) => Math.abs(v - calPred[i])));
  const floorLog = mean(t.map((v, i) => Math.abs(v - logPred[i])));
  const prior = mean(t.map((v, i) => Math.abs(v - mean(t.filter((_, j) => j !== i)))));
  const achievable = Math.min(mae, floorCal, floorLog, prior);
  const covered = rows.filter((r) => r.se > 0 && Math.abs(r.truth - r.measured) <= 1.645 * r.se).length / n;
  const width = mean(rows.map((r) => 2 * 1.645 * (r.se || 0)));
  const conf = mean(rows.map((r) => r.confidence));
  const ratio = mae / (achievable || 1e-9);
  let status = 'pass';
  let reason = null;
  if (achievable >= NO_SIGNAL_SHARE * prior) { status = 'no_signal'; reason = 'no signal: neither the app nor a read-out of the whole log beats the population mean by 5%'; }
  else if (ratio > PASS_RATIO) {
    status = 'fail';
    if (floorCal <= 0.92 * mae || Math.abs(bias) > 0.3 * mae) reason = 'biased or miscalibrated rule: recalibrating the number alone would cut the error';
    else if (floorLog <= 0.92 * mae) reason = 'the rule discards information the answer log holds (a read-out of the log beats it)';
    else if (conf < 50) reason = 'too few observations: the measure has not reached the evidence the app asks for';
    else reason = 'unexplained: within the log read-out\'s reach but not within 10%';
  }
  return {
    n, mae: Number(mae.toFixed(2)), achievable: Number(achievable.toFixed(2)), ratio: Number(ratio.toFixed(3)), prior: Number(prior.toFixed(2)),
    floor_recalibrated: Number(floorCal.toFixed(2)), floor_log: Number(floorLog.toFixed(2)), bias: Number(bias.toFixed(2)),
    coverage90: Number(covered.toFixed(3)), width90: Number(width.toFixed(1)), confidence: Number(conf.toFixed(0)), status, reason,
  };
}

module.exports = { ridgeLOO, featuresOf, gateMeasure, FEATURES, PASS_RATIO, NO_SIGNAL_SHARE, MIN_N };
