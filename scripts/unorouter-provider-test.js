/**
 * The UnoRouter provider's guards, against a fake server (no network, no key used):
 * pipeline-only, listed `:free` models only, pacing, 429 retry, the usage record.
 *
 *   node scripts/unorouter-provider-test.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const usageFile = path.join(os.tmpdir(), `unorouter-usage-test-${process.pid}.json`);
process.env.UNOROUTER_USAGE_FILE = usageFile;
process.env.UNOROUTER_API_KEY = 'test-unorouter-key';
process.env.UNOROUTER_BASE_URL = 'https://uno.test/v1/chat/completions';
process.env.UNOROUTER_GAP_MS = '1000';
delete process.env.UNOROUTER_PIPELINE;
process.on('exit', () => { try { fs.unlinkSync(usageFile); } catch { /* none written */ } });

const { unorouter, _setFetch, _setSleep, _reset } = require('../services/providers/unorouter');

let failures = 0;
function check(name, ok, detail) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${ok || detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
  if (!ok) failures++;
}

const MODELS = { data: [{ id: 'gemini-3.6-flash:free' }, { id: 'gemini-3-pro' }, { id: 'qwen3.6-35b-a3b:free' }] };
const sent = [];
const urls = [];
const slept = [];
let fail429 = 0;
function fakeFetch(url, opts = {}) {
  urls.push(url);
  if (url.endsWith('/models')) return Promise.resolve({ ok: true, status: 200, json: async () => MODELS });
  sent.push(JSON.parse(opts.body));
  if (fail429 > 0) {
    fail429--;
    return Promise.resolve({ ok: false, status: 429, statusText: 'Too Many Requests', headers: { get: (h) => (h === 'retry-after' ? '7' : null) }, text: async () => '{"error":{"message":"rate limited"}}' });
  }
  const reply = { choices: [{ message: { content: '{"verdict":"correct","confidence":0.9}' } }], usage: { prompt_tokens: 900, completion_tokens: 100 } };
  return Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify(reply) });
}
const SCHEMA = { type: 'object', properties: { verdict: { type: 'string' }, confidence: { type: 'number' } }, required: ['verdict'] };
const ask = (model) => unorouter.structured({ system: 's', user: 'u', schema: SCHEMA, schemaName: 'submit_grade', maxTokens: 100, models: [model] });

(async () => {
  _setFetch(fakeFetch);
  _setSleep(async (ms) => { slept.push(ms); });
  _reset();

  console.log('pipeline only');
  check('not enabled without UNOROUTER_PIPELINE=1', !unorouter.isEnabled());
  let err = null;
  try { await ask('gemini-3.6-flash:free'); } catch (e) { err = e; }
  check('a call without the opt-in is refused before anything is sent', err && err.status === 403 && sent.length === 0, err && err.message);

  process.env.UNOROUTER_PIPELINE = '1';
  console.log(':free models only');
  err = null;
  try { await ask('gemini-3-pro'); } catch (e) { err = e; }
  check('a paid model is refused and nothing is sent', err && err.status === 402 && sent.length === 0, err && err.message);
  err = null;
  try { await ask('made-up-model:free'); } catch (e) { err = e; }
  check('a :free id the key does not list is refused', err && err.status === 402 && sent.length === 0, err && err.message);

  const ok = await ask('gemini-3.6-flash:free');
  check('a listed :free model answers', ok && ok.data && ok.data.verdict === 'correct', ok);
  check('the base URL is the /v1 above /chat/completions', urls.some((u) => u === 'https://uno.test/v1/chat/completions') && urls.some((u) => u === 'https://uno.test/v1/models'), urls);
  const row = Object.values(JSON.parse(fs.readFileSync(usageFile, 'utf8')))[0]['gemini-3.6-flash:free'];
  check('the call is recorded with its tokens', row && row.calls === 1 && row.input === 900 && row.output === 100, row);

  console.log('pacing and 429');
  slept.length = 0;
  await ask('gemini-3.6-flash:free');
  check('a second call to the same model waits its turn', slept.some((ms) => ms > 0 && ms <= 1000), slept);
  slept.length = 0;
  fail429 = 1;
  const r = await ask('qwen3.6-35b-a3b:free');
  check("a 429 is retried after the server's Retry-After", r && r.data && slept.includes(7000), slept);

  console.log(failures ? `\n${failures} failure(s)` : '\nall unorouter checks passed');
  process.exit(failures ? 1 : 0);
})();
