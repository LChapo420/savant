/**
 * The baseline session's API (services/onboarding/index.js): how this learner's brain works and how they learn best, measured before Savant
 * writes anything. Three modes; the next item is chosen after every answer.
 *
 *   GET  /api/onboarding/modes    { allowed, modes: [{ id, label, minutes, blurb }], done, last }
 *   POST /api/onboarding/start    { mode, resume?, interests_last? } -> { session, step, progress } (the last two are the new onboarding's: /start)
 *   POST /api/onboarding/answer   { session, id, response, ms, skip? } -> the next { step, progress } or { done, summary }
 *   POST /api/onboarding/stop     { interests_last? } close early; what was answered counts
 *
 * An account the measurement channels are closed to (under its consent age without a parent's agreement) gets `allowed: false` and 403 from the
 * rest; the page sends it to the existing learning-style quiz.
 */
const express = require('express');
const onboarding = require('../services/onboarding');
const { requireAuth } = require('../middleware/auth');
const { limit } = require('../utils/rate-limit');

const router = express.Router();
router.use(requireAuth);

const reply = (res, out) => (out && out.error ? res.status(out.code === 'not_allowed' ? 403 : out.code === 'stale' ? 409 : 400).json({ error: out.error, code: out.code }) : res.json(out));

router.get('/modes', (req, res) => res.json(onboarding.modes(req.user)));
router.post('/start', limit('onboarding-start', 10, 60 * 1000), (req, res) => reply(res, onboarding.start(req.user, req.body && req.body.mode, req.body || {})));
router.post('/answer', limit('onboarding-answer', 240, 60 * 1000), (req, res) => reply(res, onboarding.answer(req.user, req.body)));
router.post('/stop', limit('onboarding-stop', 10, 60 * 1000), (req, res) => reply(res, onboarding.stop(req.user, req.body || {})));

module.exports = router;
