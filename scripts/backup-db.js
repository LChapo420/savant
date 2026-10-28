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
 *   node scripts/backup-db.js --restore <file.json.gz> --to <path> [--force]
 *        write a verified copy of a backup to <path> (refuses to overwrite
 *        without --force). Stop the server first; see the kit's rollback plan.
 *   node scripts/backup-db.js --list
 *
 * Source: DB_FILE, else data/db.json (only ever read). With DB_DRIVER=sqlite the
 * source is DB_SQLITE_FILE and the snapshot uses SQLite's online backup.
 * Where: BACKUP_DIR, else `backups` beside the data file. Each backup is
 * db-<UTC stamp>.json.gz (or .sqlite.gz) plus a .manifest.json with its SHA-256
 * and per-collection row counts. Extras (BACKUP_EXTRA, comma-separated paths;
 * default the beta-invite file and the model ledgers beside the data file) are
 * copied beside it as db-<stamp>.extra.<name>.gz.
 *
 * Retention: BACKUP_MAX_AGE_DAYS (default 28), and the newest 3 always stay.
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
  try { await sqlite.backup(src, dest); } finally { src.close(); }
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
  return ['beta-invites.json', 'anthropic-ledger.json', 'nvidia-usage.json', 'xkiro-usage.json', 'unorouter-usage.json', 'jev-ledger.json']
    .map((f) => path.join(dir, f)).filter((f) => fs.existsSync(f));
}

function listBackups() {
  if (!fs.existsSync(backupDir)) return [];
  return fs.readdirSync(backupDir).filter((f) => /^db-\d{8}T\d{6}Z\.manifest\.json$/.test(f)).sort()
    .map((f) => ({ manifest: path.join(backupDir, f), ...JSON.parse(fs.readFileSync(path.join(backupDir, f), 'utf8')) }));
}

function prune() {
  const all = listBackups();
  const cutoff = Date.now() - maxAgeDays * 86400000;
  const removable = all.slice(0, Math.max(0, all.length - KEEP_NEWEST)).filter((b) => new Date(b.created_at).getTime() < cutoff);
  let removed = 0;
  for (const b of removable) {
    const prefix = path.basename(b.manifest).replace('.manifest.json', '');
    for (const f of fs.readdirSync(backupDir)) {
      if (f.startsWith(`${prefix}.`)) { fs.unlinkSync(path.join(backupDir, f)); removed++; }
    }
  }
  return removed;
}

async function backup() {
  if (!fs.existsSync(source)) throw new Error(`no data store at ${source}`);
  fs.mkdirSync(backupDir, { recursive: true });
  const id = `db-${stamp()}`;
  const started = Date.now();
  let raw; let shape; let kind; let integrity = null;
  if (SQLITE) {
    const tmp = path.join(os.tmpdir(), `${id}-${process.pid}.sqlite`);
    const r = await snapshotSqlite(source, tmp);
    raw = fs.readFileSync(tmp);
    fs.unlinkSync(tmp);
    shape = r.shape; integrity = r.integrity; kind = 'sqlite';
    if (integrity !== 'ok') throw new Error(`the snapshot failed SQLite's integrity check: ${integrity}`);
  } else {
    const snap = await readJsonSnapshot(source);
    raw = snap.raw; shape = shapeOf(snap.store); kind = 'json';
  }
  const gz = zlib.gzipSync(raw, { level: 9 });
  const dataFile = path.join(backupDir, `${id}.${kind}.gz`);
  fs.writeFileSync(dataFile, gz, { mode: 0o600 });
  const extras = [];
  const extraList = process.env.BACKUP_EXTRA !== undefined
    ? process.env.BACKUP_EXTRA.split(',').map((s) => s.trim()).filter(Boolean).map((p) => path.resolve(p))
    : defaultExtras();
  for (const f of extraList) {
    if (!fs.existsSync(f)) continue;
    const buf = fs.readFileSync(f);
    const name = `${id}.extra.${path.basename(f)}.gz`;
    fs.writeFileSync(path.join(backupDir, name), zlib.gzipSync(buf), { mode: 0o600 });
    extras.push({ file: name, from: f, bytes: buf.length, sha256: sha256(buf) });
  }
  const manifest = {
    id, kind, created_at: new Date().toISOString(), source, file: path.basename(dataFile),
    bytes: raw.length, sha256: sha256(raw), gz_bytes: gz.length, gz_sha256: sha256(gz),
    integrity, collections: shape, extras, took_ms: Date.now() - started, host: os.hostname(),
  };
  fs.writeFileSync(path.join(backupDir, `${id}.manifest.json`), JSON.stringify(manifest, null, 2), { mode: 0o600 });
  const removed = prune();
  return { manifest, removed };
}

/** Unzip and verify one backup. Returns { raw, manifest }. */
function verified(manifestOrFile) {
  let manifest = manifestOrFile;
  if (typeof manifestOrFile === 'string') {
    const m = manifestOrFile.replace(/\.(json|sqlite)\.gz$/, '.manifest.json');
    manifest = { manifest: m, ...JSON.parse(fs.readFileSync(m, 'utf8')) };
  }
  const gz = fs.readFileSync(path.join(path.dirname(manifest.manifest), manifest.file));
  if (sha256(gz) !== manifest.gz_sha256) throw new Error(`${manifest.file}: the compressed file does not match its checksum`);
  const raw = zlib.gunzipSync(gz);
  if (sha256(raw) !== manifest.sha256) throw new Error(`${manifest.file}: the unzipped data does not match its checksum`);
  return { raw, manifest };
}

function restoreTest() {
  const all = listBackups();
  const pick = flag('file') ? null : all[all.length - 1];
  if (!pick && !flag('file')) throw new Error(`no backups in ${backupDir}`);
  const { raw, manifest } = verified(flag('file') ? path.resolve(flag('file')) : pick);
  const problems = [];
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'restore-test-'));
  const started = Date.now();
  let loaded = {};
  try {
    if (manifest.kind === 'json') {
      const store = JSON.parse(raw.toString('utf8'));
      const shape = shapeOf(store);
      for (const [name, s] of Object.entries(shape)) {
        if (s.bad_ids) problems.push(`${name}: ${s.bad_ids} row(s) without a numeric id`);
        if (s.duplicate_ids) problems.push(`${name}: ${s.duplicate_ids} duplicate id(s)`);
        if (s.counter !== null && s.counter < s.max_id) problems.push(`${name}: counter ${s.counter} is below the highest id ${s.max_id}`);
        const m = manifest.collections[name];
        if (!m || m.rows !== s.rows) problems.push(`${name}: ${s.rows} rows, the manifest says ${m ? m.rows : 'none'}`);
      }
      const file = path.join(work, 'db.json');
      fs.writeFileSync(file, raw);
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
      const file = path.join(work, 'db.sqlite');
      fs.writeFileSync(file, raw);
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

function restore() {
  const file = path.resolve(flag('restore'));
  const to = flag('to');
  if (!to) throw new Error('--restore needs --to <path>');
  const target = path.resolve(to);
  if (fs.existsSync(target) && !has('force')) throw new Error(`${target} exists; add --force to overwrite it (stop the server first)`);
  const { raw, manifest } = verified(file);
  fs.writeFileSync(`${target}.tmp`, raw, { mode: 0o600 });
  fs.renameSync(`${target}.tmp`, target);
  return { target, from: manifest.file, bytes: raw.length };
}

(async () => {
  if (has('restore-test')) {
    const r = restoreTest();
    console.log(`${r.ok ? 'Restore test passed' : 'RESTORE TEST FAILED'}: ${r.backup} (${r.backup_created_at}), ${r.collections_loaded} collections, ${r.rows_loaded} rows loaded, ${r.took_ms} ms.`);
    for (const p of r.problems) console.log(`  - ${p}`);
    process.exit(r.ok ? 0 : 1);
  } else if (flag('restore')) {
    const r = restore();
    console.log(`Restored ${r.from} to ${r.target} (${r.bytes} bytes).`);
  } else if (has('list')) {
    for (const b of listBackups()) console.log(`${b.created_at}\t${b.file}\t${b.bytes} bytes\t${Object.values(b.collections).reduce((a, c) => a + c.rows, 0)} rows`);
  } else {
    const { manifest, removed } = await backup();
    console.log(`Backup ${manifest.file}: ${manifest.bytes} bytes -> ${manifest.gz_bytes} gzipped, ${Object.keys(manifest.collections).length} collections, ${manifest.extras.length} extra file(s), ${manifest.took_ms} ms. Pruned ${removed} old file(s). In ${backupDir}.`);
  }
})().catch((err) => { console.error(`backup-db: ${err.message}`); process.exit(1); });
