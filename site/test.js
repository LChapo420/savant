#!/usr/bin/env node
/**
 * Tests for the site's form server: validation, spam guards, same-origin
 * checks, what is and is not served, removal, the admin page, and the visit
 * statistics (with a tiny geo file built from a fixture CSV by tools/build-geo.js).
 * Runs against a throwaway data folder, never site/data.   node test.js
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'savant-site-test-'));
process.env.DATA_DIR = TMP;
process.env.TRUST_PROXY = '1';          // lets each test use its own X-Forwarded-For IP
process.env.RATE_PER_IP = '5';
process.env.MIN_FILL_MS = '1500';
// The main test app has no admin page, whatever is in site/admin.env or the shell.
process.env.ADMIN_ENV_FILE = path.join(TMP, 'no-admin.env');
for (const k of ['ADMIN_USER', 'ADMIN_PASSWORD_HASH', 'ADMIN_TOTP_SECRET', 'ADMIN_ALLOW_IPS', 'ADMIN_SESSION_HOURS', 'ADMIN_IDLE_MINUTES', 'ADMIN_PASSWORD_INPUT', 'DATA_MAX_MB', 'VISIT_RATE_PER_IP', 'SITE_ORIGINS']) delete process.env[k];
delete process.env.NODE_ENV;
// The visit statistics use a tiny geo file built from a fixture CSV before the tests run.
process.env.GEO_FILE = path.join(TMP, 'geo', 'ip-city.bin');

const { createApp, readAll, WHY_MIN, WHY_MAX } = require('./server');

let base;
let ipN = 0;
const freshIp = () => `10.0.${Math.floor(++ipN / 250)}.${ipN % 250}`;

async function post(route, body, opts = {}) {
  const headers = {
    'Content-Type': opts.type || 'application/json',
    Accept: opts.accept || 'application/json',
    'X-Forwarded-For': opts.ip || freshIp(),
  };
  if (opts.origin !== null) headers.Origin = opts.origin || base;
  Object.assign(headers, opts.headers || {});
  const payload = typeof body === 'string' ? body
    : headers['Content-Type'] === 'application/x-www-form-urlencoded' ? new URLSearchParams(body).toString()
      : JSON.stringify(body);
  const res = await fetch(base + route, { method: 'POST', headers, body: payload, redirect: 'manual' });
  let json = null;
  const text = await res.text();
  try { json = JSON.parse(text); } catch (e) { /* html or empty */ }
  return { status: res.status, json, text, headers: res.headers };
}

const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const human = { elapsed: 4000 };
const WHY = 'I teach maths after school and want to try the placement with my students.';
const CONTACT = 'contact@savantedu.com';

test('pages are served with security headers', async () => {
  const r = await fetch(`${base}/`);
  assert.strictEqual(r.status, 200);
  const csp = r.headers.get('content-security-policy');
  assert.ok(csp.includes("default-src 'self'") && csp.includes("frame-ancestors 'none'"));
  assert.strictEqual(r.headers.get('x-content-type-options'), 'nosniff');
  assert.strictEqual(r.headers.get('set-cookie'), null, 'no cookies');
  assert.ok((await r.text()).includes('From zero to <span class="hero-brand">Savant</span>'));
  for (const p of ['/privacy', '/privacy.html', '/config.js', '/assets/site.css', '/assets/site.js', '/fonts/atkinson-hyperlegible-next.woff2', '/favicon.svg', '/thanks.html']) {
    assert.strictEqual((await fetch(base + p)).status, 200, p);
  }
});

test('server code, data, docs and dotfiles are never served', async () => {
  for (const p of ['/server.js', '/test.js', '/package.json', '/README.md', '/_headers', '/.gitignore', '/data/updates.jsonl', '/assets/../server.js', '/fonts/..%2fserver.js', '/screenshots/']) {
    const r = await fetch(base + p);
    assert.strictEqual(r.status, 404, p);
  }
});

test('health check answers', async () => {
  const r = await fetch(`${base}/api/health`);
  assert.deepStrictEqual(await r.json(), { ok: true });
});

test('updates: a valid sign-up is stored once, with the consent text', async () => {
  const r = await post('/api/updates', { email: '  Ada@Example.com ', consent: 'yes', ...human });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.json, { ok: true });
  const again = await post('/api/updates', { email: 'ada@example.com', consent: 'yes', ...human });
  assert.strictEqual(again.status, 200, 'a repeat gets the same answer');
  const rows = readAll('updates');
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].email, 'ada@example.com');
  assert.strictEqual(rows[0].consent_text, 'Send me occasional updates about Savant.');
  assert.ok(!('ip' in rows[0]) && !JSON.stringify(rows[0]).includes('10.0.'), 'no IP stored');
});

test('updates: consent and email are required', async () => {
  const r = await post('/api/updates', { email: 'not-an-email', ...human });
  assert.strictEqual(r.status, 400);
  assert.ok(r.json.errors.email && r.json.errors.consent);
  const empty = await post('/api/updates', { ...human });
  assert.ok(empty.json.errors.email.startsWith('Enter'));
});

test('beta: every rule is checked', async () => {
  const r = await post('/api/beta', { email: 'b@example.com', name: '', role: 'admin', ...human });
  assert.strictEqual(r.status, 400);
  assert.deepStrictEqual(Object.keys(r.json.errors).sort(), ['age_ok', 'consent', 'name', 'role'], 'the "why" is optional now');
  const long = await post('/api/beta', { email: 'b@example.com', name: 'x'.repeat(81), role: 'learner', why: WHY, age_ok: 'yes', consent: 'yes', ...human });
  assert.ok(long.json.errors.name);
  const other = await post('/api/beta', { email: 'b@example.com', name: 'Bo', role: 'learner', interests_other: 'x'.repeat(121), age_ok: 'yes', consent: 'yes', ...human });
  assert.ok(other.json.errors.interests_other);
});

test('beta: a valid application keeps only what the form asks', async () => {
  const why = '  My daughter loves puzzles.\nShe is bored at school\u0007 and wants harder maths.  ';
  const r = await post('/api/beta', { email: 'parent@example.com', name: 'Sam\u0007 ', role: 'parent', why, age_ok: 'yes', consent: 'yes', extra: 'ignored', ...human });
  assert.strictEqual(r.status, 200);
  const row = readAll('beta').find((x) => x.email === 'parent@example.com');
  assert.strictEqual(row.name, 'Sam', 'control characters stripped');
  assert.strictEqual(row.role, 'parent');
  assert.strictEqual(row.why, 'My daughter loves puzzles.\nShe is bored at school and wants harder maths.', 'why is stored trimmed, newlines kept, control characters stripped');
  assert.strictEqual(row.why_question, 'Why should we pick you?');
  assert.strictEqual(row.age_confirmed, true);
  assert.strictEqual(row.consent, true);
  assert.strictEqual(row.status, 'applied');
  assert.deepStrictEqual(row.interests, []);
  assert.ok(!('extra' in row) && !('elapsed' in row) && !('source' in row) && !('ref' in row));
});

test('beta: "Why should we pick you?" is optional, 1,000 characters at most', async () => {
  const base1 = { email: 'why@example.com', name: 'Wy', role: 'learner', age_ok: 'yes', consent: 'yes', ...human };
  assert.strictEqual(WHY_MIN, 0, 'no minimum');
  assert.strictEqual(WHY_MAX, 1000);
  const long = await post('/api/beta', { ...base1, why: 'x'.repeat(WHY_MAX + 1) });
  assert.strictEqual(long.json.errors.why, 'Keep this under 1,000 characters.');
  assert.ok(!readAll('beta').some((x) => x.email === 'why@example.com'), 'nothing stored while invalid');
  const none = await post('/api/beta', base1);
  assert.strictEqual(none.status, 200, 'no answer is fine');
  assert.strictEqual(readAll('beta').find((x) => x.email === 'why@example.com').why, '');
  const short = await post('/api/beta', { ...base1, email: 'why1@example.com', why: 'Hi' });
  assert.strictEqual(short.status, 200, 'a short answer is fine');
  const blank = await post('/api/beta', { ...base1, email: 'why4@example.com', why: ' \n\t\u0007  ' });
  assert.strictEqual(blank.status, 200);
  assert.strictEqual(readAll('beta').find((x) => x.email === 'why4@example.com').why, '', 'whitespace and control characters count as empty');
  const atMax = await post('/api/beta', { ...base1, email: 'why2@example.com', why: 'z'.repeat(WHY_MAX) });
  assert.strictEqual(atMax.status, 200);
  assert.strictEqual(readAll('beta').find((x) => x.email === 'why2@example.com').why.length, WHY_MAX);
  const nonLatin = await post('/api/beta', { ...base1, email: 'why3@example.com', why: '学'.repeat(WHY_MAX) }, { type: 'application/x-www-form-urlencoded' });
  assert.strictEqual(nonLatin.status, 200, 'a full answer in a non-Latin script fits the body limit, even as a form post');
  assert.ok(readAll('beta').some((x) => x.email === 'why3@example.com'));
});

test('beta: the page asks "Why should we pick you?" as an optional answer with a 1,000 character limit', async () => {
  const html = await (await fetch(`${base}/`)).text();
  for (const id of ['beta-why', 'hero-why']) {
    const ta = html.match(new RegExp(`<textarea[^>]*id="${id}"[^>]*>`));
    assert.ok(ta, `${id}: the textarea is on the page`);
    assert.ok(/name="why"/.test(ta[0]) && !/\brequired\b/.test(ta[0]) && !/minlength/.test(ta[0]), `${id}: optional, no minimum`);
    assert.ok(ta[0].includes(`maxlength="${WHY_MAX}"`));
    assert.ok(html.includes(`<label for="${id}">Why should we pick you?`));
  }
  assert.ok(html.includes('data-error-for="why"'));
  const js = await (await fetch(`${base}/assets/site.js`)).text();
  assert.ok(js.includes("why: 'why'") && js.includes(`WHY_MAX = ${WHY_MAX}`) && !js.includes('WHY_MIN'), 'the browser checks the same rule');
});

test('beta: the hero has the first step (email and the two ticks), the lower form the same, step 2 behind it', async () => {
  const html = await (await fetch(`${base}/`)).text();
  const hero = html.slice(html.indexOf('<form class="apply apply-hero"'), html.indexOf('</form>', html.indexOf('<form class="apply apply-hero"')));
  assert.ok(hero.includes('id="hero-form"') && hero.includes('data-source="hero"') && hero.includes('name="source" value="hero"'));
  assert.ok(/<input id="hero-email" name="email" type="email"[^>]*\brequired\b/.test(hero));
  assert.ok(hero.includes('Apply for the beta</button>'));
  assert.ok(/id="hero-age" name="age_ok" type="checkbox"[^>]*\brequired\b/.test(hero) && hero.includes("I am 13 or older, or I'm a parent signing up for my child."));
  assert.ok(/id="hero-consent" name="consent" type="checkbox"[^>]*\brequired\b/.test(hero) && hero.includes('Savant may email me about the beta.'));
  assert.ok(html.indexOf('id="hero-form"') < html.indexOf('class="twin"'), 'the form is in the hero, before the example');
  for (const p of ['hero', 'beta']) {
    for (const v of ['math', 'english', 'reading', 'spanish', 'iq', 'act', 'chess', 'piano', 'basketball']) {
      assert.ok(html.includes(`<input type="checkbox" name="interests" value="${v}">`), `${p}: ${v} chip`);
    }
    assert.ok(html.includes(`name="interests_other"`) && html.includes(`id="${p}-other"`), `${p}: something else`);
    assert.ok(/name="role" value="learner"/.test(html) && html.includes('value="parent"') && html.includes('value="teacher"'));
  }
  assert.ok(html.includes('id="beta-form"') && html.includes('data-source="bottom"') && html.includes('name="source" value="bottom"'), 'the lower form still exists, tagged "bottom"');
  assert.ok(html.includes('class="apply-fallback"') && html.includes('data-sticky-apply') && html.includes('Apply for the beta — free'));
  assert.ok(html.includes('Savant learns how you learn, then teaches you any subject your best way.'));
  assert.ok(html.includes('Built by a 16-year-old founder') && html.includes('Free for beta testers') && html.includes('Every application read by hand'));
  assert.ok(html.indexOf('Savant takes every small part of learning') > html.indexOf('id="how-title"'), 'the long explanation moved into "Measured first, then taught."');
  const theme = await (await fetch(`${base}/assets/theme.js`)).text();
  assert.ok(theme.includes("classList.add('js')"), 'the two steps only hide step 2 when scripts run');
});

test('beta: link preview tags, canonical link and og.png', async () => {
  const html = await (await fetch(`${base}/`)).text();
  const meta = (attr, name) => (html.match(new RegExp(`<meta ${attr}="${name}" content="([^"]*)"`)) || [])[1];
  assert.strictEqual(meta('property', 'og:title'), 'Savant — From zero to Savant');
  assert.strictEqual(meta('property', 'og:description'), 'Savant learns how you learn, then teaches you any subject your best way. Apply for the free beta.');
  assert.strictEqual(meta('property', 'og:url'), 'https://savantedu.com/');
  assert.strictEqual(meta('property', 'og:image'), 'https://savantedu.com/og.png');
  assert.strictEqual(meta('property', 'og:image:width'), '1200');
  assert.strictEqual(meta('property', 'og:image:height'), '630');
  assert.strictEqual(meta('name', 'twitter:card'), 'summary_large_image');
  assert.strictEqual(meta('name', 'twitter:image'), 'https://savantedu.com/og.png');
  assert.ok(html.includes('<link rel="canonical" href="https://savantedu.com/">'));
  const r = await fetch(`${base}/og.png`);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.headers.get('content-type'), 'image/png');
  const png = Buffer.from(await r.arrayBuffer());
  assert.strictEqual(png.subarray(1, 4).toString(), 'PNG');
  assert.deepStrictEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1200, 630], 'the picture is 1200 x 630');
});

test('beta: investors see the founder line, with the LinkedIn link', async () => {
  const html = await (await fetch(`${base}/`)).text();
  assert.ok(html.includes('Landon Davidshofer, 16, Omaha.'));
  assert.ok(html.includes('href="https://www.linkedin.com/in/landon-davidshofer-aba26a377/" rel="noopener"'));
});

test('beta: step 1 keeps the email at once as "started"; step 2 completes the same record', async () => {
  const email = 'two@example.com';
  const s1 = await post('/api/beta', { step: 1, email: ' Two@Example.com ', age_ok: 'yes', consent: 'yes', source: 'hero', ref: 'creator-7', ...human });
  assert.strictEqual(s1.status, 200);
  assert.strictEqual(s1.json.ok, true);
  assert.ok(typeof s1.json.token === 'string' && s1.json.token.length > 20);
  let rows = readAll('beta').filter((x) => x.email === email);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].status, 'started');
  assert.strictEqual(rows[0].source, 'hero');
  assert.strictEqual(rows[0].ref, 'creator-7');
  assert.strictEqual(rows[0].age_confirmed, true);
  assert.strictEqual(rows[0].age_text, "I am 13 or older, or I'm a parent signing up for my child.");
  assert.strictEqual(rows[0].consent, true);
  assert.strictEqual(rows[0].consent_text, 'Savant may email me about the beta.');
  assert.ok(!('name' in rows[0]) && !('role' in rows[0]) && !('token' in rows[0]) && !JSON.stringify(rows[0]).includes(s1.json.token));
  const id = rows[0].id;

  const s2 = await post('/api/beta', { step: 2, token: s1.json.token, email, name: 'Tay', role: 'learner', interests: ['chess', 'math', 'chess', 'astrology'], interests_other: ' rocketry ', why: '', ...human });
  assert.strictEqual(s2.status, 200);
  rows = readAll('beta').filter((x) => x.email === email);
  assert.strictEqual(rows.length, 1, 'the same record, not a second one');
  assert.strictEqual(rows[0].id, id);
  assert.strictEqual(rows[0].status, 'applied');
  assert.strictEqual(rows[0].name, 'Tay');
  assert.strictEqual(rows[0].role, 'learner');
  assert.deepStrictEqual(rows[0].interests, ['chess', 'math'], 'only the known subjects, once each');
  assert.strictEqual(rows[0].interests_other, 'rocketry');
  assert.strictEqual(rows[0].why, '');
  assert.strictEqual(rows[0].source, 'hero', 'source and ref from step 1 are kept');
  assert.strictEqual(rows[0].consent, true);
  assert.ok(rows[0].completed_at);

  const again = await post('/api/beta', { step: 2, token: s1.json.token, email, name: 'Someone else', role: 'parent', ...human });
  assert.strictEqual(again.status, 200);
  assert.strictEqual(readAll('beta').find((x) => x.email === email).name, 'Tay', 'a finished application cannot be changed with the old link');
});

test('beta: step 1 needs the email and both ticks; step 2 needs a name and a role', async () => {
  const none = await post('/api/beta', { step: 1, email: 'bad', ...human });
  assert.strictEqual(none.status, 400);
  assert.deepStrictEqual(Object.keys(none.json.errors).sort(), ['age_ok', 'consent', 'email']);
  const noAge = await post('/api/beta', { step: 1, email: 'tick@example.com', consent: 'yes', ...human });
  assert.deepStrictEqual(Object.keys(noAge.json.errors), ['age_ok']);
  assert.ok(!readAll('beta').some((x) => x.email === 'tick@example.com'), 'nothing is stored until both ticks are given');
  const s1 = await post('/api/beta', { step: 1, email: 'tick@example.com', age_ok: 'yes', consent: 'yes', ...human });
  const bad = await post('/api/beta', { step: 2, token: s1.json.token, email: 'tick@example.com', name: '', role: 'wizard', ...human });
  assert.strictEqual(bad.status, 400);
  assert.deepStrictEqual(Object.keys(bad.json.errors).sort(), ['name', 'role']);
  assert.strictEqual(readAll('beta').find((x) => x.email === 'tick@example.com').status, 'started', 'still started');
  const longWhy = await post('/api/beta', { step: 2, token: s1.json.token, email: 'tick@example.com', name: 'T', role: 'teacher', why: 'x'.repeat(1001), ...human });
  assert.ok(longWhy.json.errors.why);
});

test('beta: step 2 without the step-1 link changes nothing, and says the same thing', async () => {
  const s1 = await post('/api/beta', { step: 1, email: 'tok@example.com', age_ok: 'yes', consent: 'yes', ...human });
  const other = await post('/api/beta', { step: 1, email: 'tok2@example.com', age_ok: 'yes', consent: 'yes', ...human });
  const attempts = [undefined, 'junk', `${Math.floor(Date.now() / 1000) + 99999}.AAAA`, other.json.token, `1000000000.${s1.json.token.split('.')[1]}`, { a: 1 }];
  for (const token of attempts) {
    const r = await post('/api/beta', { step: 2, token, email: 'tok@example.com', name: 'Mallory', role: 'parent', ...human });
    assert.deepStrictEqual(r.json, { ok: true }, 'the same answer as a success');
  }
  const row = readAll('beta').find((x) => x.email === 'tok@example.com');
  assert.strictEqual(row.status, 'started');
  assert.ok(!('name' in row), 'no name was written');
  const nobody = await post('/api/beta', { step: 2, token: s1.json.token, email: 'nobody@example.com', name: 'N', role: 'parent', ...human });
  assert.deepStrictEqual(nobody.json, { ok: true });
  assert.ok(!readAll('beta').some((x) => x.email === 'nobody@example.com'));
});

test('beta: a repeat of step 1 never makes a second record or shows who applied', async () => {
  const a = await post('/api/beta', { step: 1, email: 'rep@example.com', age_ok: 'yes', consent: 'yes', ...human });
  const b = await post('/api/beta', { step: 1, email: 'rep@example.com', age_ok: 'yes', consent: 'yes', ...human });
  assert.ok(a.json.token && b.json.token, 'a started application can be picked up again');
  assert.strictEqual(readAll('beta').filter((x) => x.email === 'rep@example.com').length, 1);
  await post('/api/beta', { step: 2, token: b.json.token, email: 'rep@example.com', name: 'Rep', role: 'learner', ...human });
  const c = await post('/api/beta', { step: 1, email: 'rep@example.com', age_ok: 'yes', consent: 'yes', ...human });
  assert.strictEqual(c.status, 200);
  assert.ok(typeof c.json.token === 'string', 'same shape for a finished application');
  const d = await post('/api/beta', { step: 2, token: c.json.token, email: 'rep@example.com', name: 'Mallory', role: 'parent', ...human });
  assert.deepStrictEqual(d.json, { ok: true });
  const rows = readAll('beta').filter((x) => x.email === 'rep@example.com');
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].name, 'Rep');
});

test('beta: the whole form (no JavaScript) completes a started application', async () => {
  await post('/api/beta', { step: 1, email: 'whole@example.com', age_ok: 'yes', consent: 'yes', source: 'hero', ...human });
  const form = { type: 'application/x-www-form-urlencoded', accept: 'text/html' };
  const r = await post('/api/beta', 'email=whole%40example.com&name=Wen&role=teacher&interests=piano&interests=chess&interests_other=&why=&age_ok=yes&consent=yes&source=bottom&ref=', form);
  assert.strictEqual(r.status, 303);
  const rows = readAll('beta').filter((x) => x.email === 'whole@example.com');
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].status, 'applied');
  assert.deepStrictEqual(rows[0].interests, ['piano', 'chess']);
  assert.strictEqual(rows[0].source, 'bottom');
  assert.ok(!('ref' in rows[0]), 'an empty ref is not stored');
});

test('beta: source is one of the known forms; ref is a short plain tag', async () => {
  const mk = (n, extra) => post('/api/beta', { step: 1, email: `src${n}@example.com`, age_ok: 'yes', consent: 'yes', ...extra, ...human });
  await mk(1, { source: 'sticky', ref: 'Tay_Lor-1.x' });
  await mk(2, { source: '<script>', ref: '<b>x</b>; DROP' });
  await mk(3, { source: 'BOTTOM', ref: 'y'.repeat(200) });
  await mk(4, { source: { a: 1 }, ref: ['a'] });
  const row = (n) => readAll('beta').find((x) => x.email === `src${n}@example.com`);
  assert.strictEqual(row(1).source, 'sticky');
  assert.strictEqual(row(1).ref, 'Tay_Lor-1.x');
  assert.ok(!('source' in row(2)), 'an unknown source is dropped');
  assert.ok(/^[\w .\-~+]*$/.test(row(2).ref), 'only plain characters');
  assert.strictEqual(row(3).source, 'bottom');
  assert.strictEqual(row(3).ref.length, 64);
  assert.ok(!('source' in row(4)) && !('ref' in row(4)));
});

test('beta: step 2 has its own rate limit counter', async () => {
  const ip = '192.0.2.99';
  const tokens = [];
  for (let i = 0; i < 5; i += 1) {
    const r = await post('/api/beta', { step: 1, email: `lim${i}@example.com`, age_ok: 'yes', consent: 'yes', ...human }, { ip });
    assert.strictEqual(r.status, 200, `step 1, try ${i + 1}`);
    tokens.push(r.json.token);
  }
  const sixth = await post('/api/beta', { step: 1, email: 'lim6@example.com', age_ok: 'yes', consent: 'yes', ...human }, { ip });
  assert.strictEqual(sixth.status, 429);
  const finish = await post('/api/beta', { step: 2, token: tokens[0], email: 'lim0@example.com', name: 'L', role: 'learner', ...human }, { ip });
  assert.strictEqual(finish.status, 200, 'finishing an application is not blocked by the sign-ups before it');
  assert.strictEqual(readAll('beta').find((x) => x.email === 'lim0@example.com').status, 'applied');
});

test('beta: a bot (honeypot, or too fast) gets thanks and nothing is stored at either step', async () => {
  const before = readAll('beta').length;
  const a = await post('/api/beta', { step: 1, email: 'bot1@spam.example', age_ok: 'yes', consent: 'yes', website: 'x', ...human });
  const b = await post('/api/beta', { step: 1, email: 'bot2@spam.example', age_ok: 'yes', consent: 'yes', elapsed: 100 });
  assert.strictEqual(a.status, 200);
  assert.strictEqual(b.status, 200);
  assert.strictEqual(readAll('beta').length, before);
});

test('contact email: contact@savantedu.com for contact, investors and privacy, everywhere', async () => {
  const cfg = await (await fetch(`${base}/config.js`)).text();
  for (const key of ['contactEmail', 'investorEmail', 'privacyEmail']) {
    assert.ok(cfg.includes(`${key}: '${CONTACT}'`), key);
  }
  assert.ok(!/REPLACE_WITH_\w*EMAIL/.test(cfg), 'no email placeholder left in config.js');
  const pages = { '/': ['contact', 'investors'], '/privacy.html': ['contact', 'privacy'], '/thanks.html': ['contact'], '/no-such-page': ['contact'] };
  for (const [page, kinds] of Object.entries(pages)) {
    const html = await (await fetch(base + page)).text();
    assert.ok(!/email to come<\/(span|a)>/.test(html), `${page}: no placeholder shown without JavaScript`);
    for (const kind of kinds) {
      assert.ok(html.includes(`<a href="mailto:${CONTACT}" data-mailto="${kind}"`), `${page}: ${kind} mailto link`);
    }
  }
});

test('socials: each platform has a real https link or a marked placeholder, and the icons are drawn inline', async () => {
  const cfg = await (await fetch(`${base}/config.js`)).text();
  for (const [icon, url] of [['instagram', 'INSTAGRAM'], ['tiktok', 'TIKTOK'], ['x', 'X'], ['youtube', 'YOUTUBE']]) {
    const line = cfg.split('\n').find((l) => l.includes(`icon: '${icon}'`)) || '';
    assert.ok(line.includes(`'REPLACE_WITH_${url}_URL'`) || /url: 'https:\/\/[^']+'/.test(line), icon);
  }
  const js = await (await fetch(`${base}/assets/site.js`)).text();
  for (const icon of ['instagram', 'tiktok', 'x', 'youtube']) assert.ok(js.includes(`    ${icon}: '<`), `${icon} glyph`);
  assert.ok(!/https?:\/\//i.test(js), 'site.js requests nothing from other hosts');
});

test('investors: message length and firm are checked; a valid note is stored', async () => {
  const short = await post('/api/investors', { name: 'Kim', email: 'kim@fund.example', message: 'hi', ...human });
  assert.ok(short.json.errors.message);
  const firm = await post('/api/investors', { name: 'Kim', email: 'kim@fund.example', firm: 'f'.repeat(121), message: 'Hello there, interested.', ...human });
  assert.ok(firm.json.errors.firm);
  const ok = await post('/api/investors', { name: 'Kim', email: 'kim@fund.example', firm: '', message: 'Line one.\nLine two.', ...human });
  assert.strictEqual(ok.status, 200);
  const row = readAll('investors')[0];
  assert.strictEqual(row.message, 'Line one.\nLine two.');
  assert.strictEqual(row.firm, null);
});

test('honeypot: answered like a success, nothing stored', async () => {
  const before = readAll('updates').length;
  const r = await post('/api/updates', { email: 'bot@spam.example', consent: 'yes', website: 'http://spam', ...human });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(readAll('updates').length, before);
});

test('too fast to be a person: answered like a success, nothing stored', async () => {
  const before = readAll('updates').length;
  const r = await post('/api/updates', { email: 'fast@spam.example', consent: 'yes', elapsed: 200 });
  assert.strictEqual(r.status, 200);
  const nan = await post('/api/updates', { email: 'nan@spam.example', consent: 'yes', elapsed: 'soon' });
  assert.strictEqual(nan.status, 200);
  assert.strictEqual(readAll('updates').length, before);
});

test('other websites cannot post (CSRF)', async () => {
  const evil = await post('/api/updates', { email: 'x@example.com', consent: 'yes', ...human }, { origin: 'https://evil.example' });
  assert.strictEqual(evil.status, 403);
  const none = await post('/api/updates', { email: 'x@example.com', consent: 'yes', ...human }, { origin: null });
  assert.strictEqual(none.status, 403, 'no Origin, no fetch metadata, no Referer');
  const cross = await post('/api/updates', { email: 'x@example.com', consent: 'yes', ...human }, { origin: null, headers: { 'Sec-Fetch-Site': 'cross-site' } });
  assert.strictEqual(cross.status, 403);
  const nullOrigin = await post('/api/updates', { email: 'x@example.com', consent: 'yes', ...human }, { origin: 'null' });
  assert.strictEqual(nullOrigin.status, 403);
  const sameMeta = await post('/api/updates', { email: 'meta@example.com', consent: 'yes', ...human }, { origin: null, headers: { 'Sec-Fetch-Site': 'same-origin' } });
  assert.strictEqual(sameMeta.status, 200);
  const pre = await fetch(`${base}/api/updates`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' } });
  assert.strictEqual(pre.status, 403);
  assert.strictEqual(pre.headers.get('access-control-allow-origin'), null);
  assert.ok(!readAll('updates').some((r) => r.email === 'x@example.com'));
});

test('only JSON and form posts, and small bodies', async () => {
  const plain = await post('/api/updates', 'email=a@b.co', { type: 'text/plain' });
  assert.strictEqual(plain.status, 415);
  const big = await post('/api/investors', { name: 'A', email: 'a@b.co', message: 'x'.repeat(20000), ...human });
  assert.strictEqual(big.status, 413);
  const broken = await post('/api/updates', '{"email":', {});
  assert.strictEqual(broken.status, 400);
  assert.ok(!/SyntaxError|node_modules|\bat \S+ \(/.test(broken.text), 'no stack trace');
});

test('no-JavaScript form posts: redirect to thanks, or an error page', async () => {
  const form = { type: 'application/x-www-form-urlencoded', accept: 'text/html' };
  const ok = await post('/api/updates', { email: 'nojs@example.com', consent: 'yes' }, form);
  assert.strictEqual(ok.status, 303);
  assert.strictEqual(ok.headers.get('location'), '/thanks.html');
  const bad = await post('/api/beta', { email: 'nojs@example.com' }, form);
  assert.strictEqual(bad.status, 400);
  assert.ok(bad.text.includes('Choose learner, parent or teacher.'));
  assert.ok(bad.text.includes('Enter a name or nickname.'));
  assert.ok(!bad.text.includes('Tell us why'), 'the why is optional');
  assert.ok(!bad.text.includes('<script>alert'));
});

test('rate limit: the 6th try from one address in 10 minutes is refused', async () => {
  const ip = '192.0.2.77';
  for (let i = 0; i < 5; i += 1) {
    const r = await post('/api/updates', { email: `rl${i}@example.com`, consent: 'yes', ...human }, { ip });
    assert.strictEqual(r.status, 200, `try ${i + 1}`);
  }
  const sixth = await post('/api/updates', { email: 'rl6@example.com', consent: 'yes', ...human }, { ip });
  assert.strictEqual(sixth.status, 429);
  assert.ok(Number(sixth.headers.get('retry-after')) > 0);
  const other = await post('/api/beta', { email: 'rl@example.com', name: 'R', role: 'teacher', why: WHY, age_ok: 'yes', consent: 'yes', ...human }, { ip });
  assert.strictEqual(other.status, 200, 'limits are per form');
});

test('removal deletes an address from every list', async () => {
  await post('/api/updates', { email: 'gone@example.com', consent: 'yes', ...human });
  await post('/api/beta', { email: 'gone@example.com', name: 'G', role: 'learner', why: WHY, age_ok: 'yes', consent: 'yes', ...human });
  assert.ok(readAll('updates').some((r) => r.email === 'gone@example.com'));
  assert.ok(readAll('beta').some((r) => r.email === 'gone@example.com'));
  const r = await post('/api/forget', { email: 'GONE@example.com', ...human });
  assert.strictEqual(r.status, 200);
  assert.ok(!readAll('updates').some((x) => x.email === 'gone@example.com'));
  assert.ok(!readAll('beta').some((x) => x.email === 'gone@example.com'));
  const unknown = await post('/api/forget', { email: 'never@example.com', ...human });
  assert.deepStrictEqual(unknown.json, { ok: true }, 'same answer whether or not it was there');
  assert.ok(readAll('updates').some((x) => x.email === 'ada@example.com'), 'others untouched');
});

/* ── private admin page ──────────────────────────────────────────────────── */

const crypto = require('crypto');
const { spawnSync } = require('child_process');
const admin = require('./admin');

const ADMIN = '/donteventry';
const ENV_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'savant-admin-env-'));
// Test-only values, made fresh on every run: a random password, its scrypt hash
// (made here, independently of admin.js), and a random TOTP secret.
const A_USER = 'owner';
const A_PASS = crypto.randomBytes(18).toString('base64url');
const A_TOTP_KEY = crypto.randomBytes(20);
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32(buf) {
  let bits = '';
  for (const b of buf) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i < bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  return out;
}
const A_TOTP = b32(A_TOTP_KEY);
function testHash(pw) {
  const salt = crypto.randomBytes(32);
  const key = crypto.scryptSync(pw, salt, 64, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$32768$8$1$${salt.toString('base64')}$${key.toString('base64')}`;
}
const A_HASH = testHash(A_PASS);
const FULL = { ADMIN_USER: A_USER, ADMIN_PASSWORD_HASH: A_HASH, ADMIN_TOTP_SECRET: A_TOTP };
const FLOOR = 120;                          // the least time a sign-in answer takes, in these tests
const T0 = Date.UTC(2026, 9, 25, 12, 0, 0); // the admin apps' clock starts here
/** RFC 6238 code for a time, written apart from admin.js. */
function totp(ms, key = A_TOTP_KEY) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(Math.floor(ms / 30000)));
  const h = crypto.createHmac('sha1', key).update(msg).digest();
  const o = h[19] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1000000).padStart(6, '0');
}
const seen = { tokens: new Set(), codes: new Set() }; // checked against the audit log
const extraServers = [];
let envN = 0;

/** A separate app with its own admin config (written to a 0600 file) and clock. */
async function startAdmin(vars, { env = {} } = {}) {
  const file = path.join(ENV_DIR, `admin-${++envN}.env`);
  if (vars) {
    fs.writeFileSync(file, `${Object.entries(vars).map(([k, v]) => `${k}=${v}`).join('\n')}\n`, { mode: 0o600 });
    try { fs.chmodSync(file, 0o600); } catch (e) { /* Windows */ }
  }
  const keys = [...admin.ADMIN_KEYS, 'ADMIN_ENV_FILE', 'NODE_ENV', ...Object.keys(env)];
  const keep = {};
  for (const k of keys) keep[k] = process.env[k];
  for (const k of admin.ADMIN_KEYS) delete process.env[k];
  delete process.env.NODE_ENV;
  process.env.ADMIN_ENV_FILE = file;
  Object.assign(process.env, env);
  const clock = { t: T0 };
  let app;
  try { app = createApp({ now: () => clock.t, adminLoginFloorMs: FLOOR }); } finally {
    for (const k of keys) { if (keep[k] === undefined) delete process.env[k]; else process.env[k] = keep[k]; }
  }
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  extraServers.push(server);
  return { base: `http://127.0.0.1:${server.address().port}`, clock, app };
}

/** One request. o: ip, https (via X-Forwarded-Proto), jar (a Map of cookies), form, body, type, origin, headers. */
async function areq(A, method, route, o = {}) {
  const h = { 'X-Forwarded-For': o.ip || '198.51.100.10', 'User-Agent': 'savant-test' };
  if (o.https) h['X-Forwarded-Proto'] = 'https';
  if (o.jar && o.jar.size) h.Cookie = [...o.jar].map(([k, v]) => `${k}=${v}`).join('; ');
  let body;
  if (method === 'POST') {
    h['Content-Type'] = o.type || 'application/x-www-form-urlencoded';
    body = o.body !== undefined ? o.body : new URLSearchParams(o.form || {}).toString();
    if (o.origin !== null) h.Origin = o.origin || A.base;
  }
  Object.assign(h, o.headers || {});
  const res = await fetch(A.base + route, { method, headers: h, body, redirect: 'manual' });
  const text = await res.text();
  const cookies = res.headers.getSetCookie();
  for (const c of cookies) {
    const kv = c.split(';')[0];
    const k = kv.slice(0, kv.indexOf('='));
    const v = kv.slice(kv.indexOf('=') + 1);
    if (v) seen.tokens.add(v);
    if (o.jar) { if (!v || /max-age=0/i.test(c)) o.jar.delete(k); else o.jar.set(k, v); }
  }
  return { status: res.status, text, headers: res.headers, cookies };
}
const csrfIn = (html) => {
  const m = /name="csrf" value="([^"]+)"/.exec(html);
  if (m) seen.tokens.add(m[1]);
  return m ? m[1] : undefined;
};
/** Opens the sign-in form and posts it. code: undefined = the right one now, null = none sent. */
async function signIn(A, o = {}) {
  const jar = o.jar || new Map();
  const pg = await areq(A, 'GET', ADMIN, { ip: o.ip, https: o.https, jar });
  const form = { csrf: csrfIn(pg.text), user: o.user ?? A_USER, password: o.password ?? A_PASS };
  const code = o.code === undefined ? totp(A.clock.t) : o.code;
  if (code !== null) { form.code = code; seen.codes.add(code); }
  const started = Date.now();
  const r = await areq(A, 'POST', `${ADMIN}/login`, { ip: o.ip, https: o.https, jar, form });
  return { r, jar, ms: Date.now() - started };
}
const dashCsrf = async (A, jar, ip) => csrfIn((await areq(A, 'GET', ADMIN, { ip, jar })).text);
const isLogin = (html) => html.includes('name="password"') && !html.includes('<h1>Submissions</h1>');
const isDash = (html) => html.includes('<h1>Submissions</h1>');
const noCsrf = (html) => html.replace(/name="csrf" value="[^"]+"/g, 'name="csrf"');

/** The answer must match an unknown path's exactly (status, body, headers). */
async function assertPlain404(A, route, o = {}) {
  const method = o.method || 'GET';
  const ref = await areq(A, method, '/no-such-page', o);
  const r = await areq(A, method, route, o);
  assert.strictEqual(r.status, 404, `${route}: 404`);
  assert.strictEqual(r.text, ref.text, `${route}: the same body as an unknown path`);
  const names = (x) => [...x.headers.keys()].filter((k) => k !== 'date').sort().join(',');
  assert.strictEqual(names(r), names(ref), `${route}: the same headers as an unknown path`);
  for (const k of ['content-type', 'cache-control', 'content-security-policy', 'etag', 'content-length']) {
    assert.strictEqual(r.headers.get(k), ref.headers.get(k), `${route}: ${k}`);
  }
  assert.strictEqual(r.headers.get('x-robots-tag'), null);
  assert.deepStrictEqual(r.cookies, []);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i += 1; } else if (c === '"') quoted = false; else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

test('admin: not configured (or misconfigured), its path answers like any unknown path', async () => {
  const none = await startAdmin(null); // no env file at all
  await assertPlain404(none, ADMIN);
  await assertPlain404(none, `${ADMIN}/`);
  await assertPlain404(none, `${ADMIN}/assets/dashboard.js`);
  await assertPlain404(none, `${ADMIN}/login`, { method: 'POST', form: { user: A_USER, password: 'x' } });
  const warns = [];
  const orig = console.warn;
  console.warn = (m) => warns.push(String(m));
  try {
    await assertPlain404(await startAdmin({ ADMIN_USER: A_USER }), ADMIN);
    await assertPlain404(await startAdmin({ ADMIN_PASSWORD_HASH: A_HASH }), ADMIN);
    await assertPlain404(await startAdmin({ ...FULL, ADMIN_PASSWORD_HASH: A_HASH.replace('$32768$', '$16384$') }), ADMIN);
    await assertPlain404(await startAdmin({ ...FULL, ADMIN_PASSWORD_HASH: A_HASH.replace('$8$1$', '$4$1$') }), ADMIN);
    await assertPlain404(await startAdmin({ ADMIN_USER: A_USER, ADMIN_TOTP_SECRET: A_TOTP }), ADMIN);
    await assertPlain404(await startAdmin({ ...FULL, ADMIN_TOTP_SECRET: 'not base32!' }), ADMIN);
    await assertPlain404(await startAdmin({ ...FULL, ADMIN_TOTP_SECRET: 'AAAAAAAA' }), ADMIN); // 5 bytes: too short
    await assertPlain404(await startAdmin({ ...FULL, ADMIN_ALLOW_IPS: '300.1.2.3' }), ADMIN);
  } finally { console.warn = orig; }
  assert.ok(warns.every((w) => w.startsWith('[admin] private page off')), 'each off state is one [admin] line');
  assert.ok(warns.some((w) => w.includes('ADMIN_PASSWORD_HASH is not a valid')), 'a bad hash is reported');
  assert.ok(warns.some((w) => w.includes('ADMIN_TOTP_SECRET is not a base32 secret')), 'a bad TOTP secret is reported');
  assert.ok(warns.some((w) => w.includes('ADMIN_ALLOW_IPS')), 'a bad allow-list is reported');
  const [, , , , salt, key] = A_HASH.split('$');
  assert.ok(!warns.join('\n').includes(salt) && !warns.join('\n').includes(key) && !warns.join('\n').includes(A_TOTP), 'warnings never print a secret');
  // a file others can read turns the page off
  assert.strictEqual(admin.insecureMode(0o100600), false);
  assert.ok(admin.insecureMode(0o100640) && admin.insecureMode(0o100604) && admin.insecureMode(0o100620));
  if (process.platform !== 'win32') {
    const open = path.join(ENV_DIR, 'open.env');
    fs.writeFileSync(open, `ADMIN_USER=${A_USER}\nADMIN_PASSWORD_HASH=${A_HASH}\n`);
    fs.chmodSync(open, 0o644);
    const cfg = admin.loadAdminConfig({ env: { ADMIN_ENV_FILE: open }, root: __dirname });
    assert.strictEqual(cfg.enabled, false);
    assert.ok(cfg.warning.includes('chmod 600'));
  }
  // the file is parsed by hand; real environment variables win
  const f = path.join(ENV_DIR, 'parse.env');
  fs.writeFileSync(f, `# admin settings\n\nADMIN_USER=fileuser\r\nexport ADMIN_PASSWORD_HASH="${A_HASH}"\nADMIN_TOTP_SECRET='${A_TOTP}'\nADMIN_IDLE_MINUTES=5\n`, { mode: 0o600 });
  const cfg = admin.loadAdminConfig({ env: { ADMIN_ENV_FILE: f, ADMIN_USER: 'envuser' }, root: __dirname });
  assert.ok(cfg.enabled);
  assert.strictEqual(cfg.user, 'envuser');
  assert.strictEqual(cfg.idleMs, 5 * 60 * 1000);
  assert.strictEqual(cfg.sessionMs, 2 * 60 * 60 * 1000);
});

test('admin: with ADMIN_ALLOW_IPS, every other address gets the normal 404', async () => {
  const A = await startAdmin({ ...FULL, ADMIN_ALLOW_IPS: '203.0.113.0/24, 2001:db8::/32, 192.0.2.5' });
  for (const ip of ['198.51.100.7', '192.0.2.6', '2001:db9::1', '10.0.0.1']) {
    await assertPlain404(A, ADMIN, { ip });
    await assertPlain404(A, `${ADMIN}/login`, { ip, method: 'POST', form: {} });
  }
  for (const ip of ['203.0.113.50', '2001:db8::1', '192.0.2.5', '::ffff:203.0.113.9']) {
    const r = await areq(A, 'GET', ADMIN, { ip });
    assert.strictEqual(r.status, 200, ip);
    assert.ok(isLogin(r.text), ip);
  }
  const { r, jar } = await signIn(A, { ip: '203.0.113.50' });
  assert.strictEqual(r.status, 303);
  await assertPlain404(A, ADMIN, { ip: '198.51.100.7', jar });
  await assertPlain404(A, `${ADMIN}/export?form=beta`, { ip: '198.51.100.7', jar });
});

test('admin: in production, plain http gets the 404 and sign-in works only over HTTPS', async () => {
  const P = await startAdmin(FULL, { env: { NODE_ENV: 'production' } });
  await assertPlain404(P, ADMIN);
  await assertPlain404(P, `${ADMIN}/login`, { method: 'POST', form: { user: A_USER, password: A_PASS, code: totp(P.clock.t) } });
  const pg = await areq(P, 'GET', ADMIN, { https: true });
  assert.strictEqual(pg.status, 200);
  assert.ok(pg.cookies.some((c) => c.startsWith('__Host-sv_admin_pre=') && /; Secure/.test(c)));
  const { r, jar } = await signIn(P, { https: true });
  assert.strictEqual(r.status, 303);
  const sess = r.cookies.find((c) => c.startsWith('__Host-sv_admin='));
  assert.ok(sess && /; Secure/.test(sess) && /; HttpOnly/.test(sess) && /; SameSite=Strict/.test(sess) && /; Path=\//.test(sess));
  assert.ok(isDash((await areq(P, 'GET', ADMIN, { https: true, jar })).text));
  await assertPlain404(P, ADMIN, { jar });
});

test('admin: a wrong user, password or code gets the same answer, never faster', async () => {
  const A = await startAdmin(FULL);
  const good = totp(A.clock.t);
  const near = new Set([totp(A.clock.t - 30000), good, totp(A.clock.t + 30000)]);
  let bad = good;
  while (near.has(bad)) bad = String((Number(bad) + 1) % 1000000).padStart(6, '0');
  const tries = [{ user: 'someone' }, { user: A_USER.toUpperCase() }, { password: `${A_PASS}x` }, { password: '' }, { code: bad }, { code: 'abcdef' }, { code: null }];
  const bodies = [];
  for (const [i, t] of tries.entries()) {
    const { r, ms } = await signIn(A, { ip: `198.51.100.${20 + i}`, ...t });
    assert.strictEqual(r.status, 401, JSON.stringify(Object.keys(t)));
    assert.ok(ms >= FLOOR - 5, `took ${ms} ms`);
    assert.ok(r.text.includes('That did not work. Check your details and try again.'));
    assert.strictEqual(r.headers.get('retry-after'), null);
    assert.ok(!r.cookies.some((c) => c.startsWith('sv_admin_dev=')), 'no session');
    bodies.push(noCsrf(r.text));
  }
  assert.ok(bodies.every((b) => b === bodies[0]), 'identical pages');
});

test('admin: five failures lock an address, for longer each time; others are unaffected', async () => {
  const A = await startAdmin(FULL);
  const ip = '198.51.100.66';
  const fiveFails = async () => {
    for (let i = 0; i < 5; i += 1) assert.strictEqual((await signIn(A, { ip, password: `wrong${i}` })).r.status, 401, `try ${i + 1}`);
  };
  await fiveFails();
  const locked = await signIn(A, { ip }); // the right password and code
  assert.strictEqual(locked.r.status, 429);
  assert.ok(locked.r.text.includes('Too many attempts. Please try again later.'));
  assert.ok(!/\d+ (minutes?|hours?|seconds?)|remaining|left/i.test(locked.r.text), 'no counters or times shown');
  assert.strictEqual(locked.r.headers.get('retry-after'), null);
  assert.strictEqual((await signIn(A, { ip: '198.51.100.67' })).r.status, 303, 'another address can still sign in');
  A.clock.t += 16 * 60000; // the first lock (15 minutes) is over
  await fiveFails();
  A.clock.t += 16 * 60000;
  assert.strictEqual((await signIn(A, { ip })).r.status, 429, 'the second lock lasts 30 minutes');
  A.clock.t += 15 * 60000;
  assert.strictEqual((await signIn(A, { ip })).r.status, 303);
  // IPv6 addresses count by their /64
  const B = await startAdmin(FULL);
  for (let i = 1; i <= 5; i += 1) assert.strictEqual((await signIn(B, { ip: `2001:db8:1:2::${i}`, password: 'no' })).r.status, 401);
  assert.strictEqual((await signIn(B, { ip: '2001:db8:1:2::99' })).r.status, 429);
  assert.strictEqual((await signIn(B, { ip: '2001:db8:1:3::1' })).r.status, 303);
});

test('admin: 20 failures from all addresses lock sign-in for everyone for 15 minutes', async () => {
  const A = await startAdmin(FULL);
  for (let b = 0; b < 4; b += 1) {
    const batch = await Promise.all(Array.from({ length: 5 }, (_, i) => signIn(A, { ip: `203.0.113.${b * 5 + i + 1}`, password: 'nope' })));
    for (const { r } of batch) assert.strictEqual(r.status, 401);
  }
  const right = await signIn(A, { ip: '192.0.2.200' });
  const wrong = await signIn(A, { ip: '192.0.2.201', password: 'nope' });
  assert.strictEqual(right.r.status, 429, 'even the right password fails while locked');
  assert.strictEqual(wrong.r.status, 429);
  assert.strictEqual(noCsrf(right.r.text), noCsrf(wrong.r.text), 'the same answer either way');
  const audit = fs.readFileSync(path.join(TMP, 'admin-audit.jsonl'), 'utf8');
  assert.ok(audit.split('\n').filter(Boolean).map(JSON.parse).some((e) => e.event === 'lockout' && e.detail.scope === 'global'));
  A.clock.t += 16 * 60000;
  assert.strictEqual((await signIn(A, { ip: '192.0.2.200' })).r.status, 303);
});

test('admin: password plus code signs in with a strict cookie; a used code is refused', async () => {
  const A = await startAdmin(FULL);
  const ip = '198.51.100.80';
  const first = await signIn(A, { ip });
  assert.strictEqual(first.r.status, 303);
  assert.strictEqual(first.r.headers.get('location'), ADMIN);
  const dev = first.r.cookies.find((c) => c.startsWith('sv_admin_dev='));
  assert.ok(dev, 'development over http: the sv_admin_dev cookie');
  const attrs = dev.split(';').map((s) => s.trim().toLowerCase());
  assert.ok(attrs.includes('httponly') && attrs.includes('samesite=strict') && attrs.includes('path=/') && attrs.includes('max-age=7200'));
  assert.ok(!attrs.some((a) => a.startsWith('domain=')), 'no Domain');
  assert.ok(!attrs.includes('secure'), 'no Secure on plain http in development (documented)');
  assert.ok(/^[A-Za-z0-9_-]{43}$/.test(first.jar.get('sv_admin_dev')), '32 random bytes');
  assert.ok(isDash((await areq(A, 'GET', ADMIN, { ip, jar: first.jar })).text));
  // the same code again, in the same 30 seconds: refused
  assert.strictEqual((await signIn(A, { ip: '198.51.100.81', code: totp(A.clock.t) })).r.status, 401);
  // the next code works; over HTTPS the cookie is __Host- and Secure
  A.clock.t += 30000;
  const secure = await signIn(A, { ip: '198.51.100.82', https: true });
  assert.strictEqual(secure.r.status, 303);
  const host = secure.r.cookies.find((c) => c.startsWith('__Host-sv_admin='));
  const hattrs = host.split(';').map((s) => s.trim().toLowerCase());
  assert.ok(hattrs.includes('secure') && hattrs.includes('httponly') && hattrs.includes('samesite=strict') && hattrs.includes('path=/'));
  assert.ok(!hattrs.some((a) => a.startsWith('domain=')));
  // signing in again replaces the session: the old token stops working
  A.clock.t += 30000;
  const old = first.jar.get('sv_admin_dev');
  const pre = new Map();
  const form = { csrf: csrfIn((await areq(A, 'GET', ADMIN, { ip, jar: pre })).text), user: A_USER, password: A_PASS, code: totp(A.clock.t) };
  seen.codes.add(form.code);
  const both = new Map([...pre, ['sv_admin_dev', old]]);
  assert.strictEqual((await areq(A, 'POST', `${ADMIN}/login`, { ip, jar: both, form })).status, 303);
  assert.notStrictEqual(both.get('sv_admin_dev'), old);
  assert.ok(isLogin((await areq(A, 'GET', ADMIN, { ip, jar: new Map([['sv_admin_dev', old]]) })).text), 'old token is dead');
  assert.ok(isDash((await areq(A, 'GET', ADMIN, { ip, jar: both })).text));
  assert.ok((await areq(A, 'GET', ADMIN, { ip: '198.51.100.83' })).text.includes('name="code"'), 'the form always asks for the code');
});

test('admin: the authenticator code is mandatory; there is no password-only sign-in', async () => {
  // Without ADMIN_TOTP_SECRET the page does not exist, and one line says why.
  const warns = [];
  const orig = console.warn;
  console.warn = (m) => warns.push(String(m));
  let noTotp;
  try { noTotp = await startAdmin({ ADMIN_USER: A_USER, ADMIN_PASSWORD_HASH: A_HASH }); } finally { console.warn = orig; }
  await assertPlain404(noTotp, ADMIN);
  await assertPlain404(noTotp, `${ADMIN}/login`, { method: 'POST', form: { user: A_USER, password: A_PASS } });
  await assertPlain404(noTotp, `${ADMIN}/login`, { method: 'POST', form: { user: A_USER, password: A_PASS, code: totp(noTotp.clock.t) } });
  assert.strictEqual(warns.length, 1, 'one log line');
  assert.ok(warns[0].startsWith('[admin] private page off') && warns[0].includes('ADMIN_TOTP_SECRET is not set') && warns[0].includes('mandatory'), warns[0]);
  assert.ok(!warns[0].includes(A_HASH.split('$')[4]), 'no secret in the line');
  assert.strictEqual(noTotp.app.locals.admin.enabled, false);
  assert.strictEqual(admin.loadAdminConfig({ env: { ADMIN_ENV_FILE: path.join(ENV_DIR, 'none.env'), ADMIN_USER: A_USER, ADMIN_PASSWORD_HASH: A_HASH }, root: __dirname }).enabled, false);
  // Nothing configured at all: also one line.
  const none = admin.loadAdminConfig({ env: { ADMIN_ENV_FILE: path.join(ENV_DIR, 'none.env') }, root: __dirname });
  assert.ok(!none.enabled && none.warning.includes('not configured'));

  // With it: the right password alone, an empty code, or a wrong code all fail the same way.
  const A = await startAdmin(FULL);
  const good = totp(A.clock.t);
  const near = new Set([totp(A.clock.t - 30000), good, totp(A.clock.t + 30000)]);
  let wrong = good;
  while (near.has(wrong)) wrong = String((Number(wrong) + 7) % 1000000).padStart(6, '0');
  const answers = [];
  for (const [i, code] of [null, '', wrong, ' ', '12345', '1234567', `${good}0`].entries()) {
    const { r } = await signIn(A, { ip: `198.51.100.${170 + i}`, code });
    if (code !== null && !/^\d{6,}$/.test(code)) seen.codes.delete(code); // too short to search the audit log for
    assert.strictEqual(r.status, 401, `code ${JSON.stringify(code)}`);
    assert.ok(r.text.includes('That did not work. Check your details and try again.'));
    assert.ok(!r.cookies.some((c) => /^(sv_admin_dev|__Host-sv_admin)=[^;]/.test(c)), 'no session cookie');
    answers.push(noCsrf(r.text));
  }
  assert.ok(answers.every((b) => b === answers[0]), 'password without a code and password with a wrong code get the same page');
  const audit = fs.readFileSync(path.join(TMP, 'admin-audit.jsonl'), 'utf8');
  assert.ok(!audit.includes(wrong), 'the wrong code is not logged');
  // The right password and the current code: signed in.
  const ok = await signIn(A, { ip: '198.51.100.180', code: good });
  assert.strictEqual(ok.r.status, 303);
  assert.ok(isDash((await areq(A, 'GET', ADMIN, { ip: '198.51.100.180', jar: ok.jar })).text));
});

test('admin: pages need a session, which ends when idle, at its age limit, and on logout', async () => {
  const A = await startAdmin(FULL);
  const ip = '198.51.100.90';
  const anon = await areq(A, 'GET', ADMIN, { ip });
  assert.strictEqual(anon.status, 200);
  assert.ok(isLogin(anon.text));
  await assertPlain404(A, `${ADMIN}/export?form=beta`, { ip });
  await assertPlain404(A, `${ADMIN}/assets/dashboard.js`, { ip });
  let s = await signIn(A, { ip });
  const js = await areq(A, 'GET', `${ADMIN}/assets/dashboard.js`, { ip, jar: s.jar });
  assert.strictEqual(js.status, 200);
  assert.ok(js.headers.get('content-type').includes('javascript') && js.headers.get('cache-control').includes('no-store'));
  A.clock.t += 21 * 60000; // past the 20-minute idle limit
  assert.ok(isLogin((await areq(A, 'GET', ADMIN, { ip, jar: s.jar })).text), 'idle session ended');
  await assertPlain404(A, `${ADMIN}/assets/dashboard.js`, { ip, jar: s.jar });
  s = await signIn(A, { ip });
  for (let i = 1; i <= 7; i += 1) {
    A.clock.t += 15 * 60000;
    assert.ok(isDash((await areq(A, 'GET', ADMIN, { ip, jar: s.jar })).text), `still signed in at ${i * 15} minutes`);
  }
  A.clock.t += 15 * 60000;
  assert.ok(isLogin((await areq(A, 'GET', ADMIN, { ip, jar: s.jar })).text), 'ended at 2 hours, however active');
  s = await signIn(A, { ip });
  const csrf = await dashCsrf(A, s.jar, ip);
  const before = new Map(s.jar);
  const out = await areq(A, 'POST', `${ADMIN}/logout`, { ip, jar: s.jar, form: { csrf } });
  assert.strictEqual(out.status, 303);
  assert.ok(out.cookies.some((c) => c.startsWith('sv_admin_dev=;') && /Max-Age=0/.test(c)), 'cookie cleared');
  assert.ok(isLogin((await areq(A, 'GET', ADMIN, { ip, jar: before })).text), 'the token is dead on the server too');
});

test('admin: delete and logout need the session CSRF token and this origin; sign-in needs its own token', async () => {
  await post('/api/investors', { name: 'Csrf Target', email: 'csrf@example.com', message: 'Please do not delete me.', ...human });
  const target = readAll('investors').find((r) => r.email === 'csrf@example.com');
  const A = await startAdmin(FULL);
  const ip = '198.51.100.100';
  const s = await signIn(A, { ip });
  const csrf = await dashCsrf(A, s.jar, ip);
  const del = { form: 'investors', id: target.id, confirm: 'yes' };
  const wrongTok = csrf.slice(0, -1) + (csrf.endsWith('A') ? 'B' : 'A');
  const refused = [
    { form: del },
    { form: { ...del, csrf: wrongTok } },
    { form: { ...del, csrf }, origin: 'https://evil.example' },
    { form: { ...del, csrf }, origin: 'null', headers: { 'Sec-Fetch-Site': 'cross-site' } },
    { form: { ...del, csrf }, origin: null, headers: { 'Sec-Fetch-Site': 'same-site' } },
    { form: { ...del, csrf }, origin: null },
  ];
  for (const [i, o] of refused.entries()) {
    const r = await areq(A, 'POST', `${ADMIN}/delete`, { ip, jar: s.jar, ...o });
    assert.strictEqual(r.status, 403, `case ${i + 1}`);
  }
  assert.ok(readAll('investors').some((r) => r.id === target.id), 'nothing deleted');
  // a real browser on the page sends Origin: null (no-referrer) and Sec-Fetch-Site: same-origin
  const ok = await areq(A, 'POST', `${ADMIN}/delete`, { ip, jar: s.jar, form: { ...del, csrf }, origin: 'null', headers: { 'Sec-Fetch-Site': 'same-origin' } });
  assert.strictEqual(ok.status, 303);
  assert.ok(!readAll('investors').some((r) => r.id === target.id));
  assert.strictEqual((await areq(A, 'POST', `${ADMIN}/logout`, { ip, jar: s.jar, form: {} })).status, 403);
  assert.strictEqual((await areq(A, 'POST', `${ADMIN}/logout`, { ip, jar: s.jar, form: { csrf }, origin: 'https://evil.example' })).status, 403);
  assert.ok(isDash((await areq(A, 'GET', ADMIN, { ip, jar: s.jar })).text), 'still signed in');
  // sign-in: the form's token and its cookie are both needed, from this origin
  const ip2 = '198.51.100.101';
  const jar = new Map();
  const token = csrfIn((await areq(A, 'GET', ADMIN, { ip: ip2, jar })).text);
  const creds = { user: A_USER, password: A_PASS, code: totp(A.clock.t + 30000) };
  seen.codes.add(creds.code);
  assert.strictEqual((await areq(A, 'POST', `${ADMIN}/login`, { ip: ip2, jar, form: creds })).status, 403);
  assert.strictEqual((await areq(A, 'POST', `${ADMIN}/login`, { ip: ip2, form: { ...creds, csrf: token } })).status, 403, 'token without its cookie');
  assert.strictEqual((await areq(A, 'POST', `${ADMIN}/login`, { ip: ip2, jar, form: { ...creds, csrf: token }, origin: 'https://evil.example' })).status, 403);
  assert.strictEqual((await areq(A, 'POST', `${ADMIN}/login`, { ip: ip2, jar: new Map(jar), form: { ...creds, csrf: token }, origin: null })).status, 403);
  A.clock.t += 30000;
  assert.strictEqual((await areq(A, 'POST', `${ADMIN}/login`, { ip: ip2, jar, form: { ...creds, csrf: token } })).status, 303);
});

test('admin: submissions are shown as text, never as HTML, with strict headers', async () => {
  await post('/api/beta', { email: 'xss@example.com', name: '<script>alert(1)</script>', role: 'learner', why: '<img src=x onerror=alert(2)> I would like to join the beta please.', age_ok: 'yes', consent: 'yes', ...human });
  await post('/api/investors', { name: '"><svg onload=alert(3)>', email: 'xss2@example.com', firm: '</td></tr></table><b>bold</b>', message: 'It\'s <b>urgent</b> & "quoted"', ...human });
  const A = await startAdmin(FULL);
  const ip = '198.51.100.110';
  const { jar } = await signIn(A, { ip });
  for (const tab of ['all', 'beta', 'investors']) {
    const r = await areq(A, 'GET', `${ADMIN}?form=${tab}`, { ip, jar });
    assert.strictEqual(r.status, 200);
    for (const raw of ['<script>alert', '<img src=x', '<svg onload', '<b>bold', '<b>urgent']) assert.ok(!r.text.includes(raw), `${tab}: ${raw}`);
    for (const m of r.text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      assert.ok(/\ssrc="\/(assets|donteventry\/assets)\/[a-z-]+\.js"/.test(m[1]), 'scripts are files from this site');
      assert.strictEqual(m[2].trim(), '', 'no inline script');
    }
    assert.ok(!/\sstyle="/.test(r.text), 'no inline styles');
    const h = r.headers;
    assert.ok(h.get('cache-control').includes('no-store'));
    assert.ok(h.get('x-robots-tag').includes('noindex') && h.get('x-robots-tag').includes('nofollow'));
    const csp = h.get('content-security-policy');
    for (const d of ["default-src 'self'", "script-src 'self'", "style-src 'self'", "frame-ancestors 'none'", "form-action 'self'", "base-uri 'none'"]) assert.ok(csp.includes(d), d);
    assert.strictEqual(h.get('referrer-policy'), 'no-referrer');
    assert.strictEqual(h.get('x-frame-options'), 'DENY');
    assert.ok(h.get('permissions-policy').includes('camera=()'));
    assert.ok(r.text.includes('<meta name="robots" content="noindex, nofollow'));
  }
  const beta = (await areq(A, 'GET', `${ADMIN}?form=beta`, { ip, jar })).text;
  assert.ok(beta.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(beta.includes('&lt;img src=x onerror=alert(2)&gt;'));
  const inv = (await areq(A, 'GET', `${ADMIN}?form=investors`, { ip, jar })).text;
  assert.ok(inv.includes('&quot;&gt;&lt;svg onload=alert(3)&gt;'));
  assert.ok(inv.includes('It&#39;s &lt;b&gt;urgent&lt;/b&gt; &amp; &quot;quoted&quot;'));
  const q = await areq(A, 'GET', `${ADMIN}?form=beta&q=${encodeURIComponent('"><script>x</script>')}`, { ip, jar });
  assert.ok(q.text.includes('value="&quot;&gt;&lt;script&gt;x&lt;/script&gt;"') && !q.text.includes('<script>x'));
  assert.strictEqual((await areq(A, 'GET', `${ADMIN}?form=beta&form=all&q=a&q=b&done[x]=1`, { ip, jar })).status, 200, 'odd query shapes are harmless');
  const found = (await areq(A, 'GET', `${ADMIN}?form=all&q=XSS2%40example`, { ip, jar })).text;
  assert.ok(found.includes('xss2@example.com') && !found.includes('xss@example.com'), 'search is case-insensitive');
  const login = await areq(A, 'GET', ADMIN, { ip });
  assert.ok(login.headers.get('cache-control').includes('no-store') && login.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
  assert.ok(!/<script\b[^>]*>[^<]+<\/script>/i.test(login.text));
});

test('admin: delete removes exactly one record, after a confirm step', async () => {
  for (let i = 0; i < 3; i += 1) await post('/api/investors', { name: `Triple ${i}`, email: 'triple@example.com', message: `Note number ${i} for the delete test.`, ...human });
  const before = readAll('investors');
  const trip = before.filter((r) => r.email === 'triple@example.com');
  assert.strictEqual(trip.length, 3);
  const updatesBefore = readAll('updates').length;
  const A = await startAdmin(FULL);
  const ip = '198.51.100.120';
  const { jar } = await signIn(A, { ip });
  const dash = (await areq(A, 'GET', `${ADMIN}?form=investors`, { ip, jar })).text;
  assert.ok(dash.includes(`name="id" value="${trip[1].id}"`) && dash.includes('Confirm delete') && dash.includes('<details class="admin-delete">'));
  const csrf = csrfIn(dash);
  const bad = [
    { csrf, form: 'investors', id: trip[1].id },                    // no confirm step
    { csrf, form: '../updates', id: trip[1].id, confirm: 'yes' },
    { csrf, form: 'investors', id: 'zz', confirm: 'yes' },
  ];
  for (const form of bad) assert.strictEqual((await areq(A, 'POST', `${ADMIN}/delete`, { ip, jar, form })).status, 400);
  assert.strictEqual(readAll('investors').length, before.length);
  const form = { csrf, form: 'investors', id: trip[1].id, confirm: 'yes', back: 'investors' };
  const r = await areq(A, 'POST', `${ADMIN}/delete`, { ip, jar, form });
  assert.strictEqual(r.status, 303);
  assert.strictEqual(r.headers.get('location'), `${ADMIN}?form=investors&done=deleted`);
  const after = readAll('investors');
  assert.strictEqual(after.length, before.length - 1, 'exactly one went');
  assert.ok(!after.some((x) => x.id === trip[1].id));
  assert.ok(after.some((x) => x.id === trip[0].id) && after.some((x) => x.id === trip[2].id));
  assert.strictEqual(readAll('updates').length, updatesBefore, 'other forms untouched');
  const again = await areq(A, 'POST', `${ADMIN}/delete`, { ip, jar, form });
  assert.strictEqual(again.headers.get('location'), `${ADMIN}?form=investors&done=missing`);
  assert.strictEqual(readAll('investors').length, before.length - 1);
  assert.ok((await areq(A, 'GET', r.headers.get('location'), { ip, jar })).text.includes('Deleted one entry.'));
});

test('admin: CSV export is safe from formula injection', async () => {
  await post('/api/investors', { name: '=HYPERLINK("http://evil.example","click")', email: 'csv@example.com', firm: '@SUM(1+1)', message: '+44 20 7946 0000, then -2+3\tand more', ...human });
  await post('/api/updates', { email: '-2+3@example.com', consent: 'yes', ...human });
  const A = await startAdmin(FULL);
  const ip = '198.51.100.130';
  const { jar } = await signIn(A, { ip });
  const r = await areq(A, 'GET', `${ADMIN}/export?form=investors`, { ip, jar });
  assert.strictEqual(r.status, 200);
  assert.ok(r.headers.get('content-type').startsWith('text/csv'));
  assert.strictEqual(r.headers.get('content-disposition'), 'attachment; filename="savant-investors-2026-10-25.csv"');
  assert.ok(r.headers.get('cache-control').includes('no-store'));
  assert.ok(r.text.includes('"\'=HYPERLINK(""http://evil.example"",""click"")"'));
  const rows = parseCsv(r.text.replace(/^﻿/, ''));
  const flat = rows.flat();
  assert.ok(flat.includes("'@SUM(1+1)") && flat.some((c) => c.startsWith("'+44 20")));
  const upd = parseCsv((await areq(A, 'GET', `${ADMIN}/export?form=updates`, { ip, jar })).text.replace(/^﻿/, '')).flat();
  assert.ok(upd.includes("'-2+3@example.com"));
  for (const c of [...flat, ...upd]) assert.ok(!/^[=+\-@\t\r]/.test(c), `cell starts with a formula character: ${c}`);
  await assertPlain404(A, `${ADMIN}/export?form=all`, { ip, jar });
  await assertPlain404(A, `${ADMIN}/export?form=..%2Fadmin-audit`, { ip, jar });
});

test('admin: admin.env, the admin code, the audit log and data files are never served', async () => {
  const A = await startAdmin(FULL);
  const ip = '198.51.100.140';
  const { jar } = await signIn(A, { ip });
  const paths = ['/admin.env', '/admin.env.bak', '/admin.env.example', '/ADMIN.ENV', '/admin%2eenv', '/assets/admin.env', '/fonts/admin.env',
    '/admin.js', '/admin-assets/dashboard.js', '/data/admin-audit.jsonl', '/data/investors.jsonl', '/.env', '/.git/config', '/assets/.hidden',
    '/donteventry/admin.env', '/donteventry/assets/admin.env', '/donteventry/assets/..%2f..%2fadmin.env', '/donteventry/assets/..%2fdashboard.js',
    '/donteventry/data/admin-audit.jsonl', '/donteventry/admin.js', '/robots.txt'];
  for (const p of paths) {
    for (const j of [undefined, jar]) {
      const r = await areq(A, 'GET', p, { ip, jar: j && new Map(j) });
      assert.strictEqual(r.status, 404, p);
      assert.ok(!r.text.includes('ADMIN_') && !r.text.includes('scrypt$') && !r.text.includes('"event"'), p);
    }
  }
  for (const p of ['/', '/privacy.html', '/evidence.html', '/thanks.html', '/no-such-page', '/config.js', '/assets/site.js', '/assets/site.css', '/assets/theme.js', '/favicon.svg']) {
    const t = await (await fetch(base + p)).text();
    assert.ok(!t.toLowerCase().includes('donteventry'), `${p} never mentions the admin path`);
  }
});

test('api: only the health check, the beacons and the form posts exist; any other /api route is 404 or 405', async () => {
  const A = await startAdmin(FULL);
  const POSTS = ['updates', 'beta', 'investors', 'forget', 'visit', 'visit-events', 'visit-choice'];
  // Every route the app defines under /api, read from the router itself.
  const defined = new Set();
  for (const layer of A.app._router.stack) {
    const p = layer.route && layer.route.path;
    if (typeof p !== 'string' || !p.startsWith('/api')) continue;
    // The last one, app.all('/api/*'), is the catch-all 404 for every method.
    if (p === '/api/*') defined.add('ANY /api/*');
    else for (const m of Object.keys(layer.route.methods)) defined.add(`${m.toUpperCase()} ${p}`);
  }
  assert.deepStrictEqual([...defined].sort(), ['GET /api/health', ...POSTS.map((n) => `POST /api/${n}`), 'ANY /api/*'].sort(), 'no other /api route exists');
  const catchAll = A.app._router.stack.filter((l) => l.route && l.route.path === '/api/*');
  assert.strictEqual(catchAll.length, 1);
  assert.ok(A.app._router.stack.indexOf(catchAll[0]) > Math.max(...A.app._router.stack.filter((l) => l.route && l.route.path.startsWith('/api/') && l !== catchAll[0]).map((l) => A.app._router.stack.indexOf(l))), 'the catch-all comes after every real /api route');
  const ip = '198.51.100.190';
  const { jar } = await signIn(A, { ip });
  const probes = [
    '/api', '/api/', '/api/admin', '/api/export', '/api/export?form=beta', '/api/submissions', '/api/stats', '/api/analytics', '/api/visits',
    '/api/audit', '/api/admin-audit', '/api/log', '/api/data', '/api/data/beta.jsonl', '/api/beta.jsonl', '/api/%2e%2e/data/beta.jsonl',
    '/api/..%2fdata%2fbeta.jsonl', '/api/health/x', '/api/health.json','/api/donteventry', '/api/visit-counts', '/api/users', '/api/session',
  ];
  const checks = [];
  for (const p of probes) for (const m of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) checks.push([m, p]);
  for (const n of POSTS) for (const m of ['GET', 'PUT', 'PATCH', 'DELETE']) checks.push([m, `/api/${n}`]);
  for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) checks.push([m, '/api/health']);
  for (const [method, p] of checks) {
    for (const j of [undefined, jar]) {
      const h = { 'X-Forwarded-For': ip, 'User-Agent': 'savant-test', Origin: A.base, 'Content-Type': 'application/json' };
      if (j) h.Cookie = [...j].map(([k, v]) => `${k}=${v}`).join('; ');
      const r = await fetch(A.base + p, { method, headers: h, body: ['GET', 'OPTIONS'].includes(method) ? undefined : '{}', redirect: 'manual' });
      const text = await r.text();
      assert.ok(r.status === 404 || r.status === 405, `${method} ${p}${j ? ' (signed in)' : ''}: ${r.status}`);
      assert.ok(!text.includes('"email"') && !text.includes('"event"') && !text.includes('@example.com'), `${method} ${p}: no data`);
      assert.strictEqual(r.headers.get('access-control-allow-origin'), null, `${method} ${p}: no CORS`);
    }
  }
});

// Registered last (below), so the data folder by then holds forms, visits and the audit log.
const ownerOnlyData = async () => {
  const marker = `owner-only-${crypto.randomBytes(5).toString('hex')}@example.com`;
  assert.strictEqual((await post('/api/updates', { email: marker, consent: 'yes', ...human })).status, 200);
  const A = await startAdmin(FULL);
  const ip = '198.51.100.195';
  const { jar } = await signIn(A, { ip });
  // Every file in the data folder, by every spelling of its path the server might map.
  const rels = filesUnder(TMP).map((f) => path.relative(TMP, f).split(path.sep).join('/')).filter((f) => !f.startsWith('geo/') && !f.endsWith('.csv'));
  assert.ok(rels.includes('updates.jsonl') && rels.includes('admin-audit.jsonl') && rels.some((f) => f.startsWith('visits/')), 'the probe covers forms, audit log and visits');
  const prefixes = ['/', '/data/', '/api/', '/assets/', '/fonts/', '/geo/', '/donteventry/', '/donteventry/assets/', '/donteventry/data/', '/assets/..%2fdata/', '/donteventry/assets/..%2f..%2fdata/', '/%2e%2e/data/'];
  const snippets = rels.map((f) => {
    const b = fs.readFileSync(path.join(TMP, f));
    return /\.gz$/.test(f) ? null : b.toString('utf8').slice(0, 40);
  }).filter((s) => s && s.length >= 20);
  for (const rel of rels) {
    for (const pre of prefixes) {
      for (const [app, j] of [[{ base }, undefined], [A, undefined], [A, jar]]) {
        const r = await areq(app, 'GET', `${pre}${rel.split('/').map(encodeURIComponent).join('/')}`, { ip, jar: j && new Map(j) });
        assert.strictEqual(r.status, 404, `${pre}${rel}`);
        assert.ok(!r.text.includes(marker) && !snippets.some((s) => r.text.includes(s)), `${pre}${rel}: no file content`);
      }
    }
  }
  // Without a session: the sign-in form only, never a submission, a visit or an audit event.
  for (const q of ['', '?form=all', '?form=updates', '?form=visitors']) {
    const r = await areq(A, 'GET', `${ADMIN}${q}`, { ip: '198.51.100.196' });
    assert.ok(isLogin(r.text) && !r.text.includes(marker) && !r.text.includes('login_ok') && !r.text.includes('Recent activity'), q);
  }
  await assertPlain404(A, `${ADMIN}/export?form=updates`, { ip: '198.51.100.196' });
  // Signed in, the same data is there.
  const exp = await areq(A, 'GET', `${ADMIN}/export?form=updates`, { ip, jar });
  assert.ok(exp.status === 200 && exp.text.includes(marker));
  const dash = await areq(A, 'GET', `${ADMIN}?form=updates`, { ip, jar });
  assert.ok(dash.text.includes(marker) && dash.text.includes('Recent activity'));
  // On a server (not Windows), the data folder is put back to owner-only at start.
  if (process.platform !== 'win32') {
    const { lockDownData } = require('./server');
    const d = path.join(TMP, 'lockdown');
    fs.mkdirSync(path.join(d, 'sub'), { recursive: true, mode: 0o755 });
    fs.chmodSync(d, 0o755);
    fs.chmodSync(path.join(d, 'sub'), 0o775);
    fs.writeFileSync(path.join(d, 'a.jsonl'), 'x\n', { mode: 0o644 });
    fs.writeFileSync(path.join(d, 'sub', 'b.json'), '{}', { mode: 0o666 });
    fs.chmodSync(path.join(d, 'sub', 'b.json'), 0o666);
    const orig = console.warn;
    console.warn = () => {};
    try { assert.strictEqual(lockDownData(d), 4); } finally { console.warn = orig; }
    for (const [p, m] of [[d, 0o700], [path.join(d, 'sub'), 0o700], [path.join(d, 'a.jsonl'), 0o600], [path.join(d, 'sub', 'b.json'), 0o600]]) assert.strictEqual(fs.statSync(p).mode & 0o777, m, p);
    assert.strictEqual(lockDownData(d), 0, 'nothing left to change');
    fs.rmSync(d, { recursive: true, force: true });
    for (const f of filesUnder(TMP).filter((x) => /\.(jsonl|json)$/.test(x) && !x.includes(`${path.sep}geo${path.sep}`))) {
      assert.strictEqual(fs.statSync(f).mode & 0o077, 0, `${f} is owner-only`);
    }
  }
};

test('admin: small form bodies only', async () => {
  const A = await startAdmin(FULL);
  const ip = '198.51.100.150';
  const { jar } = await signIn(A, { ip });
  const csrf = await dashCsrf(A, jar, ip);
  const form = { csrf, form: 'investors', id: '0'.repeat(16), confirm: 'yes' };
  const big = await areq(A, 'POST', `${ADMIN}/delete`, { ip, jar, form: { ...form, pad: 'x'.repeat(5000) } });
  assert.strictEqual(big.status, 413);
  assert.ok(!/node_modules|\bat \S+ \(/.test(big.text), 'no stack trace');
  const many = await areq(A, 'POST', `${ADMIN}/delete`, { ip, jar, form: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`f${i}`, 'x'])) });
  assert.strictEqual(many.status, 413);
  assert.strictEqual((await areq(A, 'POST', `${ADMIN}/delete`, { ip, jar, type: 'application/json', body: JSON.stringify(form) })).status, 415);
  assert.strictEqual((await areq(A, 'POST', `${ADMIN}/logout`, { ip, jar, type: 'text/plain', body: `csrf=${csrf}` })).status, 415);
  assert.strictEqual((await areq(A, 'POST', `${ADMIN}/login`, { ip, type: 'application/json', body: '{}' })).status, 415);
  assert.ok(isDash((await areq(A, 'GET', ADMIN, { ip, jar })).text));
});

test('admin: node server.js admin-hash and admin-totp', async () => {
  const env = { ...process.env, DATA_DIR: TMP, ADMIN_ENV_FILE: path.join(ENV_DIR, 'none.env') };
  for (const k of [...admin.ADMIN_KEYS, 'ADMIN_PASSWORD_INPUT']) delete env[k];
  const run = (args, o = {}) => spawnSync(process.execPath, [path.join(__dirname, 'server.js'), ...args], { encoding: 'utf8', timeout: 60000, input: o.input, env: { ...env, ...(o.env || {}) } });
  const pw = crypto.randomBytes(24).toString('base64url');
  const hashOf = (out) => {
    const lines = out.split('\n').filter(Boolean);
    assert.strictEqual(lines.length, 1, 'only the hash line');
    const m = /^ADMIN_PASSWORD_HASH=(scrypt\$\d+\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+)$/.exec(lines[0]);
    assert.ok(m, 'the hash line');
    const h = admin.parseHash(m[1]);
    assert.ok(h && h.N >= 2 ** 15 && h.salt.length === 32 && h.key.length === 64);
    return h;
  };
  const r1 = run(['admin-hash'], { env: { ADMIN_PASSWORD_INPUT: pw } });
  assert.strictEqual(r1.status, 0, r1.stderr);
  const h1 = hashOf(r1.stdout);
  assert.ok(await admin.verifyPassword(pw, h1));
  assert.ok(!(await admin.verifyPassword(`${pw}x`, h1)));
  assert.ok(!r1.stdout.includes(pw) && !r1.stderr.includes(pw), 'the password is never echoed');
  const r2 = run(['admin-hash'], { input: `${pw}\n` }); // from stdin; the newline is not part of it
  assert.strictEqual(r2.status, 0, r2.stderr);
  assert.ok(await admin.verifyPassword(pw, hashOf(r2.stdout)));
  const weak = run(['admin-hash'], { env: { ADMIN_PASSWORD_INPUT: 'password1' } });
  assert.strictEqual(weak.status, 0);
  assert.ok(weak.stderr.includes('WARNING'), 'a weak password is warned about');
  hashOf(weak.stdout);
  for (const o of [{ env: { ADMIN_PASSWORD_INPUT: '' } }, { input: '' }]) {
    const empty = run(['admin-hash'], o);
    assert.notStrictEqual(empty.status, 0, 'an empty password is refused');
    assert.strictEqual(empty.stdout, '');
  }
  assert.ok(admin.weakPasswordReasons('abcd1234').length >= 2);
  assert.deepStrictEqual(admin.weakPasswordReasons('Rq7-vz2K-wpX9-tL4m-hc'), []);
  const t = run(['admin-totp'], { env: { ADMIN_USER: A_USER } });
  assert.strictEqual(t.status, 0, t.stderr);
  const [line, uri] = t.stdout.split('\n').filter(Boolean);
  const m = /^ADMIN_TOTP_SECRET=([A-Z2-7]{32})$/.exec(line);
  assert.ok(m, 'the secret line');
  assert.strictEqual(admin.base32Decode(m[1]).length, 20);
  assert.strictEqual(uri, `otpauth://totp/Savant:${A_USER}?secret=${m[1]}&issuer=Savant&algorithm=SHA1&digits=6&period=30`);
  assert.strictEqual(admin.hotp(admin.base32Decode(A_TOTP), Math.floor(T0 / 30000)), totp(T0), 'the server and this test agree on codes');
});

test('admin: the audit log records each event without secrets; files stay private', async () => {
  const file = path.join(TMP, 'admin-audit.jsonl');
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.trim().split('\n').map((l) => JSON.parse(l));
  const events = new Set(lines.map((l) => l.event));
  for (const e of ['login_ok', 'login_fail', 'lockout', 'logout', 'delete', 'export']) assert.ok(events.has(e), e);
  for (const l of lines) {
    assert.deepStrictEqual(Object.keys(l).filter((k) => !['at', 'event', 'ip', 'ua', 'detail'].includes(k)), []);
    assert.ok(l.ip && l.at && l.ua === 'savant-test');
  }
  assert.ok(lines.some((l) => l.event === 'lockout' && l.detail.scope === 'ip'));
  const [, , , , salt, key] = A_HASH.split('$');
  const secrets = [A_PASS, A_TOTP, A_HASH, salt, key, ...seen.tokens, ...seen.codes];
  assert.ok(seen.tokens.size > 20 && seen.codes.size >= 3, 'the check has tokens and codes to look for');
  for (const s of secrets) assert.ok(!text.includes(s), 'no password, code, hash or token in the audit log');
  assert.ok(!text.includes('wrong0') && !text.includes('nope'), 'no attempted password either');
  // the page shows the recent events
  const A = await startAdmin(FULL);
  const { jar } = await signIn(A, { ip: '198.51.100.160' });
  const dash = (await areq(A, 'GET', ADMIN, { ip: '198.51.100.160', jar })).text;
  assert.ok(dash.includes('Recent activity') && dash.includes('login_ok') && dash.includes('lockout'));
  assert.ok((dash.match(/<tr><td data-label="When">/g) || []).length <= 50, 'at most 50 events');
  if (process.platform !== 'win32') {
    assert.strictEqual(fs.statSync(file).mode & 0o777, 0o600);
    for (const f of ['updates', 'beta', 'investors']) assert.strictEqual(fs.statSync(path.join(TMP, `${f}.jsonl`)).mode & 0o777, 0o600, f);
  }
});

/* ── visit statistics ────────────────────────────────────────────────────── */

const zlib = require('zlib');
const net = require('net');
const AN = require('./analytics');
const { createReport, sessionize, joinSessions, funnel } = require('./analytics-report');
const { loadGeo, inConsentRegion } = require('./geo');
const Track = require('./assets/track.js');

let mainApp = null;
// A small DB-IP-shaped CSV: contiguous ranges, ZZ for the gaps, a quoted city with a
// comma, non-ASCII names, and IPv6 ranges. The tests below expect these places.
const GEO_CSV = [
  '0.0.0.0,7.255.255.255,ZZ,ZZ,,,0,0',
  '8.0.0.0,8.8.8.255,NA,US,California,"Mountain View",37.422,-122.085',
  '8.8.9.0,9.255.255.255,NA,US,Virginia,Ashburn,39.0438,-77.4874',
  '10.0.0.0,81.1.255.255,ZZ,ZZ,,,0,0',
  '81.2.0.0,81.2.69.255,EU,GB,England,London,51.5143,-0.0912244',
  '81.2.70.0,85.255.255.255,EU,DE,Hesse,"Frankfurt am Main",50.1109,8.68213',
  '86.0.0.0,86.255.255.255,EU,FR,"Île-de-France",Paris,48.8566,2.35222',
  '87.0.0.0,87.255.255.255,EU,CH,Zurich,Zürich,47.3769,8.54169',
  '88.0.0.0,88.255.255.255,EU,NO,Oslo,Oslo,59.9139,10.7522',
  '89.0.0.0,99.255.255.255,ZZ,ZZ,,,0,0',
  '100.0.0.0,100.255.255.255,AS,JP,Tokyo,Tokyo,35.6895,139.692',
  '101.0.0.0,101.255.255.255,SA,BR,"Rio de Janeiro","Rio de Janeiro",-22.9068,-43.1729',
  '102.0.0.0,102.255.255.255,OC,AU,"New South Wales",Sydney,-33.8688,151.209',
  '103.0.0.0,103.255.255.255,AS,IN,Maharashtra,Mumbai,19.076,72.8777',
  '104.0.0.0,104.0.0.255,NA,US,Texas,"Austin, Downtown",30.2672,-97.7431',
  '104.0.1.0,255.255.255.255,ZZ,ZZ,,,0,0',
  '::,2001:db7:ffff:ffff:ffff:ffff:ffff:ffff,ZZ,ZZ,,,0,0',
  '2001:db8::,2001:db8:0:ffff:ffff:ffff:ffff:ffff,EU,IE,Leinster,Dublin,53.3498,-6.26031',
  '2001:db8:1::,2001:db8:1:ffff:ffff:ffff:ffff:ffff,NA,US,"New York","New York",40.7128,-74.006',
  '2001:db8:2::,ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff,ZZ,ZZ,,,0,0',
].join('\n');

const UA = {
  chromeWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  edgeWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.2849.56',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  macChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  firefoxLinux: 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
  pixelReduced: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  galaxyTab: 'Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  instagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.20.94 (iPhone15,2; iOS 17_5; en_US)',
  chromeos: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  firefoxIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/131.0 Mobile/15E148 Safari/605.1.15',
};

async function vreq(route, body, { ip, ua = UA.chromeWin, headers = {}, at, type = 'application/json' } = {}) {
  const origin = at || base;
  const r = await fetch(`${origin}${route}`, {
    method: 'POST',
    headers: { 'Content-Type': type, Origin: origin, 'X-Forwarded-For': ip, 'User-Agent': ua, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { /* not JSON */ }
  return { status: r.status, json, headers: r.headers };
}
const visit = (body, o = {}) => vreq('/api/visit', { p: '/', r: '', c: '', ...body }, o);
const sendEvents = (body, o = {}) => vreq('/api/visit-events', body, { type: 'text/plain', ...o });
const settle = () => mainApp.locals.analytics.flush();
async function recordsOf(an, kind = 'v') {
  const out = [];
  for (const row of an.store.months()) if (row[kind]) await AN.readMonthFile(row[kind].file, kind, (r) => out.push(r));
  return out;
}
const allVisits = () => recordsOf(mainApp.locals.analytics, 'v');
const allEvents = () => recordsOf(mainApp.locals.analytics, 'e');
function filesUnder(dir) {
  const out = [];
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) out.push(...filesUnder(p)); else out.push(p);
  }
  return out;
}
/** Every stored byte of visit statistics (gz files unpacked). */
function statsText(dir = TMP) {
  return filesUnder(dir).filter((f) => /visit|[\\/]visits[\\/]/.test(f)).map((f) => {
    const b = fs.readFileSync(f);
    return /\.gz$/.test(f) ? zlib.gunzipSync(b).toString('utf8') : b.toString('utf8');
  }).join('\n');
}
const packed = (ip) => ip.split('.').reduce((n, x) => n * 256 + Number(x), 0);

/** A separate collector with its own folder and clock, for storage tests. */
let instN = 0;
function instance({ clock, env = {} }) {
  const dir = path.join(TMP, `inst-${++instN}`);
  fs.mkdirSync(dir, { recursive: true });
  let q = Promise.resolve();
  const serial = (fn) => { const run = q.then(fn, fn); q = run.catch(() => {}); return run; };
  const an = AN.createAnalytics({ dataDir: dir, serial, geo: loadGeo(process.env.GEO_FILE), now: () => clock.t, env, maintenance: false, pendingMs: 5 });
  return { an, dir };
}
const baseRec = (an, t, ip, extra = {}) => ({
  n: an.store.nextSeq(AN.monthOf(t)), t, ip, path: '/', source: 'direct', ref: '', utm: {}, cc: 'US', city: 'Austin', lat: 30.3, lon: -97.7,
  dev: { type: 'desktop', model: '', os: 'Windows', osv: '11', br: 'Chrome', brv: 130, w: 1280, h: 800, dpr: 1, lang: 'en-US', tz: 'America/Chicago' },
  consented: false, nf: false, ...extra,
});
const at = (y, m, d, h = 12, mi = 0) => Date.UTC(y, m - 1, d, h, mi);

/** A stand-in DOM element for the page script's helpers (track.js). */
function fake(tag, attrs = {}, { parent = null, text = '', style = null, cls = '' } = {}) {
  const matchOne = (n, s) => {
    const m = /^([a-z]*)((?:\[[^\]]+\])*)$/i.exec(s);
    if (!m) return false;
    if (m[1] && n.tagName !== m[1].toUpperCase()) return false;
    for (const a of m[2].match(/\[[^\]]+\]/g) || []) {
      const [, k, v] = /^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(a);
      if (!(k in n.attrs)) return false;
      if (v !== undefined && n.attrs[k] !== v) return false;
    }
    return true;
  };
  const el = {
    tagName: tag.toUpperCase(), attrs, parent, textContent: text, className: cls, style, id: attrs.id || '',
    getAttribute: (k) => (k in attrs ? attrs[k] : null),
    hasAttribute: (k) => k in attrs,
    closest(sel) {
      for (let n = this; n; n = n.parent) if (sel.split(',').some((s) => matchOne(n, s.trim()))) return n;
      return null;
    },
  };
  return el;
}

test('visits: the source comes from src, then UTM, then the referrer', async () => {
  const C = (o) => AN.classifySource({ ownHosts: ['savantedu.com'], ...o });
  const cases = [
    [{ ref: 'https://www.instagram.com/' }, 'instagram'], [{ ref: 'https://l.instagram.com/?u=x' }, 'instagram'],
    [{ ref: 'https://www.facebook.com/' }, 'facebook'], [{ ref: 'https://m.facebook.com/story.php' }, 'facebook'],
    [{ ref: 'https://l.facebook.com/l.php?u=x' }, 'facebook'], [{ ref: 'https://lm.facebook.com/' }, 'facebook'],
    [{ ref: 'https://fb.com/' }, 'facebook'], [{ ref: 'https://fb.me/x' }, 'facebook'],
    [{ ref: 'https://t.co/abc' }, 'x'], [{ ref: 'https://x.com/savant' }, 'x'], [{ ref: 'https://twitter.com/' }, 'x'], [{ ref: 'https://mobile.twitter.com/' }, 'x'],
    [{ ref: 'https://www.tiktok.com/@s' }, 'tiktok'], [{ ref: 'https://www.youtube.com/watch?v=1' }, 'youtube'],
    [{ ref: 'https://m.youtube.com/' }, 'youtube'], [{ ref: 'https://youtu.be/x' }, 'youtube'],
    [{ ref: 'https://www.linkedin.com/feed/' }, 'linkedin'], [{ ref: 'https://lnkd.in/abc' }, 'linkedin'],
    [{ ref: 'https://www.reddit.com/r/x' }, 'reddit'], [{ ref: 'https://old.reddit.com/' }, 'reddit'],
    [{ ref: 'https://www.google.com/search?q=savant' }, 'google'], [{ ref: 'https://www.google.co.uk/' }, 'google'],
    [{ ref: 'https://www.google.de/' }, 'google'], [{ ref: 'https://www.google.com.au/' }, 'google'],
    [{ ref: 'https://www.bing.com/search?q=a' }, 'bing'], [{ ref: 'https://duckduckgo.com/' }, 'duckduckgo'],
    [{ ref: 'https://search.yahoo.com/search?p=x' }, 'yahoo'],
    [{ ref: 'https://mail.google.com/mail/u/0/' }, 'email'], [{ ref: 'https://outlook.live.com/mail/0/' }, 'email'],
    [{ ref: 'https://outlook.office.com/' }, 'email'], [{ ref: 'https://mail.yahoo.com/' }, 'email'],
    [{ ref: 'https://news.ycombinator.com/item?id=1' }, 'news.ycombinator.com'], [{ ref: 'https://www.example.org/page?secret=1' }, 'example.org'],
    [{ ref: '' }, 'direct'], [{}, 'direct'], [{ ref: 'https://savantedu.com/privacy' }, 'internal'], [{ ref: 'https://www.savantedu.com/' }, 'internal'],
    [{ src: 'email' }, 'email'], [{ src: 'EMAIL', ref: 'https://www.google.com/' }, 'email'], [{ src: 'ig' }, 'instagram'],
    [{ src: 'Podcast Ep 3' }, 'podcast-ep-3'], [{ src: 'tiktok', utm: { source: 'youtube' } }, 'tiktok'],
    [{ utm: { source: 'newsletter', medium: 'email' } }, 'email'], [{ utm: { source: 'whatever', medium: 'Email' } }, 'email'],
    [{ utm: { source: 'twitter', medium: 'social' }, ref: 'https://www.google.com/' }, 'x'], [{ utm: { source: 'facebook' } }, 'facebook'],
    [{ utm: { source: 'partner-site' } }, 'partner-site'], [{ utm: { source: '<script>' } }, 'script'],
  ];
  for (const [input, want] of cases) assert.strictEqual(C(input), want, JSON.stringify(input));
  assert.strictEqual(AN.refHost('https://www.example.org/a?b=c#d'), 'www.example.org', 'the host only, no path or query');
  assert.strictEqual(AN.refHost('javascript:alert(1)'), '');
  // and through the server: the stored record has the host only
  const r = await visit({ r: 'https://www.example.org/private/page?token=abc#x', u: { s: 'news', m: 'email', c: 'oct' } }, { ip: '8.8.1.1' });
  assert.ok(r.json.v);
  await settle();
  const v = (await allVisits()).find((x) => x.ip === '8.8.1.1');
  assert.strictEqual(v.source, 'email');
  assert.strictEqual(v.ref, 'www.example.org');
  assert.deepStrictEqual(v.utm, { source: 'news', medium: 'email', campaign: 'oct' });
  assert.ok(!statsText().includes('token=abc') && !statsText().includes('/private/page'));
});

test('visits: device type, model, OS and browser from user agents and client hints', async () => {
  const D = (ua, h) => AN.parseDevice(ua, h);
  const pick = (d) => [d.type, d.model, d.os, d.osv, d.br, d.brv];
  assert.deepStrictEqual(pick(D(UA.iphone)), ['mobile', 'iPhone', 'iOS', '17', 'Safari', 17]);
  assert.deepStrictEqual(pick(D(UA.ipad)), ['tablet', 'iPad', 'iPadOS', '16', 'Safari', 16]);
  assert.deepStrictEqual(pick(D(UA.macSafari, { tp: 5 })), ['tablet', 'iPad', 'iPadOS', '17', 'Safari', 17], 'iPadOS asks for the desktop site');
  assert.deepStrictEqual(pick(D(UA.macSafari)), ['desktop', '', 'macOS', '10.15', 'Safari', 17]);
  assert.deepStrictEqual(pick(D(UA.macChrome, { pv: '14.5.0', platform: '"macOS"' })), ['desktop', '', 'macOS', '14', 'Chrome', 130]);
  assert.deepStrictEqual(pick(D(UA.chromeWin)), ['desktop', '', 'Windows', '10', 'Chrome', 130]);
  assert.deepStrictEqual(pick(D(UA.chromeWin, { pv: '15.0.0' })), ['desktop', '', 'Windows', '11', 'Chrome', 130], 'Windows 11 from the platform version hint');
  assert.deepStrictEqual(pick(D(UA.edgeWin)), ['desktop', '', 'Windows', '10', 'Edge', 130]);
  assert.deepStrictEqual(pick(D(UA.firefoxLinux)), ['desktop', '', 'Linux', '', 'Firefox', 131]);
  assert.deepStrictEqual(pick(D(UA.pixelReduced)), ['mobile', '', 'Android', '10', 'Chrome', 130], 'the reduced UA hides the model');
  assert.deepStrictEqual(pick(D(UA.pixelReduced, { model: 'Pixel 8', pv: '15.0.0', mobile: '?1' })), ['mobile', 'Pixel 8', 'Android', '15', 'Chrome', 130]);
  assert.deepStrictEqual(pick(D(UA.samsung)), ['mobile', 'Samsung SM-S918B', 'Android', '14', 'Samsung Internet', 25]);
  assert.deepStrictEqual(pick(D(UA.galaxyTab)), ['tablet', 'Samsung SM-X710', 'Android', '13', 'Chrome', 130]);
  assert.deepStrictEqual(pick(D(UA.instagram)), ['mobile', 'iPhone', 'iOS', '17', 'Instagram app', 350]);
  assert.deepStrictEqual(pick(D(UA.chromeos)), ['desktop', '', 'ChromeOS', '', 'Chrome', 130]);
  assert.deepStrictEqual(pick(D(UA.firefoxIos)), ['mobile', 'iPhone', 'iOS', '17', 'Firefox', 131]);
  assert.strictEqual(D('Mozilla/5.0 (X11; Linux) Something', { mobile: '?1' }).type, 'mobile', 'Sec-CH-UA-Mobile');
  for (const bot of ['Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', 'curl/8.4.0', 'python-requests/2.31',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/130.0.0.0 Safari/537.36', 'facebookexternalhit/1.1', '', 'x']) {
    assert.ok(AN.isBot(bot), bot);
  }
  for (const ua of Object.values(UA)) assert.ok(!AN.isBot(ua), ua);
  // screen size to the nearest 10 px, pixel ratio, language and time zone, through the server
  const r = await visit({}, { ip: '8.8.1.2', ua: UA.pixelReduced, headers: { 'Sec-CH-UA-Mobile': '?1', 'Sec-CH-UA-Platform': '"Android"' } });
  await sendEvents({ v: r.json.v, e: [], dev: { w: 412, h: 915, dpr: 2.625, lang: 'en-GB', tz: 'Europe/London', model: 'Pixel 8', pv: '15.0.0', tp: 5, mobile: true } }, { ip: '8.8.1.2', ua: UA.pixelReduced });
  await settle();
  const v = (await allVisits()).find((x) => x.ip === '8.8.1.2');
  assert.deepStrictEqual(v.dev, { type: 'mobile', model: 'Pixel 8', os: 'Android', osv: '15', br: 'Chrome', brv: 130, w: 410, h: 920, dpr: 2.63, lang: 'en-GB', tz: 'Europe/London' });
});

test('visits: the geo lookup matches the fixture for IPv4 and IPv6', async () => {
  const g = loadGeo(process.env.GEO_FILE);
  assert.ok(g, 'built and loaded');
  const L = (ip) => g.lookup(ip);
  assert.deepStrictEqual(L('8.8.8.8'), { cc: 'US', city: 'Mountain View', lat: 37.4, lon: -122.1 });
  assert.deepStrictEqual(L('8.0.0.0'), { cc: 'US', city: 'Mountain View', lat: 37.4, lon: -122.1 }, 'a range start');
  assert.deepStrictEqual(L('8.8.8.255'), { cc: 'US', city: 'Mountain View', lat: 37.4, lon: -122.1 }, 'a range end');
  assert.deepStrictEqual(L('8.8.9.0'), { cc: 'US', city: 'Ashburn', lat: 39, lon: -77.5 });
  assert.deepStrictEqual(L('81.2.69.142'), { cc: 'GB', city: 'London', lat: 51.5, lon: -0.1 });
  assert.deepStrictEqual(L('81.2.70.0'), { cc: 'DE', city: 'Frankfurt am Main', lat: 50.1, lon: 8.7 });
  assert.strictEqual(L('86.20.30.40').city, 'Paris');
  assert.strictEqual(L('87.1.2.3').city, 'Zürich', 'UTF-8 names');
  assert.strictEqual(L('88.1.1.1').cc, 'NO');
  assert.deepStrictEqual(L('101.1.1.1'), { cc: 'BR', city: 'Rio de Janeiro', lat: -22.9, lon: -43.2 });
  assert.strictEqual(L('104.0.0.9').city, 'Austin, Downtown', 'a quoted city with a comma');
  assert.deepStrictEqual(L('::ffff:8.8.8.8'), L('8.8.8.8'), 'IPv4-mapped IPv6');
  for (const ip of ['0.0.0.1', '10.1.2.3', '192.0.2.1', '255.255.255.255', '::1', '2001:db7::1', '2001:db8:2::1', 'not an ip', '']) assert.strictEqual(L(ip), null, ip);
  assert.deepStrictEqual(L('2001:db8::1'), { cc: 'IE', city: 'Dublin', lat: 53.3, lon: -6.3 });
  assert.deepStrictEqual(L('2001:db8:0:ffff:1:2:3:4'), { cc: 'IE', city: 'Dublin', lat: 53.3, lon: -6.3 });
  assert.deepStrictEqual(L('2001:DB8:1:ABCD::5'), { cc: 'US', city: 'New York', lat: 40.7, lon: -74 });
  assert.ok(g.info.v4 >= 10 && g.info.v6 >= 3 && g.info.v4blocks >= 5, 'several blocks were exercised');
  for (const cc of ['GB', 'IE', 'DE', 'FR', 'NO', 'IS', 'LI', 'CH', 'GG', 'JE', 'IM', 'RE']) assert.ok(inConsentRegion(cc), cc);
  for (const cc of ['US', 'CA', 'JP', 'BR', 'AU', 'IN', 'TR', 'RU', '']) assert.ok(!inConsentRegion(cc), cc);
});

test('visits: outside the UK/EU a page view is recorded with its IP, place and device', async () => {
  const r = await visit({ p: '/evidence', r: 'https://www.google.com/search?q=savant' }, { ip: '8.8.8.10', ua: UA.samsung });
  assert.strictEqual(r.status, 200);
  assert.ok(typeof r.json.v === 'string' && r.json.v.length >= 16, 'a page-view token');
  assert.strictEqual(r.json.notice, false, 'no notice outside the UK/EU');
  assert.strictEqual(r.headers.get('set-cookie'), null, 'no cookie');
  const ev = await sendEvents({ v: r.json.v, e: [{ k: 'sc', m: 25, o: 900 }, { k: 'si', s: 'how', o: 1000 }] }, { ip: '8.8.8.10', ua: UA.samsung });
  assert.strictEqual(ev.status, 200);
  await settle();
  const v = (await allVisits()).find((x) => x.ip === '8.8.8.10');
  assert.ok(v, 'stored');
  assert.strictEqual(v.path, '/evidence');
  assert.strictEqual(v.source, 'google');
  assert.strictEqual(v.ref, 'www.google.com');
  assert.deepStrictEqual([v.cc, v.city, v.lat, v.lon], ['US', 'Mountain View', 37.4, -122.1]);
  assert.deepStrictEqual([v.dev.type, v.dev.model, v.dev.os, v.dev.br], ['mobile', 'Samsung SM-S918B', 'Android', 'Samsung Internet']);
  assert.ok(Math.abs(v.t - Date.now() / 1000) < 60, 'epoch seconds');
  const raw = statsText();
  assert.ok(raw.includes(`"i":${packed('8.8.8.10')}`), 'IPv4 is stored as a number');
  const evs = (await allEvents()).filter((e) => e.v === v.n);
  assert.deepStrictEqual(evs.map((e) => e.k), ['sc', 'si']);
  assert.strictEqual(evs[0].o, 9, 'deciseconds since the page loaded');
  // IPv6 visitors are recorded too
  const six = await visit({}, { ip: '2001:db8:1::42' });
  assert.ok(six.json.v);
  await settle();
  assert.strictEqual((await allVisits()).find((x) => x.ip === '2001:db8:1::42').city, 'New York');
  if (process.platform !== 'win32') {
    for (const f of filesUnder(path.join(TMP, 'visits'))) assert.strictEqual(fs.statSync(f).mode & 0o777, 0o600, f);
  }
});

test('visits: UK/EU without consent: the notice, and anonymous counters only', async () => {
  const before = (await allVisits()).length;
  for (const ip of ['81.2.69.150', '81.2.70.5', '86.1.1.1', '87.1.1.1', '88.1.1.1', '2001:db8::150']) {
    const r = await visit({ src: 'email' }, { ip, ua: UA.iphone });
    assert.strictEqual(r.json.notice, true, ip);
    assert.ok(r.json.a && !r.json.v, `${ip}: anonymous, no token`);
  }
  const declined = await visit({ c: 'deny' }, { ip: '81.2.69.151', ua: UA.iphone });
  assert.ok(declined.json.a && declined.json.notice === false, 'declined: no notice, still anonymous');
  const outside = await visit({}, { ip: '100.1.1.1' });
  assert.strictEqual(outside.json.notice, false, 'never outside the region');
  // events from an anonymous page: only "type + page" counters move
  await sendEvents({ p: '/', e: [
    { k: 'sc', m: 50, o: 100 }, { k: 'cl', i: 'Secret label', to: '/x', c: 'link', s: 'top', o: 200 },
    { k: 'ff', f: 'beta', n: 'email', first: true, o: 300 }, { k: 'ff', f: 'beta', n: 'name', o: 400 },
    { k: 'tm', a: 5000, t: 6000 }, { k: 've', f: 'beta', n: 'why', e: 'too-short', o: 500 },
  ], cs: 'dismiss' }, { ip: '81.2.69.150', ua: UA.iphone });
  await settle();
  assert.strictEqual((await allVisits()).length - before, 1, 'only the visit from outside the region was stored');
  const counts = JSON.parse(fs.readFileSync(path.join(TMP, 'visit-counts.json'), 'utf8'));
  const sum = (bucket, key) => Object.values(counts.days).reduce((n, d) => n + ((d[bucket] || {})[key] || 0), 0);
  assert.ok(sum('v', 'GB|email|m') >= 1 && sum('v', 'DE|email|m') >= 1 && sum('v', 'IE|email|m') >= 1);
  assert.ok(sum('e', 'scroll50|/') >= 1 && sum('e', 'click:link|/') >= 1 && sum('e', 'form_start:beta|/') >= 1 && sum('e', 'form_error:beta|/') >= 1);
  assert.ok(sum('c', 'dismiss') >= 1, 'the notice choice is counted anonymously');
  const raw = statsText();
  for (const ip of ['81.2.69.150', '81.2.70.5', '86.1.1.1', '87.1.1.1', '88.1.1.1', '2001:db8::150', '81.2.69.151']) {
    assert.ok(!raw.includes(ip) && !raw.includes(`"i":${net.isIPv4(ip) ? packed(ip) : ip}`), `no trace of ${ip}`);
  }
  assert.ok(!raw.includes('Secret label') && !/"name"|form_start:beta\|.*name/.test(raw), 'no element labels or field names');
  assert.ok(!Object.keys(counts.days).some((d) => Object.keys(counts.days[d].e || {}).some((k) => k.startsWith('tm') || k.includes('why'))));
});

test('visits: UK/EU with consent is recorded like everyone else', async () => {
  const r = await visit({ c: 'allow', r: 'https://t.co/x' }, { ip: '81.2.69.160', ua: UA.macSafari });
  assert.ok(r.json.v, 'identified');
  assert.strictEqual(r.json.notice, false);
  await sendEvents({ v: r.json.v, e: [{ k: 'sc', m: 25, o: 1 }], dev: { w: 1440, h: 900, dpr: 2, lang: 'en-GB', tz: 'Europe/London' } }, { ip: '81.2.69.160', ua: UA.macSafari });
  await settle();
  const v = (await allVisits()).find((x) => x.ip === '81.2.69.160');
  assert.ok(v && v.consented, 'stored, marked as consented');
  assert.deepStrictEqual([v.cc, v.city, v.source], ['GB', 'London', 'x']);
});

test('visits: Global Privacy Control means anonymous counts only, everywhere', async () => {
  const before = (await allVisits()).length;
  const h = await visit({}, { ip: '8.8.2.1', headers: { 'Sec-GPC': '1' } });
  const b = await visit({ gpc: true }, { ip: '8.8.2.2' });
  const eu = await visit({ c: 'allow', gpc: true }, { ip: '81.2.69.170' });
  for (const r of [h, b, eu]) { assert.ok(r.json.a && !r.json.v); assert.strictEqual(r.json.notice, false); }
  await settle();
  assert.strictEqual((await allVisits()).length, before);
  const raw = statsText();
  assert.ok(!raw.includes(String(packed('8.8.2.1'))) && !raw.includes(String(packed('8.8.2.2'))));
  const counts = mainApp.locals.analytics.getCounts();
  assert.ok(Object.values(counts.days).reduce((n, d) => n + ((d.c || {}).gpc || 0), 0) >= 3, 'GPC is counted, anonymously');
});

test('visits: bots, the signed-in admin and ADMIN_ALLOW_IPS are not counted', async () => {
  const before = (await allVisits()).length;
  for (const ua of ['Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', 'curl/8.4.0', 'Mozilla/5.0 HeadlessChrome/130.0.0.0', '']) {
    const r = await visit({}, { ip: '8.8.3.1', ua });
    assert.strictEqual(r.json.off, 1, ua);
  }
  assert.strictEqual((await visit({ wd: true }, { ip: '8.8.3.2' })).json.off, 1, 'navigator.webdriver');
  // the signed-in admin, on an app with the admin page on
  const A = await startAdmin(FULL);
  const ip = '198.51.100.201';
  const jar = new Map();
  const hdr = { 'User-Agent': UA.chromeWin };
  const pg = await areq(A, 'GET', ADMIN, { ip, jar, headers: hdr });
  const code = totp(A.clock.t);
  seen.codes.add(code);
  const login = await areq(A, 'POST', `${ADMIN}/login`, { ip, jar, headers: hdr, form: { csrf: csrfIn(pg.text), user: A_USER, password: A_PASS, code } });
  assert.strictEqual(login.status, 303);
  const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  const asAdmin = await visit({}, { ip, at: A.base, headers: { Cookie: cookie } });
  assert.strictEqual(asAdmin.json.off, 1, 'the admin session is skipped');
  const notAdmin = await visit({}, { ip: '8.8.3.3', at: A.base });
  assert.ok(notAdmin.json.v, 'the same app records everyone else');
  const allow = await startAdmin({ ...FULL, ADMIN_ALLOW_IPS: '8.8.4.0/24' });
  assert.strictEqual((await visit({}, { ip: '8.8.4.9', at: allow.base })).json.off, 1, 'an address in ADMIN_ALLOW_IPS is skipped');
  await settle();
  await A.app.locals.analytics.flush();
  const ips = (await allVisits()).map((v) => v.ip);
  for (const x of ['8.8.3.1', '8.8.3.2', ip, '8.8.4.9']) assert.ok(!ips.includes(x), x);
  assert.strictEqual((await allVisits()).length, before + 1);
});

test('visits: the beacons are same-origin only, rate limited, and small', async () => {
  const ip = '8.8.5.200';
  for (let i = 0; i < 60; i += 1) assert.strictEqual((await visit({}, { ip })).status, 200, `beacon ${i + 1}`);
  const over = await visit({}, { ip });
  assert.strictEqual(over.status, 429);
  assert.ok(Number(over.headers.get('retry-after')) > 0);
  assert.strictEqual((await visit({}, { ip: '8.8.5.201' })).status, 200, 'per address');
  assert.strictEqual((await vreq('/api/visit', { p: '/' }, { ip: '8.8.5.202', headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.strictEqual((await vreq('/api/visit-events', { e: [] }, { ip: '8.8.5.202', headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.strictEqual((await vreq('/api/visit', 'p=/', { ip: '8.8.5.202', type: 'application/x-www-form-urlencoded' })).status, 415);
  assert.strictEqual((await vreq('/api/visit', '{"p":', { ip: '8.8.5.202' })).status, 400);
  assert.strictEqual((await vreq('/api/visit', '[1]', { ip: '8.8.5.202' })).status, 400);
  assert.strictEqual((await vreq('/api/visit-events', JSON.stringify({ e: [], pad: 'x'.repeat(20000) }), { ip: '8.8.5.202', type: 'text/plain' })).status, 413);
  // a token works only from the address it was given to
  const r = await visit({}, { ip: '8.8.5.203' });
  await sendEvents({ v: r.json.v, e: [{ k: 'sc', m: 100, o: 1 }] }, { ip: '8.8.5.204' });
  await settle();
  const v = (await allVisits()).find((x) => x.ip === '8.8.5.203');
  assert.ok(!(await allEvents()).some((e) => e.v === v.n && e.k === 'sc' && e.m === 100));
});

test('visits: a form sent after an identified visit is linked to the visitor', async () => {
  const ip = '8.8.6.1';
  const r = await visit({ src: 'email' }, { ip });
  await settle();
  const sent = await post('/api/beta', { email: 'linked@example.com', name: 'Lin Ked', role: 'parent', why: WHY, age_ok: 'yes', consent: 'yes', ...human }, { ip });
  assert.strictEqual(sent.status, 200);
  const rec = readAll('beta').find((x) => x.email === 'linked@example.com');
  assert.ok(!JSON.stringify(rec).includes(ip) && !('visitor' in rec), 'the form record itself is unchanged');
  const links = mainApp.locals.analytics.readLinks();
  assert.ok(links.some((l) => l.ip === ip && l.form === 'beta' && l.id === rec.id));
  const S = await createReport({ analytics: mainApp.locals.analytics, forms: ['updates', 'beta', 'investors'], readAll }).stats();
  const who = S.visitors.find((a) => a.ip === ip);
  assert.deepStrictEqual(who.people.map((p) => [p.name, p.email, p.form]), [['Lin Ked', 'linked@example.com', 'beta']]);
  assert.ok(who.converted);
  assert.ok(S.convSource.find((x) => x.key === 'email').converted >= 1);
  assert.ok(r.json.v);
  // an anonymous (UK/EU, no consent) visitor's submission is never linked
  await visit({}, { ip: '81.2.69.180' });
  await post('/api/updates', { email: 'anon-eu@example.com', consent: 'yes', ...human }, { ip: '81.2.69.180' });
  // nor is a submission with no recorded visit
  await post('/api/updates', { email: 'novisit@example.com', consent: 'yes', ...human }, { ip: '8.8.6.99' });
  const ids = readAll('updates').filter((x) => ['anon-eu@example.com', 'novisit@example.com'].includes(x.email)).map((x) => x.id);
  assert.strictEqual(ids.length, 2);
  assert.ok(!mainApp.locals.analytics.readLinks().some((l) => ids.includes(l.id)));
  assert.ok(!statsText().includes('81.2.69.180'));
});

test('visits: "Remove my details" and node server.js forget delete the linked visits', async () => {
  const ip = '8.8.7.1';
  const other = '8.8.7.2';
  for (const x of [ip, ip, other]) {
    const r = await visit({}, { ip: x });
    await sendEvents({ v: r.json.v, e: [{ k: 'sc', m: 25, o: 5 }] }, { ip: x });
  }
  await settle();
  await post('/api/updates', { email: 'bye@example.com', consent: 'yes', ...human }, { ip });
  const id = readAll('updates').find((x) => x.email === 'bye@example.com').id;
  const seqs = (await allVisits()).filter((v) => v.ip === ip).map((v) => v.n);
  assert.strictEqual(seqs.length, 2);
  const r = await post('/api/forget', { email: 'bye@example.com', ...human });
  assert.strictEqual(r.status, 200);
  const left = await allVisits();
  assert.ok(!left.some((v) => v.ip === ip), 'their visits are gone');
  assert.ok(left.some((v) => v.ip === other), 'other visitors stay');
  assert.ok(!(await allEvents()).some((e) => seqs.includes(e.v) && left.every((v) => v.n !== e.v)), 'their events are gone');
  assert.ok(!mainApp.locals.analytics.readLinks().some((l) => l.id === id || l.ip === ip), 'their links are gone');
  assert.ok(!statsText().includes(`"i":${packed(ip)}`));
  // the command line does the same
  const ip3 = '8.8.7.3';
  await visit({}, { ip: ip3 });
  await settle();
  await post('/api/investors', { name: 'Cli Person', email: 'cli@example.com', message: 'Please remove me later.', ...human }, { ip: ip3 });
  const out = spawnSync(process.execPath, [path.join(__dirname, 'server.js'), 'forget', 'cli@example.com'], { encoding: 'utf8', timeout: 60000, env: { ...process.env } });
  assert.strictEqual(out.status, 0, out.stderr);
  assert.ok(/Removed 1 record and 1 linked visit for cli@example\.com/.test(out.stdout), out.stdout);
  assert.ok(!(await allVisits()).some((v) => v.ip === ip3));
  assert.ok(!readAll('investors').some((x) => x.email === 'cli@example.com'));
  // the running server notices the rewritten file and keeps appending correctly
  const after = await visit({ p: '/after-cli' }, { ip: '8.8.7.4' });
  assert.ok(after.json.v);
  await settle();
  assert.strictEqual((await allVisits()).find((v) => v.ip === '8.8.7.4').path, '/after-cli');
});

test('visits: dictionary encoding round-trips; each string is stored once per month', async () => {
  const list = [null];
  const map = new Map();
  const sid = (s) => { if (!map.has(s)) { map.set(s, list.length); list.push(s); } return map.get(s); };
  const r = {
    n: 7, t: 1792956481, ip: '2001:db8::1', path: '/privacy', source: 'email', ref: 'mail.google.com',
    utm: { source: 'nl', medium: 'email', campaign: 'oct <b>' }, cc: 'IE', city: 'Dublin', lat: 53.3, lon: -6.3,
    dev: { type: 'tablet', model: 'iPad', os: 'iPadOS', osv: '17', br: 'Safari', brv: 17, w: 820, h: 1180, dpr: 2, lang: 'en-IE', tz: 'Europe/Dublin' },
    consented: true, nf: true,
  };
  const enc = JSON.parse(JSON.stringify(AN.encodeVisit(r, sid)));
  assert.deepStrictEqual(AN.decodeVisit(enc, list), r);
  assert.ok(Object.keys(enc).every((k) => k.length <= 2), 'short keys');
  const v4 = AN.encodeVisit({ ...r, ip: '203.0.113.9' }, sid);
  assert.strictEqual(v4.i, 3405803785);
  assert.strictEqual(AN.decodeVisit(v4, list).ip, '203.0.113.9');
  assert.strictEqual(AN.unpackIp(AN.packIp('255.255.255.255')), '255.255.255.255');
  const samples = [
    { k: 'sc', m: 75 }, { k: 'sd', d: 88 }, { k: 'si', s: 'beta' }, { k: 'st', s: 'beta', ms: 4200 }, { k: 'tm', a: 9000, t: 12000 },
    { k: 'cl', i: 'Apply for the beta', to: '/#beta', s: 'top', c: 'link' }, { k: 'rc', i: 'Send', s: 'beta' }, { k: 'dc', i: 'card', s: 'how' },
    { k: 'fv', f: 'beta' }, { k: 'ff', f: 'beta', n: 'why' }, { k: 've', f: 'beta', n: 'why', e: 'too-short' }, { k: 'fs', f: 'beta' },
    { k: 'fd', f: 'beta', ms: 41000 }, { k: 'fa', f: 'investors', n: 'message' }, { k: 'pf', b: 80, d: 400, l: 900 },
    { k: 'wv', lcp: 1200, cls: 15, inp: 64 }, { k: 'er', m: 'x is not defined', at: '/assets/site.js:12' },
  ];
  for (const s of samples) {
    const e = { v: 3, o: 12, ...s };
    assert.deepStrictEqual(AN.decodeEvent(JSON.parse(JSON.stringify(AN.encodeEvent(e, sid))), list), e, s.k);
  }
  // in a file: 20 visits that share their strings
  const clock = { t: at(2026, 10, 20) };
  const { an } = instance({ clock });
  for (let i = 0; i < 20; i += 1) await an.store.appendVisit(baseRec(an, clock.t / 1000 + i, `8.8.8.${100 + i}`, { path: '/same', source: 'google', ref: 'www.google.com' }));
  const file = an.store.months()[0].v.file;
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
  const defs = lines.filter((l) => l.startsWith('{"$"'));
  assert.strictEqual(new Set(defs).size, defs.length, 'no string defined twice');
  assert.strictEqual(lines.length - defs.length, 20);
  assert.ok(defs.length <= 12, `${defs.length} strings for 20 visits`);
  const back = await recordsOf(an);
  assert.strictEqual(back.length, 20);
  assert.ok(back.every((v) => v.path === '/same' && v.city === 'Austin' && v.dev.tz === 'America/Chicago'));
});

test('visits: months rotate, closed months are gzipped and read back, removal rewrites them', async () => {
  const clock = { t: at(2026, 8, 20) };
  const { an, dir } = instance({ clock });
  const tokens = [];
  for (const ip of ['8.8.8.21', '8.8.8.22', '8.8.8.23']) {
    const r = an.visit({ ip, ua: UA.chromeWin, headers: {}, host: 'savantedu.com', body: { p: '/a', r: 'https://www.bing.com/' } });
    assert.ok(r.v);
    tokens.push(r.v);
    await an.events({ ip, ua: UA.chromeWin, body: { v: r.v, e: [{ k: 'sc', m: 25, o: 10 }, { k: 'si', s: 'beta', o: 20 }], dev: { w: 1280, h: 720, dpr: 1, lang: 'en', tz: 'UTC' } } });
    clock.t += 60000;
  }
  await an.flush();
  const before = await recordsOf(an);
  assert.strictEqual(before.length, 3);
  clock.t = at(2026, 9, 1, 1); // one hour into September: too early to close August
  await an.store.compressClosed();
  assert.ok(fs.existsSync(path.join(dir, 'visits', '2026-08.jsonl')));
  clock.t = at(2026, 9, 1, 3);
  assert.strictEqual(await an.store.compressClosed(), 2, 'the visits and events files');
  assert.ok(!fs.existsSync(path.join(dir, 'visits', '2026-08.jsonl')));
  const gz = path.join(dir, 'visits', '2026-08.jsonl.gz');
  assert.ok(fs.existsSync(gz) && fs.existsSync(path.join(dir, 'visits', '2026-08.events.jsonl.gz')));
  assert.ok(zlib.gunzipSync(fs.readFileSync(gz)).toString('utf8').includes('{"$":"/a"}'));
  assert.deepStrictEqual(await recordsOf(an), before, 'read back through zlib, unchanged');
  // a new month opens a new file; a late event for an August page view is dropped quietly
  const sep = an.visit({ ip: '8.8.8.24', ua: UA.chromeWin, headers: {}, host: 'savantedu.com', body: { p: '/b' } });
  await an.events({ ip: '8.8.8.21', ua: UA.chromeWin, body: { v: tokens[0], e: [{ k: 'sc', m: 50, o: 30 }] } });
  await an.flush();
  assert.ok(sep.v && fs.existsSync(path.join(dir, 'visits', '2026-09.jsonl')));
  // the report reads the closed month
  const S = await createReport({ analytics: an, forms: [], readAll: () => [] }).stats();
  assert.strictEqual(S.summary.identified, 4);
  assert.strictEqual(S.bySource.find(([k]) => k === 'bing')[1], 3);
  // removal across a compressed month: the .gz is rewritten, still gzipped
  const removed = await an.removeIps(new Set(['8.8.8.22']));
  assert.strictEqual(removed, 1);
  assert.ok(fs.existsSync(gz) && !fs.existsSync(path.join(dir, 'visits', '2026-08.jsonl')));
  const aug = [];
  await AN.readMonthFile(gz, 'v', (r) => aug.push(r));
  assert.deepStrictEqual(aug.map((r) => r.ip), ['8.8.8.21', '8.8.8.23']);
  const augEv = [];
  await AN.readMonthFile(path.join(dir, 'visits', '2026-08.events.jsonl.gz'), 'e', (e) => augEv.push(e));
  const gone = before.find((r) => r.ip === '8.8.8.22').n;
  assert.ok(augEv.length === 4 && !augEv.some((e) => e.v === gone), 'its events went too');
  assert.ok(!zlib.gunzipSync(fs.readFileSync(gz)).toString('utf8').includes(String(packed('8.8.8.22'))));
});

test('visits: records older than 24 months are pruned, with their counters and links', async () => {
  const clock = { t: at(2026, 10, 25) };
  const { an, dir } = instance({ clock });
  const S = (y, m, d) => at(y, m, d) / 1000;
  const put = (t, ip) => an.store.appendVisit(baseRec(an, t, ip));
  await put(S(2024, 9, 15), '8.8.8.31');
  await put(S(2024, 10, 20), '8.8.8.32');
  await put(S(2024, 10, 30), '8.8.8.33');
  await put(S(2025, 5, 1), '8.8.8.34');
  await put(S(2026, 10, 1), '8.8.8.35');
  const n32 = (await recordsOf(an)).find((r) => r.ip === '8.8.8.32').n;
  await an.store.appendEvents('2024-10', [{ v: n32, o: 1, k: 'sc', m: 25 }]);
  const days = an.getCounts().days;
  days['2024-10-20'] = { v: { 'GB|direct|d': 2 }, e: {}, c: {} };
  days['2024-11-01'] = { v: { 'GB|direct|d': 1 }, e: {}, c: {} };
  fs.writeFileSync(path.join(dir, 'visit-links.jsonl'), [
    { t: S(2024, 10, 1), i: packed('8.8.8.31'), f: 'updates', id: 'aaaaaaaaaaaaaaaa' },
    { t: S(2025, 1, 1), i: packed('8.8.8.34'), f: 'beta', id: 'bbbbbbbbbbbbbbbb' },
  ].map((l) => JSON.stringify(l)).join('\n') + '\n');
  const r = await an.pruneRetention();
  assert.deepStrictEqual(r, { visits: 2, days: 1, links: 1 });
  assert.deepStrictEqual(an.store.months().map((m) => m.month), ['2024-10', '2025-05', '2026-10']);
  assert.deepStrictEqual((await recordsOf(an)).map((v) => v.ip), ['8.8.8.33', '8.8.8.34', '8.8.8.35']);
  assert.deepStrictEqual(await recordsOf(an, 'e'), [], 'the pruned visit’s events went too');
  assert.deepStrictEqual(Object.keys(an.getCounts().days).sort(), ['2024-11-01']);
  assert.deepStrictEqual(an.readLinks().map((l) => l.id), ['bbbbbbbbbbbbbbbb']);
  assert.ok(an.recentLog().some((l) => l.event === 'retention_prune'));
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'visit-counts.json'), 'utf8'));
  assert.ok(!saved.days['2024-10-20'], 'saved without the old day');
  assert.deepStrictEqual(AN.monthsAgo(at(2026, 3, 31) / 1000, 1), at(2026, 2, 28) / 1000, 'month arithmetic clamps the day');
});

test('visits: over DATA_MAX_MB the oldest months go first, the event is logged', async () => {
  const clock = { t: at(2026, 10, 25) };
  const { an, dir } = instance({ clock, env: { DATA_MAX_MB: '0.006' } }); // about 6 KB
  for (const [m, n] of [[7, 20], [8, 20], [9, 20], [10, 20]]) {
    for (let i = 0; i < n; i += 1) await an.store.appendVisit(baseRec(an, at(2026, m, 10) / 1000 + i, `8.8.${m}.${i}`, { path: `/p${i}`, city: `City ${m}-${i}` }));
  }
  const total = an.usage().total;
  assert.ok(total > 0.006 * 1048576, `filled ${total} bytes`);
  const dropped = await an.store.enforceCap();
  assert.ok(dropped >= 1);
  const months = an.store.months().map((x) => x.month);
  assert.ok(!months.includes('2026-07'), 'the oldest month went first');
  assert.ok(months.includes('2026-10'), 'the current month is kept');
  assert.deepStrictEqual(months, ['2026-07', '2026-08', '2026-09', '2026-10'].slice(4 - months.length), 'only the oldest months');
  assert.ok(an.usage().total <= 0.006 * 1048576);
  const log = an.recentLog(20);
  assert.ok(log.some((l) => l.event === 'cap_prune' && l.detail.month === '2026-07'));
  // with only this month left and still over: new visits are counted anonymously
  const tiny = instance({ clock, env: { DATA_MAX_MB: '0.0005' } });
  for (let i = 0; i < 20; i += 1) await tiny.an.store.appendVisit(baseRec(tiny.an, at(2026, 10, 10) / 1000 + i, `8.8.9.${i}`));
  await tiny.an.store.enforceCap();
  assert.ok(tiny.an.usage().full);
  assert.ok(tiny.an.recentLog().some((l) => l.event === 'cap_full'));
  const r = tiny.an.visit({ ip: '8.8.8.8', ua: UA.chromeWin, headers: {}, host: 'x', body: { p: '/' } });
  assert.ok(r.a && !r.v, 'anonymous while full');
  assert.ok(fs.existsSync(path.join(dir, 'visits', 'log.jsonl')));
});

test('visits: sessions, funnels, engagement and conversion in the report', async () => {
  const views = [{ t: 0, end: 100, path: '/' }, { t: 600, end: 900, path: '/privacy' }, { t: 2701, end: 2800, path: '/' }, { t: 2900, end: 3000, path: '/evidence' }];
  assert.deepStrictEqual(sessionize(views), [
    { start: 0, end: 900, entry: '/', exit: '/privacy', pages: 2 },
    { start: 2701, end: 3000, entry: '/', exit: '/evidence', pages: 2 },
  ], 'over 30 minutes without activity starts a new session');
  assert.strictEqual(sessionize([{ t: 0, end: 0, path: '/' }, { t: 1800, end: 1800, path: '/b' }]).length, 1, 'exactly 30 minutes is the same session');
  assert.strictEqual(joinSessions([{ start: 0, end: 100, entry: '/', exit: '/', pages: 1 }, { start: 1000, end: 1200, entry: '/b', exit: '/c', pages: 2 }]).length, 1);
  const steps = funnel({ seen: 10, started: 6, fields: { email: 6, name: 4, role: 3, why: 3, age_ok: 2, consent: 2 }, attempted: 2, done: 1, abandon: {}, errors: {}, ttc: [] }, 'beta');
  assert.deepStrictEqual(steps.map((s) => s.label), ['Seen', 'Started', 'Field: email', 'Field: name', 'Field: role', 'Field: why', 'Field: age_ok', 'Field: consent', 'Submit pressed', 'Sent']);
  assert.deepStrictEqual(steps.map((s) => s.drop), [null, 40, 0, 33.3, 25, 0, 33.3, 0, 0, 50]);
  // a small history: visitor A has two sessions and sends the beta form; B looks and leaves
  const clock = { t: at(2026, 10, 25, 9) };
  const { an } = instance({ clock });
  const pv = async (ip, path, evs, ua = UA.chromeWin) => {
    const r = an.visit({ ip, ua, headers: {}, host: 'savantedu.com', body: { p: path, src: ip === '8.8.8.41' ? 'ig' : '' } });
    await an.events({ ip, ua, body: { v: r.v, e: evs } });
    return r;
  };
  await pv('8.8.8.41', '/', [{ k: 'sc', m: 25, o: 10 }, { k: 'sc', m: 50, o: 20 }, { k: 'si', s: 'beta', o: 30 }, { k: 'st', s: 'beta', ms: 8000, o: 90 }, { k: 'tm', a: 20000, t: 30000, o: 300 },
    { k: 'fv', f: 'beta', o: 40 }, { k: 'ff', f: 'beta', n: 'email', o: 50 }, { k: 'ff', f: 'beta', n: 'name', o: 60 }, { k: 've', f: 'beta', n: 'why', e: 'too-short', o: 70 },
    { k: 'fs', f: 'beta', o: 80 }, { k: 'fd', f: 'beta', ms: 30000, o: 90 }, { k: 'cl', i: 'Apply for the beta', to: '/#beta', s: 'top', c: 'link', o: 5 },
    { k: 'cl', i: 'Savant on Instagram', to: 'www.instagram.com', s: 'footer', c: 'social', o: 6 }, { k: 'rc', i: 'Send application', s: 'beta', o: 7 },
    { k: 'pf', b: 100, d: 400, l: 800, o: 8 }, { k: 'wv', lcp: 1500, cls: 20, inp: 100, o: 9 }, { k: 'er', m: 'oops', at: '/assets/site.js:5', o: 9 }]);
  clock.t += 40 * 60000;
  await pv('8.8.8.41', '/privacy', [{ k: 'sc', m: 25, o: 10 }, { k: 'fv', f: 'beta', o: 20 }, { k: 'ff', f: 'beta', n: 'email', o: 30 }, { k: 'fa', f: 'beta', n: 'email', o: 40 }]);
  clock.t += 60000;
  await pv('8.8.8.42', '/', [{ k: 'fv', f: 'beta', o: 10 }, { k: 'sc', m: 100, o: 20 }, { k: 'sc', m: 25, o: 15 }, { k: 'dc', i: 'Placement', s: 'how', o: 30 }, { k: 'pf', b: 300, d: 900, l: 1600, o: 8 }], UA.iphone);
  await an.flush();
  const S = await createReport({ analytics: an, forms: ['updates', 'beta', 'investors'], readAll: () => [] }).stats();
  assert.strictEqual(S.summary.identified, 3);
  assert.strictEqual(S.summary.unique, 2);
  assert.strictEqual(S.summary.sessions, 3);
  assert.strictEqual(S.summary.returning, 1);
  const beta = S.forms.find((f) => f.name === 'beta');
  const n = Object.fromEntries(beta.steps.map((s) => [s.label, s.n]));
  assert.deepStrictEqual([n.Seen, n.Started, n['Field: email'], n['Field: name'], n['Submit pressed'], n.Sent], [3, 2, 2, 1, 1, 1]);
  assert.deepStrictEqual(beta.abandon, [['email', 1]]);
  assert.deepStrictEqual(beta.errors, [['why-too-short', 1]]);
  assert.strictEqual(beta.ttcMedian, 30000);
  assert.deepStrictEqual(S.engagement.scroll.map((x) => x.n), [3, 2, 1, 1, 1], 'page views reaching 25/50/75/90/100% (100% passes them all)');
  assert.strictEqual(S.engagement.activeAvgMs, 20000);
  assert.deepStrictEqual(S.engagement.sections[0], { id: 'beta', n: 1, avgMs: 8000 });
  const conv = Object.fromEntries(S.convSource.map((x) => [x.key, [x.visitors, x.converted, x.rate]]));
  assert.deepStrictEqual(conv.instagram, [1, 1, 100]);
  assert.deepStrictEqual(conv.direct, [1, 0, 0]);
  assert.deepStrictEqual(Object.fromEntries(S.convDevice.map((x) => [x.key, x.converted])), { desktop: 1, mobile: 0 });
  assert.deepStrictEqual(S.convEntry.map((x) => [x.key, x.visitors]), [['/', 2]]);
  assert.deepStrictEqual(S.outbound, [['www.instagram.com', 1]]);
  assert.strictEqual(S.rage[0].id, 'Send application');
  assert.strictEqual(S.dead[0].id, 'Placement');
  const ttfb = S.perf.find((p) => p.k === 'ttfb');
  assert.deepStrictEqual([ttfb.median, ttfb.p75, ttfb.n], [100, 300, 2]);
  assert.deepStrictEqual(S.errors.map((e) => [e.m, e.at, e.n]), [['oops', '/assets/site.js:5', 1]]);
  assert.strictEqual(S.locations[0].cc, 'US');
  const d = await createReport({ analytics: an, forms: [], readAll: () => [] }).detail('8.8.8.41');
  assert.strictEqual(d.sessions.length, 2, 'the visitor’s history in sessions');
  assert.strictEqual(d.sessions[1].views[0].events.find((e) => e.k === 'fd').ms, 30000);
});

test('visits: the page script records scroll milestones and rage clicks, and batches on pagehide', async () => {
  assert.strictEqual(Track.scrollPercent(0, 800, 800), 100, 'a page that fits');
  assert.strictEqual(Track.scrollPercent(0, 800, 4000), 20);
  assert.strictEqual(Track.scrollPercent(1200, 800, 4000), 50);
  assert.strictEqual(Track.scrollPercent(3200, 800, 4000), 100);
  const clock = { t: 0 };
  const sent = [];
  const tr = new Track.Tracker({ send: (json, final) => sent.push({ body: JSON.parse(json), final }), now: () => clock.t, path: '/' });
  tr.scroll(30);
  assert.strictEqual(sent.length, 0, 'nothing is sent before the server answers');
  tr.setMode({ v: 'tok123' });
  assert.strictEqual(sent.length, 1, 'the queue goes as soon as the mode is known');
  tr.scroll(80);
  tr.scroll(60);
  tr.scroll(100);
  tr.scroll(100);
  tr.flush(false);
  const all = () => sent.flatMap((s) => s.body.e);
  assert.deepStrictEqual(all().filter((e) => e.k === 'sc').map((e) => e.m), [25, 50, 75, 90, 100], 'each milestone once');
  assert.ok(all().some((e) => e.k === 'sd' && e.d === 100), 'the deepest point');
  assert.ok(sent.every((s) => s.body.v === 'tok123'));
  // rage clicks: three within a second on one spot, reported once
  const d = { kind: 'click', i: 'Send application', to: '', s: 'beta', c: 'btn' };
  clock.t = 1000; assert.strictEqual(tr.click(d, 100, 100), false);
  clock.t = 1300; assert.strictEqual(tr.click(d, 105, 98), false);
  clock.t = 1500; assert.strictEqual(tr.click(d, 102, 104), true, 'the third fast click');
  clock.t = 1700; assert.strictEqual(tr.click(d, 101, 101), false, 'once per burst');
  clock.t = 5000; tr.click(d, 0, 0); clock.t = 5100; tr.click(d, 200, 0); clock.t = 5200; assert.strictEqual(tr.click(d, 400, 0), false, 'far apart');
  clock.t = 8000; tr.click(d, 0, 0); clock.t = 8700; tr.click(d, 0, 0); clock.t = 9400; assert.strictEqual(tr.click(d, 0, 0), false, 'too slow');
  // batching: nothing new, nothing sent; on pagehide, one final batch with what is left
  tr.flush(false);
  const n0 = sent.length;
  assert.strictEqual(tr.flush(false), false);
  assert.strictEqual(sent.length, n0);
  tr.formSeen('beta');
  tr.fieldFocus('beta', 'email');
  tr.fieldTouch('beta', 'name');
  tr.vital('lcp', 1234.4);
  tr.vital('cls', 0.051);
  tr.vital('inp', 80);
  tr.section('beta', true);
  clock.t = 12000;
  tr.tick(true, true); tr.activity(); clock.t = 13000; tr.tick(true, true);
  assert.strictEqual(tr.pagehide(), true);
  const last = sent[sent.length - 1];
  assert.strictEqual(last.final, true);
  assert.strictEqual(last.body.end, true);
  const k = (kind) => last.body.e.filter((e) => e.k === kind);
  assert.deepStrictEqual(k('fa').map((e) => [e.f, e.n]), [['beta', 'name']], 'the form was started and not sent: the last field touched');
  assert.deepStrictEqual(k('wv').map((e) => [e.lcp, e.cls, e.inp]), [[1234, 51, 80]]);
  assert.ok(k('st').length === 0 || k('st')[0].s === 'beta');
  tr.pagehide();
  assert.ok(!sent[sent.length - 1].body.e.some((e) => e.k === 'fa'), 'abandon is reported once');
  // anonymous mode keeps only the type of each event
  const sentA = [];
  const ta = new Track.Tracker({ send: (json) => sentA.push(JSON.parse(json)), now: () => 5, path: '/privacy' });
  ta.setMode({ a: 1 });
  ta.click({ kind: 'click', i: 'Secret label', to: '/x', s: 'top', c: 'link' }, 1, 1);
  ta.fieldFocus('beta', 'email');
  ta.fieldFocus('beta', 'name');
  ta.error('boom', '/assets/site.js:1');
  ta.vital('lcp', 900);
  ta.pagehide();
  const flat = JSON.stringify(sentA);
  assert.ok(sentA.every((b) => b.p === '/privacy' && !b.v));
  assert.ok(!flat.includes('Secret label') && !flat.includes('"email"') && !flat.includes('"name"') && !flat.includes('boom') && !flat.includes('"wv"'));
  assert.deepStrictEqual(sentA.flatMap((b) => b.e).map((e) => e.k), ['cl', 'ff', 'er', 'fa'], 'the types only (the started form counts as left)');
  assert.deepStrictEqual(sentA.flatMap((b) => b.e).find((e) => e.k === 'fa'), { k: 'fa', o: 5, f: 'beta' });
  // off (a bot or the admin): nothing at all
  const sentO = [];
  const to = new Track.Tracker({ send: (json) => sentO.push(json), now: () => 1, path: '/' });
  to.scroll(100);
  to.setMode({ off: 1 });
  to.scroll(100);
  to.pagehide();
  assert.deepStrictEqual(sentO, []);
});

test('visits: no input value is ever captured', async () => {
  const SECRET = 'my-secret-answer@example.com';
  let reads = 0;
  const section = fake('section', { id: 'beta' });
  const form = fake('form', { 'data-form': 'beta', id: 'beta-form' }, { parent: section });
  const field = (tag, attrs) => {
    const el = fake(tag, attrs, { parent: form, text: tag === 'textarea' ? SECRET : '' });
    el.form = form;
    Object.defineProperty(el, 'value', { get() { reads += 1; return SECRET; } });
    return el;
  };
  const email = field('input', { name: 'email', type: 'email', id: 'beta-email' });
  const why = field('textarea', { name: 'why', id: 'beta-why' });
  const anon = field('input', { name: 'email', type: 'email' });
  delete anon.attrs.id;
  const submit = fake('button', { type: 'submit' }, { parent: form, text: '  Send   application ' });
  const honeypot = field('input', { name: 'website', type: 'text' });
  const sent = [];
  const tr = new Track.Tracker({ send: (json) => sent.push(json), now: () => 10, path: '/' });
  tr.setMode({ v: 'tok' });
  const ctx = { origin: 'https://savantedu.com', path: '/', style: () => null };
  for (const el of [email, why, anon]) {
    const info = Track.fieldInfo(el);
    tr.fieldFocus(info.f, info.n);
    tr.fieldTouch(info.f, info.n);
    assert.strictEqual(Track.describeClick(el, ctx).kind, null, 'a click in a field is not a click event');
    tr.click(Track.describeClick(el, ctx), 1, 1);
  }
  assert.strictEqual(Track.fieldInfo(honeypot), null, 'the honeypot is ignored');
  assert.strictEqual(Track.stableId(anon), 'email', 'a field is named by its name, never its contents');
  assert.strictEqual(Track.stableId(why), 'beta-why');
  const click = Track.describeClick(submit, ctx);
  assert.deepStrictEqual(click, { kind: 'click', i: 'Send application', to: '', s: 'beta', c: 'btn' });
  tr.click(click, 5, 5);
  tr.formError('beta', 'email', Track.errorCode('That does not look like an email address. Check for a typo.'));
  tr.formError('beta', 'why', Track.errorCode('Tell us a little more: at least 30 characters.'));
  tr.formSubmit('beta');
  tr.pagehide();
  const payload = sent.join('\n');
  assert.ok(!payload.includes(SECRET) && !payload.includes('my-secret'), 'the typed text never leaves the page');
  assert.strictEqual(reads, 0, 'no value was even read');
  assert.ok(payload.includes('"e":"invalid"') && payload.includes('"e":"too-short"'));
  assert.ok(payload.includes('"n":"why"'), 'field names are kept');
  // the scripts never read a value, and the server keeps only known fields
  const trackSrc = fs.readFileSync(path.join(__dirname, 'assets', 'track.js'), 'utf8');
  assert.ok(!/\.value\b/.test(trackSrc), 'track.js reads no .value');
  const siteSrc = fs.readFileSync(path.join(__dirname, 'assets', 'site.js'), 'utf8');
  const statsPart = siteSrc.slice(siteSrc.indexOf('/* ── visit statistics'));
  // (en.value is a layout-shift score from PerformanceObserver, not a form field)
  assert.ok(statsPart.length > 1000 && !/(?<!\ben)\.value\b|\.key\b|\.which\b|\.keyCode\b/.test(statsPart), 'the stats code in site.js reads no values or keys');
  const r = await visit({}, { ip: '8.8.8.50' });
  await sendEvents({ v: r.json.v, e: [{ k: 'ff', f: 'beta', n: 'email', value: SECRET, o: 1 }, { k: 'cl', i: 'x', text: SECRET, o: 2 }, { k: 'zz', value: SECRET }] }, { ip: '8.8.8.50' });
  await settle();
  assert.ok(!statsText().includes(SECRET), 'unknown fields are dropped by the server');
});

test('visits: the admin Visitors tab needs a session and shows everything as text', async () => {
  const ip = '8.8.9.1';
  const r = await visit({ p: '/<script>alert(1)</script>', r: 'https://evil.example/?q=<script>', u: { s: 'news', m: 'x', c: '<img src=x onerror=alert(3)>' } }, { ip });
  await sendEvents({ v: r.json.v, e: [{ k: 'cl', i: '<svg onload=alert(4)>', to: '/', s: 'top', c: 'btn', o: 1 }, { k: 'er', m: '<script>alert(5)</script>', at: '/assets/site.js:1', o: 2 }] }, { ip });
  await settle();
  await post('/api/beta', { email: 'xss-visit@example.com', name: '<b>bold</b>', role: 'learner', why: WHY, age_ok: 'yes', consent: 'yes', ...human }, { ip });
  const A = await startAdmin(FULL);
  const aip = '198.51.100.210';
  const anon = await areq(A, 'GET', `${ADMIN}?form=visitors`, { ip: aip });
  assert.ok(isLogin(anon.text) && !anon.text.includes(ip), 'no session: the sign-in form, no data');
  await assertPlain404(A, `${ADMIN}/assets/visitors.js`, { ip: aip });
  await assertPlain404(A, `${ADMIN}/assets/land.json`, { ip: aip });
  await assertPlain404(A, `${ADMIN}/assets/borders.json`, { ip: aip });
  await assertPlain404(A, `${ADMIN}/assets/states.json`, { ip: aip });
  const { jar } = await signIn(A, { ip: aip });
  const pg = await areq(A, 'GET', `${ADMIN}?form=visitors`, { ip: aip, jar });
  assert.strictEqual(pg.status, 200);
  assert.ok(pg.text.includes('<h1>Visitors</h1>') && pg.text.includes(ip));
  assert.ok(pg.text.includes('aria-current="page">Visitors</a>'), 'the Visitors tab');
  for (const raw of ['<script>alert', '<img src=x', '<svg onload', '<b>bold']) assert.ok(!pg.text.includes(raw), raw);
  assert.ok(pg.text.includes('&lt;b&gt;bold&lt;/b&gt;'), 'the linked name, escaped');
  assert.ok(pg.text.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), 'the page path, escaped');
  for (const m of pg.text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    assert.ok(/\ssrc="\/(assets|donteventry\/assets)\/[a-z-]+\.js"/.test(m[1]));
    assert.strictEqual(m[2].trim(), '');
  }
  assert.ok(pg.text.includes(`<script src="${ADMIN}/assets/visitors.js" defer></script>`));
  assert.ok(!/\sstyle="/.test(pg.text), 'no inline styles');
  assert.ok(pg.text.includes('IP geolocation by <a href="https://db-ip.com"'), 'the CC BY attribution');
  for (const id of ['vis-globe', 'vis-sources', 'vis-devices', 'vis-engagement', 'vis-forms', 'vis-clicks', 'vis-perf', 'top-visitors', 'vis-storage']) assert.ok(pg.text.includes(`id="${id}"`), id);
  assert.ok(pg.text.includes('data-globe') && pg.text.includes('class="vis-loclist"'), 'the globe and its list');
  const csp = pg.headers.get('content-security-policy');
  assert.strictEqual(csp, "default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'");
  assert.ok(pg.headers.get('cache-control').includes('no-store'));
  const det = await areq(A, 'GET', `${ADMIN}?form=visitors&ip=${encodeURIComponent(ip)}`, { ip: aip, jar });
  assert.ok(det.text.includes('id="visitor"'));
  for (const raw of ['<script>alert', '<img src=x', '<svg onload']) assert.ok(!det.text.includes(raw), `detail: ${raw}`);
  assert.ok(det.text.includes('&lt;img src=x onerror=alert(3)&gt;') && det.text.includes('&lt;svg onload=alert(4)&gt;') && det.text.includes('&lt;script&gt;alert(5)'));
  const q = await areq(A, 'GET', `${ADMIN}?form=visitors&q=${encodeURIComponent('"><script>x</script>')}`, { ip: aip, jar });
  assert.ok(q.text.includes('value="&quot;&gt;&lt;script&gt;x&lt;/script&gt;"') && !q.text.includes('<script>x'));
  const unknown = await areq(A, 'GET', `${ADMIN}?form=visitors&ip=${encodeURIComponent('<x>')}`, { ip: aip, jar });
  assert.ok(unknown.status === 200 && !unknown.text.includes('id="visitor"'));
  const js = await areq(A, 'GET', `${ADMIN}/assets/visitors.js`, { ip: aip, jar });
  assert.ok(js.status === 200 && js.headers.get('content-type').includes('javascript') && js.headers.get('cache-control').includes('no-store'));
  const land = await areq(A, 'GET', `${ADMIN}/assets/land.json`, { ip: aip, jar });
  assert.ok(land.status === 200 && Array.isArray(JSON.parse(land.text).rings) && JSON.parse(land.text).rings.length > 50);
  for (const [file, min] of [['borders.json', 100], ['states.json', 100]]) {
    const r = await areq(A, 'GET', `${ADMIN}/assets/${file}`, { ip: aip, jar });
    assert.ok(r.status === 200 && Array.isArray(JSON.parse(r.text).lines) && JSON.parse(r.text).lines.length > min, `${file} is served to the signed-in admin`);
  }
  assert.ok(isDash((await areq(A, 'GET', `${ADMIN}?form=beta`, { ip: aip, jar })).text), 'the form tabs still work');
});

test('visits: CSP unchanged, nothing loaded from other hosts, private files never served', async () => {
  const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'";
  assert.ok(fs.readFileSync(path.join(__dirname, '_headers'), 'utf8').includes(`Content-Security-Policy: ${CSP}`));
  const pages = ['/', '/privacy.html', '/evidence.html', '/thanks.html', '/no-such-page'];
  for (const p of pages) {
    const res = await fetch(base + p);
    assert.strictEqual(res.headers.get('content-security-policy'), CSP, p);
    const html = await res.text();
    const loads = [...html.matchAll(/<(?:script|img|iframe|source|video|audio|embed)\b[^>]*\ssrc="([^"]*)"/gi), ...html.matchAll(/<link\b(?![^>]*\srel="canonical")[^>]*\shref="([^"]*)"/gi)].map((m) => m[1]);
    assert.ok(loads.length >= 3, p);
    for (const u of loads) assert.ok(!/^(https?:)?\/\//i.test(u), `${p} loads ${u}`);
    assert.ok(html.includes('src="assets/track.js') || html.includes('src="/assets/track.js'), `${p} has the stats script`);
    assert.ok(html.includes('No cookies or ad trackers. Simple visit stats; see <a href='), `${p} footer`);
    assert.ok(!html.includes('No cookies, analytics or trackers'), `${p}: the old footer is gone`);
  }
  assert.strictEqual((await visit({}, { ip: '8.8.9.9' })).headers.get('content-security-policy'), CSP, 'the beacon answer too');
  for (const s of ['/assets/site.js', '/assets/track.js', '/assets/theme.js', '/assets/grade-levels.js']) {
    const t = await (await fetch(base + s)).text();
    assert.ok(!/https?:\/\//i.test(t) && !/\/\/[a-z0-9-]+\.[a-z]/i.test(t.replace(/\/\/ .*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')), `${s} names no other host`);
  }
  const cfg = await (await fetch(`${base}/config.js`)).text();
  for (const line of cfg.split('\n').filter((l) => /https?:\/\//.test(l))) assert.ok(/^\s*\{ name: .*url: 'https:\/\//.test(line) || /^\s*\/\//.test(line), `config.js: only social links: ${line}`);
  const css = await (await fetch(`${base}/assets/site.css`)).text();
  assert.ok(!/@import|url\(\s*['"]?(https?:)?\/\//i.test(css), 'site.css loads nothing from elsewhere');
  for (const f of ['visitors.js', 'dashboard.js']) {
    const t = fs.readFileSync(path.join(__dirname, 'admin-assets', f), 'utf8');
    assert.ok(!/https?:\/\//i.test(t), f);
  }
  for (const p of ['/geo/ip-city.bin', '/geo/land-50m.json', '/geo/borders-50m.json', '/geo/states-50m.json', '/geo/raw/ne_50m_land.geojson', '/analytics.js', '/analytics-report.js', '/admin-visitors.js', '/geo.js', '/tools/build-geo.js',
    '/data/visit-counts.json', '/data/visit-links.jsonl', '/data/visit-optout.json', '/data/visit-salt', '/data/visits/2026-10.jsonl', '/admin-assets/visitors.js', '/donteventry/assets/visitors.js']) {
    assert.strictEqual((await fetch(base + p)).status, 404, p);
  }
});

test('visits: the privacy page states what is kept, and its Visit stats control works', async () => {
  const html = (await (await fetch(`${base}/privacy.html`)).text()).replace(/\s+/g, ' ');
  assert.ok(html.includes('Version 2026-10-25.3, in effect from 25 October 2026.'));
  for (const s of ['id="visit-stats"', 'IP address', 'never record what you type unless you send the form', 'Global Privacy Control', '24 months',
    'IP geolocation by <a href="https://db-ip.com"', 'CC BY 4.0', 'legitimate interest', 'your consent', 'data-visit-stats', 'data-visit-choice="allow"', 'data-visit-choice="deny"',
    'scroll', 'which form fields', 'how fast the page loaded', 'time zone', 'screen size', 'linked', 'not sell or share personal information (including IP addresses and inferred location)']) {
    assert.ok(html.includes(s), s);
  }
  assert.ok(!html.includes('We do not set cookies or use analytics'), 'the old sentence is gone');
  // "Don't allow" from outside the UK/EU: this IP is no longer identified, and its visits go
  const ip = '8.8.9.20';
  await visit({}, { ip });
  await settle();
  assert.ok((await allVisits()).some((v) => v.ip === ip));
  const no = await vreq('/api/visit-choice', { choice: 'deny' }, { ip });
  assert.deepStrictEqual(no.json, { ok: true, x: 1 });
  assert.ok(!(await allVisits()).some((v) => v.ip === ip), 'its visits were deleted');
  const again = await visit({}, { ip });
  assert.ok(again.json.a && again.json.x === 1, 'now counted anonymously');
  const optout = fs.readFileSync(path.join(TMP, 'visit-optout.json'), 'utf8');
  assert.ok(!optout.includes(ip) && /^[0-9a-f]{64}$/.test(fs.readFileSync(path.join(TMP, 'visit-salt'), 'utf8').trim()), 'stored as a salted hash');
  const yes = await vreq('/api/visit-choice', { choice: 'allow' }, { ip });
  assert.deepStrictEqual(yes.json, { ok: true, x: 0 });
  assert.ok((await visit({}, { ip })).json.v, 'identified again after Allow');
  assert.strictEqual((await vreq('/api/visit-choice', { choice: 'maybe' }, { ip })).json.ok, false);
  assert.strictEqual((await vreq('/api/visit-choice', { choice: 'deny' }, { ip, headers: { Origin: 'https://evil.example' } })).status, 403);
});

test('owner-only data: no route serves a data/ file; submissions, statistics and the audit log need a signed-in admin', ownerOnlyData);

test('admin: node server.js admin-verify-code checks a code from stdin against the secret', async () => {
  const file = path.join(ENV_DIR, 'verify.env');
  fs.writeFileSync(file, `ADMIN_USER=${A_USER}\nADMIN_TOTP_SECRET=${A_TOTP}\n`, { mode: 0o600 });
  try { fs.chmodSync(file, 0o600); } catch (e) { /* Windows */ }
  const env = { ...process.env, ADMIN_ENV_FILE: file };
  for (const k of [...admin.ADMIN_KEYS, 'ADMIN_PASSWORD_INPUT']) delete env[k];
  const run = (input, extra = {}) => spawnSync(process.execPath, [path.join(__dirname, 'server.js'), 'admin-verify-code'], { encoding: 'utf8', timeout: 30000, input, env: { ...env, ...extra } });
  const now = Date.now();
  const good = totp(now);
  const near = new Set([totp(now - 30000), good, totp(now + 30000), totp(now + 60000), totp(now - 60000)]);
  let bad = good;
  while (near.has(bad)) bad = String((Number(bad) + 13) % 1000000).padStart(6, '0');
  const ok = run(`${good}\n`);
  assert.strictEqual(ok.status, 0, ok.stderr);
  assert.strictEqual(ok.stdout, '', 'nothing on stdout');
  assert.ok(!ok.stderr.includes(A_TOTP) && !ok.stderr.includes(good), 'never the secret or the code');
  assert.strictEqual(run(` ${good} \r\n`).status, 0, 'spaces and CRLF are fine');
  for (const c of [`${bad}\n`, '\n', '', 'abcdef\n', `${good}1\n`]) assert.strictEqual(run(c).status, 1, JSON.stringify(c));
  assert.strictEqual(run(`${good}\n`, { ADMIN_ENV_FILE: path.join(ENV_DIR, 'none.env') }).status, 2, 'no secret: exit 2');
  // in process, with a clock
  const prev = process.exitCode;
  try {
    const quiet = console.error;
    console.error = () => {};
    try {
      assert.strictEqual(await admin.cliVerifyCode({ root: __dirname, env: { ADMIN_ENV_FILE: file }, input: totp(T0 - 30000), now: () => T0 }), true, 'one step early');
      assert.strictEqual(await admin.cliVerifyCode({ root: __dirname, env: { ADMIN_ENV_FILE: file }, input: totp(T0 + 90000), now: () => T0 }), false, 'three steps late');
    } finally { console.error = quiet; }
  } finally { process.exitCode = prev; }
});

(async () => {
  const csv = path.join(TMP, 'geo-fixture.csv');
  fs.writeFileSync(csv, GEO_CSV);
  await require('./tools/build-geo').buildIpFile(csv, process.env.GEO_FILE, { blockSize: 2 });
  mainApp = createApp({ visitPendingMs: 20 });
  const server = mainApp.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  let failed = 0;
  for (const [name, fn] of tests) {
    try { await fn(); console.log(`ok   ${name}`); } catch (e) { failed += 1; console.log(`FAIL ${name}\n     ${e.message}`); }
  }
  server.close();
  for (const s of extraServers) s.close();
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.rmSync(ENV_DIR, { recursive: true, force: true });
  console.log(`\n${tests.length - failed} of ${tests.length} passed`);
  process.exit(failed ? 1 : 0);
})();
