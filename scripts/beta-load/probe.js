/**
 * Preload for the app server in load tests: node -r ./scripts/beta-load/probe.js server.js
 * Writes one JSON line a second to PROBE_FILE: event-loop delay over that second, memory, CPU, how much of the second the store's
 * save took, its size, and the synchronous ledger writes. Touches no app code: it wraps JSON.stringify (only to time large calls)
 * and fs.writeFileSync/renameSync.
 *
 * Disk-full simulation: PROBE_FAIL_MATCH=<regex> and PROBE_FAIL_FLAG=<file>. While the flag file exists, a write to a matching path
 * lands half its bytes and throws ENOSPC, which is what a full disk does (this PC's real disk is not filled; labelled so).
 */
const fs = require('fs');
const os = require('os');
const { monitorEventLoopDelay, performance } = require('perf_hooks');

const { isMainThread } = require('worker_threads');
const out = isMainThread ? process.env.PROBE_FILE : null;
const dbTmp = () => `${process.env.DB_FILE}.tmp`;
const h = monitorEventLoopDelay({ resolution: 10 }); h.enable();

const cur = { stringifyMs: 0, stringifyN: 0, writeMs: 0, renameMs: 0, bytes: 0, syncLedgerMs: 0, syncLedgerN: 0 };
const realStringify = JSON.stringify;
JSON.stringify = function stringify(v, r, s) {
  const t = performance.now();
  const res = realStringify(v, r, s);
  const d = performance.now() - t;
  if (d > 5) { cur.stringifyMs += d; cur.stringifyN++; }
  return res;
};
const realWrite = fs.writeFileSync;
const realRename = fs.renameSync;
const flag = process.env.PROBE_FAIL_FLAG;
const failRe = process.env.PROBE_FAIL_MATCH ? new RegExp(process.env.PROBE_FAIL_MATCH) : null;
const crashAt = process.env.PROBE_CRASH || '';
const crashFlag = process.env.PROBE_CRASH_FLAG;
const crashNow = () => crashAt && crashFlag && fs.existsSync(crashFlag);
fs.writeFileSync = function writeFileSync(p, data, opts) {
  const isDb = String(p) === dbTmp();
  // A kill with the temp file half written: the bytes reach the disk, then the process is gone.
  if (isDb && crashAt === 'tmp' && crashNow()) { realWrite.call(fs, p, String(data).slice(0, Math.floor(data.length / 2)), opts); process.kill(process.pid, 'SIGKILL'); }
  const isLedger = /ledger\.json|usage\.json/.test(String(p));
  if (failRe && failRe.test(String(p)) && flag && fs.existsSync(flag)) {
    const s = typeof data === 'string' ? data.slice(0, Math.floor(data.length / 2)) : data;
    try { realWrite.call(fs, p, s, opts); } catch { /* ignore */ }
    throw Object.assign(new Error(`ENOSPC: no space left on device, write '${p}'`), { code: 'ENOSPC' });
  }
  const t = performance.now();
  const r = realWrite.call(fs, p, data, opts);
  const d = performance.now() - t;
  if (isDb) { cur.writeMs += d; cur.bytes = Buffer.byteLength(data); }
  if (isLedger) { cur.syncLedgerMs += d; cur.syncLedgerN++; }
  return r;
};
fs.renameSync = function renameSync(a, b) {
  if (String(a) === dbTmp() && crashAt === 'rename' && crashNow()) process.kill(process.pid, 'SIGKILL');
  const t = performance.now();
  const r = realRename.call(fs, a, b);
  if (String(a) === dbTmp()) cur.renameMs += performance.now() - t;
  return r;
};

let lastCpu = process.cpuUsage();
let lastT = performance.now();
let lastElu = performance.eventLoopUtilization();
let lastOs = os.cpus().map((c) => c.times);
const timer = setInterval(() => {
  if (!isMainThread) return;
  const now = performance.now();
  const cpu = process.cpuUsage(lastCpu); lastCpu = process.cpuUsage();
  const m = process.memoryUsage();
  const elu = performance.eventLoopUtilization(lastElu); lastElu = performance.eventLoopUtilization();
  const cpus = os.cpus().map((c) => c.times);
  let busy = 0; let total = 0;
  cpus.forEach((t, i) => { const p = lastOs[i]; const idle = t.idle - p.idle; const all = (t.user - p.user) + (t.nice - p.nice) + (t.sys - p.sys) + (t.irq - p.irq) + idle; busy += all - idle; total += all; });
  lastOs = cpus;
  const line = {
    t: Date.now(),
    cpu_ms: Math.round((process.cpuUsage().user + process.cpuUsage().system) / 1000),
    lag_p50: Math.round(h.percentile(50) / 1e6), lag_p99: Math.round(h.percentile(99) / 1e6), lag_max: Math.round(h.max / 1e6),
    elu: Number(elu.utilization.toFixed(3)),
    proc_cpu: Number(((cpu.user + cpu.system) / 1000 / (now - lastT)).toFixed(3)), box_cpu: total ? Number((busy / total).toFixed(3)) : null,
    rss: m.rss, heap: m.heapUsed, ext: m.external,
    str_ms: Math.round(cur.stringifyMs), str_n: cur.stringifyN, w_ms: Math.round(cur.writeMs), r_ms: Math.round(cur.renameMs), bytes: cur.bytes,
    led_ms: Math.round(cur.syncLedgerMs), led_n: cur.syncLedgerN,
  };
  lastT = now;
  h.reset();
  cur.stringifyMs = 0; cur.stringifyN = 0; cur.writeMs = 0; cur.renameMs = 0; cur.syncLedgerMs = 0; cur.syncLedgerN = 0;
  if (out) try { fs.appendFileSync(out, `${realStringify(line)}\n`); } catch { /* the probe never takes the app down */ }
}, 1000);
timer.unref();

// PROBE_PROFILE_FILE + PROBE_PROFILE_SECONDS: a CPU profile of the app, taken from inside (a Windows kill gives --cpu-prof no chance to write).
if (isMainThread && process.env.PROBE_PROFILE_FILE) {
  const inspector = require('inspector'); // eslint-disable-line global-require
  const session = new inspector.Session();
  session.connect();
  session.post('Profiler.enable', () => session.post('Profiler.setSamplingInterval', { interval: 2000 }, () => session.post('Profiler.start')));
  setTimeout(() => {
    session.post('Profiler.stop', (err, res) => { if (!err) realWrite.call(fs, process.env.PROBE_PROFILE_FILE, realStringify(res.profile)); });
  }, Number(process.env.PROBE_PROFILE_SECONDS || 60) * 1000).unref();
}

// PROBE_WATCHDOG_FILE: a worker records the main thread's stack whenever it has not answered for 3 s.
if (isMainThread && process.env.PROBE_WATCHDOG_FILE) {
  const { Worker } = require('worker_threads'); // eslint-disable-line global-require
  const w = new Worker(require('path').join(__dirname, 'watchdog.js'), { workerData: { file: process.env.PROBE_WATCHDOG_FILE, staleMs: 3000 } }); // eslint-disable-line global-require
  w.unref();
  setInterval(() => w.postMessage(1), 500).unref();
}
