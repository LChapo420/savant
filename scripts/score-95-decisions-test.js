/** Tests for the decision-accuracy layer and the stylised long-horizon simulation (docs/SCORE-95.md). Fast: no database, no network. */
'use strict';
const assert = require('assert');
const D = require('../services/scorecard/decisions');
const model = require('../services/onboarding/model');
const A = require('../services/scorecard/active-measure');
const S = require('./score-95-sim');
const Rep = require('./score-95-report');
const { STATS } = require('../services/scorecard/stats');

assert.strictEqual(D.POP_SD, model.POP_SD, 'decisions.js POP_SD must equal the model');
assert.deepStrictEqual([D.decide(10), D.decide(30), D.decide(50), D.decide(70), D.decide(95)], [-1, -1, 0, 1, 1]);
assert.strictEqual(D.decide(35, D.EDGES.soft), -1);
assert.ok(Math.abs(D.cdf(0) - 0.5) < 1e-6 && Math.abs(D.cdf(1.96) - 0.975) < 1e-3);
// a value on the edge with real doubt is a coin flip; far from an edge with a tight posterior is safe
assert.ok(Math.abs(D.pWrong(70.01, 8) - 0.5) < 0.02, 'on the edge');
assert.ok(D.pWrong(50, 3) < 0.001 && D.pWrong(95, 3) < 0.001);
// more information never raises the chance of a wrong decision, and is worth more near an edge than far from it
const near = D.expectedGain(66, 12, 6); const far = D.expectedGain(50, 12, 6);
assert.ok(near > far && near > 0 && far >= 0, `gain near ${near} far ${far}`);
assert.strictEqual(D.expectedGain(66, 6, 12), 0);
// scoring: right, wrong-way, caught, lean precision
const sc = D.decisionScore([{ est: 80, truth: 90 }, { est: 80, truth: 20 }, { est: 50, truth: 75 }, { est: 50, truth: 50 }]);
assert.strictEqual(sc.accuracy, 50); assert.strictEqual(sc.wrongWay, 25); assert.strictEqual(sc.leans, 2); assert.strictEqual(sc.leanPrecision, 50); assert.ok(Math.abs(sc.caught - 100 / 3) < 1e-9);
// every measure has drivers
for (const s of STATS) { const d = D.drivers(s.id); assert.ok(d && d.low && d.high && d.whatItDoes, s.id); }
// the switch: off leaves the planner weights exactly as they were; on only ever raises them
const state = { fam: {} }; const reads = {};
delete process.env.SCORECARD_DECISION_VOI; const off = A.selectionFor(state, reads).importance;
process.env.SCORECARD_DECISION_VOI = '1'; const on = A.selectionFor(state, reads).importance; delete process.env.SCORECARD_DECISION_VOI;
for (const id of Object.keys(off)) assert.ok(on[id] >= off[id] - 1e-9 && on[id] <= off[id] * 3 + 1e-9, id);
assert.ok(Object.keys(off).some((id) => on[id] > off[id]), 'the switch changes something');
// budget: extra measurement is at most 5% of study time
assert.ok(S.BUDGET_SHARE <= 0.05);
// simulation: deterministic, held-out seed differs from the calibration seed, more months do not hurt an ordinary learner, probes never hurt on average
assert.notStrictEqual(S.CAL_SEED, S.HELD_SEED);
const a = S.run({ seed: 7, n: 3, kinds: ['ordinary'], methods: ['card', 'activeDecision'], checkpoints: [4, 52] }); const b = S.run({ seed: 7, n: 3, kinds: ['ordinary'], methods: ['card', 'activeDecision'], checkpoints: [4, 52] });
assert.deepStrictEqual(a.cells, b.cells);
assert.ok(a.cells['card|ordinary|52'].acc >= a.cells['card|ordinary|4'].acc - 0.3);
assert.ok(a.cells['activeDecision|ordinary|52'].acc >= a.cells['card|ordinary|52'].acc - 0.3);
assert.ok(a.cells['card|ordinary|52'].acc > a.cells['card|ordinary|52'].guess, 'beats the guess');
// report on a tiny synthetic dump: a perfect card scores 100 and removes all error
const ids = STATS.map((s) => s.id); const r = S.rng(3);
const mk = (n) => Array.from({ length: n }, () => { const truth = {}; const app = {}; for (const id of ids) { const t = Math.round(S.SD_PTS * S.gauss(r) + 50); truth[id] = Math.max(0, Math.min(100, t)); app[id] = [truth[id], 5, 80]; } return { truth, app, feat: {}, ext: { kind: 'ordinary' } }; });
const rep = Rep.analyse(mk(30), mk(10));
assert.strictEqual(rep.heldLearners, 10); assert.ok(rep.all.acc.card > 99.9 && rep.all.decisionHard.card > 99.9, 'perfect card');
assert.ok(rep.all.acc.guess < 90 && rep.perTrait.length === ids.length);
console.log('score-95 decisions test: ok');
