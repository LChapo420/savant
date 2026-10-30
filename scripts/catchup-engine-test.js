#!/usr/bin/env node
/**
 * The subject-agnostic catch-up engine (services/catchup-engine.js) on a toy subject:
 * a check that stops early per skill, only gaps become blocks (lowest grade first),
 * an undecided skill is a gap, and the final re-check sends back only failed skills.
 * Pure: no database.
 */
const assert = require('assert');
const { createEngine } = require('../services/catchup-engine');

let n = 0;
function ok(name, fn) { fn(); n++; console.log(`ok   ${name}`); }

const GRADES = ['g1', 'g2', 'g3'];
const SKILLS = {};
for (const g of GRADES) for (let i = 1; i <= 4; i++) SKILLS[`${g}|${i}`] = { key: `${g}|${i}`, grade_id: g, levels: [1, 2, 3] };
const engine = createEngine({
  gradeOrder: () => GRADES,
  skillByKey: (k) => SKILLS[k] || null,
  questionsFor: (s) => Array.from({ length: 8 }, (_, i) => ({ qid: `${s.key}:${i}` })),
  maxPerSkill: 3, mastery: 0.75, recheckPerSkill: 2, recheckKnownSample: 4,
});
const NOW = Date.parse('2026-10-30T00:00:00Z');
const all = () => Object.values(SKILLS).reverse().map((s) => ({ key: s.key, grade_id: s.grade_id })); // handed in out of order

function runCheck(state, knows) {
  let asked = 0;
  while (state.check.current) { const c = state.check.current; engine.recordCheck(state, c, knows(c.key), 4, NOW); asked++; }
  return asked;
}

ok('skills are ordered lowest grade first whatever order they come in', () => {
  const st = engine.newState(all(), NOW);
  assert.deepStrictEqual(st.skills.map((s) => s.grade_id).filter((g, i, a) => a.indexOf(g) === i), GRADES);
});
ok('a learner who knows everything: three questions per skill, no blocks, straight to the re-check', () => {
  const st = engine.begin(engine.newState(all(), NOW, { id: 'a' }), NOW);
  const asked = runCheck(st, () => true);
  assert.strictEqual(st.blocks.length, 0);
  assert.strictEqual(st.phase, 'recheck');
  assert.ok(asked <= 12 * 3 && asked >= 12);
  assert.ok(st.skills.every((s) => s.status === 'known'));
});
ok('a miss ends that skill at once; only gaps become blocks, in grade order', () => {
  const gaps = new Set(['g1|2', 'g3|1', 'g2|4']);
  const st = engine.begin(engine.newState(all(), NOW, { id: 'b' }), NOW);
  const asked = runCheck(st, (k) => !gaps.has(k));
  assert.deepStrictEqual(st.blocks.map((b) => b.key), ['g1|2', 'g2|4', 'g3|1']);
  assert.strictEqual(st.phase, 'route');
  assert.ok(asked < 12 * 3);
  assert.ok(st.skills.filter((s) => s.status === 'learn').every((s) => gaps.has(s.key)));
});
ok('a skill with no questions is a gap, never a skip', () => {
  const e2 = createEngine({ gradeOrder: () => GRADES, skillByKey: (k) => SKILLS[k], questionsFor: () => [], maxPerSkill: 3, mastery: 0.75, recheckPerSkill: 2, recheckKnownSample: 4 });
  const st = e2.begin(e2.newState(all(), NOW, { id: 'c' }), NOW);
  assert.strictEqual(st.blocks.length, 12);
  assert.ok(st.skills.every((s) => s.unchecked));
});
ok('blocks play in order; the last passed level opens the re-check', () => {
  const st = engine.begin(engine.newState(all(), NOW, { id: 'd' }), NOW);
  runCheck(st, (k) => k !== 'g1|1' && k !== 'g2|1');
  assert.strictEqual(engine.position(st).k, 1);
  for (const b of st.blocks) {
    for (const l of b.levels) assert.strictEqual(engine.levelPassed(b, l, NOW).blockDone, l === 3);
    engine.afterBlock(st, NOW);
  }
  assert.strictEqual(st.phase, 'recheck');
  const keys = new Set(st.recheck.items.map((i) => i.key));
  assert.ok(keys.has('g1|1') && keys.has('g2|1'));
  assert.strictEqual(st.recheck.items.filter((i) => i.role === 'known').length, 4);
});
ok('re-check: a miss sends back that skill only; the next re-check asks only about it; passing finishes', () => {
  const st = engine.begin(engine.newState(all(), NOW, { id: 'e' }), NOW);
  runCheck(st, (k) => k !== 'g1|1' && k !== 'g2|1');
  for (const b of st.blocks) { b.levels.forEach((l) => engine.levelPassed(b, l, NOW)); engine.afterBlock(st, NOW); }
  const first = st.recheck.items.slice();
  for (const it of first) engine.recordRecheck(st, it, it.key !== 'g2|1', NOW);
  assert.strictEqual(st.phase, 'route');
  assert.deepStrictEqual(st.blocks.filter((b) => b.status !== 'done').map((b) => b.key), ['g2|1']);
  const b = st.blocks.find((x) => x.key === 'g2|1');
  b.levels.forEach((l) => engine.levelPassed(b, l, NOW)); engine.afterBlock(st, NOW);
  assert.deepStrictEqual([...new Set(st.recheck.items.map((i) => i.key))], ['g2|1']);
  assert.ok(st.recheck.items.every((i) => !first.some((f) => f.key === i.key && f.qid === i.qid)), 'fresh questions only');
  for (const it of st.recheck.items) engine.recordRecheck(st, it, true, NOW);
  assert.strictEqual(st.phase, 'done');
});
ok('a sampled known skill that fails the re-check becomes a new block', () => {
  const st = engine.begin(engine.newState(all(), NOW, { id: 'f' }), NOW);
  runCheck(st, (k) => k !== 'g1|1');
  const b = st.blocks[0]; b.levels.forEach((l) => engine.levelPassed(b, l, NOW)); engine.afterBlock(st, NOW);
  const known = st.recheck.items.find((i) => i.role === 'known');
  for (const it of st.recheck.items) engine.recordRecheck(st, it, it.key !== known.key, NOW);
  assert.ok(st.blocks.some((x) => x.key === known.key && x.from === 'recheck' && x.status === 'todo'));
});
console.log(`\nall passed (${n})`);
