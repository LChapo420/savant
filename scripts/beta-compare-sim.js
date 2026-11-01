#!/usr/bin/env node
/**
 * Simulated proof for the beta comparison's interval (services/beta-stats.js): learners with a KNOWN true effect of 0, +20% and +50%,
 * three kinds of outcome (a rate per practice hour, a skewed zero-heavy mean, a yes/no), read the way the daily report reads them,
 * including the worst case for any interval: opening the report again and again.
 *
 *   node scripts/beta-compare-sim.js [--reps=1000] [--seed=1] [--json]
 *
 * It reports, per effect and outcome:
 *   coverage_planned   share of simulations whose 95% interval contains the true difference, at one planned look (n = 100, 150, 400)
 *   coverage_ever      share whose interval contained the truth at EVERY daily look (every 5 learners from n = 50 to 500)
 *   false_positive     with effect 0: share that EVER excluded zero while peeking (the always-valid guarantee is at most 0.05)
 *   power              with a true effect: share whose interval excludes zero by n = 150, 400 and 500
 * for the always-valid interval (what the report uses) and the ordinary Welch interval (what it would be if it were read daily).
 * Everything here is simulated learners: it shows the statistics are sound, not that tailoring works. No database, no model calls.
 */
const stats = require('../services/beta-stats');

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sampler(rng) {
  const normal = () => { let u = 0; while (u === 0) u = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng()); };
  const gamma = (shape) => { // Marsaglia and Tsang
    if (shape < 1) return gamma(shape + 1) * rng() ** (1 / shape);
    const d = shape - 1 / 3; const c = 1 / Math.sqrt(9 * d);
    for (;;) {
      let x; let v;
      do { x = normal(); v = 1 + c * x; } while (v <= 0);
      v = v ** 3; const u = rng();
      if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  };
  const poisson = (lambda) => {
    if (lambda > 30) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * normal()));
    const L = Math.exp(-lambda); let k = 0; let p = 1;
    do { k++; p *= rng(); } while (p > L);
    return k - 1;
  };
  return { normal, gamma, poisson };
}

/** The three outcome families. Each: draw(arm effect) -> a learner's record; summarize(records) -> arm summary; truth(effect) -> true difference. */
const FAMILIES = {
  // Retained skills per practice hour: hours are lognormal with 12% of learners inactive, retained skills are Poisson with a
  // learner-level multiplier (some learners are just faster), so the per-learner rates are skewed and overdispersed.
  rate: {
    label: 'retained skills per practice hour (ratio of totals)',
    BASE: 0.5,
    draw: (s, rng, eff) => {
      const x = rng() < 0.12 ? 0 : Math.exp(Math.log(2.5) + 0.9 * s.normal());
      const g = s.gamma(2) / 2;
      return [s.poisson(0.5 * (1 + eff) * g * x), x];
    },
    summarize: (records) => stats.summarizeRatio(records),
    truth: (eff) => 0.5 * eff,
  },
  // A zero-heavy, right-skewed mean (a delayed-recall count, minutes): 30% zeros, lognormal otherwise.
  skewed: {
    label: 'zero-heavy skewed mean',
    BASE: 0.7 * Math.exp(1 + 0.5), // 0.7 * E[lognormal(1, 1)]
    draw: (s, rng, eff) => (rng() < 0.3 ? 0 : (1 + eff) * Math.exp(1 + s.normal())),
    summarize: (records) => stats.summarizeMean(records),
    truth: (eff) => 0.7 * Math.exp(1.5) * eff,
  },
  // A yes/no (returned within 7 days): 45% in the base arm.
  binary: {
    label: 'yes/no (a proportion)',
    BASE: 0.45,
    draw: (s, rng, eff) => (rng() < 0.45 * (1 + eff) ? 1 : 0),
    summarize: (records) => stats.summarizeMean(records),
    truth: (eff) => 0.45 * eff,
  },
};

const PLANNED = [100, 150, 400];
const FIRST_LOOK = 100;
const LAST = 500;
const STEP = 5;
const BASE_EVERY = 5; // every fifth learner is in the base arm: a 20% holdout

/** One simulated beta: learners arrive; the report is read every STEP learners from FIRST_LOOK. */
function oneRun(family, eff, rng, s, alpha) {
  const fam = FAMILIES[family];
  const truth = fam.truth(eff);
  const T = []; const B = [];
  const out = { everMissCS: false, everMissW: false, everExclCS: false, everExclW: false, planned: {}, power: {} };
  for (let i = 1; i <= LAST; i++) {
    if (i % BASE_EVERY === 0) B.push(fam.draw(s, rng, 0)); else T.push(fam.draw(s, rng, eff));
    if (i >= FIRST_LOOK && i % STEP === 0) {
      const t = fam.summarize(T); const b = fam.summarize(B);
      const cs = stats.sequentialInterval(t, b, alpha); const w = stats.welchInterval(t, b, alpha);
      if (!cs || !w) continue;
      const csHit = cs.lo <= truth && truth <= cs.hi; const wHit = w.lo <= truth && truth <= w.hi;
      if (!csHit) out.everMissCS = true;
      if (!wHit) out.everMissW = true;
      if (cs.lo > 0 || cs.hi < 0) out.everExclCS = true;
      if (w.lo > 0 || w.hi < 0) out.everExclW = true;
      if (PLANNED.includes(i)) out.planned[i] = { cs: csHit, w: wHit };
      if (i === 150 || i === 400 || i === LAST) out.power[i] = { cs: cs.lo > 0 || cs.hi < 0, w: w.lo > 0 || w.hi < 0 };
    }
  }
  return out;
}

function simulate({ reps = 1000, seed = 1, alpha = 0.05, families = Object.keys(FAMILIES), effects = [0, 0.2, 0.5] } = {}) {
  const results = [];
  for (const family of families) {
    for (const eff of effects) {
      const rng = mulberry32(seed * 1000003 + family.length * 97 + Math.round(eff * 100));
      const s = sampler(rng);
      const agg = { reps, cover: {}, ever_cover_cs: 0, ever_cover_w: 0, ever_excl_cs: 0, ever_excl_w: 0, power: {} };
      for (const n of PLANNED) agg.cover[n] = { cs: 0, w: 0 };
      for (const n of [150, 400, LAST]) agg.power[n] = { cs: 0, w: 0 };
      for (let r = 0; r < reps; r++) {
        const o = oneRun(family, eff, rng, s, alpha);
        if (!o.everMissCS) agg.ever_cover_cs++;
        if (!o.everMissW) agg.ever_cover_w++;
        if (o.everExclCS) agg.ever_excl_cs++;
        if (o.everExclW) agg.ever_excl_w++;
        for (const n of PLANNED) { if (o.planned[n]) { agg.cover[n].cs += o.planned[n].cs ? 1 : 0; agg.cover[n].w += o.planned[n].w ? 1 : 0; } }
        for (const n of Object.keys(agg.power)) { if (o.power[n]) { agg.power[n].cs += o.power[n].cs ? 1 : 0; agg.power[n].w += o.power[n].w ? 1 : 0; } }
      }
      const f = (x) => Number((x / reps).toFixed(3));
      results.push({
        family, label: FAMILIES[family].label, effect: eff, true_difference: Number(FAMILIES[family].truth(eff).toFixed(4)),
        coverage_planned: Object.fromEntries(PLANNED.map((n) => [n, { always_valid: f(agg.cover[n].cs), welch: f(agg.cover[n].w) }])),
        coverage_every_look: { always_valid: f(agg.ever_cover_cs), welch: f(agg.ever_cover_w) },
        ever_excluded_zero: { always_valid: f(agg.ever_excl_cs), welch: f(agg.ever_excl_w) },
        power_by_n: Object.fromEntries(Object.keys(agg.power).map((n) => [n, { always_valid: f(agg.power[n].cs), welch: f(agg.power[n].w) }])),
      });
    }
  }
  return results;
}

function print(results, reps) {
  const pct = (x) => `${(x * 100).toFixed(1)}%`;
  console.log(`Simulated beta: ${reps} runs per row, 20% base arm, report read every ${STEP} learners from n=${FIRST_LOOK} to n=${LAST}.`);
  console.log('coverage = share of runs whose 95% interval holds the TRUE difference. AV = always-valid (used), W = Welch (single-look only).');
  for (const r of results) {
    const c = r.coverage_planned;
    console.log(`\n${r.label}, true effect ${r.effect >= 0 ? '+' : ''}${Math.round(r.effect * 100)}% (true difference ${r.true_difference})`);
    console.log(`  coverage at one planned look  n=100: AV ${pct(c[100].always_valid)} W ${pct(c[100].welch)} | n=150: AV ${pct(c[150].always_valid)} W ${pct(c[150].welch)} | n=400: AV ${pct(c[400].always_valid)} W ${pct(c[400].welch)}`);
    console.log(`  coverage at EVERY daily look  AV ${pct(r.coverage_every_look.always_valid)}   W ${pct(r.coverage_every_look.welch)}`);
    if (r.effect === 0) console.log(`  FALSE POSITIVE (ever excluded zero while peeking)  AV ${pct(r.ever_excluded_zero.always_valid)}   W ${pct(r.ever_excluded_zero.welch)}`);
    else {
      const p = r.power_by_n;
      console.log(`  power (interval excludes zero)  n=150: AV ${pct(p[150].always_valid)} W ${pct(p[150].welch)} | n=400: AV ${pct(p[400].always_valid)} W ${pct(p[400].welch)} | n=${LAST}: AV ${pct(p[LAST].always_valid)} W ${pct(p[LAST].welch)}`);
    }
  }
}

if (require.main === module) {
  const arg = (name, dflt) => { const m = process.argv.find((a) => a.startsWith(`--${name}=`)); return m ? Number(m.split('=')[1]) : dflt; };
  const reps = arg('reps', 1000);
  const t0 = Date.now();
  const results = simulate({ reps, seed: arg('seed', 1) });
  if (process.argv.includes('--json')) console.log(JSON.stringify(results, null, 2)); else print(results, reps);
  console.error(`(${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}

module.exports = { simulate, FAMILIES, mulberry32, sampler, PLANNED, FIRST_LOOK, LAST, STEP };
