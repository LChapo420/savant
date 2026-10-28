/**
 * Modelflare strong placement judges (owner, 2026-10-25): Claude Haiku 5.5 (family "anthropic") and,
 * if its key is there, Luna 6 (family "openai").
 *
 * - Each has its own key in the owner's .env, re-read on every call, never printed:
 *     MODELFLARE_HAIKU_API_KEY / MODELFLARE_HAIKU_MODEL [/ MODELFLARE_HAIKU_BASE_URL]
 *     MODELFLARE_LUNA_API_KEY  / MODELFLARE_LUNA_MODEL  [/ MODELFLARE_LUNA_BASE_URL]
 *   (base otherwise MODELFLARE_BASE_URL).
 * - Placement items only: callers must pass purpose 'placement-items'. No learner data ever.
 * - Spend: the owner enforces the $1 limit on the Haiku key itself; a ledger in the scratchpad still
 *   records every call's returned token usage at the published list price (no group discount assumed,
 *   so it is an upper bound), and a call is refused when the ledger (both models together) plus that
 *   call's worst case would pass MF_STOP_USD (0.95). A spend refusal from a key = that model exhausted.
 * - The routes glitch now and then: transient errors are retried at 2/5/10/20/40 s.
 */
const fs = require('fs');
const path = require('path');
const { loadKeys } = require('./env');

const LEDGER = process.env.MF_LEDGER || 'C:/Users/admin/AppData/Local/Temp/claude/C--coding-claudecommittdIq-folderThing/34e6f487-b3f5-4acd-899c-244171ef0427/scratchpad/mf/ledger.jsonl';
const STOP = Number(process.env.MF_STOP_USD || 0.95);
// Published list prices per 1M tokens (modelflare.dev/api/pricing, read 2026-10-25 02:16 UTC); the
// higher tier is applied above 100K input tokens.
const MODELS = {
  haiku: { family: 'anthropic', api: 'anthropic', price: { standard: { input: 0.1, output: 0.5, cache_read: 0.01, cache_write: 0.125 }, long: { input: 0.5, output: 2.5, cache_read: 0.05, cache_write: 0.625 } } },
  luna: { family: 'openai', api: 'openai', price: { standard: { input: 0.25, output: 1.25, cache_read: 0.025, cache_write: 0.3125 }, long: { input: 0.5, output: 1.875, cache_read: 0.05, cache_write: 0.625 } } },
};
const EFFORT = process.env.MF_EFFORT || 'high';
const BACKOFF = [2000, 5000, 10000, 20000, 40000];
const TRANSIENT = new Set([408, 409, 425, 429, 500, 502, 503, 504, 520, 522, 524, 529, 599]);

function env(name) {
  const P = `MODELFLARE_${name.toUpperCase()}_`;
  loadKeys([`${P}API_KEY`, `${P}MODEL`, `${P}BASE_URL`, 'MODELFLARE_BASE_URL']);
  return { key: process.env[`${P}API_KEY`] || '', model: process.env[`${P}MODEL`] || '', base: (process.env[`${P}BASE_URL`] || process.env.MODELFLARE_BASE_URL || 'https://modelflare.dev/v1').replace(/\/$/, '') };
}
function spent() {
  let usd = 0;
  try { for (const l of fs.readFileSync(LEDGER, 'utf8').split('\n')) if (l.trim()) usd += JSON.parse(l).usd || 0; } catch { /* no ledger yet */ }
  return usd;
}
function priceOf(name, u) {
  const inTok = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
  const p = inTok > 100000 ? MODELS[name].price.long : MODELS[name].price.standard;
  return ((u.input_tokens || 0) * p.input + (u.output_tokens || 0) * p.output + (u.cache_read_input_tokens || 0) * p.cache_read + (u.cache_creation_input_tokens || 0) * p.cache_write) / 1e6;
}
function record(entry) { fs.mkdirSync(path.dirname(LEDGER), { recursive: true }); fs.appendFileSync(LEDGER, `${JSON.stringify(entry)}\n`); }

function request(name, e, { system, user, schema, schemaName, maxTokens }) {
  if (MODELS[name].api === 'anthropic') {
    return {
      url: `${e.base}/messages`,
      headers: { 'x-api-key': e.key, Authorization: `Bearer ${e.key}`, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: { model: e.model, max_tokens: maxTokens, system: String(system || ''), thinking: { type: 'adaptive' }, output_config: { effort: EFFORT }, messages: [{ role: 'user', content: String(user || '') }], tools: [{ name: schemaName, description: 'Submit the result. Call this exactly once.', input_schema: schema }], tool_choice: { type: 'auto' } },
    };
  }
  return {
    url: `${e.base}/chat/completions`,
    headers: { Authorization: `Bearer ${e.key}`, 'content-type': 'application/json' },
    body: { model: e.model, max_completion_tokens: maxTokens, reasoning_effort: EFFORT, messages: [{ role: 'system', content: String(system || '') }, { role: 'user', content: String(user || '') }], tools: [{ type: 'function', function: { name: schemaName, description: 'Submit the result. Call this exactly once.', parameters: schema } }], tool_choice: { type: 'function', function: { name: schemaName } } },
  };
}
function parse(name, j, schemaName) {
  if (MODELS[name].api === 'anthropic') {
    const u = j.usage || {};
    const tool = (j.content || []).find((c) => c.type === 'tool_use' && c.name === schemaName) || (j.content || []).find((c) => c.type === 'tool_use');
    let data = tool ? tool.input : null;
    if (!data) { const tx = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('').trim().replace(/^```(?:json)?\s*|\s*```$/g, ''); try { data = JSON.parse(tx); } catch { data = null; } }
    return { data, stop: j.stop_reason, usage: { input_tokens: u.input_tokens || 0, output_tokens: u.output_tokens || 0, cache_read_input_tokens: u.cache_read_input_tokens || 0, cache_creation_input_tokens: u.cache_creation_input_tokens || 0 } };
  }
  const u = j.usage || {};
  const cached = (u.prompt_tokens_details && u.prompt_tokens_details.cached_tokens) || 0;
  const msg = (j.choices && j.choices[0] && j.choices[0].message) || {};
  const call = (msg.tool_calls || []).find((c) => c.function && c.function.name === schemaName) || (msg.tool_calls || [])[0];
  let data = null;
  try { data = call ? JSON.parse(call.function.arguments) : JSON.parse(String(msg.content || '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch { data = null; }
  return { data, stop: j.choices && j.choices[0] && j.choices[0].finish_reason, usage: { input_tokens: Math.max(0, (u.prompt_tokens || 0) - cached), output_tokens: u.completion_tokens || 0, cache_read_input_tokens: cached } };
}

function make(name) {
  const configured = () => { const e = env(name); return !!(e.key && e.model); };
  /** structured({ purpose, system, user, schema, schemaName, maxTokens, tag }) -> { data, usage, model } */
  async function structured({ purpose, system, user, schema, schemaName = 'submit_verdicts', maxTokens = 16000, tag = '' }) {
    if (purpose !== 'placement-items') throw Object.assign(new Error(`mf-${name}: placement items only`), { status: 403 });
    const e = env(name);
    if (!e.key || !e.model) throw Object.assign(new Error(`mf-${name}: no key/model in .env`), { status: 403 });
    const worst = priceOf(name, { input_tokens: Math.ceil((String(system).length + String(user).length) / 3), output_tokens: maxTokens });
    const before = spent();
    if (before + worst > STOP) throw Object.assign(new Error(`mf-${name}: budget stop (ledger $${before.toFixed(4)} + worst $${worst.toFixed(4)} > $${STOP})`), { status: 402, budget: true });
    const rq = request(name, e, { system, user, schema, schemaName, maxTokens });
    let res; let text; let j = null; let t0;
    for (let attempt = 0; ; attempt++) {
      t0 = Date.now();
      try {
        res = await fetch(rq.url, { method: 'POST', headers: rq.headers, body: JSON.stringify(rq.body), signal: AbortSignal.timeout(Number(process.env.MF_TIMEOUT_MS || 300000)) });
        text = await res.text();
      } catch (err) { res = { ok: false, status: 599 }; text = String(err.message || err); }
      j = null; try { j = JSON.parse(text); } catch { /* */ }
      const msg = String((j && j.error && (j.error.message || j.error.type)) || text || '');
      if (!res.ok && (res.status === 402 || /quota|insufficient|balance|limit exceeded|spend/i.test(msg))) {
        record({ at: new Date().toISOString(), tag, name, model: e.model, status: res.status, usd: 0, note: 'spend refusal' });
        throw Object.assign(new Error(`mf-${name}: key refused for spend (${res.status}): ${msg.slice(0, 160)}`), { status: 402, budget: true });
      }
      if (res.ok || !TRANSIENT.has(res.status) || attempt >= BACKOFF.length) break;
      record({ at: new Date().toISOString(), tag, name, model: e.model, status: res.status, usd: 0, note: `transient, retry ${attempt + 1}` });
      await new Promise((r) => setTimeout(r, BACKOFF[attempt]));
    }
    const p = res.ok && j ? parse(name, j, schemaName) : { data: null, usage: (j && j.usage) || {} };
    const usd = priceOf(name, p.usage || {});
    record({ at: new Date().toISOString(), tag, name, model: e.model, effort: EFFORT, status: res.status, ms: Date.now() - t0, ...(p.usage || {}), usd: +usd.toFixed(6), ledger_usd: +(before + usd).toFixed(6) });
    if (!res.ok) throw Object.assign(new Error(`mf-${name} ${res.status}: ${String((j && j.error && (j.error.message || j.error.type)) || text).slice(0, 200)}`), { status: res.status, transient: TRANSIENT.has(res.status) });
    if (!p.data) throw Object.assign(new Error(`mf-${name}: no tool answer (stop ${p.stop})`), { unusable: true });
    return { data: p.data, usage: p.usage, model: (j && j.model) || e.model };
  }
  return { name, family: MODELS[name].family, structured, configured, env: () => { const e = env(name); return { model: e.model, base: e.base, hasKey: !!e.key }; } };
}

const haiku = make('haiku');
const luna = make('luna');
module.exports = { ...haiku, haiku, luna, make, spent, priceOf, LEDGER, STOP };
