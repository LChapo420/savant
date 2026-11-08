/**
 * Phone screenshots (375 wide, light) of the calendar suggestion card in the tutor chat and an event on the calendar.
 *
 *   node scripts/tutor-events-shots.js [outDir]
 *
 * Own server on a temporary database, synthetic learner, every AI key blank. Needs Playwright (not an app dependency).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/coding/savant-wt/pw/node_modules/playwright'); // eslint-disable-line import/no-dynamic-require

const ROOT = path.join(__dirname, '..');
const OUT = process.argv[2] || 'C:/coding/claudecommittdIq/folderThing/design-refs/tutor-events';
const PORT = 6841;
const BASE = `http://localhost:${PORT}`;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tev-shots-'));
  const server = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), NODE_ENV: 'development', DB_FILE: path.join(tmp, 'db.json'), HOLDOUT_DIR: tmp, SPANISH_MEDIA_DIR: path.join(tmp, 'm'), SESSION_SECRET: 'shots-secret-shots-secret-shots-secret', OWNER_EMAIL: 'owner-test@example.com', GEMINI_API_KEY: '', MIMO_API_KEY: '', OPENROUTER_API_KEY: '', ANTHROPIC_API_KEY: '', AI_PROVIDER: 'none', SIGNIN_ONLY: '0' }, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { try { const r = await fetch(`${BASE}/api/health`).catch(() => fetch(BASE)); if (r) break; } catch { /* waiting */ } await delay(500); }
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 760 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, colorScheme: 'light' });
    const api = async (method, url, body) => { const r = await ctx.request.fetch(BASE + url, { method, data: body, headers: { 'content-type': 'application/json' } }); return r.json().catch(() => ({})); };
    await api('POST', '/api/auth/register', { email: 'shots@example.com', password: 'test-password-123', display_name: 'Gia', birth_year: 1990, birth_month: 5, country: 'US', agreed: true });
    await api('POST', '/api/enrollments', { selections: [{ track_id: 'math', grade_id: 'algebra_1_part_a' }] });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/calendar`);
    await page.waitForSelector('.tdock-panel, .tdock-fab, [class*=tdock]', { timeout: 15000 });
    // open the chat
    const opener = await page.$('.tdock-giraffe, .tdock-open, .tdock-fab, .tdock-launch, [class*=tdock] button');
    if (opener) await opener.click().catch(() => {});
    await delay(500);
    const input = await page.$('.tdock-form input, .tdock-form textarea');
    if (!input) throw new Error('chat input not found');
    const today = new Date();
    const thu = new Date(today.getTime() + 3 * 86400000);
    const wd = thu.toLocaleDateString('en-US', { weekday: 'long' });
    await input.fill(`I have a math test on ${wd}`);
    await page.keyboard.press('Enter');
    await page.waitForSelector('.tdock-card', { timeout: 20000 });
    await delay(600);
    await page.screenshot({ path: path.join(OUT, 'chat-card-375-light.png') });
    // Add it, then show the calendar
    await page.click('.tdock-card .go');
    await page.waitForSelector('.tdock-card-sub', { timeout: 8000 }).catch(() => {});
    await delay(600);
    await page.screenshot({ path: path.join(OUT, 'chat-after-add-375-light.png') });
    const cal = await ctx.newPage();
    await cal.goto(`${BASE}/calendar`);
    await cal.waitForSelector('#my-events', { timeout: 15000 });
    await delay(800);
    await cal.screenshot({ path: path.join(OUT, 'calendar-375-light.png'), fullPage: true });
    console.log('screens written to', OUT);
  } finally {
    await browser.close();
    server.kill();
  }
})().catch((e) => { console.error(e); process.exit(1); });
