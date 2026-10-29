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
const db = require('../config/db');
const goals = require('../services/goals');
const goalOrder = require('../services/goal-order');
const spanishFit = require('../services/spanish/goal-fit');
const unitPlacement = require('../services/unit-placement');
const { requireAuth } = require('../middleware/auth');
const { limit } = require('../utils/rate-limit');

const router = express.Router();

/** The choices for a subject: a choice that lists tracks is shown only on those. */
function choices(trackId = null) {
  return Object.entries(goals.CHOICES)
    .filter(([, c]) => !c.tracks || (trackId && c.tracks.includes(trackId)))
    .map(([id, c]) => ({ id, label: c.label, needs_text: id === 'specific' }));
}

function targetOf(src) {
  const trackId = String(src.track_id || '');
  const gradeId = src.grade_id ? String(src.grade_id) : null;
  if (!curriculum.getTrack(trackId)) return null;
  if (gradeId && !curriculum.getGrade(trackId, gradeId)) return null;
  return { trackId, gradeId };
}

/**
 * What the goal does on this path, in the learner's words: Spanish names its
 * profile (services/spanish/goal-fit.js), other subjects say which units the
 * goal text puts first (services/goal-order.js). null when nothing is set.
 */
function fitOf(userId, t) {
  const goal = goals.forGrade(userId, t.trackId, t.gradeId);
  if (!goal) return null;
  if (t.trackId === 'spanish') {
    const p = spanishFit.profileFor(userId, t.gradeId || 'entry');
    return { label: p.label, why: p.why };
  }
  if (!t.gradeId) return null;
  const enrollment = db.findOne('enrollments', (e) => e.user_id === userId && e.track_id === t.trackId && e.grade_id === t.gradeId);
  const units = enrollment ? unitPlacement.unitsFor(t.trackId, t.gradeId) : null;
  const first = goalOrder.named(enrollment, units);
  if (!goals.applies(userId)) return null;
  return first.length
    ? { label: 'Your units first', why: `Units that match your words come first: ${first.map((u) => u.title).join(', ')}. Every other unit stays on the path and open.` }
    : { label: 'Course order', why: 'Name a skill in your own words (for example "fractions") and the units that teach it come first. Nothing is ever hidden.' };
}

router.get('/goals', requireAuth, (req, res) => {
  const t = targetOf(req.query);
  if (!t) return res.status(404).json({ error: 'No such subject.' });
  res.json({
    fit: fitOf(req.user.id, t),
    goal: goals.forGrade(req.user.id, t.trackId, t.gradeId),
    asked: goals.asked(req.user.id, t.trackId, t.gradeId),
    text_max: goals.TEXT_MAX,
    choices: choices(t.trackId),
  });
});

router.get('/goals/all', requireAuth, (req, res) => {
  const rows = goals.listFor(req.user.id).map((g) => {
    const track = curriculum.getTrack(g.track_id);
    const grade = g.grade_id ? curriculum.getGrade(g.track_id, g.grade_id) : null;
    return { ...g, track_name: track ? track.name : g.track_id, grade_name: grade ? grade.name : null };
  });
  // Every choice, each with the tracks it is limited to, so the profile page can
  // offer the right ones for each subject's goal.
  const all = Object.entries(goals.CHOICES).map(([id, c]) => ({ id, label: c.label, needs_text: id === 'specific', tracks: c.tracks || null }));
  res.json({ goals: rows, text_max: goals.TEXT_MAX, choices: all });
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
    targetDate: req.body.target_date,
  });
  if (out.error) return res.status(400).json({ error: out.error });
  res.json(out);
});

module.exports = router;
