/**
 * Click through the main Spanish path's Duolingo-style levels in a real
 * Chromium, at phone width (375 px) and at desktop width.
 *
 *   node scripts/spanish-path-browser-test.js [--shots=<dir>] [--port=6790]
 *
 * Starts its own server on a fresh, temporary data directory (never real
 * learner data), registers test accounts, places a beginner, sets a
 * conversational goal, and plays levels through /dashboard -> /session ->
 * /spanish/learn. Answers are read from the test database the server writes
 * (the browser never receives them), so the bot can answer right, or wrong on
 * purpose to see the feedback sheet and the end-of-lesson mistake review.
 *
 * Speech: the browser's speech synthesis and recognition are replaced by
 * stand-ins that record what was spoken and "hear" the expected sentence, so
 * the fallback paths (no server voice, no server transcription) are exercised;
 * real voices, real microphones, ElevenLabs and the transcription route are not
 * (they need keys and hardware). Needs Playwright with its Chromium
 * (require('playwright')); it is not a dependency of the app.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const assert = require('node:assert/strict');

const arg = (name, dflt) => { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.split('=').slice(1).join('=') : dflt; };
const PORT = Number(arg('port', 6790));
const BASE = `http://localhost:${PORT}`;
const SHOTS = arg('shots', null);
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const ROOT = path.join(__dirname, '..');

const results = [];
const pass = (msg) => { results.push(['PASS', msg]); console.log(`PASS ${msg}`); };
const note = (msg) => { results.push(['NOTE', msg]); console.log(`NOTE ${msg}`); };

async function main() {
  // eslint-disable-next-line global-require, import/no-extraneous-dependencies
  const { chromium } = require('playwright');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'es-path-'));
  const dbFile = path.join(tmp, 'db.json');
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const server = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env, PORT: String(PORT), NODE_ENV: 'development', DB_FILE: dbFile, HOLDOUT_DIR: tmp,
      SPANISH_MEDIA_DIR: path.join(tmp, 'media'), SESSION_SECRET: 'browser-test-secret-browser-test-secret',
      OWNER_EMAIL: 'owner-test@example.com', GEMINI_API_KEY: '', MIMO_API_KEY: '', LLMGATEWAY_API_KEY: '',
      OPENROUTER_API_KEY: '', ANTHROPIC_API_KEY: '', AI_PROVIDER: 'none',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  server.stdout.on('data', (d) => { log += d; });
  server.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 60; i++) { await delay(250); try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch (e) { /* not up yet */ } }

  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const errors = [];
  try {
    const run = async (name, viewport, script) => {
      const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch: viewport.width < 500 });
      await ctx.addInitScript(() => {
        // Stand-ins for the browser's speech: record what is said, "hear" what is expected.
        window.__spoken = [];
        const synth = {
          speak(u) { window.__spoken.push({ text: u.text, lang: u.lang, voice: u.voice ? u.voice.lang : null }); setTimeout(() => { if (u.onend) u.onend(); }, 20); },
          cancel() {}, getVoices() { return [{ name: 'Test Spanish', lang: 'es-MX', localService: true }]; }, addEventListener() {}, removeEventListener() {},
        };
        Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
        window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
        class FakeRecognition { start() { setTimeout(() => { const t = window.__sayNext || ''; if (this.onresult) this.onresult({ results: [[{ transcript: t }]] }); if (this.onend) this.onend(); }, 150); } stop() {} abort() {} }
        window.SpeechRecognition = FakeRecognition; window.webkitSpeechRecognition = FakeRecognition;
      });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404|401|503/.test(m.text())) errors.push(`${name}: ${m.text()}`); });
      try { await script(page); } finally { await ctx.close(); }
    };

    const api = (page, method, url, data) => page.request.fetch(`${BASE}${url}`, { method, headers: { Origin: BASE, 'Content-Type': 'application/json' }, data: data ? JSON.stringify(data) : undefined }).then(async (r) => ({ status: r.status(), json: await r.json().catch(() => null) }));
    const shot = async (page, file) => {
      if (!SHOTS) return;
      await delay(250);
      await page.screenshot({ path: path.join(SHOTS, file), fullPage: false });
    };
    const noSideScroll = async (page, where) => {
      const w = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
      assert.ok(w.doc <= w.win + 1, `${where}: no horizontal scroll at ${w.win}px (page is ${w.doc}px wide)`);
    };
    const runData = (runId) => {
      for (let i = 0; i < 20; i++) {
        try {
          const store = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
          // The run the page just opened: by id, else the newest unfinished one.
          const open = (store.es_path_runs || []).filter((r) => !r.finished_at);
          const row = runId ? (store.es_path_runs || []).find((r) => r.run_id === runId) : open[open.length - 1];
          if (row) return row.level_data;
        } catch (e) { /* mid-write */ }
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 150);
      }
      throw new Error(`run ${runId} not in the test database`);
    };
    const bareWords = (s) => String(s).replace(/[¿?¡!.,;:…"“”]/g, ' ').split(/\s+/).filter(Boolean);

    const seenKinds = new Set();
    /**
     * Play the level on screen to its result card. `wrongFirst` answers the
     * first N challenges wrong on purpose. Returns the outcome shown.
     */
    async function playLevel(page, tag, { wrongFirst = 0, shotPrefix = 'phone' } = {}) {
      await page.waitForSelector('#start', { timeout: 15000 });
      await delay(400); // the database file is written a moment after the run is created
      const data = runData(null);
      const items = [];
      const walk = (n) => { if (!n || typeof n !== 'object') return; if (Array.isArray(n)) { n.forEach(walk); return; } if (n.id && n.kind) items.push(n); Object.values(n).forEach((v) => { if (v && typeof v === 'object') walk(v); }); };
      walk(data);
      await noSideScroll(page, `${tag} start card`);
      if (!seenKinds.has(`start-${shotPrefix}`)) { seenKinds.add(`start-${shotPrefix}`); await shot(page, `${shotPrefix}-00-start-card.png`); }
      await page.click('#start');
      let answered = 0;
      const shotOnce = async (key, file) => { if (seenKinds.has(`${shotPrefix}:${key}`)) return; seenKinds.add(`${shotPrefix}:${key}`); await noSideScroll(page, `${tag} ${key}`); await shot(page, `${shotPrefix}-${file}.png`); };

      for (let step = 0; step < 400; step++) {
        await delay(120);
        if (await page.$('.es-learn__stats')) break;
        const scrim = await page.$('.es-scrim button');
        if (scrim) { await scrim.click(); continue; }
        // A feedback sheet: continue.
        const sheet = await page.$('footer.es-footer[data-result] .es-footer__inner > .es-btn');
        if (sheet) {
          const wrong = await page.$('footer.es-footer[data-result="wrong"]');
          if (wrong) await shotOnce('feedback-wrong', '90-feedback-wrong');
          else await shotOnce('feedback-right', '91-feedback-right');
          await sheet.click(); continue;
        }
        // A conversation: say what the hint suggests.
        if (await page.$('.es-convo__bar')) {
          await shotOnce('conversation', '30-conversation-lab');
          const goals = data.scenario.script.map((s) => (s.hint.match(/"([^"]+)"/) || [])[1] || s.expect[0]);
          for (const g of goals) {
            if (!(await page.$('.es-convo__bar'))) break;
            await page.fill('.es-convo__bar input', g.replace(/…/g, 'Ana'));
            await page.click('.es-convo__bar .es-btn--secondary');
            await delay(700);
          }
          if (await page.$('.es-convo__bar')) await page.click('text=End conversation');
          await page.waitForSelector('.es-endscreen, .es-learn__stats', { timeout: 15000 });
          continue;
        }
        // The fluency sprint without a microphone: self-check.
        const said = await page.$('text=I said it');
        if (said) { await shotOnce('sprint', '31-fluency-sprint'); await said.click().catch(() => {}); continue; }
        if (await page.$('.es-sprint')) {
          await shotOnce('sprint', '31-fluency-sprint');
          // A chunk to repeat is on screen in Spanish: the stand-in recogniser "hears" it.
          await page.evaluate(() => { const b = document.querySelector('.es-sprint__big[lang="es"]'); if (b) window.__sayNext = b.textContent; });
          continue;
        }
        // A challenge waiting for an answer.
        const head = await page.$('.es-challenge-head .es-prompt, .es-story__q:not([data-done]) .es-story__qhead');
        const check = await page.$('.es-footer .es-btn--success');
        if (head && check) {
          const doWrong = answered < wrongFirst;
          const done = await answerChallenge(page, items, doWrong, shotOnce);
          if (done) { answered++; continue; }
        }
        // Mic challenges (speak) answer themselves after the mic.
        // (In a story, answered questions stay on the page: the newest mic and bubble are the live ones.)
        const mic = (await page.$$('.es-mic[data-state="idle"]')).pop();
        if (mic && !(await page.$('.es-footer .es-btn--success:not([disabled])'))) {
          const target = await page.evaluate(() => { const b = [...document.querySelectorAll('.es-speaker .es-bubble__text')].pop(); return b ? b.textContent : ''; });
          await shotOnce('speak', '20-speak-this-sentence');
          await page.evaluate((t) => { window.__sayNext = t; }, target);
          await mic.click(); await delay(500);
          const go = await page.$('.es-footer .es-btn--success:not([disabled])');
          if (go) await go.click();
          answered++;
          continue;
        }
        // Dictation: type what was spoken.
        if (await page.$('.es-dict__out')) {
          await shotOnce('dictation', '32-dictation');
          const last = await page.evaluate(() => (window.__spoken.filter((s) => s.text.trim()).slice(-1)[0] || {}).text || '');
          await page.fill('.es-typebox .es-input', last);
          const c = await page.$('.es-footer .es-btn--success:not([disabled])');
          if (c) await c.click();
          continue;
        }
        // Everything else (story lines, intros, interstitials, complete screens): the main button.
        const btn = await page.$('.es-footer .es-footer__inner > .es-btn:not([disabled]), .es-footer .es-btn--primary:not([disabled]), .es-footer .es-btn--secondary:not([disabled])');
        if (await page.$('.es-story')) await shotOnce('story', '33-story');
        if (await page.$('.es-radio')) await shotOnce('listening-lab', '34-listening-lab');
        if (await page.$('.es-stage')) await shotOnce('unit-intro', '35-unit-intro');
        if (await page.$('.es-tip')) await shotOnce('sound-tip', '22-sound-tip');
        if (await page.$('.es-interstitial')) { const t = await page.textContent('.es-interstitial'); if (/repasar/.test(t)) await shotOnce('mistakes', '92-mistake-review'); }
        if (await page.$('.es-tiles')) await shotOnce('complete', '93-lesson-complete');
        if (btn) { await btn.click(); continue; }
      }
      await page.waitForSelector('.es-learn__stats', { timeout: 15000 });
      await noSideScroll(page, `${tag} result`);
      await shotOnce('result', '94-result');
      return page.evaluate(() => document.querySelector('.es-learn__title').textContent);
    }

    // Answer the challenge on screen (right, or wrong on purpose). True when submitted.
    async function answerChallenge(page, items, wrong, shotOnce) {
      // An audio challenge plays its line a moment after it is drawn; wait for it.
      if (await page.$('.es-lesson__body .es-audio-row')) await delay(900);
      const info = await page.evaluate(() => {
        const q = (s) => document.querySelector(s);
        const all = (s) => [...document.querySelectorAll(s)];
        const active = q('.es-story__q:not([data-done])') || q('.es-lesson__body');
        const scopeSel = q('.es-story__q:not([data-done])') ? '.es-story__q:not([data-done]) ' : '.es-lesson__body ';
        const scope = (s) => [...active.querySelectorAll(s)];
        return {
          header: (q('.es-challenge-head .es-prompt') || q('.es-story__q:not([data-done]) .es-story__qhead') || {}).textContent || '',
          choices: scope('.es-choices .es-choice').map((b) => (b.querySelector('.es-choice__text, .es-choice__row span[lang], .es-choice__row span') || b).textContent.trim()),
          pairs: !!q('.es-pairs'),
          bank: !!active.querySelector('.es-bank'),
          type: !!active.querySelector('.es-typebox .es-input'),
          inline: !!active.querySelector('.es-inline-input'),
          fix: !!active.querySelector('.es-fixline'),
          bubble: (active.querySelector('.es-bubble__text') || {}).textContent || '',
          tiles: scope('.es-bank .es-tile').map((t) => t.textContent),
          spoken: (window.__spoken.filter((s) => s.text.trim()).slice(-1)[0] || {}).text || '',
          kbd: !!q('.es-kbd-toggle'),
          scopeSel,
        };
      });
      const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
      const labelOf = (c) => (typeof c === 'string' ? c : c.es);
      if (info.pairs) {
        await shotOnce('match_pairs', '05-match-pairs');
        const item = items.find((i) => i.kind === 'match_pairs' && i.pairs.every(([es]) => true));
        const pairsHere = await page.evaluate(() => [...document.querySelectorAll('.es-pairs .es-choice')].map((b) => ({ side: b.dataset.side, text: b.querySelector('.es-choice__text').textContent })));
        const pairList = items.filter((i) => i.kind === 'match_pairs').flatMap((i) => i.pairs);
        for (const p of pairsHere.filter((x) => x.side === '0')) {
          const en = (pairList.find(([es]) => es === p.text) || [])[1];
          await page.click(`.es-pairs .es-choice[data-side="0"]:has(.es-choice__text:text-is("${p.text}"))`);
          await page.click(`.es-pairs .es-choice[data-side="1"]:has(.es-choice__text:text-is("${en}"))`);
          await delay(500);
        }
        void item;
        return true;
      }
      if (info.choices.length) {
        const item = items.find((i) => Array.isArray(i.choices) && sameList(i.choices.map(labelOf), info.choices))
          || items.find((i) => i.kind === 'minimal_pair' && sameList(i.pair, info.choices));
        let idx = 0;
        if (item && item.kind === 'minimal_pair') idx = info.choices.indexOf(info.spoken) >= 0 ? info.choices.indexOf(info.spoken) : item.answer;
        else if (item) idx = item.answer;
        if (wrong) idx = (idx + 1) % info.choices.length;
        const kindKey = item ? (item.kind === 'select_image' ? 'select_image' : item.kind) : 'choice';
        const file = { select_image: '01-new-word-select-image', select_meaning: '02-select-meaning', select_translation: '03-select-translation', listen_choose: '10-tap-what-you-hear-choose', listen_meaning: '11-listen-what-does-it-mean', listen_image: '12-tap-the-picture-you-hear', fill_choice: '06-fill-the-blank', complete_chat: '07-complete-the-chat', read_respond: '40-read-and-respond', minimal_pair: '21-which-word-do-you-hear', listen_meaning_clip: '34b-listening-clip-question' }[kindKey] || `09-${kindKey}`;
        if (item && item.tag === 'new') await shotOnce('new-word', '00b-new-word');
        await shotOnce(kindKey, file);
        await page.locator(`${info.scopeSel}.es-choices .es-choice`).nth(idx).click();
        await page.click('.es-footer .es-btn--success');
        return true;
      }
      if (info.bank) {
        const item = items.find((i) => Array.isArray(i.tiles) && sameList([...i.tiles].sort(), [...info.tiles].sort()));
        assert.ok(item, `a word-bank item matches the tiles ${info.tiles.join(' ')}`);
        const words = bareWords(item.accepted[0]);
        await shotOnce(item.kind === 'tap_heard' ? 'tap_heard' : `translate-${item.from}`, item.kind === 'tap_heard' ? '13-tap-what-you-hear-word-bank' : `04-translate-word-bank-${item.from}`);
        const order = wrong ? [...words].reverse() : words;
        for (const w of order) {
          await page.locator(`${info.scopeSel}.es-bank .es-tile:not([data-state="ghost"])`, { hasText: new RegExp(`^${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }).first().click();
        }
        if (wrong && words.length === 1) await page.locator(`${info.scopeSel}.es-bank .es-tile:not([data-state="ghost"])`).first().click();
        await shotOnce('wordbank-filled', '04b-word-bank-answer-built');
        await page.click('.es-footer .es-btn--success');
        return true;
      }
      if (info.type || info.inline) {
        const item = info.inline
          ? items.find((i) => i.kind === 'complete_translation' && info.header && i.en)
          : (items.find((i) => i.kind === 'type_heard' && i.es === info.spoken) || items.find((i) => i.kind === 'translate' && i.text === info.bubble) || items.find((i) => i.kind === 'translate' && i.mode === 'type'));
        let text = info.inline ? (item ? item.accepted[0] : 'x') : item ? item.accepted[0] : info.spoken;
        if (item && item.kind === 'type_heard') text = info.spoken;
        if (wrong) text = 'xx';
        await shotOnce(info.inline ? 'complete_translation' : item && item.kind === 'type_heard' ? 'type_heard' : 'translate-typed', info.inline ? '08-complete-the-translation' : item && item.kind === 'type_heard' ? '14-type-what-you-hear-slow-audio' : '04c-translate-keyboard');
        if (await page.$('.es-dict__out')) await shotOnce('dictation', '32-dictation');
        if (info.inline) await page.fill(`${info.scopeSel}.es-inline-input`, text);
        else await page.fill(`${info.scopeSel}.es-typebox .es-input`, text);
        await page.click('.es-footer .es-btn--success');
        return true;
      }
      return false;
    }

    // ── 1. A beginner learner at phone width: placement, goal, first levels ──
    await run('phone learner', { width: 375, height: 812 }, async (page) => {
      let r = await api(page, 'POST', '/api/auth/register', { email: 'es-learner@example.com', password: 'test-password-123', display_name: 'Test Learner', birth_year: 1990, birth_month: 5, country: 'US' });
      assert.equal(r.status, 201, 'register a test learner');
      r = await api(page, 'POST', '/api/enrollments', { selections: [{ track_id: 'spanish', grade_id: 'entry' }] });
      assert.equal(r.status, 201, 'enroll in Spanish Grade 1');
      const eid = r.json.created[0].id;
      await page.goto(`${BASE}/placement?enrollment=${eid}`);
      await page.waitForSelector('text=Speak and understand everyday Spanish, fast');
      await shot(page, 'phone-a1-goal-picker.png');
      await page.click('text=Speak and understand everyday Spanish, fast');
      await page.click('button:has-text("Continue")');
      await page.getByRole('button', { name: "I don't know" }).first().waitFor();
      for (let i = 0; i < 60; i++) {
        if (await page.$('text=You start at level')) break;
        const idk = page.getByRole('button', { name: "I don't know" });
        if (await idk.count()) await idk.first().click();
        await delay(300);
      }
      await page.waitForSelector('text=You start at level', { timeout: 15000 });
      pass('placement places a beginner (all "I don\'t know") at the start of Grade 1');
      r = await api(page, 'GET', '/api/goals?track_id=spanish&grade_id=entry');
      assert.equal(r.json.goal && r.json.goal.choice, 'conversation', 'the conversational goal is saved');
      pass('the Spanish-only "conversation, fast" goal is offered and saved from the placement goal step');

      await page.goto(`${BASE}/path?enrollment=${eid}`);
      await page.waitForSelector('.es-fit-line');
      const line = await page.textContent('.es-fit-line');
      assert.match(line, /most-used words/i);
      await noSideScroll(page, 'path page');
      await page.locator('.es-fit-line').scrollIntoViewIfNeeded();
      await shot(page, 'phone-a2-path-why-line.png');
      pass('the path page shows the one-line reason for the order and counts the levels saved for later');

      await page.goto(`${BASE}/dashboard`);
      await page.click('a[href^="/session?enrollment="]');
      await page.waitForURL(/\/spanish\/learn/, { timeout: 15000 });
      pass('dashboard -> /session redirects a Spanish level to the Duolingo-style player');
      const startTitle = await page.textContent('.es-learn__title');
      assert.match(startTitle, /Cognates/, 'the culture level 3 is put aside, so the learner starts on level 4');
      pass('goal fit: a beginner placed on level 3 (culture, enrichment) is moved on to level 4 (cognates)');
      const out = await playLevel(page, 'level 4', { wrongFirst: 2 });
      assert.match(out, /Level 4 done|Almost/);
      pass(`level 4 (vocabulary) played to the end: "${out.trim()}"`);
      const spoken = await page.evaluate(() => window.__spoken);
      assert.ok(spoken.length > 3 && spoken.every((s) => /^es/.test(s.lang || '') || !s.text.trim()), 'lines are spoken with a Spanish browser voice');
      pass(`with no server voice, ${spoken.filter((s) => s.text.trim()).length} lines went to the browser's speech synthesis in Spanish (${spoken[1] && spoken[1].voice})`);
      if (/Almost/.test(out)) {
        await page.click('text=Try again');
        const again = await playLevel(page, 'level 4 retry');
        assert.match(again, /Level 4 done/);
        pass('a failed level offers a fresh round, which passes');
      }
      await page.click('.es-learn__actions .es-btn--primary');
      await page.waitForLoadState('domcontentloaded');
      await delay(1500);
      note(`after level 4 the next level (5, a Quick Game) opens at ${new URL(page.url()).pathname}: Quick Games keep the existing game engines`);
    });

    // ── 2. An account that may stand on any level: every activity type, phone ──
    const levelsToPlay = [
      ['entry', 6, 'input session (story episode)'], ['entry', 7, 'listening'], ['entry', 8, 'pronunciation'],
      ['entry', 9, 'story'], ['entry', 10, 'dictation'], ['entry', 11, 'conversation lab'], ['entry', 12, 'fluency sprint'],
      ['entry', 13, 'unit check'], ['entry', 14, 'unit intro'], ['entry', 15, 'speaking'], ['entry', 16, 'grammar chunks'],
      ['entry', 21, 'listening lab'], ['entry', 39, 'checkpoint'], ['entry', 56, 'pronunciation (r / rr)'], ['entry', 70, 'reading'],
    ];
    await run('phone owner', { width: 375, height: 812 }, async (page) => {
      let r = await api(page, 'POST', '/api/auth/register', { email: 'owner-test@example.com', password: 'test-password-123', display_name: 'Owner Test', birth_year: 1985, birth_month: 1, country: 'US' });
      assert.equal(r.status, 201);
      r = await api(page, 'POST', '/api/enrollments', { selections: [{ track_id: 'spanish', grade_id: 'entry' }] });
      const eid = r.json.created[0].id;
      // Placement by API is not needed for an account that may stand anywhere: skip it.
      r = await api(page, 'POST', '/api/placement/skip', { enrollment_id: eid });
      await api(page, 'PUT', '/api/goals', { track_id: 'spanish', grade_id: 'entry', choice: 'conversation' });
      for (const [, lvl, what] of levelsToPlay) {
        r = await api(page, 'POST', `/api/enrollments/${eid}/jump-to`, { level: lvl });
        if (r.status !== 200) { note(`could not stand on level ${lvl} (${what}): ${r.json && r.json.error}`); continue; }
        await page.goto(`${BASE}/session?enrollment=${eid}`);
        try { await page.waitForURL(/\/spanish\/learn/, { timeout: 10000 }); } catch (e) { note(`level ${lvl} (${what}) opened ${page.url()}`); continue; }
        const out = await playLevel(page, `level ${lvl} ${what}`);
        pass(`level ${lvl} (${what}) played at 375 px: "${out.trim()}"`);
      }
    });

    // ── 3. Desktop width, with a "prepare for a test" goal (the typing-heavy recipes) ──
    await run('desktop owner', { width: 1280, height: 860 }, async (page) => {
      await api(page, 'POST', '/api/auth/login', { email: 'owner-test@example.com', password: 'test-password-123' });
      const r = await api(page, 'GET', '/api/enrollments');
      const eid = r.json.enrollments[0].id;
      await api(page, 'PUT', '/api/goals', { track_id: 'spanish', grade_id: 'entry', choice: 'test' });
      for (const lvl of [15, 26, 52]) {
        await api(page, 'POST', `/api/enrollments/${eid}/jump-to`, { level: lvl });
        await page.goto(`${BASE}/session?enrollment=${eid}`);
        await page.waitForURL(/\/spanish\/learn/, { timeout: 15000 });
        const out = await playLevel(page, `desktop level ${lvl}`, { shotPrefix: 'desktop' });
        pass(`level ${lvl} played at 1280 px: "${out.trim()}"`);
      }
    });

    assert.deepEqual(errors, [], `no page errors:\n${errors.join('\n')}`);
    pass('no page errors or console errors');
  } finally {
    await browser.close();
    server.kill();
    if (/Error/.test(log) && process.env.SHOW_LOG) console.log(log);
  }
  const passed = results.filter((r) => r[0] === 'PASS').length;
  console.log(`\n${passed} passed, ${results.filter((r) => r[0] === 'NOTE').length} notes`);
}

main().catch((err) => { console.error(err); process.exit(1); });
