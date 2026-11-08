/**
 * Stylised long-horizon, extreme-learner simulation of the scorecard (docs/SCORE-95.md part 4). SIMULATED. It is a MODEL OF THE CARD, not the card: it does not run the app's planner or
 * signals. Each measure is read by (a) behaviour, as the real card does, and (b) optionally a few extra probes inside a time budget. It exists to answer what the 30-day dumps cannot:
 * what 6 and 12 months of use, and each kind of extreme learner, do to trait accuracy and decision accuracy, and whether decision-aware probe choice beats sd-reduction choice.
 *
 *   node scripts/score-95-sim.js [--seed=95001] [--n=60] [--world=research|real] [--json=out.json] [--md=out.md]
 *
 * Model (z = trait in population-sd units; every reading is x = z + error, with error variance in z^2):
 *   behaviour  error = persistent part (a context-bound bias, never averages out) + fresh part falling as 1/(activity x months of evidence, capped at 6 months).
 *              persistent var = (1-vHigh^2)/vHigh^2, month-1 total var = (1-vCentral^2)/vCentral^2, both from services/scorecard/ceilings.js (research-based, ASSUMED). world=real
 *              scales every v by REAL_SHRINK, fitted so that month 1 matches the dumped pipeline at day 30 (a calibration, not a proof).
 *   probes     one reading from a single item with correlation v_p(class); 40% of its error is persistent per learner and measure (a self-view or task bias shared by repeats), so
 *              repeats saturate. Budget: PROBE_SEC_PER_MIN x the learner's active minutes, i.e. at most 5% of study time.
 *   weights    the card weighs sources by their BELIEVED variance; a learner who games or is inconsistent has a larger TRUE error than believed, so the card is over-confident, as it would be.
 *              A conflict check (|gap| > 1.5 sd of the gap) cuts the believed precision of behaviour by 4, like active-measure.js CONFLICT_Z.
 *   learners   ordinary, fast, slow, noisy, inconsistent (drift), adversarial (games 30% of measures), child (fewer sessions, noisier, weaker self-view), sparse (few sittings).
 * Seeds: CAL_SEED chooses the probe parameters, HELD_SEED (never used for choosing) gives the numbers reported.
 */
'use strict';
const fs = require('fs');
const { CLASSES, INDEX } = require('../services/scorecard/ceilings');
const { STATS } = require('../services/scorecard/stats');
const D = require('../services/scorecard/decisions');

const SD_PTS = 22.4; // sd of the true values in the dumped learners
const IDS = STATS.map((s) => s.id);
const IMPACT = Object.fromEntries(STATS.map((s) => [s.id, s.impact]));
const CAL_SEED = 95001; const HELD_SEED = 95777;
const REAL_SHRINK = 0.45; // world=real: month 1 about 82.7 like the dumped realistic run (calibrated on CAL_SEED, 25 per kind, not a proof)
const WEEKS_MONTH = 4.345;
const EVIDENCE_CAP_MONTHS = 6;
const PROBE_SEC = 20; const SESSION_MIN_PER_DAY = 20; const STUDY_DAYS_PER_WEEK = 5; const BUDGET_SHARE = 0.05;
const PROBE_V = { scale: 0.55, preference: 0.5, performance: 0.5, reasoning: 0.4, hidden: 0.35, memory: 0.35, habit: 0.3, contrast: 0.25, benefit: 0.2 };
const PROBE_PERSIST = 0.4;
const TAUS = [0.8, 0.9, 0.95];

const KINDS = {
  ordinary: { act: 1, noise: 1, pers: 1, drift: 0.04, probeV: 1, game: 0 },
  fast: { act: 1.6, noise: 1, pers: 1, drift: 0.04, probeV: 1, game: 0 },
  slow: { act: 0.6, noise: 1.2, pers: 1, drift: 0.04, probeV: 1, game: 0 },
  noisy: { act: 1, noise: 2.5, pers: 1.2, drift: 0.04, probeV: 0.8, game: 0 },
  inconsistent: { act: 1, noise: 1.5, pers: 1.5, drift: 0.25, probeV: 0.8, game: 0 },
  adversarial: { act: 1, noise: 1, pers: 1, drift: 0.04, probeV: 0.6, game: 0.3 },
  child: { act: 0.5, noise: 1.8, pers: 1.3, drift: 0.1, probeV: 0.7, game: 0 },
  sparse: { act: 0.25, noise: 1.5, pers: 1, drift: 0.04, probeV: 1, game: 0 },
};

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function gauss(r) { let u = 0; while (u === 0) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }
const evar = (v) => (1 - v * v) / (v * v);
const toPts = (z) => Math.max(0, Math.min(100, 50 + SD_PTS * z));

/** Config: how the extra measurement budget is spent. */
const METHODS = { card: null, anchors: 'round', activeSd: 'sd', activeDecision: 'decision' };

function newLearner(r, kind, world) {
  const K = KINDS[kind]; const shrink = world === 'real' ? REAL_SHRINK : 1;
  const L = { kind, K, m: {} };
  for (const id of IDS) {
    const cls = INDEX[id]; const c = CLASSES[cls];
    const vC = Math.min(0.97, c.v[1] * shrink); const vH = Math.min(0.98, Math.max(vC + 0.01, c.v[2] * shrink));
    const persB = evar(vH) * K.pers; const total1 = evar(vC);
    const fresh1 = Math.max(0.02, total1 - evar(vH)) * K.noise;
    const gamed = r() < K.game;
    const vp = Math.min(0.9, PROBE_V[cls] * K.probeV);
    const eP = evar(vp);
    L.m[id] = {
      z: Math.max(-2.3, Math.min(2.3, gauss(r))),
      persB, fresh1, gamed, biasB: gauss(r) * Math.sqrt(gamed ? 1.0 : persB) * (gamed ? 1 : 1), // gaming: a big persistent error the card does not know about
      persP: PROBE_PERSIST * eP, freshP: (1 - PROBE_PERSIST) * eP, biasP: gauss(r) * Math.sqrt(PROBE_PERSIST * eP),
      probes: { n: 0, sum: 0 }, driftPrec: 0,
    };
    L.m[id].zNow = L.m[id].z;
  }
  return L;
}

/** The card's estimate of every measure at `months` of use: believed variances, actual draws. Returns { id: { mean, sd } } in z units. */
function estimate(r, L, weeks) {
  const months = weeks / WEEKS_MONTH; const t = Math.max(0.02, Math.min(EVIDENCE_CAP_MONTHS, L.K.act * months));
  const out = {};
  for (const id of IDS) {
    const M = L.m[id];
    const truthNow = M.zNow;
    const EbBelieved = M.persB / L.K.pers + (M.fresh1 / L.K.noise) / t; // what the card thinks (class values; it cannot know the learner's own noise)
    const EbActual = (M.gamed ? 1.0 : M.persB) + M.fresh1 / t + L.K.drift * L.K.drift * 2;
    const xb = truthNow + M.biasB + gauss(r) * Math.sqrt(M.fresh1 / t);
    let prec = 1 / EbBelieved; let num = xb * prec;
    if (M.probes.n > 0) {
      const n = M.probes.n; const xp = M.probes.sum / n + M.biasP * 0; // sum holds the true-z + fresh draws; persistent bias added at read below
      const EpActual = M.persP + M.freshP / n; const EpBelieved = EpActual;
      const xProbe = xp + M.biasP;
      // conflict: behaviour and probes disagree by more than both could be right -> believed behaviour precision cut
      const gap = Math.abs(xb - xProbe) / Math.sqrt(EbBelieved + EpBelieved);
      let precB = 1 / EbBelieved;
      if (gap > 1.5) precB *= 0.25;
      prec = precB; num = xb * precB;
      const pp = 1 / EpBelieved; prec += pp; num += xProbe * pp;
      void EbActual;
    }
    const post = 1 + prec; // N(0,1) prior
    out[id] = { mean: num / post, sd: Math.sqrt(1 / post), zTrue: truthNow };
  }
  return out;
}

/** Spend `count` probes this week. pick = 'round' | 'sd' | 'decision'. State is on L.m[id].probes: { n, sum } with sum of (zNow + fresh error) draws. */
function spendProbes(r, L, count, pick, week, est) {
  if (!pick || count < 1) return;
  const gains = {};
  const gainOf = (id) => {
    const e = est[id]; const M = L.m[id]; const n = M.probes.n;
    const EpNow = M.persP + M.freshP / Math.max(1, n); const EpNext = M.persP + M.freshP / (n + 1);
    const precNow = 1 / (e.sd * e.sd); const gainPrec = n === 0 ? 1 / (M.persP + M.freshP) : 1 / EpNext - (n ? 1 / EpNow : 0);
    const sdAfter = Math.sqrt(1 / (precNow + Math.max(0, gainPrec)));
    if (pick === 'sd') return (e.sd - sdAfter);
    return D.expectedGain(50 + SD_PTS * e.mean, SD_PTS * e.sd, SD_PTS * sdAfter, D.EDGES.hard) * (0.5 + IMPACT[id] / 2) + 0.35 * D.expectedGain(50 + SD_PTS * e.mean, SD_PTS * e.sd, SD_PTS * sdAfter, D.EDGES.soft) * (0.5 + IMPACT[id] / 2);
  };
  if (pick === 'round') {
    const order = IDS.filter((id) => ['scale', 'preference', 'hidden', 'performance', 'reasoning'].includes(INDEX[id]));
    for (let k = 0; k < count; k++) takeProbe(r, L, order[(week * count + k) % order.length], est);
    return;
  }
  for (const id of IDS) gains[id] = gainOf(id);
  for (let k = 0; k < count; k++) {
    let best = IDS[0]; let bg = -1;
    for (const id of IDS) if (gains[id] > bg) { bg = gains[id]; best = id; }
    takeProbe(r, L, best, est);
    // the draw changed what is known only a little; recompute this measure's gain with its updated believed variance, mean held
    const e = est[best]; const M = L.m[best]; const n = M.probes.n;
    const sdNew = Math.sqrt(1 / (1 / (e.sd * e.sd) + 1 / (M.persP + M.freshP / n)));
    e.sd = sdNew; gains[best] = gainOf(best);
  }
}
function takeProbe(r, L, id, est) {
  const M = L.m[id]; M.probes.n += 1; M.probes.sum += M.zNow + gauss(r) * Math.sqrt(M.freshP);
  if (est[id] && M.probes.n === 1) est[id].sd = Math.min(est[id].sd, Math.sqrt(1 / (1 / (est[id].sd ** 2) + 1 / (M.persP + M.freshP))));
}

function driftTo(r, L) { for (const id of IDS) { const M = L.m[id]; M.zNow += gauss(r) * L.K.drift / Math.sqrt(WEEKS_MONTH); } }

/** Run one learner for 52 weeks under a method; scores at the checkpoint weeks. */
function runLearner(seed, kind, method, world, checkpoints = [4, 26, 52], budget = BUDGET_SHARE) {
  const r = rng(seed);
  const L = newLearner(r, kind, world); const pick = METHODS[method];
  const rr = rng(seed ^ 0x9e3779b9); // the same learner under every method: only the probe stream differs
  const weeklyProbes = pick ? Math.floor(budget * L.K.act * STUDY_DAYS_PER_WEEK * SESSION_MIN_PER_DAY * 60 / PROBE_SEC) : 0;
  const res = {};
  let est = null;
  for (let w = 1; w <= 52; w++) {
    driftTo(rr, L);
    if (pick) { est = estimate(rr, L, w); spendProbes(rr, L, weeklyProbes, pick, w, est); }
    if (checkpoints.includes(w)) {
      const e = estimate(rr, L, w);
      const accRows = []; const pairsHard = []; const pairsSoft = []; const byCls = {}; const conf = {};
      for (const tau of TAUS) conf[tau] = { leans: 0, right: 0, clear: 0, caught: 0, correct: 0, n: 0 };
      for (const id of IDS) {
        const est1 = toPts(e[id].mean); const tr = toPts(e[id].zTrue);
        const errP = Math.abs(est1 - tr); const guessErr = Math.abs(50 - tr);
        accRows.push({ id, err: errP, guess: guessErr });
        pairsHard.push({ est: est1, truth: tr }); pairsSoft.push({ est: est1, truth: tr });
        // a confident lean: act only when the card's own posterior puts at least tau on the truth being beyond that edge
        const sdP = SD_PTS * e[id].sd; const pHi = 1 - D.cdf((D.EDGES.hard.hi - est1) / sdP); const pLo = D.cdf((D.EDGES.hard.lo - est1) / sdP); const tb = D.decide(tr, D.EDGES.hard);
        for (const tau of TAUS) {
          const c = conf[tau]; const act = pHi >= tau ? 1 : pLo >= tau ? -1 : 0; c.n += 1;
          if (act) { c.leans += 1; if (act === tb) c.right += 1; }
          if (tb) { c.clear += 1; if (act === tb) c.caught += 1; }
          if (act === tb) c.correct += 1;
        }
        const c = INDEX[id]; (byCls[c] || (byCls[c] = [])).push({ err: errP, guess: guessErr, est: est1, truth: tr });
      }
      res[w] = { conf, rows: accRows, hard: D.decisionScore(pairsHard, D.EDGES.hard), soft: D.decisionScore(pairsSoft, D.EDGES.soft), byCls };
    }
  }
  return res;
}

const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);

/** Many learners per kind: aggregate by method, checkpoint and kind. */
function run({ seed = HELD_SEED, n = 60, world = 'research', methods = Object.keys(METHODS), kinds = Object.keys(KINDS), checkpoints = [4, 26, 52], budget = BUDGET_SHARE } = {}) {
  const out = { seed, n, world, label: 'SIMULATED (stylised model of the card, not the app)', cells: {} };
  for (const method of methods) for (const kind of kinds) for (const w of checkpoints) {
    const per = [];
    for (let i = 0; i < n; i++) per.push(runLearner(seed * 1000 + kinds.indexOf(kind) * 100003 + i, kind, method, world, checkpoints, budget)[w]);
    const accL = per.map((p) => 100 - mean(p.rows.map((x) => x.err)));
    const guessL = per.map((p) => 100 - mean(p.rows.map((x) => x.guess)));
    const decL = per.map((p) => p.hard.accuracy); const decS = per.map((p) => p.soft.accuracy);
    const sorted = (v) => v.slice().sort((a, b) => a - b); const worst = (v, q) => mean(sorted(v).slice(0, Math.max(1, Math.ceil(v.length * q))));
    const guessDec = mean(per.map((p) => 100 * p.hard.n / p.hard.n)) && null;
    out.cells[`${method}|${kind}|${w}`] = {
      acc: mean(accL), guess: mean(guessL), removed: 1 - (100 - mean(accL)) / (100 - mean(guessL)),
      dec: mean(decL), decSoft: mean(decS), wrongWay: mean(per.map((p) => p.hard.wrongWay)), leanPrecision: mean(per.map((p) => p.hard.leanPrecision).filter((v) => v !== null)),
      leanSafe: mean(per.map((p) => p.hard.leanSafe).filter((v) => v !== null)),
      conf: Object.fromEntries(TAUS.map((t) => { const sum = (k) => per.reduce((a, p) => a + p.conf[t][k], 0); return [t, { precision: sum('leans') ? 100 * sum('right') / sum('leans') : null, coverage: 100 * sum('caught') / Math.max(1, sum('clear')), leansPerLearner: sum('leans') / per.length, decisionAcc: 100 * sum('correct') / sum('n') }]; })),
      worst10acc: worst(accL, 0.1), worst10dec: worst(decL, 0.1), minDec: Math.min(...decL), minAcc: Math.min(...accL), n,
      neverLean: mean(per.map((p) => { const t = p; void t; return NaN; }).filter((v) => !Number.isNaN(v))) || null, guessDec,
    };
  }
  return out;
}

/** Share of true values in the middle band: the accuracy of "never lean", the baseline for decision accuracy under this population. */
function neverLeanBaseline(seed, n = 4000) { const r = rng(seed); let mid = 0; for (let i = 0; i < n; i++) { const z = Math.max(-2.3, Math.min(2.3, gauss(r))); if (D.decide(toPts(z), D.EDGES.hard) === 0) mid += 1; } return 100 * mid / n; }

function aggregateKinds(out, method, w, kinds = Object.keys(KINDS)) {
  const cs = kinds.map((k) => out.cells[`${method}|${k}|${w}`]).filter(Boolean);
  return { acc: mean(cs.map((c) => c.acc)), guess: mean(cs.map((c) => c.guess)), dec: mean(cs.map((c) => c.dec)), decSoft: mean(cs.map((c) => c.decSoft)), wrongWay: mean(cs.map((c) => c.wrongWay)), leanPrecision: mean(cs.map((c) => c.leanPrecision)), leanSafe: mean(cs.map((c) => c.leanSafe)) };
}


/** Markdown tables for docs/SCORE-95.md. */
function markdown(out, methods = ['card', 'activeDecision']) {
  const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : 'n/a'); const o = [];
  const WK = { 4: 'month 1', 26: 'month 6', 52: 'month 12' };
  o.push(`World ${out.world}, seed ${out.seed} (${out.seed === HELD_SEED ? 'HELD-OUT' : 'calibration'}), ${out.n} learners per kind, ${out.label}. Accuracy = 100 - MAE in points over all 100 measures; guess = always the population middle; decision = same side of 30/70 as the truth; never-lean baseline ${f1(out.neverLean)}.`, '');
  o.push('| method | when | trait acc | guess | error removed | decision acc | decision soft | wrong-way % | confident leans (tau .95): precision | coverage of clear traits |', '|---|---|---|---|---|---|---|---|---|---|');
  for (const m of methods) for (const w of [4, 26, 52]) {
    const cs = Object.keys(KINDS).map((k) => out.cells[`${m}|${k}|${w}`]); const a = aggregateKinds(out, m, w);
    const pr = mean(cs.map((c) => c.conf[0.95].precision).filter((v) => v !== null)); const cov = mean(cs.map((c) => c.conf[0.95].coverage));
    o.push(`| ${m} | ${WK[w]} | ${f1(a.acc)} | ${f1(a.guess)} | ${f1(100 * (1 - (100 - a.acc) / (100 - a.guess)))}% | ${f1(a.dec)} | ${f1(a.decSoft)} | ${f1(a.wrongWay)} | ${f1(pr)} | ${f1(cov)}% |`);
  }
  o.push('', '| learner kind | method | when | trait acc | guess | removed | decision acc | worst-10% decision | worst learner decision | worst learner trait acc |', '|---|---|---|---|---|---|---|---|---|---|');
  for (const k of Object.keys(KINDS)) for (const w of [4, 52]) { const c = out.cells[`${methods[methods.length - 1]}|${k}|${w}`]; o.push(`| ${k} | ${methods[methods.length - 1]} | ${WK[w]} | ${f1(c.acc)} | ${f1(c.guess)} | ${f1(100 * c.removed)}% | ${f1(c.dec)} | ${f1(c.worst10dec)} | ${f1(c.minDec)} | ${f1(c.minAcc)} |`); }
  return o.join('\n');
}

module.exports = { markdown, run, runLearner, neverLeanBaseline, aggregateKinds, KINDS, METHODS, CAL_SEED, HELD_SEED, REAL_SHRINK, BUDGET_SHARE, PROBE_SEC, SD_PTS, rng, gauss };

if (require.main === module) {
  const arg = (n, d = '') => { const a = process.argv.slice(2).find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
  const out = run({ seed: Number(arg('seed', HELD_SEED)), n: Number(arg('n', 60)), world: arg('world', 'research') });
  out.neverLean = neverLeanBaseline(1);
  if (arg('json')) fs.writeFileSync(arg('json'), JSON.stringify(out));
  if (arg('md')) fs.writeFileSync(arg('md'), markdown(out, ['card', 'anchors', 'activeSd', 'activeDecision']));
  const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : 'n/a');
  for (const m of Object.keys(METHODS)) for (const w of [4, 26, 52]) { const a = aggregateKinds(out, m, w); console.log(m, 'wk', w, 'acc', f1(a.acc), 'guess', f1(a.guess), 'dec', f1(a.dec), 'soft', f1(a.decSoft), 'wrong', f1(a.wrongWay), 'leanPrec', f1(a.leanPrecision)); }
}
