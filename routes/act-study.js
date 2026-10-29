/**
 * The ACT measurement study (services/act-study.js).
 *
 *   GET  /api/act-study/me                    am I in it, and in which order
 *   POST /api/act-study/join                  { consent, parent_aware, seen_forms, other_prep? }
 *   POST /api/act-study/leave
 *   GET  /api/act-study/admin/report          admin only: every participant, before and after
 *   GET  /api/act-study/admin/report.csv      the same as a spreadsheet
 */
const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const study = require('../services/act-study');

const router = express.Router();

router.get('/me', requireAuth, (req, res) => res.json(study.mine(req.user.id)));

router.post('/join', requireAuth, (req, res) => {
  const checked = study.cleanJoin(req.body);
  if (checked.error) return res.status(400).json({ error: checked.error });
  study.join(req.user.id, checked.value);
  res.status(201).json(study.mine(req.user.id));
});

router.post('/leave', requireAuth, (req, res) => {
  if (!study.leave(req.user.id)) return res.status(404).json({ error: 'You are not in the study.' });
  res.json(study.mine(req.user.id));
});

router.get('/admin/report', requireAuth, requireAdmin, (req, res) => res.json(study.report()));

router.get('/admin/report.csv', requireAuth, requireAdmin, (req, res) => {
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="act-study.csv"');
  res.send(study.toCsv());
});

module.exports = router;
