#!/usr/bin/env node
/**
 * Step 1 of the fact-gate: candidate planted errors (Lyceum MiniMax M3, or xKiro Mistral Large while it answers: families no judge shares). Every candidate is exact-string edits of a real
 * written level. Candidates are only proposals: docs/fact-gate/testbed.json holds the ones accepted after a human read.
 *   DB_FILE=copy node scripts/fact-gate/plant.js [perLevel=3] [par=3]
 */
const L = require('./lib');
const { xkiro } = require('../../services/providers/xkiro');
const { lyceum } = require('../../services/providers/lyceum');
const PLANTER = process.env.PLANTER || 'lyceum';

const [, , A_PER = '3', A_PAR = '3'] = process.argv;
const OUT = L.path.join(L.TMP, process.env.PLANT_OUT || 'plant-candidates.jsonl');

const KINDS = {
  wrong_number: 'A stated number (a count, measurement, rate, percentage, quantity, table value) is changed to a wrong one that still looks reasonable. Not a date.',
  formula_step: 'A formula, rule of calculation or procedure step is changed so it is mathematically or procedurally wrong (a sign, an operation, an order of steps, a missing or extra factor, a wrong conjugation pattern or grammar procedure).',
  date_name: 'A date, person, place, work, or the name of a term, grammatical form, chess piece, musical note, or (in a language lesson) the meaning of a word, is changed to a wrong one that a careless writer might have written.',
  reversed_cause: 'A cause and effect, or a direction of a rule, is reversed (what makes what happen; which way something moves; which form is used when).',
  wrong_worked_example: 'One step of a worked example or analysed sample is changed so the example is wrong. If later steps depend on it, change them too so the example flows consistently to a wrong end result.',
  wrong_answer_key: 'The marked answer of a graded check (or the correct flag of an interactive item in a block) is changed to a wrong option. Keep it one of the choices. Also rewrite the rationale so it plausibly argues for the new key, without any hint it is wrong.',
  misleading_simplification: 'A qualified, correct statement is turned into a neat over-general one that would really mislead a learner: an exception or condition dropped, "usually" turned into a flat rule, a special case stated as the general case. It must be clearly false on reflection, not just less precise.',
  key_lesson_mismatch: 'A graded check is changed so that, read alone, it looks fine, but its marked answer contradicts what the blocks of this very lesson teach (edit the check\'s answer, choices or rationale; the blocks stay as they are).',
};
const BY_TRACK = {
  math: ['formula_step', 'wrong_worked_example', 'wrong_number', 'wrong_answer_key', 'key_lesson_mismatch', 'misleading_simplification', 'reversed_cause', 'date_name'],
  english: ['date_name', 'reversed_cause', 'wrong_worked_example', 'wrong_answer_key', 'misleading_simplification', 'key_lesson_mismatch', 'formula_step', 'wrong_number'],
  spanish: ['date_name', 'formula_step', 'wrong_answer_key', 'wrong_worked_example', 'wrong_number', 'reversed_cause', 'key_lesson_mismatch', 'misleading_simplification'],
  chess: ['date_name', 'wrong_number', 'reversed_cause', 'wrong_worked_example', 'misleading_simplification', 'wrong_answer_key'],
  piano: ['date_name', 'wrong_number', 'reversed_cause', 'wrong_worked_example', 'misleading_simplification', 'wrong_answer_key'],
  basketball: ['date_name', 'wrong_number', 'reversed_cause', 'formula_step', 'misleading_simplification', 'wrong_answer_key'],
};

const SCHEMA = {
  type: 'object',
  required: ['plants'],
  properties: {
    plants: {
      type: 'array',
      items: {
        type: 'object',
        required: ['kind', 'edits', 'truth'],
        properties: {
          kind: { type: 'string' },
          edits: { type: 'array', items: { type: 'object', required: ['where', 'original', 'wrong'], properties: { where: { type: 'string', description: '"block N" or "check N" as numbered in the input' }, original: { type: 'string' }, wrong: { type: 'string' } } } },
          truth: { type: 'string', description: 'One short sentence: what is actually true, and why the edited text is wrong.' },
        },
      },
    },
  },
};

const SYSTEM = `You are building a hard test for a lesson fact checker. You get one real lesson as blocks and graded checks in JSON, each numbered. Your job: insert errors of the kinds asked for, the way a real writer would make them by accident.

Rules for each error:
- It is made only of exact text edits: "original" is an exact substring of that block's or check's JSON text (copied character for character, no double quotes or backslashes inside it, long enough to occur exactly once in that block or check), "wrong" is what replaces it.
- The result reads naturally, in the lesson's voice and level. No giveaways: no hedging, no "incorrectly", no odd formatting, no change of length or style that draws the eye. Prefer the smallest edit.
- The result must be genuinely WRONG (a subject expert would agree), not a matter of taste, and not merely a typo.
- Where the same fact appears again elsewhere in the lesson, you may edit those too so the lesson agrees with itself: that is a harder test, and welcome about half the time.
- Do not edit ids, block types, timing fields or colours: only what a learner reads.
Return one error per kind asked for. If a kind truly cannot fit this lesson, skip it.`;

const render = (lv) => [
  L.contextOf(lv),
  ...lv.blocks.map((b) => `BLOCK ${b.index} ${b.block}: ${JSON.stringify(b.data)}`),
  ...lv.checks.map((c) => `CHECK ${c.index} (${c.format}): ${JSON.stringify(c)}`),
].join('\n');

function seeded(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

(async () => {
  const levels = L.loadLevels();
  const rand = seeded(20261106);
  const take = (arr, n) => { const o = [...arr]; for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } return o.slice(0, n); };
  const pick = [
    ...levels.filter((l) => l.track === 'math'),
    ...levels.filter((l) => ['chess', 'piano', 'basketball'].includes(l.track)),
    ...take(levels.filter((l) => l.track === 'english'), 24),
    ...take(levels.filter((l) => l.grade === 'entry'), 6), ...take(levels.filter((l) => l.grade === 'intermediate'), 5), ...take(levels.filter((l) => l.grade === 'advanced'), 11),
  ].filter((l) => JSON.stringify(l.blocks).length + JSON.stringify(l.checks).length < 45000);
  const done = new Set(L.readJsonl(OUT).map((r) => r.level));
  console.log(`${pick.length} levels, ${done.size} already planted`);
  const rot = {};
  await L.runPool(pick.filter((l) => !done.has(l.id)), Number(A_PAR), async (lv) => {
    const list = process.env.PLANT_KINDS ? process.env.PLANT_KINDS.split(',') : BY_TRACK[lv.track]; rot[lv.track] = rot[lv.track] || 0;
    const kinds = Array.from({ length: Number(A_PER) }, () => list[rot[lv.track]++ % list.length]);
    const user = `Kinds of error to insert:\n${kinds.map((k) => `- ${k}: ${KINDS[k]}`).join('\n')}\n\nTHE LESSON\n${render(lv)}`;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const r = PLANTER === 'xkiro' ? await xkiro.structured({ system: SYSTEM, user, schema: SCHEMA, schemaName: 'submit_plants', maxTokens: 3000, models: ['mistralai/mistral-large-2512'], reasoningEffort: 'low', timeoutMs: 180000 }) : await lyceum.structured({ system: SYSTEM, user, schema: SCHEMA, schemaName: 'submit_plants', maxTokens: 6000, model: 'minimax/minimax-m3', timeoutMs: 180000, task: 'fact_gate_plant' });
        let kept = 0;
        for (const p of (r.data && r.data.plants) || []) {
          const edits = (p.edits || []).map((e) => { const m = /(block|check)\s*#?\s*(\d+)/i.exec(e.where || ''); return m && { word: m[1].toLowerCase(), index: Number(m[2]), original: e.original, wrong: e.wrong }; });
          if (!edits.length || edits.some((e) => !e || !e.original || !e.wrong || e.original === e.wrong || /["\\]/.test(e.original + e.wrong))) continue;
          try { L.applyEdits(lv, edits); } catch { continue; }
          kept++;
          L.appendJsonl(OUT, { level: lv.id, track: lv.track, kind: p.kind, edits, truth: p.truth, model: r.model });
        }
        console.log(lv.id, 'asked', kinds.length, 'kept', kept);
        if (kept) return;
      } catch (e) { console.log(lv.id, 'err', String(e.message).slice(0, 100)); await L.sleep(3000); } // eslint-disable-line no-await-in-loop
    }
  });
  console.log('done');
  process.exit(0);
})();
