#!/usr/bin/env node
/**
 * What a bigger store does: boot, memory, one save, and how requests feel with a few learners on it. Measured on this PC.
 *
 *   node scripts/beta-load/size-ladder.js --db <grown file> [--driver json|sqlite] [--learners 30] [--seconds 90] [--heap 4096] [--port 7910] [--think 8000] [--sqlite-file <grown file>]
 *
 * --sqlite-file: a store already on SQLite, for sizes JSON cannot hold (grow-db.js --sqlite). --no-heap leaves Node's default heap limit.
 *
 * Prints one JSON line. A store too big to save, or to boot, says so.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const h = require('./harness');
const { Learner } = require('./learner');

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const SQLITE_FILE = flag('sqlite-file') ? path.resolve(flag('sqlite-file')) : null;
const DB = SQLITE_FILE || path.resolve(flag('db'));
const DRIVER = flag('sqlite-file') ? 'sqlite' : flag('driver', 'json');
const N = Number(flag('learners', 30));
const SECONDS = Number(flag('seconds', 90));
const PORT = Number(flag('port', 7910));
const THINK = Number(flag('think', 8000));
const HEAP = flag('heap', '4096');
const heapArgs = args.includes('--no-heap') ? [] : [`--max-old-space-size=${HEAP}`];

(async () => {
  const dir = h.runDir(`ladder-${DRIVER}`);
  const dbFile = path.join(dir, 'db.json');
  const out = { measured_on: process.env.MEASURED_ON || 'this PC', driver: DRIVER, file_mb: Math.round(fs.statSync(DB).size / 1048576), learners_on_it: N };
  if (!SQLITE_FILE) fs.copyFileSync(DB, dbFile);
  h.copyLedgers(dir);
  const extra = { WRITE_AHEAD: 'off' };
  if (SQLITE_FILE) {
    const sqlite = path.join(dir, 'db.sqlite');
    fs.copyFileSync(SQLITE_FILE, sqlite);
    Object.assign(extra, { DB_DRIVER: 'sqlite', DB_SQLITE_FILE: sqlite });
  } else if (DRIVER === 'sqlite') {
    const sqlite = path.join(dir, 'db.sqlite');
    Object.assign(extra, { DB_DRIVER: 'sqlite', DB_SQLITE_FILE: sqlite });
    const t0 = Date.now();
    const m = spawnSync(process.execPath, [`--max-old-space-size=${HEAP}`, path.join(h.ROOT, 'scripts', 'migrate-json-to-sqlite.js'), '--from', dbFile, '--to', sqlite], { cwd: h.ROOT, env: { ...process.env, DB_FILE: dbFile, DB_SQLITE_FILE: sqlite }, encoding: 'utf8', maxBuffer: 1 << 26 });
    out.migrate = { ms: Date.now() - t0, code: m.status, tail: String(m.stdout || m.stderr).trim().split('\n').slice(-1)[0].slice(0, 120), sqlite_mb: fs.existsSync(sqlite) ? Math.round(fs.statSync(sqlite).size / 1048576) : null };
    if (m.status !== 0) { console.log(JSON.stringify(out)); process.exit(0); }
  }
  const stub = h.startStub(PORT + 1, { latency: 800, jitter: 1200, dir });
  const env = h.serverEnv({ dir, port: PORT, stubPort: PORT + 1, dbFile, extra });
  const t0 = Date.now();
  const srv = await h.startServer(env, { nodeArgs: heapArgs, timeoutMs: 600000 }).catch((e) => ({ failed: e.message }));
  out.boot_ms = Date.now() - t0;
  if (srv.failed || srv.exited) {
    out.boot_failed = srv.failed || srv.exited;
    out.log = fs.readFileSync(path.join(dir, 'server.log'), 'utf8').trim().split('\n').slice(-2).map((l) => l.slice(0, 160));
    stub.kill(); console.log(JSON.stringify(out)); process.exit(0);
  }
  const metrics = new h.Metrics();
  const until = Date.now() + SECONDS * 1000;
  const from = Date.now();
  await Promise.all(Array.from({ length: N }, (_, i) => new Learner(i + 1, srv.url, metrics, { thinkMs: THINK, existing: true }).run(until).catch((e) => metrics.note('crash', e.message))));
  const health = await new h.Client(srv.url).get('/api/health').catch(() => null);
  void health;
  const p = h.probeSummary(path.join(dir, 'probe.jsonl'), from);
  out.overall = metrics.overall();
  out.notes = Object.fromEntries([...metrics.errors].map(([k, v]) => [k, v.n]));
  out.routes = metrics.table().slice(0, 4).map((r) => `${r.route} p50 ${r.p50} p95 ${r.p95}`);
  if (p) Object.assign(out, { rss_mb: p.rss_mb_max, heap_mb: p.heap_mb_end, lag_max_ms: p.lag_max_ms, stalls_over_1s: p.secs_with_stall_over_1s, secs: p.wall_s, save_share: p.save_share_of_time, box_cpu: p.box_cpu_median });
  const log = fs.readFileSync(path.join(dir, 'server.log'), 'utf8').split('\n').filter((l) => /^db:|Invalid string|heap out of memory|FATAL/.test(l)).slice(0, 3).map((l) => l.slice(0, 140));
  out.log = log;
  srv.child.kill('SIGKILL'); stub.kill();
  console.log(JSON.stringify(out));
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
