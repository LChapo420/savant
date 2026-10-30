/**
 * The persistent tutor outside a question (services/tutor.js).
 *
 *   POST   /api/tutor/chat      a turn of the home/subject chat: { messages, where }
 *   GET    /api/tutor/memory    what the tutor knows and remembers, as the learner can read it
 *   GET    /api/tutor/facts     the durable facts the tutor keeps, each with what it is and when it was last confirmed
 *   DELETE /api/tutor/facts/:id one fact;  DELETE /api/tutor/facts  all of them
 *   DELETE /api/tutor/memory    forget the earlier conversations (the pack is rebuilt from the
 *                               learner's own records, so it is not deleted here)
 *
 * Inside a question the tutor is the existing coach and help chat, which now carry the
 * same context and memory (services/ai.js coachSystemFor, services/assist.js).
 */
const express = require('express');
const tutor = require('../services/tutor');
const dock = require('../services/tutor-context');
const facts = require('../services/tutor-facts');
const tutorMode = require('../services/tutor-mode');
const { requireAuth } = require('../middleware/auth');
const { limit } = require('../utils/rate-limit');

const voice = require('../services/spanish/voice');

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
  res.json({ mode, input_mode: tutorMode.get(req.user.id), speech_lang: /^\/spanish/.test(dock.cleanPath(req.query.path)) ? 'es' : 'en', stt: voice.gatewayFor(req.user.id) });
});

// The learner flips the toggle: remembered right away, so the next page opens in the same mode.
router.put('/tutor/dock/mode', requireAuth, (req, res) => {
  const m = tutorMode.valid(req.body && req.body.mode);
  if (!m) return res.status(400).json({ error: 'Mode must be voice or text.' });
  res.json({ input_mode: tutorMode.set(req.user.id, m) });
});

router.post('/tutor/dock', requireAuth, limit('tutor', 150, 60 * 60 * 1000), async (req, res) => {
  const body = req.body || {};
  if (dock.modeFor(body.page && body.page.path) === 'off') return res.status(403).json({ error: 'The tutor is off on this page.' });
  try {
    res.json(await dock.reply({ user: req.user, messages: body.messages, page: body.page, inputMode: body.input_mode, image: body.image }));
  } catch (err) {
    console.warn(`tutor dock: ${err.message}`);
    res.json({ reply: tutor.offlineReply(req.user.id), source: 'fallback', mode: dock.modeFor(body.page && body.page.path) });
  }
});

// Better voice for a reply. Any failure is a 503 with no audio: the dock then uses the browser voice (the free default).
router.post('/tutor/speak', requireAuth, limit('tutor-speak', 60, 60 * 60 * 1000), async (req, res) => {
  const body = req.body || {};
  try {
    const mp3 = await voice.tutorSpeak(body.text, { userId: req.user.id, lang: body.lang === 'es' ? 'es' : 'en' });
    res.set('Content-Type', 'audio/mpeg').set('Cache-Control', 'private, no-store').send(mp3);
  } catch (err) {
    res.status(err.status === 400 ? 400 : 503).json({ error: 'Browser voice.' });
  }
});

// Better listening for push-to-talk: the recording is the raw request body (at most 1 MB, about a minute), transcribed and dropped.
// Any failure is a 503 with no text: the dock then uses the browser recognizer (the free default).
const audioBody = express.raw({ type: () => true, limit: 1024 * 1024 });
router.post('/tutor/transcribe', requireAuth, limit('tutor-transcribe', 60, 60 * 60 * 1000), audioBody, async (req, res) => {
  try {
    const text = await voice.tutorTranscribe(Buffer.isBuffer(req.body) ? req.body : null, { userId: req.user.id, lang: req.query.lang === 'es' ? 'es' : 'en' });
    if (!text) return res.status(503).json({ error: 'Browser listening.' });
    res.set('Cache-Control', 'private, no-store').json({ text: text.slice(0, 1000) });
  } catch (err) {
    res.status(err.status === 400 ? 400 : 503).json({ error: 'Browser listening.' });
  }
});

router.get('/tutor/memory', requireAuth, (req, res) => {
  const memory = tutor.view(req.user.id);
  res.json({ know: tutor.pack(req.user.id), summary: memory.summary, recent: memory.turns.slice(-6), turn_count: memory.turn_count });
});

// The durable facts, one by one: the learner reads each and deletes any.
router.get('/tutor/facts', requireAuth, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ facts: facts.view(req.user.id) });
});

router.delete('/tutor/facts', requireAuth, (req, res) => {
  res.json({ ok: true, removed: facts.forgetAll(req.user.id) });
});

router.delete('/tutor/facts/:id', requireAuth, (req, res) => {
  if (!facts.remove(req.user.id, String(req.params.id))) return res.status(404).json({ error: 'No such fact.' });
  res.json({ ok: true });
});

router.delete('/tutor/memory', requireAuth, (req, res) => {
  tutor.forget(req.user.id);
  res.json({ ok: true });
});

module.exports = router;
