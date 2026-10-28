#!/usr/bin/env node
/**
 * Smoke test for the beta at beta.savantedu.com (deploy/beta/README.md, step 12).
 * Read-only: it signs in only when given the demo login, and never creates an account.
 *
 *   node deploy/beta/smoke-test.js --url https://beta.savantedu.com
 *   node deploy/beta/smoke-test.js --url https://beta.savantedu.com --login-file /srv/savant-beta/demo-account.local.txt
 *   node deploy/beta/smoke-test.js --url ... --gate open     # if you turned the invite gate off
 *   node deploy/beta/smoke-test.js --url http://127.0.0.1:6767   # on the VM: the app itself, without Caddy
 *
 * Needs Node 18 or later (for fetch); runs on the VM or on your own computer.
 * Exit 0 when every check passes, 1 otherwise. The demo password is never printed.
 */
const fs = require('fs');

const argv = process.argv.slice(2);
function arg(name, fallback = null) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
}
const URL_ARG = String(arg('--url', 'https://beta.savantedu.com')).replace(/\/+$/, '');
const LOGIN_FILE = arg('--login-file');
const GATE = arg('--gate', 'invite');
const base = new URL(URL_ARG);
const https = base.protocol === 'https:';
// On the VM, --url http://127.0.0.1:6767 talks to the app behind Caddy's back. The
// app then needs to be told what Caddy would tell it (the visitor used https), or
// it will not hand out its secure session cookie.
const direct = !https && ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname);
const VIA = direct ? { 'X-Forwarded-Proto': 'https' } : {};

let failed = 0;
let passed = 0;
let skipped = 0;
function check(name, ok, detail) {
  if (ok) { passed++; console.log(`  ok   ${name}`); return; }
  failed++;
  console.log(`  FAIL ${name}${detail !== undefined ? `\n       ${String(detail).slice(0, 300)}` : ''}`);
}
function skip(name, why) { skipped++; console.log(`  skip ${name} (${why})`); }

async function get(path, opts = {}) {
  const res = await fetch(URL_ARG + path, { redirect: 'manual', signal: AbortSignal.timeout(15000), ...opts, headers: { ...VIA, ...(opts.headers || {}) } });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* html or text */ }
  return { status: res.status, headers: res.headers, text, json };
}
const post = (path, body, headers = {}) => get(path, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: URL_ARG, ...headers },
  body: JSON.stringify(body),
});

(async () => {
  console.log(`Smoke test: ${URL_ARG}`);

  console.log('\nHealth');
  let h;
  try { h = await get('/healthz'); } catch (err) {
    check('the app answers at all (DNS, HTTPS certificate, Caddy, the service)', false, err.cause ? `${err.message}: ${err.cause.code || err.cause.message}` : err.message);
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(1);
  }
  check(`GET /healthz is 200 {"ok":true}${https ? ' over a valid HTTPS certificate' : ''}`, h.status === 200 && h.json && h.json.ok === true, `${h.status} ${h.text.slice(0, 100)}`);
  check('/healthz says nothing else (it is public)', h.json && Object.keys(h.json).join() === 'ok', h.text);
  const api = await get('/api/health');
  check('/api/health is trimmed to {"ok":true} for visitors (production)', api.status === 200 && api.json && api.json.ok === true && !('providers' in api.json), api.text.slice(0, 200));

  console.log('\nHTTPS');
  if (https) {
    const plain = await fetch(`http://${base.host}/healthz`, { redirect: 'manual', signal: AbortSignal.timeout(15000) }).catch((err) => ({ status: 0, err }));
    const loc = plain.headers ? plain.headers.get('location') || '' : '';
    check('plain http redirects to https', [301, 302, 307, 308].includes(plain.status) && loc.startsWith(`https://${base.host}`), `${plain.status} ${loc}`);
    check('HSTS is sent', /max-age=\d+/.test(h.headers.get('strict-transport-security') || ''), h.headers.get('strict-transport-security'));
  } else {
    skip('http to https redirect and HSTS', 'the URL is not https');
  }

  console.log('\nPages');
  const home = await get('/');
  check('/ serves the app page', home.status === 200 && /<html/i.test(home.text));
  const login = await get('/login');
  check('/login serves the sign-in page', login.status === 200 && /<html/i.test(login.text));
  check('security headers are on (CSP, nosniff)', !!home.headers.get('content-security-policy') && home.headers.get('x-content-type-options') === 'nosniff');

  console.log('\nNothing private is reachable');
  for (const [path, marker] of [['/.env', 'SESSION_SECRET'], ['/data/db.json', '"_counters"'], ['/server.js', "require('express')"],
    ['/savant-beta.env', 'SESSION_SECRET'], ['/data/beta-invites.json', 'code_hash'], ['/logs/errors.jsonl', 'fingerprint']]) {
    const r = await get(path);
    check(`${path} does not serve the file`, !r.text.includes(marker), `${r.status}`);
  }
  const admin = await get('/api/admin/metrics');
  check('/api/admin/metrics needs a signed-in admin (401 signed out)', admin.status === 401, admin.status);
  const ops = await get('/api/ops/status');
  check('/api/ops/status is hidden from visitors', [401, 404].includes(ops.status), ops.status);

  console.log('\nBeta gate');
  if (GATE === 'invite') {
    // An invalid invite code is refused before any account is made.
    const reg = await post('/api/auth/register', { email: 'smoke-test@savant-smoke.test', password: 'not-used-smoke-1', display_name: 'Smoke', invite_code: 'XXXXX-XXXXX' });
    check('sign-up without a valid invite is refused (403)', reg.status === 403 && reg.json && reg.json.beta, `${reg.status} ${reg.text.slice(0, 160)}`);
  } else {
    skip('invite gate', '--gate open');
  }

  console.log('\nDemo account');
  if (!LOGIN_FILE) {
    skip('demo sign-in', 'no --login-file');
  } else {
    const text = fs.readFileSync(LOGIN_FILE, 'utf8');
    const email = (text.match(/^email: (.+)$/m) || [])[1];
    const password = (text.match(/^password: (.+)$/m) || [])[1];
    check('the login file has an email and a password', !!email && !!password);
    const res = await post('/api/auth/login', { email, password });
    check('the demo account signs in (and gets past the invite gate)', res.status === 200, `${res.status} ${res.text.slice(0, 160)}`);
    const cookie = (res.headers.get('set-cookie') || '').split(';')[0];
    if (res.status === 200 && cookie) {
      const en = await get('/api/enrollments', { headers: { Cookie: cookie } });
      const list = en.json && (Array.isArray(en.json) ? en.json : en.json.enrollments || []);
      check('signed in: its two subjects are there', en.status === 200 && Array.isArray(list) && list.length >= 2, `${en.status}`);
      const mem = await get('/api/tutor/memory', { headers: { Cookie: cookie } });
      check('signed in: the tutor remembers its earlier conversation', mem.status === 200 && mem.json && (mem.json.recent || []).length >= 2, `${mem.status}`);
      await post('/api/auth/logout', {}, { Cookie: cookie });
    }
  }

  console.log(`\n${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}`);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.log(`  FAIL the smoke test stopped: ${err.message}`);
  process.exit(1);
});
