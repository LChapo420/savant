/**
 * A held graduation (staged patch round3/05-graduation-held).
 *
 * With COVERAGE_GATE=enforce (default `shadow`), passing the Final graduates a
 * learner only when every objective of the grade is proven and kept
 * (services/coverage.js gate; services/mastery.js clearCheckpoint). When it is
 * not, the enrollment stays on the Final's level with `coverage_held_at` set.
 * These routes are the way on from there:
 *
 *   GET  /api/coverage/:enrollmentId/held      what graduation is waiting on,
 *                                              objective by objective
 *   POST /api/coverage/:enrollmentId/graduate  ask the gate again, and graduate
 *                                              once it is met
 *
 * Nothing here lowers the bar: the Final is not sat again, and graduation
 * happens only through the same gate that held it.
 */
const express = require('express');
const db = require('../config/db');
const curriculum = require('../config/curriculum');
const coverage = require('../services/coverage');
const adaptation = require('../services/adaptation');
const mastery = require('../services/mastery');
const { requireAuth } = require('../middleware/auth');
const { limit } = require('../utils/rate-limit');

const router = express.Router();

/** Whether the daily review (staged patch round3/01) is installed and on: memory checks can then be done in one sitting. */
function reviewAvailable() {
  try {
    // eslint-disable-next-line global-require
    return require('../services/review-session').enabled();
  } catch {
    return false;
  }
}

function ownEnrollment(req) {
  const enrollment = db.byId('enrollments', req.params.enrollmentId);
  if (!enrollment || enrollment.user_id !== req.user.id) return null;
  return enrollment;
}

function heldView(userId, enrollment) {
  const grade = curriculum.getGrade(enrollment.track_id, enrollment.grade_id);
  const track = curriculum.getTrack(enrollment.track_id);
  const held = enrollment.status === 'active' && !!enrollment.coverage_held_at;
  return {
    held,
    held_at: enrollment.coverage_held_at || null,
    status: enrollment.status,
    gate_mode: coverage.gateMode(),
    exam: enrollment.coverage_graduation || null,
    enrollment: { id: enrollment.id, status: enrollment.status, current_level: enrollment.current_level },
    track: track ? { id: track.id, name: track.name } : null,
    grade: grade ? { id: grade.id, name: grade.name } : null,
    plan: held ? adaptation.heldPlanFor({ userId, enrollment }) : null,
    review_available: reviewAvailable(),
  };
}

router.get('/coverage/:enrollmentId/held', requireAuth, (req, res) => {
  const enrollment = ownEnrollment(req);
  if (!enrollment) return res.status(404).json({ error: 'Enrollment not found.' });
  res.json(heldView(req.user.id, enrollment));
});

router.post('/coverage/:enrollmentId/graduate', requireAuth, limit('coverage-graduate', 60, 60 * 60 * 1000), (req, res) => {
  const enrollment = ownEnrollment(req);
  if (!enrollment) return res.status(404).json({ error: 'Enrollment not found.' });
  if (enrollment.status === 'graduated') return res.json({ graduated: true, already: true, ...heldView(req.user.id, enrollment) });
  if (!enrollment.coverage_held_at) return res.status(409).json({ error: 'Pass the Graduation exam first.' });
  const grade = curriculum.getGrade(enrollment.track_id, enrollment.grade_id);
  if (!grade) return res.status(400).json({ error: 'That subject is no longer available.' });
  // The same gate that held it: clearCheckpoint asks coverage.atGraduation again.
  const result = mastery.clearCheckpoint(enrollment, grade, 'graduation');
  if (result.graduated) db.update('enrollments', enrollment.id, { coverage_held_at: null, coverage_released_at: new Date().toISOString() });
  res.json({ graduated: !!result.graduated, ...heldView(req.user.id, db.byId('enrollments', enrollment.id)) });
});

module.exports = router;
