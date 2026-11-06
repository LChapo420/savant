/**
 * Factory for OpenAI-compatible "credit" providers (the Gonka broker, Grokified): an owner's prepaid credit behind an
 * OpenAI-style /chat/completions endpoint, spent only through a hard-capped ledger (services/credit-ledger.js).
 * Derived from services/providers/munito.js (same interface: structured, chat, isEnabled, status, costCents).
 *
 *   makeProvider({ name, label, ledger, keyEnv, baseEnv, defaultBase, defaultModel, modelEnv, prefix })
 *     prefix  env prefix, e.g. GONKA -> GONKA_PIPELINE, GONKA_LEARNER, GONKA_LEARNER_UNTIL, GONKA_TIMEOUT_MS.
 *
 * cfg.pipelineOnly: never learner data (stealth models log prompts); cfg.free: $0 model behind a request counter (services/crouton-ledger.js).
 * Data (owner, 2026-11-04): fine for learner data until <PREFIX>_LEARNER_UNTIL (default 2026-11-14T06:00:00Z, the day before the
 * beta), with the usual outside-AI consent rule (services/ai.js munitoAllowedFor sets req.munito; pool.js checks it). After that
 * date, or with <PREFIX>_LEARNER=off, the provider is pipeline-only: a process opts in with <PREFIX>_PIPELINE=1 (or MUNITO_PIPELINE=1,
 * which every pipeline script already sets). Keys are never logged or put in an error or URL.
 */
const sj = require('./structured-json');

const DEFAULT_UNTIL = '2026-11-14T06:00:00Z';

function baseUrl(env, dflt) {
  const raw = String(env || '').trim();
  if (!/^https?:\/\//.test(raw)) return dflt;
  const url = raw.replace(/[?#].*$/, '').replace(/\/+$/, '').replace(/\/chat\/completions$/, '').replace(/\/+$/, '');
  return /^https?:\/\/[^/]+$/.test(url) ? `${url}/v1` : url;
}

function makeProvider(cfg) {
  const P = cfg.prefix;
  const ledger = cfg.ledger;
  const KEY = () => String(process.env[cfg.keyEnv] || '').trim();
  const BASE = () => baseUrl(process.env[cfg.baseEnv], cfg.defaultBase);
  const MODEL = () => String(process.env[cfg.modelEnv] || cfg.defaultModel).trim();
  const modelOf = (m) => (typeof m === 'string' && m.trim() ? m.trim() : MODEL());
  const pipelineOptIn = () => process.env[`${P}_PIPELINE`] === '1' || process.env.MUNITO_PIPELINE === '1';
  const learnerOn = (now = Date.now()) => !cfg.pipelineOnly && String(process.env[`${P}_LEARNER`] || 'on').toLowerCase() !== 'off'
    && now < Date.parse(process.env[`${P}_LEARNER_UNTIL`] || DEFAULT_UNTIL);
  const noJson = new Set(); // models that refused response_format

  let fetchImpl = (...args) => fetch(...args);
  const _setFetch = (fn) => { fetchImpl = fn || ((...args) => fetch(...args)); };

  async function postRaw(body, timeoutMs, { signal = null, task = null } = {}) {
    if (!KEY()) throw Object.assign(new Error(`${cfg.name}: no key`), { status: 403 });
    if (!pipelineOptIn() && !learnerOn()) throw Object.assign(new Error(`${cfg.name}: pipeline use only (${P}_PIPELINE=1 not set)`), { status: 403 });
    const inputChars = (body.messages || []).reduce((n, m) => n + String(m.content || '').length, 0);
    const estimate = ledger.estimate({ model: body.model, inputChars, maxTokens: body.max_tokens });
    const id = ledger.reserve({ usd: estimate, task, model: body.model }); // throws LEDGER_STOP (402) past the cap: nothing is sent
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
        settleOnce({ outcome: 'not_billed' });
        throw Object.assign(new Error(`${cfg.name} ${res.status}: ${String(typeof msg === 'string' ? msg : JSON.stringify(msg)).slice(0, 200)}`), { status: res.ok ? 502 : res.status });
      }
      const u = payload.usage || {};
      const usage = { input_tokens: u.prompt_tokens || 0, output_tokens: u.completion_tokens || 0 };
      settleOnce({ usd: ledger.costOf(body.model, usage), outcome: 'ok', usage });
      return { payload, usage };
    } catch (err) {
      settleOnce({ outcome: 'unknown' }); // the request may have run: counted at the reservation
      if (err.name === 'AbortError') {
        const aborted = !!(signal && signal.aborted);
        throw Object.assign(new Error(aborted ? `${cfg.name}: aborted` : `${cfg.name}: timed out after ${Math.round(timeoutMs / 1000)}s`), { status: 0, timeout: !aborted, aborted });
      }
      if (err.status === undefined) err.status = 0;
      throw err;
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
    }
  }

  // Some models (ZeroGPU gpt-6-luna, 5 Nov 2026) answer 400 "temperature does not support 0": send them the default instead, remembered per model.
  const noTemp = new Set();
  async function post(body, timeoutMs, opts) {
    if (noTemp.has(body.model) && 'temperature' in body) { body = { ...body }; delete body.temperature; }
    try { return await postRaw(body, timeoutMs, opts); } catch (err) {
      if (err.status === 400 && 'temperature' in body && /temperature/i.test(err.message)) {
        noTemp.add(body.model);
        const b2 = { ...body }; delete b2.temperature;
        return postRaw(b2, timeoutMs, opts);
      }
      throw err;
    }
  }
  const reasoning = (effort) => (cfg.reasoningParam && (effort === 'high' || effort === 'max' || effort === 'medium') ? { reasoning_effort: effort === 'max' ? 'high' : effort } : {});
  const timeoutOf = (t) => t || Number(process.env[`${P}_TIMEOUT_MS`]) || 180000;

  const provider = {
    name: cfg.name,
    outside: true,
    learnerData: !cfg.pipelineOnly, // inside the learner window and the consent rule only (pool.js)
    paid: !cfg.free,
    isConfigured() { return !!KEY(); },
    isEnabled() { return this.isConfigured() && (pipelineOptIn() || learnerOn()) && ledger.canSpend(0.002); },
    status() {
      const l = ledger.status();
      const reason = !this.isConfigured() ? `no ${cfg.label} key` : !(pipelineOptIn() || learnerOn()) ? `pipeline only (${P}_PIPELINE=1 not set)` : !l.ok ? l.reason : l.headroom_usd < 0.002 ? `ledger at the $${l.cap_usd} cap` : null;
      return { configured: this.isConfigured(), available: this.isEnabled(), reason, pipeline: pipelineOptIn(), learner: learnerOn(), ledger: l };
    },
    costCents(model, usage) { return 100 * ledger.costOf(model || MODEL(), usage); },
    modelFor() { return MODEL(); },
    describeError(err) { return err && err.message ? err.message : String(err); },
    structured(args) { return sj.withLengthRetry((a) => this.structuredOnce(a), args); },

    async structuredOnce({ task = null, system, user, schema, schemaName = 'submit', maxTokens = 2048, effort = null, timeoutMs = null, signal = null, model: wanted = null }) {
      const model = modelOf(wanted);
      const messages = [
        { role: 'system', content: `${system || ''}\n\nReply with one JSON object only (no prose, no code fence) matching this JSON schema (${schemaName}):\n${JSON.stringify(schema)}`.trim() },
        { role: 'user', content: String(user || '') },
      ];
      const body = (json) => ({ model, messages, max_tokens: sj.outputBudget(maxTokens, effort), temperature: 0, ...(json ? { response_format: { type: 'json_object' } } : {}), ...reasoning(effort) });
      let r;
      try {
        r = await post(body(!noJson.has(model)), timeoutOf(timeoutMs), { signal, task });
      } catch (err) {
        if (!noJson.has(model) && (err.status === 400 || err.status === 422) && /response_format|json_object|json mode/i.test(err.message)) {
          noJson.add(model);
          r = await post(body(false), timeoutOf(timeoutMs), { signal, task });
        } else throw err;
      }
      const { payload, usage } = r;
      const msg = payload.choices && payload.choices[0] && payload.choices[0].message;
      const parsed = sj.parseStructured(msg, schemaName);
      const checked = parsed.data !== undefined ? sj.validate(schema, parsed.data) : null;
      if (checked && !checked.errors.length) return { data: checked.value, usage: { ...usage, cost_usd: ledger.costOf(model, usage) }, model, tier: cfg.name };
      if (payload.choices && payload.choices[0] && payload.choices[0].finish_reason === 'length') throw sj.truncatedError(`${cfg.name}: ${model} was cut off by the output cap (${schemaName})`, { usage });
      throw Object.assign(new Error(`${cfg.name}: ${model} gave an unusable ${schemaName}`), { status: 422, unusable: true, usage });
    },

    async chat({ task = null, system, messages, maxTokens = 1024, effort = null, timeoutMs = null, signal = null, temperature = 0, model: wanted = null }) {
      const model = modelOf(wanted);
      const { payload, usage } = await post(
        { model, messages: [...(system ? [{ role: 'system', content: String(system) }] : []), ...(messages || []).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '') }))], max_tokens: Number(maxTokens) || 1024, temperature: Math.min(1, Math.max(0, Number(temperature) || 0)), ...reasoning(effort) },
        timeoutOf(timeoutMs), { signal, task },
      );
      const text = sj.stripThinking(payload.choices && payload.choices[0] && payload.choices[0].message && payload.choices[0].message.content);
      if (!text) throw Object.assign(new Error(`${cfg.name}: ${model} returned no text`), { status: 422, unusable: true, usage });
      return { text, usage: { ...usage, cost_usd: ledger.costOf(model, usage) }, model, tier: cfg.name };
    },
  };
  return { provider, _setFetch, post, baseUrl: (env) => baseUrl(env, cfg.defaultBase), learnerOn };
}

module.exports = { makeProvider, DEFAULT_UNTIL };
