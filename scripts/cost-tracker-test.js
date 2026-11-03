/**
 * The cost and performance tracker (services/cost-tracker.js, routes/cost-tracker.js, public/cost-tracker.html,
 * public/js/cost-beacon.js, docs/COST-TRACKER.md).
 *
 *   node scripts/cost-tracker-test.js
 *
 * Four parts, all on scratch copies (data/db.json is never opened, no model is called, no key is read):
 *   1. cost maths: stub providers through the real services/ai.js (actual vs list price, retry, failure, foreground flag, child)
 *   2. roll-ups: a hand-made event file with known numbers; sessions, user-days, percentiles and the tier projection are exact
 *   3. a short fake session through the REAL routes of server.js on a copy of the fixture db: requests, the beacon, an upload,
 *      the admin API and page, the 404 for everyone else, and the page script rendering the real JSON
 *   4. overhead: mean ms per request of the tracker's own code, and server-level request time with the tracker on and off
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'savant-costtracker-test-'));
const FIXTURE = path.join(__dirname, 'fixtures', 'test-db.json');
const LOCAL_DB = path.join(SCRATCH, 'local-db.json');
const TRACK_A = path.join(SCRATCH, 'track-a'); // part 1 (this process)
const TRACK_B = path.join(SCRATCH, 'track-b'); // part 2 (hand-made events)
const TRACK_C = path.join(SCRATCH, 'track-c'); // part 3 (the server child)
fs.copyFileSync(FIXTURE, LOCAL_DB);
process.env.DB_FILE = LOCAL_DB;
process.env.COST_TRACKER_DIR = TRACK_A;
process.env.AI_POOL = '0';
process.env.OLLAMA_ENABLED = '0';
process.env.COST_FIXED_MONTHLY_USD = '100';
delete process.env.COST_TRACKER;

let failed = 0;
let passed = 0;
function check(name, ok, detail) {
  if (ok) { passed++; console.log(`  ok   ${name}`); return; }
  failed++;
  console.log(`  FAIL ${name}${detail !== undefined ? `\n       ${String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 700)}` : ''}`);
}
const near = (a, b, eps = 1e-6) => a !== null && a !== undefined && Math.abs(a - b) <= eps;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const db = require('../config/db');
const tracker = require('../services/cost-tracker');
const providers = require('../services/providers');
const ai = require('../services/ai');

const NOW = Date.parse('2026-11-02T20:00:00Z');

async function part1() {
  console.log('\n1. Cost maths through services/ai.js (stub providers)');
  const stub = (name, { cents = 0, model, fail = false, delay = 0, tin = 1000, tout = 500 }) => ({
    name,
    isEnabled: () => true,
    costCents: () => cents,
    describeError: (e) => e.message,
    modelFor: () => model,
    async structured() {
      if (delay) await sleep(delay);
      if (fail) throw new Error('boom');
      return { data: { ok: 1 }, usage: { input_tokens: tin, output_tokens: tout }, model };
    },
  });
  const use = (...list) => { providers.chain = () => list; providers.isOutside = () => false; };
  const events = () => { tracker.flushSync(); return fs.readdirSync(TRACK_A).flatMap((f) => fs.readFileSync(path.join(TRACK_A, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))).filter((e) => e.t === 'ai'); };

  use(stub('standard_compute', { cents: 1.5, model: 'anthropic/claude-sonnet-5.5' }));
  await ai.structured({ role: 'fast', task: 'fact_verify', system: 's', user: 'u', userId: 4001 });
  let e = events().pop();
  check('metered call: actual cost from the provider ($0.015)', near(e.usd, 0.015) && e.basis === 'metered', e);
  check('list price from the Anthropic ledger prices (Sonnet 5.5: 1000 in x $2 + 500 out x $10 per Mtok = $0.007)', near(e.list, 0.007), e);
  check('it records tokens, provider, model, task and role, and a latency', e.in === 1000 && e.out === 500 && e.prov === 'standard_compute' && e.task === 'fact_verify' && e.role === 'fast' && e.ms >= 0, e);
  check('it carries no text: only the listed fields', Object.keys(e).sort().join() === ['basis', 'child', 'fg', 'hedged', 'in', 'list', 'model', 'ms', 'ok', 'out', 'prov', 'role', 'task', 'tries', 't', 'ts', 'u', 'usd', 'src'].sort().join(), Object.keys(e));
  check('a call from outside the app server is marked as a test (src), so it is never counted as any account use', e.src === 'test' || e.src === 'script', e.src);

  use(stub('nvidia', { model: 'qwen/qwen3.5-122b' }));
  await ai.structured({ role: 'deep', task: 'lesson_write', system: 's', user: 'u', userId: 4001 });
  e = events().pop();
  check('free provider: actual $0, list = free-tier equivalent (1000 x 0.30 + 500 x 1.20 per Mtok = $0.0009)', e.usd === 0 && e.basis === 'free' && near(e.list, 0.0009), e);

  use(stub('modelflare', { model: 'gpt-6.1-sol' }));
  await ai.structured({ role: 'deep', task: 'lesson_write', system: 's', user: 'u', userId: 4001 });
  e = events().pop();
  check('Modelflare reports no cost: actual is the list estimate, flagged "estimated" (1000 x 1 + 500 x 4 = $0.003)', e.basis === 'estimated' && near(e.usd, 0.003) && near(e.list, 0.003), e);

  use(stub('nvidia', { model: 'a', fail: true }), stub('standard_compute', { cents: 0.2, model: 'anthropic/claude-sonnet-5.5' }));
  const before = events().length;
  await ai.structured({ role: 'fast', task: 'coach_turn', system: 's', user: 'u', userId: 4001 });
  const got = events().slice(before);
  check('a failed first provider is logged as ok:0 and the retry as tries:2', got.length === 2 && got[0].ok === 0 && got[0].tries === 1 && got[1].ok === 1 && got[1].tries === 2, got);

  // Foreground = finished while the request that started it was still open.
  const fakeReq = () => ({ path: '/api/x', method: 'POST', baseUrl: '/api', route: { path: '/x' }, originalUrl: '/api/x', user: { id: 4001 } });
  const fakeRes = () => Object.assign(new EventEmitter(), { statusCode: 200, writableFinished: true, write() { return true; }, getHeader() { return ''; } });
  use(stub('nvidia', { model: 'a', delay: 5 }));
  let res = fakeRes();
  let pending;
  tracker.middleware(fakeReq(), res, () => { pending = ai.structured({ role: 'fast', task: 'tutor_explain', system: 's', user: 'u', userId: 4001 }); });
  await pending; res.emit('close');
  const fg = events().filter((x) => x.task === 'tutor_explain').pop();
  use(stub('nvidia', { model: 'a', delay: 40 }));
  res = fakeRes();
  tracker.middleware(fakeReq(), res, () => { pending = ai.structured({ role: 'deep', task: 'lesson_write', system: 's', user: 'u', userId: 4001 }); });
  res.emit('close'); await pending;
  const bg = events().filter((x) => x.task === 'lesson_write').pop();
  check('a call that finishes inside its open request is foreground (fg 1); one that outlives it is background (fg 0)', fg.fg === 1 && bg.fg === 0, [fg.fg, bg.fg]);

  // Under-13: no user id on the event.
  const kid = db.insert('users', { email: null, display_name: 'Kid', age_check: { under_13: true } });
  use(stub('nvidia', { model: 'a' }));
  await ai.structured({ role: 'fast', task: 'coach_turn', system: 's', user: 'u', userId: kid.id });
  e = events().pop();
  check('under-13: the event has no user id (child:1), only its aggregate cost', e.u === null && e.child === 1, e);
  const sum = tracker.summarize({ days: 1, now: Date.now() });
  check('the child call counts in the totals but no user row exists for it', sum.window.child_calls === 1 && !sum.users.some((u) => u.id === kid.id), sum.window);
  check('features: "fact check (Sonnet)", "lesson write (write-ahead / background)" and "tutor" are separate rows',
    sum.features.some((f) => f.key === 'fact check (Sonnet)') && sum.features.some((f) => f.key === 'lesson write (write-ahead / background)') && sum.features.some((f) => f.key === 'tutor'), sum.features.map((f) => f.key));
}

function part2() {
  console.log('\n2. Roll-ups on a hand-made event file (exact numbers)');
  fs.mkdirSync(TRACK_B, { recursive: true });
  const day = '2026-11-02';
  const at = (min) => Date.parse(`${day}T18:00:00Z`) + min * 60000;
  const req = (min, extra) => ({ t: 'req', ts: at(min), u: 11, child: 0, m: 'GET', route: '/api/x', st: 200, ms: 10, ...extra });
  const evs = [
    req(0, { route: '/api/lessons/:track/:grade/:level', sub: 'math', lvl: 'ready', ms: 20 }),
    req(2, { m: 'POST', route: '/api/lessons/:track/:grade/:level/finish', sub: 'math' }),
    req(3, { m: 'POST', route: '/api/materials/paste', st: 201 }),
    req(4, { m: 'POST', route: '/api/lessons/:track/:grade/:level/block-finish', sub: 'english' }),
    req(30), req(31),
    { t: 'ai', ts: at(1), u: 11, child: 0, task: 'lesson_write', role: 'deep', prov: 'nvidia', model: 'm', in: 100, out: 50, ms: 4000, ok: 1, tries: 1, hedged: 0, usd: 0.01, list: 0.05, basis: 'metered', fg: 1 },
    { t: 'ai', ts: at(3), u: 11, child: 0, task: 'fact_verify', role: 'deep', prov: 'nvidia', model: 'm', in: 100, out: 50, ms: 6000, ok: 1, tries: 1, hedged: 0, usd: 0.02, list: 0.03, basis: 'metered', fg: 0 },
    { t: 'ai', ts: at(5), u: null, child: 1, task: 'coach_turn', role: 'fast', prov: 'nvidia', model: 'm', in: 10, out: 5, ms: 900, ok: 1, tries: 1, hedged: 0, usd: 0, list: 0.001, basis: 'free', fg: 1 },
    ...[10, 20, 30, 40, 100].map((ms, i) => ({ t: 'req', ts: at(40 + i), u: null, child: 0, m: 'GET', route: '/api/slow', st: 200, ms })),
    { t: 'req', ts: at(50), u: null, child: 0, m: 'POST', route: '/api/tutor/dock', st: 200, ms: 900, ttft: 250 },
    { t: 'req', ts: at(51), u: null, child: 0, m: 'POST', route: '/api/tutor/dock', st: 200, ms: 900, ttft: 350 },
    { t: 'lv', ts: at(1), u: 11, child: 0, ms: 300, waited: 0 }, { t: 'lv', ts: at(2), u: 11, child: 0, ms: 500, waited: 0 }, { t: 'lv', ts: at(3), u: 11, child: 0, ms: 4000, waited: 1 },
    { t: 'srv', ts: at(1), cpu: 10, rss: 100 * 1048576, heap: 1, loop_p99: 12, db_bytes: 2 * 1048576, load1: 0.5 },
    { t: 'srv', ts: at(2), cpu: 30, rss: 150 * 1048576, heap: 1, loop_p99: 30, db_bytes: 3 * 1048576, load1: 0.5 },
  ];
  fs.writeFileSync(path.join(TRACK_B, `events-${day}.jsonl`), `${evs.map((x) => JSON.stringify(x)).join('\n')}\n{"torn":`);
  process.env.COST_TRACKER_DIR = TRACK_B;
  const s = tracker.summarize({ days: 1, now: NOW });
  const mine = s.sessions.filter((x) => x.id === 11).sort((a, b) => a.start.localeCompare(b.start));
  check('a 26 minute gap splits user 11 into two sessions; a torn last line is ignored', mine.length === 2, s.sessions);
  const s1 = mine[0];
  check('session 1: 4 minutes long, active 4 (gaps of up to 5 min count fully)', s1.minutes === 4 && s1.active_min === 4, s1);
  check('session 1: 2 levels (finish + block-finish), subjects math+english, 1 upload', s1.levels === 2 && s1.subjects.sort().join() === 'english,math' && s1.uploads === 1, s1);
  check('session 1: its 2 AI calls, actual $0.03, list $0.08, $1.20 per active hour (list)', s1.ai_calls === 2 && near(s1.actual_usd, 0.03) && near(s1.list_usd, 0.08) && near(s1.list_usd_per_active_hr, 1.2), s1);
  const s2 = mine[1];
  check('session 2: a 1 minute session, no AI', s2.minutes === 1 && s2.ai_calls === 0 && s2.levels === 0, s2);
  check('window totals include the child call without a user row', s.window.ai_calls === 3 && near(s.window.list_usd, 0.081) && s.window.child_calls === 1 && s.users.length === 1 && s.users[0].id === 11, [s.window, s.users]);
  const f = Object.fromEntries(s.features.map((x) => [x.key, x]));
  check('features: on-demand lesson write $0.05 list (1 waiting), fact check (free) $0.03 (0 waiting, 1 background)',
    f['lesson write (on demand)'] && near(f['lesson write (on demand)'].list_usd, 0.05) && f['lesson write (on demand)'].foreground === 1
    && f['fact check (free)'] && near(f['fact check (free)'].list_usd, 0.03) && f['fact check (free)'].background === 1 && s.features[0].key === 'lesson write (on demand)', s.features);
  const slow = s.routes.find((r) => r.route === 'GET /api/slow');
  check('slowest routes: sorted by p95 (dock 900 ms first); /api/slow has p50 30 ms and p95 88 ms', slow && slow.n === 5 && slow.p50_ms === 30 && slow.p95_ms === 88 && s.routes[0].route === 'POST /api/tutor/dock' && s.routes[1].route === 'GET /api/slow', s.routes);
  const L = s.loads;
  check('level open (page): 3 opens, 2 ready (p50 400 ms), 1 waited (4000 ms), p50 500 ms', L.level_open_client.n === 3 && L.level_open_client.ready_n === 2 && L.level_open_client.ready_p50_ms === 400
    && L.level_open_client.waited_n === 1 && L.level_open_client.waited_p50_ms === 4000 && L.level_open_client.p50_ms === 500, L.level_open_client);
  check('level open (server): the one level GET was ready', L.level_open_server.n === 1 && L.level_open_server.ready_n === 1, L.level_open_server);
  check('tutor time to first token: p50 300 ms', L.tutor_first_token.n === 2 && L.tutor_first_token.p50_ms === 300, L.tutor_first_token);
  check('server: CPU p50 20%, RSS max 150 MB, db 3 MB, loop delay 30 ms', s.server.cpu_p50_pct === 20 && s.server.rss_max_mb === 150 && s.server.db_mb === 3 && s.server.loop_p99_max_ms === 30, s.server);
  const P = s.projection;
  check('projection: 1 user-day with 5 active min and $0.08 list = $0.96 per active hour', P.basis_user_days === 1 && near(P.cost_per_active_hour.list_p50, 0.96) && near(P.cost_per_active_hour.list_p95, 0.96), P);
  const hr = Object.fromEntries(P.tiers.map((r) => [r.hours_per_day, r]));
  check('projection: 30 min = $14.40, 1 h = $28.80, 2 h = $57.60 per user-month (list)', near(hr[0.5].list_p50, 14.4) && near(hr[1].list_p50, 28.8) && near(hr[2].list_p50, 57.6), P.tiers);
  const u10 = hr[1].by_users.find((x) => x.users === 10); const u1000 = hr[1].by_users.find((x) => x.users === 1000);
  check('projection: a $100 fixed cost is $10 per user at 10 users and $0.10 at 1,000 (1 h/day list p50 $38.80 and $28.90)', u10.fixed_share === 10 && u10.list_p50 === 38.8 && u1000.fixed_share === 0.1 && near(u1000.list_p50, 28.9), [u10, u1000]);
  check('the one-user filter keeps only that account (and drops the child row)', tracker.summarize({ days: 1, now: NOW, user: 11 }).window.ai_calls === 2);
  process.env.COST_TRACKER_DIR = TRACK_A;
}

function client(base) {
  let cookie = '';
  async function call(method, url, body) {
    const res = await fetch(base + url, {
      method, redirect: 'manual',
      headers: { Origin: base, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* html */ }
    return { status: res.status, json, text };
  }
  return { get: (u) => call('GET', u), post: (u, b) => call('POST', u, b || {}) };
}

async function startServer(trackDir, extraEnv = {}) {
  const copy = path.join(SCRATCH, `server-db-${crypto.randomBytes(3).toString('hex')}.json`);
  fs.copyFileSync(FIXTURE, copy);
  const port = 20000 + Math.floor(Math.random() * 20000);
  const env = {
    ...process.env, NODE_ENV: 'test', PORT: String(port), DB_FILE: copy, COST_TRACKER_DIR: trackDir, CONSENT_SWEEP: 'off',
    MAIL_OUTBOX_DIR: path.join(SCRATCH, 'outbox'), ADMIN_EMAILS: 'tracker-admin@gmail.com', OWNER_EMAIL: 'founder@gmail.com',
    SESSION_SECRET: crypto.randomBytes(32).toString('hex'), ...extraEnv,
  };
  for (const k of ['NVIDIA_API_KEY', 'ANTHROPIC_API_KEY', 'FACT_CHECK_ANTHROPIC_KEY', 'OPENROUTER_API_KEY', 'OPENROUTER_DEEPSEEK_API_KEY',
    'OPENROUTER_GLM_API_KEY', 'OPENROUTER_GPT_SOL_API_KEY', 'MIMO_API_KEY', 'GEMINI_API_KEY', 'MODELFLARE_API_KEY', 'XKIRO_API_KEY',
    'UNOROUTER_API_KEY', 'STANDARD_COMPUTE_API_KEY', 'JEV_API_KEY']) env[k] = '';
  delete env.DB_READONLY; delete env.BETA_GATE;
  const child = spawn(process.execPath, [path.join(ROOT, 'server.js')], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', (b) => { log += b; });
  child.stderr.on('data', (b) => { log += b; });
  const base = `http://127.0.0.1:${port}`;
  let up = false;
  for (let i = 0; i < 240 && !up; i++) {
    try { up = (await fetch(`${base}/api/health`)).ok; } catch { /* not yet */ }
    if (!up) await sleep(250);
    if (child.exitCode !== null) break;
  }
  return { child, base, up, log: () => log };
}

async function part3() {
  console.log('\n3. A fake session through the real routes (server.js on a copy of the fixture db)');
  const srv = await startServer(TRACK_C);
  check('the server starts on the copy', srv.up, srv.log().slice(-600));
  if (!srv.up) { srv.child.kill(); return; }
  try {
    const anon = client(srv.base);
    check('signed out: the tracker API answers 401', (await anon.get('/api/admin/cost-tracker')).status === 401);
    const learner = client(srv.base);
    check('a learner registers', (await learner.post('/api/auth/register', { email: 'tracker-learner@gmail.com', password: 'a-long-enough-pass-1', display_name: 'Tracker Learner' })).status === 201);
    check('a learner gets 404 for the tracker API and the page', (await learner.get('/api/admin/cost-tracker')).status === 404 && (await learner.get('/cost-tracker')).status === 404);
    check('signed out, the page is 404 too', (await anon.get('/cost-tracker')).status === 404);

    // The session: a few real calls, an upload, the beacon.
    for (let i = 0; i < 4; i++) await learner.get('/api/auth/me');
    await learner.get('/api/lessons/math/g5/1');
    const paste = await learner.post('/api/materials/paste', { title: 'Notes', text: 'The mitochondria is the powerhouse of the cell. '.repeat(10) });
    check('an upload (paste) works through its real route', paste.status === 201, paste.text.slice(0, 200));
    check('the beacon accepts a level-open time (204)', (await learner.post('/api/cost-beacon', { kind: 'level_open', ms: 420, waited: false, track: 'math' })).status === 204);
    await learner.post('/api/cost-beacon', { kind: 'level_open', ms: -5 });
    await learner.post('/api/cost-beacon', { kind: 'level_open', ms: 3100, waited: true, track: 'math' });

    const admin = client(srv.base);
    check('the admin registers', (await admin.post('/api/auth/register', { email: 'tracker-admin@gmail.com', password: 'a-long-enough-pass-2', display_name: 'Admin' })).status === 201);
    let d = null;
    for (let i = 0; i < 40; i++) { // the server flushes every 2 s
      const r = await admin.get('/api/admin/cost-tracker?days=1');
      d = r.json;
      if (d && d.loads.level_open_client.n >= 2 && d.routes.length) break;
      await sleep(500);
    }
    check('the admin gets the roll-up as JSON', d && d.daily && d.sessions && d.projection, d && Object.keys(d));
    if (d) {
      check('the learner\'s requests were timed per route (me x4, paste, level)', d.routes.some((r) => r.route === 'GET /api/auth/me' && r.n >= 4) && d.routes.some((r) => r.route === 'POST /api/materials/paste')
        && d.routes.some((r) => r.route === 'GET /api/lessons/:track/:grade/:level'), d.routes.map((r) => r.route));
      const mine = d.sessions.find((s) => /tracker-learner/.test(s.user));
      check('a session row exists for the learner with the upload counted and the subject', mine && mine.uploads === 1 && mine.subjects.includes('math') && mine.requests >= 3, d.sessions); // sign-in checks and other self-refreshes are not counted (PASSIVE)
      check('the beacon rows rolled up: 2 valid opens (the negative one rejected), 1 waited', d.loads.level_open_client.n === 2 && d.loads.level_open_client.waited_n === 1 && d.loads.level_open_client.ready_n === 1, d.loads.level_open_client);
      check('the unknown-level GET counts in the server-side level-open numbers', d.loads.level_open_server.n >= 1, d.loads.level_open_server);
      check('today has a total row and 1 day in the daily table', d.daily.length === 1 && d.today.requests >= 7, d.today);
    }
    const page = await admin.get('/cost-tracker');
    check('the admin gets the page', page.status === 200 && /cost-tracker\.js/.test(page.text) && /viewport/.test(page.text), page.text.slice(0, 200));
    check('the page script is plain same-origin (no inline script, so the CSP holds)', !/<script>[^<]/.test(page.text));

    // Render the page script against the real JSON.
    if (d) {
      const root = { innerHTML: '' };
      const App = {
        mount: (fn) => { App.done = fn(); }, currentUser: async () => ({ is_admin: true }), header() {},
        escapeHtml: (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
        api: { get: async () => d },
      };
      const sandbox = { App, document: { getElementById: () => root }, location: { search: '' }, URLSearchParams };
      vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'public', 'js', 'cost-tracker.js'), 'utf8'), sandbox);
      await App.done;
      const h = root.innerHTML;
      check('the page renders every section from the real data', ['Cost and performance', 'Cost projection per user-month', 'Per day', 'Sessions', 'Most expensive: features', 'Most expensive: models',
        'Most expensive: users', 'How it performs', 'Slowest routes', 'Server'].every((t) => h.includes(t)), h.slice(0, 300));
      check('no "undefined" or "NaN" leaks into the page', !/undefined|NaN/.test(h), (h.match(/.{30}(undefined|NaN).{30}/) || [])[0]);
      check('it shows the learner\'s session and the upload route', /tracker-learner/.test(h) && /POST \/api\/materials\/paste/.test(h));
    }
    const beacon = fs.readFileSync(path.join(ROOT, 'public', 'js', 'cost-beacon.js'), 'utf8');
    check('the beacon script sends only kind, ms, waited and the subject name', /JSON\.stringify\(\{ kind: 'level_open', ms: .*, waited: .*, track: m\[1\] \}\)/.test(beacon) && !/\.text\(\)\s*\.then\(\s*\(t/.test(beacon));
  } finally {
    srv.child.kill();
  }
  const files = fs.existsSync(TRACK_C) ? fs.readdirSync(TRACK_C) : [];
  const raw = files.map((f) => fs.readFileSync(path.join(TRACK_C, f), 'utf8')).join('');
  check('nothing typed leaks into the log (no paste text, no email, no password)', files.length && !/mitochondria|tracker-learner|a-long-enough-pass/.test(raw), raw.slice(0, 200));
}

async function part4() {
  console.log('\n4. Overhead');
  process.env.COST_TRACKER_DIR = path.join(SCRATCH, 'track-bench');
  const N = 20000;
  const user = { id: 5, age_check: { under_13: false } };
  const mkRes = () => Object.assign(new EventEmitter(), { statusCode: 200, writableFinished: true, write() { return true; }, getHeader() { return ''; } });
  const req = { path: '/api/lessons/math/g5/3', method: 'GET', baseUrl: '/api', route: { path: '/lessons/:track/:grade/:level' }, user };
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < N; i++) {
    const res = mkRes();
    tracker.middleware(req, res, () => {});
    res.emit('close');
  }
  const perReq = Number(process.hrtime.bigint() - t0) / 1e6 / N;
  const baseline = (() => {
    const t = process.hrtime.bigint();
    for (let i = 0; i < N; i++) { const res = mkRes(); res.once('close', () => {}); res.emit('close'); }
    return Number(process.hrtime.bigint() - t) / 1e6 / N;
  })();
  tracker.flushSync();
  const added = perReq - baseline;
  console.log(`  tracker code: ${(added * 1000).toFixed(1)} microseconds added per request (${perReq.toFixed(4)} ms with it, ${baseline.toFixed(4)} ms without), ${N} requests`);
  check('the logging adds under 0.1 ms per request', added < 0.1, added);
  const oh = tracker.overhead();
  console.log(`  self-timed mean inside the tracker (middleware + close handler): ${oh.mean_ms.toFixed(5)} ms over ${oh.calls} calls`);

  // End to end: the same 250 requests against a server with the tracker off and on.
  const run = async (off) => {
    const srv = await startServer(path.join(SCRATCH, off ? 'track-off' : 'track-on'), off ? { COST_TRACKER: 'off' } : {});
    if (!srv.up) { srv.child.kill(); return null; }
    try {
      const c = client(srv.base);
      await c.post('/api/auth/register', { email: `bench-${off}@gmail.com`, password: 'a-long-enough-pass-3', display_name: 'Bench' });
      for (let i = 0; i < 30; i++) await c.get('/api/auth/me');
      const t = process.hrtime.bigint();
      for (let i = 0; i < 250; i++) await c.get('/api/auth/me');
      return Number(process.hrtime.bigint() - t) / 1e6 / 250;
    } finally { srv.child.kill(); }
  };
  const a = await run(true);
  const b = await run(false);
  if (a !== null && b !== null) console.log(`  end to end (GET /api/auth/me, 250 sequential requests): tracker off ${a.toFixed(3)} ms, on ${b.toFixed(3)} ms, difference ${(b - a).toFixed(3)} ms (noise is a few ms on a busy machine)`);
  check('the server runs with the tracker on and off', a !== null && b !== null);
  // Two separate server runs on a shared, busy machine: the difference is noise-dominated, so this only catches a gross regression.
  check('end to end, the tracker adds under 5 ms per request (noise-limited; the loop above is the precise number)', a !== null && b !== null && b - a < 5, [a, b]);
  check('COST_TRACKER=off writes no log', !fs.existsSync(path.join(SCRATCH, 'track-off')) || fs.readdirSync(path.join(SCRATCH, 'track-off')).length === 0);
}

(async () => {
  try {
    await part1();
    part2();
    await part3();
    await part4();
  } catch (err) {
    failed++;
    console.log('  FAIL threw:', err && err.stack ? err.stack.split('\n').slice(0, 6).join('\n') : err);
  }
  tracker.flushSync();
  db.flush();
  console.log(`\n${failed ? 'FAILED' : 'cost-tracker ok'}: ${passed} checks passed${failed ? `, ${failed} failed` : ''}`);
  try { fs.rmSync(SCRATCH, { recursive: true, force: true }); } catch { /* temp */ }
  process.exit(failed ? 1 : 0);
})();
