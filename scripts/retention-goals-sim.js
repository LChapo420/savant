#!/usr/bin/env node
/**
 * SIMULATED retention under each retention goal against today's one-size schedule
 * (services/retention-goal-sim.js; the numbers are in docs/RETENTION-GOALS.md).
 *
 *   node scripts/retention-goals-sim.js            print the table
 *   node scripts/retention-goals-sim.js --json     print the table as JSON
 *   node scripts/retention-goals-sim.js --write    also write docs/retention-goals-sim.json
 *   node scripts/retention-goals-sim.js --gate     exit 1 unless every goal's recall at its target is at least today's
 *                                                  (overall and for every learner in the panel) and no goal costs more lifetime minutes
 *                                                  (a test-date goal may add a little before the test; the table shows both)
 */
const fs = require('fs');
const path = require('path');
const sim = require('../services/retention-goal-sim');

const args = process.argv.slice(2);
const SCENARIOS = [
  { label: 'test tomorrow', date: 1 },
  { label: 'test in 3 days', date: 3 },
  { label: 'test in 1 week', date: 7 },
  { label: 'test in 2 weeks', date: 14 },
  { label: 'test in 1 month', date: 30 },
  { label: 'test in 2 months', date: 60 },
  { label: 'test in 4 months', date: 120 },
  { label: 'a few months (90 days)', horizon: 'months' },
  { label: 'a year', horizon: 'year' },
  { label: 'years (3 years)', horizon: 'years' },
];
const results = SCENARIOS.map((s) => ({ label: s.label, ...sim.compare(s, { count: Number((args.find((a) => a.startsWith('--count=')) || '').slice(8)) || 120 }) }));

const pct = (x) => `${(x * 100).toFixed(1)}%`;
const m1 = (x) => x.toFixed(1);
if (args.includes('--json')) console.log(JSON.stringify(results, null, 2));
else {
  console.log('SIMULATED (FSRS-style memory model, panel of 5 learners with known parameters; per item learned; not real-learner proof)');
  console.log('goal'.padEnd(26), 'recall today -> goal'.padEnd(24), 'min to target today -> goal (saved)'.padEnd(40), 'lifetime min saved'.padEnd(20), 'dropped');
  for (const r of results) {
    const o = r.overall;
    console.log(r.label.padEnd(26), `${pct(o.recall_today)} -> ${pct(o.recall_goal)}`.padEnd(24),
      `${m1(o.minutes_today_to_target)} -> ${m1(o.minutes_goal_to_target)} (${m1(o.minutes_today_to_target - o.minutes_goal_to_target)})`.padEnd(40),
      m1(o.minutes_today_lifetime - o.minutes_goal_lifetime).padEnd(20), r.dropped.join(', ') || 'none');
  }
}
if (args.includes('--write')) {
  const file = path.join(__dirname, '..', 'docs', 'retention-goals-sim.json');
  fs.writeFileSync(file, `${JSON.stringify({ simulated: true, note: 'SIMULATED: FSRS-style model, learners with known parameters. Not real-learner proof.', results }, null, 2)}\n`);
  console.log(`wrote ${path.relative(process.cwd(), file)}`);
}
if (args.includes('--gate')) {
  const bad = [];
  for (const r of results) {
    const eps = 1e-9;
    if (r.overall.recall_goal + eps < r.overall.recall_today) bad.push(`${r.label}: overall recall ${pct(r.overall.recall_goal)} < today ${pct(r.overall.recall_today)}`);
    for (const [id, p] of Object.entries(r.per_learner)) if (p.recall_goal + eps < p.recall_today) bad.push(`${r.label} / ${id}: recall ${pct(p.recall_goal)} < today ${pct(p.recall_today)}`);
    if (r.overall.minutes_goal_lifetime > r.overall.minutes_today_lifetime + eps) bad.push(`${r.label}: costs more minutes over the lifetime`);
  }
  if (bad.length) { console.log(`GATE FAIL\n${bad.map((b) => `  ${b}`).join('\n')}`); process.exit(1); }
  console.log('GATE OK: every goal keeps recall at its target at least at today\'s level (overall and per learner) and costs no more lifetime minutes (a test-date goal adds a few minutes before the test for its final reviews, shown in the table). SIMULATED.');
}
