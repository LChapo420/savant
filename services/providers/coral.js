/**
 * Coral (OpenAI-compatible chat completions), owner's $100 API credit (2026-11-04), in exchange for an evaluation report
 * (docs/CORAL-EVALUATION.md).
 *
 *   models  deepseek-v4.1-flash (Standard, default; override: CORAL_MODEL) and deepseek-v4.1-flash-fast (about 322 tokens/s,
 *           dearer). A call names its model with `model`; the pool passes the slot's.
 *   key     CORAL_API_KEY (the owner's .env); never logged, never put in an error message or a URL.
 *   spend   every call reserves its worst case in services/coral-ledger.js (data/coral-ledger.json, $100 TOTAL) and is
 *           refused past the cap. Cost is computed from the usage the API reports at the promotional price.
 *
 * Pipeline: a process opts in with CORAL_PIPELINE=1 (scripts set it). Learner use is ON (owner approved Coral's data policy, 2026-11-04);
 * CORAL_LEARNER=off turns it off. Learners only when cleared the way Munito's are (services/ai.js munitoAllowedFor: outside-AI consent;
 * under-13 until MUNITO_CHILD_UNTIL). services/providers/index.js lists this provider in no chain.
 *
 * Env: CORAL_API_KEY, CORAL_BASE_URL (http(s); with or without /v1 or /chat/completions), CORAL_MODEL, CORAL_PIPELINE=1,
 * CORAL_LEARNER=off, CORAL_TIMEOUT_MS, CORAL_CAP_USD (can only lower the cap), CORAL_LEDGER_FILE.
 */
const sj = require('./structured-json');
const ledger = require('../coral-ledger');

const KEY = () => String(process.env.CORAL_API_KEY || '').trim();
/**
 * The chat base from CORAL_BASE_URL (http(s)), with or without the path: "https://host", "https://host/v1", ".../v1/",
 * ".../v1/chat/completions". A bare host gets /v1. Unset or not http(s): no base (the provider is not configured).
 */
function baseUrl(env) {
  const raw = String(env || '').trim();
  if (!/^https?:\/\//.test(raw)) return '';
  const url = raw.replace(/[?#].*$/, '').replace(/\/+$/, '').replace(/\/chat\/completions$/, '').replace(/\/+$/, '');
  return /^https?:\/\/[^/]+$/.test(url) ? `${url}/v1` : url;
}
const BASE = () => baseUrl(process.env.CORAL_BASE_URL);
const MODEL = () => String(process.env.CORAL_MODEL || 'deepseek-v4.1-flash').trim();
const modelOf = (m) => (typeof m === 'string' && m.trim() ? m.trim() : MODEL());
const pipelineOptIn = () => process.env.CORAL_PIPELINE === '1';
// Learner use (owner approved Coral's data policy, 2026-11-04): on unless CORAL_LEARNER=off. The pool still keeps no-consent and
// (after MUNITO_CHILD_UNTIL) under-13 accounts off it (req.coral, services/ai.js munitoAllowedFor).
const learnerOn = () => String(process.env.CORAL_LEARNER || 'on').toLowerCase() !== 'off';

let fetchImpl = (...args) => fetch(...args);
function _setFetch(fn) { fetchImpl = fn || ((...args) => fetch(...args)); }

/** One request inside the ledger: reserve, send, settle. `signal` aborts the request. */
async function post(body, timeoutMs, { signal = null, task = null } = {}) {
  if (!KEY() || !BASE()) throw Object.assign(new Error('coral: no key'), { status: 403 });
  const inputChars = (body.messages || []).reduce((n, m) => n + String(m.content || '').length, 0);
  const estimate = ledger.estimate({ model: body.model, inputChars, maxTokens: body.max_tokens });
  if (!pipelineOptIn() && !learnerOn()) throw Object.assign(new Error('coral: pipeline use only (CORAL_PIPELINE=1 not set)'), { status: 403 });
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
      throw Object.assign(new Error(`coral ${res.status}: ${String(typeof msg === 'string' ? msg : JSON.stringify(msg)).slice(0, 200)}`), { status: res.ok ? 502 : res.status });
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
      throw Object.assign(new Error(aborted ? 'coral: aborted' : `coral: timed out after ${Math.round(timeoutMs / 1000)}s`), { status: 0, timeout: !aborted, aborted });
    }
    if (err.status === undefined) err.status = 0;
    throw err;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

const reasoning = (effort) => (effort === 'high' || effort === 'max' || effort === 'medium' ? { reasoning_effort: effort === 'max' ? 'high' : effort } : {});

const coralProvider = {
  name: 'coral',
  outside: true,
  learnerData: false,
  paid: true,
  isConfigured() { return !!KEY() && !!BASE(); },
  isEnabled() { return this.isConfigured() && (pipelineOptIn() || learnerOn()) && ledger.canSpend(0.002); },
  status() {
    const l = ledger.status();
    const reason = !this.isConfigured() ? 'no Coral key or base URL' : !pipelineOptIn() && !learnerOn() ? 'pipeline only (CORAL_PIPELINE=1 not set)' : !l.ok ? l.reason : l.headroom_usd < 0.002 ? `ledger at the $${l.cap_usd} cap` : null;
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
      timeoutMs || Number(process.env.CORAL_TIMEOUT_MS) || 180000, { signal, task },
    );
    const msg = payload.choices && payload.choices[0] && payload.choices[0].message;
    const parsed = sj.parseStructured(msg, schemaName);
    const checked = parsed.data !== undefined ? sj.validate(schema, parsed.data) : null;
    if (checked && !checked.errors.length) {
      return { data: checked.value, usage: { ...usage, cost_usd: ledger.costOf(model, usage) }, model, tier: 'coral' };
    }
    if (payload.choices && payload.choices[0] && payload.choices[0].finish_reason === 'length') throw sj.truncatedError(`coral: ${model} was cut off by the output cap (${schemaName})`, { usage });
    throw Object.assign(new Error(`coral: ${model} gave an unusable ${schemaName}${checked && checked.errors.length ? ` (${checked.errors.slice(0, 2).join('; ').slice(0, 160)})` : parsed.data === undefined ? ' (no JSON found)' : ''}`), { status: 422, unusable: true, usage });
  },

  /** One chat call (pipeline only). `model` names a Coral model (default CORAL_MODEL). */
  async chat({ task = null, system, messages, maxTokens = 1024, effort = null, timeoutMs = null, signal = null, temperature = 0, model: wanted = null }) {
    const model = modelOf(wanted);
    const { payload, usage } = await post(
      { model, messages: [...(system ? [{ role: 'system', content: String(system) }] : []), ...(messages || []).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '') }))], max_tokens: Number(maxTokens) || 1024, temperature: Math.min(1, Math.max(0, Number(temperature) || 0)), ...reasoning(effort) },
      timeoutMs || Number(process.env.CORAL_TIMEOUT_MS) || 180000, { signal, task },
    );
    const text = sj.stripThinking(payload.choices && payload.choices[0] && payload.choices[0].message && payload.choices[0].message.content);
    if (!text) throw Object.assign(new Error(`coral: ${model} returned no text`), { status: 422, unusable: true, usage });
    return { text, usage: { ...usage, cost_usd: ledger.costOf(model, usage) }, model, tier: 'coral' };
  },
};

module.exports = { coral: coralProvider, coralProvider, _setFetch, post, baseUrl, learnerOn };
