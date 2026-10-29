// Sol on the same planted pairs, for a fair comparison with Terra. Is GPT 6.1 Terra (half Sol's price) good enough to be the final reviewer? Same prompt as review.js, run on:
// the 32 claims Sol reviewed (agreement), the 8 planted wrong pairings (must be dropped), and 10 claims both
// checkers fully supported (should be kept). Writes calib-sol.json.
const fs = require('fs');
const path = require('path');
const APP = path.join(__dirname, '..', '..', '..');
require(path.join(APP, 'node_modules', 'dotenv')).config({ path: path.join(APP, '..', '.env') });
process.env.MODELFLARE_MODEL_PLACEMENT = 'gpt-6.1-sol';
const modelflare = require(path.join(APP, 'services', 'providers', 'modelflare.js'));
const checks = require('./checks.json');
const sol = require('./reviews.json');
const picks = require('./picks.json');
const cands = require('./candidates.json');
const pickOf = (cid) => { for (const m of Object.values(picks)) { const p = m.picks.find((x) => x.cid === cid); if (p) return p; } return null; };
const abstractOf = (cid) => { for (const l of Object.values(cands)) { const c = l.find((x) => x.cid === cid); if (c) return c.abstract; } return ''; };
// The review prompt and schema, copied from review.js so both models get exactly the same task.
const src = fs.readFileSync(path.join(__dirname, 'review.js'), 'utf8');
const SYSTEM = src.match(/const SYSTEM = `([\s\S]*?)`;/)[1];
const SCHEMA = { type: 'object', properties: { decision: { type: 'string', enum: ['keep', 'rewrite', 'drop'] }, claim: { type: 'string' }, why: { type: 'string' } }, required: ['decision', 'claim', 'why'] };
const OUT = path.join(__dirname, 'calib-sol.json');
const out = fs.existsSync(OUT) ? require(OUT) : {};
// Planted pairs: rebuilt exactly as check.js did (a real claim with another mechanism's abstract).
const items = [];
for (const [mid, m] of Object.entries(picks)) for (const p of m.picks) items.push({ key: p.cid, mid, claim: p.claim, abstract: abstractOf(p.cid) });
const planted = [];
for (let i = 0; i < 8 && items.length > 2; i++) {
  const a = items[(i * 7) % items.length];
  const b = items.find((x) => x.mid !== a.mid && x.key !== a.key && (x.key.length + i) % 3 === 0) || items.find((x) => x.mid !== a.mid);
  planted.push({ key: `PLANT-${i + 1}`, claim: a.claim, abstract: b.abstract, quote: '', expect: 'drop' });
}
const reviewed = Object.keys(sol).map((cid) => ({ key: cid, claim: checks[cid].claim, abstract: abstractOf(cid), quote: (pickOf(cid) || {}).quote || '', expect: `sol:${sol[cid].decision}` }));
const clean = Object.entries(checks).filter(([, x]) => !x.planted && x.qwen && x.mistral && x.qwen.rating === 'supported' && x.mistral.rating === 'supported').slice(0, 10)
  .map(([cid, x]) => ({ key: `CLEAN-${cid}`, claim: x.claim, abstract: abstractOf(cid), quote: (pickOf(cid) || {}).quote || '', expect: 'keep' }));
(async () => {
  for (const it of [...planted]) {
    if (out[it.key]) continue;
    const c = checks[it.key] || {};
    const user = `Claim: ${it.claim}\nQuote used: "${it.quote}"\n\n` + (c.qwen ? `Checker A (${c.qwen.rating}): ${c.qwen.problem} Fix: ${c.qwen.smallest_fix}\nChecker B (${c.mistral.rating}): ${c.mistral.problem} Fix: ${c.mistral.smallest_fix}\n\n` : '') + `Source text:\n${String(it.abstract).slice(0, 4000)}`;
    try {
      const r = await modelflare.structured({ role: 'placement', system: SYSTEM, user, schema: SCHEMA, schemaName: 'review', maxTokens: 900 });
      const d = r && (r.data || r);
      out[it.key] = { expect: it.expect, decision: d && d.decision, claim: d && d.claim };
    } catch (e) { out[it.key] = { expect: it.expect, decision: 'error', claim: e.message.slice(0, 80) }; }
    fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  }
  const v = Object.entries(out);
  const pl = v.filter(([k]) => k.startsWith('PLANT'));
  const cl = v.filter(([k]) => k.startsWith('CLEAN'));
  const rv = v.filter(([, x]) => x.expect.startsWith('sol:') && x.decision !== 'error');
  console.log(`planted wrong pairs dropped: ${pl.filter(([, x]) => x.decision === 'drop').length}/${pl.length} (rewrite ${pl.filter(([, x]) => x.decision === 'rewrite').length}, keep ${pl.filter(([, x]) => x.decision === 'keep').length})`);
  console.log(`clean claims kept: ${cl.filter(([, x]) => x.decision === 'keep').length}/${cl.length} (rewrite ${cl.filter(([, x]) => x.decision === 'rewrite').length}, drop ${cl.filter(([, x]) => x.decision === 'drop').length})`);
  console.log(`same decision as Sol on the ${rv.length} reviewed claims: ${rv.filter(([, x]) => `sol:${x.decision}` === x.expect).length}; Terra kept ${rv.filter(([, x]) => x.decision === 'keep').length}, rewrote ${rv.filter(([, x]) => x.decision === 'rewrite').length}, dropped ${rv.filter(([, x]) => x.decision === 'drop').length}`);
})();
