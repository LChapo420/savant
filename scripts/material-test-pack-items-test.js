/**
 * S3b(1): the study pack's fill-in-the-blank and written items are drawn into the on-demand practice test.
 *
 *   node scripts/material-test-pack-items-test.js
 *
 * Throwaway db, mocked model, mocked typed-grading judge.
 */
const os = require('os');
const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(os.tmpdir(), `material-test-pack-items-${process.pid}.json`);

const db = require('../config/db');
const materials = require('../services/materials');
const cb = require('../services/course-builder');
const pt = require('../services/material-test');

let failures = 0;
function check(label, ok, detail) {
  if (ok) { console.log(`  ok   ${label}`); return; }
  failures++;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 300)}`}`);
}

const S1 = 'Mitochondria are the organelles that release usable energy from food inside a cell.';
const S2 = 'Chloroplasts capture sunlight and use it to build sugar from carbon dioxide and water.';
const para = (first) => `${first} ${'Cells are the basic unit of life and each part has a job to do. '.repeat(20)}`;
const TEXT = [para(S1), para(S2)].join('\n\n');

function llm() {
  return async (args) => {
    if (args.task === 'material_outline') return { model: 'mock', data: { skills: [
      { id: 'cells', title: 'Inside the cell', summary: 'Organelles.', unit: 'Cells', prerequisites: [], passage_ids: ['p1'] },
      { id: 'photo', title: 'Photosynthesis', summary: 'Sugar from light.', unit: 'Plants', prerequisites: ['cells'], passage_ids: ['p2'] },
    ] } };
    if (args.task === 'material_lesson') {
      const pid = /\[(p\d+)\]/.exec(args.user)[1];
      const quote = { p1: S1, p2: S2 }[pid];
      const q = (n) => ({ type: 'multiple_choice', prompt: `Question ${n} about ${pid}?`, choices: ['one', 'two', 'three'], answer_index: 1, tier: 2, misconceptions: ['a', '', 'b'], explanation: 'Because.', passage_id: pid, quote });
      return { model: 'mock', data: { lesson: { paragraphs: ['Short lesson.'], key_points: ['Key.'] }, questions: [q(1), q(2), q(3)] } };
    }
    const n = (args.user.match(/^\d+\./gm) || []).length;
    return { model: 'mock', data: { verdicts: Array.from({ length: n }, (_, i) => ({ n: i + 1, supported: true })) } };
  };
}

(async () => {
  const u = db.insert('users', { email: 'a@test.invalid', role: 'learner' });
  const m = materials.addPaste(u.id, 'Cell biology', TEXT).value;
  await cb.build(u.id, m.id, { llm: llm() });
  const own = cb.get(u.id, m.id).skills.reduce((n, s) => n + s.questions.length, 0);

  console.log('no pack');
  check('without a pack the test holds only the course questions', pt.start(u.id, m.id, { length: 40 }).questions.length === own);

  db.insert('material_packs', {
    user_id: u.id, material_id: m.id, status: 'ready', summary: [], cards: [], quiz: [],
    test: [
      { id: 't1', type: 'fill_blank', prompt: 'Mitochondria release ____ from food.', answer: 'energy', passage_id: 'p1', quote: S1, explanation: 'x' },
      { id: 't2', type: 'written', prompt: 'Explain what chloroplasts do.', answer: 'They capture sunlight to build sugar.', key_points: ['sunlight', 'sugar'], passage_id: 'p2', quote: S2, explanation: 'y' },
      { id: 't3', type: 'multiple_choice', prompt: 'Pack choice?', choices: ['a', 'b'], answer_index: 0, passage_id: 'p1', quote: S1 },
      { id: 't4', type: 'written', prompt: 'Cites no skill.', answer: 'z', key_points: ['z'], passage_id: 'p9', quote: S1 },
    ],
  });

  console.log('with a pack');
  const o = pt.options(u.id, m.id);
  check('skill counts include the pack\'s fill-in and written items', o.skills.reduce((n, s) => n + s.questions, 0) === own + 2, o.skills);
  const t = pt.start(u.id, m.id, { length: 40 });
  const ids = t.questions.map((q) => q.id);
  check('both items are drawn, the pack\'s choice question and the uncited item are not', t.questions.length === own + 2 && ids.includes('pk-t1') && ids.includes('pk-t2') && !ids.includes('pk-t3') && !ids.includes('pk-t4'), ids);
  const w = t.questions.find((q) => q.id === 'pk-t2');
  check('drawn under the skill that cites the passage, shown as a typed answer, no key sent', w.skill === 'photo' && w.type === 'short_answer' && !/answer|quote|key_points/.test(JSON.stringify(w).replace('short_answer', '')), w);

  const answers = {};
  for (const q of t.questions) answers[q.id] = null;
  answers['pk-t1'] = 'energy';
  answers['pk-t2'] = 'Plants use light in their green organelles to make food.';
  const res = await pt.submit(u.id, m.id, t.test_id, answers, { grade: async () => ({ status: 'accepted', by: 'mock' }) });
  const r1 = res.results.find((x) => x.id === 'pk-t1');
  const r2 = res.results.find((x) => x.id === 'pk-t2');
  check('the fill-in is marked right by the free check', r1 && r1.ok && r1.by === 'rules', r1);
  check('the written answer goes through the typed-grading cascade', r2 && r2.ok && r2.by === 'mock', r2);
  const prog = db.findOne('material_progress', (p) => p.user_id === u.id && p.material_id === m.id);
  check('answers feed the learner model for their skill', prog.skills.photo.right >= 1 && prog.skills.cells.right >= 1, prog.skills);

  const t2 = pt.start(u.id, m.id, { length: 40 });
  const bad = {};
  bad['pk-t1'] = 'banana';
  const res2 = await pt.submit(u.id, m.id, t2.test_id, bad, { grade: async () => ({ status: 'rejected', by: 'mock' }) });
  const rem = res2.remediation.find((x) => x.id === 'pk-t1');
  check('a missed pack item comes back with the right answer and its quote', rem && rem.correct_answer === 'energy' && rem.from_your_material === S1, rem);

  console.log('adapt');
  const a = pt.start(u.id, m.id, { adapt: true, length: 40 });
  check('"pick for me" still works with pack items in the pool', a.questions ? a.questions.length > 0 : a.code === 'nothing_due', a);

  console.log('other learners');
  const other = db.insert('users', { email: 'b@test.invalid', role: 'learner' });
  check('another learner has no course, so sees none of it', pt.options(other.id, m.id).code === 'no_course');

  try { fs.unlinkSync(process.env.DB_FILE); } catch { /* none */ }
  console.log(failures ? `\n${failures} FAILED` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})();
