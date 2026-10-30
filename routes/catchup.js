/**
 * /api/catchup/:track/:grade: "Catch me up to grade N" for the subjects with a unit
 * bank (services/catchup-units.js). Signed in only; every call is about the learner's own catch-up.
 *
 *   GET  /subjects          which subjects are ready, and what is missing for the rest
 *   GET  /:track/:grade     the catch-up for the page
 *   POST /:track/:grade/start    begin the check (or return the one running)
 *   POST /:track/:grade/answer   { key, qid, answer }
 *   POST /:track/:grade/next     the next level of the block under way
 * Spanish has its own page: /api/es/catch-up.
 */
const express = require('express');
const catchup = require('../services/catchup-units');
const { requireAuth } = require('../middleware/auth');
const { limit } = require('../utils/rate-limit');

const router = express.Router();
router.use(requireAuth);

router.get('/subjects', (req, res) => res.json({ subjects: catchup.subjectsReport() }));

function target(req, res, next) {
  if (!catchup.TRACKS.includes(req.params.track)) return res.status(404).json({ error: 'Catch-up is not available for this subject yet.' });
  next();
}

router.get('/:track/:grade', target, (req, res) => res.json(catchup.view(req.user.id, req.params.track, req.params.grade)));

router.post('/:track/:grade/start', target, limit('catchup-start', 30, 60 * 60 * 1000), (req, res) => {
  const out = catchup.start(req.user.id, req.params.track, req.params.grade);
  if (out.error) return res.status(out.status || 400).json({ error: out.error });
  res.json(catchup.view(req.user.id, req.params.track, req.params.grade));
});

router.post('/:track/:grade/answer', target, limit('catchup-answer', 600, 60 * 60 * 1000), (req, res) => {
  const b = req.body || {};
  const out = catchup.answer(req.user.id, req.params.track, req.params.grade, { key: String(b.key || ''), qid: String(b.qid || ''), answer: b.answer });
  if (out.error) return res.status(out.status || 400).json({ error: out.error, view: catchup.view(req.user.id, req.params.track, req.params.grade) });
  res.json({ correct: out.correct, view: catchup.view(req.user.id, req.params.track, req.params.grade) });
});

router.post('/:track/:grade/next', target, limit('catchup-next', 120, 60 * 60 * 1000), (req, res) => {
  const out = catchup.nextLevel(req.user.id, req.params.track, req.params.grade);
  if (out.error) return res.status(out.status || 400).json({ error: out.error });
  res.json(out);
});

module.exports = router;
