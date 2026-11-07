/**
 * The UI_V2 wordmark is drawn whole, whatever the browser does with fonts: on the /start welcome and in the top bar, at phone widths.
 * The owner's iPhone cut off the last t while it was live <text> in a fixed viewBox, so it is now outlines and this keeps it that way.
 *
 *   node scripts/ui-v2-wordmark-test.js
 *
 * Own server, temporary database, a synthetic learner, no outside AI. Needs Playwright (PLAYWRIGHT_PATH, default the shared copy). Runs in Chromium, and in WebKit too when that browser is installed; it says which.
 */
/* eslint-disable no-await-in-loop */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');

const { chromium, webkit } = require(process.env.PLAYWRIGHT_PATH || 'C:/coding/savant-wt/pw/node_modules/playwright'); // eslint-disable-line import/no-dynamic-require

const ROOT = path.join(__dirname, '..');
const PORT = 6857;
const BASE = `http://localhost:${PORT}`;
const SHOTS = process.env.WORDMARK_SHOTS;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;
const ok = async (name, fn) => { await fn(); passed++; console.log(`  ok  ${name}`); };

// What the page sees: the mark's letters and bars against its own viewBox, and the box on the screen.
const whole = () => {
  const svg = document.querySelector('.u2-wm');
  const vb = svg.viewBox.baseVal;
  const parts = [...svg.children].map((e) => e.getBBox());
  const box = svg.getBoundingClientRect();
  return {
    text: svg.querySelectorAll('text').length,
    left: Math.min(...parts.map((b) => b.x)) - vb.x,
    right: vb.x + vb.width - Math.max(...parts.map((b) => b.x + b.width)),
    top: Math.min(...parts.map((b) => b.y)) - vb.y,
    bottom: vb.y + vb.height - Math.max(...parts.map((b) => b.y + b.height)),
    ratio: box.width / box.height,
    wanted: vb.width / vb.height,
    onScreen: box.left >= 0 && box.right <= innerWidth,
  };
};
function check(m) {
  assert.strictEqual(m.text, 0, 'the wordmark has live text again');
  for (const side of ['left', 'right', 'top', 'bottom']) assert(m[side] >= 0, `the mark passes the ${side} of its viewBox by ${-m[side]}`);
  assert(Math.abs(m.ratio - m.wanted) < 0.05, `stretched: ${m.ratio} against ${m.wanted}`);
  assert(m.onScreen, 'the wordmark runs off the screen');
}

async function main() {
  await ok('look.js draws the wordmark from outlines: no <text>, nothing for a font to change', () => {
    const sandbox = { window: {}, document: {} };
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'public', 'js', 'ui2', 'look.js'), 'utf8'), sandbox);
    const svg = sandbox.window.U2Look.wordmark(30);
    assert(!/<text/.test(svg));
    assert(/<path d="M/.test(svg));
    assert(/role="img" aria-label="Savant"/.test(svg));
    assert(!/\.u2-wm text/.test(fs.readFileSync(path.join(ROOT, 'public', 'css', 'ui2', 'look.css'), 'utf8')));
  });

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ui2-wordmark-'));
  fs.mkdirSync(path.join(tmp, 'media'));
  const env = { ...process.env, UI_V2: 'on', ONBOARDING_V2: 'on', BETA_GATE: '', BETA_SIGNIN_ONLY: '', PORT: String(PORT), NODE_ENV: 'development', DB_FILE: path.join(tmp, 'db.json'), HOLDOUT_DIR: tmp, SPANISH_MEDIA_DIR: path.join(tmp, 'media'), XKIRO_LEARNER_UNTIL: '2000-01-01T00:00:00Z', FACT_CHECK_ALL: '0', MUNITO_LEARNER: 'off', CORAL_LEARNER: 'off', GLADIA_LEARNER: 'off', LYCEUM_LEARNER: 'off', GONKA_LEARNER: 'off', GROKIFIED_LEARNER: 'off', UPLOAD_AUTOBUILD: 'off', SPANISH_WRITE_AHEAD: 'off' };
  for (const k of Object.keys(env)) if (/_API_KEY$|_KEY$|_TOKEN$/.test(k)) env[k] = '';
  const server = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: 'ignore' });
  try {
    for (let i = 0; ; i++) {
      await delay(200);
      try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* up soon */ }
      if (i > 200) throw new Error('server did not start');
    }
    const engines = [['Chromium', chromium]];
    if (fs.existsSync(webkit.executablePath())) engines.push(['WebKit', webkit]);
    else console.log('  --  WebKit is not installed here, so this says nothing about Safari itself');
    for (const [name, engine] of engines) {
      const browser = await engine.launch();
      for (const width of [320, 375, 390]) {
        const ctx = await browser.newContext({ viewport: { width, height: 760 }, deviceScaleFactor: 3 });
        const page = await ctx.newPage();
        await ok(`${name} ${width}: whole on the /start welcome`, async () => {
          await page.goto(`${BASE}/start`);
          await page.waitForSelector('#wordmark .u2-wm', { state: 'visible' });
          check(await page.evaluate(whole));
          if (SHOTS) await page.locator('#wordmark').screenshot({ path: path.join(SHOTS, `${name}-${width}-start.png`) });
        });
        await ok(`${name} ${width}: whole in the top bar`, async () => {
          const reg = await ctx.request.post(`${BASE}/api/auth/register`, { headers: { Origin: BASE, 'Content-Type': 'application/json' }, data: JSON.stringify({ email: `wm-${name.toLowerCase()}-${width}@example.com`, password: 'test-password-123', display_name: 'Wm Tester', birth_year: 1990, birth_month: 5, country: 'US', agreed: true }) });
          assert(reg.status() < 300, `register ${reg.status()}`);
          await page.goto(`${BASE}/dashboard`);
          await page.waitForSelector('.u2-tb-wm .u2-wm', { state: 'visible', timeout: 15000 });
          check(await page.evaluate(whole));
          if (SHOTS) await page.locator('.u2-tb-wm').screenshot({ path: path.join(SHOTS, `${name}-${width}-top.png`) });
        });
        await ctx.close();
      }
      await browser.close();
    }
  } finally {
    server.kill();
    await delay(300);
    fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 3 });
  }
  console.log(`ui-v2-wordmark-test: ${passed} passed`);
}
main().catch((err) => { console.error(`FAIL  ${err.message}`); process.exit(1); });
