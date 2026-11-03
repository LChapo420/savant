/**
 * The daily plan (services/daily-plan.js; docs/DAILY-PLAN.md): today across every subject, for the minutes the learner has.
 *
 *   GET /api/plan/today?minutes=N   the ordered blocks (reviews first, then new material, with breaks), each with a reason;
 *                                   N is 10 to 240, else the learner's remembered choice (45 until they pick one)
 *   PUT /api/plan/minutes           { minutes } remember the learner's choice (the dashboard's 30 / 45 / 60 / 90 / 120)
 *
 * Reads only what the learner has already done: no model is called and nothing new is measured. A plan
 * with levels not yet written ahead (plan.unwritten) starts the write-ahead for those subjects in the
 * background (services/write-ahead.js trigger, fire-and-forget), so they load rather than generate.
 */
const express = require('express');
const plan = require('../services/daily-plan');
const { requireAuth } = require('../middleware/auth');
const { limit } = require('../utils/rate-limit');

const router = express.Router();

router.get('/plan/today', requireAuth, limit('daily-plan', 240, 60 * 60 * 1000), (req, res) => {
  const raw = req.query.minutes;
  if (raw !== undefined && raw !== '' && plan.cleanMinutes(raw) === null) {
    return res.status(400).json({ error: `Minutes must be a whole number from ${plan.MIN_MINUTES} to ${plan.MAX_MINUTES}.` });
  }
  try {
    const today = plan.planFor(req.user.id, { minutes: raw });
    res.json(today);
    // The levels today needs that are not written yet: written ahead now, after the reply.
    const pending = [...new Set(((today && today.unwritten) || []).map((u) => u.enrollmentId))];
    if (pending.length) {
      setImmediate(() => {
        // eslint-disable-next-line global-require
        const writeAhead = require('../services/write-ahead');
        // eslint-disable-next-line global-require
        const db = require('../config/db');
        for (const id of pending) {
          const enrollment = db.byId('enrollments', id);
          if (enrollment && enrollment.user_id === req.user.id) writeAhead.trigger({ user: req.user, enrollment, reason: 'daily-plan' });
        }
      });
    }
  } catch (err) {
    console.warn(`[daily-plan] ${err && err.stack ? err.stack : err}`);
    res.status(500).json({ error: 'The plan could not be built right now.' });
  }
});

router.put('/plan/minutes', requireAuth, limit('daily-plan-minutes', 120, 60 * 60 * 1000), (req, res) => {
  const m = plan.saveMinutes(req.user.id, (req.body || {}).minutes);
  if (!m) return res.status(400).json({ error: `Minutes must be a whole number from ${plan.MIN_MINUTES} to ${plan.MAX_MINUTES}.` });
  res.json({ ok: true, minutes: m });
});

module.exports = router;
