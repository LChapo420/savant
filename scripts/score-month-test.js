/** Tests for the score-month layer (docs/SCORE-MONTH.md): direct tasks, confirm card, bandit, logged stats, modification plan, simulation budget. Fast: no database, no network. */
'use strict';
const assert = require('assert');
const D = require('../services/scorecard/direct-tasks');
const C = require('../services/scorecard/confirm-card');
const B = require('../services/scorecard/decision-bandit');
const L = require('../services/scorecard/learner-stats');
const dec = require('../services/scorecard/decisions');
const MS = require('../services/scorecard/month-stats');
const sim = require('./score-month-sim');

const rng = sim.mulberry(7); const nrm = sim.mkNormal(rng);

// ── direct tasks ──
const pass = (w, wpm) => ({ words: w, ms: (w / wpm) * 60000 });
const rs = D.readingSpeed([pass(300, 240), pass(280, 250), pass(320, 230), pass(300, 2000), pass(40, 100)], 'adult');
assert.ok(rs && rs.n === 3 && Math.abs(rs.wpm - 240) < 1, 'skim-through and too-short passages are dropped');
assert.strictEqual(D.readingSpeed([pass(300, 240)], 'adult'), null, 'one passage is not enough');
assert.ok(D.wpmToPoints(238) > 49 && D.wpmToPoints(238) < 51 && D.wpmToPoints(300) > D.wpmToPoints(200));
assert.ok(D.AGE.child.speedTrials < D.AGE.adult.speedTrials && D.AGE.child.precheckItems < D.AGE.adult.precheckItems, 'child versions are shorter');
assert.strictEqual(D.ageBand(9), 'child'); assert.strictEqual(D.ageBand(15), 'teen'); assert.strictEqual(D.ageBand(30), 'adult');
// adaptive pre-check converges toward the truth
let post = D.newPosterior(); const theta = 1.2;
for (let i = 0; i < 24; i++) { const b = D.nextDifficulty(post); post = D.updatePosterior(post, rng() < D.pRasch(theta, b, 0.2), b, 0.2); }
const m = D.moments(post); assert.ok(Math.abs(m.mean - theta) < 1.1 && m.sd < 0.8, `precheck ${m.mean} ${m.sd}`);
const st0 = D.objectiveStates({ a: post, b: D.newPosterior() }); assert.strictEqual(st0.b, 'unsure'); assert.ok(['known', 'shaky'].includes(st0.a));
// combine: more sittings on more days is surer; bias floor does not shrink; no readings = population
const rd = (n) => Array.from({ length: n }, (_, i) => ({ value: 70, day: i }));
const c1 = D.combine(rd(1), 'speed_task'); const c6 = D.combine(rd(6), 'speed_task'); const c60 = D.combine(rd(60), 'speed_task');
assert.ok(c6.sd < c1.sd && c60.sd < c6.sd && c60.sd > D.TASKS.speed_task.bias * 0.9, 'bias floor');
assert.ok(c1.est > 50 && c1.est < 70, 'shrunk toward the population');
assert.deepStrictEqual([D.combine([], 'speed_task').est, D.combine([], 'speed_task').sd], [50, 17]);
assert.ok(D.fuse({ est: 60, sd: 4 }, { est: 40, sd: 16 }).est > 56);
// calibration and decay
const over = Array.from({ length: 200 }, (_, i) => ({ correct: i % 2, conf: 0.85 })); const cal = D.calibrationReading(over);
assert.ok(cal.bias > 0.3 && D.biasToPoints(cal.bias) < 50); assert.strictEqual(D.calibrationReading(over.slice(0, 10)), null);
const mkRev = (mm, n) => Array.from({ length: n }, (_, i) => { const dt = [1, 3, 7, 14][i % 4]; const p = 0.2 + 0.7 * 2 ** (-dt / (6 * 2 ** mm)); return { correct: rng() < p, dt }; });
const slow = D.decayReading(mkRev(1.2, 160)); const fast = D.decayReading(mkRev(-1.2, 160));
assert.ok(slow.m > fast.m + 0.8 && slow.points > fast.points, `decay ${slow.m} ${fast.m}`); assert.strictEqual(D.decayReading(mkRev(0, 3)), null);
// budget: never past 5% of study time, never past the daily cap, never more than two blocks, nothing without consent
let spent = 0; const state = { studyMinutesMonth: 600, spentMin: 0, perTask: {}, band: 'adult' };
for (let d = 0; d < 30; d++) { state.spentMin = spent; state.minutesToday = 0; const p = D.planDay(state); assert.ok(p.length <= D.MAX_BLOCKS_PER_DAY); const cost = p.reduce((s, t) => s + D.TASKS[t].cost, 0); assert.ok(cost <= D.DAILY_CAP_MIN + 1e-9); spent += cost; for (const t of p) state.perTask[t] = { k: 1, sd: 9 }; }
assert.ok(spent <= D.BUDGET_SHARE * 600 + 1e-9, `spent ${spent}`);
assert.deepStrictEqual(D.planDay({ ...state, spentMin: 0, consent: false }), []);
assert.deepStrictEqual(D.planDay({ studyMinutesMonth: 600, spentMin: 29.9, perTask: {} }), [], 'budget exhausted');

// ── confirm card ──
assert.strictEqual(C.CONFIRMABLE.length, 28);
const qs = C.nextQuestions(C.newState(), { day: 1, card: {}, band: 'adult' }); assert.strictEqual(qs.length, C.MAX_PER_DAY);
assert.strictEqual(C.question(C.CONFIRMABLE[0], 'child').steps.length, 3);
assert.deepStrictEqual(C.nextQuestions(C.newState(), { consent: false }), [], 'no card without consent');
let cs = C.newState(); const id = qs[0].id;
cs = C.applyAnswer(cs, id, { value: 90, shown: 40, day: 1 }); assert.strictEqual(cs.answers[id][0].how, 'correct');
cs = C.applyAnswer(cs, 'not_a_trait', { value: 10 }); assert.ok(!cs.answers.not_a_trait);
assert.ok(!C.nextQuestions(cs, { day: 2 }).some((q) => q.id === id), 'asked traits wait');
assert.ok(C.nextQuestions(cs, { day: 14 }).length === C.MAX_PER_DAY && C.nextQuestions(cs, { day: 14 }).every((q) => !q.reask), 'fresh traits come before re-asks');
cs = C.applyAnswer(cs, id, { value: 70, shown: 40, day: 15 }); const r2 = C.confirmedReading(cs, id); assert.strictEqual(r2.n, 2); assert.ok(r2.est === 80 && r2.corrected);
assert.strictEqual(C.profileView(cs, {}).find((v) => v.id === id).status, 'corrected');
assert.strictEqual(C.nearestStep(61, 'child'), 50); assert.strictEqual(C.nearestStep(61, 'adult'), 70);
cs = C.setPersonal(cs, 'session_minutes', 25); cs = C.setPersonal(cs, 'best_daypart', 'noon'); cs = C.setPersonal(cs, 'days_per_week', 12);
assert.deepStrictEqual(Object.keys(cs.personal), ['session_minutes'], 'invalid personal answers refused');
assert.ok(C.correctionStats(cs).correctedShare >= 0);

// ── bandit ──
assert.strictEqual(B.DECISIONS.length, 6);
let bs = B.newState(); const eff = { explanation_style: { plain: 0, analogy: 0.8, story: -0.2 } };
for (let i = 0; i < 60; i++) { const { assignment } = B.choose(bs, rng); const y = (eff.explanation_style[assignment.explanation_style] || 0) + 0.3 * nrm(); bs = B.record(bs, assignment, y); }
const pick = B.best(bs); assert.strictEqual(pick.explanation_style.option, 'analogy'); assert.ok(pick.explanation_style.pBest > 0.8);
JSON.parse(JSON.stringify(bs)); assert.strictEqual(bs.n, 60);
// early on the default dominates; a clearly worse option is dropped from the draw
let early = 0; for (let i = 0; i < 200; i++) { const { assignment } = B.choose(B.newState(), rng); if (assignment.chunk_size === 'medium') early += 1; }
assert.ok(early / 200 > 0.7, `default floor ${early}`);
let worse = B.newState(); for (let i = 0; i < 40; i++) { const a = { explanation_style: i % 2 ? 'story' : 'plain' }; worse = B.record(worse, a, a.explanation_style === 'story' ? -1.5 : 0); }
let storyPicked = 0; for (let i = 0; i < 200; i++) if (B.choose(worse, rng).assignment.explanation_style === 'story') storyPicked += 1; assert.ok(storyPicked === 0, 'a clearly worse option is not tried');
assert.deepStrictEqual(B.choose(B.newState(), rng, { available: { modality: ['text'] } }).assignment.modality, 'text');

// ── logged stats ──
const T0 = Date.UTC(2026, 10, 2);
const log = []; for (let d = 0; d < 20; d++) for (let i = 0; i < 12; i++) { const hour = d % 2 ? 8 : 20; log.push({ t: T0 + d * 86400000 + hour * 3600000 + i * 60000, ok: rng() < (hour === 8 ? 0.9 : 0.6), ms: 8000, skill: `s${i % 4}`, device: 'phone' }); }
const tod = L.timeOfDay(log); assert.strictEqual(tod.best, 'morning'); assert.ok(tod.confident); assert.strictEqual(L.timeOfDay(log.slice(0, 10)), null);
const wrong = []; for (let i = 0; i < 40; i++) wrong.push({ t: T0 + i * 20000, ok: i % 3 !== 0, ms: 9000, skill: i % 2 ? 'a' : 'b', wrong: i % 3 === 0 ? 'x' : undefined });
const et = L.errorTypes(wrong); assert.ok(et.confident && et.misconceptionShare > 0.8, 'a dominant repeated wrong option is a misconception, found after the fact');
assert.strictEqual(L.partOf(8), 'morning'); assert.strictEqual(L.partOf(23), 'night');
const sch = L.schedule({ events: [{ date: '2026-11-10', kind: 'test', title: 'Bio test' }, { date: '2026-12-20', kind: 'exam' }, { date: '2026-11-01', kind: 'test' }], today: '2026-11-08', studyDays: ['2026-11-01', '2026-11-03', '2026-11-05'], answers: log });
assert.strictEqual(sch.daysUntil, 2); assert.strictEqual(sch.mode, 'cram'); assert.strictEqual(L.schedule({ events: [], today: '2026-11-08' }).mode, 'steady');
assert.strictEqual(L.schedule({ events: [{ date: '2026-11-20', kind: 'test' }], today: '2026-11-08' }).mode, 'build');
assert.deepStrictEqual(L.horizon({ personal: { retention_days: { value: 90 } }, sched: sch }), { days: 90, source: 'stated' });
assert.deepStrictEqual(L.horizon({ sched: sch }), { days: 3, source: 'calendar' }); assert.strictEqual(L.horizon({}).source, 'default');
const sit = L.sittings([{ t: 0 }, { t: 60000 }, { t: 3 * 3600000 }]); assert.strictEqual(sit.length, 2);

// ── modification plan: new exports only, old ones intact ──
for (const k of ['EDGES', 'POP_SD', 'enabled', 'decide', 'drivers', 'pWrong', 'expectedGain', 'decisionImportance', 'decisionScore', 'cdf']) assert.ok(k in dec, `export ${k} kept`);
const plan = dec.modificationPlan({ readingWpm: 200, prior: { a: 'known', b: 'shaky', c: 'unsure', d: 'new' }, decayM: 1, horizonDays: 2, dropoff: { minutes: 20 }, errors: { confident: true, misconceptionShare: 0.5, slipShare: 0.2 }, calibration: { bias: 0.2 }, timeOfDay: { confident: true, best: 'morning' }, device: { mobileMain: true }, schedule: { mode: 'cram' }, spanPoints: 30, speedPoints: 20, confirmed: { humor_receptivity: 20, tone_formality: 80, x: 50 }, bandit: { chunk_size: { option: 'small', confident: true }, modality: { option: 'audio', confident: false } }, assignment: { modality: 'visual', spacing: 'long_gap' } });
assert.strictEqual(plan.passage.wordsPerChunk, 250); assert.deepStrictEqual(plan.objectives.skip, ['a']); assert.deepStrictEqual(plan.objectives.pretest, ['c']); assert.strictEqual(plan.review.intervalMultiplier, 2);
assert.ok(plan.review.compress && plan.review.coverageFirst && plan.session.maxMinutes === 20 && plan.session.breakPromptAtMin === 16);
assert.strictEqual(plan.remediation, 'refutation_contrast'); assert.strictEqual(plan.confidence, 'predict_then_check'); assert.strictEqual(plan.nudge, 'morning');
assert.ok(plan.input.preferTap && plan.input.noTimedItems && plan.passage.oneIdeaPerStep);
assert.deepStrictEqual(plan.tone, { humor_receptivity: -1, tone_formality: 1 });
assert.deepStrictEqual(plan.choices, { chunk_size: 'small', modality: 'visual', spacing: 'long_gap' }, 'only confident bandit picks; the test assignment fills the rest');
assert.ok(dec.planLines(plan).length >= 8); assert.deepStrictEqual(dec.planLines(dec.modificationPlan({})), []);
assert.strictEqual(dec.modificationPlan({}).review.intervalMultiplier, 1, 'no stats, no change');
for (const k of Object.keys(dec.MODIFIERS)) assert.ok(dec.MODIFIERS[k].moves && dec.MODIFIERS[k].rule);

// ── switch ──
delete process.env.SCORECARD_MONTH; assert.strictEqual(MS.planFor(1), null, 'off by default'); assert.strictEqual(MS.on(), false);

// ── simulation: deterministic, inside the budget, no kind left out ──
const R1 = sim.run({ seed: 5, n: 2 }); const R2 = sim.run({ seed: 5, n: 2 }); const S1 = sim.summarise(R1);
assert.deepStrictEqual(S1, sim.summarise(R2), 'same seed, same numbers');
for (const [kn, k] of Object.entries(R1.kinds)) for (const sh of k.spentShare) assert.ok(sh <= D.BUDGET_SHARE + 0.002, `${kn} spends ${sh} of study time`);
assert.strictEqual(Object.keys(S1.byKind).length, Object.keys(sim.KINDS).length);
assert.ok(S1.Aall.acc > S1.Aall.guess && S1.B.acc > S1.B.guess - 1, 'direct tasks beat the guess');
console.log('score-month tests ok');
