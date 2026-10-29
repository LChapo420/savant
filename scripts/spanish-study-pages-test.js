/**
 * The study participant pages (public/spanish-study*.html, public/js/spanish-study*.js):
 *
 *   node scripts/spanish-study-pages-test.js
 *
 * Static checks, since a cloud run has no signed-in browser: the pages exist and load their scripts, the scripts
 * parse, every API path they call is a real route, they never read a score or answer key, and they do not
 * copy-edit the sealed Spanish files.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

let failures = 0;
function check(label, ok, detail) {
  if (ok) { console.log(`  ok   ${label}`); return; }
  failures++;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 300)}`}`);
}
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

const routes = read('routes/spanish-study.js') + read('routes/spanish-study-tests.js');
const pages = [
  { html: 'public/spanish-study.html', js: 'public/js/spanish-study.js', api: '/api/spanish-study' },
  { html: 'public/spanish-study-test.html', js: 'public/js/spanish-study-test.js', api: '/api/spanish-study-test' },
];

for (const p of pages) {
  const html = read(p.html);
  const js = read(p.js);
  const name = path.basename(p.html);
  check(`${name} loads its script`, html.includes(`src="/js/${path.basename(p.js)}"`));
  check(`${name} has the root and header`, html.includes('id="root"') && html.includes('id="header"'));
  check(`${name} is mobile-ready`, html.includes('width=device-width'));
  try { execFileSync(process.execPath, ['--check', path.join(__dirname, '..', p.js)]); check(`${path.basename(p.js)} parses`, true); } catch (e) { check(`${path.basename(p.js)} parses`, false, e.message); }
  check(`${path.basename(p.js)} uses no hard-coded colours`, !/#[0-9a-fA-F]{3,6}\b/.test(js));
  check(`${path.basename(p.js)} touches no sealed Spanish endpoint`, !/\/api\/spanish-check\b/.test(js));
}

// Every sub-path the participant script calls exists in the router.
const study = read('public/js/spanish-study.js');
for (const sub of ['/me', '/join', '/checkin', '/leave']) {
  check(`spanish-study.js calls ${sub}, which the router has`, study.includes('${API}' + sub) && routes.includes(`'${sub}'`));
}
const test = read('public/js/spanish-study-test.js');
for (const sub of ['/status', '/start', '/next', '/answer', '/abandon', '/audio/', '/visibility']) {
  check(`spanish-study-test.js uses ${sub}, which the router has`, test.includes(sub) && routes.includes(`'${sub}`));
}

// The test page never shows a score or asks for the key.
check('test page reads no score, key or report', !/\.(scored|score|correct|cc|ci)\b|answer_key|\/report|\bkey\b/.test(test.replace(/\/\*[\s\S]*?\*\//, '')));
check('test page tells the learner they get no score', test.includes('not shown a score'));

// Sealed files untouched in this working tree.
let dirty = '';
try {
  dirty = execFileSync('git', ['status', '--porcelain', '--', 'spanish-check', 'spanish-check-lc', 'routes/spanish-check.js', 'public/spanish-check.html', 'public/js/spanish-check.js'], { cwd: path.join(__dirname, '..') }).toString();
} catch { /* not a git checkout: nothing to check */ }
check('sealed Spanish files unchanged', dirty.trim() === '', dirty);

if (failures) { console.log(`\n${failures} check(s) failed`); process.exit(1); }
console.log('\nall study page checks passed');
