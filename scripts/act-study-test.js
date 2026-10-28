/**
 * The ACT measurement study (services/act-study.js, routes/act-study.js, public/act-study*.html):
 *
 *   node scripts/act-study-test.js
 *
 * Runs on a throwaway db. Checks the counterbalanced assignment, consent rules, the
 * before/after pairing, exclusions, the CSV, admin-only routes and the account wiring.
 */
const os = require('os');
const path = require('path');
const fs = require('fs');
const http = require('http');

process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(os.tmpdir(), `act-study-test-${process.pid}.json`);

const express = require('express');
const db = require('../config/db');
const study = require('../services/act-study');
const act = require('../services/act-scores');

let failures = 0;
function check(label, ok, detail) {
  if (ok) { console.log(`  ok   ${label}`); return; }
  failures++;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 300)}`}`);
}
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

function serve(router) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.user = db.byId('users', Number(req.headers['x-user'])) || null; next(); });
  app.use('/api/act-study', router);
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const call = (method, url, body, uid) => new Promise((ok, fail) => {
        const data = body ? JSON.stringify(body) : null;
        const req = http.request({ host: '127.0.0.1', port, path: url, method, headers: { 'content-type': 'application/json', 'x-user': String(uid || ''), ...(data ? { 'content-length': Buffer.byteLength(data) } : {}) } }, (res) => {
          let text = '';
          res.on('data', (c) => { text += c; });
          res.on('end', () => { let json = null; try { json = JSON.parse(text); } catch { json = text; } ok({ status: res.statusCode, json, text }); });
        });
        req.on('error', fail);
        if (data) req.write(data);
        req.end();
      });
      resolve({ call, close: () => server.close() });
    });
  });
}

const GOOD = { consent: true, parent_aware: true, seen_forms: false };
const user = (name, extra = {}) => db.insert('users', { email: `${name}@x.test`, display_name: name, ...extra });
const score = (uid, form, taken_on, e, m, r) => act.addScore(uid, act.cleanScore({ kind: 'practice', taken_on, form, english: e, math: m, reading: r }, Date.parse('2026-12-31T00:00:00Z')).value);

(async () => {
  console.log('join rules');
  check('consent is required', !!study.cleanJoin({ ...GOOD, consent: false }).error);
  check('a parent knowing is required', !!study.cleanJoin({ ...GOOD, parent_aware: false }).error);
  check('seen_forms must be answered', !!study.cleanJoin({ consent: true, parent_aware: true }).error);
  check('long other prep refused', !!study.cleanJoin({ ...GOOD, other_prep: 'x'.repeat(301) }).error);

  console.log('counterbalancing');
  const us = [];
  for (let i = 0; i < 6; i++) { const u = user(`s${i}`); us.push(u); study.join(u.id, study.cleanJoin(GOOD).value); }
  const arms = us.map((u) => study.getEntry(u.id).arm);
  check('arms alternate, halves even', arms.join() === 'AB,BA,AB,BA,AB,BA', arms);
  check('joining twice keeps the same order', study.join(us[0].id, study.cleanJoin(GOOD).value).arm === 'AB' && db.all('act_study').length === 6);
  check('someone who leaves still counts toward balance', (() => { const u = user('l'); study.join(u.id, { seen_forms: false, other_prep: '' }); study.leave(u.id); return study.nextArm() === 'BA'; })());

  console.log('before and after');
  const [a, b, c, d, e] = us;   // a AB, b BA, c AB, d BA, e AB
  score(a.id, 'a', '2026-10-01', 20, 22, 21);   // before is form A
  check('before only', study.report().participants.find((r) => r.user_id === a.id).status === 'before_only');
  score(a.id, 'B', '2026-10-29', 23, 24, 24);
  score(b.id, 'B', '2026-10-02', 25, 25, 25);   // BA: before is B
  score(b.id, 'A', '2026-10-30', 24, 24, 24);   // after is A, lower
  score(c.id, 'A', '2026-10-03', 18, 18, 18);   // c saw nothing, but only one test
  score(d.id, 'A', '2026-10-03', 18, 18, 18);   // wrong order for BA: A is the after form
  db.insert('study_sessions', { user_id: a.id, started_at: '2026-10-10T10:00:00Z', active_ms: 30 * 60000 });
  db.insert('study_sessions', { user_id: a.id, started_at: '2026-09-01T10:00:00Z', active_ms: 99 * 60000 });   // before the study window
  const rep = study.report();
  const ra = rep.participants.find((r) => r.user_id === a.id);
  const rb = rep.participants.find((r) => r.user_id === b.id);
  check('complete pair with change and gap', ra.status === 'complete' && ra.change.composite === 3 && ra.gap_days === 28, ra);
  check('dose counts only sessions between the two tests', ra.minutes === 30 && ra.sessions === 1, ra);
  check('a drop is reported as negative', rb.status === 'complete' && rb.change.composite === -1, rb);
  check('score in the wrong slot is not a before', rep.participants.find((r) => r.user_id === d.id).status === 'not_started');
  check('mean over finished only', rep.totals.complete === 2 && rep.totals.mean_composite_change === 1 && rep.totals.min_composite_change === -1 && rep.totals.max_composite_change === 3, rep.totals);
  check('by-order breakdown', rep.by_arm.AB.mean_composite_change === 3 && rep.by_arm.BA.mean_composite_change === -1);
  check('left learners are not listed but are counted', rep.totals.left === 1 && rep.totals.joined === 7 && rep.totals.active === 6);

  console.log('exclusions');
  const f = user('seen'); study.join(f.id, { seen_forms: true, other_prep: '' });
  score(f.id, 'A', '2026-10-01', 30, 30, 30); score(f.id, 'B', '2026-10-29', 30, 30, 30);
  const r2 = study.report();
  check('seen forms excluded from the mean', r2.participants.find((r) => r.user_id === f.id).status === 'excluded_seen_complete' && r2.totals.complete === 2 && r2.totals.excluded_seen_forms === 1);
  const g = user('demo', { is_demo: true }); study.join(g.id, study.cleanJoin(GOOD).value);
  check('demo accounts never appear', !study.report().participants.some((r) => r.user_id === g.id) && study.report().totals.joined === r2.totals.joined);

  console.log('csv');
  const tricky = user('=cmd|x', {}); study.join(tricky.id, study.cleanJoin(GOOD).value);
  const csv = study.toCsv();
  const lines = csv.trim().split('\n');
  check('header and one row per participant', lines[0].startsWith('user_id,name,arm') && lines.length === 1 + study.report().participants.length);
  check('formula-looking names are defused', csv.includes("'=cmd|x") && !/,=cmd/.test(csv));
  check('quotes and commas escaped', study.csvCell('a,"b"') === '"a,""b"""');

  console.log('routes');
  const { call, close } = await serve(require('../routes/act-study'));
  const admin = user('owner'); process.env.ADMIN_EMAILS = 'owner@x.test';
  check('me before joining', (await call('GET', '/api/act-study/me', null, user('n').id)).json.joined === false);
  const h = user('h');
  check('join without consent is 400', (await call('POST', '/api/act-study/join', { ...GOOD, consent: false }, h.id)).status === 400);
  const j = await call('POST', '/api/act-study/join', GOOD, h.id);
  check('join returns the order', j.status === 201 && j.json.joined && j.json.before_form !== j.json.after_form, j.json);
  check('leave then not in the study', (await call('POST', '/api/act-study/leave', {}, h.id)).json.joined === false && (await call('POST', '/api/act-study/leave', {}, h.id)).status === 404);
  check('report refused to a learner', (await call('GET', '/api/act-study/admin/report', null, h.id)).status === 404 && (await call('GET', '/api/act-study/admin/report.csv', null, h.id)).status === 404);
  const ar = await call('GET', '/api/act-study/admin/report', null, admin.id);
  check('admin gets the report', ar.status === 200 && ar.json.participants.length > 0);
  const ac = await call('GET', '/api/act-study/admin/report.csv', null, admin.id);
  check('admin gets the csv', ac.status === 200 && /^user_id,/.test(ac.text));
  close();

  console.log('wiring');
  check('exported with the account', /'act_scores', 'act_study'/.test(read('routes/profile.js')));
  check('deleted with the account', /'act_scores', 'act_study'/.test(read('routes/consent.js')));
  check('mounted in the server', /\/api\/act-study/.test(read('server.js')));
  check('pages exist and load their scripts', /act-study\.js/.test(read('public/act-study.html')) && /act-study-admin\.js/.test(read('public/act-study-admin.html')));
  check('protocol marks itself a draft with no student numbers', /DRAFT, not yet sealed/.test(read('docs/yc/ACT-STUDY-PROTOCOL.md')));

  try { fs.unlinkSync(process.env.DB_FILE); } catch { /* none written */ }
  console.log(failures ? `\n${failures} FAILED` : '\nall passed');
  process.exit(failures ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
