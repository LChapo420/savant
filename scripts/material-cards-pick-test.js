/**
 * Flashcards, "pick for me" (services/material-cards.js pick, S12b): a learner who knows half the skills is shown
 * about half the new cards, and no card of a skill they do not know is skipped.
 *
 *   node scripts/material-cards-pick-test.js
 */
const os = require('os');
const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(os.tmpdir(), `material-cards-pick-test-${process.pid}.json`);

const db = require('../config/db');
const materials = require('../services/materials');
const cards = require('../services/material-cards');

let failures = 0;
function check(label, ok, detail) {
  if (ok) { console.log(`  ok   ${label}`); return; }
  failures++;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 300)}`}`);
}
const DAY = 86400000;
const T0 = Date.UTC(2026, 9, 30, 12, 0, 0);
const SKILLS = ['a', 'b', 'c', 'd'];

function setup(u, title, progress) {
  const m = materials.addPaste(u.id, title, `Alpha beta gamma delta. ${'Some filler sentence for the material. '.repeat(20)}`).value;
  db.insert('material_packs', { user_id: u.id, material_id: m.id, status: 'ready', cards: [], quiz: [], test: [] });
  db.insert('material_courses', { user_id: u.id, material_id: m.id, title, status: 'ready', skills: SKILLS.map((id) => ({
    id, title: id, prerequisites: [], passage_ids: ['p1'],
    questions: [{ id: `${id}1`, type: 'multiple_choice', prompt: id, choices: ['x', 'y'], answer_index: 0, explanation: 'e', quote: 'Alpha beta gamma delta.', passage_id: 'p1' }],
  })) });
  if (progress) db.insert('material_progress', { user_id: u.id, material_id: m.id, placed: true, forget_m: 0.5, skills: progress });
  // two cards per skill, written the way a learner's own cards are, then tagged to their skill
  const r = db.findOne('material_cards', (c) => c.user_id === u.id && c.material_id === m.id) || db.insert('material_cards', { user_id: u.id, material_id: m.id, cards: [], forget_m: 0.5, seq: 0, created_at: new Date(T0).toISOString() });
  let seq = 0;
  for (const id of SKILLS) for (let k = 0; k < 2; k++) r.cards.push({ id: `k${++seq}`, front: `${id}${k}`, back: 'b', source: 'pack', skill: id, right: 0, wrong: 0, due: null, interval_days: 0 });
  db.update('material_cards', r.id, { cards: r.cards, seq });
  return m;
}

(async () => {
  const none = db.insert('users', { email: 'n@test.invalid', role: 'learner' });
  const half = db.insert('users', { email: 'h@test.invalid', role: 'learner' });
  const later = new Date(T0 + 10 * DAY).toISOString();
  const mNone = setup(none, 'Knows none', { a: { status: 'new' }, b: { status: 'new' }, c: { status: 'new' }, d: { status: 'new' } });
  const mHalf = setup(half, 'Knows half', { a: { status: 'mastered', due: later, wrong: [] }, b: { status: 'mastered', due: later, wrong: [] }, c: { status: 'new' }, d: { status: 'new' } });

  const pn = cards.pick(none.id, mNone.id, 50, T0);
  const ph = cards.pick(half.id, mHalf.id, 50, T0);
  check('a learner who knows nothing is shown every card', pn.cards.length === 8 && pn.skipped_known === 0, pn.cards.length);
  check('a learner who knows half is shown clearly fewer', ph.cards.length === 4 && ph.skipped_known === 4, [ph.cards.length, ph.skipped_known]);
  check('no card of a skill they do not know is skipped', ['c', 'd'].every((s) => ph.cards.filter((c) => c.skill === s).length === 2));
  check('none of the shown cards belong to a known skill', ph.cards.every((c) => c.skill !== 'a' && c.skill !== 'b'));

  console.log('missed and due');
  const r = db.findOne('material_cards', (c) => c.user_id === half.id && c.material_id === mHalf.id);
  r.cards[0].right = 1; r.cards[0].due = new Date(T0 - DAY).toISOString(); // a known skill's card, reviewed, now due
  r.cards[6].misconception = 'mix-up'; // skill d
  db.update('material_cards', r.id, { cards: r.cards });
  const p2 = cards.pick(half.id, mHalf.id, 50, T0);
  check('a reviewed card whose own clock says due comes back even for a known skill', p2.cards.some((c) => c.front === 'a0'));
  check('a card from a recorded mix-up comes first', p2.cards[0].front === 'd0' || p2.cards[0].misconception === 'mix-up', p2.cards[0]);
  check('limit is respected', cards.pick(half.id, mHalf.id, 2, T0).cards.length === 2);
  check('an unknown material is refused', cards.pick(half.id, 9999, 5, T0).code === 'not_found');
  check('the route exists', fs.readFileSync(path.join(__dirname, '..', 'routes/materials.js'), 'utf8').includes("'/:id/cards/pick'"));
  check('the test is in the suite', fs.readFileSync(path.join(__dirname, '..', 'scripts/test-steps.json'), 'utf8').includes('material-cards-pick-test.js'));

  try { fs.unlinkSync(process.env.DB_FILE); } catch { /* none */ }
  console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
  process.exit(failures ? 1 : 0);
})();
