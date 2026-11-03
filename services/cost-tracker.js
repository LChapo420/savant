/**
 * The cost and performance tracker (owner, 2026-11-02; docs/COST-TRACKER.md is the plain-language version).
 *
 * What running Savant costs and how it performs, measured from real use, so pricing tiers, their limits
 * and their running costs can be set before the beta goes public.
 *
 * Events (one JSON line each, appended in batches to <data dir>/cost-tracker/events-YYYY-MM-DD.jsonl):
 *   ai   one model call: provider, model, task, tokens in/out, latency, ok, tries, ACTUAL cost and LIST-PRICE cost
 *   req  one /api request: route pattern, status, server ms, (stream) time to first write, user
 *   lv   a "level open" the page measured itself (click to content), sent by public/js/cost-beacon.js
 *   srv  a process snapshot every minute: CPU, memory, event-loop delay, data file size
 * Sessions, user-days and the per-feature tables are not stored: they are rolled up from these on read (summarize()).
 *
 * Rules:
 *   - Logging adds no visible latency: events go into an in-memory buffer and are appended to disk asynchronously,
 *     at most every 2 s (or 500 events). Nothing here touches db.json.
 *   - Never any prompt, answer or typed text: only sizes, times, ids and costs.
 *   - An under-13 account (age_check.under_13) is logged with NO user id, so it has no session and no row of its
 *     own: it only adds to the aggregate counts and costs.
 *   - "Foreground" for an AI call means it finished while the request that started it was still open (the learner
 *     was waiting). "Background" is the rest: write-ahead, scripts, work that outlives its request.
 *   - Every event from a process that is not the app server (start() never ran: a script, a build job, a test) carries
 *     src 'script' or 'test', so it is never counted as anyone's use even when it names a learner.
 *
 * Buckets (bucketOf; owner 2026-11-03: "my stats separate from everyone else and your tests"):
 *   me        the owner's own learner account(s) (config/owner.js isOwnerLearner: landon@savantedu.com)
 *   learners  every other real account (services/real-user-metrics.js classify 'real'; an id with no row counts here)
 *   internal  founder, team, test and demo accounts, including the admin account
 *   shared    app work for no one account: shared base levels, signed-out requests, under-13 calls
 *   scripts   anything from a script, build job or test process
 * summarize({ scope }) shows one bucket ('product' is me + learners); the tier projection always uses me + learners only.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { AsyncLocalStorage } = require('async_hooks');
const db = require('../config/db');
const CFG = require('../config/cost-tracker.json');

const als = new AsyncLocalStorage();
const FLUSH_MS = 2000;
const FLUSH_AT = 500;

let buf = [];
let timer = null;
let chain = Promise.resolve();
let dirMade = false;
let appProcess = false; // set by start(), which only server.js calls
const own = { ns: 0, n: 0 }; // time spent in this module's per-request code, for the overhead number

const dir = () => process.env.COST_TRACKER_DIR || path.join(path.dirname(db.path), 'cost-tracker');
const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const r6 = (x) => Math.round(x * 1e6) / 1e6;
const off = () => String(process.env.COST_TRACKER || '').toLowerCase() === 'off';

// ── writing ──────────────────────────────────────────────────────────────────

function lines(batch) {
  const byDay = new Map();
  for (const e of batch) {
    const d = dayOf(e.ts);
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(JSON.stringify(e));
  }
  return byDay;
}

function flush() {
  timer = null;
  if (!buf.length) return chain;
  const batch = buf;
  buf = [];
  const byDay = lines(batch);
  chain = chain.then(async () => {
    if (!dirMade) { await fs.promises.mkdir(dir(), { recursive: true }); dirMade = true; }
    for (const [d, ls] of byDay) await fs.promises.appendFile(path.join(dir(), `events-${d}.jsonl`), `${ls.join('\n')}\n`);
  }).catch((err) => { console.warn('cost-tracker: write failed:', err.message); });
  return chain;
}

/** Tests and process exit: write whatever is buffered, now. */
function flushSync() {
  if (timer) { clearTimeout(timer); timer = null; }
  const batch = buf;
  buf = [];
  if (!batch.length) return;
  try {
    fs.mkdirSync(dir(), { recursive: true });
    for (const [d, ls] of lines(batch)) fs.appendFileSync(path.join(dir(), `events-${d}.jsonl`), `${ls.join('\n')}\n`);
  } catch (err) { console.warn('cost-tracker: exit write failed:', err.message); }
}

function push(e) {
  if (off()) return;
  if (!appProcess) e.src = process.env.NODE_ENV === 'test' ? 'test' : 'script';
  buf.push(e);
  if (buf.length >= FLUSH_AT) setImmediate(flush);
  else if (!timer) { timer = setTimeout(flush, FLUSH_MS); if (timer.unref) timer.unref(); }
}
process.on('exit', flushSync);

// ── prices ───────────────────────────────────────────────────────────────────

const priceCache = new Map();

/** List price (USD per Mtok) of a model on a paid route, and where the number comes from. */
function listPriceOf(model) {
  const key = String(model || '').toLowerCase();
  if (priceCache.has(key)) return priceCache.get(key);
  let out = null;
  const m = key.replace(/^anthropic\//, '').replace(/\./g, '-');
  for (const row of CFG.models) if (key.includes(row.match)) { out = { in: row.in, out: row.out, src: row.assumed ? 'assumed (config)' : 'config' }; break; }
  if (!out && /claude|fable|sonnet|opus|haiku/.test(m)) {
    const p = require('./anthropic-ledger').priceOf(m); // eslint-disable-line global-require
    out = { in: p.input, out: p.output, src: 'anthropic-ledger PRICES' };
  }
  if (!out) {
    const sc = require('./standard-compute-ledger').PRICES[model]; // eslint-disable-line global-require
    if (sc) out = { in: sc.input, out: sc.output, src: 'standard-compute-ledger PRICES' };
  }
  if (!out) out = { in: CFG.free_equivalent.in, out: CFG.free_equivalent.out, src: 'free-tier equivalent' };
  priceCache.set(key, out);
  return out;
}

function listUsd(model, tin, tout) {
  const p = listPriceOf(model);
  return (tin * p.in + tout * p.out) / 1e6;
}

// ── features ─────────────────────────────────────────────────────────────────

const FEATURES = [
  [/^(fact_|key_check|material_verify|blind_mc)/, 'fact check'],
  [/^(material_|tutor_vision)/, 'upload / my material'],
  [/^(placement|spanish_check)/, 'placement'],
  [/^(grade_free|essay_grade|spanish_rubric|spanish_reaction)/, 'judge / grading'],
  [/^(coach_turn|tutor_|dock_|assist_help|remediation_teach|spanish_partner)/, 'tutor'],
  [/^(analyze_session|diagnose)/, 'session analysis'],
  [/^(lesson_write|block_|author_items|game_questions|level_editor|regen_items|personalize_read|essay_prompt|choice_pair)/, 'lesson write'],
  [/^voice_/, 'voice (speech / listening)'],
];

function featureOf(task, role, model, basis, fg) {
  const t = String(task || '');
  let f = null;
  for (const [re, name] of FEATURES) if (re.test(t)) { f = name; break; }
  if (!f) f = role === 'placement' ? 'placement' : (t || role || 'other');
  if (f === 'fact check') return /claude|sonnet|opus|haiku/i.test(model || '') ? 'fact check (Sonnet)' : 'fact check (free)';
  if (f === 'lesson write') return fg ? 'lesson write (on demand)' : 'lesson write (write-ahead / background)';
  return f;
}

// ── recording ────────────────────────────────────────────────────────────────

function childOf(userId) {
  if (!userId) return false;
  const u = db.byId('users', userId);
  return !!(u && u.age_check && u.age_check.under_13);
}

/**
 * One model call. a: { userId, model, usage, provider (name or provider object), cents, costUsd, role, task, ms, ok, tries, hedged }
 * Called by services/ai.js after every call (success or failure). Never throws.
 */
function recordAi(a) {
  if (off()) return;
  const t0 = process.hrtime.bigint();
  try {
    const usage = a.usage || {};
    const tin = num(usage.input_tokens != null ? usage.input_tokens : usage.prompt_tokens);
    const tout = num(usage.output_tokens != null ? usage.output_tokens : usage.completion_tokens);
    const prov = a.provider && typeof a.provider === 'object' ? a.provider.name : (a.provider || null);
    const model = a.model || null;
    const list = a.listUsd != null ? num(a.listUsd) : listUsd(model, tin, tout); // listUsd: calls priced per clip, not per token (voice)
    let usd = 0;
    let basis = 'free';
    if (num(a.costUsd) > 0) { usd = num(a.costUsd); basis = 'metered'; }
    else if (num(a.cents) > 0) { usd = num(a.cents) / 100; basis = 'metered'; }
    else if (num(usage.cost_usd) > 0) { usd = num(usage.cost_usd); basis = 'metered'; }
    else if (CFG.estimated_paid_providers.includes(prov) && a.ok !== false) { usd = list; basis = 'estimated'; }
    const ctx = als.getStore();
    const child = childOf(a.userId);
    push({
      t: 'ai', ts: Date.now(), u: child ? null : (a.userId || null), child: child ? 1 : 0,
      role: a.role || null, task: a.task || null, prov, model, in: tin, out: tout, ms: Math.round(num(a.ms)),
      ok: a.ok === false ? 0 : 1, tries: a.tries || 1, hedged: a.hedged ? 1 : 0,
      usd: r6(usd), list: r6(a.ok === false ? 0 : list), basis, fg: ctx && !ctx.ended ? 1 : 0,
    });
  } catch (err) { /* never in the way of a model call */ }
  own.ns += Number(process.hrtime.bigint() - t0); own.n++;
}

const LEVEL_GET = '/api/lessons/:track/:grade/:level';
const FINISH = /^\/api\/lessons\/:track\/:grade\/:level\/(finish|block-finish|game-finish)$/;

function routeOf(req) {
  if (req.route && req.route.path !== undefined) return (req.baseUrl || '') + String(req.route.path);
  return '(unmatched)';
}

/** Express middleware: times every /api request. Put it before the routers. */
function middleware(req, res, next) {
  appProcess = true; // only the server mounts this
  if (off() || !req.path.startsWith('/api/')) return next();
  const t0 = process.hrtime.bigint();
  const ctx = { ended: false };
  let first = null;
  const w = res.write;
  res.write = function write(...a) {
    if (first === null) first = Number(process.hrtime.bigint() - t0) / 1e6;
    return w.apply(this, a);
  };
  res.once('close', () => {
    const c0 = process.hrtime.bigint();
    ctx.ended = true;
    try {
      const ms = Number(c0 - t0) / 1e6;
      const route = routeOf(req);
      if (route !== '/api/cost-beacon') {
        const u = req.user || null;
        const child = !!(u && u.age_check && u.age_check.under_13);
        const ev = { t: 'req', ts: Date.now(), u: u && !child ? u.id : null, child: child ? 1 : 0, m: req.method, route, st: res.statusCode, ms: Math.round(ms * 10) / 10 };
        if (first !== null && /event-stream/.test(String(res.getHeader('content-type') || ''))) ev.ttft = Math.round(first * 10) / 10;
        const track = /^\/api\/lessons\/([a-z0-9_-]{1,40})\//i.exec(req.originalUrl || '');
        if (track) ev.sub = track[1];
        if (route === LEVEL_GET && req.method === 'GET') ev.lvl = (res.statusCode === 202 || ms > CFG.wait_ms) ? 'waited' : 'ready';
        if (res.writableFinished === false) ev.aborted = 1;
        push(ev);
      }
    } catch { /* never in the way of a response */ }
    own.ns += Number(process.hrtime.bigint() - c0); own.n++;
  });
  own.ns += Number(process.hrtime.bigint() - t0); own.n++;
  return als.run(ctx, next);
}

/** The page's own "level open" measurement (POST /api/cost-beacon). Returns false for a body it does not accept. */
function recordClient(user, body) {
  if (!body || body.kind !== 'level_open') return false;
  const ms = num(body.ms);
  if (!(ms >= 0 && ms < 600000)) return false;
  const child = !!(user && user.age_check && user.age_check.under_13);
  const ev = { t: 'lv', ts: Date.now(), u: user && !child ? user.id : null, child: child ? 1 : 0, ms: Math.round(ms), waited: body.waited ? 1 : 0 };
  if (typeof body.track === 'string' && /^[a-z0-9_-]{1,40}$/i.test(body.track)) ev.sub = body.track;
  push(ev);
  return true;
}

// ── process snapshots ────────────────────────────────────────────────────────

let snapTimer = null;

function start() {
  if (snapTimer || off()) return;
  appProcess = true;
  let hist = null;
  try { hist = require('perf_hooks').monitorEventLoopDelay({ resolution: 20 }); hist.enable(); } catch { /* optional */ } // eslint-disable-line global-require
  let lastCpu = process.cpuUsage();
  let lastAt = Date.now();
  const snap = () => {
    const now = Date.now();
    const cpu = process.cpuUsage(lastCpu);
    const wall = Math.max(1, now - lastAt) * 1000;
    lastCpu = process.cpuUsage();
    lastAt = now;
    const mem = process.memoryUsage();
    let dbBytes = null;
    try { dbBytes = fs.statSync(db.path).size; } catch { /* no file yet */ }
    push({
      t: 'srv', ts: now, cpu: Math.round(((cpu.user + cpu.system) / wall) * 1000) / 10, rss: mem.rss, heap: mem.heapUsed,
      loop_p99: hist ? Math.round(hist.percentile(99) / 1e5) / 10 : null, db_bytes: dbBytes, load1: Math.round(os.loadavg()[0] * 100) / 100,
    });
    if (hist) hist.reset();
  };
  snapTimer = setInterval(snap, 60000);
  if (snapTimer.unref) snapTimer.unref();
  setTimeout(snap, 5000).unref();
  // Old files go.
  try {
    const cut = dayOf(Date.now() - CFG.retention_days * 86400000);
    for (const f of fs.readdirSync(dir())) { const m = /^events-(\d{4}-\d\d-\d\d)\.jsonl$/.exec(f); if (m && m[1] < cut) fs.unlinkSync(path.join(dir(), f)); }
  } catch { /* nothing to prune */ }
}

/** Mean cost, in ms, of this module's code on each request / model call so far. */
function overhead() { return { calls: own.n, mean_ms: own.n ? own.ns / own.n / 1e6 : 0 }; }

// ── reading and rolling up ───────────────────────────────────────────────────

function load(sinceMs) {
  const out = [];
  let files = [];
  try { files = fs.readdirSync(dir()); } catch { return out; }
  const from = dayOf(sinceMs);
  for (const f of files.sort()) {
    const m = /^events-(\d{4}-\d\d-\d\d)\.jsonl$/.exec(f);
    if (!m || m[1] < from) continue;
    for (const line of fs.readFileSync(path.join(dir(), f), 'utf8').split('\n')) {
      if (!line) continue;
      try { const e = JSON.parse(line); if (e.ts >= sinceMs) out.push(e); } catch { /* a torn last line */ }
    }
  }
  return out;
}

function pct(arr, p) {
  if (!arr.length) return null;
  const s = arr.slice().sort((a, b) => a - b);
  const i = (s.length - 1) * p;
  const lo = Math.floor(i);
  return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (i - lo);
}
const p50 = (a) => pct(a, 0.5);
const p95 = (a) => pct(a, 0.95);
const rnd = (x, d = 2) => (x === null || x === undefined ? null : Math.round(x * 10 ** d) / 10 ** d);

function aiRows(events) {
  const by = new Map();
  for (const e of events) {
    if (e.t !== 'ai') continue;
    const k = e.key;
    if (!by.has(k)) by.set(k, { key: k, calls: 0, fails: 0, tin: 0, tout: 0, ms: [], usd: 0, list: 0, fg: 0, bg: 0, kids: 0 });
    const r = by.get(k);
    r.calls++; if (!e.ok) r.fails++;
    r.tin += e.in; r.tout += e.out; if (e.ok) r.ms.push(e.ms);
    r.usd += e.usd; r.list += e.list; if (e.fg) r.fg++; else r.bg++;
    if (e.child) r.kids++;
  }
  return [...by.values()].map((r) => ({
    key: r.key, calls: r.calls, fails: r.fails, tokens_in: r.tin, tokens_out: r.tout, p50_ms: rnd(p50(r.ms), 0), p95_ms: rnd(p95(r.ms), 0),
    actual_usd: rnd(r.usd, 4), list_usd: rnd(r.list, 4), foreground: r.fg, background: r.bg,
  })).sort((a, b) => b.list_usd - a.list_usd || b.calls - a.calls);
}

// ── buckets (see the header) ─────────────────────────────────────────────────

const BUCKETS = ['me', 'learners', 'internal', 'shared', 'scripts'];
// A tab refreshing itself (sign-in check, the study strip on becoming visible, the tutor's settings): not someone studying,
// so these neither open nor extend a session.
const PASSIVE = /^GET \/api\/(auth\/me|retention\/state|tutor\/dock)$/;

/** A function from an event to its bucket; reads each account once. */
function bucketer() {
  const owner = require('../config/owner'); // eslint-disable-line global-require
  const rum = require('./real-user-metrics'); // eslint-disable-line global-require
  const r = rum.rules();
  const seen = new Map();
  return (e) => {
    if (e.src) return 'scripts';
    if (!e.u) return 'shared';
    if (!seen.has(e.u)) {
      const u = db.byId('users', e.u);
      seen.set(e.u, !u ? 'learners' : owner.isOwnerLearner(u) ? 'me' : rum.classify(u, r).group === 'real' ? 'learners' : 'internal');
    }
    return seen.get(e.u);
  };
}

/**
 * Everything the page shows. opts: { days (7), user (id | null), scope ('all' | a bucket | 'product'), now (ms) }.
 * Time is UTC. Under-13 accounts appear only inside the aggregate tables.
 */
function summarize(opts = {}) {
  const now = opts.now || Date.now();
  const days = Math.max(1, Math.min(90, Number(opts.days) || 7));
  const userFilter = opts.user ? Number(opts.user) : null;
  const scope = BUCKETS.includes(opts.scope) || opts.scope === 'product' ? opts.scope : 'all';
  const since = now - days * 86400000;
  let events = load(since);
  const bucketOf = bucketer();
  for (const e of events) if (e.t !== 'srv') e.b = bucketOf(e);
  const buckets = BUCKETS.map((b) => {
    const mine = events.filter((e) => e.b === b);
    const ai = mine.filter((e) => e.t === 'ai');
    return { bucket: b, ai_calls: ai.length, actual_usd: rnd(ai.reduce((s, e) => s + e.usd, 0), 4), list_usd: rnd(ai.reduce((s, e) => s + e.list, 0), 4),
      requests: mine.filter((e) => e.t === 'req').length, accounts: new Set(mine.filter((e) => e.u).map((e) => e.u)).size };
  });
  const product = (b) => b === 'me' || b === 'learners';
  if (scope !== 'all') events = events.filter((e) => e.t === 'srv' || (scope === 'product' ? product(e.b) : e.b === scope));
  if (userFilter) events = events.filter((e) => e.u === userFilter);
  events.sort((a, b) => a.ts - b.ts);
  const today = dayOf(now);

  const ai = events.filter((e) => e.t === 'ai').map((e) => ({ ...e, key: '' }));
  for (const e of ai) e.feature = featureOf(e.task, e.role, e.model, e.basis, e.fg);
  const reqs = events.filter((e) => e.t === 'req');
  const lvs = events.filter((e) => e.t === 'lv');
  const srv = events.filter((e) => e.t === 'srv');

  const total = (list, field) => list.reduce((s, e) => s + e[field], 0);
  const slice = (d) => ai.filter((e) => dayOf(e.ts) === d);
  const dayRow = (d) => {
    const a = slice(d);
    const ss = sessions.filter((s) => dayOf(s.start) === d);
    const opens = lvs.filter((e) => dayOf(e.ts) === d);
    return { day: d, ai_calls: a.length, actual_usd: rnd(total(a, 'usd'), 4), list_usd: rnd(total(a, 'list'), 4), requests: reqs.filter((e) => dayOf(e.ts) === d).length,
      sessions: ss.length, active_min: rnd(ss.reduce((s, x) => s + x.active, 0) / 60000, 1), levels: ss.reduce((s, x) => s + x.levels, 0),
      level_opens: opens.length, level_open_p50_ms: rnd(p50(opens.map((e) => e.ms)), 0), level_waits: opens.filter((e) => e.waited).length };
  };
  const dayList = [];
  for (let i = 0; i < days; i++) dayList.push(dayOf(now - i * 86400000));

  // ── sessions: a gap of session_gap_min or more ends one; active time counts each gap up to idle_cap_min ──
  const gap = CFG.session_gap_min * 60000;
  const cap = CFG.idle_cap_min * 60000;
  const byUser = new Map();
  for (const e of reqs) {
    if (!e.u || e.src || PASSIVE.test(`${e.m} ${e.route}`)) continue;
    if (!byUser.has(e.u)) byUser.set(e.u, []);
    byUser.get(e.u).push(e);
  }
  const sessions = [];
  for (const [uid, evs] of byUser) {
    let cur = null;
    for (const e of evs) {
      if (!cur || e.ts - cur.last > gap) { cur = { user: uid, start: e.ts, last: e.ts, active: 0, levels: 0, subjects: new Set(), uploads: 0, requests: 0 }; sessions.push(cur); }
      else { cur.active += Math.min(e.ts - cur.last, cap); cur.last = e.ts; }
      cur.requests++;
      if (e.sub) cur.subjects.add(e.sub);
      if (e.m === 'POST' && e.st < 300) {
        if (FINISH.test(e.route)) cur.levels++;
        if (/^\/api\/materials(\/(paste|link|youtube|video|audio|transcript))?$/.test(e.route)) cur.uploads++;
      }
    }
  }
  const aiByUser = new Map();
  // A script's call that names an account is still no one's use: it counts in the totals, never on a person.
  const personal = ai.filter((e) => e.u && !e.src);
  for (const e of personal) { if (!aiByUser.has(e.u)) aiByUser.set(e.u, []); aiByUser.get(e.u).push(e); }
  for (const s of sessions) {
    const mine = (aiByUser.get(s.user) || []).filter((e) => e.ts >= s.start && e.ts <= s.last + cap);
    s.ai_calls = mine.length; s.actual_usd = total(mine, 'usd'); s.list_usd = total(mine, 'list');
  }
  const userDays = new Map(); // "uid|day" -> { active, usd, list, levels }
  const emails = new Map();
  const label = (uid) => {
    if (!emails.has(uid)) { const u = db.byId('users', uid); emails.set(uid, u ? (u.email || u.username || `user ${uid}`) : `user ${uid}`); }
    return `${emails.get(uid)} (${uid})`;
  };
  for (const s of sessions) {
    const k = `${s.user}|${dayOf(s.start)}`;
    if (!userDays.has(k)) userDays.set(k, { user: s.user, day: dayOf(s.start), active: 0, usd: 0, list: 0, levels: 0 });
    const r = userDays.get(k); r.active += s.active / 60000; r.levels += s.levels;
  }
  for (const e of personal) {
    const k = `${e.u}|${dayOf(e.ts)}`;
    if (!userDays.has(k)) userDays.set(k, { user: e.u, day: dayOf(e.ts), active: 0, usd: 0, list: 0, levels: 0 });
    const r = userDays.get(k); r.usd += e.usd; r.list += e.list;
  }
  const udList = [...userDays.values()];

  // ── tables ──
  for (const e of ai) e.key = e.feature;
  const features = aiRows(ai);
  for (const e of ai) e.key = `${e.prov || '?'} / ${e.model || '?'}`;
  const models = aiRows(ai);
  const usersMap = new Map();
  for (const e of personal) { const r = usersMap.get(e.u) || { calls: 0, usd: 0, list: 0 }; r.calls++; r.usd += e.usd; r.list += e.list; usersMap.set(e.u, r); }
  const activeByUser = new Map();
  for (const s of sessions) activeByUser.set(s.user, (activeByUser.get(s.user) || 0) + s.active / 60000);
  const users = [...usersMap.entries()].map(([uid, r]) => ({
    user: label(uid), id: uid, ai_calls: r.calls, actual_usd: rnd(r.usd, 4), list_usd: rnd(r.list, 4), active_min: rnd(activeByUser.get(uid) || 0, 1),
  })).sort((a, b) => b.list_usd - a.list_usd).slice(0, 15);

  const routeMap = new Map();
  for (const e of reqs) {
    const k = `${e.m} ${e.route}`;
    if (!routeMap.has(k)) routeMap.set(k, { route: k, ms: [], errors: 0 });
    const r = routeMap.get(k); r.ms.push(e.ms); if (e.st >= 500) r.errors++;
  }
  const routes = [...routeMap.values()].map((r) => ({ route: r.route, n: r.ms.length, p50_ms: rnd(p50(r.ms), 1), p95_ms: rnd(p95(r.ms), 1), errors: r.errors }))
    .sort((a, b) => b.p95_ms - a.p95_ms).slice(0, 15);

  const lvServer = reqs.filter((e) => e.lvl);
  const ms = (list) => list.map((e) => e.ms);
  const ready = lvs.filter((e) => !e.waited); const waited = lvs.filter((e) => e.waited);
  const ttft = reqs.filter((e) => e.ttft !== undefined);
  const loads = {
    level_open_client: { n: lvs.length, p50_ms: rnd(p50(ms(lvs)), 0), p95_ms: rnd(p95(ms(lvs)), 0),
      ready_n: ready.length, ready_p50_ms: rnd(p50(ms(ready)), 0), waited_n: waited.length, waited_p50_ms: rnd(p50(ms(waited)), 0) },
    level_open_server: { n: lvServer.length, ready_n: lvServer.filter((e) => e.lvl === 'ready').length, waited_n: lvServer.filter((e) => e.lvl === 'waited').length,
      p50_ms: rnd(p50(ms(lvServer)), 0), p95_ms: rnd(p95(ms(lvServer)), 0) },
    tutor_first_token: { n: ttft.length, p50_ms: rnd(p50(ttft.map((e) => e.ttft)), 0), p95_ms: rnd(p95(ttft.map((e) => e.ttft)), 0) },
  };

  const server = {
    snapshots: srv.length,
    cpu_p50_pct: rnd(p50(srv.map((e) => e.cpu)), 1), cpu_p95_pct: rnd(p95(srv.map((e) => e.cpu)), 1),
    rss_max_mb: srv.length ? rnd(Math.max(...srv.map((e) => e.rss)) / 1048576, 0) : null,
    loop_p99_max_ms: srv.length ? Math.max(...srv.map((e) => e.loop_p99 || 0)) : null,
    db_mb: srv.length ? rnd((srv[srv.length - 1].db_bytes || 0) / 1048576, 1) : null,
  };

  // ── tier projection: cost per user-month from measured user-days ──
  const fixedEnv = Number(process.env.COST_FIXED_MONTHLY_USD);
  const fx = CFG.fixed_monthly_usd;
  const fixed = Number.isFinite(fixedEnv) && process.env.COST_FIXED_MONTHLY_USD ? fixedEnv : num(fx.vm) + num(fx.domain) + num(fx.other);
  // Only the product's own use prices a tier: the owner's learner account and real learners, never team, test or script days.
  const usable = udList.filter((r) => r.active >= CFG.projection_min_active_min && product(bucketOf({ u: r.user })));
  const per = (field) => usable.map((r) => r[field] / (r.active / 60));
  const cph = { actual_p50: p50(per('usd')), actual_p95: p95(per('usd')), list_p50: p50(per('list')), list_p95: p95(per('list')) };
  const dpm = CFG.projection_days_per_month;
  const tiers = CFG.tier_hours_per_day.map((h) => {
    const row = { hours_per_day: h };
    for (const k of Object.keys(cph)) row[k] = cph[k] === null ? null : rnd(cph[k] * h * dpm, 2);
    row.by_users = CFG.tier_users.map((n) => {
      const share = fixed / n;
      return { users: n, fixed_share: rnd(share, 2),
        actual_p50: row.actual_p50 === null ? null : rnd(row.actual_p50 + share, 2), actual_p95: row.actual_p95 === null ? null : rnd(row.actual_p95 + share, 2),
        list_p50: row.list_p50 === null ? null : rnd(row.list_p50 + share, 2), list_p95: row.list_p95 === null ? null : rnd(row.list_p95 + share, 2) };
    });
    return row;
  });
  const projection = {
    basis_user_days: usable.length, min_active_min: CFG.projection_min_active_min, days_per_month: dpm, fixed_monthly_usd: rnd(fixed, 2),
    fixed_set: fixed > 0, cost_per_active_hour: Object.fromEntries(Object.entries(cph).map(([k, v]) => [k, rnd(v, 4)])), tiers,
  };

  const failed = ai.filter((e) => !e.ok);
  return {
    generated_at: new Date(now).toISOString(), timezone: 'UTC', days, user: userFilter, scope, buckets,
    today: { ...dayRow(today), ai_failed: slice(today).filter((e) => !e.ok).length, sessions: sessions.filter((s) => dayOf(s.start) === today).length },
    daily: dayList.map(dayRow),
    window: { ai_calls: ai.length, ai_failed: failed.length, actual_usd: rnd(total(ai, 'usd'), 4), list_usd: rnd(total(ai, 'list'), 4),
      estimated_actual_usd: rnd(ai.filter((e) => e.basis === 'estimated').reduce((s, e) => s + e.usd, 0), 4), child_calls: ai.filter((e) => e.child).length },
    sessions: sessions.sort((a, b) => b.start - a.start).slice(0, 40).map((s) => ({
      user: label(s.user), id: s.user, start: new Date(s.start).toISOString(), minutes: rnd((s.last - s.start) / 60000, 1), active_min: rnd(s.active / 60000, 1),
      levels: s.levels, subjects: [...s.subjects], uploads: s.uploads, requests: s.requests, ai_calls: s.ai_calls,
      actual_usd: rnd(s.actual_usd, 4), list_usd: rnd(s.list_usd, 4),
      list_usd_per_active_hr: s.active >= 60000 ? rnd(s.list_usd / (s.active / 3600000), 3) : null,
      actual_usd_per_active_hr: s.active >= 60000 ? rnd(s.actual_usd / (s.active / 3600000), 3) : null,
    })),
    features, models, users, routes, loads, server, projection,
    overhead: overhead(),
  };
}

module.exports = { recordAi, recordClient, middleware, start, flush, flushSync, summarize, overhead, listPriceOf, listUsd, featureOf, dir, CFG, BUCKETS, PASSIVE };
