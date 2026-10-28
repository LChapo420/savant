/**
 * The model lineup, tested with mocked HTTP: no real model is ever called.
 *
 *   - the NVIDIA provider's request and response shapes (reasoning switches per
 *     family, token headroom, tools for structured output, $0 usage)
 *   - structured-output repair (fenced JSON, <think> blocks, trailing commas, a
 *     schema-invalid answer repaired by a second turn)
 *   - fallback down the chain on 429, 5xx and timeouts; a 401 stands NVIDIA down
 *   - the chain order for every role, MiMo / Gemini / paid OpenRouter absent,
 *     Anthropic always last, and the env overrides
 *   - services/ai.js falling to Anthropic only when every free model fails, and
 *     the key's TOTAL ledger on that last resort (services/anthropic-ledger.js)
 *   - the free fallbacks (local, Gemini free, OpenRouter :free) between NVIDIA and
 *     Claude, the $0 price check, and the NVIDIA 15-minute outage rule
 *   - no outside model at all for a learner without outside-AI consent
 *   - the Jev ledger refusing any call that could exceed its budget
 *
 * Every key in the environment is blanked first, and the DB is a temporary copy
 * unless DB_FILE names one.
 */
process.env.NODE_ENV = 'test';
for (const name of Object.keys(process.env)) {
  if (/(_API_KEY|_TOKEN|_SECRET_API|_WORKSPACE)$/.test(name) || /^(OPENROUTER|ANTHROPIC|GEMINI|MIMO|MODELFLARE|DEEPSEEK|MINIMAX|NVIDIA)_.*KEY/.test(name)) process.env[name] = '';
}
for (const name of Object.keys(process.env)) {
  if (/^AI_PROVIDER/.test(name) || /^NVIDIA_(TIER|ROLE|TASK)_/.test(name) || name === 'AI_LEGACY_PROVIDERS' || name === 'JEV_ENABLED') delete process.env[name];
}
const fs = require('fs');
const os = require('os');
const path = require('path');

let ownCopy = null;
if (!process.env.DB_FILE) {
  ownCopy = path.join(os.tmpdir(), `model-lineup-test-${process.pid}.json`);
  fs.copyFileSync(path.join(__dirname, '..', 'data', 'db.json'), ownCopy);
  process.env.DB_FILE = ownCopy;
}

// A fixed lineup, so the tests do not depend on what the eval last wrote.
const lineupFile = path.join(os.tmpdir(), `model-lineup-test-${process.pid}-lineup.json`);
fs.writeFileSync(lineupFile, JSON.stringify({
  tiers: {
    instant: [{ model: 'nvidia/nemotron-3.5-lightning-30b-a3b', effort: 'off' }, { model: 'nvidia/nemotron-3-ultra-550b-a55b', effort: 'off' }],
    light: [{ model: 'nvidia/nemotron-3-ultra-550b-a55b', effort: 'medium' }, { model: 'nvidia/nemotron-3.5-lightning-30b-a3b', effort: 'high' }],
    fast_thinking: [{ model: 'z-ai/glm-5.3-flash', effort: 'high' }, { model: 'deepseek-ai/deepseek-v4.1-flash', effort: 'high' }],
    hard: [{ model: 'z-ai/glm-5.3', effort: 'max' }, { model: 'deepseek-ai/deepseek-v4.1-flash', effort: 'max' }],
  },
  spill: { instant: ['light'], light: ['fast_thinking'], fast_thinking: ['hard'], hard: [] },
  roles: { fast: 'light', deep: 'hard', regen: 'fast_thinking', blocks: 'fast_thinking' },
  tasks: { grade_free_response: { tier: 'fast_thinking', models: [{ model: 'deepseek-ai/deepseek-v4.1-flash', effort: 'high' }] } },
  jev: { grade_free_response: true },
}));
process.env.MODEL_LINEUP_FILE = lineupFile;
const ledgerFile = path.join(os.tmpdir(), `model-lineup-test-${process.pid}-jev.json`);
process.env.JEV_LEDGER_FILE = ledgerFile;
// The Anthropic total ledger: a temporary file, never data/anthropic-ledger.json.
const anthropicLedgerFile = path.join(os.tmpdir(), `model-lineup-test-${process.pid}-anthropic.json`);
process.env.ANTHROPIC_LEDGER_FILE = anthropicLedgerFile;
process.env.FREE_TIER_EVIDENCE_FILE = path.join(os.tmpdir(), `model-lineup-test-${process.pid}-evidence.json`);
// Local models are tested on their own below; the chain tests run without them.
process.env.OLLAMA_ENABLED = '0';
process.env.NVIDIA_RPM = '1000';

const providers = require('../services/providers');
const nvidia = require('../services/providers/nvidia');
const sj = require('../services/providers/structured-json');
const anthropic = require('../services/providers/anthropic');
const ai = require('../services/ai');
const jev = require('../services/jev');
const db = require('../config/db');

let failures = 0;
function check(label, ok, detail) {
  if (ok) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 400)}`}`);
  }
}

/** A mocked fetch: each call is answered by the next responder, and recorded. */
function mockFetch(responders) {
  const calls = [];
  let i = 0;
  const fn = async (url, opts = {}) => {
    const body = opts.body ? JSON.parse(opts.body) : null;
    calls.push({ url, headers: opts.headers, body });
    const r = responders[Math.min(i++, responders.length - 1)];
    return typeof r === 'function' ? r(body, opts) : r;
  };
  return { fn, calls };
}
function json(status, payload, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    headers: { get: (k) => headers[k.toLowerCase()] || null },
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}
function completion({ content = '', toolArgs = null, model = 'x', reasoning = '', finish = 'stop' } = {}) {
  return json(200, {
    model,
    choices: [{
      finish_reason: finish,
      message: {
        role: 'assistant',
        content,
        reasoning_content: reasoning || null,
        ...(toolArgs !== null ? { tool_calls: [{ type: 'function', function: { name: 'submit', arguments: toolArgs } }] } : {}),
      },
    }],
    usage: { prompt_tokens: 100, completion_tokens: 40, completion_tokens_details: { reasoning_tokens: 30 } },
  });
}
const hang = (body, opts) => new Promise((resolve, reject) => {
  opts.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
});

const SCHEMA = {
  type: 'object',
  properties: { correct: { type: 'boolean' }, score: { type: 'integer' }, tag: { type: 'string', enum: ['none', 'grammar_rule'] } },
  required: ['correct', 'score', 'tag'],
  additionalProperties: false,
};

async function main() {
  nvidia._setSleep(async () => {});

  // ── structured-json ──────────────────────────────────────────────────────
  console.log('\nstructured output parsing and repair');
  let p = sj.parseStructured({ content: '<think>let me see {"a":1}</think>\n```json\n{"correct": true, "score": "3", "tag": "None",}\n```' }, 'submit');
  let v = sj.validate(SCHEMA, p.data);
  check('think block and code fence are stripped, trailing comma forgiven', p.data && p.data.correct === true, p);
  check('"3" is coerced to an integer and "None" to the enum value', !v.errors.length && v.value.score === 3 && v.value.tag === 'none', v);
  p = sj.parseStructured({ tool_calls: [{ function: { name: 'submit', arguments: '{"correct": false, "score": 2, "tag": "grammar_rule", "extra": 1}' } }] }, 'submit');
  v = sj.validate(SCHEMA, p.data);
  check('tool-call arguments are read, and an unknown property is pruned', !v.errors.length && !('extra' in v.value), v);
  p = sj.parseStructured({ content: '{"correct": true, "score": 4, "tag": "no' }, 'submit');
  check('a reply cut off by the token cap is closed and parsed', p.data && p.data.correct === true && p.data.score === 4, p);
  v = sj.validate(SCHEMA, { correct: 'maybe', tag: 'other' });
  check('real schema errors are reported with their paths', v.errors.some((e) => /\$\.correct/.test(e)) && v.errors.some((e) => /\$\.score: required/.test(e)) && v.errors.some((e) => /\$\.tag/.test(e)), v.errors);
  check('GLM leaked arg markup is split back out', JSON.stringify(sj.splitLeakedArgs({ a: 'x<arg_key>b</arg_key><arg_value>[1,2]</arg_value>' })) === JSON.stringify({ a: 'x', b: [1, 2] }));

  // ── request shape ────────────────────────────────────────────────────────
  console.log('\nNVIDIA request shape');
  process.env.NVIDIA_API_KEY = 'test-nvidia-key';
  nvidia._reset();
  let m = mockFetch([completion({ toolArgs: '{"correct": true, "score": 3, "tag": "none"}', model: 'z-ai/glm-5.3-flash' })]);
  nvidia._setFetch(m.fn);
  let r = await nvidia.structured({ role: 'regen', system: 'sys', user: 'u', schema: SCHEMA, schemaName: 'submit', maxTokens: 1000 });
  let req = m.calls[0];
  check('posts to integrate.api.nvidia.com/v1/chat/completions', req.url === 'https://integrate.api.nvidia.com/v1/chat/completions', req.url);
  check('bearer auth from NVIDIA_API_KEY', req.headers.Authorization === 'Bearer test-nvidia-key');
  check('regen role runs on the fast_thinking tier (GLM 5.3 Flash)', req.body.model === 'z-ai/glm-5.3-flash', req.body.model);
  check('GLM effort goes in chat_template_kwargs.reasoning_effort', req.body.chat_template_kwargs && req.body.chat_template_kwargs.reasoning_effort === 'high', req.body.chat_template_kwargs);
  check('max_tokens leaves room for the thinking', req.body.max_tokens === 1000 + 16384, req.body.max_tokens);
  check('structured output goes through one function tool', req.body.tools && req.body.tools[0].function.name === 'submit' && req.body.tool_choice === 'auto');
  check('the system prompt asks for the tool call', /calling the submit tool/.test(req.body.messages[0].content));
  check('the answer is validated data with $0 usage and the model that answered',
    r && r.data.correct === true && r.usage.cost_usd === 0 && r.usage.reasoning_tokens === 30 && r.model === 'z-ai/glm-5.3-flash', r);
  check('NVIDIA costs nothing against the daily ceiling', nvidia.costCents('z-ai/glm-5.3', { input_tokens: 1e6, output_tokens: 1e6 }) === 0);

  const rp = (model, effort) => JSON.stringify(nvidia.reasoningParams(model, effort));
  check('Nemotron off = enable_thinking false', rp('nvidia/nemotron-3.5-lightning-30b-a3b', 'off') === JSON.stringify({ chat_template_kwargs: { enable_thinking: false } }));
  check('Nemotron medium = medium_effort', rp('nvidia/nemotron-3-ultra-550b-a55b', 'medium') === JSON.stringify({ chat_template_kwargs: { enable_thinking: true, medium_effort: true } }));
  check('GLM 5.3 max = reasoning_effort max', rp('z-ai/glm-5.3', 'max') === JSON.stringify({ chat_template_kwargs: { reasoning_effort: 'max' } }));
  check('GLM has no off switch: off is sent as low', rp('z-ai/glm-5.3-flash', 'off') === JSON.stringify({ chat_template_kwargs: { reasoning_effort: 'low' } }));
  check('DeepSeek max = thinking + reasoning_effort max', rp('deepseek-ai/deepseek-v4.1-flash', 'max') === JSON.stringify({ chat_template_kwargs: { thinking: true, reasoning_effort: 'max' } }));
  check('DeepSeek off = thinking false', rp('deepseek-ai/deepseek-v4.1-flash', 'off') === JSON.stringify({ chat_template_kwargs: { thinking: false } }));
  check('instant tier has no thinking headroom', nvidia.maxTokensFor('nvidia/nemotron-3.5-lightning-30b-a3b', 'off', 300) === 300);

  // A task's measured winner goes first.
  m = mockFetch([completion({ toolArgs: '{"correct": true, "score": 1, "tag": "none"}' })]);
  nvidia._setFetch(m.fn);
  await nvidia.structured({ role: 'fast', task: 'grade_free_response', system: 's', user: 'u', schema: SCHEMA, schemaName: 'submit' });
  check('a task in the lineup file picks its own model', m.calls[0].body.model === 'deepseek-ai/deepseek-v4.1-flash', m.calls[0].body.model);
  check('plan: task model, then its tier, then the tier it spills into',
    JSON.stringify(nvidia.plan('fast', 'grade_free_response').entries.map((e) => e.model)) === JSON.stringify(['deepseek-ai/deepseek-v4.1-flash', 'z-ai/glm-5.3-flash', 'z-ai/glm-5.3']),
    nvidia.plan('fast', 'grade_free_response'));
  process.env.NVIDIA_TASK_GRADE_FREE_RESPONSE = 'z-ai/glm-5.3@low';
  check('NVIDIA_TASK_<TASK> overrides the file', nvidia.plan('fast', 'grade_free_response').entries[0].model === 'z-ai/glm-5.3' && nvidia.plan('fast', 'grade_free_response').entries[0].effort === 'low');
  delete process.env.NVIDIA_TASK_GRADE_FREE_RESPONSE;
  process.env.NVIDIA_ROLE_FAST = 'instant';
  check('NVIDIA_ROLE_<ROLE> moves a role to another tier', nvidia.plan('fast').entries[0].model === 'nvidia/nemotron-3.5-lightning-30b-a3b');
  delete process.env.NVIDIA_ROLE_FAST;

  // ── repair turn ──────────────────────────────────────────────────────────
  console.log('\nstructured repair turn');
  nvidia._reset();
  m = mockFetch([
    completion({ toolArgs: '{"correct": "perhaps"}' }),
    completion({ toolArgs: '{"correct": false, "score": 0, "tag": "grammar_rule"}' }),
  ]);
  nvidia._setFetch(m.fn);
  r = await nvidia.structured({ role: 'deep', system: 's', user: 'u', schema: SCHEMA, schemaName: 'submit' });
  check('a schema-invalid answer gets one repair turn on the same model', m.calls.length === 2 && m.calls[1].body.model === m.calls[0].body.model);
  const turn = m.calls[1].body.messages;
  check('the repair turn shows the answer and names what is wrong',
    turn[turn.length - 2].role === 'assistant' && /required/.test(turn[turn.length - 1].content) && /\$\.correct/.test(turn[turn.length - 1].content), turn.slice(-2));
  check('the repaired answer is returned', r && r.repaired && r.data.tag === 'grammar_rule', r);
  m = mockFetch([completion({ content: 'no json here' }), completion({ content: 'still none' }), completion({ toolArgs: '{"correct": true, "score": 5, "tag": "none"}', model: 'deepseek-ai/deepseek-v4.1-flash' })]);
  nvidia._setFetch(m.fn);
  r = await nvidia.structured({ role: 'deep', system: 's', user: 'u', schema: SCHEMA, schemaName: 'submit' });
  check('two unusable answers from one model move to the next model', m.calls.length === 3 && m.calls[2].body.model === 'deepseek-ai/deepseek-v4.1-flash' && r.data.score === 5, m.calls.map((c) => c.body.model));

  // ── fallback on failures ─────────────────────────────────────────────────
  console.log('\nfallback on 429, 5xx, timeouts and 401');
  nvidia._reset();
  m = mockFetch([json(429, { error: { message: 'rate limit' } }, { 'retry-after': '1' }), json(429, { error: 'rate' }), completion({ content: 'hi there', model: 'nvidia/nemotron-3.5-lightning-30b-a3b' })]);
  nvidia._setFetch(m.fn);
  let c = await nvidia.chat({ role: 'fast', system: 's', messages: [{ role: 'user', content: 'x' }] });
  check('interactive 429s: two tries on the first model, then its backup', m.calls.length === 3 && m.calls[0].body.model === 'nvidia/nemotron-3-ultra-550b-a55b' && m.calls[2].body.model === 'nvidia/nemotron-3.5-lightning-30b-a3b' && c.text === 'hi there', m.calls.map((x) => x.body.model));
  check('the rate-limited model is set aside for later calls', nvidia.plan('fast').entries[0].model === 'nvidia/nemotron-3-ultra-550b-a55b' && nvidia.status().cooling.includes('nvidia/nemotron-3-ultra-550b-a55b'));
  nvidia._reset();
  m = mockFetch([json(503, { error: 'busy' }), json(502, { error: 'bad gateway' }), json(500, {}), json(504, {}), completion({ toolArgs: '{"correct": true, "score": 1, "tag": "none"}', model: 'deepseek-ai/deepseek-v4.1-flash' })]);
  nvidia._setFetch(m.fn);
  r = await nvidia.structured({ role: 'deep', system: 's', user: 'u', schema: SCHEMA, schemaName: 'submit' });
  check('background 5xx: four tries with backoff, then the next model answers', m.calls.length === 5 && r.model === 'deepseek-ai/deepseek-v4.1-flash', m.calls.map((x) => x.body.model));
  nvidia._reset();
  process.env.NVIDIA_TIMEOUT_MS = '30';
  m = mockFetch([hang, hang, completion({ content: 'late but fine', model: 'nvidia/nemotron-3.5-lightning-30b-a3b' })]);
  nvidia._setFetch(m.fn);
  c = await nvidia.chat({ role: 'fast', system: 's', messages: [{ role: 'user', content: 'x' }] });
  check('a request that hangs is abandoned at its timeout and the backup answers', c && c.text === 'late but fine' && m.calls.length === 3, m.calls.length);
  delete process.env.NVIDIA_TIMEOUT_MS;
  nvidia._reset();
  m = mockFetch([json(200, { model: 'x', choices: [{ finish_reason: 'length', message: { content: '', reasoning_content: 'thinking...' } }], usage: {} }), completion({ content: 'answer', model: 'nvidia/nemotron-3.5-lightning-30b-a3b' })]);
  nvidia._setFetch(m.fn);
  c = await nvidia.chat({ role: 'fast', system: 's', messages: [{ role: 'user', content: 'x' }] });
  check('empty content after thinking (token cap) moves to the next model', c && c.text === 'answer', c);
  nvidia._reset();
  m = mockFetch([json(401, { error: 'bad key' })]);
  nvidia._setFetch(m.fn);
  let threw = null;
  try { await nvidia.chat({ role: 'fast', system: 's', messages: [{ role: 'user', content: 'x' }] }); } catch (err) { threw = err; }
  check('a 401 is thrown at once (no retries) and stands NVIDIA down', threw && threw.status === 401 && m.calls.length === 1 && !nvidia.isEnabled('fast'), m.calls.length);
  check('a stood-down NVIDIA drops out of the chain', !providers.chain('fast').some((p) => p.name === 'nvidia'));
  nvidia._reset();
  m = mockFetch([json(400, { error: { message: 'unknown field chat_template_kwargs' } }), completion({ content: 'ok', model: 'nvidia/nemotron-3-ultra-550b-a55b' })]);
  nvidia._setFetch(m.fn);
  c = await nvidia.chat({ role: 'fast', system: 's', messages: [{ role: 'user', content: 'x' }] });
  check('a model that rejects the reasoning switch is asked again without it', c && c.text === 'ok' && !m.calls[1].body.chat_template_kwargs, m.calls.map((x) => x.body.chat_template_kwargs));

  // Max reasoning that runs into NVIDIA's ~5-minute gateway cut-off (504) is retried at high.
  nvidia._reset();
  m = mockFetch([json(504, { error: 'Gateway Timeout' }), completion({ toolArgs: '{"correct": true, "score": 1, "tag": "none"}', model: 'z-ai/glm-5.3' })]);
  nvidia._setFetch(m.fn);
  r = await nvidia.structured({ role: 'deep', system: 's', user: 'u', schema: SCHEMA, schemaName: 'submit' });
  check('a 504 at max effort is retried on the same model at high',
    m.calls.length === 2 && m.calls[0].body.chat_template_kwargs.reasoning_effort === 'max' && m.calls[1].body.chat_template_kwargs.reasoning_effort === 'high' && r.model === 'z-ai/glm-5.3',
    m.calls.map((x) => x.body.chat_template_kwargs));

  // One model never has more than NVIDIA_MODEL_CONCURRENCY requests in flight.
  nvidia._reset();
  process.env.NVIDIA_MODEL_CONCURRENCY = '1';
  let inFlight = 0;
  let peak = 0;
  nvidia._setFetch(async () => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise((res) => { setTimeout(res, 20); });
    inFlight--;
    return completion({ content: 'ok', model: 'nvidia/nemotron-3-ultra-550b-a55b' });
  });
  await Promise.all([1, 2, 3].map(() => nvidia.chat({ role: 'fast', system: 's', messages: [{ role: 'user', content: 'x' }] })));
  check('per-model in-flight cap holds', peak === 1, peak);
  delete process.env.NVIDIA_MODEL_CONCURRENCY;

  // Streaming: reasoning deltas are not shown.
  nvidia._reset();
  const sse = ['data: {"model":"nvidia/nemotron-3-ultra-550b-a55b","choices":[{"delta":{"reasoning_content":"hmm"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"A noun "}}]}\n\n', 'data: {"choices":[{"delta":{"content":"names a thing."}}]}\n\n',
    'data: {"choices":[],"usage":{"prompt_tokens":5,"completion_tokens":7}}\n\n', 'data: [DONE]\n\n'];
  nvidia._setFetch(async () => ({ ok: true, status: 200, headers: { get: () => null }, body: (async function* gen() { for (const s of sse) yield Buffer.from(s); }()) }));
  const deltas = [];
  const st = await nvidia.chatStream({ role: 'fast', system: 's', messages: [{ role: 'user', content: 'x' }], onDelta: (d) => deltas.push(d) });
  check('a stream shows answer text only, never the thinking', st.text === 'A noun names a thing.' && deltas.join('') === 'A noun names a thing.' && st.usage.output_tokens === 7, { st, deltas });

  // ── chains ───────────────────────────────────────────────────────────────
  console.log('\nchain order per role');
  nvidia._reset();
  const groups = ['fast', 'deep', 'regen', 'diagnose', 'rewrite', 'personalize', 'games', 'blocks'];
  const FREE_CHAIN = ['nvidia', 'ollama', 'gemini_free', 'openrouter_free', 'anthropic'];
  for (const g of groups) check(`${g}: nvidia, the free fallbacks, then anthropic last`, JSON.stringify(providers.order(g)) === JSON.stringify(FREE_CHAIN), providers.order(g));
  check('placement stays on Modelflare alone', JSON.stringify(providers.order('placement')) === JSON.stringify(['modelflare']), providers.order('placement'));
  check('MiMo, Gemini and OpenRouter are in no chain', [...groups, 'placement', 'author', 'check'].every((g) => !providers.order(g).some((n) => ['mimo', 'gemini', 'openrouter'].includes(n))));

  const env = { AI_PROVIDER_FAST: 'openrouter', AI_PROVIDER_FAST_FALLBACK: 'gemini,mimo', AI_PROVIDER_DEEP: 'mimo', AI_PROVIDER_DEEP_FALLBACK: 'openrouter,gemini', AI_PROVIDER_REGEN: 'mimo', AI_PROVIDER_DIAGNOSE: 'mimo' };
  Object.assign(process.env, env);
  check('the pre-lineup .env (MiMo/OpenRouter/Gemini named) is ignored without the opt-in',
    ['fast', 'deep', 'regen', 'diagnose'].every((g) => JSON.stringify(providers.order(g)) === JSON.stringify(FREE_CHAIN)), groups.map((g) => providers.order(g)));
  process.env.AI_LEGACY_PROVIDERS = 'mimo';
  check('AI_LEGACY_PROVIDERS opts one back in, still ahead of nvidia and with Claude last',
    JSON.stringify(providers.order('deep')) === JSON.stringify(['mimo', ...FREE_CHAIN]), providers.order('deep'));
  check('an opted-in legacy provider does not bring the others', !providers.order('fast').includes('openrouter') && !providers.order('fast').includes('gemini'), providers.order('fast'));
  for (const k of [...Object.keys(env), 'AI_LEGACY_PROVIDERS']) delete process.env[k];
  process.env.AI_PROVIDER_FAST = 'anthropic';
  check('naming anthropic first still puts it last', JSON.stringify(providers.order('fast')) === JSON.stringify(FREE_CHAIN), providers.order('fast'));
  delete process.env.AI_PROVIDER_FAST;
  process.env.AI_ANTHROPIC_FALLBACK = '0';
  check('AI_ANTHROPIC_FALLBACK=0 takes Claude out of every chain', groups.every((g) => !providers.order(g).includes('anthropic')));
  delete process.env.AI_ANTHROPIC_FALLBACK;
  check('without an NVIDIA key, NVIDIA is not offered', (() => { const k = process.env.NVIDIA_API_KEY; process.env.NVIDIA_API_KEY = ''; const ok = !providers.chain('fast').some((pp) => pp.name === 'nvidia'); process.env.NVIDIA_API_KEY = k; return ok; })());

  // ── services/ai.js: Claude only when every free model fails ───────────────
  console.log('\nanthropic is the last resort, under a daily ceiling');
  nvidia._reset();
  process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
  const realAnthropic = anthropic.structured;
  let anthropicCalls = 0;
  anthropic.structured = async () => { anthropicCalls++; return { data: { correct: true, score: 9, tag: 'none' }, usage: { input_tokens: 1000, output_tokens: 1000 }, model: 'claude-haiku-4-5' }; };
  m = mockFetch([completion({ toolArgs: '{"correct": true, "score": 2, "tag": "none"}', model: 'nvidia/nemotron-3-ultra-550b-a55b' })]);
  nvidia._setFetch(m.fn);
  let got = await ai.structured({ role: 'fast', system: 's', user: 'u', schema: SCHEMA, schemaName: 'submit' });
  check('a free answer means Claude is never called', got && got.score === 2 && anthropicCalls === 0, { got, anthropicCalls });
  m = mockFetch([json(503, {})]);
  nvidia._setFetch(m.fn);
  got = await ai.structured({ role: 'fast', system: 's', user: 'u', schema: SCHEMA, schemaName: 'submit', userId: 'lineup-test-user' });
  check('every free model failing falls to Claude', got && got.score === 9 && anthropicCalls === 1, { got, anthropicCalls, nvidiaCalls: m.calls.length });
  // ── the key's TOTAL ledger replaces the old $1/day cap ────────────────────
  const ledgerMod = require('../services/anthropic-ledger');
  let ls = ledgerMod.status();
  check('the key ledger starts from the $11.20 spent before it existed, with a $24.00 stop', ls.ok && ls.spent_usd === 11.2 && ls.stop_usd === 24 && ledgerMod.HARD_STOP_USD === 24, ls);
  check('the environment can lower the stop, never raise it', (() => { process.env.ANTHROPIC_LEDGER_STOP_USD = '99'; const a = ledgerMod.status().stop_usd; process.env.ANTHROPIC_LEDGER_STOP_USD = '20'; const b = ledgerMod.status().stop_usd; delete process.env.ANTHROPIC_LEDGER_STOP_USD; return a === 24 && b === 20; })());
  nvidia._reset();
  process.env.AI_ANTHROPIC_DAILY_CENTS = '1'; // the old daily cap: no longer read
  anthropic.structured = realAnthropic; // the real provider, so the ledger guard runs
  const sdkCalls = [];
  anthropic._setClient({ messages: { create: async (body) => { sdkCalls.push(body); return { stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'submit', input: { correct: true, score: 7, tag: 'none' } }], usage: { input_tokens: 2000, output_tokens: 500 } }; } } });
  m = mockFetch([json(503, {})]);
  nvidia._setFetch(m.fn);
  got = await ai.structured({ role: 'fast', system: 's', user: 'u', schema: SCHEMA, schemaName: 'submit' });
  ls = ledgerMod.status();
  const haiku = (2000 * 1 + 500 * 5) / 1e6;
  check('the old $1/day cap is gone: Claude answers past it, recorded in the total ledger at its real cost', got && got.score === 7 && sdkCalls.length === 1 && Math.abs(ls.spent_usd - (11.2 + haiku)) < 1e-6 && ls.reserved_usd === 0, { got, ls });
  delete process.env.AI_ANTHROPIC_DAILY_CENTS;
  // Near the stop: a call whose reservation could pass $24 is refused before any request.
  let lj = JSON.parse(fs.readFileSync(anthropicLedgerFile, 'utf8'));
  lj.settled_usd = 24 - 11.2 - 0.01;
  fs.writeFileSync(anthropicLedgerFile, JSON.stringify(lj));
  nvidia._reset();
  m = mockFetch([json(503, {})]);
  nvidia._setFetch(m.fn);
  got = await ai.structured({ role: 'fast', system: 's', user: 'u', schema: SCHEMA, schemaName: 'submit' });
  check('at the $24 stop Claude is skipped (the caller gets null, its floor)', got === null && sdkCalls.length === 1, { got, calls: sdkCalls.length });
  let ledgerThrew = null;
  try { await anthropic.structured({ role: 'fast', system: 's', user: 'u', schema: SCHEMA, schemaName: 'submit', maxTokens: 4096 }); } catch (err) { ledgerThrew = err; }
  check('the provider itself refuses a call whose reservation would pass the stop', ledgerThrew && ledgerThrew.code === 'LEDGER_STOP' && sdkCalls.length === 1, ledgerThrew && ledgerThrew.message);
  // Open reservations (another process, or a crash) count against the stop.
  lj = JSON.parse(fs.readFileSync(anthropicLedgerFile, 'utf8'));
  lj.settled_usd = 5;
  lj.reservations = { other: { usd: 24 - 11.2 - 5 - 0.001, at: new Date().toISOString(), task: 'other process' } };
  fs.writeFileSync(anthropicLedgerFile, JSON.stringify(lj));
  check('open reservations count toward the stop', !ledgerMod.canSpend(0.01) && ledgerMod.status().committed_usd > 23.99);
  // A reservation left by a dead process for over 2 hours is counted as spent, not forgotten.
  lj.reservations = { old: { usd: 0.5, at: new Date(Date.now() - 3 * 3600 * 1000).toISOString(), task: 'crashed' } };
  fs.writeFileSync(anthropicLedgerFile, JSON.stringify(lj));
  const rid = ledgerMod.reserve({ usd: 0.01, task: 't', model: 'claude-haiku-4-5' });
  ledgerMod.settle(rid, { outcome: 'not_billed' });
  lj = JSON.parse(fs.readFileSync(anthropicLedgerFile, 'utf8'));
  check('a stale reservation is counted as spent; an HTTP error from Anthropic is settled at $0', Math.abs(lj.settled_usd - 5.5) < 1e-9 && !lj.reservations.old && lj.log.some((l) => l.outcome === 'not_billed' && l.usd === 0), lj.settled_usd);
  // A network failure (the request may have run) is counted at its reservation.
  fs.unlinkSync(anthropicLedgerFile);
  anthropic._setClient({ messages: { create: async () => { throw new Error('socket hang up'); } } });
  try { await anthropic.structured({ role: 'fast', system: 's', user: 'u', schema: SCHEMA, schemaName: 'submit', maxTokens: 1000 }); } catch { /* expected */ }
  ls = ledgerMod.status();
  check('a network failure is counted at the reservation (it may have been billed)', ls.spent_usd > 11.2 && ls.reserved_usd === 0, ls);
  fs.writeFileSync(anthropicLedgerFile, '{oops');
  check('an unreadable ledger refuses every call', !ledgerMod.canSpend(0) && (() => { try { ledgerMod.reserve({ usd: 0.01 }); return false; } catch (err) { return err.code === 'LEDGER_STOP' || /unreadable|corrupt/.test(err.message); } })());
  fs.unlinkSync(anthropicLedgerFile);
  anthropic._setClient(null);

  // ── the free fallbacks: never a paid route ───────────────────────────────
  console.log('\nfree fallbacks between NVIDIA and Claude');
  const free = require('../services/providers/free-apis');
  free._reset();
  process.env.OPENROUTER_API_KEY = 'test-or-key';
  const orBodies = [];
  free._setFetch(async (url, opts) => {
    if (/\/models$/.test(url)) {
      return json(200, { data: [
        { id: 'nvidia/nemotron-3-ultra-550b-a55b:free', pricing: { prompt: '0', completion: '0' }, supported_parameters: ['tools'] },
        { id: 'google/gemma-4-31b-it:free', pricing: { prompt: '0', completion: '0.0000001' }, supported_parameters: ['response_format'] },
        { id: 'z-ai/glm-5.3-flash', pricing: { prompt: '0.0000004', completion: '0.000002' } },
      ] });
    }
    const body = JSON.parse(opts.body);
    orBodies.push(body);
    return json(200, { model: body.model, choices: [{ message: { content: '{"correct": true, "score": 4, "tag": "none"}' } }], usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0 } });
  });
  const orOut = await free.openrouterFree.structured({ system: 's', user: 'u', schema: SCHEMA, schemaName: 'submit', models: ['google/gemma-4-31b-it:free', 'z-ai/glm-5.3-flash', 'nvidia/nemotron-3-ultra-550b-a55b:free'] });
  check('OpenRouter free: a model priced above $0 (even a ":free" id) or without ":free" is refused; only the $0 model is called',
    orOut && orOut.model === 'nvidia/nemotron-3-ultra-550b-a55b:free' && orBodies.length === 1 && orBodies[0].model === 'nvidia/nemotron-3-ultra-550b-a55b:free', { orOut, models: orBodies.map((b) => b.model) });
  check('OpenRouter free: one model per request, no fallback list, routing or plugins (nothing that could reach a paid route)',
    orBodies.every((b) => !b.models && !b.route && !b.plugins && /:free$/.test(b.model)), orBodies[0]);
  check('OpenRouter free: every request carries the OpenRouter $0 price cap (provider.max_price all 0)',
    orBodies.every((b) => b.provider && b.provider.max_price && Object.values(b.provider.max_price).every((v) => v === 0)), orBodies[0] && orBodies[0].provider);
  // A route that reports any cost locks the whole tier off.
  free._setFetch(async (url) => (/\/models$/.test(url)
    ? json(200, { data: [{ id: 'nvidia/nemotron-3-ultra-550b-a55b:free', pricing: { prompt: '0', completion: '0' } }] })
    : json(200, { choices: [{ message: { content: '{"correct": true, "score": 4, "tag": "none"}' } }], usage: { cost: 0.0001 } })));
  await free.openrouterFree.structured({ system: 's', user: 'u', schema: SCHEMA, schemaName: 'submit' }).catch(() => null);
  check('OpenRouter free: a call that reports any cost locks the tier off (persisted)', !free.openrouterFree.isEnabled()
    && JSON.parse(fs.readFileSync(process.env.FREE_TIER_EVIDENCE_FILE, 'utf8')).openrouter_free_locked);
  fs.unlinkSync(process.env.FREE_TIER_EVIDENCE_FILE);
  free._reset();
  free._setFetch(async (url, opts) => {
    if (/\/models$/.test(url)) return json(200, { data: [{ id: 'nvidia/nemotron-3-ultra-550b-a55b:free', pricing: { prompt: '0', completion: '0' } }] });
    const body = JSON.parse(opts.body);
    orBodies.push(body);
    return json(200, { model: body.model, choices: [{ message: { content: '{"correct": true, "score": 4, "tag": "none"}' } }], usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0 } });
  });
  check('Gemini is off until its free tier is confirmed', (() => { process.env.GEMINI_API_KEY = 'test-g'; const off = !free.geminiFree.isEnabled(); process.env.GEMINI_FREE_TIER_CONFIRMED = '1'; const on = free.geminiFree.isEnabled(); delete process.env.GEMINI_FREE_TIER_CONFIRMED; process.env.GEMINI_API_KEY = ''; return off && on; })());
  // The chain: NVIDIA failing every model, the free fallback answers, Claude is not called.
  nvidia._reset();
  process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
  let claudeCalls = 0;
  anthropic.structured = async () => { claudeCalls++; return { data: { correct: true, score: 9, tag: 'none' }, usage: {}, model: 'claude-haiku-4-5' }; };
  m = mockFetch([json(429, {})]);
  nvidia._setFetch(m.fn);
  got = await ai.structured({ role: 'fast', system: 's', user: 'u', schema: SCHEMA, schemaName: 'submit' });
  check('NVIDIA failing: the free fallback answers before Claude', got && got.score === 4 && claudeCalls === 0, { got, claudeCalls });

  // ── consent: no outside model for a learner without it ───────────────────
  console.log('\nconsent: a learner without outside-AI consent');
  const child = db.insert('users', { email: `lineup-child-${process.pid}@test.local`, name: 'Child', birth_year: new Date().getFullYear() - 9 });
  const consent = require('../routes/consent');
  const access = consent.access(db.byId('users', child.id));
  check('the test learner has no outside-AI consent', access && access.ai_free_text === false, access);
  nvidia._reset();
  const before2 = { nvidia: 0, or: orBodies.length, claude: claudeCalls };
  m = mockFetch([completion({ toolArgs: '{"correct": true, "score": 2, "tag": "none"}' })]);
  nvidia._setFetch(m.fn);
  process.env.JEV_ENABLED = '1';
  let jevSeen = 0;
  jev._setFetch(async () => { jevSeen++; return json(200, {}); });
  got = await ai.structured({ role: 'fast', system: 's', user: 'u', schema: SCHEMA, schemaName: 'submit', userId: child.id });
  const graded2 = await ai.gradeFreeResponse({ item: { prompt: 'Translate into Spanish: The keys are in the car.', answer: 'Las llaves están en el coche', format: 'short_answer' }, userAnswer: 'Las llaves están en el carro', userId: child.id, budgetMs: 2000 });
  check('no NVIDIA, Jev, Gemini, OpenRouter or Anthropic call for that learner (structured call and typed grading)',
    got === null && m.calls.length === 0 && orBodies.length === before2.or && claudeCalls === before2.claude && jevSeen === 0, { got, nvidia: m.calls.length, or: orBodies.length - before2.or, claude: claudeCalls - before2.claude, jevSeen });
  check('their typed answer is not accepted without local judges (closed as not accepted, never sent out)', graded2 && graded2.correct !== true, graded2);
  delete process.env.JEV_ENABLED;
  db.remove('users', (u) => u.id === child.id);
  free._setFetch(null);
  free._reset();
  process.env.OPENROUTER_API_KEY = '';

  // ── NVIDIA: the owner's 15-minute rule ───────────────────────────────────
  console.log('\nNVIDIA rate limits: retest, and local only after 15 confirmed minutes');
  nvidia._reset();
  const realNow = Date.now;
  let clock = realNow();
  Date.now = () => clock;
  m = mockFetch([json(429, {})]);
  nvidia._setFetch(m.fn);
  for (let minute = 0; minute < 14; minute++) {
    await nvidia.structured({ role: 'fast', system: 's', user: 'u', schema: SCHEMA, schemaName: 'submit', models: [{ model: 'nvidia/nemotron-3-ultra-550b-a55b', effort: 'medium' }], attempts: 1 }).catch(() => {});
    clock += 60 * 1000;
  }
  check('14 minutes of 429s: still NVIDIA first (failing, not down)', nvidia.outage().state === 'failing' && providers.order('fast')[0] === 'nvidia', nvidia.outage());
  clock += 2 * 60 * 1000;
  await nvidia.structured({ role: 'fast', system: 's', user: 'u', schema: SCHEMA, schemaName: 'submit', models: [{ model: 'nvidia/nemotron-3-ultra-550b-a55b', effort: 'medium' }], attempts: 1 }).catch(() => {});
  clock += 10 * 1000; // past the short pause a 429 sets
  await nvidia.probe(); // the confirming probe (outage() starts the same one lazily)
  check('16 minutes of failures and a failed probe: NVIDIA is down, local goes first', nvidia.outage().state === 'down' && providers.order('fast')[0] === 'ollama' && !nvidia.isEnabled('fast'), nvidia.outage());
  m = mockFetch([completion({ content: 'ok' })]);
  nvidia._setFetch(m.fn);
  clock += 61 * 1000;
  await nvidia.probe();
  check('a successful retest ends the outage: back to NVIDIA first', nvidia.outage().state === 'ok' && providers.order('fast')[0] === 'nvidia', nvidia.outage());
  nvidia._reset();
  clock = realNow();
  m = mockFetch([json(429, {})]);
  nvidia._setFetch(m.fn);
  for (let i = 0; i < 20; i++) {
    await nvidia.structured({ role: 'fast', system: 's', user: 'u', schema: SCHEMA, schemaName: 'submit', models: [{ model: 'nvidia/nemotron-3-ultra-550b-a55b', effort: 'medium' }], attempts: 1 }).catch(() => {});
    clock += 2500; // past each 429's short pause (the mocked clock does not move by itself)
  }
  check('a burst of 429s inside one minute never counts as an outage', nvidia.outage().state === 'failing');
  Date.now = realNow;
  nvidia._reset();
  anthropic.structured = realAnthropic;
  process.env.ANTHROPIC_API_KEY = '';

  // ── Jev ledger ───────────────────────────────────────────────────────────
  console.log('\nJev budget ledger');
  const state = { question: 'q', reference_answer: 'a', other_accepted_answers: 'none', learner_answer: 'b' };
  check('the hard budget is $0.13 and the env cannot raise it', (() => { process.env.JEV_BUDGET_USD = '5'; const b = jev.budget(); delete process.env.JEV_BUDGET_USD; return b === 0.13 && jev.HARD_BUDGET_USD === 0.13; })());
  let jevCalls = 0;
  jev._setFetch(async (url, opts) => {
    jevCalls++;
    const tokens = Math.ceil(JSON.parse(opts.body).state.question.length / 4) + 100;
    return json(200, { answers: { acceptable: { type: 'noul', noul: 0.92 } }, usage: { input_tokens: tokens, output_tokens: 2, cost: tokens * jev.PRICE } });
  });
  check('without an OpenRouter key Jev is refused', (await jev.decide({ task: 't', state, questions: jev.GRADE_QUESTION })).refused);
  process.env.OPENROUTER_API_KEY = 'test-or-key';
  check('Jev is off unless JEV_ENABLED=1', !jev.enabledFor('grade_free_response'));
  process.env.JEV_ENABLED = '1';
  check('with JEV_ENABLED=1 the lineup decides per task', jev.enabledFor('grade_free_response') && !jev.enabledFor('blind_mc'));
  const one = await jev.gradeTyped({ question: 'q', reference: 'a', accepted: [], learner: 'b' });
  let led = jev.readLedger();
  check('a call is made, settled in the ledger, and its reservation cleared', one && one.correct === true && led.calls === 1 && led.counted_usd > 0 && !Object.keys(led.reservations).length, led);
  // Fill the ledger to just under the budget: the next call must be refused before any request.
  led.counted_usd = jev.HARD_BUDGET_USD - 0.000001;
  fs.writeFileSync(ledgerFile, JSON.stringify(led));
  const before = jevCalls;
  const refused = await jev.decide({ task: 't', state, questions: jev.GRADE_QUESTION });
  check('a call that could exceed the budget is refused without a request', refused && refused.refused && jevCalls === before, refused);
  check('the refusal is counted in the ledger', jev.readLedger().refused_calls >= 1);
  // An open reservation (a crashed process) still counts against the budget.
  led = jev.readLedger();
  led.counted_usd = 0.12;
  led.reservations = { stale: { usd: 0.0099995, task: 'crashed' } };
  fs.writeFileSync(ledgerFile, JSON.stringify(led));
  const r2 = await jev.decide({ task: 't', state, questions: jev.GRADE_QUESTION });
  check('open reservations count as spent', r2 && r2.refused && jevCalls === before, r2);
  check('remaining() never goes below zero', jev.remaining() >= 0 && jev.remaining() < 0.00001, jev.remaining());
  const graded = await (async () => { const g = await ai.gradeFreeResponse({ item: { prompt: 'q', answer: 'a' }, userAnswer: 'b' }); return g; })();
  check('grading falls back to the layered grader when Jev is refused; with no judge answering, it is closed as NOT accepted', graded && graded.correct === false && graded.status === 'unresolved', graded);
  fs.writeFileSync(ledgerFile, '{not json');
  const r3 = await jev.decide({ task: 't', state, questions: jev.GRADE_QUESTION });
  check('an unreadable ledger refuses rather than starting from zero', r3 && r3.refused && /unreadable/.test(r3.refused) && jevCalls === before, r3);
  // A billed call far above the listed price locks Jev off.
  fs.unlinkSync(ledgerFile);
  jev._setFetch(async () => json(200, { answers: {}, usage: { input_tokens: 10, cost: 0.01 } }));
  await jev.decide({ task: 't', state, questions: jev.GRADE_QUESTION });
  const r4 = await jev.decide({ task: 't', state, questions: jev.GRADE_QUESTION });
  check('a call billed far above the listed price locks Jev off', jev.readLedger().locked && r4.refused && /locked/.test(r4.refused), jev.readLedger().locked);
  delete process.env.JEV_ENABLED;
  process.env.OPENROUTER_API_KEY = '';

  nvidia._setFetch(null);
  jev._setFetch(null);
}

main().catch((err) => { failures++; console.log(`  FAIL threw: ${err.stack}`); }).finally(() => {
  for (const f of [lineupFile, ledgerFile]) { try { fs.unlinkSync(f); } catch { /* gone */ } }
  if (ownCopy) { try { fs.unlinkSync(ownCopy); } catch { /* gone */ } }
  console.log(failures ? `\n${failures} failed` : '\nall passed');
  process.exit(failures ? 1 : 0);
});
