#!/usr/bin/env node
/**
 * The variants and the lever ladder, side by side (SIMULATED): node scripts/speed-4x-variants.js RAWDIR
 * RAWDIR holds the outputs of scripts/speed-4x-run.sh. Ratio = baseline hours / arm hours, per learner, only where both reach the target (the arm with every skill understood).
 */
const fs = require('fs');
const path = require('path');

const dir = process.argv[2];
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);
const q = (xs, p) => { if (!xs.length) return NaN; const a = xs.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };
const f = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : 'n/a');
const read = (n) => JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8'));
const D = read('design.json');
const strict = (a) => !!(a && a.pass && a.understood === 1);
const GOALS = ['horizon 1 week', 'horizon 1 month', 'horizon 1 year', 'no test day (3 y)', 'date 1 month'];
function pickR(goal) {
  const rs = Object.keys(D.rows[0].goals[goal].self_r || {}).map(Number).sort((a, b) => b - a);
  let best = null;
  for (const r of rs) { const share = mean(D.rows.map((x) => (x.goals[goal].self_r[r].pass ? 1 : 0))); if (share >= 0.95) return r; if (!best || share > best.share) best = { r, share }; }
  return best && best.r;
}
function pickN(goal, tab) {
  let best = null; const steps = D.rows[0].goals[goal].tabs[tab];
  for (let i = 0; i < steps.length; i++) { const share = mean(D.rows.map((r) => (r.goals[goal].tabs[tab][i].pass ? 1 : 0))); if (share >= 0.95) return i; if (!best || share > best.share) best = { i, share }; }
  return best.i;
}
const line = (name, H, R, arm, g) => {
  const cells = H.rows.map((r) => r.goals[g]);
  const as = cells.map((c) => c.speed[arm]);
  const rr = pickR(g);
  const dense = as.map((a, i) => ({ a, b: cells[i].self_sr2 })).filter((x) => strict(x.a) && x.b.pass).map((x) => x.b.hours / x.a.hours);
  const s95 = as.map((a, i) => ({ a, b: cells[i].self_r[rr] })).filter((x) => strict(x.a) && x.b.pass).map((x) => x.b.hours / x.a.hours);
  const iN = pickN(g, 'normal');
  const norm = as.map((a, i) => ({ a, b: cells[i].tabs.normal[iN] })).filter((x) => strict(x.a) && x.b.pass).map((x) => x.b.hours / x.a.hours);
  const today = R ? R.rows.map((r) => r.goals[g].savant) : cells.map((c) => c.savant);
  const toToday = as.map((a, i) => today[i].hours / a.hours);
  const toLow = toToday.slice().sort((x, y) => x - y);
  return `${name.padEnd(14)} ${arm.padEnd(14)} ${g.padEnd(18)} ${f(mean(as.map((a) => a.hours))).padStart(5)} h (today ${f(mean(today.map((a) => a.hours)))}, reach ${f(100 * mean(today.map((a) => (a.pass ? 1 : 0))), 0)}%) `
    + `reach ${f(100 * mean(as.map((a) => (a.pass ? 1 : 0))), 0)}% +understood ${f(100 * mean(as.map((a) => (strict(a) ? 1 : 0))), 0)}% recall ${f(mean(as.map((a) => a.recall)), 2)} low ${f(mean(as.map((a) => (Number.isFinite(a.minRecall) ? a.minRecall : 0))), 2)} | `
    + `x today ${f(mean(toToday), 2)} (w10 ${f(q(toLow, 0.1), 2)}) | x dense ${f(mean(dense), 2)} (med ${f(q(dense, 0.5), 2)}, w10 ${f(q(dense.slice().sort((a, b) => a - b), 0.1), 2)}, n ${dense.length}, 4x: ${dense.filter((x) => x >= 4).length}) | x self95 ${f(mean(s95), 2)} (n ${s95.length}, 4x: ${s95.filter((x) => x >= 4).length}) | x fixedN ${f(mean(norm), 2)} (n ${norm.length})`;
};
const held = read('held.json'); const rule = read('rule.json');
console.log('SIMULATED. Ladder, held-out seed 20261106 (160 learners).');
for (const g of GOALS) for (const arm of Object.keys(held.rows[0].goals[g].speed)) console.log(line('ladder', held, rule, arm, g));
console.log('\nVariants: each changes one assumption for every arm in that run; today is the round 3 rule in the same variant.');
for (const n of fs.readdirSync(dir).filter((x) => /^v-/.test(x)).sort()) {
  const name = n.replace(/^v-|\.json$/g, '');
  const H = read(n); const R = read(`vr-${name}.json`);
  const arms = /implicit/.test(name) ? ['safe_implicit', 'end_implicit'] : ['safe', 'end'];
  for (const g of GOALS) for (const arm of arms) console.log(line(name, H, R, arm, g));
}
