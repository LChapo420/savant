/**
 * Gonka broker (https://proxy.gonkabroker.com/v1, OpenAI-compatible): the owner's $50 credit. Models and prices in
 * services/gonka-ledger.js. Key GONKA_API_KEY, base GONKA_BASE_URL. Learner data until GONKA_LEARNER_UNTIL (default
 * 2026-11-14T06:00:00Z) under the consent rule; otherwise pipeline only. Mechanics: services/providers/openai-credit.js.
 */
const { makeProvider } = require('./openai-credit');

const made = makeProvider({
  name: 'gonka', label: 'Gonka', prefix: 'GONKA', ledger: require('../gonka-ledger'),
  keyEnv: 'GONKA_API_KEY', baseEnv: 'GONKA_BASE_URL', defaultBase: 'https://proxy.gonkabroker.com/v1',
  modelEnv: 'GONKA_MODEL', defaultModel: 'deepseek-ai/DeepSeek-V4-Flash-0731', reasoningParam: false,
});
module.exports = { gonka: made.provider, gonkaProvider: made.provider, _setFetch: made._setFetch, post: made.post, baseUrl: made.baseUrl, learnerOn: made.learnerOn };
