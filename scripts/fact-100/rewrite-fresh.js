#!/usr/bin/env node
/**
 * Fresh rewrites for the held-out false-alarm count: same pilot levels, learners nobody tuned on (extreme and random), bank writer only. TMP/raw-100/rewrites-fresh.jsonl has the same shape the curve reads (level, learner, bankText).
 *   node scripts/fact-100/rewrite-fresh.js [writer=ds41_coral]
 */
const C = require('./common');
const { L } = C;
const B = require('../../services/fact-bank');
const J = require('../fact-gate/judges');

const WRITER = process.argv[2] || 'ds41_coral';
const OUT = L.path.join(C.RAW, 'rewrites-fresh.jsonl');
const PILOT = ['math/calculus_i/30', 'math/algebra_1_part_a/380', 'math/algebra_1_part_a/254', 'math/numbers_to_20_and_teen_numbers/20', 'english/proficient/20', 'english/proficient/62', 'spanish/advanced/15', 'spanish/entry/80', 'spanish/intermediate/112', 'chess/chess_board_explorer/42'];
const LEARNERS = [
  { id: 'retired_fisherman', text: 'Age 71, retired fisherman, left school at 14, slow careful reader, distrusts jargon, thinks in tides and nets.', interests: ['fisherman', 'tide', 'tides', 'nets', 'net', 'boat', 'trawler'] },
  { id: 'dyslexic_gamer', text: 'Age 16, dyslexic, very bright, wants short lines, loves chess streams and rhythm games.', interests: ['stream', 'streams', 'combo', 'rhythm', 'beatmap'] },
  { id: 'phd_dropout', text: 'Age 33, left a physics PhD, impatient, wants the hardest correct framing, plays the cello.', interests: ['cello', 'bow', 'physics', 'quartet'] },
  { id: 'anxious_nurse_aide', text: 'Age 24, night-shift care worker, anxious about tests, reads on a phone in five-minute gaps, knits.', interests: ['knit', 'knitting', 'stitch', 'stitches', 'yarn'] },
];
const strings = (o, out = []) => { if (typeof o === 'string') { if (o.length >= 30) out.push(o); } else if (Array.isArray(o)) o.forEach((x) => strings(x, out)); else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) if (!/^(id|block|color|colour|icon|timing|format|fen|emoji|type|kind)$/i.test(k)) strings(v, out); return out; };
const teaching = (lv) => lv.blocks.filter((b) => !/^(Interact|Recall|Ret|Game)_/.test(b.block)).map((b) => ({ index: b.index, text: strings(b.data).join(' ') })).filter((x) => x.text.length > 40);
const SCHEMA = { type: 'object', required: ['passages'], properties: { passages: { type: 'array', items: { type: 'object', required: ['index', 'text'], properties: { index: { type: 'integer' }, text: { type: 'string' } } } } } };
const SYSTEM = `You rewrite a lesson for one learner, keeping everything it teaches. You get the learner and the numbered passages. Rewrite each passage in your own words for this learner: their level, their interests, their attention. Keep every fact, rule and step the passage teaches. Return one rewritten passage for each index.

The lesson's verified facts are listed under ALLOWED FACTS. You must use only these facts:
- Every number, year, name, formula and foreign word outside an example must appear in the allowed facts. Do not add any others, even ones you are sure of.
- You may rephrase, shorten, reorder and explain, as long as what you say follows from the allowed facts.
- A personal example drawn from the learner's interests goes between [[eg]] and [[/eg]]. An example may use made-up numbers. It may not state anything about the real world: no years, no real people or brands, no "always" or "research shows". It only shows how an allowed fact works.`;
(async () => {
  const claims = new Map(L.readJsonl(L.path.join(C.RAW, 'claims.ds41_coral.jsonl')).map((r) => [r.level, r]));
  const levels = C.levelMap();
  const done = new Set(L.readJsonl(OUT).map((r) => `${r.level}|${r.learner}`));
  const jobs = PILOT.flatMap((id, i) => [LEARNERS[i % 4], LEARNERS[(i + 1) % 4]].map((learner) => ({ id, learner }))).filter((j) => !done.has(`${j.id}|${j.learner.id}`));
  await L.runPool(jobs, 2, async ({ id, learner }) => {
    const lv = levels.get(id); const facts = claims.get(id).claims.filter((c) => !['illustration', 'pedagogy'].includes(c.type)).map((c) => c.text);
    const passages = teaching(lv);
    for (let a = 0; a < 3; a++) {
      try {
        const r = await J.callModel(WRITER, { system: SYSTEM, user: `ALLOWED FACTS\n${facts.map((f) => `- ${f}`).join('\n')}\n\nLEARNER: ${learner.text}\nLESSON: ${L.contextOf(lv)}\n\nPASSAGES\n${passages.map((p) => `[${p.index}] ${p.text}`).join('\n')}`, schema: SCHEMA, schemaName: 'submit_passages', maxTokens: 8000 }); // eslint-disable-line no-await-in-loop
        const text = (r.data.passages || []).map((p) => p.text).join('\n');
        const allowed = B.allowedFrom(facts, lv.track, learner.interests);
        L.appendJsonl(OUT, { level: id, track: lv.track, learner: learner.id, bankText: text, cost: r.cost || 0, mechanical: B.mechanicalCheck(text, allowed, { track: lv.track }).missing.length, illustration: B.illustrationCheck(text, { allowedNames: learner.interests, allowed }).length });
        console.log(id, learner.id, text.length);
        return;
      } catch (e) { if (a === 2) console.log('fail', id, String(e.message).slice(0, 100)); await L.sleep(3000 * (a + 1)); } // eslint-disable-line no-await-in-loop
    }
  });
  process.exit(0);
})();
