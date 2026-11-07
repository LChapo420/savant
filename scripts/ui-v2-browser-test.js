/**
 * UI_V2 (docs/UI-V2.md) in a real browser, in the approved look: Home, the menu, the top bar, feedback in the giraffe's bubble, /start with "How do you want to learn?"; phone 375 and 320, tablet, desktop, light and dark, keyboard, reduced motion. And with the flag off, no trace of it.
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

function start(flag, tmp, more = {}) {
  const env = { ...process.env, ONBOARDING_V2: 'on', BETA_GATE: '', BETA_SIGNIN_ONLY: '', ...more, PORT: String(PORT), NODE_ENV: 'development', DB_FILE: path.join(tmp, 'db.json'), HOLDOUT_DIR: tmp, SPANISH_MEDIA_DIR: path.join(tmp, 'media'), XKIRO_LEARNER_UNTIL: '2000-01-01T00:00:00Z', FACT_CHECK_ALL: '0', MUNITO_LEARNER: 'off', CORAL_LEARNER: 'off', GLADIA_LEARNER: 'off', LYCEUM_LEARNER: 'off', GONKA_LEARNER: 'off', GROKIFIED_LEARNER: 'off', UPLOAD_AUTOBUILD: 'off', SPANISH_WRITE_AHEAD: 'off' };
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
  let serverBeta = null;
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
      assert((await page.$$('#u2-home .u2-btn')).length === 1);
      assert(await page.isVisible('#u2-giraffe .tutor-svg'), 'the big giraffe beside the task');
      assert(!await page.isVisible('.site-header .tdock-g-btn'), 'the big one does the small one\'s work');
      assert(await page.isVisible('.site-header [data-study="start"]'), 'Start session in the bar');
      const start = await page.evaluate(() => { const c = getComputedStyle(document.getElementById('u2-start')); return { radius: parseFloat(c.borderRadius), edge: c.boxShadow }; });
      assert(start.radius >= 28, 'a full pill');
      assert(/ 6px 0px 0px$/.test(start.edge) || /0px 6px 0px/.test(start.edge), `6 px edge: ${start.edge}`);
      assert.strictEqual(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(255, 255, 255)');
      assert(/DM Serif/.test(await page.evaluate(() => getComputedStyle(document.getElementById('u2-title')).fontFamily)));
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
      for (const want of ['Your subjects', 'Mathematics', 'Chess', 'Add a subject', 'Time today', 'Review', 'My material', 'Calendar', 'Sessions', 'Profile', 'Tutor', 'Sign out']) assert(text.includes(want), want);
      assert(await page.isVisible('#u2-all-guide .tutor-svg'), 'the giraffe stays with you');
      assert(await page.$('#u2-all a[href="/onboarding"]'));
      assert(await page.$('#u2-all a[href="/my-material"]'));
      assert(await page.$('#u2-all a[href="/profile"]'));
      assert(await page.$(`#u2-all .subject-card a[href="/path?enrollment=${ada.enrollment}"]`));
      // The planner: the real form, moved, and it still saves.
      await page.click('#u2-t-calendar');
      await page.waitForSelector('#u2-panel-calendar [data-planner-form]');
      await page.fill('#u2-panel-calendar input[type="time"]', '18:15');
      await page.click('#u2-panel-calendar [data-planner-form] button[type="submit"]');
      await page.waitForSelector('#u2-panel-calendar .planner-set');
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

    await t('The giraffe: a tap on the big one opens the chat and a second closes it; a press and hold reaches the tutor too; no floating button', async () => {
      const { ctx, page } = await open(ada, PHONE, '/dashboard');
      await page.waitForSelector('#u2-giraffe');
      await page.waitForSelector('.tdock-g-btn', { state: 'attached' });
      await page.tap('#u2-giraffe');
      await page.waitForFunction(() => document.documentElement.dataset.tdock);
      assert.strictEqual(await page.getAttribute('.tdock-g-btn', 'aria-expanded'), 'true');
      await page.tap('#u2-giraffe');
      await page.waitForFunction(() => !document.documentElement.dataset.tdock);
      await ctx.close();
      const desk = await open(ada, DESK, '/dashboard');
      await desk.page.waitForSelector('#u2-giraffe');
      await desk.page.waitForSelector('.tdock-g-btn', { state: 'attached' });
      const box = await desk.page.locator('#u2-giraffe').boundingBox();
      await desk.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await desk.page.mouse.down();
      await delay(650);
      await desk.page.mouse.up();
      await desk.page.waitForFunction(() => document.documentElement.classList.contains('tdock-in-call') || document.querySelector('.tdock-g.has-status') || document.documentElement.dataset.tdock, null, { timeout: 5000 });
      await desk.ctx.close();
      const other = await open(ada, PHONE, `/path?enrollment=${ada.enrollment}`);
      await other.page.waitForSelector('.site-header .tdock-g-btn');
      assert(await other.page.isVisible('.site-header .tdock-g-btn'), 'where no big giraffe stands, the small one stays in the top bar');
      await other.ctx.close();
    });

    await t('Question: the giraffe asks, the answer shows in its tinted bubble, it reacts, Next has focus and goes on, the flag reports', async () => {
      const e1 = await eve(1);
      const { ctx, page } = await open(e1, PHONE, `/session?enrollment=${e1.enrollment}&ordinary=1`);
      await page.waitForSelector('.player-head');
      await page.waitForSelector('#u2-qguide .tutor-svg');
      await page.waitForSelector('.choice');
      const asked = await page.innerText('#u2-qb');
      assert(asked.length > 3, 'the question is in the bubble');
      assert.strictEqual(await page.evaluate(() => document.querySelector('#u2-qguide svg').getAttribute('viewBox')), '-135 -250 270 280', 'cropped at the shoulders');
      assert(await answerUntilSheet(page), 'an answer box appeared');
      await delay(350);
      const box = await page.evaluate(() => {
        const b = document.querySelector('.verdict [data-act="next"]').closest('.verdict');
        const r = b.getBoundingClientRect();
        const good = b.classList.contains('verdict-correct');
        const wrap = document.querySelector('#u2-qguide .u2-tailwrap');
        return { position: getComputedStyle(b).position, bottom: Math.round(window.innerHeight - r.bottom), width: r.width, good, tint: wrap.classList.contains(good ? 'u2-ok' : 'u2-no'), mood: document.querySelector('#u2-qguide .tutor').dataset.mood, head: document.querySelector('.verdict h4').textContent.trim(), said: document.querySelector('#u2-qb b').textContent.trim(), ask: b.querySelector('[data-act="ask"]').textContent.trim(), bubbleBg: getComputedStyle(document.getElementById('u2-qb')).backgroundColor };
      });
      assert.strictEqual(box.position, 'fixed');
      assert.strictEqual(box.bottom, 0);
      assert.strictEqual(box.width, 375);
      assert(box.tint, 'the bubble is tinted');
      assert.notStrictEqual(box.bubbleBg, 'rgb(255, 255, 255)');
      assert.strictEqual(box.mood, box.good ? 'happy' : 'think');
      assert.strictEqual(box.said, box.head, 'the same words as the player');
      assert.strictEqual(box.ask, 'Why?');
      assert.strictEqual(await page.evaluate(() => document.activeElement.getAttribute('data-act')), 'next', 'Next has focus');
      assert.strictEqual(await page.getAttribute('#u2-bflag', 'aria-label'), 'Report a problem');
      assert.strictEqual((await page.$$('.verdict .verdict-actions .btn-primary')).length, 1, 'one strong button');
      const room = await page.evaluate(() => { const p = document.querySelector('.player'); return parseFloat(getComputedStyle(p).paddingBottom) >= document.querySelector('.verdict [data-act="next"]').closest('.verdict').getBoundingClientRect().height; });
      assert(room, 'room under the page for the buttons');
      assert(await noOverflow(page));
      await page.click('#u2-bflag');
      await page.waitForSelector('dialog, .ask-dialog, [role="dialog"]', { timeout: 5000 });
      await page.keyboard.press('Escape');
      await delay(200);
      await page.focus('.verdict [data-act="next"]');
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => !document.querySelector('.verdict [data-act="next"]') || document.activeElement !== document.querySelector('.verdict [data-act="next"]'));
      await ctx.close();
    });

    await t('With the chat open under the page the answer stays in the page, not on the chat', async () => {
      const e2 = await eve(2);
      const { ctx, page } = await open(e2, PHONE, `/session?enrollment=${e2.enrollment}&ordinary=1`);
      await page.waitForSelector('.player-head');
      assert(await answerUntilSheet(page));
      await page.tap('#u2-qguide .u2-g');
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
      assert(await a.page.isVisible('.empty-state .tutor-svg'), 'the giraffe');
      assert(await a.page.isVisible('.empty-state a[href="/my-material"]'));
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

    await t('Desktop: the giraffe beside the one task, no side columns, a button 260 to 360 px, the menu a rail beside the page; tablet: centred, the menu a full page', async () => {
      const { ctx, page } = await open(ada, DESK, '/dashboard');
      await page.waitForSelector('#u2-start');
      assert(await page.isVisible('#u2-menu'));
      assert(await page.isVisible('.u2-tb-wm'));
      assert.strictEqual(await page.$('.u2-side'), null, 'no side columns');
      const g = await page.locator('#u2-giraffe').boundingBox();
      const b = await page.locator('#u2-start').boundingBox();
      assert(b.x > g.x + g.width - 1, 'the task is beside the giraffe');
      assert(b.width >= 260 && b.width <= 360, `button ${b.width}`);
      assert.strictEqual(await page.evaluate(() => getComputedStyle(document.body).paddingLeft), '0px');
      await page.click('#u2-menu');
      await page.waitForFunction(() => document.documentElement.dataset.u2View === 'everything');
      await delay(100);
      const rail = await page.locator('#u2-all').boundingBox();
      assert(rail.x === 0 && rail.width <= 360, `rail ${rail.x} ${rail.width}`);
      assert(await page.isVisible('#u2-start'), 'the page stays beside it');
      await ctx.close();
      const tab = await open(ada, { viewport: { width: 820, height: 1180 } }, '/dashboard');
      await tab.page.waitForSelector('#u2-start');
      const tb = await tab.page.locator('#u2-start').boundingBox();
      assert(tb.width >= 260 && tb.width <= 360, `tablet button ${tb.width}`);
      assert(Math.abs(tb.x + tb.width / 2 - 410) < 2, 'centred');
      await tab.page.click('#u2-menu');
      await tab.page.waitForFunction(() => document.documentElement.dataset.u2View === 'everything');
      await delay(100);
      assert(!await tab.page.isVisible('#u2-start'), 'the menu is a full page on a tablet');
      const col = await tab.page.locator('#u2-all').boundingBox();
      assert(col.width <= 640, `column ${col.width}`);
      await tab.ctx.close();
    });

    await t('Dark: tokens switch for the system setting, and the page stays readable', async () => {
      const { ctx, page } = await open(ada, PHONE, '/dashboard', { colorScheme: 'dark' });
      await page.waitForSelector('#u2-start');
      const c = await page.evaluate(() => ({ mode: document.documentElement.dataset.mode, bg: getComputedStyle(document.body).backgroundColor, ink: getComputedStyle(document.getElementById('u2-title')).color }));
      assert.strictEqual(c.mode, 'dark');
      assert.strictEqual(await page.evaluate(() => document.documentElement.dataset.style), 'chunky', 'the older night style does not apply');
      assert.strictEqual(c.bg, 'rgb(20, 22, 26)');
      assert.strictEqual(c.ink, 'rgb(242, 243, 245)');
      await ctx.close();
    });

    await t('Keyboard: tab reaches menu, Start session, giraffe, minutes, Start, next steps, in order and with a visible focus ring', async () => {
      const { ctx, page } = await open(ada, { viewport: { width: 375, height: 812 } }, '/dashboard');
      await page.waitForSelector('#u2-start');
      await delay(400);
      const seen = [];
      for (let i = 0; i < 14; i++) {
        await page.keyboard.press('Tab'); // eslint-disable-line no-await-in-loop
        seen.push(await page.evaluate(() => { const a = document.activeElement; return a.id || a.getAttribute('data-study') || a.className || a.tagName; })); // eslint-disable-line no-await-in-loop
      }
      const order = ['u2-menu', 'start', 'u2-giraffe', 'u2-minutes', 'u2-start', 'u2-peek'].map((k) => seen.findIndex((s) => String(s).includes(k)));
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

    // ── /start on the public flow: a guest, and a child ──
    const fresh = async (extra = {}) => { const ctx = await browser.newContext({ ...PHONE, ...extra }); const page = await ctx.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(e.message)); return { ctx, page, errors }; };
    const at = (page, s) => page.waitForFunction((x) => location.hash === `#${x}` && document.querySelector(`#ob[data-screen="${x}"]`), s, { timeout: 15000 });
    const fillAge = async (page, year) => {
      await at(page, 'age');
      await page.selectOption('#m', '5');
      await page.selectOption('#y', String(year));
      await page.waitForFunction(() => document.querySelectorAll('#c option').length > 1);
      await page.selectOption('#c', 'US');
      await page.click('#next');
    };
    const pickInterest = async (page) => {
      await at(page, 'into');
      await page.check('input[name="interest"] >> nth=0', { force: true });
      await page.click('#next');
    };

    await t('/start in the look: white, serif, the original giraffe big on welcome and hello, then cropped with the question in its bubble', async () => {
      const { ctx, page, errors } = await fresh();
      await page.goto(`${BASE}/start`);
      await at(page, 'welcome');
      const w = await page.evaluate(() => ({ flag: document.documentElement.getAttribute('data-ui2'), bg: getComputedStyle(document.body).backgroundColor, h: getComputedStyle(document.querySelector('.ob-welcome h1')).fontFamily, text: document.querySelector('.ob-welcome').innerText, svg: document.querySelector('#tutor svg').getAttribute('viewBox'), coat: getComputedStyle(document.querySelector('#tutor .t-coat')).fill, alt: document.getElementById('alt').textContent, edge: getComputedStyle(document.getElementById('next')).boxShadow, radius: parseFloat(getComputedStyle(document.getElementById('next')).borderRadius) }));
      assert.strictEqual(w.flag, 'on');
      assert.strictEqual(w.bg, 'rgb(255, 255, 255)');
      assert(/DM Serif/.test(w.h));
      assert(/From zero to Savant\./.test(w.text));
      assert.strictEqual(w.svg, '-135 -250 270 425');
      assert.strictEqual(w.alt, 'I have an account');
      assert(w.radius >= 28 && /6px 0px/.test(w.edge), `pill ${w.radius} ${w.edge}`);
      await page.click('#next');
      await at(page, 'hello');
      assert(/Press and hold me/.test(await page.innerText('#bubble')));
      await page.click('#next');
      await fillAge(page, 1990);
      await at(page, 'agree');
      assert(/Do you agree/.test(await page.innerText('#bubble-q')), 'the question is in the bubble');
      assert.strictEqual(await page.evaluate(() => document.querySelector('#tutor svg').getAttribute('viewBox')), '-135 -250 270 280');
      assert(await noOverflow(page));
      assert.deepStrictEqual(errors, []);
      await ctx.close();
    });

    await t('/start: a guest picks "My own material": no subject or grade, saving comes first, and "My own notes" is gone from the subjects', async () => {
      const { ctx, page } = await fresh();
      await page.goto(`${BASE}/start#welcome`);
      await at(page, 'welcome');
      await page.click('#next');
      await at(page, 'hello');
      await page.click('#next');
      await fillAge(page, 1990);
      await at(page, 'agree');
      await page.check('input[name="agree"][value="agree"]', { force: true });
      await page.click('#next');
      await at(page, 'test');
      await page.click('#alt');
      await pickInterest(page);
      await at(page, 'how');
      assert.strictEqual((await page.$$('input[name="how"]')).length, 3);
      assert(await page.isDisabled('#next'), 'nothing is picked for them');
      // Curriculum first: the subjects, with no notes tile, and back comes here.
      await page.check('input[name="how"][value="curriculum"]', { force: true });
      await page.click('#next');
      await at(page, 'learn');
      assert.strictEqual(await page.$('input[name="notes"]'), null);
      await page.click('#back');
      await at(page, 'how');
      await page.check('input[name="how"][value="own"]', { force: true });
      const saved = page.waitForRequest((r) => r.url().endsWith('/api/ob2/answers') && r.method() === 'POST');
      await page.click('#next');
      const body = (await saved).postDataJSON();
      assert.strictEqual(body.how, 'own');
      assert.strictEqual(body.notes, true);
      assert.deepStrictEqual(body.tracks, []);
      await at(page, 'save');
      const state = await page.evaluate(() => fetch('/api/ob2/state').then((r) => r.json()));
      assert.strictEqual(state.answers.how, 'own', 'kept with the onboarding answers');
      await page.evaluate(() => { location.hash = 'grade'; });
      await delay(300);
      assert.strictEqual(await page.evaluate(() => document.querySelector('#ob').dataset.screen), 'save', 'no grade step');
      await ctx.close();
    });

    await t('/start: under the consent age the step is skipped, and the gates are as they were', async () => {
      const { ctx, page } = await fresh();
      await page.goto(`${BASE}/start#welcome`);
      await at(page, 'welcome');
      await page.click('#next');
      await at(page, 'hello');
      await page.click('#next');
      await fillAge(page, new Date().getFullYear() - 10);
      await at(page, 'parent');
      await page.fill('input[name="nickname"]', 'Sam');
      await page.fill('input[name="parent_email"]', 'parent@example.com');
      await page.click('#next');
      await at(page, 'test');
      await page.click('#alt');
      await pickInterest(page);
      await at(page, 'learn');
      assert.strictEqual(await page.$('input[name="how"]'), null);
      assert.strictEqual(await page.$('input[name="notes"]'), null);
      assert.strictEqual(await page.getAttribute('#back', 'aria-label'), 'Back');
      await page.evaluate(() => { location.hash = 'how'; });
      await delay(300);
      assert.strictEqual(await page.evaluate(() => document.querySelector('#ob').dataset.screen), 'learn', 'no way to the step by address');
      const state = await page.evaluate(() => fetch('/api/ob2/answers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ how: 'own', notes: true }) }).then(() => fetch('/api/ob2/state')).then((r) => r.json()));
      assert.strictEqual(state.answers.how, null);
      assert.strictEqual(state.answers.notes, false);
      assert.strictEqual(await page.evaluate(() => fetch('/api/materials/paste', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'x' }) }).then((r) => r.status)), 403, 'upload stays shut');
      await ctx.close();
    });

    await browser.close().catch(() => {});
    server.kill();
    await delay(600);

    // ── /start in the private beta: an account, from the application ──
    const tmp3 = fs.mkdtempSync(path.join(os.tmpdir(), 'ui2-browser-beta-'));
    fs.mkdirSync(path.join(tmp3, 'media'));
    process.env.BETA_INVITES_FILE = path.join(tmp3, 'invites.json');
    const invites = require('../services/beta-invites'); // eslint-disable-line global-require
    serverBeta = start('on', tmp3, { BETA_GATE: 'invite', BETA_INVITES_FILE: path.join(tmp3, 'invites.json') });
    await up();
    const b3 = await chromium.launch();
    const invited = async (email) => {
      const ctx = await b3.newContext(PHONE);
      const reg = await ctx.request.fetch(`${BASE}/api/auth/register`, { method: 'POST', headers: { Origin: BASE, 'Content-Type': 'application/json' }, data: JSON.stringify({ email, password: 'test-password-123', display_name: 'Bea Beta', birth_year: 1990, birth_month: 5, country: 'US', agreed: true, invite_code: invites.approve(email).code }) });
      assert(reg.status() < 300, `register ${reg.status()}`);
      return { ctx, page: await ctx.newPage() };
    };
    const toHow = async (page) => {
      await page.goto(`${BASE}/start`);
      await at(page, 'welcome');
      await page.click('#next');
      await at(page, 'hello');
      await page.click('#next');
      await at(page, 'test');
      await page.click('#alt');
      await pickInterest(page);
      await at(page, 'how');
    };

    await t('Beta: "My own material" goes to upload, then home, with no subject or grade; the giraffe on /start opens the tutor', async () => {
      const { ctx, page } = await invited('own@example.com');
      await toHow(page);
      await page.waitForSelector('.tdock-g-btn', { state: 'attached', timeout: 10000 });
      await page.locator('#tutor .tutor-svg').click();
      await page.waitForFunction(() => document.documentElement.dataset.tdock, null, { timeout: 5000 });
      await page.click('.tdock-close');
      await page.waitForFunction(() => !document.documentElement.dataset.tdock);
      await page.check('input[name="how"][value="own"]', { force: true });
      await page.click('#next');
      await page.waitForURL(/\/my-material\?from=start/);
      await page.waitForSelector('#u2-after-upload a');
      assert(await page.isVisible('#u2-after-upload a'));
      assert(await noOverflow(page));
      await page.click('#u2-after-upload a');
      await page.waitForURL(/\/dashboard/);
      await page.waitForSelector('.empty-state');
      assert(/\/dashboard/.test(page.url()), 'home, not back to /start');
      await ctx.close();
    });

    await t('Beta: "Both" goes through subject and grade, then upload; "Savant\'s curriculum" goes on to the lesson as today', async () => {
      const a = await invited('both@example.com');
      await toHow(a.page);
      await a.page.check('input[name="how"][value="both"]', { force: true });
      await a.page.click('#next');
      await at(a.page, 'learn');
      assert(await a.page.isDisabled('#next'), 'a subject is still needed');
      await a.page.check('input[name="track"][value="math"]', { force: true });
      await a.page.click('#next');
      await at(a.page, 'grade');
      await a.page.check('input[name="way"][value="know"]', { force: true });
      await a.page.click('#next');
      await at(a.page, 'pick');
      await a.page.check('input[name="grade"] >> nth=2', { force: true });
      await a.page.click('#next');
      await at(a.page, 'ready');
      assert.strictEqual((await a.page.innerText('#next')).trim(), 'Upload my material');
      await a.page.click('#next');
      await a.page.waitForURL(/\/my-material\?from=start/);
      await a.page.waitForSelector('#u2-after-upload a');
      await a.page.click('#u2-after-upload a');
      await a.page.waitForSelector('#u2-start');
      await a.ctx.close();
      const c = await invited('cur@example.com');
      await toHow(c.page);
      await c.page.check('input[name="how"][value="curriculum"]', { force: true });
      await c.page.click('#next');
      await at(c.page, 'learn');
      await c.page.check('input[name="track"][value="math"]', { force: true });
      await c.page.click('#next');
      await at(c.page, 'grade');
      await c.page.check('input[name="way"][value="know"]', { force: true });
      await c.page.click('#next');
      await at(c.page, 'pick');
      await c.page.check('input[name="grade"] >> nth=2', { force: true });
      await c.page.click('#next');
      await at(c.page, 'ready');
      assert.strictEqual((await c.page.innerText('#next')).trim(), 'Start lesson');
      await c.ctx.close();
    });
    await b3.close();
    serverBeta.kill();
    await delay(600);
    try { fs.rmSync(tmp3, { recursive: true, force: true }); } catch { /* closing */ }

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
      const g = await b2.newContext(PHONE);
      const p = await g.newPage();
      await p.goto(`${BASE}/start`);
      await p.waitForSelector('#ob[data-screen="welcome"]');
      assert.strictEqual(await p.evaluate(() => document.documentElement.hasAttribute('data-ui2')), false, '/start: no flag');
      assert.strictEqual(await p.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(255, 251, 243)', '/start: cream, as it was');
      assert(!asked.length);
      await p.click('#next');
      await g.close();
    });
    await b2.close();
    try { fs.rmSync(tmp2, { recursive: true, force: true }); } catch { /* closing */ }
  } finally {
    await browser.close().catch(() => {});
    server.kill();
    if (serverOff) serverOff.kill();
    if (serverBeta) serverBeta.kill();
    await delay(300);
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* closing */ }
  }
  console.log(`\nui-v2-browser-test: ${passed} passed, ${failures.length} failed`);
  if (failures.length) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
