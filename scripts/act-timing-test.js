/**
 * ACT exam clock (services/act-timing.js, routes/learn.js, public/js/session.js):
 *
 *   node scripts/act-timing-test.js
 *
 * Pure checks on the allowance and the pacing report, then the real routes on an
 * ACT checkpoint: the clock is sent, an answer after time is refused, finish
 * reports pacing; a non-ACT exam and an ordinary lesson carry no clock.
 */
const os = require('os');
const path = require('path');
const fs = require('fs');
const http = require('http');

process.env.NODE_ENV = 'test';
const tmp = path.join(os.tmpdir(), `act-timing-test-${process.pid}.json`);
process.env.DB_FILE = tmp;

const express = require('express');
const db = require('../config/db');
const curriculum = require('../config/curriculum');
const t = require('../services/act-timing');

let failures = 0;
function check(label, ok, detail) {
  if (ok) { console.log(`  ok   ${label}`); return; }
  failures++;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 300)}`}`);
}

// the allowance
const per = t.blendedSecondsPerQuestion();
check('blended allowance is (35+50+40) min over (50+45+36) questions', Math.abs(per - 7500 / 131) < 1e-9, per);
check('the numbers are flagged UNVERIFIED', t.UNVERIFIED === true);
const ex = t.timingFor({ trackId: 'act', kind: 'master', questionCount: 15 });
check('a 15-question ACT Master quiz gets a whole-minute clock', ex && ex.total_seconds % 60 === 0 && ex.total_seconds >= 15 * per && ex.total_seconds < 15 * per + 60, ex);
check('the Graduation exam is timed too and longer', t.timingFor({ trackId: 'act', kind: 'graduation', questionCount: 40 }).total_seconds > ex.total_seconds);
check('another track is not timed', t.timingFor({ trackId: 'english', kind: 'master', questionCount: 15 }) === null);
check('a lesson is not timed', t.timingFor({ trackId: 'act', kind: 'lesson', questionCount: 10 }) === null);
check('no questions: no clock', t.timingFor({ trackId: 'act', kind: 'master', questionCount: 0 }) === null);

// pacing
const fast = t.pacing(ex, new Array(15).fill(30000));
check('pacing: on pace says so', /kept to the pace/.test(fast.verdict) && fast.median_seconds === 30 && fast.slow_count === 0, fast);
const slow = t.pacing(ex, new Array(15).fill(130000));
check('pacing: slow median is called out and slow questions counted', /averaged 130 seconds/.test(slow.verdict) && slow.slow_count === 15, slow);
const out = t.pacing(ex, new Array(6).fill(100000), { timedOut: true });
check('pacing: running out of time counts the unanswered', /9 of 15 unanswered/.test(out.verdict) && out.timed_out, out);
check('pacing: no timing, no report', t.pacing(null, [1000]) === null);

// routes
(async () => {
  const lessons = require('../services/lessons');
  const essays = require('../services/essays');
  const levelEditor = require('../services/level-editor');
  lessons.prefetchNext = () => {};
  essays.prefetch = () => {};
  levelEditor.prefetchNext = () => {};

  const router = require('../routes/learn');
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.user = db.byId('users', Number(req.headers['x-user'])) || null; next(); });
  app.use('/api', router);
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const call = (method, url, uid, body) => new Promise((ok, fail) => {
    const data = body ? JSON.stringify(body) : '';
    const req = http.request({ host: '127.0.0.1', port: server.address().port, path: url, method, headers: { 'x-user': String(uid), 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } }, (res) => {
      let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => ok({ status: res.statusCode, body: b ? JSON.parse(b) : null }));
    });
    req.on('error', fail); req.end(data);
  });

  const sitAt = async (trackId, kinds) => {
    const track = curriculum.TRACKS.find((x) => x.id === trackId);
    const grade = track.grades[0];
    const level = Array.from({ length: grade.pathLength }, (_, i) => i + 1).find((l) => kinds.includes(curriculum.levelKind(l, grade.pathLength, grade)));
    const user = db.insert('users', { username: `u-${trackId}-${kinds[0]}-${Math.random()}`, role: 'student' });
    const en = db.insert('enrollments', { user_id: user.id, track_id: trackId, grade_id: grade.id, current_level: level, status: 'active', created_at: new Date().toISOString() });
    const made = await call('POST', '/api/sessions', user.id, { enrollment_id: en.id });
    return { user, made, level };
  };

  const act = await sitAt('act', ['master']);
  check('ACT exam: the session is created', act.made.status === 201, act.made.body && act.made.body.error);
  const timing = act.made.body && act.made.body.timing;
  check('ACT exam: the clock is sent with the items', timing && timing.questions === act.made.body.items.length && timing.total_seconds > 0 && timing.unverified === true && !!timing.started_at, timing);

  const sid = act.made.body.session_id;
  const first = act.made.body.items[0];
  const ok = await call('POST', `/api/sessions/${sid}/answer`, act.user.id, { item_id: first.id, answer: 'A', ms: 40000 });
  check('ACT exam: an answer inside the time is taken', ok.status === 200, ok.body);
  // time has run out
  const row = db.byId('sessions', sid);
  db.update('sessions', sid, { started_at: new Date(Date.now() - (timing.total_seconds + 600) * 1000).toISOString() });
  const second = act.made.body.items[1];
  const late = await call('POST', `/api/sessions/${sid}/answer`, act.user.id, { item_id: second.id, answer: 'A', ms: 40000 });
  check('ACT exam: an answer after time is refused as time_up', late.status === 409 && late.body.time_up === true, late.body);
  const reopened = await call('POST', '/api/sessions', act.user.id, { enrollment_id: db.find('enrollments', (e) => e.user_id === act.user.id)[0].id });
  check('ACT exam: a reload keeps the original start, so the clock does not restart', reopened.body.resumed === true && reopened.body.timing.started_at === db.byId('sessions', sid).started_at, reopened.body.timing);
  const done = await call('POST', `/api/sessions/${sid}/finish`, act.user.id, { timed_out: true });
  check('ACT exam: finishing reports pacing with the time-out', done.status === 200 && done.body.pacing && done.body.pacing.timed_out && /unanswered/.test(done.body.pacing.verdict), done.body && done.body.pacing);
  void row;

  const eng = await sitAt('english', ['master']);
  check('English exam: no clock', eng.made.status === 201 && eng.made.body.timing === null, eng.made.body && eng.made.body.timing);
  const les = await sitAt('act', ['lesson']);
  check('ACT lesson: no clock', les.made.status === 201 && les.made.body.timing === null, les.made.body && les.made.body.timing);
  server.close();

  const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'session.js'), 'utf8');
  check('page: clock element, tick, time-out finish and pacing recap are wired', js.includes('id="exam-clock"') && js.includes('startClock()') && js.includes('timed_out: true') && js.includes('outcome.pacing'));

  try { fs.unlinkSync(tmp); } catch (_) { /* ignore */ }
  console.log(failures ? `\n${failures} failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})();
