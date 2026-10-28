/**
 * Modelflare's OpenAI-compatible Chat Completions API.
 *
 * Used only for writing the whole-subject placement quiz. Model access is bound
 * to the API key's routing group, so the requested model must be enabled for that
 * key in Modelflare.
 */
const BASE_URL = (process.env.MODELFLARE_BASE_URL || 'https://modelflare.dev/v1').replace(/\/$/, '');
const MODEL_PLACEMENT = process.env.MODELFLARE_MODEL_PLACEMENT || 'gpt-6.1-sol';
const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

const lane = { chain: Promise.resolve(), lastCallAt: 0 };
const MIN_GAP_MS = Number(process.env.MODELFLARE_MIN_GAP_MS || 0);

function isConfigured() {
  return !!process.env.MODELFLARE_API_KEY;
}

function isEnabled(role = 'placement') {
  return role === 'placement' && isConfigured();
}

function status() {
  return {
    configured: isConfigured(),
    available: isEnabled(),
    reason: isConfigured() ? null : 'no API key',
  };
}

function modelFor() {
  return MODEL_PLACEMENT;
}

function usageOf(payload) {
  const usage = (payload && payload.usage) || {};
  const cached = (usage.prompt_tokens_details && usage.prompt_tokens_details.cached_tokens) || 0;
  return {
    input_tokens: Math.max(0, (usage.prompt_tokens || 0) - cached),
    output_tokens: usage.completion_tokens || 0,
    cache_read_input_tokens: cached,
  };
}

async function post(body) {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.MODELFLARE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let payload = null;
    let detail = res.statusText;
    try {
      payload = await res.json();
      detail = (payload && payload.error && (payload.error.message || payload.error.type)) || detail;
    } catch { /* keep statusText */ }
    const err = new Error(`modelflare ${res.status}: ${String(detail).slice(0, 200)}`);
    err.status = res.status;
    err.body = payload;
    throw err;
  }
  const payload = await res.json();
  if (payload && payload.error && !payload.choices) {
    const err = new Error(`modelflare: ${String(payload.error.message || 'upstream error').slice(0, 200)}`);
    err.status = payload.error.code || 502;
    err.body = payload;
    throw err;
  }
  return payload;
}

async function queued(task) {
  const run = lane.chain.then(async () => {
    const wait = Math.max(0, lane.lastCallAt + MIN_GAP_MS - Date.now());
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    lane.lastCallAt = Date.now();
    return task();
  });
  lane.chain = run.catch(() => {});
  return run;
}

async function callWithRetries(body, attempts = 3) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await post(body);
    } catch (err) {
      lastError = err;
      if (!RETRYABLE.has(err.status) || attempt === attempts - 1) throw err;
      const wait = err.status === 429 ? 4000 : Math.min(12000, 1000 * (2 ** attempt));
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
  throw lastError;
}

function parseArguments(message, schemaName) {
  const calls = message.tool_calls || [];
  const call = calls.find((entry) => entry.function && entry.function.name === schemaName) || calls[0];
  if (call && call.function && call.function.arguments) {
    try { return JSON.parse(call.function.arguments); } catch { return null; }
  }
  const text = String(message.content || '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  if (!text.startsWith('{')) return null;
  try { return JSON.parse(text); } catch { return null; }
}

async function structured({ role, system, user, schema, schemaName = 'submit', maxTokens = 4096 }) {
  if (!isEnabled(role)) return null;
  const model = modelFor(role);
  const payload = await queued(() => callWithRetries({
    model,
    messages: [
      ...(system ? [{ role: 'system', content: system }] : []),
      { role: 'user', content: String(user || '') },
    ],
    max_tokens: maxTokens,
    tools: [{
      type: 'function',
      function: {
        name: schemaName,
        description: 'Submit the result. Call this exactly once.',
        parameters: schema,
      },
    }],
    tool_choice: 'auto',
  }));
  const message = payload && payload.choices && payload.choices[0] && payload.choices[0].message;
  if (!message) return null;
  const data = parseArguments(message, schemaName);
  return data ? { data, usage: usageOf(payload), model: payload.model || model } : null;
}

async function chat({ role, system, messages, maxTokens = 1024 }) {
  if (!isEnabled(role)) return null;
  const model = modelFor(role);
  const payload = await queued(() => callWithRetries({
    model,
    messages: [
      ...(system ? [{ role: 'system', content: system }] : []),
      ...messages.map((message) => ({
        role: message.role === 'assistant' ? 'assistant' : 'user',
        content: String(message.content || ''),
      })),
    ],
    max_tokens: maxTokens,
  }));
  const message = payload && payload.choices && payload.choices[0] && payload.choices[0].message;
  const text = message ? String(message.content || '').trim() : '';
  return text ? { text, usage: usageOf(payload), model: payload.model || model } : null;
}

function costCents() {
  // Modelflare pricing is group- and model-specific; call limits still apply.
  return 0;
}

async function listModels() {
  const res = await fetch(`${BASE_URL}/models`, {
    headers: { Authorization: `Bearer ${process.env.MODELFLARE_API_KEY}` },
  });
  if (!res.ok) throw new Error(`modelflare ${res.status}: ${res.statusText}`);
  const payload = await res.json();
  const models = Array.isArray(payload.data) ? payload.data : (Array.isArray(payload.models) ? payload.models : []);
  return models.map((model) => ({
    id: model.id,
    display: model.name || model.id,
    methods: ['chat.completions'],
  }));
}

module.exports = {
  name: 'modelflare',
  isEnabled,
  isConfigured,
  status,
  modelFor,
  structured,
  chat,
  costCents,
  listModels,
  usageOf,
};