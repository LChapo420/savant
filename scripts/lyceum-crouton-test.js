#!/usr/bin/env node
/**
 * Lyceum ($250 cap) and Crouton Alpha (OpenRouter free, 950 requests per UTC day) providers: services/lyceum-ledger.js, services/crouton-ledger.js,
 * services/providers/{lyceum,crouton}.js and their pool slots. No network, no key, no spend: a stand-in `fetch`, throwaway ledger files.
 *   node scripts/lyceum-crouton-test.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lyc-test-'));
process.env.DB_FILE = path.join(tmp, 'db.json');
process.env.LYCEUM_LEDGER_FILE = path.join(tmp, 'lyceum.json');
process.env.CROUTON_COUNTER_FILE = path.join(tmp, 'crouton.json');
process.env.MUNITO_LEDGER_FILE = path.join(tmp, 'munito.json');
process.env.STANDARD_COMPUTE_LEDGER_FILE = path.join(tmp, 'sc.json');
process.env.ANTHROPIC_LEDGER_FILE = path.join(tmp, 'anth.json');
for (const k of ['LYCEUM_API_KEY', 'LYCEUM_PIPELINE', 'LYCEUM_LEARNER', 'LYCEUM_LEARNER_UNTIL', 'LYCEUM_CAP_USD', 'LYCEUM_BASE_URL', 'CROUTON_PIPELINE', 'CROUTON_DAILY_MAX', 'CROUTON_LEARNER', 'OPENROUTER_API_KEY', 'MUNITO_PIPELINE', 'XKIRO_PIPELINE']) delete process.env[k];

const pool = require('../services/pool');
const lled = require('../services/lyceum-ledger');
const cled = require('../services/crouton-ledger');
const lyc = require('../services/providers/lyceum');
const cro = require('../services/providers/crouton');
const schema = { type: 'object', properties: { n: { type: 'number' } }, required: ['n'] };
let failed = 0;
async function check(name, fn) {
  try { await fn(); console.log(`ok   ${name}`); } catch (err) { failed += 1; console.log(`FAIL ${name}\n     ${String(err.stack).split('\n').slice(0, 4).join('\n     ')}`); }
}
const seen = [];
function mock(mod, { inTok = 100, outTok = 100, content = '{"n":1}', status = 200 } = {}) {
  mod._setFetch(async (url, init) => {
    const body = JSON.parse(init.body);
    seen.push({ url, auth: init.headers.Authorization, body });
    const st = typeof status === 'function' ? status(body) : status;
    const text = st === 200 ? JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }], usage: { prompt_tokens: inTok, completion_tokens: outTok } }) : JSON.stringify({ error: { message: 'nope' } });
    return { ok: st === 200, status: st, statusText: 'x', text: async () => text };
  });
}
const rm = (f) => { try { fs.unlinkSync(f); } catch (e) { /* none */ } };
const lycReset = () => { rm(process.env.LYCEUM_LEDGER_FILE); for (const k of ['LYCEUM_PIPELINE', 'LYCEUM_LEARNER', 'LYCEUM_LEARNER_UNTIL', 'LYCEUM_CAP_USD']) delete process.env[k]; lyc._setFetch(null); process.env.LYCEUM_API_KEY = 'test-key-not-real'; };
const croReset = () => { rm(process.env.CROUTON_COUNTER_FILE); for (const k of ['CROUTON_PIPELINE', 'CROUTON_DAILY_MAX', 'MUNITO_PIPELINE']) delete process.env[k]; cro._setFetch(null); process.env.OPENROUTER_API_KEY = 'test-key-not-real'; };
const args = { system: 's', user: 'u', schema, maxTokens: 500 };
const msg = { messages: [{ role: 'user', content: 'x' }] };
const today = () => new Date().toISOString().slice(0, 10);

(async () => {
  await check('lyceum: prices from the pricing page, unknown model above every row, $250 cap that the env may only lower', () => {
    lycReset();
    assert.deepStrictEqual(lled.priceOf('moonshotai/kimi-k3'), { input: 3, output: 15 });
    assert.deepStrictEqual(lled.priceOf('z-ai/glm-5.3-flash'), { input: 0.2, output: 0.5 });
    assert.deepStrictEqual(lled.priceOf('deepseek/deepseek-v4-pro-0813'), { input: 2, output: 4 });
    assert.deepStrictEqual(lled.priceOf('moonshotai/kimi-k3-instant'), { input: 3, output: 15 });
    assert.deepStrictEqual(lled.priceOf('deepseek/deepseek-v4-flash'), { input: 0.25, output: 0.3 });
    const unk = lled.priceOf('nobody/unknown');
    assert.ok(Object.values(lled.PRICES).every((p) => unk.input >= p.input && unk.output >= p.output));
    assert.strictEqual(lled.status().cap_usd, 250);
    process.env.LYCEUM_CAP_USD = '1'; assert.strictEqual(lled.status().cap_usd, 1);
    process.env.LYCEUM_CAP_USD = '500'; assert.strictEqual(lled.status().cap_usd, 250);
  });

  await check('lyceum: settles at the reported usage; a refusal past the cap sends nothing; answered errors cost $0', async () => {
    lycReset(); process.env.LYCEUM_PIPELINE = '1'; seen.length = 0;
    mock(lyc, { inTok: 1000, outTok: 500 });
    const r = await lyc.lyceum.structured({ ...args, model: 'moonshotai/kimi-k3' });
    assert.strictEqual(r.data.n, 1);
    assert.strictEqual(seen[0].body.model, 'moonshotai/kimi-k3');
    assert.ok(seen[0].url.startsWith('https://api.lyceum.technology/openai/v1/') && seen[0].auth === 'Bearer test-key-not-real');
    assert.ok(Math.abs(lled.status().spent_usd - (1000 * 3 + 500 * 15) / 1e6) < 1e-9);
    process.env.LYCEUM_CAP_USD = '0.0001'; seen.length = 0;
    await assert.rejects(() => lyc.lyceum.structured({ ...args, model: 'moonshotai/kimi-k3' }), (e) => e.status === 402);
    assert.strictEqual(seen.length, 0, 'nothing was sent past the cap');
    delete process.env.LYCEUM_CAP_USD;
    const before = lled.status().spent_usd;
    mock(lyc, { status: 500 });
    await assert.rejects(() => lyc.lyceum.chat(msg));
    assert.strictEqual(lled.status().spent_usd, before);
  });

  await check('lyceum: learner on / off / past the date, and pipeline opt-in', async () => {
    lycReset();
    assert.ok(lyc.learnerOn(Date.parse('2026-11-05T00:00:00Z')) && !lyc.learnerOn(Date.parse('2026-11-15T00:00:00Z')));
    process.env.LYCEUM_LEARNER = 'off'; assert.ok(!lyc.learnerOn(Date.parse('2026-11-05T00:00:00Z')));
    assert.ok(!lyc.lyceum.isEnabled(), 'off and no pipeline opt-in: disabled');
    await assert.rejects(() => lyc.lyceum.chat(msg), (e) => e.status === 403);
    process.env.LYCEUM_PIPELINE = '1'; assert.ok(lyc.lyceum.isEnabled());
  });

  await check('crouton: counts every request per UTC day, stops at 950, resets on a new day, env only lowers', async () => {
    croReset(); process.env.CROUTON_PIPELINE = '1'; seen.length = 0;
    mock(cro);
    assert.ok(cro.crouton.isEnabled() && cled.status().max === 950);
    process.env.CROUTON_DAILY_MAX = '3000'; assert.strictEqual(cled.status().max, 950);
    process.env.CROUTON_DAILY_MAX = '2';
    await cro.crouton.structured({ ...args }); await cro.crouton.chat(msg);
    assert.strictEqual(cled.status().count, 2);
    assert.ok(!cro.crouton.isEnabled(), 'at the limit: disabled');
    seen.length = 0;
    await assert.rejects(() => cro.crouton.structured({ ...args }), (e) => e.status === 402);
    assert.strictEqual(seen.length, 0, 'the third request was never sent');
    fs.writeFileSync(process.env.CROUTON_COUNTER_FILE, JSON.stringify({ day: '2020-01-01', count: 950 }));
    assert.strictEqual(cled.status().count, 0, 'yesterday\'s count does not carry over');
    delete process.env.CROUTON_DAILY_MAX;
    fs.writeFileSync(process.env.CROUTON_COUNTER_FILE, JSON.stringify({ day: today(), count: 949 }));
    await cro.crouton.chat(msg);
    await assert.rejects(() => cro.crouton.chat(msg), (e) => e.status === 402);
    assert.strictEqual(cled.status().count, 950);
  });

  await check('crouton: free model only, $0, pipeline opt-in required, never a learner provider', async () => {
    croReset(); seen.length = 0; mock(cro);
    assert.ok(!cro.crouton.isEnabled(), 'no pipeline opt-in: disabled');
    process.env.CROUTON_PIPELINE = '1';
    await cro.crouton.chat(msg);
    assert.strictEqual(seen[0].body.model, 'stealth/crouton-alpha');
    assert.ok(seen[0].url.startsWith('https://openrouter.ai/api/v1/'));
    await assert.rejects(() => cro.crouton.chat({ ...msg, model: 'anthropic/claude-sonnet-5-5' }), (e) => e.status === 403);
    assert.strictEqual(seen.length, 1, 'a paid model is refused before any request');
    assert.strictEqual(cro.crouton.learnerData, false);
    assert.ok(!cro.learnerOn(), 'no learner window');
    process.env.CROUTON_LEARNER = 'on'; assert.ok(!cro.learnerOn());
    delete process.env.CROUTON_LEARNER;
    assert.strictEqual(cro.crouton.paid, false);
  });

  const on = () => { process.env.LYCEUM_API_KEY = 'k'; process.env.LYCEUM_PIPELINE = '1'; process.env.CROUTON_PIPELINE = '1'; process.env.OPENROUTER_API_KEY = 'k'; };
  const off = () => { for (const k of ['LYCEUM_API_KEY', 'LYCEUM_PIPELINE', 'LYCEUM_LEARNER', 'LYCEUM_LEARNER_UNTIL', 'CROUTON_PIPELINE', 'OPENROUTER_API_KEY']) delete process.env[k]; pool._reset(); };

  await check('pool routing: Lyceum strong models only on judge tasks, no cheap Lyceum slot (Gonka/Coral/Munito are cheaper), Crouton on its six tasks; priced as configured', () => {
    pool._reset(); on();
    try {
      const slots = pool.extraSlots().filter((s) => /^(lyceum|crouton):/.test(s.id));
      assert.strictEqual(slots.length, 3); // GLM-5.3, Crouton, and MiniMax M3; Kimi K3 removed (owner, 5 Nov: too expensive) in favour of grok-4.7. MiniMax M3 (fact_verify only, 5 Nov first-lesson round 3)
      const ids = (task) => pool.candidatesFor({ role: 'blocks', task, kind: 'structured', dataClass: 'pipeline' }, { chain: [] }).map((s) => s.id);
      const KIMI = 'lyceum:moonshotai/kimi-k3'; const FLASH = 'lyceum:z-ai/glm-5.3-flash'; const CR = 'crouton:stealth/crouton-alpha';
      for (const t of ['night_judge', 'material_verify']) { const i = ids(t); assert.ok(!i.includes('lyceum:qwen/qwen3.8-2.4t-a95b') && !i.includes(FLASH) && !i.includes(KIMI) && i.includes('grokified:grok-4.7') && i.includes('lyceum:z-ai/glm-5.3') && !i.includes('lyceum:deepseek/deepseek-v4-pro-0813') && i.includes(CR), `${t}: ${i}`); /* by value: GLM-5.3 and Kimi K3 only (owner, 2026-11-04) */ }
      for (const t of ['blind_mc', 'fact_claims', 'placement_key_judge', 'placement_unit_judge']) { const i = ids(t); assert.ok(i.includes(CR) && !i.includes(KIMI) && !i.includes(FLASH), `${t}: ${i}`); }
      assert.ok(!ids('lesson_write').some((i) => /^(crouton|lyceum:(moonshotai|z-ai\/glm-5.3$|deepseek\/deepseek-v4-pro))/.test(i)), 'strong slots and Crouton stay off other tasks');
      assert.ok(!['lesson_write', 'night_judge', 'blind_mc'].some((t) => ids(t).includes('lyceum:minimax/minimax-m3')), 'MiniMax M3 is for fact_verify only');
      assert.ok(!ids('fact_verify').includes('lyceum:minimax/minimax-m3'), 'off by default: FACT_VERIFY_MINIMAX is the owner switch');
      process.env.FACT_VERIFY_MINIMAX = 'on';
      try { assert.ok(ids('fact_verify').includes('lyceum:minimax/minimax-m3')); } finally { delete process.env.FACT_VERIFY_MINIMAX; }
      const byId = Object.fromEntries(slots.map((s) => [s.id, s]));
      assert.ok(byId[CR].priceIn === 0 && byId[CR].priceOut === 0);
    } finally { off(); }
  });

  await check('pool learner gate: Lyceum needs consent clearance inside its window; Crouton never serves a learner', () => {
    pool._reset(); on(); process.env.LYCEUM_LEARNER_UNTIL = '2099-01-01T00:00:00Z';
    const ids = (req) => pool.candidatesFor({ role: 'blocks', task: 'night_judge', kind: 'structured', userId: 'u1', ...req }, { chain: [] }).map((x) => x.id);
    try {
      const ok = ids({ munito: true });
      assert.ok(ok.includes('lyceum:z-ai/glm-5.3'), `cleared learner: ${ok}`);
      assert.ok(!ok.some((i) => i.startsWith('crouton:')), 'Crouton never sees learner data');
      assert.ok(!ids({ munito: false }).some((i) => /^(lyceum|crouton):/.test(i)), 'no clearance: never');
      assert.ok(!ids({}).some((i) => /^(lyceum|crouton):/.test(i)), 'no flag: never');
      process.env.LYCEUM_LEARNER = 'off';
      assert.ok(!ids({ munito: true }).some((i) => i.startsWith('lyceum:')), 'learner switch off');
      process.env.LYCEUM_LEARNER = 'on'; process.env.LYCEUM_LEARNER_UNTIL = '2020-01-01T00:00:00Z';
      assert.ok(!ids({ munito: true }).some((i) => i.startsWith('lyceum:')), 'past the date');
    } finally { off(); }
  });

  await check('pool end to end: a pipeline request on each new slot reaches its API with the slot\'s model and counts', async () => {
    pool._reset(); rm(process.env.LYCEUM_LEDGER_FILE); rm(process.env.CROUTON_COUNTER_FILE);
    for (const [mod, slotId, model] of [[lyc, 'lyceum:z-ai/glm-5.3', 'z-ai/glm-5.3'], [cro, 'crouton:stealth/crouton-alpha', 'stealth/crouton-alpha']]) {
      on(); seen.length = 0; mock(mod);
      try {
        const slot = pool.extraSlots().find((s) => s.id === slotId);
        const r = await pool.callHedged({ kind: 'structured', role: 'blocks', task: 'night_judge', dataClass: 'pipeline', ...args }, { slots: [slot], timeoutMs: 5000 });
        assert.ok(r && r.data && r.data.n === 1);
        assert.strictEqual(seen[0].body.model, model);
      } finally { mod._setFetch(null); off(); }
    }
    assert.ok(cled.status().count === 1 && lled.status().calls === 1);
  });

  await check('cost tracker prices Lyceum models from the ledger', () => {
    const k = require('../services/cost-tracker').listPriceOf('moonshotai/kimi-k3');
    assert.ok(k.in === 3 && k.out === 15 && /lyceum-ledger/.test(k.src), JSON.stringify(k));
  });

  console.log(failed ? `${failed} FAILED` : 'lyceum + crouton: all checks passed');
  process.exit(failed ? 1 : 0);
})();
