#!/usr/bin/env node
/**
 * The check a rewrite passes on its way to one learner: errors added AFTER the level was verified. Local and free: mechanical tokens, then a local entailment read against the bank, then (optional) a cheap ruling on what was flagged.
 *   node scripts/fact-100/rewrite-check.js <dev|dev2|heldout> [threshold=0.3] [rule=model]
 * Catch: planted sentences as stand-ins for an error a rewrite added (the plant's own level, clean, is the bank). False alarms: every sentence of the real rewrites from the pilot.
 * Thresholds may be picked on dev and dev2 only. A flag is a claim with no support in the bank: the sentence goes back to the writer, so a false alarm costs a rewrite of one sentence, not a wrong fact.
 */
const C = require('./common');
const { L } = C;
const S = require('../../services/fact-source');
const B = require('../../services/fact-bank');
const J = require('../fact-gate/judges');

const [, , SPLIT = 'dev', TH = '0.3', RULE = ''] = process.argv;
const SET = SPLIT === 'dev' ? 'dev' : 'heldout';
const th = Number(TH);
const below = (s) => !(s.factcg >= th && s.minicheck >= th);
const RULE_SYSTEM = 'You compare a sentence from a rewritten lesson with the verified facts it must rest on. A personal example is fine as long as what it teaches follows from the facts. Answer ONLY from the facts given, not from memory. supported: what the sentence teaches follows from the facts. unsupported: it states something the facts do not say, or the opposite of what they say.';
const RULE_SCHEMA = { type: 'object', required: ['verdict'], properties: { verdict: { type: 'string', enum: ['supported', 'unsupported'] }, why: { type: 'string' } } };
const claimRows = new Map(L.readJsonl(L.path.join(C.RAW, 'claims.ds41_coral.jsonl')).map((r) => [r.level, r]));
const factsOf = (level) => (claimRows.get(level) ? claimRows.get(level).claims.filter((c) => !['illustration', 'pedagogy'].includes(c.type)).map((c) => c.text) : []);
const strings = (o, out = []) => { if (typeof o === 'string') out.push(o); else if (Array.isArray(o)) o.forEach((x) => strings(x, out)); else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) if (!/^(id|block|color|colour|icon|timing|format|fen|emoji|type|kind)$/i.test(k)) strings(v, out); return out; };
const lessonText = (lv) => [...lv.blocks.map((b) => strings(b.data).join(' ')), ...lv.checks.map((c) => strings({ p: c.prompt, r: c.rationale }).join(' '))];
const sentences = (t) => String(t).replace(/\[\[eg\]\][\s\S]*?\[\[\/eg\]\]/g, ' ').split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter((x) => x.length > 15 && /[a-z]{3}/i.test(x));

async function rule(sentence, facts) {
  const top = S.fromBank(sentence, facts, 6).map((x) => x.text);
  const r = await J.callModel(RULE, { system: RULE_SYSTEM, user: `VERIFIED FACTS\n${top.map((f) => `- ${f}`).join('\n')}\n\nSENTENCE: ${sentence}`, schema: RULE_SCHEMA, schemaName: 'submit_verdict', maxTokens: 500 });
  return r.data.verdict === 'unsupported';
}

(async () => {
  const levels = C.levelMap();
  const pairs = L.readJsonl(L.path.join(C.RAW, `pairs.bank.${SET}.jsonl`)).filter((p) => SPLIT === 'dev' || (C.loadSet(SET).plants.find((x) => x.id === p.id) || {}).split === SPLIT);
  const byId = new Map(C.loadSet(SET).plants.map((p) => [p.id, p]));
  const out = { split: SPLIT, threshold: th, rule: RULE || null, plants: {} };
  const tally = { all: { n: 0, mech: 0, nli: 0, ruled: 0, any: 0 } };
  await L.runPool(pairs, RULE ? 3 : 8, async (p) => {
    const plant = byId.get(p.id); const lv = levels.get(plant.level); if (!lv) return;
    const facts = factsOf(plant.level);
    const allowed = B.allowedFrom([...facts, ...lessonText(lv)], lv.track);
    const mech = B.mechanicalCheck(p.bad, allowed, { track: lv.track }).missing.length > 0;
    const nli = below(p.w);
    let ruled = nli;
    if (nli && RULE) { try { ruled = await rule(p.bad, facts); } catch { ruled = true; } }
    for (const k of ['all', plant.kind]) { const t = tally[k] = tally[k] || { n: 0, mech: 0, nli: 0, ruled: 0, any: 0 }; t.n++; if (mech) t.mech++; if (nli) t.nli++; if (ruled) t.ruled++; if (mech || ruled) t.any++; }
  });
  out.plants = tally;
  for (const [k, t] of Object.entries(tally)) console.log(k.padEnd(28), `n=${t.n} mechanical ${L.fmtRate(t.mech, t.n)}; entailment ${L.fmtRate(t.nli, t.n)}; +ruling ${L.fmtRate(t.ruled, t.n)}; either ${L.fmtRate(t.any, t.n)}`);
  // False alarms on real rewrites.
  const rows = L.readJsonl(L.path.join(C.RAW, 'rewrites.jsonl')).filter((r) => r.bankText);
  let n = 0; let fl = 0; let ruled = 0; const lvFlags = []; const sample = [];
  const t0 = Date.now(); let pairsRun = 0;
  for (const r of rows) {
    const facts = factsOf(r.level); const lv = levels.get(r.level);
    const bank = [...facts, ...lessonText(lv)];
    const sents = sentences(r.bankText);
    const docs = sents.map((s) => ({ doc: S.fromBank(s, bank, 5).map((x) => x.text).join(' ') || 'none', claim: s }));
    const sc = await S.stage1(docs); pairsRun += docs.length; // eslint-disable-line no-await-in-loop
    let f = 0; let fr = 0;
    for (let i = 0; i < sents.length; i++) {
      n++;
      if (below(sc[i])) {
        fl++; f++;
        let keep = true;
        if (RULE) { try { keep = await rule(sents[i], bank); } catch { keep = true; } } // eslint-disable-line no-await-in-loop
        if (keep) { ruled++; fr++; if (sample.length < 12 && parseInt(L.hash(sents[i]), 16) % 5 === 0) sample.push(sents[i].slice(0, 140)); }
      }
    }
    lvFlags.push({ level: r.level, learner: r.learner, sentences: sents.length, flagged: f, afterRuling: fr });
  }
  out.rewrites = { rewrites: rows.length, sentences: n, flagged: fl, afterRuling: ruled, msPerPair: pairsRun ? Math.round((Date.now() - t0) / pairsRun) : null, perRewriteAfterRuling: rows.length ? +(ruled / rows.length).toFixed(2) : 0, cleanRewrites: lvFlags.filter((x) => !x.afterRuling).length };
  console.log('real rewrites:', JSON.stringify(out.rewrites));
  console.log('sample of what stays flagged:', sample.join(' | ').slice(0, 1200));
  L.writeJson(L.path.join(L.DOCS, '..', 'fact-100', `rewrite-check-${SPLIT}${RULE ? '-ruled' : ''}.json`), out);
  process.exit(0);
})();
