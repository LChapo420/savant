/**
 * Voice for the Spanish section.
 *
 * Speaking (TTS): Google Gemini TTS. Tested 2026-10-13 against MiMo: MiMo's
 * preset voices and its voice-design model read Spanish with an English or
 * Chinese accent that its own recogniser could not understand, while Gemini's
 * voices came back word-perfect. Gemini returns 24 kHz 16-bit PCM, which is
 * wrapped as WAV and cached on disk by a hash of (model, voice, line), so each
 * line is paid for once and then served as a static file to everyone.
 *
 * Listening (ASR): MiMo `mimo-v2.5-asr` through its chat-completions endpoint,
 * which transcribed native-quality Spanish exactly. It reads wav/mp3/flac/m4a/
 * ogg (not webm), so the browser records WAV (public/spanish/js/core/recorder.js).
 *
 * When Gemini is out of quota the route answers 503 straight away (for a short
 * cool-down) and the browser speaks the line with its own Spanish voice.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';
const TTS_MODELS = (process.env.SPANISH_TTS_MODELS || 'gemini-2.5-flash-preview-tts,gemini-3.8-flash-tts').split(',').map((s) => s.trim()).filter(Boolean);
const MIMO_URL = (process.env.MIMO_BASE_URL || 'https://api.xiaomimimo.com/v1').replace(/\/$/, '');
const ASR_MODEL = process.env.MIMO_ASR_MODEL || 'mimo-v2.5-asr';
const MEDIA_DIR = process.env.SPANISH_MEDIA_DIR || path.join(__dirname, '..', '..', 'data', 'spanish-media');
const VOICES = require('../../config/spanish/voices.json');
const gatewayLedger = require('../llmgateway-ledger');

// ── LLM Gateway: ElevenLabs eleven-v3 speech, and speech-to-text ─────────────────
// Owner's decision (2026-10-27): a Spanish-accented voice, generated just in time
// for the line being played, cached by voice + text, for the accounts listed in
// data/spanish-gateway-users.json (or SPANISH_GATEWAY_USERS, comma separated) only.
// Everyone else keeps Gemini and MiMo exactly as before.
const GATEWAY_BASE = () => String(process.env.LLMGATEWAY_BASE_URL || 'https://api.llmgateway.io/v1').replace(/\/$/, '');
const gatewayKey = () => String(process.env.LLMGATEWAY_API_KEY || '').trim();
const GATEWAY_TTS_MODEL = () => process.env.SPANISH_GATEWAY_TTS_MODEL || 'eleven-v3';
const GATEWAY_STT_MODEL = () => process.env.SPANISH_GATEWAY_STT_MODEL || 'grok-stt-1-0';
const GATEWAY_USERS_FILE = () => path.join(process.env.HOLDOUT_DIR || path.join(__dirname, '..', '..', 'data'), 'spanish-gateway-users.json');
/** ElevenLabs voice names; one is always sent, and the language is always "es", so it never reads Spanish in an English voice. */
const ELEVEN_VOICES = new Set(['Sarah', 'Aria', 'Roger', 'Laura', 'Charlie', 'George', 'Callum', 'River', 'Liam', 'Charlotte', 'Alice', 'Matilda', 'Will', 'Jessica', 'Eric', 'Chris', 'Brian', 'Daniel', 'Lily', 'Bill']);

function gatewayUsers() {
  const ids = new Set(String(process.env.SPANISH_GATEWAY_USERS || '').split(',').map((s) => s.trim()).filter(Boolean));
  try { for (const id of JSON.parse(fs.readFileSync(GATEWAY_USERS_FILE(), 'utf8'))) ids.add(String(id)); } catch (e) { /* no file: nobody */ }
  return ids;
}
/** Is the gateway voice on for this account? */
const gatewayFor = (userId) => !!gatewayKey() && userId != null && gatewayUsers().has(String(userId));

const ttsEnabled = () => !!process.env.GEMINI_API_KEY;
const asrEnabled = () => !!process.env.MIMO_API_KEY;
function isEnabled() { return ttsEnabled(); }

let coolUntil = 0; // after a quota error, stop asking for a while

async function fetchJson(url, opts, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = (json && json.error && (json.error.message || json.error.status)) || res.statusText;
      const err = new Error(`${res.status}: ${String(msg).slice(0, 160)}`);
      err.status = res.status;
      throw err;
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

function wavFromPcm(pcm, rate) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

async function geminiSpeak(model, voiceName, line) {
  const json = await fetchJson(`${GEMINI}/models/${model}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: line }] }],
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } } },
    }),
  }, 30000);
  const part = json && json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts && json.candidates[0].content.parts[0] && json.candidates[0].content.parts[0].inlineData;
  if (!part || !part.data) throw new Error('no audio in the response');
  const rate = Number((String(part.mimeType || '').match(/rate=(\d+)/) || [])[1] || 24000);
  return wavFromPcm(Buffer.from(part.data, 'base64'), rate);
}

const inflight = new Map();

// A refused key, a quota or a spending stop is not retried in a loop: the gateway is left alone for ten minutes.
let gatewayCoolUntil = 0;
// A ceiling on what one day can spend, per process (SPANISH_GATEWAY_DAILY_CHARS).
const spent = { day: '', chars: 0 };

async function gatewayFetch(pathname, init, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${GATEWAY_BASE()}${pathname}`, { ...init, signal: ctrl.signal, headers: { Authorization: `Bearer ${gatewayKey()}`, ...(init.headers || {}) } });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      let msg = body; try { const j = JSON.parse(body); msg = (j.error && (j.error.message || j.error)) || j.message || body; } catch (e) { /* plain text */ }
      throw Object.assign(new Error(`${res.status}: ${String(msg).slice(0, 160)}`), { status: res.status });
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}

function noteGatewayFailure(err) {
  if ([401, 402, 403, 429].includes(err.status)) gatewayCoolUntil = Date.now() + 10 * 60 * 1000;
}

/**
 * Every gateway call reserves its worst-case cost in the $5 total ledger first (services/llmgateway-ledger.js)
 * and is refused past the cap: the caller throws, the route answers 503 and the browser speaks with its own voice.
 * An HTTP error the gateway answered is not billed; a network failure or timeout is counted at the reservation.
 */
async function billed(call, fn) {
  const id = gatewayLedger.reserve(call);
  let settled = false;
  try {
    const out = await fn();
    gatewayLedger.settle(id, { outcome: 'ok' });
    settled = true;
    return out;
  } catch (err) {
    if (!settled) gatewayLedger.settle(id, { outcome: err && err.status ? 'not_billed' : 'unknown' });
    throw err;
  }
}

async function gatewaySpeak(voice, line, lang = 'es') {
  const model = GATEWAY_TTS_MODEL();
  return billed({ kind: 'tts', model, chars: line.length }, async () => {
    const res = await gatewayFetch('/audio/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: line, voice, language: lang }),
    }, 45000);
    const type = String(res.headers.get('content-type') || '');
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || (type && !/audio|octet-stream/i.test(type))) throw new Error('no audio in the response');
    return buf;
  });
}

/** The cached clip, or one new call. Returns { url, cached }. */
async function ttsGateway(line, voiceId) {
  const wanted = (VOICES[voiceId] || VOICES.narrator).eleven;
  const voice = ELEVEN_VOICES.has(wanted) ? wanted : 'Aria';
  const hash = crypto.createHash('sha256').update(`gateway|${GATEWAY_TTS_MODEL()}|${voice}|es|${line}`).digest('hex').slice(0, 32);
  const file = path.join(MEDIA_DIR, `${hash}.mp3`);
  const url = `/spanish-media/${hash}.mp3`;
  if (fs.existsSync(file)) return { url, cached: true };
  if (Date.now() < gatewayCoolUntil) throw Object.assign(new Error('gateway voice cooling down'), { status: 429 });
  const day = new Date().toISOString().slice(0, 10);
  if (spent.day !== day) { spent.day = day; spent.chars = 0; }
  const cap = Number(process.env.SPANISH_GATEWAY_DAILY_CHARS || 20000);
  if (spent.chars + line.length > cap) throw Object.assign(new Error('daily voice budget used'), { status: 429 });
  if (inflight.has(hash)) return inflight.get(hash);
  const job = (async () => {
    try {
      const mp3 = await gatewaySpeak(voice, line);
      spent.chars += line.length;
      fs.mkdirSync(MEDIA_DIR, { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, mp3);
      fs.renameSync(tmp, file);
      return { url, cached: false };
    } catch (err) { noteGatewayFailure(err); throw err; }
  })();
  inflight.set(hash, job);
  try { return await job; } finally { inflight.delete(hash); }
}

/**
 * Speak one line. Returns { url, cached } or throws (the browser then uses its
 * own Spanish voice).
 * @param {string} text
 * @param {string} [voiceId] a key of config/spanish/voices.json
 * @param {{userId?: number}} [opts] an account on the gateway list gets ElevenLabs; if that fails it throws, and the browser voice takes over
 */
async function tts(text, voiceId = 'narrator', opts = {}) {
  const line = String(text || '').trim().slice(0, 600);
  if (!line) throw new Error('nothing to say');
  if (gatewayFor(opts.userId)) return ttsGateway(line, voiceId);
  const voice = (VOICES[voiceId] || VOICES.narrator).gemini;
  const hash = crypto.createHash('sha256').update(`gemini|${voice}|${line}`).digest('hex').slice(0, 32);
  const file = path.join(MEDIA_DIR, `${hash}.wav`);
  const url = `/spanish-media/${hash}.wav`;
  if (fs.existsSync(file)) return { url, cached: true };
  if (!ttsEnabled()) throw new Error('voice is not configured');
  if (Date.now() < coolUntil) throw Object.assign(new Error('voice quota cooling down'), { status: 429 });
  if (inflight.has(hash)) return inflight.get(hash);

  const job = (async () => {
    let lastErr = null;
    for (const model of TTS_MODELS) {
      try {
        const wav = await geminiSpeak(model, voice, line);
        fs.mkdirSync(MEDIA_DIR, { recursive: true });
        const tmp = `${file}.${process.pid}.tmp`;
        fs.writeFileSync(tmp, wav);
        fs.renameSync(tmp, file);
        return { url, cached: false };
      } catch (err) {
        lastErr = err;
        if (err.status !== 429 && err.status !== 404 && err.status !== 400) break;
      }
    }
    if (lastErr && lastErr.status === 429) coolUntil = Date.now() + 60 * 1000;
    throw lastErr || new Error('no voice');
  })();
  inflight.set(hash, job);
  try { return await job; } finally { inflight.delete(hash); }
}

const MIME = { wav: 'audio/wav', mp3: 'audio/mpeg', ogg: 'audio/ogg', m4a: 'audio/mp4', flac: 'audio/flac' };

/**
 * Transcribe a recording with MiMo ASR. Returns the transcript text.
 * @param {Buffer} buf
 * @param {string} [kind] wav | mp3 | ogg | m4a | flac
 */
async function asrGateway(buf, kind) {
  if (Date.now() < gatewayCoolUntil) throw Object.assign(new Error('gateway speech cooling down'), { status: 429 });
  const model = GATEWAY_STT_MODEL();
  const form = new FormData();
  form.append('file', new Blob([buf], { type: MIME[kind] || MIME.wav }), `speech.${kind}`);
  form.append('model', model);
  form.append('language', 'es');
  try {
    return await billed({ kind: 'stt', model, bytes: buf.length }, async () => {
      const res = await gatewayFetch('/audio/transcriptions', { method: 'POST', body: form }, 45000);
      const json = await res.json();
      return String((json && (json.text != null ? json.text : json.transcript)) || '').trim();
    });
  } catch (err) { noteGatewayFailure(err); throw err; }
}

async function asr(buf, kind = 'wav', opts = {}) {
  if (!buf || !buf.length) throw new Error('empty recording');
  // An account on the gateway list is transcribed there; MiMo (below) is the fallback for them and the only path for everyone else.
  if (gatewayFor(opts.userId)) {
    try { return await asrGateway(buf, kind); } catch (err) { if (!asrEnabled()) throw err; }
  }
  if (!asrEnabled()) throw new Error('speech recognition is not configured');
  const mime = MIME[kind] || MIME.wav;
  const json = await fetchJson(`${MIMO_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': process.env.MIMO_API_KEY, Authorization: `Bearer ${process.env.MIMO_API_KEY}` },
    body: JSON.stringify({
      model: ASR_MODEL,
      messages: [{ role: 'user', content: [{ type: 'input_audio', input_audio: { data: `data:${mime};base64,${buf.toString('base64')}` } }] }],
    }),
  }, 45000);
  const content = json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
  const textOut = Array.isArray(content) ? content.map((c) => c.text || '').join(' ') : String(content || '');
  return textOut.trim();
}

// ── The tutor's voice (services/tutor.js dock): the same gateway, ledger and opt-in list ──
// Replies are personal, so nothing is cached on disk: the audio goes straight back to the one learner.
const TUTOR_DAILY_CHARS = () => Number(process.env.TUTOR_GATEWAY_DAILY_CHARS || 3000);
const tutorSpent = new Map(); // `${day}:${userId}` -> characters
/**
 * Speak a tutor reply with the gateway voice. Returns an mp3 Buffer, or throws (status 503 when this
 * account is not on the gateway list or the gateway is cooling down, 429 past the learner's daily
 * characters, 402 past the $5 ledger) and the page speaks with the browser's own voice instead.
 */
async function tutorSpeak(text, { userId, lang = 'en' } = {}) {
  const line = String(text || '').trim().slice(0, 600);
  if (!line) throw Object.assign(new Error('nothing to say'), { status: 400 });
  if (!gatewayFor(userId)) throw Object.assign(new Error('gateway voice is not on for this account'), { status: 503 });
  if (Date.now() < gatewayCoolUntil) throw Object.assign(new Error('gateway voice cooling down'), { status: 503 });
  const key = `${new Date().toISOString().slice(0, 10)}:${userId}`;
  for (const k of tutorSpent.keys()) if (!k.startsWith(key.slice(0, 11))) tutorSpent.delete(k);
  const used = tutorSpent.get(key) || 0;
  if (used + line.length > TUTOR_DAILY_CHARS()) throw Object.assign(new Error('daily tutor voice used'), { status: 429 });
  tutorSpent.set(key, used + line.length);
  try {
    return await gatewaySpeak(lang === 'es' ? ((VOICES.narrator || {}).eleven || 'Aria') : 'Aria', line, lang === 'es' ? 'es' : 'en');
  } catch (err) {
    tutorSpent.set(key, used);
    noteGatewayFailure(err);
    if (err.code === 'LEDGER_STOP') err.status = 402;
    throw err;
  }
}

module.exports = { tutorSpeak, tts, asr, isEnabled, ttsEnabled, asrEnabled, gatewayFor, VOICES, MEDIA_DIR };
