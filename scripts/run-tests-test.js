/** Every step in test-steps.json exists on disk, and every NEEDS entry in run-tests.js names a real step. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const steps = require('./test-steps.json');
const src = fs.readFileSync(path.join(__dirname, 'run-tests.js'), 'utf8');
const pkg = require('../package.json');

assert.strictEqual(pkg.scripts.test, 'node scripts/run-tests.js');
const names = steps.map((c) => (c.match(/scripts\/([\w-]+)\.js/) || [])[1]);
for (const c of steps) assert.ok(fs.existsSync(path.join(__dirname, '..', c.match(/scripts\/[\w-]+\.js/)[0])), `missing script for: ${c}`);
const needed = [...src.matchAll(/^  '([\w-]+)': \[/gm)].map((m) => m[1]);
assert.ok(needed.length >= 7);
for (const n of needed) assert.ok(names.includes(n), `NEEDS names a step that is not in test-steps.json: ${n}`);
console.log(`run-tests ok: ${steps.length} steps, ${needed.length} with data/ inputs`);

// The synthetic fixture db that stands in for data/db.json on a clean clone: parseable, has a learner
// with progress, and carries no real credentials or addresses.
const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'test-db.json'), 'utf8'));
assert.ok(fx.users.length >= 1 && fx.enrollments.length >= 1 && fx.sessions.length >= 1, 'fixture db needs a learner with progress');
for (const u of fx.users) {
  assert.ok(/@demo\.savantedu\.test$/.test(u.email), `fixture holds a non-synthetic address: ${u.email}`);
  assert.strictEqual(u.password_hash, 'x', 'fixture must not carry a real password hash');
}
console.log(`fixture db ok: ${fx.users.length} synthetic user(s), ${fx.sessions.length} sessions`);

// The stand-in workbook sheets: rebuilt from committed content, in the creator's layout, one level per row.
const os = require('os');
const { writeSheets } = require('./build-test-sheets');
const { parseCsv } = require('./build-sheet-track');
const sheetDir = writeSheets(fs.mkdtempSync(path.join(os.tmpdir(), 'savant-sheets-test-')));
const files = fs.readdirSync(sheetDir).sort();
assert.deepStrictEqual(files, ['Basketball_Grades_Levels.csv', 'Chess_Grades_Levels.csv', 'IQ_Levels_Topics.csv', 'Piano_Grades_Levels.csv']);
const chess = require('../content/chess-grades').GRADES;
const rows = parseCsv(fs.readFileSync(path.join(sheetDir, 'Chess_Grades_Levels.csv'), 'utf8'));
assert.strictEqual(rows[0][0], chess[0].heading);
assert.strictEqual(rows[1][0], 'Level #');
const counted = rows.slice(2).reduce((n, r) => n + r.filter((_, i) => i % 5 === 0 && /^\d+$/.test(r[i].trim())).length, 0);
assert.strictEqual(counted, chess.reduce((n, g) => n + g.levels.length, 0));
fs.rmSync(sheetDir, { recursive: true, force: true });
console.log('stand-in sheets ok: 4 files, chess level count matches');
