/**
 * Screenshots of the tutor's voice picker (TUTOR_VOICE_PICKER) under UI_V2, light, at phone width (375) and desktop (1280).
 *
 *   node scripts/voice-picker-shots.js [--out=<dir>]   (default C:/coding/claudecommittdIq/folderThing/design-refs/voice-fast)
 *
 * Synthetic account on a temporary database. No paid call: no voice call is started and the gateway key is a dummy, so nothing reaches the gateway.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/coding/savant-wt/pw/node_modules/playwright'); // eslint-disable-line import/no-dynamic-require
const ROOT = path.join(__dirname, '..');
const arg = (name, d) => { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.split('=').slice(1).join('=') : d; };
const OUT = arg('out', 'C:/coding/claudecommittdIq/folderThing/design-refs/voice-fast');
const PORT = Number(arg('port', 6831));
const BASE = `http://localhost:${PORT}`;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'picker-'));
  const server = spawn(process.execPath, ['server.js'], { cwd: ROOT, stdio: 'ignore', env: { ...process.env, PORT: String(PORT), NODE_ENV: 'development', DB_FILE: path.join(tmp, 'db.json'), HOLDOUT_DIR: tmp, SESSION_SECRET: 'browser-test-secret-browser-test-secret', OWNER_EMAIL: 'owner-test@example.com', SIGNIN_ONLY: '0', UI_V2: '1', TUTOR_VOICE_PICKER: '1', SPANISH_GATEWAY_USERS: '1', LLMGATEWAY_API_KEY: 'dummy-not-a-key', LLMGATEWAY_LEDGER_FILE: path.join(tmp, 'gw-ledger.json') } });
  for (let i = 0; i < 200; i++) { await delay(250); try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* up soon */ } }
  const browser = await chromium.launch();
  let registered = false;
  try {
    for (const [name, viewport] of [['mobile-375', { width: 375, height: 812 }], ['desktop-1280', { width: 1280, height: 800 }]]) {
      const ctx = await browser.newContext({ viewport, colorScheme: 'light' });
      const call = (m, u, d) => ctx.request.fetch(BASE + u, { method: m, headers: { Origin: BASE, 'Content-Type': 'application/json' }, data: d ? JSON.stringify(d) : undefined });
      if (!registered) { await call('POST', '/api/auth/register', { email: 'picker@example.com', password: 'test-password-123', display_name: 'Gia', birth_year: 1990, birth_month: 5, country: 'US', agreed: true }); registered = true; } else await call('POST', '/api/auth/login', { email: 'picker@example.com', password: 'test-password-123' });
      const page = await ctx.newPage();
      await page.goto(`${BASE}/dashboard`);
      await page.waitForSelector('.tdock-g-btn', { state: 'attached' });
      await delay(600);
      await page.evaluate(() => document.querySelector('.tdock-g-btn').click());
      await page.waitForSelector('#tdock-voice-pick', { timeout: 8000 });
      await page.selectOption('#tdock-voice-pick', 'Charlotte');
      await delay(700);
      const info = await page.evaluate(() => ({ choices: document.querySelectorAll('#tdock-voice-pick option').length, picked: document.querySelector('#tdock-voice-pick').value, ui2: document.documentElement.hasAttribute('data-ui2'), sideways: document.documentElement.scrollWidth > window.innerWidth }));
      await page.screenshot({ path: path.join(OUT, `picker-${name}-light.png`) });
      await page.locator('.tdock-panel').screenshot({ path: path.join(OUT, `picker-${name}-light-panel.png`) });
      console.log(name, JSON.stringify(info));
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.kill();
  }
})().catch((e) => { console.error(e); process.exit(1); });
