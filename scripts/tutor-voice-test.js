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

let failures = 0;
function check(label, ok, detail) {
  if (ok) { console.log(`  ok   ${label}`); return; }
  failures++;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 300)}`}`);
}

const sent = [];
let reply = () => new Response(Buffer.from('ID3fakeaudio'), { status: 200, headers: { 'content-type': 'audio/mpeg' } });
global.fetch = async (url, init) => { sent.push({ url, body: JSON.parse(init.body) }); return reply(); };

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
