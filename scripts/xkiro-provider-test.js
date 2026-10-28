/**
 * The xKiro provider's guards, against a fake server (no network, no key used):
 * pipeline-only, $0 models only, the daily token cap, and the usage record.
 *
 *   node scripts/xkiro-provider-test.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const usageFile = path.join(os.tmpdir(), `xkiro-usage-test-${process.pid}.json`);
process.env.XKIRO_USAGE_FILE = usageFile;
process.env.XKIRO_API_KEY = 'test-xkiro-key';
process.env.XKIRO_BASE_URL = 'https://xkiro.test/v1';
process.env.XKIRO_DAILY_TOKENS = '5000';
// A small grant on the MiniMax model, so its cap can be reached in a test.
process.env.XKIRO_GRANTS = JSON.stringify({ 'minimax/minimax-m3.1-flash': 4000 });
delete process.env.XKIRO_PIPELINE;
process.on('exit', () => { try { fs.unlinkSync(usageFile); } catch { /* none written */ } });

const { xkiro, isFreeEntry, _setFetch, _reset } = require('../services/providers/xkiro');

let failures = 0;
function check(name, ok, detail) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${ok || detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
  if (!ok) failures++;
}

const MODELS = {
  data: [
    { id: 'qwen/qwen3.8-max:free', access_tier: 'free', pricing: { currency: 'USD', unit: 'per_1m_tokens', input: 0, output: 0 } },
    { id: 'minimax/minimax-m3.1-flash', access_tier: 'paid', pricing: { currency: 'USD', unit: 'per_1m_tokens', input: 0.15, output: 0.6 } },
    { id: 'sneaky/free-label-but-priced', access_tier: 'free', pricing: { currency: 'USD', unit: 'per_1m_tokens', input: 0, output: 0.2 } },
    { id: 'minimax/minimax-m3', access_tier: 'paid', pricing: { currency: 'USD', unit: 'per_1m_tokens', input: 0.3, output: 1.2 } },
  ],
};
const sent = [];
let refuseGrant = false;
function fakeFetch(url, opts = {}) {
  if (url.endsWith('/models')) return Promise.resolve({ ok: true, status: 200, json: async () => MODELS });
  sent.push(JSON.parse(opts.body));
  if (refuseGrant) return Promise.resolve({ ok: false, status: 402, statusText: 'Payment Required', text: async () => JSON.stringify({ error: { message: 'Insufficient balance' } }) });
  const reply = { choices: [{ message: { content: '{"verdict":"correct","confidence":0.9}' } }], usage: { prompt_tokens: 1200, completion_tokens: 300 } };
  return Promise.resolve({ ok: true, status: 200, text: async () => JSON.stringify(reply) });
}
const SCHEMA = { type: 'object', properties: { verdict: { type: 'string' }, confidence: { type: 'number' } }, required: ['verdict'] };
const ask = (model) => xkiro.structured({ system: 's', user: 'u', schema: SCHEMA, schemaName: 'submit_grade', maxTokens: 100, models: [model] });

(async () => {
  _setFetch(fakeFetch);
  _reset();

  console.log('price check');
  check('a free-tier model at $0 is free', isFreeEntry(MODELS.data[0]));
  check('a paid model is not free', !isFreeEntry(MODELS.data[1]));
  check('a "free" label with a price above 0 is not free', !isFreeEntry(MODELS.data[2]));
  check('an entry with no pricing is not free', !isFreeEntry({ access_tier: 'free' }));

  console.log('pipeline only');
  check('not enabled without XKIRO_PIPELINE=1', !xkiro.isEnabled());
  let err = null;
  try { await ask('qwen/qwen3.8-max:free'); } catch (e) { err = e; }
  check('a call without the opt-in is refused before anything is sent', err && err.status === 403 && sent.length === 0, err && err.message);

  process.env.XKIRO_PIPELINE = '1';
  console.log('$0 models only');
  err = null;
  try { await ask('minimax/minimax-m3'); } catch (e) { err = e; }
  check('a paid model with no grant is refused and nothing is sent', err && err.status === 402 && sent.length === 0, err && err.message);
  err = null;
  try { await ask('sneaky/free-label-but-priced'); } catch (e) { err = e; }
  check('a priced model labelled free is refused', err && err.status === 402 && sent.length === 0, err && err.message);

  const ok = await ask('qwen/qwen3.8-max:free');
  check('a $0 model answers', ok && ok.data && ok.data.verdict === 'correct', ok);
  check('the reported cost is 0', ok && ok.usage.cost_usd === 0);
  const usage = JSON.parse(fs.readFileSync(usageFile, 'utf8'));
  const row = Object.values(usage)[0]['qwen/qwen3.8-max:free'];
  check('the call is recorded with its tokens', row && row.calls === 1 && row.input === 1200 && row.output === 300, row);

  console.log('daily cap');
  // 1,500 tokens per call against a 5,000 cap (each call also reserves its max_tokens).
  let stopped = null;
  for (let i = 0; i < 6 && !stopped; i++) {
    try { await ask('qwen/qwen3.8-max:free'); } catch (e) { stopped = e; } // eslint-disable-line no-await-in-loop
  }
  check('calls stop at the daily cap with a "daily" error', stopped && stopped.daily && /daily/.test(stopped.message), stopped && stopped.message);
  check('the cap is never passed', JSON.parse(fs.readFileSync(usageFile, 'utf8')) && require('../services/providers/xkiro').tokensToday() <= 5000);
  const mod = require('../services/providers/xkiro');
  check('the free models stop at their daily cap', mod.freeTokensToday() <= 5000);

  console.log('token grant (MiniMax M3.1 Flash)');
  const before = sent.length;
  const g1 = await ask('minimax/minimax-m3.1-flash');
  check('the granted model answers even after the free day is used', g1 && g1.data && sent.length === before + 1, g1);
  check("its tokens do not count against the free models' day", mod.freeTokensToday() <= 5000);
  check('its tokens count against its grant', mod.grantTokensUsed('minimax/minimax-m3.1-flash') === 1500, mod.grantTokensUsed('minimax/minimax-m3.1-flash'));
  let gStop = null;
  for (let i = 0; i < 4 && !gStop; i++) {
    try { await ask('minimax/minimax-m3.1-flash'); } catch (e) { gStop = e; } // eslint-disable-line no-await-in-loop
  }
  check('the grant stops before its cap is passed', gStop && gStop.status === 402 && /used up/.test(gStop.message) && mod.grantTokensUsed('minimax/minimax-m3.1-flash') <= 4000, gStop && gStop.message);

  // A refusal from xKiro itself (no balance) locks the granted model off.
  process.env.XKIRO_GRANTS = JSON.stringify({ 'minimax/minimax-m3.1-flash': 1e9 });
  refuseGrant = true;
  err = null;
  try { await ask('minimax/minimax-m3.1-flash'); } catch (e) { err = e; }
  refuseGrant = false;
  const afterRefusal = sent.length;
  err = null;
  try { await ask('minimax/minimax-m3.1-flash'); } catch (e) { err = e; }
  check('after xKiro refuses the grant, nothing more is sent to that model', err && err.status === 402 && sent.length === afterRefusal && /refused by xKiro/.test(err.message), err && err.message);

  console.log(failures ? `\n${failures} failure(s)` : '\nall xkiro checks passed');
  process.exit(failures ? 1 : 0);
})();
