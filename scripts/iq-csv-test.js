/** Verify that the IQ CSV and generated/runtime curriculum remain identical. */
const path = require('path');
const { readSheet } = require('./build-sheet-track');
const { GRADES } = require('../content/iq-grades');
const curriculum = require('../config/curriculum');
const LAYOUT = require('../config/level-layout');

const ROOT = path.join(__dirname, '..');
const src = path.join(ROOT, 'data', 'IQ_Levels_Topics.csv');
const source = readSheet(src, () => 'logic_deduction').grades;
const failures = [];

if (source.length !== GRADES.length) failures.push(`grade count ${GRADES.length} != ${source.length}`);

for (let i = 0; i < source.length; i++) {
  const expected = source[i];
  const actual = GRADES[i];
  if (!actual) {
    failures.push(`missing generated grade ${i + 1}`);
    continue;
  }
  if (actual.levels.length !== expected.levels.length) {
    failures.push(`${actual.id}: ${actual.levels.length} levels != ${expected.levels.length}`);
  }
  for (let j = 0; j < expected.levels.length; j++) {
    const want = expected.levels[j];
    const got = actual.levels[j];
    if (!got || got.level !== want.level || got.type !== want.type
      || got.topic !== want.title || got.title !== want.title || got.covers !== want.covers) {
      failures.push(`${actual.id} level ${want.level}: generated metadata differs from CSV`);
      break;
    }
  }

  const runtime = curriculum.getGrade('iq', actual.id);
  if (!runtime || runtime.pathLength !== expected.levels[expected.levels.length - 1].level + 1) {
    failures.push(`${actual.id}: runtime path length is wrong`);
  }
  const stated = LAYOUT.statedIndex(runtime);
  if (!stated || stated.byLevel.size !== expected.levels.length) {
    failures.push(`${actual.id}: runtime layout does not contain every CSV level`);
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  const total = GRADES.reduce((sum, grade) => sum + grade.levels.length, 0);
  console.log(`IQ CSV check passed: ${GRADES.length} grades, ${total} levels, all metadata preserved.`);
}