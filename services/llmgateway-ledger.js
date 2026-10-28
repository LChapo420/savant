/**
 * The LLM Gateway key's TOTAL spend, persistent, across every process. Same shape and
 * guarantees as services/standard-compute-ledger.js, for the one thing this key is for:
 * Spanish speech (text-to-speech eleven-v3 and speech-to-text, services/spanish/voice.js).
 * It is never used for text generation, and no code path sends text to it.
 *
 *   - data/llmgateway-ledger.json is created if missing, and the TOTAL cap is $5.00.
 *   - Every call reserves its worst-case cost BEFORE it is sent; a call is refused unless
 *     seed + settled + open reservations + this reservation stays at or under the cap.
 *     The caller then falls back to the browser's own Spanish voice (voice.js already
 *     answers 503 and the page speaks the line itself).
 *   - An HTTP error the gateway answered is $0 (not billed); a network failure, timeout
 *     or abort after the request left is settled at the reservation. A reservation never
 *     settled is counted as spent at its estimate after 2 hours.
 *   - A ledger that exists but cannot be read refuses every call rather than starting
 *     again from zero. The environment can lower the cap (LLMGATEWAY_CAP_USD), never raise it.
 *
 * Prices (published by the gateway; checked 2026-10-28):
 *   eleven-v3     $0.11 per 1K characters of input text   https://llmgateway.io/models/eleven-v3
 *   grok-stt-1-0  $0.10 per hour of input audio           https://llmgateway.io/models/grok-stt-1-0
 * The gateway publishes no price for any other speech model that voice.js could be pointed at
 * (SPANISH_GATEWAY_TTS_MODEL / SPANISH_GATEWAY_STT_MODEL), so an unlisted model is priced at a
 * CEILING (CEILING below: $0.30 per 1K characters, $6.00 per hour). Every figure also carries
 * MARGIN (x1.15) for fees the gateway may add on credit purchases. The ledger is a guard,
 * not an invoice: the real balance is on the LLM Gateway dashboard.
 *
 * Speech-to-text is billed by audio length, which the server only has as a byte count; it is
 * estimated at 4,000 bytes per second (32 kbit/s, the thinnest audio the app records), so
 * WAV (which is far heavier per second) is over-counted, never under-counted.
 */
const fs = require('fs');
const path = require('path');

const CAP_USD = 5.0;
const SEED_USD = 0;
const MARGIN = 1.15;
const STALE_RESERVATION_MS = 2 * 60 * 60 * 1000;
const FILE = () => process.env.LLMGATEWAY_LEDGER_FILE || path.join(__dirname, '..', 'data', 'llmgateway-ledger.json');

/** Published prices: tts per 1K characters, stt per hour of audio. */
const PRICES = {
  tts: { 'eleven-v3': 0.11 },
  stt: { 'grok-stt-1-0': 0.1 },
};
/** Used for a model the gateway has no published price for here. */
const CEILING = { tts: 0.3, stt: 6.0 };
const BYTES_PER_SECOND = 4000;
const MIN_CALL_USD = 0.0001; // a call is never free in the ledger, so tiny clips cannot round to nothing

function capUsd() {
  const env = Number(process.env.LLMGATEWAY_CAP_USD);
  return Number.isFinite(env) && env >= 0 ? Math.min(env, CAP_USD) : CAP_USD;
}

/** What a call costs (the same number is reserved and, when it succeeds, settled). */
function costOf({ kind, model, chars = 0, bytes = 0 }) {
  if (kind === 'tts') {
    const per1k = PRICES.tts[model] != null ? PRICES.tts[model] : CEILING.tts;
    return (Number(chars) / 1000) * per1k * MARGIN;
  }
  if (kind === 'stt') {
    const perHour = PRICES.stt[model] != null ? PRICES.stt[model] : CEILING.stt;
    return Math.max(MIN_CALL_USD, ((Number(bytes) / BYTES_PER_SECOND) / 3600) * perHour * MARGIN);
  }
  throw new Error(`llmgateway ledger: unknown kind "${kind}" (only tts and stt; the gateway is not used for text)`);
}

function fresh() {
  return {
    note: 'Persistent TOTAL spend ledger for the owner\'s LLM Gateway key (Spanish speech only). Every call reserves here first and is refused past the cap. Do not delete: deleting it resets the count, not the money.',
    cap_usd: CAP_USD,
    seed_usd: SEED_USD,
    seed_note: 'Spend before this ledger existed. Zero by default; raise it by hand if the dashboard shows earlier spend.',
    price_source: 'https://llmgateway.io/models/eleven-v3 ($0.11/1K chars) and https://llmgateway.io/models/grok-stt-1-0 ($0.10/hour), checked 2026-10-28; other models at a ceiling; x1.15 margin',
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
      if (Date.now() > until) throw new Error('llmgateway ledger: lock busy for 5 s; refusing the call');
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
    throw new Error(`llmgateway ledger unreadable (${err.message}); refusing`);
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
    throw new Error(`llmgateway ledger corrupt (${err.message}); refusing every call until a person fixes ${FILE()}`);
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

function canSpend(usd = 0) {
  const s = status();
  return s.ok && s.headroom_usd >= usd;
}

/**
 * Reserve what this call can cost; throws a LEDGER_STOP error (status 402) past the cap or
 * when the ledger is unreadable. `call` is { kind: 'tts', model, chars } or { kind: 'stt', model, bytes }.
 */
function reserve(call) {
  const amount = Math.max(0, costOf(call));
  const task = call.kind;
  const model = call.model || null;
  return withLock(() => {
    const data = read();
    expireStale(data);
    const t = totals(data);
    if (t.committed_usd + amount > capUsd() + 1e-9) {
      data.refused_calls = (data.refused_calls || 0) + 1;
      data.log.push({ at: new Date().toISOString(), task, model, usd: Number(amount.toFixed(6)), outcome: `refused: would reach $${(t.committed_usd + amount).toFixed(4)} of the $${capUsd().toFixed(2)} cap` });
      if (data.log.length > 1000) data.log = data.log.slice(-1000);
      write(data);
      throw Object.assign(new Error(`llmgateway ledger: refused (committed $${t.committed_usd.toFixed(4)} + this call up to $${amount.toFixed(4)} would pass the $${capUsd().toFixed(2)} cap)`), { code: 'LEDGER_STOP', status: 402 });
    }
    const id = `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    data.reservations[id] = { usd: Number(amount.toFixed(6)), task, model, at: new Date().toISOString(), pid: process.pid };
    write(data);
    return id;
  });
}

/** outcome: 'ok' (settled at the reserved cost), 'not_billed' (an HTTP error the gateway answered: $0), 'unknown' (counted at the reservation). */
function settle(id, { outcome = 'ok' } = {}) {
  return withLock(() => {
    const data = read();
    const r = data.reservations[id];
    if (!r) return null;
    const amount = outcome === 'not_billed' ? 0 : r.usd;
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
    data.log.push({ at: new Date().toISOString(), id, task: r.task, model: r.model, reserved: r.usd, usd: Number(amount.toFixed(6)), outcome });
    if (data.log.length > 1000) data.log = data.log.slice(-1000);
    write(data);
    return { usd: amount, ...totals(data) };
  });
}

/** Write the ledger if there is none yet (never touches an existing one). */
function init() {
  return withLock(() => {
    if (!fs.existsSync(FILE())) write(fresh());
    return status();
  });
}

module.exports = { init, reserve, settle, status, canSpend, costOf, CAP_USD, SEED_USD, MARGIN, PRICES, CEILING, FILE };
