/**
 * Tests for the beta-launch kit (curriculum-build/BETA-LAUNCH-KIT.md):
 *
 *   1. mail transports (Resend, Brevo, failover, daily cap) against a mocked fetch
 *   2. beta invites (codes, hashes only, email binding, expiry, reuse, applicants)
 *   3. the SQLite session store
 *   4. the error log (scrubbing, grouping, rotation)
 *   5. the SQLite data driver: parity with the JSON driver, durability after a hard
 *      kill, the refusal to start on an unmigrated store, and the migration's
 *      integrity check on a copy of the real data file (and that it catches a
 *      tampered row)
 *   6. backups: backup, restore test, pruning, a corrupted backup, restore
 *   7. the staged server.js wiring, applied to today's server.js in a temporary
 *      file and run for real: /healthz, /api/ops, the invite gate (adult, child,
 *      /join, reuse, wrong email, login gate), the consent email through a fake
 *      Resend, sessions surviving a restart, the error log, the production
 *      start-up refusals, and the whole app on the SQLite driver.
 *
 * Runs on copies only: every data file, outbox, log and invite file is in a
 * temporary folder. Model keys are blanked and OLLAMA_ENABLED=0, so nothing is
 * spent and nothing is sent; the only network use is 127.0.0.1.
 */
process.env.NODE_ENV = 'test';
for (const name of Object.keys(process.env)) {
  if (/(_API_KEY|_TOKEN|_SECRET_API|_WORKSPACE)$/.test(name) || /^(OPENROUTER|ANTHROPIC|GEMINI|MIMO|MODELFLARE|DEEPSEEK|MINIMAX|NVIDIA|XKIRO|UNOROUTER|RESEND|BREVO)_.*KEY/.test(name)) process.env[name] = '';
}
process.env.OLLAMA_ENABLED = '0';
delete process.env.MAIL_PROVIDER;
delete process.env.DB_DRIVER;

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const zlib = require('zlib');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'beta-launch-test-'));
const cleanups = [];
process.on('exit', () => {
  for (const fn of cleanups) { try { fn(); } catch { /* best effort */ } }
  try { fs.rmSync(WORK, { recursive: true, force: true }); } catch { /* temp */ }
});

let failures = 0;
let passes = 0;
function check(label, condition, detail) {
  if (condition) { passes++; console.log(`  ok   ${label}`); } else {
    failures++;
    console.log(`  FAIL ${label}${detail !== undefined ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
  }
}
const section = (t) => console.log(`\n${t}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FAKE_KEY = `test-resend-key-${crypto.randomBytes(4).toString('hex')}`;

// ── 1. mail transports ────────────────────────────────────────────────────────

async function mailTests() {
  section('1. Mail transports (mocked fetch)');
  const mt = require('../utils/mail-transports');
  const calls = [];
  const fakeFetch = (plan) => async (url, opts) => {
    calls.push({ url, headers: opts.headers, body: JSON.parse(opts.body) });
    const { status, body } = plan(url);
    return { ok: status < 300, status, statusText: String(status), json: async () => body };
  };
  const msg = { to: 'parent@example.test', subject: 'Hello', text: 'Body text', tag: 'consent-request' };

  const resend = mt.resendTransport({ apiKey: FAKE_KEY, from: 'Savant <no-reply@send.example.test>', replyTo: 'help@example.test', fetchImpl: fakeFetch(() => ({ status: 200, body: { id: 're_1' } })) });
  const r1 = await resend(msg);
  const c1 = calls[calls.length - 1];
  check('resend: posts to api.resend.com/emails', c1.url === 'https://api.resend.com/emails');
  check('resend: Bearer key header', c1.headers.Authorization === `Bearer ${FAKE_KEY}`);
  check('resend: from, to[], subject, text, reply_to', c1.body.from.includes('no-reply@send.example.test') && c1.body.to[0] === msg.to && c1.body.subject === 'Hello' && c1.body.text === 'Body text' && c1.body.reply_to === 'help@example.test');
  check('resend: tag sanitised into tags[]', c1.body.tags[0].name === 'kind' && c1.body.tags[0].value === 'consent-request');
  check('resend: idempotency key sent', /^[0-9a-f]{64}$/.test(c1.headers['Idempotency-Key']));
  check('resend: returns the message id', r1.provider === 'resend' && r1.id === 're_1');

  const brevo = mt.brevoTransport({ apiKey: 'brevo-key-x', from: 'Savant <no-reply@send.example.test>', fetchImpl: fakeFetch(() => ({ status: 201, body: { messageId: '<m1@relay>' } })) });
  const r2 = await brevo(msg);
  const c2 = calls[calls.length - 1];
  check('brevo: posts to api.brevo.com/v3/smtp/email with api-key header', c2.url === 'https://api.brevo.com/v3/smtp/email' && c2.headers['api-key'] === 'brevo-key-x');
  check('brevo: sender {name,email}, to [{email}], textContent', c2.body.sender.email === 'no-reply@send.example.test' && c2.body.sender.name === 'Savant' && c2.body.to[0].email === msg.to && c2.body.textContent === 'Body text');
  check('brevo: returns messageId', r2.id === '<m1@relay>');

  const failing = mt.resendTransport({ apiKey: FAKE_KEY, from: 'a@b.test', fetchImpl: fakeFetch(() => ({ status: 429, body: { message: 'rate limited' } })) });
  let err = null;
  try { await failing(msg); } catch (e) { err = e; }
  check('429 is a retryable MailError', err && err.retryable === true && err.status === 429);
  check('the key never appears in an error message', err && !err.message.includes(FAKE_KEY));

  const fo = mt.failover([failing, brevo]);
  const r3 = await fo(msg);
  check('failover: 429 on the first moves to the second', r3.provider === 'brevo');
  const bad = mt.resendTransport({ apiKey: FAKE_KEY, from: 'a@b.test', fetchImpl: fakeFetch(() => ({ status: 422, body: { message: 'invalid to' } })) });
  let e2 = null;
  const before = calls.length;
  try { await mt.failover([bad, brevo])(msg); } catch (e) { e2 = e; }
  check('failover: a 4xx is not retried elsewhere', e2 && e2.status === 422 && calls.length === before + 1);
  let e3 = null;
  try { await resend({ ...msg, to: 'not-an-address' }); } catch (e) { e3 = e; }
  check('a bad recipient is refused before any request', e3 && e3.retryable === false);

  const stateFile = path.join(WORK, 'mail-state', 'mail-counters.json');
  const capped = mt.dailyCap(resend, { cap: 2, stateFile, name: 'resend' });
  await capped(msg); await capped(msg);
  let e4 = null;
  try { await capped(msg); } catch (e) { e4 = e; }
  check('daily cap: the third send of a cap-2 day is refused as retryable', e4 && e4.retryable && /daily cap/.test(e4.message));
  check('daily cap: counted in a file, with no addresses', fs.existsSync(stateFile) && !fs.readFileSync(stateFile, 'utf8').includes('@'));
  const capped2 = mt.dailyCap(resend, { cap: 2, stateFile, name: 'resend' });
  let e5 = null;
  try { await capped2(msg); } catch (e) { e5 = e; }
  check('daily cap: survives a restart (new instance, same file)', e5 && /daily cap/.test(e5.message));
  const r6 = await mt.failover([capped2, brevo])(msg);
  check('daily cap: at the cap, failover sends through the next provider', r6.provider === 'brevo');
  const tomorrow = mt.dailyCap(resend, { cap: 2, stateFile, name: 'resend', now: () => new Date(Date.now() + 86400000) });
  check('daily cap: resets on the next UTC day', (await tomorrow(msg)).provider === 'resend');

  check('fromEnv: null with no MAIL_PROVIDER', mt.fromEnv({}) === null);
  let e7 = null;
  try { mt.fromEnv({ MAIL_PROVIDER: 'sendgrid', MAIL_FROM: 'a@b.test' }); } catch (e) { e7 = e; }
  check('fromEnv: an unknown provider is an error', e7 && /unknown provider/.test(e7.message));
  let e8 = null;
  try { mt.fromEnv({ MAIL_PROVIDER: 'resend', MAIL_FROM: 'a@b.test' }); } catch (e) { e8 = e; }
  check('fromEnv: a provider without its key is an error', e8 && /no API key/.test(e8.message));
  const env = { MAIL_PROVIDER: 'resend,brevo', RESEND_API_KEY: FAKE_KEY, BREVO_API_KEY: 'k2', MAIL_FROM: 'a@b.test' };
  const built = mt.fromEnv(env, { fetchImpl: fakeFetch(() => ({ status: 200, body: { id: 'x' } })), stateDir: path.join(WORK, 'mail-state2') });
  check('fromEnv: "resend,brevo" builds a failover in that order', built.providerName === 'resend>brevo');
  const mailer = require('../utils/mailer');
  process.env.MAIL_OUTBOX_DIR = path.join(WORK, 'unit-outbox');
  const name = mt.installFromEnv(env, { fetchImpl: fakeFetch(() => ({ status: 200, body: { id: 'y' } })), stateDir: path.join(WORK, 'mail-state3') });
  const sent = await mailer.send(msg);
  check('installFromEnv: mailer now sends through the provider, not the outbox', name === 'resend>brevo' && mailer.transportName() === 'custom' && sent.transport === 'custom' && !fs.existsSync(process.env.MAIL_OUTBOX_DIR));
  mailer.setTransport(null);
  check('parseAddress: "Name <a@b>" and bare', JSON.stringify(mt.parseAddress('Savant <a@b.c>')) === JSON.stringify({ name: 'Savant', email: 'a@b.c' }) && mt.parseAddress('a@b.c').email === 'a@b.c');
}

// ── 2. beta invites ──────────────────────────────────────────────────────────

function inviteTests() {
  section('2. Beta invites');
  process.env.BETA_INVITES_FILE = path.join(WORK, 'unit-invites.json');
  delete process.env.BETA_BIND_EMAIL;
  const inv = require('../services/beta-invites');
  const { code, invite } = inv.approve('Tester@Example.test', { name: 'Tess', role: 'learner', source: 'site-beta:abc' });
  check('code looks like XXXXX-XXXXX in Crockford base32', /^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/.test(code), code);
  const file = fs.readFileSync(process.env.BETA_INVITES_FILE, 'utf8');
  check('only the hash is stored: the code is not in the file', !file.includes(code) && !file.includes(code.replace('-', '')));
  check('the public invite has no hash', invite.code_hash === undefined && invite.email === 'tester@example.test');
  check('check: valid for its own email (any case)', inv.check(code, ['TESTER@example.test']).ok);
  check('check: lower case and no dash accepted', inv.check(code.toLowerCase().replace('-', ''), 'tester@example.test').ok);
  check('check: refused for another email', inv.check(code, ['someone@example.test']).reason === 'other_email');
  check('check: a child sign-up passes with the invite email as parent email', inv.check(code, [undefined, 'tester@example.test']).ok);
  check('check: unknown code', inv.check('ABCDE-FGHJK', 'tester@example.test').reason === 'unknown');
  check('check: missing code', inv.check('', 'tester@example.test').reason === 'missing');
  process.env.BETA_BIND_EMAIL = '0';
  check('BETA_BIND_EMAIL=0: any email', inv.check(code, ['someone@example.test']).ok);
  delete process.env.BETA_BIND_EMAIL;
  check('check: expired after its days', inv.check(code, 'tester@example.test', { now: new Date(Date.now() + 31 * 86400000) }).reason === 'expired');
  const used = inv.redeem(code, 4242);
  check('redeem: marks the invite and the account', used && used.status === 'redeemed' && used.user_id === 4242);
  check('redeem: the code cannot be used twice', inv.check(code, 'tester@example.test').reason === 'used' && inv.redeem(code, 1) === null);
  check('isTester: the redeeming account', inv.isTester(4242) && !inv.isTester(1));
  const a = inv.approve('again@example.test');
  const b = inv.approve('again@example.test');
  check('approving again replaces the old code', inv.check(a.code, 'again@example.test').reason === 'replaced' && inv.check(b.code, 'again@example.test').ok);
  check('revoke stops the live code', inv.revoke('again@example.test') === 1 && inv.check(b.code, 'again@example.test').reason === 'revoked');
  check('forget removes every row for the address', inv.forget('again@example.test') === 2 && !inv.list().some((i) => i.email === 'again@example.test'));
  let threw = false;
  try { inv.approve('not an email'); } catch { threw = true; }
  check('approve refuses a non-address', threw);
  const jsonl = path.join(WORK, 'beta.jsonl');
  fs.writeFileSync(jsonl, [
    JSON.stringify({ id: 'a1', at: '2026-10-24T00:00:00Z', form: 'beta', email: 'tester@example.test', name: 'Tess', role: 'learner', status: 'applied' }),
    'not json',
    JSON.stringify({ id: 'a2', at: '2026-10-24T00:01:00Z', form: 'beta', email: 'new@example.test', name: 'Neo', role: 'parent', status: 'applied' }),
  ].join('\n'));
  const before = fs.readFileSync(jsonl, 'utf8');
  const apps = inv.applicants(jsonl);
  check('applicants: reads the site file, skips a broken line, shows invite state', apps.length === 2 && apps[0].invite === 'redeemed' && apps[1].invite === 'none');
  check('applicants: the site file is not changed', fs.readFileSync(jsonl, 'utf8') === before);
  check('applicants: a missing file is an empty list', inv.applicants(path.join(WORK, 'nope.jsonl')).length === 0);
  const mail = inv.inviteEmail({ to: 'new@example.test', name: 'Neo', code: 'ABCDE-12345', origin: 'https://app.example.test/' });
  check('invite email: link to /join with the code, and the code itself', mail.text.includes('https://app.example.test/join?invite=ABCDE-12345') && mail.text.includes('code: ABCDE-12345') && mail.tag === 'beta-invite');
  check('invite email: says testers use it free (the landing page promise)', /completely free/.test(mail.text));

  // The CLI, on its own invite file and outbox.
  const env = { ...process.env, BETA_INVITES_FILE: path.join(WORK, 'cli-invites.json'), MAIL_OUTBOX_DIR: path.join(WORK, 'cli-outbox'), APP_ORIGIN: 'https://app.example.test', DB_FILE: path.join(WORK, 'cli-db.json') };
  const run = (...a) => spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'beta-invites.js'), ...a], { env, encoding: 'utf8' });
  const ls = run('applicants', '--from', jsonl);
  check('CLI applicants lists both', ls.status === 0 && /a1/.test(ls.stdout) && /a2/.test(ls.stdout), ls.stderr);
  const ap = run('approve-applicants', 'a2', '--from', jsonl, '--send');
  const out = fs.existsSync(env.MAIL_OUTBOX_DIR) ? fs.readdirSync(env.MAIL_OUTBOX_DIR) : [];
  check('CLI approve-applicants --send writes the invite to the dev outbox', ap.status === 0 && out.length === 1, ap.stderr || ap.stdout);
  const sentMail = out.length ? JSON.parse(fs.readFileSync(path.join(env.MAIL_OUTBOX_DIR, out[0]), 'utf8')) : {};
  const codeIn = (sentMail.text || '').match(/invite=([0-9A-Z-]+)/);
  check('CLI: the emailed code works for that applicant', codeIn && (() => { process.env.BETA_INVITES_FILE = env.BETA_INVITES_FILE; const ok = inv.check(codeIn[1], 'new@example.test').ok; process.env.BETA_INVITES_FILE = path.join(WORK, 'unit-invites.json'); return ok; })());
  check('CLI: did not create a data file (the store was never loaded)', !fs.existsSync(env.DB_FILE));
  const p = run('approve', 'manual@example.test');
  check('CLI approve without --send prints the code once', p.status === 0 && /Code \(shown once\): [0-9A-Z]{5}-[0-9A-Z]{5}/.test(p.stdout));
}

// ── 3. session store ─────────────────────────────────────────────────────────

async function sessionTests() {
  section('3. SQLite session store');
  const { SqliteSessionStore } = require('../services/session-store');
  const file = path.join(WORK, 'sessions.sqlite');
  const p = (fn) => new Promise((res, rej) => fn((e, v) => (e ? rej(e) : res(v))));
  const s1 = new SqliteSessionStore({ file, pruneMs: 0 });
  const later = new Date(Date.now() + 3600000).toISOString();
  await p((cb) => s1.set('sid-a', { cookie: { expires: later }, userId: 7 }, cb));
  await p((cb) => s1.set('sid-old', { cookie: { expires: new Date(Date.now() - 1000).toISOString() }, userId: 8 }, cb));
  check('set then get', (await p((cb) => s1.get('sid-a', cb))).userId === 7);
  check('an expired session reads as none', (await p((cb) => s1.get('sid-old', cb))) === null);
  s1.close();
  const s2 = new SqliteSessionStore({ file, pruneMs: 0 });
  check('a new store on the same file still has the session (restart)', (await p((cb) => s2.get('sid-a', cb))).userId === 7);
  await p((cb) => s2.set('sid-b', { cookie: { expires: new Date(Date.now() - 1).toISOString() } }, cb));
  check('prune removes expired rows', s2.prune() >= 1);
  check('length counts live sessions', (await p((cb) => s2.length(cb))) === 1);
  const soon = new Date(Date.now() + 7200000).toISOString();
  await p((cb) => s2.touch('sid-a', { cookie: { expires: soon } }, cb));
  const row = s2.db.prepare('SELECT expires FROM sessions WHERE sid = ?').get('sid-a');
  check('touch moves the expiry', Math.abs(row.expires - new Date(soon).getTime()) < 5);
  await p((cb) => s2.destroy('sid-a', cb));
  check('destroy', (await p((cb) => s2.get('sid-a', cb))) === null);
  s2.close();
}

// ── 4. error log ─────────────────────────────────────────────────────────────

function errorLogTests() {
  section('4. Error log');
  process.env.LOG_DIR = path.join(WORK, 'logs-unit');
  const log = require('../services/error-log');
  log._reset();
  const req = {
    method: 'POST', originalUrl: '/api/auth/login?token=SECRET-TOKEN-1&x=1', user: { id: 5 },
    body: { password: 'hunter2-secret-body' }, headers: { cookie: 'polymath.sid=s%3Asecret-cookie' },
  };
  const fail = (id) => new Error(`user parent@example.test not found, id ${id}`); // one throw site, as in the app
  const e = log.record(fail(41), { req, status: 500 });
  const text = fs.readFileSync(log.logFile(), 'utf8');
  check('recorded with method, route, status and user id', e && e.method === 'POST' && e.route === '/api/auth/login' && e.status === 500 && e.user_id === 5);
  check('no query string, body or cookie in the file', !/SECRET-TOKEN|hunter2|secret-cookie/.test(text));
  check('email addresses are masked', !text.includes('parent@example.test') && text.includes('<email>'));
  log.record(fail(42), { req, status: 500 });
  const d = log.digest();
  check('errors that differ only by a number are one group', d.length === 1 && d[0].count === 2);
  check('scrub masks key-shaped strings and token params', !log.scrub('key sk-ant-abcdefghijklmnop and ?invite=ABCDE-12345').match(/abcdefghijklmnop|ABCDE-12345/));
  process.env.ERROR_LOG_MAX_MB = '0.0005';
  for (let i = 0; i < 12; i++) log.record(new Error(`filler ${'x'.repeat(200)}`));
  delete process.env.ERROR_LOG_MAX_MB;
  check('the file rotates at its size limit', fs.existsSync(`${log.logFile()}.1`));
  check('recent() reads the current file', Array.isArray(log.recent(5)) && log.recent(5).length >= 1);
}

// ── 5. SQLite driver ─────────────────────────────────────────────────────────

const OPS = `
const db = require(process.env.DRIVER_FILE);
const u = db.insert('users', { email: 'a@x.test', display_name: 'A' });
db.insertMany('events', [{ k: 1 }, { k: 2 }, { k: 3 }]);
db.update('users', u.id, { display_name: 'A2', xp: 5 });
db.upsert('skill_states', (r) => r.user_id === u.id && r.skill === 's1', () => ({ user_id: u.id, skill: 's1', m: 0.1 }));
db.upsert('skill_states', (r) => r.user_id === u.id && r.skill === 's1', (old) => ({ m: old.m + 0.5 }));
db.remove('events', (r) => r.k === 2);
const row = db.findOne('events', (r) => r.k === 3);
row.direct = 'edited outside the API';
db.flush();
`;
const DUMP = `
const db = require(process.env.DRIVER_FILE);
const out = {};
for (const n of ['users', 'events', 'skill_states']) out[n] = db.all(n).map(({ created_at, updated_at, ...r }) => r);
out.counters = ['users', 'events', 'skill_states'].map((n) => { const ids = db.all(n).map((r) => r.id); return [n, ids.length]; });
process.stdout.write(JSON.stringify(out));
`;

function runNode(code, env, args = []) {
  return spawnSync(process.execPath, [...args, '-e', code], { cwd: ROOT, env: { ...process.env, ...env }, encoding: 'utf8', timeout: 120000 });
}

async function sqliteTests() {
  section('5. SQLite data driver and migration');
  const dir = path.join(WORK, 'drv');
  fs.mkdirSync(dir);
  const seed = { _counters: { users: 2 }, users: [{ id: 1, email: 'seed1@x.test' }, { id: 2, email: 'seed2@x.test' }], events: [] };
  const jsonFile = path.join(dir, 'db.json');
  fs.writeFileSync(jsonFile, JSON.stringify(seed));
  const sqliteFile = path.join(dir, 'db.sqlite');
  const mig = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'migrate-json-to-sqlite.js'), '--from', jsonFile, '--to', sqliteFile], { encoding: 'utf8' });
  check('migrate a small store', mig.status === 0, mig.stderr);
  const jsonEnv = { DRIVER_FILE: path.join(ROOT, 'config', 'db.js'), DB_FILE: jsonFile, DB_READONLY: '' };
  const sqlEnv = { DRIVER_FILE: path.join(ROOT, 'config', 'db-sqlite.js'), DB_FILE: path.join(dir, 'unused.json'), DB_SQLITE_FILE: sqliteFile, DB_READONLY: '' };
  const a = runNode(OPS, jsonEnv); const b = runNode(OPS, sqlEnv);
  check('the same operations run on both drivers', a.status === 0 && b.status === 0, a.stderr + b.stderr);
  const da = runNode(DUMP, jsonEnv); const dbb = runNode(DUMP, sqlEnv);
  check('after a reload, both drivers hold the same rows (timestamps aside)', da.stdout && da.stdout === dbb.stdout, { json: da.stdout.slice(0, 300), sqlite: dbb.stdout.slice(0, 300), err: dbb.stderr.slice(0, 300) });
  check('the direct edit outside the API was saved by the SQLite full flush', dbb.stdout.includes('edited outside the API'));

  // Durability: API writes, then the timer flush, then a hard kill (no exit handler).
  const killCode = `const db=require(process.env.DRIVER_FILE);db.insert('users',{email:'durable@x.test'});setTimeout(()=>{process.stdout.write('flushed');},700);setInterval(()=>{},1000);`;
  const child = spawn(process.execPath, ['-e', killCode], { cwd: ROOT, env: { ...process.env, ...sqlEnv } });
  await new Promise((res) => { child.stdout.on('data', (d) => { if (String(d).includes('flushed')) res(); }); setTimeout(res, 5000); });
  child.kill('SIGKILL');
  await new Promise((res) => child.on('exit', res));
  const after = runNode(DUMP, sqlEnv);
  check('a write is on disk 250 ms later, even if the process is then killed', after.stdout.includes('durable@x.test'), after.stderr);

  // Refuse to start on an unmigrated store.
  const refuse = runNode("require(process.env.DRIVER_FILE)", { DRIVER_FILE: path.join(ROOT, 'config', 'db-sqlite.js'), DB_FILE: jsonFile, DB_SQLITE_FILE: path.join(dir, 'missing.sqlite') });
  check('DB_DRIVER=sqlite with no SQLite file beside a JSON store refuses to start', refuse.status !== 0 && /migrate-json-to-sqlite/.test(refuse.stderr));
  check('the refusal created no SQLite file', !fs.existsSync(path.join(dir, 'missing.sqlite')));

  // The real data, on a copy.
  const real = path.join(ROOT, 'data', 'db.json');
  if (!fs.existsSync(real)) { check('data/db.json exists for the migration check', false); return; }
  const copy = path.join(dir, 'real-copy.json');
  fs.copyFileSync(real, copy);
  const realSqlite = path.join(dir, 'real.sqlite');
  const report = path.join(dir, 'report.json');
  const t0 = Date.now();
  const m2 = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'migrate-json-to-sqlite.js'), '--from', copy, '--to', realSqlite, '--report', report], { encoding: 'utf8', timeout: 300000 });
  const rep = fs.existsSync(report) ? JSON.parse(fs.readFileSync(report, 'utf8')) : {};
  check(`migrate a copy of data/db.json: ${rep.rows} rows, ${rep.json_bytes} -> ${rep.sqlite_bytes} bytes, ${Date.now() - t0} ms (${JSON.stringify(rep.timings_ms)})`, m2.status === 0 && rep.ok, m2.stderr);
  const ver = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'migrate-json-to-sqlite.js'), '--verify', '--from', copy, '--to', realSqlite], { encoding: 'utf8', timeout: 300000 });
  check('verify: every row, counter and the whole-store hash match', ver.status === 0, ver.stdout.slice(0, 500));
  const tampered = path.join(dir, 'tampered.sqlite');
  fs.copyFileSync(realSqlite, tampered);
  const tam = spawnSync(process.execPath, ['-e', `const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync(${JSON.stringify(tampered)});const r=d.prepare("SELECT coll,id,doc FROM rows WHERE coll='users' ORDER BY pos LIMIT 1").get();const o=JSON.parse(r.doc);o.xp=(o.xp||0)+1;d.prepare('UPDATE rows SET doc=? WHERE coll=? AND id=?').run(JSON.stringify(o),r.coll,r.id);d.close();`], { encoding: 'utf8' });
  const ver2 = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'migrate-json-to-sqlite.js'), '--verify', '--from', copy, '--to', tampered], { encoding: 'utf8', timeout: 300000 });
  check('verify catches one changed row', tam.status === 0 && ver2.status !== 0 && /users: row 0/.test(ver2.stdout), ver2.stdout.slice(0, 300));
  const back = path.join(dir, 'back.json');
  const rev = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'migrate-json-to-sqlite.js'), '--reverse', '--from', realSqlite, '--to', back], { encoding: 'utf8', timeout: 300000 });
  check('reverse (rollback): SQLite back to a JSON store that verifies against it', rev.status === 0, rev.stderr);
  const loadBack = runNode("const db=require(process.env.DRIVER_FILE);process.stdout.write(String(db.all('users').length))", { DRIVER_FILE: path.join(ROOT, 'config', 'db.js'), DB_FILE: back, DB_READONLY: '1' });
  const users = JSON.parse(fs.readFileSync(copy, 'utf8')).users.length;
  check('the JSON driver loads the rolled-back file with every user', Number(loadBack.stdout) === users, loadBack.stderr);
  const exists = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'migrate-json-to-sqlite.js'), '--from', copy, '--to', realSqlite], { encoding: 'utf8' });
  check('migrate refuses to replace an existing target without --force', exists.status !== 0 && /--force/.test(exists.stderr));
  return { realSqlite, copy };
}

// ── 6. backups ───────────────────────────────────────────────────────────────

function backupTests(sqlite) {
  section('6. Backups');
  const dir = path.join(WORK, 'bk');
  fs.mkdirSync(dir);
  const src = path.join(dir, 'db.json');
  fs.copyFileSync(path.join(ROOT, 'data', 'db.json'), src);
  fs.writeFileSync(path.join(dir, 'beta-invites.json'), JSON.stringify({ version: 1, invites: [] }));
  const bdir = path.join(dir, 'backups');
  const env = { ...process.env, DB_FILE: src, BACKUP_DIR: bdir, DB_DRIVER: '' };
  delete env.BACKUP_EXTRA;
  const run = (...a) => spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'backup-db.js'), ...a], { env, encoding: 'utf8', timeout: 300000 });
  const before = fs.readFileSync(src);
  const b1 = run();
  check(`backup: ${b1.stdout.trim()}`, b1.status === 0, b1.stderr);
  check('backup: the source is unchanged', Buffer.compare(before, fs.readFileSync(src)) === 0);
  const manifests = fs.readdirSync(bdir).filter((f) => f.endsWith('.manifest.json'));
  const man = JSON.parse(fs.readFileSync(path.join(bdir, manifests[0]), 'utf8'));
  check('backup: manifest has checksums and per-collection counts', /^[0-9a-f]{64}$/.test(man.sha256) && man.collections.users && man.collections.users.rows > 0);
  check('backup: the invite file went with it', man.extras.some((e) => /beta-invites/.test(e.file)));
  check('backup: gzip of the data matches the source bytes', crypto.createHash('sha256').update(zlib.gunzipSync(fs.readFileSync(path.join(bdir, man.file)))).digest('hex') === crypto.createHash('sha256').update(before).digest('hex'));
  const rt = run('--restore-test');
  check(`restore test: ${rt.stdout.trim().split('\n')[0]}`, rt.status === 0, rt.stdout + rt.stderr);
  check('restore test: result kept in restore-test-last.json', JSON.parse(fs.readFileSync(path.join(bdir, 'restore-test-last.json'), 'utf8')).ok === true);

  // Pruning: three fake old backups and the real one; old ones past the age go,
  // but the newest three always stay.
  for (const [i, days] of [[1, 60], [2, 45], [3, 40], [4, 35]]) {
    const id = `db-2026090${i}T000000Z`;
    fs.writeFileSync(path.join(bdir, `${id}.json.gz`), zlib.gzipSync('{}'));
    fs.writeFileSync(path.join(bdir, `${id}.manifest.json`), JSON.stringify({ id, kind: 'json', file: `${id}.json.gz`, created_at: new Date(Date.now() - days * 86400000).toISOString(), collections: {}, extras: [] }));
  }
  const b2 = run();
  const left = fs.readdirSync(bdir).filter((f) => f.endsWith('.manifest.json')).sort();
  check('prune: past 28 days removed, newest 3 kept', b2.status === 0 && left.length === 3 && !left.some((f) => /20260901|20260902|20260903/.test(f)), left);

  // A corrupted backup fails the restore test.
  const newest = left[left.length - 1];
  const m = JSON.parse(fs.readFileSync(path.join(bdir, newest), 'utf8'));
  const gzPath = path.join(bdir, m.file);
  const buf = fs.readFileSync(gzPath);
  buf[Math.floor(buf.length / 2)] ^= 0xff;
  fs.writeFileSync(gzPath, buf);
  const bad = run('--restore-test');
  check('restore test fails on a corrupted backup', bad.status !== 0 && /checksum/.test(bad.stdout + bad.stderr), bad.stdout + bad.stderr);

  // Restore: refuses to overwrite, writes a verified copy.
  const good = JSON.parse(fs.readFileSync(path.join(bdir, left[left.length - 2]), 'utf8'));
  const goodFile = path.join(bdir, good.file);
  const r1 = run('--restore', goodFile, '--to', src);
  check('restore refuses to overwrite the live file without --force', r1.status !== 0 && /--force/.test(r1.stderr));
  const target = path.join(dir, 'restored.json');
  const r2 = run('--restore', goodFile, '--to', target);
  check('restore writes a copy equal to the backed-up data', r2.status === 0 && Buffer.compare(fs.readFileSync(target), zlib.gunzipSync(fs.readFileSync(goodFile))) === 0, r2.stderr);

  if (sqlite) {
    const sdir = path.join(dir, 'sqlite-backups');
    const senv = { ...process.env, DB_DRIVER: 'sqlite', DB_SQLITE_FILE: sqlite.realSqlite, BACKUP_DIR: sdir, BACKUP_EXTRA: '' };
    const s1 = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'backup-db.js')], { env: senv, encoding: 'utf8', timeout: 300000 });
    check(`SQLite backup (online backup API): ${s1.stdout.trim()}`, s1.status === 0, s1.stderr);
    const s2 = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'backup-db.js'), '--restore-test'], { env: senv, encoding: 'utf8', timeout: 300000 });
    check(`SQLite restore test: ${s2.stdout.trim().split('\n')[0]}`, s2.status === 0, s2.stdout + s2.stderr);
  }
}

// ── 7. the staged server wiring, run for real ───────────────────────────────

function makeClient(base) {
  let cookie = '';
  async function call(method, url, body, extra = {}) {
    const res = await fetch(base + url, {
      method, redirect: 'manual',
      headers: { Origin: base, ...(body !== undefined ? { 'Content-Type': typeof body === 'string' ? 'application/json' : 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...extra },
      body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
    });
    const set = res.headers.get('set-cookie');
    if (set) { const sid = set.split(';')[0]; cookie = /=$/.test(sid) ? '' : sid; }
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, json, text, headers: res.headers };
  }
  return { get: (u) => call('GET', u), post: (u, b) => call('POST', u, b === undefined ? {} : b), cookie: () => cookie, setCookie: (c) => { cookie = c; } };
}

function fakeProvider() {
  const got = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      got.push({ url: req.url, headers: req.headers, body: body ? JSON.parse(body) : null });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: `fake-${got.length}` }));
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, got, port: server.address().port })));
}

async function startServer(serverFile, env, extraArgs = []) {
  const child = spawn(process.execPath, [...extraArgs, serverFile], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  const base = `http://127.0.0.1:${env.PORT}`;
  for (let i = 0; i < 240; i++) {
    try { const r = await fetch(`${base}/healthz`); if (r.status === 200 || r.status === 503) return { child, base, log: () => log }; } catch { /* not up */ }
    if (child.exitCode !== null) break;
    await sleep(250);
  }
  child.kill();
  throw new Error(`server did not start:\n${log.slice(-2000)}`);
}
const stop = async (s) => { if (s && s.child.exitCode === null) { s.child.kill(); await new Promise((r) => s.child.on('exit', r)); } };

function exitOf(serverFile, env) {
  const r = spawnSync(process.execPath, [serverFile], { cwd: ROOT, env, encoding: 'utf8', timeout: 120000 });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

async function serverTests(sqlite) {
  section('7. Staged server wiring (patched copy of today\'s server.js, run for real)');
  const apply = require('../curriculum-build/staged/beta-launch/apply.js');
  const patched = apply.patchServer(fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8'));
  check('every server.js anchor is still found', patched.missing.length === 0, patched.missing);
  check('every config/db.js anchor is still found', apply.patchDb(fs.readFileSync(path.join(ROOT, 'config', 'db.js'), 'utf8')).missing.length === 0);
  check('package.json patch adds the test to the chain', apply.patchPackage(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).text.includes('beta-launch-test.js'));
  if (patched.missing.length) return;
  // The patched server has to sit in the app folder for its require paths.
  const serverFile = path.join(ROOT, `.beta-launch-test-server-${process.pid}.js`);
  fs.writeFileSync(serverFile, patched.text);
  cleanups.push(() => fs.unlinkSync(serverFile));
  // config/db.js patched the same way, through a require hook (the real file is not edited).
  const hook = path.join(WORK, 'db-driver-hook.js');
  fs.writeFileSync(hook, `const Module=require('module');const path=require('path');const orig=Module._resolveFilename;
const target=path.join(${JSON.stringify(ROOT)},'config','db.js');const repl=path.join(${JSON.stringify(ROOT)},'config','db-sqlite.js');
Module._resolveFilename=function(req,parent,...rest){const r=orig.call(this,req,parent,...rest);return (r===target&&process.env.DB_DRIVER==='sqlite')?repl:r;};`);

  const dir = path.join(WORK, 'srv');
  fs.mkdirSync(dir);
  const dbFile = path.join(dir, 'db.json');
  const store = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'db.json'), 'utf8'));
  const bcrypt = require('bcryptjs');
  const hash = bcrypt.hashSync('outsider-pass-1', 4);
  store._counters = store._counters || {};
  const nextId = Math.max(store._counters.users || 0, ...store.users.map((u) => u.id || 0)) + 1;
  store._counters.users = nextId;
  store.users.push({ id: nextId, email: 'outsider@example.test', display_name: 'Outsider', password_hash: hash, xp: 0, streak: 0, onboarded: true, age_check: { country: 'US', birth_ym: '1990-01', age_at_check: 36, consent_age: 13, needs_parent: false, under_13: false, checked_at: new Date().toISOString(), screen_version: 1, asked_on: 'sign_up' }, account_type: 'standard', created_at: new Date().toISOString() });
  fs.writeFileSync(dbFile, JSON.stringify(store));

  const provider = await fakeProvider();
  cleanups.push(() => provider.server.close());
  const invitesFile = path.join(dir, 'beta-invites.json');
  process.env.BETA_INVITES_FILE = invitesFile;
  const inv = require('../services/beta-invites');
  const adultInv = inv.approve('adult@example.test');
  const parentInv = inv.approve('parent@example.test');
  const adminInv = inv.approve('beta-admin@example.test');
  const secret = crypto.randomBytes(32).toString('hex');
  const port = 7300 + Math.floor(Math.random() * 400);
  const env = {
    ...process.env, NODE_ENV: 'test', PORT: String(port), DB_FILE: dbFile, DB_READONLY: '', DB_DRIVER: '',
    MAIL_OUTBOX_DIR: path.join(dir, 'outbox'), MAIL_PROVIDER: 'resend', RESEND_API_KEY: FAKE_KEY, RESEND_API_URL: `http://127.0.0.1:${provider.port}/emails`,
    MAIL_FROM: 'Savant <no-reply@send.example.test>', MAIL_STATE_DIR: dir, CONSENT_SWEEP: 'off',
    ADMIN_EMAILS: 'beta-admin@example.test', SESSION_SECRET: secret, SESSION_STORE: 'sqlite', SESSION_DB_FILE: path.join(dir, 'sessions.sqlite'),
    BETA_GATE: 'invite', BETA_GATE_LOGIN: '1', BETA_INVITES_FILE: invitesFile, LOG_DIR: path.join(dir, 'logs'), APP_ORIGIN: `http://127.0.0.1:${port}`,
  };
  delete env.ERROR_ALERT_EMAIL;
  const year = new Date().getUTCFullYear();
  let s = await startServer(serverFile, env);
  try {
    check('start-up line names the mail provider, the session store and the gate', /mail: resend; sessions: sqlite; beta gate: invite/.test(s.log()), s.log().slice(-600));
    check('the key is not in the server output', !s.log().includes(FAKE_KEY));
    const anon = makeClient(s.base);
    const hz = await anon.get('/healthz');
    check('/healthz: 200 and only { ok: true }', hz.status === 200 && JSON.stringify(hz.json) === '{"ok":true}', hz.text);
    check('/api/ops/status: 404 for a visitor', (await anon.get('/api/ops/status')).status === 404);
    const adult = { email: 'adult@example.test', password: 'adult-pass-123', display_name: 'Adult', birth_year: year - 30, birth_month: 1, country: 'US' };
    const r0 = await anon.post('/api/auth/register', adult);
    check('gate: sign-up without a code is refused (403, missing)', r0.status === 403 && r0.json.beta === 'missing', r0.text);
    const r1 = await anon.post('/api/auth/register', { ...adult, invite_code: 'ZZZZZ-ZZZZZ' });
    check('gate: an unknown code is refused', r1.status === 403 && r1.json.beta === 'unknown');
    const r2 = await anon.post('/api/auth/register', { ...adult, email: 'someone-else@example.test', invite_code: adultInv.code });
    check('gate: a code for another email is refused', r2.status === 403 && r2.json.beta === 'other_email');
    const joiner = makeClient(s.base);
    const j = await joiner.get(`/join?invite=${adultInv.code}`);
    check('/join keeps the code in the session and redirects to /register', j.status === 303 && j.headers.get('location') === '/register' && joiner.cookie());
    const r3 = await joiner.post('/api/auth/register', adult);
    check('gate: sign-up after /join (no code in the body) makes the account', r3.status === 201 && r3.json.user && r3.json.user.email === 'adult@example.test', r3.text);
    await sleep(100);
    const stored = JSON.parse(fs.readFileSync(invitesFile, 'utf8')).invites.find((i) => i.email === 'adult@example.test');
    check('the invite is marked used by the new account', stored.status === 'redeemed' && stored.user_id === r3.json.user.id);
    const again = makeClient(s.base);
    const r4 = await again.post('/api/auth/register', { ...adult, invite_code: adultInv.code });
    check('gate: the same code cannot make a second account', r4.status === 403 && r4.json.beta === 'used');

    const kid = makeClient(s.base);
    const r5 = await kid.post('/api/auth/register', { username: 'betakid1', password: 'kid-pass-1234', display_name: 'Kiddo', parent_email: 'parent@example.test', birth_year: year - 10, birth_month: 1, country: 'US', invite_code: parentInv.code });
    check('gate: a child sign-up passes with the invite email as the parent email', r5.status === 201 && r5.json.user, r5.text);
    await sleep(300);
    const consentMail = provider.got.find((g) => g.body && g.body.to && g.body.to[0] === 'parent@example.test');
    check('the consent request went to the fake Resend, not the outbox', !!consentMail && !fs.existsSync(env.MAIL_OUTBOX_DIR));
    check('it carried the Bearer key, the verified sender and a consent link', consentMail && consentMail.headers.authorization === `Bearer ${FAKE_KEY}` && /no-reply@send\.example\.test/.test(consentMail.body.from) && /parent-consent\?token=/.test(consentMail.body.text));
    check('the consent link uses APP_ORIGIN', consentMail && consentMail.body.text.includes(`${env.APP_ORIGIN}/parent-consent?token=`));
    check('the app reports consent_email_sent', r5.json && r5.json.consent_email_sent === true);

    const out = makeClient(s.base);
    const l1 = await out.post('/api/auth/login', { email: 'outsider@example.test', password: 'wrong-password' });
    check('login gate: a wrong password still gets the usual 401', l1.status === 401);
    const l2 = await out.post('/api/auth/login', { email: 'outsider@example.test', password: 'outsider-pass-1' });
    check('login gate: a right password on a non-invited account gets 403 not_invited', l2.status === 403 && l2.json.beta === 'not_invited');
    const l3 = await makeClient(s.base).post('/api/auth/login', { email: 'adult@example.test', password: 'adult-pass-123' });
    check('login gate: an invited tester signs in', l3.status === 200);

    const admin = makeClient(s.base);
    const ra = await admin.post('/api/auth/register', { email: 'beta-admin@example.test', password: 'admin-pass-123', display_name: 'Admin', birth_year: year - 40, birth_month: 1, country: 'US', invite_code: adminInv.code });
    check('admin account made through its invite', ra.status === 201, ra.text);
    const st = await admin.get('/api/ops/status');
    check('/api/ops/status for an admin: checks, mail, gate, invites, memory', st.status === 200 && st.json.checks.db.ok && st.json.mail === 'custom' && st.json.beta_gate === 'invite' && st.json.invites.redeemed >= 3 && st.json.memory_mb.rss > 0, st.text.slice(0, 400));
    const bad = await anon.post('/api/auth/login', '{"email": "x@y.test", "password": "secret-in-a-broken-body"');
    check('a malformed JSON body is a 400 with a plain message, not a 500', bad.status === 400 && bad.json && /could not be read/.test(bad.json.error), bad.text.slice(0, 200));
    await sleep(100);
    const errs = await admin.get('/api/ops/errors');
    const logText = fs.existsSync(path.join(env.LOG_DIR, 'errors.jsonl')) ? fs.readFileSync(path.join(env.LOG_DIR, 'errors.jsonl'), 'utf8') : '';
    check('it is in /api/ops/errors as a client error with its route and status', errs.status === 200 && errs.json.recent.some((e) => e.route === '/api/auth/login' && e.kind === 'client' && e.status === 400), errs.text.slice(0, 300));
    check('the error log holds no request body', logText.length > 0 && !logText.includes('secret-in-a-broken-body'));

    // The login gate checks passwords before the router's limit, so it has its own.
    let limited = null;
    for (let i = 0; i < 22 && !limited; i++) {
      const r = await makeClient(s.base).post('/api/auth/login', { email: 'outsider@example.test', password: `guess-${i}` });
      if (r.status === 429) limited = i;
      else if (r.status !== 401) { limited = `unexpected ${r.status}`; break; }
    }
    check('login gate: password guesses on a non-invited account are rate-limited (429 by the 21st)', typeof limited === 'number' && limited <= 20, limited);

    // Sessions survive a restart.
    const meBefore = await joiner.get('/api/auth/me');
    await stop(s);
    s = await startServer(serverFile, env);
    const meAfter = await joiner.get('/api/auth/me');
    check('a signed-in tester is still signed in after a restart (SQLite sessions)', meBefore.json.user && meAfter.json.user && meAfter.json.user.email === 'adult@example.test', meAfter.text.slice(0, 200));
  } finally {
    await stop(s);
  }

  // Production start-up refusals and the trimmed /api/health.
  const prodBase = { ...env, NODE_ENV: 'production', PORT: String(port + 1), SESSION_DB_FILE: path.join(dir, 'prod-sessions.sqlite') };
  const noMail = { ...prodBase };
  delete noMail.MAIL_PROVIDER;
  delete noMail.MAIL_ALLOW_OUTBOX;
  const p1 = exitOf(serverFile, noMail);
  check('production without MAIL_PROVIDER refuses to start', p1.status === 1 && /MAIL_PROVIDER is not set/.test(p1.out), p1.out.slice(-400));
  const p2 = exitOf(serverFile, { ...prodBase, APP_ORIGIN: 'http://app.example.test' });
  check('production with a non-https APP_ORIGIN refuses to start', p2.status === 1 && /APP_ORIGIN must be/.test(p2.out));
  const p3 = exitOf(serverFile, { ...prodBase, APP_ORIGIN: 'https://app.example.test', SESSION_SECRET: 'short' });
  check('production with a short SESSION_SECRET still refuses (existing check)', p3.status === 1 && /SESSION_SECRET/.test(p3.out));
  let ps = null;
  try {
    ps = await startServer(serverFile, { ...prodBase, APP_ORIGIN: 'https://app.example.test' });
    const h = await fetch(`${ps.base}/api/health`).then((r) => r.json());
    check('production: /api/health tells a visitor only { ok: true }', JSON.stringify(h) === '{"ok":true}', h);
    check('production: sessions default to SQLite', /sessions: sqlite/.test(ps.log()));
    const hz = await fetch(`${ps.base}/healthz`);
    check('production: /healthz 200', hz.status === 200);
  } catch (err) {
    check('production server starts with everything set', false, err.message.slice(0, 400));
  } finally { await stop(ps); }

  // The whole app on the SQLite driver.
  if (sqlite) {
    const sdir = path.join(WORK, 'srv-sqlite');
    fs.mkdirSync(sdir);
    const sjson = path.join(sdir, 'db.json');
    fs.copyFileSync(dbFile, sjson);
    const sfile = path.join(sdir, 'db.sqlite');
    const mig = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'migrate-json-to-sqlite.js'), '--from', sjson, '--to', sfile], { encoding: 'utf8', timeout: 300000 });
    check('migrate the test store for the SQLite run', mig.status === 0, mig.stderr);
    fs.unlinkSync(sjson); // the app must now run from SQLite alone
    process.env.BETA_INVITES_FILE = path.join(sdir, 'beta-invites.json');
    const sInv = inv.approve('sqlite-tester@example.test');
    const senv = { ...env, PORT: String(port + 2), DB_DRIVER: 'sqlite', DB_FILE: sjson, DB_SQLITE_FILE: sfile, BETA_INVITES_FILE: process.env.BETA_INVITES_FILE, SESSION_DB_FILE: path.join(sdir, 'sessions.sqlite'), LOG_DIR: path.join(sdir, 'logs'), MAIL_STATE_DIR: sdir };
    let ss = null;
    try {
      ss = await startServer(serverFile, senv, ['--require', hook]);
      const c = makeClient(ss.base);
      const r = await c.post('/api/auth/register', { email: 'sqlite-tester@example.test', password: 'sqlite-pass-1', display_name: 'Sq', birth_year: year - 25, birth_month: 3, country: 'US', invite_code: sInv.code });
      check('SQLite driver: an invited sign-up works through the whole app', r.status === 201, r.text.slice(0, 300));
      const lr = await makeClient(ss.base).post('/api/auth/login', { email: 'adult@example.test', password: 'adult-pass-123' });
      check('SQLite driver: an account made on the JSON store signs in after the migration', lr.status === 200, lr.text.slice(0, 200));
      await sleep(400);
      await stop(ss);
      ss = await startServer(serverFile, senv, ['--require', hook]);
      const l2 = await makeClient(ss.base).post('/api/auth/login', { email: 'sqlite-tester@example.test', password: 'sqlite-pass-1' });
      check('SQLite driver: the new account is still there after a restart', l2.status === 200, l2.text.slice(0, 200));
      check('SQLite driver: no JSON store was written', !fs.existsSync(sjson));
    } catch (err) {
      check('SQLite driver: the app starts', false, err.message.slice(0, 600));
    } finally { await stop(ss); }
    const back = path.join(sdir, 'rollback.json');
    const rev = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'migrate-json-to-sqlite.js'), '--reverse', '--from', sfile, '--to', back], { encoding: 'utf8', timeout: 300000 });
    const has = rev.status === 0 && JSON.parse(fs.readFileSync(back, 'utf8')).users.some((u) => u.email === 'sqlite-tester@example.test');
    check('rollback: the account made on SQLite is in the JSON written back', has, rev.stderr);
  }
}

// ── 8. health watch ──────────────────────────────────────────────────────────

async function healthWatchTests() {
  section('8. Health watch (run from outside the server)');
  let status = 200;
  const srv = http.createServer((req, res) => {
    res.writeHead(req.url === '/healthz' ? status : 404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: status === 200 }));
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  cleanups.push(() => srv.close());
  const url = `http://127.0.0.1:${srv.address().port}`;
  const env = { ...process.env, HEALTH_WATCH_STATE: path.join(WORK, 'health-state.json') };
  delete env.ERROR_ALERT_EMAIL;
  delete env.MAIL_PROVIDER;
  const run = () => new Promise((resolve) => {
    const c = spawn(process.execPath, [path.join(ROOT, 'scripts', 'health-watch.js'), '--url', url, '--tries', '1', '--timeout', '3000'], { env });
    let out = '';
    c.stdout.on('data', (d) => { out += d; });
    c.stderr.on('data', (d) => { out += d; });
    c.on('exit', (code) => resolve({ code, out }));
  });
  const a = await run();
  check('up: exit 0, and the first run only records the state', a.code === 0 && / up/.test(a.out) && !/DOWN|back up/.test(a.out), a.out);
  status = 503;
  const b = await run();
  check('down: exit 1 and one DOWN notice naming the status', b.code === 1 && /Savant is DOWN/.test(b.out) && /HTTP 503/.test(b.out), b.out);
  const c2 = await run();
  check('still down: no second notice', c2.code === 1 && !/Savant is DOWN/.test(c2.out), c2.out);
  status = 200;
  const d = await run();
  check('back: exit 0 and one "back up" notice', d.code === 0 && /Savant is back up/.test(d.out), d.out);
}

(async () => {
  try {
    await mailTests();
    inviteTests();
    await sessionTests();
    errorLogTests();
    const sqlite = await sqliteTests();
    backupTests(sqlite);
    await serverTests(sqlite);
    await healthWatchTests();
  } catch (err) {
    failures++;
    console.log(`  FAIL threw: ${err.stack || err.message}`);
  }
  console.log(`\n${failures ? `${failures} FAILED, ${passes} passed` : `All ${passes} beta-launch checks passed`}.`);
  process.exit(failures ? 1 : 0);
})();
