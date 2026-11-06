#!/usr/bin/env node
/**
 * The speed levers (services/speed-levers.js, docs/SPEED-4X.md): every switch off is today's behaviour; each on does what it says; a learner is told whenever material is passed
 * over, and the page stays reachable. Mechanics only: the measured effect is the simulation's (scripts/speed-4x-report.js).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'speed-levers-'));
process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(TMP, 'db.json');
process.env.OWNER_EMAIL = 'speed-owner@example.test';
for (const k of ['SPEED_ALL', 'SPEED_TESTOUT', 'SPEED_SHORT_LESSON', 'SPEED_MASTERY_STOP', 'SPEED_REVIEW_TARGET', 'SPEED_REVIEW_MODE', 'SR_ALL', 'SR_GOAL_REVIEW', 'SR_GOAL_BACKWARD']) delete process.env[k];
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* temp dir */ } });

const db = require('../config/db');
const curriculum = require('../config/curriculum');
const mastery = require('../services/mastery');
const sessions = require('../services/sessions');
const goal = require('../services/retention-goal');
const speed = require('../services/speed-levers');

let failed = 0;
async function check(name, fn) { try { await fn(); console.log(`ok   ${name}`); } catch (e) { failed += 1; console.log(`FAIL ${name}\n     ${String(e.stack || e).slice(0, 600)}`); } }
async function withEnv(env, fn) {
  const old = {};
  for (const [k, v] of Object.entries(env)) { old[k] = process.env[k]; process.env[k] = v; }
  try { return await fn(); } finally { for (const [k, v] of Object.entries(old)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
}
const ALL = { SPEED_TESTOUT: 'on', SPEED_SHORT_LESSON: 'on', SPEED_MASTERY_STOP: 'on', SPEED_REVIEW_TARGET: 'on' };
let n = 0;
const user = () => db.insert('users', { email: `sp${++n}@t.test`, display_name: `sp${n}`, password_hash: 'x', xp: 0, streak: 0, onboarded: true, birth_year: 1990 });
const LESSON = {
  id: 0, title: 'Adding fractions', intro: 'i', summary: 's',
  sections: [{ heading: 'Common denominators', body: 'Rewrite fractions over a common denominator before adding.' }, { heading: 'Mixed numbers', body: 'Split the whole numbers from the parts.' }, { heading: 'Simplify', body: 'Divide top and bottom by their greatest common factor.' }],
  worked_example: { problem: '1/2 + 1/3', steps: ['6 is common'], answer: '5/6' }, common_mistakes: ['Adding the denominators'],
};

(async () => {
  await check('every lever is off by default and with SPEED_ALL=off', async () => {
    for (const lever of Object.keys(speed.SWITCH)) assert.strictEqual(speed.enabled(lever), false, lever);
    await withEnv({ ...ALL, SPEED_ALL: 'off' }, () => { for (const lever of Object.keys(speed.SWITCH)) assert.strictEqual(speed.enabled(lever), false, lever); });
    await withEnv(ALL, () => { for (const lever of Object.keys(speed.SWITCH)) assert.strictEqual(speed.enabled(lever), true, lever); });
    assert.deepStrictEqual(speed.clientFlags(1, {}), { testout: false, short: false });
  });

  await check('the tracker: right answers raise the belief, a miss lowers it, guessing is discounted', () => {
    const tr = speed.newTracker();
    const before = speed.pKnown(tr);
    for (let i = 0; i < 8; i++) speed.observe(tr, true);
    assert.ok(speed.pKnown(tr) > before && speed.pKnown(tr) > 0.9, `pKnown ${speed.pKnown(tr)}`);
    const a = speed.trackerFromAnswers([{ correct: true }, { correct: true }]);
    const b = speed.trackerFromAnswers([{ correct: true }, { correct: false }]);
    assert.ok(speed.kMean(a) > speed.kMean(b));
    assert.ok(!speed.shown(speed.trackerFromAnswers([{ correct: true }])), 'one right answer is never enough');
    const guessy = speed.trackerFromAnswers([{ correct: true, guess: 0.6 }, { correct: true, guess: 0.6 }]);
    assert.ok(speed.kMean(guessy) < speed.kMean(a), 'an easy guess is weaker evidence');
  });

  await check('retrieval first: a miss asks for the page, and a shown skill stops', () => {
    const fresh = speed.newTracker();
    speed.observe(fresh, false);
    assert.strictEqual(speed.nextStep(fresh, { pageLeft: 1 }, { lastRight: false }), 'teach');
    assert.strictEqual(speed.nextStep(fresh, { pageLeft: 0 }, { lastRight: false }), 'ask');
    const good = speed.trackerFromAnswers(Array.from({ length: 10 }, () => ({ correct: true })));
    assert.strictEqual(speed.nextStep(good, { pageLeft: 1 }, { lastRight: true }), 'stop');
  });

  await check('a miss gets the matching part of the page, not repeats, and the parts run out', () => {
    const miss = { prompt: 'What common denominator do you rewrite these fractions over?', answer: '6', rationale: '' };
    const first = speed.partsForMiss(LESSON, miss, []);
    assert.ok(first.includes('s0'), `picked ${first}`);
    assert.ok(first.length < speed.lessonParts(LESSON).length, 'a part, not the page');
    const second = speed.partsForMiss(LESSON, miss, first);
    assert.ok(!second.some((id) => first.includes(id)));
    assert.deepStrictEqual(speed.partsForMiss(LESSON, miss, speed.lessonParts(LESSON).map((p) => p.id)), []);
  });

  await check('the review rule: under the line asks, holding to the last day does not, nothing after it', () => {
    const base = { k: 0.95, target: 0.7, margin: 0.15, endMargin: 0.05 };
    assert.strictEqual(speed.reviewDue({ ...base, recallNow: 0.8 }), true);
    assert.strictEqual(speed.reviewDue({ ...base, recallNow: 0.99 }), false);
    assert.strictEqual(speed.reviewDue({ ...base, recallNow: 0.8, recallAtEnd: 0.85, daysToEnd: 5 }), false, 'holds to the end: overshoot not reviewed');
    assert.strictEqual(speed.reviewDue({ ...base, recallNow: 0.8, recallAtEnd: 0.5, daysToEnd: 5 }), true);
    assert.strictEqual(speed.reviewDue({ ...base, recallNow: 0.1, recallAtEnd: 0.1, daysToEnd: -1 }), false, 'after the last day');
    assert.strictEqual(speed.reviewDue({ ...base, recallNow: 0.3, recallAtEnd: 0.3, daysToEnd: 40, mode: 'end', window: 10 }), false, 'end mode waits');
    assert.strictEqual(speed.reviewDue({ ...base, recallNow: 0.3, recallAtEnd: 0.3, daysToEnd: 5, mode: 'end', window: 10 }), true);
  });

  // ---- the real answer path, on a temp database ----
  const trackId = 'math';
  const grades = curriculum.getTrack(trackId).grades || [];
  const grade = curriculum.getGrade(trackId, (grades[3] || grades[0]).id);
  const lessonLevel = (() => { for (let l = 1; l <= grade.pathLength; l++) if (curriculum.levelKind(l, grade.pathLength, grade) === 'lesson') return l; return 1; })();
  const practiceLevel = (() => { for (let l = 1; l <= grade.pathLength; l++) if (curriculum.levelKind(l, grade.pathLength, grade) === 'practice') return l; return 1; })();
  const enroll = (u, level) => db.insert('enrollments', { user_id: u.id, track_id: trackId, grade_id: grade.id, status: 'active', current_level: level, level_items: 0 });
  const answerRight = (session, item, right = true) => sessions.answer({ userId: session.user_id, session: db.byId('sessions', session.id), itemId: item.id, userAnswer: right ? item.answer : '__wrong__', ms: 9000 });

  await check('off: a lesson answer carries no speed step and nothing is set aside', async () => {
    const u = user(); const e = enroll(u, lessonLevel);
    const s = await sessions.createSession({ userId: u.id, enrollment: e, grade });
    const items = db.find('items', (i) => i.session_id === s.session.id);
    assert.ok(items.length > 0);
    const r = await answerRight(s.session, items[0]);
    assert.ok(!r.speed);
    assert.strictEqual(db.find('items', (i) => i.session_id === s.session.id && i.set_aside).length, 0);
  });

  await check('test-out on: all checks right skips the page, tells the learner, and the level closes; the lesson row remembers', async () => withEnv(ALL, async () => {
    const u = user(); const e = enroll(u, lessonLevel);
    const s = await sessions.createSession({ userId: u.id, enrollment: e, grade });
    const items = db.find('items', (i) => i.session_id === s.session.id).sort((a, b) => a.index - b.index);
    let last = null;
    for (const it of items) { if (db.byId('items', it.id).skipped) continue; last = await answerRight(s.session, it); assert.strictEqual(last.correct, true, 'answer key'); }
    assert.strictEqual(last.speed && last.speed.action, 'skip_page');
    assert.match(last.speed.message, /skipped this page/);
    const row = db.find('lessons', (l) => l.user_id === u.id && l.skipped_by_check_at);
    assert.strictEqual(row.length, 1);
    const open = sessions.itemsInBlock(s.session.id, 0).filter((i) => i.correct === null && !i.skipped);
    assert.strictEqual(open.length, 0, 'nothing holds the level open');
    const out = sessions.resolveBlock({ userId: u.id, session: db.byId('sessions', s.session.id), enrollment: db.byId('enrollments', e.id), grade, blockIndex: 0 });
    assert.strictEqual(out.level_complete, true);
  }));

  await check('test-out on: a miss brings part of the page, later rights never skip it, and the whole page stays with the sitting', async () => withEnv(ALL, async () => {
    const u = user(); const e = enroll(u, lessonLevel);
    const s = await sessions.createSession({ userId: u.id, enrollment: e, grade });
    const items = db.find('items', (i) => i.session_id === s.session.id).sort((a, b) => a.index - b.index);
    const first = await answerRight(s.session, items[0], false);
    assert.strictEqual(first.correct, false);
    assert.strictEqual(first.speed && first.speed.action, 'teach');
    assert.ok(first.speed.parts.length >= 1);
    for (const it of items.slice(1)) { const r = await answerRight(s.session, it); assert.ok(!r.speed || r.speed.action !== 'skip_page'); }
    assert.strictEqual(db.find('lessons', (l) => l.user_id === u.id && l.skipped_by_check_at).length, 0);
    assert.ok(s.lesson && (s.lesson.sections || []).length, 'the page travels with the sitting');
  }));

  await check('short off: a miss brings the whole page', async () => withEnv({ ...ALL, SPEED_SHORT_LESSON: 'off' }, async () => {
    const u = user(); const e = enroll(u, lessonLevel);
    const s = await sessions.createSession({ userId: u.id, enrollment: e, grade });
    const items = db.find('items', (i) => i.session_id === s.session.id).sort((a, b) => a.index - b.index);
    const first = await answerRight(s.session, items[0], false);
    assert.strictEqual(first.speed && first.speed.whole, true);
  }));

  await check('a preview keeps today\'s flow', async () => withEnv(ALL, async () => {
    assert.deepStrictEqual(speed.clientFlags(1, { preview: true }), { testout: false, short: false });
  }));

  await check('mastery stop: once the skill is shown, the rest of its items are set aside and marked; the level is ready; off it needs its items', async () => {
    const u = user(); const e = enroll(u, practiceLevel);
    const plan = curriculum.levelPlan(grade, practiceLevel);
    // enough earlier right answers on the focus skill to be sure
    const old = db.insert('sessions', { user_id: u.id, enrollment_id: e.id, track_id: trackId, grade_id: grade.id, level: practiceLevel, kind: 'lesson', blocks: [] });
    for (let i = 0; i < 12; i++) db.insert('items', { session_id: old.id, user_id: u.id, skill_id: plan.focus, role: 'focus', block: 0, index: i, correct: true, user_answer: 'x' });
    db.update('enrollments', e.id, { level_items: 1 });
    assert.strictEqual(mastery.levelProgress(u.id, db.byId('enrollments', e.id), grade).ready, false, 'off: today\'s bar');
    await withEnv(ALL, async () => {
      assert.strictEqual(mastery.levelProgress(u.id, db.byId('enrollments', e.id), grade).ready, true);
      const session = db.insert('sessions', { user_id: u.id, enrollment_id: e.id, track_id: trackId, grade_id: grade.id, level: practiceLevel, kind: 'lesson', blocks: [{ index: 0, level: practiceLevel, kind: 'practice' }] });
      const mk = (index, role, skill = plan.focus) => db.insert('items', { session_id: session.id, user_id: u.id, skill_id: skill, role, block: 0, index, correct: null, user_answer: null });
      const a = mk(0, 'focus'); const b = mk(1, 'focus'); const c = mk(2, 'stretch'); const d = mk(3, 'review', 'other');
      db.update('items', a.id, { correct: true, user_answer: 'x' });
      const step = speed.afterAnswer({ userId: u.id, session, item: db.byId('items', a.id), correct: true, block: sessions.itemsInBlock(session.id, 0) });
      assert.strictEqual(step.action, 'stop_skill');
      assert.deepStrictEqual(step.set_aside.sort(), [b.id, c.id].sort());
      assert.ok(step.message);
      assert.strictEqual(db.byId('items', b.id).set_aside, 'mastered');
      assert.strictEqual(db.byId('items', d.id).skipped, undefined, 'another skill\'s review stays');
    });
  });

  await check('mastery stop: following practice levels on a shown skill are passed over, a lesson or checkpoint never is', async () => withEnv(ALL, async () => {
    const u = user(); const e = enroll(u, practiceLevel);
    for (const skill of grade.skills) {
      const old = db.insert('sessions', { user_id: u.id, enrollment_id: e.id, level: practiceLevel, kind: 'lesson', blocks: [] });
      for (let i = 0; i < 12; i++) db.insert('items', { session_id: old.id, user_id: u.id, skill_id: skill, role: 'focus', block: 0, index: i, correct: true, user_answer: 'x' });
    }
    db.update('enrollments', e.id, { level_items: 1 });
    const r = mastery.tryLevelUp(u.id, db.byId('enrollments', e.id), grade);
    assert.strictEqual(r.advanced, true);
    const kind = curriculum.levelKind(db.byId('enrollments', e.id).current_level, grade.pathLength, grade);
    assert.notStrictEqual(kind, 'practice', 'stands on a lesson or a checkpoint');
  }));

  await check('review target: a skill holding the target to the goal\'s last day is not asked; off it is; after the last day nothing', async () => {
    const u = user();
    const e = db.insert('enrollments', { user_id: u.id, track_id: trackId, grade_id: grade.id, status: 'active', current_level: practiceLevel, retention_goal: { horizon: Object.keys(goal.HORIZONS).find((h) => goal.HORIZONS[h].days === 30) || goal.CHOICES[0], set_on: '2026-11-01' }, finished_on: new Date().toISOString() });
    const skill = grade.skills[0];
    const old = db.insert('sessions', { user_id: u.id, enrollment_id: e.id, level: 1, kind: 'lesson', blocks: [] });
    for (let i = 0; i < 12; i++) db.insert('items', { session_id: old.id, user_id: u.id, skill_id: skill, role: 'focus', block: 0, index: i, correct: true, user_answer: 'x' });
    const lastSeen = new Date(Date.now() - 3 * 86400000).toISOString();
    db.insert('skill_states', { user_id: u.id, skill_id: skill, mastery: 0.8, attempts: 12, correct: 12, streak: 3, ease: 2.5, error_tags: [], last_seen_at: lastSeen, next_due_at: lastSeen });
    assert.strictEqual(speed.reviewWanted(u.id, skill, 0.99, null), false);
    await withEnv(ALL, () => {
      const ctx = goal.reviewContext(u.id, db.byId('enrollments', e.id));
      assert.ok(ctx, 'the goal is read when the lever is on');
      const due = mastery.dueReviews(u.id, [skill], 3, ctx);
      assert.ok(Array.isArray(due));
    });
    assert.strictEqual(goal.reviewContext(u.id, db.byId('enrollments', e.id)), null, 'off: no goal context, today\'s path');
    assert.strictEqual(goal.daysToGoalEnd({ status: 'forever' }, null), null);
    assert.strictEqual(goal.daysToGoalEnd({ status: 'horizon', days: 30 }, null), null, 'not finished: end unknown');
    assert.ok(Math.abs(goal.daysToGoalEnd({ status: 'horizon', days: 30 }, new Date(0).toISOString(), 86400000 * 10) - 20) < 1e-9);
  });

  console.log(failed ? `\n${failed} FAILED` : '\nspeed levers: all ok');
  process.exit(failed ? 1 : 0);
})();
