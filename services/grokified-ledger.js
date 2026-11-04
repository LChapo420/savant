/**
 * The Grokified key's TOTAL spend ($135 credit, owner 2026-11-04): data/grokified-ledger.json (env GROKIFIED_LEDGER_FILE), cap $135
 * (GROKIFIED_CAP_USD can only lower it). Mechanics in services/credit-ledger.js.
 *
 * Prices (USD per Mtok in / out): Grokified's own prices as given by the owner on 2026-11-04. Its API serves only the Grok text models below; Claude, image and
 * video models are not priced here (an unknown model is priced at WORST, above every row, and never routed). Long-context (>200k) is not used.
 * Overhead: every call carries about 1,250 prompt tokens Grokified adds; estimate() reserves for it (costOf uses the reported usage).
 */
const { makeLedger } = require('./credit-ledger');

const PRICES = {
  'grok-4.7': { input: 1, output: 3 },
  'grok-4.6': { input: 1, output: 3 },
  'grok-4.5': { input: 1, output: 3 },
  'grok-4.3': { input: 0.63, output: 1.25 },
  'grok-4.20-0309-reasoning': { input: 0.63, output: 1.25 },
  'grok-4.20-0309-non-reasoning': { input: 0.63, output: 1.25 },
  'grok-4.20-multi-agent-0309': { input: 0.63, output: 1.25 },
  'grok-build-0.1': { input: 0.5, output: 1 },
};
module.exports = makeLedger({
  name: 'grokified', capUsd: 135, capEnv: 'GROKIFIED_CAP_USD', fileEnv: 'GROKIFIED_LEDGER_FILE', file: 'grokified-ledger.json',
  prices: PRICES, worst: { input: 2, output: 6 }, overheadTokens: 1250,
});
