/**
 * UI_V2 (docs/UI-V2.md), without a browser: with the flag off every touched page is the file on disk, byte for byte; with it on only the three additions appear;
 * pages outside the list are never changed; no existing file under public/ differs from the branch's base; every token pair passes its contrast minimum.
 *
 *   node scripts/ui-v2-test.js
 *
 * Starts its own servers on a temporary database, with no outside AI.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn, execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const BASE_COMMIT = '34c90a2'; // where this work started: main plus tutor-giraffe
const ui = require('../services/ui-v2');

let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log(`  ok  ${name}`); };
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

function contrast() {
  const css = fs.readFileSync(path.join(ROOT, 'public', 'css', 'ui2', 'tokens.css'), 'utf8');
  const blocks = css.split(':root[data-ui2][data-mode="dark"]');
  const read = (txt) => Object.fromEntries([...txt.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/g)].map((m) => [m[1], m[2]]));
  const light = read(blocks[0]);
  const dark = { ...light, ...read(blocks.slice(1).join(' ')) };
  const lum = (hex) => {
    const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const PAIRS = [['ink', 'page', 4.5], ['ink', 'card', 4.5], ['ink', 'well', 4.5], ['ink-2', 'page', 4.5], ['ink-2', 'card', 4.5], ['ink-2', 'well', 4.5], ['ink-3', 'page', 4.5], ['ink-3', 'card', 4.5], ['ink', 'sel', 4.5], ['on-action', 'action', 4.5], ['good', 'good-wash', 4.5], ['bad', 'bad-wash', 4.5], ['ink', 'good-wash', 4.5], ['ink', 'bad-wash', 4.5], ['ink-2', 'good-wash', 3], ['ink-2', 'bad-wash', 3], ['bar-fill', 'bar-track', 3], ['sel-line', 'card', 3], ['on-mark', 'good', 3], ['on-mark', 'bad', 3], ['focus', 'page', 3]];
  for (const [mode, set] of [['light', light], ['dark', dark]]) {
    for (const [fg, bg, min] of PAIRS) {
      const r = ratio(set[fg], set[bg]);
      assert(r >= min, `${mode}: ${fg} on ${bg} is ${r.toFixed(2)}, needs ${min}`);
    }
  }
}

async function withServer(flag, port, fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ui2-test-'));
  const env = { ...process.env, PORT: String(port), NODE_ENV: 'development', DB_FILE: path.join(tmp, 'db.json'), HOLDOUT_DIR: tmp, XKIRO_LEARNER_UNTIL: '2000-01-01T00:00:00Z', FACT_CHECK_ALL: '0', MUNITO_LEARNER: 'off', CORAL_LEARNER: 'off', GLADIA_LEARNER: 'off', LYCEUM_LEARNER: 'off', GONKA_LEARNER: 'off', GROKIFIED_LEARNER: 'off', UPLOAD_AUTOBUILD: 'off', SPANISH_WRITE_AHEAD: 'off' };
  if (flag === null) delete env.UI_V2; else env.UI_V2 = flag;
  const server = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: 'ignore' });
  try {
    for (let i = 0; i < 200; i++) { await delay(200); try { if ((await fetch(`http://localhost:${port}/api/health`)).ok) break; } catch { /* up soon */ } } // eslint-disable-line no-await-in-loop
    await fn(`http://localhost:${port}`);
  } finally {
    server.kill();
    await delay(300);
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* still closing */ }
  }
}
const fetchBytes = async (url) => { const r = await fetch(url, { redirect: 'manual' }); return { status: r.status, bytes: Buffer.from(await r.arrayBuffer()), type: r.headers.get('content-type') }; };

async function main() {
  ok('off unless UI_V2 says on', () => {
    const was = process.env.UI_V2;
    delete process.env.UI_V2; assert.strictEqual(ui.enabled(), false);
    process.env.UI_V2 = 'off'; assert.strictEqual(ui.enabled(), false);
    process.env.UI_V2 = '0'; assert.strictEqual(ui.enabled(), false);
    process.env.UI_V2 = 'on'; assert.strictEqual(ui.enabled(), true);
    if (was === undefined) delete process.env.UI_V2; else process.env.UI_V2 = was;
  });
  ok('off: the middleware only calls next, and reads nothing', () => {
    const was = process.env.UI_V2; delete process.env.UI_V2;
    let nexted = 0;
    const res = new Proxy({}, { get() { throw new Error('touched the response'); } });
    ui.middleware({ method: 'GET', path: '/dashboard' }, res, () => { nexted++; });
    assert.strictEqual(nexted, 1);
    if (was !== undefined) process.env.UI_V2 = was;
  });
  ok('inject adds the flag, the two stylesheets and the shell; Home also gets home.js before dashboard.js', () => {
    const page = '<!DOCTYPE html>\n<html lang="en">\n<head>\n</head>\n<body><script src="/js/app.js"></script><script src="/js/dashboard.js"></script></body>\n</html>';
    const out = ui.inject(page, 'dashboard');
    assert(out.includes('<html data-ui2="on" lang="en">'));
    assert(out.includes('/css/ui2/tokens.css') && out.includes('/css/ui2/app.css'));
    assert(out.indexOf('/js/app.js') < out.indexOf('/js/ui2/shell.js'));
    assert(out.indexOf('/js/ui2/shell.js') < out.indexOf('/js/ui2/home.js'));
    assert(out.indexOf('/js/ui2/home.js') < out.indexOf('/js/dashboard.js'));
    assert(!ui.inject(page, 'profile').includes('/js/ui2/home.js'));
  });
  ok('every listed page exists; public, admin and sealed pages are not listed', () => {
    for (const p of ui.PAGES) assert(fs.existsSync(path.join(ROOT, 'public', `${p}.html`)), p);
    for (const p of ['index', 'login', 'register', 'start', 'privacy', 'admin', 'cost-tracker', 'my-stats', 'recruit', 'spanish-check', 'spanish-listening', 'spanish-study', 'spanish-study-test', 'act-check', 'parent-form']) assert(!ui.PAGES.has(p), p);
    assert.strictEqual(ui.pageOf('/dashboard'), 'dashboard');
    assert.strictEqual(ui.pageOf('/dashboard.html'), 'dashboard');
    assert.strictEqual(ui.pageOf('/../server'), null);
    assert.strictEqual(ui.pageOf('/js/app.js'), null);
  });
  ok('no existing file under public/ or the sealed folders differs from the base commit: only new files', () => {
    const out = execSync(`git diff --name-status ${BASE_COMMIT} -- public spanish-check spanish-check-lc spanish-dictation routes`, { cwd: ROOT, encoding: 'utf8' }).trim();
    const changed = out ? out.split('\n').filter((l) => !l.startsWith('A')) : [];
    assert.deepStrictEqual(changed, []);
  });
  ok('app.css has no colour of its own: every one is a token', () => {
    const css = fs.readFileSync(path.join(ROOT, 'public', 'css', 'ui2', 'app.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.deepStrictEqual(css.match(/#[0-9a-fA-F]{3,8}\b(?![^{]*\{)|rgba?\(/g) || [], []);
  });
  ok('colour pairs pass their contrast minimum, light and dark', contrast);

  await withServer(null, 6841, async (base) => {
    const health = await fetchBytes(`${base}/api/health`);
    assert.strictEqual(health.status, 200, 'server up');
    for (const p of [...ui.PAGES, 'index', 'login', 'privacy']) {
      const r = await fetchBytes(`${base}/${p === 'index' ? '' : p}`); // eslint-disable-line no-await-in-loop
      const disk = fs.readFileSync(path.join(ROOT, 'public', `${p}.html`));
      assert.strictEqual(sha(r.bytes), sha(disk), `flag off: /${p} is the file on disk`);
      assert(!r.bytes.includes('data-ui2'), `flag off: /${p} has no flag`);
    }
    passed++;
    console.log(`  ok  flag off: ${ui.PAGES.size + 3} pages served byte for byte as the files on disk`);
  });

  await withServer('on', 6842, async (base) => {
    for (const p of ui.PAGES) {
      const r = await fetchBytes(`${base}/${p}`); // eslint-disable-line no-await-in-loop
      const disk = fs.readFileSync(path.join(ROOT, 'public', `${p}.html`), 'utf8');
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.bytes.toString('utf8'), ui.inject(disk, p), `flag on: /${p} is the file plus the additions`);
      assert(r.bytes.includes('data-ui2="on"'), p);
    }
    for (const p of ['login', 'privacy', 'spanish-check', 'spanish-listening']) {
      const r = await fetchBytes(`${base}/${p}`); // eslint-disable-line no-await-in-loop
      assert(!r.bytes.includes('data-ui2'), `flag on: /${p} is left alone`);
    }
    passed++;
    console.log('  ok  flag on: listed pages are the file plus the additions; public and sealed pages are left alone');
  });

  console.log(`\nui-v2-test: ${passed} passed`);
}

main().catch((err) => { console.error(err); process.exit(1); });
