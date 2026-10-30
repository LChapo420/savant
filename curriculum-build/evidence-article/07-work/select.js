// Section 07 step 2 (rerun for the mechanisms the first pass missed): shorter abstracts, 18 candidates (seeds, then most cited), xKiro as fallback.
// Section 07 step 2: a free model (NVIDIA GLM 5.3, then DeepSeek V4.1) picks the sources for each mechanism from its
// candidates and gives a verbatim quote for each. Every quote is checked against the abstract here; a pick whose quote
// is not verbatim, or longer than 25 words, is dropped. Writes picks.json. No learner data is sent.
const fs = require('fs');
const path = require('path');
const APP = path.join(__dirname, '..', '..', '..');
require(path.join(APP, 'node_modules', 'dotenv')).config({ path: path.join(APP, '..', '.env') });
const nvidia = require(path.join(APP, 'services', 'providers', 'nvidia.js'));
process.env.XKIRO_PIPELINE = '1';
process.env.XKIRO_USAGE_FILE = process.env.XKIRO_USAGE_FILE || path.join(APP, 'data', 'xkiro-usage.json');
const { xkiro } = require(path.join(APP, 'services', 'providers', 'xkiro.js'));
process.env.STANDARD_COMPUTE_PIPELINE = '1';
const { standardCompute } = require(path.join(APP, 'services', 'providers', 'standard-compute.js'));
const mechs = require('./mechanisms.json');
const cands = require('./candidates.json');
const OUT = path.join(__dirname, 'picks.json');
const out = fs.existsSync(OUT) ? require(OUT) : {};

const MODELS = [{ model: 'z-ai/glm-5.3', effort: 'medium' }, { model: 'deepseek-ai/deepseek-v4.1-flash', effort: 'medium' }];
const flat = (s) => String(s || '').normalize('NFKC').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[‐-―]/g, '-').replace(/\s+/g, ' ').trim().toLowerCase();
const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;

const SCHEMA = {
  type: 'object',
  properties: {
    picks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          cid: { type: 'string' },
          claim: { type: 'string' },
          quote: { type: 'string' },
          population: { type: 'string' },
          stance: { type: 'string', enum: ['supports', 'against', 'mixed', 'context'] },
        },
        required: ['cid', 'claim', 'quote', 'population', 'stance'],
      },
    },
    verdict: { type: 'string', enum: ['strong', 'moderate', 'mixed', 'design choice'] },
    verdict_why: { type: 'string' },
    code_vs_evidence: { type: 'string' },
  },
  required: ['picks', 'verdict', 'verdict_why', 'code_vs_evidence'],
};

const SYSTEM = `You are a careful research assistant checking an education app's design against peer-reviewed evidence.
You only use the abstracts you are given. A quote must be copied EXACTLY, word for word, from the abstract (at most 25 words).
Never overstate: keep the direction of the effect, the population and the setting the source studied. "May" stays "may";
one study is not "studies show"; a correlation is not a cause. Prefer meta-analyses, reviews and randomized trials.
Include sources that cut AGAINST the design when they exist. Reply only through the tool.`;

async function pick(m, avoid) {
  const list = cands[m.id].slice().sort((a, b) => (b.seed ? 1 : 0) - (a.seed ? 1 : 0) || (b.cited_by || 0) - (a.cited_by || 0)).slice(0, 18).map((c) => `[${c.cid}] ${c.first_author || ''} (${c.year}). ${c.title}. ${c.venue || ''}. ${c.type || ''}. Cited ${c.cited_by || 0}.\nAbstract: ${String(c.abstract).slice(0, 1100)}`).join('\n\n');
  const user = `Mechanism ${m.id}: ${m.name}\nWhat the app does: ${m.does}\nClaims worth checking: ${m.claim_topics.join('; ')}\n\n` +
    `Pick 4 to 6 sources from the candidates that bear on this mechanism (supporting it, against it, or mixed). For each give the claim it supports in one plain sentence, a verbatim quote of at most 25 words from its abstract, and the population or setting studied. ` +
    `Then a verdict: strong (several converging studies or a meta-analysis), moderate, mixed (say what conflicts), or design choice (no study of the exact rule; sources back the general principle). Then say whether the app's rule matches the evidence and any gap.\n` +
    (avoid ? `\nYour last answer had quotes that are not verbatim in the abstract: ${avoid}. Copy quotes exactly this time.\n` : '') +
    `\nCandidates:\n${list}`;
  let r = null;
  // Standard Compute first (the same DeepSeek V4.1 Flash, paid, no free-tier rate limit; owner allowed paid keys for speed
  // on 29 Oct; ledger capped). Abstracts only, no learner data. Free NVIDIA, then xKiro, behind it.
  try { r = await standardCompute.structured({ task: 'evidence_select', system: SYSTEM, user, schema: SCHEMA, schemaName: 'submit_picks', maxTokens: 6000, timeoutMs: 5 * 60 * 1000 }); } catch (e) { console.log(`  ${m.id} standard compute: ${e.message}; trying NVIDIA`); }
  if (!r) { try { r = await nvidia.structured({ role: 'deep', system: SYSTEM, user, schema: SCHEMA, schemaName: 'submit_picks', maxTokens: 6000, models: MODELS, timeoutMs: 6 * 60 * 1000 }); } catch (e) { console.log(`  ${m.id} nvidia: ${e.message}; trying xKiro`); } }
  if (!r) r = await xkiro.structured({ system: SYSTEM, user, schema: SCHEMA, schemaName: 'submit_picks', maxTokens: 4000, models: ['qwen/qwen3.8-max:free', 'mistralai/mistral-large-2512'], timeoutMs: 6 * 60 * 1000 });
  if (!r) throw new Error('no answer');
  return { ...r.data, _model: r.model, _usage: r.usage };
}

function check(m, res) {
  const byId = new Map(cands[m.id].map((c) => [c.cid, c]));
  const ok = [];
  const bad = [];
  for (const p of res.picks || []) {
    const c = byId.get(p.cid);
    if (!c) { bad.push(`${p.cid} (no such candidate)`); continue; }
    const q = flat(p.quote).replace(/^"|"$/g, '').replace(/\.\.\.|…/g, '');
    if (!q || !flat(c.abstract).includes(q)) { bad.push(`${p.cid} "${String(p.quote).slice(0, 60)}"`); continue; }
    if (words(p.quote) > 25) { bad.push(`${p.cid} (quote over 25 words)`); continue; }
    ok.push({ ...p, doi: c.doi, url: c.url || (c.doi ? `https://doi.org/${c.doi}` : null), title: c.title, year: c.year, first_author: c.first_author, venue: c.venue, type: c.type, abstract_src: c.abstract_src || 'openalex' });
  }
  return { ok, bad };
}

(async () => {
  for (const m of mechs) {
    if (out[m.id] && out[m.id].picks && out[m.id].picks.length >= 3) continue;
    let res;
    let checked;
    let avoid = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try { res = await pick(m, avoid); } catch (e) { console.log(`${m.id}: ${e.message}`); break; }
      checked = check(m, res);
      if (!checked.bad.length || checked.ok.length >= 4) break;
      avoid = checked.bad.join('; ');
    }
    if (!res) continue;
    out[m.id] = { verdict: res.verdict, verdict_why: res.verdict_why, code_vs_evidence: res.code_vs_evidence, picks: checked.ok, dropped: checked.bad, model: res._model };
    console.log(`${m.id}: ${checked.ok.length} verified picks, ${checked.bad.length} dropped, verdict ${res.verdict} (${res._model})`);
    fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  }
})();
