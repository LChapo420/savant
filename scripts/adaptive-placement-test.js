/**
 * Tests for the adaptive placement walk (Quick / Balanced / Accurate).
 *
 *   node scripts/adaptive-placement-test.js
 *
 * Runs on its own throwaway data file and on English, whose questions are in
 * source control, so it needs no key and touches nothing real.
 */
const os = require('os');
const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'test';
const tmp = path.join(os.tmpdir(), `adaptive-placement-test-${process.pid}.json`);
process.env.DB_FILE = tmp;

const db = require('../config/db');
const rules = require('../config/subject-placement');
const adaptive = require('../services/adaptive-placement');
const subjectPlacement = require('../services/subject-placement');

let failures = 0;
function check(label, ok, detail) {
  if (ok) { console.log(`  ok   ${label}`); return; }
  failures++;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
}

console.log('\nthe belief');
{
  const flat = adaptive.posterior(10, []);
  check('with no answers the belief is spread over the whole subject', adaptive.massWithin(flat, 0, 10) > 0.999 && adaptive.massWithin(flat, 4, 6) < 0.25);
  const answered = [];
  for (let g = 0; g < 10; g++) for (const b of ['easy', 'medium', 'hard']) answered.push({ pos: g + adaptive.BAND_AT[b], guess: 0.25, correct: g < 6 });
  const post = adaptive.posterior(10, answered);
  check('answers right through grade 6 and wrong after put the middle in grade 6', Math.floor(adaptive.median(post)) === 5 || Math.floor(adaptive.median(post)) === 6, adaptive.median(post));
  check('and most of the belief within a grade of it', adaptive.massWithin(post, adaptive.median(post) - 1, adaptive.median(post) + 1) > 0.9);
  const rec = adaptive.recommend(10, post);
  check('the recommended grade reads 100%', rec.percents[rec.index] === 100 || rec.percents[rec.index] >= 90, rec.percents);
}

console.log('\nblocks');
{
  const sets = [0, 1, 2].map(() => rules.MIX.map((band) => ({ band })));
  const blocks = adaptive.blocksFor(sets);
  check('each question is its own block, in order of where it sits', blocks.length === 21 && blocks.every((b) => b.idx.length === 1) && blocks.slice(0, 7).map((b) => b.idx[0]).join() === '0,1,2,3,4,5,6');
  const next = adaptive.nextBlock(blocks, [{ grade: 1, part: blocks[11].part }], 1.6);
  check('the next block is the unasked one nearest the target', next.grade === 1 && Math.abs(next.pos - 1.6) <= Math.min(...blocks.filter((b) => !(b.grade === 1 && b.part === blocks[11].part)).map((b) => Math.abs(b.pos - 1.6))) + 1e-9, next);
}

console.log('\nthe walk in the app (English)');
{
  const user = db.insert('users', { email: `adaptive-${process.pid}@example.test`, display_name: 'adaptive test', password_hash: 'x' });
  const gradeIds = rules.gradesFor('english');
  const hint = gradeIds[8];
  let p = subjectPlacement.start(user.id, 'english', { restart: true, mode: 'quick', startGradeId: hint });
  check('a quick walk records its mode and clock', p.mode === 'quick' && Date.parse(p.deadline_at) > Date.now());
  check('it starts the search where the learner said', p.current_block && p.current_block.grade === 8, p.current_block);
  const first = subjectPlacement.currentQuestions(p);
  // Which of the grade's two blocks comes first depends on where its questions are calibrated to sit.
  check('the screen holds one question, with its index in the grade', first.grade_id === hint && first.questions.length === 1 && Number.isInteger(first.questions[0].index), first.questions.map((q) => q.index));
  check('and no answers are sent', first.questions.every((q) => q.answer === undefined));

  // A learner who knows everything up to the middle of grade 6 (index 5).
  const knows = (gradeIndex, band) => gradeIndex < 5 || (gradeIndex === 5 && ['easy', 'medium'].includes(band));
  let guard = 0;
  let outcome = null;
  while (guard++ < 60) {
    p = subjectPlacement.placementFor(user.id, 'english');
    const now = subjectPlacement.currentQuestions(p);
    const all = subjectPlacement.questionsFor('english', now.grade_id);
    const gi = gradeIds.indexOf(now.grade_id);
    const answers = now.questions.map((q) => {
      const full = all[q.index];
      const wrong = full.choices.find((c) => c !== full.answer);
      return { index: q.index, answer: knows(gi, full.band) ? full.answer : wrong };
    });
    outcome = subjectPlacement.submitBlock(user.id, 'english', answers);
    if (outcome.error || outcome.stopped) break;
  }
  check('the walk finishes on its own', outcome && outcome.stopped && !outcome.error, outcome && outcome.error);
  p = subjectPlacement.placementFor(user.id, 'english');
  check('within the quick cap', p.answered.length <= adaptive.MODES.quick.max, p.answered.length);
  const decided = subjectPlacement.recommendAdaptive('english', p);
  const placed = gradeIds.indexOf(decided.recommended_grade_id);
  check('and places the learner within a grade of grade 6', Math.abs(placed - 5) <= 1, placed);
  check('the recommendation names its mode, not a model', decided.percent_model === 'adaptive-quick');

  // The clock is held on the server.
  p = subjectPlacement.start(user.id, 'english', { restart: true, mode: 'balanced' });
  db.update('subject_placements', p.id, { deadline_at: new Date(Date.now() - 1000).toISOString() });
  const early = subjectPlacement.submitBlock(user.id, 'english', [{ index: 0, answer: 'x' }]);
  check('the clock does not end a walk short of its minimum answers', !early.stopped, early.placement && early.placement.stop_reason);
  p = subjectPlacement.placementFor(user.id, 'english');
  const min = adaptive.limits('balanced', p.grade_ids.length).min;
  db.update('subject_placements', p.id, { answered: Array.from({ length: min }, (_, i) => ({ pos: 3 + (i % 3) * 0.3, guess: 0.25, correct: i % 2 === 0 })) });
  const late = subjectPlacement.submitBlock(user.id, 'english', [{ index: 0, answer: 'x' }]);
  check('a block handed in after the clock, with the minimum answered, ends the walk', late.stopped && subjectPlacement.placementFor(user.id, 'english').stop_reason === 'the clock ran out');

  // "I don't know" is stored as such, so the belief allows no lucky guess for it.
  p = subjectPlacement.start(user.id, 'english', { restart: true, mode: 'quick' });
  subjectPlacement.submitBlock(user.id, 'english', [{ index: subjectPlacement.currentQuestions(p).questions[0].index, answer: '' }]);
  p = subjectPlacement.placementFor(user.id, 'english');
  check('an empty answer is recorded as "I don\'t know"', p.answered.length === 1 && p.answered[0].idk === true && p.answered[0].correct === false, p.answered);
  check('and says more about not knowing than a wrong answer', adaptive.assumed(3, 0.2, 0.25, {}, true) < adaptive.assumed(3, 0.2, 0.25, {}, false));

  // Quitting scores only what was answered.
  p = subjectPlacement.start(user.id, 'english', { restart: true, mode: 'accurate' });
  const q0 = subjectPlacement.currentQuestions(p);
  const quit = subjectPlacement.quit(user.id, 'english', q0.grade_id, []);
  check('quitting an adaptive walk with nothing answered finishes it cleanly', quit.quit && !quit.error, quit.error);

  // The full walk is untouched.
  p = subjectPlacement.start(user.id, 'english', { restart: true });
  check('without a mode the walk is the full climb from the first grade', !p.mode && p.position === 0 && subjectPlacement.currentQuestions(p).questions.length === 7);
}

console.log('\nplacement inside a grade (unit bank)');
{
  // eslint-disable-next-line global-require
  const unitPlacement = require('../services/unit-placement');
  const track = 'math';
  const gradeId = 'numbers_to_10';
  if (!unitPlacement.available(track, gradeId)) {
    console.log('  (skipped: no unit bank for math numbers_to_10 yet)');
  } else {
    const units = unitPlacement.unitsFor(track, gradeId);
    // A learner who has finished units 1 to 8 and nothing after: they answer a
    // question right when it sits (as calibrated) inside those eight units.
    const knows = (next) => unitPlacement.pointOf(units[next.unit - 1].questions[next.slot], next.unit) < 8;
    const answered = [];
    let guard = 0;
    for (;;) {
      const next = unitPlacement.nextQuestion(track, gradeId, 'balanced', answered);
      if (!next || guard++ > 100) break;
      answered.push({ ...next, correct: knows(next) });
    }
    check('the walk stops on its own, within the balanced cap', answered.length > 0 && answered.length <= unitPlacement.MODES.balanced.max, answered.length);
    check('every question is asked once', new Set(answered.map((a) => `${a.unit}:${a.slot}`)).size === answered.length);
    const result = unitPlacement.score(track, gradeId, answered);
    check('it places the learner within a unit of unit 9', Math.abs(result.unit - 9) <= 1, result.unit);
    check('at the first lesson of that unit', result.placedLevel >= units[result.unit - 1].start && result.placedLevel <= units[result.unit - 1].end, result.placedLevel);
    const seenRight = new Set(answered.filter((a) => a.correct).map((a) => a.unit));
    check('a quick check for each skipped unit not already answered right', result.checks.length === [...Array(result.unit - 1).keys()].filter((i) => !seenRight.has(i + 1)).length
      && result.checks.every((c) => c.unit < result.unit && c.slots.length), result.checks);

    const item = unitPlacement.itemFor(track, gradeId, 3, 0);
    check('an item carries its options shuffled, with the answer among them', item.choices.length === 4 && item.choices.includes(item.answer));
    check('and the same order every time', JSON.stringify(unitPlacement.itemFor(track, gradeId, 3, 0).choices) === JSON.stringify(item.choices));

    // The quick check: a miss asks again, a second miss reopens the unit.
    let checks = [{ unit: 2, key: 'k2', slots: [1, 2], status: 'pending', misses: 0 }, { unit: 5, key: 'k5', slots: [0, 1], status: 'pending', misses: 0 }];
    check('the first check question is the earliest unit', JSON.stringify(unitPlacement.nextCheck(checks)) === JSON.stringify({ unit: 2, slot: 1 }));
    let marked = unitPlacement.markCheck(track, gradeId, checks, 2, true);
    check('a right answer passes the unit', marked.checks[0].status === 'passed' && marked.reopenLevel === null);
    checks = marked.checks;
    marked = unitPlacement.markCheck(track, gradeId, checks, 5, false);
    check('one miss asks the unit\'s other question', marked.checks[1].status === 'pending' && JSON.stringify(unitPlacement.nextCheck(marked.checks)) === JSON.stringify({ unit: 5, slot: 1 }));
    marked = unitPlacement.markCheck(track, gradeId, marked.checks, 5, false);
    check('two misses reopen it, and the start moves to its first lesson', marked.checks[1].status === 'reopened' && marked.reopenLevel === unitPlacement.startLevelOf(track, gradeId, units[4]), marked.reopenLevel);
    check('and then nothing is left to check', unitPlacement.nextCheck(marked.checks) === null);
  }
}

console.log('\n"I don\'t know" inside a grade (every subject with a unit bank)');
{
  // Polish audit 2026-10-24: one "I don't know" on English Intermediate ended at
  // "You start at unit 6 of 20". A blank answer is graded wrong; with no right
  // answer nothing may be skipped, and thin evidence starts at the belief's low end.
  const unitPlacement = require('../services/unit-placement');
  const grading = require('../services/grading');
  check('a blank answer ("I don\'t know") is graded wrong',
    grading.grade({ format: 'multiple_choice', choices: ['a', 'b', 'c', 'd'], answer: 'a', accepts: [] }, '').correct === false);
  for (const track of ['math', 'english', 'reading']) {
    let worst = { unit: 0 };
    let thin = { unit: 0 };
    let grades = 0;
    for (const gradeId of rules.gradesFor(track)) {
      if (!unitPlacement.available(track, gradeId)) continue;
      grades++;
      for (const mode of ['quick', 'balanced', 'accurate']) {
        const answered = [];
        for (;;) {
          const next = unitPlacement.nextQuestion(track, gradeId, mode, answered);
          if (!next) break;
          answered.push({ ...next, correct: false });
        }
        const placed = unitPlacement.score(track, gradeId, answered).unit;
        if (placed > worst.unit) worst = { unit: placed, gradeId, mode };
        // Stopped after one or two answers, both "I don't know".
        for (const k of [1, 2]) {
          const few = [];
          for (let i = 0; i < k; i++) few.push({ ...unitPlacement.nextQuestion(track, gradeId, mode, few), correct: false });
          const u = unitPlacement.score(track, gradeId, few).unit;
          if (u > thin.unit) thin = { unit: u, gradeId, mode, k };
        }
      }
    }
    check(`${track}: all "I don't know" places at unit 1 in every grade and mode (${grades} grades)`, worst.unit === 1, worst);
    check(`${track}: stopping after one or two "I don't know" places at unit 1`, thin.unit === 1, thin);
  }
  // One right answer after a stop: the low end of the belief, not its middle.
  const units = unitPlacement.unitsFor('english', 'intermediate');
  if (units) {
    const first = unitPlacement.nextQuestion('english', 'intermediate', 'quick', []);
    const one = [{ ...first, correct: true }];
    const u = unitPlacement.score('english', 'intermediate', one).unit;
    check(`one right answer and a stop does not jump past the question's unit (${u} of ${units.length})`, u <= first.unit, { u, asked: first.unit });
  }
  // The subject walk: all "I don't know", or a stop after one, recommends the first grade.
  for (const track of ['math', 'english', 'reading']) {
    const ids = rules.gradesFor(track);
    const sets = ids.map((id) => subjectPlacement.questionsFor(track, id) || []);
    if (!sets.every((s) => s.length)) continue;
    const blocks = adaptive.blocksFor(sets);
    for (const stopAfter of [1, Infinity]) {
      const answered = [];
      const asked = [];
      let post = adaptive.posterior(ids.length, answered);
      let target = adaptive.firstTarget(ids.length, null);
      while (answered.length < stopAfter && !adaptive.done('quick', answered, post)) {
        const block = adaptive.nextBlock(blocks, asked, target);
        if (!block) break;
        asked.push(block);
        for (const i of block.idx) answered.push({ pos: adaptive.positionOf(sets[block.grade][i], block.grade), guess: 0.25, correct: false });
        post = adaptive.posterior(ids.length, answered);
        target = adaptive.median(post);
      }
      const rec = adaptive.recommend(ids.length, post);
      check(`${track} subject walk: ${stopAfter === 1 ? 'one' : 'all'} "I don't know" recommends the first grade`, rec.index === 0, rec.index);
    }
  }
}

db.flush();
setTimeout(() => {
  try { fs.unlinkSync(tmp); } catch { /* gone */ }
  console.log(`\n${failures ? `${failures} failure(s)` : 'all adaptive placement checks passed'}`);
  process.exit(failures ? 1 : 0);
}, 400);
