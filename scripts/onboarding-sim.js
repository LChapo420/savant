/**
 * Simulated proof for the three onboarding modes (docs/ONBOARDING-MODES.md). EVERYTHING THIS PRINTS IS SIMULATED: the learners, their true values
 * and the validity of every item are assumptions (services/onboarding/model.js says which and why). It is a comparison of designs under one stated
 * world, not a result about real learners.
 *
 *   node scripts/onboarding-sim.js                      development seed, 300 learners
 *   node scripts/onboarding-sim.js --heldout            the held-out seed (31415): never used to choose anything
 *   node scripts/onboarding-sim.js --pessimistic        every item is 25% less valid than the selector assumes
 *   node scripts/onboarding-sim.js --json=out.json      also write the numbers
 *   --bundle=pessimistic|central|optimistic   validity scenario AND trait-correlation scenario of the WORLD and of the selector's belief
 *                                             (model.js SCENARIOS, LOADINGS; evidence in curriculum-build/evidence-article/09-work/validity-scenarios.json)
 *   --selector-prior=independent|low|central|high|cogonly   what the selector assumes about trait correlations (default cogonly: the shipped selector)
 *   --world-corr=independent|low|central|high       how the simulated traits really correlate (default: the bundle's)
 *   --world-scenario=NAME     validity scenario of the world when it differs from the selector's (--bundle sets the selector's)
 *   --shared-noise            one response error shared by every measure an item reads (the model treats them as independent)
 *   --modes=quick,accurate    only these modes;  --<mode>-budget=SEC  --<mode>-mingain=X  override a mode's limits (the re-optimisation runs)
 *
 * What it does, per simulated learner: draws true values for all 100 measures (mean 50, sd 17), then
 *   - TODAY: the learner takes the current 20-item style quiz; the app's own services/scorecard seedFromStyleQuiz scores it (the real code, on an
 *     in-memory database, the same answer model scripts/scorecard-recovery-sim.js uses: validity 0.4 on the dimension's main measure) and the card is
 *     read back. Day-0 accuracy = 100 - mean absolute error over the 100 measures, as docs/SCORECARD-90.md defines it.
 *   - each MODE: the Planner (services/onboarding/plan.js, the server's own code) walks the learner through the pool, choosing the next item by
 *     expected uncertainty removed per second at the learner's own pace, until the mode's budget is spent. Every item's reading is drawn from the
 *     generative model (method error shared within a family, validities scaled by --pessimistic, a fatigue loss of up to 20% of validity over an hour).
 *     The estimate is read two ways: the ideal posterior, and as the real scorecard reads it after services/onboarding/baseline.js has fed it in.
 * Then the days of use to reach 90% and 95% are worked out from the scorecard's weekly accuracy curve (curriculum-build/scorecard-sim/gate-r9-a-none.json,
 * the app as it is) by adding the onboarding's extra precision to each measure (see daysTo()).
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const has = (f) => argv.includes(`--${f}`);
const opt = (n, d) => { const h = argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const HELDOUT = has('heldout');
const SEED = Number(opt('seed', HELDOUT ? 31415 : 20261102));
const LEARNERS = Number(opt('learners', 300));
const VFAC = has('pessimistic') ? 0.75 : Number(opt('vfac', 1));   // the world's validities against the ones the selector assumes
const BUNDLES = { pessimistic: { scenario: 'pessimistic', corr: 'low' }, central: { scenario: 'central', corr: 'central' }, optimistic: { scenario: 'optimistic', corr: 'high' } };
const BUNDLE = opt('bundle', 'central');
if (!BUNDLES[BUNDLE]) throw new Error(`unknown bundle ${BUNDLE}`);
const SEL_PRIOR = opt('selector-prior', 'cogonly');                            // 'independent' | low | central | high | cogonly (the shipped default)
const WORLD_CORR = opt('world-corr', BUNDLES[BUNDLE].corr);
const WORLD_SCN = opt('world-scenario', BUNDLES[BUNDLE].scenario);
const SHARED_NOISE = has('shared-noise');
const FATIGUE = 0.2;   // validity lost by the end of an hour
const SELF_REPORT_R = 0.4; // the recovery sim's questionnaire validity on a dimension's main measure
const POP_SD = 17;
const SHIPPED = has('shipped');   // only the items that have words or a generator today (content/onboarding/items.json), not the whole designed pool

// ── in-memory db, so the real scorecard code runs without data/db.json ───────
process.env.DB_FILE = path.join(os.tmpdir(), 'onboarding-sim-unused.json');
process.env.DB_READONLY = '1';
let store = {}; let counters = {};
const col = (n) => store[n] || (store[n] = []);
const memoryDb = {
  all: (n) => col(n),
  insert(n, doc) { counters[n] = (counters[n] || 0) + 1; const row = { id: counters[n], created_at: new Date().toISOString(), ...doc }; col(n).push(row); return row; },
  insertMany(n, docs) { return docs.map((d) => memoryDb.insert(n, d)); },
  find: (n, p) => col(n).filter(p),
  findOne: (n, p) => col(n).find(p) || null,
  byId: (n, id) => col(n).find((r) => r.id === Number(id)) || null,
  update(n, id, patch) { const r = memoryDb.byId(n, id); if (!r) return null; Object.assign(r, patch); return r; },
  upsert(n, p, build) { const e = memoryDb.findOne(n, p); if (e) { Object.assign(e, build(e)); return e; } return memoryDb.insert(n, build(null)); },
  remove(n, p) { const rows = col(n); let k = 0; for (let i = rows.length - 1; i >= 0; i--) if (p(rows[i])) { rows.splice(i, 1); k++; } return k; },
  flush() {}, path: '(onboarding-sim: in memory)',
};
const dbPath = require.resolve(path.join(ROOT, 'config', 'db'));
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: memoryDb };

const scorecard = require('../services/scorecard');
const baseline = require('../services/onboarding/baseline');
const model = require('../services/onboarding/model');
const { Planner, MODES, STAT_IDS } = require('../services/onboarding/plan');
const { GROUPS, LABELS } = require('../services/onboarding/groups');
model.setScenario(BUNDLES[BUNDLE].scenario);
model.setPrior(SEL_PRIOR === 'independent' ? null : SEL_PRIOR);
for (const m of Object.keys(MODES)) {
  if (opt(`${m}-budget`, '')) MODES[m].budgetSec = Number(opt(`${m}-budget`, ''));
  if (opt(`${m}-mingain`, '')) MODES[m].minGainPerMin = Number(opt(`${m}-mingain`, ''));
}
const { pool, byId } = require('../services/onboarding/pool');
const learner = require('../services/learner');

// ── randomness ───────────────────────────────────────────────────────────────
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function hashSeed(...p) { let h = 2166136261; for (const ch of p.join(':')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
class Rng {
  constructor(seed) { this.r = mulberry32(seed); }
  normal() { let u = 0; while (!u) u = this.r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * this.r()); }
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const quantile = (xs, q) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

// ── a simulated learner ──────────────────────────────────────────────────────
function makeLearner(index) {
  const rng = new Rng(hashSeed(SEED, 'learner', index));
  const truth = {}; const fz = {};
  if (WORLD_CORR === 'independent') {
    for (const id of STAT_IDS) truth[id] = clamp(50 + POP_SD * rng.normal(), 0, 100);
  } else {
    // the factor model: z = lg g + lc c_cat + specific (the same structure as scripts/scorecard-recovery-sim.js drawTruth), loadings by scenario
    const ld = model.loadingsOf(WORLD_CORR);
    fz['F:g'] = rng.normal();
    for (const f of model.FACTOR_IDS) if (f !== 'F:g') fz[f] = rng.normal();
    STAT_IDS.forEach((id, j) => {
      const cat = model.NODE_IDS[ld[j].cat];
      truth[id] = clamp(50 + POP_SD * (ld[j].lg * fz['F:g'] + ld[j].lc * fz[cat] + Math.sqrt(1 - ld[j].lg ** 2 - ld[j].lc ** 2) * rng.normal()), 0, 100);
    });
  }
  return { index, rng, truth, fz, speed: Math.exp(0.28 * rng.normal()), method: {} };
}

/** One item answered by a learner: its readings (sign-adjusted) and the seconds it took. */
function answer(L, item, elapsed) {
  const fat = 1 - FATIGUE * Math.min(1, elapsed / 3600);
  const readings = {};
  const shared = SHARED_NOISE ? L.rng.normal() : null;
  for (const i of item.informs) {
    const rho = model.SCENARIOS[WORLD_SCN][item.family];
    const r = model.effIn(WORLD_SCN, item.family, i.r) * VFAC;
    const w = r * Math.sqrt(Math.max(0, 1 / (rho * rho) - 1));
    const key = `${i.stat}:${item.family}`;
    if (L.method[key] === undefined) L.method[key] = L.rng.normal();
    const rt = r * fat;
    const z = i.stat.startsWith('F:') ? (L.fz[i.stat] || 0) : (L.truth[i.stat] - 50) / POP_SD;
    const e = shared !== null ? shared : L.rng.normal();
    const raw = rt * z + w * L.method[key] + Math.sqrt(Math.max(0, 1 - rt * rt - w * w)) * e;
    readings[i.stat] = raw;   // already read in the "high on the measure" direction (the sign only matters to the item's wording)
  }
  const seconds = item.free ? 0 : item.sec * L.speed * Math.exp(0.2 * L.rng.normal());
  return { readings, seconds };
}

function runMode(modeId, L) {
  const planner = new Planner(modeId);
  if (SHIPPED) planner.available = (it) => !!require('../services/onboarding/tasks').present(it, 1);
  for (let guard = 0; guard < 400; guard++) {
    const item = planner.next();
    if (!item) break;
    const a = answer(L, item, planner.elapsed);
    planner.record(item, a.readings, a.seconds);
    for (const f of planner.unlockedFree()) { const fa = answer(L, f, planner.elapsed); planner.record(f, fa.readings, 0); }
  }
  return planner;
}

// ── today's onboarding, through the real app code ─────────────────────────────
const DIM_TRUTH = {
  explanation_depth: (T) => T.step_explicitness, example_order: (T) => T.inductive_trajectory, visual_support: (T) => T.spatial_anchoring,
  practice_density: (T) => 100 - T.chunk_granularity, session_pacing: (T) => T.attention_runway, challenge_appetite: (T) => T.challenge_appetite,
  verbalization: (T) => T.elaboration_benefit, error_focus: (T) => T.feedback_granularity, retrieval_style: (T) => T.generation_effect,
};
function today(L) {
  store = {}; counters = {};
  const rng = L.rng;
  const reportOf = (t) => clamp(0.5 + 0.22 * (SELF_REPORT_R * (t - 50) / 50 * 3 + Math.sqrt(1 - SELF_REPORT_R ** 2) * rng.normal()), 0, 1);
  const vector = {};
  for (const [d, f] of Object.entries(DIM_TRUTH)) vector[d] = reportOf(f(L.truth));
  scorecard.seedFromStyleQuiz(1, vector);
  const card = scorecard.get(1);
  const out = {};
  for (const id of STAT_IDS) out[id] = scorecard.read(card, id).measured;
  return out;
}

function viaApp(est) {
  store = {}; counters = {};
  scorecard.observe(1, baseline.observations(est), { source: 'onboarding' });
  const card = scorecard.get(1);
  const out = {};
  for (const id of STAT_IDS) out[id] = scorecard.read(card, id).measured;
  return out;
}

const maeOf = (est, truth, ids = STAT_IDS) => mean(ids.map((id) => Math.abs(est[id] - truth[id])));

// ── run ──────────────────────────────────────────────────────────────────────
const WORST10 = ['conceptual_bias', 'identity_alignment', 'cognitive_flexibility', 'competitive_drive', 'depth_breadth', 'productive_struggle', 'planning_tendency', 'emotional_engagement', 'intrinsic_motivation', 'integration_tendency'];
const modeIds = opt('modes', '') ? opt('modes', '').split(',') : Object.keys(MODES);
const factorErr = {};   // mode -> factor id -> [abs error]
const factorGuess = {}; // factor id -> [abs error of guessing the mean], from the same learners
const acc = { guess: [], today: [], today_items_ideal: [] };
const perStat = { guess: {}, today: {}, today_items_ideal: {} };
const addStat = (key, est, truth) => { for (const id of STAT_IDS) (perStat[key][id] = perStat[key][id] || []).push(Math.abs(est[id] - truth[id])); };
for (const m of modeIds) { acc[m] = { minutes: [], ideal: [], app: [], items: [], seconds: [] }; perStat[m] = {}; perStat[`${m}_app`] = {}; }

const t0 = Date.now();
for (let k = 0; k < LEARNERS; k++) {
  const L = makeLearner(k);
  for (const [fid, v] of Object.entries(L.fz)) (factorGuess[fid] = factorGuess[fid] || []).push(Math.abs(POP_SD * v));
  const guess = Object.fromEntries(STAT_IDS.map((id) => [id, 50]));
  acc.guess.push(maeOf(guess, L.truth)); addStat('guess', guess, L.truth);
  const t = today(L);
  acc.today.push(maeOf(t, L.truth)); addStat('today', t, L.truth);
  // today's items read in this model (ideal read-out), for a like-for-like with the new items
  {
    const pl = new Planner('quick'); pl.state = model.emptyState();
    const L2 = makeLearner(k);
    for (const it of pool.filter((p) => p.legacy)) { const a = answer(L2, it, 0); for (const i of it.informs) model.bump(pl.state, i.stat, it.family, model.eff(it.family, i.r), a.readings[i.stat]); }
    const e = pl.estimates(); const v = Object.fromEntries(STAT_IDS.map((id) => [id, e[id].value]));
    acc.today_items_ideal.push(maeOf(v, L.truth)); addStat('today_items_ideal', v, L.truth);
  }
  for (const m of modeIds) {
    const Lm = makeLearner(k);       // each mode draws the same truth, its own answers
    const pl = runMode(m, Lm);
    const e = pl.estimates();
    const v = Object.fromEntries(STAT_IDS.map((id) => [id, clamp(e[id].value, 0, 100)]));
    const app = viaApp(e);
    acc[m].minutes.push(pl.elapsed / 60); acc[m].items.push(pl.log.filter((l) => l.seconds > 0).length);
    acc[m].ideal.push(maeOf(v, Lm.truth)); acc[m].app.push(maeOf(app, Lm.truth));
    for (const id of STAT_IDS) {
      (perStat[m][id] = perStat[m][id] || []).push(Math.abs(v[id] - Lm.truth[id]));
      (perStat[`${m}_app`][id] = perStat[`${m}_app`][id] || []).push(Math.abs(app[id] - Lm.truth[id]));
    }
    if (k === 0) acc[m].first_items = pl.log.map((l) => l.id);
    const fe = model.factorEstimates(pl.state);
    for (const [fid, e2] of Object.entries(fe)) { ((factorErr[m] = factorErr[m] || {})[fid] = (factorErr[m][fid] || [])).push(Math.abs(e2.value - (50 + POP_SD * (Lm.fz[fid] || 0)))); }
  }
}

// ── days to 90% / 95% with the app's own weekly curve ─────────────────────────
const TARGETS = [87, 88, 90, 95];
function daysTo(modeKey) {
  const gate = JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum-build', 'scorecard-sim', 'gate-r9-a-none.json'), 'utf8')).results.off.gate.weeks;
  const SIG = (m) => m / 0.7979;                      // sd of a normal error with this mean absolute error
  const prec = (m) => 1 / (SIG(Math.max(m, 0.5)) ** 2);
  const m0 = (id) => mean(perStat.today[id]); const mm = (id) => mean(perStat[modeKey][id]);
  const curve = [[0, null]];
  for (const w of [1, 2, 3, 4]) {
    const per = gate[w].perStat;
    const maes = STAT_IDS.map((id) => {
      const p = prec(per[id].mae) + Math.max(0, prec(mm(id)) - prec(m0(id)));   // the app's precision plus what this onboarding adds over today's
      return Math.sqrt(1 / p) * 0.7979;
    });
    curve.push([w * 7, 100 - mean(maes)]);
  }
  curve[0][1] = 100 - mean(STAT_IDS.map((id) => mm(id)));
  const first = (target) => {
    for (let i = 0; i < curve.length; i++) {
      if (curve[i][1] >= target) {
        if (i === 0) return 0;
        const [d0, a0] = curve[i - 1]; const [d1, a1] = curve[i];
        return Math.ceil(d0 + (d1 - d0) * (target - a0) / (a1 - a0));
      }
    }
    return null;   // not reached within the four weeks the curve covers
  };
  return { curve: curve.map(([d, a]) => [d, Number(a.toFixed(2))]), d90: first(90), d95: first(95), reach: Object.fromEntries(TARGETS.map((t) => [t, first(t)])) };
}
const appOnlyCurve = (() => {
  const gate = JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum-build', 'scorecard-sim', 'gate-r9-a-none.json'), 'utf8')).results.off.gate.weeks;
  return [1, 2, 3, 4].map((w) => [w * 7, Number((100 - gate[w].all.mean_mae).toFixed(2))]);
})();

// ── report ───────────────────────────────────────────────────────────────────
const f1 = (x) => Number(x.toFixed(1)); const f2 = (x) => Number(x.toFixed(2));
const share = (maeMode, maeGuess) => Number((100 * (1 - maeMode / maeGuess)).toFixed(1));
const groupMae = (key, ids) => mean(ids.map((id) => mean(perStat[key][id])));
const catOf = Object.fromEntries(require('../services/scorecard/stats').STATS.map((st) => [st.id, st.category]));
const result = {
  simulated: true, bundle: BUNDLE, selector_scenario: BUNDLES[BUNDLE].scenario, selector_prior: SEL_PRIOR, world_scenario: WORLD_SCN, world_corr: WORLD_CORR, shared_noise: SHARED_NOISE,
  groups: Object.fromEntries(Object.entries(GROUPS).map(([g, ids]) => [g, { label: LABELS[g], n: ids.length }])), shipped_content_only: SHIPPED, seed: SEED, heldout: HELDOUT, learners: LEARNERS, validity_factor: VFAC, fatigue: FATIGUE,
  guess_the_mean: { mae: f2(mean(acc.guess)), accuracy: f2(100 - mean(acc.guess)) },
  today: { mae: f2(mean(acc.today)), accuracy: f2(100 - mean(acc.today)), minutes: 'about 3 to 4 (20 forced-choice items and the survey)', days_to: daysTo('today').reach },
  today_items_ideal_readout: { accuracy: f2(100 - mean(acc.today_items_ideal)) },
  app_only_curve_default_pace: appOnlyCurve,
  modes: {},
};
for (const m of modeIds) {
  const a = acc[m];
  const days = daysTo(m);
  const worst = WORST10.map((id) => ({ stat: id, today: f1(mean(perStat.today[id])), ideal: f1(mean(perStat[m][id])), app: f1(mean(perStat[`${m}_app`][id])) }));
  const gs = {}; const gsIdeal = {};
  for (const [g, ids] of Object.entries(GROUPS)) { gs[g] = share(groupMae(`${m}_app`, ids), groupMae('guess', ids)); gsIdeal[g] = share(groupMae(m, ids), groupMae('guess', ids)); }
  const cats = {};
  for (const c of [...new Set(Object.values(catOf))]) { const ids = STAT_IDS.filter((id) => catOf[id] === c); cats[c] = share(groupMae(`${m}_app`, ids), groupMae('guess', ids)); }
  const perMeasure = STAT_IDS.map((id) => [id, share(mean(perStat[`${m}_app`][id]), mean(perStat.guess[id]))]).sort((x, y) => y[1] - x[1]);
  const fshare = {};
  for (const [fid, errs] of Object.entries(factorErr[m] || {})) if (factorGuess[fid]) fshare[fid] = share(mean(errs), mean(factorGuess[fid]));
  result.modes[m] = {
    share_removed_app: share(mean(a.app), mean(acc.guess)), share_removed_ideal: share(mean(a.ideal), mean(acc.guess)),
    share_removed_by_group_app: gs, share_removed_by_group_ideal: gsIdeal, share_removed_by_category_app: cats, share_removed_by_factor: fshare,
    best10_measures_app: perMeasure.slice(0, 10), worst10_measures_app: perMeasure.slice(-10),
    minutes_median: f2(quantile(a.minutes, 0.5)), minutes_p90: f2(quantile(a.minutes, 0.9)), minutes_max: f2(Math.max(...a.minutes)),
    items_median: quantile(a.items, 0.5),
    accuracy_ideal: f2(100 - mean(a.ideal)), accuracy_app_readback: f2(100 - mean(a.app)),
    gain_vs_today: f2(mean(acc.today) - mean(a.app)),
    days_to: days.reach, accuracy_curve_days: days.curve,
    measures_better_than_guess: STAT_IDS.filter((id) => mean(perStat[m][id]) < mean(perStat.guess[id]) - 0.3).length,
    worst10: worst,
  };
}
console.log(JSON.stringify(result, null, 1));
console.error(`(${LEARNERS} learners, ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
const out = opt('json', '');
if (out) fs.writeFileSync(out, JSON.stringify(result, null, 1));
