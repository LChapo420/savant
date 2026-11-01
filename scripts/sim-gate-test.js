#!/usr/bin/env node
/**
 * The accuracy gate (scripts/lib/sim-gate.js) and the posterior the scorecard reports (services/scorecard/index.js seOf):
 *   1. the gate tells a good measure from a biased one, from one with no signal, and an honest interval from an overconfident one
 *   2. the ideal observer never reads the truth of the row it is scoring (leave-one-out), so a measure of pure noise cannot be made to "pass"
 *   3. a measure read through a rule that is known to leak reports an interval that does not shrink to nothing with more evidence
 *   4. evidence fades with time, not with updates: the same evidence, later, gives a wider interval
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sim-gate-'));
process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(TMP, 'db.json');
process.env.HOLDOUT_DIR = TMP;
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* temp dir */ } });

const gate = require('./lib/sim-gate');
const db = require('../config/db');
const scorecard = require('../services/scorecard');

let failed = 0;
function check(name, fn) { try { fn(); console.log(`ok   ${name}`); } catch (e) { failed += 1; console.log(`FAIL ${name}\n     ${String(e.stack).split('\n').slice(0, 4).join('\n     ')}`); } }

let s = 12345;
const rnd = () => { s = (s * 48271) % 2147483647; return s / 2147483647; };
const normal = () => Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd());
const N = 120;
const feat = () => Object.fromEntries(gate.FEATURES.map((f) => [f, normal()]));
const rowsOf = (make) => Array.from({ length: N }, () => { const truth = 50 + 17 * normal(); return { truth, feat: feat(), confidence: 60, ...make(truth) }; });

console.log('1. the gate separates good, biased, signal-free and overconfident measures');
check('a measure close to the truth passes, and its 90% interval holds the truth about 90% of the time', () => {
  // the posterior mean given one noisy reading (sd 6) of a spread of 17: the best an observer of that reading can do
  const k = 17 ** 2 / (17 ** 2 + 6 ** 2);
  const rows = rowsOf((t) => { const obs = t + 6 * normal(); return { measured: 50 + k * (obs - 50), se: 6 * Math.sqrt(k) }; });
  const g = gate.gateMeasure(rows);
  assert.strictEqual(g.status, 'pass', JSON.stringify(g));
  assert.ok(g.coverage90 > 0.8 && g.coverage90 < 0.98, g.coverage90);
});
check('a measure with a constant offset fails, and the reason is a biased rule that recalibration would fix', () => {
  const rows = rowsOf((t) => ({ measured: t + 14 + 4 * normal(), se: 5 }));
  const g = gate.gateMeasure(rows);
  assert.strictEqual(g.status, 'fail');
  assert.ok(/biased or miscalibrated/.test(g.reason), g.reason);
  assert.ok(g.achievable < g.mae * 0.5, 'the best achievable should be far under the biased error');
});
check('a measure with a squashed scale fails as miscalibrated too', () => {
  const rows = rowsOf((t) => ({ measured: 50 + 0.3 * (t - 50) + 2 * normal(), se: 5 }));
  assert.strictEqual(gate.gateMeasure(rows).status, 'fail');
});
check('a measure of something the data cannot show is "no signal", never a pass or a fail', () => {
  const rows = rowsOf(() => ({ measured: 50 + 10 * normal(), se: 10 }));
  const g = gate.gateMeasure(rows);
  assert.strictEqual(g.status, 'no_signal', JSON.stringify(g));
});
check('an interval far too narrow is caught by its coverage', () => {
  const rows = rowsOf((t) => ({ measured: t + 10 * normal(), se: 1.5 }));
  assert.ok(gate.gateMeasure(rows).coverage90 < 0.5);
});
check('a read-out of the answer log that beats the app\'s number is named as information the rule discards', () => {
  const rows = rowsOf(() => ({ measured: 50, se: 8 }));
  rows.forEach((r) => { r.feat.acc = 0.5 + r.truth / 100; r.feat.logMs = normal(); r.truth += 0; r.measured = 50 + 3 * normal(); });
  const g = gate.gateMeasure(rows);
  assert.ok(g.floor_log < g.mae, `${g.floor_log} vs ${g.mae}`);
});
check('too few learners is reported as such, not scored', () => {
  assert.strictEqual(gate.gateMeasure(rowsOf((t) => ({ measured: t, se: 5 })).slice(0, gate.MIN_N - 1)).status, 'too_few_learners');
});

console.log('2. the ideal observer is leave-one-out');
check('ridgeLOO on pure noise predicts no better than the mean (it cannot see the row it scores)', () => {
  const X = Array.from({ length: 60 }, () => [normal(), normal(), normal()]);
  const y = Array.from({ length: 60 }, () => normal());
  const pred = gate.ridgeLOO(X, y, 1);
  const mse = y.reduce((a, v, i) => a + (v - pred[i]) ** 2, 0) / y.length;
  const varY = y.reduce((a, v) => a + (v - y.reduce((p, q) => p + q, 0) / y.length) ** 2, 0) / y.length;
  assert.ok(mse > 0.9 * varY, `${mse} vs ${varY}`);
});
check('ridgeLOO recovers a real linear signal', () => {
  const X = Array.from({ length: 80 }, () => [normal(), normal()]);
  const y = X.map(([a, b]) => 2 * a - b + 0.1 * normal());
  const pred = gate.ridgeLOO(X, y, 0.5);
  const mse = y.reduce((a, v, i) => a + (v - pred[i]) ** 2, 0) / y.length;
  assert.ok(mse < 0.1, mse);
});
check('the answer-log features are numbers for an empty log and a real one', () => {
  for (const f of [gate.featuresOf([]), gate.featuresOf([{ correct: true, ms: 4000, format: 'typed', level: 1, role: 'focus' }, { correct: false, ms: 900, format: 'mc', level: 1, role: 'review', confidence: 'sure' }], { gaps: [1, 2, 3], quits: 1, levels: 2, days: 2 })]) {
    for (const k of gate.FEATURES) assert.ok(Number.isFinite(f[k]), `${k} is ${f[k]}`);
  }
});

console.log('3. the reported interval carries the error of a leaky rule');
const user = () => db.insert('users', { email: `g${Math.random()}@t.test`, display_name: 'g', password_hash: 'x', xp: 0, streak: 0, onboarded: true });
function feed(userId, stat, n, source) {
  for (let i = 0; i < n; i++) scorecard.observe(userId, [{ stat, value: 70, weight: 1, test: { chance: 'a coin flip', event: 'a hit' } }], { source });
}
check('with a lot of evidence a leaky measure (validity under 1) is still uncertain by the part of the spread its rule cannot see', () => {
  const u = user();
  feed(u.id, 'self_efficacy', 400, 'test');
  const r = scorecard.read(scorecard.get(u.id), 'self_efficacy');
  assert.ok(r.se >= 17 * Math.sqrt(1 - 0.8 ** 2) - 0.01, `se ${r.se}`);
});
check('a measure read directly (validity 1) keeps shrinking with evidence', () => {
  const u = user();
  feed(u.id, 'prior_knowledge', 5, 'test');
  const few = scorecard.read(scorecard.get(u.id), 'prior_knowledge').se;
  feed(u.id, 'prior_knowledge', 400, 'test');
  const many = scorecard.read(scorecard.get(u.id), 'prior_knowledge').se;
  assert.ok(many < few, `${many} vs ${few}`);
});

console.log('4. evidence fades with time, not with updates');
check('the same evidence read months later is less certain than read now, and reading twice changes nothing', () => {
  const u = user();
  feed(u.id, 'prior_knowledge', 30, 'test');
  const now = scorecard.read(scorecard.get(u.id), 'prior_knowledge');
  const again = scorecard.read(scorecard.get(u.id), 'prior_knowledge');
  // The real clock moves between the two reads, so the evidence fades by a millisecond's worth (it failed now and then at strict equality,
  // the npm test of 1 Nov 2026); reading twice must change nothing beyond that.
  assert.ok(Math.abs(again.se - now.se) < 1e-6, `${again.se} vs ${now.se}`);
  assert.strictEqual(again.measured, now.measured);
  const card = scorecard.get(u.id);
  card.stats.prior_knowledge.at = new Date(Date.now() - 200 * 86400000).toISOString();
  const later = scorecard.read(card, 'prior_knowledge');
  assert.ok(later.se > now.se + 0.5, `${later.se} vs ${now.se}`);
});

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
