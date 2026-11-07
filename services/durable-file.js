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
 *
 * A copy used to be taken only when a ledger was written, and only the first write in an interval. So on the server (Nov 2026) two of nine ledgers
 * had any copy at all, and those missed the last write. startLedgerSweep() fixes both: at boot and every interval, any ledger newer than its newest
 * copy gets one. It also puts back a ledger whose file has gone while copies of it exist: a ledger with no file starts again at $0, which would
 * forget a provider's whole spend and let it pass its cap with no error anywhere.
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

const LEDGER_FILE = /-ledger\.json$/;

/** A ledger's parsed content if it can be trusted, else null. */
function goodLedger(text) {
  try {
    const d = JSON.parse(text);
    return d && typeof d === 'object' && Number.isFinite(Number(d.settled_usd !== undefined ? d.settled_usd : d.counted_usd)) ? d : null;
  } catch { return null; }
}

/** The copies of one ledger, newest first. `base` is the file's name without .json. */
function copiesOf(dir, base) {
  const folder = backupDir(path.join(dir, 'x.json'));
  if (!fs.existsSync(folder)) return [];
  return fs.readdirSync(folder).filter((n) => n.startsWith(`${base}.`) && n.endsWith('.json')).sort().reverse().map((n) => path.join(folder, n));
}

function newestGoodCopy(dir, base) {
  for (const full of copiesOf(dir, base)) {
    try {
      const data = goodLedger(fs.readFileSync(full, 'utf8'));
      if (data) return { file: full, name: path.basename(full), data, at: fs.statSync(full).mtimeMs };
    } catch { /* look at the next */ }
  }
  return null;
}

/**
 * What was spent between a copy and now is not known, so it is estimated: what the copy's log shows for the hour before the copy was taken, for each
 * hour since. A ledger idle at the time of the copy adds nothing; a busy one adds its rate, which can stop a provider a little early and never late.
 */
function spendSince(data, copyAt, untilMs) {
  const log = Array.isArray(data.log) ? data.log : [];
  const hourUsd = log.filter((l) => { const t = Date.parse(l.at); return t > copyAt - 3600000 && t <= copyAt + 60000; }).reduce((a, l) => a + (Number(l.usd) || 0), 0);
  const gapH = Math.max(0, (untilMs - copyAt) / 3600000);
  return { gapH, addUsd: Number((hourUsd * gapH).toFixed(6)) };
}

/** Write a ledger from a good copy, durably, adding the estimate and saying so in the file. */
function restoreLedger(dir, name, copy, untilMs = Date.now()) {
  const file = path.join(dir, name);
  const { gapH, addUsd } = spendSince(copy.data, copy.at, untilMs);
  const data = copy.data;
  if (data.settled_usd !== undefined) data.settled_usd = Number((Number(data.settled_usd) + addUsd).toFixed(6));
  data.restored_note = `${new Date().toISOString()}: restored from ${copy.name}; $${addUsd.toFixed(2)} added as an estimate of spend after the copy.`;
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
  commit(tmp, file);
  return { gapH, addUsd };
}

/** Any ledger whose file has gone while copies of it exist comes back from the newest good copy. Returns what it did. Never throws. */
function restoreMissingLedgers(dir) {
  const done = [];
  try {
    const folder = backupDir(path.join(dir, 'x.json'));
    if (!fs.existsSync(folder)) return done;
    const bases = new Set(fs.readdirSync(folder).map((n) => n.match(/^(.+-ledger)\.[^.]+\.json$/)).filter(Boolean).map((m) => m[1]));
    for (const base of bases) {
      const name = `${base}.json`;
      if (fs.existsSync(path.join(dir, name))) continue;
      const copy = newestGoodCopy(dir, base);
      if (!copy) { console.error(`LEDGER MISSING: ${name} is gone and has no good copy. It will start again at $0 spent. Set its spend by hand.`); done.push({ name, restored: false }); continue; }
      const r = restoreLedger(dir, name, copy);
      console.error(`LEDGER MISSING: ${name} was gone. Restored from ${copy.name}, adding an estimated $${r.addUsd.toFixed(2)}. Check its spend against the provider.`);
      done.push({ name, restored: true, ...r });
    }
  } catch (err) { console.warn(`ledger check failed: ${err.message}`); }
  return done;
}

/** Every ledger newer than its newest copy gets a copy now, in that interval's slot. Returns the copies made. Never throws. */
function sweepLedgers(dir) {
  const made = [];
  try {
    for (const name of fs.readdirSync(dir).filter((n) => LEDGER_FILE.test(n))) {
      const file = path.join(dir, name);
      if (!backupsOn(file)) continue;
      const base = path.basename(name, '.json');
      const newest = copiesOf(dir, base)[0];
      const at = fs.statSync(file).mtimeMs;
      if (newest && fs.statSync(newest).mtimeMs >= at) continue;
      const every = Number(process.env.LEDGER_BACKUP_MINUTES || 10) * 60000;
      const bucket = new Date(Math.floor(Date.now() / every) * every).toISOString().replace(/[-:]/g, '').slice(0, 13);
      const folder = backupDir(file);
      fs.mkdirSync(folder, { recursive: true });
      const dest = path.join(folder, `${base}.${bucket}.json`);
      const tmp = `${dest}.${process.pid}.tmp`;
      fs.copyFileSync(file, tmp);
      syncFile(tmp);
      fs.renameSync(tmp, dest);
      prune(folder, base);
      lastCopy.set(file, Date.now());
      made.push(dest);
    }
  } catch (err) { console.warn(`ledger sweep failed: ${err.message}`); }
  return made;
}

/** At boot and every interval. The folder is the one the ledgers live in (data/). */
function startLedgerSweep(dir) {
  if (process.env.LEDGER_BACKUP === 'off') return null;
  if (process.env.NODE_ENV === 'production') restoreMissingLedgers(dir);
  sweepLedgers(dir);
  const t = setInterval(() => sweepLedgers(dir), Number(process.env.LEDGER_BACKUP_MINUTES || 10) * 60000);
  t.unref();
  return t;
}

module.exports = { commit, syncFile, syncFolder, backup, backupDir, prune, goodLedger, copiesOf, newestGoodCopy, spendSince, restoreLedger, restoreMissingLedgers, sweepLedgers, startLedgerSweep };
