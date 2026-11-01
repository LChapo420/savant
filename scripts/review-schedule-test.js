#!/usr/bin/env node
/**
 * Review timing (services/mastery.js): a skill is due when the app's own forgetting model predicts recall below 0.85,
 * lowest predicted recall first, at most three a level; learners with no fitted curve read the default curve; the old
 * SM-2 ladder stays behind REVIEW_SCHEDULE=fixed. The level-up rule and planLesson (services/sessions.js), which also read
 * mastery.js, keep working. Measured gain: curriculum-build/SCORECARD-RESEARCH-2026-10-22.md 7.5 and the step-38 rows of
 * curriculum-build/scorecard-sim/BASELINE.md (scripts/scorecard-recovery-sim.js, whose default is this code).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'review-schedule-'));
process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(TMP, 'db.json');
process.env.OWNER_EMAIL = 'review-owner@example.test';
delete process.env.REVIEW_SCHEDULE;
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* temp dir */ } });

const db = require('../config/db');
const curriculum = require('../config/curriculum');
const mastery = require('../services/mastery');
const scorecard = require('../services/scorecard');
const sessions = require('../services/sessions');

let failed = 0;
async function check(name, fn) { try { await fn(); console.log(`ok   ${name}`); } catch (e) { failed += 1; console.log(`FAIL ${name}\n     ${String(e.stack).split('\n').slice(0, 4).join('\n     ')}`); } }

const DAY = 86400000;
let n = 0;
const user = () => db.insert('users', { email: `rev${++n}@t.test`, display_name: `rev${n}`, password_hash: 'x', xp: 0, streak: 0, onboarded: true });
const seed = (u, skill, { right, wrong = 0, daysAgo, mastery: m = 0.6 }) => db.insert('skill_states', {
  user_id: u.id, skill_id: skill, mastery: m, attempts: right + wrong, correct: right, streak: 1, ease: 2.5, error_tags: [],
  last_seen_at: new Date(Date.now() - daysAgo * DAY).toISOString(), next_due_at: new Date(Date.now() + 99 * DAY).toISOString(),
});
// A practice level with several earlier skills to review.
const GRADE0 = curriculum.getGrade('math', 'add_and_subtract_within_20');
let LV = 1;
for (let l = 1; l <= GRADE0.pathLength; l++) if (curriculum.levelKind(l, GRADE0.pathLength, GRADE0) === 'practice' && curriculum.levelPlan(GRADE0, l).introduced.length >= 5) { LV = l; break; }
const SKILLS = ['sk_a', 'sk_b', 'sk_c', 'sk_d', 'sk_e', 'sk_f'];

(async () => {
  console.log('1. the rule');
  await check('the target is 0.85 and at most three reviews a level', () => {
    assert.strictEqual(mastery.REVIEW_TARGET, 0.85);
    assert.strictEqual(mastery.REVIEW_MAX, 3);
    assert.strictEqual(mastery.scheduleMode(), 'model');
  });
  await check('a skill practised an hour ago is not due; one long untouched is; one never attempted is never listed', () => {
    const u = user();
    seed(u, 'sk_a', { right: 5, daysAgo: 1 / 24 });
    seed(u, 'sk_c', { right: 5, daysAgo: 30 });
    const due = mastery.dueReviews(u.id, ['sk_a', 'sk_c', 'sk_never']).map((s) => s.skill_id);
    assert.deepStrictEqual(due, ['sk_c']);
  });
  await check('the boundary is the model\'s: just before the predicted 0.85 crossing is not due, just after is', () => {
    const u = user();
    const s = { correct: 5, attempts: 5 };
    const cross = mastery.daysToTarget(s, null);
    assert.ok(cross > 0.1 && cross < 365, cross);
    seed(u, 'sk_a', { right: 5, daysAgo: cross * 0.9 });
    seed(u, 'sk_b', { right: 5, daysAgo: cross * 1.1 });
    assert.deepStrictEqual(mastery.dueReviews(u.id, ['sk_a', 'sk_b']).map((x) => x.skill_id), ['sk_b']);
    assert.ok(Math.abs(mastery.predictedRecall(s, cross, null) - 0.85) < 0.01);
  });
  await check('lowest predicted recall first, each with its recall, and a miss-heavy skill goes ahead of a solid one gone as long', () => {
    const u = user();
    seed(u, 'sk_a', { right: 6, daysAgo: 20, mastery: 0.8 });
    seed(u, 'sk_b', { right: 1, wrong: 4, daysAgo: 20, mastery: 0.2 });
    seed(u, 'sk_c', { right: 6, daysAgo: 60, mastery: 0.8 });
    const due = mastery.dueReviews(u.id, ['sk_a', 'sk_b', 'sk_c']);
    assert.strictEqual(due.length, 3);
    assert.ok(due.every((s, i) => i === 0 || s.recall >= due[i - 1].recall), due.map((s) => s.recall));
    assert.ok(due.every((s) => s.recall < 0.85 && s.skill_id && typeof s.mastery === 'number'));
  });
  await check('at most three, whatever the caller asks for or the number due', () => {
    const u = user();
    SKILLS.forEach((s) => seed(u, s, { right: 3, daysAgo: 25 }));
    assert.strictEqual(mastery.dueReviews(u.id, SKILLS).length, 3);
    assert.strictEqual(mastery.dueReviews(u.id, SKILLS, 2).length, 2);
  });
  await check('the returned states are copies: reading the schedule never changes a stored skill', () => {
    const u = user();
    const row = seed(u, 'sk_a', { right: 3, daysAgo: 25 });
    mastery.dueReviews(u.id, ['sk_a']);
    assert.strictEqual(db.byId('skill_states', row.id).recall, undefined);
  });

  console.log('2. the curve');
  await check('a learner with no fitted curve is read on the default curve', () => {
    const u = user();
    assert.strictEqual(scorecard.forgettingCurve({ userId: u.id }).fitted, false);
    seed(u, 'sk_a', { right: 4, wrong: 1, daysAgo: 6 });
    const due = mastery.dueReviews(u.id, ['sk_a']);
    const want = mastery.predictedRecall({ correct: 4, attempts: 5 }, 6, null);
    assert.strictEqual(due.length ? Math.round(due[0].recall * 1000) : -1, want < 0.85 ? Math.round(want * 1000) : -1);
  });
  await check('a learner whose own fitted curve says they keep things is reviewed later, one who forgets fast sooner', () => {
    const real = scorecard.forgettingCurve;
    try {
      const u = user();
      seed(u, 'sk_a', { right: 5, daysAgo: mastery.daysToTarget({ correct: 5, attempts: 5 }, null) * 1.3 });
      assert.strictEqual(mastery.dueReviews(u.id, ['sk_a']).length, 1);
      scorecard.forgettingCurve = () => ({ ...real({ userId: u.id }), m: 2.5, fitted: true });
      assert.strictEqual(mastery.dueReviews(u.id, ['sk_a']).length, 0, 'a long half-life: not due');
      const v = user();
      seed(v, 'sk_a', { right: 5, daysAgo: mastery.daysToTarget({ correct: 5, attempts: 5 }, null) * 0.7 });
      assert.strictEqual(mastery.dueReviews(v.id, ['sk_a']).length, 0);
      scorecard.forgettingCurve = () => ({ ...real({ userId: v.id }), m: -2.5, fitted: true });
      assert.strictEqual(mastery.dueReviews(v.id, ['sk_a']).length, 1, 'a short half-life: due');
    } finally { scorecard.forgettingCurve = real; }
  });
  await check('a scorecard failure falls back to the default curve (a review is never lost to an error)', () => {
    const real = scorecard.forgettingCurve;
    try {
      scorecard.forgettingCurve = () => { throw new Error('boom'); };
      const u = user();
      seed(u, 'sk_a', { right: 3, daysAgo: 40 });
      assert.strictEqual(mastery.dueReviews(u.id, ['sk_a']).length, 1);
    } finally { scorecard.forgettingCurve = real; }
  });

  console.log('3. what is recorded');
  await check('an answer a day or more after the last one, given alone, is counted as a memory test (spaced); a coached or same-day one is not', () => {
    const u = user();
    seed(u, 'sk_a', { right: 3, daysAgo: 3 });
    seed(u, 'sk_b', { right: 3, daysAgo: 3 });
    seed(u, 'sk_c', { right: 3, daysAgo: 0.1 });
    mastery.recordAttempt({ userId: u.id, skillId: 'sk_a', correct: true, difficulty: 5, levelDifficulty: 5 });
    mastery.recordAttempt({ userId: u.id, skillId: 'sk_b', correct: true, difficulty: 5, levelDifficulty: 5, hintUsed: true });
    mastery.recordAttempt({ userId: u.id, skillId: 'sk_c', correct: false, difficulty: 5, levelDifficulty: 5 });
    assert.deepStrictEqual([mastery.stateFor(u.id, 'sk_a').spaced_right, mastery.stateFor(u.id, 'sk_b').spaced_right, mastery.stateFor(u.id, 'sk_c').spaced_wrong], [1, 0, 0]);
    const missLate = user();
    seed(missLate, 'sk_a', { right: 3, daysAgo: 4 });
    mastery.recordAttempt({ userId: missLate.id, skillId: 'sk_a', correct: false, difficulty: 5, levelDifficulty: 5 });
    assert.strictEqual(mastery.stateFor(missLate.id, 'sk_a').spaced_wrong, 1);
  });
  await check('next_due_at is the date the model predicts recall to reach 0.85 (what reminders and the profile list use)', () => {
    const u = user();
    const st = mastery.recordAttempt({ userId: u.id, skillId: 'sk_a', correct: true, difficulty: 5, levelDifficulty: 5 });
    const days = (Date.parse(st.next_due_at) - Date.now()) / DAY;
    assert.ok(Math.abs(days - mastery.daysToTarget(st, null)) < 0.05, days);
    const miss = mastery.recordAttempt({ userId: u.id, skillId: 'sk_b', correct: false, difficulty: 5, levelDifficulty: 5 });
    assert.ok((Date.parse(miss.next_due_at) - Date.now()) / DAY < days, 'a miss comes back sooner than a right answer');
  });
  await check('recall only falls with time, and more right answers keep it longer', () => {
    const s = { correct: 4, attempts: 5 };
    const r = [0.5, 1, 3, 10, 40].map((d) => mastery.predictedRecall(s, d, null));
    assert.ok(r.every((x, i) => i === 0 || x <= r[i - 1] + 1e-9), r);
    assert.ok(mastery.daysToTarget({ correct: 12, attempts: 12 }, null) > mastery.daysToTarget({ correct: 2, attempts: 2 }, null));
    assert.ok(mastery.daysToTarget({ correct: 3, attempts: 8 }, null) < mastery.daysToTarget({ correct: 8, attempts: 8 }, null));
  });

  console.log('4. rollback: REVIEW_SCHEDULE=fixed');
  await check('the old ladder is back: a miss in half a day, a streak out to days, due by next_due_at, weakest first', () => {
    process.env.REVIEW_SCHEDULE = 'fixed';
    try {
      assert.strictEqual(mastery.scheduleMode(), 'fixed');
      const u = user();
      const miss = mastery.recordAttempt({ userId: u.id, skillId: 'sk_a', correct: false, difficulty: 5, levelDifficulty: 5 });
      assert.ok(Math.abs((Date.parse(miss.next_due_at) - Date.now()) / DAY - 0.5) < 0.01);
      for (let i = 0; i < 4; i++) mastery.recordAttempt({ userId: u.id, skillId: 'sk_b', correct: true, difficulty: 5, levelDifficulty: 5 });
      const solid = mastery.stateFor(u.id, 'sk_b');
      assert.ok((Date.parse(solid.next_due_at) - Date.now()) / DAY > 5);
      const v = user();
      db.insert('skill_states', { user_id: v.id, skill_id: 'sk_a', mastery: 0.7, attempts: 4, correct: 4, streak: 2, ease: 2.5, error_tags: [], last_seen_at: new Date(Date.now() - 9 * DAY).toISOString(), next_due_at: new Date(Date.now() - DAY).toISOString() });
      db.insert('skill_states', { user_id: v.id, skill_id: 'sk_b', mastery: 0.3, attempts: 4, correct: 2, streak: 0, ease: 2, error_tags: [], last_seen_at: new Date(Date.now() - 9 * DAY).toISOString(), next_due_at: new Date(Date.now() - 2 * DAY).toISOString() });
      db.insert('skill_states', { user_id: v.id, skill_id: 'sk_c', mastery: 0.5, attempts: 4, correct: 4, streak: 2, ease: 2.5, error_tags: [], last_seen_at: new Date(Date.now() - 1 * DAY).toISOString(), next_due_at: new Date(Date.now() + 5 * DAY).toISOString() });
      assert.deepStrictEqual(mastery.dueReviews(v.id, ['sk_a', 'sk_b', 'sk_c']).map((s) => s.skill_id), ['sk_b', 'sk_a']);
    } finally { delete process.env.REVIEW_SCHEDULE; }
  });

  console.log('5. the callers');
  // A grade with an objective model is reviewed by adaptation.reviewQueue first (CURVE_REVIEWS, already on the forgetting curve); mastery.js is the scheduler
  // for every other grade and the fallback, which is what these checks pin.
  await check('planLesson (sessions.js) fills its review slots from the model: up to three, tagged review, on skills of the level', () => {
    process.env.CURVE_REVIEWS = 'off';
    try {
    const grade = curriculum.getGrade('math', 'add_and_subtract_within_20');
    const u = user();
    const e = db.insert('enrollments', { user_id: u.id, track_id: 'math', grade_id: 'add_and_subtract_within_20', current_level: LV, level_items: 0, status: 'active' });
    const intro = curriculum.levelPlan(grade, LV).introduced;
    const old = intro.filter((s) => s !== curriculum.levelPlan(grade, LV).focus).slice(0, 5);
    old.forEach((s) => seed(u, s, { right: 3, daysAgo: 30 }));
    const plan = sessions.planLesson(u.id, e, grade, { itemCount: 10, stretchShare: 0.1, supportShare: 0.2 });
    const reviews = plan.filter((p) => p.role === 'review');
    assert.ok(reviews.length >= 1 && reviews.length <= 3, reviews.length);
    assert.ok(reviews.every((r) => old.includes(r.skillId)));
    const fresh = user();
    const e2 = db.insert('enrollments', { user_id: fresh.id, track_id: 'math', grade_id: 'add_and_subtract_within_20', current_level: LV, level_items: 0, status: 'active' });
    old.forEach((s) => seed(fresh, s, { right: 3, daysAgo: 0.05 }));
    assert.strictEqual(sessions.planLesson(fresh.id, e2, grade, { itemCount: 10, stretchShare: 0.1, supportShare: 0.2 }).filter((p) => p.role === 'review').length, 0);
    } finally { delete process.env.CURVE_REVIEWS; }
  });
  await check('level-up (mastery.levelProgress) is untouched: still mastery, the weakest skill and the item count', () => {
    const grade = curriculum.getGrade('math', 'add_and_subtract_within_20');
    const u = user();
    const e = db.insert('enrollments', { user_id: u.id, track_id: 'math', grade_id: 'add_and_subtract_within_20', current_level: LV, level_items: 12, status: 'active' });
    const intro = curriculum.levelPlan(grade, LV).introduced;
    intro.forEach((s) => seed(u, s, { right: 9, daysAgo: 40, mastery: 0.9 }));
    const p = mastery.levelProgress(u.id, db.byId('enrollments', e.id), grade);
    assert.strictEqual(p.ready, true, JSON.stringify(p.blockers));
    assert.deepStrictEqual(p.required, { averageMastery: 0.8, weakestMastery: 0.6, minItems: 12 });
  });

  if (failed) { console.log(`\n${failed} check(s) failed`); process.exit(1); }
  console.log('\nreview-schedule-test: all checks passed');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
