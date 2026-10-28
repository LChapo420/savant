/**
 * Today's practice for chess, piano and basketball (services/skill-dose.js;
 * staged patch skills-round3/04-practice-dose). Mounted by routes/skills.js
 * (patch 01) when this file is present; answers 404 unless SKILL_RECORD=on and
 * SKILL_DOSE=on.
 *
 *   GET  /api/skills/practice/:enrollmentId                   today's plan: which drills, how many sets, why
 *   POST /api/skills/practice/:enrollmentId/:metric/start     a warm set of the metric's own check
 *   POST /api/skills/practice/:enrollmentId/:metric/answer    one answer, marked with the answer shown
 *   POST /api/skills/practice/:enrollmentId/:metric/take      one piano take
 *   POST /api/skills/practice/:enrollmentId/:metric/finish    close the set: at the target or not
 *   POST /api/skills/practice/:enrollmentId/:metric/log       a logged set (basketball counts, or a drill done elsewhere)
 */
const express = require('express');
const db = require('../config/db');
const curriculum = require('../config/curriculum');
const record = require('../services/skill-record');
const dose = require('../services/skill-dose');
const { requireAuth } = require('../middleware/auth');
const { limit } = require('../utils/rate-limit');

const router = express.Router();

router.use('/skills/practice', (req, res, next) => {
  // Off for the owner's account too (base product: services/skill-dose.js onFor).
  if (!dose.enabled() || (req.user && !dose.onFor(req.user))) return res.status(404).json({ error: 'No such endpoint.' });
  next();
});

function own(req) {
  const enrollment = db.byId('enrollments', req.params.enrollmentId);
  if (!enrollment || enrollment.user_id !== req.user.id) return null;
  if (!record.stageFor(enrollment.track_id, enrollment.grade_id)) return null;
  return enrollment;
}
function reply(res, out) {
  if (out && out.error) return res.status(out.status || 400).json({ error: out.error });
  return res.json(out);
}
const setLimit = limit('skill-practice', 400, 60 * 60 * 1000);

router.get('/skills/practice/:enrollmentId', requireAuth, (req, res) => {
  const enrollment = own(req);
  if (!enrollment) return res.status(404).json({ error: 'Enrollment not found.' });
  const grade = curriculum.getGrade(enrollment.track_id, enrollment.grade_id);
  const track = curriculum.getTrack(enrollment.track_id);
  res.json({
    enrollment: { id: enrollment.id, status: enrollment.status },
    track: { id: track.id, name: track.name },
    grade: { id: grade.id, name: grade.name },
    practice: dose.planFor(req.user.id, enrollment),
  });
});

router.post('/skills/practice/:enrollmentId/:metric/start', requireAuth, setLimit, (req, res) => {
  const enrollment = own(req);
  if (!enrollment) return res.status(404).json({ error: 'Enrollment not found.' });
  reply(res, dose.startSet(req.user.id, enrollment, req.params.metric));
});
router.post('/skills/practice/:enrollmentId/:metric/answer', requireAuth, setLimit, (req, res) => {
  const enrollment = own(req);
  if (!enrollment) return res.status(404).json({ error: 'Enrollment not found.' });
  const b = req.body || {};
  reply(res, dose.answerSet(req.user.id, enrollment, req.params.metric, { index: b.index, answer: b.answer, source: typeof b.source === 'string' ? b.source.slice(0, 12) : null }));
});
router.post('/skills/practice/:enrollmentId/:metric/take', requireAuth, setLimit, (req, res) => {
  const enrollment = own(req);
  if (!enrollment) return res.status(404).json({ error: 'Enrollment not found.' });
  reply(res, dose.takeSet(req.user.id, enrollment, req.params.metric, req.body || {}));
});
router.post('/skills/practice/:enrollmentId/:metric/finish', requireAuth, setLimit, (req, res) => {
  const enrollment = own(req);
  if (!enrollment) return res.status(404).json({ error: 'Enrollment not found.' });
  reply(res, dose.finishSet(req.user.id, enrollment, req.params.metric));
});
router.post('/skills/practice/:enrollmentId/:metric/log', requireAuth, setLimit, (req, res) => {
  const enrollment = own(req);
  if (!enrollment) return res.status(404).json({ error: 'Enrollment not found.' });
  reply(res, dose.logSet(req.user.id, enrollment, req.params.metric, req.body || {}));
});

router.pathNode = (userId, enrollment) => dose.pathNode(userId, enrollment);

module.exports = router;
