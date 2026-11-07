#!/usr/bin/env node
/**
 * One account's own part-modify switch (services/part-modify.js), from the command line, on the database in DB_FILE. The owner runs this, or uses the admin route
 * POST /api/admin/users/:id/part-modify { value: 'on' | 'off' | null }.
 *
 *   node scripts/part-modify-account.js --email someone@example.com --value on
 *   node scripts/part-modify-account.js --email someone@example.com             (only reads it)
 */
const argv = process.argv.slice(2);
const arg = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };
const db = require('../config/db');
const pm = require('../services/part-modify');

const email = String(arg('email') || '').toLowerCase();
const user = db.findOne('users', (u) => String(u.email || '').toLowerCase() === email);
if (!user) { console.error('No such account.'); process.exit(1); }
const v = arg('value');
if (v !== undefined) {
  if (!['on', 'off', 'default'].includes(v)) { console.error('--value must be on, off or default.'); process.exit(1); }
  db.update('users', user.id, { part_modify: v === 'default' ? null : v });
}
console.log(`account ${user.id}: setting ${(db.byId('users', user.id).part_modify) || 'default'}, effective ${pm.enabled(user.id) ? 'on' : 'off'}`);
process.exit(0);
