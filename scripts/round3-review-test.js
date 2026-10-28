/**
 * Tests for the daily review (staged round 3, patch 01-daily-review):
 * services/review-session.js, routes/review.js and adaptation.dailyReview.
 *
 *   node scripts/round3-review-test.js
 *
 * Runs on its own throwaway data file with every model key blanked: no model
 * call, no network, nothing real touched.
 */
const os = require('os');
const path = require('path');
const fs = require('fs');
const http = require('http');

process.env.NODE_ENV = 'test';
for (const k of Object.keys(process.env)) if (/_API_KEY$|_KEY$|ANTHROPIC|OPENROUTER|NVIDIA|GEMINI|MIMO|MODELFLARE|XKIRO/.test(k) && k !== 'NODE_ENV') process.env[k] = '';
const tmp = path.join(os.tmpdir(), `${path.basename(__filename, '.js')}-${process.pid}.json`);
process.env.DB_FILE = tmp;
for (const k of ['COVERAGE_GATE', 'COVERAGE_RULE', 'ADAPTIVE_TEACHING', 'ADAPT_REVIEW_SESSION', 'ADAPT_CONSOLIDATE', 'ADAPT_EFFORT', 'ADAPT_REMEDIATION', 'ADAPT_OWNER', 'ADMIN_EMAILS', 'OWNER_EMAIL']) delete process.env[k];
// The live defaults are on (the coverage gate: enforce) since 2026-10-24 (LIVE-CHANGES-2026-10-24.md).
// The fixture's memory checks are a day after the proof, so it runs on the 1-day
// rule; the 7-day rule (RETAIN_REAL_DELAY, evidence P5) is tested in coverage-test.js.
process.env.RETAIN_REAL_DELAY = 'off';
// This test starts from every round-3 switch off, as it was written, and turns on what it tests.
Object.assign(process.env, { COVERAGE_GATE: 'shadow', ADAPTIVE_TEACHING: 'off', ADAPT_REVIEW_SESSION: 'off', ADAPT_CONSOLIDATE: 'off', ADAPT_EFFORT: 'off', ADAPT_REMEDIATION: 'off' });

const express = require('express');
const db = require('../config/db');
const curriculum = require('../config/curriculum');
const coverage = require('../services/coverage');

let failures = 0;
function check(label, ok, detail) {
  if (ok) { console.log(`  ok   ${label}`); return; }
  failures++;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 400)}`}`);
}

const DAY = coverage.DAY;
const TRACK = 'math';
const GRADE = 'numbers_to_10';
const grade = curriculum.getGrade(TRACK, GRADE);
const model = coverage.modelFor(TRACK, GRADE);
const FINAL = grade.levels.find((l) => l.kind === 'graduation').level;

/** A learner enrolled in numbers_to_10, standing on `level`. */
function learner(email, level, extra = {}) {
  const user = db.insert('users', { email, name: email.split('@')[0], password_hash: 'x', streak: 0, xp: 0, onboarded: true });
  const enrollment = db.insert('enrollments', {
    user_id: user.id, track_id: TRACK, grade_id: GRADE, target_level: grade.pathLength, current_level: level,
    level_items: 0, levels_completed: 0, xp: 0, status: 'active', pending_checkpoint: null, placed_at: new Date().toISOString(), ...extra,
  });
  const session = db.insert('sessions', {
    user_id: user.id, enrollment_id: enrollment.id, track_id: TRACK, grade_id: GRADE, level: 1, kind: 'lesson',
    blocks: [{ index: 0, level: 1, kind: 'practice', resolved: true }], started_at: new Date(Date.now() - 30 * DAY).toISOString(), ended_at: new Date().toISOString(),
  });
  return { user, enrollment, session };
}

/** One answered question on objective i, `daysAgo` days back: its lesson's check question, typed unless choices given. */
function answer(who, i, daysAgo, correct = true, { choices = null, ms = 9000, role = 'check', level = null } = {}) {
  const o = model.objectives[i];
  const at = new Date(Date.now() - daysAgo * DAY).toISOString();
  return db.insert('items', {
    user_id: who.user.id, session_id: who.session.id, skill_id: o.skill, difficulty: 3, format: choices ? 'multiple_choice' : 'short_answer',
    prompt: `q ${i} ${daysAgo} ${Math.random()}`, answer: '1', choices, role, level: level || o.lesson_level, block: 0, index: 0,
    user_answer: correct ? '1' : '2', correct, ms, coach_used: false, answered_at: at,
  });
}

/** Proven `daysAgo` days back (five typed right answers to its lesson's questions, minutes apart). */
function prove(who, i, daysAgo) {
  for (let k = 0; k < 5; k++) answer(who, i, daysAgo - k * 0.002);
}

/** Proven, then kept: a right typed memory check `checkDaysAgo` days back. */
function keep(who, i, provenDaysAgo, checkDaysAgo) {
  prove(who, i, provenDaysAgo);
  answer(who, i, checkDaysAgo);
}

/** Proven, then forgotten: a wrong memory check. */
function lapse(who, i, provenDaysAgo, checkDaysAgo) {
  prove(who, i, provenDaysAgo);
  answer(who, i, checkDaysAgo, false, { choices: ['1', '2', '3', '4'] });
}

function stateOf(who, i) {
  return coverage.forEnrollment(who.user.id, db.byId('enrollments', who.enrollment.id)).states[i];
}

/** An app with the given routers mounted under /api, signed in as the x-user header's account. */
function serve(routers) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.user = db.byId('users', Number(req.headers['x-user'])) || null; next(); });
  for (const r of routers) app.use('/api', r);
  app.use('/api', (req, res) => res.status(404).json({ error: 'No such endpoint.' }));
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const call = (method, url, body, uid) => new Promise((done, fail) => {
        const data = body ? JSON.stringify(body) : null;
        const req = http.request({ host: '127.0.0.1', port, path: url, method, headers: { 'content-type': 'application/json', 'x-user': String(uid || ''), ...(data ? { 'content-length': Buffer.byteLength(data) } : {}) } }, (res) => {
          let text = '';
          res.on('data', (c) => { text += c; });
          res.on('end', () => { let json = null; try { json = JSON.parse(text); } catch { json = null; } done({ status: res.statusCode, body: json }); });
        });
        req.on('error', fail);
        if (data) req.write(data);
        req.end();
      });
      resolve({ call, close: () => server.close() });
    });
  });
}

function done() {
  try { fs.unlinkSync(tmp); } catch { /* already gone */ }
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
  process.exit(failures ? 1 : 0);
}


(async () => {
  const adaptation = require('../services/adaptation');
  const review = require('../services/review-session');
  const sessions = require('../services/sessions');
  const app = await serve([require('../routes/review'), require('../routes/learn')]);
  const PRACTICE = model.objectives[3].practice[0];

  // A learner partway through the grade: 0 proven two days ago (a memory check
  // is due), 1 proven then forgotten (to learn again), 2 kept, 3 kept long ago.
  const a = learner('review-a@example.test', PRACTICE);
  prove(a, 0, 2);
  lapse(a, 1, 6, 3);
  keep(a, 2, 6, 4);
  keep(a, 3, 60, 58);
  check('fixture: 0 proven, 1 lapsed, 2 kept', stateOf(a, 0).status === 'proven' && stateOf(a, 1).status === 'lapsed' && stateOf(a, 2).status === 'retained',
    [0, 1, 2].map((i) => stateOf(a, i).status));

  console.log('off by default');
  {
    const r = await app.call('GET', `/api/review/${a.enrollment.id}`, null, a.user.id);
    check('GET /api/review answers 404 while ADAPT_REVIEW_SESSION is unset', r.status === 404, r.status);
    const s = await app.call('POST', `/api/review/${a.enrollment.id}/start`, {}, a.user.id);
    check('start answers 404 while off', s.status === 404, s.status);
    check('nothing in the live app calls dailyReview while off (review.enabled() is false)', review.enabled() === false);
  }

  process.env.ADAPT_REVIEW_SESSION = 'on';
  console.log('what is due');
  let today;
  {
    const r = await app.call('GET', `/api/review/${a.enrollment.id}`, null, a.user.id);
    today = r.body && r.body.review;
    check('GET /api/review answers 200 when on', r.status === 200 && !!today, r.status);
    check('the memory check due on objective 0 comes first', today.retrieve[0] && today.retrieve[0].objective === model.objectives[0].id && today.retrieve[0].reason === 'memory_check', today.retrieve[0]);
    check('the forgotten objective is listed to learn again, not as a question', today.reteach.some((x) => x.objective === model.objectives[1].id) && !today.retrieve.some((x) => x.objective === model.objectives[1].id));
    check('a re-taught objective carries its lesson level', today.reteach[0].lesson_level === model.objectives[1].lesson_level);
    check('the questions fit the time budget (10 minutes)', today.minutes <= 10 + 1e-9, today.minutes);
    check('counts by reason add up', today.counts.memory_check + today.counts.fading + today.counts.durability === today.retrieve.length, today.counts);
    check('the gate and durability are reported', today.gate.total === model.objectives.length && today.durability.total === model.objectives.length);
    process.env.ADAPT_REVIEW_MINUTES = '0.5';
    const small = adaptation.dailyReview({ userId: a.user.id, enrollment: a.enrollment });
    check('a tiny budget still serves one question, and says how many more are due', small.retrieve.length === 1 && small.more === today.retrieve.length - 1, { n: small.retrieve.length, more: small.more });
    delete process.env.ADAPT_REVIEW_MINUTES;
  }

  console.log('the sitting');
  let started;
  {
    const r = await app.call('POST', `/api/review/${a.enrollment.id}/start`, {}, a.user.id);
    started = r.body;
    check('start answers 201 with one question per objective due', r.status === 201 && started.items.length === today.retrieve.length, { status: r.status, n: started && started.items && started.items.length });
    const rows = sessions.itemsFor(started.session_id);
    const session = db.byId('sessions', started.session_id);
    check('it is a review sitting that moves nothing (kind review, preview)', session.kind === 'review' && session.preview === true);
    check('every question is tagged with its objective, as a test of it', rows.every((it) => it.objective_id && it.objective_test === true && it.role === 'review'));
    check('the questions follow the plan, objective by objective', rows.map((it) => it.objective_id).join() === today.retrieve.map((x) => x.objective).join());
    check('each question is on its objective\'s skill', rows.every((it, k) => it.skill_id === today.retrieve[k].skill));
    const again = await app.call('POST', `/api/review/${a.enrollment.id}/start`, {}, a.user.id);
    check('starting again resumes the same sitting', again.status === 200 && again.body.session_id === started.session_id && again.body.resumed === true);
    // Answer every question right, a little over a second each.
    for (const it of rows) {
      const res = await app.call('POST', `/api/sessions/${started.session_id}/answer`, { item_id: it.id, answer: it.answer, ms: 4000 }, a.user.id);
      if (!(res.status === 200 && res.body.reveal === true && res.body.correct === true)) check(`answer ${it.id} graded and revealed`, false, res);
    }
    check('answers are graded through the ordinary route, with the verdict shown', sessions.itemsFor(started.session_id).every((it) => it.correct === true));
    check('objective 0 now has its memory check on record', stateOf(a, 0).checks >= 1, stateOf(a, 0));
    const fin = await app.call('POST', `/api/review/sessions/${started.session_id}/finish`, {}, a.user.id);
    check('finish scores the sitting', fin.status === 200 && fin.body.right === rows.length && fin.body.accuracy === 1, fin.body);
    check('finish reports the gate after the review', fin.body.gate && fin.body.gate.total === model.objectives.length);
    const e = db.byId('enrollments', a.enrollment.id);
    check('the learner\'s level did not move', e.current_level === PRACTICE && e.status === 'active', e.current_level);
    check('XP is awarded', (db.byId('users', a.user.id).xp || 0) > 0);
    const after = await app.call('GET', `/api/review/${a.enrollment.id}`, null, a.user.id);
    check('the review is marked done for today', after.body.review.done_today === 1 && after.body.review.open_session === null);
    check('objective 0 is no longer due for a memory check today', !after.body.review.retrieve.some((x) => x.objective === model.objectives[0].id && x.reason === 'memory_check'));
  }

  console.log('a review left open is never taken for the level');
  {
    const b = learner('review-b@example.test', PRACTICE);
    prove(b, 0, 3);
    prove(b, 2, 3);
    const s = await app.call('POST', `/api/review/${b.enrollment.id}/start`, {}, b.user.id);
    check('a second learner\'s review opens', s.status === 201, s.status);
    const level = await app.call('POST', '/api/sessions', { enrollment_id: b.enrollment.id }, b.user.id);
    check('starting their level builds the level\'s own sitting, not the review', [200, 201].includes(level.status) && level.body.kind !== 'review' && level.body.session_id !== s.body.session_id, { status: level.status, kind: level.body && level.body.kind });
    const old = db.byId('sessions', s.body.session_id);
    check('the open review is closed, not resumed, and its answers stay on record', !!old.ended_at);
  }

  console.log('nothing due, other people, the owner');
  {
    const c = learner('review-c@example.test', PRACTICE);
    const r = await app.call('GET', `/api/review/${c.enrollment.id}`, null, c.user.id);
    check('a learner with nothing proven has nothing due', r.status === 200 && r.body.review.due === 0, r.body.review && r.body.review.due);
    const s = await app.call('POST', `/api/review/${c.enrollment.id}/start`, {}, c.user.id);
    check('and starting answers 409', s.status === 409, s.status);
    const other = await app.call('GET', `/api/review/${a.enrollment.id}`, null, c.user.id);
    check('another learner\'s review is not found', other.status === 404, other.status);
    const anon = await app.call('GET', `/api/review/${a.enrollment.id}`, null, null);
    check('signed out answers 401', anon.status === 401, anon.status);
  }

  app.close();
  done();
})().catch((err) => { console.error(err); process.exit(1); });
