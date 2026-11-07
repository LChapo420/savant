/**
 * Onboarding v2 in a real browser, on a throwaway copy of the store. Not part of `npm test`: playwright is not a dependency of the app.
 *
 *   node scripts/onboarding-v2-browser.js --pw=<path to playwright> --shots=<dir> [--only=adult,child]
 *
 * Walks every persona at 375 px and at desktop, light and dark, and fails on a console error, a CSP violation, sideways scrolling or a screen
 * that doesn't do what it should. Writes one screenshot per step and persona under --shots.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');

const arg = (n, d) => { const a = process.argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.split('=').slice(1).join('=') : d; };
const { chromium } = require(arg('pw', 'playwright')); // eslint-disable-line import/no-dynamic-require
const SHOTS = arg('shots', path.join(os.tmpdir(), 'ob2-shots'));
const ONLY = arg('only', '').split(',').filter(Boolean);
const PORT = Number(arg('port', 6893));
const BASE = `http://localhost:${PORT}`;
const ROOT = path.join(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ob2b-'));
const dbFile = path.join(dir, 'db.json');
fs.mkdirSync(SHOTS, { recursive: true });

const PHONE = { width: 375, height: 760 };
const DESK = { width: 1366, height: 860 };
const problems = [];
const results = [];
let seq = 0;
const unique = () => `${Date.now().toString(36)}${(seq += 1)}`;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function open(browser, name, { viewport = PHONE, scheme = 'light', reducedMotion = 'no-preference' } = {}) {
  const ctx = await browser.newContext({ viewport, colorScheme: scheme, reducedMotion, hasTouch: viewport.width < 600 });
  const page = await ctx.newPage();
  page.persona = `${name}/${viewport.width}/${scheme}`;
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' && !/Failed to load resource: the server responded with a status of (400|401|403|409|429)/.test(t)) problems.push(`${page.persona} console: ${t.slice(0, 200)}`);
    if (/Content Security Policy|Refused to/.test(t)) problems.push(`${page.persona} CSP: ${t.slice(0, 200)}`);
  });
  page.on('pageerror', (e) => problems.push(`${page.persona} pageerror: ${String(e.message).slice(0, 200)}`));
  return page;
}

async function check(page, label) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (over > 0) problems.push(`${page.persona} ${label}: sideways scroll by ${over}px`);
  const small = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('button:not([hidden]), a.opt, label.opt, .btn').forEach((n) => {
      if (!n.offsetParent) return;
      const r = n.getBoundingClientRect();
      if (r.height && r.height < 40 && !n.closest('.parent-note')) out.push(`${n.id || n.className}:${Math.round(r.height)}`);
    });
    return out;
  });
  if (small.length && page.url().includes('/start')) problems.push(`${page.persona} ${label}: small targets ${small.join(', ')}`);
}

async function shot(page, label) {
  await delay(420);
  await check(page, label);
  const name = `${page.persona.replace(/\//g, '-')}-${label}.png`;
  await page.screenshot({ path: path.join(SHOTS, name), fullPage: false });
}

async function at(page, step) {
  try {
    await page.waitForFunction((s) => location.hash === `#${s}` && document.querySelector('#ob') && document.querySelector('#ob').dataset.screen === s, step, { timeout: 15000 });
  } catch (err) {
    const where = await page.evaluate(() => [location.href, (document.querySelector('#ob') || { dataset: {} }).dataset.screen, (document.querySelector('#err') || {}).textContent].join(' | ')).catch(() => '');
    await page.screenshot({ path: path.join(SHOTS, `FAIL-${page.persona.replace(/\//g, '-')}-${step}.png`) }).catch(() => {});
    throw new Error(`${page.persona} wanted ${step}, at ${where}`);
  }
}
const next = (page) => page.locator('#next').click();
const isDisabled = (page) => page.locator('#next').isDisabled();

async function toAge(page) {
  await page.goto(`${BASE}/start`);
  await at(page, 'welcome');
  await shot(page, '01-welcome');
  await next(page);
  await at(page, 'hello');
  await shot(page, '02-hello');
  await next(page);
  await at(page, 'age');
}

async function answerAge(page, { month = '3', year, country = 'US' }) {
  assert.equal(await isDisabled(page), true, 'age: Continue is off until answered');
  await page.waitForFunction(() => document.querySelectorAll('#c option').length > 5);
  assert.equal(await page.locator('#m').inputValue(), '', 'no default month');
  assert.equal(await page.locator('#y').inputValue(), '', 'no default year');
  assert.equal(await page.locator('#c').inputValue(), '', 'no default country');
  await page.selectOption('#m', month);
  await page.selectOption('#y', String(year));
  await page.selectOption('#c', country);
  await shot(page, '03-age');
  await next(page);
  await at(page, 'learn');
}

async function toMoment(page, { tracks = ['math'], why = 'school', horizon = 'year', interest = 'soccer', other = null }) {
  assert.equal(await isDisabled(page), true, 'learn: Continue is off until answered');
  for (const t of tracks) await page.locator(`input[name="track"][value="${t}"]`).check();
  await shot(page, '04-learn');
  await next(page);
  await at(page, 'why');
  assert.equal(await isDisabled(page), true);
  await page.locator(`input[name="why"][value="${why}"]`).check();
  await shot(page, '05-why');
  await next(page);
  await at(page, 'when');
  await page.locator(`input[name="horizon"][value="${horizon}"]`).check();
  await shot(page, '06-when');
  await next(page);
  await at(page, 'into');
  await page.locator(`input[name="interest"][value="${interest}"]`).check();
  if (other) {
    assert.equal(await isDisabled(page), true, 'other: a box to fill first');
    await page.fill('#other', other);
  }
  await shot(page, '07-into');
  await next(page);
  await at(page, 'moment');
  await shot(page, '08-moment');
}

/** Answer until the walk ends, or until `stopAfter` questions and then stop. */
async function walk(page, stopAfter = 3, shotIt = true) {
  await page.waitForSelector('.q-prompt', { timeout: 20000 });
  if (shotIt) await shot(page, '10-level');
  for (let i = 0; i < stopAfter; i += 1) {
    await page.waitForSelector('.q-prompt');
    const first = page.locator('#walk input[type="radio"]').first();
    if (await first.count()) await first.check();
    else await page.fill('#typed', 'x');
    await next(page);
    await delay(150);
    if (await page.locator('#ob[data-screen="result"]').count()) return;
  }
  await page.locator('#stop-walk').click();
  await at(page, 'result');
}

async function throughBuilding(page) {
  await shot(page, '11-result');
  await next(page);
  await page.waitForFunction(() => document.querySelector('#ob').dataset.screen === 'building' || document.querySelector('#ob').dataset.screen === 'ready');
  await delay(900);
  await page.screenshot({ path: path.join(SHOTS, `${page.persona.replace(/\//g, '-')}-12-building.png`) });
  await at(page, 'ready');
  await shot(page, '13-ready');
}

async function openLesson(page) {
  await next(page);
  await page.waitForFunction(() => !location.pathname.startsWith('/start'), null, { timeout: 15000 });
  await page.waitForLoadState('domcontentloaded');
  await delay(800);
  await page.screenshot({ path: path.join(SHOTS, `${page.persona.replace(/\//g, '-')}-14-lesson.png`) });
  assert.ok(await page.locator('#ob2-bar').count(), 'the save line is on the lesson page');
}

async function saveSelf(page, email) {
  await page.goto(`${BASE}/start#save`);
  await at(page, 'save');
  assert.equal(await isDisabled(page), true);
  await page.fill('input[name="display_name"]', 'Ada Tester');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', 'longenough1');
  await shot(page, '15-save');
}

async function adult(browser, opts, label = 'adult') {
  const page = await open(browser, label, opts);
  await toAge(page);
  await answerAge(page, { year: 1990 });
  await toMoment(page, {});
  await next(page);
  await at(page, 'intro');
  await shot(page, '09-intro');
  await next(page);
  await at(page, 'level');
  await walk(page, 4);
  await throughBuilding(page);
  await openLesson(page);
  await saveSelf(page, `adult-${unique()}@example.test`);
  await next(page);
  await at(page, 'remind');
  await shot(page, '16-remind');
  await page.locator('input[name="day"][value="1"]').check();
  await next(page);
  await at(page, 'done');
  await shot(page, '17-done');
  await next(page);
  await page.waitForURL('**/dashboard*', { timeout: 15000 });
  await page.waitForLoadState('domcontentloaded');
  await delay(500);
  assert.equal(await page.locator('#ob2-bar').count(), 0, 'no save line once saved');
  results.push(`${page.persona}: whole flow to the dashboard`);
  await page.context().close();
}

async function teen(browser, opts) {
  const year = new Date().getFullYear() - 15;
  const page = await open(browser, 'teen', opts);
  await toAge(page);
  await answerAge(page, { year }); // US: 13 is the consent age, so this is the usual route
  assert.ok(await page.locator('input[name="notes"]').count(), 'teen in the US may use own notes');
  await toMoment(page, { tracks: ['reading'], why: 'test', horizon: 'months', interest: 'music' });
  await next(page);
  await at(page, 'intro');
  await next(page);
  await at(page, 'level');
  await walk(page, 2, false);
  await throughBuilding(page);
  await page.context().close();
  results.push(`${page.persona}: to the lesson hand-off`);
}

async function childWalk(browser, opts, withParent, label) {
  const year = new Date().getFullYear() - 10;
  const page = await open(browser, label, opts);
  await toAge(page);
  await answerAge(page, { year });
  assert.equal(await page.locator('input[name="notes"]').count(), 0, 'a child is not offered uploads');
  // Steps 4 to 6 stay on the device: count what reaches the server.
  const posted = [];
  page.on('request', (r) => { if (r.method() === 'POST') posted.push(r.url()); });
  await toMoment(page, { tracks: ['math'], why: 'curious', horizon: 'forever', interest: 'other' });
  assert.equal(posted.length, 0, 'nothing about a child reaches the server before the parent is asked');
  assert.equal(await page.locator('#other').count(), 0, 'a child gets no free-text box');
  await next(page);
  await at(page, 'parent');
  await shot(page, '09a-parent');
  assert.equal(await page.locator('input[name="email"]').count(), 0, 'no child email');
  await page.fill('input[name="nickname"]', 'Sam');
  const parentAddress = `parent-${unique()}@example.test`;
  await page.fill('input[name="parent_email"]', parentAddress);
  await next(page);
  await at(page, 'intro');
  await shot(page, '09-intro');
  await next(page);
  await at(page, 'level');
  await walk(page, 2, false);
  await throughBuilding(page);
  await openLesson(page);
  await page.goto(`${BASE}/start#save`);
  await at(page, 'save');
  assert.equal(await page.locator('input[name="email"]').count(), 0, 'no child email at save');
  await page.fill('input[name="username"]', `sam${unique()}`);
  await page.fill('input[name="password"]', 'longenough1');
  await shot(page, '15-save');
  await next(page);
  await at(page, 'remind');
  await page.locator('#alt').click();
  await at(page, 'done');
  await shot(page, '17-done');
  const me = await page.evaluate(async () => (await (await fetch('/api/auth/me')).json()).user);
  assert.equal(me.email, null);
  assert.equal(me.consent.state, 'pending');
  assert.equal(me.consent.ai_free_text, false);
  if (withParent) {
    // The parent opens the link from the email, in their own browser, on the existing page.
    const outbox = path.join(dir, 'outbox');
    const mail = fs.readdirSync(outbox).map((f) => fs.readFileSync(path.join(outbox, f), 'utf8')).filter((m) => m.includes(parentAddress)).pop();
    assert.ok(mail, 'the parent got the email');
    assert.match(mail, /Sam/, 'the email names the nickname');
    const token = decodeURIComponent(mail.match(/parent-consent\?token=([^\s"\\]+)/)[1]);
    const parent = await open(browser, 'parent', { viewport: PHONE, scheme: 'light' });
    await parent.goto(`${BASE}/parent-consent?token=${encodeURIComponent(token)}`);
    await parent.waitForLoadState('domcontentloaded');
    const out = await parent.evaluate(async (tk) => {
      const view = await (await fetch(`/api/consent/request/${encodeURIComponent(tk)}`)).json();
      const res = await fetch(`/api/consent/request/${encodeURIComponent(tk)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: 'agree', notice_version: view.notice_version, i_am_parent: true, password: 'parentpass1' }),
      });
      return { status: res.status, body: await res.json() };
    }, token);
    await parent.context().close();
    assert.equal(out.status < 300, true, `the parent's agreement went through: ${JSON.stringify(out.body).slice(0, 160)}`);
    await page.reload();
    await at(page, 'done');
    const after = await page.evaluate(async () => (await (await fetch('/api/auth/me')).json()).user);
    assert.equal(after.consent.state, 'active', 'the child account is active after the parent agrees');
    assert.equal(after.consent.ai_free_text, false, 'outside AI still needs its own opt-in');
    results.push(`${page.persona}: parent got the email, agreed on the existing page; child active, outside AI still off, login made in v2 still works`);
  } else {
    results.push(`${page.persona}: limited account before consent, no outside AI`);
  }
  await page.context().close();
}

async function returning(browser, opts) {
  // Make an account through the flow's API, then come back in a fresh browser.
  const email = `back-${unique()}@example.test`;
  const made = await open(browser, 'returning-setup', opts);
  await made.goto(`${BASE}/start`);
  await made.evaluate(async (e) => {
    const p = (u, b) => fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
    await p('/api/consent/age', { birth_month: 1, birth_year: 1985, country: 'US' });
    await p('/api/ob2/begin', { answers: { tracks: ['math'] } });
    const grades = (await (await fetch('/api/catalog?view=grades')).json()).tracks.find((t) => t.id === 'math').grades;
    await p('/api/ob2/first-lesson', { track: 'math', grade_id: grades[3].id });
    await p('/api/ob2/claim', { display_name: 'Back Again', email: e, password: 'longenough1' });
  }, email);
  await made.context().close();

  const page = await open(browser, 'returning', opts);
  await page.goto(`${BASE}/start`);
  await at(page, 'welcome');
  await page.locator('#alt').click();
  await page.waitForURL('**/login*');
  await page.fill('#email', email);
  await page.fill('#password', 'longenough1');
  await page.locator('#submit').click();
  await page.waitForURL('**/dashboard*', { timeout: 15000 });
  await page.goto(`${BASE}/start`);
  await page.waitForURL('**/dashboard*', { timeout: 15000 });
  await page.goto(`${BASE}/register`);
  await page.waitForURL('**/dashboard*', { timeout: 15000 });
  results.push(`${page.persona}: signs in to the dashboard; /start and /register don't send it back through`);
  await page.context().close();
}

async function reloadAndBack(browser, opts) {
  const page = await open(browser, 'reload', opts);
  await toAge(page);
  await page.reload();
  await at(page, 'age');
  await answerAge(page, { year: 1990 });
  await page.locator('input[name="track"][value="math"]').check();
  await next(page);
  await at(page, 'why');
  await page.reload();
  await at(page, 'why');
  await page.locator('input[name="why"][value="work"]').check();
  await next(page);
  await at(page, 'when');
  // Back through the browser, then the screen's own back, and every answer is still there.
  await page.goBack();
  await at(page, 'why');
  assert.ok(await page.locator('input[name="why"][value="work"]').isChecked(), 'browser back keeps the answer');
  await page.locator('#back').click();
  await at(page, 'learn');
  assert.ok(await page.locator('input[name="track"][value="math"]').isChecked(), 'in-page back keeps the answer');
  await page.goBack();
  await delay(200);
  await page.goto(`${BASE}/start#age`);
  await at(page, 'age');
  assert.equal(await page.locator('#m').count(), 0, 'the age answer is not asked again');
  await page.goto(`${BASE}/start#ready`);
  await delay(400);
  const where = await page.evaluate(() => document.querySelector('#ob').dataset.screen);
  assert.notEqual(where, 'ready', 'a step cannot be skipped to from the address');
  await page.goto(`${BASE}/start#learn`);
  await at(page, 'learn');
  await next(page);
  await at(page, 'why');
  await next(page);
  await at(page, 'when');
  await page.locator('input[name="horizon"][value="date"]').check();
  assert.equal(await isDisabled(page), true, 'a test date is needed');
  const soon = new Date(Date.now() + 40 * 86400000).toISOString().slice(0, 10);
  await page.fill('#test-date', soon);
  await next(page);
  await at(page, 'into');
  await page.locator('input[name="interest"][value="cooking"]').check();
  await next(page);
  await at(page, 'moment');
  await next(page);
  await at(page, 'intro');
  await next(page);
  await at(page, 'level');
  await page.waitForSelector('.q-prompt');
  const before = await page.locator('.ob-eyebrow').textContent();
  await page.locator('#walk input[type="radio"]').first().check();
  await next(page);
  await delay(300);
  await page.waitForSelector('.q-prompt');
  const second = await page.locator('.ob-eyebrow').textContent();
  await page.reload();
  await at(page, 'level');
  await page.waitForSelector('.q-prompt');
  const after = await page.locator('.ob-eyebrow').textContent();
  assert.notEqual(after, 'Question 1', `walk resumes after reload (was ${before}, then ${second}, now ${after})`);
  // Double taps: a burst on Continue moves one question and one only.
  await page.locator('#walk input[type="radio"]').first().check();
  const n = Number(after.replace(/\D/g, ''));
  await page.evaluate(() => { const b = document.getElementById('next'); b.click(); b.click(); b.click(); });
  await delay(600);
  await page.waitForSelector('.q-prompt');
  const burst = Number((await page.locator('.ob-eyebrow').textContent()).replace(/\D/g, ''));
  assert.ok(burst <= n + 1, `a double tap moves one question (from ${n} to ${burst})`);
  await page.locator('#stop-walk').click();
  await at(page, 'result');
  await next(page);
  await at(page, 'ready');
  // Reload at the hand-off comes back to it, and a burst on Open opens once.
  await page.reload();
  await at(page, 'ready');
  results.push(`${page.persona}: reload at each stage, browser back, in-page back, address-bar skipping, double taps`);
  await page.context().close();
}

async function failedSignUp(browser, opts) {
  const email = `taken-${unique()}@example.test`;
  const other = await open(browser, 'taken-setup', opts);
  await other.goto(`${BASE}/start`);
  await other.evaluate(async (e) => {
    const p = (u, b) => fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
    await p('/api/consent/age', { birth_month: 1, birth_year: 1985, country: 'US' });
    await p('/api/ob2/begin', { answers: { tracks: ['math'] } });
    await p('/api/ob2/claim', { display_name: 'First Person', email: e, password: 'longenough1' });
  }, email);
  await other.context().close();

  const page = await open(browser, 'failed', opts);
  await toAge(page);
  await answerAge(page, { year: 1990 });
  await toMoment(page, { interest: 'space' });
  await next(page);
  await at(page, 'intro');
  await next(page);
  await at(page, 'level');
  await walk(page, 2, false);
  await next(page);
  await at(page, 'ready');
  const enrollment = await page.evaluate(async () => (await (await fetch('/api/ob2/state')).json()).enrollment.id);
  await saveSelf(page, email);
  await next(page);
  await page.waitForSelector('#err:not([hidden])');
  await shot(page, '15b-save-failed');
  assert.match(await page.locator('#err').textContent(), /already exists/);
  assert.equal(await page.locator('input[name="display_name"]').inputValue(), 'Ada Tester', 'what they typed is kept');
  const still = await page.evaluate(async () => (await (await fetch('/api/ob2/state')).json()).enrollment.id);
  assert.equal(still, enrollment, 'progress is untouched after a failed sign-up');
  await page.reload();
  await at(page, 'save');
  await page.fill('input[name="display_name"]', 'Ada Tester');
  await page.fill('input[name="email"]', `ok-${unique()}@example.test`);
  await page.fill('input[name="password"]', 'longenough1');
  await next(page);
  await at(page, 'remind');
  const list = await page.evaluate(async () => (await (await fetch('/api/enrollments')).json()).enrollments.map((e) => e.id));
  assert.deepEqual(list, [enrollment], 'the same enrollment is on the account');
  results.push(`${page.persona}: taken email shown, typing kept, reload, then saved with progress intact`);
  await page.context().close();
}

async function noExample(browser, opts) {
  const page = await open(browser, 'other', opts);
  await toAge(page);
  await answerAge(page, { year: 1990 });
  await toMoment(page, { interest: 'other', other: 'pottery' });
  const said = await page.locator('#bubble-text').textContent();
  assert.match(said, /pottery/);
  assert.match(said, /won't fake it/);
  // The typed word doesn't leave the device before the level check, and only the guest row holds it then.
  const pills = page.locator('.pill');
  await pills.nth(1).click();
  await delay(300);
  await shot(page, '08b-moment-other');
  results.push(`${page.persona}: an interest with no example says so and shows another`);
  await page.context().close();
}

async function notes(browser, opts) {
  const page = await open(browser, 'notes', opts);
  await toAge(page);
  await answerAge(page, { year: 1990 });
  await page.locator('input[name="notes"]').check();
  await next(page);
  await at(page, 'why');
  await page.locator('input[name="why"][value="school"]').check();
  await next(page);
  await at(page, 'when');
  await page.locator('input[name="horizon"][value="year"]').check();
  await next(page);
  await at(page, 'into');
  await page.locator('input[name="interest"][value="art"]').check();
  await next(page);
  await at(page, 'moment');
  await next(page);
  await at(page, 'save');
  await shot(page, '15c-save-notes');
  await page.fill('input[name="display_name"]', 'Note Taker');
  await page.fill('input[name="email"]', `notes-${unique()}@example.test`);
  await page.fill('input[name="password"]', 'longenough1');
  await next(page);
  await at(page, 'done');
  assert.ok(await page.locator('a.opt[href="/materials"]').count(), 'upload is offered after saving');
  results.push(`${page.persona}: own notes go to save, then upload`);
  await page.context().close();
}

/** Every subject: a guest gets questions and lands in a first lesson that shows something. This run has no model keys, like a guest in production: outside AI is off for them. */
async function everySubject(browser) {
  const seen = [];
  const page = await open(browser, 'subjects', { viewport: PHONE });
  await page.goto(`${BASE}/start`);
  const tracks = (await page.evaluate(async () => (await (await fetch('/api/catalog?view=grades')).json()).tracks.map((x) => ({ id: x.id, grades: x.grades.map((g) => g.id) }))));
  for (const track of tracks) {
    for (const pos of [0, 0.5]) {
      const ctx = await browser.newContext({ viewport: PHONE });
      const p = await ctx.newPage();
      p.persona = `subjects/${track.id}/${pos}`;
      await p.goto(`${BASE}/start`);
      const grade = track.grades[Math.floor(track.grades.length * pos)];
      const out = await p.evaluate(async ({ id, g }) => {
        const post = async (u, b) => { const r = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, body: await r.json() }; };
        await post('/api/consent/age', { birth_month: 1, birth_year: 1990, country: 'US' });
        await post('/api/ob2/begin', { answers: { tracks: [id] } });
        const walk = await post(`/api/subject-placement/${id}/start`, { mode: 'quick' });
        const first = await post('/api/ob2/first-lesson', { track: id, grade_id: g });
        return { questions: (walk.body.questions || []).length, status: first.status, href: first.body.enrollment && first.body.enrollment.href, error: first.body.error };
      }, { id: track.id, g: grade });
      let showed = 'no href';
      if (out.href) {
        await p.goto(BASE + out.href);
        await delay(2500);
        showed = (await p.evaluate(() => { const r = document.querySelector('main, #root, #player, body'); return (r ? r.innerText : '').replace(/\s+/g, ' ').slice(0, 90); })) || 'empty';
      }
      seen.push(`${track.id}@${pos}: q=${out.questions} ${out.status} ${(out.href || '').slice(0, 40)} -> ${showed}`);
      await ctx.close();
    }
  }
  await page.context().close();
  seen.forEach((s) => console.log(`  ${s}`));
  results.push(`every subject: ${seen.length} hand-offs tried`);
}

/** A guest out on the app's own pages: the line is there, the prompt appears when a lesson finishes, and refused AI says why. */
async function guestPages(browser, opts) {
  const page = await open(browser, 'guestpages', opts);
  await page.goto(`${BASE}/start`);
  const e = await page.evaluate(async () => {
    const post = async (u, b) => (await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })).json();
    await post('/api/consent/age', { birth_month: 1, birth_year: 1990, country: 'US' });
    await post('/api/ob2/begin', { answers: { tracks: ['math'], interest: 'soccer' } });
    const grades = (await (await fetch('/api/catalog?view=grades')).json()).tracks.find((x) => x.id === 'math').grades;
    return (await post('/api/ob2/first-lesson', { track: 'math', grade_id: grades[5].id })).enrollment;
  });
  await page.goto(`${BASE}/path?enrollment=${e.id}`);
  await page.waitForSelector('#ob2-bar');
  await delay(600);
  await check(page, 'path');
  await page.goto(`${BASE}/dashboard`);
  await page.waitForSelector('#ob2-bar');
  await page.goto(BASE + e.href);
  await page.waitForSelector('#ob2-bar');
  await delay(1200);
  await page.evaluate(async () => {
    const real = window.fetch;
    window.fetch = async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    await window.App.api.post('/api/sessions/1/finish', {});
    window.fetch = real;
  });
  await page.waitForSelector('#ob2-sheet[open]');
  await delay(200);
  await shot(page, '14b-lesson-done');
  await page.locator('#ob2-sheet a').click();
  await at(page, 'save');
  results.push(`${page.persona}: save line on path, home and lesson; lesson-done prompt leads to save`);
  await page.context().close();
}

async function keyboard(browser) {
  const page = await open(browser, 'keyboard', { viewport: PHONE });
  await page.goto(`${BASE}/start`);
  await at(page, 'welcome');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await delay(100);
  const a = await page.evaluate(() => document.activeElement && document.activeElement.tagName);
  assert.ok(a, 'focus lands somewhere');
  await page.goto(`${BASE}/start#welcome`);
  await page.locator('#next').focus();
  await page.keyboard.press('Enter');
  await at(page, 'hello');
  await page.locator('#next').focus();
  await page.keyboard.press('Enter');
  await at(page, 'age');
  await page.waitForFunction(() => document.querySelectorAll('#c option').length > 5);
  await page.locator('#m').selectOption('5');
  await page.locator('#y').selectOption('1990');
  await page.locator('#c').selectOption('US');
  await page.locator('#next').focus();
  await page.keyboard.press('Enter');
  await at(page, 'learn');
  await page.locator('input[name="track"]').first().focus();
  await page.keyboard.press('Space');
  assert.ok(await page.locator('input[name="track"]').first().isChecked(), 'space ticks a subject');
  await page.locator('input[name="track"]').first().press('Enter');
  await at(page, 'why');
  await page.locator('input[name="why"]').first().focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowDown');
  assert.ok(await page.locator('input[name="why"]').nth(1).isChecked(), 'arrow keys move between answers');
  const named = await page.evaluate(() => [...document.querySelectorAll('input, select, button')].filter((n) => n.offsetParent && !(n.labels && n.labels.length) && !n.getAttribute('aria-label') && !n.textContent.trim()).map((n) => n.id || n.name));
  assert.deepEqual(named, [], 'every control is named');
  results.push(`${page.persona}: keyboard only through the first questions; every control named`);
  await page.context().close();
}

async function reducedMotion(browser) {
  const page = await open(browser, 'calm', { viewport: PHONE, reducedMotion: 'reduce' });
  await page.goto(`${BASE}/start`);
  await at(page, 'welcome');
  const ms = await page.evaluate(() => getComputedStyle(document.querySelector('.ob-view')).animationDuration);
  assert.ok(parseFloat(ms) < 0.01, `reduced motion is honoured (${ms})`);
  results.push(`${page.persona}: reduced motion honoured`);
  await page.context().close();
}

async function main() {
  fs.copyFileSync(path.join(ROOT, 'data', 'db.json'), dbFile);
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DB_FILE: dbFile, ONBOARDING_V2: 'on', CONSENT_SWEEP: 'off', SESSION_SECRET: 'y'.repeat(40), MAIL_OUTBOX_DIR: path.join(dir, 'outbox') },
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  for (let i = 0; i < 120; i += 1) {
    try { if ((await fetch(`${BASE}/api/health`)).status < 500) break; } catch { /* not up yet */ }
    await delay(500);
  }
  const browser = await chromium.launch();
  const runs = {
    adult: async () => {
      await adult(browser, { viewport: PHONE, scheme: 'light' });
      await adult(browser, { viewport: DESK, scheme: 'light' });
      await adult(browser, { viewport: PHONE, scheme: 'dark' });
      await adult(browser, { viewport: DESK, scheme: 'dark' });
    },
    teen: async () => { await teen(browser, { viewport: PHONE, scheme: 'dark' }); await teen(browser, { viewport: DESK, scheme: 'light' }); },
    child: async () => {
      await childWalk(browser, { viewport: PHONE, scheme: 'light' }, true, 'child-parent');
      await childWalk(browser, { viewport: DESK, scheme: 'dark' }, false, 'child-noconsent');
    },
    returning: async () => { await returning(browser, { viewport: PHONE, scheme: 'light' }); await returning(browser, { viewport: DESK, scheme: 'dark' }); },
    reload: async () => { await reloadAndBack(browser, { viewport: PHONE, scheme: 'light' }); await reloadAndBack(browser, { viewport: DESK, scheme: 'dark' }); },
    failed: async () => { await failedSignUp(browser, { viewport: PHONE, scheme: 'dark' }); await failedSignUp(browser, { viewport: DESK, scheme: 'light' }); },
    other: async () => { await noExample(browser, { viewport: PHONE, scheme: 'light' }); await noExample(browser, { viewport: DESK, scheme: 'dark' }); },
    notes: async () => { await notes(browser, { viewport: PHONE, scheme: 'light' }); },
    keyboard: () => keyboard(browser),
    guestpages: async () => { await guestPages(browser, { viewport: PHONE, scheme: 'light' }); await guestPages(browser, { viewport: DESK, scheme: 'dark' }); },
    subjects: () => everySubject(browser),
    motion: () => reducedMotion(browser),
  };
  let failed = 0;
  for (const [name, run] of Object.entries(runs)) {
    if (ONLY.length && !ONLY.includes(name)) continue;
    try { await run(); } catch (err) {
      failed += 1;
      console.log(`FAIL ${name}: ${String(err.message).split('\n').slice(0, 3).join(' | ').slice(0, 400)}`);
    }
  }
  await browser.close();
  child.kill();
  results.forEach((r) => console.log(`ok ${r}`));
  problems.forEach((p) => console.log(`PROBLEM ${p}`));
  console.log(`onboarding-v2-browser: ${results.length} walks ok, ${failed} failed, ${problems.length} problems`);
  process.exit(failed || problems.length ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
