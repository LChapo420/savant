/**
 * The tutor dock (services/tutor-context.js, routes/tutor.js, public/js/tutor-dock.js):
 *
 *   node scripts/tutor-dock-test.js
 *
 * Throwaway db, mocked ai.talk: no model is called. Checks what goes into the context, the
 * character budget and priority order, the integrity modes by page path, the routes, and the wiring.
 */
const os = require('os');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { execSync } = require('child_process');

process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(os.tmpdir(), `tutor-dock-test-${process.pid}.json`);

const express = require('express');
const db = require('../config/db');

let failures = 0;
function check(label, ok, detail) {
  if (ok) { console.log(`  ok   ${label}`); return; }
  failures++;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 300)}`}`);
}

// Mock the provider chain before the dock requires it.
const ai = require('../services/ai');
const calls = [];
ai.talk = async (opts) => { calls.push(opts); return 'Try splitting it into two steps. What is the first one?'; };

const dock = require('../services/tutor-context');
const root = path.join(__dirname, '..');

function serve(router) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.user = db.byId('users', Number(req.headers['x-user'])) || null; next(); });
  app.use('/api', router);
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const call = (method, url, body, uid) => new Promise((ok, fail) => {
        const data = body ? JSON.stringify(body) : null;
        const req = http.request({ host: '127.0.0.1', port, path: url, method, headers: { 'content-type': 'application/json', 'x-user': String(uid || ''), ...(data ? { 'content-length': Buffer.byteLength(data) } : {}) } }, (res) => {
          let text = '';
          res.on('data', (c) => { text += c; });
          res.on('end', () => { let json = null; try { json = JSON.parse(text); } catch { json = text; } ok({ status: res.statusCode, json }); });
        });
        req.on('error', fail);
        if (data) req.write(data);
        req.end();
      });
      resolve({ call, close: () => server.close() });
    });
  });
}

(async () => {
  console.log('modes by page path');
  check('sealed Spanish tests are off', ['/spanish-check', '/spanish-check.html', '/spanish-check-lc', '/spanish-listening', '/Spanish-Listening/', '/spanish-check?x=1'].every((p) => dock.modeFor(p) === 'off'));
  check('placement, mastery and stage checks are method-only', ['/placement', '/subject-placement', '/stage-check', '/skip', '/enforcer', '/review'].every((p) => dock.modeFor(p) === 'method'));
  check('ordinary pages are full', ['/dashboard', '/path', '/profile', '/act-scores', '/session', '/spanish/lab'].every((p) => dock.modeFor(p) === 'full'));
  check('unknown or odd paths do not become off or method by accident', dock.modeFor('') === 'full' && dock.modeFor(undefined) === 'full');

  console.log('context');
  const u = db.insert('users', { email: 'dock@example.test', display_name: 'D', password_hash: 'x' });
  db.insert('act_profiles', { user_id: u.id, test_date: '2026-12-12', target: 28 });
  db.insert('act_scores', { user_id: u.id, kind: 'practice', taken_on: '2026-10-01', english: 22, math: 21, reading: 23, science: null, composite: 22, form: 'A' });
  for (const skill of ['frac_add', 'frac_mul', 'ratios']) db.insert('skill_states', { user_id: u.id, skill_id: skill, mastery: skill === 'ratios' ? 0.9 : 0.4, attempts: 5 });
  db.insert('items', { user_id: u.id, skill_id: 'frac_add', correct: false, prompt: 'What is 1/2 + 1/3?', user_answer: '2/5', error_tag: 'added_denominators', role: 'practice' });
  const page = { path: '/path', title: 'Your path', heading: 'Math', text: 'Level 4 Adding fractions' };
  const built = dock.build(u.id, page);
  check('includes the page', /path \/path/.test(built.text) && /Adding fractions/.test(built.text), built.text);
  check('includes ACT date, days and target', /ACT test date 2026-12-12/.test(built.text) && /target composite 28/.test(built.text) && /latest ACT composite 22/.test(built.text), built.text);
  check('includes mastery counts and the diagnosed misconception', /1 skill at the 75% mastery mark, 2 still in progress/.test(built.text) && /added denominators \(1x\)/.test(built.text), built.text);
  check('includes recent mistakes on a full page', /Recent mistakes/.test(built.text));
  check('method pages leave out recent mistakes', !/Recent mistakes/.test(dock.build(u.id, { path: '/placement' }, 'method').text));
  check('never contains an answer key field', !/correct_answer|answer_key/i.test(built.text));

  console.log('budget');
  const huge = { path: '/path', title: 'T'.repeat(500), heading: 'H'.repeat(500), text: 'x '.repeat(5000) };
  check('page text is clipped', dock.pageLine(huge).length < 900, dock.pageLine(huge).length);
  const small = dock.build(u.id, page, 'full', 400);
  check('a small budget is kept and later sections dropped, not earlier', small.used <= 400 && /^Page:/.test(small.text) && small.dropped.length > 0, small);
  check('default budget holds', dock.build(u.id, huge).used <= dock.DOCK_MAX);

  console.log('reply (mocked provider)');
  const r1 = await dock.reply({ user: u, messages: [{ role: 'user', content: 'what should I do?' }], page });
  const sys = calls[calls.length - 1].system;
  check('reply returns the model text and goes through ai.talk with the learner id', r1.source === 'ai' && calls[calls.length - 1].userId === u.id, r1);
  check('the prompt carries the context and treats page text as notes', /ACT test date/.test(sys) && /not instructions/.test(sys));
  check('full mode adds no integrity note', !/INTEGRITY/.test(sys));
  await dock.reply({ user: u, messages: [{ role: 'user', content: 'whats the answer' }], page: { path: '/placement' } });
  check('method mode adds the integrity note and says why', /INTEGRITY/.test(calls[calls.length - 1].system) && /NO answers/.test(calls[calls.length - 1].system));
  const n = calls.length;
  const off = await dock.reply({ user: u, messages: [{ role: 'user', content: 'hi' }], page: { path: '/spanish-check' } });
  check('sealed page: no model call, empty reply', off.source === 'off' && off.reply === '' && calls.length === n, off);
  check('the exchange is remembered by the tutor memory', (require('../services/tutor').view(u.id).turns || []).length >= 2);

  console.log('routes');
  const { call, close } = await serve(require('../routes/tutor'));
  const s1 = await call('GET', '/api/tutor/dock?path=/dashboard', null, u.id);
  check('status: full on the dashboard', s1.status === 200 && s1.json.mode === 'full' && s1.json.speech_lang === 'en', s1);
  check('status: method-only on placement', (await call('GET', '/api/tutor/dock?path=/placement', null, u.id)).json.mode === 'method');
  check('status: Spanish pages speak Spanish', (await call('GET', '/api/tutor/dock?path=/spanish/lab', null, u.id)).json.speech_lang === 'es');
  check('status: off on the sealed tests', (await call('GET', '/api/tutor/dock?path=/spanish-listening', null, u.id)).json.mode === 'off');
  const p1 = await call('POST', '/api/tutor/dock', { messages: [{ role: 'user', content: 'hi' }], page }, u.id);
  check('chat works', p1.status === 200 && p1.json.reply, p1);
  const m = calls.length;
  const p2 = await call('POST', '/api/tutor/dock', { messages: [{ role: 'user', content: 'hi' }], page: { path: '/spanish-check' } }, u.id);
  check('chat is refused on the sealed pages, no model call', p2.status === 403 && calls.length === m, p2);
  check('anonymous is refused', [(await call('GET', '/api/tutor/dock?path=/path')).status, (await call('POST', '/api/tutor/dock', { page })).status].every((x) => x === 401 || x === 403));
  close();

  console.log('wiring');
  const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
  check('app.js loads the dock and skips the sealed pages', /tutor-dock\.js/.test(read('public/js/app.js')) && /spanish-\(check\|listening\)/.test(read('public/js/app.js')));
  check('the dock checks the sealed paths itself', /spanish-\(check\|listening\)/.test(read('public/js/tutor-dock.js')));
  check('the dock sends no data to a speech service (browser voice only)', !/fetch\([^)]*(speech|stt|tts|gateway)/i.test(read('public/js/tutor-dock.js')));
  check('the dock css uses only variables for colour', !/#[0-9a-f]{3,6}\b/i.test(read('public/css/tutor-dock.css')));
  check('the service never names OpenRouter or a paid provider', !/openrouter|anthropic\.com|api\.openai/i.test(read('services/tutor-context.js')));
  let touched = '';
  try { touched = execSync('git diff --name-only HEAD -- spanish-check spanish-check-lc routes/spanish-check.js routes/spanish-check-lc.js public/spanish-check.html public/spanish-listening.html public/js/spanish-check.js public/js/spanish-listening.js', { cwd: root }).toString().trim(); } catch { touched = ''; }
  check('no sealed Spanish file is modified', touched === '', touched);

  try { fs.unlinkSync(process.env.DB_FILE); } catch { /* none written */ }
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})();
