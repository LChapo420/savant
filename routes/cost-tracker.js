/**
 * The cost and performance tracker's routes (services/cost-tracker.js, docs/COST-TRACKER.md).
 *
 *   POST /api/cost-beacon          a signed-in page reports how long a level took to open (sizes and times only)
 *   GET  /api/admin/cost-tracker   the rolled-up numbers; admin only (404 for everyone else)
 *                                  ?days=7 (1-90)  &user=<id>  &scope=all|me|learners|internal|shared|scripts|product
 *   GET  /api/admin/my-stats       the owner's own learner account day by day (services/my-stats.js): for an admin or that
 *                                  account itself (404 for everyone else); ?days=30 (1-90). The page is /my-stats.
 * The page is /cost-tracker (public/cost-tracker.html), gated the same way in server.js.
 * Read-only: nothing here calls a model or changes a learner's data.
 */
const express = require('express');
const tracker = require('../services/cost-tracker');
const myStats = require('../services/my-stats');
const owner = require('../config/owner');
const { requireAuth, requireAdmin, isAdmin } = require('../middleware/auth');

const router = express.Router();

router.post('/cost-beacon', requireAuth, (req, res) => {
  tracker.recordClient(req.user, req.body);
  res.status(204).end();
});

router.get('/admin/cost-tracker', requireAuth, requireAdmin, (req, res) => {
  res.json(tracker.summarize({ days: req.query.days, user: req.query.user, scope: req.query.scope }));
});

router.get('/admin/my-stats', requireAuth, (req, res) => {
  if (!isAdmin(req.user) && !owner.isOwnerLearner(req.user)) return res.status(404).json({ error: 'No such endpoint.' });
  res.json(myStats.compute({ days: req.query.days }));
});

module.exports = router;
