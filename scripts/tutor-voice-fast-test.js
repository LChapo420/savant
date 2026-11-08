/**
 * The voice call made quicker (services/tutor-call.js header): sentence streaming, the word-aware end of a turn, the fast writer for short turns, the ack sound and the
 * voice picker. Every one is behind a switch that is off by default; this checks the switches, the rules, and that nothing is spoken before it passes the checks.
 *
 *   node scripts/tutor-voice-fast-test.js
 *
 * Throwaway database and ledger, models and fetch mocked: nothing is sent and nothing is spent. The real delay is scripts/tutor-call-real-delay.js.
 */
const os = require('os');
const path = require('path');
const fs = require('fs');
const http = require('http');
const vm = require('vm');

process.env.NODE_ENV = 'test';
const tmp = path.join(os.tmpdir(), `tutor-voice-fast-test-${process.pid}`);
fs.mkdirSync(tmp, { recursive: true });
process.env.DB_FILE = path.join(tmp, 'db.json');
process.env.HOLDOUT_DIR = tmp;
process.env.LLMGATEWAY_LEDGER_FILE = path.join(tmp, 'ledger.json');
process.env.LLMGATEWAY_API_KEY = 'test-key';
process.env.TUTOR_FULL = '1';
for (const k of ['TUTOR_VOICE_STREAM', 'TUTOR_VOICE_EOS', 'TUTOR_VOICE_FAST', 'TUTOR_CALL_ACK', 'TUTOR_VOICE_PICKER']) delete process.env[k];

let failures = 0;
function check(label, ok, detail) {
  if (ok) { console.log(`  ok   ${label}`); return; }
  failures += 1;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` - ${JSON.stringify(detail).slice(0, 300)}`}`);
}
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const sent = [];
global.fetch = async (url, init) => { sent.push({ url, body: typeof init.body === 'string' ? JSON.parse(init.body) : null }); return new Response(Buffer.from('ID3fakeaudio'), { status: 200, headers: { 'content-type': 'audio/mpeg' } }); };

const express = require('express');
const db = require('../config/db');
const ai = require('../services/ai');
const guard = require('../services/fact-guard');
const full = require('../services/tutor-full');

// The models: the dock's writer streams its draft; the dock's fact check says WRONG to any text holding "WRONGFACT"; the guard's inline check likewise.
let DRAFT = 'A prime number has exactly two factors, one and itself. Seven is prime because nothing else divides it. Want to try eleven?';
let writerWait = 60;
const calls = [];
ai.talk = async (o) => {
  calls.push(o);
  if (o.task === 'dock_help') {
    const text = DRAFT;
    if (o.onDelta) { for (let k = 0; k < text.length; k += 9) { o.onDelta(text.slice(k, k + 9), text.slice(0, k + 9), { model: 'test-writer' }); await delay(1); } }
    if (o.onDraft) o.onDraft(text);
    await delay(writerWait);
    return text;
  }
  if (o.task === 'dock_leak_check') return /WRONGFACT/.test(JSON.stringify(o.messages)) ? 'WRONG' : 'OK';
  return null;
};
const chunkChecks = [];
guard.passesChunk = async (a) => { chunkChecks.push(a); return !/WRONGFACT|GUARDNO/.test(a.text); };

const call = require('../services/tutor-call');
const dock = require('../services/tutor-context');
const tutorMode = require('../services/tutor-mode');
const tutor = require('../services/tutor');

const paid = db.insert('users', { email: 'p@example.test', display_name: 'Pat', age_check: { needs_parent: false } });
const adult = db.insert('users', { email: 'a@example.test', display_name: 'Ada', age_check: { needs_parent: false } });
const kid = db.insert('users', { email: 'k@example.test', display_name: 'Kit', age_check: { needs_parent: true } });
process.env.SPANISH_GATEWAY_USERS = `${paid.id},${kid.id}`;
const page = { path: '/dashboard', title: 'Home', heading: 'Hi', text: 'Today' };

(async () => {
  console.log('the switches are off by default');
  const i0 = call.info(paid);
  check('no streaming, no word-aware end, no ack, no picker', i0.stream === false && i0.eos === false && i0.ack === false && !('voices' in i0), i0);
  check('no fast writer', !dock.voiceFastOn());

  console.log('the cheap rule for the fast writer');
  const rule = (m, extra = {}) => dock.hardVoiceTurn({ message: m, page, mode: 'full', plan: null, ...extra });
  check('a short plain question may go to the fast writer', rule('What is a verb?') === null && rule('Why is the sky blue?') === null);
  check('maths stays with the usual writer', rule('What is 12 times 7?') === 'maths' && rule('what is 3/4 plus 1/8') === 'maths' && rule('what is seven squared') === 'maths');
  check('asking for depth stays', rule('Can you walk me through it step by step?') === 'asks for depth' && rule('prove that root two is irrational') === 'asks for depth');
  check('a long turn stays', rule(new Array(30).fill('word').join(' ')) === 'long');
  check('a question on screen, a method-only page or a picture stays (integrity)', rule('hint?', { page: { ...page, question: 'What is 2+2?' } }) === 'integrity' && rule('hint?', { mode: 'method' }) === 'integrity' && rule('what is this', { image: 'data:x' }) === 'integrity');
  check('a worked example in the plan stays', rule('show me', { plan: { rung: 4 } }) === 'worked example');

  console.log('the first sentences of a growing reply');
  check('too short to check alone: wait', dock.firstChunk('Six. Hex means') === null);
  check('a whole sentence of 40+ characters, once the next has begun', dock.firstChunk('A prime number has exactly two factors, one and itself. Seven') === 'A prime number has exactly two factors, one and itself.');
  check('not before the next one begins (it might not be the end)', dock.firstChunk('A prime number has exactly two factors, one and itself.') === null);
  check('a decimal point is not an end', dock.firstChunk('Pi is about 3.14 and it never ends or repeats in any way at all') === null);
  check('short sentences are joined up to the minimum', dock.firstChunk('Good question. Six sides. A hexagon always has six. Next') === 'Good question. Six sides. A hexagon always has six.');
  check('an open reasoning block shows nothing', dock.visibleText('<think>hmm') === '' && dock.visibleText('<think>x</think>Hello') === 'Hello');

  console.log('what is left to say once the whole reply is in');
  const whole = 'A prime number has exactly two factors. Seven is prime. Want to try eleven?';
  const r1 = call.rest(whole, 'A prime number has exactly two factors.');
  check('the rest only, when the whole reply begins with what was spoken', !r1.replace && r1.parts.join(' ') === 'Seven is prime. Want to try eleven?', r1);
  const r2 = call.rest(full.NOT_SURE, 'A prime number has exactly two factors.');
  check('a held reply replaces what was spoken, whole', r2.replace && r2.parts.join(' ') === full.NOT_SURE.replace(/\s+/g, ' '), r2);
  const r3 = call.rest('A prime number has  exactly two factors! Seven is prime.', 'A prime number has exactly two factors.');
  check('the same words with other spacing or punctuation still count as spoken', !r3.replace && r3.parts.join(' ') === 'Seven is prime.', r3);
  check('nothing spoken yet: all of it', call.rest(whole, null).parts.length >= 2 && !call.rest(whole, null).replace);

  console.log('the page cuts sentences the same way as the server');
  const src = fs.readFileSync(path.join(__dirname, '../public/js/tutor-call.js'), 'utf8');
  const win = { navigator: { userAgent: 'test' } };
  vm.runInNewContext(src, { window: win, navigator: win.navigator, performance: { now: () => 0 } });
  const sample = 'Hi. A ratio compares two amounts, like three to five. It tells you how they relate! Want to try one? Sure.';
  check('same parts', JSON.stringify(win.TutorCall.sentences(sample)) === JSON.stringify(call.sentences(sample)), [win.TutorCall.sentences(sample), call.sentences(sample)]);
  const lu = win.TutorCall.looksUnfinished;
  check('a trailing word, filler or comma waits for more', lu('So I was wondering,') && lu('What is the capital of') && lu('um') && lu('I think it is seven and') && lu('the answer is because.'));
  check('a finished sentence does not', !lu('How do you divide fractions?') && !lu('What is a verb') && !lu('Why is the sky blue?'));

  console.log('streaming: the first sentences are spoken only after they pass the same checks');
  const spoken = [];
  const out1 = await dock.reply({ user: paid, messages: [{ role: 'user', content: 'what is a prime number' }], page, inputMode: 'voice', onSentence: (s) => spoken.push(s) });
  check('the first sentence was handed out once, before the whole reply returned', spoken.length === 1 && spoken[0] === 'A prime number has exactly two factors, one and itself.' && out1.spoken_first === spoken[0], { spoken, out1 });
  const c0 = chunkChecks[chunkChecks.length - 1];
  check('it went through the fact guard\'s inline check for dock_help, with the page as source and the conversation', c0 && c0.task === 'dock_help' && c0.userId === paid.id && typeof c0.req.factSource === 'string' && c0.req.messages.length >= 1 && c0.writerModel === 'test-writer', c0 && { task: c0.task, ws: c0.writerModel });
  check('and through the dock\'s own fact check, on those words', calls.some((c) => c.task === 'dock_leak_check' && JSON.stringify(c.messages).includes('Tutor reply: A prime number has exactly two factors, one and itself.')));
  check('the whole reply was still checked as always', calls.filter((c) => c.task === 'dock_leak_check').length >= 2 && out1.reply === DRAFT, out1.reply);

  DRAFT = 'GUARDNO prime numbers have exactly two factors, one and itself. Seven is prime.';
  const spoken2 = [];
  const out2 = await dock.reply({ user: paid, messages: [{ role: 'user', content: 'what is a prime' }], page, inputMode: 'voice', onSentence: (s) => spoken2.push(s) });
  check('first sentences the guard does not pass are never spoken early', spoken2.length === 0 && !out2.spoken_first, spoken2);

  DRAFT = 'A prime number has exactly two factors, one and itself. WRONGFACT nine is prime too.';
  const spoken3 = [];
  const out3 = await dock.reply({ user: paid, messages: [{ role: 'user', content: 'is nine prime' }], page, inputMode: 'voice', onSentence: (s) => spoken3.push(s) });
  check('a later sentence that fails: the first was spoken, the whole reply is held as in chat', spoken3.length === 1 && out3.reply === full.NOT_SURE && out3.held, out3);
  check('and the page is told to stop and say the held reply instead', call.rest(out3.reply, out3.spoken_first).replace === true);

  DRAFT = 'WRONGFACT the first sentence is wrong but long enough. And more.';
  const spoken4 = [];
  await dock.reply({ user: paid, messages: [{ role: 'user', content: 'x' }], page, inputMode: 'voice', onSentence: (s) => spoken4.push(s) });
  check('a first sentence the dock\'s fact check calls wrong is never spoken early', spoken4.length === 0);

  DRAFT = 'A prime number has exactly two factors, one and itself. Seven is prime because nothing else divides it.';
  const spoken5 = [];
  await dock.reply({ user: paid, messages: [{ role: 'user', content: 'hint please' }], page: { ...page, question: 'Is 7 prime?' }, inputMode: 'voice', onSentence: (s) => spoken5.push(s) });
  check('with a question on screen nothing is spoken before the whole reply and its leak checks', spoken5.length === 0);

  writerWait = 1;
  const slowChecks = guard.passesChunk;
  guard.passesChunk = async (a) => { await delay(200); return slowChecks(a); };
  const spoken6 = [];
  const out6 = await dock.reply({ user: paid, messages: [{ role: 'user', content: 'what is prime' }], page, inputMode: 'voice', onSentence: (s) => spoken6.push(s) });
  check('if the whole reply is checked first, nothing is handed out late', spoken6.length === 0 && out6.reply === DRAFT, spoken6);
  guard.passesChunk = slowChecks;
  writerWait = 60;

  const turns0 = (tutor.view(paid.id).turns || []).length;
  await dock.reply({ user: paid, messages: [{ role: 'user', content: 'dropped words' }], page, inputMode: 'voice', onSentence: () => {}, aborted: () => true });
  check('a turn the learner talked over is not remembered', (tutor.view(paid.id).turns || []).length === turns0);

  console.log('the fast writer (TUTOR_VOICE_FAST)');
  const writerCall = () => calls.filter((c) => c.task === 'dock_help').slice(-1)[0];
  await dock.reply({ user: paid, messages: [{ role: 'user', content: 'what is a verb' }], page, inputMode: 'voice' });
  check('off: no first pick', !writerCall().firstPick);
  process.env.TUTOR_VOICE_FAST = '1';
  const f1 = await dock.reply({ user: paid, messages: [{ role: 'user', content: 'what is a verb' }], page, inputMode: 'voice' });
  check('on: a short voice turn asks the pool for the fast slot first, same task and fact-check source', JSON.stringify(writerCall().firstPick) === '["coral:deepseek-v4.1-flash"]' && writerCall().task === 'dock_help' && typeof writerCall().factSource === 'string' && f1.writer === 'fast', { fp: writerCall().firstPick, w: f1.writer });
  const f2 = await dock.reply({ user: paid, messages: [{ role: 'user', content: 'what is 12 times 13' }], page, inputMode: 'voice' });
  check('on: a hard one keeps the usual lineup', !writerCall().firstPick && f2.writer === 'usual' && f2.hard_why === 'maths');
  await dock.reply({ user: paid, messages: [{ role: 'user', content: 'what is a verb' }], page, inputMode: 'text' });
  check('on: typed turns are untouched', !writerCall().firstPick);
  delete process.env.TUTOR_VOICE_FAST;

  console.log('the pool: a first pick and one owner for a streamed answer');
  const pool = require('../services/pool');
  const mk = (id, paidSlot, fn) => pool.makeSlot({ id, provider: id, label: id, maxConcurrent: 2, latencyHintMs: 5, dataClass: 'learner', priceIn: paidSlot ? 1 : 0, priceOut: paidSlot ? 1 : 0, ...(paidSlot ? { estimateUsd: () => 0.0001, costOf: () => 0.0001 } : {}), call: fn });
  const said = (who, ms = 5) => async (rq) => { if (rq.onDelta) { rq.onDelta(who, `${who}!`); } await delay(ms); return { text: `${who}!`, usage: { input_tokens: 1, output_tokens: 1 }, model: who }; };
  const freeS = mk('free-a', false, said('free'));
  const paidS = mk('paid-b', true, said('paid'));
  const plain = await pool.callHedged({ kind: 'chat', messages: [] }, { slots: [freeS, paidS], timeoutMs: 2000 });
  check('without a first pick the free slot answers', plain && plain.text === 'free!');
  const picked = await pool.callHedged({ kind: 'chat', messages: [], firstPick: ['paid-b'] }, { slots: [freeS, paidS], timeoutMs: 2000 });
  check('with one, the picked slot starts first even though it is paid', picked && picked.text === 'paid!', picked && picked.pool);
  const deltas = [];
  const slowA = mk('slow-a', false, said('slowA', 300));
  const fastB = mk('fast-b', false, async (rq) => { await delay(50); if (rq.onDelta) rq.onDelta('B', 'B'); return { text: 'B', usage: {}, model: 'B' }; });
  const hedged = await pool.callHedged({ kind: 'chat', messages: [], onDelta: (f, all) => deltas.push(f === null ? null : all) }, { slots: [slowA, fastB], timeoutMs: 2000, hedgeAfterMs: 10 });
  check('a hedge\'s words are never mixed into the stream that started first', deltas.length >= 1 && deltas[0] === 'slowA!' && !deltas.includes('B'), { deltas, won: hedged && hedged.text });
  const failer = mk('fail-a', false, async (rq) => { rq.onDelta('half', 'half'); await delay(5); throw Object.assign(new Error('boom'), { status: 500 }); });
  const deltas2 = [];
  const after = await pool.callHedged({ kind: 'chat', messages: [], onDelta: (f, all) => deltas2.push(f === null ? null : all) }, { slots: [failer, mk('next-b', false, said('next'))], timeoutMs: 2000 });
  check('when the stream\'s writer fails the caller is told to start over, and the next one streams', JSON.stringify(deltas2) === JSON.stringify(['half', null, 'next!']) && after.text === 'next!', deltas2);

  console.log('the route, with the switches on');
  process.env.TUTOR_VOICE_STREAM = '1';
  process.env.TUTOR_VOICE_PICKER = '1';
  process.env.TUTOR_VOICE_EOS = '1';
  process.env.TUTOR_CALL_ACK = '1';
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.user = db.byId('users', Number(req.headers['x-user'])) || null; next(); });
  app.use('/api', require('../routes/tutor'));
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const { port } = server.address();
  const req = (method, url, body, uid) => new Promise((ok, no) => {
    const data = body ? JSON.stringify(body) : null;
    const q = http.request({ host: '127.0.0.1', agent: false, port, path: url, method, headers: { 'content-type': 'application/json', 'x-user': String(uid || ''), ...(data ? { 'content-length': Buffer.byteLength(data) } : {}) } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => { const b = Buffer.concat(chunks).toString(); let json = null; try { json = JSON.parse(b); } catch { /* ndjson */ } ok({ status: res.statusCode, json, text: b, type: res.headers['content-type'] }); });
    });
    q.on('error', no);
    if (data) q.write(data);
    q.end();
  });
  const st = (await req('GET', '/api/tutor/dock?path=/dashboard', null, paid.id)).json.call;
  check('the status carries the switches and, for the paid voice, the choices', st.stream && st.eos && st.ack && st.voice === 'Aria' && st.voices.includes('Charlotte') && st.voices.length === 20, st);
  const stA = (await req('GET', '/api/tutor/dock?path=/dashboard', null, adult.id)).json.call;
  check('an account on the browser\'s voice gets no picker', !('voices' in stA));
  const stK = (await req('GET', '/api/tutor/dock?path=/dashboard', null, kid.id)).json.call;
  check('a child without consent still gets no call and no mic, switches or not', stK.allowed === false && stK.mic === false && !('voices' in stK), stK);
  check('a voice that is not a choice is refused', (await req('PUT', '/api/tutor/dock/voice', { voice: 'Evil' }, paid.id)).status === 400);
  check('a choice is kept on the account', (await req('PUT', '/api/tutor/dock/voice', { voice: 'Charlotte' }, paid.id)).json.voice === 'Charlotte' && tutorMode.getVoice(paid.id) === 'Charlotte' && tutorMode.getSide(paid.id) === 'bottom');
  const c = call.start(paid);
  DRAFT = 'A prime number has exactly two factors, one and itself. Seven is prime because nothing else divides it. Want to try eleven?';
  const s0 = sent.length;
  const res1 = await req('POST', '/api/tutor/dock/stream', { messages: [{ role: 'user', content: 'what is a prime number' }], page, call: c.call_id }, paid.id);
  const evs = res1.text.trim().split('\n').map((l) => JSON.parse(l));
  const kinds = evs.map((e) => `${e.type}${e.i != null ? e.i : ''}`);
  check('NDJSON: the first sentence, then the whole reply with what is left to say', res1.status === 200 && /ndjson/.test(res1.type) && kinds[0] === 'sentence0' && kinds.indexOf('done') > 0, kinds);
  const done = evs.find((e) => e.type === 'done');
  check('what is left is the rest of the checked reply', done.replace === false && done.speak.map((p) => p.text).join(' ') === 'Seven is prime because nothing else divides it. Want to try eleven?' && done.speak[0].i === 1, done.speak);
  const audios = evs.filter((e) => e.type === 'audio');
  check('every part has its voice in the stream, made through the call\'s limits and ledger', audios.length === 1 + done.speak.length && audios.every((a) => a.mp3 && Buffer.from(a.mp3, 'base64').toString().startsWith('ID3')), kinds);
  const ttsSent = sent.slice(s0).filter((x) => /speech/.test(x.url));
  check('in the learner\'s chosen voice', ttsSent.length >= 2 && ttsSent.every((x) => x.body.voice === 'Charlotte'), ttsSent.map((x) => x.body.voice));
  check('the first sentence\'s audio is sent only after its sentence event', kinds.indexOf('audio0') > kinds.indexOf('sentence0'));
  DRAFT = 'WRONGFACT this first sentence is wrong and long enough to check. More words here.';
  const s1 = sent.length;
  const res2 = await req('POST', '/api/tutor/dock/stream', { messages: [{ role: 'user', content: 'tell me' }], page, call: c.call_id }, paid.id);
  const evs2 = res2.text.trim().split('\n').map((l) => JSON.parse(l));
  const done2 = evs2.find((e) => e.type === 'done');
  check('a draft that fails: no early sentence, the held reply is what is said', !evs2.some((e) => e.type === 'sentence') && done2.reply === full.NOT_SURE && done2.speak.length >= 1, evs2.map((e) => e.type));
  const heardTexts = sent.slice(s1).filter((x) => /speech/.test(x.url)).map((x) => x.body.input);
  check('the voice made ahead for the failed words never reaches the page', !evs2.some((e) => e.type === 'audio' && e.i === 0 && heardTexts[0] && /WRONGFACT/.test(heardTexts[0]) && evs2.indexOf(e) < evs2.indexOf(done2)) && evs2.filter((e) => e.type === 'audio').length === done2.speak.length, { heardTexts, kinds: evs2.map((e) => `${e.type}${e.i != null ? e.i : ''}`) });
  const offStream = await req('POST', '/api/tutor/dock/stream', { messages: [{ role: 'user', content: 'hi' }], page: { path: '/spanish-check' } }, paid.id);
  check('a sealed test stays sealed', offStream.status === 403);
  const kidStream = await req('POST', '/api/tutor/dock/stream', { messages: [{ role: 'user', content: 'what is a prime number' }], page, call: 'made-up' }, kid.id);
  check('no call open (a child cannot start one): no voice is made, only words', !kidStream.text.split('\n').filter(Boolean).map((l) => JSON.parse(l)).some((e) => e.type === 'audio' && e.mp3));
  delete process.env.TUTOR_VOICE_STREAM;
  delete process.env.TUTOR_VOICE_PICKER;
  check('switch off: the stream route and the picker route are not there', (await req('POST', '/api/tutor/dock/stream', { messages: [{ role: 'user', content: 'hi' }], page }, paid.id)).status === 404 && (await req('PUT', '/api/tutor/dock/voice', { voice: 'Aria' }, paid.id)).status === 404);
  call.noteReply(paid.id, 'One line.');
  const s2 = sent.length;
  await call.say(paid, c.call_id, 'One line.');
  check('picker off: the voice it always had', sent[s2].body.voice === 'Aria');
  server.close();

  console.log('the page');
  const dockSrc = fs.readFileSync(path.join(__dirname, '../public/js/tutor-dock.js'), 'utf8');
  check('the call gets the streamed ask only when the server says so', /askStream: callInfo\.stream \?/.test(dockSrc));
  check('the picker shows only when the server sends choices, and saves through the route', /status\.call\.voices/.test(dockSrc) && /\/api\/tutor\/dock\/voice/.test(dockSrc));
  check('the ack sound is made in the page and only with the switch', /if \(info\.ack\) scheduleAck/.test(src) && !/fetch\([^)]*ack/i.test(src));
  const lookCss = fs.readFileSync(path.join(__dirname, '../public/css/ui2/look.css'), 'utf8');
  check('the picker has the UI_V2 look (pill, line, act focus)', /html\[data-ui2\] \.tdock-voice select \{[^}]*border-radius: 999px/.test(lookCss) && /tdock-voice select:focus \{[^}]*var\(--act\)/.test(lookCss));

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
