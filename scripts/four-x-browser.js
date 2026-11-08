#!/usr/bin/env node
/**
 * Opens the mode picker and the own-control study screens in a real browser (Playwright, phone width). Free: the app runs with a scripted model (uploads-recovery-server), on a
 * throwaway database. The study's offer, test card and test screen are reached by mocking the two study replies, because reaching them for real needs a finished course and weeks of waiting. Not part of npm test.
 *   node scripts/four-x-browser.js [screenshot-dir]
 */
const fs = require('fs'); const os = require('os'); const path = require('path'); const { spawn } = require('child_process');
const { chromium } = require('playwright');

const PORT = Number(process.env.WALK_PORT || 6952);
const B = `http://localhost:${PORT}`;
const shots = process.argv[2] || path.join(os.tmpdir(), 'four-x-browser');
fs.mkdirSync(shots, { recursive: true });
const CONTROL = path.join(os.tmpdir(), `fx-control-${process.pid}.json`);
fs.writeFileSync(CONTROL, JSON.stringify({ mode: 'ok', delayMs: 30 }));
const DB = path.join(os.tmpdir(), `fx-browser-${process.pid}.json`);
fs.writeFileSync(DB, '{}');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0; let passes = 0;
const check = (name, ok, detail) => { if (ok) passes += 1; else failures += 1; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || detail === undefined ? '' : ` -- ${String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 300)}`}`); };
const DOC = `# Tides\n\nTides are the regular rise and fall of the sea. The Moon causes most of the tide because its gravity pulls harder on the near side of the Earth. A spring tide happens when the Sun and the Moon line up, and it comes about every 14 days.\n\n**A neap tide is the weakest tide and it happens when the Sun and the Moon pull at right angles.**\n\nThe tidal range at the Bay of Fundy can reach 16 metres. Most coasts see two high tides in about 25 hours. Tidal power stations turn the moving water into electricity. The first large one opened at La Rance in 1966.`;

(async () => {
  const server = spawn(process.execPath, [path.join(__dirname, 'uploads-recovery-server.js')], { env: { ...process.env, PORT: String(PORT), DB_FILE: DB, RECOVERY_CONTROL: CONTROL, NODE_ENV: 'test', SESSION_SECRET: 'fx-browser-secret-0123456789', LEARNING_MODES: '1', UPLOAD_STUDY: '1', UPLOAD_GOALS: 'on', UPLOAD_FACTCHECK_READERS: '1', UPLOAD_FACTCHECK_QUOTES: 'off', FACT_CHECK_ALL: '0', SIGNIN_ONLY: 'off' }, stdio: ['ignore', 'ignore', 'pipe'] });
  server.stderr.on('data', (d) => { if (process.env.DBG_S) process.stderr.write(d); });
  try {
    for (let i = 0; i < 80; i++) { const r = await fetch(`${B}/api/health`).catch(() => null); if (r) break; await sleep(500); }
    const br = await chromium.launch();
    const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, extraHTTPHeaders: { Origin: B } });
    const email = `fx-${Date.now()}@example.test`;
    const reg = await ctx.request.post(`${B}/api/auth/register`, { data: { email, password: 'Walk-Pass-12345', display_name: 'Walk', birth_year: 1995, birth_month: 3, country: 'US', accept_terms: true, terms: true } });
    check('register a test account', reg.ok(), await reg.text());
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    const shot = (n) => page.screenshot({ path: path.join(shots, `${n}.png`), fullPage: true }).catch(() => {});
    const api = (m, u, d) => ctx.request[m](`${B}${u}`, d ? { data: d } : undefined).then(async (r) => ({ status: r.status(), json: await r.json().catch(() => null) }));
    const waitFor = async (fn, ms = 90000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await sleep(400); } return null; };
    const up = await ctx.request.post(`${B}/api/materials?name=tides.md`, { headers: { 'content-type': 'application/octet-stream' }, data: Buffer.from(DOC) });
    check('upload through the route', up.status() < 400, await up.text());
    const m0 = await waitFor(async () => { const l = await api('get', '/api/materials'); return l.json.materials && l.json.materials[0]; });
    const id = m0.id;
    await api('post', `/api/materials/${id}/course`, {});
    await waitFor(async () => { const r = await api('get', `/api/materials/${id}/course`); return r.json.course && r.json.course.status !== 'building' ? r.json.course : null; });

    // 1. the mode picker on the goals card
    await page.goto(`${B}/profile#retention-goals-card`);
    await page.waitForSelector('.rg-item .rg-m', { timeout: 15000 });
    const opts = await page.$$eval('.rg-item .rg-m option', (o) => o.map((x) => x.textContent));
    check('picker lists three modes', JSON.stringify(opts) === JSON.stringify(['Fastest', 'Balanced', 'Highest']), opts);
    await shot('mode-picker');
    await page.selectOption('.rg-item .rg-m', 'fastest');
    await page.click('.rg-item .rg-save');
    await waitFor(async () => /Saved/.test(await page.textContent('.rg-item .rg-msg')), 15000);
    check('saving the mode says saved', /Saved/.test(await page.textContent('.rg-item .rg-msg')));
    const saved = await api('get', '/api/retention-goals');
    const row = (saved.json.materials || []).find((x) => x.id === id);
    check('the mode persisted on the course', row && row.mode === 'fastest', row);
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    check('goals card: no sideways scroll at 390 px', w <= 391, w);

    // 2. the own-control screens: offer, test card, test screen
    let phase = 'offer';
    await page.route(`**/api/materials/${id}/study`, async (route) => {
      const res = await route.fetch(); const j = await res.json();
      j.own_control = phase === 'offer' ? { in_study: false, phase: 'none', offer: { available: true, text: 'Help us find out how much faster Savant really is.' } } : { in_study: true, phase: 'test_due' };
      await route.fulfill({ response: res, json: j });
    });
    await page.route(`**/api/materials/${id}/study/own-control/test`, async (route) => {
      if (route.request().method() === 'GET') await route.fulfill({ json: { questions: [{ id: 'q1', skill: 's1', prompt: 'Which is the weakest tide?', type: 'multiple_choice', choices: ['Spring tide', 'Neap tide'] }] } });
      else await route.fulfill({ json: { ok: true, result: {} } });
    });
    await page.goto(`${B}/my-material-study?id=${id}`);
    await page.waitForSelector('#own-yes', { timeout: 15000 });
    check('the offer card shows', true);
    await shot('study-offer');
    phase = 'test';
    await page.goto(`${B}/my-material-study?id=${id}`);
    await page.waitForSelector('#own-test', { timeout: 15000 });
    await shot('study-test-card');
    await page.click('#own-test');
    await page.waitForSelector('#send', { timeout: 15000 });
    check('the test screen shows a question', (await page.textContent('body')).includes('Which is the weakest tide?'));
    await shot('study-test-screen');
    await page.locator('input[type=radio], button:has-text("Neap")').first().click().catch(() => {});
    await page.click('#send');
    await sleep(800);
    await shot('study-test-sent');
    check('no page errors on any screen', errors.length === 0, errors);
    await br.close();
  } finally {
    server.kill();
    try { fs.unlinkSync(DB); fs.unlinkSync(CONTROL); } catch { /* best effort */ }
  }
  console.log(`${passes} passed, ${failures} failed; screenshots in ${shots}`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
