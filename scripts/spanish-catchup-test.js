#!/usr/bin/env node
/**
 * The Spanish skill catch-up (services/spanish/catch-up.js):
 *
 *   - skills: every grade below the recommended one splits into its curriculum
 *     units; each block is the unit's preview, lessons and unit check, minutes
 *     not hours, and plays in the Duolingo-style player;
 *   - questions: from the checked banks (bank generators where they fit, the
 *     skill's engine unit otherwise), each with its answer among distinct options;
 *   - the check: three right make a skill known, a miss makes it a gap, three
 *     undecided answers are a gap (never a skip); questions a round at a time;
 *   - the route: one block per gap, "Catch-up k of N", levels open in the player,
 *     a finished run ticks its level, a finished block puts every phrase of the
 *     skill in the review boxes, a later block recycles earlier skills' phrases;
 *   - the re-check: mixed, 75% per skill; a miss sends back that skill only, and
 *     the next re-check asks only about it; passing opens the recommended grade;
 *   - migration: an old accepted gap-scan route becomes this one on first open,
 *     with every enrollment left where it was;
 *   - the gap-scan route for Spanish is this one (path page, dashboard).
 *
 * Runs on a throwaway data file.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'spanish-catchup-test-'));
process.env.DB_FILE = path.join(TMP, 'db.json');
process.env.HOLDOUT_DIR = TMP;

const db = require('../config/db');
const curriculum = require('../config/curriculum');
const cu = require('../services/spanish/catch-up');
const esPath = require('../services/spanish/path');
const gapScan = require('../services/gap-scan');

let failed = 0;
function check(name, fn) {
  try { fn(); console.log(`ok   ${name}`); } catch (err) { failed += 1; console.log(`FAIL ${name}\n     ${err.stack.split('\n').slice(0, 4).join('\n     ')}`); }
}

const G3 = 'advanced';
const G4 = 'spanish_grade_04_time_food_shopping_and_core_verbs';
const G5 = 'spanish_grade_05_home_places_and_directions';

function learner(email) {
  const u = db.insert('users', { email, display_name: 'L', xp: 0, streak: 0 });
  db.insert('subject_placements', { user_id: u.id, track_id: 'spanish', mode: 'quick', started_at: '2026-10-29T02:00:00.000Z', finished_at: '2026-10-29T02:20:00.000Z', recommended_grade_id: G5 });
  return u;
}
const answerOf = (q) => cu.questionsFor(cu.skillByKey(q.key)).find((x) => x.qid === q.qid).answer;
const wrongOf = (q) => q.choices.find((c) => c !== answerOf(q));

/** Answer the whole check: `gap(key)` says which skills to miss. */
function takeCheck(u, gap) {
  cu.start(u.id);
  for (let i = 0; i < 400; i++) {
    const v = cu.view(u.id);
    if (v.phase !== 'check') return v;
    const q = v.question;
    const out = cu.answer(u.id, { key: q.key, qid: q.qid, answer: gap(q.key) ? wrongOf(q) : answerOf(q) });
    assert.ok(!out.error, out.error);
  }
  throw new Error('check did not end');
}

/** Play every level of the block under way through the real engine (startRun/finishRun), answering right. */
function playBlock(u) {
  const next = cu.nextLevel(u.id);
  assert.ok(!next.error, next.error);
  const e = db.byId('enrollments', next.enrollment_id);
  let last = null;
  const v = cu.view(u.id);
  const block = v.route.blocks[v.route.k - 1];
  for (const l of block.levels.filter((x) => !x.done)) {
    assert.ok(cu.allowsLevel(u.id, e, l.level), `level ${l.level} open`);
    const run = esPath.startRun({ user: u, enrollment: db.byId('enrollments', e.id), level: l.level });
    assert.ok(run, `level ${l.level} builds`);
    for (const [id, item] of esPath.itemsOf(run)) esPath.recordResult({ runId: run.id, userId: u.id, itemId: id, correct: true, extra: { kind: item.kind } });
    last = esPath.finishRun({ user: u, runId: run.id, client: { hits: 9, total: 9 } });
    assert.ok(last.passed, `level ${l.level} passed`);
    assert.ok(last.catch_up, 'the finish card hears about the catch-up');
  }
  return { last, block, enrollment: e };
}

// ── skills and questions ────────────────────────────────────────────────────
check('skills: every grade below Grade 5 splits into its curriculum units (7-13 each)', () => {
  const grades = cu.gradesBelow(G5);
  assert.deepStrictEqual(grades, ['entry', 'intermediate', G3, G4]);
  const n = grades.map((g) => cu.skillsOfGrade(g).length);
  assert.deepStrictEqual(n, [7, 10, 13, 11]);
});

check('skills: a block is its unit\'s preview, lessons and unit check: minutes, not hours, and a fraction of the grade', () => {
  const grade4 = curriculum.getGrade('spanish', G4);
  const gradeMinutes = grade4.levels.reduce((m, r) => m + (Number(r.minutes) || 0), 0);
  for (const s of [...cu.skillsOfGrade(G3), ...cu.skillsOfGrade(G4)]) {
    assert.ok(s.levels.length >= 3 && s.minutes <= 60, `${s.key}: ${s.levels.length} levels, ${s.minutes} min`);
    assert.ok(s.levels.every((l) => l >= s.unit_levels[0] && l <= s.unit_levels[1]), `${s.key}: levels inside its unit`);
  }
  const u41 = cu.skillByKey(`${G4}|Unit 4.1`);
  assert.ok(u41.minutes * 10 < gradeMinutes, 'one skill is under a tenth of the grade');
  assert.deepStrictEqual(u41.levels, [2, 3, 4, 7, 8, 13]);
});

check('content: Grade 3 and Grade 4 have engine units, so their blocks play in the Duolingo-style player', () => {
  for (const g of [G3, G4]) {
    const playable = cu.skillsOfGrade(g).filter((s) => cu.playable(s));
    assert.ok(playable.length >= cu.skillsOfGrade(g).length - 2, `${g}: ${playable.length} of ${cu.skillsOfGrade(g).length} skills play in /spanish/learn`);
  }
  assert.ok(esPath.supports(G4, 3) && esPath.supports(G3, 4), 'supports() for Grade 3 and 4 lessons');
});

check('questions: answers among distinct options, from the banks and the engine units', () => {
  let bank = 0; let unit = 0;
  for (const g of cu.gradesBelow(G5)) {
    for (const s of cu.skillsOfGrade(g)) {
      for (const q of cu.questionsFor(s)) {
        assert.ok(q.choices.length >= 3 && new Set(q.choices).size === q.choices.length, `${q.qid}: distinct options`);
        assert.ok(q.choices.includes(q.answer), `${q.qid}: answer among options`);
        if (q.source.startsWith('bank:')) bank++; else unit++;
      }
    }
  }
  assert.ok(bank >= 50 && unit >= 300, `bank ${bank}, unit ${unit}`);
  const q41 = cu.questionsFor(cu.skillByKey(`${G4}|Unit 4.1`));
  assert.ok(q41.slice(0, 3).some((q) => q.source === 'bank:es_present_ar' || q.source === 'bank:es_present_erir'), 'Unit 4.1 asks the conjugation bank early');
  assert.ok(new Set(q41.slice(0, 3).map((q) => q.source)).size >= 2, 'three questions look at a skill more than one way');
});

check('content pipeline: structural checks drop bad phrases; planted errors really change the Spanish', () => {
  const pipeline = require('./spanish-catchup-content');
  const spec = pipeline.unitSpecs('g4')[0];
  const draft = {
    phrases: [
      { es: 'Hablo español.', en: ['I speak Spanish.'], tier: 1, skill: 'es_present_ar', topic: spec.topics[0].id },
      { es: '¿Adónde vas', en: ['Where are you going?'], tier: 1, skill: 'es_present_erir', topic: spec.topics[3].id },
      { es: 'Como pan.', en: ['I eat bread.'], tier: 1, skill: 'es_made_up', topic: spec.topics[1].id },
    ],
    scene: { lines: [], questions: [] }, convo: { goals: [], script: [] }, fills: [{ before: 'Yo', after: '.', choices: ['hablo', 'hablo'], answer: 0, en: 'x' }], chats: [], reads: [],
  };
  const problems = pipeline.structural(draft, spec);
  assert.deepStrictEqual(draft.phrases.map((p) => p.es), ['Hablo español.']);
  assert.strictEqual(draft.fills.length, 0, 'repeated options dropped');
  assert.ok(problems.some((p) => /not balanced/.test(p)) && problems.some((p) => /skill/.test(p)));
  const [accent, gender, conj] = pipeline.PLANTS.map((p) => p.apply);
  assert.strictEqual(accent('Hablo español.'), 'Hablo espanol.');
  assert.strictEqual(gender('la manzana'), 'el manzana');
  assert.notStrictEqual(conj('Ellos trabajan.'), 'Ellos trabajan.');
  assert.ok(pipeline.flatItems({ ...draft, phrases: draft.phrases, scene: { lines: [], questions: [] }, convo: { opening: 'Hola', learnerCardEs: '', targets: [], script: [], closing: '' } }).some((i) => i.id === 'P1'));
});

// ── the check ───────────────────────────────────────────────────────────────
const strong = learner('strong@example.com');
let strongView;
check('check: three right make a skill known; one miss makes it a gap; a round at a time', () => {
  cu.start(strong.id);
  const first = cu.view(strong.id);
  assert.strictEqual(first.phase, 'check');
  assert.strictEqual(first.question.key, 'entry|Unit 1.1', 'lowest grade first');
  assert.ok(!('answer' in first.question), 'the answer never reaches the browser');
  const keysSeen = [];
  strongView = takeCheck(strong, (key) => {
    keysSeen.push(key);
    return key === `${G4}|Unit 4.1` || key === `${G3}|Unit 3.2`;
  });
  // A round at a time: the first 41 questions are 41 different skills.
  assert.strictEqual(new Set(keysSeen.slice(0, 41)).size, 41);
  assert.strictEqual(strongView.phase, 'route');
  assert.strictEqual(strongView.counts.learn, 2);
  assert.strictEqual(strongView.counts.known, 39);
  const s41 = strongView.skills.find((s) => s.key === `${G4}|Unit 4.1`);
  // One miss on a four-option question decides it (belief 0.59); on a three-option one it takes a second miss.
  assert.ok(s41.asked <= 2 && s41.status === 'learn', `misses decide the skill fast (${s41.asked} asked)`);
  const known = strongView.skills.filter((s) => s.status === 'known');
  assert.ok(known.every((s) => s.asked === 3 && s.right === 3), 'known takes three right answers');
  assert.ok(strongView.counts.asked > 3 * 4, 'a confident known needs more than three questions per grade');
});

check('check: an undecided skill after three questions is a gap, never a skip', () => {
  const u = learner('mixed@example.com');
  let n = 0;
  const v = takeCheck(u, (key) => key === 'entry|Unit 1.2' && (n++ === 1)); // right, wrong, right
  const s = v.skills.find((x) => x.key === 'entry|Unit 1.2');
  assert.strictEqual(s.asked, 3);
  assert.strictEqual(s.status, 'learn');
  assert.ok(s.unchecked);
});

check('check: a stale or repeated answer changes nothing', () => {
  const u = learner('stale@example.com');
  cu.start(u.id);
  const q = cu.view(u.id).question;
  assert.ok(!cu.answer(u.id, { key: q.key, qid: q.qid, answer: answerOf(q) }).error);
  const again = cu.answer(u.id, { key: q.key, qid: q.qid, answer: answerOf(q) });
  assert.strictEqual(again.status, 409);
});

// ── the route ───────────────────────────────────────────────────────────────
check('route: one short block per gap, lowest grade first, "Catch-up k of N"', () => {
  const r = strongView.route;
  assert.strictEqual(r.n, 2);
  assert.strictEqual(r.k, 1);
  assert.deepStrictEqual(r.blocks.map((b) => b.key), [`${G3}|Unit 3.2`, `${G4}|Unit 4.1`]);
  assert.ok(r.total_minutes < 120, `${r.total_minutes} minutes`);
  const shape = gapScan.routeFor(strong.id, 'spanish');
  assert.strictEqual(shape.version, 3);
  assert.strictEqual(shape.url, '/spanish/catch-up');
  assert.strictEqual(shape.steps.length, 2);
  assert.match(shape.headline, /Catch-up 1 of 2/);
});

check('route: a level outside the blocks is not opened by the catch-up', () => {
  const e = db.insert('enrollments', { user_id: strong.id, track_id: 'spanish', grade_id: G4, status: 'active', current_level: 1, level_items: 0, xp: 0 });
  assert.ok(cu.allowsLevel(strong.id, e, 3));
  assert.ok(!cu.allowsLevel(strong.id, e, 40), 'a checkpoint of another unit stays shut');
});

let block1;
check('play: block 1 in the player; each passed level ticks off; the block seeds the review boxes', () => {
  block1 = playBlock(strong);
  const v = cu.view(strong.id);
  assert.strictEqual(v.route.blocks[0].status, 'done');
  assert.strictEqual(v.route.k, 2, 'Catch-up 2 of 2 is next');
  assert.ok(block1.last.catch_up.block_done);
  assert.match(block1.last.catch_up.next.url, /\/spanish\/learn\?enrollment=\d+&level=2&catchup=1/);
  const unit = cu.engineUnit(cu.skillByKey(`${G3}|Unit 3.2`));
  const rows = db.find('es_review', (r) => r.user_id === strong.id && unit.phrases.some((p) => p.id === r.pid));
  assert.strictEqual(rows.length, unit.phrases.length, 'every phrase of the skill is in a review box');
  assert.ok(rows.every((r) => Date.parse(r.due_at) > Date.now()), 'and due later, on the box schedule');
  assert.ok(v.route.blocks[0].review.in_review === unit.phrases.length);
  // The grade's own place is not moved by catch-up practice.
  assert.strictEqual(db.byId('enrollments', block1.enrollment.id).current_level, 1);
});

check('interleave: block 2\'s lessons recycle phrases of the skill caught up in block 1', () => {
  const g3Pids = new Set(cu.engineUnit(cu.skillByKey(`${G3}|Unit 3.2`)).phrases.map((p) => p.id));
  const mix = cu.mixInFor(strong.id, G4, 3);
  assert.strictEqual(mix.length, cu.MIX_IN);
  assert.ok(mix.every((p) => g3Pids.has(p)));
  const e = db.findOne('enrollments', (x) => x.user_id === strong.id && x.grade_id === G4);
  const run = esPath.startRun({ user: strong, enrollment: e, level: 3 });
  assert.ok(run.recycles.some((p) => g3Pids.has(p)), 'the built lesson recycles them');
  assert.ok(run.items.some((it) => it.pid && g3Pids.has(it.pid)), 'and asks at least one of them');
});

check('play: the last block opens the final mixed re-check', () => {
  playBlock(strong);
  const v = cu.view(strong.id);
  assert.strictEqual(v.phase, 'recheck');
  assert.strictEqual(v.recheck.round, 1);
  // Two per caught-up skill and one per sampled known skill (four, over the grades).
  assert.strictEqual(v.recheck.total, 2 * 2 + 4);
  assert.ok(v.recheck.skills >= 6);
  const asked = new Set(db.findOne('es_catch_up', (r) => r.user_id === strong.id).check.asked.map((a) => `${a.key}#${a.qid}`));
  const items = db.findOne('es_catch_up', (r) => r.user_id === strong.id).recheck.items;
  assert.ok(items.every((it) => !asked.has(`${it.key}#${it.qid}`)), 'fresh questions only');
  assert.ok(new Set(items.slice(0, 3).map((x) => x.key)).size > 1, 'mixed, not in blocks');
});

check('re-check: a miss sends the learner back to that skill only; the next re-check asks only about it', () => {
  let missed = false;
  for (let i = 0; i < 20; i++) {
    const v = cu.view(strong.id);
    if (v.phase !== 'recheck') break;
    const q = v.recheck.question;
    const miss = !missed && q.key === `${G4}|Unit 4.1`;
    if (miss) missed = true;
    cu.answer(strong.id, { key: q.key, qid: q.qid, answer: miss ? wrongOf(q) : answerOf(q) });
  }
  let v = cu.view(strong.id);
  assert.strictEqual(v.phase, 'route');
  assert.deepStrictEqual(v.rechecks[0].failed.map((f) => f.key), [`${G4}|Unit 4.1`]);
  assert.ok(v.rechecks[0].score >= 75, 'the overall score can pass while one skill does not');
  assert.strictEqual(v.route.blocks.filter((b) => b.status !== 'done').length, 1);
  assert.strictEqual(v.route.blocks.find((b) => b.status !== 'done').key, `${G4}|Unit 4.1`);
  playBlock(strong);
  v = cu.view(strong.id);
  assert.strictEqual(v.phase, 'recheck');
  assert.strictEqual(v.recheck.round, 2);
  assert.strictEqual(v.recheck.total, 2);
  assert.strictEqual(v.recheck.skills, 1);
});

check('re-check: passing opens the recommended grade', () => {
  for (let i = 0; i < 5; i++) {
    const v = cu.view(strong.id);
    if (v.phase !== 'recheck') break;
    cu.answer(strong.id, { key: v.recheck.question.key, qid: v.recheck.question.qid, answer: answerOf(v.recheck.question) });
  }
  const v = cu.view(strong.id);
  assert.strictEqual(v.phase, 'done');
  assert.strictEqual(v.next.kind, 'main');
  assert.match(v.next.label, /Start Grade 5/);
  assert.strictEqual(gapScan.routeFor(strong.id, 'spanish').status, 'done');
});

// ── migration ───────────────────────────────────────────────────────────────
check('migration: an old accepted catch-up becomes the skill catch-up on first open, nothing moved', () => {
  const owner = learner('owner-copy@example.com');
  const row = db.findOne('subject_placements', (p) => p.user_id === owner.id);
  db.update('subject_placements', row.id, {
    catch_up_choice: { status: 'taken', grade_id: G5, at: '2026-10-29T22:29:59.726Z' },
    gap_scan: { kind: 'catch_up', grade_id: G5, walk_started_at: row.started_at, finished_at: '2026-10-29T22:31:00.000Z', asked: new Array(12).fill({}), candidates: [], gaps: [] },
  });
  const entry = db.insert('enrollments', { user_id: owner.id, track_id: 'spanish', grade_id: 'entry', status: 'active', current_level: 28, level_items: 0, xp: 0 });
  const g4 = db.insert('enrollments', { user_id: owner.id, track_id: 'spanish', grade_id: G4, status: 'active', current_level: 1, placed_by: 'gap_scan', level_items: 0, xp: 0 });
  db.insert('enrollments', {
    user_id: owner.id, track_id: 'spanish', grade_id: G5, status: 'placement_pending', current_level: 1, level_items: 0, xp: 0,
    unit_plan: { version: 1, units: {}, catch_up: [{ grade_id: G4, status: 'accepted', enrollment_id: g4.id, unit_keys: [`spanish:${G4}:1`], units: [1], titles: ['Regular -AR Verbs in the Present'], minutes: 680, unchecked_count: 0 }] },
  });
  db.insert('es_review', { user_id: owner.id, pid: 'hola', unit: 'Unit 1.1', grade_id: 'entry', box: 3, seen: 3, right: 3, wrong: 0, due_at: '2026-11-01T00:00:00.000Z', last_at: '2026-10-29T00:00:00.000Z' });
  const v = cu.view(owner.id);
  assert.strictEqual(v.phase, 'check');
  assert.strictEqual(v.migrated_from.from, 'gap_scan');
  assert.strictEqual(v.migrated_from.total_minutes, 680);
  assert.strictEqual(db.byId('enrollments', entry.id).current_level, 28, 'Entry stays at level 28');
  assert.strictEqual(db.byId('enrollments', g4.id).current_level, 1);
  assert.strictEqual(db.find('es_review', (r) => r.user_id === owner.id).length, 1, 'review boxes kept');
  assert.strictEqual(gapScan.routeFor(owner.id, 'spanish').version, 3, 'the path page and dashboard now get the skill route');
  // Second open: the same row, not another.
  cu.view(owner.id);
  assert.strictEqual(db.find('es_catch_up', (r) => r.user_id === owner.id).length, 1);
});

check('no catch-up for a learner placed in Grade 1', () => {
  const u = db.insert('users', { email: 'g1@example.com' });
  db.insert('subject_placements', { user_id: u.id, track_id: 'spanish', started_at: 'x', finished_at: '2026-10-29T02:20:00.000Z', recommended_grade_id: 'entry' });
  assert.strictEqual(cu.view(u.id).available, false);
});

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
