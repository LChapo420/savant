/**
 * /api/es — the Spanish section's API (test lab + runtime services).
 *
 * The lab routes need no account so the level types can be tried on a local
 * build; in production they only answer when SPANISH_LAB=on. AI and voice calls
 * are rate limited per client and, when a learner is signed in, counted against
 * that learner's daily AI budget like the rest of the app.
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { limit } = require('../../utils/rate-limit');
const lab = require('../../services/spanish/lab');
const voice = require('../../services/spanish/voice');
const acts = require('../../services/spanish/ai-activities');
const ai = require('../../services/ai');

const router = express.Router();
const uploadRetention = require('../../services/upload-retention');
const UPLOAD_DIR = uploadRetention.UPLOAD_DIR;
uploadRetention.schedule(UPLOAD_DIR);

const labOn = () => process.env.NODE_ENV !== 'production' || process.env.SPANISH_LAB === 'on';
const esPath = require('../../services/spanish/path');
// The main Spanish path (services/spanish/path.js) plays its levels through the
// same checking and voice routes as the lab, so those stay open for it when the
// lab itself is switched off: the path API, voice, and any call about a run.
const PATH_ROUTES = /^\/(path\/|status$|tts$|asr$)/;
const forPath = (req) => PATH_ROUTES.test(String(req.path || '')) || esPath.isRunId(String((req.body && req.body.levelId) || ''));
router.use((req, res, next) => (labOn() || forPath(req) ? next() : res.status(404).json({ error: 'No such endpoint.' })));

// Everything that calls a model or a voice service, or keeps a file, needs an
// account. Without one these were open to anyone who could reach the server
// (and the lab is on whenever NODE_ENV is not production): spend on the keys
// with no learner's budget to count it against, and up to 25 MB written to
// disk per request with nobody it belongs to (security review 2026-10-24,
// finding 3). The level data and the deterministic checks stay open.
const SIGNED_IN_ONLY = /^\/(tts|asr|upload|conversation\/|writing\/|recording\/|reaction)/;
router.use((req, res, next) => {
  if (!req.user && SIGNED_IN_ONLY.test(String(req.path || '').toLowerCase())) {
    return res.status(401).json({ error: 'Sign in to continue.' });
  }
  return next();
});

const uid = (req) => (req.user ? req.user.id : null);
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });

router.get('/status', (req, res) => {
  // Voice and recognition as this account gets them: the LLM Gateway list counts too.
  const gateway = voice.gatewayFor(uid(req));
  res.json({ ai: ai.isEnabled(), voice: voice.ttsEnabled() || gateway, asr: voice.asrEnabled() || gateway, levels: lab.LEVELS.length });
});

router.use('/path', require('./path'));

/** Keep the first answer to an item of a main-path run (signed in, own run only). */
function notePath(req, levelId, itemId, correct, extra) {
  if (req.user && esPath.isRunId(levelId)) esPath.recordResult({ runId: levelId, userId: req.user.id, itemId, correct, extra });
}

router.get('/lab/levels', (req, res) => res.json({ levels: lab.list() }));

router.get('/lab/levels/:id', (req, res) => {
  const level = lab.publicLevel(req.params.id);
  if (!level) return bad(res, 'No such level.', 404);
  res.json({ level });
});

// The line to play for an audio item whose answer is the audio itself
// ("Which word do you hear?"): the level data never says which word it is.
router.post('/lab/say', limit('es-check', 600, 60 * 1000), (req, res) => {
  const { levelId, itemId } = req.body || {};
  const text = lab.sayFor(String(levelId || ''), String(itemId || ''));
  if (!text) return bad(res, 'Unknown item.', 404);
  res.json({ text });
});

router.post('/check', limit('es-check', 600, 60 * 1000), (req, res) => {
  const { levelId, itemId, response } = req.body || {};
  const out = lab.check(String(levelId || ''), String(itemId || ''), response);
  if (!out) return bad(res, 'Unknown item.', 404);
  notePath(req, String(levelId || ''), String(itemId || ''), !!out.correct);
  res.json(out);
});

router.post('/dictation/check', limit('es-check', 600, 60 * 1000), (req, res) => {
  const { levelId, lineId, text } = req.body || {};
  const out = lab.dictationCheck(String(levelId || ''), String(lineId || ''), String(text || ''));
  if (!out) return bad(res, 'Unknown line.', 404);
  notePath(req, String(levelId || ''), String(lineId || ''), !!out.correct, { score: out.score });
  res.json(out);
});

// ── voice ─────────────────────────────────────────────────────────────────
router.post('/tts', limit('es-tts', 300, 10 * 60 * 1000), async (req, res) => {
  const { text, voice: v } = req.body || {};
  if (!text || String(text).length > 600) return bad(res, 'Give a line of up to 600 characters.');
  try {
    res.json(await voice.tts(String(text), String(v || 'narrator'), { userId: uid(req) }));
  } catch (err) {
    res.status(503).json({ error: 'Voice unavailable', detail: err.message });
  }
});

const audioBody = express.raw({ type: ['audio/*', 'video/*', 'application/octet-stream'], limit: '25mb', inflate: false });

router.post('/asr', limit('es-asr', 120, 10 * 60 * 1000), audioBody, async (req, res) => {
  if (!Buffer.isBuffer(req.body) || !req.body.length) return bad(res, 'Send the recording as the request body.');
  const kind = String(req.query.kind || 'wav').replace(/[^a-z0-9]/g, '');
  try {
    res.json({ transcript: await voice.asr(req.body, kind, { userId: uid(req) }) });
  } catch (err) {
    res.status(503).json({ error: 'Speech recognition unavailable', detail: err.message });
  }
});

// Project / live-conversation / mission files. Audio is transcribed when the
// format is one MiMo reads; video is kept for playback only. Files are deleted after UPLOAD_RETENTION_DAYS (7).
router.post('/upload', limit('es-upload', 30, 10 * 60 * 1000), audioBody, async (req, res) => {
  if (!Buffer.isBuffer(req.body) || !req.body.length) return bad(res, 'Send the file as the request body.');
  const ext = String(req.query.ext || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin';
  const name = uploadRetention.nameFor(uid(req), ext, crypto.randomBytes(6).toString('hex'));
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(path.join(UPLOAD_DIR, name), req.body);
  let transcript = null; let note = null;
  if (['wav', 'mp3', 'm4a', 'ogg', 'flac'].includes(ext)) {
    try { transcript = await voice.asr(req.body, ext, { userId: uid(req) }); } catch (err) { note = `Could not transcribe: ${err.message}`; }
  } else {
    note = 'Saved. This file type is kept for playback; record audio here for a transcript.';
  }
  res.json({ file: name, bytes: req.body.length, transcript, note });
});

// ── conversation lab ──────────────────────────────────────────────────────
const cleanHistory = (h) => (Array.isArray(h) ? h.slice(-24).map((x) => ({ who: x.who === 'learner' ? 'learner' : 'partner', text: String(x.text || '').slice(0, 400) })) : []);

router.post('/conversation/turn', limit('es-ai', 200, 10 * 60 * 1000), async (req, res) => {
  const { levelId, part, history, text } = req.body || {};
  const level = lab.scenarioFor(String(levelId || ''), part);
  if (!level) return bad(res, 'No such conversation.', 404);
  const said = String(text || '').trim().slice(0, 400);
  if (!said) return bad(res, 'Say or type something first.');
  res.json(await acts.conversationTurn(level, cleanHistory(history), said, uid(req)));
});

router.post('/conversation/end', limit('es-ai', 200, 10 * 60 * 1000), async (req, res) => {
  const { levelId, part, history, goalsMet } = req.body || {};
  const level = lab.scenarioFor(String(levelId || ''), part);
  if (!level) return bad(res, 'No such conversation.', 404);
  const goals = Array.isArray(goalsMet) ? goalsMet.map(String) : [];
  const rubric = await acts.conversationRubric(level, cleanHistory(history), goals, uid(req));
  // A main-path conversation counts by the share of the role-play's goals reached.
  const known = new Set(level.scenario.goals.map((g) => g.id));
  const reached = goals.filter((g) => known.has(g)).length;
  notePath(req, String(levelId || ''), '__convo', reached >= level.scenario.goals.length / 2, { ratio: level.scenario.goals.length ? reached / level.scenario.goals.length : 0, overall: rubric.overall });
  res.json(rubric);
});

// ── writing ───────────────────────────────────────────────────────────────
router.post('/writing/feedback', limit('es-ai', 200, 10 * 60 * 1000), async (req, res) => {
  const { levelId, taskId, draft } = req.body || {};
  const found = lab.writingFor(String(levelId || ''), taskId);
  if (!found) return bad(res, 'No such writing task.', 404);
  res.json(await acts.writingFeedback({ ...found.level, writing: found.writing }, String(draft || '').slice(0, 4000), uid(req)));
});

router.post('/writing/score', limit('es-ai', 200, 10 * 60 * 1000), async (req, res) => {
  const { levelId, taskId, text } = req.body || {};
  const found = lab.writingFor(String(levelId || ''), taskId);
  if (!found) return bad(res, 'No such writing task.', 404);
  const rubric = await acts.writingRubric({ ...found.level, writing: found.writing }, String(text || '').slice(0, 4000), uid(req));
  res.json({ rubric, model: found.writing.model, words: acts.wordCount(text) });
});

// ── recordings ────────────────────────────────────────────────────────────
router.post('/recording/score', limit('es-ai', 200, 10 * 60 * 1000), async (req, res) => {
  const { levelId, taskId, transcript, durationMs, pauseMs } = req.body || {};
  const found = lab.recordingFor(String(levelId || ''), taskId);
  if (!found) return bad(res, 'No such recording task.', 404);
  res.json(await acts.recordingRubric(found.level, {
    transcript: String(transcript || '').slice(0, 6000),
    durationMs: Number(durationMs) || 0,
    pauseMs: Number(pauseMs) || 0,
    brief: found.record.brief,
    mustSay: found.record.mustSay,
  }, uid(req)));
});

router.post('/reaction', limit('es-ai', 200, 10 * 60 * 1000), async (req, res) => {
  const { levelId, title, text } = req.body || {};
  const level = lab.getLevel(String(levelId || ''));
  if (!level) return bad(res, 'No such level.', 404);
  res.json(await acts.reaction({ ...level, reader: { title } }, String(text || '').slice(0, 400), uid(req)));
});

module.exports = router;
