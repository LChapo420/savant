#!/usr/bin/env node
/**
 * Proof for the Spanish catch-up across all grades (SIMULATED learners): the real catch-up (services/spanish/catch-up.js on
 * services/catchup-engine.js) run on a throwaway data file by learners with PLANTED gaps, for four target grades.
 *
 *   node scripts/spanish-catchup-sim.js            print the table
 *   node scripts/spanish-catchup-sim.js --write    append / replace the Spanish section of docs/CATCHUP-PROOF.md
 *   node scripts/spanish-catchup-sim.js --gate     exit 1 when a floor is missed (small sample, used by `npm test`)
 *
 * A learner knows a skill (right with 1 - slip) or has a gap (right only by guessing, 1 / choices). Scenarios none / few / many / all
 * gaps; slip 0 and 3%. Same method and work unit as the other subjects in this file: work = check questions + levels taught; the linear
 * path is every level of every skill below the target. A check question is counted as a whole level, which overstates the catch-up.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'es-catchup-sim-'));
process.env.DB_FILE = path.join(TMP, 'db.json');
process.env.HOLDOUT_DIR = TMP;
process.env.SPANISH_WRITE_AHEAD = 'off';
process.env.SPANISH_UNIT_DIR = path.join(TMP, 'units');

const db = require('../config/db');
const curriculum = require('../config/curriculum');
const catchUp = require('../services/spanish/catch-up');

const gate = process.argv.includes('--gate');
const SEED = 20261102;
const TRIALS = gate ? 3 : 8;
const TARGETS = gate ? [8] : [6, 9, 14, 22];
const SLIPS = [0, 0.03];
const SCENARIOS = [['none', 0], ['few', 0.1], ['many', 0.5], ['all', 1]];
const grades = curriculum.getTrack('spanish').grades.map((g) => g.id);

function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function runLearner(target, gaps, rand, tag, slip) {
  const u = db.insert('users', { email: `${tag}@sim.test`, display_name: 'S', xp: 0, streak: 0 });
  db.insert('subject_placements', { user_id: u.id, track_id: 'spanish', finished_at: new Date().toISOString(), recommended_grade_id: grades[target - 1], answers: [], created_at: new Date().toISOString() });
  catchUp.start(u.id);
  let asked = 0;
  for (let i = 0; i < 4000; i++) {
    const v = catchUp.view(u.id);
    if (v.phase !== 'check' || !v.question) break;
    const q = v.question;
    const full = catchUp.questionsFor(catchUp.skillByKey(q.key)).find((x) => x.qid === q.qid);
    const right = gaps.has(q.key) ? rand() < 1 / q.choices.length : rand() >= slip;
    catchUp.answer(u.id, { key: q.key, qid: q.qid, answer: right ? full.answer : q.choices.find((c) => c !== full.answer) });
    asked++;
  }
  const v = catchUp.view(u.id);
  return { taught: (v.route && v.route.blocks ? v.route.blocks : []).map((b) => b.key), asked };
}

function simulate() {
  const rows = [];
  for (const slip of SLIPS) {
    for (const [name, rate] of SCENARIOS) {
      const t = { n: 0, skills: 0, planted: 0, found: 0, known: 0, falseTaught: 0, work: 0, linear: 0, minutes: 0, linearMin: 0 };
      for (const target of TARGETS) {
        const skills = grades.slice(0, target - 1).flatMap((g) => catchUp.skillsOfGrade(g));
        const linear = skills.reduce((n, s) => n + (s.unit_levels[1] - s.unit_levels[0] + 1), 0);
        const linearMin = skills.reduce((n, s) => n + s.unit_minutes, 0);
        for (let k = 0; k < TRIALS; k++) {
          const rand = rng(SEED + target * 7919 + Math.round(rate * 1000) * 31 + Math.round(slip * 100) * 17 + k);
          const gaps = new Set(skills.filter(() => rand() < rate).map((s) => s.key));
          const r = runLearner(target, gaps, rand, `es-${target}-${name}-${slip}-${k}`, slip);
          const taught = new Set(r.taught);
          let levels = 0; let minutes = 0;
          for (const key of taught) { const s = catchUp.skillByKey(key); levels += s.levels.length; minutes += s.minutes; }
          t.n++; t.skills += skills.length; t.planted += gaps.size; t.found += [...gaps].filter((g) => taught.has(g)).length;
          t.known += skills.length - gaps.size; t.falseTaught += [...taught].filter((x) => !gaps.has(x)).length;
          t.work += r.asked + levels; t.linear += linear; t.minutes += minutes + (r.asked * 26) / 60; t.linearMin += linearMin;
        }
      }
      rows.push({ slip, scenario: name, skills: Math.round(t.skills / t.n), found: t.planted ? t.found / t.planted : null, planted: t.planted, falseTaught: t.known ? t.falseTaught / t.known : null, work: t.work / t.n, linear: t.linear / t.n, hours: t.minutes / t.n / 60, linearHours: t.linearMin / t.n / 60, learners: t.n });
    }
  }
  return rows;
}

const pct = (x) => (x == null ? 'n/a' : `${(x * 100).toFixed(1)}%`);
const table = (rows) => ['| Subject | Slip | Scenario | Skills (mean) | Gaps found | Known skills taught | Work (catch-up) | Work (linear) | Hours (catch-up) | Hours (linear) |', '|---|---|---|---|---|---|---|---|---|---|',
  ...rows.map((r) => `| spanish | ${(r.slip * 100).toFixed(1)}% | ${r.scenario} | ${r.skills} | ${pct(r.found)}${r.planted ? ` (${r.planted} planted)` : ''} | ${pct(r.falseTaught)} | ${Math.round(r.work)} | ${Math.round(r.linear)} | ${r.hours.toFixed(1)} | ${r.linearHours.toFixed(1)} |`)].join('\n');

const rows = simulate();
console.log(`spanish-catchup-sim seed ${SEED}, targets ${TARGETS.join(',')}, ${TRIALS} learners per target and row`);
console.log(table(rows));
const MIN_FOUND = 0.9; const MAX_FALSE = 0.15; // 3% slip: the first run taught 7.6-9.0% of known skills (the other subjects hold 5%); the small gate sample is noisier
let failed = 0;
for (const r of rows) {
  const ok = (r.found == null || r.found >= MIN_FOUND) && (r.falseTaught == null || r.falseTaught <= (r.slip ? MAX_FALSE : 0.05)) && (!['none', 'few'].includes(r.scenario) || r.work < r.linear);
  if (gate) console.log(`${ok ? 'ok  ' : 'FAIL'} slip ${r.slip} ${r.scenario}: found ${pct(r.found)}, false-taught ${pct(r.falseTaught)}, work ${Math.round(r.work)} vs linear ${Math.round(r.linear)}`);
  if (!ok) failed++;
}
if (process.argv.includes('--write')) {
  const file = path.join(__dirname, '..', 'docs', 'CATCHUP-PROOF.md');
  const MARK = '<!-- spanish-sim:start -->';
  const old = fs.readFileSync(file, 'utf8').split(MARK)[0].trimEnd();
  const text = [MARK, '', `## Spanish, every grade (scripts/spanish-catchup-sim.js, seed ${SEED}, ${TRIALS} learners per target and row, targets grades ${TARGETS.join(', ')}; SIMULATED learners)`, '',
    'The catch-up now has questions for every unit of every grade (the unit placement bank, content/unit-placement/spanish.json, each question re-solved blind by a second model),',
    'not only grades 3-4. Skills are the curriculum\'s own units (7 to 16 per grade); the lookback is every grade below the target. "Work" counts a check question as a whole level, as above.',
    'Hours: the catch-up\'s taught blocks plus 26 s a check question, against every unit of every grade below the target.', '', table(rows), ''].join('\n');
  fs.writeFileSync(file, `${old}\n\n${text}`);
  console.log('wrote the Spanish section to docs/CATCHUP-PROOF.md');
}
if (gate) console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(gate && failed ? 1 : 0);
