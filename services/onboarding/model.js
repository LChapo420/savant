/**
 * The onboarding measurement model: how much a set of answers tells us about each of the 100 scorecard measures, and which item to ask next.
 *
 * Everything here is a MODEL with stated assumptions, not a finding about real learners (docs/ONBOARDING-MODES.md says which numbers are
 * simulated). The assumptions, all conservative and all in the open:
 *
 *   - A measure is a standard-normal trait z (population sd POP_SD = 17 points, the value under which "guess the mean" costs a mean absolute
 *     error of 13.6 points, as in docs/SCORECARD-90.md). Measures are independent a priori: no help is taken from correlations between them.
 *   - An item i of method FAMILY f reads measure j with a validity r (its correlation with the true value). Items of one family on one measure
 *     also share a persistent method error (a person who flatters themselves does so on every self-report item; a task has its own quirks), so
 *     repeating the same kind of item stops helping: with item validity r and family ceiling rho, two items correlate r1 r2 / rho^2, and no
 *     number of items of that family can read the measure better than rho. Families fail independently, so mixing methods is what raises accuracy.
 *   - The reading of one family is the mean of its items' standardised readings; its information about z is r^2 / (v - r^2) with v the variance of
 *     that mean (see familyPrecision). Families add. This is the exact Gaussian posterior for the model, not a heuristic.
 *
 * Adaptive choice (pickNext): after every answer, the next item is the one with the largest drop in the sum of posterior sds (points) per
 * expected second, at the learner's own observed pace, among items that still fit in the time left.
 */
'use strict';

const POP_SD = 17;

/** Method families and their ceilings (the best any number of items of that family could read a measure). Anchors in comments. */
const FAMILIES = {
  self: { rho: 0.45, label: 'forced-choice self-report' },      // self-report vs behaviour r = .1 to .4 (Mabe & West 1982; Dang et al. 2020); scale ceilings ~.5
  goal: { rho: 0.5, label: 'interests and goals survey' },
  wm: { rho: 0.85, label: 'working-memory span' },              // span tasks: test-retest ~.8 (Waters & Caplan 2003; Conway et al. 2005)
  speed: { rho: 0.8, label: 'processing speed' },               // symbol-digit / comparison speed: reliability .8 to .9
  read: { rho: 0.75, label: 'reading rate and comprehension' },
  reason: { rho: 0.75, label: 'short reasoning items' },        // single Gf items: r with g about .3 each, a short set ~.7
  switch: { rho: 0.5, label: 'task switching' },                // switch-cost difference scores: reliability ~.5 (Hughes et al. 2014)
  ml: { rho: 0.55, label: 'mini-lesson choice points' },        // chosen behaviour in a controlled learning episode: stability .3 to .5
  taste: { rho: 0.45, label: 'A/B teaching taste and recall' }, // preference does not predict benefit well (Pashler et al. 2008)
  conf: { rho: 0.55, label: 'confidence ratings' },             // calibration indices: reliability ~.5 to .7 over 20+ items (Stankov)
};
const RHO = Object.fromEntries(Object.entries(FAMILIES).map(([k, v]) => [k, v.rho]));

/** A state is { fam: { stat: { family: { n, S, Q, X } } } }: counts, sum r, sum r^2, sum of signed standardised readings. */
const emptyState = () => ({ fam: {} });

function bump(state, stat, family, r, x) {
  const byStat = state.fam[stat] || (state.fam[stat] = {});
  const f = byStat[family] || (byStat[family] = { n: 0, S: 0, Q: 0, X: 0 });
  f.n += 1; f.S += r; f.Q += r * r; f.X += x;
}

/** The precision and the precision-weighted reading of one family on one measure. */
function familyTerm(f, family) {
  if (!f || !f.n) return { P: 0, num: 0 };
  const rho = RHO[family] || 0.5;
  const n = f.n;
  const rbar = f.S / n;
  const v = 1 / n + (f.S * f.S - f.Q) / (n * n * rho * rho);   // variance of the mean of n standardised readings
  const s = Math.max(1e-6, v - rbar * rbar);                    // what is left once the true-value part is taken out
  return { P: (rbar * rbar) / s, num: (rbar * (f.X / n)) / s };
}

/** Posterior of one measure: { mean (z), sd (z), P (precision gained from the data), dataZ (the data-only reading, in z) }. */
function posterior(state, stat) {
  const byStat = state.fam[stat];
  let P = 0; let num = 0;
  if (byStat) for (const [family, f] of Object.entries(byStat)) { const t = familyTerm(f, family); P += t.P; num += t.num; }
  return { mean: num / (1 + P), sd: Math.sqrt(1 / (1 + P)), P, dataZ: P > 0 ? num / P : 0 };
}

/** The posterior sd (z units) of a measure if one more item of this family and validity were added. */
function sdWith(state, stat, family, r) {
  const f = state.fam[stat] && state.fam[stat][family];
  const base = state.fam[stat] || {};
  let P = 0;
  for (const [fam, ff] of Object.entries(base)) if (fam !== family) P += familyTerm(ff, fam).P;
  const g = f ? { n: f.n + 1, S: f.S + r, Q: f.Q + r * r, X: f.X } : { n: 1, S: r, Q: r * r, X: 0 };
  P += familyTerm(g, family).P;
  return Math.sqrt(1 / (1 + P));
}

/** Points of total posterior sd an item would remove, summed over the measures it reads (importance-weighted). */
function gainOf(state, item, importance) {
  let gain = 0;
  for (const inf of item.informs) {
    const before = Math.sqrt(1 / (1 + posterior(state, inf.stat).P));
    const after = sdWith(state, inf.stat, item.family, inf.r);
    gain += ((importance && importance[inf.stat]) || 1) * (before - after) * POP_SD;
  }
  return gain;
}

/**
 * The next item: the largest gain per expected second that still fits in `secondsLeft`.
 * @param {object} opts { used:Set, secondsLeft, pace (the learner's seconds multiplier, 1 = median), importance, minGainPerMin, only:(item)=>bool }
 * @returns {{item, gain, perMin, seconds}|null}
 */
function pickNext(state, pool, opts) {
  const { used, secondsLeft, pace = 1, importance = null, minGainPerMin = 0, only = null } = opts;
  let best = null;
  for (const item of pool) {
    if (used.has(item.id)) continue;
    if (item.requires && !item.requires.every((id) => used.has(id))) continue;
    if (only && !only(item)) continue;
    const seconds = item.sec * pace;
    if (seconds > secondsLeft) continue;
    const gain = gainOf(state, item, importance);
    const perMin = (gain / seconds) * 60;
    if (!best || perMin > best.perMin) best = { item, gain, perMin, seconds };
  }
  return best && best.perMin >= minGainPerMin ? best : null;
}

/** The estimate of every measure on the 0-100 scale, with its sd in points. */
function estimates(state, statIds) {
  const out = {};
  for (const id of statIds) {
    const p = posterior(state, id);
    out[id] = { value: 50 + POP_SD * p.mean, sd: POP_SD * p.sd, dataValue: 50 + POP_SD * p.dataZ, P: p.P };
  }
  return out;
}

module.exports = { POP_SD, FAMILIES, RHO, emptyState, bump, familyTerm, posterior, sdWith, gainOf, pickNext, estimates };
