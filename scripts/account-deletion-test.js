/**
 * Delete your own account (services/account-deletion.js, POST /api/account/delete in routes/profile.js):
 *
 *   node scripts/account-deletion-test.js
 *
 * Runs on a scratch data file; no model is called and nothing is sent.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const express = require('express');
const bcrypt = require('bcryptjs');

const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'savant-account-deletion-test-'));
process.env.DB_FILE = path.join(SCRATCH, 'db.json');
process.env.NODE_ENV = 'test';
process.env.OWNER_EMAIL = 'founder@gmail.com';

let failed = 0;
function check(name, ok, detail) {
  if (ok) { console.log(`  ok   ${name}`); return; }
  failed++;
  console.log(`  FAIL ${name}${detail !== undefined ? `\n       ${JSON.stringify(detail).slice(0, 400)}` : ''}`);
}

const db = require('../config/db');
const deletion = require('../services/account-deletion');

const hash = bcrypt.hashSync('longenough1', 4);
const mk = (doc) => db.insert('users', { display_name: doc.email || doc.username, onboarded: true, account_type: 'standard', password_hash: hash, ...doc });
const alice = mk({ email: 'alice@gmail.com' });
const bob = mk({ email: 'bob@gmail.com' });
const invitee = mk({ email: 'inv@gmail.com', referred_by: alice.id });
const child = mk({ username: 'kid1', email: null, account_type: 'child' });
const owner = mk({ email: 'founder@gmail.com' });

for (const u of [alice, bob]) {
  db.insert('enrollments', { user_id: u.id, track_id: 'act' });
  db.insert('essays', { user_id: u.id, text: 'mine' });
  db.insert('materials', { user_id: u.id, title: 'notes' });
}

console.log('\nService');
check('refusal: a standard account may delete', deletion.refusal(db.byId('users', alice.id)) === null);
check('refusal: a child account may not', /parent/i.test(deletion.refusal(child) || ''));
check('refusal: the owner may not', !!deletion.refusal(owner));
process.env.ACCOUNT_DELETE = 'off';
check('refusal: ACCOUNT_DELETE=off blocks everyone', !!deletion.refusal(db.byId('users', alice.id)));
delete process.env.ACCOUNT_DELETE;

console.log('\nRoute');
const router = require('../routes/profile');
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  req.user = req.headers['x-user'] ? db.byId('users', Number(req.headers['x-user'])) : null;
  req.session = { destroy: (cb) => { req.session.destroyed = true; cb(); } };
  next();
});
app.use('/api', router);
const server = http.createServer(app).listen(0, async () => {
  const post = (user, body) => new Promise((resolve) => {
    const data = JSON.stringify(body);
    const headers = { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) };
    if (user) headers['x-user'] = String(user);
    const req = http.request(`http://127.0.0.1:${server.address().port}/api/account/delete`, { method: 'POST', headers }, (res) => {
      const chunks = []; res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, json: (() => { try { return JSON.parse(Buffer.concat(chunks)); } catch { return null; } })() }));
    });
    req.end(data);
  });
  check('signed out is refused', (await post(null, { password: 'longenough1', confirm: 'DELETE' })).status === 401);
  check('without the word DELETE nothing happens', (await post(alice.id, { password: 'longenough1', confirm: 'delete me' })).status === 400 && !!db.byId('users', alice.id));
  check('a wrong password is refused and nothing is deleted', (await post(alice.id, { password: 'nope-nope-1', confirm: 'DELETE' })).status === 401 && !!db.byId('users', alice.id));
  check('a child account is refused', (await post(child.id, { password: 'longenough1', confirm: 'DELETE' })).status === 403 && !!db.byId('users', child.id));
  check('the owner is refused', (await post(owner.id, { password: 'longenough1', confirm: 'DELETE' })).status === 403 && !!db.byId('users', owner.id));

  let r403;
  const ok = await post(alice.id, { password: 'longenough1', confirm: 'DELETE' });
  check('the right password and word delete the account', ok.status === 200 && ok.json.ok === true && !db.byId('users', alice.id), ok);
  check('every row of hers is gone', ['enrollments', 'essays', 'materials'].every((c) => db.find(c, (r) => r.user_id === alice.id).length === 0));
  check('another learner\'s rows are untouched', ['enrollments', 'essays', 'materials'].every((c) => db.find(c, (r) => r.user_id === bob.id).length === 1) && !!db.byId('users', bob.id));
  check('someone she invited keeps their account, with the tie cleared', !!db.byId('users', invitee.id) && db.byId('users', invitee.id).referred_by === null);
  check('a second delete finds no account (signed out)', (await post(null, { password: 'longenough1', confirm: 'DELETE' })).status === 401);

  process.env.ACCOUNT_DELETE = 'off';
  check('route: ACCOUNT_DELETE=off refuses', (r403 = await post(bob.id, { password: 'longenough1', confirm: 'DELETE' })).status === 403 && !!db.byId('users', bob.id), r403);
  delete process.env.ACCOUNT_DELETE;

  server.close();
  fs.rmSync(SCRATCH, { recursive: true, force: true });
  console.log(failed ? `\n${failed} check(s) failed` : '\nAll account-deletion checks passed');
  process.exit(failed ? 1 : 0);
});
