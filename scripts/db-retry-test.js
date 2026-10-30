/**
 * config/db.js: a save that fails for a moment (Windows EPERM/EBUSY while another program holds
 * db.json open) is retried, the process keeps running, and the change is saved. Before the fix
 * the error was thrown from the save timer and crashed the server.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'db-retry-'));
process.env.DB_FILE = path.join(dir, 'db.json');

const realRename = fs.renameSync;
let fails = 3;
fs.renameSync = function renameSync(...args) {
  if (fails > 0) { fails--; const e = new Error('locked'); e.code = 'EPERM'; throw e; }
  return realRename.apply(this, args);
};

let failures = 0;
function check(label, ok, detail) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : ` ${JSON.stringify(detail)}`}`);
  if (!ok) failures++;
}

let crashed = null;
process.on('uncaughtException', (e) => { crashed = e; });

const db = require('../config/db');
db.insert('users', { email: 'retry@example.test' });

setTimeout(() => {
  check('a save blocked three times does not crash the process', crashed === null, crashed && crashed.message);
  let saved = null;
  try { saved = JSON.parse(fs.readFileSync(process.env.DB_FILE, 'utf8')); } catch { /* not saved */ }
  check('the change is saved once the file is free', !!saved && saved.users.some((u) => u.email === 'retry@example.test'));
  check('every blocked attempt was retried', fails === 0, fails);
  fs.renameSync = realRename;
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* temp */ }
  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
  process.exit(failures ? 1 : 0);
}, 5000);
