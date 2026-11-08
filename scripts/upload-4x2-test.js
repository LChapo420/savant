/**
 * Levers 2 to 4 of docs/UPLOAD-4X.md and the question-fit fix: test-first skipping with proof (services/material-testfirst.js), custom material from the scorecard
 * (services/material-custom.js), the own-control study (services/upload-study.js), topic fit (services/topic-fit.js). Throwaway db, no model.
 *   node scripts/upload-4x2-test.js
 */
const os = require('os');
const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(os.tmpdir(), `upload-4x2-test-${process.pid}.json`);
try { fs.unlinkSync(process.env.DB_FILE); } catch { /* none */ }
for (const k of ['UPLOAD_TESTFIRST', 'UPLOAD_CUSTOM', 'UPLOAD_STUDY', 'SPEED_TOPIC_FIT']) delete process.env[k];

const db = require('../config/db');
const TF = require('../services/material-testfirst');
const CU = require('../services/material-custom');
const US = require('../services/upload-study');
const FIT = require('../services/topic-fit');
const ms = require('../services/material-study');
const { INDEX } = require('../services/scorecard/ceilings');

let failures = 0;
function check(label, ok, detail) {
  if (ok) { console.log(`  ok   ${label}`); return; }
  failures++;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 300)}`}`);
}
const DAY = 86400000;

// ── test-first proof ──
console.log('test-first proof');
check('off by default', TF.enabled() === false);
check('two right, one sure: skip', TF.proof([{ correct: true, confidence: 'sure' }, { correct: true, confidence: 'think' }]).skip);
check('one right is not proof', !TF.proof([{ correct: true, confidence: 'sure' }]).skip);
check('two right, none sure: no skip', !TF.proof([{ correct: true, confidence: 'think' }, { correct: true, confidence: 'think' }]).skip);
check('a miss blocks the skip', !TF.proof([{ correct: true, confidence: 'sure' }, { correct: true, confidence: 'sure' }, { correct: false, confidence: 'guess' }]).skip);
const mis = TF.proof([{ correct: true, confidence: 'sure' }, { correct: false, confidence: 'sure' }]);
check('a sure wrong answer is a misconception', mis.misconception && !mis.skip);
check('recheck is days away', Date.parse(TF.recheckAt(0)) === TF.PARAMS.recheckDays * DAY);
check('confidence is cleaned', TF.cleanConfidence('sure') === 'sure' && TF.cleanConfidence('x') === null);

// ── custom material ──
console.log('custom material');
check('off by default: forUser is null', CU.forUser(1) === null);
check('only the four classes that beat never-lean', [...CU.ALLOWED].sort().join() === 'contrast,habit,memory,performance');
check('every rule is a measure of an allowed class', CU.RULES.every(([id]) => CU.ALLOWED.has(INDEX[id])), CU.RULES.filter(([id]) => !CU.ALLOWED.has(INDEX[id])));
const p0 = CU.plan({});
check('nothing leans on an empty card', p0.used === 0 && p0.knobs.page === 'default' && p0.knobs.reviewScale === 1 && p0.knobs.proofNeed === 2);
const p1 = CU.plan({ decay_rate: 80, guessing_propensity: 90, prior_knowledge: 85, brevity_preference: 90, jargon_absorption: 80 });
check('fast forgetter: reviews sooner', p1.knobs.reviewScale === 0.8, p1.knobs);
check('a guesser needs three right answers', p1.knobs.proofNeed === 3);
check('strong prior knowledge: test every part', p1.knobs.testFirst === 'all');
check('wants brevity and reads jargon: lean page', p1.knobs.page === 'lean');
const p2 = CU.plan({ decay_rate: 20, mastery_velocity: 20, interleaving_tolerance: 20 });
check('slow forgetter: longer gaps; slow learner: more practice; low interleaving: blocked', p2.knobs.reviewScale === 1.2 && p2.knobs.practiceDelta === 1 && p2.knobs.interleave === false, p2.knobs);
check('inside the edges nothing leans', CU.plan({ decay_rate: 50, prior_knowledge: 55, guessing_propensity: 45 }).used === 0);
check('low confidence is ignored', CU.plan({ decay_rate: { measured: 90, confidence: 0.2 } }).used === 0);
check('a measure of an excluded class never steers', CU.plan({ humor_receptivity: 95, chunk_granularity: 95, strategy_awareness: 95 }).used === 0);

// ── topic fit ──
console.log('topic fit');
check('off by default', FIT.enabled() === false);
const topic = FIT.topicOf('Capitalizing Titles', 'Capitalizing the important words in titles of books, songs, and other works.');
const bad = { prompt: 'What mark finishes this sentence? "Did Ana file the report"', choices: ['.', '?', '!'], answer: '?' };
const good = { prompt: 'Which title of a book is capitalized correctly?', choices: ['The Old Man and the Sea', 'the old man and the sea'], answer: 'a' };
check('a question that uses the lesson words scores higher', FIT.fit(good, topic) > FIT.fit(bad, topic) && FIT.fit(good, topic) > 0.2, [FIT.fit(good, topic), FIT.fit(bad, topic)]);
const pool = [bad, good, { ...bad, prompt: 'Another mark?' }];
const pick = FIT.pick((i) => pool[i % 3], topic, () => false, 6);
check('pick takes the best fit and says its fit', pick.item === good && pick.fit > 0.2 && pick.tried === 3);
check('pick skips taken questions', FIT.pick((i) => pool[i % 3], topic, (it) => it === good, 6).item !== good);
check('nothing overlapping keeps a question and reports fit 0', FIT.pick(() => bad, FIT.topicOf('Quadratic equations', 'Solving x squared'), () => false, 3).fit === 0);

// ── matched halves ──
console.log('matched halves');
const parts = Array.from({ length: 14 }, (_, i) => ({ id: `s${i}`, p: (i % 5) / 5, words: 300 + 17 * i }));
const h1 = US.splitHalves(parts, 'a');
check('halves are equal in size, nothing lost', h1.savant.length === 7 && h1.normal.length === 7 && h1.left.length === 0 && new Set([...h1.savant, ...h1.normal]).size === 14);
check('halves are matched in size (gap under 5%)', h1.gap < 0.05, h1.gap);
check('deterministic for a seed, different across seeds', JSON.stringify(US.splitHalves(parts, 'a')) === JSON.stringify(h1) && ['b', 'c', 'd', 'e', 'f', 'g'].some((s) => JSON.stringify(US.splitHalves(parts, s)) !== JSON.stringify(h1)));
check('odd count leaves one part out', US.splitHalves(parts.slice(0, 7), 'a').left.length === 1);
let savantFirst = 0; for (let k = 0; k < 400; k++) { const r = US.splitHalves(parts.slice(0, 2), `z${k}`); if (r.savant[0] === 's0') savantFirst++; }
check('the coin is fair (400 seeds)', savantFirst > 160 && savantFirst < 240, savantFirst);

// ── the study, end to end on a fixture course ──
console.log('own-control study');
const q = (id, tier) => ({ id, type: 'multiple_choice', prompt: `Question ${id}?`, choices: ['a', 'b', 'c'], answer_index: 1, tier, explanation: 'x', misconceptions: ['', '', ''] });
const skills = Array.from({ length: 8 }, (_, i) => ({
  id: `k${i}`, title: `Skill ${i}`, summary: 's', unit_id: 'u1', level: i + 1, prerequisites: [], passage_ids: [`p${i}`], lesson: { paragraphs: ['L'], key_points: ['K'] },
  questions: Array.from({ length: 6 }, (_, j) => q(`k${i}q${j}`, 1 + (j % 3))),
}));
const course = { user_id: 1, material_id: 9, title: 'Fixture', status: 'ready', units: [{ id: 'u1', title: 'U', skills: skills.map((s) => s.id) }], skills, passages: skills.map((s, i) => ({ id: `p${i}`, text: `Original text ${i} `.repeat(40 + i) })) };
db.insert('users', { email: 'own-study@savant-local-sim.org', display_name: 't', onboarded: true, age_check: { age_at_check: 30, under_13: false } });
const user = db.all ? db.all('users')[0] : db.find('users', () => true)[0];
db.insert('material_courses', { ...course, user_id: user.id });
const progress = () => ms.internals.row(user.id, 9);
const placed = progress(); placed.placed = true; ms.internals.save(placed);

check('off: no offer, start refused', US.offer(user).available === false && US.start(user.id, 9, { agree: true }, {}).code === 'off');
process.env.UPLOAD_STUDY = '1';
check('on: offered to an eligible account', US.offer(user, { allowed: () => true }).available && /at most 24 questions/.test(US.offer(user, { allowed: () => true }).text));
check('not offered to an account that may not take extra measurement', US.offer(user, { allowed: () => false }).available === false);
const cx = (over = {}) => ({ course: db.find('material_courses', (c) => c.material_id === 9)[0], progress: progress(), user, allowed: () => true, ...over });
check('no clear yes, no study', US.start(user.id, 9, { agree: 'yes', horizonDays: 30 }, cx()).code === 'no_consent');
check('ineligible account refused', US.start(user.id, 9, { agree: true, horizonDays: 30 }, cx({ allowed: () => false })).code === 'not_eligible');
const started = US.start(user.id, 9, { agree: true, horizonDays: 30 }, cx());
check('study starts: halves of 4 and 4, 4 test parts a half', started.ok && started.savant === 4 && started.normal === 4 && started.test_parts === 4, started);
check('no second study for the same material', US.start(user.id, 9, { agree: true, horizonDays: 30 }, cx()).code === 'already');
const row = US.rowOf(user.id, 9);
check('consent is recorded with a version and the horizon', row.consent.version === US.VERSION && row.consent.horizon_days === 30 && !!row.consent.at);
const allReserved = Object.values(row.reserved).flat();
check('test questions are held back from study (two a part, same for both halves)', allReserved.length === 16 && row.test_parts.savant.every((id) => row.reserved[id].length === 2) && row.test_parts.normal.every((id) => row.reserved[id].length === 2));
const viewed = ms.internals.loadCourse(user.id, 9);
check('the study path never sees a held-back question', viewed.skills.every((s) => s.questions.every((x) => !allReserved.includes(x.id))) && viewed.skills.some((s) => s.all_questions));

// the normal half: original text and done
const normalId = row.halves.normal[0]; const savantId = row.halves.savant[0];
check('a Savant-half part is not served as a normal part', ms.ownPart(user.id, 9, savantId).code === 'not_normal');
check('next step routes a normal-half part to its own screen', (() => { let r = progress(); for (const s of skills) { if (US.armOf(row, s.id) === 'savant') { const st = ms.internals.skillState(r, s.id); st.status = 'mastered'; } } ms.internals.save(r); return ms.nextStep(ms.internals.loadCourse(user.id, 9), progress(), Date.now()).kind === 'normal'; })());
const t0 = 1_000_000_000_000;
US.touch(user.id, 9, normalId, 'open', t0);
US.touch(user.id, 9, normalId, 'done', t0 + 5 * 60000);
US.touch(user.id, 9, savantId, 'open', t0);
US.touch(user.id, 9, savantId, 'answer', t0 + 2 * 60000);
US.touch(user.id, 9, savantId, 'open', t0 + 2 * 60000 + 3 * 3600000); // a long break: capped
const tm = US.timeOf(US.rowOf(user.id, 9));
check('time = gaps between actions, a long idle gap capped, same rule for both halves', tm.normal === 5 * 60000 && tm.savant === 2 * 60000 + US.IDLE_CAP_MS, tm);
const part = ms.ownPart(user.id, 9, normalId);
check('a normal part shows the original text', /Original text/.test(part.text));
for (const id of row.halves.normal) ms.ownDone(user.id, 9, id, t0 + DAY);
check('done marks the part passed for the path, with no review due', progress().skills[normalId].status === 'mastered' && progress().skills[normalId].due === null && progress().skills[normalId].via === 'own-control');
check('still studying until the Savant half is mastered', ms.ownStatus(user.id, 9, t0 + DAY).phase === 'studying' || ms.ownStatus(user.id, 9, t0 + DAY).phase === 'waiting');
US.noteStudied(user.id, 9, skills.map((s) => s.id), t0 + DAY);
const waiting = US.status(user.id, 9, t0 + 2 * DAY);
check('the test waits for the horizon', waiting.phase === 'waiting' && Date.parse(waiting.test_at) === t0 + DAY + 30 * DAY, waiting);
check('no test before it is due', US.testNext(user.id, 9, ms.internals.loadCourse(user.id, 9), t0 + 2 * DAY).code === 'not_due');
const due = t0 + DAY + 31 * DAY;
const tcourse = db.find('material_courses', (c) => c.material_id === 9)[0];
const testQs = US.testNext(user.id, 9, ms.internals.loadCourse(user.id, 9), due);
check('the test has 16 questions, no keys, in one mixed order', testQs.questions.length === 16 && testQs.questions.every((x) => x.answer_index === undefined && x.answer === undefined));
const keyOf = (qid) => tcourse.skills.flatMap((s) => s.questions).find((x) => x.id === qid);
const answers = {}; for (const x of testQs.questions) { const k = keyOf(x.id); answers[x.id] = row.test_parts.savant.includes(x.skill) ? k.answer_index : (k.answer_index + 1) % 3; }
const sub = US.testSubmit(user.id, 9, ms.internals.loadCourse(user.id, 9), answers, ms.isCorrect, due);
check('Savant half all right, normal half all wrong: scores kept apart', sub.ok && sub.result.score_savant === 1 && sub.result.score_normal === 0, sub.result);
check('the result carries time and words for each half', sub.result.ms_savant > 0 && sub.result.ms_normal > 0 && sub.result.words_savant > 0 && sub.result.words_normal > 0 && sub.result.horizon_days === 30);
check('the test cannot be taken twice', US.testSubmit(user.id, 9, ms.internals.loadCourse(user.id, 9), answers, ms.isCorrect, due).code === 'not_due');
check('stopping ends the split and deletes nothing', (() => { const r2 = US.rowOf(user.id, 9); return !!r2.result; })());

// ── pooling ──
console.log('pooling');
const mk = (ratioWant, diff, n) => Array.from({ length: n }, (_, i) => ({ ms_savant: 600000, ms_normal: 600000 * ratioWant * (1 + 0.1 * Math.sin(i)), words_savant: 3000, words_normal: 3000, score_savant: 0.8, score_normal: 0.8 - diff / 100 + 0.02 * Math.cos(i), n_test: 12 }));
check('under 30 learners: no claim', /no claim/.test(US.analyse(mk(5, 0, 12)).claim));
const a4 = US.analyse(mk(5, 0, 60));
check('60 learners at 5x and equal recall: claims 4x', /at least 4x/.test(a4.claim) && a4.at_4x_equal_or_better > 50, a4);
const a2 = US.analyse(mk(2, 0, 60));
check('2x is reported as 2x, not 4x', /equal or better recall; time ratio/.test(a2.claim) && a2.ratio_ci[1] < 3, a2);
check('lower recall is not called equal', /not shown to be equal/.test(US.analyse(mk(6, -12, 60)).claim));
check('rows without time are excluded and counted', US.analyse([...mk(5, 0, 40), { ms_savant: 0, ms_normal: 5, words_savant: 1, words_normal: 1, score_savant: 1, score_normal: 1 }]).excluded === 1);

// ── placement with the switches on ──
console.log('placement with proof');
delete process.env.UPLOAD_STUDY;
process.env.UPLOAD_TESTFIRST = '1';
const c2 = JSON.parse(JSON.stringify(course)); c2.user_id = user.id; c2.material_id = 10;
db.insert('material_courses', c2);
let step = ms.placementNext(user.id, 10, { random: () => 0.1 });
check('placement says it wants confidence', step.confidence === true && !!step.question);
let guard = 0; const asked = [];
while (!step.done && guard++ < 60) {
  const k = db.find('material_courses', (c) => c.material_id === 10)[0].skills.flatMap((s) => s.questions).find((x) => x.id === step.question.id);
  asked.push(step.question.skill);
  step = ms.placementAnswer(user.id, 10, step.question.id, k.answer_index, { random: () => 0.1 }, 'sure');
}
check('a learner who knows it all, sure of each answer, skips every part on proof', step.done && step.known.length === 8, step);
const pr = ms.internals.row(user.id, 10);
const counts = {}; for (const a of pr.placement.answers) counts[a.skill] = (counts[a.skill] || 0) + 1;
check('every skipped part had two right answers', Object.values(pr.skills).every((s) => s.status === 'mastered') && Object.values(counts).every((n) => n >= 2), counts);
check('each skipped part is rechecked within days, flagged as test-first', Object.values(pr.skills).every((s) => s.via === 'testfirst' && s.recheck === true && Date.parse(s.due) - Date.now() < 4 * DAY && Date.parse(s.due) - Date.now() > 2 * DAY));
delete process.env.UPLOAD_TESTFIRST;

// a learner who answers right but unsure everywhere, and one who is sure and wrong
process.env.UPLOAD_TESTFIRST = '1';
for (const [mid, conf, label] of [[11, 'think', 'right but never sure: nothing skipped'], [12, 'sure', 'sure and wrong: remediation flagged']]) {
  const c3 = JSON.parse(JSON.stringify(course)); c3.user_id = user.id; c3.material_id = mid; db.insert('material_courses', c3);
  let s3 = ms.placementNext(user.id, mid, { random: () => 0.1 }); let g = 0;
  while (!s3.done && g++ < 80) {
    const k = db.find('material_courses', (c) => c.material_id === mid)[0].skills.flatMap((s) => s.questions).find((x) => x.id === s3.question.id);
    s3 = ms.placementAnswer(user.id, mid, s3.question.id, mid === 11 ? k.answer_index : (k.answer_index + 1) % 3, { random: () => 0.1 }, conf);
  }
  const p3 = ms.internals.row(user.id, mid);
  if (mid === 11) check(label, s3.done && s3.known.length === 0 && Object.values(p3.skills).every((s) => s.status !== 'mastered'), s3.known);
  else check(label, s3.done && s3.known.length === 0 && Object.values(p3.skills).some((s) => s.remediate), s3.known);
}
delete process.env.UPLOAD_TESTFIRST;

// off: the path is unchanged
console.log('switches off');
const c4 = JSON.parse(JSON.stringify(course)); c4.user_id = user.id; c4.material_id = 13; db.insert('material_courses', c4);
let s4 = ms.placementNext(user.id, 13, { random: () => 0.1 });
check('off: no confidence asked', s4.confidence === undefined);
check('off: state carries no study block', ms.state(user.id, 13).own_control === undefined);

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
