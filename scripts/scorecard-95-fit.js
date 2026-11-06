/**
 * Fit the live read-out (services/scorecard/readout.js, S1 and S2) on SIMULATED calibration dumps and score it on a HELD-OUT seed. Nothing here is a real learner.
 *   node scripts/scorecard-95-fit.js --cal=a.json,b.json,... --held=name=f1,f2;name2=f3 [--out=artifact.json] [--s2-off=0.7] [--json=report.json]
 * Ruler (same as docs/SCORECARD-LIVE.md section 3): accuracy = 100 - the learner's mean absolute error over the card's measures against the simulated truth; guess = the
 * calibration population's mean per measure; worst 10% / 1% = the learners the guess serves worst (the same learners for every row); removed = 1 - error / guess error.
 * Rows: S0 (card as is), S1 (recalibrated, card number + confidence only: what the live path has), S1f (S1 plus answer-log features: needs the log extractor live; NOT wired),
 * S2 (joint regression over all S1 reads), S2f (the same over S1f reads).
 */
'use strict';
const fs = require('fs');
const R = require('../services/scorecard/readout');
const { FEATURES } = require('./lib/sim-gate');

const argv = process.argv.slice(2);
const arg = (n, d = '') => { const a = argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const OFF = Number(arg('s2-off', 0.7)); const LAM2 = Number(arg('s2-lam', 0.08));
const load = (spec) => spec.split(',').filter(Boolean).flatMap((f) => JSON.parse(fs.readFileSync(f, 'utf8')).learners);
const mean = R.mean;

function fitAll(C, ids) {
  const models = {};
  for (const id of ids) models[id] = R.fitMeasure(C.map((L) => ({ m: L.app[id][0], conf: L.app[id][2], feat: L.feat, y: L.truth[id] })), FEATURES);
  return models;
}
const s1 = (models, L, id, useFeat) => R.readS1({ models, featNames: FEATURES }, id, { m: L.app[id][0], conf: L.app[id][2], feat: useFeat ? L.feat : undefined });

/** Out-of-fold S1 reads of the calibration learners (5 folds by learner), then the joint regression of truth on all of them. */
function fitJoint(C, ids, useFeat, off, lam) {
  const oof = C.map(() => ({})); const F = 5;
  for (let f = 0; f < F; f++) {
    const mods = fitAll(C.filter((_, i) => i % F !== f), ids);
    C.forEach((L, i) => { if (i % F === f) for (const id of ids) oof[i][id] = s1(mods, L, id, useFeat); });
  }
  const m = ids.length; const n = C.length;
  const xmu = ids.map((id) => mean(oof.map((o) => o[id]))); const muT = ids.map((id) => mean(C.map((L) => L.truth[id])));
  const X = oof.map((o) => ids.map((id, k) => o[id] - xmu[k])); const Y = C.map((L) => ids.map((id, k) => L.truth[id] - muT[k]));
  const cov = (A, B) => Array.from({ length: m }, (_, a) => Array.from({ length: m }, (_, b) => A.reduce((s, r, i) => s + r[a] * B[i][b], 0) / n));
  const Cxx = cov(X, X); const Cyx = cov(Y, X); const avg = mean(Cxx.map((r, a) => r[a]));
  for (let a = 0; a < m; a++) for (let b = 0; b < m; b++) { if (a !== b) { Cxx[a][b] *= off; Cyx[a][b] *= off; } else Cxx[a][b] += lam * avg; }
  return { mu: xmu, muT, W: Cyx.map((row) => R.solve(Cxx, row)) };
}
function s2(art, models, ids, L, useFeat) {
  const x = ids.map((id, k) => s1(models, L, id, useFeat) - art.mu[k]);
  return Object.fromEntries(ids.map((id, k) => [id, R.clampPts(art.muT[k] + art.W[k].reduce((s, w, j) => s + w * x[j], 0))]));
}

function main() {
  const cal = load(arg('cal'));
  const ids = Object.keys(cal[0].truth).filter((id) => cal.every((L) => L.truth[id] !== undefined && L.app[id]));
  const models = fitAll(cal, ids); const J1 = fitJoint(cal, ids, false, OFF, LAM2); const J2 = fitJoint(cal, ids, true, OFF, LAM2);
  const gbMean = Object.fromEntries(ids.map((id) => [id, mean(cal.map((L) => L.truth[id]))]));
  if (arg('out')) {
    const rnd = (v) => Math.round(v * 1e5) / 1e5;
    fs.writeFileSync(arg('out'), JSON.stringify({ version: 1, fitted_on: 'SIMULATED learners', n: cal.length, ids, featNames: FEATURES, models, s2: { mu: J1.mu, muT: J1.muT, W: J1.W.map((r) => r.map(rnd)) } }));
  }
  const per = (L, f) => mean(ids.map((id) => Math.abs(f(id) - L.truth[id])));
  const report = {};
  for (const spec of arg('held').split(';').filter(Boolean)) {
    const [name, files] = spec.split('='); const H = load(files);
    const rows = { S0: [], S1: [], S1f: [], S2: [], S2f: [], GB: [] };
    for (const L of H) {
      rows.S0.push(per(L, (id) => R.clampPts(L.app[id][0]))); rows.GB.push(per(L, (id) => gbMean[id]));
      rows.S1.push(per(L, (id) => s1(models, L, id, false))); rows.S1f.push(per(L, (id) => s1(models, L, id, true)));
      const a = s2(J1, models, ids, L, false); rows.S2.push(per(L, (id) => a[id]));
      const b = s2(J2, models, ids, L, true); rows.S2f.push(per(L, (id) => b[id]));
    }
    const order = rows.GB.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).map((x) => x[1]); // learners the guess serves worst first
    const wk = (q) => order.slice(0, Math.max(1, Math.ceil(H.length * q)));
    const res = {}; const lines = [];
    for (const st of Object.keys(rows)) {
      const rem = (ix) => 1 - mean(ix.map((i) => rows[st][i])) / mean(ix.map((i) => rows.GB[i]));
      const all = H.map((_, i) => i);
      res[st] = { acc: +(100 - mean(rows[st])).toFixed(2), worst10: +(100 - mean(wk(0.1).map((i) => rows[st][i]))).toFixed(2), worst1: +(100 - mean(wk(0.01).map((i) => rows[st][i]))).toFixed(2), removed: +(rem(all) * 100).toFixed(1), removed_w10: +(rem(wk(0.1)) * 100).toFixed(1), removed_w1: +(rem(wk(0.01)) * 100).toFixed(1) };
      lines.push(`${name} ${st.padEnd(3)} n=${H.length} acc ${res[st].acc} | worst10 ${res[st].worst10} worst1% ${res[st].worst1} | removed ${res[st].removed}% w10 ${res[st].removed_w10}% w1% ${res[st].removed_w1}%`);
    }
    const grp = (key) => { const g = {}; H.forEach((L, i) => { const k = key(L); if (k) (g[k] = g[k] || []).push(i); }); return g; };
    const gtab = {};
    for (const [label, g] of [['kind', grp((L) => (L.ext ? L.ext.kind : 'ordinary'))], ['age', grp((L) => L.age || null)]]) {
      for (const [k, ix] of Object.entries(g)) gtab[`${label}:${k}`] = { n: ix.length, GB: +(100 - mean(ix.map((i) => rows.GB[i]))).toFixed(2), ...Object.fromEntries(['S0', 'S1', 'S2', 'S2f'].map((st) => [st, +(100 - mean(ix.map((i) => rows[st][i]))).toFixed(2)])) };
    }
    report[name] = { n: H.length, res, groups: gtab, worseS1: rows.S1.filter((e, i) => e - rows.S0[i] > 0.5).length, worseS2: rows.S2.filter((e, i) => e - rows.S0[i] > 0.5).length };
    console.log(lines.join('\n')); console.log(`${name}: learners worse than S0 by >0.5 pt: S1 ${report[name].worseS1}, S2 ${report[name].worseS2}`);
    for (const [k, v] of Object.entries(gtab)) console.log(`  ${k.padEnd(18)} n=${String(v.n).padEnd(3)} guess ${v.GB} S0 ${v.S0} S1 ${v.S1} S2 ${v.S2} S2f ${v.S2f}`);
  }
  if (arg('json')) fs.writeFileSync(arg('json'), JSON.stringify(report, null, 1));
}
if (require.main === module) main();
module.exports = { fitAll, fitJoint, s1, s2, load };
