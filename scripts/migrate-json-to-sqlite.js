#!/usr/bin/env node
/**
 * Move the JSON store to SQLite (or back), with a row-by-row integrity check.
 * (curriculum-build/BETA-LAUNCH-KIT.md section 1.3. STAGED: the app keeps using
 * the JSON store until config/db.js is patched and DB_DRIVER=sqlite is set.)
 *
 *   node scripts/migrate-json-to-sqlite.js --from data/db.json --to data/db.sqlite [--force] [--report r.json]
 *   node scripts/migrate-json-to-sqlite.js --verify --from data/db.json --to data/db.sqlite
 *   node scripts/migrate-json-to-sqlite.js --reverse --from data/db.sqlite --to data/db.json.restored [--force]
 *
 * The source is only read. The target is written to <to>.partial and renamed into
 * place only after the check passes, so a failed run leaves nothing half-made.
 *
 * The check (also run alone with --verify):
 *   - SQLite's PRAGMA integrity_check is "ok";
 *   - every collection the app knows has the same number of rows both sides;
 *   - every row, in order, is byte-identical as JSON (JSON.stringify of the
 *     source row equals the stored doc, and the parsed doc equals it again);
 *   - every counter is equal, and no counter is below its collection's highest id;
 *   - one SHA-256 over the whole store (collections in a fixed order, then the
 *     counters) is equal both sides.
 * The JSON driver keeps only the collections in config/db.js COLLECTIONS and
 * gives a missing counter the highest id; the migration does the same, and names
 * any key it leaves out.
 *
 * Timings for each phase are printed and, with --report, written as JSON.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { COLLECTIONS, open } = require('../config/db-sqlite-schema');

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const has = (name) => args.includes(`--${name}`);
const ROOT = path.join(__dirname, '..');

function timer() {
  const marks = {};
  let last = process.hrtime.bigint();
  return {
    mark(name) { const now = process.hrtime.bigint(); marks[name] = Number((now - last) / 1000000n); last = now; },
    marks,
  };
}

/** The store as the JSON driver would hold it after load(). */
function normalise(parsed) {
  const store = { _counters: {} };
  for (const name of COLLECTIONS) {
    store[name] = Array.isArray(parsed[name]) ? parsed[name] : [];
    store._counters[name] = parsed._counters && typeof parsed._counters[name] === 'number'
      ? parsed._counters[name]
      : store[name].reduce((m, r) => Math.max(m, r.id || 0), 0);
  }
  const dropped = Object.keys(parsed).filter((k) => k !== '_counters' && !COLLECTIONS.includes(k));
  return { store, dropped };
}

function digestOf(store) {
  const h = crypto.createHash('sha256');
  for (const name of COLLECTIONS) {
    h.update(`\u0000${name}\u0000`);
    for (const row of store[name]) h.update(JSON.stringify(row)).update('\n');
  }
  h.update(JSON.stringify(COLLECTIONS.map((n) => [n, store._counters[n]])));
  return h.digest('hex');
}

function readSqlite(file) {
  const d = open(file, { readOnly: true });
  try {
    const integrity = Object.values(d.prepare('PRAGMA integrity_check').get())[0];
    const store = { _counters: {} };
    const docs = {};
    const q = d.prepare('SELECT id, doc FROM rows WHERE coll = ? ORDER BY pos');
    for (const name of COLLECTIONS) {
      const rows = q.all(name);
      docs[name] = rows.map((r) => r.doc);
      store[name] = rows.map((r) => JSON.parse(r.doc));
    }
    for (const r of d.prepare('SELECT coll, value FROM counters').all()) store._counters[r.coll] = r.value;
    const unknown = d.prepare('SELECT DISTINCT coll FROM rows').all().map((r) => r.coll).filter((c) => !COLLECTIONS.includes(c));
    return { integrity, store, docs, unknown };
  } finally { d.close(); }
}

/** Compare a JSON-side store with what is in the SQLite file. Returns problems[]. */
function verify(jsonStore, sqliteFile) {
  const problems = [];
  const s = readSqlite(sqliteFile);
  if (s.integrity !== 'ok') problems.push(`integrity_check: ${s.integrity}`);
  if (s.unknown.length) problems.push(`SQLite holds collections the app does not know: ${s.unknown.join(', ')}`);
  for (const name of COLLECTIONS) {
    const a = jsonStore[name];
    const b = s.docs[name];
    if (a.length !== b.length) { problems.push(`${name}: ${a.length} rows in JSON, ${b.length} in SQLite`); continue; }
    for (let i = 0; i < a.length; i++) {
      const want = JSON.stringify(a[i]);
      if (b[i] !== want) { problems.push(`${name}: row ${i} (id ${a[i] && a[i].id}) differs`); break; }
      if (JSON.stringify(JSON.parse(b[i])) !== want) { problems.push(`${name}: row ${i} does not round-trip`); break; }
    }
    if (jsonStore._counters[name] !== s.store._counters[name]) problems.push(`${name}: counter ${jsonStore._counters[name]} in JSON, ${s.store._counters[name]} in SQLite`);
    const maxId = a.reduce((m, r) => Math.max(m, r.id || 0), 0);
    if (s.store._counters[name] < maxId) problems.push(`${name}: counter ${s.store._counters[name]} is below the highest id ${maxId}`);
  }
  const da = digestOf(jsonStore);
  const db = digestOf({ ...s.store, _counters: Object.fromEntries(COLLECTIONS.map((n) => [n, s.store._counters[n]])) });
  if (da !== db) problems.push(`whole-store SHA-256 differs (${da.slice(0, 12)} vs ${db.slice(0, 12)})`);
  return { problems, digest: da, rows: COLLECTIONS.reduce((n, c) => n + jsonStore[c].length, 0) };
}

function readJson(file) {
  for (let i = 0; i < 8; i++) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (err) {
      if (i === 7) throw new Error(`could not read ${file}: ${err.message}`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
    }
  }
  return null;
}

function forward() {
  const from = path.resolve(flag('from', process.env.DB_FILE || path.join(ROOT, 'data', 'db.json')));
  const to = path.resolve(flag('to', path.join(path.dirname(from), 'db.sqlite')));
  if (fs.existsSync(to) && !has('force')) throw new Error(`${to} exists; add --force to replace it`);
  const t = timer();
  const raw = fs.statSync(from).size;
  const { store, dropped } = normalise(readJson(from));
  t.mark('read_parse_ms');
  const partial = `${to}.partial`;
  for (const f of [partial, `${partial}-wal`, `${partial}-shm`]) { try { fs.unlinkSync(f); } catch { /* none */ } }
  const d = open(partial);
  const ins = d.prepare('INSERT INTO rows (coll, id, pos, doc) VALUES (?, ?, ?, ?)');
  const cnt = d.prepare('INSERT INTO counters (coll, value) VALUES (?, ?)');
  d.exec('BEGIN');
  let rows = 0;
  for (const name of COLLECTIONS) {
    store[name].forEach((row, i) => { ins.run(name, row.id, i + 1, JSON.stringify(row)); rows++; });
    cnt.run(name, store._counters[name]);
  }
  d.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run('migrated_from', JSON.stringify({ from, at: new Date().toISOString(), bytes: raw }));
  d.exec('COMMIT');
  t.mark('write_ms');
  d.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  d.close();
  t.mark('checkpoint_ms');
  const check = verify(store, partial);
  t.mark('verify_ms');
  if (check.problems.length) {
    throw Object.assign(new Error(`integrity check failed; ${partial} kept for inspection:\n  - ${check.problems.join('\n  - ')}`), { report: check });
  }
  for (const f of [`${to}-wal`, `${to}-shm`]) { try { fs.unlinkSync(f); } catch { /* none */ } }
  fs.renameSync(partial, to);
  const report = {
    ok: true, from, to, json_bytes: raw, sqlite_bytes: fs.statSync(to).size, collections: COLLECTIONS.length, rows,
    dropped_keys: dropped, digest: check.digest, timings_ms: t.marks, at: new Date().toISOString(),
  };
  return report;
}

function verifyOnly() {
  const from = path.resolve(flag('from'));
  const to = path.resolve(flag('to'));
  const t = timer();
  const { store } = normalise(readJson(from));
  const check = verify(store, to);
  t.mark('verify_ms');
  return { ok: check.problems.length === 0, problems: check.problems, rows: check.rows, digest: check.digest, timings_ms: t.marks };
}

function reverse() {
  const from = path.resolve(flag('from'));
  const to = path.resolve(flag('to'));
  if (fs.existsSync(to) && !has('force')) throw new Error(`${to} exists; add --force to replace it`);
  const t = timer();
  const s = readSqlite(from);
  if (s.integrity !== 'ok') throw new Error(`integrity_check: ${s.integrity}`);
  const out = { _counters: {} };
  for (const name of COLLECTIONS) { out[name] = s.store[name]; out._counters[name] = s.store._counters[name]; }
  t.mark('read_ms');
  // Same layout the JSON driver writes (two-space indent), via a temp file.
  fs.writeFileSync(`${to}.tmp`, JSON.stringify(out, null, 2), 'utf8');
  fs.renameSync(`${to}.tmp`, to);
  t.mark('write_ms');
  const back = verify(normalise(readJson(to)).store, from);
  t.mark('verify_ms');
  if (back.problems.length) throw new Error(`the JSON written does not match the SQLite file:\n  - ${back.problems.join('\n  - ')}`);
  return { ok: true, from, to, rows: back.rows, digest: back.digest, timings_ms: t.marks };
}

try {
  const report = has('reverse') ? reverse() : has('verify') ? verifyOnly() : forward();
  if (flag('report')) fs.writeFileSync(path.resolve(flag('report')), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
} catch (err) {
  console.error(`migrate: ${err.message}`);
  process.exit(1);
}
