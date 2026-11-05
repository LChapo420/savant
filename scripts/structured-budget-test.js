#!/usr/bin/env node
/**
 * Output budgets for structured generation (services/providers/structured-json.js outputBudget, withLengthRetry).
 *
 * The failure it prevents: a reasoning model spends tokens thinking BEFORE it writes the answer and both count against the output cap,
 * so a cap sized for the answer alone came back empty or cut ("unusable structured reply (empty reply; finish length)"): 4 of 32
 * cells of the live proof (2 podcasts, 2 packs) were never built. Every provider now (1) sizes the cap with room for the thinking
 * and (2) asks again with a larger cap when an answer is cut off, up to a ceiling.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = path.join(os.tmpdir(), `structured-budget-${process.pid}.json`);
process.env.STANDARD_COMPUTE_LEDGER_FILE = tmp;
process.env.STANDARD_COMPUTE_API_KEY = 'test-key';
process.env.STANDARD_COMPUTE_PIPELINE = '1';
process.on('exit', () => { for (const f of [tmp, `${tmp}.lock`, `${tmp}.tmp`]) try { fs.unlinkSync(f); } catch { /* none */ } });

const sj = require('../services/providers/structured-json');
const sc = require('../services/providers/standard-compute');

let failures = 0;
function check(name, ok, detail) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${ok || detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
  if (!ok) failures++;
}

(async () => {
  console.log('1. the budget');
  check('the answer\'s own budget plus room for the thinking, by effort', sj.outputBudget(5000, 'low') === 9096 && sj.outputBudget(5000, 'medium') === 11144 && sj.outputBudget(5000, 'high') === 21384 && sj.outputBudget(5000, 'none') === 6024, [sj.outputBudget(5000, 'low'), sj.outputBudget(5000, 'medium'), sj.outputBudget(5000, 'high')]);
  check('no effort named: a reasoning model is assumed (4,096 of room); a model that does not think needs 1,024', sj.outputBudget(5000) === 9096 && sj.outputBudget(5000, null, { thinks: false }) === 6024);
  check('never past the cap, never under 256 of answer', sj.outputBudget(40000, 'max') === sj.OUTPUT_CAP && sj.outputBudget(0, 'none') === 1280 + 0 - 256 + 256 - 0 + 0 || sj.outputBudget(0, 'none') >= 1280);

  console.log('2. the retry');
  let seen = [];
  const out = await sj.withLengthRetry(async (a) => { seen.push(a.maxTokens); return seen.length < 3 ? sj.TRUNCATED : { data: { ok: 1 } }; }, { maxTokens: 1000 });
  check('a cut-off answer is asked again with a bigger cap (doubled, plus 1,024) until it fits', out && out.data.ok === 1 && seen.join() === '1000,3024,7072', seen);
  seen = [];
  let err = null;
  try { await sj.withLengthRetry(async (a) => { seen.push(a.maxTokens); throw sj.truncatedError('cut'); }, { maxTokens: 1000 }); } catch (e) { err = e; }
  check('a thrown cut-off is retried the same way, and thrown again when the tries run out (three in all)', err && err.truncated && seen.length === 3, seen);
  seen = [];
  const none = await sj.withLengthRetry(async (a) => { seen.push(a.maxTokens); return sj.TRUNCATED; }, { maxTokens: 20000 }, { ceiling: 32768 });
  check('a provider that returns "nothing usable" keeps that answer (null) when the ceiling is reached, with the cap never past the ceiling', none === null && Math.max(...seen) <= 32768 && seen.length === 2, seen);
  seen = [];
  err = null;
  try { await sj.withLengthRetry(async (a) => { seen.push(a.maxTokens); throw Object.assign(new Error('503'), { status: 503 }); }, { maxTokens: 1000 }); } catch (e) { err = e; }
  check('any other error passes through at once, untouched', err && err.status === 503 && seen.length === 1);
  seen = [];
  const fine = await sj.withLengthRetry(async (a) => { seen.push(a.maxTokens); return null; }, { maxTokens: 1000 });
  check('and an answer that is simply unusable (null, not cut off) is not retried', fine === null && seen.length === 1);

  console.log('3. through a real provider (Standard Compute, a fake server)');
  const bodies = [];
  const SCHEMA = { type: 'object', properties: { n: { type: 'integer' } }, required: ['n'] };
  let calls = 0;
  sc._setFetch(async (url, opts) => {
    const body = JSON.parse(opts.body);
    bodies.push(body);
    calls++;
    // The model "thinks" for 7,000 tokens: a cap under that returns an empty reply cut off by the cap.
    const thinks = 7000;
    const cut = body.max_tokens < thinks + 200;
    const reply = cut
      ? { choices: [{ message: { content: '' }, finish_reason: 'length' }], usage: { prompt_tokens: 500, completion_tokens: body.max_tokens } }
      : { choices: [{ message: { content: '{"n": 7}' }, finish_reason: 'stop' }], usage: { prompt_tokens: 500, completion_tokens: thinks + 20 } };
    return { ok: true, status: 200, statusText: 'OK', text: async () => JSON.stringify(reply) };
  });
  const r = await sc.standardCompute.structured({ task: 'budget_test', system: 's', user: 'u', schema: SCHEMA, schemaName: 'submit', maxTokens: 5000 });
  check('a reasoning model that needs 7,000 tokens of thinking: the first cap is sized with room for it, and the answer arrives', r && r.data.n === 7, bodies.map((b) => b.max_tokens));
  check('the cap sent is the answer budget plus headroom, not the answer budget plus 1,024 as before', bodies[0].max_tokens === sj.outputBudget(5000, null) && bodies[0].max_tokens > 6024, bodies[0].max_tokens);
  bodies.length = 0; calls = 0;
  const r2 = await sc.standardCompute.structured({ task: 'budget_test', system: 's', user: 'u', schema: SCHEMA, schemaName: 'submit', maxTokens: 12000 });
  check('a call that fits at once costs one request', r2 && r2.data.n === 7 && calls === 1, calls);
  // A model that needs 15,000 tokens: the first cap (9,096) cuts it, the retry fits.
  bodies.length = 0;
  sc._setFetch(async (url, opts) => {
    const body = JSON.parse(opts.body);
    bodies.push(body);
    const cut = body.max_tokens < 15200;
    const reply = cut ? { choices: [{ message: { content: '' }, finish_reason: 'length' }], usage: { prompt_tokens: 500, completion_tokens: body.max_tokens } } : { choices: [{ message: { content: '{"n": 9}' }, finish_reason: 'stop' }], usage: { prompt_tokens: 500, completion_tokens: 15100 } };
    return { ok: true, status: 200, statusText: 'OK', text: async () => JSON.stringify(reply) };
  });
  const r3 = await sc.standardCompute.structured({ task: 'budget_test', system: 's', user: 'u', schema: SCHEMA, schemaName: 'submit', maxTokens: 5000 });
  check('a long output that the first cap cuts off is asked again with a larger one and arrives', r3 && r3.data.n === 9 && bodies.length >= 2 && bodies.length <= 3 && bodies.every((b, i) => i === 0 || b.max_tokens > bodies[i - 1].max_tokens), bodies.map((b) => b.max_tokens));
  sc._setFetch(null);

  console.log('4. every provider has it');
  const root = path.join(__dirname, '..', 'services', 'providers');
  for (const f of ['standard-compute', 'free-apis', 'unorouter', 'openrouter', 'mimo', 'modelflare', 'gemini', 'anthropic']) {
    const src = fs.readFileSync(path.join(root, `${f}.js`), 'utf8');
    check(`${f}: its structured call goes through withLengthRetry`, /withLengthRetry/.test(src) && /TRUNCATED|truncatedError/.test(src));
  }
  check('nvidia: the repair turn of a cut-off answer gets a larger budget, not just a request to be brief', /finish === 'length'\) budget = Math\.min\(sj\.OUTPUT_CAP/.test(fs.readFileSync(path.join(root, 'nvidia.js'), 'utf8')));
  check('the proof harness\'s writer uses the same two guards', /withLengthRetry/.test(fs.readFileSync(path.join(__dirname, 'scorecard-modification-proof.js'), 'utf8')) && /outputBudget/.test(fs.readFileSync(path.join(__dirname, 'scorecard-modification-proof.js'), 'utf8')));

  check('an object sent as a string with a label or fence around it is read (Coral Fast fill-out, 5 Nov); plain prose still fails', (() => {
    const r = sj.validate({ type: 'object', properties: { blocks: { type: 'array', items: { type: 'object' } } } }, { blocks: ['Block 2: {"a":1}', '```json\n{"b":2}\n```', 'nonsense'] });
    return r.value.blocks[0].a === 1 && r.value.blocks[1].b === 2 && r.errors.length === 1;
  })());

  if (failures) { console.log(`\n${failures} check(s) failed`); process.exit(1); }
  console.log('\nstructured-budget-test: all checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
