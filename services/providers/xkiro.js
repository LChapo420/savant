/**
 * xKiro (https://xkiro.com), an OpenAI-compatible gateway with 47 models listed at $0
 * on its free plan (2026-10-23), for the BUILD PIPELINE only: drafting, independent
 * judging and evals of content this app writes. It is never on a learner's path.
 *
 * Why pipeline only:
 *   - Its privacy policy says the service "is not directed at children" and that
 *     prompts are forwarded to each model's own provider (Alibaba, Mistral, Cohere,
 *     Meituan and others), whose retention and training terms it does not state.
 *   - So no learner's words go here. A process must opt in with XKIRO_PIPELINE=1
 *     (scripts set it; the app server never does), and services/providers/index.js
 *     does not list it.
 *
 * Why it cannot spend:
 *   - Before a model is used, its entry in the key's own GET /models must say
 *     access_tier "free" with input and output prices of exactly 0. A paid model (the
 *     MiniMax ones are paid, $0.15/$0.60 per 1M for M3.1 Flash) is refused here, even
 *     if the account holds promotional credit, until the owner says otherwise.
 *   - The free plan allows XKIRO_DAILY_TOKENS (default 450,000, under the plan's
 *     500,000-a-day cap) per UTC day; past that every call is refused locally.
 *   - Every call is recorded in data/xkiro-usage.json (per day and model).
 *
 * One account only: xKiro's terms forbid using the service to "bypass or interfere
 * with rate limits, quotas or security mechanisms", so there is one key and no
 * rotation between accounts.
 *
 * Env: XKIRO_API_KEY, XKIRO_BASE_URL, XKIRO_PIPELINE=1, XKIRO_DAILY_TOKENS,
 * XKIRO_USAGE_FILE, XKIRO_TIMEOUT_MS.
 */
const fs = require('fs');
const path = require('path');
const sj = require('./structured-json');

const KEY = () => String(process.env.XKIRO_API_KEY || '').trim();
const BASE = () => String(process.env.XKIRO_BASE_URL || 'https://api.xkiro.com/v1').replace(/\/$/, '');
const USAGE_FILE = () => process.env.XKIRO_USAGE_FILE || path.join(__dirname, '..', '..', 'data', 'xkiro-usage.json');
const DAILY_TOKENS = () => Number(process.env.XKIRO_DAILY_TOKENS || 950000);
const pipelineOptIn = () => process.env.XKIRO_PIPELINE === '1';

let fetchImpl = (...args) => fetch(...args);
function _setFetch(fn) { fetchImpl = fn || ((...args) => fetch(...args)); }

// ── the $0 check, from the key's own model list ──────────────────────────────
let catalog = { at: 0, map: new Map(), error: null };
const CATALOG_TTL = 6 * 60 * 60 * 1000;

async function refreshCatalog() {
  try {
    const res = await fetchImpl(`${BASE()}/models`, { headers: { Authorization: `Bearer ${KEY()}` } });
    if (!res.ok) throw new Error(`xkiro models ${res.status}`);
    const data = await res.json();
    const map = new Map();
    for (const m of (data && data.data) || []) map.set(m.id, m);
    catalog = { at: Date.now(), map, error: null };
  } catch (err) {
    catalog = { ...catalog, error: err.message };
  }
  return catalog;
}

/** True only when the model is on the free tier and every listed price is exactly 0. */
function isFreeEntry(entry) {
  if (!entry || entry.access_tier !== 'free') return false;
  const p = entry.pricing;
  if (!p || typeof p !== 'object') return false;
  const prices = Object.entries(p).filter(([k, v]) => !['currency', 'unit'].includes(k) && v !== null && v !== undefined && v !== '');
  return prices.length > 0 && prices.every(([, v]) => Number(v) === 0);
}

async function verifiedFree(model) {
  if (Date.now() - catalog.at > CATALOG_TTL || !catalog.map.size) await refreshCatalog();
  return isFreeEntry(catalog.map.get(model));
}

/**
 * Models the account holds a free token grant for, though they are listed as paid.
 * The owner (2026-10-23): the account shows "61M free MiniMax M3.1 Flash tokens",
 * with no card and no dollar credit on it, so nothing can be charged; at worst a
 * call is refused. Each grant is capped a little under its size, counted over all
 * days in the usage record, and a payment error (402, "insufficient", "balance")
 * locks the model off for good.
 */
const GRANTS = () => {
  try { return JSON.parse(process.env.XKIRO_GRANTS || ''); } catch { /* default below */ }
  return { 'minimax/minimax-m3.1-flash': 60000000 };
};
function grantTokensUsed(model) {
  let n = 0;
  for (const [key, day] of Object.entries(readUsage())) {
    if (key.startsWith('_')) continue; // `_hours` holds the same tokens again
    const r = day && day[model];
    if (r) n += (r.input || 0) + (r.output || 0);
  }
  return n;
}
const grantLocked = new Set();
function grantAllows(model, maxTokens) {
  const cap = GRANTS()[model];
  if (!cap || grantLocked.has(model)) return false;
  return grantTokensUsed(model) + (maxTokens || 0) <= cap;
}

// ── the daily allowance and the usage record ─────────────────────────────────
const today = () => new Date().toISOString().slice(0, 10);
function readUsage() {
  try { return JSON.parse(fs.readFileSync(USAGE_FILE(), 'utf8')); } catch { return {}; }
}
function tokensToday() {
  const day = readUsage()[today()] || {};
  return Object.values(day).reduce((s, r) => s + (r.input || 0) + (r.output || 0), 0);
}
/**
 * Free-tier tokens used in the last 24 hours (a grant's tokens do not count). xKiro's
 * allowance window slides rather than resetting at midnight ("The window slides. It
 * does not reset at midnight", docs.xkiro.com/guides/pricing), so the record keeps
 * hourly totals under `_hours` and the current hour counts in full.
 */
const hourKey = (ms) => new Date(ms).toISOString().slice(0, 13);
function freeTokensToday() {
  const hours = readUsage()._hours || {};
  const since = hourKey(Date.now() - 23 * 3600 * 1000);
  let n = 0;
  for (const [h, models] of Object.entries(hours)) {
    if (h < since) continue;
    for (const [m, t] of Object.entries(models)) if (!GRANTS()[m]) n += t;
  }
  return n;
}
function record(model, counts) {
  try {
    const all = readUsage();
    const row = ((all[today()] = all[today()] || {})[model] = all[today()][model] || {});
    for (const [k, v] of Object.entries(counts)) row[k] = (row[k] || 0) + (Number(v) || 0);
    const tokens = (Number(counts.input) || 0) + (Number(counts.output) || 0);
    if (tokens) {
      const hours = (all._hours = all._hours || {});
      const h = hourKey(Date.now());
      const bucket = (hours[h] = hours[h] || {});
      bucket[model] = (bucket[model] || 0) + tokens;
      // Keep two days of hours; older ones no longer count.
      for (const k of Object.keys(hours)) if (k < hourKey(Date.now() - 48 * 3600 * 1000)) delete hours[k];
    }
    fs.mkdirSync(path.dirname(USAGE_FILE()), { recursive: true });
    fs.writeFileSync(USAGE_FILE(), `${JSON.stringify(all, null, 1)}\n`);
  } catch (err) {
    console.warn(`ai: could not write the xKiro usage record: ${err.message}`);
  }
}

const resting = new Map();
// How long a model that answered 429 rests (default 10 minutes). A runner that paces its
// own calls (curriculum-build/staged/night-runner) sets XKIRO_REST_MS=0 and backs off itself.
const REST_MS = () => (process.env.XKIRO_REST_MS !== undefined && process.env.XKIRO_REST_MS !== '' ? Number(process.env.XKIRO_REST_MS) : 10 * 60 * 1000);
const isResting = (m) => (resting.get(m) || 0) > Date.now();

/**
 * When a pipeline call through services/ai.js names no model: MiniMax M3.1 Flash
 * first (its 60M-token grant is the largest allowance here), then the strongest $0
 * models as backups. XKIRO_MODELS (comma list) overrides.
 */
const DEFAULT_MODELS = ['minimax/minimax-m3.1-flash', 'qwen/qwen3.8-max:free', 'mistralai/mistral-large-2512'];
/** Only plain model ids are ours: NVIDIA passes { model, effort } entries and Ollama 'model@effort'. */
function ownModels(models) {
  return [].concat(models || []).filter((m) => typeof m === 'string' && m.includes('/') && !m.includes('@'));
}
function defaultModels() {
  const list = String(process.env.XKIRO_MODELS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return list.length ? list : DEFAULT_MODELS;
}

async function postOnce(body, timeoutMs, signal = null) {
  if (!pipelineOptIn()) throw Object.assign(new Error('xkiro: pipeline use only (XKIRO_PIPELINE=1 not set)'), { status: 403 });
  const free = await verifiedFree(body.model);
  const granted = !free && grantAllows(body.model, body.max_tokens);
  if (!free && !granted) {
    const why = GRANTS()[body.model] ? (grantLocked.has(body.model) ? 'its grant was refused by xKiro' : 'its free token grant is used up') : 'it is not listed free at $0';
    throw Object.assign(new Error(`xkiro: ${body.model} refused: ${why}`), { status: 402 });
  }
  // The 1M-a-day cap is the free plan's (verified account; 950K leaves a margin), for free models; a grant has its own total.
  if (free && freeTokensToday() + (body.max_tokens || 0) > DAILY_TOKENS()) throw Object.assign(new Error(`xkiro: daily free allowance used (${DAILY_TOKENS()} tokens per day)`), { status: 429, daily: true });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  // services/pool.js cancels the losing copy of a hedged call through `signal`.
  if (signal) { if (signal.aborted) ctrl.abort(); else signal.addEventListener('abort', () => ctrl.abort(), { once: true }); }
  try {
    const res = await fetchImpl(`${BASE()}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let payload = null;
    try { payload = JSON.parse(text); } catch { payload = { raw: text.slice(0, 300) }; }
    if (!res.ok || (payload && payload.error && !payload.choices)) {
      const msg = (payload && payload.error && (payload.error.message || payload.error)) || res.statusText;
      if (res.status === 429) record(body.model, { rate_limited: 1 });
      if (granted && (res.status === 402 || /insufficient|balance|credit|quota exceeded|payment/i.test(String(msg)))) {
        grantLocked.add(body.model);
        record(body.model, { grant_refused: 1 });
      }
      throw Object.assign(new Error(`xkiro ${res.status}: ${String(typeof msg === 'string' ? msg : JSON.stringify(msg)).slice(0, 200)}`), { status: res.ok ? 502 : res.status });
    }
    const u = payload.usage || {};
    record(body.model, { calls: 1, input: u.prompt_tokens || 0, output: u.completion_tokens || 0 });
    return payload;
  } catch (err) {
    if (err.name === 'AbortError') throw Object.assign(new Error(signal && signal.aborted ? 'xkiro: aborted by the caller' : `xkiro: timed out after ${Math.round(timeoutMs / 1000)}s`), { status: 0, timeout: !(signal && signal.aborted), aborted: !!(signal && signal.aborted) });
    if (err.status === undefined) err.status = 0;
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * One request, retried on xKiro's own 429 (the free plan allows few requests at once):
 * up to XKIRO_RETRIES more tries (default 3), waiting 15 s, 30 s, 60 s. A local refusal
 * (pipeline, price, daily cap, grant) is never retried.
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function post(body, timeoutMs, signal = null) {
  const retries = Number(process.env.XKIRO_RETRIES || 3);
  for (let attempt = 0; ; attempt++) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await postOnce(body, timeoutMs, signal);
    } catch (err) {
      if (err.aborted || err.status !== 429 || err.daily || attempt >= retries) throw err;
      // eslint-disable-next-line no-await-in-loop
      await sleep(Number(process.env.XKIRO_RETRY_MS || 15000) * (2 ** attempt));
    }
  }
}

const xkiro = {
  name: 'xkiro',
  outside: true,
  learnerData: false,
  isConfigured() { return !!KEY(); },
  isEnabled() { return this.isConfigured() && pipelineOptIn() && (freeTokensToday() < DAILY_TOKENS() || Object.keys(GRANTS()).some((m) => grantAllows(m, 0))); },
  status() {
    const grants = Object.fromEntries(Object.entries(GRANTS()).map(([m, cap]) => [m, { used: grantTokensUsed(m), cap, refused: grantLocked.has(m) }]));
    const reason = !this.isConfigured() ? 'no xKiro key' : !pipelineOptIn() ? 'pipeline only (XKIRO_PIPELINE=1 not set)' : null;
    return { configured: this.isConfigured(), available: this.isEnabled(), reason, pipeline: pipelineOptIn(), free_tokens_today: freeTokensToday(), daily_cap: DAILY_TOKENS(), grants, catalog: catalog.error || (catalog.at ? 'ok' : 'not yet') };
  },
  costCents() { return 0; },
  modelFor() { return defaultModels().find((m) => !isResting(m)) || defaultModels()[0]; },
  describeError(err) { return err && err.message ? err.message : String(err); },

  // reasoningEffort (optional): sent as reasoning_effort for models that list reasoning levels
  // (MiniMax M3.1 Flash: low..max, default max; at max it can reason past any token limit).
  async structured({ system, user, schema, schemaName = 'submit', maxTokens = 2048, models, timeoutMs = null, reasoningEffort = null, signal = null }) {
    // NVIDIA model entries ({ model, effort }) passed down the chain are not ours.
    const own = ownModels(models);
    const list = (own.length ? own : defaultModels()).filter((m) => m && !isResting(m));
    let lastErr = null;
    for (const model of list) {
      const messages = [
        { role: 'system', content: `${system || ''}\n\nReply with one JSON object only (no prose, no code fence) matching this JSON schema (${schemaName}):\n${JSON.stringify(schema)}`.trim() },
        { role: 'user', content: String(user || '') },
      ];
      try {
        // eslint-disable-next-line no-await-in-loop
        const payload = await post({ model, messages, max_tokens: Math.max(512, Number(maxTokens) || 1024) + 2048, temperature: 0, ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}) }, timeoutMs || Number(process.env.XKIRO_TIMEOUT_MS) || 180000, signal);
        const msg = payload.choices && payload.choices[0] && payload.choices[0].message;
        const parsed = sj.parseStructured(msg, schemaName);
        const checked = parsed.data !== undefined ? sj.validate(schema, parsed.data) : null;
        if (checked && !checked.errors.length) {
          const u = payload.usage || {};
          return { data: checked.value, usage: { input_tokens: u.prompt_tokens || 0, output_tokens: u.completion_tokens || 0, cost_usd: 0 }, model, tier: 'xkiro_free' };
        }
        lastErr = Object.assign(new Error(`xkiro: ${model} gave an unusable ${schemaName}`), { status: 422, unusable: true });
      } catch (err) {
        lastErr = err;
        if (err.aborted || err.daily || err.status === 402 || err.status === 403) throw err;
        if (err.status === 429) resting.set(model, Date.now() + REST_MS());
      }
    }
    throw lastErr || new Error('xkiro: no model answered');
  },

  async chat({ system, messages, maxTokens = 1024, models, timeoutMs = null, signal = null }) {
    let lastErr = null;
    const own = ownModels(models);
    for (const model of (own.length ? own : defaultModels()).filter((m) => !isResting(m))) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const payload = await post({ model, messages: [...(system ? [{ role: 'system', content: system }] : []), ...(messages || [])], max_tokens: Number(maxTokens) || 1024, temperature: 0 }, timeoutMs || 180000, signal);
        const text = sj.stripThinking(payload.choices && payload.choices[0] && payload.choices[0].message && payload.choices[0].message.content);
        if (text) return { text, model, tier: 'xkiro_free' };
      } catch (err) {
        lastErr = err;
        if (err.aborted || err.daily || err.status === 402 || err.status === 403) throw err;
        if (err.status === 429) resting.set(model, Date.now() + REST_MS());
      }
    }
    throw lastErr || new Error('xkiro: no model answered');
  },
};

function _reset() { catalog = { at: 0, map: new Map(), error: null }; resting.clear(); grantLocked.clear(); }

module.exports = { xkiro, isFreeEntry, verifiedFree, refreshCatalog, tokensToday, freeTokensToday, grantTokensUsed, GRANTS, _setFetch, _reset };
