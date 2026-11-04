/**
 * Munito (https://api.munito.ai/inference/v1), an OpenAI-compatible gateway, for the BUILD PIPELINE only: owner's $100
 * free credit (2026-11-03). Modelled on services/providers/standard-compute.js (same interface).
 *
 *   models  deepseek-ai/deepseek-v4.1-flash-1017 (default; override: MUNITO_MODEL), zai-org/glm-5.3-flash, and the others
 *           in services/munito-ledger.js PRICES. A call names its model with `model`; the pool passes the slot's.
 *   key     MUNITO_API_KEY (the owner's .env); never logged, never put in an error message or a URL.
 *   spend   every call reserves its worst case in services/munito-ledger.js (data/munito-ledger.json, $100 TOTAL) and is
 *           refused past the cap. Cost is computed from the usage the API reports at the list price.
 *
 * Pipeline only: Munito's data policy is not confirmed, so no learner's words are ever sent. A process must opt in with
 * MUNITO_PIPELINE=1 (scripts set it; the app server never does), and services/providers/index.js does not list this
 * provider in any chain. There is no tutor exception.
 *
 * Not built: Munito's Document AI (OCR per page: lightonai/lightonocr-3-4b, munito/ocr-auto, munito/ocr-fast); its
 * endpoint is not documented in the brief.
 *
 * Env: MUNITO_API_KEY, MUNITO_BASE_URL (only if http(s); default https://api.munito.ai/inference/v1), MUNITO_MODEL,
 * MUNITO_PIPELINE=1, MUNITO_TIMEOUT_MS, MUNITO_CAP_USD (can only lower the cap), MUNITO_LEDGER_FILE.
 */
const sj = require('./structured-json');
const ledger = require('../munito-ledger');

const KEY = () => String(process.env.MUNITO_API_KEY || '').trim();
/**
 * The chat base, from MUNITO_BASE_URL when it is an http(s) URL. Handles the value with or without the path:
 * "https://host", "https://host/inference/v1", "https://host/inference/v1/", and the full ".../chat/completions".
 * A bare host (no path) gets /inference/v1. Unset: https://api.munito.ai/inference/v1.
 */
function baseUrl(env) {
  const raw = String(env || '').trim();
  if (!/^https?:\/\//.test(raw)) return 'https://api.munito.ai/inference/v1';
  const url = raw.replace(/[?#].*$/, '').replace(/\/+$/, '').replace(/\/chat\/completions$/, '').replace(/\/+$/, '');
  return /^https?:\/\/[^/]+$/.test(url) ? `${url}/inference/v1` : url;
}
const BASE = () => baseUrl(process.env.MUNITO_BASE_URL);
const MODEL = () => String(process.env.MUNITO_MODEL || 'deepseek-ai/deepseek-v4.1-flash-1017').trim();
const modelOf = (m) => (typeof m === 'string' && m.trim() ? m.trim() : MODEL());
const pipelineOptIn = () => process.env.MUNITO_PIPELINE === '1';

let fetchImpl = (...args) => fetch(...args);
function _setFetch(fn) { fetchImpl = fn || ((...args) => fetch(...args)); }

/** One request inside the ledger: reserve, send, settle. `signal` aborts the request. */
async function post(body, timeoutMs, { signal = null, task = null } = {}) {
  if (!KEY()) throw Object.assign(new Error('munito: no key'), { status: 403 });
  const inputChars = (body.messages || []).reduce((n, m) => n + String(m.content || '').length, 0);
  const estimate = ledger.estimate({ model: body.model, inputChars, maxTokens: body.max_tokens });
  if (!pipelineOptIn()) throw Object.assign(new Error('munito: pipeline use only (MUNITO_PIPELINE=1 not set)'), { status: 403 });
  // Throws LEDGER_STOP (402) past the cap: nothing is sent.
  const id = ledger.reserve({ usd: estimate, task, model: body.model });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onAbort = () => ctrl.abort();
  if (signal) { if (signal.aborted) ctrl.abort(); else signal.addEventListener('abort', onAbort, { once: true }); }
  let settled = false;
  const settleOnce = (args) => { if (!settled) { settled = true; ledger.settle(id, args); } };
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
      settleOnce({ outcome: 'not_billed' }); // the API answered with an error: not billed
      throw Object.assign(new Error(`munito ${res.status}: ${String(typeof msg === 'string' ? msg : JSON.stringify(msg)).slice(0, 200)}`), { status: res.ok ? 502 : res.status });
    }
    const u = payload.usage || {};
    const usage = { input_tokens: u.prompt_tokens || 0, output_tokens: u.completion_tokens || 0 };
    settleOnce({ usd: ledger.costOf(body.model, usage), outcome: 'ok', usage });
    return { payload, usage };
  } catch (err) {
    // Network failure, timeout or abort: the request may have run, so the reservation is counted.
    settleOnce({ outcome: 'unknown' });
    if (err.name === 'AbortError') {
      const aborted = !!(signal && signal.aborted);
      throw Object.assign(new Error(aborted ? 'munito: aborted' : `munito: timed out after ${Math.round(timeoutMs / 1000)}s`), { status: 0, timeout: !aborted, aborted });
    }
    if (err.status === undefined) err.status = 0;
    throw err;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

const reasoning = (effort) => (effort === 'high' || effort === 'max' || effort === 'medium' ? { reasoning_effort: effort === 'max' ? 'high' : effort } : {});

const munitoProvider = {
  name: 'munito',
  outside: true,
  learnerData: false,
  paid: true,
  isConfigured() { return !!KEY(); },
  isEnabled() { return this.isConfigured() && pipelineOptIn() && ledger.canSpend(0.002); },
  status() {
    const l = ledger.status();
    const reason = !this.isConfigured() ? 'no Munito key' : !pipelineOptIn() ? 'pipeline only (MUNITO_PIPELINE=1 not set)' : !l.ok ? l.reason : l.headroom_usd < 0.002 ? `ledger at the $${l.cap_usd} cap` : null;
    return { configured: this.isConfigured(), available: this.isEnabled(), reason, pipeline: pipelineOptIn(), ledger: l };
  },
  costCents(model, usage) { return 100 * ledger.costOf(model || MODEL(), usage); },
  modelFor() { return MODEL(); },
  describeError(err) { return err && err.message ? err.message : String(err); },

  /** One structured call; an answer cut off by the output cap is asked again with a larger one (structured-json.js withLengthRetry). */
  structured(args) { return sj.withLengthRetry((a) => this.structuredOnce(a), args); },

  async structuredOnce({ task = null, system, user, schema, schemaName = 'submit', maxTokens = 2048, effort = null, timeoutMs = null, signal = null, model: wanted = null }) {
    const model = modelOf(wanted);
    const messages = [
      { role: 'system', content: `${system || ''}\n\nReply with one JSON object only (no prose, no code fence) matching this JSON schema (${schemaName}):\n${JSON.stringify(schema)}`.trim() },
      { role: 'user', content: String(user || '') },
    ];
    const { payload, usage } = await post(
      { model, messages, max_tokens: sj.outputBudget(maxTokens, effort), temperature: 0, response_format: { type: 'json_object' }, ...reasoning(effort) },
      timeoutMs || Number(process.env.MUNITO_TIMEOUT_MS) || 180000, { signal, task },
    );
    const msg = payload.choices && payload.choices[0] && payload.choices[0].message;
    const parsed = sj.parseStructured(msg, schemaName);
    const checked = parsed.data !== undefined ? sj.validate(schema, parsed.data) : null;
    if (checked && !checked.errors.length) {
      return { data: checked.value, usage: { ...usage, cost_usd: ledger.costOf(model, usage) }, model, tier: 'munito' };
    }
    if (payload.choices && payload.choices[0] && payload.choices[0].finish_reason === 'length') throw sj.truncatedError(`munito: ${model} was cut off by the output cap (${schemaName})`, { usage });
    throw Object.assign(new Error(`munito: ${model} gave an unusable ${schemaName}`), { status: 422, unusable: true, usage });
  },

  /** One chat call (pipeline only). `model` names a Munito model (default MUNITO_MODEL). */
  async chat({ task = null, system, messages, maxTokens = 1024, effort = null, timeoutMs = null, signal = null, temperature = 0, model: wanted = null }) {
    const model = modelOf(wanted);
    const { payload, usage } = await post(
      { model, messages: [...(system ? [{ role: 'system', content: String(system) }] : []), ...(messages || []).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '') }))], max_tokens: Number(maxTokens) || 1024, temperature: Math.min(1, Math.max(0, Number(temperature) || 0)), ...reasoning(effort) },
      timeoutMs || Number(process.env.MUNITO_TIMEOUT_MS) || 180000, { signal, task },
    );
    const text = sj.stripThinking(payload.choices && payload.choices[0] && payload.choices[0].message && payload.choices[0].message.content);
    if (!text) throw Object.assign(new Error(`munito: ${model} returned no text`), { status: 422, unusable: true, usage });
    return { text, usage: { ...usage, cost_usd: ledger.costOf(model, usage) }, model, tier: 'munito' };
  },
};

module.exports = { munito: munitoProvider, munitoProvider, _setFetch, post, baseUrl };
