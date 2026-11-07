#!/usr/bin/env node
/**
 * Turns a published effect size into this model's multiplier, so no effect is guessed (docs/SPEED-4X.md, round 3; SIMULATED, no model calls).
 * d = (mean recall with the multiplier - without) / SD of recall without, across ordinary simulated learners, same learners, same time.
 *   node scripts/speed-calibrate.js [--seed=20261112] [--n=400]
 * Tutor: page and answers teach g times as much (d against a reader doing the same work, tested after 1 week).
 * Pretesting: a page read after a question on it teaches g times as much (a read and two problems, tested after 1 week, no reviews).
 * Interleaving: half-life after the first pass, g times longer (tested after 1 week, first pass only, no reviews).
 * Caveat: a published d is against that study's own control, on that study's own test, and its spread is not this model's. So this is a translation, not a measurement.
 */
const sim = require('./faster-by-goal-sim');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=?(.*)$/); return [m[1], m[2]]; }));
const SEED = Number(args.seed || 20261112); const N = Number(args.n || 400);
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const L = Array.from({ length: N }, (_, i) => sim.ordinary(SEED, i)).map((l) => ({ L: l, P: sim.paramsOf(l) }));
const plan = (H) => ({ testRel: 2200, noDate: true, fromFinish: true, H, itemH: 0 });
const goal = (H) => ({ id: `h${H}`, kind: 'horizon', H });
const score = (arm, H) => L.map(({ L: l, P }) => sim.simulate(l, P, arm, plan(H)).recall);
function solve(name, mk, H, targets) {
  const base = score(mk(1), H); const s = sd(base); const m0 = mean(base);
  const out = { name, test_days: H, control_recall: Number(m0.toFixed(3)), control_sd: Number(s.toFixed(3)), multipliers: {} };
  const grid = []; for (let g = 1; g <= 6.001; g += 0.05) grid.push(Number(g.toFixed(2)));
  const curve = grid.map((g) => ({ g, d: (mean(score(mk(g), H)) - m0) / s }));
  for (const t of targets) { const hit = curve.find((c) => c.d >= t); out.multipliers[t] = hit ? hit.g : null; }
  out.max_d = Number(Math.max(...curve.map((c) => c.d)).toFixed(2));
  return out;
}
const R = {
  simulated: true, seed: SEED, n: N,
  tutor: solve('tutor', (g) => ({ type: 'student', rereads: 0, problems: 6, cram: 'practice', passes: 0, gain: g }), 7, [0.37, 0.79, 2]),
  pretest: solve('pretest', (g) => ({ type: 'student', rereads: 0, problems: 2, cram: 'practice', passes: 0, pageGain: g }), 7, [0.2, 0.44]),
  interleave: solve('interleave', (g) => ({ type: 'savant', goal: goal(7), noReviews: true, speed: { testout: false, short: false, stop: false, ilvH: g } }), 7, [0.2, 0.42]),
};
console.log(JSON.stringify(R, null, 1));
