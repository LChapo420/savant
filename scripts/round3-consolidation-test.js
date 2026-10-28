/**
 * Tests for consolidation before the Final (staged round 3, patch
 * 02-consolidation): services/consolidation.js, adaptation.consolidation, the
 * session route's hold on the Final, and GET /api/consolidation.
 *
 *   node scripts/round3-consolidation-test.js
 *
 * Needs the daily review (patch 01) for the stretch to run at all; without it
 * the test checks that consolidation stays off. Runs on its own throwaway data
 * file with every model key blanked: no model call, no network.
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
  const consolidation = require('../services/consolidation');
  const app = await serve([require('../routes/learn')]);
  let haveReview = true;
  try { require('../services/review-session'); } catch { haveReview = false; }

  // A learner on the Final: everything proven and kept, but recently, so the
  // curve does not yet expect it to last a month.
  function onFinal(email, extra) {
    const who = learner(email, FINAL, extra);
    for (let i = 0; i < model.objectives.length; i++) keep(who, i, 4, 2);
    return who;
  }

  console.log('off by default');
  {
    const a = onFinal('cons-a@example.test');
    check('ADAPT_CONSOLIDATE unset: off', consolidation.enabled() === false && consolidation.forEnrollment(a.user.id, a.enrollment) === null);
    const r = await app.call('GET', `/api/consolidation/${a.enrollment.id}`, null, a.user.id);
    check('the path route answers 404 while off', r.status === 404, r.status);
    process.env.ADAPT_CONSOLIDATE = 'on';
    check('on, but without the daily review switched on: still off (no review to do)', consolidation.enabled() === false);
  }
  if (!haveReview) {
    console.log('  (patch 01-daily-review is not applied: consolidation cannot run, as designed)');
    app.close();
    done();
    return;
  }

  process.env.ADAPT_REVIEW_SESSION = 'on';
  console.log('the stretch');
  {
    const a = onFinal('cons-b@example.test');
    const c = consolidation.forEnrollment(a.user.id, a.enrollment);
    check('on the Final, with the grade not yet lasting: active', c && c.active === true, c);
    check('day 1 of at most 21', c.day === 1 && c.days === 21, { day: c.day, days: c.days });
    check('ends 21 days from the first day on the Final', Math.abs(Date.parse(c.ends_at) - (Date.parse(c.started_at) + 21 * DAY)) < 1000);
    check('it starts the clock on the enrollment', !!db.byId('enrollments', a.enrollment.id).consolidation_started_at);
    check('it reports how much of the grade will last, against 90%', c.share < 0.9 && c.at === 0.9, { share: c.share });
    check('it carries today\'s review (10 minutes at most)', c.review && c.review.minutes <= 10, c.review);
    check('it names the next grade, to start meanwhile', c.next_grade && c.next_grade.id === curriculum.getTrack(TRACK).grades[curriculum.getTrack(TRACK).grades.findIndex((g) => g.id === GRADE) + 1].id && c.next_grade.enrollment_id === null, c.next_grade);
    const r = await app.call('GET', `/api/consolidation/${a.enrollment.id}`, null, a.user.id);
    check('GET /api/consolidation reports it', r.status === 200 && r.body.consolidation.active === true);
    const s = await app.call('POST', '/api/sessions', { enrollment_id: a.enrollment.id }, a.user.id);
    check('asking for the Final during the stretch answers 409, with the stretch', s.status === 409 && s.body.consolidation && /Before the Final/.test(s.body.error), { status: s.status, error: s.body && s.body.error });
    // One date for the path, the session page and the dashboard (bug fix 2026-10-25: the path said
    // "opens by November 14" in the browser's zone while the route said November 15 in UTC).
    check('the stretch carries the one "opens by" label, and the 409 message uses it', c.opens_label && s.body.error.includes(`The Final opens by ${c.opens_label}, or sooner.`) && r.body.consolidation.opens_label === c.opens_label, { label: c.opens_label, error: s.body.error });
    const late = Date.UTC(2026, 10, 15, 2, 0, 0); // 02:00 UTC on November 15 is still November 14 in New York
    check('opensBy: the date is the learner\'s own day, in their zone', consolidation.opensBy(new Date(late).toISOString(), 'America/New_York').opens_label === 'November 14'
      && consolidation.opensBy(new Date(late).toISOString(), 'America/New_York').opens_on === '2026-11-14'
      && consolidation.opensBy(new Date(late).toISOString(), 'UTC').opens_label === 'November 15', consolidation.opensBy(new Date(late).toISOString(), 'America/New_York'));
    db.update('users', a.user.id, { retention_tz: 'America/New_York' });
    const cz = consolidation.forEnrollment(a.user.id, db.byId('enrollments', a.enrollment.id));
    check('the learner\'s zone is the one used (retention_tz, as the streak reads it)', cz.opens_tz === 'America/New_York' && cz.opens_label === consolidation.opensBy(cz.ends_at, 'America/New_York').opens_label, { tz: cz.opens_tz, label: cz.opens_label });
    db.update('users', a.user.id, { retention_tz: null });
    const back = await app.call('POST', '/api/sessions', { enrollment_id: a.enrollment.id, level: model.objectives[0].lesson_level }, a.user.id);
    check('an earlier level can still be opened (a lesson to learn again)', [200, 201].includes(back.status), back.status);
    const nextId = c.next_grade.id;
    const catalog = require('../routes/catalog').router;
    const app2 = await serve([catalog]);
    const made = await app2.call('POST', '/api/enrollments', { selections: [{ track_id: TRACK, grade_id: nextId }] }, a.user.id);
    app2.close();
    check('the next grade can be started meanwhile', made.status === 201 && made.body.created.length === 1);
    const c2 = consolidation.forEnrollment(a.user.id, db.byId('enrollments', a.enrollment.id));
    check('and the stretch then links to it', c2.next_grade.enrollment_id === made.body.created[0].id);
  }

  console.log('it ends');
  {
    const a = onFinal('cons-c@example.test', { consolidation_started_at: new Date(Date.now() - 22 * DAY).toISOString() });
    const c = consolidation.forEnrollment(a.user.id, a.enrollment);
    check('after 21 days it ends on time', c && c.active === false && c.reason === 'time', c);
    const e = db.byId('enrollments', a.enrollment.id);
    check('and stays ended (recorded on the enrollment)', !!e.consolidation_ended_at && e.consolidation_reason === 'time');
    check('a later look agrees without recomputing', consolidation.forEnrollment(a.user.id, e).active === false);
    process.env.ADAPT_CONSOLIDATE_AT = '0';
    const b = onFinal('cons-d@example.test');
    const d = consolidation.forEnrollment(b.user.id, b.enrollment);
    check('when enough of the grade will last it ends at once (durable)', d.active === false && d.reason === 'durable', d);
    delete process.env.ADAPT_CONSOLIDATE_AT;
    const pure = adaptation.consolidation({ model, states: coverage.forEnrollment(b.user.id, b.enrollment).states, now: Date.now(), startedAt: Date.now() - 3.5 * DAY });
    check('the pure rule counts days from the start (day 4)', pure.day === 4 && pure.active === true, pure);
  }

  console.log('when it does not apply');
  {
    const a = onFinal('cons-e@example.test', { checkpoint_attempts: 1 });
    check('not before a retry of a missed Final', consolidation.forEnrollment(a.user.id, a.enrollment) === null);
    const b = onFinal('cons-f@example.test', { coverage_held_at: new Date().toISOString() });
    check('not on a held graduation', consolidation.forEnrollment(b.user.id, b.enrollment) === null);
    const d = onFinal('cons-h@example.test');
    db.insert('sessions', { user_id: d.user.id, enrollment_id: d.enrollment.id, track_id: TRACK, grade_id: GRADE, level: FINAL, kind: 'graduation', blocks: [], started_at: new Date().toISOString(), ended_at: null });
    check('not while a Final is already under way (it is finished, not held)', consolidation.forEnrollment(d.user.id, d.enrollment) === null);
    const c = learner('cons-g@example.test', model.objectives[3].practice[0]);
    check('not below the Final', consolidation.forEnrollment(c.user.id, c.enrollment) === null);
    const other = await app.call('GET', `/api/consolidation/${b.enrollment.id}`, null, c.user.id);
    check('another learner\'s stretch is not found', other.status === 404);
  }

  app.close();
  done();
})().catch((err) => { console.error(err); process.exit(1); });
