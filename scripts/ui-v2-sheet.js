/**
 * The owner's look at the approved design on the real app (docs/UI-V2.md): real screenshots with UI_V2=on, labelled, on contact sheets, to set beside design-refs/ui-v4-mockups/sheet.png and sheet-large.png.
 *
 *   node scripts/ui-v2-sheet.js [--out=<dir>] [--port=6831] [--mode=light|dark]
 *
 * Writes <out>/contact-sheet.png (phone 375 x 760: the whole flow, the app screens, a wrong answer, a pressed button) and <out>/contact-sheet-large.png (desktop 1280 x 800, tablet 820 x 1180, landscape 1180 x 820).
 * Own server, temporary database, synthetic learners only, every outside AI off, no keys. Needs Playwright (PLAYWRIGHT_PATH, default the shared copy). One browser.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/coding/savant-wt/pw/node_modules/playwright'); // eslint-disable-line import/no-dynamic-require

const ROOT = path.join(__dirname, '..');
const arg = (name, d) => { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.split('=').slice(1).join('=') : d; };
const OUT = arg('out', 'C:/coding/claudecommittdIq/folderThing/design-refs/ui-v4-shots');
const PORT = Number(arg('port', 6831));
const MODE = arg('mode', 'light');
const BASE = `http://localhost:${PORT}`;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const PHONE = { width: 375, height: 760 };
const DESK = { width: 1280, height: 800 };
const TAB = { width: 820, height: 1180 };
const LAND = { width: 1180, height: 820 };

function serverEnv(tmp) {
  const env = { ...process.env, PORT: String(PORT), NODE_ENV: 'development', DB_FILE: path.join(tmp, 'db.json'), HOLDOUT_DIR: tmp, SPANISH_MEDIA_DIR: path.join(tmp, 'media'), UI_V2: 'on', ONBOARDING_V2: 'on', BETA_GATE: 'invite', BETA_INVITES_FILE: path.join(tmp, 'invites.json'), XKIRO_LEARNER_UNTIL: '2000-01-01T00:00:00Z', FACT_CHECK_ALL: '0', MUNITO_LEARNER: 'off', CORAL_LEARNER: 'off', GLADIA_LEARNER: 'off', LYCEUM_LEARNER: 'off', GONKA_LEARNER: 'off', GROKIFIED_LEARNER: 'off', UPLOAD_AUTOBUILD: 'off', SPANISH_WRITE_AHEAD: 'off' };
  for (const k of Object.keys(env)) if (/_API_KEY$|_KEY$|_TOKEN$/.test(k)) env[k] = ''; // no key reaches this server, whatever the shell holds
  return env;
}

async function main() {
  const raw = path.join(OUT, 'raw');
  fs.mkdirSync(raw, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ui2-sheet-'));
  process.env.BETA_INVITES_FILE = path.join(tmp, 'invites.json');
  const invites = require('../services/beta-invites'); // eslint-disable-line global-require
  fs.mkdirSync(path.join(tmp, 'media'), { recursive: true });
  const log = fs.openSync(path.join(tmp, 'server.log'), 'a');
  const server = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: serverEnv(tmp), stdio: ['ignore', log, log] });
  for (let i = 0; i < 200; i++) { await delay(250); try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* up soon */ } } // eslint-disable-line no-await-in-loop
  const browser = await chromium.launch();
  const phone = [];
  const large = [];
  const problems = [];
  const device = { viewport: PHONE, deviceScaleFactor: 2, colorScheme: MODE };

  // A course can't be built with no outside AI, so these shots have their upload progress stubbed. The look is what is being checked; scripts/ui-v2-test.js checks the working out.
  const UPLOADS = { can_upload: true, materials: [
    { id: 1, title: 'Chapter 4: The cell', kind: 'pdf', status: 'ready', mastered: 3, total: 8, due: 0, started: true, complete: false },
    { id: 2, title: 'Spanish verbs handout', kind: 'text', status: 'ready', mastered: 0, total: 5, due: 0, started: false, complete: false },
    { id: 3, title: 'History lecture notes', kind: 'text', status: 'none', mastered: 0, total: 0, due: 0, started: false, complete: false },
    { id: 4, title: 'Photosynthesis notes', kind: 'text', status: 'ready', mastered: 6, total: 6, due: 1, started: true, complete: true },
  ] };
  const stubUploads = (page) => page.route('**/api/ui2/material-progress', (route) => route.fulfill({ json: UPLOADS }));
  const account = async (email, name, enrol) => {
    const ctx = await browser.newContext(device);
    const call = (m, u, d) => ctx.request.fetch(BASE + u, { method: m, headers: { Origin: BASE, 'Content-Type': 'application/json' }, data: d ? JSON.stringify(d) : undefined }).then(async (r) => ({ status: r.status(), json: await r.json().catch(() => null) }));
    const reg = await call('POST', '/api/auth/register', { email, password: 'test-password-123', display_name: name, birth_year: 1990, birth_month: 5, country: 'US', agreed: true, invite_code: invites.approve(email).code });
    if (reg.status >= 300) throw new Error(`register ${reg.status} ${JSON.stringify(reg.json)}`);
    let enrollment = null;
    if (enrol) {
      await call('POST', '/api/enrollments', { selections: enrol.map(([track_id, grade_id]) => ({ track_id, grade_id })) });
      const list = (await call('GET', '/api/enrollments')).json.enrollments;
      enrollment = list[0].id;
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
    }
    const storage = await ctx.storageState();
    await ctx.close();
    return { storage, enrollment };
  };
  const open = async (who, url) => {
    const ctx = await browser.newContext({ ...device, storageState: who ? who.storage : undefined });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push(`${url}: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404|401|403/.test(m.text())) problems.push(`${url}: ${m.text()}`); });
    await page.route('**/api/tutor/dock', async (route) => (route.request().method() === 'POST' ? route.fulfill({ json: { reply: 'x is what you are counting. 3 of them plus 2 of them is 5 of them.', source: 'ai', mode: 'full' } }) : route.continue()));
    if (url !== '/about-none') await page.goto(BASE + url);
    return { ctx, page };
  };
  const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const snap = async (page, name, label, note = '') => {
    await delay(320);
    const f = path.join(raw, `${name}.png`);
    await page.screenshot({ path: f });
    const over = await overflow(page);
    if (over > 1) problems.push(`${name}: ${over}px sideways`);
    phone.push({ f, label, note });
    console.log('shot', name);
  };
  const snapLarge = async (page, size, name, label, note = '') => {
    await page.setViewportSize(size);
    await delay(450);
    const f = path.join(raw, `large-${name}.png`);
    await page.screenshot({ path: f });
    const over = await overflow(page);
    if (over > 1) problems.push(`large ${name}: ${over}px sideways`);
    large.push({ f, label, note, size });
    await page.setViewportSize(PHONE);
    await delay(150);
    console.log('large', name);
  };
  const next = (page) => page.click('#next');
  const step = (page, s) => page.waitForFunction((x) => location.hash === `#${x}` && document.querySelector(`#ob[data-screen="${x}"]`), s, { timeout: 15000 });

  try {
    // ── the flow, as a new learner in the private beta ──
    const nia = await account('nia@example.com', 'Nia New', null);
    const { ctx: fctx, page: f } = await open(nia, '/start');
    await step(f, 'welcome');
    await snap(f, '01-welcome', 'Welcome');
    await next(f);
    await step(f, 'hello');
    await snap(f, '02-hello', 'Giraffe hello');
    await next(f);
    await step(f, 'test');
    await snap(f, '03-test-intro', 'Test: what it is', 'Age was given at registration, so this account skips it');
    await next(f);
    await step(f, 'testing');
    await f.waitForSelector('.task', { timeout: 15000 }).catch(() => {});
    await snap(f, '04-test-a', 'Test: first screen');
    console.log('mood on the test screen', await f.getAttribute('#tutor', 'data-mood'));
    // On through the test until a timed task is up: there the giraffe steps aside.
    for (let i = 0; i < 40; i++) {
      if (await f.$('#ob[data-focus]')) { await snap(f, '05-test-b', 'Test: a timed task', 'The giraffe steps aside'); break; } // eslint-disable-line no-await-in-loop
      const o = await f.$('.t-opt'); // eslint-disable-line no-await-in-loop
      if (o) await o.click().catch(() => {}); // eslint-disable-line no-await-in-loop
      await delay(200); // eslint-disable-line no-await-in-loop
    }
    await f.click('#alt');
    await step(f, 'into');
    await snap(f, '06-into', 'Interests');
    await f.check('input[name="interest"] >> nth=1', { force: true });
    await f.check('input[name="interest"] >> nth=4', { force: true });
    await delay(150);
    await next(f);
    await step(f, 'how');
    console.log('mood on how', await f.getAttribute('#tutor', 'data-mood'));
    await snap(f, '07-how-empty', 'How do you want to learn?');
    await f.check('input[name="how"][value="both"]', { force: true });
    await snap(f, '08-how', 'How: Both picked');
    await snapLarge(f, DESK, 'how-desk', 'Desktop: How');
    await snapLarge(f, TAB, 'how-tab', 'Tablet: How');
    await next(f);
    await step(f, 'learn');
    await f.check('input[name="track"][value="math"]', { force: true });
    await f.check('input[name="track"][value="chess"]', { force: true });
    await snap(f, '09-subject', 'Subject', 'Several picked: numbered, the first is where they start');
    await snapLarge(f, DESK, 'subject-desk', 'Desktop: Subject');
    await snapLarge(f, TAB, 'subject-tab', 'Tablet: Subject');
    await next(f);
    await step(f, 'grade');
    await f.check('input[name="way"][value="walk"]', { force: true });
    await snap(f, '10-grade', 'Grade or placement');
    // With no outside AI there are no placement questions to show, so this one shot has its question stubbed. Only the look is being checked.
    await f.route('**/api/subject-placement/*/start', (route) => route.fulfill({ json: { ready: true, grade_id: 'x', asked_so_far: 2, questions: [{ index: 0, prompt: 'Add these: 3x + 2x', choices: ['5x', '6x', '5x\u00b2', '3x + 2'] }] } }));
    await next(f);
    await step(f, 'level');
    await f.waitForSelector('#walk .opt, #walk .input, #to-pick', { timeout: 15000 }).catch(() => {});
    await f.check('#walk input >> nth=0', { force: true }).catch(() => {});
    await snap(f, '11-placement', 'Placement question', 'Question stubbed: no AI here');
    await f.click('#back');
    await step(f, 'grade');
    await f.check('input[name="way"][value="know"]', { force: true });
    await next(f);
    await step(f, 'pick');
    await f.check('input[name="grade"] >> nth=3', { force: true });
    await snap(f, '12-pick', 'Pick a grade');
    await next(f);
    await f.waitForSelector('#ob[data-screen="building"]', { timeout: 15000 });
    await snap(f, '13-building', 'Building');
    await step(f, 'ready');
    await delay(700);
    await snap(f, '14-ready', 'First lesson ready', 'Both: the button goes to upload');
    await next(f);
    await f.waitForURL(/my-material/, { timeout: 15000 });
    await f.waitForSelector('#u2-after-upload', { timeout: 15000 });
    await snap(f, '15-upload', 'Upload, then home');
    await fctx.close();

    // ── the app ──
    const ada = await account('ada@example.com', 'Ada Tester', [['math', 'algebra_1_part_a'], ['chess', 'chess_rules_learner']]);
    const { ctx: hctx, page: h } = await open(ada, '/about-none');
    await stubUploads(h);
    await h.goto(`${BASE}/dashboard`);
    await h.waitForSelector('#u2-start', { timeout: 25000 });
    await snap(h, '20-home', 'Home', 'Several subjects, uploads stubbed');
    await h.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await snap(h, '20b-home-scrolled', 'Home, scrolled');
    await h.evaluate(() => window.scrollTo(0, 0));
    await snapLarge(h, DESK, 'home-desk', 'Desktop: Home');
    await snapLarge(h, TAB, 'home-tab', 'Tablet: Home');
    await snapLarge(h, LAND, 'home-land', 'Landscape: Home');
    // Pressed: a real press, held down while the shot is taken.
    const start = await (await h.$('#u2-start')).boundingBox();
    await h.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
    await h.mouse.down();
    await snap(h, '21-pressed', 'Pressed: Start lesson', 'Mouse held down: moved 6 px, edge gone');
    await h.mouse.move(2, 2);
    await h.mouse.up();
    await h.click('#u2-menu');
    await h.waitForFunction(() => document.documentElement.dataset.u2View === 'everything');
    await snap(h, '22-menu', 'Everything menu');
    await snapLarge(h, DESK, 'menu-desk', 'Desktop: menu as a rail');
    await snapLarge(h, TAB, 'menu-tab', 'Tablet: menu as a page');
    await h.click('#u2-row-past');
    await h.waitForFunction(() => document.documentElement.dataset.u2View === 'past');
    await h.waitForSelector('#u2-past .u2-opt, .u2-past-none');
    await snap(h, '22b-past', 'Past', 'Upload stubbed; the rest real');
    await snapLarge(h, DESK, 'past-desk', 'Desktop: Past');
    await hctx.close();

    // The chat, from the bottom and from the top, with the top-or-bottom choice.
    const { ctx: cctx, page: c } = await open(ada, '/about-none');
    await stubUploads(c);
    await c.goto(`${BASE}/dashboard`);
    await c.waitForSelector('#u2-giraffe', { timeout: 25000 });
    await c.waitForSelector('.tdock-g-btn', { state: 'attached', timeout: 15000 });
    await c.click('#u2-giraffe');
    await c.waitForFunction(() => document.documentElement.dataset.tdock);
    await c.click('.tdock-panel .s-bottom');
    await delay(300);
    await c.fill('.tdock-form input', 'Why does the x stay?');
    await c.click('.tdock-form .go');
    await c.waitForSelector('.tdock-log .bot', { timeout: 10000 }).catch(() => problems.push('chat: no reply'));
    await snap(c, '26-chat-bottom', 'Chat from the bottom', 'Page scrolls above it; choice top right. Reply stubbed');
    await c.evaluate(() => window.scrollTo(0, 300));
    await snap(c, '26b-chat-bottom-scrolled', 'Chat: the page scrolled above it');
    await c.evaluate(() => window.scrollTo(0, 0));
    await c.click('.tdock-panel .s-top');
    await delay(400);
    await snap(c, '27-chat-top', 'Chat from the top', 'The page below it');
    await snapLarge(c, DESK, 'chat-home-desk', 'Desktop: chat beside Home');
    await c.click('.tdock-panel .s-bottom').catch(() => {});
    await c.click('.tdock-close');
    await c.waitForFunction(() => !document.documentElement.dataset.tdock);
    // The voice call. A real call needs a microphone and a voice provider, so these four set the states directly on the giraffe, the attributes js/tutor-giraffe.js writes in a live call.
    const voice = (state, word, mouth) => c.evaluate(([st, w, m]) => {
      const g = document.querySelector('.tdock-g');
      if (st) g.dataset.voice = st; else delete g.dataset.voice;
      g.dataset.mouth = m || '';
      g.querySelector('.tdock-g-status').textContent = w || '';
      document.documentElement.classList.toggle('tdock-in-call', !!st);
    }, [state, word, mouth]);
    await voice('listening', 'Listening');
    await snap(c, '28-call-listening', 'Call: listening', 'State set directly, not a live call');
    await voice('thinking', 'Thinking');
    await snap(c, '29-call-thinking', 'Call: thinking', 'State set directly, not a live call');
    await voice('talking', 'Talking', 'talk');
    await delay(130);
    await snap(c, '30-call-talking', 'Call: talking', 'State set directly; mouth animating');
    await voice('', 'The call ended.');
    await snap(c, '31-call-ended', 'Call: ended', 'State set directly, not a live call');
    await cctx.close();

    // The empty home, uploads only, and a child waiting for consent.
    const out = async (email, name) => {
      const who = await account(email, name, null);
      const c = await browser.newContext({ ...device, storageState: who.storage });
      await c.request.fetch(`${BASE}/api/ob2/lesson-opened`, { method: 'POST', headers: { Origin: BASE, 'Content-Type': 'application/json' }, data: '{}' });
      return c;
    };
    const emptyCtx = await out('empty@example.com', 'Emi Empty');
    const e1 = await emptyCtx.newPage();
    await e1.goto(`${BASE}/dashboard`);
    await e1.waitForSelector('#u2-start', { timeout: 20000 });
    await snap(e1, '22c-empty', 'Home: nothing yet');
    await emptyCtx.close();
    const onlyCtx = await out('only@example.com', 'Oli Upload');
    await onlyCtx.request.fetch(`${BASE}/api/materials/paste`, { method: 'POST', headers: { Origin: BASE, 'Content-Type': 'application/json' }, data: JSON.stringify({ title: 'Chapter 4: The cell', text: 'The cell is the basic unit of life. '.repeat(40) }) });
    const o1 = await onlyCtx.newPage();
    await o1.goto(`${BASE}/dashboard`);
    await o1.waitForSelector('#u2-start', { timeout: 20000 });
    await snap(o1, '22d-only-uploads', 'Home: uploads only', 'Real paste, no path yet');
    await onlyCtx.close();
    const kidCtx = await browser.newContext(device);
    const kcall = (u, d) => kidCtx.request.fetch(BASE + u, { method: 'POST', headers: { Origin: BASE, 'Content-Type': 'application/json' }, data: JSON.stringify(d) });
    await kcall('/api/consent/age', { birth_month: 5, birth_year: new Date().getFullYear() - 10, country: 'US' });
    const kreg = await kcall('/api/auth/register', { username: 'samsheet', password: 'test-password-123', display_name: 'Sam', parent_email: 'parent@example.com', invite_code: invites.approve('parent@example.com').code });
    if (kreg.status() >= 300) problems.push(`child register ${kreg.status()}`);
    await kcall('/api/ob2/lesson-opened', {});
    await kcall('/api/enrollments', { selections: [{ track_id: 'math', grade_id: 'algebra_1_part_a' }] });
    const k1 = await kidCtx.newPage();
    await k1.goto(`${BASE}/dashboard`);
    await k1.waitForSelector('#u2-home', { timeout: 20000 }).catch(() => problems.push('child: no home'));
    await snap(k1, '22e-child', 'Home: a child, no consent', 'No upload, no Your material');
    await kidCtx.close();

    // ── a question: right and wrong, on tap-an-answer English ──
    const seen = { q: false, right: false, wrong: false };
    const known = {}; // the right answer to a question already seen, to get a real "right" when it comes round again
    for (let who = 0; who < 3 && !(seen.right && seen.wrong); who++) {
      const eve = await account(`eve${who}@example.com`, 'Eve Tester', [['english', 'grammar']]); // eslint-disable-line no-await-in-loop
      const { ctx: qctx, page: q } = await open(eve, `/session?enrollment=${eve.enrollment}&ordinary=1`); // eslint-disable-line no-await-in-loop
      await q.waitForSelector('.player-head', { timeout: 25000 }); // eslint-disable-line no-await-in-loop
      for (let i = 0; i < 40 && !(seen.right && seen.wrong); i++) {
        await delay(300); // eslint-disable-line no-await-in-loop
        const nextBtn = await q.$('.verdict [data-act="next"]'); // eslint-disable-line no-await-in-loop
        if (nextBtn) {
          const right = await q.$('.verdict.verdict-correct'); // eslint-disable-line no-await-in-loop
          const wrong = await q.$('.verdict.verdict-wrong'); // eslint-disable-line no-await-in-loop
          const cor = await q.$('.choice.correct'); // eslint-disable-line no-await-in-loop
          const pr = await q.$('.prompt'); // eslint-disable-line no-await-in-loop
          if (cor && pr) known[await pr.innerText()] = await cor.getAttribute('data-choice'); // eslint-disable-line no-await-in-loop
          if (right && !seen.right) {
            seen.right = true;
            await snap(q, '24-right', 'Right', 'Tinted bubble, giraffe cheers'); // eslint-disable-line no-await-in-loop
            await snapLarge(q, TAB, 'right-tab', 'Tablet: right'); // eslint-disable-line no-await-in-loop
          }
          if (wrong && !seen.wrong) {
            seen.wrong = true;
            await snap(q, '25-wrong', 'Wrong', 'Tinted bubble, shows the fix'); // eslint-disable-line no-await-in-loop
            await snapLarge(q, DESK, 'wrong-desk', 'Desktop: wrong'); // eslint-disable-line no-await-in-loop
            // The chat beside the page: a tap on the giraffe.
            await q.setViewportSize(DESK); // eslint-disable-line no-await-in-loop
            await delay(300); // eslint-disable-line no-await-in-loop
            const gb = await (await q.$('#u2-qguide .u2-g')).boundingBox(); // eslint-disable-line no-await-in-loop
            await q.mouse.click(gb.x + gb.width / 2, gb.y + gb.height / 2); // eslint-disable-line no-await-in-loop
            await delay(600); // eslint-disable-line no-await-in-loop
            await snapLarge(q, DESK, 'chat-desk', 'Desktop: chat beside the page', 'Tap the giraffe'); // eslint-disable-line no-await-in-loop
            await q.click('.tdock-close').catch(() => {}); // eslint-disable-line no-await-in-loop
          }
          await nextBtn.click().catch(() => {}); // eslint-disable-line no-await-in-loop
          continue;
        }
        const choices = await q.$$('.choice:not([disabled])'); // eslint-disable-line no-await-in-loop
        const typed = await q.$('.answer-row input:not([disabled])'); // eslint-disable-line no-await-in-loop
        if (choices.length) {
          if (!seen.q) {
            seen.q = true;
            await snap(q, '23-question', 'A question', 'Question in the bubble'); // eslint-disable-line no-await-in-loop
          }
          const pr = await q.$('.prompt'); // eslint-disable-line no-await-in-loop
          const want = pr ? known[await pr.innerText()] : null; // eslint-disable-line no-await-in-loop
          const hit = want ? await q.$(`.choice[data-choice="${want.replace(/"/g, '\\"')}"]`) : null; // eslint-disable-line no-await-in-loop
          // Alternate, so both verdicts turn up.
          await (hit || choices[(i + who) % choices.length]).click(); // eslint-disable-line no-await-in-loop
        } else if (typed) await typed.fill('7'); // eslint-disable-line no-await-in-loop
        else {
          const b = await q.$('.player button.btn-primary'); // eslint-disable-line no-await-in-loop
          if (b) await b.click().catch(() => {}); // eslint-disable-line no-await-in-loop
          else break;
          continue;
        }
        const submit = await q.$('.check-bar button:not([disabled]), .answer-row button'); // eslint-disable-line no-await-in-loop
        if (submit) await submit.click().catch(() => {}); // eslint-disable-line no-await-in-loop
        await q.waitForSelector('.verdict', { timeout: 6000 }).catch(() => {}); // eslint-disable-line no-await-in-loop
      }
      await qctx.close(); // eslint-disable-line no-await-in-loop
    }
    if (!seen.right || !seen.wrong) problems.push(`question shots: right ${seen.right}, wrong ${seen.wrong}`);

    // ── the sheets ──
    phone.sort((a, b) => path.basename(a.f).localeCompare(path.basename(b.f)));
    const b64 = (p) => `data:image/png;base64,${fs.readFileSync(p).toString('base64')}`;
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const page = await browser.newPage({ viewport: { width: 2060, height: 1200 } });
    const sheet = async (title, cells, cols, cellWidth, file) => {
      await page.setContent(`<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:28px 34px;background:#f4f5f7;font:15px system-ui;color:#15171b;width:max-content}h1{margin:0 0 18px;font-size:24px}.g{display:grid;grid-template-columns:repeat(${cols},${cellWidth}px);gap:24px 26px}.l{height:26px;font-weight:700;white-space:nowrap;overflow:hidden}.l span{font-weight:400;color:#666b75;font-size:13px;margin-left:6px}img{display:block;width:100%;border-radius:22px;box-shadow:0 0 0 1px #e3e5e9;background:#fff}</style><h1>${esc(title)}</h1><div class="g">${cells.map((c, i) => `<div><div class="l">${i + 1}. ${esc(c.label)}<span>${esc(c.note || '')}</span></div><img src="${b64(c.f)}"></div>`).join('')}</div>`);
      await delay(300);
      await page.screenshot({ path: path.join(OUT, file), fullPage: true });
      console.log('sheet', file);
    };
    await sheet(`Savant, the real app with UI_V2=on. Phone 375 x 760, ${MODE}. Synthetic learners, no outside AI.`, phone, 7, 300, 'contact-sheet.png');
    await sheet(`Savant, the real app with UI_V2=on. Desktop 1280 x 800, tablet 820 x 1180, landscape 1180 x 820, ${MODE}.`, large, 4, 560, 'contact-sheet-large.png');
  } finally {
    await browser.close();
    server.kill();
    await delay(300);
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* still closing */ }
  }
  if (problems.length) { console.log(`\nProblems (${problems.length}):\n${[...new Set(problems)].slice(0, 15).join('\n')}`); }
  console.log('\ndone');
}

main().catch((err) => { console.error(err); process.exit(1); });
