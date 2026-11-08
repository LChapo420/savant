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
const full = require('../services/tutor-full');
const { requireAuth } = require('../middleware/auth');
const { limit } = require('../utils/rate-limit');

const voice = require('../services/spanish/voice');
const call = require('../services/tutor-call');
const events = require('../services/tutor-events');

// Tests and other dates (services/tutor-events.js, TUTOR_EVENTS): code, not the model, reads the dates. A message that names an event and a date
// leaves a suggestion beside the reply (nothing is written until the learner says yes or taps Add); a "yes" to a waiting suggestion is answered here, no model.
const lastSaid = (messages) => [...tutor.cleanHistory(messages)].reverse().find((m) => m.role === 'user');
function eventAnswer(user, messages, mode) {
  const last = lastSaid(messages);
  const a = last ? events.answer(user, last.content) : null;
  if (!a) return null;
  call.noteReply(user.id, a.reply);
  return { reply: a.reply, source: 'events', mode, held: false, ...(a.events ? { events: a.events } : {}), ...(a.added ? { added: a.added } : {}), ...(a.goal_offer ? { goal_offer: a.goal_offer } : {}), ...(a.goal_set ? { goal_set: a.goal_set } : {}), ...(a.dismissed ? { dismissed: true } : {}) };
}
function withEvents(user, messages, out, voice) {
  if (!out || !out.reply || out.source === 'safety' || out.source === 'events') return out;
  const last = lastSaid(messages);
  const block = last ? events.suggest(user, last.content) : null;
  if (!block) return out;
  return { ...out, events: block, reply: voice ? `${out.reply} ${events.spoken(block)}`.trim() : out.reply };
}

const router = express.Router();

router.post('/tutor/chat', requireAuth, limit('tutor', 150, 60 * 60 * 1000), async (req, res) => {
  const where = ['home', 'subject'].includes(req.body && req.body.where) ? req.body.where : 'home';
  try {
    const lastSaid = [...tutor.cleanHistory(req.body && req.body.messages)].reverse().find((m) => m.role === 'user');
    const crisis = lastSaid ? full.triage(req.user, lastSaid.content) : null;
    if (crisis && crisis.reply) return res.json({ reply: crisis.reply, source: 'safety', kind: crisis.kind });
    if (full.on(req.user)) {
      const last = lastSaid;
      const out = await full.withDeadline(tutor.chat({ user: req.user, messages: req.body && req.body.messages, where }));
      return res.json(out || { ...full.fallback({ user: req.user, page: { path: where === 'home' ? '/dashboard' : '/path' }, message: last ? last.content : '', name: dock.firstName(req.user), why: 'slow' }), source: 'fallback' });
    }
    res.json(await tutor.chat({ user: req.user, messages: req.body && req.body.messages, where }));
  } catch (err) {
    console.warn(`tutor: ${err.message}`);
    res.json({ reply: tutor.offlineReply(req.user.id), source: 'fallback' });
  }
});

// The dock on every page. The mode (full / method-only / off) comes from the page path, decided here.
router.get('/tutor/dock', requireAuth, (req, res) => {
  const mode = dock.modeFor(req.query.path, { full: full.on(req.user) });
  const callInfo = call.info(req.user);
  res.json({ mode, full: full.on(req.user), input_mode: tutorMode.get(req.user.id), side: tutorMode.getSide(req.user.id), speech_lang: /^\/spanish/.test(dock.cleanPath(req.query.path)) ? 'es' : 'en', stt: voice.gatewayFor(req.user.id) && callInfo.mic, mic: callInfo.mic, call: callInfo });
});

// Top or bottom on a phone: the learner's choice, kept on the account.
router.put('/tutor/dock/side', requireAuth, (req, res) => {
  const s = tutorMode.validSide(req.body && req.body.side);
  if (!s) return res.status(400).json({ error: 'Side must be top or bottom.' });
  res.json({ side: tutorMode.setSide(req.user.id, s) });
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
  const quick = eventAnswer(req.user, body.messages, dock.modeFor(body.page && body.page.path));
  if (quick) return res.json(quick);
  try {
    const out = withEvents(req.user, body.messages, await dock.reply({ user: req.user, messages: body.messages, page: body.page, inputMode: body.input_mode, image: body.image }), body.input_mode === 'voice');
    call.noteReply(req.user.id, out.reply); // these words passed safety and the fact check: a voice call may speak them
    res.json(out);
  } catch (err) {
    console.warn(`tutor dock: ${err.message}`);
    const mode = dock.modeFor(body.page && body.page.path);
    // With TUTOR_FULL on, a failure is still a useful answer (the product, this page, the learner's own record), never a dead end.
    if (full.on(req.user)) {
      const last = [...tutor.cleanHistory(body.messages)].reverse().find((m) => m.role === 'user');
      const fb = full.fallback({ user: req.user, page: body.page, message: last ? last.content : '', mode, name: dock.firstName(req.user) });
      const fe = withEvents(req.user, body.messages, { ...fb, source: 'fallback', mode }, body.input_mode === 'voice');
      call.noteReply(req.user.id, fe.reply);
      return res.json(fe);
    }
    const offline = tutor.offlineReply(req.user.id);
    call.noteReply(req.user.id, offline);
    res.json({ reply: offline, source: 'fallback', mode });
  }
});

// The voice call's turn, streamed (TUTOR_VOICE_STREAM; services/tutor-call.js header, services/tutor-context.js onSentence). One JSON object a line:
//   {"type":"sentence","i":0,"text"}     the first sentences, spoken now: they passed the same checks as a whole reply
//   {"type":"done","reply",...,"speak":[{"i","text"}],"replace"}  the whole reply, checked as always. `speak` is what is left to say; `replace` means the whole reply did not
//                                       begin with what was spoken (it was held or replaced), so the page stops and says `speak`, which is then the whole reply
//   {"type":"audio","i","mp3"|"error"}  with `call` (a live call on the paid voice): the voice for part i, made here through services/tutor-call.js say() and its limits
// Everything else is the dock route's: the same mode rule, the same reply, the same fallbacks. A page that hangs up early (the learner talked again) gets nothing more,
// and its turn is not remembered (`aborted`).
router.post('/tutor/dock/stream', requireAuth, limit('tutor', 150, 60 * 60 * 1000), async (req, res) => {
  const body = req.body || {};
  if (!call.switches().stream) return res.status(404).json({ error: 'Not on.' });
  if (dock.modeFor(body.page && body.page.path) === 'off') return res.status(403).json({ error: 'The tutor is off on this page.' });
  let closed = false;
  res.on('close', () => { if (!res.writableFinished) closed = true; });
  res.status(200).set({ 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Accel-Buffering': 'no' });
  if (res.flushHeaders) res.flushHeaders();
  const send = (o) => { if (!closed) { try { res.write(`${JSON.stringify(o)}\n`); } catch { closed = true; } } };
  const callId = String(body.call || '');
  const lang = body.lang === 'es' ? 'es' : 'en';
  const voices = [];
  const voiceEvent = (i, text) => (!callId || closed ? Promise.resolve() : call.say(req.user, callId, text, { lang })
    .then((mp3) => send({ type: 'audio', i, mp3: Buffer.from(mp3).toString('base64') }))
    .catch((err) => send({ type: 'audio', i, error: err.status || 503 })));
  const speak = (i, text) => { voices.push(voiceEvent(i, text)); };
  let first = null;
  let head = null; // { text, audio }: the voice for the draft's first sentences, made while their checks run, sent only if they pass
  const finishWith = (out0) => {
    const out = withEvents(req.user, body.messages, out0, true);
    call.noteReply(req.user.id, out.reply);
    // Nothing was spoken early, but the whole reply (now checked) begins with the draft words whose voice was made ahead: they are part 0, with that voice.
    const useHead = !first && head && head.chunk && call.rest(out.reply, head.chunk).replace === false && String(out.reply || '').trim().length > head.chunk.length;
    const r = call.rest(out.reply, first || (useHead ? head.chunk : null));
    const at = first || useHead ? 1 : 0;
    const parts = [...(useHead ? [{ i: 0, text: head.text }] : []), ...r.parts.map((text, k) => ({ i: at + k, text }))];
    send({ type: 'done', ...out, speak: parts, replace: r.replace });
    parts.forEach((p) => { if (useHead && p.i === 0) voices.push(head.audio.then((mp3) => send({ type: 'audio', i: 0, mp3: Buffer.from(mp3).toString('base64') })).catch(() => voiceEvent(0, head.text))); else speak(p.i, p.text); });
  };
  try {
    const quick = eventAnswer(req.user, body.messages, dock.modeFor(body.page && body.page.path));
    if (quick) { finishWith(quick); for (let k = 0; k < voices.length; k++) await voices[k]; if (!closed) res.end(); return; } // eslint-disable-line no-await-in-loop
    const out = await dock.reply({
      user: req.user, messages: body.messages, page: body.page, inputMode: body.input_mode || 'voice', image: body.image,
      onChunk: (draft) => {
        if (!callId || closed || head) return;
        const text = call.sentences(draft).join(' ');
        head = { chunk: draft, text, audio: call.prepare(req.user, callId, text, { lang }) };
        head.audio.catch(() => {}); // dropped unheard if the words do not pass
      },
      onSentence: (text) => {
        if (closed || first) return;
        first = text;
        call.noteReply(req.user.id, text); // checked on its own: the call may speak it
        send({ type: 'sentence', i: 0, text });
        const said = call.sentences(text).join(' ');
        if (head && head.text === said) {
          voices.push(head.audio.then((mp3) => send({ type: 'audio', i: 0, mp3: Buffer.from(mp3).toString('base64') })).catch(() => voiceEvent(0, said)));
        } else speak(0, said);
      },
      aborted: () => closed,
    });
    finishWith(out);
  } catch (err) {
    console.warn(`tutor dock stream: ${err.message}`);
    const mode = dock.modeFor(body.page && body.page.path);
    if (full.on(req.user)) {
      const last = [...tutor.cleanHistory(body.messages)].reverse().find((m) => m.role === 'user');
      finishWith({ ...full.fallback({ user: req.user, page: body.page, message: last ? last.content : '', mode, name: dock.firstName(req.user) }), source: 'fallback', mode });
    } else finishWith({ reply: tutor.offlineReply(req.user.id), source: 'fallback', mode });
  }
  for (let k = 0; k < voices.length; k++) await voices[k]; // eslint-disable-line no-await-in-loop
  if (!closed) res.end();
});

// The tutor's voice in a call (TUTOR_VOICE_PICKER): one of the ElevenLabs voices the call may use, kept on the account.
router.put('/tutor/dock/voice', requireAuth, (req, res) => {
  if (!call.switches().picker) return res.status(404).json({ error: 'Not on.' });
  const v = tutorMode.validVoice(req.body && req.body.voice);
  if (!v) return res.status(400).json({ error: 'That voice is not one of the choices.' });
  res.json({ voice: tutorMode.setVoice(req.user.id, v) });
});

// The learner closed the dock or left the page: read the turns that are waiting (services/tutor-facts.js), if the models are free.
router.post('/tutor/dock/closed', requireAuth, limit('tutor-closed', 60, 60 * 60 * 1000), (req, res) => {
  require('../services/tutor-facts').flush(req.user.id).catch(() => {}); // eslint-disable-line global-require
  // The chat ended: the scorecard reads its new messages now (services/scorecard/hooks.js onTutorActivity, via tutor-evidence).
  require('../services/tutor-evidence').chatEnded(req.user.id); // eslint-disable-line global-require
  res.status(204).end();
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

// The voice call (services/tutor-call.js, js/tutor-call.js). A refusal carries plain words for the learner.
const callError = (res, err) => {
  if (!err.why) console.warn(`tutor call: ${err.message}`);
  res.status(err.status || 503).json({ error: err.why || 'Voice is not available right now.' });
};
const callAudio = express.raw({ type: () => true, limit: 1536 * 1024 }); // 45 s of 16 kHz mono, the longest clip a call sends
router.post('/tutor/call/start', requireAuth, limit('tutor-call', 40, 60 * 60 * 1000), (req, res) => {
  try { res.set('Cache-Control', 'no-store').json(call.start(req.user)); } catch (err) { callError(res, err); }
});
router.post('/tutor/call/hear', requireAuth, limit('tutor-call-hear', 240, 60 * 60 * 1000), callAudio, async (req, res) => {
  try {
    const out = await call.hear(req.user, String(req.query.call || ''), Buffer.isBuffer(req.body) ? req.body : null, { lang: req.query.lang === 'es' ? 'es' : 'en' });
    res.set('Cache-Control', 'private, no-store').json(out);
  } catch (err) { callError(res, err); }
});
router.post('/tutor/call/say', requireAuth, limit('tutor-call-say', 300, 60 * 60 * 1000), async (req, res) => {
  const body = req.body || {};
  try {
    const mp3 = await call.say(req.user, String(body.call || ''), body.text, { lang: body.lang === 'es' ? 'es' : 'en' });
    res.set('Content-Type', 'audio/mpeg').set('Cache-Control', 'private, no-store').send(mp3);
  } catch (err) { callError(res, err); }
});
// TUTOR_VOICE_WARM: the learner started or stopped talking; open the connections the turn will use (services/tutor-call.js warm). Nothing is sent but a HEAD.
router.post('/tutor/call/warm', requireAuth, limit('tutor-call-warm', 1200, 60 * 60 * 1000), (req, res) => {
  if (!call.switches().warm) return res.status(404).json({ error: 'Not on.' });
  try { call.warm(req.user, String((req.body && req.body.call) || '')); res.status(204).end(); } catch (err) { callError(res, err); }
});
router.post('/tutor/call/end', requireAuth, (req, res) => {
  const body = req.body || {};
  res.json(call.end(req.user, String(body.call || ''), body));
});

router.get('/tutor/memory', requireAuth, (req, res) => {
  const memory = tutor.view(req.user.id);
  // `archive`: how many exchanges the tutor can search when they bring up something from long ago (services/tutor-archive.js).
  res.json({ know: tutor.pack(req.user.id), summary: memory.summary, recent: memory.turns.slice(-6), turn_count: memory.turn_count, archive: require('../services/tutor-archive').summary(req.user.id) }); // eslint-disable-line global-require
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
