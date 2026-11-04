/**
 * Crouton Alpha (OpenRouter `stealth/crouton-alpha`, $0, 1M context): free, but limited to 1000 requests per UTC day. This is a request
 * counter with the credit-ledger interface (every call costs $0): data/crouton-counter.json (env CROUTON_COUNTER_FILE) holds
 * { day: 'YYYY-MM-DD' (UTC), count }; a call is counted BEFORE it is sent and refused once the day's count reaches CROUTON_DAILY_MAX
 * (default 950; the env may only lower it). Stealth models log prompts: pipeline data only.
 */
const fs = require('fs');
const path = require('path');

const HARD_MAX = 950;
const FILE = () => process.env.CROUTON_COUNTER_FILE || path.join(__dirname, '..', 'data', 'crouton-counter.json');
const dayOf = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
const max = () => { const e = Number(process.env.CROUTON_DAILY_MAX); return Number.isFinite(e) && e >= 0 ? Math.min(e, HARD_MAX) : HARD_MAX; };
const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function read() {
  let data;
  try { data = JSON.parse(fs.readFileSync(FILE(), 'utf8')); } catch (err) {
    if (err.code === 'ENOENT') return { day: dayOf(), count: 0 };
    throw new Error(`crouton counter unreadable (${err.message}); refusing`);
  }
  if (!data || !Number.isFinite(Number(data.count))) throw new Error('crouton counter corrupt; refusing');
  return data.day === dayOf() ? { day: data.day, count: Number(data.count) } : { day: dayOf(), count: 0 };
}

function withLock(fn) {
  const lock = `${FILE()}.lock`;
  fs.mkdirSync(path.dirname(FILE()), { recursive: true });
  const until = Date.now() + 5000;
  let fd = null;
  while (fd === null) {
    try { fd = fs.openSync(lock, 'wx'); } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      try { if (Date.now() - fs.statSync(lock).mtimeMs > 15000) fs.unlinkSync(lock); } catch { /* raced */ }
      if (Date.now() > until) throw new Error('crouton counter: lock busy; refusing the call');
      sleepSync(25);
    }
  }
  try { return fn(); } finally { try { fs.closeSync(fd); } catch { /* closed */ } try { fs.unlinkSync(lock); } catch { /* gone */ } }
}

function status() {
  try {
    const d = read();
    const left = Math.max(0, max() - d.count);
    return { ok: true, day: d.day, count: d.count, max: max(), left, spent_usd: 0, reserved_usd: 0, committed_usd: 0, cap_usd: 0, headroom_usd: left > 0 ? 1 : 0, file: FILE() };
  } catch (err) { return { ok: false, reason: err.message, cap_usd: 0, headroom_usd: 0, file: FILE() }; }
}
const canSpend = () => { const s = status(); return s.ok && s.left > 0; };

function reserve() {
  return withLock(() => {
    const d = read();
    if (d.count >= max()) throw Object.assign(new Error(`crouton: ${d.count} requests today (UTC ${d.day}), stop at ${max()}`), { code: 'LEDGER_STOP', status: 402 });
    d.count += 1;
    const tmp = `${FILE()}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(d));
    fs.renameSync(tmp, FILE());
    return `c${d.count}`;
  });
}

module.exports = { init: status, reserve, settle: () => null, status, canSpend, estimate: () => 0, costOf: () => 0, priceOf: () => ({ input: 0, output: 0 }), CAP_USD: 0, SEED_USD: 0, PRICES: {}, PAGE_PRICES: {}, FILE, HARD_MAX };
