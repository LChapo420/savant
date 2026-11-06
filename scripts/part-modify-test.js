/**
 * Offline test of the part modifier (services/part-modify.js): the rules follow the spec, a rewrite is held to the facts, the stored text is
 * served when no rewrite is ready, PART_MODIFY=off restores it, a stale course is told by its signature. A stub stands in for the model.
 *
 *   node scripts/part-modify-test.js      (also run by `npm test`)
 */
process.env.NODE_ENV = 'test';
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DB_FILE = path.join(os.tmpdir(), `part-modify-test-${process.pid}.json`);
fs.writeFileSync(process.env.DB_FILE, JSON.stringify({}));
for (const name of Object.keys(process.env)) if (/(_API_KEY|_TOKEN)$/.test(name)) process.env[name] = '';
process.env.PART_MODIFY = 'on';

const ls = require('../services/learning-spec');
const pm = require('../services/part-modify');
const specSig = require('../services/spec-sig');

let failures = 0;
const check = (label, cond, detail) => {
  if (cond) console.log(`  ok   ${label}`);
  else { failures += 1; console.log(`  FAIL ${label}${detail !== undefined ? ` ${JSON.stringify(detail).slice(0, 300)}` : ''}`); }
};
const mk = (set, extra = {}) => ls.buildSpecFrom({ metrics: Object.fromEntries(Object.entries(set).map(([m, v]) => [m, { measured: v, confidence: 90 }])), age: 14, interests: ['basketball'], dislikes: ['spiders'], topic: 'volume', ...extra });
const BRIEF = mk({ feedback_granularity: 8, brevity_preference: 92, evaluation_anxiety: 90, vocabulary_ceiling: 8 });
const FULL = mk({ feedback_granularity: 92, brevity_preference: 8, evaluation_anxiety: 8, vocabulary_ceiling: 92, praise_sensitivity: 5 });
const SRC = { prompt: 'A prism is 3 long, 2 wide and 4 high. What is its volume?', choices: ['9', '20', '24'], answer: '24', text: 'Multiply the three sides: 3 x 2 x 4 = 24.' };

console.log('rules');
const rb = pm.rulesFor(BRIEF, 'feedback').join(' | ');
const rf = pm.rulesFor(FULL, 'feedback').join(' | ');
check('a brief-feedback learner is told one or two sentences', /one or two sentences/.test(rb), rb);
check('a detailed-feedback learner is told step by step', /step by step/.test(rf), rf);
check('an anxious learner is told low stakes', /Low stakes/.test(rb));
check('plain language for a low vocabulary ceiling', /plain everyday words/.test(rb));
check('the two learners get different rules', rb !== rf);
check('dislikes are named as never to use', /spiders/.test(rb));
check('a hint rule never allows the answer', /never the answer/.test(pm.rulesFor(BRIEF, 'hint').join(' ')));
check('a default spec has no rules (the text stays as stored)', pm.rulesFor(ls.defaultSpec(), 'feedback').length === 0);
check('the retention goal reaches a review rule', /test on 2026-12-01/.test(pm.rulesFor(FULL, 'review', { goal: { status: 'date', test_date: '2026-12-01', days_left: 25 } }).join(' ')));
check('forever says nothing', pm.goalClause({ status: 'forever' }) === null);

console.log('the facts gate');
check('a number not in the original is refused', pm.check(BRIEF, 'feedback', SRC, 'Multiply: 3 x 2 x 4 = 25.').length > 0);
check('a kept-number rewrite passes', pm.check(FULL, 'feedback', SRC, 'Take the three sides, 3 and 2 and 4, and multiply them: 3 x 2 x 4 = 24. So the volume is 24.').length === 0);
check('feedback that judges their answer is refused (it is shown after right and wrong answers)', pm.check(FULL, 'feedback', SRC, 'Your answer is correct: 3 x 2 x 4 = 24.').length > 0);
check('a hint that states the answer is refused', pm.check(FULL, 'hint', SRC, 'It is 24.').length > 0);
check('talking about the profile is refused', pm.check(FULL, 'feedback', SRC, 'Because of your learning style: 3 x 2 x 4 = 24.').length > 0);
check('a disliked domain is refused', pm.check(BRIEF, 'feedback', SRC, 'Like a spiders web, 3 x 2 x 4 = 24.').length > 0);
check('a brief learner is refused a long rewrite', pm.check(BRIEF, 'feedback', SRC, `${Array(60).fill('word').join(' ')} 3 2 4 24`).length > 0);

(async () => {
  console.log('modify');
  let calls = 0;
  const good = async () => { calls += 1; return { text: 'Multiply 3 x 2 x 4 = 24.' }; };
  const r1 = await pm.modify({ spec: BRIEF, part: 'feedback', source: SRC, llm: good });
  check('a good rewrite is served', r1.source === 'ai' && calls === 1, r1);
  let n = 0;
  const bad2good = async () => { n += 1; return { text: n === 1 ? '3 x 2 x 4 = 99' : 'Multiply 3 x 2 x 4 = 24.' }; };
  const r2 = await pm.modify({ spec: BRIEF, part: 'feedback', source: SRC, llm: bad2good });
  check('one revision fixes a draft', r2.source === 'ai' && n === 2, r2);
  const r3 = await pm.modify({ spec: BRIEF, part: 'feedback', source: SRC, llm: async () => ({ text: '3 x 2 x 4 = 99' }) });
  check('a draft that still fails is not served: the stored text is', r3.source === 'stored' && r3.text === SRC.text, r3);
  const r4 = await pm.modify({ spec: BRIEF, part: 'feedback', source: SRC, llm: async () => { throw new Error('down'); } });
  check('a model that is down leaves the stored text', r4.source === 'stored');
  const r5 = await pm.modify({ spec: ls.defaultSpec(), part: 'feedback', source: SRC, llm: good });
  check('a learner we know nothing about is never rewritten', r5.source === 'stored');

  console.log('serving');
  const item = { id: 1, rationale: 'stored', hint: 'stored hint', shaped: { rationale: 'for them', hint: 'their hint' } };
  check('the rewrite is served when ready', pm.rationaleOf(item) === 'for them' && pm.hintOf(item) === 'their hint');
  check('the stored text is served when no rewrite is ready', pm.rationaleOf({ rationale: 'stored' }) === 'stored');
  process.env.PART_MODIFY = 'off';
  check('PART_MODIFY=off serves the stored text', pm.rationaleOf(item) === 'stored' && pm.hintOf(item) === 'stored hint');
  process.env.PART_MODIFY = 'on';

  console.log('a stored course whose profile moved');
  const course = { status: 'ready', lesson_sig: specSig.specSig(BRIEF) };
  check('a course written for the same profile is not stale', !pm.courseStale(course, BRIEF));
  check('a course written for a very different profile is stale', pm.courseStale(course, FULL));
  check('not twice in a day', !pm.courseStale({ ...course, lessons_refreshed_at: new Date().toISOString() }, FULL));
  check('a course without a signature is left alone', !pm.courseStale({ status: 'ready' }, FULL));
  const skill = { title: 'Prisms', lesson: { paragraphs: ['A prism has 3 sides to multiply, 3 x 2 x 4 = 24.'], key_points: ['Multiply the sides.'] } };
  const para = await pm.rewriteLesson({ spec: FULL, skill, llm: async () => ({ paragraphs: ['Multiply the sides: 3 x 2 x 4 = 24. Each side is one number in the product.'] }) });
  check('a lesson rewrite that keeps the numbers is accepted', Array.isArray(para) && para.length === 1, para);
  const bad = await pm.rewriteLesson({ spec: FULL, skill, llm: async () => ({ paragraphs: ['Multiply the sides: 3 x 2 x 5 = 30.'] }) });
  check('a lesson rewrite that changes a number is refused', bad === null);

  try { fs.unlinkSync(process.env.DB_FILE); } catch { /* temp */ }
  console.log(failures ? `\n${failures} FAILED` : '\nall part-modify checks passed');
  process.exit(failures ? 1 : 0);
})();
