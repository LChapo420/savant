/**
 * The data store on SQLite: the same API as config/db.js, a different disk format.
 *
 * STAGED (2026-10-24, curriculum-build/BETA-LAUNCH-KIT.md section 1.3). Nothing
 * loads this file unless config/db.js is patched to hand over when
 * DB_DRIVER=sqlite (curriculum-build/staged/beta-launch/config-db.js.patch), and
 * the data has been moved with scripts/migrate-json-to-sqlite.js (which checks
 * every row both sides).
 *
 * Why: the JSON driver re-serialises the whole store on every flush. Measured on
 * a copy of data/db.json (11.8 MB, 2026-10-24): JSON.stringify(store, null, 2)
 * 84-99 ms plus 47-51 ms to write and rename, about 150 ms of blocked event loop
 * per flush, up to four flushes a second under load, and it grows with the store.
 * This driver keeps the same in-memory arrays (so every route and service works
 * unchanged, synchronous as today) and, on flush, writes only the rows whose
 * JSON changed, in one transaction, to a WAL-mode SQLite file.
 *
 * Rows changed outside the API (a caller that edits a row object it got from
 * find() and never calls update) are still saved: every DB_SQLITE_SWEEP_MS
 * (default 60000) and at exit, every collection is compared, not only the ones
 * the API touched. The JSON driver saves those only when something else writes,
 * so this is no less durable.
 *
 * Why not Postgres: every caller uses this API synchronously (db.find(...) inside
 * request handlers, no await). A network database means making hundreds of call
 * sites async. SQLite through node:sqlite is synchronous, in process, and needs
 * no new package (Node 22.5+; this machine runs 24.19).
 *
 * Env: DB_SQLITE_FILE (default db.sqlite beside DB_FILE / data), DB_READONLY=1,
 * DB_SQLITE_SWEEP_MS.
 */
const fs = require('fs');
const path = require('path');

const { COLLECTIONS, SCHEMA, open } = require('./db-sqlite-schema');

const DATA_DIR = process.env.DB_FILE ? path.dirname(path.resolve(process.env.DB_FILE)) : path.join(__dirname, '..', 'data');
const DB_PATH = process.env.DB_SQLITE_FILE ? path.resolve(process.env.DB_SQLITE_FILE) : path.join(DATA_DIR, 'db.sqlite');
const JSON_PATH = process.env.DB_FILE ? path.resolve(process.env.DB_FILE) : path.join(DATA_DIR, 'db.json');
const READONLY = process.env.DB_READONLY === '1';
const SWEEP_MS = Number(process.env.DB_SQLITE_SWEEP_MS || 60000);

if (!fs.existsSync(DB_PATH)) {
  // An empty SQLite file next to a full JSON store means the migration was not
  // run. Starting would look like every account vanished, so refuse.
  if (fs.existsSync(JSON_PATH) && fs.statSync(JSON_PATH).size > 200) {
    throw new Error(`DB_DRIVER=sqlite but ${DB_PATH} does not exist while ${JSON_PATH} does. Run scripts/migrate-json-to-sqlite.js first.`);
  }
  if (READONLY) throw new Error(`db-sqlite: ${DB_PATH} does not exist (read-only)`);
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}

const sql = open(DB_PATH, { readOnly: READONLY });

const store = { _counters: {} };
const written = new Map(); // coll -> Map(id -> JSON last written)
const position = new Map(); // coll -> Map(id -> pos)
const maxPos = new Map();
const writtenCounters = {};

(function load() {
  const rowsOf = sql.prepare('SELECT id, pos, doc FROM rows WHERE coll = ? ORDER BY pos');
  const counters = Object.fromEntries(sql.prepare('SELECT coll, value FROM counters').all().map((r) => [r.coll, r.value]));
  for (const name of COLLECTIONS) {
    const rows = [];
    const w = new Map();
    const p = new Map();
    let top = 0;
    for (const r of rowsOf.all(name)) {
      rows.push(JSON.parse(r.doc));
      w.set(r.id, r.doc);
      p.set(r.id, r.pos);
      if (r.pos > top) top = r.pos;
    }
    store[name] = rows;
    written.set(name, w);
    position.set(name, p);
    maxPos.set(name, top);
    store._counters[name] = typeof counters[name] === 'number'
      ? counters[name]
      : rows.reduce((m, r) => Math.max(m, r.id || 0), 0);
    writtenCounters[name] = counters[name];
  }
}());

const dirty = new Set();
let flushTimer = null;
const stats = { flushes: 0, last_ms: 0, last_rows: 0, last_at: null };

let stmts = null;
function statements() {
  if (!stmts) {
    stmts = {
      upsert: sql.prepare('INSERT INTO rows (coll, id, pos, doc) VALUES (?, ?, ?, ?) ON CONFLICT(coll, id) DO UPDATE SET doc = excluded.doc'),
      del: sql.prepare('DELETE FROM rows WHERE coll = ? AND id = ?'),
      counter: sql.prepare('INSERT INTO counters (coll, value) VALUES (?, ?) ON CONFLICT(coll) DO UPDATE SET value = excluded.value'),
    };
  }
  return stmts;
}

/** Write what changed. `all` compares every collection, not only the touched ones. */
function flush(all = false) {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  if (READONLY) return 0;
  const names = all ? COLLECTIONS : [...dirty];
  dirty.clear();
  const started = Date.now();
  let changed = 0;
  const q = statements();
  sql.exec('BEGIN IMMEDIATE');
  try {
    for (const name of names) {
      const rows = store[name];
      const w = written.get(name);
      const p = position.get(name);
      const seen = new Set();
      for (const row of rows) {
        const id = row.id;
        seen.add(id);
        const doc = JSON.stringify(row);
        if (w.get(id) === doc) continue;
        let pos = p.get(id);
        if (pos === undefined) { pos = maxPos.get(name) + 1; maxPos.set(name, pos); p.set(id, pos); }
        q.upsert.run(name, id, pos, doc);
        w.set(id, doc);
        changed++;
      }
      for (const id of [...w.keys()]) {
        if (!seen.has(id)) { q.del.run(name, id); w.delete(id); p.delete(id); changed++; }
      }
      if (store._counters[name] !== writtenCounters[name]) {
        q.counter.run(name, store._counters[name]);
        writtenCounters[name] = store._counters[name];
      }
    }
    sql.exec('COMMIT');
  } catch (err) {
    sql.exec('ROLLBACK');
    // Put the names back so the next flush tries again.
    for (const n of names) dirty.add(n);
    throw err;
  }
  stats.flushes++; stats.last_ms = Date.now() - started; stats.last_rows = changed; stats.last_at = new Date().toISOString();
  return changed;
}

function touch(name) {
  if (READONLY) return;
  dirty.add(name);
  if (!flushTimer) flushTimer = setTimeout(() => { try { flush(); } catch (err) { console.error('db-sqlite flush failed:', err.message); } }, 250);
}

if (!READONLY && SWEEP_MS > 0) {
  setInterval(() => { try { flush(true); } catch (err) { console.error('db-sqlite sweep failed:', err.message); } }, SWEEP_MS).unref();
}

for (const signal of ['exit', 'SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    try { flush(true); } catch { /* nothing useful to do while exiting */ }
    if (signal !== 'exit') process.exit(0);
  });
}

function collection(name) {
  const rows = store[name];
  if (!rows) throw new Error(`unknown collection: ${name}`);
  return rows;
}

const db = {
  all(name) { return collection(name); },

  insert(name, doc) {
    collection(name);
    const id = ++store._counters[name];
    const row = { id, created_at: new Date().toISOString(), ...doc };
    collection(name).push(row);
    touch(name);
    return row;
  },

  insertMany(name, docs) { return docs.map((d) => db.insert(name, d)); },

  find(name, predicate) { return collection(name).filter(predicate); },

  findOne(name, predicate) { return collection(name).find(predicate) || null; },

  byId(name, id) {
    const numeric = Number(id);
    return collection(name).find((r) => r.id === numeric) || null;
  },

  update(name, id, patch) {
    const row = db.byId(name, id);
    if (!row) return null;
    Object.assign(row, patch, { updated_at: new Date().toISOString() });
    touch(name);
    return row;
  },

  upsert(name, predicate, build) {
    const existing = db.findOne(name, predicate);
    if (existing) {
      Object.assign(existing, build(existing), { updated_at: new Date().toISOString() });
      touch(name);
      return existing;
    }
    return db.insert(name, build(null));
  },

  remove(name, predicate) {
    const rows = collection(name);
    let removed = 0;
    for (let i = rows.length - 1; i >= 0; i--) {
      if (predicate(rows[i])) { rows.splice(i, 1); removed++; }
    }
    if (removed) touch(name);
    return removed;
  },

  /** Force a synchronous write of every collection. Tests and scripts use this. */
  flush: () => flush(true),

  path: DB_PATH,
  driver: 'sqlite',
  stats: () => ({ ...stats }),
  /** For the backup script: SQLite's online backup to a file. */
  backupTo: (dest) => require('node:sqlite').backup(sql, dest),
};

module.exports = db;
module.exports.COLLECTIONS = COLLECTIONS;
module.exports.SCHEMA = SCHEMA;
module.exports.open = open;
