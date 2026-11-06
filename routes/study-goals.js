/**
 * Study goals: what the learner wants out of each subject and each uploaded course (services/study-goal.js;
 * docs/MODIFICATION-AUDIT.md).
 *
 *   GET /api/study-goals     every subject and course with its goal, in the learner's words, and what the goal sets aside
 *   PUT /api/study-goals     { kind: 'enrollment'|'material', id, goal: 'full'|'core'|'test', restore?: [level or skill id | 'all'], unrestore?: [...] }
 *
 * No goal set means full depth, today's behaviour. STUDY_GOAL=off ignores every goal. Nothing is ever deleted by a goal:
 * what core sets aside stays open and comes back with one click.
 */
const express = require('express');
const goals = require('../services/study-goal');
const { requireAuth } = require('../middleware/auth');
const { limit } = require('../utils/rate-limit');

const router = express.Router();

router.get('/study-goals', requireAuth, (req, res) => {
  res.json({ enabled: goals.enabled() && goals.choices().length > 1, ...goals.listFor(req.user.id) });
});

router.put('/study-goals', requireAuth, limit('study-goals', 120, 60 * 60 * 1000), (req, res) => {
  const b = req.body || {};
  if (!['enrollment', 'material'].includes(b.kind)) return res.status(400).json({ error: 'Choose a subject or a course.' });
  const out = goals.save(req.user.id, b.kind, b.id, { goal: b.goal, restore: b.restore, unrestore: b.unrestore });
  if (out.error) return res.status(out.status || 400).json({ error: out.error });
  const list = goals.listFor(req.user.id)[b.kind === 'enrollment' ? 'enrollments' : 'materials'];
  res.json({ ok: true, item: list.find((x) => x.id === out.row.id) });
});

module.exports = router;
