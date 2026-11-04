#!/usr/bin/env node
/**
 * Munito (services/providers/munito.js, services/munito-ledger.js, its pool slots). No network, no key, no spend:
 * a stand-in `fetch`, throwaway ledger files.
 *
 *   node scripts/munito-ledger-test.js
 *
 * Proves: list prices; the $100 hard cap (the env may only lower it) and refusal before anything is sent; settlement
 * at the reported usage; the pipeline-only gate; base URL handling; pool routing (learner requests never reach a Munito
 * slot; pipeline requests prefer Munito over Standard Compute); the cost tracker's price for Munito models.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'munito-test-'));
process.env.DB_FILE = path.join(tmp, 'db.json');
process.env.MUNITO_LEDGER_FILE = path.join(tmp, 'munito-ledger.json');
process.env.STANDARD_COMPUTE_LEDGER_FILE = path.join(tmp, 'sc.json');
process.env.ANTHROPIC_LEDGER_FILE = path.join(tmp, 'anth.json');
for (const k of ['MUNITO_PIPELINE', 'MUNITO_API_KEY', 'MUNITO_CAP_USD', 'MUNITO_BASE_URL', 'MUNITO_MODEL', 'STANDARD_COMPUTE_PIPELINE', 'XKIRO_PIPELINE']) delete process.env[k];

const led = require('../services/munito-ledger');
const mu = require('../services/providers/munito');
const pool = require('../services/pool');

const DS = 'deepseek-ai/deepseek-v4.1-flash-1017';
const GLM = 'zai-org/glm-5.3-flash';
const schema = { type: 'object', properties: { n: { type: 'number' } }, required: ['n'] };
let failed = 0;
async function check(name, fn) {
  try { await fn(); console.log(`ok   ${name}`); } catch (err) { failed += 1; console.log(`FAIL ${name}\n     ${String(err.stack).split('\n').slice(0, 4).join('\n     ')}`); }
}
const near = (a, b) => Math.abs(a - b) < 1e-9;
const resetLedger = () => { try { fs.unlinkSync(process.env.MUNITO_LEDGER_FILE); } catch { /* none yet */ } };

const seen = [];
let fetched = 0;
function mockFetch({ inTok = 100, outTok = 100, content = '{"n":1}', status = 200, fail = false } = {}) {
  mu._setFetch(async (url, init) => {
    fetched += 1;
    seen.push({ url, auth: init.headers.Authorization, body: JSON.parse(init.body) });
    if (fail) throw new Error('ECONNRESET');
    const body = status === 200
      ? JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }], usage: { prompt_tokens: inTok, completion_tokens: outTok } })
      : JSON.stringify({ error: { message: 'boom' } });
    return { ok: status === 200, status, statusText: status === 200 ? 'OK' : 'ERR', text: async () => body };
  });
}
const optIn = () => { process.env.MUNITO_API_KEY = 'test-key-not-real'; process.env.MUNITO_PIPELINE = '1'; };
const cleanEnv = () => { mu._setFetch(null); for (const k of ['MUNITO_API_KEY', 'MUNITO_PIPELINE', 'MUNITO_CAP_USD', 'MUNITO_BASE_URL']) delete process.env[k]; };

(async () => {
  await check('prices: the list, an unknown model priced above every listed one, no env override, $100 cap, starts at $0', () => {
    const want = { [DS]: [0.27, 1.0], [GLM]: [0.13, 0.45], 'deepseek-ai/deepseek-v4-flash': [0.099, 0.25], 'qwen/qwen3.8-27b': [0.18, 2.4], 'aleph-alpha/kolibri-1': [0.13, 0.51], 'blockbrain/cygnet': [0.05, 0.15], 'google/gemma-4-12b': [1.0, 0.15], 'perplexity-ai/pplx-decider-v1.2': [0.018, 0] };
    for (const [m, [i, o]] of Object.entries(want)) { const p = led.priceOf(m); assert.ok(near(p.input, i) && near(p.output, o), m); }
    const unk = led.priceOf('nobody/unknown');
    assert.ok(Object.values(led.PRICES).every((p) => unk.input >= p.input && unk.output >= p.output));
    assert.ok(near(led.costOf(DS, { input_tokens: 1e6, output_tokens: 1e6 }), 1.27));
    process.env.MUNITO_PRICE_IN = '0.0001'; process.env.MUNITO_PRICE_OUT = '0.0001';
    assert.ok(near(led.priceOf(DS).input, 0.27), 'an env price cannot lower a price');
    delete process.env.MUNITO_PRICE_IN; delete process.env.MUNITO_PRICE_OUT;
    assert.strictEqual(led.CAP_USD, 100);
    resetLedger();
    const s = led.status();
    assert.ok(s.ok && s.spent_usd === 0 && s.cap_usd === 100);
  });

  await check('cap: the env only lowers it; a refused call sends nothing; committed never passes the cap', async () => {
    resetLedger(); optIn(); fetched = 0; mockFetch({ inTok: 1000, outTok: 1000 });
    process.env.MUNITO_CAP_USD = '500';
    assert.strictEqual(led.status().cap_usd, 100, 'cannot be raised');
    process.env.MUNITO_CAP_USD = '0.001';
    await assert.rejects(() => mu.munito.structured({ system: 's', user: 'u', schema, maxTokens: 5000 }), (e) => e.code === 'LEDGER_STOP' && e.status === 402);
    assert.strictEqual(fetched, 0, 'nothing sent');
    assert.ok(led.status().refused_calls >= 1);
    process.env.MUNITO_CAP_USD = '0.01';
    let ok = 0; let refused = 0;
    for (let i = 0; i < 50; i += 1) {
      try { await mu.munito.structured({ system: 's', user: 'u', schema, maxTokens: 200 }); ok += 1; } catch (e) { assert.strictEqual(e.code, 'LEDGER_STOP'); refused += 1; }
      assert.ok(led.status().committed_usd <= 0.01 + 1e-9);
    }
    const st = led.status();
    assert.ok(ok >= 1 && refused >= 1, `ok ${ok} refused ${refused}`);
    assert.strictEqual(fetched, st.calls, 'every request sent was settled');
    assert.strictEqual(st.reserved_usd, 0);
    cleanEnv();
  });

  await check('settlement: usage priced at the list price, model and URL passed on, errors $0, network failure at the reservation', async () => {
    resetLedger(); optIn(); seen.length = 0;
    mockFetch({ inTok: 1000, outTok: 2000 });
    const r = await mu.munito.structured({ system: 's', user: 'u', schema, maxTokens: 500, model: GLM });
    const want = (1000 * 0.13 + 2000 * 0.45) / 1e6;
    assert.ok(near(r.usage.cost_usd, want));
    assert.ok(near(led.status().spent_usd, want));
    assert.strictEqual(seen[0].body.model, GLM);
    assert.strictEqual(seen[0].url, 'https://api.munito.ai/inference/v1/chat/completions');
    assert.strictEqual(seen[0].auth, 'Bearer test-key-not-real');
    const before = led.status().spent_usd;
    mockFetch({ status: 500 });
    await assert.rejects(() => mu.munito.structured({ system: 's', user: 'u', schema, maxTokens: 500 }), (e) => e.status === 500 && !/test-key-not-real/.test(e.message));
    assert.ok(near(led.status().spent_usd, before), 'an answered error is $0');
    mockFetch({ fail: true });
    await assert.rejects(() => mu.munito.structured({ system: 's', user: 'u', schema, maxTokens: 500 }));
    assert.ok(led.status().spent_usd > before, 'a network failure counts at its reservation');
    assert.strictEqual(led.status().reserved_usd, 0);
    cleanEnv();
  });

  await check('chat returns text, cost and tier', async () => {
    resetLedger(); optIn(); mockFetch({ inTok: 10, outTok: 5, content: 'hello' });
    const r = await mu.munito.chat({ system: 's', messages: [{ role: 'user', content: 'hi' }], model: GLM });
    assert.ok(r.text === 'hello' && r.tier === 'munito' && r.usage.cost_usd > 0);
    cleanEnv();
  });

  await check('pipeline gate: no opt-in or no key sends nothing', async () => {
    resetLedger(); fetched = 0; mockFetch();
    process.env.MUNITO_API_KEY = 'test-key-not-real';
    await assert.rejects(() => mu.munito.structured({ system: 's', user: 'u', schema }), (e) => e.status === 403);
    await assert.rejects(() => mu.munito.chat({ messages: [{ role: 'user', content: 'x' }] }), (e) => e.status === 403);
    assert.strictEqual(fetched, 0);
    assert.ok(!mu.munito.isEnabled(), 'not enabled without the opt-in');
    cleanEnv();
    assert.ok(!mu.munito.isConfigured());
  });

  await check('base URL: host only, with /inference/v1, with a trailing slash, with the full chat path, and the default', () => {
    for (const v of ['https://a.test', 'https://a.test/', 'https://a.test/inference/v1', 'https://a.test/inference/v1/', 'https://a.test/inference/v1/chat/completions']) assert.strictEqual(mu.baseUrl(v), 'https://a.test/inference/v1', v);
    assert.strictEqual(mu.baseUrl(''), 'https://api.munito.ai/inference/v1');
    assert.strictEqual(mu.baseUrl('not a url'), 'https://api.munito.ai/inference/v1');
  });

  await check('pool: Munito slots exist, are paid and pipeline-class; learner requests never reach them', () => {
    pool._reset();
    const providers = require('../services/providers');
    const saved = { ...providers.ALL };
    providers.ALL.nvidia = { name: 'nvidia', isEnabled: () => true, isConfigured: () => true, modelFor: () => 'm', costCents: () => 0, structured: async () => ({ data: {}, model: 'm' }), chat: async () => ({ text: 't', model: 'm' }) };
    try {
      const slots = pool.extraSlots().filter((s) => s.id.startsWith('munito:'));
      assert.deepStrictEqual(slots.map((s) => s.id).sort(), [`munito:${GLM}`, `munito:${DS}`].sort());
      assert.ok(slots.every((s) => s.paid && s.dataClass === 'pipeline'));
      const chain = [providers.ALL.nvidia];
      const ids = (req) => pool.candidatesFor(req, { chain }).map((s) => s.id);
      const base = { role: 'blocks', task: 'lesson_write', kind: 'structured' };
      for (const req of [{ ...base, userId: 'u1' }, { ...base, dataClass: 'pipeline', userId: 'u1' }, { ...base }, { ...base, dataClass: 'pipeline', outside: false }]) {
        assert.ok(ids(req).every((i) => !i.startsWith('munito:')), `no Munito slot: ${ids(req)}`);
      }
      assert.ok(ids({ role: 'fast', task: 'coach_turn', kind: 'structured', dataClass: 'pipeline' }).every((i) => !i.startsWith('munito:')), 'not for the coach');
    } finally { Object.assign(providers.ALL, saved); pool._reset(); }
  });

  await check('pool: with learner use on, a cleared learner may reach Munito; a child, an uncleared learner or learner use off may not', () => {
    pool._reset();
    const providers = require('../services/providers');
    const saved = { ...providers.ALL };
    const savedEnv = process.env.MUNITO_LEARNER;
    providers.ALL.nvidia = { name: 'nvidia', isEnabled: () => true, isConfigured: () => true, modelFor: () => 'm', costCents: () => 0, structured: async () => ({ data: {}, model: 'm' }), chat: async () => ({ text: 't', model: 'm' }) };
    try {
      const chain = [providers.ALL.nvidia];
      const ids = (req) => pool.candidatesFor(req, { chain }).map((x) => x.id);
      const base = { role: 'blocks', task: 'block_fill', kind: 'structured', userId: 'u1' };
      process.env.MUNITO_API_KEY = 'test-key-not-real'; delete process.env.MUNITO_PIPELINE; // learner use, not the pipeline opt-in
      process.env.MUNITO_LEARNER = 'on';
      assert.ok(ids({ ...base, munito: true }).includes(`munito:${DS}`), `cleared learner: ${ids({ ...base, munito: true })}`);
      assert.ok(ids({ ...base, munito: false }).every((i) => !i.startsWith('munito:')), 'an under-13 or no-consent learner never reaches Munito');
      assert.ok(ids({ ...base }).every((i) => !i.startsWith('munito:')), 'no clearance flag means no Munito');
      process.env.MUNITO_LEARNER = 'off';
      assert.ok(ids({ ...base, munito: true }).every((i) => !i.startsWith('munito:')), 'MUNITO_LEARNER=off keeps learners off it');
    } finally { process.env.MUNITO_LEARNER = savedEnv; delete process.env.MUNITO_API_KEY; Object.assign(providers.ALL, saved); pool._reset(); }
  });

  await check('pool: pipeline requests prefer Munito over Standard Compute; Munito GLM is listed beside Munito DeepSeek', () => {
    pool._reset();
    const providers = require('../services/providers');
    const saved = { ...providers.ALL };
    providers.ALL.nvidia = { name: 'nvidia', isEnabled: () => true, isConfigured: () => true, modelFor: () => 'm', costCents: () => 0, structured: async () => ({ data: {}, model: 'm' }), chat: async () => ({ text: 't', model: 'm' }) };
    try {
      const chain = [providers.ALL.nvidia];
      for (const task of ['lesson_write', 'night_write', 'night_judge', 'block_fill', 'block_layout', 'game_questions', 'author_items']) {
        const ids = pool.candidatesFor({ role: 'blocks', task, kind: 'structured', dataClass: 'pipeline' }, { chain }).map((s) => s.id);
        const m = ids.indexOf(`munito:${DS}`); const s = ids.findIndex((i) => i.startsWith('standard_compute:'));
        assert.ok(m >= 0 && s >= 0 && m < s, `${task}: ${ids}`);
        assert.ok(ids.includes(`munito:${GLM}`), `${task}: GLM listed`);
      }
    } finally { Object.assign(providers.ALL, saved); pool._reset(); }
  });

  await check('pool end to end: a pipeline request on the Munito slot reaches the API with the slot\'s model and settles in the ledger', async () => {
    resetLedger(); optIn(); seen.length = 0; mockFetch({ inTok: 50, outTok: 20 });
    pool._reset();
    try {
      const slot = pool.extraSlots().find((s) => s.id === `munito:${DS}`);
      const r = await pool.callHedged({ kind: 'structured', role: 'blocks', task: 'lesson_write', dataClass: 'pipeline', system: 's', user: 'u', schema, maxTokens: 500 }, { slots: [slot], timeoutMs: 5000 });
      assert.ok(r && r.data && r.data.n === 1, 'got the answer');
      assert.strictEqual(seen[0].body.model, DS);
      assert.ok(led.status().calls === 1 && led.status().spent_usd > 0);
      assert.ok(JSON.parse(fs.readFileSync(process.env.MUNITO_LEDGER_FILE, 'utf8')).by_model[DS]);
    } finally { cleanEnv(); pool._reset(); }
  });

  await check('cost tracker prices Munito models from the ledger', () => {
    const ct = require('../services/cost-tracker');
    const p = ct.listPriceOf(GLM);
    assert.ok(near(p.in, 0.13) && near(p.out, 0.45) && p.src === 'munito-ledger PRICES', JSON.stringify(p));
    assert.ok(near(ct.listPriceOf(DS).out, 1.0));
  });

  cleanEnv();
  console.log(failed ? `${failed} FAILED` : 'munito: all checks passed');
  process.exit(failed ? 1 : 0);
})();
