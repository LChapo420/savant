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


const adminChecks = (async () => {
// The admin results page: parses, uses real routes, and renders a bar chart from a report (stub DOM, no network).
{
  const html = read('public/spanish-study-admin.html');
  const js = read('public/js/spanish-study-admin.js');
  check('admin page loads its script, root and header', html.includes('src="/js/spanish-study-admin.js"') && html.includes('id="root"') && html.includes('id="header"'));
  try { execFileSync(process.execPath, ['--check', path.join(__dirname, '..', 'public/js/spanish-study-admin.js')]); check('spanish-study-admin.js parses', true); } catch (e) { check('spanish-study-admin.js parses', false, e.message); }
  check('admin page uses no hard-coded colours', !/#[0-9a-fA-F]{3,6}\b/.test(js));
  check('admin page calls the admin report and CSV, which the router has', js.includes('/api/spanish-study/admin/report') && js.includes('report.csv') && routes.includes("'/admin/report'") && routes.includes("'/admin/report.csv'"));
  const vm = require('vm');
  const run = async (user, report) => {
    const root = { innerHTML: '' };
    const App = {
      mount: (fn) => { App.fn = fn; },
      currentUser: async () => user, header() {}, escapeHtml: (x) => String(x).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`),
      api: { get: async () => report },
    };
    vm.runInNewContext(js, { App, document: { getElementById: () => root } });
    await App.fn();
    return root.innerHTML;
  };
  const arm = (m, ci, n) => ({ joined: n, complete: n, left_study: 0, mean_hours: 4, gain: { n, mean: 0.2, sd: 0.1, ci95: null }, gain_per_hour: { n, mean: m, sd: 0.1, ci95: ci } });
  const rep = {
    totals: { joined: 6, left: 0, active: 6, complete: 4 },
    arms: { savant: arm(0.05, [0.01, 0.09], 3), duolingo: arm(-0.02, [-0.06, 0.02], 3) },
    difference_gain_per_hour: { savant_minus_duolingo: { diff: 0.07, ci95: [-0.01, 0.15], df: 4 } },
    difference_gain: { savant_minus_duolingo: { diff: null, ci95: null, df: null } },
    minimum_sample: { observed_sd_of_gain: 0.1, per_arm_to_detect_0_10: 16, per_arm_to_detect_0_20: 4 },
    note: 'A <note>',
    participants: [{ user_id: 1, name: '<b>x</b>', arm: 'savant', status: 'complete', hours: 4, missing_days: 0, gain: 0.2, gain_per_hour: 0.05 }],
  };
  const out = await run({ is_admin: true }, rep);
  check('admin page draws one bar per arm', (out.match(/<rect /g) || []).length === 2, out.length);
  check('admin page shows the difference, its interval and the CSV link', out.includes('+0.070') && out.includes('-0.010 to +0.150') && out.includes('report.csv'));
  check('admin page escapes names and the note', !out.includes('<b>x</b>') && !out.includes('<note>'));
  check('admin page lists every participant', out.includes('complete'));
  const blank = await run({ is_admin: true }, { ...rep, arms: { savant: { ...arm(null, null, 0), gain_per_hour: { n: 0, mean: null, sd: null, ci95: null } }, duolingo: arm(null, null, 0) }, participants: [] });
  check('admin page copes with no finished participants', blank.includes('no finished participants') && blank.includes('No participants yet'));
  const notAdmin = await run({ is_admin: false }, rep);
  check('non-admin sees page not found', notAdmin.includes('Page not found') && !notAdmin.includes('Gain per hour'));
}
})();

// Sealed files untouched in this working tree.
let dirty = '';
try {
  dirty = execFileSync('git', ['status', '--porcelain', '--', 'spanish-check', 'spanish-check-lc', 'routes/spanish-check.js', 'public/spanish-check.html', 'public/js/spanish-check.js'], { cwd: path.join(__dirname, '..') }).toString();
} catch { /* not a git checkout: nothing to check */ }
check('sealed Spanish files unchanged', dirty.trim() === '', dirty);

adminChecks.then(() => {
  if (failures) { console.log(`\n${failures} check(s) failed`); process.exit(1); }
  console.log('\nall study page checks passed');
}, (e) => { console.log(e); process.exit(1); });
