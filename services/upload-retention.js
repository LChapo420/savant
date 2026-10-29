/**
 * Retention for Spanish uploads (data/spanish-uploads, written by POST /api/es/upload).
 * Nothing in the app reads these files back, so they are deleted after a short window instead of kept.
 * UPLOAD_RETENTION_DAYS sets the window (default 7; 0 means delete on the next sweep).
 */
const fs = require('fs');
const path = require('path');

/** Where POST /api/es/upload writes. Files are named `u<user id>-<time>-<random>.<ext>` so they can be found by owner. */
const UPLOAD_DIR = path.join(__dirname, '..', 'data', 'spanish-uploads');

const DAY = 24 * 60 * 60 * 1000;

function retentionDays() {
  const n = Number(process.env.UPLOAD_RETENTION_DAYS);
  return Number.isFinite(n) && n >= 0 && process.env.UPLOAD_RETENTION_DAYS !== undefined && process.env.UPLOAD_RETENTION_DAYS !== '' ? n : 7;
}

/** Delete every file in dir last modified more than `days` ago. Returns how many were removed. */
function sweep(dir, { days = retentionDays(), now = Date.now() } = {}) {
  let removed = 0;
  let names;
  try { names = fs.readdirSync(dir); } catch (_) { return 0; }
  for (const name of names) {
    const file = path.join(dir, name);
    try {
      const st = fs.statSync(file);
      if (st.isFile() && now - st.mtimeMs >= days * DAY) { fs.unlinkSync(file); removed++; }
    } catch (_) { /* gone already, or unreadable: the next sweep tries again */ }
  }
  return removed;
}

/** Name for a new upload, tagged with its owner so account deletion can remove it. */
function nameFor(userId, ext, rand) {
  return `u${Number(userId) || 0}-${Date.now()}-${rand}.${ext}`;
}

/** Delete every upload that belongs to userId. Returns how many were removed. */
function removeForUser(userId, dir = UPLOAD_DIR) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id < 0) return 0;
  const prefix = `u${id}-`;
  let removed = 0;
  let names;
  try { names = fs.readdirSync(dir); } catch (_) { return 0; }
  for (const name of names) {
    if (!name.startsWith(prefix)) continue;
    try { fs.unlinkSync(path.join(dir, name)); removed++; } catch (_) { /* gone already */ }
  }
  return removed;
}

/** Sweep now and then every hour. The timer never keeps the process alive. */
function schedule(dir) {
  sweep(dir);
  const timer = setInterval(() => sweep(dir), 60 * 60 * 1000);
  if (timer.unref) timer.unref();
  return timer;
}

module.exports = { sweep, schedule, retentionDays, nameFor, removeForUser, UPLOAD_DIR };
