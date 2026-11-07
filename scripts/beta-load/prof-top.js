#!/usr/bin/env node
/**
 * Top functions in a V8 .cpuprofile, by self time and by inclusive time inside this repo.
 *   node scripts/beta-load/prof-top.js <file.cpuprofile> [n]
 */
const fs = require('fs');

const file = process.argv[2];
const N = Number(process.argv[3] || 30);
const p = JSON.parse(fs.readFileSync(file, 'utf8'));
const byId = new Map(p.nodes.map((n) => [n.id, n]));
const dt = p.timeDeltas || [];
const self = new Map();
let total = 0;
(p.samples || []).forEach((id, i) => { const d = dt[i] || 0; self.set(id, (self.get(id) || 0) + d); total += d; });
const parent = new Map();
for (const n of p.nodes) for (const c of (n.children || [])) parent.set(c, n.id);
const short = (cf) => `${cf.functionName || '(anon)'} ${String(cf.url || '').replace(/^.*beta-load[\\/]/, '').replace(/^file:\/\/\//, '')}:${cf.lineNumber + 1}`;
const selfAgg = new Map(); const inclAgg = new Map();
for (const [id, d] of self) {
  const n = byId.get(id);
  const k = short(n.callFrame);
  selfAgg.set(k, (selfAgg.get(k) || 0) + d);
  const seen = new Set();
  let cur = id;
  while (cur !== undefined) {
    const cn = byId.get(cur); const ck = short(cn.callFrame);
    if (!seen.has(ck)) { seen.add(ck); inclAgg.set(ck, (inclAgg.get(ck) || 0) + d); }
    cur = parent.get(cur);
  }
}
const fmt = (m, filter) => [...m.entries()].filter(([k]) => !filter || filter(k)).sort((a, b) => b[1] - a[1]).slice(0, N)
  .map(([k, d]) => `${(100 * d / total).toFixed(1).padStart(5)}%  ${(d / 1e6).toFixed(1).padStart(7)}s  ${k}`).join('\n');
console.log(`total ${(total / 1e6).toFixed(1)} s`);
console.log('--- self');
console.log(fmt(selfAgg, (k) => !/^\((idle|program)\)/.test(k)));
console.log('--- inclusive, repo code');
console.log(fmt(inclAgg, (k) => /(services|routes|config|middleware|utils|content)[\\/]/.test(k)));
