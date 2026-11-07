#!/usr/bin/env node
/**
 * Check the spend ledgers, and put back a damaged one from its newest good copy (services/durable-file.js keeps them in ledger-backups/).
 *
 *   node scripts/ledger-restore.js [--dir data]               say what state each is in, changes nothing
 *   node scripts/ledger-restore.js --dir data --write         restore every empty or unreadable ledger that has a copy
 *
 * A ledger that has gone is treated as damaged if it has a copy: with no file it would start again at $0. Exit 1 if anything is still wrong.
 * What was spent between the copy and the damage is not known, so it is estimated from the copy's log for the hour before it was taken and ADDED,
 * and the ledger says so in restored_note. Counting a little too much stops a provider slightly early; counting too little could spend past a cap.
 */
const fs = require('fs');
const path = require('path');
const durable = require('../services/durable-file');

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const dir = path.resolve(flag('dir', path.join(__dirname, '..', 'data')));
const WRITE = args.includes('--write');

const known = fs.readdirSync(path.join(__dirname, '..', 'services')).filter((n) => /-ledger\.js$/.test(n) && n !== 'credit-ledger.js').map((n) => n.replace(/\.js$/, '.json'));
const folder = durable.backupDir(path.join(dir, 'x.json'));
const withCopies = fs.existsSync(folder) ? fs.readdirSync(folder).map((n) => n.match(/^(.+-ledger)\.[^.]+\.json$/)).filter(Boolean).map((m) => `${m[1]}.json`) : [];
const names = [...new Set([...fs.readdirSync(dir).filter((n) => /-ledger\.json$/.test(n)), ...withCopies])].sort();
let bad = 0; let unfixed = 0;
for (const n of names) {
  const file = path.join(dir, n);
  const state = fs.existsSync(file) ? fs.statSync(file) : null;
  let text = null; let denied = false;
  if (state) { try { text = fs.readFileSync(file, 'utf8'); } catch (err) { denied = err.code; } }
  const ok = text && durable.goodLedger(text);
  if (ok) { console.log(`${n}: ok, $${Number(ok.settled_usd !== undefined ? ok.settled_usd : ok.counted_usd).toFixed(2)} settled`); continue; }
  bad++;
  const what = !state ? 'MISSING (with no file it would start again at $0)' : denied ? `cannot be read (${denied}): look at its owner and mode first, the app's user must read it` : state.size ? 'unreadable' : 'EMPTY';
  const copy = durable.newestGoodCopy(dir, n.replace(/\.json$/, ''));
  if (!copy) { unfixed++; console.log(`${n}: ${what}, no good copy: rebuild by hand; every paid call on it is refused until then`); continue; }
  const until = state ? state.mtimeMs : Date.now();
  const est = durable.spendSince(copy.data, copy.at, until);
  console.log(`${n}: ${what}. Newest good copy ${copy.name}, ${est.gapH.toFixed(2)} h before the damage; adding an estimated $${est.addUsd.toFixed(2)} for that time.`);
  if (!WRITE) { unfixed++; continue; }
  if (state) { try { fs.copyFileSync(file, `${file}.damaged-${Date.now()}`); } catch { /* it cannot be read: nothing to keep */ } }
  durable.restoreLedger(dir, n, copy, until);
}
const absent = known.filter((n) => !names.includes(n));
if (absent.length) console.log(`No file and no copy, so at $0 if they are ever used: ${absent.join(', ')}. Fine if that provider never ran here; if it did, restore it from a backup set first.`);
console.log(bad ? `${bad} damaged or missing${WRITE ? '' : ' (nothing changed; --write restores)'}` : 'all ledgers present are ok');
process.exit(unfixed ? 1 : 0);
