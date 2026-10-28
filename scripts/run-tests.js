/**
 * `npm test`: runs every check in order, stops at the first real failure.
 *
 * data/ is gitignored (learner data and the owner's workbooks live only on the owner's machine), so
 * a fresh clone lacks a few input files. A step that needs a file that is not there is SKIPPED, loudly,
 * with the file named, and the summary lists every skip. A skip is not a pass: run `npm test` on the
 * owner's machine, where data/ exists, for full coverage. `--strict` turns any skip into a failure.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const STEPS = require('./test-steps.json');

// Inputs under data/ that a step reads and a fresh clone does not have.
const DB = 'data/db.json';
const NEEDS = {
  'grading-test': [DB],
  'iq-csv-test': ['data/IQ_Levels_Topics.csv'],
  'spanish-csv-test': ['data/Spanish_Fluency_Path.csv'],
  'chess-items-test': ['data/Chess_Grades_Levels.csv'],
  'piano-items-test': ['data/Piano_Grades_Levels.csv'],
  'basketball-items-test': ['data/Basketball_Grades_Levels.csv'],
  'self-test': [DB],
  'scorecard-test': [DB],
  'scorecard-contract-test': [DB],
  'model-lineup-test': [DB],
  'subject-placement-test': [DB],
  'game-lab-integration-test': [DB],
};

const strict = process.argv.includes('--strict');
// Decided once, up front: earlier steps may create an empty data/db.json, which is not the owner's.
const present = new Set(Object.values(NEEDS).flat().filter((f) => fs.existsSync(path.join(ROOT, f))));
const skipped = [];
for (const cmd of STEPS) {
  const name = (cmd.match(/scripts\/([\w-]+)\.js/) || [])[1];
  const missing = (NEEDS[name] || []).filter((f) => !present.has(f));
  if (missing.length) {
    console.log(`\nSKIP ${cmd}\n     needs ${missing.join(', ')} (not in this checkout)`);
    skipped.push(`${name} (${missing.join(', ')})`);
    continue;
  }
  console.log(`\n$ ${cmd}`);
  const r = spawnSync('sh', ['-c', cmd], { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`\nFAILED: ${cmd}`);
    process.exit(r.status || 1);
  }
}
if (skipped.length) {
  console.log(`\n${skipped.length} step(s) SKIPPED for missing data/ files:\n  - ${skipped.join('\n  - ')}`);
  if (strict) { console.error('--strict: skips count as failures'); process.exit(1); }
}
console.log(skipped.length ? '\nPassed, with skips.' : '\nAll steps passed.');
