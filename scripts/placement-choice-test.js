/**
 * Tests for the owner's placement choices (curriculum-build/PLACEMENT-CHOICE-SPEC.md):
 *
 *   1. the subject placement gives every grade a probability of being the right
 *      start, adding up to 100 and read straight off the walk's belief, and the
 *      recommended grade is the most probable one;
 *   2. the learner may start at any grade;
 *   3. "start at the recommended grade + catch-up": a catch-up quiz across every
 *      grade below it, ordered lowest grade first, that never marks a unit known
 *      without its own evidence, with the whole catch-up taken or declined at once
 *      and the decline remembered;
 *   4. the in-grade placement can be retaken: finished units stay finished,
 *      test-out proofs stay, nothing is counted as a quit, and an accidental
 *      restart of a finished placement is refused.
 *
 *   NODE_PATH=../node_modules node scripts/placement-choice-test.js
 *
 * Runs on its own throwaway data file, on English (subject questions and unit
 * bank in source control) and the math unit bank, so it needs no key and makes
 * no model call: every key is blanked before anything is loaded. The model's
 * knobs are pinned to the spec's starting values, as the gap scan test does.
 */
const os = require('os');
const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'test';
for (const name of Object.keys(process.env)) {
  if (/(_API_KEY|_TOKEN|_SECRET_API|_WORKSPACE)$/.test(name) || /^(OPENROUTER|ANTHROPIC|GEMINI|MIMO|MODELFLARE|DEEPSEEK|MINIMAX)_.*KEY/.test(name)) process.env[name] = '';
}
// The local model is not a key, so blanking keys does not stop it: a test that
// reached the real Ollama on this laptop waited on it and stalled (2026-10-23).
process.env.OLLAMA_ENABLED = '0';
const tmp = path.join(os.tmpdir(), `placement-choice-test-${process.pid}.json`);
process.env.DB_FILE = tmp;
Object.assign(process.env, { HOLE_PRIOR: '0.15', ISLAND_PRIOR: '0.3', SLIP: '0.05', LUCK: '0.15', KNOWN_AT: '0.985', LEARN_AT: '0.35' });

const express = require('express');
const db = require('../config/db');
const curriculum = require('../config/curriculum');
const rules = require('../config/subject-placement');
const adaptive = require('../services/adaptive-placement');
const subjectPlacement = require('../services/subject-placement');
const unitPlacement = require('../services/unit-placement');
const learnerPath = require('../services/learner-path');
const gapScan = require('../services/gap-scan');

// Placing a learner writes their first lesson ahead and their own version of
// it; both can reach a model, so they are stubbed before the routes load. The
// scorecard's quit hook is counted: a retake must never call it.
const lessons = require('../services/lessons');
const levelEditor = require('../services/level-editor');
const scorecardHooks = require('../services/scorecard/hooks');

lessons.prefetch = () => {};
levelEditor.ensure = async () => null;
levelEditor.prefetchNext = () => {};
scorecardHooks.onPlacement = () => {};
let quitsReported = 0;
scorecardHooks.onSessionAbandoned = () => { quitsReported++; };

let failures = 0;
function check(label, ok, detail) {
  if (ok) { console.log(`  ok   ${label}`); return; }
  failures++;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
}

const TRACK = 'english';
const gradeIds = rules.gradesFor(TRACK);
const G = 8; // the recommended grade in the catch-up cases
const MIN = 60000;
const sum = (xs) => xs.reduce((a, b) => a + b, 0);

let seq = 0;
function makeUser(tag) {
  seq++;
  return db.insert('users', { email: `choice-${tag}-${process.pid}-${seq}@example.test`, display_name: `choice ${tag}`, password_hash: 'x' });
}

/** A finished adaptive subject walk with these answers, its recommendation written by the app. */
async function finishedWalk(userId, answered, { mode = 'quick', minutesAgo = 10 } = {}) {
  const now = Date.now();
  db.insert('subject_placements', {
    user_id: userId,
    track_id: TRACK,
    grade_ids: gradeIds,
    mode,
    started_at: new Date(now - minutesAgo * MIN).toISOString(),
    finished_at: new Date(now - (minutesAgo - 9) * MIN).toISOString(),
    deadline_at: null,
    answered,
    scores: [{ grade_id: gradeIds[0], asked: answered.length, correct: answered.filter((a) => a.correct).length, bands: {}, answers: [] }],
  });
  return subjectPlacement.recommend(userId, TRACK);
}

/** Answers that put the frontier in the middle of grade `g`: everything below right, everything past wrong. */
function frontierAt(g, extra = []) {
  const out = [];
  for (let x = 0.25; x < gradeIds.length; x += 0.5) {
    out.push({ pos: x, guess: 0.25, correct: x < g + 0.5 });
  }
  return [...out, ...extra];
}

function wrongOf(item) {
  return item.choices.find((c) => c !== item.answer);
}

// ── 1. probabilities ────────────────────────────────────────────────────────

async function probabilities() {
  console.log('\nevery grade gets a probability of being the right start');
  {
    const post = adaptive.posterior(10, [
      { pos: 2.2, guess: 0.25, correct: true }, { pos: 3.4, guess: 0.25, correct: true },
      { pos: 4.6, guess: 0.25, correct: false }, { pos: 4.1, guess: 0.25, correct: true }, { pos: 5.2, guess: 0.25, correct: false },
    ]);
    const rec = adaptive.recommend(10, post);
    check('the probabilities add up to exactly 100', sum(rec.probabilities) === 100, rec.probabilities);
    check('each is the share of the belief in that grade (within rounding)', rec.probabilities.every((p, i) => Math.abs(p - 100 * rec.mass[i]) < 1), { p: rec.probabilities, mass: rec.mass });
    check('the belief per grade itself adds up to 1', Math.abs(sum(rec.mass) - 1) < 1e-9);
    check('the recommended grade is the most probable one', rec.probabilities[rec.index] === Math.max(...rec.probabilities) && rec.mass[rec.index] === Math.max(...rec.mass));
    check('the older scaled percents still read 100 at the strongest grade', rec.percents[rec.index] === 100);
    check('whole percents keep the total at 100 even when every share rounds down', sum(adaptive.wholePercents([1, 1, 1])) === 100 && sum(adaptive.wholePercents([0.333, 0.333, 0.334, 0])) === 100);
  }

  const user = makeUser('prob');
  const answered = frontierAt(6, [{ pos: 6.9, guess: 0.25, correct: true }, { pos: 6.3, guess: 0.25, correct: false }]);
  const row = await finishedWalk(user.id, answered);
  const result = subjectPlacement.resultFor(TRACK, row);
  const probs = result.probabilities.map((g) => g.probability);
  check('a finished walk stores a probability for every grade', result.probabilities.length === gradeIds.length && probs.every(Number.isInteger), result.probabilities.slice(0, 3));
  check('they add up to 100', sum(probs) === 100, sum(probs));
  const mass = adaptive.gradeMass(gradeIds.length, adaptive.posterior(gradeIds.length, answered));
  check('and match the walk\'s posterior, grade by grade', probs.every((p, i) => Math.abs(p - 100 * mass[i]) < 1), probs);
  const best = result.probabilities.reduce((b, g) => (g.probability > b.probability ? g : b));
  check('the recommended grade has the highest probability, and is flagged', result.recommended_grade_id === best.grade_id
    && result.probabilities.filter((g) => g.recommended).map((g) => g.grade_id).join() === result.recommended_grade_id, { rec: result.recommended_grade_id, best });
  check('the recommendation rows carry the probability beside the old percent', row.recommendation.every((r) => Number.isInteger(r.probability) && Number.isInteger(r.percent)));
  check('the model is named', result.probability_model === 'posterior-v1');

  // A row written before probabilities existed: worked out from its answers.
  const old = { ...row, probabilities: null };
  const again = subjectPlacement.resultFor(TRACK, old);
  check('a row without stored probabilities gets them from its answers', sum(again.probabilities.map((g) => g.probability)) === 100
    && JSON.stringify(again.probabilities.map((g) => g.probability)) === JSON.stringify(probs));
}

// ── over HTTP: choose, catch-up, retake ─────────────────────────────────────

async function overHttp() {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.user = db.byId('users', Number(req.headers['x-test-user'])) || null; next(); });
  app.use('/api/subject-placement', require('../routes/subject-placement'));
  app.use('/api/gap-scan', require('../routes/gap-scan'));
  app.use('/api/placement', require('../routes/placement'));
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (user, method, url, body) => {
    const res = await fetch(base + url, {
      method,
      headers: { 'content-type': 'application/json', 'x-test-user': String(user ? user.id : '') },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  try {
    await choose(call);
    await catchUp(call);
    await retake(call);
  } finally {
    server.close();
  }
}

// ── 2. pick any grade ───────────────────────────────────────────────────────

async function choose(call) {
  console.log('\nthe learner may start at any grade');
  const user = makeUser('choose');
  await finishedWalk(user.id, frontierAt(6));
  let r = await call(user, 'POST', `/subject-placement/${TRACK}/finish`, {});
  check('the result over HTTP carries the probabilities', r.status === 200 && Array.isArray(r.body.probabilities)
    && sum(r.body.probabilities.map((g) => g.probability)) === 100 && r.body.recommended_grade_id, r.body);
  const pick = gradeIds[2];
  check('the pick here is not the recommended grade', pick !== r.body.recommended_grade_id);
  r = await call(user, 'POST', `/subject-placement/${TRACK}/choose`, { grade_id: pick });
  const e = r.body && r.body.enrollment;
  check('choosing any grade enrolls the learner there, waiting for its in-grade placement', r.status === 201 && e && e.grade_id === pick && e.status === 'placement_pending'
    && r.body.next === 'placement' && r.body.recommended === false, r.body);
  r = await call(user, 'POST', `/subject-placement/${TRACK}/choose`, { grade_id: pick });
  check('choosing it again hands back the same enrollment', r.status === 200 && r.body.enrollment.id === e.id && !r.body.created);
  check('the pick is remembered on the walk', subjectPlacement.placementFor(user.id, TRACK).chosen_grade_id === pick);
  r = await call(user, 'GET', `/subject-placement/${TRACK}`);
  check('the quiz state shows the result with the pick', r.body.result && r.body.result.chosen_grade_id === pick && r.body.result.probabilities.length === gradeIds.length);
  r = await call(user, 'POST', `/subject-placement/${TRACK}/choose`, { grade_id: 'no_such_grade' });
  check('a grade outside the subject is refused', r.status === 400);
  r = await call(user, 'POST', `/subject-placement/${TRACK}/choose`, { grade_id: r.body ? gradeIds[G] : gradeIds[G] });
  check('the recommended grade is chosen the same way', r.status === 201 && r.body.enrollment.grade_id === gradeIds[G]);
  r = await call(user, 'GET', '/subject-placement/percent/mine');
  check('the picker\'s summary carries the probabilities too', r.body.placement[TRACK] && sum(r.body.placement[TRACK].probabilities.map((g) => g.probability)) === 100);
}

// ── 3. the catch-up quiz ────────────────────────────────────────────────────

/** Answer a catch-up quiz over HTTP as a learner who knows everything but `gaps` ("gradeId:unit"). */
async function answerQuiz(call, user, r, gaps) {
  const asked = [];
  let guard = 0;
  while (r.status === 200 && !r.body.done && guard++ < 200) {
    const q = r.body.question;
    const item = unitPlacement.itemFor(TRACK, q.grade_id, q.unit, q.slot);
    const knows = !gaps.includes(`${q.grade_id}:${q.unit}`);
    asked.push({ grade_id: q.grade_id, unit: q.unit, knows });
    r = await call(user, 'POST', '/gap-scan/answer', { track_id: TRACK, grade_id: q.grade_id, unit: q.unit, slot: q.slot, answer: knows ? item.answer : wrongOf(item) });
  }
  return { r, asked };
}

async function catchUp(call) {
  console.log('\nthe catch-up quiz: every grade below the recommended one');
  const unitsOf = (gi) => unitPlacement.unitsFor(TRACK, gradeIds[gi]);
  // Planted holes: one in the grade just below, one three grades down, one five down.
  const gaps = [`${gradeIds[G - 1]}:2`, `${gradeIds[G - 3]}:${unitsOf(G - 3).length}`, `${gradeIds[G - 5]}:1`];
  // The walk: a frontier in grade G, with a miss pointing at the hole three grades down.
  const holePos = (G - 3) + (unitsOf(G - 3).length - 0.5) / unitsOf(G - 3).length;
  const user = makeUser('catchup');
  const row = await finishedWalk(user.id, frontierAt(G, [{ pos: holePos, guess: 0.25, correct: false }]), { mode: 'accurate' });
  check('the walk recommends the grade the case is built on', row.recommended_grade_id === gradeIds[G], row.recommended_grade_id);
  let r = await call(user, 'GET', `/gap-scan/state/${TRACK}`);
  check('before it starts, the quiz is on offer with its own clock', r.body.catch_up_quiz && r.body.catch_up_quiz.available && r.body.catch_up_quiz.status === 'not_started'
    && r.body.catch_up_quiz.minutes === 40 && r.body.catch_up_quiz.grades_below === G, r.body.catch_up_quiz);

  r = await call(user, 'POST', `/subject-placement/${TRACK}/choose`, { grade_id: gradeIds[G] });
  const main = r.body.enrollment;
  r = await call(user, 'POST', '/gap-scan/start', { track_id: TRACK, catch_up: true, recommended_grade_id: gradeIds[G] });
  check('it starts as a catch-up quiz, with a question and its own clock', r.status === 200 && r.body.kind === 'catch_up' && r.body.question
    && r.body.question.answer === undefined && r.body.clock.max_questions === Math.floor((40 * 60) / gapScan.SECONDS_PER_QUESTION), r.body);
  const scan0 = subjectPlacement.placementFor(user.id, TRACK).gap_scan;
  const grades = new Set(scan0.candidates.map((c) => c.grade_index));
  check('its candidates span every grade below, not only the one just below', grades.size === G && Math.min(...grades) === 0 && Math.max(...grades) === G - 1, [...grades]);
  const missed = scan0.candidates.find((c) => c.grade_index === G - 3 && c.unit === unitsOf(G - 3).length);
  const plain = scan0.candidates.filter((c) => c.grade_index === 0 && !c.mapped.some((m) => !m.correct));
  check('a unit near a walk miss ranks ahead of units far below that the walk saw answered right', missed && plain.length && plain.every((c) => c.rank > missed.rank), { missed: missed && missed.rank, far: plain.slice(0, 2).map((c) => c.rank) });
  check('the first question goes to the likeliest gap', r.body.question.grade_id === gradeIds[G - 3] && r.body.question.unit === unitsOf(G - 3).length, r.body.question);
  check('the walk prior only orders: nothing starts decided', scan0.candidates.every((c) => !['known', 'learn'].includes(c.status)));

  const resumed = await call(user, 'POST', '/gap-scan/start', { track_id: TRACK, catch_up: true, recommended_grade_id: gradeIds[G] });
  check('starting again resumes the same quiz', resumed.status === 200 && resumed.body.resumed && resumed.body.question.unit === r.body.question.unit);
  const inBudget = await call(user, 'POST', '/gap-scan/start', { track_id: TRACK, mode: 'quick', recommended_grade_id: gradeIds[G] });
  check('the in-placement gap scan does not replace a running catch-up quiz', inBudget.body.kind === 'catch_up' && inBudget.body.resumed);

  const run = await answerQuiz(call, user, r, gaps);
  r = run.r;
  const scan = subjectPlacement.placementFor(user.id, TRACK).gap_scan;
  check('it runs to done within its question cap', r.status === 200 && r.body.done && run.asked.length <= scan.max_questions, { asked: run.asked.length, cap: scan.max_questions });
  check('every planted hole is found', gaps.every((g) => scan.candidates.some((c) => `${c.grade_id}:${c.unit}` === g && c.status === 'learn')),
    scan.candidates.filter((c) => gaps.includes(`${c.grade_id}:${c.unit}`)).map((c) => [c.grade_id, c.unit, c.status]));
  check('no unit is known without its own answers', scan.candidates.every((c) => c.status !== 'known' || (c.answers.length >= 1 && c.answers.every((a) => a.correct))));
  const order = r.body.gaps.map((g) => gradeIds.indexOf(g.grade_id));
  check('the gaps come lowest grade first', order.length === 3 && order.every((x, i) => !i || x > order[i - 1]), order);
  const route = r.body.route;
  check('the reply carries the ordered catch-up plan', route && route.steps.length === 3 && route.steps.map((s) => s.grade_id).join() === r.body.gaps.map((g) => g.grade_id).join()
    && route.next.kind === 'catch_up' && route.next.grade_id === gradeIds[G - 5], route);
  check('with a headline that names every step, then the grade', route && route.headline === `Catch up: 1 unit of ${rules.gradeName(TRACK, gradeIds[G - 5])}, 1 unit of ${rules.gradeName(TRACK, gradeIds[G - 3])}, 1 unit of ${rules.gradeName(TRACK, gradeIds[G - 1])}, then start ${rules.gradeName(TRACK, gradeIds[G])}`, route && route.headline);

  r = await call(user, 'POST', '/gap-scan/decide', { enrollment_id: main.id, all: true, accept: true });
  check('the whole catch-up is taken at once', r.status === 200 && r.body.results.length === 3 && r.body.results.every((x) => x.ok && x.catch_up_enrollment_id), r.body);
  const plan = learnerPath.planFor(db.byId('enrollments', main.id));
  check('the main enrollment holds the catch-up in order, lowest grade first', plan.catch_up.map((e) => gradeIds.indexOf(e.grade_id)).join() === order.join()
    && JSON.stringify(plan.catch_up_order) === JSON.stringify(plan.catch_up.map((e) => e.grade_id)), plan.catch_up_order);
  const after = r.body.route;
  check('and the route now sends the learner to the lowest grade\'s catch-up', after.status === 'accepted' && after.next.kind === 'catch_up'
    && after.next.enrollment_id === r.body.results[0].catch_up_enrollment_id && after.next.grade_id === gradeIds[G - 5]);
  let unscannedKnown = 0;
  let gapsLearn = 0;
  for (const entry of plan.catch_up) {
    const ce = db.byId('enrollments', entry.enrollment_id);
    const cp = learnerPath.planFor(ce);
    for (const [key, u] of Object.entries(cp.units)) {
      const cand = scan.candidates.find((c) => c.grade_id === entry.grade_id && c.key === key);
      if (u.status === 'known' && !(cand && cand.answers.length)) unscannedKnown++;
      if (entry.unit_keys.includes(key) && u.status === 'learn') gapsLearn++;
    }
  }
  check('each catch-up grade has its gap units to learn', gapsLearn === 3, gapsLearn);
  check('a unit the quiz never asked about is unchecked there, never known', unscannedKnown === 0, unscannedKnown);

  // Finishing the lowest step moves the route on to the next grade.
  const first = db.byId('enrollments', plan.catch_up[0].enrollment_id);
  for (const key of plan.catch_up[0].unit_keys) learnerPath.setUnit(first, key, 'done', 'path');
  r = await call(user, 'GET', `/gap-scan/route/${TRACK}`);
  check('once a step\'s gaps are worked, it is done and the route moves on', r.body.route.steps[0].status === 'done' && r.body.route.next.grade_id === gradeIds[G - 3]
    && r.body.route.headline.startsWith('Catch up: 1 unit of') && !r.body.route.headline.includes(rules.gradeName(TRACK, gradeIds[G - 5])), r.body.route);
  r = await call(user, 'GET', `/placement/path/${main.id}`);
  check('the path summary of the main grade carries the same route', r.status === 200 && r.body.catch_up_route && r.body.catch_up_route.steps.length === 3);

  console.log('\ndeclining is remembered');
  const u2 = makeUser('decline');
  await finishedWalk(u2.id, frontierAt(G), { mode: 'quick' });
  r = await call(u2, 'POST', '/gap-scan/catch-up/decline', { track_id: TRACK });
  check('turning the quiz down is remembered on the walk', r.status === 200 && r.body.catch_up_quiz.status === 'declined' && r.body.catch_up_quiz.declined_at);
  r = await call(u2, 'GET', `/gap-scan/state/${TRACK}`);
  check('and the state says so on reload', r.body.catch_up_quiz.status === 'declined');
  // The learner takes the quiz after all, then turns the catch-up down.
  r = await call(u2, 'POST', '/gap-scan/start', { track_id: TRACK, catch_up: true, recommended_grade_id: gradeIds[G] });
  check('the quiz can still be started by hand, on the Quick clock', r.body.kind === 'catch_up' && r.body.clock.max_questions === Math.floor((10 * 60) / gapScan.SECONDS_PER_QUESTION));
  const q2 = await answerQuiz(call, u2, r, [`${gradeIds[G - 1]}:2`, `${gradeIds[G - 4]}:3`]);
  check('Quick keeps to its clock', q2.asked.length <= Math.floor((10 * 60) / gapScan.SECONDS_PER_QUESTION), q2.asked.length);
  r = await call(u2, 'POST', '/gap-scan/decide', { track_id: TRACK, all: true, accept: false });
  const m2 = db.findOne('enrollments', (e) => e.user_id === u2.id && e.grade_id === gradeIds[G]);
  check('declining the whole catch-up, without an enrollment yet, makes the main one', r.status === 200 && m2 && r.body.enrollment_id === m2.id);
  const p2 = learnerPath.planFor(db.byId('enrollments', m2.id));
  check('every offer is declined, and no catch-up enrollment is made', p2.catch_up.length >= 1 && p2.catch_up.every((e) => e.status === 'declined' && !e.enrollment_id)
    && !db.find('enrollments', (e) => e.user_id === u2.id && e.grade_id !== gradeIds[G]).length, p2.catch_up);
  gapScan.attachOffers(u2.id, db.byId('enrollments', m2.id));
  check('and stays declined when the offers are attached again', learnerPath.planFor(db.byId('enrollments', m2.id)).catch_up.every((e) => e.status === 'declined'));
  check('the route then just starts the grade', r.body.route.status === 'declined' && r.body.route.next.kind === 'main' && r.body.route.headline === `Start ${rules.gradeName(TRACK, gradeIds[G])}`, r.body.route);

  console.log('\nunchecked never becomes known without evidence');
  {
    const u3 = makeUser('unchecked');
    await finishedWalk(u3.id, frontierAt(G), { mode: 'quick' });
    const started = gapScan.startCatchUp(u3.id, { trackId: TRACK, gradeId: gradeIds[G] });
    // The clock runs out at once: nothing is asked.
    const out = gapScan.answer(u3.id, TRACK, { ...started.scan.current, answer: 'x' }, Date.now() + 41 * MIN);
    const s3 = out.scan;
    check('a quiz out of time stops', s3.finished_at && s3.asked.length === 1);
    check('every unit it did not settle is unchecked, none known', s3.candidates.filter((c) => !c.answers.length).every((c) => c.status === 'unchecked')
      && !s3.candidates.some((c) => c.status === 'known'), s3.candidates.map((c) => c.status).filter((x, i, a) => a.indexOf(x) === i));
  }
}

// ── 4. retaking the in-grade placement ──────────────────────────────────────

const MATH = 'math';
const MGRADE = 'numbers_to_10';
const mUnits = unitPlacement.unitsFor(MATH, MGRADE);
const mStatus = (e, n) => (learnerPath.planFor(db.byId('enrollments', e.id)).units[mUnits[n - 1].key] || {}).status;

/** Sit the in-grade placement over HTTP, answering right only where `knows(unit)` says. */
async function sit(call, user, e, startBody, knows) {
  let r = await call(user, 'POST', '/placement/start', { enrollment_id: e.id, mode: 'quick', ...startBody });
  if (r.status >= 400) return r;
  let item = r.body.items[0];
  for (let guard = 0; item && guard < 60; guard++) {
    const row = db.byId('items', item.id);
    const answer = knows(row.unit) ? row.answer : row.choices.find((c) => c !== row.answer);
    const a = await call(user, 'POST', '/placement/answer', { session_id: row.session_id, item_id: row.id, answer });
    item = a.body.next_item || null;
  }
  return call(user, 'POST', '/placement/finish', { session_id: r.body.session_id });
}

async function retake(call) {
  console.log('\nretaking the in-grade placement');
  const grade = curriculum.getGrade(MATH, MGRADE);
  const user = makeUser('retake');
  const e = db.insert('enrollments', {
    user_id: user.id, track_id: MATH, grade_id: MGRADE, target_level: grade.pathLength, current_level: 1,
    level_items: 0, levels_completed: 0, xp: 0, status: 'placement_pending', pending_checkpoint: null, placed_at: null,
  });
  let r = await sit(call, user, e, {}, (u) => u <= 6);
  check('the first placement finishes', r.status === 200 && r.body.result && r.body.result.unit >= 1 && !r.body.result.retake, r.body);
  const firstUnit = r.body.result.unit;

  r = await call(user, 'POST', '/placement/start', { enrollment_id: e.id });
  check('starting the placement again without asking for a retake is refused', r.status === 409 && r.body.retake_available === true && /retake/i.test(r.body.error), r.body);
  check('and nothing was started', !db.findOne('sessions', (s) => s.enrollment_id === e.id && s.kind === 'placement' && !s.ended_at));
  r = await call(user, 'GET', `/placement/path/${e.id}`);
  check('the path says the placement can be retaken', r.body.placement && r.body.placement.placed && r.body.placement.retake_available && r.body.placement.retakes === 0, r.body.placement);

  // Work done since: two units worked on the path, and a later one proved by a test-out.
  const doneUnits = [1, 2];
  for (const n of doneUnits) learnerPath.setUnit(db.byId('enrollments', e.id), mUnits[n - 1].key, 'done', 'path');
  const provedUnit = mUnits.length;
  learnerPath.setUnit(db.byId('enrollments', e.id), mUnits[provedUnit - 1].key, 'known', 'test_out');
  // A lesson sitting left open on the path.
  const sitting = db.insert('sessions', { user_id: user.id, enrollment_id: e.id, track_id: MATH, grade_id: MGRADE, level: 5, kind: 'lesson', started_at: new Date().toISOString(), ended_at: null });

  // The retake: this time the learner seems to know less (only units 1-2 and the proved one).
  const knowsLess = (u) => u <= 2 || u === provedUnit;
  let opened = await call(user, 'POST', '/placement/start', { enrollment_id: e.id, retake: true, mode: 'quick' });
  check('a retake starts when asked for', opened.status === 201 && opened.body.retake === true, opened.body);
  r = await call(user, 'POST', '/placement/start', { enrollment_id: e.id });
  check('an open retake is resumed (no retake flag needed)', r.status === 200 && r.body.resumed && r.body.retake && r.body.session_id === opened.body.session_id);
  check('the enrollment stays active while the retake runs', db.byId('enrollments', e.id).status === 'active');
  // Cancel it, then retake for real.
  r = await call(user, 'POST', '/placement/retake/cancel', { enrollment_id: e.id });
  check('an open retake can be cancelled, changing nothing', r.status === 200 && r.body.cancelled && mStatus(e, 1) === 'done');
  r = await call(user, 'POST', '/placement/finish', { session_id: opened.body.session_id });
  check('a cancelled retake cannot be finished', r.status === 409 && r.body.cancelled);
  r = await call(user, 'POST', '/placement/start', { enrollment_id: e.id });
  check('after a cancel the finished placement still needs retake: true', r.status === 409);

  r = await sit(call, user, e, { retake: true }, knowsLess);
  const result = r.body.result;
  check('the retake finishes and says it was one', r.status === 200 && result && result.retake === true, r.body);
  const row = db.byId('enrollments', e.id);
  check('the plan is rebuilt from the new answers', learnerPath.planFor(row).placed_unit === result.unit, { was: firstUnit, now: result.unit });
  check('units already done stay done', doneUnits.every((n) => mStatus(e, n) === 'done'), doneUnits.map((n) => mStatus(e, n)));
  check('the result lists the units kept done', doneUnits.every((n) => (result.kept_done || []).includes(n)), result.kept_done);
  check('a unit proved by a test-out stays known', mStatus(e, provedUnit) === 'known' && learnerPath.planFor(row).units[mUnits[provedUnit - 1].key].source === 'test_out', mStatus(e, provedUnit));
  check('the learner stands where the rebuilt path starts, never in a done unit', row.current_level === learnerPath.firstLevel(row, grade)
    && !doneUnits.some((n) => row.current_level >= mUnits[n - 1].start && row.current_level <= mUnits[n - 1].end), row.current_level);
  check('the open lesson sitting is closed as moved past, not quit', db.byId('sessions', sitting.id).ended_at && db.byId('sessions', sitting.id).closed_by === 'placement_retake' && quitsReported === 0, { quitsReported });
  check('the retake is counted in the enrollment\'s history', row.placement_retakes === 1 && row.placement_history.length === 1 && row.placement_history[0].retake_of, row.placement_history);
  check('and the enrollment is still active', row.status === 'active');

  console.log('\nthe retake rule in the plan itself');
  {
    const e2 = db.insert('enrollments', { user_id: user.id, track_id: MATH, grade_id: MGRADE, target_level: grade.pathLength, current_level: 1, status: 'active' });
    learnerPath.initFromPlacement(e2, { unit: 6 }, [{ unit: 3, slot: 0, correct: false }, { unit: 9, slot: 0, correct: true }]);
    learnerPath.setUnit(db.byId('enrollments', e2.id), mUnits[2].key, 'done', 'path');
    learnerPath.setUnit(db.byId('enrollments', e2.id), mUnits[8].key, 'known', 'test_out');
    learnerPath.setUnit(db.byId('enrollments', e2.id), mUnits[9].key, 'known', 'test_out');
    // The retake places the learner at unit 2, with a miss on unit 3 (worked
    // already) and a miss on unit 10 (proved by a test-out before).
    learnerPath.initFromPlacement(db.byId('enrollments', e2.id), { unit: 2 }, [{ unit: 3, slot: 1, correct: false }, { unit: 10, slot: 1, correct: false }]);
    const p = learnerPath.planFor(db.byId('enrollments', e2.id));
    check('a done unit stays done even when the new answers miss it', p.units[mUnits[2].key].status === 'done');
    check('a test-out proof stays known when the new answers do not touch it', p.units[mUnits[8].key].status === 'known');
    check('but not when the new answers show a hole in it', p.units[mUnits[9].key].status !== 'known', p.units[mUnits[9].key]);
    check('the new placed unit is to learn', p.placed_unit === 2 && p.units[mUnits[1].key].status === 'learn');
    check('the earlier placement\'s answers are replaced, the test-out\'s kept', !p.units[mUnits[8].key].asked.some((a) => a.source === 'placement')
      && p.units[mUnits[2].key].asked.filter((a) => a.source === 'placement').length === 1);
  }
}

async function main() {
  await probabilities();
  await overHttp();
}

main().catch((err) => { failures++; console.log(`  FAIL the test threw — ${err && err.stack}`); }).finally(() => {
  db.flush();
  setTimeout(() => {
    try { fs.unlinkSync(tmp); } catch { /* gone */ }
    console.log(`\n${failures ? `${failures} failure(s)` : 'all placement choice checks passed'}`);
    process.exit(failures ? 1 : 0);
  }, 400);
});
