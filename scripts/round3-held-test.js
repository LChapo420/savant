/**
 * Tests for the graduation-held screen's server side (staged round 3, patch
 * 05-graduation-held): routes/coverage.js and adaptation.heldPlanFor, with
 * COVERAGE_GATE=enforce and with the default (shadow).
 *
 *   node scripts/round3-held-test.js
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
  const mastery = require('../services/mastery');
  const app = await serve([require('../routes/coverage')]);

  // A learner on the Final with every objective kept except: 1 forgotten,
  // 2 never proven, 3 proven 1.5 days ago (memory check due), 4 proven an
  // hour ago (memory check not due yet).
  function onFinal(email) {
    const who = learner(email, FINAL);
    for (let i = 0; i < model.objectives.length; i++) {
      if (i === 1) lapse(who, i, 30, 20);
      else if (i === 2) continue;
      else if (i === 3) prove(who, i, 1.5);
      else if (i === 4) prove(who, i, 0.05);
      else keep(who, i, 20, 10);
    }
    return who;
  }
  const passFinal = (who) => mastery.clearCheckpoint(db.byId('enrollments', who.enrollment.id), grade, 'graduation');

  console.log('shadow (the default): nothing is held');
  {
    const a = onFinal('held-a@example.test');
    const out = passFinal(a);
    check('the Final graduates as today', out.graduated === true && db.byId('enrollments', a.enrollment.id).status === 'graduated');
    const r = await app.call('GET', `/api/coverage/${a.enrollment.id}/held`, null, a.user.id);
    check('the held view says nothing is held', r.status === 200 && r.body.held === false && r.body.status === 'graduated', r.body);
  }

  process.env.COVERAGE_GATE = 'enforce';
  console.log('enforce: held, and what it waits on');
  let b;
  {
    b = onFinal('held-b@example.test');
    const out = passFinal(b);
    check('passing the Final with objectives unproven holds graduation', out.graduated === false && out.coverage_held === true, out);
    const e = db.byId('enrollments', b.enrollment.id);
    check('the learner stays on the Final, marked held', e.status === 'active' && e.current_level === FINAL && !!e.coverage_held_at);
    const r = await app.call('GET', `/api/coverage/${b.enrollment.id}/held`, null, b.user.id);
    const p = r.body.plan;
    check('the held view says so, with a plan', r.status === 200 && r.body.held === true && !!p, r.body);
    check('it counts what is kept', p.total === model.objectives.length && p.kept === model.objectives.length - 4, { total: p.total, kept: p.kept });
    const need = (i) => (p.objectives.find((o) => o.objective === model.objectives[i].id) || {}).needs;
    check('the forgotten objective needs learning again', need(1) === 'relearn');
    check('the never-proven objective needs learning', need(2) === 'learn');
    check('the proven ones need a memory check', need(3) === 'memory_check' && need(4) === 'memory_check');
    const o3 = p.objectives.find((o) => o.objective === model.objectives[3].id);
    const o4 = p.objectives.find((o) => o.objective === model.objectives[4].id);
    check('a check due now says so; one not due yet says when', o3.due_now === true && o4.due_now === false && Date.parse(o4.due_at) > Date.now());
    check('forgotten first, then never proven, then memory checks', p.objectives.map((o) => o.needs).join() === 'relearn,learn,memory_check,memory_check');
    check('each row carries its lesson level for the way in', p.objectives.every((o) => Number.isInteger(o.lesson_level)));
    check('the Final\'s own summary is passed on', r.body.exam && r.body.exam.held === true && r.body.exam.blocking_count === 4);
    const g = await app.call('POST', `/api/coverage/${b.enrollment.id}/graduate`, {}, b.user.id);
    check('graduating now is refused by the same gate', g.status === 200 && g.body.graduated === false && g.body.held === true);
  }

  console.log('the record completes, and the learner graduates');
  {
    // Prove and keep the four (answers dated in the past, as a learner's would be);
    // the forgotten one is proven again, then kept.
    prove(b, 1, 3); answer(b, 1, 1.5);
    prove(b, 2, 3); answer(b, 2, 1.5);
    answer(b, 3, 0.2);
    // Objective 4 was proven an hour ago: its memory check cannot be yet.
    const mid = await app.call('GET', `/api/coverage/${b.enrollment.id}/held`, null, b.user.id);
    check('three settled, one memory check still to come', mid.body.plan.kept === model.objectives.length - 1, mid.body.plan.kept);
    // A day later the check is answered (here: the proof is moved back a day).
    for (const it of db.find('items', (x) => x.user_id === b.user.id && x.level === model.objectives[4].lesson_level)) {
      db.update('items', it.id, { answered_at: new Date(Date.parse(it.answered_at) - 2 * DAY).toISOString() });
    }
    answer(b, 4, 0.1);
    const ready = await app.call('GET', `/api/coverage/${b.enrollment.id}/held`, null, b.user.id);
    check('the plan says the record is complete', ready.body.plan.complete === true && ready.body.plan.kept === model.objectives.length, ready.body.plan.kept);
    const g = await app.call('POST', `/api/coverage/${b.enrollment.id}/graduate`, {}, b.user.id);
    check('graduate now graduates', g.status === 200 && g.body.graduated === true, g.body);
    const e = db.byId('enrollments', b.enrollment.id);
    check('the enrollment is graduated and no longer held', e.status === 'graduated' && !e.coverage_held_at && !!e.coverage_released_at);
    const again = await app.call('POST', `/api/coverage/${b.enrollment.id}/graduate`, {}, b.user.id);
    check('asking again is harmless', again.status === 200 && again.body.graduated === true && again.body.already === true);
  }

  console.log('guards');
  {
    const c = learner('held-c@example.test', FINAL);
    const g = await app.call('POST', `/api/coverage/${c.enrollment.id}/graduate`, {}, c.user.id);
    check('graduate before passing the Final is refused', g.status === 409, g.status);
    const other = await app.call('GET', `/api/coverage/${b.enrollment.id}/held`, null, c.user.id);
    check('another learner\'s record is not found', other.status === 404);
    const anon = await app.call('GET', `/api/coverage/${b.enrollment.id}/held`, null, null);
    check('signed out answers 401', anon.status === 401);
  }

  app.close();
  done();
})().catch((err) => { console.error(err); process.exit(1); });
