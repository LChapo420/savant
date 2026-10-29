/**
 * Retention for Spanish uploads (data/spanish-uploads, written by POST /api/es/upload).
 * Nothing in the app reads these files back, so they are deleted after a short window instead of kept.
 * UPLOAD_RETENTION_DAYS sets the window (default 7; 0 means delete on the next sweep).
 */
const fs = require('fs');
const path = require('path');

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

/** Sweep now and then every hour. The timer never keeps the process alive. */
function schedule(dir) {
  sweep(dir);
  const timer = setInterval(() => sweep(dir), 60 * 60 * 1000);
  if (timer.unref) timer.unref();
  return timer;
}

module.exports = { sweep, schedule, retentionDays };
