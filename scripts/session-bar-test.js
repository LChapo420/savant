/**
 * The study session bar and the instant enforcer (docs/SESSION-BAR.md), UI_V2, in a real browser, phone (375) and desktop (1280), light:
 * the clock's icon centred in its circle; the bar's every state and move (no session -> Start session; running -> stopwatch, Pause, End; paused -> Resume, End;
 * End -> End session, End day, Cancel); the green dot and its slow pulse (still when paused or with reduced motion); the stopwatch against the server's time;
 * the enforcer opening after End with its questions ready and no wait; and, in a child process, the pre-built questions against drawing them at End.
 *
 *   node scripts/session-bar-test.js
 *   SESSION_BAR_SHOTS=<dir> node scripts/session-bar-test.js    also saves a screenshot of each bar state at 375 and 1280
 *
 * Own servers, temporary data, synthetic learners, every model key blanked. Needs Playwright (PLAYWRIGHT_PATH, default the shared copy).
 */
/* eslint-disable no-await-in-loop */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const MIN = 60000;
const DAY = 24 * 3600 * 1000;
const TRACK = 'math';
const GRADE = 'counting_and_comparing';
const PASSWORD = 'test-password-123';
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/** Synthetic work: an old lesson session, and a study session that started `minutes` ago with an answer every minute, on objectives that have written questions. */
function seedWork(db, userId, { minutes = 10, answers = 8, running = true } = {}) {
  const study = require('../services/study-sessions'); // eslint-disable-line global-require
  const coverage = require('../services/coverage'); // eslint-disable-line global-require
  const objItems = require('../services/objective-items'); // eslint-disable-line global-require
  const model = coverage.modelFor(TRACK, GRADE);
  const objs = model.objectives.filter((o) => objItems.forObjective(TRACK, GRADE, o.id).length >= 3);
  const enrollment = db.insert('enrollments', { user_id: userId, track_id: TRACK, grade_id: GRADE, target_level: 300, current_level: 200, level_items: 0, levels_completed: 0, xp: 0, status: 'active', placed_at: new Date().toISOString() });
  const old = db.insert('sessions', { user_id: userId, enrollment_id: enrollment.id, track_id: TRACK, grade_id: GRADE, level: 1, kind: 'lesson', blocks: [], started_at: new Date(Date.now() - 90 * DAY).toISOString(), ended_at: new Date().toISOString() });
  db.update('users', userId, { onboarded: true, retention_tz: 'UTC' });
  const t0 = Date.now() - minutes * MIN;
  study.start(userId, { now: t0 });
  let made = 0;
  for (let k = 0; k < minutes * 2 - 1; k++) {
    const t = t0 + (k + 1) * 30000;
    study.beat(userId, { now: t });
    if (made < answers && (k + 1) % Math.max(1, Math.floor((minutes * 2) / answers)) === 0) {
      const o = objs[made % objs.length];
      db.insert('items', {
        user_id: userId, session_id: old.id, skill_id: o.skill, difficulty: 3, format: 'multiple_choice', role: 'check', level: o.lesson_level,
        prompt: `q ${o.id} ${t} ${Math.random()}`, answer: 'a', choices: ['a', 'b', 'c', 'd'], rationale: 'because', block: 0, index: 0,
        user_answer: made % 3 ? 'a' : 'b', correct: !!(made % 3), ms: 15000, coach_used: false, answered_at: new Date(t).toISOString(), updated_at: new Date(t).toISOString(),
      });
      made += 1;
    }
  }
  if (!running) study.end(userId, { now: Date.now() });
}

// ── child modes ────────────────────────────────────────────────────────────
if (process.argv[2] === '--seed') {
  const db = require('../config/db'); // eslint-disable-line global-require
  seedWork(db, Number(process.argv[3]));
  db.flush();
  process.exit(0);
}
if (process.argv[2] === '--bench') {
  const db = require('../config/db'); // eslint-disable-line global-require
  const study = require('../services/study-sessions'); // eslint-disable-line global-require
  const prebuild = require('../services/enforcer-prebuild'); // eslint-disable-line global-require
  const out = { without: [], with: [], build: [] };
  const mk = (i) => db.insert('users', { email: `bench-${i}@example.test`, name: `b${i}`, password_hash: 'x', streak: 0, xp: 0, onboarded: true, retention_tz: 'UTC' });
  for (let i = 0; i < 6; i++) {
    for (const mode of ['without', 'with']) {
      const u = mk(`${mode}${i}`);
      seedWork(db, u.id, { minutes: 20, answers: 14 });
      if (mode === 'with') { const r = prebuild.build(u.id, { force: true }); out.build.push(Math.round(r.ms * 10) / 10); } else prebuild.forget(u.id);
      const t = process.hrtime.bigint();
      const ended = study.end(u.id, { kind: 'session' });
      out[mode].push(Math.round(Number(process.hrtime.bigint() - t) / 1e5) / 10);
      const enf = db.byId('enforcers', ended.enforcer_id);
      out[`${mode}_status`] = enf && enf.status;
    }
  }
  out.reused = prebuild.stats.reused;
  console.log(`BENCH ${JSON.stringify(out)}`);
  process.exit(0);
}

// ── the browser test ───────────────────────────────────────────────────────
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/coding/savant-wt/pw/node_modules/playwright'); // eslint-disable-line import/no-dynamic-require

const PORT = 6863;
const BASE = `http://localhost:${PORT}`;
const SHOTS = process.env.SESSION_BAR_SHOTS;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'session-bar-'));
const DB_FILE = path.join(tmp, 'db.json');
const VIEWS = { phone: { viewport: { width: 375, height: 420 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }, desktop: { viewport: { width: 1280, height: 800 } } };
let passed = 0;
const ok = async (name, fn) => { await fn(); passed += 1; console.log(`  ok  ${name}`); };

function env(extra = {}) {
  const e = {
    ...process.env, UI_V2: 'on', RETENTION_ENFORCERS: 'on', ENFORCER_PREBUILD_MS: '500', BETA_GATE: '', BETA_SIGNIN_ONLY: '', PORT: String(PORT), NODE_ENV: 'development', DB_FILE,
    HOLDOUT_DIR: tmp, SPANISH_MEDIA_DIR: path.join(tmp, 'media'), XKIRO_LEARNER_UNTIL: '2000-01-01T00:00:00Z', FACT_CHECK_ALL: '0', MUNITO_LEARNER: 'off', CORAL_LEARNER: 'off',
    GLADIA_LEARNER: 'off', LYCEUM_LEARNER: 'off', GONKA_LEARNER: 'off', GROKIFIED_LEARNER: 'off', UPLOAD_AUTOBUILD: 'off', SPANISH_WRITE_AHEAD: 'off', ...extra,
  };
  for (const k of Object.keys(e)) if (/_API_KEY$|_KEY$|_TOKEN$/.test(k)) e[k] = '';
  return e;
}
async function up() {
  for (let i = 0; i < 200; i++) {
    await delay(200);
    try { if ((await fetch(`${BASE}/api/health`)).ok) return; } catch { /* up soon */ }
  }
  throw new Error('server did not start');
}
const serve = async () => { const p = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: env(), stdio: 'ignore' }); await up(); return p; };
const stop = (p) => new Promise((r) => { p.once('exit', r); p.kill(); setTimeout(r, 3000); });

async function login(browser, email, opts) {
  const ctx = await browser.newContext(opts);
  const call = (m, u, d) => ctx.request.fetch(BASE + u, { method: m, headers: { Origin: BASE, 'Content-Type': 'application/json' }, data: d ? JSON.stringify(d) : undefined }).then(async (r) => ({ status: r.status(), json: await r.json().catch(() => null) }));
  const r = await call('POST', '/api/auth/login', { email, password: PASSWORD });
  assert(r.status < 300, `login ${r.status}`);
  return { ctx, call };
}

const $ = (page, sel) => page.locator(sel);
const barText = (page) => page.locator('#u2-sb-bar button').allInnerTexts();
const dotAnim = (page) => page.evaluate(() => { const c = getComputedStyle(document.querySelector('.u2-sb-dot')); return { name: c.animationName, dur: c.animationDuration, bg: c.backgroundColor, show: c.display }; });
const stopwatch = (page) => page.locator('#u2-sb-time').innerText();
const secs = (t) => { const [h, m, s] = t.split(':').map(Number); return h * 3600 + m * 60 + s; };

async function shot(page, name, view) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  const w = VIEWS[view].viewport.width;
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(SHOTS, `${name}-${w}.png`), clip: { x: 0, y: 0, width: w, height: 150 } });
}

(async () => {
  // 1. Register two learners, then seed work for the first (a session running for ten minutes).
  let proc = await serve();
  const reg = async (email, name) => {
    const r = await fetch(`${BASE}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE }, body: JSON.stringify({ email, password: PASSWORD, display_name: name, birth_year: 1990, birth_month: 5, country: 'US', agreed: true }) });
    assert(r.status < 300, `register ${r.status}`);
    return (await r.json()).user.id;
  };
  const idA = await reg('sb-run@example.test', 'Ada Run');
  await reg('sb-idle@example.test', 'Ivy Idle');
  await delay(4000); // the data file is written a moment after a change
  await stop(proc);
  const seeded = spawn(process.execPath, [__filename, '--seed', String(idA)], { cwd: ROOT, env: env(), stdio: 'inherit' });
  await new Promise((r) => seeded.once('exit', r));
  proc = await serve();
  const browser = await chromium.launch();
  try {
    for (const view of ['phone', 'desktop']) {
      const opts = { ...VIEWS[view], colorScheme: 'light' };
      const A = await login(browser, 'sb-run@example.test', opts);
      const page = await A.ctx.newPage();
      await page.goto(`${BASE}/dashboard`);
      page.on('console', (m) => { if (process.env.SB_DEBUG) console.log('console:', m.text()); });
      page.on('pageerror', (e) => console.log('pageerror:', e.message));
      await page.waitForSelector('#u2-sb-clock', { timeout: 15000 }).catch(async (e) => {
        console.log(await page.evaluate(() => JSON.stringify({ url: location.href, header: (document.getElementById('header') || {}).outerHTML && document.getElementById('header').outerHTML.slice(0, 300), study: !!window.Study, st: window.Study && !!window.Study.state(), sb: !!window.U2SessionBar, u2: document.documentElement.className })));
        throw e;
      });

      await ok(`${view}: the clock's icon is centred in its circle`, async () => {
        const m = await page.evaluate(() => {
          const c = document.querySelector('#u2-sb-clock').getBoundingClientRect();
          const s = document.querySelector('#u2-sb-clock svg').getBoundingClientRect();
          const p = document.querySelector('#u2-sb-clock svg path').getBoundingClientRect();
          return { dx: (s.left + s.right) / 2 - (c.left + c.right) / 2, dy: (s.top + s.bottom) / 2 - (c.top + c.bottom) / 2, px: (p.left + p.right) / 2 - (c.left + c.right) / 2, py: (p.top + p.bottom) / 2 - (c.top + c.bottom) / 2, w: c.width, h: c.height };
        });
        assert(Math.abs(m.dx) <= 0.5 && Math.abs(m.dy) <= 0.5, `svg off centre ${JSON.stringify(m)}`);
        assert(Math.abs(m.px) <= 1 && Math.abs(m.py) <= 1, `glyph off centre ${JSON.stringify(m)}`);
        assert(m.w === m.h, 'circle');
      });

      await ok(`${view}: a running session shows the dot, pulsing slowly, and the bar is closed`, async () => {
        assert.strictEqual(await $(page, '#u2-sb-clock').getAttribute('aria-expanded'), 'false');
        assert(!(await $(page, '#u2-sb-bar').isVisible()), 'bar hidden');
        const d = await dotAnim(page);
        assert.strictEqual(d.show, 'block');
        assert.strictEqual(d.name, 'u2-sb-pulse');
        const dur = parseFloat(d.dur);
        assert(dur >= 2 && dur <= 3, `cycle ${d.dur}`);
        // Soft fade: the opacity moves gradually, never a hard blink.
        const o = []; for (let i = 0; i < 6; i++) { o.push(await page.evaluate(() => Number(getComputedStyle(document.querySelector('.u2-sb-dot')).opacity))); await page.waitForTimeout(250); }
        assert(Math.max(...o) - Math.min(...o) > 0.1, `opacity moves ${o}`);
        for (let i = 1; i < o.length; i++) assert(Math.abs(o[i] - o[i - 1]) < 0.5, `gradual ${o}`);
      });

      await ok(`${view}: tap the clock, the bar slides out: stopwatch, Pause, End; the stopwatch is the server's time`, async () => {
        await $(page, '#u2-sb-clock').click();
        await $(page, '#u2-sb-bar').waitFor({ state: 'visible' });
        assert.strictEqual(await $(page, '#u2-sb-clock').getAttribute('aria-expanded'), 'true');
        assert.deepStrictEqual(await barText(page), ['Pause', 'End']);
        const t = await stopwatch(page);
        assert(/^\d:\d\d:\d\d$/.test(t), t);
        const st = (await A.call('GET', '/api/retention/state')).json.study;
        assert(Math.abs(secs(t) - st.active_ms / 1000) <= 5, `stopwatch ${t} vs server ${st.active_ms}`);
        assert.strictEqual(await $(page, '#u2-sb-time').getAttribute('aria-live'), 'off');
        await page.waitForTimeout(1300);
        assert(secs(await stopwatch(page)) > secs(t), 'it counts');
        await shot(page, `running`, view);
      });

      await ok(`${view}: Pause -> Resume and End, the stopwatch stops, the dot stays still and grey; Resume goes on`, async () => {
        await $(page, '[data-sb="pause"]').click();
        await page.waitForSelector('[data-sb="resume"]');
        assert.deepStrictEqual(await barText(page), ['Resume', 'End']);
        const a = await stopwatch(page); await page.waitForTimeout(1400);
        assert.strictEqual(await stopwatch(page), a, 'stopped');
        const d = await dotAnim(page);
        assert.strictEqual(d.show, 'block'); assert.strictEqual(d.name, 'none');
        assert.strictEqual((await A.call('GET', '/api/retention/state')).json.study.status, 'paused');
        await shot(page, `paused`, view);
        await $(page, '[data-sb="resume"]').click();
        await page.waitForSelector('[data-sb="pause"]');
        assert.strictEqual((await dotAnim(page)).name, 'u2-sb-pulse');
      });

      await ok(`${view}: End -> End session, End day, Cancel; Cancel returns to the running bar`, async () => {
        await $(page, '[data-sb="end"]').click();
        await page.waitForSelector('[data-sb="end-session"]');
        assert.deepStrictEqual(await barText(page), ['End session', 'End day', 'Cancel']);
        const box = await $(page, '#u2-sb-bar').boundingBox();
        assert(box.x >= 0 && box.x + box.width <= VIEWS[view].viewport.width, `bar on screen ${JSON.stringify(box)}`);
        await shot(page, `end`, view);
        await $(page, '[data-sb="cancel"]').click();
        await page.waitForSelector('[data-sb="pause"]');
        assert.deepStrictEqual(await barText(page), ['Pause', 'End']);
      });

      await ok(`${view}: tap outside, Escape and the clock close the bar; the session keeps running`, async () => {
        await page.mouse.click(VIEWS[view].viewport.width * 0.6, 3);
        await page.waitForFunction(() => document.querySelector('#u2-sb-clock').getAttribute('aria-expanded') === 'false');
        await $(page, '#u2-sb-clock').click(); await $(page, '#u2-sb-bar').waitFor({ state: 'visible' });
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => document.querySelector('#u2-sb-clock').getAttribute('aria-expanded') === 'false');
        await $(page, '#u2-sb-clock').click(); await $(page, '#u2-sb-bar').waitFor({ state: 'visible' });
        await $(page, '#u2-sb-clock').click();
        await page.waitForFunction(() => document.querySelector('#u2-sb-clock').getAttribute('aria-expanded') === 'false');
        assert.strictEqual((await A.call('GET', '/api/retention/state')).json.study.status, 'running');
      });

      await ok(`${view}: reduced motion keeps the dot still`, async () => {
        const R = await login(browser, 'sb-run@example.test', { ...opts, reducedMotion: 'reduce' });
        const p = await R.ctx.newPage();
        await p.goto(`${BASE}/dashboard`); await p.waitForSelector('#u2-sb-clock');
        const d = await dotAnim(p);
        assert.strictEqual(d.show, 'block'); assert.strictEqual(d.name, 'none');
        await R.ctx.close();
      });

      // The idle learner: Start session.
      const B = await login(browser, 'sb-idle@example.test', opts);
      const pb = await B.ctx.newPage();
      await pb.goto(`${BASE}/dashboard`); await pb.waitForSelector('#u2-sb-clock', { timeout: 15000 });
      await ok(`${view}: no session -> Start session; starting shows the dot and the stopwatch with Pause and End`, async () => {
        assert.strictEqual((await dotAnim(pb)).show, 'none');
        await $(pb, '#u2-sb-clock').click();
        await pb.waitForSelector('[data-sb="start"]');
        assert.deepStrictEqual(await barText(pb), ['Start session']);
        await shot(pb, `idle`, view);
        await $(pb, '[data-sb="start"]').click();
        await pb.waitForSelector('[data-sb="pause"]');
        assert.deepStrictEqual(await barText(pb), ['Pause', 'End']);
        assert(secs(await stopwatch(pb)) <= 3, 'starts at zero');
        assert.strictEqual((await dotAnim(pb)).name, 'u2-sb-pulse');
        assert.strictEqual((await B.call('GET', '/api/retention/state')).json.study.status, 'running');
      });
      // End the idle learner's session so the next view starts it again from nothing.
      await B.call('POST', '/api/retention/study/end', { kind: 'session' });
      await pb.close(); await B.ctx.close();

      if (view === 'desktop') {
        await ok('desktop: End session opens the enforcer at once, its first question ready, nothing left to wait for', async () => {
          // The page's own heartbeat and the state call have drawn the questions ahead by now.
          let st = null;
          for (let i = 0; i < 20; i++) { st = (await A.call('GET', '/api/retention/state')).json; if (st.prebuilt && st.prebuilt.ready) break; await delay(300); }
          assert(st.prebuilt && st.prebuilt.ready && st.prebuilt.questions >= 1 && st.prebuilt.first >= 1, `prebuilt ${JSON.stringify(st.prebuilt)}`);
          await $(page, '#u2-sb-clock').click();
          await $(page, '[data-sb="end"]').click();
          await page.waitForSelector('[data-sb="end-session"]');
          const t0 = Date.now();
          await $(page, '[data-sb="end-session"]').click();
          await page.waitForSelector('form#choose', { timeout: 10000 });
          const toChoose = Date.now() - t0;
          assert(page.url().includes('/enforcer?id='), page.url());
          const id = new URL(page.url()).searchParams.get('id');
          const tiers = (await A.call('GET', `/api/retention/enforcers/${id}`)).json.enforcer.options.filter((o) => o.available);
          assert(tiers.length >= 1, 'a tier is offered');
          // The choice stays: the learner picks, then the first question is there.
          const t1 = Date.now();
          await page.locator('form#choose input[name="tier"]:not([disabled])').first().check();
          await $(page, '#go').click();
          await page.waitForSelector('#item .prompt, #item .question, #item', { timeout: 10000 });
          await page.waitForFunction(() => { const i = document.getElementById('item'); return i && i.innerText.trim().length > 5; });
          const toQuestion = Date.now() - t1;
          const enf = (await A.call('GET', `/api/retention/enforcers/${id}`)).json.enforcer;
          assert.strictEqual(enf.status, 'running');
          assert(enf.items.length === enf.planned && enf.items.every((i) => i.prompt), 'every question is already there: nothing is generated after the first');
          const bad = await page.evaluate(() => /Setting up|Saving/.test(document.body.innerText));
          assert(!bad, 'no waiting state left on screen');
          const nav = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; const r = performance.getEntriesByType('resource').find((e) => /retention\/enforcers\/\d+$/.test(e.name)); return { html: Math.round(n.responseEnd), loaded: Math.round(n.loadEventEnd), enforcerApi: r ? Math.round(r.duration) : null }; });
          console.log(`     enforcer page: html done ${nav.html} ms after navigation start, load ${nav.loaded} ms, enforcer GET ${nav.enforcerApi} ms`);
          console.log(`     timings: End click -> enforcer page with the choice ${toChoose} ms; choice -> first question ${toQuestion} ms; questions ${enf.items.length}`);
          assert(toQuestion < 300, `first question ${toQuestion} ms`);
        });
      }
      await A.ctx.close();
    }

    await ok('the pre-built questions: End draws faster with them, and the final set is the same kind (child benchmark)', async () => {
      const out = await new Promise((resolve, reject) => {
        let text = '';
        const c = spawn(process.execPath, [__filename, '--bench'], { cwd: ROOT, env: env({ DB_FILE: path.join(tmp, 'bench.json') }) });
        c.stdout.on('data', (d) => { text += d; });
        c.on('exit', () => { const m = /BENCH (.*)/.exec(text); if (m) resolve(JSON.parse(m[1])); else reject(new Error(`bench failed: ${text}`)); });
      });
      const med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
      console.log(`     End (study/end, ms) without ${JSON.stringify(out.without)} median ${med(out.without)}; with ${JSON.stringify(out.with)} median ${med(out.with)}; drawn ahead (background) ${JSON.stringify(out.build)}; reused ${out.reused}`);
      assert(out.reused > 0, 'pre-built questions were used');
      assert(out.with_status === out.without_status, `same outcome ${out.with_status} / ${out.without_status}`);
      assert(med(out.with) <= med(out.without) + 1, 'not slower');
      assert(Math.max(...out.with) < 300, 'End under 300 ms');
    });
  } finally {
    await browser.close();
    await stop(proc);
  }
  console.log(`session-bar: ${passed} checks passed`);
  fs.rmSync(tmp, { recursive: true, force: true });
})().catch((err) => { console.error(err); process.exit(1); });
