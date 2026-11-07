#!/usr/bin/env node
/**
 * The new levers across their published range, against every baseline, at both cost sets (docs/SPEED-4X.md, round 3; SIMULATED). Reads what scripts/speed-range-run.sh wrote.
 *   node scripts/speed-range-report.js OUT [--json=FILE]
 * Plans are picked on the design seed, as in scripts/speed-real-report.js. A baseline that misses the target is not counted as a win. Measure: hours to recall 0.70 on the day, the arm with every skill understood.
 */
const fs = require('fs');
const path = require('path');

const OUT = process.argv[2];
const R = 'review=through:margin=0.15:endMargin=0.05';
const ARMS = {
  'real path': 'testout=0:appN=1', 'fast (default)': 'fast=1:appN=1', 'stop + fast': 'stop=1:fast=1:appN=1', 'worked + fast': 'worked=1:fast=1:appN=1', 'one-tap + fast': 'quick=1:fast=1:appN=1',
  'worked + one-tap + fast': 'worked=1:quick=1:fast=1:appN=1', 'stop + worked + one-tap + fast': 'stop=1:worked=1:quick=1:fast=1:appN=1', 'all levers': `testout=1:short=1:stop=1:${R}:worked=1:quick=1:fast=1:appN=1`,
};
const load = (f) => JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8'));
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
const q = (a, p) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.floor(p * (s.length - 1))]; };
const f = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : 'n/a');
const strict = (a) => !!(a && a.pass && a.understood === 1);
const pickTab = (D, goal, get) => { const t0 = get(D.rows[0].goals[goal]); let best = null; for (let i = 0; i < t0.length; i++) { const share = mean(D.rows.map((r) => (get(r.goals[goal])[i].pass ? 1 : 0))); if (share >= 0.95) return { i, share }; if (!best || share > best.share) best = { i, share }; } return best; };
const pickR = (D, goal, key) => { const rs = Object.keys(D.rows[0].goals[goal][key]).map(Number).sort((a, b) => b - a); let best = null; for (const r of rs) { const share = mean(D.rows.map((x) => (x.goals[goal][key][r].pass ? 1 : 0))); if (share >= 0.95) return { r, share }; if (!best || share > best.share) best = { r, share }; } return best; };
const BASE = {
  'careful self-study': (D, g) => { const p = pickR(D, g, 'self_r'); return (c) => c.self_r[p.r]; },
  'typical student': (D, g) => { const get = (c) => c.students.mix; const p = pickTab(D, g, get); return (c) => get(c)[p.i]; },
  rereader: (D, g) => { const get = (c) => c.students.reread; const p = pickTab(D, g, get); return (c) => get(c)[p.i]; },
  'massed problems': (D, g) => { const get = (c) => c.students.massed; const p = pickTab(D, g, get); return (c) => get(c)[p.i]; },
  'tutor d 0.37': (D, g) => { const get = (c) => c.tutorD.d037; const p = pickTab(D, g, get); return (c) => get(c)[p.i]; },
  'tutor d 0.79': (D, g) => { const get = (c) => c.tutorD.d079; const p = pickTab(D, g, get); return (c) => get(c)[p.i]; },
};
const SHOW = ['horizon 1 week', 'horizon 1 month', 'horizon 1 year', 'date 1 month', 'date 1 year'];
const lines = ['SIMULATED. Held-out seed 20261111, 160 learners. x mean / worst 10, 5, 1% (n); at 4x. Baseline hours and reach in brackets.'];
const res = {};
const sets = [['audited', 'base-', ['low', 'mid', 'high']], ['logged', 'cost-', ['low', 'mid', 'high']], ['audited', 'readhi-', ['mid']], ['audited', 'readlo-', ['mid']], ['logged', 'costhi-', ['mid']]];
for (const [cost, pre, ranges] of sets) {
  const D = load(`${pre}design.json`); const H = load(`${pre}h1.json`);
  for (const range of ranges) {
    const A = load(`${cost}-${range}/arms.json`);
    const tag = `${cost}/${pre}`; lines.push(`\n===== cost ${cost}, baselines ${pre}, range ${range}`);
    for (const g of SHOW) {
      lines.push(`-- ${g}`);
      const armRows = (spec) => A.rows.map((r) => r.goals[g].speed[spec]);
      const hrs = Object.entries(ARMS).map(([n, s]) => `${n} ${f(mean(armRows(s).map((a) => a.hours)), 1)} h, recall ${f(mean(armRows(s).map((a) => a.recall)))}`);
      lines.push(`   ${hrs.join('; ')}`);
      for (const [bn, mk] of Object.entries(BASE)) {
        const get = mk(D, g); const bs = H.rows.map((r) => get(r.goals[g]));
        const head = `   ${bn} [${f(mean(bs.map((b) => b.hours)), 1)} h, reach ${(100 * mean(bs.map((b) => (b.pass ? 1 : 0)))).toFixed(0)}%]`;
        const cells = [];
        for (const [n, s] of Object.entries(ARMS)) {
          const rows = armRows(s);
          const rat = rows.map((a, i) => (strict(a) && bs[i].pass ? bs[i].hours / a.hours : null)).filter((v) => v !== null);
          const r = { mean: mean(rat), w10: q(rat, 0.1), w5: q(rat, 0.05), w1: q(rat, 0.01), n: rat.length, at4x: rat.filter((v) => v >= 4).length };
          (res[`${tag}|${range}|${g}|${bn}`] = res[`${tag}|${range}|${g}|${bn}`] || {})[n] = r;
          if (['fast (default)', 'stop + fast', 'worked + one-tap + fast', 'all levers'].includes(n)) cells.push(`${n.split(' ')[0]} x${f(r.mean)}/${f(r.w10)},${f(r.w5)},${f(r.w1)} (${r.n}) ${r.at4x}`);
        }
        lines.push(`${head}: ${cells.join(' | ')}`);
      }
    }
  }
}
// by kind at 1 year, the best runnable set, high end, logged costs, against the typical student
const fl = process.argv.slice(2).find((a) => a.startsWith('--json='));
console.log(lines.join('\n'));
if (fl) fs.writeFileSync(fl.split('=')[1], JSON.stringify(res));
