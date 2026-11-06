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
 * unchanged, synchronous as today) and, on flush, writes the rows the API changed,
 * in one transaction, to a WAL-mode SQLite file. (It used to re-serialise every row
 * of a touched collection on each flush and keep a copy of each row's JSON, which on
 * a grown store cost nearly what the JSON driver did: beta load test, Nov 2026.)
 *
 * Rows changed outside the API (a caller that edits a row object it got from
 * find() and never calls update) are still saved: every DB_SQLITE_SWEEP_MS
 * (default 60000) a sweep compares every row against a hash of what was written, a
 * slice at a time between requests, and a full compare runs at exit. The JSON
 * driver saves those only when something else writes, so this is no less durable.
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
const written = new Map(); // coll -> Map(id -> hash of the JSON last written)
const position = new Map(); // coll -> Map(id -> pos)
const maxPos = new Map();
const writtenCounters = {};

/** FNV-1a: a small number per row instead of a copy of its text. A collision costs one row until it next changes through the API. */
function hashOf(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h | 0;
}

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
      w.set(r.id, hashOf(r.doc));
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

const dirty = new Set(); // collections with a counter or rows to write
const changedRows = new Map(); // coll -> Map(id -> row) changed through the API since the last flush
const removedIds = new Map(); // coll -> Set(id) removed through the API since the last flush
let flushTimer = null;
let flushFailures = 0;
let firstFailureAt = null;
let lastSavedAt = Date.now();
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

/** Write what changed. `all` compares every row of every collection (exit, tests, a forced save), not only what the API touched. */
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
      const writeRow = (row) => {
        const id = row.id;
        const doc = JSON.stringify(row);
        const h = hashOf(doc);
        if (w.get(id) === h) return;
        let pos = p.get(id);
        if (pos === undefined) { pos = maxPos.get(name) + 1; maxPos.set(name, pos); p.set(id, pos); }
        q.upsert.run(name, id, pos, doc);
        w.set(id, h);
        changed++;
      };
      if (all) {
        const seen = new Set();
        for (const row of rows) { seen.add(row.id); writeRow(row); }
        for (const id of [...w.keys()]) {
          if (!seen.has(id)) { q.del.run(name, id); w.delete(id); p.delete(id); changed++; }
        }
      } else {
        const gone = removedIds.get(name);
        if (gone) for (const id of gone) { q.del.run(name, id); w.delete(id); p.delete(id); changed++; }
        const touched = changedRows.get(name);
        if (touched) for (const row of touched.values()) writeRow(row);
      }
      if (store._counters[name] !== writtenCounters[name]) {
        q.counter.run(name, store._counters[name]);
        writtenCounters[name] = store._counters[name];
      }
    }
    sql.exec('COMMIT');
    for (const name of names) { changedRows.delete(name); removedIds.delete(name); }
    flushFailures = 0; firstFailureAt = null; lastSavedAt = Date.now();
  } catch (err) {
    sql.exec('ROLLBACK');
    // Put the names back so the next flush tries again. What was changed is still in changedRows and removedIds.
    for (const n of names) dirty.add(n);
    flushFailures++;
    if (!firstFailureAt) firstFailureAt = Date.now();
    throw err;
  }
  stats.last_ms = Date.now() - started;
  stats.flushes++; stats.last_ms = Date.now() - started; stats.last_rows = changed; stats.last_at = new Date().toISOString();
  return changed;
}

function touch(name, row = null, removedId = null) {
  if (READONLY) return;
  dirty.add(name);
  if (row) { let m = changedRows.get(name); if (!m) { m = new Map(); changedRows.set(name, m); } m.set(row.id, row); }
  if (removedId !== null) {
    let s = removedIds.get(name); if (!s) { s = new Set(); removedIds.set(name, s); } s.add(removedId);
    const m = changedRows.get(name); if (m) m.delete(removedId);
  }
  if (!flushTimer) flushTimer = setTimeout(flushNow, flushFailures ? Math.min(5000, 250 * 2 ** Math.min(flushFailures, 5)) : 250);
}

function flushNow() {
  flushTimer = null;
  try { flush(); } catch (err) {
    if (flushFailures === 1 || flushFailures % 20 === 0) console.warn(`db: save failed (${err.code || err.message}); retrying`);
    if (!flushTimer) flushTimer = setTimeout(flushNow, Math.min(5000, 250 * 2 ** Math.min(flushFailures, 5)));
  }
}

/** The sweep: every row compared with what was written, a slice at a time, so a row changed outside the API is saved without stopping anyone. */
function sweepInSlices() {
  const names = [...COLLECTIONS];
  let name = names.shift();
  let at = 0;
  const step = () => {
    let budget = 2000;
    while (name && budget > 0) {
      const rows = store[name];
      const w = written.get(name);
      for (; at < rows.length && budget > 0; at++, budget--) {
        const row = rows[at];
        if (row && w.get(row.id) !== hashOf(JSON.stringify(row))) touch(name, row);
      }
      if (at >= rows.length) {
        if (w.size > rows.length) { const now = new Set(rows.map((r) => r.id)); for (const id of w.keys()) if (!now.has(id)) touch(name, null, id); }
        name = names.shift(); at = 0;
      }
    }
    if (name) setImmediate(step);
  };
  setImmediate(step);
}

if (!READONLY && SWEEP_MS > 0) {
  setInterval(sweepInSlices, SWEEP_MS).unref();
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

const byOwner = new Map(); // coll -> { map: user_id -> rows, count }

const db = {
  all(name) { return collection(name); },
  saveSoon() { if (!READONLY && !flushTimer && dirty.size) flushTimer = setTimeout(flushNow, 250); },
  /** As in config/db.js: one learner's rows, without reading everyone's. The array is shared: filter or copy it. */
  forUser(name, userId) {
    const rows = collection(name);
    let ix = byOwner.get(name);
    if (!ix || ix.count !== rows.length) {
      ix = { map: new Map(), count: rows.length };
      for (const r of rows) { const l = ix.map.get(r.user_id); if (l) l.push(r); else ix.map.set(r.user_id, [r]); }
      byOwner.set(name, ix);
    }
    return ix.map.get(userId) || [];
  },
  saveState() {
    return { saving: !flushFailures, failed_attempts: flushFailures, failing_for_s: firstFailureAt ? Math.round((Date.now() - firstFailureAt) / 1000) : 0, last_saved_s_ago: Math.round((Date.now() - lastSavedAt) / 1000), last_save_ms: stats.last_ms };
  },

  insert(name, doc) {
    collection(name);
    const id = ++store._counters[name];
    const row = { id, created_at: new Date().toISOString(), ...doc };
    collection(name).push(row);
    const ix = byOwner.get(name);
    if (ix) { const l = ix.map.get(row.user_id); if (l) l.push(row); else ix.map.set(row.user_id, [row]); ix.count++; }
    touch(name, row);
    return row;
  },

  insertMany(name, docs) { return docs.map((d) => db.insert(name, d)); },

  find(name, predicate) { return collection(name).filter(predicate); },

  findOne(name, predicate) { return collection(name).find(predicate) || null; },

  byId(name, id) {
    const numeric = Number(id);
    const rows = collection(name);
    let lo = 0; let hi = rows.length - 1; // ids only go up: a miss reads the whole collection, in case something is out of order
    while (lo <= hi) { const mid = (lo + hi) >> 1; const at = rows[mid].id; if (at === numeric) return rows[mid]; if (at < numeric) lo = mid + 1; else hi = mid - 1; }
    return rows.find((r) => r.id === numeric) || null;
  },

  update(name, id, patch) {
    const row = db.byId(name, id);
    if (!row) return null;
    if (patch && patch.user_id !== undefined && patch.user_id !== row.user_id) byOwner.delete(name);
    Object.assign(row, patch, { updated_at: new Date().toISOString() });
    touch(name, row);
    return row;
  },

  upsert(name, predicate, build) {
    const existing = db.findOne(name, predicate);
    if (existing) {
      const owner = existing.user_id;
      Object.assign(existing, build(existing), { updated_at: new Date().toISOString() });
      if (existing.user_id !== owner) byOwner.delete(name);
      touch(name, existing);
      return existing;
    }
    return db.insert(name, build(null));
  },

  remove(name, predicate) {
    const rows = collection(name);
    let removed = 0;
    for (let i = rows.length - 1; i >= 0; i--) {
      if (predicate(rows[i])) { touch(name, null, rows[i].id); rows.splice(i, 1); removed++; }
    }
    if (removed) byOwner.delete(name);
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
