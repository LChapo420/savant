/**
 * The skill check's API (services/speed-placement.js, SPEED_SKILL_PLACEMENT; off by default, 404 then).
 *   POST /api/speed/skill-check/:enrollmentId/start          first or current question
 *   POST /api/speed/skill-check/:sessionId/answer            { item_id, answer, ms }: verdict, then the next question or the outcome
 */
const express = require('express');
const db = require('../config/db');
const curriculum = require('../config/curriculum');
const { requireAuth } = require('../middleware/auth');
const sessions = require('../services/sessions');
const placement = require('../services/speed-placement');

const router = express.Router();

router.post('/skill-check/:enrollmentId/start', requireAuth, (req, res) => {
  const enrollment = db.byId('enrollments', req.params.enrollmentId);
  if (!enrollment || enrollment.user_id !== req.user.id) return res.status(404).json({ error: 'Enrollment not found.' });
  const grade = curriculum.getGrade(enrollment.track_id, enrollment.grade_id);
  if (!grade) return res.status(400).json({ error: 'That subject is no longer available.' });
  const out = placement.start(req.user.id, enrollment, grade);
  if (out.error) return res.status(out.status).json({ error: out.error });
  return res.status(201).json({ session_id: out.session.id, item: sessions.sanitize(out.item), skills: (out.session.speed_place.rows || []).length });
});

router.post('/skill-check/:sessionId/answer', requireAuth, async (req, res) => {
  const session = db.byId('sessions', req.params.sessionId);
  if (!session || session.user_id !== req.user.id || !session.speed_place) return res.status(404).json({ error: 'Not found.' });
  if (session.ended_at) return res.status(409).json({ error: 'This check is finished.' });
  const item = db.byId('items', req.body.item_id);
  if (!item || item.session_id !== session.id) return res.status(404).json({ error: 'Question not found.' });
  let result = await sessions.answer({ userId: req.user.id, session, itemId: item.id, userAnswer: req.body.answer, ms: req.body.ms });
  if (!result) return res.status(400).json({ error: 'That answer could not be recorded.' });
  if (result.checking) {
    const settled = await sessions.settleChecking([item.id]);
    const fresh = db.byId('items', item.id);
    result = settled.length ? { correct: false, answer: fresh.answer, rationale: fresh.rationale } : { correct: !!fresh.correct, answer: fresh.answer, rationale: fresh.rationale, feedback: fresh.ai_feedback };
  }
  const enrollment = db.byId('enrollments', session.enrollment_id);
  const grade = curriculum.getGrade(enrollment.track_id, enrollment.grade_id);
  const step = placement.afterAnswer({ userId: req.user.id, session: db.byId('sessions', session.id), enrollment, grade, item: db.byId('items', item.id), correct: !!result.correct });
  return res.json({
    correct: !!result.correct, answer: result.answer, rationale: result.rationale, feedback: result.feedback || null,
    ...(step.next ? { next: sessions.sanitize(step.next) } : {}), ...(step.done ? { done: step.done } : {}),
  });
});

module.exports = router;
