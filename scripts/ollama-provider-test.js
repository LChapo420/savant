/**
 * services/providers/ollama.js, tested with mocked HTTP: no model is ever called.
 *
 *   - structured output: the JSON schema is sent as `format`, think:false for "off",
 *     the answer validated, a schema-invalid answer repaired by a second turn
 *   - a model without a thinking mode is retried without `think`
 *   - every layer on the GPU for a model that fits the card, the automatic split for
 *     one that does not
 *   - abliterated / derestricted / uncensored models refused
 *   - the memory guard refuses a model that would not fit the free RAM
 *   - the provider serves only tasks the local lineup lists (or OLLAMA_FALLBACK_ALL=1)
 *
 *   node scripts/ollama-provider-test.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const lineupFile = path.join(os.tmpdir(), `local-lineup-test-${process.pid}.json`);
fs.writeFileSync(lineupFile, JSON.stringify({ first: ['fact_claims'], fallback: ['grade_free_response'], tasks: { fact_claims: { models: [{ model: 'qwen3.5:4b', effort: 'off' }] } } }));
process.env.LOCAL_LINEUP_FILE = lineupFile;
process.env.OLLAMA_RAM_HEADROOM_GB = '0';
process.env.OLLAMA_MIN_FREE_GB = '0';
delete process.env.OLLAMA_NUM_GPU;
delete process.env.OLLAMA_FALLBACK_ALL;

const ollama = require('../services/providers/ollama');

let failures = 0;
function check(name, ok) {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
}

const GB = 1024 ** 3;
const TAGS = { models: [{ name: 'qwen3.5:4b', size: 3.3 * GB }, { name: 'nothink:1b', size: 1 * GB }, { name: 'big:27b', size: 17 * GB }, { name: 'huge:70b', size: 40 * GB }] };

function mock(handler) {
  const sent = [];
  ollama._reset();
  ollama._setFetch(async (url, opts = {}) => {
    const body = opts.body ? JSON.parse(opts.body) : null;
    sent.push({ url, body });
    const route = url.replace(/^https?:\/\/[^/]+/, '');
    let reply;
    if (route === '/api/version') reply = { status: 200, json: { version: 'test' } };
    else if (route === '/api/tags') reply = { status: 200, json: TAGS };
    else if (route === '/api/ps') reply = { status: 200, json: { models: [] } };
    else reply = handler(route, body, sent);
    return { ok: reply.status < 400, status: reply.status, text: async () => JSON.stringify(reply.json) };
  });
  return sent;
}
const chatReply = (content, extra = {}) => ({ status: 200, json: { message: { role: 'assistant', content }, done_reason: 'stop', prompt_eval_count: 10, eval_count: 5, eval_duration: 1e8, total_duration: 2e8, ...extra } });
const schema = { type: 'object', required: ['correct'], properties: { correct: { type: 'boolean' }, feedback: { type: 'string' } }, additionalProperties: false };

(async () => {
  // 1. structured, think off, format = schema, all layers on the GPU
  let sent = mock(() => chatReply('{"correct": false, "feedback": "56"}'));
  let r = await ollama.structured({ system: 's', user: 'u', schema, schemaName: 'grade', models: [{ model: 'qwen3.5:4b', effort: 'off' }] });
  const call = sent.find((s) => s.url.endsWith('/api/chat'));
  check('structured answer validated', r && r.data && r.data.correct === false && r.tier === 'local');
  check('schema sent as format', call && JSON.stringify(call.body.format) === JSON.stringify(schema));
  check('effort off sends think:false', call && call.body.think === false);
  check('a model that fits the card gets every layer on the GPU', call && call.body.options.num_gpu === 999);
  check('$0 usage with tokens per second', r.usage.cost_usd === 0 && r.usage.tokens_per_second === 50);

  // 2. repair turn
  let n = 0;
  sent = mock(() => (++n === 1 ? chatReply('{"correct": "maybe"}') : chatReply('{"correct": true}')));
  r = await ollama.structured({ system: 's', user: 'u', schema, schemaName: 'grade', models: ['qwen3.5:4b'] });
  check('schema-invalid answer repaired by a second turn', r && r.repaired === true && r.data.correct === true && n === 2);

  // 3. no thinking mode: retried without think
  n = 0;
  sent = mock((route, body) => {
    n++;
    if ('think' in body && body.think === true) return { status: 400, json: { error: '"nothink:1b" does not support thinking' } };
    return chatReply('{"correct": true}');
  });
  r = await ollama.structured({ system: 's', user: 'u', schema, schemaName: 'grade', models: [{ model: 'nothink:1b', effort: 'high' }] });
  const retry = sent.filter((s) => s.url.endsWith('/api/chat')).pop();
  check('a model without thinking is retried without think', r && r.data.correct === true && retry && !('think' in retry.body));

  // 4. a model bigger than the card: automatic split (no num_gpu)
  sent = mock(() => chatReply('{"correct": true}'));
  const realFree = os.freemem;
  os.freemem = () => 64 * GB;
  r = await ollama.structured({ system: 's', user: 'u', schema, schemaName: 'grade', models: ['big:27b'] });
  const bigCall = sent.find((s) => s.url.endsWith('/api/chat'));
  check('a model bigger than the card is split automatically', r && bigCall && !('num_gpu' in bigCall.body.options));

  // 5. memory guard
  os.freemem = () => 2 * GB;
  sent = mock(() => chatReply('{"correct": true}'));
  let err = null;
  await ollama.structured({ system: 's', user: 'u', schema, schemaName: 'grade', models: ['big:27b'] }).catch((e) => { err = e; });
  check('memory guard refuses a model that would not fit free RAM', err && /not enough free RAM/.test(err.message) && !sent.some((s) => s.url.endsWith('/api/chat')));
  err = null;
  await ollama.structured({ system: 's', user: 'u', schema, schemaName: 'grade', models: ['huge:70b'] }).catch((e) => { err = e; });
  check('a model over OLLAMA_MAX_MODEL_GB is refused', err && /OLLAMA_MAX_MODEL_GB/.test(err.message));
  os.freemem = realFree;

  // 6. unsafe models refused, from config or from the caller
  sent = mock(() => chatReply('{"correct": true}'));
  err = null;
  await ollama.structured({ system: 's', user: 'u', schema, schemaName: 'grade', models: ['hf.co/someone/Model-8B-abliterated-GGUF:Q4_K_M'] }).catch((e) => { err = e; });
  check('abliterated model refused', err && !sent.some((s) => s.url.endsWith('/api/chat')));
  process.env.OLLAMA_TASK_X = 'gurubot/gpt-oss-derestricted:20b,qwen3.5:4b';
  check('derestricted model dropped from a configured plan', ollama.plan('fast', 'x').map((e) => e.model).join(',') === 'qwen3.5:4b');
  delete process.env.OLLAMA_TASK_X;

  // 7. gating
  mock(() => chatReply('{}'));
  await ollama.health();
  check('serves a "first" task', ollama.isEnabled('check', 'fact_claims') && ollama.takesFirst('fact_claims'));
  check('serves a "fallback" task, not first', ollama.isEnabled('fast', 'grade_free_response') && !ollama.takesFirst('grade_free_response'));
  check('does not serve an unmeasured task', !ollama.isEnabled('deep', 'lesson_write'));
  process.env.OLLAMA_FALLBACK_ALL = '1';
  check('OLLAMA_FALLBACK_ALL=1 serves every task', ollama.isEnabled('deep', 'lesson_write'));
  delete process.env.OLLAMA_FALLBACK_ALL;
  process.env.OLLAMA_ENABLED = '0';
  check('OLLAMA_ENABLED=0 turns it off', !ollama.isEnabled('check', 'fact_claims'));
  delete process.env.OLLAMA_ENABLED;

  fs.unlinkSync(lineupFile);
  console.log(failures ? `\n${failures} FAILED` : '\nall passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
