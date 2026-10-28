/**
 * Tests for "too fast to count" on checkpoints and the Final, and slow-down
 * feedback (staged round 3, patch 03-too-fast): services/effort-monitor.js and
 * the answer route.
 *
 *   node scripts/round3-effort-test.js
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
  const bank = require('../content/bank');
  const sessions = require('../services/sessions');
  const adaptation = require('../services/adaptation');
  const effort = require('../services/effort-monitor');
  const app = await serve([require('../routes/learn')]);
  const MASTER = grade.levels.find((l) => l.kind === 'master').level;
  const PRACTICE = model.objectives[3].practice[0];

  /** A checkpoint sitting of `n` bank questions on the grade's first skill. */
  function checkpoint(who, kind = 'master', n = 6) {
    const s = db.insert('sessions', {
      user_id: who.user.id, enrollment_id: who.enrollment.id, track_id: TRACK, grade_id: GRADE, level: who.enrollment.current_level,
      start_level: who.enrollment.current_level, levels: [who.enrollment.current_level], kind,
      blocks: [{ index: 0, level: who.enrollment.current_level, kind, resolved: false }], params: {}, started_at: new Date().toISOString(), ended_at: null,
    });
    const avoid = new Set();
    for (let i = 0; i < n; i++) {
      const q = bank.generate({ skillId: model.objectives[0].skill, difficulty: 3, seed: `t${i}`, avoid });
      avoid.add(bank.itemKey(q));
      db.insert('items', { ...q, session_id: s.id, user_id: who.user.id, role: 'exam', level: who.enrollment.current_level, block: 0, index: i, user_answer: null, correct: null, ms: null, coach_used: false });
    }
    return s;
  }
  const post = (who, s, it, ms, ans) => app.call('POST', `/api/sessions/${s.id}/answer`, { item_id: it.id, answer: ans === undefined ? it.answer : ans, ms }, who.user.id);

  console.log('off by default');
  {
    const a = learner('fast-a@example.test', MASTER);
    const s = checkpoint(a);
    const it = sessions.itemsFor(s.id)[0];
    const r = await post(a, s, it, 300);
    check('a rapid answer on a checkpoint is scored as before while ADAPT_EFFORT is unset', r.status === 200 && r.body.recorded === true && !r.body.too_fast, r.body);
    check('and nothing is set aside', !db.byId('items', it.id).reserved && db.byId('items', it.id).correct !== null);
  }

  process.env.ADAPT_EFFORT = 'on';
  console.log('too fast to count');
  {
    const a = learner('fast-b@example.test', MASTER);
    const s = checkpoint(a);
    const first = sessions.itemsFor(s.id)[0];
    const r1 = await post(a, s, first, 300);
    check('a rapid answer is not scored: too_fast, with a replacement', r1.status === 200 && r1.body.too_fast === true && r1.body.recorded === false && !!r1.body.replacement, r1.body);
    check('the learner is told why, in words', /too fast to count/i.test(r1.body.message || ''));
    const orig = db.byId('items', first.id);
    check('the rapid answer is kept on its item, set aside and ungraded', orig.reserved === true && orig.correct === null && orig.ms === 300 && orig.user_answer !== null);
    const rep1 = db.byId('items', r1.body.replacement.id);
    check('the replacement is a parallel question: same skill, difficulty, place and role', rep1.skill_id === orig.skill_id && rep1.difficulty === orig.difficulty && rep1.index === orig.index && rep1.role === 'exam' && rep1.parallel_of === orig.id);
    check('the replacement is a different question', bank.itemKey(rep1) !== bank.itemKey(orig));
    check('the page is told the replacement in the sanitized shape (no answer)', r1.body.replacement.answer === undefined && r1.body.replacement.prompt);
    const r2 = await post(a, s, rep1, 250);
    check('a second rapid answer is set aside again', r2.body.too_fast === true, r2.body);
    const rep2 = db.byId('items', r2.body.replacement.id);
    check('the chain is counted', rep2.reserve_count === 2 && rep2.parallel_of === orig.id);
    const r3 = await post(a, s, rep2, 200, rep2.answer);
    check('the third rapid answer stands as given (at most twice per question)', r3.body.recorded === true && !r3.body.too_fast, r3.body);
    check('it is graded', db.byId('items', rep2.id).correct === true);
    // The rest at a reading pace.
    for (const it of sessions.itemsFor(s.id).filter((x) => x.user_answer === null)) await post(a, s, it, 5000);
    const all = sessions.itemsFor(s.id);
    const scored = all.filter((x) => x.correct !== null);
    check('the number of scored questions is unchanged (6)', scored.length === 6, scored.length);
    check('set-aside answers are reported to the page as reserved', all.filter((x) => x.reserved).length === 2 && sessions.sanitize(all.find((x) => x.reserved)).reserved === true);
    const last = await post(a, s, all.find((x) => x.correct !== null), 5000);
    check('answering again reports the stored result, nothing new is set aside', last.body.recorded === true && !last.body.too_fast);
    const states = coverage.forEnrollment(a.user.id, db.byId('enrollments', a.enrollment.id)).states;
    const rapid = states.reduce((n, st) => n + (st.rapid || 0), 0);
    check('the record counts the set-aside answers as rapid, never as evidence', rapid >= 2, rapid);
  }

  console.log('only on scored sittings');
  {
    const a = learner('fast-c@example.test', PRACTICE);
    const s = checkpoint(a, 'lesson');
    const it = sessions.itemsFor(s.id)[0];
    const r = await post(a, s, it, 300);
    check('a rapid answer on practice is graded as usual', r.body.recorded === true && !r.body.too_fast, r.body);
    check('no slow-down note for a learner the record does not flag', !r.body.slow_down, r.body.slow_down);
    check('a preview checkpoint is not monitored', effort.screen({ userId: a.user.id, session: { kind: 'master', preview: true }, item: { role: 'exam', user_answer: null }, ms: 100 }) === null);
    process.env.ADAPT_MAX_RESERVE = '0';
    const s2 = checkpoint(a, 'graduation', 2);
    const r2 = await post(a, s2, sessions.itemsFor(s2.id)[0], 100);
    check('ADAPT_MAX_RESERVE=0 scores every answer', r2.body.recorded === true && !r2.body.too_fast);
    delete process.env.ADAPT_MAX_RESERVE;
  }

  console.log('slow-down feedback for a learner the record flags');
  {
    const a = learner('fast-d@example.test', PRACTICE);
    // Forty answers, a third of them rapid guesses.
    for (let k = 0; k < 40; k++) answer(a, k % 4, 10 - k * 0.01, k % 2 === 0, { ms: k % 3 === 0 ? 400 : 6000 });
    const e = adaptation.effortFor({ userId: a.user.id, enrollment: a.enrollment });
    check('the record flags the learner (more than 5% rapid, 95% sure)', e && e.flagged, e);
    const s = checkpoint(a, 'lesson');
    const items = sessions.itemsFor(s.id);
    const r = await post(a, s, items[0], 500);
    check('a rapid practice answer gets the slow-down note', r.body.slow_down && /read each question/i.test(r.body.slow_down.message), r.body);
    check('the flag is read once and kept on the sitting', !!db.byId('sessions', s.id).effort_flag);
    const r2 = await post(a, s, items[1], 6000);
    check('an answer at a reading pace gets no note', !r2.body.slow_down);
    const c = checkpoint(a, 'master', 3);
    const cr = await post(a, c, sessions.itemsFor(c.id)[0], 300);
    check('on a checkpoint the rapid answer is set aside (the note comes with it)', cr.body.too_fast === true);
  }

  app.close();
  done();
})().catch((err) => { console.error(err); process.exit(1); });
