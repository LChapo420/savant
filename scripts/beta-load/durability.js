#!/usr/bin/env node
/**
 * Durability drill on a COPY of the data, with models stubbed. Measured on this PC.
 *
 *   node scripts/beta-load/durability.js [--db <file>] [--rounds 8] [--writers 20] [--port 7830] [--out <file.json>]
 *
 * Rounds:
 *   random kill      the process is killed outright at a random moment while learners answer
 *   mid-flush        killed with the temp file half written (PROBE_CRASH=tmp)
 *   before-rename    killed with the temp file complete, before the rename (PROBE_CRASH=rename)
 *   disk full        every store write fails with ENOSPC for a while (simulated in the probe: this PC's disk is not filled), then clears
 *   disk full + kill killed while the store cannot be written: what the failed saves cost
 *   corrupt boot     the live file is truncated before a start: what the app does
 * After each: does db.json parse, is anything half-written live, are ids and counters sound, which acknowledged answers are gone and
 * how old the oldest lost one was. "Lost" is measured against what the server told the client it had saved (HTTP 200).
 */
const fs = require('fs');
const path = require('path');
const h = require('./harness');

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const ROUNDS = Number(flag('rounds', 8));
const WRITERS = Number(flag('writers', 20));
const PORT = Number(flag('port', 7830));
const SRC = path.resolve(flag('db', path.join(h.ROOT, 'data', 'db.json')));

const SQLITE = args.includes('--sqlite');
function shape(file) {
  const out = { parse_ok: false };
  let d;
  try {
    if (SQLITE) {
      const { DatabaseSync } = require('node:sqlite');
      const sql = new DatabaseSync(`${file}.sqlite`);
      d = { _counters: {} };
      for (const c of sql.prepare('SELECT DISTINCT coll FROM rows').all()) d[c.coll] = sql.prepare('SELECT doc FROM rows WHERE coll = ?').all(c.coll).map((r) => JSON.parse(r.doc));
      for (const c of sql.prepare('SELECT coll, value FROM counters').all()) d._counters[c.coll] = c.value;
      sql.close();
    } else d = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) { out.error = e.message; return { out, d: null }; }
  out.parse_ok = true;
  let dupes = 0; let badCounters = 0;
  for (const k of Object.keys(d)) {
    if (!Array.isArray(d[k])) continue;
    const seen = new Set(); let max = 0;
    for (const r of d[k]) { if (r && r.id != null) { if (seen.has(r.id)) dupes++; seen.add(r.id); if (r.id > max) max = r.id; } }
    if (d._counters && Number(d._counters[k]) < max) badCounters++;
  }
  const users = new Set(d.users.map((u) => u.id));
  const sessions = new Set(d.sessions.map((s) => s.id));
  out.orphan_items = d.items.filter((i) => i.session_id != null && !sessions.has(i.session_id)).length;
  out.orphan_enrollments = d.enrollments.filter((e) => !users.has(e.user_id)).length;
  out.dup_ids = dupes; out.bad_counters = badCounters;
  out.users = d.users.length; out.items = d.items.length;
  return { out, d };
}

class Writer {
  constructor(i, base, tag) { this.c = new h.Client(base, { ip: `10.9.${i >> 8}.${(i & 255) || 1}` }); this.i = i; this.tag = tag; this.acks = []; this.stop = false; }

  async setup() {
    await this.c.post('/api/consent/age', { birth_year: 1990, birth_month: 1, country: 'US' });
    const r = await this.c.post('/api/auth/register', { email: `dur${this.tag}${this.i}@example.test`, password: 'load-test-password', display_name: `W ${this.i}` });
    if (r.status !== 201) throw new Error(`register ${r.status} ${JSON.stringify(r.json)}`);
    this.id = r.json.user.id;
    const cat = await this.c.get('/api/catalog');
    this.grades = [];
    for (const t of cat.json.tracks) if (['math', 'reading', 'iq', 'english'].includes(t.id)) for (const g of t.grades) this.grades.push({ track_id: t.id, grade_id: g.id });
  }

  async run() {
    // A placement in one grade after another: real answers, each acknowledged by the server, as fast as it will take them.
    let g = 0;
    while (!this.stop) {
      const e = await this.c.post('/api/enrollments', { selections: [this.grades[(g++) % this.grades.length]] });
      if (e.status === -1) return;
      const id = e.json && e.json.created && e.json.created[0] && e.json.created[0].id;
      if (!id) { if (g > this.grades.length) return; continue; }
      const s = await this.c.post('/api/placement/start', { enrollment_id: id });
      if (s.status === 429 || s.status === -1 || !s.json.items) { await h.sleep(50); if (s.status === -1) return; continue; }
      for (const item of s.json.items) {
        if (this.stop) return;
        const a = await this.c.post('/api/placement/answer', { session_id: s.json.session_id, item_id: item.id, answer: item.choices ? item.choices[0] : '1', ms: 3000 });
        if (a.status === 200) this.acks.push({ item: item.id, at: Date.now() });
        else if (a.status === -1) return;
      }
      await this.c.post('/api/placement/finish', { session_id: s.json.session_id });
    }
  }
}

function lossOf(writers, d, killAt) {
  const answered = new Set(d.items.filter((i) => i.correct !== null && i.correct !== undefined).map((i) => i.id));
  let acks = 0; let lost = 0; let oldest = 0;
  for (const w of writers) {
    for (const a of w.acks) {
      acks++;
      if (!answered.has(a.item)) { lost++; oldest = Math.max(oldest, killAt - a.at); }
    }
  }
  return { acked: acks, lost, oldest_lost_ms: oldest };
}

async function round(kind, opts = {}) {
  const dir = h.runDir(`dur-${kind.replace(/\W+/g, '-')}`);
  const dbFile = path.join(dir, 'db.json');
  fs.copyFileSync(SRC, dbFile);
  h.copyLedgers(dir);
  const flagFile = path.join(dir, 'fail.flag');
  const crashFlag = path.join(dir, 'crash.flag');
  const stub = h.startStub(PORT + 1, { latency: 300, jitter: 300, dir });
  const env = h.serverEnv({ dir, port: PORT, stubPort: PORT + 1, dbFile, extra: {
    WRITE_AHEAD: 'off',
    ...(SQLITE ? h.migrateToSqlite(dbFile) : {}),
    PROBE_FAIL_MATCH: opts.diskFull ? 'db\\.json' : '', PROBE_FAIL_FLAG: flagFile,
    PROBE_CRASH: opts.crash || '', PROBE_CRASH_FLAG: crashFlag,
  } });
  const srv = await h.startServer(env);
  const result = { kind, boot_ms: srv.bootMs };
  const writers = Array.from({ length: WRITERS }, (_, i) => new Writer(i + 1, srv.url, Date.now() % 100000));
  await Promise.all(writers.map((w) => w.setup()));
  const runs = writers.map((w) => w.run().catch(() => {}));
  await h.sleep(opts.warmMs || 6000 + Math.random() * 10000);
  let exited = false;
  srv.child.once('exit', () => { exited = true; });

  if (opts.diskFull) {
    fs.writeFileSync(flagFile, '1');
    const before = writers.reduce((n, w) => n + w.acks.length, 0);
    await h.sleep(opts.fullMs || 6000);
    const during = writers.reduce((n, w) => n + w.acks.length, 0) - before;
    const health = await new h.Client(srv.url).get('/api/health');
    result.during_full = { answers_acknowledged: during, server_up: !exited, health_says_ok: !!(health.json && health.json.ok), tmp_exists: fs.existsSync(`${dbFile}.tmp`) };
    if (fs.existsSync(`${dbFile}.tmp`)) result.during_full.tmp_bytes = fs.statSync(`${dbFile}.tmp`).size;
    const live = shape(dbFile).out;
    result.during_full.live_file_parses = live.parse_ok;
    if (opts.killWhileFull) {
      const killAt = Date.now();
      srv.child.kill('SIGKILL');
      await new Promise((r) => { srv.child.once('exit', r); setTimeout(r, 5000); });
      for (const w of writers) w.stop = true;
      await Promise.all(runs);
      const { out, d } = shape(dbFile);
      result.after = out;
      if (d) result.loss = lossOf(writers, d, killAt);
    } else {
      fs.unlinkSync(flagFile);
      for (const w of writers) w.stop = true;
      await Promise.all(runs);
      await h.sleep(7000); // the retry backs off to 5 s
      const killAt = Date.now();
      srv.child.kill('SIGKILL');
      await new Promise((r) => { srv.child.once('exit', r); setTimeout(r, 5000); });
      const { out, d } = shape(dbFile);
      result.after = out;
      if (d) result.loss = lossOf(writers, d, killAt);
      result.log = fs.readFileSync(path.join(dir, 'server.log'), 'utf8').split('\n').filter((l) => /^db:/.test(l)).slice(0, 4);
    }
  } else if (opts.crash) {
    fs.writeFileSync(crashFlag, '1');
    await new Promise((r) => { if (exited) r(); else { srv.child.once('exit', r); setTimeout(r, 15000); } });
    const killAt = Date.now();
    for (const w of writers) w.stop = true;
    await Promise.all(runs);
    const { out, d } = shape(dbFile);
    result.after = out;
    result.crashed_as_planned = exited;
    if (d) result.loss = lossOf(writers, d, killAt);
  } else {
    const killAt = Date.now();
    srv.child.kill('SIGKILL');
    await new Promise((r) => { srv.child.once('exit', r); setTimeout(r, 5000); });
    for (const w of writers) w.stop = true;
    await Promise.all(runs);
    const { out, d } = shape(dbFile);
    result.after = out;
    if (d) result.loss = lossOf(writers, d, killAt);
  }
  result.tmp_left = fs.existsSync(`${dbFile}.tmp`);

  // Restart on what is on disk: does it boot, is everyone still there, is the cookie still good?
  const restartEnv = { ...env, PROBE_CRASH: '', PROBE_FAIL_MATCH: '' };
  const cookie = writers[0].c.cookie;
  const again = await h.startServer(restartEnv, { logName: 'server2.log' });
  result.restart = { boot_ms: again.bootMs, up: !again.exited };
  if (!again.exited) {
    const c = new h.Client(again.url); c.cookie = cookie;
    const me = await c.get('/api/auth/me');
    result.restart.still_signed_in = !!(me.json && me.json.user);
    const re = new h.Client(again.url, { ip: '10.8.0.1' });
    const login = await re.post('/api/auth/login', { email: `dur${writers[0].tag}1@example.test`, password: 'load-test-password' });
    result.restart.login_status = login.status;
    again.child.kill('SIGKILL');
    await new Promise((r) => { again.child.once('exit', r); setTimeout(r, 3000); });
  }
  stub.kill();
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* the OS may still hold a file */ }
  return result;
}

/** A truncated live file at start: what does the app do with it? */
async function corruptBoot() {
  const dir = h.runDir('dur-corrupt');
  const dbFile = path.join(dir, 'db.json');
  const text = fs.readFileSync(SRC);
  fs.writeFileSync(dbFile, text.subarray(0, Math.floor(text.length / 2)));
  h.copyLedgers(dir);
  const env = h.serverEnv({ dir, port: PORT, dbFile });
  const srv = await h.startServer(env, { timeoutMs: 60000 }).catch((e) => ({ failed: e.message }));
  await h.sleep(1500);
  const res = { kind: 'corrupt boot', up: !!(srv.url && !srv.exited && srv.child.exitCode === null), exited: srv.exited || (srv.child && srv.child.exitCode !== null ? { code: srv.child.exitCode } : null) };
  if (res.up) {
    await h.sleep(1500);
    const c = new h.Client(srv.url, { ip: '10.8.0.2' });
    const reg = await c.post('/api/auth/login', { email: 'nobody@example.test', password: 'x'.repeat(9) });
    res.login_status = reg.status;
    srv.child.kill('SIGKILL');
    await new Promise((r) => { srv.child.once('exit', r); setTimeout(r, 3000); });
    const left = fs.readdirSync(dir).filter((f) => /corrupt/.test(f));
    res.kept_copy = left;
    const now = shape(dbFile);
    res.users_after_start = now.d ? now.d.users.length : null;
  }
  res.log = fs.readFileSync(path.join(dir, 'server.log'), 'utf8').split('\n').filter((l) => /unreadable|Refusing|corrupt/i.test(l)).slice(0, 3).map((l) => l.slice(0, 200));
  return res;
}

(async () => {
  const results = [];
  const say = (r) => { results.push(r); console.log(JSON.stringify(r)); };
  for (let i = 0; i < ROUNDS; i++) say(await round('random kill'));
  if (!SQLITE) {
    for (let i = 0; i < Math.ceil(ROUNDS / 2); i++) say(await round('mid-flush', { crash: 'tmp' }));
    for (let i = 0; i < 2; i++) say(await round('before-rename', { crash: 'rename' }));
    say(await round('disk full, then clears', { diskFull: true }));
    say(await round('disk full, then killed', { diskFull: true, killWhileFull: true }));
    say(await corruptBoot());
  }
  const out = flag('out');
  if (out) fs.writeFileSync(out, JSON.stringify({ measured_on: 'this PC', db_bytes: fs.statSync(SRC).size, results }, null, 1));
  const kills = results.filter((r) => r.loss);
  console.log(`worst loss: ${Math.max(...kills.map((r) => r.loss.lost))} answers, oldest ${Math.max(...kills.map((r) => r.loss.oldest_lost_ms))} ms; every file parsed: ${kills.every((r) => r.after.parse_ok)}`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
