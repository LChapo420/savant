#!/usr/bin/env node
/** Explanations do not point at options by place. Offline. Part of npm test. */
const assert = require('assert');
const o = require('../services/game-ordinals');

const cases = [
  ["The only actual grammar error is using 'less', making option D correct.", "The only actual grammar error is using 'less', making this option correct."],
  ['Option (0) uses a comma to join them.', 'This option uses a comma to join them.'],
  ['Option 0 keeps the voice passive.', 'This option keeps the voice passive.'],
  ['Option 0, “The vet examined the dog,” correctly uses a comma.', '“The vet examined the dog,” correctly uses a comma.'],
  ["So option (3) 'A colon' is right.", "So 'A colon' is right."],
  ['The correct answer is (1) because reflection essays allow it.', 'This answer is correct because reflection essays allow it.'],
  ["The correct answer is the first option, 'The data confirmed it,' because it is complete.", "The correct answer is 'The data confirmed it,' because it is complete."],
  ['Only the last option has a subject.', 'Only this option has a subject.'],
  ['Which is exactly what option B says.', 'Which is exactly what this option says.'],
];
for (const [a, b] of cases) assert.strictEqual(o.cleanExplanation(a).text, b, a);

// Nothing else moves.
for (const s of ['A colon follows a complete sentence.', 'Plan A failed, so they chose another option.', 'In option trading a call gives a right.', 'The first sentence is complete.', '(3) is the cube root of 27.']) {
  assert.strictEqual(o.cleanExplanation(s).changed, false, s);
}
// A place that means a wrong option stays, for a reader.
for (const t of ['Option 2 is wrong because it splices.', 'A fragment lacks a main clause; only the first option has no such clause.']) { const r = o.cleanExplanation(t); assert.strictEqual(r.changed, false, t); assert.strictEqual(r.left, true, t); }
assert.strictEqual(o.cleanExplanation('The correct answer is (2) The game ended, so we left.').text, 'The correct answer is: The game ended, so we left.');
// Two places named: left alone, reported.
const two = o.cleanExplanation('Option 1 is a splice, while option 3 uses a semicolon.');
assert.strictEqual(two.changed, false);
assert.strictEqual(two.left, true);

// Options: numbering goes, the key and the order stay.
const q = { prompt: 'p', choices: ['(0) One', '(1) Two', '(2) Three'], answerIndex: 1, explanation: 'Option (1) is right.' };
const c = o.cleanQuestion(q);
assert.deepStrictEqual(c.choices, ['One', 'Two', 'Three']);
assert.strictEqual(c.answerIndex, 1);
assert.strictEqual(c.explanation, 'This option is right.');
assert.deepStrictEqual(o.cleanChoices(['(0) Only this one', 'Plain', 'Other']), ['Only this one', 'Plain', 'Other']);
assert.deepStrictEqual(o.cleanChoices(['A', 'B', 'C']), ['A', 'B', 'C']);
assert.deepStrictEqual(o.cleanChoices(['(x + 1) squared', '(x) alone']), ['(x + 1) squared', '(x) alone']);

// Same object when there is nothing to do; inject serves the clean text.
const plain = { questions: [{ prompt: 'p', choices: ['a', 'b'], answerIndex: 0, explanation: 'Because.' }] };
assert.strictEqual(o.cleanPayload(plain), plain);
const dirty = { questions: [{ prompt: 'p', choices: ['a', 'b'], answerIndex: 0, explanation: 'Option 3 is it.' }] };
assert.strictEqual(o.cleanPayload(dirty).questions[0].explanation, 'This option is it.');
assert.strictEqual(dirty.questions[0].explanation, 'Option 3 is it.', 'stored data is not changed');
console.log('game-ordinals-test: ok');
