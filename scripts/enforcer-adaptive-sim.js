/** SIMULATED fixed vs adaptive enforcer timing. node scripts/enforcer-adaptive-sim.js [--seed N] [--random N] [--json out.json] */
const fs = require('fs');
const sim = require('../services/enforcer-adaptive-sim');

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const seed = Number(arg('seed', 20261108));
const nRandom = Number(arg('random', 30));
const t0 = Date.now();
const { rows, learners } = sim.compare({ seed, nRandom });
const out = { simulated: true, seed, learners, scenarios: rows.length, seconds: Math.round((Date.now() - t0) / 1000), by_goal: {} };
for (const vs of ['quick', 'medium', 'full']) out[`all_vs_${vs}`] = sim.summarise(rows, vs);
for (const g of sim.GOALS) out.by_goal[g.id] = sim.summarise(rows.filter((r) => r.goal === g.id), 'medium');
out.forecast = sim.forecastScore(rows.map((r) => r.adaptive));
const f = arg('json', null);
if (f) fs.writeFileSync(f, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, (k, v) => (typeof v === 'number' ? +v.toFixed(3) : v)));
