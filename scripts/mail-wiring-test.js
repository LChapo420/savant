/**
 * server.js itself, not a patched copy: with MAIL_PROVIDER set the provider is installed and a real flow (a child's sign-up, which emails the parent)
 * goes to it; with it unset nothing changes and the dev outbox gets the mail; an unusable setting starts anyway and says which; /healthz answers.
 *
 * Nothing is sent: the provider is a local stand-in on 127.0.0.1 and the key is made up. Synthetic accounts in an empty temporary store.
 */
process.env.NODE_ENV = 'test';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'mail-wiring-'));
const FAKE_KEY = 'made-up-resend-key-not-real';
let failures = 0;
let passed = 0;
function check(label, ok, detail) {
  if (ok) { passed += 1; console.log(`ok   ${label}`); } else { failures += 1; console.log(`FAIL ${label}${detail !== undefined ? ` -- ${String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 500)}` : ''}`); }
}

function fakeResend() {
  const got = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => { got.push({ auth: req.headers.authorization, body: JSON.parse(body) }); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ id: `fake-${got.length}` })); });
  });
  return new Promise((resolve) => { server.listen(0, '127.0.0.1', () => resolve({ server, got, url: `http://127.0.0.1:${server.address().port}/emails` })); });
}

/** Only what the server needs: no model key, no mail setting and no live file gets in from the shell. */
function baseEnv(name, port) {
  const dir = path.join(WORK, name);
  fs.mkdirSync(dir, { recursive: true });
  const keep = {};
  for (const k of ['PATH', 'Path', 'SystemRoot', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'windir']) if (process.env[k]) keep[k] = process.env[k];
  return {
    dir,
    env: {
      ...keep, NODE_ENV: 'test', PORT: String(port), DB_FILE: path.join(dir, 'db.json'), MAIL_OUTBOX_DIR: path.join(dir, 'outbox'), MAIL_STATE_DIR: dir, LOG_DIR: path.join(dir, 'logs'),
      SESSION_STORE: 'memory', CONSENT_SWEEP: 'off', OLLAMA_ENABLED: '0', BETA_SIGNIN_ONLY: 'off', FACT_CHECK_ALL: '0', BETA_REPORT_DAILY: 'off', COST_TRACKER: 'off', APP_ORIGIN: `http://127.0.0.1:${port}`,
    },
  };
}

async function start(env) {
  // cwd is the temp folder so dotenv finds no .env; the script path is absolute.
  const child = spawn(process.execPath, [path.join(ROOT, 'server.js')], { cwd: path.dirname(env.DB_FILE), env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  const base = `http://127.0.0.1:${env.PORT}`;
  for (let i = 0; i < 240; i++) {
    try { await fetch(`${base}/api/health`); if (/listening on/.test(log)) return { child, base, log: () => log }; } catch { /* not up */ }
    if (child.exitCode !== null) break;
    await new Promise((r) => { setTimeout(r, 250); });
  }
  child.kill();
  throw new Error(`server did not start:\n${log.slice(-1500)}`);
}
const stop = async (s) => { if (s.child.exitCode === null) { s.child.kill(); await new Promise((r) => { s.child.on('exit', r); }); } };

async function childSignup(base) {
  const year = new Date().getUTCFullYear();
  const res = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base },
    body: JSON.stringify({ username: `wiringkid${Date.now() % 100000}`, password: 'kid-pass-1234', display_name: 'Kiddo', parent_email: 'parent@example.test', birth_year: year - 10, birth_month: 1, country: 'US' }),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

(async () => {
  const fake = await fakeResend();
  const port = 7800 + Math.floor(Math.random() * 150);

  console.log('-- MAIL_PROVIDER set');
  {
    const { env } = baseEnv('with', port);
    Object.assign(env, { MAIL_PROVIDER: 'resend', RESEND_API_KEY: FAKE_KEY, RESEND_API_URL: fake.url, MAIL_FROM: 'Savant <no-reply@send.example.test>' });
    const s = await start(env);
    try {
      const cfg = await fetch(`${s.base}/api/consent/config`).then((r) => r.json());
      check('the app reports a real transport, not the dev outbox', cfg.mail === 'custom', cfg.mail);
      const r = await childSignup(s.base);
      check('a child sign-up succeeds and says the email went', r.status === 201 && r.json.consent_email_sent === true, r);
      const mail = fake.got.find((g) => g.body.to && g.body.to[0] === 'parent@example.test');
      check('the consent email reached the provider, with its key and sender', !!mail && mail.auth === `Bearer ${FAKE_KEY}` && /no-reply@send\.example\.test/.test(mail.body.from) && /parent-consent\?token=/.test(mail.body.text));
      check('nothing went to the outbox', !fs.existsSync(env.MAIL_OUTBOX_DIR));
      check('the start-up line names the provider', /mail: resend;/.test(s.log()), s.log().slice(-300));
      check('the key is not in the server output', !s.log().includes(FAKE_KEY));
      const hz = await fetch(`${s.base}/healthz`);
      check('/healthz is 200 and only { ok: true }', hz.status === 200 && (await hz.text()) === '{"ok":true}');
      check('/api/ops/status is 404 for a visitor', (await fetch(`${s.base}/api/ops/status`)).status === 404);
    } finally { await stop(s); }
  }

  console.log('-- MAIL_PROVIDER unset: nothing different');
  {
    const before = fake.got.length;
    const { env } = baseEnv('without', port + 1);
    const s = await start(env);
    try {
      const cfg = await fetch(`${s.base}/api/consent/config`).then((r) => r.json());
      check('the app reports the dev outbox', cfg.mail === 'dev-outbox', cfg.mail);
      const r = await childSignup(s.base);
      check('a child sign-up succeeds as before', r.status === 201 && r.json.consent_email_sent === true, r);
      const files = fs.existsSync(env.MAIL_OUTBOX_DIR) ? fs.readdirSync(env.MAIL_OUTBOX_DIR) : [];
      check('the email is a file in the outbox', files.length === 1 && /consent/.test(fs.readFileSync(path.join(env.MAIL_OUTBOX_DIR, files[0]), 'utf8')), files);
      check('the provider got nothing', fake.got.length === before);
      check('the start-up line says dev outbox', /mail: dev outbox/.test(s.log()));
    } finally { await stop(s); }
  }

  console.log('-- production, MAIL_PROVIDER unset: still starts, as the live server does today');
  {
    const { env } = baseEnv('prod', port + 2);
    Object.assign(env, { NODE_ENV: 'production', SESSION_SECRET: 'a-made-up-session-secret-of-enough-length-000', APP_ORIGIN: 'https://app.example.test' });
    const s = await start(env);
    try {
      const cfg = await fetch(`${s.base}/api/consent/config`).then((r) => r.json());
      check('it started, and the dev outbox is still what it reports', cfg.mail === 'dev-outbox', cfg.mail);
      const hz = await fetch(`${s.base}/healthz`);
      check('/healthz is 200 in production', hz.status === 200);
      const h = await fetch(`${s.base}/api/health`).then((r) => r.json());
      check('/api/health still tells a visitor only { ok: true }', JSON.stringify(h) === '{"ok":true}', h);
    } finally { await stop(s); }
  }

  console.log('-- MAIL_PROVIDER set but unusable: still starts, says which setting, and no key shows');
  {
    const cases = [
      ['an unknown provider', { MAIL_PROVIDER: 'nonsense', MAIL_FROM: 'a@example.test' }, /MAIL_PROVIDER could not be used: MAIL_PROVIDER: unknown provider "nonsense"/],
      ['no key', { MAIL_PROVIDER: 'resend', MAIL_FROM: 'a@example.test' }, /MAIL_PROVIDER could not be used: resend: no API key/],
      ['no sender', { MAIL_PROVIDER: 'resend', RESEND_API_KEY: FAKE_KEY }, /MAIL_PROVIDER could not be used: resend: MAIL_FROM is not set/],
    ];
    let p = port + 3;
    for (const [label, extra, want] of cases) {
      const { env } = baseEnv(`bad-${label.replace(/\W/g, '')}`, p);
      p += 1;
      const s = await start({ ...env, ...extra });
      try {
        const cfg = await fetch(`${s.base}/api/consent/config`).then((r) => r.json());
        check(`${label}: says which setting, reports no real transport, no key shown`, want.test(s.log()) && cfg.mail === 'dev-outbox' && !s.log().includes(FAKE_KEY), s.log().slice(-300));
      } finally { await stop(s); }
    }
  }

  fake.server.close();
  fs.rmSync(WORK, { recursive: true, force: true });
  console.log(`\n${failures ? `${failures} FAILED, ` : ''}${passed} passed.`);
  process.exit(failures ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
