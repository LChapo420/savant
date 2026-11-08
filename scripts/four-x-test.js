#!/usr/bin/env node
/**
 * The three learning modes (services/learning-modes.js), their wiring (retention-goal, material-study) and the study's transfer record. Throwaway db, no model.
 */
'use strict';
const os = require('os');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

process.env.DB_FILE = path.join(os.tmpdir(), `four-x-test-${process.pid}.json`);
try { fs.unlinkSync(process.env.DB_FILE); } catch { /* none */ }
delete process.env.LEARNING_MODES;
const db = require('../config/db');
const M = require('../services/learning-modes');
const RG = require('../services/retention-goal');
const US = require('../services/upload-study');
const ms = require('../services/material-study');

let fails = 0; let n = 0;
function check(label, ok, detail) { n += 1; if (!ok) { fails += 1; console.log(`FAIL ${label}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ''}`); } }

// ── off by default ──
check('off by default', !M.on());
const off = RG.normalize({ horizon: 'year', mode: 'fastest' }, '2026-11-08');
check('off: a mode is ignored', off.goal && off.goal.mode === undefined);
check('off: effective has no mode', RG.effective({ horizon: 'year', set_on: '2026-11-08', mode: 'fastest' }, '2026-11-08').mode === undefined);
check('off: lessonView needs a mode', M.lessonView({ paragraphs: ['x'], key_points: ['y'] }, [], null) !== undefined);

process.env.LEARNING_MODES = '1';
check('on', M.on());

// ── the modes ──
check('three modes', M.LIST.join() === 'fastest,balanced,highest');
check('balanced default', M.DEFAULT === 'balanced');
check('fastest asks one question a look, highest more', M.planFor('fastest').oneQuestionPerLook && !M.planFor('highest').oneQuestionPerLook);
check('fastest is sparing, highest is not', M.planFor('fastest').reviewTarget < M.planFor('balanced').reviewTarget && M.planFor('balanced').reviewTarget < M.planFor('highest').reviewTarget);
check('a longer goal has a lower floor in fastest', M.floorFor('fastest', 30) > M.floorFor('fastest', 365));
check('highest floor is high at every horizon', M.floorFor('highest', 30) >= 0.9 && M.floorFor('highest', 3650) >= 0.9);
check('recall falls with time', M.recall(10, 1) > M.recall(10, 30));
check('no review when the floor already holds on the last day', M.nextReview(100, 'fastest', 10).done === true);
const nr = M.nextReview(2, 'highest', 300);
check('a due review lies within the goal', nr.dueInDays > 0 && nr.dueInDays < 300, nr);
check('normalize rejects a nonsense mode', RG.normalize({ horizon: 'year', mode: 'turbo' }, '2026-11-08').error);
const ok = RG.normalize({ horizon: 'year', mode: 'fastest' }, '2026-11-08');
check('on: mode stored', ok.goal.mode === 'fastest');
check('on: effective carries the mode', RG.effective(ok.goal, '2026-11-08').mode === 'fastest');

// ── nothing silently dropped ──
const lesson = { paragraphs: ['Long detail about photosynthesis in leaves.'], key_points: ['Plants make sugar from light and carbon dioxide.'], aside: ['Old aside.'] };
const qs = [{ id: 'q1', type: 'multiple_choice', choices: ['sugar', 'oxygen'], answer_index: 0, prompt: 'p', tier: 2 }, { id: 'q2', type: 'multiple_choice', choices: ['stomata', 'x'], answer_index: 0, prompt: 'p2', tier: 3 }];
const text = (q) => q.choices[q.answer_index];
const v = M.lessonView(lesson, qs, 'fastest', text);
check('fastest: key points only on the page', v.paragraphs.length === 0 && v.core_only);
check('fastest: the rest is one tap away', v.aside.includes('Long detail about photosynthesis in leaves.') && v.aside.includes('Old aside.'));
check('fastest: a tested point not in the key points is added to the page', v.key_points.includes('stomata') && v.omission.added === 1, v);
check('fastest: the note says so', /one tap/.test(v.core_note));
check('highest: the full lesson stays', M.lessonView(lesson, qs, 'highest', text) === lesson);
check('no key points: lesson stays', (() => { const l = { paragraphs: ['a'] }; return M.lessonView(l, qs, 'fastest', text) === l; })());
const cov = M.omissionCheck(['plants make sugar from light', 'an unrelated fact about volcanoes'], ['Plants make sugar from light and carbon dioxide.']);
check('omissionCheck names what is missing', cov.total === 2 && cov.covered === 1 && cov.missing[0].includes('volcanoes'), cov);
check('oneLine keeps the first sentence', M.oneLine('The first thing here is long. Second thing.') === 'The first thing here is long.');

// ── wired through the course: one practice question, one question a look, the page ──
const user = db.insert('users', { email: 'four-x@savant-local-sim.org', display_name: 't', onboarded: true, age_check: { age_at_check: 30, under_13: false } });
const material = db.insert('materials', { user_id: user.id, title: 'Fixture', status: 'ready' });
const skills = ['a', 'b', 'c'].map((id) => ({ id, prerequisites: [], title: `Skill ${id}`, lesson: { paragraphs: ['Body text for the skill.'], key_points: [`Key statement about ${id}.`] }, questions: [1, 2, 3, 4, 5, 6].map((k) => ({ id: `${id}${k}`, type: 'multiple_choice', choices: ['right', 'wrong a', 'wrong b', 'wrong c'], answer_index: 0, prompt: `q ${k}`, tier: k > 4 ? 3 : 2, explanation: 'One line. Second line.' })) }));
db.insert('material_courses', { user_id: user.id, material_id: material.id, title: 'Fixture', status: 'ready', units: [{ id: 'u1', title: 'U', skills: skills.map((s) => s.id) }], skills });
const rsave = RG.save(user.id, 'material', material.id, { horizon: 'year', mode: 'fastest' });
check('a mode saves through the service', rsave.goal && rsave.goal.mode === 'fastest', rsave.error);
check('the choice appears in the list', (() => { const lr = RG.listFor(user.id); return lr.modes.length === 3 && lr.materials[0].mode === 'fastest'; })());
const placed = ms.internals.row(user.id, material.id); placed.placed = true; ms.internals.save(placed);
const first = ms.lesson(user.id, material.id, 'a');
check('fastest: lesson served, one practice question', first.skill && first.skill.practice.length === 1, first.error || first.skill);
check('fastest: the page has the key points and the note', first.skill.lesson.core_only && first.skill.lesson.key_points.length >= 1);
// a Balanced goal; then Highest keeps the full page
RG.save(user.id, 'material', material.id, { horizon: 'year', mode: 'highest' });
const high = ms.lesson(user.id, material.id, 'a');
check('highest: full page', high.skill.lesson.paragraphs.length === 1 && !high.skill.lesson.core_only);

// ── the study records transfer ──
const row1 = { ms_savant: 60000, ms_normal: 240000, words_savant: 500, words_normal: 500, score_savant: 0.8, score_normal: 0.7, transfer_savant: 0.6, transfer_normal: 0.5, gap: 0, n_test: 8 };
const an = US.analyse([row1, { ...row1 }], { minN: 1 });
check('analyse reports transfer', an.transfer && an.transfer.n === 2 && Math.abs(an.transfer.diff_mean - 10) < 1e-9, an.transfer);

// ── the simulator runs ──
const out = path.join(os.tmpdir(), `four-x-sim-${process.pid}.json`);
execFileSync(process.execPath, [path.join(__dirname, 'four-x-sim.js'), '--seed=1', '--docs=design', '--n-extreme=2', '--n-ordinary=1', '--n-sparse=1', '--n-child=1', '--reps=1', `--out=${out}`], { stdio: 'pipe' });
const sim = JSON.parse(fs.readFileSync(out, 'utf8'));
const cell = sim.learners[0].goals['1 month'];
check('sim marks itself simulated', sim.simulated === true);
check('sim has all arms', ['lazy', 'typical', 'diligent', 'fastest', 'balanced', 'highest'].every((a) => cell[a] && cell[a].min > 0 && cell[a].recall >= 0 && cell[a].transfer >= 0));

try { fs.unlinkSync(process.env.DB_FILE); fs.unlinkSync(out); } catch { /* best effort */ }
if (fails) { console.log(`${n} checks, ${fails} failed`); process.exit(1); }
console.log(`four-x: ${n} checks passed`);
