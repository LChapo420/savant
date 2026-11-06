#!/usr/bin/env node
/**
 * The load test: N scripted learners against a local server on a COPY of the data, models stubbed. Measured on this PC.
 *
 *   node scripts/beta-load/load-run.js --learners 100 --minutes 5 --think 8000 [--ramp 60] [--db <file>] [--port 7810] [--tag x]
 *        [--session sqlite] [--env KEY=VALUE ...] [--prof]
 *
 * --ramp: seconds over which learners arrive (0 = all at once, the invite email). Writes report.json into its run folder and prints
 * a summary. Exit 0 whether or not it went well: the report says what happened.
 */
const fs = require('fs');
const path = require('path');
const h = require('./harness');
const { Learner } = require('./learner');

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const has = (n) => args.includes(`--${n}`);
const extras = {};
args.forEach((a, i) => { if (a === '--env') { const [k, ...v] = args[i + 1].split('='); extras[k] = v.join('='); } });

(async () => {
  const learners = Number(flag('learners', 10));
  const minutes = Number(flag('minutes', 1));
  const thinkMs = Number(flag('think', 8000));
  const ramp = Number(flag('ramp', 60));
  const port = Number(flag('port', 7810));
  const stubPort = port + 1;
  const dir = h.runDir(`load-${learners}${flag('tag', '') ? `-${flag('tag')}` : ''}`);
  const dbSrc = path.resolve(flag('db', path.join(h.ROOT, 'data', 'db.json')));
  const dbFile = path.join(dir, 'db.json');
  fs.copyFileSync(dbSrc, dbFile);
  h.copyLedgers(dir);
  const stub = h.startStub(stubPort, { latency: Number(flag('stub-latency', 1500)), jitter: Number(flag('stub-jitter', 2500)), dir });
  const env = h.serverEnv({ dir, port, stubPort, dbFile, extra: extras });
  const nodeArgs = [];
  if (has('prof')) { env.PROBE_PROFILE_FILE = path.join(dir, 'app.cpuprofile'); env.PROBE_PROFILE_SECONDS = String(Math.max(20, Math.round(minutes * 60 - 10))); }
  if (flag('heap')) nodeArgs.push(`--max-old-space-size=${flag('heap')}`);
  const srv = await h.startServer(env, { nodeArgs });
  if (srv.exited) { console.log(JSON.stringify({ dir, bootFailed: srv.exited })); stub.kill(); process.exit(0); }
  console.log(`dir ${dir}\nboot ${srv.bootMs} ms, ${learners} learners, ${minutes} min, think ${thinkMs} ms, ramp ${ramp} s`);

  const metrics = new h.Metrics();
  const t0 = Date.now();
  const until = t0 + minutes * 60000;
  const tasks = [];
  for (let i = 0; i < learners; i++) {
    const delay = ramp > 0 ? (i / learners) * ramp * 1000 : 0;
    const l = new Learner(i + 1, srv.url, metrics, { thinkMs, tag: flag('tag', '') });
    tasks.push(h.sleep(delay).then(() => l.run(until)).catch((e) => metrics.note('learner crash', e.stack)));
  }
  let crashed = false; let stopping = false;
  srv.child.on('exit', (code, sig) => { if (!stopping) crashed = { code, sig, afterS: Math.round((Date.now() - t0) / 1000) }; });
  // Progress for a watcher.
  const tick = setInterval(() => {
    const o = metrics.overall();
    console.log(`${Math.round((Date.now() - t0) / 1000)}s req=${o.requests} p95=${o.p95} err=${o.server_errors}`);
  }, 30000);
  await Promise.race([Promise.all(tasks), h.sleep(minutes * 60000 + 240000)]);
  clearInterval(tick);

  let stubStats = null;
  try { stubStats = await (await fetch(`http://127.0.0.1:${stubPort}/__stub/stats`)).json(); } catch { /* gone */ }
  await h.sleep(1500);
  const dbNow = fs.existsSync(dbFile) ? fs.statSync(dbFile).size : null;
  const shut = Date.now();
  stopping = true;
  srv.child.kill('SIGTERM');
  await new Promise((r) => { srv.child.once('exit', r); setTimeout(r, 60000); });
  const shutMs = Date.now() - shut;
  stub.kill();
  const report = {
    measured_on: 'this PC (not the server)', learners, minutes, think_ms: thinkMs, ramp_s: ramp, dir, boot_ms: srv.bootMs, crashed, shutdown_ms: shutMs,
    overall: metrics.overall(), routes: metrics.table(), notes: Object.fromEntries(metrics.errors),
    probe: h.probeSummary(path.join(dir, 'probe.jsonl'), t0),
    db_bytes_start: fs.statSync(dbSrc).size, db_bytes_end: dbNow,
    stub: stubStats && { calls: stubStats.calls, maxInflight: stubStats.maxInflight, byProvider: stubStats.byProvider },
  };
  fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(report, null, 1));
  console.log(JSON.stringify({ overall: report.overall, probe: report.probe, crashed, notes: report.notes, db_bytes_end: dbNow, stub: stubStats && Object.fromEntries(Object.entries(stubStats.byProvider).map(([k, v]) => [k, v.calls])) }, null, 1));
  console.log('slowest routes:');
  for (const r of report.routes.slice(0, 14)) console.log(`  ${r.route.padEnd(38)} n=${String(r.n).padEnd(6)} p50=${r.p50} p95=${r.p95} p99=${r.p99} max=${r.max} ${JSON.stringify(r.statuses)}`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
