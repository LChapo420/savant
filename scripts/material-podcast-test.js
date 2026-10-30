/**
 * Learn from your own material, podcast (services/material-podcast.js, routes/materials.js, public/my-material-podcast):
 *
 *   node scripts/material-podcast-test.js
 *
 * Throwaway db and a mock model, so no real call is made.
 */
const os = require('os');
const path = require('path');
const fs = require('fs');
const http = require('http');

process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(os.tmpdir(), `material-podcast-test-${process.pid}.json`);

const express = require('express');
const db = require('../config/db');
const materials = require('../services/materials');
const podcast = require('../services/material-podcast');
const player = require('../public/js/my-material-podcast');

let failures = 0;
function check(label, ok, detail) {
  if (ok) { console.log(`  ok   ${label}`); return; }
  failures++;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 300)}`}`);
}
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

const S1 = 'Mitochondria are the organelles that release usable energy from food inside a cell.';
const para = (first) => `${first} ${'Cells are the basic unit of life and each part has a job to do. '.repeat(20)}`;
const TEXT = [para(S1), para('Chloroplasts capture sunlight and use it to build sugar from carbon dioxide and water.')].join('\n\n');

let calls = [];
const llm = (opts = {}) => async (args) => {
  calls.push(args);
  if (opts.fail) return { data: null };
  const pid = /\[(p\d+)\]/.exec(args.user)[1];
  const turns = [{ host: 'A', text: 'Welcome back to the show.' }];
  for (let i = 0; i < 6; i++) turns.push({ host: i % 2 ? 'A' : 'B', text: 'Mitochondria release usable energy from the food a cell takes in.', passage_id: pid, quote: S1 });
  turns.push({ host: 'B', text: 'This long invented turn has no quote and states a fact the material never gave: the nucleus makes all of the energy in every cell, which is simply false and ungrounded.' });
  turns.push({ host: 'A', text: 'A turn with a fake quote that is not in the text.', passage_id: pid, quote: 'This sentence never appears anywhere in the material.' });
  turns.push({ host: 'X', text: 'Bad host.' });
  turns.push({ host: 'B', text: 'So that is the recap.' });
  return { model: 'mock', data: { title: 'Cells in ten minutes', turns } };
};

(async () => {
  const u = db.insert('users', { email: 'a@test.invalid', role: 'learner' });
  const other = db.insert('users', { email: 'b@test.invalid', role: 'learner' });
  const m = materials.addPaste(u.id, 'Cell biology', TEXT).value;

  console.log('overview episode');
  check('an unknown material is refused', (await podcast.build(u.id, 9999, { llm: llm() })).code === 'not_found');
  check("someone else's material is refused", (await podcast.build(other.id, m.id, { llm: llm() })).code === 'not_found');
  check('a bad kind is refused', (await podcast.build(u.id, m.id, { kind: 'x', llm: llm() })).code === 'bad_kind');
  const out = await podcast.build(u.id, m.id, { llm: llm() });
  check('an episode is built', !!out.episode && out.episode.status === 'ready', out.error);
  const ep = out.episode;
  check('the model is called only with the learner data class and id', calls.length === 1 && calls.every((c) => c.dataClass === 'learner' && c.userId === u.id));
  check('only hosts A and B speak', ep.turns.every((t) => t.host === 'A' || t.host === 'B'));
  check('every quote is in the material', ep.turns.filter((t) => t.quote).length >= 6 && ep.turns.every((t) => !t.quote || TEXT.includes(t.quote)));
  check('a long turn with no quote is dropped', !ep.turns.some((t) => /invented turn/.test(t.text)));
  check('a turn with a quote that is not in the text is dropped', !ep.turns.some((t) => /fake quote/.test(t.text)));
  check('short linking turns stay', ep.turns.some((t) => /recap/.test(t.text)) && ep.turns[0].quote === null);
  const before = calls.length;
  check('asking again costs no model call', (await podcast.build(u.id, m.id, { llm: llm() })).cached === true && calls.length === before);
  check('a budget too small makes nothing', (await podcast.build(u.id, m.id, { llm: llm(), force: true, tokenBudget: 10 })).code === 'nothing_verified');
  check('a model that returns nothing makes nothing', (await podcast.build(u.id, m.id, { llm: llm({ fail: true }), force: true })).code === 'nothing_verified');
  check('the view has the script and no internals', (() => { const v = podcast.view(podcast.options(u.id, m.id).overview && db.findOne('material_podcasts', (c) => c.user_id === u.id)); return v && !/sig|user_id|tokens_used|passage_id/.test(JSON.stringify(v)); })());

  console.log('weak spots episode');
  check('no course means no weak spots', (await podcast.build(u.id, m.id, { kind: 'weak', llm: llm() })).code === 'no_weak_spots');
  db.insert('material_courses', { user_id: u.id, material_id: m.id, title: 'Cell biology', status: 'ready', skills: [
    { id: 's-energy', title: 'Energy', summary: 'Where cells get energy.', prerequisites: [], passage_ids: ['p1'], lesson: { paragraphs: [], key_points: ['Mitochondria release energy'] }, questions: [] },
    { id: 's-sun', title: 'Sunlight', summary: 'Sugar from light.', prerequisites: [], passage_ids: ['p2'], lesson: { paragraphs: [], key_points: [] }, questions: [] },
  ] });
  check('a course with no history has no weak spots', podcast.weakSkills(u.id, m.id).length === 0);
  const NOW = Date.UTC(2026, 9, 30, 12);
  const prog = db.insert('material_progress', { user_id: u.id, material_id: m.id, skills: {
    's-energy': { status: 'learning', wrong_n: 2, misconceptions: [{ q: 'q1', text: 'The nucleus makes energy.' }] },
    's-sun': { status: 'mastered', wrong_n: 0, due: new Date(NOW + 86400000).toISOString(), misconceptions: [] },
  } });
  let weak = podcast.weakSkills(u.id, m.id, NOW);
  check('a missed skill is a weak spot; a mastered one not yet due is not', weak.length === 1 && weak[0].skill.id === 's-energy', weak.map((w) => w.skill.id));
  db.update('material_progress', prog.id, { skills: { ...prog.skills, 's-sun': { status: 'mastered', wrong_n: 0, due: new Date(NOW - 1000).toISOString(), misconceptions: [] } } });
  weak = podcast.weakSkills(u.id, m.id, NOW);
  check('a mastered skill that is due is a weak spot, ranked first', weak.length === 2 && weak[0].skill.id === 's-sun');
  calls = [];
  const w = await podcast.build(u.id, m.id, { kind: 'weak', llm: llm(), now: NOW });
  check('a weak-spots episode is built', !!w.episode && w.episode.kind === 'weak' && w.episode.skills.length === 2, w.error);
  check('the call names the weak skills and the recorded mix-up', /Energy/.test(calls[0].system) && /nucleus makes energy/.test(calls[0].system) && /due for review/.test(calls[0].system));
  check('it is reused until the weak spots change', (await podcast.build(u.id, m.id, { kind: 'weak', llm: llm(), now: NOW })).cached === true);
  db.update('material_progress', prog.id, { skills: { ...db.byId('material_progress', prog.id).skills, 's-energy': { status: 'learning', wrong_n: 3, misconceptions: [] } } });
  const redo = await podcast.build(u.id, m.id, { kind: 'weak', llm: llm(), now: NOW });
  check('a changed learner state makes a fresh episode', !redo.cached && !!redo.episode);

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
  const g = await call('GET', `/api/materials/${m.id}/podcast`);
  check('GET lists both episodes and the weak spots', g.status === 200 && g.body.overview.turns.length > 5 && g.body.weak.status === 'ready' && g.body.weak_spots.length >= 1, g.body);
  check('GET carries no answer keys or ids', !/user_id|"sig"/.test(JSON.stringify(g.body)));
  check("GET for another learner's material is not found", (await call('GET', `/api/materials/${m.id}/podcast`, null, other.id)).status === 404);
  check('POST with a bad kind is refused', (await call('POST', `/api/materials/${m.id}/podcast`, { kind: 'x' })).status === 400);
  check("POST for another learner's material is not found", (await call('POST', `/api/materials/${m.id}/podcast`, { kind: 'overview' }, other.id)).status === 404);
  const m2 = materials.addPaste(u.id, 'No course', TEXT).value;
  check('POST weak with no weak spots is refused', (await call('POST', `/api/materials/${m2.id}/podcast`, { kind: 'weak' })).status === 409);
  srv.close();

  console.log('player');
  const turns = [{ text: 'one two three four five six seven eight nine ten' }, { text: 'a b c d e f g h i j' }, { text: 'k l m n o p q r s t' }, { text: 'u v w x y z' }];
  check('back 15 seconds goes back several parts at speed 1', player.backTarget(turns, 3, 15, 1) === 1 || player.backTarget(turns, 3, 15, 1) === 0);
  check('back never goes below the first part', player.backTarget(turns, 0, 15, 1) === 0 && player.backTarget(turns, 1, 600, 2) === 0);
  check('faster speed goes back further', player.backTarget(turns, 3, 5, 2) <= player.backTarget(turns, 3, 5, 1));
  check('length estimate is at least a minute', player.minutesOf(turns, 1) === 1);

  console.log('deletion and wiring');
  check('an episode exists before delete', !!db.findOne('material_podcasts', (c) => c.user_id === u.id && c.material_id === m.id));
  materials.remove(u.id, m.id);
  check('deleting the material deletes its episodes', !db.findOne('material_podcasts', (c) => c.user_id === u.id && c.material_id === m.id));
  check('podcasts are in the db collections, the data export and the child deletion list', read('config/db.js').includes("'material_podcasts'") && read('routes/profile.js').includes("'material_podcasts'") && read('routes/consent.js').includes("'material_podcasts'"));
  const js = read('public/js/my-material-podcast.js');
  check('the page uses only the browser voice: no audio file, no voice endpoint', js.includes('SpeechSynthesisUtterance') && !/\/api\/tutor|new Audio|createObjectURL|fetch\(/.test(js));
  check('the page has play/pause, back 15s, skip and speed', ['id="pp"', 'back15', 'id="skip"', 'id="rate"'].every((s) => js.includes(s)));
  check('the upload list links to the podcast and says it is only a script', read('public/js/my-material.js').includes('/my-material-podcast?id=') && read('public/js/my-material.js').includes('no audio is made or kept'));
  check('privacy.html covers the podcast script', read('public/privacy.html').includes('podcast script'));

  try { fs.unlinkSync(process.env.DB_FILE); } catch { /* none */ }
  console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
  process.exit(failures ? 1 : 0);
})();
