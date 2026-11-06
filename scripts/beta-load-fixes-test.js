/**
 * The fixes that came out of the beta load test (scripts/beta-load/): rate limits per account, the store (rows by owner, id lookup, the
 * wait between saves, a corrupt file in production), password workers, the ledger peek, a session whose id now belongs to someone else,
 * and over HTTP: a session survives a restart, /api/health is trimmed for visitors, a class on one address can sign up and sign in.
 *   node scripts/beta-load-fixes-test.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'beta-load-fixes-'));
process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(dir, 'db.json');
process.env.GONKA_LEDGER_FILE = path.join(dir, 'gonka-ledger.json');
process.env.MUNITO_LEDGER_FILE = path.join(dir, 'munito-ledger.json');
let failures = 0;
const check = (label, ok, detail) => { if (ok) console.log(`  ok   ${label}`); else { failures++; console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 300)}`}`); } };
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

const db = require('../config/db');
const { limit } = require('../utils/rate-limit');

function runLimit(mw, req) { let passed = false; const res = { set() {}, status() { return { json() {} }; } }; mw(req, res, () => { passed = true; }); return passed; }

async function http(base, method, url, body, cookie, ip = '10.1.1.1') {
  const res = await fetch(`${base}${url}`, { method, headers: { 'Content-Type': 'application/json', Origin: base, 'X-Forwarded-For': ip, 'X-Forwarded-Proto': 'https', ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const sc = res.headers.get('set-cookie');
  let json = null; try { json = await res.json(); } catch { /* */ }
  return { status: res.status, json, cookie: sc ? sc.split(';')[0] : cookie };
}

async function startApp(dbFile, port) {
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: dir, TMP: dir, NODE_ENV: 'production', PORT: String(port), TRUST_PROXY: '1', SESSION_SECRET: 'fixes-test-secret-fixes-test-secret-0123456789', DB_FILE: dbFile, COST_TRACKER: 'off', BETA_REPORT_DAILY: 'off', OLLAMA_ENABLED: '0', LOG_DIR: path.join(dir, 'logs'), MAIL_OUTBOX_DIR: path.join(dir, 'outbox') };
  const child = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env, stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 300; i++) { try { const r = await fetch(`${base}/api/auth/me`); if (r.status === 200) return { child, base }; } catch { /* */ } await sleep(200); }
  child.kill();
  throw new Error('server did not start');
}

(async () => {
  console.log('rate limits count by account, not by address');
  const m = limit(`t${Date.now()}`, 2, 60000);
  const ip = '10.0.0.9';
  check('two accounts on one address have an allowance each', [1, 2].every(() => runLimit(m, { ip, user: { id: 1 } })) && [1, 2].every(() => runLimit(m, { ip, user: { id: 2 } })));
  check('the third try of one account is refused', !runLimit(m, { ip, user: { id: 1 } }));
  const anon = limit(`a${Date.now()}`, 2, 60000);
  runLimit(anon, { ip }); runLimit(anon, { ip });
  check('someone not signed in still counts by address', !runLimit(anon, { ip }));
  const by = limit(`b${Date.now()}`, 1, 60000, { by: (r) => r.who });
  runLimit(by, { ip, who: 'x' });
  check('a limit can count by what a request names', !runLimit(by, { ip: '10.0.0.8', who: 'x' }) && runLimit(by, { ip, who: 'y' }));

  console.log('the store: rows by owner match a scan, whatever happens to them');
  const same = (uid) => JSON.stringify(db.forUser('items', uid).map((r) => r.id)) === JSON.stringify(db.find('items', (r) => r.user_id === uid).map((r) => r.id));
  for (let i = 0; i < 30; i++) db.insert('items', { user_id: (i % 3) + 1, n: i });
  check('after inserts', same(1) && same(2) && same(3) && db.forUser('items', 1).length === 10);
  db.insert('items', { user_id: 1, n: 99 });
  check('a new row after the index exists', same(1) && db.forUser('items', 1).length === 11);
  const moved = db.forUser('items', 2)[0];
  db.update('items', moved.id, { user_id: 3 });
  check('a row changes owner', same(2) && same(3));
  db.remove('items', (r) => r.user_id === 1 && r.n < 5);
  check('rows removed', same(1));
  db.upsert('items', (r) => r.n === 7, () => ({ user_id: 2, n: 7 }));
  check('an upsert changes owner', same(1) && same(2));
  check('nobody has no rows, and an unknown collection still throws', db.forUser('items', 12345).length === 0 && (() => { try { db.forUser('nope', 1); return false; } catch { return true; } })());

  console.log('the store: id lookup');
  const row = db.insert('reports', { user_id: 1 });
  check('finds a row', db.byId('reports', row.id) === row && db.byId('reports', String(row.id)) === row);
  check('a missing id or nonsense is null', db.byId('reports', 999999) === null && db.byId('reports', 'abc') === null && db.byId('reports', undefined) === null);
  const rows = db.all('reports');
  const a = db.insert('reports', { user_id: 1 }); const b = db.insert('reports', { user_id: 1 });
  [rows[rows.length - 1], rows[rows.length - 2]] = [rows[rows.length - 2], rows[rows.length - 1]]; // an old file out of order
  check('rows out of order are still found', db.byId('reports', a.id) === a && db.byId('reports', b.id) === b);

  console.log('the store: saving');
  db.flush();
  const text = fs.readFileSync(db.path, 'utf8');
  check('saved on one line and still valid', !text.includes('\n') && JSON.parse(text).items.length > 0);
  const st = db.saveState();
  check('it says how saving is going', st.saving === true && st.failed_attempts === 0 && st.last_save_ms >= 0);

  console.log('a corrupt store in production');
  const bad = path.join(dir, 'bad.json');
  const half = '{"users":[{"id":1,"email":"a@b.c"';
  const load = "require('./config/db'); console.log('LOADED');";
  fs.writeFileSync(bad, half);
  const envBase = { ...process.env, DB_FILE: bad };
  const r1 = spawnSync(process.execPath, ['-e', load], { cwd: path.join(__dirname, '..'), env: { ...envBase, NODE_ENV: 'production' }, encoding: 'utf8' });
  check('refuses to start, says how to restore', r1.status === 1 && /Refusing to start/.test(r1.stderr) && /backup-db/.test(r1.stderr), r1.stderr);
  check('leaves the file exactly as it was', fs.readFileSync(bad, 'utf8') === half);
  const r2 = spawnSync(process.execPath, ['-e', load], { cwd: path.join(__dirname, '..'), env: { ...envBase, NODE_ENV: 'production', DB_ALLOW_FRESH: '1' }, encoding: 'utf8' });
  check('DB_ALLOW_FRESH=1 starts empty, keeping a copy', /LOADED/.test(r2.stdout) && fs.readdirSync(dir).some((f) => f.startsWith('bad.json.corrupt-')), r2.stderr);

  console.log('passwords off the main thread');
  const passwords = require('../services/passwords');
  const bcrypt = require('bcryptjs');
  const h1 = await passwords.hash('secret-word', 4);
  check('a worker hash checks out with the library, and the reverse', await bcrypt.compare('secret-word', h1) && await passwords.compare('secret-word', await bcrypt.hash('secret-word', 4)));
  check('a wrong password is false', !(await passwords.compare('other', h1)));

  console.log('the ledger peek');
  const gonka = require('../services/gonka-ledger');
  const before = gonka.status().spent_usd;
  const id = gonka.reserve({ usd: 1, task: 't', model: 'zai-org/GLM-5.3-Flash' });
  check('a reservation shows at once', gonka.status().committed_usd === before + 1);
  gonka.settle(id, { usd: 0.5, outcome: 'ok', usage: { input_tokens: 1, output_tokens: 1 } });
  check('and its settling', gonka.status().spent_usd === before + 0.5 && gonka.status().reserved_usd === 0);
  const file = process.env.GONKA_LEDGER_FILE;
  const j = JSON.parse(fs.readFileSync(file, 'utf8')); j.settled_usd = 50; fs.writeFileSync(file, JSON.stringify(j));
  check('another process writing the file is seen', gonka.canSpend(0.01) === false);
  let refused = false;
  try { gonka.reserve({ usd: 0.01, task: 't', model: 'zai-org/GLM-5.3-Flash' }); } catch (err) { refused = err.status === 402 || /cap|stop/i.test(err.message); }
  check('a reservation is still refused at the cap', refused);
  fs.writeFileSync(file, '{broken');
  check('a broken ledger still refuses', gonka.canSpend(0) === false && gonka.status().ok === false);

  console.log('a session whose id now belongs to someone else');
  const { attachUser } = require('../middleware/auth');
  const owner = db.insert('users', { email: 'x@example.test', display_name: 'X', age_check: { asked_on: 'x' }, beta_arm: 'x' });
  const who = (uc) => new Promise((resolve) => { const req = { session: { userId: owner.id, uc, destroy() {} } }; attachUser(req, {}, () => resolve(req.user)); });
  check('the right account gets in', (await who(owner.created_at)) === owner);
  check('an old session with no mark gets in', (await who(undefined)) === owner);
  check('a session made for an earlier account with that id does not', (await who('2020-01-01T00:00:00.000Z')) === null);

  console.log('a deleted account leaves nothing on the levels everyone shares');
  const { clearFromSharedPlans } = require('../services/account-deletion');
  const sharedPlan = db.insert('block_plans', { user_id: null, track_id: 't', grade_id: 'g', level: 1, answers: { '77:c1': { answer: 'typed words' }, '78:c1': { answer: 'other' } }, telemetry: { 77: { at: 'x' }, 78: { at: 'y' } } });
  const ownPlan = db.insert('block_plans', { user_id: 78, track_id: 't', grade_id: 'g', level: 2, answers: { '78:c1': { answer: 'mine' } } });
  check('one row is cleared', clearFromSharedPlans(77) === 1);
  const after = db.byId('block_plans', sharedPlan.id);
  check('their answers and times are gone, another learner\'s stay', !after.answers['77:c1'] && after.answers['78:c1'] && !after.telemetry[77] && after.telemetry[78]);
  check('a second learner with a longer id sharing the start is not touched', clearFromSharedPlans(7) === 0 && !!db.byId('block_plans', sharedPlan.id).answers['78:c1'] && db.byId('block_plans', ownPlan.id).answers['78:c1'].answer === 'mine');

  console.log('over HTTP, in production mode');
  const dbFile = path.join(dir, 'http.json');
  const port = 7900 + (process.pid % 90);
  let app = await startApp(dbFile, port);
  const health = await http(app.base, 'GET', '/api/health');
  check('a visitor gets ok and nothing else from /api/health', health.status === 200 && JSON.stringify(health.json) === '{"ok":true}', health.json);
  const cookies = [];
  let bad429 = 0;
  for (let i = 0; i < 25; i++) {
    const age = await http(app.base, 'POST', '/api/consent/age', { birth_year: 1990, birth_month: 2, country: 'US' }, null, '10.1.1.1');
    const r = await http(app.base, 'POST', '/api/auth/register', { email: `c${i}@example.test`, password: 'password-password', display_name: 'Class' }, age.cookie, '10.1.1.1');
    if (r.status !== 201) bad429++;
    cookies.push(r.cookie);
  }
  check('25 sign-ups from one address all work', bad429 === 0, bad429);
  let logins = 0;
  for (let i = 0; i < 25; i++) if ((await http(app.base, 'POST', '/api/auth/login', { email: `c${i}@example.test`, password: 'password-password' })).status === 200) logins++;
  check('25 sign-ins from one address all work', logins === 25, logins);
  const racers = await Promise.all(Array.from({ length: 6 }, (_, i) => http(app.base, 'POST', '/api/consent/age', { birth_year: 1990, birth_month: 2, country: 'US' }, null, `10.3.0.${i}`)));
  const raced = await Promise.all(racers.map((r, i) => http(app.base, 'POST', '/api/auth/register', { email: 'race@example.test', password: 'password-password', display_name: 'Race' }, r.cookie, `10.3.0.${i}`)));
  check('sign-ups racing for one email make one account', raced.filter((r) => r.status === 201).length === 1 && raced.filter((r) => r.status === 409).length === 5, raced.map((r) => r.status));
  let wrong = 0;
  for (let i = 0; i < 20; i++) if ((await http(app.base, 'POST', '/api/auth/login', { email: 'c0@example.test', password: 'wrong-wrong-wrong' }, null, `10.2.0.${i}`)).status === 429) wrong++;
  check('guessing one account is stopped even from many addresses', wrong >= 5, wrong);
  await sleep(1500); // past the save
  app.child.kill('SIGKILL');
  await sleep(300);
  app = await startApp(dbFile, port);
  const me = await http(app.base, 'GET', '/api/auth/me', null, cookies[3]);
  check('a learner is still signed in after a crash and restart', !!(me.json && me.json.user && me.json.user.email === 'c3@example.test'), me.json);
  app.child.kill('SIGKILL');

  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* the OS may hold a file */ }
  console.log(failures ? `\n${failures} failure(s)` : '\nall checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
