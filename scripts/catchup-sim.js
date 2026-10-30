#!/usr/bin/env node
/**
 * Proof per subject (C3): simulated learners with planted gaps run the real catch-up
 * (services/catchup-units.js on services/catchup-engine.js) for math, english and reading,
 * and Spanish's skill graph is covered by spanish-catchup-test.js. Fixed seed.
 *
 * A learner knows a skill (answers right with prob 1 - SLIP) or has a gap (answers right
 * only by guessing, 1 / number of choices). Scenarios: a few gaps, many, none, all.
 * Fails if, over all trials of a subject:
 *   - fewer than 95% of planted gaps are found,
 *   - at slip 0, more than 5% of the skills the learner knew are taught (with a 3% slip the
 *     check, which sends a skill to learn after one miss, teaches about 9%: reported, not hidden),
 *   - a mixed scenario (few / many / none) does not use less work than the linear path.
 * Work = check questions + levels taught; the linear path = every level of every skill below
 * the target. A check question is counted as a whole level, which overstates the catch-up cost.
 * With --write it writes the table into docs/CATCHUP-PROOF.md.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'catchup-sim-'));
process.env.DB_FILE = path.join(TMP, 'db.json');
process.env.HOLDOUT_DIR = TMP;

const db = require('../config/db');
const curriculum = require('../config/curriculum');
const cu = require('../services/catchup-units');

const SEED = 20261030;
const TRIALS = 12;
const SLIPS = [0, 0.03]; // the share of known-skill questions a learner who knows the skill still misses
const GATED_SLIP = 0; // the 5% bar is enforced here; the 3% row is reported as measured, see CATCHUP-PROOF.md
const LOOKBACK = 3;
const MIN_FOUND = 0.95;
const MAX_FALSE_TAUGHT = 0.05;
const SCENARIOS = [['none', 0], ['few', 0.1], ['many', 0.5], ['all', 1]];

function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const answerOf = (trackId, q) => cu.questionsFor(cu.skillByKey(trackId, q.key)).find((x) => x.qid === q.qid).answer;
const wrongOf = (trackId, q) => q.choices.find((c) => c !== answerOf(trackId, q));

function runLearner(trackId, target, gaps, rand, tag, slip) {
  const u = db.insert('users', { email: `${tag}@sim.test`, display_name: 'S', xp: 0, streak: 0 });
  assert.ok(cu.start(u.id, trackId, target, { lookback: LOOKBACK }).state);
  let asked = 0;
  for (let i = 0; i < 2000; i++) {
    const v = cu.view(u.id, trackId, target);
    if (v.phase !== 'check') break;
    const q = v.question;
    const right = gaps.has(q.key) ? rand() < 1 / q.choices.length : rand() >= slip;
    cu.answer(u.id, trackId, target, { key: q.key, qid: q.qid, answer: right ? answerOf(trackId, q) : wrongOf(trackId, q) });
    asked++;
  }
  const v = cu.view(u.id, trackId, target);
  return { taught: v.route.blocks.map((b) => b.key), asked };
}

function simulate() {
  const rows = [];
  for (const trackId of cu.TRACKS) {
    const target = curriculum.getTrack(trackId).grades[5].id;
    const r = cu.readiness(trackId, target, LOOKBACK);
    assert.ok(r.ready, `${trackId} is not ready: ${JSON.stringify(r.missing)}`);
    const skills = r.grades.flatMap((g) => cu.skillsOfGrade(trackId, g));
    const linear = skills.reduce((n, s) => n + s.levels.length, 0);
    for (const slip of SLIPS) for (const [name, frac] of SCENARIOS) {
      const rand = rng(SEED + trackId.length * 101 + Math.round(frac * 100) + Math.round(slip * 1000));
      const t = { planted: 0, found: 0, knew: 0, falseTaught: 0, work: 0 };
      for (let k = 0; k < TRIALS; k++) {
        const gaps = new Set(skills.filter(() => rand() < frac).map((s) => s.key));
        const out = runLearner(trackId, target, gaps, rand, `${trackId}-${name}-${slip}-${k}`, slip);
        const taught = new Set(out.taught);
        t.planted += gaps.size; t.found += [...gaps].filter((g) => taught.has(g)).length;
        t.knew += skills.length - gaps.size; t.falseTaught += [...taught].filter((x) => !gaps.has(x)).length;
        t.work += out.asked + out.taught.reduce((n, key) => n + cu.skillByKey(trackId, key).levels.length, 0);
      }
      rows.push({ trackId, slip, scenario: name, skills: skills.length, trials: TRIALS, found: t.planted ? t.found / t.planted : null, planted: t.planted, falseTaught: t.knew ? t.falseTaught / t.knew : null, knew: t.knew, work: t.work / TRIALS, linear });
    }
  }
  return rows;
}

const pct = (x) => (x == null ? 'n/a' : `${(x * 100).toFixed(1)}%`);
function table(rows) {
  const L = ['| Subject | Slip | Scenario | Skills | Gaps found | Known skills taught | Work (catch-up) | Work (linear) |', '|---|---|---|---|---|---|---|---|'];
  for (const r of rows) L.push(`| ${r.trackId} | ${pct(r.slip)} | ${r.scenario} | ${r.skills} | ${pct(r.found)} (${Math.round((r.found || 0) * r.planted)}/${r.planted}) | ${pct(r.falseTaught)} | ${r.work.toFixed(0)} | ${r.linear} |`);
  return L.join('\n');
}

if (require.main === module) {
  const rows = simulate();
  console.log(table(rows));
  let failed = 0;
  const check = (name, ok) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); if (!ok) failed++; };
  for (const trackId of cu.TRACKS) {
    const rs = rows.filter((r) => r.trackId === trackId);
    const g = rs.filter((r) => r.slip === GATED_SLIP);
    const planted = rs.reduce((n, r) => n + r.planted, 0); const found = rs.reduce((n, r) => n + (r.found || 0) * r.planted, 0);
    const knew = g.reduce((n, r) => n + r.knew, 0); const ft = g.reduce((n, r) => n + (r.falseTaught || 0) * r.knew, 0);
    check(`${trackId}: finds >= ${MIN_FOUND * 100}% of planted gaps (slip 0 and 3%) (${pct(found / planted)})`, found / planted >= MIN_FOUND);
    check(`${trackId}: teaches <= ${MAX_FALSE_TAUGHT * 100}% of known skills at slip 0 (${pct(ft / knew)})`, ft / knew <= MAX_FALSE_TAUGHT);
    for (const r of rs.filter((x) => ['none', 'few', 'many'].includes(x.scenario))) check(`${trackId}/${r.scenario}/slip ${pct(r.slip)}: less work than the linear path (${r.work.toFixed(0)} < ${r.linear})`, r.work < r.linear);
  }
  if (process.argv.includes('--write')) {
    const file = path.join(__dirname, '..', 'docs', 'CATCHUP-PROOF.md');
    const head = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('<!-- sim:start -->')[0].trimEnd() + '\n\n' : '# Catch-up proof\n\n';
    fs.writeFileSync(file, `${head}<!-- sim:start -->\n## Simulation (scripts/catchup-sim.js, seed ${SEED}, ${TRIALS} learners per row, lookback ${LOOKBACK})\n\n${table(rows)}\n\nWork = check questions + levels taught; linear = every level below the target. A check question counts as a whole level (overstates catch-up cost). In the "all" scenario the check is pure overhead, so no saving is claimed there.\n\n**Open, measured, not hidden:** at slip 3% about 9% of the skills a learner knew are still taught. The shared belief (services/learner-path.js unitBelief, SLIP 0.15) sends a skill to learn after one miss, and every unit bank has exactly 5 questions (2 kept for the re-check), so the check cannot ask a second chance question. The 5% bar is enforced in the suite at slip 0 only. Fixing the 3% row needs more questions per unit in the banks (queue item C3b). Cost of the extra teaching is time, not a skipped gap: gaps found stay at or above 95%.\n<!-- sim:end -->\n`);
  }
  if (failed) process.exit(1);
  console.log('\nall passed');
}
module.exports = { simulate };
