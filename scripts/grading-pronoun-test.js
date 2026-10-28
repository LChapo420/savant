/**
 * The optional Spanish subject pronoun in typed answers.
 *
 *   node scripts/grading-pronoun-test.js
 *
 * Answers are compared without accents, so "el" (the) and "él" (he), "tu" (your)
 * and "tú" (you) look alike. A learner may add or leave out a subject pronoun,
 * but an article or a possessive is part of the answer: "libro" must not pass
 * for "el libro". No model is called and nothing is written.
 */
const { grade } = require('../services/grading');

const typed = (answer, key) => grade({ format: 'short_text', answer: key, accepts: [] }, answer).correct;

const cases = [
  ['libro', 'el libro', false, 'an article is part of the answer'],
  ['libro', 'tu libro', false, 'a possessive is part of the answer'],
  ['el libro', 'el libro', true, 'the same answer'],
  ['El libro', 'el libro', true, 'capitals are forgiven'],
  ['habla', 'él habla', true, 'the pronoun may be left out'],
  ['el habla', 'él habla', true, 'the pronoun may be typed without its accent'],
  ['hablas', 'tú hablas', true, 'tú may be left out'],
  ['yo hablo', 'hablo', true, 'a pronoun may be added'],
  ['hablo', 'yo hablo', true, 'yo may be left out'],
  ['ella come', 'come', true, 'ella may be added'],
];

let failures = 0;
for (const [answer, key, want, why] of cases) {
  const got = typed(answer, key);
  if (got !== want) failures++;
  console.log(`  ${got === want ? 'ok  ' : 'FAIL'} ${why}: "${answer}" for "${key}" -> ${got}`);
}
console.log(failures ? `\n${failures} failure(s)` : '\nall pronoun grading checks passed');
process.exit(failures ? 1 : 0);
