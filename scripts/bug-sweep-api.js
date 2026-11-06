/**
 * Bug-sweep API pass: every GET route (read from routes/*.js and its mount in server.js) as each persona; reports 5xx,
 * non-JSON answers and slow replies (> 2 s). GETs only, plus the persona sign-ups. NOT part of `npm test`.
 *   node scripts/bug-sweep-api.js http://localhost:7471
 */
const fs = require('fs'); const path = require('path');
const BASE = (process.argv[2] || 'http://localhost:7471').replace(/\/$/, '');
const root = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const mounts = [];
for (const m of server.matchAll(/app\.use\('(\/api[^']*)',\s*require\('\.\/routes\/([a-z0-9/-]+)'\)(\.[a-z]+)?\)/g)) mounts.push({ prefix: m[1], file: m[2] });
const SKIP = /(spanish-check|spanish-listening|\/export|\/logout|stream|\/delete|\/sweep)/;
const routes = new Set();
for (const { prefix, file } of mounts) {
  const f = path.join(root, 'routes', file + '.js'); if (!fs.existsSync(f)) continue;
  for (const m of fs.readFileSync(f, 'utf8').matchAll(/(?:router|recruit)\.get\('([^']+)'/g)) {
    const p = (prefix + m[1]).replace(/\/$/, '').replace(/:[a-zA-Z]+/g, '1');
    if (!SKIP.test(p)) routes.add(p);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function login(kind) {
  const stamp = Date.now().toString(36); const year = new Date().getFullYear();
  const body = { password: 'Walk-test-pw-9', country: 'US', birth_month: 6, display_name: 'Sweep ' + kind };
  if (kind === 'adult') Object.assign(body, { email: `sweepapi-a-${stamp}@example.com`, birth_year: 1990 });
  if (kind === 'teen') Object.assign(body, { email: `sweepapi-t-${stamp}@example.com`, birth_year: year - 15 });
  if (kind === 'child') Object.assign(body, { username: `sweepapik${stamp}`, parent_email: `sp-${stamp}@example.com`, birth_year: year - 10 });
  if (kind === 'admin') Object.assign(body, { email: 'walk-admin@example.com', birth_year: 1990 });
  if (kind === 'anon') return '';
  let r = await fetch(BASE + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE }, body: JSON.stringify(body) });
  if (r.status === 409) r = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE }, body: JSON.stringify({ email: body.email, password: body.password }) });
  const sc = r.headers.get('set-cookie'); if (!sc) throw new Error(kind + ' ' + r.status);
  return sc.split(';')[0];
}
(async () => {
  console.log(routes.size, 'GET routes');
  let bad = 0;
  for (const kind of ['anon', 'adult', 'teen', 'child', 'admin']) {
    const cookie = await login(kind);
    for (const p of routes) {
      const t = Date.now();
      let r; try { r = await fetch(BASE + p, { headers: { Cookie: cookie, Origin: BASE }, signal: AbortSignal.timeout(30000) }); } catch (e) { console.log(`[${kind}] ${p} NETFAIL ${e.message}`); bad++; continue; }
      const ms = Date.now() - t; const ct = r.headers.get('content-type') || ''; const txt = await r.text();
      const notes = [];
      if (r.status >= 500) notes.push('5xx ' + txt.slice(0, 150));
      if (r.status < 500 && /\/api\//.test(p) && !/json|octet|audio|image|text\/(plain|csv|calendar)|zip|pdf/.test(ct)) notes.push('non-json ' + ct);
      if (ms > 2000) notes.push('slow ' + ms + 'ms');
      if (notes.length) { bad++; console.log(`[${kind}] GET ${p} -> ${r.status} ${notes.join(' | ')}`); }
    }
  }
  console.log('done, flagged', bad);
})();
