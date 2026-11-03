'use strict';

const { applySpecRamp } = require('../services/sessions');

let failures = 0;

function check(name, ok, detail) {
  if (ok) {
    console.log(`  ok   ${name}`);
    return;
  }
  failures += 1;
  const suffix = detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 500)}`;
  console.log(`  FAIL ${name}${suffix}`);
}

function sameValues(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function close(actual, expected) {
  return Math.abs(actual - expected) < 1e-9;
}

const defaultEntries = [
  { skillId: 'review-default', role: 'review', difficulty: 4 },
  { skillId: 'focus-default', role: 'focus', difficulty: 5 },
];
const nullSpecResult = applySpecRamp(defaultEntries, null, 5);
const defaultSpecResult = applySpecRamp(defaultEntries, { isDefault: true }, 5);
check('a null spec leaves entries unchanged', sameValues(nullSpecResult, defaultEntries));
check('a default spec leaves entries unchanged', sameValues(defaultSpecResult, defaultEntries));

const reviewEntries = [
  { skillId: 'review-a', role: 'review', difficulty: 2 },
  { skillId: 'review-b', role: 'review', difficulty: 3 },
  { skillId: 'focus-review', role: 'focus', difficulty: 5 },
];
const reviewResult = applySpecRamp(reviewEntries, {
  isDefault: false,
  lesson: { warmupItems: 0 },
  difficulty: { startOffset: 1, ramp: 0 },
}, 5);
check(
  'reviews stay first, in order, and unchanged',
  sameValues(reviewResult.slice(0, 2), reviewEntries.slice(0, 2)),
);

const warmupEntries = [
  { skillId: 'review-warmup', role: 'review', difficulty: 4 },
  { skillId: 'warmup-a', role: 'focus', difficulty: 5 },
  { skillId: 'warmup-b', role: 'focus', difficulty: 5 },
  { skillId: 'focus-after-warmup', role: 'focus', difficulty: 5 },
];
const warmupResult = applySpecRamp(warmupEntries, {
  isDefault: false,
  lesson: { warmupItems: 2 },
  difficulty: { startOffset: 0, ramp: 0 },
}, 5);
check(
  'the first two body entries become warm-ups',
  warmupResult[1].warmup === true && warmupResult[2].warmup === true,
  warmupResult,
);
check(
  'warm-ups start at base minus 1.5',
  close(warmupResult[1].difficulty, 3.5) && close(warmupResult[2].difficulty, 3.5),
  warmupResult,
);
check('reviews are not used as warm-ups', warmupResult[0].warmup !== true);
check('entries after the warm-ups are not warm-ups', warmupResult[3].warmup !== true);

const shortResult = applySpecRamp([
  { skillId: 'only-body', role: 'focus', difficulty: 5 },
], {
  isDefault: false,
  lesson: { warmupItems: 2 },
  difficulty: { startOffset: 0, ramp: 0 },
}, 5);
check(
  'all body entries become warm-ups when fewer than the requested count exist',
  shortResult.length === 1 && shortResult[0].warmup === true,
  shortResult,
);

const rampEntries = Array.from({ length: 5 }, (_, index) => ({
  skillId: `focus-ramp-${index}`,
  role: 'focus',
  difficulty: 5,
}));
const rampResult = applySpecRamp(rampEntries, {
  isDefault: false,
  lesson: { warmupItems: 0 },
  difficulty: { startOffset: 0.5, ramp: 0.2 },
}, 5);
const rampDifficulties = rampResult.map((entry) => entry.difficulty);
check(
  'focus difficulties rise strictly',
  rampDifficulties.every((difficulty, index) => (
    index === 0 || difficulty > rampDifficulties[index - 1]
  )),
  rampDifficulties,
);
const rampAverage = rampDifficulties.reduce((sum, difficulty) => sum + difficulty, 0)
  / rampDifficulties.length;
check(
  'the focus difficulty average stays at base plus the start offset',
  close(rampAverage, 5.5),
  rampAverage,
);

const hugeRampResult = applySpecRamp(rampEntries, {
  isDefault: false,
  lesson: { warmupItems: 0 },
  difficulty: { startOffset: 0, ramp: 20 },
}, 5);
const hugeRampDifficulties = hugeRampResult.map((entry) => entry.difficulty);
check(
  'a huge ramp is capped to base plus or minus 2',
  hugeRampDifficulties.every((difficulty) => difficulty >= 3 && difficulty <= 7)
    && close(hugeRampDifficulties[0], 3)
    && close(hugeRampDifficulties[hugeRampDifficulties.length - 1], 7),
  hugeRampDifficulties,
);

const mixedEntries = [
  { skillId: 'review-mixed', role: 'review', difficulty: 4 },
  { skillId: 'focus-mixed-a', role: 'focus', difficulty: 5 },
  { skillId: 'support-mixed', role: 'support', difficulty: 3.5 },
  { skillId: 'stretch-mixed', role: 'stretch', difficulty: 6.5 },
  { skillId: 'focus-mixed-b', role: 'focus', difficulty: 5 },
];
const mixedSnapshot = JSON.stringify(mixedEntries);
const mixedResult = applySpecRamp(mixedEntries, {
  isDefault: false,
  lesson: { warmupItems: 0 },
  difficulty: { startOffset: 0.5, ramp: 0.2 },
}, 5);
const supportResult = mixedResult.find((entry) => entry.role === 'support');
const stretchResult = mixedResult.find((entry) => entry.role === 'stretch');
check(
  'support and stretch difficulties are unchanged',
  supportResult && stretchResult
    && close(supportResult.difficulty, 3.5)
    && close(stretchResult.difficulty, 6.5),
  mixedResult,
);
check('the ramp preserves the entry count', mixedResult.length === mixedEntries.length);
check(
  'the ramp preserves skill ids',
  sameValues(mixedResult.map((entry) => entry.skillId), mixedEntries.map((entry) => entry.skillId)),
);
check(
  'the ramp preserves roles',
  sameValues(mixedResult.map((entry) => entry.role), mixedEntries.map((entry) => entry.role)),
);
check('the ramp does not mutate its input', JSON.stringify(mixedEntries) === mixedSnapshot);

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nall session ramp checks passed');
process.exit(0);
