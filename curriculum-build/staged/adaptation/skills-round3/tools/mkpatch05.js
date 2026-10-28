// Write patch 05 (chess sittings) from the scratch app, byte for byte, against the
// files as patches 01-04 leave them (a copy of those files in <base>; files not
// there are new). Runs git diff --no-index outside any repository.
//   node mkpatch05.js <base dir> <scratch app> <out dir>
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const [, , BASE, APP, OUT] = process.argv;
const FILES = [
  // patch 02's and 01's files it changes
  'content/skill-stage-checks.js', 'services/skill-checks.js', 'routes/skill-checks.js', 'public/stage-check.html', 'public/js/stage-check.js',
  'services/skill-coverage.js',
  // new
  'content/chess-endgame-tables.js', 'content/chess-endgame-tables.data.json', 'content/skill-chess-sittings.js', 'content/skill-chess-sittings.data.json',
  'services/skill-chess-sittings.js', 'public/js/chess-sittings.js', 'scripts/skills-r3-chess-test.js',
];
const work = path.join(path.dirname(path.resolve(OUT)), 'mkpatch05-work');
fs.rmSync(work, { recursive: true, force: true });
let patch = '';
for (const f of FILES) {
  const a = path.join(work, 'a', f);
  const b = path.join(work, 'b', f);
  fs.mkdirSync(path.dirname(b), { recursive: true });
  fs.copyFileSync(path.join(APP, f), b);
  const exists = fs.existsSync(path.join(BASE, f));
  if (exists) { fs.mkdirSync(path.dirname(a), { recursive: true }); fs.copyFileSync(path.join(BASE, f), a); }
  let out = '';
  try {
    execFileSync('git', ['-c', 'core.autocrlf=false', '-c', 'core.safecrlf=false', 'diff', '--no-index', '--no-prefix', '--no-color', exists ? `a/${f}` : '/dev/null', `b/${f}`], { cwd: work, encoding: 'latin1', maxBuffer: 256 << 20 });
  } catch (err) { out = err.stdout; }
  if (!out) throw new Error(`no diff for ${f}`);
  if (!exists) out = out.replace(`diff --git b/${f} b/${f}`, `diff --git a/${f} b/${f}`);
  patch += out;
}
fs.writeFileSync(path.join(OUT, '05-chess-sittings.patch'), Buffer.from(patch, 'latin1'));
fs.rmSync(work, { recursive: true, force: true });
console.log(`05-chess-sittings.patch: ${FILES.length} files, ${patch.split('\n').length} lines`);
