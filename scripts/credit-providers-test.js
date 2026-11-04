#!/usr/bin/env node
/**
 * The Gonka broker ($50) and Grokified ($135) credit providers (services/providers/openai-credit.js, services/credit-ledger.js,
 * services/gonka-ledger.js, services/grokified-ledger.js, their pool slots). No network, no key, no spend: a stand-in `fetch`,
 * throwaway ledger files.   node scripts/credit-providers-test.js
 *
 * Proves, for each provider: the published prices, the hard cap (env may only lower it) and refusal before anything is sent,
 * settlement at the reported usage, answered errors cost $0 and network failures count at the reservation, the response_format
 * fallback, the learner gate (on / off / past the date) and the pipeline opt-in, base URL handling; and pool routing: Gonka
 * slots sort ahead of Munito, Grok only on judge and hard-writing tasks and last among the paid slots, learner requests only
 * with clearance inside the window, and the cost tracker prices.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'credit-test-'));
process.env.DB_FILE = path.join(tmp, 'db.json');
process.env.MUNITO_LEDGER_FILE = path.join(tmp, 'munito.json');
process.env.GONKA_LEDGER_FILE = path.join(tmp, 'gonka.json');
process.env.GROKIFIED_LEDGER_FILE = path.join(tmp, 'grok.json');
process.env.STANDARD_COMPUTE_LEDGER_FILE = path.join(tmp, 'sc.json');
process.env.ANTHROPIC_LEDGER_FILE = path.join(tmp, 'anth.json');
const ENVS = ['GONKA', 'GROKIFIED'].flatMap((p) => ['API_KEY', 'PIPELINE', 'LEARNER', 'LEARNER_UNTIL', 'CAP_USD', 'BASE_URL', 'MODEL'].map((s) => `${p}_${s}`))
  .concat(['MUNITO_PIPELINE', 'MUNITO_API_KEY', 'MUNITO_LEARNER', 'STANDARD_COMPUTE_PIPELINE', 'XKIRO_PIPELINE']);
for (const k of ENVS) delete process.env[k];

const pool = require('../services/pool');
const P = {
  gonka: { led: require('../services/gonka-ledger'), mod: require('../services/providers/gonka'), prov: null, cap: 50, model: 'deepseek-ai/DeepSeek-V4-Flash-0731', base: 'https://proxy.gonkabroker.com/v1', pre: 'GONKA' },
  grokified: { led: require('../services/grokified-ledger'), mod: require('../services/providers/grokified'), prov: null, cap: 135, model: 'grok-4.7', base: 'https://api.grokified.com/v1', pre: 'GROKIFIED' },
};
for (const [k, v] of Object.entries(P)) v.prov = v.mod[k];
const schema = { type: 'object', properties: { n: { type: 'number' } }, required: ['n'] };
let failed = 0;
async function check(name, fn) {
  try { await fn(); console.log(`ok   ${name}`); } catch (err) { failed += 1; console.log(`FAIL ${name}\n     ${String(err.stack).split('\n').slice(0, 4).join('\n     ')}`); }
}
const near = (a, b) => Math.abs(a - b) < 1e-9;
const seen = [];
let fetched = 0;
function mockFetch(v, { inTok = 100, outTok = 100, content = '{"n":1}', status = 200, fail = false, errMsg = 'boom' } = {}) {
  v.mod._setFetch(async (url, init) => {
    fetched += 1;
    const body = JSON.parse(init.body);
    seen.push({ url, auth: init.headers.Authorization, body });
    if (fail) throw new Error('ECONNRESET');
    const st = typeof status === 'function' ? status(body) : status;
    const text = st === 200
      ? JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }], usage: { prompt_tokens: inTok, completion_tokens: outTok } })
      : JSON.stringify({ error: { message: errMsg } });
    return { ok: st === 200, status: st, statusText: st === 200 ? 'OK' : 'ERR', text: async () => text };
  });
}
const reset = (v) => { try { fs.unlinkSync(process.env[`${v.pre}_LEDGER_FILE`]); } catch { /* none */ } };
const clean = (v) => { v.mod._setFetch(null); for (const s of ['API_KEY', 'PIPELINE', 'LEARNER', 'LEARNER_UNTIL', 'CAP_USD', 'BASE_URL']) delete process.env[`${v.pre}_${s}`]; delete process.env.MUNITO_PIPELINE; };
const optIn = (v) => { process.env[`${v.pre}_API_KEY`] = 'test-key-not-real'; process.env[`${v.pre}_PIPELINE`] = '1'; };

(async () => {
  for (const [name, v] of Object.entries(P)) {
    const led = v.led;
    await check(`${name}: prices, unknown model above every row, $${v.cap} cap, env only lowers, starts at $0`, () => {
      for (const [m, p] of Object.entries(led.PRICES)) assert.ok(led.priceOf(m) === p);
      const unk = led.priceOf('nobody/unknown');
      assert.ok(Object.values(led.PRICES).every((p) => unk.input >= p.input && unk.output >= p.output));
      reset(v);
      assert.ok(led.status().spent_usd === 0 && led.status().cap_usd === v.cap);
      process.env[`${v.pre}_CAP_USD`] = '1'; assert.strictEqual(led.status().cap_usd, 1);
      process.env[`${v.pre}_CAP_USD`] = '9999'; assert.strictEqual(led.status().cap_usd, v.cap);
      delete process.env[`${v.pre}_CAP_USD`];
    });
    await check(`${name}: published prices`, () => {
      if (name === 'gonka') {
        assert.ok(near(led.priceOf('zai-org/GLM-5.3-Flash').output, 0.1) && near(led.priceOf('deepseek-ai/DeepSeek-V4-Flash-0731').input, 0.1) && near(led.priceOf('MiniMaxAI/MiniMax-M2.7').input, 0.12));
      } else {
        assert.ok(near(led.priceOf('grok-4.7').input, 1) && near(led.priceOf('grok-4.7').output, 3) && near(led.priceOf('grok-4.3').output, 1.25) && near(led.priceOf('grok-build-0.1').input, 0.5) && near(led.priceOf('grok-build-0.1').output, 1));
        assert.ok(Object.keys(led.PRICES).every((m) => /^grok-/.test(m)), 'only Grok text models');
        // the ~1,250-token overhead is reserved: an empty prompt still reserves it
        assert.ok(near(led.estimate({ model: 'grok-4.7', inputChars: 0, maxTokens: 0 }), 1250 * 1 / 1e6));
      }
    });
    await check(`${name}: refuses past the cap before sending anything; a call settles at the reported usage`, async () => {
      reset(v); optIn(v); fetched = 0; seen.length = 0; mockFetch(v, { inTok: 1000, outTok: 500 });
      process.env[`${v.pre}_CAP_USD`] = '0.00001';
      await assert.rejects(() => v.prov.structured({ system: 's', user: 'u', schema, maxTokens: 500 }), (e) => e.code === 'LEDGER_STOP' && e.status === 402 && !/test-key-not-real/.test(e.message));
      assert.strictEqual(fetched, 0);
      assert.ok(led.status().refused_calls >= 1);
      delete process.env[`${v.pre}_CAP_USD`];
      const r = await v.prov.structured({ system: 's', user: 'u', schema, maxTokens: 500 });
      assert.strictEqual(r.data.n, 1);
      assert.ok(near(led.status().spent_usd, led.costOf(v.model, { input_tokens: 1000, output_tokens: 500 })));
      assert.strictEqual(seen[0].url, `${v.base}/chat/completions`);
      assert.strictEqual(seen[0].auth, 'Bearer test-key-not-real');
      assert.strictEqual(seen[0].body.model, v.model);
      assert.strictEqual(led.status().reserved_usd, 0);
      clean(v);
    });
    await check(`${name}: answered error is $0, network failure counts at its reservation`, async () => {
      reset(v); optIn(v); mockFetch(v, { status: 500 });
      await assert.rejects(() => v.prov.chat({ messages: [{ role: 'user', content: 'x' }] }), (e) => e.status === 500 && !/test-key-not-real/.test(e.message));
      assert.ok(near(led.status().spent_usd, 0));
      mockFetch(v, { fail: true });
      await assert.rejects(() => v.prov.chat({ messages: [{ role: 'user', content: 'x' }] }));
      assert.ok(led.status().spent_usd > 0 && led.status().reserved_usd === 0);
      clean(v);
    });
    await check(`${name}: response_format refused once, then the call is retried without it and remembered`, async () => {
      reset(v); optIn(v); seen.length = 0;
      mockFetch(v, { status: (b) => (b.response_format ? 400 : 200), errMsg: 'response_format json_object is not supported' });
      const r = await v.prov.structured({ system: 's', user: 'u', schema, maxTokens: 300, model: `${v.model}` });
      assert.strictEqual(r.data.n, 1);
      assert.ok(seen.length === 2 && seen[0].body.response_format && !seen[1].body.response_format);
      await v.prov.structured({ system: 's', user: 'u', schema, maxTokens: 300 });
      assert.ok(seen.length === 3 && !seen[2].body.response_format, 'remembered');
      clean(v);
    });
    await check(`${name}: learner window — on by default before 2026-11-14, off after the date or with LEARNER=off; else pipeline opt-in only`, async () => {
      reset(v); fetched = 0; mockFetch(v);
      process.env[`${v.pre}_API_KEY`] = 'test-key-not-real';
      assert.ok(v.mod.learnerOn(Date.parse('2026-11-13T00:00:00Z')) && !v.mod.learnerOn(Date.parse('2026-11-14T06:00:01Z')));
      process.env[`${v.pre}_LEARNER_UNTIL`] = '2020-01-01T00:00:00Z';
      assert.ok(!v.prov.isEnabled());
      await assert.rejects(() => v.prov.chat({ messages: [{ role: 'user', content: 'x' }] }), (e) => e.status === 403);
      assert.strictEqual(fetched, 0);
      process.env[`${v.pre}_PIPELINE`] = '1'; assert.ok(v.prov.isEnabled(), 'pipeline opt-in still works past the date');
      delete process.env[`${v.pre}_PIPELINE`];
      process.env[`${v.pre}_LEARNER_UNTIL`] = '2099-01-01T00:00:00Z';
      assert.ok(v.prov.isEnabled());
      process.env[`${v.pre}_LEARNER`] = 'off'; assert.ok(!v.prov.isEnabled());
      clean(v);
      assert.ok(!v.prov.isConfigured());
    });
    await check(`${name}: base URL forms`, () => {
      for (const x of ['https://a.test', 'https://a.test/', 'https://a.test/v1', 'https://a.test/v1/', 'https://a.test/v1/chat/completions']) assert.strictEqual(v.mod.baseUrl(x), 'https://a.test/v1', x);
      assert.strictEqual(v.mod.baseUrl(''), v.base);
    });
  }

  const providers = require('../services/providers');
  const withChain = (fn) => {
    pool._reset();
    const saved = { ...providers.ALL };
    providers.ALL.nvidia = { name: 'nvidia', isEnabled: () => true, isConfigured: () => true, modelFor: () => 'm', costCents: () => 0, structured: async () => ({ data: {}, model: 'm' }), chat: async () => ({ text: 't', model: 'm' }) };
    try { return fn([providers.ALL.nvidia]); } finally { Object.assign(providers.ALL, saved); pool._reset(); }
  };
  const GL = 'gonka:zai-org/GLM-5.3-Flash';
  const GD = 'gonka:deepseek-ai/DeepSeek-V4-Flash-0731';
  const GK = 'grokified:grok-4.7';
  const GJ = 'grokified:grok-4.3';
  const MD = 'munito:deepseek-ai/deepseek-v4.1-flash-1017';

  await check('pool: the three new slots exist, are paid and pipeline-class, with their families', () => withChain(() => {
    const slots = pool.extraSlots().filter((s) => /^(gonka|grokified):/.test(s.id));
    assert.deepStrictEqual(slots.map((s) => s.id).sort(), [GL, GD, GK, GJ].sort());
    assert.ok(slots.every((s) => s.paid && s.dataClass === 'pipeline'));
    assert.deepStrictEqual(Object.fromEntries(slots.map((s) => [s.id, s.family])), { [GL]: 'glm', [GD]: 'deepseek', [GK]: 'grok', [GJ]: 'grok' });
  }));

  await check('pool: pipeline requests list Gonka ahead of Munito, Grok after every other paid slot, only for judge and hard-writing tasks', () => withChain((chain) => {
    const ids = (task) => pool.candidatesFor({ role: 'blocks', task, kind: 'structured', dataClass: 'pipeline' }, { chain }).map((s) => s.id);
    for (const task of ['lesson_write', 'night_write', 'block_fill', 'block_layout', 'level_editor', 'material_pack', 'author_items', 'game_questions', 'night_judge', 'material_verify']) {
      const l = ids(task).filter((i) => !/^(lyceum|crouton):/.test(i)); // Lyceum's strong slots sort by price among the paid ones (lyceum-crouton-test)
      const gk = /judge|verify/.test(task) ? GJ : GK; // judges get grok-4.3, hard writing grok-4.7
      assert.ok(l.includes(GD) && l.includes(GL) && l.includes(gk) && (gk === GJ ? !l.includes(GK) : !l.includes(GJ)), `${task}: ${l}`);
      assert.ok(l.indexOf(GD) < l.indexOf(MD) && l.indexOf(GL) < l.indexOf(MD), `${task}: Gonka ahead of Munito`);
      assert.strictEqual(l.indexOf(gk), l.length - 1, `${task}: Grok last`);
    }
    for (const task of ['fact_read', 'fact_verify', 'fact_repair', 'fact_claims', 'blind_mc', 'placement_unit_judge', 'placement_key_judge']) assert.ok(ids(task).includes(GJ) && !ids(task).includes(GK), `${task}: grok-4.3 judges`);
    assert.ok(ids('fact_verify').every((i) => !/^(gonka|munito|standard_compute):/.test(i)), 'fact checks get no cheap writer slot');
    for (const task of ['analyze_session', 'regen_items', 'personalize_read', 'essay_prompt']) { const l = ids(task); assert.ok(l.includes(GD) && !l.includes(GK) && !l.includes(GJ), `${task}: Gonka DeepSeek yes, Grok no`); }
    for (const task of ['essay_grade', 'diagnose', 'grade_free_response']) assert.ok(ids(task).every((i) => !/^(gonka|grokified):/.test(i)), `${task}: neither`);
  }));

  await check('pool: learner requests — cleared inside the window only; child/uncleared, LEARNER=off and the date cut-off keep them off', () => withChain((chain) => {
    const ids = (req) => pool.candidatesFor({ role: 'blocks', task: 'block_fill', kind: 'structured', userId: 'u1', ...req }, { chain }).map((x) => x.id);
    for (const [name, v] of Object.entries(P)) { process.env[`${v.pre}_API_KEY`] = 'test-key-not-real'; delete process.env[`${v.pre}_PIPELINE`]; process.env[`${v.pre}_LEARNER`] = 'on'; process.env[`${v.pre}_LEARNER_UNTIL`] = '2099-01-01T00:00:00Z'; }
    try {
      const on = ids({ munito: true });
      assert.ok(on.includes(GD) && on.includes(GK) && !on.includes(GJ), `cleared learner: ${on}`);
      assert.ok(ids({ munito: true, task: "night_judge" }).includes(GJ), "cleared learner, judge task: grok-4.3");
      assert.ok(ids({ munito: false }).every((i) => !/^(gonka|grokified):/.test(i)), 'no consent clearance: never');
      assert.ok(ids({}).every((i) => !/^(gonka|grokified):/.test(i)), 'no flag: never');
      process.env.GONKA_LEARNER = 'off';
      assert.ok(ids({ munito: true }).every((i) => !i.startsWith('gonka:')) && ids({ munito: true }).includes(GK), 'each provider has its own switch');
      process.env.GROKIFIED_LEARNER_UNTIL = '2020-01-01T00:00:00Z';
      assert.ok(ids({ munito: true }).every((i) => !/^(gonka|grokified):/.test(i)), 'past the date: off');
    } finally { for (const v of Object.values(P)) clean(v); }
  }));

  await check('pool end to end: a pipeline request on each new slot reaches its API with the slot\'s model and settles in its own ledger', async () => {
    pool._reset();
    for (const [name, slotId, v] of [['gonka', GD, P.gonka], ['grokified', GK, P.grokified]]) {
      reset(v); optIn(v); seen.length = 0; mockFetch(v, { inTok: 50, outTok: 20 });
      try {
        const slot = pool.extraSlots().find((s) => s.id === slotId);
        const r = await pool.callHedged({ kind: 'structured', role: 'blocks', task: 'block_fill', dataClass: 'pipeline', system: 's', user: 'u', schema, maxTokens: 500 }, { slots: [slot], timeoutMs: 5000 });
        assert.ok(r && r.data && r.data.n === 1, `${name}: got the answer`);
        assert.strictEqual(seen[0].body.model, v.model);
        assert.ok(v.led.status().calls === 1 && v.led.status().spent_usd > 0);
        assert.ok(JSON.parse(fs.readFileSync(process.env[`${v.pre}_LEDGER_FILE`], 'utf8')).by_model[v.model]);
      } finally { clean(v); pool._reset(); }
    }
  });

  await check('cost tracker prices the new models from their ledgers', () => {
    const ct = require('../services/cost-tracker');
    const g = ct.listPriceOf('zai-org/GLM-5.3-Flash');
    assert.ok(near(g.in, 0.1) && /gonka-ledger/.test(g.src), JSON.stringify(g));
    const k = ct.listPriceOf('grok-4.7');
    assert.ok(near(k.out, 3) && /grokified-ledger/.test(k.src), JSON.stringify(k));
  });

  console.log(failed ? `${failed} FAILED` : 'credit providers: all checks passed');
  process.exit(failed ? 1 : 0);
})();
