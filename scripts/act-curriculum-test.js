/** Regression checks for the authored ACT curriculum and coverage audit. */
const assert = require('assert');
const fs = require('fs');

const root = require('path').resolve(__dirname, '..');
const curriculum = require('../config/curriculum');
const topics = require('../content/topics');
const bank = require('../content/bank');
const { GRADES } = require('../content/act-grades');
const { parseCsv } = require('./build-sheet-track');

const EXPECTED_LEVEL_COUNTS = [705, 715, 734, 695, 745, 785, 636, 626,
  706, 646, 537, 527, 477, 447, 418, 408];

function check(message, fn) {
  try {
    fn();
    console.log(`ok   ${message}`);
  } catch (error) {
    console.error(`FAIL ${message}: ${error.message}`);
    process.exitCode = 1;
  }
}

check('the workbook generated all sixteen ACT grades', () => {
  assert.strictEqual(GRADES.length, 16);
  assert.deepStrictEqual(GRADES.map((grade) => grade.levels.length), EXPECTED_LEVEL_COUNTS);
});

check('every authored ACT path is consecutive and ends at graduation', () => {
  const track = curriculum.getTrack('act');
  assert.strictEqual(track.grades.length, 16);
  for (const [index, grade] of track.grades.entries()) {
    assert.strictEqual(grade.pathLength, EXPECTED_LEVEL_COUNTS[index] + 1);
    assert.deepStrictEqual(
      grade.levels.map((level) => level.level),
      Array.from({ length: EXPECTED_LEVEL_COUNTS[index] }, (_, at) => at + 1),
    );
    assert.strictEqual(curriculum.levelKind(grade.pathLength, grade.pathLength, grade), 'graduation');
  }
});

check('every ACT authored level has a usable skill and topic', () => {
  const track = curriculum.getTrack('act');
  for (const listedGrade of track.grades) {
    const grade = curriculum.getGrade('act', listedGrade.id);
    for (const entry of grade.levels) {
      assert.ok(grade.skills.includes(entry.skill), `${grade.id} level ${entry.level}`);
      const plan = curriculum.levelPlan(grade, entry.level);
      assert.strictEqual(plan.focus, entry.skill, `${grade.id} level ${entry.level} focus`);
      const topic = topics.topicFor(grade, entry.level, plan.focus, 'act');
      assert.ok(topic && topic.topic === entry.title, `${grade.id} level ${entry.level} topic`);
    }
  }
  assert.deepStrictEqual(bank.missingSkills(), []);
});

check('legacy section grade ids still resolve', () => {
  for (const id of ['act_english', 'act_math', 'act_reading', 'act_science']) {
    assert.strictEqual(curriculum.getGrade('act', id).id, 'act_grade_6');
  }
});

check('the coverage map preserves its audited scope and statuses', () => {
  const file = require('path').join(root, 'data', 'ACT_Coverage_Map.csv');
  if (!fs.existsSync(file)) {
    // data/ is gitignored, so a fresh clone has no coverage map: say so, don't fail.
    console.log('SKIP the coverage map check: data/ACT_Coverage_Map.csv is not in this checkout (it lives only on the owner\'s machine)');
    return;
  }
  const rows = parseCsv(fs.readFileSync(file, 'utf8'));
  assert.strictEqual(rows.length - 1, 669);
  const headers = rows.shift();
  headers[0] = headers[0].replace(/^\uFEFF/, '');
  assert.deepStrictEqual(headers, [
    'Area', 'Reference item', 'Source', 'Status before fill (C/P/X)',
    'Lesson that covered it (if C)',
  ]);
  const statuses = rows.reduce((counts, row) => {
    counts[row[3]] = (counts[row[3]] || 0) + 1;
    return counts;
  }, {});
  assert.deepStrictEqual(statuses, { C: 530, P: 71, X: 68 });
  assert.deepStrictEqual(rows.reduce((counts, row) => {
    counts[row[0]] = (counts[row[0]] || 0) + 1;
    return counts;
  }, {}), {
    'English and Writing': 185,
    'Math (foundations through hardest items)': 269,
    'Reading, Science and test strategy': 215,
  });
  for (const row of rows) {
    assert.ok(row[0] && row[1] && row[2] && /^[CPX]$/.test(row[3]));
    if (row[3] === 'X') assert.strictEqual(row[4], '');
  }
});

if (process.exitCode) process.exit(process.exitCode);
console.log('all ACT curriculum checks passed');