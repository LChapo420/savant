/**
 * Claude on the owner's own Anthropic key, for making lessons factual.
 *
 * GLM 5.3 Flash writes every lesson. Claude does two jobs around it (both in
 * services/block-levels.js): it researches the level's facts on the web before
 * the writing, and it verifies every claim of the written level after, citing
 * sources. Measured on 2026-10-21 on three lessons with 13 known errors: GLM as
 * a checker caught 2, Claude Sonnet 5.5 caught 7 without searching.
 *
 * The key has its own name on purpose. The general ANTHROPIC_API_KEY turns
 * Anthropic on as a fallback for chat and other roles (services/providers),
 * which would spend this key on more than lessons. This key is read here and
 * nowhere else.
 *
 *   FACT_CHECK_ANTHROPIC_KEY=sk-ant-...           the key
 *   FACT_CHECK_ANTHROPIC_WORKSPACE=wrkspc_...     needed when the key is not
 *                                                 scoped to one workspace
 *   FACT_CHECK_MODEL=claude-sonnet-5-5            optional
 */
const ledger = require('./anthropic-ledger');

let Anthropic = null;
try {
  Anthropic = require('@anthropic-ai/sdk');
} catch {
  // Without the SDK nothing here runs, and lessons are not verified.
}

/** Dollars per million tokens, and per web search, for the record of what it cost. */
const PRICES = {
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01 },
};
const PER_SEARCH = 0.01;

const key = () => String(process.env.FACT_CHECK_ANTHROPIC_KEY || '').trim();
const workspace = () => String(process.env.FACT_CHECK_ANTHROPIC_WORKSPACE || '').trim();
const model = () => String(process.env.FACT_CHECK_MODEL || 'claude-sonnet-5-5').trim();

let client = null;
let clientFor = null;
function getClient() {
  if (!Anthropic || !key()) return null;
  const id = `${key()}|${workspace()}`;
  if (!client || clientFor !== id) {
    client = new Anthropic({
      apiKey: key(),
      // A key that is not scoped to a workspace must name one on every request.
      defaultHeaders: workspace() ? { 'anthropic-workspace-id': workspace() } : undefined,
    });
    clientFor = id;
  }
  return client;
}

/** Is a key pasted in (whether or not it works)? Lessons are held for verification once it is. */
function isConfigured() {
  return !!key();
}

/** Is a key pasted in, with the SDK there to use it? */
function isReady() {
  return !!getClient();
}

/** What a call cost, in dollars, from its usage: tokens plus web searches. */
function costOf(usage, name = model()) {
  const price = PRICES[name];
  if (!price || !usage) return null;
  const fresh = (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0);
  const searches = (usage.server_tool_use && usage.server_tool_use.web_search_requests) || 0;
  return (fresh * price.input + (usage.cache_read_input_tokens || 0) * price.cacheRead
    + (usage.output_tokens || 0) * price.output) / 1e6 + searches * PER_SEARCH;
}

function addUsage(a, b) {
  if (!b) return a;
  const out = { ...a };
  for (const k of ['input_tokens', 'output_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens']) out[k] = (out[k] || 0) + (b[k] || 0);
  const s = (x) => (x && x.server_tool_use && x.server_tool_use.web_search_requests) || 0;
  out.server_tool_use = { web_search_requests: s(a) + s(b) };
  return out;
}

/**
 * One structured answer from Claude, with web search when maxSearches > 0.
 *
 * The answer comes through a custom tool (schemaName) called once at the end;
 * web search runs on Anthropic's side in the same turn. A long search turn can
 * stop with pause_turn, and is resumed by sending the turn back, a few times at
 * most. Returns { data, usage, cost, sources, searches, model } or null when no
 * answer came; throws when the call fails (a bad key, no credit).
 */
async function ask({ system, user, schema, schemaName, maxTokens = 16000, maxSearches = 0, effort = 'high', modelName = null, task = null }) {
  const c = getClient();
  if (!c) return null;
  const name = modelName || model();
  const tools = [{ name: schemaName, description: 'Submit the result. Call this exactly once, at the end.', input_schema: schema }];
  if (maxSearches > 0) tools.unshift({ type: 'web_search_20260209', name: 'web_search', max_uses: maxSearches });
  const messages = [{ role: 'user', content: user }];
  let usage = {};
  const sources = new Map();
  for (let turn = 0; turn < 4; turn++) {
    // Streamed, then read whole: a long verification with searches can outlast the
    // SDK's limit for a single non-streamed request.
    // Each turn is reserved in the key's TOTAL ledger first (services/anthropic-ledger.js),
    // refused past the $24 stop, and settled at the cost its usage reports.
    const inputChars = String(system || '').length + JSON.stringify(messages).length + JSON.stringify(tools).length;
    // eslint-disable-next-line no-await-in-loop
    const { response } = await ledger.guard({ task: task || `fact_check:${schemaName}`, model: name, inputChars, maxTokens, searches: maxSearches }, async () => {
      const r = await c.messages.stream({
        model: name,
        max_tokens: maxTokens,
        output_config: { effort },
        system: [{ type: 'text', text: `${system}\n\nGive your answer by calling the ${schemaName} tool once, at the end.` }],
        messages,
        tools,
        tool_choice: { type: 'auto' },
      }).finalMessage();
      const known = costOf(r.usage, name);
      return { response: r, usage: r.usage, model: name, ...(known == null ? {} : { usd: known }) };
    });
    usage = addUsage(usage, response.usage);
    for (const block of response.content || []) {
      // A search's results: a list when it worked, an error object when it did not.
      if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
        for (const r of block.content) if (r && r.url) sources.set(r.url, r.title || '');
      }
    }
    if (response.stop_reason === 'refusal') return null;
    const answer = (response.content || []).find((b) => b.type === 'tool_use' && b.name === schemaName);
    if (answer) {
      return {
        data: answer.input,
        usage,
        cost: costOf(usage, name),
        sources: [...sources].map(([url, title]) => ({ url, title })),
        searches: (usage.server_tool_use && usage.server_tool_use.web_search_requests) || 0,
        model: name,
      };
    }
    if (response.stop_reason !== 'pause_turn') return null;
    messages.push({ role: 'assistant', content: response.content });
  }
  return null;
}

/** A one-line call that proves the key, the workspace and the model work. Throws when they do not. */
async function ping() {
  const c = getClient();
  if (!c) return null;
  const { response } = await ledger.guard({ task: 'key_check', model: model(), inputChars: 40, maxTokens: 64 }, async () => {
    const r = await c.messages.create({
      model: model(), max_tokens: 64, output_config: { effort: 'low' }, messages: [{ role: 'user', content: 'Reply with the word ok.' }],
    });
    return { response: r, usage: r.usage, model: model() };
  });
  return (response.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
}

module.exports = { isConfigured, isReady, ask, ping, model, costOf, PER_SEARCH, workspace };
