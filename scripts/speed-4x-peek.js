#!/usr/bin/env node
/** Quick table of the speed arms in a faster-by-goal-sim.js output (SIMULATED): node scripts/speed-4x-peek.js FILE.json [arm,arm] */
const fs = require('fs');
const N = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);
const q = (xs, p) => { const a = xs.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };
const goals = Object.keys(N.rows[0].goals);
const arms = process.argv[3] ? process.argv[3].split(',') : Object.keys(N.rows[0].goals[goals[0]].speed || {});
const f = (x, d = 1) => x.toFixed(d);
for (const g of goals) {
  console.log(`\n${g}`);
  const base = N.rows.map((r) => r.goals[g]);
  if (base[0].savant) { const h = base.map((c) => c.savant.hours); console.log(`  ${'today'.padEnd(44)} ${f(mean(h))}h w10 ${f(q(h, 0.9))} L${f(mean(base.map((c) => c.savant.by.lesson)))} P${f(mean(base.map((c) => c.savant.by.practice)))} R${f(mean(base.map((c) => c.savant.by.review)))} pass ${f(100 * mean(base.map((c) => (c.savant.pass ? 1 : 0))), 0)}% recall ${f(mean(base.map((c) => c.savant.recall)), 2)}`); }
  for (const a of arms) {
    const c = base.map((b) => b.speed[a]);
    const h = c.map((x) => x.hours);
    console.log(`  ${a.padEnd(44)} ${f(mean(h))}h w10 ${f(q(h, 0.9))} L${f(mean(c.map((x) => x.by.lesson)))} P${f(mean(c.map((x) => x.by.practice)))} R${f(mean(c.map((x) => x.by.review)))} pass ${f(100 * mean(c.map((x) => (x.pass ? 1 : 0))), 0)}% recall ${f(mean(c.map((x) => x.recall)), 2)} min-during ${f(mean(c.map((x) => (Number.isFinite(x.minRecall) ? x.minRecall : 0))), 2)} understood ${f(100 * mean(c.map((x) => x.understood)), 1)}% all-understood ${f(100 * mean(c.map((x) => (x.understood === 1 ? 1 : 0))), 0)}% pages ${f(mean(c.map((x) => x.pagesShown)), 2)}`);
  }
}
