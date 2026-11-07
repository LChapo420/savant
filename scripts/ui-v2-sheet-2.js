/**
 * The owner's look at the later pages under UI_V2 (docs/UI-V2.md): real screenshots of the lesson, the subject page and review, labelled, on one contact sheet, to set beside design-refs/ui-v4-mockups.
 *
 *   node scripts/ui-v2-sheet-2.js [--out=<dir>] [--port=6833] [--only=path,lesson,review,...] [--mode=light|dark]
 *
 * Writes <out>/contact-sheet-2.png. Open '/about-none' waits to navigate until stubs are set. Own server, temporary database, synthetic learners only, every outside AI off, no keys. One browser. Stubbed replies are named on the sheet.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/coding/savant-wt/pw/node_modules/playwright'); // eslint-disable-line import/no-dynamic-require

const ROOT = path.join(__dirname, '..');
const arg = (name, d) => { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.split('=').slice(1).join('=') : d; };
const OUT = arg('out', 'C:/coding/claudecommittdIq/folderThing/design-refs/ui-v4-shots');
const PORT = Number(arg('port', 6833));
const MODE = arg('mode', 'light');
const ONLY = arg('only', '');
const want = (k) => !ONLY || ONLY.split(',').includes(k);
const BASE = `http://localhost:${PORT}`;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const PHONE = { width: 375, height: 760 };
const DESK = { width: 1280, height: 800 };

function serverEnv(tmp) {
  const env = { ...process.env, PORT: String(PORT), NODE_ENV: 'development', DB_FILE: path.join(tmp, 'db.json'), HOLDOUT_DIR: tmp, SPANISH_MEDIA_DIR: path.join(tmp, 'media'), UI_V2: 'on', ONBOARDING_V2: 'on', BETA_GATE: 'invite', BETA_INVITES_FILE: path.join(tmp, 'invites.json'), XKIRO_LEARNER_UNTIL: '2000-01-01T00:00:00Z', FACT_CHECK_ALL: '0', MUNITO_LEARNER: 'off', CORAL_LEARNER: 'off', GLADIA_LEARNER: 'off', LYCEUM_LEARNER: 'off', GONKA_LEARNER: 'off', GROKIFIED_LEARNER: 'off', UPLOAD_AUTOBUILD: 'off', SPANISH_WRITE_AHEAD: 'off' };
  for (const k of Object.keys(env)) if (/_API_KEY$|_KEY$|_TOKEN$/.test(k)) env[k] = ''; // no key reaches this server, whatever the shell holds
  return env;
}

async function main() {
  const raw = path.join(OUT, 'raw');
  fs.mkdirSync(raw, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ui2-sheet2-'));
  process.env.BETA_INVITES_FILE = path.join(tmp, 'invites.json');
  const invites = require('../services/beta-invites'); // eslint-disable-line global-require
  fs.mkdirSync(path.join(tmp, 'media'), { recursive: true });
  const log = fs.openSync(path.join(tmp, 'server.log'), 'a');
  const server = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: serverEnv(tmp), stdio: ['ignore', log, log] });
  for (let i = 0; i < 200; i++) { await delay(250); try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* up soon */ } } // eslint-disable-line no-await-in-loop
  const browser = await chromium.launch();
  const cells = [];
  const problems = [];
  const device = { viewport: PHONE, deviceScaleFactor: 2, colorScheme: MODE };

  const account = async (email, name, enrol) => {
    const ctx = await browser.newContext(device);
    const call = (m, u, d) => ctx.request.fetch(BASE + u, { method: m, headers: { Origin: BASE, 'Content-Type': 'application/json' }, data: d ? JSON.stringify(d) : undefined }).then(async (r) => ({ status: r.status(), json: await r.json().catch(() => null) }));
    const reg = await call('POST', '/api/auth/register', { email, password: 'test-password-123', display_name: name, birth_year: 1990, birth_month: 5, country: 'US', agreed: true, invite_code: invites.approve(email).code });
    if (reg.status >= 300) throw new Error(`register ${reg.status} ${JSON.stringify(reg.json)}`);
    await call('POST', '/api/enrollments', { selections: enrol.map(([track_id, grade_id]) => ({ track_id, grade_id })) });
    const list = (await call('GET', '/api/enrollments')).json.enrollments;
    for (const e of list) {
      const st = await call('POST', '/api/placement/start', { enrollment_id: e.id }); // eslint-disable-line no-await-in-loop
      const q = [...((st.json && st.json.items) || [])];
      for (let n = 0; q.length && n < 60; n++) {
        const it = q.shift();
        const r = await call('POST', '/api/placement/answer', { session_id: st.json.session_id, item_id: it.id, answer: (it.choices && (it.choices[0].text || it.choices[0])) || '1', ms: 3000 }); // eslint-disable-line no-await-in-loop
        if (r.json && r.json.next_item) q.push(r.json.next_item);
      }
      await call('POST', '/api/placement/finish', { session_id: st.json.session_id }); // eslint-disable-line no-await-in-loop
    }
    const storage = await ctx.storageState();
    await ctx.close();
    return { storage, list, email };
  };
  const open = async (who, url, size = PHONE, stubs = null) => {
    const ctx = await browser.newContext({ ...device, viewport: size, storageState: who.storage });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push(`${url}: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404|401|403/.test(m.text())) problems.push(`${url}: ${m.text()}`); });
    if (stubs) await stubs(page);
    if (url !== '/about-none') await page.goto(BASE + url);
    return { ctx, page };
  };
  const snap = async (page, name, label, note = '', full = false) => {
    await delay(350);
    const f = path.join(raw, `s2-${name}.png`);
    await page.screenshot({ path: f, fullPage: full });
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (over > 1) problems.push(`${name}: ${over}px sideways`);
    cells.push({ f, label, note, wide: page.viewportSize().width > 500 });
    console.log('shot', name);
  };

  try {
    const ada = await account('ada-pages@example.com', 'Ada Tester', [['math', 'algebra_1_part_a'], ['chess', 'chess_rules_learner'], ['english', 'proficient']]);
    const en = ada.list[0].id;
    const chessEn = (ada.list[1] || ada.list[0]).id;
    if (want('path')) {
      const { ctx, page } = await open(ada, `/path?enrollment=${en}`);
      await page.waitForSelector('.path-top, .notice', { timeout: 25000 });
      await snap(page, 'path-top', 'Subject page');
      await page.evaluate(() => { const h = [...document.querySelectorAll('.section-title, #u2-grade-h')].find((x) => /path|grade/i.test(x.textContent)); if (h) h.scrollIntoView(); window.scrollBy(0, -60); });
      await snap(page, 'path-units', 'The whole grade');
      await page.evaluate(() => { const b = document.querySelector('.unit-group:not(.is-current) .unit-toggle'); if (b) { b.click(); b.scrollIntoView({ block: 'center' }); } });
      await snap(page, 'path-open', 'A unit opened');
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await snap(page, 'path-end', 'Skills at this level');
      await ctx.close();
      const d = await open(ada, `/path?enrollment=${en}`, DESK);
      await d.page.waitForSelector('.path-top, .notice', { timeout: 25000 });
      await snap(d.page, 'path-desk', 'Desktop: subject page');
      await d.ctx.close();
      const c = await open(ada, `/path?enrollment=${chessEn}`);
      await c.page.waitForSelector('.path-top, .notice', { timeout: 25000 });
      await snap(c.page, 'path-chess', 'Chess: its own links');
      await c.ctx.close();
    }
    if (want('lesson')) {
      const url = `/session?enrollment=${en}`;
      const { ctx, page } = await open(ada, url);
      await page.waitForSelector('.lesson, #item, .notice, .card', { timeout: 25000 });
      await delay(2500);
      await snap(page, 'lesson-top', 'Lesson', 'The standard session');
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await delay(500);
      await snap(page, 'lesson-end', 'Lesson, its end');
      await ctx.close();
      const d = await open(ada, url, DESK);
      await delay(3000);
      await snap(d.page, 'lesson-desk', 'Desktop: lesson');
      await d.ctx.close();
      const LESSON = { html: '<h2>Terms</h2><p>A term is a number, a letter, or both multiplied together. Terms are like when they have the same letter.</p><button onclick="window.polymathFinishLesson&&window.polymathFinishLesson()">Finish Lesson</button>', meta: { topic: 'Combining like terms', subject: 'Math', grade_band: 'Algebra 1', model: 'a model', level: 1 } };
      const fr = await open(ada, `/base-lesson?track=math&grade=algebra_1_part_a&level=1&enrollment=${en}`, PHONE, (p) => p.route('**/api/lessons/math/algebra_1_part_a/1', (r) => r.fulfill({ json: LESSON })));
      await delay(1500);
      await snap(fr.page, 'lesson-page', 'A written lesson page', 'Body stubbed: the shell is what shows');
      await fr.ctx.close();
      const none = await open(ada, `/base-lesson?track=math&grade=algebra_1_part_a&level=99999&enrollment=${en}`);
      await delay(1500);
      await snap(none.page, 'lesson-missing', 'Lesson not written yet');
      await none.ctx.close();
    }
    if (want('review')) {
      const PLAN = { track: { id: 'math', name: 'Mathematics' }, grade: { name: 'Algebra 1, Part A' }, review: { gate: { total: 47, blocking: 12 }, durability: { horizon: 30, share: 0.4, at: 0.9 }, retrieve: [{ objective_id: 'a', title: 'Combining like terms', reason: 'memory_check' }, { objective_id: 'b', title: 'Solving one-step equations', reason: 'fading' }, { objective_id: 'c', title: 'The distributive property', reason: 'durability' }], counts: { memory_check: 1, fading: 1, durability: 1 }, minutes: 4, reteach: [{ title: 'Writing expressions', covers: 'Turn a sentence into an expression.', lesson_level: 12, minutes: 6 }], more: 2 } };
      const stub = (plan) => async (page) => { await page.route(/\/api\/review\/\d+$/, (route) => (route.request().method() === 'GET' ? route.fulfill({ json: plan }) : route.continue())); };
      const real = await open(ada, `/review?enrollment=${en}`);
      await delay(1500);
      await snap(real.page, 'review-real', 'Review, real answer for this account');
      await real.ctx.close();
      const { ctx, page } = await open(ada, `/review?enrollment=${en}`, PHONE, stub(PLAN));
      await delay(1200);
      await snap(page, 'review-plan', 'Review', 'Plan stubbed: new account');
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await snap(page, 'review-plan-end', 'Review, what is in it');
      await ctx.close();
      const d = await open(ada, `/review?enrollment=${en}`, DESK, stub(PLAN));
      await delay(1200);
      await snap(d.page, 'review-desk', 'Desktop: review', 'Plan stubbed');
      await d.ctx.close();
      const q = await open(ada, `/review?enrollment=${en}`, PHONE, async (page2) => {
        await stub(PLAN)(page2);
        await page2.route(/\/api\/review\/\d+\/start$/, (route) => route.fulfill({ json: { session_id: 1, items: [{ id: 'x', format: 'multiple_choice', prompt: 'Simplify: 3x + 2x', choices: ['5x', '6x', '5x\u00b2', '3x + 2'], review_reason: 'memory_check' }] } }));
      });
      await delay(1000);
      await q.page.click('#start');
      await delay(1500);
      await snap(q.page, 'review-question', 'Review: a question', 'Stubbed, the same player');
      await q.ctx.close();
    }

    const apiCall = async (who, m, u, d) => {
      const c = await browser.newContext({ storageState: who.storage });
      const r = await c.request.fetch(BASE + u, { method: m, headers: { Origin: BASE, 'Content-Type': 'application/json' }, data: d ? JSON.stringify(d) : undefined });
      const json = await r.json().catch(() => null);
      await c.close();
      return { status: r.status(), json };
    };
    if (want('profile')) {
      const { ctx, page } = await open(ada, '/profile');
      await page.waitForSelector('.pf', { timeout: 25000 });
      await delay(1200);
      await snap(page, 'profile-top', 'Profile');
      await page.evaluate(() => window.scrollBy(0, 640));
      await snap(page, 'profile-mid', 'Profile, further down');
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await snap(page, 'profile-end', 'Profile, its end');
      await page.evaluate(() => { const d = [...document.querySelectorAll('.u2-row-fold')].find((x) => /data and plan/i.test(x.textContent)); if (d) { d.open = true; d.scrollIntoView(); window.scrollBy(0, -60); } });
      await snap(page, 'profile-open', 'Profile, a row opened');
      await ctx.close();
      const d = await open(ada, '/profile', DESK);
      await delay(2000);
      await snap(d.page, 'profile-desk', 'Desktop: profile');
      await d.ctx.close();
    }
    if (want('material')) {
      const text = 'The Moon causes most tides. Gravity from the Moon pulls the ocean toward it. '.repeat(30);
      const made = await apiCall(ada, 'POST', '/api/materials/paste', { title: 'Chapter 4: The tides', text });
      const mid = made.json && made.json.materials && made.json.materials[0] && made.json.materials[0].id;
      const { ctx, page } = await open(ada, '/my-material');
      await page.waitForSelector('#upload', { timeout: 25000 });
      await delay(900);
      await snap(page, 'material-top', 'My material');
      await page.evaluate(() => { const c = [...document.querySelectorAll('.u2-tile')].find((x) => /Paste/.test(x.textContent)); if (c) c.click(); });
      await snap(page, 'material-paste', 'My material: paste');
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await snap(page, 'material-list', 'My material: the list');
      await ctx.close();
      const d = await open(ada, '/my-material', DESK);
      await delay(1500);
      await snap(d.page, 'material-desk', 'Desktop: my material');
      await d.ctx.close();
      const STUDY = { course: { title: 'Chapter 4: The tides', status: 'ready' }, mastered: 1, total: 3, reading: { label: 'Full depth', minutes: 12, checks: 6 }, next: { kind: 'lesson', title: 'What causes tides', skill: 's2' }, units: [{ title: 'The Moon and the sea', skills: ['s1', 's2', 's3'] }], skills: [{ id: 's1', title: 'Gravity pulls the sea', level: 1, status: 'mastered', tier: 1, tier_name: 'recall', open: true, summary: 'The pull is strongest on the near side.' }, { id: 's2', title: 'What causes tides', level: 2, status: 'learning', tier: 1, tier_name: 'recall', open: true }, { id: 's3', title: 'Spring and neap tides', level: 3, status: 'new', open: false }] };
      const st = await open(ada, `/my-material-study?id=${mid}`, PHONE, (p) => p.route(/\/api\/materials\/\d+\/study$/, (r) => r.fulfill({ json: STUDY })));
      await delay(1500);
      await snap(st.page, 'material-study-map', 'My material: a course', 'Reply stubbed: no build here');
      await st.ctx.close();
      for (const sub of ['pack', 'notes', 'study', 'test', 'cards', 'podcast']) {
        const o = await open(ada, `/my-material-${sub}?id=${mid}`); // eslint-disable-line no-await-in-loop
        await delay(1800); // eslint-disable-line no-await-in-loop
        await snap(o.page, `material-${sub}`, `My material: ${sub}`, 'No build here: what a learner sees before one'); // eslint-disable-line no-await-in-loop
        await o.ctx.close(); // eslint-disable-line no-await-in-loop
      }
    }
    if (want('calendar')) {
      const { ctx, page } = await open(ada, '/calendar');
      await page.waitForSelector('.cal-grid, .notice', { timeout: 25000 });
      await delay(700);
      await snap(page, 'calendar', 'Calendar');
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await snap(page, 'calendar-end', 'Calendar, its end');
      await ctx.close();
      const d = await open(ada, '/calendar', DESK);
      await delay(1500);
      await snap(d.page, 'calendar-desk', 'Desktop: calendar');
      await d.ctx.close();
    }
    if (want('past')) {
      const UPLOADS = { can_upload: true, materials: [{ id: 4, title: 'Photosynthesis notes', kind: 'text', status: 'ready', mastered: 6, total: 6, due: 1, started: true, complete: true }] };
      const { ctx, page } = await open(ada, '/dashboard#past', PHONE, (p) => p.route('**/api/ui2/material-progress', (route) => route.fulfill({ json: UPLOADS })));
      await delay(2500);
      await snap(page, 'past', 'Past', 'Upload stubbed');
      await ctx.close();
    }
    if (want('add')) {
      const { ctx, page } = await open(ada, '/onboarding');
      await delay(2000);
      await snap(page, 'add', 'Add a subject');
      await page.evaluate(() => window.scrollBy(0, 500));
      await snap(page, 'add-2', 'Add a subject, further down');
      await ctx.close();
      const d = await open(ada, '/onboarding', DESK);
      await delay(2000);
      await snap(d.page, 'add-desk', 'Desktop: add a subject');
      await d.ctx.close();
    }
    if (want('done')) {
      const STUB = { spent: 50, goal: 45, done: true, date: '2026-11-07' };
      const { ctx, page } = await open(ada, '/about-none', PHONE, (p) => p.route('**/api/ui2/today', (route) => route.fulfill({ json: STUB })));
      await page.goto(`${BASE}/dashboard`);
      await delay(2500);
      await snap(page, 'done', 'Done for today', 'Minutes stubbed');
      const k = await page.$('#u2-keep-going');
      if (k) { await k.click(); await delay(400); await snap(page, 'done-keep', 'After Keep going'); }
      await ctx.close();
    }

    if (want('states')) {
      const slow = await open(ada, '/about-none', PHONE, (p) => p.route('**/api/path/**', async () => { /* never answers */ })).catch(() => null);
      if (slow) { slow.page.goto(`${BASE}/path?enrollment=${en}`).catch(() => {}); await delay(1500); await snap(slow.page, 'state-loading', 'Loading'); await slow.ctx.close(); }
      const bad = await open(ada, '/about-none', PHONE, (p) => p.route('**/api/path/**', (route) => route.fulfill({ status: 500, json: { error: 'Something went wrong on our side.' } })));
      await bad.page.goto(`${BASE}/path?enrollment=${en}`).catch(() => {});
      await delay(1500);
      await snap(bad.page, 'state-error', 'Error on load', 'Reply stubbed');
      await bad.ctx.close();
      const nf = await open(ada, '/no-such-page');
      await delay(1200);
      await snap(nf.page, 'state-404', 'Not found');
      await nf.ctx.close();
      const off = await open(ada, '/dashboard');
      await off.page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.ready.then(() => true), null, { timeout: 15000 }).catch(() => {});
      await delay(2500);
      server.kill(); // the page's own offline switch doesn't reach a service worker; a server that is gone does
      await delay(800);
      await off.page.goto(`${BASE}/path?enrollment=${en}`).catch(() => {});
      await delay(1500);
      await snap(off.page, 'state-offline', 'Offline', 'Really offline: from the service worker');
      await off.ctx.close();
    }
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
    const page = await ctx.newPage();
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const b64 = (f) => `data:image/png;base64,${fs.readFileSync(f).toString('base64')}`;
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:28px 34px;background:#f4f5f7;font:15px system-ui;color:#15171b;width:max-content}h1{margin:0 0 18px;font-size:24px}.g{display:grid;grid-template-columns:repeat(5,300px);gap:24px 26px;align-items:start}.w{grid-column:span 2}.l{height:26px;font-weight:700;white-space:nowrap;overflow:hidden}.l span{font-weight:400;color:#666b75;font-size:13px;margin-left:6px}img{display:block;width:100%;border-radius:22px;box-shadow:0 0 0 1px #e3e5e9;background:#fff}</style><h1>Savant, the real app with UI_V2=on: the later pages. Phone 375 x 760, desktop 1280 x 800, ${MODE}. Synthetic learners, no outside AI.</h1><div class="g">${cells.map((c, i) => `<div class="${c.wide ? 'w' : ''}"><div class="l">${i + 1}. ${esc(c.label)}<span>${esc(c.note || '')}</span></div><img src="${b64(c.f)}"></div>`).join('')}</div>`);
    await delay(300);
    await page.screenshot({ path: path.join(OUT, 'contact-sheet-2.png'), fullPage: true });
    console.log('sheet contact-sheet-2.png');
  } finally {
    await browser.close().catch(() => {});
    server.kill();
    if (problems.length) console.log('PROBLEMS', problems.slice(0, 20));
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
