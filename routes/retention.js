/**
 * Study sessions, retention enforcers and the retention calendar
 * (services/study-sessions.js, services/enforcers.js,
 * curriculum-build/RETENTION-ENFORCERS.md). RETENTION_ENFORCERS=off: every
 * route here answers 404.
 *
 *   GET  /api/retention/state                 the open session and what is waiting
 *   POST /api/retention/study/start           Start session (409 + the offer while one waits)
 *   POST /api/retention/study/beat            the page's heartbeat
 *   POST /api/retention/study/pause | resume
 *   POST /api/retention/study/end {kind}      End session ('session') or End day session ('day')
 *   GET  /api/retention/enforcers/:id         one enforcer: its tiers, or its questions
 *   POST /api/retention/enforcers/:id/choose {tier}   quick | medium | full | none
 *   POST /api/retention/enforcers/:id/finish
 *   POST /api/retention/enforcers/:id/skip    the owner only
 *   GET  /api/retention/calendar?month=YYYY-MM
 *
 * Every call may carry the browser's time zone (`tz`, body or query): the
 * learner's days are their local calendar days.
 */
const express = require('express');
const db = require('../config/db');
const study = require('../services/study-sessions');
const enforcers = require('../services/enforcers');
const { requireAuth, requireSkip } = require('../middleware/auth');
const { limit } = require('../utils/rate-limit');

const router = express.Router();

router.use('/retention', (req, res, next) => {
  if (!study.enabled()) return res.status(404).json({ error: 'No such endpoint.' });
  next();
});

function zone(req) {
  const tz = (req.body && req.body.tz) || (req.query && req.query.tz) || null;
  if (tz && req.user) study.zoneFor(req.user.id, String(tz));
}

function state(userId) {
  const now = Date.now();
  const open = study.current(userId, now);
  const waiting = enforcers.offers(userId, { now });
  return {
    study: study.view(open, now),
    offer: waiting.length ? enforcers.view(waiting[0], { userId }) : null,
    waiting: waiting.length,
    today: study.today(userId, now),
    anchor: study.anchorOf(userId),
    // Today's scheduled enforcer, taken at End day session (it absorbs the end-of-day one).
    scheduled_today: enforcers.scheduledToday(userId, now),
  };
}

function own(req) {
  const enf = db.byId('enforcers', req.params.id);
  if (!enf || enf.user_id !== req.user.id) return null;
  return enf;
}

router.get('/retention/state', requireAuth, (req, res) => {
  zone(req);
  res.json(state(req.user.id));
});

router.post('/retention/study/start', requireAuth, limit('study-start', 120, 60 * 60 * 1000), (req, res) => {
  zone(req);
  const now = Date.now();
  const open = study.current(req.user.id, now);
  if (open) return res.json({ ...state(req.user.id), started: false });
  // What was left waiting is offered before the next session starts.
  const waiting = enforcers.offers(req.user.id, { now });
  if (waiting.length) {
    return res.status(409).json({ error: 'Finish or choose for the enforcer that is waiting first.', offer: enforcers.view(waiting[0], { userId: req.user.id }) });
  }
  study.start(req.user.id, { now });
  res.status(201).json({ ...state(req.user.id), started: true });
});

router.post('/retention/study/beat', requireAuth, limit('study-beat', 400, 60 * 60 * 1000), (req, res) => {
  const s = study.beat(req.user.id, {});
  res.json({ study: study.view(s) });
});

router.post('/retention/study/pause', requireAuth, (req, res) => {
  res.json({ study: study.view(study.pause(req.user.id, {})) });
});

router.post('/retention/study/resume', requireAuth, (req, res) => {
  res.json({ study: study.view(study.resume(req.user.id, {})) });
});

router.post('/retention/study/end', requireAuth, (req, res) => {
  zone(req);
  const kind = req.body && req.body.kind === 'day' ? 'day' : 'session';
  const ended = study.end(req.user.id, { kind });
  if (!ended) return res.status(409).json({ error: 'There is no session running.' });
  const enf = ended.enforcer_id ? db.byId('enforcers', ended.enforcer_id) : null;
  res.json({ study: study.view(ended), enforcer: enforcers.view(enf, { userId: req.user.id }) });
});

router.get('/retention/enforcers/:id', requireAuth, (req, res) => {
  const enf = own(req);
  if (!enf) return res.status(404).json({ error: 'Enforcer not found.' });
  if (enf.status === 'running') enforcers.reopen(enf);
  res.json({ enforcer: enforcers.view(db.byId('enforcers', enf.id), { userId: req.user.id, withItems: true }) });
});

router.post('/retention/enforcers/:id/choose', requireAuth, limit('enforcer-choose', 120, 60 * 60 * 1000), (req, res) => {
  const enf = own(req);
  if (!enf) return res.status(404).json({ error: 'Enforcer not found.' });
  const tier = String((req.body && req.body.tier) || '');
  const out = enforcers.choose(req.user.id, enf, tier);
  if (out.error) return res.status(out.status || 400).json({ error: out.error });
  res.json({ enforcer: enforcers.view(db.byId('enforcers', enf.id), { userId: req.user.id, withItems: true }), results: out.results || null });
});

router.post('/retention/enforcers/:id/finish', requireAuth, (req, res) => {
  const enf = own(req);
  if (!enf) return res.status(404).json({ error: 'Enforcer not found.' });
  const out = enforcers.finish(req.user.id, enf);
  if (out.error) return res.status(out.status || 400).json({ error: out.error });
  res.json({ enforcer: enforcers.view(db.byId('enforcers', enf.id), { userId: req.user.id, withItems: true }), results: out.results });
});

router.post('/retention/enforcers/:id/skip', requireAuth, requireSkip, (req, res) => {
  const enf = own(req);
  if (!enf) return res.status(404).json({ error: 'Enforcer not found.' });
  const out = enforcers.skip(req.user.id, enf);
  res.json({ enforcer: enforcers.view(out.enforcer, { userId: req.user.id }) });
});

router.get('/retention/calendar', requireAuth, (req, res) => {
  zone(req);
  res.json(enforcers.calendar(req.user.id, { month: req.query.month || null }));
});

module.exports = router;
