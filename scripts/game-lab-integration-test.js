/** Preview routes and real lesson-script loader; no account or learner DB writes. */
process.env.DB_READONLY = '1';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { JSDOM } = require('jsdom');
const lab = require('../services/game-lab');
const db = require('../config/db');
const registry = require('../game_registry.json');
const ROOT = path.join(__dirname, '..');

async function loaderTest() {
  const dom = new JSDOM('<main><div id="base-lesson-host"></div></main>', { runScripts:'outside-only', pretendToBeVisual:true });
  const w = dom.window;
  w.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: () => () => {}, set: () => true });
  const requests = [], files = {}, order = [];
  w.App = { mount: () => {}, api: { post: async (url, body) => {
    requests.push({url,body});
    assert.ok(Buffer.byteLength(JSON.stringify(body)) < 64 * 1024, 'shared engine code must not be posted');
    const urls = body.scripts.map((code,i) => { const file = `/test-script-${i}.js`;files[file]=code;return file; });
    return { files:urls };
  } } };
  const append = w.document.body.appendChild.bind(w.document.body);
  w.document.body.appendChild = function (element) {
    const result = append(element);
    if (element.tagName === 'SCRIPT') {
      const file = new URL(element.src, 'http://localhost').pathname;
      order.push(file);
      const source = files[file] || fs.readFileSync(path.join(ROOT, 'public', file), 'utf8');
      w.eval(source);
      Promise.resolve().then(() => element.onload());
    }
    return result;
  };
  w.eval(fs.readFileSync(path.join(ROOT, 'public', 'js', 'base-lesson.js'), 'utf8'));
  const payload = lab.payload('air-hockey');
  const html = require('../services/game-payloads').inject('air-hockey', payload);
  await w.mountLesson(w.document.getElementById('base-lesson-host'), html, 'english', 'proficient', 36);
  assert.deepEqual(order.slice(0,3), ['/games/remade.js','/games/boards.js','/games/arcade.js']);
  assert.equal(requests[0].body.scripts.length, 1);
  assert.equal(w.RemadeGames.current.id, 'air-hockey');
  assert.equal(w.document.querySelectorAll('[data-game-choice]').length, 4);
  const unsupported = w.document.createElement('script');unsupported.src = 'https://example.com/game.js';
  await assert.rejects(w.loadLessonScripts('english','proficient',36,[unsupported]), /unsupported script/);
  w.RemadeGames.dispose();dom.window.close();
  console.log('PASS course lesson loader: script order, content-only POST, init and URL allowlist');
}

async function routesTest() {
  const app = express();app.use(require('../routes/game-lab'));
  app.get('/api/health', (_,res) => res.json({ok:true}));
  app.use((_,res) => res.status(404).end());
  const server = await new Promise(resolve => {const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const base = `http://127.0.0.1:${server.address().port}`, previous = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV='development';
    const listing = await (await fetch(base+'/api/game-lab')).json();
    assert.equal(listing.games.length,40);assert.ok(listing.games.every(g=>g.status==='ready'));
    for (const engine of registry.engines) {
      const payload = await (await fetch(base+`/api/game-lab/${engine.id}/payload`)).json();
      assert.ok(payload.questions.length);assert.equal(payload.engineId,engine.id);
      assert.ok(payload.questions.every(q=>q.choices.length===4&&q.choices[q.answerIndex]&&q.explanation));
      const response = await fetch(base+`/game-lab/play/${engine.id}`);
      assert.equal(response.status,200);
      assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'self'/);
      assert.equal(response.headers.get('x-frame-options'),null);
      assert.ok(!(await response.text()).match(/<script>([\s\S]*?)<\/script>/), 'preview scripts must be external for CSP');
    }
    assert.equal((await fetch(base+'/api/game-lab/not-a-game/payload')).status,404);
    process.env.NODE_ENV='production';
    assert.equal((await fetch(base+'/api/game-lab')).status,404);
    assert.equal((await fetch(base+'/game-lab/play/tetris')).status,404);
    assert.equal((await fetch(base+'/api/health')).status,200,'lab gate must not block unrelated routes');
    console.log('PASS 40 preview payloads/frames, CSP, invalid ids, production admin gate and unrelated routes');
  } finally {process.env.NODE_ENV=previous;await new Promise(resolve=>server.close(resolve));}
}

async function courseFrameTest() {
  const app = express();
  const user = db.findOne('users', () => true);
  app.use((req, res, next) => { req.user = user; next(); });
  app.use('/api', require('../routes/base-lessons'));
  app.use((_, res) => res.status(404).end());
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const holdsWere = process.env.GAME_HOLDS;
  try {
    // These levels' shared sets are held from serving since 2026-10-24 (content/game-holds.json,
    // LIVE-CHANGES-2026-10-24.md): held, the level is not served as a game at all.
    // Level 24's set is still held; level 14's was replaced by a verified set (swapped
    // in 2026-10-24), so it serves again with the holds on.
    delete process.env.GAME_HOLDS;
    assert.equal((await fetch(`${base}/api/lessons/english/proficient/24/game-frame`)).status, 404, 'a held game level is not served');
    assert.equal((await fetch(`${base}/api/lessons/english/proficient/14/game-frame`)).status, 200, 'a level with a verified replacement is served');
    // The frame mechanics below, with the holds switched off.
    process.env.GAME_HOLDS = 'off';
    for (const [engine, level] of [['mario', 14], ['moto-x3m', 24]]) {
      const lessonResponse = await fetch(`${base}/api/lessons/english/proficient/${level}`);
      assert.equal(lessonResponse.status, 200);
      const lesson = await lessonResponse.json();
      assert.equal(lesson.basis, 'game');
      assert.equal(lesson.meta.engine_id, engine);
      assert.equal(lesson.html, null, `${engine} should not return full-page engine HTML to the parent`);
      assert.match(lesson.frame, new RegExp(`/api/lessons/english/proficient/${level}/game-frame$`));

      const frameResponse = await fetch(`${base}${lesson.frame}`);
      assert.equal(frameResponse.status, 200);
      assert.equal(frameResponse.headers.get('x-frame-options'), null);
      assert.match(frameResponse.headers.get('content-security-policy'), /frame-ancestors 'self'/);
      const frame = await frameResponse.text();
      assert.match(frame, /course-shell\.js/);
      assert.match(frame, /data-course-game="true"/);
      assert.ok(!/<script>/.test(frame), `${engine} frame must nonce every inline script`);
      if (engine === 'moto-x3m') {
        assert.match(frame, /moto-engine\.js/);
        const moto = await (await fetch(`${base}/api/lessons/english/proficient/${level}/moto-engine.js`)).text();
        assert.match(moto, /game:win/);
      } else {
        assert.match(frame, /mario-player\.js/);
        assert.match(frame, /src="mobile-fit\.js"/);
        const mario = await (await fetch(`${base}/api/lessons/english/proficient/${level}/mario-player.js`)).text();
        assert.match(mario, /game:win/);
      }
    }
  } finally {
    if (holdsWere === undefined) delete process.env.GAME_HOLDS; else process.env.GAME_HOLDS = holdsWere;
    await new Promise((resolve) => server.close(resolve));
  }
  console.log('PASS course game frames: Mario/Moto payloads, CSP, auth route and course-only Moto finish hook');
}

function bridgeTest() {
  const dom = new JSDOM(
    '<body data-engine="mario" data-track="english" data-grade="proficient" data-level="14"></body>',
    { url: 'http://localhost/course', runScripts: 'outside-only' },
  );
  const w = dom.window;
  const messages = [];
  w.parent.postMessage = (message, target) => messages.push({ message, target });
  w.GAME_DATA = { questions: [{ id: 'q1' }] };
  w.initGame = (payload) => { w.__initialized = payload; };
  w.eval(fs.readFileSync(path.join(ROOT, 'public', 'games', 'course-shell.js'), 'utf8'));
  assert.equal(w.__initialized, w.GAME_DATA);
  const taken = w.PolymathGame.cursor.next(4);
  assert.equal(taken.index, 0);
  assert.equal(taken.wrapped, false);
  w.dispatchEvent(new w.CustomEvent('game:answer', {
    detail: { questionId: 'q1', questionIndex: 0, correct: true, ms: 41 },
  }));
  assert.equal(messages.length, 2);
  assert.equal(messages[0].message.name, 'question');
  assert.equal(messages[1].message.name, 'answer');
  assert.equal(messages[1].message.questionId, 'q1');
  assert.equal(messages[1].target, 'http://localhost');
  dom.window.close();
  console.log('PASS course game shell: parent cursor and event relay');
}

function marioWinTest() {
  const dom = new JSDOM('<body></body>', { runScripts: 'outside-only' });
  const w = dom.window;
  w.Mario = {
    Entity: function () {},
    Sprite: function () {},
    Util: { inherits(child, parent) { child.prototype = Object.create(parent.prototype); } },
  };
  const wins = [];
  w.addEventListener('game:win', (event) => wins.push(event.detail));
  const source = fs.readFileSync(path.join(ROOT, 'public', 'games', 'mario', 'js', 'player.js'), 'utf8');
  const courseSource = source.replace(
    "\tPlayer.prototype.exit = function() {",
    "\tPlayer.prototype.exit = function() {\n\t\tif (!this.exiting) { try { window.dispatchEvent(new CustomEvent('game:win', { detail: { source: 'mario', engineId: 'mario', result: 'win' } })); } catch (e) {} }",
  );
  w.eval(courseSource);
  w.level = { exit: 4 };
  const player = Object.create(w.Mario.Player.prototype);
  player.exiting = false;
  player.pos = [10, 20];
  player.targetPos = [0, 0];
  player.left = false;
  player.setAnimation = () => {};
  player.exit();
  player.exit();
  assert.equal(wins.length, 1);
  assert.equal(wins[0].engineId, 'mario');
  assert.equal(wins[0].result, 'win');
  dom.window.close();
  console.log('PASS Mario course event: one win event per exit');
}

(async()=>{
  await loaderTest();
  await routesTest();
  // The written game sets for these two levels live in the owner's db, not in the repo; a db without them
  // (the synthetic fixture on a clean clone) cannot serve the frames, so say so rather than fail.
  const gamePayloads = require('../services/game-payloads');
  process.env.GAME_HOLDS = 'off';
  const haveSets = gamePayloads.sharedReady('english', 'proficient', 14) && gamePayloads.sharedReady('english', 'proficient', 24);
  delete process.env.GAME_HOLDS;
  if (haveSets) await courseFrameTest();
  else console.log('SKIP course game frames: this db has no shared game sets for english/proficient levels 14 and 24');
  bridgeTest();
  marioWinTest();
})().catch(error=>{console.error(error);process.exitCode=1;});