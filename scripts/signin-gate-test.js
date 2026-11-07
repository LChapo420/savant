/**
 * Sign-in only and "remember me" (middleware/signin-only.js, routes/auth.js, services/session-store.js).
 * Runs real servers on a temp data folder, behind the same headers Caddy sends for beta.savantedu.com.
 * The full deploy (app files replaced) was proved by hand; here a stop and start on the same data folder stands in for it.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { SqliteSessionStore } = require('../services/session-store');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'signin-gate-'));
const dbFile = path.join(dir, 'db.json');
const SITE = 'beta.savantedu.com';
const YEAR = 365 * 24 * 3600 * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail) {
  if (ok) console.log(`  ok  ${name}`);
  else { failures += 1; console.log(`  FAIL ${name}${detail !== undefined ? ` :: ${JSON.stringify(detail)}` : ''}`); }
}

let child = null;
let port = 7400 + Math.floor(Math.random() * 400);
async function start(extra = {}) {
  port += 1;
  const env = {
    PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: dir, TMP: dir, NODE_ENV: 'production', PORT: String(port), TRUST_PROXY: '1',
    SESSION_SECRET: 'signin-gate-test-secret-signin-gate-test-0123', DB_FILE: dbFile, COST_TRACKER: 'off', BETA_REPORT_DAILY: 'off', OLLAMA_ENABLED: '0',
    LOG_DIR: path.join(dir, 'logs'), APP_ORIGIN: `https://${SITE}`, ...extra,
  };
  for (const key of Object.keys(env)) if (env[key] === undefined) delete env[key];
  child = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env, stdio: 'ignore' });
  for (let i = 0; i < 300; i += 1) {
    try { if ((await ask('GET', '/api/auth/me', { direct: true })).status === 200) return; } catch { /* still starting */ }
    await sleep(200);
  }
  throw new Error('server did not start');
}
async function stop() {
  if (!child) return;
  const gone = new Promise((r) => child.once('exit', r));
  child.kill();
  await gone;
  child = null;
}

/** A request as Caddy forwards it, or with { direct: true } straight to 127.0.0.1. */
function ask(method, url, { body, cookie, direct, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      host: '127.0.0.1', port, method, path: url,
      headers: {
        ...(direct ? { Host: `127.0.0.1:${port}` } : { Host: SITE, 'X-Forwarded-Proto': 'https', 'X-Forwarded-Host': SITE, 'X-Forwarded-For': '203.0.113.9' }),
        ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), Origin: direct ? `http://127.0.0.1:${port}` : `https://${SITE}` } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
    }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { text += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(text); } catch { /* a page */ }
        const set = (res.headers['set-cookie'] || []).find((c) => c.startsWith('polymath.sid=')) || '';
        resolve({ status: res.statusCode, headers: res.headers, text, json, set, cookie: set ? set.split(';')[0] : null });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}
const expiryOf = (set) => { const m = /Expires=([^;]+)/i.exec(set); return m ? new Date(m[1]).getTime() : null; };
/** The accounts are in db.json on disk: a kill now cannot lose them. */
async function flushed(email) {
  for (let i = 0; i < 100; i += 1) {
    try { if (fs.readFileSync(dbFile, 'utf8').includes(email)) return; } catch { /* not yet */ }
    await sleep(100);
  }
  throw new Error('db did not flush');
}
const account = (name) => ({ email: `${name}@example.com`, password: 'a-long-password-1', display_name: 'Test Person' });
const login = (who, remember) => ask('POST', '/api/auth/login', { body: { email: who.email, password: who.password, ...(remember === undefined ? {} : { remember }) } });
const signedIn = async (cookie, opts) => !!(await ask('GET', '/api/auth/me', { cookie, ...opts })).json.user;

async function storeChecks() {
  console.log('\nThe session store');
  const file = path.join(dir, 'store', 'sessions.sqlite');
  const store = new SqliteSessionStore({ file, pruneMs: 0 });
  const p = (fn) => new Promise((res, rej) => fn((err, v) => (err ? rej(err) : res(v))));
  check('commits reach the disk before they count (synchronous=FULL)', Number(store.db.prepare('PRAGMA synchronous').get().synchronous) === 2);
  const later = (ms) => new Date(Date.now() + ms).toISOString();
  await p((cb) => store.set('a', { cookie: { originalMaxAge: YEAR, expires: later(YEAR) }, userId: 1 }, cb));
  const first = store.q.expiry.get('a').expires;
  await p((cb) => store.touch('a', { cookie: { originalMaxAge: YEAR, expires: later(YEAR + 60000) } }, cb));
  check('a touch a minute later writes nothing', store.q.expiry.get('a').expires === first);
  await p((cb) => store.touch('a', { cookie: { originalMaxAge: YEAR, expires: later(YEAR + 3600000) } }, cb));
  check('a touch an hour later moves the expiry', store.q.expiry.get('a').expires > first + 3000000);
  await p((cb) => store.set('b', { cookie: { originalMaxAge: 2000, expires: later(2000) } }, cb));
  const short = store.q.expiry.get('b').expires;
  await p((cb) => store.touch('b', { cookie: { originalMaxAge: 2000, expires: later(2000 + 500) } }, cb));
  check('a short session keeps up with its cookie', store.q.expiry.get('b').expires > short);
  await p((cb) => store.set('c', { cookie: { expires: false, originalMaxAge: false } }, cb));
  const open = store.q.expiry.get('c').expires;
  check('a session with no expiry lasts a day on the server', Math.abs(open - (Date.now() + 86400000)) < 60000, open);
  store.close();
  const again = new SqliteSessionStore({ file, pruneMs: 0 });
  check('rows survive reopening', (await p((cb) => again.get('a', cb))).userId === 1);
  again.prune();
  check('pruning leaves a remembered session alone', (await p((cb) => again.get('a', cb))).userId === 1);
  again.close();
  const bad = path.join(dir, 'store', 'bad.sqlite');
  fs.writeFileSync(bad, 'this is not a database file at all, and it never was. '.repeat(40));
  const warn = console.warn; console.warn = () => {};
  const healed = new SqliteSessionStore({ file: bad, pruneMs: 0 });
  console.warn = warn;
  await p((cb) => healed.set('z', { cookie: {}, userId: 9 }, cb));
  check('an unreadable file is moved aside and the store still works', (await p((cb) => healed.get('z', cb))).userId === 9 && fs.readdirSync(path.dirname(bad)).some((f) => f.includes('.unreadable-')));
  healed.close();
  const zero = path.join(dir, 'store', 'zero.sqlite');
  fs.writeFileSync(zero, '');
  const fresh = new SqliteSessionStore({ file: zero, pruneMs: 0 });
  await p((cb) => fresh.set('z', { cookie: {}, userId: 8 }, cb));
  check('a file of zero bytes (a crash) just starts empty', (await p((cb) => fresh.get('z', cb))).userId === 8);
  fresh.close();
}

async function main() {
  await storeChecks();
  const owner = account('owner');
  const second = account('second');
  const third = account('third');

  console.log('\nBETA_SIGNIN_ONLY=off: the site as it was');
  await start({ BETA_SIGNIN_ONLY: 'off' });
  check('/ is the landing page', (await ask('GET', '/')).status === 200 && /Take the placement quiz/.test((await ask('GET', '/')).text));
  check('/register opens', (await ask('GET', '/register')).status === 200);
  check('/login offers sign-up', /href="\/register"/.test((await ask('GET', '/login')).text));
  for (const who of [owner, second, third]) {
    const made = await ask('POST', '/api/auth/register', { body: who });
    check(`sign-up works (${who.email})`, made.status === 201, made.text.slice(0, 120));
  }
  await flushed(third.email);
  await stop();

  console.log('\nOn by default, through the proxy');
  await start();
  for (const url of ['/', '/index.html', '/index', '/register', '/dashboard', '/dashboard.html', '/path', '/act', '/spanish-study', '/no-such-page', '/join?invite=abc', '/index%2ehtml', '/%69ndex.html', '/DASHBOARD/', '/games/none.html']) {
    const res = await ask('GET', url);
    check(`logged out ${url} goes to sign-in`, res.status === 302 && /^\/login(\?next=|$)/.test(res.headers.location), [res.status, res.headers.location]);
  }
  check('a page keeps where it was going', (await ask('GET', '/dashboard?x=1')).headers.location === `/login?next=${encodeURIComponent('/dashboard?x=1')}`);
  check('the redirect is not remembered', (await ask('GET', '/')).headers['cache-control'] === 'no-store');
  const page = await ask('GET', '/login');
  check('/login opens', page.status === 200);
  check('/login offers no sign-up', !/register/i.test(page.text) && !/Create an account/.test(page.text));
  check('/login is marked for the header', /<body data-signin-only="1" /.test(page.text));
  check('/login has remember me, ticked', /<input type="checkbox" id="remember" checked>/.test(page.text));
  check('/login.html is the same page', (await ask('GET', '/login.html')).text === page.text);
  check('/login is re-checked each visit', page.headers['cache-control'] === 'no-cache');
  for (const url of ['/act-check', '/act-check?ref=abc&ch=tiktok', '/privacy', '/privacy.html', '/offline', '/parent-consent', '/parent-form', '/parent', '/api/health', '/css/style.css', '/js/app.js', '/js/act-check.js', '/favicon.svg', '/manifest.webmanifest', '/sw.js', '/fonts/fonts.css']) {
    check(`logged out ${url} stays public`, (await ask('GET', url)).status === 200, (await ask('GET', url)).status);
  }
  check('/privacy has no sign-up mark missing', /data-signin-only/.test((await ask('GET', '/privacy')).text));
  check('a missing file is a 404, not the landing page', (await ask('GET', '/missing-file.png')).status === 404);
  check('the landing page is not reachable by any page path', !/Take the placement quiz/.test((await ask('GET', '/register')).text));

  console.log('\nThe guest ACT check and its form');
  const visit = await ask('POST', '/api/act-check/visit', { body: { ref: 'abc', ch: 'tiktok' } });
  check('visit is counted', visit.status === 200, visit.text.slice(0, 100));
  const begun = await ask('POST', '/api/act-check/start', { body: { age13: true, ref: 'abc', ch: 'tiktok' } });
  // An empty data folder has no questions yet (the browser check on a real copy walks it): what matters here is that no sign-in is asked for.
  check('a guest can start with no account', begun.status === 200 || /not ready/.test(begun.text), begun.text.slice(0, 120));
  const applied = await ask('POST', '/api/act-check/apply', { body: { email: 'applicant@example.com' }, headers: { 'X-Guest-Token': (begun.json && begun.json.token) || 'none' } });
  check('the application route answers a guest (not a sign-in wall)', applied.status !== 302 && !/sign in/i.test(applied.text), [applied.status, applied.text.slice(0, 120)]);

  console.log('\nSign-ups are closed by every route');
  for (const url of ['/api/auth/register', '/API/AUTH/REGISTER', '/api/auth/register/', '/api/Auth/Register?x=1']) {
    const res = await ask('POST', url, { body: account('stranger') });
    check(`${url} refused`, res.status === 403 && res.json.beta === 'closed', [res.status, res.text.slice(0, 100)]);
  }
  const child13 = await ask('POST', '/api/auth/register', { body: { username: 'someone', password: 'a-long-password-1', display_name: 'Kid', parent_email: 'p@example.com', birth_year: new Date().getUTCFullYear() - 10, birth_month: 1, country: 'US' } });
  check('a child sign-up is refused too', child13.status === 403 && child13.json.beta === 'closed', child13.status);
  check('no stranger account was made', (await login(account('stranger'), true)).status === 401);

  console.log('\nRemember me');
  const ticked = await login(owner, true);
  check('an existing account signs in', ticked.status === 200 && ticked.json.user.email === owner.email, ticked.text.slice(0, 100));
  const atLogin = expiryOf(ticked.set);
  check('ticked: the cookie lasts a year', atLogin && Math.abs(atLogin - (Date.now() + YEAR)) < 60000, ticked.set);
  check('flags are as they were: HttpOnly, SameSite=Lax, Secure', /HttpOnly/i.test(ticked.set) && /SameSite=Lax/i.test(ticked.set) && /Secure/i.test(ticked.set), ticked.set);
  await sleep(1100);
  const rolled = await ask('GET', '/api/auth/me', { cookie: ticked.cookie });
  check('it rolls: a later visit pushes the year forward', expiryOf(rolled.set) > atLogin, rolled.set);
  check('still signed in on the rolled cookie', rolled.json.user && rolled.json.user.email === owner.email);
  const unticked = await login(third, false);
  check('unticked: the cookie has no expiry', unticked.status === 200 && !/Expires=|Max-Age=/i.test(unticked.set), unticked.set);
  const untickedAgain = await ask('GET', '/api/auth/me', { cookie: unticked.cookie });
  check('unticked stays session-only on later visits', untickedAgain.json.user && !/Expires=|Max-Age=/i.test(untickedAgain.set), untickedAgain.set);
  const silent = await login(second);
  check('a caller that does not say keeps 30 days', Math.abs(expiryOf(silent.set) - (Date.now() + 30 * 86400000)) < 60000, silent.set);
  check('a signed-in / is not sent to sign-in', (await ask('GET', '/', { cookie: ticked.cookie })).status === 200);
  check('a signed-in /dashboard opens', (await ask('GET', '/dashboard', { cookie: ticked.cookie })).status === 200);
  check('a signed-in /login goes home', (await ask('GET', '/login', { cookie: ticked.cookie })).headers.location === '/');
  check('a stranger with a made-up cookie is logged out', (await ask('GET', '/', { cookie: 'polymath.sid=s%3Anope.nope' })).status === 302);

  console.log('\nA restart keeps sessions');
  await stop();
  await start();
  check('ticked: still signed in', await signedIn(ticked.cookie));
  const after = await ask('GET', '/api/auth/me', { cookie: ticked.cookie });
  check('ticked: still a year after the restart', Math.abs(expiryOf(after.set) - (Date.now() + YEAR)) < 60000, after.set);
  check('unticked: the server keeps it for the open browser', await signedIn(unticked.cookie));
  check('unticked: still no expiry after the restart', !/Expires=|Max-Age=/i.test((await ask('GET', '/api/auth/me', { cookie: unticked.cookie })).set));

  console.log('\nSigning out and deleting really end it');
  const out = await ask('POST', '/api/auth/logout', { cookie: unticked.cookie, body: {} });
  check('sign out answers', out.status === 200);
  check('the old cookie is dead after signing out', !(await signedIn(unticked.cookie)));
  const replay = await ask('GET', '/dashboard', { cookie: unticked.cookie });
  check('the old cookie goes to sign-in', replay.status === 302);
  const phone = await login(second, true);
  const desktop = await login(second, true);
  const gone = await ask('POST', '/api/account/delete', { cookie: phone.cookie, body: { confirm: 'DELETE', password: second.password } });
  check('the account deletes', gone.status === 200, [gone.status, gone.text.slice(0, 120)]);
  check('the deleting browser is signed out', !(await signedIn(phone.cookie)));
  check("the account's other browser is signed out too", !(await signedIn(desktop.cookie)));
  check('and goes to sign-in', (await ask('GET', '/dashboard', { cookie: desktop.cookie })).status === 302);
  check('and cannot sign in again', (await login(second, true)).status === 401);
  await flushed('"email":"owner@example.com"');
  await stop();

  console.log('\nThe switch and the loopback exception');
  await start();
  check('straight to 127.0.0.1 with it unset, the old site (tests, dev)', (await ask('GET', '/', { direct: true })).status === 200);
  check('a local address with a proxy header is not local', (await ask('GET', '/', { direct: true, headers: { 'X-Forwarded-Host': SITE } })).status === 302);
  await stop();
  await start({ BETA_SIGNIN_ONLY: 'on' });
  check('=on applies at 127.0.0.1 too', (await ask('GET', '/', { direct: true })).status === 302);
  await stop();

  console.log('\nThe invite gate with the switch off: every spelling is gated');
  await start({ BETA_SIGNIN_ONLY: 'off', BETA_GATE: 'invite', BETA_INVITES_FILE: path.join(dir, 'invites.json') });
  for (const url of ['/api/auth/register', '/API/AUTH/REGISTER', '/api/auth/register/']) {
    const res = await ask('POST', url, { body: account('nocode') });
    check(`${url} needs a code`, res.status === 403 && res.json.beta && res.json.beta !== 'closed', [res.status, res.text.slice(0, 100)]);
  }
  await stop();

  console.log('\nA stable key means sessions on disk, whatever NODE_ENV says');
  await start({ NODE_ENV: undefined, APP_ORIGIN: undefined, TRUST_PROXY: undefined, BETA_SIGNIN_ONLY: 'off' });
  const health = await ask('GET', '/api/health', { direct: true });
  check('no NODE_ENV, a SESSION_SECRET: on disk', health.json.sessions === 'disk', health.text.slice(0, 200));
  await stop();
  await start({ NODE_ENV: undefined, APP_ORIGIN: undefined, TRUST_PROXY: undefined, SESSION_SECRET: undefined, BETA_SIGNIN_ONLY: 'off' });
  check('no key at all: memory, as before', (await ask('GET', '/api/health', { direct: true })).json.sessions === 'memory');
  await stop();
}

main().catch((err) => { failures += 1; console.log(`FAIL ${err.stack}`); }).finally(async () => {
  try { await stop(); } catch { /* gone */ }
  try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* the temp folder clears itself */ }
  console.log(failures ? `\n${failures} failed` : '\nAll passed');
  process.exit(failures ? 1 : 0);
});
