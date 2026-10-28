/**
 * The Savant vs Duolingo study (services/spanish-study.js, routes/spanish-study.js):
 *
 *   node scripts/spanish-study-test.js
 *
 * Runs on a throwaway db with a fake beacon (no network). Checks the draw, consent rules, check-ins,
 * the chance-corrected gain, the interval maths, the report and CSV, and the admin-only routes.
 */
const os = require('os');
const path = require('path');
const fs = require('fs');
const http = require('http');

process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(os.tmpdir(), `spanish-study-test-${process.pid}.json`);

const express = require('express');
const db = require('../config/db');
const study = require('../services/spanish-study');

let failures = 0;
function check(label, ok, detail) {
  if (ok) { console.log(`  ok   ${label}`); return; }
  failures++;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 300)}`}`);
}
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const user = (name, extra = {}) => db.insert('users', { email: `${name}@x.test`, display_name: name, ...extra });
const GOOD = { consent: true, age_group: 'adult', no_recent_spanish: true };
const NOW = Date.parse('2026-11-10T12:00:00Z');
let round = 100;
const beacon = async () => { round++; return { round, randomness: require('crypto').createHash('sha256').update(`r${round}`).digest('hex') }; };
const J = (u) => study.join(u.id, study.cleanJoin(GOOD).value, { now: NOW, beaconFn: beacon });

function serve(router) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.user = db.byId('users', Number(req.headers['x-user'])) || null; next(); });
  app.use('/api/spanish-study', router);
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

(async () => {
  console.log('join rules');
  check('consent is required', !!study.cleanJoin({ ...GOOD, consent: false }).error);
  check('age group is required', !!study.cleanJoin({ ...GOOD, age_group: 'child' }).error);
  check('a teen needs a parent who knows', !!study.cleanJoin({ ...GOOD, age_group: 'teen' }).error && !study.cleanJoin({ ...GOOD, age_group: 'teen', parent_aware: true }).error);
  check('beginners only', !!study.cleanJoin({ ...GOOD, no_recent_spanish: false }).error);

  console.log('assignment');
  const us = [];
  for (let i = 0; i < 8; i++) { const u = user(`p${i}`); us.push(u); await J(u); }
  const arms = us.map((u) => study.getEntry(u.id).arm);
  check('each block of four has two of each arm', [0, 4].every((s) => arms.slice(s, s + 4).filter((a) => a === 'savant').length === 2), arms);
  const row0 = study.getEntry(us[0].id);
  check('the draw is stored and recomputable', row0.draw.round === 101 && study.shuffleFrom(row0.draw.randomness, ['savant', 'savant', 'duolingo', 'duolingo']).join() === row0.draw.block.join());
  check('joining twice keeps the arm and adds no row', (await J(us[0])).arm === row0.arm && db.all('spanish_study').length === 8);
  check('a beacon failure joins nobody', await study.join(user('nb').id, study.cleanJoin(GOOD).value, { beaconFn: async () => { throw new Error('down'); } }).then(() => false, () => true) && db.all('spanish_study').length === 8);
  check('leaving is recorded and still counts toward balance', (() => { study.leave(us[7].id); return db.all('spanish_study').length === 8 && !study.getEntry(us[7].id); })());

  console.log('check-ins');
  const duo = us.find((u) => study.getEntry(u.id) && study.getEntry(u.id).arm === 'duolingo');
  const sav = us.find((u) => study.getEntry(u.id) && study.getEntry(u.id).arm === 'savant');
  check('Duolingo minutes recorded', !!study.checkin(duo.id, { day: '2026-11-10', minutes: 20, screenshot: true }, NOW).value);
  check('a repeat replaces the day', (() => { study.checkin(duo.id, { day: '2026-11-10', minutes: 25, screenshot: true }, NOW); const r = db.find('spanish_study_checkins', (c) => c.user_id === duo.id); return r.length === 1 && r[0].minutes === 25; })());
  check('future day refused', study.checkin(duo.id, { day: '2026-11-12', minutes: 5 }, NOW).status === 400);
  check('day outside the window refused', study.checkin(duo.id, { day: '2026-11-01', minutes: 5 }, NOW).status === 400);
  check('absurd minutes refused', study.checkin(duo.id, { day: '2026-11-10', minutes: 999 }, NOW).status === 400 && study.checkin(duo.id, { day: '2026-11-10', minutes: -1 }, NOW).status === 400);
  check('not in the study', study.checkin(user('out').id, { minutes: 5 }, NOW).status === 404);

  console.log('scoring');
  check('chance correction', study.corrected({ correct: 10, n: 40, chance: 0.25 }) === 0 && study.corrected({ correct: 40, n: 40, chance: 0.25 }) === 1 && study.corrected({ correct: 5, n: 40, chance: 0.25 }) < 0);
  const t = study.recordTest(sav.id, { test: 'daily', phase: 'pre', correct: 10, n: 40, chance: 0.25 });
  check('one sitting per test per phase', study.recordTest(sav.id, { test: 'daily', phase: 'pre', correct: 40, n: 40, chance: 0.25 }).id === t.id);
  check('bad scores throw', (() => { try { study.recordTest(sav.id, { test: 'daily', phase: 'post', correct: 50, n: 40, chance: 0.25 }); return false; } catch { return true; } })());

  console.log('statistics');
  const s = study.summarize([1, 2, 3, 4]);
  check('mean and t interval', s.mean === 2.5 && s.ci95[0] < 2.5 && s.ci95[1] > 2.5 && Math.abs(s.ci95[1] - 2.5 - 3.182 * Math.sqrt(5 / 3) / 2) < 0.002, s);
  check('one value has no interval', study.summarize([3]).ci95 === null);
  const d = study.diffCI([5, 6, 7], [1, 2, 3]);
  check('difference of means with a Welch interval', d.diff === 4 && d.ci95[0] < 4 && d.ci95[1] > 4 && d.df === 4, d);
  check('a thin arm gives no interval', study.diffCI([1], [1, 2]).ci95 === null);
  check('minimum sample', study.minSamplePerArm(0.2, 0.1) === 63 && study.minSamplePerArm(0, 0.1) === null);

  console.log('report');
  // Complete a savant and a duolingo participant with known numbers; the others stay incomplete.
  const sav2 = us.filter((u) => study.getEntry(u.id) && study.getEntry(u.id).arm === 'savant')[1];
  const duo2 = us.filter((u) => study.getEntry(u.id) && study.getEntry(u.id).arm === 'duolingo')[1];
  const sit = (u, test, phase, correct) => study.recordTest(u.id, { test, phase, correct, n: 40, chance: 0.25, taken_at: '2026-11-10T00:00:00Z' });
  for (const test of ['listening', 'daily']) { sit(sav2, test, 'pre', 10); sit(sav2, test, 'post', 25); sit(duo2, test, 'pre', 10); sit(duo2, test, 'post', 16); }
  db.insert('study_sessions', { user_id: sav2.id, started_at: '2026-11-10T10:00:00Z', active_ms: 60 * 60000 });
  study.checkin(duo2.id, { day: '2026-11-10', minutes: 60, screenshot: false }, NOW);
  const rep = study.report({ now: NOW });
  const rs = rep.participants.find((r) => r.user_id === sav2.id);
  const rd = rep.participants.find((r) => r.user_id === duo2.id);
  check('savant minutes from the app clock', rs.minutes === 60 && rs.source === 'app clock', rs);
  check('duolingo minutes from self-report, screenshot tick counted', rd.minutes === 60 && rd.source === 'self-report' && rd.screenshots === 0, rd);
  check('gain is chance-corrected and per hour', rs.status === 'complete' && rs.gain === 0.5 && rs.gain_per_hour === 0.5 && rd.gain < rs.gain, [rs.gain, rd.gain]);
  check('missing days are flagged, not dropped', rs.missing_days === 0 && rep.participants.find((r) => r.user_id === sav.id).missing_days === 1);
  check('everyone who joined and has not left is listed', rep.participants.length === 7 && rep.totals.joined === 8 && rep.totals.left === 1 && rep.totals.complete === 2, rep.totals);
  check('both arms reported', rep.arms.savant.complete === 1 && rep.arms.duolingo.complete === 1 && rep.arms.savant.joined + rep.arms.duolingo.joined === 7);
  check('with one per arm there is no interval, and the note says so', rep.difference_gain_per_hour.savant_minus_duolingo.ci95 === null && /cannot show/.test(rep.note));
  const csv = study.toCsv(rep);
  check('csv has a header and a row each', csv.split('\n')[0].startsWith('user_id,name,arm') && csv.trim().split('\n').length === 8);
  check('csv defuses formulas', study.csvCell('=1+1') === "'=1+1" && study.csvCell('a,b') === '"a,b"');
  const demo = user('demo', { is_demo: true });
  await J(demo);
  check('demo accounts never appear', !study.report({ now: NOW }).participants.some((r) => r.user_id === demo.id) && study.report({ now: NOW }).totals.joined === 8);

  console.log('routes');
  const { call, close } = await serve(require('../routes/spanish-study'));
  const admin = user('owner'); process.env.ADMIN_EMAILS = 'owner@x.test';
  const lone = user('lone');
  check('me when not joined', (await call('GET', '/api/spanish-study/me', null, lone.id)).json.joined === false);
  check('join without consent is 400', (await call('POST', '/api/spanish-study/join', { age_group: 'adult' }, lone.id)).status === 400);
  check('anonymous is refused', [401, 403].includes((await call('GET', '/api/spanish-study/me')).status));
  check('a plain learner cannot read the report', (await call('GET', '/api/spanish-study/admin/report', null, lone.id)).status === 404);
  check('admin reads the report and csv', (await call('GET', '/api/spanish-study/admin/report', null, admin.id)).status === 200 && /^user_id,/.test((await call('GET', '/api/spanish-study/admin/report.csv', null, admin.id)).text));
  close();

  console.log('wiring');
  check('mounted in server.js', read('server.js').includes("'/api/spanish-study'"));
  check('in export and deletion', ['routes/profile.js', 'routes/consent.js'].every((f) => ['spanish_study', 'spanish_study_checkins', 'spanish_study_tests'].every((c) => read(f).includes(`'${c}'`))));
  check('the sealed Spanish files are untouched by this module', !/spanish-check/.test(read('routes/spanish-study.js')) && read('services/spanish-study.js').split('\n').filter((l) => /require\(/.test(l)).every((l) => !/engine|scoring|routes/.test(l)));

  try { fs.unlinkSync(process.env.DB_FILE); } catch { /* ignore */ }
  console.log(failures ? `\n${failures} FAILED` : '\nall passed');
  process.exit(failures ? 1 : 0);
})();
