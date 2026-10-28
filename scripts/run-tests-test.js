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
assert.ok(needed.length >= 12);
for (const n of needed) assert.ok(names.includes(n), `NEEDS names a step that is not in test-steps.json: ${n}`);
console.log(`run-tests ok: ${steps.length} steps, ${needed.length} with data/ inputs`);
