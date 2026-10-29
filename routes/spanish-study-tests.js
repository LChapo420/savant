/**
 * Sealed pre and post tests for study participants (services/spanish-study-tests.js, spanish-study-tests/).
 * Separate from the founder's spanish-check; only signed-in people who joined the study can use it.
 *
 *   GET  /api/spanish-study-test/status       which test is next today, or the one that is open
 *   POST /api/spanish-study-test/start        draws the sitting from the public drand beacon
 *   GET  /api/spanish-study-test/next         the one item to answer now
 *   POST /api/spanish-study-test/answer       { n, answer | choice, client_ms, replays, pastes, timed_out }
 *   POST /api/spanish-study-test/visibility   { state, client_t }
 *   POST /api/spanish-study-test/abandon
 *   GET  /api/spanish-study-test/audio/:n     the open listening item's audio (Tatoeba, cached per item)
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const { requireAuth } = require('../middleware/auth');
const tests = require('../services/spanish-study-tests');

const router = express.Router();
const AUDIO_DIR = path.join(__dirname, '..', 'spanish-check', 'cache', 'audio');
const AUDIO_SOURCES = (a) => [
  `https://tatoeba.org/en/audio/download/${a.audio_id}`,
  `https://audio.tatoeba.org/sentences/spa/${a.sentence_id}.mp3`,
];

router.use(requireAuth);

const wrap = (fn) => async (req, res) => {
  try {
    res.json(await fn(req));
  } catch (err) {
    if (err instanceof tests.HttpError) return res.status(err.status).json({ error: err.message, ...err.extra });
    console.error('spanish-study-test:', err);
    return res.status(500).json({ error: 'Something went wrong on our side.' });
  }
};

async function cacheAudio(a) {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
  const file = path.join(AUDIO_DIR, `${a.audio_id}.mp3`);
  if (fs.existsSync(file)) return file;
  let lastErr = null;
  for (const url of AUDIO_SOURCES(a)) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 15000);
      const r = await fetch(url, { signal: ctl.signal, redirect: 'follow' });
      clearTimeout(timer);
      if (!r.ok || !/audio|octet/i.test(r.headers.get('content-type') || '')) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 500) throw new Error('audio too small');
      fs.writeFileSync(`${file}.part`, buf);
      fs.renameSync(`${file}.part`, file);
      return file;
    } catch (e) { lastErr = e; }
  }
  throw new tests.HttpError(502, `The audio could not be fetched (${lastErr && lastErr.message}).`);
}

router.get('/status', wrap((req) => tests.status(req.user.id)));

router.post('/start', wrap(async (req) => {
  const out = await tests.start(req.user.id);
  const a = tests.audioInfo(req.user.id, 0);
  if (a) { try { await cacheAudio(a); } catch (err) { /* the item is still served; the player says if audio is missing */ } }
  return out;
}));

router.get('/next', wrap((req) => {
  const item = tests.next(req.user.id);
  if (!item.done) {
    const up = tests.audioInfo(req.user.id, item.n + 1);
    if (up) cacheAudio(up).catch(() => {});
  }
  return item;
}));

router.post('/answer', wrap((req) => tests.answer(req.user.id, req.body)));
router.post('/visibility', wrap((req) => tests.visibility(req.user.id, req.body)));
router.post('/abandon', wrap((req) => tests.abandon(req.user.id, req.body && req.body.reason)));

router.get('/audio/:n', requireAuth, async (req, res) => {
  try {
    const file = await cacheAudio(tests.audioFor(req.user.id, req.params.n));
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(file);
  } catch (err) {
    if (err instanceof tests.HttpError) return res.status(err.status).json({ error: err.message });
    console.error('spanish-study-test audio:', err);
    return res.status(500).json({ error: 'Something went wrong on our side.' });
  }
});

module.exports = router;
