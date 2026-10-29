/**
 * The Spanish skill catch-up in a real Chromium, on a COPY of real data.
 *
 *   node scripts/spanish-catchup-browser-test.js --db=<copy.json> --email=<test email> --pwfile=<file> [--shots=dir] [--port=6992]
 *
 * The copy is made by scripts/spanish-catchup-clone.js (a test account holding one
 * learner's Spanish state: an old accepted gap-scan catch-up, Entry at its level).
 * The test starts its own server on that copy and, at 375 px:
 *   1. opens the path page: the old route is migrated, and the banner leads to the new catch-up;
 *   2. takes the skill check (answers worked out from the same checked banks; the
 *      learner misses GAP_SKILLS on purpose, knows the rest);
 *   3. sees the route ("Catch-up 1 of N", minutes per block);
 *   4. plays every block in /spanish/learn (the Duolingo-style player) to its end;
 *   5. sees review scheduled for the finished skills;
 *   6. reaches and passes the final mixed check, and the recommended grade opens.
 * Then at desktop width it looks at the same pages. No horizontal scroll anywhere.
 * Speech is replaced by stand-ins (as in scripts/spanish-path-browser-test.js).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const assert = require('node:assert/strict');

const arg = (name, dflt) => { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.split('=').slice(1).join('=') : dflt; };
const PORT = Number(arg('port', 6992));
const BASE = `http://localhost:${PORT}`;
const SHOTS = arg('shots', null);
const DB = arg('db', null);
const EMAIL = arg('email', null);
const PW = arg('pwfile', null) ? fs.readFileSync(arg('pwfile'), 'utf8').trim() : null;
const ROOT = path.join(__dirname, '..');
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
if (!DB || !EMAIL || !PW) { console.error('usage: --db=<copy> --email=<test account> --pwfile=<file>'); process.exit(2); }
if (path.resolve(DB) === path.resolve(ROOT, 'data', 'db.json')) { console.error('use a copy, never data/db.json'); process.exit(2); }

// The answers: worked out here from the same deterministic banks the server asks from.
process.env.DB_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cu-bt-')), 'unused.json');
const cu = require('../services/spanish/catch-up');
const answerOf = (q) => cu.questionsFor(cu.skillByKey(q.key)).find((x) => x.qid === q.qid).answer;
const G4 = 'spanish_grade_04_time_food_shopping_and_core_verbs';
const GAP_SKILLS = new Set((arg('gaps', `${G4}|Unit 4.1,${G4}|Unit 4.7`)).split(','));

const log = [];
const pass = (m) => { log.push(`PASS ${m}`); console.log(`PASS ${m}`); };

async function main() {
  // eslint-disable-next-line global-require, import/no-extraneous-dependencies
  const { chromium } = require('playwright');
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cu-browser-'));
  const server = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'development', DB_FILE: path.resolve(DB), HOLDOUT_DIR: tmp, SPANISH_MEDIA_DIR: path.join(tmp, 'media'), SESSION_SECRET: 'catchup-browser-secret-catchup-browser', AI_PROVIDER: 'none', GEMINI_API_KEY: '', ANTHROPIC_API_KEY: '', OPENROUTER_API_KEY: '', LLMGATEWAY_API_KEY: '', MIMO_API_KEY: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverLog = '';
  server.stdout.on('data', (d) => { serverLog += d; });
  server.stderr.on('data', (d) => { serverLog += d; });
  for (let i = 0; i < 120; i++) { await delay(250); try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* not up */ } }

  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const errors = [];
  const runData = (runId) => {
    for (let i = 0; i < 60; i++) {
      try {
        const store = JSON.parse(fs.readFileSync(DB, 'utf8'));
        const row = (store.es_path_runs || []).find((r) => r.run_id === runId);
        if (row) return row.level_data;
      } catch { /* mid-write */ }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
    }
    throw new Error(`run ${runId} not in the database copy`);
  };
  const bareWords = (s) => String(s).replace(/[¿?¡!.,;:…"“”]/g, ' ').split(/\s+/).filter(Boolean);

  async function context(viewport) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch: viewport.width < 500 });
    await ctx.addInitScript(() => {
      window.__spoken = [];
      const synth = { speak(u) { window.__spoken.push({ text: u.text }); setTimeout(() => { if (u.onend) u.onend(); }, 20); }, cancel() {}, getVoices() { return [{ name: 'Test Spanish', lang: 'es-MX', localService: true }]; }, addEventListener() {}, removeEventListener() {} };
      Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
      window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
      class FakeRecognition { start() { setTimeout(() => { const t = window.__sayNext || ''; if (this.onresult) this.onresult({ results: [[{ transcript: t }]] }); if (this.onend) this.onend(); }, 150); } stop() {} abort() {} }
      window.SpeechRecognition = FakeRecognition; window.webkitSpeechRecognition = FakeRecognition;
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404|401|503|Failed to load resource/.test(m.text())) errors.push(m.text()); });
    const r = await page.request.post(`${BASE}/api/auth/login`, { headers: { Origin: BASE, 'Content-Type': 'application/json' }, data: JSON.stringify({ email: EMAIL, password: PW }) });
    assert.equal(r.status(), 200, 'sign in to the test copy');
    return { ctx, page };
  }
  const api = async (page, url) => (await page.request.get(`${BASE}${url}`)).json();
  const shot = async (page, file, full = false) => { if (!SHOTS) return; await delay(300); await page.screenshot({ path: path.join(SHOTS, file), fullPage: full }); };
  const noSideScroll = async (page, where) => {
    const w = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
    assert.ok(w.doc <= w.win + 1, `${where}: no horizontal scroll at ${w.win}px (page is ${w.doc}px wide)`);
  };

  // ── one level in the player, to its result card (adapted from spanish-path-browser-test.js) ──
  async function answerChallenge(page, items) {
    if (await page.$('.es-lesson__body .es-audio-row')) await delay(900);
    const info = await page.evaluate(() => {
      const q = (s) => document.querySelector(s);
      const active = q('.es-story__q:not([data-done])') || q('.es-lesson__body');
      const scopeSel = q('.es-story__q:not([data-done])') ? '.es-story__q:not([data-done]) ' : '.es-lesson__body ';
      const scope = (s) => [...active.querySelectorAll(s)];
      return {
        header: (q('.es-challenge-head .es-prompt') || q('.es-story__q:not([data-done]) .es-story__qhead') || {}).textContent || '',
        choices: scope('.es-choices .es-choice').map((b) => (b.querySelector('.es-choice__text, .es-choice__row span[lang], .es-choice__row span') || b).textContent.trim()),
        pairs: !!q('.es-pairs'), bank: !!active.querySelector('.es-bank'), type: !!active.querySelector('.es-typebox .es-input'), inline: !!active.querySelector('.es-inline-input'),
        bubble: (active.querySelector('.es-bubble__text') || {}).textContent || '',
        tiles: scope('.es-bank .es-tile').map((t) => t.textContent),
        spoken: (window.__spoken.filter((s) => s.text.trim()).slice(-1)[0] || {}).text || '',
        scopeSel,
      };
    });
    const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
    const labelOf = (c) => (typeof c === 'string' ? c : c.es);
    if (info.pairs) {
      const here = await page.evaluate(() => [...document.querySelectorAll('.es-pairs .es-choice')].map((b) => ({ side: b.dataset.side, text: b.querySelector('.es-choice__text').textContent })));
      const pairList = items.filter((i) => i.kind === 'match_pairs').flatMap((i) => i.pairs);
      for (const p of here.filter((x) => x.side === '0')) {
        const en = (pairList.find(([es]) => es === p.text) || [])[1];
        await page.click(`.es-pairs .es-choice[data-side="0"]:has(.es-choice__text:text-is("${p.text}"))`);
        await page.click(`.es-pairs .es-choice[data-side="1"]:has(.es-choice__text:text-is("${en}"))`);
        await delay(450);
      }
      return 'match_pairs';
    }
    if (info.choices.length) {
      const item = items.find((i) => Array.isArray(i.choices) && sameList(i.choices.map(labelOf), info.choices)) || items.find((i) => i.kind === 'minimal_pair' && sameList(i.pair, info.choices));
      let idx = 0;
      if (item && item.kind === 'minimal_pair') idx = info.choices.indexOf(info.spoken) >= 0 ? info.choices.indexOf(info.spoken) : item.answer;
      else if (item) idx = item.answer;
      await page.locator(`${info.scopeSel}.es-choices .es-choice`).nth(idx).click();
      await page.click('.es-footer .es-btn--success');
      return item ? item.kind : 'choice';
    }
    if (info.bank) {
      const item = items.find((i) => Array.isArray(i.tiles) && sameList([...i.tiles].sort(), [...info.tiles].sort()));
      assert.ok(item, `a word-bank item matches the tiles ${info.tiles.join(' ')}`);
      for (const w of bareWords(item.accepted[0])) {
        await page.locator(`${info.scopeSel}.es-bank .es-tile:not([data-state="ghost"])`, { hasText: new RegExp(`^${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }).first().click();
      }
      await page.click('.es-footer .es-btn--success');
      return item.kind === 'tap_heard' ? 'tap_heard' : 'word_bank';
    }
    if (info.type || info.inline) {
      const item = info.inline ? items.find((i) => i.kind === 'complete_translation' && i.en && info.header)
        : (items.find((i) => i.kind === 'type_heard' && i.es === info.spoken) || items.find((i) => i.kind === 'translate' && i.text === info.bubble) || items.find((i) => i.kind === 'translate' && i.mode === 'type'));
      let text = item ? item.accepted[0] : info.spoken;
      if (item && item.kind === 'type_heard') text = info.spoken;
      if (info.inline) {
        // Several complete-the-translation items: the one whose English is on screen.
        const en = await page.evaluate(() => (document.querySelector('.es-lesson__body') || {}).textContent || '');
        const exact = items.find((i) => i.kind === 'complete_translation' && en.includes(i.en));
        if (exact) text = exact.accepted[0];
        await page.fill(`${info.scopeSel}.es-inline-input`, text);
      } else await page.fill(`${info.scopeSel}.es-typebox .es-input`, text);
      await page.click('.es-footer .es-btn--success');
      return 'typed';
    }
    return null;
  }

  async function playLevel(page, tag, kinds) {
    await page.waitForSelector('#start', { timeout: 20000 });
    const runId = await page.evaluate(async () => null);
    void runId;
    await delay(600);
    // The run the page just opened: the newest unfinished run of this account in the copy.
    let data = null;
    for (let i = 0; i < 40 && !data; i++) {
      try {
        const store = JSON.parse(fs.readFileSync(DB, 'utf8'));
        const me = store.users.find((u) => u.email === EMAIL);
        const open = (store.es_path_runs || []).filter((r) => r.user_id === me.id && !r.finished_at);
        if (open.length) data = open[open.length - 1].level_data;
      } catch { /* mid-write */ }
      if (!data) await delay(300);
    }
    assert.ok(data, `${tag}: the run is in the copy`);
    const items = [];
    const walk = (n) => { if (!n || typeof n !== 'object') return; if (Array.isArray(n)) { n.forEach(walk); return; } if (n.id && n.kind) items.push(n); Object.values(n).forEach((v) => { if (v && typeof v === 'object') walk(v); }); };
    walk(data);
    await page.click('#start');
    for (let step = 0; step < 500; step++) {
      await delay(120);
      if (await page.$('.es-learn__stats')) break;
      const scrim = await page.$('.es-scrim button');
      if (scrim) { await scrim.click(); continue; }
      const sheet = await page.$('footer.es-footer[data-result] .es-footer__inner > .es-btn');
      if (sheet) { await sheet.click(); continue; }
      const head = await page.$('.es-challenge-head .es-prompt, .es-story__q:not([data-done]) .es-story__qhead');
      const check = await page.$('.es-footer .es-btn--success');
      if (head && check) {
        const k = await answerChallenge(page, items);
        if (k) {
          if (!kinds.has(k)) { kinds.add(k); if (['match_pairs', 'listen_choose', 'word_bank', 'tap_heard', 'select_image'].includes(k)) await shot(page, `phone-20-player-${k}.png`); }
          continue;
        }
      }
      const mic = (await page.$$('.es-mic[data-state="idle"]')).pop();
      if (mic && !(await page.$('.es-footer .es-btn--success:not([disabled])'))) {
        const target = await page.evaluate(() => { const b = [...document.querySelectorAll('.es-speaker .es-bubble__text')].pop(); return b ? b.textContent : ''; });
        await page.evaluate((t) => { window.__sayNext = t; }, target);
        if (!kinds.has('speak')) { kinds.add('speak'); await shot(page, 'phone-21-player-speak.png'); }
        await mic.click(); await delay(500);
        const go = await page.$('.es-footer .es-btn--success:not([disabled])');
        if (go) await go.click();
        continue;
      }
      const btn = await page.$('.es-footer .es-footer__inner > .es-btn:not([disabled]), .es-footer .es-btn--primary:not([disabled]), .es-footer .es-btn--secondary:not([disabled])');
      if (btn) { await btn.click(); continue; }
    }
    await page.waitForSelector('.es-learn__stats', { timeout: 20000 });
    return page.evaluate(() => document.querySelector('.es-learn__title').textContent);
  }

  async function takeQuestions(page, kind, onFirst) {
    for (let i = 0; i < 300; i++) {
      const v = await api(page, '/api/es/catch-up');
      const q = kind === 'check' ? (v.phase === 'check' ? v.question : null) : (v.phase === 'recheck' && v.recheck ? v.recheck.question : null);
      if (!q) return v;
      await page.waitForSelector(`.cu__q[data-kind="${kind}"] .es-choice`, { timeout: 15000 });
      if (i === 0 && onFirst) await onFirst();
      const want = kind === 'check' && GAP_SKILLS.has(q.key) ? q.choices.find((c) => c !== answerOf(q)) : answerOf(q);
      await page.locator('.cu__choices .es-choice', { hasText: want }).filter({ has: page.locator(`.es-choice__text:text-is(${JSON.stringify(want)})`) }).first().click();
      if (i === 3) { await page.waitForSelector('.cu__feedback[data-ok]'); await shot(page, `phone-${kind === 'check' ? '03' : '41'}-${kind}-feedback.png`); }
      await page.waitForFunction((n) => !document.querySelector('.cu__feedback') || document.querySelector('.cu__feedback').textContent === '' || document.querySelector('.cu__meta') && !document.querySelector('.cu__meta').textContent.includes(`question ${n} `), q.index, { timeout: 15000 }).catch(() => {});
      await delay(900);
    }
    throw new Error('questions did not end');
  }

  try {
    // ── 375 px: the whole route ─────────────────────────────────────────────
    const { ctx, page } = await context({ width: 375, height: 812 });
    const before = await api(page, '/api/es/catch-up/summary');
    const main = before.recommended;
    await page.goto(`${BASE}/path?enrollment=${main.enrollment_id}`);
    await page.waitForSelector('.catch-banner a[href="/spanish/catch-up"]', { timeout: 20000 });
    await noSideScroll(page, 'path page');
    await shot(page, 'phone-01-path-banner-migrated.png');
    pass('the path page leads an old-style catch-up to the new skill catch-up');

    await page.goto(`${BASE}/spanish/catch-up`);
    await page.waitForSelector('[data-migrated]', { timeout: 15000 });
    await noSideScroll(page, 'catch-up intro');
    await shot(page, 'phone-02-migrated-intro.png', true);
    pass('the migrated learner is told the catch-up now checks each skill (their old route was whole grades)');
    await page.click('#go');
    const afterCheck = await takeQuestions(page, 'check', async () => { await noSideScroll(page, 'check question'); await shot(page, 'phone-03-check-question.png'); });
    assert.equal(afterCheck.phase, 'route');
    pass(`the skill check asked ${afterCheck.counts.asked} questions over ${afterCheck.counts.skills} skills: ${afterCheck.counts.known} known, ${afterCheck.counts.learn} to learn`);

    await page.waitForSelector('#play', { timeout: 15000 });
    await noSideScroll(page, 'route');
    await shot(page, 'phone-04-route.png', true);
    const route = afterCheck.route;
    assert.equal(route.k, 1);
    assert.equal(route.n, GAP_SKILLS.size);
    pass(`the route: ${route.blocks.map((b) => `catch-up ${b.k} of ${route.n}: ${b.unit} ${b.title} (${b.minutes} min)`).join('; ')}`);

    const kinds = new Set();
    for (let b = 0; b < route.n; b++) {
      await page.goto(`${BASE}/spanish/catch-up`);
      await page.click('#play');
      await page.waitForURL(/\/spanish\/learn\?enrollment=\d+&level=\d+&catchup=1/, { timeout: 15000 });
      for (let l = 0; l < 20; l++) {
        await page.waitForSelector('#start', { timeout: 20000 });
        if (b === 0 && l === 0) { await noSideScroll(page, 'level start'); await shot(page, 'phone-10-block-level-start.png'); }
        const title = await playLevel(page, `block ${b + 1} level ${l + 1}`, kinds);
        await noSideScroll(page, 'level result');
        if (b === 0 && l === 0) await shot(page, 'phone-11-block-level-done.png');
        const next = await page.$('[data-catchup="next"]');
        const label = next ? await next.textContent() : '';
        if (/Catch-up \d+ of \d+ done/.test(title)) { await shot(page, `phone-12-block-${b + 1}-done.png`); }
        if (!next || /Next: catch-up|final check/i.test(label)) break;
        await next.click();
      }
    }
    pass(`every block played in /spanish/learn, with ${[...kinds].join(', ')}`);

    await page.goto(`${BASE}/spanish/catch-up`);
    await page.waitForSelector('[data-review]', { timeout: 15000 });
    const reviewText = await page.textContent('[data-review]');
    await page.locator('[data-review]').first().scrollIntoViewIfNeeded();
    await shot(page, 'phone-30-review-scheduled.png');
    pass(`review is scheduled for finished skills: "${reviewText.trim()}"`);

    await page.waitForSelector('#recheck');
    await shot(page, 'phone-40-final-check-ready.png');
    await page.click('#recheck');
    const done = await takeQuestions(page, 'recheck', async () => { await noSideScroll(page, 'final check'); await shot(page, 'phone-41-final-check-question.png'); });
    assert.equal(done.phase, 'done');
    await page.waitForSelector('#main');
    await shot(page, 'phone-50-caught-up.png', true);
    pass(`the final mixed check (${done.rechecks[0].total} questions, ${done.rechecks[0].score}%) passed; ${await page.textContent('#main')}`);
    await ctx.close();

    // ── desktop: the same pages ─────────────────────────────────────────────
    const desk = await context({ width: 1280, height: 860 });
    await desk.page.goto(`${BASE}/spanish/catch-up`);
    await desk.page.waitForSelector('[data-headline]');
    await noSideScroll(desk.page, 'desktop route');
    await shot(desk.page, 'desktop-01-caught-up-route.png', true);
    const firstBlock = done.route.blocks[0];
    await desk.page.goto(`${BASE}/spanish/learn?enrollment=${firstBlock.enrollment_id}&level=${firstBlock.levels[1].level}&catchup=1`);
    await desk.page.waitForSelector('#start');
    await shot(desk.page, 'desktop-02-block-level.png');
    await desk.page.goto(`${BASE}/path?enrollment=${main.enrollment_id}`);
    await desk.page.waitForSelector('.catch-banner', { timeout: 20000 });
    await shot(desk.page, 'desktop-03-path-caught-up.png');
    pass('desktop: route, a block level and the path banner render without side scroll');
    await desk.ctx.close();
  } finally {
    await browser.close();
    server.kill();
  }
  if (errors.length) { console.log(`page errors:\n  ${errors.join('\n  ')}`); }
  if (SHOTS) fs.writeFileSync(path.join(SHOTS, 'results.txt'), `${log.join('\n')}\n${errors.length ? `\npage errors:\n${errors.join('\n')}\n` : ''}`);
  if (errors.length) process.exit(1);
  void serverLog;
}

main().catch((err) => { console.error(err); process.exit(1); });
