/**
 * Tests for the subject placement quiz.
 *
 *   node scripts/subject-placement-test.js
 *
 * The walk's arithmetic, the contract the model's questions have to meet, the
 * scoring of a grade, the skip, and the recommendation — with the model stubbed,
 * so this runs without a key and gives the same answer every time.
 *
 * It writes to a copy of the data file (its own, deleted at the end), under
 * accounts named subjecttest-*. It used to write to the real one, and every run
 * left four test accounts behind in it. DB_FILE=<file> runs it against that file.
 */
process.env.NODE_ENV = 'test';

const fs = require('fs');
const os = require('os');
const path = require('path');

let ownCopy = null;
if (!process.env.DB_FILE) {
  ownCopy = path.join(os.tmpdir(), `subject-placement-test-${process.pid}.json`);
  fs.copyFileSync(path.join(__dirname, '..', 'data', 'db.json'), ownCopy);
  process.env.DB_FILE = ownCopy;
}
// config/db is loaded here, on the copy, so its own exit write is registered
// before this cleanup: registered the other way round, the copy was deleted and
// then written back, leaving 140 MB behind each run.
require('../config/db');
process.on('exit', () => { if (ownCopy) try { fs.unlinkSync(ownCopy); } catch { /* gone */ } });

const db = require('../config/db');
const rules = require('../config/subject-placement');
const subjectPlacement = require('../services/subject-placement');
const subjectPlacementRouter = require('../routes/subject-placement');
const ai = require('../services/ai');
const grading = require('../services/grading');

let failures = 0;
let checks = 0;

function check(label, ok, detail) {
  checks++;
  if (ok) {
    console.log(`  ok   ${label}`);
    return true;
  }
  failures++;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
  return false;
}

function makeUser(tag) {
  return db.insert('users', {
    email: `subjecttest-${tag}-${process.pid}@example.test`,
    display_name: `subject test ${tag}`,
    password_hash: 'x',
    onboarded: true,
  });
}

// The walk tests need questions whose answers they know, so they put their own
// set on the one subject they use — and that subject's real set is kept safe and
// put back at the end. It used to be deleted outright: every run of this file
// left the real quiz with nothing to ask.
let savedQuestionSet = null;
let fixtureQuestionSet = null;

console.log('\nsubject placement route order');
{
  const routes = subjectPlacementRouter.stack
    .filter((layer) => layer.route)
    .map((layer) => ({ path: layer.route.path, methods: layer.route.methods }));
  const percent = routes.findIndex((route) => route.path === '/percent/mine' && route.methods.get);
  const track = routes.findIndex((route) => route.path === '/:track' && route.methods.get);
  check('the percentage endpoint is before the track parameter', percent >= 0 && track >= 0 && percent < track, routes);
}

// ── the rules of the walk ──────────────────────────────────────────────────
console.log('\nthe shape of a grade');
{
  check('seven questions a grade', rules.QUESTIONS_PER_GRADE === 7, rules.QUESTIONS_PER_GRADE);
  const counts = rules.MIX.reduce((acc, b) => ({ ...acc, [b]: (acc[b] || 0) + 1 }), {});
  check('two easy, two medium, two hard, one capstone',
    counts.easy === 2 && counts.medium === 2 && counts.hard === 2 && counts.capstone === 1, counts);
  check('every band in the mix has a description',
    rules.MIX.every((b) => typeof rules.BANDS[b] === 'string' && rules.BANDS[b].length > 10));
}

console.log('\nthe subjects');
{
  const counts = {};
  for (const t of ['math', 'english', 'reading', 'iq', 'act', 'spanish']) counts[t] = rules.gradesFor(t).length;
  check('every subject lists its grades in order', counts.math === 49 && counts.english === 16 && counts.spanish === 57, counts);
  check('the grades are ids the curriculum knows',
    rules.gradesFor('math').every((id) => !!require('../config/curriculum').getGrade('math', id)));
  check('a subject that does not exist has no grades', rules.gradesFor('nope').length === 0);
}

console.log('\nthe difficulty climbs the whole subject');
{
  const total = 49;
  const avg = (i) => rules.MIX.reduce((s, b) => s + rules.difficultyFor(i, total, b), 0) / rules.MIX.length;
  check('the first grade is the easiest in the subject', avg(0) < 3, avg(0));
  check('the last grade is the hardest', avg(total - 1) > 8, avg(total - 1));
  let rising = true;
  for (let i = 1; i < total; i++) if (avg(i) < avg(i - 1)) rising = false;
  check('and it never goes backwards', rising);
  check('a capstone is harder than the easy pair in the same grade',
    rules.difficultyFor(10, total, 'capstone') > rules.difficultyFor(10, total, 'easy'));
  check('nothing falls outside one to ten',
    [0, 24, 48].every((i) => rules.MIX.every((b) => rules.difficultyFor(i, total, b) >= 1 && rules.difficultyFor(i, total, b) <= 10)));
  check('every question in a band is inside the scale',
    rules.MIX.every((b) => rules.difficultyFor(0, total, b) >= 1 && rules.difficultyFor(0, total, b) <= 10));
}

console.log('\nwhen the walk gives up');
{
  const blank = (n) => Array.from({ length: n }, (_, i) => ({ grade_id: `g${i}`, asked: 7, correct: 0 }));
  check('three blank grades on their own are not enough', rules.shouldStop(blank(3)) === false);
  check('three blank and a fourth under four end it',
    rules.shouldStop([...blank(3), { grade_id: 'g3', asked: 7, correct: 3 }]) === true);
  check('a fourth at exactly four carries on',
    rules.shouldStop([...blank(3), { grade_id: 'g3', asked: 7, correct: 4 }]) === false);
  check('a fourth above four carries on',
    rules.shouldStop([...blank(3), { grade_id: 'g3', asked: 7, correct: 7 }]) === false);
  check('a recovery in the middle does not block a later run',
    rules.shouldStop([
      ...blank(2), { grade_id: 'x', asked: 7, correct: 6 },
      ...blank(3), { grade_id: 'y', asked: 7, correct: 1 },
    ]) === true);
  check('five blanks in a row still end it',
    rules.shouldStop([...blank(5)]) === true);
  check('an untouched grade is not read as a blank one',
    rules.shouldStop([
      { grade_id: 'a', asked: 0, correct: 0 },
      { grade_id: 'b', asked: 0, correct: 0 },
      { grade_id: 'c', asked: 0, correct: 0 },
      { grade_id: 'd', asked: 0, correct: 0 },
    ]) === false);
  check('too few grades to judge is not a stop', rules.shouldStop(blank(2)) === false);
}

console.log('\nthe walk in the round (the brief\'s example)');
{
  // Aced 1-6, some wrong at 7, aced 8-9, some wrong at 10-11, blank 12-13,
  // aced 14, some right at 15, then blank 16-19, where the walk ends.
  const shape = [7, 7, 7, 7, 7, 7, 5, 7, 7, 5, 5, 0, 0, 7, 4, 0, 0, 0, 0];
  const scores = [];
  let stoppedAt = null;
  for (let i = 0; i < shape.length; i++) {
    scores.push({ grade_id: `g${i}`, asked: 7, correct: shape[i] });
    if (rules.shouldStop(scores)) { stoppedAt = i + 1; break; }
  }
  check('the walk ends on the nineteenth grade, as the example says', stoppedAt === 19, stoppedAt);
  check('it does not end earlier than that', !rules.shouldStop(
    shape.slice(0, 18).map((c, i) => ({ grade_id: `g${i}`, asked: 7, correct: c }))));
}

console.log('\nthe skip');
{
  const perfect = Array.from({ length: 4 }, (_, i) => ({ grade_id: `g${i}`, asked: 7, correct: 7 }));
  check('offered on a subject over thirty grades', rules.skipOffer(perfect, 4, 49) !== null);
  check('four grades are stepped over', rules.skipOffer(perfect, 4, 49).count === rules.SKIP_SIZE);
  check('not offered on a subject of three', rules.skipOffer(perfect, 4, 3) === null);
  check('not offered at exactly thirty grades', rules.skipOffer(perfect, 4, 30) === null);
  check('not offered after three perfect grades', rules.skipOffer(perfect.slice(0, 3), 3, 49) === null);
  check('not offered when one of the four was not perfect',
    rules.skipOffer([...perfect.slice(0, 3), { grade_id: 'g3', asked: 7, correct: 6 }], 4, 49) === null);
  check('not offered twice in a row', rules.skipOffer(perfect, 8, 49) === null);
  // Near the end of a long subject the offer shrinks rather than pointing past
  // the last grade.
  const almostAll = Array.from({ length: 47 }, (_, i) => ({ grade_id: `g${i}`, asked: 7, correct: 7 }));
  check('it never steps past the end of the subject',
    (rules.skipOffer(almostAll, 47, 49) || {}).count === 2, rules.skipOffer(almostAll, 47, 49));
  check('and on the last grade it is not offered at all',
    rules.skipOffer(Array.from({ length: 49 }, (_, i) => ({ grade_id: `g${i}`, asked: 7, correct: 7 })), 49, 49) === null);
}

// ── the contract the model's questions have to meet ────────────────────────
console.log('\nthe questions the model sends back');
{
  const gradeIds = ['a', 'b'];
  const good = (id) => ({
    grade_id: id,
    questions: rules.MIX.map((band) => ({ band, prompt: `q for ${id}`, choices: ['1', '2', '3', '4'], answer: '2', rationale: 'r' })),
  });
  check('a set that meets the contract has no problems',
    subjectPlacement.inspectSet({ grades: [good('a'), good('b')] }, gradeIds).length === 0,
    subjectPlacement.inspectSet({ grades: [good('a'), good('b')] }, gradeIds));

  check('a missing grade is caught',
    subjectPlacement.inspectSet({ grades: [good('a')] }, gradeIds).some((p) => /b: missing/.test(p)));
  check('a grade with six questions is caught',
    subjectPlacement.inspectSet({ grades: [good('a'), { grade_id: 'b', questions: good('b').questions.slice(0, 6) }] }, gradeIds)
      .some((p) => /b: 6 questions/.test(p)));
  // Seven questions, so the length rule passes and the prompt rule is the one
  // actually under test.
  const oneWithoutPrompt = rules.MIX.map((band, i) => ({
    band, prompt: i === 2 ? '' : 'p', choices: ['1', '2', '3'], answer: '1', rationale: 'r',
  }));
  check('a question with no prompt is caught',
    subjectPlacement.inspectSet({ grades: [good('a'), { grade_id: 'b', questions: oneWithoutPrompt }] }, gradeIds)
      .some((p) => /no prompt/.test(p)));
  check('an answer that is not among the choices is caught',
    subjectPlacement.inspectSet({
      grades: [good('a'), { grade_id: 'b', questions: rules.MIX.map((band) => ({ band, prompt: 'p', choices: ['1', '2', '3'], answer: '9', rationale: 'r' })) }],
    }, gradeIds).some((p) => /answer is not among the choices/.test(p)));
  check('an empty reply is caught', subjectPlacement.inspectSet(null, gradeIds).length > 0);
  check('a free-response question with no choices is allowed',
    subjectPlacement.inspectSet({
      grades: [good('a'), { grade_id: 'b', questions: rules.MIX.map((band) => ({ band, prompt: 'p', answer: 'x', rationale: 'r' })) }],
    }, gradeIds).length === 0);

  // The choices must not answer the question for the learner. The loudest
  // giveaway is length: one long, complete answer beside three short fragments
  // is findable without knowing anything, and a quarter of the first sets were
  // exactly that.
  const ofLength = (choices, answer) => rules.MIX.map((band) => ({
    band, prompt: 'p', choices, answer, rationale: 'r',
  }));
  check('an answer findable by its length is caught',
    subjectPlacement.inspectSet({
      grades: [good('a'), {
        grade_id: 'b',
        questions: ofLength(['a', 'bb', 'ccc', 'the one complete answer, written out in full'], 'the one complete answer, written out in full'),
      }],
    }, gradeIds).some((p) => /identifiable by its length/.test(p)));
  check('and so is a bare answer among three paragraphs',
    subjectPlacement.inspectSet({
      grades: [good('a'), {
        grade_id: 'b',
        questions: ofLength(['x', 'a long wrong option explaining something at length', 'another long wrong option doing the same', 'a third long wrong option, equally wordy'], 'x'),
      }],
    }, gradeIds).some((p) => /identifiable by its length/.test(p)));
  check('and one where every option is the same shape is not flagged',
    subjectPlacement.inspectSet({
      grades: [good('a'), { grade_id: 'b', questions: ofLength(['alpha', 'bravo', 'charlie', 'delta'], 'bravo') }],
    }, gradeIds).filter((p) => /identifiable by its length/.test(p)).length === 0);

  // The spec behind the questions, so the next set cannot be answered by shape.
  const spec = subjectPlacement.questionSystemPrompt();
  check('the spec says the choices are half the question', /The choices are half the question/.test(spec));
  check('and records the habit that gave the answers away', /93% of the time/.test(spec));
  check('and demands wrong options the same kind of thing as the right one',
    /the same kind of thing, the same units/.test(spec));
  check('and says the answer\'s position must vary', /answer.s position varies/.test(spec));
  check('and says the answer is not identifiable by its length',
    /not identifiable by its length/.test(spec));

  // A long subject is written in batches, and a batch has to know what is
  // already written or the one document becomes several that repeat each other.
  const batched = subjectPlacement.questionUserPrompt('english', rules.gradesFor('english'), {
    batch: rules.gradesFor('english').slice(0, 2),
    written: [{ grade_id: 'first_grade', questions: [{ prompt: 'A question already asked', answer: 'its answer' }] }],
  });
  check('a batch is told exactly which grades it writes',
    /THIS CALL WRITES EXACTLY THESE 2 GRADES/.test(batched));
  check('and the ladder is still whole around it', /← write this one/.test(batched));
  check('and what is already written is listed, so nothing repeats',
    /ALREADY WRITTEN/.test(batched) && /A question already asked/.test(batched));
  check('a short subject is one call and says nothing about batches',
    !/THIS CALL WRITES/.test(subjectPlacement.questionUserPrompt('english', rules.gradesFor('english'))));
}

// ── the walk against a real set ────────────────────────────────────────────
console.log('\nscoring a grade');
{
  const TRACK = 'iq';
  savedQuestionSet = subjectPlacement.questionSet(TRACK);
  db.remove('placement_question_sets', (s) => s.track_id === TRACK);
  const gradeIds = rules.gradesFor(TRACK);
  const questions = rules.MIX.map((band, i) => ({
    band,
    prompt: `${band} question ${i + 1}`,
    choices: ['right', 'wrong1', 'wrong2', 'wrong3'],
    answer: 'right',
    rationale: 'because',
  }));
  fixtureQuestionSet = db.insert('placement_question_sets', {
    track_id: TRACK, grade_ids: gradeIds, problems: [],
    grades: gradeIds.map((grade_id) => ({ grade_id, questions })),
  });

  // A stored, complete set must stay playable when question-writing providers
  // are unavailable; only authoring a missing set needs a provider.
  const providers = require('../services/providers');
  const realCurrent = providers.current;
  providers.current = (role) => (role === 'placement' ? null : realCurrent(role));
  const offlineState = subjectPlacement.stateFor(0, TRACK);
  check('a saved question set is available without a provider', offlineState.ready && offlineState.available);
  providers.current = realCurrent;

  const user = makeUser('walk');
  const started = subjectPlacement.start(user.id, TRACK);
  check('the walk starts at the first grade', started.position === 0 && started.grade_ids[0] === gradeIds[0]);

  const first = subjectPlacement.questionsFor(TRACK, gradeIds[0]);
  check('the first grade has seven questions', first.length === 7);

  const allRight = first.map((_, i) => ({ index: i, answer: 'right' }));
  const perfect = subjectPlacement.submitGrade(user.id, TRACK, gradeIds[0], allRight);
  check('seven right scores seven', perfect.correct === 7 && perfect.asked === 7, perfect);
  check('and the walk moves to the next grade', perfect.next_grade_id === gradeIds[1]);
  check('a set this short cannot stop on one grade', perfect.stopped === false);

  const allWrong = first.map((_, i) => ({ index: i, answer: 'wrong1' }));
  const blank = subjectPlacement.submitGrade(user.id, TRACK, gradeIds[1], allWrong);
  check('seven wrong scores none', blank.correct === 0, blank);

  // The per-band detail is what the recommendation reads, so it has to be there.
  const stored = subjectPlacement.placementFor(user.id, TRACK);
  check('the score keeps its per-band detail',
    !!stored.scores[0].bands && stored.scores[0].bands.capstone.correct === 1, stored.scores[0].bands);
  // And the question-by-question evidence behind the tally: what was asked, what
  // they put, and whether it was right. The recommendation is meant to come from
  // every piece of context, and the tally is what throws that context away.
  const evidence = stored.scores[0].answers || [];
  check('and the question-by-question evidence behind it',
    evidence.length === 7 && evidence[6].band === 'capstone' && evidence[6].correct === true
      && evidence[0].prompt === 'easy question 1' && evidence[0].given === 'right',
    evidence[0]);
  check('a wrong answer records what they put and what it should have been',
    (stored.scores[1].answers || [])[0].given === 'wrong1' && (stored.scores[1].answers || [])[0].answer === 'right'
      && (stored.scores[1].answers || [])[0].correct === false);

  const unanswered = subjectPlacement.submitGrade(user.id, TRACK, gradeIds[0], []);
  check('an unanswered question is simply wrong, not an error', unanswered.correct === 0);
}

console.log('\nanswers are saved as they are given');
{
  const TRACK = 'iq';
  const gradeIds = rules.gradesFor(TRACK);
  const user = makeUser('autosave');
  subjectPlacement.start(user.id, TRACK);

  const first = subjectPlacement.recordAnswer(user.id, TRACK, gradeIds[0], 0, 'right');
  check('an answer is kept the moment it is given', first.saved === true && first.answered === 1, first);
  check('and it is there to come back to',
    subjectPlacement.placementFor(user.id, TRACK).draft.answers['0'] === 'right');
  const second = subjectPlacement.recordAnswer(user.id, TRACK, gradeIds[0], 2, 'wrong1');
  check('and the ones after it accumulate beside it',
    second.answered === 2 && subjectPlacement.placementFor(user.id, TRACK).draft.answers['2'] === 'wrong1');
  check('an answer can be changed before the grade is handed in',
    subjectPlacement.recordAnswer(user.id, TRACK, gradeIds[0], 2, 'right').answered === 2
      && subjectPlacement.placementFor(user.id, TRACK).draft.answers['2'] === 'right');

  check('a grade that is not being answered is refused',
    !!subjectPlacement.recordAnswer(user.id, TRACK, gradeIds[1], 0, 'right').error);
  check('and so is a question that does not exist',
    !!subjectPlacement.recordAnswer(user.id, TRACK, gradeIds[0], 9, 'right').error);
  check('and a walk that never started has nothing to save to',
    !!subjectPlacement.recordAnswer(user.id, 'spanish', 'entry', 0, 'x').error);

  // Handed in with a request that carries nothing at all: what was saved as the
  // learner went is what gets scored.
  const scored = subjectPlacement.submitGrade(user.id, TRACK, gradeIds[0], []);
  check('the grade is scored from what was saved, even if the request is empty',
    scored.correct === 2, scored.correct);
  check('and the draft is done with once the grade is in',
    subjectPlacement.placementFor(user.id, TRACK).draft === null);
  db.remove('subject_placements', (p) => p.user_id === user.id);
}

console.log('\nthe choices are not in the order they were written in');
{
  // The first sets answered in the first slot 93% of the time, so "pick the
  // first one" was a working strategy. The learner now sees a different order —
  // and the same question always arrives the same way, because a question whose
  // options dance on every visit is its own kind of unfair.
  const q = (prompt) => ({
    band: 'easy', prompt, choices: ['one', 'two', 'three', 'four'], answer: 'one', rationale: 'r',
  });
  const spread = subjectPlacement.spreadChoices(q('What is two plus two?'));
  check('the choices come back in a different order',
    spread.choices.join() !== 'one,two,three,four', spread.choices);
  check('all of them are still there, answer included',
    spread.choices.length === 4 && spread.choices.includes('one') && spread.answer === 'one');
  check('and the same question always arrives the same way',
    subjectPlacement.spreadChoices(q('What is two plus two?')).choices.join() === spread.choices.join());
  check('a question with no options is left alone',
    subjectPlacement.spreadChoices({ prompt: 'p', choices: null }).choices === null);

  const gradeId = rules.gradesFor('iq')[0];
  const seen = subjectPlacement.questionsFor('iq', gradeId) || [];
  const inFirstSlot = seen.filter((x) => Array.isArray(x.choices) && x.choices[0] === x.answer).length;
  check('no grade serves its answer in the same slot every time',
    seen.length > 0 && inFirstSlot < seen.length, inFirstSlot);
  check('and asking twice serves the same order both times',
    subjectPlacement.questionsFor('iq', gradeId).map((x) => (x.choices || []).join()).join('|')
      === seen.map((x) => (x.choices || []).join()).join('|'));
}

console.log('\na question whose options do not contain its answer');
{
  const q = (extra) => ({
    band: 'easy', prompt: 'p', choices: ['a', 'b', 'c', 'd'], answer: 'b', rationale: 'r', ...extra,
  });
  const kept = subjectPlacement.usable(q({}));
  check('a sound question keeps its options', Array.isArray(kept.choices) && kept.choices.length === 4);
  const broken = subjectPlacement.usable(q({ answer: 'nowhere' }));
  check('one whose answer is missing from the options loses them, so it is still answerable',
    broken.choices === null);
  check('and it keeps its prompt and answer, so it can still be asked and marked',
    broken.prompt === 'p' && broken.answer === 'nowhere');
  check('an answer that differs only in spacing still counts as present',
    subjectPlacement.usable(q({ answer: '  b  ' })).choices !== null);
  check('a two-option question falls back to free response rather than a coin toss',
    subjectPlacement.usable(q({ choices: ['b', 'x'] })).choices === null);
  check('blank options are dropped before that is decided',
    subjectPlacement.usable(q({ choices: ['b', '', '  ', 'c'] })).choices === null);
}

console.log('\nthe band is the position, not the label the model gave it');
{
  const q = (band) => ({ band, prompt: 'p', choices: ['a', 'b', 'c', 'd'], answer: 'b', rationale: 'r' });
  check('the seventh question is the capstone even when the model called it easy',
    subjectPlacement.usable(q('easy'), 6).band === 'capstone', subjectPlacement.usable(q('easy'), 6).band);
  check('the first question is easy even when the model called it capstone',
    subjectPlacement.usable(q('capstone'), 0).band === 'easy');
  check('a question with no label at all still gets its position band',
    subjectPlacement.usable({ prompt: 'p', choices: ['a', 'b', 'c', 'd'], answer: 'b' }, 4).band === 'hard');
  check('every position gets the band the mix puts there',
    rules.MIX.every((band, i) => subjectPlacement.usable(q('wrong'), i).band === band));
  check('and the whole grade ends up two easy, two medium, two hard, one capstone whichever way it was labelled',
    Object.entries(rules.MIX.map((band, i) => subjectPlacement.usable(q('nonsense'), i).band)
      .reduce((acc, b) => ({ ...acc, [b]: (acc[b] || 0) + 1 }), {}))
      .map(([b, n]) => `${b}:${n}`).sort().join(' ') === 'capstone:1 easy:2 hard:2 medium:2');
}

console.log('\nnothing leaks to the browser');
{
  const TRACK = 'iq';
  const gradeIds = rules.gradesFor(TRACK);
  const first = subjectPlacement.questionsFor(TRACK, gradeIds[0]);
  const shown = subjectPlacement.sanitize(first[0], 0);
  check('the answer is not sent', shown.answer === undefined);
  check('the rationale is not sent', shown.rationale === undefined);
  check('the band is not sent, so the capstone is not labelled', shown.band === undefined);
  check('the prompt and the choices are sent, or it could not be answered',
    typeof shown.prompt === 'string' && Array.isArray(shown.choices));
  check('the format is set so the renderer knows what to draw',
    shown.format === 'multiple_choice' || shown.format === 'type_in', shown.format);
}

console.log('\nstepping over grades');
{
  const TRACK = 'iq';
  const user = makeUser('skip');
  // Fabricated so the subject looks long enough to be offered a skip at all.
  const gradeIds = Array.from({ length: 40 }, (_, i) => `fake_${i}`);
  const perfect = Array.from({ length: 4 }, (_, i) => ({ grade_id: gradeIds[i], asked: 7, correct: 7 }));

  // Four perfect grades, but the position has already moved past them — the same
  // state a skip leaves behind, and one nothing may be taken from.
  db.insert('subject_placements', {
    user_id: user.id, track_id: TRACK, grade_ids: gradeIds, position: 5, scores: perfect, skipped: [],
  });
  const refused = subjectPlacement.skip(user.id, TRACK, 4);
  check('a skip is refused when none is on offer', refused.error === 'no skip is on offer', refused);

  const row = subjectPlacement.placementFor(user.id, TRACK);
  db.update('subject_placements', row.id, { position: 4 });
  const taken = subjectPlacement.skip(user.id, TRACK, 4);
  check('taking it moves four grades on', taken.skipped === 4 && taken.placement.position === 8, taken && taken.placement.position);
  check('and lands on the fifth', taken.next_grade_id === gradeIds[8]);
  check('the skip is recorded', taken.placement.skipped.length === 1 && taken.placement.skipped[0].count === 4,
    taken.placement.skipped);
  check('and it is not offered again immediately',
    rules.skipOffer(taken.placement.scores, taken.placement.position, gradeIds.length) === null);
  db.remove('subject_placements', (p) => p.user_id === user.id);
}

// ── the percentage is a shape, not a count ─────────────────────────────────
console.log('\nthe percentage is a shape, not a count');
{
  // The worked example that fixes the curve: the first N of the fixed order
  // right. Four — both easy and both medium — is the peak, and every hard
  // cleared on top of it is grade already outgrown, so the number comes DOWN as
  // more of the grade is cleared. A percentage that rises in a straight line
  // with the count is the one thing this quiz must never produce.
  const prefix = (n) => {
    const bands = {};
    rules.MIX.forEach((band, i) => {
      const row = bands[band] || (bands[band] = { asked: 0, correct: 0 });
      row.asked++;
      if (i < n) row.correct++;
    });
    return { asked: 7, correct: n, bands };
  };
  check('the first four right score 90', rules.shapePercent(prefix(4)) === 90, rules.shapePercent(prefix(4)));
  check('the first five right score 75', rules.shapePercent(prefix(5)) === 75, rules.shapePercent(prefix(5)));
  check('the first six right score 50', rules.shapePercent(prefix(6)) === 50, rules.shapePercent(prefix(6)));
  check('all seven right score 20 — the grade is finished', rules.shapePercent(prefix(7)) === 20, rules.shapePercent(prefix(7)));

  const counts = [];
  for (let n = 0; n <= 7; n++) counts.push(rules.shapePercent(prefix(n)));
  const step = counts[1] - counts[0];
  check('the curve is not a straight line in the number answered',
    !counts.every((v, i) => i === 0 || v - counts[i - 1] === step), counts);
  check('it rises to the peak at four and falls after it',
    counts[4] > counts[3] && counts[4] > counts[5] && counts[5] > counts[6] && counts[6] > counts[7], counts);

  const shape = (easy, medium, hard, capstone) => rules.shapePercent({
    asked: 7,
    correct: easy + medium + hard + capstone,
    bands: {
      easy: { asked: 2, correct: easy },
      medium: { asked: 2, correct: medium },
      hard: { asked: 2, correct: hard },
      capstone: { asked: 1, correct: capstone },
    },
  });
  check('four right score 90, 55 or 45 — which four is the whole signal',
    shape(2, 2, 0, 0) === 90 && shape(2, 1, 1, 0) === 55 && shape(1, 2, 1, 0) === 45,
    [shape(2, 2, 0, 0), shape(2, 1, 1, 0), shape(1, 2, 1, 0)]);
  check('a missed easy costs more than a missed medium', shape(1, 2, 0, 0) < shape(2, 1, 0, 0),
    [shape(1, 2, 0, 0), shape(2, 1, 0, 0)]);
  check('a missed capstone costs nothing on its own', shape(2, 2, 2, 0) === 50, shape(2, 2, 2, 0));
  check('and it never outweighs a missed easy question', shape(2, 2, 2, 0) > shape(1, 2, 2, 0),
    [shape(2, 2, 2, 0), shape(1, 2, 2, 0)]);
  check('passing the capstone is the strongest "this grade is finished" signal there is',
    shape(2, 2, 1, 0) - shape(2, 2, 1, 1) > shape(2, 2, 1, 0) - shape(2, 2, 0, 0),
    [shape(2, 2, 1, 0), shape(2, 2, 1, 1), shape(2, 2, 0, 0)]);
  check('a grade sat and scored nothing is 5 — zero is for the grades never reached',
    shape(0, 0, 0, 0) === 5 && rules.shapePercent(null) === 0, [shape(0, 0, 0, 0), rules.shapePercent(null)]);
  check('a row from before the bands were kept is read as a prefix of the order',
    rules.shapePercent({ asked: 7, correct: 4 }) === 90, rules.shapePercent({ asked: 7, correct: 4 }));

  // The same numbers read across a whole walk, with no model involved.
  const row = (id, easy, medium, hard, capstone) => ({
    grade_id: id,
    asked: 7,
    correct: easy + medium + hard + capstone,
    bands: {
      easy: { asked: 2, correct: easy },
      medium: { asked: 2, correct: medium },
      hard: { asked: 2, correct: hard },
      capstone: { asked: 1, correct: capstone },
    },
  });
  const of = (walk) => walk.recommendation.map((r) => r.percent).join(',');

  const peaked = subjectPlacement.recommendFromShape('iq', {
    grade_ids: ['a', 'b', 'c', 'd'],
    scores: [row('a', 2, 2, 0, 0), row('b', 0, 0, 0, 0), row('c', 2, 2, 1, 0)],
  });
  check('the shape fallback names the peak grade', peaked.recommended_grade_id === 'a', peaked.recommended_grade_id);
  check('and carries the shape percentages for every grade', of(peaked) === '90,5,75,0', of(peaked));
  check('and records that no model answered for them', peaked.percent_model === null);

  const collapsed = subjectPlacement.recommendFromShape('iq', {
    grade_ids: ['a', 'b', 'c', 'd'],
    scores: [row('a', 2, 2, 0, 0), row('b', 0, 0, 0, 0), row('c', 0, 0, 0, 0)],
  });
  check('a blank run at the end of the walk is the floor, and everything past it',
    of(collapsed) === '90,0,0,0', of(collapsed));

  const nothing = subjectPlacement.recommendFromShape('iq', {
    grade_ids: ['a', 'b'], scores: [row('a', 0, 0, 0, 0)],
  });
  check('with nothing answerable, the subject starts at its beginning',
    nothing.recommended_grade_id === 'a' && /Nothing in the walk/.test(nothing.headline), nothing.headline);
}

// ── the recommendation ─────────────────────────────────────────────────────
console.log('\nthe recommendation');
{
  const TRACK = 'iq';
  const user = makeUser('recommend');
  const gradeIds = rules.gradesFor(TRACK);
  const row = db.insert('subject_placements', {
    user_id: user.id,
    track_id: TRACK,
    grade_ids: gradeIds,
    position: gradeIds.length,
    scores: [
      { grade_id: gradeIds[0], asked: 7, correct: 7, bands: { easy: { asked: 2, correct: 2 }, medium: { asked: 2, correct: 2 }, hard: { asked: 2, correct: 2 }, capstone: { asked: 1, correct: 1 } } },
      { grade_id: gradeIds[1], asked: 7, correct: 3, bands: { easy: { asked: 2, correct: 2 }, medium: { asked: 2, correct: 1 }, hard: { asked: 2, correct: 0 }, capstone: { asked: 1, correct: 0 } } },
    ],
    skipped: [],
    stop_reason: 'three blank grades and a weak fourth',
  });

  const prompt = subjectPlacement.recommendUserPrompt(TRACK, row);
  check('the prompt names every grade', gradeIds.every((id) => prompt.includes(id)));
  check('the prompt gives the exact score of a grade they took', /7 of 7 right/.test(prompt) && /3 of 7 right/.test(prompt));
  check('and the per-band detail', /easy 2\/2/.test(prompt) && /capstone 0\/1/.test(prompt));
  check('and says why the walk stopped', /three blank grades and a weak fourth/.test(prompt));
  check('and how far it got', new RegExp(`stopped after 2 of ${gradeIds.length} grades`).test(prompt));
  check('the system prompt says the percentages do not sum to a hundred',
    /do not sum to 100/.test(subjectPlacement.recommendSystemPrompt()));

  // The band names on their own mean nothing to a reader that has not been told
  // what they are. Without this the model sees "capstone 0/1" and has no way to
  // know that is the least alarming thing in the grade rather than the most.
  const recSystem = subjectPlacement.recommendSystemPrompt();
  check('the system prompt says the seven are asked two easy, two medium, two hard, one capstone',
    /two easy, two medium, two hard, then one capstone/i.test(recSystem));
  check('and that the capstone is the question only a finished grade can answer',
    /finished every level|worked through every level/.test(recSystem));
  check('and that missing the easy questions is the strongest signal they are not ready',
    /Missing an easy question is the strongest evidence/.test(recSystem));
  check('and that missing the capstone says very little',
    /Missing the capstone says very little/.test(recSystem));
  check('and that passing the capstone is the strongest evidence the grade is finished',
    /Getting the capstone is the strongest evidence/.test(recSystem));
  check('and that a missed capstone alone is not a reason to start there',
    /capstone is missed is a grade they hold|on the strength of the capstone alone/.test(recSystem));
  check('the per-grade prompt repeats the order, so the labels are unambiguous where the scores are',
    /2 easy, 2 medium, 2 hard, 1 capstone/.test(prompt));

  const withSkipped = { ...row, skipped: [{ from: 0, count: 1 }], scores: [row.scores[1]] };
  check('a skipped grade is marked as no evidence',
    /skipped: not answered/.test(subjectPlacement.recommendUserPrompt(TRACK, withSkipped)));

  // Every piece of context, not the tally. A percentage that is meant to be read
  // off the whole answer can only be as good as what the prompt carries, and the
  // first version sent "easy 2/2, hard 0/2" and nothing else.
  const detailed = {
    ...row,
    scores: [{
      grade_id: gradeIds[0],
      asked: 7,
      correct: 4,
      bands: {
        easy: { asked: 2, correct: 2 }, medium: { asked: 2, correct: 2 },
        hard: { asked: 2, correct: 0 }, capstone: { asked: 1, correct: 0 },
      },
      answers: [
        { band: 'easy', format: 'multiple_choice', correct: true, topic: 'series', prompt: 'What comes next: 2, 4, 6, …', given: '8', answer: '8' },
        { band: 'hard', format: 'multiple_choice', correct: false, topic: 'matrices', prompt: 'Which matrix completes the grid?', given: 'B', answer: 'C' },
        { band: 'capstone', format: 'type_in', correct: false, topic: null, prompt: 'Prove the identity.', given: '', answer: 'both sides reduce to x' },
      ],
    }],
  };
  const full = subjectPlacement.recommendUserPrompt(TRACK, detailed);
  check('the prompt gives every question with what they put against the answer',
    /they put "B", the answer is "C"/.test(full));
  check('and names the topic the miss was on', /\[matrices\]/.test(full));
  check('and marks a question left blank as blank', /capstone BLANK:/.test(full));
  check('and carries the shape of the answers alone, as a number to start from',
    /the shape of the answers alone: 90/.test(full));
  check('and what the grade teaches', /teaches: /.test(full) && /topics: /.test(full));
  check('and how hard this grade\'s own seven were pitched',
    /pitched at \(1-10\): easy /.test(full));

  check('the system prompt says the percentage is not a count of how many were answered',
    /NOT is a count of how many were answered/.test(recSystem));
  check('and that it must never be a straight line in the number right',
    /never be a straight line in the number right/.test(recSystem));
  check('and carries the worked shape: four right 90, five 75, six 50',
    /about 90/.test(recSystem) && /about 75/.test(recSystem) && /about 50/.test(recSystem));
  check('and says to move the shape for context only, never for the count',
    /Never move it because more or fewer were answered/.test(recSystem));

  // The model stubbed: it is the parsing and the storage being tested here.
  const realStructured = ai.structured;
  ai.structured = async ({ schemaName, user: u, system }) => {
    if (schemaName !== 'submit_placement_recommendation') return null;
    if (!/7 of 7 right/.test(u)) throw new Error('the prompt lost the score');
    if (!/do not sum to 100/.test(system)) throw new Error('the prompt lost its instructions');
    return {
      recommended_grade_id: gradeIds[1],
      headline: 'Start at the second grade.',
      grades: [
        { grade_id: gradeIds[0], percent: 5, why: 'already have it' },
        { grade_id: 'not_a_real_grade', percent: 99 },
      ],
    };
  };
  const providers = require('../services/providers');
  const realCurrent = providers.current;
  providers.current = (role) => (role === 'placement'
    ? { name: 'stub', modelFor: () => 'stub', isEnabled: () => true }
    : realCurrent(role));

  subjectPlacement.recommend(user.id, TRACK).then((result) => {
    check('the recommendation is stored', !!result && Array.isArray(result.recommendation));
    check('it carries every grade, so the picker has a number for all of them',
      result.recommendation.length === gradeIds.length, result.recommendation.length);
    check('a grade the model left out reads as zero rather than missing',
      result.recommendation.find((r) => r.grade_id === gradeIds[1]).percent === 0);
    check('a grade the model invented is dropped',
      !result.recommendation.some((r) => r.grade_id === 'not_a_real_grade'));
    check('the grade it named is kept', result.recommended_grade_id === gradeIds[1]);
    check('and the headline is kept', /Start at the second grade/.test(result.headline));

    // The provider stub stays in place: restoring it here would leave the next
    // call with no placement provider at all, and it would return null for a
    // reason that has nothing to do with what is being tested.
    // A model that names a grade it never scored falls back to the highest.
    ai.structured = async () => ({
      recommended_grade_id: 'nope',
      headline: 'x',
      grades: gradeIds.map((id, i) => ({ grade_id: id, percent: i === 1 ? 80 : 5 })),
    });
    return subjectPlacement.recommend(user.id, TRACK).then((second) => {
      check('an unknown recommended grade falls back to the highest percentage',
        second && second.recommended_grade_id === gradeIds[1], second && second.recommended_grade_id);

      // With no model at all the feature still answers: the shape of the answers
      // stands on its own rather than the picker showing nothing. And the two
      // grades land where the shape says, which is the whole point — the grade
      // with seven right scores LOWER than the grade with three, because seven
      // right means the grade is finished and three right means its core is
      // theirs and its top is not.
      ai.structured = async () => null;
      return subjectPlacement.recommend(user.id, TRACK).then((third) => {
        check('with no model, the shape of the answers still answers',
          third && Array.isArray(third.recommendation) && third.recommendation.length === gradeIds.length);
        const expectedShape = [20, 70, ...Array(Math.max(0, gradeIds.length - 2)).fill(0)];
        check('and the percentages are the shape, not a count',
          third && third.recommendation.map((r) => r.percent).join(',') === expectedShape.join(','),
          third && third.recommendation.map((r) => r.percent));
        check('and it names the grade at the edge rather than the one finished',
          third && third.recommended_grade_id === gradeIds[1], third && third.recommended_grade_id);
        check('and records that no model answered for them',
          third && third.percent_model === null, third && third.percent_model);

        // The repair pass: the wrong options are the part that gets rewritten,
        // and the repair is checked rather than trusted — the answer has to
        // survive word for word and the shape has to actually stop giving it away.
        const KEEP = 'the answer, kept word for word';
        ai.structured = async ({ schemaName }) => (schemaName === 'submit_repaired_choices'
          ? {
            questions: [
              { n: 0, choices: [KEEP, 'a plausible wrong one', 'another plausible wrong one', 'a third plausible wrong one'] },
              { n: 1, choices: [KEEP, 'short', 'tiny', 'a'] },
              { n: 2, choices: ['a different answer entirely', 'plausible wrong one', 'another plausible one', 'a third wrong one'] },
              { n: 3, choices: [KEEP, 'a plausible wrong one', 'another plausible wrong one'] },
            ],
          }
          : null);
        const item = (n) => ({ n, grade_id: 'g', prompt: `p${n}`, answer: KEEP, choices: [KEEP, 'x', 'yy', 'zzz'] });
        return subjectPlacement.repairChoices([item(0), item(1), item(2), item(3)]).then((fixed) => {
          check('a repair that keeps the answer and fixes the shape is taken', fixed.has(0), [...fixed.keys()]);
          check('and one that still gives the answer away by length is refused', !fixed.has(1));
          check('and one that quietly changes the answer is refused', !fixed.has(2));
          check('and one that loses an option is refused', !fixed.has(3));

          // A reply short of grades is not a set: the walk would ask for a grade
          // that is not there and stop dead in the middle of the subject.
          ai.structured = async () => ({ grades: [{ grade_id: gradeIds[0], questions: [] }] });
          return subjectPlacement.writeQuestionSet(TRACK, {}).then((written) => {
            check('a reply short of grades stores nothing at all', written === null, written);
            check('and the set that was already there is still there',
              savedQuestionSet
                ? !!subjectPlacement.questionSet(TRACK)
                  && subjectPlacement.questionSet(TRACK).grades.length === savedQuestionSet.grades.length
                : !subjectPlacement.questionSet(TRACK));

            ai.structured = realStructured;
            providers.current = realCurrent;

            db.remove('subject_placements', (p) => p.user_id === user.id);
            // The fixture goes and the real set comes back, exactly as it was.
            db.remove('placement_question_sets', (s) => fixtureQuestionSet && s.id === fixtureQuestionSet.id);
            if (savedQuestionSet) {
              const back = { ...savedQuestionSet };
              delete back.id;
              db.insert('placement_question_sets', back);
            }
            db.flush();
            console.log(`\n${failures ? `${failures} failure(s)` : 'all subject placement checks passed'}`);
            process.exit(failures ? 1 : 0);
          });
        });
      });
    });
  }).catch((err) => {
    console.error('subject placement test crashed:', err);
    process.exit(1);
  });
}

// A guard so a silent promise never leaves the process hanging.
setTimeout(() => {
  console.error('subject placement test timed out');
  process.exit(1);
}, 60000).unref();
