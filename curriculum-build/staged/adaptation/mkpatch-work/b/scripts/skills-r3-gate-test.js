/**
 * Tests for the skill stage gate (staged skills round 3, patch 03-stage-gate):
 * services/skill-gate.js, routes/skill-gate.js and its hook in
 * services/mastery.js clearCheckpoint. Needs patch 01.
 *
 *   node scripts/skills-r3-gate-test.js
 *
 * Throwaway data file, keys blanked, no model call, no network.
 */
const F = require('./lib/skills-r3-fixture');

const { db, check, learner, serve, fresh, DAY, at, now } = F;
const record = require('../services/skill-record');
const mastery = require('../services/mastery');
const sc = require('../services/skill-coverage');

/** Prove every provable metric of a stage: cold passes on two days (and the retention sitting where the stage asks for one). */
function proveStage(uid, subject, stage, day0) {
  const word = (mt) => {
    const w = record.listedWords(mt);
    return ['board', 'midi', 'count', 'tap', 'screen', 'items', 'games'].find((x) => w.includes(x));
  };
  const days = [0, 1].concat(stage.retention_days ? [1 + stage.retention_days] : []);
  for (const d of days) {
    at(day0 + d * DAY);
    for (const mt of stage.metrics) if (mt.source.provable) record.sit(uid, { subject, metricId: mt.id, pass: true, source: word(mt) });
  }
}

(async () => {
  console.log('skills round 3, patch 03: the stage gate');
  process.env.SKILL_RECORD = 'on';
  const routes = fresh('routes/skills');
  const app = await serve([routes]);
  const pianoStage = record.stageFor('piano', 'piano_keyboard_explorer');

  // ── shadow (the default): graduates as before, writes what it would have said ──
  at(Date.UTC(2026, 9, 1, 9));
  const a = learner('piano', 'piano_keyboard_explorer', 'final');
  let res = mastery.clearCheckpoint(db.byId('enrollments', a.enrollment.id), a.grade, 'graduation');
  let e = db.byId('enrollments', a.enrollment.id);
  check('shadow: a passed Final graduates as before', res.graduated === true && e.status === 'graduated', res);
  check('...and records what the gate would have said', e.skill_gate_shadow && e.skill_gate_shadow.complete === false && e.skill_gate_shadow.missing.length === 4, e.skill_gate_shadow);

  // ── off ──
  process.env.SKILL_STAGE_GATE = 'off';
  const b = learner('piano', 'piano_keyboard_explorer', 'final');
  res = mastery.clearCheckpoint(db.byId('enrollments', b.enrollment.id), b.grade, 'graduation');
  e = db.byId('enrollments', b.enrollment.id);
  check('off: graduates and writes nothing', res.graduated === true && !e.skill_gate_shadow);
  let r = await app.get(`/api/skills/left/${b.enrollment.id}`, b.user.id);
  check('off: the page answers 404', r.status === 404);

  // ── on: held until every provable metric is proven ──
  process.env.SKILL_STAGE_GATE = 'on';
  const c = learner('piano', 'piano_keyboard_explorer', 'final');
  r = await app.get(`/api/skills/path/${c.enrollment.id}`, c.user.id);
  check('on: at the Final with skills left, the path says what is left before the stage', r.json.nodes.some((n) => n.kind === 'stage_left' && /4 left/.test(n.kind_label)), r.json.nodes);
  res = mastery.clearCheckpoint(db.byId('enrollments', c.enrollment.id), c.grade, 'graduation');
  e = db.byId('enrollments', c.enrollment.id);
  check('on: a passed Final with unproven skills does not graduate', res.graduated === false && res.skill_held === true && e.status === 'active' && e.skill_held_at, res);
  r = await app.get(`/api/skills/left/${c.enrollment.id}`, c.user.id);
  check('the page lists what is left: four piano skills not proven', r.status === 200 && r.json.left.missing.length === 4 && !r.json.left.complete && r.json.left.mode === 'on', r.json.left);
  check('...each with when it can next be sat cold', r.json.left.missing.every((m) => m.cold_at));
  r = await app.get(`/api/skills/path/${c.enrollment.id}`, c.user.id);
  check('the path row says graduation waits on the stage\'s skills', r.json.nodes.some((n) => n.kind === 'stage_left' && n.held && n.next), r.json.nodes);
  r = await app.post(`/api/skills/left/${c.enrollment.id}/graduate`, {}, c.user.id);
  check('graduating is refused while skills are left', r.status === 409);
  // One cold day is not enough.
  at(Date.UTC(2026, 9, 2, 9));
  for (const mt of pianoStage.metrics) record.sit(c.user.id, { subject: 'piano', metricId: mt.id, pass: true, source: 'midi' });
  r = await app.get(`/api/skills/left/${c.enrollment.id}`, c.user.id);
  check('one cold day of passes leaves all four unproven', r.json.left.missing.length === 4 && r.json.left.missing.every((m) => m.proof_days === 1), r.json.left.missing.map((m) => m.proof_days));
  at(Date.UTC(2026, 9, 3, 9));
  for (const mt of pianoStage.metrics) record.sit(c.user.id, { subject: 'piano', metricId: mt.id, pass: true, source: 'midi' });
  r = await app.get(`/api/skills/left/${c.enrollment.id}`, c.user.id);
  check('cold passes on a second day prove them (PI0 asks no retention test)', r.json.left.complete && r.json.left.proven === 4, r.json.left);
  check('every proof re-derives from its sittings', r.json.proofs.every((p) => p.holds && p.holds.ok), r.json.proofs);
  r = await app.post(`/api/skills/left/${c.enrollment.id}/graduate`, {}, c.user.id);
  e = db.byId('enrollments', c.enrollment.id);
  check('then graduating goes through the same gates and graduates', r.status === 200 && r.json.graduated === true && e.status === 'graduated' && !e.skill_held_at && e.skill_released_at, r.json);

  // Stale proofs hold: the battery must stand when the stage is left.
  const d = learner('piano', 'piano_keyboard_explorer', 'final');
  proveStage(d.user.id, 'piano', pianoStage, Date.UTC(2026, 9, 1, 9));
  at(Date.UTC(2026, 9, 12, 9));
  res = mastery.clearCheckpoint(db.byId('enrollments', d.enrollment.id), d.grade, 'graduation');
  check('proven, but over 7 days ago: held until a fresh cold pass', res.graduated === false && res.skill.stale.length === 4, res.skill);
  for (const mt of pianoStage.metrics) record.sit(d.user.id, { subject: 'piano', metricId: mt.id, pass: true, source: 'midi' });
  res = mastery.clearCheckpoint(db.byId('enrollments', d.enrollment.id), d.grade, 'graduation');
  check('...one fresh cold pass each and it graduates', res.graduated === true, res);

  // Retention: chess CH1 asks again after 7 days.
  const ch = learner('chess', 'chess_rules_learner', 'final');
  const chStage = record.stageFor('chess', 'chess_rules_learner');
  at(Date.UTC(2026, 10, 1, 9));
  for (const day of [0, 1]) { at(Date.UTC(2026, 10, 1 + day, 9)); for (const mt of chStage.metrics) record.sit(ch.user.id, { subject: 'chess', metricId: mt.id, pass: true, source: mt.id.endsWith('legal_game') ? 'games' : 'board' }); }
  res = mastery.clearCheckpoint(db.byId('enrollments', ch.enrollment.id), ch.grade, 'graduation');
  check('chess: proven but its retention test not yet sat, held', res.graduated === false && res.skill.unkept.length === 4, res.skill);
  r = await app.get(`/api/skills/left/${ch.enrollment.id}`, ch.user.id);
  check('...the page lists them under the retention check with the day it is ready', r.json.left.unkept.length === 4 && r.json.left.unkept.every((m) => m.retention_due_at));

  // Attested-only metrics never hold a stage.
  const p3 = learner('piano', 'piano_elementary_1', 'final');
  const p3Stage = record.stageFor('piano', 'piano_elementary_1');
  proveStage(p3.user.id, 'piano', p3Stage, Date.UTC(2026, 11, 1, 9));
  r = await app.get(`/api/skills/left/${p3.enrollment.id}`, p3.user.id);
  check('the recital (self-assessed) is listed as attested and does not hold Elementary 1', r.json.left.attest.some((m) => m.id === 'PI3:recital') && r.json.left.complete, r.json.left);

  // Not a skill subject, and not the last grade of its stage.
  const m = learner('math', 'numbers_to_10', 'final');
  res = mastery.clearCheckpoint(db.byId('enrollments', m.enrollment.id), m.grade, 'graduation');
  check('another subject graduates untouched by the skill gate', res.graduated === true && !db.byId('enrollments', m.enrollment.id).skill_held_at);
  const multi = sc.stagesFor('piano').find((s) => s.grades.length > 1);
  const g0 = multi.grades[0];
  const early = learner('piano', g0, 'final');
  res = mastery.clearCheckpoint(db.byId('enrollments', early.enrollment.id), early.grade, 'graduation');
  check(`a grade that is not its stage's last (${g0} in ${multi.id}) does not leave the stage, so it is not held`, res.graduated === true, res);

  // SKILL_RECORD off: inert whatever SKILL_STAGE_GATE says.
  process.env.SKILL_RECORD = 'off';
  const z = learner('piano', 'piano_keyboard_explorer', 'final');
  res = mastery.clearCheckpoint(db.byId('enrollments', z.enrollment.id), z.grade, 'graduation');
  check('with the record off the gate is inert', res.graduated === true);

  app.close();
  F.done();
})().catch((err) => { console.error(err); process.exit(1); });
