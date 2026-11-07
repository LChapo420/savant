/**
 * The owner's look at the giraffe and the split chat: real screenshots of the app, labelled, on one sheet.
 *
 *   node scripts/tutor-giraffe-sheet.js [--out=<dir>]     (default design-refs/tutor-giraffe-shots next to the app)
 *
 * Starts its own server on a temporary database with a synthetic learner (never real learner data) and every AI key blank; the chat's words are put in the page by this script
 * through a stub of the tutor's route, so the sheet costs nothing. The voice states are set with the same attributes a call sets (the call itself is tested in scripts/tutor-giraffe-browser-test.js). Needs Playwright (not an app dependency).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const pwPath = process.env.PLAYWRIGHT_PATH || 'C:/coding/savant-wt/pw/node_modules/playwright';
const { chromium } = require(pwPath); // eslint-disable-line import/no-dynamic-require
const ROOT = path.join(__dirname, '..');
const arg = (name, d) => { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.split('=').slice(1).join('=') : d; };
const OUT = arg('out', 'C:/coding/claudecommittdIq/folderThing/design-refs/tutor-giraffe-shots');
const PORT = Number(arg('port', 6813));
const BASE = `http://localhost:${PORT}`;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };
const SMALL = { viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };
const DESK = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 };

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'giraffe-sheet-'));
  const server = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), NODE_ENV: 'development', DB_FILE: path.join(tmp, 'db.json'), HOLDOUT_DIR: tmp, SPANISH_MEDIA_DIR: path.join(tmp, 'm'), SESSION_SECRET: 'browser-test-secret-browser-test-secret', OWNER_EMAIL: 'owner-test@example.com', GEMINI_API_KEY: '', MIMO_API_KEY: '', LLMGATEWAY_API_KEY: '', OPENROUTER_API_KEY: '', ANTHROPIC_API_KEY: '', AI_PROVIDER: 'none', SIGNIN_ONLY: '0' }, stdio: 'ignore' });
  for (let i = 0; i < 160; i++) { await delay(250); try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* up soon */ } }
  const browser = await chromium.launch();
  const shots = [];
  try {
    const seedCtx = await browser.newContext(PHONE);
    const call = (m, u, d) => seedCtx.request.fetch(BASE + u, { method: m, headers: { Origin: BASE, 'Content-Type': 'application/json' }, data: d ? JSON.stringify(d) : undefined }).then(async (r) => ({ status: r.status(), json: await r.json().catch(() => null) }));
    const reg = await call('POST', '/api/auth/register', { email: 'sheet@example.com', password: 'test-password-123', display_name: 'Gia', birth_year: 1990, birth_month: 5, country: 'US', agreed: true });
    if (reg.status >= 300) throw new Error(`register ${reg.status}`);
    await call('POST', '/api/enrollments', { selections: [{ track_id: 'math', grade_id: 'algebra_1_part_a' }] });
    const e = (await call('GET', '/api/enrollments')).json.enrollments[0];
    const st = await call('POST', '/api/placement/start', { enrollment_id: e.id });
    const q = [...(st.json.items || [])];
    for (let n = 0; q.length && n < 60; n++) {
      const it = q.shift();
      const r = await call('POST', '/api/placement/answer', { session_id: st.json.session_id, item_id: it.id, answer: (it.choices && (it.choices[0].text || it.choices[0])) || '1', ms: 3000 });
      if (r.json && r.json.next_item) q.push(r.json.next_item);
    }
    await call('POST', '/api/placement/finish', { session_id: st.json.session_id });
    const storage = await seedCtx.storageState();
    await seedCtx.close();

    const open = async (opts, url, extra = {}) => {
      const ctx = await browser.newContext({ ...opts, storageState: storage, ...extra });
      const page = await ctx.newPage();
      await page.route('**/api/tutor/dock', async (route) => {
        if (route.request().method() !== 'POST') return route.continue();
        return route.fulfill({ json: { reply: 'Try writing what you know as an equation first. What does the x stand for in this one?', source: 'ai', mode: 'full' } });
      });
      await page.goto(BASE + url);
      await page.waitForSelector('.tdock-g-btn', { timeout: 20000 });
      await delay(900);
      return { ctx, page };
    };
    const lesson = `/session?enrollment=${e.id}`;
    const snap = async (page, name, label) => { const f = path.join(OUT, `${name}.png`); await page.screenshot({ path: f }); shots.push({ file: f, label }); };
    const say = async (page, text) => { await page.fill('.tdock-form input', text); await page.click('.tdock-form .go'); await delay(250); };
    const state = (page, voice, word) => page.evaluate(({ voice, word }) => {
      const r = document.querySelector('.tdock-g'); r.dataset.voice = voice; r.dataset.mouth = voice === 'talking' ? 'talk' : ''; r.classList.add('has-status'); r.querySelector('.tdock-g-status').textContent = word; document.documentElement.classList.add('tdock-in-call');
    }, { voice, word });

    // Phone: the lesson.
    let { ctx, page } = await open(PHONE, lesson);
    await snap(page, '01-phone-lesson', 'Phone, lesson: the giraffe in the top bar. Nothing floats over the page.');
    await page.tap('.tdock-g-btn'); await delay(400);
    await say(page, 'Why do I need the variable here?');
    await snap(page, '02-chat-bottom', 'Tap: the chat from the bottom. The lesson still scrolls above it.');
    await page.evaluate(() => window.scrollBy(0, 240)); await delay(200);
    await snap(page, '03-chat-bottom-scrolled', 'The same, the lesson scrolled in the window above the chat.');
    await page.click('.s-top'); await delay(500);
    await snap(page, '04-chat-top', 'Chat from the top, the learner\'s choice (two small buttons, kept on the account).');
    await page.click('.tdock-close'); await delay(400);
    await state(page, 'listening', 'Listening'); await delay(200);
    await snap(page, '05-voice-listening', 'Voice call: listening. A quiet ring and the word; the ring moves with the voice.');
    await state(page, 'thinking', 'Thinking'); await delay(200);
    await snap(page, '06-voice-thinking', 'Voice call: thinking.');
    await state(page, 'talking', 'Talking'); await delay(170);
    await snap(page, '07-voice-talking', 'Voice call: talking. A simple mouth for now, with one place for synced shapes later.');
    await state(page, '', 'It went quiet, so the call ended.'); await delay(150);
    await snap(page, '07b-voice-ended', 'A quiet call hangs up by itself and says so, aloud and in words.');
    await ctx.close();

    // Phone: dashboard with its tab bar.
    ({ ctx, page } = await open(PHONE, '/dashboard'));
    await page.tap('.tdock-g-btn'); await delay(400);
    await snap(page, '08-home-chat', 'Home page: the giraffe beside the theme and sign-out buttons; the chat sits above the tab bar.');
    await ctx.close();

    // The dark theme.
    ({ ctx, page } = await open(PHONE, lesson, { colorScheme: 'dark' }));
    await page.tap('.tdock-g-btn'); await delay(400);
    await say(page, 'Why do I need the variable here?');
    await snap(page, '09-dark', 'Dark mode.');
    await ctx.close();

    // A very small phone.
    ({ ctx, page } = await open(SMALL, lesson));
    await page.tap('.tdock-g-btn'); await delay(400);
    await snap(page, '10-small-phone', 'A very small phone, 320 by 568.');
    await ctx.close();

    // Desktop.
    ({ ctx, page } = await open(DESK, '/dashboard'));
    await snap(page, '11-desktop-closed', 'Desktop: the giraffe in the sidebar, under the wordmark.');
    await page.click('.tdock-g-btn'); await delay(400);
    await say(page, 'What should I work on today?');
    await snap(page, '12-desktop-chat', 'Desktop: the chat is a panel beside the page, and the page narrows.');
    await ctx.close();
    ({ ctx, page } = await open(DESK, lesson));
    await page.click('.tdock-g-btn'); await delay(400);
    await say(page, 'Why do I need the variable here?');
    await snap(page, '13-desktop-lesson', 'Desktop, lesson: the giraffe in the player\'s top bar, the chat beside the page.');
    await ctx.close();

    // The sheet: real screenshots, each with its label, built as a page and photographed.
    const sheetCtx = await browser.newContext({ viewport: { width: 1680, height: 1000 }, deviceScaleFactor: 1 });
    const sheet = await sheetCtx.newPage();
    const card = (s) => `<figure><img src="data:image/png;base64,${fs.readFileSync(s.file).toString('base64')}"><figcaption>${s.label}</figcaption></figure>`;
    const phones = shots.filter((s) => !/desktop/.test(s.file));
    const desks = shots.filter((s) => /desktop/.test(s.file));
    await sheet.setContent(`<!doctype html><meta charset="utf-8"><style>
      body{margin:0;padding:28px;background:#f7f7f4;color:#1c1f24;font:15px/1.35 "Segoe UI",system-ui,sans-serif}
      h1{font-size:22px;margin:0 0 4px} p.sub{margin:0 0 22px;color:#5b616b}
      .row{display:flex;flex-wrap:wrap;gap:20px;align-items:flex-start}
      figure{margin:0;width:240px} .desk figure{width:520px}
      img{display:block;width:100%;border:1px solid #d5d8dd;border-radius:10px}
      figcaption{margin-top:6px;font-size:13px;color:#3c414a}
      h2{font-size:16px;margin:26px 0 10px}
    </style><h1>The tutor: giraffe and split chat</h1><p class="sub">Real screenshots of the app in Chromium, ${new Date().toISOString().slice(0, 10)}. Synthetic learner. Branch tutor-giraffe. Not on real phones yet.</p>
    <h2>Phone</h2><div class="row">${phones.map(card).join('')}</div>
    <h2>Desktop</h2><div class="row desk">${desks.map(card).join('')}</div>`);
    await delay(400);
    await sheet.screenshot({ path: path.join(OUT, 'contact-sheet.png'), fullPage: true });
    await sheetCtx.close();
    console.log(`sheet: ${path.join(OUT, 'contact-sheet.png')} (${shots.length} shots)`);
  } finally {
    await browser.close();
    server.kill();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
