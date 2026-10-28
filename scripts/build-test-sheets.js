/**
 * Writes the synthetic stand-ins for the owner's workbook CSVs that `npm test` uses on a clone without data/.
 *
 * Each sheet is rebuilt from the generated content already committed (content/*-grades.js), in the creator's
 * layout: row 1 grade headings, row 2 column names, then one row per level, five columns per grade
 * (Level #, Type, Topic / Activity, What It Covers, Est. Min). So the tests that run on them check the
 * committed content against itself (layout, level counts, runtime mapping), not against the creator's
 * sheet; only a run with the real workbooks in data/ checks that. They are about 19 MB, so they are written to a temp dir by
 * scripts/run-tests.js each run and never committed. Run by hand: node scripts/build-test-sheets.js <dir>
 */
const fs = require('fs');
const path = require('path');

const SHEETS = () => ({
  'IQ_Levels_Topics.csv': require('../content/iq-grades').GRADES,
  'Chess_Grades_Levels.csv': require('../content/chess-grades').GRADES,
  'Piano_Grades_Levels.csv': require('../content/piano-grades').GRADES,
  'Basketball_Grades_Levels.csv': require('../content/basketball-grades').GRADES,
});
const cell = (v) => { const s = String(v == null ? '' : v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

function sheet(grades) {
  const rows = [grades.flatMap((g) => [g.heading, '', '', '', ''])];
  rows.push(grades.flatMap(() => ['Level #', 'Type', 'Topic / Activity', 'What It Covers', 'Est. Min']));
  const longest = Math.max(...grades.map((g) => g.levels.length));
  for (let i = 0; i < longest; i++) {
    rows.push(grades.flatMap((g) => {
      const l = g.levels[i];
      return l ? [l.level, l.type, l.title, l.covers, ''] : ['', '', '', '', ''];
    }));
  }
  return rows.map((r) => r.map(cell).join(',')).join('\n') + '\n';
}

function writeSheets(dir) {
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, grades] of Object.entries(SHEETS())) fs.writeFileSync(path.join(dir, name), sheet(grades));
  return dir;
}

module.exports = { writeSheets, sheet };
if (require.main === module) console.log(`wrote sheets to ${writeSheets(path.resolve(process.argv[2] || 'sheets-out'))}`);
