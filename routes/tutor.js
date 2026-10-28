/**
 * The persistent tutor outside a question (services/tutor.js).
 *
 *   POST   /api/tutor/chat      a turn of the home/subject chat: { messages, where }
 *   GET    /api/tutor/memory    what the tutor knows and remembers, as the learner can read it
 *   DELETE /api/tutor/memory    forget the earlier conversations (the pack is rebuilt from the
 *                               learner's own records, so it is not deleted here)
 *
 * Inside a question the tutor is the existing coach and help chat, which now carry the
 * same context and memory (services/ai.js coachSystemFor, services/assist.js).
 */
const express = require('express');
const tutor = require('../services/tutor');
const dock = require('../services/tutor-context');
const { requireAuth } = require('../middleware/auth');
const { limit } = require('../utils/rate-limit');

const router = express.Router();

router.post('/tutor/chat', requireAuth, limit('tutor', 150, 60 * 60 * 1000), async (req, res) => {
  const where = ['home', 'subject'].includes(req.body && req.body.where) ? req.body.where : 'home';
  try {
    res.json(await tutor.chat({ user: req.user, messages: req.body && req.body.messages, where }));
  } catch (err) {
    console.warn(`tutor: ${err.message}`);
    res.json({ reply: tutor.offlineReply(req.user.id), source: 'fallback' });
  }
});

// The dock on every page. The mode (full / method-only / off) comes from the page path, decided here.
router.get('/tutor/dock', requireAuth, (req, res) => {
  const mode = dock.modeFor(req.query.path);
  res.json({ mode, speech_lang: /^\/spanish/.test(dock.cleanPath(req.query.path)) ? 'es' : 'en' });
});

router.post('/tutor/dock', requireAuth, limit('tutor', 150, 60 * 60 * 1000), async (req, res) => {
  const body = req.body || {};
  if (dock.modeFor(body.page && body.page.path) === 'off') return res.status(403).json({ error: 'The tutor is off on this page.' });
  try {
    res.json(await dock.reply({ user: req.user, messages: body.messages, page: body.page }));
  } catch (err) {
    console.warn(`tutor dock: ${err.message}`);
    res.json({ reply: tutor.offlineReply(req.user.id), source: 'fallback', mode: dock.modeFor(body.page && body.page.path) });
  }
});

router.get('/tutor/memory', requireAuth, (req, res) => {
  const memory = tutor.view(req.user.id);
  res.json({ know: tutor.pack(req.user.id), summary: memory.summary, recent: memory.turns.slice(-6), turn_count: memory.turn_count });
});

router.delete('/tutor/memory', requireAuth, (req, res) => {
  tutor.forget(req.user.id);
  res.json({ ok: true });
});

module.exports = router;
