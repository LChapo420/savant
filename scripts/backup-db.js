#!/usr/bin/env node
/**
 * Daily backup of the data store, a restore test, and a restore.
 * (curriculum-build/BETA-LAUNCH-KIT.md section 2.)
 *
 *   node scripts/backup-db.js                 take a backup now, then prune old ones
 *   node scripts/backup-db.js --restore-test  check the newest backup end to end:
 *        unzip to a temp file, match the checksum, parse, check every collection's
 *        ids and counters, then load it through the app's own config/db.js
 *        (read-only, in a child process) and compare row counts. Exit 1 on any
 *        mismatch. The result is kept in <backup dir>/restore-test-last.json.
 *   node scripts/backup-db.js --restore <file.json.gz> --to <path> [--force] [--extras-to <folder>] [--allow-root]
 *        write a verified copy of a backup to <path> (refuses to overwrite
 *        without --force). Stop the server first; see docs/RESTORE.md.
 *        --extras-to also puts back the ledgers and other small files of that set. A file
 *        there that is still good is kept, as it may be newer than the backup. A ledger
 *        put back gets an estimate of what was spent since the backup added to it.
 *        Run this as the app's user: a ledger the app cannot read refuses every paid
 *        call, and a store it cannot read refuses to start. So it stops if run as root.
 *   node scripts/backup-db.js --list
 *
 * Source: DB_FILE, else data/db.json (only ever read). With DB_DRIVER=sqlite the
 * source is DB_SQLITE_FILE and the snapshot uses SQLite's online backup.
 * Where: BACKUP_DIR, else `backups` beside the data file. Each backup is
 * db-<UTC stamp>.json.gz (or .sqlite.gz) plus a .manifest.json with its SHA-256
 * and per-collection row counts. Extras (BACKUP_EXTRA, comma-separated paths;
 * default every .json file beside the data file: all the ledgers, the invites, the
 * counters) are copied beside it as db-<stamp>.extra.<name>.gz. The manifest is
 * written last and every file is on the disk before it, so a set with a manifest
 * is whole. A set with no manifest is removed after a day.
 *
 * A JSON backup refuses to run if a db.sqlite beside the file is newer than it: the
 * app has moved to SQLite (DB_DRIVER=sqlite was not set here) and this would save
 * a frozen file every day and look healthy.
 *
 * Room: no backup is written if the disk would be left with under BACKUP_MIN_FREE_MB
 * (default 5120) after it. It exits 1 instead, so a backup can never be what fills the disk.
 *
 * Retention: every backup for BACKUP_KEEP_ALL_HOURS (default 48), then the newest of
 * each UTC day, up to BACKUP_MAX_AGE_DAYS (default 28); the newest 3 always stay.
 * 28, not more, on purpose: the privacy policy promises deletion within 30 days,
 * and a backup older than that would still hold an account its owner deleted.
 *
 * Copy the backup folder off the box every day (the kit has the rclone line);
 * a backup on the same disk does not survive the disk.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { pipeline } = require('stream/promises');
const { Transform } = require('stream');
const durable = require('../services/durable-file');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const has = (name) => args.includes(`--${name}`);

const SQLITE = process.env.DB_DRIVER === 'sqlite';
const source = path.resolve(flag('source')
  || (SQLITE ? (process.env.DB_SQLITE_FILE || path.join(ROOT, 'data', 'db.sqlite')) : (process.env.DB_FILE || path.join(ROOT, 'data', 'db.json'))));
const backupDir = path.resolve(flag('dir') || process.env.BACKUP_DIR || path.join(path.dirname(source), 'backups'));
const maxAgeDays = Number(flag('max-age-days') || process.env.BACKUP_MAX_AGE_DAYS || 28);
const KEEP_NEWEST = 3;
const keepAllHours = Number(process.env.BACKUP_KEEP_ALL_HOURS || 48);
const minFreeMb = Number(process.env.BACKUP_MIN_FREE_MB || 5120);

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Row counts, max ids and counters per collection, from a parsed JSON store. */
function shapeOf(store) {
  const out = {};
  for (const [name, rows] of Object.entries(store)) {
    if (!Array.isArray(rows)) continue;
    const ids = rows.map((r) => r && r.id);
    out[name] = {
      rows: rows.length,
      max_id: ids.reduce((m, i) => (Number.isInteger(i) && i > m ? i : m), 0),
      bad_ids: ids.filter((i) => !Number.isInteger(i)).length,
      duplicate_ids: ids.length - new Set(ids).size,
      counter: store._counters && typeof store._counters[name] === 'number' ? store._counters[name] : null,
    };
  }
  return out;
}

/**
 * Read the JSON store while the server may be writing it. The server writes a
 * temp file and renames it over, so a read sees the old or the new file whole;
 * on Windows the read can still collide with the rename, so it retries.
 */
async function readJsonSnapshot(file) {
  let lastErr;
  for (let i = 0; i < 8; i++) {
    try {
      const raw = fs.readFileSync(file);
      const store = JSON.parse(raw.toString('utf8'));
      return { raw, store };
    } catch (err) { lastErr = err; await sleep(250); }
  }
  throw new Error(`could not read a whole copy of ${file}: ${lastErr && lastErr.message}`);
}

async function snapshotSqlite(file, dest) {
  // eslint-disable-next-line global-require
  const sqlite = require('node:sqlite');
  const src = new sqlite.DatabaseSync(file, { readOnly: true });
  // All pages in one step. In steps of the default 100 pages, each save by the live app restarts the copy from page one, so a big store under steady
  // writes might never finish. One step reads one consistent snapshot, and in WAL mode the app keeps writing meanwhile.
  try { await sqlite.backup(src, dest, { rate: 2147483647 }); } finally { src.close(); }
  const check = new sqlite.DatabaseSync(dest, { readOnly: true });
  try {
    const ok = check.prepare('PRAGMA integrity_check').get();
    const counts = {};
    for (const r of check.prepare('SELECT coll, COUNT(*) AS n, MAX(id) AS max_id FROM rows GROUP BY coll').all()) counts[r.coll] = { rows: r.n, max_id: r.max_id };
    return { integrity: Object.values(ok)[0], shape: counts };
  } finally { check.close(); }
}

function defaultExtras() {
  const dir = path.dirname(source);
  // Every ledger. This list used to name five files, and missed munito, coral, gonka, grokified, gladia, standard-compute, lyceum and zerogpu: a restore
  // from it would have started all of them again at $0.
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json') && path.join(dir, f) !== source && !/\.corrupt-|\.tmp$/.test(f))
    .map((f) => path.join(dir, f)).filter((f) => fs.statSync(f).isFile() && fs.statSync(f).size < 256 * 1048576);
}

/** Refuse a JSON backup of a store the app has left. */
function refuseStale() {
  if (SQLITE) return;
  const sib = path.join(path.dirname(source), 'db.sqlite');
  if (!fs.existsSync(sib)) return;
  const newest = Math.max(fs.statSync(sib).mtimeMs, fs.existsSync(`${sib}-wal`) ? fs.statSync(`${sib}-wal`).mtimeMs : 0);
  if (newest > fs.statSync(source).mtimeMs) {
    throw new Error(`${sib} is newer than ${source}: the app has moved to SQLite, and this would back up a frozen file. Set DB_DRIVER=sqlite (and DB_SQLITE_FILE) for this job.`);
  }
}

/** Refuse if a backup of about `bytes` would leave too little room. */
function checkRoom(bytes) {
  let free;
  try { const st = fs.statfsSync(backupDir); free = Number(st.bavail) * Number(st.bsize); } catch { return; }
  if (free - bytes < minFreeMb * 1048576) {
    throw new Error(`only ${Math.round(free / 1048576)} MB free in ${backupDir}, and BACKUP_MIN_FREE_MB is ${minFreeMb}: no backup taken. Free some space.`);
  }
}

/** Write a buffer to a file in one go, on the disk before it has its name. */
function writeDurable(file, buf) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, buf, { mode: 0o600 });
  durable.commit(tmp, file);
}

const hasher = (h, onBytes = () => {}) => new Transform({ transform(chunk, enc, done) { h.update(chunk); onBytes(chunk.length); done(null, chunk); } });

/** gzip a file by streaming: a store over 2 GB cannot go through readFileSync, and the backup would fail just as the data got big. */
async function gzipFile(src, dest) {
  const raw = crypto.createHash('sha256'); const gz = crypto.createHash('sha256');
  let rawBytes = 0; let gzBytes = 0;
  const tmp = `${dest}.${process.pid}.tmp`;
  await pipeline(fs.createReadStream(src), hasher(raw, (n) => { rawBytes += n; }), zlib.createGzip({ level: 6 }), hasher(gz, (n) => { gzBytes += n; }), fs.createWriteStream(tmp, { mode: 0o600 }));
  durable.commit(tmp, dest);
  return { bytes: rawBytes, sha256: raw.digest('hex'), gz_bytes: gzBytes, gz_sha256: gz.digest('hex') };
}

/** Unzip a set's data file to `dest`, checking both checksums; `dest` only appears if they match. */
async function unpack(manifest, dest) {
  const dir = path.dirname(manifest.manifest);
  const gz = crypto.createHash('sha256'); const raw = crypto.createHash('sha256');
  const tmp = `${dest}.${process.pid}.tmp`;
  try {
    await pipeline(fs.createReadStream(path.join(dir, manifest.file)), hasher(gz), zlib.createGunzip(), hasher(raw), fs.createWriteStream(tmp, { mode: 0o600 }));
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch { /* none */ }
    if (/incorrect|invalid|unexpected end|header/i.test(err.message)) throw new Error(`${manifest.file}: the compressed file does not match its checksum (${err.message})`);
    throw err;
  }
  if (gz.digest('hex') !== manifest.gz_sha256) { fs.unlinkSync(tmp); throw new Error(`${manifest.file}: the compressed file does not match its checksum`); }
  if (raw.digest('hex') !== manifest.sha256) { fs.unlinkSync(tmp); throw new Error(`${manifest.file}: the unzipped data does not match its checksum`); }
  durable.commit(tmp, dest);
}

function listBackups() {
  if (!fs.existsSync(backupDir)) return [];
  // A manifest that cannot be read (a power cut, a full disk) must not stop every later backup: it is left out, and its set removed by age.
  return fs.readdirSync(backupDir).filter((f) => /^db-\d{8}T\d{6}Z\.manifest\.json$/.test(f)).sort().flatMap((f) => {
    try { return [{ manifest: path.join(backupDir, f), ...JSON.parse(fs.readFileSync(path.join(backupDir, f), 'utf8')) }]; } catch { return []; }
  });
}

function prune() {
  const all = listBackups();
  const now = Date.now();
  const cutoff = now - maxAgeDays * 86400000;
  const keepAllFrom = now - keepAllHours * 3600000;
  const seenDay = new Set();
  const removable = [];
  [...all].reverse().forEach((b, i) => {
    const at = new Date(b.created_at).getTime();
    const day = String(b.created_at).slice(0, 10);
    const firstOfDay = !seenDay.has(day);
    seenDay.add(day);
    if (i < KEEP_NEWEST) return;
    if (at < cutoff || (at < keepAllFrom && !firstOfDay)) removable.push(b);
  });
  let removed = 0;
  for (const b of removable) {
    const prefix = path.basename(b.manifest).replace('.manifest.json', '');
    for (const f of fs.readdirSync(backupDir)) {
      if (f.startsWith(`${prefix}.`)) { fs.unlinkSync(path.join(backupDir, f)); removed++; }
    }
  }
  // Leftovers of a run that was killed: a set with no manifest, temp files, a restore test's folder. Old ones only, as one may be running now.
  const named = new Set(listBackups().map((b) => path.basename(b.manifest).replace('.manifest.json', '')));
  for (const f of fs.readdirSync(backupDir)) {
    const m = f.match(/^(db-\d{8}T\d{6}Z)\./);
    const orphan = (m && !named.has(m[1])) || /\.tmp$/.test(f) || f.startsWith('.restore-test-');
    if (!orphan) continue;
    const full = path.join(backupDir, f);
    if (now - fs.statSync(full).mtimeMs < 86400000) continue;
    fs.rmSync(full, { recursive: true, force: true }); removed++;
  }
  return removed;
}

async function backup() {
  if (!fs.existsSync(source)) throw new Error(`no data store at ${source}`);
  refuseStale();
  fs.mkdirSync(backupDir, { recursive: true });
  // Compressed it is usually a fifth of this; counting all of it errs on the safe side.
  checkRoom(fs.statSync(source).size);
  const id = `db-${stamp()}`;
  const started = Date.now();
  let shape; let kind; let integrity = null; let sizes;
  if (SQLITE) {
    const tmp = path.join(backupDir, `${id}-snapshot-${process.pid}.sqlite.tmp`);
    try {
      const r = await snapshotSqlite(source, tmp);
      shape = r.shape; integrity = r.integrity; kind = 'sqlite';
      if (integrity !== 'ok') throw new Error(`the snapshot failed SQLite's integrity check: ${integrity}`);
      sizes = await gzipFile(tmp, path.join(backupDir, `${id}.${kind}.gz`));
    } finally {
      for (const f of [tmp, `${tmp}-wal`, `${tmp}-shm`]) { try { fs.unlinkSync(f); } catch { /* none */ } }
    }
  } else {
    const snap = await readJsonSnapshot(source);
    shape = shapeOf(snap.store); kind = 'json';
    const gz = zlib.gzipSync(snap.raw, { level: 9 });
    writeDurable(path.join(backupDir, `${id}.${kind}.gz`), gz);
    sizes = { bytes: snap.raw.length, sha256: sha256(snap.raw), gz_bytes: gz.length, gz_sha256: sha256(gz) };
  }
  const extras = [];
  const extraList = process.env.BACKUP_EXTRA !== undefined
    ? process.env.BACKUP_EXTRA.split(',').map((s) => s.trim()).filter(Boolean).map((p) => path.resolve(p))
    : defaultExtras();
  for (const f of extraList) {
    if (!fs.existsSync(f)) continue;
    const buf = fs.readFileSync(f);
    const name = `${id}.extra.${path.basename(f)}.gz`;
    writeDurable(path.join(backupDir, name), zlib.gzipSync(buf));
    extras.push({ file: name, from: f, bytes: buf.length, sha256: sha256(buf) });
  }
  const manifest = {
    id, kind, created_at: new Date().toISOString(), source, file: `${id}.${kind}.gz`, ...sizes,
    integrity, collections: shape, extras, took_ms: Date.now() - started, host: os.hostname(),
  };
  writeDurable(path.join(backupDir, `${id}.manifest.json`), JSON.stringify(manifest, null, 2));
  const removed = prune();
  return { manifest, removed };
}

const manifestFor = (file) => {
  const m = file.replace(/\.(json|sqlite)\.gz$/, '.manifest.json');
  return { manifest: m, ...JSON.parse(fs.readFileSync(m, 'utf8')) };
};

async function restoreTest() {
  const all = listBackups();
  const manifest = flag('file') ? manifestFor(path.resolve(flag('file'))) : all[all.length - 1];
  if (!manifest) throw new Error(`no backups in ${backupDir}`);
  const problems = [];
  // Beside the backups, not in the system temp folder: on the server that is memory, and the file can be gigabytes.
  const work = fs.mkdtempSync(path.join(path.dirname(manifest.manifest), '.restore-test-'));
  const started = Date.now();
  let loaded = {};
  try {
    const unpacked = path.join(work, manifest.kind === 'json' ? 'db.json' : 'db.sqlite');
    await unpack(manifest, unpacked);
    if (manifest.kind === 'json') {
      const store = JSON.parse(fs.readFileSync(unpacked, 'utf8'));
      const shape = shapeOf(store);
      for (const [name, s] of Object.entries(shape)) {
        if (s.bad_ids) problems.push(`${name}: ${s.bad_ids} row(s) without a numeric id`);
        if (s.duplicate_ids) problems.push(`${name}: ${s.duplicate_ids} duplicate id(s)`);
        if (s.counter !== null && s.counter < s.max_id) problems.push(`${name}: counter ${s.counter} is below the highest id ${s.max_id}`);
        const m = manifest.collections[name];
        if (!m || m.rows !== s.rows) problems.push(`${name}: ${s.rows} rows, the manifest says ${m ? m.rows : 'none'}`);
      }
      const file = unpacked;
      // Load it the way the app does, in a child process, read-only.
      const code = "const db=require(process.argv[1]);const o={};for(const n of Object.keys(JSON.parse(require('fs').readFileSync(process.env.DB_FILE,'utf8')))){try{o[n]=db.all(n).length}catch{}}process.stdout.write(JSON.stringify(o))";
      const out = execFileSync(process.execPath, ['-e', code, path.join(ROOT, 'config', 'db.js')], {
        env: { ...process.env, DB_FILE: file, DB_READONLY: '1', DB_DRIVER: '' }, encoding: 'utf8', timeout: 120000,
      });
      loaded = JSON.parse(out);
      for (const [name, n] of Object.entries(loaded)) {
        if (shape[name] && shape[name].rows !== n) problems.push(`${name}: the app loaded ${n} rows, the file has ${shape[name].rows}`);
      }
    } else {
      // eslint-disable-next-line global-require
      const sqlite = require('node:sqlite');
      const file = unpacked;
      const d = new sqlite.DatabaseSync(file, { readOnly: true });
      try {
        const ok = Object.values(d.prepare('PRAGMA integrity_check').get())[0];
        if (ok !== 'ok') problems.push(`integrity_check: ${ok}`);
        for (const r of d.prepare('SELECT coll, COUNT(*) AS n FROM rows GROUP BY coll').all()) {
          loaded[r.coll] = r.n;
          const m = manifest.collections[r.coll];
          if (!m || m.rows !== r.n) problems.push(`${r.coll}: ${r.n} rows, the manifest says ${m ? m.rows : 'none'}`);
        }
      } finally { d.close(); }
    }
    for (const e of manifest.extras || []) {
      const buf = zlib.gunzipSync(fs.readFileSync(path.join(path.dirname(manifest.manifest), e.file)));
      if (sha256(buf) !== e.sha256) problems.push(`extra ${e.file}: checksum mismatch`);
    }
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
  const result = {
    at: new Date().toISOString(), backup: manifest.file, backup_created_at: manifest.created_at,
    ok: problems.length === 0, problems, collections_loaded: Object.keys(loaded).length,
    rows_loaded: Object.values(loaded).reduce((a, b) => a + b, 0), took_ms: Date.now() - started,
  };
  fs.writeFileSync(path.join(backupDir, 'restore-test-last.json'), JSON.stringify(result, null, 2));
  return result;
}

async function restore() {
  if (process.getuid && process.getuid() === 0 && !has('allow-root')) {
    throw new Error('this is running as root, and the files would belong to root: a ledger the app cannot read refuses every paid call, and a store it cannot read refuses to start. Run it as the app\'s user (runuser -u savant -- ...), or add --allow-root and chown them yourself.');
  }
  const file = path.resolve(flag('restore'));
  const to = flag('to');
  if (!to) throw new Error('--restore needs --to <path>');
  const target = path.resolve(to);
  if (fs.existsSync(target) && !has('force')) throw new Error(`${target} exists; add --force to overwrite it (stop the server first)`);
  const manifest = manifestFor(file);
  await unpack(manifest, target);
  // The old file's write-ahead log would be replayed over the restored database and damage it. Kept aside, not deleted: it may be all that is left of something.
  for (const suffix of ['-wal', '-shm']) {
    if (fs.existsSync(`${target}${suffix}`)) fs.renameSync(`${target}${suffix}`, `${target}${suffix}.before-restore-${Date.now()}`);
  }
  const extras = [];
  const extrasTo = flag('extras-to');
  if (extrasTo) {
    const dir = path.resolve(extrasTo);
    fs.mkdirSync(dir, { recursive: true });
    for (const e of manifest.extras || []) {
      const name = path.basename(e.from);
      const dest = path.join(dir, name);
      const buf = zlib.gunzipSync(fs.readFileSync(path.join(path.dirname(manifest.manifest), e.file)));
      if (sha256(buf) !== e.sha256) throw new Error(`${e.file}: does not match its checksum`);
      const isLedger = name.endsWith('-ledger.json');
      if (fs.existsSync(dest)) {
        let keep = false;
        try { const text = fs.readFileSync(dest, 'utf8'); keep = isLedger ? !!durable.goodLedger(text) : (JSON.parse(text), true); } catch { /* damaged: put it back */ }
        if (keep) { extras.push(`${name}: kept the one there, it is good and may be newer`); continue; }
        fs.renameSync(dest, `${dest}.damaged-${Date.now()}`);
      }
      const data = isLedger ? durable.goodLedger(buf.toString('utf8')) : null;
      if (isLedger && data) {
        const at = new Date(manifest.created_at).getTime();
        const r = durable.restoreLedger(dir, name, { name: manifest.id, data, at });
        extras.push(`${name}: restored, $${r.addUsd.toFixed(2)} added for the ${r.gapH.toFixed(1)} h since the backup`);
      } else {
        writeDurable(dest, buf);
        extras.push(`${name}: restored`);
      }
    }
  }
  return { target, from: manifest.file, bytes: manifest.bytes, extras };
}

(async () => {
  if (has('restore-test')) {
    const r = await restoreTest();
    console.log(`${r.ok ? 'Restore test passed' : 'RESTORE TEST FAILED'}: ${r.backup} (${r.backup_created_at}), ${r.collections_loaded} collections, ${r.rows_loaded} rows loaded, ${r.took_ms} ms.`);
    for (const p of r.problems) console.log(`  - ${p}`);
    process.exit(r.ok ? 0 : 1);
  } else if (flag('restore')) {
    const r = await restore();
    console.log(`Restored ${r.from} to ${r.target} (${r.bytes} bytes).`);
    for (const line of r.extras) console.log(`  ${line}`);
  } else if (has('list')) {
    for (const b of listBackups()) console.log(`${b.created_at}\t${b.file}\t${b.bytes} bytes\t${Object.values(b.collections).reduce((a, c) => a + c.rows, 0)} rows`);
  } else {
    const { manifest, removed } = await backup();
    console.log(`Backup ${manifest.file}: ${manifest.bytes} bytes -> ${manifest.gz_bytes} gzipped, ${Object.keys(manifest.collections).length} collections, ${manifest.extras.length} extra file(s), ${manifest.took_ms} ms. Pruned ${removed} old file(s). In ${backupDir}.`);
  }
})().catch((err) => { console.error(`backup-db: ${err.message}`); process.exit(1); });
