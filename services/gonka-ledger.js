/**
 * The Gonka broker key's TOTAL spend ($50 credit, owner 2026-11-04): data/gonka-ledger.json (env GONKA_LEDGER_FILE), cap $50
 * (GONKA_CAP_USD can only lower it). Mechanics in services/credit-ledger.js. Prices (USD per Mtok, input / output) are what
 * GET https://proxy.gonkabroker.com/v1/models reported on 2026-11-04 (pricing.input / pricing.output). Unknown model: WORST.
 */
const { makeLedger } = require('./credit-ledger');

const PRICES = {
  'zai-org/GLM-5.3-Flash': { input: 0.1, output: 0.1 },
  'deepseek-ai/DeepSeek-V4-Flash-0731': { input: 0.1, output: 0.1 },
  'MiniMaxAI/MiniMax-M2.7': { input: 0.12, output: 0.12 },
  'BAAI/bge-m3': { input: 0.02, output: 0.02 },
};
module.exports = makeLedger({
  name: 'gonka', capUsd: 50, capEnv: 'GONKA_CAP_USD', fileEnv: 'GONKA_LEDGER_FILE', file: 'gonka-ledger.json',
  prices: PRICES, worst: { input: 0.5, output: 0.5 },
});
