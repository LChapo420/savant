#!/usr/bin/env node
/**
 * What share of claims can be linked to a real passage, per subject and grade? A seeded sample of claims from every stored level (rules, facts, definitions, word meanings, formulas, steps; not illustrations, advice or answer keys).
 * Sources by subject: Wiktionary for Spanish words, offline Wikipedia for everything, CC BY OpenStax for math. Two readers of the same passages: the local models (free), and a cheap model that must quote.
 *   node scripts/fact-100/source-share.js [perGroup=60] [model=ds41_coral] [par=2]
 * Output: TMP/raw-100/sourceshare.jsonl, docs/fact-100/source-share.json. "contradicted" lines are candidates for real errors: they go to the capture-recapture as an independent list only after a ruling.
 */
const C = require('./common');
const { L } = C;
const S = require('../../services/fact-source');
const T = require('../../services/fact-textbooks');
const D = require('../../services/fact-dictionary');
const J = require('../fact-gate/judges');

const [, , PER = '60', MODEL = 'ds41_coral', PAR = '2'] = process.argv;
const OUT = L.path.join(C.RAW, 'sourceshare.jsonl');
const SYSTEM = 'You compare a sentence from a lesson with passages from a reference. Answer ONLY from the passages, never from what you remember. supported: the passages say the same thing. contradicted: the passages clearly say otherwise. silent: the passages do not settle it (the most common answer). If supported or contradicted, quote the deciding words exactly.';
const SCHEMA = { type: 'object', required: ['verdict', 'quote'], properties: { verdict: { type: 'string', enum: ['supported', 'contradicted', 'silent'] }, quote: { type: 'string' } } };
const TYPES = new Set(['fact', 'rule', 'definition', 'vocab', 'formula', 'procedure']);
const inPassage = (q, docs) => docs.some((d) => d.text.toLowerCase().includes(String(q || '').toLowerCase().slice(0, 40)));

(async () => {
  const rows = L.readJsonl(L.path.join(C.RAW, 'claims.ds41_coral.jsonl'));
  const groups = new Map();
  for (const r of rows) for (const c of r.claims) if (TYPES.has(c.type)) { const g = `${r.track}/${r.grade}`; if (!groups.has(g)) groups.set(g, []); groups.get(g).push({ ...c, level: r.level, track: r.track, group: g, key: L.hash(`${r.level}|${c.text}`) }); }
  const sample = [...groups.values()].flatMap((list) => list.sort((a, b) => (a.key < b.key ? -1 : 1)).slice(0, Number(PER)));
  const done = new Set(L.readJsonl(OUT).map((r) => r.key));
  console.log(`claims in sample ${sample.length}, done ${done.size}`);
  await L.runPool(sample.filter((c) => !done.has(c.key)), Number(PAR), async (c) => {
    try {
      const t0 = Date.now();
      const docs = [];
      if (c.track === 'spanish') docs.push(...await D.passagesFor(c.text, 'Spanish', 2));
      if (c.track === 'math') docs.push(...T.search(c.text, { track: 'math', k: 3 }));
      docs.push(...await S.fromOffline(c.text, { topic: c.group.replace('/', ' ').replace(/_/g, ' '), k: 3 }));
      const retrieveMs = Date.now() - t0;
      if (!docs.length) { L.appendJsonl(OUT, { key: c.key, level: c.level, group: c.group, track: c.track, type: c.type, text: c.text.slice(0, 200), verdict: 'silent', nli: null, docs: 0, retrieveMs }); return; }
      const sc = await S.stage1(docs.map((d) => ({ doc: d.text, claim: c.text })));
      let best = 0; sc.forEach((s, i) => { if (S.strength(s) > S.strength(sc[best])) best = i; });
      const r = await J.callModel(MODEL, { system: SYSTEM, user: `LESSON SENTENCE (subject: ${c.group}): ${c.text}\n\nPASSAGES\n${docs.map((d, i) => `[${i + 1}] ${d.title}: ${d.text}`).join('\n')}`, schema: SCHEMA, schemaName: 'submit_verdict', maxTokens: 800 });
      let v = r.data.verdict; if (v !== 'silent' && !inPassage(r.data.quote, docs)) v = 'silent';
      L.appendJsonl(OUT, { key: c.key, level: c.level, group: c.group, track: c.track, type: c.type, text: c.text.slice(0, 240), verdict: v, quote: String(r.data.quote || '').slice(0, 200), nli: sc[best], title: docs[best].title, sourceKinds: [...new Set(docs.map((d) => d.source))], cost: r.cost || 0, retrieveMs });
    } catch (e) { console.log('fail', String(e.message).slice(0, 100)); }
  });
  const res = L.readJsonl(OUT);
  const out = { groups: {}, byType: {}, contradicted: [] };
  const pc = (a, b) => (b ? Math.round(100 * a / b) : 0);
  const nliOk = (r) => r.nli && S.supported(r.nli);
  for (const g of [...new Set(res.map((r) => r.group))].sort()) { const q = res.filter((r) => r.group === g); out.groups[g] = { n: q.length, localSourced: pc(q.filter(nliOk).length, q.length), comparedSupported: pc(q.filter((r) => r.verdict === 'supported').length, q.length), contradicted: q.filter((r) => r.verdict === 'contradicted').length, eitherSourced: pc(q.filter((r) => nliOk(r) || r.verdict === 'supported').length, q.length) }; }
  for (const t of TYPES) { const q = res.filter((r) => r.type === t); out.byType[t] = { n: q.length, comparedSupported: pc(q.filter((r) => r.verdict === 'supported').length, q.length) }; }
  out.contradicted = res.filter((r) => r.verdict === 'contradicted').map((r) => ({ level: r.level, text: r.text, quote: r.quote, title: r.title }));
  out.costPerClaim = res.reduce((a, r) => a + (r.cost || 0), 0) / Math.max(1, res.length);
  out.retrieveMsPerClaim = Math.round(res.reduce((a, r) => a + (r.retrieveMs || 0), 0) / Math.max(1, res.length));
  L.writeJson(L.path.join(L.DOCS, '..', 'fact-100', 'source-share.json'), out);
  console.log('group, n, local sourced %, passage compared supported %, either %, contradicted');
  for (const [g, v] of Object.entries(out.groups)) console.log(g.padEnd(42), v.n, `${v.localSourced}%`, `${v.comparedSupported}%`, `${v.eitherSourced}%`, v.contradicted);
  console.log(JSON.stringify(out.byType));
  console.log(`$ a claim ${out.costPerClaim.toFixed(5)}, retrieve ms ${out.retrieveMsPerClaim}`);
  process.exit(0);
})();
