/**
 * ZeroGPU (https://api.zerogpu.ai/v1, OpenAI-compatible): the owner's $250 credit (ledger: services/zerogpu-ledger.js, $245 cap).
 * Key ZEROGPU_API_KEY, base ZEROGPU_BASE_URL. Learner data until ZEROGPU_LEARNER_UNTIL (default 2026-11-14T06:00:00Z) under the
 * consent rule; otherwise pipeline only. Mechanics: services/providers/openai-credit.js.
 */
const { makeProvider } = require('./openai-credit');

const made = makeProvider({
  name: 'zerogpu', label: 'ZeroGPU', prefix: 'ZEROGPU', ledger: require('../zerogpu-ledger'),
  keyEnv: 'ZEROGPU_API_KEY', baseEnv: 'ZEROGPU_BASE_URL', defaultBase: 'https://api.zerogpu.ai/v1',
  modelEnv: 'ZEROGPU_MODEL', defaultModel: 'z-ai/glm-5.3-flash', reasoningParam: false,
});
module.exports = { zerogpu: made.provider, zerogpuProvider: made.provider, _setFetch: made._setFetch, post: made.post, baseUrl: made.baseUrl, learnerOn: made.learnerOn };
