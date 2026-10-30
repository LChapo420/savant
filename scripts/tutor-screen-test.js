/**
 * Tutor modes and "sees the screen" (services/tutor-mode.js, tutor-screen.js, tutor-vision.js,
 * public/js/tutor-snapshot.js, public/js/tutor-dock.js):
 *
 *   node scripts/tutor-screen-test.js
 *
 * Throwaway db, mocked ai.talk and a mocked pool: no model is called, nothing is spent.
 */
const os = require('os');
const path = require('path');
const fs = require('fs');
const http = require('http');

process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(os.tmpdir(), `tutor-screen-test-${process.pid}.json`);

const express = require('express');
const { JSDOM } = require('jsdom');
const db = require('../config/db');

let failures = 0;
function check(label, ok, detail) {
  if (ok) { console.log(`  ok   ${label}`); return; }
  failures++;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 300)}`}`);
}

const ai = require('../services/ai');
const calls = [];
ai.talk = async (opts) => { if (!/long-term notes on one learner/.test(opts.system || '')) calls.push(opts); return 'Look at the denominators first. What do you notice?'; };

const mode = require('../services/tutor-mode');
const screen = require('../services/tutor-screen');
const vision = require('../services/tutor-vision');
const dock = require('../services/tutor-context');
const Snap = require('../public/js/tutor-snapshot');
const root = path.join(__dirname, '..');

const HTML = `<!doctype html><html lang="en"><body>
<header><h1>Site header</h1></header>
<main>
  <h1>Adding fractions</h1>
  <p class="question">What is 1/2 + 1/3?</p>
  <div role="radiogroup">
    <div role="radio" aria-checked="false">2/5</div>
    <div role="radio" aria-checked="true">5/6</div>
    <div role="radio" aria-checked="false">1/6</div>
  </div>
  <label for="why">Your reasoning</label><input id="why" type="text" value="common denominator 6">
  <input type="password" value="hunter2"><input type="hidden" value="csrf-token">
  <div role="status">Not quite. Check your common denominator.</div>
  <canvas id="board" width="400" height="400" aria-label="chess board"></canvas>
  <p style="display:none">hidden text</p>
  <section class="tdock-panel">tutor panel text</section>
</main><footer>Footer</footer></body></html>`;

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
  const u = db.insert('users', { email: 'screen@example.test', display_name: 'S', password_hash: 'x' });
  const other = db.insert('users', { email: 'other@example.test', display_name: 'O', password_hash: 'x' });

  console.log('mode memory');
  check('default is text', mode.get(u.id) === 'text');
  mode.set(u.id, 'voice');
  check('remembers voice, per learner', mode.get(u.id) === 'voice' && mode.get(other.id) === 'text');
  mode.set(u.id, 'banana');
  check('ignores unknown modes', mode.get(u.id) === 'voice');
  mode.set(u.id, 'text');
  check('last message wins and is stored once per learner', mode.get(u.id) === 'text' && db.find('tutor_modes', (r) => r.user_id === u.id).length === 1);

  console.log('snapshot builder (jsdom)');
  const dom = new JSDOM(HTML, { pretendToBeVisual: true });
  const snap = Snap.build(dom.window.document.querySelector('main'));
  check('reads the question', snap.blocks.some((b) => /1\/2 \+ 1\/3/.test(b)), snap);
  check('reads the choices and which is selected', snap.choices.length === 3 && snap.choices.find((c) => c.selected).text === '5/6', snap.choices);
  check('reads what was typed, with its label', snap.inputs.some((i) => i.label === 'Your reasoning' && /common denominator/.test(i.value)), snap.inputs);
  check('never reads password or hidden fields', !JSON.stringify(snap).match(/hunter2|csrf-token/));
  check('reads the feedback shown', snap.feedback.some((f) => /Not quite/.test(f)), snap.feedback);
  check('notes the canvas as a picture', snap.visuals.some((v) => v.kind === 'canvas' && v.label === 'chess board'), snap.visuals);
  check('skips hidden text and the dock itself', !JSON.stringify(snap).match(/hidden text|tutor panel text/));
  check('has a scroll position', snap.scroll && typeof snap.scroll.percent === 'number');
  check('is small', JSON.stringify(snap).length < 3000, JSON.stringify(snap).length);

  console.log('server side of the snapshot');
  const t = screen.text(snap, 'full');
  check('full mode shows selection, typing and feedback', /selected: "5\/6"/.test(t) && /Your reasoning = "common denominator 6"/.test(t) && /Not quite/.test(t), t);
  const nt = screen.text(snap, 'method');
  check('no-answers mode keeps the question and choices', /1\/2 \+ 1\/3/.test(nt) && /"2\/5"/.test(nt), nt);
  check('no-answers mode drops the pick, the typing and the feedback', !/selected|5\/6"\s*$|common denominator 6|Not quite|they typed/.test(nt.replace(/choices: .*?;/, '')) && !/they have selected/.test(nt), nt);
  const hostile = screen.clean({ blocks: ['x'.repeat(5000), 7, null], choices: [{ text: 'a', selected: 'yes' }], scroll: { percent: 900 }, visuals: [{ kind: 'k'.repeat(99) }], extra: 'ignored' });
  check('untrusted input is clipped and typed', hostile.blocks[0].length <= 400 && hostile.scroll === 100 && hostile.visuals[0].kind.length <= 30 && !('extra' in hostile));
  check('garbage in gives an empty snapshot', screen.text(null) === '' && screen.text('x') === '' && screen.text({}) === '');
  check('needs a picture for a board with thin text, in full mode only', screen.needsImage({ visuals: [{ kind: 'canvas', label: 'chess board' }] }, 'full') && !screen.needsImage({ visuals: [{ kind: 'canvas' }] }, 'method'));
  check('no picture when the page has none', !screen.needsImage({ blocks: ['hello'] }, 'full'));

  console.log('context and reply');
  const page = { path: '/session', title: 'Lesson', heading: 'Adding fractions', snapshot: snap };
  const built = dock.build(u.id, page, 'full');
  check('the context has an On screen section after Page', /^Page:[^\n]*\nOn screen:/.test(built.text) && /1\/2 \+ 1\/3/.test(built.text), built.text);
  check('method mode context leaves out the learner\'s answer', !/common denominator 6|Not quite/.test(dock.build(u.id, { ...page, path: '/placement' }, 'method').text));
  const r1 = await dock.reply({ user: u, messages: [{ role: 'user', content: 'help' }], page, inputMode: 'voice' });
  check('reply remembers the voice mode and says so', r1.input_mode === 'voice' && mode.get(u.id) === 'voice', r1);
  check('voice replies are told to be short enough to say aloud', /spoken aloud/.test(calls[calls.length - 1].system));
  await dock.reply({ user: u, messages: [{ role: 'user', content: 'help' }], page, inputMode: 'text' });
  check('a typed message makes text the default again', mode.get(u.id) === 'text' && !/spoken aloud/.test(calls[calls.length - 1].system));
  await dock.reply({ user: u, messages: [{ role: 'user', content: 'whats the answer' }], page: { ...page, path: '/placement' } });
  const sys = calls.filter((c) => c.task !== 'dock_leak_check').pop().system;
  check('placement: integrity note stays and the learner\'s pick is not in the prompt', /NO answers/.test(sys) && !/they have selected|common denominator 6/.test(sys), sys.slice(0, 200));
  const n = calls.length;
  const off = await dock.reply({ user: u, messages: [{ role: 'user', content: 'hi' }], page: { ...page, path: '/spanish-check' }, inputMode: 'voice' });
  check('sealed page: nothing happens, mode untouched', off.source === 'off' && calls.length === n && mode.get(u.id) === 'text');

  console.log('vision');
  const tiny = `data:image/jpeg;base64,${Buffer.from('x'.repeat(100)).toString('base64')}`;
  check('accepts a small jpeg data URL only', vision.checkImage(tiny) === tiny && !vision.checkImage('http://x/y.png') && !vision.checkImage('data:text/html;base64,AAAA'));
  check('refuses a picture too big for the request limit', !vision.checkImage(`data:image/png;base64,${'A'.repeat(60000)}`));
  let poolCalled = 0;
  const noVision = { candidatesFor: () => [], callHedged: async () => { poolCalled++; return null; } };
  check('no vision slot: null, and no call is made', (await vision.describe({ userId: u.id, image: tiny, pool: noVision })) === null && poolCalled === 0);
  const withVision = { candidatesFor: () => [{ id: 'v' }], callHedged: async (req, opts) => { poolCalled++; check('goes out as a learner-class vision request that cannot spend on paid slots', req.kind === 'vision' && req.dataClass === 'learner' && req.userId === u.id && opts.allowPaid === false); return { text: 'A chess board with a white knight on f3.' }; } };
  check('a vision slot gives a description', /white knight/.test(await vision.describe({ userId: u.id, image: tiny, pool: withVision })));
  check('never in no-answers mode', (await vision.describe({ userId: u.id, image: tiny, mode: 'method', pool: withVision })) === null);
  const real = await vision.describe({ userId: u.id, image: tiny });
  check('the real pool has no vision slot today, so it returns null without throwing', real === null, real);
  const board = { ...page, snapshot: { ...snap, visuals: [{ kind: 'canvas', label: 'chess board' }] } };
  const r2 = await dock.reply({ user: u, messages: [{ role: 'user', content: 'what do you see?' }], page: board, image: tiny });
  check('with no vision model the tutor is told it cannot see the picture', /cannot see the picture/.test(calls[calls.length - 1].system) && r2.saw_picture === false, r2);

  console.log('routes');
  const { call, close } = await serve(require('../routes/tutor'));
  mode.set(u.id, 'voice');
  check('status returns the remembered mode', (await call('GET', '/api/tutor/dock?path=/path', null, u.id)).json.input_mode === 'voice');
  check('status for a different learner is its own', (await call('GET', '/api/tutor/dock?path=/path', null, other.id)).json.input_mode === 'text');
  check('PUT mode stores it', (await call('PUT', '/api/tutor/dock/mode', { mode: 'text' }, u.id)).json.input_mode === 'text' && mode.get(u.id) === 'text');
  check('PUT with a bad mode is a 400', (await call('PUT', '/api/tutor/dock/mode', { mode: 'x' }, u.id)).status === 400);
  check('PUT is refused when signed out', [401, 403].includes((await call('PUT', '/api/tutor/dock/mode', { mode: 'voice' })).status));
  const p = await call('POST', '/api/tutor/dock', { messages: [{ role: 'user', content: 'hi' }], page, input_mode: 'voice' }, u.id);
  check('POST with a snapshot works and stores the mode', p.status === 200 && p.json.input_mode === 'voice' && mode.get(u.id) === 'voice', p);
  close();

  console.log('the dock in a page (jsdom)');
  const dockSrc = fs.readFileSync(path.join(root, 'public/js/tutor-dock.js'), 'utf8');
  const snapSrc = fs.readFileSync(path.join(root, 'public/js/tutor-snapshot.js'), 'utf8');
  const sent = [];
  const win = new JSDOM(HTML.replace('<html lang="en">', '<html lang="en">'), { url: 'https://savant.test/session', runScripts: 'outside-only', pretendToBeVisual: true }).window;
  win.SpeechRecognition = function Rec() { this.start = () => {}; this.stop = () => {}; };
  win.SpeechSynthesisUtterance = function U(t) { this.text = t; };
  win.speechSynthesis = { cancel() {}, speak() {} };
  win.fetch = async (url, init) => {
    sent.push({ url, init });
    if (/\/dock\?path/.test(url)) return { ok: true, json: async () => ({ mode: 'full', input_mode: 'voice', speech_lang: 'en' }) };
    if (/dock\/mode/.test(url)) return { ok: true, json: async () => ({}) };
    return { ok: true, json: async () => ({ reply: 'Try the common denominator.' }) };
  };
  win.eval(snapSrc);
  win.eval(dockSrc);
  await new Promise((r) => setTimeout(r, 50));
  const panel = win.document.querySelector('.tdock-panel[aria-label="Your tutor"]');
  check('the dock appears and says the tutor can see this page', panel && /The tutor can see this page\./.test(panel.textContent));
  check('it opens in the remembered mode (voice)', panel && panel.dataset.mode === 'voice' && panel.querySelector('.m-voice').getAttribute('aria-pressed') === 'true');
  panel.querySelector('.m-text').click();
  check('the toggle switches to text and tells the server', panel.dataset.mode === 'text' && sent.some((s) => /dock\/mode/.test(s.url) && /"text"/.test(s.init.body)));
  check('the choice is kept locally for the next page', win.localStorage.getItem('savant.tutor.mode') === 'text');
  panel.querySelector('input').value = 'is it 5/6?';
  panel.querySelector('form').dispatchEvent(new win.Event('submit', { cancelable: true }));
  await new Promise((r) => setTimeout(r, 20));
  const post = sent.find((s) => s.init && s.init.method === 'POST');
  const body = post && JSON.parse(post.init.body);
  check('a typed message sends input_mode text and a page snapshot', body && body.input_mode === 'text' && body.page.snapshot && body.page.snapshot.choices.length === 3, body && Object.keys(body));
  check('the reply shows in the transcript', /common denominator/.test(panel.querySelector('.tdock-log').textContent));

  console.log('wiring');
  const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
  check('the dock loads the snapshot builder', /tutor-snapshot\.js/.test(read('public/js/tutor-dock.js')));
  check('the snapshot builder never touches other tabs or the device screen', !/getDisplayMedia|chrome\.tabs|captureVisibleTab/.test(read('public/js/tutor-snapshot.js')));
  check('the speech path still sends nothing to a speech service', !/fetch\([^)]*(speech|stt|tts|gateway)/i.test(read('public/js/tutor-dock.js')));
  check('no provider or price is named in the new services', !/openrouter|anthropic\.com|api\.openai|llmgateway/i.test(['tutor-mode', 'tutor-screen', 'tutor-vision'].map((f) => read(`services/${f}.js`)).join('')));
  check('my dock css additions use only variables for colour', !/#[0-9a-f]{3,6}\b/i.test(read('public/css/tutor-dock.css').split('\n').filter((l) => /tdock-modes|data-mode/.test(l)).join('\n')));

  try { fs.unlinkSync(process.env.DB_FILE); } catch { /* none written */ }
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})();
