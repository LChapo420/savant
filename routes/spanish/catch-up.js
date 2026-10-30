/**
 * /api/es/catch-up: the Spanish skill catch-up (services/spanish/catch-up.js).
 * Signed in only; every call is about the learner's own catch-up.
 *
 *   GET  /            the whole catch-up for the page (a learner with an old
 *                     accepted catch-up is moved onto this one here)
 *   GET  /summary     the same, in the route shape the path page and dashboard read
 *   POST /start       begin the skill check (or hand back the one running)
 *   POST /answer      { key, qid, answer }: one check or re-check answer; the
 *                     reply says right or wrong (retrieval with feedback) and the next view
 *   POST /next        the next level of the block under way: { url }
 */
const express = require('express');
const catchUp = require('../../services/spanish/catch-up');
const { requireAuth } = require('../../middleware/auth');
const { limit } = require('../../utils/rate-limit');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => res.json(catchUp.view(req.user.id)));

router.get('/summary', (req, res) => {
  const v = catchUp.view(req.user.id);
  res.json({ available: v.available, phase: v.phase || null, route: v.available && v.phase !== 'not_started' ? catchUp.routeShape(req.user.id) : null, grades: v.grades || [], recommended: v.recommended || null });
});

router.post('/start', limit('es-catchup-start', 30, 60 * 60 * 1000), (req, res) => {
  const out = catchUp.start(req.user.id);
  if (out.error) return res.status(out.status || 400).json({ error: out.error });
  res.json(catchUp.view(req.user.id));
});

router.post('/answer', limit('es-catchup-answer', 600, 60 * 60 * 1000), (req, res) => {
  const body = req.body || {};
  const out = catchUp.answer(req.user.id, { key: String(body.key || ''), qid: String(body.qid || ''), answer: body.answer });
  if (out.error) return res.status(out.status || 400).json({ error: out.error, view: catchUp.view(req.user.id) });
  res.json({ correct: out.correct, view: catchUp.view(req.user.id) });
});

router.post('/next', limit('es-catchup-next', 120, 60 * 60 * 1000), (req, res) => {
  const out = catchUp.nextLevel(req.user.id);
  if (out.error) return res.status(out.status || 400).json({ error: out.error });
  res.json(out);
});

module.exports = router;
