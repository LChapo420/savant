#!/usr/bin/env node
/**
 * Second planter pass: errors in graded checks that exact-text edits cannot express, as field sets on one check (Lyceum MiniMax M3):
 * wrong_answer_key (rationale rewritten to argue for it) and key_lesson_mismatch (the check reads fine alone; its key contradicts a block).
 *   DB_FILE=copy node scripts/fact-gate/plant-keys.js [par=5]
 */
const L = require('./lib');
const { lyceum } = require('../../services/providers/lyceum');

const OUT = L.path.join(L.TMP, 'plant-candidates-keys.jsonl');
const SCHEMA = {
  type: 'object',
  required: ['plants'],
  properties: { plants: { type: 'array', items: { type: 'object', required: ['kind', 'check', 'new_answer', 'new_rationale', 'truth'], properties: {
    kind: { type: 'string', enum: ['wrong_answer_key', 'key_lesson_mismatch'] },
    check: { type: 'integer' }, new_answer: { type: 'string' }, new_rationale: { type: 'string' },
    lesson_quote: { type: 'string', description: 'For key_lesson_mismatch: the exact sentence of a block that the new key contradicts.' },
    truth: { type: 'string' },
  } } } },
};
const SYSTEM = `You are building a hard test for a lesson fact checker. You get one real lesson: blocks and graded checks in JSON. Insert two errors into its graded checks, the way a careless writer would by accident:

1. kind "wrong_answer_key": pick a graded check. Change its marked answer to a WRONG one (for multiple choice: copy another of its choices exactly; for type-in: a plausible wrong value), and write a new rationale that argues smoothly for it in the same voice and length. No hint that it is wrong.
2. kind "key_lesson_mismatch": pick a different graded check whose answer is stated directly in a block of the lesson. Change its marked answer to a wrong one that sounds fine if the check is read alone, and write a rationale for it. Give lesson_quote: the exact block sentence that the new key contradicts.

The new key must be genuinely wrong, not a matter of taste. Reply with both.`;
const render = (lv) => [
  L.contextOf(lv),
  ...lv.blocks.map((b) => `BLOCK ${b.index} ${b.block}: ${JSON.stringify(b.data)}`),
  ...lv.checks.map((c) => `CHECK ${c.index} (${c.format}): ${JSON.stringify({ prompt: c.prompt, choices: c.choices, answer: c.answer, rationale: c.rationale })}`),
].join('\n');

(async () => {
  const levels = L.loadLevels().filter((l) => l.checks.some((c) => c.answer) && JSON.stringify(l.blocks).length < 40000);
  const ids = new Set(L.readJsonl(L.path.join(L.TMP, 'plant-candidates.jsonl')).map((r) => r.level));
  const done = new Set(L.readJsonl(OUT).map((r) => r.level));
  const todo = levels.filter((l) => ids.has(l.id) && !done.has(l.id));
  console.log(todo.length);
  await L.runPool(todo, Number(process.argv[2] || 5), async (lv) => {
    try {
      const r = await lyceum.structured({ system: SYSTEM, user: render(lv), schema: SCHEMA, schemaName: 'submit_plants', maxTokens: 4000, model: 'minimax/minimax-m3', timeoutMs: 180000, task: 'fact_gate_plant' });
      for (const p of (r.data && r.data.plants) || []) {
        const c = lv.checks.find((x) => x.index === Number(p.check));
        if (!c || !p.new_answer || p.new_answer === c.answer) continue;
        if (c.format === 'multiple_choice' && !(c.choices || []).includes(p.new_answer)) continue;
        L.appendJsonl(OUT, { level: lv.id, track: lv.track, kind: p.kind, check: c.index, format: c.format, prompt: c.prompt, old_answer: c.answer, new_answer: p.new_answer, new_rationale: p.new_rationale, lesson_quote: p.lesson_quote, truth: p.truth });
      }
    } catch (e) { console.log(lv.id, String(e.message).slice(0, 100)); }
  });
  console.log('done');
  process.exit(0);
})();
