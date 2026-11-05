#!/usr/bin/env node
/**
 * The extreme-learner generator (docs/EXTREME-LEARNERS.md; SIMULATED learners): fast and deterministic.
 *   1. reproducible: the same (seed, index) gives the same learner, a different seed gives a different one
 *   2. every kind appears in a block of ten, every trait id is present and in 2..98, ages are 8..70, ELL learners are flagged
 *   3. the tails really are tails: tail_hi/tail_lo/contradict/all_hi/all_lo learners have traits in the stated ranges
 *   4. the whole space is covered over many draws (some learner above 95 and below 5 on every trait)
 *   5. contradictory mixes name existing stats; the mirror and writer profile helpers work
 *   6. the sim's --extreme flag is off by default (the default sim and its gate are unchanged)
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const X = require('./lib/extreme-learners');
const { STATS } = require('../services/scorecard/stats');

const ids = new Set(STATS.map((s) => s.id));
// 1
const a = X.learner(424242, 7); const b = X.learner(424242, 7);
assert.deepStrictEqual(a, b, 'same (seed, index) gives the same learner');
assert.notDeepStrictEqual(X.learner(424243, 7).traits, a.traits, 'another seed gives another learner');
assert.deepStrictEqual(X.generate(5, 12), X.generate(5, 12));
// 2
const block = X.generate(99, 10);
assert.deepStrictEqual([...new Set(block.map((l) => l.kind))].sort(), [...new Set(X.KINDS)].sort(), 'every kind in a block of ten');
const many = X.generate(31415, 600);
for (const L of many) {
  assert.strictEqual(Object.keys(L.traits).length, STATS.length, 'every trait present');
  for (const [id, v] of Object.entries(L.traits)) { assert(ids.has(id), id); assert(v >= 2 && v <= 98, `${id} ${v}`); }
  assert(L.age >= 8 && L.age <= 70, `age ${L.age}`);
  assert(L.hobbies.length <= 3 && L.dislikes.length <= 3 && L.difficulties.length <= 2);
  if (L.kind === 'ell') assert(L.ell && L.language !== 'English');
}
// 3
const tails = (L) => X.tailsOf(L);
for (const L of many.filter((l) => l.kind === 'tail_hi')) assert(Object.values(tails(L)).filter((s) => s === 'hi').length >= 3, 'tail_hi has at least three high-tail traits');
for (const L of many.filter((l) => l.kind === 'tail_lo')) assert(Object.values(tails(L)).filter((s) => s === 'lo').length >= 3, 'tail_lo has at least three low-tail traits');
for (const L of many.filter((l) => l.kind === 'age_young')) assert(L.age <= 10, 'age_young is 8-10');
for (const L of many.filter((l) => l.kind === 'age_old')) assert(L.age >= 62, 'age_old is 62-70');
const corner = X.generate(1, 40, { corners: true }).filter((l) => l.kind === 'all_hi' || l.kind === 'all_lo');
assert(corner.length >= 1, 'corners option yields corner learners');
for (const L of corner) { const hi = L.kind === 'all_hi'; assert(Object.values(L.traits).every((v) => (hi ? v >= 90 : v <= 9)), 'corner learner is at one tail on every trait'); }
const mixed = many.filter((l) => l.kind === 'contradict');
assert(mixed.length > 30 && new Set(mixed.map((l) => l.mix)).size >= 8, 'contradictory mixes vary');
for (const L of mixed) { const m = X.MIXES[L.mix]; for (const id of m.hi) assert(L.traits[id] >= 90, `${L.mix} ${id} high`); for (const id of m.lo) assert(L.traits[id] <= 9, `${L.mix} ${id} low`); }
// 4
for (const id of X.IDS) { assert(many.some((l) => l.traits[id] >= 95), `${id} reaches the top`); assert(many.some((l) => l.traits[id] <= 5), `${id} reaches the bottom`); }
const rnd = many.filter((l) => l.kind === 'random'); const rm = rnd.reduce((s, l) => s + X.IDS.reduce((t, id) => t + l.traits[id], 0) / X.IDS.length, 0) / rnd.length;
assert(Math.abs(rm - 50) < 3, 'random learners are spread over the whole range');
assert(many.some((l) => l.hobbies.some((h) => !/soccer|music|basketball/.test(h))), 'unusual hobbies appear');
// 5
for (const m of Object.values(X.MIXES)) for (const id of [...m.hi, ...m.lo]) assert(ids.has(id), `mix names unknown stat ${id}`);
const wp = X.writerProfile(mixed[0]); assert(wp.directives.length > 0 && wp.directives.every((d) => d.instruction), 'writer profile has directives');
assert(/age/.test(X.describe(mixed[0])));
// 6
const sim = fs.readFileSync(path.join(__dirname, 'scorecard-recovery-sim.js'), 'utf8');
assert(/opt\('extreme', 0\)/.test(sim), 'the sim\'s --extreme defaults to off');
console.log('extreme-learners-test ok');
