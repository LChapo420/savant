/**
 * The learner's own calendar events (services/tutor-events.js; docs/TUTOR-EVENTS.md). TUTOR_EVENTS gates them (default on).
 *
 *   GET    /api/events?from=&to=     the learner's events, soonest first (+ `today`, `kinds`, their subjects for the form)
 *   POST   /api/events               { title, date, time?, kind?, enrollment_id?, source?, suggestion_id? }  add (a card's Add passes suggestion_id)
 *   PUT    /api/events/:id           change any of the fields
 *   DELETE /api/events/:id
 *   POST   /api/events/dismiss       { suggestion_id? }  "Not now" on a card
 *   GET    /api/events/goal-preview?enrollment_id=&date=   what setting that subject's retention goal to a test date would do
 */
const express = require('express');
const ev = require('../services/tutor-events');
const goals = require('../services/retention-goal');
const { requireAuth } = require('../middleware/auth');
const { limit } = require('../utils/rate-limit');

const router = express.Router();
const gate = (req, res, next) => (ev.on() ? next() : res.status(404).json({ error: 'Not on.' }));
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

router.get('/events', requireAuth, gate, (req, res) => {
  const today = ev.todayOf(req.user);
  const from = isDate(req.query.from) ? req.query.from : undefined;
  const to = isDate(req.query.to) ? req.query.to : undefined;
  const db = require('../config/db'); // eslint-disable-line global-require
  const enrollments = goals.listFor(req.user.id).enrollments.map((e) => ({ id: e.id, title: e.title }));
  res.set('Cache-Control', 'private, no-store').json({ today, kinds: ev.KINDS, events: ev.list(req.user.id, { from, to }), enrollments, count: db.find(ev.COLLECTION, (r) => r && r.user_id === req.user.id).length });
});

router.post('/events', requireAuth, gate, limit('events-write', 120, 60 * 60 * 1000), (req, res) => {
  const b = req.body || {};
  const out = ev.add(req.user.id, b, { source: b.source === 'tutor' ? 'tutor' : 'manual', today: ev.todayOf(req.user) });
  if (out.error) return res.status(out.status || 400).json({ error: out.error });
  if (b.suggestion_id) ev.settle(req.user.id, String(b.suggestion_id));
  res.status(out.existing ? 200 : 201).json(out);
});

router.put('/events/:id', requireAuth, gate, limit('events-write', 120, 60 * 60 * 1000), (req, res) => {
  const out = ev.update(req.user.id, req.params.id, req.body, { today: ev.todayOf(req.user) });
  if (out.error) return res.status(out.status || 400).json({ error: out.error });
  res.json(out);
});

router.delete('/events/:id', requireAuth, gate, limit('events-write', 120, 60 * 60 * 1000), (req, res) => {
  if (!ev.remove(req.user.id, req.params.id)) return res.status(404).json({ error: 'Not found.' });
  res.json({ ok: true });
});

router.post('/events/dismiss', requireAuth, gate, (req, res) => {
  const id = req.body && req.body.suggestion_id;
  if (id) ev.settle(req.user.id, String(id)); else ev.clearPending(req.user.id);
  res.json({ ok: true });
});

router.get('/events/goal-preview', requireAuth, gate, (req, res) => {
  const today = ev.todayOf(req.user);
  const date = String(req.query.date || '');
  const e = require('../config/db').byId('enrollments', Number(req.query.enrollment_id)); // eslint-disable-line global-require
  if (!e || e.user_id !== req.user.id) return res.status(404).json({ error: 'Not found.' });
  const n = goals.normalize({ horizon: 'date', test_date: date }, today);
  if (n.error) return res.status(400).json({ error: n.error });
  res.json({ text: `Reviews will aim at ${ev.niceDate(date)}.`, summary: goals.describe(goals.effective(n.goal, today)).text });
});

module.exports = router;
