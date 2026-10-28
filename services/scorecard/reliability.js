/**
 * The split-half reliability check for scorecard stats (P7, evidence article 03
 * mechanism 8; SCORECARD-EVIDENCE-REPORT.md section 11).
 *
 * A stat may issue directives only if its standings are stable within a
 * learner. The check, as specified:
 *
 *   - each learner's evidence on the stat is split into two halves by DAY
 *     (all of one day's evidence goes to the same half), at random, 500 times
 *     (not only odd/even days);
 *   - each half gives a standing per learner (`score`, default the weighted mean
 *     of the evidence values), and the two halves are correlated across learners
 *     (Pearson r);
 *   - the r of the 500 splits are averaged in Fisher-z space, and a 95% interval
 *     for it is taken from the number of learners (1 / sqrt(n - 3));
 *   - the point and both bounds are stepped up to full length with the
 *     Spearman-Brown correction, 2r / (1 + r) (brown1910; spearman1910;
 *     parsons2019);
 *   - it passes when the corrected point is >= 0.6 AND the corrected lower 95%
 *     bound is >= 0.5 (koo2016 grades reliability on the interval: below 0.5 is
 *     poor, 0.5-0.75 moderate; cicchetti1994 and lance2006 on cut-offs being
 *     rules of thumb).
 *
 * The numbers 500, 0.6 and 0.5 are design choices. Running it on real learners
 * needs data the app does not have yet (20+ learners with 30+ levels each).
 */

const DEFAULTS = { splits: 500, point: 0.6, lower: 0.5, minLearners: 5, seed: 20261025 };

function rng(seed) {
  // mulberry32: deterministic, so a report can be re-run.
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function weightedMean(events) {
  let s = 0;
  let w = 0;
  for (const e of events) {
    const wt = Number.isFinite(e.weight) ? e.weight : 1;
    s += wt * e.value;
    w += wt;
  }
  return w > 0 ? s / w : null;
}

function pearson(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
}

const clampR = (r) => Math.max(-0.999999, Math.min(0.999999, r));
const spearmanBrown = (r) => (2 * r) / (1 + r);

/**
 * @param {Array<{events: Array<{day: string|number, value: number, weight?: number}>}>} learners
 * @param {object} [opts] splits, point, lower, minLearners, seed, score(events) -> number|null
 * @returns {{n, splits, r_half, point, lower, upper, pass, reason?}}
 */
function splitHalf(learners, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const score = o.score || weightedMean;
  // Only learners with evidence on at least two days can be split.
  const pool = (learners || []).map((l) => {
    const byDay = new Map();
    for (const e of l.events || []) {
      if (!Number.isFinite(e.value)) continue;
      const d = String(e.day);
      if (!byDay.has(d)) byDay.set(d, []);
      byDay.get(d).push(e);
    }
    return [...byDay.values()];
  }).filter((days) => days.length >= 2);
  const n = pool.length;
  if (n < Math.max(4, o.minLearners)) return { n, splits: 0, r_half: null, point: null, lower: null, upper: null, pass: false, reason: 'too few learners with two or more days' };

  const rand = rng(o.seed);
  let zSum = 0;
  let used = 0;
  for (let s = 0; s < o.splits; s++) {
    const xs = [];
    const ys = [];
    for (const days of pool) {
      // A random half of the days, at least one day on each side.
      const order = days.map((d, i) => [rand(), i]).sort((a, b) => a[0] - b[0]).map(([, i]) => i);
      const cut = Math.floor(days.length / 2);
      const a = order.slice(0, cut).flatMap((i) => days[i]);
      const b = order.slice(cut).flatMap((i) => days[i]);
      const x = score(a);
      const y = score(b);
      if (x === null || y === null || !Number.isFinite(x) || !Number.isFinite(y)) continue;
      xs.push(x);
      ys.push(y);
    }
    const r = pearson(xs, ys);
    if (r === null) continue;
    zSum += Math.atanh(clampR(r));
    used++;
  }
  if (!used) return { n, splits: 0, r_half: null, point: null, lower: null, upper: null, pass: false, reason: 'no split had spread in both halves' };
  const z = zSum / used;
  const se = 1 / Math.sqrt(n - 3);
  const rHalf = Math.tanh(z);
  const lo = Math.tanh(z - 1.96 * se);
  const hi = Math.tanh(z + 1.96 * se);
  const point = spearmanBrown(rHalf);
  // Spearman-Brown is monotonic, so the corrected interval is the corrected ends
  // (a negative end is left as it is: a half-correlation below 0 has no step-up).
  const lower = lo > 0 ? spearmanBrown(lo) : lo;
  const upper = hi > 0 ? spearmanBrown(hi) : hi;
  const r4 = (v) => Number(v.toFixed(4));
  return { n, splits: used, r_half: r4(rHalf), point: r4(point), lower: r4(lower), upper: r4(upper), pass: point >= o.point && lower >= o.lower };
}

module.exports = { splitHalf, spearmanBrown, pearson, DEFAULTS };
