/**
 * ACT score entry (services/act-scores.js, routes/act.js, public/js/act-scores.js):
 *
 *   node scripts/act-scores-test.js
 *
 * Runs on a throwaway db. Checks the validation, the composite, per-learner isolation,
 * the routes, that the data is exported and deleted with the account, and the page wiring.
 */
const os = require('os');
const path = require('path');
const fs = require('fs');
const http = require('http');

process.env.NODE_ENV = 'test';
const tmp = path.join(os.tmpdir(), `act-scores-test-${process.pid}.json`);
process.env.DB_FILE = tmp;

const express = require('express');
const db = require('../config/db');
const act = require('../services/act-scores');

let failures = 0;
let passes = 0;
function check(label, ok, detail) {
  if (ok) { passes++; console.log(`  ok   ${label}`); return; }
  failures++;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 300)}`}`);
}

function serve(router) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.user = db.byId('users', Number(req.headers['x-user'])) || null; next(); });
  app.use('/api/act', router);
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const call = (method, url, body, uid) => new Promise((ok, fail) => {
        const data = body ? JSON.stringify(body) : null;
        const req = http.request({ host: '127.0.0.1', port, path: url, method, headers: { 'content-type': 'application/json', 'x-user': String(uid || ''), ...(data ? { 'content-length': Buffer.byteLength(data) } : {}) } }, (res) => {
          let text = '';
          res.on('data', (c) => { text += c; });
          res.on('end', () => { let json = null; try { json = JSON.parse(text); } catch { json = text; } ok({ status: res.statusCode, json }); });
        });
        req.on('error', fail);
        if (data) req.write(data);
        req.end();
      });
      resolve({ call, close: () => server.close() });
    });
  });
}

(async () => {
  const NOW = Date.parse('2026-10-28T12:00:00Z');

  console.log('validation and composite');
  check('composite rounds the average of E, M, R', act.composite({ english: 24, math: 25, reading: 26 }) === 25 && act.composite({ english: 20, math: 21, reading: 21 }) === 21);
  check('half rounds up', act.composite({ english: 20, math: 21, reading: 22 }) === 21 && act.composite({ english: 20, math: 20, reading: 21 }) === 20 && act.composite({ english: 20, math: 21, reading: 21 }) === 21);
  check('composite null when a section is missing', act.composite({ english: 20, math: 21, reading: null }) === null);
  check('science does not change the composite', act.cleanScore({ taken_on: '2026-10-01', english: 20, math: 20, reading: 20, science: 36 }, NOW).value.composite === 20);
  check('real dates only', act.validDate('2026-02-28') && !act.validDate('2026-02-30') && !act.validDate('26-02-01') && !act.validDate(20260201));
  for (const bad of [{ english: 0 }, { english: 37 }, { english: 20.5 }, { english: '20' }, { math: null }, { kind: 'mock' }, { taken_on: '2026-13-01' }, { taken_on: '2026-12-25' }, { taken_on: '2010-01-01' }, { form: 'x'.repeat(41) }, { science: 40 }]) {
    const r = act.cleanScore({ kind: 'practice', taken_on: '2026-10-01', english: 20, math: 20, reading: 20, ...bad }, NOW);
    check(`rejects ${JSON.stringify(bad)}`, !!r.error, r);
  }
  check('science is optional', act.cleanScore({ taken_on: '2026-10-01', english: 20, math: 20, reading: 20 }, NOW).value.science === null);
  check('profile: bad date and target rejected', !!act.cleanProfile({ test_date: '2026-02-30' }, NOW).error && !!act.cleanProfile({ target: 37 }, NOW).error && !!act.cleanProfile({ test_date: '2040-01-01' }, NOW).error);
  check('profile: null clears', act.cleanProfile({ test_date: null, target: null }, NOW).value.target === null);
  check('days to test', act.daysToTest('2026-11-07', NOW) === 10 && act.daysToTest('2026-10-28', NOW) === 0 && act.daysToTest('2026-10-27', NOW) === -1 && act.daysToTest(null, NOW) === null);

  console.log('routes');
  const a = db.insert('users', { email: 'act-a@example.test', display_name: 'A', password_hash: 'x' });
  const b = db.insert('users', { email: 'act-b@example.test', display_name: 'B', password_hash: 'x' });
  const { call, close } = await serve(require('../routes/act'));
  check('signed-out is 401', (await call('GET', '/api/act/scores')).status === 401 && (await call('POST', '/api/act/scores', {})).status === 401);
  let r = await call('GET', '/api/act/scores', null, a.id);
  check('empty to start', r.status === 200 && r.json.scores.length === 0 && r.json.profile.target === null && r.json.days_to_test === null, r.json);
  r = await call('POST', '/api/act/profile', { test_date: '2027-02-06', target: 28 }, a.id);
  check('profile saved', r.status === 200 && r.json.profile.target === 28 && r.json.profile.test_date === '2027-02-06', r.json);
  r = await call('POST', '/api/act/profile', { target: 30 }, a.id);
  check('a partial update keeps the date', r.json.profile.target === 30 && r.json.profile.test_date === '2027-02-06', r.json);
  check('one profile row per learner', db.find('act_profiles', (p) => p.user_id === a.id).length === 1);
  r = await call('POST', '/api/act/profile', { target: 99 }, a.id);
  check('bad profile is 400', r.status === 400);
  r = await call('POST', '/api/act/scores', { kind: 'practice', taken_on: '2026-09-01', form: 'A', english: 20, math: 21, reading: 22, science: 23 }, a.id);
  check('score added', r.status === 201 && r.json.score.composite === 21 && r.json.scores.length === 1, r.json);
  await call('POST', '/api/act/scores', { taken_on: '2026-07-01', english: 18, math: 18, reading: 18 }, a.id);
  r = await call('GET', '/api/act/scores', null, a.id);
  check('listed oldest first', r.json.scores.map((s) => s.taken_on).join() === '2026-07-01,2026-09-01', r.json.scores);
  check('latest composite and gap to target', r.json.latest_composite === 21 && r.json.points_to_target === 9, r.json);
  r = await call('POST', '/api/act/scores', { taken_on: '2026-09-01', english: 99, math: 1, reading: 1 }, a.id);
  check('bad score is 400', r.status === 400 && /english/.test(r.json.error), r.json);
  check('user_id in the body is ignored', (await call('POST', '/api/act/scores', { user_id: b.id, taken_on: '2026-08-01', english: 19, math: 19, reading: 19 }, a.id)).status === 201 && act.listScores(b.id).length === 0);
  check('another learner sees none of it', (await call('GET', '/api/act/scores', null, b.id)).json.scores.length === 0);
  const aId = act.listScores(a.id)[0].id;
  check("cannot delete another learner's score", (await call('DELETE', `/api/act/scores/${aId}`, null, b.id)).status === 404 && act.listScores(a.id).length === 3);
  r = await call('DELETE', `/api/act/scores/${aId}`, null, a.id);
  check('own score deleted', r.status === 200 && r.json.scores.length === 2);
  for (let i = 0; i < act.MAX_SCORES; i++) act.addScore(b.id, { kind: 'practice', taken_on: '2026-01-01', form: '', english: 10, math: 10, reading: 10, science: null, composite: 10 });
  check('capped per learner', (await call('POST', '/api/act/scores', { taken_on: '2026-08-01', english: 19, math: 19, reading: 19 }, b.id)).status === 400);
  close();

  console.log('wiring');
  const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  check('exported with the account', /'act_profiles', 'act_scores'/.test(read('routes/profile.js')));
  check('deleted with the account', /'act_profiles', 'act_scores'/.test(read('routes/consent.js')));
  check('mounted in the server', /\/api\/act', require\('\.\/routes\/act'\)/.test(read('server.js')));
  check('page loads its script, no inline script', /act-scores\.js/.test(read('public/act-scores.html')) && !/<script>/.test(read('public/act-scores.html')));
  check('page script has no on* attributes', !/\son\w+=/.test(read('public/js/act-scores.js')));
  check('profile links to the page', /href="\/act-scores"/.test(read('public/js/profile.js')));

  try { fs.unlinkSync(tmp); } catch { /* gone */ }
  console.log(failures ? `\n${failures} check(s) FAILED (${passes} passed)` : `\nall ${passes} checks passed`);
  process.exit(failures ? 1 : 0);
})();
