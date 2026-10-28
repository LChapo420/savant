/**
 * Tests for the coverage model (services/coverage.js), the graduation gate
 * (services/mastery.js clearCheckpoint) and per-learner adaptation
 * (services/adaptation.js). curriculum-build/ADAPTIVE-COVERAGE.md.
 *
 *   NODE_PATH=../node_modules node scripts/coverage-test.js
 *
 * Runs on its own throwaway data file with every model key blanked: no model
 * call, no network, nothing real touched.
 */
const os = require('os');
const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'test';
for (const k of Object.keys(process.env)) if (/_API_KEY$|_KEY$|ANTHROPIC|OPENROUTER|NVIDIA|GEMINI|MIMO|MODELFLARE/.test(k) && k !== 'NODE_ENV') process.env[k] = '';
const tmp = path.join(os.tmpdir(), `coverage-test-${process.pid}.json`);
process.env.DB_FILE = tmp;
delete process.env.COVERAGE_GATE;
delete process.env.ADAPTIVE_TEACHING;

const db = require('../config/db');
const curriculum = require('../config/curriculum');
const coverage = require('../services/coverage');
const adaptation = require('../services/adaptation');
const mastery = require('../services/mastery');
const unitPlacement = require('../services/unit-placement');

let failures = 0;
function check(label, ok, detail) {
  if (ok) { console.log(`  ok   ${label}`); return; }
  failures++;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
}

const DAY = coverage.DAY;
const TRACK = 'math';
const GRADE = 'numbers_to_10';
const grade = curriculum.getGrade(TRACK, GRADE);
const model = coverage.modelFor(TRACK, GRADE);

// The live defaults since 2026-10-24 (owner approved, LIVE-CHANGES-2026-10-24.md):
// COVERAGE_GATE enforce, ADAPTIVE_TEACHING on. The checks below name each mode
// explicitly, so they test the same behaviour whatever the default is.
check('COVERAGE_GATE unset: enforce (the live default)', require('../services/coverage').gateMode() === 'enforce', require('../services/coverage').gateMode());
check('ADAPTIVE_TEACHING unset: on (the live default)', require('../services/adaptation').mode() === 'on', require('../services/adaptation').mode());
for (const k of ['ADAPT_REVIEW_SESSION', 'ADAPT_CONSOLIDATE', 'ADAPT_EFFORT', 'ADAPT_REMEDIATION']) delete process.env[k];
check('ADAPT_REVIEW_SESSION unset: on (the live default)', require('../services/review-session').enabled() === true);
check('ADAPT_CONSOLIDATE unset: on (the live default, with the daily review on)', require('../services/consolidation').enabled() === true);
check('ADAPT_EFFORT unset: on (the live default)', require('../services/effort-monitor').enabled() === true);
check('ADAPT_REMEDIATION unset: on for a missed Final (the live default)', require('../services/remediation').recordPlanOn('graduation') === true);
process.env.COVERAGE_GATE = 'shadow';
process.env.ADAPTIVE_TEACHING = 'off';

console.log('objectives');
{
  check('numbers_to_10 has one objective per lesson (34)', model.objectives.length === 34, model.objectives.length);
  const o = model.objectives[0];
  check('an objective carries the sheet\'s own covers text', o.covers === grade.levels.find((l) => l.level === o.lesson_level).covers);
  check('each objective has its nine activities and two retention levels', model.objectives.every((x) => x.practice.length === 9 && x.retention.length === 2));
  const v = coverage.validate(TRACK, GRADE);
  check('the grade passes the machine checks', v.ok, v.problems);
  const tester = model.levelMap[1];
  check('entry check 1 speaks for the lessons its covers text names', tester.kind === 'tester' && tester.shared[0] === 0 && tester.shared.length >= 2, tester);
  const final = grade.levels.find((l) => l.kind === 'graduation');
  check('the Graduation exam speaks for every objective', model.levelMap[final.level].shared.length === 34);
  let bad = 0;
  for (const trackId of ['math', 'english', 'reading', 'iq', 'act', 'spanish']) {
    for (const g of curriculum.getTrack(trackId).grades) if (!coverage.validate(trackId, g.id).ok) bad++;
  }
  check('every grade of the six subjects passes the machine checks', bad === 0, bad);
  const sp = coverage.modelFor('spanish', 'spanish_grade_51_translation_and_stylistics');
  check('a grade with no lessons uses its unit goals', sp.source === 'unit_goals' && sp.objectives.length > 5 && !/^goal:/i.test(sp.objectives[0].covers));
}

console.log('the record');
const o0 = model.objectives[0];
const o1 = model.objectives[1];
function ans(extra) {
  return { t: 0, correct: true, level: o0.lesson_level, role: 'check', skill: o0.skill, choices: 4, ms: 9000, coach: false, ...extra };
}
{
  const k = coverage.knobs();
  let s = coverage.assess(model, [ans({})])[0];
  check('one right answer does not prove an objective', s.status === 'unproven', s);
  // Lesson checks and practice on its own levels.
  const day0 = Date.UTC(2026, 9, 1);
  const list = [];
  for (let q = 0; q < 3; q++) list.push(ans({ t: day0 + q * 60000 }));
  for (let q = 0; q < 4; q++) list.push(ans({ t: day0 + (5 + q) * 60000, level: o0.practice[0], role: 'focus' }));
  s = coverage.assess(model, list)[0];
  check('lesson checks and practice prove it', s.status === 'proven' && s.proven_by === 'practice', { status: s.status, L: s.L });
  const rapid = list.map((a) => ({ ...a, ms: 400 }));
  check('rapid guesses are not evidence', coverage.assess(model, rapid)[0].answers === 0);
  const practiceOnly = list.map((a) => ({ ...a, role: 'focus', level: o0.practice[1] }));
  check('skill-level practice alone cannot prove an objective (needs questions written for it)', coverage.assess(model, practiceOnly)[0].status === 'unproven');
  const coached = list.map((a) => ({ ...a, coach: true }));
  check('answers reached with the coach do not prove it', coverage.assess(model, coached)[0].status === 'unproven');
  // A memory check a day later.
  const later = day0 + 2 * DAY;
  const tagged = (t, correct) => ans({ t, correct, objective: o0.id, role: 'retention' });
  // RETAIN_REAL_DELAY (evidence P5, default on): "retained" waits for a check a week after the proof.
  check('RETAIN_REAL_DELAY unset: retained needs a check 7 days after the proof', coverage.knobs().RETAIN_SPAN_DAYS === 7);
  s = coverage.assess(model, [...list, tagged(later, true), tagged(later + 60000, true)])[0];
  check('two right memory checks two days later: not yet retained (a week is the claim)', s.status === 'proven' && s.R >= 0.9, { status: s.status, R: s.R });
  s = coverage.assess(model, [...list, tagged(later, true), tagged(later + 60000, true), tagged(day0 + 8 * DAY, true)])[0];
  check('and a right check 8 days after the proof makes it retained', s.status === 'retained' && s.retained_by === 'check', { status: s.status, R: s.R });
  s = coverage.assess(model, [...list, tagged(later, true), tagged(later + 60000, true), tagged(day0 + 8 * DAY, false)])[0];
  check('a miss at the week check is not retained', s.status !== 'retained', s.status);
  process.env.RETAIN_REAL_DELAY = 'off';
  s = coverage.assess(model, [...list, tagged(later, true), tagged(later + 60000, true)])[0];
  check('RETAIN_REAL_DELAY=off: two right memory checks a day later: retained', s.status === 'retained' && s.retained_by === 'check', { status: s.status, R: s.R });
  delete process.env.RETAIN_REAL_DELAY;
  s = coverage.assess(model, [...list, tagged(later, true)])[0];
  check('one right multiple-choice memory check is not yet enough', s.status === 'proven', s.status);
  s = coverage.assess(model, [...list, tagged(later, false)])[0];
  check('a missed memory check: lapsed, to be learned again', s.status === 'lapsed' && s.lapses === 1, s.status);
  s = coverage.assess(model, [...list, tagged(day0 + 0.2 * DAY, true), tagged(day0 + 0.25 * DAY, true)])[0];
  check('a check on the same day is not a memory check', s.status === 'proven', s.status);
  // Prior knowledge: proven by questions written for it before any teaching.
  const probe = [0, 1, 2, 3, 4].map((q) => ans({ t: day0 + q * 60000, objective: o1.id, objectiveTest: true, level: o1.lesson_level, skill: o1.skill, role: 'probe' }));
  s = coverage.assess(model, probe)[1];
  check('a test-out before teaching proves it as prior knowledge, kept', s.status === 'retained' && s.proven_by === 'test_out', { status: s.status, by: s.proven_by });
  // Shared evidence is split.
  const shared = coverage.attribute(model, { level: 1, skill: o0.skill, role: 'tester' });
  check('an entry-check answer is split over the lessons it speaks for', shared.length >= 2 && Math.abs(shared.reduce((a, x) => a + x.w, 0) - 1) < 1e-9, shared);
  check('a review question at a later lesson goes to the earlier objectives on its skill', coverage.attribute(model, { level: model.objectives[5].practice[0], skill: 'zz_none', role: 'review' }).length === 0
    && coverage.attribute(model, { level: model.objectives[5].practice[0], skill: model.objectives[5].skill, role: 'focus' })[0].direct === true);
  void k;
}

console.log('the database side and the graduation gate');
let userSeq = 0;
function newUser(email) {
  userSeq++;
  return db.insert('users', { email: email || `coverage-${process.pid}-${userSeq}@example.test`, display_name: 'coverage test', password_hash: 'x' });
}
function newEnrollment(user, extra = {}) {
  return db.insert('enrollments', {
    user_id: user.id, track_id: TRACK, grade_id: GRADE, target_level: grade.pathLength,
    current_level: grade.pathLength, level_items: 0, levels_completed: 0, xp: 0, status: 'active', ...extra,
  });
}
function answerItems(user, enrollment, level, n, { correct = true, at, role = 'focus', kind = 'lesson', skill = o0.skill, objective = null } = {}) {
  const session = db.insert('sessions', { user_id: user.id, enrollment_id: enrollment.id, track_id: TRACK, grade_id: GRADE, level, kind, started_at: new Date(at).toISOString(), ended_at: new Date(at + 3600000).toISOString() });
  for (let q = 0; q < n; q++) {
    db.insert('items', {
      session_id: session.id, user_id: user.id, skill_id: skill, difficulty: 2, format: 'multiple_choice',
      prompt: `q${q}`, choices: ['a', 'b', 'c', 'd'], answer: 'a', role, level, user_answer: correct ? 'a' : 'b',
      correct, ms: 8000, coach_used: false, answered_at: new Date(at + q * 60000).toISOString(), objective_id: objective,
    });
  }
}
{
  const user = newUser();
  const e = newEnrollment(user);
  const at = Date.UTC(2026, 9, 1);
  answerItems(user, e, o0.lesson_level, 3, { at, role: 'check' });
  answerItems(user, e, o0.practice[0], 4, { at: at + 3600000 });
  answerItems(user, e, o0.lesson_level, 3, { at: at + 3600000, kind: 'placement' });
  const answers = coverage.answersFor(user.id, e);
  check('answers are read from the learner\'s items; placement sittings are left out', answers.length === 7, answers.length);
  const report = coverage.forEnrollment(user.id, e);
  check('the report has every objective, the first proven', report.objectives.length === 34 && report.objectives[0].status === 'proven', report.objectives[0]);
  check('the gate is not met with 33 objectives unproven', !report.gate.complete && report.gate.missing.length === 33, report.gate.counts);

  // Shadow (set explicitly; enforce is the live default): graduates as before, and records what the gate said.
  const before = db.byId('enrollments', e.id);
  const result = mastery.clearCheckpoint(before, grade, 'graduation');
  const after = db.byId('enrollments', e.id);
  check('shadow: the Graduation exam still graduates', result.graduated === true && after.status === 'graduated');
  check('shadow: what the gate would have said is recorded (33 unproven + 1 proven but not yet checked a day later)', after.coverage_graduation && after.coverage_graduation.complete === false
    && after.coverage_graduation.held === false && after.coverage_graduation.blocking_count === 34 && after.coverage_graduation.counts.proven === 1, after.coverage_graduation);

  // Enforce: held until the objectives are proven.
  process.env.COVERAGE_GATE = 'enforce';
  const e2 = newEnrollment(user);
  answerItems(user, e2, o0.lesson_level, 3, { at, role: 'check' });
  const held = mastery.clearCheckpoint(db.byId('enrollments', e2.id), grade, 'graduation');
  check('enforce: graduation is held while objectives are unproven', held.graduated === false && held.coverage_held === true
    && db.byId('enrollments', e2.id).status === 'active', held);

  // A unit the placement proved counts: its objectives are proven and kept.
  const units = unitPlacement.unitsFor(TRACK, GRADE);
  const plan = { version: 2, placed_unit: 2, units: {}, catch_up: [] };
  for (const u of units) plan.units[u.key] = { status: 'known', source: 'placement', evidence: { right: 3, wrong: 0 }, at: new Date(at).toISOString(), asked: [], test_out: null };
  const e3 = newEnrollment(user, { unit_plan: plan });
  const r3 = coverage.forEnrollment(user.id, e3);
  check('every unit known by placement: every objective proven by its unit, and the gate met', r3.gate.complete && r3.objectives.every((x) => x.proven_by === 'unit:placement'), r3.gate.counts);
  const g3 = mastery.clearCheckpoint(db.byId('enrollments', e3.id), grade, 'graduation');
  check('enforce: a complete gate graduates', g3.graduated === true);

  process.env.COVERAGE_GATE = 'off';
  const e4 = newEnrollment(user);
  const g4 = mastery.clearCheckpoint(db.byId('enrollments', e4.id), grade, 'graduation');
  check('off: graduates and records nothing', g4.graduated === true && !db.byId('enrollments', e4.id).coverage_graduation);
  process.env.COVERAGE_GATE = 'shadow';
}

console.log('adaptation: how, never what');
{
  const day0 = Date.UTC(2026, 9, 1);
  const states0 = coverage.assess(model, []);
  const novice = adaptation.decide({ model, states: states0, level: o0.lesson_level, base: { itemCount: 10 } });
  check('no evidence on the objective: worked examples first, blocked practice', novice.knobs.guidance === 'worked_examples' && novice.knobs.order === 'blocked', novice.knobs);
  check('the plan carries what the level covers, word for word', novice.what.covers === o0.covers && adaptation.checkWhat(model, states0, novice).length === 0);
  check('the writer\'s lines restate the covers text', adaptation.promptLines(novice)[1].includes(o0.covers));
  const list = [];
  for (let q = 0; q < 3; q++) list.push(ans({ t: day0 + q * 60000 }));
  for (let q = 0; q < 4; q++) list.push(ans({ t: day0 + (5 + q) * 60000, level: o0.practice[0], role: 'focus' }));
  const states1 = coverage.assess(model, list);
  const expert = adaptation.decide({ model, states: states1, level: o0.practice[2], base: { itemCount: 10 } });
  check('proven: problems first, shorter, practice compressed', expert.knobs.guidance === 'problems_first' && expert.knobs.length === 'short' && expert.knobs.practice === 'compress', expert.knobs);
  const retentionLevel = o0.retention[1];
  const keep = adaptation.decide({ model, states: states1, level: retentionLevel, base: { itemCount: 10 } });
  check('a spaced-recall level is never compressed', keep.knobs.practice !== 'compress' && adaptation.checkWhat(model, states1, keep).length === 0, keep.knobs);
  const forged = { ...expert, what: { ...expert.what, covers: 'something easier' } };
  check('checkWhat catches a changed covers text', adaptation.checkWhat(model, states1, forged).includes('covers text changed'));
  const forced = { ...novice, level: o0.practice[1], knobs: { ...novice.knobs, practice: 'compress' } };
  check('checkWhat catches compressing an unproven objective', adaptation.checkWhat(model, states0, forced).includes('compressed an unproven objective'));
  // Confident directives only: decide() reads the sides it is given; planForLevel
  // only ever passes translate.directives (the calibrated gate).
  const brief = adaptation.decide({ model, states: states0, level: o0.lesson_level, base: { itemCount: 10 }, sides: { brevity_preference: 'high', persistence: 'low', frustration_threshold: 'low' } });
  check('confident directives move length, items and support', brief.knobs.length === 'short' && brief.knobs.item_count === 8 && brief.knobs.support_share > novice.knobs.support_share, brief.knobs);
  const fade = adaptation.decide({ model, states: states0, level: o0.lesson_level, base: { itemCount: 10 }, sides: { scaffolding_fade: 'high' } });
  check('a scaffolding directive cannot take worked examples away from an objective with no evidence', fade.knobs.guidance === 'worked_examples', fade.knobs);
  check('combined directives are split back into both sides', JSON.stringify(adaptation.confidentSides([{ stat: 'brevity_preference+example_density_need', side: 'combined', parts: ['brevity_preference', 'example_density_need'] }])) === JSON.stringify({ brevity_preference: 'high', example_density_need: 'high' }));
  // Review timing.
  const q = adaptation.reviewQueue(model, states1, day0 + 2 * DAY);
  check('a proof two days old is due for its memory check', q.length === 1 && q[0].reason === 'memory_check' && q[0].id === o0.id, q);
  check('nothing is due the same day', adaptation.reviewQueue(model, states1, day0 + 3600000).length === 0);
  // Off by default in live paths.
  const user = newUser();
  const e = newEnrollment(user, { current_level: o0.lesson_level });
  check('ADAPTIVE_TEACHING off: live paths get no plan', adaptation.planForLevel({ userId: user.id, enrollment: e, level: o0.lesson_level }) === null);
  const live = adaptation.planForLevel({ userId: user.id, enrollment: e, level: o0.lesson_level, force: true, base: { itemCount: 10 } });
  check('forced (shadow or a preview): a plan from the database with no confident directives', live && live.knobs.guidance === 'worked_examples' && live.reasons.every((r) => !r.includes('directive')), live && live.reasons);
  check('paramsFor touches only the bounded knobs', JSON.stringify(Object.keys(adaptation.paramsFor({ itemCount: 10, stretchShare: 0.2, supportShare: 0.2, preferTypeIn: false, reviewShare: 0.25 }, live)).sort())
    === JSON.stringify(['itemCount', 'preferTypeIn', 'reviewShare', 'stretchShare', 'supportShare']));
}

console.log('round 2: retention, effort, remediation, unit-built grades');
{
  const day0 = Date.UTC(2026, 9, 1);
  // The record keeps rapid guesses (as a count, never as evidence) and the
  // spaced answers the round-5 forgetting curve reads.
  const list = [];
  for (let q = 0; q < 3; q++) list.push(ans({ t: day0 + q * 60000 }));
  for (let q = 0; q < 4; q++) list.push(ans({ t: day0 + (5 + q) * 60000, level: o0.practice[0], role: 'focus' }));
  const rapid = ans({ t: day0 + 10 * 60000, ms: 500, correct: false });
  const spaced = ans({ t: day0 + 2 * DAY, role: 'focus', level: o0.practice[0] });
  const s = coverage.assess(model, [...list, rapid, spaced])[0];
  check('a rapid guess is counted on the record but is not evidence', s.rapid === 1 && s.answers === 8, { rapid: s.rapid, answers: s.answers });
  check('an answer a day or more after the last one is a spaced answer (ns)', s.ns === 1 && s.nsw === 0 && s.nc === 8, { ns: s.ns, nc: s.nc });

  // The scorecard's fitted curve (a recallCurve() result) is read with nc, nw,
  // ns and nsw; a learner's slower-than-typical multiplier only by what is
  // 95% sure, a faster one as it stands.
  const forgetting = require('../services/scorecard/forgetting');
  const rc = { curve: { a: 1.3, b: 0.5, c: -0.15, d: 0.15, e: -0.2, k: 0.35 }, fitted: true, m: 0, mSd: 0.3, mSource: 'population', norm: 0, cap: 15 };
  const now = s.last_at + 5 * DAY;
  const pFit = adaptation.predictedRecall(s, now, rc);
  const pDefault = adaptation.predictedRecall(s, now);
  const manual = forgetting.predict(rc.curve, [5, 8, 0, 0.95, 0, 0, 0, 0, 0, 1, 0], 0).P;
  check('predictedRecall reads a fitted curve with the objective\'s nc / nw / ns / nsw', Math.abs(pFit - manual) < 1e-12 && pFit !== pDefault, { pFit, manual, pDefault });
  check('scheduleM: a faster-forgetting learner\'s estimate is used as it stands', adaptation.scheduleM({ ...rc, mSource: 'learner', m: -1, mSd: 0.5 }) === -1);
  check('scheduleM: a slower one only by what is 95% sure', Math.abs(adaptation.scheduleM({ ...rc, mSource: 'learner', m: 1, mSd: 0.5 }) - (1 - 1.645 * 0.5)) < 1e-12
    && adaptation.scheduleM({ ...rc, mSource: 'learner', m: 0.4, mSd: 0.5 }) === 0);
  check('curveFor never throws, and gives null (round 1) with no fitted population', adaptation.curveFor({ userId: 'nobody', trackId: TRACK }) === null);
  const d = adaptation.durableRecall(s, now, rc);
  check('durability is memory strength in 30 days, at most 1', d > 0 && d <= 1 && d < adaptation.durableRecall(s, s.last_at, rc), d);

  // Review queue: durability and re-teaching are round-2 options; without
  // them the queue is round 1's.
  const states = coverage.assess(model, list);
  states[0].status = 'retained';
  states[1] = { ...coverage.blankState(), status: 'lapsed', last_at: day0, lapses: 1 };
  const r1 = adaptation.reviewQueue(model, states, day0 + 2 * DAY);
  const r2 = adaptation.reviewQueue(model, states, day0 + 2 * DAY, { curve: rc, durable: {}, reteach: 3 });
  check('round 1 queue: no re-teaching, no durability reviews', !r1.some((x) => x.reason === 'reteach' || x.reason === 'durability'), r1);
  check('round 2 queue: a lapsed objective is taught again first', r2.length && r2[0].reason === 'reteach' && r2[0].i === 1, r2);
  check('round 2 queue: a kept objective that is not durable gets a spaced retrieval', r2.some((x) => x.i === 0 && (x.reason === 'durability' || x.reason === 'fading')), r2);
  const dur = adaptation.durability(model, states, day0 + 2 * DAY, { curve: rc });
  check('durability() lists only proven or kept objectives', dur.below.every((x) => ['proven', 'retained'].includes(states[x.i].status)), dur.below.length);

  // Effort: flagged only on the learner's own record, with 95% certainty.
  const calm = model.objectives.map(() => ({ ...coverage.blankState(), mass: 10, rapid: 0 }));
  const rushed = model.objectives.map(() => ({ ...coverage.blankState(), mass: 10, rapid: 2 }));
  check('effort: no rapid answers, no flag', adaptation.effort(calm).flagged === false);
  check('effort: about 17% rapid answers over 400 is flagged', adaptation.effort(rushed).flagged === true, adaptation.effort(rushed));
  check('effort: a few rapid answers on a thin record are not', adaptation.effort([{ mass: 8, rapid: 2 }]).flagged === false);
  const plan = adaptation.decide({ model, states: rushed, level: o0.lesson_level, base: { itemCount: 10 } });
  check('a flagged learner\'s plan turns on effort feedback and keeps WHAT', plan.knobs.effort_feedback === true && adaptation.checkWhat(model, rushed, plan).length === 0, plan.knobs);
  check('sittingRule: a rapid answer on a scored sitting is re-served, at most twice', adaptation.sittingRule({ ms: 600 }, 0) === 'reserve'
    && adaptation.sittingRule({ ms: 600 }, 2) === 'score' && adaptation.sittingRule({ ms: 9000 }, 0) === 'score');

  // Remediation after a missed Final never touches the bar; it re-teaches
  // what is unproven and retrieves what has faded.
  const rem = adaptation.remediation(model, states, [0, 1], day0 + 2 * DAY, { curve: rc, at: 0.95 });
  check('remediation: a missed lapsed objective is re-taught, a missed kept one retrieved', rem.reteach.includes(1) && rem.retrieve.includes(0) && !rem.reteach.includes(0), rem);
  check('remediation: every unproven objective is re-taught', rem.reteach.length === states.filter((x) => x.status === 'unproven' || x.status === 'lapsed').length, rem.reteach.length);

  // Unit-built grades (Spanish): an objective with no practice level of its
  // own waits for its unit's shared levels.
  const sp = coverage.modelFor('spanish', 'spanish_grade_06_daily_routines_and_present_tense_patterns');
  const spStates = coverage.assess(sp, []);
  const spo = sp.objectives.find((o) => !o.practice.length);
  const spPlan = adaptation.decide({ model: sp, states: spStates, level: spo.lesson_level, base: { itemCount: 10 } });
  check('unit-built grade: practice comes from the unit\'s shared levels', spPlan.knobs.practice === 'unit' && adaptation.checkWhat(sp, spStates, spPlan).length === 0, spPlan.knobs);
}

console.log('round 2: skill subjects (staged, curriculum-build/staged/adaptation/skills)');
{
  const sc = require('../curriculum-build/staged/adaptation/skills/skill-coverage');
  const sa = require('../curriculum-build/staged/adaptation/skills/skill-adaptation');
  for (const subj of sc.SUBJECTS) {
    const v = sc.validate(subj, { coverage });
    check(`${subj}: every stage has an exit battery with tests, pass rules and sources; its grades have objectives`, v.ok && v.stats.knowledge_objectives > 0, v.problems.slice(0, 3));
  }
  check('source honesty: MIDI proves, a microphone is an estimate, self-report and a person never prove', sc.readSource('midi | mic').provable && sc.readSource('midi | mic').estimate
    && !sc.readSource('self').provable && !sc.readSource('film + self').provable && !sc.readSource('midi/mic + human').provable && sc.readSource('count + camera estimate').provable && !sc.readSource('import').provable);
  const stage = sc.stagesFor('chess')[1];
  const id = stage.metrics[0].id;
  const H = sc.HOUR;
  const t0 = Date.UTC(2026, 9, 1, 9);
  let rec = sc.blankRecord('chess');
  sc.sit(rec, stage, id, { at: t0, pass: true, source: 'exact' });
  sc.sit(rec, stage, id, { at: t0 + 2 * H, pass: true, source: 'exact' });
  check('a second sitting the same day is warm and does not count', rec.metrics[id].status === 'unproven' && rec.metrics[id].sittings[1].counts === false);
  sc.practise(rec, id, t0 + 30 * H);
  sc.sit(rec, stage, id, { at: t0 + 34 * H, pass: true, source: 'exact' });
  check('a sitting 4 hours after practice is not cold', rec.metrics[id].sittings[2].cold === false && rec.metrics[id].status === 'unproven');
  sc.sit(rec, stage, id, { at: t0 + 72 * H, pass: true, source: 'exact' });
  check('cold passes on two different days prove a metric', rec.metrics[id].status === 'proven' && sc.proofHolds(stage, rec.metrics[id], id).ok, rec.metrics[id].status);
  rec = sc.blankRecord('chess');
  sc.sit(rec, stage, id, { at: t0, pass: true, source: 'exact' });
  sc.sit(rec, stage, id, { at: t0 + 24 * H, pass: false, source: 'exact' });
  sc.sit(rec, stage, id, { at: t0 + 48 * H, pass: true, source: 'exact' });
  check('pass, miss, pass is not yet proof (retaking until two lucky passes cannot prove it)', rec.metrics[id].status === 'unproven', rec.metrics[id].B);
  const piano = sc.stagesFor('piano')[2];
  const pid = piano.metrics.find((m) => m.source.estimate).id;
  rec = sc.blankRecord('piano');
  sc.sit(rec, piano, pid, { at: t0, pass: true, source: 'estimate' });
  sc.sit(rec, piano, pid, { at: t0 + 24 * H, pass: true, source: 'estimate' });
  check('unconfirmed microphone takes never prove', rec.metrics[pid].status === 'unproven');
  sc.sit(rec, piano, pid, { at: t0 + 48 * H, pass: true, source: 'estimate', confirmed: true });
  sc.sit(rec, piano, pid, { at: t0 + 72 * H, pass: true, source: 'estimate', confirmed: true });
  check('confirmed estimates on two days do', rec.metrics[pid].status !== 'unproven');
  rec = sc.blankRecord('chess');
  for (const mt of stage.metrics) { sc.sit(rec, stage, mt.id, { at: t0, pass: true, source: 'exact' }); sc.sit(rec, stage, mt.id, { at: t0 + 24 * H, pass: true, source: 'exact' }); }
  check('the stage gate holds a stage whose knowledge objectives are not kept', sc.stageGate(rec, stage, {}).complete === false && sc.stageGate(rec, stage, {}).knowledge_ok === false);
  check('...and one whose retention sitting has not come', sc.stageGate(rec, stage, () => ({ complete: true })).unkept.length === stage.metrics.length);
  const plan = sa.planSession({ stage, rec: sc.blankRecord('chess'), now: t0, minutes: 20, knowledgeOpen: true });
  check('a skill plan gives every unproven metric practice and changes no metric', sa.checkPlan(stage, sc.blankRecord('chess'), plan).length === 0 && plan.what.unproven.length === stage.metrics.length, plan);
  const forged = { ...plan, practice: plan.practice.slice(1), sittings: [] };
  check('checkPlan catches a plan that drops an unproven metric', sa.checkPlan(stage, sc.blankRecord('chess'), forged).length > 0);
}

async function sessionHook() {
  console.log('the session hook (services/sessions.js createSession)');
  const lessons = require('../services/lessons');
  const essays = require('../services/essays');
  const levelEditor = require('../services/level-editor');
  lessons.prefetchNext = () => {};
  essays.prefetch = () => {};
  levelEditor.prefetchNext = () => {};
  const sessions = require('../services/sessions');
  const level = o0.practice[2];
  const open = async (mode) => {
    if (mode) process.env.ADAPTIVE_TEACHING = mode; else delete process.env.ADAPTIVE_TEACHING;
    const user = newUser();
    const e = newEnrollment(user, { current_level: level });
    const at = Date.UTC(2026, 9, 1);
    answerItems(user, e, o0.lesson_level, 3, { at, role: 'check' });
    answerItems(user, e, o0.practice[0], 4, { at: at + 3600000 });
    const out = await sessions.createSession({ userId: user.id, enrollment: db.byId('enrollments', e.id), grade });
    return { session: out.session, items: out.items };
  };
  const off = await open('off');
  check('off: no plan on the sitting', !off.session.adaptation_plan);
  const shadow = await open('shadow');
  check('shadow: the plan is recorded on the sitting', shadow.session.adaptation_plan && shadow.session.adaptation_plan.knobs.practice === 'compress', shadow.session.adaptation_plan);
  check('shadow: the learner gets the same block as with it off', shadow.items.length === off.items.length
    && JSON.stringify(shadow.session.params) === JSON.stringify(off.session.params), [shadow.items.length, off.items.length]);
  const on = await open('on');
  check('on: a proven objective\'s practice block is shorter', on.items.length < off.items.length
    && on.session.params.itemCount === on.session.adaptation_plan.knobs.item_count, [on.items.length, off.items.length]);
  process.env.ADAPTIVE_TEACHING = 'off';
}

sessionHook().catch((err) => { failures++; console.log(`  FAIL session hook threw: ${err.stack || err.message}`); }).finally(() => {
  try { fs.unlinkSync(tmp); } catch { /* already gone */ }
  console.log(failures ? `\n${failures} FAILED` : '\nall passed');
  process.exit(failures ? 1 : 0);
});
