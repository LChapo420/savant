/**
 * The Lyceum key's TOTAL spend: data/lyceum-ledger.json (env LYCEUM_LEDGER_FILE), cap $250 (owner 2026-11-04; the dashboard shows $500 and
 * the owner asked Lyceum whether that is an error, so the cap stays $250 until the owner says otherwise). LYCEUM_CAP_USD can only lower it.
 * Mechanics in services/credit-ledger.js.
 *
 * Prices (USD per Mtok in / out): https://lyceum.technology/resources/pricing/ (read 2026-11-04) and confirmed by the owner's copy of Lyceum's official prices (4 Nov). The API's /models has no prices. Cached-input
 * discounts are ignored (every input token is counted at the full input price: over-counts, never under-counts). Models not listed are priced at WORST.
 */
const { makeLedger } = require('./credit-ledger');

const PRICES = {
  'moonshotai/kimi-k3.1-pro': { input: 2, output: 10 }, // read from Lyceum's model list, 6 Nov 2026; reasoning tokens bill as output
  'moonshotai/kimi-k3': { input: 3, output: 15 },
  'moonshotai/kimi-k2.7-code': { input: 1.25, output: 4.5 },
  'z-ai/glm-5.3': { input: 1.4, output: 4.4 },
  'z-ai/glm-5.3-flash': { input: 0.2, output: 0.5 },
  'deepseek/deepseek-v4-pro-0813': { input: 2, output: 4 },
  'deepseek/deepseek-v4.1-flash': { input: 0.5, output: 1.5 },
  'qwen/qwen3.8-2.4t-a95b': { input: 2.5, output: 6 },
  'qwen/qwen3.8-27b': { input: 0.4, output: 2.4 },
  'minimax/minimax-m3': { input: 0.4, output: 2 },
  'qwen/qwen3.8-flash-next': { input: 0.2, output: 0.5 },
  'deepseek/deepseek-v4-flash': { input: 0.25, output: 0.3 },
  'lyceum/router': { input: 0.4, output: 2 },
  'lyceum/simple': { input: 0.2, output: 0.5 },
  'lyceum/complex': { input: 0.4, output: 2 },
  'lyceum/reasoning': { input: 1.4, output: 4.4 },
  'qwen/qwen3-embedding-8b': { input: 0.02, output: 0 },
};
// The *-instant variants cost the same as their base model.
for (const [m, pr] of Object.entries({ ...PRICES })) if (!m.startsWith('lyceum/') && !/embedding/.test(m)) PRICES[`${m}-instant`] = pr;
module.exports = makeLedger({
  name: 'lyceum', capUsd: 250, capEnv: 'LYCEUM_CAP_USD', fileEnv: 'LYCEUM_LEDGER_FILE', file: 'lyceum-ledger.json',
  prices: PRICES, worst: { input: 5, output: 20 },
});
