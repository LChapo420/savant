/**
 * Compare runs of the simulation on one ruler (docs/SCORECARD-REAL.md). SIMULATED: nothing here is a real learner.
 *   node scripts/scorecard-real-compare.js --dir=D --run=NAME:CAL:HELD[,...] [--base=NAME] [--json=out.json]
 * CAL and HELD are dump prefixes in D (the shards PREFIX-0.json, PREFIX-1.json ...). Ruler as in docs/SCORECARD-LIVE.md section 3: accuracy = 100 - the learner's mean absolute error over the
 * 100 measures against the simulated truth; guess = the calibration population's mean; removed = 1 - error / guess error; worst 1 / 5 / 10% = the learners each row itself serves worst.
 * S0 the card; S1 recalibrated on card number and confidence; S1f also answer-log features; S1d also the planner's own estimate of the measure. With --base, each row is compared learner by
 * learner against that run (same held seed only): mean change and how many learners lose more than 0.5.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const R = require('../services/scorecard/readout');
const { ALL_FEATURES } = require('../services/scorecard/log-features');
const { STATS } = require('../services/scorecard/stats');
const { INDEX } = require('../services/scorecard/ceilings');

const argv = process.argv.slice(2);
const arg = (n, d = '') => { const x = argv.find((s) => s.startsWith(`--${n}=`)); return x ? x.slice(n.length + 3) : d; };
const DIR = arg('dir', '.');
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
function load(prefix) {
  const out = [];
  for (let i = 0; ; i++) { const f = path.join(DIR, `${prefix}-${i}.json`); if (!fs.existsSync(f)) break; out.push(...JSON.parse(fs.readFileSync(f, 'utf8')).learners); }
  if (!out.length) throw new Error(`no dump ${prefix}`);
  return out;
}
const ids = STATS.map((s) => s.id);
const kindOf = (L) => (L.ext && L.ext.kind) || 'ordinary';
const estOf = (L, id) => { const e = L.daily && L.daily.est && L.daily.est[id]; return e ? e : [50, 0]; };

function fit(cal) {
  const models = {}; const dmodels = {};
  for (const id of ids) {
    const rows = cal.map((L) => ({ m: L.app[id][0], conf: L.app[id][2], feat: L.feat, y: L.truth[id] }));
    models[id] = R.fitMeasure(rows, ALL_FEATURES);
    if (cal.some((L) => L.daily && L.daily.est)) {
      const Xd = cal.map((L) => [L.app[id][0], (L.app[id][2] / 100) * (L.app[id][0] - 50), estOf(L, id)[0]]);
      dmodels[id] = R.ridge(Xd, cal.map((L) => L.truth[id]), 2);
    }
  }
  const guess = Object.fromEntries(ids.map((id) => [id, mean(cal.map((L) => L.truth[id]))]));
  return { models, dmodels, guess };
}
const readers = (F) => ({
  guess: (L, id) => F.guess[id],
  S0: (L, id) => L.app[id][0],
  S1: (L, id) => R.readS1({ models: F.models, featNames: ALL_FEATURES }, id, { m: L.app[id][0], conf: L.app[id][2] }),
  S1f: (L, id) => R.readS1({ models: F.models, featNames: ALL_FEATURES }, id, { m: L.app[id][0], conf: L.app[id][2], feat: L.feat }),
  S1d: (L, id) => (F.dmodels[id] ? R.clampPts(R.predictRidge(F.dmodels[id], [L.app[id][0], (L.app[id][2] / 100) * (L.app[id][0] - 50), estOf(L, id)[0]])) : L.app[id][0]),
});
function rowFor(held, read) {
  const per = held.map((L) => 100 - mean(ids.map((id) => Math.abs(read(L, id) - L.truth[id]))));
  const sorted = per.slice().sort((a, b) => a - b);
  const w = (p) => mean(sorted.slice(0, Math.max(1, Math.round(sorted.length * p))));
  // Tailoring decisions (translate.js EDGE 20): a read at 70+ or 30- gives a lesson a direction. Of those, how many point the way the truth does, how many the opposite way; and how many of the truth's clear cases get a direction at all.
  const side = (v) => (v >= 70 ? 1 : v <= 30 ? -1 : 0); let dirs = 0; let right = 0; let wrong = 0; let clear = 0; let found = 0; let cells = 0;
  for (const L of held) for (const id of ids) { const a = side(read(L, id)); const t = side(L.truth[id]); cells += 1; if (t) clear += 1; if (a) { dirs += 1; if (a === t) { right += 1; found += 1; } else if (a === -t) wrong += 1; } }
  return { acc: mean(per), w1: w(0.01), w5: w(0.05), w10: w(0.1), per, dirs: dirs / cells, right: dirs ? right / dirs : 0, wrong: dirs ? wrong / dirs : 0, recall: clear ? found / clear : 0 };
}

function evaluate(name, calP, heldP, F0) {
  const cal = load(calP); const held = load(heldP); const F = F0 || fit(cal); const rd = readers(F);
  const rows = {}; for (const k of Object.keys(rd)) rows[k] = rowFor(held, rd[k]);
  for (const k of Object.keys(rows)) rows[k].removed = 1 - (100 - rows[k].acc) / (100 - rows.guess.acc);
  const byKind = {}; for (const k of new Set(held.map(kindOf))) { const H = held.filter((L) => kindOf(L) === k); byKind[k] = { n: H.length, guess: rowFor(H, rd.guess).acc, S0: rowFor(H, rd.S0).acc, S1f: rowFor(H, rd.S1f).acc }; }
  const byClass = {}; for (const c of new Set(Object.values(INDEX))) { const cids = ids.filter((id) => INDEX[id] === c); const e = (f) => mean(held.map((L) => mean(cids.map((id) => Math.abs(f(L, id) - L.truth[id]))))); byClass[c] = { guess: 100 - e(rd.guess), S0: 100 - e(rd.S0), S1f: 100 - e(rd.S1f), removed: 1 - e(rd.S1f) / e(rd.guess) }; }
  const min = mean(held.map((L) => ((L.daily && L.daily.sec) || 0) / 60));
  return { name, n: held.length, rows, byKind, byClass, minutes: min, days: mean(held.map((L) => L.days || 0)), levels: mean(held.map((L) => L.levels || 0)), F };
}

function main() {
  const out = {}; const lines = [];
  const specs = arg('run').split(',').filter(Boolean).map((s) => s.split(':'));
  for (const [name, calP, heldP, fitFrom] of specs) {
    const F0 = fitFrom ? out[fitFrom].F : null;
    const e = evaluate(name, calP, heldP, F0); out[name] = e;
    const r = e.rows; const f = (x) => x.toFixed(2); const p = (x) => `${Math.round(x * 100)}%`;
    lines.push(`${name}: n ${e.n} min ${Math.round(e.minutes)} levels ${Math.round(e.levels)} | guess ${f(r.guess.acc)} S0 ${f(r.S0.acc)} (${p(r.S0.removed)}) S1 ${f(r.S1.acc)} (${p(r.S1.removed)}) S1f ${f(r.S1f.acc)} (${p(r.S1f.removed)}) S1d ${f(r.S1d.acc)} | S1f worst 1/5/10 ${f(r.S1f.w1)}/${f(r.S1f.w5)}/${f(r.S1f.w10)}`);
    if (arg('base') && out[arg('base')] && name !== arg('base') && out[arg('base')].n === e.n) {
      const b = out[arg('base')].rows;
      for (const k of ['S0', 'S1f']) { const d = r[k].per.map((v, i) => v - b[k].per[i]); const se = Math.sqrt(mean(d.map((x) => (x - mean(d)) ** 2)) / d.length); lines.push(`   vs ${arg('base')} ${k}: ${mean(d) >= 0 ? '+' : ''}${mean(d).toFixed(2)} +/- ${se.toFixed(2)}, ${d.filter((x) => x < -0.5).length} of ${d.length} lose over 0.5, worst change ${Math.min(...d).toFixed(2)}`); }
    }
    if (argv.includes('--dirs')) lines.push(`   decisions S0: ${p(r.S0.dirs)} of cells, right ${p(r.S0.right)} wrong-way ${p(r.S0.wrong)} caught ${p(r.S0.recall)} | S1f: ${p(r.S1f.dirs)} of cells, right ${p(r.S1f.right)} wrong-way ${p(r.S1f.wrong)} caught ${p(r.S1f.recall)}`);
    if (argv.includes('--kinds')) lines.push(`   kinds ${Object.entries(e.byKind).sort((a, c) => a[1].S1f - c[1].S1f).map(([k, v]) => `${k}(${v.n}) ${v.guess.toFixed(1)}>${v.S1f.toFixed(1)}`).join(' ')}`);
    if (argv.includes('--classes')) lines.push(`   classes ${Object.entries(e.byClass).map(([k, v]) => `${k} ${v.guess.toFixed(1)}>${v.S1f.toFixed(1)}`).join(' ')}`);
  }
  console.log(lines.join('\n'));
  if (arg('json')) { const slim = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, { ...v, F: undefined, rows: Object.fromEntries(Object.entries(v.rows).map(([a, b]) => [a, { acc: b.acc, w1: b.w1, w5: b.w5, w10: b.w10, removed: b.removed, dirs: b.dirs, right: b.right, wrong: b.wrong, recall: b.recall }])) }])); fs.writeFileSync(arg('json'), JSON.stringify(slim)); }
}
main();
