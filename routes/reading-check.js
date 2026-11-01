/**
 * The reading check's API (services/reading-check.js).
 *
 *   GET  /api/reading-check                 whether a check is on offer (onboarding, or one of the few later ones), the last result
 *   POST /api/reading-check/start           { kind } begin (or resume the open check): the first question
 *   POST /api/reading-check/answer          { session_id, item_id, choice (0-3 or null for "I don't know"), ms } -> the next question, or the result
 *   POST /api/reading-check/decline         { kind } "not now": uses up the offer
 *
 * The key never leaves the server: questions are sent without it and graded here. The result goes into the scorecard through
 * its evidence path (scorecard/hooks.js onReadingCheck), not as a value written to the card.
 */
const express = require('express');
const readingCheck = require('../services/reading-check');
const { requireAuth } = require('../middleware/auth');
const { limit } = require('../utils/rate-limit');

const router = express.Router();
const fail = (res, out) => res.status(out.code === 'not_found' ? 404 : out.code === 'off' ? 404 : 400).json({ error: out.error, code: out.code });

router.get('/', requireAuth, (req, res) => {
  res.json(readingCheck.status(req.user.id));
});

router.post('/start', requireAuth, limit('reading-check', 20, 60 * 1000), (req, res) => {
  const out = readingCheck.start(req.user, { kind: req.body && req.body.kind });
  if (out.error) return fail(res, out);
  res.json(out);
});

router.post('/answer', requireAuth, limit('reading-check-answer', 120, 60 * 1000), (req, res) => {
  const b = req.body || {};
  const out = readingCheck.answer(req.user, b.session_id, b.item_id, b.choice === null || b.choice === undefined || b.choice === '' ? null : Number(b.choice), Number(b.ms) || 0);
  if (out.error) return fail(res, out);
  res.json(out);
});

router.post('/decline', requireAuth, (req, res) => {
  res.json(readingCheck.decline(req.user, req.body && req.body.kind));
});

module.exports = router;
