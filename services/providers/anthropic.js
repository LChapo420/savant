/**
 * Anthropic, through the official SDK.
 *
 * Structured output goes through a single strict tool with `tool_choice: auto`
 * plus an explicit instruction to call it: that combination returns
 * schema-valid JSON on every current model, including the ones that reject a
 * forced tool choice.
 */
const ledger = require('../anthropic-ledger');

let Anthropic = null;
try {
  Anthropic = require('@anthropic-ai/sdk');
} catch {
  // Optional at runtime: a checkout with no install still runs on the bank.
}

const MODEL_AUTHOR = process.env.AI_MODEL_AUTHOR || 'claude-opus-5';
const MODEL_FAST = process.env.AI_MODEL_FAST || 'claude-haiku-4-5';

/** Dollars per million tokens, for the per-user daily ceiling (the key's total is services/anthropic-ledger.js). */
const PRICES = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.4 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-haiku-5-5': { input: 0.5, output: 2.5, cacheRead: 0.05 },
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-sonnet-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-haiku-4-5': { input: 1, output: 5, cacheRead: 0.1 },
};

let client = null;
function getClient() {
  if (!Anthropic || !process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic();
  return client;
}

/** Configured, and the key's total ledger has room for a typical call. */
function isEnabled() {
  return !!getClient() && ledger.canSpend(0.05);
}

function modelFor(role) {
  return role === 'author' || role === 'deep' ? MODEL_AUTHOR : MODEL_FAST;
}

async function structured({ role, task = null, system, user, schema, schemaName = 'submit', maxTokens = 4096, effort = 'medium', signal = null }) {
  const c = getClient();
  if (!c) return null;
  const model = modelFor(role);

  // Every call goes through the key's TOTAL ledger (services/anthropic-ledger.js):
  // reserved before it is sent, refused past the $24 stop, settled at its real cost.
  const inputChars = String(system || '').length + String(user || '').length + JSON.stringify(schema || {}).length;
  const { response } = await ledger.guard({ task: task || `role:${role}`, model, inputChars, maxTokens }, async () => {
    const r = await c.messages.create({
      model,
      max_tokens: maxTokens,
      output_config: { effort },
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: user }],
      tools: [{
        name: schemaName,
        description: 'Submit the result.',
        strict: true,
        input_schema: schema,
      }],
      tool_choice: { type: 'auto' },
    }, signal ? { signal } : undefined);
    return { response: r, usage: r.usage, model };
  });

  if (response.stop_reason === 'refusal') return null;
  const block = (response.content || []).find((b) => b.type === 'tool_use' && b.name === schemaName);
  return block ? { data: block.input, usage: response.usage, model } : null;
}

async function chat({ role, task = null, system, messages, maxTokens = 1024, effort = 'low', signal = null }) {
  const c = getClient();
  if (!c) return null;
  const model = modelFor(role);

  const msgs = messages.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '') }));
  const inputChars = String(system || '').length + msgs.reduce((a, m) => a + m.content.length, 0);
  const { response } = await ledger.guard({ task: task || `role:${role}`, model, inputChars, maxTokens }, async () => {
    const r = await c.messages.create({
      model,
      max_tokens: maxTokens,
      output_config: { effort },
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: msgs,
    }, signal ? { signal } : undefined);
    return { response: r, usage: r.usage, model };
  });

  if (response.stop_reason === 'refusal') return null;
  const text = (response.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  return text ? { text, usage: response.usage, model } : null;
}

function costCents(model, usage) {
  if (!usage) return 0;
  const p = PRICES[model] || PRICES['claude-opus-5'];
  return 100 * (
    ((usage.input_tokens || 0) * p.input
      + (usage.cache_read_input_tokens || 0) * p.cacheRead
      + (usage.cache_creation_input_tokens || 0) * p.input * 1.25
      + (usage.output_tokens || 0) * p.output) / 1e6
  );
}

/** Typed SDK errors, so the caller can log something meaningful. */
function describeError(err) {
  if (Anthropic && err instanceof Anthropic.RateLimitError) return 'rate limited';
  if (Anthropic && err instanceof Anthropic.APIError) return `api error ${err.status}: ${err.message}`;
  return err.message;
}

function isConfigured() {
  return !!process.env.ANTHROPIC_API_KEY;
}

/** Tests only: a fake SDK client (null restores the real one). */
function _setClient(c) { client = c; }

function status() {
  const l = ledger.status();
  return {
    configured: isConfigured(),
    available: isEnabled(),
    reason: !isConfigured() ? 'no API key' : !l.ok ? l.reason : l.headroom_usd < 0.05 ? `key ledger at the $${l.stop_usd} stop` : null,
    ledger: l,
  };
}

module.exports = {
  name: 'anthropic',
  isEnabled,
  isConfigured,
  status,
  modelFor,
  structured,
  chat,
  costCents,
  describeError,
  PRICES,
  _setClient,
};
