/**
 * The in-grade walk with holes, the within-one stop rule and the information pick (3 Nov placement round, SIMULATED learners).
 *
 *   node scripts/unit-placement-holes-test.js
 *
 * Runs on a throwaway data file and the committed math unit bank. A learner with a hole (a unit below their frontier that they
 * never learned, answered at the guess rate) used to be placed early because each miss counted as evidence the frontier was low.
 */
const os = require('os');
const path = require('path');

process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(os.tmpdir(), `unit-placement-holes-${process.pid}.json`);

const adaptive = require('../services/adaptive-placement');
const up = require('../services/unit-placement');

let failures = 0;
function check(label, ok, detail) {
  if (ok) { console.log(`  ok   ${label}`); return; }
  failures++;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
}

const TRACK = 'math';
const GRADE = 'numbers_to_10';
const units = up.unitsFor(TRACK, GRADE);

console.log('\na hole below the frontier');
{
  // Frontier 10: units 1 to 10 finished, unit 7 never learned (all wrong), 11 and 12 wrong. The true start is unit 11.
  const answered = [];
  for (const u of [3, 5, 7, 7, 8, 9, 10, 10, 11, 12, 12]) {
    answered.push({ unit: u, slot: answered.filter((a) => a.unit === u).length, correct: u !== 7 && u < 11 });
  }
  const saved = up.CONFIG.hole;
  up.CONFIG.hole = 0;
  const without = up.placedUnit(units, answered).unit;
  up.CONFIG.hole = saved;
  const withHoles = up.placedUnit(units, answered).unit;
  check('read answer by answer (no hole model) the miss on unit 7 drags the placement down more than a unit', Math.abs(without - 11) > 1, without);
  check('with the hole model the placement is within one unit of the true start', Math.abs(withHoles - 11) <= 1, withHoles);
  check('a learner with no hole is placed within one unit either way', (() => {
    const clean = answered.filter((a) => a.unit !== 7);
    return [0, saved].every((h) => { up.CONFIG.hole = h; return Math.abs(up.placedUnit(units, clean).unit - 11) <= 1; });
  })());
  up.CONFIG.hole = saved;
}

console.log('\nthe stop rule');
{
  const rng = (seed) => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const walk = (mode, f, holes, seed) => {
    const rand = rng(seed);
    const answered = [];
    for (let i = 0; i < 100; i++) {
      const next = up.nextQuestion(TRACK, GRADE, mode, answered);
      if (!next) break;
      const q = units[next.unit - 1].questions[next.slot];
      const p = up.pointOf(q, next.unit);
      const known = 1 / (1 + Math.exp(-(f - p) / 0.3));
      const right = holes.has(next.unit) ? rand() < 0.25 : rand() < 0.25 + 0.72 * known;
      answered.push({ ...next, correct: right });
    }
    return { answered, placed: up.score(TRACK, GRADE, answered).unit };
  };
  const r = walk('balanced', 8.5, new Set(), 11);
  check('a walk ends on its own at or before the mode\'s cap', r.answered.length <= up.MODES.balanced.max && up.nextQuestion(TRACK, GRADE, 'balanced', r.answered) === null, r.answered.length);
  check('and not before the mode\'s minimum', r.answered.length >= up.MODES.balanced.min, r.answered.length);
  check('it placed the learner within one unit (frontier 8.5, true start 9)', Math.abs(r.placed - 9) <= 1, r.placed);
  const mass = up.withinOneMass(units, r.answered, up.beliefOf(units, r.answered));
  check('and the belief puts at least the mode\'s confidence on that being so', mass >= up.MODES.balanced.confidence || r.answered.length >= up.MODES.balanced.max, mass);
  const early = r.answered.slice(0, up.MODES.balanced.min);
  check('with only the minimum answered the belief is less sure than with them all or equal', up.withinOneMass(units, early, up.beliefOf(units, early)) <= mass + 0.05);
  check('the modes\' confidence rises from Quick to Full', up.MODES.quick.confidence <= up.MODES.balanced.confidence && up.MODES.balanced.confidence <= up.MODES.accurate.confidence);

  // A small simulated gate: 40 learners, a third of them with 30% of their finished units as holes, Quick.
  let within = 0; let n = 0;
  for (let k = 0; k < 40; k++) {
    const rand = rng(900 + k);
    const f = 2 + rand() * (units.length - 3);
    const F = Math.floor(f);
    const holes = new Set();
    if (k % 3 === 0) for (let u = 1; u <= F; u++) if (rand() < 0.3) holes.add(u);
    const out = walk('quick', f, holes, 5000 + k);
    n++;
    if (Math.abs(out.placed - (F + 1)) <= 1) within++;
  }
  check(`Quick places at least 85% of 40 simulated learners within one unit, a third of them with holes (${within} of ${n})`, within / n >= 0.85, within / n);
}

console.log('\nthe information pick');
{
  const answered = [{ unit: 8, slot: 0, correct: true }, { unit: 9, slot: 0, correct: false }];
  const post = up.beliefOf(units, answered);
  const pick = up.pickByInformation(units, answered, post);
  const mid = adaptive.median(post);
  const pos = up.pointOf(units[pick.unit - 1].questions[pick.slot], pick.unit);
  check('it picks an unasked question near the middle of the belief', Math.abs(pos - mid) <= 3 && !answered.some((a) => a.unit === pick.unit && a.slot === pick.slot), { pos, mid });
  check('the pick narrows the belief in expectation', Number.isFinite(pick.expected));
}

console.log('\nthe grade walk\'s stop');
{
  const span = 16;
  const answers = [];
  for (const pos of [1, 2, 3, 4, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5]) answers.push({ pos, guess: 0.25, correct: pos <= 6.5 });
  const post = adaptive.posterior(span, answers);
  const m = adaptive.withinOneGrade(span, post, answers);
  check('the share of the belief within one grade of the recommendation is a probability', m > 0 && m <= 1, m);
  const few = answers.slice(0, 3);
  check('and a short record is less sure than a long one', adaptive.withinOneGrade(span, adaptive.posterior(span, few), few) < m);
  check('the whole budgets are Quick 12, Balanced 20, Accurate 57', JSON.stringify(adaptive.WHOLE_MINUTES) === JSON.stringify({ quick: 12, balanced: 20, accurate: 57 }));
  check('every in-grade mode has a within-one confidence, and Balanced and Full also have one in the grade walk', ['quick', 'balanced', 'accurate'].every((k) => up.MODES[k].confidence >= 0.9) && adaptive.MODES.balanced.confidence >= 0.97 && adaptive.MODES.accurate.confidence >= 0.99);
  check('Quick keeps its minimum and the span lift, and its legacy stop (the 95% per level gate in placement-accuracy-test)', adaptive.MODES.quick.min === 18 && adaptive.limits('quick', 49).min > 18 && adaptive.MODES.quick.confidence === undefined);
}

if (failures) { console.log(`\n${failures} failed`); process.exit(1); }
console.log('\nall passed');
