#!/usr/bin/env node
/**
 * A fresh account that picks Spanish, placed at grade 9, through the REAL routes (routes/catalog.js enrollments, routes/placement.js,
 * routes/spanish/path.js, routes/spanish/catch-up.js), on a throwaway data file (never the live one). No network: the unit writer is
 * given fake models, so this proves the wiring and the gates, not the models' Spanish.
 *
 *   - the unit bank covers all 57 grades, every unit has gated questions and the units tile each grade's levels;
 *   - enrolling in grade 9 starts the adaptive in-grade (unit) placement, not the old difficulty ladder, and a learner who has
 *     finished the first four units is placed at about the fifth, within a bounded number of questions;
 *   - before grade 9's unit is written and checked, the Duolingo-style player does not serve it (the level goes to the ordinary
 *     session); once the unit is written and registered, the same route returns a playable level built from it;
 *   - the catch-up for grades below 9 has questions for every unit of every grade (from the bank), including grades 5-8.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'es-depth-route-'));
process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(TMP, 'db.json');
process.env.HOLDOUT_DIR = TMP;
process.env.SPANISH_UNIT_DIR = path.join(TMP, 'units');
process.env.SPANISH_WRITE_AHEAD = 'off'; // the route must not reach for a model; the test writes the unit itself

const express = require('express');
const db = require('../config/db');
const curriculum = require('../config/curriculum');
const unitPlacement = require('../services/unit-placement');
const learnerPath = require('../services/learner-path');
const writer = require('../services/spanish/unit-writer');
const catchUp = require('../services/spanish/catch-up');

const app = express();
app.use(express.json());
app.use((req, res, next) => { req.user = db.byId('users', Number(req.headers['x-user'])) || null; next(); });
app.use('/api', require('../routes/catalog').router);
app.use('/api/placement', require('../routes/placement'));
app.use('/api/es/path', require('../routes/spanish/path'));
app.use('/api/es/catch-up', require('../routes/spanish/catch-up'));

let server;
const call = (method, url, uid, body) => new Promise((ok, fail) => {
  const req = http.request({ host: '127.0.0.1', port: server.address().port, path: url, method, headers: { 'x-user': String(uid || ''), 'content-type': 'application/json' } }, (res) => {
    let t = ''; res.on('data', (d) => { t += d; });
    res.on('end', () => ok({ status: res.statusCode, json: (() => { try { return JSON.parse(t); } catch { return null; } })() }));
  });
  req.on('error', fail);
  if (body) req.write(JSON.stringify(body));
  req.end();
});
let failed = 0;
const check = (name, ok, detail) => { if (ok) console.log(`ok   ${name}`); else { failed++; console.log(`FAIL ${name}${detail === undefined ? '' : ` -- ${JSON.stringify(detail).slice(0, 300)}`}`); } };

const GRADES = curriculum.getTrack('spanish').grades.map((g) => g.id);
// Grade 9 when its bank is complete, else the first complete grade above it (a grade counts only when every unit has gated questions).
const G9 = [8, ...Array.from({ length: 48 }, (_, i) => i + 9)].map((i) => GRADES[i]).find((id) => unitPlacement.available('spanish', id));
const rightAnswer = (itemId) => { const it = db.byId('items', itemId); return unitPlacement.unitsFor('spanish', G9)[it.unit - 1].questions[it.slot].answer; };
const wrongAnswer = (itemId) => db.byId('items', itemId).choices.find((c) => c !== rightAnswer(itemId));

async function sit(uid, enrollmentId, known) {
  const started = await call('POST', '/api/placement/start', uid, { enrollment_id: enrollmentId, mode: 'balanced' });
  check('placement starts as the adaptive unit walk', started.status === 201 && started.json.adaptive === true && started.json.mode === 'balanced', started.json);
  let item = started.json.items[0]; let asked = 0;
  for (let i = 0; i < 100 && item; i++) {
    const unit = db.byId('items', item.id).unit;
    const res = await call('POST', '/api/placement/answer', uid, { session_id: started.json.session_id, item_id: item.id, answer: unit <= known ? rightAnswer(item.id) : wrongAnswer(item.id), ms: 1000 });
    asked++;
    item = res.json && res.json.next_item ? res.json.next_item : null;
  }
  return { fin: await call('POST', '/api/placement/finish', uid, { session_id: started.json.session_id }), asked };
}

/** A well-formed fake draft for whichever unit is asked for, with an honest fake solver, so the real checks run offline. */
function fakeDraft(spec) {
  const topic = spec.topics[0].id;
  const verbs = ['hablé', 'comí', 'viví', 'trabajé', 'bebí', 'escribí', 'compré', 'aprendí', 'abrí', 'miré', 'canté', 'corrí'];
  const mc = (right, wrong) => ({ choices: [right, ...wrong], answer: 0 });
  return {
    phrases: verbs.map((v, i) => ({ es: `Ayer ${v} mucho.`, en: [`Yesterday I did ${i + 1} things.`], tier: 1 + (i % 3), skill: spec.skills[0], topic })),
    scene: { title: 'Ayer', art: 'casa', lines: Array.from({ length: 6 }, (_, i) => ({ who: ['mara', 'tomas'][i % 2], es: `Hola número ${i + 1}.`, en: `Hello ${i + 1}.` })), questions: [{ after: 3, question: 'Who spoke first?', ...mc('Mara', ['Tomás', 'Rosa']) }] },
    convo: { partner: 'tomas', setting: 'A cafe.', learnerCard: 'Talk.', learnerCardEs: 'Habla.', partnerCard: 'Listen.', goals: ['a', 'b', 'c'].map((id) => ({ id, text: `Goal ${id}` })), targets: ['Ayer.'], opening: 'Hola.', script: ['a', 'b', 'c'].map((goal) => ({ goal, expect: ['ayer'], reply: 'Bien.', hint: 'Say it.' })), nudges: { a: 'a', b: 'b', c: 'c' }, closing: 'Adiós.' },
    fills: [0, 1, 2, 3].map((i) => ({ before: 'Ayer yo', after: 'mucho.', ...mc(verbs[i], [`${verbs[i]}n`, `${verbs[i]}s`]), en: `Yesterday ${i}.` })),
    chats: [0, 1, 2].map((i) => ({ who: 'mara', es: `¿Qué hiciste el día ${i + 1}?`, ...mc('Trabajé mucho.', ['Trabajo mucho.', 'Trabajaré mucho.']) })),
    reads: [{ passage: 'Ayer Tomás comió pan.', question: 'What did Tomás eat?', ...mc('Bread', ['Rice', 'Fish']) }],
  };
}
// An honest fake solver: it knows each prompt's true answer (taken from the draft before the checks run).
const honestFor = (d) => { const truth = new Map(writer.keyedItems(JSON.parse(JSON.stringify(d))).map((q) => [q.prompt, q.answer])); return async (batch) => batch.map((q) => { const i = q.choices.indexOf(truth.get(q.prompt)); return i < 0 ? null : i; }); };

(async () => {
  server = http.createServer(app).listen(0);
  // 1. the bank
  const bank = unitPlacement.bankFor('spanish');
  const grades = curriculum.getTrack('spanish').grades.map((g) => g.id);
  const done = grades.filter((g) => unitPlacement.available('spanish', g));
  check('the bank has real units for all 57 grades, and most grades are complete (a grade with a unit under 3 gated questions stays on the old ladder)', grades.length === 57 && grades.every((g) => bank.grades[g] && bank.grades[g].units.length >= 5) && done.length >= 30 && !!G9, done.length);
  check('every unit has at least 3 gated questions and the units tile the grade\'s levels', done.every((g) => {
    const us = bank.grades[g].units; const pl = curriculum.getGrade('spanish', g).pathLength;
    return us.length >= 5 && us.every((u, i) => u.questions.length >= 3 && u.questions.every((q) => q.gate === 'agreed') && (i === 0 ? u.start === 1 : u.start === us[i - 1].end + 1)) && us[us.length - 1].end === pl;
  }));
  const wasOne = us9().length;
  function us9() { return bank.grades[G9].units; }
  check('grade 9 now has real units (was 1 unit for the whole grade)', wasOne >= 8, wasOne);

  // 2. a fresh account, grade 9, placed inside it
  const u1 = db.insert('users', { email: 'es-route-a@example.test', display_name: 'A', xp: 0, streak: 0 });
  const enrolled = await call('POST', '/api/enrollments', u1.id, { selections: [{ track_id: 'spanish', grade_id: G9 }] });
  check('a fresh account enrolls in Spanish grade 9', enrolled.status === 201 && enrolled.json.created.length === 1, enrolled.json);
  const enrollmentId = enrolled.json.created[0].id;
  const known = 4;
  const out = await sit(u1.id, enrollmentId, known);
  const result = (out.fin.json || {}).result || {};
  check('the placement finishes', out.fin.status === 200 && out.fin.json.result, out.fin.json);
  check(`it asks a bounded number of questions (<= ${unitPlacement.MODES.balanced.max}, ${unitPlacement.MODES.balanced.minutes} min clock)`, out.asked <= unitPlacement.MODES.balanced.max && out.asked >= unitPlacement.MODES.balanced.min, out.asked);
  check(`it places close to the learner's frontier (unit ${known + 1}, within 1)`, Math.abs(result.unit - (known + 1)) <= 1, result);
  const enr = db.byId('enrollments', enrollmentId);
  check('the enrollment starts inside the grade, past the first unit, with a unit plan', enr.current_level > 1 && !!learnerPath.planFor(enr), enr.current_level);

  // 3. the player: not served unwritten, served once written and checked
  const level = enr.current_level;
  const row = curriculum.getGrade('spanish', G9).levels.find((l) => l.level === level);
  let r = await call('GET', `/api/es/path/level?enrollment=${enrollmentId}&level=${level}`, u1.id);
  check('before the unit is written, nothing unchecked is served: the level goes to the ordinary session', r.status === 200 && r.json && r.json.fallback && !r.json.run, r.json);
  const spec = writer.specOf(G9, row.unit);
  const unit = await writer.writeUnit(G9, row.unit, { writer: async () => fakeDraft(spec), judge: honestFor(fakeDraft(spec)), review: async () => [] });
  check('the unit is written with the real checks (fake models)', !!unit && unit.phrases.length === 12);
  require('../services/spanish/path').registerUnit(unit);
  r = await call('GET', `/api/es/path/level?enrollment=${enrollmentId}&level=${level}`, u1.id);
  check('once written and checked, the same route serves a playable level of that unit', r.status === 200 && r.json && r.json.run && r.json.level && r.json.row.unit === row.unit, r.json && Object.keys(r.json));
  // the next level of the unit, a lesson, plays too
  const lesson = curriculum.getGrade('spanish', G9).levels.find((l) => l.unit === row.unit && l.type === 'Lesson');
  const rl = await call('GET', `/api/es/path/level?enrollment=${enrollmentId}&level=${lesson.level}`, u1.id);
  check('a lesson of the written unit is served with items', rl.status === 200 && rl.json && rl.json.run && rl.json.level, rl.json && Object.keys(rl.json));

  // 4. the catch-up has questions for every unit of grades 5-8
  const skills = [5, 6, 7, 8].map((n) => grades[n - 1]).filter((g) => done.includes(g)).flatMap((g) => catchUp.skillsOfGrade(g));
  const bare = skills.filter((s) => catchUp.questionsFor(s).length < 3);
  check(`every unit of grades 5-8 (${skills.length} skills) has at least 3 catch-up questions`, skills.length >= 20 && bare.length === 0, bare.slice(0, 3).map((s) => s.key));
  const all = done.filter((g) => g !== grades[56]).flatMap((g) => catchUp.skillsOfGrade(g));
  check(`and so does every unit of every grade with a complete bank (${all.length} skills)`, all.every((s) => catchUp.questionsFor(s).length >= 3));
  db.insert('subject_placements', { user_id: u1.id, track_id: 'spanish', finished_at: new Date().toISOString(), recommended_grade_id: G9, answers: [], created_at: new Date().toISOString() });
  const started = await call('POST', '/api/es/catch-up/start', u1.id);
  check('the catch-up check starts over HTTP for a learner placed at grade 9, with a bank question', started.status === 200 && started.json && started.json.phase === 'check' && started.json.question && started.json.question.prompt, started.json && Object.keys(started.json));

  server.close();
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log(e.stack); process.exit(1); });
