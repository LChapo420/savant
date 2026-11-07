/**
 * UI_V2 (docs/UI-V2.md) in a real browser, first slice: Home, the menu, the top bar, the answer sheet; phone 375 and 320, desktop, light and dark, keyboard, reduced motion. And with the flag off, no trace of it.
 *
 *   node scripts/ui-v2-browser-test.js
 *
 * Own server, temporary database, synthetic learners only, no outside AI. Needs Playwright (PLAYWRIGHT_PATH, default the shared copy). One browser.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/coding/savant-wt/pw/node_modules/playwright'); // eslint-disable-line import/no-dynamic-require

const ROOT = path.join(__dirname, '..');
const PORT = 6851;
const BASE = `http://localhost:${PORT}`;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const PHONE = { viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };
const SMALL = { viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };
const DESK = { viewport: { width: 1280, height: 800 } };

let passed = 0;
const failures = [];
async function t(name, fn) {
  try { await fn(); passed++; console.log(`  ok  ${name}`); } catch (err) { failures.push(name); console.log(`FAIL  ${name}\n      ${String(err.message).split('\n').slice(0, 4).join('\n      ')}`); }
}

function start(flag, tmp) {
  const env = { ...process.env, PORT: String(PORT), NODE_ENV: 'development', DB_FILE: path.join(tmp, 'db.json'), HOLDOUT_DIR: tmp, SPANISH_MEDIA_DIR: path.join(tmp, 'media'), XKIRO_LEARNER_UNTIL: '2000-01-01T00:00:00Z', FACT_CHECK_ALL: '0', MUNITO_LEARNER: 'off', CORAL_LEARNER: 'off', GLADIA_LEARNER: 'off', LYCEUM_LEARNER: 'off', GONKA_LEARNER: 'off', GROKIFIED_LEARNER: 'off', UPLOAD_AUTOBUILD: 'off', SPANISH_WRITE_AHEAD: 'off' };
  for (const k of Object.keys(env)) if (/_API_KEY$|_KEY$|_TOKEN$/.test(k)) env[k] = '';
  if (flag) env.UI_V2 = flag; else delete env.UI_V2;
  return spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: 'ignore' });
}
async function up() { for (let i = 0; i < 200; i++) { await delay(200); try { if ((await fetch(`${BASE}/api/health`)).ok) return; } catch { /* up soon */ } } throw new Error('server did not start'); } // eslint-disable-line no-await-in-loop

async function account(browser, email, name, enrol) {
  const ctx = await browser.newContext();
  const call = (m, u, d) => ctx.request.fetch(BASE + u, { method: m, headers: { Origin: BASE, 'Content-Type': 'application/json' }, data: d ? JSON.stringify(d) : undefined }).then(async (r) => ({ status: r.status(), json: await r.json().catch(() => null) }));
  const reg = await call('POST', '/api/auth/register', { email, password: 'test-password-123', display_name: name, birth_year: 1990, birth_month: 5, country: 'US', agreed: true });
  assert(reg.status < 300, `register ${reg.status}`);
  let enrollment = null;
  if (enrol) {
    await call('POST', '/api/enrollments', { selections: enrol.map(([track_id, grade_id]) => ({ track_id, grade_id })) });
    const list = (await call('GET', '/api/enrollments')).json.enrollments;
    enrollment = list[0].id;
    for (const e of list) {
      if (enrol.placed === false) break;
      const st = await call('POST', '/api/placement/start', { enrollment_id: e.id }); // eslint-disable-line no-await-in-loop
      const q = [...((st.json && st.json.items) || [])];
      for (let n = 0; q.length && n < 60; n++) {
        const it = q.shift();
        const r = await call('POST', '/api/placement/answer', { session_id: st.json.session_id, item_id: it.id, answer: (it.choices && (it.choices[0].text || it.choices[0])) || '1', ms: 3000 }); // eslint-disable-line no-await-in-loop
        if (r.json && r.json.next_item) q.push(r.json.next_item);
      }
      await call('POST', '/api/placement/finish', { session_id: st.json.session_id }); // eslint-disable-line no-await-in-loop
    }
  }
  const storage = await ctx.storageState();
  await ctx.close();
  return { storage, enrollment };
}

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ui2-browser-'));
  fs.mkdirSync(path.join(tmp, 'media'));
  const server = start('on', tmp);
  const browser = await chromium.launch();
  let serverOff = null;
  try {
    await up();
    const ada = await account(browser, 'ada@example.com', 'Ada Tester', [['math', 'algebra_1_part_a'], ['chess', 'chess_rules_learner']]);
    // A fresh learner for each set of answers, on mostly tap-an-answer questions: answering on and on ends a sitting and can hold the level.
    const eve = async (n) => account(browser, `eve${n}@example.com`, 'Eve Tester', [['english', 'grammar']]);
    const nia = await account(browser, 'new@example.com', 'Nia New', null);
    const pendingList = [['math', 'algebra_1_part_a']]; pendingList.placed = false;
    const pat = await account(browser, 'pending@example.com', 'Pat Pending', pendingList);

    const open = async (who, device, url, extra = {}) => {
      const ctx = await browser.newContext({ ...device, storageState: who.storage, ...extra });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(BASE + url);
      return { ctx, page, errors };
    };
    const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    const answerUntilSheet = async (page) => {
      for (let i = 0; i < 40; i++) {
        await delay(300); // eslint-disable-line no-await-in-loop
        if (await page.$('.verdict [data-act="next"]')) return true; // eslint-disable-line no-await-in-loop
        const choices = await page.$$('.choice'); // eslint-disable-line no-await-in-loop
        const typed = await page.$('.answer-row input:not([disabled])'); // eslint-disable-line no-await-in-loop
        if (choices.length) await choices[0].click(); // eslint-disable-line no-await-in-loop
        else if (typed) await typed.fill('7'); // eslint-disable-line no-await-in-loop
        else {
          const go = await page.$('.player button.btn-primary'); // eslint-disable-line no-await-in-loop
          if (go) await go.click().catch(() => {}); // eslint-disable-line no-await-in-loop
          continue;
        }
        const submit = await page.$('.check-bar button, .answer-row button'); // eslint-disable-line no-await-in-loop
        if (submit) await submit.click().catch(() => {}); // eslint-disable-line no-await-in-loop
        await page.waitForSelector('.verdict', { timeout: 6000 }).catch(() => {}); // eslint-disable-line no-await-in-loop
      }
      return false;
    };

    await t('Home: one strong button, the same first step as GET /api/plan/today, no tab bar, no streak or XP, dots', async () => {
      const { ctx, page, errors } = await open(ada, PHONE, '/dashboard');
      await page.waitForSelector('#u2-start');
      const plan = await page.evaluate(() => fetch('/api/plan/today').then((r) => r.json()));
      const first = plan.blocks.find((b) => b.kind !== 'break' && b.href);
      assert.strictEqual(await page.getAttribute('#u2-start', 'href'), first.href);
      assert.strictEqual(await page.$('#tabbar'), null);
      assert.strictEqual(await page.$('.site-header .nav'), null);
      assert.strictEqual(await page.$('.header-stats'), null);
      assert(!/\bXP\b|day streak|in a row/i.test(await page.innerText('#u2-home')));
      assert((await page.$$('.u2-segs i')).length >= plan.blocks.length);
      assert((await page.$$('#u2-home .u2-btn')).length === 1);
      assert(await page.isVisible('.site-header .tdock-g-btn'), 'giraffe in the top bar');
      assert.strictEqual(await page.evaluate(() => getComputedStyle(document.querySelector('.tdock-g')).position === 'fixed'), false);
      assert(await page.isVisible('.site-header [data-study="start"]'), 'Start session in the bar');
      assert.deepStrictEqual(errors, []);
      await ctx.close();
    });

    await t('Home: the steps sheet and the minutes picker work, and the choice is kept', async () => {
      const { ctx, page } = await open(ada, PHONE, '/dashboard');
      await page.waitForSelector('#u2-peek');
      await page.click('#u2-peek');
      await page.waitForSelector('dialog .u2-steps li');
      await page.keyboard.press('Escape');
      await page.waitForSelector('dialog', { state: 'detached' });
      assert.strictEqual(await page.evaluate(() => document.activeElement && document.activeElement.id), 'u2-peek', 'focus back on the opener');
      await page.click('#u2-minutes');
      await page.click('dialog [data-minutes="60"]');
      await page.waitForFunction(() => document.querySelector('#u2-minutes') && document.querySelector('#u2-minutes').textContent.includes('60'));
      const saved = await page.evaluate(() => fetch('/api/plan/today').then((r) => r.json()));
      assert.strictEqual(saved.minutes, 60);
      await page.keyboard.press('Escape');
      await page.click('#u2-minutes');
      await page.click('dialog [data-minutes="45"]');
      await page.waitForFunction(() => document.querySelector('#u2-minutes').textContent.includes('45'));
      await ctx.close();
    });

    await t('Everything: opens from the menu and back again; holds subjects, add, review, material, calendar, planner, recent, profile, theme, sign out', async () => {
      const { ctx, page } = await open(ada, PHONE, '/dashboard');
      await page.waitForSelector('#u2-menu');
      await page.waitForSelector('#u2-start');
      await page.click('#u2-menu');
      await page.waitForFunction(() => document.documentElement.dataset.u2View === 'everything');
      const text = await page.innerText('#u2-all');
      for (const want of ['Your subjects', 'Mathematics', 'Chess', 'Add a subject', 'Review', 'My material', 'Calendar', 'Recent sessions', 'Profile and scorecard', 'Sign out']) assert(text.includes(want), want);
      assert(await page.$('#u2-all a[href="/onboarding"]'));
      assert(await page.$('#u2-all a[href="/my-material"]'));
      assert(await page.$('#u2-all a[href="/profile"]'));
      assert(await page.$(`#u2-all .subject-card a[href="/path?enrollment=${ada.enrollment}"]`));
      // The planner: the real form, moved, and it still saves.
      await page.click('#u2-fold-calendar summary');
      await page.waitForSelector('#u2-fold-calendar [data-planner-form]');
      await page.fill('#u2-fold-calendar input[type="time"]', '18:15');
      await page.click('#u2-fold-calendar [data-planner-form] button[type="submit"]');
      await page.waitForSelector('#u2-fold-calendar .planner-set');
      // Closing it returns to Home, and the phone's back works too.
      await page.click('#u2-menu');
      await page.waitForFunction(() => document.documentElement.dataset.u2View === 'home');
      assert(await page.isVisible('#u2-start'));
      await page.click('#u2-menu');
      await page.waitForFunction(() => document.documentElement.dataset.u2View === 'everything');
      await page.goBack();
      await page.waitForFunction(() => document.documentElement.dataset.u2View === 'home');
      await ctx.close();
    });

    await t('Everything is reachable from another page, which has a back button in place of the tab bar', async () => {
      const { ctx, page } = await open(ada, PHONE, `/path?enrollment=${ada.enrollment}`);
      await page.waitForSelector('#u2-back');
      assert.strictEqual(await page.$('#tabbar'), null);
      await page.click('#u2-back');
      await page.waitForURL(/dashboard/);
      await page.goto(`${BASE}/dashboard#everything`);
      await page.waitForFunction(() => document.documentElement.dataset.u2View === 'everything' && document.documentElement.classList.contains('u2-ready'));
      assert(await page.isVisible('#u2-signout'));
      await ctx.close();
    });

    await t('Theme and sign out still do what the old header buttons did', async () => {
      const sam = await account(browser, 'sam@example.com', 'Sam Signout', [['math', 'algebra_1_part_a']]); // signing out ends this learner's session
      const { ctx, page } = await open(sam, PHONE, '/dashboard#everything', { colorScheme: 'light' });
      await page.waitForSelector('#u2-theme');
      const before = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      await page.click('#u2-theme');
      await page.waitForFunction(() => document.documentElement.dataset.mode === 'dark');
      await delay(100);
      const after = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      assert.notStrictEqual(before, after);
      await page.click('#u2-theme');
      await page.waitForFunction(() => document.documentElement.dataset.mode === 'light');
      await page.click('#u2-signout');
      await page.waitForURL((u) => !/dashboard/.test(u.pathname));
      await ctx.close();
    });

    await t('The giraffe: tap opens the chat in the top bar, a second tap closes it; no floating button', async () => {
      const { ctx, page } = await open(ada, PHONE, '/dashboard');
      await page.waitForSelector('.site-header .tdock-g-btn');
      await page.waitForSelector('#u2-start');
      await page.tap('.tdock-g-btn');
      await page.waitForFunction(() => document.documentElement.dataset.tdock);
      assert.strictEqual(await page.getAttribute('.tdock-g-btn', 'aria-expanded'), 'true');
      await page.tap('.tdock-g-btn');
      await page.waitForFunction(() => !document.documentElement.dataset.tdock);
      await ctx.close();
    });

    await t('Question: the answer is a tinted sheet at the bottom, Next has focus and goes on, the flag reports', async () => {
      const e1 = await eve(1);
      const { ctx, page } = await open(e1, PHONE, `/session?enrollment=${e1.enrollment}&ordinary=1`);
      await page.waitForSelector('.player-head');
      assert(await answerUntilSheet(page), 'a sheet appeared');
      await delay(350);
      const sheet = await page.evaluate(() => {
        const b = document.querySelector('.verdict [data-act="next"]').closest('.verdict');
        const r = b.getBoundingClientRect();
        const cs = getComputedStyle(b);
        return { position: cs.position, bottom: Math.round(window.innerHeight - r.bottom), left: r.left, width: r.width, bg: cs.backgroundColor, marks: b.querySelectorAll('h4 .u2-mk').length, wordMark: getComputedStyle(b.querySelector('.verdict-word'), '::before').content };
      });
      assert.strictEqual(sheet.position, 'fixed');
      assert.strictEqual(sheet.bottom, 0);
      assert.strictEqual(sheet.width, 375);
      assert.strictEqual(sheet.marks, 1);
      assert.strictEqual(sheet.wordMark, 'none');
      assert.strictEqual(await page.evaluate(() => document.activeElement.getAttribute('data-act')), 'next', 'Next has focus');
      assert.strictEqual(await page.getAttribute('.verdict [data-act="report"]', 'aria-label'), 'Report a problem');
      assert.strictEqual((await page.$$('.verdict .verdict-actions .btn-primary')).length, 1, 'one strong button');
      // The page under the sheet can scroll clear of it.
      const room = await page.evaluate(() => { const p = document.querySelector('.player'); return parseFloat(getComputedStyle(p).paddingBottom) >= document.querySelector('.verdict [data-act="next"]').closest('.verdict').getBoundingClientRect().height; });
      assert(room, 'room under the page for the sheet');
      assert(await noOverflow(page));
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => !document.querySelector('.verdict [data-act="next"]') || document.activeElement !== document.querySelector('.verdict [data-act="next"]'));
      await ctx.close();
    });

    await t('With the chat open under the page the answer stays in the page, not on the chat', async () => {
      const e2 = await eve(2);
      const { ctx, page } = await open(e2, PHONE, `/session?enrollment=${e2.enrollment}&ordinary=1`);
      await page.waitForSelector('.player-head');
      assert(await answerUntilSheet(page));
      await page.tap('.player-head .tdock-g-btn');
      await page.waitForFunction(() => document.documentElement.dataset.tdock);
      await delay(200);
      const place = await page.evaluate(() => document.documentElement.dataset.tdock);
      const pos = await page.evaluate(() => getComputedStyle(document.querySelector('.verdict [data-act="next"]').closest('.verdict')).position);
      if (place === 'bottom' || place === 'right') assert.strictEqual(pos, 'relative');
      await ctx.close();
    });

    await t('Empty home and placement pending', async () => {
      const a = await open(nia, PHONE, '/dashboard');
      await a.page.waitForSelector('.empty-state');
      await a.page.waitForFunction(() => document.documentElement.classList.contains('u2-ready'));
      assert(await a.page.isVisible('.empty-state a[href="/onboarding"]'));
      assert(await noOverflow(a.page));
      await a.page.click('#u2-menu');
      await a.page.waitForFunction(() => document.documentElement.dataset.u2View === 'everything');
      assert(await a.page.isVisible('#u2-signout'));
      assert(!await a.page.isVisible('.empty-state'));
      await a.ctx.close();
      const b = await open(pat, PHONE, '/dashboard');
      await b.page.waitForSelector('#u2-start');
      assert(/\/placement\?enrollment=/.test(await b.page.getAttribute('#u2-start', 'href')));
      assert.strictEqual((await b.page.innerText('#u2-start')).trim(), 'Take the placement quiz');
      await b.ctx.close();
    });

    await t('320 px: no sideways scrolling on Home, Everything or a question; the button is on screen', async () => {
      const { ctx, page } = await open(ada, SMALL, '/dashboard');
      await page.waitForSelector('#u2-start');
      assert(await noOverflow(page), 'home');
      const b = await page.locator('#u2-start').boundingBox();
      const docH = await page.evaluate(() => document.documentElement.scrollHeight);
      assert(b.y + b.height <= docH);
      const bar = await page.evaluate(() => { const w = document.querySelector('#header .wrap'); return w.scrollWidth <= w.clientWidth + 1; });
      assert(bar, 'the top bar fits');
      await page.click('#u2-menu');
      await page.waitForFunction(() => document.documentElement.dataset.u2View === 'everything');
      assert(await noOverflow(page), 'everything');
      const e3 = await eve(3);
      await ctx.close();
      const q = await open(e3, SMALL, `/session?enrollment=${e3.enrollment}&ordinary=1`);
      await q.page.waitForSelector('.player-head');
      assert(await answerUntilSheet(q.page));
      assert(await noOverflow(q.page), 'question');
      const next = await q.page.locator('.verdict [data-act="next"]').boundingBox();
      assert(next.y + next.height <= 568 + 1 || await q.page.evaluate(() => { const v = document.querySelector('.verdict [data-act="next"]').closest('.verdict'); return v.scrollHeight > v.clientHeight; }), 'Next is reachable');
      await q.ctx.close();
    });

    await t('Desktop: top bar with wordmark, Everything and initial, the same single focus, quiet side columns, no sidebar', async () => {
      const { ctx, page } = await open(ada, DESK, '/dashboard');
      await page.waitForSelector('#u2-start');
      assert(await page.isVisible('.site-header .brand'));
      assert(await page.isVisible('.u2-all-link'));
      assert(await page.isVisible('.u2-initial'));
      assert(await page.isVisible('.u2-side'));
      assert(!await page.isVisible('#u2-peek'));
      assert(!await page.isVisible('#u2-menu'));
      assert.strictEqual(await page.evaluate(() => getComputedStyle(document.body).paddingLeft), '0px');
      await page.click('.u2-all-link');
      await page.waitForURL(/#everything/);
      await page.waitForFunction(() => document.documentElement.dataset.u2View === 'everything');
      await ctx.close();
    });

    await t('Dark: tokens switch for the system setting, and the page stays readable', async () => {
      const { ctx, page } = await open(ada, PHONE, '/dashboard', { colorScheme: 'dark' });
      await page.waitForSelector('#u2-start');
      const c = await page.evaluate(() => ({ mode: document.documentElement.dataset.mode, bg: getComputedStyle(document.body).backgroundColor, ink: getComputedStyle(document.getElementById('u2-title')).color }));
      assert.strictEqual(c.mode, 'dark');
      assert.strictEqual(c.bg, 'rgb(28, 22, 16)');
      assert.strictEqual(c.ink, 'rgb(255, 246, 230)');
      await ctx.close();
    });

    await t('Keyboard: tab reaches menu, Start session, giraffe, minutes, Start, path, steps, in order and with a visible focus ring', async () => {
      const { ctx, page } = await open(ada, { viewport: { width: 375, height: 812 } }, '/dashboard');
      await page.waitForSelector('#u2-start');
      await delay(400);
      const seen = [];
      for (let i = 0; i < 14; i++) {
        await page.keyboard.press('Tab'); // eslint-disable-line no-await-in-loop
        seen.push(await page.evaluate(() => { const a = document.activeElement; return a.id || a.getAttribute('data-study') || a.className || a.tagName; })); // eslint-disable-line no-await-in-loop
      }
      const order = ['u2-menu', 'start', 'tdock-g-btn', 'u2-minutes', 'u2-start', 'u2-peek'].map((k) => seen.findIndex((s) => String(s).includes(k)));
      assert(order.every((x) => x >= 0), `missing in ${seen.join(', ')}`);
      assert.deepStrictEqual([...order].sort((a, b) => a - b), order, `order ${seen.join(', ')}`);
      await page.focus('#u2-start');
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      const ring = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
      assert.strictEqual(ring, 'solid');
      await ctx.close();
    });

    await t('Reduced motion: the sheet and the dialogs do not animate', async () => {
      const e4 = await eve(4);
      const { ctx, page } = await open(e4, PHONE, `/session?enrollment=${e4.enrollment}&ordinary=1`, { reducedMotion: 'reduce' });
      await page.waitForSelector('.player-head');
      assert(await answerUntilSheet(page));
      const anim = await page.evaluate(() => getComputedStyle(document.querySelector('.verdict [data-act="next"]').closest('.verdict')).animationName);
      assert.strictEqual(anim, 'none');
      await ctx.close();
    });

    await browser.close().catch(() => {});
    server.kill();
    await delay(600);
    // ── flag off ──
    const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'ui2-browser-off-'));
    fs.mkdirSync(path.join(tmp2, 'media'));
    serverOff = start(null, tmp2);
    await up();
    const b2 = await chromium.launch();
    await t('Flag off: today\'s page, tab bar and all, with no trace of the new one', async () => {
      const off = await account(b2, 'off@example.com', 'Olu Off', [['math', 'algebra_1_part_a']]);
      const ctx = await b2.newContext({ ...PHONE, storageState: off.storage });
      const page = await ctx.newPage();
      const asked = [];
      page.on('request', (r) => { if (/ui2/.test(r.url())) asked.push(r.url()); });
      await page.goto(`${BASE}/dashboard`);
      await page.waitForSelector('.home');
      assert(await page.isVisible('#tabbar'));
      assert.strictEqual(await page.evaluate(() => document.documentElement.hasAttribute('data-ui2')), false);
      assert.strictEqual(await page.$('#u2-home'), null);
      assert.deepStrictEqual(asked, []);
      await ctx.close();
    });
    await b2.close();
    try { fs.rmSync(tmp2, { recursive: true, force: true }); } catch { /* closing */ }
  } finally {
    await browser.close().catch(() => {});
    server.kill();
    if (serverOff) serverOff.kill();
    await delay(300);
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* closing */ }
  }
  console.log(`\nui-v2-browser-test: ${passed} passed, ${failures.length} failed`);
  if (failures.length) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
