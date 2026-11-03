/**
 * Retention goals: how long the learner wants to remember each subject and each uploaded course
 * (services/retention-goal.js; docs/RETENTION-GOALS.md).
 *
 *   GET /api/retention-goals                 every subject and course with its goal, in the learner's words,
 *                                            and the reviews dropped; the test-date reviews coming up
 *   PUT /api/retention-goals                 { kind: 'enrollment'|'material', id, horizon, test_date? }
 *                                            or, after a test date has passed, { kind, id, keep_after }
 *   GET /api/retention-goals/preview?horizon=&test_date=   what a choice would do, before it is saved
 *
 * No goal set means forever, today's full long-term schedule. Works with or without RETENTION_ENFORCERS.
 */
const express = require('express');
const goals = require('../services/retention-goal');
const schedule = require('../services/retention-schedule');
const { requireAuth } = require('../middleware/auth');
const { limit } = require('../utils/rate-limit');

const router = express.Router();

router.get('/retention-goals', requireAuth, (req, res) => {
  const out = goals.listFor(req.user.id);
  out.headline = goals.headline(req.user.id);
  res.json(out);
});

router.get('/retention-goals/preview', requireAuth, (req, res) => {
  const today = goals.todayFor(req.user.id);
  const n = goals.normalize({ horizon: req.query.horizon, test_date: req.query.test_date }, today);
  if (n.error) return res.status(400).json({ error: n.error });
  const eff = goals.effective(n.goal, today);
  const d = goals.describe(eff);
  const plan = eff.status === 'date'
    ? goals.datePlan(0, eff.days_left).map((p) => ({ on: schedule.addDays(today, p.day), kind: p.kind }))
    : [];
  res.json({ goal: eff, summary: d.text, dropped: d.dropped, plan });
});

router.put('/retention-goals', requireAuth, limit('retention-goals', 120, 60 * 60 * 1000), (req, res) => {
  const b = req.body || {};
  if (!['enrollment', 'material'].includes(b.kind)) return res.status(400).json({ error: 'Choose a subject or a course.' });
  const out = goals.save(req.user.id, b.kind, b.id, { horizon: b.horizon, test_date: b.test_date, keep_after: b.keep_after });
  if (out.error) return res.status(out.status || 400).json({ error: out.error });
  const row = goals.listFor(req.user.id)[b.kind === 'enrollment' ? 'enrollments' : 'materials'].find((x) => x.id === out.row.id);
  res.json({ ok: true, item: row });
});

module.exports = router;
