/**
 * The ZeroGPU key's TOTAL spend: data/zerogpu-ledger.json (env ZEROGPU_LEDGER_FILE), hard cap $245 of the owner's $250 credit
 * (5 Nov 2026; the $5 margin covers rounding and any call the ledger cannot see). ZEROGPU_CAP_USD can only lower it. Mechanics in
 * services/credit-ledger.js. Prices (USD per Mtok, input / output) are from https://zerogpu.ai/models read 5 Nov 2026; the API's
 * /models lists input prices only. Cached-input discounts are ignored (over-counts, never under-counts). Unknown model: WORST.
 * gpt-5.6-luna and gpt-6-luna are not in /models but answer under those bare names (probed 5 Nov); the others use the /models ids.
 */
const { makeLedger } = require('./credit-ledger');

const PRICES = {
  'deepseek/deepseek-v4.1-flash': { input: 0.3, output: 1.2 },
  'z-ai/glm-5.3-flash': { input: 0.1, output: 0.35 },
  'openai/gpt-oss-120b': { input: 0.15, output: 0.6 },
  'qwen/qwen3-30b-a3b': { input: 0.1, output: 0.45 },
  'meta-llama/llama-3.1-8b-instruct': { input: 0.15, output: 0.28 },
  'gpt-5.6-luna': { input: 0.2, output: 1.2 },
  'gpt-6-luna': { input: 0.1, output: 0.5 },
};
module.exports = makeLedger({
  name: 'zerogpu', capUsd: 245, capEnv: 'ZEROGPU_CAP_USD', fileEnv: 'ZEROGPU_LEDGER_FILE', file: 'zerogpu-ledger.json',
  prices: PRICES, worst: { input: 1.5, output: 1.5 },
});
