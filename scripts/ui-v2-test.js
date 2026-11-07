/**
 * UI_V2 (docs/UI-V2.md), without a browser: with the flag off every touched page, /start and its script are the files on disk, byte for byte; with it on only the additions appear;
 * pages outside the list are never changed; no existing file under public/ differs from main; every token pair passes its contrast minimum; every hook still fits js/start.js.
 *
 *   node scripts/ui-v2-test.js
 *
 * Starts its own servers on a temporary database, with no outside AI.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn, execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TUTOR_GIRAFFE_MERGE = '34c90a2'; // this branch took tutor-giraffe before main did
const BASE_COMMIT = () => execSync('git merge-base HEAD main', { cwd: ROOT, encoding: 'utf8' }).trim(); // what this branch last took from main
const ui = require('../services/ui-v2');

let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log(`  ok  ${name}`); };
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

function contrast() {
  const css = fs.readFileSync(path.join(ROOT, 'public', 'css', 'ui2', 'tokens.css'), 'utf8');
  const blocks = css.split(':root[data-ui2][data-mode="dark"]');
  const read = (txt) => Object.fromEntries([...txt.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6}|oklch\([^)]*\)|var\(--[a-z0-9-]+\))\s*;/g)].map((m) => [m[1], m[2]]));
  const light = read(blocks[0]);
  const dark = { ...light, ...read(blocks.slice(1).join(' ')) };
  const linear = (c, set) => {
    const v = /^var\(--([a-z0-9-]+)\)$/.exec(c);
    if (v) return linear(set[v[1]], set);
    if (c[0] === '#') return [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
    const [L, C, H] = c.match(/[\d.]+/g).map(Number);
    const p = C * Math.cos((H * Math.PI) / 180);
    const q = C * Math.sin((H * Math.PI) / 180);
    const l = (L + 0.3963377774 * p + 0.2158037573 * q) ** 3;
    const m = (L - 0.1055613458 * p - 0.0638541728 * q) ** 3;
    const k = (L - 0.0894841775 * p - 1.291485548 * q) ** 3;
    return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * k, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * k, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * k].map((x) => Math.min(1, Math.max(0, x)));
  };
  const lum = (c, set) => { const v = linear(c, set); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const ratio = (a, b, set) => { const [x, y] = [lum(a, set), lum(b, set)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const PAIRS = [['ink', 'page', 4.5], ['ink', 'card', 4.5], ['ink', 'well', 4.5], ['ink-2', 'page', 4.5], ['ink-2', 'card', 4.5], ['ink-2', 'well', 4.5], ['ink-3', 'page', 4.5], ['ink-3', 'card', 4.5], ['ink', 'sel', 4.5], ['on-action', 'action', 4.5], ['good', 'good-wash', 4.5], ['bad', 'bad-wash', 4.5], ['ink', 'good-wash', 4.5], ['ink', 'bad-wash', 4.5], ['ink-2', 'good-wash', 3], ['ink-2', 'bad-wash', 3], ['bar-fill', 'bar-track', 3], ['sel-line', 'card', 3], ['on-mark', 'good', 3], ['on-mark', 'bad', 3], ['focus', 'page', 3], ['act-text', 'act-tint', 4.5], ['right-text', 'right-tint', 4.5], ['wrong-text', 'wrong-tint', 4.5], ['ink', 'right-tint', 4.5], ['ink', 'wrong-tint', 4.5], ['on-act', 'act', 4.5], ['ink-3', 'well-2', 3], ['act', 'page', 3], ['act-edge', 'page', 3]];
  for (const [mode, set] of [['light', light], ['dark', dark]]) {
    for (const [fg, bg, min] of PAIRS) {
      const r = ratio(set[fg], set[bg], set);
      assert(r >= min, `${mode}: ${fg} on ${bg} is ${r.toFixed(2)}, needs ${min}`);
    }
  }
}

async function withServer(flag, port, fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ui2-test-'));
  const env = { ...process.env, ONBOARDING_V2: 'on', BETA_GATE: '', BETA_SIGNIN_ONLY: '', PORT: String(port), NODE_ENV: 'development', DB_FILE: path.join(tmp, 'db.json'), HOLDOUT_DIR: tmp, XKIRO_LEARNER_UNTIL: '2000-01-01T00:00:00Z', FACT_CHECK_ALL: '0', MUNITO_LEARNER: 'off', CORAL_LEARNER: 'off', GLADIA_LEARNER: 'off', LYCEUM_LEARNER: 'off', GONKA_LEARNER: 'off', GROKIFIED_LEARNER: 'off', UPLOAD_AUTOBUILD: 'off', SPANISH_WRITE_AHEAD: 'off' };
  if (flag === null) delete env.UI_V2; else env.UI_V2 = flag;
  const server = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: 'ignore' });
  try {
    for (let i = 0; i < 200; i++) { await delay(200); try { if ((await fetch(`http://localhost:${port}/api/health`)).ok) break; } catch { /* up soon */ } } // eslint-disable-line no-await-in-loop
    await fn(`http://localhost:${port}`);
  } finally {
    server.kill();
    await delay(300);
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* still closing */ }
  }
}
const fetchBytes = async (url) => { const r = await fetch(url, { redirect: 'manual' }); return { status: r.status, bytes: Buffer.from(await r.arrayBuffer()), type: r.headers.get('content-type') }; };

/**
 * js/ui2/signed-out.js in a sandbox: a page that has seen an account and then gets a 401 or the private beta's refusal (signin-only CLOSED, beta-gate not_invited)
 * goes to /login?next=<page>&why=signed_out, once the server confirms nobody is signed in, and the call never settles, so no "not taking new accounts" shows.
 * A wrong-password 401 with the account still signed in, and a visitor who was never signed in, are left alone.
 */
async function signedOutChecks() {
  const vm = require('vm'); // eslint-disable-line global-require
  const src = fs.readFileSync(path.join(ROOT, 'public', 'js', 'ui2', 'signed-out.js'), 'utf8');
  const CLOSED = require('../middleware/signin-only').CLOSED; // eslint-disable-line global-require
  assert.strictEqual(CLOSED.beta, 'closed', 'the refusal the page watches for');
  const reply = (status, body) => ({ ok: status < 400, status, json: async () => body, clone() { return reply(status, body); } });
  function page(where, routes) {
    const u = new URL(where, 'http://x.test');
    const loc = { href: u.href, origin: u.origin, pathname: u.pathname, search: u.search, hash: u.hash, to: null, replace(to) { this.to = to; } };
    const state = { me: { user: { id: 7 } } };
    const win = { fetch: async (input) => { const p = new URL(input, u.href).pathname; return p === '/api/auth/me' ? reply(200, state.me) : routes(p, state); } };
    vm.runInNewContext(src, { window: win, location: loc, URL });
    const settles = (p) => Promise.race([p.then(() => true), delay(200).then(() => false)]);
    return { win, loc, state, settles };
  }
  const told = (loc, next) => assert.strictEqual(loc.to, `/login?next=${encodeURIComponent(next)}&why=signed_out`);

  // /start: an account in the flow, then the session is lost and "Take the placement" (begin) gets the beta refusal.
  const a = page('/start#grade', (p, s) => (p === '/api/ob2/state' ? reply(200, { account: true, onboarding: true }) : (s.me = { user: null }, reply(403, CLOSED))));
  await a.win.fetch('/api/ob2/state');
  assert.strictEqual(await a.settles(a.win.fetch('/api/ob2/begin', { method: 'POST' })), false, 'the refused call never settles, so its words never show');
  told(a.loc, '/start#grade');

  // /start: the answers saved on the way to the next step meet the flow's own 409 for nobody signed in.
  const a2 = page('/start#learn', (p, s) => (p === '/api/ob2/state' ? reply(200, { account: true, onboarding: true }) : (s.me = { user: null }, reply(409, { error: 'This is only for a learner setting up.', code: 'not_in_flow' }))));
  await a2.win.fetch('/api/ob2/state');
  assert.strictEqual(await a2.settles(a2.win.fetch('/api/ob2/answers', { method: 'POST' })), false);
  told(a2.loc, '/start#learn');
  // A 409 that isn't about being signed out (the flow already ended) goes through.
  const a3 = page('/start', (p) => (p === '/api/ob2/state' ? reply(200, { account: true, onboarding: true }) : reply(409, { error: 'You already have an account.', code: 'account' })));
  await a3.win.fetch('/api/ob2/state');
  assert.strictEqual((await a3.win.fetch('/api/ob2/begin', { method: 'POST' })).status, 409);
  assert.strictEqual(a3.loc.to, null);

  // Home: signed in, then a 401.
  const h = page('/dashboard', (p, s) => (p === '/api/ui2/waiting' ? (s.me = { user: null }, reply(401, { error: 'Sign in first.' })) : reply(200, {})));
  await h.win.fetch('/api/auth/me');
  assert.strictEqual(await h.settles(h.win.fetch('/api/ui2/waiting')), false);
  told(h.loc, '/dashboard');

  // The placement page: beta-gate's not_invited is the same story.
  const sp = page('/subject-placement?track=math&mode=quick', (p, s) => (s.me = { user: null }, reply(403, { error: 'Savant is in a private beta for invited testers.', beta: 'not_invited' })));
  await sp.win.fetch('/api/auth/me');
  sp.state.me = { user: { id: 7 } };
  await sp.win.fetch('/api/auth/me');
  await sp.settles(sp.win.fetch('/api/subject-placement/math/start', { method: 'POST' }));
  told(sp.loc, '/subject-placement?track=math&mode=quick');

  // /api/auth/me itself says nobody, after it said somebody.
  const m = page('/profile', () => reply(200, {}));
  await m.win.fetch('/api/auth/me');
  m.state.me = { user: null };
  await m.settles(m.win.fetch('/api/auth/me'));
  told(m.loc, '/profile');

  // A wrong password: 401, but still signed in. Untouched.
  const w = page('/profile', () => reply(401, { error: 'That password is not right.' }));
  await w.win.fetch('/api/auth/me');
  const wr = await w.win.fetch('/api/account/delete', { method: 'POST' });
  assert.strictEqual(wr.status, 401);
  assert.strictEqual(w.loc.to, null, 'a wrong password is not a sign-out');

  // Never signed in (the public flow's visitor, or the beta signed out from the start): the refusal goes through, and the page does what it always did.
  const n = page('/start', (p, s) => (p === '/api/ob2/state' ? reply(200, { signed_out: true, go: '/login?next=/start' }) : (s.me = { user: null }, reply(403, CLOSED))));
  n.state.me = { user: null };
  await n.win.fetch('/api/ob2/state');
  assert.strictEqual((await n.win.fetch('/api/ob2/begin', { method: 'POST' })).status, 403);
  assert.strictEqual(n.loc.to, null);

  // Sign-in calls are never touched.
  const l = page('/start', () => reply(401, { error: 'That email or username and password do not match.' }));
  await l.win.fetch('/api/auth/me');
  assert.strictEqual((await l.win.fetch('/api/auth/login', { method: 'POST' })).status, 401);
  assert.strictEqual(l.loc.to, null);

  const line = fs.readFileSync(path.join(ROOT, 'public', 'js', 'auth.js'), 'utf8');
  assert(line.includes("App.query('why') === 'signed_out'") && line.includes('You were signed out. Sign in to carry on.'), 'the sign-in page says it plainly');
  for (const out of [ui.inject('<html><head></head><body><script src="/js/app.js"></script></body></html>', 'dashboard'), ui.injectStart('<html><head></head><body></body></html>')]) {
    const at = out.indexOf('/js/ui2/signed-out.js');
    assert(at > 0 && at < out.indexOf('</head>'), 'in <head> on Home and /start');
    assert(at < out.indexOf(out.includes('/js/ui2/start.js') ? '/js/ui2/start.js' : '/js/ui2/boot.js'), 'before the look\'s scripts');
  }
  passed++;
  console.log('  ok  signed out mid-page: /start, Home and the placement go to sign-in with "You were signed out", never the new-account refusal; a wrong password and a never-signed-in visitor are untouched');
}

async function main() {
  ok('off unless UI_V2 says on', () => {
    const was = process.env.UI_V2;
    delete process.env.UI_V2; assert.strictEqual(ui.enabled(), false);
    process.env.UI_V2 = 'off'; assert.strictEqual(ui.enabled(), false);
    process.env.UI_V2 = '0'; assert.strictEqual(ui.enabled(), false);
    process.env.UI_V2 = 'on'; assert.strictEqual(ui.enabled(), true);
    if (was === undefined) delete process.env.UI_V2; else process.env.UI_V2 = was;
  });
  ok('off: the middleware only calls next, and reads nothing', () => {
    const was = process.env.UI_V2; delete process.env.UI_V2;
    let nexted = 0;
    const res = new Proxy({}, { get() { throw new Error('touched the response'); } });
    ui.middleware({ method: 'GET', path: '/dashboard' }, res, () => { nexted++; });
    assert.strictEqual(nexted, 1);
    if (was !== undefined) process.env.UI_V2 = was;
  });
  ok('inject adds the flag, the two stylesheets and the shell; Home also gets home.js before dashboard.js', () => {
    const page = '<!DOCTYPE html>\n<html lang="en">\n<head>\n</head>\n<body><script src="/js/app.js"></script><script src="/js/dashboard.js"></script></body>\n</html>';
    const out = ui.inject(page, 'dashboard');
    assert(out.includes('<html data-ui2="on" lang="en">'));
    assert(out.includes('/css/ui2/tokens.css') && out.includes('/css/ui2/app.css'));
    assert(out.indexOf('/js/app.js') < out.indexOf('/js/ui2/shell.js')); assert(out.indexOf('/js/ui2/shell.js') < out.indexOf('/js/ui2/pages.js') && out.includes('/css/ui2/pages.css'));
    assert(out.indexOf('/js/ui2/shell.js') < out.indexOf('/js/ui2/home.js'));
    assert(out.indexOf('/js/ui2/home.js') < out.indexOf('/js/dashboard.js'));
    assert(!ui.inject(page, 'profile').includes('/js/ui2/home.js'));
  });
  ok('every listed page exists; public, admin and sealed pages are not listed', () => {
    for (const p of ui.PAGES) assert(fs.existsSync(path.join(ROOT, 'public', `${p}.html`)), p);
    for (const p of ['index', 'login', 'register', 'start', 'privacy', 'admin', 'cost-tracker', 'my-stats', 'recruit', 'spanish-check', 'spanish-listening', 'spanish-study', 'spanish-study-test', 'act-check', 'parent-form']) assert(!ui.PAGES.has(p), p);
    assert.strictEqual(ui.pageOf('/dashboard'), 'dashboard');
    assert.strictEqual(ui.pageOf('/dashboard.html'), 'dashboard');
    assert.strictEqual(ui.pageOf('/../server'), null);
    assert.strictEqual(ui.pageOf('/js/app.js'), null);
  });
  ok('no existing file under public/ or the sealed folders differs from main, apart from what the tutor-giraffe merge brought in: only new files', () => {
    const git = (cmd) => execSync(cmd, { cwd: ROOT, encoding: 'utf8' }).trim();
    const out = git(`git diff --name-status ${BASE_COMMIT()} -- public spanish-check spanish-check-lc spanish-dictation routes`);
    const giraffe = new Set(git(`git diff --name-only ${TUTOR_GIRAFFE_MERGE}~1 ${TUTOR_GIRAFFE_MERGE}`).split(/\r?\n/));
    // Owner, 7 Nov (branch ob-trim): the beta's hidden subjects and the onboarding ending at the subjects are server decisions (catalog, ob2 routes); Home's two buttons need
    // two opt-in hooks, ?mode=quick on the placement and ?why=signed_out on sign-in. Each changes nothing without its parameter. Every other existing file still must not change.
    const OB_TRIM = new Set(['routes/catalog.js', 'routes/onboarding-v2.js', 'public/js/subject-placement.js', 'public/js/auth.js']);
    const changed = out ? out.split(/\r?\n/).filter((l) => !l.startsWith('A')).map((l) => l.split(/\s+/).pop()).filter((f) => !giraffe.has(f) && !OB_TRIM.has(f) && !f.startsWith('public/js/ui2/') && !f.startsWith('public/css/ui2/')) : []; // the flag's own files may change as the work goes on
    assert.deepStrictEqual(changed, []);
    for (const f of ['public/start.html', 'public/js/start.js', 'public/js/start-tutor.js', 'public/css/screens/start.css']) assert(!out.includes(f), `${f} is untouched`);
  });
  ok('app.css, look.css, pages.css and start.css have no colour of their own: every one is a token', () => {
    for (const f of ['app.css', 'look.css', 'pages.css', 'start.css', 'welcome.css']) {
      const css = fs.readFileSync(path.join(ROOT, 'public', 'css', 'ui2', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      assert.deepStrictEqual(css.match(/#[0-9a-fA-F]{3,8}\b(?![^{]*\{)|rgba?\(|oklch\(/g) || [], [], f);
    }
  });
  ok('offline under the flag: the worker keeps what the page needs, off nothing changes', () => {
    const sw = fs.readFileSync(path.join(ROOT, 'public', 'sw.js'), 'utf8');
    const patched = ui.patchWorker(sw);
    for (const f of ['/css/ui2/tokens.css', '/css/styles/chunky.css', '/css/ui2/pages.css', '/js/start-tutor.js', '/js/ui2/look.js', '/js/ui2/offline.js', '/js/style-boot.js']) {
      assert(patched.includes(`'${f}'`), f);
      assert(fs.existsSync(path.join(ROOT, 'public', f)), `${f} exists, or the worker's install would fail`);
    }
    const page = ui.injectOffline(fs.readFileSync(path.join(ROOT, 'public', 'offline.html'), 'utf8'));
    for (const m of page.match(/(?:href|src)="(\/(?:css|js)\/[^"]+)"/g).map((x) => x.split('"')[1])) assert(patched.includes(`'${m}'`) || ['/css/style.css', '/js/app.js', '/js/offline.js'].includes(m), `the offline page needs ${m}, not cached`);
    const was = process.env.UI_V2;
    delete process.env.UI_V2;
    for (const p of ['/sw.js', '/offline.html']) {
      let nexted = false;
      ui.middleware({ method: 'GET', path: p }, {}, () => { nexted = true; });
      assert(nexted, `${p} passes through with the flag off`);
    }
    let sent = null;
    ui.sendNotFound({ status(code) { sent = code; return this; }, sendFile(f) { sent = `${sent} ${f}`; } }, 'x.html');
    assert.strictEqual(sent, '404 x.html');
    if (was !== undefined) process.env.UI_V2 = was;
  });
  ok('the hooks still fit js/start.js, and the giraffe in js/start-tutor.js is the original', () => {
    const src = fs.readFileSync(path.join(ROOT, 'public', 'js', 'start.js'), 'utf8');
    const out = ui.patchStart(src);
    assert(out.includes('window.ObLook.guard(step, guard)') && out.includes('window.ObLook.rendered(step)') && out.includes('window.ObLook.install('));
    assert.throws(() => ui.patchStart('nothing here'), /no longer fits/);
    const was = execSync(`git show ${BASE_COMMIT()}:public/js/start-tutor.js`, { cwd: ROOT, encoding: 'utf8' }).replace(/\r\n/g, '\n');
    assert.strictEqual(fs.readFileSync(path.join(ROOT, 'public', 'js', 'start-tutor.js'), 'utf8').replace(/\r\n/g, '\n'), was);
  });
  ok('colour pairs pass their contrast minimum, light and dark', contrast);
  ok('an upload is complete when its path is fully built and every part is mastered or set aside; a due review keeps it complete; nothing else counts', () => {
    process.env.DB_FILE = path.join(os.tmpdir(), `ui2-unit-${process.pid}.json`); // this file loads the database module: never the real one
    const { summarize } = require('../services/ui-v2-material'); // eslint-disable-line global-require
    const course = (status, ids) => ({ status, skills: ids.map((id) => ({ id })) });
    const row = (done, extra = {}) => ({ placed: true, skills: Object.fromEntries(done.map((id) => [id, { status: 'mastered', ...extra }])) });
    assert.deepStrictEqual(summarize(null, null), { status: 'none', mastered: 0, total: 0, due: 0, started: false, complete: false });
    assert.strictEqual(summarize(course('ready', ['a', 'b']), row(['a'])).complete, false);
    assert.strictEqual(summarize(course('ready', ['a', 'b']), row(['a', 'b'])).complete, true);
    assert.strictEqual(summarize(course('partial', ['a']), row(['a'])).complete, false, 'a part-built path is not complete');
    assert.strictEqual(summarize(course('ready', []), row([])).complete, false, 'no parts');
    assert.strictEqual(summarize(course('ready', ['a', 'b']), row(['a']), ['b']).complete, true, 'set aside by the goal');
    const due = summarize(course('ready', ['a']), row(['a'], { due: '2000-01-01T00:00:00Z' }));
    assert.strictEqual(due.complete, true);
    assert.strictEqual(due.due, 1);
    assert.strictEqual(summarize(course('ready', ['a']), null).started, false, 'read without a progress row');
    fs.rmSync(process.env.DB_FILE, { force: true });
  });

  await signedOutChecks();

  await withServer(null, 6841, async (base) => {
    const health = await fetchBytes(`${base}/api/health`);
    assert.strictEqual(health.status, 200, 'server up');
    for (const p of [...ui.PAGES, 'index', 'login', 'privacy']) {
      const r = await fetchBytes(`${base}/${p === 'index' ? '' : p}`); // eslint-disable-line no-await-in-loop
      const disk = fs.readFileSync(path.join(ROOT, 'public', `${p}.html`));
      assert.strictEqual(sha(r.bytes), sha(disk), `flag off: /${p} is the file on disk`);
      assert(!r.bytes.includes('data-ui2'), `flag off: /${p} has no flag`);
    }
    assert.strictEqual((await fetchBytes(`${base}/api/ui2/material-progress`)).status, 404, 'flag off: no such endpoint');
    assert.strictEqual((await fetchBytes(`${base}/api/ui2/waiting`)).status, 404, 'flag off: no such endpoint');
    for (const [url, file] of [['/start', 'start.html'], ['/js/start.js', 'js/start.js'], ['/css/screens/start.css', 'css/screens/start.css']]) {
      const r = await fetchBytes(base + url); // eslint-disable-line no-await-in-loop
      assert.strictEqual(sha(r.bytes), sha(fs.readFileSync(path.join(ROOT, 'public', file))), `flag off: ${url} is the file on disk`);
    }
    passed++;
    console.log(`  ok  flag off: ${ui.PAGES.size + 3} pages, /start and its script served byte for byte as the files on disk`);
  });

  await withServer('on', 6842, async (base) => {
    for (const p of ui.PAGES) {
      const r = await fetchBytes(`${base}/${p}`); // eslint-disable-line no-await-in-loop
      const disk = fs.readFileSync(path.join(ROOT, 'public', `${p}.html`), 'utf8');
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.bytes.toString('utf8'), ui.inject(disk, p), `flag on: /${p} is the file plus the additions`);
      assert(r.bytes.includes('data-ui2="on"'), p);
    }
    for (const p of ['login', 'privacy', 'spanish-check', 'spanish-listening']) {
      const r = await fetchBytes(`${base}/${p}`); // eslint-disable-line no-await-in-loop
      assert(!r.bytes.includes('data-ui2'), `flag on: /${p} is left alone`);
    }
    assert.strictEqual((await fetchBytes(`${base}/api/ui2/material-progress`)).status, 401, 'flag on: signed in only');
    assert.strictEqual((await fetchBytes(`${base}/api/ui2/waiting`)).status, 401, 'flag on: signed in only');
    const start = await fetchBytes(`${base}/start`);
    assert.strictEqual(start.bytes.toString('utf8'), ui.injectStart(fs.readFileSync(path.join(ROOT, 'public', 'start.html'), 'utf8')), 'flag on: /start is the file plus the additions');
    const js = await fetchBytes(`${base}/js/start.js`);
    assert.strictEqual(js.bytes.toString('utf8'), ui.patchStart(fs.readFileSync(path.join(ROOT, 'public', 'js', 'start.js'), 'utf8')), 'flag on: /js/start.js is the file plus the hooks');
    passed++;
    console.log('  ok  flag on: listed pages are the file plus the additions; public and sealed pages are left alone');
  });

  console.log(`\nui-v2-test: ${passed} passed`);
}

main().catch((err) => { console.error(err); process.exit(1); });
