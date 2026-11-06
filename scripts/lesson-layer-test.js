/**
 * Offline test of the personal layer (services/lesson-layer.js): the deterministic gate refuses a new number, an answer given away, a profile
 * leak, an unmarked comparison and a missing interest; a good layer is stored and served; two bad drafts store nothing; the switch is off by
 * default. A stub stands in for the model.
 *
 *   node scripts/lesson-layer-test.js      (also run by `npm test`)
 */
process.env.NODE_ENV = 'test';
const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.DB_FILE = path.join(os.tmpdir(), `lesson-layer-test-${process.pid}.json`);
fs.writeFileSync(process.env.DB_FILE, JSON.stringify({}));
for (const name of Object.keys(process.env)) if (/(_API_KEY|_TOKEN)$/.test(name)) process.env[name] = '';

const ls = require('../services/learning-spec');
const layer = require('../services/lesson-layer');
const db = require('../config/db');

let failures = 0;
const check = (label, cond, detail) => {
  if (cond) console.log(`  ok   ${label}`);
  else { failures += 1; console.log(`  FAIL ${label}${detail !== undefined ? ` ${JSON.stringify(detail).slice(0, 300)}` : ''}`); }
};
const SPEC = ls.buildSpecFrom({ metrics: {}, interests: ['basketball', 'chess'], age: 15 });
const PLAN = {
  id: 9001, track_id: 'math', grade_id: 'algebra_1_part_a', level: 10,
  blocks: [{ block: 'Text', index: 0, data: { heading: 'Solving one-step equations', body: 'To solve x + 7 = 12, subtract 7 from both sides. Then x = 5. An equation is a balance.' } }],
  checks: [{ id: 'c1', prompt: 'Solve x + 3 = 10.', choices: ['5', '7', '13'], answer: '7', after: 0 }],
};
const SRC = layer.sourceOf(PLAN, 'One-step equations');
const GOOD = { why: 'Equations are how you work out an unknown, the way a coach works out what a team still needs.', hook: 'Imagine a basketball game where the score is hidden: how would you find it?', analogies: [{ point: 'an equation is a balance', text: 'Think of a chess exchange: both sides must stay even, just like both sides of an equation.' }] };

(async () => {
  console.log('layer: the gate');
  check('off by default', !layer.on());
  check('a good layer passes', layer.check(SPEC, GOOD, SRC).length === 0, layer.check(SPEC, GOOD, SRC));
  check('a new number is refused', layer.check(SPEC, { ...GOOD, hook: 'Imagine a basketball team scoring 82 points: how would you find 30 of them?' }, SRC).some((p) => /number 82/.test(p)));
  check('a number word is a number', layer.check(SPEC, { ...GOOD, why: 'Like a basketball team of nine, you balance things out.' }, SRC).some((p) => /number 9/.test(p)));
  check('a number the lesson gives is allowed', layer.check(SPEC, { ...GOOD, why: 'Like a basketball player, you take away 7 from one side and balance the other.' }, SRC).every((p) => !/number/.test(p)));
  check('an answer to a check is refused', layer.check(SPEC, { ...GOOD, analogies: [{ point: 'an equation is a balance', text: 'Think of chess: x + 3 = 10 gives 7.' }] }, SRC).some((p) => /answer/.test(p)));
  check('a statement that is not a comparison is refused', layer.check(SPEC, { ...GOOD, analogies: [{ point: 'an equation is a balance', text: 'Chess is the oldest strategy game that exists.' }] }, SRC).some((p) => /comparison/.test(p)));
  check('profile talk is refused', layer.check(SPEC, { ...GOOD, why: 'As a visual learner, according to your scorecard, you will like this like chess.' }, SRC).some((p) => /profile/.test(p)));
  check('an interest is a prompt rule and a judged fit, not a fact gate: a layer without one still passes the gate', layer.check(SPEC, { why: 'It is useful for you.', hook: 'Imagine a mystery number: how would you find it?', analogies: [] }, SRC).length === 0);
  check('too many words is refused', layer.check(SPEC, { ...GOOD, why: Array(60).fill('word').join(' ') }, SRC).some((p) => /words/.test(p)));
  check('a claim about the subject in the why is refused ("the most", "stronger players")', layer.check(SPEC, { ...GOOD, why: 'Equations are the thing you will use most, and stronger players check them first.' }, SRC).some((p) => /claim about the subject/.test(p)));
  check('a why that does not speak to the reader is refused', layer.check(SPEC, { ...GOOD, why: 'Equations help people work out an unknown, like a coach does.' }, SRC).some((p) => /speak to the reader/.test(p)));
  check('empty is refused', layer.check(SPEC, {}, SRC)[0] === 'empty');

  console.log('layer: write, store, serve');
  process.env.INSTANT_LAYER = 'on';
  check('the switch turns it on', layer.on());
  const user = { id: 4242 };
  const ok = await layer.start({ user, plan: PLAN, topic: 'One-step equations', spec: SPEC, llm: async () => ({ data: GOOD, model: 'stub' }) });
  check('a good draft is stored', ok && ok.status === 'ready');
  const got = layer.get(4242, PLAN.id);
  check('and served', got.state === 'ready' && got.layer.hook === GOOD.hook, got);
  check('another learner has none', layer.get(4343, PLAN.id).state === 'none');
  let calls = 0;
  const bad = await layer.start({ user: { id: 5151 }, plan: PLAN, topic: 'One-step equations', spec: SPEC, llm: async () => { calls += 1; return { data: { ...GOOD, hook: 'Imagine a basketball team scoring 82 points: how many is that?' }, model: 'stub' }; } });
  check('two bad drafts store no layer', bad === null && layer.get(5151, PLAN.id).state === 'none' && calls === 2, { calls });
  check('and the failure is kept for the record', db.findOne('lesson_layers', (r) => r.user_id === 5151).status === 'failed');
  let n = 0;
  const revised = await layer.start({ user: { id: 6161 }, plan: PLAN, topic: 'One-step equations', spec: SPEC, llm: async () => { n += 1; return { data: n === 1 ? { ...GOOD, why: 'Like a basketball season of 82 games, it adds up.' } : GOOD, model: 'stub' }; } });
  check('a bad draft is revised once and then served', revised && revised.status === 'ready' && revised.revised === true && n === 2);
  const none = await layer.start({ user: { id: 7171 }, plan: PLAN, topic: 'x', spec: { ...SPEC, isDefault: true }, llm: async () => ({ data: GOOD }) });
  check('a learner with no profile gets no layer', none === null);

  try { fs.unlinkSync(process.env.DB_FILE); } catch { /* temp */ }
  console.log(failures ? `\n${failures} FAILED` : '\nall lesson-layer checks passed');
  process.exit(failures ? 1 : 0);
})();
