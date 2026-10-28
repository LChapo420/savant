/**
 * The free outside APIs, as the last free tier before Claude (owner, 2026-10-23):
 * "use these only if they give a chance of working where our entire free optimized
 * system can't". They sit after NVIDIA and the local models and before Anthropic
 * (services/providers/index.js), and they are built so that they CANNOT spend:
 *
 *   openrouter_free   OpenRouter, `:free` model ids only. Before a model is used its
 *                     listed price is read from GET /api/v1/models and must be 0 for
 *                     prompt, completion and request; anything else is refused. One
 *                     model per request (no `models` fallback array, no plugins, no
 *                     `:online`), so OpenRouter has no way to route to a paid model.
 *                     The OpenRouter balance must stay above $0 (at $0 the free models
 *                     stop answering too), and nothing here touches it.
 *   gemini_free       Google AI Studio's free tier, through services/providers/gemini.js.
 *                     A Gemini key is free only while its project has no billing, and
 *                     nothing in a normal response says which, so this is OFF until it
 *                     is confirmed: GEMINI_FREE_TIER_CONFIRMED=1 (the owner checked AI
 *                     Studio shows the free plan), or a 429 whose quota metric names
 *                     the free tier has been seen (recorded in data/free-tier-evidence.json).
 *
 * Both are "outside" processing (the learner's words leave this machine), so
 * services/ai.js keeps them away from a learner without the consent for it.
 *
 * Env: AI_FREE_FALLBACKS=0 (off), OPENROUTER_FREE_MODELS (comma list, best first),
 * OPENROUTER_FREE_TIMEOUT_MS, GEMINI_FREE_TIER_CONFIRMED, FREE_TIER_EVIDENCE_FILE.
 */
const fs = require('fs');
const path = require('path');
const sj = require('./structured-json');

const OR_BASE = () => (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
const EVIDENCE_FILE = () => process.env.FREE_TIER_EVIDENCE_FILE || path.join(__dirname, '..', '..', 'data', 'free-tier-evidence.json');

/**
 * Free OpenRouter models, best first for this app's judging work. Nemotron 3 Ultra is
 * the same model as NVIDIA's light tier (the grading cascade's first judge), on a
 * different provider's rate limit; Gemma 4 31B and Nemotron 3 Super are independent
 * second opinions. Listed 2026-10-23 at $0 prompt and completion.
 */
const DEFAULT_OR_MODELS = [
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'google/gemma-4-31b-it:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
];

let fetchImpl = (...args) => fetch(...args);
function _setFetch(fn) { fetchImpl = fn || ((...args) => fetch(...args)); }

const enabledByEnv = () => String(process.env.AI_FREE_FALLBACKS || '1') !== '0';
const orKey = () => String(process.env.OPENROUTER_API_KEY || '').trim();
function orModels() {
  const list = String(process.env.OPENROUTER_FREE_MODELS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return (list.length ? list : DEFAULT_OR_MODELS).filter((m) => /:free$/.test(m));
}

// ── price verification ──────────────────────────────────────────────────────
let prices = { at: 0, map: new Map(), params: new Map(), error: null };
const PRICE_TTL = 6 * 60 * 60 * 1000;

/** Every model's listed price, from the public model list (no key needed). */
async function refreshPrices() {
  try {
    const res = await fetchImpl(`${OR_BASE()}/models`, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`openrouter models ${res.status}`);
    const data = await res.json();
    const map = new Map();
    const params = new Map();
    for (const m of (data && data.data) || []) { map.set(m.id, m.pricing || null); params.set(m.id, m.supported_parameters || []); }
    prices = { at: Date.now(), map, params, error: null };
  } catch (err) {
    prices = { ...prices, error: err.message };
  }
  return prices;
}

/** True only for a `:free` id whose every listed price is exactly zero. */
function isZeroPriced(pricing) {
  if (!pricing || typeof pricing !== 'object') return false;
  const fields = Object.entries(pricing).filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (!fields.length) return false;
  return fields.every(([, v]) => Number(v) === 0);
}

async function verifiedFree(model) {
  if (!/:free$/.test(model)) return false;
  if (Date.now() - prices.at > PRICE_TTL || !prices.map.size) await refreshPrices();
  return isZeroPriced(prices.map.get(model));
}

// ── OpenRouter, free models only ────────────────────────────────────────────
const resting = new Map(); // model -> until
function restModel(model, ms) { resting.set(model, Date.now() + ms); }
const isResting = (model) => (resting.get(model) || 0) > Date.now();

async function orPost(body, timeoutMs, signal = null) {
  // The last line of defence: nothing but a `:free` id with the $0 cap is ever sent.
  if (lockedReason()) throw Object.assign(new Error(`openrouter_free: locked off (${lockedReason()})`), { status: 402 });
  if (!/:free$/.test(String(body.model || '')) || body.models || !body.provider || !body.provider.max_price
    || Object.values(body.provider.max_price).some((v) => v !== 0)) {
    throw Object.assign(new Error('openrouter_free: refused to send a request that is not a $0-capped :free call'), { status: 402 });
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  // services/pool.js cancels the losing copy of a hedged call through `signal`.
  if (signal) { if (signal.aborted) ctrl.abort(); else signal.addEventListener('abort', () => ctrl.abort(), { once: true }); }
  try {
    const res = await fetchImpl(`${OR_BASE()}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${orKey()}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://savant.local',
        'X-Title': 'Savant (free fallback)',
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let payload = null;
    try { payload = JSON.parse(text); } catch { payload = { raw: text.slice(0, 300) }; }
    if (!res.ok || (payload && payload.error && !payload.choices)) {
      const msg = (payload && payload.error && (payload.error.message || payload.error)) || res.statusText;
      throw Object.assign(new Error(`openrouter_free ${res.status}: ${String(typeof msg === 'string' ? msg : JSON.stringify(msg)).slice(0, 200)}`), { status: res.ok ? 502 : res.status });
    }
    return payload;
  } catch (err) {
    if (err.name === 'AbortError') throw Object.assign(new Error(signal && signal.aborted ? 'openrouter_free: aborted by the caller' : `openrouter_free: timed out after ${Math.round(timeoutMs / 1000)}s`), { status: 0, timeout: !(signal && signal.aborted), aborted: !!(signal && signal.aborted) });
    if (err.status === undefined) err.status = 0;
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function orUsage(payload, model) {
  const u = (payload && payload.usage) || {};
  // OpenRouter reports what the call cost. Anything above zero means the route was not
  // free after all: stop using the model and say so loudly.
  if (Number(u.cost) > 0) lockOff(`${model} reported a cost of $${u.cost} at ${new Date().toISOString()}`);
  return { input_tokens: u.prompt_tokens || 0, output_tokens: u.completion_tokens || 0, cost_usd: Number(u.cost) || 0 };
}

/**
 * The request body for one free model. Never `models`, `route`, plugins or `:online`,
 * and always OpenRouter's own server-side price cap at $0 (`provider.max_price`): even
 * with a funded key, a request that could only be served by a paid endpoint is refused
 * by OpenRouter itself (measured 2026-10-23: a paid model with this cap returned 404
 * "No endpoints found that satisfy the max price", and nothing was charged).
 */
const ZERO_PRICE = { prompt: 0, completion: 0, request: 0, image: 0 };
function orBody(model, messages, maxTokens, extra = {}) {
  return { ...extra, model, messages, max_tokens: Math.max(256, Number(maxTokens) || 1024) + 4096, temperature: 0, provider: { max_price: ZERO_PRICE } };
}

/** Any reported cost above $0 locks the whole tier off (persisted) until a person clears it. */
let locked = null;
function lockedReason() {
  if (locked) return locked;
  try {
    const e = JSON.parse(fs.readFileSync(EVIDENCE_FILE(), 'utf8'));
    if (e.openrouter_free_locked) locked = e.openrouter_free_locked;
  } catch { /* no evidence file */ }
  return locked;
}
function lockOff(reason) {
  locked = reason;
  try {
    const file = EVIDENCE_FILE();
    let e = {};
    try { e = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { e = {}; }
    e.openrouter_free_locked = reason;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(e, null, 1));
  } catch { /* the in-memory lock still holds */ }
  console.error(`ai: openrouter_free LOCKED OFF: ${reason}`);
}

const openrouterFree = {
  name: 'openrouter_free',
  outside: true,
  isConfigured() { return enabledByEnv() && !!orKey(); },
  isEnabled() { return this.isConfigured() && !lockedReason() && orModels().some((m) => !isResting(m)); },
  status() { return { configured: this.isConfigured(), available: this.isEnabled(), reason: !enabledByEnv() ? 'AI_FREE_FALLBACKS=0' : !orKey() ? 'no OpenRouter key' : null, models: orModels(), price_check: prices.error || (prices.at ? 'ok' : 'not yet') }; },
  modelFor() { return orModels().find((m) => !isResting(m)) || orModels()[0] || null; },
  costCents() { return 0; },
  describeError(err) { return err && err.message ? err.message : String(err); },

  async structured({ system, user, schema, schemaName = 'submit', maxTokens = 2048, models = null, timeoutMs = null, signal = null }) {
    if (!this.isConfigured()) return null;
    const list = (models ? [].concat(models).map((m) => (typeof m === 'string' ? m : m.model)) : orModels()).filter((m) => !isResting(m));
    let lastErr = null;
    for (const model of list) {
      // eslint-disable-next-line no-await-in-loop
      if (!(await verifiedFree(model))) {
        lastErr = Object.assign(new Error(`openrouter_free: ${model} is not listed at $0; refused`), { status: 402 });
        console.warn(`ai: ${lastErr.message}`);
        restModel(model, 6 * 60 * 60 * 1000);
        continue;
      }
      const messages = [
        { role: 'system', content: `${system || ''}\n\nReply with one JSON object only (no prose, no code fence) matching this JSON schema (${schemaName}):\n${JSON.stringify(schema)}`.trim() },
        { role: 'user', content: String(user || '') },
      ];
      try {
        // eslint-disable-next-line no-await-in-loop
        const rf = (prices.params.get(model) || []).includes('response_format') ? { response_format: { type: 'json_object' } } : {};
        // eslint-disable-next-line no-await-in-loop
        const payload = await orPost(orBody(model, messages, maxTokens, rf), timeoutMs || Number(process.env.OPENROUTER_FREE_TIMEOUT_MS) || 120000, signal);
        const msg = payload.choices && payload.choices[0] && payload.choices[0].message;
        const parsed = sj.parseStructured(msg, schemaName);
        const checked = parsed.data !== undefined ? sj.validate(schema, parsed.data) : null;
        if (checked && !checked.errors.length) return { data: checked.value, usage: orUsage(payload, model), model, tier: 'free_api' };
        lastErr = Object.assign(new Error(`openrouter_free: ${model} gave an unusable ${schemaName}`), { status: 422, unusable: true });
      } catch (err) {
        lastErr = err;
        if (err.aborted) throw err;
        // A free model's 429 is usually its daily allowance: rest it for a while.
        if (err.status === 429) restModel(model, 10 * 60 * 1000);
        else if (err.status === 402) restModel(model, 6 * 60 * 60 * 1000);
        else if (err.status === 404) restModel(model, 60 * 60 * 1000);
      }
    }
    throw lastErr || new Error('openrouter_free: no free model answered');
  },

  async chat({ system, messages, maxTokens = 1024, timeoutMs = null, models = null, signal = null }) {
    if (!this.isConfigured()) return null;
    let lastErr = null;
    const list = models ? [].concat(models).map((m) => (typeof m === 'string' ? m : m.model)).filter((m) => /:free$/.test(m)) : orModels();
    for (const model of list.filter((m) => !isResting(m))) {
      // eslint-disable-next-line no-await-in-loop
      if (!(await verifiedFree(model))) { restModel(model, 6 * 60 * 60 * 1000); continue; }
      try {
        // eslint-disable-next-line no-await-in-loop
        const payload = await orPost(orBody(model, [...(system ? [{ role: 'system', content: system }] : []), ...(messages || []).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '') }))], maxTokens), timeoutMs || 120000, signal);
        const text = sj.stripThinking(payload.choices && payload.choices[0] && payload.choices[0].message && payload.choices[0].message.content);
        if (text) return { text, usage: orUsage(payload, model), model, tier: 'free_api' };
      } catch (err) {
        lastErr = err;
        if (err.aborted) throw err;
        if (err.status === 429) restModel(model, 10 * 60 * 1000);
      }
    }
    throw lastErr || new Error('openrouter_free: no free model answered');
  },
  /** The free models services/pool.js runs as separate slots, best first (chat and structured). */
  poolModels() { return orModels().filter((m) => !isResting(m)); },
};

/** OpenRouter's own record of what the key has spent (to prove a run cost $0). */
async function openrouterUsage() {
  if (!orKey()) return null;
  const res = await fetchImpl(`${OR_BASE()}/credits`, { headers: { Authorization: `Bearer ${orKey()}` } });
  if (!res.ok) return null;
  const data = await res.json();
  return data && data.data ? { total_credits: data.data.total_credits, total_usage: data.data.total_usage } : null;
}

// ── Gemini, free tier only ──────────────────────────────────────────────────
function readEvidence() {
  try { return JSON.parse(fs.readFileSync(EVIDENCE_FILE(), 'utf8')); } catch { return {}; }
}
function geminiConfirmedFree() {
  if (String(process.env.GEMINI_FREE_TIER_CONFIRMED || '') === '1') return true;
  const e = readEvidence();
  return !!(e.gemini && e.gemini.free_tier === true);
}
/** A 429 whose quota metric names the free tier proves the key is on it. */
function noteGeminiError(err) {
  const text = JSON.stringify((err && err.body) || '') + String(err && err.message);
  if (/free[_-]?tier/i.test(text)) {
    const e = readEvidence();
    if (!(e.gemini && e.gemini.free_tier)) {
      e.gemini = { free_tier: true, at: new Date().toISOString(), evidence: (text.match(/[a-z_]*free[_-]?tier[a-z_]*/i) || [''])[0] };
      try { fs.mkdirSync(path.dirname(EVIDENCE_FILE()), { recursive: true }); fs.writeFileSync(EVIDENCE_FILE(), JSON.stringify(e, null, 1)); } catch { /* evidence is best effort */ }
    }
  }
}

function gemini() { return require('./gemini'); } // eslint-disable-line global-require

const geminiFree = {
  name: 'gemini_free',
  outside: true,
  isConfigured() { return enabledByEnv() && !!String(process.env.GEMINI_API_KEY || '').trim(); },
  isEnabled() { return this.isConfigured() && geminiConfirmedFree(); },
  status() {
    return { configured: this.isConfigured(), available: this.isEnabled(), reason: !this.isConfigured() ? 'no Gemini key' : geminiConfirmedFree() ? null : 'free tier not confirmed (set GEMINI_FREE_TIER_CONFIRMED=1 after checking AI Studio)' };
  },
  modelFor(role) { return gemini().modelFor(role === 'deep' ? 'deep' : 'fast'); },
  costCents() { return 0; },
  describeError(err) { return err && err.message ? err.message : String(err); },
  async structured(args) {
    if (!this.isEnabled()) return null;
    try {
      const r = await gemini().structured({ ...args, role: 'fast' });
      return r ? { ...r, tier: 'free_api' } : r;
    } catch (err) { noteGeminiError(err); throw err; }
  },
  async chat(args) {
    if (!this.isEnabled()) return null;
    try {
      const r = await gemini().chat({ ...args, role: 'fast' });
      return r ? { ...r, tier: 'free_api' } : r;
    } catch (err) { noteGeminiError(err); throw err; }
  },
};

function _reset() { resting.clear(); locked = null; prices = { at: 0, map: new Map(), params: new Map(), error: null }; }

module.exports = { openrouterFree, geminiFree, openrouterUsage, refreshPrices, isZeroPriced, verifiedFree, DEFAULT_OR_MODELS, _setFetch, _reset };
