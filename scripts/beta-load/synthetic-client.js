#!/usr/bin/env node
/**
 * One synthetic account on a test copy: sign up, sign in, ask who it is. Prints one line of statuses, never a row. For the drills in docs/SQLITE-SWITCH.md.
 *   node scripts/beta-load/synthetic-client.js <base url> signup|login|me <email ending @example.test> <cookie file>
 * It refuses any other kind of address, so it cannot sign in as a real learner.
 */
const fs = require('fs');

const [base, action, email, jarFile] = process.argv.slice(2);
if (!/@example\.test$/.test(email || '')) { console.error('synthetic accounts only: the address must end in @example.test'); process.exit(2); }
const password = 'synthetic-drill-only-Aa1!';
let cookie = jarFile && fs.existsSync(jarFile) ? fs.readFileSync(jarFile, 'utf8') : '';

async function call(method, url, body) {
  const res = await fetch(`${base}${url}`, { method, headers: { 'X-Forwarded-For': '10.9.9.8', 'X-Forwarded-Proto': 'https', Origin: base, ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const sc = res.headers.get('set-cookie');
  if (sc) { cookie = sc.split(';')[0]; if (jarFile) fs.writeFileSync(jarFile, cookie, { mode: 0o600 }); }
  let json = null; try { json = await res.json(); } catch { /* a page */ }
  return { status: res.status, json };
}

(async () => {
  let r;
  if (action === 'signup') {
    await call('POST', '/api/consent/age', { birth_year: 1990, birth_month: 1, country: 'US' });
    r = await call('POST', '/api/auth/register', { email, password, display_name: 'Drill Test' });
    console.log(JSON.stringify({ action, status: r.status, id: r.json && r.json.user && r.json.user.id }));
    process.exit(r.status === 201 ? 0 : 1);
  } else if (action === 'login') {
    r = await call('POST', '/api/auth/login', { email, password });
    console.log(JSON.stringify({ action, status: r.status, id: r.json && r.json.user && r.json.user.id }));
    process.exit(r.status === 200 ? 0 : 1);
  } else {
    r = await call('GET', '/api/auth/me');
    const mine = r.json && r.json.user && r.json.user.email === email;
    console.log(JSON.stringify({ action, status: r.status, signed_in_as_this_account: !!mine }));
    process.exit(mine ? 0 : 1);
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
