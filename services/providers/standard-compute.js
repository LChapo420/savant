/**
 * Standard Compute (https://api.stdcmpt.com/v1), an OpenAI-compatible gateway, for the
 * BUILD PIPELINE only: one cheap PAID model, used by services/pool.js only when it makes
 * a big job finish meaningfully sooner than the free providers alone.
 *
 *   model   deepseek/deepseek-v4.1-flash-1017 (override: STANDARD_COMPUTE_MODEL)
 *   key     STANDARD_COMPUTE_API_KEY (the night runner's env loader / the owner's .env);
 *           never logged, never put in an error message or a URL.
 *   spend   every call reserves its worst case in services/standard-compute-ledger.js
 *           (data/standard-compute-ledger.json, $15 TOTAL across everything, $0.50 already
 *           spent) and is refused past the cap. The ledger's prices are an assumed upper
 *           bound (the API reports no cost).
 *
 * Why pipeline only: prompts go to a third-party gateway whose retention and training
 * terms for children's data are unknown. No learner's words (answers, profile, survey,
 * interests, name) are ever sent. A process must opt in with STANDARD_COMPUTE_PIPELINE=1
 * (scripts set it; the app server never does), and services/providers/index.js does not
 * list this provider in any chain.
 *
 * Env: STANDARD_COMPUTE_API_KEY, STANDARD_COMPUTE_BASE_URL (only if it is an http(s) URL;
 * the default is https://api.stdcmpt.com/v1), STANDARD_COMPUTE_MODEL,
 * STANDARD_COMPUTE_PIPELINE=1, STANDARD_COMPUTE_TIMEOUT_MS, STANDARD_COMPUTE_CAP_USD
 * (can only lower the cap), STANDARD_COMPUTE_PRICE_IN / _OUT (per Mtok, ledger pricing).
 */
const sj = require('./structured-json');
const ledger = require('../standard-compute-ledger');

const KEY = () => String(process.env.STANDARD_COMPUTE_API_KEY || '').trim();
const BASE = () => {
  const env = String(process.env.STANDARD_COMPUTE_BASE_URL || '').trim();
  return (/^https?:\/\//.test(env) ? env : 'https://api.stdcmpt.com/v1').replace(/\/chat\/completions\/?$/, '').replace(/\/$/, '');
};
const MODEL = () => String(process.env.STANDARD_COMPUTE_MODEL || 'deepseek/deepseek-v4.1-flash-1017').trim();
const pipelineOptIn = () => process.env.STANDARD_COMPUTE_PIPELINE === '1';

let fetchImpl = (...args) => fetch(...args);
function _setFetch(fn) { fetchImpl = fn || ((...args) => fetch(...args)); }

/** One request inside the ledger: reserve, send, settle. `signal` aborts the request. */
async function post(body, timeoutMs, { signal = null, task = null } = {}) {
  if (!pipelineOptIn()) throw Object.assign(new Error('standard_compute: pipeline use only (STANDARD_COMPUTE_PIPELINE=1 not set)'), { status: 403 });
  if (!KEY()) throw Object.assign(new Error('standard_compute: no key'), { status: 403 });
  const inputChars = (body.messages || []).reduce((n, m) => n + String(m.content || '').length, 0);
  // Throws LEDGER_STOP (402) past the cap: nothing is sent.
  const id = ledger.reserve({ usd: ledger.estimate({ model: body.model, inputChars, maxTokens: body.max_tokens }), task, model: body.model });
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
      throw Object.assign(new Error(`standard_compute ${res.status}: ${String(typeof msg === 'string' ? msg : JSON.stringify(msg)).slice(0, 200)}`), { status: res.ok ? 502 : res.status });
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
      throw Object.assign(new Error(aborted ? 'standard_compute: aborted' : `standard_compute: timed out after ${Math.round(timeoutMs / 1000)}s`), { status: 0, timeout: !aborted, aborted });
    }
    if (err.status === undefined) err.status = 0;
    throw err;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

const reasoning = (effort) => (effort === 'high' || effort === 'max' || effort === 'medium' ? { reasoning_effort: effort === 'max' ? 'high' : effort } : {});

const standardCompute = {
  name: 'standard_compute',
  outside: true,
  learnerData: false,
  paid: true,
  isConfigured() { return !!KEY(); },
  isEnabled() { return this.isConfigured() && pipelineOptIn() && ledger.canSpend(0.002); },
  status() {
    const l = ledger.status();
    const reason = !this.isConfigured() ? 'no Standard Compute key' : !pipelineOptIn() ? 'pipeline only (STANDARD_COMPUTE_PIPELINE=1 not set)' : !l.ok ? l.reason : l.headroom_usd < 0.002 ? `ledger at the $${l.cap_usd} cap` : null;
    return { configured: this.isConfigured(), available: this.isEnabled(), reason, pipeline: pipelineOptIn(), ledger: l };
  },
  costCents(model, usage) { return 100 * ledger.costOf(model || MODEL(), usage); },
  modelFor() { return MODEL(); },
  describeError(err) { return err && err.message ? err.message : String(err); },

  async structured({ task = null, system, user, schema, schemaName = 'submit', maxTokens = 2048, effort = null, timeoutMs = null, signal = null }) {
    const model = MODEL();
    const messages = [
      { role: 'system', content: `${system || ''}\n\nReply with one JSON object only (no prose, no code fence) matching this JSON schema (${schemaName}):\n${JSON.stringify(schema)}`.trim() },
      { role: 'user', content: String(user || '') },
    ];
    const { payload, usage } = await post(
      { model, messages, max_tokens: Math.max(512, Number(maxTokens) || 1024) + 1024, temperature: 0, response_format: { type: 'json_object' }, ...reasoning(effort) },
      timeoutMs || Number(process.env.STANDARD_COMPUTE_TIMEOUT_MS) || 180000, { signal, task },
    );
    const msg = payload.choices && payload.choices[0] && payload.choices[0].message;
    const parsed = sj.parseStructured(msg, schemaName);
    const checked = parsed.data !== undefined ? sj.validate(schema, parsed.data) : null;
    if (checked && !checked.errors.length) {
      return { data: checked.value, usage: { ...usage, cost_usd: ledger.costOf(model, usage) }, model, tier: 'standard_compute' };
    }
    throw Object.assign(new Error(`standard_compute: ${model} gave an unusable ${schemaName}`), { status: 422, unusable: true, usage });
  },

  async chat({ task = null, system, messages, maxTokens = 1024, effort = null, timeoutMs = null, signal = null }) {
    const model = MODEL();
    const { payload, usage } = await post(
      { model, messages: [...(system ? [{ role: 'system', content: String(system) }] : []), ...(messages || []).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '') }))], max_tokens: Number(maxTokens) || 1024, temperature: 0, ...reasoning(effort) },
      timeoutMs || Number(process.env.STANDARD_COMPUTE_TIMEOUT_MS) || 180000, { signal, task },
    );
    const text = sj.stripThinking(payload.choices && payload.choices[0] && payload.choices[0].message && payload.choices[0].message.content);
    if (!text) throw Object.assign(new Error(`standard_compute: ${model} returned no text`), { status: 422, unusable: true, usage });
    return { text, usage: { ...usage, cost_usd: ledger.costOf(model, usage) }, model, tier: 'standard_compute' };
  },
};

module.exports = { standardCompute, _setFetch, post };
