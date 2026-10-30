#!/usr/bin/env node
/**
 * Catch-up for the unit-bank subjects (services/catchup-units.js): readiness per subject,
 * the check finds exactly the planted gaps, only gaps become blocks, a finished block
 * dates its reviews, the re-check closes it. Runs on a throwaway data file.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'catchup-units-test-'));
process.env.DB_FILE = path.join(TMP, 'db.json');
process.env.HOLDOUT_DIR = TMP;

const db = require('../config/db');
const curriculum = require('../config/curriculum');
const cu = require('../services/catchup-units');

let failed = 0;
function check(name, fn) { try { fn(); console.log(`ok   ${name}`); } catch (err) { failed += 1; console.log(`FAIL ${name}\n     ${err.stack.split('\n').slice(0, 4).join('\n     ')}`); } }

const answerOf = (trackId, q) => cu.questionsFor(cu.skillByKey(trackId, q.key)).find((x) => x.qid === q.qid).answer;
const wrongOf = (trackId, q) => q.choices.find((c) => c !== answerOf(trackId, q));
const targetOf = (trackId) => curriculum.getTrack(trackId).grades[5].id;

check('subjects report: math, english, reading are ready; the rest say what they lack', () => {
  const rep = Object.fromEntries(cu.subjectsReport().map((s) => [s.track_id, s]));
  for (const t of cu.TRACKS) assert.ok(rep[t].ready && rep[t].engine === 'unit-bank adapter', t);
  assert.ok(rep.spanish.ready);
  for (const t of ['act', 'iq', 'chess', 'piano', 'basketball']) assert.ok(!rep[t].ready && rep[t].engine === null, t);
});

for (const trackId of cu.TRACKS) {
  const target = targetOf(trackId);
  check(`${trackId}: ready, every unit has enough questions with the answer among the options`, () => {
    const r = cu.readiness(trackId, target);
    assert.ok(r.ready, JSON.stringify(r.missing));
    assert.ok(r.skills >= 4);
    for (const g of r.grades) for (const s of cu.skillsOfGrade(trackId, g)) {
      const qs = cu.questionsFor(s);
      assert.ok(qs.length >= cu.MIN_QUESTIONS && s.levels.length > 0);
      for (const q of qs) assert.ok(q.choices.includes(q.answer));
    }
  });

  check(`${trackId}: check finds the planted gaps, teaches only them, reviews dated, re-check closes it`, () => {
    const u = db.insert('users', { email: `${trackId}@t.test`, display_name: 'L', xp: 0, streak: 0 });
    const r = cu.readiness(trackId, target);
    const all = r.grades.flatMap((g) => cu.skillsOfGrade(trackId, g));
    const gaps = new Set([all[1].key, all[all.length - 2].key]);
    assert.ok(cu.start(u.id, trackId, target).state);
    for (let i = 0; i < 400; i++) {
      const v = cu.view(u.id, trackId, target);
      if (v.phase !== 'check') break;
      const out = cu.answer(u.id, trackId, target, { key: v.question.key, qid: v.question.qid, answer: gaps.has(v.question.key) ? wrongOf(trackId, v.question) : answerOf(trackId, v.question) });
      assert.ok(!out.error, out.error);
    }
    let v = cu.view(u.id, trackId, target);
    assert.strictEqual(v.phase, 'route');
    assert.deepStrictEqual(v.route.blocks.map((b) => b.key), all.filter((s) => gaps.has(s.key)).map((s) => s.key));
    assert.ok(v.counts.known >= all.length - 2 - 1, 'the rest were found known');
    for (const b of v.route.blocks) {
      const sk = cu.skillByKey(trackId, b.key);
      const nxt = cu.nextLevel(u.id, trackId, target);
      assert.ok(!nxt.error && nxt.level === sk.levels[0], nxt.error);
      const enr = db.byId('enrollments', nxt.enrollment_id);
      assert.ok(cu.allowsLevel(u.id, enr, sk.levels[0]), 'the block level opens');
      assert.ok(!cu.allowsLevel(u.id, enr, sk.levels[sk.levels.length - 1] + 1), 'a level outside the block does not');
      assert.ok(!cu.allowsLevel(u.id, { ...enr, track_id: 'chess' }, sk.levels[0]), 'another subject does not');
      for (const l of sk.levels) assert.ok(cu.onLevelPassed({ userId: u.id, trackId, gradeId: sk.grade_id, level: l, now: Date.parse('2026-11-01T00:00:00Z') }));
    }
    v = cu.view(u.id, trackId, target);
    assert.strictEqual(v.phase, 'recheck');
    assert.strictEqual(v.next_review_due_at, '2026-11-02T00:00:00.000Z');
    for (let i = 0; i < 40 && v.phase === 'recheck'; i++) {
      const q = v.recheck.question;
      cu.answer(u.id, trackId, target, { key: q.key, qid: q.qid, answer: answerOf(trackId, q) });
      v = cu.view(u.id, trackId, target);
    }
    assert.strictEqual(v.phase, 'done');
  });
}

check('a learner who knows everything gets no blocks', () => {
  const trackId = 'math'; const target = targetOf(trackId);
  const u = db.insert('users', { email: 'all@t.test', display_name: 'L', xp: 0, streak: 0 });
  cu.start(u.id, trackId, target);
  for (let i = 0; i < 400; i++) {
    const v = cu.view(u.id, trackId, target);
    if (v.phase !== 'check') break;
    cu.answer(u.id, trackId, target, { key: v.question.key, qid: v.question.qid, answer: answerOf(trackId, v.question) });
  }
  const v = cu.view(u.id, trackId, target);
  assert.strictEqual(v.phase, 'recheck');
  assert.strictEqual(v.route.blocks.length, 0);
});

check('not ready: unknown subject and the first grade give an error, never a guess', () => {
  const u = db.insert('users', { email: 'x@t.test', display_name: 'L', xp: 0, streak: 0 });
  assert.ok(cu.start(u.id, 'chess', 'x').error);
  assert.ok(cu.start(u.id, 'math', curriculum.getTrack('math').grades[0].id).error);
  assert.ok(cu.answer(u.id, 'math', 'nope', {}).error);
});

check('page: catch-up page, its script, the route mount and the subject-page link exist', () => {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'public', 'catchup.html'), 'utf8');
  assert.ok(/name="viewport"/.test(html) && html.includes('/js/catchup.js'));
  assert.ok(/@media|max-width: 640px/.test(html), 'a width limit for 375 px');
  assert.ok(fs.readFileSync(path.join(root, 'server.js'), 'utf8').includes("'/api/catchup', require('./routes/catchup')"));
  const pathJs = fs.readFileSync(path.join(root, 'public', 'js', 'path.js'), 'utf8');
  assert.ok(pathJs.includes("['math', 'english', 'reading'].includes(track.id)") && pathJs.includes('/catchup?track='));
  const js = fs.readFileSync(path.join(root, 'public', 'js', 'catchup.js'), 'utf8');
  for (const needle of ['next_review_due_at', 'found missing', 'blocks done', 'Catch me up to']) assert.ok(js.includes(needle), needle);
});

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
