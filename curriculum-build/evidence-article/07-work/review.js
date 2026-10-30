// Section 07 step 5: final review of every claim either checker questioned. GPT 6.1 Terra on Modelflare (half Sol's price there; on 29 Oct it dropped 6 of 8 planted wrong pairings to Sol's 2 of 8;
// a different family from the picker, DeepSeek, and the checkers, Qwen and Mistral) reads the abstract and both
// checkers' notes and either keeps the claim, rewrites it to what the source shows, or drops the pick.
// Guard: a rewritten claim may not add a number that is not in the abstract. Writes reviews.json.
const fs = require('fs');
const path = require('path');
const APP = path.join(__dirname, '..', '..', '..');
require(path.join(APP, 'node_modules', 'dotenv')).config({ path: path.join(APP, '..', '.env') });
process.env.MODELFLARE_MODEL_PLACEMENT = 'gpt-6.1-terra';
const modelflare = require(path.join(APP, 'services', 'providers', 'modelflare.js'));
const checks = require('./checks.json');
const picks = require('./picks.json');
const OUT = path.join(__dirname, 'reviews.json');
const out = fs.existsSync(OUT) ? require(OUT) : {};
const pickOf = (cid) => { for (const m of Object.values(picks)) { const p = m.picks.find((x) => x.cid === cid); if (p) return p; } return null; };
const cands = require('./candidates.json');
const abstractOf = (cid) => { for (const l of Object.values(cands)) { const c = l.find((x) => x.cid === cid); if (c) return c.abstract; } return ''; };
const nums = (s) => (String(s).match(/\d+(?:\.\d+)?/g) || []);
const SCHEMA = { type: 'object', properties: {
  decision: { type: 'string', enum: ['keep', 'rewrite', 'drop'] },
  claim: { type: 'string' },
  why: { type: 'string' },
}, required: ['decision', 'claim', 'why'] };
const SYSTEM = `You are the final reviewer of one citation in a research review. Decide from the source text only.
First: is the source about the same topic as the claim? If it studies something else, the answer is "drop": never rewrite a
claim to fit a source that is about a different topic.
"keep": the claim is fully supported as written. "rewrite": give the smallest rewrite that the source fully supports
(keep the topic; narrow the population, setting, strength or direction to what the source shows; "may" stays "may";
one study is not "studies show"; a correlation is not a cause). "drop": the source does not support any useful version.
Never add a number, population or finding the source does not state. Reply only through the tool.`;
(async () => {
  for (const [cid, x] of Object.entries(checks)) {
    // Only claims both checkers actually rated (an error is not a rating), and at least one questioned.
    const ok = (c) => c && c.rating && c.rating !== 'error';
    if (x.planted || !ok(x.minimax) || !ok(x.mistral) || (x.minimax.rating === 'supported' && x.mistral.rating === 'supported')) continue;
    if (out[cid] && out[cid].decision) continue;
    const p = pickOf(cid);
    const abs = abstractOf(cid);
    const user = `Claim: ${x.claim}\nQuote used: "${p ? p.quote : ''}"\nPopulation noted: ${p ? p.population : ''}\n\n` +
      `Checker A (${x.minimax && x.minimax.rating}): ${x.minimax && x.minimax.problem} Fix: ${x.minimax && x.minimax.smallest_fix}\n` +
      `Checker B (${x.mistral && x.mistral.rating}): ${x.mistral && x.mistral.problem} Fix: ${x.mistral && x.mistral.smallest_fix}\n\nSource text:\n${String(abs).slice(0, 4000)}`;
    try {
      const r = await modelflare.structured({ role: 'placement', system: SYSTEM, user, schema: SCHEMA, schemaName: 'review', maxTokens: 900 });
      const d = r && (r.data || r);
      if (!d || !d.decision) { console.log(cid, 'no answer'); continue; }
      const added = nums(d.claim).filter((n) => !nums(abs).includes(n) && !nums(x.claim).includes(n));
      if (d.decision === 'rewrite' && added.length) { d.decision = 'drop'; d.why = `guard: rewrite added numbers not in the source (${added.join(', ')}); ${d.why}`; }
      out[cid] = { mid: x.mid, old: x.claim, ...d, model: (r && r.model) || 'gpt-6.1-terra' };
      fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
      console.log(cid, d.decision);
    } catch (e) { console.log(cid, 'error', e.message.slice(0, 80)); }
  }
  const v = Object.values(out);
  console.log(`reviewed ${v.length}: keep ${v.filter((r) => r.decision === 'keep').length}, rewrite ${v.filter((r) => r.decision === 'rewrite').length}, drop ${v.filter((r) => r.decision === 'drop').length}`);
})();
