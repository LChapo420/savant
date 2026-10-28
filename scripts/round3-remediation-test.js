/**
 * Tests for record-based remediation after a missed Final (staged round 3,
 * patch 04-remediation): services/remediation.js open() with
 * ADAPT_REMEDIATION=on, adaptation.remediationPlanFor, and the recall routes.
 *
 *   node scripts/round3-remediation-test.js
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
  const remediation = require('../services/remediation');
  const app = await serve([require('../routes/remediation'), require('../routes/learn')]);

  /** A sat Final with `missed` of its questions wrong, on the grade's first skill. */
  function satFinal(who, n = 10, missed = 3) {
    const s = db.insert('sessions', {
      user_id: who.user.id, enrollment_id: who.enrollment.id, track_id: TRACK, grade_id: GRADE, level: FINAL, kind: 'graduation',
      blocks: [{ index: 0, level: FINAL, kind: 'graduation', resolved: false }], started_at: new Date().toISOString(), ended_at: new Date().toISOString(),
    });
    const avoid = new Set();
    for (let i = 0; i < n; i++) {
      const q = bank.generate({ skillId: model.objectives[0].skill, difficulty: 3, seed: `f${i}`, avoid });
      avoid.add(bank.itemKey(q));
      db.insert('items', { ...q, session_id: s.id, user_id: who.user.id, role: 'exam', level: FINAL, block: 0, index: i, user_answer: i < missed ? 'x' : q.answer, correct: i >= missed, ms: 6000, coach_used: false, answered_at: new Date().toISOString() });
    }
    return s;
  }
  // A learner on the Final: most of the grade kept long ago (now faded), one
  // objective forgotten, one never proven, one proven yesterday.
  function onFinal(email) {
    const who = learner(email, FINAL);
    for (let i = 0; i < model.objectives.length; i++) {
      if (i === 1) lapse(who, i, 30, 20);
      else if (i === 2) continue;
      else if (i === 3) prove(who, i, 1.5);
      else keep(who, i, 90, 85);
    }
    return who;
  }
  const open = (who, s) => remediation.open({ userId: who.user.id, session: s, enrollment: db.byId('enrollments', who.enrollment.id), kind: 'graduation', accuracy: 0.7, required: 0.9 });

  console.log('off by default');
  {
    const a = onFinal('remed-a@example.test');
    const row = open(a, satFinal(a));
    check('a missed Final opens the skill areas as before while ADAPT_REMEDIATION is unset', row.areas.length >= 1 && !db.byId('remediations', row.id).record);
    check('the page payload carries no record plan', remediation.sanitize(db.byId('remediations', row.id)).record === null);
    const r = await app.call('POST', `/api/remediation/${row.id}/recall`, {}, a.user.id);
    check('the recall route answers 404', r.status === 404, r.status);
  }

  process.env.ADAPT_REMEDIATION = 'on';
  console.log('the record plan');
  let a;
  let row;
  {
    a = onFinal('remed-b@example.test');
    row = db.byId('remediations', open(a, satFinal(a)).id);
    const rec = row.record;
    check('a missed Final gets a plan from the record', !!rec && Array.isArray(rec.reteach) && Array.isArray(rec.retrieve), rec);
    const ids = (list) => list.map((x) => x.objective);
    check('the forgotten objective is to learn again', ids(rec.reteach).includes(model.objectives[1].id));
    check('the never-proven objective is to learn again', ids(rec.reteach).includes(model.objectives[2].id));
    check('faded kept objectives are to retrieve, not re-teach', rec.retrieve.length > 0 && rec.retrieve.every((x) => x.status === 'retained' || x.status === 'proven'));
    check('each row says whether a missed question spoke for it', rec.retrieve.every((x) => typeof x.missed === 'boolean'));
    check('re-teach rows carry the lesson to open', rec.reteach.every((x) => Number.isInteger(x.lesson_level)));
    check('the lists are capped to one sitting (12 recall, 6 re-teach)', rec.retrieve.length <= 12 && rec.reteach.length <= 6);
    check('the totals say how many there are in all', rec.retrieve_total >= rec.retrieve.length && rec.reteach_total >= rec.reteach.length);
    check('the skill areas are still there too', row.areas.length >= 1);
    const page = await app.call('GET', `/api/remediation/${a.enrollment.id}`, null, a.user.id);
    check('the help page payload carries the plan', page.status === 200 && page.body.remediation.record && page.body.remediation.record.reteach.length === rec.reteach.length);
  }

  console.log('a recall round');
  {
    const r = await app.call('POST', `/api/remediation/${row.id}/recall`, {}, a.user.id);
    check('recall opens a round of one question per objective to retrieve', r.status === 201 && r.body.items.length === row.record.retrieve.length, { status: r.status, body: r.body && r.body.error });
    const items = sessions.itemsFor(r.body.session_id);
    check('every question is tagged with its objective', items.every((it, k) => it.objective_id === row.record.retrieve[k].objective && it.role === 'drill'));
    check('the round is a drill sitting, which never moves a level', db.byId('sessions', r.body.session_id).kind === 'remediate');
    const idx = (it) => model.objectives.findIndex((o) => o.id === it.objective_id);
    const before = items.map((it) => stateOf(a, idx(it)).answers);
    for (const it of items) {
      const res = await app.call('POST', `/api/sessions/${r.body.session_id}/answer`, { item_id: it.id, answer: it.answer, ms: 5000 }, a.user.id);
      if (!(res.body && res.body.reveal === true)) check(`recall answer ${it.id} revealed`, false, res.body);
    }
    const fin = await app.call('POST', `/api/remediation/${row.id}/recall/finish`, { session_id: r.body.session_id }, a.user.id);
    check('finishing scores the round', fin.status === 200 && fin.body.correct === items.length, fin.body);
    check('the round is kept on the plan', fin.body.remediation.record.rounds.length === 1);
    const counted = items.filter((it, k) => stateOf(a, idx(it)).answers === before[k] + 1).length;
    check('each recall answer is evidence on its own objective, and only that one', counted === items.length, { counted, n: items.length });
    const e = db.byId('enrollments', a.enrollment.id);
    check('the learner is still on the Final', e.current_level === FINAL && e.status === 'active');
  }

  console.log('below the Final, and other people');
  {
    const b = onFinal('remed-c@example.test');
    const s = satFinal(b);
    const r = remediation.open({ userId: b.user.id, session: s, enrollment: b.enrollment, kind: 'master', accuracy: 0.5, required: 0.75 });
    check('a missed Master quiz keeps the skill areas only', !db.byId('remediations', r.id).record);
    const other = await app.call('POST', `/api/remediation/${row.id}/recall`, {}, b.user.id);
    check('another learner cannot open this plan\'s recall', other.status === 404, other.status);
  }

  app.close();
  done();
})().catch((err) => { console.error(err); process.exit(1); });
