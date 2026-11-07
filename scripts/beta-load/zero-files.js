#!/usr/bin/env node
/**
 * What a hard power-off can leave behind: start the app with each stateful file empty, or cut short, and see what it does. On a COPY, no
 * real model. (A real power-off zeroed five ledgers on this PC on 6 Nov 2026.) Measured on this PC. One boot at a time.
 *   node scripts/beta-load/zero-files.js [--port 7930] [--out <file.json>]
 */
const fs = require('fs');
const path = require('path');
const h = require('./harness');

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const PORT = Number(flag('port', 7930));
const SRC = path.join(h.ROOT, 'data', 'db.json');

async function one(label, { sqlite = false, damage }) {
  const dir = h.runDir('zero');
  const dbFile = path.join(dir, 'db.json');
  fs.copyFileSync(SRC, dbFile);
  h.copyLedgers(dir);
  const extra = { WRITE_AHEAD: 'off', SESSION_DB_FILE: path.join(dir, 'sessions.sqlite') };
  if (sqlite) Object.assign(extra, h.migrateToSqlite(dbFile));
  const env = h.serverEnv({ dir, port: PORT, stubPort: PORT + 1, dbFile, extra, probe: false });
  // A clean start first, so sessions and the like exist, then a sign-up to come back to.
  const stub = h.startStub(PORT + 1, { latency: 100, jitter: 100, dir });
  let srv = await h.startServer(env);
  const c = new h.Client(srv.url, { ip: '10.30.0.1' });
  await c.post('/api/consent/age', { birth_year: 1990, birth_month: 2, country: 'US' });
  await c.post('/api/auth/register', { email: 'zero@example.test', password: 'load-test-password', display_name: 'Zero' });
  await h.sleep(7000); // past the next save
  srv.child.kill('SIGKILL');
  await new Promise((r) => { srv.child.once('exit', r); setTimeout(r, 3000); });
  await h.sleep(300);
  damage(dir, dbFile);
  srv = await h.startServer(env, { timeoutMs: 40000, logName: 'after.log' }).catch((e) => ({ failed: e.message }));
  await h.sleep(800);
  const up = !!(srv.url && !srv.exited && srv.child.exitCode === null);
  const out = { what: label, starts: up };
  if (up) {
    const u = new h.Client(srv.url, { ip: '10.30.0.2' });
    const login = await u.post('/api/auth/login', { email: 'zero@example.test', password: 'load-test-password' });
    out.account_still_there = login.status === 200;
    const t = await u.post('/api/tutor/dock', { messages: [{ role: 'user', content: 'Hello' }], page: { path: '/dashboard' } });
    out.tutor = t.json && t.json.source;
    srv.child.kill('SIGKILL');
    await new Promise((r) => { srv.child.once('exit', r); setTimeout(r, 3000); });
  } else {
    const log = fs.readFileSync(path.join(dir, 'after.log'), 'utf8').split('\n').filter((l) => /Refusing|refus|cannot|Error/i.test(l))[0] || '';
    out.says = log.slice(0, 110);
  }
  stub.kill();
  await h.sleep(300);
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
  console.log(JSON.stringify(out));
  return out;
}

const zero = (f) => fs.writeFileSync(f, '');
const half = (f) => { const b = fs.readFileSync(f); fs.writeFileSync(f, b.subarray(0, Math.floor(b.length / 2))); };

(async () => {
  const results = [];
  const cases = [
    ['JSON store: zero bytes', { damage: (d, db) => zero(db) }],
    ['JSON store: cut short', { damage: (d, db) => half(db) }],
    ['Temp file left, half written', { damage: (d, db) => fs.writeFileSync(`${db}.tmp`, '{"users":[') }],
    ['All ledgers: zero bytes', { damage: (d) => { for (const n of h.LEDGERS) { const f = path.join(d, `${n}-ledger.json`); if (fs.existsSync(f)) zero(f); } } }],
    ['Ledger lock file left behind', { damage: (d) => fs.writeFileSync(path.join(d, 'gonka-ledger.json.lock'), '') }],
    ['Sessions file: zero bytes', { damage: (d) => { zero(path.join(d, 'sessions.sqlite')); for (const x of ['-wal', '-shm']) { try { fs.unlinkSync(path.join(d, `sessions.sqlite${x}`)); } catch { /* */ } } } }],
    ['Sessions file: garbage', { damage: (d) => { fs.writeFileSync(path.join(d, 'sessions.sqlite'), 'not a database at all, not at all'); for (const x of ['-wal', '-shm']) { try { fs.unlinkSync(path.join(d, `sessions.sqlite${x}`)); } catch { /* */ } } } }],
    ['Usage counter: zero bytes', { damage: (d) => zero(path.join(d, 'nvidia-usage.json')) }],
    ['SQLite store: zero bytes', { sqlite: true, damage: (d, db) => { const s = `${db}.sqlite`; zero(s); for (const x of ['-wal', '-shm']) { try { fs.unlinkSync(`${s}${x}`); } catch { /* */ } } } }],
    ['SQLite store: garbage', { sqlite: true, damage: (d, db) => { const s = `${db}.sqlite`; fs.writeFileSync(s, 'x'.repeat(5000)); for (const x of ['-wal', '-shm']) { try { fs.unlinkSync(`${s}${x}`); } catch { /* */ } } } }],
    ['SQLite store: WAL gone', { sqlite: true, damage: (d, db) => { for (const x of ['-wal', '-shm']) { try { fs.unlinkSync(`${db}.sqlite${x}`); } catch { /* */ } } } }],
  ];
  for (const [label, spec] of cases) {
    try { results.push(await one(label, spec)); } catch (e) { results.push({ what: label, crashed: e.message.slice(0, 120) }); console.log(label, 'CRASHED', e.message.slice(0, 120)); }
  }
  const o = flag('out'); if (o) fs.writeFileSync(o, JSON.stringify({ measured_on: 'this PC', results }, null, 1));
  process.exit(0);
})();
