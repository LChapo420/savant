/**
 * The onboarding measurement model: how much a set of answers tells us about each of the 100 scorecard measures, and which item to ask next.
 *
 * Everything here is a MODEL with stated assumptions, not a finding about real learners (docs/ONBOARDING-MODES.md says which numbers are
 * simulated and which assumption each rests on). The assumptions, all in the open:
 *
 *   - A measure is a standard-normal trait z (population sd POP_SD = 17 points, the value under which "guess the mean" costs a mean absolute
 *     error of 13.6 points, as in docs/SCORECARD-90.md).
 *   - CORRELATED TRAITS (round 3, 3 Nov). Traits are not independent. The prior is the factor model the recovery sim already uses
 *     (scripts/scorecard-recovery-sim.js drawTruth): z_j = lg g + lc c_cat(j) + a specific part, with a general factor g and one factor per scorecard
 *     category (10). The 100 measures and the 11 factors are 111 NODES of one Gaussian; an item reads nodes (a measure, or a factor: a self-rating of
 *     "how fast I pick things up" reads g). After every answer the posterior over ALL nodes is updated, so one answer moves every related trait.
 *     The loadings are a scenario (LOADINGS: low / central / high) with the evidence in
 *     curriculum-build/evidence-article/09-work/validity-scenarios.json (truth_correlation): the cognitive loading is supported by one meta-analysis
 *     (Warne 2019, a general factor explains about 46% of cognitive-test variance), the personality-like loadings are an unsupported conservative
 *     guess. Setting the prior to null gives the earlier independent model, which the simulator uses to show what the correlations are worth.
 *   - An item i of method FAMILY f reads a node j with a validity r (its correlation with the true value). Items of one family on one node also
 *     share a persistent method error (a person who flatters themselves does so on every self-report item; a task has its own quirks), so
 *     repeating the same kind of item stops helping: with item validity r and family ceiling rho, two items correlate r1 r2 / rho^2, and no
 *     number of items of that family can read the node better than rho. Families fail independently, so mixing methods is what raises accuracy.
 *   - The reading of one family is the mean of its items' standardised readings; its information about z is r^2 / (v - r^2) with v the variance of
 *     that mean (see familyTerm). Families add. Readings of different nodes carry independent errors (an item that reads several nodes is modelled
 *     as one independent reading of each: this overstates what a many-node item gives; the simulator's --shared-noise run tests it).
 *   - Posterior: information form. Prior covariance R (unit variance, factor structure), data precision D (diagonal, from the families) and data
 *     vector h: posterior covariance C = (R^-1 + D)^-1 and mean C h. Because the model is linear-Gaussian, C does not depend on the answers, only
 *     on which items were asked, so it is kept up to date by a rank-k (Woodbury) update after each answer.
 *
 * VALIDITY SCENARIOS (RHO, SCENARIOS): the family ceilings come in three sets. `pessimistic` is the set this module used before the research check
 * (from memory), `central` the research-checked set (shipped), `optimistic` the upper end of the cited ranges. An item's own validity scales with
 * its family's ceiling (eff()), so a scenario moves every item together.
 *
 * Adaptive choice (pickNext): after every answer, the next item is the one with the largest drop in the sum of posterior sds (points) over the 100
 * measures per expected second, at the learner's own observed pace, among items that still fit in the time left. It stops when the best
 * item's gain per minute falls below the mode's threshold, or the time is spent.
 */
'use strict';

const { STATS } = require('../scorecard/stats');

const POP_SD = 17;

/** Method families (best any number of items of that family could read a node) per scenario. Anchors: validity-scenarios.json. */
const TODAY_RHO = { self: 0.45, goal: 0.5, wm: 0.85, speed: 0.8, read: 0.75, reason: 0.75, switch: 0.5, ml: 0.55, taste: 0.45, conf: 0.55, scale: 0.55, tap: 0.67 };
// scale (IPIP agreement items) and tap (own-wording "which would you do next" taps) are the daily check's two designed sources: the ceilings are the square roots of
// docs/SCORECARD-90.md section 6's reliabilities (scale 0.3, range 0.2 to 0.4; taps 0.45, range 0.3 to 0.55). ASSUMED, never measured on learners.
const SCENARIOS = {
  pessimistic: { ...TODAY_RHO },
  central: { self: 0.45, goal: 0.5, wm: 0.82, speed: 0.8, read: 0.75, reason: 0.75, switch: 0.5, ml: 0.42, taste: 0.45, conf: 0.55, scale: 0.55, tap: 0.67 },
  optimistic: { self: 0.56, goal: 0.5, wm: 0.91, speed: 0.89, read: 0.75, reason: 0.85, switch: 0.71, ml: 0.56, taste: 0.45, conf: 0.55, scale: 0.63, tap: 0.74 },
  // the LOW end of the section 6 ranges for every family the daily check uses (used for the simulated world only; the planner still believes `central`, as it would in the field)
  low6: { self: 0.4, goal: 0.45, wm: 0.74, speed: 0.72, read: 0.7, reason: 0.68, switch: 0.45, ml: 0.38, taste: 0.4, conf: 0.5, scale: 0.45, tap: 0.55 },
};
/** Loadings of the true values on the general factor and the category factor: [g, category]. Evidence: validity-scenarios.json truth_correlation. */
const LOADINGS = {
  low: { cog: [0.5, 0.3], other: [0.25, 0.4] },       // the recovery sim's own assumption
  central: { cog: [0.65, 0.3], other: [0.25, 0.4] },  // cognitive: Warne 2019 (a general factor explains about 46% of test variance); other: unsupported guess
  high: { cog: [0.77, 0.3], other: [0.4, 0.4] },      // cognitive: one SD above that mean; other: unsupported what-if
  cogonly: { cog: [0.65, 0.3], other: [0, 0] },       // only the cognitive traits correlate (the part the evidence supports); the others independent
};
const COG_CATS = new Set(['intake', 'reasoning', 'transfer']);

const FAMILIES = {
  self: { rho: SCENARIOS.central.self, label: 'forced-choice self-report' },     // self-evaluation vs performance r = .29 (Mabe & West 1982); range .42-.56 for trait-to-behaviour (Fleeson & Gallagher 2009)
  goal: { rho: SCENARIOS.central.goal, label: 'interests and goals survey' },     // unsupported, conservative guess
  wm: { rho: SCENARIOS.central.wm, label: 'working-memory span' },               // span retest .52-.81 (Waters & Caplan 2003), automated Ospan retest .83 (Unsworth 2005)
  speed: { rho: SCENARIOS.central.speed, label: 'processing speed' },            // symbol-digit retest reliability high (Strober 2019); the exact .80 and the task's loading are unsupported
  read: { rho: SCENARIOS.central.read, label: 'reading rate and comprehension' }, // unsupported, conservative guess
  reason: { rho: SCENARIOS.central.reason, label: 'short reasoning items' },     // a 9-item matrices form predicts the 60-item total at r .90 (Bilker 2012); single-item values unsupported
  switch: { rho: SCENARIOS.central.switch, label: 'task switching' },            // switch-cost reliability depends on scoring (Hughes 2014); no source states .5
  ml: { rho: SCENARIOS.central.ml, label: 'mini-lesson choice points' },         // behaviour averaged over many occasions .42-.56 (Fleeson & Gallagher 2009); one episode is lower
  taste: { rho: SCENARIOS.central.taste, label: 'A/B teaching taste and recall' }, // unsupported; preference does not predict benefit well (Pashler 2008)
  scale: { rho: SCENARIOS.central.scale, label: 'IPIP scale items (agreement)' },
  tap: { rho: SCENARIOS.central.tap, label: 'which-would-you-do-next taps (own wording, not validated)' },
  conf: { rho: SCENARIOS.central.conf, label: 'confidence ratings' },            // confidence is a stable trait (Pallier 2002); the coefficient is unsupported
};
const RHO = Object.fromEntries(Object.entries(FAMILIES).map(([k, v]) => [k, v.rho]));
let SCENARIO = 'central';
/** Switch the active validity scenario (the selector's belief). The simulator keeps its own world scenario via effIn(). */
function setScenario(name) {
  if (!SCENARIOS[name]) throw new Error(`unknown validity scenario ${name}`);
  SCENARIO = name;
  Object.assign(RHO, SCENARIOS[name]);
  for (const [k, v] of Object.entries(FAMILIES)) v.rho = RHO[k];
}
const scenario = () => SCENARIO;
/** An item's validity under a scenario: its base value scaled with its family's ceiling, never above it. */
const effIn = (scn, family, r) => Math.min(SCENARIOS[scn][family], (r * SCENARIOS[scn][family]) / TODAY_RHO[family]);
const eff = (family, r) => Math.min(RHO[family] || 0.5, (r * (RHO[family] || 0.5)) / (TODAY_RHO[family] || 0.5));

/** A state is { fam: { node: { family: { n, S, Q, X } } } }: counts, sum r, sum r^2, sum of signed standardised readings. */
const emptyState = () => ({ fam: {} });

function bump(state, stat, family, r, x) {
  const byStat = state.fam[stat] || (state.fam[stat] = {});
  const f = byStat[family] || (byStat[family] = { n: 0, S: 0, Q: 0, X: 0 });
  f.n += 1; f.S += r; f.Q += r * r; f.X += x;
}

/** The precision and the precision-weighted reading of one family on one node. */
function familyTerm(f, family) {
  if (!f || !f.n) return { P: 0, num: 0 };
  const rho = RHO[family] || 0.5;
  const n = f.n;
  const rbar = f.S / n;
  const v = 1 / n + (f.S * f.S - f.Q) / (n * n * rho * rho);   // variance of the mean of n standardised readings
  const s = Math.max(1e-6, v - rbar * rbar);                    // what is left once the true-value part is taken out
  return { P: (rbar * rbar) / s, num: (rbar * (f.X / n)) / s };
}

// ── the prior: a factor model over 100 measures + 11 factors ─────────────────────────────────────────────────────────────────────────────
const FACTOR_IDS = ['F:g', ...[...new Set(STATS.map((s) => s.category))].map((c) => `F:${c}`)];
const NODE_IDS = [...STATS.map((s) => s.id), ...FACTOR_IDS];
const NODE_INDEX = new Map(NODE_IDS.map((id, i) => [id, i]));
const N_STATS = STATS.length;
const N = NODE_IDS.length;

/** The loadings of every measure under a loadings set: [{ lg, lc, cat }] in STATS order. */
function loadingsOf(level) {
  const L = LOADINGS[level];
  if (!L) throw new Error(`unknown loadings ${level}`);
  return STATS.map((s) => { const [lg, lc] = COG_CATS.has(s.category) ? L.cog : L.other; return { lg, lc, cat: NODE_INDEX.get(`F:${s.category}`) }; });
}
/** The 111 x 111 prior covariance (unit variances) of measures and factors under a loadings set. */
function priorFor(level) {
  const ld = loadingsOf(level);
  const R = new Float64Array(N * N);
  const g = NODE_INDEX.get('F:g');
  for (let j = 0; j < N; j++) R[j * N + j] = 1;
  for (let j = 0; j < N_STATS; j++) {
    R[j * N + g] = R[g * N + j] = ld[j].lg;
    R[j * N + ld[j].cat] = R[ld[j].cat * N + j] = ld[j].lc;
    for (let k = j + 1; k < N_STATS; k++) {
      const c = ld[j].lg * ld[k].lg + (ld[j].cat === ld[k].cat ? ld[j].lc * ld[k].lc : 0);
      R[j * N + k] = R[k * N + j] = c;
    }
  }
  return { level, R, loadings: ld };
}
let PRIOR = null;
const caches = new WeakMap();
/** Set the selector's belief about how traits correlate: 'low' | 'central' | 'high', or null for independent traits (the earlier model). */
function setPrior(level) { PRIOR = level ? priorFor(level) : null; }
const priorLevel = () => (PRIOR ? PRIOR.level : null);

function chol(M, n) {
  const L = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    let s = M[i * n + j];
    for (let k = 0; k < j; k++) s -= L[i * n + k] * L[j * n + k];
    if (i === j) L[i * n + j] = Math.sqrt(Math.max(s, 1e-12)); else L[i * n + j] = s / L[j * n + j];
  }
  return L;
}
function invertSpd(M, n) {
  const L = chol(M, n); const out = new Float64Array(n * n); const y = new Float64Array(n);
  for (let c = 0; c < n; c++) {
    for (let i = 0; i < n; i++) { let s = i === c ? 1 : 0; for (let k = 0; k < i; k++) s -= L[i * n + k] * y[k]; y[i] = s / L[i * n + i]; }
    for (let i = n - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < n; k++) s -= L[k * n + i] * out[k * n + c]; out[i * n + c] = s / L[i * n + i]; }
  }
  return out;
}

/** Per-node data precision P and information vector h from a state. */
function dataOf(state) {
  const P = new Float64Array(N); const h = new Float64Array(N);
  for (const [node, byStat] of Object.entries(state.fam)) {
    const j = NODE_INDEX.get(node); if (j === undefined) continue;
    for (const [family, f] of Object.entries(byStat)) { const t = familyTerm(f, family); P[j] += t.P; h[j] += t.num; }
  }
  return { P, h };
}
/** Posterior covariance after rank-k precision additions dP on nodes S, from covariance C: C - C_:S (dP^-1 + C_SS)^-1 C_S: */
function woodbury(C, S, dP) {
  const k = S.length;
  const M = new Float64Array(k * k);
  for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) M[a * k + b] = C[S[a] * N + S[b]] + (a === b ? 1 / dP[a] : 0);
  const Mi = invertSpd(M, k);
  const T = new Float64Array(N * k);   // C_:S Mi
  for (let i = 0; i < N; i++) for (let b = 0; b < k; b++) { let s = 0; for (let a = 0; a < k; a++) s += C[i * N + S[a]] * Mi[a * k + b]; T[i * k + b] = s; }
  const out = Float64Array.from(C);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { let s = 0; for (let b = 0; b < k; b++) s += T[i * k + b] * C[S[b] * N + j]; out[i * N + j] -= s; }
  return out;
}
/** The posterior covariance C, precision P and information h for a state, kept current with an incremental update. */
function engine(state) {
  const { P, h } = dataOf(state);
  let c = caches.get(state);
  if (c && c.prior === PRIOR) {
    const S = []; const dP = [];
    for (let j = 0; j < N; j++) { const d = P[j] - c.P[j]; if (Math.abs(d) > 1e-12) { S.push(j); dP.push(d); } }
    if (S.length === 0) { c.h = h; return c; }
    if (S.length <= 12 && dP.every((d) => d > 0)) { c.C = woodbury(c.C, S, dP); c.P = P; c.h = h; return c; }
  }
  const S = []; const dP = [];
  for (let j = 0; j < N; j++) if (P[j] > 1e-12) { S.push(j); dP.push(P[j]); }
  const C = S.length ? woodbury(PRIOR.R, S, dP) : Float64Array.from(PRIOR.R);
  c = { prior: PRIOR, C, P, h };
  caches.set(state, c);
  return c;
}

/** Posterior of one measure: { mean (z), sd (z), P (precision gained), dataZ (the equivalent data-only reading, in z) }. */
function posterior(state, stat) {
  if (PRIOR && NODE_INDEX.has(stat)) {
    const e = engine(state); const j = NODE_INDEX.get(stat);
    let mean = 0; for (let k = 0; k < N; k++) mean += e.C[j * N + k] * e.h[k];
    const v = Math.max(1e-9, e.C[j * N + j]);
    const P = 1 / v - 1;
    return { mean, sd: Math.sqrt(v), P, dataZ: P > 1e-9 ? (mean * (1 + P)) / P : 0 };
  }
  const byStat = state.fam[stat];
  let P = 0; let num = 0;
  if (byStat) for (const [family, f] of Object.entries(byStat)) { const t = familyTerm(f, family); P += t.P; num += t.num; }
  return { mean: num / (1 + P), sd: Math.sqrt(1 / (1 + P)), P, dataZ: P > 0 ? num / P : 0 };
}

/** The total data precision of a node if one more item of this family and (effective) validity r were added. */
function precisionWith(state, stat, family, r) {
  const f = state.fam[stat] && state.fam[stat][family];
  const base = state.fam[stat] || {};
  let P = 0;
  for (const [fam, ff] of Object.entries(base)) if (fam !== family) P += familyTerm(ff, fam).P;
  const g = f ? { n: f.n + 1, S: f.S + r, Q: f.Q + r * r, X: f.X } : { n: 1, S: r, Q: r * r, X: 0 };
  return P + familyTerm(g, family).P;
}
/** The posterior sd (z units) of a measure if one more item of this family and validity were added (independent traits only). */
function sdWith(state, stat, family, r) { return Math.sqrt(1 / (1 + precisionWith(state, stat, family, r))); }

const IS_STAT = new Map(STATS.map((s, i) => [s.id, i]));
/** Points of total posterior sd an item would remove, summed over all 100 measures (importance-weighted). With correlated traits one item moves every related measure. */
function gainOf(state, item, importance) {
  if (!PRIOR) {
    let gain = 0;
    for (const inf of item.informs) {
      if (!IS_STAT.has(inf.stat)) continue;   // a factor reading means nothing to independent traits
      const before = Math.sqrt(1 / (1 + posterior(state, inf.stat).P));
      const after = sdWith(state, inf.stat, item.family, eff(item.family, inf.r));
      gain += ((importance && importance[inf.stat]) || 1) * (before - after) * POP_SD;
    }
    return gain;
  }
  const e = engine(state);
  const S = []; const dP = [];
  for (const inf of item.informs) {
    const j = NODE_INDEX.get(inf.stat); if (j === undefined) continue;
    const d = precisionWith(state, inf.stat, item.family, eff(item.family, inf.r)) - e.P[j];
    if (d > 1e-12) { S.push(j); dP.push(d); }
  }
  const k = S.length;
  if (!k) return 0;
  const M = new Float64Array(k * k);
  for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) M[a * k + b] = e.C[S[a] * N + S[b]] + (a === b ? 1 / dP[a] : 0);
  const Mi = invertSpd(M, k);
  let gain = 0;
  const col = new Float64Array(k);
  for (let i = 0; i < N_STATS; i++) {
    const cii = e.C[i * N + i];
    for (let a = 0; a < k; a++) col[a] = e.C[i * N + S[a]];
    let q = 0;
    for (let a = 0; a < k; a++) { let s = 0; for (let b = 0; b < k; b++) s += Mi[a * k + b] * col[b]; q += col[a] * s; }
    const w = (importance && importance[STATS[i].id]) || 1;
    gain += w * (Math.sqrt(Math.max(1e-12, cii)) - Math.sqrt(Math.max(1e-12, cii - q))) * POP_SD;
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
    if (item.excludes && item.excludes.some((id) => used.has(id))) continue;   // a shortened task and its long version
    if (!PRIOR && item.factor) continue;   // factor items mean something only to correlated traits
    if (only && !only(item)) continue;
    const seconds = item.sec * pace;
    if (seconds > secondsLeft) continue;
    const gain = gainOf(state, item, importance);
    const perMin = (gain / seconds) * 60;
    if (!best || perMin > best.perMin) best = { item, gain, perMin, seconds };
  }
  return best && best.perMin >= minGainPerMin ? best : null;
}

/**
 * The estimate of every measure on the 0-100 scale, with its sd in points. P is the precision gained from the data (with correlated traits,
 * the equivalent single-measure precision of the posterior) and dataValue the reading that, with weight P on a blank card, lands on the posterior mean:
 * that is what services/onboarding/baseline.js feeds the scorecard, so the correlations reach the card without any change to the scorecard.
 */
function estimates(state, statIds) {
  const out = {};
  for (const id of statIds) {
    const p = posterior(state, id);
    out[id] = { value: 50 + POP_SD * p.mean, sd: POP_SD * p.sd, dataValue: 50 + POP_SD * p.dataZ, P: p.P };
  }
  return out;
}
/** The estimate of each of the 11 factors (g and the 10 categories): value and sd in points; only meaningful with a prior set. */
function factorEstimates(state) {
  if (!PRIOR) return {};
  const e = engine(state); const out = {};
  for (const id of FACTOR_IDS) {
    const j = NODE_INDEX.get(id);
    let mean = 0; for (let k = 0; k < N; k++) mean += e.C[j * N + k] * e.h[k];
    out[id] = { value: 50 + POP_SD * mean, sd: POP_SD * Math.sqrt(Math.max(1e-9, e.C[j * N + j])) };
  }
  return out;
}

// The shipped selector assumes that only the cognitive traits correlate (the part the evidence supports: Warne 2019); the personality-like loadings are an
// unsupported guess, and the simulator shows assuming them costs more when wrong (docs/ONBOARDING-MODES.md) than it gains when right.
// ONBOARDING_PRIOR=independent restores the earlier independent model; ONBOARDING_PRIOR=central adds the assumed personality-like loadings.
setPrior(process.env.ONBOARDING_PRIOR === 'independent' ? null : (process.env.ONBOARDING_PRIOR || 'cogonly'));

module.exports = {
  POP_SD, FAMILIES, RHO, TODAY_RHO, SCENARIOS, LOADINGS, FACTOR_IDS, NODE_IDS, COG_CATS,
  setScenario, scenario, eff, effIn, setPrior, priorLevel, priorFor, loadingsOf,
  emptyState, bump, familyTerm, posterior, precisionWith, sdWith, gainOf, pickNext, estimates, factorEstimates,
};
