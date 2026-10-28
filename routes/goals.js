/**
 * The goal picker's API (services/goals.js).
 *
 *   GET /api/goals?track_id=&grade_id=   the goal that applies, whether the step was already
 *                                        answered or skipped, and the choices to show
 *   GET /api/goals/all                   every goal set, for the profile page
 *   PUT /api/goals                       save, change, clear or skip a goal
 */
const express = require('express');
const curriculum = require('../config/curriculum');
const goals = require('../services/goals');
const { requireAuth } = require('../middleware/auth');
const { limit } = require('../utils/rate-limit');

const router = express.Router();

function choices() {
  return Object.entries(goals.CHOICES).map(([id, c]) => ({ id, label: c.label, needs_text: id === 'specific' }));
}

function targetOf(src) {
  const trackId = String(src.track_id || '');
  const gradeId = src.grade_id ? String(src.grade_id) : null;
  if (!curriculum.getTrack(trackId)) return null;
  if (gradeId && !curriculum.getGrade(trackId, gradeId)) return null;
  return { trackId, gradeId };
}

router.get('/goals', requireAuth, (req, res) => {
  const t = targetOf(req.query);
  if (!t) return res.status(404).json({ error: 'No such subject.' });
  res.json({
    goal: goals.forGrade(req.user.id, t.trackId, t.gradeId),
    asked: goals.asked(req.user.id, t.trackId, t.gradeId),
    text_max: goals.TEXT_MAX,
    choices: choices(),
  });
});

router.get('/goals/all', requireAuth, (req, res) => {
  const rows = goals.listFor(req.user.id).map((g) => {
    const track = curriculum.getTrack(g.track_id);
    const grade = g.grade_id ? curriculum.getGrade(g.track_id, g.grade_id) : null;
    return { ...g, track_name: track ? track.name : g.track_id, grade_name: grade ? grade.name : null };
  });
  res.json({ goals: rows, text_max: goals.TEXT_MAX, choices: choices() });
});

router.put('/goals', requireAuth, limit('goals', 60, 60 * 60 * 1000), (req, res) => {
  const t = targetOf(req.body || {});
  if (!t) return res.status(404).json({ error: 'No such subject.' });
  const out = goals.set(req.user.id, {
    trackId: t.trackId,
    gradeId: t.gradeId,
    choice: req.body.choice || null,
    text: req.body.text,
    skipped: req.body.skipped === true,
  });
  if (out.error) return res.status(400).json({ error: out.error });
  res.json(out);
});

module.exports = router;
