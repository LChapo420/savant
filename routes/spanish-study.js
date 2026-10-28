/**
 * The Savant vs Duolingo beginner-Spanish study (services/spanish-study.js).
 *
 *   GET  /api/spanish-study/me                  am I in it, my arm, my window, my check-ins
 *   POST /api/spanish-study/join                { consent, age_group: adult|teen, parent_aware?, no_recent_spanish }
 *   POST /api/spanish-study/checkin             { day?, minutes, screenshot }  Duolingo arm: the day's minutes
 *   POST /api/spanish-study/leave
 *   GET  /api/spanish-study/admin/report        admin only: both arms, intervals, every participant
 *   GET  /api/spanish-study/admin/report.csv    the same as a spreadsheet
 */
const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const study = require('../services/spanish-study');

const router = express.Router();

router.get('/me', requireAuth, (req, res) => res.json(study.mine(req.user.id)));

router.post('/join', requireAuth, async (req, res) => {
  const checked = study.cleanJoin(req.body);
  if (checked.error) return res.status(400).json({ error: checked.error });
  try {
    await study.join(req.user.id, checked.value);
  } catch (err) {
    console.error('spanish-study join:', err.message);
    return res.status(503).json({ error: 'The public random number we draw your group from could not be reached. Try again in a minute.' });
  }
  res.status(201).json(study.mine(req.user.id));
});

router.post('/checkin', requireAuth, (req, res) => {
  const out = study.checkin(req.user.id, req.body);
  if (out.error) return res.status(out.status).json({ error: out.error });
  res.json(study.mine(req.user.id));
});

router.post('/leave', requireAuth, (req, res) => {
  if (!study.leave(req.user.id)) return res.status(404).json({ error: 'You are not in the study.' });
  res.json(study.mine(req.user.id));
});

router.get('/admin/report', requireAuth, requireAdmin, (req, res) => res.json(study.report()));

router.get('/admin/report.csv', requireAuth, requireAdmin, (req, res) => {
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="spanish-study.csv"');
  res.send(study.toCsv());
});

module.exports = router;
