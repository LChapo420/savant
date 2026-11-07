#!/usr/bin/env node
/**
 * Frozen facts, step 2: what breaks when a personal writer may only use the bank? A pilot of at most 10 levels. AI-judged, not real-learner proof.
 * Each level, for extreme and random learners, three rewrites of its teaching text by the same cheap writer:
 *   bank   told to use only the facts given, personal examples between [[eg]] marks; one retry with the violations listed
 *   free   the same request, no bank (today's kind of writer)
 *   free2  the same again: a same-versus-same noise control
 * Then: mechanical check on all (does the check fire on free text that really adds things? is the bank version clean?); a reader hunts each for errors, against the original; two families score teaching quality blind, A/B.
 *   node scripts/fact-100/bank-rewrite.js [writer=ds41_coral]
 * Results: TMP/raw-100/rewrites.jsonl, docs/fact-100/bank-rewrite.json
 */
const C = require('./common');
const { L } = C;
const B = require('../../services/fact-bank');
const J = require('../fact-gate/judges');

const WRITER = process.argv[2] || 'ds41_coral';
const OUT = L.path.join(C.RAW, 'rewrites.jsonl');
const PILOT = ['math/calculus_i/30', 'math/algebra_1_part_a/380', 'math/algebra_1_part_a/254', 'math/numbers_to_20_and_teen_numbers/20', 'english/proficient/20', 'english/proficient/62', 'spanish/advanced/15', 'spanish/entry/80', 'spanish/intermediate/112', 'chess/chess_board_explorer/42'];
// Extreme and random learners: tails, contradictory mixes, unusual hobbies. Seeded choice of two per level, plus one always the weakest reader.
const LEARNERS = [
  { id: 'young_weak_reader', text: 'Age 10, reads two grades below level, short attention, loves skateboarding.', interests: ['skateboarding', 'skateboard', 'skateboards', 'skate', 'ollie', 'kickflip', 'ramp'] },
  { id: 'esl_adult', text: 'Age 41, nurse from Vietnam, English is a second language, studies at night, very tired, wants plain short sentences. Interest: cooking pho.', interests: ['vietnam', 'pho', 'nurse', 'hanoi'] },
  { id: 'bored_prodigy', text: 'Age 14, far above grade level, bored by anything slow, likes speedrunning video games, wants the sharpest version.', interests: ['speedrun', 'speedrunning', 'minecraft', 'mario', 'zelda'] },
  { id: 'skimmer', text: 'Age 27, attention-limited, skims, drops off after a few lines, keeps bees as a hobby.', interests: ['bees', 'hive', 'honey', 'beekeeping', 'queen'] },
  { id: 'career_changer', text: 'Age 53, ex-truck driver retraining, afraid of looking stupid, thinks in routes and loads.', interests: ['truck', 'trucks', 'route', 'interstate', 'diesel'] },
  { id: 'random_mix', text: 'Age 19, strong at reading, very weak at this subject, plays competitive curling, contradicts itself on wanting detail and wanting it short.', interests: ['curling', 'stone', 'sweep', 'sheet'] },
];
const strings = (o, out = []) => { if (typeof o === 'string') { if (o.length >= 30) out.push(o); } else if (Array.isArray(o)) o.forEach((x) => strings(x, out)); else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) if (!/^(id|block|color|colour|icon|timing|format|fen|emoji|type|kind)$/i.test(k)) strings(v, out); return out; };
const teaching = (lv) => lv.blocks.filter((b) => !/^(Interact|Recall|Ret|Game)_/.test(b.block)).map((b) => ({ index: b.index, text: strings(b.data).join(' ') })).filter((x) => x.text.length > 40);

const SCHEMA = { type: 'object', required: ['passages'], properties: { passages: { type: 'array', items: { type: 'object', required: ['index', 'text'], properties: { index: { type: 'integer' }, text: { type: 'string' } } } } } };
const FREE_SYSTEM = 'You rewrite a lesson for one learner, keeping everything it teaches. You get the learner and the numbered passages. Rewrite each passage in your own words for this learner: their level, their interests, their attention. Keep every fact, rule and step the passage teaches. Return one rewritten passage for each index.';
const BANK_SYSTEM = `${FREE_SYSTEM}

The lesson's verified facts are listed under ALLOWED FACTS. You must use only these facts:
- Every number, year, name, formula and foreign word outside an example must appear in the allowed facts. Do not add any others, even ones you are sure of.
- You may rephrase, shorten, reorder and explain, as long as what you say follows from the allowed facts.
- A personal example drawn from the learner's interests goes between [[eg]] and [[/eg]]. An example may use made-up numbers. It may not state anything about the real world: no years, no real people or brands, no "always" or "research shows". It only shows how an allowed fact works.`;
const JUDGE_SYSTEM = `You compare two rewrites (A and B) of the same lesson for the same learner. Score each from 1 to 5 on: clarity for this learner; fit to their interests and attention; completeness (every point of the original is kept); engagement. Ignore any [[eg]] marks. Be strict and use the whole scale.`;
const JUDGE_SCHEMA = { type: 'object', required: ['a', 'b'], properties: { a: { type: 'object', required: ['clarity', 'fit', 'complete', 'engaging'], properties: { clarity: { type: 'number' }, fit: { type: 'number' }, complete: { type: 'number' }, engaging: { type: 'number' } } }, b: { type: 'object', required: ['clarity', 'fit', 'complete', 'engaging'], properties: { clarity: { type: 'number' }, fit: { type: 'number' }, complete: { type: 'number' }, engaging: { type: 'number' } } } } };
const HUNT_SYSTEM = 'You check a rewrite of a lesson against what is true. Report only what is actually wrong as a fact, or what the rewrite states that the original does not support and that is not plainly a made-up example. Give where (index) and quote and why. No errors: an empty list.';
const HUNT_SCHEMA = { type: 'object', required: ['errors'], properties: { errors: { type: 'array', items: { type: 'object', required: ['quote', 'why'], properties: { quote: { type: 'string' }, why: { type: 'string' } } } } } };

const write = async (system, user) => { const r = await J.callModel(WRITER, { system, user, schema: SCHEMA, schemaName: 'submit_passages', maxTokens: 8000 }); return { passages: r.data.passages || [], cost: r.cost || 0 }; };
const joinP = (p) => p.map((x) => x.text).join('\n');

(async () => {
  const claimRows = new Map(L.readJsonl(L.path.join(C.RAW, 'claims.ds41_coral.jsonl')).map((r) => [r.level, r]));
  const levels = C.levelMap();
  const done = new Set(L.readJsonl(OUT).map((r) => `${r.level}|${r.learner}`));
  const jobs = [];
  PILOT.forEach((id, i) => {
    jobs.push({ id, learner: LEARNERS[0] });
    jobs.push({ id, learner: LEARNERS[1 + (i % 5)] });
    jobs.push({ id, learner: LEARNERS[1 + ((i + 2) % 5)] });
  });
  await L.runPool(jobs.filter((j) => !done.has(`${j.id}|${j.learner.id}`)), 2, async ({ id, learner }) => {
    const lv = levels.get(id); const cr = claimRows.get(id);
    if (!lv || !cr) { console.log('no level or claims', id); return; }
    const facts = cr.claims.filter((c) => !['illustration', 'pedagogy'].includes(c.type)).map((c) => c.text);
    const passages = teaching(lv);
    // The bank for a rewrite: the facts plus the verified lesson itself, since all of it passed. Rewrites may not add to it.
    const allowed = B.allowedFrom([...facts, ...lv.blocks.map((b) => strings(b.data).join(' ')), ...lv.checks.map((c) => strings({ p: c.prompt, r: c.rationale }).join(' '))], lv.track, learner.interests);
    const base = `LEARNER: ${learner.text}\nLESSON: ${L.contextOf(lv)}\n\nPASSAGES\n${passages.map((p) => `[${p.index}] ${p.text}`).join('\n')}`;
    try {
      let cost = 0;
      const free = await write(FREE_SYSTEM, base); cost += free.cost;
      const free2 = await write(FREE_SYSTEM, base); cost += free2.cost;
      const bankUser = `ALLOWED FACTS\n${facts.map((f) => `- ${f}`).join('\n')}\n\n${base}`;
      let bank = await write(BANK_SYSTEM, bankUser); cost += bank.cost;
      const test = (t) => ({ mech: B.mechanicalCheck(t, allowed, { track: lv.track }), ill: B.illustrationCheck(t, { allowedNames: learner.interests, allowed }) });
      let first = test(joinP(bank.passages));
      const firstMissing = first.mech.missing.length + first.ill.length;
      let retried = false;
      if (firstMissing) {
        retried = true;
        const list = [...first.mech.missing.map((m) => `"${m.raw}" is not in the allowed facts`), ...first.ill.map((x) => x.problem)].slice(0, 30).join('\n');
        bank = await write(BANK_SYSTEM, `${bankUser}\n\nYOUR LAST VERSION BROKE THE RULES. Remove or replace these:\n${list}\n\nLAST VERSION\n${joinP(bank.passages)}`); cost += bank.cost;
      }
      const finalBank = test(joinP(bank.passages));
      const freeT = test(joinP(free.passages));
      // The reader counts real errors in each, same reader, same prompt.
      const hunt = async (t) => { const r = await J.callModel('glm_flash_zgpu', { system: HUNT_SYSTEM, user: `ORIGINAL\n${passages.map((p) => p.text).join('\n')}\n\nREWRITE\n${t}`, schema: HUNT_SCHEMA, schemaName: 'submit_errors', maxTokens: 4000 }); cost += r.cost || 0; return r.data.errors || []; };
      const [hBank, hFree, hFree2] = [await hunt(joinP(bank.passages)), await hunt(joinP(free.passages)), await hunt(joinP(free2.passages))];
      const judge = async (judgeName, x, y) => {
        const flip = parseInt(L.hash(`${id}${learner.id}${judgeName}${x.length}`), 16) % 2 === 0;
        const [A, Bb] = flip ? [y, x] : [x, y];
        const r = await J.callModel(judgeName, { system: JUDGE_SYSTEM, user: `LEARNER: ${learner.text}\n\nORIGINAL\n${passages.map((p) => p.text).join('\n')}\n\nA\n${A}\n\nB\n${Bb}`, schema: JUDGE_SCHEMA, schemaName: 'submit_scores', maxTokens: 1500 });
        cost += r.cost || 0; const sc = (o) => (Number(o.clarity) + Number(o.fit) + Number(o.complete) + Number(o.engaging)) / 4;
        return flip ? { x: sc(r.data.b), y: sc(r.data.a), xs: r.data.b, ys: r.data.a } : { x: sc(r.data.a), y: sc(r.data.b), xs: r.data.a, ys: r.data.b };
      };
      const scores = {};
      for (const jn of ['grok43', 'glm_flash_zgpu']) { scores[jn] = { bankVsFree: await judge(jn, joinP(bank.passages), joinP(free.passages)), noise: await judge(jn, joinP(free.passages), joinP(free2.passages)) }; } // eslint-disable-line no-await-in-loop
      L.appendJsonl(OUT, {
        level: id, track: lv.track, learner: learner.id, facts: facts.length, firstMissing, retried, finalMissing: finalBank.mech.missing.map((m) => m.raw), finalIll: finalBank.ill.map((x) => x.problem), freeMissing: freeT.mech.missing.map((m) => m.raw), tokensBank: finalBank.mech.tokens, tokensFree: freeT.mech.tokens,
        egCount: B.egSpans(joinP(bank.passages)).length, wordsBank: joinP(bank.passages).split(/\s+/).length, wordsFree: joinP(free.passages).split(/\s+/).length, wordsOrig: passages.map((p) => p.text).join(' ').split(/\s+/).length,
        errorsBank: hBank, errorsFree: hFree, errorsFree2: hFree2, scores, cost, sampleBank: joinP(bank.passages).slice(0, 700), sampleFree: joinP(free.passages).slice(0, 700),
      });
      console.log(id, learner.id, 'first', firstMissing, 'final', finalBank.mech.missing.length + finalBank.ill.length, 'free', freeT.mech.missing.length, `$${cost.toFixed(4)}`);
    } catch (e) { console.log('fail', id, learner.id, String(e.message).slice(0, 120)); }
  });
  const rows = L.readJsonl(OUT);
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const res = { rewrites: rows.length, firstPass: rows.filter((r) => !r.firstMissing).length, finalPass: rows.filter((r) => !r.finalMissing.length && !r.finalIll.length).length, cost: mean(rows.map((r) => r.cost)) };
  res.errors = { bank: mean(rows.map((r) => r.errorsBank.length)), free: mean(rows.map((r) => r.errorsFree.length)), free2: mean(rows.map((r) => r.errorsFree2.length)) };
  res.freeOutOfBank = mean(rows.map((r) => r.freeMissing.length));
  res.words = { orig: mean(rows.map((r) => r.wordsOrig)), bank: mean(rows.map((r) => r.wordsBank)), free: mean(rows.map((r) => r.wordsFree)) };
  res.scores = {};
  for (const jn of ['grok43', 'glm_flash_zgpu']) {
    res.scores[jn] = { bank: mean(rows.map((r) => r.scores[jn].bankVsFree.x)), free: mean(rows.map((r) => r.scores[jn].bankVsFree.y)), noiseGap: mean(rows.map((r) => Math.abs(r.scores[jn].noise.x - r.scores[jn].noise.y))), worstDrop: Math.min(...rows.map((r) => r.scores[jn].bankVsFree.x - r.scores[jn].bankVsFree.y)) };
    for (const m of ['clarity', 'fit', 'complete', 'engaging']) res.scores[jn][m] = [mean(rows.map((r) => Number(r.scores[jn].bankVsFree.xs[m]))), mean(rows.map((r) => Number(r.scores[jn].bankVsFree.ys[m])))];
  }
  res.byLearner = {};
  for (const l of [...new Set(rows.map((r) => r.learner))]) { const rs = rows.filter((r) => r.learner === l); res.byLearner[l] = { n: rs.length, bankMinusFree: +mean(rs.flatMap((r) => ['grok43', 'glm_flash_zgpu'].map((jn) => r.scores[jn].bankVsFree.x - r.scores[jn].bankVsFree.y))).toFixed(2) }; }
  L.writeJson(L.path.join(L.DOCS, '..', 'fact-100', 'bank-rewrite.json'), res);
  console.log(JSON.stringify(res));
  console.log(JSON.stringify(require('../../services/run-cap').summary()).slice(0, 200));
  process.exit(0);
})();
