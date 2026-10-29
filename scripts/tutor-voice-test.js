/**
 * The tutor's gateway voice (services/spanish/voice.js tutorSpeak, POST /api/tutor/speak):
 *
 *   node scripts/tutor-voice-test.js
 *
 * fetch is mocked and the ledger is a temp file: nothing is sent and nothing is spent.
 */
const os = require('os');
const path = require('path');
const fs = require('fs');
const http = require('http');

process.env.NODE_ENV = 'test';
const tmp = path.join(os.tmpdir(), `tutor-voice-test-${process.pid}`);
fs.mkdirSync(tmp, { recursive: true });
process.env.LLMGATEWAY_LEDGER_FILE = path.join(tmp, 'ledger.json');
process.env.LLMGATEWAY_API_KEY = 'test-key';
process.env.SPANISH_GATEWAY_USERS = '7';
process.env.HOLDOUT_DIR = tmp;
process.env.TUTOR_GATEWAY_DAILY_CHARS = '100';
process.env.TUTOR_GATEWAY_DAILY_STT_BYTES = '40000';

let failures = 0;
function check(label, ok, detail) {
  if (ok) { console.log(`  ok   ${label}`); return; }
  failures++;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 300)}`}`);
}

const sent = [];
let reply = () => new Response(Buffer.from('ID3fakeaudio'), { status: 200, headers: { 'content-type': 'audio/mpeg' } });
global.fetch = async (url, init) => { sent.push({ url, body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body }); return reply(); };

const express = require('express');
const voice = require('../services/spanish/voice');
const ledger = require('../services/llmgateway-ledger');
const router = require('../routes/tutor');

async function fails(p) { try { await p; return null; } catch (e) { return e; } }

(async () => {
  const mp3 = await voice.tutorSpeak('Try splitting it in two.', { userId: 7, lang: 'en' });
  check('an opted-in learner gets audio', Buffer.isBuffer(mp3) && mp3.length > 0);
  check('English is asked for in English', sent[0].body.language === 'en' && sent[0].url.endsWith('/audio/speech'), sent[0]);
  check('the call went through the ledger', ledger.status().calls === 1 && ledger.status().spent_usd > 0, ledger.status());

  const off = await fails(voice.tutorSpeak('hi', { userId: 8 }));
  check('an account not on the list is refused with no call', off && off.status === 503 && sent.length === 1, off && off.message);

  const big = await fails(voice.tutorSpeak('x'.repeat(90), { userId: 7 }));
  check('past the learner\'s daily characters is a 429, no call', big && big.status === 429 && sent.length === 1, big && big.message);

  const empty = await fails(voice.tutorSpeak('  ', { userId: 7 }));
  check('empty text is a 400', empty && empty.status === 400);

  // The route.
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.user = req.headers['x-user'] ? { id: Number(req.headers['x-user']) } : null; next(); });
  app.use('/api', router);
  const server = http.createServer(app).listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api/tutor/speak`;
  const realFetch = global.fetch;
  const post = (user, body) => new Promise((resolve) => {
    const data = JSON.stringify(body);
    const req = http.request(base, { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data), ...(user ? { 'x-user': user } : {}) } }, (res) => {
      const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], body: Buffer.concat(chunks) }));
    });
    req.end(data);
  });
  global.fetch = realFetch; // the route uses the mock above; http.request is unaffected
  const ok = await post('7', { text: 'Nice work.', lang: 'en' });
  check('route: audio/mpeg for an opted-in learner', ok.status === 200 && /audio\/mpeg/.test(ok.type), ok.status);
  const no = await post('8', { text: 'Nice work.' });
  check('route: 503 for everyone else (the browser voice takes over)', no.status === 503);
  const none = await post(null, { text: 'x' });
  check('route: signed-out is refused', none.status === 401 || none.status === 403, none.status);

  const dockSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'tutor-dock.js'), 'utf8');
  check('dock asks for the better voice and falls back to the browser one', /\/api\/tutor\/speak/.test(dockSrc) && /browserSay\(text\)/.test(dockSrc));

  // Speech to text (push-to-talk).
  const wav = (n) => Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE'), Buffer.alloc(n)]);
  reply = () => new Response(JSON.stringify({ text: ' How do I add fractions? ' }), { status: 200, headers: { 'content-type': 'application/json' } });
  const n0 = sent.length;
  const calls0 = ledger.status().calls;
  const heard = await voice.tutorTranscribe(wav(8000), { userId: 7, lang: 'en' });
  check('stt: an opted-in learner gets a transcript', heard === 'How do I add fractions?', heard);
  check('stt: sent to /audio/transcriptions in English through the ledger', sent.length === n0 + 1 && sent[n0].url.endsWith('/audio/transcriptions') && sent[n0].body.get('language') === 'en' && ledger.status().calls === calls0 + 1, sent[n0] && sent[n0].url);
  check('stt: sniffs the container from the bytes', voice.audioKind(wav(4)) === 'wav' && voice.audioKind(Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(20)])) === 'webm' && voice.audioKind(Buffer.from('<html>not audio at all</html>')) === null);
  const notAudio = await fails(voice.tutorTranscribe(Buffer.from('hello hello hello hello'), { userId: 7 }));
  check('stt: not audio is a 400, no call', notAudio && notAudio.status === 400 && sent.length === n0 + 1);
  const sttOff = await fails(voice.tutorTranscribe(wav(100), { userId: 8 }));
  check('stt: an account not on the list is refused with no call', sttOff && sttOff.status === 503 && sent.length === n0 + 1);
  const sttBig = await fails(voice.tutorTranscribe(wav(40000), { userId: 7 }));
  check('stt: past the learner\'s daily bytes is a 429, no call', sttBig && sttBig.status === 429 && sent.length === n0 + 1);
  const postAudio = (user, body, query = '') => new Promise((resolve) => {
    const req = http.request(base.replace('/speak', '/transcribe') + query, { method: 'POST', headers: { 'content-type': 'application/octet-stream', 'content-length': body.length, ...(user ? { 'x-user': user } : {}) } }, (res) => {
      const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => { let json = null; try { json = JSON.parse(Buffer.concat(chunks)); } catch { /* none */ } resolve({ status: res.statusCode, json }); });
    });
    req.end(body);
  });
  const rt = await postAudio('7', wav(2000), '?lang=es');
  check('stt route: text for an opted-in learner', rt.status === 200 && rt.json.text === 'How do I add fractions?', rt);
  check('stt route: the language is passed on', sent[sent.length - 1].body.get('language') === 'es');
  check('stt route: 503 for everyone else', (await postAudio('8', wav(2000))).status === 503);
  check('stt route: text that is not audio is 400', (await postAudio('7', Buffer.from('plain text, not audio'))).status === 400);
  check('stt route: signed-out is refused', [401, 403].includes((await postAudio(null, wav(2000))).status));
  check('stt route: over 1 MB is refused', (await postAudio('7', wav(1100000))).status >= 400);
  check('dock records with MediaRecorder only when the server offers it and falls back to the browser recognizer', /status\.stt/.test(dockSrc) && /\/api\/tutor\/transcribe/.test(dockSrc) && /new Recog\(\)/.test(dockSrc));
  reply = () => new Response(Buffer.from('ID3fakeaudio'), { status: 200, headers: { 'content-type': 'audio/mpeg' } });

  const before = sent.length;
  process.env.LLMGATEWAY_CAP_USD = '0';
  const capped = await fails(voice.tutorSpeak('ok', { userId: 7 }));
  check('past the $5 ledger is refused (402) before any call', capped && capped.status === 402 && sent.length === before, capped && capped.message);
  delete process.env.LLMGATEWAY_CAP_USD;

  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(failures ? `\n${failures} failed` : '\nall passed');
  process.exit(failures ? 1 : 0);
})();
