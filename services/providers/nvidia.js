/**
 * NVIDIA build (integrate.api.nvidia.com), through its OpenAI-compatible chat
 * completions endpoint. Free: every call is recorded at $0.
 *
 * The owner's lineup (2026-10-22), in order, before anything Claude:
 *   instant        nvidia/nemotron-3.5-lightning-30b-a3b, thinking off
 *   light          nvidia/nemotron-3-ultra-550b-a55b, a little thinking
 *   fast_thinking  z-ai/glm-5.3-flash or deepseek-ai/deepseek-v4.1-flash
 *   hard           z-ai/glm-5.3 at max reasoning, or deepseek-v4.1-flash at max
 * Which model answers which role and task is data, not code: config/model-lineup.json,
 * written by scripts/model-lineup-eval.js from measured results. Claude (the
 * Anthropic provider) is the last resort behind this one, chosen in
 * services/providers/index.js.
 *
 * Measured against the live endpoint on 2026-10-22 (curriculum-build/MODEL-LINEUP.md):
 *   - Reasoning is controlled through `chat_template_kwargs`, and differently per family:
 *       Nemotron  {enable_thinking: false}               off (honoured: 0 reasoning tokens)
 *                 {enable_thinking: true, medium_effort: true}   a little
 *                 {enable_thinking: true}                 full
 *       GLM 5.3   {reasoning_effort: low|medium|high|max} (enable_thinking: false is NOT
 *                 honoured: it still reasons, so "off" is sent as low)
 *       DeepSeek  {thinking: false} off; {thinking: true, reasoning_effort: high|max}
 *     A thinking budget (`reasoning_budget`, `nvext.max_thinking_tokens`) is rejected
 *     with a 400 on this endpoint, so the budget is set through max_tokens instead.
 *   - Thinking arrives in `message.reasoning_content` and counts against max_tokens:
 *     with a small max_tokens a thinking model returns EMPTY content. So max_tokens
 *     is the caller's answer budget plus headroom for the effort asked for.
 *   - Tool calling (`tools` + `tool_choice: auto`) works on all five models;
 *     `response_format: json_schema` returns empty content on DeepSeek, so tools are
 *     the structured path and JSON-in-content is the fallback.
 *   - No rate-limit headers are sent. The free tier is reported at 40 requests per
 *     minute per key (NVIDIA forum moderators: depends on model and load, no
 *     increase on the free tier), so the client paces itself under that
 *     (NVIDIA_RPM, default 36) and backs off on 429.
 */
const fs = require('fs');
const path = require('path');
const sj = require('./structured-json');

const BASE_URL = () => (process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1').replace(/\/$/, '');
const LINEUP_FILE = () => process.env.MODEL_LINEUP_FILE || path.join(__dirname, '..', '..', 'config', 'model-lineup.json');

/** What each model is, and how its reasoning is switched. */
const PROFILES = {
  'nvidia/nemotron-3.5-lightning-30b-a3b': { family: 'nemotron', maxOut: 32768, label: 'Nemotron 3.5 Lightning 30B-A3B' },
  'nvidia/nemotron-3-ultra-550b-a55b': { family: 'nemotron', maxOut: 32768, label: 'Nemotron 3 Ultra 550B-A55B' },
  'z-ai/glm-5.3-flash': { family: 'glm', maxOut: 32768, label: 'GLM 5.3 Flash' },
  'z-ai/glm-5.3': { family: 'glm', maxOut: 65536, label: 'GLM 5.3' },
  'deepseek-ai/deepseek-v4.1-flash': { family: 'deepseek', maxOut: 65536, label: 'DeepSeek V4.1 Flash' },
};
const EFFORTS = ['off', 'low', 'medium', 'high', 'max'];
const TIERS = ['instant', 'light', 'fast_thinking', 'hard'];

function familyOf(model) {
  if (PROFILES[model]) return PROFILES[model].family;
  if (/nemotron/i.test(model)) return 'nemotron';
  if (/glm/i.test(model)) return 'glm';
  if (/deepseek/i.test(model)) return 'deepseek';
  return 'other';
}

/** The request fields that set this model's reasoning to `effort`. */
function reasoningParams(model, effort) {
  const e = EFFORTS.includes(effort) ? effort : 'medium';
  switch (familyOf(model)) {
    case 'nemotron':
      if (e === 'off') return { chat_template_kwargs: { enable_thinking: false } };
      if (e === 'low' || e === 'medium') return { chat_template_kwargs: { enable_thinking: true, medium_effort: true } };
      return { chat_template_kwargs: { enable_thinking: true } };
    case 'glm':
      // GLM 5.3 has no non-thinking mode on this endpoint; "off" is its lowest effort.
      return { chat_template_kwargs: { reasoning_effort: e === 'off' ? 'low' : e } };
    case 'deepseek':
      if (e === 'off') return { chat_template_kwargs: { thinking: false } };
      return { chat_template_kwargs: { thinking: true, reasoning_effort: e === 'max' ? 'max' : 'high' } };
    default:
      return {};
  }
}

/** Room for the thinking on top of the answer's own budget. */
const HEADROOM = { off: 0, low: 4096, medium: 6144, high: 16384, max: 32768 };
function maxTokensFor(model, effort, answerTokens) {
  const cap = (PROFILES[model] && PROFILES[model].maxOut) || 32768;
  let extra = HEADROOM[effort] == null ? 6144 : HEADROOM[effort];
  // GLM's lowest effort still thinks a little.
  if (effort === 'off' && familyOf(model) === 'glm') extra = 2048;
  return Math.min(cap, Math.max(256, Number(answerTokens) || 1024) + extra);
}

/**
 * How long one request may take before it is abandoned (and retried or passed on).
 * NVIDIA's gateway itself answers 504 after about 300 seconds (measured in the
 * lineup eval: every 504 arrived at 300-310 s), so nothing waits longer than that.
 */
const TIMEOUTS = { off: 60000, low: 120000, medium: 120000, high: 300000, max: 310000 };
function timeoutFor(effort, override) {
  if (override) return override;
  if (process.env.NVIDIA_TIMEOUT_MS) return Number(process.env.NVIDIA_TIMEOUT_MS);
  return TIMEOUTS[effort] || 180000;
}

// ── the lineup (config/model-lineup.json + env overrides) ───────────────────
let lineupCache = null;
let lineupStamp = null;

function readLineup() {
  const file = LINEUP_FILE();
  let stamp = null;
  try { stamp = `${file}:${fs.statSync(file).mtimeMs}`; } catch { stamp = `${file}:missing`; }
  if (lineupCache && stamp === lineupStamp) return lineupCache;
  let data = {};
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (err) {
    if (!/missing$/.test(stamp)) console.warn(`ai: could not read ${file} (${err.message}); using the built-in lineup`);
  }
  lineupCache = data;
  lineupStamp = stamp;
  return data;
}

const DEFAULT_TIERS = {
  instant: [{ model: 'nvidia/nemotron-3.5-lightning-30b-a3b', effort: 'off' }, { model: 'nvidia/nemotron-3-ultra-550b-a55b', effort: 'off' }],
  light: [{ model: 'nvidia/nemotron-3-ultra-550b-a55b', effort: 'medium' }, { model: 'nvidia/nemotron-3.5-lightning-30b-a3b', effort: 'high' }],
  fast_thinking: [{ model: 'z-ai/glm-5.3-flash', effort: 'high' }, { model: 'deepseek-ai/deepseek-v4.1-flash', effort: 'high' }],
  hard: [{ model: 'deepseek-ai/deepseek-v4.1-flash', effort: 'max' }, { model: 'z-ai/glm-5.3-flash', effort: 'high' }], // glm-5.3 retired by NVIDIA (410) on 30 Oct 2026
};
const DEFAULT_SPILL = { instant: ['light', 'fast_thinking'], light: ['fast_thinking'], fast_thinking: ['hard'], hard: [] };
const DEFAULT_ROLES = {
  fast: 'light', check: 'light', deep: 'hard', author: 'hard', regen: 'fast_thinking', diagnose: 'hard', rewrite: 'hard',
  personalize: 'fast_thinking', games: 'hard', blocks: 'fast_thinking', placement: 'hard',
};

/** "model@effort,model@effort" -> [{model, effort}] */
function parseList(text) {
  return String(text || '').split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
    const [model, effort] = s.split('@');
    return { model: model.trim(), effort: EFFORTS.includes((effort || '').trim()) ? effort.trim() : null };
  });
}

function envKey(name) {
  return String(name).toUpperCase().replace(/[^A-Z0-9]+/g, '_');
}

function normalizeEntries(list, fallbackEffort = 'medium') {
  return (Array.isArray(list) ? list : []).map((e) => (typeof e === 'string' ? parseList(e)[0] : e))
    .filter((e) => e && e.model).map((e) => ({ model: e.model, effort: EFFORTS.includes(e.effort) ? e.effort : fallbackEffort }));
}

function tierEntries(tier) {
  const fromEnv = process.env[`NVIDIA_TIER_${envKey(tier)}`];
  if (fromEnv) return normalizeEntries(parseList(fromEnv));
  const lineup = readLineup();
  const fromFile = lineup.tiers && lineup.tiers[tier];
  return normalizeEntries(fromFile && fromFile.length ? fromFile : DEFAULT_TIERS[tier] || []);
}

function tierForRole(role) {
  const fromEnv = process.env[`NVIDIA_ROLE_${envKey(role)}`];
  if (fromEnv && TIERS.includes(fromEnv.trim())) return fromEnv.trim();
  const lineup = readLineup();
  const t = (lineup.roles && lineup.roles[role]) || DEFAULT_ROLES[role] || 'light';
  return TIERS.includes(t) ? t : 'light';
}

/**
 * The models to try for one call, in order, each with its effort:
 *   the task's own list (the eval's winner first) or its tier,
 *   then the rest of that tier,
 *   then the tiers it may spill into (never down into a weaker tier),
 * de-duplicated by model (first effort wins), capped at NVIDIA_MAX_MODELS (default 4).
 */
function plan(role = 'fast', task = null) {
  const lineup = readLineup();
  const taskConf = task ? ((lineup.tasks && lineup.tasks[task]) || null) : null;
  const taskEnv = task ? process.env[`NVIDIA_TASK_${envKey(task)}`] : null;
  let tier = tierForRole(role);
  let head = [];
  if (taskEnv) {
    if (TIERS.includes(taskEnv.trim())) tier = taskEnv.trim();
    else head = normalizeEntries(parseList(taskEnv));
  } else if (taskConf) {
    if (TIERS.includes(taskConf.tier)) tier = taskConf.tier;
    head = normalizeEntries(taskConf.models || []);
    // "only": just these models, no tier or spill behind them, so a failure goes straight
    // to the next provider in the chain (the tutor dock: a weak fast model is worse than Claude).
    if (taskConf.only && head.length) return { tier, entries: head };
  }
  const spill = (lineup.spill && lineup.spill[tier]) || DEFAULT_SPILL[tier] || [];
  const all = [...head, ...tierEntries(tier), ...spill.flatMap((t) => tierEntries(t))];
  const seen = new Set();
  const out = [];
  for (const e of all) {
    if (seen.has(e.model)) continue;
    seen.add(e.model);
    out.push(e);
  }
  const cap = Number(process.env.NVIDIA_MAX_MODELS || 4);
  return { tier, entries: out.slice(0, Math.max(1, cap)) };
}

// ── availability ────────────────────────────────────────────────────────────
let stoodDownUntil = 0;
let stoodDownWhy = null;
const cooldown = new Map(); // model -> until (ms)
const noTools = new Set(); // models that rejected `tools`
const noReasoningParams = new Set(); // models that rejected chat_template_kwargs

function now() { return Date.now(); }
function isConfigured() { return !!String(process.env.NVIDIA_API_KEY || '').trim(); }
function stoodDown() { return stoodDownUntil > now() || outage().state === 'down'; }

// ── the owner's rate-limit rule (2026-10-23) ────────────────────────────────
/*
 * "if you hit the limit keep retesting to see when you can get back at it ... and if
 * the nvidia doesn't work for 15 mins straight then use local, but actually make
 * absolute sure you've hit the limit, and use the local model until the limit on
 * nvidia resets."
 *
 * Every request's outcome is recorded. Only availability failures count (429, 5xx,
 * timeouts, network errors); a 400 or an unusable answer means NVIDIA is up. NVIDIA is
 * DOWN only when ALL of these hold:
 *   - no request has succeeded for NVIDIA_OUTAGE_MS (default 15 minutes);
 *   - at least NVIDIA_OUTAGE_MIN_FAILURES (default 8) failures in that time, spread
 *     over at least 3 different minutes, the latest within the last 3 minutes;
 *   - a fresh probe (the smallest possible request, to the lightest model) failed too.
 * While DOWN, the chain skips NVIDIA (services/providers/index.js puts the local models
 * first) and a probe retests it every NVIDIA_PROBE_MS (default 60 s). The first probe
 * or request that succeeds ends the outage. Before 15 minutes, every call still tries
 * NVIDIA first ("keep retesting"), and only a call NVIDIA fails goes to the fallbacks.
 */
const OUTAGE_MS = () => Number(process.env.NVIDIA_OUTAGE_MS || 15 * 60 * 1000);
const OUTAGE_MIN_FAILURES = () => Number(process.env.NVIDIA_OUTAGE_MIN_FAILURES || 8);
const PROBE_MS = () => Number(process.env.NVIDIA_PROBE_MS || 60 * 1000);
const health = { lastOk: 0, failingSince: 0, failures: [], down: false, downSince: 0, lastProbe: 0, probing: false, lastProbeResult: null };
const AVAILABILITY_FAILURES = new Set([0, 408, 425, 429, 500, 502, 503, 504]);

function noteSuccess() {
  if (health.down) console.warn(`ai: NVIDIA is answering again after ${Math.round((now() - health.downSince) / 60000)} min down; back to NVIDIA first`);
  health.lastOk = now();
  health.failingSince = 0;
  health.failures = [];
  health.down = false;
  health.downSince = 0;
}

function noteFailure(err) {
  if (!err || !AVAILABILITY_FAILURES.has(err.status)) return;
  const t = now();
  if (!health.failingSince) health.failingSince = t;
  health.failures.push({ at: t, status: err.status });
  if (health.failures.length > 500) health.failures = health.failures.slice(-500);
}

/** Failing long enough, often enough and recently enough that a probe should confirm it. */
function outageSuspected() {
  if (!health.failingSince || health.down) return false;
  const t = now();
  if (t - health.failingSince < OUTAGE_MS()) return false;
  if (health.lastOk && t - health.lastOk < OUTAGE_MS()) return false;
  const recent = health.failures.filter((f) => t - f.at <= OUTAGE_MS());
  if (recent.length < OUTAGE_MIN_FAILURES()) return false;
  const minutes = new Set(recent.map((f) => Math.floor(f.at / 60000)));
  if (minutes.size < 3) return false;
  return t - recent[recent.length - 1].at <= 3 * 60 * 1000;
}

/** The smallest request there is: one token from the lightest model, thinking off. */
async function probe() {
  if (health.probing || !isConfigured()) return health.lastProbeResult;
  health.probing = true;
  health.lastProbe = now();
  try {
    await acquire('background', 'probe');
    try {
      await post({ model: 'nvidia/nemotron-3.5-lightning-30b-a3b', messages: [{ role: 'user', content: 'ok' }], max_tokens: 1, chat_template_kwargs: { enable_thinking: false } }, 30000);
    } finally { release('probe'); }
    health.lastProbeResult = { at: now(), ok: true };
    noteSuccess();
  } catch (err) {
    health.lastProbeResult = { at: now(), ok: false, status: err.status, error: String(err.message).slice(0, 120) };
    if (AVAILABILITY_FAILURES.has(err.status)) {
      noteFailure(err);
      if (!health.down && outageSuspected()) {
        health.down = true;
        health.downSince = now();
        console.warn(`ai: NVIDIA has failed for ${Math.round((now() - health.failingSince) / 60000)} min (${health.failures.length} failures, last ${err.status}) and the probe failed too: using the local models until it recovers; retesting every ${Math.round(PROBE_MS() / 1000)} s`);
      }
    }
  } finally {
    health.probing = false;
  }
  return health.lastProbeResult;
}

/** The outage state, with the lazy retest: { state: 'ok'|'failing'|'down', ... }. Never throws. */
function outage() {
  if (isConfigured() && !health.probing) {
    const t = now();
    if ((health.down && t - health.lastProbe >= PROBE_MS()) || (!health.down && outageSuspected() && t - health.lastProbe >= 10000)) {
      probe().catch(() => {});
    }
  }
  return {
    state: health.down ? 'down' : health.failingSince ? 'failing' : 'ok',
    failing_for_ms: health.failingSince ? now() - health.failingSince : 0,
    failures: health.failures.length,
    down_since: health.downSince ? new Date(health.downSince).toISOString() : null,
    last_ok: health.lastOk ? new Date(health.lastOk).toISOString() : null,
    last_probe: health.lastProbeResult,
  };
}
function coolingDown(model) { return (cooldown.get(model) || 0) > now(); }
function coolDown(model, ms, why) {
  cooldown.set(model, now() + ms);
  console.warn(`ai: NVIDIA ${model} set aside for ${Math.round(ms / 1000)}s (${why})`);
}

function usableEntries(role, task) {
  return plan(role, task).entries.filter((e) => !coolingDown(e.model));
}

function isEnabled(role = 'fast', task = null) {
  if (!isConfigured() || stoodDown()) return false;
  return usableEntries(role, task).length > 0;
}

function status() {
  return {
    configured: isConfigured(),
    available: isEnabled(),
    reason: !isConfigured() ? 'no API key' : health.down ? 'down: 15 minutes of confirmed failure (retesting)' : stoodDown() ? stoodDownWhy : null,
    outage: outage(),
    cooling: [...cooldown.entries()].filter(([, until]) => until > now()).map(([m]) => m),
  };
}

/** The models services/pool.js may run as separate slots for this work: the plan's usable entries, best first. */
function poolModels(role = 'fast', task = null) {
  return usableEntries(role, task);
}

function modelFor(role = 'fast', task = null) {
  const usable = usableEntries(role, task);
  const e = usable[0] || plan(role, task).entries[0];
  return e ? e.model : null;
}

// ── pacing: one limiter for the whole key ───────────────────────────────────
const limiter = { stamps: [], active: 0, queue: [], timer: null, perModel: new Map(), learnerActive: 0 };
const RPM = () => Math.max(1, Number(process.env.NVIDIA_RPM || 36));
const CONCURRENCY = () => Math.max(1, Number(process.env.NVIDIA_CONCURRENCY || 8));
// Per model, in flight at once. DeepSeek V4.1 Flash answered 429 with about ten
// requests in flight (the lineup eval, 2026-10-22), well under the key's RPM.
const MODEL_CONCURRENCY = () => Math.max(1, Number(process.env.NVIDIA_MODEL_CONCURRENCY || 4));
// Learner-facing work (the dock, a study pack or path being built, fact extraction) shares this many
// calls in flight; a real-model run (30 Oct) showed free NVIDIA starving all of it when they ran together.
// Everything else (authoring pipelines, grading, probes) is not counted against it.
const LEARNER_CAP = () => Math.max(1, Number(process.env.NVIDIA_LEARNER_CAP || 2));
const DOCK_TASKS = new Set(['dock_help', 'dock_leak_check', 'tutor_explain', 'coach_turn', 'assist_help', 'remediation_teach']);
const FACT_TASKS = new Set(['tutor_facts']);
/** 'dock' | 'facts' | 'build' for learner-facing tasks, null for the rest. */
function learnerClass(task) {
  if (!task) return null;
  if (DOCK_TASKS.has(task)) return 'dock';
  if (FACT_TASKS.has(task)) return 'facts';
  if (/^material_/.test(task)) return 'build';
  return null;
}
// Lower runs first: a dock reply is ahead of a material build, which is ahead of fact extraction.
const RANK = { dock: 0, build: 2, facts: 3 };
let pausedUntil = 0;

/** True when learner-facing work is at its cap or waiting: optional work (fact extraction) should drop out. */
function learnerBusy() {
  return limiter.learnerActive >= LEARNER_CAP() || limiter.queue.some((q) => q.cls);
}

function pump() {
  if (limiter.timer) { clearTimeout(limiter.timer); limiter.timer = null; }
  const t = now();
  limiter.stamps = limiter.stamps.filter((s) => t - s < 60000);
  while (limiter.queue.length && limiter.active < CONCURRENCY() && limiter.stamps.length < RPM() && pausedUntil <= t) {
    // Interactive work (someone is waiting) goes ahead of background authoring,
    // and a model already at its own in-flight cap waits while others go.
    const free = (q) => (limiter.perModel.get(q.model) || 0) < MODEL_CONCURRENCY()
      && (!q.cls || limiter.learnerActive < LEARNER_CAP());
    const rank = (q) => (q.cls ? RANK[q.cls] : (q.priority === 'interactive' ? 1 : 4));
    let idx = -1;
    limiter.queue.forEach((q, i) => { if (free(q) && (idx === -1 || rank(q) < rank(limiter.queue[idx]))) idx = i; });
    if (idx === -1) break;
    const [next] = limiter.queue.splice(idx, 1);
    limiter.stamps.push(t);
    limiter.active++;
    if (next.cls) limiter.learnerActive++;
    limiter.perModel.set(next.model, (limiter.perModel.get(next.model) || 0) + 1);
    next.resolve();
  }
  if (limiter.queue.length && !limiter.timer) {
    const waitRpm = limiter.stamps.length >= RPM() ? (limiter.stamps[0] + 60000 - t) : 0;
    const waitPause = Math.max(0, pausedUntil - t);
    const wait = Math.max(waitRpm, waitPause);
    if (wait > 0) limiter.timer = setTimeout(pump, wait + 5);
  }
}

function acquire(priority = 'background', model = '', cls = null) {
  return new Promise((resolve) => {
    limiter.queue.push({ priority, resolve, model, cls });
    pump();
  });
}

function release(model = '', cls = null) {
  limiter.active = Math.max(0, limiter.active - 1);
  if (cls) limiter.learnerActive = Math.max(0, limiter.learnerActive - 1);
  limiter.perModel.set(model, Math.max(0, (limiter.perModel.get(model) || 0) - 1));
  pump();
}

// Injectable for the tests (mocked HTTP, instant sleeps).
let fetchImpl = (...args) => fetch(...args);
let sleepImpl = (ms) => new Promise((r) => { setTimeout(r, ms); });
function _setFetch(fn) { fetchImpl = fn || ((...args) => fetch(...args)); }
function _setSleep(fn) { sleepImpl = fn || ((ms) => new Promise((r) => { setTimeout(r, ms); })); }
function _reset() {
  cooldown.clear(); noTools.clear(); noReasoningParams.clear();
  stoodDownUntil = 0; stoodDownWhy = null; pausedUntil = 0;
  Object.assign(health, { lastOk: 0, failingSince: 0, failures: [], down: false, downSince: 0, lastProbe: 0, probing: false, lastProbeResult: null });
  limiter.stamps = []; limiter.active = 0; limiter.learnerActive = 0; limiter.queue = []; limiter.perModel = new Map();
  if (limiter.timer) clearTimeout(limiter.timer);
  limiter.timer = null;
  lineupCache = null; lineupStamp = null;
}

function headers() {
  return {
    Authorization: `Bearer ${String(process.env.NVIDIA_API_KEY || '').trim()}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

/** One HTTP request, with a timeout. Throws an Error carrying .status and .retryAfterMs. */
async function post(body, timeoutMs, stream = false, signal = null) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  // services/pool.js cancels the losing copy of a hedged call through `signal`.
  if (signal) { if (signal.aborted) ctrl.abort(); else signal.addEventListener('abort', () => ctrl.abort(), { once: true }); }
  let res;
  try {
    res = await fetchImpl(`${BASE_URL()}/chat/completions`, {
      method: 'POST',
      headers: { ...headers(), ...(stream ? { Accept: 'text/event-stream' } : {}) },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const e = new Error(ctrl.signal.aborted ? `nvidia timeout after ${Math.round(timeoutMs / 1000)}s` : `nvidia network error: ${err.message}`);
    e.status = 0;
    e.timeout = ctrl.signal.aborted;
    throw e;
  }
  if (!res.ok) {
    clearTimeout(timer);
    let detail = res.statusText || '';
    let payload = null;
    try {
      const text = await res.text();
      try { payload = JSON.parse(text); } catch { payload = { raw: text }; }
      detail = (payload && ((payload.error && (payload.error.message || payload.error)) || payload.detail || payload.title || payload.raw)) || detail;
    } catch { /* keep statusText */ }
    const e = new Error(`nvidia ${res.status}: ${String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 240)}`);
    e.status = res.status;
    e.body = payload;
    const ra = res.headers && res.headers.get ? res.headers.get('retry-after') : null;
    if (ra && !Number.isNaN(Number(ra))) e.retryAfterMs = Number(ra) * 1000;
    throw e;
  }
  noteSuccess();
  if (stream) return { res, done: () => clearTimeout(timer), ctrl };
  try {
    const payload = await res.json();
    if (payload && payload.error && !payload.choices) {
      const e = new Error(`nvidia: ${String(payload.error.message || payload.error).slice(0, 200)}`);
      e.status = Number(payload.error.code) || 502;
      throw e;
    }
    return payload;
  } catch (err) {
    if (err.status) throw err;
    const e = new Error(ctrl.signal.aborted ? `nvidia timeout after ${Math.round(timeoutMs / 1000)}s` : `nvidia: unreadable response (${err.message})`);
    e.status = 0;
    e.timeout = ctrl.signal.aborted;
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

const RETRYABLE = new Set([0, 408, 409, 425, 429, 500, 502, 503, 504]);

function backoffMs(err, attempt) {
  const jitter = 0.8 + Math.random() * 0.4;
  if (err.status === 429) return Math.min(60000, err.retryAfterMs || (3000 * (2 ** attempt))) * jitter;
  return Math.min(30000, 1500 * (2 ** attempt)) * jitter;
}

function usageOf(payload) {
  const u = (payload && payload.usage) || {};
  const usage = {
    input_tokens: u.prompt_tokens || 0,
    output_tokens: u.completion_tokens || 0,
    reasoning_tokens: (u.completion_tokens_details && u.completion_tokens_details.reasoning_tokens) || 0,
    cost_usd: 0,
  };
  if (payload && payload.usage) recordUsage(payload.model || 'unknown', { ok: 1, ...usage });
  return usage;
}

/**
 * A running count of what this key has used, per UTC day and model, in
 * data/nvidia-usage.json. NVIDIA shows no usage meter, only "40 RPM", so this is the
 * only record of how much of the free allowance the app and scripts have spent, and
 * of which models are refusing (429) and when. Tests use fake keys and are skipped.
 */
const USAGE_FILE = () => process.env.NVIDIA_USAGE_FILE || path.join(__dirname, '..', '..', 'data', 'nvidia-usage.json');
let usagePending = null;
let usageTimer = null;
function usageOff() {
  const key = String(process.env.NVIDIA_API_KEY || '').trim();
  return !key || /^test/i.test(key) || process.env.NVIDIA_USAGE_FILE === 'off';
}
function recordUsage(model, counts) {
  if (usageOff()) return;
  const day = new Date().toISOString().slice(0, 10);
  usagePending = usagePending || {};
  const row = ((usagePending[day] = usagePending[day] || {})[model] = usagePending[day][model] || {});
  for (const [k, v] of Object.entries(counts)) if (k !== 'cost_usd') row[k] = (row[k] || 0) + (Number(v) || 0);
  if (!usageTimer) {
    usageTimer = setTimeout(flushUsage, 5000);
    if (usageTimer.unref) usageTimer.unref();
  }
}
function flushUsage() {
  usageTimer = null;
  if (!usagePending) return;
  const pending = usagePending;
  usagePending = null;
  try {
    const file = USAGE_FILE();
    let all = {};
    try { all = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { all = {}; }
    for (const [day, models] of Object.entries(pending)) {
      for (const [model, counts] of Object.entries(models)) {
        const row = ((all[day] = all[day] || {})[model] = all[day][model] || {});
        for (const [k, v] of Object.entries(counts)) row[k] = (row[k] || 0) + v;
      }
    }
    fs.writeFileSync(file, `${JSON.stringify(all, null, 1)}\n`);
  } catch (err) {
    console.warn(`ai: could not write the NVIDIA usage record: ${err.message}`);
  }
}
process.on('exit', flushUsage);

/**
 * Send one body to one model with retries. Returns the payload or throws the last
 * error (with .moveOn = true when the next model should be tried).
 */
async function sendWithRetries(entry, buildBody, { interactive, timeoutMs, attempts, signal = null, task = null }) {
  const cls = learnerClass(task);
  const tries = attempts || (interactive ? 2 : 4);
  let lastErr = null;
  let effort = entry.effort;
  for (let attempt = 0; attempt < tries; attempt++) {
    if (signal && signal.aborted) throw Object.assign(new Error('nvidia: aborted by the caller'), { status: 0, aborted: true, moveOn: false });
    const body = buildBody({ ...entry, effort });
    await acquire(interactive ? 'interactive' : 'background', entry.model, cls);
    try {
      const payload = await post(body, timeoutFor(effort, timeoutMs), false, signal);
      return payload;
    } catch (err) {
      lastErr = err;
      // The caller gave up on this request (a hedged copy that lost): no retry, no health note.
      if (signal && signal.aborted) { err.aborted = true; err.moveOn = false; throw err; }
      noteFailure(err);
      if (err.status === 401 || err.status === 403) {
        stoodDownUntil = now() + 10 * 60 * 1000;
        stoodDownWhy = err.status === 401 ? 'API key rejected' : 'forbidden';
        console.warn(`ai: NVIDIA says "${String(err.message).slice(0, 120)}". Standing down for 10 minutes.`);
        err.moveOn = false;
        throw err;
      }
      if (err.status === 404) {
        coolDown(entry.model, 60 * 60 * 1000, 'model not found');
        err.moveOn = true;
        throw err;
      }
      if (err.status === 400 || err.status === 422) {
        const text = `${err.message} ${JSON.stringify(err.body || {})}`;
        if (/chat_template|enable_thinking|reasoning|thinking/i.test(text) && !noReasoningParams.has(entry.model)) {
          noReasoningParams.add(entry.model);
          continue; // ask again without the reasoning switch
        }
        if (/tool/i.test(text) && body.tools && !noTools.has(entry.model)) {
          noTools.add(entry.model);
          continue; // ask again with JSON in the content instead of a tool
        }
        err.moveOn = true;
        throw err;
      }
      if (!RETRYABLE.has(err.status)) { err.moveOn = true; throw err; }
      recordUsage(entry.model, err.status === 429 ? { rate_limited: 1 } : { failed: 1 });
      if (err.status === 429) pausedUntil = Math.max(pausedUntil, now() + Math.min(5000, err.retryAfterMs || 2000));
      // Thinking at max ran into the gateway's ~5-minute cut-off: the same request
      // would meet it again, so the next try thinks at high instead.
      if (effort === 'max' && (err.status === 504 || err.timeout)) effort = 'high';
      if (attempt < tries - 1) await sleepImpl(backoffMs(err, attempt));
    } finally {
      release(entry.model, cls);
    }
  }
  // Retryable failures used up: rest this model briefly so the next calls go
  // straight to its backup instead of paying the same wait.
  coolDown(entry.model, lastErr && lastErr.status === 429 ? 60000 : 90000, lastErr ? lastErr.message.slice(0, 80) : 'failed');
  if (lastErr) lastErr.moveOn = true;
  throw lastErr || new Error('nvidia: no attempt made');
}

function messagesFor(system, messages) {
  return [
    ...(system ? [{ role: 'system', content: String(system) }] : []),
    ...(messages || []).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '') })),
  ];
}

function effectiveEffort(configured, asked) {
  // A caller may raise the effort (a repair asks for "high"); it never lowers what
  // the lineup set, because the lineup's effort is the one that was measured.
  if (!asked || !EFFORTS.includes(asked)) return configured;
  return EFFORTS.indexOf(asked) > EFFORTS.indexOf(configured) ? asked : configured;
}

function baseBody(entry, { messages, maxTokens, temperature }) {
  const reasoning = noReasoningParams.has(entry.model) ? {} : reasoningParams(entry.model, entry.effort);
  return {
    model: entry.model,
    messages,
    max_tokens: maxTokensFor(entry.model, entry.effort, maxTokens),
    ...(temperature != null ? { temperature } : {}),
    ...reasoning,
  };
}

function isInteractive(role, lane) {
  if (lane === 'interactive') return true;
  if (lane === 'background' || lane === 'parallel') return false;
  return role === 'fast' || role === 'check';
}

/**
 * One structured call: JSON matching `schema`, validated and repaired.
 * Returns { data, usage, model, effort, tier } or null (answered, nothing usable).
 * Throws when no model could answer at all, so services/ai.js moves to the next provider.
 */
async function structured({ role = 'fast', task = null, system, user, schema, schemaName = 'submit', maxTokens = 4096, effort = null, lane, models = null, timeoutMs = null, attempts = null, signal = null }) {
  if (!isConfigured()) return null;
  const chosen = models ? { tier: 'explicit', entries: normalizeEntries(models) } : plan(role, task);
  const entries = chosen.entries.filter((e) => models || !coolingDown(e.model));
  if (!entries.length) throw Object.assign(new Error('nvidia: every model for this role is resting'), { status: 503 });
  const interactive = isInteractive(role, lane);
  const instruction = `Give your answer by calling the ${schemaName} tool exactly once, with arguments that match its JSON schema.`;
  let lastErr = null;
  let answeredButUnusable = false;

  for (const raw of entries) {
    const entry = { ...raw, effort: effectiveEffort(raw.effort, effort) };
    const toolMode = () => !noTools.has(entry.model);
    const baseMessages = () => messagesFor(
      toolMode() ? `${system || ''}\n\n${instruction}`.trim()
        : `${system || ''}\n\nReply with one JSON object only (no prose, no code fence) matching this JSON schema:\n${JSON.stringify(schema)}`.trim(),
      [{ role: 'user', content: user }],
    );
    const build = (msgs) => (e) => ({
      ...baseBody(e, { messages: msgs || baseMessages(), maxTokens }),
      ...(toolMode() ? {
        tools: [{ type: 'function', function: { name: schemaName, description: 'Submit the result. Call this exactly once.', parameters: schema } }],
        tool_choice: 'auto',
      } : { response_format: { type: 'json_object' } }),
    });
    let payload;
    try {
      payload = await sendWithRetries(entry, build(null), { interactive, timeoutMs, attempts, signal, task });
    } catch (err) {
      lastErr = err;
      if (err.moveOn === false) throw err;
      continue;
    }
    const usage = usageOf(payload);
    let choice = payload && payload.choices && payload.choices[0];
    let parsed = sj.parseStructured(choice && choice.message, schemaName);
    let checked = parsed.data !== undefined ? sj.validate(schema, parsed.data) : null;
    if (checked && !checked.errors.length) {
      return { data: checked.value, usage, model: payload.model || entry.model, effort: entry.effort, tier: chosen.tier };
    }
    // One repair turn on the same model: show it what it sent and exactly what is wrong.
    const problems = checked ? checked.errors.slice(0, 12).join('; ') : parsed.error;
    const finish = choice && choice.finish_reason;
    const repairMessages = [
      ...baseMessages(),
      { role: 'assistant', content: String(parsed.raw || '').slice(0, 8000) || '(no answer)' },
      { role: 'user', content: `That answer could not be used: ${problems}${finish === 'length' ? ' (it was cut off: be more concise)' : ''}. Send the complete corrected answer now${toolMode() ? ` by calling ${schemaName}` : ' as one JSON object'}.` },
    ];
    try {
      payload = await sendWithRetries(entry, build(repairMessages), { interactive, timeoutMs, attempts: 1, signal, task });
      const u2 = usageOf(payload);
      usage.input_tokens += u2.input_tokens;
      usage.output_tokens += u2.output_tokens;
      usage.reasoning_tokens += u2.reasoning_tokens;
      choice = payload && payload.choices && payload.choices[0];
      parsed = sj.parseStructured(choice && choice.message, schemaName);
      checked = parsed.data !== undefined ? sj.validate(schema, parsed.data) : null;
      if (checked && !checked.errors.length) {
        return { data: checked.value, usage, model: payload.model || entry.model, effort: entry.effort, tier: chosen.tier, repaired: true };
      }
    } catch (err) {
      lastErr = err;
      if (err.moveOn === false) throw err;
    }
    answeredButUnusable = true;
    console.warn(`ai: NVIDIA ${entry.model} gave an unusable ${schemaName} (${String(problems).slice(0, 160)}); trying the next model`);
  }
  // Nothing usable from any free model: throw, so the chain moves on to the last
  // resort rather than ending the call here.
  if (answeredButUnusable) throw Object.assign(new Error(`nvidia: no model returned a usable ${schemaName}`), { status: 422, unusable: true });
  throw lastErr || new Error('nvidia: no usable answer');
}

/** The same, for callers written against MiMo's streamed structured call. */
const structuredStream = (args) => structured(args);

/** One plain-text exchange. Returns { text, usage, model } or null; throws when nothing answered. */
async function chat({ role = 'fast', task = null, system, messages, maxTokens = 1024, effort = null, lane, model: wanted = null, timeoutMs = null, attempts = null, signal = null }) {
  if (!isConfigured()) return null;
  const chosen = wanted ? { tier: 'explicit', entries: normalizeEntries([wanted]) } : plan(role, task);
  const entries = chosen.entries.filter((e) => wanted || !coolingDown(e.model));
  if (!entries.length) throw Object.assign(new Error('nvidia: every model for this role is resting'), { status: 503 });
  const interactive = isInteractive(role, lane);
  let lastErr = null;
  for (const raw of entries) {
    const entry = { ...raw, effort: effectiveEffort(raw.effort, effort) };
    try {
      const payload = await sendWithRetries(entry, (e) => baseBody(e, { messages: messagesFor(system, messages), maxTokens }), { interactive, timeoutMs, attempts, signal, task });
      const msg = payload && payload.choices && payload.choices[0] && payload.choices[0].message;
      const text = sj.stripThinking(msg && msg.content);
      if (text) return { text, usage: usageOf(payload), model: payload.model || entry.model, effort: entry.effort, tier: chosen.tier };
      const finish = payload && payload.choices && payload.choices[0] && payload.choices[0].finish_reason;
      console.warn(`ai: NVIDIA ${entry.model} returned no text${finish === 'length' ? ' (its thinking used the whole token budget)' : ''}; trying the next model`);
    } catch (err) {
      lastErr = err;
      if (err.moveOn === false) throw err;
    }
  }
  throw lastErr || Object.assign(new Error('nvidia: no model returned text'), { status: 422, unusable: true });
}

/**
 * The same exchange streamed (the coach). Thinking deltas (`reasoning_content`) are
 * not shown; only answer text reaches onDelta. A model that fails before its first
 * answer fragment is replaced by the next one; after that the error is thrown, and
 * services/ai.js falls back to the unstreamed path.
 */
async function chatStream({ role = 'fast', task = null, system, messages, maxTokens = 1024, effort = null, onDelta, timeoutMs = null }) {
  if (!isConfigured()) return null;
  const chosen = plan(role, task);
  const entries = chosen.entries.filter((e) => !coolingDown(e.model));
  if (!entries.length) throw Object.assign(new Error('nvidia: every model for this role is resting'), { status: 503 });
  let lastErr = null;
  for (const raw of entries) {
    const entry = { ...raw, effort: effectiveEffort(raw.effort, effort) };
    let emitted = false;
    const cls = learnerClass(task);
    await acquire('interactive', entry.model, cls);
    try {
      const body = { ...baseBody(entry, { messages: messagesFor(system, messages), maxTokens }), stream: true, stream_options: { include_usage: true } };
      const { res, done } = await post(body, timeoutFor(entry.effort, timeoutMs), true);
      const decoder = new TextDecoder();
      let buffer = '';
      let full = '';
      let usage = null;
      let served = entry.model;
      let inThink = false;
      try {
        for await (const chunk of res.body) {
          buffer += decoder.decode(chunk, { stream: true }).replace(/\r\n/g, '\n');
          const frames = buffer.split('\n\n');
          buffer = frames.pop() || '';
          for (const frame of frames) {
            const line = frame.split('\n').find((l) => l.startsWith('data:'));
            if (!line) continue;
            const json = line.slice(5).trim();
            if (!json || json === '[DONE]') continue;
            let payload;
            try { payload = JSON.parse(json); } catch { continue; }
            if (payload.model) served = payload.model;
            if (payload.usage) usage = usageOf(payload);
            const delta = payload.choices && payload.choices[0] && payload.choices[0].delta;
            let text = delta && typeof delta.content === 'string' ? delta.content : '';
            if (!text) continue;
            // Inline <think> blocks in content are dropped as they stream.
            if (inThink || text.includes('<think>')) {
              const combined = text;
              const open = combined.indexOf('<think>');
              const close = combined.indexOf('</think>');
              if (!inThink && open !== -1) { inThink = true; text = combined.slice(0, open); if (close > open) { inThink = false; text += combined.slice(close + 8); } }
              else if (inThink) { if (close !== -1) { inThink = false; text = combined.slice(close + 8); } else text = ''; }
            }
            if (!text) continue;
            full += text;
            emitted = true;
            if (onDelta) onDelta(text, full);
          }
        }
      } finally {
        done();
      }
      const trimmed = full.trim();
      if (trimmed) return { text: trimmed, usage: usage || { input_tokens: 0, output_tokens: 0, cost_usd: 0 }, model: served, effort: entry.effort, tier: chosen.tier };
    } catch (err) {
      lastErr = err;
      noteFailure(err);
      if (err.status === 401 || err.status === 403) {
        stoodDownUntil = now() + 10 * 60 * 1000;
        stoodDownWhy = err.status === 401 ? 'API key rejected' : 'forbidden';
        throw err;
      }
      if (emitted) throw err;
      if (err.status === 429 || err.status === 0 || (err.status >= 500)) coolDown(entry.model, 30000, err.message.slice(0, 80));
    } finally {
      release(entry.model, cls);
    }
  }
  if (lastErr) throw lastErr;
  return null;
}

/** Free: the per-user daily ceiling is bounded by the call count, not by cents. */
function costCents() {
  return 0;
}

function describeError(err) {
  return err && err.message ? err.message : String(err);
}

async function listModels() {
  const res = await fetchImpl(`${BASE_URL()}/models`, { headers: headers() });
  if (!res.ok) throw new Error(`nvidia ${res.status}: ${res.statusText}`);
  const data = await res.json();
  return (data.data || []).map((m) => ({ id: m.id, display: (PROFILES[m.id] && PROFILES[m.id].label) || m.id, methods: ['chat.completions'] }));
}

module.exports = {
  name: 'nvidia',
  isEnabled,
  isConfigured,
  status,
  modelFor,
  plan,
  poolModels,
  structured,
  structuredStream,
  chat,
  chatStream,
  costCents,
  describeError,
  listModels,
  reasoningParams,
  maxTokensFor,
  readLineup,
  tierForRole,
  outage,
  probe,
  learnerBusy,
  learnerClass,
  PROFILES,
  TIERS,
  EFFORTS,
  _setFetch,
  _setSleep,
  _reset,
};
