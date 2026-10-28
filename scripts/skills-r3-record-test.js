/**
 * Tests for the skill record store (staged skills round 3, patch
 * 01-skill-record): services/skill-record.js, routes/skills.js, the
 * skill_records collection and its place in the consent export and deletion.
 *
 *   node scripts/skills-r3-record-test.js
 *
 * Throwaway data file, keys blanked, no model call, no network.
 */
const F = require('./lib/skills-r3-fixture');
const fs = require('fs');
const path = require('path');

const { db, check, learner, serve, fresh, HOUR, DAY, at, later, now } = F;
const record = require('../services/skill-record');
const sc = require('../services/skill-coverage');

(async () => {
  console.log('skills round 3, patch 01: the skill record store');

  // ── the store and the consent rules ──
  check('the skill_records collection exists', (() => { try { db.all('skill_records'); return true; } catch { return false; } })());
  const consentSrc = fs.readFileSync(path.join(__dirname, '..', 'routes', 'consent.js'), 'utf8');
  const known = consentSrc.slice(consentSrc.indexOf('const KNOWN_COLLECTIONS'), consentSrc.indexOf('];', consentSrc.indexOf('const KNOWN_COLLECTIONS')));
  check('routes/consent.js lists skill_records, so the parent export and a deletion reach its rows', known.includes("'skill_records'"));
  check('the progressions are in the app (content/skill-progressions)', sc.stagesFor('chess').length === 10 && sc.stagesFor('piano').length === 8 && sc.stagesFor('basketball').length === 7);
  for (const s of sc.SUBJECTS) check(`${s}: every stage has an exit battery with tests, pass rules and sources`, sc.validate(s).ok, sc.validate(s).problems.slice(0, 2));

  // ── off: every route answers 404 ──
  const routes = fresh('routes/skills');
  const app = await serve([routes]);
  const chess = learner('chess', 'chess_rules_learner');
  let r = await app.get(`/api/skills/record/${chess.enrollment.id}`, chess.user.id);
  check('off: GET /api/skills/record answers 404', r.status === 404, r);
  r = await app.get(`/api/skills/path/${chess.enrollment.id}`, chess.user.id);
  check('off: GET /api/skills/path answers 404', r.status === 404, r);

  process.env.SKILL_RECORD = 'on';
  r = await app.get(`/api/skills/record/${chess.enrollment.id}`, chess.user.id);
  check('on: the record names the stage of the grade (chess_rules_learner is CH1)', r.status === 200 && r.json.record.stage.id === 'CH1' && r.json.record.metrics.length === 4, r.json && r.json.record && r.json.record.stage);
  check('...every metric unproven, nothing stored before a sitting', r.json.record.metrics.every((m) => m.status === 'unproven' && m.sittings === 0) && db.find('skill_records', (x) => x.user_id === chess.user.id).length === 0);
  const other = learner('chess', 'chess_board_explorer');
  r = await app.get(`/api/skills/record/${chess.enrollment.id}`, other.user.id);
  check("someone else's enrollment is not found", r.status === 404, r.status);
  r = await app.get(`/api/skills/record/${chess.enrollment.id}`, null);
  check('signed out: 401', r.status === 401);
  const math = learner('math', 'numbers_to_10');
  r = await app.get(`/api/skills/record/${math.enrollment.id}`, math.user.id);
  check('a subject that is not chess, piano or basketball has no skill record', r.status === 404);
  r = await app.get(`/api/skills/path/${chess.enrollment.id}`, chess.user.id);
  check('the path rows: none while the parts (02-04) are off or not applied', r.status === 200 && Array.isArray(r.json.nodes) && r.json.nodes.length === 0, r.json);

  // ── sittings: cold or warm, day, source, confirmation ──
  const uid = chess.user.id;
  const id = 'CH1:check_mate_stalemate_id';
  at(Date.UTC(2026, 9, 1, 9));
  let out = record.sit(uid, { subject: 'chess', metricId: id, pass: true, source: 'board', kind: 'stage_test', score: 0.95, n: 20 });
  check('a first sitting is cold and counts', out.counted && out.sitting.cold && out.row.status === 'unproven');
  check('...and is stored with its day, source word, class, score and kind', out.sitting.day === '2026-10-01' && out.sitting.source_word === 'board' && out.sitting.source === 'exact' && out.sitting.score === 0.95 && out.sitting.kind === 'stage_test' && out.sitting.at_iso);
  later(2 * HOUR);
  out = record.sit(uid, { subject: 'chess', metricId: id, pass: true, source: 'board' });
  check('a second sitting the same day is warm and does not count', !out.counted && !out.sitting.cold && /warm/.test(out.why), out.why);
  at(Date.UTC(2026, 9, 2, 6));
  record.practise(uid, { subject: 'chess', metricId: id, atTarget: true });
  later(4 * HOUR);
  out = record.sit(uid, { subject: 'chess', metricId: id, pass: true, source: 'board' });
  check('four hours after practising it, a sitting is warm', !out.counted && out.row.status === 'unproven');
  check('coldAt says when the next sitting will be cold (20 hours after practice, the next day)', record.coldAt(out.row, now()) >= Date.UTC(2026, 9, 3, 0) - 1);
  at(Date.UTC(2026, 9, 3, 9));
  out = record.sit(uid, { subject: 'chess', metricId: id, pass: true, source: 'board' });
  check('cold passes on two different days prove the metric', out.counted && out.proved && out.row.status === 'proven', out.row.status);
  const audit = record.auditStage(uid, 'chess', 'CH1').find((x) => x.id === id);
  check('...and the proof re-derives from its sittings', audit.holds && audit.holds.ok, audit);

  // Retaking until two lucky passes come cannot prove a metric.
  const id2 = 'CH1:mate_in_1_unannounced';
  at(Date.UTC(2026, 9, 1, 9)); record.sit(uid, { subject: 'chess', metricId: id2, pass: true, source: 'board' });
  at(Date.UTC(2026, 9, 2, 9)); record.sit(uid, { subject: 'chess', metricId: id2, pass: false, source: 'board' });
  at(Date.UTC(2026, 9, 3, 9)); out = record.sit(uid, { subject: 'chess', metricId: id2, pass: true, source: 'board' });
  check('pass, miss, pass on three days is not proof (the belief)', out.counted && out.row.status === 'unproven', out.row.B);
  at(Date.UTC(2026, 9, 4, 9)); out = record.sit(uid, { subject: 'chess', metricId: id2, pass: true, source: 'board' });
  check('...one more cold pass is', out.row.status === 'proven', out.row.B);

  // Sources: an estimate counts only confirmed; a source the metric does not list never counts.
  const piano = learner('piano', 'piano_first_reader');
  const pid = 'PI2:pieces';
  at(Date.UTC(2026, 9, 1, 9)); out = record.sit(piano.user.id, { subject: 'piano', metricId: pid, pass: true, source: 'mic' });
  check('a microphone take unconfirmed is recorded and does not count', !out.counted && out.sitting.source === 'estimate' && /confirmed/.test(out.why), out.why);
  at(Date.UTC(2026, 9, 2, 9)); out = record.sit(piano.user.id, { subject: 'piano', metricId: pid, pass: true, source: 'mic', confirmed: true });
  check('a confirmed microphone take counts', out.counted && out.sitting.confirmed);
  at(Date.UTC(2026, 9, 3, 9)); out = record.sit(piano.user.id, { subject: 'piano', metricId: pid, pass: true, source: 'on-screen' });
  check('on-screen keys never count for a metric that lists only MIDI and the microphone', !out.counted && /not a source this metric lists/.test(out.why), out.why);
  at(Date.UTC(2026, 9, 4, 9)); out = record.sit(piano.user.id, { subject: 'piano', metricId: pid, pass: true, source: 'midi' });
  check('MIDI counts, and with the confirmed microphone day it proves the metric', out.counted && out.row.status !== 'unproven', out.row.status);
  const bb = learner('basketball', 'basketball_mini_starter');
  at(Date.UTC(2026, 9, 1, 9)); out = record.sit(bb.user.id, { subject: 'basketball', metricId: 'BB1:layup_both_hands', pass: true, source: 'camera', confirmed: true });
  check('basketball: a confirmed camera count counts where the metric lists the camera', out.counted && out.sitting.source === 'estimate');
  const bb2 = learner('basketball', 'basketball_mini_player');
  out = record.sit(bb2.user.id, { subject: 'basketball', metricId: 'BB2:form_shots_1m', pass: true, source: 'camera', confirmed: true });
  check('...and never where it does not (BB2 form shots list only counts)', !out.counted, out.why);
  out = record.sit(bb2.user.id, { subject: 'basketball', metricId: 'BB2:warmup_habit', pass: true, source: 'log' });
  check('an attested-only metric is recorded and never counts', !out.counted && /attested/.test(out.why), out.why);
  check('an unknown metric is refused', !!record.sit(uid, { subject: 'chess', metricId: 'CH1:nope', pass: true, source: 'board' }).error);

  // Retention and the battery standing at exit.
  const c2 = learner('chess', 'chess_rules_learner');
  const st = record.stageFor('chess', 'chess_rules_learner');
  at(Date.UTC(2026, 10, 1, 9));
  for (const mt of st.metrics) record.sit(c2.user.id, { subject: 'chess', metricId: mt.id, pass: true, source: mt.id.endsWith('legal_game') ? 'games' : 'board' });
  at(Date.UTC(2026, 10, 2, 9));
  for (const mt of st.metrics) record.sit(c2.user.id, { subject: 'chess', metricId: mt.id, pass: true, source: mt.id.endsWith('legal_game') ? 'games' : 'board' });
  let v = record.stageView(c2.user.id, c2.enrollment, now());
  check('proven on two days, the stage still waits on its retention tests (CH1 asks again after 7+ days)', v.gate.unkept.length === 4 && v.gate.missing.length === 0 && v.metrics.every((m) => m.retention_due_at), v.gate);
  at(Date.UTC(2026, 10, 10, 9));
  for (const mt of st.metrics) record.sit(c2.user.id, { subject: 'chess', metricId: mt.id, pass: true, source: mt.id.endsWith('legal_game') ? 'games' : 'board' });
  v = record.stageView(c2.user.id, c2.enrollment, now());
  check('after the retention sittings every metric is kept', v.gate.unkept.length === 0 && v.metrics.every((m) => m.status === 'retained'), v.gate);
  check('the knowledge side comes from the coverage gate of the stage\'s grade', v.knowledge.length === 1 && v.knowledge[0].id === 'chess_rules_learner' && v.gate.knowledge_ok === v.knowledge[0].complete);
  at(Date.UTC(2026, 10, 19, 9));
  v = record.stageView(c2.user.id, c2.enrollment, now());
  check('a proof over 7 days old is stale: the battery must stand when the stage is left', v.gate.stale.length === 4 && v.metrics.every((m) => m.stale), v.gate.stale);

  // Deletion reaches skill rows.
  const consent = require('../routes/consent');
  const kid = learner('piano', 'piano_keyboard_explorer');
  record.sit(kid.user.id, { subject: 'piano', metricId: 'PI0:find_keys', pass: true, source: 'midi' });
  const c = db.insert('parental_consents', { child_user_id: kid.user.id, status: 'active', parent_email: 'p@example.test', history: [] });
  check('a child has a skill row before deletion', db.find('skill_records', (x) => x.user_id === kid.user.id).length === 1);
  try { consent.deleteChild(db.byId('parental_consents', c.id), 'parent_request', 'test'); } catch (err) { check(`deleteChild ran (${err.message})`, false); }
  check("deleting a child's account removes its skill records", db.find('skill_records', (x) => x.user_id === kid.user.id).length === 0);

  app.close();
  F.done();
})().catch((err) => { console.error(err); process.exit(1); });
