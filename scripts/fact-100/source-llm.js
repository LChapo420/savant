#!/usr/bin/env node
/**
 * The same true and wrong twin sentences (pairs.bank.dev.jsonl from source-pairs.js), but reading real passages with a cheap model instead of the local entailment models.
 * Still text comparison: the model must quote the passage and answer from it alone, so a claim with no passage cannot pass on memory.
 *   node scripts/fact-100/source-llm.js <set> <wiki|book|wikibook> [model=glm_flash_gonka] [par=3]
 * Also the local models on textbook passages for the same pairs (nli field), to set them side by side.
 */
const C = require('./common');
const { L } = C;
const S = require('../../services/fact-source');
const T = require('../../services/fact-textbooks');
const D = require('../../services/fact-dictionary');
const J = require('../fact-gate/judges');

const [, , SET = 'dev', MODE = 'wikibook', MODEL = 'glm_flash_gonka', PAR = '3'] = process.argv;
const OUT = L.path.join(C.RAW, `srcllm.${MODE}.${MODEL}.${SET}.jsonl`);
const SYSTEM = 'You compare a sentence from a lesson with passages from a reference. Answer ONLY from the passages, never from what you remember. supported: the passages say the same thing. contradicted: the passages clearly say otherwise. silent: the passages do not settle it (the most common answer). If supported or contradicted, quote the deciding words exactly.';
const SCHEMA = { type: 'object', required: ['verdict', 'quote'], properties: { verdict: { type: 'string', enum: ['supported', 'contradicted', 'silent'] }, quote: { type: 'string' } } };

const docsFor = async (claim, track, topic) => {
  const out = [];
  if (MODE.includes('book')) out.push(...T.search(claim, { track, k: 3 }));
  if (MODE.includes('wiki')) out.push(...await S.fromOffline(claim, { topic, k: 3 }));
  return out;
};
const passageCheck = (text, docs) => docs.some((d) => d.text.toLowerCase().includes(String(text || '').toLowerCase().slice(0, 40)));

(async () => {
  const pairs = L.readJsonl(L.path.join(C.RAW, `pairs.bank.${SET}.jsonl`));
  const levels = C.loadSet(SET).plants; const byId = new Map(levels.map((p) => [p.id, p]));
  const done = new Set(L.readJsonl(OUT).map((r) => r.id));
  await L.runPool(pairs.filter((p) => !done.has(p.id)), Number(PAR), async (p) => {
    const plant = byId.get(p.id); const topic = plant.level.split('/').slice(0, 2).join(' ');
    const one = async (claim) => {
      const docs = await docsFor(claim, plant.track, topic);
      if (!docs.length) return { verdict: 'silent', docs: 0, cost: 0 };
      const nli = await S.stage1(docs.map((d) => ({ doc: d.text, claim }))).catch(() => []);
      const best = nli.reduce((a, s) => (!a || S.strength(s) > S.strength(a) ? s : a), null);
      const user = `LESSON SENTENCE (subject: ${topic}): ${claim}\n\nPASSAGES\n${docs.map((d, i) => `[${i + 1}] ${d.title}: ${d.text}`).join('\n')}`;
      const r = await J.callModel(MODEL, { system: SYSTEM, user, schema: SCHEMA, schemaName: 'submit_verdict', maxTokens: 800 });
      let v = r.data.verdict; const q = r.data.quote;
      if (v !== 'silent' && q && !passageCheck(q, docs)) v = 'silent'; // a verdict must quote the passage: memory does not count
      return { verdict: v, docs: docs.length, cost: r.cost || 0, nli: best, title: docs[0].title, quote: String(q || '').slice(0, 160) };
    };
    try {
      const [t, w] = [await one(p.clean), await one(p.bad)];
      L.appendJsonl(OUT, { id: p.id, kind: p.kind, track: p.track, clean: p.clean.slice(0, 200), bad: p.bad.slice(0, 200), t, w });
    } catch (e) { console.log('fail', p.id, String(e.message).slice(0, 100)); }
  });
  const rows = L.readJsonl(OUT);
  const count = (f) => rows.filter(f).length;
  console.log(`${SET} ${MODE} ${MODEL}: pairs ${rows.length}, $ ${rows.reduce((a, r) => a + (r.t.cost || 0) + (r.w.cost || 0), 0).toFixed(4)}`);
  for (const v of ['supported', 'contradicted', 'silent']) console.log(v.padEnd(14), `true twin ${count((r) => r.t.verdict === v)}, wrong twin ${count((r) => r.w.verdict === v)}`);
  const byTrack = {}; for (const r of rows) { const b = byTrack[r.track] = byTrack[r.track] || { n: 0, tSup: 0, tCon: 0, wCon: 0, wSup: 0 }; b.n++; if (r.t.verdict === 'supported') b.tSup++; if (r.t.verdict === 'contradicted') b.tCon++; if (r.w.verdict === 'contradicted') b.wCon++; if (r.w.verdict === 'supported') b.wSup++; }
  console.log(JSON.stringify(byTrack));
  for (const th of [0.3, 0.5]) console.log(`local models both>=${th}: true twin sourced ${count((r) => r.t.nli && r.t.nli.factcg >= th && r.t.nli.minicheck >= th)}, wrong twin sourced ${count((r) => r.w.nli && r.w.nli.factcg >= th && r.w.nli.minicheck >= th)}`);
  process.exit(0);
})();
void D;
