/**
 * The SQLite layout shared by config/db-sqlite.js (the staged driver) and
 * scripts/migrate-json-to-sqlite.js. Loading this file opens nothing.
 *
 * One table holds every collection: (coll, id) is the key, `doc` is the row's
 * JSON exactly as the app holds it, and `pos` keeps the array order the JSON
 * store has (inserts append; nothing reorders).
 */
const fs = require('fs');
const path = require('path');

/** The collection list is read from config/db.js, so there is one list. */
function readCollections() {
  const src = fs.readFileSync(path.join(__dirname, 'db.js'), 'utf8');
  const block = src.match(/const COLLECTIONS = \[([\s\S]*?)\];/);
  if (!block) throw new Error('db-sqlite: could not read COLLECTIONS from config/db.js');
  return [...block[1].matchAll(/^\s*'([a-z_]+)'/gm)].map((m) => m[1]);
}
const COLLECTIONS = readCollections();

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS rows (coll TEXT NOT NULL, id INTEGER NOT NULL, pos INTEGER NOT NULL, doc TEXT NOT NULL, PRIMARY KEY (coll, id)) WITHOUT ROWID;
  CREATE INDEX IF NOT EXISTS rows_order ON rows (coll, pos);
  CREATE TABLE IF NOT EXISTS counters (coll TEXT PRIMARY KEY, value INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
`;

function open(file, { readOnly = false } = {}) {
  // eslint-disable-next-line global-require
  const { DatabaseSync } = require('node:sqlite');
  const d = new DatabaseSync(file, readOnly ? { readOnly: true } : {});
  if (!readOnly) {
    d.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;');
    d.exec(SCHEMA);
  }
  return d;
}

module.exports = { COLLECTIONS, SCHEMA, open, readCollections };
