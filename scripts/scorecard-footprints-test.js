/**
 * Checks the Phase 4 footprint design list (scripts/lib/scorecard-footprints.js, docs/SCORECARD-90.md section 11): every footprint reads real scorecard
 * measures, has a kind with stated validities, costs seconds only if charged, names files that exist, and the ten worst measures of section 10.4 are all
 * covered. Also runs the drift toy (scripts/scorecard-drift-sim.js) small and checks the direction it claims. No database, no network.
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { STATS } = require('../services/scorecard/stats');
const { KINDS, FOOTPRINTS } = require('./lib/scorecard-footprints');

const ROOT = path.join(__dirname, '..');
const ids = new Set(STATS.map((s) => s.id));
const seen = new Set();
for (const f of FOOTPRINTS) {
  assert(!seen.has(f.id), `duplicate footprint ${f.id}`); seen.add(f.id);
  const k = KINDS[f.kind]; assert(k, `${f.id}: unknown kind ${f.kind}`);
  assert(k.rho1 > 0 && k.rhoInf >= k.rho1 && k.rhoInf <= 0.3, `${f.id}: validities must be conservative (rhoInf <= 0.3, validity .55)`);
  assert(f.reads.length && f.reads.every((m) => ids.has(m)), `${f.id}: reads an unknown measure`);
  assert(f.cap > 0 && Number.isFinite(f.cap), `${f.id}: cap`);
  assert(f.kind === 'VOL' ? f.sec === 0 : f.sec > 0 && f.sec <= 8, `${f.id}: only voluntary behaviour is free, a charged event costs 1 to 8 s`);
  assert(f.ui && f.why && f.file, `${f.id}: ui, why and file are required`);
  for (const p of f.file.match(/(?:services|routes|public|scripts)\/[\w./-]+\.js/g) || []) assert(fs.existsSync(path.join(ROOT, p)), `${f.id}: ${p} does not exist`);
}
const WORST10 = 'conceptual_bias,identity_alignment,cognitive_flexibility,competitive_drive,depth_breadth,productive_struggle,planning_tendency,emotional_engagement,intrinsic_motivation,integration_tendency'.split(',');
const covered = new Set(FOOTPRINTS.flatMap((f) => f.reads));
for (const m of WORST10) assert(covered.has(m), `worst-ten measure ${m} has no footprint`);
assert(covered.size >= 20, 'at least 20 measures have a footprint');

const r = spawnSync(process.execPath, [path.join(__dirname, 'scorecard-drift-sim.js'), '--learners=300', '--stab=0.8'], { encoding: 'utf8' });
assert.strictEqual(r.status, 0, r.stderr);
const row = (name) => (r.stdout.split('\n').find((l) => l.startsWith(name)) || '').trim().split(/\s+/).slice(-4).map(Number);
const never = row('never_forgets'); const right = row('kalman_right');
assert(right[3] < never[3], `a posterior that fades old evidence should beat one that never forgets at day 365 (${right[3]} vs ${never[3]})`);
console.log(`scorecard footprints ok: ${FOOTPRINTS.length} footprints, ${covered.size} measures covered, drift toy day 365 ${never[3]} -> ${right[3]} (SIMULATED)`);
