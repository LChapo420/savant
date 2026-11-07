#!/usr/bin/env node
/**
 * A really full disk: the store on a small file system (a tmpfs the caller mounts), filled until saves fail with ENOSPC, then room again, then SIGKILL so
 * only what reached the disk counts. Synthetic rows only. Prints what happened; exit 0 if nothing the app kept was lost.
 *
 *   node scripts/beta-load/full-disk.js <folder on the small file system> json|sqlite [driver file]
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const [folder, driver, driverFile] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

if (process.env.FULL_DISK_CHILD) {
  const db = require(driverFile || path.join(__dirname, '..', '..', 'config', 'db.js'));
  const filler = path.join(folder, 'filler');
  const made = [];
  (async () => {
    made.push(db.insert('reports', { user_id: 1, note: 'first' }).id);
    db.saveSoon();
    await sleep(600);
    // Fill the disk but for a little, so the next saves are the ones that fail.
    const free = () => { const s = fs.statfsSync(folder); return Number(s.bavail) * Number(s.bsize); };
    fs.writeFileSync(filler, Buffer.alloc(Math.max(0, free() - 2 * 1048576), 1));
    let tries = 0;
    while (db.saveState().saving && tries < 200) {
      for (let i = 0; i < 5; i++) made.push(db.insert('reports', { user_id: 2, note: 'x'.repeat(300000) }).id);
      db.saveSoon();
      await sleep(400);
      tries++;
    }
    const during = db.saveState();
    const inMemoryAtFailure = made.length;
    made.push(db.insert('reports', { user_id: 3, note: 'made while the disk was full' }).id);
    await sleep(1500);
    fs.unlinkSync(filler);
    const t0 = Date.now();
    while (!db.saveState().saving && Date.now() - t0 < 30000) { db.saveSoon(); await sleep(200); }
    const after = db.saveState();
    await sleep(800);
    process.stdout.write(`${JSON.stringify({ during, after, recovered_in_ms: Date.now() - t0, inMemoryAtFailure, made })}\n`);
    process.kill(process.pid, 'SIGKILL');
  })().catch((e) => { process.stdout.write(`${JSON.stringify({ crashed: e.message })}\n`); process.exit(1); });
} else {
  const env = { ...process.env, FULL_DISK_CHILD: '1', NODE_ENV: 'production', DB_FILE: path.join(folder, 'db.json'), DB_SQLITE_SWEEP_MS: '0' };
  if (driver === 'sqlite') Object.assign(env, { DB_DRIVER: 'sqlite', DB_SQLITE_FILE: path.join(folder, 'db.sqlite') });
  else env.DB_DRIVER = '';
  const c = spawnSync(process.execPath, ['--no-warnings', __filename, folder, driver, ...(driverFile ? [path.resolve(driverFile)] : [])], { env, encoding: 'utf8', timeout: 120000, maxBuffer: 1 << 24 });
  const line = String(c.stdout).trim().split('\n').filter(Boolean)[0];
  let r;
  try { r = JSON.parse(line); } catch { console.log(JSON.stringify({ driver, no_result: String(c.stdout).slice(0, 200), err: String(c.stderr).slice(0, 300), signal: c.signal })); process.exit(1); }
  const have = new Set();
  let integrity = null;
  if (driver === 'sqlite') {
    const { DatabaseSync } = require('node:sqlite');
    const d = new DatabaseSync(path.join(folder, 'db.sqlite'));
    integrity = Object.values(d.prepare('PRAGMA integrity_check').get())[0];
    for (const row of d.prepare("SELECT id FROM rows WHERE coll = 'reports'").all()) have.add(row.id);
    d.close();
  } else {
    for (const row of JSON.parse(fs.readFileSync(path.join(folder, 'db.json'), 'utf8')).reports) have.add(row.id);
  }
  const lost = (r.made || []).filter((id) => !have.has(id)).length;
  console.log(JSON.stringify({ driver, rows_made: (r.made || []).length, on_disk: have.size, lost, integrity, saving_failed_while_full: r.during && !r.during.saving, failed_attempts: r.during && r.during.failed_attempts, saved_again: r.after && r.after.saving, recovered_in_ms: r.recovered_in_ms, stderr: String(c.stderr).split('\n').filter((l) => /db:/.test(l)).slice(0, 2).map((l) => l.slice(0, 100)) }));
  process.exit(lost ? 1 : 0);
}
