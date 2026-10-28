/**
 * End-to-end test of scripts/import-spanish-prewritten.js on a throwaway data file.
 *
 *   node scripts/spanish-prewritten-import-test.js
 *
 * Never touches real data: everything happens in a new temporary directory.
 *
 *   1. The app makes the data file: the server is started with DB_FILE pointing
 *      at the temporary directory (config/db.js creates the file on first load),
 *      and two accounts are created through its own sign-up API, the owner and a
 *      tester, both enrolled in Spanish grade 1. The server is then stopped.
 *   2. The data file is given the state a busy app leaves behind: an AI-written
 *      ready plan on one level, and a failed write on another.
 *   3. The import: --dry-run (nothing may change), a real run (a backup is made,
 *      every lesson is inserted, the two older rows are retired, not deleted),
 *      a second run (nothing changes, no new backup), and --for-user for the
 *      tester.
 *   4. The server is started again on the imported file and both accounts open
 *      lessons over HTTP: the plan served is the pre-written one, its checks
 *      reach the page without their answers, and a check answered right and
 *      one answered wrong are graded as such.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.TEST_PORT || 6791);
const BASE = `http://127.0.0.1:${PORT}`;
const OWNER = 'owner@example.test';
const TESTER = 'tester@example.test';
const PASSWORD = 'Prewritten-Test-Passw0rd!';

let failures = 0;
function ok(cond, what) {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`);
  if (!cond) failures++;
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spanish-prewritten-test-'));
const dataFile = path.join(dir, 'db.json');
const env = {
  ...process.env,
  PORT: String(PORT),
  DB_FILE: dataFile,
  HOLDOUT_DIR: dir,
  NODE_ENV: 'development',
  OWNER_EMAIL: OWNER,
  SESSION_SECRET: 'spanish-prewritten-test-secret-0123456789abcdef',
  // No model may be called: the lessons must be served from the data file alone.
  ANTHROPIC_API_KEY: '', OPENROUTER_API_KEY: '', NVIDIA_API_KEY: '', GEMINI_API_KEY: '',
};

function startServer() {
  const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  child.log = () => log;
  return child;
}

async function waitUp(child) {
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch { /* not yet */ }
    if (child.exitCode !== null) throw new Error(`server exited: ${child.log().slice(-800)}`);
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`server did not start: ${child.log().slice(-800)}`);
}

function stopServer(child) {
  // The app flushes its data file 250 ms after a write and on SIGTERM; Windows has no SIGTERM
  // handler run on kill(), so let the timed flush land first.
  return new Promise((resolve) => {
    child.on('exit', resolve);
    setTimeout(() => child.kill('SIGTERM'), 700);
  });
}

function client() {
  let cookie = '';
  return async function call(method, url, body) {
    const res = await fetch(BASE + url, {
      method,
      headers: { 'Content-Type': 'application/json', Origin: BASE, Cookie: cookie },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ');
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, body: json };
  };
}

function runImport(args) {
  const r = spawnSync(process.execPath, ['scripts/import-spanish-prewritten.js', '--data', dataFile, '--json', ...args], { cwd: ROOT, env: { ...env, PORT: String(PORT + 1) }, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`import ${args.join(' ')} failed: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

const readData = () => JSON.parse(fs.readFileSync(dataFile, 'utf8'));
const backups = () => fs.readdirSync(dir).filter((f) => f.includes('.backup-prewritten-'));

async function main() {
  console.log(`scratch directory: ${dir}`);
  const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'spanish-prewritten', 'index.json'), 'utf8'));
  const total = index.lessons.length;

  // 1. the app makes the data file and the accounts
  let server = startServer();
  await waitUp(server);
  const ids = {};
  for (const email of [OWNER, TESTER]) {
    const call = client();
    const reg = await call('POST', '/api/auth/register', { email, password: PASSWORD, display_name: email.split('@')[0], birth_year: 1985, birth_month: 6, country: 'US' });
    ok(reg.status === 200 || reg.status === 201, `sign-up through the app: ${email} (${reg.status})`);
    const enr = await call('POST', '/api/enrollments', { selections: [{ track_id: 'spanish', grade_id: 'entry' }] });
    ok(enr.status === 201, `enrolled in Spanish grade 1 through the app (${enr.status})`);
  }
  await stopServer(server);
  ok(fs.existsSync(dataFile), 'the app created the data file');
  let data = readData();
  for (const email of [OWNER, TESTER]) ids[email] = (data.users.find((u) => u.email === email) || {}).id;
  ok(ids[OWNER] && ids[TESTER], `accounts are in the data file (owner ${ids[OWNER]}, tester ${ids[TESTER]})`);

  // 2. what a busy app leaves behind: an AI-written plan and a failed write
  data._counters.block_plans = (data._counters.block_plans || 0);
  const aiRow = { id: ++data._counters.block_plans, user_id: null, track_id: 'spanish', grade_id: 'entry', level: 16, attempt: 1, kind: 'lesson', status: 'ready', arm: 'shared', blocks: [{ block: 'Basic_TextBlock', purpose: 'x', data: { sections: [{ paragraphs: ['AI-written'] }] }, index: 0 }], checks: [], self_check: { status: 'passed' }, answers: {} };
  const failedRow = { id: ++data._counters.block_plans, user_id: null, track_id: 'spanish', grade_id: 'entry', level: 26, attempt: 1, kind: 'lesson', status: 'failed', reason: 'the fill-out call returned nothing', write_token: 'abc' };
  data.block_plans.push(aiRow, failedRow);
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
  const before = fs.readFileSync(dataFile, 'utf8');

  // 3. the import
  const dry = runImport(['--dry-run']);
  ok(fs.readFileSync(dataFile, 'utf8') === before && !backups().length, '--dry-run writes nothing and makes no backup');
  ok(dry.counts.inserted === total, `--dry-run reports ${total} lessons to insert (${dry.counts.inserted})`);

  const first = runImport([]);
  ok(first.counts.inserted === total, `first run inserts ${total} lessons (${first.counts.inserted})`);
  ok(first.retired === 2, `first run retires the 2 older rows (${first.retired})`);
  ok(backups().length === 1 && fs.readFileSync(path.join(dir, backups()[0]), 'utf8') === before, 'a backup identical to the file before the import was made');
  data = readData();
  const shared = data.block_plans.filter((p) => p.prewritten && p.user_id === null && p.status === 'ready');
  ok(shared.length === total, `${total} shared ready rows in block_plans (${shared.length})`);
  ok(data.block_plans.find((p) => p.id === aiRow.id).status === 'replaced', 'the AI-written row is kept, marked replaced');
  ok(data.block_plans.find((p) => p.id === failedRow.id).status === 'replaced' && !data.block_plans.find((p) => p.id === failedRow.id).write_token, 'the failed row is kept, marked replaced, its write token cleared');

  const second = runImport([]);
  ok(second.counts.unchanged === total && !second.counts.inserted && !second.counts.updated, `second run changes nothing (${JSON.stringify(second.counts)})`);
  ok(backups().length === 1, 'second run makes no backup (nothing to write)');

  const forUser = runImport(['--for-user', String(ids[TESTER])]);
  ok(forUser.counts.unchanged === total && forUser.counts.inserted === total, `--for-user adds ${total} of the tester's own rows, shared rows unchanged (${JSON.stringify(forUser.counts)})`);
  ok(runImport(['--for-user', String(ids[TESTER])]).counts.unchanged === 2 * total, 'repeating --for-user changes nothing');

  // 4. the app serves them
  server = startServer();
  await waitUp(server);
  try {
    for (const [email, level] of [[OWNER, 3], [TESTER, 16]]) {
      const call = client();
      const login = await call('POST', '/api/auth/login', { email, password: PASSWORD });
      ok(login.status === 200, `${email} signs in`);
      const t0 = Date.now();
      const got = await call('GET', `/api/lessons/spanish/entry/${level}`);
      const ms = Date.now() - t0;
      const file = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'spanish-prewritten', 'entry', `level-${String(level).padStart(3, '0')}.json`), 'utf8'));
      ok(got.status === 200 && got.body.basis === 'blocks', `${email}: entry/${level} is served as a block lesson (${got.status}, ${ms} ms)`);
      const plan = got.body.plan || {};
      const served = data.block_plans.find((p) => p.id === plan.id) || readData().block_plans.find((p) => p.id === plan.id);
      ok(served && served.prewritten && served.prewritten.sha256 === file.prewritten.sha256, `${email}: the plan served is the pre-written one (row ${plan.id}, ${plan.tailored ? 'their own copy' : 'shared'})`);
      const checks = (plan.entries || []).filter((e) => e.block.startsWith('Check_'));
      ok(checks.length === file.checks.length && checks.every((e) => !('answer' in e.data)), `${email}: all ${file.checks.length} checks reach the page, none with its answer`);
      const blocks = (plan.entries || []).filter((e) => !e.block.startsWith('Check_'));
      ok(blocks.length === file.blocks.length, `${email}: all ${file.blocks.length} blocks reach the page`);
      const [c1, c2] = file.checks;
      const right = await call('POST', `/api/lessons/spanish/entry/${level}/check`, { check_id: c1.id, answer: c1.answer, ms: 4000 });
      ok(right.status === 200 && right.body.correct === true, `${email}: ${c1.id} answered with its key is graded right`);
      const wrongAnswer = c2.format === 'multiple_choice' ? c2.choices.find((x) => x !== c2.answer) : 'zzz';
      const wrong = await call('POST', `/api/lessons/spanish/entry/${level}/check`, { check_id: c2.id, answer: wrongAnswer, ms: 4000 });
      ok(wrong.status === 200 && wrong.body.correct === false, `${email}: ${c2.id} answered "${wrongAnswer}" is graded wrong`);
    }
  } finally {
    await stopServer(server);
  }
  const after = readData();
  ok(after.block_plans.filter((p) => p.prewritten && p.status === 'ready').length === 2 * total, 'after serving, every imported row is still ready (nothing was re-written or re-checked)');

  console.log(`\n${failures ? `${failures} FAILED` : 'all passed'}`);
  if (failures) process.exitCode = 1;
  else fs.rmSync(dir, { recursive: true, force: true });
}

main().catch((err) => { console.error(err.stack || err); process.exit(1); });
