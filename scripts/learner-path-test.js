/**
 * Tests for the gap-only path (services/learner-path.js): the evidence rules,
 * the test-out, the quick check that no longer restarts the path, advancement
 * that steps over known units, and the enrollments that must not change.
 *
 *   NODE_PATH=../node_modules node scripts/learner-path-test.js
 *
 * Runs on its own throwaway data file and the math unit bank, which is in
 * source control, so it needs no key, makes no model call and touches nothing
 * real. The placement routes are driven over HTTP on a local port with the
 * lesson prefetching stubbed out.
 */
const os = require('os');
const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'test';
// The cases below are worked out at the spec's starting knobs, so they are
// pinned here; the shipped defaults (tuned on scripts/gap-path-sim.js) are
// checked on their own in 'the evidence model'.
const SPEC_KNOBS = { HOLE_PRIOR: '0.15', ISLAND_PRIOR: '0.3', SLIP: '0.05', LUCK: '0.15', KNOWN_AT: '0.985', LEARN_AT: '0.35' };
for (const [name, value] of Object.entries(SPEC_KNOBS)) if (process.env[name] === undefined) process.env[name] = value;
const tmp = path.join(os.tmpdir(), `learner-path-test-${process.pid}.json`);
process.env.DB_FILE = tmp;

const express = require('express');
const db = require('../config/db');
const curriculum = require('../config/curriculum');
const unitPlacement = require('../services/unit-placement');
const learnerPath = require('../services/learner-path');
const mastery = require('../services/mastery');

// Placing a learner writes their first lesson ahead and their own version of it.
// Both can reach a model, so they are stubbed before the routes are loaded.
const lessons = require('../services/lessons');
const levelEditor = require('../services/level-editor');
const scorecardHooks = require('../services/scorecard/hooks');

lessons.prefetch = () => {};
levelEditor.ensure = async () => null;
levelEditor.prefetchNext = () => {};
scorecardHooks.onPlacement = () => {};

let failures = 0;
function check(label, ok, detail) {
  if (ok) { console.log(`  ok   ${label}`); return; }
  failures++;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
}

const TRACK = 'math';
const GRADE = 'numbers_to_10';
const grade = curriculum.getGrade(TRACK, GRADE);
const units = unitPlacement.unitsFor(TRACK, GRADE);
const startOf = (n) => unitPlacement.startLevelOf(TRACK, GRADE, units[n - 1]);
const keyOf = (n) => units[n - 1].key;
const statusOf = (e, n) => (learnerPath.planFor(db.byId('enrollments', e.id)).units[keyOf(n)] || {}).status;
const fresh = (e) => db.byId('enrollments', e.id);

let userSeq = 0;
function newUser() {
  userSeq++;
  return db.insert('users', { email: `learner-path-${process.pid}-${userSeq}@example.test`, display_name: 'path test', password_hash: 'x' });
}
function newEnrollment(user, extra = {}) {
  return db.insert('enrollments', {
    user_id: user.id, track_id: TRACK, grade_id: GRADE, target_level: grade.pathLength,
    current_level: 1, level_items: 0, levels_completed: 0, xp: 0, status: 'active', ...extra,
  });
}

/*
 * One placement, written by hand so every rule has a case. The learner is
 * placed at unit 7. At the starting knobs a unit the learner was placed past
 * starts at P(known) 0.85 and needs about three right answers, with no miss, to
 * be known; one miss makes it a unit to learn.
 *   unit 1: right                   -> unchecked (one right answer is not proof)
 *   unit 2: right x3                -> known (placement)
 *   unit 3: wrong x5 (0 of 5)       -> learn, not stepped over with no question left
 *   unit 4: right, wrong x3         -> learn
 *   unit 5: wrong, wrong, right     -> learn (a right answer after two misses)
 *   unit 6: not asked               -> unchecked
 *   unit 7: right                   -> learn (the placed unit, always)
 *   unit 8: right, right            -> unseen (only a test-out proves a later unit)
 *   unit 9: right, wrong            -> unseen, no test-out (the answers show a hole)
 *   unit 10: wrong                  -> unseen, no test-out
 *   unit 12: right x4 of 5          -> unseen
 */
const PLACED = 7;
const ANSWERED = [
  { unit: 1, slot: 0, correct: true },
  { unit: 2, slot: 0, correct: true },
  { unit: 2, slot: 1, correct: true },
  { unit: 2, slot: 2, correct: true },
  ...[0, 1, 2, 3, 4].map((slot) => ({ unit: 3, slot, correct: false })),
  { unit: 4, slot: 0, correct: true },
  { unit: 4, slot: 1, correct: false },
  { unit: 4, slot: 2, correct: false },
  { unit: 4, slot: 3, correct: false },
  { unit: 5, slot: 0, correct: false },
  { unit: 5, slot: 1, correct: false },
  { unit: 5, slot: 2, correct: true },
  { unit: 7, slot: 0, correct: true },
  { unit: 8, slot: 0, correct: true },
  { unit: 8, slot: 1, correct: true },
  { unit: 9, slot: 0, correct: true },
  { unit: 9, slot: 1, correct: false },
  { unit: 10, slot: 0, correct: false },
  { unit: 12, slot: 0, correct: true },
  { unit: 12, slot: 1, correct: true },
  { unit: 12, slot: 2, correct: true },
  { unit: 12, slot: 3, correct: true },
];
function placedEnrollment(user) {
  const e = newEnrollment(user, { current_level: startOf(PLACED), placed_unit: PLACED });
  learnerPath.initFromPlacement(e, { unit: PLACED }, ANSWERED);
  return fresh(e);
}

/**
 * Walk an enrollment's whole path the way advancing does — stand on the first
 * level, then each next level, marking a unit done at its last level — and
 * return the levels stood on, in order. Stops at the end of the path.
 */
function walkPath(e, g) {
  const seen = [];
  let level = learnerPath.firstLevel(db.byId('enrollments', e.id), g);
  for (let step = 0; step < 5000; step++) {
    seen.push(level);
    if (level >= g.pathLength) break;
    const next = learnerPath.nextLevelAfter(db.byId('enrollments', e.id), g, level);
    learnerPath.finishLevel(db.byId('enrollments', e.id), level);
    if (next === level) break;
    level = next;
  }
  return seen;
}

/**
 * What a walk must do: every level of every unit not known at the start is
 * stood on (nothing left behind for good), no level of a known unit is, every
 * checkpoint between units that stands for a unit not known is taken, all the
 * units to learn come before the rest, and the walk ends at the end of the path.
 */
function walkProblems(e, g, us) {
  const plan = learnerPath.planFor(db.byId('enrollments', e.id));
  const st = (i) => (plan.units[us[i].key] || {}).status || 'unseen';
  const before = us.map((_, i) => st(i));
  const seen = walkPath(e, g);
  const at = new Set(seen);
  const firstSeen = (i) => seen.findIndex((l) => l >= us[i].start && l <= us[i].end);
  const lastSeen = (i) => seen.length - 1 - [...seen].reverse().findIndex((l) => l >= us[i].start && l <= us[i].end);
  for (let i = 0; i < us.length; i++) {
    for (let l = us[i].start; l <= us[i].end; l++) {
      if (before[i] === 'known' && at.has(l)) return { known_unit_entered: i + 1, level: l };
      if (!['known', 'done'].includes(before[i]) && !at.has(l)) return { left_behind: i + 1, status: before[i], level: l };
    }
  }
  for (let l = 1; l <= us[us.length - 1].end; l++) {
    if (us.some((u) => l >= u.start && l <= u.end)) continue;
    const covers = learnerPath.betweenCovers(g, us, l);
    if (covers.length && covers.some((i) => before[i] !== 'known' && before[i] !== 'done') && !at.has(l)) return { checkpoint_skipped: l, covers };
  }
  const learn = before.map((x, i) => (x === 'learn' ? i : -1)).filter((i) => i >= 0);
  const rest = before.map((x, i) => (['unchecked', 'unseen'].includes(x) ? i : -1)).filter((i) => i >= 0);
  const lastLearn = Math.max(-1, ...learn.map(lastSeen));
  const firstRest = Math.min(Infinity, ...rest.map(firstSeen));
  if (lastLearn > firstRest) return { order: 'a unit not proved was worked before every unit to learn was', lastLearn, firstRest };
  if (seen[seen.length - 1] !== g.pathLength) return { ended_at: seen[seen.length - 1] };
  return null;
}

/** Run `fn` with some of the model's knobs set, and put them back after. */
function withKnobs(knobs, fn) {
  const saved = {};
  for (const [k, v] of Object.entries(knobs)) { saved[k] = process.env[k]; process.env[k] = String(v); }
  try { return fn(); } finally {
    for (const k of Object.keys(knobs)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
}
const R = { correct: true };
const W = { correct: false };

async function main() {
  if (!units || units.length < 13) {
    console.log('  (skipped: the math numbers_to_10 unit bank is missing or short)');
    return;
  }

  console.log('\nthe evidence model');
  {
    const b = (answers, opts) => learnerPath.unitBelief(answers, opts);
    const pinned = {};
    for (const name of Object.keys(SPEC_KNOBS)) { pinned[name] = process.env[name]; delete process.env[name]; }
    const shipped = learnerPath.beliefKnobs();
    Object.assign(process.env, pinned);
    check('the shipped knobs are the tuned ones', shipped.HOLE_PRIOR === 0.15 && shipped.ISLAND_PRIOR === 0.65 && shipped.SLIP === 0.15 && shipped.LUCK === 0.15 && shipped.KNOWN_AT === 0.965 && shipped.LEARN_AT === 0.6, shipped);
    const k = learnerPath.beliefKnobs();
    check('the starting knobs are the spec\'s', k.HOLE_PRIOR === 0.15 && k.ISLAND_PRIOR === 0.3 && k.SLIP === 0.05 && k.LUCK === 0.15 && k.KNOWN_AT === 0.985 && k.LEARN_AT === 0.35, k);
    check('with no answers a unit placed past starts at 1 - HOLE_PRIOR, undecided', Math.abs(b([]).p - 0.85) < 1e-9 && b([]).decision === 'undecided');
    check('a later unit starts at ISLAND_PRIOR', Math.abs(b([], { prior: 'island' }).p - 0.3) < 1e-9);
    check('one right answer does not prove a unit', b([R]).decision === 'undecided', b([R]).p);
    check('two right answers do not either', b([R, R]).decision === 'undecided', b([R, R]).p);
    check('three right answers do', b([R, R, R]).decision === 'known', b([R, R, R]).p);
    check('one right and three wrong is not known — it is a hole', b([R, W, W, W]).decision === 'learn', b([R, W, W, W]).p);
    check('a right answer after two misses is not known', b([W, W, R]).decision === 'learn', b([W, W, R]).p);
    check('0 of 5 is a hole', b([W, W, W, W, W]).decision === 'learn');
    check('a miss counts against three rights after it', b([W, R, R, R]).decision === 'undecided', b([W, R, R, R]).p);
    check('evidence can be counts or a unit entry', b({ right: 3, wrong: 0 }).decision === 'known' && b({ asked: [R, R, R] }).decision === 'known');
    check('more options make a lucky guess less likely', b([R], { choices: 2 }).p < b([R], { choices: 6 }).p);
    check('the knobs come from the environment', withKnobs({ KNOWN_AT: 0.9 }, () => b([R, R]).decision) === 'known' && b([R, R]).decision === 'undecided');
  }

  console.log('\nthe evidence rules from a placement');
  {
    const e = placedEnrollment(newUser());
    const plan = learnerPath.planFor(e);
    check('the plan is version 2 with every unit of the grade', plan.version === 2 && Object.keys(plan.units).length === units.length);
    check('the placed unit is to learn', statusOf(e, PLACED) === 'learn');
    check('a unit before it answered right three times is known, from the placement', statusOf(e, 2) === 'known' && plan.units[keyOf(2)].source === 'placement');
    check('one right answer leaves a unit not checked, not known', statusOf(e, 1) === 'unchecked');
    check('a unit never asked is not checked, not known', statusOf(e, 6) === 'unchecked');
    check('0 of 5 is to learn', statusOf(e, 3) === 'learn');
    check('one right and three wrong is to learn', statusOf(e, 4) === 'learn');
    check('one right after two misses is to learn', statusOf(e, 5) === 'learn');
    check('every unit after the placed one is unseen, whatever it was answered', [8, 9, 10, 11, 12, 13].every((n) => statusOf(e, n) === 'unseen'));
    check('the evidence is counted per unit', JSON.stringify(plan.units[keyOf(4)].evidence) === JSON.stringify({ right: 1, wrong: 3 })
      && JSON.stringify(plan.units[keyOf(8)].evidence) === JSON.stringify({ right: 2, wrong: 0 }));
    check('the learner stands at the earliest unit to learn — the gaps lead', learnerPath.firstLevel(e, grade) === startOf(3), learnerPath.firstLevel(e, grade));
    check('the quick check asks the units not checked, with their fresh questions', JSON.stringify(learnerPath.quickChecks(e).map((c) => [c.unit, c.slots])) === JSON.stringify([[1, [1, 2, 3, 4]], [6, [0, 1, 2, 3, 4]]]),
      learnerPath.quickChecks(e));
    check('at the starting knobs no later unit can be proved with the five questions a unit has, so none is offered',
      !learnerPath.testOutCandidates(e).some((c) => c.unit > PLACED));
    check('the units not checked are open to a test-out', JSON.stringify(learnerPath.testOutCandidates(e).map((c) => c.unit)) === JSON.stringify([1, 6]));

    const sum = learnerPath.summary(e);
    check('the summary counts each status, unchecked on its own', sum.planned && sum.known.count === 1 && sum.learn.count === 4 && sum.unchecked.count === 2
      && sum.unseen.count === units.length - 7 && sum.done.count === 0 && sum.units.length === units.length
      && sum.unchecked.units.map((u) => u.unit).join() === '1,6' && Array.isArray(sum.catch_up) && sum.test_out === 2, sum);
    check('and each unit row says whether it can be tested out of', sum.units.find((u) => u.unit === 6).can_test_out === true && sum.units.find((u) => u.unit === 3).can_test_out === false);

    // The repro from the simulation: English grammar, unit 3 missed on all five
    // questions, placed at unit 5. It is a unit to learn, and the path walks it.
    const eg = curriculum.getGrade('english', 'grammar');
    const gu = unitPlacement.unitsFor('english', 'grammar');
    if (eg && gu && gu.length >= 5) {
      const en = db.insert('enrollments', { user_id: newUser().id, track_id: 'english', grade_id: 'grammar', current_level: 1, level_items: 0, levels_completed: 0, status: 'active' });
      learnerPath.initFromPlacement(en, { unit: 5 }, gu[2].questions.map((_, slot) => ({ unit: 3, slot, correct: false })));
      const before3 = gu[2].start - 1;
      check(`0 of 5 is never stepped over (english grammar: after level ${before3} comes ${gu[2].start})`, learnerPath.nextLevelAfter(fresh(en), eg, before3) === gu[2].start,
        learnerPath.nextLevelAfter(fresh(en), eg, before3));
      // And the plan written before \`unchecked\` existed: a unit before the
      // placed one with no status is no longer stepped over either.
      db.update('enrollments', en.id, { unit_plan: { version: 1, placed_unit: 5, units: {}, catch_up: [] } });
      check('a unit with no evidence before the placed one is walked, not stepped over', !walkProblems(en, eg, gu), walkProblems(en, eg, gu));
    }

    // A catch-up offer written before the grade placement survives it.
    const e2 = newEnrollment(newUser());
    db.update('enrollments', e2.id, { unit_plan: { version: 1, units: {}, catch_up: [{ grade_id: 'x', unit_keys: ['k'], status: 'offered', enrollment_id: null }] } });
    learnerPath.initFromPlacement(fresh(e2), { unit: 3 }, []);
    check('catch-up offers already on the enrollment are kept by a placement', learnerPath.planFor(fresh(e2)).catch_up.length === 1);

    // Questions an earlier gap scan asked stay asked through a placement, count
    // as evidence, and are never asked again.
    const e3 = newEnrollment(newUser());
    db.update('enrollments', e3.id, { unit_plan: { version: 1, catch_up: [], units: {
      [keyOf(1)]: { status: 'unseen', source: 'gap_scan', evidence: { right: 2, wrong: 0 }, at: null, asked: [{ slot: 3, correct: true, source: 'gap_scan' }, { slot: 4, correct: true, source: 'gap_scan' }] },
      [keyOf(8)]: { status: 'unseen', source: 'gap_scan', evidence: { right: 1, wrong: 0 }, at: null, asked: [{ slot: 2, correct: true, source: 'gap_scan' }] },
      [keyOf(13)]: { status: 'unseen', source: 'gap_scan', evidence: { right: 0, wrong: 1 }, at: null, asked: [{ slot: 3, correct: false, source: 'gap_scan' }] },
    } } });
    learnerPath.initFromPlacement(fresh(e3), { unit: PLACED }, [...ANSWERED, { unit: 13, slot: 0, correct: true }]);
    const p3 = learnerPath.planFor(fresh(e3));
    check('a gap scan\'s questions survive the placement', p3.units[keyOf(8)].asked.some((a) => a.slot === 2 && a.source === 'gap_scan') && p3.units[keyOf(8)].asked.length === 3);
    check('and count as evidence: two scan rights and a placement right prove unit 1', statusOf(fresh(e3), 1) === 'known', p3.units[keyOf(1)]);
    withKnobs({ ISLAND_PRIOR: 0.85 }, () => {
      const c3 = learnerPath.testOutCandidates(fresh(e3));
      check('the test-out leaves out what the gap scan asked', c3.some((c) => c.unit === 8 && JSON.stringify(c.slots) === JSON.stringify([3, 4])), c3);
      check('and a unit the gap scan saw missed cannot be proved, so is not offered', !c3.some((c) => c.unit === 13));
    });
    check('the asked slots are listed per unit', learnerPath.askedSlots(fresh(e3))[8].has(2) && learnerPath.askedSlots(fresh(e3))[8].has(0));
  }

  console.log('\nthe quick check, unit by unit');
  {
    const e = placedEnrollment(newUser());
    let out = learnerPath.recordCheck(e, 1, true, { slot: 1 });
    check('a second right answer on a unit not checked still does not prove it', !out.changed && statusOf(e, 1) === 'unchecked' && out.decision === 'undecided');
    out = learnerPath.recordCheck(e, 1, true, { slot: 1 });
    check('the same question answered again is not counted twice', !out.changed && learnerPath.planFor(fresh(e)).units[keyOf(1)].evidence.right === 2);
    out = learnerPath.recordCheck(e, 1, true, { slot: 2 });
    check('a third proves it, from the quick check', out.changed && statusOf(e, 1) === 'known' && out.plan.units[keyOf(1)].source === 'quick_check');
    out = learnerPath.recordCheck(e, 6, false, { slot: 0 });
    check('a miss on a unit not checked puts it on the path to learn', out.changed && statusOf(e, 6) === 'learn' && out.plan.units[keyOf(6)].source === 'quick_check');
    out = learnerPath.recordCheck(e, 6, true, { slot: 1 });
    check('and a later right answer is not taken: the unit is settled', !out.changed && statusOf(e, 6) === 'learn' && learnerPath.planFor(fresh(e)).units[keyOf(6)].asked.length === 1);
    out = learnerPath.recordCheck(e, 2, false, { slot: 3 });
    check('a known unit is not checked again', !out.changed && statusOf(e, 2) === 'known');
    out = learnerPath.recordCheck(e, PLACED, false, { slot: 4 });
    check('an answer on the placed unit changes nothing', !out.changed && statusOf(e, PLACED) === 'learn');

    // Out of questions while still undecided: not checked, so worked.
    const e2 = placedEnrollment(newUser());
    [[1, true], [2, false], [3, true], [4, true]].forEach(([slot, ok]) => learnerPath.recordCheck(e2, 1, ok, { slot }));
    check('a unit still undecided with no question left stays not checked', statusOf(e2, 1) === 'unchecked' && learnerPath.quickChecks(fresh(e2))[0].status === 'unchecked',
      learnerPath.unitBelief(learnerPath.planFor(fresh(e2)).units[keyOf(1)]).p);
    check('and the path walks it, after the units to learn', !walkProblems(e2, grade, units), walkProblems(e2, grade, units));

    // The clock the quick check has: the mode's whole budget less the sitting.
    const t0 = Date.parse('2026-10-22T10:00:00Z');
    const iso = (min) => new Date(t0 + min * 60000).toISOString();
    const user = newUser();
    const ce = newEnrollment(user);
    const session = { unit_mode: 'quick', started_at: iso(14), ended_at: iso(19) };
    const now = t0 + 19 * 60000;
    const left = (deadline) => Math.round((Date.parse(deadline) - now) / 60000 * 10) / 10;
    check('with no subject walk the check gets the budget less the in-grade stage (20 - 5)', left(learnerPath.checkDeadline(ce, session, now)) === 15);
    const walk = db.insert('subject_placements', { user_id: user.id, track_id: TRACK, mode: 'quick', started_at: iso(0), finished_at: iso(10),
      gap_scan: { started_at: iso(10), finished_at: iso(13) } });
    check('with the subject walk and gap scan in the same sitting, it gets what they leave (20 - 10 - 3 - 5)', left(learnerPath.checkDeadline(ce, session, now)) === 2);
    db.update('subject_placements', walk.id, { started_at: iso(-300), finished_at: iso(-200), gap_scan: null });
    check('a subject walk from another day does not count against it', left(learnerPath.checkDeadline(ce, session, now)) === 15);
    check('Accurate has 90 minutes in all', left(learnerPath.checkDeadline(ce, { ...session, unit_mode: 'accurate' }, now)) === 85);
    check('a question needs time left to be asked', learnerPath.checkTimeLeft(new Date(Date.now() + 60000).toISOString()) && !learnerPath.checkTimeLeft(new Date(Date.now() + 5000).toISOString()));
  }

  console.log('\nthe test-out');
  {
    const e = placedEnrollment(newUser());
    // Unit 6 is not checked: a test-out from the path, at any time.
    const asked = [];
    let q = learnerPath.nextTestOut(e, 6);
    check('a test-out of a unit not checked asks it a fresh question', q && q.unit === 6, q);
    for (let i = 0; i < 2; i++) {
      asked.push(q.slot);
      const out = learnerPath.recordCheck(e, 6, true, { slot: q.slot, source: 'test_out' });
      check(`right answer ${i + 1} is not enough`, !out.changed && statusOf(e, 6) === 'unchecked' && out.plan.units[keyOf(6)].test_out === 'pending');
      q = learnerPath.nextTestOut(fresh(e), 6);
    }
    check('the next question is another fresh one', q && !asked.includes(q.slot), q);
    let out = learnerPath.recordCheck(e, 6, true, { slot: asked[0], source: 'test_out' });
    check('the same question answered again does not count', !out.changed);
    out = learnerPath.recordCheck(e, 6, true, { slot: q.slot, source: 'test_out' });
    asked.push(q.slot);
    check('three right answers prove it, from the test-out', out.changed && statusOf(e, 6) === 'known' && out.plan.units[keyOf(6)].source === 'test_out'
      && out.plan.units[keyOf(6)].test_out === 'passed');
    check('no question was asked twice', new Set(asked).size === asked.length);

    const e2 = placedEnrollment(newUser());
    const q1 = learnerPath.nextTestOut(e2, 6);
    learnerPath.recordCheck(e2, 6, true, { slot: q1.slot, source: 'test_out' });
    out = learnerPath.recordCheck(e2, 6, false, { slot: learnerPath.nextTestOut(fresh(e2), 6).slot, source: 'test_out' });
    check('a right then a miss can no longer be proved: the test-out is over and the unit stays on the path, not checked',
      !out.changed && statusOf(e2, 6) === 'unchecked' && out.plan.units[keyOf(6)].test_out === 'failed', out.plan.units[keyOf(6)]);
    check('and it is not offered again', learnerPath.nextTestOut(fresh(e2), 6) === null);
    const e2b = placedEnrollment(newUser());
    out = learnerPath.recordCheck(e2b, 6, false, { slot: learnerPath.nextTestOut(e2b, 6).slot, source: 'test_out' });
    check('a miss first shows a hole: the unit is to learn', out.changed && statusOf(e2b, 6) === 'learn' && out.plan.units[keyOf(6)].test_out === 'failed');

    // A later unit, with knobs that let five questions prove it.
    withKnobs({ ISLAND_PRIOR: 0.85 }, () => {
      const e3 = placedEnrollment(newUser());
      const cands = learnerPath.testOutCandidates(e3).filter((c) => c.unit > PLACED).map((c) => c.unit);
      check('a later unit answered right and never missed is offered, when it can be proved', cands.includes(8) && cands.includes(12) && !cands.includes(9) && !cands.includes(10) && !cands.includes(11), cands);
      const q8 = learnerPath.nextTestOut(e3, 8);
      check('on a question the placement did not ask', q8 && ![0, 1].includes(q8.slot));
      out = learnerPath.recordCheck(e3, 8, true, { slot: q8.slot, source: 'test_out' });
      check('two placement rights and one fresh right prove it', out.changed && statusOf(e3, 8) === 'known');
      out = learnerPath.recordCheck(e3, 9, true, { slot: 2, source: 'test_out' });
      check('an answer on a unit not open to a test-out is not recorded', !out.changed && learnerPath.planFor(fresh(e3)).units[keyOf(9)].asked.length === 2);
      db.update('enrollments', e3.id, { current_level: units[11].start });
      check('a later unit the learner has already started is not offered', !learnerPath.testOutCandidates(fresh(e3)).some((c) => c.unit === 12));
    });
  }

  console.log('\nthe path rule');
  {
    // Units 3, 4, 5 and 7 to learn; 1 and 6 not checked; 2 and 9 known; the rest unseen.
    const e = placedEnrollment(newUser());
    learnerPath.setUnit(e, keyOf(9), 'known', 'manual');
    check('inside a unit the next level is the next level', learnerPath.nextLevelAfter(fresh(e), grade, units[2].start + 2) === units[2].start + 3);
    check('the units to learn lead: after unit 1 comes unit 3, the known unit 2 stepped over', learnerPath.nextLevelAfter(fresh(e), grade, units[0].end) === units[2].start);
    [3, 4].forEach((n) => learnerPath.setUnit(e, keyOf(n), 'done', 'path'));
    check('a unit not checked waits while a unit to learn remains: after unit 5 comes unit 7, not 6', learnerPath.nextLevelAfter(fresh(e), grade, units[4].end) === units[6].start);
    learnerPath.setUnit(e, keyOf(5), 'done', 'path');
    check('with every unit to learn done, the path goes back for the earliest not proved', learnerPath.nextLevelAfter(fresh(e), grade, units[6].end) === units[0].start);
    learnerPath.setUnit(e, keyOf(1), 'done', 'path');
    learnerPath.setUnit(e, keyOf(7), 'done', 'path');
    check('then on to the next not proved, in order', learnerPath.nextLevelAfter(fresh(e), grade, units[0].end) === units[5].start
      && learnerPath.nextLevelAfter(fresh(e), grade, units[6].end) === units[5].start);
    learnerPath.setUnit(e, keyOf(6), 'done', 'path');
    check('stepping over a known unit on the way', learnerPath.nextLevelAfter(fresh(e), grade, units[7].end) === units[9].start, learnerPath.nextLevelAfter(fresh(e), grade, units[7].end));
    const w = placedEnrollment(newUser());
    learnerPath.setUnit(w, keyOf(9), 'known', 'manual');
    check('walking the whole path: every unit not known is worked, learn units first, nothing known entered, and it ends at the end', !walkProblems(w, grade, units), walkProblems(w, grade, units));
    // A catch-up grade (the gap scan's plan: no placed unit): units not checked
    // before and after the confirmed gaps. The gaps lead; the rest come after.
    const cu = newEnrollment(newUser(), { current_level: 1 });
    units.forEach((x, i) => learnerPath.setUnit(cu, x.key, [3, 9].includes(i + 1) ? 'learn' : [5, 6].includes(i + 1) ? 'known' : 'unchecked', 'gap_scan'));
    check('a catch-up leads with its first confirmed gap, not the units not checked before it', learnerPath.firstLevel(fresh(cu), grade) === startOf(3), learnerPath.firstLevel(fresh(cu), grade));
    check('then the next gap', learnerPath.nextLevelAfter(fresh(cu), grade, units[2].end) === units[8].start);
    check('and every unit not checked is still worked after the gaps, none left behind', !walkProblems(cu, grade, units), walkProblems(cu, grade, units));
    check('once everything is worked the path ends at its end', learnerPath.nextLevelAfter(fresh(w), grade, grade.pathLength - 1) === grade.pathLength);
  }

  console.log('\nadvancing on the path');
  {
    const user = newUser();
    const e = placedEnrollment(user);
    learnerPath.setUnit(e, keyOf(4), 'known', 'quick_check');
    learnerPath.setUnit(e, keyOf(5), 'known', 'test_out');
    learnerPath.setUnit(e, keyOf(6), 'known', 'quick_check');
    // Standing on unit 3's checkpoint, the last level of a unit to learn.
    db.update('enrollments', e.id, { current_level: units[2].end, levels_completed: 10 });
    const kind = curriculum.checkpointKind(grade, units[2].end);
    check('a unit ends on its checkpoint', curriculum.isCheckpoint(curriculum.levelKind(units[2].end, grade.pathLength, grade)), kind);
    const cleared = mastery.clearCheckpoint(fresh(e), grade, kind);
    const after = fresh(e);
    check('passing it moves the learner over the known units to the placed unit', cleared.level === units[6].start && after.current_level === units[6].start, cleared.level);
    check('the unit is done', statusOf(e, 3) === 'done' && learnerPath.planFor(after).units[keyOf(3)].source === 'path');
    check('the checkpoint passed is recorded at its own level', !!(after.checkpoints_cleared || {})[units[2].end]);
    check('the known units\' checkpoints are recorded as cleared, with what proved them',
      !!after.checkpoints_cleared[units[3].end] && !!after.checkpoints_cleared[units[4].end] && !!after.checkpoints_cleared[units[5].end]
      && after.checkpoint_sources[units[3].end] === 'unit_plan:quick_check' && after.checkpoint_sources[units[4].end] === 'unit_plan:test_out',
      { cleared: after.checkpoints_cleared, sources: after.checkpoint_sources });
    check('a level stepped over is not counted as completed', after.levels_completed === 11);
    check('and the attempt count is reset', (after.checkpoint_attempts || 0) === 0);

    db.update('enrollments', e.id, { current_level: units[6].start + 3 });
    check('inside a unit the learner moves by one', mastery.advance(fresh(e), grade) === units[6].start + 4);

    db.update('enrollments', e.id, { current_level: units[6].end });
    mastery.clearCheckpoint(fresh(e), grade, curriculum.checkpointKind(grade, units[6].end));
    check('finishing the placed unit marks it done', statusOf(e, PLACED) === 'done');
    check('with no unit left to learn, the path goes back for the unit not checked', fresh(e).current_level === units[0].start, fresh(e).current_level);
    learnerPath.setUnit(e, keyOf(1), 'known', 'test_out');
    db.update('enrollments', e.id, { current_level: units[6].end });
    check('and once that is proved, on to the next unseen unit', learnerPath.nextLevelAfter(fresh(e), grade, units[6].end) === units[7].start);
    db.update('enrollments', e.id, { current_level: units[7].start });

    learnerPath.setUnit(e, keyOf(9), 'known', 'test_out');
    mastery.recordLevelCleared({ userId: user.id, enrollmentId: e.id, level: units[7].end, accuracy: 1, grade });
    mastery.recordLevelCleared({ userId: user.id, enrollmentId: e.id, level: units[9].start, accuracy: 1, grade });
    check('the clean run carries over a stepped-over unit', mastery.streakFor(user.id, e.id).run === 2, mastery.streakFor(user.id, e.id).run);

    const lessonLevel = startOf(8);
    db.update('enrollments', e.id, { current_level: lessonLevel });
    const done = mastery.completeLesson(user.id, fresh(e), grade);
    check('a lesson finished on the path moves to the next level', done.advanced && done.level === lessonLevel + 1, done.level);

    // A unit not checked is worked, and marked done at its end like any other.
    const e2 = placedEnrollment(newUser());
    db.update('enrollments', e2.id, { current_level: units[0].end });
    mastery.clearCheckpoint(fresh(e2), grade, curriculum.checkpointKind(grade, units[0].end));
    check('finishing a unit not checked marks it done, and the path goes to the earliest unit to learn', statusOf(e2, 1) === 'done' && fresh(e2).current_level === units[2].start);
  }

  console.log('\nopening a known unit to review it');
  {
    // eslint-disable-next-line global-require
    const { mayOpenLevel, reviewKind } = require('../routes/learn');
    check('a level ahead in a known unit may be opened', mayOpenLevel(200, 130, false, true) === true);
    check('a level ahead in any other unit may not', mayOpenLevel(200, 130, false, false) === false && mayOpenLevel(200, 130, false) === false);
    check('behind, and with the skip permission, are unchanged', mayOpenLevel(10, 130, false) && mayOpenLevel(400, 130, true));
    const e = placedEnrollment(newUser());
    learnerPath.setUnit(e, keyOf(9), 'known', 'manual');
    check('the unit a level sits in is found with its status', (learnerPath.unitAt(fresh(e), units[8].start + 1) || {}).status === 'known'
      && (learnerPath.unitAt(fresh(e), units[9].start) || {}).status === 'unseen' && (learnerPath.unitAt(fresh(e), units[0].start) || {}).status === 'unchecked');

    // What the session page is told about a level opened for review.
    db.update('enrollments', e.id, { current_level: units[6].start });
    learnerPath.setUnit(e, keyOf(4), 'done', 'path');
    // A plan written before `unchecked` existed can still hold an unseen unit
    // behind the learner that nobody worked.
    learnerPath.setUnit(e, keyOf(5), 'unseen', 'manual');
    check('a level in a proved unit is a review of something known', reviewKind(fresh(e), grade, units[1].start + 1) === 'known'
      && reviewKind(fresh(e), grade, units[8].start) === 'known');
    check('a level behind in a unit nobody worked is a skip, not work done', reviewKind(fresh(e), grade, units[4].start + 1) === 'skipped');
    check('a level in a unit worked, to learn or not checked is neither', reviewKind(fresh(e), grade, units[3].start) === null
      && reviewKind(fresh(e), grade, units[2].start) === null && reviewKind(fresh(e), grade, units[0].start) === null);
  }

  console.log('\ncheckpoints between units');
  await betweenUnitChecks();

  console.log('\nprefetching follows the path');
  {
    // eslint-disable-next-line global-require
    const blockLevels = require('../services/block-levels');
    const e = placedEnrollment(newUser());
    learnerPath.setUnit(e, keyOf(8), 'known', 'manual');
    [1, 6].forEach((n) => learnerPath.setUnit(e, keyOf(n), 'known', 'manual'));
    [3, 4, 5].forEach((n) => learnerPath.setUnit(e, keyOf(n), 'done', 'path'));
    const ahead = blockLevels.levelsAhead(fresh(e), grade, units[6].end, 3);
    check('the levels written ahead skip a known unit', JSON.stringify(ahead) === JSON.stringify([units[6].end, units[8].start, units[8].start + 1]), ahead);
    const plain = newEnrollment(newUser());
    check('without a plan they are the next levels', JSON.stringify(blockLevels.levelsAhead(plain, grade, 10, 4)) === JSON.stringify([10, 11, 12, 13]));
    check('and stop at the end of the path', JSON.stringify(blockLevels.levelsAhead(plain, grade, grade.pathLength - 1, 4)) === JSON.stringify([grade.pathLength - 1, grade.pathLength]));
  }

  console.log('\nenrollments the change must leave alone');
  {
    const user = newUser();
    const plain = newEnrollment(user, { current_level: units[2].end });
    check('without a plan the next level is the next level', learnerPath.nextLevelAfter(plain, grade, units[2].end) === units[2].end + 1);
    check('without a plan the learner stands where they are', learnerPath.firstLevel(plain, grade) === units[2].end);
    check('without a plan there are no test-outs and the summary is empty', learnerPath.testOutCandidates(plain).length === 0 && learnerPath.summary(plain).planned === false && learnerPath.summary(plain).units.length === 0);
    const r = mastery.clearCheckpoint(fresh(plain), grade, curriculum.checkpointKind(grade, units[2].end));
    check('a checkpoint passed without a plan moves by one', r.level === units[2].end + 1 && !fresh(plain).checkpoint_sources);
    check('and records the checkpoint at its own level', !!fresh(plain).checkpoints_cleared[units[2].end]);

    // A track whose grades have no unit bank.
    const other = curriculum.TRACKS.map((t) => t.grades.map((g) => ({ t: t.id, g }))).flat()
      .find(({ t, g }) => !unitPlacement.available(t, g.id) && g.pathLength > 40);
    if (!other) {
      console.log('  (skipped: every grade has a unit bank)');
    } else {
      const g = curriculum.getGrade(other.t, other.g.id);
      const e = db.insert('enrollments', { user_id: user.id, track_id: other.t, grade_id: g.id, current_level: 5, level_items: 0, levels_completed: 0, status: 'active' });
      check(`a grade without a bank gets no plan from a placement (${other.t}/${g.id})`, learnerPath.initFromPlacement(e, { unit: 2 }, []) === null && !fresh(e).unit_plan);
      learnerPath.setUnit(e, 'stray', 'known', 'manual');
      check('even a stray plan on it leaves the path linear', learnerPath.nextLevelAfter(fresh(e), g, 5) === 6 && mastery.advance(fresh(e), g) === 6);
      check('and its summary is empty', learnerPath.summary(fresh(e)).planned === false);
    }
  }

  await httpChecks();
}

// ── Checkpoints between units ──────────────────────────────────────────────
/*
 * math add_and_subtract_within_20 puts a Written Task Revision just after a
 * unit: unit 2 ends on the Written Task at 53, the revision is 54, and unit 3
 * starts at 55. The same at 153, 252 and 351. After the last unit (405) come the
 * grade review and the Graduation exam, which are always walked.
 */
async function betweenUnitChecks() {
  const T = 'math';
  const G = 'add_and_subtract_within_20';
  const g = curriculum.getGrade(T, G);
  const us = unitPlacement.unitsFor(T, G);
  const kind = (l) => curriculum.levelKind(l, g.pathLength, g);
  const outside = us ? Array.from({ length: g.pathLength }, (_, i) => i + 1).filter((l) => !us.some((u) => l >= u.start && l <= u.end)) : [];
  const between = outside.filter((l) => l < us[us.length - 1].end);
  if (!us || !between.length) {
    console.log('  (skipped: no grade with a checkpoint between units in the math bank)');
    return;
  }
  const k = (n) => us[n - 1].key;
  const b1 = between[0];
  const unitBefore = (l) => us.findIndex((u) => u.end === l - 1) + 1;
  check(`the first level between units is a checkpoint just after a unit (${b1} after unit ${unitBefore(b1)})`,
    curriculum.isCheckpoint(kind(b1)) && unitBefore(b1) >= 1 && us[unitBefore(b1)].start === b1 + 1, { b1, kind: kind(b1) });
  check('each checkpoint between units covers the unit whose checkpoint it follows', between.every((l) => {
    const c = learnerPath.betweenCovers(g, us, l);
    return c.length === 1 && us[c[0]].end === l - 1;
  }), between.map((l) => [l, learnerPath.betweenCovers(g, us, l)]));
  const tail = outside.filter((l) => l > us[us.length - 1].end);
  check('nothing after the last unit covers anything, the Graduation exam included', tail.length > 0
    && tail.every((l) => learnerPath.betweenCovers(g, us, l).length === 0) && tail.some((l) => kind(l) === 'graduation'));

  let n = 0;
  const enrol = (placed, statuses, extra = {}) => {
    n++;
    const user = db.insert('users', { email: `between-${process.pid}-${n}@example.test`, display_name: 'between', password_hash: 'x' });
    const e = db.insert('enrollments', { user_id: user.id, track_id: T, grade_id: G, current_level: 1, level_items: 0, levels_completed: 0, status: 'active', ...extra });
    learnerPath.initFromPlacement(e, { unit: placed }, []);
    for (const [unit, status] of Object.entries(statuses)) learnerPath.setUnit(e, k(Number(unit)), status, 'test_out');
    return db.byId('enrollments', e.id);
  };
  const u = unitBefore(b1); // the unit the first between checkpoint follows (2)

  // Units on both sides of it known: the path goes straight over it.
  let e = enrol(1, { [u]: 'known', [u + 1]: 'known' });
  check('with the units on both sides known, the path steps over the checkpoint between them', learnerPath.nextLevelAfter(e, g, us[u - 2].end) === us[u + 1].start,
    learnerPath.nextLevelAfter(e, g, us[u - 2].end));
  db.update('enrollments', e.id, { current_level: us[u - 2].end });
  mastery.clearCheckpoint(db.byId('enrollments', e.id), g, curriculum.checkpointKind(g, us[u - 2].end));
  e = db.byId('enrollments', e.id);
  check('passing the checkpoint before them lands on the next unit to work', e.current_level === us[u + 1].start, e.current_level);
  check('and the checkpoint between is recorded as cleared, with what proved its unit',
    !!e.checkpoints_cleared[b1] && e.checkpoint_sources[b1] === 'unit_plan:test_out' && !!e.checkpoints_cleared[us[u - 1].end] && !!e.checkpoints_cleared[us[u].end],
    { cleared: e.checkpoints_cleared, sources: e.checkpoint_sources });
  check('it reads as a known level, open to review', (learnerPath.unitAt(e, b1, g) || {}).status === 'known' && (learnerPath.unitAt(e, b1, g) || {}).between === true);

  // The unit before it is to learn: the learner takes it.
  e = enrol(1, { 1: 'done', [u]: 'learn', [u + 1]: 'known' }, { current_level: us[u - 1].end });
  check('after a unit worked on the path, its follow-up checkpoint is taken', learnerPath.nextLevelAfter(e, g, us[u - 1].end) === b1);
  mastery.clearCheckpoint(db.byId('enrollments', e.id), g, curriculum.checkpointKind(g, us[u - 1].end));
  e = db.byId('enrollments', e.id);
  check('finishing that unit stands the learner on it', e.current_level === b1 && statusIn(e, u, k) === 'done', e.current_level);
  mastery.clearCheckpoint(db.byId('enrollments', e.id), g, curriculum.checkpointKind(g, b1));
  e = db.byId('enrollments', e.id);
  check('and passing it goes on over the known unit after it', e.current_level === us[u + 1].start, e.current_level);

  // Already passed: not sat again.
  e = enrol(1, { 1: 'done', [u]: 'learn', [u + 1]: 'known' }, { checkpoints_cleared: { [b1]: new Date().toISOString() } });
  check('a follow-up checkpoint already passed is not sat again', learnerPath.nextLevelAfter(e, g, us[u - 1].end) === us[u + 1].start, learnerPath.nextLevelAfter(e, g, us[u - 1].end));

  // Units the placement passed but nothing proved are not checked: walked,
  // and the checkpoint between them taken.
  e = enrol(u + 2, { 1: 'learn' }, { current_level: us[0].end });
  check('units the placement passed without proving them are not checked', statusIn(e, u, k) === 'unchecked' && statusIn(e, u + 1, k) === 'unchecked');
  check('they wait for the units to learn', learnerPath.nextLevelAfter(e, g, us[0].end) === us[u + 1].start);
  [1, u + 2].forEach((x) => learnerPath.setUnit(e, k(x), 'done', 'path'));
  check('and are then walked, with the checkpoint between them', learnerPath.nextLevelAfter(db.byId('enrollments', e.id), g, us[u + 1].end) === us[u - 1].start
    && learnerPath.nextLevelAfter(db.byId('enrollments', e.id), g, us[u - 1].end) === b1);

  // An unseen unit after the start: walked, so its checkpoint between is taken.
  e = enrol(1, { [u]: 'unseen', [u + 1]: 'known' });
  check('an unseen unit after the start keeps its checkpoint between', learnerPath.nextLevelAfter(e, g, us[u - 1].end) === b1);

  // Everything known: the path still ends on the grade review and Graduation.
  const all = {};
  us.forEach((_, i) => { all[i + 1] = i > 0 ? 'known' : 'done'; });
  e = enrol(1, all);
  check('with every unit known the path goes to the grade review after the last unit', learnerPath.nextLevelAfter(e, g, us[0].end) === us[us.length - 1].end + 1,
    learnerPath.nextLevelAfter(e, g, us[0].end));
  const grad = tail.find((l) => kind(l) === 'graduation');
  check('and walks to the Graduation exam level by level', learnerPath.nextLevelAfter(e, g, grad - 1) === grad);

  // The whole path walked: nothing to work is left behind, and the checkpoints
  // between units are taken for every unit not known.
  e = enrol(4, { 1: 'known', 2: 'learn', 3: 'unseen', 6: 'known', 7: 'known', 9: 'done', 11: 'known', 12: 'unseen', 15: 'known' });
  check('walking the whole path leaves no unit to work, or a checkpoint for one, behind', !walkProblems(e, g, us), walkProblems(e, g, us));
  e = enrol(5, { 2: 'known', 3: 'learn', 8: 'known', 9: 'unchecked', 10: 'learn', 12: 'known' });
  check('and with units not checked before and after the units to learn', !walkProblems(e, g, us), walkProblems(e, g, us));
}

function statusIn(e, n, key) {
  return (learnerPath.planFor(e).units[key(n)] || {}).status;
}

// ── The routes, over HTTP ─────────────────────────────────────────────────
async function httpChecks() {
  // eslint-disable-next-line global-require
  const placementRoutes = require('../routes/placement');
  const app = express();
  app.use(express.json());
  // Signed in as whoever the test says, without the session store.
  app.use((req, res, next) => { req.user = db.byId('users', Number(req.headers['x-test-user'])) || null; next(); });
  app.use('/api/placement', placementRoutes);
  // eslint-disable-next-line global-require
  app.use('/api', require('../routes/learn'));
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/placement`;
  const call = async (user, method, url, body) => {
    const res = await fetch(base + url, {
      method,
      headers: { 'content-type': 'application/json', 'x-test-user': String(user ? user.id : '') },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  const wrongOf = (q) => q.choices.find((c) => c !== correctAnswer(q));
  // The right answer, read from the bank: the HTTP question carries none.
  function correctAnswer(q) {
    return units[q.unit - 1].questions[q.slot].answer;
  }

  try {
    console.log('\nplacement to path, over HTTP');
    const user = newUser();
    const e = newEnrollment(user, { status: 'placement_pending' });
    let r = await call(user, 'POST', '/start', { enrollment_id: e.id, mode: 'balanced' });
    check('a placement by unit starts', r.status === 201 && r.body.adaptive, r.body);
    // A learner who knows units 1 to 8 and nothing after.
    let item = r.body.items[0];
    for (let guard = 0; item && guard < 100; guard++) {
      const row = db.byId('items', item.id);
      const knows = unitPlacement.pointOf(units[row.unit - 1].questions[row.slot], row.unit) < 8;
      r = await call(user, 'POST', '/answer', { session_id: row.session_id, item_id: row.id, answer: knows ? row.answer : row.choices.find((c) => c !== row.answer) });
      item = r.body.next_item || null;
    }
    const sessionId = db.findOne('sessions', (s) => s.enrollment_id === e.id && s.kind === 'placement').id;
    r = await call(user, 'POST', '/finish', { session_id: sessionId });
    const result = r.body.result;
    check('it finishes with a placed unit', r.status === 200 && result && result.unit >= 1, r.body);
    let row = fresh(e);
    check('finishing writes the unit plan, with the placed unit to learn', learnerPath.planFor(row) && learnerPath.planFor(row).placed_unit === result.unit && statusOf(row, result.unit) === 'learn');
    check('and the learner stands on the earliest unit to learn, as the result says', row.current_level === learnerPath.firstLevel(row, grade) && row.current_level === result.start_level
      && row.current_level <= result.placedLevel, [row.current_level, result.start_level, result.placedLevel]);
    check('the result lists the units to learn and the ones not checked', Array.isArray(result.to_learn) && Array.isArray(result.unchecked) && result.to_learn.includes(result.unit));
    check("the quick check asks every unit not checked, with a clock from the mode's budget", JSON.stringify((row.quick_checks || []).map((c) => c.unit)) === JSON.stringify(result.unchecked.filter((n) => n < result.unit))
      && Date.parse(row.quick_check_deadline_at) > Date.now(), row.quick_checks);

    r = await call(user, 'GET', `/path/${e.id}`);
    check('GET /path answers the summary', r.status === 200 && r.body.summary && r.body.summary.planned && r.body.summary.learn.count >= 1);

    // The quick check: the first unit checked is missed, every other answered right.
    r = await call(user, 'GET', `/quick-check/${e.id}`);
    const checks = (row.quick_checks || []).length;
    if (!checks) {
      console.log('  (no quick check on this walk: the reopen is checked on a hand-written plan below)');
    } else {
      const order = [];
      let q = r.body.question;
      const target = q.unit;
      let n = 0;
      while (q && n++ < 80) {
        order.push(q.unit);
        r = await call(user, 'POST', '/quick-check', { enrollment_id: e.id, unit: q.unit, slot: q.slot, answer: q.unit === target ? wrongOf(q) : correctAnswer(q) });
        q = r.body.question;
      }
      row = fresh(e);
      check('the quick check keeps its shape', r.status === 200 && r.body.summary && Array.isArray(r.body.summary.reopened) && r.body.summary.reopened.includes(target)
        && Array.isArray(r.body.summary.unchecked) && r.body.summary.pending === 0, r.body.summary);
      check('one unit at a time, each until it is decided', order.every((x, i) => i === 0 || x >= order[i - 1]), order);
      check('the unit missed is on the path to learn', statusOf(row, target) === 'learn');
      const passed = (row.quick_checks || []).filter((c) => c.status === 'passed').map((c) => c.unit);
      check('the units answered right are known — each on three right answers or more', passed.length > 0 && passed.every((x) => statusOf(row, x) === 'known'
        && learnerPath.planFor(row).units[keyOf(x)].asked.filter((a) => a.correct).length >= 3), passed);
      check('the learner stands on the earliest unit to learn', row.current_level === learnerPath.firstLevel(row, grade) && statusOf(row, units.findIndex((x) => row.current_level >= x.start && row.current_level <= x.end) + 1) === 'learn',
        [row.current_level, learnerPath.firstLevel(row, grade)]);
      check('when nothing is left to ask the check says it is done', r.body.done === true && r.body.question === null);
      // Working through the reopened unit does not restart the grade from it:
      // the path goes on to the next unit not proved, stepping over the rest.
      db.update('enrollments', e.id, { current_level: units[target - 1].end });
      mastery.clearCheckpoint(fresh(e), grade, curriculum.checkpointKind(grade, units[target - 1].end));
      row = fresh(e);
      const plan = learnerPath.planFor(row);
      const st = (x) => (plan.units[x.key] || {}).status;
      let nextUnit = units.findIndex((x, i) => i !== target - 1 && st(x) === 'learn');
      if (nextUnit < 0) nextUnit = units.findIndex((x, i) => i !== target - 1 && ['unchecked', 'unseen'].includes(st(x)));
      check('after the reopened unit the path goes to the next unit in its order, stepping over the proved ones',
        row.current_level === units[nextUnit].start, { at: row.current_level, expected: units[nextUnit].start, reopened: target });
    }

    // Out of time: the units left are not checked, and nothing more is asked.
    const cUser = newUser();
    const c = placedEnrollment(cUser);
    db.update('enrollments', c.id, { quick_checks: learnerPath.quickChecks(c), quick_check_deadline_at: new Date(Date.now() + 10 * 60000).toISOString() });
    r = await call(cUser, 'GET', `/quick-check/${c.id}`);
    check('with time left the check asks the first unit not checked', r.body.question && r.body.question.unit === 1 && r.body.summary.seconds_left > 500, r.body);
    r = await call(cUser, 'POST', '/quick-check', { enrollment_id: c.id, unit: 1, slot: r.body.question.slot, answer: correctAnswer(r.body.question) });
    check('an answer that does not decide the unit asks it again', r.body.question && r.body.question.unit === 1 && statusOf(c, 1) === 'unchecked', r.body);
    db.update('enrollments', c.id, { quick_check_deadline_at: new Date(Date.now() + 5000).toISOString() });
    r = await call(cUser, 'GET', `/quick-check/${c.id}`);
    check('with too little time left nothing more is asked, and the rest stay not checked', r.body.question === null && r.body.summary.pending === 0
      && JSON.stringify(r.body.summary.unchecked) === JSON.stringify([1, 6]) && statusOf(c, 1) === 'unchecked', r.body.summary);
    r = await call(cUser, 'POST', '/quick-check', { enrollment_id: c.id, unit: 1, slot: 2, answer: 'x' });
    check('an answer to the question already shown is still taken after the clock, and the check is done', r.status === 200 && r.body.done === true && r.body.question === null
      && learnerPath.planFor(fresh(c)).units[keyOf(1)].asked.some((a) => a.slot === 2), r.body);
    r = await call(cUser, 'POST', '/quick-check', { enrollment_id: c.id, unit: 1, slot: 3, answer: 'x' });
    check('but not one that was never shown', r.status === 409 && r.body.done === true);

    // A wrong question, and someone else's enrollment.
    const stranger = newUser();
    r = await call(stranger, 'GET', `/path/${e.id}`);
    check('another account cannot read the plan', r.status === 404);
    r = await call(null, 'GET', `/test-out/${e.id}`);
    check('signed out is refused', r.status === 401);

    console.log('\nthe test-out, over HTTP');
    const tUser = newUser();
    const t = placedEnrollment(tUser);
    r = await call(tUser, 'GET', `/test-out/${t.id}`);
    check('GET /test-out offers the units not checked', r.status === 200 && r.body.question && r.body.question.unit === 1
      && JSON.stringify(r.body.candidates.map((x) => [x.unit, x.status])) === JSON.stringify([[1, 'unchecked'], [6, 'unchecked']]), r.body);
    check('with no answer in the question', r.body.question.answer === undefined && Array.isArray(r.body.question.choices));
    r = await call(tUser, 'GET', `/test-out/${t.id}?unit=6`);
    check('and one unit on its own, for a test-out from the path', r.body.question && r.body.question.unit === 6 && r.body.candidates.length === 1);
    const first = r.body.question;
    r = await call(tUser, 'POST', '/test-out', { enrollment_id: t.id, unit: 6, only_unit: true, slot: first.slot === 4 ? 3 : 4, answer: 'x' });
    check('an answer to a question not being asked is refused', r.status === 409 && r.body.question && r.body.question.slot === first.slot);
    r = await call(tUser, 'POST', '/test-out', { enrollment_id: t.id, unit: 3, slot: 0, answer: 'x' });
    check('so is one on a unit not open to a test-out', r.status === 409);
    r = await call(stranger, 'POST', '/test-out', { enrollment_id: t.id, unit: 6, slot: first.slot, answer: correctAnswer(first) });
    check('another account cannot answer it', r.status === 404);
    // The learner has worked the units to learn before it, and is in unit 6 when they test out of it.
    [3, 4, 5].forEach((x) => learnerPath.setUnit(t, keyOf(x), 'done', 'path'));
    db.update('enrollments', t.id, { current_level: units[5].start + 1 });
    let tq = first;
    const seen = [];
    for (let i = 0; i < 5 && tq; i++) {
      seen.push(tq.slot);
      r = await call(tUser, 'POST', '/test-out', { enrollment_id: t.id, unit: 6, only_unit: true, slot: tq.slot, answer: correctAnswer(tq) });
      tq = r.body.question;
    }
    check('right answers until it is proved — three — each on a fresh question', seen.length === 3 && new Set(seen).size === 3 && r.body.question === null && r.body.summary.passed.includes(6), { seen, body: r.body });
    check('the unit is known, and the learner moved on to the next unit to learn', statusOf(t, 6) === 'known' && fresh(t).current_level === startOf(7), fresh(t).current_level);
    check('a finished test-out says it is done', r.body.done === true);
    r = await call(tUser, 'GET', `/path/${t.id}`);
    check('the summary counts it as known, and the other still not checked', r.body.summary.known.units.some((x) => x.unit === 6) && r.body.summary.unchecked.units.map((x) => x.unit).join() === '1');
    learnerPath.setUnit(t, keyOf(8), 'known', 'manual');

    // The plan route first puts any catch-up offer from the gap scan on the
    // enrollment, and answers regardless if that goes wrong.
    // eslint-disable-next-line global-require
    const gapScan = require('../services/gap-scan');
    const realAttach = gapScan.attachOffers;
    const calls = [];
    gapScan.attachOffers = (userId, enrollment) => {
      calls.push([userId, enrollment && enrollment.id]);
      learnerPath.planFor(fresh(enrollment)).catch_up.push({ grade_id: 'earlier', unit_keys: ['x'], status: 'offered', enrollment_id: null });
    };
    r = await call(tUser, 'GET', `/path/${t.id}`);
    check('GET /path attaches the catch-up offers before answering', calls.length === 1 && calls[0][0] === tUser.id && calls[0][1] === t.id
      && r.body.summary.catch_up.some((c) => c.grade_id === 'earlier'), { calls, catch_up: r.body.summary.catch_up });
    gapScan.attachOffers = () => { throw new Error('boom'); };
    const warn = console.warn;
    console.warn = () => {};
    r = await call(tUser, 'GET', `/path/${t.id}`);
    console.warn = warn;
    check('and still answers when attaching throws', r.status === 200 && r.body.summary.planned);
    gapScan.attachOffers = realAttach;

    // The level path itself (routes/learn.js): each level carries its unit's
    // status, and a known unit ahead is open to review.
    const pathRes = await fetch(base.replace('/api/placement', `/api/path/${t.id}`), { headers: { 'x-test-user': String(tUser.id) } });
    const pathBody = await pathRes.json();
    const node = (level) => (pathBody.nodes || []).find((x) => x.level === level) || {};
    check('the path marks a known unit ahead as reachable for review', pathRes.status === 200
      && node(units[7].start + 1).unit_status === 'known' && node(units[7].start + 1).reachable === true && node(units[7].start + 1).unit_number === 8,
      node(units[7].start + 1));
    check('a unit not checked says so, with its test-out on offer', node(units[0].start).unit_status === 'unchecked' && node(units[0].start).unit_can_test_out === true
      && node(units[2].start).unit_can_test_out === false, node(units[0].start));
    check('and an unseen unit ahead as still locked', node(units[8].start).unit_status === 'unseen' && node(units[8].start).reachable === false && node(units[8].start).state === 'locked');

    console.log('\nthe old quick check, for an enrollment without a plan');
    const oUser = newUser();
    const oldChecks = [{ unit: 2, key: keyOf(2), slots: [1, 2], status: 'pending', misses: 0 }, { unit: 4, key: keyOf(4), slots: [0, 3], status: 'pending', misses: 0 }];
    const o = newEnrollment(oUser, { current_level: startOf(6), placed_unit: 6, quick_checks: oldChecks });
    for (const slot of [1, 2]) {
      const q = { unit: 2, slot, choices: unitPlacement.itemFor(TRACK, GRADE, 2, slot).choices };
      r = await call(oUser, 'POST', '/quick-check', { enrollment_id: o.id, unit: 2, slot, answer: wrongOf(q) });
    }
    check('without a plan a reopened unit still moves the start back to it', fresh(o).current_level === startOf(2) && !fresh(o).unit_plan, fresh(o).current_level);
    check('and advancing from there is one level at a time', mastery.advance(fresh(o), grade) === startOf(2) + 1);
  } finally {
    server.close();
  }
}

main().catch((err) => { failures++; console.log(`  FAIL the test threw — ${err && err.stack}`); }).finally(() => {
  db.flush();
  setTimeout(() => {
    try { fs.unlinkSync(tmp); } catch { /* gone */ }
    console.log(`\n${failures ? `${failures} failure(s)` : 'all learner path checks passed'}`);
    process.exit(failures ? 1 : 0);
  }, 400);
});
