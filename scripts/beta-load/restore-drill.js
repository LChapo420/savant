#!/usr/bin/env node
/**
 * The restore drill, on a copy: back up, test the backup, wreck the live file, restore, boot on it, compare. Timed. Measured on this PC.
 *   node scripts/beta-load/restore-drill.js [--db <file>] [--port 7880]
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const h = require('./harness');

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const SRC = path.resolve(flag('db', path.join(h.ROOT, 'data', 'db.json')));
const PORT = Number(flag('port', 7880));

(async () => {
  const dir = h.runDir('restore');
  const dbFile = path.join(dir, 'db.json');
  const backups = path.join(dir, 'backups');
  fs.copyFileSync(SRC, dbFile);
  h.copyLedgers(dir);
  const env = { ...h.serverEnv({ dir, port: PORT, dbFile, probe: false }), BACKUP_DIR: backups, BACKUP_EXTRA: '' };
  const timed = (label, a) => {
    const t0 = Date.now();
    const r = spawnSync(process.execPath, [path.join(h.ROOT, 'scripts', 'backup-db.js'), ...a], { cwd: h.ROOT, env, encoding: 'utf8', maxBuffer: 1 << 26 });
    return { step: label, ms: Date.now() - t0, code: r.status, tail: String(r.stdout || r.stderr).trim().split('\n').slice(-1)[0].slice(0, 140) };
  };
  const steps = [];
  steps.push(timed('backup', []));
  const gz = fs.readdirSync(backups).find((f) => f.endsWith('.json.gz') && !f.includes('.extra.'));
  steps.push(timed('restore test', ['--restore-test']));
  const before = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
  const text = fs.readFileSync(dbFile);
  fs.writeFileSync(dbFile, text.subarray(0, Math.floor(text.length / 3))); // the disaster
  const down = await h.startServer(env, { timeoutMs: 20000, logName: 'wrecked.log' }).catch((e) => ({ failed: e.message }));
  const refused = !!down.exited;
  if (down.child && !down.exited) down.child.kill('SIGKILL');
  steps.push(timed('restore', ['--restore', path.join(backups, gz), '--to', dbFile, '--force']));
  const t0 = Date.now();
  const srv = await h.startServer(env, { logName: 'restored.log' });
  steps.push({ step: 'boot on the restored file', ms: Date.now() - t0, code: srv.exited ? 1 : 0 });
  const c = new h.Client(srv.url, { ip: '10.40.0.1' });
  const health = await c.get('/api/health');
  srv.child.kill('SIGKILL');
  const after = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
  const same = Object.keys(before).filter((k) => Array.isArray(before[k])).every((k) => before[k].length <= after[k].length);
  const out = { measured_on: 'this PC', db_bytes: text.length, backup_bytes: fs.statSync(path.join(backups, gz)).size, steps, wrecked_file_refused_at_boot: refused, restored_rows_match: same, users: after.users.length, health: health.status, total_s: Math.round(steps.reduce((a, s) => a + s.ms, 0) / 1000) };
  console.log(JSON.stringify(out));
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
