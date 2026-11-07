#!/usr/bin/env node
/**
 * Compare two copies of the data store, JSON or SQLite, in any mix, without showing a single row.
 *
 *   node scripts/store-compare.js <a> <b> [--subset] [--sample 500] [--json]
 *
 * Prints, per collection: rows on each side, rows added, removed and changed, the highest id, and the counter. Rows are compared by the
 * SHA-256 of their JSON, so nothing of a learner's reaches the terminal or a log; a mismatch names only the collection and the row's id.
 *
 *   --subset    <b> may hold more than <a> (a restored copy after a test account was made on it): added rows and counters above <a>'s are
 *               fine, a removed or changed row of <a> is not. A row whose only change is updated_at still counts as changed.
 *   --sample N  also compare N rows picked at random across the store, by their full JSON text (a second check, separate from the hashes).
 *
 * Exit 0 if they match, 1 if not. Read only: SQLite files are opened read-only. Uses COLLECTIONS from config/db-sqlite-schema.js, and also
 * reports any other array in a JSON file, since the app would drop it on load.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { COLLECTIONS, open } = require('../config/db-sqlite-schema');

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const files = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--sample');
if (files.length !== 2) { console.error('usage: store-compare.js <a> <b> [--subset] [--sample N] [--json]'); process.exit(2); }
const SUBSET = args.includes('--subset');
const SAMPLE = Number(flag('sample', 0));

const hash = (text) => crypto.createHash('sha256').update(text).digest('base64');

/** { coll: { rows, ids: Map(id -> hash), text(id) }, counters, unknown: [] } */
function read(file) {
  const full = path.resolve(file);
  const out = { colls: {}, counters: {}, unknown: [] };
  if (/\.(sqlite|db)$/.test(full)) {
    const d = open(full, { readOnly: true });
    try {
      out.integrity = Object.values(d.prepare('PRAGMA integrity_check').get())[0];
      const q = d.prepare('SELECT id, doc FROM rows WHERE coll = ? ORDER BY pos');
      for (const name of COLLECTIONS) {
        const texts = new Map();
        for (const r of q.all(name)) texts.set(r.id, r.doc);
        out.colls[name] = texts;
      }
      for (const r of d.prepare('SELECT coll, value FROM counters').all()) out.counters[r.coll] = r.value;
      out.unknown = d.prepare('SELECT DISTINCT coll FROM rows').all().map((r) => r.coll).filter((c) => !COLLECTIONS.includes(c));
    } finally { d.close(); }
  } else {
    const parsed = JSON.parse(fs.readFileSync(full, 'utf8'));
    for (const name of COLLECTIONS) {
      const texts = new Map();
      for (const r of Array.isArray(parsed[name]) ? parsed[name] : []) texts.set(r.id, JSON.stringify(r));
      out.colls[name] = texts;
      out.counters[name] = parsed._counters && typeof parsed._counters[name] === 'number' ? parsed._counters[name] : null;
    }
    out.unknown = Object.keys(parsed).filter((k) => k !== '_counters' && !COLLECTIONS.includes(k));
  }
  return out;
}

const a = read(files[0]);
const b = read(files[1]);
const rows = [];
const problems = [];
if (a.integrity && a.integrity !== 'ok') problems.push(`a: integrity_check ${a.integrity}`);
if (b.integrity && b.integrity !== 'ok') problems.push(`b: integrity_check ${b.integrity}`);
if (a.unknown.length) problems.push(`a holds collections the app does not know: ${a.unknown.join(', ')}`);
if (b.unknown.length) problems.push(`b holds collections the app does not know: ${b.unknown.join(', ')}`);

let totalA = 0; let totalB = 0;
for (const name of COLLECTIONS) {
  const ra = a.colls[name]; const rb = b.colls[name];
  totalA += ra.size; totalB += rb.size;
  let removed = 0; let changed = 0; let firstChanged = null;
  for (const [id, text] of ra) {
    if (!rb.has(id)) { removed++; continue; }
    if (hash(text) !== hash(rb.get(id))) { changed++; if (firstChanged === null) firstChanged = id; }
  }
  const added = [...rb.keys()].filter((id) => !ra.has(id)).length;
  const maxId = (m) => [...m.keys()].reduce((x, i) => (Number.isInteger(i) && i > x ? i : x), 0);
  const ca = a.counters[name]; const cb = b.counters[name];
  rows.push({ collection: name, a_rows: ra.size, b_rows: rb.size, added, removed, changed, a_max_id: maxId(ra), b_max_id: maxId(rb), a_counter: ca, b_counter: cb });
  if (removed) problems.push(`${name}: ${removed} row(s) of a are missing from b`);
  if (changed) problems.push(`${name}: ${changed} row(s) differ, first id ${firstChanged}`);
  if (!SUBSET && added) problems.push(`${name}: b has ${added} row(s) a does not`);
  if (!SUBSET && ca !== null && cb !== null && ca !== cb) problems.push(`${name}: counter ${ca} vs ${cb}`);
  if (SUBSET && ca !== null && cb !== null && cb < ca) problems.push(`${name}: b's counter ${cb} is behind a's ${ca}`);
  if (cb !== null && cb < maxId(rb)) problems.push(`${name}: b's counter ${cb} is below its highest id`);
}

let sampled = 0; let sampleBad = 0;
if (SAMPLE > 0) {
  const pool = [];
  for (const name of COLLECTIONS) for (const id of a.colls[name].keys()) pool.push([name, id]);
  for (let i = 0; i < SAMPLE && pool.length; i++) {
    const [name, id] = pool[crypto.randomInt(pool.length)];
    sampled++;
    if (a.colls[name].get(id) !== b.colls[name].get(id)) sampleBad++;
  }
  if (sampleBad) problems.push(`${sampleBad} of ${sampled} sampled rows differ`);
}

const report = {
  ok: problems.length === 0, a: files[0], b: files[1], collections: COLLECTIONS.length, a_rows: totalA, b_rows: totalB,
  added: rows.reduce((n, r) => n + r.added, 0), removed: rows.reduce((n, r) => n + r.removed, 0), changed: rows.reduce((n, r) => n + r.changed, 0),
  sampled, sample_differ: sampleBad, problems,
};
if (args.includes('--json')) console.log(JSON.stringify({ ...report, by_collection: rows.filter((r) => r.a_rows || r.b_rows) }, null, 1));
else {
  for (const r of rows.filter((x) => x.a_rows || x.b_rows)) console.log(`${r.collection.padEnd(28)} ${String(r.a_rows).padStart(8)} ${String(r.b_rows).padStart(8)}  +${r.added} -${r.removed} ~${r.changed}`);
  console.log(JSON.stringify(report));
}
process.exit(report.ok ? 0 : 1);
