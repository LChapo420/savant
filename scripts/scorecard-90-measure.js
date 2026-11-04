/**
 * Phase 2 of docs/SCORECARD-90.md: how close can every measure get to the learner's true value (mean absolute error 5 points or less) at day 30 of
 * 60 minutes a day, with the app's own reading plus designed measurement, all in simulation. ALL NUMBERS ARE SIMULATED; every source's validity below
 * is an ASSUMPTION stated in SOURCES / LLTM / RETEST with its literature anchor (docs/SCORECARD-90.md section 9).
 *
 *   node scripts/scorecard-recovery-sim.js --learners=200 --minutes-per-day=60 --days=30 --seed=S --truth-factors=1 --dump=dump.json   (twice, two seeds)
 *   node scripts/scorecard-90-measure.js --a=dumpA.json --b=dumpB.json [--out=result.json]
 *
 * Seed A's learners are measured with everything calibrated on seed B's learners, and the reverse (cross-fit), so no learner is used to calibrate its
 * own reading. The stages, each adding one thing to the one before:
 *   S0 the app as it is                          S3 + embedded item-feature design (explanatory IRT, zero learner time)
 *   S1 + recalibration (ridge read-out, cross-fit)  S4 + planned retests at varied lags (the memory trio)
 *   S2 + joint posterior (empirical-Bayes covariance) S5 + adaptive item banks (CAT), 10 min/day for 14 days then 3 min/day
 * Responses are modelled as linear-Gaussian, so the posterior covariance after any set of items does not depend on the answers: the adaptive choice of
 * items is then a greedy variance-reduction design per learner (given what the app already knows about them), exactly the expected-information rule.
 */
const fs = require('fs');
const { STATS } = require('../services/scorecard/stats');
const IND = require('../services/scorecard/indicators');
const simGate = require('./lib/sim-gate');

const argv = process.argv.slice(2);
const arg = (n, d = '') => { const a = argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const HALF = Number(arg('half', 1)); // loadings multiplier for the robustness run (0.5 = half-validity)
const BLIND = arg('blind', '0') === '1'; // plan the items without looking at the app's reading
const MENU = arg('menu', '0') === '1'; // free in-flow picks (a 'what next?' menu: at most MENU_PICKS a month, 2 s a tap, no extra time charged)
const RT = arg('rt', '0') === '1';     // the embedded design also reads response time (a second outcome per answer: the sampling noise of each slope halves)
const MENU_PICKS = 290;
const DAYS = Number(arg('days', 30));  // the horizon of the dump (30, 180 or 365 days of 60 minutes)
const PLAN_MIN = { early: Number(arg('early-min', 10)), late: Number(arg('late-min', 3)), earlyDays: 14, days: DAYS };
const STOP = arg('stop', '0') === '1'; // per-measure stopping: keep measuring a learner until each posterior SD is under STOP_SD points, within CAP_MIN minutes
const STOP_SD = Number(arg('stop-sd', 1.9)); const CAP_MIN = Number(arg('cap-min', 3000));
let TARGET_VAR = STOP ? (STOP_SD / 17) ** 2 : 0.11; // post variance (z units) at which a measure counts as done (0.11: reliability 0.89, a margin under the 0.864 that gives MAE 5)
// a dump argument may be a comma-separated list of shard files (the stratified runs are sharded over processes); their learners are concatenated
const loadDump = (spec) => { const parts = spec.split(',').filter(Boolean).map((f) => JSON.parse(fs.readFileSync(f, 'utf8'))); const d = parts[0]; for (const q of parts.slice(1)) d.learners.push(...q.learners); return d; };
const A = loadDump(arg('a'));
const B = loadDump(arg('b'));
// Stratified report (docs/SCORECARD-90.md section 12; ALL SIMULATED), off by default so every other number and --gate-check reproduce. --strata=1 needs dumps made
// with scorecard-recovery-sim.js --strata=1 (each learner carries an age band and maybe a trait-profile proxy) and prints accuracy, the guess baseline and the share
// of error removed per subgroup, at day 0 (no evidence: the prior) and the dump's day. Three fixes that need no truth are switchable (--fix=a,b,c):
//   oh    the learner's age band (known from the date of birth) as one-hot columns in every ridge read-out: a per-band prior inside the recalibration
//   prior the joint posterior's prior mean is the calibration set's mean of the learner's age band, not the pooled mean (the sources are read as residuals)
//   var   (with prior) the prior's spread is the age band's own: the prior precision is divided by the band's mean residual variance of the calibration truth (a wider band, e.g. 60+, trusts its data more)
//   norm  the cohort standardisation (above) is done within the age band instead of across the pooled cohort
const STRATA = arg('strata', '0') === '1';
const FIX = new Set(arg('fix', '').split(',').filter(Boolean));
const BANDS = ['8-12', '13-17', '18-29', '30-59', '60+'];
const bandOf = (L) => L.age;

const POP_SD = A.pop_sd;
// Phase 3 (docs/SCORECARD-90.md section 10): --cohort=1 standardises every column the recalibration reads (the app's number, the 16 answer-log features, the
// indicator means) within its own cohort before the ridge sees it. The app's numbers are normed against a cohort the app itself keeps, so they carry a cohort-level
// offset (seeds differed by up to 7 points on the same measure) that a read-out trained on another cohort turns into error. The cohort's own mean and spread need
// no truth, so a live app can do this on its own learners. ASSUMPTION: the cohort is a random draw from the population the read-out was trained on (as in the sim).
const COHORT = arg('cohort', '1') === '1';
// --gls=1: the recalibrated reads of all 100 measures enter the joint posterior with their out-of-fold error covariance (shrunk 30% off-diagonal), not as independent
// evidence. Phase 2 treated them as independent, which made the joint posterior worse than a measure's own read (S2 < S1) because the reads share errors.
const GLS = arg('gls', '1') === '1';
const HELD = arg('c', '');  // a third dump, never used for calibration or tuning: the calibration set is A and B together and only C is scored

// ── small numerics ─────────────────────────────────────────────────────────
function rngFor(seed) { let a = seed >>> 0; const u = () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; u.normal = () => { let x = 0; while (x === 0) x = u(); return Math.sqrt(-2 * Math.log(x)) * Math.cos(2 * Math.PI * u()); }; return u; }
const mean = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);
function chol(M, n) { const L = new Float64Array(n * n); for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) { let s = M[i * n + j]; for (let k = 0; k < j; k++) s -= L[i * n + k] * L[j * n + k]; if (i === j) L[i * n + j] = Math.sqrt(Math.max(s, 1e-12)); else L[i * n + j] = s / L[j * n + j]; } return L; }
function cholSolve(L, n, b) { const y = new Float64Array(n); for (let i = 0; i < n; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i * n + k] * y[k]; y[i] = s / L[i * n + i]; } const x = new Float64Array(n); for (let i = n - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < n; k++) s -= L[k * n + i] * x[k]; x[i] = s / L[i * n + i]; } return x; }
function invert(M, n) { const L = chol(M, n); const out = new Float64Array(n * n); const e = new Float64Array(n); for (let c = 0; c < n; c++) { e.fill(0); e[c] = 1; const x = cholSolve(L, n, e); for (let r = 0; r < n; r++) out[r * n + c] = x[r]; } return out; }
function eigSym(M, n) { // cyclic Jacobi
  const a = Float64Array.from(M); const v = new Float64Array(n * n); for (let i = 0; i < n; i++) v[i * n + i] = 1;
  for (let sweep = 0; sweep < 30; sweep++) {
    let off = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i * n + j] ** 2; if (off < 1e-14) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      const apq = a[p * n + q]; if (Math.abs(apq) < 1e-12) continue;
      const th = (a[q * n + q] - a[p * n + p]) / (2 * apq); const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)); const c = 1 / Math.sqrt(t * t + 1); const s = t * c;
      for (let k = 0; k < n; k++) { const akp = a[k * n + p]; const akq = a[k * n + q]; a[k * n + p] = c * akp - s * akq; a[k * n + q] = s * akp + c * akq; }
      for (let k = 0; k < n; k++) { const apk = a[p * n + k]; const aqk = a[q * n + k]; a[p * n + k] = c * apk - s * aqk; a[q * n + k] = s * apk + c * aqk; }
      for (let k = 0; k < n; k++) { const vkp = v[k * n + p]; const vkq = v[k * n + q]; v[k * n + p] = c * vkp - s * vkq; v[k * n + q] = s * vkp + c * vkq; }
    }
  }
  return { values: Array.from({ length: n }, (_, i) => a[i * n + i]), vectors: v };
}
function ridgeFit(X, y, lam) { // X rows already standardised; intercept unpenalised
  const n = X.length; const p = X[0].length + 1; const M = new Float64Array(p * p); const r = new Float64Array(p);
  for (let i = 0; i < n; i++) { const x = [1, ...X[i]]; for (let a = 0; a < p; a++) { r[a] += x[a] * y[i]; for (let b = 0; b <= a; b++) M[a * p + b] += x[a] * x[b]; } }
  for (let a = 0; a < p; a++) { for (let b = 0; b < a; b++) M[b * p + a] = M[a * p + b]; if (a > 0) M[a * p + a] += lam; }
  return cholSolve(chol(M, p), p, r);
}
const predict = (w, x) => { let s = w[0]; for (let i = 0; i < x.length; i++) s += w[i + 1] * x[i]; return s; };

// ── the measures, aliases, latents ─────────────────────────────────────────
const IDS = STATS.map((s) => s.id);
const ALIAS = Object.fromEntries(A.aliases.map(([id, base, inv]) => [id, { base, sign: inv ? -1 : 1 }]));
const ROOTS = IDS.filter((id) => !ALIAS[id]);
const LIDX = Object.fromEntries(ROOTS.map((id, i) => [id, i]));
const NL = ROOTS.length;
const lat = (id) => (ALIAS[id] ? LIDX[ALIAS[id].base] : LIDX[id]);
const sgn = (id) => (ALIAS[id] ? ALIAS[id].sign : 1);
const MULT = new Float64Array(NL).fill(1); for (const id of IDS) if (ALIAS[id]) MULT[LIDX[ALIAS[id].base]] += 1; // measures per latent (a latent counts once per measure)
const zOf = (T) => Float64Array.from(ROOTS, (id) => (T[id] - 50) / POP_SD);

// Phase 1 groups (docs/SCORECARD-90.md section 3), for reporting.
const GA = 'processing_velocity,vocabulary_ceiling,rush_tendency,deliberation_depth,challenge_appetite,failure_response,error_recovery_speed,frustration_threshold,hint_dependency,guessing_propensity,perfectionism,confidence_calibration,self_monitoring,brevity_preference,persistence,prior_knowledge'.split(',');
const GB = 'systems_thinking,pattern_detection,contradiction_sensitivity,attention_runway,fatigue_curve,recognition_recall_gap,consolidation_need,help_seeking,error_driven_learning,instruction_adherence,reflection_depth,self_efficacy,scaffolding_fade,notation_comfort,repetition_tolerance,open_response_performance,near_transfer,misconception_persistence,mastery_velocity'.split(',');
const GD = ['decay_rate', 'retention_index', 'retrieval_strength'];
const groupOf = (id) => (GD.includes(id) ? 'd' : GA.includes(id) ? 'a' : GB.includes(id) ? 'b' : 'c');

// ── the item banks (ASSUMED validities, literature anchors in the doc) ─────
// Item i of source s on measure j reads x = z + u + e, u a persistent error (the source's own view, shared by all its items; 1/rhoInf - 1), e fresh per
// item (1/rho1 - 1 - var u). rho1 = single-item reliability against the true value, rhoInf = the most any number of items can reach (a validity squared).
const SOURCES = {
  WM:     { rho1: 0.21, rhoInf: 0.85, sec: 9,  note: 'digit/Corsi span trial (Conway et al. 2005: 15 trials alpha ~0.8)' },
  SPEED:  { rho1: 0.09, rhoInf: 0.90, sec: 2.5, note: 'pattern/symbol comparison item (36 items in 90 s, reliability ~0.8)' },
  REAS:   { rho1: 0.18, rhoInf: 0.90, sec: 30, note: 'matrix / series / syllogism item (9-item abbreviated forms alpha ~0.7, Bilker et al. 2012)' },
  SWITCH: { rho1: 0.06, rhoInf: 0.60, sec: 4,  note: 'mixed-block switch / interference trial (difference scores are weak: Hedge et al. 2018)' },
  KNOW:   { rho1: 0.20, rhoInf: 0.95, sec: 12, note: 'calibrated knowledge / vocabulary item' },
  GEN:    { rho1: 0.08, rhoInf: 0.50, sec: 35, note: 'generative production task scored by rubric (alternate uses, question writing)' },
  SCALE:  { rho1: 0.25, rhoInf: 0.25, sec: 10, note: 'one validated scale item: 10 items alpha ~0.8; self-report against behaviour r 0.1 to 0.4 (Dang et al. 2020)' },
  SCALE_C: { rho1: 0.15, rhoInf: 0.12, sec: 10, note: 'self-estimate of a cognitive ability (r ~0.3 with performance, Freund & Kasten 2012)' },
  CHOICE: { rho1: 0.26, rhoInf: 0.70, sec: 7,  note: 'forced-choice pair between two versions (revealed preference, Thurstone 1927; slope 0.8 per SD)' },
  MENU:   { rho1: 0.15, rhoInf: 0.50, sec: 2, note: 'a pick in a normal "what next?" menu (one a level, about 290 a month; revealed preference in the flow, no extra time)' },
  CHOICE_M: { rho1: 0.20, rhoInf: 0.50, sec: 7, note: 'forced choice between two activities (motivation / attitude; contextual, slope 0.6 per SD)' },
};
if (arg('ceil', '0') === '1') { // OPTIMISTIC ceiling: every source at the top of its literature range (multi-method scales, forced-choice blocks, rubric-scored production)
  Object.assign(SOURCES.SCALE, { rhoInf: 0.40 }); Object.assign(SOURCES.SCALE_C, { rhoInf: 0.30 }); Object.assign(SOURCES.CHOICE, { rhoInf: 0.85 }); Object.assign(SOURCES.CHOICE_M, { rhoInf: 0.75 });
  Object.assign(SOURCES.MENU, { rhoInf: 0.70 }); Object.assign(SOURCES.GEN, { rhoInf: 0.80 }); Object.assign(SOURCES.SWITCH, { rhoInf: 0.80 });
}
const SRC = {};
const set = (type, ids) => ids.split(',').forEach((id) => { (SRC[id] = SRC[id] || []).push(type); });
set('WM', 'working_memory_span'); set('SPEED', 'processing_velocity,pattern_detection');
set('REAS', 'deductive_trajectory,inductive_trajectory,analogical_transfer,causal_chain_depth,logical_rigor,systems_thinking,contradiction_sensitivity,far_transfer,near_transfer,global_framing_need');
set('SWITCH', 'cognitive_flexibility,interference_susceptibility,interleaving_tolerance');
set('KNOW', 'vocabulary_ceiling,prior_knowledge,intake_baseline,jargon_absorption');
set('GEN', 'creative_extension,question_generation,integration_tendency,depth_breadth,reflection_depth,open_response_performance,misconception_persistence,conceptual_bias');
set('CHOICE', 'abstraction_tolerance,example_density_need,text_density_tolerance,spatial_anchoring,humor_receptivity,narrative_pull,tone_formality,mnemonic_receptivity,enactive_encoding,generation_effect,elaboration_benefit,step_explicitness,worked_example_dependence,feedback_granularity,feedback_tone_sensitivity,dialogic_preference,praise_sensitivity,social_framing,interest_transfer,cycle_architecture,chunk_granularity,brevity_preference,repetition_tolerance,stimulus_envelope,novelty_hunger,gamification_response,structure_need,autonomy_preference,application_orientation,relevance_demand,curiosity_hook,notation_comfort,scaffolding_fade,warmup_latency,momentum_dependence,reentry_cost,fatigue_curve,attention_runway,session_rhythm,consolidation_need,recognition_recall_gap');
set('CHOICE_M', 'intrinsic_motivation,extrinsic_reward_sensitivity,competitive_drive,boredom_susceptibility,mastery_orientation,identity_alignment,evaluation_anxiety,productive_struggle,planning_tendency,strategy_awareness,emotional_engagement,challenge_appetite,persistence,self_efficacy,help_seeking,instruction_adherence,perfectionism,frustration_threshold,error_driven_learning,self_monitoring,confidence_calibration,mastery_velocity,failure_response,hint_dependency,guessing_propensity,rush_tendency,deliberation_depth');
const COGIDS = new Set(['working_memory_span', 'processing_velocity', 'pattern_detection', 'deductive_trajectory', 'inductive_trajectory', 'analogical_transfer', 'causal_chain_depth', 'logical_rigor', 'systems_thinking', 'contradiction_sensitivity', 'far_transfer', 'near_transfer', 'global_framing_need', 'cognitive_flexibility', 'interference_susceptibility', 'vocabulary_ceiling', 'prior_knowledge', 'intake_baseline']);
for (const id of ROOTS) set(COGIDS.has(id) ? 'SCALE_C' : 'SCALE', id);
if (MENU) for (const id of Object.keys(SRC)) if (SRC[id].includes('CHOICE') || SRC[id].includes('CHOICE_M')) SRC[id].push('MENU');
// per-latent candidate sources (aliases share their root's)
// Phase 3 levers (docs/SCORECARD-90.md section 10), each a change in what ONE minute of the learner's time buys. All are ASSUMPTIONS with the anchor stated;
// --lev=bw,cat,rt,conf,dual,gen,conj (or all). Off by default so the Phase 2 numbers reproduce.
//   bw    best-worst blocks (a block of four options gives two judgements for about 1.2 pair-times): forced-choice time x0.6 (Louviere, Flynn & Marley 2015)
//   cat   adaptive item selection from a calibrated bank: 35% fewer items for the same reliability, so the per-item noise x0.65 (Weiss 1982; Gibbons et al. 2008:
//         CAT reaches full-scale reliability with 10 to 50% of the items). Applies to scales, forced choices, knowledge and reasoning items.
//   rt    the response time of an item read with its answer (a second outcome per item, as the --rt flag does for the embedded design): per-item noise x0.85
//         for scales and choices (Ranger & Ortner 2011; Alos-Ferrer 2016 on choice strength), speed trials x0.85 (diffusion-model parameters, Ratcliff & McKoon 2008)
//   conf  graded confidence on knowledge and reasoning items (answer plus how sure): per-item noise x0.75 (Ebel 1965; Gardner-Medwin & Gahan 2003)
//   dual  knowledge and reasoning items placed as the lesson's own practice questions, so half their time is the lesson's (time x0.5)
//   gen   one production task scored on four rubric dimensions at once (Torrance-style fluency/flexibility/originality/elaboration; LLM raters r ~0.7 with humans,
//         Organisciak et al. 2023): the 8 production measures become two bundles of 4; each gets noise x1.25 (a shared prompt cannot cue every dimension)
//   conj  conjoint choice (three attributes varied in one pair; Green & Srinivasan 1978): the forced-choice measures become bundles of 3 that share a trial's
//         time; noise x1.3 per attribute
const RINF_X = Number(arg('rinf-x', 1)); // what-if: every source's persistent (method) error variance divided by this, to find the ceilings a 95% average would need
const LEV = new Set(arg('lev', '').split(',').filter(Boolean).flatMap((x) => (x === 'all' ? ['bw', 'cat', 'rt', 'conf', 'dual', 'gen', 'conj'] : [x])));
const BUNDLE_OF = {}; // latent id -> { type, group }
{
  const groupsOf = (ids, n) => { const out = []; for (let i = 0; i < ids.length; i += n) out.push(ids.slice(i, i + n)); return out; };
  const idsOf = (type) => ROOTS.filter((id) => (SRC[id] || []).includes(type));
  if (LEV.has('gen')) groupsOf(idsOf('GEN'), 4).forEach((g, gi) => g.forEach((id) => { BUNDLE_OF[id + '|GEN'] = `GEN${gi}`; }));
  if (LEV.has('conj')) { groupsOf(idsOf('CHOICE'), 3).forEach((g, gi) => g.forEach((id) => { BUNDLE_OF[id + '|CHOICE'] = `CH${gi}`; })); groupsOf(idsOf('CHOICE_M'), 3).forEach((g, gi) => g.forEach((id) => { BUNDLE_OF[id + '|CHOICE_M'] = `CM${gi}`; })); }
}
const bank = ROOTS.map((id) => (SRC[id] || ['SCALE']).map((t) => {
  const d = SOURCES[t]; const lo = HALF;
  const r1 = Math.min(0.95, d.rho1 * lo * lo); const rinf = Math.min(0.97, Math.max(r1, d.rhoInf * lo * lo));
  const su2 = (1 / rinf - 1) / RINF_X; let se2 = Math.max(0, 1 / r1 - 1 - su2); let sec = d.sec;
  const isScaleLike = ['SCALE', 'SCALE_C', 'CHOICE', 'CHOICE_M'].includes(t);
  if (LEV.has('bw') && (t === 'CHOICE' || t === 'CHOICE_M')) sec *= 0.6;
  if (LEV.has('cat') && (isScaleLike || t === 'KNOW' || t === 'REAS')) se2 *= 0.65;
  if (LEV.has('rt') && (isScaleLike || t === 'SWITCH' || t === 'SPEED')) se2 *= 0.85;
  if (LEV.has('conf') && (t === 'KNOW' || t === 'REAS')) se2 *= 0.75;
  if (LEV.has('dual') && (t === 'KNOW' || t === 'REAS')) sec *= 0.5;
  const bundle = BUNDLE_OF[id + '|' + t] || null;
  if (bundle) se2 *= t === 'GEN' ? 1.25 : 1.3;
  return { type: t, sec, su2, se2, bundle };
}));
// Phase 4 (docs/SCORECARD-90.md section 11): behavioural footprints, off by default (--foot=1) so every earlier number reproduces. Each footprint in
// scripts/lib/scorecard-footprints.js adds one source to each measure it reads, with its OWN persistent error (assumed independent of the designed tasks').
//   --foot-v=X     validity multiplier on footprints only (1 = the conservative values in that file; 0.75 and 0.5 are the pessimistic runs)
//   --foot-only=K  keep only footprint kinds K (CP,VOL,EMB,PRM) to see what each kind adds alone
//   --foot-rinf=R  what-if: set every footprint's ceiling (rhoInf) to R instead (how good would a footprint have to be)
// Free footprints (VOL: logged behaviour, no learner time) happen whether or not the app asks, so they enter at their cap with no seconds charged. Charged
// ones (CP, EMB, PRM) are chosen by the planner like any item, up to their monthly cap, inside the same measuring budget.
const FOOT_ON = arg('foot', '0') === '1';
const FOOT_V = Number(arg('foot-v', 1));
const FOOT_ONLY = arg('foot-only', '').split(',').filter(Boolean);
const FOOT_RINF = Number(arg('foot-rinf', 0));
if (FOOT_ON) {
  const FP = require('./lib/scorecard-footprints');
  for (const f of FP.FOOTPRINTS) {
    if (FOOT_ONLY.length && !FOOT_ONLY.includes(f.kind)) continue;
    const k = FP.KINDS[f.kind]; const lo = FOOT_V;
    const shared = f.reads.length > 1;
    for (const m of f.reads) {
      const j = LIDX[m]; if (j === undefined) throw new Error(`footprint ${f.id} reads unknown latent ${m}`);
      const r1 = Math.min(0.95, k.rho1 * lo * lo); const rinf = Math.min(0.97, Math.max(r1, (FOOT_RINF || k.rhoInf) * lo * lo));
      const su2 = (1 / rinf - 1) / RINF_X; let se2 = Math.max(0, 1 / r1 - 1 - (1 / rinf - 1)); if (shared) se2 *= 1.3;
      bank[j].push({ type: 'FP_' + f.kind, fp: f.id, sec: f.sec, su2, se2, bundle: shared ? 'FP:' + f.id : null, cap: f.cap, free: f.kind === 'VOL' });
    }
  }
}
// the aggregate of n items has error variance su2 + se2/n, precision 1/(that)
const precN = (s, n) => (n <= 0 ? 0 : 1 / (s.su2 + s.se2 / n));

// ── embedded item-feature design (explanatory IRT / LLTM) ──────────────────
// 4,000 answers a month; K practice-item features varied on purpose in a balanced +-1 design, at no extra learner time. A learner's slope on feature k is
// beta z_m + tau u: beta is the ASSUMED effect of one SD of the trait on the logit of a correct answer per +-1 of the feature. 0.068 = the sim's own
// experiment-arm effect (0.4 logits x z, z = SD/50 = 0.34, halved for +-1 coding), which is already optimistic against aptitude-treatment studies
// (Cronbach & Snow 1977; Pashler et al. 2008); tau is the unexplained part of the interaction.
const LLTM_FEATURES = ['text_density_tolerance', 'step_explicitness', 'abstraction_tolerance', 'notation_comfort', 'worked_example_dependence', 'working_memory_span', 'evaluation_anxiety', 'processing_velocity', 'spatial_anchoring', 'narrative_pull', 'relevance_demand', 'jargon_absorption', 'chunk_granularity', 'interleaving_tolerance', 'humor_receptivity', 'gamification_response', 'example_density_need', 'tone_formality', 'feedback_tone_sensitivity', 'feedback_granularity'];
const LLTM = { n: Math.round(4000 * DAYS / 30), K: LLTM_FEATURES.length, beta: 0.068 * HALF, tau: 0.035, sign: LLTM_FEATURES.map((id, i) => (i % 2 ? -1 : 1)) };
const LLTM_DESIGN = (() => { const r = rngFor(777); const n = LLTM.n; const K = LLTM.K; const F = new Float64Array(n * K); for (let k = 0; k < K; k++) { for (let i = 0; i < n; i += 2) { const v = r() < 0.5 ? -1 : 1; F[i * K + k] = v; F[(i + 1) * K + k] = r() < 0.5 ? -1 : 1; } } const off = Float64Array.from({ length: n }, () => 0.8 * r.normal()); return { F, off }; })();
function lltmRun(z, rng) {
  const { n, K } = LLTM; const { F, off } = LLTM_DESIGN; const p = K + 1;
  const slope = LLTM_FEATURES.map((id, k) => LLTM.sign[k] * LLTM.beta * z[LIDX[id]] + LLTM.tau * rng.normal());
  const th = 0.4 + rng.normal();
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) { let l = th - off[i]; for (let k = 0; k < K; k++) l += slope[k] * F[i * K + k]; y[i] = rng() < 1 / (1 + Math.exp(-l)) ? 1 : 0; }
  const w = new Float64Array(p); w[0] = 0.4; // IRLS
  for (let it = 0; it < 6; it++) {
    const M = new Float64Array(p * p); const g = new Float64Array(p); const x = new Float64Array(p); x[0] = 1;
    for (let i = 0; i < n; i++) {
      let l = w[0] - off[i]; for (let k = 0; k < K; k++) { x[k + 1] = F[i * K + k]; l += w[k + 1] * x[k + 1]; }
      const pr = 1 / (1 + Math.exp(-l)); const wt = Math.max(pr * (1 - pr), 1e-6); const resid = y[i] - pr;
      for (let a = 0; a < p; a++) { g[a] += x[a] * resid; const xa = x[a] * wt; for (let b = 0; b <= a; b++) M[a * p + b] += xa * x[b]; }
    }
    for (let a = 0; a < p; a++) { for (let b = 0; b < a; b++) M[b * p + a] = M[a * p + b]; if (a > 0) { M[a * p + a] += 1; g[a] -= w[a]; } }
    const d = cholSolve(chol(M, p), p, g); for (let a = 0; a < p; a++) w[a] += d[a];
  }
  return LLTM_FEATURES.map((id, k) => {
    const zk = z[LIDX[id]]; let x = (LLTM.sign[k] * w[k + 1]) / LLTM.beta;
    if (RT) { const tauPart = (slope[k] - LLTM.sign[k] * LLTM.beta * zk) / (LLTM.sign[k] * LLTM.beta); x = zk + tauPart + (x - zk - tauPart) / Math.SQRT2; }
    return { lat: LIDX[id], x };
  });
}

// ── planned retests (the memory trio) ──────────────────────────────────────
// The half-life multiplier of the sim is exp(-0.9 (T-50)/50) = exp(-0.306 z); the first success gives H = 2.8 mult days, later spaced successes multiply H by
// 1.3 + 1.5 (1 - R), a miss sets H to max(1.5 mult, 0.4 H); recall = guess 0.1 + 0.85 R. Policy 'current': a review when R is near 0.75 (what the scheduler does,
// 60 skills). Policy 'planned': lags log-uniform from 0.1 day to 28 days across 100 skills from day 1. The fit replays each skill's observed outcomes and takes the
// ML log-multiplier on a grid (the app knows the update rule; what it does not know is the learner's multiplier and each skill's own spread, sd 0.5 in log).
const RET = { h0: 2.8, sp0: 1.3, sp1: 1.5, miss: 0.4, missH: 1.5, g: 0.1, s: 0.05, skillSd: 0.5, perSd: 0.9 / 50 * POP_SD };
function retestRun(zd, policy, rng) {
  const mult = Math.exp(-RET.perSd * zd);
  const HZ = DAYS; const maxLag = Math.min(HZ, 180); const skills = Math.round((policy === 'planned' ? 100 : 60) * Math.sqrt(HZ / 30)); const chains = [];
  let events = 0;
  for (let s = 0; s < skills; s++) {
    const eps = RET.skillSd * rng.normal(); const ch = []; let t = (policy === 'planned' ? rng() * 3 : rng() * 0.8 * HZ); let H = null; let last = null;
    for (let guard = 0; guard < 80 && t < HZ; guard++) {
      if (last === null) { ch.push({ first: true, lag: 0 }); H = null; last = t; const pr = 1; H = RET.h0 * mult * Math.exp(eps); ch[ch.length - 1].ok = 1; t = last + 0.3; continue; }
      const lag = t - last; const R = 2 ** (-lag / H); const pc = RET.g + (1 - RET.g - RET.s) * R; const ok = rng() < pc ? 1 : 0;
      ch.push({ lag, ok }); events++;
      if (ok) H *= lag < 0.25 ? 1.1 : RET.sp0 + RET.sp1 * (1 - R); else H = Math.max(RET.missH * mult * Math.exp(eps), H * RET.miss);
      last = t;
      let gap; if (policy === 'planned') gap = Math.exp(Math.log(0.1) + rng() * (Math.log(Math.min(28, maxLag) * (HZ > 40 ? 6 : 1)) - Math.log(0.1))); else gap = H * 0.4 * Math.exp(0.3 * rng.normal());
      t = last + gap;
    }
    chains.push(ch);
  }
  let best = 0; let bl = -1e18; const grid = 61;
  for (let g = 0; g < grid; g++) {
    const m = -1 + (2 * g) / (grid - 1); const mu = Math.exp(m); let ll = 0;
    for (const ch of chains) { let H = RET.h0 * mu; for (const e of ch) { if (e.first) continue; const R = 2 ** (-e.lag / H); const pc = RET.g + (1 - RET.g - RET.s) * R; ll += Math.log(e.ok ? pc : 1 - pc); if (e.ok) H *= e.lag < 0.25 ? 1.1 : RET.sp0 + RET.sp1 * (1 - R); else H = Math.max(RET.missH * mu, H * RET.miss); } }
    if (ll > bl) { bl = ll; best = m; }
  }
  return { x: -best / RET.perSd, events };
}

function cohortZ(D) { // adds L.z = the learner's columns standardised within this cohort (no truth used); with --fix=norm, within each age band
  if (STRATA && FIX.has('norm')) { for (const b of BANDS) cohortZ1(D.learners.filter((L) => bandOf(L) === b)); return; }
  cohortZ1(D.learners);
}
function cohortZ1(Ls) { const sdOf = (v) => Math.sqrt(mean(v.map((x) => (x - mean(v)) ** 2))) || 1;
  const col = (get) => { const v = Ls.map(get); const m = mean(v); const sd = sdOf(v); return (L) => (get(L) - m) / sd; };
  const app = {}; for (const id of IDS) app[id] = col((L) => L.app[id][0]);
  const feat = {}; for (const f of simGate.FEATURES) feat[f] = col((L) => L.feat[f]);
  const ind = {}; const keys = new Set(); Ls.forEach((L) => Object.keys(L.ind || {}).forEach((k) => keys.add(k))); for (const k of keys) ind[k] = col((L) => (L.ind[k] === undefined ? 0 : L.ind[k]));
  for (const L of Ls) L.z = { app: Object.fromEntries(IDS.map((id) => [id, [app[id](L) * POP_SD + 50, L.app[id][1], L.app[id][2]]])), feat: Object.fromEntries(simGate.FEATURES.map((f) => [f, feat[f](L)])), ind: Object.fromEntries([...keys].map((k) => [k, ind[k](L)])) };
}
if (COHORT) { cohortZ(A); cohortZ(B); }
// ── the app's own reading, recalibrated (cross-fit) ────────────────────────
function rowFor(L, id) {
  const Z = COHORT ? L.z : L; const [m, se, conf] = Z.app[id]; const ex = (IND.BY_STAT[id] || []).map((k) => (Z.ind[k.key] === undefined ? 0 : Z.ind[k.key]));
  const oh = STRATA && FIX.has('oh') ? BANDS.slice(1).map((b) => (bandOf(L) === b ? 1 : 0)) : [];
  return { simple: [m, (conf / 100) * (m - 50), ...oh], full: [...simGate.FEATURES.map((f) => Z.feat[f]), m, (conf / 100) * (m - 50), ...ex, ...oh] };
}
function fitRead(C, id) {
  const y = C.map((L) => L.truth[id]); const rows = C.map((L) => rowFor(L, id));
  const models = [{ name: 'simple', key: 'simple', lam: 0.5 }, { name: 'full', key: 'full', lam: 8 }];
  const fit = (idx, mod) => {
    const X = idx.map((i) => rows[i][mod.key]); const mu = X[0].map((_, c) => mean(X.map((r) => r[c]))); const sd = X[0].map((_, c) => Math.sqrt(mean(X.map((r) => (r[c] - mu[c]) ** 2))) || 1);
    const w = ridgeFit(X.map((r) => r.map((v, c) => (v - mu[c]) / sd[c])), idx.map((i) => y[i]), mod.lam);
    return (r) => predict(w, r.map((v, c) => (v - mu[c]) / sd[c]));
  };
  const n = C.length; const folds = 5; let best = null;
  const cands = [{ name: 'prior', mse: mean(y.map((v) => (v - mean(y)) ** 2)) }, { name: 'asis', mse: mean(C.map((L, i) => (y[i] - L.app[id][0]) ** 2)) }];
  const cvp = { prior: C.map(() => mean(y)), asis: C.map((L) => L.app[id][0]) };
  for (const mod of models) {
    let se = 0; cvp[mod.name] = new Array(n); for (let f = 0; f < folds; f++) { const tr = []; const te = []; for (let i = 0; i < n; i++) (i % folds === f ? te : tr).push(i); const pr = fit(tr, mod); for (const i of te) { const v = pr(rows[i][mod.key]); cvp[mod.name][i] = v; se += (y[i] - v) ** 2; } }
    cands.push({ name: mod.name, mse: se / n, mod });
  }
  best = cands.reduce((a, b) => (b.mse < a.mse ? b : a));
  const sd = Math.sqrt(best.mse) * (1 + 30 / n); // a calibration set of n learners over-states its own fit; the claimed spread is widened by 1 + 30/n
  if (best.name === 'asis') return { name: 'asis', pred: (L) => L.app[id][0], sd, cv: cvp.asis };
  if (best.name === 'prior') { const mu = mean(y); return { name: 'prior', pred: () => mu, sd, cv: cvp.prior }; }
  const pr = fit(C.map((_, i) => i), best.mod); return { name: best.name, pred: (L) => pr(rowFor(L, best.mod.key === 'simple' ? id : id)[best.mod.key]), sd, cv: cvp[best.name] };
}

// ── joint posterior ────────────────────────────────────────────────────────
function covFrom(rowsX, rowsP, n) { // rows: x (z-unit observations) and precisions per latent; MP-clipped correlation
  const S = new Float64Array(n * n);
  for (let a = 0; a < n; a++) { S[a * n + a] = 1; for (let b = a + 1; b < n; b++) { let s = 0; let c = 0; for (let i = 0; i < rowsX.length; i++) { if (rowsP[i][a] < 0.15 || rowsP[i][b] < 0.15) continue; s += rowsX[i][a] * rowsX[i][b]; c++; } const r = c > 30 ? Math.max(-0.95, Math.min(0.95, s / c)) : 0; S[a * n + b] = r; S[b * n + a] = r; } }
  const { values, vectors } = eigSym(S, n);
  const edge = (1 + Math.sqrt(n / rowsX.length)) ** 2;
  const keep = values.map((v) => v > edge); const bulk = values.filter((v) => v <= edge); const bm = bulk.length ? (n - values.filter((v, i) => keep[i]).reduce((s, v) => s + v, 0)) / bulk.length : 0;
  const E = new Float64Array(n * n);
  for (let k = 0; k < n; k++) { const lam = keep[k] ? values[k] : Math.max(bm, 0.05); for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) E[a * n + b] += lam * vectors[a * n + k] * vectors[b * n + k]; }
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) if (a !== b) E[a * n + b] /= Math.sqrt(E[a * n + a] * E[b * n + b]);
  for (let a = 0; a < n; a++) E[a * n + a] = 1;
  return { Sigma: E, kept: keep.filter(Boolean).length, top: values.slice().sort((x, y) => y - x).slice(0, 6).map((v) => Number(v.toFixed(2))) };
}
function postFrom(SigInv, Lp, bvec, n, Pm) {
  const M = Float64Array.from(SigInv); for (let i = 0; i < n; i++) M[i * n + i] += Lp[i];
  if (Pm) for (let i = 0; i < n * n; i++) M[i] += Pm[i];
  const Lc = chol(M, n); return { mu: cholSolve(Lc, n, bvec), M, Lc };
}

// ── the CAT: greedy expected-variance reduction per second ─────────────────
const CHUNK = STOP ? 150 : 30; // seconds
const hfun = (v) => Math.max(v - TARGET_VAR, 0) + 0.02 * v;
// Actions: one source of one latent, or a bundle (one trial that reads several latents at once and costs its seconds once).
const ACTIONS = (() => {
  const acts = []; const byBundle = {};
  bank.forEach((b, j) => b.forEach((so, s) => {
    if (so.free) return; // free footprints are applied at the start of every plan, never chosen
    if (!so.bundle) { acts.push({ mem: [[j, s]], sec: so.sec, type: so.type, cap: so.cap }); return; }
    if (!byBundle[so.bundle]) { byBundle[so.bundle] = { mem: [], sec: so.sec, type: so.type, cap: so.cap }; acts.push(byBundle[so.bundle]); }
    byBundle[so.bundle].mem.push([j, s]);
  }));
  return acts;
})();
function plan(Sig0inv, Lp0, budgetSec, Pm) {
  let menuLeft = MENU_PICKS;
  const n = NL; const M = Float64Array.from(Sig0inv); for (let i = 0; i < n; i++) M[i * n + i] += Lp0[i];
  if (Pm) for (let i = 0; i < n * n; i++) M[i] += Pm[i];
  const S = invert(M, n); const counts = bank.map((b) => new Int32Array(b.length));
  let spent = 0; const order = [];
  bank.forEach((b, j) => b.forEach((so, s) => { // free footprints: every event the learner produces anyway, at no cost in seconds
    if (!so.free) return; const d = precN(so, so.cap); if (d <= 1e-9) return;
    const f = d / (1 + d * S[j * n + j]); const col = new Float64Array(n); for (let k = 0; k < n; k++) col[k] = S[k * n + j];
    for (let a = 0; a < n; a++) for (let c = 0; c < n; c++) S[a * n + c] -= f * col[a] * col[c];
    counts[j][s] = so.cap;
  }));
  while (spent + CHUNK <= budgetSec) {
    let bestG = 0; let ba = null; let bn = 0;
    const hcur = new Float64Array(n); for (let k = 0; k < n; k++) hcur[k] = MULT[k] * hfun(S[k * n + k]);
    for (const act of ACTIONS) {
      const isMenu = act.type === 'MENU'; let add = Math.max(1, Math.round(CHUNK / act.sec)); if (isMenu) add = Math.min(add, menuLeft);
      if (act.cap) add = Math.min(add, act.cap - counts[act.mem[0][0]][act.mem[0][1]]);
      if (add <= 0) continue;
      let g = 0;
      for (const [j, s] of act.mem) {
        if (S[j * n + j] < TARGET_VAR * 0.5) continue;
        const so = bank[j][s]; const c0 = counts[j][s];
        const d = precN(so, c0 + add) - precN(so, c0); if (d <= 1e-9) continue;
        const f = d / (1 + d * S[j * n + j]);
        for (let k = 0; k < n; k++) { const sk = S[k * n + j]; g += hcur[k] - MULT[k] * hfun(S[k * n + k] - f * sk * sk); }
      }
      g /= isMenu ? 1 : (add * act.sec);
      if (g > bestG) { bestG = g; ba = act; bn = add; }
    }
    if (!ba) break;
    for (const [j, s] of ba.mem) {
      const so = bank[j][s]; const d = precN(so, counts[j][s] + bn) - precN(so, counts[j][s]); if (d <= 1e-9) continue;
      const f = d / (1 + d * S[j * n + j]); const col = new Float64Array(n); for (let k = 0; k < n; k++) col[k] = S[k * n + j];
      for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) S[a * n + b] -= f * col[a] * col[b];
      counts[j][s] += bn;
    }
    if (ba.type === 'MENU') menuLeft -= bn; else spent += bn * ba.sec; order.push(ba.mem[0][0]);
  }
  return { counts, spent };
}

// ── the experiment ─────────────────────────────────────────────────────────
const t0 = Date.now();
const log = (...a) => console.error(((Date.now() - t0) / 1000).toFixed(0) + 's', ...a);
const POP = { n: Number(arg('pop', 1500)) };

function popTruth(rng) { // the same generating model as the sim (--truth-factors), for a synthetic calibration population
  const cat = {}; let g = rng.normal(); const z = new Float64Array(NL);
  const COG = new Set(['intake', 'reasoning', 'transfer']);
  ROOTS.forEach((id, k) => { const c = A.categories[id]; if (cat[c] === undefined) cat[c] = rng.normal(); if (!A.truth_factors) { z[k] = rng.normal(); return; } const [lg, lc] = COG.has(c) ? [0.5, 0.3] : [0.25, 0.4]; z[k] = lg * g + lc * cat[c] + Math.sqrt(1 - lg * lg - lc * lc) * rng.normal(); });
  return z;
}

function runSide(T, C, seedBase) {
  // T = target learners, C = calibration learners. Returns per-stage per-learner posterior means (z units) and extras.
  const nT = T.length;
  const BP = STRATA && FIX.has('prior'); const ZERO = new Float64Array(NL); const muBand = {};
  if (BP) for (const b of BANDS) { const g = C.filter((L) => bandOf(L) === b).map((L) => zOf(L.truth)); muBand[b] = Float64Array.from(ROOTS, (_, k) => mean(g.map((v) => v[k]))); }
  const varBand = {}; if (BP && FIX.has('var')) for (const b of BANDS) { const g = C.filter((L) => bandOf(L) === b).map((L) => zOf(L.truth)); varBand[b] = mean(ROOTS.map((_, k) => { const m = mean(g.map((v) => v[k])); return mean(g.map((v) => (v[k] - m) ** 2)); })); }
  const offOf = (L) => (BP ? muBand[bandOf(L)] : ZERO); // the age band's prior mean (z units); sources are read as residuals from it
  const zRes = (L) => { const o = offOf(L); return Float64Array.from(zOf(L.truth), (v, k) => v - o[k]); };
  const zT = T.map(zRes); const zC = C.map(zRes);
  // 1. recalibrated reads
  const reads = IDS.map((id) => fitRead(C, id));
  const appLik = (L) => { // per latent: precision & b (information form) from the recalibrated app reads
    const P = new Float64Array(NL); const b = new Float64Array(NL);
    IDS.forEach((id, k) => { const r = reads[k]; const rz = (r.pred(L) - 50) / POP_SD * sgn(id) - offOf(L)[lat(id)]; const q = 1 / ((r.sd / POP_SD) ** 2); const lp = q - 1; if (lp < 0.02) return; const x = rz * q / lp; const l = lat(id); P[l] += lp; b[l] += lp * x; });
    return { P, b };
  };
  let glsPm = null; let glsLik = null;
  if (GLS) {
    const m = IDS.length; const nC = C.length; const lam = new Float64Array(m); const c0 = new Float64Array(m); const E = [];
    IDS.forEach((id, k) => { const y = C.map((L) => L.truth[id]); const x = reads[k].cv; const mx = mean(x); const my = mean(y); let sxy = 0; let syy = 0; y.forEach((v, i) => { sxy += (v - my) * (x[i] - mx); syy += (v - my) ** 2; }); lam[k] = sxy / syy; c0[k] = mx - lam[k] * my; E.push(x.map((v, i) => (Math.abs(lam[k]) < 0.05 ? 0 : (v - c0[k] - lam[k] * y[i]) / lam[k] / POP_SD))); });
    const R = new Float64Array(m * m); for (let a = 0; a < m; a++) for (let b = 0; b <= a; b++) { let t = 0; for (let i = 0; i < nC; i++) t += E[a][i] * E[b][i]; t /= nC; R[a * m + b] = R[b * m + a] = a === b ? t : 0.7 * t; }
    for (let a = 0; a < m; a++) { R[a * m + a] = Math.abs(lam[a]) < 0.05 ? 1e4 : R[a * m + a] * 1.05 + 0.01; }
    const Ri = invert(R, m); const Hm = (k) => [lat(IDS[k]), sgn(IDS[k])];
    glsPm = new Float64Array(NL * NL);
    for (let a = 0; a < m; a++) for (let b = 0; b < m; b++) { const [la, sa] = Hm(a); const [lb, sb] = Hm(b); glsPm[la * NL + lb] += sa * sb * Ri[a * m + b]; }
    glsLik = (L) => { const xv = IDS.map((id, k) => (Math.abs(lam[k]) < 0.05 ? 0 : ((reads[k].pred(L) - c0[k]) / lam[k] - 50) / POP_SD - sgn(IDS[k]) * offOf(L)[lat(IDS[k])])); const P = new Float64Array(NL); const b = new Float64Array(NL); for (let a = 0; a < m; a++) { const [la, sa] = Hm(a); let t = 0; for (let c = 0; c < m; c++) t += Ri[a * m + c] * xv[c]; b[la] += sa * t; } for (let k = 0; k < NL; k++) P[k] = glsPm[k * NL + k]; return { P, b, Pm: glsPm }; };
  }
  const rawZ = (L) => Float64Array.from(IDS, (id) => (L.app[id][0] - 50) / POP_SD);
  // 2. the free designed sources, calibrated on C
  const rngC = rngFor(seedBase + 1);
  const lC = zC.map((z) => lltmRun(z, rngC)); const rC = zC.map((z) => retestRun(z[LIDX.decay_rate], 'planned', rngC)); const rCcur = zC.map((z) => retestRun(z[LIDX.decay_rate], 'current', rngC));
  const lltmErr = []; lC.forEach((rowk, i) => rowk.forEach((o) => lltmErr.push([o.x, zC[i][o.lat]])));
  const reg = (pairs) => { const mx = mean(pairs.map((p) => p[1])); const my = mean(pairs.map((p) => p[0])); const sxy = mean(pairs.map((p) => (p[1] - mx) * (p[0] - my))); const sxx = mean(pairs.map((p) => (p[1] - mx) ** 2)); const slope = sxy / sxx; const res = pairs.map((p) => (p[0] - my) / slope - (p[1] - mx)); return { slope, var: mean(res.map((v) => v * v)) }; };
  const lReg = reg(lltmErr); const rReg = reg(rC.map((o, i) => [o.x, zC[i][LIDX.decay_rate]])); const rRegCur = reg(rCcur.map((o, i) => [o.x, zC[i][LIDX.decay_rate]]));
  log('LLTM slope', lReg.slope.toFixed(2), 'err var', lReg.var.toFixed(2), '| retest planned slope', rReg.slope.toFixed(2), 'var', rReg.var.toFixed(2), 'events', mean(rC.map((o) => o.events)).toFixed(0), '| current var', rRegCur.var.toFixed(2), 'events', mean(rCcur.map((o) => o.events)).toFixed(0));
  const PL = 1 / lReg.var; const PR = 1 / rReg.var;
  const freeLik = (L, zi, withLltm, withRet, rng) => {
    const P = new Float64Array(NL); const b = new Float64Array(NL);
    if (withLltm) for (const o of lltmRun(zi, rng)) { const x = o.x / lReg.slope; P[o.lat] += PL; b[o.lat] += PL * x; }
    if (withRet) { const o = retestRun(zi[LIDX.decay_rate], 'planned', rng); const x = o.x / rReg.slope; P[LIDX.decay_rate] += PR; b[LIDX.decay_rate] += PR * x; }
    return { P, b };
  };
  const rngT = rngFor(seedBase + 2);
  // split free into LLTM-only and retest-only
  const lltmOnly = []; const retOnly = [];
  { const r2 = rngFor(seedBase + 3); T.forEach((L, i) => { const a = freeLik(L, zT[i], true, false, r2); lltmOnly.push(a); const r3 = rngFor(seedBase + 4000 + i); retOnly.push(freeLik(L, zT[i], false, true, r3)); }); }
  const appsOld = T.map(appLik); const apps = GLS ? T.map(glsLik) : appsOld;
  // 3. covariance (EB): app-only for S2; designed sources for S3+
  const appX = C.map((L) => { const a = appLik(L); return { x: Float64Array.from(a.P, (p, k) => (p > 0 ? a.b[k] / p : 0)), P: a.P }; });
  const covApp = covFrom(appX.map((r) => r.x), appX.map((r) => r.P), NL);
  const inv = (S) => invert(S, NL);
  const SigI_id = (() => { const M = new Float64Array(NL * NL); for (let i = 0; i < NL; i++) M[i * NL + i] = 1; return M; })();
  const SigI_app = inv(covApp.Sigma);
  // The planned items are chosen against the prior only first (a pilot), a synthetic population of POP.n learners is measured with that plan to estimate the covariance, then each learner is planned again.
  const totalSec = STOP ? CAP_MIN * 60 : (PLAN_MIN.early * PLAN_MIN.earlyDays + PLAN_MIN.late * (PLAN_MIN.days - PLAN_MIN.earlyDays)) * 60;
  const freeP0 = new Float64Array(NL); for (const f of LLTM_FEATURES) freeP0[LIDX[f]] += PL; freeP0[LIDX.decay_rate] += PR;
  const pilot = plan(SigI_id, freeP0, totalSec);
  const rngP = rngFor(seedBase + 5);
  const obsFor = (counts, z, rng) => { // aggregate observations per (latent, source)
    const out = []; for (let j = 0; j < NL; j++) bank[j].forEach((so, s) => { const n = counts[j][s]; if (!n) return; const u = Math.sqrt(so.su2) * rng.normal(); const e = Math.sqrt(so.se2 / n) * rng.normal(); out.push({ j, s, x: z[j] + u + e, P: precN(so, n) }); }); return out;
  };
  const popX = []; const popP = [];
  for (let i = 0; i < POP.n; i++) {
    const z = popTruth(rngP); const P = new Float64Array(NL); const b = new Float64Array(NL);
    for (const f of LLTM_FEATURES) { const k = LIDX[f]; const x = z[k] + Math.sqrt(lReg.var) * rngP.normal(); P[k] += PL; b[k] += PL * x; }
    { const k = LIDX.decay_rate; const x = z[k] + Math.sqrt(rReg.var) * rngP.normal(); P[k] += PR; b[k] += PR * x; }
    for (const o of obsFor(pilot.counts, z, rngP)) { P[o.j] += o.P; b[o.j] += o.P * o.x; }
    popX.push(Float64Array.from(P, (p, k) => (p > 0 ? b[k] / p : 0))); popP.push(P);
  }
  const covDes = covFrom(popX, popP, NL); const SigI_des = inv(covDes.Sigma);
  log('covariance: app-only kept', covApp.kept, 'top', covApp.top.join(','), '| designed kept', covDes.kept, 'top', covDes.top.join(','));
  // 4. stages
  const res = { S0: [], S1: [], S2: [], S3: [], S4: [], S5: [], D0: [], GB: [] }; const minutes = []; const caps = []; const fpMin = [];
  const post = (SigI, parts, Lr) => { const P = new Float64Array(NL); const b = new Float64Array(NL); let Pm = null; for (const p of parts) { for (let k = 0; k < NL; k++) { if (p.Pm) { b[k] += p.b[k]; } else { P[k] += p.P[k]; b[k] += p.b[k]; } } if (p.Pm) Pm = p.Pm; } const sc = varBand[bandOf(Lr)]; const mu = postFrom(sc ? Float64Array.from(SigI, (v) => v / sc) : SigI, P, b, NL, Pm).mu; if (!BP) return mu; const off = offOf(Lr); return Float64Array.from(mu, (v, k) => v + off[k]); };
  const toPts = (mu, ids) => ids.map((id) => Math.max(2, Math.min(98, 50 + POP_SD * mu[lat(id)] * sgn(id))));
  const seeds = rngFor(seedBase + 6);
  const muAll = IDS.map((id) => mean(C.map((L) => L.truth[id]))); const muByBand = {};
  if (STRATA) for (const b of BANDS) { const g = C.filter((L) => bandOf(L) === b); muByBand[b] = IDS.map((id) => mean((g.length ? g : C).map((L) => L.truth[id]))); }
  for (let i = 0; i < nT; i++) {
    const L = T[i]; const truthPts = IDS.map((id) => L.truth[id]);
    res.S0.push(IDS.map((id, k) => Math.abs(L.app[id][0] - truthPts[k])));
    if (STRATA) { // day 0 = no evidence: the prior (the age band's mean if the band is used anywhere, else the pooled mean); GB = the pooled-mean guess
      res.GB.push(IDS.map((id, k) => Math.abs(truthPts[k] - muAll[k])));
      const mb = (FIX.has('oh') || FIX.has('prior')) ? muByBand[bandOf(L)] : muAll; res.D0.push(IDS.map((id, k) => Math.abs(truthPts[k] - mb[k])));
    }
    // S1: each measure's own recalibrated read (no sharing)
    res.S1.push(IDS.map((id, k) => { const r = reads[k]; return Math.abs(Math.max(2, Math.min(98, r.pred(L))) - truthPts[k]); }));
    const mu2 = post(SigI_app, [apps[i]], L); res.S2.push(toPts(mu2, IDS).map((v, k) => Math.abs(v - truthPts[k])));
    const mu3 = post(SigI_des, [apps[i], lltmOnly[i]], L); res.S3.push(toPts(mu3, IDS).map((v, k) => Math.abs(v - truthPts[k])));
    const mu4 = post(SigI_des, [apps[i], lltmOnly[i], retOnly[i]], L); res.S4.push(toPts(mu4, IDS).map((v, k) => Math.abs(v - truthPts[k])));
    // S5: plan with the app's reading (or blind), take the items, then the joint posterior
    const Lp0 = Float64Array.from(freeP0); if (!BLIND && !GLS) for (let k = 0; k < NL; k++) Lp0[k] += apps[i].P[k];
    const pl = plan(SigI_des, Lp0, totalSec, GLS && !BLIND ? glsPm : null);
    const r5 = rngFor(seedBase + 90000 + i); const obs = obsFor(pl.counts, zT[i], r5);
    const P5 = new Float64Array(NL); const b5 = new Float64Array(NL); for (const o of obs) { P5[o.j] += o.P; b5[o.j] += o.P * o.x; }
    const mu5 = post(SigI_des, [apps[i], lltmOnly[i], retOnly[i], { P: P5, b: b5 }], L); res.S5.push(toPts(mu5, IDS).map((v, k) => Math.abs(v - truthPts[k])));
    minutes.push(pl.spent / 60);
    if (FOOT_ON) { let sec = 0; const seen = new Set(); pl.counts.forEach((c, j) => c.forEach((n, s) => { const so = bank[j][s]; if (!n || !so.fp || so.free) return; if (so.bundle) { if (seen.has(so.bundle)) return; seen.add(so.bundle); } sec += n * so.sec; })); fpMin.push(sec / 60); }
    if (i === 0) log('first learner planned minutes', (pl.spent / 60).toFixed(0), 'items', pl.counts.reduce((s, c, j) => s + c.reduce((a, n) => a + n, 0), 0));
    if (i % 25 === 0) log(`learner ${i}/${nT}`);
    if (i === 0) { const types = {}; pl.counts.forEach((c, j) => c.forEach((n, s) => { if (n && bank[j][s].sec > 0) types[bank[j][s].type] = (types[bank[j][s].type] || 0) + n * bank[j][s].sec / 60 / (bank[j][s].bundle ? ACTIONS.find((a) => a.mem.some((m) => m[0] === j && m[1] === s)).mem.length : 1); })); res.mix = types; }
  }
  // what each latent would still need: its free precision (app, embedded design, retests), the most any number of items of each of its sources can add, and
  // the seconds a single source would need alone to reach the variance for an MAE of 5 (0.136 of the population's)
  const needs = [];
  for (let j = 0; j < NL; j++) {
    const appP = mean(apps.map((a) => a.P[j])); const free = appP + (LLTM_FEATURES.includes(ROOTS[j]) ? PL : 0) + (ROOTS[j] === 'decay_rate' ? PR : 0);
    const cap = free + bank[j].reduce((s, so) => s + 1 / so.su2, 0);
    const forVar = (vv) => { const need = 1 / vv - 1; let solo = Infinity; let soloType = null; for (const so of bank[j]) { const want = need - free; if (want <= 0) { solo = 0; soloType = 'free'; break; } if (want >= 1 / so.su2) continue; const n = so.se2 / (1 / want - so.su2); const sec = n * so.sec; if (sec < solo) { solo = sec; soloType = so.type; } } const extra = Math.max(0, need - cap); return { capOK: cap >= need, soloMin: Number.isFinite(solo) ? Number((solo / 60).toFixed(1)) : null, soloType, extraRho: extra > 0 ? Number((extra / (1 + extra)).toFixed(2)) : 0 }; };
    needs.push({ id: ROOTS[j], free: Number(free.toFixed(2)), cap: Number(cap.toFixed(2)), mae5: forVar(0.136), sd19: forVar((1.9 / 17) ** 2) });
  }
  res.needs = needs; res.minutes = minutes; res.fpMin = fpMin; res.lltm = { slope: lReg.slope, var: lReg.var }; res.ret = { var: rReg.var, current: rRegCur.var, events: mean(rC.map((o) => o.events)), eventsCurrent: mean(rCcur.map((o) => o.events)) }; res.cov = { app: covApp.kept, designed: covDes.kept };
  return res;
}

// run both sides and pool
let sideAB; let sideBA; let TAGGED;
if (HELD) { const Cd = loadDump(HELD); if (COHORT) cohortZ(Cd); sideAB = runSide(Cd.learners, A.learners.concat(B.learners), 3000); TAGGED = Cd.learners; sideBA = { S0: [], S1: [], S2: [], S3: [], S4: [], S5: [], D0: [], GB: [], minutes: [], needs: sideAB.needs, mix: sideAB.mix, lltm: sideAB.lltm, ret: sideAB.ret, cov: sideAB.cov }; }
else { sideAB = runSide(A.learners, B.learners, 1000); sideBA = runSide(B.learners, A.learners, 2000); TAGGED = A.learners.concat(B.learners); }
const stages = ['S0', 'S1', 'S2', 'S3', 'S4', 'S5'];
const perMeasure = {}; // stage -> id -> [mae, w5, w10]
const summary = {};
for (const st of stages) {
  const rows = [...sideAB[st], ...sideBA[st]]; // learner x measure absolute errors
  const mae = IDS.map((id, k) => mean(rows.map((r) => r[k])));
  const w5 = IDS.map((id, k) => mean(rows.map((r) => (r[k] <= 5 ? 1 : 0)))); const w10 = IDS.map((id, k) => mean(rows.map((r) => (r[k] <= 10 ? 1 : 0))));
  const pct = (k, q) => { const v = rows.map((r) => r[k]).sort((x, y) => x - y); return v[Math.min(v.length - 1, Math.floor(q * v.length))]; };
  perMeasure[st] = Object.fromEntries(IDS.map((id, k) => [id, [Number(mae[k].toFixed(2)), Number(w5[k].toFixed(3)), Number(w10[k].toFixed(3)), Number(pct(k, 0.95).toFixed(1)), Number(pct(k, 0.99).toFixed(1))]]));
  const g = (grp) => { const ix = IDS.map((id, k) => k).filter((k) => groupOf(IDS[k]) === grp); return { n: ix.length, mae: Number(mean(ix.map((k) => mae[k])).toFixed(2)), le5: ix.filter((k) => mae[k] <= 5).length, le10: ix.filter((k) => mae[k] <= 10).length, w5: Number(mean(ix.map((k) => w5[k])).toFixed(3)), w10: Number(mean(ix.map((k) => w10[k])).toFixed(3)) }; };
  summary[st] = { accuracy: Number((100 - mean(mae)).toFixed(2)), measures_w5_99: w5.filter((v) => v >= 0.99).length, measures_w5_90: w5.filter((v) => v >= 0.9).length, mae: Number(mean(mae).toFixed(2)), measures_le5: mae.filter((v) => v <= 5).length, measures_le10: mae.filter((v) => v <= 10).length, learners_w5: Number(mean(w5).toFixed(3)), learners_w10: Number(mean(w10).toFixed(3)), groups: { a: g('a'), b: g('b'), c: g('c'), d: g('d') } };
}
const mins = [...sideAB.minutes, ...sideBA.minutes];
const fpm = [...(sideAB.fpMin || []), ...(sideBA.fpMin || [])];
const out = { foot: FOOT_ON ? { v: FOOT_V, only: FOOT_ONLY, rinf: FOOT_RINF, charged_min_per_learner: Number(mean(fpm).toFixed(1)), charged_min_per_day: Number((mean(fpm) / DAYS).toFixed(2)) } : null, days: DAYS, stop: STOP, minutes_p50: Number(mins.slice().sort((x, y) => x - y)[Math.floor(mins.length / 2)].toFixed(0)), minutes_p90: Number(mins.slice().sort((x, y) => x - y)[Math.floor(mins.length * 0.9)].toFixed(0)), half: HALF, blind: BLIND, truth_factors: A.truth_factors, learners: A.learners.length + B.learners.length, minutes_total_per_learner: Number(mean(mins).toFixed(1)), minutes_per_day: Number((mean(mins) / DAYS).toFixed(2)), mix_minutes_by_source: sideAB.mix, summary, needs: sideAB.needs, lltm: sideAB.lltm, retest: sideAB.ret, cov: sideAB.cov, perMeasure };
if (STRATA) { // per-subgroup accuracy (100 - MAE), the guess baseline (pooled-mean guess) and the share of error removed; SIMULATED proxies, not diagnoses
  const rowsOf = (st) => [...sideAB[st], ...sideBA[st]];
  const GB = rowsOf('GB'); const groups = { all: TAGGED.map((_, i) => i) };
  for (const b of BANDS) groups[b] = TAGGED.map((L, i) => (bandOf(L) === b ? i : -1)).filter((i) => i >= 0);
  for (const pf of ['adhd', 'dyslexia', 'ell', 'low', 'high']) groups[pf] = TAGGED.map((L, i) => (L.profile === pf ? i : -1)).filter((i) => i >= 0);
  groups.none = TAGGED.map((L, i) => (!L.profile ? i : -1)).filter((i) => i >= 0);
  const gm = (rows, ix, ks) => mean(ix.map((i) => mean(ks ? ks.map((k) => rows[i][k]) : rows[i])));
  // the measures a group's proxy actually shifts by 0.5 SD or more (the rest of its 100 measures dilute a group's average toward the pooled one)
  const SL = require('./lib/scorecard-strata');
  const shiftedKs = (g) => { const m = SL.AGE_PROFILES[g] || SL.PROFILE_DEFS[g]; if (!m) return null; const out = []; IDS.forEach((id, k) => { const v = m.shift[id] !== undefined ? m.shift[id] : (m.shift['*'] || 0); if (Math.abs(v) >= 0.5) out.push(k); }); return out.length ? out : null; };
  const table = {};
  for (const st of ['D0', 'S0', 'S1', 'S5']) { const rows = rowsOf(st); table[st] = {}; for (const [g, ix] of Object.entries(groups)) { const e = gm(rows, ix); const gb = gm(GB, ix); table[st][g] = { n: ix.length, acc: Number((100 - e).toFixed(2)), guess_acc: Number((100 - gb).toFixed(2)), removed: Number((1 - e / gb).toFixed(3)) }; const ks = shiftedKs(g); if (ks) { const e2 = gm(rows, ix, ks); const g2 = gm(GB, ix, ks); table[st][g].shifted = { measures: ks.length, acc: Number((100 - e2).toFixed(2)), guess_acc: Number((100 - g2).toFixed(2)), removed: Number((1 - e2 / g2).toFixed(3)) }; } } }
  const GROUPS10 = [...BANDS, 'adhd', 'dyslexia', 'ell', 'low', 'high'];
  const gap = {}; for (const st of Object.keys(table)) { const v = GROUPS10.map((g) => [g, table[st][g].acc]); const hi = v.reduce((a, b) => (b[1] > a[1] ? b : a)); const lo = v.reduce((a, b) => (b[1] < a[1] ? b : a)); gap[st] = { worst: lo[0], worst_acc: lo[1], best: hi[0], best_acc: hi[1], gap: Number((hi[1] - lo[1]).toFixed(2)) }; }
  out.strata = { days: DAYS, fix: [...FIX], table, gap };
  console.log('STRATA (SIMULATED proxies) days=' + DAYS + ' fix=' + ([...FIX].join(',') || 'none') + '  accuracy% [guess baseline% | share of error removed]');
  console.log(' on the measures each proxy shifts by >=0.5 SD (S5): ' + GROUPS10.filter((g) => table.S5[g].shifted).map((g) => g + '(' + table.S5[g].shifted.measures + ') ' + table.S5[g].shifted.acc + '[' + table.S5[g].shifted.guess_acc + '|' + (table.S5[g].shifted.removed * 100).toFixed(0) + '%]').join('  '));
  for (const st of Object.keys(table)) { console.log(' ' + st + ': ' + ['all', ...GROUPS10].map((g) => g + ' ' + table[st][g].acc + '[' + table[st][g].guess_acc + '|' + (table[st][g].removed * 100).toFixed(0) + '%]').join('  ')); console.log('    worst ' + gap[st].worst + ' ' + gap[st].worst_acc + ', best ' + gap[st].best + ' ' + gap[st].best_acc + ', gap ' + gap[st].gap); }
}
const o = arg('out'); if (o) fs.writeFileSync(o, JSON.stringify(out));
const line = (st) => `${st}: ACC ${summary[st].accuracy}% pairs<=5 ${(summary[st].learners_w5 * 100).toFixed(0)}% measures w5>=99% ${summary[st].measures_w5_99} MAE ${summary[st].mae}  measures<=5 ${summary[st].measures_le5}  <=10 ${summary[st].measures_le10}  learners within5 ${(summary[st].learners_w5 * 100).toFixed(0)}% within10 ${(summary[st].learners_w10 * 100).toFixed(0)}%  groups(mae/le5) a ${summary[st].groups.a.mae}/${summary[st].groups.a.le5} b ${summary[st].groups.b.mae}/${summary[st].groups.b.le5} c ${summary[st].groups.c.mae}/${summary[st].groups.c.le5} d ${summary[st].groups.d.mae}/${summary[st].groups.d.le5}`;
console.log(`half=${HALF} blind=${BLIND} truth_factors=${A.truth_factors} minutes/learner ${out.minutes_total_per_learner} (${out.minutes_per_day}/day)`);
for (const st of stages) console.log(line(st));
{ // Phase 4 summary: the ten worst measures at S5 and the footprint minutes (all SIMULATED)
  const w = Object.entries(perMeasure.S5).map(([id, v]) => [id, v[0]]).sort((a, b) => b[1] - a[1]);
  console.log('worst10 S5: ' + w.slice(0, 10).map(([id, v]) => `${id} ${v}`).join(', '));
  console.log(`worst20 mean ${mean(w.slice(0, 20).map((x) => x[1])).toFixed(2)}  within5 ${summary.S5.measures_le5}  within7 ${w.filter((x) => x[1] <= 7).length}` + (FOOT_ON ? `  footprint minutes charged/learner ${out.foot.charged_min_per_learner} (${out.foot.charged_min_per_day}/day)` : ''));
}
