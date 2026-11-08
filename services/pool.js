/**
 * The model pool (owner, 2026-10-27): big AI jobs use ALL the free providers at once,
 * cheap paid ones only when that makes the job finish meaningfully sooner, the last
 * items of a batch finish at about the same time, and a single call never hangs for
 * 25 minutes.
 *
 * Three pieces, all in this file:
 *
 *   1. A registry of SLOTS (provider + model, one unit of capacity). Each slot has a
 *      concurrency cap, an RPM budget (shared inside a group, e.g. NVIDIA's one key),
 *      an optional daily token cap (xKiro's free plan), a price per Mtok in and out
 *      ($0 for free), a data class ("learner" or "pipeline") and LIVE stats: latency
 *      EWMA, p75 / p90 of recent calls, an error rate, and a circuit breaker (open after
 *      repeated 5xx / timeouts / rate limits, half-open one probe call later).
 *      Slots for the app's own chain (services/providers/index.js `chain`, in its
 *      preference order) are built from the existing providers and call their existing
 *      structured / chat functions; further slots (xKiro, UnoRouter, Standard Compute)
 *      are listed in config/model-lineup.json "pool".
 *
 *   2. runBatch(items, opts): ONE shared queue; every slot runs worker loops that PULL
 *      the next item when free (work stealing), so fast slots take more and finish times
 *      even out. Free slots always pull. A paid slot pulls only when (a) the free-only
 *      projected finish time (remaining items / measured free throughput) is past the
 *      deadline (opts.deadline | opts.deadlineMs | opts.targetMinutes), (b) adding it
 *      makes the finish meaningfully sooner, and (c) its ledger can reserve the cost.
 *      Tail hedging: when the queue is empty and a slot is idle, the oldest in-flight
 *      item whose elapsed time is past its slot's p75 is re-issued onto the fastest idle
 *      slot (free preferred; paid only within budget and the deadline rule); the first
 *      VALID result wins and the other copies are aborted (AbortController). Each item
 *      has at most 2 extra copies. The report gives per-slot counts, cost and the
 *      finish-time spread.
 *
 *   3. callHedged(req, opts): one call. The best free slot for the task starts; if there
 *      is no valid result by hedgeAfterMs (that slot's p90, clamped to 20 s .. 90 s) one
 *      more starts (next free, then a cheap paid one within budget); the first valid
 *      answer wins and the rest are cancelled. Every attempt has a HARD timeout (default
 *      120 s, per task in config "pool.tasks.<task>.timeout_ms"), and the whole call is
 *      bounded too (default 2.5x). The caller's `validate` decides what counts as a
 *      valid answer; an invalid answer is a failure and the call goes elsewhere.
 *
 * Rules enforced here (hard):
 *   - QUALITY: a slot outside the app's chain serves a task only if config "pool.tasks"
 *     lists it as good enough for that task; any slot can be denied per task.
 *   - DATA: a "pipeline" slot (xKiro, UnoRouter, Standard Compute, Munito, Modelflare) never gets
 *     a request unless the caller marked it dataClass "pipeline" AND gave no userId.
 *     Everything defaults to "learner", which only the app's chain slots may serve.
 *   - SPEND: OpenRouter only through free-apis.js (":free" ids, $0 price cap); Anthropic
 *     only through services/anthropic-ledger.js (the provider reserves each call; this
 *     file pre-checks headroom); Munito only through services/munito-ledger.js ($100 total); Standard Compute only through
 *     services/standard-compute-ledger.js ($15 total). LLM Gateway is not used for text.
 *
 * Env: AI_POOL=0 (services/ai.js bypasses the pool), POOL_TIMEOUT_MS, POOL_HEDGE_MIN_MS,
 * POOL_HEDGE_MAX_MS, POOL_BUSY_WAIT_MS, POOL_BREAKER_THRESHOLD, POOL_BREAKER_OPEN_MS. See
 * curriculum-build/MODEL-LINEUP.md ("The model pool").
 */
const fs = require('fs');
const path = require('path');

const DEFAULT_TIMEOUT_MS = () => Number(process.env.POOL_TIMEOUT_MS || 120000);
const HEDGE_MIN_MS = () => Number(process.env.POOL_HEDGE_MIN_MS || 20000);
const HEDGE_MAX_MS = () => Number(process.env.POOL_HEDGE_MAX_MS || 90000);
const busyWaitMs = () => Number(process.env.POOL_BUSY_WAIT_MS || 3000);
const MAX_EXTRA_COPIES = 2;
const LATENCY_WINDOW = 50;
const OUTCOME_WINDOW = 20;

const now = () => Date.now();
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const providersLib = () => require('./providers'); // eslint-disable-line global-require

// ── who is waiting (owner, 3 Nov 2026: a waiting learner comes first) ───────────────────────────────────────────────
// A call is FOREGROUND (a learner is waiting on it: the default) or BACKGROUND (write-ahead, builds nobody waits on). The lane
// travels with the async call chain (AsyncLocalStorage), so no caller has to pass it down. Two rules follow:
//   - a free slot keeps POOL_FOREGROUND_RESERVE (1) permit that background calls may not take, so a waiting learner always finds
//     room however much is being written ahead;
//   - a foreground call that has waited POOL_FOREGROUND_HEDGE_MS (8 s) with every free slot busy or slow goes to the cheapest
//     capable paid slot the task allows (Munito); a background call never does that for speed (a paid slot is its last resort,
//     after every free one failed).
// The store is an object so a background write that a learner then asks for can be promoted in place (promote()).
const { AsyncLocalStorage } = require('async_hooks');

const lane = new AsyncLocalStorage();
const fgReserve = () => Math.max(0, Number(process.env.POOL_FOREGROUND_RESERVE == null || process.env.POOL_FOREGROUND_RESERVE === '' ? 1 : process.env.POOL_FOREGROUND_RESERVE));
const fgHedgeMs = () => Number(process.env.POOL_FOREGROUND_HEDGE_MS || 8000);
/** Run fn as background work: its AI calls leave a permit free for waiting learners and never pay for speed. */
function runBackground(fn) { return lane.run({ background: true }, fn); }
/** Run fn as work a learner is waiting on, even from inside background work. `fast`: the first level after placement, written on Coral Fast first. */
function runForeground(fn, { fast = false, speculative = false } = {}) { return lane.run({ background: false, fast: !!fast, speculative: !!speculative }, fn); }
/** The current lane store (null outside any lane); pass it to promote() later. */
function laneStore() { return lane.getStore() || null; }
/** True when the current async context is background work. */
function inBackground() { const st = lane.getStore(); return !!(st && st.background); }
/** A learner now waits on work that was started in the background: its later calls are foreground. */
function promote(store) { if (store) { store.background = false; store.speculative = false; } }

// ── a learner waiting on a first level outranks speculative writes (owner, 5 Nov 2026) ───────────────────────────────
// Speculative = a prewrite during placement (nobody waits on it yet). WAITING = the fast lane without that mark. Three rules:
//   - a speculative call never takes the last POOL_SPECULATIVE_RESERVE (1) permits of a fast slot, and never starts while a waiting call is
//     pending anywhere (queued calls: the waiting one is polled first and the speculative one stays blocked until none is pending);
//   - a waiting call has a per-attempt deadline (POOL_WAITING_DEADLINE_MS, 45 s) after which it moves on to the next fast slot instead of
//     sitting 340 to 465 s on a slow one; its whole call is bounded to 3 attempts' worth.
const specReserve = () => Math.max(0, Number(process.env.POOL_SPECULATIVE_RESERVE == null || process.env.POOL_SPECULATIVE_RESERVE === '' ? 1 : process.env.POOL_SPECULATIVE_RESERVE));
const waitingDeadlineMs = () => Number(process.env.POOL_WAITING_DEADLINE_MS || 45000);
let waitingPending = 0; // waiting-lane calls in callHedged now
const isWaitingStore = (st) => !!(st && st.fast && st.background === false && !st.speculative);
const isSpecStore = (st) => !!(st && st.fast && st.background === false && st.speculative);

// ── change notification: a free permit, a finished item ────────────────────────
const waiters = new Set();
function notify() { for (const w of [...waiters]) w(); }
function waitChange(ms) {
  return new Promise((resolve) => {
    const done = () => { clearTimeout(timer); waiters.delete(done); resolve(); };
    const timer = setTimeout(done, Math.max(1, ms));
    waiters.add(done);
  });
}

// ── config: config/model-lineup.json "pool" ────────────────────────────────────
let cfgCache = null;
let cfgStamp = null;
function lineupFile() { return process.env.MODEL_LINEUP_FILE || path.join(__dirname, '..', 'config', 'model-lineup.json'); }
let cfgCheckedAt = 0;
function poolConfig() {
  // In production the file is looked at every POOL_CONFIG_CHECK_MS (5 s): this runs for every slot of every waiting call, and that stat was an
  // eighth of the server's time at 100 learners (beta load test, Nov 2026). Elsewhere every call looks, as tests rewrite the file.
  const every = Number(process.env.POOL_CONFIG_CHECK_MS || (process.env.NODE_ENV === 'production' ? 5000 : 0));
  if (every && cfgCache && now() - cfgCheckedAt < every) return cfgCache;
  cfgCheckedAt = now();
  const file = lineupFile();
  let stamp = null;
  try { stamp = `${file}:${fs.statSync(file).mtimeMs}`; } catch { stamp = `${file}:missing`; }
  if (cfgCache && stamp === cfgStamp) return cfgCache;
  let pool = {};
  try { pool = JSON.parse(fs.readFileSync(file, 'utf8')).pool || {}; } catch { pool = {}; }
  cfgCache = pool;
  cfgStamp = stamp;
  return pool;
}

const globCache = new Map();
function globToRegExp(glob) {
  if (!globCache.has(glob)) globCache.set(glob, new RegExp(`^${String(glob).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`));
  return globCache.get(glob);
}
const matchesAny = (id, list) => (list || []).some((g) => globToRegExp(g).test(id));

// ── slots ──────────────────────────────────────────────────────────────────────
const registry = new Map(); // id -> Slot
const rpmStamps = new Map(); // group -> [timestamps]
const groupInFlight = new Map(); // group -> n
const groupCaps = new Map(); // group -> max concurrent

function pct(sorted, q) {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[i];
}

class Slot {
  constructor(spec) {
    this.id = spec.id;
    this.provider = spec.provider || spec.id.split(':')[0];
    this.model = spec.model || null;
    this.effort = spec.effort || null;
    this.label = spec.label || spec.id;
    this.family = spec.family || null;
    this.priceIn = Number(spec.priceIn || 0);
    this.priceOut = Number(spec.priceOut || 0);
    this.paid = this.priceIn > 0 || this.priceOut > 0;
    this.dataClass = spec.dataClass === 'pipeline' ? 'pipeline' : 'learner';
    this.maxConcurrent = Math.max(1, spec.maxConcurrent || 1);
    this.rpm = spec.rpm || null;
    this.rpmGroup = spec.rpmGroup || spec.id;
    this.group = spec.group || null; // shared concurrency group (NVIDIA's key)
    this.groupReserveBg = spec.groupReserveBg || 0; // permits of the group a background call on this slot leaves free for waiting learners (paid slots too)
    this.dailyTokens = spec.dailyTokens || null; // () => tokens left today, or null
    this.timeoutMs = spec.timeoutMs || null;
    this.latencyHintMs = spec.latencyHintMs || 30000;
    this.supports = spec.supports || ['structured', 'chat'];
    this.hedgeable = spec.hedgeable !== false; // a paid last resort (Claude) is not a hedge
    this.extra = !!spec.extra; // not part of the app's chain: needs a config allowlist
    this.fast = !!spec.fast; // a fast paid slot: waiting learners only (Coral Fast)
    this.preferred = !!spec.preferred; // goes first, paid or not (the tutor's Standard Compute slot)
    this.call = spec.call; // async (req, ctx) -> result
    this.estimateUsd = spec.estimateUsd || null; // (req) -> usd, paid slots
    this.canSpend = spec.canSpend || null; // (usd) -> bool, paid slots
    this.costOf = spec.costOf || null; // (result) -> usd
    this.enabled = spec.enabled || null; // () -> bool
    this.resetStats();
  }

  resetStats() {
    this.inFlight = 0;
    this.latencies = [];
    this.ewma = null;
    this.outcomes = [];
    this.stats = { started: 0, ok: 0, invalid: 0, failed: 0, aborted: 0, wins: 0, hedged: 0, costUsd: 0 };
    this.breaker = { state: 'closed', consecutive: 0, invalidRun: 0, opens: 0, openUntil: 0, probing: false, reason: null };
  }

  /** Percentile of recent successful calls; falls back to the hint scaled by q while there are too few. */
  latency(q) {
    if (this.latencies.length >= 3) return pct([...this.latencies].sort((a, b) => a - b), q);
    const base = this.ewma || this.latencyHintMs;
    return base * (q >= 0.9 ? 1.8 : q >= 0.75 ? 1.3 : 1);
  }

  get p75() { return this.latency(0.75); }

  get p90() { return this.latency(0.9); }

  get speedMs() { return this.ewma || this.latencyHintMs; }

  /** Speed, worse with errors: a fast slot that mostly fails is not the one to hedge onto. */
  get score() { return this.speedMs * (1 + 3 * this.errorRate()); }

  errorRate() { return this.outcomes.length ? this.outcomes.reduce((a, b) => a + b, 0) / this.outcomes.length : 0; }

  isEnabled() { try { return this.enabled ? !!this.enabled() : true; } catch { return false; } }

  // ── breaker ──
  breakerOpen() {
    const b = this.breaker;
    if (b.state === 'closed') return false;
    if (b.state === 'open' && now() >= b.openUntil) { b.state = 'half-open'; b.probing = false; }
    if (b.state === 'half-open') return b.probing; // one probe at a time
    return true;
  }

  /** Claim the half-open probe, if that is the state. */
  claimProbe() { if (this.breaker.state === 'half-open') this.breaker.probing = true; }

  open(ms, reason) {
    const b = this.breaker;
    b.state = 'open';
    b.opens++;
    b.openUntil = now() + ms;
    b.probing = false;
    b.reason = reason;
  }

  noteOk(ms) {
    this.stats.ok++;
    this.latencies.push(ms);
    if (this.latencies.length > LATENCY_WINDOW) this.latencies.shift();
    this.ewma = this.ewma == null ? ms : 0.3 * ms + 0.7 * this.ewma;
    this.outcomes.push(0);
    if (this.outcomes.length > OUTCOME_WINDOW) this.outcomes.shift();
    const b = this.breaker;
    b.consecutive = 0;
    b.invalidRun = 0;
    if (b.state !== 'closed') { b.state = 'closed'; b.probing = false; b.reason = null; }
  }

  noteFail(kind, err) {
    this.outcomes.push(1);
    if (this.outcomes.length > OUTCOME_WINDOW) this.outcomes.shift();
    const b = this.breaker;
    const threshold = Number(process.env.POOL_BREAKER_THRESHOLD || poolConfig().breaker_threshold || 3);
    const baseOpen = Number(process.env.POOL_BREAKER_OPEN_MS || poolConfig().breaker_open_ms || 30000);
    const backoff = Math.min(10 * 60 * 1000, baseOpen * 2 ** Math.min(b.opens, 5));
    if (kind === 'deadline') { this.stats.failed++; return; } // counts as a failure in the stats, never opens the breaker
    if (kind === 'invalid') {
      this.stats.invalid++;
      b.invalidRun++;
      if (b.state === 'half-open') this.open(backoff, 'invalid answer on probe');
      else if (b.invalidRun >= 5) this.open(2 * 60 * 1000, '5 invalid answers in a row');
      return;
    }
    this.stats.failed++;
    b.invalidRun = 0;
    if (kind === 'hard') { this.open(10 * 60 * 1000, `refused: ${err && err.status}`); return; }
    if (kind === 'budget') { this.open(err && err.daily ? 60 * 60 * 1000 : 5 * 60 * 1000, 'budget'); return; }
    if (kind === 'rate') {
      const ra = err && err.retryAfterMs;
      b.consecutive++;
      this.open(err && err.daily ? 60 * 60 * 1000 : Math.min(ra || 15000 * 2 ** Math.min(b.consecutive - 1, 4), 5 * 60 * 1000), 'rate limited');
      return;
    }
    b.consecutive++;
    if (b.state === 'half-open') this.open(backoff, 'probe failed');
    else if (b.consecutive >= threshold) this.open(backoff, `${b.consecutive} failures in a row (${String(err && err.message).slice(0, 60)})`);
  }

  // ── limits ──
  hasPermit(background = false, speculative = false) {
    if (speculative && this.paid && waitingPending > 0) return false; // a waiting learner is pending: no speculative call starts on a paid slot
    if (speculative && this.fast && this.inFlight >= this.maxConcurrent - Math.min(specReserve(), this.maxConcurrent - 1)) return false;
    // Background calls leave fgReserve() permits for a waiting learner (a slot of one has none to spare; paid slots are never reserved).
    const spare = background && !this.paid ? Math.min(fgReserve(), this.maxConcurrent - 1) : 0;
    if (this.inFlight >= this.maxConcurrent - spare) return false;
    if (this.group) {
      const cap = groupCaps.get(this.group) || Infinity;
      const gspare = background && Number.isFinite(cap) ? (!this.paid ? Math.min(fgReserve(), cap - 1) : Math.min(this.groupReserveBg, cap - 1)) : 0;
      if ((groupInFlight.get(this.group) || 0) >= cap - gspare) return false;
    }
    return true;
  }

  /** ms until the RPM window has room (0 = now). */
  rpmWaitMs() {
    if (!this.rpm) return 0;
    const t = now();
    const stamps = (rpmStamps.get(this.rpmGroup) || []).filter((s) => t - s < 60000);
    rpmStamps.set(this.rpmGroup, stamps);
    return stamps.length < this.rpm ? 0 : stamps[0] + 60000 - t + 5;
  }

  tokensLeft() { if (!this.dailyTokens) return Infinity; try { return this.dailyTokens(); } catch { return 0; } }

  describe() {
    const sorted = [...this.latencies].sort((a, b) => a - b);
    return {
      id: this.id, paid: this.paid, data_class: this.dataClass, in_flight: this.inFlight, max_concurrent: this.maxConcurrent, rpm: this.rpm,
      price_per_mtok: { in: this.priceIn, out: this.priceOut }, ewma_ms: this.ewma ? Math.round(this.ewma) : null,
      p75_ms: sorted.length >= 3 ? pct(sorted, 0.75) : null, p90_ms: sorted.length >= 3 ? pct(sorted, 0.9) : null,
      error_rate: Number(this.errorRate().toFixed(2)), breaker: { ...this.breaker }, ...this.stats,
    };
  }
}

function registerSlot(spec) {
  const fresh = spec instanceof Slot ? spec : new Slot(spec);
  // ONE Slot object per id for the life of the process: an attempt in flight holds it and settles on it, so its
  // live state (in-flight count, latencies, breaker) must never move to a copy. A later registration only
  // refreshes the configuration (the provider objects and the lineup file can change between calls).
  const old = registry.get(fresh.id);
  let slot = fresh;
  if (old && old !== fresh) {
    const keep = new Set(['inFlight', 'latencies', 'ewma', 'outcomes', 'stats', 'breaker']);
    for (const k of Object.keys(fresh)) if (!keep.has(k)) old[k] = fresh[k];
    slot = old;
  }
  registry.set(slot.id, slot);
  if (slot.group && !groupCaps.has(slot.group)) groupCaps.set(slot.group, spec.groupMax || Infinity);
  return slot;
}

/** A slot for tests and scripts, not entered in the registry. */
function makeSlot(spec) { return new Slot(spec); }

function setGroup(name, max) { groupCaps.set(name, max); }

// ── building slots from the existing providers ─────────────────────────────────
/** A model's family, for callers that need two answers from independent families (the night runner's judges). */
function familyOfModel(model) {
  const m = String(model || '').toLowerCase();
  if (/glm/.test(m)) return 'glm';
  if (/deepseek/.test(m)) return 'deepseek';
  if (/nemotron/.test(m)) return 'nemotron';
  if (/gemma|gemini/.test(m)) return 'google';
  if (/qwen/.test(m)) return 'qwen';
  if (/mistral/.test(m)) return 'mistral';
  if (/minimax/.test(m)) return 'minimax';
  if (/claude/.test(m)) return 'anthropic';
  return null;
}
const reqKind = (req) => req.kind || (req.messages ? 'chat' : 'structured');
/** "pipeline" only when the caller says so AND no user is attached; everything else is learner data. */
const reqClass = (req) => (req.dataClass === 'pipeline' && !req.userId ? 'pipeline' : 'learner');

function effortHint(effort) {
  return { off: 4000, low: 12000, medium: 20000, high: 45000, max: 90000 }[effort] || 20000;
}

function chainArgs(req, kind, ctx, extra = {}) {
  const base = kind === 'chat'
    ? { role: req.role, task: req.task, system: req.system, messages: req.messages, maxTokens: req.maxTokens, effort: req.effort, lane: req.lane, ...(req.temperature != null ? { temperature: req.temperature } : {}), ...(typeof req.onDelta === 'function' ? { onDelta: req.onDelta } : {}) }
    : { role: req.role, task: req.task, system: req.system, user: req.user, schema: req.schema, schemaName: req.schemaName, maxTokens: req.maxTokens, effort: req.effort, lane: req.lane, think: req.think, ...(req.onText ? { onText: req.onText } : {}), ...(req.temperature != null ? { temperature: req.temperature } : {}) };
  return { ...base, timeoutMs: ctx.timeoutMs, signal: ctx.signal, ...extra };
}

function usdFromUsage(slot, model, usage) {
  if (!usage) return 0;
  if (Number.isFinite(usage.cost_usd)) return usage.cost_usd;
  return ((usage.input_tokens || 0) * slot.priceIn + (usage.output_tokens || 0) * slot.priceOut) / 1e6;
}

const reqChars = (req) => String(req.system || '').length + String(req.user || '').length + (req.messages || []).reduce((n, m) => n + String((m && m.content) || '').length, 0) + (req.schema ? JSON.stringify(req.schema).length : 0);
const estTokens = (req) => Math.ceil(reqChars(req) / 4) + (Number(req.maxTokens) || 1024);

/** Slots for one provider object of the app's chain. The call is the provider's own structured / chat. */
function expandProvider(p, req) {
  const role = req.role || 'fast';
  const task = req.task || null;
  const out = [];
  // `extra(kind)` adds the arguments that pin the call to this slot's model.
  const bind = (id, spec, extra) => {
    const slot = registerSlot({
      id, provider: p.name, supports: ['structured', 'chat'], dataClass: 'learner', family: familyOfModel(spec.model), ...spec,
      call: (rq, ctx) => {
        const kind = reqKind(rq);
        // The provider object is looked up at call time so a swapped provider (tests) is honoured.
        const prov = slotProviders.get(id) || p;
        return prov[kind](chainArgs(rq, kind, ctx, extra ? extra(kind) : {}));
      },
    });
    slotProviders.set(id, p);
    out.push(slot);
  };
  // xKiro is in the order() list only in a process with XKIRO_PIPELINE=1. Its slots come from config "pool.extra_slots"
  // (per-model rpm / concurrency / daily tokens and the per-task allowlist), never from the chain, so it cannot skip the gates.
  if (p.name === 'xkiro' || p.name === 'unorouter' || p.name === 'standard_compute' || p.name === 'munito' || p.name === 'gonka' || p.name === 'grokified' || p.name === 'lyceum' || p.name === 'zerogpu' || p.name === 'crouton') return out;
  if (p.name === 'nvidia' && typeof p.poolModels === 'function') {
    const cap = Math.max(1, Number(process.env.NVIDIA_MODEL_CONCURRENCY || 4));
    const rpm = Math.max(1, Number(process.env.NVIDIA_RPM || 36));
    groupCaps.set('nvidia', Math.max(1, Number(process.env.NVIDIA_CONCURRENCY || 8)));
    for (const e of p.poolModels(role, task)) {
      bind(`nvidia:${e.model}@${e.effort}`, { model: e.model, effort: e.effort, maxConcurrent: cap, rpm, rpmGroup: 'nvidia', group: 'nvidia', latencyHintMs: effortHint(e.effort), label: `NVIDIA ${e.model} @${e.effort}` },
        // one model, one try: a failure moves to the next slot instead of waiting out nvidia.js's own retries
        (kind) => (kind === 'chat' ? { model: { model: e.model, effort: e.effort }, attempts: 1 } : { models: [{ model: e.model, effort: e.effort }], attempts: 1 }));
    }
    return out;
  }
  if (p.name === 'openrouter_free' && typeof p.poolModels === 'function') {
    for (const m of p.poolModels()) {
      bind(`openrouter_free:${m}`, { model: m, maxConcurrent: 1, rpm: 12, rpmGroup: 'openrouter_free', latencyHintMs: 25000, label: `OpenRouter ${m}` }, () => ({ models: [m] }));
    }
    return out;
  }
  if (p.name === 'anthropic') {
    let model = null;
    try { model = p.modelFor(role, task); } catch { /* no model */ }
    const pr = (p.PRICES && p.PRICES[model]) || { input: 5, output: 25 };
    const led = require('./anthropic-ledger'); // eslint-disable-line global-require
    bind(`anthropic:${model || 'default'}`, {
      model, maxConcurrent: 4, rpm: 40, latencyHintMs: 15000, priceIn: pr.input, priceOut: pr.output, hedgeable: false, label: `Claude ${model}`,
      estimateUsd: (rq) => led.estimate({ model, inputChars: reqChars(rq), maxTokens: rq.maxTokens || 4096 }),
      canSpend: (usd) => led.canSpend(usd),
      costOf: (res) => led.costOf((res && res.model) || model, res && res.usage),
    });
    return out;
  }
  if (p.name === 'ollama') {
    bind('ollama:local', { model: 'local', maxConcurrent: 1, latencyHintMs: 40000, label: 'Ollama (local)' });
    return out;
  }
  if (p.name === 'gemini_free') {
    bind('gemini_free:default', { model: 'gemini', maxConcurrent: 2, rpm: 10, rpmGroup: 'gemini_free', latencyHintMs: 10000, label: 'Gemini free tier' });
    return out;
  }
  // Any other provider (a stub in a test, a provider added later): one slot, its own call.
  let model = null;
  try { model = p.modelFor ? p.modelFor(role, task) : null; } catch { /* none */ }
  bind(`${p.name}${model ? `:${model}` : ''}`, { model, maxConcurrent: 2, latencyHintMs: 20000 });
  return out;
}
const slotProviders = new Map(); // slot id -> provider object last seen in the chain

/** Extra (non-chain) slots from config "pool.extra_slots": xKiro, UnoRouter, Standard Compute, Munito, Gonka, Grokified. */
function extraSlots() {
  const cfg = poolConfig();
  const out = [];
  for (const e of cfg.extra_slots || []) {
    const adapter = ADAPTERS[e.provider];
    if (!adapter) continue;
    const slot = registerSlot({
      id: e.id, provider: e.provider, model: e.model, label: e.label || e.id, extra: true,
      priceIn: e.price_in || 0, priceOut: e.price_out || 0, dataClass: e.data_class === 'learner' ? 'learner' : 'pipeline',
      maxConcurrent: e.concurrency || 1, rpm: e.rpm || null, rpmGroup: e.rpm_group || e.id, latencyHintMs: e.hint_ms || 30000,
      supports: e.supports || adapter.supports, hedgeable: e.hedgeable !== false, fast: !!e.fast, timeoutMs: e.timeout_ms || null, family: e.family || null,
      group: e.group || null, groupMax: e.group_max || null, groupReserveBg: e.group_reserve_bg || 0, // an account-wide concurrency cap shared by several slots (Coral: 5 in flight in all, 6 Nov 2026)
      dailyTokens: adapter.dailyTokens ? () => adapter.dailyTokens(e) : null,
      enabled: () => adapter.enabled(e),
      call: (rq, ctx) => adapter.call(e, rq, ctx),
      estimateUsd: adapter.estimateUsd ? (rq) => adapter.estimateUsd(e, rq) : null,
      canSpend: adapter.canSpend ? (usd) => adapter.canSpend(usd) : null,
      costOf: adapter.costOf ? (res) => adapter.costOf(e, res) : null,
    });
    out.push(slot);
  }
  return out;
}

const lazyProv = (name) => providersLib().ALL[name] || require(`./providers/${name.replace(/_/g, '-')}`); // eslint-disable-line global-require, import/no-dynamic-require
const ADAPTERS = {
  xkiro: {
    supports: ['structured', 'chat'],
    enabled: () => { const p = providersLib().ALL.xkiro; return !!(p && p.isEnabled()); },
    dailyTokens: (e) => {
      const xk = require('./providers/xkiro'); // eslint-disable-line global-require
      const cap = xk.GRANTS()[e.model];
      if (cap) return Math.max(0, cap - xk.grantTokensUsed(e.model));
      return Math.max(0, Number(process.env.XKIRO_DAILY_TOKENS || 450000) - xk.freeTokensToday());
    },
    call: (e, rq, ctx) => {
      const p = providersLib().ALL.xkiro;
      const kind = reqKind(rq);
      const a = chainArgs(rq, kind, ctx, { models: [e.model] });
      if (kind === 'structured' && (rq.effort === 'high' || rq.effort === 'medium' || rq.effort === 'low')) a.reasoningEffort = rq.effort;
      return p[kind](a);
    },
  },
  unorouter: {
    supports: ['structured'],
    enabled: () => { try { return !!lazyProv('unorouter').unorouter.isEnabled(); } catch { return false; } },
    call: (e, rq, ctx) => lazyProv('unorouter').unorouter.structured(chainArgs(rq, 'structured', ctx, { models: [e.model] })),
  },
  standard_compute: {
    supports: ['structured', 'chat'],
    enabled: () => { try { return !!require('./providers/standard-compute').standardCompute.isEnabled(); } catch { return false; } }, // eslint-disable-line global-require
    estimateUsd: (e, rq) => require('./standard-compute-ledger').estimate({ model: e.model, inputChars: reqChars(rq), maxTokens: rq.maxTokens || 2048 }), // eslint-disable-line global-require
    canSpend: (usd) => require('./standard-compute-ledger').canSpend(usd), // eslint-disable-line global-require
    costOf: (e, res) => require('./standard-compute-ledger').costOf(e.model, res && res.usage), // eslint-disable-line global-require
    call: (e, rq, ctx) => {
      const sc = require('./providers/standard-compute').standardCompute; // eslint-disable-line global-require
      const kind = reqKind(rq);
      return sc[kind](chainArgs(rq, kind, ctx));
    },
  },
  // Coral ($100 API credit, services/coral-ledger.js): pipeline-class; learners only with CORAL_LEARNER=on (off by default) and clearance.
  coral: {
    supports: ['structured', 'chat'],
    enabled: () => { try { return !!require('./providers/coral').coral.isEnabled(); } catch { return false; } }, // eslint-disable-line global-require
    estimateUsd: (e, rq) => require('./coral-ledger').estimate({ model: e.model, inputChars: reqChars(rq), maxTokens: rq.maxTokens || 2048 }), // eslint-disable-line global-require
    canSpend: (usd) => require('./coral-ledger').canSpend(usd), // eslint-disable-line global-require
    costOf: (e, res) => require('./coral-ledger').costOf(e.model, res && res.usage), // eslint-disable-line global-require
    call: (e, rq, ctx) => {
      const co = require('./providers/coral').coral; // eslint-disable-line global-require
      const kind = reqKind(rq);
      return co[kind](chainArgs(rq, kind, ctx, { model: e.model }));
    },
  },
  // Munito ($100 free credit, services/munito-ledger.js): pipeline-class only, like Standard Compute; the slot's model is passed on.
  munito: {
    supports: ['structured', 'chat'],
    enabled: () => { try { return !!require('./providers/munito').munito.isEnabled(); } catch { return false; } }, // eslint-disable-line global-require
    estimateUsd: (e, rq) => require('./munito-ledger').estimate({ model: e.model, inputChars: reqChars(rq), maxTokens: rq.maxTokens || 2048 }), // eslint-disable-line global-require
    canSpend: (usd) => require('./munito-ledger').canSpend(usd), // eslint-disable-line global-require
    costOf: (e, res) => require('./munito-ledger').costOf(e.model, res && res.usage), // eslint-disable-line global-require
    call: (e, rq, ctx) => {
      const mu = require('./providers/munito').munito; // eslint-disable-line global-require
      const kind = reqKind(rq);
      return mu[kind](chainArgs(rq, kind, ctx, { model: e.model }));
    },
  },
  // Gonka broker ($50) and Grokified ($135), owner 2026-11-04: OpenAI-compatible credit providers (services/providers/openai-credit.js), each in its own
  // hard-capped ledger. Pipeline-class always; learner-class only inside the learner window with consent (creditLearnerAllowed).
  gonka: creditAdapter('gonka', 'gonka-ledger'),
  grokified: creditAdapter('grokified', 'grokified-ledger'),
  // Lyceum ($250 cap) and Crouton Alpha (OpenRouter free stealth model, 950 requests per UTC day, pipeline data only): same adapter.
  lyceum: creditAdapter('lyceum', 'lyceum-ledger'),
  zerogpu: creditAdapter('zerogpu', 'zerogpu-ledger'),
  crouton: creditAdapter('crouton', 'crouton-ledger'),
};
function creditAdapter(name, ledgerFile) {
  const prov = () => require(`./providers/${name}`)[name]; // eslint-disable-line global-require, import/no-dynamic-require
  const led = () => require(`./${ledgerFile}`); // eslint-disable-line global-require, import/no-dynamic-require
  return {
    supports: ['structured', 'chat'],
    enabled: () => { try { return !!prov().isEnabled(); } catch { return false; } },
    estimateUsd: (e, rq) => led().estimate({ model: e.model, inputChars: reqChars(rq), maxTokens: rq.maxTokens || 2048 }),
    canSpend: (usd) => led().canSpend(usd),
    costOf: (e, res) => led().costOf(e.model, res && res.usage),
    call: (e, rq, ctx) => { const kind = reqKind(rq); return prov()[kind](chainArgs(rq, kind, ctx, { model: e.model })); },
  };
}

// ── the quality gate and the data gate ─────────────────────────────────────────
function taskConfig(task) { return (task && (poolConfig().tasks || {})[task]) || {}; }

/** xKiro's MiniMax grant may serve the owner and test learners until the dated window closes (services/providers/xkiro.js), never a child. */
/** Munito may serve a learner request when learner use is on and this learner is cleared for it (req.munito, set by services/ai.js). */
function munitoLearnerAllowed(slot, req) {
  // Munito, Gonka and Grokified: same consent clearance (req.munito); each has its own learner switch / window (providers/*.learnerOn).
  if (slot.provider !== 'munito' && slot.provider !== 'gonka' && slot.provider !== 'grokified' && slot.provider !== 'lyceum' && slot.provider !== 'zerogpu') return false;
  // eslint-disable-next-line global-require, import/no-dynamic-require
  return require(`./providers/${slot.provider}`).learnerOn() && req.munito === true;
}

/** Coral may serve a learner request only when CORAL_LEARNER=on and this learner is cleared (req.coral, set by services/ai.js). */
function coralLearnerAllowed(slot, req) {
  if (slot.provider !== 'coral') return false;
  // eslint-disable-next-line global-require
  return require('./providers/coral').learnerOn() && req.coral === true;
}

function xkiroLearnerAllowed(slot, req) {
  if (slot.provider !== 'xkiro') return false;
  // eslint-disable-next-line global-require
  return require('./providers/xkiro').learnerWindowOpen() && req.xkiro !== false;
}

/** Why this slot may not serve this task / data class, or null if it may. */
function refusal(slot, req, kind) {
  // MiniMax M3 as a fact verifier behind grok-4.3 is the owner's call (17/36 caught against 22): off until decided (FACT_VERIFY_MINIMAX=on).
  if (slot.id === 'lyceum:minimax/minimax-m3' && String(process.env.FACT_VERIFY_MINIMAX || '').toLowerCase() !== 'on') return 'switch: FACT_VERIFY_MINIMAX is off';
  const cls = reqClass(req);
  // The check before text reaches a learner keeps to the owner's window for added providers (4 Nov: "up until november 14th"), Coral included,
  // whose own learner switch has no end date: reading a learner's text is the same as writing it. CORAL_LEARNER_UNTIL moves it.
  if (req.task === 'fact_live' && cls === 'learner' && slot.provider === 'coral' && Date.now() >= Date.parse(process.env.CORAL_LEARNER_UNTIL || '2026-11-14T06:00:00Z')) return 'data: the window for learner data on added providers has closed';
  if (slot.dataClass === 'pipeline' && cls !== 'pipeline' && !xkiroLearnerAllowed(slot, req) && !munitoLearnerAllowed(slot, req) && !coralLearnerAllowed(slot, req)) return 'data: a pipeline slot never gets learner data';
  if (!slot.supports.includes(kind)) return `does not do ${kind}`;
  // Coral Fast is for a learner who is waiting: background work (write-ahead, builds) never uses it.
  if (slot.fast && slotIsBackground(req)) return 'speed: a fast paid slot is for waiting learners, not background work';
  const t = taskConfig(req.task);
  if (req.excludeFamilies && slot.family && req.excludeFamilies.includes(slot.family)) return 'independence: family excluded for this request';
  if (req.freeOnly && slot.paid) return 'budget: this request may use free slots only (the fact guard is at its spend cap)';
  if (matchesAny(slot.id, t.deny)) return 'quality: denied for this task';
  if (Array.isArray(t.only) && !matchesAny(slot.id, t.only)) return 'quality: not in this task\'s only-list';
  if (slot.extra && !matchesAny(slot.id, t.allow) && !matchesAny(slot.id, poolConfig().default_allow)) return 'quality: not listed as good enough for this task';
  return null;
}

/**
 * The tutor's Standard Compute slot (owner, 30 Oct 2026; policy in services/tutor-standard-compute.js): a PAID slot that
 * carries LEARNER data and goes FIRST, for the tutor's own chat tasks only, when this learner is cleared (not an under-13
 * without verified parental consent, outside AI allowed), the key is there and the ledger's tutor ceiling ($16 committed)
 * has room. The free NVIDIA slots stay behind it: the pool's hedge starts one after hedgeAfterMs (the dock: 4 s), and
 * takes over when it fails. Returns null when the tutor may not use it, which leaves the free chain exactly as it was.
 */
function tutorStandardCompute(req) {
  if (reqKind(req) !== 'chat' || !req.userId || req.outside === false) return null;
  const tsc = require('./tutor-standard-compute'); // eslint-disable-line global-require
  if (!tsc.TASKS.has(req.task)) return null;
  const ledger = require('./standard-compute-ledger'); // eslint-disable-line global-require
  const model = tsc.modelName();
  if (tsc.refusal({ userId: req.userId, task: req.task, estimateUsd: ledger.estimate({ model, inputChars: reqChars(req), maxTokens: req.maxTokens || 1024 }) })) return null;
  const price = ledger.priceOf(model);
  return registerSlot({
    id: `standard_compute:${model}:tutor`, provider: 'standard_compute', model, label: `Standard Compute ${model} (tutor, paid)`, family: familyOfModel(model),
    supports: ['chat'], dataClass: 'learner', maxConcurrent: 6, rpm: 60, latencyHintMs: 5000, priceIn: price.input, priceOut: price.output,
    preferred: true, hedgeable: true,
    enabled: () => tsc.switchedOn() && tsc.keyPresent(),
    estimateUsd: (rq) => ledger.estimate({ model, inputChars: reqChars(rq), maxTokens: rq.maxTokens || 1024 }),
    canSpend: (usd) => ledger.canSpend(usd, tsc.ceilingUsd()),
    costOf: (res) => ledger.costOf((res && res.model) || model, res && res.usage),
    call: (rq, ctx) => require('./providers/standard-compute').standardCompute.chat({ ...chainArgs(rq, 'chat', ctx), tutor: { userId: rq.userId } }), // eslint-disable-line global-require
  });
}

/** Is this request background work (write-ahead, builds)? Same rule callHedged uses. */
function slotIsBackground(req) { return req.background != null ? !!req.background : !!((lane.getStore() || {}).background); }

/** All slots that may serve this request, free ones first in the app's order, then paid ones cheapest first. The tutor's Standard Compute slot, when allowed, goes before them. */
function candidatesFor(req, opts = {}) {
  const providers = providersLib();
  const kind = reqKind(req);
  const role = req.role || 'fast';
  const chain = opts.chain || providers.chain(role, req.task || null);
  const slots = [];
  for (const p of chain) {
    if (req.outside === false && providers.isOutside(p)) continue;
    slots.push(...expandProvider(p, req));
  }
  if (reqClass(req) === 'pipeline' && req.outside !== false && opts.extras !== false) slots.push(...extraSlots());
  // A cleared learner may also use Munito's slots (munitoLearnerAllowed); no other extra slot ever sees learner data.
  else if ((req.munito === true || req.coral === true) && req.outside !== false && opts.extras !== false) slots.push(...extraSlots().filter((x) => munitoLearnerAllowed(x, req) || coralLearnerAllowed(x, req)));
  if (opts.tutorStandardCompute !== false) { const sc = tutorStandardCompute(req); if (sc) slots.unshift(sc); }
  const seen = new Set();
  const ok = slots.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return !refusal(s, req, kind);
  });
  // A caller's first pick (req.firstPick: the voice call's fast route) goes in front; it is only ever a slot that passed every gate above.
  if (Array.isArray(req.firstPick) && req.firstPick.length) {
    const picked = req.firstPick.map((id) => ok.find((s) => s.id === id)).filter(Boolean);
    if (picked.length) return [...picked, ...candidatesFor({ ...req, firstPick: null }, opts).filter((s) => !picked.includes(s))];
  }
  const first = ok.filter((s) => s.preferred);
  const free = ok.filter((s) => !s.paid && !s.preferred);
  // Cheapest output first; a waiting learner's request puts a fast slot (Coral Fast) ahead of the other paid ones.
  const paid = ok.filter((s) => s.paid && !s.preferred).sort((a, b) => (!!b.fast - !!a.fast) || (a.hedgeable === b.hedgeable ? (a.priceOut - b.priceOut) : (a.hedgeable ? -1 : 1)));
  // The level a learner stands on right after placement (store.fast) writes on the fast lane: a cleared learner's request goes to
  // Coral Fast FIRST, then every other paid slot the task allows (Coral Standard, Munito, Gonka), and the free models LAST: when Fast is
  // full (4 at once) the walk saw calls fall onto rate-limited free models and wait 2 to 6 minutes. Everything else keeps the order above.
  const st = lane.getStore();
  if (st && st.fast && st.background === false && req.coral === true) {
    // Also for a task with no fast slot of its own (fact_verify, blind_mc: 4 Nov first-lesson brief): a learner waiting is not made to wait on
    // a busy free model first (a whole level's fact read took 109 to 312 s there; grok-4.3 answered one in 67 s, a block in about 24 s).
    const fastPaid = paid.filter((s) => s.fast);
    // POOL_FIRST_WRITER=<slot id>: an experiment switch (scripts/first-lesson-writer-ab.js): that slot writes the level first, Coral Fast next.
    // The live fact check: Coral Standard first, for speed at about the same price (scripts/fact-guard-eval.js, 6 Nov: p50 0.3 s against ZeroGPU GLM's 1.2 to 6.7 s, the same catches).
    const want = req.task === 'fact_live' ? paid.filter((s) => s.id === 'coral:deepseek-v4.1-flash')
      : process.env.POOL_FIRST_WRITER && (req.task === 'block_layout' || req.task === 'block_fill') ? paid.filter((s) => s.id === process.env.POOL_FIRST_WRITER) : [];
    // A waiting learner's fact check never lands on a free model (a busy free NVIDIA took minutes while grok-4.3 was down, 5 Nov): if no paid
    // verifier answers in time the level is not served as checked, the standard session opens and the write finishes in the background.
    const tail = req.task === 'fact_verify' && paid.length ? [] : free;
    // The check has seconds, not minutes: a preferred free slot in front of the paid readers used up the last-resort reader's time (2 of 30 replies held as "can't check", 6 Nov).
    if (req.task === 'fact_live' && (want.length || fastPaid.length || paid.length)) return [...want, ...fastPaid.filter((s) => !want.includes(s)), ...paid.filter((s) => !s.fast && !want.includes(s)), ...first, ...free];
    if (fastPaid.length || paid.length) return [...first, ...want, ...fastPaid.filter((s) => !want.includes(s)), ...paid.filter((s) => !s.fast && !want.includes(s)), ...tail];
  }
  return [...first, ...free, ...paid];
}

function timeoutFor(slot, req, opts) {
  const t = taskConfig(req.task);
  const ms = opts.timeoutMs || req.timeoutMs || slot.timeoutMs || t.timeout_ms || DEFAULT_TIMEOUT_MS();
  const cap = Math.min(ms, Number(process.env.POOL_MAX_TIMEOUT_MS || 600000));
  // COLD_FIRST_BLOCK: a part's fact read, a prewrite's too (a learner may land on it any second, and a call started while speculative kept no deadline: 115 s on a slow slot, 6 Nov): past this the next slot takes it.
  const stNow = lane.getStore();
  if (String(process.env.COLD_FIRST_BLOCK || '').toLowerCase() === 'on' && req.task === 'fact_verify' && req.coral === true && stNow && stNow.fast && stNow.background === false) return Math.min(cap, Number(process.env.COLD_READ_DEADLINE_MS || 45000));
  return isWaitingStore(lane.getStore()) && req.coral === true && opts.noDeadline !== true ? Math.min(cap, waitingDeadlineMs()) : cap;
}

// ── one attempt on one slot ────────────────────────────────────────────────────
function classify(err) {
  if (!err) return 'availability';
  if (err.aborted) return 'aborted';
  if (err.deadline) return 'deadline'; // a waiting learner's patience ran out: the slot is slow for us, not broken
  const st = err.status;
  if (err.unusable || err.code === 'INVALID' || st === 422) return 'invalid';
  if (err.code === 'LEDGER_STOP' || st === 402) return 'budget';
  if (st === 401 || st === 403 || st === 404) return 'hard';
  if (st === 429 || err.daily) return 'rate';
  return 'availability';
}

function startAccounting(slot) {
  slot.inFlight++;
  slot.stats.started++;
  if (slot.group) groupInFlight.set(slot.group, (groupInFlight.get(slot.group) || 0) + 1);
  if (slot.rpm) { const a = rpmStamps.get(slot.rpmGroup) || []; a.push(now()); rpmStamps.set(slot.rpmGroup, a); }
  slot.claimProbe();
}
function endAccounting(slot) {
  slot.inFlight = Math.max(0, slot.inFlight - 1);
  if (slot.group) groupInFlight.set(slot.group, Math.max(0, (groupInFlight.get(slot.group) || 1) - 1));
  notify();
}

/**
 * Run `req` on `slot` with a hard timeout. Resolves (never rejects) to
 * { ok, result?, kind, err?, ms, usd }. `signal` (optional) abandons the attempt.
 */
async function attempt(slot, req, { validate = null, timeoutMs, signal = null, deadline = false } = {}) {
  startAccounting(slot);
  const ctrl = new AbortController();
  const t0 = now();
  let timer = null;
  let onParent = null;
  if (signal) { onParent = () => ctrl.abort(); if (signal.aborted) ctrl.abort(); else signal.addEventListener('abort', onParent, { once: true }); }
  const kindOfReq = reqKind(req);
  try {
    const call = Promise.resolve().then(() => slot.call(kindOfReq === req.kind ? req : { ...req, kind: kindOfReq }, { signal: ctrl.signal, timeoutMs, slot }));
    call.catch(() => {}); // an abandoned call's late failure is not ours to report
    const gate = new Promise((_, reject) => {
      timer = setTimeout(() => { reject(Object.assign(new Error(`${slot.id}: no answer within ${Math.round(timeoutMs / 1000)}s`), { status: 0, timeout: true, deadline })); ctrl.abort(); }, timeoutMs);
      ctrl.signal.addEventListener('abort', () => reject(Object.assign(new Error(`${slot.id}: aborted`), { aborted: true })), { once: true });
    });
    gate.catch(() => {});
    const result = await Promise.race([call, gate]);
    const ms = now() - t0;
    const usd = slot.costOf ? slot.costOf(result) : usdFromUsage(slot, result && result.model, result && result.usage);
    if (result == null) {
      slot.noteFail('invalid', { message: 'no answer' });
      return { ok: false, kind: 'invalid', err: new Error(`${slot.id}: no answer`), ms, usd: 0 };
    }
    let verdict = true;
    if (validate) {
      try { verdict = await validate(result, req); } catch (err) { verdict = { ok: false, reason: err.message }; }
    }
    if (verdict === false || (verdict && verdict.ok === false)) {
      slot.noteFail('invalid', { message: 'failed validation' });
      slot.stats.costUsd += usd;
      return { ok: false, kind: 'invalid', err: new Error(`${slot.id}: invalid answer${verdict && verdict.reason ? ` (${verdict.reason})` : ''}`), ms, usd, result };
    }
    slot.noteOk(ms);
    slot.stats.costUsd += usd;
    return { ok: true, result, ms, usd };
  } catch (err) {
    const ms = now() - t0;
    const kind = classify(err);
    if (kind === 'aborted') {
      slot.stats.aborted++;
      // A paid request that left and was cancelled may still be billed; its ledger settles it conservatively.
      return { ok: false, kind: 'aborted', err, ms, usd: 0 };
    }
    slot.noteFail(kind, err);
    return { ok: false, kind, err, ms, usd: 0 };
  } finally {
    clearTimeout(timer);
    if (signal && onParent) signal.removeEventListener('abort', onParent);
    endAccounting(slot);
  }
}

/** Could this slot start a call for `req` right now? Returns null if so, else why not (and how long to wait, if known). */
function blocked(slot, req, background = false, speculative = false) {
  if (!slot.isEnabled()) return { why: 'disabled' };
  if (slot.breakerOpen()) return { why: 'breaker', waitMs: Math.max(250, slot.breaker.openUntil - now()) };
  if (!slot.hasPermit(background, speculative)) return { why: 'busy' };
  const w = slot.rpmWaitMs();
  if (w > 0) return { why: 'rpm', waitMs: w };
  if (slot.tokensLeft() < estTokens(req)) return { why: 'daily tokens', waitMs: 60000 };
  return null;
}

function budgetOk(slot, req, opts, spentRef) {
  if (!slot.paid) return true;
  const est = slot.estimateUsd ? slot.estimateUsd(req) : (estTokens(req) * Math.max(slot.priceIn, slot.priceOut)) / 1e6;
  if (slot.canSpend && !slot.canSpend(est)) return false;
  if (opts.budgetUsd != null && spentRef && spentRef.usd + spentRef.reserved + est > opts.budgetUsd + 1e-9) return false;
  return true;
}

// ── callHedged ─────────────────────────────────────────────────────────────────
/**
 * One call, hedged. `req`: { kind?, role, task, system, user | messages, schema, schemaName,
 * maxTokens, effort, lane, userId, outside, dataClass, pipelineVariant? }.
 * opts: { validate(result, req) -> bool | {ok:false, reason}, timeoutMs, maxTotalMs,
 * hedgeAfterMs, hedgeMinMs, hedgeMaxMs, maxParallel (2), allowPaid (true), budgetUsd,
 * slots (explicit, for tests), trace (object filled with the attempts) }.
 * Resolves to the winning provider result plus `pool: { slot, provider, model, hedged,
 * attempts, elapsedMs, costUsd }`, or null when no slot produced a valid answer.
 */
async function callHedged(req, opts = {}) {
  const t0 = now();
  const kind = reqKind(req);
  const cands0 = opts.slots ? opts.slots.filter((s) => !refusal(s, req, kind)) : candidatesFor(req, opts);
  const cands = Array.isArray(req.firstPick) && req.firstPick.length ? [...cands0.filter((s) => req.firstPick.includes(s.id)), ...cands0.filter((s) => !req.firstPick.includes(s.id))] : cands0;
  const timeout = (slot) => timeoutFor(slot, req, opts);
  const maxTimeout = Math.max(...cands.map(timeout), opts.timeoutMs || DEFAULT_TIMEOUT_MS());
  const waitingCall = isWaitingStore(lane.getStore()) && req.coral === true;
  const totalMs = opts.maxTotalMs || (waitingCall ? Math.min(Math.round(maxTimeout * 2.5), waitingDeadlineMs() * 3) : Math.round(maxTimeout * 2.5));
  const maxParallel = Math.max(1, opts.maxParallel || 2);
  // A waiting learner's fact check (no free tail, see candidatesFor) queues on its paid verifiers rather than failing when they rest or are busy.
  const queueOnly = waitingCall && req.task === 'fact_verify' && cands.length > 0 && cands.every((c) => c.paid);
  const validate = opts.validate || null;
  // Background work (write-ahead and the like) yields to a waiting learner and never pays for speed; see the lane note at the top.
  const laneNow = lane.getStore();
  const isSpec = () => isSpecStore(laneNow) && req.coral === true;
  if (waitingCall) waitingPending++;
  const isBg = () => (opts.background != null ? !!opts.background : req.background != null ? !!req.background : !!(laneNow && laneNow.background));
  const spent = { usd: 0, reserved: 0 };
  const trace = opts.trace || {};
  trace.attempts = [];
  const tried = new Set();
  const running = new Map(); // attempt no -> { slot, ctrl, t0 }
  let n = 0;
  let settled = false;
  let costUsd = 0;
  // A streamed chat (req.onDelta, the voice call's sentence streaming): the first attempt to send text owns the stream, so a hedge's words are never mixed into it.
  // When the owner fails, the caller is told with onDelta(null) and the next attempt may take the stream over.
  let streamOwner = null;
  // req.firstPick (the voice call's fast route, services/tutor-context.js): slots, already allowed for this task and this learner, that start first even when paid.
  const isFirstPick = (s) => Array.isArray(req.firstPick) && req.firstPick.includes(s.id);

  return new Promise((resolve) => {
    const timers = new Set();
    const later = (fn, ms) => { const h = setTimeout(() => { timers.delete(h); fn(); }, ms); timers.add(h); return h; };
    const finish = (value) => {
      if (settled) return;
      settled = true;
      if (waitingCall) waitingPending = Math.max(0, waitingPending - 1);
      for (const h of timers) clearTimeout(h);
      timers.clear();
      for (const a of running.values()) a.ctrl.abort();
      trace.elapsedMs = now() - t0;
      trace.costUsd = costUsd;
      resolve(value);
    };

    const anyFreeRunning = () => [...running.values()].some((a) => !a.slot.paid);
    // A free slot that is switched off, resting behind an open breaker or out of daily tokens will not answer soon: it
    // does not hold Claude back. A busy slot or a short RPM wait does (it is waited for).
    const untriedFree = () => cands.some((s) => {
      if (s.paid || tried.has(s.id)) return false;
      const b = blocked(s, req, isBg(), isSpec());
      // A free slot whose RPM window is far off (more than the 15 s pick() would wait) will not answer soon either: for a learner waiting, it does
      // not hold the paid slot back. Otherwise the call ended at 0 s with "no slot available" (beta load test, Nov 2026). Background work still waits for free.
      if (b && b.why === 'rpm' && b.waitMs > 15000 && !isBg()) return false;
      return !(b && (b.why === 'disabled' || b.why === 'breaker' || b.why === 'daily tokens'));
    });

    /** The next slot to start: free ones in order; a paid one only as a hedge (hedgeable) or as the last resort. */
    function pick(asHedge) {
      let waitMs = null;
      let softWait = null;
      const breakerSkipped = [];
      for (const s of cands) {
        if (tried.has(s.id)) continue;
        if (s.paid) {
          if (opts.allowPaid === false) continue;
          // A preferred paid slot (the tutor's Standard Compute) starts first, as the primary, not as a last resort.
          // A hedge onto a paid slot is for speed, so never from background work. A foreground call that has waited fgHedgeMs with every free slot busy takes the paid slot as its primary.
          const fgLate = !isBg() && now() - t0 >= fgHedgeMs();
          // COLD_FIRST_BLOCK: the fast lane's paid order (candidatesFor) holds, instead of every free slot being tried first: a free NVIDIA call in front cost a waiting learner 2 to 64 s.
          const coldPaidFirst = String(process.env.COLD_FIRST_BLOCK || '').toLowerCase() === 'on' && !!(laneNow && laneNow.fast && laneNow.background === false && req.coral === true);
          if (s.preferred || isFirstPick(s)) { if (asHedge && !s.hedgeable) continue; } else if (asHedge) { if (!s.hedgeable || isBg()) continue; } else if (!fgLate && !coldPaidFirst && !(req.task === 'fact_live' && !isBg()) && (anyFreeRunning() || untriedFree())) continue; /* a waiting learner's check starts on the paid readers it lists first: it has seconds */ // last resort: only when every free one has failed
          if (!budgetOk(s, req, opts, spent)) continue;
        }
        const b = blocked(s, req, isBg(), isSpec());
        if (b) {
          // A better slot that is only busy (or a few seconds from its RPM window) is waited for, briefly, so
          // the chain's preference order holds; past BUSY_WAIT it is skipped and the next slot takes the call.
          // A hedge never waits. An open breaker is skipped.
          const patient = !asHedge && now() - t0 < busyWaitMs() && (isBg() || now() - t0 < fgHedgeMs());
          if (b.why === 'busy' && patient) { waitMs = 150; break; }
          if (b.why === 'rpm' && patient && b.waitMs <= busyWaitMs()) { waitMs = Math.min(b.waitMs, 500); break; }
          if (b.why === 'busy') waitMs = Math.min(waitMs == null ? Infinity : waitMs, 500);
          else if (b.why === 'rpm' && b.waitMs <= 15000) waitMs = Math.min(waitMs == null ? Infinity : waitMs, b.waitMs);
          else if (b.why === 'breaker' && !s.paid) breakerSkipped.push(s);
          // A waiting learner's fact check has no free tail: a paid verifier that is only resting (breaker, a long RPM window) is
          // waited for, up to the call's total time, instead of the call failing at 0 s with 'no slot available' (5 Nov, fact-queue brief).
          else if (queueOnly && !asHedge && (b.why === 'breaker' || b.why === 'rpm')) softWait = Math.min(softWait == null ? Infinity : softWait, Math.min(b.waitMs || 1000, 2000));
          continue;
        }
        return { slot: s };
      }
      // Every free slot's breaker is open and nothing else can run: probe the one that opened longest ago
      // rather than give up on a call (a network blip must not take the whole app offline for 30 s).
      if (waitMs == null && !running.size && breakerSkipped.length) {
        const s = breakerSkipped.sort((a, b) => a.breaker.openUntil - b.breaker.openUntil)[0];
        if (s.isEnabled() && s.hasPermit() && s.rpmWaitMs() === 0) return { slot: s };
      }
      if (waitMs == null && softWait != null && !running.size) waitMs = softWait;
      return { slot: null, waitMs };
    }

    function launch(slot, why) {
      tried.add(slot.id);
      const no = ++n;
      const ctrl = new AbortController();
      running.set(no, { slot, ctrl, t0: now() });
      if (why === 'hedge') slot.stats.hedged++;
      // The pipeline variant (learner data stripped by the caller) is what a pipeline slot sees.
      const rq0 = slot.dataClass === 'pipeline' && req.pipelineVariant ? { ...req, ...req.pipelineVariant } : req;
      const rq = typeof rq0.onDelta === 'function'
        ? { ...rq0, onDelta: (frag, full) => { if (settled && streamOwner !== no) return; if (streamOwner == null) streamOwner = no; if (streamOwner === no) { try { rq0.onDelta(frag, full, { model: slot.model, slot: slot.id }); } catch { /* the stream is the caller's business */ } } } }
        : rq0;
      const est = slot.paid ? (slot.estimateUsd ? slot.estimateUsd(rq) : 0) : 0;
      spent.reserved += est;
      attempt(slot, rq, { validate, timeoutMs: Math.min(timeout(slot), Math.max(1000, totalMs - (now() - t0))), signal: ctrl.signal, deadline: (waitingCall || (req.task === 'fact_verify' && isSpec())) && timeout(slot) <= waitingDeadlineMs() }).then((o) => {
        running.delete(no);
        spent.reserved -= est;
        spent.usd += o.usd || 0;
        costUsd += o.usd || 0;
        trace.attempts.push({ slot: slot.id, why, ok: o.ok, kind: o.kind || 'ok', ms: o.ms, error: o.err ? String(o.err.message).slice(0, 160) : null });
        if (!o.ok && streamOwner === no) { streamOwner = null; if (!settled) { try { req.onDelta(null, ''); } catch { /* ignore */ } } }
        if (settled) return;
        if (o.ok) {
          slot.stats.wins++;
          finish(Object.assign(o.result, { pool: { slot: slot.id, provider: slot.provider, model: slot.model, hedged: trace.attempts.length > 1 || n > 1, attempts: trace.attempts, elapsedMs: now() - t0, costUsd, slot_paid: slot.paid } }));
          return;
        }
        advance();
      });
    }

    let hedgeTimer = null;
    function armHedge(slot) {
      if (hedgeTimer) { clearTimeout(hedgeTimer); timers.delete(hedgeTimer); }
      const clamp = (v) => Math.min(opts.hedgeMaxMs || HEDGE_MAX_MS(), Math.max(opts.hedgeMinMs || HEDGE_MIN_MS(), v));
      // A waiting learner's backup starts after fgHedgeMs (8 s), not the slot's p90 (20 s floor); a queued fact check (ZeroGPU first, measured p50 17 s on real levels) gives its first verifier POOL_FACT_HEDGE_MS (20 s) before grok also pays.
      const after = opts.hedgeAfterMs != null ? opts.hedgeAfterMs : (queueOnly ? Math.max(fgHedgeMs(), Number(process.env.POOL_FACT_HEDGE_MS || 20000)) : isBg() ? clamp(slot.p90) : Math.min(clamp(slot.p90), fgHedgeMs()));
      hedgeTimer = later(() => {
        hedgeTimer = null;
        if (settled || running.size >= maxParallel) return;
        const next = pick(true);
        if (next.slot) { launch(next.slot, 'hedge'); armHedge(next.slot); }
      }, Math.min(after, timeout(slot) - 1));
    }

    /** After a failure (or at the start): keep exactly one attempt going; wait if the only candidates are busy. */
    function advance() {
      if (settled) return;
      if (running.size > 0) return; // a hedge is still in flight: let it finish
      const next = pick(false);
      if (next.slot) { launch(next.slot, tried.size === 0 ? 'primary' : 'fallback'); armHedge(next.slot); return; }
      if (next.waitMs != null && now() - t0 < totalMs) { later(() => advance(), Math.min(next.waitMs, 1000)); return; }
      // Nothing more can be tried (or the only ones are still resting): give up. Why, per slot, goes in the trace (ai.js prints it when no slot ran).
      trace.blocked = cands.map((s) => { if (tried.has(s.id)) return `${s.id} tried`; const b = blocked(s, req, isBg(), isSpec()); return `${s.id} ${b ? b.why : (s.paid && !tried.size ? 'paid last resort' : 'ok')}`; });
      finish(null);
    }

    later(() => finish(null), totalMs);
    if (!cands.length) { finish(null); return; }
    advance();
  });
}

// ── runBatch ───────────────────────────────────────────────────────────────────
/**
 * Run many requests across all slots at once. `items`: [{ id?, req | (the request itself),
 * validate?, dataClass? }]. opts: { task, role, kind, dataClass, validate, deadline (epoch ms) |
 * deadlineMs | targetMinutes, budgetUsd (paid spend cap for this batch), allowPaid,
 * hedge (true), hedgeFloorMs (2000), maxTries (6), timeoutMs, slots (explicit), onResult,
 * meaningful (0.15), pollMs (400), tailGuard (true: a slow free slot does not take the last queued items), lastResort (false: Claude may take an item every free slot has failed) }.
 * Resolves to { results: [{ ok, result, slot, error, ms }], report }.
 */
async function runBatch(items, opts = {}) {
  const t0 = now();
  const list = items.map((it, idx) => {
    const req = it.req ? { ...it.req } : { ...it };
    if (opts.task && !req.task) req.task = opts.task;
    if (opts.role && !req.role) req.role = opts.role;
    if (opts.kind && !req.kind) req.kind = opts.kind;
    if (it.dataClass || opts.dataClass) req.dataClass = it.dataClass || req.dataClass || opts.dataClass;
    return {
      idx, id: it.id != null ? it.id : idx, req, validate: it.validate || opts.validate || null,
      state: 'queued', runs: new Map(), exclude: new Set(), tries: 0, hedges: 0, doneAt: null, result: null, slot: null, error: null, ms: null, firstStart: null,
    };
  });
  const deadline = opts.deadline != null ? opts.deadline : opts.deadlineMs != null ? t0 + opts.deadlineMs : opts.targetMinutes != null ? t0 + opts.targetMinutes * 60000 : null;
  const meaningful = opts.meaningful != null ? opts.meaningful : 0.15;
  const maxTries = opts.maxTries || 6;
  const hedgeOn = opts.hedge !== false;
  const hedgeFloor = opts.hedgeFloorMs != null ? opts.hedgeFloorMs : 2000;
  const tailGuard = opts.tailGuard !== false;
  const pollMs = opts.pollMs || 400; // how often an idle worker looks again (time-based hedging needs it)

  // Slots: the union of every item's candidates.
  const slotSet = new Map();
  const perItem = new Map(); // item idx -> Set(slot ids that may serve it)
  const groupCache = new Map();
  for (const it of list) {
    const key = `${it.req.role || 'fast'}|${it.req.task || ''}|${reqClass(it.req)}|${reqKind(it.req)}|${it.req.outside === false}`;
    if (!groupCache.has(key)) groupCache.set(key, opts.slots ? opts.slots.filter((s) => !refusal(s, it.req, reqKind(it.req))) : candidatesFor(it.req, opts));
    const cands = groupCache.get(key);
    perItem.set(it.idx, new Set(cands.map((s) => s.id)));
    for (const s of cands) slotSet.set(s.id, s);
  }
  const slots = [...slotSet.values()];
  const spent = { usd: 0, reserved: 0 };
  const queue = list.map((i) => i.idx);
  let remaining = list.length;
  const hedgeStats = { started: 0, won: 0, wasted: 0 };
  const perSlot = new Map(slots.map((s) => [s.id, { pulled: 0, ok: 0, invalid: 0, failed: 0, aborted: 0, wins: 0, hedge_starts: 0, wasted: 0, usd: 0, ms: [] }]));
  const completions = []; // { at, slot }
  let finished = false;

  // Claude (a paid slot that is not a hedge: hedgeable false) is a LAST RESORT in a batch, never a helper: it takes an item
  // only with opts.lastResort and only once every free slot that may serve the item has failed it.
  const lastResortOk = (it, slot) => !!opts.lastResort && slotsFor(it).every((o) => o.paid || it.exclude.has(o.id) || !o.isEnabled());
  const slotsFor = (it) => [...perItem.get(it.idx)].map((id) => slotSet.get(id));
  const eligible = (it, slot) => perItem.get(it.idx).has(slot.id) && !it.exclude.has(slot.id) && !it.runs.has(slot.id) && !refusal(slot, it.req, reqKind(it.req))
    && (slot.hedgeable || !slot.paid || lastResortOk(it, slot));
  const freeSlots = () => slots.filter((s) => !s.paid);

  /** Steady-state free throughput (items/ms): Little's law over the free slots that can run, capped by RPM. */
  function freeRate() {
    let r = 0;
    for (const s of freeSlots()) {
      if (!s.isEnabled() || (s.breaker.state === 'open' && now() < s.breaker.openUntil)) continue;
      let rate = Math.min(s.maxConcurrent, list.length) / Math.max(1, s.speedMs);
      if (s.rpm) rate = Math.min(rate, s.rpm / 60000);
      r += rate;
    }
    return r;
  }
  const paidRate = (s) => 1 / Math.max(1, s.speedMs);

  function paidMayPull(slot, req) {
    if (!slot.paid || opts.allowPaid === false) return !slot.paid;
    if (!slot.hedgeable) return !!opts.lastResort && budgetOk(slot, req, opts, spent); // Claude: last resort, not a helper (eligible() already holds it back until the free slots failed)
    if (deadline == null) return false; // no deadline or target: free slots only
    const left = remaining;
    if (left <= 0) return false;
    const timeLeft = deadline - now();
    const fr = freeRate();
    const projFree = fr > 0 ? left / fr : Infinity;
    if (projFree <= Math.max(0, timeLeft)) return false; // the free slots alone meet the deadline
    // How much paid throughput is already running, and how much more the deadline needs. A paid slot is judged
    // at the number of workers it would really run (not one call), so "meaningfully sooner" is about the slot's
    // useful size: min(its concurrency, what the deadline asks for).
    const pr = paidRate(slot);
    const paidNow = slots.filter((s) => s.paid && s.hedgeable).reduce((r, s) => r + s.inFlight * paidRate(s), 0);
    const needed = timeLeft <= 0 ? Infinity : Math.max(0, left / timeLeft - fr - paidNow); // items/ms still missing
    if (needed <= 0) return false; // the paid work already running is enough
    const target = Math.min(slot.maxConcurrent, Math.max(1, Math.ceil(needed / pr)));
    if (slot.inFlight >= target) return false;
    const projWith = left / (fr + paidNow + target * pr);
    if (Number.isFinite(projFree) && projWith > projFree * (1 - meaningful)) return false; // not meaningfully sooner
    return budgetOk(slot, req, opts, spent);
  }

  /**
   * Tail guard: near the end of the queue a SLOW free slot holds back, so the last items finish together instead
   * of the batch waiting for a slow slot's last call. A slot pulls unless its own speed is clearly longer than
   * the time the other free slots need to clear what is still queued.
   */
  function worthPulling(slot, it) {
    if (!tailGuard || slot.paid) return true;
    let rOther = 0;
    for (const o of slots) {
      if (o === slot || o.paid || !eligible(it, o) || !o.isEnabled() || (o.breaker.state === 'open' && now() < o.breaker.openUntil)) continue;
      let r = Math.min(o.maxConcurrent, list.length) / Math.max(1, o.speedMs);
      if (o.rpm) r = Math.min(r, o.rpm / 60000);
      rOther += r;
    }
    if (rOther <= 0) return true;
    return slot.speedMs <= (queue.length / rOther) * 1.25 + 500;
  }

  function takeFromQueue(slot) {
    for (let q = 0; q < queue.length; q++) {
      const it = list[queue[q]];
      if (!eligible(it, slot)) continue;
      if (slot.paid && !paidMayPull(slot, it.req)) return null;
      if (!worthPulling(slot, it)) return null;
      queue.splice(q, 1);
      return it;
    }
    return null;
  }

  function idleOthers(slot, it) {
    return slots.filter((o) => o !== slot && eligible(it, o) && o.isEnabled() && !o.breakerOpen() && o.hasPermit() && o.rpmWaitMs() === 0 && (!o.paid || paidMayPull(o, it.req)));
  }

  const okMs = [];
  function typicalMs() {
    if (okMs.length < 3) return null;
    const a = [...okMs].sort((x, y) => x - y);
    return a[Math.floor(a.length / 2)];
  }

  function pickHedge(slot) {
    if (!hedgeOn || queue.length) return null;
    let best = null;
    for (const it of list) {
      if (it.state !== 'running' || it.hedges >= MAX_EXTRA_COPIES || !eligible(it, slot)) continue;
      // the oldest copy of this item, against the p75 of the slot it runs on
      let oldest = null;
      for (const run of it.runs.values()) if (!oldest || run.t0 < oldest.t0) oldest = run;
      if (!oldest) continue;
      const elapsed = now() - oldest.t0;
      // Past its slot's p75 -- but a slot with no history yet only has a prior (its hint), so once this batch has a few
      // answers of its own the threshold is also capped at 3x the batch's typical item time.
      const typ = typicalMs();
      if (elapsed < Math.max(hedgeFloor, typ != null ? Math.min(oldest.slot.p75, typ * 3) : oldest.slot.p75)) continue;
      // A copy on a slot that is typically slower than the original has already been running cannot rescue it (and would
      // use up one of the item's 2 extra copies): such a slot is not a hedge target yet.
      if (slot.p75 > Math.max(elapsed, hedgeFloor)) continue;
      if (slot.paid && !paidMayPull(slot, it.req)) continue;
      if (!best || oldest.t0 < best.t0) best = { it, t0: oldest.t0, elapsed };
    }
    if (!best) return null;
    // only the fastest idle slot takes it: free before paid, then the lower latency
    const others = idleOthers(slot, best.it).filter((o) => o.p75 <= Math.max(best.elapsed, hedgeFloor));
    if (others.some((o) => (!o.paid && slot.paid) || (o.paid === slot.paid && o.score < slot.score))) return null;
    return best.it;
  }

  function settleItem(it, slot, run, o) {
    const ps = perSlot.get(slot.id);
    ps.usd += o.usd || 0;
    spent.usd += o.usd || 0;
    spent.reserved -= run.est;
    it.runs.delete(slot.id);
    if (o.kind === 'aborted') { ps.aborted++; if (it.state === 'done') ps.wasted++; return; }
    if (it.state === 'done') { ps.wasted++; hedgeStats.wasted++; if (o.ok) ps.ok++; return; } // a late copy
    if (o.ok) {
      ps.ok++; ps.wins++; ps.ms.push(o.ms); okMs.push(o.ms);
      it.state = 'done'; it.result = o.result; it.slot = slot.id; it.ms = now() - it.firstStart; it.doneAt = now() - t0;
      if (run.hedge) hedgeStats.won++;
      remaining--;
      completions.push({ at: it.doneAt, slot: slot.id, free: !slot.paid });
      for (const r of it.runs.values()) r.ctrl.abort(); // first valid answer wins
      if (opts.onResult) { try { opts.onResult(it, { ok: true }); } catch { /* the callback's problem */ } }
    } else {
      if (o.kind === 'invalid') ps.invalid++; else ps.failed++;
      // A hedge copy that failed fast (a 429, a refusal) is not a live copy: it does not use up the item's 2 extra copies,
      // or a stuck original could never be hedged again. The slot stays excluded for this item, so this is bounded.
      if (run.hedge && it.hedges > 0) it.hedges--;
      it.exclude.add(slot.id);
      it.tries++;
      it.lastError = o.err;
      if (!it.runs.size) {
        // the slots that may ever take this item (Claude only counts with opts.lastResort)
        const options = slotsFor(it).filter((s) => s.hedgeable || !s.paid || opts.lastResort);
        // a new round once every slot has been tried (never strand an item), until maxTries
        if (!options.some((s) => !it.exclude.has(s.id))) it.exclude.clear();
        if (it.tries >= maxTries) {
          it.state = 'failed'; it.error = String((o.err && o.err.message) || 'failed'); it.doneAt = now() - t0; remaining--;
          if (opts.onResult) { try { opts.onResult(it, { ok: false }); } catch { /* the callback's problem */ } }
        } else { it.state = 'queued'; queue.unshift(it.idx); }
      }
    }
  }

  async function runOne(slot, it, hedge) {
    const ps = perSlot.get(slot.id);
    ps.pulled++;
    if (hedge) { ps.hedge_starts++; hedgeStats.started++; it.hedges++; }
    const ctrl = new AbortController();
    const rq = slot.dataClass === 'pipeline' && it.req.pipelineVariant ? { ...it.req, ...it.req.pipelineVariant } : it.req;
    const est = slot.paid ? (slot.estimateUsd ? slot.estimateUsd(rq) : 0) : 0;
    const run = { slot, ctrl, t0: now(), est, hedge };
    spent.reserved += est;
    if (it.firstStart == null) it.firstStart = run.t0;
    it.state = 'running';
    it.runs.set(slot.id, run);
    const o = await attempt(slot, rq, { validate: it.validate, timeoutMs: timeoutFor(slot, it.req, opts), signal: ctrl.signal });
    settleItem(it, slot, run, o);
    notify();
  }

  async function worker(slot) {
    while (!finished) {
      if (remaining <= 0) break;
      const dis = !slot.isEnabled() ? 5000 : null;
      let wait = dis;
      if (wait == null) {
        if (slot.breakerOpen()) wait = Math.max(250, Math.min(2000, slot.breaker.openUntil - now()));
        else if (!slot.hasPermit()) wait = 300;
        else { const w = slot.rpmWaitMs(); if (w > 0) wait = Math.min(w, 2000); }
      }
      if (wait == null && slot.tokensLeft() < 1000) wait = 30000;
      if (wait != null) { await waitChange(wait); continue; }
      let it = takeFromQueue(slot);
      let hedge = false;
      if (!it) { it = pickHedge(slot); hedge = !!it; }
      if (!it) { await waitChange(pollMs); continue; }
      // eslint-disable-next-line no-await-in-loop
      await runOne(slot, it, hedge);
    }
  }

  // Fail items that no slot can ever serve (quality / data gates) instead of waiting forever.
  for (const it of list) {
    if (!slotsFor(it).some((s) => s.hedgeable || !s.paid || opts.lastResort)) { it.state = 'failed'; it.error = 'no slot may serve this item (quality or data gate)'; it.doneAt = 0; remaining--; const qi = queue.indexOf(it.idx); if (qi >= 0) queue.splice(qi, 1); }
  }

  const workers = [];
  for (const s of slots) for (let k = 0; k < Math.min(s.maxConcurrent, Math.max(1, list.length)); k++) workers.push(worker(s));
  const idle = remaining > 0 ? Promise.all(workers) : Promise.resolve();
  // A watchdog: if nothing can make progress (every slot disabled), stop rather than spin forever.
  let watchdog = null;
  if (remaining > 0) {
    const stallMs = opts.stallMs || 5 * 60 * 1000;
    let lastProgress = now();
    let lastRemaining = remaining;
    watchdog = setInterval(() => {
      if (remaining !== lastRemaining) { lastRemaining = remaining; lastProgress = now(); return; }
      const anyRunning = list.some((i) => i.runs.size);
      if (!anyRunning && now() - lastProgress > stallMs) {
        for (const it of list) if (it.state !== 'done' && it.state !== 'failed') { it.state = 'failed'; it.error = 'stalled: no slot could take the item'; remaining--; }
      }
    }, 1000);
  }
  await idle;
  finished = true;
  if (watchdog) clearInterval(watchdog);
  for (const it of list) for (const r of it.runs.values()) r.ctrl.abort();

  const wall = now() - t0;
  const times = list.filter((i) => i.state === 'done').map((i) => i.doneAt).sort((a, b) => a - b);
  const k = Math.max(1, Math.ceil(times.length * 0.1));
  const last = times.slice(-k);
  const perSlotReport = {};
  for (const [id, ps] of perSlot) {
    if (!ps.pulled) { perSlotReport[id] = { pulled: 0 }; continue; }
    const sorted = [...ps.ms].sort((a, b) => a - b);
    perSlotReport[id] = { pulled: ps.pulled, ok: ps.ok, wins: ps.wins, invalid: ps.invalid, failed: ps.failed, aborted: ps.aborted, wasted: ps.wasted, hedge_starts: ps.hedge_starts, usd: Number(ps.usd.toFixed(6)), p50_ms: pct(sorted, 0.5), p90_ms: pct(sorted, 0.9), paid: slotSet.get(id).paid };
  }
  const report = {
    items: list.length,
    ok: list.filter((i) => i.state === 'done').length,
    failed: list.filter((i) => i.state === 'failed').length,
    wall_ms: wall,
    deadline_ms: deadline != null ? deadline - t0 : null,
    met_deadline: deadline != null ? t0 + wall <= deadline : null,
    cost_usd: Number(spent.usd.toFixed(6)),
    paid_pulls: slots.filter((s) => s.paid).reduce((n, s) => n + (perSlot.get(s.id).pulled || 0), 0),
    per_slot: perSlotReport,
    hedges: hedgeStats,
    finish: times.length ? { first_ms: times[0], p50_ms: pct(times, 0.5), p90_ms: pct(times, 0.9), last_ms: times[times.length - 1], last_tenth_spread_ms: last[last.length - 1] - last[0], last_tenth_n: k } : null,
  };
  const results = list.map((i) => ({ id: i.id, ok: i.state === 'done', result: i.result, slot: i.slot, error: i.error, ms: i.ms, done_at_ms: i.doneAt }));
  return { results, report };
}

// ── status, tests ──────────────────────────────────────────────────────────────
function status() { return { slots: [...registry.values()].map((s) => s.describe()) }; }

function _reset() {
  registry.clear(); rpmStamps.clear(); groupInFlight.clear(); groupCaps.clear(); slotProviders.clear();
  cfgCache = null; cfgStamp = null;
}

/** Parallelism the free slots of this request class can absorb right now (write-ahead sizes itself with it). */
function freeParallelism(req = { role: 'blocks', task: 'block_fill', dataClass: 'learner' }) {
  try {
    return candidatesFor(req).filter((s) => !s.paid && s.isEnabled() && !s.breakerOpen()).reduce((n, s) => n + s.maxConcurrent, 0);
  } catch { return 0; }
}

module.exports = {
  runBackground, runForeground, laneStore, inBackground, promote,
  callHedged, runBatch, candidatesFor, expandProvider, extraSlots, familyOfModel, makeSlot, registerSlot, setGroup, status, freeParallelism, poolConfig, refusal,
  reqClass, reqKind, Slot, attempt, classify, sleep, _reset, DEFAULT_TIMEOUT_MS, MAX_EXTRA_COPIES,
};
