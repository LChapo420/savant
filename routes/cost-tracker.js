/**
 * The cost and performance tracker's routes (services/cost-tracker.js, docs/COST-TRACKER.md).
 *
 *   POST /api/cost-beacon          a signed-in page reports how long a level took to open (sizes and times only)
 *   GET  /api/admin/cost-tracker   the rolled-up numbers; admin only (404 for everyone else)
 *                                  ?days=7 (1-90)  &user=<id>
 * The page is /cost-tracker (public/cost-tracker.html), gated the same way in server.js.
 * Read-only: nothing here calls a model or changes a learner's data.
 */
const express = require('express');
const tracker = require('../services/cost-tracker');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.post('/cost-beacon', requireAuth, (req, res) => {
  tracker.recordClient(req.user, req.body);
  res.status(204).end();
});

router.get('/admin/cost-tracker', requireAuth, requireAdmin, (req, res) => {
  res.json(tracker.summarize({ days: req.query.days, user: req.query.user }));
});

module.exports = router;
