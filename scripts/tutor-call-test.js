/**
 * The voice call's server side (services/tutor-call.js, /api/tutor/call/*): who may call, the limits, the ledger, and that only checked words are spoken.
 *
 *   node scripts/tutor-call-test.js
 *
 * Throwaway database and ledger, fetch mocked: nothing is sent and nothing is spent. The browser side is scripts/tutor-giraffe-browser-test.js (Playwright, not in the npm suite).
 */
const os = require('os');
const path = require('path');
const fs = require('fs');
const http = require('http');

process.env.NODE_ENV = 'test';
const tmp = path.join(os.tmpdir(), `tutor-call-test-${process.pid}`);
fs.mkdirSync(tmp, { recursive: true });
process.env.DB_FILE = path.join(tmp, 'db.json');
process.env.HOLDOUT_DIR = tmp;
process.env.LLMGATEWAY_LEDGER_FILE = path.join(tmp, 'ledger.json');
process.env.LLMGATEWAY_API_KEY = 'test-key';
process.env.TUTOR_FULL = '0';

let failures = 0;
function check(label, ok, detail) {
  if (ok) { console.log(`  ok   ${label}`); return; }
  failures += 1;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 300)}`}`);
}
const fails = async (p) => { try { await p; return null; } catch (e) { return e; } };

const sent = [];
let reply = (url) => (/speech/.test(url) ? new Response(Buffer.from('ID3fakeaudio'), { status: 200, headers: { 'content-type': 'audio/mpeg' } }) : new Response(JSON.stringify({ text: 'what is x' }), { status: 200, headers: { 'content-type': 'application/json' } }));
global.fetch = async (url, init) => { sent.push({ url, body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body }); return reply(url); };

const express = require('express');
const db = require('../config/db');
const ai = require('../services/ai');
const calls = [];
ai.talk = async (opts) => { calls.push(opts); return 'Try splitting it into two steps. What is the first one?'; };
const call = require('../services/tutor-call');
const ledger = require('../services/llmgateway-ledger');
const tutorMode = require('../services/tutor-mode');
const costTracker = require('../services/cost-tracker');
const tracked = [];
const realRecord = costTracker.recordAi;
costTracker.recordAi = (row) => { tracked.push(row); return realRecord(row); };

const wav = (seconds) => {
  const rate = 16000; const n = Math.floor(rate * seconds); const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  return b;
};

const adult = db.insert('users', { email: 'a@example.test', display_name: 'A', age_check: { needs_parent: false } });
const paid = db.insert('users', { email: 'p@example.test', display_name: 'P', age_check: { needs_parent: false } });
const noAge = db.insert('users', { email: 'n@example.test', display_name: 'N' });
const pendingKid = db.insert('users', { email: 'k@example.test', display_name: 'K', age_check: { needs_parent: true } });
const consent = (settings, scopes) => db.insert('parental_consents', { status: 'active', settings, scopes: scopes || [], history: [] });
const kidMicOff = db.insert('users', { email: 'k2@example.test', display_name: 'K2', age_check: { needs_parent: true }, consent_id: consent({ camera_mic_off: true }).id });
const kidNoAi = db.insert('users', { email: 'k3@example.test', display_name: 'K3', age_check: { needs_parent: true }, consent_id: consent({}).id });
process.env.SPANISH_GATEWAY_USERS = String(paid.id);

(async () => {
  console.log('who may call');
  check('an adult may, with the browser\'s free speech', call.info(adult).allowed && call.info(adult).speech === 'browser');
  check('an adult on the gateway list gets the paid speech', call.info(paid).allowed && call.info(paid).speech === 'gateway');
  for (const [name, u, word] of [['no age answer yet', noAge, /not available/i], ['a child waiting for a parent', pendingKid, /parent or guardian/i], ['a child with camera and mic off', kidMicOff, /parent or guardian/i], ['a child with no outside AI opt-in', kidNoAi, /outside AI/i]]) {
    const i = call.info(u);
    check(`${name}: no call, plain words why`, !i.allowed && word.test(i.why) && i.speech === 'browser', i);
    const e = await fails(Promise.resolve().then(() => call.start(u)));
    check(`${name}: the server refuses to start one`, e && e.status === 403);
  }
  check('with no mic permission, the status says no mic', call.info(pendingKid).mic === false && call.info(kidMicOff).mic === false);
  check('a child on the gateway list without consent still gets nothing', (() => { process.env.SPANISH_GATEWAY_USERS = `${paid.id},${pendingKid.id}`; const i = call.info(pendingKid); process.env.SPANISH_GATEWAY_USERS = String(paid.id); return !i.allowed && i.speech === 'browser'; })());

  console.log('limits');
  check('the hard limits are as documented', call.LIMITS.call_s === 600 && call.LIMITS.day_s === 1800 && call.LIMITS.day_usd === 0.5 && call.LIMITS.silence_warn_s === 20 && call.LIMITS.silence_end_s === 35);
  process.env.TUTOR_CALL_MAX_S = '99999';
  check('the environment can lower a limit, never raise it', call.limits().call_s === 600);
  process.env.TUTOR_CALL_MAX_S = '60';
  check('lowered', call.limits().call_s === 60);
  delete process.env.TUTOR_CALL_MAX_S;
  const c1 = call.start(adult);
  check('a call gets an id, a length, the quiet limits', c1.call_id && c1.max_s === 600 && c1.silence_end_s === 35, c1);
  const c2 = call.start(adult);
  check('one open call per learner: a new one closes the old', call._open.get(adult.id).id === c2.call_id);
  const stale = await fails(call.say(adult, c1.call_id, 'x'));
  check('the old call is refused', stale && stale.status === 409);
  // Time: pretend this call started 11 minutes ago.
  call._open.get(adult.id).started -= 11 * 60 * 1000;
  const over = await fails(call.hear(adult, c2.call_id, wav(1)));
  check('past the length limit the server stops it, whatever the page does', over && over.status === 429 && !call._open.has(adult.id), over && over.message);
  check('and the time counts against the day', call.usage(adult.id).seconds >= 590, call.usage(adult.id));
  db.upsert('tutor_call_usage', (r) => r.user_id === adult.id && r.day === new Date().toISOString().slice(0, 10), () => ({ user_id: adult.id, seconds: 1799 }));
  const dayOver = await fails(Promise.resolve().then(() => call.start(adult)));
  check('the day\'s minutes used: no new call, plain words, from the database (a restart can\'t reset it)', dayOver && dayOver.status === 429 && /today/i.test(dayOver.why), dayOver && dayOver.message);

  console.log('paid speech: the ledger and the dollar limit');
  const c3 = call.start(paid);
  const said0 = sent.length;
  const notSaid = await fails(call.say(paid, c3.call_id, 'Buy more credits now, this was never checked.'));
  check('words the tutor\'s route did not return are never spoken, and cost nothing', notSaid && notSaid.status === 403 && sent.length === said0, notSaid && notSaid.message);
  call.noteReply(paid.id, 'Try splitting it into two steps. What is the first one?');
  const usd0 = ledger.status().spent_usd;
  const mp3 = await call.say(paid, c3.call_id, 'What is the first one?');
  check('a sentence of a checked reply is spoken', Buffer.isBuffer(mp3) && mp3.length > 0);
  check('with the low-latency voice', sent[sent.length - 1].body.model === 'eleven-flash-v2-5' && sent[sent.length - 1].url.endsWith('/audio/speech'), sent[sent.length - 1].body);
  const ttsCost = ledger.status().spent_usd - usd0;
  check('it went through the ledger at its price ($0.055 per 1K characters, x1.15)', Math.abs(ttsCost - (22 / 1000) * 0.055 * 1.15) < 0.0001, ttsCost);
  const noticeOk = await call.say(paid, c3.call_id, call.NOTICES.still_there);
  check('the fixed notices may be spoken', Buffer.isBuffer(noticeOk));
  const u1 = call.usage(paid.id);
  check('and the dollars are on the learner\'s row', u1.usd > 0 && u1.chars > 0, u1);
  check('the cost tracker saw it on the learner\'s account, with no words', tracked.some((t) => t.userId === paid.id && t.task === 'voice_tts' && t.costUsd > 0 && !('text' in t)), tracked.slice(-1));
  const usd1 = ledger.status().spent_usd;
  const heard = await call.hear(paid, c3.call_id, wav(3));
  check('listening: the clip goes out and the words come back', heard.text === 'what is x', heard);
  const sttCost = ledger.status().spent_usd - usd1;
  check('billed by the clip\'s real seconds ($0.10 an hour, x1.15), not over-counted from a WAV\'s size', Math.abs(sttCost - Math.max(0.0001, (3 / 3600) * 0.1 * 1.15)) < 0.00005, sttCost);
  check('a WAV\'s length comes from its own header', Math.abs(call.wavSeconds(wav(2.5)) - 2.5) < 0.01 && call.wavSeconds(Buffer.from('not a wav at all, not at all, not at all, not at all')) === null);
  const notAudio = await fails(call.hear(paid, c3.call_id, Buffer.from('plain text, not audio, plain text, not audio, plain text')));
  check('not a clip: 400, no call', notAudio && notAudio.status === 400);
  const tooLong = await fails(call.hear(paid, c3.call_id, wav(50)));
  check('a clip over the limit: refused', tooLong && tooLong.status === 413);
  const browserSay = await fails(Promise.resolve().then(() => { call.noteReply(adult.id, 'hello there'); return call.say(adult, 'none', 'hello there'); }));
  check('an account not on the list has no open paid route', browserSay && browserSay.status === 409);
  const n0 = sent.length;
  process.env.TUTOR_CALL_DAY_USD = String(call.usage(paid.id).usd);
  const usdOver = await fails(call.say(paid, c3.call_id, 'What is the first one?'));
  check('past the learner\'s dollars: refused before any call, so the page drops to the browser\'s voice', usdOver && usdOver.status === 429 && sent.length === n0, usdOver && usdOver.message);
  const hearOver = await fails(call.hear(paid, c3.call_id, wav(1)));
  check('and the same for listening', hearOver && hearOver.status === 429 && sent.length === n0);
  delete process.env.TUTOR_CALL_DAY_USD;

  console.log('ending, and what is kept');
  const ended = call.end(paid, c3.call_id, { reason: 'tap', listen: 'gateway', speak: 'gateway', turns: [{ detect_ms: 680, stt_ms: 200, reply_ms: 2000, audio_ms: 300, total_ms: 3180, words: 'never kept' }, 'junk'] });
  check('end closes it', ended.ended && !call._open.has(paid.id));
  const row = db.find('tutor_call_log', (r) => r.user_id === paid.id)[0];
  check('the log has numbers only, never words', row && row.turns.length === 1 && row.turns[0].total_ms === 3180 && !JSON.stringify(row).includes('never kept'), row);
  check('a stranger\'s call id ends nothing', call.end(paid, 'nope', {}).ended === false);
  const deleteLists = fs.readFileSync(path.join(__dirname, '../routes/consent.js'), 'utf8') + fs.readFileSync(path.join(__dirname, '../routes/profile.js'), 'utf8');
  check('voice usage leaves with the account', (deleteLists.match(/tutor_call_usage/g) || []).length >= 2 && (deleteLists.match(/tutor_call_log/g) || []).length >= 2);

  console.log('routes');
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.user = db.byId('users', Number(req.headers['x-user'])) || null; next(); });
  app.use('/api', require('../routes/tutor'));
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const { port } = server.address();
  const req = (method, url, body, uid, raw) => new Promise((ok, no) => {
    const data = raw || (body ? JSON.stringify(body) : null);
    const q = http.request({ host: '127.0.0.1', agent: false, port, path: url, method, headers: { 'content-type': raw ? 'audio/wav' : 'application/json', 'x-user': String(uid || ''), ...(data ? { 'content-length': data.length } : {}) } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => { const b = Buffer.concat(chunks); let json = null; try { json = JSON.parse(b.toString()); } catch { /* audio */ } ok({ status: res.statusCode, json, body: b, type: res.headers['content-type'] }); });
    });
    q.on('error', no);
    if (data) q.write(data);
    q.end();
  });
  check('status: the call block and the side are there', (await (async () => { const s = await req('GET', '/api/tutor/dock?path=/dashboard', null, paid.id); return s.json.call.speech === 'gateway' && s.json.side === 'bottom' && s.json.mic === true; })()));
  const kidStatus = await req('GET', '/api/tutor/dock?path=/dashboard', null, pendingKid.id);
  check('status: a child without consent has no mic and no stt', kidStatus.json.mic === false && kidStatus.json.stt === false && kidStatus.json.call.allowed === false, kidStatus.json);
  check('PUT side keeps it on the account', (await req('PUT', '/api/tutor/dock/side', { side: 'top' }, paid.id)).json.side === 'top' && tutorMode.getSide(paid.id) === 'top' && (await req('GET', '/api/tutor/dock?path=/x', null, paid.id)).json.side === 'top');
  check('setting the side leaves the voice mode alone, and the mode leaves the side alone', (tutorMode.set(paid.id, 'voice'), tutorMode.getSide(paid.id) === 'top' && tutorMode.get(paid.id) === 'voice'));
  check('PUT with a bad side is a 400, signed out refused', (await req('PUT', '/api/tutor/dock/side', { side: 'left' }, paid.id)).status === 400 && [401, 403].includes((await req('PUT', '/api/tutor/dock/side', { side: 'top' })).status));
  check('a child: the route refuses with plain words', await (async () => { const r = await req('POST', '/api/tutor/call/start', {}, pendingKid.id); return r.status === 403 && /parent or guardian/i.test(r.json.error); })());
  check('signed out: refused', [401, 403].includes((await req('POST', '/api/tutor/call/start', {})).status));

  console.log('a voice reply is a chat reply: same route, same safety, same fact check');
  const started = (await req('POST', '/api/tutor/call/start', {}, paid.id)).json;
  const page = { path: '/dashboard', title: 'Home', heading: 'Hi', text: 'Today' };
  const before = calls.length;
  const r1 = await req('POST', '/api/tutor/dock', { messages: [{ role: 'user', content: 'what is x' }], page, input_mode: 'voice' }, paid.id);
  const asked = calls[before];
  check('a call turn goes through the dock route to the same task, with the fact-check source', r1.status === 200 && asked && asked.task === 'dock_help' && typeof asked.factSource === 'string' && asked.userId === paid.id, asked && asked.task);
  check('with the spoken-style note, and the learner\'s context and memory', /will be spoken aloud/.test(asked.system) && /WHAT YOU KNOW/.test(asked.system));
  check('and the tutor remembers it', (require('../services/tutor').view(paid.id).turns || []).some((t) => /what is x/.test(t.content))); // eslint-disable-line global-require
  const okSay = await req('POST', '/api/tutor/call/say', { call: started.call_id, text: 'What is the first one?' }, paid.id);
  check('those words may be spoken, as audio', okSay.status === 200 && /audio\/mpeg/.test(okSay.type), okSay.status);
  const n1 = calls.length;
  const crisis = await req('POST', '/api/tutor/dock', { messages: [{ role: 'user', content: 'i want to kill myself' }], page, input_mode: 'voice' }, paid.id);
  check('a crisis said aloud gets the fixed safety reply, with no model', crisis.json.source === 'safety' && calls.length === n1 && /988|trusted adult/i.test(crisis.json.reply), crisis.json);
  const crisisSay = await req('POST', '/api/tutor/call/say', { call: started.call_id, text: crisis.json.reply }, paid.id);
  check('and that reply may be spoken', crisisSay.status === 200, crisisSay.status);
  const offWords = await req('POST', '/api/tutor/call/say', { call: started.call_id, text: 'Something the tutor never said.' }, paid.id);
  check('anything else may not', offWords.status === 403);
  const offPage = await req('POST', '/api/tutor/dock', { messages: [{ role: 'user', content: 'hi' }], page: { path: '/spanish-check' }, input_mode: 'voice' }, paid.id);
  check('a sealed test stays sealed for voice too', offPage.status === 403);
  const heardRoute = await req('POST', `/api/tutor/call/hear?call=${started.call_id}&lang=en`, null, paid.id, wav(1));
  check('hear route: words back, no store', heardRoute.status === 200 && heardRoute.json.text === 'what is x', heardRoute.json);
  const big = await req('POST', `/api/tutor/call/hear?call=${started.call_id}`, null, paid.id, Buffer.alloc(1700000));
  check('hear route: over the size limit is refused', big.status >= 400 && big.status < 500 && big.status !== 200, big.status);
  check('end route', (await req('POST', '/api/tutor/call/end', { call: started.call_id, reason: 'tap' }, paid.id)).json.ended === true);
  server.close();

  // Last: the ledger's refusal makes the gateway rest for ten minutes.
  const c9 = call.start(paid);
  call.noteReply(paid.id, 'One more line.');
  const n9 = sent.length;
  process.env.LLMGATEWAY_CAP_USD = '0';
  const capped = await fails(call.say(paid, c9.call_id, 'One more line.'));
  check('past the $5 ledger: refused before any call', capped && capped.status === 402 && sent.length === n9, capped && capped.message);
  delete process.env.LLMGATEWAY_CAP_USD;
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
