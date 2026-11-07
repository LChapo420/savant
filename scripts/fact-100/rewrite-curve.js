#!/usr/bin/env node
/**
 * The trade-off for the rewrite check: local entailment threshold, then a cheap ruling against the bank that must find the sentence contradicted or unsupported.
 *   node scripts/fact-100/rewrite-curve.js <dev|dev2|heldout> [model=ds41_coral] [par=3]
 * Catch: planted wrong sentences, each with the clean level as bank. False alarms: all sentences of the 29 real rewrites from the pilot (those are not known to be right: what stays flagged is read by hand).
 * Rulings are cached by sentence: TMP/raw-100/rw-rulings.jsonl. Sentence scores: TMP/raw-100/rw-sent.jsonl.
 */
const C = require('./common');
const { L } = C;
const S = require('../../services/fact-source');
const J = require('../fact-gate/judges');

const [, , SPLIT = 'dev', MODEL = 'ds41_coral', PAR = '3'] = process.argv;
const SET = SPLIT === 'dev' ? 'dev' : 'heldout';
const SENT = L.path.join(C.RAW, 'rw-sent.jsonl');
const RUL = L.path.join(C.RAW, 'rw-rulings.jsonl');
const SYSTEM = `You compare a sentence from a rewritten lesson with the verified facts it must rest on. Answer ONLY from the facts given, not from memory.
contradicted: the sentence says the opposite of a fact, or something a fact rules out, or the wrong number, name or rule.
unsupported: it states a new claim about the subject that the facts do not contain.
fine: what it teaches follows from the facts, or it is only an explanation, an example, an analogy, a question, encouragement or a transition.
If contradicted, quote the fact.`;
const SCHEMA = { type: 'object', required: ['verdict'], properties: { verdict: { type: 'string', enum: ['contradicted', 'unsupported', 'fine'] }, quote: { type: 'string' } } };
const claimRows = new Map(L.readJsonl(L.path.join(C.RAW, 'claims.ds41_coral.jsonl')).map((r) => [r.level, r]));
const factsOf = (level) => (claimRows.get(level) ? claimRows.get(level).claims.filter((c) => !['illustration', 'pedagogy'].includes(c.type)).map((c) => c.text) : []);
const strings = (o, out = []) => { if (typeof o === 'string') out.push(o); else if (Array.isArray(o)) o.forEach((x) => strings(x, out)); else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) if (!/^(id|block|color|colour|icon|timing|format|fen|emoji|type|kind)$/i.test(k)) strings(v, out); return out; };
const lessonText = (lv) => [...lv.blocks.map((b) => strings(b.data).join(' ')), ...lv.checks.map((c) => strings({ p: c.prompt, r: c.rationale }).join(' '))];

(async () => {
  const levels = C.levelMap();
  const bankOf = new Map();
  const bank = (level) => { if (!bankOf.has(level)) bankOf.set(level, [...factsOf(level), ...lessonText(levels.get(level)).flatMap(S.sentencesOf)]); return bankOf.get(level); };
  // Real rewrites, scored once.
  const seen = new Set(L.readJsonl(SENT).map((r) => r.key));
  for (const r of L.readJsonl(L.path.join(C.RAW, 'rewrites.jsonl')).filter((x) => x.bankText)) {
    const sents = S.sentencesOf(r.bankText).filter((s) => !seen.has(`${r.level}|${r.learner}|${s}`));
    if (!sents.length) continue;
    const sc = await S.stage1(sents.map((s) => ({ doc: S.fromBank(s, bank(r.level), 5).map((x) => x.text).join(' ') || 'none', claim: s }))); // eslint-disable-line no-await-in-loop
    sents.forEach((s, i) => L.appendJsonl(SENT, { key: `${r.level}|${r.learner}|${s}`, level: r.level, learner: r.learner, sentence: s, ...sc[i] }));
  }
  const sentRows = L.readJsonl(SENT);
  const plants = new Map(C.loadSet(SET).plants.map((p) => [p.id, p]));
  const pairs = L.readJsonl(L.path.join(C.RAW, `pairs.bank.${SET}.jsonl`)).filter((p) => SPLIT === 'dev' || (plants.get(p.id) || {}).split === SPLIT);
  // Rule everything under the top threshold on the curve.
  const TOP = 0.5;
  const low = (s) => !(s.factcg >= TOP && s.minicheck >= TOP);
  const cache = new Map(L.readJsonl(RUL).map((r) => [r.key, r.verdict]));
  const rule = async (key, level, sentence) => {
    if (cache.has(key)) return;
    const top = S.fromBank(sentence, bank(level), 6).map((x) => x.text);
    const r = await J.callModel(MODEL, { system: SYSTEM, user: `VERIFIED FACTS\n${top.map((f) => `- ${f}`).join('\n')}\n\nSENTENCE: ${sentence}`, schema: SCHEMA, schemaName: 'submit_verdict', maxTokens: 400 });
    cache.set(key, r.data.verdict); L.appendJsonl(RUL, { key, verdict: r.data.verdict, cost: r.cost || 0 });
  };
  const jobs = [...sentRows.filter(low).map((r) => ({ key: `rw|${r.key}`, level: r.level, sentence: r.sentence })), ...pairs.filter((p) => low(p.w)).map((p) => ({ key: `pw|${p.id}`, level: plants.get(p.id).level, sentence: p.bad })), ...pairs.filter((p) => low(p.t)).map((p) => ({ key: `pt|${p.id}`, level: plants.get(p.id).level, sentence: p.clean }))].filter((j) => !cache.has(j.key));
  console.log('rulings to make', jobs.length);
  await L.runPool(jobs, Number(PAR), async (j) => { for (let a = 0; a < 3; a++) { try { await rule(j.key, j.level, j.sentence); return; } catch (e) { await L.sleep(2000 * (a + 1)); } } }); // eslint-disable-line no-await-in-loop
  const out = { split: SPLIT, pairs: pairs.length, sentences: sentRows.length, rewrites: new Set(sentRows.map((r) => `${r.level}|${r.learner}`)).size, curve: [] };
  const verdict = (k) => cache.get(k);
  for (const mode of ['local only', 'ruling: contradicted', 'ruling: contradicted or unsupported']) {
    for (const th of [0.1, 0.2, 0.3, 0.5]) {
      const below = (s) => !(s.factcg >= th && s.minicheck >= th);
      const keep = (k) => (mode === 'local only' ? true : mode === 'ruling: contradicted' ? verdict(k) === 'contradicted' : ['contradicted', 'unsupported'].includes(verdict(k)));
      const caught = pairs.filter((p) => below(p.w) && keep(`pw|${p.id}`)).length;
      const trueFlag = pairs.filter((p) => below(p.t) && keep(`pt|${p.id}`)).length;
      const rwFlag = sentRows.filter((r) => below(r) && keep(`rw|${r.key}`));
      const perRw = new Set(rwFlag.map((r) => `${r.level}|${r.learner}`)).size;
      const row = { mode, th, caught, n: pairs.length, trueTwinFlagged: trueFlag, rwFlagged: rwFlag.length, rewritesWithAFlag: perRw };
      out.curve.push(row);
      console.log(mode.padEnd(36), `t=${th}`, `wrong caught ${L.fmtRate(caught, pairs.length).padEnd(22)} true twin flagged ${trueFlag}, rewrite sentences flagged ${rwFlag.length}/${sentRows.length} = ${(100 * rwFlag.length / sentRows.length).toFixed(1)}%, rewrites with a flag ${perRw}/${out.rewrites}`);
    }
  }
  out.bySample = sentRows.filter((r) => !(r.factcg >= 0.3 && r.minicheck >= 0.3) && verdict(`rw|${r.key}`) === 'contradicted').slice(0, 30).map((r) => `${r.level.split('/').slice(-1)} ${r.learner}: ${r.sentence.slice(0, 150)}`);
  L.writeJson(L.path.join(L.DOCS, '..', 'fact-100', `rewrite-curve-${SPLIT}.json`), out);
  console.log('stays flagged, sample:'); for (const s of out.bySample.slice(0, 12)) console.log(' ', s);
  console.log('$ rulings', L.readJsonl(RUL).reduce((a, r) => a + (r.cost || 0), 0).toFixed(4));
  process.exit(0);
})();
