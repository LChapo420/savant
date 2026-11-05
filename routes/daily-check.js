/**
 * The daily check's API (services/daily-check.js): a few minutes a day of measurement in the normal flow, skippable at one tap.
 *
 *   GET  /api/daily-check          { offer, minutes, day }   cheap (no planning): a page can show it at once; { offer: false } when off, skipped, used up or not allowed
 *   POST /api/daily-check/start    -> { session, step, progress }  (or { done, summary } when there is nothing to ask)
 *   POST /api/daily-check/answer   { session, id, response, ms, skip? } -> the next step or { done, summary }
 *   POST /api/daily-check/stop     close early; what was answered counts
 *   POST /api/daily-check/skip     "not today": nothing is asked again until tomorrow
 * An account the measurement channels are closed to (boosters.allowed) gets { offer: false } and 403 from the rest. SCORECARD_DAILY=off: { offer: false }.
 */
const express = require('express');
const daily = require('../services/daily-check');
const { requireAuth } = require('../middleware/auth');
const { limit } = require('../utils/rate-limit');

const router = express.Router();
router.use(requireAuth);

const reply = (res, out) => (out && out.error ? res.status(out.code === 'not_allowed' ? 403 : out.code === 'stale' ? 409 : out.code === 'nothing_due' ? 404 : 400).json({ error: out.error, code: out.code }) : res.json(out));

router.get('/', (req, res) => res.json(daily.offer(req.user)));
router.post('/start', limit('daily-start', 10, 60 * 1000), (req, res) => reply(res, daily.start(req.user)));
router.post('/answer', limit('daily-answer', 240, 60 * 1000), (req, res) => reply(res, daily.answer(req.user, req.body)));
router.post('/stop', limit('daily-stop', 10, 60 * 1000), (req, res) => reply(res, daily.stop(req.user)));
router.post('/skip', limit('daily-skip', 20, 60 * 1000), (req, res) => reply(res, daily.skip(req.user)));

module.exports = router;
