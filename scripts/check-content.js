/**
 * Content check. Generates a wide sweep of items across every skill and
 * difficulty and fails on anything a learner should never see: an empty prompt,
 * an answer that is not among the choices, a NaN or undefined leaking into text,
 * a duplicated choice, or a missing rationale.
 *
 * Run it before every deploy: `npm run check`.
 */
const bank = require('../content/bank');
const curriculum = require('../config/curriculum');

const PER_DIFFICULTY = 25;
const problems = [];
let generated = 0;

const missing = bank.missingSkills();
for (const skill of missing) {
  problems.push(`${skill}: no generator, but a grade lists it`);
}

const suspicious = /(NaN|undefined|null|Infinity|\[object)/;

/**
 * Two choices are allowed only for a question that has exactly two possible
 * answers, named here: "Can the black king catch the pawn?" is Yes or No, and a
 * square is dark or light. Any other two-choice item is a generator that lost its
 * distractors.
 */
const BINARY_PAIRS = new Set([['Yes', 'No'], ['Dark', 'Light']].map((pair) => pair.slice().sort().join('|')));
const binaryPair = (choices) => choices.length === 2 && BINARY_PAIRS.has(choices.slice().sort().join('|'));

for (const skill of curriculum.allUsedSkills()) {
  if (missing.includes(skill)) continue;
  for (let d = 1; d <= 10; d++) {
    for (let i = 0; i < PER_DIFFICULTY; i++) {
      let item;
      try {
        item = bank.generate({ skillId: skill, difficulty: d, seed: `check:${skill}:${d}:${i}` });
      } catch (err) {
        problems.push(`${skill} d${d}: threw ${err.message}`);
        continue;
      }
      generated++;
      const where = `${skill} d${d} seed ${i}`;
      const text = `${item.prompt} ${item.answer} ${item.rationale} ${(item.choices || []).join(' ')}`;
      if (suspicious.test(text)) problems.push(`${where}: suspicious token in "${text.slice(0, 140)}"`);
      if (!item.prompt.trim()) problems.push(`${where}: empty prompt`);
      if (!String(item.answer).trim()) problems.push(`${where}: empty answer`);
      if (!item.rationale.trim()) problems.push(`${where}: empty rationale`);
      if (item.format === 'multiple_choice') {
        if (!item.choices || (item.choices.length < 3 && !binaryPair(item.choices))) problems.push(`${where}: only ${item.choices ? item.choices.length : 0} choices`);
        else {
          if (!item.choices.includes(String(item.answer))) problems.push(`${where}: answer "${item.answer}" not among choices`);
          if (new Set(item.choices).size !== item.choices.length) problems.push(`${where}: duplicate choices`);
        }
      } else if (item.choices) {
        problems.push(`${where}: non-multiple-choice item carries choices`);
      }
    }
  }
}

const unique = [...new Set(problems)];
console.log(`checked ${generated} generated items across ${curriculum.allUsedSkills().length} skills`);
if (!unique.length) {
  console.log('no problems found');
  process.exit(0);
}
console.log(`\n${unique.length} problem${unique.length === 1 ? '' : 's'}:`);
for (const p of unique.slice(0, 60)) console.log(`  - ${p}`);
if (unique.length > 60) console.log(`  ... and ${unique.length - 60} more`);
process.exit(1);
