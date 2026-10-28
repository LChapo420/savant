/**
 * UnoRouter (https://unorouter.com), an OpenAI-compatible gateway whose `:free`
 * models cost $0 per token, for the BUILD PIPELINE only: extra independent judges and
 * a fallback when NVIDIA and xKiro are rate-limited. It is never on a learner's path.
 *
 * Why pipeline only (read 2026-10-23):
 *   - Terms §6(5): "Some models are provided through providers that also use inputs
 *     for their own purposes, in particular to train AI models."
 *   - Privacy: prompts are retained by each provider under its own policy, and may be
 *     processed in "China, Hong Kong, Singapore, Thailand and the United Arab Emirates".
 *   - The service is for ages 13+.
 *   So no learner's words go here. A process must opt in with UNOROUTER_PIPELINE=1
 *   (scripts set it; the app server never does), and services/providers/index.js does
 *   not list it.
 *
 * Why it cannot spend: the gateway lists no prices, and paid models (Gemini Pro and
 * others, billed from a prepaid balance) sit beside the free ones. Only ids ending in
 * `:free` that appear in the key's own GET /models are ever sent. The account holds
 * no prepaid balance, so a paid call could not be served in any case.
 *
 * Limits: about 1 request a minute per free model per user (429 with Retry-After).
 * Calls to one model are spaced UNOROUTER_GAP_MS apart (default 62 s), and a 429 is
 * retried after its Retry-After. Uptime varies by model, so nothing depends on it.
 *
 * One account only. Every call is recorded in data/unorouter-usage.json.
 *
 * Env: UNOROUTER_API_KEY, UNOROUTER_BASE_URL, UNOROUTER_PIPELINE=1, UNOROUTER_GAP_MS,
 * UNOROUTER_USAGE_FILE, UNOROUTER_TIMEOUT_MS, UNOROUTER_RETRIES.
 */
const fs = require('fs');
const path = require('path');
const sj = require('./structured-json');

const KEY = () => String(process.env.UNOROUTER_API_KEY || '').trim();
// The owner's .env names the full chat endpoint; the gateway's base is the /v1 above it.
const BASE = () => String(process.env.UNOROUTER_BASE_URL || 'https://api.unorouter.com/v1')
  .replace(/\/chat\/completions\/?$/, '').replace(/\/$/, '');
const USAGE_FILE = () => process.env.UNOROUTER_USAGE_FILE || path.join(__dirname, '..', '..', 'data', 'unorouter-usage.json');
const GAP_MS = () => Number(process.env.UNOROUTER_GAP_MS || 62000);
const pipelineOptIn = () => process.env.UNOROUTER_PIPELINE === '1';

let fetchImpl = (...args) => fetch(...args);
function _setFetch(fn) { fetchImpl = fn || ((...args) => fetch(...args)); }
let sleepImpl = (ms) => new Promise((r) => setTimeout(r, ms));
function _setSleep(fn) { sleepImpl = fn || ((ms) => new Promise((r) => setTimeout(r, ms))); }

// ── the $0 check: a `:free` id the key's own model list shows ────────────────
let catalog = { at: 0, ids: new Set(), error: null };
const CATALOG_TTL = 6 * 60 * 60 * 1000;
async function refreshCatalog() {
  try {
    const res = await fetchImpl(`${BASE()}/models`, { headers: { Authorization: `Bearer ${KEY()}` } });
    if (!res.ok) throw new Error(`unorouter models ${res.status}`);
    const data = await res.json();
    catalog = { at: Date.now(), ids: new Set(((data && data.data) || []).map((m) => m.id)), error: null };
  } catch (err) {
    catalog = { ...catalog, error: err.message };
  }
  return catalog;
}
async function verifiedFree(model) {
  if (!/:free$/.test(String(model || ''))) return false;
  if (Date.now() - catalog.at > CATALOG_TTL || !catalog.ids.size) await refreshCatalog();
  return catalog.ids.has(model);
}

// ── usage record ─────────────────────────────────────────────────────────────
const today = () => new Date().toISOString().slice(0, 10);
function readUsage() { try { return JSON.parse(fs.readFileSync(USAGE_FILE(), 'utf8')); } catch { return {}; } }
function record(model, counts) {
  try {
    const all = readUsage();
    const row = ((all[today()] = all[today()] || {})[model] = all[today()][model] || {});
    for (const [k, v] of Object.entries(counts)) row[k] = (row[k] || 0) + (Number(v) || 0);
    fs.mkdirSync(path.dirname(USAGE_FILE()), { recursive: true });
    fs.writeFileSync(USAGE_FILE(), `${JSON.stringify(all, null, 1)}\n`);
  } catch (err) {
    console.warn(`ai: could not write the UnoRouter usage record: ${err.message}`);
  }
}

// ── pacing: one call per model per GAP_MS, queued ────────────────────────────
const nextSlot = new Map(); // model -> earliest start (ms)
async function waitTurn(model) {
  const now = Date.now();
  const at = Math.max(now, nextSlot.get(model) || 0);
  nextSlot.set(model, at + GAP_MS());
  if (at > now) await sleepImpl(at - now);
}

async function postOnce(body, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
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
      const retryAfter = Number(res.headers && res.headers.get && res.headers.get('retry-after'));
      if (res.status === 429) record(body.model, { rate_limited: 1 });
      throw Object.assign(new Error(`unorouter ${res.status}: ${String(typeof msg === 'string' ? msg : JSON.stringify(msg)).slice(0, 200)}`),
        { status: res.ok ? 502 : res.status, retryAfterMs: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : null });
    }
    const u = payload.usage || {};
    record(body.model, { calls: 1, input: u.prompt_tokens || 0, output: u.completion_tokens || 0 });
    return payload;
  } catch (err) {
    if (err.name === 'AbortError') throw Object.assign(new Error(`unorouter: timed out after ${Math.round(timeoutMs / 1000)}s`), { status: 0, timeout: true });
    if (err.status === undefined) err.status = 0;
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** One request: refused locally unless pipeline and $0; paced; retried on 429. */
async function post(body, timeoutMs) {
  if (!pipelineOptIn()) throw Object.assign(new Error('unorouter: pipeline use only (UNOROUTER_PIPELINE=1 not set)'), { status: 403 });
  if (!(await verifiedFree(body.model))) throw Object.assign(new Error(`unorouter: ${body.model} is not a listed :free model; refused`), { status: 402 });
  const retries = Number(process.env.UNOROUTER_RETRIES || 3);
  for (let attempt = 0; ; attempt++) {
    // eslint-disable-next-line no-await-in-loop
    await waitTurn(body.model);
    try {
      // eslint-disable-next-line no-await-in-loop
      return await postOnce(body, timeoutMs);
    } catch (err) {
      if (err.status !== 429 || attempt >= retries) throw err;
      // eslint-disable-next-line no-await-in-loop
      await sleepImpl(err.retryAfterMs || GAP_MS());
    }
  }
}

const unorouter = {
  name: 'unorouter',
  outside: true,
  learnerData: false,
  isConfigured() { return !!KEY(); },
  isEnabled() { return this.isConfigured() && pipelineOptIn(); },
  status() {
    const reason = !this.isConfigured() ? 'no UnoRouter key' : !pipelineOptIn() ? 'pipeline only (UNOROUTER_PIPELINE=1 not set)' : null;
    return { configured: this.isConfigured(), available: this.isEnabled(), reason, catalog: catalog.error || (catalog.at ? `${catalog.ids.size} models` : 'not yet') };
  },
  costCents() { return 0; },
  modelFor() { return 'gemini-3.6-flash:free'; },
  describeError(err) { return err && err.message ? err.message : String(err); },

  async structured({ system, user, schema, schemaName = 'submit', maxTokens = 2048, models, timeoutMs = null }) {
    const list = [].concat(models || ['gemini-3.6-flash:free']).filter((m) => typeof m === 'string');
    let lastErr = null;
    for (const model of list) {
      const messages = [
        { role: 'system', content: `${system || ''}\n\nReply with one JSON object only (no prose, no code fence) matching this JSON schema (${schemaName}):\n${JSON.stringify(schema)}`.trim() },
        { role: 'user', content: String(user || '') },
      ];
      try {
        // eslint-disable-next-line no-await-in-loop
        const payload = await post({ model, messages, max_tokens: Math.max(512, Number(maxTokens) || 1024) + 2048, temperature: 0 }, timeoutMs || Number(process.env.UNOROUTER_TIMEOUT_MS) || 180000);
        const msg = payload.choices && payload.choices[0] && payload.choices[0].message;
        const parsed = sj.parseStructured(msg, schemaName);
        const checked = parsed.data !== undefined ? sj.validate(schema, parsed.data) : null;
        if (checked && !checked.errors.length) {
          const u = payload.usage || {};
          return { data: checked.value, usage: { input_tokens: u.prompt_tokens || 0, output_tokens: u.completion_tokens || 0, cost_usd: 0 }, model, tier: 'unorouter_free' };
        }
        lastErr = Object.assign(new Error(`unorouter: ${model} gave an unusable ${schemaName}`), { status: 422, unusable: true });
      } catch (err) {
        lastErr = err;
        if (err.status === 402 || err.status === 403) throw err;
      }
    }
    throw lastErr || new Error('unorouter: no model answered');
  },
};

function _reset() { catalog = { at: 0, ids: new Set(), error: null }; nextSlot.clear(); }

module.exports = { unorouter, verifiedFree, refreshCatalog, _setFetch, _setSleep, _reset };
