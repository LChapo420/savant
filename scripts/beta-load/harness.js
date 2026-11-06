/**
 * Shared parts of the beta load tools: a clean environment for a local app server (no real key can leak in, every data file in a
 * temp folder), starting and stopping it, and a tiny HTTP client that behaves like the browser behind the proxy.
 *
 * Never reads the live data folder except to COPY the ledgers at the start of a run. Never writes outside the run folder.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const LIVE_DATA = 'C:/coding/claudecommittdIq/folderThing/iq-max-repo-2-claude-adoring-mayer-woc9sq/data';
const LEDGERS = ['anthropic', 'coral', 'gladia', 'gonka', 'grokified', 'lyceum', 'munito', 'standard-compute', 'zerogpu', 'llmgateway'];
const STUBBED = ['GONKA', 'MUNITO', 'CORAL', 'GROKIFIED', 'LYCEUM', 'ZEROGPU'];

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

function runDir(label) {
  const dir = path.join(os.tmpdir(), 'beta-load', `${label}-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** The ledgers as they stand now, copied into the run folder (only copies are ever charged). */
function copyLedgers(dir, from = LIVE_DATA) {
  for (const n of LEDGERS) {
    const src = path.join(from, `${n}-ledger.json`);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dir, `${n}-ledger.json`));
  }
}

/**
 * The server's whole environment, built from nothing: the real .env is at a different path, and dotenv in server.js looks in the
 * worktree, which has none. stub=true points every OpenAI-compatible provider at the local stub.
 */
function serverEnv({ dir, port, stubPort = null, dbFile, extra = {}, probe = true }) {
  const env = {
    PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: dir, TMP: dir, HOME: dir, USERPROFILE: process.env.USERPROFILE,
    NODE_ENV: 'production', PORT: String(port), TRUST_PROXY: '1',
    SESSION_SECRET: 'load-test-only-secret-load-test-only-secret-0123456789',
    DB_FILE: dbFile,
    ADMIN_EMAILS: 'load-admin@example.test', OWNER_EMAIL: 'load-owner@example.test', OWNER_LEARNER_EMAILS: 'load-owner-learner@example.test',
    COST_TRACKER_DIR: path.join(dir, 'cost-tracker'),
    NVIDIA_USAGE_FILE: path.join(dir, 'nvidia-usage.json'),
    FREE_TIER_EVIDENCE_FILE: path.join(dir, 'free-evidence.json'),
    MAIL_OUTBOX_DIR: path.join(dir, 'outbox'),
    MAIL_STATE_DIR: dir,
    LOG_DIR: path.join(dir, 'logs'),
    OLLAMA_ENABLED: '0',
    BETA_REPORT_DAILY: 'off',
    NODE_OPTIONS: '',
  };
  for (const n of LEDGERS) env[`${n.toUpperCase().replace('-', '_')}_LEDGER_FILE`] = path.join(dir, `${n}-ledger.json`);
  if (stubPort) {
    const base = `http://127.0.0.1:${stubPort}/v1`;
    env.NVIDIA_API_KEY = 'stub-nvidia'; env.NVIDIA_BASE_URL = base;
    for (const p of STUBBED) { env[`${p}_API_KEY`] = `stub-${p.toLowerCase()}`; env[`${p}_BASE_URL`] = base; }
  }
  if (probe) env.PROBE_FILE = path.join(dir, 'probe.jsonl');
  return { ...env, ...extra };
}

/** Start the app server from the worktree and wait until it answers. */
async function startServer(env, { nodeArgs = [], logName = 'server.log', timeoutMs = 240000 } = {}) {
  const log = fs.openSync(path.join(env.TEMP, logName), 'a');
  const args = [...nodeArgs, ...(env.PROBE_FILE ? ['-r', path.join(__dirname, 'probe.js')] : []), 'server.js'];
  const child = spawn(process.execPath, args, { cwd: ROOT, env, stdio: ['ignore', log, log] });
  // Other agents share this PC: above normal keeps the measurement about this app rather than about them, for the short length of a run.
  try { os.setPriority(child.pid, os.constants.priority.PRIORITY_ABOVE_NORMAL); } catch { /* best effort */ }
  const url = `http://127.0.0.1:${env.PORT}`;
  const t0 = Date.now();
  let exited = null;
  child.on('exit', (code, sig) => { exited = { code, sig }; });
  while (Date.now() - t0 < timeoutMs) {
    if (exited) return { child, url, bootMs: Date.now() - t0, exited };
    try { const r = await fetch(`${url}/api/auth/me`); if (r.status === 200) return { child, url, bootMs: Date.now() - t0 }; } catch { /* not yet */ }
    await sleep(200);
  }
  child.kill();
  throw new Error(`server did not start in ${timeoutMs} ms; see ${env.TEMP}\\${logName}`);
}

function startStub(port, { latency = 1500, jitter = 2500, dir = os.tmpdir() } = {}) {
  const log = fs.openSync(path.join(dir, 'stub.log'), 'a');
  return spawn(process.execPath, [path.join(__dirname, 'stub-models.js'), '--port', String(port), '--latency', String(latency), '--jitter', String(jitter)], { stdio: ['ignore', log, log] });
}

/** One browser's worth of session: a cookie, an address, and timing by route label. */
class Client {
  constructor(base, { ip = '10.0.0.1', metrics = null } = {}) { this.base = base; this.ip = ip; this.cookie = ''; this.metrics = metrics; }

  async call(method, url, body, label = null, { raw = null, contentType = null } = {}) {
    const t0 = performance.now();
    let status = 0; let json = null;
    try {
      const res = await fetch(`${this.base}${url}`, {
        method,
        headers: {
          'X-Forwarded-For': this.ip, 'X-Forwarded-Proto': 'https', Origin: this.base,
          ...(this.cookie ? { Cookie: this.cookie } : {}),
          ...(raw ? { 'Content-Type': contentType || 'application/octet-stream' } : body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: raw || (body !== undefined ? JSON.stringify(body) : undefined),
      });
      status = res.status;
      const sc = res.headers.get('set-cookie');
      if (sc) this.cookie = sc.split(';')[0];
      const text = await res.text();
      try { json = JSON.parse(text); } catch { json = text; }
    } catch (err) {
      status = -1; json = { error: err.message };
    }
    const ms = performance.now() - t0;
    if (this.metrics) this.metrics.add(label || `${method} ${url}`, ms, status);
    return { status, json, ms };
  }

  get(url, label) { return this.call('GET', url, undefined, label); }

  post(url, body, label) { return this.call('POST', url, body === undefined ? {} : body, label); }
}

class Metrics {
  constructor() { this.routes = new Map(); this.errors = new Map(); this.t0 = Date.now(); }

  add(label, ms, status) {
    let r = this.routes.get(label);
    if (!r) { r = { n: 0, ms: [], statuses: {} }; this.routes.set(label, r); }
    r.n++; r.ms.push(ms); r.statuses[status] = (r.statuses[status] || 0) + 1;
  }

  note(kind, detail) {
    const e = this.errors.get(kind) || { n: 0, sample: null };
    e.n++; if (!e.sample) e.sample = detail; this.errors.set(kind, e);
  }

  table() {
    const pct = (a, p) => (a.length ? a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))] : 0);
    const out = [];
    for (const [label, r] of this.routes) {
      const a = [...r.ms].sort((x, y) => x - y);
      out.push({ route: label, n: r.n, p50: Math.round(pct(a, 50)), p95: Math.round(pct(a, 95)), p99: Math.round(pct(a, 99)), max: Math.round(a[a.length - 1]), statuses: r.statuses });
    }
    return out.sort((a, b) => b.p95 - a.p95);
  }

  overall() {
    const pct = (a, p) => (a.length ? a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))] : 0);
    const all = []; let bad = 0; let n = 0;
    for (const r of this.routes.values()) { for (const m of r.ms) all.push(m); n += r.n; for (const [s, c] of Object.entries(r.statuses)) if (Number(s) >= 500 || Number(s) < 0) bad += c; }
    all.sort((a, b) => a - b);
    const secs = (Date.now() - this.t0) / 1000;
    return { requests: n, rps: Number((n / secs).toFixed(1)), p50: Math.round(pct(all, 50)), p95: Math.round(pct(all, 95)), p99: Math.round(pct(all, 99)), max: Math.round(all[all.length - 1] || 0), server_errors: bad };
  }
}

/** Summarise a probe file: event-loop stalls, memory, save cost. */
function probeSummary(file, fromMs = 0) {
  if (!fs.existsSync(file)) return null;
  const rows = fs.readFileSync(file, 'utf8').trim().split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((r) => r && r.t >= fromMs);
  if (!rows.length) return null;
  const q = (k, p) => { const a = rows.map((r) => r[k]).sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };
  const sum = (k) => rows.reduce((n, r) => n + (r[k] || 0), 0);
  const secs = rows.length;
  return {
    secs,
    wall_s: Math.round((rows[rows.length - 1].t - rows[0].t) / 1000), cpu_s: rows[0].cpu_ms != null ? Math.round((rows[rows.length - 1].cpu_ms - rows[0].cpu_ms) / 1000) : null,
    lag_p99_median_ms: q('lag_p99', 0.5), lag_p99_p95_ms: q('lag_p99', 0.95), lag_max_ms: Math.max(...rows.map((r) => r.lag_max)),
    secs_with_stall_over_200ms: rows.filter((r) => r.lag_max > 200).length, secs_with_stall_over_1s: rows.filter((r) => r.lag_max > 1000).length,
    loop_busy_median: q('elu', 0.5), proc_cpu_median: q('proc_cpu', 0.5), box_cpu_median: q('box_cpu', 0.5),
    rss_mb_end: Math.round(rows[rows.length - 1].rss / 1048576), rss_mb_max: Math.round(Math.max(...rows.map((r) => r.rss)) / 1048576), heap_mb_end: Math.round(rows[rows.length - 1].heap / 1048576),
    save_share_of_time: Number(((sum('str_ms') + sum('w_ms') + sum('r_ms')) / (Math.max(1, rows[rows.length - 1].t - rows[0].t))).toFixed(3)),
    save_stringify_ms_per_sec: Math.round(sum('str_ms') / secs), save_write_ms_per_sec: Math.round(sum('w_ms') / secs),
    db_bytes_end: rows.map((r) => r.bytes).filter(Boolean).slice(-1)[0] || null,
    ledger_write_ms_per_sec: Math.round(sum('led_ms') / secs), ledger_writes_per_sec: Number((sum('led_n') / secs).toFixed(1)),
  };
}

module.exports = { ROOT, LIVE_DATA, LEDGERS, STUBBED, sleep, runDir, copyLedgers, serverEnv, startServer, startStub, Client, Metrics, probeSummary };
