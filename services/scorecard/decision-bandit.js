/**
 * Outcome-tested decisions (docs/SCORE-MONTH.md part 3). For each content decision that matters, compare the options on THIS learner's own results (retention / understanding score of the
 * lesson, 0-1, e.g. a delayed re-test or the next-day recall check) and converge on what works for them, instead of reading it from a trait. Pure functions over a JSON-able state.
 *
 * Design: every lesson takes one option on every decision at once (a factorial), the outcome is modelled as intercept + sum of option effects, and the effects are fitted by Bayesian ridge
 * regression (prior: each option effect ~ N(population effect, TAU^2)). Options are picked by Thompson sampling on each decision's marginal posterior, with a safety guard so the learner
 * is not made worse than the default lesson while the system learns:
 *   - the default option stays in the draw with at least DEFAULT_FLOOR of assignments until MIN_LESSONS lessons are in;
 *   - an option whose posterior probability of being worse than the default by more than SAFE_MARGIN exceeds SAFE_P is never assigned; draws are tempered (TEMPER x sd).
 * `best` returns each decision's current pick, its probability of being best and whether that is confident (>= APPLY_P). The accuracy that matters here is "picks the option that is actually best
 * for this learner" (correct-choice rate and regret, scripts/score-month-sim.js), not a trait number.
 *
 * Which decisions: DECISIONS below. `modality` assumes the content exists in the options offered (the caller passes `available` to drop unavailable ones).
 */
'use strict';

const DECISIONS = [
  { id: 'explanation_style', options: ['plain', 'analogy', 'story'], default: 'plain', measures: ['narrative_pull', 'relevance_demand', 'elaboration_benefit'] },
  { id: 'example_type', options: ['concrete', 'abstract', 'mixed'], default: 'mixed', measures: ['example_density_need', 'global_framing_need', 'application_orientation'] },
  { id: 'worked_vs_problem', options: ['worked_first', 'problem_first'], default: 'worked_first', measures: ['worked_example_dependence', 'generation_effect', 'productive_struggle'] },
  { id: 'spacing', options: ['short_gap', 'standard_gap', 'long_gap'], default: 'standard_gap', measures: ['decay_rate', 'consolidation_need', 'repetition_tolerance'] },
  { id: 'chunk_size', options: ['small', 'medium', 'large'], default: 'medium', measures: ['chunk_granularity', 'step_explicitness', 'working_memory_span'] },
  { id: 'modality', options: ['text', 'visual', 'audio'], default: 'text', measures: ['spatial_anchoring', 'mnemonic_receptivity', 'enactive_encoding'] },
];
const BY_ID = Object.fromEntries(DECISIONS.map((d) => [d.id, d]));

const TAU = 0.5; // prior sd of a learner's option effect, in outcome-sd units (0.5 = a medium effect is plausible, a large one is rare)
const NOISE = 1; // outcome noise sd of one lesson, same units; the regression uses the residual it sees
const MIN_LESSONS = 12;
const DEFAULT_FLOOR = 0.8;
const SAFE_MARGIN = 0.1;
const APPLY_P = 0.7; // a pick is 'confident' (used by the plan) at P(best) >= this: in simulation such picks were best 72% of the time and within 0.1 sd 93%
const SAFE_P = 0.6; // an option is dropped from the draw when P(worse than the default by SAFE_MARGIN) exceeds this
const TEMPER = 0.5; // Thompson draws use TEMPER x the posterior sd: less exploration, fewer lessons spent on a worse option (tuned on dev seed 31001 only)

// parameter layout: [intercept, then each decision's options in order]
const LAYOUT = (() => { const idx = {}; let k = 1; for (const d of DECISIONS) { idx[d.id] = d.options.map(() => k++); } return { idx, dim: k }; })();

function newState() {
  const n = LAYOUT.dim;
  return { n: 0, xtx: Array.from({ length: n }, () => Array(n).fill(0)), xty: Array(n).fill(0), yy: 0, sum: 0 };
}
const row = (assignment) => { const x = Array(LAYOUT.dim).fill(0); x[0] = 1; for (const d of DECISIONS) { const j = d.options.indexOf(assignment[d.id]); if (j >= 0) x[LAYOUT.idx[d.id][j]] = 1; } return x; };

/** Add one lesson: assignment = { decisionId: option }, outcome in 0-1 (or any consistent scale; it is standardised by the caller or left as is). */
function record(state, assignment, outcome) {
  if (!Number.isFinite(outcome)) return state;
  const x = row(assignment); const n = LAYOUT.dim;
  const xtx = state.xtx.map((r, i) => r.map((v, j) => v + x[i] * x[j]));
  const xty = state.xty.map((v, i) => v + x[i] * outcome);
  return { n: state.n + 1, xtx, xty, yy: state.yy + outcome * outcome, sum: state.sum + outcome };
}

function solve(A, b) { // Gauss-Jordan, small dense, returns { x, inv }
  const n = A.length; const M = A.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)), b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]]; const d = M[c][c] || 1e-12; for (let j = 0; j < 2 * n + 1; j++) M[c][j] /= d;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c]; if (f) for (let j = 0; j < 2 * n + 1; j++) M[r][j] -= f * M[c][j]; }
  }
  return { x: M.map((r) => r[2 * n]), inv: M.map((r) => r.slice(n, 2 * n)) };
}

/**
 * Posterior of the option effects. outcomeSd: the lesson-outcome noise (default: estimated from the data once 10+ lessons, else NOISE).
 * Returns { sigma, arms: { decisionId: [{ option, mean, sd }] }, effects: decision contrasts are mean differences within a decision }.
 */
function posterior(state, opts = {}) {
  // the outcome noise is learned from the residuals once 10+ lessons are in (two passes: solve with NOISE, measure the residual, solve again), kept within 0.15-2 so a lucky fit cannot make it certain
  const first = posteriorAt(state, opts, opts.outcomeSd || NOISE);
  if (opts.outcomeSd || state.n < 10) return first;
  const x = LAYOUT.dim; const mean = new Array(x).fill(0); for (const d of DECISIONS) for (const a of first.arms[d.id]) mean[a.k] = a.mean; mean[0] = first.icpt;
  let sse = state.yy; for (let i = 0; i < x; i++) { sse -= 2 * mean[i] * state.xty[i]; for (let j = 0; j < x; j++) sse += mean[i] * mean[j] * state.xtx[i][j]; }
  const sd = Math.max(0.15, Math.min(2, Math.sqrt(Math.max(sse, 0) / Math.max(1, state.n - DECISIONS.length - 1))));
  return posteriorAt(state, opts, sd);
}
function posteriorAt(state, { popEffects = {} }, noiseSd) {
  const dim = LAYOUT.dim; const s2 = noiseSd ** 2;
  const prec = state.xtx.map((r, i) => r.map((v, j) => v / s2 + (i === j ? (i === 0 ? 1e-6 : 1 / TAU ** 2) : 0)));
  const rhs = state.xty.map((v, i) => v / s2);
  for (const d of DECISIONS) d.options.forEach((o, j) => { rhs[LAYOUT.idx[d.id][j]] += ((popEffects[d.id] || {})[o] || 0) / TAU ** 2; });
  const { x, inv } = solve(prec, rhs);
  const arms = {};
  for (const d of DECISIONS) arms[d.id] = d.options.map((option, j) => { const k = LAYOUT.idx[d.id][j]; return { option, mean: x[k], sd: Math.sqrt(Math.max(inv[k][k], 1e-12)), k }; });
  return { arms, cov: inv, icpt: x[0], noiseSd };
}

const normal = (rng) => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
const cdf = (z) => { const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2); const e = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z / 2); return z >= 0 ? 0.5 * (1 + e) : 0.5 * (1 - e); };

/** One joint draw of a decision's arm means: the arms share an intercept and are estimated together, so they are correlated; independent draws would overstate the doubt. Cholesky of the 2-3 arm covariance, scaled by `temper`. */
function drawArms(post, arms, rng, temper = 1) {
  const k = arms.length; const S = arms.map((a) => arms.map((b) => post.cov[a.k][b.k])); const Lm = Array.from({ length: k }, () => Array(k).fill(0));
  for (let i = 0; i < k; i++) for (let j = 0; j <= i; j++) { let sum = S[i][j]; for (let t = 0; t < j; t++) sum -= Lm[i][t] * Lm[j][t]; Lm[i][j] = i === j ? Math.sqrt(Math.max(sum, 1e-12)) : sum / (Lm[j][j] || 1e-12); }
  const z = arms.map(() => normal(rng)); return arms.map((a, i) => a.mean + temper * Lm[i].reduce((acc, l, j) => acc + l * z[j], 0));
}

/** P(arm a is worse than arm b by more than margin), from the joint posterior (covariance included, since the arms of one decision are estimated together). */
function pWorse(post, a, b, margin = SAFE_MARGIN) {
  const v = post.cov[a.k][a.k] + post.cov[b.k][b.k] - 2 * post.cov[a.k][b.k]; const sd = Math.sqrt(Math.max(v, 1e-12));
  return cdf((b.mean - a.mean - margin) / sd);
}

/** Pick an option for every decision. rng: () => [0,1). available: { decisionId: [options] } to restrict. Returns { assignment, explored } (explored = decisions where it deviated from the current best). */
function choose(state, rng = Math.random, { available = {}, popEffects = {} } = {}) {
  const post = posterior(state, { popEffects }); const assignment = {}; let explored = 0;
  for (const d of DECISIONS) {
    const arms = post.arms[d.id].filter((a) => !available[d.id] || available[d.id].includes(a.option));
    if (!arms.length) continue;
    const def = arms.find((a) => a.option === d.default) || arms[0];
    const safe = arms.filter((a) => a === def || pWorse(post, a, def) <= SAFE_P);
    let pick;
    if (state.n < MIN_LESSONS && rng() < DEFAULT_FLOOR) pick = def;
    else {
      const draw = drawArms(post, safe, rng, TEMPER); let bi = 0; draw.forEach((v, i) => { if (v > draw[bi]) bi = i; }); pick = safe[bi]; // Thompson on the joint posterior
    }
    assignment[d.id] = pick.option;
    const top = safe.reduce((b, a) => (a.mean > b.mean ? a : b));
    if (pick !== top) explored += 1;
  }
  return { assignment, explored };
}

/** Current pick per decision with the probability it is best (Monte Carlo over the joint posterior, 400 draws, fixed seed) and whether that is confident (>= 0.9). */
function best(state, { popEffects = {}, draws = 400 } = {}) {
  const post = posterior(state, { popEffects }); const out = {}; let seed = 12345; const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (const d of DECISIONS) {
    const arms = post.arms[d.id]; const wins = arms.map(() => 0);
    for (let t = 0; t < draws; t++) { const dr = drawArms(post, arms, rng); let bi = 0; dr.forEach((v, i) => { if (v > dr[bi]) bi = i; }); wins[bi] += 1; }
    const top = arms.reduce((b, a, i) => (a.mean > arms[b].mean ? i : b), 0);
    out[d.id] = { option: arms[top].option, pBest: wins[top] / draws, confident: wins[top] / draws >= APPLY_P && state.n >= MIN_LESSONS };
  }
  return out;
}

module.exports = { DECISIONS, BY_ID, TAU, NOISE, MIN_LESSONS, DEFAULT_FLOOR, SAFE_MARGIN, APPLY_P, SAFE_P, TEMPER, newState, record, posterior, choose, best, pWorse };
