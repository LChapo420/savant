/**
 * Stage checks (services/skill-checks.js; staged patch skills-round3/02-stage-tests).
 * Mounted by routes/skills.js (patch 01) when this file is present; every route
 * answers 404 unless SKILL_RECORD=on and SKILL_STAGE_TESTS=on.
 *
 *   GET  /api/skills/checks/:enrollmentId                   the stage's checks: what each measures, its state, what is due
 *   POST /api/skills/checks/:enrollmentId/:metric/start     open (or resume) a sitting: items, piano parts or puzzles
 *   POST /api/skills/checks/:enrollmentId/:metric/answer    one answer in an items sitting {index, answer, source}
 *   POST /api/skills/checks/:enrollmentId/:metric/take      one piano take {part, played: [{midi, time, velocity, source}]}
 *   POST /api/skills/checks/:enrollmentId/:metric/finish    close it: graded here, recorded in the skill record
 *   POST /api/skills/checks/:enrollmentId/:metric/count     a basketball count, recorded in one step
 *
 * The page never receives an answer key before a sitting is closed. Piano
 * takes send note events and basketball counts send numbers: no sound, picture
 * or clip ever reaches the server.
 */
const express = require('express');
const db = require('../config/db');
const curriculum = require('../config/curriculum');
const record = require('../services/skill-record');
const checks = require('../services/skill-checks');
const { requireAuth } = require('../middleware/auth');
const { limit } = require('../utils/rate-limit');

const router = express.Router();

router.use('/skills/checks', (req, res, next) => {
  if (!checks.enabled()) return res.status(404).json({ error: 'No such endpoint.' });
  next();
});

function own(req) {
  const enrollment = db.byId('enrollments', req.params.enrollmentId);
  if (!enrollment || enrollment.user_id !== req.user.id) return null;
  if (!record.stageFor(enrollment.track_id, enrollment.grade_id)) return null;
  return enrollment;
}

function reply(res, out, ok = 200) {
  if (out && out.error) return res.status(out.status || 400).json({ error: out.error, ...(out.done !== undefined ? { done: out.done } : {}) });
  return res.status(ok).json(out);
}

router.get('/skills/checks/:enrollmentId', requireAuth, (req, res) => {
  const enrollment = own(req);
  if (!enrollment) return res.status(404).json({ error: 'Enrollment not found.' });
  const grade = curriculum.getGrade(enrollment.track_id, enrollment.grade_id);
  const track = curriculum.getTrack(enrollment.track_id);
  const final = grade ? (grade.levels.find((l) => l.kind === 'graduation') || {}).level : null;
  res.json({
    enrollment: { id: enrollment.id, status: enrollment.status, current_level: enrollment.current_level, final_level: final || null },
    track: { id: track.id, name: track.name },
    grade: { id: grade.id, name: grade.name },
    checks: checks.overview(req.user.id, enrollment),
  });
});

const sittingLimit = limit('skill-checks', 240, 60 * 60 * 1000);

router.post('/skills/checks/:enrollmentId/:metric/start', requireAuth, sittingLimit, (req, res) => {
  const enrollment = own(req);
  if (!enrollment) return res.status(404).json({ error: 'Enrollment not found.' });
  const out = checks.start(req.user.id, enrollment, req.params.metric);
  reply(res, out, out.resumed ? 200 : 201);
});

router.post('/skills/checks/:enrollmentId/:metric/answer', requireAuth, sittingLimit, (req, res) => {
  const enrollment = own(req);
  if (!enrollment) return res.status(404).json({ error: 'Enrollment not found.' });
  const b = req.body || {};
  reply(res, checks.answer(req.user.id, enrollment, req.params.metric, { index: b.index, answer: b.answer, source: typeof b.source === 'string' ? b.source.slice(0, 12) : null }));
});

router.post('/skills/checks/:enrollmentId/:metric/take', requireAuth, sittingLimit, (req, res) => {
  const enrollment = own(req);
  if (!enrollment) return res.status(404).json({ error: 'Enrollment not found.' });
  const b = req.body || {};
  reply(res, checks.take(req.user.id, enrollment, req.params.metric, { part: b.part, played: b.played, origin: b.origin === undefined ? null : b.origin }));
});

router.post('/skills/checks/:enrollmentId/:metric/finish', requireAuth, sittingLimit, (req, res) => {
  const enrollment = own(req);
  if (!enrollment) return res.status(404).json({ error: 'Enrollment not found.' });
  reply(res, checks.finish(req.user.id, enrollment, req.params.metric));
});

router.post('/skills/checks/:enrollmentId/:metric/count', requireAuth, sittingLimit, (req, res) => {
  const enrollment = own(req);
  if (!enrollment) return res.status(404).json({ error: 'Enrollment not found.' });
  reply(res, checks.count(req.user.id, enrollment, req.params.metric, req.body));
});

router.pathNode = (userId, enrollment) => checks.pathNode(userId, enrollment);

module.exports = router;
