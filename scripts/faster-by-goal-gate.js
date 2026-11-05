#!/usr/bin/env node
/** Round 3 gate on Savant's own arm: node scripts/faster-by-goal-gate.js NEW.json [TODAY.json]
 *  For each horizon goal: mean hours (and today's), share reaching 0.70, lowest share over kinds/age bands, hours worst 10% / 5% / 1%, and whether hours rise with the goal. */
const fs = require('fs');
const N = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const T = process.argv[3] ? JSON.parse(fs.readFileSync(process.argv[3], 'utf8')) : null;
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);
const q = (xs, p) => { const a = xs.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };
const goals = Object.keys(N.rows[0].goals).filter((g) => g.startsWith('horizon') || g.startsWith('no test'));
const out = []; let prev = null; let ok = true; const fails = [];
for (const g of goals) {
  const rs = N.rows; const sv = rs.map((r) => r.goals[g].savant);
  const sh = sv.filter((x) => x.pass).length / sv.length;
  const groups = {};
  for (const r of rs) for (const key of [`kind:${r.kind}`, `band:${r.band}`]) { (groups[key] = groups[key] || []).push(r.goals[g].savant.pass); }
  let minG = ['', 2]; for (const [k, v] of Object.entries(groups)) { const p = v.filter(Boolean).length / v.length; if (p < minG[1]) minG = [k, p]; }
  const h = sv.map((x) => x.hours); const th = T ? T.rows.map((r) => r.goals[g].savant.hours) : null;
  const mh = mean(h);
  const line = `${g.padEnd(20)} hours ${mh.toFixed(1)}${T ? ` (today ${mean(th).toFixed(1)})` : ''} | reach ${(100 * sh).toFixed(1)}% | min group ${minG[0]} ${(100 * minG[1]).toFixed(0)}% | worst10/5/1% hours ${q(h, 0.9).toFixed(1)}/${q(h, 0.95).toFixed(1)}/${q(h, 0.99).toFixed(1)}`;
  out.push(line);
  if (sh < 0.95) fails.push(`${g}: reach ${(100 * sh).toFixed(1)}% < 95%`);
  if (minG[1] < 0.9) fails.push(`${g}: ${minG[0]} ${(100 * minG[1]).toFixed(0)}% < 90%`);
  if (T && /6 months|1 year|no test/.test(g) && mh > mean(th) + 1e-9) fails.push(`${g}: hours ${mh.toFixed(1)} above today's ${mean(th).toFixed(1)}`);
  if (prev !== null && mh < prev) fails.push(`${g}: hours ${mh.toFixed(1)} below the shorter goal's ${prev.toFixed(1)}`);
  prev = mh;
}
console.log(`${process.argv[2]} (seed ${N.seed}, ${N.rows.length} learners, finish ${N.finish}, jit ${N.jit}, floor ${N.floor}, goal_memory ${N.goal_memory}, kloss ${N.kloss})\n${out.join('\n')}\nGATE ${fails.length ? 'MISSED: ' + fails.join('; ') : 'MET'}`);
