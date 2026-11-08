#!/usr/bin/env node
/** Markdown tables for docs/four-x/tables.md, from merged four-x-sim results. SIMULATED. node scripts/four-x-tables.js measured.json textbook.json textbookfull.json */
'use strict';
const fs = require('fs');
const [measured, textbook, full] = process.argv.slice(2, 5).map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
const pct = (xs, p) => { const s = xs.slice().sort((a, b) => a - b); return s[Math.max(0, Math.min(s.length - 1, Math.floor(p * s.length)))]; };
const avg = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const sg = (x) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}`;

function table(o, g, modes, label) {
  const L = o.learners.map((l) => l.goals[g]);
  const rows = [];
  rows.push(`\n### ${label}, ${g} (${o.learners.length} learners)`);
  rows.push('| mode | minutes | vs | time multiple, median (P10 to P90) | recall diff (mean, worst 1%) | transfer diff (mean, worst 1%) | share reaching the mode\'s target |');
  rows.push('|---|---|---|---|---|---|---|');
  for (const m of modes) {
    for (const b of ['lazy', 'typical', 'diligent']) {
      const mult = L.map((c) => c[b].min / c[m].min);
      const dr = L.map((c) => c[m].recall - c[b].recall);
      const dt = L.map((c) => c[m].transfer - c[b].transfer);
      const need = m === 'fastest' ? 4 : m === 'balanced' ? 2 : 0;
      const ok = (c) => (need === 0 || c[b].min / c[m].min >= need) && (m === 'fastest' ? c[m].recall >= c[b].recall && c[m].transfer >= c[b].transfer : c[m].recall > c[b].recall && c[m].transfer > c[b].transfer);
      rows.push(`| ${m} | ${avg(L.map((c) => c[m].min)).toFixed(1)} | ${b} (${avg(L.map((c) => c[b].min)).toFixed(1)}) | x${pct(mult, 0.5).toFixed(1)} (x${pct(mult, 0.1).toFixed(1)} to x${pct(mult, 0.9).toFixed(1)}) | ${sg(avg(dr))} (${sg(pct(dr, 0.01))}) | ${sg(avg(dt))} (${sg(pct(dt, 0.01))}) | ${(100 * L.filter(ok).length / L.length).toFixed(0)}% |`);
    }
  }
  return rows.join('\n');
}
const GOALS = ['1 week', '1 month', '1 year', 'test in 1 month'];
const out = ['# Tables (SIMULATED, held-out seeds 20261151 and 20261152, documents h1 to h6, 200 learners a seed: 120 extreme, 40 ordinary, 20 sparse-data, 20 children)', '', 'Recall and transfer are in points of 100. Multiple above x1 means Savant took less time than that normal student. Targets: Fastest 4x and both equal or higher; Balanced 2x and both higher; Highest both higher at any time.'];
for (const g of GOALS) { out.push(table(textbook, g, ['fastest', 'balanced', 'highest'], 'Textbook density (as built)')); }
for (const g of GOALS) { out.push(table(measured, g, ['fastest', 'balanced', 'highest'], 'Measured density (dense handouts, as built)')); }
out.push('\n\n## Fastest with the two parts not built (one question over two parts, three-option questions)');
out.push(table(full, '1 month', ['fastest'], 'Textbook density, full design'));
fs.writeFileSync('docs/four-x/tables.md', out.join('\n') + '\n');
