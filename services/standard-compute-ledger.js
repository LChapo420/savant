/**
 * The Standard Compute key's TOTAL spend, persistent, across every process (the app and
 * every script). Same shape and guarantees as services/anthropic-ledger.js:
 *
 *   - data/standard-compute-ledger.json is created if missing, starting at the
 *     $0.50 already spent (owner, 2026-10-27), and the TOTAL cap is $20.00 (was $15.00 until 2026-10-28) across
 *     everything (this app, scripts, the night runner, tests).
 *   - Every call reserves its worst-case cost BEFORE it is sent; a call is refused
 *     unless seed + settled + open reservations + this reservation stays at or under
 *     the cap. The reservation is on disk first, so a crash or a second process can
 *     never pass the cap; an unsettled reservation stays counted (after 2 hours it is
 *     counted as spent at its estimate).
 *   - Settled at the cost computed from the usage the API reported. An HTTP error that
 *     the API answered is $0 (not billed); a network failure, timeout or an abort
 *     after the request left, where it may have run, is settled at the reservation.
 *   - Reads and writes use a lock file and an atomic rename. A ledger that exists but
 *     cannot be read refuses every call rather than starting again from zero.
 *   - The environment can lower the cap (STANDARD_COMPUTE_CAP_USD), never raise it.
 *
 * Prices: Standard Compute's model list (GET /v1/models) carries no prices and
 * its responses carry no cost, so the ledger prices tokens at a deliberately HIGH
 * assumed rate (PRICES below; STANDARD_COMPUTE_PRICE_IN / _OUT override, per Mtok) so
 * that the recorded figure is an upper bound on the real bill. Check the real balance
 * on the Standard Compute dashboard; the ledger is a guard, not an invoice.
 */
const fs = require('fs');
const path = require('path');

const CAP_USD = 20.0; // raised from $15 by the owner on 2026-10-28
const SEED_USD = 0.5;
const STALE_RESERVATION_MS = 2 * 60 * 60 * 1000;
const FILE = () => process.env.STANDARD_COMPUTE_LEDGER_FILE || path.join(__dirname, '..', 'data', 'standard-compute-ledger.json');

/** Dollars per million tokens: an assumed upper bound (see the header). */
const PRICES = {
  'deepseek/deepseek-v4.1-flash-1017': { input: 0.3, output: 1.2 },
};
const WORST = { input: 1, output: 4 };

function capUsd() {
  const env = Number(process.env.STANDARD_COMPUTE_CAP_USD);
  return Number.isFinite(env) && env >= 0 ? Math.min(env, CAP_USD) : CAP_USD;
}

function priceOf(model) {
  const base = PRICES[model] || WORST;
  const i = Number(process.env.STANDARD_COMPUTE_PRICE_IN);
  const o = Number(process.env.STANDARD_COMPUTE_PRICE_OUT);
  return { input: Number.isFinite(i) && i > 0 ? i : base.input, output: Number.isFinite(o) && o > 0 ? o : base.output };
}

function costOf(model, usage) {
  if (!usage) return 0;
  const p = priceOf(model);
  return ((usage.input_tokens || 0) * p.input + (usage.output_tokens || 0) * p.output) / 1e6;
}

/** A call's worst case before it is sent: every input char as a token, all of max_tokens as output. */
function estimate({ model, inputChars = 0, maxTokens = 4096 }) {
  const p = priceOf(model);
  return (Number(inputChars) * p.input * 1.25 + Number(maxTokens) * p.output) / 1e6;
}

function fresh() {
  return {
    note: 'Persistent TOTAL spend ledger for the owner\'s Standard Compute key. Every call (app, script, night runner) reserves here first and is refused past the cap. Do not delete: deleting it resets the count, not the money.',
    cap_usd: CAP_USD,
    seed_usd: SEED_USD,
    seed_note: 'Already spent before this ledger existed (owner, 2026-10-27: $0.50).',
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
      if (Date.now() > until) throw new Error('standard compute ledger: lock busy for 5 s; refusing the call');
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
    throw new Error(`standard compute ledger unreadable (${err.message}); refusing`);
  }
  try {
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object' || !Number.isFinite(Number(data.settled_usd)) || !Number.isFinite(Number(data.seed_usd))) throw new Error('bad shape');
    data.reservations = data.reservations || {};
    data.log = data.log || [];
    data.by_task = data.by_task || {};
    data.by_model = data.by_model || {};
    return data;
  } catch (err) {
    throw new Error(`standard compute ledger corrupt (${err.message}); refusing every call until a person fixes ${FILE()}`);
  }
}

function write(data) {
  const tmp = `${FILE()}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
  fs.renameSync(tmp, FILE());
}

const reservedUsd = (data) => Object.values(data.reservations || {}).reduce((a, r) => a + (Number(r.usd) || 0), 0);

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
  return {
    spent_usd: Number(spent.toFixed(6)),
    reserved_usd: Number(reserved.toFixed(6)),
    committed_usd: Number((spent + reserved).toFixed(6)),
    cap_usd: capUsd(),
    headroom_usd: Number((capUsd() - spent - reserved).toFixed(6)),
  };
}

/** The current state. Never throws. */
function status() {
  try {
    const data = read();
    return { ok: true, ...totals(data), calls: data.calls, refused_calls: data.refused_calls, file: FILE() };
  } catch (err) {
    return { ok: false, reason: err.message, cap_usd: capUsd(), headroom_usd: 0, file: FILE() };
  }
}

/**
 * `ceilingUsd` (optional) holds one kind of caller to a lower limit than the cap (the tutor, $16:
 * services/tutor-standard-compute.js): committed + usd must stay within it. It can only lower the limit.
 */
function canSpend(usd = 0, ceilingUsd = null) {
  const s = status();
  if (!s.ok) return false;
  const limit = ceilingUsd == null ? s.cap_usd : Math.min(s.cap_usd, Number(ceilingUsd));
  return limit - s.committed_usd >= usd;
}

/** Reserve `usd`; throws a LEDGER_STOP error (status 402) past the cap (or the caller's lower ceiling) or when unreadable. */
function reserve({ usd, task = null, model = null, ceilingUsd = null }) {
  const amount = Math.max(0, Number(usd) || 0);
  return withLock(() => {
    const data = read();
    expireStale(data);
    const t = totals(data);
    // A caller may hold itself to a lower ceiling than the cap (the tutor, services/tutor-standard-compute.js), never a higher one.
    const limit = ceilingUsd == null ? capUsd() : Math.min(capUsd(), Number(ceilingUsd));
    const what = limit < capUsd() ? 'ceiling' : 'cap';
    if (t.committed_usd + amount > limit + 1e-9) {
      data.refused_calls = (data.refused_calls || 0) + 1;
      data.log.push({ at: new Date().toISOString(), task, model, usd: amount, outcome: `refused: would reach $${(t.committed_usd + amount).toFixed(4)} of the $${limit.toFixed(2)} ${what}` });
      if (data.log.length > 1000) data.log = data.log.slice(-1000);
      write(data);
      throw Object.assign(new Error(`standard compute ledger: refused (committed $${t.committed_usd.toFixed(4)} + this call up to $${amount.toFixed(4)} would pass the $${limit.toFixed(2)} ${what})`), { code: 'LEDGER_STOP', status: 402 });
    }
    const id = `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    data.reservations[id] = { usd: Number(amount.toFixed(6)), task, model, at: new Date().toISOString(), pid: process.pid };
    write(data);
    return id;
  });
}

/** outcome: 'ok' (usd = computed cost), 'not_billed' (an HTTP error the API answered: $0), 'unknown' (counted at the reservation). */
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
      ...(usage ? { usage: { in: usage.input_tokens || 0, out: usage.output_tokens || 0 } } : {}),
    });
    if (data.log.length > 1000) data.log = data.log.slice(-1000);
    write(data);
    return { usd: amount, ...totals(data) };
  });
}

/** Write the seeded ledger if there is none yet (never touches an existing one). */
function init() {
  return withLock(() => {
    if (!fs.existsSync(FILE())) write(fresh());
    return status();
  });
}

module.exports = { init, reserve, settle, status, canSpend, estimate, costOf, priceOf, CAP_USD, SEED_USD, PRICES, FILE };
