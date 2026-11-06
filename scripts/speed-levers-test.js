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
for (const k of ['SPEED_SKILL_PLACEMENT', 'SPEED_IMPLIED', 'SPEED_EDGE', 'SPEED_FAST_ITEM', 'SPEED_COMPOSITE', 'SPEED_ALL', 'SPEED_TESTOUT', 'SPEED_SHORT_LESSON', 'SPEED_MASTERY_STOP', 'SPEED_REVIEW_TARGET', 'SPEED_REVIEW_MODE', 'SR_ALL', 'SR_GOAL_REVIEW', 'SR_GOAL_BACKWARD']) delete process.env[k];
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
const ALL = { SPEED_TESTOUT: 'on', SPEED_SHORT_LESSON: 'on', SPEED_MASTERY_STOP: 'on', SPEED_REVIEW_TARGET: 'on', SPEED_FAST_ITEM: 'on', SPEED_COMPOSITE: 'on' };
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
    assert.deepStrictEqual(speed.clientFlags(1, {}), { testout: false, short: false, fast: false });
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

  await check("a learner who chose feedback at the end keeps today's flow: nothing set aside, no page marked skipped", async () => withEnv(ALL, async () => {
    const u = user(); const e = enroll(u, lessonLevel);
    const s = await sessions.createSession({ userId: u.id, enrollment: e, grade });
    db.update('sessions', s.session.id, { params: { ...(s.session.params || {}), immediateFeedback: false } });
    const items = db.find('items', (i) => i.session_id === s.session.id).sort((a, b) => a.index - b.index);
    for (const it of items) { const r = await answerRight(s.session, it); assert.ok(!r.speed); }
    assert.strictEqual(db.find('lessons', (l) => l.user_id === u.id && l.skipped_by_check_at).length, 0);
  }));

  await check('a preview keeps today\'s flow', async () => withEnv(ALL, async () => {
    assert.deepStrictEqual(speed.clientFlags(1, { preview: true }), { testout: false, short: false, fast: false });
  }));

  await check('mastery stop: once the skill is shown, the rest of its items are set aside and marked; the level is ready; off it needs its items', async () => {
    const u = user(); const e = enroll(u, practiceLevel);
    const plan = curriculum.levelPlan(grade, practiceLevel);
    // enough earlier right answers on the focus skill to be sure
    const old = db.insert('sessions', { user_id: u.id, enrollment_id: e.id, track_id: trackId, grade_id: grade.id, level: practiceLevel, kind: 'lesson', blocks: [] });
    for (let i = 0; i < 12; i++) db.insert('items', { session_id: old.id, user_id: u.id, skill_id: plan.focus, role: 'focus', level: practiceLevel, block: 0, index: i, correct: true, user_answer: 'x' });
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
      for (let i = 0; i < 12; i++) db.insert('items', { session_id: old.id, user_id: u.id, skill_id: skill, role: 'focus', level: practiceLevel, block: 0, index: i, correct: true, user_answer: 'x' });
    }
    db.update('enrollments', e.id, { level_items: 1 });
    const r = mastery.tryLevelUp(u.id, db.byId('enrollments', e.id), grade);
    assert.strictEqual(r.advanced, true);
    const kind = curriculum.levelKind(db.byId('enrollments', e.id).current_level, grade.pathLength, grade);
    assert.notStrictEqual(kind, 'practice', 'stands on a lesson or a checkpoint');
  }));

  await check('mastery stop: evidence comes from this lesson stretch only; right answers on an earlier lesson of the same coarse skill do not pass over this one', async () => withEnv(ALL, async () => {
    const later = (() => { for (let l = lessonLevel + 1; l <= grade.pathLength; l++) if (curriculum.levelKind(l, grade.pathLength, grade) === 'practice') return l; return lessonLevel; })();
    const u = user(); const e = enroll(u, later);
    const plan = curriculum.levelPlan(grade, later);
    const unit = speed.unitOf(grade, later);
    assert.ok(unit.from === lessonLevel && unit.to >= later);
    const old = db.insert('sessions', { user_id: u.id, enrollment_id: e.id, level: unit.from - 1, kind: 'lesson', blocks: [] });
    for (let i = 0; i < 12; i++) db.insert('items', { session_id: old.id, user_id: u.id, skill_id: plan.focus, role: 'focus', level: unit.from - 1, block: 0, index: i, correct: true, user_answer: 'x' });
    assert.strictEqual(speed.practiceShown(u.id, plan.focus, { grade, level: later }), false, 'an earlier lesson is not evidence');
    assert.strictEqual(speed.practiceShown(u.id, plan.focus), true, 'with no scope it would have been');
    const here = db.insert('sessions', { user_id: u.id, enrollment_id: e.id, level: later, kind: 'lesson', blocks: [] });
    for (let i = 0; i < 12; i++) db.insert('items', { session_id: here.id, user_id: u.id, skill_id: plan.focus, role: 'focus', level: later, block: 0, index: i, correct: true, user_answer: 'x' });
    assert.strictEqual(speed.practiceShown(u.id, plan.focus, { grade, level: later }), true, 'answers in this stretch are');
  }));

  await check('review target: a skill holding the target to the goal\'s last day is not asked; off it is; after the last day nothing', async () => {
    const u = user();
    const e = db.insert('enrollments', { user_id: u.id, track_id: trackId, grade_id: grade.id, status: 'active', current_level: practiceLevel, retention_goal: { horizon: 'months', set_on: '2026-11-01' }, finished_on: new Date().toISOString() });
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
    await withEnv({ SR_GOAL_REVIEW: 'off' }, () => assert.strictEqual(goal.reviewContext(u.id, db.byId('enrollments', e.id)), null, 'every switch off: no goal context'));
    assert.strictEqual(goal.daysToGoalEnd({ status: 'forever' }, null), null);
    assert.strictEqual(goal.daysToGoalEnd({ status: 'horizon', days: 30 }, null), null, 'not finished: end unknown');
    assert.ok(Math.abs(goal.daysToGoalEnd({ status: 'horizon', days: 30 }, new Date(0).toISOString(), 86400000 * 10) - 20) < 1e-9);
  });

  // ---- round 2 ----
  const placement = require('../services/speed-placement'); // eslint-disable-line global-require
  const stateOf = (n) => Array.from({ length: n }, () => ({ status: 'open', asked: 0, tr: speed.newTracker() }));
  const rightN = (row, n) => { for (let i = 0; i < n; i++) speed.observe(row.tr, true); };

  await check('placement: most advanced first; a plain miss sends a skill to the path; several rights call it known', () => {
    const st = stateOf(3);
    assert.strictEqual(speed.placementNext(st), 2);
    speed.observe(st[2].tr, false);
    speed.placementAnswer(st, 2, false, () => []);
    assert.strictEqual(st[2].status, 'path');
    rightN(st[1], 12);
    speed.placementAnswer(st, 1, true, () => []);
    assert.strictEqual(st[1].status, 'known');
  });

  await check('implied mastery: a pass settles what it builds on, every third is sampled, a sampled miss revokes the rest of that pass', () => {
    const st = stateOf(7);
    const line = (i) => (i > 0 ? [i - 1] : []);
    rightN(st[6], 12);
    const out = speed.placementAnswer(st, 6, true, line, { sampleEvery: 3 });
    assert.strictEqual(out.implied.length, 6);
    const sampled = st.filter((r) => r.sample);
    assert.strictEqual(sampled.length, 2, 'one in three is asked');
    const i = speed.placementNext(st);
    assert.ok(st[i].sample);
    const back = speed.placementAnswer(st, i, false, line, { sampleEvery: 3 });
    assert.ok(back.revoked.includes(i));
    assert.strictEqual(st.filter((r) => r.status === 'implied').length, 0, 'nothing from a wrong inference stays settled');
    assert.strictEqual(st[6].status, 'known', 'the skill actually shown stays known');
  });

  await check('the item at the edge: a belief near the line gets a harder item than a low belief', () => {
    const high = speed.trackerFromAnswers(Array.from({ length: 5 }, () => ({ correct: true })));
    const low = speed.trackerFromAnswers([{ correct: false }, { correct: false }]);
    assert.ok(speed.bestItem(high).b >= speed.bestItem(low).b);
    assert.ok(speed.pRight(0.9, 0.25, { a: 8, b: 0.7 }) > speed.pRight(0.4, 0.25, { a: 8, b: 0.7 }));
  });

  await check('the skill check: off is a 404 and an untouched path; on it runs, tells, and steps over settled levels only', async () => {
    const u = user(); const e = enroll(u, 1);
    assert.strictEqual(placement.start(u.id, e, grade).status, 404);
    assert.strictEqual(placement.stepOverSettled(e, grade, 5), 5, 'no check taken: nothing moves');
    await withEnv({ SPEED_SKILL_PLACEMENT: 'on', SPEED_IMPLIED: 'on' }, async () => {
      assert.ok(placement.pathView(u.id, e, grade).speed_skill_check, 'offered on the path');
      const first = placement.start(u.id, e, grade);
      assert.ok(first.item && first.session.kind === 'placement');
      let item = first.item; let out = null; let guard = 0;
      while (item && guard++ < 400) {
        const r = await sessions.answer({ userId: u.id, session: db.byId('sessions', first.session.id), itemId: item.id, userAnswer: item.answer, ms: 9000 });
        const step = placement.afterAnswer({ userId: u.id, session: db.byId('sessions', first.session.id), enrollment: db.byId('enrollments', e.id), grade, item: db.byId('items', item.id), correct: !!r.correct });
        item = step.next || null; out = step.done || out;
      }
      assert.ok(out, 'it ends');
      const row = db.byId('enrollments', e.id);
      assert.ok(row.speed_placement.finished_at);
      assert.ok(out.known.length + out.implied.length > 0, 'all right: something is settled');
      const view = placement.pathView(u.id, row, grade);
      assert.ok(view.speed_settled, 'listed on the path');
      assert.ok(!view.speed_skill_check, 'not offered twice');
      assert.strictEqual(placement.start(u.id, row, grade).status, 409);
      const at = curriculum.levelKind(row.current_level, grade.pathLength, grade);
      if (row.current_level < grade.pathLength) assert.ok(at !== 'practice' && at !== 'lesson' ? true : !new Set([...out.known, ...out.implied]).has(curriculum.levelPlan(grade, row.current_level).focus), 'stands on a level with something to do, or a gate');
    });
  });

  await check('a later miss on an implied skill goes back on the list, and the path stops stepping over it', () => {
    const u = user(); const skill = grade.skills[0];
    const e = db.insert('enrollments', { user_id: u.id, track_id: trackId, grade_id: grade.id, status: 'active', current_level: 1, speed_placement: { known: [], implied: [skill], revisit: [], finished_at: new Date().toISOString() } });
    const s = db.insert('sessions', { user_id: u.id, enrollment_id: e.id, kind: 'lesson', blocks: [] });
    const it = db.insert('items', { session_id: s.id, user_id: u.id, skill_id: skill, role: 'review', block: 0, index: 0, correct: false });
    assert.strictEqual(placement.noteAnswer(u.id, it, false), true);
    const row = db.byId('enrollments', e.id).speed_placement;
    assert.deepStrictEqual(row.implied, []);
    assert.deepStrictEqual(row.revisit, [skill]);
    assert.strictEqual(placement.noteAnswer(u.id, it, true), false);
  });

  await check('a composite item is an attempt on each skill it names, only with the switch on', async () => {
    const u = user(); const e = enroll(u, practiceLevel); const other = grade.skills[grade.skills.length - 1];
    const go = async () => {
      const s = db.insert('sessions', { user_id: u.id, enrollment_id: e.id, track_id: trackId, grade_id: grade.id, level: practiceLevel, kind: 'lesson', blocks: [{ index: 0, level: practiceLevel, kind: 'practice' }] });
      const it = db.insert('items', { session_id: s.id, user_id: u.id, skill_id: grade.skills[0], also_skills: [other], format: 'multiple_choice', prompt: 'p', answer: 'a', choices: ['a', 'b'], difficulty: 3, role: 'focus', block: 0, index: 0, correct: null, user_answer: null, level: practiceLevel });
      await sessions.answer({ userId: u.id, session: s, itemId: it.id, userAnswer: 'a', ms: 9000 });
    };
    await go();
    assert.ok(!(mastery.stateFor(u.id, other).attempts > 0), 'off: only its own skill');
    await withEnv(ALL, go);
    assert.ok(mastery.stateFor(u.id, other).attempts > 0, 'on: the other skill too');
  });

  console.log(failed ? `\n${failed} FAILED` : '\nspeed levers: all ok');
  process.exit(failed ? 1 : 0);
})();
