/**
 * Learn from your own material, study pack (services/material-pack.js, routes/materials.js, public/my-material-pack):
 *
 *   node scripts/material-pack-test.js
 *
 * Throwaway db and a mock model, so no real call is made.
 */
const os = require('os');
const path = require('path');
const fs = require('fs');
const http = require('http');

process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(os.tmpdir(), `material-pack-test-${process.pid}.json`);

const express = require('express');
const db = require('../config/db');
const materials = require('../services/materials');
const packs = require('../services/material-pack');

let failures = 0;
function check(label, ok, detail) {
  if (ok) { console.log(`  ok   ${label}`); return; }
  failures++;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 300)}`}`);
}
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

const S1 = 'Mitochondria are the organelles that release usable energy from food inside a cell.';
const S2 = 'Chloroplasts capture sunlight and use it to build sugar from carbon dioxide and water.';
const para = (first) => `${first} ${'Cells are the basic unit of life and each part has a job to do. '.repeat(20)}`;
const TEXT = [para(S1), para(S2)].join('\n\n');

let calls = [];
function llm(opts = {}) {
  return async (args) => {
    calls.push(args);
    if (args.task === 'material_pack') {
      const pid = /\[(p\d+)\]/.exec(args.user)[1];
      return { model: 'mock', data: {
        summary: ['Cells have parts with jobs.'],
        flashcards: [
          { front: 'Mitochondria', back: 'Release usable energy.', passage_id: pid, quote: S1 },
          { front: 'Invented card', back: 'Not in the text.', passage_id: pid, quote: 'This sentence never appears in the material at all.' },
        ],
        questions: [
          { for: 'quiz', type: 'multiple_choice', prompt: 'What releases energy?', choices: ['a', 'b', 'c'], answer_index: 1, explanation: 'The text says so.', passage_id: pid, quote: S1 },
          { for: 'quiz', type: 'multiple_choice', prompt: 'Unsupported one?', choices: ['a', 'b', 'c'], answer_index: 0, explanation: 'x', passage_id: pid, quote: S1 },
          { for: 'quiz', type: 'written', prompt: 'A written item cannot be in the quiz.', answer: 'x', key_points: ['y'], explanation: 'x', passage_id: pid, quote: S1 },
          { for: 'test', type: 'short_answer', prompt: 'Mitochondria release usable ___ from food.', answer: 'energy', explanation: 'The text says so.', passage_id: pid, quote: S1 },
          { for: 'test', type: 'short_answer', prompt: 'No gap here?', answer: 'energy', explanation: 'x', passage_id: pid, quote: S1 },
          { for: 'test', type: 'written', prompt: 'Explain what mitochondria do.', answer: 'They release usable energy from food.', key_points: ['energy', 'food'], explanation: 'From the text.', passage_id: pid, quote: S1 },
          { for: 'test', type: 'written', prompt: 'Ungrounded written.', answer: 'x', key_points: ['y'], explanation: 'x', passage_id: pid, quote: 'Nothing like this is in the material text.' },
        ].slice(0, opts.few ? 4 : 99),
      } };
    }
    // verify: the second multiple-choice item ("Unsupported one?") is rejected
    const lines = args.user.match(/^\d+\. .*$/gm) || [];
    return { model: 'mock', data: { verdicts: lines.map((l, i) => ({ n: i + 1, supported: !/Unsupported/.test(l) })) } };
  };
}

(async () => {
  const u = db.insert('users', { email: 'a@test.invalid', role: 'learner' });
  const other = db.insert('users', { email: 'b@test.invalid', role: 'learner' });
  const m = materials.addPaste(u.id, 'Cell biology', TEXT).value;

  console.log('building');
  check('an unknown material is refused', (await packs.build(u.id, 9999, { llm: llm() })).code === 'not_found');
  check("someone else's material is refused", (await packs.build(other.id, m.id, { llm: llm() })).code === 'not_found');
  const out = await packs.build(u.id, m.id, { llm: llm() });
  check('a pack is built', !!out.pack && out.pack.status === 'ready', out.error);
  const p = out.pack;
  check('the model is only called with the learner data class and the learner id', calls.length > 0 && calls.every((c) => c.dataClass === 'learner' && c.userId === u.id));
  check('a card with an invented quote is dropped', p.cards.length >= 1 && !p.cards.some((c) => c.front === 'Invented card'));
  check('every card quote is in the material', p.cards.every((c) => TEXT.includes(c.quote)));
  check('the quiz keeps the supported multiple-choice item only', p.quiz.length >= 1 && p.quiz.every((q) => q.type === 'multiple_choice' && q.prompt === 'What releases energy?'));
  check('a written item cannot sit in the quiz', !p.quiz.some((q) => q.type === 'written'));
  check('the test has fill-in-the-blank and written items', p.test.some((q) => q.type === 'fill_blank') && p.test.some((q) => q.type === 'written'));
  check('a fill-in item with no gap is dropped', !p.test.some((q) => q.prompt === 'No gap here?'));
  check('an ungrounded written item is dropped', !p.test.some((q) => q.prompt === 'Ungrounded written.'));
  check('ids are assigned', p.cards.every((c) => /^c\d+$/.test(c.id)) && p.quiz.every((q) => /^z\d+$/.test(q.id)) && p.test.every((q) => /^t\d+$/.test(q.id)));

  const before = calls.length;
  const again = await packs.build(u.id, m.id, { llm: llm() });
  check('asking again costs no model call', again.cached === true && calls.length === before);
  const small = await packs.build(u.id, m.id, { llm: llm(), force: true, tokenBudget: 10 });
  check('a budget too small stops the build and keeps nothing useful', small.code === 'nothing_verified');

  console.log('grading');
  const good = await packs.build(u.id, m.id, { llm: llm(), force: true });
  const pack = packs.get(u.id, m.id);
  check('rebuilt', good.pack && pack.status === 'ready');
  console.log('what the learner sees');
  const v = packs.view(pack);
  const json = JSON.stringify(v);
  check('the view has no answer keys', !/answer_index|"answer"|key_points|misconception/.test(json));
  check('the view carries the summary and the cards', v.summary.length === 1 && v.cards.length >= 1 && !!v.cards[0].back);

  const mc = pack.quiz[0];
  const right = packs.grade(u.id, m.id, 'quiz', { [mc.id]: mc.answer_index });
  check('a right choice is marked right', right.right === 1 && right.marked === 1);
  const wrong = packs.grade(u.id, m.id, 'quiz', { [mc.id]: (mc.answer_index + 1) % mc.choices.length });
  check('a wrong choice is marked wrong and shows the key and the quote', wrong.right === 0 && wrong.results[0].correct_answer === mc.choices[mc.answer_index] && !!wrong.results[0].quote);
  check('a text answer to a multiple-choice item is wrong', packs.grade(u.id, m.id, 'quiz', { [mc.id]: 'b' }).right === 0);
  const fb = pack.test.find((q) => q.type === 'fill_blank');
  const wr = pack.test.find((q) => q.type === 'written');
  const t = packs.grade(u.id, m.id, 'test', { [fb.id]: 'Energy', [wr.id]: 'They make energy.' });
  check('a fill-in answer is marked, case ignored', t.results.find((r) => r.id === fb.id).correct === true);
  check('a written answer is not marked; the model answer and key points come back', t.marked === 1 && t.results.find((r) => r.id === wr.id).key_points.length === 2);
  check('an unanswered paper marks nothing right', packs.grade(u.id, m.id, 'test', {}).right === 0);
  check('a bad section is refused', packs.grade(u.id, m.id, 'exam', {}).code === 'bad_section');
  check('another learner has no pack to grade', packs.grade(other.id, m.id, 'quiz', {}).code === 'no_pack');
  check('inherited keys are not answers', packs.grade(u.id, m.id, 'quiz', JSON.parse('{"__proto__":{"z1":1}}')).right === 0);

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
  const g = await call('GET', `/api/materials/${m.id}/pack`);
  check('GET pack returns the view without keys', g.status === 200 && g.body.pack.cards.length >= 1 && !/answer_index|key_points/.test(JSON.stringify(g.body)));
  check('GET pack for another learner is not found', (await call('GET', `/api/materials/${m.id}/pack`, null, other.id)).status === 404);
  check('POST pack returns the cached pack', (await call('POST', `/api/materials/${m.id}/pack`, {})).body.cached === true);
  const gr = await call('POST', `/api/materials/${m.id}/pack/grade`, { section: 'quiz', answers: { [mc.id]: mc.answer_index } });
  check('POST grade marks on the server', gr.status === 200 && gr.body.right === 1);
  check('POST grade for another learner is not found', (await call('POST', `/api/materials/${m.id}/pack/grade`, { section: 'quiz', answers: {} }, other.id)).status === 404);
  srv.close();

  console.log('deletion and wiring');
  check('a pack exists before delete', !!packs.get(u.id, m.id));
  materials.remove(u.id, m.id);
  check('deleting the material deletes its pack', !packs.get(u.id, m.id));
  check('packs are in the db collections', read('config/db.js').includes("'material_packs'"));
  check('packs are in the data export and the child deletion list', read('routes/profile.js').includes("'material_packs'") && read('routes/consent.js').includes("'material_packs'"));
  const page = read('public/js/my-material.js');
  check('the upload list offers a pack or a path', page.includes('data-pack') && page.includes('Learning path') && page.includes('Study pack'));
  check('the pack page exists and calls only its own endpoints', read('public/my-material-pack.html').includes('my-material-pack.js') && /\/pack`/.test(read('public/js/my-material-pack.js')));
  check('privacy.html says where study material goes', read('public/privacy.html').includes('Study material you add to My material'));

  try { fs.unlinkSync(process.env.DB_FILE); } catch { /* none */ }
  console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
  process.exit(failures ? 1 : 0);
})();
