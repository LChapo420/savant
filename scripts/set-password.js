/**
 * Set an account's password directly in the store.
 *
 * The running server keeps its own copy of the data in memory and rewrites the
 * file on flush, so a password written here while the server is up is undone by
 * the next flush. Stop the server, run this, start the server again.
 *
 *   node scripts/set-password.js <email> <password>
 */
const bcrypt = require('bcryptjs');
const db = require('../config/db');

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error('usage: node scripts/set-password.js <email> <password>');
  process.exit(1);
}
if (password.length < 8) {
  console.error('the register route wants at least 8 characters');
  process.exit(1);
}

const user = db.findOne('users', (u) => String(u.email).trim().toLowerCase()
  === String(email).trim().toLowerCase());
if (!user) {
  console.error(`no account with that address`);
  process.exit(1);
}

db.update('users', user.id, { password_hash: bcrypt.hashSync(password, 10) });
db.flush();
console.log(`password set for ${user.email} (id ${user.id})`);
console.log('restart the server if it is running, or it will overwrite this on its next flush');
