/** Browser check of Mario in the authenticated course lesson shell. */
process.env.DB_READONLY = '1';
const assert = require('node:assert/strict');
const express = require('express');
const path = require('node:path');
const db = require('../config/db');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.COURSE_MARIO_TEST_PORT || 0);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const user = db.byId('users', 4);
  assert.ok(user, 'the local course test account exists');

  const app = express();
  app.use((req, res, next) => {
    req.user = user;
    next();
  });
  app.get('/api/auth/me', (_, res) => res.json({ user: {
    id: user.id,
    email: user.email,
    display_name: user.display_name,
    xp: user.xp,
    streak: user.streak,
    can_browse: true,
    is_admin: true,
  } }));
  app.use('/api', require('../routes/base-lessons'));
  app.get('/favicon.ico', (_, res) => res.status(204).end());
  app.use(express.static(path.join(ROOT, 'public'), { extensions: ['html'] }));

  const server = await new Promise((resolve) => {
    const instance = app.listen(PORT, '127.0.0.1', () => resolve(instance));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  let target;
  let ws;
  let sequence = 0;
  const pending = new Map();

  try {
    const health = await fetch(`${base}/api/lessons/english/proficient/14`);
    assert.equal(health.status, 200, 'course lesson API serves level 14');
    const lesson = await health.json();
    assert.equal(lesson.meta.engine_id, 'mario');
    assert.ok(lesson.frame, 'lesson supplies its same-origin game frame');

    target = await (await fetch('http://localhost:9227/json/new?about:blank', { method: 'PUT' })).json();
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve);
      ws.addEventListener('error', reject);
    });

    const errors = [];
    const failedRequests = [];
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && pending.has(message.id)) {
        const request = pending.get(message.id);
        pending.delete(message.id);
        message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result);
      }
      if (message.method === 'Runtime.exceptionThrown') {
        errors.push(`${message.params.exceptionDetails.text}: `
          + (message.params.exceptionDetails.exception?.description || ''));
      }
      if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
        errors.push(message.params.entry.text);
      }
      if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) {
        failedRequests.push({ status: message.params.response.status, url: message.params.response.url });
      }
    });

    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++sequence;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async (expression) => {
      const result = await send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
      return result.result.value;
    };

    await send('Runtime.enable');
    await send('Log.enable');
    await send('Network.enable');
    await send('Page.enable');
    await send('Emulation.clearDeviceMetricsOverride');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await send('Page.navigate', {
      url: `${base}/base-lesson?track=english&grade=proficient&level=14&enrollment=3023`,
    });

    let parentReady = false;
    for (let i = 0; i < 40; i++) {
      await delay(250);
      parentReady = await evaluate('!!document.querySelector(".course-game-frame")');
      if (parentReady) break;
    }
    assert.ok(parentReady, 'course shell mounted the Mario frame');

    let booted = false;
    for (let i = 0; i < 40; i++) {
      await delay(250);
      booted = await evaluate(`(() => {
        const frame = document.querySelector('.course-game-frame');
        return !!(frame && frame.contentWindow.Mario && frame.contentWindow.Mario.Player
          && frame.contentDocument.querySelector('canvas'));
      })()`);
      if (booted) break;
    }
    assert.ok(booted, 'Mario runtime and canvas boot inside the course frame');

    const desktop = await evaluate(`(() => {
      const frame = document.querySelector('.course-game-frame');
      const rect = frame.getBoundingClientRect();
      const canvas = frame.contentDocument.querySelector('canvas');
      const gameRect = canvas.getBoundingClientRect();
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let colors = new Set();
      for (let i = 0; i < pixels.length; i += 2400) {
        colors.add(pixels[i] + ',' + pixels[i + 1] + ',' + pixels[i + 2]);
      }
      return {
        viewport: [innerWidth, innerHeight],
        header: document.querySelector('.site-header').getBoundingClientRect().toJSON(),
        frame: rect.toJSON(),
        canvas: gameRect.toJSON(),
        canvasColors: colors.size,
        assist: document.querySelector('.assist-chat button')?.textContent.trim(),
      };
    })()`);
    assert.ok(desktop.frame.width > 300 && desktop.frame.height > 300,
      `game frame should have usable desktop dimensions: ${JSON.stringify(desktop)}`);
    assert.ok(desktop.canvas.width > 300 && desktop.canvas.height > 180,
      `Mario canvas should be visible inside the frame: ${JSON.stringify(desktop)}`);
    assert.ok(desktop.canvasColors > 2, 'Mario canvas renders the level rather than a black blank canvas');
    assert.match(desktop.assist || '', /Ask for help/, 'course help control remains visible');
    console.log(`PASS course Mario desktop: frame ${Math.round(desktop.frame.width)}x${Math.round(desktop.frame.height)}, canvas ${Math.round(desktop.canvas.width)}x${Math.round(desktop.canvas.height)}`);

    const moved = await evaluate(`(() => {
      const game = document.querySelector('.course-game-frame').contentWindow;
      const before = game.player.pos[0];
      game.input.press('RIGHT');
      return new Promise(resolve => setTimeout(() => {
        game.input.release('RIGHT');
        resolve(game.player.pos[0] > before);
      }, 350));
    })()`);
    assert.ok(moved, 'Mario responds to course-frame input');
    console.log('PASS course Mario controls: player moves in response to input');

    await send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await delay(200);
    const portrait = await evaluate(`(() => {
      const frame = document.querySelector('.course-game-frame');
      const game = frame.contentWindow;
      const rotate = game.document.getElementById('mx3m-rotate');
      const title = rotate && rotate.querySelector('.mx3m-rotate-title');
      return {
        frame: frame.getBoundingClientRect().toJSON(),
        prompt: rotate && getComputedStyle(rotate).display,
        titleVisible: !!title && getComputedStyle(title).display !== 'none'
          && title.getBoundingClientRect().height > 0,
        paused: game.paused,
      };
    })()`);
    assert.equal(portrait.prompt, 'flex', 'portrait mode displays the rotate prompt');
    assert.ok(portrait.titleVisible, 'rotate prompt includes visible instructions');
    assert.ok(portrait.paused, 'portrait mode pauses gameplay');
    console.log('PASS course Mario portrait: visible rotate guidance pauses play');

    await send('Emulation.setDeviceMetricsOverride', {
      width: 844,
      height: 390,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await delay(200);
    const landscape = await evaluate(`(() => {
      const frame = document.querySelector('.course-game-frame');
      const game = frame.contentWindow;
      const title = document.querySelector('#root h1').getBoundingClientRect();
      const assist = document.querySelector('.assist-chat').getBoundingClientRect();
      return {
        frame: frame.getBoundingClientRect().toJSON(),
        canvas: game.document.querySelector('canvas').getBoundingClientRect().toJSON(),
        rotate: getComputedStyle(game.document.getElementById('mx3m-rotate')).display,
        controls: game.document.querySelectorAll('.mobile-controls button').length,
        title: title.toJSON(),
        assist: assist.toJSON(),
        viewport: [innerWidth, innerHeight],
      };
    })()`);
    assert.ok(landscape.canvas.width > 300 && landscape.canvas.height > 180,
      `game should fit a landscape phone: ${JSON.stringify(landscape)}`);
    assert.equal(landscape.rotate, 'none', 'landscape mode hides the rotate prompt');
    assert.equal(landscape.controls, 5, 'landscape phone has all five touch controls');
    assert.ok(landscape.frame.height >= 350,
      `landscape game should retain a playable height: ${JSON.stringify(landscape)}`);
    assert.ok(landscape.assist.top >= landscape.frame.bottom - 1,
      `help control should sit below the game rather than overlap it: ${JSON.stringify(landscape)}`);
    const overflow = await evaluate(`(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
      bodyClientWidth: document.body.clientWidth,
      wide: [...document.querySelectorAll('*')]
        .map((node) => ({ tag: node.tagName, className: node.className, rect: node.getBoundingClientRect().toJSON() }))
        .filter((item) => item.rect.right > innerWidth + 1 || item.rect.left < -1)
        .slice(0, 8),
    }))()`);
    // Chromium's mobile emulation reserves a small scrollbar gutter in
    // scrollWidth even when no element crosses the viewport. The `wide` list is
    // the meaningful check for an element that would push the page sideways.
    assert.equal(overflow.wide.length, 0,
      `course lesson should not introduce horizontal overflow: ${JSON.stringify(overflow)}`);
    console.log('PASS course Mario landscape: canvas and touch controls fit the phone');

    const unexpectedRequests = failedRequests.filter((request) => !/\/favicon\.ico(?:\?|$)/.test(request.url));
    assert.deepEqual(unexpectedRequests, [], `course page and game assets load: ${JSON.stringify(failedRequests)}`);
    assert.deepEqual(errors, [], 'course page and game frame have no browser console/CSP errors');
    console.log('PASS course Mario: no browser console or CSP errors');
  } finally {
    if (ws && ws.readyState === WebSocket.OPEN) {
      await new Promise((resolve) => {
        const id = ++sequence;
        const timer = setTimeout(resolve, 500);
        pending.set(id, { resolve: () => { clearTimeout(timer); resolve(); }, reject: resolve });
        ws.send(JSON.stringify({ id, method: 'Emulation.clearDeviceMetricsOverride' }));
      });
    }
    if (target) await fetch(`http://localhost:9227/json/close/${target.id}`).catch(() => {});
    if (ws) ws.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error('FAIL course Mario browser test:', error.stack || error.message);
  process.exitCode = 1;
});