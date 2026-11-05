#!/usr/bin/env node
/**
 * Stratified scorecard report (docs/SCORECARD-90.md section 12; SIMULATED proxies, not diagnoses): the subgroup definitions and the flags' defaults.
 *   1. every shifted id exists in the scorecard's stats, and every shift or spread is a finite number
 *   2. assign(): ages stripe evenly; profile shares come out near PROFILE_SHARE; reasoning shifts are zero for the dyslexia-like and English-learner proxies
 *   3. transform(): shifts add and spreads multiply across an age band and a profile
 *   4. the sim and the measure script keep their defaults: --strata is off, so drawTruth has no stratum path and the default dump has no age or profile
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { STATS } = require('../services/scorecard/stats');
const SL = require('./lib/scorecard-strata');

const ids = new Set(STATS.map((s) => s.id));
for (const [name, def] of [...Object.entries(SL.AGE_PROFILES), ...Object.entries(SL.PROFILE_DEFS)]) {
  for (const m of [def.shift, def.spread]) for (const [k, v] of Object.entries(m)) { assert(k === '*' || ids.has(k), `${name}: unknown measure ${k}`); assert(Number.isFinite(v), `${name}.${k} not finite`); }
}
const N = 4000; const ageCount = {}; const profCount = {}; let seed = 12345; const u = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
for (let i = 0; i < N; i++) { const a = SL.assign(i, u()); ageCount[a.age] = (ageCount[a.age] || 0) + 1; if (a.profile) profCount[a.profile] = (profCount[a.profile] || 0) + 1; }
for (const b of SL.AGES) assert.strictEqual(ageCount[b], N / SL.AGES.length, 'ages stripe evenly');
for (const p of SL.PROFILES) assert(Math.abs(profCount[p] / N - SL.PROFILE_SHARE[p]) < 0.02, `profile share ${p}`);
for (const p of ['dyslexia', 'ell']) for (const id of 'deductive_trajectory,inductive_trajectory,pattern_detection,logical_rigor'.split(',')) assert.strictEqual(SL.transform('30-59', p).dz(id) - SL.transform('30-59', null).dz(id), 0, `${p} reasoning intact (${id})`);
const t = SL.transform('60+', 'adhd');
assert(Math.abs(t.dz('working_memory_span') - (-0.6 - 0.5)) < 1e-9, 'shifts add');
assert(Math.abs(t.sp('rush_tendency') - 1.1 * 1.3) < 1e-9, 'spreads multiply');
assert(SL.transform('30-59', null).sp('persistence') === 1);
const sim = fs.readFileSync(path.join(__dirname, 'scorecard-recovery-sim.js'), 'utf8');
assert(/opt\('strata', 0\)/.test(sim), 'the sim\'s --strata defaults to off');
const meas = fs.readFileSync(path.join(__dirname, 'scorecard-90-measure.js'), 'utf8');
assert(/arg\('strata', '0'\) === '1'/.test(meas), 'the measure script\'s --strata defaults to off');
console.log('scorecard-strata-test: ok (' + Object.keys(SL.AGE_PROFILES).length + ' age bands, ' + SL.PROFILES.length + ' profiles)');
