/**
 * /start's first screen under UI_V2, for every design UI_V2_WELCOME can pick (js/ui2/welcome.js, css/ui2/welcome.css): at 320, 375 and 390 wide, light and dark,
 * nothing scrolls sideways, the wordmark, the headline, the line and both buttons are on screen and whole, and the card's pattern stays behind the card.
 *
 *   node scripts/ui-v2-welcome-test.js
 *   WELCOME_SHOTS=<dir> node scripts/ui-v2-welcome-test.js   also saves the card at 375, light and dark, side by side, as <dir>/real-h.png
 *
 * Own server per design, temporary database, signed out, no outside AI. Needs Playwright (PLAYWRIGHT_PATH, default the shared copy).
 */
/* eslint-disable no-await-in-loop */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/coding/savant-wt/pw/node_modules/playwright'); // eslint-disable-line import/no-dynamic-require
const ui = require('../services/ui-v2');

const ROOT = path.join(__dirname, '..');
const PORT = 6859;
const BASE = `http://localhost:${PORT}`;
const SHOTS = process.env.WELCOME_SHOTS;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;
const ok = async (name, fn) => { await fn(); passed++; console.log(`  ok  ${name}`); };

const WORDS = {
  card: { h1: 'Learn it properly, from the start.', lead: 'Lessons built around you.' },
  giraffe: { h1: 'From zero to Savant.', lead: 'Lessons built around you.' },
};

function start(welcome, tmp) {
  const env = { ...process.env, UI_V2: 'on', UI_V2_WELCOME: welcome, ONBOARDING_V2: 'on', BETA_GATE: '', BETA_SIGNIN_ONLY: '', PORT: String(PORT), NODE_ENV: 'development', DB_FILE: path.join(tmp, 'db.json'), HOLDOUT_DIR: tmp, SPANISH_MEDIA_DIR: path.join(tmp, 'media'), XKIRO_LEARNER_UNTIL: '2000-01-01T00:00:00Z', FACT_CHECK_ALL: '0', MUNITO_LEARNER: 'off', CORAL_LEARNER: 'off', GLADIA_LEARNER: 'off', LYCEUM_LEARNER: 'off', GONKA_LEARNER: 'off', GROKIFIED_LEARNER: 'off', UPLOAD_AUTOBUILD: 'off', SPANISH_WRITE_AHEAD: 'off' };
  for (const k of Object.keys(env)) if (/_API_KEY$|_KEY$|_TOKEN$/.test(k)) env[k] = '';
  return spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: 'ignore' });
}
async function up() {
  for (let i = 0; i < 200; i++) {
    await delay(200);
    try { if ((await fetch(`${BASE}/api/health`)).ok) return; } catch { /* up soon */ }
  }
  throw new Error('server did not start');
}

// What a learner sees: every part's box, and whether anything sits outside the screen or behind the pattern.
const look = () => {
  const box = (el) => { const b = el.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height }; };
  const ob = document.getElementById('ob');
  const alt = document.getElementById('alt');
  const before = getComputedStyle(document.body, '::before');
  return {
    welcome: document.documentElement.dataset.welcome,
    screen: document.documentElement.dataset.obScreen,
    sideways: document.documentElement.scrollWidth > innerWidth,
    vw: innerWidth,
    vh: innerHeight,
    h1: document.querySelector('.ob-welcome h1').innerText.replace(/\s+/g, ' '),
    lead: document.querySelector('.ob-lead').innerText,
    parts: ['#wordmark .u2-wm', '.ob-welcome h1', '.ob-lead', '#next', '#alt'].map((s) => ({ s, ...box(document.querySelector(s)) })),
    clipped: [...document.querySelectorAll('.ob-welcome h1, .ob-lead, #next, #alt')].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.id || e.className),
    alt: alt.hidden ? null : alt.textContent,
    giraffe: getComputedStyle(document.getElementById('ob-side')).display !== 'none',
    card: box(ob),
    cardBg: getComputedStyle(ob).backgroundColor,
    pageBg: getComputedStyle(document.body).backgroundColor,
    pattern: before.content !== 'none' && before.content !== '' ? { z: before.zIndex, mask: /svg/.test(before.maskImage || before.webkitMaskImage), opacity: Number(before.opacity) } : null,
    rootZ: getComputedStyle(document.getElementById('ob-root')).zIndex,
  };
};

async function main() {
  await ok('the setting: card unless UI_V2_WELCOME names another design; /start says which on <html>', () => {
    const was = process.env.UI_V2_WELCOME;
    delete process.env.UI_V2_WELCOME;
    assert.strictEqual(ui.welcome(), 'card');
    process.env.UI_V2_WELCOME = 'GIRAFFE';
    assert.strictEqual(ui.welcome(), 'giraffe');
    process.env.UI_V2_WELCOME = 'nonsense';
    assert.strictEqual(ui.welcome(), 'card');
    process.env.UI_V2_WELCOME = 'giraffe';
    const html = ui.injectStart(fs.readFileSync(path.join(ROOT, 'public', 'start.html'), 'utf8'));
    assert(html.includes('data-welcome="giraffe"'));
    assert(html.indexOf('/js/ui2/welcome.js') < html.indexOf('/js/ui2/start.js'), 'welcome.js loads before start.js uses it');
    assert(html.indexOf('/css/ui2/start.css') < html.indexOf('/css/ui2/welcome.css'), 'welcome.css comes after start.css');
    if (was === undefined) delete process.env.UI_V2_WELCOME; else process.env.UI_V2_WELCOME = was;
  });
  await ok('every design the server can pick has its words in js/ui2/welcome.js', () => {
    const src = fs.readFileSync(path.join(ROOT, 'public', 'js', 'ui2', 'welcome.js'), 'utf8');
    for (const w of ui.WELCOMES) assert(new RegExp(`\\n\\s+${w}: \\{`).test(src), w);
    const css = fs.readFileSync(path.join(ROOT, 'public', 'css', 'ui2', 'welcome.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.deepStrictEqual(css.match(/#[0-9a-fA-F]{3,8}\b(?![^{]*\{)|rgba?\(|oklch\(/g) || [], [], 'welcome.css has no colour of its own');
  });

  const browser = await chromium.launch();
  const shots = [];
  try {
    for (const welcome of ui.WELCOMES) {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ui2-welcome-'));
      fs.mkdirSync(path.join(tmp, 'media'));
      const server = start(welcome, tmp);
      try {
        await up();
        for (const scheme of ['light', 'dark']) {
          for (const width of [320, 375, 390]) {
            const ctx = await browser.newContext({ viewport: { width, height: width === 320 ? 568 : 760 }, deviceScaleFactor: 2, colorScheme: scheme, hasTouch: true, isMobile: true });
            const page = await ctx.newPage();
            await ok(`${welcome}, ${scheme}, ${width}: whole, on screen, nothing sideways`, async () => {
              await page.goto(`${BASE}/start`);
              await page.waitForSelector('#wordmark .u2-wm', { state: 'visible' });
              await page.evaluate(() => document.fonts.ready);
              const m = await page.evaluate(look);
              assert.strictEqual(m.welcome, welcome);
              assert.strictEqual(m.screen, 'welcome');
              assert(!m.sideways, 'the page scrolls sideways');
              assert.strictEqual(m.h1, WORDS[welcome].h1);
              assert.strictEqual(m.lead, WORDS[welcome].lead);
              assert.strictEqual(m.alt, 'I have an account', 'signed out, the way back in is there');
              assert.deepStrictEqual(m.clipped, []);
              for (const p of m.parts) assert(p.w > 0 && p.l >= 0 && p.r <= m.vw + 0.5, `${p.s} runs off the side`);
              // Owner, 7 Nov: the wordmark sat right of centre (the invisible back button still took its space).
              { const wm = m.parts[0]; const mid = (wm.l + wm.r) / 2; const frame = (m.card.l + m.card.r) / 2; assert(Math.abs(mid - frame) <= 1.5, `wordmark is ${(mid - frame).toFixed(1)} px off centre`); }
              if (welcome === 'card') {
                assert(!m.giraffe, 'no giraffe on the card');
                assert(m.pattern && m.pattern.mask && m.pattern.opacity <= 0.25, 'a faint pattern');
                assert(Number(m.rootZ) > Number(m.pattern.z), 'the pattern stays under the card');
                assert.notStrictEqual(m.cardBg, m.pageBg, 'the card stands off the page');
                assert(!/rgba\(.*, 0\)|transparent/.test(m.cardBg), 'the card is opaque, so the pattern never shows behind words');
                for (const p of m.parts) assert(p.l >= m.card.l && p.r <= m.card.r && p.t >= m.card.t && p.b <= m.card.b + 0.5, `${p.s} is outside the card`);
                if (width >= 375) assert(m.card.t >= 0 && m.card.b <= m.vh, 'the card fits a phone screen');
              } else {
                assert(m.giraffe, 'the giraffe design shows the giraffe');
              }
              if (welcome === 'card' && width === 375 && SHOTS) await delay(600); // the step's 0.3 s entrance
              if (welcome === 'card' && width === 375 && SHOTS) shots.push({ scheme, png: (await page.screenshot()).toString('base64') });
            });
            await ctx.close();
          }
        }
        if (welcome === 'card') {
          const ctx = await browser.newContext({ viewport: { width: 375, height: 760 } });
          const page = await ctx.newPage();
          await ok('card: "I have an account" goes to sign-in, Get started to the next step', async () => {
            await page.goto(`${BASE}/start`);
            await page.waitForSelector('#alt', { state: 'visible' });
            await page.click('#next');
            await page.waitForFunction(() => document.documentElement.dataset.obScreen === 'hello');
            assert.strictEqual(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(255, 255, 255)', 'the pattern goes with the welcome');
            await page.goBack();
            await page.waitForFunction(() => document.documentElement.dataset.obScreen === 'welcome');
            await Promise.all([page.waitForURL(/\/login/), page.click('#alt')]);
          });
          await ctx.close();
        }
      } finally {
        server.kill();
        await delay(300);
        fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 3 });
      }
    }
    if (SHOTS && shots.length === 2) {
      const page = await browser.newPage({ viewport: { width: 375 * 2 + 72, height: 760 + 76 }, deviceScaleFactor: 1 });
      await page.setContent(`<body style="margin:0;padding:20px 24px;background:#eaecf0;font:700 15px system-ui;display:flex;gap:24px">${shots.map((s) => `<div><div style="height:28px">Real /start, H, 375, ${s.scheme}</div><img src="data:image/png;base64,${s.png}" style="width:375px;height:760px;display:block;border-radius:24px;box-shadow:0 0 0 1px #c8ccd3"></div>`).join('')}</body>`);
      await page.screenshot({ path: path.join(SHOTS, 'real-h.png') });
      console.log(`  --  saved ${path.join(SHOTS, 'real-h.png')}`);
    }
  } finally {
    await browser.close();
  }
  console.log(`ui-v2-welcome-test: ${passed} passed`);
}
main().catch((err) => { console.error(`FAIL  ${err.message}`); process.exit(1); });
