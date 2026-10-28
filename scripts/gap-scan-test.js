/**
 * Tests for the earlier-grade gap scan and its catch-up offer
 * (services/gap-scan.js), on evidence model v2 (the shared unitBelief in
 * services/learner-path.js).
 *
 *   node scripts/gap-scan-test.js
 *
 * Runs on its own throwaway data file and on English, whose questions and unit
 * bank are in source control, so it needs no key and touches nothing real.
 * Time is passed in, so every run asks the same questions in the same order.
 * The model's knobs are pinned to the spec's starting values, so a tuning run
 * elsewhere does not move these checks.
 */
const os = require('os');
const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'test';
const tmp = path.join(os.tmpdir(), `gap-scan-test-${process.pid}.json`);
process.env.DB_FILE = tmp;
Object.assign(process.env, { HOLE_PRIOR: '0.15', ISLAND_PRIOR: '0.3', SLIP: '0.05', LUCK: '0.15', KNOWN_AT: '0.985', LEARN_AT: '0.35' });

const db = require('../config/db');
const rules = require('../config/subject-placement');
const adaptive = require('../services/adaptive-placement');
const unitPlacement = require('../services/unit-placement');
const gapScan = require('../services/gap-scan');
const learnerPath = require('../services/learner-path');
const router = require('../routes/gap-scan');

let failures = 0;
function check(label, ok, detail) {
  if (ok) { console.log(`  ok   ${label}`); return; }
  failures++;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
}

const TRACK = 'english';
const gradeIds = rules.gradesFor(TRACK);
const G = 8; // the recommended grade
const T0 = Date.parse('2026-10-22T12:00:00.000Z');
const MIN = 60000;

function makeUser(tag) {
  return db.insert('users', { email: `gapscan-${tag}-${process.pid}@example.test`, display_name: `gap scan ${tag}`, password_hash: 'x' });
}

/** A finished subject placement: started `used` minutes before T0, finished at T0. */
function walk(userId, { mode = 'quick', used = 9, answered = [], track = TRACK } = {}) {
  const ids = rules.gradesFor(track);
  return db.insert('subject_placements', {
    user_id: userId,
    track_id: track,
    grade_ids: ids,
    mode,
    started_at: new Date(T0 - used * MIN).toISOString(),
    finished_at: new Date(T0).toISOString(),
    deadline_at: mode ? new Date(T0 - used * MIN + (adaptive.MODES[mode] || { minutes: 0 }).minutes * MIN).toISOString() : null,
    answered,
    scores: [],
    recommended_grade_id: ids[Math.min(G, ids.length - 1)],
  });
}

function enroll(userId, gradeId, extra = {}) {
  return db.insert('enrollments', {
    user_id: userId, track_id: TRACK, grade_id: gradeId, target_level: 100, current_level: 1,
    level_items: 0, levels_completed: 0, xp: 0, status: 'placement_pending', pending_checkpoint: null, placed_at: null, ...extra,
  });
}

function wrongOf(item) {
  return item.choices.find((c) => c !== item.answer);
}

/**
 * Answer a walk as a learner who knows everything except `gaps` ("gradeId:unit").
 * `extended` answers the keep-checking walk instead of the scan.
 */
function run(userId, outcome, gaps, { now = T0, step = 0, extended = false } = {}) {
  let v = gapScan.view(TRACK, extended ? outcome.walk : outcome.scan, now, outcome.scan);
  const asked = [];
  let t = now;
  let guard = 0;
  while (!v.done && guard++ < 100) {
    const q = v.question;
    const item = unitPlacement.itemFor(TRACK, q.grade_id, q.unit, q.slot);
    const knows = !gaps.includes(`${q.grade_id}:${q.unit}`);
    asked.push({ grade_id: q.grade_id, unit: q.unit, slot: q.slot, knows });
    t += step;
    const given = { grade_id: q.grade_id, unit: q.unit, slot: q.slot, answer: knows ? item.answer : wrongOf(item) };
    const out = extended ? gapScan.answerExtended(userId, TRACK, given, t) : gapScan.answer(userId, TRACK, given, t);
    if (out.error) { v = { done: true, error: out.error }; break; }
    v = gapScan.view(TRACK, extended ? out.walk : out.scan, t, out.scan);
  }
  return { v, asked };
}

const units3 = unitPlacement.unitsFor(TRACK, gradeIds[3]);
const unitsBelow = unitPlacement.unitsFor(TRACK, gradeIds[G - 1]);
const half = gapScan.unitAt(units3, 0.5);
const gapA = `${gradeIds[3]}:${half}`; // a hole the placement's miss points at
const gapB = `${gradeIds[G - 1]}:${unitsBelow.length}`; // a hole in the grade just below
const scanOf = (userId) => db.findOne('subject_placements', (p) => p.user_id === userId).gap_scan;

console.log('\nthe belief');
{
  const k = learnerPath.beliefKnobs();
  check('the shared model starts a unit below the grade at 1 - HOLE_PRIOR', Math.abs(learnerPath.unitBelief([], { prior: 'past' }).p - (1 - k.HOLE_PRIOR)) < 1e-9);
  const one = gapScan.beliefOf([{ correct: true, guess: 0.25 }], 1);
  check('one right answer never clears a unit on its own', one.decision === null && one.p < k.KNOWN_AT, one);
  const three = gapScan.beliefOf([1, 2, 3].map(() => ({ correct: true, guess: 0.25 })), 3);
  check('enough right answers make it known, by the numbers', three.decision === 'known', three);
  check('a placement miss lowers the belief but decides nothing without the unit\'s own question', gapScan.beliefOf([{ correct: false, guess: 0.25 }], 0).decision === null
    && gapScan.beliefOf([{ correct: false, guess: 0.25 }], 0).p < 1 - k.HOLE_PRIOR);
  check('a miss on the unit\'s own question counts against it', gapScan.beliefOf([{ correct: false, guess: 0.25 }], 1).decision === 'learn');
}

console.log('\ncandidates from the subject placement');
{
  check('fraction 0 is the first unit, just under 1 the last', gapScan.unitAt(units3, 0) === 1 && gapScan.unitAt(units3, 0.9999) === units3.length);
  const lastEnd = units3[units3.length - 1].end;
  const level = units3[0].start + 0.5 * (lastEnd - units3[0].start + 1);
  check('a fraction maps to the unit holding that share of the levels', level >= units3[half - 1].start && level < units3[half - 1].end + 1, { half, level });

  const evidence = [
    { pos: 3.5, guess: 0.25, correct: false }, // a miss three grades down
    { pos: 7.1, guess: 0.25, correct: true }, // a right answer early in the grade below
    { pos: 2.3, guess: 0.25, correct: true }, // a right answer further down: no reason to look
    { pos: 8.4, guess: 0.25, correct: false }, // a miss in the recommended grade itself: not an earlier gap
  ];
  const c = gapScan.candidatesFor(TRACK, G, evidence);
  const missUnit = c.find((x) => x.grade_id === gradeIds[3]);
  check('a wrong answer below the grade maps to its grade and unit, as evidence', missUnit && missUnit.unit === half && missUnit.source === 'placement_miss' && missUnit.prior.length === 1, missUnit);
  check('a right answer alone, below the grade under it, is not a candidate', !c.some((x) => x.grade_id === gradeIds[2]));
  check('a miss in the recommended grade is not a catch-up candidate', !c.some((x) => x.grade_id === gradeIds[G]));
  check('every unit of the grade below is a candidate (a mapped right answer proves nothing)', c.filter((x) => x.grade_id === gradeIds[G - 1]).length === unitsBelow.length);
  check('the unit with a placement miss is asked first', c[0] === missUnit, c.slice(0, 3).map((x) => [x.grade_id, x.unit, x.p]));
  check('then the grade below, latest unit first', c[1].grade_id === gradeIds[G - 1] && c[1].unit === unitsBelow.length, c[1]);
  check('nothing below the first grade', gapScan.candidatesFor(TRACK, 0, evidence).length === 0);
}

console.log('\nthe clock');
{
  for (const mode of ['quick', 'balanced', 'accurate']) {
    const total = gapScan.totalMinutes(mode);
    for (const used of [0, 5, 12, adaptive.MODES[mode].minutes]) {
      const b = gapScan.budgetFor({ mode, placement: { mode, started_at: new Date(T0 - used * MIN).toISOString(), finished_at: new Date(T0).toISOString() }, enrollment: null, now: T0 });
      const whole = b.subject_minutes_used + b.minutes + b.unit_minutes;
      check(`${mode}, subject walk took ${used} min: the whole placement stays within ${total} min`, whole <= total + 1e-9 && b.max_questions * gapScan.SECONDS_PER_QUESTION <= b.minutes * 60 + 1e-9, b);
    }
  }
  check('the whole budgets are Quick 20, Balanced 45, Accurate 90', gapScan.totalMinutes('quick') === 20 && gapScan.totalMinutes('balanced') === 45 && gapScan.totalMinutes('accurate') === 90);
  const full = gapScan.budgetFor({ mode: 'quick', placement: { mode: null, started_at: new Date(T0 - 60 * MIN).toISOString(), finished_at: new Date(T0).toISOString() }, enrollment: null, now: T0 });
  check('after the untimed full climb the scan gets only its own cap', full.minutes === gapScan.SCAN.quick.maxMinutes && full.total_minutes === null, full);

  const u = makeUser('clock');
  const session = db.insert('sessions', { user_id: u.id, kind: 'placement', started_at: new Date(T0 - 3 * MIN).toISOString(), ended_at: new Date(T0).toISOString() });
  const e = enroll(u.id, gradeIds[G], { placement_session_id: session.id });
  const ran = gapScan.budgetFor({ mode: 'quick', placement: { mode: 'quick', started_at: new Date(T0 - 13 * MIN).toISOString(), finished_at: new Date(T0).toISOString() }, enrollment: e, now: T0 });
  check('a finished in-grade placement counts its real minutes, not its whole clock', ran.unit_stage_ran && ran.unit_minutes === 3 && ran.minutes === 4, ran);

  const spent = makeUser('spent');
  walk(spent.id, { mode: 'quick', used: 14, answered: [{ pos: 3.5, guess: 0.25, correct: false }] });
  const none = gapScan.start(spent.id, { trackId: TRACK, mode: 'quick', gradeId: gradeIds[G] }, T0);
  check('a quick walk that used its whole 14 minutes leaves no scan', none.scan.finished_at && none.scan.asked.length === 0 && !none.scan.current && none.scan.budget.minutes === 0, none.scan.budget);
  check('and every candidate is unchecked, none known', none.scan.candidates.every((c) => c.status === 'unchecked') && none.scan.gaps.length === 0);

  // One minute left: two questions at most, and the clock stops it, not a guess.
  const tight = makeUser('tight');
  walk(tight.id, { mode: 'quick', used: 13, answered: [{ pos: 3.5, guess: 0.25, correct: false }] });
  const t = gapScan.start(tight.id, { trackId: TRACK, mode: 'quick', gradeId: gradeIds[G] }, T0);
  check('with a minute left the scan asks', !t.scan.finished_at && t.scan.max_questions === 2, t.scan.budget);
  const q = t.scan.current;
  const item = unitPlacement.itemFor(TRACK, q.grade_id, q.unit, q.slot);
  const late = gapScan.answer(tight.id, TRACK, { ...q, answer: item.answer }, T0 + 45000);
  check('an answer too late for another question ends the scan on the clock', late.scan.finished_at && late.scan.stop_reason === 'the clock ran out' && late.scan.asked.length === 1, late.scan.stop_reason);
  const c = late.scan.candidates.find((x) => x.grade_id === q.grade_id && x.unit === q.unit);
  check('a unit left undecided by the clock is unchecked: not a gap, not known', c.status === 'unchecked' && late.scan.gaps.length === 0, c.status);
}

console.log('\nthe scan walk');
let learner;
let main;
{
  learner = makeUser('walk');
  walk(learner.id, { mode: 'quick', used: 9, answered: [{ pos: 3.5, guess: 0.25, correct: false }, { pos: 7.1, guess: 0.25, correct: true }] });
  main = enroll(learner.id, gradeIds[G]);
  const started = gapScan.start(learner.id, { trackId: TRACK, mode: 'quick', gradeId: gradeIds[G] }, T0);
  check('the first question is from the likeliest gap, with no answer sent', started.scan.current.grade_id === gradeIds[3] && gapScan.view(TRACK, started.scan, T0).question.answer === undefined);
  check('a quick scan with 4 minutes asks at most 8', started.scan.max_questions === 8 && started.scan.budget.minutes === 4, started.scan.budget);
  const again = gapScan.start(learner.id, { trackId: TRACK, mode: 'quick', gradeId: gradeIds[G] }, T0 + 1000);
  check('starting again resumes the same scan', again.resumed && JSON.stringify(again.scan.current) === JSON.stringify(started.scan.current));
  check('an answer to a question not being asked is refused', gapScan.answer(learner.id, TRACK, { grade_id: gradeIds[3], unit: 99, slot: 0, answer: 'x' }, T0).status === 409);

  const { v, asked } = run(learner.id, started, [gapA, gapB], { step: 20000 });
  const keys = asked.map((a) => `${a.grade_id}:${a.unit}:${a.slot}`);
  check('it never asks the same question twice', new Set(keys).size === keys.length, keys);
  check('it stops at its question cap', asked.length === 8, asked.length);
  check('a round at a time: no unit gets a second question while another has none', new Set(asked.map((a) => `${a.grade_id}:${a.unit}`)).size === asked.length);
  check('both planted gaps are found, each on a miss of its own question', v.done && v.gaps.length === 2
    && v.gaps[0].grade_id === gradeIds[3] && v.gaps[0].units[0] === half
    && v.gaps[1].grade_id === gradeIds[G - 1] && v.gaps[1].units[0] === unitsBelow.length, v.gaps);
  check('and nothing the learner knows is called a gap', v.gaps.every((g) => g.unit_keys.length === 1));
  const scan = scanOf(learner.id);
  const rightOnce = scan.candidates.filter((c) => c.asked === 1 && c.right === 1);
  check('a unit answered right once is not cleared: it ends unchecked', rightOnce.length > 0 && rightOnce.every((c) => c.status === 'unchecked'), rightOnce.map((c) => c.status));
  check('nothing is known after one question each', !scan.candidates.some((c) => c.status === 'known'));
  check('the offer names only the gaps, their time, and how much is unchecked', v.gaps.every((g) => g.titles.length === 1 && g.minutes >= 5 && g.minutes % 5 === 0
    && g.known_count === 0 && Number.isInteger(g.unchecked_count)) && v.gaps[1].unchecked_count === unitsBelow.length - 1, v.gaps);

  // A unit the placement missed, then answered right on its own question, stays open.
  const one = makeUser('one');
  walk(one.id, { mode: 'accurate', used: 30, answered: [{ pos: 3.5, guess: 0.25, correct: false }] });
  const s1 = gapScan.start(one.id, { trackId: TRACK, mode: 'accurate', gradeId: gradeIds[G] }, T0);
  const first = s1.scan.current;
  const it1 = unitPlacement.itemFor(TRACK, first.grade_id, first.unit, first.slot);
  const o = gapScan.answer(one.id, TRACK, { ...first, answer: it1.answer }, T0 + 20000);
  const c1 = o.scan.candidates.find((c) => c.grade_id === first.grade_id && c.unit === first.unit);
  check('a placement miss then one right answer leaves the unit undecided', c1.status === 'open' && c1.right === 1, c1);
  check('and the scan moves on to units not yet asked before asking it again', !(o.scan.current.grade_id === first.grade_id && o.scan.current.unit === first.unit));
}

console.log('\nthe offer: accept and decline');
let earlierId;
{
  let plan = learnerPath.planFor(db.byId('enrollments', main.id));
  check('the gaps are offered on the recommended grade\'s enrollment', plan && plan.catch_up.length === 2 && plan.catch_up.every((e) => e.status === 'offered' && e.enrollment_id === null), plan && plan.catch_up);
  check('each offer carries its grade\'s name', plan.catch_up.every((e) => e.grade_name && e.grade_name === rules.gradeName(TRACK, e.grade_id)), plan.catch_up);
  db.update('enrollments', main.id, { unit_plan: { ...plan, catch_up: plan.catch_up.map(({ grade_name: _drop, ...e }) => e) } });
  const backfilled = gapScan.attachOffers(learner.id, db.byId('enrollments', main.id));
  check('an offer without a grade name is given one on read, and it is stored', backfilled.catch_up.every((e) => e.grade_name)
    && learnerPath.planFor(db.byId('enrollments', main.id)).catch_up.every((e) => e.grade_name === rules.gradeName(TRACK, e.grade_id)));
  const again = gapScan.attachOffers(learner.id, db.byId('enrollments', main.id));
  check('attaching again changes nothing', JSON.stringify(again.catch_up) === JSON.stringify(backfilled.catch_up));

  const gapKey = units3[half - 1].key;
  const yes = gapScan.decide(learner.id, db.byId('enrollments', main.id), gradeIds[3], true, T0 + 5 * MIN);
  const earlier = yes.catch_up_enrollment;
  earlierId = earlier.id;
  check('accepting creates the earlier grade\'s enrollment', earlier && earlier.grade_id === gradeIds[3] && earlier.user_id === learner.id && earlier.status === 'active');
  const ep = learnerPath.planFor(earlier);
  const statuses = units3.map((u) => ep.units[u.key] && ep.units[u.key].status);
  check('the gap unit is learn, and every other unit unchecked, never known', ep.units[gapKey].status === 'learn'
    && statuses.filter((s) => s === 'unchecked').length === units3.length - 1 && !statuses.includes('known'), statuses);
  check('every unit sourced to the gap scan', units3.every((u) => ep.units[u.key].source === 'gap_scan'));
  check('the gap unit carries the scan\'s miss, and the question asked', ep.units[gapKey].evidence.wrong === 1 && ep.units[gapKey].asked.filter((a) => a.source === 'gap_scan').length === 1, ep.units[gapKey]);
  check('the catch-up leads with the gap: the learner stands on its first lesson', earlier.current_level === unitPlacement.startLevelOf(TRACK, gradeIds[3], units3[half - 1]), earlier.current_level);
  plan = learnerPath.planFor(db.byId('enrollments', main.id));
  const a = plan.catch_up.find((e) => e.grade_id === gradeIds[3]);
  check('the offer is marked accepted, pointing at that enrollment', a.status === 'accepted' && a.enrollment_id === earlier.id);
  const twice = gapScan.decide(learner.id, db.byId('enrollments', main.id), gradeIds[3], true, T0 + 6 * MIN);
  check('accepting twice makes no second enrollment', twice.already && db.find('enrollments', (e) => e.user_id === learner.id && e.grade_id === gradeIds[3]).length === 1);
  check('a grade nobody offered is refused', gapScan.decide(learner.id, db.byId('enrollments', main.id), gradeIds[1], true).status === 404);
}

console.log('\nkeep checking');
{
  const below = gradeIds[G - 1];
  check('only a grade below the recommended one', gapScan.startExtended(learner.id, { trackId: TRACK, gradeId: gradeIds[G] }, T0).status === 400);
  const blocked = makeUser('blocked');
  walk(blocked.id, { mode: 'accurate', used: 30 });
  gapScan.start(blocked.id, { trackId: TRACK, mode: 'accurate', gradeId: gradeIds[G] }, T0);
  check('not while the scan itself is still running', gapScan.startExtended(blocked.id, { trackId: TRACK, gradeId: below }, T0).status === 409);

  const before = scanOf(learner.id);
  const scanAsked = before.asked.map((x) => `${x.grade_id}:${x.unit}:${x.slot}`);
  const ext = gapScan.startExtended(learner.id, { trackId: TRACK, gradeId: below }, T0 + 30 * MIN);
  check('it runs with no clock and a question cap', ext.walk.deadline_at === null && ext.walk.max_questions <= gapScan.EXTENDED_MAX_QUESTIONS && ext.walk.max_questions > 0, ext.walk.max_questions);
  check('it leaves out the unit the scan already decided', !ext.walk.candidates.some((c) => c.unit === unitsBelow.length));
  check('and starting it again resumes it', gapScan.startExtended(learner.id, { trackId: TRACK, gradeId: below }, T0 + 31 * MIN).resumed);
  const later = T0 + 5 * 60 * MIN; // hours later: no clock to run out
  const { v, asked } = run(learner.id, ext, [gapA, gapB], { now: later, step: 20000, extended: true });
  const keys = asked.map((x) => `${x.grade_id}:${x.unit}:${x.slot}`);
  check('it never repeats a question, its own or the scan\'s', new Set(keys).size === keys.length && !keys.some((k) => scanAsked.includes(k)));
  check('it stays within its cap', asked.length <= gapScan.EXTENDED_MAX_QUESTIONS, asked.length);
  const after = scanOf(learner.id);
  const knownNow = after.candidates.filter((c) => c.grade_id === below && c.status === 'known');
  check('units answered right often enough are now known', v.done && knownNow.length > 0 && knownNow.every((c) => c.right >= 3 && c.wrong === 0), knownNow.map((c) => [c.unit, c.right]));
  check('the gap the scan found is still a gap', after.candidates.find((c) => c.grade_id === below && c.unit === unitsBelow.length).status === 'learn');
  const g = v.gaps.find((x) => x.grade_id === below);
  check('the offer now says how much of that grade is known', g && g.known_count === knownNow.length && g.unchecked_count === unitsBelow.length - 1 - knownNow.length, g);
  const offer = learnerPath.planFor(db.byId('enrollments', main.id)).catch_up.find((e) => e.grade_id === below);
  check('and the waiting offer is updated, still naming only the gap', offer.status === 'offered' && offer.unit_keys.length === 1 && offer.unchecked_count === g.unchecked_count, offer);

  // Accepting now puts the proved units on the path as known.
  const yes = gapScan.decide(learner.id, db.byId('enrollments', main.id), below, true, later);
  const ep = learnerPath.planFor(yes.catch_up_enrollment);
  check('accepting after keep-checking: gap learn, proved units known, the rest unchecked',
    unitsBelow.every((u, i) => {
      const s = ep.units[u.key].status;
      const c = after.candidates.find((x) => x.grade_id === below && x.unit === i + 1);
      return c && c.status === 'learn' ? s === 'learn' : c && c.status === 'known' ? s === 'known' : s === 'unchecked';
    }), unitsBelow.map((u) => ep.units[u.key].status));

  // Keep checking the grade already accepted: the accepted path follows.
  const ext3 = gapScan.startExtended(learner.id, { trackId: TRACK, gradeId: gradeIds[3] }, later);
  check('keep checking a grade the scan only glanced at covers all its other units', ext3.walk.candidates.length === units3.length - 1, ext3.walk.candidates.length);
  const hole2 = `${gradeIds[3]}:1`;
  run(learner.id, ext3, [gapA, hole2], { now: later, step: 20000, extended: true });
  const ep3 = learnerPath.planFor(db.byId('enrollments', earlierId));
  check('a new gap found there is added to the accepted catch-up and its path', ep3.units[units3[0].key].status === 'learn'
    && learnerPath.planFor(db.byId('enrollments', main.id)).catch_up.find((e) => e.grade_id === gradeIds[3]).unit_keys.includes(units3[0].key), ep3.units[units3[0].key]);
  check('and units it proved become known on that path', units3.some((u) => ep3.units[u.key].status === 'known'));
}

console.log('\ndecline, retake and done');
{
  const u = makeUser('decline');
  walk(u.id, { mode: 'quick', used: 9, answered: [{ pos: 3.5, guess: 0.25, correct: false }] });
  const m = enroll(u.id, gradeIds[G]);
  const s = gapScan.start(u.id, { trackId: TRACK, mode: 'quick', gradeId: gradeIds[G] }, T0);
  run(u.id, s, [gapA, gapB], { step: 20000 });
  const no = gapScan.decide(u.id, db.byId('enrollments', m.id), gradeIds[G - 1], false, T0 + 7 * MIN);
  check('declining marks the offer declined and makes no enrollment', no.entry.status === 'declined' && !db.findOne('enrollments', (e) => e.user_id === u.id && e.grade_id === gradeIds[G - 1]));

  const row = db.findOne('subject_placements', (p) => p.user_id === u.id);
  const firstAsked = row.gap_scan.asked.map((x) => `${x.grade_id}:${x.unit}:${x.slot}`);
  db.update('subject_placements', row.id, { started_at: new Date(T0 + 10 * MIN).toISOString(), finished_at: new Date(T0 + 19 * MIN).toISOString() });
  const between = gapScan.stateFor(u.id, TRACK, T0 + 19 * MIN);
  check('after a retake, state does not hand back the old walk\'s scan', between.scan === null && between.offers.length === 0, between.scan);
  check('nor can the old scan be answered', gapScan.answer(u.id, TRACK, { grade_id: gradeIds[3], unit: 1, slot: 0, answer: 'x' }, T0 + 19 * MIN).status === 404);
  const re = gapScan.start(u.id, { trackId: TRACK, mode: 'quick', gradeId: gradeIds[G] }, T0 + 19 * MIN);
  check('a retaken placement starts a fresh scan', !re.resumed && re.scan.asked.length === 0);
  const { v: v2, asked: asked2 } = run(u.id, re, [gapA, gapB], { now: T0 + 19 * MIN, step: 20000 });
  const overlap = asked2.map((x) => `${x.grade_id}:${x.unit}:${x.slot}`).filter((k) => firstAsked.includes(k));
  check('and asks none of the questions the first scan asked', overlap.length === 0, overlap);
  check('it still finds the gap the learner declined', v2.done && v2.gaps.some((g) => g.grade_id === gradeIds[G - 1]), v2.gaps);
  let plan = learnerPath.planFor(db.byId('enrollments', m.id));
  check('but the declined grade stays declined, never offered again', plan.catch_up.filter((e) => e.grade_id === gradeIds[G - 1]).length === 1
    && plan.catch_up.find((e) => e.grade_id === gradeIds[G - 1]).status === 'declined', plan.catch_up);
  db.update('enrollments', m.id, { unit_plan: { ...plan, catch_up: [] } });
  gapScan.attachOffers(u.id, db.byId('enrollments', m.id));
  plan = learnerPath.planFor(db.byId('enrollments', m.id));
  check('a decline is remembered with the placement, not only on the enrollment', plan.catch_up.find((e) => e.grade_id === gradeIds[G - 1]).status === 'declined', plan.catch_up);

  // Working the gap unit finishes the catch-up.
  const yes = gapScan.decide(u.id, db.byId('enrollments', m.id), gradeIds[3], true, T0 + 20 * MIN);
  const gapKey = units3[half - 1].key;
  learnerPath.setUnit(db.byId('enrollments', yes.catch_up_enrollment.id), gapKey, 'done', 'path');
  const state = gapScan.stateFor(u.id, TRACK);
  check('a catch-up whose gap units are all worked is done, though other units are unchecked', state.offers.find((e) => e.grade_id === gradeIds[3]).status === 'done', state.offers);
  check('and state names every offer\'s grade', state.offers.every((e) => e.grade_name === rules.gradeName(TRACK, e.grade_id)), state.offers);
  check('state lists the grades that can be kept checking', state.can_keep_checking.includes(gradeIds[G - 1]) && state.can_keep_checking.includes(gradeIds[3]), state.can_keep_checking);
}

console.log('\nreusing an earlier enrollment');
{
  const u = makeUser('reuse');
  walk(u.id, { mode: 'balanced', used: 20, answered: [{ pos: 3.5, guess: 0.25, correct: false }] });
  const m = enroll(u.id, gradeIds[G]);
  const own = enroll(u.id, gradeIds[3], { status: 'active', current_level: 1, placed_at: new Date(T0).toISOString() });
  const otherKey = units3[0].key === units3[half - 1].key ? units3[1].key : units3[0].key;
  learnerPath.setUnit(own, otherKey, 'known', 'placement');
  const s = gapScan.start(u.id, { trackId: TRACK, mode: 'balanced', gradeId: gradeIds[G] }, T0);
  run(u.id, s, [gapA], { step: 20000 });
  const d = gapScan.decide(u.id, db.byId('enrollments', m.id), gradeIds[3], true, T0 + 9 * MIN);
  const ep = learnerPath.planFor(d.catch_up_enrollment);
  check('accepting reuses the enrollment the learner already has', d.catch_up_enrollment.id === own.id && db.find('enrollments', (e) => e.user_id === u.id && e.grade_id === gradeIds[3]).length === 1);
  check('and what its own placement settled is kept', ep.units[otherKey].status === 'known' && ep.units[otherKey].source === 'placement');
}

console.log('\nenrolling after the scan');
{
  const u = makeUser('later');
  walk(u.id, { mode: 'quick', used: 9, answered: [{ pos: 3.5, guess: 0.25, correct: false }] });
  const s = gapScan.start(u.id, { trackId: TRACK, mode: 'quick', gradeId: gradeIds[G] }, T0);
  const { v } = run(u.id, s, [gapA], { step: 20000 });
  check('the scan finds the gap with no enrollment to put it on', v.done && v.gaps.length === 1 && !db.findOne('enrollments', (e) => e.user_id === u.id));
  const e = enroll(u.id, gradeIds[G]);
  check('the new enrollment has no plan until it is read', learnerPath.planFor(db.byId('enrollments', e.id)) === null);
  const plan = gapScan.attachOffers(u.id, e);
  check('attachOffers writes the offer onto it', plan && plan.catch_up.length === 1 && plan.catch_up[0].status === 'offered' && plan.catch_up[0].grade_id === gradeIds[3]
    && learnerPath.planFor(db.byId('enrollments', e.id)).catch_up.length === 1, plan);
  gapScan.attachOffers(u.id, db.byId('enrollments', e.id));
  check('and calling it again adds nothing', learnerPath.planFor(db.byId('enrollments', e.id)).catch_up.length === 1);
  const other = makeUser('later-other');
  check('another learner\'s enrollment is not touched', gapScan.attachOffers(other.id, e) === null);
  const elsewhere = enroll(u.id, gradeIds[G + 1]);
  check('an enrollment in a grade the scan was not for gets nothing, and no plan', gapScan.attachOffers(u.id, elsewhere) === null && learnerPath.planFor(db.byId('enrollments', elsewhere.id)) === null);
}

console.log('\nthe time estimate');
{
  const unit = units3[half - 1];
  const m = gapScan.unitMinutes(TRACK, gradeIds[3], unit);
  const levels = unit.end - unit.start + 1;
  check('a unit is estimated by its kinds of level, not a flat rate', m !== levels * 4 && m >= levels * gapScan.LEVEL_MINUTES.practice && m <= levels * gapScan.LEVEL_MINUTES.lesson, { m, levels });
  console.log(`       (${TRACK} ${gradeIds[3]} unit ${unit.key}: ${levels} levels, about ${m} min)`);
  const s = scanOf(makeUser('t') && learner.id);
  const g = s.gaps.find((x) => x.grade_id === gradeIds[3]);
  const sum = s.candidates.filter((c) => c.status === 'learn' && c.grade_id === gradeIds[3]).reduce((n, c) => n + c.minutes, 0);
  check('an offer\'s minutes are its gap units\' estimates only, to the nearest 5', g.minutes === Math.max(5, Math.round(sum / 5) * 5), { g, sum });
}

console.log('\ntracks without a unit bank');
{
  const track = ['iq', 'spanish', 'chess', 'piano'].find((t) => rules.gradesFor(t).length >= 3 && !rules.gradesFor(t).some((g) => unitPlacement.available(t, g)));
  if (!track) {
    check('a track without a unit bank exists to test', false);
  } else {
    const ids = rules.gradesFor(track);
    check(`${track}: no candidates however many misses`, gapScan.candidatesFor(track, ids.length - 1, [{ pos: 0.5, guess: 0.25, correct: false }, { pos: 1.5, guess: 0.25, correct: false }]).length === 0);
    const u = makeUser('nobank');
    walk(u.id, { track, mode: 'quick', used: 5, answered: [{ pos: 0.5, guess: 0.25, correct: false }] });
    const e = db.insert('enrollments', { user_id: u.id, track_id: track, grade_id: ids[ids.length - 1], current_level: 1, status: 'placement_pending' });
    const s = gapScan.start(u.id, { trackId: track, mode: 'quick', gradeId: ids[ids.length - 1] }, T0);
    check(`${track}: the scan finishes at once, asking nothing and finding nothing`, s.scan.finished_at && !s.scan.current && s.scan.asked.length === 0 && s.scan.gaps.length === 0);
    check(`${track}: and the enrollment is left exactly as it was`, db.byId('enrollments', e.id).unit_plan === undefined);
    check(`${track}: there is nothing to keep checking`, gapScan.startExtended(u.id, { trackId: track, gradeId: ids[0] }, T0).status === 400);
  }
}

console.log('\nthe routes');
{
  const routes = router.stack.filter((l) => l.route).map((l) => `${Object.keys(l.route.methods)[0]} ${l.route.path}`);
  check('start, answer, decide and state are served', ['post /start', 'post /answer', 'post /decide', 'get /state/:track'].every((r) => routes.includes(r)), routes);
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  check('mounted at /api/gap-scan', /app\.use\('\/api\/gap-scan', require\('\.\/routes\/gap-scan'\)\)/.test(server));
  const nobody = makeUser('nobody');
  check('a learner with no subject placement is told to take it first', gapScan.start(nobody.id, { trackId: TRACK, mode: 'quick', gradeId: gradeIds[G] }, T0).status === 404);
  check('another learner\'s placement cannot be named', gapScan.start(nobody.id, { trackId: TRACK, mode: 'quick', gradeId: gradeIds[G], subjectId: db.findOne('subject_placements', (p) => p.user_id === learner.id).id }, T0).status === 404);
}

/** The routes over real HTTP, signed in as `who` by a header (requireAuth only needs req.user). */
async function overHttp() {
  console.log('\nover HTTP');
  // eslint-disable-next-line global-require
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.user = db.byId('users', req.get('x-test-user')) || null; next(); });
  app.use('/api/gap-scan', router);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api/gap-scan`;
  const call = async (who, method, url, body) => {
    const r = await fetch(base + url, { method, headers: { 'content-type': 'application/json', 'x-test-user': String(who) }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json() };
  };
  const answerAll = async (who, r, extended) => {
    let guard = 0;
    while (r.status === 200 && !r.body.done && guard++ < 80) {
      const q = r.body.question;
      const item = unitPlacement.itemFor(TRACK, q.grade_id, q.unit, q.slot);
      const ans = `${q.grade_id}:${q.unit}` === gapA ? wrongOf(item) : item.answer;
      r = await call(who, 'POST', '/answer', { track_id: TRACK, grade_id: q.grade_id, unit: q.unit, slot: q.slot, answer: ans, extended });
    }
    return r;
  };
  try {
    const u = makeUser('http');
    const now = Date.now();
    db.insert('subject_placements', {
      user_id: u.id, track_id: TRACK, grade_ids: gradeIds, mode: 'quick',
      started_at: new Date(now - 9 * MIN).toISOString(), finished_at: new Date(now).toISOString(),
      answered: [{ pos: 3.5, guess: 0.25, correct: false }], scores: [],
    });
    const m = enroll(u.id, gradeIds[G]);
    check('signed out is refused', (await call('', 'POST', '/start', { track_id: TRACK })).status === 401);
    let r = await call(u.id, 'POST', '/start', { track_id: TRACK, mode: 'quick', recommended_grade_id: gradeIds[G] });
    check('start returns the first question and the clock', r.status === 200 && !r.body.done && r.body.question && r.body.question.prompt && r.body.question.answer === undefined && r.body.clock && r.body.clock.deadline_at, r.body);
    r = await answerAll(u.id, r, false);
    check('answers run to done, with the gaps', r.status === 200 && r.body.done && r.body.gaps.length === 1 && r.body.gaps[0].grade_id === gradeIds[3], r.body);
    const stale = await call(u.id, 'POST', '/answer', { track_id: TRACK, grade_id: gradeIds[3], unit: 1, slot: 0, answer: 'x' });
    check('an answer after the end changes nothing', stale.status === 200 && stale.body.done && stale.body.recorded === false);
    let x = await call(u.id, 'POST', '/start', { track_id: TRACK, extended: true, grade_id: gradeIds[G - 1] });
    check('keep checking starts with extended: true, no clock', x.status === 200 && x.body.extended && !x.body.done && x.body.clock.deadline_at === null && x.body.question, x.body);
    x = await answerAll(u.id, x, true);
    check('and its answers run to done with the updated gaps', x.status === 200 && x.body.done && x.body.extended && Array.isArray(x.body.gaps), x.body);
    const other = makeUser('http-other');
    check('another learner cannot decide on this enrollment', (await call(other.id, 'POST', '/decide', { enrollment_id: m.id, grade_id: gradeIds[3], accept: true })).status === 404);
    const d = await call(u.id, 'POST', '/decide', { enrollment_id: m.id, grade_id: gradeIds[3], accept: true });
    check('decide accepts and names the catch-up enrollment', d.status === 200 && d.body.entry.status === 'accepted' && d.body.catch_up_enrollment && d.body.catch_up_enrollment.grade_id === gradeIds[3], d.body);
    const st = await call(u.id, 'GET', `/state/${TRACK}`);
    check('state shows the finished scan, the keep-checking walk and the accepted offer', st.status === 200 && st.body.scan.done && st.body.extended && st.body.extended.done
      && st.body.offers.some((e) => e.status === 'accepted'), st.body);
  } finally {
    server.close();
  }
}

overHttp().catch((err) => { failures++; console.log(`  FAIL over HTTP threw — ${err.stack}`); }).finally(() => {
  db.flush();
  setTimeout(() => {
    try { fs.unlinkSync(tmp); } catch { /* gone */ }
    console.log(`\n${failures ? `${failures} failure(s)` : 'all gap scan checks passed'}`);
    process.exit(failures ? 1 : 0);
  }, 400);
});
