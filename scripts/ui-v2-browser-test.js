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
const PHONE = { viewport: { width: 375, height: 420 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };
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

    await t('Home: one strong button on the same first step as GET /api/plan/today, a row with its own link for each other subject, upload, no tab bar, no streak or XP, the approved look', async () => {
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
      assert(await page.isVisible('#u2-giraffe .tutor-svg'), 'the giraffe at the top');
      const squares = await page.$$eval('#u2-subjects a', (a) => a.map((x) => x.getAttribute('href')));
      assert.strictEqual(squares.length, 2, 'two subjects: a square each, two to a row');
      assert(squares.some((h) => !h.includes(String(first.enrollmentId))), 'the other subject has its own square');
      assert(await page.isVisible('#u2-upload'), 'upload your own');
      assert.strictEqual(await page.getAttribute('#u2-upload', 'href'), '/my-material');
      assert(await page.isVisible('#u2-minutes') && await page.isVisible('#u2-peek'), 'time and today\'s plan stay');
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
      assert(await page.isVisible('#u2-row-past'));
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
      const other = await open(ada, PHONE, '/calendar');
      await other.page.waitForSelector('.site-header .tdock-g-btn');
      assert(await other.page.isVisible('.site-header .tdock-g-btn'), 'where no big giraffe stands, the small one stays in the top bar');
      await other.ctx.close();
      const subject = await open(ada, PHONE, `/path?enrollment=${ada.enrollment}`);
      await subject.page.waitForSelector('.u2-page-guide .u2-gh');
      await subject.page.waitForSelector('.tdock-g-btn', { state: 'attached' });
      await subject.page.tap('.u2-page-guide .u2-gh');
      await subject.page.waitForFunction(() => document.documentElement.dataset.tdock);
      await subject.ctx.close();
    });

    await t('The chat in the look: thin-border choice of top or bottom, the Send pill; a call fills the screen with the giraffe, talking mouth, and says how to end and switch (states set directly)', async () => {
      const { ctx, page } = await open(ada, PHONE, '/dashboard');
      await page.waitForSelector('#u2-giraffe');
      await page.waitForSelector('.tdock-g-btn', { state: 'attached' });
      await page.tap('#u2-giraffe');
      await page.waitForFunction(() => document.documentElement.dataset.tdock);
      const css = await page.evaluate(() => { const g = getComputedStyle(document.querySelector('.tdock-form .go')); return { radius: parseFloat(g.borderRadius), edge: g.boxShadow, title: getComputedStyle(document.querySelector('.tdock-title')).fontFamily, giraffe: !!document.querySelector('.tdock-head .tutor-svg') }; });
      assert(css.radius >= 20 && /6px 0px/.test(css.edge), `Send ${css.radius} ${css.edge}`);
      assert(/DM Serif/.test(css.title));
      assert(css.giraffe, 'the giraffe in the chat head');
      await page.click('.tdock-panel .s-top');
      await page.waitForFunction(() => document.documentElement.dataset.tdock === 'top');
      await page.click('.tdock-panel .s-bottom');
      await page.waitForFunction(() => document.documentElement.dataset.tdock === 'bottom');
      await page.click('.tdock-close');
      await page.waitForFunction(() => !document.documentElement.dataset.tdock);
      const set = (state, word, mouth) => page.evaluate(([st, w, m]) => { const g = document.querySelector('.tdock-g'); if (st) g.dataset.voice = st; else delete g.dataset.voice; g.dataset.mouth = m || ''; g.querySelector('.tdock-g-status').textContent = w || ''; document.documentElement.classList.toggle('tdock-in-call', !!st); }, [state, word, mouth]);
      const shots = [];
      const grab = async () => { if (process.env.OB_CALL_SHOT) { await delay(250); shots.push((await page.screenshot({ clip: { x: 0, y: 0, width: 375, height: 420 } })).toString('base64')); } };
      await set('listening', 'Listening');
      await page.waitForSelector('#u2-call:not([hidden])');
      await grab();
      await set('thinking', 'Thinking');
      await delay(200); await grab();
      await set('talking', 'Talking', 'talk');
      await page.waitForSelector('#u2-call:not([hidden])');
      await delay(100); await grab();
      // The page stays: no full-screen stage, the label is small, and the giraffe on the page talks with the existing mouth.
      const stage = await page.evaluate(() => { const r = document.getElementById('u2-call').getBoundingClientRect(); const m = [...document.querySelectorAll('.u2-guide .t-mouth-happy, .site-header .tdock-g .t-mouth-happy')].map((x) => getComputedStyle(x).animationName); return { w: r.width, h: r.height, vw: innerWidth, mouth: m, how: document.getElementById('u2-call-how').textContent, word: document.getElementById('u2-call-word').textContent, up: document.documentElement.dataset.u2Call }; });
      assert(stage.w < stage.vw * 0.8 && stage.h < 70, `a small label, not a stage: ${stage.w}x${stage.h}`);
      assert(stage.mouth.includes('u2-talk'), `the giraffe's own mouth moves: ${stage.mouth}`);
      assert.strictEqual(stage.how, 'Tap to end, hold for chat');
      assert.strictEqual(stage.word, 'Talking');
      assert.strictEqual(stage.up, 'talking');
      assert(await page.evaluate(() => [...document.querySelectorAll('.u2-guide .tutor, .site-header .tdock-g .tutor')].filter((x) => x.checkVisibility({ visibilityProperty: true }) && x.getBoundingClientRect().width > 20 && x.getBoundingClientRect().height > 20 && !x.closest('.tdock-g[style*="hidden"]')).length === 1), 'exactly one giraffe shows, where it was');
      await set('listening', 'Listening');
      await page.waitForFunction(() => document.documentElement.dataset.u2Call === 'listening');
      await set('thinking', 'Thinking');
      await page.waitForFunction(() => document.documentElement.dataset.u2Call === 'thinking' && [...document.querySelectorAll('.u2-guide .tutor, .site-header .tdock-g .tutor')].some((x) => x.dataset.mood === 'think'));
      await set('', 'The call ended.');
      await page.waitForFunction(() => document.getElementById('u2-call').dataset.state === 'ended');
      if (process.env.OB_CALL_SHOT) { await delay(250); shots.push((await page.screenshot({ clip: { x: 0, y: 0, width: 375, height: 420 } })).toString('base64')); }
      await page.waitForSelector('#u2-call', { state: 'hidden', timeout: 8000 });
      assert(!await page.evaluate(() => document.documentElement.dataset.u2Call), 'ended: back to normal');
      if (process.env.OB_CALL_SHOT) {
        const sheet = await ctx.newPage();
        await sheet.setViewportSize({ width: 1520, height: 420 });
        await sheet.setContent(`<body style="margin:0;display:flex;gap:6px;background:#888">${shots.map((b) => `<img width="375" src="data:image/png;base64,${b}">`).join('')}</body>`);
        fs.mkdirSync(path.dirname(process.env.OB_CALL_SHOT), { recursive: true });
        await sheet.screenshot({ path: process.env.OB_CALL_SHOT });
        await sheet.close();
      }
      await ctx.close();
    });

    await t('Question: the giraffe asks, the answer shows in its tinted bubble, it reacts, Next has focus and goes on, the flag reports', async () => {
      const e1 = await eve(1);
      const { ctx, page } = await open(e1, PHONE, `/session?enrollment=${e1.enrollment}&ordinary=1`);
      await page.waitForSelector('.player-head');
      // A sitting can open on a lesson; go on to its first question.
      for (let i = 0; i < 30 && !(await page.$('.choice')); i++) { // eslint-disable-line no-await-in-loop
        await delay(300); // eslint-disable-line no-await-in-loop
        const go = await page.$('.player button.btn-primary'); // eslint-disable-line no-await-in-loop
        if (go) await go.click().catch(() => {}); // eslint-disable-line no-await-in-loop
      }
      await page.waitForSelector('#u2-qguide .tutor-svg');
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
      await a.page.waitForSelector('#u2-start');
      await a.page.waitForFunction(() => document.documentElement.classList.contains('u2-ready'));
      assert.strictEqual(await a.page.getAttribute('#u2-start', 'href'), '/onboarding');
      assert(await a.page.isVisible('#u2-giraffe .tutor-svg'), 'the giraffe');
      assert(await a.page.isVisible('#u2-upload'));
      assert.strictEqual(await a.page.$('#u2-past-link'), null, 'no Past with nothing in it');
      assert(await noOverflow(a.page));
      await a.page.click('#u2-menu');
      await a.page.waitForFunction(() => document.documentElement.dataset.u2View === 'everything');
      assert(await a.page.isVisible('#u2-signout'));
      assert(!await a.page.isVisible('#u2-start'));
      await a.ctx.close();
      const b = await open(pat, PHONE, '/dashboard');
      await b.page.waitForSelector('#u2-start');
      assert(/\/placement\?enrollment=/.test(await b.page.getAttribute('#u2-start', 'href')));
      assert.strictEqual((await b.page.innerText('#u2-start')).trim(), 'Take the placement quiz');
      await b.ctx.close();
    });

    await t('Home with only uploads: the upload gets the one strong button; Past holds finished work with a way back and a simple filter', async () => {
      const oli = await account(browser, 'oli@example.com', 'Oli Upload', null);
      const c = await browser.newContext({ ...PHONE, storageState: oli.storage });
      const paste = await c.request.fetch(`${BASE}/api/materials/paste`, { method: 'POST', headers: { Origin: BASE, 'Content-Type': 'application/json' }, data: JSON.stringify({ title: 'Chapter 4', text: 'The cell is the basic unit of life. '.repeat(40) }) });
      assert(paste.status() < 300, `paste ${paste.status()}`);
      const page = await c.newPage();
      await page.goto(`${BASE}/dashboard`);
      await page.waitForSelector('#u2-start');
      assert.strictEqual((await page.innerText('#u2-start')).trim(), 'Make a learning path');
      assert.strictEqual(await page.getAttribute('#u2-start', 'href'), '/my-material');
      assert(await page.isVisible('#u2-add-subject'));
      assert((await page.$$('#u2-home .u2-btn')).length === 1, 'one strong button');
      const reply = await page.evaluate(() => fetch('/api/ui2/material-progress').then((r) => r.json()));
      assert.strictEqual(reply.can_upload, true);
      assert.strictEqual(reply.materials[0].status, 'none');
      assert.strictEqual(reply.materials[0].complete, false);
      await c.close();
      const e5 = await eve(5);
      const q = await open(e5, PHONE, `/session?enrollment=${e5.enrollment}&ordinary=1`);
      await q.page.waitForSelector('.player-head');
      assert(await answerUntilSheet(q.page));
      await q.page.locator('.verdict [data-act="next"]').click();
      await delay(800);
      await q.page.goto(`${BASE}/dashboard`);
      await q.page.waitForSelector('#u2-past-link');
      await q.page.click('#u2-past-link');
      await q.page.waitForFunction(() => document.documentElement.dataset.u2View === 'past');
      await q.page.waitForSelector('#u2-past [data-past="sessions"]');
      assert(/\/path\?enrollment=/.test(await q.page.getAttribute('#u2-past [data-past="sessions"]', 'href')), 'a way back');
      assert(await noOverflow(q.page));
      await q.page.click('#u2-menu');
      await q.page.waitForFunction(() => document.documentElement.dataset.u2View === 'home');
      await q.page.click('#u2-menu');
      await q.page.waitForFunction(() => document.documentElement.dataset.u2View === 'everything');
      assert(await q.page.isVisible('#u2-row-past'), 'in the Everything menu');
      await q.ctx.close();
    });

    await t('A child account: no upload action, no Your material, and the endpoint agrees', async () => {
      const c = await browser.newContext(PHONE);
      const call = (u, d) => c.request.fetch(BASE + u, { method: 'POST', headers: { Origin: BASE, 'Content-Type': 'application/json' }, data: JSON.stringify(d) });
      await call('/api/consent/age', { birth_month: 5, birth_year: new Date().getFullYear() - 10, country: 'US' });
      const reg = await call('/api/auth/register', { username: 'samhome', password: 'test-password-123', display_name: 'Sam', parent_email: 'parent@example.com' });
      assert(reg.status() < 300, `register ${reg.status()}`);
      const page = await c.newPage();
      await page.goto(`${BASE}/dashboard`);
      await page.waitForSelector('#u2-home');
      assert.strictEqual(await page.$('#u2-upload'), null);
      assert.strictEqual(await page.$('#u2-material'), null);
      assert.strictEqual(await page.$('#u2-row-material'), null);
      const reply = await page.evaluate(() => fetch('/api/ui2/material-progress').then((r) => r.json()));
      assert.deepStrictEqual(reply, { can_upload: false, materials: [] });
      await c.close();
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

    await t('Desktop: a centred grid, a button 260 to 360 px, the menu a rail beside the page; tablet: centred, the menu a full page', async () => {
      const { ctx, page } = await open(ada, DESK, '/dashboard');
      await page.waitForSelector('#u2-start');
      assert(await page.isVisible('#u2-menu'));
      assert(await page.isVisible('.u2-tb-wm'));
      assert.strictEqual(await page.$('.u2-side'), null, 'no side columns');
      const b = await page.locator('#u2-start').boundingBox();
      assert(b.width >= 260 && b.width <= 360, `button ${b.width}`);
      const col1 = await page.locator('#u2-continue').boundingBox();
      const col2 = await page.locator('#u2-material').boundingBox();
      assert(col2.x > col1.x + col1.width - 1 && Math.abs(col1.y - col2.y) < 2, 'two columns, side by side');
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

    await t('Keyboard: tab reaches menu, Start session, giraffe, Start, minutes, today\'s plan, in order and with a visible focus ring', async () => {
      const { ctx, page } = await open(ada, { viewport: { width: 375, height: 420 } }, '/dashboard');
      await page.waitForSelector('#u2-start');
      await delay(400);
      const seen = [];
      for (let i = 0; i < 14; i++) {
        await page.keyboard.press('Tab'); // eslint-disable-line no-await-in-loop
        seen.push(await page.evaluate(() => { const a = document.activeElement; return a.id || a.getAttribute('data-study') || a.className || a.tagName; })); // eslint-disable-line no-await-in-loop
      }
      const order = ['u2-menu', 'start', 'u2-giraffe', 'u2-start', 'u2-minutes', 'u2-peek'].map((k) => seen.findIndex((s) => String(s).includes(k)));
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
      assert.strictEqual(w.bg, 'rgb(244, 245, 247)'); // the card welcome sits on the well, with the subjects' pattern (css/ui2/welcome.css)
      assert(/DM Serif/.test(w.h));
      assert(/Learn it properly, from the start\./.test(w.text)); // the giraffe welcome (UI_V2_WELCOME=giraffe) is checked in scripts/ui-v2-welcome-test.js
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
    // A copy of the store, for the subjects' placement questions ("Take the placement" opens the real walk). Only new synthetic accounts sign in.
    if (fs.existsSync(path.join(ROOT, 'data', 'db.json'))) fs.copyFileSync(path.join(ROOT, 'data', 'db.json'), path.join(tmp3, 'db.json'));
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

    await t('Beta: "My own material" goes straight to home, with no subject or grade; the giraffe on /start opens the tutor', async () => {
      const { ctx, page } = await invited('own@example.com');
      await toHow(page);
      await page.waitForSelector('.tdock-g-btn', { state: 'attached', timeout: 10000 });
      await page.locator('#tutor .tutor-svg').click();
      await page.waitForFunction(() => document.documentElement.dataset.tdock, null, { timeout: 5000 });
      await page.click('.tdock-close');
      await page.waitForFunction(() => !document.documentElement.dataset.tdock);
      await page.check('input[name="how"][value="own"]', { force: true });
      await page.click('#next');
      await page.waitForURL(/\/dashboard/); // straight to home: no upload screen in onboarding
      await page.waitForSelector('#u2-upload');
      assert(!/my-material|\/start/.test(page.url()), 'home, not an upload page or /start');
      const first = await page.$eval('#u2-material .u2-rows', (r) => r.firstElementChild.id);
      assert.strictEqual(first, 'u2-upload', 'Upload your own comes first in Your material');
      assert(/Add your notes when you.re ready\./.test(await page.textContent('.u2-bubble')), 'the giraffe says when to add notes');
      assert(await noOverflow(page));
      if (process.env.OB_NOUPLOAD_SHOT) { fs.mkdirSync(path.dirname(process.env.OB_NOUPLOAD_SHOT), { recursive: true }); await page.screenshot({ path: process.env.OB_NOUPLOAD_SHOT }); }
      await ctx.close();
    });

    // Owner, 7 Nov: after the subjects, home, with "Take the placement" and "Pick my grade" on each; basketball, chess and piano not offered in the beta.
    // OB_TRIM_SHOTS=<dir> writes the phone screenshots (375, light) and their sheet.
    const SHOTS = process.env.OB_TRIM_SHOTS || '';
    const snap = async (page, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); } };
    const waitInfo = (c) => ({ id: c.dataset.waiting, place: c.querySelector('a[data-start="placement"]').getAttribute('href'), placeText: c.querySelector('a[data-start="placement"]').textContent.trim(), placeCls: c.querySelector('a[data-start="placement"]').className, pick: c.querySelector('a[data-start="pick"]').getAttribute('href'), pickText: c.querySelector('a[data-start="pick"]').textContent.trim(), pickCls: c.querySelector('a[data-start="pick"]').className });
    // One waiting subject shows its card; two or more are squares, and a tap opens that subject's card under the grid.
    const openWait = async (page, id) => { await page.click(`[data-wait-tile="${id}"]`); await page.waitForSelector(`.u2-wait[data-waiting="${id}"]`); };
    const homeWaiting = async (page) => {
      await page.waitForSelector('.u2-wait, [data-wait-tile]');
      const ids = await page.$$eval('[data-wait-tile]', (xs) => xs.map((x) => x.dataset.waitTile));
      if (!ids.length) return page.$$eval('.u2-wait', (cards, f) => cards.map(new Function(`return ${f}`)()), waitInfo.toString());
      const out = [];
      for (const id of ids) { await openWait(page, id); out.push(await page.$eval(`.u2-wait[data-waiting="${id}"]`, new Function(`return ${waitInfo.toString()}`)())); }
      return out;
    };

    await t('Beta: "Savant\'s curriculum": subjects (no basketball, chess or piano), then home with each subject\'s placement and pick-a-grade buttons; both lead to the existing pages', async () => {
      const c = await invited('cur@example.com');
      const errs = [];
      c.page.on('pageerror', (e) => errs.push(e.message));
      await toHow(c.page);
      await c.page.check('input[name="how"][value="curriculum"]', { force: true });
      await c.page.click('#next');
      await at(c.page, 'learn');
      const offered = await c.page.$$eval('input[name="track"]', (xs) => xs.map((x) => x.value));
      for (const hidden of ['basketball', 'chess', 'piano']) assert(!offered.includes(hidden), `${hidden} is not offered in the beta`);
      assert(offered.includes('math') && offered.includes('english'));
      assert(/where to start on your home page/.test(await c.page.innerText('.ob-sub')));
      await c.page.check('input[name="track"][value="math"]', { force: true });
      await c.page.check('input[name="track"][value="english"]', { force: true });
      if (process.env.OB_SQUARES_SHOT) await c.page.check('input[name="track"][value="reading"]', { force: true });
      assert.strictEqual(await c.page.$('.subjects.u2-many'), null, 'ticks, not numbers: no subject comes first');
      assert(await noOverflow(c.page));
      await snap(c.page, '1-subjects');
      await c.page.click('#next');
      await c.page.waitForURL(/\/dashboard/);
      const cards = await homeWaiting(c.page);
      assert.deepStrictEqual(cards.map((x) => x.id), process.env.OB_SQUARES_SHOT ? ['math', 'english', 'reading'] : ['math', 'english']);
      if (process.env.OB_SQUARES_SHOT) { await c.page.click('#u2-subjects'); await c.page.evaluate(() => window.scrollTo(0, 0)); fs.mkdirSync(path.dirname(process.env.OB_SQUARES_SHOT), { recursive: true }); await c.page.screenshot({ path: process.env.OB_SQUARES_SHOT }); }
      // Two subjects: square tiles, two to a row, equal sides, centred.
      const sq = await c.page.$$eval('.u2-squares > *', (xs) => xs.map((x) => { const r = x.getBoundingClientRect(); return { l: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) }; }));
      assert.strictEqual(sq.length, process.env.OB_SQUARES_SHOT ? 3 : 2); assert(Math.abs(sq[0].w - sq[0].h) <= 2, 'square'); assert.strictEqual(sq[0].l === sq[1].l, false, 'side by side');
      assert.strictEqual(cards[0].placeText, 'Take the placement');
      assert.strictEqual(cards[0].pickText, 'Pick my grade');
      assert.strictEqual(cards[0].placeCls, 'u2-btn', 'the main 3D pill');
      assert.strictEqual(cards[0].pickCls, 'u2-btn2', 'the secondary pill');
      assert.strictEqual(cards[0].place, '/subject-placement?track=math&mode=quick');
      assert.strictEqual(cards[1].pick, '/onboarding?track=english&pick=1');
      assert.strictEqual((await c.page.innerText('#u2-title')).trim(), 'Choose where to start');
      const edge = await c.page.$eval('.u2-wait a.u2-btn', (a) => getComputedStyle(a).boxShadow);
      assert(/6px 0px/.test(edge), `3D edge: ${edge}`);
      assert(await noOverflow(c.page));
      await snap(c.page, '2-home');
      // "Take the placement": the subject placement, Quick, straight to a question (no goal or length step).
      await openWait(c.page, 'math');
      await c.page.click('.u2-wait[data-waiting="math"] a[data-start="placement"]');
      await c.page.waitForURL(/\/subject-placement\?track=math&mode=quick/);
      await c.page.waitForSelector('a.player-close', { timeout: 30000 }); // the walk's own player, which opens only once a mode is running
      assert.strictEqual(await c.page.$('.mode-card'), null, 'no mode picker: Quick');
      assert(/Quick/.test(await c.page.innerText('body')), 'the Quick walk');
      await delay(400);
      await snap(c.page, '3-placement');
      // "Pick my grade": the add-a-subject page, that subject's grade list open.
      await c.page.goto(`${BASE}/dashboard`);
      await homeWaiting(c.page);
      await openWait(c.page, 'english');
      await c.page.click('.u2-wait[data-waiting="english"] a[data-start="pick"]');
      await c.page.waitForURL(/\/onboarding\?track=english&pick=1/);
      await c.page.waitForFunction(() => { const d = document.querySelector('.track-card[data-subject="english"] details.grade-pick'); return d && d.open; }, null, { timeout: 15000 });
      const hiddenThere = await c.page.$$eval('.track-card', (xs) => xs.map((x) => x.dataset.subject).filter((s) => ['basketball', 'chess', 'piano'].includes(s)));
      assert.deepStrictEqual(hiddenThere, [], 'the add-a-subject page hides them too');
      await delay(400);
      await snap(c.page, '4-pick');
      // Picking a grade there enrolls as today, and the subject stops waiting.
      await c.page.check('.track-card[data-subject="english"] input[data-track="english"] >> nth=0', { force: true });
      await c.page.click('#start');
      await c.page.waitForURL(/\/placement\?enrollment=/);
      await c.page.goto(`${BASE}/dashboard`);
      await c.page.waitForSelector('#u2-home');
      const left = await c.page.$$eval('[data-wait-tile]', (xs) => xs.map((x) => x.dataset.waitTile));
      assert.deepStrictEqual(left, process.env.OB_SQUARES_SHOT ? ['math', 'reading'] : ['math'], 'English has started; the others still wait');
      assert.deepStrictEqual(errs, []);
      await c.ctx.close();
    });

    await t('Beta: "Both": subjects, then home (no upload screen) with the subjects waiting', async () => {
      const a = await invited('both@example.com');
      await toHow(a.page);
      await a.page.check('input[name="how"][value="both"]', { force: true });
      await a.page.click('#next');
      await at(a.page, 'learn');
      assert(await a.page.isDisabled('#next'), 'a subject is still needed');
      await a.page.check('input[name="track"][value="math"]', { force: true });
      await a.page.click('#next');
      await a.page.waitForURL(/\/dashboard/); // no upload screen in onboarding
      assert.deepStrictEqual((await homeWaiting(a.page)).map((x) => x.id), ['math']);
      assert.strictEqual(await a.page.$eval('#u2-material .u2-rows', (r) => r.firstElementChild.id), 'u2-upload', 'Upload your own first for "both"');
      await a.page.goto(`${BASE}/start`);
      await a.page.waitForURL(/\/dashboard/);
      assert(!/\/start/.test(a.page.url()), 'never back through the flow');
      await a.ctx.close();
    });

    await t('Beta: signed out mid-flow (a lost session): sign-in with "You were signed out", never the new-account message', async () => {
      const s = await invited('lost@example.com');
      await toHow(s.page);
      await s.page.check('input[name="how"][value="curriculum"]', { force: true });
      await s.page.click('#next');
      await at(s.page, 'learn');
      await s.page.check('input[name="track"][value="math"]', { force: true });
      await s.ctx.clearCookies(); // the session is gone, as after a restart without a stable secret
      await s.page.click('#next');
      await s.page.waitForURL(/\/login\?next=/);
      assert(/why=signed_out/.test(s.page.url()));
      assert.strictEqual(decodeURIComponent(new URL(s.page.url()).searchParams.get('next')), '/start#learn');
      await s.page.waitForSelector('#signed-out');
      const text = await s.page.innerText('main');
      assert(/You were signed out\. Sign in to carry on\./.test(text));
      assert(!/not taking new accounts/i.test(text), 'never the new-account refusal');
      await s.ctx.close();
      const h = await invited('lost-home@example.com');
      await toHow(h.page);
      await h.page.check('input[name="how"][value="curriculum"]', { force: true });
      await h.page.click('#next');
      await at(h.page, 'learn');
      await h.page.check('input[name="track"][value="math"]', { force: true });
      await h.page.click('#next');
      await h.page.waitForURL(/\/dashboard/);
      await homeWaiting(h.page);
      await h.page.waitForLoadState('networkidle'); // a response still on its way would set the rolling session cookie again
      await h.ctx.clearCookies();
      await h.page.evaluate(() => { fetch('/api/ui2/waiting'); }); // not awaited: the page goes before the call settles, by design
      await h.page.waitForURL(/\/login\?next=%2Fdashboard/);
      assert(/You were signed out/.test(await h.page.innerText('main')));
      await h.ctx.close();
    });

    if (SHOTS) {
      // The sheet: the four phone screens side by side, at their real size.
      const ctx = await b3.newContext({ viewport: { width: 4 * 375 + 5 * 24, height: 812 + 2 * 24 + 40 }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      const names = [['1-subjects', 'Subjects'], ['2-home', 'Home: two waiting'], ['3-placement', 'Take the placement'], ['4-pick', 'Pick my grade']];
      const img = (n) => `data:image/png;base64,${fs.readFileSync(path.join(SHOTS, `${n}.png`)).toString('base64')}`;
      await page.setContent(`<body style="margin:0;padding:24px;display:flex;gap:24px;background:#e9eaee;font:600 15px system-ui">${names.map(([n, l]) => `<figure style="margin:0"><figcaption style="height:30px">${l}</figcaption><img src="${img(n)}" style="width:375px;height:812px;display:block;border-radius:12px;box-shadow:0 1px 4px #0003"></figure>`).join('')}</body>`);
      await page.screenshot({ path: path.join(SHOTS, 'sheet.png'), fullPage: true });
      await ctx.close();
    }
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
