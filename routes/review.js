/**
 * The daily review (services/review-session.js; staged patch
 * round3/01-daily-review). Off unless ADAPT_REVIEW_SESSION=on: every route here
 * then answers 404, the same as before the patch.
 *
 *   GET  /api/review/:enrollmentId          today's review: what is due and why
 *   POST /api/review/:enrollmentId/start    open (or resume) today's sitting
 *   POST /api/review/sessions/:id/finish    close it: score, XP, what is kept now
 *
 * Answers go through the ordinary answer route (POST /api/sessions/:id/answer),
 * which grades them, feeds mastery and the scorecard, and reveals each verdict.
 */
const express = require('express');
const db = require('../config/db');
const curriculum = require('../config/curriculum');
const sessions = require('../services/sessions');
const review = require('../services/review-session');
const { requireAuth } = require('../middleware/auth');
const { limit } = require('../utils/rate-limit');

const router = express.Router();

router.use('/review', (req, res, next) => {
  if (!review.enabled()) return res.status(404).json({ error: 'No such endpoint.' });
  next();
});

function ownEnrollment(req) {
  const enrollment = db.byId('enrollments', req.params.enrollmentId);
  if (!enrollment || enrollment.user_id !== req.user.id) return null;
  return enrollment;
}

router.get('/review/:enrollmentId', requireAuth, (req, res) => {
  const enrollment = ownEnrollment(req);
  if (!enrollment) return res.status(404).json({ error: 'Enrollment not found.' });
  const grade = curriculum.getGrade(enrollment.track_id, enrollment.grade_id);
  const track = curriculum.getTrack(enrollment.track_id);
  if (!grade || !track) return res.status(400).json({ error: 'That subject is no longer available.' });
  res.json({
    enrollment: { id: enrollment.id, status: enrollment.status, current_level: enrollment.current_level },
    track: { id: track.id, name: track.name },
    grade: { id: grade.id, name: grade.name },
    review: review.today(req.user.id, enrollment),
  });
});

router.post('/review/:enrollmentId/start', requireAuth, limit('review-start', 60, 60 * 60 * 1000), (req, res) => {
  const enrollment = ownEnrollment(req);
  if (!enrollment) return res.status(404).json({ error: 'Enrollment not found.' });
  if (enrollment.status !== 'active') return res.status(409).json({ error: 'There is no review on this subject right now.' });
  const out = review.start(req.user.id, enrollment);
  if (out.error) return res.status(out.status || 400).json({ error: out.error });
  res.status(out.resumed ? 200 : 201).json({
    session_id: out.session.id,
    resumed: !!out.resumed,
    track_id: enrollment.track_id,
    items: out.items.map((it) => ({
      ...sessions.sanitize(it),
      // Why this objective is in today's review, said on the question.
      review_reason: it.review_reason || null,
    })),
  });
});

router.post('/review/sessions/:id/finish', requireAuth, (req, res) => {
  const session = db.byId('sessions', req.params.id);
  if (!session || session.user_id !== req.user.id || session.kind !== 'review') {
    return res.status(404).json({ error: 'Session not found.' });
  }
  res.json(review.finish(req.user.id, session));
});

module.exports = router;
