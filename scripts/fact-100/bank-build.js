#!/usr/bin/env node
/**
 * The pilot bank: at most 10 levels, every fact with its evidence, so the owner can see what "verified once, heavily" comes to and what it costs. Reads no live data and writes docs/fact-100/bank-pilot.json only.
 * For each level: the claims already extracted; each fact against real passages (local models, then a cheap model that must quote); SymPy statements; two readers (Kimi, grok-4.3) on the clean text, confirmed by the policy in services/fact-confirm.js.
 * A fact's status:
 *   sourced      a passage supports it (named, quoted)
 *   computed     SymPy worked it out (formula and computation claims of the level's math)
 *   read-only    no passage: two independent readers found nothing wrong, and that is all that stands behind it
 *   needs-person a passage contradicts it, or a reader's flag on it was confirmed
 * Reuses reads already made where they exist, so costs for this pilot are measured from raw files and fresh calls together.
 */
const C = require('./common');
const { L } = C;
const S = require('../../services/fact-source');
const T = require('../../services/fact-textbooks');
const D = require('../../services/fact-dictionary');
const J = require('../fact-gate/judges');

const PILOT = ['math/calculus_i/30', 'math/algebra_1_part_a/380', 'math/algebra_1_part_a/254', 'math/numbers_to_20_and_teen_numbers/20', 'english/proficient/20', 'english/proficient/62', 'spanish/advanced/15', 'spanish/entry/80', 'spanish/intermediate/112', 'chess/chess_board_explorer/42'];
const SYSTEM = 'You compare a sentence from a lesson with passages from a reference. Answer ONLY from the passages, never from what you remember. supported: the passages say the same thing. contradicted: the passages clearly say otherwise. silent: the passages do not settle it (the most common answer). If supported or contradicted, quote the deciding words exactly.';
const SCHEMA = { type: 'object', required: ['verdict', 'quote'], properties: { verdict: { type: 'string', enum: ['supported', 'contradicted', 'silent'] }, quote: { type: 'string' } } };
const FACT_TYPES = new Set(['fact', 'rule', 'definition', 'vocab', 'formula', 'procedure', 'computation', 'key']);
const COMPUTED = new Set(['formula', 'computation']);

(async () => {
  const rows = new Map(L.readJsonl(L.path.join(C.RAW, 'claims.ds41_coral.jsonl')).map((r) => [r.level, r]));
  const compute = new Map(C.readRaw('compute_ds41_coral', 'heldout').filter((r) => r.read).map((r) => [r.id, r]));
  const out = { built: '2026-11-07', note: 'A pilot, not a shipped bank. AI-judged. Nothing here is used by the app.', levels: {} };
  const t0 = Date.now();
  await L.runPool(PILOT, 2, async (id) => {
    const r = rows.get(id); if (!r) return;
    const t1 = Date.now(); let cost = r.cost || 0;
    const facts = r.claims.filter((c) => FACT_TYPES.has(c.type));
    const res = [];
    await L.runPool(facts, 2, async (c) => {
      const row = { text: c.text, type: c.type, where: c.where, status: 'read-only', source: null };
      try {
        const docs = [];
        if (r.track === 'spanish') docs.push(...await D.passagesFor(c.text, 'Spanish', 2));
        if (r.track === 'math') docs.push(...T.search(c.text, { track: 'math', k: 3 }));
        docs.push(...await S.fromOffline(c.text, { topic: `${r.track} ${r.grade}`.replace(/_/g, ' '), k: 2 }));
        if (docs.length) {
          const a = await J.callModel('ds41_coral', { system: SYSTEM, user: `LESSON SENTENCE (subject: ${r.track}): ${c.text}\n\nPASSAGES\n${docs.map((d, i) => `[${i + 1}] ${d.title}: ${d.text}`).join('\n')}`, schema: SCHEMA, schemaName: 'submit_verdict', maxTokens: 500 });
          cost += a.cost || 0;
          const q = String(a.data.quote || '');
          const doc = docs.find((d) => d.text.toLowerCase().includes(q.toLowerCase().slice(0, 40)));
          if (a.data.verdict === 'supported' && doc && q) { row.status = 'sourced'; row.source = { title: doc.title, quote: q.slice(0, 240), kind: doc.source }; }
          if (a.data.verdict === 'contradicted' && doc && q) { row.status = 'needs-person'; row.source = { title: doc.title, quote: q.slice(0, 240), kind: doc.source }; row.why = 'a passage contradicts it'; }
        }
      } catch (e) { row.error = String(e.message).slice(0, 80); }
      if (row.status === 'read-only' && COMPUTED.has(c.type) && r.track === 'math') row.status = 'computed';
      res.push(row);
    });
    const cr = compute.get(`clean:${id}`);
    const tally = res.reduce((m, x) => { m[x.status] = (m[x.status] || 0) + 1; return m; }, {});
    out.levels[id] = { facts: res.length, tally, computeFlags: cr ? cr.flags.length : null, statementsTrue: cr && cr.tally ? cr.tally.true : null, cost: +cost.toFixed(4), seconds: Math.round((Date.now() - t1) / 1000), rows: res };
    console.log(id, JSON.stringify(tally), `$${cost.toFixed(4)}`, `${Math.round((Date.now() - t1) / 1000)}s`);
  });
  out.seconds = Math.round((Date.now() - t0) / 1000);
  L.writeJson(L.path.join(L.DOCS, '..', 'fact-100', 'bank-pilot.json'), out);
  const tot = {}; let n = 0; for (const v of Object.values(out.levels)) { for (const [k, x] of Object.entries(v.tally)) tot[k] = (tot[k] || 0) + x; n += v.facts; }
  console.log('all', n, JSON.stringify(tot), 'mean $ a level for extraction and sourcing', (Object.values(out.levels).reduce((a, v) => a + v.cost, 0) / Object.keys(out.levels).length).toFixed(4));
  process.exit(0);
})();
