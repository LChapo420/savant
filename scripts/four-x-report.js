#!/usr/bin/env node
/**
 * Prints the per-mode tables from a scripts/four-x-sim.js result. SIMULATED.
 *   node scripts/four-x-report.js FILE [--goals=1 week,1 month,1 year] [--compact]
 */
'use strict';
const fs = require('fs');
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const goalsArg = (args.find((a) => a.startsWith('--goals=')) || '').slice(8);
const compact = args.includes('--compact');
const o = JSON.parse(fs.readFileSync(file, 'utf8'));
const goals = goalsArg ? goalsArg.split(',') : Object.keys(o.learners[0].goals);
const pct = (xs, p) => { const s = xs.slice().sort((a, b) => a - b); return s[Math.max(0, Math.min(s.length - 1, Math.floor(p * s.length)))]; };
const avg = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const pts = (x) => (x * 100).toFixed(1);
const f1 = (x) => x.toFixed(1);
const TARGET = { fastest: 4, balanced: 2, highest: 0 };
console.log(`density ${o.density}, seed ${o.seed}, ${o.learners.length} learners SIMULATED`);
for (const g of goals) {
  console.log(`\n## ${g}`);
  const L = o.learners.map((l) => l.goals[g]);
  const base = {};
  for (const b of ['lazy', 'typical', 'diligent']) base[b] = { min: avg(L.map((c) => c[b].min)), rec: avg(L.map((c) => c[b].recall)), tr: avg(L.map((c) => c[b].transfer)) };
  console.log(`baseline minutes (recall, transfer): ` + Object.entries(base).map(([k, v]) => `${k} ${f1(v.min)} (${pts(v.rec)}, ${pts(v.tr)})`).join('; '));
  for (const mode of ['fastest', 'balanced', 'highest']) {
    const cs = L.map((c) => c[mode]);
    const head = `${mode}: ${f1(avg(cs.map((c) => c.min)))} min (read ${f1(avg(cs.map((c) => c.read)))}, practice ${f1(avg(cs.map((c) => c.practice)))}, review ${f1(avg(cs.map((c) => c.review)))}), reviews/part ${avg(cs.map((c) => c.reviews)).toFixed(2)}, skipped ${(avg(cs.map((c) => c.skipped)) * 100).toFixed(0)}%, recall ${pts(avg(cs.map((c) => c.recall)))}, transfer ${pts(avg(cs.map((c) => c.transfer)))}`;
    console.log(head);
    for (const b of ['lazy', 'typical', 'diligent']) {
      const mult = L.map((c) => c[b].min / c[mode].min);
      const dr = L.map((c) => c[mode].recall - c[b].recall);
      const dt = L.map((c) => c[mode].transfer - c[b].transfer);
      const need = mode === 'highest' ? 0 : (mode === 'fastest' ? 4 : 2);
      const reach = L.filter((c) => (need === 0 || c[b].min / c[mode].min >= need) && (mode === 'fastest' ? c[mode].recall >= c[b].recall && c[mode].transfer >= c[b].transfer : c[mode].recall > c[b].recall && c[mode].transfer > c[b].transfer)).length;
      const bar = mode === 'highest' ? 'any time, both higher' : (mode === 'fastest' ? '4x and both equal or higher' : '2x and both higher');
      console.log(`  vs ${b}: x${f1(pct(mult, 0.5))} (P10 x${f1(pct(mult, 0.1))}, P90 x${f1(pct(mult, 0.9))}); recall ${dr.reduce((s, x) => s + x, 0) >= 0 ? '+' : ''}${pts(avg(dr))} pts (worst1 ${pts(pct(dr, 0.01))}), transfer ${dt.reduce((s, x) => s + x, 0) >= 0 ? '+' : ''}${pts(avg(dt))} (worst1 ${pts(pct(dt, 0.01))}); reach ${bar}: ${(100 * reach / L.length).toFixed(0)}%${compact ? '' : ` of ${L.length}`}`);
    }
  }
}
