/** Verify the Spanish source CSV, generated levels and runtime layout agree. */
const path = require('path');
const { parseCsv } = require('./build-sheet-track');
const { readSpanishSheet } = require('./build-spanish-grades');
const { GRADES } = require('../content/spanish-grades');
const curriculum = require('../config/curriculum');
const LAYOUT = require('../config/level-layout');
const topics = require('../content/topics');
const assignments = require('../config/game-assignments');
// The Spanish generators, with the B2-C2 ones that serve the advanced grades
// (grade-fit, config/grade-skills.js).
const bank = { GENERATORS: { ...require('../content/spanish-items').GENERATORS, ...require('../content/spanish-grade-items').GENERATORS } };

const SRC = process.env.SPANISH_SHEET || path.join(__dirname, '..', 'data', 'Spanish_Fluency_Path.csv');
const failures = [];
const expected = readSpanishSheet(SRC);
const csv = parseCsv(require('fs').readFileSync(SRC, 'utf8'));

function check(condition, message) {
  if (!condition) failures.push(message);
}

check(expected.length === 57, `source grade count is ${expected.length}, expected 57`);
check(GRADES.length === expected.length, `generated grade count ${GRADES.length} != ${expected.length}`);
check(curriculum.getTrack('spanish').grades.length === expected.length, 'catalogue does not expose every Spanish grade');

let totalLevels = 0;
let totalLessons = 0;
for (let i = 0; i < expected.length; i++) {
  const want = expected[i];
  const got = GRADES[i];
  if (!got) {
    failures.push(`missing generated grade ${i + 1}`);
    continue;
  }
  totalLevels += want.levels.length;
  totalLessons += want.levels.filter((row) => row.kind === 'lesson').length;
  check(got.id === want.id, `${want.heading}: grade id ${got.id} != ${want.id}`);
  check(got.heading === want.heading, `${want.id}: heading differs from CSV`);
  check(got.levels.length === want.levels.length, `${want.id}: level count differs`);

  const runtime = curriculum.getGrade('spanish', got.id);
  check(!!runtime, `${want.id}: missing runtime grade`);
  if (!runtime) continue;
  const expectedPathLength = want.levels.length + 1;
  check(runtime.pathLength === expectedPathLength, `${want.id}: path length ${runtime.pathLength} is incorrect`);
  const stated = LAYOUT.statedIndex(runtime);
  check(!!stated && stated.byLevel.size === want.levels.length, `${want.id}: runtime layout omits CSV levels`);

  for (let j = 0; j < want.levels.length; j++) {
    const source = want.levels[j];
    const generated = got.levels[j];
    const row = runtime.levels[j];
    if (!generated || !row) {
      failures.push(`${want.id} level ${j + 1}: missing generated/runtime row`);
      continue;
    }
    check(generated.level === source.level && generated.type === source.type,
      `${want.id} level ${source.level}: level or type differs`);
    check(generated.title === source.title && generated.covers === source.covers,
      `${want.id} level ${source.level}: title or coverage differs`);
    check(JSON.stringify(generated.columns) === JSON.stringify(source.columns),
      `${want.id} level ${source.level}: original CSV columns differ`);
    check(JSON.stringify(row.columns) === JSON.stringify(source.columns),
      `${want.id} level ${source.level}: runtime dropped original CSV columns`);
    check(row.kind === source.kind,
      `${want.id} level ${source.level}: ${source.type} mapped to ${row.kind}`);
    check(LAYOUT.kindOf(runtime, source.level) === row.kind,
      `${want.id} level ${source.level}: layout kind differs from row`);
    check(!!row.skill && !!bank.GENERATORS[row.skill],
      `${want.id} level ${source.level}: missing Spanish question generator for ${row.skill}`);
    if (source.type === 'Lesson') {
      const topic = topics.topicFor(runtime, source.level, row.skill, 'spanish');
      check(!!topic && topic.topic === source.title, `${want.id} lesson ${source.level}: topic mapping is incorrect`);
    }
    if (source.type === 'Game' || source.type === 'Speaking Game' || source.type === 'Review Game') {
      check(row.kind === 'practice', `${want.id} game ${source.level} is not practice-compatible`);
      // Every authored game row can take an engine from the registry (the engine
      // cycle, BANK_GAMES=off). With bank games on (the default), the placement
      // rules decide which of them are played as games (curriculum-build/
      // GAMES-PLACEMENT.md); that is checked in scripts/bank-games-test.js.
      const bankGames = process.env.BANK_GAMES;
      process.env.BANK_GAMES = 'off';
      check(!!assignments.resolve('spanish', got.id, source.level),
        `${want.id} game ${source.level} has no registered practice-game mapping`);
      if (bankGames === undefined) delete process.env.BANK_GAMES; else process.env.BANK_GAMES = bankGames;
    }
    // A bank game on a Spanish row is only ever on an authored game row.
    const placed = assignments.resolve('spanish', got.id, source.level);
    if (placed && placed.source === 'bank') {
      check(source.type === 'Game' || source.type === 'Review Game', `${want.id} level ${source.level}: a bank game on a ${source.type} row`);
    }
  }

  const finals = want.levels.filter((row) => row.type === 'Final Test');
  check(finals.length === 1 && (finals[0].kind === 'graduation' || finals[0].kind === 'master'),
    `${want.id}: authored final test is not a checkpoint`);
  if (finals[0]) check(assignments.resolve('spanish', got.id, finals[0].level) === null,
    `${want.id}: authored final test receives a practice game`);
  check(LAYOUT.kindOf(runtime, runtime.pathLength) === 'graduation', `${want.id}: authored final test does not end the path`);
}

for (let g = 0; g < expected.length; g++) {
  for (let r = 2; r < csv.length; r++) {
    const raw = csv[r].slice(g * 9, g * 9 + 9);
    if (raw.every((value) => !String(value || '').trim())) continue;
    check(raw.length === 9 && raw.every((cell) => typeof cell === 'string'),
      `CSV row ${r + 1}, grade ${g + 1}: expected nine source cells`);
  }
}

for (const [id, heading] of [['entry', 'Grade 1:'], ['intermediate', 'Grade 2:'], ['advanced', 'Grade 3:']]) {
  const grade = curriculum.getGrade('spanish', id);
  check(!!grade && grade.heading.startsWith(heading), `legacy Spanish grade id ${id} no longer resolves`);
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Spanish CSV check passed: ${expected.length} grades, ${totalLevels} levels, ${totalLessons} lessons; all columns and runtime mappings preserved.`);
}