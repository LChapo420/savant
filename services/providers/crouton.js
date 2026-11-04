/**
 * Crouton Alpha: OpenRouter's FREE stealth model `stealth/crouton-alpha` ($0, 1M context, 1000 requests per UTC day; we stop at 950,
 * services/crouton-ledger.js). Measured 4 Nov 2026: 35/35 on the 40 bank items where it answered, 5/40 not valid JSON (the pool retries
 * those on the next slot), p50 1.7 s. PIPELINE ONLY, never learner data (stealth models log prompts): needs CROUTON_PIPELINE=1 (or
 * MUNITO_PIPELINE=1, which every pipeline script sets). Uses the OpenRouter key (OPENROUTER_API_KEY) on a free model only; never a paid one.
 */
const { makeProvider } = require('./openai-credit');

const made = makeProvider({
  name: 'crouton', label: 'Crouton Alpha', prefix: 'CROUTON', ledger: require('../crouton-ledger'),
  keyEnv: 'OPENROUTER_API_KEY', baseEnv: 'CROUTON_BASE_URL', defaultBase: 'https://openrouter.ai/api/v1',
  modelEnv: 'CROUTON_MODEL', defaultModel: 'stealth/crouton-alpha', reasoningParam: false, pipelineOnly: true, free: true,
});
const guard = (fn) => (a = {}) => {
  if (a.model && a.model !== 'stealth/crouton-alpha') return Promise.reject(Object.assign(new Error('crouton: only stealth/crouton-alpha is allowed (free)'), { status: 403 }));
  return fn(a);
};
const provider = Object.assign(made.provider, {
  structuredOnce: guard(made.provider.structuredOnce.bind(made.provider)),
  chat: guard(made.provider.chat.bind(made.provider)),
});
module.exports = { crouton: provider, croutonProvider: provider, _setFetch: made._setFetch, post: made.post, baseUrl: made.baseUrl, learnerOn: made.learnerOn };
