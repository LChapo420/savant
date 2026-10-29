/**
 * ACT score entry (services/act-scores.js).
 *
 *   GET    /api/act/scores        the profile, every recorded score, and the days to the test
 *   POST   /api/act/profile       { test_date?, target? }  null clears one
 *   POST   /api/act/scores        { kind?, taken_on, form?, english, math, reading, science? }
 *   DELETE /api/act/scores/:id    one of the learner's own scores
 */
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const act = require('../services/act-scores');

const router = express.Router();

router.get('/scores', requireAuth, (req, res) => {
  res.json(act.summary(req.user.id));
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
