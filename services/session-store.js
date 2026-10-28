/**
 * A session store for express-session on Node's built-in SQLite (node:sqlite).
 *
 * STAGED (2026-10-24, curriculum-build/BETA-LAUNCH-KIT.md section 2). server.js
 * uses express-session's default MemoryStore today. Its own docs say that store
 * "is purposely not designed for a production environment": it leaks memory and
 * every restart (each deploy, each crash) signs every tester out. Wiring this in
 * is one option on the session() call, in
 * curriculum-build/staged/beta-launch/server.js.patch.
 *
 * No new package: node:sqlite ships with Node 22.5+ (this machine runs 24.19).
 * The file is SESSION_DB_FILE, default `sessions.sqlite` beside the data file.
 * It holds session ids and the session JSON (user id, age-screen answer, a beta
 * invite code), so it is as private as the data file. It is not backed up: losing
 * it only signs people out.
 */
const fs = require('fs');
const path = require('path');
const session = require('express-session');

function defaultFile() {
  if (process.env.SESSION_DB_FILE) return path.resolve(process.env.SESSION_DB_FILE);
  const dir = process.env.DB_FILE ? path.dirname(path.resolve(process.env.DB_FILE)) : path.join(__dirname, '..', 'data');
  return path.join(dir, 'sessions.sqlite');
}

class SqliteSessionStore extends session.Store {
  /**
   * @param {object} [opts]
   * @param {string} [opts.file]       the SQLite file (':memory:' for tests)
   * @param {number} [opts.ttlMs]      used when a session has no cookie expiry (default 1 day)
   * @param {number} [opts.pruneMs]    how often expired rows are deleted (default 15 min; 0 = never)
   */
  constructor({ file = defaultFile(), ttlMs = 86400000, pruneMs = 15 * 60 * 1000 } = {}) {
    super();
    // Required here, not at the top, so loading this file on an older Node fails
    // only when the store is actually used.
    // eslint-disable-next-line global-require
    const { DatabaseSync } = require('node:sqlite');
    if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
    this.db.exec('CREATE TABLE IF NOT EXISTS sessions (sid TEXT PRIMARY KEY, expires INTEGER NOT NULL, data TEXT NOT NULL)');
    this.db.exec('CREATE INDEX IF NOT EXISTS sessions_expires ON sessions (expires)');
    this.q = {
      get: this.db.prepare('SELECT data, expires FROM sessions WHERE sid = ?'),
      set: this.db.prepare('INSERT INTO sessions (sid, expires, data) VALUES (?, ?, ?) ON CONFLICT(sid) DO UPDATE SET expires = excluded.expires, data = excluded.data'),
      touch: this.db.prepare('UPDATE sessions SET expires = ? WHERE sid = ?'),
      destroy: this.db.prepare('DELETE FROM sessions WHERE sid = ?'),
      prune: this.db.prepare('DELETE FROM sessions WHERE expires <= ?'),
      count: this.db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE expires > ?'),
      clear: this.db.prepare('DELETE FROM sessions'),
    };
    this.ttlMs = ttlMs;
    if (pruneMs > 0) {
      this.timer = setInterval(() => { try { this.prune(); } catch { /* next time */ } }, pruneMs);
      this.timer.unref();
    }
  }

  expiresOf(sess) {
    const at = sess && sess.cookie && sess.cookie.expires ? new Date(sess.cookie.expires).getTime() : NaN;
    return Number.isFinite(at) ? at : Date.now() + this.ttlMs;
  }

  get(sid, cb) {
    try {
      const row = this.q.get.get(sid);
      if (!row) return cb(null, null);
      if (row.expires <= Date.now()) { this.q.destroy.run(sid); return cb(null, null); }
      return cb(null, JSON.parse(row.data));
    } catch (err) { return cb(err); }
  }

  set(sid, sess, cb = () => {}) {
    try { this.q.set.run(sid, this.expiresOf(sess), JSON.stringify(sess)); cb(null); } catch (err) { cb(err); }
  }

  touch(sid, sess, cb = () => {}) {
    try { this.q.touch.run(this.expiresOf(sess), sid); cb(null); } catch (err) { cb(err); }
  }

  destroy(sid, cb = () => {}) {
    try { this.q.destroy.run(sid); cb(null); } catch (err) { cb(err); }
  }

  length(cb) {
    try { cb(null, this.q.count.get(Date.now()).n); } catch (err) { cb(err); }
  }

  clear(cb = () => {}) {
    try { this.q.clear.run(); cb(null); } catch (err) { cb(err); }
  }

  prune() {
    return Number(this.q.prune.run(Date.now()).changes || 0);
  }

  close() {
    if (this.timer) clearInterval(this.timer);
    try { this.db.close(); } catch { /* already closed */ }
  }
}

module.exports = { SqliteSessionStore, defaultFile };
