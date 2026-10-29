/**
 * Learn from your own material, slice (c): studying a built course (services/material-study.js, routes/materials.js).
 *
 *   node scripts/material-study-test.js
 *
 * Throwaway db, mocked model. End to end: paste -> build course -> placement -> lesson -> mastery -> remediation -> review.
 */
const os = require('os');
const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(os.tmpdir(), `material-study-test-${process.pid}.json`);

const db = require('../config/db');
const materials = require('../services/materials');
const cb = require('../services/course-builder');
const ms = require('../services/material-study');

let failures = 0;
function check(label, ok, detail) {
  if (ok) { console.log(`  ok   ${label}`); return; }
  failures++;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 300)}`}`);
}
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const DAY = 86400000;

const S1 = 'Mitochondria are the organelles that release usable energy from food inside a cell.';
const S2 = 'Chloroplasts capture sunlight and use it to build sugar from carbon dioxide and water.';
const para = (first) => `${first} ${'Cells are the basic unit of life and each part has a job to do. '.repeat(20)}`;
const TEXT = [para(S1), para(S2)].join('\n\n');

function llm() {
  return async (args) => {
    if (args.task === 'material_outline') return { model: 'mock', data: { skills: [
      { id: 'cells', title: 'Inside the cell', summary: 'Organelles.', prerequisites: [], passage_ids: ['p1'] },
      { id: 'photo', title: 'Photosynthesis', summary: 'Sugar from light.', prerequisites: ['cells'], passage_ids: ['p2'] },
    ] } };
    if (args.task === 'material_lesson') {
      const pid = /\[(p\d+)\]/.exec(args.user)[1];
      const quote = { p1: S1, p2: S2 }[pid];
      const q = (n, over = {}) => ({ type: 'multiple_choice', prompt: `Question ${n} about ${pid}?`, choices: ['one', 'two', 'three'], answer_index: 1, explanation: 'Because the passage says so.', passage_id: pid, quote, ...over });
      return { model: 'mock', data: { lesson: { paragraphs: ['Short lesson.'], key_points: ['Key.'] }, questions: [q(1), q(2), q(3), q(4, { type: 'short_answer', answer: 'sugar' })] } };
    }
    const n = (args.user.match(/^\d+\./gm) || []).length;
    return { model: 'mock', data: { verdicts: Array.from({ length: n }, (_, i) => ({ n: i + 1, supported: true })) } };
  };
}

/** Answer a served quiz from the stored key: right for every question, or wrong for the first `wrongN`. */
function answerFrom(course, quiz, wrongN = 0) {
  const keyOf = (qid) => course.skills.flatMap((s) => s.questions).find((q) => q.id === qid);
  const answers = {};
  quiz.questions.forEach((x, i) => {
    const k = keyOf(x.id);
    const right = k.type === 'multiple_choice' ? k.answer_index : k.answer;
    answers[x.id] = i < wrongN ? (k.type === 'multiple_choice' ? (k.answer_index + 1) % k.choices.length : 'nothing relevant') : right;
  });
  return answers;
}

(async () => {
  const u = db.insert('users', { email: 'a@test.invalid', role: 'learner' });
  const other = db.insert('users', { email: 'b@test.invalid', role: 'learner' });
  const m = materials.addPaste(u.id, 'Cell biology', TEXT).value;

  console.log('before a course exists');
  check('state refuses with no course', ms.state(u.id, m.id).code === 'no_course');
  check('a quiz refuses with no course', ms.startQuiz(u.id, m.id, 'placement').code === 'no_course');

  const built = await cb.build(u.id, m.id, { llm: llm() });
  check('course builds', built.course && built.course.status === 'ready', built);
  const course = cb.get(u.id, m.id);

  console.log('the map and locking');
  let st = ms.state(u.id, m.id);
  check('two skills, only the first open', st.total === 2 && st.skills[0].open && !st.skills[1].open, st.skills.map((s) => [s.id, s.open]));
  check('a locked lesson and quiz are refused', ms.lesson(u.id, m.id, 'photo').code === 'locked' && ms.startQuiz(u.id, m.id, 'mastery', 'photo').code === 'locked');
  check('another learner sees nothing', ms.state(other.id, m.id).code === 'no_course');

  console.log('lesson and practice never leak the key');
  const les = ms.lesson(u.id, m.id, 'cells');
  check('lesson has paragraphs and practice', les.skill.lesson.paragraphs.length === 1 && les.skill.practice.length === 4);
  check('no answers, explanations or quotes before answering', !/\"(answer|answer_index|explanation|quote)\"/.test(JSON.stringify(les.skill.practice)));
  check('skill is now learning', ms.state(u.id, m.id).skills[0].status === 'learning');
  const q0 = course.skills[0].questions[0];
  const pr = ms.practice(u.id, m.id, 'cells', q0.id, q0.answer_index);
  check('practice is explained at once, with the quote', pr.correct === true && pr.explanation && pr.quote);
  check('a wrong practice answer is not correct', ms.practice(u.id, m.id, 'cells', q0.id, 0).correct === false);
  check('practice does not change mastery', ms.state(u.id, m.id).skills[0].status === 'learning');

  console.log('short answer grading');
  check('exact and padded answers pass', ms.gradeShort('Sugar', 'sugar') && ms.gradeShort('it makes sugar', 'sugar'));
  check('negated, empty and wrong answers fail', !ms.gradeShort('not sugar', 'sugar') && !ms.gradeShort('', 'sugar') && !ms.gradeShort('salt', 'sugar'));

  console.log('mastery: fail, remediate, pass');
  let quiz = ms.startQuiz(u.id, m.id, 'mastery', 'cells');
  check('quiz has no key and a pass mark of 75%', quiz.pass_mark === 0.75 && quiz.questions.length === 4 && !/\"(answer|answer_index|explanation|quote)\"/.test(JSON.stringify(quiz.questions)));
  let out = ms.submit(u.id, m.id, quiz.quiz_id, answerFrom(course, quiz, 2));
  check('2 of 4 does not master', out.report[0].passed === false && ms.state(u.id, m.id).skills[0].status === 'learning', out.report);
  check('remediation shows the answer, reason and passage for each miss', out.remediation.length === 2 && out.remediation.every((x) => x.correct_answer && x.explanation && x.from_your_material));
  check('a quiz is one shot', ms.submit(u.id, m.id, quiz.quiz_id, {}).code === 'no_quiz');
  check('the photosynthesis skill is still locked', ms.state(u.id, m.id).skills[1].open === false);

  quiz = ms.startQuiz(u.id, m.id, 'mastery', 'cells', { random: () => 0.5 });
  const missedIds = new Set(out.remediation.map((x) => x.id));
  check('missed questions are asked again', quiz.questions.filter((x) => missedIds.has(x.id)).length === 2, quiz.questions.map((x) => x.id));
  out = ms.submit(u.id, m.id, quiz.quiz_id, answerFrom(course, quiz, 1));
  check('3 of 4 (75%) masters it', out.report[0].passed === true && ms.state(u.id, m.id).skills[0].status === 'mastered', out.report);
  st = ms.state(u.id, m.id);
  check('mastering unlocks the next skill and schedules review for tomorrow', st.skills[1].open && st.skills[0].due && !st.skills[0].is_due);

  console.log('placement');
  const q2 = ms.startQuiz(u.id, m.id, 'placement');
  check('placement is one question per skill', q2.questions.length === 2);
  out = ms.submit(u.id, m.id, q2.quiz_id, answerFrom(course, q2, 0));
  check('placement gives no remediation or answers', !out.remediation && out.report.every((k) => k.known));
  check('placement marks the unseen skill known, via placement', ms.state(u.id, m.id).skills[1].via === 'placement' && ms.state(u.id, m.id).skills[0].via === 'quiz');
  check('placement runs once', ms.startQuiz(u.id, m.id, 'placement').code === 'already_placed');

  console.log('spaced review');
  check('nothing is due today', ms.startQuiz(u.id, m.id, 'review').code === 'nothing_due');
  const day1 = Date.now() + DAY + 1000;
  check('both skills are due after a day', ms.state(u.id, m.id, day1).due_count === 2);
  const ds0 = ms.dueSummary(u.id); const ds1 = ms.dueSummary(u.id, day1);
  check('home summary: none due today, two due tomorrow, titles and counts only', ds0.total === 0 && ds1.total === 2 && ds1.materials.length === 1 && ds1.materials[0].material_id === m.id && Object.keys(ds1.materials[0]).sort().join() === 'due_count,material_id,title', ds1);
  check('home summary is private to the learner', ms.dueSummary(other.id, day1).total === 0);
  let rv = ms.startQuiz(u.id, m.id, 'review', null, { now: day1 });
  check('review interleaves the due skills', new Set(rv.questions.map((x) => x.skill)).size === 2 && rv.questions.length <= 8, rv.questions.map((x) => x.skill));
  out = ms.submit(u.id, m.id, rv.quiz_id, answerFrom(course, rv, 0), { now: day1 });
  check('a pass moves the interval up (3 days)', out.report.every((k) => k.passed && k.next_in_days === 3), out.report);
  check('and the skill is not due again right away', ms.state(u.id, m.id, day1 + 2 * DAY).due_count === 0 && ms.state(u.id, m.id, day1 + 3 * DAY + 1000).due_count === 2);
  const day4 = day1 + 3 * DAY + 1000;
  rv = ms.startQuiz(u.id, m.id, 'review', null, { now: day4 });
  out = ms.submit(u.id, m.id, rv.quiz_id, answerFrom(course, rv, 99), { now: day4 });
  check('a miss puts the interval back to 1 day and shows remediation', out.report.every((k) => !k.passed && k.next_in_days === 1) && out.remediation.length === rv.questions.length, out.report);

  console.log('checks on input');
  check('unknown mode and skill are refused', ms.startQuiz(u.id, m.id, 'bogus').code === 'bad_mode' && ms.startQuiz(u.id, m.id, 'mastery', 'nope').code === 'not_found');
  quiz = ms.startQuiz(u.id, m.id, 'mastery', 'cells');
  out = ms.submit(u.id, m.id, quiz.quiz_id, { garbage: 1, [quiz.questions[0].id]: { x: 1 } });
  check('junk answers count as wrong, not as a crash', out.overall.right === 0);
  check('a quiz id from another learner does not work', ms.submit(other.id, m.id, 'abc', {}).code === 'no_course');

  console.log('delete and wiring');
  check('progress exists', !!db.findOne('material_progress', (p) => p.user_id === u.id));
  materials.remove(u.id, m.id);
  check('deleting the material deletes course and progress', !db.findOne('material_progress', (p) => p.user_id === u.id) && !cb.get(u.id, m.id));
  const routes = read('routes/materials.js');
  check('routes are wired and owner-checked', /\/:id\/study'/.test(routes) && /study\/submit/.test(routes) && /ownMaterial/.test(routes));
  check('progress is in export and deletion lists and the db', /material_progress/.test(read('routes/profile.js')) && /material_progress/.test(read('routes/consent.js')) && /material_progress/.test(read('config/db.js')));
  check('the study page keeps the tutor to method hints', /my-material-study/.test(read('services/tutor-context.js')));
  check('the page and script exist; the list page has the course button', fs.existsSync(path.join(__dirname, '..', 'public/my-material-study.html')) && /Make a course/.test(read('public/js/my-material.js')) && /my-material-study/.test(read('public/js/my-material.js')));
  check('home wiring: route before /:id, dashboard card', routes.indexOf("'/review-due'") > 0 && routes.indexOf("'/review-due'") < routes.indexOf("router.get('/:id'") && /review-due/.test(read('public/js/dashboard.js')));
  check('the study script has no answer key logic', !/answer_index/.test(read('public/js/my-material-study.js')));

  try { fs.unlinkSync(process.env.DB_FILE); } catch { /* none */ }
  if (failures) { console.log(`\n${failures} check(s) failed`); process.exit(1); }
  console.log('\nall checks passed');
  process.exit(0);
})();
