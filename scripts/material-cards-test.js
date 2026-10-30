/**
 * Learn from your own material, flashcards (services/material-cards.js, routes/materials.js, public/my-material-cards):
 *
 *   node scripts/material-cards-test.js
 *
 * Throwaway db; no model is called (the deck is built from rows the pack and the course already hold).
 */
const os = require('os');
const path = require('path');
const fs = require('fs');
const http = require('http');

process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(os.tmpdir(), `material-cards-test-${process.pid}.json`);

const express = require('express');
const db = require('../config/db');
const materials = require('../services/materials');
const cards = require('../services/material-cards');

let failures = 0;
function check(label, ok, detail) {
  if (ok) { console.log(`  ok   ${label}`); return; }
  failures++;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 300)}`}`);
}
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const DAY = 86400000;
const T0 = Date.UTC(2026, 9, 30, 12, 0, 0);

(async () => {
  const u = db.insert('users', { email: 'a@test.invalid', role: 'learner' });
  const other = db.insert('users', { email: 'b@test.invalid', role: 'learner' });
  const m = materials.addPaste(u.id, 'Cell biology', `Mitochondria release usable energy from food. ${'Cells are the unit of life. '.repeat(30)}`).value;

  console.log('deck from the pack and the misses');
  check('an unknown material is refused', cards.deck(u.id, 9999, T0).code === 'not_found');
  check("someone else's material is refused", cards.deck(other.id, m.id, T0).code === 'not_found');
  check('an empty deck is empty', cards.deck(u.id, m.id, T0).total === 0);

  db.insert('material_packs', { user_id: u.id, material_id: m.id, status: 'ready', cards: [
    { id: 'c1', front: 'Mitochondria', back: 'Release usable energy.', passage_id: 'p1', quote: 'Mitochondria release usable energy from food.' },
    { id: 'c2', front: 'Cell', back: 'The unit of life.', passage_id: 'p2', quote: 'Cells are the unit of life.' },
  ], quiz: [], test: [] });
  db.insert('material_courses', { user_id: u.id, material_id: m.id, title: 'Cell biology', status: 'ready', skills: [
    { id: 's-energy', title: 'Energy', prerequisites: [], passage_ids: ['p1'], questions: [
      { id: 'q1', type: 'multiple_choice', prompt: 'What releases energy?', choices: ['Nucleus', 'Mitochondria'], answer_index: 1, explanation: 'The text says so.', quote: 'Mitochondria release usable energy from food.', passage_id: 'p1' },
    ] },
  ] });
  db.insert('material_progress', { user_id: u.id, material_id: m.id, forget_m: 0.5, skills: { 's-energy': { wrong: ['q1'], misconceptions: [{ q: 'q1', text: 'The nucleus makes energy.' }] } } });

  const d = cards.deck(u.id, m.id, T0);
  check('pack cards and the missed question are in the deck', d.total === 3 && d.due_count === 3, d);
  check('a pack card is tied to the skill that cites its passage', d.cards.find((c) => c.front === 'Mitochondria').skill === 's-energy' && d.cards.find((c) => c.front === 'Mitochondria').skill_title === 'Energy');
  const miss = d.cards.find((c) => c.source === 'mistake');
  check('a mistake card carries the right answer, the explanation and the misconception', miss && /Mitochondria/.test(miss.back) && /text says so/.test(miss.back) && miss.misconception === 'The nucleus makes energy.', miss);
  check('syncing again adds nothing', cards.deck(u.id, m.id, T0).total === 3);
  check('the multiplier starts from the course reviews', db.findOne('material_cards', (c) => c.user_id === u.id).forget_m === 0.5);

  console.log('review schedule');
  const c1 = d.cards.find((c) => c.front === 'Cell').id;
  check('a bad rating is refused', cards.review(u.id, m.id, c1, 'perfect', T0).code === 'bad_rating');
  check('an unknown card is refused', cards.review(u.id, m.id, 'k99', 'good', T0).code === 'no_card');
  const good1 = cards.review(u.id, m.id, c1, 'good', T0);
  check('good schedules days ahead, from the forgetting curve', good1.next_in_days >= 1 && Date.parse(good1.due_at) === T0 + good1.next_in_days * DAY, good1);
  check('a reviewed card is no longer due', cards.deck(u.id, m.id, T0).due_count === 2);
  let t = T0 + good1.next_in_days * DAY; let last = good1;
  for (let i = 0; i < 9; i++) { last = cards.review(u.id, m.id, c1, 'good', t); t += last.next_in_days * DAY; }
  check('repeated good reviews stretch the interval (the path curve grows slowly)', last.next_in_days > good1.next_in_days, [good1, last]);
  const easy = cards.review(u.id, m.id, miss.id, 'easy', T0);
  const hard = cards.review(u.id, m.id, d.cards.find((c) => c.front === 'Mitochondria').id, 'hard', T0);
  check('easy waits longer than hard on a fresh card', easy.next_in_days > hard.next_in_days, [easy, hard]);
  const mBefore2 = db.findOne('material_cards', (c) => c.user_id === u.id).forget_m;
  const again = cards.review(u.id, m.id, c1, 'again', t);
  check('again is due in minutes and counts as a miss', Date.parse(again.due_at) === t + 600000 && again.next_in_days === 0);
  check('a miss moves the half-life multiplier down', db.findOne('material_cards', (c) => c.user_id === u.id).forget_m < mBefore2);
  check('due lists only due cards, oldest first', cards.due(u.id, m.id, 20, t + 400 * DAY).cards.length === 3 && cards.due(u.id, m.id, 20, T0).cards.length === 0);

  console.log('edit, add, delete');
  check('an empty edit is refused', cards.edit(u.id, m.id, c1, { front: '  ' }).code === 'empty');
  check('an edit changes the card and marks it edited', cards.edit(u.id, m.id, c1, { back: 'The basic unit of life.' }).card === c1 && cards.deck(u.id, m.id, T0).cards.find((c) => c.id === c1).edited === true);
  check('an edit keeps the schedule', cards.deck(u.id, m.id, T0).cards.find((c) => c.id === c1).reviews === 11);
  const mine = cards.add(u.id, m.id, { front: 'Ribosome', back: 'Builds proteins.' }, T0);
  check('the learner can add their own card, due now', mine.card && cards.deck(u.id, m.id, T0).cards.find((c) => c.id === mine.card).source === 'own');
  check('a card needs both sides', cards.add(u.id, m.id, { front: 'x' }).code === 'empty');
  check('tags and control characters are flattened', (() => { const k = cards.add(u.id, m.id, { front: 'a\u0000b', back: 'c\n\nd' }); return cards.deck(u.id, m.id, T0).cards.find((c) => c.id === k.card).front === 'a b'; })());
  check('deleting a mistake card keeps it deleted after a sync', cards.remove(u.id, m.id, miss.id).removed === 1 && !cards.deck(u.id, m.id, T0).cards.some((c) => c.source === 'mistake'));
  check('deleting an unknown card is refused', cards.remove(u.id, m.id, 'k99').code === 'no_card');

  console.log('routes');
  const app = express();
  app.use((req, res, next) => { req.user = db.byId('users', Number(req.headers['x-user']) || u.id) || null; next(); });
  app.use('/api/materials', require('../routes/materials'));
  const srv = http.createServer(app);
  await new Promise((r) => srv.listen(0, r));
  const port = srv.address().port;
  const call = (method, p2, body, user) => new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const rq = http.request({ port, method, path: p2, headers: { 'content-type': 'application/json', ...(user ? { 'x-user': String(user) } : {}) } }, (res) => {
      let s = ''; res.on('data', (c) => { s += c; }); res.on('end', () => { let j = null; try { j = JSON.parse(s); } catch { /* not json */ } resolve({ status: res.statusCode, body: j }); });
    });
    if (data) rq.write(data);
    rq.end();
  });
  const base = `/api/materials/${m.id}/cards`;
  const g = await call('GET', base);
  check('GET deck', g.status === 200 && g.body.total >= 3 && !!g.body.cards[0].front);
  check('GET deck for another learner is not found', (await call('GET', base, null, other.id)).status === 404);
  check('GET due', (await call('GET', `${base}/due`)).status === 200);
  const added = await call('POST', base, { front: 'Nucleus', back: 'Holds the DNA.' });
  check('POST adds a card', added.status === 200 && !!added.body.card);
  check('POST review', (await call('POST', `${base}/review`, { card: added.body.card, rating: 'good' })).status === 200);
  check('POST review with a bad rating is a 400', (await call('POST', `${base}/review`, { card: added.body.card, rating: 'x' })).status === 400);
  check('PATCH edits', (await call('PATCH', `${base}/${added.body.card}`, { back: 'Holds the cell DNA.' })).status === 200);
  check("another learner cannot edit someone else's card", (await call('PATCH', `${base}/${added.body.card}`, { back: 'x' }, other.id)).status === 404);
  check('DELETE removes', (await call('DELETE', `${base}/${added.body.card}`)).body.removed === 1);
  check('DELETE of an unknown card is 404', (await call('DELETE', `${base}/k999`)).status === 404);
  srv.close();

  console.log('deletion and wiring');
  check('a deck exists before delete', !!db.findOne('material_cards', (c) => c.user_id === u.id));
  materials.remove(u.id, m.id);
  check('deleting the material deletes its deck', !db.findOne('material_cards', (c) => c.user_id === u.id));
  check('the collection is registered', read('config/db.js').includes("'material_cards'"));
  check('cards are in the data export and the child deletion list', read('routes/profile.js').includes("'material_cards'") && read('routes/consent.js').includes("'material_cards'"));
  check('the page is wired to the api and the pack links to it', read('public/js/my-material-cards.js').includes('/review') && read('public/js/my-material-pack.js').includes('/my-material-cards'));
  check('the privacy page names the flashcards', /flashcard/i.test(read('public/privacy.html')));

  try { fs.unlinkSync(process.env.DB_FILE); } catch { /* none */ }
  console.log(failures ? `\n${failures} failed` : '\nall passed');
  process.exit(failures ? 1 : 0);
})();
