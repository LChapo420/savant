/**
 * Invite a friend (services/referrals.js, routes/referral.js, the sign-up hook in routes/auth.js,
 * the funnel numbers in services/real-user-metrics.js):
 *
 *   node scripts/referrals-test.js
 *
 * Runs on a scratch data file; no model is called and nothing is sent.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const express = require('express');

const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'savant-referrals-test-'));
process.env.DB_FILE = path.join(SCRATCH, 'db.json');
process.env.NODE_ENV = 'test';
process.env.OWNER_EMAIL = 'founder@gmail.com';
process.env.TEAM_EMAIL_DOMAINS = 'savantedu.com';

let failed = 0;
function check(name, ok, detail) {
  if (ok) { console.log(`  ok   ${name}`); return; }
  failed++;
  console.log(`  FAIL ${name}${detail !== undefined ? `\n       ${JSON.stringify(detail).slice(0, 400)}` : ''}`);
}

const db = require('../config/db');
const referrals = require('../services/referrals');
const metrics = require('../services/real-user-metrics');

const mk = (doc) => db.insert('users', { display_name: doc.email || doc.username, onboarded: true, account_type: 'standard', ...doc });
const alice = mk({ email: 'alice@gmail.com' });
const child = mk({ username: 'kid1', email: null, account_type: 'child' });

console.log('\nCodes');
const code = referrals.codeFor(alice);
check('a code is 8 characters from the safe alphabet', referrals.CODE_RE.test(code), code);
check('asking again gives the same code', referrals.codeFor(db.byId('users', alice.id)) === code);
check('a child account gets no code', referrals.codeFor(child) === null && !db.byId('users', child.id).referral_code);
check('the code resolves to its owner, in any case and with spaces', referrals.resolve(` ${code.toUpperCase()} `).id === alice.id);
check('an unknown or malformed code resolves to nothing', referrals.resolve('abcdefgh') === null && referrals.resolve('x') === null && referrals.resolve('') === null && referrals.resolve({}) === null);

console.log('\nAttaching');
const bob = mk({ email: 'bob@gmail.com' });
check('a new standard account is recorded as invited', referrals.attach(bob, code) === true && db.byId('users', bob.id).referred_by === alice.id);
const carol = mk({ email: 'carol@gmail.com' });
check('a bad code records nothing', referrals.attach(carol, 'zzzzzzzz') === false && db.byId('users', carol.id).referred_by === undefined);
check('nobody invites themselves', referrals.attach(alice, code) === false && db.byId('users', alice.id).referred_by === undefined);
const kid2 = mk({ username: 'kid2', email: null, account_type: 'child' });
check('a child account is never recorded as invited', referrals.attach(kid2, code) === false && db.byId('users', kid2.id).referred_by === undefined);

console.log('\nWhat the inviter sees');
const s1 = db.insert('sessions', { user_id: bob.id, kind: 'placement', started_at: new Date().toISOString() });
db.insert('items', { user_id: bob.id, session_id: s1.id, answered_at: new Date().toISOString() });
check('a placement answer alone is not "started"', referrals.summary(alice).joined === 1 && referrals.summary(alice).started === 0, referrals.summary(alice));
const s2 = db.insert('sessions', { user_id: bob.id, kind: 'lesson', started_at: new Date().toISOString() });
db.insert('items', { user_id: bob.id, session_id: s2.id, answered_at: new Date().toISOString() });
check('a lesson answer counts as started', referrals.summary(alice).started === 1);
check('the summary holds counts only, no names or ids', Object.keys(referrals.summary(alice)).sort().join() === 'joined,started');

console.log('\nFunnel numbers');
const test = mk({ email: 'qa@example.com' });
referrals.attach(test, code);
const m = metrics.compute(db, { now: Date.now() });
check('real invited sign-ups are counted, test accounts are not', m.funnel.referrals.signed_up === 1 && m.funnel.referrals.inviters === 1, m.funnel.referrals);
check('invited and started is counted', m.funnel.referrals.started_learning === 1);
const csv = metrics.toCsv(m, 'funnel');
check('the funnel CSV has the invite rows', /invited_signed_up,/.test(csv) && /invited_started_learning,/.test(csv), csv);

console.log('\nSign-up hook');
const authApp = express();
authApp.use(express.json());
authApp.use((req, res, next) => {
  req.session = { regenerate: (cb) => cb(), save: (cb) => cb() };
  next();
});
authApp.use('/api/auth', require('../routes/auth'));
const authServer = http.createServer(authApp).listen(0);
const register = (body) => new Promise((resolve) => {
  const data = JSON.stringify(body);
  const req = http.request(`http://127.0.0.1:${authServer.address().port}/api/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } }, (res) => {
    res.resume(); res.on('end', () => resolve(res.statusCode));
  });
  req.end(data);
});
(async () => {
  const adult = { birth_year: 1990, birth_month: 5, country: 'US', password: 'longenough1', display_name: 'Dana' };
  const st1 = await register({ ...adult, email: 'dana@gmail.com', ref: code });
  check('register with a share code records the inviter', st1 === 201 && db.findOne('users', (u) => u.email === 'dana@gmail.com').referred_by === alice.id, st1);
  const st2 = await register({ ...adult, email: 'erin@gmail.com', ref: 'nonsense' });
  check('register with a bad code still works and records nothing', st2 === 201 && db.findOne('users', (u) => u.email === 'erin@gmail.com').referred_by === undefined, st2);
  authServer.close();
})().then(() => {
console.log('\nRoute');
const router = require('../routes/referral');
const app = express();
app.use((req, res, next) => { req.user = req.headers['x-user'] ? db.byId('users', Number(req.headers['x-user'])) : null; next(); });
app.use('/api', router);
const server = http.createServer(app).listen(0, async () => {
  const get = (user) => new Promise((resolve) => {
    http.get(`http://127.0.0.1:${server.address().port}/api/referral`, { headers: user ? { 'x-user': String(user) } : {} }, (res) => {
      const chunks = []; res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, json: (() => { try { return JSON.parse(Buffer.concat(chunks)); } catch { return null; } })() }));
    });
  });
  const mine = await get(alice.id);
  check('route: the learner gets a code, a path and counts', mine.status === 200 && mine.json.code === code && mine.json.path === `/register?ref=${code}` && mine.json.joined === 3 && mine.json.started === 1, mine);
  check('route: a child account is told it is off', (await get(child.id)).json.enabled === false);
  check('route: signed out is refused', (await get(null)).status === 401);
  server.close();
  fs.rmSync(SCRATCH, { recursive: true, force: true });
  if (failed) { console.log(`\n${failed} check(s) failed`); process.exit(1); }
  console.log('\nAll referral checks passed');
  process.exit(0);
});
});
