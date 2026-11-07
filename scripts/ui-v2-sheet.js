/**
 * The owner's look at the new app structure (docs/UI-V2.md): real screenshots of the app with UI_V2=on, labelled, on one contact sheet.
 *
 *   node scripts/ui-v2-sheet.js [--out=<dir>] [--port=6831] [--mode=light|dark] [--width=375] [--height=812] [--name=contact-sheet] [--only=home,question]
 *
 * Starts its own server on a temporary database with synthetic learners only (never real learner data), every outside AI off, and writes <out>/<name>.png.
 * The tutor's reply in the chat shot is a stub of its route, so nothing is spent. Needs Playwright (PLAYWRIGHT_PATH, default the shared copy).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const pwPath = process.env.PLAYWRIGHT_PATH || 'C:/coding/savant-wt/pw/node_modules/playwright';
const { chromium } = require(pwPath); // eslint-disable-line import/no-dynamic-require

const ROOT = path.join(__dirname, '..');
const arg = (name, d) => { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.split('=').slice(1).join('=') : d; };
const OUT = arg('out', 'C:/coding/claudecommittdIq/folderThing/design-refs/ui-v2-shots');
const PORT = Number(arg('port', 6831));
const MODE = arg('mode', 'light');
const W = Number(arg('width', 375));
const H = Number(arg('height', 812));
const NAME = arg('name', 'contact-sheet');
const ONLY = arg('only', '') ? arg('only', '').split(',') : null;
const BASE = `http://localhost:${PORT}`;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const DEVICE = W < 800 ? { viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: true, isMobile: true } : { viewport: { width: W, height: H }, deviceScaleFactor: 1 };

function serverEnv(tmp) {
  const env = {
    ...process.env, PORT: String(PORT), NODE_ENV: 'development', DB_FILE: path.join(tmp, 'db.json'), HOLDOUT_DIR: tmp, SPANISH_MEDIA_DIR: path.join(tmp, 'media'),
    UI_V2: process.env.UI_V2 === undefined ? 'on' : process.env.UI_V2, ONBOARDING_V2: 'on',
    XKIRO_LEARNER_UNTIL: '2000-01-01T00:00:00Z', FACT_CHECK_ALL: '0', MUNITO_LEARNER: 'off', CORAL_LEARNER: 'off', GLADIA_LEARNER: 'off', LYCEUM_LEARNER: 'off', GONKA_LEARNER: 'off', GROKIFIED_LEARNER: 'off', UPLOAD_AUTOBUILD: 'off', SPANISH_WRITE_AHEAD: 'off',
  };
  // No key reaches this server, whatever the shell holds.
  for (const k of Object.keys(env)) if (/_API_KEY$|_KEY$|_TOKEN$/.test(k)) env[k] = '';
  return env;
}

async function seed(browser) {
  const accounts = {};
  const make = async (email, name, build) => {
    const ctx = await browser.newContext(DEVICE);
    const call = (m, u, d) => ctx.request.fetch(BASE + u, { method: m, headers: { Origin: BASE, 'Content-Type': 'application/json' }, data: d ? JSON.stringify(d) : undefined }).then(async (r) => ({ status: r.status(), json: await r.json().catch(() => null) }));
    const reg = await call('POST', '/api/auth/register', { email, password: 'test-password-123', display_name: name, birth_year: 1990, birth_month: 5, country: 'US', agreed: true });
    if (reg.status >= 300) throw new Error(`register ${reg.status} ${JSON.stringify(reg.json)}`);
    const extra = build ? await build(call) : {};
    accounts[email.split('@')[0]] = { storage: await ctx.storageState(), ...extra };
    await ctx.close();
  };
  const place = async (call, e) => {
    const st = await call('POST', '/api/placement/start', { enrollment_id: e.id });
    const q = [...((st.json && st.json.items) || [])];
    for (let n = 0; q.length && n < 60; n++) {
      const it = q.shift();
      const r = await call('POST', '/api/placement/answer', { session_id: st.json.session_id, item_id: it.id, answer: (it.choices && (it.choices[0].text || it.choices[0])) || '1', ms: 3000 });
      if (r.json && r.json.next_item) q.push(r.json.next_item);
    }
    await call('POST', '/api/placement/finish', { session_id: st.json.session_id });
  };
  await make('ada@example.com', 'Ada Tester', async (call) => {
    await call('POST', '/api/enrollments', { selections: [{ track_id: 'math', grade_id: 'algebra_1_part_a' }, { track_id: 'chess', grade_id: 'chess_rules_learner' }] });
    const list = (await call('GET', '/api/enrollments')).json.enrollments;
    for (const e of list) await place(call, e); // eslint-disable-line no-await-in-loop
    return { enrollment: list[0].id, enrollments: list.map((e) => e.id) };
  });
  // The question shots: English is mostly tap-an-answer questions, so both sheets turn up quickly.
  await make('eve@example.com', 'Eve Tester', async (call) => {
    await call('POST', '/api/enrollments', { selections: [{ track_id: 'english', grade_id: 'grammar' }] });
    const list = (await call('GET', '/api/enrollments')).json.enrollments;
    await place(call, list[0]);
    return { enrollment: list[0].id };
  });
  await make('eve2@example.com', 'Eve Tester', async (call) => {
    await call('POST', '/api/enrollments', { selections: [{ track_id: 'english', grade_id: 'grammar' }] });
    const list = (await call('GET', '/api/enrollments')).json.enrollments;
    await place(call, list[0]);
    return { enrollment: list[0].id };
  });
  await make('new@example.com', 'Nia New');
  await make('pending@example.com', 'Pat Pending', async (call) => {
    await call('POST', '/api/enrollments', { selections: [{ track_id: 'math', grade_id: 'algebra_1_part_a' }] });
    return {};
  });
  return accounts;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const raw = path.join(OUT, 'raw');
  fs.mkdirSync(raw, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ui2-sheet-'));
  fs.mkdirSync(path.join(tmp, 'media'), { recursive: true });
  const log = fs.openSync(path.join(tmp, 'server.log'), 'a');
  const server = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: serverEnv(tmp), stdio: ['ignore', log, log] });
  for (let i = 0; i < 200; i++) { await delay(250); try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* up soon */ } } // eslint-disable-line no-await-in-loop
  const browser = await chromium.launch();
  const shots = [];
  const problems = [];
  try {
    const acc = await seed(browser);
    const open = async (who, url, wait) => {
      const ctx = await browser.newContext({ ...DEVICE, colorScheme: MODE, storageState: who ? acc[who].storage : undefined });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => problems.push(`${url}: ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404|401/.test(m.text())) problems.push(`${url}: ${m.text()}`); });
      await page.route('**/api/tutor/dock', async (route) => {
        if (route.request().method() !== 'POST') return route.continue();
        return route.fulfill({ json: { reply: 'Read the question out loud, then say what it is asking for in your own words. Which answer fits that?', source: 'ai', mode: 'full' } });
      });
      await page.goto(BASE + url);
      if (wait) await page.waitForSelector(wait, { timeout: 25000 });
      await delay(500);
      return { ctx, page };
    };
    const want = (k) => !ONLY || ONLY.includes(k);
    const snap = async (page, name, label) => {
      const f = path.join(raw, `${MODE}-${W}-${name}.png`);
      await page.screenshot({ path: f });
      shots.push({ file: f, label });
    };

    if (want('start')) {
      const { ctx, page } = await open(null, '/start', '#ob-root .ob-top');
      await snap(page, 'start', 'The onboarding, /start, for comparison');
      await ctx.close();
    }
    if (want('home')) {
      const { ctx, page } = await open('ada', '/dashboard', '#u2-start');
      await snap(page, 'home', 'Home: one task, one button, the day as dots');
      await page.click('#u2-peek');
      await delay(350);
      await snap(page, 'home-steps', 'Tap the bar at the bottom: all of today\'s steps');
      await page.keyboard.press('Escape');
      await page.click('#u2-minutes');
      await delay(350);
      await snap(page, 'home-minutes', 'Tap "45 min": how long you have today');
      await page.keyboard.press('Escape');
      await delay(150);
      await page.click('#u2-menu');
      await page.waitForSelector('#u2-all-title', { state: 'attached' });
      await delay(300);
      await snap(page, 'all', 'The menu: Everything');
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await delay(200);
      await snap(page, 'all-end', 'Everything, scrolled to the end');
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.click('#u2-fold-calendar summary');
      await delay(200);
      await snap(page, 'all-planner', 'Everything: next study time opened');
      await ctx.close();
    }
    if (want('question')) {
      const { ctx, page } = await open('eve', `/session?enrollment=${acc.eve.enrollment}&ordinary=1`, '.player-head');
      let asked = false;
      let right = false;
      let wrong = false;
      for (let i = 0, t0 = Date.now(); i < 400 && Date.now() - t0 < 170000 && !(right && wrong); i++) { // eslint-disable-line no-await-in-loop
        await delay(400);
        const choices = await page.$$('.choice');
        const typed = await page.$('.answer-row input');
        if (!choices.length && !typed) {
          // A lesson opens with its page first, and a sitting ends with its recap: go on.
          const go = await page.$('#item .check-bar button, #item a.btn-primary, #item button.btn-primary, .player button.btn-primary');
          if (go) await go.click().catch(() => {});
          else await page.goto(`${BASE}/session?enrollment=${acc.eve.enrollment}&ordinary=1`);
          continue;
        }
        if (choices.length && !asked) { asked = true; await snap(page, 'q', 'A question'); }
        if (choices.length) await choices[wrong ? choices.length - 1 : 0].click({ timeout: 5000 }).catch(() => page.goto(`${BASE}/session?enrollment=${acc.eve.enrollment}&ordinary=1`));
        else {
          if (!(await typed.isEnabled())) { await page.goto(`${BASE}/session?enrollment=${acc.eve.enrollment}&ordinary=1`); continue; } // the sitting ended: its recap
          await typed.fill('7');
        }
        const submit = await page.$('.check-bar button, .answer-row button');
        if (submit) await submit.click().catch(() => {});
        if (!(await page.waitForSelector('.verdict', { timeout: 6000 }).catch(() => null))) continue; // an exam holds its feedback
        await page.waitForSelector('.verdict-correct, .verdict-wrong', { timeout: 15000 }).catch(() => {});
        await delay(450);
        const isRight = !!(await page.$('.verdict-correct'));
        const isWrong = !!(await page.$('.verdict-wrong'));
        const fullSheet = choices.length && !!(await page.$('.verdict [data-act="next"]'));
        if (fullSheet && isRight && !right) { right = true; await snap(page, 'q-right', 'Right: a green sheet rises, one Next button'); }
        if (fullSheet && isWrong && !wrong) { wrong = true; await snap(page, 'q-wrong', 'Not quite: a red sheet, the answer said at once'); }
        const next = await page.$('.verdict [data-act="next"]');
        if (next) await next.click().catch(() => {});
      }
      if (!(right && wrong && asked)) console.log('INCOMPLETE', page.url(), (await page.innerText('body')).slice(0, 500));
      if (!(right && wrong && asked)) problems.push(`question shots incomplete: asked ${asked}, right ${right}, wrong ${wrong}`);
      await ctx.close();
    }
    if (want('question')) {
      // The chat, on a question not yet answered: tap the giraffe. A fresh learner, because the first has answered on past the end of a sitting.
      const { ctx, page } = await open('eve2', `/session?enrollment=${acc.eve2.enrollment}&ordinary=1`, '.player-head .tdock-g-btn');
      await page.waitForSelector('.choice, .answer-row input', { timeout: 15000 });
      await delay(400);
      await page.click('.tdock-g-btn');
      await page.waitForSelector('.tdock-panel', { timeout: 10000 });
      await delay(500);
      await page.fill('.tdock-form input', 'What does this one mean?');
      await page.click('.tdock-form .go');
      await delay(600);
      await snap(page, 'q-chat', 'Tap the giraffe: the chat opens under the page (a sample reply)');
      await ctx.close();
    }
    if (want('path')) {
      const { ctx, page } = await open('ada', `/path?enrollment=${acc.ada.enrollment}`, '#u2-back');
      await delay(500);
      await snap(page, 'path', 'A page not rearranged yet: new bar and colours (slice 2)');
      await ctx.close();
    }
    if (want('empty')) {
      const { ctx, page } = await open('new', '/dashboard', '.empty-state');
      await snap(page, 'empty', 'Home with no subjects yet');
      await ctx.close();
    }
    if (want('pending')) {
      const { ctx, page } = await open('pending', '/dashboard', '#u2-start');
      await snap(page, 'pending', 'Home with the placement still to take');
      await ctx.close();
    }

    const cols = W < 800 ? 6 : 2;
    const scale = W < 800 ? 0.72 : 0.62;
    const sheet = await browser.newContext({ viewport: { width: Math.round(cols * (W * scale + 28) + 60), height: 1000 }, deviceScaleFactor: 2 });
    const pg = await sheet.newPage();
    const imgs = shots.map((s) => `<figure><figcaption>${s.label}</figcaption><img src="data:image/png;base64,${fs.readFileSync(s.file).toString('base64')}"></figure>`).join('');
    await pg.setContent(`<!doctype html><meta charset=utf-8><style>
      body{margin:0;padding:28px 30px;background:#f4efe6;font:14px/1.35 "Segoe UI",system-ui,sans-serif;color:#2a1c12}
      h1{font-size:22px;margin:0 0 4px}p{margin:0 0 20px;color:#5c4631}
      .g{display:grid;grid-template-columns:repeat(${cols},${W * scale}px);gap:22px 28px}
      figure{margin:0}figcaption{min-height:38px;font-weight:600;margin-bottom:6px;font-size:13.5px}
      img{width:${W * scale}px;display:block;border-radius:14px;box-shadow:0 1px 6px rgba(0,0,0,.18)}
    </style><h1>Savant, structure A: One next thing. The real app, first slice</h1>
    <p>Real screenshots with UI_V2=on (${W}x${H}, ${MODE}), synthetic learners. Home, the menu, the top bar and the question feedback are done. Lessons, the subject page, the profile and the rest come after this check.</p>
    <div class="g">${imgs}</div>`);
    await delay(400);
    await pg.screenshot({ path: path.join(OUT, `${NAME}.png`), fullPage: true });
    await sheet.close();
    console.log(`Wrote ${path.join(OUT, `${NAME}.png`)} with ${shots.length} shots`);
    if (problems.length) console.log(`PAGE ERRORS:\n${[...new Set(problems)].join('\n')}`);
  } finally {
    await browser.close();
    server.kill();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
