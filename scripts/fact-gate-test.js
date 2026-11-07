#!/usr/bin/env node
/** The no-model first pass and the gate's plumbing, offline (no key, no network). Part of npm test. */
const assert = require('assert');
const code = require('../services/fact-code-checks');
const gate = require('../services/fact-gate');

const lv = (over) => ({ trackId: 'math', blocks: [], checks: [], ...over });
const block = (data, index = 0, name = 'Basic_TextBlock') => ({ index, block: name, data });
const check = (o, index = 0) => ({ index, format: 'multiple_choice', ...o });
const rules = (level) => code.checkLevel(level).filter((f) => f.certain).map((f) => f.rule);

// Silent on what is right.
for (const body of [
  '(41 - 5) / 6 = 36 / 6 = 6 m/s.',
  'The area is 1/2 x 4 s x 8 m/s = 16 m.',
  '1 inch = 2.54 cm, so that is that.',
  '(3/4)(-3/4) = -9/16, not -1.',
  '8^(2/3) = 2^2 = 4.',
  '2 times 2 times 2 = 8.',
  'sqrt(2) times sqrt(3) = sqrt(6).',
  'x = 5 or x = -5, because both are 5 units from zero.',
  'Solve 3x + 5 = 20: 3x = 15, so x = 5.',
  '-3x > 6 becomes x < -2.',
  '3|x - 2| + 1 <= 13 becomes 3|x - 2| <= 12, then |x - 2| <= 4.',
  'x = 8 gives 3|8 - 2| + 1 = 19 <= 13, false.',
  '25% of 80 = 20. 0.8 / 5 = 16%.',
  'A student might write 2 + 2 = 5, which is wrong.',
]) assert.deepStrictEqual(rules(lv({ blocks: [block({ text: body })] })), [], body);

// Loud on what is wrong.
const expect = [
  ['15 / 3 = 4 and that is the rate.', 'arithmetic'],
  ['Average speed = 16/2 = 9 m/s.', 'arithmetic'],
  ['1 inch = 3.54 cm.', 'arithmetic'],
  ['8x = 24, so x = 4.', 'solve_step'],
  ['-3x > 6 becomes x > -2.', 'solve_step'],
  ['Dividing 250 by 0.80 gives 300.', 'arithmetic'],
  ['The terms are 4y^3, -2y, and 9. There are two terms.', 'count'],
];
for (const [body, rule] of expect) assert.ok(rules(lv({ blocks: [block({ text: body })] })).includes(rule), `${body} -> ${rule}`);

// Text meant to be wrong is not read.
assert.deepStrictEqual(rules(lv({ blocks: [block({ wrongExample: '2 + 2 = 5', rightExample: '2 + 2 = 4' })] })), []);
assert.deepStrictEqual(rules(lv({ blocks: [block({ lines: [{ isError: true, text: '2 + 2 = 5', explanation: 'It is 2 + 2 = 4.' }] })] })), []);

// Functions in the part.
assert.ok(rules(lv({ blocks: [block({ text: 'For f(x) = x^2 + 1, f(3) = 3^2 + 1 = 9.' })] })).includes('arithmetic'));
assert.deepStrictEqual(rules(lv({ blocks: [block({ text: 'For f(x) = x^2 + 1, f(3) = 3^2 + 1 = 10.' })] })), []);

// Keys.
assert.ok(rules(lv({ checks: [check({ prompt: 'Pick', choices: ['a', 'b'], answer: 'c' })] })).includes('key_not_a_choice'));
assert.ok(rules(lv({ checks: [check({ prompt: 'Pick', choices: ['a', 'a'], answer: 'a' })] })).includes('duplicate_choice'));
assert.deepStrictEqual(rules(lv({ checks: [check({ prompt: 'Which?', choices: ['Limeña', 'limeña'], answer: 'limeña' })] })), []);
assert.ok(rules(lv({ checks: [check({ format: 'type_in', prompt: 'Evaluate 27^(2/3).', answer: '18' })] })).includes('prompt_vs_key'));
assert.ok(rules(lv({ checks: [check({ format: 'type_in', prompt: 'Solve 3x + 5 = 20.', answer: 'x = 6' })] })).includes('prompt_vs_key'));
assert.ok(rules(lv({ checks: [check({ format: 'type_in', prompt: 'Solve by elimination: 3x + 2y = 16 and x - 2y = 8.', answer: '(6, 1)' })] })).includes('prompt_vs_key'));
assert.ok(rules(lv({ checks: [check({ prompt: 'A line has slope -2/5. What is the slope of a line perpendicular to it?', choices: ['5/2', '-5/2'], answer: '-5/2' })] })).includes('prompt_vs_key'));
assert.ok(rules(lv({ blocks: [block({ correctId: 'z', options: [{ id: 'a', text: 'x' }] }, 0, 'Ret_MisconceptionTrap')] })).includes('key_points_nowhere'));
assert.ok(rules(lv({ blocks: [block({ correctId: 'a', options: [{ id: 'a', text: 'x', whyNot: 'no' }, { id: 'b', text: 'y' }] }, 0, 'Ret_MisconceptionTrap')] })).includes('key_vs_feedback'));
assert.strictEqual(code.spanishNumber('veintiocho'), 28);
assert.ok(rules({ trackId: 'spanish', blocks: [block({ headers: ['N', 'Word'], rows: [['17', 'dieciocho']] })], checks: [] }).includes('spanish_number'));

// A suspicion is never certain.
const sus = code.checkLevel(lv({ checks: [check({ format: 'type_in', prompt: 'How fast?', answer: '6 m/s', rationale: 'So 36 / 6 = 7 m/s here.' })] }));
assert.ok(sus.some((f) => f.rule === 'rationale_vs_key' && !f.certain));

// The switch: off by default, shared levels only.
delete process.env.FACT_GATE;
assert.strictEqual(gate.gateOn(), false);
assert.strictEqual(gate.appliesTo({ userId: null }), false);
process.env.FACT_GATE = 'on';
assert.strictEqual(gate.appliesTo({ userId: null }), true);
assert.strictEqual(gate.appliesTo({ userId: 7 }), false, 'a learner keeps today\'s read');

(async () => {
  process.env.FACT_GATE_NO_WAIT = '1';
  process.env.FACT_GATE_READERS = 'a:glm-x,b:grok-x';
  process.env.FACT_GATE_DECIDER = 'b:grok-x';
  const context = { text: 'Subject: math.', trackId: 'math' };
  const blocks = [block({ text: 'Plain words here. 15 / 3 = 4 today.' }, 3)];
  const calls = [];
  const call = async (slot, args) => {
    calls.push(slot.model);
    if (args.schemaName === 'submit_errors') return { data: { errors: slot.provider === 'a' ? [{ where: 'block 3', quote: 'Plain words', why: 'not so', truth: 'x' }, { where: 'block 3', quote: 'other words', why: 'not so', truth: 'y' }] : [{ where: 'block 3', quote: 'Plain words', why: 'not so', truth: 'x' }] }, cost: 0.01, model: slot.model };
    return { data: { rulings: [{ flag: 0, real: true, reason: 'r' }, { flag: 1, real: false, reason: 'f' }] }, cost: 0.02, model: slot.model };
  };
  const r = await gate.read({ context, blocks, checks: [], call });
  assert.strictEqual(r.claims.filter((c) => c.by === 'code').length, 1, 'a code finding the decider did not rule out stands');
  assert.deepStrictEqual(r.claims.filter((c) => c.by === 'reader').map((c) => c.claim), ['Plain words'], 'duplicate merged, ruled-false dropped');
  assert.strictEqual(r.stages.raised, 3);
  assert.ok(Math.abs(r.cost - 0.04) < 1e-9);

  // Writer's family skipped, unless that leaves nobody.
  calls.length = 0;
  await gate.read({ context, blocks, checks: [], call, excludeFamilies: ['glm'] });
  assert.ok(!calls.includes('glm-x'));
  calls.length = 0;
  await gate.read({ context, blocks, checks: [], call, excludeFamilies: ['glm', 'grok'] });
  assert.ok(calls.includes('glm-x'));

  // The first reader down: not read, even though another answered.
  assert.strictEqual(await gate.read({ context, blocks, checks: [], call: async (slot, args) => { if (slot.provider === 'a') throw new Error('503'); return call(slot, args); } }), null);
  // No reader answered: not read.
  assert.strictEqual(await gate.read({ context, blocks, checks: [], call: async () => { throw new Error('down'); } }), null);
  console.log('fact-gate-test: ok');
})().catch((e) => { console.error(e); process.exit(1); });
