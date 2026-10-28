/**
 * The Anthropic key's TOTAL spend, persistent, across every process (the app and every
 * script). Replaces the old app-wide $1/day ceiling (owner, 2026-10-23): "never more
 * than $25 in total, about $11.20 used so far; stop at $24".
 *
 *   - The ledger (data/anthropic-ledger.json) starts at the $11.20 spent before it
 *     existed (`seed_usd`) and records every call after that.
 *   - Every call reserves its worst-case cost BEFORE it is sent. A call is refused unless
 *     seed + settled spend + open reservations + this reservation stays at or under the
 *     hard stop ($24.00). The reservation is written to disk first, so a crash or a
 *     second process can never spend past the stop: an unsettled reservation stays
 *     counted until it is settled (or, after 2 hours, counted as spent at its estimate).
 *   - After the call it is settled at the cost computed from the usage Anthropic
 *     reported (tokens, cache writes and reads, web searches). A request Anthropic
 *     answered with an HTTP error is settled at $0 (not billed); a network failure or
 *     timeout, where the request may have run, is settled at the reservation.
 *   - Reads and writes go through a lock file and an atomic rename. A ledger that
 *     exists but cannot be read refuses every call rather than starting again from zero.
 *   - The environment can lower the stop (ANTHROPIC_LEDGER_STOP_USD), never raise it.
 *
 * Which keys it covers: ANTHROPIC_API_KEY (services/providers/anthropic.js, the last
 * resort in every chain) and FACT_CHECK_ANTHROPIC_KEY (services/fact-check-anthropic.js,
 * lesson research and verification). On 2026-10-23 only the second is set; both are
 * the owner's one Anthropic key budget.
 */
const fs = require('fs');
const path = require('path');

const HARD_STOP_USD = 24.0;
const SEED_USD = 11.2;
const OWNER_CAP_USD = 25.0;
const STALE_RESERVATION_MS = 2 * 60 * 60 * 1000;
const FILE = () => process.env.ANTHROPIC_LEDGER_FILE || path.join(__dirname, '..', 'data', 'anthropic-ledger.json');

/** Dollars per million tokens (Anthropic first-party list prices, 2026-10). Unknown models are priced as the most expensive. */
const PRICES = {
  'claude-fable-5-1': { input: 10, output: 50 },
  'claude-fable-5': { input: 10, output: 50 },
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-opus-5': { input: 5, output: 25 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-opus-4-7': { input: 5, output: 25 },
  'claude-opus-4-6': { input: 5, output: 25 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-5-5': { input: 0.5, output: 2.5 }, // the >100K-prompt rate, to stay on the safe side
  'claude-haiku-4-5': { input: 1, output: 5 },
};
const WORST = { input: 10, output: 50 };
const PER_SEARCH_USD = 0.01;

function stopUsd() {
  const env = Number(process.env.ANTHROPIC_LEDGER_STOP_USD);
  return Number.isFinite(env) && env >= 0 ? Math.min(env, HARD_STOP_USD) : HARD_STOP_USD;
}

function priceOf(model) {
  return PRICES[String(model || '').replace(/-\d{8}$/, '')] || WORST;
}

/** What a finished call cost, from its usage. */
function costOf(model, usage) {
  if (!usage) return 0;
  const p = priceOf(model);
  const searches = (usage.server_tool_use && usage.server_tool_use.web_search_requests) || 0;
  return ((usage.input_tokens || 0) * p.input
    + (usage.cache_creation_input_tokens || 0) * p.input * 2 // 1-hour cache writes are 2x; 5-minute are 1.25x
    + (usage.cache_read_input_tokens || 0) * p.input * 0.1
    + (usage.output_tokens || 0) * p.output) / 1e6 + searches * PER_SEARCH_USD;
}

/**
 * A call's worst case before it is sent: every input character as a token (real text
 * is ~4 per token), the whole max_tokens as output, every allowed search, and up to
 * 20,000 input tokens of search results per search.
 */
function estimate({ model, inputChars = 0, maxTokens = 4096, searches = 0 }) {
  const p = priceOf(model);
  const inTok = Number(inputChars) + searches * 20000;
  return (inTok * p.input * 1.25 + Number(maxTokens) * p.output) / 1e6 + searches * PER_SEARCH_USD;
}

function fresh() {
  return {
    note: 'Persistent TOTAL spend ledger for the owner\'s Anthropic key. Every Anthropic call (app or script) reserves here first and is refused past the stop. Do not delete: deleting it resets the count, not the money.',
    owner_cap_usd: OWNER_CAP_USD,
    stop_usd: HARD_STOP_USD,
    seed_usd: SEED_USD,
    seed_note: 'Spent on this key before the ledger existed (owner, 2026-10-23: "about $11.20 used so far").',
    created_at: new Date().toISOString(),
    settled_usd: 0,
    calls: 0,
    failed_calls: 0,
    refused_calls: 0,
    reservations: {},
    by_task: {},
    by_model: {},
    log: [],
  };
}

// ── locking and atomic writes ───────────────────────────────────────────────
function sleepSync(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }

function withLock(fn) {
  const lock = `${FILE()}.lock`;
  fs.mkdirSync(path.dirname(FILE()), { recursive: true });
  const until = Date.now() + 5000;
  let fd = null;
  while (fd === null) {
    try {
      fd = fs.openSync(lock, 'wx');
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      try { if (Date.now() - fs.statSync(lock).mtimeMs > 15000) fs.unlinkSync(lock); } catch { /* raced */ }
      if (Date.now() > until) throw new Error('anthropic ledger: lock busy for 5 s; refusing the call');
      sleepSync(25);
    }
  }
  try {
    return fn();
  } finally {
    try { fs.closeSync(fd); } catch { /* closed */ }
    try { fs.unlinkSync(lock); } catch { /* gone */ }
  }
}

function read() {
  let text;
  try {
    text = fs.readFileSync(FILE(), 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return fresh();
    throw new Error(`anthropic ledger unreadable (${err.message}); refusing`);
  }
  try {
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object' || !Number.isFinite(Number(data.settled_usd)) || !Number.isFinite(Number(data.seed_usd))) throw new Error('bad shape');
    data.reservations = data.reservations || {};
    return data;
  } catch (err) {
    throw new Error(`anthropic ledger corrupt (${err.message}); refusing every call until a person fixes ${FILE()}`);
  }
}

function write(data) {
  const tmp = `${FILE()}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
  fs.renameSync(tmp, FILE());
}

function reservedUsd(data) {
  return Object.values(data.reservations || {}).reduce((a, r) => a + (Number(r.usd) || 0), 0);
}

/** Old reservations from a process that died are counted as spent at their estimate. */
function expireStale(data) {
  const now = Date.now();
  for (const [id, r] of Object.entries(data.reservations || {})) {
    if (now - Date.parse(r.at) > STALE_RESERVATION_MS) {
      data.settled_usd = Number((Number(data.settled_usd) + Number(r.usd)).toFixed(6));
      data.log.push({ at: new Date().toISOString(), id, task: r.task, model: r.model, usd: r.usd, outcome: 'stale reservation counted as spent' });
      delete data.reservations[id];
    }
  }
}

function totals(data) {
  const reserved = reservedUsd(data);
  const spent = Number(data.seed_usd) + Number(data.settled_usd);
  return { spent_usd: Number(spent.toFixed(6)), reserved_usd: Number(reserved.toFixed(6)), committed_usd: Number((spent + reserved).toFixed(6)), stop_usd: stopUsd(), headroom_usd: Number((stopUsd() - spent - reserved).toFixed(6)) };
}

/** The current state, for the health endpoint and the reports. Never throws. */
function status() {
  try {
    const data = read();
    return { ok: true, ...totals(data), calls: data.calls, refused_calls: data.refused_calls, file: FILE() };
  } catch (err) {
    return { ok: false, reason: err.message, stop_usd: stopUsd(), headroom_usd: 0, file: FILE() };
  }
}

/** Is there room for a call of this size right now (no reservation made)? */
function canSpend(usd = 0) {
  const s = status();
  return s.ok && s.headroom_usd >= usd;
}

/**
 * Reserve `usd` for one call. Returns a reservation id, or throws a LEDGER_STOP error
 * (code 'LEDGER_STOP') when the call would pass the stop or the ledger is unreadable.
 */
function reserve({ usd, task = null, model = null }) {
  const amount = Math.max(0, Number(usd) || 0);
  return withLock(() => {
    const data = read();
    expireStale(data);
    const t = totals(data);
    if (t.committed_usd + amount > stopUsd() + 1e-9) {
      data.refused_calls = (data.refused_calls || 0) + 1;
      data.log.push({ at: new Date().toISOString(), task, model, usd: amount, outcome: `refused: would reach $${(t.committed_usd + amount).toFixed(4)} of the $${stopUsd().toFixed(2)} stop` });
      if (data.log.length > 1000) data.log = data.log.slice(-1000);
      write(data);
      throw Object.assign(new Error(`anthropic ledger: refused (committed $${t.committed_usd.toFixed(4)} + this call up to $${amount.toFixed(4)} would pass the $${stopUsd().toFixed(2)} stop)`), { code: 'LEDGER_STOP', status: 402 });
    }
    const id = `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    data.reservations[id] = { usd: Number(amount.toFixed(6)), task, model, at: new Date().toISOString(), pid: process.pid };
    write(data);
    return id;
  });
}

/**
 * Settle a reservation. `outcome`: 'ok' (usd = the computed cost), 'not_billed' (an HTTP
 * error from Anthropic: $0), 'unknown' (network/timeout: the reservation is counted).
 */
function settle(id, { usd = null, outcome = 'ok', usage = null } = {}) {
  return withLock(() => {
    const data = read();
    const r = data.reservations[id];
    if (!r) return null;
    let amount;
    if (outcome === 'not_billed') amount = 0;
    else if (outcome === 'unknown' || usd === null || !Number.isFinite(Number(usd))) amount = r.usd;
    else amount = Math.max(0, Number(usd));
    delete data.reservations[id];
    data.settled_usd = Number((Number(data.settled_usd) + amount).toFixed(6));
    data.calls = (data.calls || 0) + 1;
    if (outcome !== 'ok') data.failed_calls = (data.failed_calls || 0) + 1;
    const task = r.task || 'other';
    const bt = data.by_task[task] || { calls: 0, usd: 0 };
    data.by_task[task] = { calls: bt.calls + 1, usd: Number((bt.usd + amount).toFixed(6)) };
    const model = r.model || 'unknown';
    const bm = data.by_model[model] || { calls: 0, usd: 0 };
    data.by_model[model] = { calls: bm.calls + 1, usd: Number((bm.usd + amount).toFixed(6)) };
    data.log.push({
      at: new Date().toISOString(), id, task: r.task, model: r.model, reserved: r.usd, usd: Number(amount.toFixed(6)), outcome,
      ...(usage ? { usage: { in: usage.input_tokens || 0, out: usage.output_tokens || 0, cw: usage.cache_creation_input_tokens || 0, cr: usage.cache_read_input_tokens || 0, searches: (usage.server_tool_use && usage.server_tool_use.web_search_requests) || 0 } } : {}),
    });
    if (data.log.length > 1000) data.log = data.log.slice(-1000);
    write(data);
    const t = totals(data);
    console.log(`anthropic ledger: ${r.task || 'call'} on ${r.model || '?'} $${amount.toFixed(4)} (${outcome}); key total $${t.spent_usd.toFixed(4)} of the $${stopUsd().toFixed(2)} stop`);
    return { usd: amount, ...t };
  });
}

/**
 * Run one Anthropic call inside the ledger: reserve, call, settle. `call()` returns
 * { result, usage, model }; the cost is computed from the usage (or given as `usd`).
 * An Anthropic HTTP error (err.status set by the SDK) is settled as not billed.
 */
async function guard({ task, model, inputChars, maxTokens, searches = 0 }, call) {
  const id = reserve({ usd: estimate({ model, inputChars, maxTokens, searches }), task, model });
  try {
    const out = await call();
    const usage = out && out.usage;
    const usd = out && Number.isFinite(out.usd) ? out.usd : costOf((out && out.model) || model, usage);
    settle(id, { usd, outcome: 'ok', usage });
    return out;
  } catch (err) {
    const httpError = err && Number.isInteger(err.status) && err.status >= 400;
    settle(id, { outcome: httpError ? 'not_billed' : 'unknown' });
    throw err;
  }
}

/** Write the seeded ledger if there is none yet (never touches an existing one). */
function init() {
  return withLock(() => {
    if (!fs.existsSync(FILE())) write(fresh());
    return status();
  });
}

module.exports = { init, reserve, settle, guard, status, canSpend, estimate, costOf, priceOf, HARD_STOP_USD, SEED_USD, PRICES, FILE };
