/**
 * Proof run, step 3: the whole own-material flow through the real UI, in a real browser (Playwright), on a COPY of the
 * db on its own port. Upload, build, place, study and review, at 375 px (phone) and at desktop width.
 *
 *   PROOF_DB=<copy of db.json> NODE_PATH=<dir with playwright> node scripts/material-proof-ui.js \
 *     --desktop-file <pdf|docx|txt> --phone-paste <txt> --shots <dir> [--port 6790]
 *
 * The server is this checkout's server.js with the app's own providers (start the script with the env from the proof
 * notes: outside-AI keys that cost money blanked). Each viewport signs up a fresh adult account through the API, then
 * drives the pages like a learner. The answers come from the course key in the copy db (the test reads the file; the
 * page never sees a key). Review needs time to pass: the server is stopped, the account's review dates in the copy are
 * moved to now, the server is started again and the learner signs back in. Screenshots go to --shots.
 * Never point PROOF_DB at the live data/db.json.
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const ROOT = path.join(__dirname, '..');
const PORT = Number(arg('port', 6790));
const BASE = `http://localhost:${PORT}`;
const DB = path.resolve(process.env.PROOF_DB || '');
const SHOTS = path.resolve(arg('shots', 'proof-shots'));
const delay = (ms) => new Promise((r) => { setTimeout(r, ms); });
if (!process.env.PROOF_DB || DB === path.resolve(ROOT, 'data', 'db.json') || /iq-max-repo-2-claude-adoring-mayer-woc9sq/.test(DB)) {
  console.error('Set PROOF_DB to a copy of the db, never the live one.');
  process.exit(2);
}
fs.mkdirSync(SHOTS, { recursive: true });

let server = null;
let log = '';
async function startServer() {
  server = spawn(process.execPath, ['-r', 'dotenv/config', 'server.js'], {
    cwd: ROOT, env: { ...process.env, PORT: String(PORT), DB_FILE: DB, NODE_ENV: 'development' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (d) => { log += d; });
  server.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 120; i++) { await delay(500); try { if ((await fetch(`${BASE}/api/health`)).ok) return; } catch { /* not up */ } }
  throw new Error(`server did not start:\n${log.slice(-2000)}`);
}
async function stopServer() {
  if (!server) return;
  const done = new Promise((r) => server.once('exit', r));
  server.kill();
  await done;
  server = null;
}
const readDb = () => JSON.parse(fs.readFileSync(DB, 'utf8'));
// The answer key, read from the copy db ONCE after the build (reading the file while the server renames it can fail
// on Windows with EPERM and take the server down): the key does not change after the build.
const keyCache = new Map();
function loadKeys(userId) {
  for (const c of readDb().material_courses || []) if (c.user_id === userId) for (const s of c.skills) for (const q of s.questions) keyCache.set(q.id, { q, s, c });
}
const keyOf = (userId, qid) => keyCache.get(qid) || null;

const results = [];
const step = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` (${detail})` : ''}`); };

async function run(browser, label, viewport, input) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: viewport.width < 500 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const shot = async (name) => page.screenshot({ path: path.join(SHOTS, `${label}-${name}.png`), fullPage: false });
  const password = 'proof-pass-12345';
  // --existing-email: sign in to an account an earlier run created (its upload and build already went through the UI)
  // and carry on from placement; used when the free tier's build outlasted the earlier run's clock.
  const email = input.existing || `ui-proof-${label}-${Date.now()}@test.invalid`;
  if (input.existing) {
    const login = await page.request.post(`${BASE}/api/auth/login`, { data: { email, password } });
    step(`${label}: sign in to the account the earlier run built its course in`, login.ok(), login.status());
  } else {
    const reg = await page.request.post(`${BASE}/api/auth/register`, { data: { email, password, display_name: `Proof ${label}`, birth_year: 1995, birth_month: 6, country: 'US' } });
    step(`${label}: sign up an adult account`, reg.ok(), reg.status());
  }
  const me = await (await page.request.get(`${BASE}/api/auth/me`)).json().catch(() => ({}));
  const userId = (me.user && me.user.id) || me.id;

  let mid;
  let course = null;
  if (input.existing) {
    const list = (await (await page.request.get(`${BASE}/api/materials`)).json()).materials;
    mid = list[0].id;
    course = (await (await page.request.get(`${BASE}/api/materials/${mid}/course`)).json()).course;
    await page.goto(`${BASE}/my-material`);
    await page.waitForSelector(`#course-note-${mid}`);
    await delay(1500);
    await shot('2-built');
    step(`${label}: course from the earlier UI build is there`, course && course.skills.length > 0, course ? `${course.status}, ${course.skills.length} skills` : 'none');
  } else {
  // Upload
  await page.goto(`${BASE}/my-material`);
  await page.waitForSelector('#upload, #paste');
  if (input.file) {
    await page.setInputFiles('#file', input.file);
    await page.click('#upload');
  } else {
    await page.fill('#paste-title', input.title);
    await page.fill('#paste-text', fs.readFileSync(input.paste, 'utf8'));
    await page.click('#paste');
  }
  await page.waitForSelector('[data-course]', { timeout: 120000 });
  await shot('1-uploaded');
  step(`${label}: upload`, await page.locator('[data-course]').count() === 1);

  // Build
  mid = await page.locator('[data-course]').first().getAttribute('data-course');
  await page.click(`#course-${mid}`);
  const t0 = Date.now();
  while (Date.now() - t0 < 60 * 60 * 1000) {
    await delay(10000);
    course = (await (await page.request.get(`${BASE}/api/materials/${mid}/course`)).json()).course;
    if (course && course.status !== 'building') break;
  }
  await page.reload();
  await page.waitForSelector(`#course-note-${mid}`);
  await delay(1500);
  await shot('2-built');
  step(`${label}: build`, course && ['ready', 'partial'].includes(course.status), course ? `${course.status}, ${course.skills.length} skills in ${course.units.length} units, ${Math.round((Date.now() - t0) / 1000)} s` : 'no course');
  if (!course || !['ready', 'partial'].includes(course.status)) { await ctx.close(); return; }
  }

  await delay(3000); // let the server finish writing before the one read of the key
  loadKeys(userId);
  // Place: answer the first half of the levels right, "I don't know" for the rest.
  await page.goto(`${BASE}/my-material-study?id=${mid}`);
  await page.waitForSelector('#next-card');
  await shot('3-path-before');
  await page.click('#go');
  const half = Math.ceil(course.skills.length / 2);
  let asked = 0;
  while (asked < 80) {
    await page.waitForSelector('#next, #done');
    if (await page.locator('#done').count()) break;
    const qid = await page.locator('[data-q]').first().getAttribute('data-q');
    const k = keyOf(userId, qid);
    const level = k ? k.s.level : 99;
    if (asked === 1) await shot('4-placement-question');
    if (k && level <= half) {
      if (k.q.type === 'multiple_choice') await page.locator(`[data-q="${qid}"] input[type=radio]`).nth(k.q.answer_index).check();
      else await page.fill(`[data-q="${qid}"] input[type=text]`, k.q.answer);
      await page.click('#next');
    } else await page.click('#idk');
    asked++;
    await page.waitForFunction((id) => !document.querySelector(`[data-q="${id}"]`), qid);
  }
  await shot('5-placement-result');
  const knownN = await page.locator('h2', { hasText: 'You already know' }).count();
  step(`${label}: placement`, asked > 0 && (await page.locator('#done').count()) === 1, `${asked} questions; known section shown: ${knownN === 1}`);
  await page.click('#done');
  await page.waitForSelector('#next-card');
  await shot('6-path-after-placement');

  // Study: the next step is a lesson; answer one practice question wrong, then take the check with right answers.
  const nextText = await page.locator('#next-card h2').innerText();
  await page.click('#go');
  await page.waitForSelector('#mastery');
  await shot('7-lesson');
  const pq = page.locator('[data-q]').first();
  if (await pq.count()) {
    const qid = await pq.getAttribute('data-q');
    const k = keyOf(userId, qid);
    if (k && k.q.type === 'multiple_choice') await pq.locator('input[type=radio]').nth((k.q.answer_index + 1) % k.q.choices.length).check();
    else await pq.locator('input[type=text]').fill('no idea');
    await pq.locator('button', { hasText: 'Check' }).click();
    await page.waitForFunction((id) => document.querySelector(`[data-q="${id}"] [data-fb]`).textContent.length > 0, qid);
    await pq.scrollIntoViewIfNeeded();
    await shot('8-practice-feedback');
    step(`${label}: practice feedback names the answer and the source`, /From your material|Where your file names it/.test(await pq.locator('[data-fb]').innerText()));
  }
  await page.click('#mastery');
  await page.waitForSelector('#submit');
  for (const card of await page.locator('[data-q]').all()) {
    const qid = await card.getAttribute('data-q');
    const k = keyOf(userId, qid);
    if (!k) continue;
    if (k.q.type === 'multiple_choice') await card.locator('input[type=radio]').nth(k.q.answer_index).check();
    else await card.locator('input[type=text]').fill(k.q.answer);
  }
  await shot('9-check');
  await page.click('#submit');
  await page.waitForSelector('#done');
  await shot('10-check-result');
  const resText = await page.locator('main').innerText();
  step(`${label}: study (lesson, practice, check)`, /mastered, next review in \d+ days?/.test(resText), `${nextText} -> ${resText.split('\n').slice(0, 2).join(' | ')}`);

  // Review: move this learner's review dates to now in the copy db (stop, edit, start), sign back in, review.
  await stopServer();
  const d = readDb();
  let moved = 0;
  for (const r of d.material_progress || []) {
    if (r.user_id !== userId) continue;
    for (const st of Object.values(r.skills)) if (st.status === 'mastered' && st.due) { st.due = new Date(Date.now() - 60000).toISOString(); moved++; }
  }
  fs.writeFileSync(DB, JSON.stringify(d));
  await startServer();
  const login = await page.request.post(`${BASE}/api/auth/login`, { data: { email, password } });
  step(`${label}: sign back in after the clock moves`, login.ok(), `${moved} reviews brought forward`);
  await page.goto(`${BASE}/my-material-study?id=${mid}`);
  await page.waitForSelector('#next-card');
  await shot('11-review-due');
  const dueText = await page.locator('#next-card h2').innerText();
  await page.click('#go');
  await page.waitForSelector('#submit');
  const cards = await page.locator('[data-q]').all();
  let i = 0;
  for (const card of cards) {
    const qid = await card.getAttribute('data-q');
    const k = keyOf(userId, qid);
    if (!k) continue;
    const right = i++ % 4 !== 3; // one in four wrong, to show remediation inside a review
    if (k.q.type === 'multiple_choice') await card.locator('input[type=radio]').nth(right ? k.q.answer_index : (k.q.answer_index + 1) % k.q.choices.length).check();
    else await card.locator('input[type=text]').fill(right ? k.q.answer : 'no idea');
  }
  await shot('12-review');
  await page.click('#submit');
  await page.waitForSelector('#done');
  await shot('13-review-result');
  const revText = await page.locator('main').innerText();
  step(`${label}: review`, /review/i.test(dueText) && /back in \d+ days?|back tomorrow|go over again/.test(revText), `${dueText} -> ${cards.length} questions`);
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  step(`${label}: no sideways scroll`, width <= viewport.width + 1, `${width} px at ${viewport.width}`);
  step(`${label}: no page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

(async () => {
  // eslint-disable-next-line global-require, import/no-unresolved
  const { chromium } = require('playwright');
  await startServer();
  const browser = await chromium.launch();
  try {
    if (arg('phone-paste')) await run(browser, 'phone', { width: 375, height: 812 }, { paste: arg('phone-paste'), title: arg('phone-title', 'My notes') });
    if (arg('desktop-file') || arg('desktop-existing')) await run(browser, 'desktop', { width: 1280, height: 900 }, { file: arg('desktop-file'), existing: arg('desktop-existing') });
  } catch (err) {
    step('run', false, err.message);
    console.log(log.slice(-1500));
  } finally {
    await browser.close();
    await stopServer();
  }
  fs.writeFileSync(path.join(SHOTS, 'ui-results.json'), JSON.stringify(results, null, 1));
  fs.writeFileSync(path.join(SHOTS, 'server.log'), log);
  const failed = results.filter((r) => !r.ok).length;
  console.log(failed ? `\n${failed} step(s) failed` : '\nall UI steps passed');
  process.exit(failed ? 1 : 0);
})();
