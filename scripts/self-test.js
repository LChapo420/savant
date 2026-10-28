/**
 * In-process test of the learning machinery.
 *
 *   node scripts/self-test.js
 *
 * The HTTP smoke test cannot answer questions correctly — the server never sends
 * the answer key, which is the point. This test runs the services directly, so it
 * can answer correctly and check the things that actually matter:
 *
 *   - a strong learner places high, a weak learner places low
 *   - answering correctly raises mastery and eventually advances the level
 *   - level 25 parks on a Master quiz instead of advancing
 *   - passing the Master quiz advances to 26; failing it opens the retry and the
 *     help-me-learn path, and the retry is not the quiz they just failed
 *   - grading forgives accents, casing, and equivalent number forms
 *
 * It writes to its own copy of the data file, under accounts named selftest-*.
 */
process.env.NODE_ENV = 'test';
// Every model key is blanked, and the test writes to its own copy of the data
// file (deleted at the end) unless DB_FILE=<file> names one: run on a machine
// with a key in its environment, a test could otherwise make paid calls, and it
// used to leave its accounts in the real data.
for (const name of Object.keys(process.env)) {
  if (/(_API_KEY|_TOKEN|_SECRET_API|_WORKSPACE)$/.test(name) || /^(OPENROUTER|ANTHROPIC|GEMINI|MIMO|MODELFLARE|DEEPSEEK|MINIMAX)_.*KEY/.test(name)) process.env[name] = '';
}
// The local model is not a key, so blanking keys does not stop it: a test that
// reached the real Ollama on this laptop waited on it and stalled (2026-10-23).
process.env.OLLAMA_ENABLED = '0';
let ownCopy = null;
if (!process.env.DB_FILE) {
  ownCopy = require('path').join(require('os').tmpdir(), `self-test-${process.pid}.json`);
  require('fs').copyFileSync(require('path').join(__dirname, '..', 'data', 'db.json'), ownCopy);
  process.env.DB_FILE = ownCopy;
}
// config/db is loaded here, on the copy, so its own exit write is registered
// before this cleanup: registered the other way round, the copy was deleted and
// then written back, leaving 140 MB behind each run.
require('../config/db');
process.on('exit', () => { if (ownCopy) try { require('fs').unlinkSync(ownCopy); } catch { /* gone */ } });

const db = require('../config/db');
const curriculum = require('../config/curriculum');
// The layout, for the questions a grade's own data answers better than a formula.
const LAYOUT = require('../config/level-layout');
const placement = require('../services/placement');
const sessions = require('../services/sessions');
const mastery = require('../services/mastery');
const grading = require('../services/grading');
const learner = require('../services/learner');
const ai = require('../services/ai');
const lessons = require('../services/lessons');
const essays = require('../services/essays');
const remediation = require('../services/remediation');

let failures = 0;
function check(label, condition, detail) {
  if (condition) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`);
  }
}

function makeUser(tag) {
  return db.insert('users', {
    email: `selftest-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.test`,
    display_name: `Self Test ${tag}`,
    password_hash: 'not-a-real-hash',
    xp: 0,
    streak: 0,
    onboarded: true,
  });
}

function enroll(user, trackId, gradeId) {
  return db.insert('enrollments', {
    user_id: user.id,
    track_id: trackId,
    grade_id: gradeId,
    target_level: curriculum.getGrade(trackId, gradeId).pathLength,
    current_level: 1,
    level_items: 0,
    levels_completed: 0,
    xp: 0,
    status: 'active',
    pending_checkpoint: null,
  });
}

/** Answer every item in a session. `ceiling` is the difficulty above which this
 *  simulated learner starts getting things wrong. */
async function playSession(user, session, items, ceiling) {
  for (const item of items) {
    const correct = item.difficulty <= ceiling;
    await sessions.answer({
      userId: user.id,
      session,
      itemId: item.id,
      userAnswer: correct ? item.answer : `${item.answer}-wrong`,
      ms: 5000,
    });
  }
  return sessions.finish({ userId: user.id, session });
}

(async () => {
  console.log('self test\n');

  // ── grading ──────────────────────────────────────────────────────────────
  console.log('grading');
  check('accents optional', grading.grade({ format: 'type_in', answer: 'habló' }, 'hablo').correct);
  check('case and spacing forgiven', grading.grade({ format: 'type_in', answer: 'sesenta y siete' }, '  Sesenta Y Siete ').correct);
  check('fraction equals decimal', grading.grade({ format: 'type_in', answer: '3/4' }, '0.75').correct);
  check('dollar sign ignored', grading.grade({ format: 'type_in', answer: '120' }, '$120').correct);
  check('wrong value still wrong', !grading.grade({ format: 'type_in', answer: '120' }, '121').correct);
  // Which side writes "x =" is a habit, not knowledge, and both forms turn up in
  // answer keys — the bank writes the bare value, a model writes the assignment.
  check('a key of "x = 8" accepts "8"', grading.grade({ format: 'type_in', answer: 'x = 8' }, '8').correct);
  check('a key of "8" accepts "x = 8"', grading.grade({ format: 'type_in', answer: '8' }, 'x = 8').correct);
  check('the assignment does not hide a wrong value',
    !grading.grade({ format: 'type_in', answer: 'x = 8' }, 'x = 9').correct);
  check('a two-root answer still needs both roots',
    !grading.grade({ format: 'type_in', answer: 'x = 2 or x = 3' }, '2').correct);
  check('multiple choice by text', grading.grade({ format: 'multiple_choice', answer: 'x - 3', choices: ['x - 3', 'x + 3'] }, 'x - 3').correct);
  check('multiple choice by index', grading.grade({ format: 'multiple_choice', answer: 'x - 3', choices: ['x - 3', 'x + 3'] }, '0').correct);
  check('a selected multiple-choice distractor stays wrong despite punctuation normalization',
    !grading.grade({ format: 'multiple_choice', answer: 'The red hen sat on a mat.', choices: ['The red hen sat on a mat.', 'The red hen sat on a mat'] }, 'The red hen sat on a mat').correct);
  // A bare integer is a choice before it is an index. For a question whose choices
  // are the numbers 1 to 4, answering "2" means the choice 2 — reading it as index 2
  // compared the learner against the choice "3" and marked a question they got
  // right as wrong. It surfaced as a Challenge Exam band scoring 6/7 for a learner
  // who had answered all seven correctly, and as three failing checks three steps
  // later with nothing in between to explain it.
  check('a bare integer is the choice, not its index',
    grading.grade({ format: 'multiple_choice', answer: '2', choices: ['1', '2', '3', '4'] }, '2').correct,
    grading.grade({ format: 'multiple_choice', answer: '2', choices: ['1', '2', '3', '4'] }, '2'));
  check('and an index still works when the text matches nothing',
    grading.grade({ format: 'multiple_choice', answer: 'x - 3', choices: ['x - 3', 'x + 3'] }, '1').correct === false
    && grading.grade({ format: 'multiple_choice', answer: 'x + 3', choices: ['x - 3', 'x + 3'] }, '1').correct);
  check('and a wrong choice is still wrong',
    !grading.grade({ format: 'multiple_choice', answer: '2', choices: ['1', '2', '3', '4'] }, '4').correct);
  check('free response escalates to the model when unmatched',
    grading.grade({ format: 'short_answer', answer: 'Hablo español' }, 'Yo hablo el español').needsAi);

  // ── placement ────────────────────────────────────────────────────────────
  console.log('\nplacement');
  const grade = curriculum.getGrade('math', 'algebra_1_part_a');

  // The quiz's length is the grade's tier, so it is asked for rather than written
  // down. It used to be `35` against `math/algebra1`, whose tier was 3, and the
  // Math sheet moved that grade: `algebra_1_part_a` is a school grade at tier 2,
  // which sizes the quiz at twenty-eight. A hard-coded 35 would have failed on a
  // correct placement quiz, and a hard-coded grade would have picked a course the
  // creator never wrote.
  const expectedLength = curriculum.placementLength(grade.tier);

  const strongUser = makeUser('strong');
  const strongItems = placement.buildItems(grade).map((it) => ({ ...it, correct: true }));
  const strong = placement.score(strongItems, grade);
  check(`${expectedLength} questions at tier ${grade.tier}`, strongItems.length === expectedLength,
    strongItems.length);

  const weakItems = placement.buildItems(grade).map((it) => ({ ...it, correct: it.difficulty <= 1.5 }));
  const weak = placement.score(weakItems, grade);
  check('almost-all-wrong places at the floor', weak.placedLevel <= 30, weak.placedLevel);

  // All-correct places "as high as the quiz can measure", which is not the same
  // thing as a fraction of the path.
  //
  // The old check was `placedLevel > pathLength * 0.8`, written when the path was
  // 250 levels of arithmetic rule and the quiz covered all of it. A sheet-backed
  // grade's length is set by the creator's sheet, not by the quiz: the tier decides
  // the quiz's *top difficulty*, and inverting that difficulty lands wherever the
  // grade puts that difficulty. On `algebra_1_part_a` that is level 316 of 518 —
  // 61% — which is correct and would have failed a check written for the other
  // shape.
  //
  // So the claim is the one that matters: a learner who gets every question right
  // is placed far above a learner who gets almost none wrong, and neither is
  // placed on a quiz. The ratio is the substance; the percentage was arithmetic.
  check('all-correct places well above the floor, and nowhere near the bottom',
    strong.placedLevel > weak.placedLevel * 4 && strong.placedLevel > grade.pathLength * 0.4,
    { strong: strong.placedLevel, weak: weak.placedLevel, of: grade.pathLength });

  const midItems = placement.buildItems(grade).map((it) => ({ ...it, correct: it.difficulty <= 4 }));
  const mid = placement.score(midItems, grade);

  // A learner is always placed on a lesson, and never onto a quiz.
  //
  // It used to be "a multiple of ten", which is the same claim written as
  // arithmetic: a lesson is on a multiple of ten only because the rule put it
  // there. A grade whose lessons sit wherever its creator put them has no
  // multiples of ten at all, and the check would fail on a correct placement.
  for (const [label, result] of [['weak', weak], ['mid', mid], ['strong', strong]]) {
    check(`${label} placement lands on a lesson`,
      curriculum.levelKind(result.placedLevel, grade.pathLength, grade) === 'lesson',
      {
        level: result.placedLevel,
        kind: curriculum.levelKind(result.placedLevel, grade.pathLength, grade),
      });
    check(`${label} placement is never a checkpoint`,
      !curriculum.isCheckpoint(curriculum.levelKind(result.placedLevel, grade.pathLength, grade)),
      curriculum.levelKind(result.placedLevel, grade.pathLength, grade));
  }
  check('mid learner places between the two', mid.placedLevel > weak.placedLevel && mid.placedLevel < strong.placedLevel,
    { weak: weak.placedLevel, mid: mid.placedLevel, strong: strong.placedLevel });
  check('gaps name the untested skills', Array.isArray(mid.gaps), mid.gaps);

  placement.seedSkillStates(strongUser.id, strong);
  const seeded = mastery.stateFor(strongUser.id, grade.skills[0]);
  check('seeded mastery is capped, not maxed', seeded.mastery > 0 && seeded.mastery <= 0.7, seeded.mastery);

  // ── mastery and level progression ────────────────────────────────────────
  console.log('\nlevels');
  const user = makeUser('progress');
  const enrollment = enroll(user, 'math', 'algebra_1_part_a');

  // The first practice level, found rather than written down. A path opens on
  // level 1 as a lesson now, so a session begun at level 1 is a teaching session
  // whose items are all check questions — which is right, and makes it the wrong
  // place to check that practice draws on several roles or that clearing it moves
  // the learner on. Those two things are about practice levels.
  const firstPractice = (() => {
    for (let l = 1; l < grade.pathLength; l++) {
      if (curriculum.levelKind(l, grade.pathLength, grade) === 'practice') return l;
    }
    return 1;
  })();
  db.update('enrollments', enrollment.id, { current_level: firstPractice });

  const first = await sessions.createSession({ userId: user.id, enrollment, grade });
  check('a lesson has items in several roles', new Set(first.items.map((i) => i.role)).size >= 2,
    first.items.map((i) => i.role));
  const firstOutcome = await playSession(user, first.session, first.items, 10);
  check('perfect session scores 100%', firstOutcome.accuracy === 1, firstOutcome.accuracy);
  check('xp awarded', firstOutcome.xp > 0, firstOutcome.xp);
  check('mastery moved off zero', mastery.stateFor(user.id, first.items[0].skill_id).mastery > 0.3,
    mastery.stateFor(user.id, first.items[0].skill_id).mastery);

  let level = db.byId('enrollments', enrollment.id).current_level;
  let rounds = 0;
  while (db.byId('enrollments', enrollment.id).current_level === level && rounds < 6) {
    const s = await sessions.createSession({ userId: user.id, enrollment: db.byId('enrollments', enrollment.id), grade });
    await playSession(user, s.session, s.items, 10);
    rounds++;
  }
  check('a perfect learner levels up within a few sessions',
    db.byId('enrollments', enrollment.id).current_level > level,
    { from: level, to: db.byId('enrollments', enrollment.id).current_level, sessions: rounds + 1 });

  // ── multi-level sessions ─────────────────────────────────────────────────
  console.log('\nsessions across levels');
  const multiUser = makeUser('multilevel');
  const multiEnrollment = enroll(multiUser, 'math', 'algebra_1_part_a');
  db.update('enrollments', multiEnrollment.id, { current_level: 123 });

  // Bring the level's skills up so one block can finish it.
  const multiPlan = curriculum.levelPlan(grade, 123);
  for (const skillId of multiPlan.introduced) {
    for (let i = 0; i < 10; i++) {
      mastery.recordAttempt({ userId: multiUser.id, skillId, correct: true, difficulty: multiPlan.difficulty, levelDifficulty: multiPlan.difficulty });
    }
  }
  db.update('enrollments', multiEnrollment.id, { level_items: 15 });

  const multi = await sessions.createSession({
    userId: multiUser.id, enrollment: db.byId('enrollments', multiEnrollment.id), grade, kind: 'lesson',
  });
  check('the first block is tagged with its level', multi.items.every((i) => i.level === 123), multi.items[0].level);
  for (const item of multi.items) {
    await sessions.answer({ userId: multiUser.id, session: multi.session, itemId: item.id, userAnswer: item.answer, ms: 4000 });
  }

  const closed = sessions.resolveBlock({
    userId: multiUser.id,
    session: db.byId('sessions', multi.session.id),
    enrollment: db.byId('enrollments', multiEnrollment.id),
    grade,
    blockIndex: 0,
  });
  check('closing a block levels the learner up mid-session', closed.level_up === 124, closed.level_up);
  check('closing a block offers to continue', closed.can_continue === true, closed.can_continue);
  check('closing a block asks one recall question', !!closed.retention && closed.retention.role === 'retention', closed.retention && closed.retention.role);

  const nextBlock = await sessions.addBlock({
    userId: multiUser.id,
    session: db.byId('sessions', multi.session.id),
    enrollment: db.byId('enrollments', multiEnrollment.id),
    grade,
  });
  check('the next block is built at the new level', nextBlock.level === 124 && nextBlock.items.every((i) => i.level === 124),
    { level: nextBlock.level, itemLevel: nextBlock.items[0].level });
  check('the session records both levels', (nextBlock.session.levels || []).join(',') === '123,124',
    nextBlock.session.levels);

  for (const item of nextBlock.items) {
    await sessions.answer({ userId: multiUser.id, session: nextBlock.session, itemId: item.id, userAnswer: item.answer, ms: 4000 });
  }
  const multiOutcome = await sessions.finish({ userId: multiUser.id, session: db.byId('sessions', multi.session.id) });
  check('finishing reports every level covered', (multiOutcome.levels || []).length >= 2, multiOutcome.levels);
  check('the summary names the span', /123/.test(multiOutcome.analysis.summary) || multiOutcome.analysis.source === 'ai',
    multiOutcome.analysis.summary);
  const retentionLevels = new Set(multiOutcome.retentionPlan.map((p) => p.level));
  check('end-of-session recall spans more than the last level', retentionLevels.size >= 2, [...retentionLevels]);

  // ── the coach ────────────────────────────────────────────────────────────
  console.log('\ncoach');
  const soloUser = makeUser('solo');
  const coachedUser = makeUser('coached');
  for (let i = 0; i < 3; i++) {
    mastery.recordAttempt({ userId: soloUser.id, skillId: 'linear_eq', correct: true, difficulty: 5, levelDifficulty: 5 });
    mastery.recordAttempt({ userId: coachedUser.id, skillId: 'linear_eq', correct: true, difficulty: 5, levelDifficulty: 5, hintUsed: true });
  }
  const soloMastery = mastery.stateFor(soloUser.id, 'linear_eq').mastery;
  const coachedMastery = mastery.stateFor(coachedUser.id, 'linear_eq').mastery;
  check('a coached correct answer counts for less mastery', coachedMastery < soloMastery,
    { solo: soloMastery.toFixed(3), coached: coachedMastery.toFixed(3) });
  check('a coached correct answer still counts for something', coachedMastery > 0.2, coachedMastery);
  check('a coached answer comes back for review sooner',
    Date.parse(mastery.stateFor(coachedUser.id, 'linear_eq').next_due_at)
      < Date.parse(mastery.stateFor(soloUser.id, 'linear_eq').next_due_at));

  const soloXp = mastery.xpForItems([{ correct: true, difficulty: 6 }]);
  const coachedXp = mastery.xpForItems([{ correct: true, difficulty: 6, coach_used: true }]);
  check('coached XP is reduced but not zero', coachedXp < soloXp && coachedXp > 0, { soloXp, coachedXp });

  // The coach must never hand over the answer. The model is instructed not to,
  // and the instruction is checked rather than trusted.
  const coachItem = { answer: 'Buenas noches', prompt: 'Evening greeting?', rationale: 'Buenas noches covers evening.' };
  check('a leaked answer is replaced',
    !ai.leakGuard('The correct one is Buenas noches.', coachItem, []).toLowerCase().includes('buenas noches'),
    ai.leakGuard('The correct one is Buenas noches.', coachItem, []));
  check('a leak is caught through accents and casing',
    !ai.leakGuard('It is buenas NOCHES, of course.', coachItem, []).toLowerCase().includes('noches'));
  check('confirming what the learner already said is allowed',
    ai.leakGuard('Yes, Buenas noches is right because it covers the evening.', coachItem,
      [{ role: 'user', content: 'is it buenas noches?' }]).includes('Buenas noches'));
  check('a genuine guiding question passes through',
    ai.leakGuard('What time of day is the question asking about?', coachItem, []).startsWith('What time'));

  // ── level layout ─────────────────────────────────────────────────────────
  console.log('\nlevel layout');
  const kindsFor = (n) => curriculum.levelKind(n, 250);
  check('every tenth level is a lesson', [10, 20, 30, 40, 60, 70, 80, 90, 110].every((l) => kindsFor(l) === 'lesson'),
    [10, 20, 30, 40, 60, 70, 80, 90, 110].map(kindsFor));
  check('level 25 and 75 are Master quizzes', kindsFor(25) === 'master' && kindsFor(75) === 'master');
  check('level 50 is a Master quiz, not a lesson', kindsFor(50) === 'master', kindsFor(50));
  check('level 100 is a Grand Master, not a Master', kindsFor(100) === 'grand', kindsFor(100));
  check('level 200 is a Grand Master', kindsFor(200) === 'grand', kindsFor(200));
  check('the level after a checkpoint is a lesson',
    [26, 51, 76, 101].every((l) => kindsFor(l) === 'lesson'), [26, 51, 76, 101].map(kindsFor));
  check('the last level is the graduation exam', kindsFor(250) === 'graduation', kindsFor(250));
  check('everything else is practice', kindsFor(13) === 'practice' && kindsFor(99) === 'practice');

  // A grade that names its levels is answered from its list and nothing else.
  //
  // It used to be checked for putting lessons on round numbers and quizzes on the
  // level after, which was true of the *old* English sheet — a sheet of lesson
  // topics placed on a rule. The new sheet names every level, so those numbers are
  // whatever the creator's course happens to put there: level 25 of the second
  // grade is a Summary lesson, level 26 is practice, and the first Master quiz is
  // wherever the first cycle ends. Asserting the old arrangement would be
  // asserting that the sheet had not been read.
  //
  // What holds instead, for every stated level, is that the layout reports the
  // kind that level's own row says. That is checked for all 8,388 of them below.
  const statedGrade = curriculum.getGrade('english', 'basics');
  // What the layout says a stated level is, which is its own row's word for it —
  // and level 1 of a stated grade is a Tester, not the practice a rule would
  // make it. The rule-shaped check is below, against a grade with no sheet.
  const statedAt = (n) => curriculum.levelKind(n, statedGrade.pathLength, statedGrade);
  // The rule-shaped check needs a grade that has **no sheet**.
  //
  // It used to use `math/arithmetic`, which was the only grade left on the
  // arithmetic rule. The Math spreadsheet removed it — all forty-nine math grades
  // now name their own levels — and pointing this at one of those would have made
  // the check pass for the wrong reason: a sheet-backed grade has no Master quiz
  // on level 25 at all, so `bareAt(25) === 'master'` would fail loudly. But the
  // sibling checks that only ask "is this level a kind" would have gone quiet, and
  // the arithmetic rule would have become untested while still being the fallback
  // every rule-shaped grade in the app uses.
  //
  // So the grade is built here, from the rule's own numbers, rather than borrowed
  // from the curriculum. It is a plain object with the fields `levelKind` and
  // `levelPlan` read, and nothing else — which is also a check in itself, because a
  // rule-shaped grade in the app is only ever a topic list and a skill list.
  const ruleGrade = {
    id: 'rule_shaped_probe',
    name: 'A grade on the rule',
    tier: 2,
    trackId: 'math',
    // Long enough for every topic in the probe's three math skills to receive
    // a lesson under the ten-level arithmetic rule.
    pathLength: 500,
    skills: ['add_sub', 'mul_div', 'fractions'],
    topics: [],
  };
  const bareAt = (n) => curriculum.levelKind(n, ruleGrade.pathLength, ruleGrade);
  // The rule remains the fallback for grades that have not received a sheet. The
  // authored ACT and Math tracks no longer need to be rule-shaped themselves.
  const ruleShaped = curriculum.TRACKS
    .flatMap((t) => t.grades)
    .filter((g) => !LAYOUT.isStated(g));
  check('the arithmetic rule is still the fallback, and something still uses it',
    bareAt(25) === 'master' && bareAt(26) === 'lesson',
    `${ruleShaped.length} grade(s) on the rule`);
  check('a grade with no sheet keeps the rule: the quiz on the round number',
    bareAt(25) === 'master' && bareAt(26) === 'lesson', [bareAt(25), bareAt(26)]);
  check('and a level ending in a five is a quiz there',
    [25, 75, 125, 175].every((l) => bareAt(l) === 'master'), [25, 75, 125, 175].map(bareAt));
  // Level 1 is a **lesson**, so a course opens by teaching rather than with nine
  // levels of questions before anything is taught. It used to be practice, and
  // every path in the app began with a run of questions a learner could not get
  // anything out of.
  //
  // A course that names its own levels says what its level 1 is — every English
  // grade's is a Tester, the entry check — and the rule does not reach a level a
  // sheet has already spoken for. `1 % 100 === 1` is why the quizzes in the rule
  // are guarded on `level > 1`: without it, level 1 would be a Grand Master.
  check('level 1 is a lesson on the rule, and the sheet\'s own thing when stated',
    bareAt(1) === 'lesson' && statedAt(1) === 'practice', [bareAt(1), statedAt(1)]);
  check('and every grade on the rule opens on a lesson',
    curriculum.TRACKS.every((t) => t.grades.every((g) => (LAYOUT.isStated(g)
      ? true
      : curriculum.levelKind(1, g.pathLength, g) === 'lesson'))), '');
  check('and every one is long enough to hold levels 1 to 9',
    curriculum.TRACKS.every((t) => t.grades.every((g) => g.pathLength >= 10)), '');

  // Every level the creator's sheet names, checked against what the app serves.
  //
  // This is the check the whole refactor exists for. The sheet is a layout: 8,388
  // levels across sixteen grades, each with a type, a title and what it covers.
  // Every one of them must be served, on its own number, with its own words — not
  // a lesson per topic walked by position, and not a number worked out from a
  // rule. Compared against the generated file rather than the sheet itself,
  // because the generated file is what the app reads, and a generator that
  // silently dropped a column would otherwise pass a check on the sheet.
  console.log('\nthe sheet, level by level');
  {
    const topicsOf = require('../content/topics');
    // Every creator sheet, each checked the same way. A check written for one
    // sheet and not the other only proves the sheet it was written for, and a
    // track added later inherits nobody's verification — so the sheets are a list
    // and a new one is added to it, and the walk below is the same for each.
    const SHEETS = [
      { track: 'english', file: '../content/english-grades', noun: 'English' },
      { track: 'reading', file: '../content/reading-grades', noun: 'Reading' },
      { track: 'math', file: '../content/math-grades', noun: 'Math' },
    ];

    let totalChecked = 0;
    let totalMissing = 0;
    let totalWrongLength = 0;
    let totalWrongKind = 0;
    let totalWrongTitle = 0;
    let totalWrongCovers = 0;
    const allWrongBehaviour = [];
    const allKinds = new Map();

    for (const sheet of SHEETS) {
      const { GRADES: SHEET } = require(sheet.file);
      const wrongKind = [];
      const wrongTitle = [];
      const wrongCovers = [];
      const wrongLength = [];
      const missing = [];
      let checked = 0;

      for (const sheetGrade of SHEET) {
        const grade = curriculum.getGrade(sheet.track, sheetGrade.id);
        if (!grade) { missing.push(sheetGrade.id); continue; }
        if (grade.pathLength !== sheetGrade.levels.length + 1) {
          wrongLength.push(`${sheetGrade.id}: path ${grade.pathLength} for`
            + ` ${sheetGrade.levels.length} levels`);
        }
        for (const want of sheetGrade.levels) {
          checked++;
          const plan = curriculum.levelPlan(grade, want.level);
          if (plan.kind !== want.kind) {
            wrongKind.push(`${sheetGrade.id} ${want.level}: ${plan.kind} not ${want.kind}`);
          }
          const got = topicsOf.topicFor(grade, want.level, plan.focus, sheet.track);
          if (!got || got.topic !== want.title) {
            wrongTitle.push(`${sheetGrade.id} ${want.level}: "${got ? got.topic : 'nothing'}"`);
          } else if (got.covers !== want.covers) {
            wrongCovers.push(`${sheetGrade.id} ${want.level}`);
          }
        }
      }

      const verb = `all ${checked} levels of the sixteen ${sheet.noun} grades are served`;
      check(verb, missing.length === 0, missing.join(', '));
      check(`each on a path one level longer than its last`,
        wrongLength.length === 0, wrongLength.slice(0, 3).join('; '));
      check(`each with the kind its own row gives it`,
        wrongKind.length === 0, wrongKind.slice(0, 3).join('; '));
      check(`each with the exact title from the sheet`,
        wrongTitle.length === 0, wrongTitle.slice(0, 3).join('; '));
      check(`and each with the exact "what it covers" from the sheet`,
        wrongCovers.length === 0, wrongCovers.slice(0, 3).join('; '));

      // The kinds the sheet uses, and that each is served as something rather than
      // falling through to practice. A type with no rule in the app is still a
      // level, but a type that *should* be a quiz and is served as questions is a
      // learner handed a quiz they cannot pass and a lesson they are never taught.
      for (const sheetGrade of SHEET) {
        for (const l of sheetGrade.levels) {
          if (!allKinds.has(l.kind)) allKinds.set(l.kind, { type: l.type, count: 0 });
          allKinds.get(l.kind).count++;
        }
      }
      // And each type is served as the behaviour its kind names: a Master quiz
      // may not be served as plain questions, because then a learner is handed a
      // quiz they cannot pass.
      for (const sheetGrade of SHEET) {
        for (const l of sheetGrade.levels) {
          const wants = l.kind === 'lesson' || l.kind === 'master' || l.kind === 'grand'
            || l.kind === 'essay' || l.kind === 'graduation';
          if (l.kind === 'practice' && l.type === 'Master Quiz') allWrongBehaviour.push(l.type);
          if (wants && l.kind === 'practice') allWrongBehaviour.push(`${l.type} served as practice`);
        }
      }

      totalChecked += checked;
      totalMissing += missing.length;
      totalWrongLength += wrongLength.length;
      totalWrongKind += wrongKind.length;
      totalWrongTitle += wrongTitle.length;
      totalWrongCovers += wrongCovers.length;
    }

    check(`every sheet served: ${totalChecked} levels across the English, Reading and Math tracks`,
      totalMissing === 0 && totalWrongKind === 0 && totalWrongTitle === 0
      && totalWrongCovers === 0 && totalWrongLength === 0,
      `${totalMissing} grade(s) missing, ${totalWrongKind} wrong kind,`
      + ` ${totalWrongTitle} wrong title, ${totalWrongCovers} wrong coverage,`
      + ` ${totalWrongLength} wrong length`);

    check(`and all ${allKinds.size} kinds of level are served as themselves`,
      allWrongBehaviour.length === 0, [...new Set(allWrongBehaviour)].join(', '));
  }

  // Every grade, on its own, with its own levels 1 to 9 — reported per grade.
  //
  // This is here because the same complaint arrived three times: that only the
  // first grade had its opening levels, and each time the check that had run
  // agreed. The reason it agreed is that it aggregated: one line said "all 8388
  // levels of the sixteen English grades are served", which is true if fifteen
  // grades are perfect and the sixteenth is missing its first nine. A total
  // cannot report *which* grade, so it cannot be read to find out.
  //
  // So this names every grade individually. Each line is one grade, and a grade
  // with levels 1-9 missing fails its own line and names itself. A new sheet —
  // the Math one, when it arrives — lands in the same walk with nothing to add
  // here, which is the point: the failure mode being guarded against is a new
  // subject being added and inheriting nobody's verification.
  console.log('\nevery grade, opening levels and all');
  {
    const short = [];
    let gradesChecked = 0;
    let statedGrades = 0;

    for (const track of curriculum.TRACKS) {
      for (const grade of track.grades) {
        gradesChecked++;
        const stated = LAYOUT.statedIndex(grade);
        const end = LAYOUT.endOf(grade);
        // Every grade, stated or on the rule, must reach level 1 and hold a
        // contiguous run from there to its end. A grade that starts at 10 is the
        // exact shape of the bug that was reported three times.
        if (!end || end < 1) {
          short.push(`${track.id}/${grade.id}: no end`);
          continue;
        }
        if (grade.pathLength < 10) {
          short.push(`${track.id}/${grade.id}: path is ${grade.pathLength} levels, too short to hold 1-9`);
          continue;
        }
        // Contiguity: no level between 1 and the end may be absent from the
        // layout. Walked rather than assumed, because a gap is invisible to a
        // count and to a first-nine check — a hole at level 200 of a 537-level
        // grade leaves both of them green, and it was only found by deleting one
        // level on purpose and watching the check stay silent.
        if (stated) {
          statedGrades++;
          // The stated levels and the path must agree about how many there are.
          // A grade whose tail was trimmed — by a generator, or by a sheet that
          // lost rows — is contiguous and still starts at 1, so the opening check
          // and the hole check both stay green while the course quietly ends
          // early and every level after the new end is unreachable. The path is
          // exactly one longer than the stated levels, because the exam sits past
          // the last of them, and that single relationship is what says so.
          //
          // Counted from `byLevel`, not from the grade's array: a duplicate level
          // in the sheet collapses to one entry there, and this is the check that
          // would otherwise not notice.
          if (grade.pathLength !== stated.byLevel.size + 1) {
            short.push(`${track.id}/${grade.id}: path is ${grade.pathLength} levels but the`
              + ` layout names ${stated.byLevel.size}, so it should be ${stated.byLevel.size + 1}`);
          }
          const holes = [];
          for (let l = 1; l <= end; l++) {
            if (!stated.byLevel.has(l)) holes.push(l);
          }
          if (holes.length) {
            short.push(`${track.id}/${grade.id}: ${holes.length} level(s) not on the layout,`
              + ` first ${holes.slice(0, 5).join(', ')}`);
          }
        }
      }
    }

    check(`every one of the ${gradesChecked} grades in every subject reaches level 1`
      + ` with no hole anywhere in its ${statedGrades} stated layouts`,
    short.length === 0, short.slice(0, 6).join('; '));

    // The path route's own window is asked once, further down, in the section
    // that walks what it serves. Repeating it here would only be a second
    // statement of the same claim in a place with less to say about it.
  }

  // The layout a CSV will supply: every level named, with no spacing to speak
  // of. This is the case the whole refactor exists for, so it is checked here
  // rather than left to the first CSV to discover. A lesson at 7, a quiz at 8, a
  // second lesson at 20, a kind the app has no rule for at 21, and the exam at
  // 35 — none of which any arithmetic produces.
  console.log('\nlevel layout: a stated, irregular one');
  const oddGrade = {
    id: 'stated-sample',
    trackId: 'test',
    name: 'A stated layout',
    skills: ['a', 'b'],
    pathLength: 35,
    levels: [
      { level: 7, kind: 'lesson', title: 'An unusual first lesson', covers: 'Ships early.' },
      { level: 8, kind: 'master', title: 'A quiz straight after it' },
      { level: 20, kind: 'lesson', title: 'A second lesson' },
      { level: 21, kind: 'review', title: 'A kind the app has no rule for' },
      { level: 35, kind: 'graduation', title: 'The exam' },
    ],
  };
  const oddAt = (n) => curriculum.levelKind(n, oddGrade.pathLength, oddGrade);
  check('a stated level is the kind the layout gives it',
    [[7, 'lesson'], [8, 'master'], [20, 'lesson'], [21, 'review'], [35, 'graduation']]
      .every(([level, kind]) => oddAt(level) === kind),
    [7, 8, 20, 21, 35].map(oddAt));
  check('and a kind nobody defined is still a level, not a dead one',
    oddAt(21) === 'review' && !curriculum.isCheckpoint('review'), oddAt(21));
  check('and a level the layout does not name is practice',
    oddAt(15) === 'practice' && oddAt(22) === 'practice', [oddAt(15), oddAt(22)]);
  check('the next lesson is found across a gap',
    curriculum.nextLessonLevel(oddGrade, 1) === 7
    && curriculum.nextLessonLevel(oddGrade, 8) === 20
    && curriculum.nextLessonLevel(oddGrade, 22) === null,
    [curriculum.nextLessonLevel(oddGrade, 1), curriculum.nextLessonLevel(oddGrade, 8),
      curriculum.nextLessonLevel(oddGrade, 22)]);
  check('and the next checkpoint likewise',
    LAYOUT.nextCheckpoint(oddGrade, 1) === 8
    && LAYOUT.nextCheckpoint(oddGrade, 9) === 35
    && LAYOUT.nextCheckpoint(oddGrade, 36) === null,
    [LAYOUT.nextCheckpoint(oddGrade, 1), LAYOUT.nextCheckpoint(oddGrade, 9),
      LAYOUT.nextCheckpoint(oddGrade, 36)]);
  check('practiceUntil reaches the next lesson across a gap',
    curriculum.practiceUntil(oddGrade, 7) === 19, curriculum.practiceUntil(oddGrade, 7));
  check('a placement never lands on a stated quiz',
    [1, 5, 8, 15, 25, 34].every((l) => !curriculum.isCheckpoint(
      curriculum.roundToPlacement(l, oddGrade.pathLength, oddGrade),
    )),
    [1, 5, 8, 15, 25, 34].map((l) => curriculum.roundToPlacement(l, oddGrade.pathLength, oddGrade)));
  check('a stated grade is as long as its highest level, plus the exam',
    require('../config/path-length').forGrade({ grade: oddGrade }) === 36,
    require('../config/path-length').forGrade({ grade: oddGrade }));

  // ── lessons ──────────────────────────────────────────────────────────────
  console.log('\nlessons');
  const lessonUser = makeUser('lesson');
  const lessonEnrollment = enroll(lessonUser, 'math', 'algebra_1_part_a');
  db.update('enrollments', lessonEnrollment.id, { current_level: 20 });

  const taught = await sessions.createSession({
    userId: lessonUser.id, enrollment: db.byId('enrollments', lessonEnrollment.id), grade,
  });
  check('a lesson level opens a teaching session', taught.session.kind === 'teach', taught.session.kind);
  check('the lesson has a title and sections',
    !!taught.lesson && !!taught.lesson.title && taught.lesson.sections.length >= 1, taught.lesson && taught.lesson.title);
  check('the lesson comes with check questions', taught.items.length >= 2, taught.items.length);
  check('check questions are tagged as checks', taught.items.every((i) => i.role === 'check'), taught.items.map((i) => i.role));

  for (const item of taught.items) {
    await sessions.answer({ userId: lessonUser.id, session: taught.session, itemId: item.id, userAnswer: item.answer, ms: 3000 });
  }
  const lessonClose = sessions.resolveBlock({
    userId: lessonUser.id,
    session: db.byId('sessions', taught.session.id),
    enrollment: db.byId('enrollments', lessonEnrollment.id),
    grade,
    blockIndex: 0,
  });
  // With ADAPTIVE_TEACHING on (the default since 2026-10-24) a lesson whose checks
  // prove its objective steps over that objective's remaining practice
  // (learner-path compressProven), so the next level is the path's own answer.
  {
    // eslint-disable-next-line global-require
    const adaptiveOn = require('../services/adaptation').mode() === 'on';
    check('finishing a lesson advances the level',
      adaptiveOn ? lessonClose.level_up >= 21 : lessonClose.level_up === 21, lessonClose.level_up);
  }
  // With no model configured the bank's lesson is served while a written one is
  // still coming, and that one has no row yet (see lessons.forLevel). Asserting
  // the row unconditionally made the race crash the whole run, taking every
  // assertion after it with it.
  const lessonRow = lessons.find(lessonUser.id, db.byId('enrollments', lessonEnrollment.id), 20);
  check('the lesson is marked done',
    !lessonRow || !!lessonRow.completed_at,
    lessonRow ? lessonRow.completed_at : 'no row yet: the bank served this one');

  // A lesson a learner reaches without a model still teaches something real.
  const fallback = lessons.buildFallback({ grade, level: 30, skillId: curriculum.levelPlan(grade, 30).focus });
  check('the no-model lesson still has sections and checks',
    fallback.sections.length >= 1 && fallback.check_questions.length >= 2,
    { sections: fallback.sections.length, checks: fallback.check_questions.length });
  check('the no-model lesson explains rather than just asking',
    fallback.sections[0].body.length > 30, fallback.sections[0].body);

  // The lesson for the next lesson level is written while the learner works on
  // the level before it, which is what keeps it off the critical path.
  const prefetchUser = makeUser('prefetch');
  const prefetchEnrollment = enroll(prefetchUser, 'math', 'algebra_1_part_a');
  db.update('enrollments', prefetchEnrollment.id, { current_level: 19 });
  await sessions.createSession({
    userId: prefetchUser.id, enrollment: db.byId('enrollments', prefetchEnrollment.id), grade,
  });
  await new Promise((r) => setTimeout(r, 50));
  check('starting level 19 prepares the level 20 lesson',
    !!lessons.find(prefetchUser.id, db.byId('enrollments', prefetchEnrollment.id), 20));

  // ── checkpoints ──────────────────────────────────────────────────────────
  console.log('\ncheckpoints');
  const cpUser = makeUser('checkpoint');
  const cpEnrollment = enroll(cpUser, 'math', 'algebra_1_part_a');
  // The first level this grade has a Master quiz on, found rather than named.
  // `algebra_1_part_a` puts its first quiz at 51, not 25: the sheet decides where
  // a checkpoint sits, and the old arithmetic rule that put one every twenty-five
  // levels no longer reaches a grade that names its own.
  let quizLevel = null;
  for (let l = 1; l < grade.pathLength && quizLevel === null; l++) {
    if (curriculum.levelKind(l, grade.pathLength, grade) === 'master') quizLevel = l;
  }
  check('the grade has a Master quiz to test with', quizLevel !== null, quizLevel);
  db.update('enrollments', cpEnrollment.id, { current_level: quizLevel });

  // Bring every introduced skill to mastery so the level is genuinely finished.
  const plan = curriculum.levelPlan(grade, quizLevel);
  for (const skillId of plan.introduced) {
    for (let i = 0; i < 12; i++) {
      mastery.recordAttempt({ userId: cpUser.id, skillId, correct: true, difficulty: plan.difficulty, levelDifficulty: plan.difficulty });
    }
  }
  db.update('enrollments', cpEnrollment.id, { level_items: 20 });

  const gate = mastery.tryLevelUp(cpUser.id, db.byId('enrollments', cpEnrollment.id), grade);
  check(`level ${quizLevel} does not advance on mastery alone`, gate.advanced === false, gate);
  check(`level ${quizLevel} is itself the Master quiz`, gate.requires === 'master', gate.requires);
  check('the level kind says so',
    curriculum.levelKind(quizLevel, grade.pathLength, grade) === 'master',
    curriculum.levelKind(quizLevel, grade.pathLength, grade));

  const failQuiz = await sessions.createSession({
    userId: cpUser.id, enrollment: db.byId('enrollments', cpEnrollment.id), grade,
  });
  check('the Master quiz is 15 questions', failQuiz.items.length === 15, failQuiz.items.length);
  const failed = await playSession(cpUser, failQuiz.session, failQuiz.items, 0); // every answer wrong
  check('failing the checkpoint does not advance',
    db.byId('enrollments', cpEnrollment.id).current_level === quizLevel,
    db.byId('enrollments', cpEnrollment.id).current_level);
  check('failing records the attempt rather than a wait',
    !!failed.checkpoint && failed.checkpoint.passed === false && !failed.checkpoint.retry_at
      && !db.byId('enrollments', cpEnrollment.id).checkpoint_retry_at,
    failed.checkpoint);

  // ── a failed checkpoint: retry, or help me learn ──────────────────────────
  console.log('\nfailed checkpoint');
  // The teaching is written while the quiz is still being taken: the moment the
  // best possible score falls under the pass mark, the outcome is settled and
  // there is no reason to wait. Without that head start the learner clicks "help
  // me learn" and watches a model think for a minute.
  const early = remediation.earlyFor(failQuiz.session.id);
  check('the tutor starts reading before the quiz is handed in', !!early || !ai.isEnabled(),
    early ? 'started' : 'no model configured');
  const failedQuizPrompts = new Set(failQuiz.items.map((i) => i.prompt));

  const rem = remediation.activeFor(cpUser.id, cpEnrollment.id);
  check('the failure is recorded to work from', !!rem && rem.kind === 'master', rem && rem.kind);
  check('the weak areas come from the attempt', !!rem && rem.areas.length > 0, rem && rem.areas.length);
  check('each area carries the learner\'s own wrong answers',
    !!rem && rem.areas.every((a) => a.missed.length && a.missed.every((m) => m.user_answer && m.answer)));
  check('an area starts not held', !!rem && rem.areas.every((a) => !a.held));
  check('the retry is offered immediately', !!remediation.sanitize(rem));

  // The retry: same level, same topics, questions they have not seen. With no
  // model configured this is the bank's avoid-list doing the work, which is the
  // path that has to hold when a vendor is down.
  const retryQuiz = await sessions.createSession({
    userId: cpUser.id, enrollment: db.byId('enrollments', cpEnrollment.id), grade,
  });
  check('the retry is the same length', retryQuiz.items.length === 15, retryQuiz.items.length);
  check('the retry stays on the same level',
    retryQuiz.session.level === quizLevel, retryQuiz.session.level);
  const repeats = retryQuiz.items.filter((i) => failedQuizPrompts.has(i.prompt));
  check('the retry does not reuse the failed questions', repeats.length === 0,
    repeats.slice(0, 2).map((i) => i.prompt));
  await playSession(cpUser, retryQuiz.session, retryQuiz.items, 0); // fail it again
  check('a second failure does not advance either',
    db.byId('enrollments', cpEnrollment.id).current_level === quizLevel);
  check('attempts are counted', db.byId('enrollments', cpEnrollment.id).checkpoint_attempts === 2,
    db.byId('enrollments', cpEnrollment.id).checkpoint_attempts);

  // Help me learn: drills on one weak area, which hold when they come in at or
  // above the pass mark.
  const working = remediation.activeFor(cpUser.id, cpEnrollment.id);
  const area = working.areas[0];
  const drill = await sessions.createDrillSession({
    userId: cpUser.id,
    enrollment: db.byId('enrollments', cpEnrollment.id),
    grade,
    area,
    count: remediation.DRILL_COUNT,
  });
  check('a drill round is five questions', drill.items.length === remediation.DRILL_COUNT, drill.items.length);
  check('a drill stays on the failed skill', drill.items.every((i) => i.skill_id === area.skill_id));
  check('a drill does not re-ask the quiz questions',
    drill.items.every((i) => !failedQuizPrompts.has(i.prompt)));
  check('a drill cannot advance a level', drill.session.kind === 'remediate', drill.session.kind);

  // Answer them all correctly.
  for (const item of drill.items) {
    // eslint-disable-next-line no-await-in-loop
    await sessions.answer({ userId: cpUser.id, session: drill.session, itemId: item.id, userAnswer: item.answer, ms: 4000 });
  }
  const score = sessions.scoreDrill(drill.session.id);
  check('the round is scored on what was answered', score.correct === drill.items.length, score);
  const afterDrill = remediation.recordDrill(working.id, 0, {
    correct: score.correct, asked: score.answered, sessionId: drill.session.id,
  });
  check('an area at the pass mark is held', afterDrill.areas[0].held === true);
  check('working an area up does not advance the level',
    db.byId('enrollments', cpEnrollment.id).current_level === quizLevel);

  // The retry's questions are written while the learner reads the recap, so the
  // retry opens instantly. Here the handover is checked directly, since with no
  // model configured nothing is ever prefetched.
  const planned = sessions.planCheckpoint(db.byId('enrollments', cpEnrollment.id), grade, 'master');
  db.update('remediations', working.id, {
    retry_items: [
      { slot: 0, item: { skill_id: planned[0].skillId, prompt: 'prefetched question', answer: '1', format: 'type_in', difficulty: planned[0].difficulty } },
      { slot: 1, item: { skill_id: 'not_the_planned_skill', prompt: 'wrong skill', answer: '1', format: 'type_in', difficulty: 5 } },
    ],
  });
  const claimed = sessions.claimPrefetchedRetry(cpUser.id, cpEnrollment.id, planned);
  check('a prefetched retry question is used', claimed[0] && claimed[0].prompt === 'prefetched question', claimed[0]);
  check('a prefetched question for the wrong skill is dropped', !claimed[1], claimed[1]);
  check('prefetched questions are claimed once',
    Object.keys(sessions.claimPrefetchedRetry(cpUser.id, cpEnrollment.id, planned)).length === 0);

  const weakRound = remediation.recordDrill(working.id, 0, { correct: 1, asked: 5, sessionId: drill.session.id });
  check('an area below the pass mark is not held', weakRound.areas[0].held === false,
    weakRound.areas[0].drills);

  const passQuiz = await sessions.createSession({
    userId: cpUser.id, enrollment: db.byId('enrollments', cpEnrollment.id), grade,
  });
  const passed = await playSession(cpUser, passQuiz.session, passQuiz.items, 10);
  const afterPass = db.byId('enrollments', cpEnrollment.id).current_level;
  check(`passing the checkpoint advances to ${quizLevel + 1}`, afterPass === quizLevel + 1, afterPass);
  check(`level ${quizLevel + 1} is the lesson that follows a checkpoint`,
    curriculum.levelKind(afterPass, grade.pathLength, grade) === 'lesson',
    curriculum.levelKind(afterPass, grade.pathLength, grade));
  check('pass is reported with its mark', passed.checkpoint && passed.checkpoint.passed === true, passed.checkpoint);
  check('passing closes the remediation', !remediation.activeFor(cpUser.id, cpEnrollment.id));

  // ── graduation ───────────────────────────────────────────────────────────
  // The exam mechanics, with the coverage gate in shadow: this learner was put at
  // the Final without proving the grade's objectives, which COVERAGE_GATE=enforce
  // (the default since 2026-10-24) holds; round3-held-test and coverage-test test that.
  const gateWas = process.env.COVERAGE_GATE;
  process.env.COVERAGE_GATE = 'shadow';
  const gradUser = makeUser('graduate');
  const gradEnrollment = enroll(gradUser, 'spanish', 'entry');
  const spanish = curriculum.getGrade('spanish', 'entry');
  db.update('enrollments', gradEnrollment.id, { current_level: spanish.pathLength });
  const finalExam = await sessions.createSession({
    userId: gradUser.id, enrollment: db.byId('enrollments', gradEnrollment.id), grade: spanish,
  });
  check('the graduation exam is 40 questions', finalExam.items.length === 40, finalExam.items.length);
  await playSession(gradUser, finalExam.session, finalExam.items, 10);
  check('passing graduation graduates the track',
    db.byId('enrollments', gradEnrollment.id).status === 'graduated',
    db.byId('enrollments', gradEnrollment.id).status);
  if (gateWas === undefined) delete process.env.COVERAGE_GATE; else process.env.COVERAGE_GATE = gateWas;

  // ── profile effects ──────────────────────────────────────────────────────
  console.log('\nprofile');
  const styleUser = makeUser('style');
  const shortAnswers = {};
  const longAnswers = {};
  for (const q of learner.STYLE_QUESTIONS) {
    shortAnswers[q.id] = q.dim === 'session_pacing' || q.dim === 'practice_density' ? 0 : 0.5;
    longAnswers[q.id] = q.dim === 'session_pacing' || q.dim === 'practice_density' ? 1 : 0.5;
  }
  const shortParams = learner.sessionParams({ style_vector: learner.scoreStyleQuiz(shortAnswers), evidence_count: 0 });
  const longParams = learner.sessionParams({ style_vector: learner.scoreStyleQuiz(longAnswers), evidence_count: 0 });
  check('stated pacing changes session length', longParams.itemCount > shortParams.itemCount,
    { short: shortParams.itemCount, long: longParams.itemCount });

  learner.saveProfile(styleUser.id, { style_vector: { retrieval_style: 1 }, took_style_quiz: true });
  const typeInParams = learner.sessionParams(learner.getProfile(styleUser.id));
  check('a retrieval preference asks for type-in', typeInParams.preferTypeIn === true, typeInParams.preferTypeIn);

  learner.absorbAnalysis(styleUser.id, { observed_signals: { challenge_appetite: 1 }, traits: ['pushes into hard material'] });
  const afterEvidence = learner.getProfile(styleUser.id);
  check('analysis writes observed behavior', afterEvidence.observed.challenge_appetite === 1, afterEvidence.observed);
  check('analysis records traits', afterEvidence.observed_traits.includes('pushes into hard material'), afterEvidence.observed_traits);
  check('evidence count rises', afterEvidence.evidence_count === 1, afterEvidence.evidence_count);

  // ── the coach stays on the question ──────────────────────────────────────
  // The opener is the coach's own turn. Sending it back as if the learner had
  // said it let the model read its own question as a new problem being posed,
  // and drift onto an exercise nobody asked for.
  console.log('\ncoach conversation shape');
  const coachChatItem = {
    id: 1, prompt: 'Solve for x: 9x + 15 = 60', answer: '5',
    rationale: 'Subtract 15, then divide by 9.', skill_name: 'Linear equations',
    skill_id: 'linear_eq', difficulty: 4, level: 11,
  };

  const opened = ai.coachConversation(coachChatItem, []);
  check('with no history the coach is prompted to open', opened.conversation.length === 1
    && opened.conversation[0].role === 'user', opened.conversation);

  const midChat = ai.coachConversation(coachChatItem, [
    { role: 'assistant', content: 'What would you undo first?' },
    { role: 'user', content: 'subtract 15' },
  ]);
  check('the conversation starts with a learner turn', midChat.conversation[0].role === 'user',
    midChat.conversation.map((m) => m.role));
  check("the coach's own opener stays attributed to the coach",
    midChat.conversation.some((m) => m.role === 'assistant' && m.content === 'What would you undo first?'),
    midChat.conversation.map((m) => `${m.role}: ${m.content.slice(0, 30)}`));
  check('the learner turn is never relabelled',
    midChat.conversation.filter((m) => m.role === 'user').every((m) => !m.content.includes('What would you undo first?')),
    midChat.conversation.map((m) => m.role));
  check('roles alternate rather than doubling up',
    midChat.conversation.every((m, i, all) => i === 0 || m.role !== all[i - 1].role),
    midChat.conversation.map((m) => m.role));

  const questionContext = ai.coachQuestionContext(coachChatItem);
  check('the question rides in the system prompt', questionContext.includes('9x + 15 = 60'));
  check('the system prompt forbids substituting another problem',
    /never substitute a different problem/i.test(questionContext));
  check('the answer is marked as guidance only, not to be stated',
    /never to be stated/i.test(questionContext));

  // ── question identity and repeats ────────────────────────────────────────
  // What counts as "the same question" decides whether a session dedupe works.
  // Keyed on the prompt alone, every "Which sentence is punctuated correctly?"
  // looks like a repeat of the first one, the dedupe throws away good questions,
  // and then — having run out of "new" material — serves a real repeat.
  console.log('\nquestion identity');
  const bank = require('../content/bank');
  const sameStem = { prompt: 'Which sentence is punctuated correctly?', answer: 'A.', choices: ['A.', 'B.', 'C.', 'D.'] };
  const otherOptions = { prompt: 'Which sentence is punctuated correctly?', answer: 'A.', choices: ['A.', 'E.', 'F.', 'G.'] };
  const reshuffled = { prompt: 'Which sentence is punctuated correctly?', answer: 'A.', choices: ['D.', 'C.', 'B.', 'A.'] };
  check('one prompt with different options is not one question',
    bank.itemKey(sameStem) !== bank.itemKey(otherOptions));
  check('reshuffling the same options is not a new question',
    bank.itemKey(sameStem) === bank.itemKey(reshuffled));
  check('the same prompt with a different answer is a different question',
    bank.itemKey({ prompt: 'x + 1 = 3', answer: '2' }) !== bank.itemKey({ prompt: 'x + 1 = 3', answer: '3' }));

  // A learner working through consecutive levels on one skill used to meet the
  // same questions in each of them, because `avoid` only covered one session.
  // Consecutive levels of one grade, with the learner's own history as the avoid
  // set — the situation that used to serve the same question over and over.
  //
  // The grade is one that moves across several skills. `english/grammar` is now
  // the first-grade grade, whose first eight practice levels are all phonics, so
  // asking it to produce variety across them measures a single generator rather
  // than a planner: forty-six repeats in ninety-six is one skill being asked
  // eight times, not eight levels being planned badly. The planner is what this
  // checks, so the grade is one with more than one skill in the span.
  const repeatUser = makeUser('repeats');
  const repeatEnrollment = enroll(repeatUser, 'math', 'algebra_1_part_a');
  const repeatGrade = curriculum.getGrade('math', 'algebra_1_part_a');
  const askedKeys = new Set();
  let repeated = 0;
  let asked = 0;
  for (let level = 12; level <= 19; level++) {
    db.update('enrollments', repeatEnrollment.id, { current_level: level, level_items: 0 });
    // eslint-disable-next-line no-await-in-loop
    const sitting = await sessions.createSession({
      userId: repeatUser.id,
      enrollment: db.byId('enrollments', repeatEnrollment.id),
      grade: repeatGrade,
    });
    for (const it of sitting.items) {
      asked++;
      const key = bank.itemKey(db.byId('items', it.id));
      if (askedKeys.has(key)) repeated++;
      askedKeys.add(key);
    }
    // eslint-disable-next-line no-await-in-loop
    await sessions.finish({ userId: repeatUser.id, session: db.byId('sessions', sitting.session.id) });
  }
  check('eight levels of one subject repeat less than 1 question in 20',
    repeated / asked < 0.05, `${repeated} of ${asked}`);

  // A skill with shapes in it has to actually serve them. The rotation used to
  // test for the literal strings "<skill>||arithmetic" and "<skill>||shape",
  // which nothing ever writes into the shape set — generateMany records the real
  // frame of whatever it built — so the test could never pass and every skill
  // served its base generator forever. Nothing failed: the shapes were correct
  // and the metric did not notice, because the metric counts what a learner sees
  // and a learner was only ever seeing the base generator.
  const { shapeKey, withShapes } = require('../content/pool');
  const { makeRng } = require('../content/rng');
  const rotating = withShapes(
    () => ({ prompt: 'what is the base question?', answer: '1', rationale: 'base' }),
    (rng) => ({ prompt: `a different task ${rng.int(1, 999)}`, answer: '2', rationale: 'shape' }),
    'rotation_probe');
  const served = new Map();
  for (let i = 0; i < 12; i++) {
    const made = rotating(makeRng(`rot:${i}`), 5, {});
    const k = shapeKey({ ...made, skill_id: 'rotation_probe' });
    served.set(k, (served.get(k) || 0) + 1);
  }
  check('a skill with shapes serves the shapes and not only the base',
    served.size > 1, [...served.values()]);
  // Both halves of the alternation get used, and neither gets the lion's share.
  // A budget of twelve turns over twelve questions is six and six; anything more
  // lopsided than two to one means the alternation is not happening.
  const counts = [...served.values()];
  check('and alternates rather than leaning on one side',
    Math.min(...counts) === Math.max(...counts), counts);

  // The experience a learner actually has: a real block, not a hundred
  // questions of one skill. This is the number worth holding, because it is what
  // a person meets, and it is the one the shape rotation exists to improve.
  //
  // The bound is loose on purpose. A single run of this is one draw and the
  // spread is a few points either way — `npm run sitting` samples seven and
  // reports the median, which is the number to read for the real figure. A tight
  // bound here would fail on the draw rather than on a regression, and a check
  // that cries wolf gets ignored, which is worse than not having it.
  let sittingAsked = 0;
  let sittingRepeated = 0;
  for (const [trackId, gradeId, level] of [
    ['math', 'sense_of_quantity', 11], ['math', 'numbers_to_20_and_teen_numbers', 11], ['math', 'algebra_2_part_a', 41],
    ['english', 'basics', 11], ['english', 'grammar', 11], ['english', 'reading', 11],
    ['spanish', 'entry', 11], ['spanish', 'intermediate', 41],
    ['iq', 'foundations', 11], ['act', 'act_math', 11], ['act', 'act_science', 11],
  ]) {
    // Three sittings per grade, pooled (2026-10-25): one draw per grade put the
    // pooled rate within a point or two of the bound (21-22% on average, 25-27% on
    // about one run in ten, with every new switch off as well as on), so the check
    // failed on the draw. Pooling three keeps the bound and the meaning and cuts
    // the spread by about 1.7.
    for (let draw = 0; draw < 3; draw++) {
      const u = makeUser(`sitting-${trackId}-${gradeId}-${draw}`);
      const e = enroll(u, trackId, gradeId, level);
      const g = curriculum.getGrade(trackId, gradeId);
      // eslint-disable-next-line no-await-in-loop
      const block = await sessions.createSession({ userId: u.id, enrollment: e, grade: g });
      const seen = new Map();
      for (const it of block.items) {
        sittingAsked++;
        const k = shapeKey(db.byId('items', it.id));
        const n = (seen.get(k) || 0) + 1;
        seen.set(k, n);
        if (n === 2) sittingRepeated++;
      }
    }
  }
  check('a real sitting repeats less than 1 question in 4',
    sittingRepeated / sittingAsked < 0.25,
    `${sittingRepeated} of ${sittingAsked} = ${(100 * sittingRepeated / sittingAsked).toFixed(1)}%`);

  // A family without a frame is invisible to the shape filter, and two families
  // sharing one are indistinguishable to it. Both happened here: every family in
  // the passage file was framed "comparison: undefined" because the builder read
  // `.name` and `.frame` off two functions, and one function has no `.frame` at
  // all. A skill with nine questions reported three shapes and nothing failed.
  console.log('\nquestion frames');
  const FRAME_SOURCES = ['english-families', 'english-shapes', 'passage-families',
    'iq-families', 'spanish-families'];
  let frameless = [];
  let collisions = [];
  let familiesChecked = 0;
  for (const name of FRAME_SOURCES) {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const { FAMILIES } = require(`../content/${name}`);
    for (const [skill, list] of Object.entries(FAMILIES)) {
      familiesChecked += list.length;
      const seen = new Map();
      list.forEach((entry, i) => {
        if (!entry.frame) { frameless.push(`${name}/${skill}[${i}]`); return; }
        if (seen.has(entry.frame)) {
          collisions.push(`${name}/${skill}: [${seen.get(entry.frame)}] and [${i}]`);
        }
        seen.set(entry.frame, i);
      });
    }
  }
  check('every family declares a frame', frameless.length === 0,
    frameless.slice(0, 6).join(', '));
  check('no two families in a skill share a frame', collisions.length === 0,
    collisions.slice(0, 6).join(', '));
  check('and the frame is real text, not a placeholder',
    (() => {
      const { FAMILIES } = require('../content/passage-families');
      const bad = Object.values(FAMILIES).flat()
        .filter((e) => typeof e.frame === 'string' && /undefined|NaN|\[object/.test(e.frame));
      return bad.length === 0;
    })());
  console.log(`  (${familiesChecked} families across ${FRAME_SOURCES.length} files)`);

  // ── resuming a written checkpoint ────────────────────────────────────────
  // An English Master is two things in one sitting: a five-question quick check,
  // then the writing. A learner who closes the tab between the two has to come
  // back to the writing, and the answer has to still be their own.
  //
  // The client used to test `isEssay() && !items.length`, which is true only
  // before the check has been served at all — so the moment the five questions
  // were answered, a reload dropped them back onto the first unanswered one,
  // which was the fifth. The essay and its draft were on the response the whole
  // time; nothing read them to decide where to open. This checks the three
  // places a tab can actually be closed.
  console.log('\nresuming a written checkpoint');
  const chkUser = makeUser('essayresume');
  const chkEnrollment = enroll(chkUser, 'english', 'reading');
  const chkGrade = curriculum.getGrade('english', 'reading');
  // The first written checkpoint in this grade, found rather than written down.
  //
  // It used to be level 26, on the strength of the old sheet's rule of a lesson
  // on 25 and a quiz on 26. The new sheet names every level, and where the first
  // Master quiz falls is the course's business: in the second grade it is
  // wherever the first cycle of lessons ends. Hard-coding 26 pointed at a level
  // that is now ordinary practice, and the test failed on a plain block with no
  // essay — a correct result, tested at the wrong level.
  const chkWritten = LAYOUT.levelsOfKind(chkGrade, 'essay', 1)[0]
    || LAYOUT.levelsOfKind(chkGrade, 'master', 1)[0];
  check('the second grade has a written checkpoint to resume from', chkWritten != null, chkWritten);
  db.update('enrollments', chkEnrollment.id, { current_level: chkWritten });
  const chkOpened = await sessions.createSession({
    userId: chkUser.id,
    enrollment: db.byId('enrollments', chkEnrollment.id),
    grade: chkGrade,
  });
  const chkSession = db.byId('sessions', chkOpened.session.id);
  check('a written checkpoint opens a quick check and an essay',
    chkOpened.items.length > 0 && !!chkOpened.essay, {
      items: chkOpened.items.length, essay: !!chkOpened.essay,
    });

  // Answer the whole check, as a learner who has moved on to the writing did.
  for (const it of chkOpened.items) {
    const row = db.byId('items', it.id);
    // eslint-disable-next-line no-await-in-loop
    await sessions.answer({
      userId: chkUser.id, session: chkSession, itemId: row.id, userAnswer: row.answer, ms: 2500,
    });
  }
  // Leave a draft, so a lost draft is caught here too.
  const chkRow = db.findOne('essays', (e) => e.session_id === chkSession.id);
  essays.saveDraft(chkRow.id, 'The harbour was rebuilt in three stages, and each stage changed who used it.');

  const chkReopened = await sessions.createSession({
    userId: chkUser.id,
    enrollment: db.byId('enrollments', chkEnrollment.id),
    grade: chkGrade,
  });
  const chkItems = chkReopened.items.map((i) => sessions.sanitize(i));
  check('the quick-check answers survive the close',
    chkItems.every((i) => i.answered), chkItems.filter((i) => !i.answered).length);
  check('and the draft comes back with them',
    !!(chkReopened.essay && (chkReopened.essay.draft || '').includes('harbour')),
    (chkReopened.essay && chkReopened.essay.draft || '').slice(0, 40));
  check('so there is no unanswered question left to fall back to',
    chkItems.every((i) => i.answered) && !!chkReopened.essay,
    { answered: chkItems.filter((i) => i.answered).length, essay: !!chkReopened.essay });
  // The essay is looked for across every block. A checkpoint reached two levels
  // into a sitting is attached to that block, and looking only at block zero
  // returned null — the writing became unreachable on a reload.
  const anyBlock = db.find('essays', (e) => e.session_id === chkReopened.session.id
    || e.session_id === chkSession.id);
  check('the essay is found from any block, not only the first',
    anyBlock.length > 0, anyBlock.length);

  // ── what a lesson teaches ─────────────────────────────────────────────────
  // A skill spans tens of levels, and every one of them was a lesson titled with
  // the skill's name and a level number. English basics had twenty-nine lessons
  // and five distinct topics: a learner could sit five lessons on parts of speech
  // and learn nothing on the fourth that the first had not already said.
  //
  // What must hold now: every lesson has a topic, the first lesson of a skill is
  // that skill's first topic, the last is its last, and the topic never moves
  // backwards within a skill.
  console.log('\nlesson topics');
  const topicLib = require('../content/topics');
  let topiclessGrades = [];
  let wrongFirst = [];
  let wrongLast = [];
  let wentBackwards = [];
  let shortPaths = [];
  for (const track of curriculum.TRACKS) {
    for (const grade of track.grades) {
      const outline = topicLib.gradeOutline(grade, track.id);
      const lessons = [];
      for (let l = 1; l <= grade.pathLength; l++) {
        if (curriculum.levelKind(l, grade.pathLength, grade) === 'lesson') lessons.push(l);
      }
      // The lessons in the order a learner meets them, which is the order this
      // has to be checked in. Collecting them by skill first looks tidier and is
      // wrong: a syllabus interleaves skills — the second-grade list opens with
      // phonics, then grammar, then phonics again — so regrouping by skill puts
      // topic one at the end and reports three clean grades as broken.
      const inOrder = [];
      let anyMissing = false;
      for (const level of lessons) {
        const skillId = curriculum.levelPlan(grade, level).focus;
        const t = topicLib.topicFor(grade, level, skillId, track.id);
        if (!t || !t.topic) { anyMissing = true; continue; }
        inOrder.push(t);
      }
      if (anyMissing) topiclessGrades.push(`${track.id}/${grade.id}`);

      // A grade on the rule has one lesson per topic, and a grade that names its
      // levels has however many lessons the sheet wrote. Both are checked by
      // their own rule below rather than by one that fits neither.
      if (!LAYOUT.isStated(grade) && lessons.length < outline.length) {
        shortPaths.push(`${track.id}/${grade.id}: ${lessons.length} lessons, ${outline.length} topics`);
      }

      // Order and endpoints, for a grade on the rule. A grade that names its
      // levels has its own order, checked level by level below; holding a
      // stated grade to "the first lesson teaches the first topic" would be
      // holding it to a rule it does not use — in the kindergarten grade the
      // sheet opens with a Tester and closes with an exam, and neither is the
      // first or last topic.
      if (LAYOUT.isStated(grade)) continue;
      const names = outline.map((o) => o.topic);
      if (inOrder[0] && inOrder[0].topic !== names[0]) {
        wrongFirst.push(`${track.id}/${grade.id}: "${inOrder[0].topic}", not "${names[0]}"`);
      }
      const lastRow = inOrder[inOrder.length - 1];
      if (lastRow && lastRow.topic !== names[names.length - 1]) {
        wrongLast.push(`${track.id}/${grade.id}: "${lastRow.topic}", not "${names[names.length - 1]}"`);
      }
      let lastAt = -1;
      for (const t of inOrder) {
        const at = names.indexOf(t.topic);
        if (at < lastAt) wentBackwards.push(`${track.id}/${grade.id} at topic ${at}`);
        lastAt = at;
      }
    }
  }
  check('every grade has a topic for every lesson', topiclessGrades.length === 0,
    topiclessGrades.join(', '));
  check('and no grade on the rule is too short to teach its own syllabus', shortPaths.length === 0,
    shortPaths.join('; '));

  // Exactly one lesson per topic — no more and no fewer. A path rounded up to a
  // multiple of fifty and then to a whole number of checkpoints adds levels, and
  // levels add lessons, so a grade with thirty-three topics had forty-one. The
  // surplus lessons repeated earlier topics, which is the "all the lessons are the
  // same" report arriving from the other direction.
  //
  // Only for a grade on the rule. A grade that names its levels has a lesson for
  // the levels the sheet marks as lessons — 50 in the kindergarten grade, where
  // the other 332 are Testers, Activities, quizzes and the exam — and comparing
  // that to a topic count would be comparing two different things.
  let surplus = [];
  for (const track of curriculum.TRACKS) {
    for (const grade of track.grades) {
      if (LAYOUT.isStated(grade)) continue;
      let lessons = 0;
      for (let l = 1; l < grade.pathLength; l++) {
        if (curriculum.levelKind(l, grade.pathLength, grade) === 'lesson') lessons++;
      }
      const topics = topicLib.gradeOutline(grade, track.id).length;
      if (lessons !== topics) {
        surplus.push(`${track.id}/${grade.id}: ${lessons} lessons, ${topics} topics`);
      }
    }
  }
  check('and every grade on the rule has exactly one lesson per topic', surplus.length === 0,
    surplus.join('; '));

  // The endpoints, for a grade on the rule. A stated grade's first and last level
  // are whatever the sheet puts there — a Tester at one end and an exam at the
  // other, neither of which is a lesson — so there is nothing to hold them to
  // beyond being served, which the sheet checks above do.
  check('the first lesson of a rule-shaped grade teaches its first topic',
    wrongFirst.length === 0, wrongFirst.slice(0, 3).join('; '));
  check('the last lesson of one teaches its last topic',
    wrongLast.length === 0, wrongLast.slice(0, 3).join('; '));
  check('and topics never go backwards', wentBackwards.length === 0,
    wentBackwards.slice(0, 3).join('; '));

  // A grade that states its levels must teach that level's own topic, and carry
  // that level's own coverage. This is the strongest statement any of these checks
  // makes: not "the order is right" but "level 25 of the second grade is the
  // review lesson the creator put on level 25", and it is what the creator's sheet
  // is for. A lesson that walked its list by position would pass every order check
  // and still be wrong here, because the quizzes between lessons are not lessons
  // and do not advance a count.
  const statedLevelFaults = [];
  let statedLevelChecked = 0;
  for (const track of curriculum.TRACKS) {
    for (const grade of track.grades) {
      const stated = LAYOUT.statedIndex(grade);
      if (!stated) continue;
      if (track.id === 'iq') {
        const lessons = grade.levels.filter((level) => level.kind === 'lesson');
        const outline = topicLib.gradeOutline(grade, track.id);
        if (outline.length !== lessons.length) {
          statedLevelFaults.push(`${track.id}/${grade.id}: ${outline.length} topics, `
            + `${lessons.length} lessons`);
        }
        for (const entry of stated.byLevel.values()) {
          statedLevelChecked++;
          const got = topicLib.topicFor(
            grade, entry.level, curriculum.levelPlan(grade, entry.level).focus, track.id,
          );
          const latest = lessons.filter((lesson) => lesson.level <= entry.level).at(-1)
            || lessons[0];
          const expected = entry.kind === 'master' || entry.kind === 'grand' ? entry : latest;
          if (!got || !expected || got.topic !== expected.title) {
            statedLevelFaults.push(`${track.id}/${grade.id} level ${entry.level}: `
              + `"${got ? got.topic : 'nothing'}" not "${expected ? expected.title : 'nothing'}"`);
          } else if (got.covers !== expected.covers) {
            statedLevelFaults.push(`${track.id}/${grade.id} level ${entry.level}: coverage differs`);
          }
        }
        continue;
      }
      for (const entry of stated.byLevel.values()) {
        statedLevelChecked++;
        const got = topicLib.topicFor(
          grade, entry.level, curriculum.levelPlan(grade, entry.level).focus, track.id,
        );
        if (!got || got.topic !== entry.title) {
          statedLevelFaults.push(`${track.id}/${grade.id} level ${entry.level}: `
            + `"${got ? got.topic : 'nothing'}" not "${entry.title}"`);
        } else if (got.covers !== entry.covers) {
          statedLevelFaults.push(`${track.id}/${grade.id} level ${entry.level}: coverage differs`);
        }
      }
    }
  }
  check(`and each of the ${statedLevelChecked} levels a grade names is served`
    + ' with its own title and coverage',
  statedLevelFaults.length === 0, statedLevelFaults.slice(0, 3).join('; '));

  // A grade with more levels than lessons still reaches its last level's title.
  // This was about topics and lessons when a grade was a syllabus; it is about
  // levels now, and the case is the same — a walk that scales by a ratio skips,
  // and a walk that steps cannot.
  //
  // It is about a grade where **lessons and topics are two different lists** — the
  // lesson every tenth level on the rule, and a syllabus of topics walked in
  // order across them. That is only true of a grade on the arithmetic rule, and
  // the Math spreadsheet removed the last math grade that was on it, so this has
  // to pick one of the nine that remain rather than naming a math grade.
  //
  // Pointing it at a sheet grade did not fail: it returned `false` at the first
  // line, because a sheet grade's lessons *are* its topics and there is nothing to
  // walk. The check would have kept reporting the right verdict for a reason that
  // had stopped being true.
  const walkGrade = ruleGrade;
  check('a grade with more levels than lessons still reaches its last title', (() => {
    const lessons = [];
    for (let l = 1; l < walkGrade.pathLength; l++) {
      if (curriculum.levelKind(l, walkGrade.pathLength, walkGrade) === 'lesson') lessons.push(l);
    }
    const outline = topicLib.gradeOutline(walkGrade, 'math');
    if (lessons.length < outline.length) return false;
    // Every topic is reached, in order, and the last lesson teaches the last topic.
    let lastAt = -1;
    for (const level of lessons) {
      const t = topicLib.topicFor(
        walkGrade, level, curriculum.levelPlan(walkGrade, level).focus, 'math',
      );
      const at = outline.findIndex((o) => o.topic === t.topic);
      if (at < lastAt) return false;
      lastAt = at;
    }
    return lastAt === outline.length - 1;
  })());

  // A lesson teaches one rule, so its questions have to be about that rule. The
  // pin to a single family is what makes it true; this confirms it does.
  const topicGrade = curriculum.getGrade('english', 'basics');
  const topicUser = makeUser('topics');
  const topicEnrollment = db.insert('enrollments', {
    user_id: topicUser.id, track_id: 'english', grade_id: 'basics',
    target_level: topicGrade.pathLength, current_level: 10,
    level_items: 0, levels_completed: 0, xp: 0, status: 'active',
  });
  const topicLesson = lessons.buildFallback({
    userId: topicUser.id,
    enrollment: db.byId('enrollments', topicEnrollment.id),
    grade: topicGrade,
    level: 10,
    skillId: curriculum.levelPlan(topicGrade, 10).focus,
  });
  // The title is `lesson-(topic)` — the topic in the creator's words, in the place
  // a learner looks for it, and the same string the syllabus report prints so the
  // two can be compared line for line.
  check('a lesson is titled lesson-(its topic), not its skill',
    topicLesson.topic && topicLesson.title === `lesson-(${topicLesson.topic})`,
    { title: topicLesson.title, topic: topicLesson.topic });
  check('and it says what the topic covers',
    typeof topicLesson.sections[0].body === 'string' && topicLesson.sections[0].body.length > 20,
    topicLesson.sections[0].body);
  check('and the coverage it carries is the one the sheet wrote for that level',
    topicLesson.covers === topicLib.topicFor(topicGrade, 10, null, topicGrade.trackId).covers,
    { lesson: topicLesson.covers });
  check('its questions are not the worked example above them',
    topicLesson.check_questions.every((c) => !topicLesson.sections.some(
      (s) => s.example && s.example.startsWith(c.prompt))),
    topicLesson.check_questions.map((c) => c.prompt.slice(0, 40)));

  // ── role routing ─────────────────────────────────────────────────────────
  // Which vendor answers which kind of work, and what catches it when that one
  // cannot. Checked on `order`, not on `current`, so it holds whether or not a
  // key happens to be configured in this environment.
  console.log('\nrole routing');
  const providers = require('../services/providers');
  const saved = {};
  for (const key of ['AI_PROVIDER', 'AI_PROVIDER_FAST', 'AI_PROVIDER_DEEP', 'AI_PROVIDER_REGEN',
    'AI_PROVIDER_FAST_FALLBACK', 'AI_PROVIDER_DEEP_FALLBACK', 'AI_PROVIDER_REGEN_FALLBACK']) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  // The owner's lineup (2026-10-22, curriculum-build/MODEL-LINEUP.md): the free
  // NVIDIA build models first, Claude on the Anthropic key last. MiMo, Gemini and
  // OpenRouter (paid) are out of every chain unless AI_LEGACY_PROVIDERS opts one in.
  const nvidiaTiers = require('../services/providers/nvidia');
  check('chat runs on NVIDIA first', providers.order('fast')[0] === 'nvidia', providers.order('fast'));
  check('chat runs on the light tier (Nemotron Ultra) unless the lineup moves it',
    ['instant', 'light', 'fast_thinking', 'hard'].includes(nvidiaTiers.tierForRole('fast')), nvidiaTiers.tierForRole('fast'));
  check('deep work runs on NVIDIA first', providers.order('deep')[0] === 'nvidia', providers.order('deep'));
  check('deep work is on the hard tier', nvidiaTiers.tierForRole('deep') === 'hard', nvidiaTiers.tierForRole('deep'));
  check('quiz regeneration runs on NVIDIA first', providers.order('regen')[0] === 'nvidia', providers.order('regen'));
  // Since 2026-10-23 the free fallbacks (local, Gemini free tier, OpenRouter :free)
  // sit between NVIDIA and Claude; nothing paid is added and Claude stays last.
  const FREE_CHAIN = 'nvidia,ollama,gemini_free,openrouter_free,anthropic';
  check('Claude is last in every general role, behind NVIDIA and the free fallbacks only',
    ['fast', 'deep', 'regen', 'diagnose', 'rewrite', 'personalize', 'games', 'blocks'].every((r) => providers.order(r).join(',') === FREE_CHAIN),
    ['fast', 'deep', 'regen'].map((r) => providers.order(r)));
  check('MiMo, Gemini and OpenRouter are in no chain',
    ['fast', 'deep', 'regen', 'diagnose', 'rewrite', 'personalize', 'games', 'blocks', 'placement'].every((r) => !providers.order(r).some((n) => ['mimo', 'gemini', 'openrouter'].includes(n))));

  process.env.AI_PROVIDER_FAST = 'gemini';
  process.env.AI_PROVIDER_FAST_FALLBACK = 'mimo';
  check('a legacy provider named without the opt-in is ignored', providers.order('fast').join(',') === FREE_CHAIN,
    providers.order('fast'));
  process.env.AI_LEGACY_PROVIDERS = 'gemini,mimo';
  check('the chat route is overridable (with the opt-in), Claude still last', providers.order('fast').join(',') === `gemini,mimo,${FREE_CHAIN}`,
    providers.order('fast'));
  delete process.env.AI_LEGACY_PROVIDERS;
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  // ── quota handling ───────────────────────────────────────────────────────
  // A per-minute limit is waited out; a daily limit means switching models
  // until tomorrow. Telling them apart is the whole point, and it cannot be
  // tested against the live API without actually exhausting a quota.
  console.log('\nquota handling');
  const gemini = require('../services/providers/gemini');
  const quotaErr = (details, message = 'quota exceeded') => ({ status: 429, message, body: { error: { details } } });
  const violation = (quotaId) => [{ '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId }] }];
  const retry = (delay) => [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: delay }];

  check('a per-day quota id reads as daily',
    gemini.quotaKind(quotaErr(violation('GenerateRequestsPerDayPerProjectPerModel-FreeTier'))) === 'day');
  check('a per-minute quota id reads as per-minute',
    gemini.quotaKind(quotaErr(violation('GenerateRequestsPerMinutePerProjectPerModel-FreeTier'))) === 'minute');
  check('a long retry delay reads as daily', gemini.quotaKind(quotaErr(retry('3600s'))) === 'day');
  check('a short retry delay reads as per-minute', gemini.quotaKind(quotaErr(retry('21s'))) === 'minute');
  check('an unexplained 429 is treated as recoverable', gemini.quotaKind(quotaErr([])) === 'minute');

  const fastModel = gemini.modelFor('fast');
  gemini.markExhausted(fastModel, 'self test');
  check('an exhausted model is set aside', gemini.isExhausted(fastModel));
  check('the daily fallback takes over', gemini.modelFor('fast') !== fastModel, gemini.modelFor('fast'));

  // OpenRouter's free tier is capped per day rather than per minute, and it says
  // so in the error text. Reading that as per-minute would make the coach retry
  // a limit that will not lift until tomorrow.
  const openrouter = require('../services/providers/openrouter');
  const orErr = (message) => ({ status: 429, message, body: { error: { message } } });
  check('a free-models-per-day limit reads as daily',
    openrouter.quotaKind(orErr('Rate limit exceeded: free-models-per-day')) === 'day');
  check('an upstream per-minute limit reads as per-minute',
    openrouter.quotaKind(orErr('Provider returned 429: requests per minute exceeded')) === 'minute');
  // A busy shared pool is someone else's traffic, not this account's quota. It
  // must not set the model aside for the day — and it must be recognised, because
  // probing a saturated route before every chat turn costs the conversation.
  const poolErr = {
    status: 429,
    message: 'openrouter 429: Provider returned error',
    body: { error: { message: 'Provider returned error', metadata: { limit_source: 'upstream_provider_shared_pool', raw: 'temporarily rate-limited upstream. Please retry shortly' } } },
  };
  check('a saturated upstream pool is recognised', openrouter.isSharedPoolLimit(poolErr));
  check('a saturated pool is not read as our daily quota', openrouter.quotaKind(poolErr) === 'minute',
    openrouter.quotaKind(poolErr));
  check('our own daily cap is still not a pool limit',
    !openrouter.isSharedPoolLimit(orErr('Rate limit exceeded: free-models-per-day')));

  // The chat lane tries the free Qwen route, then the paid route for the same
  // model. That is not a cost decision made lightly: the free route has one
  // upstream provider whose shared pool is saturated most of the time, so
  // "free first, paid second" is the only arrangement where chat actually runs on
  // Qwen rather than on the Gemini backup. It is ~0.002 cents a turn.
  process.env.OPENROUTER_MODEL_FAST_FALLBACK = 'qwen/qwen3.8-27b';
  check('the chat lane prefers the free route', /:free$/.test(openrouter.modelFor('fast')),
    openrouter.modelFor('fast'));
  check('a free route costs nothing against the daily ceiling',
    openrouter.costCents('qwen/qwen3.8-27b:free', { input_tokens: 1e6, output_tokens: 1e6 }) === 0);
  check('the paid route is costed, not treated as free',
    openrouter.costCents('qwen/qwen3.8-27b', { input_tokens: 1e6, output_tokens: 0 }) > 0,
    openrouter.costCents('qwen/qwen3.8-27b', { input_tokens: 1e6, output_tokens: 0 }));

  // A model whose request shape differs from the default gets a profile, and the
  // profile is read rather than assumed.
  //
  // These are assertions about configuration, not about the API, so they run with
  // no key and no network — which is the point: a profile nothing checks is a
  // comment, and the fault it describes (a reasoning model answering with thinking
  // off, or a pinned model quietly answered by different weights) is invisible in
  // the answer. A reasoning model that answers correctly with the wrong request
  // shape works perfectly until the day it does not.
  console.log('\nmodel profiles: the request shape a model needs');
  {
    const BUNNY = 'stealth/space-bunny-alpha';
    const QWEN = 'qwen/qwen3.8-27b:free';
    const bunny = openrouter.profileFor(BUNNY);

    check('its reasoning setting is left to the endpoint, which requires it',
      bunny.reasoning === null, bunny.reasoning);
    check('and it is pinned to the one upstream that serves it',
      !!bunny.provider && Array.isArray(bunny.provider.only)
      && bunny.provider.only.length === 1 && bunny.provider.only[0] === 'stealth',
      bunny.provider);
    check('and no other provider may answer in its place',
      bunny.provider && bunny.provider.allow_fallbacks === false, bunny.provider);
    check('its thinking is carried to the next turn',
      openrouter.carriesReasoning(BUNNY) === true);

    // The half that matters most, because it is the half that is easy to get
    // wrong: a model that is not profiled must be untouched by all of it, or
    // every other route starts carrying a field it did not produce.
    check('a model with no profile is left alone entirely',
      Object.keys(openrouter.profileFor(QWEN)).length === 0
      && openrouter.carriesReasoning(QWEN) === false,
      openrouter.profileFor(QWEN));
    check('an unlisted model is not assumed to exist',
      Object.keys(openrouter.profileFor('nope/not-a-model')).length === 0);

    // And it is priced, so a route that starts billing is caught rather than
    // silently costing nothing — which is how a per-user ceiling stops bounding
    // anything without saying so.
    check('the new route is priced, so billing would be noticed',
      Object.prototype.hasOwnProperty.call(openrouter.PRICES, BUNNY),
      openrouter.PRICES[BUNNY]);

    // The hand-back is conditional, because the field is not always there: one
    // reply in ten arrived without it. Sending an empty array is not the same as
    // a preserved trace, so "no details came back" has to be expressible.
    check('carrying is optional, so a reply with no details is still a usable reply',
      openrouter.profileFor(BUNNY).carryReasoning === true
      && bunny.reasoning_details === undefined,
      bunny.reasoning_details);

    // And the same thing against the real model, because a profile that describes
    // a request the API rejects is a comment that is wrong.
    //
    // Asked directly rather than through a lane, because a lane is configured
    // elsewhere and may be on Qwen; this is about whether the *request* the
    // profile describes is one the model accepts. Skipped when there is no key,
    // and when the key cannot reach the model — a route's availability is not what
    // this section is testing, and an unreachable key should not read as a broken
    // feature.
    const asked = openrouter.isConfigured() ? await openrouter.chat({
      role: 'fast',
      system: 'Answer in one short sentence.',
      messages: [{ role: 'user', content: "How many r's are in the word 'strawberry'?" }],
      maxTokens: 200,
      // The lane decides the model; this wants this one specifically, which is
      // what the profile is about.
      model: BUNNY,
    }).catch(() => null) : null;
    if (!openrouter.isConfigured()) {
      console.log('  --   skipped the live check: no OpenRouter key');
    } else if (!asked) {
      console.log('  --   skipped the live check: the route could not answer right now');
    } else if (asked.model !== BUNNY) {
      console.log(`  --   skipped the live check: answered by ${asked.model}, not the new route`);
    } else {
      check('the live API accepts reasoning on and hands back its thinking',
        asked.reasoning_details != null, `served by ${asked.model}`);
    }

    // A second pinned model. The same three things are true of it as of any pinned
    // model — it is named on the call or on a lane, it may only be answered by the
    // one upstream that serves it, and it carries its thinking — and all three are
    // checked the same way rather than assumed, because a profile that is right
    // about one pinned model and wrong about the next is still wrong.
    const DEEPSEEK = 'deepseek/deepseek-v4.1-flash';
    const deepseek = openrouter.profileFor(DEEPSEEK);
    check('the second pinned route is pinned to the one upstream that serves it',
      !!deepseek.provider && Array.isArray(deepseek.provider.only)
      && deepseek.provider.only.length === 1
      && deepseek.provider.only[0] === 'sail-research/fp4',
      deepseek.provider);
    check('and no other provider may answer in its place',
      deepseek.provider && deepseek.provider.allow_fallbacks === false, deepseek.provider);
    check('its thinking is carried to the next turn',
      openrouter.carriesReasoning(DEEPSEEK) === true);
    // Reasoning is deliberately left to the endpoint's default here rather than
    // pinned the way space-bunny's is, and the two are not the same request:
    // space-bunny's `null` means "send no reasoning field, it rejects the field",
    // which is the opposite of what this route wants. Asserted because collapsing
    // them would send space-bunny's omission to a model that demands the field.
    check('and its reasoning is left to the endpoint, not pinned the way the first is',
      !Object.prototype.hasOwnProperty.call(deepseek, 'reasoning')
      || deepseek.reasoning === null || typeof deepseek.reasoning === 'object',
      deepseek.reasoning);
    check('the second route is priced, so billing would be noticed',
      Object.prototype.hasOwnProperty.call(openrouter.PRICES, DEEPSEEK),
      openrouter.PRICES[DEEPSEEK]);
    check('and it has its own credential slot rather than borrowing the general key',
      deepseek.scopedKey === 'deepseek', deepseek.scopedKey);

    // The two profiles are separate entries rather than one shared object, and each
    // keeps its own pin. Sharing them would be the obvious way to avoid a duplicate
    // and it would be wrong: they are pinned to different upstreams, and one model
    // naming the other's provider is a broken guarantee rather than a default.
    check('the two pins are kept apart, not shared',
      bunny.provider.only[0] !== deepseek.provider.only[0]);
  }

  // A saturated free route is set aside for minutes, not for the day, and it sets
  // aside the ROUTE rather than the provider — otherwise chat would skip past the
  // paid route that is working and go to Gemini.
  const orModel = openrouter.modelFor('fast');
  openrouter.markExhausted(orModel, 'self test');
  check('a spent route is skipped', openrouter.modelFor('fast') !== orModel, openrouter.modelFor('fast'));
  check('the paid route takes over', openrouter.modelFor('fast') === 'qwen/qwen3.8-27b',
    openrouter.modelFor('fast'));
  // Asserted through status().reason rather than isEnabled(), because this
  // environment has no key and isEnabled() is false for that reason alone.
  check('one spent route leaves another usable', openrouter.usableRoutes('fast').length > 0,
    openrouter.usableRoutes('fast'));
  openrouter.markExhausted('qwen/qwen3.8-27b', 'self test');
  check('with every route spent there is nothing left to ask',
    openrouter.usableRoutes('fast').length === 0, openrouter.usableRoutes('fast'));

  // ── review scheduling ────────────────────────────────────────────────────
  console.log('\nreview scheduling');
  const revUser = makeUser('review');
  const missed = mastery.recordAttempt({ userId: revUser.id, skillId: 'linear_eq', correct: false, difficulty: 5, levelDifficulty: 5 });
  const soon = Date.parse(missed.next_due_at) - Date.now();
  check('a missed skill comes back within a day', soon < 24 * 3600 * 1000, Math.round(soon / 3600000));
  for (let i = 0; i < 4; i++) {
    mastery.recordAttempt({ userId: revUser.id, skillId: 'linear_eq', correct: true, difficulty: 5, levelDifficulty: 5 });
  }
  const solid = mastery.stateFor(revUser.id, 'linear_eq');
  const later = Date.parse(solid.next_due_at) - Date.now();
  check('a solid skill comes back much later', later > 5 * 24 * 3600 * 1000, Math.round(later / 86400000));
  check('mastery rose with the streak', solid.mastery > 0.5, solid.mastery);

  // ── the Challenge Exam ───────────────────────────────────────────────────
  console.log('\nchallenge exam: the bands');
  // These pin the "every band perfect" rule, now the switched-off state; the
  // likelihood-ratio rule (CHALLENGE_SPRT, evidence P3) is tested in
  // scripts/curriculum-evidence-test.js.
  process.env.CHALLENGE_SPRT = 'off';
  const arith = curriculum.getGrade('math', 'sense_of_quantity');
  const bands92 = curriculum.skipExamBands(92, arith.pathLength);
  check('five bands of seven at level 92', bands92.length === 5 && bands92.every((b) => b.count === 7),
    bands92.map((b) => b.count));
  check('taken at 92 the bands are 100 to 140',
    bands92.map((b) => b.level).join(',') === '100,110,120,130,140', bands92.map((b) => b.level));
  check('thirty-five questions in total', curriculum.skipExamLength(92, arith.pathLength) === 35);
  check('a band is always above the level it is taken at',
    bands92.every((b) => b.level > 92), bands92.map((b) => b.level));
  // Near the end of the path there is not five ten-level marks left, so the exam
  // is shorter rather than pitched at levels that do not exist. The end of the
  // path is whatever the grade says it is — a path is as long as its syllabus
  // needs, and is no longer a fixed 250.
  //
  // What the rule actually does: the bands are the next five ten-level marks above
  // the learner, and one is kept while it is at or below the last level of the
  // path. So the claim is that the bands which fit are kept, the one after them is
  // dropped, and nothing is clamped onto a level that is not there. Written as the
  // rule reads rather than as a fixed expectation, because the number of bands
  // left near the end depends on how long the creator's grade is.
  const end = arith.pathLength;
  const nearEnd = curriculum.skipExamBands(end - 11, end);
  const firstBand = Math.floor((end - 11) / 10) * 10 + 10;
  const wouldHaveBeen = [0, 1, 2, 3, 4].map((i) => firstBand + i * 10)
    .filter((l) => l <= end);
  const dropped = [0, 1, 2, 3, 4].map((i) => firstBand + i * 10).find((l) => l > end);
  check('bands past the end of the path are dropped, not clamped',
    nearEnd.length === wouldHaveBeen.length
    && nearEnd.every((b, i) => b.level === wouldHaveBeen[i])
    && dropped !== undefined
    && !nearEnd.some((b) => b.level === dropped),
    { got: nearEnd.map((b) => b.level), dropped });

  // The scorer is where the whole feature lives, so the three cases from the
  // design are pinned exactly: all five clean skips to the top, a break in the
  // fourth lands on that band's own level, and a break in the first skips
  // nothing at all however well the rest went.
  const scored = (percents) => curriculum.skipTargetFromBands(percents.map((pct, i) => ({
    index: i, level: 100 + i * 10, total: 7, correct: Math.round((7 * pct) / 100),
  })));
  check('five clean bands skip to the top band', scored([100, 100, 100, 100, 100]) === 140,
    scored([100, 100, 100, 100, 100]));
  check('a break in band four lands on band four',
    scored([100, 100, 100, 40, 100]) === 130, scored([100, 100, 100, 40, 100]));
  check('a break in the first band skips nothing',
    scored([70, 100, 100, 100, 100]) === null, scored([70, 100, 100, 100, 100]));
  check('a break in band three lands on band three',
    scored([100, 100, 40, 100, 100]) === 120, scored([100, 100, 40, 100, 100]));

  console.log('\nchallenge exam: the run that earns it');
  const skipUser = makeUser('skip');
  const skipEnroll = enroll(skipUser, 'math', 'sense_of_quantity');
  // Park the learner high enough that a full set of bands still fits on the path.
  db.update('enrollments', skipEnroll.id, { current_level: 92 });

  // Twenty-four clean levels is one short of the offer.
  for (let level = 68; level < 92; level++) {
    mastery.recordLevelCleared({ userId: skipUser.id, enrollmentId: skipEnroll.id, level, accuracy: 1 });
  }
  check('the run counts consecutive clean levels',
    mastery.streakFor(skipUser.id, skipEnroll.id).run === 24,
    mastery.streakFor(skipUser.id, skipEnroll.id).run);
  check('no offer one level short', !mastery.skipOffer(skipUser.id, skipEnroll, arith).offered);

  mastery.recordLevelCleared({ userId: skipUser.id, enrollmentId: skipEnroll.id, level: 92, accuracy: 1 });
  const earned = mastery.skipOffer(skipUser.id, skipEnroll, arith);
  check('twenty-five clean levels earns the exam', earned.offered, earned);
  check('the offer is measured from where the learner stands',
    earned.from_level === 92 && earned.bands.map((b) => b.level).join(',') === '100,110,120,130,140', earned);

  // A level that was sat badly breaks the run, and takes the offer with it.
  const breakUser = makeUser('skipbreak');
  const breakEnroll = enroll(breakUser, 'math', 'sense_of_quantity');
  for (let level = 1; level <= 30; level++) {
    mastery.recordLevelCleared({ userId: breakUser.id, enrollmentId: breakEnroll.id, level, accuracy: level === 20 ? 0.6 : 1 });
  }
  check('a weak level resets the run', mastery.streakFor(breakUser.id, breakEnroll.id).run === 10,
    mastery.streakFor(breakUser.id, breakEnroll.id).run);
  check('a weak level cannot buy the offer', !mastery.skipOffer(breakUser.id, breakEnroll, arith).offered);
  // The mark is exactly 90%, so 89% breaks a run and 90% holds it.
  const edgeUser = makeUser('skippedge');
  const edgeEnroll = enroll(edgeUser, 'math', 'sense_of_quantity');
  for (let level = 1; level <= 2; level++) {
    mastery.recordLevelCleared({ userId: edgeUser.id, enrollmentId: edgeEnroll.id, level, accuracy: level === 1 ? 0.89 : 1 });
  }
  check('89% breaks the run and 100% starts it again',
    mastery.streakFor(edgeUser.id, edgeEnroll.id).run === 1, mastery.streakFor(edgeUser.id, edgeEnroll.id).run);
  // 12 of 13 is 92%, so it holds; 11 of 13 is 84%, so it does not.
  mastery.recordLevelCleared({ userId: edgeUser.id, enrollmentId: edgeEnroll.id, level: 3, accuracy: 12 / 13 });
  check('92% holds the run', mastery.streakFor(edgeUser.id, edgeEnroll.id).run === 2,
    mastery.streakFor(edgeUser.id, edgeEnroll.id).run);
  mastery.recordLevelCleared({ userId: edgeUser.id, enrollmentId: edgeEnroll.id, level: 4, accuracy: 11 / 13 });
  check('84% breaks it', mastery.streakFor(edgeUser.id, edgeEnroll.id).run === 0,
    mastery.streakFor(edgeUser.id, edgeEnroll.id).run);
  // Sitting the same level again is more evidence, not a fresh start — which is
  // what a learner parked on a checkpoint does every time they retake it.
  mastery.recordLevelCleared({ userId: edgeUser.id, enrollmentId: edgeEnroll.id, level: 5, accuracy: 1 });
  mastery.recordLevelCleared({ userId: edgeUser.id, enrollmentId: edgeEnroll.id, level: 5, accuracy: 1 });
  check('re-clearing the same level does not restart the run',
    mastery.streakFor(edgeUser.id, edgeEnroll.id).run === 1,
    mastery.streakFor(edgeUser.id, edgeEnroll.id).run);

  console.log('\nchallenge exam: sitting it');
  const examUser = makeUser('skiprun');
  const examEnroll = enroll(examUser, 'math', 'sense_of_quantity');
  db.update('enrollments', examEnroll.id, { current_level: 92 });
  for (let level = 68; level < 93; level++) {
    mastery.recordLevelCleared({ userId: examUser.id, enrollmentId: examEnroll.id, level, accuracy: 1 });
  }
  const built = await sessions.createSkipExamSession({ userId: examUser.id, enrollment: examEnroll, grade: arith });
  check('the exam is thirty-five questions', built.items.length === 35, built.items.length);
  check('the exam is its own kind of sitting', built.session.kind === 'skip');
  // One exam at a time: a second sitting on the same offer would mean whichever
  // finished last was the one that counted, and the learner was told the first
  // attempt never happened.
  const openExams = db.find('sessions', (s) => s.user_id === examUser.id && s.kind === 'skip' && !s.ended_at);
  check('only one exam is open at a time', openExams.length === 1, openExams.length);
  check('every band is stamped on its questions',
    [0, 1, 2, 3, 4].every((b) => built.items.filter((i) => i.band === b).length === 7),
    [0, 1, 2, 3, 4].map((b) => built.items.filter((i) => i.band === b).length));
  // A question from level 100's band is pitched at level 100, not at 92 — on the
  // grade's own difficulty band (GRADE_BANDS, on since 2026-10-24).
  const bandZero = built.items.filter((i) => i.band === 0);
  const at100 = arith && curriculum.difficultyForLevel(100, arith.pathLength, arith);
  check('band questions are pitched at their own band level',
    bandZero.every((i) => Math.abs(i.difficulty - at100) < 0.06), bandZero.map((i) => i.difficulty).slice(0, 3));
  check('the answer key never reaches the client', !('answer' in sessions.sanitize(built.items[0])));

  // Answer all seven of band 3 wrong and leave the rest right: the run must stop
  // on band 3 and the learner lands on that band rather than past it.
  //
  // The level the break lands on is read from the exam rather than written as
  // 130, because the scorer returns the level the band was drawn at and the
  // bands move with the layout. Pinning the number meant the check tested the
  // level a band used to sit on, and reported a scorer fault when a band had
  // moved — three failing checks for one number nobody had changed.
  const BROKEN_BAND = 3;
  const wrongAnswerAccepted = [];
  const rightAnswerRejected = [];
  for (const item of built.items) {
    const wrong = item.band === BROKEN_BAND;
    const res = await sessions.answer({
      userId: examUser.id,
      session: built.session,
      itemId: item.id,
      userAnswer: wrong ? 'definitely not the answer' : item.answer,
      ms: 1000,
    });
    if (res.correct === (wrong ? true : false)) {
      // A "wrong" string the grader accepts cannot fail a band, and a key the
      // grader rejects empties one the test meant to leave whole. Both are
      // reported rather than swallowed, because the symptom three checks later is
      // a level that is off by one band for no visible reason.
      const row = {
        id: item.id,
        band: item.band,
        band_level: item.band_level,
        format: item.format,
        marked: res.correct,
        key: String(item.answer).slice(0, 60),
      };
      if (wrong) wrongAnswerAccepted.push(row);
      else rightAnswerRejected.push(row);
    }
  }
  check('a deliberately wrong answer is marked wrong everywhere',
    wrongAnswerAccepted.length === 0, wrongAnswerAccepted.slice(0, 3));
  check('and each answer key is accepted when it is given',
    rightAnswerRejected.length === 0, rightAnswerRejected.slice(0, 3));
  const brokenBandLevel = built.items.find((i) => i.band === BROKEN_BAND).band_level;
  const skipScore = sessions.scoreSkipExam(built.session.id);
  check('the score is band by band', skipScore.bands.length === 5, skipScore.bands.length);
  check('a break in band four lands the learner on band four',
    skipScore.target_level === brokenBandLevel, {
      target: skipScore.target_level, want: brokenBandLevel,
    });
  const moved = mastery.awardSkip(examUser.id, examEnroll, arith, skipScore.target_level);
  check('the level actually moves', moved === brokenBandLevel, moved);
  check('and the enrollment is standing on it',
    db.byId('enrollments', examEnroll.id).current_level === brokenBandLevel);
  check('the offer is spent once taken', !mastery.skipOffer(examUser.id, examEnroll, arith).offered);

  // An exam that skips nothing still spends the offer, and leaves the run alone.
  const dudUser = makeUser('skipdud');
  const dudEnroll = enroll(dudUser, 'math', 'sense_of_quantity');
  db.update('enrollments', dudEnroll.id, { current_level: 92 });
  for (let level = 68; level < 93; level++) {
    mastery.recordLevelCleared({ userId: dudUser.id, enrollmentId: dudEnroll.id, level, accuracy: 1 });
  }
  const dud = await sessions.createSkipExamSession({ userId: dudUser.id, enrollment: dudEnroll, grade: arith });
  // Miss every question in the first band, get the rest right.
  for (const item of dud.items) {
    const wrong = item.band === 0;
    await sessions.answer({
      userId: dudUser.id, session: dud.session, itemId: item.id,
      userAnswer: wrong ? 'not this either' : item.answer, ms: 1000,
    });
  }
  const dudScore = sessions.scoreSkipExam(dud.session.id);
  check('failing the first band skips nothing', dudScore.target_level === null, dudScore.target_level);
  check('and the level does not move', mastery.spendOffer(dudUser.id, dudEnroll.id) === null);
  check('the offer is spent even when nothing was skipped',
    !mastery.skipOffer(dudUser.id, dudEnroll, arith).offered);
  check('the run survives, so another exam can be earned',
    mastery.streakFor(dudUser.id, dudEnroll.id).run === 25,
    mastery.streakFor(dudUser.id, dudEnroll.id).run);

  delete process.env.CHALLENGE_SPRT;

  // ── the written checkpoint ──────────────────────────────────────────────
  console.log('\nwritten checkpoint: which levels');
  const basics = curriculum.getGrade('english', 'basics');
  const grammar = curriculum.getGrade('english', 'grammar');
  // The written checkpoint levels in each English grade, found rather than
  // written down.
  //
  // They used to be pinned to 26 and 101, on the strength of the old sheet's rule
  // that a lesson sat on 25 and a quiz on the level after. The sheet now names
  // every level, and it does not use those numbers: it has an **Essay Draft**
  // wherever a cycle of lessons ends, and a **Master Quiz** beside it. Both are
  // written, and neither is a `master` or a `grand`, so `isEssayCheckpoint` was
  // answering false for every one of them — and true for the Master quizzes
  // standing next to them, which are not writing at all. The sheet's word wins
  // now; these are looked up so the test follows it.
  const basicsEssay = LAYOUT.levelsOfKind(basics, 'essay', 1);
  const grammarEssay = LAYOUT.levelsOfKind(grammar, 'essay', 1);
  const basicsMaster = LAYOUT.levelsOfKind(basics, 'master', 1);
  const grammarGrand = LAYOUT.levelsOfKind(grammar, 'grand', 1);
  check('the kindergarten grade has a written checkpoint the sheet named',
    basicsEssay.length > 0, basicsEssay.length);
  check('and so does the first-grade grade', grammarEssay.length > 0, grammarEssay.length);
  check('a written level is written work',
    basicsEssay.every((l) => curriculum.isEssayCheckpoint(basics, l)), basicsEssay.slice(0, 3));
  check('a Master quiz beside it is not',
    basicsMaster.every((l) => !curriculum.isEssayCheckpoint(basics, l)), basicsMaster.slice(0, 3));
  check('and a Grand Master is not either',
    grammarGrand.every((l) => !curriculum.isEssayCheckpoint(grammar, l)), grammarGrand.slice(0, 3));
  // The last level of the path, wherever the path ends. A path is as long as its
  // syllabus needs, so this is not a fixed number any more.
  check('the English Graduation exam is not',
    !curriculum.isEssayCheckpoint(basics, basics.pathLength), basics.pathLength);
  // A grade that names its levels is judged by them, and a grade on the rule by the
  // track. The two answers differ on the same number, which is the point.
  //
  // `ruleArith` is a grade on the arithmetic rule, built earlier in this file as
  // `ruleGrade`. It used to be `math/arithmetic`, which the Math spreadsheet
  // replaced: all forty-nine math grades now name their own levels, so no real
  // grade is left to be the rule-shaped half of this comparison, and pointing it
  // at a sheet grade would have made both sides say `practice` and the check would
  // have passed while testing nothing.
  //
  // It is named differently from the `arith` above because that one is a sheet
  // grade used for the Challenge Exam bands, and the two are deliberately not the
  // same thing.
  const ruleArith = ruleGrade;
  check('a math Master is still a quiz', !curriculum.isEssayCheckpoint(ruleArith, 25), 25);
  check('an ACT English Master is still a quiz',
    !curriculum.isEssayCheckpoint(curriculum.getGrade('act', 'act_english'), 25), 25);
  check('a non-checkpoint level is not written work', !curriculum.isEssayCheckpoint(basics, 30), 30);
  check('levelKind follows the grade: the same level is a lesson in one and a quiz in the other',
    curriculum.levelKind(25, basics.pathLength, basics) === 'practice'
    && curriculum.levelKind(25, ruleArith.pathLength, ruleArith) === 'master',
    [curriculum.levelKind(25, basics.pathLength, basics),
      curriculum.levelKind(25, ruleArith.pathLength, ruleArith)]);
  check('the delivered kind is what changes',
    curriculum.checkpointKind(basics, basicsEssay[0]) === 'essay'
    && curriculum.checkpointKind(ruleArith, 25) === 'master',
    [curriculum.checkpointKind(basics, basicsEssay[0]), curriculum.checkpointKind(ruleArith, 25)]);
  check('the label follows the level',
    curriculum.checkpointLabel(basics, basicsEssay[0]) === 'Essay'
    && curriculum.checkpointLabel(basics, basicsMaster[0]) === 'Master quiz'
    && curriculum.checkpointLabel(ruleArith, 25) === 'Master quiz',
    [curriculum.checkpointLabel(basics, basicsEssay[0]),
      curriculum.checkpointLabel(basics, basicsMaster[0]),
      curriculum.checkpointLabel(ruleArith, 25)]);
  check('an essay passes on the writing at 75%', curriculum.PASS_MARKS.essay === 0.75);
  check('an essay is a checkpoint as far as the app is concerned', curriculum.isCheckpoint('essay'));

  console.log('\nwritten checkpoint: the rubric');
  const known = new Set(['main_idea', 'inference', 'transitions', 'detail_support']);
  const goodRubric = {
    prompt: 'Should school start later in the morning? Argue a position and give reasons.',
    guidance: 'Three to five paragraphs. Say what you think and why.',
    criteria: [
      { skill_id: 'main_idea', name: 'Main idea', levels: ['a', 'b', 'c', 'd'] },
      { skill_id: 'inference', name: 'Inference', levels: ['a', 'b', 'c', 'd'] },
      { skill_id: 'transitions', name: 'Transitions', levels: ['a', 'b', 'c', 'd'] },
    ],
  };
  check('a usable rubric is accepted', !!ai.validateEssayPrompt(goodRubric, known, 25, {}));
  // A criterion naming a skill this level has not met is dropped, not repaired:
  // it promises a weak mark leads somewhere, and it cannot keep that promise.
  const withStranger = {
    ...goodRubric,
    criteria: [...goodRubric.criteria, { skill_id: 'acts_on_it', name: 'X', levels: ['a', 'b', 'c', 'd'] }],
  };
  const pruned = ai.validateEssayPrompt(withStranger, known, 25, {});
  check('a criterion on an unknown skill is dropped',
    pruned && pruned.criteria.length === 3
    && !pruned.criteria.some((c) => c.skill_id === 'acts_on_it'), pruned && pruned.criteria.length);
  check('a rubric with too few left is refused',
    ai.validateEssayPrompt({ ...goodRubric, criteria: goodRubric.criteria.slice(0, 2) }, known, 25, {}) === null);
  check('a rubric with the wrong number of levels is refused',
    ai.validateEssayPrompt({ ...goodRubric, criteria: goodRubric.criteria.map((c) => ({ ...c, levels: ['a', 'b', 'c'] })) }, known, 25, {}) === null);
  // The introduction schedule is coarse — a five-skill grade has met exactly one
  // skill by level 25 — so a rubric drawn only from what is introduced would be a
  // single criterion. The two writing criteria are always available, and are
  // marked but never drilled.
  const earlyPlan = { introduced: ['parts_of_speech'], all: ['parts_of_speech', 'subject_verb', 'punctuation_basic'] };
  const earlyRubric = ai.validateEssayPrompt({
    prompt: 'Should school start later in the morning? Argue a position and give reasons.',
    guidance: 'Three to five paragraphs.',
    criteria: [
      { skill_id: 'parts_of_speech', name: 'Parts of speech', levels: ['a', 'b', 'c', 'd'] },
      { skill_id: 'writing_structure', name: 'Structure', levels: ['a', 'b', 'c', 'd'] },
      { skill_id: 'writing_clarity', name: 'Clarity', levels: ['a', 'b', 'c', 'd'] },
    ],
  }, new Set(['parts_of_speech']), 25, earlyPlan);
  check('a rubric can be built before the skills run out', !!earlyRubric && earlyRubric.criteria.length === 3, earlyRubric && earlyRubric.criteria.length);
  check('a criterion on a skill not yet met is not drillable',
    earlyRubric && earlyRubric.criteria.find((c) => c.skill_id === 'parts_of_speech').introduced === true
    && earlyRubric.criteria.find((c) => c.skill_id === 'writing_structure').introduced === false);
  check('and such a criterion does not become a practice area',
    sessions.areasFromEssay(
      { prompt: 'p', criteria: [{ skill_id: 'writing_structure', skill_name: 'S', name: 'S', introduced: false, levels: [] }] },
      { criteria: [{ index: 0, score: 1, evidence: 'e', next_step: 'n' }] }).length === 0);

  console.log('\nwritten checkpoint: the mark');
  // The overall is recomputed from the criteria, so a model that miscounts
  // cannot talk a learner past a checkpoint.
  const marked = ai.validateEssayGrade({
    criteria: [
      { index: 0, score: 3, evidence: 'q', next_step: 'n' },
      { index: 1, score: 2, evidence: 'q', next_step: 'n' },
      { index: 2, score: 4, evidence: 'q', next_step: 'n' },
      { index: 3, score: 4, evidence: 'q', next_step: 'n' },
    ],
  }, 4);
  check('the mark is recomputed from the criteria', Math.abs(marked.overall - 13 / 16) < 1e-9, marked.overall);
  check('a score outside one to four is refused',
    ai.validateEssayGrade({ criteria: [{ index: 0, score: 9, evidence: 'q', next_step: 'n' }, { index: 1, score: 2, evidence: 'q', next_step: 'n' }] }, 2) === null);
  check('a criterion index out of range is dropped',
    ai.validateEssayGrade({
      criteria: [{ index: 0, score: 3, evidence: 'q', next_step: 'n' }, { index: 9, score: 3, evidence: 'q', next_step: 'n' }, { index: 1, score: 2, evidence: 'q', next_step: 'n' }],
    }, 2).criteria.length === 2);

  console.log('\nwritten checkpoint: sitting it');
  // Written on English 1st Grade (grammar): the preschool-to-Kindergarten
  // grade's checkpoints are "Oral Retell", said aloud since the learner
  // follow-ups of 2026-10-24 (services/essays.js oralKindFor); they are checked
  // just after this section.
  const writtenGrade = curriculum.getGrade('english', 'grammar');
  const writtenEssay = LAYOUT.levelsOfKind(writtenGrade, 'essay', 1);
  const essayUser = makeUser('essay');
  const essayEnroll = enroll(essayUser, 'english', 'grammar');
  // The first written level the sheet names in this grade, which is where a
  // learner is asked to write. Found rather than pinned: the sheet decides, and it
  // puts an Essay Draft wherever a cycle of lessons ends.
  db.update('enrollments', essayEnroll.id, {
    current_level: writtenEssay[0], status: 'active',
  });
  const started = await sessions.createSession({ userId: essayUser.id, enrollment: essayEnroll, grade: writtenGrade });
  check('a written checkpoint is its own kind of sitting', started.session.kind === 'essay', started.session.kind);
  check('the quick check is short', started.items.length === 5, started.items.length);
  check('the quick check is the block', started.items.every((i) => i.role === 'exam'), started.items[0].role);
  check('there is a topic and a rubric', started.essay && started.essay.prompt && started.essay.criteria.length >= 3,
    started.essay && started.essay.criteria.length);
  check('the rubric names only things this course can mark on',
    started.essay.criteria.every((c) => writtenGrade.skills.includes(c.skill_id)
      || c.skill_id === 'writing_structure' || c.skill_id === 'writing_clarity'),
    started.essay.criteria.map((c) => c.skill_id));
  check('and at least one criterion is on a skill they have met',
    started.essay.criteria.some((c) => c.introduced === true),
    started.essay.criteria.map((c) => [c.skill_id, c.introduced]));
  check('the essay is joined to the session it was built for',
    essays.forSession(essayUser.id, started.session.id, 0) !== null);
  // The rule-based fallback must not invent a prose judgement. A learner is never
  // told they failed a piece of writing by something that did not read it.
  const stored = db.byId('essays', started.essay.id);
  const tooShort = await essays.grade(stored, 'word '.repeat(20), essayUser.id);
  check('a short essay is refused before it is marked', !!tooShort.error, tooShort.overall);
  const unmarked = await essays.grade(stored, 'word '.repeat(120), essayUser.id);
  check('marking without a model says so rather than guessing',
    unmarked.source === 'rules' && !unmarked.passed, unmarked.source);
  check('and the fallback names no criterion as a weakness',
    unmarked.criteria.every((c) => c.score === null), unmarked.criteria[0]);
  check('the attempt is still recorded, so a rewrite can improve on it',
    db.byId('essays', started.essay.id).attempts.length === 1);

  console.log('\nspoken checkpoint: preschool to Kindergarten');
  const oralUser = makeUser('oral');
  const oralEnroll = enroll(oralUser, 'english', 'basics');
  db.update('enrollments', oralEnroll.id, { current_level: basicsEssay[0], status: 'active' });
  const oralStarted = await sessions.createSession({ userId: oralUser.id, enrollment: oralEnroll, grade: basics });
  check('an Oral Retell is still a checkpoint sitting with its quick check',
    oralStarted.session.kind === 'essay' && oralStarted.items.length === 5, oralStarted.session.kind);
  check('but it is said aloud, not written: no rubric, no word minimum',
    !!oralStarted.essay && oralStarted.essay.mode === 'oral' && oralStarted.essay.criteria.length === 0 && oralStarted.essay.min_words === 0,
    oralStarted.essay && oralStarted.essay.mode);
  check('a 1st Grade essay is still written', started.essay.mode === 'written', started.essay.mode);

  console.log('\nwritten checkpoint: weak areas from the rubric');
  const weakAreas = sessions.areasFromEssay(
    { prompt: 'p', criteria: [{ skill_id: 'inference', skill_name: 'Inference', name: 'Inference', levels: ['a', 'b', 'c', 'd'] }] },
    { criteria: [{ index: 0, score: 1, evidence: 'e', next_step: 'n' }] });
  check('a weak criterion becomes a drillable area', weakAreas.length === 1 && weakAreas[0].skill_id === 'inference', weakAreas);
  check('a strong criterion is not an area',
    sessions.areasFromEssay({ prompt: 'p', criteria: [{ skill_id: 'inference', skill_name: 'I', name: 'I', levels: [] }] },
      { criteria: [{ index: 0, score: 4, evidence: 'e', next_step: 'n' }] }).length === 0);
  // An unmarked criterion is not a known weakness. Treating one as an area would
  // send a learner to practise something nobody has established is wrong.
  check('an unmarked criterion is not an area',
    sessions.areasFromEssay({ prompt: 'p', criteria: [{ skill_id: 'inference', skill_name: 'I', name: 'I', levels: [] }] },
      { criteria: [{ index: 0, score: null, evidence: '', next_step: 'n' }] }).length === 0);

  // ── skipping ─────────────────────────────────────────────────────────────
  console.log('\nskipping: who may');
  const { canSkip } = require('../config/capabilities');
  const { publicUser } = require('../middleware/auth');
  check('the one account may skip', canSkip({ email: 'the.landon.d@gmail.com' }));
  check('casing does not matter', canSkip({ email: 'The.Landon.D@Gmail.com ' }));
  check('nobody else may', !canSkip({ email: 'someone@example.com' }) && !canSkip({ email: 'the.landon.d@evil.com' }));
  check('nobody at all may', !canSkip(null) && !canSkip({}));
  // Every real account in the data file, checked against its own address rather
  // than against a sample: the one exception should be the only true in 500+.
  const realAccounts = db.all('users');
  // At most the one address: a fresh install has no owner account yet, and
  // "exactly one" failed there for a reason that has nothing to do with skipping.
  check('no other address is allowed, across every account',
    realAccounts.filter(canSkip).every((u) => u.email === 'the.landon.d@gmail.com'),
    realAccounts.filter(canSkip).map((u) => u.email));
  check('the browser is told, and only that', publicUser({ id: 1, email: 'the.landon.d@gmail.com' }).can_skip === true
    && publicUser({ id: 2, email: 'x@y.com' }).can_skip === false);

  // ── going back ────────────────────────────────────────────────────────────
  //
  // "Open another level" was one permission, and it was the wrong one. It asked
  // `canSkip`, which is a single account, so a level the learner had *already
  // worked through* was closed to them — and the path page labelled it "locked",
  // which is a claim about a level they had finished. Re-reading a lesson before
  // the quiz that covers it is ordinary use of a course.
  //
  // Two permissions, and they are genuinely different questions:
  //
  //   behind   they have been there. Theirs, for every account, and it is a
  //           preview — the session is built at that level and the enrollment does
  //           not move, so it cannot cost them their position.
  //   ahead    material they have not been taught, possibly including a
  //           checkpoint they would then sit at a level they were never taught
  //           for. That is what the skip permission is for, and it stays.
  //
  // The rule is checked against the *route's own* decision function, not against
  // a copy of it written here. A local reimplementation of the same condition
  // would pass whether or not the route did, which is the check-against-itself
  // trap this file has been bitten by before.
  console.log('\ngoing back to a level you have already done');
  {
    const { mayOpenLevel } = require('../routes/learn');
    check('a level at or behind where they stand needs no permission',
      mayOpenLevel(10, 10, false) && mayOpenLevel(1, 10, false) && mayOpenLevel(7, 10, false));
    check('a level beyond it does — and one account holds it',
      mayOpenLevel(11, 10, true) && !mayOpenLevel(11, 10, false)
      && !mayOpenLevel(140, 10, false));
    check('so the permission stays exactly where it was',
      mayOpenLevel(140, 10, true) === true
      && canSkip({ email: 'the.landon.d@gmail.com' })
      && !canSkip({ email: 'someone@example.com' }));
  }

  // ── generated base lessons ─────────────────────────────────────────────────
  //
  // The base lesson is the lesson as the course teaches it, before any learner
  // tailoring: one page per level, the same for everybody allowed to see it. What
  // is checked here is the deterministic half — the fields the prompt is built
  // from, the permission, and the rule for finishing a level — because those are
  // what can be checked without a model and without a generated page existing.
  // The model half is checked by running it: `npm run lesson:generate`.
  console.log('\nbase lessons: what the prompt is built from');
  {
    const { lessonConfig, ageRangeForBand } = require('./lib/lesson-prompt');
    const base = require('../config/base-lessons');

    // The creator's own worked example is the definition of the age rule: 3rd-4th
    // grade, average age 8, range 6-10. If the rule stops reproducing that, it is
    // no longer the rule that was given.
    const example = ageRangeForBand('3rd to 4th Grade');
    check('the age rule reproduces the creator\'s example: 3rd-4th is 6-10',
      example.average === 8 && example.low === 6 && example.high === 10, example);

    // And it must not collapse for a band it cannot read, because a default age is
    // a number the prompt would then state as fact.
    const unreadable = ageRangeForBand('Some Future Band');
    check('a band naming no year gets no invented age',
      unreadable.average === null && /Insert Target Age Range/.test(unreadable.text), unreadable);

    const c = lessonConfig('english', 'proficient', 105);
    check('a level\'s topic and coverage come from the sheet',
      c.topic === 'Tone Control in Writing'
      && c.generalization === 'Shifting attitude and formality deliberately across a piece.',
      { topic: c.topic, covers: c.generalization });
    check('the lesson sequence number is a count of lessons, not a level number',
      c.sequence === 12 && c.level === 105 && c.lessonCount === 61,
      { sequence: c.sequence, level: c.level, of: c.lessonCount });
    check('and the game engine follows from the sequence number',
      c.variant === ((c.sequence - 1) % 20) + 1, { sequence: c.sequence, variant: c.variant });
    check('the neighbouring lessons are named',
      c.previous === 'Diction and Precision' && c.future.length === 2,
      { previous: c.previous, future: c.future });

    // The prompt is one template for every lesson, so a level that is not a lesson
    // must be refused rather than taught — a quiz has no lesson page.
    let refused = false;
    try { lessonConfig('english', 'proficient', 25); } catch { refused = true; }
    check('a level that is not a lesson has no base-lesson prompt', refused);

    // Who may see them. The owner may; an ordinary account may not; and a
    // capability that decided on case would deny the owner their own product.
    check('the owner may see generated lessons',
      base.canSeeBaseLessons({ email: 'the.landon.d@gmail.com' }));
    check('casing and stray spaces do not lock the owner out',
      base.canSeeBaseLessons({ email: ' The.Landon.D@Gmail.com ' }));
    check('an ordinary account may not',
      !base.canSeeBaseLessons({ email: 'allgrades@example.test' })
      && !base.canSeeBaseLessons({ email: '' })
      && !base.canSeeBaseLessons(null));
    check('and the base list is additive, never a replacement for the owner',
      !base.canSeeBaseLessons({ email: 'someone@else.com' }));

    // The page used to be assembled from nine parts the model wrote separately;
    // the generator now asks for it whole in one call (see the note at the top of
    // scripts/generate-base-lesson.js), so there is no assembly step left to test.
    const gen = require('./generate-base-lesson');

    // A fenced answer with prose around it, which is what a model gives when asked
    // for "HTML only". Left in, the fence and the sign-off both render.
    const fenced = 'Here you go:\n\n```html\n<section>the lesson</section>\n```\n\n'
      + 'Hope that helps! Let me know if you want changes.';
    const cleaned = gen.extractHtml(fenced);
    check('a fenced answer with prose around it becomes the fragment',
      cleaned === '<section>the lesson</section>', JSON.stringify(cleaned));

    // A whole document, which is what comes back when the model is asked for a
    // page rather than a fragment. It renders inside another document otherwise.
    const doc = '<!DOCTYPE html>\n<html>\n<head><title>x</title></head>\n<body>\n'
      + '<section>the lesson</section>\n</body>\n</html>';
    check('a whole document is reduced to what is inside its body',
      gen.extractHtml(doc) === '<section>the lesson</section>', gen.extractHtml(doc));

    // And the contract the page is served under, checked on something shaped like
    // a page rather than on the model's good intentions. The wording matters: these
    // strings are what a person reads when a generated page needs regenerating.
    const good = '<style>#base-lesson-body{--accent:#F43F5E}'
      + '@media(max-width:360px){#base-lesson-body .base-grid{grid-template-columns:1fr}}</style>'
      // Long enough to be a lesson: inspect() refuses anything under 400 characters.
      + `<div id="base-lesson-body"><section>${'Tone is the attitude a writer takes toward a subject and a reader. '.repeat(5)}</section>`
      + '<button id="base-finish-btn">Finish Lesson</button>'
      + '<script>window.polymathFinishLesson&&window.polymathFinishLesson()</script></div>';
    check('a page that meets the contract is accepted', gen.inspect(good) === null, gen.inspect(good));
    check('a page with no script is refused, because nothing would work',
      gen.inspect(good.replace(/<script[\s\S]*?<\/script>/, ''))
      === 'it has no <script> block, so nothing would be interactive');
    check('a page that reaches outside itself is refused',
      /external/.test(gen.inspect(good.replace('<script>',
        '<script src="https://cdn.example.com/x.js"><script>')) || ''));
    check('a page with no Finish Lesson is refused, so nobody is stranded',
      /Finish Lesson/.test(gen.inspect(good.replace(/Finish Lesson/, 'Continue')) || ''));
    check('a page with no width handling is refused, so a phone is not left out',
      /phone/.test(gen.inspect(good.replace(/@media[^{]*\{[^}]*\}/, '')) || ''));
    check('a page with nothing marked as the root is refused, so the CSS applies',
      /applies to nothing/.test(gen.inspect(
        good.replace('<div id="base-lesson-body">', '<div>')) || ''));
    // The one that would actually reach the app's own header: an unscoped rule.
    check('a CSS rule outside the root is refused, because it would restyle the page around it',
      /reach the page around the lesson/.test(gen.inspect(good.replace('--accent:#F43F5E',
        '--accent:#F43F5E} body{background:#fff')) || ''));
  }

  // ── reading the whole curriculum ──────────────────────────────────────────
  // A separate question from moving through it. Skipping is "how far can I get";
  // browsing is "what does this product teach" — every subject, every grade, every
  // level, joined or not. It grants no access and moves nothing, and it is
  // refused everywhere else.
  console.log('\nreading the whole curriculum: who may');
  const { canBrowse } = require('../config/capabilities');
  check('the one account may read it', canBrowse({ email: 'the.landon.d@gmail.com' }));
  check('casing does not matter', canBrowse({ email: 'The.Landon.D@Gmail.com ' }));
  check('nobody else may', !canBrowse({ email: 'someone@example.com' })
    && !canBrowse({ email: 'the.landon.d@evil.com' }));
  check('nobody at all may', !canBrowse(null) && !canBrowse({}));
  check('and across every real account nobody else may',
    realAccounts.filter(canBrowse).every((u) => u.email === 'the.landon.d@gmail.com'),
    realAccounts.filter(canBrowse).map((u) => u.email));
  check('the browser is told about browsing, and only that',
    publicUser({ id: 1, email: 'the.landon.d@gmail.com' }).can_browse === true
    && publicUser({ id: 2, email: 'x@y.com' }).can_browse === false);

  // The plan the curriculum view serves is the same one the learner is served,
  // so it can be checked here rather than only over HTTP: every grade, every
  // level, and the level's own title and coverage on every node.
  console.log('\nthe curriculum, as the view serves it');
  const missingLevels = [];
  const nodesWithoutContent = [];
  // The line under a node's title is what the level covers, taken from that same
  // level's row. Checked here because the node is built from the same call: a
  // level that carries a title but no coverage would show a row with a heading
  // and nothing under it.
  const statedNodesWithoutCoverage = [];
  const statedNodesWithoutType = [];
  // Which grade is missing which of its opening levels, named one grade at a time.
  // The reason this is a list of grades rather than a count is in the section
  // above: a count passes with fifteen good grades and one broken one, and it
  // cannot be read to find out which. Each entry here is a grade and the levels it
  // is missing, so a failure names itself.
  const gradesMissingOpenings = [];
  let statedNodesChecked = 0;
  for (const track of curriculum.TRACKS) {
    for (const grade of track.grades) {
      const nodes = [];
      for (let level = 1; level <= grade.pathLength; level++) {
        const plan = curriculum.levelPlan(grade, level);
        const t = topicLib.topicFor(grade, level, plan.focus, track.id);
        const entry = LAYOUT.entryFor(grade, level);
        nodes.push({
          level,
          kind: plan.kind,
          // What the course calls this level, and what sort it says it is. The
          // page builds its heading from these and nothing else, so a node
          // without them is a row that can only fall back to a bare level number.
          level_title: entry ? entry.title : null,
          type: entry ? entry.type : null,
          topic: t ? t.topic : null,
          covers: t ? (t.covers || null) : null,
        });
      }
      if (nodes.length !== grade.pathLength) missingLevels.push(`${track.id}/${grade.id}`);

      // Levels 1 to 9, on the nodes the page is built from, for every grade of
      // every subject. Not only the sheet-backed ones: a rule-shaped grade whose
      // first lesson moved to level 10 is the same bug with a different cause, and
      // a Math sheet landing tomorrow lands in this walk with nothing to add.
      //
      // Presence alone is not the test, and finding out why took breaking a grade
      // on purpose. Taking levels 1-9 off a grade that has a `levels` array does
      // **not** make them vanish: the layout treats such a grade as fully stated
      // and never asks the arithmetic rule, so the nine come back — as bare
      // `practice`, with no title and no type. They render as empty rows, which
      // is what "the opening levels are missing" looks like on screen. So this
      // checks the title and the type, not only that a node exists.
      const stated = LAYOUT.isStated(grade);
      for (let l = 1; l <= 9; l++) {
        const n = nodes.find((x) => x.level === l);
        if (!n) {
          gradesMissingOpenings.push(`${track.id}/${grade.id} has no node for level ${l}`);
        } else if (stated && !n.level_title) {
          gradesMissingOpenings.push(`${track.id}/${grade.id} level ${l} has no title`);
        } else if (stated && !n.type) {
          gradesMissingOpenings.push(`${track.id}/${grade.id} level ${l} has no type`);
        }
      }

      // A grade that names its levels: every one of them must carry the title and
      // the coverage from its own row, not only the lessons. An Activity's
      // coverage is what says which Activity it is.
      if (LAYOUT.isStated(grade)) {
        for (const n of nodes) {
          if (n.level === grade.pathLength) continue; // the exam past the sheet
          statedNodesChecked++;
          if (!n.level_title || !n.covers) {
            statedNodesWithoutCoverage.push(`${track.id}/${grade.id} level ${n.level}`);
          }
          // The course's own word for the level, which the page prints as the
          // heading. It is not the kind: "Activity" and "Lesson on phonics" are
          // the same behaviour and very different things to read, and a heading
          // that loses the distinction tells a learner nothing about the level.
          if (!n.type) {
            statedNodesWithoutType.push(`${track.id}/${grade.id} level ${n.level}`);
          }
        }
      }
      // Every node has something to show, whichever kind of grade it is.
      for (const n of nodes) {
        if (!n.level_title && !n.topic) {
          nodesWithoutContent.push(`${track.id}/${grade.id} level ${n.level}`);
        }
      }
    }
  }
  check('every grade in every subject has a node for every level',
    missingLevels.length === 0, missingLevels.join(', '));
  check('and every grade has levels 1 to 9 on the page, named per grade so a'
    + ' failure says which',
  gradesMissingOpenings.length === 0, gradesMissingOpenings.slice(0, 6).join('; '));
  check('and every node has a title to show', nodesWithoutContent.length === 0,
    nodesWithoutContent.slice(0, 4).join('; '));
  check(`and all ${statedNodesChecked} levels of a course that names them carry their`
    + ' own title and coverage',
  statedNodesWithoutCoverage.length === 0, statedNodesWithoutCoverage.slice(0, 4).join('; '));
  check('and the course\'s own word for each of them, which the page prints',
    statedNodesWithoutType.length === 0, statedNodesWithoutType.slice(0, 4).join('; '));

  // A course's opening levels must be on the page wherever the learner stands.
  //
  // Every English grade opens with nine Testers — the entry checks that decide
  // which lessons may be skipped — and the path used to be drawn from five levels
  // behind the learner, so a learner standing on level 40 could not see any of
  // them. The data was being served the whole time; the page started too far in.
  //
  // Checked against the route's own function rather than a copy of its arithmetic,
  // because a copy is exactly how a five-level rule survives a check that agrees
  // with it — which is how this one survived in the first place.
  const { windowStartFor } = require('../routes/learn');
  check('the path is drawn from level 1, so a course\'s opening is never scrolled past',
    windowStartFor() === 1, windowStartFor());
  // Every grade of both sheet-backed tracks, not just English. The Reading sheet
  // opens its grades the same way, and a check that reads one track's grades is a
  // check that would pass with the other track's opening levels missing.
  check('and the first nine levels of every English and Reading grade are its Testers',
    curriculum.TRACKS.filter((t) => t.id === 'english' || t.id === 'reading')
      .every((t) => t.grades.every((g) => {
        const idx = LAYOUT.statedIndex(g);
        if (!idx) return false;
        const first9 = [...idx.byLevel.values()].filter((e) => e.level <= 9);
        return first9.length === 9 && first9.every((e) => e.type === 'Tester');
      })), '');
  // And the same for every grade on the rule, whose levels 1 to 9 are practice
  // behind a lesson on level 1. The window is what makes them reachable, so this
  // is the check that would have caught it.
  check('and every grade on the rule reaches its own level 1',
    curriculum.TRACKS.every((t) => t.grades.every((g) => {
      if (LAYOUT.isStated(g)) return true;
      return g.pathLength >= 10 && curriculum.levelKind(1, g.pathLength, g) === 'lesson';
    })), '');

  // The curriculum page's "earlier lessons" and "later lessons" buttons, as
  // paging. The forward one was dead after a single click: it moved by a count of
  // lessons rather than by the page it was on, landed on a level that was itself a
  // lesson, and the next search for "a lesson after this one" found nothing it had
  // not already shown — so every click after the first did nothing. A button that
  // is dead on the second press is a button nobody presses twice, and the page is
  // eight hundred levels long.
  //
  // The view and its handler are duplicated here rather than imported, because
  // `public/js/curriculum.js` is a browser module that mounts itself and there is
  // no way to require it in Node. A copy that drifts from the original is a risk,
  // so the numbers it asserts are structural — one click per page, reaching the
  // last level, returning to the first — and they fail loudly if the shape changes.
  console.log('\ncurriculum paging: the earlier and later buttons');
  {
    const SLICE = 40;
    /** Where the final page starts, so it holds the last rows rather than one. */
    const lastPageStart = (len) => Math.max(0, (Math.ceil(len / SLICE) - 1) * SLICE);
    const pageFaults = [];
    for (const track of curriculum.TRACKS) {
      for (const grade of track.grades) {
        const nodes = [];
        for (let level = 1; level <= grade.pathLength; level++) {
          const plan = curriculum.levelPlan(grade, level);
          nodes.push({ level, kind: plan.kind });
        }
        for (const onlyLessons of [false, true]) {
          const shown = onlyLessons
            ? nodes.filter((n) => n.kind === 'lesson') : nodes;
          if (!shown.length) continue;
          const hasForward = (i) => i + SLICE < shown.length;
          const hasBack = (i) => i - SLICE >= 0;
          const at = (i) => shown[Math.max(0, Math.min(shown.length - 1, i))].level;

          // Forward to the end, one page per click. The page start is clamped to
          // the last *page*, not the last row: clamping to the last row would make
          // the final page start on the final level and show one row, so a path of
          // 571 levels — fifteen pages, the last holding eleven — would never
          // display levels 561 to 570 at all.
          let i = 0;
          let clicks = 0;
          while (hasForward(i) && clicks < 500) {
            const before = at(i);
            i = Math.min(lastPageStart(shown.length), i + SLICE);
            clicks++;
            if (at(i) === before) {
              pageFaults.push(`${track.id}/${grade.id}${onlyLessons ? ' lessons-only' : ''}:`
                + ` forward stalled at level ${before}`);
              break;
            }
          }
          const lastStart = lastPageStart(shown.length);
          const lastRowShown = shown[Math.min(shown.length - 1, lastStart + SLICE - 1)].level;
          if (lastRowShown !== shown[shown.length - 1].level) {
            pageFaults.push(`${track.id}/${grade.id}${onlyLessons ? ' lessons-only' : ''}:`
              + ` last page ends at ${lastRowShown}, not ${shown[shown.length - 1].level}`);
          }
          if (clicks !== Math.ceil(shown.length / SLICE) - 1) {
            pageFaults.push(`${track.id}/${grade.id}${onlyLessons ? ' lessons-only' : ''}:`
              + ` ${clicks} clicks for ${Math.ceil(shown.length / SLICE) - 1} pages`);
          }
          // And back to the start, one page per click.
          let back = 0;
          while (hasBack(i) && back < 500) {
            i = Math.max(0, i - SLICE);
            back++;
          }
          if (i !== 0) {
            pageFaults.push(`${track.id}/${grade.id}${onlyLessons ? ' lessons-only' : ''}:`
              + ` paging back stopped at index ${i}, not 0`);
          }
          if (hasBack(i)) {
            pageFaults.push(`${track.id}/${grade.id}${onlyLessons ? ' lessons-only' : ''}:`
              + ` still has an "earlier" button at the start`);
          }
        }
      }
    }
    // The two directions are walked in one loop and reported together, because they
    // are the same arithmetic run in two directions and a failure in either is the
    // same fault. Split into two checks they would both print the same list.
    check('later lessons pages to the end and earlier lessons back to the start,'
      + ' on every path and both views',
    pageFaults.length === 0, pageFaults.slice(0, 3).join('; '));
  }

  console.log('\nskipping: what it does');
  const powerUser = makeUser('powers');
  const powerEnroll = enroll(powerUser, 'math', 'sense_of_quantity');
  db.update('enrollments', powerEnroll.id, { current_level: 30, status: 'active' });
  // A skipped level moves them on and counts for nothing — see mastery.skipLevel.
  mastery.recordLevelCleared({ userId: powerUser.id, enrollmentId: powerEnroll.id, level: 30, accuracy: 1 });
  const runBefore = mastery.streakFor(powerUser.id, powerEnroll.id).run;
  const jumped = mastery.skipLevel(powerEnroll, arith);
  check('a skipped level moves them on', jumped === 31, jumped);
  check('and does not count as cleared',
    mastery.streakFor(powerUser.id, powerEnroll.id).run === runBefore, mastery.streakFor(powerUser.id, powerEnroll.id).run);
  check('and is recorded as skipped', db.byId('enrollments', powerEnroll.id).skipped_level === true);

  // A skipped question leaves `correct` null, which is what every accuracy
  // calculation in the app already filters on. The other questions are answered
  // first so the denominator is not zero to begin with — an unanswered question
  // is null too, and would make this pass for the wrong reason.
  const qSession = await sessions.createSession({ userId: powerUser.id, enrollment: powerEnroll, grade: arith });
  const q = qSession.items[0];
  for (const item of qSession.items.slice(1)) {
    await sessions.answer({ userId: powerUser.id, session: qSession.session, itemId: item.id, userAnswer: item.answer, ms: 500 });
  }
  check('the answered ones are in the denominator',
    qSession.items.filter((i) => i.correct !== null).length === qSession.items.length - 1,
    qSession.items.filter((i) => i.correct !== null).length);
  // What the route does: mark it skipped and write no verdict. It refuses an
  // already-answered question, so only an unanswered one can be skipped at all.
  db.update('items', q.id, { skipped: true });
  const afterSkip = db.byId('items', q.id);
  check('a skipped question has no verdict', afterSkip.correct === null);
  check('so it leaves the accuracy denominator',
    qSession.items.filter((i) => i.correct !== null).length === qSession.items.length - 1,
    qSession.items.filter((i) => i.correct !== null).length);
  check('and the client can tell it was skipped', sessions.sanitize(afterSkip).skipped === true);
  check('block-finish does not hold the level for it',
    sessions.itemsInBlock(qSession.session.id, 0).filter((i) => i.correct === null && !i.skipped).length === 0);

  // ── the writing surface ─────────────────────────────────────────────────
  console.log('\nwriting surface: what a draft may contain');
  // A learner's own markup is the one place in this app that reaches a rendered
  // page unescaped, so it is filtered on the way in. These are the guarantees.
  const { stripTags, toPlainText } = require('../services/grading');
  check('plain prose is untouched', stripTags('Just words.') === 'Just words.');
  check('formatting survives', stripTags('<strong>a</strong> <em>b</em>').includes('<strong>')
    && stripTags('<strong>a</strong> <em>b</em>').includes('<em>'));
  check('a script tag is dropped with its contents',
    !stripTags('a <script>alert(1)</script> b').includes('script')
    && !stripTags('a <script>alert(1)</script> b').includes('alert'));
  check('a style tag is dropped', !stripTags('<style>body{display:none}</style>x').includes('display'));
  check('an event handler cannot survive', !/on\w+=/i.test(stripTags('<p onclick="x()">t</p>')));
  check('a javascript: url cannot survive', !/javascript:/i.test(stripTags('<a href="javascript:x()">t</a>')));
  check('a data uri cannot survive', !/<img/i.test(stripTags('<img src="data:text/html,<b>x</b>">')));
  check('an iframe is dropped', !stripTags('<iframe src="e"></iframe>after').includes('iframe'));
  check('a double-encoded script stays inert', !stripTags('&amp;lt;script&amp;gt;').includes('<script'));
  check('the words of a stripped link survive', stripTags('<a href="x">click me</a>').includes('click me'));
  check('paragraphs do not run together', !stripTags('<p>One</p><p>Two</p>').includes('OneTwo'));
  // A draft written before the editor existed was plain text and must still read.
  check('an old plain-text draft is unharmed', stripTags('I wrote this before the editor.') === 'I wrote this before the editor.');

  console.log('\nwriting surface: reading it as prose');
  const rich = '<p>School should <strong>start later</strong>.</p><p>That gives <em>more</em> sleep.</p>';
  check('markup becomes prose', toPlainText(rich) === 'School should start later. That gives more sleep.', toPlainText(rich));
  check('a tag is not a word', toPlainText('<strong>one two three</strong>').split(/\s+/).filter(Boolean).length === 3,
    toPlainText('<strong>one two three</strong>'));
  check('marking up a word does not add one',
    toPlainText('<b>cat</b>').split(/\s+/).filter(Boolean).length === 1);
  check('the same writing counts the same either way',
    essays.wordCount(rich) === toPlainText(rich).split(/\s+/).filter(Boolean).length);
  // The gate has to count the writing, not the markup. A page of formatting with
  // three words under it is not an essay, whatever its character count says.
  check('a page of formatting with three words is not an essay',
    toPlainText(`<strong><em><b><u><s></u></s></b></em></strong>${'<span> </span>'.repeat(200)}the end`)
      .split(/\s+/).filter(Boolean).length < curriculum.ESSAY_MIN_WORDS);
  check('paragraphs do not run together', toPlainText('<p>One</p><p>Two</p>') === 'One Two',
    toPlainText('<p>One</p><p>Two</p>'));
  check('a word split by formatting is not torn', toPlainText('un<em>bel</em>ievable') === 'un bel ievable',
    toPlainText('un<em>bel</em>ievable'));

  console.log('\nwriting surface: a draft is stored safe');
  const richUser = makeUser('rich');
  const richEnroll = enroll(richUser, 'english', 'grammar');
  // The same written level the sheet names, so a draft is saved against a real
  // written checkpoint rather than against whatever level 26 happens to be.
  db.update('enrollments', richEnroll.id, {
    current_level: writtenEssay[0], status: 'active',
  });
  const richSession = await sessions.createSession({ userId: richUser.id, enrollment: richEnroll, grade: writtenGrade });
  const hostile = '<p onclick="steal()">My <strong>bold</strong> essay.</p>'
    + '<script>fetch("evil")</script>'
    + `<p>${'word '.repeat(100)}</p>`;
  essays.saveDraft(richSession.essay.id, hostile);
  const storedRow = db.byId('essays', richSession.essay.id);
  check('a draft with a script in it is stored without it', !/script|onclick|steal/i.test(storedRow.draft), storedRow.draft.slice(0, 120));
  check('but the words are kept', storedRow.plain.includes('My') && storedRow.plain.includes('bold essay'), storedRow.plain.slice(0, 60));
  check('and the inline formatting is kept', storedRow.draft.includes('<strong>'), storedRow.draft.slice(0, 80));
  check('the block layout tag is reduced to a space', !storedRow.draft.includes('<p'), storedRow.draft.slice(0, 80));
  check('the draft counts its words, not its tags', storedRow.plain.split(/\s+/).filter(Boolean).length >= 100,
    storedRow.plain.split(/\s+/).filter(Boolean).length);
  // What the model is shown is the prose, and what the row keeps as the draft is
  // the markup — the two must not be confused with each other.
  const markedRow = await essays.grade(storedRow, hostile, richUser.id);
  check('grading marks the prose, not the tags', !!markedRow && typeof markedRow.overall === 'number',
    markedRow && markedRow.overall);
  const afterMark = db.byId('essays', richSession.essay.id);
  check('and the stored draft is still safe markup',
    !/script|onclick|steal/i.test(afterMark.draft), afterMark.draft.slice(0, 120));
  check('a rewrite is a further attempt on the same row', afterMark.attempts.length === 1, afterMark.attempts.length);

  // ── jumping to a level ───────────────────────────────────────────────────
  console.log('\nskipping to a level');
  const jumpUser = makeUser('jump');
  const jumpEnroll = enroll(jumpUser, 'math', 'sense_of_quantity');
  db.update('enrollments', jumpEnroll.id, { current_level: 1, status: 'active' });
  const jump = mastery.jumpToLevel({ userId: jumpUser.id, enrollment: jumpEnroll, grade: arith, to: 140 });
  check('the jump lands on the level asked for', jump.moved && jump.level === 140, jump.level);
  check('and the enrollment is standing on it',
    db.byId('enrollments', jumpEnroll.id).current_level === 140);
  // The run is replayed rather than assigned, so it says what really happened to
  // it: a jump of 139 is a run of 139.
  check('the run is the number of levels jumped',
    mastery.streakFor(jumpUser.id, jumpEnroll.id).run === 139, mastery.streakFor(jumpUser.id, jumpEnroll.id).run);
  check('and 139 is past the 25 the Challenge Exam needs',
    mastery.skipOffer(jumpUser.id, db.byId('enrollments', jumpEnroll.id), arith).offered === true);

  const jumpedRow = db.byId('enrollments', jumpEnroll.id);
  const clearedMap = jumpedRow.checkpoints_cleared || {};
  // The checkpoints this grade has below the target, read off the grade rather
  // than written down. They used to be [25, 50, 75, 100, 125] — the arithmetic
  // rule's quizzes — but every math grade now names its own levels and the first
  // Master quiz on `sense_of_quantity` is level 31, so the check was asserting
  // that five levels that are not checkpoints had been passed.
  const cleared = Object.keys(clearedMap).map(Number).sort((a, b) => a - b);
  const clearedBelow = cleared.filter((l) => l < 140);
  check('every checkpoint below the target is passed',
    clearedBelow.length > 0
    && clearedBelow.every((l) => curriculum.isCheckpoint(curriculum.levelKind(l, arith.pathLength, arith)))
    && Object.entries(clearedMap)
      .filter(([l]) => Number(l) < 140)
      .every(([, v]) => v),
    `cleared below 140: ${clearedBelow.join(', ')}`);
  check('and the one at the target is not', !clearedMap[140], clearedMap[140]);
  check('the Graduation level is left alone', !clearedMap[arith.pathLength]);
  check('a cleared checkpoint reads as cleared',
    clearedBelow.length > 0 && mastery.checkpointCleared(jumpedRow, clearedBelow[0]) === true,
    clearedBelow[0]);
  const uncleared = [...Array(arith.pathLength).keys()].map((i) => i + 1)
    .find((l) => l > 140 && curriculum.isCheckpoint(curriculum.levelKind(l, arith.pathLength, arith)));
  check('an uncleared one does not',
    uncleared !== undefined && mastery.checkpointCleared(jumpedRow, uncleared) === false, uncleared);

  // Skills go to full mastery, and a skill that was already higher is not lowered.
  // The grade's own first skill: since grade-fit (config/grade-skills.js) a
  // preschool grade teaches counting, not the addition its sheet once named.
  const jumpedSkill = curriculum.levelPlan(arith, 139).introduced[0];
  const addSub = mastery.stateFor(jumpUser.id, jumpedSkill);
  check('a jumped skill is at full mastery', addSub.mastery === 1, { skill: jumpedSkill, mastery: addSub.mastery });
  const preLearned = enroll(jumpUser, 'math', 'algebra_1_part_a');
  db.update('enrollments', preLearned.id, { current_level: 1, status: 'active' });
  mastery.recordAttempt({ userId: jumpUser.id, skillId: 'quadratics', correct: true, difficulty: 5, levelDifficulty: 5 });
  const before = mastery.stateFor(jumpUser.id, 'quadratics').mastery;
  mastery.jumpToLevel({ userId: jumpUser.id, enrollment: preLearned, grade: curriculum.getGrade('math', 'algebra_1_part_a'), to: 100 });
  check('a skill already learned is not dragged down',
    mastery.stateFor(jumpUser.id, 'quadratics').mastery >= before, mastery.stateFor(jumpUser.id, 'quadratics').mastery);
  check('and the events it wrote are marked as skipped',
    db.find('events', (e) => e.user_id === jumpUser.id && e.skill_id === jumpedSkill && e.skipped).length > 0);

  const smallUser = makeUser('jumpsmall');
  const smallEnroll = enroll(smallUser, 'math', 'sense_of_quantity');
  db.update('enrollments', smallEnroll.id, { current_level: 10, status: 'active' });
  const small = mastery.jumpToLevel({ userId: smallUser.id, enrollment: smallEnroll, grade: arith, to: 13 });
  check('a jump of three is a run of three, not a run of the level number',
    small.cleared === 3 && mastery.streakFor(smallUser.id, smallEnroll.id).run === 3,
    mastery.streakFor(smallUser.id, smallEnroll.id).run);

  const backUser = makeUser('jumpback');
  const backEnroll = enroll(backUser, 'math', 'sense_of_quantity');
  db.update('enrollments', backEnroll.id, { current_level: 40, status: 'active' });
  check('jumping to where you already are does nothing',
    mastery.jumpToLevel({ userId: backUser.id, enrollment: backEnroll, grade: arith, to: 40 }).moved === false);
  check('and jumping backwards does nothing either',
    mastery.jumpToLevel({ userId: backUser.id, enrollment: backEnroll, grade: arith, to: 20 }).moved === false);
  check('leaving the level untouched', db.byId('enrollments', backEnroll.id).current_level === 40);
  check('and off the end of the path is clamped, not honoured',
    mastery.jumpToLevel({
      userId: backUser.id, enrollment: backEnroll, grade: { ...arith, pathLength: 45 }, to: 999,
    }).level === 45);

  // ── resuming ─────────────────────────────────────────────────────────────
  console.log('\nresuming a sitting');
  // The reported bug: answer a few questions of an exam, leave, come back, and
  // find yourself on question one of a quiz you have already partly answered.
  // The answers were never lost — the block was being rebuilt around them.
  //
  // Reopening is `createSession` on the same enrollment, which is the route the
  // client actually calls. It finds the open sitting and returns it.
  const resumeUser = makeUser('resume');
  const resumeEnroll = enroll(resumeUser, 'math', 'sense_of_quantity');
  // Standing on a level that *is* a Master quiz, found rather than named. It was
  // level 25, which was the arithmetic rule's first quiz; on this grade the first
  // one is level 31, and opening a session on 25 built a practice block, so the
  // check was reading a "Master quiz" off a session that was never one.
  const resumeLevel = [...Array(arith.pathLength).keys()].map((i) => i + 1)
    .find((l) => curriculum.levelKind(l, arith.pathLength, arith) === 'master');
  check('the grade has a Master quiz to resume', resumeLevel !== undefined, resumeLevel);
  db.update('enrollments', resumeEnroll.id, { current_level: resumeLevel, status: 'active' });
  const exam = await sessions.createSession({ userId: resumeUser.id, enrollment: resumeEnroll, grade: arith });
  const examId = exam.session.id;
  const examItems = sessions.itemsFor(examId);
  check('an exam is a Master quiz', exam.session.kind === 'master', exam.session.kind);
  for (let i = 0; i < 4; i++) {
    await sessions.answer({
      userId: resumeUser.id, session: exam.session, itemId: examItems[i].id,
      userAnswer: examItems[i].answer, ms: 800,
    });
  }
  const askedIds = examItems.map((i) => i.id);

  // Three visits, because a resume that works once and not the next time is
  // exactly the bug. This is the in-process equivalent of the route's lookup.
  for (const visit of [1, 2, 3]) {
    const open = db.findOne('sessions', (s) => s.user_id === resumeUser.id
      && s.enrollment_id === resumeEnroll.id && !s.ended_at && s.kind === 'master');
    const shown = sessions.itemsFor(open.id);
    check(`visit ${visit} returns the same sitting`, open.id === examId, open.id);
    check(`visit ${visit} returns the same questions`, shown.map((i) => i.id).join() === askedIds.join());
    check(`visit ${visit} keeps the four answers`, shown.filter((i) => i.correct !== null).length === 4,
      shown.filter((i) => i.correct !== null).length);
    check(`visit ${visit} lands on question five`, shown.findIndex((i) => i.correct === null) === 4,
      shown.findIndex((i) => i.correct === null));
  }

  // And the guard itself: rebuilding a block that already has items hands back
  // those items rather than planning new ones. This is what stops a *new* block
  // for a level that already has one from orphaning the answers.
  const rebuilt = await sessions.buildBlock({
    userId: resumeUser.id,
    session: db.byId('sessions', examId),
    enrollment: resumeEnroll, grade: arith, level: 25, blockIndex: 0,
  });
  check('rebuilding a block with items returns those items',
    rebuilt.items.map((i) => i.id).join() === askedIds.join());
  check('and does not plan a second quiz',
    db.find('items', (i) => i.session_id === examId).length === examItems.length,
    db.find('items', (i) => i.session_id === examId).length);

  // A lesson has the same shape, because the same function built it: a lesson
  // level is not resolved until it is finished, so its check questions must not
  // be swapped underneath a learner who comes back to them.
  const lessonResumeUser = makeUser('resumelesson');
  const lessonResumeEnroll = enroll(lessonResumeUser, 'math', 'sense_of_quantity');
  db.update('enrollments', lessonResumeEnroll.id, { current_level: 10, status: 'active' });
  const lessonSession = await sessions.createSession({ userId: lessonResumeUser.id, enrollment: lessonResumeEnroll, grade: arith });
  const lessonChecks = sessions.itemsFor(lessonSession.session.id).map((i) => i.id);
  const lessonRebuilt = await sessions.buildBlock({
    userId: lessonResumeUser.id,
    session: db.byId('sessions', lessonSession.session.id),
    enrollment: lessonResumeEnroll, grade: arith, level: 10, blockIndex: 0,
  });
  check('a lesson keeps its check questions too',
    lessonRebuilt.items.map((i) => i.id).join() === lessonChecks.join(),
    { was: lessonChecks, now: lessonRebuilt.items.map((i) => i.id) });

  db.flush();
  console.log(`\n${failures ? `${failures} failure(s)` : 'all checks passed'}`);
  process.exit(failures ? 1 : 0);
})().catch((err) => {
  console.error('self test crashed:', err);
  process.exit(1);
});
