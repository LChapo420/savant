/**
 * Toy simulation behind docs/SCORECARD-90.md section 11.5 (the forgetting/drift layer). EVERYTHING IT PRINTS IS SIMULATED, and it is a one-measure toy:
 * readings arrive daily with independent noise, the learner's true value drifts as a stationary Ornstein-Uhlenbeck process whose one-year stability
 * (correlation of the value with itself a year later) is --stab (default 0.8), and the question is how much a posterior that never forgets
 * (every reading weighs the same, the prior is the population) loses against a Kalman filter that fades old evidence, and against one with the
 * wrong fade. The daily noise is set so that a never-forgetting posterior over 30 days has the mean absolute error of the main sim at day 30 (6.3
 * points, docs/SCORECARD-90.md section 10). Sources with a persistent method error (most of the designed ones) do not average out like this noise, so
 * this understates how much of the error is persistent; it shows only the direction and rough size of the drift effect.
 *   node scripts/scorecard-drift-sim.js [--stab=0.8] [--learners=4000] [--seed=1]
 */
'use strict';
const arg = (n, d) => { const a = process.argv.slice(2).find((x) => x.startsWith(`--${n}=`)); return a ? Number(a.slice(n.length + 3)) : d; };
const STAB = arg('stab', 0.8); const N = arg('learners', 4000); const POP_SD = 17;
let a0 = arg('seed', 1) >>> 0;
const u = () => { a0 = (a0 + 0x6D2B79F5) >>> 0; let t = Math.imul(a0 ^ (a0 >>> 15), 1 | a0); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const normal = () => { let x = 0; while (x === 0) x = u(); return Math.sqrt(-2 * Math.log(x)) * Math.cos(2 * Math.PI * u()); };
const rho = Math.pow(STAB, 1 / 365);                   // daily persistence of the true value
const sig2 = 30 / (1 / 0.216 - 1);                     // daily reading noise (z units^2): never-forgetting var at day 30 = 0.216 (MAE 6.3 points)
const DAYS = [30, 90, 180, 365]; const out = {};
const variants = { never_forgets: null, kalman_right: rho, kalman_fade_x4_too_fast: Math.pow(rho, 4), kalman_fade_x4_too_slow: Math.pow(rho, 0.25), kalman_mass_only: rho };
// kalman_mass_only is what the live scorecard does (services/scorecard/drift.js): the variance grows at the right rate, so a new reading moves a stale
// estimate more, but the estimate itself is not pulled back toward the population (the full Kalman's mean step, m = r m, is left out).
const MASS_ONLY = new Set(['kalman_mass_only']);
for (const [name, r] of Object.entries(variants)) out[name] = DAYS.map(() => 0);
for (let i = 0; i < N; i++) {
  let z = normal(); const st = { never_forgets: { P: 1, b: 0 } }; const kal = {};
  for (const k of Object.keys(variants)) if (variants[k] !== null) kal[k] = { m: 0, v: 1 };
  let P = 1; let b = 0;
  for (let d = 1; d <= 365; d++) {
    z = rho * z + Math.sqrt(1 - rho * rho) * normal();
    const x = z + Math.sqrt(sig2) * normal();
    P += 1 / sig2; b += x / sig2;
    for (const [k, r] of Object.entries(variants)) if (r !== null) { const s = kal[k]; const m = MASS_ONLY.has(k) ? s.m : r * s.m; const v = r * r * s.v + (1 - r * r); const g = v / (v + sig2); s.m = m + g * (x - m); s.v = (1 - g) * v; }
    const di = DAYS.indexOf(d); if (di >= 0) {
      out.never_forgets[di] += Math.abs(b / P - z) * POP_SD;
      for (const k of Object.keys(kal)) out[k][di] += Math.abs(kal[k].m - z) * POP_SD;
    }
  }
}
console.log(`SIMULATED toy, one-year stability ${STAB}, ${N} learners, daily noise var ${sig2.toFixed(2)} (z^2). Mean absolute error in points, accuracy = 100 - error.`);
console.log('variant'.padEnd(26) + DAYS.map((d) => `day ${d}`.padStart(10)).join(''));
for (const [k, v] of Object.entries(out)) console.log(k.padEnd(26) + v.map((s) => (s / N).toFixed(2).padStart(10)).join(''));
