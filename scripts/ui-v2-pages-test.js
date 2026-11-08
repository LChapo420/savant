/**
 * The later pages under UI_V2 (docs/UI-V2.md): js/ui2/pages.js only moves what a page drew, so nothing a learner can do goes missing.
 *
 *   node scripts/ui-v2-pages-test.js [--port=6835]
 *
 * For each page, the same account opens it twice with UI_V2 on: once with js/ui2/pages.js kept out, once with it. Every link and button that could be seen the first time must be there the second.
 * A way back counts if the top bar has it. Own server, temporary database, a synthetic learner, every outside AI off, no keys, one browser.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/coding/savant-wt/pw/node_modules/playwright'); // eslint-disable-line import/no-dynamic-require

const arg = (name, d) => { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.split('=')[1] : d; };
const PORT = Number(arg('port', 6835));
const BASE = `http://localhost:${PORT}`;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0; let passed = 0;
const check = (name, ok, extra) => { if (ok) passed += 1; else failed += 1; console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 400)}` : ''}`); };

/** Every link and button a learner can see on the page: "a /path?enrollment=1" or "button Skip this level". */
const visibleControls = (skipBack) => { document.querySelectorAll('details').forEach((d) => { d.open = true; }); return [...document.querySelectorAll('main a[href], main button, #header a[href]')]
  .filter((n) => { const r = n.getBoundingClientRect(); return r.width > 1 && r.height > 1 && getComputedStyle(n).visibility !== 'hidden'; })
  .filter((n) => !n.closest('.u2-guide') && !n.closest('summary') && !(skipBack && n.id === 'u2-back')) // the top bar's back moves to where the page's own back link went
  .map((n) => (n.tagName === 'A' ? `a ${n.getAttribute('href')}` : `button ${(n.getAttribute('aria-label') || n.textContent).trim().replace(/^(Show|Hide) /, '')}`)); };

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ui2-pages-'));
  process.env.BETA_INVITES_FILE = path.join(tmp, 'invites.json');
  const invites = require('../services/beta-invites'); // eslint-disable-line global-require
  const env = { ...process.env, PORT: String(PORT), NODE_ENV: 'development', DB_FILE: path.join(tmp, 'db.json'), HOLDOUT_DIR: tmp, SPANISH_MEDIA_DIR: path.join(tmp, 'media'), UI_V2: 'on', ONBOARDING_V2: 'on', BETA_GATE: 'invite', XKIRO_LEARNER_UNTIL: '2000-01-01T00:00:00Z', FACT_CHECK_ALL: '0', MUNITO_LEARNER: 'off', CORAL_LEARNER: 'off', GLADIA_LEARNER: 'off', LYCEUM_LEARNER: 'off', GONKA_LEARNER: 'off', GROKIFIED_LEARNER: 'off', UPLOAD_AUTOBUILD: 'off', SPANISH_WRITE_AHEAD: 'off' };
  for (const k of Object.keys(env)) if (/_API_KEY$|_KEY$|_TOKEN$/.test(k)) env[k] = '';
  fs.mkdirSync(env.SPANISH_MEDIA_DIR, { recursive: true });
  const log = fs.openSync(path.join(tmp, 'server.log'), 'a');
  const server = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env, stdio: ['ignore', log, log] });
  for (let i = 0; i < 200; i++) { await delay(250); try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* up soon */ } } // eslint-disable-line no-await-in-loop
  const browser = await chromium.launch();
  try {
    const ctx0 = await browser.newContext();
    const call = (m, u, d) => ctx0.request.fetch(BASE + u, { method: m, headers: { Origin: BASE, 'Content-Type': 'application/json' }, data: d ? JSON.stringify(d) : undefined }).then(async (r) => ({ status: r.status(), json: await r.json().catch(() => null) }));
    const email = 'pages-test@example.com';
    await call('POST', '/api/auth/register', { email, password: 'test-password-123', display_name: 'Pat Pages', birth_year: 1990, birth_month: 5, country: 'US', agreed: true, invite_code: invites.approve(email).code });
    await call('POST', '/api/enrollments', { selections: [['math', 'algebra_1_part_a'], ['chess', 'chess_rules_learner']].map(([track_id, grade_id]) => ({ track_id, grade_id })) });
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
    const storage = await ctx0.storageState();
    const en = list[0].id;
    const chess = list[1].id;
    const REVIEW = { track: { id: 'math', name: 'Mathematics' }, grade: { name: 'Algebra 1, Part A' }, review: { gate: { total: 47, blocking: 12 }, durability: { horizon: 30, share: 0.4, at: 0.9 }, retrieve: [{ title: 'Combining like terms', reason: 'memory_check' }], counts: { memory_check: 1 }, minutes: 2, reteach: [{ title: 'Writing expressions', covers: 'A sentence as an expression.', lesson_level: 12 }], more: 2 } };
    const LESSON = { html: '<h2>Terms</h2><p>A term is a number, a letter, or both.</p><button onclick="window.polymathFinishLesson&&window.polymathFinishLesson()">Finish Lesson</button>', meta: { topic: 'Combining like terms', subject: 'Math', grade_band: 'Algebra 1', model: 'a test', level: 1 } };

    const stubs = { review: (p) => p.route(/\/api\/review\/\d+$/, (r) => (r.request().method() === 'GET' ? r.fulfill({ json: REVIEW }) : r.continue())), lesson: (p) => p.route('**/api/lessons/math/algebra_1_part_a/1', (r) => r.fulfill({ json: LESSON })) };
    const PAGES = [
      { name: 'subject page', url: `/path?enrollment=${en}`, ready: '.path-top', dressed: '.u2-page-guide' },
      { name: 'subject page, chess links', url: `/path?enrollment=${chess}`, ready: '.path-top', dressed: '.u2-page-guide' },
      { name: 'lesson page', url: `/base-lesson?track=math&grade=algebra_1_part_a&level=1&enrollment=${en}`, ready: '#base-lesson-host', dressed: '.u2-lesson-note', stub: stubs.lesson },
      { name: 'review, nothing due', url: `/review?enrollment=${en}`, ready: '.review-top', dressed: '.u2-page-guide' },
      { name: 'profile', url: '/profile', ready: '.pf', dressed: '.u2-pf-rows' },
      { name: 'My material', url: '/my-material', ready: '#upload', dressed: '.u2-tiles', ways: true },
      { name: 'calendar', url: '/calendar', ready: '.cal-bar, .notice', dressed: '.u2-fold' },
      { name: 'add a subject', url: '/onboarding', ready: '#tracks .track-card', dressed: '.u2-fold' },
      { name: 'review, a plan', url: `/review?enrollment=${en}`, ready: '.review-top', dressed: '.u2-page-guide', stub: stubs.review },
      { name: 'leaderboard and stats', url: '/stats', ready: '.u2-stats', dressed: '.u2-soon' }, // the phone's tab (js/ui2/stats.js), a page of its own
    ];
    const open = async (p, blockPages, size) => {
      const ctx = await browser.newContext({ storageState: storage, viewport: size });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      if (blockPages) await page.route('**/js/ui2/pages.js', (r) => r.fulfill({ contentType: 'application/javascript', body: '' }));
      if (p.stub) await p.stub(page);
      await page.goto(BASE + p.url);
      await page.waitForSelector(p.ready, { timeout: 25000 });
      if (!blockPages) await page.waitForSelector(p.dressed, { state: 'attached', timeout: 8000 }).catch(() => {});
      await delay(900);
      return { ctx, page, errors };
    };
    for (const p of PAGES) {
      console.log(p.name);
      for (const size of [{ width: 375, height: 760 }, { width: 1280, height: 800 }]) {
        const a = await open(p, true, size); // eslint-disable-line no-await-in-loop
        const showAll = (pg) => pg.evaluate(() => { document.querySelectorAll('.u2-way').forEach((w) => { w.hidden = false; }); });
        const before = await a.page.evaluate(visibleControls, true); // eslint-disable-line no-await-in-loop
        await a.ctx.close(); // eslint-disable-line no-await-in-loop
        const b = await open(p, false, size); // eslint-disable-line no-await-in-loop
        await showAll(b.page); // eslint-disable-line no-await-in-loop
        const after = await b.page.evaluate(visibleControls, false); // eslint-disable-line no-await-in-loop
        const missing = before.filter((c) => !after.includes(c));
        check(`${size.width} px: every link and button is still there (${before.length})`, !missing.length, missing);
        check(`${size.width} px: no sideways scroll`, await b.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) <= 1); // eslint-disable-line no-await-in-loop
        check(`${size.width} px: no page errors`, !b.errors.length, b.errors);
        check(`${size.width} px: dressed`, !!(await b.page.$(p.dressed))); // eslint-disable-line no-await-in-loop
        await b.ctx.close(); // eslint-disable-line no-await-in-loop
      }
    }
    // What moved into a fold is still there, one tap away, and the row presses open a unit.
    const { ctx, page } = await open(PAGES[0], false, { width: 375, height: 760 });
    const unit = page.locator('.unit-group:not(.is-current) .unit-head').first();
    const body = page.locator('.unit-group:not(.is-current) .unit-body').first();
    check('a closed unit starts shut', !(await body.isVisible()));
    await unit.locator('.unit-head-title').click();
    check('a press anywhere on its row opens it', await body.isVisible());
    await page.locator('.u2-fold summary').first().click();
    check('the notes are in the fold', /Diamonds are checkpoints/.test(await page.locator('.u2-fold').first().textContent()));
    check('the top bar names the subject', (await page.locator('#u2-tb-t').textContent()).trim() === 'Mathematics');
    await ctx.close();
    const r = await open(PAGES.find((p) => p.name === 'review, a plan'), false, { width: 375, height: 760 });
    check('review: the bubble says how much, from the page', /1 question, about 2 minutes\./.test(await r.page.locator('.u2-page-guide .u2-bubble').textContent()));
    check('review: back goes to the path', (await r.page.locator('#u2-back').getAttribute('href')).startsWith('/path?enrollment='));
    await r.ctx.close();
    // Done for today: the chosen minutes met, Keep going brings the same Continue back; the plan isn't written to.
    const dctx = await browser.newContext({ storageState: storage, viewport: { width: 375, height: 760 } });
    const dp = await dctx.newPage();
    const writes = [];
    dp.on('request', (q) => { if (q.method() !== 'GET' && /\/api\/plan/.test(q.url())) writes.push(q.url()); });
    let planBefore = null;
    dp.on('response', async (q) => { if (/\/api\/plan\/today/.test(q.url())) planBefore = await q.json().catch(() => null); });
    await dp.goto(`${BASE}/dashboard`);
    await dp.waitForSelector('#u2-start', { timeout: 25000 });
    check('not done yet: Continue, no done screen', !(await dp.$('#u2-done')));
    const startHref = await dp.getAttribute('#u2-start', 'href');
    await dp.route('**/api/ui2/today', (route) => route.fulfill({ json: { date: '2026-11-07', spent: 500, goal: 45, done: true } }));
    await dp.reload();
    await dp.waitForSelector('#u2-done', { timeout: 25000 });
    check('minutes met: done for today, the next step put away', await dp.isVisible('#u2-keep-going') && !(await dp.isVisible('#u2-start')));
    check('done for today on a phone keeps the subjects under it', await dp.isVisible('#u2-subjects'));
    await dp.click('#u2-keep-going');
    await dp.waitForSelector('#u2-start');
    check('Keep going: the same next step as before', await dp.getAttribute('#u2-start', 'href') === startHref);
    await dp.reload();
    await dp.waitForSelector('#u2-start', { timeout: 25000 });
    check('it stays open for the day once asked', !(await dp.$('#u2-done')));
    check('nothing written to the plan', !writes.length && !!planBefore, writes);
    await dctx.close();
    const m = await open(PAGES.find((p) => p.name === 'My material'), false, { width: 375, height: 760 });
    check('My material: one way open, the others a tap away', await m.page.isVisible('#upload') && !(await m.page.isVisible('#paste')));
    await m.page.locator('.u2-tile', { hasText: 'Paste' }).click();
    check('My material: the paste tile opens paste', await m.page.isVisible('#paste') && !(await m.page.isVisible('#upload')));
    await m.page.locator('.u2-fold summary', { hasText: 'Where it goes' }).click();
    check('My material: the privacy words are there, whole, one tap away', /The file itself is not kept/.test(await m.page.locator('.u2-fold', { hasText: 'Where it goes' }).textContent()));
    await m.ctx.close();
    const pr = await browser.newContext({ storageState: storage, viewport: { width: 375, height: 760 } });
    const pp = await pr.newPage();
    await pp.goto(`${BASE}/profile#retention-goals-card`);
    await pp.waitForSelector('.u2-pf-rows');
    await delay(500);
    check('profile: a link to a card inside a row opens the row', await pp.isVisible('#retention-goals-card'));
    await pr.close();
    const l = await open(PAGES[2], false, { width: 375, height: 760 });
    check('lesson: back goes to the path', (await l.page.locator('#u2-back').getAttribute('href')).startsWith('/path?enrollment='));
    await l.ctx.close();
  } finally {
    await browser.close().catch(() => {});
    server.kill();
  }
  console.log(`${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
