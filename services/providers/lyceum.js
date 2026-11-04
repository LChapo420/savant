/**
 * Lyceum (https://api.lyceum.technology/openai/v1, OpenAI-compatible): the owner's $250-capped credit (ledger: services/lyceum-ledger.js).
 * Text models only. Errors: only 429 and 5xx are retried (by the pool's slot fallback); 401/402/403 are config errors (pool.js classify).
 * Key LYCEUM_API_KEY, base LYCEUM_BASE_URL. Learner data until LYCEUM_LEARNER_UNTIL (default 2026-11-14T06:00:00Z) under the consent rule;
 * otherwise pipeline only. Mechanics: services/providers/openai-credit.js.
 */
const { makeProvider } = require('./openai-credit');

const made = makeProvider({
  name: 'lyceum', label: 'Lyceum', prefix: 'LYCEUM', ledger: require('../lyceum-ledger'),
  keyEnv: 'LYCEUM_API_KEY', baseEnv: 'LYCEUM_BASE_URL', defaultBase: 'https://api.lyceum.technology/openai/v1',
  modelEnv: 'LYCEUM_MODEL', defaultModel: 'z-ai/glm-5.3-flash', reasoningParam: false,
});
module.exports = { lyceum: made.provider, lyceumProvider: made.provider, _setFetch: made._setFetch, post: made.post, baseUrl: made.baseUrl, learnerOn: made.learnerOn };
