/**
 * The skill stage gate's page (services/skill-gate.js; staged patch
 * skills-round3/03-stage-gate). Mounted by routes/skills.js (patch 01) when this
 * file is present; answers 404 unless SKILL_RECORD=on and SKILL_STAGE_GATE is
 * not off.
 *
 *   GET  /api/skills/left/:enrollmentId            what is left before this stage can be left
 *   POST /api/skills/left/:enrollmentId/graduate   a held graduation, asked again: the same gates, never a lower bar
 */
const express = require('express');
const db = require('../config/db');
const curriculum = require('../config/curriculum');
const record = require('../services/skill-record');
const gate = require('../services/skill-gate');
const mastery = require('../services/mastery');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use('/skills/left', (req, res, next) => {
  if (!gate.active()) return res.status(404).json({ error: 'No such endpoint.' });
  next();
});

function own(req) {
  const enrollment = db.byId('enrollments', req.params.enrollmentId);
  if (!enrollment || enrollment.user_id !== req.user.id) return null;
  if (!record.stageFor(enrollment.track_id, enrollment.grade_id)) return null;
  return enrollment;
}

router.get('/skills/left/:enrollmentId', requireAuth, (req, res) => {
  const enrollment = own(req);
  if (!enrollment) return res.status(404).json({ error: 'Enrollment not found.' });
  const grade = curriculum.getGrade(enrollment.track_id, enrollment.grade_id);
  const track = curriculum.getTrack(enrollment.track_id);
  res.json({
    enrollment: { id: enrollment.id, status: enrollment.status, current_level: enrollment.current_level, held_at: enrollment.skill_held_at || null },
    track: { id: track.id, name: track.name },
    grade: { id: grade.id, name: grade.name },
    left: gate.left(req.user.id, enrollment),
    proofs: gate.proofs(req.user.id, enrollment),
  });
});

router.post('/skills/left/:enrollmentId/graduate', requireAuth, (req, res) => {
  const enrollment = own(req);
  if (!enrollment) return res.status(404).json({ error: 'Enrollment not found.' });
  if (!enrollment.skill_held_at || enrollment.status === 'graduated') return res.status(409).json({ error: 'There is no held graduation here.' });
  const out = gate.left(req.user.id, enrollment);
  if (!out.complete) return res.status(409).json({ error: 'Not every measured skill is proven yet.', left: out });
  const grade = curriculum.getGrade(enrollment.track_id, enrollment.grade_id);
  // The same call a passed Final makes: the coverage gate and this gate are asked again.
  const result = mastery.clearCheckpoint(db.byId('enrollments', enrollment.id), grade, 'graduation');
  if (result.graduated) db.update('enrollments', enrollment.id, { skill_held_at: null, skill_released_at: new Date().toISOString() });
  res.json(result);
});

router.pathNode = (userId, enrollment) => gate.pathNode(userId, enrollment);

module.exports = router;
