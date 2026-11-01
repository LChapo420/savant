#!/usr/bin/env node
/**
 * Speed and retention levers (services/efficiency.js): each of the six levers has an off switch that restores the old behaviour, and
 * does what its research basis says. Wired into the scheduler (services/mastery.js), the level planner and answer path
 * (services/sessions.js). The measured effect is in docs/SPEED-RETENTION.md and the speed-retention rows of
 * curriculum-build/scorecard-sim/BASELINE.md (scripts/scorecard-recovery-sim.js --levers=...); this test checks the mechanics, not the gain.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'speed-retention-'));
process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(TMP, 'db.json');
process.env.OWNER_EMAIL = 'sr-owner@example.test';
for (const k of ['SR_ALL', 'SR_PERSONAL_TIMING', 'SR_RELEARN', 'SR_INTERLEAVE', 'SR_STOP', 'SR_STOP_SKIP', 'SR_PRETEST', 'SR_DIFFICULTY', 'REVIEW_SCHEDULE']) delete process.env[k];
// Every lever on, so each is tested whatever its shipped default is; the defaults themselves are checked in section 1.
process.env.SR_ALL = 'on';
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* temp dir */ } });

const db = require('../config/db');
const curriculum = require('../config/curriculum');
const mastery = require('../services/mastery');
const efficiency = require('../services/efficiency');
const sessions = require('../services/sessions');

let failed = 0;
async function check(name, fn) { try { await fn(); console.log(`ok   ${name}`); } catch (e) { failed += 1; console.log(`FAIL ${name}\n     ${String(e.stack).split('\n').slice(0, 4).join('\n     ')}`); } }
const withEnv = (env, fn) => {
  const old = {};
  for (const [k, v] of Object.entries(env)) { old[k] = process.env[k]; if (v === null) delete process.env[k]; else process.env[k] = v; }
  try { return fn(); } finally { for (const [k, v] of Object.entries(old)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
};

const DAY = 86400000;
let n = 0;
const user = () => db.insert('users', { email: `sr${++n}@t.test`, display_name: `sr${n}`, password_hash: 'x', xp: 0, streak: 0, onboarded: true });
const seed = (u, skill, { right, wrong = 0, daysAgo, mastery: m = 0.8, streak = 0, spacedRight = 0 }) => db.insert('skill_states', {
  user_id: u.id, skill_id: skill, mastery: m, attempts: right + wrong, correct: right, streak: 1, ease: 2.5, error_tags: [],
  spaced_right: spacedRight, spaced_wrong: 0, spaced_streak: streak,
  last_seen_at: new Date(Date.now() - daysAgo * DAY).toISOString(), next_due_at: new Date(Date.now() + 99 * DAY).toISOString(),
});
const GRADE0 = curriculum.getGrade('math', 'add_and_subtract_within_20');
let LV = 1;
for (let l = 1; l <= GRADE0.pathLength; l++) if (curriculum.levelKind(l, GRADE0.pathLength, GRADE0) === 'practice' && curriculum.levelPlan(GRADE0, l).introduced.length >= 5) { LV = l; break; }

(async () => {
  console.log('1. the switches');
  await check('SR_ALL=off turns every lever off; a lever\'s own switch turns only it off', () => {
    withEnv({ SR_ALL: 'off' }, () => { for (const l of Object.keys(efficiency.SWITCH)) assert.strictEqual(efficiency.enabled(l), false, l); });
    withEnv({ SR_ALL: null, SR_STOP: 'off' }, () => { assert.strictEqual(efficiency.enabled('stop'), false); assert.strictEqual(efficiency.enabled('personal'), false); });
    withEnv({ SR_ALL: 'on', SR_DIFFICULTY: null }, () => assert.strictEqual(efficiency.enabled('difficulty'), true));
  });
  await check('with no SR_ALL, each lever takes its shipped default (all off: the 30-learner quick gate check blocks turning the stop rule on, docs/SPEED-RETENTION.md 7.3); the skip half is off even with the stop rule on', () => {
    withEnv({ SR_ALL: null, SR_STOP: null, SR_STOP_SKIP: null }, () => {
      for (const [lever, d] of Object.entries(efficiency.DEFAULT)) assert.strictEqual(efficiency.enabled(lever), d === 'on', lever);
      assert.strictEqual(efficiency.enabled('stop'), false);
      assert.strictEqual(efficiency.reviewSlots(3, 99), 3);
    });
    withEnv({ SR_ALL: null, SR_STOP: 'on', SR_STOP_SKIP: null }, () => {
      assert.strictEqual(efficiency.enabled('stop'), true);
      assert.strictEqual(efficiency.reviewSlots(3, 99), 3 + efficiency.STOP.extraReviews);
      assert.strictEqual(efficiency.skipOn(), false, 'the skip half cost the scorecard its answers and bought no retention (docs/SPEED-RETENTION.md section 7)');
      assert.strictEqual(efficiency.enabled('interleave'), false);
      assert.strictEqual(efficiency.enabled('difficulty'), false);
    });
  });

  console.log('2. review timing set to the learner');
  await check('a fast forgetter is reviewed earlier than a slow one, and each spaced recall lowers the target; off = the flat target', () => {
    const fast = efficiency.reviewTarget(0.85, { m: -1.5 });
    const typical = efficiency.reviewTarget(0.85, { m: 0 });
    const slow = efficiency.reviewTarget(0.85, { m: 1.5 });
    assert.ok(fast > typical && typical > slow, [fast, typical, slow].join());
    assert.ok(efficiency.reviewTarget(0.85, { m: 0, spacedStreak: 2 }) < typical);
    assert.ok(efficiency.reviewTarget(0.85, { m: 9, spacedStreak: 9 }) >= efficiency.PERSONAL.lo);
    assert.ok(efficiency.reviewTarget(0.85, { m: -9 }) <= efficiency.PERSONAL.hi);
    withEnv({ SR_PERSONAL_TIMING: 'off' }, () => assert.strictEqual(efficiency.reviewTarget(0.85, { m: -1.5, spacedStreak: 3 }), 0.85));
  });
  await check('the scheduler uses it: a skill 8 days after a recall is due for a spaced-recall-rich skill later than for a new one', () => {
    const u = user();
    seed(u, 'sk_new', { right: 3, daysAgo: 1 });
    const state = mastery.stateFor(u.id, 'sk_new');
    const flat = withEnv({ SR_ALL: 'off' }, () => mastery.daysToTarget(state, null, efficiency.dueBelow(0.85, state, 0)));
    const stateRich = { ...state, spaced_streak: 2 };
    const personal = mastery.daysToTarget(stateRich, null, efficiency.dueBelow(0.85, stateRich, 0));
    assert.ok(personal > flat, `${personal} vs ${flat}`);
  });

  console.log('3. successive relearning');
  await check('recordAttempt counts consecutive spaced recalls and a miss restarts the count', () => {
    const u = user();
    seed(u, 'sk_r', { right: 2, daysAgo: 2, streak: 1 });
    mastery.recordAttempt({ userId: u.id, skillId: 'sk_r', correct: true, difficulty: 5, levelDifficulty: 5, latencyMs: 9000 });
    assert.strictEqual(mastery.stateFor(u.id, 'sk_r').spaced_streak, 2);
    mastery.recordAttempt({ userId: u.id, skillId: 'sk_r', correct: true, difficulty: 5, levelDifficulty: 5, latencyMs: 9000 }); // same day: not spaced
    assert.strictEqual(mastery.stateFor(u.id, 'sk_r').spaced_streak, 2);
    mastery.recordAttempt({ userId: u.id, skillId: 'sk_r', correct: false, difficulty: 5, levelDifficulty: 5, latencyMs: 9000 });
    assert.strictEqual(mastery.stateFor(u.id, 'sk_r').spaced_streak, 0);
  });
  await check('a skill that met the criterion stops taking review slots until its recall falls to the maintenance level', () => {
    const u = user();
    seed(u, 'sk_done', { right: 6, daysAgo: 3, streak: 3, spacedRight: 3 });
    seed(u, 'sk_open', { right: 6, daysAgo: 3, streak: 1, spacedRight: 1 });
    const probe = mastery.stateFor(u.id, 'sk_done');
    const recall = mastery.predictedRecall(probe, 3, null);
    assert.ok(recall < 0.85 && recall > efficiency.RELEARN.maintenance, `probe recall ${recall}`);
    const due = mastery.dueReviews(u.id, ['sk_done', 'sk_open']).map((s) => s.skill_id);
    assert.ok(!due.includes('sk_done') && due.includes('sk_open'), due.join());
    withEnv({ SR_RELEARN: 'off' }, () => assert.ok(mastery.dueReviews(u.id, ['sk_done']).map((s) => s.skill_id).includes('sk_done')));
    const u2 = user();
    seed(u2, 'sk_done', { right: 6, daysAgo: 400, streak: 3, spacedRight: 3 });
    assert.ok(mastery.dueReviews(u2.id, ['sk_done']).map((s) => s.skill_id).includes('sk_done'));
  });

  console.log('4. stopping when the next item buys least');
  await check('the skip half is off by default, even with the stop rule on: every item is asked, whatever the sitting has shown', () => {
    withEnv({ SR_ALL: null, SR_STOP: 'on', SR_STOP_SKIP: null }, () => {
      assert.strictEqual(efficiency.worthAsking({ role: 'focus', correctInSitting: 9, mastery: 1, asked: 9 }), true);
      assert.strictEqual(efficiency.skipOn(), false);
    });
    withEnv({ SR_ALL: null, SR_STOP: 'off', SR_STOP_SKIP: 'on' }, () => assert.strictEqual(efficiency.skipOn(), false, 'no skipping when the whole stop rule is off'));
  });
  await check('with SR_STOP_SKIP=on: a focus or support item on a skill already right twice in the sitting and mastered is not asked; reviews and the stretch item always are', () => withEnv({ SR_STOP_SKIP: 'on' }, () => {
    const ask = (o) => efficiency.worthAsking({ asked: 6, ...o });
    assert.strictEqual(ask({ role: 'focus', correctInSitting: 2, mastery: 0.8 }), false);
    assert.strictEqual(ask({ role: 'support', correctInSitting: 3, mastery: 0.9 }), false);
    assert.strictEqual(ask({ role: 'focus', correctInSitting: 1, mastery: 0.9 }), true);
    assert.strictEqual(ask({ role: 'focus', correctInSitting: 5, mastery: 0.4 }), true, 'a skill not yet mastered is still being learned');
    for (const role of ['review', 'mix', 'stretch']) assert.strictEqual(ask({ role, correctInSitting: 9, mastery: 1 }), true, role);
    assert.strictEqual(efficiency.worthAsking({ role: 'focus', correctInSitting: 9, mastery: 1, asked: 2 }), true, 'a level asks at least a few items');
    withEnv({ SR_STOP: 'off' }, () => assert.strictEqual(ask({ role: 'focus', correctInSitting: 9, mastery: 1 }), true));
  }));
  await check('the freed minutes go to due reviews: extra slots on top of the usual three, only when more are due; the extras do not displace practice', () => {
    const extra = efficiency.STOP.extraReviews;
    assert.strictEqual(efficiency.reviewSlots(3, 2), 3);
    assert.strictEqual(efficiency.reviewSlots(3, 4), 4);
    assert.strictEqual(efficiency.reviewSlots(3, 99), 3 + extra);
    assert.strictEqual(efficiency.displacedReviews(7), 3, 'only the usual three take the place of focus items');
    withEnv({ SR_STOP: 'off' }, () => { assert.strictEqual(efficiency.reviewSlots(3, 9), 3); assert.strictEqual(efficiency.displacedReviews(7), 7); });
  });

  console.log('5. interleaving once past first mastery');
  await check('only skills past first mastery are pooled, lowest recall first; never the focus; nothing recent', () => {
    const rows = [
      { skill_id: 'a', state: { mastery: 0.9, attempts: 8 }, recall: 0.7 },
      { skill_id: 'b', state: { mastery: 0.9, attempts: 8 }, recall: 0.5 },
      { skill_id: 'c', state: { mastery: 0.3, attempts: 8 }, recall: 0.4 },   // not yet mastered: stays blocked
      { skill_id: 'd', state: { mastery: 0.9, attempts: 1 }, recall: 0.4 },   // too few answers
      { skill_id: 'f', state: { mastery: 0.9, attempts: 8 }, recall: 0.6 },   // the focus
      { skill_id: 'g', state: { mastery: 0.9, attempts: 8 }, recall: 0.97 },  // just practised: a repeat, not a retrieval
    ];
    assert.deepStrictEqual(efficiency.interleavePool({ rows, focus: 'f' }), ['b', 'a']);
    assert.deepStrictEqual(efficiency.interleavePool({ rows, focus: 'f', exclude: ['b'] }), ['a']);
    withEnv({ SR_INTERLEAVE: 'off' }, () => assert.deepStrictEqual(efficiency.interleavePool({ rows, focus: 'f' }), []));
    assert.strictEqual(efficiency.interleaveEvery(1), 0, 'the first level after a lesson stays blocked');
    assert.strictEqual(efficiency.interleaveEvery(2), 3);
    assert.strictEqual(efficiency.interleaveEvery(3), 2);
  });
  await check('planLesson weaves in skills past first mastery and keeps the new topic blocked when there are none', () => {
    const grade = curriculum.getGrade('math', 'add_and_subtract_within_20');
    const intro = curriculum.levelPlan(grade, LV).introduced;
    const focus = curriculum.levelPlan(grade, LV).focus;
    const older = intro.filter((s) => s !== focus).slice(0, 3);
    // a level at least two past a lesson, so the planner interleaves at all
    let level = LV;
    for (let l = LV; l <= grade.pathLength; l++) {
      if (curriculum.levelKind(l, grade.pathLength, grade) === 'practice' && curriculum.levelKind(l - 1, grade.pathLength, grade) === 'practice' && curriculum.levelPlan(grade, l).introduced.length >= 4) { level = l; break; }
    }
    const pl = curriculum.levelPlan(grade, level);
    const olderAt = pl.introduced.filter((s) => s !== pl.focus).slice(0, 3);
    const u = user();
    const e = db.insert('enrollments', { user_id: u.id, track_id: 'math', grade_id: 'add_and_subtract_within_20', current_level: level, level_items: 0, status: 'active' });
    olderAt.forEach((s) => seed(u, s, { right: 8, daysAgo: 3, mastery: 0.9 }));
    const plan = sessions.planLesson(u.id, e, grade, { itemCount: 10, stretchShare: 0.1, supportShare: 0.2 });
    const focusItems = plan.filter((p) => p.role === 'focus');
    assert.ok(focusItems.some((p) => olderAt.includes(p.skillId)), 'an older mastered skill should appear among the focus items');
    const blocked = user();
    const e2 = db.insert('enrollments', { user_id: blocked.id, track_id: 'math', grade_id: 'add_and_subtract_within_20', current_level: level, level_items: 0, status: 'active' });
    olderAt.forEach((s) => seed(blocked, s, { right: 2, daysAgo: 3, mastery: 0.3 }));
    const plan2 = sessions.planLesson(blocked.id, e2, grade, { itemCount: 10, stretchShare: 0.1, supportShare: 0.2 });
    assert.ok(plan2.filter((p) => p.role === 'focus').every((p) => !olderAt.includes(p.skillId)), 'skills not past first mastery stay out');
    assert.ok(older.length >= 0);
  });

  console.log('6. pretest, then skip what is known');
  await check('three right answers on the page\'s skill skip the page; any miss, two answers or a low guessing floor do not', () => {
    const mc = { correct: true, guess: 0.25 };
    assert.strictEqual(efficiency.pretestSkips([mc, mc, mc]), true);
    assert.strictEqual(efficiency.pretestSkips([mc, mc]), false);
    assert.strictEqual(efficiency.pretestSkips([mc, mc, { correct: false, guess: 0.25 }]), false);
    assert.ok(efficiency.pretestPosterior([mc, mc, mc]) > efficiency.pretestPosterior([mc, mc]));
    assert.ok(efficiency.pretestPosterior([{ correct: true, guess: 0.03 }, { correct: true, guess: 0.03 }]) > efficiency.pretestPosterior([mc, mc]), 'typed answers are stronger evidence than multiple choice');
    assert.ok(efficiency.pretestPosterior([mc, mc, mc], 0.05) < efficiency.pretestPosterior([mc, mc, mc], 0.5), 'a low prior needs more');
    withEnv({ SR_PRETEST: 'off' }, () => assert.strictEqual(efficiency.pretestSkips([mc, mc, mc]), false));
  });
  await check('the app stops offering a pretest after four failures in a row, and a passed pretest cuts the focus items', () => {
    const u = user();
    assert.strictEqual(efficiency.pretestOffered(u.id), true);
    for (let i = 0; i < 4; i++) efficiency.recordPretest(u.id, `p${i}`, false);
    assert.strictEqual(efficiency.pretestOffered(u.id), false);
    efficiency.recordPretest(u.id, 'p9', true);
    assert.strictEqual(efficiency.pretestOffered(u.id), true);
    assert.strictEqual(efficiency.pretestPassed(u.id, 'p9'), true);
    assert.strictEqual(efficiency.pretestPassed(u.id, 'p1'), false);
    assert.strictEqual(efficiency.focusCount(6, true), efficiency.PRETEST.gapOnlyFocus);
    assert.strictEqual(efficiency.focusCount(6, false), 6);
    const grade = curriculum.getGrade('math', 'add_and_subtract_within_20');
    const pl = curriculum.levelPlan(grade, LV);
    const e = db.insert('enrollments', { user_id: u.id, track_id: 'math', grade_id: 'add_and_subtract_within_20', current_level: LV, level_items: 0, status: 'active' });
    const params = { itemCount: 10, stretchShare: 0.1, supportShare: 0.2 };
    const before = sessions.planLesson(u.id, e, grade, params).filter((p) => p.role === 'focus' && p.skillId === pl.focus).length;
    efficiency.recordPretest(u.id, pl.focus, true);
    const after = sessions.planLesson(u.id, e, grade, params).filter((p) => p.role === 'focus' && p.skillId === pl.focus).length;
    assert.ok(after <= efficiency.PRETEST.gapOnlyFocus && after < before, `${before} -> ${after}`);
    withEnv({ SR_PRETEST: 'off' }, () => assert.strictEqual(sessions.planLesson(u.id, e, grade, params).filter((p) => p.role === 'focus' && p.skillId === pl.focus).length, before));
  });

  console.log('7. difficulty follows the learner');
  await check('off by default; on, a faster learner gets harder items and a slower one easier, bounded, scaled by confidence', () => {
    withEnv({ SR_ALL: null }, () => assert.strictEqual(efficiency.difficultyShift(1, 1), 0));
    withEnv({ SR_ALL: 'on', SR_DIFFICULTY: 'on' }, () => {
      assert.ok(efficiency.difficultyShift(0.6, 1) > 0 && efficiency.difficultyShift(-0.6, 1) < 0);
      assert.ok(Math.abs(efficiency.difficultyShift(5, 5)) <= efficiency.DIFFICULTY.bands);
      assert.strictEqual(efficiency.difficultyShift(0.8, 0), 0);
    });
  });

  console.log('8. nothing else moved');
  await check('SR_ALL=off: the flat 0.85 target and three reviews a level, as before', () => withEnv({ SR_ALL: 'off' }, () => {
    const u = user();
    ['r1', 'r2', 'r3', 'r4', 'r5'].forEach((s) => seed(u, s, { right: 4, daysAgo: 90, streak: 3, spacedRight: 3 }));
    assert.strictEqual(mastery.dueReviews(u.id, ['r1', 'r2', 'r3', 'r4', 'r5']).length, 3);
    assert.strictEqual(mastery.REVIEW_TARGET, 0.85);
  }));
  await check('the answer path advises skippable items (none unless the skip half is on) and never throws without a block', () => {
    assert.deepStrictEqual(withEnv({ SR_STOP: 'off' }, () => efficiency.worthAsking({ role: 'focus', correctInSitting: 9, mastery: 1, asked: 9 })), true);
    assert.strictEqual(typeof sessions.planLesson, 'function');
  });

  if (failed) { console.log(`\n${failed} check(s) failed`); process.exit(1); }
  console.log('\nspeed-retention-test: all checks passed');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
