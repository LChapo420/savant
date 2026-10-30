// Section 07 step 4: the citation check, as in the 27 Oct audit. Two independent free models (Qwen 3.8 Max and
// Mistral Large, both on xKiro; DeepSeek V4.1 on NVIDIA timed out too often and its finished ratings are kept as a third view) rate every claim against its source's abstract, separately. Planted errors (a real claim with an
// unrelated source's abstract) are mixed in; a checker that misses them is not trusted. Writes checks.json.
const fs = require('fs');
const path = require('path');
const APP = path.join(__dirname, '..', '..', '..');
require(path.join(APP, 'node_modules', 'dotenv')).config({ path: path.join(APP, '..', '.env') });
process.env.XKIRO_PIPELINE = '1';
process.env.XKIRO_USAGE_FILE = process.env.XKIRO_USAGE_FILE || path.join(APP, 'data', 'xkiro-usage.json');
const nvidia = require(path.join(APP, 'services', 'providers', 'nvidia.js'));
const { xkiro } = require(path.join(APP, 'services', 'providers', 'xkiro.js'));
const picks = require('./picks.json');
const cands = require('./candidates.json');
const OUT = path.join(__dirname, 'checks.json');
const out = fs.existsSync(OUT) ? require(OUT) : {};

const abstractOf = (cid) => { for (const list of Object.values(cands)) { const c = list.find((x) => x.cid === cid); if (c) return c.abstract; } return ''; };
const SCHEMA = {
  type: 'object',
  properties: {
    rating: { type: 'string', enum: ['supported', 'partly', 'not_supported'] },
    problem: { type: 'string' },
    smallest_fix: { type: 'string' },
  },
  required: ['rating', 'problem', 'smallest_fix'],
};
const SYSTEM = `You check one citation. Decide from the source text only whether it shows what the claim uses it for:
the topic, the direction of the effect, the population and setting, every number, and the strength of the wording
("may" must not become "does", one study must not become "studies show", a correlation must not become a cause).
"supported": the source shows it as written. "partly": the source shows something narrower or the wording is too strong.
"not_supported": the source does not show it. Give the problem in one sentence and the smallest fix to the claim. Reply only through the tool.`;

const CHECKERS = {
  // Section 07: MiniMax M3.1 Flash on NVIDIA (free; a different family from the DeepSeek picker). Kimi K2.6 is listed but
  // answers "model not found" for this key; Qwen answered 503
  // "high demand" and GLM 5.3 was retired by NVIDIA (410) on the night of 29-30 Oct; their finished ratings are kept as extra views.
  minimax: (user) => nvidia.structured({ role: 'check', system: SYSTEM, user, schema: SCHEMA, schemaName: 'rate', maxTokens: 2500, models: [{ model: 'minimaxai/minimax-m3.1-flash', effort: 'medium' }], timeoutMs: 5 * 60 * 1000 }),
  // Mistral Large: xKiro first; once xKiro's free day is used up, the same model family on NVIDIA (Mistral Large 4).
  mistral: async (user) => { try { const r = await xkiro.structured({ system: SYSTEM, user, schema: SCHEMA, schemaName: 'rate', maxTokens: 800, models: ['mistralai/mistral-large-2512'], timeoutMs: 5 * 60 * 1000 }); if (r) return r; } catch { /* to NVIDIA */ } return nvidia.structured({ role: 'check', system: SYSTEM, user, schema: SCHEMA, schemaName: 'rate', maxTokens: 2500, models: [{ model: 'mistralai/mistral-large-4-1t-a52b', effort: 'medium' }], timeoutMs: 5 * 60 * 1000 }); },
};
const RETIRED = {
  deepseek: (user) => nvidia.structured({ role: 'check', system: SYSTEM, user, schema: SCHEMA, schemaName: 'rate', maxTokens: 2500, models: [{ model: 'deepseek-ai/deepseek-v4.1-flash', effort: 'medium' }], timeoutMs: 5 * 60 * 1000 }),
};
void RETIRED;

(async () => {
  const items = [];
  for (const [mid, m] of Object.entries(picks)) for (const p of m.picks) items.push({ key: `${p.cid}`, mid, claim: p.claim, quote: p.quote, abstract: abstractOf(p.cid), planted: false });
  // Planted errors: 8 real claims paired with an abstract from a different mechanism's source.
  const pool = items.slice();
  for (let i = 0; i < 8 && pool.length > 2; i++) {
    const a = pool[(i * 7) % pool.length];
    const b = pool.find((x) => x.mid !== a.mid && !x.planted && x.key !== a.key && (x.key.length + i) % 3 === 0) || pool.find((x) => x.mid !== a.mid);
    items.push({ key: `PLANT-${i + 1}`, mid: a.mid, claim: a.claim, quote: '', abstract: b.abstract, planted: true });
  }
  for (const it of items) {
    out[it.key] = out[it.key] || { mid: it.mid, claim: it.claim, planted: it.planted };
    for (const [name, run] of Object.entries(CHECKERS)) {
      if (out[it.key][name] && out[it.key][name].rating !== 'error') continue;
      const user = `Claim: ${it.claim}\n\nSource text:\n${String(it.abstract).slice(0, 4000)}`;
      try {
        const r = await run(user);
        out[it.key][name] = r ? r.data : { rating: 'error', problem: 'no answer' };
      } catch (e) { out[it.key][name] = { rating: 'error', problem: e.message }; }
      fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
    }
    console.log(it.key, it.planted ? 'PLANTED' : '', out[it.key].minimax && out[it.key].minimax.rating, out[it.key].mistral && out[it.key].mistral.rating);
  }
  const real = Object.values(out).filter((x) => !x.planted);
  const plant = Object.values(out).filter((x) => x.planted);
  const both = real.filter((x) => x.minimax && x.mistral && x.minimax.rating === 'supported' && x.mistral.rating === 'supported').length;
  console.log(`real ${real.length}: both supported ${both}, questioned ${real.length - both}`);
  for (const n of Object.keys(CHECKERS)) console.log(`${n} caught planted ${plant.filter((x) => x[n] && !['supported', 'error'].includes(x[n].rating)).length}/${plant.length}`);
})();
