#!/usr/bin/env node
/**
 * Check the spend ledgers, and put back a damaged one from its newest good copy (services/durable-file.js keeps them in ledger-backups/).
 *
 *   node scripts/ledger-restore.js [--dir data]               say what state each is in, changes nothing
 *   node scripts/ledger-restore.js --dir data --write         restore every empty or unreadable ledger that has a copy
 *
 * What was spent between the copy and the damage is not known, so it is estimated from the copy's own last hour of log and ADDED, and the
 * ledger says so in restored_note. Counting a little too much stops a provider slightly early; counting too little could spend past a cap.
 */
const fs = require('fs');
const path = require('path');
const durable = require('../services/durable-file');

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const dir = path.resolve(flag('dir', path.join(__dirname, '..', 'data')));
const WRITE = args.includes('--write');

const good = (text) => {
  try { const d = JSON.parse(text); return d && typeof d === 'object' && Number.isFinite(Number(d.settled_usd !== undefined ? d.settled_usd : d.counted_usd)) ? d : null; } catch { return null; }
};

const backups = durable.backupDir(path.join(dir, 'x.json'));
const names = fs.readdirSync(dir).filter((n) => /-ledger\.json$/.test(n));
let bad = 0;
for (const n of names) {
  const file = path.join(dir, n);
  const state = fs.statSync(file);
  const ok = state.size > 0 && good(fs.readFileSync(file, 'utf8'));
  if (ok) { console.log(`${n}: ok, $${Number(ok.settled_usd !== undefined ? ok.settled_usd : ok.counted_usd).toFixed(2)} settled`); continue; }
  bad++;
  const base = n.replace(/\.json$/, '');
  const copies = fs.existsSync(backups) ? fs.readdirSync(backups).filter((b) => b.startsWith(`${base}.`) && b.endsWith('.json')).sort().reverse() : [];
  let found = null;
  for (const c of copies) {
    const full = path.join(backups, c);
    const d = good(fs.readFileSync(full, 'utf8'));
    if (d) { found = { name: c, data: d, at: fs.statSync(full).mtimeMs }; break; }
  }
  if (!found) { console.log(`${n}: ${state.size ? 'unreadable' : 'EMPTY'}, no good copy: rebuild by hand; every paid call on it is refused until then`); continue; }
  const log = found.data.log || [];
  const lastAt = log.length ? Date.parse(log[log.length - 1].at) : found.at;
  const hourUsd = log.filter((l) => Date.parse(l.at) > lastAt - 3600000).reduce((a, l) => a + (Number(l.usd) || 0), 0);
  const gapH = Math.max(0, (state.mtimeMs - found.at) / 3600000);
  const addUsd = Number((hourUsd * gapH).toFixed(6));
  console.log(`${n}: ${state.size ? 'unreadable' : 'EMPTY'}. Newest good copy ${found.name}, ${gapH.toFixed(2)} h before the damage; adding an estimated $${addUsd.toFixed(2)} for that time.`);
  if (!WRITE) continue;
  const data = found.data;
  if (data.settled_usd !== undefined) data.settled_usd = Number((Number(data.settled_usd) + addUsd).toFixed(6));
  data.restored_note = `${new Date().toISOString()}: restored from ${found.name}; $${addUsd.toFixed(2)} added as an estimate of spend after the copy.`;
  fs.copyFileSync(file, `${file}.damaged-${Date.now()}`);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
  durable.commit(tmp, file);
}
console.log(bad ? `${bad} damaged${WRITE ? '' : ' (nothing changed; --write restores)'}` : 'all ledgers ok');
process.exit(0);
