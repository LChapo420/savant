/**
 * The beta.savantedu.com deploy kit (deploy/beta/), run end to end in a sandbox.
 *
 *   node scripts/beta-deploy-kit-test.js
 *
 * Needs git, bash, tar and curl, and npm able to install the lockfile (from its
 * cache or the registry). Linux or macOS; it is skipped on Windows.
 *
 * What it does, with the VM's paths swapped for a temporary folder and systemd
 * swapped for a stand-in that starts and stops `node server.js` the same way:
 *   - static checks: the env example holds names only, every unit and script
 *     points at the same paths, the scripts parse, the login file is gitignored;
 *   - release.sh from a git snapshot of this working tree: a fresh data directory,
 *     the staged beta wiring applied to the release only, production mode;
 *   - run.sh: an invite approved for the admin, who signs up through the gate;
 *   - the demo account seeded (service stopped), then deploy/beta/smoke-test.js
 *     against the running release, with the demo login;
 *   - the nightly backup and its restore test, as the timer runs them;
 *   - a second release keeps every account and lesson script; a release that
 *     fails /healthz is switched back by itself; old releases are pruned.
 * No model is called (every key is blank) and no real mail is sent.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const KIT = path.join(ROOT, 'deploy', 'beta');

let failed = 0;
let passed = 0;
function check(name, ok, detail) {
  if (ok) { passed++; console.log(`  ok   ${name}`); return; }
  failed++;
  console.log(`  FAIL ${name}${detail !== undefined ? `\n       ${String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(-1500)}` : ''}`);
}
function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });
  return { status: r.status, out: `${r.stdout || ''}${r.stderr || ''}`, stdout: r.stdout || '' };
}
const read = (f) => fs.readFileSync(f, 'utf8');

// ── 1. static ────────────────────────────────────────────────────────────────
console.log('\nThe kit\'s files');
const envExample = read(path.join(KIT, 'savant-beta.env.example'));
const FIXED = {
  NODE_ENV: 'production', PORT: '6767', TRUST_PROXY: '1', APP_ORIGIN: 'https://beta.savantedu.com', ALLOWED_ORIGINS: 'https://beta.savantedu.com',
  DB_FILE: '/srv/savant-beta/shared/data/db.json', SESSION_DB_FILE: '/srv/savant-beta/shared/data/sessions.sqlite',
  BETA_INVITES_FILE: '/srv/savant-beta/shared/data/beta-invites.json', MAIL_OUTBOX_DIR: '/srv/savant-beta/shared/data/outbox',
  LOG_DIR: '/srv/savant-beta/shared/logs', BACKUP_DIR: '/srv/savant-beta/backups', BACKUP_MAX_AGE_DAYS: '28', MAIL_PROVIDER: 'resend',
  MAIL_FROM: '"Savant <no-reply@send.savantedu.com>"', BETA_GATE: 'invite', BETA_GATE_LOGIN: '1', CONSENT_PENDING_ACCESS: 'limited', OLLAMA_ENABLED: '0',
};
const lines = envExample.split('\n').filter((l) => /^[A-Z][A-Z0-9_]*=/.test(l));
const bad = lines.filter((l) => { const [k, ...v] = l.split('='); const val = v.join('='); return val !== '' && FIXED[k] !== val; });
check('the env example holds names only: every value is empty or a fixed, non-secret setting', bad.length === 0, bad);
check('every secret name is present and empty', ['SESSION_SECRET', 'RESEND_API_KEY', 'NVIDIA_API_KEY', 'ADMIN_EMAILS'].every((k) => lines.includes(`${k}=`)));
check('nothing in the kit looks like a key', !/(re_[A-Za-z0-9]{16,}|nvapi-[A-Za-z0-9_-]{16,}|sk-[A-Za-z0-9_-]{16,}|xkeysib-)/.test(
  fs.readdirSync(KIT).map((f) => read(path.join(KIT, f))).join('\n')));
const readme = read(path.join(KIT, 'README.md'));
const named = lines.map((l) => l.split('=')[0]);
check('the README names every variable of the env example', named.every((k) => readme.includes(k)), named.filter((k) => !readme.includes(k)));
for (const f of ['release.sh', 'run.sh']) check(`${f} parses (bash -n)`, sh('bash', ['-n', path.join(KIT, f)]).status === 0);
check('smoke-test.js parses', sh(process.execPath, ['--check', path.join(KIT, 'smoke-test.js')]).status === 0);
const unit = read(path.join(KIT, 'savant-beta.service'));
check('the service runs as savantbeta from /srv/savant-beta/app with the env file', /User=savantbeta/.test(unit) && /WorkingDirectory=\/srv\/savant-beta\/app/.test(unit)
  && /EnvironmentFile=\/srv\/savant-beta\/savant-beta.env/.test(unit));
check('the service may write only shared/ and backups/', /ReadWritePaths=\/srv\/savant-beta\/shared \/srv\/savant-beta\/backups/.test(unit) && /ProtectSystem=strict/.test(unit));
const backupUnit = read(path.join(KIT, 'savant-beta-backup.service'));
check('the backup unit takes a backup then runs the restore test', /ExecStart=\/usr\/bin\/node scripts\/backup-db.js\n/.test(backupUnit) && /--restore-test/.test(backupUnit));
check('the timer runs nightly and catches up after downtime', /OnCalendar=\*-\*-\* 03:30:00 UTC/.test(read(path.join(KIT, 'savant-beta-backup.timer'))) && /Persistent=true/.test(read(path.join(KIT, 'savant-beta-backup.timer'))));
const caddy = read(path.join(KIT, 'Caddyfile.beta'));
check('the Caddy block serves beta.savantedu.com from 127.0.0.1:6767', /^beta\.savantedu\.com \{/m.test(caddy) && /reverse_proxy 127\.0\.0\.1:6767/.test(caddy));
check('the kit never uses the landing site\'s /srv/savant/app or /srv/savant/data', ![unit, backupUnit, envExample, read(path.join(KIT, 'release.sh')), read(path.join(KIT, 'run.sh'))]
  .some((t) => /\/srv\/savant\/(app|data)\b/.test(t)));
const ignored = sh('git', ['check-ignore', '-q', '.demo-account.local.txt'], { cwd: ROOT });
check('the demo login file is gitignored', ignored.status === 0);

// ── 2. the sandbox ───────────────────────────────────────────────────────────
const tools = ['git', 'bash', 'tar', 'curl'].filter((t) => sh('bash', ['-c', `command -v ${t}`]).status !== 0);
if (process.platform === 'win32' || tools.length) {
  console.log(`\nskipping the sandbox run: ${process.platform === 'win32' ? 'Windows' : `missing ${tools.join(', ')}`}`);
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), 'savant-beta-kit-'));
const BASE = path.join(SANDBOX, 'srv', 'savant-beta');
const PORT = 21000 + Math.floor(Math.random() * 20000);
const ENV_FILE = path.join(BASE, 'savant-beta.env');
const LOGIN = path.join(BASE, 'demo-account.local.txt');
const ME = sh('id', ['-un']).stdout.trim();
fs.mkdirSync(path.join(BASE, 'bin'), { recursive: true });
for (const f of ['release.sh', 'run.sh']) fs.copyFileSync(path.join(KIT, f), path.join(BASE, 'bin', f));

// The env file, as step 6 of the README fills it, with the sandbox's paths.
const filled = envExample.replace(/\/srv\/savant-beta/g, BASE).split('\n').map((l) => {
  const fill = {
    SESSION_SECRET: crypto.randomBytes(48).toString('base64url'), ADMIN_EMAILS: 'founder-admin@gmail.com', OWNER_EMAIL: 'founder-admin@gmail.com',
    RESEND_API_KEY: 'test-not-a-key', PORT: String(PORT),
  };
  const k = l.split('=')[0];
  if (Object.prototype.hasOwnProperty.call(fill, k) && /^[A-Z_]+=/.test(l)) return `${k}=${fill[k]}`;
  return l;
}).join('\n');
fs.writeFileSync(ENV_FILE, `${filled}\n# sandbox only: mail goes nowhere\nRESEND_API_URL=http://127.0.0.1:9/emails\n`, { mode: 0o600 });

// systemd's stand-in: "restart" stops the running app and starts the one app/ points at,
// with only the env file's settings (like EnvironmentFile on a clean environment).
const FLAGS = path.join(SANDBOX, 'flags');
fs.mkdirSync(FLAGS);
const fakeSystemctl = path.join(SANDBOX, 'fake-systemctl');
fs.writeFileSync(fakeSystemctl, `#!/bin/bash
set -u
PIDFILE="${SANDBOX}/app.pid"
stop() { if [ -f "$PIDFILE" ]; then kill "$(cat "$PIDFILE")" 2>/dev/null; for i in $(seq 1 50); do kill -0 "$(cat "$PIDFILE")" 2>/dev/null || break; sleep 0.2; done; rm -f "$PIDFILE"; fi; }
start() {
  if [ -f "${FLAGS}/fail-next" ]; then rm -f "${FLAGS}/fail-next"; sleep 600 > /dev/null 2>&1 < /dev/null & echo $! > "$PIDFILE"; return 0; fi
  # exec all the way down, so $! is node's own pid; nothing keeps the caller's pipes open.
  (cd "${BASE}/app" && exec env -i PATH="$PATH" HOME="$HOME" bash -c 'set -a; . "$0"; set +a; exec node server.js' "${ENV_FILE}") >> "${SANDBOX}/app.log" 2>&1 < /dev/null &
  echo $! > "$PIDFILE"
}
case "$1" in restart) stop; start;; stop) stop;; start) start;; *) echo "fake-systemctl: $*" >&2; exit 2;; esac
`, { mode: 0o755 });

const releaseEnv = {
  ...process.env, SAVANT_BASE: BASE, SAVANT_USER: ME, SAVANT_PORT: String(PORT), SAVANT_ENV_FILE: ENV_FILE,
  SYSTEMCTL: fakeSystemctl, SAVANT_KEEP_RELEASES: '2', SAVANT_NPM_FLAGS: '--prefer-offline', SAVANT_HEALTH_TRIES: '45',
};
const release = (ref = 'origin/main', extra = {}) => sh('bash', [path.join(BASE, 'bin', 'release.sh'), ref], { env: { ...releaseEnv, ...extra } });
const run = (...args) => sh('bash', [path.join(BASE, 'bin', 'run.sh'), ...args], { env: releaseEnv });
const systemctl = (verb) => sh(fakeSystemctl, [verb, 'savant-beta']);
const appUrl = `http://127.0.0.1:${PORT}`;
async function waitHealthy() {
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(`${appUrl}/healthz`)).ok) return true; } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}
// Requests as Caddy would forward them: the visitor was on https.
const H = (extra = {}) => ({ 'Content-Type': 'application/json', Origin: appUrl, 'X-Forwarded-Proto': 'https', ...extra });

(async () => {
  console.log('\nA git snapshot of this working tree as the "GitHub" remote');
  const idx = path.join(SANDBOX, 'index');
  const gitEnv = { ...process.env, GIT_INDEX_FILE: idx };
  sh('git', ['read-tree', 'HEAD'], { cwd: ROOT, env: gitEnv });
  sh('git', ['add', '-A'], { cwd: ROOT, env: gitEnv });
  const tree = sh('git', ['write-tree'], { cwd: ROOT, env: gitEnv }).stdout.trim();
  const commit = sh('git', ['commit-tree', tree, '-p', 'HEAD', '-m', 'beta kit test snapshot'], { cwd: ROOT, env: { ...gitEnv, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t.test', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t.test' } }).stdout.trim();
  check('a snapshot commit of the working tree (HEAD and index untouched)', /^[0-9a-f]{40}$/.test(commit));
  const origin = path.join(SANDBOX, 'origin.git');
  sh('git', ['init', '-q', '--bare', origin]);
  const pushed = sh('git', ['push', '-q', origin, `${commit}:refs/heads/main`], { cwd: ROOT });
  check('pushed to a bare "origin"', pushed.status === 0, pushed.out);
  // README step 5: the clone the release script fetches into.
  const clone = sh('git', ['clone', '-q', '--no-checkout', origin, path.join(BASE, 'repo')]);
  check('cloned into BASE/repo', clone.status === 0, clone.out);

  console.log('\nFirst release (fresh data directory)');
  const r1 = release();
  check('release.sh succeeds and the release is live', r1.status === 0 && /is live/.test(r1.out), r1.out);
  if (r1.status !== 0) { console.log(read(path.join(SANDBOX, 'app.log')).slice(-2000)); throw new Error('first release failed'); }
  const live1 = fs.realpathSync(path.join(BASE, 'app'));
  check('app/ points at a release folder', path.dirname(live1) === fs.realpathSync(path.join(BASE, 'releases')));
  check('the release records its commit', read(path.join(live1, '.release-commit')).trim() === commit);
  check('data/, logs/ and lesson scripts are links into shared/', ['data', 'logs', path.join('public', 'base-lesson-scripts')]
    .every((p) => fs.lstatSync(path.join(live1, p)).isSymbolicLink() && fs.realpathSync(path.join(live1, p)).startsWith(fs.realpathSync(path.join(BASE, 'shared')))));
  check('the shipped lesson scripts were copied into shared/', fs.readdirSync(path.join(BASE, 'shared', 'base-lesson-scripts')).length > 0);
  check('the beta wiring is applied to the release, not to the repo', /require\('\.\/routes\/ops'\)/.test(read(path.join(live1, 'server.js')))
    && !/require\('\.\/routes\/ops'\)/.test(read(path.join(ROOT, 'server.js'))));
  check('build-only folders are left out of the release', !fs.existsSync(path.join(live1, 'public-v2')) && fs.existsSync(path.join(live1, 'curriculum-build', 'staged', 'beta-launch', 'apply.js'))
    && fs.readdirSync(path.join(live1, 'curriculum-build')).join() === 'staged');
  check('a fresh data file was made by the app on first start', fs.existsSync(path.join(BASE, 'shared', 'data', 'db.json')));
  const log1 = read(path.join(SANDBOX, 'app.log'));
  check('the app says: mail resend, sessions sqlite, beta gate invite', /mail: resend; sessions: sqlite; beta gate: invite/.test(log1), log1.slice(-600));
  check('no key or secret reaches the app log', !log1.includes('test-not-a-key') && !log1.includes(filled.match(/^SESSION_SECRET=(.+)$/m)[1]));

  console.log('\nThe founder signs up through an invite (run.sh)');
  const inv = run('node', 'scripts/beta-invites.js', 'approve', 'founder-admin@gmail.com');
  const code = (inv.out.match(/Code \(shown once\): (\S+)/) || [])[1];
  check('run.sh runs a tool in the live release with the app\'s settings; the invite code is printed once', inv.status === 0 && !!code, inv.out);
  const join = await fetch(`${appUrl}/api/auth/register`, { method: 'POST', headers: H(), body: JSON.stringify({ email: 'founder-admin@gmail.com', password: 'founder-pass-long-1', display_name: 'Founder', invite_code: code }) });
  check('the invited founder signs up', join.status === 201, await join.text());
  const adminCookie = (join.headers.get('set-cookie') || '').split(';')[0];
  const metrics = await (await fetch(`${appUrl}/api/admin/metrics`, { headers: H({ Cookie: adminCookie }) })).json();
  check('the founder is the admin and counts as founder in the metrics, not as a user', metrics.accounts && metrics.accounts.real === 0 && metrics.accounts.founder === 1, metrics.accounts);
  const uninvited = await fetch(`${appUrl}/api/auth/register`, { method: 'POST', headers: H(), body: JSON.stringify({ email: 'stranger@gmail.com', password: 'stranger-pass-long-1', display_name: 'Stranger' }) });
  check('a stranger without an invite cannot sign up', uninvited.status === 403);

  console.log('\nThe demo account (service stopped, as the README says)');
  const busy = run('node', 'scripts/seed-demo-account.js', '--data', path.join(BASE, 'shared', 'data', 'db.json'), '--login-file', LOGIN, '--offline');
  check('with the app running, the seed refuses', busy.status === 3, busy.out.slice(-300));
  systemctl('stop');
  const seeded = run('node', 'scripts/seed-demo-account.js', '--data', path.join(BASE, 'shared', 'data', 'db.json'), '--login-file', LOGIN, '--offline');
  check('stopped: the demo account is seeded', seeded.status === 0 && /Created the reviewer demo account/.test(seeded.out), seeded.out.slice(-800));
  check('the login file is beside the env file, private', fs.existsSync(LOGIN) && (fs.statSync(LOGIN).mode & 0o777) === 0o600);
  systemctl('start');
  check('the app comes back', await waitHealthy(), read(path.join(SANDBOX, 'app.log')).slice(-800));

  console.log('\ndeploy/beta/smoke-test.js against the release');
  const smoke = sh(process.execPath, [path.join(KIT, 'smoke-test.js'), '--url', appUrl, '--login-file', LOGIN]);
  check('every smoke check passes (with the demo login through the invite gate)', smoke.status === 0 && /0 failed/.test(smoke.out), smoke.out);
  check('the smoke test never prints the demo password', !smoke.out.includes((read(LOGIN).match(/^password: (.+)$/m) || [])[1]));
  const metrics2 = await (await fetch(`${appUrl}/api/admin/metrics`, { headers: H({ Cookie: adminCookie }) })).json();
  check('the demo account is excluded from the metrics as demo', metrics2.accounts && metrics2.accounts.real === 0 && metrics2.accounts.demo === 1, metrics2.accounts);

  console.log('\nNightly backup, as the timer runs it');
  const b = run('node', 'scripts/backup-db.js');
  const t = run('node', 'scripts/backup-db.js', '--restore-test');
  check('a backup is taken', b.status === 0 && fs.readdirSync(path.join(BASE, 'backups')).some((f) => /^db-.*\.json\.gz$/.test(f)), b.out);
  check('the restore test passes on it', t.status === 0, t.out.slice(-600));

  console.log('\nUpdating keeps the data');
  await new Promise((r) => setTimeout(r, 1100)); // a new release stamp
  const r2 = release();
  check('a second release goes live', r2.status === 0 && /is live/.test(r2.out), r2.out.slice(-1500));
  const live2 = fs.realpathSync(path.join(BASE, 'app'));
  check('…in a new folder', live2 !== live1);
  check('…after a backup taken before the switch', /backup before the switch/.test(r2.out));
  // This process still holds keep-alive sockets to the old server; the first request
  // after a restart can land on one. waitHealthy retries past it.
  await waitHealthy();
  const login = await fetch(`${appUrl}/api/auth/login`, { method: 'POST', headers: H(), body: JSON.stringify({ email: 'founder-admin@gmail.com', password: 'founder-pass-long-1' }) });
  check('the founder still signs in on the new release', login.status === 200);
  const smoke2 = sh(process.execPath, [path.join(KIT, 'smoke-test.js'), '--url', appUrl, '--login-file', LOGIN]);
  check('the demo account still works on the new release', smoke2.status === 0, smoke2.out.slice(-800));

  console.log('\nA bad release is switched back by itself');
  fs.writeFileSync(path.join(FLAGS, 'fail-next'), '');
  await new Promise((r) => setTimeout(r, 1100));
  const r3 = release('origin/main', { SAVANT_HEALTH_TRIES: '3' });
  check('release.sh exits 1 and says it switched back', r3.status === 1 && /switching back/.test(r3.out), r3.out.slice(-800));
  check('app/ points at the previous release again, and the failed one is removed', fs.realpathSync(path.join(BASE, 'app')) === live2
    && fs.readdirSync(path.join(BASE, 'releases')).length === 2);
  check('the previous release answers again', await waitHealthy());
  const again = await fetch(`${appUrl}/api/auth/login`, { method: 'POST', headers: H(), body: JSON.stringify({ email: 'founder-admin@gmail.com', password: 'founder-pass-long-1' }) });
  check('with every account intact', again.status === 200);

  console.log('\nOld releases are pruned');
  await new Promise((r) => setTimeout(r, 1100));
  const r4 = release();
  const left = fs.readdirSync(path.join(BASE, 'releases'));
  check('with KEEP=2, the live release and the one before it are left', r4.status === 0 && left.length === 2 && left.includes(path.basename(fs.realpathSync(path.join(BASE, 'app'))))
    && left.includes(path.basename(live2)), left);
  check('a bad ref fails before anything changes', release('origin/no-such-branch').status !== 0 && fs.readdirSync(path.join(BASE, 'releases')).length === 2);
})().catch((err) => {
  failed++;
  console.log(`  FAIL threw: ${err.stack}`);
  try { console.log(`  app.log (last lines):\n${read(path.join(SANDBOX, 'app.log')).slice(-2500)}`); } catch { /* none */ }
}).finally(() => {
  try { systemctl('stop'); } catch { /* gone */ }
  try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch { /* best effort */ }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
});
