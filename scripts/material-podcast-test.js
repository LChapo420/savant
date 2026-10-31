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

  console.log('check-in placement');
  const talk = (n, words = 100) => Array.from({ length: n }, () => ({ host: 'A', text: Array(words).fill('word').join(' ') }));
  const slots = podcast.checkinSlots(talk(40, 100));
  check('a check-in about every three minutes of speech', slots.length >= 4 && slots.length <= podcast.MAX_CHECKINS, slots.length);
  check('the check-ins are at least three minutes apart', slots.every((s, i) => i === 0 || s.words >= podcast.CHECKIN_WORDS), slots.map((s) => s.words));
  check('no check-in on the last turns of the script', slots.every((s) => s.after < 38), slots.map((s) => s.after));
  check('a short script has no check-ins', podcast.checkinSlots(talk(10, 20)).length === 0);
  const pool = [
    { skill: 's-energy', skill_title: 'Energy', qid: 'cq0', prompt: 'Where does a cell get usable energy?', choices: ['Mitochondria', 'Nucleus', 'Ribosomes'], answer_index: 0, source: 'course' },
    { skill: 's-sun', skill_title: 'Sunlight', qid: 'cq1', prompt: 'What captures sunlight?', choices: ['Chloroplasts', 'Mitochondria', 'Vacuoles'], answer_index: 0, source: 'course' },
  ];
  const placed = podcast.placeCheckins(talk(40, 100), pool, slots, slots.map((s, i) => (i % 2 ? 's-sun' : 's-energy')));
  check('every slot gets a question', placed.length === slots.length, [placed.length, slots.length]);
  check('each question names its skill and keeps its key here', placed.every((c) => c.skill && Number.isInteger(c.answer_index) && c.choices.length >= 3 && c.choices.length <= 4));
  check("a question on the course item keeps that item's id", placed[0].qid === 'cq0' && placed[1].qid === 'cq1', placed.map((c) => c.qid));
  check('the question goes on the skill the slot just covered', placed[0].skill === 's-energy' && placed[1].skill === 's-sun', placed.map((c) => c.skill));
  check('no two questions share an id', new Set(placed.map((c) => c.id)).size === placed.length);
  check('a question with no right choice, or two equal choices, is thrown out', podcast.cleanChecks([
    { skill_id: 's-energy', prompt: 'x', choices: ['a', 'b'], answer_index: 0 },
    { skill_id: 's-energy', prompt: 'y', choices: ['a', 'b', 'c'], answer_index: 7 },
    { skill_id: 's-energy', prompt: 'z', choices: ['a', 'a', 'c'], answer_index: 0 },
  ], [{ id: 's-energy', title: 'Energy' }]).length === 0);

  // The course's own quiz items come first, so they are what the pack shows for the same skills.
  const courseRow = db.findOne('material_courses', (c) => c.user_id === u.id && c.material_id === m.id);
  db.update('material_courses', courseRow.id, { skills: courseRow.skills.map((s, i) => ({ ...s, questions: [{ id: `cq${i}`, type: 'multiple_choice', tier: 2, prompt: `What is ${s.title} about?`, choices: ['The energy a cell uses', 'The cell wall', 'The colour green'], answer_index: 0 }] })) });
  const longLlm = () => async (args) => {
    calls.push(args);
    const pid = /\[(p\d+)\]/.exec(args.user)[1];
    const turns = [{ host: 'A', text: 'Welcome back to the show.' }];
    for (let i = 0; i < 30; i++) turns.push({ host: i % 2 ? 'A' : 'B', text: `Mitochondria release usable energy from the food a cell takes in. ${'Cells use that energy for every job they do. '.repeat(6)}`, passage_id: pid, quote: S1 });
    turns.push({ host: 'B', text: 'So that is the recap.' });
    return { model: 'mock', data: { title: 'Cells in ten minutes', turns, checkins: [{ skill_id: 's-energy', prompt: 'From the script: where does the energy come from?', choices: ['Food', 'Sunlight', 'Water'], answer_index: 0 }] } };
  };
  const long = await podcast.build(u.id, m.id, { llm: longLlm(), force: true });
  check('an episode with check-ins is built', !!long.episode && long.episode.checkins.length >= 2, long.error);
  const cs = (long.episode && long.episode.checkins) || [];
  check('each check-in is tied to a skill of the material', cs.length > 0 && cs.every((c) => ['s-energy', 's-sun'].includes(c.skill)), cs.map((c) => c.skill));
  check('each check-in has three or four choices and one key', cs.every((c) => c.choices.length >= 3 && c.choices.length <= 4 && c.answer_index >= 0 && c.answer_index < c.choices.length));
  check("the course's own quiz items are used first", cs.some((c) => c.source === 'course'), cs.map((c) => c.source));
  check('the check-ins sit inside the script, never at its end', cs.every((c) => c.after > 0 && c.after < long.episode.turns.length - 2), cs.map((c) => c.after));
  check('the page gets the questions and choices but never the key', (() => { const v = podcast.view(long.episode); return !!v && v.checkins.length >= 2 && v.checkins.every((c) => c.prompt && c.choices.length >= 3) && !/answer_index|qid/.test(JSON.stringify(v)); })());

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

  console.log('answering a check-in');
  const progNow = () => (db.findOne('material_progress', (p) => p.user_id === u.id && p.material_id === m.id) || { skills: {} });
  const shut = cs.find((c) => (progNow().skills[c.skill] || {}).status === 'mastered') || cs[0];
  const snap = { ...(progNow().skills[shut.skill] || {}) };
  const rightOne = await call('POST', `/api/materials/${m.id}/podcast/checkin`, { question: shut.id, answer: shut.answer_index });
  check('an answer is taken and marked right', rightOne.status === 200 && rightOne.body.correct === true, rightOne.body);
  check('the reply says which choice was right and which skill it was on', Number.isInteger(rightOne.body.correct_index) && rightOne.body.skill === shut.skill, rightOne.body);
  const after = progNow().skills[shut.skill] || {};
  check('a right answer is counted on that skill', after.right === (snap.right || 0) + 1, after);
  check('a right answer never masters a skill', after.status === snap.status, after.status);
  if (snap.status === 'mastered') check('a right answer on a mastered skill restarts its review clock', Date.parse(after.last_tested) > 0 && Date.parse(after.due) > Date.now(), { after, snap });
  const miss = (shut.answer_index + 1) % shut.choices.length;
  const wrongOne = await call('POST', `/api/materials/${m.id}/podcast/checkin`, { question: shut.id, answer: miss });
  check('a wrong answer is marked wrong', wrongOne.status === 200 && wrongOne.body.correct === false, wrongOne.body);
  const missed = progNow().skills[shut.skill] || {};
  check('a miss is counted against the skill', missed.wrong_n >= (snap.wrong_n || 0) + 1, missed);
  check('a miss on a mastered skill brings its review to now', snap.status !== 'mastered' || (!!missed.due && Date.parse(missed.due) <= Date.now() + 1000), missed.due);
  check("the answer went into the learner's own record, not a new one", db.find('material_progress', (p) => p.user_id === u.id && p.material_id === m.id).length === 1);
  check('an unknown question is not found', (await call('POST', `/api/materials/${m.id}/podcast/checkin`, { question: 'q99', answer: 0 })).status === 404);
  check("another learner cannot answer on this material", (await call('POST', `/api/materials/${m.id}/podcast/checkin`, { question: shut.id, answer: 0 }, other.id)).status === 404);

  console.log('check-ins from the study pack');
  // The pack keeps its own quiz items, keyed by passage: the passage a skill cites is what ties one to the skill.
  db.insert('material_packs', { user_id: u.id, material_id: m.id, title: 'Cell biology', version: 1, status: 'ready', summary: [], cards: [], test: [], quiz: [
    { id: 'z1', type: 'multiple_choice', prompt: 'From the pack: what releases usable energy?', choices: ['Mitochondria', 'The nucleus', 'The cell wall'], answer_index: 0, passage_id: 'p1' },
    { id: 'z2', type: 'multiple_choice', prompt: 'On a passage no skill cites', choices: ['a', 'b', 'c'], answer_index: 0, passage_id: 'pX' },
    { id: 'z3', type: 'multiple_choice', prompt: 'Two equal choices', choices: ['a', 'a', 'b'], answer_index: 0, passage_id: 'p2' },
    { id: 'z4', type: 'written', prompt: 'Explain it.', answer: 'x', key_points: ['y'], passage_id: 'p1' },
  ] });
  const packPool = podcast.packChecks(u.id, m.id, db.findOne('material_courses', (c) => c.user_id === u.id && c.material_id === m.id), podcast.MAX_CHECKINS);
  check('a pack item on a passage a skill cites is offered for that skill', packPool.length === 1 && packPool[0].skill === 's-energy' && packPool[0].pack_qid === 'z1', packPool);
  check('a written pack item is not offered', !packPool.some((c) => c.pack_qid === 'z4'));
  check('an item with two equal choices is not offered', !packPool.some((c) => c.pack_qid === 'z3'));
  const packed = await podcast.build(u.id, m.id, { llm: longLlm(), force: true });
  const pcs = (packed.episode && packed.episode.checkins) || [];
  const onEnergy = pcs.find((c) => c.skill === 's-energy');
  check("the pack's own item on that skill is used first", !!onEnergy && onEnergy.source === 'pack' && onEnergy.pack_qid === 'z1', onEnergy);
  check('the other check-ins still have a question on a skill', pcs.length >= 2 && pcs.every((c) => c.skill && Array.isArray(c.choices)), pcs.map((c) => [c.skill, c.source]));
  check('the key of a pack item stays on the server', !/answer_index|pack_qid/.test(JSON.stringify(podcast.view(packed.episode))));
  const packAns = await call('POST', `/api/materials/${m.id}/podcast/checkin`, { question: onEnergy.id, answer: onEnergy.answer_index });
  check('a pack question is marked from the key the episode kept', packAns.status === 200 && packAns.body.correct === true, packAns.body);
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
  check('the player stops at a check-in, shows the choices and posts the answer', js.includes('/checkin') && js.includes('data-choice') && js.includes('askCheck'));
  check('the question is read with the same browser voice', js.includes('function speakLine') && !/new Audio|createObjectURL/.test(js));
  check('the choices wrap on a narrow screen', js.includes('row-wrap') && js.includes('max-width:100%'));
  check('the script shows where the check-ins are', js.includes('Check-in'));
  check('the route and the grading are wired', read('routes/materials.js').includes("'/:id/podcast/checkin'") && read('services/material-study.js').includes('function checkin('));
  check('the upload list links to the podcast and says it is only a script', read('public/js/my-material.js').includes('/my-material-podcast?id=') && read('public/js/my-material.js').includes('no audio is made or kept'));
  check('privacy.html covers the podcast script', read('public/privacy.html').includes('podcast script'));

  try { fs.unlinkSync(process.env.DB_FILE); } catch { /* none */ }
  console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
  process.exit(failures ? 1 : 0);
})();
