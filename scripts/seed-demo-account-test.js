/**
 * The reviewer demo account (scripts/seed-demo-account.js).
 *
 *   node scripts/seed-demo-account-test.js
 *
 * Runs the script on a scratch data file made by the app's own setup (config/db.js
 * creates an empty store), offline, then signs in with the generated login on
 * server.js running that file. data/db.json and the real login file are never
 * touched: the login file goes to the scratch folder.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'seed-demo-account.js');
const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'savant-demo-seed-test-'));
const DATA = path.join(SCRATCH, 'db.json');
const LOGIN = path.join(SCRATCH, 'login.local.txt');

let failed = 0;
let passed = 0;
function check(name, ok, detail) {
  if (ok) { passed++; console.log(`  ok   ${name}`); return; }
  failed++;
  console.log(`  FAIL ${name}${detail !== undefined ? `\n       ${String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 800)}` : ''}`);
}

const KEYS = ['NVIDIA_API_KEY', 'ANTHROPIC_API_KEY', 'FACT_CHECK_ANTHROPIC_KEY', 'OPENROUTER_API_KEY', 'OPENROUTER_DEEPSEEK_API_KEY',
  'OPENROUTER_GLM_API_KEY', 'OPENROUTER_GPT_SOL_API_KEY', 'MIMO_API_KEY', 'GEMINI_API_KEY', 'MODELFLARE_API_KEY', 'XKIRO_API_KEY',
  'UNOROUTER_API_KEY', 'STANDARD_COMPUTE_API_KEY', 'JEV_API_KEY'];
const baseEnv = { ...process.env, OLLAMA_ENABLED: '0', PORT: String(30000 + Math.floor(Math.random() * 20000)) };
for (const k of KEYS) baseEnv[k] = '';
delete baseEnv.DB_FILE;
delete baseEnv.DB_READONLY;

function run(args) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: ROOT, env: baseEnv, encoding: 'utf8' });
  return { status: r.status, out: `${r.stdout}${r.stderr}`, stdout: r.stdout };
}
const read = () => JSON.parse(fs.readFileSync(DATA, 'utf8'));
const backups = () => fs.readdirSync(SCRATCH).filter((f) => /^db\.json\.before-demo-.*\.bak$/.test(f));

(async () => {
  // ── the scratch file, made by the app's own setup ──────────────────────────
  spawnSync(process.execPath, ['-e', "require('./config/db')"], { cwd: ROOT, env: { ...baseEnv, DB_FILE: DATA } });
  check('config/db.js made the scratch data file', fs.existsSync(DATA) && read().users.length === 0);
  // One real learner already in it, who must come through untouched.
  const store = read();
  store.users.push({ id: 1, email: 'someone@gmail.com', display_name: 'Someone', created_at: '2026-10-01T10:00:00.000Z' });
  store._counters.users = 1;
  fs.writeFileSync(DATA, JSON.stringify(store, null, 2));
  const original = fs.readFileSync(DATA);

  console.log('\nArguments');
  check('no --data is a usage error (exit 2)', run([]).status === 2);
  check('a missing data file is refused (exit 2)', run(['--data', path.join(SCRATCH, 'nope.json')]).status === 2);

  console.log('\n--dry-run');
  const dry = run(['--data', DATA, '--dry-run', '--login-file', LOGIN]);
  check('the dry run succeeds and says it wrote nothing', dry.status === 0 && /Dry run \(nothing written\)/.test(dry.out), dry.out.slice(-600));
  check('the dry run leaves the data file byte-identical', Buffer.compare(original, fs.readFileSync(DATA)) === 0);
  check('the dry run makes no backup and no login file', backups().length === 0 && !fs.existsSync(LOGIN));

  console.log('\nAn interrupted run changes nothing');
  const killed = await new Promise((resolve) => {
    const c = spawn(process.execPath, [SCRIPT, '--data', DATA, '--offline', '--login-file', LOGIN], { cwd: ROOT, env: baseEnv });
    let out = '';
    c.stdout.on('data', (b) => { out += b; });
    c.stderr.on('data', (b) => { out += b; });
    const t = setInterval(() => { if (backups().length) { clearInterval(t); setTimeout(() => c.kill('SIGTERM'), 150); } }, 10);
    c.on('exit', (code, sig) => { clearInterval(t); resolve({ code, sig, out }); });
  });
  check('a run killed mid-way (SIGTERM) leaves the data file byte-identical', Buffer.compare(original, fs.readFileSync(DATA)) === 0, killed.out.slice(-400));
  check('…and writes no login file', !fs.existsSync(LOGIN));
  for (const f of backups()) fs.unlinkSync(path.join(SCRATCH, f));

  console.log('\nThe real run (offline)');
  const first = run(['--data', DATA, '--offline', '--login-file', LOGIN]);
  check('it succeeds', first.status === 0, first.out.slice(-1500));
  check('a backup of the data file was made first, byte-identical to the original', backups().length === 1
    && Buffer.compare(original, fs.readFileSync(path.join(SCRATCH, backups()[0]))) === 0);
  check('the login file exists', fs.existsSync(LOGIN));
  if (!fs.existsSync(LOGIN)) throw new Error('no login file; stopping');
  if (process.platform !== 'win32') check('the login file is private (0600)', (fs.statSync(LOGIN).mode & 0o777) === 0o600, (fs.statSync(LOGIN).mode & 0o777).toString(8));
  const loginText = fs.readFileSync(LOGIN, 'utf8');
  const email = (loginText.match(/^email: (.+)$/m) || [])[1];
  const password = (loginText.match(/^password: (.+)$/m) || [])[1];
  check('the login file holds an email and a password', !!email && !!password && password.length >= 16);
  check('neither the email nor the password is printed', !first.out.includes(password) && !first.out.includes(email));

  const after = read();
  const demo = after.users.find((u) => u.demo_key === 'yc-reviewer');
  check('the demo user exists and is flagged demo', demo && demo.is_demo === true && demo.account_kind === 'demo');
  check('its email is on a reserved test domain too', demo && /\.test$/.test(demo.email));
  check('it is an adult account with an age check (no consent prompt)', demo && demo.age_check && demo.age_check.needs_parent === false && demo.onboarded === true);
  check('the beta login gate lets it in (beta_tester set)', demo && !!demo.beta_tester);
  check('the existing learner is untouched', JSON.stringify(after.users.find((u) => u.id === 1)) === JSON.stringify(store.users[0]));
  const mine = (name) => (after[name] || []).filter((r) => r.user_id === (demo && demo.id));
  const enrollments = mine('enrollments');
  check('two subjects, one of them ACT Prep', enrollments.length === 2 && enrollments.some((e) => e.track_id === 'act') && enrollments.some((e) => e.track_id === 'math'), enrollments.map((e) => e.track_id));
  check('both placed by a finished placement quiz', enrollments.every((e) => e.status === 'active' && e.placed_at && e.placement_session_id
    && mine('sessions').some((s) => s.id === e.placement_session_id && s.kind === 'placement' && s.ended_at && typeof s.score === 'number')));
  const sittings = mine('sessions').filter((s) => s.kind !== 'placement');
  check('at least two finished sittings in each subject', ['math', 'act'].every((t) => sittings.filter((s) => s.track_id === t && s.ended_at).length >= 2),
    sittings.map((s) => `${s.track_id}:${s.kind}:${!!s.ended_at}`));
  const answered = mine('items').filter((i) => i.correct !== null && i.correct !== undefined);
  check('questions answered and graded (right and wrong)', answered.length > 40 && answered.some((i) => i.correct) && answered.some((i) => !i.correct), answered.length);
  check('level feedback recorded', mine('level_feedback').length === 1);
  const memory = mine('tutor_memory')[0];
  check('tutor history: two learner turns with replies', memory && memory.turns.filter((t) => t.role === 'user').length === 2 && memory.turns.filter((t) => t.role === 'assistant').length === 2);
  check('the profile is filled in (survey, style quiz, plan)', (after.profiles || []).some((p) => p.user_id === demo.id && p.took_style_quiz && p.survey && p.survey.interests));

  // The metrics leave it out.
  process.env.DB_FILE = DATA;
  process.env.DB_READONLY = '1';
  // eslint-disable-next-line global-require
  const metrics = require('../services/real-user-metrics');
  const m = metrics.compute({ all: (n) => after[n] || [] }, { ledgerDir: SCRATCH });
  check('real-user metrics: 1 real user, the demo account excluded as demo', m.accounts.real === 1 && m.excluded.some((e) => e.id === demo.id && e.group === 'demo' && e.rule === 'flagged demo'));
  check('its sittings are not counted for real users', m.headline.last_30_days.sittings === 0);

  console.log('\nIdempotent');
  const beforeSecond = fs.readFileSync(DATA);
  const second = run(['--data', DATA, '--offline', '--login-file', LOGIN]);
  check('a second run succeeds and says the account exists', second.status === 0 && /already exists/.test(second.out), second.out);
  check('…and changes nothing (data, login file, no new backup)', Buffer.compare(beforeSecond, fs.readFileSync(DATA)) === 0
    && fs.readFileSync(LOGIN, 'utf8') === loginText && backups().length === 1);
  check('still exactly one demo account', read().users.filter((u) => u.demo_key === 'yc-reviewer').length === 1);

  console.log('\n--new-password');
  await new Promise((r) => setTimeout(r, 1100)); // a new backup stamp
  const third = run(['--data', DATA, '--new-password', '--login-file', LOGIN]);
  const newText = fs.readFileSync(LOGIN, 'utf8');
  const newPassword = (newText.match(/^password: (.+)$/m) || [])[1];
  check('it sets a new password and rewrites the login file', third.status === 0 && newPassword && newPassword !== password, third.out);
  check('…without printing it', !third.out.includes(newPassword));
  check('…after a fresh backup', backups().length === 2);
  check('…and leaves the progress alone', read().sessions.filter((s) => s.user_id === demo.id).length === mine('sessions').length);

  console.log('\nA running server is detected');
  const port = baseEnv.PORT;
  const blocker = require('http').createServer((q, s) => { s.setHeader('Content-Type', 'application/json'); s.end('{"ok":true}'); });
  await new Promise((r) => blocker.listen(Number(port), '127.0.0.1', r));
  const refused = await new Promise((resolve) => {
    const c = spawn(process.execPath, [SCRIPT, '--data', DATA, '--new-password', '--login-file', LOGIN], { cwd: ROOT, env: baseEnv });
    let out = '';
    c.stdout.on('data', (b) => { out += b; });
    c.stderr.on('data', (b) => { out += b; });
    c.on('exit', (code) => resolve({ code, out }));
  });
  blocker.close();
  check('it refuses while something answers /api/health on PORT (exit 3)', refused.code === 3 && /Stop the app first/.test(refused.out), refused.out);
  check('…and wrote nothing', fs.readFileSync(LOGIN, 'utf8') === newText);

  console.log('\nSigning in on the real server');
  const env = { ...baseEnv, NODE_ENV: 'test', DB_FILE: DATA, PORT: String(Number(port) + 1), CONSENT_SWEEP: 'off',
    SESSION_SECRET: crypto.randomBytes(32).toString('hex'), MAIL_OUTBOX_DIR: path.join(SCRATCH, 'outbox'), ADMIN_EMAILS: 'admin@gmail.com' };
  const child = spawn(process.execPath, [path.join(ROOT, 'server.js')], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', (b) => { log += b; });
  child.stderr.on('data', (b) => { log += b; });
  const base = `http://127.0.0.1:${env.PORT}`;
  try {
    let up = false;
    for (let i = 0; i < 240 && !up; i++) {
      try { up = (await fetch(`${base}/api/health`)).ok; } catch { /* not yet */ }
      if (!up) await new Promise((r) => setTimeout(r, 250));
    }
    check('the server starts on the seeded file', up, log.slice(-600));
    const res = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ email, password: newPassword }) });
    const cookie = (res.headers.get('set-cookie') || '').split(';')[0];
    check('the demo login from the file signs in', res.status === 200, await res.text());
    const old = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ email, password }) });
    check('the replaced password no longer works', old.status === 401);
    const dash = await fetch(`${base}/api/enrollments`, { headers: { Cookie: cookie, Origin: base } });
    const dj = dash.ok ? await dash.json() : null;
    const list = dj && (Array.isArray(dj) ? dj : dj.enrollments || dj.subjects || []);
    check('signed in, both subjects are listed and placed', dash.ok && Array.isArray(list) && list.length === 2, dj || dash.status);
    const mem = await fetch(`${base}/api/tutor/memory`, { headers: { Cookie: cookie, Origin: base } });
    const mj = mem.ok ? await mem.json() : null;
    check('the tutor shows the earlier conversation', mj && mj.recent && mj.recent.length >= 2);
  } finally {
    child.kill();
  }
})().catch((err) => { failed++; console.log(`  FAIL threw: ${err.stack}`); }).finally(() => {
  try { fs.rmSync(SCRATCH, { recursive: true, force: true }); } catch { /* best effort */ }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
});
