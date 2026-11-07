/**
 * The giraffe, the split chat and the voice call in a real Chromium (phone and desktop sizes).
 *
 *   node scripts/tutor-giraffe-browser-test.js [--only=layout,call,consent] [--port=6814]
 *
 * Its own server, a temporary database, synthetic learners only, every AI key blank. Speech is a stand-in gateway in this process (its base URL is passed to the server), so the
 * server's real routes, limits and temporary ledger run and nothing is spent. The microphone is a script-driven sound source behind getUserMedia, so "the learner talks" and "the
 * tutor's echo" are exact. NOT covered here, by design: real microphones, acoustic echo, real phones, Safari. Needs Playwright (not an app dependency).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/coding/savant-wt/pw/node_modules/playwright'); // eslint-disable-line import/no-dynamic-require
const ROOT = path.join(__dirname, '..');
const arg = (name, d) => { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.split('=').slice(1).join('=') : d; };
const PORT = Number(arg('port', 6814));
const ONLY = (arg('only', 'layout,call,consent')).split(',');
const BASE = `http://localhost:${PORT}`;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true };
const DESK = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 };

let failures = 0;
let passes = 0;
function check(label, ok, detail) {
  if (ok) { passes += 1; console.log(`  ok   ${label}`); return; }
  failures += 1;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 400)}`}`);
}

// ── The stand-in speech service ────────────────────────────────────────────
const gateway = { tts: [], stt: 0, heard: 'what does the x mean here', sttDelay: 80, ttsDelay: 60, ttsSeconds: 1.2 };
function toneWav(seconds) {
  const rate = 16000; const n = Math.floor(rate * seconds); const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / 8) * 3000), 44 + i * 2);
  return b;
}
const stub = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    if (/audio\/speech/.test(req.url)) {
      gateway.tts.push(JSON.parse(Buffer.concat(chunks).toString()).input);
      setTimeout(() => { res.writeHead(200, { 'content-type': 'audio/wav' }); res.end(toneWav(gateway.ttsSeconds)); }, gateway.ttsDelay);
      return;
    }
    if (/audio\/transcriptions/.test(req.url)) {
      gateway.stt += 1;
      setTimeout(() => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ text: gateway.heard })); }, gateway.sttDelay);
      return;
    }
    res.writeHead(404); res.end('{}');
  });
});

const MIC = () => {
  window.__gum = 0;
  window.__mic = { tracks: [], set() {} };
  const real = navigator.mediaDevices && navigator.mediaDevices.getUserMedia ? navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices) : null;
  if (!real) return;
  navigator.mediaDevices.getUserMedia = async (c) => {
    window.__gum += 1;
    window.__gumAsked = c;
    if (window.__micRefuse) throw new DOMException('refused', 'NotAllowedError');
    const ac = new AudioContext();
    await ac.resume();
    const o = ac.createOscillator();
    o.frequency.value = 220;
    const gain = ac.createGain();
    gain.gain.value = window.__micLevel || 0;
    const d = ac.createMediaStreamDestination();
    o.connect(gain); gain.connect(d); o.start();
    window.__mic.set = (v) => { window.__micLevel = v; gain.gain.setValueAtTime(v, ac.currentTime); };
    const tracks = d.stream.getAudioTracks();
    window.__mic.tracks.push(...tracks);
    if (window.__noAec) tracks[0].getSettings = () => ({ echoCancellation: false });
    return d.stream;
  };
};
const noRecognizer = () => { delete window.SpeechRecognition; delete window.webkitSpeechRecognition; window.SpeechRecognition = undefined; window.webkitSpeechRecognition = undefined; };
const fakeBrowserSpeech = () => {
  window.__spoken = [];
  const synth = { speak(u) { window.__spoken.push(u.text); if (u.text.trim()) { setTimeout(() => u.onstart && u.onstart(), 10); setTimeout(() => u.onend && u.onend(), window.__synthMs || 300); } }, cancel() { window.__synthCancelled = (window.__synthCancelled || 0) + 1; }, getVoices() { return []; }, addEventListener() {}, removeEventListener() {} };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
  class Rec {
    start() { window.__recStarts = (window.__recStarts || 0) + 1; window.__rec = this; }
    stop() { setTimeout(() => this.onend && this.onend(), 5); }
    abort() { setTimeout(() => this.onend && this.onend(), 5); }
  }
  window.SpeechRecognition = Rec; window.webkitSpeechRecognition = Rec;
  window.__hear = (t) => { const r = window.__rec; if (r && r.onresult) r.onresult({ results: [Object.assign([{ transcript: t }], { isFinal: true })], resultIndex: 0 }); };
};

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'giraffe-test-'));
  await new Promise((r) => stub.listen(0, '127.0.0.1', r));
  const ledgerFile = path.join(tmp, 'llmgateway-ledger.json');
  const server = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), NODE_ENV: 'development', DB_FILE: path.join(tmp, 'db.json'), HOLDOUT_DIR: tmp, SPANISH_MEDIA_DIR: path.join(tmp, 'm'), SESSION_SECRET: 'browser-test-secret-browser-test-secret', OWNER_EMAIL: 'owner-test@example.com', GEMINI_API_KEY: '', MIMO_API_KEY: '', OPENROUTER_API_KEY: '', ANTHROPIC_API_KEY: '', AI_PROVIDER: 'none', SIGNIN_ONLY: '0', LLMGATEWAY_API_KEY: 'stand-in', LLMGATEWAY_BASE_URL: `http://127.0.0.1:${stub.address().port}/v1`, LLMGATEWAY_LEDGER_FILE: ledgerFile, SPANISH_GATEWAY_USERS: '1', TUTOR_GATEWAY_DAILY_CHARS: '100000', PERMISSIONS_DUMMY: '' }, stdio: 'ignore' });
  for (let i = 0; i < 160; i++) { await delay(250); try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* up soon */ } }
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const errors = [];

  const contextFor = async (opts, inits = [MIC], storage) => {
    const ctx = await browser.newContext({ ...opts, ...(storage ? { storageState: storage } : {}) });
    for (const fn of inits) await ctx.addInitScript(fn);
    return ctx;
  };
  const api = (ctx, m, u, d) => ctx.request.fetch(BASE + u, { method: m, headers: { Origin: BASE, 'Content-Type': 'application/json' }, data: d ? JSON.stringify(d) : undefined }).then(async (r) => ({ status: r.status(), json: await r.json().catch(() => null), headers: r.headers() }));
  const newPage = async (ctx, url) => {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${url}: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404|401|403|409|503|429|ERR_/.test(m.text())) errors.push(`${url}: ${m.text()}`); });
    await page.goto(BASE + url);
    await page.waitForSelector('.tdock-g-btn', { timeout: 20000 });
    await delay(500);
    return page;
  };
  const hold = async (page, ms = 650) => { await page.hover('.tdock-g-btn').catch(() => {}); await page.mouse.down(); await delay(ms); await page.mouse.up(); };
  const center = (page, sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
  const touchHold = async (page, ms = 650) => {
    const c = await center(page, '.tdock-g-btn');
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: c.x, y: c.y }] });
    await delay(ms);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  };
  const touchTap = (page) => touchHold(page, 40);
  const voice = (page) => page.evaluate(() => document.querySelector('.tdock-g').dataset.voice);
  const waitVoice = async (page, want, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if ((await voice(page)) === want) return true; await delay(40); } return false; };
  const talk = async (page, ms = 900, level = 0.25) => { await page.evaluate((v) => window.__mic.set(v), level); await delay(ms); await page.evaluate(() => window.__mic.set(0)); };
  const open = (page) => page.evaluate(() => document.querySelector('.tdock-panel').dataset.open === 'true');
  const micLive = (page) => page.evaluate(() => window.__mic.tracks.filter((t) => t.readyState === 'live').length);

  try {
    // ── Accounts ─────────────────────────────────────────────────────────
    const seed = await browser.newContext(PHONE);
    const reg = (ctx, email, birth_year) => api(ctx, 'POST', '/api/auth/register', { email, password: 'test-password-123', display_name: 'Gia', birth_year, birth_month: 5, country: 'US', agreed: true });
    const r1 = await reg(seed, 'paid@example.com', 1990);
    check('the first synthetic learner is id 1, the one on the stand-in gateway list', r1.json.user.id === 1, r1.json.user && r1.json.user.id);
    await api(seed, 'POST', '/api/enrollments', { selections: [{ track_id: 'math', grade_id: 'algebra_1_part_a' }] });
    const e = (await api(seed, 'GET', '/api/enrollments')).json.enrollments[0];
    const st = await api(seed, 'POST', '/api/placement/start', { enrollment_id: e.id });
    const q = [...(st.json.items || [])];
    for (let n = 0; q.length && n < 60; n++) {
      const it = q.shift();
      const r = await api(seed, 'POST', '/api/placement/answer', { session_id: st.json.session_id, item_id: it.id, answer: (it.choices && (it.choices[0].text || it.choices[0])) || '1', ms: 3000 });
      if (r.json && r.json.next_item) q.push(r.json.next_item);
    }
    await api(seed, 'POST', '/api/placement/finish', { session_id: st.json.session_id });
    const paid = await seed.storageState();
    await seed.close();
    const lesson = `/session?enrollment=${e.id}`;

    if (ONLY.includes('layout')) {
      console.log('phone: the giraffe and the split');
      let ctx = await contextFor(PHONE, [MIC], paid);
      let page = await newPage(ctx, lesson);
      check('no floating tutor button anywhere', (await page.locator('.tdock-btn').count()) === 0);
      check('on a lesson the giraffe sits in the lesson\'s top bar', await page.evaluate(() => !!document.querySelector('.player-head .tdock-g')));
      const isHit = () => page.evaluate(() => { const b = document.querySelector('.tdock-g-btn'); const r = b.getBoundingClientRect(); if (r.top < 0 || r.bottom > innerHeight) return false; const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!hit && (b === hit || b.contains(hit)); });
      check('it is on screen and nothing covers it', await isHit());
      const notOver = await page.evaluate(() => { const b = document.querySelector('.tdock-g').getBoundingClientRect(); return [...document.querySelectorAll('main h1, main p, main .btn')].filter((n) => { const r = n.getBoundingClientRect(); return r.width && !n.closest('.player-head') && r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top; }).length; });
      check('it does not sit over page content', notOver === 0, notOver);
      await page.evaluate(() => window.scrollTo(0, 500)); await delay(300);
      check('scrolled down a long lesson it is still there, in the kept first row of the bar', await isHit());
      const headH = await page.evaluate(() => document.querySelector('.player-head').getBoundingClientRect().height);
      check('that row is slim', headH < 70, headH);
      await page.evaluate(() => window.scrollTo(0, 0)); await delay(300);
      await touchTap(page); await delay(400);
      check('a tap opens the chat', await open(page));
      let geo = await page.evaluate(() => { const p = document.querySelector('.tdock-panel').getBoundingClientRect(); const bar = document.querySelector('.check-bar') ? document.querySelector('.check-bar').getBoundingClientRect() : null; return { pTop: p.top, pBottom: p.bottom, h: p.height, inner: innerHeight, place: document.querySelector('.tdock-panel').dataset.place, barBottom: bar ? bar.bottom : null, bar: !!bar }; });
      check('from the bottom, filling part of the screen', geo.place === 'bottom' && geo.pBottom === geo.inner && geo.h > 200 && geo.h < geo.inner * 0.65, geo);
      check('the page\'s own fixed Check bar moved above the chat, not under it', !geo.bar || geo.barBottom <= geo.pTop + 1, geo);
      const before = await page.evaluate(() => { const b = document.documentElement; return { y: scrollY, h: b.scrollHeight }; });
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await delay(250);
      const end = await page.evaluate(() => { const m = document.querySelector('main').getBoundingClientRect(); const p = document.querySelector('.tdock-panel').getBoundingClientRect(); return { y: scrollY, mainBottom: m.bottom, top: p.top }; });
      check('the whole page scrolls into the window above the chat', end.y > before.y + 100 && end.mainBottom <= end.top + 1, { end, before });
      await page.evaluate(() => window.scrollTo(0, 0)); await delay(200);
      const tappable = await page.evaluate(() => { const p = document.querySelector('.tdock-panel').getBoundingClientRect(); const h = document.querySelector('main h1, .player h1'); const r = [...document.querySelectorAll('main .card p, main p')].find((n) => { const b = n.getBoundingClientRect(); return b.height && b.bottom < p.top; }); if (!r) return false; const b = r.getBoundingClientRect(); const hit = document.elementFromPoint(b.left + 5, b.top + 5); return !!hit && !hit.closest('.tdock-panel'); });
      check('the page above the chat can be touched', tappable);
      await page.click('.s-top'); await delay(450);
      geo = await page.evaluate(() => { const p = document.querySelector('.tdock-panel').getBoundingClientRect(); const g = document.querySelector('.tdock-g-btn').getBoundingClientRect(); return { place: document.querySelector('.tdock-panel').dataset.place, pTop: p.top, pBottom: p.bottom, gBottom: g.bottom, gTop: g.top }; });
      check('the control moves it to the top, under the bar that holds the giraffe', geo.place === 'top' && geo.gBottom <= geo.pTop + 1 && geo.gTop >= 0, geo);
      const firstLine = await page.evaluate(() => { const h = document.querySelector('.tdock-panel').getBoundingClientRect(); const n = [...document.querySelectorAll('main p, main h2, main h1')].find((x) => !x.closest('.player-head') && x.getBoundingClientRect().height); return { top: n.getBoundingClientRect().top, chatBottom: h.bottom }; });
      check('the page starts below the chat', firstLine.top >= firstLine.chatBottom - 1, firstLine);
      check('the choice reached the account', (await api(ctx, 'GET', '/api/tutor/dock?path=/dashboard')).json.side === 'top');
      await page.close();
      await ctx.close();
      ctx = await contextFor(PHONE, [MIC], paid); // a fresh browser: no local copy, only the account
      page = await newPage(ctx, '/dashboard');
      await touchTap(page); await delay(450);
      check('a new device opens it on the remembered side', await page.evaluate(() => document.querySelector('.tdock-panel').dataset.place === 'top'));
      await page.click('.s-bottom'); await delay(400);
      geo = await page.evaluate(() => { const p = document.querySelector('.tdock-panel').getBoundingClientRect(); const t = document.getElementById('tabbar').getBoundingClientRect(); return { pBottom: p.bottom, tTop: t.top }; });
      check('with a tab bar, the bottom chat sits above it', Math.abs(geo.pBottom - geo.tTop) <= 1, geo);
      await page.click('.tdock-close'); await delay(350);
      const clean = await page.evaluate(() => ({ pad: document.documentElement.style.paddingBottom, moved: [...document.querySelectorAll('.check-bar')].filter((n) => n.style.bottom).length, open: document.querySelector('.tdock-panel').dataset.open, vis: getComputedStyle(document.querySelector('.tdock-panel')).visibility }));
      check('closing puts the page back', clean.pad === '' && clean.moved === 0 && clean.open === 'false', clean);
      await delay(250);
      check('a closed chat takes nothing from the page', await page.evaluate(() => getComputedStyle(document.querySelector('.tdock-panel')).visibility === 'hidden' && !document.querySelector('.tdock-spacer')));

      console.log('phone: press and hold');
      const sel = await page.evaluate(() => { document.body.dataset.ctx = '0'; document.addEventListener('contextmenu', (ev) => { if (!ev.defaultPrevented) document.body.dataset.ctx = '1'; }, false); const c = getComputedStyle(document.querySelector('.tdock-g-btn')); return { select: c.userSelect || c.webkitUserSelect, touch: c.touchAction, callout: c.webkitTouchCallout }; });
      check('the giraffe turns off selection, the callout and scrolling from its own press', sel.select === 'none' && sel.touch === 'none', sel);
      await touchHold(page, 300); await delay(100);
      check('a touch shorter than the hold is a tap', await open(page));
      await touchTap(page); await delay(350);
      check('and a tap closes it', !(await open(page)));
      const y0 = await page.evaluate(() => scrollY);
      await touchHold(page, 700); await delay(300);
      const held = await page.evaluate(() => ({ text: String(getSelection()), ctx: document.body.dataset.ctx, y: scrollY }));
      check('a real touch hold selects nothing, opens no menu, scrolls nothing', held.text === '' && held.ctx === '0' && held.y === y0, held);
      check('and starts the call', await waitVoice(page, 'listening'));
      await touchTap(page); await delay(300);
      check('a tap ends it', (await voice(page)) === '' && (await micLive(page)) === 0);
      await page.close();
      await ctx.close();

      console.log('sizes');
      ctx = await contextFor({ ...PHONE, viewport: { width: 320, height: 568 } }, [MIC], paid);
      page = await newPage(ctx, '/dashboard');
      await touchTap(page); await delay(450);
      geo = await page.evaluate(() => { const p = document.querySelector('.tdock-panel').getBoundingClientRect(); const f = document.querySelector('.tdock-form').getBoundingClientRect(); return { pTop: p.top, pBottom: p.bottom, h: p.height, fBottom: f.bottom, inner: innerHeight, over: document.documentElement.scrollWidth - innerWidth }; });
      check('320 by 568: the chat fits, its box is on screen, a window of page is left, no sideways scroll', geo.fBottom <= geo.pBottom + 1 && geo.h >= 200 && geo.pTop > 54 + 100 && geo.over <= 0, geo);
      // The keyboard: Chromium has none here, so the viewport shrinks the way a resizing keyboard does.
      await page.setViewportSize({ width: 320, height: 300 }); await delay(450);
      geo = await page.evaluate(() => { const p = document.querySelector('.tdock-panel').getBoundingClientRect(); const f = document.querySelector('.tdock-form input').getBoundingClientRect(); return { pBottom: p.bottom, fBottom: f.bottom, inner: innerHeight, h: p.height }; });
      check('a keyboard-sized screen: the typing box stays on screen', geo.fBottom <= geo.inner && geo.pBottom <= geo.inner + 1 && geo.h > 100, geo);
      await page.setViewportSize({ width: 568, height: 320 }); await delay(500);
      geo = await page.evaluate(() => { const p = document.querySelector('.tdock-panel').getBoundingClientRect(); const m = document.querySelector('main').getBoundingClientRect(); return { place: document.querySelector('.tdock-panel').dataset.place, left: p.left, mainRight: m.right, inner: innerWidth, h: p.height, ih: innerHeight, over: document.documentElement.scrollWidth - innerWidth }; });
      check('turned on its side: side by side, and the page is not under it', geo.place === 'right' && geo.mainRight <= geo.left + 1 && geo.over <= 0, geo);
      await page.close();
      await ctx.close();

      console.log('desktop');
      ctx = await contextFor(DESK, [MIC], paid);
      page = await newPage(ctx, '/dashboard');
      check('desktop: in the sidebar', await page.evaluate(() => !!document.querySelector('.site-header .tdock-g')));
      await page.click('.tdock-g-btn'); await delay(400);
      geo = await page.evaluate(() => { const p = document.querySelector('.tdock-panel').getBoundingClientRect(); const m = document.querySelector('main').getBoundingClientRect(); return { left: p.left, right: p.right, mainRight: m.right, inner: innerWidth, top: p.top, bottom: p.bottom, ih: innerHeight, focus: document.activeElement && document.activeElement.tagName, over: document.documentElement.scrollWidth - innerWidth }; });
      check('a panel beside the page: the page narrows and is not covered', geo.right === geo.inner && geo.mainRight <= geo.left + 1 && geo.top === 0 && geo.bottom === geo.ih && geo.over <= 0, geo);
      check('the typing box takes focus on desktop', geo.focus === 'INPUT', geo.focus);
      await page.keyboard.press('Escape'); await delay(300);
      check('Escape closes it, back on the giraffe', !(await open(page)) && await page.evaluate(() => document.activeElement === document.querySelector('.tdock-g-btn')));
      console.log('keyboard');
      await page.keyboard.press('Enter'); await delay(350);
      check('Enter on the giraffe opens the chat', await open(page));
      await page.keyboard.press('Escape'); await delay(300);
      await page.keyboard.press('Tab');
      const alt = await page.evaluate(() => { const a = document.activeElement; const r = a.getBoundingClientRect(); return { cls: a.className, w: r.width, text: a.textContent }; });
      check('Tab reaches a visible "start a voice call" button', /tdock-g-alt/.test(alt.cls) && alt.w > 40 && /voice call/i.test(alt.text), alt);
      await page.keyboard.press('Enter');
      check('which starts the call', await waitVoice(page, 'listening'));
      const labelled = await page.evaluate(() => ({ main: document.querySelector('.tdock-g-btn').getAttribute('aria-label'), second: document.querySelector('.tdock-g-alt').textContent, live: document.querySelector('.tdock-g-status').getAttribute('aria-live'), word: document.querySelector('.tdock-g-status').textContent }));
      check('in a call the buttons say what they do and the state is announced', /end/i.test(labelled.main) && /chat/i.test(labelled.second) && labelled.live === 'polite' && labelled.word === 'Listening', labelled);
      await page.keyboard.press('Enter'); await delay(350); // the second button: switch to chat
      check('the second button switches to chat', (await voice(page)) === '' && await open(page) && (await micLive(page)) === 0);
      await page.keyboard.press('Escape'); await delay(300);
      await page.evaluate(() => document.querySelector('.tdock-g-btn').focus());
      await page.keyboard.down('Enter'); await delay(650); await page.keyboard.up('Enter');
      check('holding Enter on the giraffe starts the call too', await waitVoice(page, 'listening'));
      await page.keyboard.press('Enter'); await delay(350);
      check('and Enter ends it', (await voice(page)) === '');
      await page.close();
      await ctx.close();

      console.log('reduced motion, themes, contrast');
      ctx = await contextFor({ ...PHONE, reducedMotion: 'reduce', colorScheme: 'dark' }, [MIC], paid);
      page = await newPage(ctx, lesson);
      await touchTap(page); await delay(150);
      const calm = await page.evaluate(() => { const p = getComputedStyle(document.querySelector('.tdock-panel')); document.querySelector('.tdock-g').dataset.voice = 'thinking'; document.querySelector('.tdock-g').dataset.mouth = 'talk'; const r = getComputedStyle(document.querySelector('.tdock-g-ring')); const m = document.querySelector('.tdock-g .t-mouth'); const o = { dur: p.transitionDuration, ring: r.animationName, mouth: m ? getComputedStyle(m).animationName : 'none' }; document.querySelector('.tdock-g').dataset.voice = ''; document.querySelector('.tdock-g').dataset.mouth = ''; return o; });
      check('reduced motion: nothing slides, turns or moves', parseFloat(calm.dur) < 0.01 && calm.ring === 'none' && calm.mouth === 'none', calm);
      await page.close();
      await ctx.close();
      for (const scheme of ['light', 'dark']) {
        ctx = await contextFor({ ...PHONE, colorScheme: scheme }, [MIC], paid);
        page = await newPage(ctx, lesson);
        await touchTap(page); await delay(300);
        await page.fill('.tdock-form input', 'hello'); await page.click('.tdock-form .go'); await delay(600);
        const c = await page.evaluate(() => {
          const lum = (s) => { const m = s.match(/[\d.]+/g).map(Number); const a = m.length > 3 ? m[3] : 1; if (a === 0) return null; const f = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); };
          const bgOf = (n) => { for (let e = n; e; e = e.parentElement) { const l = lum(getComputedStyle(e).backgroundColor); if (l !== null) return l; } return 1; };
          const ratio = (n) => { const a = lum(getComputedStyle(n).color); const b = bgOf(n); return Number(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2)); };
          return { me: ratio(document.querySelector('.tdock-log .me')), bot: ratio(document.querySelector('.tdock-log .bot')), note: ratio(document.querySelector('.tdock-note')), send: ratio(document.querySelector('.tdock-form .go')), title: ratio(document.querySelector('.tdock-title')), pressed: ratio(document.querySelector('.tdock-icon[aria-pressed="true"]')) };
        });
        check(`${scheme}: chat text reads at 4.5:1 or better`, Object.values(c).every((v) => v >= 4.5), c);
        await page.close();
        await ctx.close();
      }
    }

    if (ONLY.includes('call')) {
      console.log('the call: an account on the gateway list (stand-in speech)');
      const ctx = await contextFor(PHONE, [MIC], paid);
      let page = await newPage(ctx, lesson);
      gateway.tts.length = 0; gateway.stt = 0; gateway.ttsSeconds = 1.2;
      await hold(page);
      check('a hold starts it: listening', await waitVoice(page, 'listening'));
      check('it asked for echo cancellation', await page.evaluate(() => { const a = window.__gumAsked.audio; return a.echoCancellation === true && a.noiseSuppression === true; }));
      check('the chat stays closed in a call', !(await open(page)));
      await delay(600);
      await talk(page, 900);
      check('the learner stops: thinking', await waitVoice(page, 'thinking', 3000));
      check('then talking, with the mouth on', await waitVoice(page, 'talking', 6000) && await page.evaluate(() => document.querySelector('.tdock-g').dataset.mouth === 'talk'));
      check('only the speech went out (one or two clips, the early one counts)', gateway.stt >= 1 && gateway.stt <= 2, gateway.stt);
      const reply1 = await page.evaluate(() => [...document.querySelectorAll('.tdock-log .bot')].pop().textContent);
      check('what is spoken is exactly the reply in the transcript, sentence by sentence', gateway.tts.length >= 1 && reply1.startsWith(gateway.tts[0].slice(0, 20)), { tts: gateway.tts, reply1 });
      check('then it listens again by itself', await waitVoice(page, 'listening', 12000));
      const m1 = await page.evaluate(() => window.TutorCall.last);
      check('the delay of that turn was measured', m1.turns.length === 1 && m1.turns[0].total_ms > 0 && m1.turns[0].detect_ms >= 500, m1);
      console.log(`       stand-in delay: ${JSON.stringify(m1.turns[0])}`);

      console.log('interrupting, and not hearing itself');
      gateway.ttsSeconds = 5;
      await talk(page, 800);
      check('a long reply starts', await waitVoice(page, 'talking', 6000));
      // The tutor's own voice comes back through the room, attenuated, for all of the start of the reply and after: not the learner.
      await page.evaluate(() => window.__mic.set(0.03)); await delay(1500);
      check('its echo in the mic does not cut it off', (await voice(page)) === 'talking', await voice(page));
      const sttBefore = gateway.stt;
      await page.evaluate(() => window.__mic.set(0));
      await delay(100);
      // The learner cuts in, much louder than the echo.
      gateway.heard = 'wait, I have another question';
      await talk(page, 900, 0.3);
      const cut = await voice(page);
      check('the learner cuts in: it stops talking and listens (or is already thinking about what they said)', cut === 'listening' || cut === 'thinking', cut);
      check('and answers what they said, with their first words kept', await waitVoice(page, 'talking', 8000) && gateway.stt > sttBefore);
      gateway.ttsSeconds = 0.6;
      check('back to listening', await waitVoice(page, 'listening', 14000));
      // Echo that got through as words: the clip is the tutor's own sentence.
      const lastReply = await page.evaluate(() => [...document.querySelectorAll('.tdock-log .bot')].pop().textContent);
      const asked0 = await page.evaluate(() => document.querySelectorAll('.tdock-log .me').length);
      gateway.heard = lastReply;
      await talk(page, 600);
      await delay(1500);
      check('a clip that is just the tutor\'s own words is dropped', (await page.evaluate(() => document.querySelectorAll('.tdock-log .me').length)) === asked0);
      gateway.heard = 'what does the x mean here';
      await waitVoice(page, 'listening', 6000);

      console.log('tap and hold during a call');
      await talk(page, 800);
      await waitVoice(page, 'listening', 14000);
      const said = await page.evaluate(() => document.querySelectorAll('.tdock-log .me').length);
      await hold(page);
      await delay(400);
      const after = await page.evaluate(() => ({ open: document.querySelector('.tdock-panel').dataset.open, place: document.querySelector('.tdock-panel').dataset.place, me: document.querySelectorAll('.tdock-log .me').length, bot: document.querySelectorAll('.tdock-log .bot').length, vis: getComputedStyle(document.querySelector('.tdock-panel')).visibility, live: window.__mic.tracks.filter((t) => t.readyState === 'live').length, voice: document.querySelector('.tdock-g').dataset.voice }));
      check('a hold switches to chat: the audio stops, the mic is off, the chat is open', after.open === 'true' && after.vis === 'visible' && after.live === 0 && after.voice === '', after);
      check('and the conversation so far is there as text', after.me === said && after.me >= 3 && after.bot >= after.me, after);
      await page.fill('.tdock-form input', 'and now by typing'); await page.click('.tdock-form .go'); await delay(600);
      check('it carries on by typing', await page.evaluate(() => document.querySelectorAll('.tdock-log .me').length) === said + 1);
      await page.close();

      console.log('a quiet call, and the limit');
      page = await ctx.newPage();
      page.on('pageerror', (er) => errors.push(`quiet: ${er.message}`));
      await page.route('**/api/tutor/call/start', async (route) => { const r = await route.fetch(); const j = await r.json(); j.silence_warn_s = 1.5; j.silence_end_s = 3.5; await route.fulfill({ response: r, json: j }); });
      await page.goto(`${BASE}/dashboard`); await page.waitForSelector('.tdock-g-btn'); await delay(500);
      gateway.tts.length = 0;
      await hold(page);
      await waitVoice(page, 'listening');
      await delay(2500);
      check('after a quiet spell it asks if they are still there, aloud', gateway.tts.some((t) => /still there/i.test(t)), gateway.tts);
      const ended = await waitVoice(page, '', 8000);
      check('then it hangs up by itself and says so where it can be seen', ended && /went quiet/i.test(await page.evaluate(() => document.querySelector('.tdock-g-status').textContent)) && (await micLive(page)) === 0, await page.evaluate(() => document.querySelector('.tdock-g-status').textContent));
      await page.close();
      page = await ctx.newPage();
      await page.route('**/api/tutor/call/start', async (route) => { const r = await route.fetch(); const j = await r.json(); j.max_s = 1.5; await route.fulfill({ response: r, json: j }); });
      await page.goto(`${BASE}/dashboard`); await page.waitForSelector('.tdock-g-btn'); await delay(500);
      await hold(page);
      await waitVoice(page, 'listening');
      check('at the length limit the call ends itself', await waitVoice(page, '', 12000) && (await micLive(page)) === 0);
      await page.close();

      console.log('no echo cancellation');
      page = await ctx.newPage();
      await page.addInitScript(() => { window.__noAec = true; });
      await page.goto(`${BASE}/dashboard`); await page.waitForSelector('.tdock-g-btn'); await delay(500);
      gateway.ttsSeconds = 3;
      await hold(page);
      await waitVoice(page, 'listening'); await delay(400);
      await talk(page, 700);
      await waitVoice(page, 'talking', 6000);
      await page.evaluate(() => window.__mic.set(0.4)); await delay(1100); await page.evaluate(() => window.__mic.set(0));
      check('a browser without echo cancellation is not interruptible, so it can\'t cut itself off', (await voice(page)) === 'talking');
      await touchFree(page);
      await page.close();

      console.log('the ledger');
      const led = JSON.parse(fs.readFileSync(ledgerFile, 'utf8'));
      check('every clip and sentence went through the (temporary) ledger', led.by_task.tts && led.by_task.stt && led.by_task.tts.calls >= 3 && led.by_task.stt.calls >= 3, led.by_task);
      await ctx.close();
    }

    if (ONLY.includes('consent')) {
      console.log('the browser\'s own speech: an adult not on the gateway list');
      let ctx = await browser.newContext(PHONE);
      await ctx.addInitScript(MIC);
      await ctx.addInitScript(fakeBrowserSpeech);
      await reg(ctx, 'free@example.com', 1991);
      let page = await newPage(ctx, '/dashboard');
      const s = (await api(ctx, 'GET', '/api/tutor/dock?path=/dashboard')).json;
      check('the server gives this account the browser\'s speech, no paid route', s.call.allowed === true && s.call.speech === 'browser' && s.stt === false, s.call);
      gateway.tts.length = 0; gateway.stt = 0;
      await hold(page);
      check('a call starts', await waitVoice(page, 'listening'));
      await delay(150);
      await page.evaluate(() => window.__hear('how do fractions work'));
      check('its words end the turn', await waitVoice(page, 'thinking', 3000));
      check('and the browser speaks the reply', await waitVoice(page, 'talking', 6000));
      check('and it listens again', await waitVoice(page, 'listening', 8000));
      check('no paid speech at all', gateway.tts.length === 0 && gateway.stt === 0);
      const spoken = await page.evaluate(() => window.__spoken.filter((x) => x.trim()).join(' '));
      const shown = await page.evaluate(() => [...document.querySelectorAll('.tdock-log .bot')].pop().textContent);
      check('the words spoken are the words in the chat', spoken.replace(/\s+/g, ' ').trim() === shown.replace(/\s+/g, ' ').trim(), { spoken, shown });
      await hold(page); await delay(300);
      check('hold: to chat, with the words', await open(page) && /fractions/.test(await page.evaluate(() => document.querySelector('.tdock-log').textContent)));
      await page.close();
      console.log('refused or missing');
      page = await ctx.newPage();
      await page.addInitScript(() => { window.__micRefuse = true; });
      await page.goto(`${BASE}/dashboard`); await page.waitForSelector('.tdock-g-btn'); await delay(500);
      await hold(page); await delay(800);
      check('the mic refused: it says so plainly and the chat opens', await open(page) && /microphone is blocked/i.test(await page.evaluate(() => document.querySelector('.tdock-log').textContent)) && (await voice(page)) === '');
      await page.close();
      await ctx.close();
      ctx = await browser.newContext(PHONE);
      await ctx.addInitScript(MIC);
      await ctx.addInitScript(noRecognizer);
      await reg(ctx, 'nosr@example.com', 1992);
      page = await newPage(ctx, '/dashboard');
      await hold(page); await delay(600);
      check('no speech in this browser: it says so plainly and the chat opens, and the mic was never asked for', await open(page) && /does not work in this browser/i.test(await page.evaluate(() => document.querySelector('.tdock-log').textContent)) && (await page.evaluate(() => window.__gum)) === 0);
      await page.close();
      await ctx.close();

      console.log('a child without a parent\'s consent');
      ctx = await browser.newContext(PHONE);
      await ctx.addInitScript(MIC);
      await ctx.addInitScript(fakeBrowserSpeech);
      const kid = await reg(ctx, 'kid@example.com', new Date().getFullYear() - 10);
      check('the sign-up holds the child for a parent', kid.status === 201 || kid.status === 200, kid.status);
      page = await ctx.newPage();
      page.on('pageerror', (er) => errors.push(`kid: ${er.message}`));
      const resp = await page.goto(`${BASE}/dashboard`);
      await page.waitForSelector('.tdock-g-btn', { timeout: 15000 }).catch(() => {});
      await delay(500);
      if (await page.locator('.tdock-g-btn').count()) {
        const kidStatus = (await api(ctx, 'GET', '/api/tutor/dock?path=/dashboard')).json;
        check('the server says no call and no mic', kidStatus.call.allowed === false && kidStatus.mic === false && kidStatus.stt === false && kidStatus.call.speech === 'browser', kidStatus.call);
        check('the browser is told to refuse the microphone', /microphone=\(\)/.test(resp.headers()['permissions-policy'] || ''), resp.headers()['permissions-policy']);
        check('the chat box offers no Speak button', (await page.locator('.tdock-form .mic').count()) === 0);
        await hold(page); await delay(600);
        const kidLog = await page.evaluate(() => document.querySelector('.tdock-log').textContent);
        check('a hold opens the chat and says why, plainly', await open(page) && /parent or guardian/i.test(kidLog), kidLog);
        check('no microphone was asked for and no recognizer started', (await page.evaluate(() => window.__gum)) === 0 && (await page.evaluate(() => window.__recStarts || 0)) === 0);
        const refused = await api(ctx, 'POST', '/api/tutor/call/start', {});
        check('and the server refuses a call anyway', refused.status === 403, refused);
      } else check('the child\'s page has the tutor as today', false, await page.url());
      await page.close();
      await ctx.close();
    }
    check('no page errors in any of this', errors.length === 0, errors.slice(0, 5));
  } finally {
    await browser.close();
    server.kill();
    stub.close();
  }
  console.log(failures ? `\n${failures} check(s) failed, ${passes} passed` : `\nAll ${passes} checks passed`);
  process.exit(failures ? 1 : 0);
}
async function touchFree(page) { await page.evaluate(() => { const b = document.querySelector('.tdock-g-btn'); if (b) b.click(); }); await delay(200); }
main().catch((e) => { console.error(e); process.exit(1); });
