/* docs/yc/DEMO-SCRIPT.md: every page it sends the viewer to exists, every button or heading it quotes is in
 * the code, and it quotes no invented numbers. */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let failed = 0;
const check = (name, ok) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); if (!ok) failed++; };

const doc = read('docs/yc/DEMO-SCRIPT.md');

console.log('pages');
const paths = [...new Set([...doc.matchAll(/`(\/[a-z][a-z-]*)`/g)].map((m) => m[1]))];
check('names at least 5 pages', paths.length >= 5);
for (const p of paths) {
  check(`page ${p} exists`, fs.existsSync(path.join(ROOT, 'public', `${p.slice(1)}.html`)));
}
check('home page exists', fs.existsSync(path.join(ROOT, 'public/index.html')));

console.log('quoted labels are in the code');
const js = (f) => read(`public/js/${f}`);
const dash = js('dashboard.js');
for (const label of ['Your subjects', 'Recent sessions', 'skills due']) {
  check(`dashboard has "${label}"`, doc.includes(`**${label}**`) && dash.includes(label));
}
check('dashboard has "Start level"', dash.includes('Start level') && doc.includes('Start level N'));
const dock = js('tutor-dock.js');
for (const label of ['Ask tutor', 'Type', 'Talk', 'Speak', 'Send']) {
  check(`tutor dock has "${label}"`, doc.includes(`**${label}**`) && dock.includes(label));
}
const mat = js('my-material.js');
check('my-material has "Make a course" and "Study"', mat.includes('Make a course') && mat.includes('Study') && doc.includes('**Make a course**'));

console.log('honesty');
const prose = doc.replace(/`[^`]*`/g, '');
check('no score-gain claim', !/\+\s?\d+\s*points?/i.test(prose));
check('no user-count or percent-improved claim', !/\d+\s*(students|users|learners)\s+(have|raised|improved)/i.test(prose));
check('says there are no results', /no results/i.test(doc));
check('does not quote the founder pre-ACT score', !/pre-?ACT score\s*(of|was|is)?\s*\d/i.test(doc));
check('login file stays out of the video', /Never show that\s+file on screen/.test(doc));
check('seed script exists', fs.existsSync(path.join(ROOT, 'scripts/seed-demo-account.js')) && /"demo:account"/.test(read('package.json')));

if (failed) { console.log(`\n${failed} check(s) failed`); process.exit(1); }
console.log('\nAll checks passed');
