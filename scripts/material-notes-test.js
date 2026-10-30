/**
 * Learn from your own material, whole-material notes (services/material-notes.js, routes/materials.js, public/my-material-notes):
 *
 *   node scripts/material-notes-test.js
 *
 * Throwaway db and a mock model, so no real call is made.
 */
const os = require('os');
const path = require('path');
const fs = require('fs');
const http = require('http');

process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(os.tmpdir(), `material-notes-test-${process.pid}.json`);

const express = require('express');
const db = require('../config/db');
const materials = require('../services/materials');
const notes = require('../services/material-notes');

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
const llm = (mode) => async (args) => {
  calls.push(args);
  if (mode === 'fail') return null;
  const pid = /\[(p\d+)\]/.exec(args.user)[1];
  return { model: 'mock', data: { sections: [
    { heading: 'Energy', bullets: [
      { text: 'Mitochondria release usable energy from food.', passage_id: pid, quote: S1 },
      { text: 'An invented fact.', passage_id: pid, quote: 'This sentence never appears in the material at all.' },
    ] },
    { heading: 'Nothing grounded', bullets: [{ text: 'x', passage_id: 'p999', quote: S1 }] },
  ] } };
};

(async () => {
  const u = db.insert('users', { email: 'a@test.invalid', role: 'learner' });
  const other = db.insert('users', { email: 'b@test.invalid', role: 'learner' });
  const m = materials.addPaste(u.id, 'Cell biology', TEXT).value;

  console.log('building');
  check('an unknown material is refused', (await notes.build(u.id, 9999, { llm: llm() })).code === 'not_found');
  check("someone else's material is refused", (await notes.build(other.id, m.id, { llm: llm() })).code === 'not_found');
  const out = await notes.build(u.id, m.id, { llm: llm() });
  check('notes are built', !!out.notes && out.notes.status === 'ready', out.error);
  const n = out.notes;
  check('only the learner data class and the learner id are sent', calls.length > 0 && calls.every((c) => c.dataClass === 'learner' && c.userId === u.id));
  check('a bullet with an invented quote is dropped', n.sections.every((s) => s.bullets.every((b) => b.text !== 'An invented fact.')));
  check('a section with no grounded bullet is dropped', !n.sections.some((s) => s.heading === 'Nothing grounded'));
  check('every quote is in the material', n.sections.length > 0 && n.sections.every((s) => s.bullets.every((b) => TEXT.includes(b.quote))));
  check('coverage is reported as a percentage', n.coverage > 0 && n.coverage <= 100, n.coverage);
  const before = calls.length;
  check('asking again costs no model call', (await notes.build(u.id, m.id, { llm: llm() })).cached === true && calls.length === before);
  check('a budget too small ends without notes', (await notes.build(u.id, m.id, { llm: llm(), force: true, tokenBudget: 10 })).code === 'nothing_verified');
  check('a model that fails ends without notes', (await notes.build(u.id, m.id, { llm: llm('fail'), force: true })).code === 'nothing_verified');
  check('a good rebuild works', (await notes.build(u.id, m.id, { llm: llm(), force: true })).notes.status === 'ready');

  console.log('what the learner sees');
  const v = notes.view(notes.get(u.id, m.id));
  check('the view has headings, bullets and quotes', v.sections[0].heading === 'Energy' && !!v.sections[0].bullets[0].quote);
  check('the view leaks no user id or text hash', !/user_id|text_hash/.test(JSON.stringify(v)));
  check('no view for nothing', notes.view(null) === null);

  console.log('routes');
  const app = express();
  app.use((req, res, next) => { req.user = db.byId('users', Number(req.headers['x-user']) || u.id) || null; next(); });
  app.use('/api/materials', require('../routes/materials'));
  const srv = http.createServer(app);
  await new Promise((r) => srv.listen(0, r));
  const port = srv.address().port;
  const call = (method, p2, user) => new Promise((resolve) => {
    const rq = http.request({ port, method, path: p2, headers: { 'content-type': 'application/json', ...(user ? { 'x-user': String(user) } : {}) } }, (res) => {
      let s = ''; res.on('data', (c) => { s += c; }); res.on('end', () => { let j = null; try { j = JSON.parse(s); } catch { /* not json */ } resolve({ status: res.statusCode, body: j }); });
    });
    rq.end(method === 'POST' ? '{}' : undefined);
  });
  const g = await call('GET', `/api/materials/${m.id}/notes`);
  check('GET notes returns the view', g.status === 200 && g.body.notes.sections.length >= 1);
  check('GET notes for another learner is not found', (await call('GET', `/api/materials/${m.id}/notes`, other.id)).status === 404);
  check('POST notes returns the cached notes', (await call('POST', `/api/materials/${m.id}/notes`)).body.cached === true);
  check('POST notes for another learner is not found', (await call('POST', `/api/materials/${m.id}/notes`, other.id)).status === 404);
  srv.close();

  console.log('deletion and wiring');
  materials.remove(u.id, m.id);
  check('deleting the material deletes its notes', !notes.get(u.id, m.id));
  check('notes are in the db collections, the export and the child deletion list', read('config/db.js').includes("'material_notes'") && read('routes/profile.js').includes("'material_notes'") && read('routes/consent.js').includes("'material_notes'"));
  check('the upload list links to the notes page', read('public/js/my-material.js').includes('/my-material-notes?id='));
  check('the notes page exists and calls its own endpoint', read('public/my-material-notes.html').includes('my-material-notes.js') && /\/notes`/.test(read('public/js/my-material-notes.js')));
  check('privacy.html names the notes', read('public/privacy.html').includes('notes and podcast script'));
  check('the test is in the suite', read('scripts/test-steps.json').includes('material-notes-test.js'));

  try { fs.unlinkSync(process.env.DB_FILE); } catch { /* none */ }
  console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
  process.exit(failures ? 1 : 0);
})();
