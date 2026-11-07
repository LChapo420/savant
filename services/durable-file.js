/**
 * Replacing a file so that a power cut cannot leave it empty, and keeping copies of the spend ledgers.
 *
 * Writing a temp file and renaming it protects against a crash of the program, not of the machine: the rename can reach the disk before the
 * bytes do, and after a hard power-off the file is there with nothing in it. That happened on 6 Nov 2026: five ledgers came back as zero bytes
 * and had to be rebuilt from estimates. So the temp file is flushed to the disk before the rename, and the folder after it (Linux; Windows has
 * no way to do that and does not need it). DURABLE_FSYNC=off skips this.
 *
 * Ledgers had no copy at all. commit(tmp, file, { backup: true }) also keeps one in <folder>/ledger-backups/ every LEDGER_BACKUP_MINUTES (10):
 * the last 12, plus the newest of each day for 14 days. LEDGER_BACKUP=off stops it; files in the system temp folder (tests) are skipped unless
 * LEDGER_BACKUP=on. A copy that fails never stops the write. scripts/ledger-restore.js puts one back.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const fsyncOn = () => process.env.DURABLE_FSYNC !== 'off';

function syncFile(file) {
  if (!fsyncOn()) return;
  const fd = fs.openSync(file, 'r+');
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

function syncFolder(dir) {
  if (!fsyncOn() || process.platform === 'win32') return;
  try {
    const fd = fs.openSync(dir, 'r');
    try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  } catch { /* some file systems refuse: the file itself is safe, only its rename may be older */ }
}

const lastCopy = new Map();

const backupDir = (file) => path.join(path.dirname(file), 'ledger-backups');

function backupsOn(file) {
  const v = String(process.env.LEDGER_BACKUP || '').toLowerCase();
  if (v === 'off') return false;
  if (v === 'on') return true;
  return !path.resolve(file).startsWith(path.resolve(os.tmpdir()));
}

/** Keep the newest `keep` copies, and the newest of each UTC day for `days` days. */
function prune(dir, base, keep = 12, days = 14) {
  const prefix = `${base}.`;
  const names = fs.readdirSync(dir).filter((n) => n.startsWith(prefix) && n.endsWith('.json')).sort().reverse();
  const seenDay = new Set();
  const cutoff = Date.now() - days * 86400000;
  names.forEach((n, i) => {
    const stamp = n.slice(prefix.length, -'.json'.length);
    const day = stamp.slice(0, 8);
    const at = Date.UTC(Number(day.slice(0, 4)), Number(day.slice(4, 6)) - 1, Number(day.slice(6, 8)));
    const keepIt = i < keep || (!seenDay.has(day) && at >= cutoff);
    seenDay.add(day);
    if (!keepIt) { try { fs.unlinkSync(path.join(dir, n)); } catch { /* raced */ } }
  });
}

/** A copy of the file as it stands, at most once per interval. Never throws. */
function backup(file) {
  if (!backupsOn(file)) return null;
  const every = Number(process.env.LEDGER_BACKUP_MINUTES || 10) * 60000;
  const now = Date.now();
  if (now - (lastCopy.get(file) || 0) < every) return null;
  lastCopy.set(file, now);
  try {
    const dir = backupDir(file);
    fs.mkdirSync(dir, { recursive: true });
    const bucket = new Date(Math.floor(now / every) * every).toISOString().replace(/[-:]/g, '').slice(0, 13);
    const base = path.basename(file, '.json');
    const dest = path.join(dir, `${base}.${bucket}.json`);
    if (fs.existsSync(dest)) return null; // another process took this one
    const tmp = `${dest}.${process.pid}.tmp`;
    fs.copyFileSync(file, tmp);
    syncFile(tmp);
    fs.renameSync(tmp, dest);
    prune(dir, base);
    return dest;
  } catch (err) {
    console.warn(`ledger backup failed: ${err.message}`);
    return null;
  }
}

/** Put a finished temp file in place of the real one, durably. */
function commit(tmp, file, { backup: copy = false } = {}) {
  syncFile(tmp);
  fs.renameSync(tmp, file);
  syncFolder(path.dirname(file));
  if (copy) backup(file);
}

module.exports = { commit, syncFile, syncFolder, backup, backupDir, prune };
