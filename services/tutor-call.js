/**
 * The tutor's voice call: who may have one, what one may cost, and the only door to paid speech for it (owner, 7 Nov 2026).
 *
 *   public/js/tutor-call.js runs the call in the browser. routes/tutor.js exposes this file as /api/tutor/call/*.
 *
 * Who may call (info):
 *   - the microphone: routes/consent.js access().camera_mic. A child before a parent agrees, or with "camera and microphone off", gets no call and no mic at all.
 *   - outside AI: access().ai_free_text. A call hands the learner's words to a speech service or the browser's recognizer and to the tutor's models, so without the
 *     parent's opt-in there is no call. Those learners keep the chat, as today.
 *   - paid speech (the LLM Gateway voice and listening): only accounts on the gateway list (services/spanish/voice.js gatewayFor), and only when both of the above hold.
 *     Everyone else who may call uses the browser's own speech, which costs nothing.
 *
 * What it costs, paid speech only (prices in services/llmgateway-ledger.js, x1.15 margin, 7 Nov 2026):
 *   the tutor talking: eleven-v3, $0.11 per 1K characters. About 14 characters a second is about $0.106 per minute of the tutor talking.
 *   the learner talking: grok-stt-1-0, $0.10 per hour, $0.0019 per minute. Only speech is sent; silence is never uploaded.
 *   Every call still goes through the $5 total ledger first and shows in the cost tracker on the learner's account. The tutor's model calls cost what chat costs.
 *
 * The limits (env can lower them, the caps are in LIMITS):
 *   one call: 10 minutes. One learner, one day (UTC): 30 minutes of calls, $0.50 of paid speech (about 4.5 minutes of the tutor talking), then the call carries on with
 *   the browser's voice if there is one. A call quiet for 20 s gets a warning and ends at 35 s. Silence costs nothing either way, but an open microphone should not stay open.
 *   One open call per learner: a new one closes the old one. The server checks all of this on every /hear and /say, so a page that keeps going is refused.
 *
 * What it says: /say speaks only words the tutor's own route just returned (safety and fact check done) or the fixed notices below. It cannot be used as a free speech engine.
 * What it keeps: seconds, dollars and delays (tutor_call_usage, tutor_call_log). Never the audio; the words go where a typed message's words go, through the same route.
 */
const crypto = require('crypto');
const db = require('../config/db');
const voice = require('./spanish/voice');
const ledger = require('./llmgateway-ledger');

const LIMITS = { call_s: 600, day_s: 1800, day_usd: 0.5, silence_warn_s: 20, silence_end_s: 35, clip_s: 45 };
function envLow(name, cap) {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 0 ? Math.min(v, cap) : cap;
}
const limits = () => ({
  call_s: envLow('TUTOR_CALL_MAX_S', LIMITS.call_s),
  day_s: envLow('TUTOR_CALL_DAY_S', LIMITS.day_s),
  day_usd: envLow('TUTOR_CALL_DAY_USD', LIMITS.day_usd),
  silence_warn_s: envLow('TUTOR_CALL_SILENCE_WARN_S', LIMITS.silence_warn_s),
  silence_end_s: envLow('TUTOR_CALL_SILENCE_END_S', LIMITS.silence_end_s),
  clip_s: LIMITS.clip_s,
});

/** The fixed things a call may say besides the tutor's replies. */
const NOTICES = {
  still_there: 'Still there? I will hang up soon if it stays quiet.',
  ending_quiet: 'It has gone quiet, so I will hang up. Hold me any time to talk again.',
  ending_limit: 'That is the limit for this call. You can keep going in the chat.',
  no_reply: 'Sorry, that did not go through. Say it again?',
};

const today = () => new Date().toISOString().slice(0, 10);

function access(user) {
  // eslint-disable-next-line global-require
  try { return require('../routes/consent').access(user) || {}; } catch { return {}; }
}

/** What the browser is told. `why` is plain words for the learner, shown when a call cannot start. */
function info(user) {
  const a = access(user);
  const mic = !!a.camera_mic;
  const outside = !!a.ai_free_text;
  let why = null;
  if (!mic) why = a.state === 'active' ? 'A parent or guardian has the microphone switched off, so voice is off. You can type here instead.' : (a.state === 'pending' ? 'Voice stays off until a parent or guardian agrees. You can type here instead.' : 'Voice is not available on this account yet. You can type here instead.');
  else if (!outside) why = 'Voice needs a parent or guardian to allow outside AI, and that is off. You can type here instead.';
  const allowed = mic && outside;
  const paid = allowed && voice.gatewayFor(user.id);
  const lim = limits();
  return { allowed, mic, why, speech: paid ? 'gateway' : 'browser', silence_warn_s: lim.silence_warn_s, silence_end_s: lim.silence_end_s, clip_s: lim.clip_s, notices: NOTICES };
}

// ── Usage: one row per learner per day, so a restart cannot reset a limit ──
function usage(userId, day = today()) {
  return db.findOne('tutor_call_usage', (r) => r.user_id === userId && r.day === day) || { user_id: userId, day, seconds: 0, usd: 0, chars: 0, stt_seconds: 0, calls: 0 };
}
function addUsage(userId, delta) {
  const day = today();
  db.upsert('tutor_call_usage', (r) => r.user_id === userId && r.day === day, (row) => {
    const u = row || { user_id: userId, day, seconds: 0, usd: 0, chars: 0, stt_seconds: 0, calls: 0 };
    return {
      user_id: userId, day,
      seconds: Math.round((u.seconds + (delta.seconds || 0)) * 10) / 10,
      usd: Number((u.usd + (delta.usd || 0)).toFixed(6)),
      chars: u.chars + (delta.chars || 0),
      stt_seconds: Math.round((u.stt_seconds + (delta.stt_seconds || 0)) * 10) / 10,
      calls: u.calls + (delta.calls || 0),
    };
  });
}

// ── Open calls ─────────────────────────────────────────────────────────────
const open = new Map(); // userId -> { id, started, lastHeard }

function close(userId, reason, metrics) {
  const c = open.get(userId);
  if (!c) return null;
  open.delete(userId);
  const lim = limits();
  // A page that vanished without saying goodbye is charged to its last sign of life plus the quiet limit, not to whenever the next call starts.
  const end = reason === 'abandoned' ? Math.min(Date.now(), c.lastSeen + lim.silence_end_s * 1000) : Date.now();
  const seconds = Math.min(lim.call_s, Math.max(0, (end - c.started) / 1000));
  addUsage(userId, { seconds });
  const turns = Array.isArray(metrics && metrics.turns) ? metrics.turns.slice(0, 200).map(cleanTurn).filter(Boolean) : [];
  db.insert('tutor_call_log', { user_id: userId, call_id: c.id, started_at: new Date(c.started).toISOString(), seconds: Math.round(seconds), reason: String(reason || '').slice(0, 24), listen: metrics && metrics.listen === 'gateway' ? 'gateway' : 'browser', speak: metrics && metrics.speak === 'gateway' ? 'gateway' : 'browser', turns });
  return { seconds };
}

/** Only numbers, milliseconds, with a sane ceiling: never words. */
function cleanTurn(t) {
  if (!t || typeof t !== 'object') return null;
  const out = {};
  for (const k of ['detect_ms', 'stt_ms', 'reply_ms', 'audio_ms', 'total_ms']) {
    const v = Number(t[k]);
    if (Number.isFinite(v) && v >= 0) out[k] = Math.min(600000, Math.round(v));
  }
  return Object.keys(out).length ? out : null;
}

function refuse(status, why, extra) { return Object.assign(new Error(why), { status, why, ...extra }); }

/** Start a call, or refuse in plain words. One open call per learner. */
function start(user) {
  const i = info(user);
  if (!i.allowed) throw refuse(403, i.why);
  if (open.has(user.id)) close(user.id, 'abandoned');
  const lim = limits();
  const used = usage(user.id);
  const left = lim.day_s - used.seconds;
  if (left < 15) throw refuse(429, 'You have used today\'s voice time. You can keep going in the chat.');
  const id = crypto.randomBytes(9).toString('base64url');
  open.set(user.id, { id, started: Date.now(), lastSeen: Date.now() });
  addUsage(user.id, { calls: 1 });
  return { call_id: id, ...i, max_s: Math.floor(Math.min(lim.call_s, left)), speech_usd_left: Number(Math.max(0, lim.day_usd - used.usd).toFixed(4)) };
}

function live(user, callId) {
  const c = open.get(user.id);
  if (!c || c.id !== callId) throw refuse(409, 'That call has ended.');
  const i = info(user);
  if (!i.allowed) { close(user.id, 'consent'); throw refuse(403, i.why); }
  const lim = limits();
  const elapsed = (Date.now() - c.started) / 1000;
  const used = usage(user.id).seconds;
  if (elapsed > lim.call_s + 5 || used + elapsed > lim.day_s + 5) { close(user.id, 'limit'); throw refuse(429, 'That is the limit for this call.'); }
  c.lastSeen = Date.now();
  return c;
}

function end(user, callId, metrics) {
  const c = open.get(user.id);
  if (!c || c.id !== callId) return { ended: false };
  return { ended: true, ...close(user.id, (metrics && metrics.reason) || 'ended', metrics) };
}

// ── What may be spoken ─────────────────────────────────────────────────────
const said = new Map(); // userId -> recent replies, normalised
const norm = (t) => String(t || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
/** The dock route calls this with every reply it returns: these words passed safety and the fact check. */
function noteReply(userId, text) {
  const n = norm(text);
  if (!n) return;
  const list = said.get(userId) || [];
  list.push(n);
  said.set(userId, list.slice(-6));
}
function maySay(userId, text) {
  const n = norm(text);
  if (!n) return false;
  if (Object.values(NOTICES).some((x) => norm(x) === n)) return true;
  return (said.get(userId) || []).some((r) => r.includes(n));
}

/** Seconds of 16-bit PCM in a WAV, from its own header. Null when it is not one we can read. */
function wavSeconds(buf) {
  if (!buf || buf.length < 44 || buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WAVE') return null;
  const byteRate = buf.readUInt32LE(28);
  if (!byteRate) return null;
  let at = 12;
  while (at + 8 <= buf.length) {
    const size = buf.readUInt32LE(at + 4);
    if (buf.toString('latin1', at, at + 4) === 'data') return Math.min(size, buf.length - at - 8) / byteRate;
    at += 8 + size + (size % 2);
  }
  return null;
}

/** Listening: speech only, one clip. Throws with `status` (the page then uses the browser's recognizer, or says so and opens the chat). */
async function hear(user, callId, buf, { lang = 'en' } = {}) {
  live(user, callId);
  if (!voice.gatewayFor(user.id)) throw refuse(503, 'Listening is the browser\'s on this account.');
  const seconds = wavSeconds(buf);
  if (!seconds) throw refuse(400, 'Not a clip we can read.');
  if (seconds > LIMITS.clip_s + 1) throw refuse(413, 'That clip is too long.');
  const cost = ledger.costOf({ kind: 'stt', model: voice.tutorSttModel(), seconds });
  if (usage(user.id).usd + cost > limits().day_usd) throw refuse(429, 'Today\'s paid listening is used up.');
  const text = await voice.tutorTranscribe(buf, { userId: user.id, lang, seconds, callCapped: true });
  addUsage(user.id, { usd: cost, stt_seconds: seconds });
  return { text: String(text || '').slice(0, 1000) };
}

/** Speaking: one sentence. Only what the tutor's route returned, or a fixed notice. */
async function say(user, callId, text, { lang = 'en' } = {}) {
  live(user, callId);
  const line = String(text || '').trim().slice(0, 600);
  if (!line) throw refuse(400, 'Nothing to say.');
  if (!maySay(user.id, line)) throw refuse(403, 'Only the tutor\'s own checked words are spoken.');
  if (!voice.gatewayFor(user.id)) throw refuse(503, 'The voice is the browser\'s on this account.');
  const cost = ledger.costOf({ kind: 'tts', model: voice.tutorTtsModel(), chars: line.length });
  if (usage(user.id).usd + cost > limits().day_usd) throw refuse(429, 'Today\'s paid voice is used up.');
  const mp3 = await voice.tutorSpeak(line, { userId: user.id, lang });
  addUsage(user.id, { usd: cost, chars: line.length });
  return mp3;
}

module.exports = { info, start, end, hear, say, noteReply, maySay, usage, limits, wavSeconds, close, NOTICES, LIMITS, _open: open, _said: said };
