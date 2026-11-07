/**
 * Models for the part-modify proofs and judge calibration (pipeline only: simulated learners and curriculum text, no learner data). Loads only the provider keys
 * from the .env, never prints them, and points each ledger at the live file. Judges of three families: GLM (ZeroGPU), DeepSeek (Coral) and Grok (Grokified).
 */
const fs = require('fs');
const path = require('path');

process.env.ZEROGPU_PIPELINE = '1'; process.env.GONKA_PIPELINE = '1'; process.env.CORAL_PIPELINE = '1'; process.env.MUNITO_PIPELINE = '1'; process.env.GROKIFIED_PIPELINE = '1';
const ENV = process.env.DOTENV_PATH || 'C:/coding/claudecommittdIq/folderThing/.env';
Object.assign(process.env, Object.fromEntries(Object.entries(require('dotenv').parse(fs.readFileSync(ENV))).filter(([k]) => /^(ZEROGPU|GONKA|CORAL|GROKIFIED)_/.test(k) && !process.env[k])));
const LIVE = 'C:/coding/claudecommittdIq/folderThing/iq-max-repo-2-claude-adoring-mayer-woc9sq/data';
for (const n of ['zerogpu', 'gonka', 'coral', 'grokified']) { const k = `${n.toUpperCase()}_LEDGER_FILE`; process.env[k] = process.env[k] || `${LIVE}/${n}-ledger.json`; }
process.env.RUN_CAP_USD = process.env.RUN_CAP_USD || '5';

const { gonka } = require('../../services/providers/gonka');
const { zerogpu } = require('../../services/providers/zerogpu');
const { coral } = require('../../services/providers/coral');
const { grokified } = require('../../services/providers/grokified');

const MODELS = {
  glm: { id: 'zerogpu-glm', family: 'glm', prov: zerogpu, model: 'z-ai/glm-5.3-flash' },
  deepseek: { id: 'coral-deepseek', family: 'deepseek', prov: coral, model: 'deepseek-v4.1-flash' },
  gonka: { id: 'gonka-deepseek', family: 'deepseek', prov: gonka, model: 'deepseek-ai/DeepSeek-V4-Flash-0731' },
  grok: { id: 'grokified-grok', family: 'grok', prov: grokified, model: 'grok-4.3' },
};

const sha = (s) => require('crypto').createHash('sha1').update(String(s)).digest('hex').slice(0, 14);
function makeChat(cacheFile, { mock = false, stats = { calls: 0, empty: 0, errors: 0 } } = {}) {
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch { cache = {}; }
  let dirty = 0;
  const save = () => { fs.mkdirSync(path.dirname(cacheFile), { recursive: true }); fs.writeFileSync(cacheFile, JSON.stringify(cache)); dirty = 0; };
  async function chat(who, system, user, maxTokens = 6000, salt = '') {
    const k = `${who.model}:${sha(`${system}${user}${maxTokens}${salt}`)}`;
    if (cache[k] !== undefined) return cache[k];
    if (mock) return null;
    let last = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      stats.calls += 1;
      if (stats.calls % 200 === 0) console.log(`  ... ${stats.calls} calls, ${stats.empty} empty, ${stats.errors} errors`);
      try {
        // eslint-disable-next-line no-await-in-loop
        const r = await who.prov.chat({ task: 'part-modify-proof', system, messages: [{ role: 'user', content: user }], maxTokens, model: who.model, timeoutMs: 120000 });
        if (r && r.text && r.text.trim()) { cache[k] = r.text; dirty += 1; if (dirty >= 25) save(); return r.text; }
        stats.empty += 1;
      } catch (err) { last = err; stats.errors += 1; if (/LEDGER|cap|402/i.test(String(err && err.message))) throw err; }
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
    if (last) console.warn(`  call failed (${who.model}): ${String(last.message).slice(0, 90)}`);
    return null;
  }
  return { chat, save, stats };
}
async function pool(tasks, n) {
  const out = new Array(tasks.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < tasks.length) { const j = i; i += 1; try { out[j] = await tasks[j](); } catch (e) { out[j] = { error: e.message }; } } }));
  return out;
}
const ledgers = () => {
  const out = {};
  // eslint-disable-next-line global-require, import/no-dynamic-require
  for (const n of ['zerogpu', 'gonka', 'coral', 'grokified']) { try { const s = require(`../../services/${n}-ledger`).status(); out[n] = Number(s.spent_usd.toFixed(3)); } catch { /* none */ } }
  return out;
};
module.exports = { MODELS, makeChat, pool, ledgers };
