#!/usr/bin/env node
/**
 * In-grade placement and gap-only path, planted-gap method (SIMULATED learners, not real ones).
 *
 *   node scripts/spanish-placement-sim.js                      held-out seed, balanced, math + english + iq
 *   node scripts/spanish-placement-sim.js --seed=dev           the development seed (the one used while tuning)
 *   node scripts/spanish-placement-sim.js --track=iq --mode=quick --hard
 *   node scripts/spanish-placement-sim.js --only=40,47,50,53,54,55,56,57   exactly those grades (by number)
 *   node scripts/spanish-placement-sim.js --write              append a dated section to docs/PLACEMENT-ACCURACY-AFTER.md
 *   node scripts/spanish-placement-sim.js --gate               exit 1 when a floor is missed (the check `npm test` runs, small sample)
 *
 * A learner has a true frontier f (units finished, 0..units) and PLANTED HOLES: units below f it never learned
 * (it answers them at the guess rate). It sits the app's own in-grade walk (services/unit-placement.js nextQuestion/
 * score), then the app's own evidence model and quick checks (services/learner-path.js initFromPlacement, quickChecks,
 * recordCheck) on a temp copy of the database. Whatever the gap-only path ends up working is compared with the truth:
 *
 *   within 1 unit      |placed unit - first unfinished unit| <= 1
 *   wasted hours       time the path spends on units the learner knew (finished and not a hole)
 *   lost hours         time of units the learner needed (hole or unfinished) that the path marks known: a false skip
 *   gaps found         planted holes the path works (any) / holes below the placed point that the quick checks reopened
 *   false gaps         units the learner knew that the quick checks sent back to learn
 *
 * Response model (differs from the walk's own assumptions, like scripts/placement-sim.js): a unit question at
 * position p is answered right with the guess rate plus (1 - slip - guess) * logistic((f - p) / WIDTH). Default
 * WIDTH 0.3 units, slip 3%, item positions exact (the repo's convention: a best case for the bank). --hard widens
 * the learner's slope to 0.45 and moves every item by a fixed error (sd 0.4 unit), which is what an uncalibrated
 * bank is up against. Seconds per question: 26, the quick check's own figure (QUICK_CHECK_SECONDS).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'spanish-placement-sim-'));
process.env.DB_FILE = path.join(TMP, 'db.json');
process.env.HOLDOUT_DIR = TMP;

const db = require('../config/db');
const curriculum = require('../config/curriculum');
const unitPlacement = require('../services/unit-placement');
const learnerPath = require('../services/learner-path');

const arg = (name, fallback) => { const a = process.argv.find((x) => x === `--${name}` || x.startsWith(`--${name}=`)); return a === undefined ? fallback : (a.includes('=') ? a.split('=')[1] : true); };
const SEEDS = { dev: 20261101, held: 20261102 };
const SEED_NAME = arg('seed', 'held');
const SEED = SEEDS[SEED_NAME] || Number(SEED_NAME);
const HARD = !!arg('hard', false);
const WIDTH = HARD ? 0.45 : 0.3;
const SLIP = 0.03;
const ITEM_SD = HARD ? 0.4 : 0;
const SECONDS = 26;
const PER_CELL = Number(arg('learners', 24)); // learners per grade and hole rate
const HOLE_RATES = [0, 0.1, 0.3];

function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function normal(rand) { return Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand()); }
const hashNoise = (key) => { let h = 2166136261; for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return rng(h)(); };

/** Minutes of each bank unit: the sum of the curriculum levels (Est. Min) the unit spans. */
function unitMinutes(gradeId) {
  const grade = curriculum.getGrade('spanish', gradeId);
  return unitPlacement.unitsFor('spanish', gradeId).map((u) => grade.levels.filter((l) => l.level >= u.start && l.level <= u.end).reduce((n, l) => n + (Number(l.minutes) || 5), 0));
}

/** The grades of a track that have a bank, thinned to `n` spread across the track. */
function gradesOf(trackId, n) {
  const all = curriculum.getTrack(trackId).grades.map((g) => g.id).filter((id) => unitPlacement.available(trackId, id));
  // --only=40,47,50: exactly these grades (their number in the track), e.g. the grades whose bank was completed last.
  const only = arg('only', '');
  if (only && only !== true) {
    const ids = curriculum.getTrack(trackId).grades.map((g) => g.id);
    return String(only).split(',').map((k) => ids[Number(k) - 1]).filter((id) => id && unitPlacement.available(trackId, id));
  }
  if (all.length <= n) return all;
  return Array.from({ length: n }, (_, i) => all[Math.round((i * (all.length - 1)) / (n - 1))]);
}

function oneLearner({ trackId, gradeId, mode, f, holes, rand, tag }) {
  const units = unitPlacement.unitsFor(trackId, gradeId);
  const noise = (u, slot) => (ITEM_SD ? (hashNoise(`${gradeId}|${u}|${slot}`) - 0.5) * ITEM_SD * 3.46 : 0);
  const respond = (u, slot) => {
    const q = units[u - 1].questions[slot];
    const guess = 1 / q.choices.length;
    if (holes.has(u)) return rand() < guess;
    const p = unitPlacement.pointOf(q, u) + noise(u, slot);
    const known = 1 / (1 + Math.exp(-(f - p) / WIDTH));
    return rand() < guess + (1 - SLIP - guess) * known;
  };
  const answered = [];
  for (let i = 0; i < 200; i++) {
    const next = unitPlacement.nextQuestion(trackId, gradeId, mode, answered);
    if (!next) break;
    answered.push({ ...next, correct: respond(next.unit, next.slot) });
  }
  const result = unitPlacement.score(trackId, gradeId, answered);
  const user = db.insert('users', { email: `${tag}@sim.test`, display_name: 'S', xp: 0, streak: 0 });
  const enr = db.insert('enrollments', { user_id: user.id, track_id: trackId, grade_id: gradeId, current_level: 1, path_length: curriculum.getGrade(trackId, gradeId).pathLength });
  learnerPath.initFromPlacement(db.byId('enrollments', enr.id), result, answered);
  let checks = 0;
  for (let i = 0; i < 400; i++) {
    const fresh = db.byId('enrollments', enr.id);
    const next = unitPlacement.nextCheck(learnerPath.quickChecks(fresh));
    if (!next) break;
    learnerPath.recordCheck(fresh, next.unit, respond(next.unit, next.slot), { slot: next.slot, source: 'quick_check' });
    checks++;
  }
  const status = {};
  for (const r of learnerPath.unitRows(db.byId('enrollments', enr.id))) status[r.unit] = r.status;
  return { placed: result.unit, asked: answered.length, checks, status };
}

function simulate(trackId, mode, gradeCount) {
  const out = { rows: [], total: {} };
  const t = { n: 0, within1: 0, exact: 0, err: 0, asked: 0, checks: 0, wasted: 0, lost: 0, planted: 0, onPath: 0, below: 0, belowReopened: 0, known: 0, falseGap: 0, fullPath: 0, neededMin: 0, falseSkipLearners: 0, knownMin: 0, within1None: 0 };
  for (const gradeId of gradesOf(trackId, gradeCount)) {
    const units = unitPlacement.unitsFor(trackId, gradeId);
    const U = units.length;
    const minutes = unitMinutes(gradeId);
    HOLE_RATES.forEach((rate, hi) => {
      const rand = rng(SEED + gradeId.length * 7919 + hi * 104729 + trackId.length * 31);
      for (let k = 0; k < PER_CELL; k++) {
        const f = rand() * U;
        const F = Math.floor(f);
        const holes = new Set();
        for (let u = 1; u <= F; u++) if (rand() < rate) holes.add(u);
        const r = oneLearner({ trackId, gradeId, mode, f, holes, rand, tag: `${trackId}-${gradeId}-${hi}-${k}-${mode}` });
        const start = F + 1;
        const onPath = (u) => !['known', 'done'].includes(r.status[u]);
        let wasted = 0; let lost = 0; let planted = 0; let found = 0; let known = 0; let falseGap = 0; let below = 0; let belowOpen = 0; let needed = 0; let knownMin = 0;
        for (let u = 1; u <= U; u++) {
          const needs = holes.has(u) || u > F;
          if (needs) needed += minutes[u - 1];
          if (u <= F && !holes.has(u)) { known++; knownMin += minutes[u - 1]; if (onPath(u)) wasted += minutes[u - 1]; if (u < r.placed && r.status[u] === 'learn') falseGap++; }
          if (needs && !onPath(u)) lost += minutes[u - 1];
          if (holes.has(u)) { planted++; if (onPath(u)) found++; if (u < r.placed) { below++; if (r.status[u] === 'learn') belowOpen++; } }
        }
        t.n++; t.within1None += start <= 2 ? 1 : 0; t.within1 += Math.abs(r.placed - start) <= 1 ? 1 : 0; t.exact += r.placed === start ? 1 : 0; t.err += r.placed - start;
        t.asked += r.asked; t.checks += r.checks; t.wasted += wasted; t.lost += lost; t.planted += planted; t.onPath += found; t.below += below; t.belowReopened += belowOpen;
        t.known += known; t.falseGap += falseGap; t.fullPath += minutes.reduce((a, b) => a + b, 0); t.neededMin += needed; t.falseSkipLearners += lost > 0 ? 1 : 0; t.knownMin += knownMin;
      }
    });
    out.rows.push(gradeId);
  }
  const h = (m) => m / 60;
  out.total = {
    track: trackId, mode, learners: t.n, grades: out.rows.length,
    within1: t.within1 / t.n, within1None: t.within1None / t.n, exact: t.exact / t.n, meanErr: t.err / t.n,
    questions: t.asked / t.n, checks: t.checks / t.n, minutes: ((t.asked + t.checks) * SECONDS) / 60 / t.n,
    wastedH: h(t.wasted) / t.n, lostH: h(t.lost) / t.n, tierH: h(t.fullPath) / t.n, knownH: h(t.knownMin) / t.n, neededH: h(t.neededMin) / t.n,
    planted: t.planted, gapsOnPath: t.planted ? t.onPath / t.planted : null,
    below: t.below, belowFound: t.below ? t.belowReopened / t.below : null,
    knownUnits: t.known, falseGaps: t.known ? t.falseGap / t.known : null, falseSkipLearners: t.falseSkipLearners / t.n,
  };
  return out.total;
}

const pct = (x) => (x == null ? 'n/a' : `${(x * 100).toFixed(1)}%`);
function table(rows) {
  const L = ['| Subject | Mode | Learners | Within 1 unit | Exact | Mean error (units) | Questions + checks | Minutes | Wasted h on known (none placed: all known) | Lost h (false skip) | Tier h | Planted gaps on path | Gaps below placed point found | False gaps |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const r of rows) L.push(`| ${r.track} | ${r.mode} | ${r.learners} | ${pct(r.within1)} | ${pct(r.exact)} | ${r.meanErr >= 0 ? '+' : ''}${r.meanErr.toFixed(2)} | ${r.questions.toFixed(1)} + ${r.checks.toFixed(1)} | ${r.minutes.toFixed(1)} | ${r.wastedH.toFixed(2)} (${r.knownH.toFixed(2)}) | ${r.lostH.toFixed(2)} | ${r.tierH.toFixed(0)} | ${pct(r.gapsOnPath)} (${r.planted}) | ${pct(r.belowFound)} (${r.below}) | ${pct(r.falseGaps)} |`);
  return L.join('\n');
}

// Floors for --gate: the first held-out run, with a margin; never raised to make a number look better.
const FLOORS = { within1: 0.8, gapsOnPath: 0.9, falseGaps: 0.1, lostH: 3 };

if (require.main === module) {
  const gate = !!arg('gate', false);
  const gradeCount = Number(arg('grades', gate ? 4 : 10));
  const modes = String(arg('mode', gate ? 'balanced' : 'quick,balanced,accurate')).split(',');
  const rows = modes.map((mode) => simulate('spanish', mode, gradeCount));
  console.log('spanish-placement-sim seed=' + SEED_NAME + '(' + SEED + ') ' + (HARD ? 'HARD' : 'standard') + ' ' + PER_CELL + ' learners per grade and hole rate');
  console.log(table(rows));
  let failed = 0;
  if (gate) {
    for (const r of rows) {
      const ok = r.within1 >= FLOORS.within1 && (r.gapsOnPath == null || r.gapsOnPath >= FLOORS.gapsOnPath) && (r.falseGaps == null || r.falseGaps <= FLOORS.falseGaps) && r.lostH <= FLOORS.lostH;
      console.log((ok ? 'ok   ' : 'FAIL ') + r.mode + ': within1 ' + pct(r.within1) + ', gaps on path ' + pct(r.gapsOnPath) + ', false gaps ' + pct(r.falseGaps) + ', lost ' + r.lostH.toFixed(2) + ' h');
      if (!ok) failed++;
    }
  }
  if (arg('json', false)) console.log('ROWS ' + JSON.stringify(rows));
  if (failed) process.exit(1);
  if (gate) console.log('\nall passed');
}
module.exports = { simulate, table, FLOORS, unitMinutes };
