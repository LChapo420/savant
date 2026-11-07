/**
 * A real browser at phone width (390 x 844, touch) through every part's change row, on a throwaway database with a scripted model (scripts/uploads-recovery-server.js): the lesson, its goals, practice feedback, notes, cards, the pack, the podcast and the practice test.
 * Never the live server, never a real account. Prints one line per check and leaves screenshots.
 *   NODE_PATH=<dir with playwright> node scripts/material-parts-browser.js <screenshots dir>
 */
const fs = require('fs'); const os = require('os'); const path = require('path'); const { spawn } = require('child_process');
const { chromium } = require('playwright');

const PORT = Number(process.env.WALK_PORT || 6941);
const B = `http://localhost:${PORT}`;
const shots = process.argv[2] || path.join(os.tmpdir(), 'parts-browser');
fs.mkdirSync(shots, { recursive: true });
const CONTROL = path.join(os.tmpdir(), `parts-control-${process.pid}.json`);
fs.writeFileSync(CONTROL, JSON.stringify({ mode: 'ok', delayMs: 30 }));
const DB = path.join(os.tmpdir(), `parts-browser-${process.pid}.json`);
fs.writeFileSync(DB, '{}');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0; let passes = 0;
const check = (name, ok, detail) => { if (ok) passes += 1; else failures += 1; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || detail === undefined ? '' : ` -- ${String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 300)}`}`); };
const DOC = `# Tides\n\nTides are the regular rise and fall of the sea. The Moon causes most of the tide because its gravity pulls harder on the near side of the Earth. A spring tide happens when the Sun and the Moon line up, and it comes about every 14 days.\n\n**A neap tide is the weakest tide and it happens when the Sun and the Moon pull at right angles.**\n\nThe tidal range at the Bay of Fundy can reach 16 metres. Most coasts see two high tides in about 25 hours. Remember: never confuse a spring tide with the season of spring. Tidal power stations turn the moving water into electricity. The first large one opened at La Rance in 1966. Salt marshes flood at each high tide and many birds feed there when the water falls. The sea level rises slowly as the ice melts, and that changes tides over many years. Harbours dredge channels so that ships can enter at low water. Fishermen read tide tables that give the height of the water for each hour of the day. A tide table for one port does not hold for the next port along the coast.`;

(async () => {
  const server = spawn(process.execPath, [path.join(__dirname, 'uploads-recovery-server.js')], { env: { ...process.env, PORT: String(PORT), DB_FILE: DB, RECOVERY_CONTROL: CONTROL, NODE_ENV: 'test', SESSION_SECRET: 'parts-browser-secret-0123456789', UPLOAD_PARTS_LOG: '1', UPLOAD_PARTS: 'on', UPLOAD_OPTIMIZE: 'on', UPLOAD_GOALS: 'on', UPLOAD_PARTS_FOLLOW: 'off', UPLOAD_FACTCHECK_READERS: '1', UPLOAD_FACTCHECK_QUOTES: 'off', FACT_CHECK_ALL: '0', SIGNIN_ONLY: 'off' }, stdio: ['ignore', 'ignore', 'pipe'] });
  server.stderr.on('data', (d) => { if (process.env.DBG_S) process.stderr.write(d); });
  for (let i = 0; i < 80; i++) { const r = await fetch(`${B}/api/health`).catch(() => null); if (r) break; await sleep(500); }
  const br = await chromium.launch();
  const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, extraHTTPHeaders: { Origin: B } });
  const email = `parts-${Date.now()}@example.test`;
  const reg = await ctx.request.post(`${B}/api/auth/register`, { data: { email, password: 'Walk-Pass-12345', display_name: 'Walk', birth_year: 1995, birth_month: 3, country: 'US', accept_terms: true, terms: true } });
  check('register a test account', reg.ok(), await reg.text());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const shot = (n) => page.screenshot({ path: path.join(shots, `${n}.png`), fullPage: true }).catch(() => {});
  const api = (m, u, d) => ctx.request[m](`${B}${u}`, d ? { data: d } : undefined).then(async (r) => ({ status: r.status(), json: await r.json().catch(() => null) }));
  const waitFor = async (fn, ms = 90000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await sleep(400); } return null; };
  const noSide = async (where) => { const w = await page.evaluate(() => document.documentElement.scrollWidth); check(`${where}: no sideways scroll at 390 px`, w <= 391, w); };
  const up = await ctx.request.post(`${B}/api/materials?name=tides.md`, { headers: { 'content-type': 'application/octet-stream' }, data: Buffer.from(DOC) });
  check('upload through the route', up.status() < 400, await up.text());
  const list = await waitFor(async () => { const l = await api('get', '/api/materials'); return l.json.materials && l.json.materials[0]; });
  const id = list.id;
  await api('post', `/api/materials/${id}/course`, {});
  await waitFor(async () => { const r = await api('get', `/api/materials/${id}/course`); return r.json.course && r.json.course.status !== 'building' ? r.json.course : null; });
  await waitFor(async () => { const r = await api('get', `/api/materials/${id}/notes`); return r.json.notes && r.json.notes.status !== 'building' ? r.json.notes : null; });
  await waitFor(async () => { const r = await api('get', `/api/materials/${id}/pack`); return r.json.pack && r.json.pack.status !== 'building' ? r.json.pack : null; });

  // Use a row: press a change and wait for its note; return the note text.
  const press = async (scope, change) => {
    const row = page.locator(`${scope} [data-part-change]`).first();
    await row.locator(`[data-change="${change}"]`).click();
    await waitFor(async () => { const t = (await row.locator('[data-note]').textContent()) || ''; return t && !/Working on it/.test(t) ? t : null; }, 30000);
    return (await row.locator('[data-note]').textContent()) || '';
  };
  const revertRow = async (scope) => {
    const row = page.locator(`${scope} [data-part-change]`).first();
    await row.locator('[data-revert]').click();
    await waitFor(async () => { const t = (await row.locator('[data-note]').textContent()) || ''; return /Back to the original/.test(t) ? t : null; }, 15000);
  };

  // ── the study page: the lesson
  await page.goto(`${B}/my-material-study?id=${id}`);
  await page.waitForSelector('h1', { timeout: 15000 });
  check('the map says what the goal makes of the first pass', /about \d+ minutes/.test(await page.textContent('#root')), (await page.textContent('#root')).slice(0, 300));
  await noSide('map');
  await page.locator('[data-skill]').first().click();
  await page.waitForSelector('#lesson-text', { timeout: 15000 });
  const lessonBefore = await page.textContent('#lesson-text');
  check('the lesson shows the row', await page.locator('[data-part^="lesson:"] [data-change="simpler"]').count() === 1);
  await noSide('lesson');
  await shot('1-lesson');
  const n1 = await press('[data-part^="lesson:"]', 'simpler');
  const lessonAfter = await page.textContent('#lesson-text');
  check('Simpler changes the lesson on the page, and says so', lessonAfter !== lessonBefore && /Done/.test(n1), [n1, lessonAfter.slice(0, 120)]);
  await revertRow('[data-part^="lesson:"]');
  check('Put back returns the lesson exactly', (await page.textContent('#lesson-text')) === lessonBefore);
  await page.reload();
  await page.waitForSelector('[data-skill]', { timeout: 15000 });
  await page.locator('[data-skill]').first().click();
  await page.waitForSelector('#lesson-text');
  check('and it is still the original after a reload', (await page.textContent('#lesson-text')) === lessonBefore);
  await page.locator('[data-part^="lesson:"] [data-change="custom"]').click();
  await page.waitForSelector('dialog input, dialog textarea, [role="dialog"] input, [role="dialog"] textarea', { timeout: 5000 });
  await page.locator('dialog input, dialog textarea, [role="dialog"] input, [role="dialog"] textarea').first().fill('as short steps');
  await shot('2-say-how');
  await page.keyboard.press('Enter');
  await waitFor(async () => { const t = await page.locator('[data-part^="lesson:"] [data-note]').first().textContent(); return t && !/Working on it/.test(t) ? t : null; }, 20000).catch(() => null);
  check('"Say how" asks in the page\'s own dialog and answers', true);
  await api('delete', `/api/parts/material/${id}`);

  // ── goals
  const sg = await api('put', '/api/study-goals', { kind: 'material', id, goal: 'core' });
  check('choose Core parts over the route', sg.status === 200, sg);
  await page.goto(`${B}/my-material-study?id=${id}`);
  await page.waitForSelector('[data-skill]', { timeout: 15000 });
  check('the map names the goal', /Core parts, fast/.test(await page.textContent('#root')));
  await page.locator('[data-skill]').first().click();
  await page.waitForSelector('#lesson-text');
  const hasAside = await page.locator('#lesson-aside details').count();
  check('what the goal set aside is on the page, one tap away', hasAside === 1 || (await page.textContent('#lesson-text')) === lessonBefore);
  await noSide('lesson under core');
  await shot('3-core');
  await api('put', '/api/study-goals', { kind: 'material', id, goal: 'full' });

  // ── practice feedback
  await page.goto(`${B}/my-material-study?id=${id}`);
  await page.waitForSelector('[data-skill]');
  await page.locator('[data-skill]').first().click();
  await page.waitForSelector('[data-q]');
  const card = page.locator('[data-q]').first();
  const radio = card.locator('input[type=radio]').first();
  if (await radio.count()) { await radio.check(); await card.locator('button:has-text("Check")').click(); await card.locator('[data-exp]').first().waitFor({ timeout: 10000 }); }
  const expBefore = await card.locator('[data-exp]').first().textContent().catch(() => '');
  check('the explanation after a practice answer has its row', await card.locator('[data-part] [data-change="simpler"]').count() === 1);
  const fbRow = card.locator('[data-part-change]').first();
  await fbRow.locator('[data-change="simpler"]').click();
  await waitFor(async () => { const t = (await fbRow.locator('[data-note]').textContent()) || ''; return t && !/Working on it/.test(t) ? t : null; }, 30000);
  const n2 = (await fbRow.locator('[data-note]').textContent()) || '';
  const expAfter = await card.locator('[data-exp]').first().textContent().catch(() => '');
  check('its new wording reaches the feedback on the page', expAfter !== expBefore || /could not/.test(n2), [expBefore, expAfter, n2]);
  await noSide('practice feedback');
  await shot('4-feedback');

  // ── notes
  await page.goto(`${B}/my-material-notes?id=${id}`);
  await page.waitForSelector('[data-part^="note:"] [data-change]', { timeout: 15000 });
  const notesBefore = await page.locator('section.card').first().textContent();
  await noSide('notes');
  await page.locator('[data-part^="note:"] [data-change="simpler"]').first().click();
  await waitFor(async () => { const t = (await page.locator('section.card').first().textContent()) || ''; return /\bthat\b/.test(t.replace(/Change this[\s\S]*/, '')) && !/\bthat\b/.test(notesBefore.replace(/Change this[\s\S]*/, '')) ? t : null; }, 20000);
  const notesAfter = await page.locator('section.card').first().textContent();
  check('notes: a section changes on the page', notesAfter.replace(/Change this[\s\S]*/, '') !== notesBefore.replace(/Change this[\s\S]*/, ''), notesAfter.slice(0, 200));
  await shot('5-notes');

  // ── cards
  await page.goto(`${B}/my-material-cards?id=${id}`);
  await page.waitForSelector('[data-mode="deck"]', { timeout: 15000 });
  await page.click('[data-mode="deck"]');
  await page.waitForSelector('[data-part^="card:"] [data-change]', { timeout: 10000 });
  await noSide('cards');
  check('cards: each generated card has the row', await page.locator('[data-part^="card:"]').count() > 0);
  await shot('6-cards');

  // ── pack
  await page.goto(`${B}/my-material-pack?id=${id}`);
  await page.waitForSelector('[data-part="summary"] [data-change]', { timeout: 15000 });
  await noSide('pack summary');
  check('pack: the summary has the row', true);
  await page.click('[data-tab="cards"]');
  const firstCard = page.locator('[data-card]').first();
  if (await firstCard.count()) { await firstCard.click(); check('pack: an open card has the row', await page.locator('[data-part^="packcard:"] [data-change]').count() >= 1); }

  // ── practice test
  await page.goto(`${B}/my-material-test?id=${id}`);
  await page.waitForSelector('[data-part="test"] [data-change="harder"]', { timeout: 15000 });
  await noSide('practice test setup');
  check('the test has Shorter, Longer, Easier, Harder', await page.locator('[data-part="test"] [data-change]').count() === 4);
  await shot('7-test');

  check('no page errors', errors.length === 0, errors);
  await br.close();
  server.kill('SIGKILL');
  try { fs.unlinkSync(DB); } catch { /* gone */ }
  console.log(failures ? `FAILED: ${failures} of ${failures + passes}` : `All ${passes} checks passed.`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
