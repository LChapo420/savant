/**
 * Two fixes from the fourth end-to-end QA pass, checked over HTTP:
 *
 *   1. The feedback-timing preference. A learner whose profile says "feedback at
 *      the end" has their answers recorded without a verdict, and gets every
 *      question's verdict, answer and explanation together when the level
 *      closes. Everyone else — the default — still sees each verdict as they go,
 *      and checkpoints still hold theirs exactly as before.
 *   2. The dashboard's recent sessions. A sitting closed without an answer is
 *      not listed, and a sitting is listed (and recapped) at the levels it
 *      actually worked, not the level the learner was moved on to.
 *
 *   node scripts/qa4-fixes-test.js
 *
 * No model is called: every model key is blanked before anything is loaded, and
 * the background work that could reach one is stubbed. It runs on its own copy
 * of the data file (deleted at the end) unless DB_FILE=<file> names one, under
 * accounts named qa4fix-*.
 */
process.env.NODE_ENV = 'test';
for (const name of Object.keys(process.env)) {
  if (/(_API_KEY|_TOKEN|_SECRET_API|_WORKSPACE)$/.test(name) || /^(OPENROUTER|ANTHROPIC|GEMINI|MIMO|MODELFLARE|DEEPSEEK|MINIMAX)_.*KEY/.test(name)) process.env[name] = '';
}
// The local model is not a key, so blanking keys does not stop it: a test that
// reached the real Ollama on this laptop waited on it and stalled (2026-10-23).
process.env.OLLAMA_ENABLED = '0';
// Game and block levels go to their own pages; this test is about the ordinary
// session, so only the owner (nobody here) is sent to those.
process.env.BLOCK_LEVELS = 'owner';
process.env.BASE_LESSON_ACCOUNTS = '';

const fs = require('fs');
const os = require('os');
const path = require('path');

let ownCopy = null;
if (!process.env.DB_FILE) {
  ownCopy = path.join(os.tmpdir(), `qa4-fixes-test-${process.pid}.json`);
  fs.copyFileSync(path.join(__dirname, '..', 'data', 'db.json'), ownCopy);
  process.env.DB_FILE = ownCopy;
}
const express = require('express');
const db = require('../config/db');
// Registered after the data file's own exit handler, which writes the store
// back on exit: deleting the copy first would only see it written again.
process.on('exit', () => { if (ownCopy) try { fs.unlinkSync(ownCopy); } catch { /* gone */ } });
const curriculum = require('../config/curriculum');
const sessions = require('../services/sessions');
const learner = require('../services/learner');
const lessons = require('../services/lessons');
const levelEditor = require('../services/level-editor');
const learnerRecord = require('../services/learner-record');
const ai = require('../services/ai');

// Nothing in the background: the after-level read and the next lesson written
// ahead are the two things here that could otherwise go looking for a model.
lessons.prefetch = () => {};
lessons.prefetchNext = () => {};
levelEditor.prefetchNext = () => {};
levelEditor.ensure = async () => null;
learnerRecord.scheduleDebrief = () => {};

let failures = 0;
function check(label, condition, detail) {
  if (condition) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`);
  }
}

const TRACK = 'math';
const GRADE = 'numbers_to_10';
const grade = curriculum.getGrade(TRACK, GRADE);
const kindAt = (l) => curriculum.levelKind(l, grade.pathLength, grade);
const firstOf = (kind) => { for (let l = 1; l <= grade.pathLength; l++) if (kindAt(l) === kind) return l; return null; };
const PRACTICE = firstOf('practice');
const LESSON = firstOf('lesson');
const MASTER = firstOf('master');

let seq = 0;
function newLearner(feedbackAtEnd) {
  seq++;
  const user = db.insert('users', {
    email: `qa4fix-${process.pid}-${seq}@example.test`, display_name: 'qa4 fix', password_hash: 'x',
  });
  if (feedbackAtEnd !== undefined) {
    // What the style quiz writes: 0..1 per dimension, high = "at the end".
    learner.saveProfile(user.id, { style_vector: { feedback_timing: feedbackAtEnd ? 0.9 : 0.1 }, took_style_quiz: true });
  }
  return user;
}
function enroll(user, level) {
  return db.insert('enrollments', {
    user_id: user.id, track_id: TRACK, grade_id: GRADE, target_level: grade.pathLength,
    current_level: level, level_items: 0, levels_completed: level - 1, xp: 0, status: 'active',
  });
}

async function main() {
  check('the test grade has a practice, a lesson and a master level', PRACTICE && LESSON && MASTER, { PRACTICE, LESSON, MASTER });
  check('no model is reachable', !ai.isEnabled());

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.user = db.byId('users', Number(req.headers['x-test-user'])) || null; next(); });
  app.use('/api', require('../routes/learn'));
  app.use('/api', require('../routes/profile'));
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (user, method, url, body) => {
    const res = await fetch(base + url, {
      method,
      headers: { 'content-type': 'application/json', 'x-test-user': String(user.id) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  const stored = (id) => db.byId('items', id);
  // Answer every question in a block, alternating right and wrong so the
  // review has both to show.
  async function answerAll(user, s, items) {
    const out = [];
    for (const [i, it] of items.entries()) {
      const row = stored(it.id);
      const answer = i % 2 === 0 ? row.answer : `${row.answer} (wrong)`;
      out.push((await call(user, 'POST', `/sessions/${s.session_id}/answer`, { item_id: it.id, answer, ms: 3000 })).body);
    }
    return out;
  }

  try {
    // ── 1. the default: feedback after each question ─────────────────────
    console.log('\nfeedback timing: the default');
    const plain = newLearner();
    check('a learner who never said gets feedback after each question',
      learner.sessionParams(learner.getProfile(plain.id)).immediateFeedback === true);
    const pe = enroll(plain, PRACTICE);
    let r = await call(plain, 'POST', '/sessions', { enrollment_id: pe.id, ordinary: true });
    check('a practice session starts', r.status === 201 || r.status === 200, r);
    const ps = r.body;
    check('the session says feedback is immediate', ps.immediate_feedback === true, ps.immediate_feedback);
    const pItems = ps.items.filter((i) => i.block === 0 && i.role !== 'retention');
    const pAns = await answerAll(plain, ps, pItems);
    check('every answer is revealed on the spot', pAns.every((a) => a.reveal === true && typeof a.correct === 'boolean'), pAns.map((a) => a.reveal));
    r = await call(plain, 'POST', `/sessions/${ps.session_id}/block-finish`, { block: 0 });
    check('the level closes', r.status === 200, r);
    check('there is nothing held back to review', Array.isArray(r.body.review) && r.body.review.length === 0, r.body.review);

    // ── 2. feedback at the end ────────────────────────────────────────────
    console.log('\nfeedback timing: at the end of the level');
    const held = newLearner(true);
    check('the profile asks for feedback at the end',
      learner.sessionParams(learner.getProfile(held.id)).immediateFeedback === false);
    const he = enroll(held, PRACTICE);
    r = await call(held, 'POST', '/sessions', { enrollment_id: he.id, ordinary: true });
    const hs = r.body;
    check('the session says so', hs.immediate_feedback === false && hs.params.immediateFeedback === false,
      { flag: hs.immediate_feedback, params: hs.params && hs.params.immediateFeedback });
    const got = await call(held, 'GET', `/sessions/${hs.session_id}`);
    check('and says so again on a reload', got.body.session.immediate_feedback === false, got.body.session.immediate_feedback);
    const hItems = hs.items.filter((i) => i.block === 0 && i.role !== 'retention');
    const hAns = await answerAll(held, hs, hItems);
    check('no answer reveals a verdict', hAns.every((a) => a.recorded === true && a.reveal === false), hAns);
    check('nor the answer or explanation',
      hAns.every((a) => !('correct' in a) && !('answer' in a) && !('rationale' in a)), hAns[0]);
    check('every answer is still graded and stored',
      hItems.every((it) => typeof stored(it.id).correct === 'boolean'), hItems.map((it) => stored(it.id).correct));
    check('and fed into mastery', !!db.findOne('skill_states', (s) => s.user_id === held.id), null);
    r = await call(held, 'POST', `/sessions/${hs.session_id}/block-finish`, { block: 0 });
    check('the level closes as usual', r.status === 200 && typeof r.body.level_complete === 'boolean', r);
    const review = r.body.review || [];
    check('the close carries every question of the level', review.length === hItems.length, { got: review.length, want: hItems.length });
    check('each with its verdict, matching what was graded',
      review.every((x) => x.correct === stored(x.id).correct), review.map((x) => [x.correct, stored(x.id).correct]));
    check('each with the answer, the explanation and what the learner said',
      review.every((x) => x.answer !== undefined && typeof x.rationale === 'string' && x.your_answer === stored(x.id).user_answer), review[0]);
    check('both right and wrong ones are in it', review.some((x) => x.correct) && review.some((x) => !x.correct));
    if (r.body.retention) {
      const rec = await call(held, 'POST', `/sessions/${hs.session_id}/answer`, { item_id: r.body.retention.id, answer: 'x', ms: 1000 });
      check('the level recall reveals on the spot', rec.body.reveal === true, rec.body);
    }

    // ── 3. a lesson's checks follow the preference too ────────────────────
    console.log('\nfeedback timing: a lesson level');
    const lessonHeld = newLearner(true);
    const le = enroll(lessonHeld, LESSON);
    r = await call(lessonHeld, 'POST', '/sessions', { enrollment_id: le.id, ordinary: true });
    const ls = r.body;
    const lItems = (ls.items || []).filter((i) => i.block === 0 && i.role !== 'retention');
    check('a lesson level starts with check questions', ls.kind === 'teach' && lItems.length > 0, { kind: ls.kind, n: lItems.length });
    const lAns = await answerAll(lessonHeld, ls, lItems);
    // A lesson's checks are on the same level as its teaching, so they follow
    // the learner's choice (owner's decision, 2026-10-22).
    check('its checks are recorded without a verdict', lAns.every((a) => a.reveal === false), lAns.map((a) => a.reveal));
    r = await call(lessonHeld, 'POST', `/sessions/${ls.session_id}/block-finish`, { block: 0 });
    check('and reviewed together when the lesson closes', (r.body.review || []).length === lItems.length, (r.body.review || []).length);
    const lessonClose = r.body;

    // ── 4. checkpoints are unchanged ──────────────────────────────────────
    console.log('\nfeedback timing: checkpoints keep their own rule');
    for (const atEnd of [false, true]) {
      const u = newLearner(atEnd);
      const ce = enroll(u, MASTER);
      r = await call(u, 'POST', '/sessions', { enrollment_id: ce.id, ordinary: true });
      const cs = r.body;
      check(`a master quiz starts (feedback ${atEnd ? 'at the end' : 'immediate'})`, cs.kind === 'master', cs.kind || r);
      const cItems = (cs.items || []).filter((i) => i.role !== 'retention').slice(0, 3);
      const cAns = await answerAll(u, cs, cItems);
      check('its answers hold their verdict, as before', cAns.every((a) => a.reveal === false), cAns.map((a) => a.reveal));
      const fin = await call(u, 'POST', `/sessions/${cs.session_id}/finish`, {});
      check('finishing it scores it as before', fin.status === 200 && fin.body.checkpoint && typeof fin.body.checkpoint.passed === 'boolean', fin.body.checkpoint);
      check('and adds no end-of-level review of its own', Array.isArray(fin.body.review) && fin.body.review.length === 0, fin.body.review);
    }

    // ── 5. a level left before it closed is reviewed on the recap ─────────
    console.log('\nfeedback timing: finishing mid-level');
    const quitter = newLearner(true);
    const qe = enroll(quitter, PRACTICE);
    r = await call(quitter, 'POST', '/sessions', { enrollment_id: qe.id, ordinary: true });
    const qs = r.body;
    const qItems = qs.items.filter((i) => i.block === 0 && i.role !== 'retention').slice(0, 3);
    await answerAll(quitter, qs, qItems);
    r = await call(quitter, 'POST', `/sessions/${qs.session_id}/finish`, {});
    check('the recap reviews the answers the level close never showed', (r.body.review || []).length === qItems.length, (r.body.review || []).length);

    // ── 6. recent sessions and the levels a session worked ────────────────
    console.log('\nrecent sessions');
    // The lesson sitting above: worked at LESSON, and closing the lesson moved
    // the learner to the next level. Finish it there.
    check('closing the lesson moved the learner on', lessonClose.next_level === LESSON + 1, lessonClose.next_level);
    const lessonRow = db.byId('sessions', ls.session_id);
    check('the stored levels still name both (the player relies on them)',
      JSON.stringify(lessonRow.levels) === JSON.stringify([LESSON, LESSON + 1]) && lessonRow.level === LESSON + 1, lessonRow.levels);
    r = await call(lessonHeld, 'POST', `/sessions/${ls.session_id}/finish`, {});
    check('the recap reports only the level worked', JSON.stringify(r.body.levels) === JSON.stringify([LESSON]), r.body.levels);
    check('the summary does not claim a span', !/across levels/.test(r.body.analysis.summary || ''), r.body.analysis.summary);
    const again = await call(lessonHeld, 'POST', `/sessions/${ls.session_id}/finish`, {});
    check('asking again reports the same levels', JSON.stringify(again.body.levels) === JSON.stringify([LESSON]), again.body.levels);

    // A sitting opened and closed without an answer (a quit, a look at a level).
    const empty = await call(lessonHeld, 'POST', '/sessions', { enrollment_id: le.id, ordinary: true });
    await call(lessonHeld, 'POST', `/sessions/${empty.body.session_id}/finish`, {});
    check('an empty sitting can still be finished', !!db.byId('sessions', empty.body.session_id).ended_at);
    const progress = await call(lessonHeld, 'GET', '/progress');
    const recent = progress.body.recent || [];
    check('the dashboard lists the lesson sitting', recent.some((s) => s.id === ls.session_id), recent.map((s) => s.id));
    check('but not the sitting with no answers', !recent.some((s) => s.id === empty.body.session_id), recent.map((s) => s.id));
    const row = recent.find((s) => s.id === ls.session_id) || {};
    check('the lesson sitting is listed at the level worked', row.level === LESSON && JSON.stringify(row.levels) === JSON.stringify([LESSON]), row);
    check('with the number of questions answered', row.answered === lItems.length, row.answered);

    // A sitting that really did work two levels still says so.
    const two = newLearner();
    const te = enroll(two, LESSON);
    r = await call(two, 'POST', '/sessions', { enrollment_id: te.id, ordinary: true });
    const ts = r.body;
    await answerAll(two, ts, ts.items.filter((i) => i.block === 0 && i.role !== 'retention'));
    r = await call(two, 'POST', `/sessions/${ts.session_id}/block-finish`, { block: 0 });
    const nb = await call(two, 'POST', `/sessions/${ts.session_id}/next-block`, {});
    check('the next level opens', nb.status === 201 && nb.body.level === LESSON + 1, { status: nb.status, level: nb.body && nb.body.level });
    const second = (nb.body.items || []).filter((i) => i.role !== 'retention').slice(0, 2);
    await answerAll(two, ts, second);
    r = await call(two, 'POST', `/sessions/${ts.session_id}/finish`, {});
    check('two levels worked are reported as two', JSON.stringify(r.body.levels) === JSON.stringify([LESSON, LESSON + 1]), r.body.levels);
    const p2 = await call(two, 'GET', '/progress');
    const row2 = (p2.body.recent || []).find((s) => s.id === ts.session_id) || {};
    check('and listed as two on the dashboard', JSON.stringify(row2.levels) === JSON.stringify([LESSON, LESSON + 1]), row2);

    // workDone on its own: one pass, the retention questions left out.
    const done = sessions.workDone([db.byId('sessions', ls.session_id), db.byId('sessions', empty.body.session_id)]);
    check('workDone counts no recall questions', done.get(ls.session_id).answered === lItems.length, done.get(ls.session_id));
    check('workDone finds nothing in an empty sitting', done.get(empty.body.session_id).answered === 0, done.get(empty.body.session_id));
  } finally {
    server.close();
  }

  console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
