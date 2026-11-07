#!/usr/bin/env node
/**
 * A new held-out planted set for brief fact-100 (7 Nov): extra misleading simplifications and wrong-but-plausible facts, new sentences in the same stored levels.
 * Planter: MiniMax M3 on Lyceum, a family no judge belongs to. Candidates are only proposals; docs/fact-100/heldout.json holds what a read accepted.
 *   DB_FILE=copy node scripts/fact-100/plant2.js [par=3]
 */
const L = require('../fact-gate/lib');
const { lyceum } = require('../../services/providers/lyceum');

const OUT = L.path.join(L.TMP, 'fact-100-candidates.jsonl');
const KINDS = {
  misleading_simplification: 'A qualified, correct statement (or a rule with an exception) is turned into a neat flat one that would really mislead a learner of this level on a later problem: a condition dropped, "usually" turned into "always", a special case stated as the general case, a typical case presented as the only one. It must be FALSE as stated, with a counterexample you can name in the truth field, not a fair teaching simplification.',
  wrong_plausible_fact: 'A specific fact is replaced by a common misconception or a confusable neighbour, so that it sounds exactly right to someone half-remembering: the rule of a nearby topic, the meaning of a look-alike word (false friends), the wrong person or term that people often confuse, a popular myth. Nothing in the lesson itself should contradict it (edit every place that states it). A subject expert must agree it is false.',
  reversed_cause: 'A cause and effect, or a direction of a rule, is reversed.',
  wrong_number: 'A stated number is changed to a wrong one that still looks reasonable; change every place it is used so the lesson agrees with itself.',
  wrong_worked_example: 'One step of a worked example or analysed sample is changed so the example is wrong; carry it through to a wrong end result.',
  wrong_answer_key: 'The marked answer of a graded check is changed to a wrong option, with the rationale rewritten to argue plausibly for it.',
  formula_step: 'A formula, rule of calculation, or procedure step is changed so it is wrong.',
};
const SYSTEM = `You are building a hard test for a lesson fact checker. You get one real lesson as blocks and graded checks in JSON, each numbered. Insert errors of the kinds asked for, the way a real writer would make them by accident.

Rules for each error:
- It is made only of exact text edits: "original" is an exact substring of that block's or check's JSON text (copied character for character, no double quotes or backslashes inside it, long enough to occur exactly once in that block or check), "wrong" is what replaces it.
- The result reads naturally, in the lesson's voice and level. No giveaways: no hedging, no "incorrectly", no change of length or style that draws the eye. Prefer the smallest edit.
- The result must be genuinely WRONG (a subject expert would agree), not a matter of taste, not merely a typo, and not depending on a made-up scenario detail.
- Where the same fact appears again elsewhere in the lesson, edit those too, so the lesson agrees with itself.
- Do not edit ids, block types, timing fields or colours: only what a learner reads.
Return one error per kind asked for. If a kind truly cannot fit this lesson, skip it.`;
const SCHEMA = { type: 'object', required: ['plants'], properties: { plants: { type: 'array', items: { type: 'object', required: ['kind', 'edits', 'truth'], properties: { kind: { type: 'string' }, edits: { type: 'array', items: { type: 'object', required: ['where', 'original', 'wrong'], properties: { where: { type: 'string' }, original: { type: 'string' }, wrong: { type: 'string' } } } }, truth: { type: 'string', description: 'One short sentence: what is actually true, and the counterexample or why the edited text is wrong.' } } } } } };
const render = (lv) => [L.contextOf(lv), ...lv.blocks.map((b) => `BLOCK ${b.index} ${b.block}: ${JSON.stringify(b.data)}`), ...lv.checks.map((c) => `CHECK ${c.index} (${c.format}): ${JSON.stringify(c)}`)].join('\n');
function seeded(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

(async () => {
  const levels = L.loadLevels().filter((l) => JSON.stringify(l.blocks).length + JSON.stringify(l.checks).length < 45000);
  const rand = seeded(20261107);
  const take = (arr, n) => { const o = [...arr]; for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } return o.slice(0, n); };
  const pick = [
    ...levels.filter((l) => l.track === 'math'), ...levels.filter((l) => ['chess', 'piano', 'basketball'].includes(l.track)),
    ...take(levels.filter((l) => l.track === 'english'), 24), ...take(levels.filter((l) => l.track === 'spanish'), 24),
  ];
  const done = new Set(L.readJsonl(OUT).map((r) => r.level));
  console.log(`${pick.length} levels, ${done.size} already planted`);
  const extra = ['reversed_cause', 'wrong_number', 'wrong_worked_example', 'wrong_answer_key', 'formula_step']; let rot = 0;
  await L.runPool(pick.filter((l) => !done.has(l.id)), Number(process.argv[2] || 3), async (lv) => {
    const kinds = ['misleading_simplification', 'wrong_plausible_fact', extra[rot++ % extra.length]];
    const user = `Kinds of error to insert:\n${kinds.map((k) => `- ${k}: ${KINDS[k]}`).join('\n')}\n\nTHE LESSON\n${render(lv)}`;
    for (let a = 0; a < 3; a++) {
      try {
        const r = await lyceum.structured({ system: SYSTEM, user, schema: SCHEMA, schemaName: 'submit_plants', maxTokens: 4000, model: 'minimax/minimax-m3', timeoutMs: 180000, task: 'fact_gate' }); // eslint-disable-line no-await-in-loop
        let kept = 0;
        for (const p of (r.data && r.data.plants) || []) {
          const edits = (p.edits || []).map((e) => { const m = /(block|check)\s*#?\s*(\d+)/i.exec(e.where || ''); return m && { word: m[1].toLowerCase(), index: Number(m[2]), original: e.original, wrong: e.wrong }; });
          if (!edits.length || edits.some((e) => !e || !e.original || !e.wrong || e.original === e.wrong || /["\x5c]/.test(e.original + e.wrong))) continue;
          try { L.applyEdits(lv, edits); } catch { continue; }
          kept++;
          L.appendJsonl(OUT, { level: lv.id, track: lv.track, kind: p.kind, edits, truth: p.truth, cost: (r.usage && r.usage.cost_usd) || 0 });
        }
        console.log(lv.id, 'kept', kept);
        if (kept) return;
      } catch (e) { console.log(lv.id, 'err', String(e.message).slice(0, 100)); await L.sleep(3000); } // eslint-disable-line no-await-in-loop
    }
  });
  console.log('done', JSON.stringify(require('../../services/run-cap').summary()).slice(0, 200));
  process.exit(0);
})();
