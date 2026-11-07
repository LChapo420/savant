/**
 * Regressions from the third bug sweep (docs/BUG-SWEEP-NOV7.md). No model is called, no browser is needed.
 * The page fixes were watched in a real browser during the sweep; here they are text checks of the files that carry them.
 *   node scripts/bug-sweep-3-test.js      (also run by `npm test`)
 */
const fs = require('fs'); const os = require('os'); const path = require('path');
const { spawn } = require('child_process');
process.env.NODE_ENV = 'test';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bug-sweep-3-'));
process.env.DB_FILE = path.join(dir, 'db.json');
for (const name of Object.keys(process.env)) if (/(_API_KEY|_TOKEN)$/.test(name)) process.env[name] = '';
process.env.CONSENT_SWEEP = 'off';

const express = require('express');
const db = require('../config/db');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
let failures = 0;
const check = (label, ok, detail) => { if (ok) console.log(`  ok   ${label}`); else { failures += 1; console.log(`  FAIL ${label}${detail === undefined ? '' : ` ${JSON.stringify(detail).slice(0, 300)}`}`); } };

/** Every page address written in the pages and scripts leads to a real page. `/materials` (an API) was linked from onboarding and showed the landing page. */
function deadLinks() {
  console.log('internal links');
  const pub = path.join(ROOT, 'public');
  const files = [...fs.readdirSync(pub).filter((f) => f.endsWith('.html')).map((f) => path.join(pub, f)),
    ...fs.readdirSync(path.join(pub, 'js')).filter((f) => f.endsWith('.js')).map((f) => path.join(pub, 'js', f))];
  const server = read('server.js');
  const missing = new Set();
  let seen = 0;
  for (const f of files) {
    const s = fs.readFileSync(f, 'utf8');
    for (const m of s.matchAll(/(?:href="|href=\\"|location\.href\s*=\s*[`'"]|location\.replace\([`'"]|location\.assign\([`'"]|link\([`'"])(\/[a-zA-Z][\w\-/.]*)/g)) {
      const u = m[1].replace(/\/$/, '');
      if (u.startsWith('/api/') || u.endsWith('-')) continue; // a download, or the start of a built address (/my-material-${kind})
      seen += 1;
      if (!fs.existsSync(path.join(pub, u)) && !fs.existsSync(path.join(pub, `${u}.html`)) && !server.includes(`'${u}'`)) missing.add(`${u} in ${path.basename(f)}`);
    }
  }
  check(`${seen} links all lead somewhere`, seen > 50 && !missing.size, [...missing]);
}

function pages() {
  console.log('pages');
  const player = read('public/js/player.js');
  check('Player can bring the controls back after a failed answer', /function unlock\(host\)/.test(player) && /window\.Player = \{[^}]*unlock/.test(player));
  for (const [f, n] of [['session.js', 3], ['review.js', 1], ['skip.js', 1], ['enforcer.js', 1], ['path.js', 1], ['placement.js', 3], ['help.js', 2], ['skill-check.js', 1], ['reading-check.js', 1], ['subject-placement.js', 1]]) {
    const count = (read(`public/js/${f}`).match(/Player\.unlock\(/g) || []).length;
    check(`${f}: every failed answer unlocks (${n})`, count >= n, count);
  }
  check('the answer box never scrolls the question away on focus', player.includes('input.focus({ preventScroll: true })'));
  const placement = read('public/js/placement.js');
  check('no coach is offered on a placement, which the server refuses', !/onSubmit: \(answer\) => submit\(answer\) \}\)/.test(placement.replace(/coach: false \}/g, '')) && /submit\(answer\), coach: false \}/.test(placement));
  for (const f of ['session.js', 'review.js', 'skip.js', 'placement.js', 'subject-placement.js']) check(`${f}: a question starts at its top`, read(`public/js/${f}`).includes('window.scrollTo(0, 0)'));
  check('the path sends a grade waiting on placement to its quiz', /status === 'placement_pending'\s*\n?\s*\? `<a class="btn btn-primary btn-lg" href="\/placement\?enrollment=/.test(read('public/js/path.js').replace(/\r/g, '')));
  check('a page that cannot load clears its spinner and offers a retry', /querySelectorAll\('\.loading'\)\.forEach/.test(read('public/js/app.js')) && read('public/js/app.js').includes("'Try again'"));
  check('the connection message goes when the connection is back', /No connection/.test(read('public/js/app.js').match(/toastHost\.querySelectorAll\('\.toast-stay'\)\.forEach[^\n]*/)[0]));
  const css = read('public/css/style.css');
  check('a long chip wraps instead of pushing the page sideways', !/\.chip \{[^}]*white-space: nowrap/.test(css));
  check('a toast never takes the tap meant for what is under it', /\.toast-host \{[^}]*pointer-events: none/.test(css) && /body:has\(\.check-bar\) \.toast-host/.test(css));
  check('the two-statement choices on the baseline wrap', /body\.ob-baseline \.ob-actions \.btn \{[^}]*white-space: normal/.test(read('public/css/screens/onboarding.css')));
  check('catch-up has the same look as the other pages', read('public/catchup.html').includes('/js/style-boot.js'));
  const start = read('public/js/start.js');
  check('the first-lesson dots stay in the empty space', start.includes('bind: spots') && /gap < 96/.test(start) && !/\$\{spots\(\)\}/.test(start));
  check('a child account has no leading comma on its profile', read('public/js/profile.js').includes("${user.email ? `${esc(user.email)}, joined` : 'Joined'}"));
  check('an empty email is named before the invite is asked about', /Enter your email address/.test(read('public/js/auth.js')));
}

/** A sitting still open counts in "this week": someone who answered and closed the tab was told they had done nothing. */
async function week() {
  console.log('this week');
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.user = db.byId('users', Number(req.headers['x-user'])) || null; next(); });
  app.use('/api', require('../routes/profile'));
  const server = await new Promise((r) => { const sv = app.listen(0, '127.0.0.1', () => r(sv)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const user = db.insert('users', { email: 'week@example.test', display_name: 'Week', password_hash: 'x' });
  const progress = async () => (await (await fetch(`${base}/api/progress`, { headers: { 'x-user': String(user.id) } })).json());
  check('nothing done: an empty week', (await progress()).week.length === 0);
  const s = db.insert('sessions', { user_id: user.id, kind: 'practice', track_id: 'math', grade_id: 'x', level: 11, blocks: [] });
  for (let i = 0; i < 3; i += 1) db.insert('items', { session_id: s.id, user_id: user.id, role: 'practice', prompt: 'q', answer: '1', user_answer: '1', correct: true });
  db.insert('items', { session_id: s.id, user_id: user.id, role: 'practice', prompt: 'q', answer: '1', user_answer: null });
  let w = (await progress()).week;
  check('an open sitting counts its answers', w.length === 1 && w[0].answered === 3, w);
  db.update('sessions', s.id, { ended_at: new Date().toISOString() });
  w = (await progress()).week;
  check('once closed it is counted once', w.length === 1 && w[0].answered === 3, w);
  await new Promise((r) => server.close(r));
}

/** The real server: a missing page is a 404 page, a missing file a plain 404, and a too-long sign-in does not talk about file uploads. */
async function missing() {
  console.log('missing addresses');
  const port = 7300 + (process.pid % 500);
  const env = { ...process.env, PORT: String(port), DB_FILE: path.join(dir, 'server.json'), SESSION_SECRET: 'y'.repeat(40), LOG_DIR: path.join(dir, 'logs'), BETA_SIGNIN_ONLY: 'off', NODE_ENV: 'test' };
  const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  try {
    let up = false;
    for (let i = 0; i < 80 && !up; i += 1) { try { up = (await fetch(`${base}/api/health`)).status < 500; } catch { await new Promise((r) => setTimeout(r, 400)); } }
    check('the server came up', up);
    const page = await fetch(`${base}/no-such-page`);
    const text = await page.text();
    check('a mistyped address is a 404 page, not the landing page', page.status === 404 && text.includes('Page not found') && !text.includes('Find your level'), page.status);
    const js = await fetch(`${base}/js/no-such-file.js`);
    check('a missing script is a plain 404, not HTML', js.status === 404 && !/html/.test(js.headers.get('content-type') || ''), [js.status, js.headers.get('content-type')]);
    const home = await fetch(`${base}/`);
    check('the home page is still the home page', home.status === 200 && (await home.text()).includes('Find your level'));
    const long = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ email: 'x'.repeat(70000), password: 'y' }) });
    const body = await long.json();
    check('a too-long sign-in says so, without talking about uploads', long.status === 413 && !/upload|MB/.test(body.error), body);
    const upload = await fetch(`${base}/api/materials/paste`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ text: 'x'.repeat(40 * 1024 * 1024) }) });
    if (upload.status === 413) check('an upload that is too big still gives the upload limits', /MB/.test((await upload.json()).error));
  } finally {
    child.kill();
  }
}

(async () => {
  deadLinks();
  pages();
  await week();
  await missing();
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* the temp folder clears itself in time */ }
  console.log(failures ? `\n${failures} FAILED` : '\nAll passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
