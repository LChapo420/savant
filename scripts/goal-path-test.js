#!/usr/bin/env node
/**
 * Goal-shaped path: the target date on a goal (services/goals.js), the Spanish
 * sprint profile (services/spanish/goal-fit.js) and the unit order other
 * subjects take from the goal text (services/goal-order.js through
 * services/learner-path.js).
 *
 *   node scripts/goal-path-test.js
 *
 * Runs on a throwaway data file; the real db.json is never opened for writing.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

process.env.DB_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'goal-path-test-')), 'db.json');
process.env.OWNER_BASE = 'on';

const db = require('../config/db');
const curriculum = require('../config/curriculum');
const goals = require('../services/goals');
const fit = require('../services/spanish/goal-fit');
const goalOrder = require('../services/goal-order');
const learnerPath = require('../services/learner-path');
const unitPlacement = require('../services/unit-placement');
const owner = require('../config/owner');

let failed = 0;
function check(name, fn) {
  try { fn(); console.log(`ok   ${name}`); } catch (err) { failed += 1; console.log(`FAIL ${name}\n     ${err.message}`); }
}

const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const user = db.insert('users', { email: 'sprint@example.com', name: 'S' });
const boss = db.insert('users', { email: owner.ownerEmail(), name: 'Owner' });

check('a target date is kept with the goal, counted in days, and cleared with it', () => {
  const out = goals.set(user.id, { trackId: 'spanish', gradeId: 'entry', choice: 'conversation', targetDate: day(5) });
  assert.strictEqual(out.goal.target_date, day(5));
  assert.strictEqual(out.goal.days_left, 5);
  // Saving without a date (the placement step) keeps the date; an empty date clears it.
  assert.strictEqual(goals.set(user.id, { trackId: 'spanish', gradeId: 'entry', choice: 'conversation', text: 'trip' }).goal.days_left, 5);
  assert.strictEqual(goals.set(user.id, { trackId: 'spanish', gradeId: 'entry', choice: 'conversation', targetDate: '' }).goal.target_date, null);
  goals.set(user.id, { trackId: 'spanish', gradeId: 'entry', choice: 'conversation', targetDate: day(5) });
  assert.strictEqual(goals.set(user.id, { trackId: 'spanish', gradeId: 'entry', choice: null }).goal, null, 'clearing the goal drops the date');
  assert.strictEqual(db.find('learner_goals', (r) => r.user_id === user.id)[0].target_date, null);
});

check('bad dates are refused and nothing changes', () => {
  goals.set(user.id, { trackId: 'spanish', gradeId: 'entry', choice: 'conversation', targetDate: day(5) });
  for (const bad of ['tomorrow', '2026-02-30', day(-1), day(400), '12/11/2026']) {
    assert.ok(goals.set(user.id, { trackId: 'spanish', gradeId: 'entry', choice: 'conversation', targetDate: bad }).error, bad);
  }
  assert.strictEqual(goals.forGrade(user.id, 'spanish', 'entry').target_date, day(5));
  assert.strictEqual(goals.cleanDate(day(0)).date, day(0), 'today is allowed');
});

check('a date in the past stops counting as a date', () => {
  assert.strictEqual(goals.daysUntil(day(-3)), -3);
  const row = db.find('learner_goals', (r) => r.user_id === user.id)[0];
  db.update('learner_goals', row.id, { target_date: day(-3) });
  assert.strictEqual(goals.forGrade(user.id, 'spanish', 'entry').days_left, null);
  assert.strictEqual(fit.profileFor(user.id, 'entry').id, 'conversation');
  db.update('learner_goals', row.id, { target_date: day(5) });
});

check('sprint: a date within 14 days, not a test goal', () => {
  const g = (choice, days, text = '') => ({ choice, text, days_left: days });
  assert.strictEqual(fit.profileOfGoal(g('conversation', 14)), 'sprint');
  assert.strictEqual(fit.profileOfGoal(g('conversation', 0)), 'sprint');
  assert.strictEqual(fit.profileOfGoal(g('conversation', 15)), 'conversation');
  assert.strictEqual(fit.profileOfGoal(g('deep', 7)), 'sprint', 'any non-test goal with a close date');
  assert.strictEqual(fit.profileOfGoal(g('test', 7)), 'test', 'a test goal keeps every level');
  assert.strictEqual(fit.profileOfGoal(g('deep', 40)), 'standard');
  assert.strictEqual(fit.profileOfGoal({ choice: 'conversation', days_left: null }), 'conversation');
  assert.strictEqual(fit.profileFor(user.id, 'entry').id, 'sprint');
  assert.ok(fit.profileFor(user.id, 'entry').why.includes('review'));
});

check('sprint: conversation rules for what is put aside, more hearing, review first', () => {
  assert.ok(fit.CONVERSATION_LIKE.has('sprint') && fit.CONVERSATION_LIKE.has('conversation'));
  const count = (steps, kinds) => steps.filter((s) => kinds.includes(s.split(':')[0])).length;
  for (const slot of Object.keys(fit.RECIPES.conversation)) {
    const conv = fit.recipe('conversation', slot);
    const sprint = fit.recipe('sprint', slot);
    assert.ok(count(sprint, ['type_heard', 'listen_meaning']) >= count(conv, ['type_heard', 'listen_meaning']) + 4, `${slot}: more type_heard and listen_meaning`);
    assert.deepStrictEqual(sprint.slice(0, 2), ['listen_meaning:old', 'type_heard:old'], `${slot}: review first`);
    assert.deepStrictEqual(sprint.slice(2, 2 + conv.length), conv, `${slot}: the conversation recipe inside`);
  }
  assert.ok(fit.recycleShare('sprint') > fit.recycleShare('conversation'));
  const tiers = [{ id: 'a', tier: 3 }, { id: 'b', tier: 1 }];
  assert.strictEqual(fit.orderPhrases(tiers, 'sprint')[0].id, 'b', 'most frequent first');
});

check('sprint puts aside exactly what conversation does', () => {
  const spanishGrade = curriculum.getGrade('spanish', 'entry');
  assert.ok(spanishGrade && spanishGrade.levels.length);
  const a = [...fit.deferredLevels(spanishGrade, 'conversation').keys()];
  const b = [...fit.deferredLevels(spanishGrade, 'sprint').keys()];
  assert.deepStrictEqual(b, a);
});

// Non-Spanish: a grade with a unit bank.
const units = unitPlacement.unitsFor('math', 'sense_of_quantity');
const grade = curriculum.getGrade('math', 'sense_of_quantity');
const planOf = (status) => ({ units: Object.fromEntries(units.map((u) => [u.key, { status }])) });
const enroll = (u, status = 'unseen') => ({ id: 1, user_id: u.id, track_id: 'math', grade_id: 'sense_of_quantity', current_level: units[0].end, unit_plan: planOf(status) });

check('goal words: filler dropped, plurals folded', () => {
  assert.deepStrictEqual(goalOrder.keywords('I want to finish the Shapes and Patterns before my exam'), ['shape', 'pattern']);
  assert.deepStrictEqual(goalOrder.keywords(''), []);
  assert.deepStrictEqual(goalOrder.keywords('ace the test'), []);
});

check('no goal text: the path order is the level order, as before', () => {
  goals.set(user.id, { trackId: 'math', gradeId: 'sense_of_quantity', choice: 'deep' });
  const e = enroll(user);
  assert.strictEqual(learnerPath.nextLevelAfter(e, grade, units[0].end), units[1].start);
});

check('goal text naming a skill moves its unit to the front, in the path\'s own order', () => {
  goals.set(user.id, { trackId: 'math', gradeId: 'sense_of_quantity', choice: 'specific', text: 'getting good at patterns' });
  const target = units.findIndex((u) => /pattern/i.test(u.titles.join(' ')));
  assert.ok(target > 1);
  const e = enroll(user);
  assert.strictEqual(learnerPath.nextLevelAfter(e, grade, units[0].end), units[target].start);
  assert.strictEqual(goalOrder.order(e, units, [1, 2, target])[0], target);
  assert.strictEqual(goalOrder.order(e, units, [1, 2, 3]).join(), '1,2,3', 'no match among them: unchanged');
  // Units to learn still come before units not checked, whatever the goal says.
  const mixed = enroll(user, 'unseen');
  mixed.unit_plan.units[units[1].key] = { status: 'learn' };
  assert.strictEqual(learnerPath.nextLevelAfter(mixed, grade, units[0].end), units[1].start);
  assert.deepStrictEqual(goalOrder.named(e, units).map((u) => u.key), [units[target].key]);
});

check('nothing is hidden: known units stay stepped over, every unit is still reachable', () => {
  const e = enroll(user);
  const seen = new Set();
  let at = units[0].end;
  for (let i = 0; i < 40; i++) {
    const next = learnerPath.nextLevelAfter(e, grade, at);
    const u = units.findIndex((x) => next >= x.start && next <= x.end);
    if (u >= 0) { seen.add(u); e.unit_plan.units[units[u].key] = { status: 'done' }; }
    at = next;
  }
  assert.strictEqual(seen.size, units.length, 'each unit is worked once the goal unit is done');
});

check('the owner\'s account and Spanish keep their own order', () => {
  goals.set(boss.id, { trackId: 'math', gradeId: 'sense_of_quantity', choice: 'specific', text: 'patterns' });
  const e = enroll(boss);
  assert.strictEqual(learnerPath.nextLevelAfter(e, grade, units[0].end), units[1].start);
  assert.strictEqual(goalOrder.order({ ...enroll(user), track_id: 'spanish' }, units, [1, 2, 9]).join(), '1,2,9');
});

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall goal-path checks passed');
