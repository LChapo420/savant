/**
 * PWA (S7): manifest, icons, offline page and the service worker's rules.
 *
 *   node scripts/pwa-test.js
 *
 * The service worker runs in a vm with a fake cache and fetch: it must serve /offline.html when a page
 * is opened with no network, and must never touch /api, a non-GET request or another origin.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const http = require('http');
const { spawn } = require('child_process');

const PUB = path.join(__dirname, '..', 'public');
let failures = 0;
function check(label, ok, detail) {
  if (ok) { console.log(`  ok   ${label}`); return; }
  failures++;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 300)}`}`);
}

function pngSize(file) {
  const b = fs.readFileSync(file);
  if (b.readUInt32BE(0) !== 0x89504e47) return null;
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

// --- manifest and icons
const manifest = JSON.parse(fs.readFileSync(path.join(PUB, 'manifest.webmanifest'), 'utf8'));
check('manifest has name, start_url, scope, standalone display', manifest.name && manifest.start_url && manifest.scope === '/' && manifest.display === 'standalone');
for (const icon of manifest.icons) {
  const file = path.join(PUB, icon.src);
  check(`icon exists: ${icon.src}`, fs.existsSync(file));
  if (icon.type === 'image/png') {
    const [w, h] = pngSize(file) || [0, 0];
    check(`icon size matches: ${icon.src}`, icon.sizes === `${w}x${h}`, [w, h]);
  }
}
check('has 192 and 512 icons plus a maskable one',
  ['192x192', '512x512'].every((s) => manifest.icons.some((i) => i.sizes === s && i.purpose === 'any'))
  && manifest.icons.some((i) => i.purpose === 'maskable'));
for (const s of manifest.shortcuts || []) {
  check(`shortcut page exists: ${s.url}`, fs.existsSync(path.join(PUB, `${s.url.replace(/^\//, '')}.html`)));
}
check('index.html links the manifest', /rel="manifest"/.test(fs.readFileSync(path.join(PUB, 'index.html'), 'utf8')));
check('app.js links the manifest and registers /sw.js', /manifest\.webmanifest/.test(fs.readFileSync(path.join(PUB, 'js', 'app.js'), 'utf8'))
  && /register\('\/sw\.js'/.test(fs.readFileSync(path.join(PUB, 'js', 'app.js'), 'utf8')));
const offline = fs.readFileSync(path.join(PUB, 'offline.html'), 'utf8');
check('offline page has no inline script (CSP)', !/<script(?![^>]*\bsrc=)/i.test(offline));

// --- service worker
const swSource = fs.readFileSync(path.join(PUB, 'sw.js'), 'utf8');
const listeners = {};
const store = new Map();
let online = true;
const fakeCaches = {
  open: async () => ({
    addAll: async (urls) => { for (const u of urls) store.set(new URL(u, 'https://x.test').pathname, 'cached'); },
    put: async (req) => { store.set(new URL(req.url).pathname, 'cached'); },
  }),
  keys: async () => ['old-cache', 'savant-shell-v1'],
  delete: async (k) => { deleted.push(k); },
  match: async (req) => {
    const p = typeof req === 'string' ? req : new URL(req.url).pathname;
    return store.has(p) ? { cachedFor: p } : undefined;
  },
};
const deleted = [];
const sandbox = {
  self: { location: { origin: 'https://x.test' }, addEventListener: (t, f) => { listeners[t] = f; }, skipWaiting: () => {}, clients: { claim: async () => {} } },
  caches: fakeCaches,
  URL,
  Response: { error: () => ({ error: true }) },
  fetch: async (req) => { if (!online) throw new Error('offline'); return { ok: true, clone() { return this; }, from: req.url }; },
};
vm.runInNewContext(swSource, sandbox);

function fire(url, { method = 'GET', mode = 'cors' } = {}) {
  let handled = null;
  listeners.fetch({ request: { url, method, mode }, respondWith: (p) => { handled = p; } });
  return handled;
}

(async () => {
  let waited; listeners.install({ waitUntil: (p) => { waited = p; } }); await waited;
  const shell = (swSource.match(/const SHELL = \[(.*?)\]/s) || [, ''])[1].match(/'([^']+)'/g).map((s) => s.slice(1, -1));
  check('every shell file exists on disk', shell.every((f) => fs.existsSync(path.join(PUB, f))), shell.filter((f) => !fs.existsSync(path.join(PUB, f))));
  check('install caches the offline page', store.has('/offline.html'));
  listeners.activate({ waitUntil: (p) => { waited = p; } }); await waited;
  check('activate removes old caches only', deleted.length === 1 && deleted[0] === 'old-cache', deleted);

  check('API requests are never handled', fire('https://x.test/api/me') === null);
  check('POST is never handled', fire('https://x.test/css/style.css', { method: 'POST' }) === null);
  check('another origin is never handled', fire('https://evil.test/css/style.css') === null);
  check('spanish media is never handled', fire('https://x.test/spanish-media/a.mp3') === null);
  check('a plain page fetch is left alone', fire('https://x.test/data.json') === null);

  online = false;
  const nav = await fire('https://x.test/profile', { mode: 'navigate' });
  check('offline navigation shows the offline page', nav && nav.cachedFor === '/offline.html', nav);
  online = true;
  const navOn = await fire('https://x.test/profile', { mode: 'navigate' });
  check('online navigation goes to the network', navOn && navOn.from === 'https://x.test/profile');

  await fire('https://x.test/js/app.js'); await new Promise((r) => setImmediate(r));
  online = false;
  const asset = await fire('https://x.test/js/app.js');
  check('static asset falls back to its stored copy offline', asset && asset.cachedFor === '/js/app.js', asset);
  const missing = await fire('https://x.test/js/never-seen.js');
  check('an unseen asset offline fails cleanly', missing && missing.error === true, missing);
  check('worker source never stores /api', !/put\([^)]*api/i.test(swSource) && /startsWith\('\/api\/'\)/.test(swSource));

  // --- served headers
  const port = 3900 + (process.pid % 90);
  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(port), NODE_ENV: 'test', DB_FILE: path.join(os.tmpdir(), `pwa-test-${process.pid}.json`) },
    stdio: 'ignore',
  });
  const get = (p) => new Promise((resolve, reject) => {
    http.get({ port, path: p, host: '127.0.0.1' }, (res) => { res.resume(); resolve(res); }).on('error', reject);
  });
  let res = null;
  for (let i = 0; i < 40 && !res; i++) {
    try { res = await get('/sw.js'); } catch { await new Promise((r) => setTimeout(r, 250)); }
  }
  if (!res) check('server started', false);
  else {
    check('/sw.js served with no-cache and root scope', res.statusCode === 200 && res.headers['cache-control'] === 'no-cache' && res.headers['service-worker-allowed'] === '/', res.headers);
    const m = await get('/manifest.webmanifest');
    check('/manifest.webmanifest has the manifest type', m.statusCode === 200 && /manifest\+json/.test(m.headers['content-type']), m.headers);
    const o = await get('/offline.html');
    check('/offline.html is served', o.statusCode === 200);
    const csp = res.headers['content-security-policy'] || '';
    check('CSP lets the worker load from self', /default-src 'self'/.test(csp) && !/worker-src/.test(csp));
  }
  child.kill();
  try { fs.unlinkSync(path.join(os.tmpdir(), `pwa-test-${process.pid}.json`)); } catch { /* none */ }

  console.log(failures ? `\n${failures} check(s) failed.` : '\nAll PWA checks passed.');
  process.exit(failures ? 1 : 0);
})();
