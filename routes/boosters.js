/**
 * The measurement channels' API (services/boosters.js, services/boosters-import.js): optional ways to give the scorecard more to go on.
 *
 *   GET  /api/boosters                      what is on offer and what is done (404-style { allowed: false } for an account that may not)
 *   GET  /api/boosters/questionnaire        the sixteen items            POST .../questionnaire { answers }   POST .../questionnaire/skip
 *   POST /api/boosters/delayed/start        the 30-second memory check   POST .../delayed/answer { check_id, answers }
 *   POST /api/boosters/games/:game          { result } a finished game (span, speed, attention)
 *   POST /api/boosters/silent               { on } switch the silent behaviour signals     POST .../silent/batch { batch }
 *   POST /api/boosters/max-accuracy         { on }
 *   POST /api/boosters/import               { act_composite, sat_total, psat_total, gpa, history_csv }
 *   GET  /api/boosters/choice?track=&grade=&level=   "which is clearer?" after a lesson ({ offer: null } when there is nothing to ask)
 *   POST /api/boosters/choice               { offer_id, pick: a | b | same | skip }   POST .../choice/setting { on }
 *
 * Every route needs a signed-in account the channels are open to (an account under its consent age is not offered them without a parent's
 * agreement). Nothing here writes a value into the scorecard: each channel's result goes through its evidence path.
 */
const express = require('express');
const boosters = require('../services/boosters');
const imports = require('../services/boosters-import');
const { requireAuth } = require('../middleware/auth');
const { limit } = require('../utils/rate-limit');

const router = express.Router();
router.use(requireAuth);

const fail = (res, out) => res.status(out.code === 'not_allowed' ? 403 : out.code === 'not_found' || out.code === 'nothing_due' ? 404 : 400).json({ error: out.error, code: out.code });
const reply = (res, out) => (out && out.error ? fail(res, out) : res.json(out));

router.get('/', (req, res) => res.json(boosters.status(req.user)));
router.get('/questionnaire', (req, res) => (boosters.allowed(req.user) ? res.json(boosters.questionnaire.items()) : fail(res, { error: 'Not available for this account.', code: 'not_allowed' })));
router.post('/questionnaire', limit('boosters-q', 20, 60 * 1000), (req, res) => reply(res, boosters.questionnaire.submit(req.user, req.body && req.body.answers)));
router.post('/questionnaire/skip', (req, res) => reply(res, boosters.questionnaire.skip(req.user)));
router.post('/delayed/start', limit('boosters-d', 20, 60 * 1000), (req, res) => reply(res, boosters.delayed.start(req.user)));
router.post('/delayed/answer', limit('boosters-d', 40, 60 * 1000), (req, res) => reply(res, boosters.delayed.answer(req.user, req.body && req.body.check_id, req.body && req.body.answers)));
router.post('/games/:game', limit('boosters-g', 30, 60 * 1000), (req, res) => reply(res, boosters.games.submit(req.user, req.params.game, req.body && req.body.result)));
router.post('/silent', (req, res) => reply(res, boosters.silent.set(req.user, !!(req.body && req.body.on))));
router.post('/silent/batch', limit('boosters-s', 120, 60 * 1000), (req, res) => reply(res, boosters.silent.ingest(req.user, req.body && req.body.batch)));
router.post('/max-accuracy', (req, res) => reply(res, boosters.maxAccuracy.set(req.user, !!(req.body && req.body.on))));
router.get('/choice', (req, res) => {
  const where = { trackId: String(req.query.track || ''), gradeId: String(req.query.grade || ''), level: Number(req.query.level) };
  if (!where.trackId || !where.gradeId || !Number.isInteger(where.level)) return res.status(400).json({ error: 'Which lesson?', code: 'bad_request' });
  return res.json({ offer: boosters.choice.offer(req.user, where) });
});
router.post('/choice', limit('boosters-c', 30, 60 * 1000), (req, res) => reply(res, boosters.choice.answer(req.user, req.body && req.body.offer_id, req.body && String(req.body.pick || ''))));
router.post('/choice/setting', (req, res) => reply(res, boosters.choice.set(req.user, !!(req.body && req.body.on))));
router.post('/import', limit('boosters-i', 10, 60 * 1000), express.json({ limit: '600kb' }), (req, res) => reply(res, imports.importResults(req.user, req.body)));

module.exports = router;
