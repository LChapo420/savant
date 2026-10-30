/**
 * S12c: the study pack's quiz/test and the podcast's weak spots follow the learner model, and a day-by-day simulation
 * shows a learner who knows half the material needs clearly fewer items than one who knows none.
 *
 *   node scripts/material-adapt-rest-test.js
 */
const os = require('os');
const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(os.tmpdir(), `material-adapt-rest-test-${process.pid}.json`);

const db = require('../config/db');
const materials = require('../services/materials');
const packs = require('../services/material-pack');
const podcast = require('../services/material-podcast');
const adapt = require('../services/material-adapt');

let failures = 0;
function check(label, ok, detail) {
  if (ok) { console.log(`  ok   ${label}`); return; }
  failures++;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` - ${JSON.stringify(detail).slice(0, 300)}`}`);
}
const DAY = 86400000;
const T0 = Date.UTC(2026, 9, 30, 12, 0, 0);
const SKILLS = ['a', 'b', 'c', 'd'];

function setup(u, title, progress) {
  const m = materials.addPaste(u.id, title, `Alpha beta gamma delta. ${'Some filler sentence for the material. '.repeat(20)}`).value;
  const item = (id, sk, type) => ({ id, type, prompt: `${sk} ${id}`, choices: ['x', 'y'], answer_index: 0, answer: 'x', explanation: 'e', quote: 'Alpha', passage_id: `p-${sk}` });
  db.insert('material_packs', { user_id: u.id, material_id: m.id, status: 'ready', version: packs.VERSION, summary: [], cards: [],
    quiz: SKILLS.map((s, i) => item(`z${i + 1}`, s, 'multiple_choice')).concat([item('z9', 'orphan', 'multiple_choice')]),
    test: SKILLS.map((s, i) => item(`t${i + 1}`, s, 'multiple_choice')) });
  db.insert('material_courses', { user_id: u.id, material_id: m.id, title, status: 'ready', skills: SKILLS.map((id) => ({
    id, title: id, prerequisites: [], passage_ids: [`p-${id}`], summary: id, lesson: { key_points: [id] },
    questions: [{ id: `${id}1`, type: 'multiple_choice', prompt: id, choices: ['x', 'y'], answer_index: 0, explanation: 'e', quote: 'Alpha', passage_id: `p-${id}` }],
  })) });
  db.insert('material_progress', { user_id: u.id, material_id: m.id, placed: true, forget_m: 0.5, skills: progress });
  return m;
}

(async () => {
  const none = db.insert('users', { email: 'n@test.invalid', role: 'learner' });
  const half = db.insert('users', { email: 'h@test.invalid', role: 'learner' });
  const later = new Date(T0 + 10 * DAY).toISOString();
  const earlier = new Date(T0 - DAY).toISOString();
  const mNone = setup(none, 'Knows none', { a: { status: 'new' }, b: { status: 'new' }, c: { status: 'new' }, d: { status: 'new' } });
  const mHalf = setup(half, 'Knows half', { a: { status: 'mastered', due: later, wrong: [] }, b: { status: 'mastered', due: later, wrong: [] }, c: { status: 'new' }, d: { status: 'learning', wrong_n: 2, wrong: ['d1'] } });

  console.log('study pack');
  const pn = packs.forLearner(none.id, mNone.id, T0);
  const ph = packs.forLearner(half.id, mHalf.id, T0);
  check('a learner who knows nothing gets every item', pn.pack.quiz.length === 5 && pn.pack.test.length === 4 && pn.skipped_known === 0, [pn.pack.quiz.length, pn.pack.test.length]);
  check('a learner who knows half gets fewer', ph.pack.quiz.length === 3 && ph.pack.test.length === 2 && ph.skipped_known === 4, [ph.pack.quiz.length, ph.pack.test.length, ph.skipped_known]);
  check('items on skills they do not know are all kept', ['c', 'd'].every((s) => ph.pack.quiz.some((q) => q.prompt.startsWith(`${s} `))));
  check('an item no skill cites is kept', ph.pack.quiz.some((q) => q.id === 'z9'));
  check('no answer keys are sent', JSON.stringify(ph.pack).indexOf('answer_index') < 0);
  const g = packs.grade(half.id, mHalf.id, 'quiz', { z3: 0, z4: 1, z9: 0 }, ph.ids);
  check('grading only marks the items shown', g.marked === 3 && g.right === 2, [g.marked, g.right]);
  check('grading without a list marks the whole section', packs.grade(half.id, mHalf.id, 'quiz', {}).marked === 5);
  check('the due review brings a known skill back', packs.forLearner(half.id, mHalf.id, T0 + 11 * DAY).pack.quiz.length === 5);

  console.log('podcast weak spots');
  const prog = db.findOne('material_progress', (r) => r.user_id === half.id);
  db.update('material_progress', prog.id, { skills: { ...prog.skills, a: { status: 'mastered', due: later, wrong: [], wrong_n: 3 } } });
  const w = podcast.weakSkills(half.id, mHalf.id, T0).map((x) => x.skill.id);
  check('a known skill is never a weak spot, even with old misses', !w.includes('a'), w);
  check('a skill being fixed still is', w.includes('d'), w);
  const due = podcast.weakSkills(half.id, mHalf.id, T0 + 11 * DAY).map((x) => x.skill.id);
  check('a known skill that comes due is a weak spot again', due.includes('a') && due.includes('b'), due);
  void earlier;

  console.log('day by day');
  // A learner works through what adapt.plan picks each day; items answered right master the skill (due in 7 days), wrong stay.
  function simulate(startKnown) {
    const prog2 = { skills: {}, placed: true };
    const course = { skills: Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, questions: [1, 2, 3, 4].map((n) => ({ id: `s${i}q${n}`, tier: 2 })) })) };
    course.skills.forEach((s, i) => { prog2.skills[s.id] = i < startKnown ? { status: 'mastered', due: new Date(T0 + 30 * DAY).toISOString(), wrong: [] } : { status: 'new' }; });
    let items = 0; let day = 0;
    for (; day < 30; day++) {
      const pl = adapt.plan(course, prog2, T0 + day * DAY);
      if (!pl.skills.length) break;
      for (const sk of pl.skills) { items += sk.items; prog2.skills[sk.id] = { status: 'mastered', due: new Date(T0 + (day + 30) * DAY).toISOString(), wrong: [] }; }
    }
    return { items, day, mastered: Object.values(prog2.skills).every((x) => x.status === 'mastered') };
  }
  const sNone = simulate(0); const sHalf = simulate(4);
  check('both reach mastery of every skill', sNone.mastered && sHalf.mastered);
  check('knowing half takes clearly fewer items', sHalf.items * 2 <= sNone.items + 1 && sHalf.items < sNone.items, [sHalf.items, sNone.items]);

  console.log('wiring');
  const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  check('pack route takes adapt=1', read('routes/materials.js').includes("req.query.adapt === '1'"));
  check('cards page has Pick for me', read('public/js/my-material-cards.js').includes('Pick for me'));
  check('the test is in the suite', read('scripts/test-steps.json').includes('material-adapt-rest-test.js'));

  try { fs.unlinkSync(process.env.DB_FILE); } catch { /* none */ }
  console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
  process.exit(failures ? 1 : 0);
})();
