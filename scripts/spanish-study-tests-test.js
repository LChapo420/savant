/**
 * The sealed pre and post tests for study participants (services/spanish-study-tests.js, spanish-study-tests/):
 *
 *   node scripts/spanish-study-tests-test.js
 *
 * Throwaway db and results folder, a made-up pool (scripts/lib/study-test-fixture.js) and a fake beacon: no network.
 * Checks the day windows, the per-participant logs and draws, scoring into the study, the hash chain, and that the
 * founder's sealed spanish-check/ files are untouched.
 */
const os = require('os');
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

process.env.NODE_ENV = 'test';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'study-tests-'));
process.env.DB_FILE = path.join(TMP, 'db.json');

const express = require('express');
const db = require('../config/db');
const study = require('../services/spanish-study');
const tests = require('../services/spanish-study-tests');
const { DRAND } = require('../spanish-study-tests/lib/replay');
const { makePool } = require('./lib/study-test-fixture');

let failures = 0;
function check(label, ok, detail) {
  if (ok) { console.log(`  ok   ${label}`); return; }
  failures++;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 300)}`}`);
}
const rejects = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };

const POOL = path.join(TMP, 'pool.json');
fs.writeFileSync(POOL, JSON.stringify(makePool()));
const DAY0 = Date.parse('2026-11-10T12:00:00Z');
let clock = DAY0;
const roundAt = (t) => Math.floor((t / 1000 - DRAND.genesis) / DRAND.period) + 1;
let salt = 0;
const beaconFn = async () => ({ round: roundAt(clock), randomness: crypto.createHash('sha256').update(`beacon${++salt}`).digest('hex'), signature: 'sig', relays: [] });
const configure = (extra = {}) => tests.configure({ dir: path.join(TMP, 'results'), now: () => clock, engine: { now: () => clock, beaconFn, poolPath: POOL, allowUnsealed: true, ...extra } });

const user = (name) => db.insert('users', { email: `${name}@x.test`, display_name: name });
const GOOD = { consent: true, age_group: 'adult', no_recent_spanish: true };
const joinAt = (u, t) => study.join(u.id, study.cleanJoin(GOOD).value, { now: t, beaconFn });

/** Take one whole sitting. `right` answers correctly, otherwise every reading item is wrong and nothing is typed. */
async function sit(uid, right) {
  await tests.start(uid);
  for (let guard = 0; guard < 60; guard++) {
    const it = tests.next(uid);
    if (it.done) return it;
    const open = engineOpen(uid);
    const item = open.items[it.n];
    clock += 6000;
    if (item.section === 'listening') tests.answer(uid, { n: it.n, answer: right ? item.reference : '', client_ms: 6000, replays: 0, pastes: 0 });
    else tests.answer(uid, { n: it.n, choice: right ? item.correct : (item.correct + 1) % 4, client_ms: 6000, replays: 0, pastes: 0 });
  }
  throw new Error('sitting did not finish');
}
const engineOpen = (uid) => {
  // the manager keeps one engine per participant; read its open sitting through the log replay
  const e = tests._engineForTest(uid);
  return e.state().open;
};

(async () => {
  console.log('before anything is sealed');
  configure({ allowUnsealed: false });
  const a = user('ana');
  const none = await rejects(() => tests.status(a.id));
  check('someone not in the study gets 404', none && none.status === 404, none && none.message);
  await joinAt(a, DAY0);
  const st0 = await tests.status(a.id);
  check('without SEAL.txt the engine says it is unsealed', st0.seal_ok === false);
  const refused = await rejects(() => tests.start(a.id));
  check('and refuses to start a sitting (503)', refused && refused.status === 503, refused && refused.message);
  const sealSrc = fs.readFileSync(path.join(__dirname, '..', 'spanish-study-tests', 'scripts', 'seal.js'), 'utf8');
  check('the seal script covers the engine, scoring, draw, replay, protocol and the shared pool', ['engine.js', 'scoring.js', 'lib/draw.js', 'lib/replay.js', 'spanish-check/pool.json', 'DUOLINGO-STUDY-PROTOCOL.md'].every((f) => sealSrc.includes(f)));

  console.log('day windows');
  configure();
  clock = DAY0;
  const st1 = await tests.status(a.id);
  check('pre-test is offered on day 0', st1.phase === 'pre' && st1.state === 'ready', st1);

  console.log('a pre-test sitting');
  const done = await sit(a.id, true);
  check('the sitting finishes', done.done === true);
  const rows = db.find('spanish_study_tests', (r) => r.user_id === a.id);
  const lis = rows.find((r) => r.test === 'listening' && r.phase === 'pre');
  const day = rows.find((r) => r.test === 'daily' && r.phase === 'pre');
  check('listening is written to the study as out of 100 with chance 0', lis && lis.correct === 100 && lis.n === 100 && lis.chance === 0, lis);
  check('everyday-sentence reading is written as correct out of n with chance 0.25', day && day.correct === 15 && day.n === 15 && day.chance === 0.25, day);
  const again = await rejects(() => tests.start(a.id));
  check('a second sitting the same day is refused', again && (again.status === 429 || again.status === 409), again && again.message);
  const st2 = await tests.status(a.id);
  check('next phase is post, closed until the last study day', st2.phase === null && /opens on 2026-11-23/.test(st2.why), st2);

  console.log('the post-test');
  clock = Date.parse('2026-11-22T12:00:00Z');
  const early = await rejects(() => tests.start(a.id));
  check('the post-test cannot start on day 13', early && early.status === 409, early && early.message);
  clock = Date.parse('2026-11-23T12:00:00Z');
  const st3 = await tests.status(a.id);
  check('the post-test opens on the last study day', st3.phase === 'post', st3);
  await sit(a.id, false);
  const post = db.find('spanish_study_tests', (r) => r.user_id === a.id && r.phase === 'post');
  const pl = post.find((r) => r.test === 'listening'); const pd = post.find((r) => r.test === 'daily');
  check('a sitting with nothing right scores 0 listening and 0 of 15', pl.correct === 0 && pd.correct === 0, post);
  check('the gain is therefore negative and kept (-1 on both tests)', study.report({ now: clock }).participants.find((p) => p.user_id === a.id).gain < -0.9);
  const over = await rejects(() => tests.start(a.id));
  check('after both sittings nothing more can start', over && over.status === 409, over && over.message);
  check('recorded scores are never overwritten', db.find('spanish_study_tests', (r) => r.user_id === a.id).length === 4);

  console.log('a pre-test taken too late');
  const late = user('late');
  clock = DAY0;
  await joinAt(late, DAY0);
  clock = Date.parse('2026-11-13T12:00:00Z');
  const lateTry = await rejects(() => tests.start(late.id));
  check('on day 3 the pre-test is closed', lateTry && lateTry.status === 409 && /cannot be taken later/.test(lateTry.message), lateTry && lateTry.message);

  console.log('one log and one draw per participant');
  const b = user('ben'); const c = user('cy');
  clock = Date.parse('2026-11-24T12:00:00Z');
  await joinAt(b, clock); await joinAt(c, clock);
  await tests.start(b.id); await tests.start(c.id);
  const ib = engineOpen(b.id).items.map((i) => i.item_id).join(',');
  const ic = engineOpen(c.id).items.map((i) => i.item_id).join(',');
  check('two participants get different draws', ib !== ic);
  check('each has their own log file', fs.existsSync(path.join(TMP, 'results', `u${b.id}`, 'log.jsonl')) && fs.existsSync(path.join(TMP, 'results', `u${c.id}`, 'log.jsonl')));
  check('the item shown never carries the answer', (() => { const n = tests.next(b.id); return !('correct' in n) && !('reference' in n) && n.total === 25; })());
  const bLog = path.join(TMP, 'results', `u${b.id}`, 'log.jsonl');
  const lines = fs.readFileSync(bLog, 'utf8').split('\n').filter(Boolean);
  check('the log is a hash chain that replays clean', tests._engineForTest(b.id).state().chain_ok === true && lines.length >= 3);
  const svcSrc = fs.readFileSync(path.join(__dirname, '..', 'services', 'spanish-study-tests.js'), 'utf8');
  check('the service starts sittings with force: false only', /\.start\(\{ force: false \}\)/.test(svcSrc) && !/\.start\(\{ force: true/.test(svcSrc));
  tests.configure({ dir: path.join(TMP, 'results'), now: () => clock, engine: { now: () => clock, beaconFn, poolPath: POOL, allowUnsealed: true } });
  fs.writeFileSync(bLog, lines.map((l, i) => (i === 1 ? l.replace(/"t":\d+/, '"t":1') : l)).join('\n') + '\n');
  const tampered = await rejects(() => tests.status(b.id));
  check('a log edited by hand is refused at startup', tampered && /chain is broken/.test(tampered.message), tampered && tampered.message);

  console.log('deleting a participant');
  tests.removeForUser(c.id);
  check('their log folder is removed', !fs.existsSync(path.join(TMP, 'results', `u${c.id}`)));

  check('adult deletion and a parent deleting a child both remove the log folder', /spanish-study-tests'\)\.removeForUser\(id\)/.test(fs.readFileSync(path.join(__dirname, '..', 'services', 'account-deletion.js'), 'utf8')) && /spanish-study-tests'\)\.removeForUser\(childId\)/.test(fs.readFileSync(path.join(__dirname, '..', 'routes', 'consent.js'), 'utf8')));

  console.log('routes');
  configure();
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.user = db.byId('users', Number(req.headers['x-user'])) || null; next(); });
  app.use('/api/spanish-study-test', require('../routes/spanish-study-tests'));
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const call = (method, url, uid) => new Promise((ok, fail) => {
    const req = http.request({ host: '127.0.0.1', port: server.address().port, path: url, method, headers: { 'x-user': String(uid || ''), 'content-type': 'application/json' } }, (res) => { let t = ''; res.on('data', (d) => { t += d; }); res.on('end', () => ok({ status: res.statusCode, json: (() => { try { return JSON.parse(t); } catch { return t; } })() })); });
    req.on('error', fail); req.end(method === 'POST' ? '{}' : undefined);
  });
  check('signed out: 401', (await call('GET', '/api/spanish-study-test/status')).status === 401);
  const outsider = user('outsider');
  check('signed in but not in the study: 404', (await call('GET', '/api/spanish-study-test/status', outsider.id)).status === 404);
  clock = Date.parse('2026-11-24T13:00:00Z');
  const d = user('dee'); await joinAt(d, clock);
  const rs = await call('GET', '/api/spanish-study-test/status', d.id);
  check('a participant sees their status', rs.status === 200 && rs.json.phase === 'pre', rs.json);
  const rn = await call('GET', '/api/spanish-study-test/next', d.id);
  check('next with no open sitting is a clean 409', rn.status === 409, rn.json);
  server.close();

  console.log('the founder\'s sealed files');
  let changed = '';
  try { changed = execFileSync('git', ['status', '--porcelain', '--', 'spanish-check', 'spanish-check-lc', 'routes/spanish-check.js', 'routes/spanish-check-lc.js', 'public/spanish-check.html', 'public/js/spanish-check.js'], { cwd: path.join(__dirname, '..'), encoding: 'utf8' }); } catch { changed = ''; }
  check('spanish-check/ and its routes and pages have no changes', changed.trim() === '', changed);

  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
