/**
 * The Spanish check: a daily, timed, sealed Spanish test for ONE account (spanish-check/PROTOCOL.md).
 * The test itself (draw, timing, log, scoring) lives in spanish-check/engine.js and scoring.js; this file
 * is only the HTTP layer and the access rule.
 *
 *   GET  /api/spanish-check/status        which sitting is next, or the one that is open
 *   POST /api/spanish-check/start         { force? } draws a sitting from the public drand beacon
 *   GET  /api/spanish-check/next          the one item to answer now (never a later one, never an answer)
 *   POST /api/spanish-check/answer        { n, answer | choice, client_ms, replays, pastes, timed_out }
 *   POST /api/spanish-check/visibility    { state: hidden | visible | blur | focus, client_t }
 *   POST /api/spanish-check/abandon       voids the open sitting
 *   GET  /api/spanish-check/audio/:n      the open listening item's audio (Tatoeba, cached per item)
 *   GET  /api/spanish-check/report        scores, timing and the chart data for every finished sitting
 *
 * Every endpoint answers 404 to anyone but SPANISH_CHECK_USER_ID (anonymous callers included).
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const { requireAuth } = require('../middleware/auth');
const { Engine, HttpError } = require('../spanish-check/engine');

/** The one account that may take this test. Nothing else in the app reads or changes this. */
const SPANISH_CHECK_USER_ID = 6689;

const router = express.Router();
const AUDIO_DIR = path.join(__dirname, '..', 'spanish-check', 'cache', 'audio');
const AUDIO_SOURCES = (a) => [
  `https://tatoeba.org/en/audio/download/${a.audio_id}`,
  `https://audio.tatoeba.org/sentences/spa/${a.sentence_id}.mp3`,
];

let engine = null;
function getEngine() {
  if (!engine) engine = new Engine().init();
  return engine;
}

// 404 (not 401/403) for everyone but the one account, signed in or not, so the endpoints do not advertise themselves.
router.use((req, res, next) => {
  if (!req.user || req.user.id !== SPANISH_CHECK_USER_ID) return res.status(404).json({ error: 'No such endpoint.' });
  next();
});
router.use(requireAuth);

const wrap = (fn) => async (req, res) => {
  try {
    res.json(await fn(req, res));
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, ...err.extra });
    console.error('spanish-check:', err);
    return res.status(500).json({ error: 'Something went wrong on our side.' });
  }
};

/** Make sure one audio file is on disk (one request per item, on demand; never the whole set). */
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
  throw new HttpError(502, `The audio could not be fetched (${lastErr && lastErr.message}).`);
}

router.get('/status', wrap(async () => getEngine().status()));

router.post('/start', wrap(async (req) => {
  const e = getEngine();
  const out = await e.start({ force: req.body && req.body.force === true });
  const a = e.audioInfo(0);
  if (a) { try { await cacheAudio(a); } catch (err) { /* the item is still served; the player will say if the audio is missing */ } }
  return out;
}));

router.get('/next', wrap(async () => {
  const e = getEngine();
  const item = e.next();
  if (!item.done) {
    const up = e.audioInfo(item.n + 1);
    if (up) cacheAudio(up).catch(() => {});
  }
  return item;
}));

router.post('/answer', wrap(async (req) => getEngine().answer(req.body || {})));
router.post('/visibility', wrap(async (req) => getEngine().visibility(req.body || {})));
router.post('/abandon', wrap(async (req) => getEngine().abandon(req.body && req.body.reason)));
router.get('/report', wrap(async () => getEngine().report()));

router.get('/audio/:n', async (req, res) => {
  try {
    const a = getEngine().audioFor(req.params.n);
    const file = await cacheAudio(a);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(file);
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    console.error('spanish-check audio:', err);
    return res.status(500).json({ error: 'Something went wrong on our side.' });
  }
});

module.exports = router;
module.exports.SPANISH_CHECK_USER_ID = SPANISH_CHECK_USER_ID;
