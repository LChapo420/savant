/**
 * ACT score entry (services/act-scores.js).
 *
 *   GET    /api/act/scores        the profile, every recorded score, and the days to the test
 *   POST   /api/act/profile       { test_date?, target? }  null clears one
 *   POST   /api/act/scores        { kind?, taken_on, form?, english, math, reading, science? }
 *   DELETE /api/act/scores/:id    one of the learner's own scores
 *   GET    /api/act/plan          the session-by-session plan to the test date (services/act-plan.js)
 */
const express = require('express');
const db = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const act = require('../services/act-scores');
const plan = require('../services/act-plan');

const router = express.Router();

router.get('/scores', requireAuth, (req, res) => {
  res.json(act.summary(req.user.id));
});

router.get('/plan', requireAuth, (req, res) => {
  const out = plan.forUser(req.user.id);
  // Where a learn or review session is done: the learner's own ACT path. There is no drill for a single ACT skill yet.
  const enrollment = db.findOne('enrollments', (e) => e.user_id === req.user.id && e.track_id === 'act');
  res.json({ ...out, practice_href: enrollment ? `/path?enrollment=${enrollment.id}` : null });
});

router.post('/profile', requireAuth, (req, res) => {
  const checked = act.cleanProfile(req.body);
  if (checked.error) return res.status(400).json({ error: checked.error });
  act.setProfile(req.user.id, checked.value);
  res.json(act.summary(req.user.id));
});

router.post('/scores', requireAuth, (req, res) => {
  const checked = act.cleanScore(req.body);
  if (checked.error) return res.status(400).json({ error: checked.error });
  const added = act.addScore(req.user.id, checked.value);
  if (added.error) return res.status(400).json({ error: added.error });
  res.status(201).json({ score: added.value, ...act.summary(req.user.id) });
});

router.delete('/scores/:id', requireAuth, (req, res) => {
  if (!act.removeScore(req.user.id, req.params.id)) return res.status(404).json({ error: 'No such score.' });
  res.json(act.summary(req.user.id));
});

module.exports = router;
