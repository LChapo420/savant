/* docs/yc/INTERVIEW-CARDS.md: 40 numbered cards plus the bonus, each with Say / Backs it / YOU FILL IN, every
 * repo path it names exists, and the repo numbers it quotes still match the code. */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let failed = 0;
const check = (name, ok) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); if (!ok) failed++; };

const doc = fs.readFileSync(path.join(ROOT, 'docs/yc/INTERVIEW-CARDS.md'), 'utf8');
const cards = doc.split(/\n(?=\*\*(?:\d+|Bonus)\.)/).slice(1);

console.log('cards');
check('40 numbered cards plus the bonus', cards.length === 41);
const nums = cards.map((c) => (c.match(/^\*\*(\d+)\./) || [])[1]).filter(Boolean).map(Number);
check('numbered 1 to 40 in order', nums.length === 40 && nums.every((n, i) => n === i + 1));
for (const c of cards) {
  const title = c.split('\n')[0].slice(0, 40);
  check(`"${title}" has Say, Backs it, YOU FILL IN`, /- Say:/.test(c) && /- Backs it:/.test(c) && /- YOU FILL IN:/.test(c));
}

console.log('named files exist');
const files = [...new Set([...doc.matchAll(/`((?:docs|spanish-check|curriculum-build|content|services|scripts|site|public)\/[A-Za-z0-9_./-]+?\.(?:md|js|json|txt|html))`/g)].map((m) => m[1]))];
check('names at least 10 files', files.length >= 10);
for (const f of files) check(`${f} exists`, fs.existsSync(path.join(ROOT, f)));

console.log('numbers match the code');
const grades = require('../content/act-grades.js').GRADES;
const levels = grades.reduce((s, g) => s + g.levels.length, 0);
check('16 grades', grades.length === 16 && doc.includes('16 ACT grades'));
check('9,807 levels', levels === 9807 && doc.includes('9,807'));
const cal = require('../content/placement-calibration/act.json');
check('84 calibration points', Object.keys(cal.points).length === 84 && doc.includes('84 calibration points'));
const consent = fs.readFileSync(path.join(ROOT, 'scripts/consent-test.js'), 'utf8');
check('consent test file present for the 187-check claim', consent.length > 0 && doc.includes('187'));
const lineup = fs.readFileSync(path.join(ROOT, 'curriculum-build/MODEL-LINEUP.md'), 'utf8');
check('$24 stop and $11.20 are in MODEL-LINEUP.md', lineup.includes('$24') && lineup.includes('$11.20'));

console.log('honesty');
check('no "raises scores" claim', !/raises? (your )?scores/i.test(doc.replace(/never "raises scores"/g, '')));
check('no "COPPA compliant" claim except as a never', (doc.match(/COPPA compliant/g) || []).length <= 2 && !/we(?:'| a)re COPPA compliant/i.test(doc));
check('founder pre-ACT score is not quoted', !/pre-?ACT score (of|was|is) \d/i.test(doc));

if (failed) { console.log(`\n${failed} FAILED`); process.exit(1); }
console.log('\nAll interview-card checks passed.');
