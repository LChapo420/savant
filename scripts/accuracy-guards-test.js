/**
 * The content-accuracy guards from the 2026-10-23 fact audit (curriculum-build/
 * CONTENT-FACT-AUDIT.md, curriculum-build/staged/content-fixes/GUARDS.md):
 *
 *   - services/key-agreement.js   does a question's explanation describe its key?
 *   - services/math-claims.js     is the algebra and arithmetic a lesson states true?
 *   - services/ai.js validateLesson, which now drops false common mistakes and
 *     check questions and rejects a lesson whose teaching states a false result
 *   - services/game-payloads.js inspectPayload's repeated-option check
 *
 * The cases are the audit's own confirmed errors (each must be caught) and correct
 * work of the same shape (each must pass). No model is called.
 *
 *   node scripts/accuracy-guards-test.js
 */
process.env.NODE_ENV = 'test';
for (const name of Object.keys(process.env)) {
  if (/(_API_KEY|_TOKEN|_SECRET_API|_WORKSPACE)$/.test(name) || /^(OPENROUTER|ANTHROPIC|GEMINI|MIMO|MODELFLARE|DEEPSEEK|MINIMAX|XKIRO)_.*KEY/.test(name)) process.env[name] = '';
}
process.env.OLLAMA_ENABLED = '0';
let ownCopy = null;
if (!process.env.DB_FILE) {
  ownCopy = require('path').join(require('os').tmpdir(), `accuracy-guards-test-${process.pid}.json`);
  process.env.DB_FILE = ownCopy;
}
require('../config/db');
process.on('exit', () => { if (ownCopy) try { require('fs').unlinkSync(ownCopy); } catch { /* gone */ } });

const { keyAgreement, rekeyFlagged } = require('../services/key-agreement');
const mc = require('../services/math-claims');
const ai = require('../services/ai');
const games = require('../services/game-payloads');

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  if (ok) passed++; else { failed++; console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
}

(async () => {
  // ── explanation-key agreement ──────────────────────────────────────────────
  // Audit Q2 (game 64): the key is "effect"; the explanation describes "affect".
  const q2 = { prompt: "Choose the correct word: 'The new practice schedule will ___ the team's score.'", choices: ['affect', 'effected', 'effect', 'affection'], answerIndex: 2,
    explanation: 'Affect is the verb meaning to influence, which fits after will.' };
  const r2 = keyAgreement(q2);
  check('key-agreement flags a key its explanation does not describe (audit Q2)', r2.flagged && r2.pointsTo === 0, JSON.stringify(r2));
  // Audit Q4 (game 13): key "swims", explanation describes the past perfect "had swum".
  const q4 = { prompt: 'Which verb correctly completes "Before the lifeguard arrived, the twins ___ across the entire lake"?', choices: ['swam', 'had swum', 'swims', 'have swum'], answerIndex: 2,
    explanation: 'The past perfect had swum shows the swimming finished before the lifeguard arrived.' };
  check('key-agreement flags audit Q4 (swims / had swum)', keyAgreement(q4).flagged && keyAgreement(q4).pointsTo === 1);
  // The same questions keyed right are not flagged.
  check('key-agreement passes Q2 keyed right', !keyAgreement({ ...q2, answerIndex: 0 }).flagged);
  check('key-agreement passes Q4 keyed right', !keyAgreement({ ...q4, answerIndex: 1 }).flagged);
  // A bank item whose explanation names the key AND a distractor (the perpendicular slope) is not flagged.
  check('key-agreement: an explanation that names the key is not flagged', !keyAgreement({ prompt: 'A line is parallel to y = -4x + 4. What is its slope?', choices: ['1/4', '-4', '4', '-1/4'], answer: '-4',
    explanation: 'Parallel lines share a slope, so the slope is -4. (The perpendicular slope would be 1/4.)' }).flagged);
  // "x = 15" is not quoted by "x = 15 - 8 = 7".
  check('key-agreement: an option inside a longer sum is not a quote', !keyAgreement({ prompt: 'Solve x + 8 = 15.', choices: ['x = 7', 'x = 15', 'x = 23', 'x = -7'], answer: 'x = 7',
    explanation: 'Subtract 8 from both sides: x = 15 - 8 = 7.' }).flagged);
  check('key-agreement: no explanation, no flag', !keyAgreement({ choices: ['a', 'b'], answerIndex: 0 }).flagged);
  // The blind re-key: kept when the judge picks the key, rejected otherwise, never kept unjudged.
  const set = [q2, { ...q2, answerIndex: 0 }, q4];
  // the judge confirms Q2's key (2) and picks "had swum" (1) for Q4
  const picksKey = await rekeyFlagged(set, { judge: async (batch) => batch.map((q) => (q.choices.includes('had swum') ? 1 : 2)) });
  check('rekey: a flagged question the blind judge keys the same way is kept', picksKey[0].verdict === 'kept' && picksKey[1].verdict === 'clean', JSON.stringify(picksKey.map((x) => x.verdict)));
  check('rekey: a flagged question the blind judge keys differently is rejected', picksKey[2].verdict === 'rejected');
  const noJudge = await rekeyFlagged(set, { judge: async () => { throw new Error('429'); } });
  check('rekey: no judge answer is never a keep', noJudge[0].verdict === 'unjudged' && noJudge[2].verdict === 'unjudged');
  check('rekey: the judge is not shown the key or the explanation', await (async () => {
    let seen = null;
    await rekeyFlagged([q2], { judge: async (batch) => { seen = batch; return [0]; } });
    return seen && seen.length === 1 && !('answerIndex' in seen[0]) && !('explanation' in seen[0]);
  })());

  // ── math claims: the audit's confirmed lesson errors are caught ────────────
  const caught = (text) => mc.operationProblems(text).length > 0;
  const errors = {
    P13: 'Adding 7 to both sides of x + 7 = 12 instead of subtracting 7. That gives x = 19, which fails because 19 + 7 = 26, not 12.',
    P12: 'Dividing by 2 before removing the 4 in 2x + 4 = 14. That turns the 4 into 2 as well and gives x + 4 = 7, so x = 3, but 2 x 3 + 4 = 10, not 14.',
    P9: 'Multiplying both sides by 3 when you see 3x = 15, giving x = 45.',
    P15: 'Adding the 6 to one side only in x + 6 = 15. That gives x = 21 on the left while the right side stays 15, and the check 21 + 6 = 27 fails.',
    P21: 'In x + 7 = 12, subtracting 7 from the right side only. That gives x = 12, because you never balanced the left side. Subtract 7 from both sides to get x = 5.',
    P24: 'In x / 5 = 4, dividing both sides by 5 again. That gives x = 4/5, but (4/5) / 5 is not 4.',
    P34: 'In 5x = 20, subtracting 5 from both sides. That gives 5x = 15, which still has x multiplied by 5, so x is not alone.',
    P35: 'Dividing by 2 before removing the + 5 in 2x + 5 = 17. That move gives x + 5 = 8.5 and then x = 3.5, which fails the check because 2(3.5) + 5 = 12, not 17.',
    P38: 'Reading x - 7 = 5 and subtracting 7 from both sides, getting x = -2.',
  };
  for (const [ref, text] of Object.entries(errors)) check(`math-claims catches audit ${ref}`, caught(text), text);
  // ... and correct statements of the same shape pass
  const fine = {
    'both sides, right': 'Example: if x + 3 = 8, subtracting 3 from both sides gives x = 5, and 5 + 3 = 8 checks out.',
    'one side, right': 'Subtracting 5 from only one side of 3x + 5 = 20. That gives 3x = 20, which is wrong because the two sides are no longer equal.',
    'the carried-across slip, unspecified': 'In x + 7 = 15, adding 7 instead of subtracting gives 22.',
    'two moves at once': 'From 3x - 8 = 10, adding 8 to the left and subtracting 8 from the right gives 3x = 2, instead of the correct 3x = 18.',
    'divide first, right': 'Dividing both sides of 2x + 4 = 14 by 2 first gives x + 2 = 7, so x = 5.',
    'a term-only slip': 'Dividing only the 2x by 2 in 2x + 7 = 17 gives x + 7 = 17.',
    'what the learner writes': 'Wrong: x + 7 = 12, so x = 12 + 7 = 19. Why: the 7 was carried across without changing its sign. Right: subtract 7 from both sides: x + 7 - 7 = 12 - 7, so x = 5.',
    'a description, not a move': 'x is divided by 5, so multiply both sides by 5 to get x = 20 from x / 5 = 4.',
  };
  for (const [name, text] of Object.entries(fine)) check(`math-claims passes: ${name}`, !caught(text), JSON.stringify(mc.operationProblems(text)));
  // arithmetic stated as true
  check('arithmetic: a false check is caught', mc.arithmeticProblems('Check: 3(5) + 5 = 21.').length === 1);
  check('arithmetic: a true check passes', mc.arithmeticProblems('Check: 3(5) + 5 = 15 + 5 = 20. It works.').length === 0);
  check('arithmetic: a sentence that marks it wrong is not a claim', mc.arithmeticProblems('That fails because 19 + 7 = 26, not 12.').length === 0);
  check('arithmetic: "3 times 7 = 21" is read whole', mc.arithmeticProblems('Checking it gives 3 times 7 = 21, which is true.').length === 0);
  check('arithmetic: mod, roots, percents and whole groups are not misread', mc.arithmeticProblems('9 mod 4 = 1. √16 = 4. 20 ÷ 20 × 100 = 100%. 78 ÷ 7 = 11 full teams with 1 left over.').length === 0);
  // worked work
  check('worked: a correct chain passes', mc.workProblems('Solve 3x + 5 = 20.', ['3x + 5 - 5 = 20 - 5, which gives 3x = 15.', '3x / 3 = 15 / 3, which gives x = 5.', 'Check: 3(5) + 5 = 15 + 5 = 20.'], 'x = 5').length === 0);
  check('worked: a wrong step is caught', mc.workProblems('Solve 3x + 5 = 20.', ['3x + 5 - 5 = 20 - 5, which gives 3x = 15.', 'So x = 6.'], 'x = 6').length >= 1);
  check('worked: guess-and-check trials pass', mc.workProblems('Find the value of x that solves x + 5 = 9.', ['Try x = 3. Then 3 + 5 = 8, and 8 does not equal 9.', 'Try x = 4. Then 4 + 5 = 9.'], 'x = 4').length === 0);
  check('worked: substitution problems are not solved for x', mc.workProblems('Find the value of 2x + 5 when x = 6.', ['2(6) + 5 = 12 + 5 = 17.'], '17').length === 0);
  // check questions
  check('question: audit Q57 (x = 3 IS the solution of 2x + 4 = 10) is caught', mc.questionProblems({ prompt: 'A student solves 2x + 4 = 10 and writes x = 3. What went wrong?',
    choices: ['They divided 10 by 2 before undoing the +4', 'They subtracted 4 from the left side but not the right', 'They added 4 to both sides instead of subtracting', 'Nothing went wrong, x = 3 is correct'],
    answer: 'They subtracted 4 from the left side but not the right' }).length === 1);
  check('question: the same question keyed "nothing went wrong" passes', mc.questionProblems({ prompt: 'A student solves 2x + 4 = 10 and writes x = 3. What went wrong?',
    choices: ['They divided first', 'They subtracted 4 from one side', 'They added 4', 'Nothing went wrong, x = 3 is correct'], answer: 'Nothing went wrong, x = 3 is correct' }).length === 0);
  check('question: a wrong "Solve" key is caught', mc.questionProblems({ prompt: 'Solve x + 7 = 12. What is x?', choices: ['5', '19', '-5', '7'], answer: '19' }).length === 1);
  check('question: a right "Solve" key passes', mc.questionProblems({ prompt: 'Solve x + 7 = 12. What is x?', choices: ['5', '19', '-5', '7'], answer: '5' }).length === 0);
  check('question: "If y = 7 in 3x + 4y = 55, what is x?" is not misread', mc.questionProblems({ prompt: 'If y = 7 in 3x + 4y = 55, what is x?', answer: '9' }).length === 0);
  // labelled wrong work (the staged prompt's format)
  check('labels: a labelled mistake passes', mc.labelProblems(['Wrong: x = 12 + 7 = 19. Why: the sign. Right: x = 12 - 7 = 5.']).length === 0);
  check('labels: an unlabelled mistake is reported', mc.labelProblems(['Adding 7 to both sides gives x = 19.']).length === 1);
  check('labels: the report names the right bullet', (mc.labelProblems(['Wrong: a. Right: b.', 'Adding 7 to both sides gives x = 19.'])[0] || {}).index === 1);
  check('labels: with labels required, a false unlabelled bullet is reported at its own index', mc.lessonProblems({ common_mistakes: ['Wrong: x = 12 + 7 = 19. Why: sign. Right: x = 12 - 7 = 5.', 'Adding 7 to both sides of x + 7 = 12. That gives x = 19.'] }, { requireLabels: true }).every((p) => p.index === 1));

  // ── the live gate in validateLesson ────────────────────────────────────────
  const base = {
    title: 'Solving two-step equations',
    intro: 'A two-step equation needs two inverse moves, undone in reverse order.',
    sections: [{ heading: 'Undo the addition first', body: 'If x + 3 = 8, subtracting 3 from both sides gives x = 5, and 5 + 3 = 8 checks out.', example: 'x + 3 = 8\nx + 3 - 3 = 8 - 3\nx = 5' }],
    worked_example: { problem: 'Solve 3x + 5 = 20.', steps: ['Subtract 5 from both sides: 3x + 5 - 5 = 20 - 5, which gives 3x = 15.', 'Divide both sides by 3: 3x / 3 = 15 / 3, which gives x = 5.', 'Check: 3(5) + 5 = 15 + 5 = 20.'], answer: 'x = 5' },
    // labelled, as the staged prompt (guards/01) asks, so this case holds with or without that patch
    common_mistakes: ['Wrong: 3x + 5 = 20, so 3x = 20. Why: the 5 was taken from only one side, so the sides are no longer equal. Right: subtract 5 from both sides: 3x + 5 - 5 = 20 - 5, so 3x = 15.'],
    summary: 'Undo the addition or subtraction first, then the multiplication, doing each move to both sides.',
    check_questions: [
      { prompt: 'Solve x + 7 = 12. What is x?', choices: ['5', '19', '-5', '7'], answer: '5', rationale: 'Subtract 7 from both sides: x = 12 - 7 = 5.' },
      { prompt: 'Solve 4x = 28. Type the value of x.', choices: [], answer: '7', rationale: 'Divide both sides by 4: x = 28 / 4 = 7.' },
      { prompt: 'A student solves 2x + 4 = 10 and writes x = 3. What went wrong?', choices: ['They divided first', 'They subtracted 4 from one side', 'They added 4', 'Nothing went wrong, x = 3 is correct'], answer: 'Nothing went wrong, x = 3 is correct', rationale: 'Substituting 3 gives 2(3) + 4 = 10, which is true.' },
    ],
  };
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const quiet = console.warn; console.warn = () => {};
  const clean = ai.validateLesson(clone(base), 'linear_eq', 2);
  check('validateLesson keeps a correct lesson whole', clean && clean.common_mistakes.length === 1 && clean.check_questions.length === 3);
  const badMistake = clone(base); badMistake.common_mistakes.push('Adding 7 to both sides of x + 7 = 12 instead of subtracting 7. That gives x = 19.');
  const r1 = ai.validateLesson(badMistake, 'linear_eq', 2);
  check('validateLesson drops a false common mistake and keeps the rest', r1 && r1.common_mistakes.length === 1 && !/x = 19/.test(r1.common_mistakes.join(' ')));
  const badCheck = clone(base); badCheck.check_questions[2].answer = 'They subtracted 4 from one side';
  const r2b = ai.validateLesson(badCheck, 'linear_eq', 2);
  check('validateLesson drops a mis-keyed check question (audit Q57)', r2b && r2b.check_questions.length === 2);
  const badWorked = clone(base); badWorked.worked_example.steps[1] = 'Divide both sides by 3, which gives x = 6.'; badWorked.worked_example.answer = 'x = 6';
  check('validateLesson rejects a lesson whose worked example is wrong', ai.validateLesson(badWorked, 'linear_eq', 2) === null);
  const badSection = clone(base); badSection.sections[0].body = 'If x + 3 = 8, subtracting 3 from both sides gives x = 11.';
  check('validateLesson rejects a lesson whose teaching states a false result', ai.validateLesson(badSection, 'linear_eq', 2) === null);
  const english = { ...clone(base), sections: [{ heading: 'Fragments', body: 'A fragment lacks a subject or a finite verb, so it cannot stand alone as a sentence.', example: 'Running through the park.' }], worked_example: null, common_mistakes: ['Treating "Running late." as a sentence.'] };
  check('validateLesson leaves prose with no math alone', ai.validateLesson(english, 'fragments', 2) !== null);
  console.warn = quiet;

  // ── the game checker's repeated-option check (live since 2026-10-23) ──────
  const schema = { questionCount: 1, choicesPerQuestion: 4 };
  const dup = games.inspectPayload({ questions: [{ prompt: 'Pick one', choices: ['affect', 'affect', 'effect', 'effect'], answerIndex: 2, explanation: 'x', difficulty: 5 }] }, schema);
  check('inspectPayload rejects repeated options (audit Q1-type)', dup.some((p) => /two choices are the same/.test(p)), JSON.stringify(dup));

  console.log(`accuracy-guards-test: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((err) => { console.error(err.stack || err.message); process.exit(1); });
