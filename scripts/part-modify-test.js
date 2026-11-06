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
// Windows reuses process ids: an old run's file under this name would add its rows to this run's.
try { fs.unlinkSync(process.env.DB_FILE); } catch { /* none there */ }
fs.writeFileSync(process.env.DB_FILE, JSON.stringify({}));
for (const name of Object.keys(process.env)) if (/(_API_KEY|_TOKEN)$/.test(name)) process.env[name] = '';
process.env.PART_MODIFY = 'on';
process.env.PART_MODIFY_PARTS = 'feedback,hint,review,lesson';

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
// Wording changed on purpose (modify-all): length now follows what the original has to say, so a writer is no longer told to fill three to six lines.
check('a brief-feedback learner is told as short as the idea allows', /as short as the idea allows/.test(rb), rb);
check('a detailed-feedback learner is told one step per line, only the steps it has', /one step per line/.test(rf) && /Never pad/.test(rf), rf);
check('no rule asks for a clause about a wrong choice', !/why it fails/.test(rb + rf));
const hintFor = (n) => pm.rulesFor(mk({ hint_dependence: n, productive_struggle: 100 - n, help_seeking: n, scaffolding_need: n }), 'hint').join(' ');
check('hint size now follows the spec (it was always small)', ls.buildSpecFrom({ metrics: {} }).scaffolding.hintSize === 'partial' && /Hint size: (small|medium|large)/.test(hintFor(50)));
check('the review line follows the goal without a model', /your test on 2026-12-01/.test(pm.reviewLine(FULL, { status: 'date', test_date: '2026-12-01' })) && /next week/.test(pm.reviewLine(FULL, null)));
check('a learner we know nothing about keeps the fixed line', pm.reviewLineFor(null, {}) === pm.REVIEW_DEFAULT);
check('an unreadable gate reply is not a pass', pm.readFactGate('sorry') === null && pm.readHintGate('{}') === null);
check('a word the original already uses is not the rewrite bringing in a dislike', !pm.avoidedIn({ interests: { avoidDomains: ['food examples'] } }, { text: 'Plants make food.' }, 'Plants make their food, for example sugar.').length);
check('a new word from the dislike is', pm.avoidedIn({ interests: { avoidDomains: ['food examples'] } }, { text: 'Plants grow.' }, 'Plants grow, like food in a pot.').length === 1);
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
  const good = async () => { calls += 1; return { text: 'Multiply the three sides: 3 x 2 x 4 = 24.' }; };
  const r1 = await pm.modify({ spec: BRIEF, part: 'feedback', source: SRC, llm: good });
  check('a good rewrite is served', r1.source === 'ai' && calls === 1, r1);
  let n = 0;
  const bad2good = async () => { n += 1; return { text: n === 1 ? '3 x 2 x 4 = 99' : 'Multiply the three sides: 3 x 2 x 4 = 24.' }; };
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
  delete process.env.PART_MODIFY_PARTS;
  check('by default only feedback and review run (hint, lesson and voice did not pass)', pm.partOn('feedback') && pm.partOn('review') && !pm.partOn('lesson') && !pm.partOn('voice') && !pm.partOn('hint') && pm.hintOf(item) === 'stored hint');
  process.env.PART_MODIFY_PARTS = 'feedback,hint,review,lesson';
  process.env.PART_MODIFY = 'off';
  check('PART_MODIFY=off serves the stored text', pm.rationaleOf(item) === 'stored' && pm.hintOf(item) === 'stored hint');
  process.env.PART_MODIFY = 'on';

  console.log('prepareItem on a stored item row');
  const db = require('../config/db');
  const row = db.insert('items', { user_id: 5, session_id: 1, skill_id: 'add_sub', skill_name: 'Volume', level: 3, prompt: SRC.prompt, choices: SRC.choices, answer: SRC.answer, rationale: SRC.text, hint: 'Think about the three sides.', track_id: 'math', grade_id: 'g' });
  const shaped = await pm.prepareItem(5, row, { spec: BRIEF, llm: async ({ user }) => ({ text: /Think about/.test(user) ? 'Look at the three sides.' : 'Multiply the three sides: 3 x 2 x 4 = 24.' }) });
  check('the rewrite is written on the learner own item row', shaped && shaped.rationale === 'Multiply the three sides: 3 x 2 x 4 = 24.' && db.byId('items', row.id).shaped.hash, shaped);
  check('the hint is rewritten too', db.byId('items', row.id).shaped.hint === 'Look at the three sides.');
  check('served from the row afterwards', pm.rationaleOf(db.byId('items', row.id)) === 'Multiply the three sides: 3 x 2 x 4 = 24.');
  const again = await pm.prepareItem(5, db.byId('items', row.id), { spec: BRIEF, llm: async () => { throw new Error('must not be called'); } });
  check('the same profile is not rewritten again', again && again.hash === db.byId('items', row.id).shaped.hash);
  check('a default spec writes nothing', (await pm.prepareItem(5, db.insert('items', { user_id: 5, session_id: 1, prompt: 'p', answer: 'a', rationale: 'r' }), { spec: ls.defaultSpec(), llm: good })) === null);

  console.log('lists the numbers cannot carry');
  const base = (i, d) => specSig.specSig(mk({ brevity_preference: 70 }, { interests: i, dislikes: d }));
  check('the same interests and dislikes do not move a level', !specSig.driftedEnough(base(['chess'], []), base(['chess'], [])));
  check('a new dislike moves a level on its own', specSig.driftedEnough(base(['chess'], []), base(['chess'], ['spiders'])));
  check('swapping an interest moves a level', specSig.driftedEnough(base(['chess'], []), base(['jazz'], [])));
  const oldSig = base(['chess'], []); for (const k of Object.keys(oldSig)) if (k.startsWith('sets.')) delete oldSig[k];
  check('a signature from before the sets is not compared on them', !specSig.driftedEnough(oldSig, base(['jazz'], ['spiders'])));

  console.log('a stored course whose profile moved');
  const course = { status: 'ready', lesson_sig: specSig.specSig(BRIEF) };
  check('a course written for the same profile is not stale', !pm.courseStale(course, BRIEF));
  check('a course written for a very different profile is stale', pm.courseStale(course, FULL));
  check('not twice in a day', !pm.courseStale({ ...course, lessons_refreshed_at: new Date().toISOString() }, FULL));
  check('a course without a signature is left alone', !pm.courseStale({ status: 'ready' }, FULL));
  const skill = { title: 'Prisms', lesson: { paragraphs: ['A prism has 3 sides to multiply, 3 x 2 x 4 = 24.'], key_points: ['Multiply the sides.'] } };
  // The writer now answers sentence by sentence (see LESSON_SYSTEM): a sentence that loses a number goes back to the stored sentence, and nothing changed means nothing is served.
  const para = await pm.rewriteLesson({ spec: FULL, skill, llm: async () => ({ sentences: [['Multiply the sides of the prism: it has 3 sides to multiply, 3 x 2 x 4 = 24.']] }) });
  check('a lesson rewrite that keeps the numbers is accepted', Array.isArray(para) && /Multiply the sides of the prism/.test(para.join(' ')), para);
  const bad = await pm.rewriteLesson({ spec: FULL, skill, llm: async () => ({ sentences: [['Multiply the sides: 3 x 2 x 5 = 30.']] }) });
  check('a lesson rewrite that changes every number is refused', bad === null, bad);
  const two = { title: 'Prisms', lesson: { paragraphs: ['A prism has 3 sides to multiply, 3 x 2 x 4 = 24. Volume is measured in cubes.'], key_points: [] } };
  const mixed = await pm.rewriteLesson({ spec: FULL, skill: two, llm: async () => ({ sentences: [['It is 3 x 2 x 5 = 30.'], ['We measure volume in cubes.']] }) });
  check('a sentence that loses a number goes back to the stored one', Array.isArray(mixed) && /3 x 2 x 4 = 24/.test(mixed.join(' ')) && /We measure volume/.test(mixed.join(' ')) && !/30/.test(mixed.join(' ')), mixed);
  const gated = await pm.rewriteLessonDetail({ spec: FULL, skill: two, llm: async () => ({ sentences: [['A prism has 3 sides to multiply, 3 x 2 x 4 = 24.'], ['We measure volume in cubes.']], comparison: 'It is like stacking crates.' }), gate: async (part, source, text) => (/crates/.test(text) ? { ok: false, problems: ['new: crates'] } : { ok: true, problems: [] }) });
  check('the comparison is dropped first when the gate objects', gated.paragraphs && !/crates/.test(gated.paragraphs.join(' ')), gated);
  const never = await pm.rewriteLessonDetail({ spec: FULL, skill: two, llm: async () => ({ sentences: [['A prism has 3 sides to multiply, 3 x 2 x 4 = 24.'], ['We measure volume in cubes.']] }), gate: async () => ({ ok: false, problems: ['new: x'] }) });
  check('a lesson the gate never passes is refused', never.paragraphs === null);

  try { fs.unlinkSync(process.env.DB_FILE); } catch { /* temp */ }
  console.log(failures ? `\n${failures} FAILED` : '\nall part-modify checks passed');
  process.exit(failures ? 1 : 0);
})();
