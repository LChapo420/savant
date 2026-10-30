/**
 * Learn from your own material, S3 practice test on demand (services/material-test.js, routes/materials.js,
 * public/my-material-test):
 *
 *   node scripts/material-adapt-test.js
 *
 * Throwaway db, mocked model and mocked typed-grading judge, so no real call is made.
 */
const os = require('os');
const path = require('path');
const fs = require('fs');
const http = require('http');

process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(os.tmpdir(), `material-adapt-test-${process.pid}.json`);

const express = require('express');
const db = require('../config/db');
const materials = require('../services/materials');
const cb = require('../services/course-builder');
const ms = require('../services/material-study');
const pt = require('../services/material-test');
const adapt = require('../services/material-adapt');
const { rng } = require('../services/material-path');

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

function llm() {
  return async (args) => {
    if (args.task === 'material_outline') return { model: 'mock', data: { skills: [
      { id: 'cells', title: 'Inside the cell', summary: 'Organelles.', unit: 'Cells', prerequisites: [], passage_ids: ['p1'] },
      { id: 'photo', title: 'Photosynthesis', summary: 'Sugar from light.', unit: 'Plants', prerequisites: ['cells'], passage_ids: ['p2'] },
    ] } };
    if (args.task === 'material_lesson') {
      const pid = /\[(p\d+)\]/.exec(args.user)[1];
      const quote = { p1: S1, p2: S2 }[pid];
      const q = (n, over = {}) => ({
        type: 'multiple_choice', prompt: `Question ${n} about ${pid}?`, choices: ['one', 'two', 'three'], answer_index: 1, tier: 1 + (n % 3),
        misconceptions: ['mixes up one and two', '', 'counts the wrong part'], explanation: 'Because the passage says so.', passage_id: pid, quote, ...over,
      });
      return { model: 'mock', data: { lesson: { paragraphs: ['Short lesson.'], key_points: ['Key.'] }, questions: [q(1), q(2), q(3), q(4, { type: 'short_answer', answer: 'sugar' })] } };
    }
    const n = (args.user.match(/^\d+\./gm) || []).length;
    return { model: 'mock', data: { verdicts: Array.from({ length: n }, (_, i) => ({ n: i + 1, supported: true })) } };
  };
}


const DAY = 86400000;
const NOW = Date.parse('2026-11-02T12:00:00Z');
const mk = (n) => ({ skills: Array.from({ length: n }, (_, i) => ({ id: `s${i}`, questions: [1, 2, 3, 4].map((t) => ({ id: `s${i}q${t}`, tier: Math.min(3, t) })) })) });
const mastered = (due = null) => ({ status: 'mastered', due, wrong: [], tier: 2 });

(async () => {
  console.log('the plan from the learner model (07-M3, 07-M6, 07-M9)');
  const c = mk(12);
  const none = adapt.plan(c, { placed: true, skills: {} }, NOW);
  check('a learner who knows nothing is planned for every skill', none.skills.length === 12 && none.skipped.length === 0 && none.total === 36, none);
  const unplaced = adapt.plan(c, null, NOW);
  check('no progress row at all: everything is new, nothing skipped', unplaced.skills.length === 12 && unplaced.skills.every((s) => s.need === 'new'));
  const half = { placed: true, skills: Object.fromEntries(c.skills.slice(0, 6).map((s) => [s.id, mastered(new Date(NOW + 5 * DAY).toISOString())])) };
  const ph = adapt.plan(c, half, NOW);
  check('a learner who knows half is asked half as many items', ph.total === none.total / 2 && ph.skills.length === 6, ph.total);
  check('exactly the known skills are skipped', ph.skipped.join() === c.skills.slice(0, 6).map((s) => s.id).join());
  check('the next review date of the skipped skills is reported', ph.next_due === new Date(NOW + 5 * DAY).toISOString());
  const dueR = { placed: true, skills: { ...half.skills, s0: mastered(new Date(NOW - DAY).toISOString()) } };
  const pd = adapt.plan(c, dueR, NOW);
  check('a known skill comes back when its review is due, at tier 2 or higher', pd.skills.some((s) => s.id === 's0' && s.need === 'due' && s.tier >= 2 && s.items === 2));
  const missed = { placed: true, skills: { ...half.skills, s1: { ...mastered(new Date(NOW + 9 * DAY).toISOString()), wrong: ['s1q2'] } } };
  const pm = adapt.plan(c, missed, NOW);
  check('a known skill with a missed question comes back first (wrong answers return)', pm.skills[0].id === 's1' && pm.skills[0].need === 'fix', pm.skills[0]);
  check('remediation outranks everything and a started skill is "learning"', adapt.needOf({ status: 'new', remediate: true }, true, NOW) === 'fix' && adapt.needOf({ status: 'learning' }, true, NOW) === 'learning');
  check('a skill with no questions is never planned', adapt.plan({ skills: [{ id: 'x', questions: [] }] }, null, NOW).skills.length === 0);
  const one = { skills: [{ id: 'a', questions: [{ id: 'a1', tier: 1 }] }] };
  check('items are capped by the questions a skill has', adapt.plan(one, null, NOW).skills[0].items === 1);

  console.log('picking questions');
  const sk = c.skills[0];
  const pick = adapt.pickFor(sk, { items: 2, tier: 3 }, ['s0q1'], rng(3));
  check('a missed question is always picked first, then the tier asked for', pick[0].id === 's0q1' && pick[1].tier === 3, pick);
  check('never more than the items asked, never repeated', adapt.pickFor(sk, { items: 3, tier: 1 }, [], rng(9)).length === 3);

  console.log('simulated learners (200 random learners, 12 skills)');
  let skippedUnknown = 0, missedKnown = 0, fewer = 0, ordered = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const r = rng(seed);
    const share = r();
    const progress = {};
    const know = c.skills.map((s) => {
      const k = r() < share;
      if (k) progress[s.id] = mastered(new Date(NOW + (1 + Math.floor(r() * 20)) * DAY).toISOString());
      else if (r() < 0.5) progress[s.id] = { status: 'learning', wrong: [], tier: 1 };
      return k;
    });
    const p = adapt.plan(c, { placed: true, skills: progress }, NOW);
    const planned = new Set(p.skills.map((s) => s.id));
    c.skills.forEach((s, i) => { if (!know[i] && !planned.has(s.id)) skippedUnknown++; if (know[i] && planned.has(s.id)) missedKnown++; });
    if (p.total <= none.total) fewer++;
    if (know.filter(Boolean).length > 0 && p.total < none.total) ordered++;
    if (p.total !== 3 * know.filter((k) => !k).length) skippedUnknown++;
  }
  check('no skill the learner does not know is ever skipped', skippedUnknown === 0, skippedUnknown);
  check('no known skill that is not due is ever asked about', missedKnown === 0, missedKnown);
  check('never more items than a learner who knows nothing; fewer whenever anything is known', fewer === 200 && ordered > 150, { fewer, ordered });

  console.log('"pick for me" in the practice test');
  const u = db.insert('users', { email: 'a@test.invalid', role: 'learner' });
  const m = materials.addPaste(u.id, 'Cell biology', TEXT).value;
  await cb.build(u.id, m.id, { llm: llm() });
  const t0 = pt.start(u.id, m.id, { adapt: true, random: () => 0.4 });
  const nq = cb.get(u.id, m.id).skills.reduce((n, s) => n + Math.min(3, s.questions.length), 0);
  check('a new learner is asked about both skills, sized by need', new Set(t0.questions.map((q) => q.skill)).size === 2 && t0.questions.length === nq, t0.questions.length);
  const r1 = ms.internals.row(u.id, m.id);
  Object.assign(ms.internals.skillState(r1, 'cells'), { status: 'mastered', due: new Date(Date.now() + 9 * DAY).toISOString() });
  ms.internals.save(r1);
  const t1 = pt.start(u.id, m.id, { adapt: true });
  check('after mastering one skill the test covers only the other', t1.questions.length > 0 && t1.questions.every((q) => q.skill === 'photo'), t1.questions.map((q) => q.skill));
  check('an explicit length is still respected', pt.start(u.id, m.id, { adapt: true, length: 3 }).questions.length === 3);
  check('picking only a known skill says nothing is needed', pt.start(u.id, m.id, { adapt: true, skills: ['cells'] }).code === 'nothing_due');
  Object.assign(ms.internals.skillState(ms.internals.row(u.id, m.id), 'photo'), {});
  const r2 = ms.internals.row(u.id, m.id);
  Object.assign(ms.internals.skillState(r2, 'photo'), { status: 'mastered', due: new Date(Date.now() + 3 * DAY).toISOString() });
  ms.internals.save(r2);
  const done = pt.start(u.id, m.id, { adapt: true });
  check('with everything known and nothing due, it says when the next review is', done.code === 'nothing_due' && !!done.next_due, done);
  const r3 = ms.internals.row(u.id, m.id);
  ms.internals.skillState(r3, 'cells').due = new Date(Date.now() - DAY).toISOString();
  ms.internals.save(r3);
  const back = pt.start(u.id, m.id, { adapt: true });
  check('a due review brings its skill back', back.questions.every((q) => q.skill === 'cells') && back.questions.length === 2, back.questions.length);
  check('a plain test (no adapt) is unchanged', pt.start(u.id, m.id, { length: 4 }).questions.length === 4);

  console.log('the page and the route');
  check('the route passes adapt through', /adapt: b\.adapt === true/.test(read('routes/materials.js')));
  check('the page offers "Pick for me"', /name="adapt"/.test(read('public/js/my-material-test.js')));

  try { fs.unlinkSync(process.env.DB_FILE); } catch { /* none */ }
  if (failures) { console.log(`\n${failures} check(s) failed`); process.exit(1); }
  console.log('\nAll checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
