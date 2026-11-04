/**
 * Grokified (https://api.grokified.com/v1, OpenAI-compatible): the owner's $135 credit. grok-4.7 is the default; grok-build-0.1 is
 * the coding model. Only the Grok text models are used (the ledger prices only those); Claude/image/video models are never used. Errors: only 429 and 5xx are retried (by the pool's slot fallback); 401/402/403 are config errors, never retried (pool.js classify). Prices: services/grokified-ledger.js.
 * Key GROKIFIED_API_KEY, base GROKIFIED_BASE_URL. Learner data until GROKIFIED_LEARNER_UNTIL (default 2026-11-14T06:00:00Z) under the
 * consent rule; otherwise pipeline only. Mechanics: services/providers/openai-credit.js.
 */
const { makeProvider } = require('./openai-credit');

const made = makeProvider({
  name: 'grokified', label: 'Grokified', prefix: 'GROKIFIED', ledger: require('../grokified-ledger'),
  keyEnv: 'GROKIFIED_API_KEY', baseEnv: 'GROKIFIED_BASE_URL', defaultBase: 'https://api.grokified.com/v1',
  modelEnv: 'GROKIFIED_MODEL', defaultModel: 'grok-4.7', reasoningParam: false,
});
module.exports = { grokified: made.provider, grokifiedProvider: made.provider, _setFetch: made._setFetch, post: made.post, baseUrl: made.baseUrl, learnerOn: made.learnerOn };
