/**
 * Focused contract tests for the calibrated English placement quiz. It writes to
 * its own copy of the data file (deleted at the end), never the real one, unless
 * DB_FILE=<file> names one.
 */
process.env.NODE_ENV = 'test';

const fs = require('fs');
const os = require('os');
const path = require('path');

let ownCopy = null;
if (!process.env.DB_FILE) {
  ownCopy = path.join(os.tmpdir(), `english-placement-test-${process.pid}.json`);
  fs.copyFileSync(path.join(__dirname, '..', 'data', 'db.json'), ownCopy);
  process.env.DB_FILE = ownCopy;
}
// config/db is loaded here, on the copy, so its own exit write is registered
// before this cleanup: registered the other way round, the copy was deleted and
// then written back, leaving 140 MB behind each run.
require('../config/db');
process.on('exit', () => { if (ownCopy) try { fs.unlinkSync(ownCopy); } catch { /* gone */ } });

const db = require('../config/db');
const bank = require('../content/english-placement');
const rules = require('../config/subject-placement');
const placement = require('../services/subject-placement');

let failures = 0;
let checks = 0;

function check(label, ok, detail) {
  checks++;
  if (ok) {
    console.log(`  ok   ${label}`);
    return;
  }
  failures++;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
}

const tag = `english-placement-${process.pid}-${Date.now()}`;
const user = db.insert('users', {
  email: `${tag}@example.test`,
  display_name: tag,
  password_hash: 'x',
  onboarded: true,
});

try {
  console.log('\nEnglish placement set');
  const set = bank.questionSet();
  check('has all 16 English grades', set.grades.length === 16);
  check('has 112 questions', set.grades.reduce((n, grade) => n + grade.questions.length, 0) === 112);
  check('passes the stored-question contract', placement.inspectSet(set, set.grade_ids).length === 0,
    placement.inspectSet(set, set.grade_ids));
  check('uses exactly 2 easy, 2 medium, 2 hard, 1 capstone per grade',
    set.grades.every((grade) => {
      const counts = grade.questions.reduce((out, q) => ({ ...out, [q.band]: (out[q.band] || 0) + 1 }), {});
      return counts.easy === 2 && counts.medium === 2 && counts.hard === 2 && counts.capstone === 1;
    }));
  check('does not contain length-based answer cues',
    set.grades.every((grade) => grade.questions.every((q) => !placement.lengthCue(q.choices, q.answer))));
  check('each item has four distinct choices and exactly one keyed answer',
    set.grades.every((grade) => grade.questions.every((q) => q.choices.length === 4
      && new Set(q.choices).size === 4
      && q.choices.filter((choice) => choice === q.answer).length === 1)));
  const conspicuousDistractor = /\b(always|never|everyone|everybody|nobody|no one|impossible|regardless|guaranteed|proves?)\b/i;
  check('distractors avoid conspicuous absolute-word cues',
    set.grades.every((grade) => grade.questions.every((q) =>
      q.choices.filter((choice) => choice !== q.answer).every((choice) => !conspicuousDistractor.test(choice)))));
  function answerLengthOutlier(q) {
    const answerLength = q.answer.trim().length;
    const otherLengths = q.choices.filter((choice) => choice !== q.answer).map((choice) => choice.trim().length);
    const meanOtherLength = otherLengths.reduce((sum, length) => sum + length, 0) / otherLengths.length;
    const longestOther = Math.max(...otherLengths);
    return (answerLength >= 1.45 * meanOtherLength && answerLength - longestOther >= 8)
      || (longestOther >= 1.45 * answerLength && longestOther - answerLength >= 8);
  }
  check('no answer is a conspicuous length outlier among its distractors',
    set.grades.every((grade) => grade.questions.every((q) => !answerLengthOutlier(q))));
  check('prompts and options contain no corrupted apostrophes',
    set.grades.every((grade) => grade.questions.every((q) =>
      !/[A-Za-z]\?[A-Za-z]/.test(`${q.prompt} ${q.answer} ${q.choices.join(' ')}`))));
  const answerPositions = [0, 0, 0, 0];
  let displayedChoicesValid = true;
  for (const grade of set.grades) {
    for (const question of placement.questionsFor('english', grade.grade_id)) {
      displayedChoicesValid = displayedChoicesValid
        && question.choices.length === 4
        && new Set(question.choices).size === 4
        && question.choices.every((choice) => typeof choice === 'string' && choice.length > 0);
      answerPositions[question.choices.indexOf(question.answer)]++;
    }
  }
  check('all displayed choices remain four distinct, nonempty options', displayedChoicesValid);
  check('displayed answers use all four positions without a dominant slot',
    answerPositions.every((count) => count > 0 && count <= 36), answerPositions);
  check('display order is stable when a question is reopened',
    placement.questionsFor('english', 'basics').map((q) => q.choices.join('|')).join('\n')
      === placement.questionsFor('english', 'basics').map((q) => q.choices.join('|')).join('\n'));
  check('no adjacent questions repeat the displayed answer position',
    set.grades.every((grade) => {
      const shown = placement.questionsFor('english', grade.grade_id);
      const positions = shown.map((question) => question.choices.indexOf(question.answer));
      return positions.every((position, index) => index === 0 || position !== positions[index - 1])
        && [0, 1, 2, 3].every((position) => positions.filter((value) => value === position).length >= 1)
        && Math.max(...[0, 1, 2, 3].map((position) => positions.filter((value) => value === position).length)) <= 2;
    }));

  console.log('\nquitting with a partial grade');
  const started = placement.start(user.id, 'english');
  const firstQuestion = bank.GRADES[0].questions[0];
  placement.recordAnswer(user.id, 'english', 'basics', 0, firstQuestion.answer);
  const partial = placement.quit(user.id, 'english', 'basics', [
    { index: 0, answer: firstQuestion.answer },
  ]);
  check('starts at English grade one', started.grade_ids[0] === 'basics');
  check('quit marks the placement finished', !!partial.placement.finished_at);
  check('quit preserves only the answered question as evidence',
    partial.placement.scores.length === 1
      && partial.placement.scores[0].asked === 1
      && partial.placement.scores[0].correct === 1,
    partial.placement.scores);
  check('quit still produces every grade percentage',
    placement.recommendEnglishFromShape('english', partial.placement).recommendation.length === 16);

  console.log('\nquitting before answering');
  const second = db.insert('users', {
    email: `${tag}-empty@example.test`,
    display_name: `${tag}-empty`,
    password_hash: 'x',
    onboarded: true,
  });
  placement.start(second.id, 'english');
  const emptyQuit = placement.quit(second.id, 'english', 'basics', []);
  check('a learner can quit before answering anything', !!emptyQuit.quit && !!emptyQuit.placement.finished_at);
  check('an empty quit remains explicitly provisional',
    placement.recommendEnglishFromShape('english', emptyQuit.placement).recommendation[0].why.includes('provisional'));
  db.remove('subject_placements', (row) => row.user_id === second.id);
  db.remove('users', (row) => row.id === second.id);
} finally {
  db.remove('subject_placements', (row) => row.user_id === user.id);
  db.remove('users', (row) => row.id === user.id);
  db.flush();
}

console.log(`\n${failures ? `${failures} failure(s)` : `all ${checks} English placement checks passed`}`);
process.exit(failures ? 1 : 0);
