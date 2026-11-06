/**
 * The calibrated read-out of the card (docs/SCORECARD-95.md; SIMULATED fit, no real-learner proof). Two layers over a measure's own evidence, each behind its own switch and
 * both OFF unless their file exists AND the switch is set, so nothing changes by default:
 *   SCORECARD_RECAL=1  S1: a measure's number is re-read from its measured value and confidence by a per-measure ridge (or kept as is, or the population mean, whichever
 *                      held out best when fitted). Optional answer-log features are used only when the caller has them.
 *   SCORECARD_JOINT=1  S2: the whole vector of S1 reads is combined by a fitted joint (cross-measure) regression, so a measure also learns from the ones that move with it.
 * The artifact (READOUT_FILE, default data/scorecard-readout.json) is written by scripts/scorecard-95-fit.js (simulated data) or scripts/scorecard-95-refit.js (real testers).
 * A fit made on simulated learners carries the simulation's own validities; if real learners differ the numbers are wrong in proportion: refit on real data before relying on it.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const FILE = () => process.env.READOUT_FILE || path.join(__dirname, '..', '..', 'data', 'scorecard-readout.json');
const clampPts = (v) => Math.max(2, Math.min(98, v));
const mean = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);

function solve(A, b) { // gauss, small systems
  const n = b.length; const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]]; const d = M[c][c] || 1e-9;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / d; if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, i) => r[n] / (r[i] || 1e-9));
}

/** Ridge on standardised columns. Returns { mu, sd, w, b } with prediction b + sum w_c (x_c - mu_c)/sd_c. */
function ridge(X, y, lam) {
  const p = X[0].length; const mu = X[0].map((_, c) => mean(X.map((r) => r[c])));
  const sd = X[0].map((_, c) => Math.sqrt(mean(X.map((r) => (r[c] - mu[c]) ** 2))) || 1);
  const Z = X.map((r) => r.map((v, c) => (v - mu[c]) / sd[c])); const b = mean(y);
  const A = Array.from({ length: p }, (_, i) => Array.from({ length: p }, (_, j) => Z.reduce((s, r) => s + r[i] * r[j], 0) + (i === j ? lam * X.length / 100 : 0)));
  const w = solve(A, Array.from({ length: p }, (_, i) => Z.reduce((s, r, k) => s + r[i] * (y[k] - b), 0)));
  return { mu, sd, w, b };
}
const predictRidge = (m, x) => m.b + m.w.reduce((s, w, c) => s + w * (x[c] - m.mu[c]) / m.sd[c], 0);

/** The columns of a measure's own reading: its measured value, confidence-weighted distance from the middle, and (optional) answer-log features. */
const simpleCols = (m, conf) => [m, (conf / 100) * (m - 50)];

/** Fit S1 for one measure. rows: [{ m, conf, feat?, y }]. Chooses among prior / asis / simple (5-fold). */
function fitMeasure(rows, featNames) {
  const n = rows.length; const y = rows.map((r) => r.y); const my = mean(y);
  const cv = (build, lam) => { let se = 0; for (let f = 0; f < 5; f++) { const tr = []; const te = []; rows.forEach((r, i) => (i % 5 === f ? te : tr).push(i)); const mod = ridge(tr.map((i) => build(rows[i])), tr.map((i) => y[i]), lam); for (const i of te) se += (y[i] - predictRidge(mod, build(rows[i]))) ** 2; } return se / n; };
  const simple = (r) => simpleCols(r.m, r.conf);
  const hasFeat = featNames && rows.every((r) => r.feat && featNames.every((k) => Number.isFinite(r.feat[k])));
  const full = (r) => [...featNames.map((k) => r.feat[k]), ...simpleCols(r.m, r.conf)];
  const cands = [{ kind: 'prior', mse: mean(y.map((v) => (v - my) ** 2)) }, { kind: 'asis', mse: mean(rows.map((r) => (y[rows.indexOf(r)] - r.m) ** 2)) }, { kind: 'simple', mse: cv(simple, 0.5) }];
  const best = cands.reduce((a, c) => (c.mse < a.mse ? c : a));
  const out = { kind: best.kind, mean: my, cvRmse: Math.sqrt(best.mse) };
  if (best.kind === 'simple') out.simple = ridge(rows.map(simple), y, 0.5);
  if (hasFeat) { const fm = cv(full, 8); out.fullCvRmse = Math.sqrt(fm); if (fm < best.mse * 0.995) out.full = ridge(rows.map(full), y, 8); }
  return out;
}

/** One measure's S1 read in points. `feat` only if the caller has the answer-log features named in the artifact. */
function readS1(art, id, { m, conf, feat }) {
  const mod = art.models[id]; if (!mod) return m;
  // a "mix" (after a refit on real learners) moves from the model that was in force (a) toward the newly fitted one (b) by alpha
  const one = (md) => {
    if (md.full && feat && art.featNames && art.featNames.every((k) => feat[k] !== undefined)) return clampPts(predictRidge(md.full, [...art.featNames.map((k) => feat[k]), ...simpleCols(m, conf)]));
    if (md.kind === 'prior') return md.mean;
    if (md.kind === 'asis') return clampPts(m);
    return clampPts(predictRidge(md.simple, simpleCols(m, conf)));
  };
  if (mod.kind === 'mix') { const a = one(mod.a); return clampPts(a + mod.alpha * (one(mod.b) - a)); }
  return one(mod);
}

/** S2: the joint regression of truth on every measure's S1 read. `x` is { id: points }; a measure without a read enters at its population mean (no information). */
function readS2(art, x) {
  const ids = art.ids; const v = ids.map((id, k) => (x[id] === undefined ? art.s2.mu[k] : x[id]) - art.s2.mu[k]);
  return Object.fromEntries(ids.map((id, k) => { let s = art.s2.muT[k]; const Wk = art.s2.W[k]; for (let j = 0; j < v.length; j++) s += Wk[j] * v[j]; return [id, clampPts(s)]; }));
}

let cache = { file: null, mtime: 0, art: null };
function load() {
  const f = FILE(); try { const st = fs.statSync(f); if (cache.file !== f || cache.mtime !== st.mtimeMs) cache = { file: f, mtime: st.mtimeMs, art: JSON.parse(fs.readFileSync(f, 'utf8')) }; return cache.art; } catch { return null; }
}
const recalOn = () => process.env.SCORECARD_RECAL === '1' || process.env.SCORECARD_JOINT === '1';
const jointOn = () => process.env.SCORECARD_JOINT === '1';

module.exports = { ridge, predictRidge, fitMeasure, readS1, readS2, load, recalOn, jointOn, simpleCols, clampPts, mean, solve };
