/**
 * The Savant vs Duolingo study, start to finish over HTTP (backlog 0a(d)):
 *
 *   node scripts/spanish-study-e2e-test.js
 *
 * Eight made-up participants join through /api/spanish-study, sit the pre-test and post-test through
 * /api/spanish-study-test, the Duolingo arm checks in daily, one person leaves and one skips the post-test, and the
 * admin report and CSV are read back. Throwaway db and results folder, a made-up pool (scripts/lib/study-test-fixture.js),
 * a fake beacon and a frozen clock: no network, no model, no spending. Study minutes in the Savant arm are fixture rows in
 * `study_sessions`; the real app clock is not exercised here. The scores are made up to drive the arithmetic only.
 */
const os = require('os');
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');

process.env.NODE_ENV = 'test';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'study-e2e-'));
process.env.DB_FILE = path.join(TMP, 'db.json');
process.env.ADMIN_EMAILS = 'admin@x.test';

const express = require('express');
const db = require('../config/db');
const external = require('../spanish-check/lib/external');
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

const POOL = path.join(TMP, 'pool.json');
fs.writeFileSync(POOL, JSON.stringify(makePool()));
const DAY0 = Date.parse('2026-11-10T12:00:00Z');
const DAY = 86400000;
let clock = DAY0;
Date.now = () => clock;   // the study routes read the clock themselves
const roundAt = (t) => Math.floor((t / 1000 - DRAND.genesis) / DRAND.period) + 1;
let salt = 0;
const beaconFn = async () => ({ round: roundAt(clock), randomness: crypto.createHash('sha256').update(`e2e-beacon${++salt}`).digest('hex'), signature: 'sig', relays: [] });
external.fetchBeacon = beaconFn;
tests.configure({ dir: path.join(TMP, 'results'), now: () => clock, engine: { now: () => clock, beaconFn, poolPath: POOL, allowUnsealed: true } });

const app = express();
app.use(express.json());
app.use((req, res, next) => { req.user = db.byId('users', Number(req.headers['x-user'])) || null; next(); });
app.use('/api/spanish-study', require('../routes/spanish-study'));
app.use('/api/spanish-study-test', require('../routes/spanish-study-tests'));

let server;
const call = (method, url, uid, body) => new Promise((ok, fail) => {
  const req = http.request({ host: '127.0.0.1', port: server.address().port, path: url, method, headers: { 'x-user': String(uid || ''), 'content-type': 'application/json' } }, (res) => {
    let t = ''; res.on('data', (d) => { t += d; });
    res.on('end', () => ok({ status: res.statusCode, text: t, json: (() => { try { return JSON.parse(t); } catch { return null; } })() }));
  });
  req.on('error', fail); req.end(method === 'POST' ? JSON.stringify(body || {}) : undefined);
});

const GOOD = { consent: true, age_group: 'adult', no_recent_spanish: true };
const user = (name) => db.insert('users', { email: `${name}@x.test`, display_name: name });

/** One whole sitting over HTTP. `right` answers correctly; otherwise every reading item is wrong and nothing is typed. */
async function sit(uid, right) {
  const s = await call('POST', '/api/spanish-study-test/start', uid);
  if (s.status !== 200) return s;
  for (let guard = 0; guard < 60; guard++) {
    const it = (await call('GET', '/api/spanish-study-test/next', uid)).json;
    if (it.done) return { status: 200, done: true };
    const item = tests._engineForTest(uid).state().open.items[it.n];
    clock += 6000;
    const body = item.section === 'listening'
      ? { n: it.n, answer: right ? item.reference : '', client_ms: 6000, replays: 0, pastes: 0 }
      : { n: it.n, choice: right ? item.correct : (item.correct + 1) % 4, client_ms: 6000, replays: 0, pastes: 0 };
    const a = await call('POST', '/api/spanish-study-test/answer', uid, body);
    if (a.status !== 200) return a;
  }
  throw new Error('sitting did not finish');
}

(async () => {
  server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const admin = user('admin');
  const people = ['ana', 'ben', 'cy', 'dee', 'eli', 'fay', 'gus', 'hal'].map(user);
  const [, , , , , , gus, hal] = people;

  console.log('joining');
  const bad = await call('POST', '/api/spanish-study/join', people[0].id, { age_group: 'adult', no_recent_spanish: true });
  check('joining without the consent box is refused (400)', bad.status === 400, bad.json);
  check('a signed-out visitor gets 401', (await call('GET', '/api/spanish-study/me')).status === 401);
  for (const p of people) {
    const j = await call('POST', '/api/spanish-study/join', p.id, GOOD);
    if (j.status !== 201) check(`${p.display_name} joins`, false, j.json);
  }
  const entries = db.all('spanish_study');
  check('all eight joined', entries.length === 8);
  const arms = entries.map((e) => e.arm);
  const blockOk = [0, 4].every((i) => arms.slice(i, i + 4).filter((a) => a === 'savant').length === 2);
  check('each block of four has two in each arm', blockOk, arms);
  check('every draw keeps the beacon round and randomness', entries.every((e) => e.draw.round && /^[0-9a-f]{64}$/.test(e.draw.randomness)));
  const again = await call('POST', '/api/spanish-study/join', people[0].id, GOOD);
  check('joining twice changes nothing', db.all('spanish_study').length === 8 && again.json.arm === entries[0].arm);
  const armOf = (u) => entries.find((e) => e.user_id === u.id).arm;

  console.log('pre-test (day 0)');
  for (const p of people) {
    const r = await sit(p.id, false);
    if (!r.done) check(`${p.display_name} finishes the pre-test`, false, r.json || r);
  }
  check('sixteen pre-test scores are recorded (two tests each)', db.find('spanish_study_tests', (r) => r.phase === 'pre').length === 16);
  const second = await call('POST', '/api/spanish-study-test/start', people[0].id);
  check('a second sitting the same day is refused', second.status === 429 || second.status === 409, second.json);

  console.log('fourteen study days');
  for (let d = 0; d < study.DAYS; d++) {
    clock = DAY0 + d * DAY;
    const day = study.isoDay(clock);
    for (const p of people) {
      if (p === hal && d > 3) continue;   // hal studies four days, then leaves below
      if (armOf(p) === 'duolingo') {
        const c = await call('POST', '/api/spanish-study/checkin', p.id, { minutes: 20, screenshot: true });
        if (c.status !== 200) check(`${p.display_name} checks in on ${day}`, false, c.json);
      } else {
        db.insert('study_sessions', { user_id: p.id, started_at: `${day}T10:00:00.000Z`, active_ms: 20 * 60000 });
      }
    }
    if (d === 3) {
      const l = await call('POST', '/api/spanish-study/leave', hal.id);
      check('a participant can leave the study', l.status === 200 && l.json.joined === false, l.json);
    }
  }
  const fut = await call('POST', '/api/spanish-study/checkin', people[0].id, { day: '2026-12-31', minutes: 20 });
  check('a check-in for a day outside the window is refused', fut.status === 400, fut.json);
  const dp = people.find((p) => armOf(p) === 'duolingo' && p !== hal);
  const meD = (await call('GET', '/api/spanish-study/me', dp.id)).json;
  check('a Duolingo-arm participant sees fourteen check-ins of 20 minutes', meD.checkins && meD.checkins.length === 14 && meD.checkins.every((c) => c.minutes === 20), meD);

  console.log('post-test (last study day)');
  clock = DAY0 + 13 * DAY;
  const gone = await call('GET', '/api/spanish-study-test/status', hal.id);
  check('the participant who left is no longer in the study (404)', gone.status === 404, gone.json);
  const open = await call('GET', '/api/spanish-study-test/status', people[0].id);
  check('the post-test opens on day 14', open.status === 200 && open.json.phase === 'post', open.json);
  for (const p of people) {
    if (p === hal || p === gus) continue;   // gus never comes back for the post-test
    const r = await sit(p.id, true);
    if (!r.done) check(`${p.display_name} finishes the post-test`, false, r.json || r);
  }

  console.log('admin report');
  check('a participant cannot read the report (404)', (await call('GET', '/api/spanish-study/admin/report', people[0].id)).status === 404);
  const rep = (await call('GET', '/api/spanish-study/admin/report', admin.id)).json;
  check('the admin reads it', rep && rep.totals, rep);
  check('totals: eight joined, one left, seven active', rep.totals.joined === 8 && rep.totals.left === 1 && rep.totals.active === 7, rep.totals);
  const done = rep.participants.filter((r) => r.status === 'complete');
  const doneLast = (await call('GET', '/api/spanish-study/admin/report', admin.id)).json.participants;
  check('six finished both sittings; the one who skipped the post-test shows as no_post_test',
    done.length === 6 && doneLast.find((r) => r.user_id === gus.id).status === 'no_post_test', doneLast.map((r) => [r.name, r.status]));
  check('every finished participant has gain 7/6 (0 to 1 on listening, -1/3 to 1 on reading)', done.every((r) => Math.abs(r.gain - 1.167) < 0.002), done.map((r) => r.gain));
  check('each finished participant logged 280 minutes, from the right source for the arm',
    done.every((r) => r.minutes === 280 && r.source === (r.arm === 'savant' ? 'app clock' : 'self-report')), done.map((r) => [r.arm, r.minutes, r.source]));
  check('gain per hour is gain over 4.667 hours', done.every((r) => Math.abs(r.gain_per_hour - r.gain / (280 / 60)) < 0.002), done.map((r) => r.gain_per_hour));
  check('a Duolingo participant counts their screenshots', done.filter((r) => r.arm === 'duolingo').every((r) => r.screenshots === 14));
  check('the dropout appears in the left count, not in the arm rows', rep.arms.savant.left_study + rep.arms.duolingo.left_study === 1 && !rep.participants.some((r) => r.user_id === hal.id));
  check('the report states the honesty note', /cannot show that either app teaches more/.test(rep.note));
  check('both arms are summarised', rep.arms.savant.complete + rep.arms.duolingo.complete === 6);

  const csv = await call('GET', '/api/spanish-study/admin/report.csv', admin.id);
  const lines = csv.text.trim().split('\n');
  check('the CSV has a header and one line per active participant', csv.status === 200 && lines.length === 8 && lines[0].startsWith('user_id,name,arm,status'), lines.length);
  check('the CSV is not readable by a participant (404)', (await call('GET', '/api/spanish-study/admin/report.csv', people[0].id)).status === 404);

  console.log('no answers leak, no money spent');
  clock += 13 * 3600000;
  const nx = (await call('POST', '/api/spanish-study-test/start', people[0].id));
  check('after both sittings nothing more can start (409)', nx.status === 409, nx.json);
  const src = ['routes/spanish-study.js', 'routes/spanish-study-tests.js', 'services/spanish-study.js', 'services/spanish-study-tests.js'].map((f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
  check('none of the study code calls a model provider', !/anthropic|openrouter|llm-gateway|gateway/i.test(src));

  server.close();
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
