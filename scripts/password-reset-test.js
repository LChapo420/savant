/**
 * Forgot password (routes/password-reset.js, PASSWORD_RESET=on).
 *
 * Runs real servers on a temp data folder, with synthetic @example.test accounts and nothing real behind them: mail goes to the dev outbox, or to a fake
 * provider on this machine. The browser walk is scripts/password-reset-browser.js, outside `npm test` because playwright is not a dependency of the app.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'password-reset-'));
process.env.DB_FILE = path.join(dir, 'unit-db.json'); // for the unit checks' copy of the route
const dbFile = path.join(dir, 'db.json');
const outbox = path.join(dir, 'outbox');
const SITE = 'beta.savantedu.com';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OLD = 'old-password-1';
const NEW = 'new-password-2';
let failures = 0;
let passes = 0;
function check(name, ok, detail) {
  if (ok) { passes += 1; console.log(`  ok  ${name}`); } else { failures += 1; console.log(`  FAIL ${name}${detail !== undefined ? ` :: ${JSON.stringify(detail)}` : ''}`); }
}
const section = (name) => console.log(`\n${name}`);

let child = null;
let port = 7900 + Math.floor(Math.random() * 400);
let logs = '';
const seenTokens = new Set();

async function start(extra = {}) {
  port += 1;
  const env = {
    PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: dir, TMP: dir, NODE_ENV: 'test', PORT: String(port), TRUST_PROXY: '1',
    SESSION_SECRET: 'password-reset-test-secret-password-reset-0123', DB_FILE: dbFile, COST_TRACKER: 'off', BETA_REPORT_DAILY: 'off', OLLAMA_ENABLED: '0',
    CONSENT_SWEEP: 'off', WRITE_AHEAD: 'off', LOG_DIR: path.join(dir, 'logs'), MAIL_OUTBOX_DIR: outbox, MAIL_STATE_DIR: path.join(dir, 'mail-state'),
    // Named empty, so nothing on this machine can make a test send real mail.
    MAIL_PROVIDER: '', RESEND_API_KEY: '', BREVO_API_KEY: '', MAIL_FROM: '', APP_ORIGIN: '', BETA_GATE: '', PASSWORD_RESET: 'on',
    ...extra,
  };
  for (const key of Object.keys(env)) if (env[key] === undefined) delete env[key];
  child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (d) => { logs += d; });
  child.stderr.on('data', (d) => { logs += d; });
  for (let i = 0; i < 300; i += 1) {
    try { if ((await ask('GET', '/api/auth/me')).status === 200) return; } catch { /* still starting */ }
    await sleep(200);
  }
  throw new Error(`server did not start: ${logs.slice(-500)}`);
}
async function stop() {
  if (!child) return;
  const gone = new Promise((r) => child.once('exit', r));
  child.kill();
  await gone;
  child = null;
}

/** Straight to this machine by default; `site: true` is a request as Caddy forwards it. `ip` keeps each part of the test on its own allowance. */
function ask(method, url, { body, cookie, site, ip = '203.0.113.1', host, raw } = {}) {
  return new Promise((resolve, reject) => {
    const data = body !== undefined ? JSON.stringify(body) : null;
    const name = host || (site ? SITE : `127.0.0.1:${port}`);
    const started = Date.now();
    const req = http.request({
      host: '127.0.0.1', port, method, path: url,
      headers: {
        Host: name,
        'X-Forwarded-For': ip,
        ...(site || host ? { 'X-Forwarded-Proto': 'https', 'X-Forwarded-Host': name } : {}),
        ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), Origin: `${site || host ? 'https' : 'http'}://${name}` } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...(raw || {}),
      },
    }, (res) => {
      let text = '';
      res.on('data', (c) => { text += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(text); } catch { /* a page */ }
        const set = (res.headers['set-cookie'] || []).find((c) => c.startsWith('polymath.sid=')) || '';
        resolve({ status: res.statusCode, headers: res.headers, text, json, cookie: set ? set.split(';')[0] : null, ms: Date.now() - started });
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error(`timed out: ${method} ${url}`)));
    if (data) req.write(data);
    req.end();
  });
}

const API = '/api/auth/password-reset';
const askReset = (email, opts = {}) => ask('POST', `${API}/request`, { body: { email, ...(opts.next !== undefined ? { next: opts.next } : {}) }, ...opts });
const stillGood = async (token, opts = {}) => (await ask('POST', `${API}/check`, { body: { token }, ...opts })).json.valid === true;
const adultAge = { birth_year: 1990, birth_month: 1, country: 'US' };
const childAge = { birth_year: new Date().getUTCFullYear() - 10, birth_month: 1, country: 'US' };
const signIn = (login, password, opts = {}) => ask('POST', '/api/auth/login', { body: { email: login, password }, ...opts });
const who = async (cookie, opts = {}) => (await ask('GET', '/api/auth/me', { cookie, ...opts })).json.user;

async function makeAdult(email, opts = {}) {
  const res = await ask('POST', '/api/auth/register', { body: { email, password: OLD, display_name: 'Test Adult', ...adultAge }, ...opts });
  if (res.status !== 201) throw new Error(`register ${email}: ${res.status} ${res.text}`);
  return res;
}

function mails() {
  if (!fs.existsSync(outbox)) return [];
  return fs.readdirSync(outbox).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(outbox, f), 'utf8')));
}
const resetMails = (to) => mails().filter((m) => m.tag === 'password-reset' && (!to || m.to === to));
const tokenIn = (mail) => {
  const m = /\/reset-password#token=([A-Za-z0-9_-]{43})\s/.exec(`${mail.text}\n`);
  if (m) seenTokens.add(m[1]);
  return m && m[1];
};
async function waitForMail(to, count) {
  for (let i = 0; i < 100; i += 1) {
    const list = resetMails(to);
    if (list.length >= count) return list[list.length - 1];
    await sleep(50);
  }
  return null;
}
/** Ask for a link and hand back its token. */
async function linkFor(email, opts = {}) {
  const before = resetMails(email).length;
  await askReset(email, opts);
  const mail = await waitForMail(email, before + 1);
  return mail ? tokenIn(mail) : null;
}
const nothingMoreSent = () => sleep(300); // the work after a request's answer is done well inside this

async function waitForFile(test) {
  for (let i = 0; i < 150; i += 1) {
    try { const data = JSON.parse(fs.readFileSync(dbFile, 'utf8')); if (test(data)) return data; } catch { /* mid-write */ }
    await sleep(200);
  }
  return null;
}

// ── 1. the pure parts ────────────────────────────────────────────────────────

function unit() {
  section('Unit: where ?next= may go, and who may reset');
  const route = require('../routes/password-reset');
  const { safeNext, eligible } = route;
  for (const good of ['/dashboard', '/a/b?c=d&e=f', '/onboarding?track=act']) check(`next stays: ${good}`, safeNext(good) === good);
  for (const bad of ['//evil.example', '/\\evil.example', 'https://evil.example', '/\t/evil.example', '/\n/evil.example', 'javascript:alert(1)', 'evil', '', null, 5, ['/x'], {}, `/${'x'.repeat(600)}`, '/forgot-password', '/reset-password.html', '/RESET-PASSWORD/']) {
    check(`next dropped: ${JSON.stringify(bad).slice(0, 30)}`, safeNext(bad) === null);
  }
  const adult = { email: 'a@example.test', password_hash: 'x', account_type: 'standard', age_check: { needs_parent: false } };
  check('an adult with an email and password may', eligible(adult) === true);
  check('no age answer may not (it may be a child)', eligible({ ...adult, age_check: null }) === false);
  check('needs a parent may not', eligible({ ...adult, age_check: { needs_parent: true } }) === false);
  check('a child account with an email may not', eligible({ ...adult, account_type: 'child' }) === false);
  check('a row with a consent may not', eligible({ ...adult, consent_id: 9 }) === false);
  check('a row with a username may not', eligible({ ...adult, username: 'kid' }) === false);
  check('a guest may not', eligible({ ...adult, guest: true }) === false);
  check('no email may not', eligible({ ...adult, email: null }) === false);
  check('no password may not', eligible({ ...adult, password_hash: null }) === false);
  check('nobody may not', eligible(null) === false);
}

// ── 2. off ───────────────────────────────────────────────────────────────────

async function off() {
  section('Off: nothing changes');
  await start({ PASSWORD_RESET: undefined });
  const file = fs.readFileSync(path.join(ROOT, 'public', 'login.html'), 'utf8');
  const direct = await ask('GET', '/login');
  check('sign-in page is the file, byte for byte', direct.status === 200 && direct.text === file);
  const gated = await ask('GET', '/login', { site: true });
  check('sign-in only: no link either', gated.status === 200 && !/forgot/i.test(gated.text) && gated.text.includes('data-signin-only="1"'));
  check('the file itself has no link', !/forgot/i.test(file));
  for (const page of ['/forgot-password', '/forgot-password.html', '/reset-password', '/reset-password.html', '/password-reset.js', '/RESET-PASSWORD']) {
    check(`GET ${page} is 404`, (await ask('GET', page)).status === 404);
    check(`GET ${page} is 404 on the site too`, (await ask('GET', page, { site: true })).status === 404);
  }
  const unknown = await ask('POST', '/api/auth/nothing-here', { body: {} });
  for (const route of ['request', 'check', 'reset']) {
    const res = await ask('POST', `${API}/${route}`, { body: { email: 'x@example.test' } });
    check(`POST ${route} is 404, as for an address that does not exist`, res.status === 404 && res.status === unknown.status && res.text.replace(`${API}/${route}`, '') === unknown.text.replace('/api/auth/nothing-here', ''), res.text.slice(0, 80));
  }
  await makeAdult('off@example.test');
  const signedIn = await signIn('off@example.test', OLD);
  check('sign-in still works', signedIn.status === 200 && !!(await who(signedIn.cookie)));
  check('no mail transport was installed', (await ask('GET', '/api/consent/config')).json.mail === 'dev-outbox');
  await stop();
  await start({ PASSWORD_RESET: 'yes' });
  check('only the word "on" turns it on', (await ask('GET', '/forgot-password')).status === 404);
  await stop();
}

async function cannotSend() {
  section('On in production with no way to send: stays hidden, and says why at start-up');
  const prod = { NODE_ENV: 'production', BETA_SIGNIN_ONLY: 'off' };
  logs = '';
  await start({ ...prod, APP_ORIGIN: `https://${SITE}` });
  check('no provider: no link', !/forgot/i.test((await ask('GET', '/login', { site: true })).text));
  check('no provider: page 404', (await ask('GET', '/forgot-password', { site: true })).status === 404);
  check('no provider: route 404', (await ask('POST', `${API}/request`, { body: { email: 'x@example.test' }, site: true })).status === 404);
  check('no provider: a warning at start-up', /PASSWORD_RESET=on, but it stays off/.test(logs));
  await stop();
  await start({ ...prod, MAIL_ALLOW_OUTBOX: '1' });
  check('no APP_ORIGIN: page 404', (await ask('GET', '/forgot-password', { site: true })).status === 404);
  await stop();
  logs = '';
  await start({ ...prod, MAIL_PROVIDER: 'resend', RESEND_API_KEY: '', MAIL_FROM: 'Savant <no-reply@example.test>', APP_ORIGIN: `https://${SITE}` });
  check('a provider with no key: page 404, and the app still starts', (await ask('GET', '/forgot-password', { site: true })).status === 404);
  check('a provider with no key: says which name is missing', /resend: no API key/.test(logs));
  await stop();
  await start({ ...prod, MAIL_ALLOW_OUTBOX: '1', APP_ORIGIN: `https://${SITE}` });
  check('the outbox stopgap counts as a way to send', (await ask('GET', '/forgot-password', { site: true })).status === 200);
  await stop();
}

// ── 3. on ────────────────────────────────────────────────────────────────────

async function pagesOn() {
  section('Pages');
  const direct = await ask('GET', '/login');
  check('sign-in page has the link', /<a href="\/forgot-password">Forgot password\?<\/a>/.test(direct.text));
  check('sign-in page keeps sign-up when the site is open', /Create an account/.test(direct.text));
  const gated = await ask('GET', '/login', { site: true });
  check('sign-in only: has the link, keeps the mark, no sign-up', /Forgot password\?/.test(gated.text) && gated.text.includes('data-signin-only="1"') && !/Create an account/.test(gated.text));
  check('next carries over to the link', (await ask('GET', `/login?next=${encodeURIComponent('/dashboard?x=1')}`)).text.includes('href="/forgot-password?next=%2Fdashboard%3Fx%3D1"'));
  check('an unsafe next does not', (await ask('GET', `/login?next=${encodeURIComponent('//evil.example')}`)).text.includes('href="/forgot-password"'));
  check('no reset line normally', !/password was changed/.test(direct.text));
  check('the line after a reset', /Your password was changed/.test((await ask('GET', '/login?reset=1')).text));
  for (const site of [false, true]) {
    for (const page of ['/forgot-password', '/reset-password', '/reset-password.html']) {
      const res = await ask('GET', page, { site });
      check(`${page} opens logged out (${site ? 'site' : 'local'})`, res.status === 200 && /<form/.test(res.text) && res.headers['cache-control'] === 'no-store', res.status);
      check(`${page} has no inline script, so it passes the site's script policy`, !/<script(?![^>]*\bsrc=)/.test(res.text) && !/ on[a-z]+="/.test(res.text));
    }
    const script = await ask('GET', '/password-reset.js', { site });
    check(`the page script is served (${site ? 'site' : 'local'})`, script.status === 200 && /javascript/.test(script.headers['content-type']) && script.text.includes('App.mount'));
  }
  check('the site pages carry the sign-in-only mark', (await ask('GET', '/forgot-password', { site: true })).text.includes('data-signin-only="1"'));
  const fromGate = await makeAdult('gate@example.test', { ip: '203.0.113.2' });
  const signedInLogin = await ask('GET', '/login', { cookie: fromGate.cookie, site: true });
  check('a signed-in visitor to sign-in still goes home', signedInLogin.status === 302 && signedInLogin.headers.location === '/');
}

async function theFlow() {
  section('Asking: the same answer either way, and a link only for an account');
  const email = 'flow@example.test';
  const first = await makeAdult(email);
  const second = await signIn(email, OLD);
  await makeAdult('other@example.test');
  const bystander = await signIn('other@example.test', OLD);

  const known = await askReset(email);
  const unknown = await askReset('nobody-here@example.test');
  check('same status', known.status === 200 && unknown.status === 200);
  check('same body', known.text === unknown.text && known.text === JSON.stringify({ ok: true }), [known.text, unknown.text]);
  for (const odd of [null, 5, ['a@example.test'], { a: 1 }, '', 'not-an-email', 'kid_username']) {
    const res = await ask('POST', `${API}/request`, { body: { email: odd } });
    check(`same answer for ${JSON.stringify(odd)}`, res.status === 200 && res.text === known.text, res.text);
  }
  check('same answer with an empty body', (await ask('POST', `${API}/request`, { body: {} })).text === known.text);
  const mail = await waitForMail(email, 1);
  await nothingMoreSent();
  check('the account got one email', resetMails(email).length === 1 && !!mail);
  check('nobody else got one', resetMails().every((m) => m.to === email), resetMails().map((m) => m.to));
  check('plain words, a subject and the link', mail.subject === 'Reset your Savant password' && /works once, for the next hour/.test(mail.text) && /ignore this email/.test(mail.text));
  const token = tokenIn(mail);
  check('the token is in the #fragment, never a query', !!token && !mail.text.includes('?token') && mail.text.includes(`http://127.0.0.1:${port}/reset-password#token=`));

  section('Stored: only a hash, for an hour');
  const stored = await waitForFile((d) => d.users.some((u) => u.email === email && u.password_reset));
  const row = stored.users.find((u) => u.email === email).password_reset;
  check('a hash is stored', /^[0-9a-f]{64}$/.test(row.token_hash));
  check('the token itself is nowhere in the data file', !JSON.stringify(stored).includes(token));
  const left = Date.parse(row.expires_at) - Date.now();
  check('it runs out in an hour', left > 55 * 60 * 1000 && left <= 60 * 60 * 1000, left);
  const me = await ask('GET', '/api/auth/me', { cookie: first.cookie });
  const exported = await ask('GET', '/api/account/export', { cookie: first.cookie });
  check('no browser sees the row', !/password_reset|token_hash/.test(me.text) && exported.status === 200 && !/password_reset|token_hash/.test(exported.text), exported.status);

  section('A new request ends the old link');
  check('the link is good', await stillGood(token));
  const newer = await linkFor(email);
  check('a second link came', !!newer && newer !== token);
  check('the old link is dead', !(await stillGood(token)));
  check('the new link is good', await stillGood(newer));
  const useOld = await ask('POST', `${API}/reset`, { body: { token, password: NEW } });
  check('the old link cannot set a password', useOld.status === 400 && useOld.json.code === 'bad_link');
  check('checking a link does not spend it', await stillGood(newer));

  section('The sign-up password rules; a refused password keeps the link');
  const signUp7 = await ask('POST', '/api/auth/register', { body: { email: 'short@example.test', password: '1234567', display_name: 'Test', ...adultAge }, ip: '203.0.113.3' });
  const signUp201 = await ask('POST', '/api/auth/register', { body: { email: 'long@example.test', password: 'x'.repeat(201), display_name: 'Test', ...adultAge }, ip: '203.0.113.3' });
  const short = await ask('POST', `${API}/reset`, { body: { token: newer, password: '1234567' } });
  const long = await ask('POST', `${API}/reset`, { body: { token: newer, password: 'x'.repeat(201) } });
  check('too short: sign-up\'s own words', short.status === 400 && short.json.error === signUp7.json.error, short.json);
  check('too long: sign-up\'s own words', long.status === 400 && long.json.error === signUp201.json.error, long.json);
  for (const bad of [undefined, 12345678, ['abcdefgh'], {}]) {
    const res = await ask('POST', `${API}/reset`, { body: { token: newer, password: bad } });
    check(`not text: refused (${JSON.stringify(bad)})`, res.status === 400 && res.json.code === 'weak_password');
  }
  check('the link survives all of that', await stillGood(newer));
  for (const bad of [undefined, null, 5, {}, ['x'], 'short', 'A'.repeat(43)]) {
    const res = await ask('POST', `${API}/reset`, { body: { token: bad, password: NEW } });
    check(`a bad token is refused (${String(JSON.stringify(bad)).slice(0, 12)})`, res.status === 400 && res.json.code === 'bad_link');
    check('and is no link', !(await stillGood(bad)));
  }
  check('the old password still works so far', (await signIn(email, OLD)).status === 200);

  section('Setting it');
  const done = await ask('POST', `${API}/reset`, { body: { token: newer, password: NEW } });
  check('it is set, and goes to sign-in', done.status === 200 && done.json.redirect === '/login?reset=1', done.json);
  check('not signed in by the reset', !done.cookie);
  check('the old password stops', (await signIn(email, OLD)).status === 401);
  check('the link is single use', !(await stillGood(newer)));
  const again = await ask('POST', `${API}/reset`, { body: { token: newer, password: 'another-password-3' } });
  check('a second use is refused', again.status === 400 && again.json.code === 'bad_link');
  check('every older session of this account ended', !(await who(first.cookie)) && !(await who(second.cookie)));
  check('someone else\'s session did not', (await who(bystander.cookie)).email === 'other@example.test');
  const fresh = await signIn(email, NEW);
  check('the new password signs in, and stays signed in', fresh.status === 200 && (await who(fresh.cookie)).email === email);
  const stored2 = await waitForFile((d) => d.users.some((u) => u.email === email && !u.password_reset && u.session_epoch === 1));
  check('nothing of the link is left on the account', !!stored2);
  const account = stored2.users.find((u) => u.email === email);
  check('the password is stored hashed', /^\$2[aby]\$/.test(account.password_hash) && !JSON.stringify(stored2).includes(NEW));

  section('A second reset ends the session the first one left');
  const third = await linkFor(email);
  const second2 = await ask('POST', `${API}/reset`, { body: { token: third, password: 'third-password-3' } });
  check('reset again', second2.status === 200);
  check('the session from after the first reset ended too', !(await who(fresh.cookie)));

  section('This browser, signed in while it resets');
  const here = 'here@example.test';
  const herSession = await makeAdult(here);
  const hereToken = await linkFor(here);
  const hereDone = await ask('POST', `${API}/reset`, { body: { token: hereToken, password: NEW }, cookie: herSession.cookie });
  check('signed out, cookie cleared', hereDone.status === 200 && /polymath\.sid=;/.test(String(hereDone.headers['set-cookie'])) && !(await who(herSession.cookie)), hereDone.headers['set-cookie']);

  section('Two uses of one link at once');
  const race = 'race@example.test';
  await makeAdult(race);
  const raceToken = await linkFor(race);
  const [a, b] = await Promise.all([
    ask('POST', `${API}/reset`, { body: { token: raceToken, password: 'race-winner-a' } }),
    ask('POST', `${API}/reset`, { body: { token: raceToken, password: 'race-winner-b' } }),
  ]);
  check('exactly one wins', [a.status, b.status].sort().join() === '200,400', [a.status, b.status]);
  const winner = a.status === 200 ? 'race-winner-a' : 'race-winner-b';
  check('and its password is the one that holds', (await signIn(race, winner)).status === 200);

  section('Where it goes afterwards: ?next=');
  const nextTo = async (email2, next) => {
    await makeAdult(email2);
    const t = await linkFor(email2, { next });
    return (await ask('POST', `${API}/reset`, { body: { token: t, password: NEW } })).json.redirect;
  };
  check('a place on this site is kept', (await nextTo('next1@example.test', '/dashboard?x=1')) === '/login?reset=1&next=%2Fdashboard%3Fx%3D1');
  check('another site is dropped', (await nextTo('next2@example.test', 'https://evil.example/')) === '/login?reset=1');
  check('//another site is dropped', (await nextTo('next3@example.test', '//evil.example/')) === '/login?reset=1');
  check('a backslash trick is dropped', (await nextTo('next4@example.test', '/\\evil.example')) === '/login?reset=1');

  section('Email spelling');
  await makeAdult('case@example.test');
  const caseToken = await linkFor('  CASE@Example.TEST ').catch(() => null);
  await nothingMoreSent();
  const caseMail = resetMails('case@example.test');
  check('capitals and spaces reach the same account', caseMail.length === 1 && !caseToken, caseMail.length);
}

async function children() {
  section('Child accounts: nothing is sent, nothing is bypassed');
  const ip = '203.0.113.20';
  const notice = (await ask('GET', '/api/consent/config')).json.notice_version;
  const consentMail = (to) => mails().filter((m) => m.tag === 'consent-request' && m.to === to).pop();

  // A child account on the sign-up route: a username, no email, the parent's address on the consent row.
  const parentEmail = 'parent@example.test';
  const childSignup = await ask('POST', '/api/auth/register', { body: { username: 'kid_one', password: OLD, display_name: 'Kid', parent_email: parentEmail, ...childAge }, ip });
  check('the synthetic child account exists, with no email', childSignup.status === 201 && childSignup.json.user.email === null, childSignup.json);
  const usedBefore = mails().length;
  const asUsername = await askReset('kid_one', { ip });
  const asParent = await askReset(parentEmail, { ip });
  const asUnknown = await askReset('nobody-2@example.test', { ip });
  await nothingMoreSent();
  check('username, parent\'s address, unknown address: the same answer', asUsername.text === asUnknown.text && asParent.text === asUnknown.text && asUsername.status === 200);
  check('no email at all went out, to the child or the parent', mails().length === usedBefore, mails().slice(usedBefore).map((m) => [m.to, m.tag]));

  // The parent agrees: an active consent. Still nothing, and the parent is not written to.
  const consentToken = /token=([A-Za-z0-9_-]+)/.exec(consentMail(parentEmail).text)[1];
  const agreed = await ask('POST', `/api/consent/request/${consentToken}`, { body: { decision: 'agree', notice_version: notice, i_am_parent: true, password: 'parent-password-1' }, ip });
  check('the parent agreed', agreed.status === 200, agreed.json);
  const parentSession = agreed.cookie || (await ask('POST', '/api/consent/parent/login', { body: { email: parentEmail, password: 'parent-password-1' }, ip })).cookie;
  const usedActive = mails().length;
  await askReset('kid_one', { ip });
  await askReset(parentEmail, { ip });
  await nothingMoreSent();
  check('with consent in force: still nothing sent', mails().length === usedActive);
  check('the child\'s own password still works', (await signIn('kid_one', OLD, { ip })).status === 200);

  // The parent turns the account off. A reset must not be a way back in.
  const kids = (await ask('GET', '/api/consent/parent/me', { cookie: parentSession, ip })).json.children;
  const kid = kids[0];
  const revoked = await ask('POST', `/api/consent/parent/children/${kid.id || kid.consent_id}/revoke`, { body: {}, cookie: parentSession, ip });
  check('the parent revoked', revoked.status === 200, revoked.json);
  await askReset('kid_one', { ip });
  await nothingMoreSent();
  check('revoked: still nothing sent', mails().length === usedActive);
  const lockedIn = await signIn('kid_one', OLD, { ip });
  const blocked = await ask('GET', '/api/enrollments', { cookie: lockedIn.cookie, ip });
  check('revoked: the account stays locked', blocked.status === 403 && blocked.json.code === 'consent_revoked', blocked.json);

  // An account from before the age screen that holds an email, then answers as a child.
  const withEmail = 'kid-with-email@example.test';
  const reg = await ask('POST', '/api/auth/register', { body: { email: withEmail, password: OLD, display_name: 'Kid Two' }, ip });
  check('no age answer yet', reg.status === 201 && !!reg.json.user.age_needed, reg.json.user);
  const noAgeUsed = mails().length;
  await askReset(withEmail, { ip });
  await nothingMoreSent();
  check('no age answer: nothing sent (it may be a child\'s)', mails().length === noAgeUsed);
  const answered = await ask('POST', '/api/consent/age', { body: childAge, cookie: reg.cookie, ip });
  check('it answers as a child', answered.status === 200 && answered.json.route === 'parent', answered.json);
  await askReset(withEmail, { ip });
  await nothingMoreSent();
  check('a child with an email on the row: nothing sent to that email', mails().length === noAgeUsed);

  // A pending child's parent: the address is held only to ask for consent.
  const pendingParent = 'pending-parent@example.test';
  await ask('POST', '/api/auth/register', { body: { username: 'kid_three', password: OLD, display_name: 'Kid Three', parent_email: pendingParent, ...childAge }, ip });
  const pendingUsed = mails().length;
  await askReset('kid_three', { ip });
  await askReset(pendingParent, { ip });
  await nothingMoreSent();
  check('consent pending: nothing beyond the consent request', mails().length === pendingUsed);

  // A parent with an adult account of their own, on the same address: only that account, and not the parent login.
  await makeAdult(parentEmail, { ip });
  const ownToken = await linkFor(parentEmail, { ip });
  check('a parent\'s own adult account can reset', !!ownToken);
  const ownDone = await ask('POST', `${API}/reset`, { body: { token: ownToken, password: NEW }, ip });
  check('it resets', ownDone.status === 200);
  check('the parent login keeps its own password', (await ask('POST', '/api/consent/parent/login', { body: { email: parentEmail, password: 'parent-password-1' }, ip })).status === 200);
  check('and the parent login does not take the new one', (await ask('POST', '/api/consent/parent/login', { body: { email: parentEmail, password: NEW }, ip })).status === 401);
  const after = await ask('GET', '/api/enrollments', { cookie: (await signIn('kid_one', OLD, { ip })).cookie, ip });
  check('the child stays locked after the parent\'s own reset', after.status === 403 && after.json.code === 'consent_revoked');
}

async function afterRestart() {
  section('Run out, or no longer eligible, by the time it is used');
  const accounts = ['expired', 'turned-child', 'new-email', 'still-good'].map((n) => `${n}@example.test`);
  const tokens = {};
  for (const email of accounts) {
    await makeAdult(email, { ip: '203.0.113.30' });
    tokens[email] = await linkFor(email, { ip: '203.0.113.30' });
  }
  check('all four links are good first', (await Promise.all(accounts.map((e) => stillGood(tokens[e], { ip: '203.0.113.30' })))).every(Boolean));
  const saved = await waitForFile((d) => accounts.every((e) => d.users.some((u) => u.email === e && u.password_reset)));
  check('saved to disk', !!saved);
  await stop();
  // A copy of what an hour, or a late age answer, would leave behind.
  const data = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
  const byEmail = (e) => data.users.find((u) => u.email === e);
  byEmail(accounts[0]).password_reset.expires_at = new Date(Date.now() - 1000).toISOString();
  const turned = byEmail(accounts[1]);
  turned.age_check = { ...turned.age_check, needs_parent: true };
  turned.account_type = 'child';
  const hashBefore = turned.password_hash;
  byEmail(accounts[2]).email = 'changed@example.test';
  fs.writeFileSync(dbFile, JSON.stringify(data));
  await start();
  const ip = '203.0.113.31';
  for (const e of accounts.slice(0, 3)) {
    check(`${e}: the link is dead`, !(await stillGood(tokens[e], { ip })));
    const res = await ask('POST', `${API}/reset`, { body: { token: tokens[e], password: NEW }, ip });
    check(`${e}: it cannot set a password`, res.status === 400 && res.json.code === 'bad_link', res.json);
  }
  check('turned child: the password did not move', JSON.parse(fs.readFileSync(dbFile, 'utf8')).users.find((u) => u.email === accounts[1]).password_hash === hashBefore);
  check('a link survives a restart', await stillGood(tokens[accounts[3]], { ip }));
  check('and works', (await ask('POST', `${API}/reset`, { body: { token: tokens[accounts[3]], password: NEW }, ip })).status === 200);
}

async function limits() {
  section('Limits');
  const email = 'limit@example.test';
  await makeAdult(email, { ip: '203.0.113.40' });
  const answers = [];
  for (let i = 0; i < 6; i += 1) answers.push(await askReset(email, { ip: `203.0.113.${50 + i}` })); // from different addresses
  await waitForMail(email, 3);
  await nothingMoreSent();
  check('one email address gets at most 3 emails an hour', resetMails(email).length === 3, resetMails(email).length);
  check('and the answer does not show it', answers.every((a) => a.status === 200 && a.text === answers[0].text));
  const lastSent = tokenIn(resetMails(email).pop());
  check('the last link sent keeps working past the limit', await stillGood(lastSent, { ip: '203.0.113.41' }));

  const ip = '203.0.113.60';
  let statuses = [];
  for (let i = 0; i < 31; i += 1) statuses.push((await askReset(`spray${i}@example.test`, { ip })).status);
  check('one network address: 30 requests an hour, then 429', statuses.slice(0, 30).every((s) => s === 200) && statuses[30] === 429, statuses.slice(-3));
  const limited = await askReset('anyone@example.test', { ip });
  check('429 is the same for any address, and says when', limited.status === 429 && !!limited.headers['retry-after']);
  check('another network address is not held up', (await askReset('someone@example.test', { ip: '203.0.113.61' })).status === 200);

  statuses = [];
  for (let i = 0; i < 31; i += 1) statuses.push((await ask('POST', `${API}/reset`, { body: { token: 'A'.repeat(43), password: NEW }, ip: '203.0.113.62' })).status);
  check('setting: 30 tries per 15 minutes per address', statuses.slice(0, 30).every((s) => s === 400) && statuses[30] === 429, statuses.slice(-3));
  statuses = [];
  for (let i = 0; i < 61; i += 1) statuses.push((await ask('POST', `${API}/check`, { body: { token: 'A'.repeat(43) }, ip: '203.0.113.63' })).status);
  check('checking: 60 tries per 15 minutes per address', statuses.slice(0, 60).every((s) => s === 200) && statuses[60] === 429, statuses.slice(-3));
}

/** A stand-in for Resend on this machine: slow on purpose, so any wait for it would show on the clock. */
function fakeProvider() {
  const state = { received: [], fail: false, delay: 700 };
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', async () => {
      const body = JSON.parse(raw);
      state.received.push({ auth: req.headers.authorization, body });
      await sleep(state.delay);
      if (state.fail) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: `refused: ${body.text}` })); // a provider that quotes the message back
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: `fake-${state.received.length}` }));
    });
  });
  return { state, server };
}

async function throughProvider() {
  section('Through a mail provider (a fake one on this machine), in production');
  const { state, server } = fakeProvider();
  await new Promise((r) => { server.listen(0, '127.0.0.1', r); });
  const fakePort = server.address().port;
  const before = mails().length;
  logs = '';
  await start({
    NODE_ENV: 'production', BETA_SIGNIN_ONLY: 'off', APP_ORIGIN: `https://${SITE}`,
    MAIL_PROVIDER: 'resend', RESEND_API_KEY: 'fake-key-for-this-test', RESEND_API_URL: `http://127.0.0.1:${fakePort}/emails`, MAIL_FROM: 'Savant <no-reply@example.test>',
  });
  check('the provider is installed', (await ask('GET', '/api/consent/config', { site: true })).json.mail === 'custom');
  const email = 'provider@example.test';
  const opts = { site: true, ip: '203.0.113.70' };
  await makeAdult(email, opts);
  const known = await askReset(email, opts);
  for (let i = 0; i < 100 && !state.received.length; i += 1) await sleep(50);
  check('the provider got it', state.received.length === 1 && state.received[0].body.to[0] === email && state.received[0].auth === 'Bearer fake-key-for-this-test');
  check('with a plain-text body and our sender', /\/reset-password#token=/.test(state.received[0].body.text) && state.received[0].body.from === 'Savant <no-reply@example.test>');
  const linkOf = (n) => /(https?:\/\/\S+)\/reset-password#token=([A-Za-z0-9_-]{43})/.exec(state.received[n].body.text);
  check('the link uses APP_ORIGIN', linkOf(0)[1] === `https://${SITE}`);
  seenTokens.add(linkOf(0)[2]);

  section('No timing leak: the answer does not wait for the lookup or the mail');
  const times = { known: [known.ms], unknown: [] };
  times.known.push((await askReset(email, opts)).ms);
  for (let i = 0; i < 2; i += 1) times.unknown.push((await askReset(`none${i}@example.test`, opts)).ms);
  times.known.push((await askReset(email, opts)).ms);
  times.unknown.push((await askReset('none9@example.test', opts)).ms);
  for (let i = 0; i < 100 && state.received.length < 3; i += 1) await sleep(50);
  check(`known account answers before its ${state.delay} ms mail call: ${times.known.join(', ')} ms against unknown ${times.unknown.join(', ')} ms`, Math.max(...times.known) < state.delay / 2 && state.received.length === 3, times);
  await sleep(state.delay + 200);

  section('A forged Host cannot steer the link');
  const forgedTo = 'forged@example.test';
  await makeAdult(forgedTo, opts);
  const n = state.received.length;
  await askReset(forgedTo, { host: 'savant-login.example', ip: '203.0.113.71' });
  for (let i = 0; i < 100 && state.received.length <= n; i += 1) await sleep(50);
  check('still APP_ORIGIN', state.received.length === n + 1 && linkOf(n)[1] === `https://${SITE}`);
  seenTokens.add(linkOf(n)[2]);
  await sleep(state.delay + 200);

  section('When the mail fails');
  const failing = 'failing@example.test';
  await makeAdult(failing, opts);
  state.fail = true;
  state.delay = 0;
  const m = state.received.length;
  const failed = await askReset(failing, opts);
  check('the answer is the same', failed.status === 200 && failed.text === known.text);
  for (let i = 0; i < 100 && !/the email was not sent/.test(logs); i += 1) await sleep(50);
  const refusedToken = /token=([A-Za-z0-9_-]{43})/.exec(state.received[m].body.text)[1];
  seenTokens.add(refusedToken);
  check('it is logged', /Password reset: the email was not sent/.test(logs));
  check('the log does not repeat the token, even when the provider quotes it', !logs.includes(refusedToken));
  check('the link is not left alive', (await ask('POST', `${API}/check`, { body: { token: refusedToken }, ...opts })).json.valid === false);
  check('nothing went to the outbox in production with a provider', mails().length === before);
  await stop();
  await new Promise((r) => { server.close(r); });
}

function noTokenAnywhere() {
  section('The token is never logged or stored');
  check(`tokens seen by this test: ${seenTokens.size}`, seenTokens.size >= 10, seenTokens.size);
  const hay = [{ name: 'server output', text: allLogs }];
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) { if (entry.name !== 'outbox') walk(p); } else if (fs.statSync(p).size < 50 * 1024 * 1024) hay.push({ name: path.relative(dir, p), text: fs.readFileSync(p, 'latin1') });
    }
  };
  walk(dir);
  check(`searched ${hay.length} places: server output, the data file, session store, logs`, hay.length >= 3, hay.map((h) => h.name));
  const found = hay.filter((h) => [...seenTokens].some((t) => h.text.includes(t)));
  check('no token in any of them (only the outbox message, which is the email itself)', !found.length, found.map((h) => h.name));
  check('no link in server output', !/reset-password#token|token=[A-Za-z0-9_-]{43}/.test(allLogs));
}

let allLogs = '';
const keepLogs = () => { allLogs += logs; logs = ''; };

(async () => {
  unit();
  await off();
  keepLogs();
  await cannotSend();
  keepLogs();
  await start();
  await pagesOn();
  await theFlow();
  await children();
  await afterRestart();
  await limits();
  await stop();
  keepLogs();
  await throughProvider();
  keepLogs();
  noTokenAnywhere();
  console.log(`\n${passes} passed, ${failures} failed.`);
  if (failures) process.exitCode = 1;
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
}).finally(async () => {
  try { await stop(); } catch { /* already down */ }
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* Windows may hold a file a moment */ }
  process.exit(process.exitCode || 0);
});
