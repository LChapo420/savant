// Write the four skills round 3 patches from the scratch app, byte for byte (CRLF
// files keep their CR), against the live tree's files. Runs git diff --no-index in
// a folder outside any repository, so no .gitattributes or autocrlf touches a line.
//   node mkpatch.js <live root> <scratch app> <out dir>
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const [, , LIVE, APP, OUT] = process.argv;
const PATCHES = {
  '01-skill-record': ['config/db.js', 'routes/consent.js', 'server.js', 'public/path.html', 'public/js/path.js',
    'content/skill-progressions/chess.json', 'content/skill-progressions/piano.json', 'content/skill-progressions/basketball.json',
    'services/skill-coverage.js', 'services/skill-record.js', 'routes/skills.js', 'public/js/skill-kit.js', 'public/css/skills.css',
    'scripts/lib/skills-r3-fixture.js', 'scripts/skills-r3-record-test.js'],
  '02-stage-tests': ['content/skill-stage-checks.js', 'content/skill-stage-checks.data.json', 'services/skill-checks.js', 'routes/skill-checks.js',
    'public/stage-check.html', 'public/js/stage-check.js', 'scripts/skills-r3-checks-test.js'],
  '03-stage-gate': ['services/mastery.js', 'services/skill-gate.js', 'routes/skill-gate.js', 'public/stage-left.html', 'public/js/stage-left.js', 'scripts/skills-r3-gate-test.js'],
  '04-practice-dose': ['services/skill-adaptation.js', 'services/skill-dose.js', 'routes/skill-dose.js', 'public/skill-practice.html', 'public/js/skill-practice.js', 'scripts/skills-r3-dose-test.js'],
};
const work = path.join(path.dirname(OUT), 'mkpatch-work');
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (const [name, files] of Object.entries(PATCHES)) {
  let patch = '';
  for (const f of files) {
    const a = path.join(work, 'a', f);
    const b = path.join(work, 'b', f);
    fs.mkdirSync(path.dirname(b), { recursive: true });
    fs.copyFileSync(path.join(APP, f), b);
    const exists = fs.existsSync(path.join(LIVE, f));
    if (exists) { fs.mkdirSync(path.dirname(a), { recursive: true }); fs.copyFileSync(path.join(LIVE, f), a); }
    let out = '';
    try {
      execFileSync('git', ['-c', 'core.autocrlf=false', '-c', 'core.safecrlf=false', 'diff', '--no-index', '--no-prefix', '--no-color', exists ? `a/${f}` : '/dev/null', `b/${f}`], { cwd: work, encoding: 'latin1', maxBuffer: 64 << 20 });
    } catch (err) { out = err.stdout; } // exit code 1 means "differs"
    if (!out) throw new Error(`no diff for ${f}`);
    if (!exists) out = out.replace(`diff --git b/${f} b/${f}`, `diff --git a/${f} b/${f}`);
    patch += out;
  }
  fs.writeFileSync(path.join(OUT, `${name}.patch`), Buffer.from(patch, 'latin1'));
  console.log(`${name}.patch: ${files.length} files, ${patch.split('\n').length} lines`);
}
