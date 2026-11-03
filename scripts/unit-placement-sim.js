#!/usr/bin/env node
/**
 * In-grade placement and gap-only path, planted-gap method (SIMULATED learners, not real ones).
 *
 *   node scripts/unit-placement-sim.js                      held-out seed, balanced, math + english + iq
 *   node scripts/unit-placement-sim.js --seed=dev           the development seed (the one used while tuning)
 *   node scripts/unit-placement-sim.js --track=iq --mode=quick --hard
 *   node scripts/unit-placement-sim.js --write              append a dated section to docs/PLACEMENT-ACCURACY-AFTER.md
 *   node scripts/unit-placement-sim.js --gate               exit 1 when a floor is missed (the check `npm test` runs, small sample)
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

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'unit-placement-sim-'));
process.env.DB_FILE = path.join(TMP, 'db.json');
process.env.HOLDOUT_DIR = TMP;

const db = require('../config/db');
const curriculum = require('../config/curriculum');
const unitPlacement = require('../services/unit-placement');
const { questionSeconds } = require('../services/placement-seconds');
const learnerPath = require('../services/learner-path');
const cu = require('../services/catchup-units');

const arg = (name, fallback) => { const a = process.argv.find((x) => x === `--${name}` || x.startsWith(`--${name}=`)); return a === undefined ? fallback : (a.includes('=') ? a.split('=')[1] : true); };
const SEEDS = { dev: 20261101, held: 20261102 };
const SEED_NAME = arg('seed', 'held');
const SEED = SEEDS[SEED_NAME] || Number(SEED_NAME);
const HARD = !!arg('hard', false);
// The mode's in-grade clock (unitPlacement.MODES[mode].minutes) ends a walk as it does in the app (routes/placement.js deadline): each learner
// answers at a pace of their own (lognormal around the estimate, sd 0.28, as scripts/placement-sim.js) x the question's estimated seconds.
// --no-clock turns it off, which is how the first simulations of this stage (26 s a question, no clock) ran.
const CLOCK = !arg('no-clock', false);
if (arg('clock-min', null)) for (const part of String(arg('clock-min')).split(',')) { const [m, min] = part.split(':'); unitPlacement.MODES[m].minutes = Number(min); }
const WALK_ONLY = !!arg('walk-only', false); // tuning: skip the gap-only path and quick checks; only the placement columns mean anything
// --limits=quick:max:min:confidence,balanced:max:min:confidence tries other in-grade walk limits without editing the service (as scripts/placement-sim.js).
if (arg('limits', null)) for (const part of String(arg('limits')).split(',')) { const [m, max, min, sure] = part.split(':'); Object.assign(unitPlacement.MODES[m], { max: Number(max), min: Number(min), confidence: Number(sure), sure: Number(sure) }); }
const WIDTH = HARD ? 0.45 : 0.3;
const SLIP = 0.03;
const ITEM_SD = HARD ? 0.4 : 0;
const SECONDS = 26;
const PER_CELL = Number(arg('learners', 24)); // learners per grade and hole rate
const HOLE_RATES = [0, 0.1, 0.3];

function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function normal(rand) { return Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand()); }
const hashNoise = (key) => { let h = 2166136261; for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return rng(h)(); };

/** The grades of a track that have a bank, thinned to `n` spread across the track. */
function gradesOf(trackId, n) {
  const all = curriculum.getTrack(trackId).grades.map((g) => g.id).filter((id) => unitPlacement.available(trackId, id));
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
  const pace = Math.exp(0.28 * normal(rng(Math.floor(hashNoise(`pace|${tag}`) * 4294967296))));
  let walkSeconds = 0; // the walk's time, ESTIMATED from each question's words (services/placement-seconds.js), not timed on people
  for (let i = 0; i < 200; i++) {
    if (CLOCK && walkSeconds >= unitPlacement.MODES[mode].minutes * 60) break;
    const next = unitPlacement.nextQuestion(trackId, gradeId, mode, answered);
    if (!next) break;
    walkSeconds += questionSeconds(units[next.unit - 1].questions[next.slot], trackId) * pace;
    answered.push({ ...next, correct: respond(next.unit, next.slot) });
  }
  const result = unitPlacement.score(trackId, gradeId, answered);
  if (WALK_ONLY) return { placed: result.unit, asked: answered.length, checks: 0, status: {}, walkSeconds };
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
  return { placed: result.unit, asked: answered.length, checks, status, walkSeconds };
}

function simulate(trackId, mode, gradeCount) {
  const out = { rows: [], total: {} };
  const byHole = HOLE_RATES.map(() => ({ n: 0, w: 0, e: 0 }));
  const walkMinutes = [];
  const t = { n: 0, within1: 0, exact: 0, err: 0, asked: 0, checks: 0, wasted: 0, lost: 0, planted: 0, onPath: 0, below: 0, belowReopened: 0, known: 0, falseGap: 0, fullPath: 0, neededMin: 0, falseSkipLearners: 0, knownMin: 0, within1None: 0 };
  for (const gradeId of gradesOf(trackId, gradeCount)) {
    const units = unitPlacement.unitsFor(trackId, gradeId);
    const U = units.length;
    const minutes = cu.skillsOfGrade(trackId, gradeId).map((s) => s.minutes);
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
        walkMinutes.push(r.walkSeconds / 60);
        byHole[hi].n++; byHole[hi].w += Math.abs(r.placed - start) <= 1 ? 1 : 0; byHole[hi].e += r.placed - start;
        t.n++; t.within1None += start <= 2 ? 1 : 0; t.within1 += Math.abs(r.placed - start) <= 1 ? 1 : 0; t.exact += r.placed === start ? 1 : 0; t.err += r.placed - start;
        t.asked += r.asked; t.checks += r.checks; t.wasted += wasted; t.lost += lost; t.planted += planted; t.onPath += found; t.below += below; t.belowReopened += belowOpen;
        t.known += known; t.falseGap += falseGap; t.fullPath += minutes.reduce((a, b) => a + b, 0); t.neededMin += needed; t.falseSkipLearners += lost > 0 ? 1 : 0; t.knownMin += knownMin;
      }
    });
    out.rows.push(gradeId);
  }
  const h = (m) => m / 60;
  out.total = {
    walkMedianMin: (walkMinutes.sort((a, b) => a - b)[Math.floor(walkMinutes.length / 2)]), walkP90Min: walkMinutes[Math.floor(walkMinutes.length * 0.9)],
    byHole: byHole.map((b, i) => ({ holeRate: HOLE_RATES[i], within1: b.w / b.n, meanErr: b.e / b.n })),
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

// Floors for --gate: set from the first held-out run, with a margin, never raised to make a number look better.
const FLOORS = { within1: 0.75, gapsOnPath: 0.9, falseGaps: 0.1, lostH: 3 };

const KEEP_MARK = '<!-- unit-sim:start -->';

/** The dated section for docs/PLACEMENT-ACCURACY-AFTER.md, from the rows of each configuration. */
function section(configs) {
  const iq = configs[0].rows.find((r) => r.track === 'iq' && r.mode === 'balanced');
  const L = [`${KEEP_MARK}`, '', '## 2026-11-02: in-tier placement and gap-only path, planted-gap proof (SIMULATED learners, not real ones)', '',
    'Generated by `node scripts/unit-placement-sim.js --write`. Every number below comes from simulated learners with a known true frontier and planted holes',
    '(see the header of that script for the response model); none of it is a measurement of a real learner. The walk, the evidence model, the quick checks and the',
    'gap-only path are the app\'s own code (services/unit-placement.js, services/learner-path.js) run on a throwaway data file.',
    '',
    '**What is new.** IQ now has an in-tier placement: each of its 12 tiers (100-234 hours) is cut into 9 clusters of whole checkpoint units, each with 7 questions',
    'built by the tier\'s own generators (content/unit-placement/iq.json, scripts/generate-iq-unit-placement.js). Placement uses the same adaptive walk as math and',
    'English, stops on the mode\'s clock (Quick 6 min, Balanced 13 min, Accurate 25 min for this stage), and the clusters it passes over get quick checks; a hole found',
    'there goes on the gap-only path. IQ is also in "Catch me up to this tier" (services/catchup-units.js).',
    '',
    '**Before / after for IQ** (balanced, held-out seed, standard learners): before, a learner worked a tier from its first lesson, so every known unit was worked:',
    iq ? `${iq.knownH.toFixed(1)} h of a ${iq.tierH.toFixed(0)} h tier on average, ${pct(iq.within1None)} of learners already started within 1 cluster of their true start, and no hole below the start was ever looked for.` : '(IQ row missing)',
    iq ? `After: ${iq.wastedH.toFixed(1)} h on known material, ${iq.lostH.toFixed(2)} h of needed material wrongly skipped, ${pct(iq.within1)} within 1 cluster, ${pct(iq.gapsOnPath)} of planted holes on the path, ${pct(iq.falseGaps)} false gaps.` : '',
    'Math and English in-grade placement and catch-up were not changed; they are re-measured here on today\'s code (the first in-grade planted-gap numbers for them).',
    ''];
  for (const c of configs) L.push(`### ${c.title}`, '', c.note, '', table(c.rows), '');
  L.push('**Reading the tables.** "Wasted h on known" is what the gap-only path still spends on units the learner already knew (in brackets: what a path with no',
    'placement would spend). "Lost h" is needed material (a hole or an unfinished unit) the path marks known: the false skip, the mistake the design most wants to avoid.',
    '"Gaps below placed point found" counts only holes the placement skipped over and a quick check reopened; "planted gaps on path" also counts holes at or after the',
    'placed unit, which are worked anyway. "False gaps" are known units sent back to learn. Minutes assume 26 s a question (the quick check\'s figure).',
    '',
    '**Limits, stated plainly.** (1) Simulated learners, not people. (2) IQ questions are generator items positioned by the course\'s own difficulty ramp, not judge-calibrated',
    'points; adjacent clusters differ by only about 0.2 difficulty points, so the HARD table (wider learner slope, every item moved by a fixed error) is the one to',
    'trust for IQ. (3) An IQ question measures "can already do the work this stretch trains" (fine for skipping it), not intelligence; the product still makes no IQ claim.',
    '(4) The development seed was used to choose the IQ walk shape (width 0.45, reliable 0.3, rounding unchanged); the held-out seed was not touched while tuning. (5) The sim places learners by question position and never reads a question, so it says nothing about whether a key is right: that rests on the generator audit (scripts/iq-template-audit.js, clean) and a blind re-solve of all 756 IQ bank questions with the key withheld (Nemotron Ultra, free: 4 questions it disagreed with were dropped, then 756 of 756 agreed).', '');
  return L.join('\n');
}

if (require.main === module) {
  const tracks = String(arg('track', 'math,english,iq')).split(',');
  const gate = !!arg('gate', false);
  const gradeCount = Number(arg('grades', gate ? 3 : 6));
  const runOne = (modes) => tracks.flatMap((trackId) => modes.map((mode) => simulate(trackId, mode, trackId === 'iq' && !gate ? 12 : gradeCount)));
  if (arg('write', false)) {
    // Fixed set: held-out seed (all three modes), held-out HARD, and the development seed, each in a child process so the module-level settings differ.
    const { spawnSync } = require('child_process');
    const run = (extra) => {
      const r = spawnSync(process.execPath, [__filename, '--json', ...extra], { encoding: 'utf8', maxBuffer: 1 << 26 });
      const m = /^ROWS (.*)$/m.exec(r.stdout || '');
      if (!m) throw new Error(`sim failed: ${(r.stderr || r.stdout).slice(-300)}`);
      return JSON.parse(m[1]);
    };
    const configs = [
      { title: 'Held-out seed, standard learners (slope 0.3 unit, exact item positions), all modes', note: `Seed ${SEEDS.held}; ${PER_CELL} learners per grade and hole rate (0, 10%, 30% of finished units are holes); math and English: 6 grades spread across the track, IQ: all 12 tiers.`, rows: run(['--seed=held', '--mode=quick,balanced,accurate']) },
      { title: 'Held-out seed, HARD learners (slope 0.45 unit, items moved by a fixed error of sd 0.4 unit), balanced', note: 'Same learners with a wider slope and an error on every item position, which is what an uncalibrated bank is up against.', rows: run(['--seed=held', '--hard', '--mode=balanced']) },
      { title: 'Development seed (the one used while tuning), standard, balanced', note: `Seed ${SEEDS.dev}. Shown so the gap between the tuned seed and the held-out one is visible.`, rows: run(['--seed=dev', '--mode=balanced']) },
    ];
    const file = path.join(__dirname, '..', 'docs', 'PLACEMENT-ACCURACY-AFTER.md');
    const old = fs.readFileSync(file, 'utf8');
    fs.writeFileSync(file, `${old.split(KEEP_MARK)[0].trimEnd()}\n\n${section(configs)}`);
    console.log('wrote the dated section to docs/PLACEMENT-ACCURACY-AFTER.md');
    process.exit(0);
  }
  const modes = String(arg('mode', 'balanced')).split(',');
  const rows = runOne(modes);
  console.log(`unit-placement-sim seed=${SEED_NAME}(${SEED}) ${HARD ? 'HARD (wider slope, item error)' : 'standard'} ${PER_CELL} learners per grade and hole rate`);
  console.log(table(rows));
  for (const r of rows) console.log(`walk time (estimated from words) ${r.track}/${r.mode}: median ${r.walkMedianMin.toFixed(1)} min, p90 ${r.walkP90Min.toFixed(1)} min`);
  for (const r of rows) console.log(`by hole rate ${r.track}/${r.mode}: ` + r.byHole.map((b) => `${Math.round(b.holeRate * 100)}% holes -> within 1 ${pct(b.within1)} (mean error ${b.meanErr.toFixed(2)})`).join('; '));
  let failed = 0;
  if (gate) {
    for (const r of rows) {
      const ok = r.within1 >= FLOORS.within1 && (r.gapsOnPath == null || r.gapsOnPath >= FLOORS.gapsOnPath) && (r.falseGaps == null || r.falseGaps <= FLOORS.falseGaps) && r.lostH <= FLOORS.lostH;
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${r.track}/${r.mode}: within1 ${pct(r.within1)} (>= ${pct(FLOORS.within1)}), gaps on path ${pct(r.gapsOnPath)} (>= ${pct(FLOORS.gapsOnPath)}), false gaps ${pct(r.falseGaps)} (<= ${pct(FLOORS.falseGaps)}), lost ${r.lostH.toFixed(2)} h (<= ${FLOORS.lostH})`);
      if (!ok) failed++;
    }
  }
  if (arg('json', false)) console.log(`ROWS ${JSON.stringify(rows)}`);
  if (failed) process.exit(1);
  if (gate) console.log('\nall passed');
}
module.exports = { simulate, table, FLOORS };
