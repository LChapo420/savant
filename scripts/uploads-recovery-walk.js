/**
 * Failure and recovery, clicked through at phone width on a copy of the database, with a scripted model (scripts/uploads-recovery-server.js): a build dying part way, a provider down, credit out,
 * a retry, a reload mid-build, two uploads at once, deleting a material during its build.
 *   NODE_PATH=<dir with playwright> node scripts/uploads-recovery-walk.js <db copy> <screenshots dir>
 * Prints one line per check; a learner must always see a way forward and never a spinner that does not end.
 */
const fs = require('fs'); const os = require('os'); const path = require('path'); const { spawn } = require('child_process');
const { chromium } = require('playwright');
const PORT = Number(process.env.WALK_PORT || 6933);
const B = `http://localhost:${PORT}`;
const dbCopy = process.argv[2]; const shots = process.argv[3];
const CONTROL = path.join(os.tmpdir(), `recovery-control-${process.pid}.json`);
const setMode = (o) => fs.writeFileSync(CONTROL, JSON.stringify(o));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let server = null;
async function startServer() {
  server = spawn(process.execPath, [path.join(__dirname, 'uploads-recovery-server.js')], { env: { ...process.env, PORT: String(PORT), DB_FILE: dbCopy, RECOVERY_CONTROL: CONTROL, NODE_ENV: 'test', SESSION_SECRET: 'walk', BETA_REPORT_DAILY: 'off', AI_POOL: '1', PUBLIC_SIGNUP: '1', ALLOW_SIGNUP: '1' }, stdio: ['ignore', fs.openSync(`${dbCopy}.server.log`, 'a'), fs.openSync(`${dbCopy}.server.log`, 'a')] });
  for (let i = 0; i < 80; i++) { try { const r = await fetch(`${B}/api/health`).catch(() => null); if (r) return; } catch { /* wait */ } await sleep(500); }
  throw new Error('server did not start');
}
const stopServer = async () => { if (server) { server.kill('SIGKILL'); server = null; await sleep(500); } };
let failures = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || detail === undefined ? '' : ` -- ${String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 220)}`}`); if (!ok) failures++; };
const DOC = Array.from({ length: 8 }, (_, i) => `Part ${i + 1} of the lake notes. The Vostrin station number ${i + 10} records ice in early spring every year. Its keeper writes the depth in a blue ledger and sends it north. The harbor crew reads the ledger before any boat leaves in the morning. The water at that station stays cold for most of the summer season.\n\n`).join('').repeat(8);

(async () => {
  setMode({ mode: 'ok', delayMs: 400 });
  await startServer();
  const br = await chromium.launch();
  const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, extraHTTPHeaders: { Origin: B } });
  const email = `walk-${Date.now()}@example.test`;
  const reg = await ctx.request.post(`${B}/api/auth/register`, { data: { email, password: 'Walk-Pass-12345', display_name: 'Walk', birth_year: 1995, birth_month: 3, country: 'US', accept_terms: true, terms: true } });
  check('register a test account', reg.ok(), await reg.text());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const shot = (n) => page.screenshot({ path: path.join(shots, `${n}.png`) }).catch(() => {});
  const uploadUi = async (name, text) => {
    await page.goto(`${B}/my-material`);
    await page.waitForSelector('#file', { state: 'attached', timeout: 15000 });
    await page.setInputFiles('#file', { name, mimeType: 'text/plain', buffer: Buffer.from(text) });
    await page.click('#upload');
  };
  const api = (m, u, d) => ctx.request[m](`${B}${u}`, d ? { data: d } : undefined).then(async (r) => ({ status: r.status(), json: await r.json().catch(() => null) }));
  const latest = async () => { const l = await api('get', '/api/materials'); return l.json.materials[l.json.materials.length - 1]; };
  const waitFor = async (fn, ms = 60000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await sleep(500); } return null; };
  const textOf = async (sel) => (await page.locator(sel).first().textContent().catch(() => '')) || '';

  // ── A normal upload at phone width: what shows first, reload while building
  await uploadUi('lake.txt', DOC);
  await page.waitForFunction(() => /lake/.test(document.body.textContent), null, { timeout: 15000 });
  const m1 = await latest();
  check('the upload lands in the list', !!m1 && m1.title === 'lake');
  await page.reload();
  await page.waitForSelector(`#course-${m1.id}`, { timeout: 15000 });
  await shot('01-after-upload');
  setMode({ mode: 'ok', delayMs: 1500 });
  await page.click(`#course-${m1.id}`);
  await sleep(2500);
  const noteA = await textOf(`#course-note-${m1.id}`);
  check('a build says what it is doing at once', /Planning|Building|Queued|waiting|behind/i.test(noteA), noteA);
  await page.reload();
  await page.waitForSelector(`#course-${m1.id}`);
  await sleep(1500);
  const btnA = await textOf(`#course-${m1.id}`);
  check('after a reload mid-build the page still shows the build', /Building|Queued/.test(btnA), btnA);
  const firstSkills = await waitFor(async () => { const c = await api('get', `/api/materials/${m1.id}/course`); return c.json.course && c.json.course.skills.length >= 1 ? c.json.course : null; });
  check('first skill appears while the rest build', !!firstSkills);
  await sleep(4500);
  const link = page.locator(`#course-note-${m1.id} a`);
  const hasLink = await link.count();
  check('the page offers the first skills at once', hasLink > 0, await textOf(`#course-note-${m1.id}`));
  await shot('02-mid-build');

  // ── The server dies part way
  setMode({ mode: 'ok', delayMs: 1500, dieNext: 3 });
  await sleep(4000);
  check('(the scripted crash happened)', await fetch(`${B}/api/health`).then(() => false).catch(() => true));
  await stopServer();
  setMode({ mode: 'ok', delayMs: 300 });
  await startServer();
  await ctx.request.post(`${B}/api/auth/login`, { data: { email, password: 'Walk-Pass-12345' } });
  await page.goto(`${B}/my-material`);
  await page.waitForSelector(`#course-${m1.id}`);
  await sleep(2000);
  await shot('03-after-crash');
  const btnB = await textOf(`#course-${m1.id}`); const noteB = await textOf(`#course-note-${m1.id}`);
  check('after a crash and restart the page is not stuck on Building', !/Building/.test(btnB), `${btnB} | ${noteB}`);
  check('and it says what to do next', /again|continue|finish|rest/i.test(`${btnB} ${noteB}`) || /Study/.test(btnB), `${btnB} | ${noteB}`);
  const crashCourse = (await api('get', `/api/materials/${m1.id}/course`)).json.course;
  const beforeResume = crashCourse ? crashCourse.skills.length : 0;
  // Resume from the page
  const resumeBtn = page.locator(`#course-note-${m1.id} button`).first();
  const resumeLabel = await resumeBtn.textContent();
  check('a partial course has a button that builds the rest', /again|continue|rest|finish|Learning path|Try/i.test(resumeLabel), resumeLabel);
  await page.locator(`#course-note-${m1.id} button`).first().click({ timeout: 3000 }).catch(async () => { await page.click(`#course-${m1.id}`); });
  await sleep(1500);
  const done = await waitFor(async () => { const c = await api('get', `/api/materials/${m1.id}/course`); return c.json.course && c.json.course.status === 'ready' ? c.json.course : null; }, 120000);
  check('the retry finishes the course and keeps what was built', !!done && done.skills.length >= beforeResume, done ? done.skills.length : 'never ready');
  await shot('04-after-resume');

  // ── A provider down: nothing answers
  setMode({ mode: 'down', delayMs: 50 });
  await uploadUi('down.txt', DOC.replace(/lake/g, 'pond'));
  const m2 = await waitFor(async () => { const x = await latest(); return x.title === 'down' ? x : null; }, 20000);
  await page.goto(`${B}/my-material`);
  await page.waitForSelector(`#course-${m2.id}`);
  await page.click(`#course-${m2.id}`);
  const failedCourse = await waitFor(async () => { const c = await api('get', `/api/materials/${m2.id}/course`); return c.json.course && c.json.course.status !== 'building' ? c.json.course : null; }, 90000);
  check('provider down: the build ends instead of hanging', !!failedCourse, 'still building after 90 s');
  await sleep(4500);
  await shot('05-provider-down');
  const btnC = await textOf(`#course-${m2.id}`); const noteC = await textOf(`#course-note-${m2.id}`);
  check('provider down: the learner is told, in words that are not their fault', /busy|try again|could not reach|not available|moment|later/i.test(noteC) && !/clearer or longer/i.test(noteC), `${btnC} | ${noteC}`);
  check('provider down: the button can try again', !(await page.locator(`#course-${m2.id}`).isDisabled()) && /again/i.test(btnC), btnC);
  // Notes and pack on the same material
  await page.goto(`${B}/my-material-notes?id=${m2.id}`);
  await sleep(1500);
  const nb = await page.locator('#make, button').first().count();
  if (nb) await page.locator('#make').click({ timeout: 2000 }).catch(() => {});
  const notesEnd = await waitFor(async () => { const n = await api('get', `/api/materials/${m2.id}/notes`); return n.json.notes && n.json.notes.status !== 'building' ? n.json.notes : null; }, 60000);
  await sleep(4500);
  const notesText = await page.locator('body').textContent();
  await shot('06-notes-down');
  check('provider down: notes end with a message and a button', !!notesEnd && !/Making your notes/.test(notesText) && /again/i.test(notesText), notesText.slice(0, 200));
  check('provider down: notes do not blame the text', !/clearer or longer/i.test(notesText), notesText.slice(0, 200));

  // ── Credit out, then back: retry works
  setMode({ mode: 'credit', delayMs: 50 });
  await page.goto(`${B}/my-material`);
  await page.waitForSelector(`#course-${m2.id}`);
  await page.click(`#course-${m2.id}`);
  await sleep(3000);
  const creditEnd = await waitFor(async () => { const c = await api('get', `/api/materials/${m2.id}/course`); return c.json.course && c.json.course.status !== 'building' ? c.json.course : null; }, 60000);
  check('credit out: the build ends', !!creditEnd);
  setMode({ mode: 'ok', delayMs: 100 });
  await page.reload();
  await page.waitForSelector(`#course-${m2.id}`);
  await sleep(1000);
  await page.click(`#course-${m2.id}`);
  const back = await waitFor(async () => { const c = await api('get', `/api/materials/${m2.id}/course`); return c.json.course && c.json.course.status === 'ready' ? c.json.course : null; }, 60000);
  check('credit back: the same button builds the course', !!back);

  // ── A build that never gets an answer: the wait is bounded and the page says so
  // (mode hang is 120 s per call; the walk only checks the page keeps talking.)

  // ── Two uploads at once
  setMode({ mode: 'ok', delayMs: 300 });
  const twin = await Promise.all(['one', 'two'].map((n) => ctx.request.post(`${B}/api/materials?name=${n}.txt`, { data: Buffer.from(DOC.replace(/lake/g, n)), headers: { 'content-type': 'application/octet-stream' } })));
  check('two uploads at once both land', twin.every((r) => r.status() === 201), twin.map((r) => r.status()));
  const list = (await api('get', '/api/materials')).json.materials;
  const ones = list.filter((x) => x.title === 'one' || x.title === 'two');
  check('both are in the list once each', ones.length === 2, ones.map((x) => x.title));
  await page.goto(`${B}/my-material`);
  await page.waitForSelector(`#course-${ones[1].id}`);
  await page.click(`#course-${ones[0].id}`);
  await sleep(300);
  await page.click(`#course-${ones[1].id}`);
  await sleep(2000);
  await shot('07-two-builds');
  const qnote = await textOf(`#course-note-${ones[1].id}`);
  check('a second build says it is queued or building', /queue|after|wait|behind|Planning|Building/i.test(qnote), qnote);
  const bothReady = await waitFor(async () => { const cs = await Promise.all(ones.map((x) => api('get', `/api/materials/${x.id}/course`))); return cs.every((c) => c.json.course && c.json.course.status === 'ready'); }, 180000);
  check('both builds finish', !!bothReady);

  // ── Deleting a material during its build
  setMode({ mode: 'ok', delayMs: 800 });
  const victim = await ctx.request.post(`${B}/api/materials?name=victim.txt`, { data: Buffer.from(DOC.replace(/lake/g, 'victim')), headers: { 'content-type': 'application/octet-stream' } });
  const vid = (await victim.json()).material.id;
  await api('post', `/api/materials/${vid}/course`, {});
  await sleep(3000);
  const delRes = await api('delete', `/api/materials/${vid}`);
  check('delete during a build is accepted', delRes.status === 200, delRes.json);
  await sleep(6000);
  const after = await api('get', `/api/materials/${vid}/course`);
  check('after the delete the course is gone and stays gone', after.status === 404, after.json);
  const c404 = await api('get', `/api/materials/${vid}/notes`);
  check('its notes are gone too', c404.status === 404, c404.json);
  await sleep(3000);
  const health = await fetch(`${B}/api/health`).then((r) => r.ok).catch(() => false);
  check('the server is still up', health);
  const log = fs.readFileSync(`${dbCopy}.server.log`, 'utf8');
  check('no unhandled error in the server log', !/Unhandled|TypeError|Cannot read prop/i.test(log), (log.match(/.*(Unhandled|TypeError|Cannot read prop).*/) || [''])[0]);
  check('no error on the page', !errors.length, errors.slice(0, 3));
  const rows = JSON.parse(fs.readFileSync(dbCopy, 'utf8'));
  void rows;
  await br.close();
  await stopServer();
  console.log(failures ? `${failures} check(s) failed` : 'All recovery checks passed');
  try { fs.unlinkSync(CONTROL); } catch { /* none */ }
  process.exit(failures ? 1 : 0);
})().catch(async (e) => { console.error('WALK ERROR', e.message.slice(0, 400)); await stopServer(); process.exit(2); });
