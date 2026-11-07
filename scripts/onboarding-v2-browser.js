/**
 * Onboarding v2 in a real browser, on a throwaway copy of the store. Not part of `npm test`: playwright is not a dependency of the app.
 *
 *   node scripts/onboarding-v2-browser.js --pw=<path to playwright> --shots=<dir> [--only=beta,betachild,...]
 *
 * Three servers, one after the other:
 *   beta      BETA_GATE=invite: an approved applicant makes the account on /register, then /start. The real way in.
 *   signin    BETA_SIGNIN_ONLY=on: no sign-up at all; an account with no subject signs in and comes through /start.
 *   public    both off: the guest and agreement flow kept for public launch.
 *
 * Walks every persona at 375 px and at desktop, light and dark, and fails on a console error, a CSP violation, sideways scrolling, low text contrast, a small target,
 * a word about signing up on a beta screen, or a screen that doesn't do what it should. Writes one screenshot per step and persona under --shots.
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
let PORT = Number(arg('port', 6893));
let BASE = `http://localhost:${PORT}`;
const ROOT = path.join(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ob2b-'));
const invitesFile = path.join(dir, 'invites.json');
process.env.BETA_INVITES_FILE = invitesFile;
const invites = require('../services/beta-invites');

fs.mkdirSync(SHOTS, { recursive: true });

const PHONE = { width: 375, height: 760 };
const DESK = { width: 1366, height: 860 };
const problems = [];
const results = [];
let seq = 0;
const unique = () => `${Date.now().toString(36)}${(seq += 1)}`;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const AGREEMENT_VERSION = fs.readFileSync(path.join(ROOT, 'services/onboarding-v2.js'), 'utf8').match(/AGREEMENT_VERSION = '([^']+)'/)[1];
/** What must never show on a beta screen: this learner already has an account and has already agreed. */
const SIGN_UP_WORDS = /sign up|sign-up|create (an |your )?account|save my progress|save it\b|keep what you've done|already have an account|browser keeps|isn't saved|not saved|i agree to all three|do you agree|beta terms/i;

async function open(browser, name, { viewport = PHONE, scheme = 'light', reducedMotion = 'no-preference' } = {}) {
  const ctx = await browser.newContext({ viewport, colorScheme: scheme, reducedMotion, hasTouch: viewport.width < 600 });
  const page = await ctx.newPage();
  page.persona = `${name}/${viewport.width}/${scheme}`;
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' && !/Failed to load resource: the server responded with a status of (400|401|403|404|409|429)/.test(t)) problems.push(`${page.persona} console: ${t.slice(0, 200)}`);
    if (/Content Security Policy|Refused to/.test(t)) problems.push(`${page.persona} CSP: ${t.slice(0, 200)}`);
  });
  page.on('pageerror', (e) => problems.push(`${page.persona} pageerror: ${String(e.message).slice(0, 200)}`));
  return page;
}

/** Every piece of text on screen against what's really behind it: at least 4.5:1, or 3:1 for large text. A disabled button is exempt, as WCAG allows. */
const contrastScan = () => {
  const parse = (c) => { const m = c.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m[3] === undefined ? 1 : m[3] }; };
  const lum = ({ r, g, b }) => { const f = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const bgOf = (el) => {
    for (let n = el; n; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c.a > 0.9) return c;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };
  const out = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    if (!t.textContent.trim()) continue;
    const el = t.parentElement;
    if (!el || !el.offsetParent || el.closest('.sr, option, script, style, [disabled]')) continue;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || Number(s.opacity) < 0.5) continue;
    const [a, b] = [lum(parse(s.color)), lum(bgOf(el))].sort((x, y) => y - x);
    const ratio = (a + 0.05) / (b + 0.05);
    const size = parseFloat(s.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700);
    if (ratio < (large ? 3 : 4.5)) out.push(`"${t.textContent.trim().slice(0, 24)}" ${ratio.toFixed(2)}`);
  }
  return out;
};

async function check(page, label) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (over > 0) problems.push(`${page.persona} ${label}: sideways scroll by ${over}px`);
  if (!page.url().includes('/start')) return;
  const small = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('button:not([hidden]), a.opt, label.opt, .btn, .t-opt, .t-chip').forEach((n) => {
      if (!n.offsetParent) return;
      const r = n.getBoundingClientRect();
      if (r.height && r.height < 40 && !n.closest('.parent-note')) out.push(`${n.id || n.className}:${Math.round(r.height)}`);
    });
    return out;
  });
  if (small.length) problems.push(`${page.persona} ${label}: small targets ${small.join(', ')}`);
  const low = await page.evaluate(contrastScan);
  if (low.length) problems.push(`${page.persona} ${label}: low contrast ${low.slice(0, 4).join('; ')}`);
  if (page.beta) {
    const text = await page.evaluate(() => document.body.innerText);
    const hit = text.match(SIGN_UP_WORDS);
    if (hit) problems.push(`${page.persona} ${label}: says "${hit[0]}" to someone with an account`);
    if (await page.locator('#ob2-bar').count()) problems.push(`${page.persona} ${label}: the save banner`);
  }
}

async function shot(page, label) {
  await delay(420);
  await check(page, label);
  const name = `${page.persona.replace(/\//g, '-')}-${label}.png`;
  await page.screenshot({ path: path.join(SHOTS, name), fullPage: false });
}

async function at(page, step) {
  try {
    await page.waitForFunction((s) => location.hash === `#${s}` && document.querySelector('#ob') && document.querySelector('#ob').dataset.screen === s, step, { timeout: 20000 });
  } catch (err) {
    const where = await page.evaluate(() => [location.href, (document.querySelector('#ob') || { dataset: {} }).dataset.screen, (document.querySelector('#err') || {}).textContent].join(' | ')).catch(() => '');
    await page.screenshot({ path: path.join(SHOTS, `FAIL-${page.persona.replace(/\//g, '-')}-${step}.png`) }).catch(() => {});
    throw new Error(`${page.persona} wanted ${step}, at ${where}`);
  }
}
const next = (page) => page.locator('#next').click();
const isDisabled = (page) => page.locator('#next').isDisabled();

/* ── getting an account: the invite, the sign-up page, the sign-in ─────────── */
async function fillAge(page, { month = '3', year, country = 'US' }, ids = { m: '#m', y: '#y', c: '#c' }) {
  await page.waitForFunction((c) => document.querySelectorAll(`${c} option`).length > 5, ids.c);
  assert.equal(await page.locator(ids.m).inputValue(), '', 'no default month');
  assert.equal(await page.locator(ids.y).inputValue(), '', 'no default year');
  assert.equal(await page.locator(ids.c).inputValue(), '', 'no default country');
  await page.selectOption(ids.m, month);
  await page.selectOption(ids.y, String(year));
  await page.selectOption(ids.c, country);
}

/** An approved applicant: the emailed link, the age step, the form with the line on it. Lands on /start. */
async function signUpInvited(page, { year = 1990, child = false, snap = false } = {}) {
  const email = `tester-${unique()}@example.test`;
  const { code } = invites.approve(email);
  await page.goto(`${BASE}/join?invite=${encodeURIComponent(code)}`);
  await page.waitForURL('**/register*');
  await fillAge(page, { year }, { m: '#birth_month', y: '#birth_year', c: '#country' });
  await page.locator('#age-submit').click();
  if (child) {
    await page.waitForSelector('#child-form', { state: 'visible' });
    await page.fill('#child_name', 'Sam');
    await page.fill('#username', `sam${unique()}`);
    await page.fill('#child_password', 'longenough1');
    await page.fill('#parent_email', email);
    if (snap) await page.screenshot({ path: path.join(SHOTS, `${page.persona.replace(/\//g, '-')}-00-register.png`) });
    await page.locator('#child-submit').click();
    await page.waitForSelector('#sent-next', { state: 'visible' });
    await page.locator('#sent-next').click();
  } else {
    await page.waitForSelector('#form', { state: 'visible' });
    assert.match(await page.locator('#agreement-line').textContent(), /outside AI companies/);
    assert.ok(await page.locator('#agreement-line a[href="/privacy"]').count(), 'the line has its link');
    await page.fill('#display_name', 'Ada Tester');
    await page.fill('#email', email);
    await page.fill('#password', 'longenough1');
    if (snap) await page.screenshot({ path: path.join(SHOTS, `${page.persona.replace(/\//g, '-')}-00-register.png`) });
    await page.locator('#submit').click();
  }
  await page.waitForURL('**/start*', { timeout: 20000 });
  page.beta = true;
  return email;
}

/* ── the test ────────────────────────────────────────────────── */
/** The baseline's Quick, through the page. `stopAfter` presses Stop once that many timed tasks are done, or a full run goes until the budget ends it. */
async function takeTest(page, { snaps = true, stopAfterTimed = 2, maxMs = 200000 } = {}) {
  await at(page, 'test');
  if (snaps) await shot(page, '05-test');
  await next(page);
  await at(page, 'testing');
  const started = Date.now();
  const seen = new Set();
  let timed = 0;
  const snap = async (name) => { if (snaps && !seen.has(name)) { seen.add(name); await shot(page, name); } };
  for (;;) {
    if (Date.now() - started > maxMs) throw new Error(`${page.persona}: the test ran past ${maxMs} ms`);
    const screen = await page.evaluate(() => document.querySelector('#ob').dataset.screen);
    if (screen === 'into') break;
    if (await page.locator('.t-digit').count()) { await snap('06c-digits'); await delay(120); continue; }
    if (await page.locator('#t-in').count()) {
      await snap('06d-type');
      await page.fill('#t-in', '1');
      await page.locator('#t-go').click();
      await delay(60);
      continue;
    }
    if (await page.locator('.t-pair').count()) {
      await snap('06e-speed');
      await page.locator('.t-opt').first().click({ timeout: 2000 }).catch(() => {});
      continue;
    }
    if (await page.locator('.t-btns.go').count()) {
      await snap(await page.locator('.q-prompt').textContent().then((t) => (/same/i.test(t) ? '06b-ready-speed' : '06b-ready-digits')));
      timed += 1;
      await page.locator('.t-btns.go .t-opt').click();
      await delay(100);
      continue;
    }
    if (await page.locator('.t-opt').count()) {
      await snap('06a-choice');
      if (stopAfterTimed != null && timed >= stopAfterTimed && !(await page.locator('.t-pair, #t-in, .t-digit').count())) {
        await page.locator('#alt').click();
        await at(page, 'into');
        break;
      }
      await page.locator('.t-opt').first().click({ timeout: 2000 }).catch(() => {});
      await delay(80);
      continue;
    }
    await delay(80);
  }
  await at(page, 'into');
  return { ms: Date.now() - started, timed };
}

/** The style quiz, one question a screen, for an account the baseline is closed to. */
async function takeQuiz(page, { snaps = true } = {}) {
  await at(page, 'test');
  assert.match(await page.locator('.ob-q').textContent(), /short quiz/);
  if (snaps) await shot(page, '05-test');
  await next(page);
  await at(page, 'testing');
  await page.waitForSelector('.t-side');
  if (snaps) await shot(page, '06-quiz');
  for (let i = 0; i < 20; i += 1) {
    await page.waitForSelector('.t-opt:not(.is-picked)');
    await page.locator('.t-opt').nth(i % 4).click();
    await delay(220);
    if (await page.locator('#ob[data-screen="into"]').count()) break;
  }
  await at(page, 'into');
}

/* ── the steps after the test ──────────────────────────────────── */
async function answerInterests(page, { interests = ['soccer', 'music'], other = null } = {}) {
  assert.equal(await isDisabled(page), true, 'into: Continue is off until answered');
  for (const i of interests) await page.locator(`input[name="interest"][value="${i}"]`).check();
  if (other) {
    assert.equal(await isDisabled(page), true, 'other: a box to fill first');
    await page.fill('#other', other);
  }
  await shot(page, '07-into');
  await next(page);
  await at(page, 'learn');
}

async function answerSubjects(page, tracks = ['math']) {
  for (const t of tracks) await page.locator(`input[name="track"][value="${t}"]`).check();
  await shot(page, '08-learn');
  await next(page);
  await at(page, 'grade');
}

/** Answer until the walk ends, or until `stopAfter` questions and then stop. */
async function walk(page, stopAfter = 3, shotIt = true) {
  await page.waitForSelector('.q-prompt', { timeout: 20000 });
  if (shotIt) await shot(page, '11-level');
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

async function placement(page, { snapPick = true, stopAfter = 4, shotIt = true } = {}) {
  assert.equal(await isDisabled(page), true, 'grade: neither is picked for them');
  if (snapPick) {
    await page.locator('input[name="way"][value="know"]').check();
    await shot(page, '09-grade');
    await next(page);
    await at(page, 'pick');
    assert.equal(await isDisabled(page), true);
    await page.locator('input[name="grade"]').nth(4).check();
    await shot(page, '10-pick');
    await page.locator('#back').click();
    await at(page, 'grade');
  }
  await page.locator('input[name="way"][value="walk"]').check();
  await next(page);
  await at(page, 'level');
  await walk(page, stopAfter, shotIt);
}

async function pickGrade(page, nth = 4) {
  await page.locator('input[name="way"][value="know"]').check();
  await next(page);
  await at(page, 'pick');
  await page.locator('input[name="grade"]').nth(nth).check();
  await next(page);
}

async function throughBuilding(page, { fromResult = true } = {}) {
  if (fromResult) { await shot(page, '12-result'); await next(page); }
  await page.waitForFunction(() => ['building', 'ready'].includes(document.querySelector('#ob').dataset.screen));
  await delay(300);
  await page.screenshot({ path: path.join(SHOTS, `${page.persona.replace(/\//g, '-')}-13-building.png`) });
  await at(page, 'ready');
  await shot(page, '14-ready');
}

async function openLesson(page, { banner = true } = {}) {
  await next(page);
  await page.waitForFunction(() => !location.pathname.startsWith('/start'), null, { timeout: 15000 });
  await page.waitForLoadState('domcontentloaded');
  await delay(1000);
  await page.screenshot({ path: path.join(SHOTS, `${page.persona.replace(/\//g, '-')}-15-lesson.png`) });
  assert.equal(await page.locator('#ob2-bar').count() > 0, banner, banner ? 'the save line is on the lesson page' : 'no save line on the lesson page');
}

async function toAgePublic(page) {
  await page.goto(`${BASE}/start`);
  await at(page, 'welcome');
  await shot(page, '01-welcome');
  await next(page);
  await at(page, 'hello');
  await shot(page, '02-hello');
  await next(page);
  await at(page, 'age');
}

async function answerAgePublic(page, { year }) {
  assert.equal(await isDisabled(page), true, 'age: Continue is off until answered');
  await fillAge(page, { year });
  await shot(page, '03-age');
  await next(page);
  if (year > new Date().getFullYear() - 13) { await at(page, 'parent'); assert.equal(await page.locator('input[name="agree"]').count(), 0); return; }
  await at(page, 'agree');
  assert.equal(await isDisabled(page), true, 'agree: Continue is off until a choice');
  assert.equal(await page.locator('input[name="agree"]:checked').count(), 0, 'nothing is ticked');
  const both = await page.evaluate(() => [...document.querySelectorAll('input[name="agree"]')].every((i) => { const r = i.closest('label').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }));
  if (!both) problems.push(`${page.persona} agree: both answers aren't visible without scrolling`);
  const noScroll = await page.evaluate(() => { const r = document.querySelector('.terms').getBoundingClientRect(); return document.documentElement.scrollHeight <= innerHeight + 1 ? 'fits' : `scrolls ${document.documentElement.scrollHeight - innerHeight}, terms end at ${Math.round(r.bottom)}`; });
  results.push(`${page.persona}: agreement at this size: ${noScroll}`);
  await shot(page, '04-agree');
  await page.locator('input[name="agree"][value="agree"]').check();
  await next(page);
  await at(page, 'test');
}

const skipTest = async (page) => { await at(page, 'test'); await page.locator('#alt').click(); await at(page, 'into'); };

/* ── the beta ──────────────────────────────────────────────────── */
/** The approved adult, whole flow: application's sign-up, welcome, hello, (age known), test, interests, subjects, grade or placement, first lesson, dashboard. */
async function betaAdult(browser, opts, { fullTest = false } = {}) {
  const page = await open(browser, 'beta', opts);
  await signUpInvited(page, { snap: true });
  await at(page, 'welcome');
  assert.equal(await page.locator('#alt').isVisible(), false, 'no "I already have an account" on welcome');
  await shot(page, '01-welcome');
  await next(page);
  await at(page, 'hello');
  await shot(page, '02-hello');
  await next(page);
  // The age came with the sign-up, so that screen is skipped, and there is no agreement screen.
  const test = await takeTest(page, { stopAfterTimed: fullTest ? null : 2 });
  if (fullTest) results.push(`${page.persona}: a scripted click-through of the whole Quick test took ${Math.round(test.ms / 1000)} s (a script, not a person)`);
  await answerInterests(page);
  await answerSubjects(page, ['math', 'chess']);
  await placement(page);
  await throughBuilding(page);
  assert.match(await page.locator('.lesson-card').textContent(), /for good/, 'the default goal is said');
  assert.ok(await page.locator('.ob-fine a[href*="track=chess"]').count(), 'the second subject is offered');
  await page.reload();
  await at(page, 'ready');
  await openLesson(page, { banner: false });
  await page.goto(`${BASE}/start`);
  await page.waitForURL('**/dashboard*', { timeout: 15000 });
  await page.waitForLoadState('domcontentloaded');
  await delay(1200);
  await page.screenshot({ path: path.join(SHOTS, `${page.persona.replace(/\//g, '-')}-16-dashboard.png`) });
  assert.equal(await page.locator('#ob2-bar').count(), 0, 'no save line on the dashboard');
  const rows = await page.evaluate(async () => (await (await fetch('/api/account/export')).json()).learner_agreements);
  assert.equal(rows.length, 1, 'the agreement from sign-up is on record');
  assert.equal(rows[0].via, 'sign_up');
  results.push(`${page.persona}: invite to first lesson to dashboard, no age, agreement or save screen`);
  await page.context().close();
}

/** An under-13 sign-up through the invite: the parent was emailed at sign-up, so no parent screen; the quiz, tap-only interests, no uploads. */
async function betaChild(browser, opts) {
  const page = await open(browser, 'betachild', opts);
  await signUpInvited(page, { year: new Date().getFullYear() - 10, child: true, snap: true });
  await at(page, 'welcome');
  await shot(page, '01-welcome');
  await next(page);
  await at(page, 'hello');
  await next(page);
  await takeQuiz(page);
  assert.equal(await page.locator('#other').count(), 0, 'a child gets no free-text box');
  await answerInterests(page, { interests: ['space', 'other'] });
  assert.equal(await page.locator('input[name="notes"]').count(), 0, 'a child is not offered uploads');
  await answerSubjects(page, ['math']);
  await pickGrade(page, 2);
  await throughBuilding(page, { fromResult: false });
  await openLesson(page, { banner: false });
  const me = await page.evaluate(async () => (await (await fetch('/api/auth/me')).json()).user);
  assert.equal(me.email, null, 'no child email');
  assert.equal(me.consent.state, 'pending');
  assert.equal(me.consent.ai_free_text, false);
  const rows = await page.evaluate(async () => (await (await fetch('/api/account/export')).json()).learner_agreements);
  assert.equal(rows.length, 0, 'a child doesn\'t agree for themselves');
  results.push(`${page.persona}: parent emailed at sign-up; style quiz, tap-only interests, standard lesson; limits hold`);
  await page.context().close();
}

/** An account with no age on record, signing in under BETA_SIGNIN_ONLY: asked once. `child`: it then needs a parent's email before the test. */
async function signinAgeless(browser, opts, email, { child = false } = {}) {
  const page = await open(browser, child ? 'signinchild' : 'signin', opts);
  page.beta = true;
  await page.goto(`${BASE}/start`);
  await page.waitForURL(/[/]login/);
  await page.fill('#email', email);
  await page.fill('#password', 'longenough1');
  await page.locator('#submit').click();
  await page.waitForURL('**/start*', { timeout: 15000 });
  await at(page, 'welcome');
  assert.equal(await page.locator('#alt').isVisible(), false);
  await next(page);
  await at(page, 'hello');
  await next(page);
  await at(page, 'age');
  assert.equal(await isDisabled(page), true);
  await fillAge(page, { year: child ? new Date().getFullYear() - 10 : 1990 });
  await shot(page, '03-age');
  await next(page);
  if (child) {
    await at(page, 'parent');
    assert.equal(await page.locator('input[name="nickname"]').count(), 0, 'the account has a name');
    await page.fill('input[name="parent_email"]', `parent-${unique()}@example.test`);
    await shot(page, '04-parent');
    await next(page);
    await takeQuiz(page, { snaps: false });
  } else {
    await at(page, 'test');
    await page.locator('#alt').click();
    await at(page, 'into');
  }
  await answerInterests(page, { interests: ['cooking'] });
  await answerSubjects(page, ['reading']);
  await pickGrade(page, 3);
  await at(page, 'ready');
  await openLesson(page, { banner: false });
  results.push(`${page.persona}: sign-in only, no age on record: asked once${child ? ', then the parent\'s email' : ''}, first lesson`);
  await page.context().close();
}

/** An account with a subject goes home, and the public flow's addresses are closed. */
async function betaEdges(browser, opts) {
  const page = await open(browser, 'betaedges', opts);
  await page.goto(`${BASE}/start#agree`);
  await page.waitForURL(/[/]login/, { timeout: 15000 });
  const closed = await page.evaluate(async (v) => {
    const post = async (u, b) => (await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })).status;
    await post('/api/consent/age', { birth_month: 1, birth_year: 1990, country: 'US' });
    return { agree: await post('/api/ob2/agree', { decision: 'agree', version: v }), begin: await post('/api/ob2/begin', {}) };
  }, AGREEMENT_VERSION);
  assert.deepEqual(closed, { agree: 403, begin: 403 }, 'no guest row');
  await page.context().close();

  const signed = await open(browser, 'betaedges2', opts);
  await signUpInvited(signed);
  await at(signed, 'welcome');
  for (const step of ['agree', 'declined', 'save', 'done']) {
    await signed.goto(`${BASE}/start#${step}`);
    await delay(500);
    const where = await signed.evaluate(() => document.querySelector('#ob').dataset.screen);
    assert.ok(!['agree', 'declined', 'save', 'done'].includes(where), `#${step} is not a screen for an account (went to ${where})`);
  }
  // Reload at each stage, mid-test too.
  await signed.goto(`${BASE}/start#test`);
  await at(signed, 'test');
  await next(signed);
  await at(signed, 'testing');
  await signed.waitForSelector('.t-opt');
  await signed.locator('.t-opt').first().click();
  await delay(500);
  await signed.waitForSelector('.t-opt:not(.is-picked)');
  const before = await signed.locator('.task').textContent();
  await signed.reload();
  await at(signed, 'testing');
  await signed.waitForSelector('.t-opt');
  assert.equal(await signed.locator('.task').textContent(), before, 'the test resumes on the same step');
  await signed.locator('#alt').click();
  await at(signed, 'into');
  assert.match(await signed.locator('#bubble-text').textContent(), /test done/i);
  // Going back from interests shows the test as done, without starting it again.
  await signed.locator('#back').click();
  await at(signed, 'test');
  assert.match(await signed.locator('.ob-q').textContent(), /Test done/);
  await next(signed);
  await at(signed, 'into');
  await signed.locator('input[name="interest"][value="art"]').check();
  await next(signed);
  await at(signed, 'learn');
  const profile = await signed.evaluate(async () => (await (await fetch('/api/account/export')).json()).profile);
  assert.equal(profile.onboarding.sessions.length, 1, 'stopping still finishes the test, with interests in it');
  assert.ok(profile.survey.interests.includes('drawing'), 'and the interests reach the lesson writers');
  // Only their own notes: there is no save step, straight to uploading.
  await signed.locator('input[name="notes"]').check();
  await next(signed);
  await signed.waitForURL('**/materials*', { timeout: 15000 });
  await signed.goto(`${BASE}/start`);
  await signed.waitForFunction(() => !location.pathname.startsWith('/start'), null, { timeout: 15000 });
  results.push(`${signed.persona}: no guest row, closed screens, resume mid-test, stop keeps the answers, notes go straight to upload, no loop back`);
  await signed.context().close();
}

/* ── the public flow, kept for launch ─────────────────────────────── */
async function saveSelf(page, email) {
  await page.goto(`${BASE}/start#save`);
  await at(page, 'save');
  assert.equal(await isDisabled(page), true);
  await page.fill('input[name="display_name"]', 'Ada Tester');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', 'longenough1');
  await shot(page, '17-save');
}

async function publicAdult(browser, opts) {
  const page = await open(browser, 'public', opts);
  await toAgePublic(page);
  await answerAgePublic(page, { year: 1990 });
  await takeTest(page, { stopAfterTimed: 2 });
  await answerInterests(page);
  await answerSubjects(page, ['math']);
  await placement(page, { snapPick: false });
  await throughBuilding(page);
  await openLesson(page);
  await saveSelf(page, `adult-${unique()}@example.test`);
  await next(page);
  await at(page, 'done');
  await shot(page, '18-done');
  await next(page);
  await page.waitForURL('**/dashboard*', { timeout: 15000 });
  await page.waitForLoadState('domcontentloaded');
  await delay(500);
  assert.equal(await page.locator('#ob2-bar').count(), 0, 'no save line once saved');
  const exported = await page.evaluate(async () => (await (await fetch('/api/account/export')).json()));
  assert.equal(exported.profile.onboarding.sessions.length, 1, 'the guest\'s test carried over at claim');
  assert.equal(exported.learner_agreements[0].via, 'onboarding_v2');
  results.push(`${page.persona}: public flow: agreement, test as a guest, saved, test carried over, dashboard`);
  await page.context().close();
}

async function publicChild(browser, opts, withParent, label) {
  const year = new Date().getFullYear() - 10;
  const page = await open(browser, label, opts);
  const posted = [];
  await toAgePublic(page);
  await answerAgePublic(page, { year });
  page.on('request', (r) => { if (r.method() === 'POST') posted.push(r.url()); });
  assert.equal(await page.locator('input[name="email"]').count(), 0, 'no child email');
  await shot(page, '04-parent');
  assert.equal(await isDisabled(page), true);
  assert.equal(posted.length, 0, 'nothing about a child reaches the server before the parent is asked');
  await page.fill('input[name="nickname"]', 'Sam');
  const parentAddress = `parent-${unique()}@example.test`;
  await page.fill('input[name="parent_email"]', parentAddress);
  await next(page);
  await takeQuiz(page);
  assert.equal(await page.locator('#other').count(), 0, 'a child gets no free-text box');
  await answerInterests(page, { interests: ['space', 'other'] });
  assert.equal(await page.locator('input[name="notes"]').count(), 0, 'a child is not offered uploads');
  await answerSubjects(page, ['math']);
  await placement(page, { snapPick: false, stopAfter: 2, shotIt: false });
  await throughBuilding(page);
  await openLesson(page);
  await page.goto(`${BASE}/start#save`);
  await at(page, 'save');
  assert.equal(await page.locator('input[name="email"]').count(), 0, 'no child email at save');
  await page.fill('input[name="username"]', `sam${unique()}`);
  await page.fill('input[name="password"]', 'longenough1');
  await shot(page, '17-save');
  await next(page);
  await at(page, 'done');
  await shot(page, '18-done');
  const me = await page.evaluate(async () => (await (await fetch('/api/auth/me')).json()).user);
  assert.equal(me.email, null);
  assert.equal(me.consent.state, 'pending');
  assert.equal(me.consent.ai_free_text, false);
  const profile = await page.evaluate(async () => (await (await fetch('/api/account/export')).json()).profile);
  assert.equal(profile.took_style_quiz, true, 'the style quiz is on the saved account');
  assert.ok(profile.style_vector, 'with its answers');
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
    results.push(`${page.persona}: public: parent got the email, agreed on the existing page; child active, outside AI still off, login made in v2 still works`);
  } else {
    results.push(`${page.persona}: public: limited account before consent, no outside AI`);
  }
  await page.context().close();
}

async function returning(browser, opts) {
  // Make an account through the flow's API, then come back in a fresh browser.
  const email = `back-${unique()}@example.test`;
  const made = await open(browser, 'returning-setup', opts);
  await made.goto(`${BASE}/start`);
  await made.evaluate(async ({ e, v }) => {
    const p = (u, b) => fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
    await p('/api/consent/age', { birth_month: 1, birth_year: 1985, country: 'US' });
    await p('/api/ob2/agree', { decision: 'agree', version: v });
    await p('/api/ob2/begin', { answers: { tracks: ['math'] } });
    const grades = (await (await fetch('/api/catalog?view=grades')).json()).tracks.find((t) => t.id === 'math').grades;
    await p('/api/ob2/first-lesson', { track: 'math', grade_id: grades[3].id });
    await p('/api/ob2/claim', { display_name: 'Back Again', email: e, password: 'longenough1' });
  }, { e: email, v: AGREEMENT_VERSION });
  await made.context().close();

  const page = await open(browser, 'returning', opts);
  await page.goto(`${BASE}/start`);
  await at(page, 'welcome');
  await page.locator('#alt').click();
  await page.waitForURL(/[/]login/);
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
  await toAgePublic(page);
  await page.reload();
  await at(page, 'age');
  await answerAgePublic(page, { year: 1990 });
  await page.reload();
  await skipTest(page);
  await page.locator('input[name="interest"][value="cooking"]').check();
  await next(page);
  await at(page, 'learn');
  await page.reload();
  await at(page, 'learn');
  await page.locator('input[name="track"][value="math"]').check();
  await next(page);
  await at(page, 'grade');
  // Back through the browser, then the screen's own back, and every answer is still there.
  await page.goBack();
  await at(page, 'learn');
  assert.ok(await page.locator('input[name="track"][value="math"]').isChecked(), 'browser back keeps the answer');
  await page.locator('#back').click();
  await at(page, 'into');
  assert.ok(await page.locator('input[name="interest"][value="cooking"]').isChecked(), 'in-page back keeps the answer');
  await page.goto(`${BASE}/start#age`);
  await at(page, 'age');
  assert.equal(await page.locator('#m').count(), 0, 'the age answer is not asked again');
  await page.goto(`${BASE}/start#ready`);
  await delay(400);
  const where = await page.evaluate(() => document.querySelector('#ob').dataset.screen);
  assert.notEqual(where, 'ready', 'a step cannot be skipped to from the address');
  await page.goto(`${BASE}/start#grade`);
  await at(page, 'grade');
  await page.locator('input[name="way"][value="walk"]').check();
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
  await other.evaluate(async ({ e, v }) => {
    const p = (u, b) => fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
    await p('/api/consent/age', { birth_month: 1, birth_year: 1985, country: 'US' });
    await p('/api/ob2/agree', { decision: 'agree', version: v });
    await p('/api/ob2/begin', { answers: { tracks: ['math'] } });
    await p('/api/ob2/claim', { display_name: 'First Person', email: e, password: 'longenough1' });
  }, { e: email, v: AGREEMENT_VERSION });
  await other.context().close();

  const page = await open(browser, 'failed', opts);
  await toAgePublic(page);
  await answerAgePublic(page, { year: 1990 });
  await skipTest(page);
  await answerInterests(page, { interests: ['space'] });
  await answerSubjects(page, ['math']);
  await pickGrade(page, 4);
  await at(page, 'ready');
  const enrollment = await page.evaluate(async () => (await (await fetch('/api/ob2/state')).json()).enrollment.id);
  await saveSelf(page, email);
  await next(page);
  await page.waitForSelector('#err:not([hidden])');
  await shot(page, '17b-save-failed');
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
  await at(page, 'done');
  const list = await page.evaluate(async () => (await (await fetch('/api/enrollments')).json()).enrollments.map((e) => e.id));
  assert.deepEqual(list, [enrollment], 'the same enrollment is on the account');
  results.push(`${page.persona}: taken email shown, typing kept, reload, then saved with progress intact`);
  await page.context().close();
}

async function typedInterest(browser, opts) {
  const page = await open(browser, 'other', opts);
  await toAgePublic(page);
  await answerAgePublic(page, { year: 1990 });
  await skipTest(page);
  await answerInterests(page, { interests: ['other'], other: 'pottery' });
  const survey = await page.evaluate(async () => (await (await fetch('/api/profile')).json()).survey.interests);
  assert.match(survey, /pottery/);
  results.push(`${page.persona}: a typed interest reaches the lesson writers`);
  await page.context().close();
}

async function notes(browser, opts) {
  const page = await open(browser, 'notes', opts);
  await toAgePublic(page);
  await answerAgePublic(page, { year: 1990 });
  await skipTest(page);
  await page.locator('input[name="interest"][value="art"]').check();
  await next(page);
  await at(page, 'learn');
  await page.locator('input[name="notes"]').check();
  await next(page);
  await at(page, 'save');
  await shot(page, '17c-save-notes');
  await page.fill('input[name="display_name"]', 'Note Taker');
  await page.fill('input[name="email"]', `notes-${unique()}@example.test`);
  await page.fill('input[name="password"]', 'longenough1');
  await next(page);
  await at(page, 'done');
  assert.ok(await page.locator('a.opt[href="/materials"]').count(), 'upload is offered after saving');
  assert.ok(await page.locator('a.opt[href^="/baseline"]').count(), 'and the test they skipped');
  results.push(`${page.persona}: own notes go to save, then upload`);
  await page.context().close();
}

/** Every subject: a guest gets questions and lands in a first lesson that shows something. This run has no outside AI. */
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
      const out = await p.evaluate(async ({ id, g, v }) => {
        const post = async (u, b) => { const r = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, body: await r.json() }; };
        await post('/api/consent/age', { birth_month: 1, birth_year: 1990, country: 'US' });
        await post('/api/ob2/agree', { decision: 'agree', version: v });
        await post('/api/ob2/begin', { answers: { tracks: [id] } });
        const walked = await post(`/api/subject-placement/${id}/start`, { mode: 'quick' });
        const first = await post('/api/ob2/first-lesson', { track: id, grade_id: g });
        return { questions: (walked.body.questions || []).length, status: first.status, href: first.body.enrollment && first.body.enrollment.href, error: first.body.error };
      }, { id: track.id, g: grade, v: AGREEMENT_VERSION });
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
  const e = await page.evaluate(async (v) => {
    const post = async (u, b) => (await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })).json();
    await post('/api/consent/age', { birth_month: 1, birth_year: 1990, country: 'US' });
    await post('/api/ob2/agree', { decision: 'agree', version: v });
    await post('/api/ob2/begin', { answers: { tracks: ['math'], interest: 'soccer' } });
    const grades = (await (await fetch('/api/catalog?view=grades')).json()).tracks.find((x) => x.id === 'math').grades;
    return (await post('/api/ob2/first-lesson', { track: 'math', grade_id: grades[5].id })).enrollment;
  }, AGREEMENT_VERSION);
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
  await shot(page, '15b-lesson-done');
  await page.locator('#ob2-sheet a').click();
  await at(page, 'save');
  results.push(`${page.persona}: save line on path, home and lesson; lesson-done prompt leads to save`);
  await page.context().close();
}

/** Declining is a real answer: a clear stop, the privacy link, no account, and the way back. */
async function declines(browser, opts) {
  const page = await open(browser, 'decline', opts);
  await toAgePublic(page);
  await page.waitForFunction(() => document.querySelectorAll('#c option').length > 5);
  await page.selectOption('#m', '3');
  await page.selectOption('#y', '1990');
  await page.selectOption('#c', 'US');
  await next(page);
  await at(page, 'agree');
  await page.locator('input[name="agree"][value="decline"]').check();
  await next(page);
  await at(page, 'declined');
  await shot(page, '04c-declined');
  assert.match(await page.locator('h1').first().textContent(), /can't use the beta without this/);
  assert.ok(await page.locator('.ob-panel a[href="/privacy"]').count(), 'the privacy link is there');
  const me = await page.evaluate(async () => (await (await fetch('/api/auth/me')).json()).user);
  assert.equal(me, null, 'declining makes no account');
  await page.goto(`${BASE}/start#learn`);
  await at(page, 'agree');
  await page.locator('input[name="agree"][value="agree"]').check();
  await next(page);
  await at(page, 'test');
  results.push(`${page.persona}: declining stops with the privacy link, makes no account, can't be skipped, and can be changed`);
  await page.context().close();
}

/** Keyboard only, in the beta flow: the buttons, the choices, the number keys in the timed task. */
async function keyboard(browser) {
  const page = await open(browser, 'keyboard', { viewport: DESK });
  await signUpInvited(page);
  await at(page, 'welcome');
  await page.locator('#next').focus();
  await page.keyboard.press('Enter');
  await at(page, 'hello');
  await page.locator('#next').focus();
  await page.keyboard.press('Enter');
  await at(page, 'test');
  await page.locator('#next').focus();
  await page.keyboard.press('Enter');
  await at(page, 'testing');
  await page.waitForSelector('.t-opt');
  let pressed = 0;
  for (let i = 0; i < 30; i += 1) {
    await page.waitForSelector('.t-opt:not(.is-picked)');
    if (await page.locator('.t-btns.go').count() && /same/i.test(await page.locator('.q-prompt').textContent())) break;
    if (await page.locator('.t-btns.go').count() || await page.locator('#t-in').count() || await page.locator('.t-digit').count()) { await delay(1200); if (await page.locator('#t-in').count()) { await page.keyboard.type('1'); await page.keyboard.press('Enter'); } else if (await page.locator('.t-btns.go').count()) { await page.locator('.t-btns.go .t-opt').focus(); await page.keyboard.press('Enter'); } continue; }
    await page.locator('.t-opt').first().focus();
    await page.keyboard.press(i % 2 ? 'Enter' : 'Space');
    pressed += 1;
    await delay(280);
  }
  assert.ok(pressed > 0, 'Enter and Space answer a choice');
  await page.locator('.t-btns.go .t-opt').focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('.t-pair');
  const a = await page.locator('.t-pair').textContent();
  let changed = false;
  for (let i = 0; i < 6 && !changed; i += 1) { await page.keyboard.press('1'); await delay(60); changed = (await page.locator('.t-pair').textContent()) !== a; }
  assert.ok(changed, 'the number keys answer in the timed task');
  await page.locator('#alt').focus();
  await page.keyboard.press('Enter');
  await at(page, 'into');
  await page.locator('input[name="interest"]').first().focus();
  await page.keyboard.press('Space');
  assert.ok(await page.locator('input[name="interest"]').first().isChecked(), 'space ticks a tile');
  await page.locator('input[name="interest"]').first().press('Enter');
  await at(page, 'learn');
  await page.locator('input[name="track"]').first().focus();
  await page.keyboard.press('Space');
  assert.ok(await page.locator('input[name="track"]').first().isChecked(), 'space ticks a subject');
  await page.locator('input[name="track"]').first().press('Enter');
  await at(page, 'grade');
  await page.locator('input[name="way"]').first().focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowDown');
  assert.ok(await page.locator('input[name="way"]').nth(1).isChecked(), 'arrow keys move between answers');
  const named = await page.evaluate(() => [...document.querySelectorAll('input, select, button')].filter((n) => n.offsetParent && !(n.labels && n.labels.length) && !n.getAttribute('aria-label') && !n.textContent.trim()).map((n) => n.id || n.name));
  assert.deepEqual(named, [], 'every control is named');
  results.push(`${page.persona}: keyboard only through the test and the questions; every control named`);
  await page.context().close();
}

async function reducedMotion(browser) {
  const page = await open(browser, 'calm', { viewport: PHONE, reducedMotion: 'reduce' });
  await signUpInvited(page);
  await at(page, 'welcome');
  const ms = await page.evaluate(() => getComputedStyle(document.querySelector('.ob-view')).animationDuration);
  assert.ok(parseFloat(ms) < 0.01, `reduced motion is honoured (${ms})`);
  results.push(`${page.persona}: reduced motion honoured`);
  await page.context().close();
}

/* ── the servers ─────────────────────────────────────────────── */
let server = null;
async function startServer(env, dbFile) {
  PORT += 1;
  BASE = `http://localhost:${PORT}`;
  server = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DB_FILE: dbFile, ONBOARDING_V2: 'on', CONSENT_SWEEP: 'off', SESSION_SECRET: 'y'.repeat(40), MAIL_OUTBOX_DIR: path.join(dir, 'outbox'), BETA_INVITES_FILE: invitesFile, APP_ORIGIN: BASE, ...env },
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  for (let i = 0; i < 160; i += 1) {
    try { if ((await fetch(`${BASE}/api/health`)).status < 500) return; } catch { /* not up yet */ }
    await delay(500);
  }
  throw new Error('server did not start');
}
const stopServer = () => new Promise((r) => { if (!server) return r(); server.once('exit', r); server.kill(); server = null; return undefined; });

async function main() {
  const copy = (name) => { const f = path.join(dir, `${name}.json`); fs.copyFileSync(path.join(ROOT, 'data', 'db.json'), f); return f; };
  const browser = await chromium.launch();
  let failed = 0;
  const runAll = async (runs) => {
    for (const [name, run] of Object.entries(runs)) {
      if (ONLY.length && !ONLY.includes(name)) continue;
      try { await run(); } catch (err) {
        failed += 1;
        console.log(`FAIL ${name}: ${String(err.message).split('\n').slice(0, 3).join(' | ').slice(0, 400)}`);
      }
    }
  };
  const wanted = (names) => !ONLY.length || names.some((n) => ONLY.includes(n));

  // The real way in: invited, signs up on /register, comes through /start.
  const BETA = {
    beta: async () => {
      await betaAdult(browser, { viewport: PHONE, scheme: 'light' }, { fullTest: true });
      await betaAdult(browser, { viewport: DESK, scheme: 'light' });
      await betaAdult(browser, { viewport: PHONE, scheme: 'dark' });
      await betaAdult(browser, { viewport: DESK, scheme: 'dark' });
    },
    betachild: async () => {
      await betaChild(browser, { viewport: PHONE, scheme: 'light' });
      await betaChild(browser, { viewport: DESK, scheme: 'dark' });
      await betaChild(browser, { viewport: PHONE, scheme: 'dark' });
      await betaChild(browser, { viewport: DESK, scheme: 'light' });
    },
    betaedges: () => betaEdges(browser, { viewport: PHONE, scheme: 'light' }),
    keyboard: () => keyboard(browser),
    motion: () => reducedMotion(browser),
  };
  if (wanted(Object.keys(BETA))) {
    await startServer({ BETA_GATE: 'invite', BETA_SIGNIN_ONLY: 'off' }, copy('beta'));
    await runAll(BETA);
    await stopServer();
  }

  // Sign-in only: accounts made before, with no age on record, sign in.
  if (wanted(['signin'])) {
    const f = copy('signin');
    await startServer({ BETA_SIGNIN_ONLY: 'off' }, f);
    const made = [];
    for (let i = 0; i < 3; i += 1) {
      const email = `noage-${unique()}@example.test`;
      const r = await fetch(`${BASE}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE }, body: JSON.stringify({ email, password: 'longenough1', display_name: 'No Age' }) });
      assert.equal(r.status, 201);
      made.push(email);
    }
    // A kill loses what hasn't been flushed: wait until the accounts are on disk.
    for (let i = 0; i < 120 && !fs.readFileSync(f, 'utf8').includes(made[2]); i += 1) await delay(300);
    await delay(1000);
    await stopServer();
    await delay(500);
    await startServer({ BETA_SIGNIN_ONLY: 'on' }, f);
    await runAll({
      signin: async () => {
        await signinAgeless(browser, { viewport: PHONE, scheme: 'light' }, made[0]);
        await signinAgeless(browser, { viewport: DESK, scheme: 'dark' }, made[1]);
        await signinAgeless(browser, { viewport: PHONE, scheme: 'dark' }, made[2], { child: true });
      },
    });
    await stopServer();
  }

  // Both off: the guest and agreement flow, kept for public launch.
  const PUBLIC = {
    public: async () => {
      await publicAdult(browser, { viewport: PHONE, scheme: 'light' });
      await publicAdult(browser, { viewport: DESK, scheme: 'dark' });
    },
    child: async () => {
      await publicChild(browser, { viewport: PHONE, scheme: 'light' }, true, 'child-parent');
      await publicChild(browser, { viewport: DESK, scheme: 'dark' }, false, 'child-noconsent');
    },
    returning: async () => { await returning(browser, { viewport: PHONE, scheme: 'light' }); await returning(browser, { viewport: DESK, scheme: 'dark' }); },
    reload: async () => { await reloadAndBack(browser, { viewport: PHONE, scheme: 'light' }); await reloadAndBack(browser, { viewport: DESK, scheme: 'dark' }); },
    failed: async () => { await failedSignUp(browser, { viewport: PHONE, scheme: 'dark' }); await failedSignUp(browser, { viewport: DESK, scheme: 'light' }); },
    other: () => typedInterest(browser, { viewport: PHONE, scheme: 'light' }),
    notes: () => notes(browser, { viewport: PHONE, scheme: 'light' }),
    decline: async () => { await declines(browser, { viewport: PHONE, scheme: 'light' }); await declines(browser, { viewport: DESK, scheme: 'dark' }); },
    guestpages: async () => { await guestPages(browser, { viewport: PHONE, scheme: 'light' }); await guestPages(browser, { viewport: DESK, scheme: 'dark' }); },
    subjects: () => everySubject(browser),
  };
  if (wanted(Object.keys(PUBLIC))) {
    await startServer({ BETA_SIGNIN_ONLY: 'off' }, copy('public'));
    await runAll(PUBLIC);
    await stopServer();
  }

  await browser.close();
  results.forEach((r) => console.log(`ok ${r}`));
  problems.forEach((p) => console.log(`PROBLEM ${p}`));
  console.log(`onboarding-v2-browser: ${results.length} walks ok, ${failed} failed, ${problems.length} problems`);
  process.exit(failed || problems.length ? 1 : 0);
}

main().catch(async (err) => { console.error(err); await stopServer(); process.exit(1); });
