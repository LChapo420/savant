#!/usr/bin/env node
/**
 * One month of use, SIMULATED (docs/SCORE-MONTH.md). Four routes to accuracy, each run through the REAL modules (direct-tasks.js, confirm-card.js, decision-bandit.js, learner-stats.js):
 *   A  directly measured traits     8 scorecard measures read by tasks, inside the 5% budget, fused with a behaviour read
 *   B  learner-confirmed traits     28 preference + scale measures, asked and corrected on the profile card
 *   C  outcome-tested decisions     6 content decisions picked by the per-learner bandit from their own lesson outcomes
 *   E  logged stats (new)           time-of-day, attention drop-off, slip vs misconception, from the answer log
 * Group D (behaviour only) is NOT re-simulated here: its numbers come from the pipeline runs in docs/SCORE-95.md (reported there, quoted in the md).
 *
 * Learner kinds: ordinary, fast, slow, noisy, inconsistent, adversarial, child, sparse, random, extreme. The sim's noise is NOT the modules' nominal noise for noisy/inconsistent/random/adversarial
 * learners: the modules assume a nominal model, the sim breaks it, which is the point. Truth is a latent number the learner "really has"; every metric against it is the OLD metric (100 - mean
 * absolute error, points), with the guess baseline (population mean) beside it. Seeds: development 31001; held-out 77123 (final numbers, run once, nothing tuned on it).
 *
 *   node scripts/score-month-sim.js --seed=77123 --n=60 [--md=out.md] [--json=out.json] [--noise=0.8] [--effect=0.35]
 */
'use strict';
const D = require('../services/scorecard/direct-tasks');
const C = require('../services/scorecard/confirm-card');
const B = require('../services/scorecard/decision-bandit');
const L = require('../services/scorecard/learner-stats');
const { INDEX } = require('../services/scorecard/ceilings');

const mulberry = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const mkNormal = (rng) => () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
const clamp = (x, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, x));

// kind: study minutes in month 1, active days, direct-task noise multiplier (truth), self-report sd, answer rate to the card, careless rate, age band, behaviour-read quality multiplier
const KINDS = {
  ordinary: { min: 900, days: 22, nm: 1, self: 6, resp: 0.9, careless: 0.02, band: 'adult', lessons: 36 },
  fast: { min: 1000, days: 24, nm: 0.9, self: 6, resp: 0.9, careless: 0.02, band: 'adult', lessons: 40 },
  slow: { min: 800, days: 20, nm: 1.1, self: 7, resp: 0.85, careless: 0.03, band: 'adult', lessons: 30 },
  noisy: { min: 900, days: 22, nm: 1.6, self: 10, resp: 0.7, careless: 0.12, band: 'adult', lessons: 36 },
  inconsistent: { min: 900, days: 22, nm: 1.3, self: 13, resp: 0.7, careless: 0.08, band: 'adult', lessons: 36, drift: true },
  adversarial: { min: 900, days: 22, nm: 1, self: 7, resp: 0.8, careless: 0.02, band: 'adult', lessons: 36, games: 0.25 },
  child: { min: 600, days: 18, nm: 1.35, self: 12, resp: 0.8, careless: 0.08, band: 'child', lessons: 24 },
  sparse: { min: 200, days: 6, nm: 1, self: 7, resp: 0.5, careless: 0.03, band: 'teen', lessons: 8 },
  random: { min: 800, days: 20, nm: 1.8, self: 22, resp: 0.6, careless: 0.3, band: 'adult', lessons: 30 },
  extreme: { min: 900, days: 22, nm: 1, self: 6, resp: 0.9, careless: 0.02, band: 'adult', lessons: 36, tails: true },
};
const BEH_V = { performance: 0.55, habit: 0.5, memory: 0.4, scale: 0.4, preference: 0.2 }; // behaviour-read correlation with truth, from the real-world pipeline (docs/SCORE-95.md: 8% removed ~ v .4)
const DIRECT = ['processing_velocity', 'working_memory_span', 'prior_knowledge', 'vocabulary_ceiling', 'notation_comfort', 'confidence_calibration', 'decay_rate', 'retention_index'];

function drawTruth(rng, nrm, kind) { let t = 50 + 17 * nrm(); if (kind.tails) t = rng() < 0.5 ? 50 + 17 * (1.6 + 0.6 * Math.abs(nrm())) : 50 - 17 * (1.6 + 0.6 * Math.abs(nrm())); return clamp(t); }
function behaviourRead(rng, nrm, T, v) { return { est: 50 + v * (v * (T - 50) + Math.sqrt(1 - v * v) * 17 * nrm()), sd: 17 * Math.sqrt(1 - v * v) }; }

// ── A: direct tasks ───────────────────────────────────────────────────────
function simDirect(rng, nrm, kind, truths) {
  const band = kind.band; const A = D.AGE[band]; const reads = { speed_task: [], span_task: [], calibration: [] };
  const bias = { speed_task: 5 * nrm(), span_task: 5 * nrm(), calibration: 4 * nrm() };
  const kmult = kind.drift ? 1.5 : 1;
  const post = { prior_knowledge: D.newPosterior(), vocabulary_ceiling: D.newPosterior(), notation_comfort: D.newPosterior() };
  const dcost = D.TASKS.precheck.cost * (band === 'child' ? 0.75 : 1);
  let spent = 0; const state = { studyMinutesMonth: kind.min, spentMin: 0, perTask: {}, band, consent: true, reserveMin: Math.min(6, 0.15 * D.BUDGET_SHARE * kind.min) }; const dayList = Array.from({ length: 30 }, (_, i) => i).filter(() => true);
  const active = new Set(); while (active.size < kind.days) active.add(Math.floor(rng() * 30));
  const blocks = { speed_task: 0, span_task: 0, precheck: 0 };
  const calAnswers = []; const rateCost = 0.03; const nAns = Math.round(kind.min * 2 * 0.12);
  // calibration: ratings ride on answers all month
  const biasTrue = ((truths.confidence_calibration - 50) / 50) * -0.25; // high points = under-confident side matches biasToPoints
  for (let i = 0; i < nAns; i++) { const p = clamp(0.55 + 0.25 * nrm(), 0.1, 0.95); const correct = rng() < p ? 1 : 0; const conf = clamp(p + biasTrue + 0.16 * nrm() * kind.nm + bias.calibration / 400, 0.02, 0.99); const careless = rng() < kind.careless; calAnswers.push({ correct, conf: careless ? rng() : conf }); }
  spent += nAns * rateCost;
  for (const day of dayList) {
    if (!active.has(day)) continue;
    state.spentMin = spent; state.minutesToday = 0;
    const plan = D.planDay(state);
    for (const task of plan) {
      const T = D.TASKS[task]; const sandbag = kind.games && rng() < kind.games ? -20 : 0; const dn = (T.day || 0) * kind.nm * kmult * nrm();
      if (task === 'speed_task' || task === 'span_task') {
        const key = task === 'speed_task' ? 'processing_velocity' : 'working_memory_span'; const val = clamp(truths[key] + bias[task] + dn + T.trial * kind.nm * nrm() + sandbag);
        reads[task].push({ value: val, day }); blocks[task] += 1;
      } else {
        const m = ['prior_knowledge', 'vocabulary_ceiling', 'notation_comfort'].sort((a, b) => D.moments(post[b]).sd - D.moments(post[a]).sd)[0];
        const th = (truths[m] - 50) / D.LOGIT_POINTS; const sit = rng() < kind.careless * 2 ? 1 : 0;
        for (let i = 0; i < A.precheckItems; i++) {
          const b = D.nextDifficulty(post[m]); const bErr = b + 0.5 * nrm(); const p = sandbag || sit ? 0.2 : D.pRasch(th + 0.25 * 0, bErr, 0.2);
          post[m] = D.updatePosterior(post[m], rng() < p, b, 0.2);
        }
        blocks.precheck += 1;
      }
      spent += T.cost * (band === 'child' && task === 'span_task' ? 0.8 : 1); state.minutesToday += T.cost;
      const cs = D.combine(reads[task] || [], task === 'precheck' ? 'speed_task' : task, { band }); state.perTask[task] = { k: (reads[task] || []).length, sd: task === 'precheck' ? Math.max(...Object.keys(post).map((k) => D.precheckReading(post[k]).sd)) : cs.sd };
    }
  }
  const out = {};
  const beh = (id, v) => behaviourRead(rng, nrm, truths[id], v);
  const fuseOne = (id, d, v = BEH_V.performance) => D.fuse(d, beh(id, v));
  out.processing_velocity = fuseOne('processing_velocity', D.combine(reads.speed_task, 'speed_task', { band }));
  out.working_memory_span = fuseOne('working_memory_span', D.combine(reads.span_task, 'span_task', { band }));
  for (const m of Object.keys(post)) out[m] = fuseOne(m, D.precheckReading(post[m]));
  const cr = D.calibrationReading(calAnswers); const cpts = cr ? D.biasToPoints(cr.bias) : 50;
  out.confidence_calibration = fuseOne('confidence_calibration', cr ? { est: cpts, sd: D.combine([{ value: cpts, day: 1 }, { value: cpts, day: 2 }, { value: cpts, day: 3 }, { value: cpts, day: 4 }], 'calibration', { band }).sd } : { est: 50, sd: 17 });
  // decay from reviews
  const m = ((truths.decay_rate - 50) / 17) * 0.8; const nrev = Math.round(kind.min * 0.1); const rv = [];
  for (let i = 0; i < nrev; i++) { const dt = [1, 2, 3, 5, 7, 10, 14][Math.floor(rng() * 7)]; const ms = m + 0.5 * nrm(); const p = clamp(0.2 + 0.7 * 2 ** (-dt / (6 * 2 ** ms)), 0.01, 0.99); const ok = rng() < kind.careless * 0.5 ? rng() < 0.5 : rng() < p; rv.push({ correct: ok, dt }); }
  const dr = D.decayReading(rv); const dpoint = dr ? { est: dr.points, sd: Math.sqrt(dr.pointsSd ** 2 + 36) } : { est: 50, sd: 17 };
  out.decay_rate = fuseOne('decay_rate', dpoint, BEH_V.memory);
  const ri = dr ? { est: 50 + 0.85 * (dr.points - 50), sd: Math.sqrt((0.85 * dr.pointsSd) ** 2 + 8 ** 2 + 36) } : { est: 50, sd: 17 };
  out.retention_index = fuseOne('retention_index', ri, BEH_V.memory);
  return { out, spent, blocks, nAns, nrev };
}

// ── B: confirmed card ─────────────────────────────────────────────────────
function simConfirm(rng, nrm, kind, truthsB, budgetLeft) {
  const band = kind.band; let st = C.newState(); let spent = 0; const card = {}; const beh = {};
  for (const id of C.CONFIRMABLE) { const v = INDEX[id] === 'scale' ? BEH_V.scale : BEH_V.preference; beh[id] = behaviourRead(rng, nrm, truthsB[id], v); card[id] = { est: beh[id].est, sd: beh[id].sd }; }
  const active = new Set(); while (active.size < kind.days) active.add(Math.floor(rng() * 30)); const days = [...active].sort((a, b) => a - b);
  for (const day of days) {
    const qs = C.nextQuestions(st, { day, card, band, max: C.MAX_PER_DAY });
    for (const q of qs) {
      if (spent + 0.12 > budgetLeft) break; spent += 0.12; if (rng() > kind.resp) continue;
      const T = truthsB[q.id]; let s = T + kind.self * nrm() + (kind.drift ? 6 * nrm() : 0); if (kind.games && rng() < kind.games) s = T + (rng() < 0.5 ? -30 : 30); if (rng() < kind.careless) s = 100 * rng();
      st = C.applyAnswer(st, q.id, { value: C.nearestStep(clamp(s), band), shown: q.shown, day, how: 'set' });
    }
  }
  const out = {}; const endorse = [];
  for (const id of C.CONFIRMABLE) {
    const r = C.confirmedReading(st, id, { band }); const e = r ? D.fuse(card[id], r) : card[id]; out[id] = e;
    endorse.push(Math.abs(e.est - (truthsB[id] + 4 * nrm())) <= 10 ? 1 : 0);
  }
  const answered = C.CONFIRMABLE.filter((id) => (st.answers[id] || []).length).length;
  return { out, spent, endorse, answered, correction: C.correctionStats(st), behaviour: beh };
}

// ── C: bandit ─────────────────────────────────────────────────────────────
function simBandit(rng, nrm, kind, noise, effect = 0.35) {
  const eff = {}; const mat = []; for (const d of B.DECISIONS) { const e = {}; const live = rng() < 0.6; d.options.forEach((o) => { e[o] = (live ? effect : effect * 0.09) * nrm(); }); eff[d.id] = e; if (live) mat.push(d.id); }
  let st = B.newState(); let gain = 0; let explored = 0; const nL = kind.lessons;
  for (let i = 0; i < nL; i++) {
    const { assignment, explored: ex } = B.choose(st, rng); explored += ex;
    let y = 0; let g = 0; for (const d of B.DECISIONS) { y += eff[d.id][assignment[d.id]]; g += eff[d.id][assignment[d.id]] - eff[d.id][d.default]; }
    gain += g; st = B.record(st, assignment, 0.6 + y + noise * nrm() * (kind.nm > 1.2 ? 1.2 : 1));
  }
  const pick = B.best(st); const rows = [];
  for (const d of B.DECISIONS) {
    const e = eff[d.id]; const bestOpt = d.options.reduce((a, o) => (e[o] > e[a] ? o : a), d.options[0]); const reg = e[bestOpt] - e[pick[d.id].option];
    const defReg = e[bestOpt] - e[d.default]; const rnd = d.options.reduce((s, o) => s + (e[bestOpt] - e[o]), 0) / d.options.length;
    rows.push({ pBest: pick[d.id].pBest, id: d.id, correct: pick[d.id].option === bestOpt, near: reg <= 0.1, regret: reg, defRegret: defReg, defCorrect: d.default === bestOpt, defNear: defReg <= 0.1, rndRegret: rnd, matters: defReg > 0.1, confident: pick[d.id].confident });
  }
  return { rows, gainPerLesson: gain / nL, exploreShare: explored / (nL * B.DECISIONS.length), lessons: nL };
}

// ── E: logged stats ───────────────────────────────────────────────────────
function simLog(rng, nrm, kind) {
  const usual = ['morning', 'afternoon', 'evening', 'night'][Math.floor(rng() * 4)]; const eff = {}; for (const p of L.PARTS) eff[p] = p === usual ? 0.06 + 0.06 * rng() : -0.02 * rng(); if (rng() < 0.5) { const q = L.PARTS[Math.floor(rng() * 4)]; eff[q] = Math.max(eff[q], 0.09); }
  const bestTrue = L.PARTS.reduce((a, p) => (eff[p] > eff[a] ? p : a)); const tol = 8 + Math.floor(rng() * 38); const miscShare = 0.15 + 0.6 * rng();
  const hourFor = (p) => ({ morning: 7 + Math.floor(rng() * 4), afternoon: 13 + Math.floor(rng() * 3), evening: 18 + Math.floor(rng() * 3), night: 22 + Math.floor(rng() * 2) })[p];
  const answers = []; const nS = kind.days * (kind.min > 500 ? 1 : 1); const types = [];
  const skills = Array.from({ length: 30 }, (_, i) => ({ id: `s${i}`, stable: rng() < miscShare, distractor: Math.floor(rng() * 3), skill: 0.55 + 0.3 * rng() }));
  for (let s = 0; s < nS; s++) {
    const day = Math.floor((s / nS) * 30); const part = rng() < 0.6 ? usual : L.PARTS[Math.floor(rng() * 4)]; const start = Date.UTC(2026, 10, 1 + day, hourFor(part), Math.floor(rng() * 60));
    const len = Math.max(6, tol * 1.3 + 8 * nrm()); const nA = Math.round((kind.min * 2) / kind.days * (len / 25)); const gap = (len * 60000) / Math.max(nA, 1);
    for (let i = 0; i < nA; i++) {
      const t = start + i * gap; const min = (i * gap) / 60000; const sk = skills[Math.floor(rng() * skills.length)];
      const pOk = clamp(sk.skill + eff[part] - (min > tol ? 0.15 : 0) + (kind.careless * -0.2), 0.05, 0.97); const ok = rng() < pOk;
      const row = { t, ok, ms: 9000 * Math.exp(0.35 * nrm()), skill: sk.id, device: rng() < 0.7 ? 'phone' : 'laptop', kind: 'choice' };
      if (!ok) { const mis = sk.stable && rng() < 0.85; row.wrong = mis ? `d${sk.distractor}` : `d${Math.floor(rng() * 3)}`; const slip = !mis && rng() < 0.5; if (slip) row.ms *= 0.45; types.push({ t, truth: mis ? 'misconception' : slip ? 'slip' : 'unclear', row }); }
      answers.push(row);
    }
  }
  const tod = L.timeOfDay(answers); const dr = L.sessionDropoff(answers); const er = L.errorTypes(answers);
  const out = { n: answers.length };
  out.todPick = tod ? tod.best : null; out.todCorrect = tod ? tod.best === bestTrue : null; out.todConfident = tod ? tod.confident : false; out.todRegret = tod ? 100 * (eff[bestTrue] - eff[tod.best]) : null; out.todRegretAll = out.todRegret;
  out.todConfCorrect = tod && tod.confident ? tod.best === bestTrue : null; out.todConfRegret = tod && tod.confident ? 100 * (eff[bestTrue] - eff[tod.best]) : null;
  out.dropMin = dr ? dr.minutes : null; out.dropDetected = dr && dr.minutes != null; out.dropErr = dr && dr.minutes != null ? Math.abs(dr.minutes - tol) : null; out.tol = tol; out.dropRel = out.dropErr == null ? null : out.dropErr / tol; out.dropLongest = dr ? dr.longest : null;
  if (er && er.confident) {
    const m = new Map(er.perType.map((q) => [q.i, q.type])); let ok = 0; let n = 0; let clearTrue = 0; let clearRight = 0;
    // perType indexes the sorted answers; rebuild by time key
    const sorted = [...answers].sort((a, b) => a.t - b.t); const byT = new Map(types.map((q) => [q.row, q.truth]));
    er.perType.forEach((q) => { const row = sorted[q.i]; const truth = byT.get(row); n += 1; if (q.type !== 'unclear') { clearTrue += 1; if (q.type === truth) clearRight += 1; } if (q.type === truth) ok += 1; });
    out.errAcc = ok / n; out.errClassifiedPrecision = clearTrue ? clearRight / clearTrue : null; out.errCoverage = clearTrue / n; out.errShareErr = Math.abs(er.misconceptionShare - types.filter((q) => q.truth === 'misconception').length / types.length) * 100; out.errMiscTrue = types.filter((q) => q.truth === 'misconception').length / types.length;
  }
  return out;
}

// ── runner ────────────────────────────────────────────────────────────────
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const corr2 = (xs, ys) => { const n = xs.length; if (n < 3) return null; const mx = mean(xs); const my = mean(ys); let sxy = 0; let sxx = 0; let syy = 0; for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; } return sxx && syy ? (sxy * sxy) / (sxx * syy) : 0; };

function run({ seed = 31001, n = 40, noise = 0.8, effect = 0.35 } = {}) {
  const rng = mulberry(seed); const nrm = mkNormal(rng); const R = { seed, n, kinds: {}, rows: [] };
  for (const [kn, kind] of Object.entries(KINDS)) {
    const k = { kind: kn, A: {}, B: { err: [], guessErr: [], endorse: [], answered: [], pairs: [], corrShare: [], meanShift: [] }, C: [], E: [], spent: [], spentShare: [] };
    for (const id of DIRECT) k.A[id] = { est: [], truth: [], err: [], guessErr: [], beh: [] };
    for (let i = 0; i < n; i++) {
      const tr = {}; for (const id of DIRECT) tr[id] = drawTruth(rng, nrm, kind); tr.retention_index = clamp(50 + 0.85 * (tr.decay_rate - 50) + Math.sqrt(1 - 0.85 ** 2) * 17 * nrm());
      const a = simDirect(rng, nrm, kind, tr);
      const budget = D.BUDGET_SHARE * kind.min; const trB = {}; for (const id of C.CONFIRMABLE) trB[id] = drawTruth(rng, nrm, kind);
      const b = simConfirm(rng, nrm, kind, trB, Math.max(0, budget - a.spent));
      k.spent.push(a.spent + b.spent); k.spentShare.push((a.spent + b.spent) / kind.min);
      for (const id of DIRECT) { const e = a.out[id].est; k.A[id].est.push(e); k.A[id].truth.push(tr[id]); k.A[id].err.push(Math.abs(e - tr[id])); k.A[id].guessErr.push(Math.abs(50 - tr[id])); }
      for (const id of C.CONFIRMABLE) { const e = b.out[id].est; k.B.err.push(Math.abs(e - trB[id])); k.B.guessErr.push(Math.abs(50 - trB[id])); k.B.pairs.push([e, trB[id]]); k.B.behErr = (k.B.behErr || []); k.B.behErr.push(Math.abs(b.behaviour[id].est - trB[id])); }
      k.B.endorse.push(mean(b.endorse)); k.B.answered.push(b.answered / C.CONFIRMABLE.length); if (b.correction.correctedShare != null) { k.B.corrShare.push(b.correction.correctedShare); k.B.meanShift.push(b.correction.meanShift); }
      k.C.push(simBandit(rng, nrm, kind, noise, effect)); k.E.push(simLog(rng, nrm, kind));
    }
    R.kinds[kn] = k;
  }
  return R;
}

const f1 = (x) => (x == null || Number.isNaN(x) ? 'n/a' : x.toFixed(1));
const all = (R, pick) => Object.values(R.kinds).flatMap(pick);
function summarise(R) {
  const S = { A: {}, Aall: {}, B: {}, C: {}, E: {}, byKind: {} };
  const accOf = (errs) => 100 - mean(errs);
  for (const id of DIRECT) {
    const e = all(R, (k) => k.A[id].err); const g = all(R, (k) => k.A[id].guessErr); const est = all(R, (k) => k.A[id].est); const tr = all(R, (k) => k.A[id].truth);
    S.A[id] = { acc: accOf(e), guess: accOf(g), removed: 100 * (1 - mean(e) / mean(g)), r2: corr2(est, tr), n: e.length, reach95: 0 };
  }
  S.Aall = { acc: mean(DIRECT.map((id) => S.A[id].acc)), guess: mean(DIRECT.map((id) => S.A[id].guess)), removed: mean(DIRECT.map((id) => S.A[id].removed)), r2: mean(DIRECT.map((id) => S.A[id].r2)), n: S.A.prior_knowledge.n };
  const be = all(R, (k) => k.B.err); const bg = all(R, (k) => k.B.guessErr); const bb = all(R, (k) => k.B.behErr);
  const pairs = all(R, (k) => k.B.pairs);
  S.B = { acc: accOf(be), guess: accOf(bg), behaviour: accOf(bb), removed: 100 * (1 - mean(be) / mean(bg)), r2: corr2(pairs.map((p) => p[0]), pairs.map((p) => p[1])), endorse: 100 * mean(all(R, (k) => k.B.endorse)), answered: 100 * mean(all(R, (k) => k.B.answered)), corrShare: 100 * mean(all(R, (k) => k.B.corrShare)), meanShift: mean(all(R, (k) => k.B.meanShift)), n: be.length };
  const rows = all(R, (k) => k.C.flatMap((c) => c.rows)); const gains = all(R, (k) => k.C.map((c) => c.gainPerLesson)); const mat = rows.filter((r) => r.matters);
  S.C = { n: rows.length, correct: 100 * mean(rows.map((r) => +r.correct)), near: 100 * mean(rows.map((r) => +r.near)), defCorrect: 100 * mean(rows.map((r) => +r.defCorrect)), defNear: 100 * mean(rows.map((r) => +r.defNear)), regret: mean(rows.map((r) => r.regret)), defRegret: mean(rows.map((r) => r.defRegret)), rndRegret: mean(rows.map((r) => r.rndRegret)), matters: mat.length, mattersCorrect: 100 * mean(mat.map((r) => +r.correct)), mattersNear: 100 * mean(mat.map((r) => +r.near)), mattersDefNear: 100 * mean(mat.map((r) => +r.defNear)), gain: mean(gains), negGainShare: 100 * mean(gains.map((g) => +(g < -0.05))), tiers: [[0, 0.5], [0.5, 0.7], [0.7, 0.9], [0.9, 1.01]].map(([lo, hi]) => { const t = rows.filter((r) => r.pBest >= lo && r.pBest < hi); return { lo, hi, n: t.length, correct: 100 * mean(t.map((r) => +r.correct)), near: 100 * mean(t.map((r) => +r.near)) }; }), confidentShare: 100 * mean(rows.map((r) => +r.confident)), nLearners: gains.length };
  const E = all(R, (k) => k.E); const nz = (a) => a.filter((x) => x != null);
  S.E = { n: E.length, todConfCover: 100 * mean(E.map((e) => +e.todConfident)), todCorrect: 100 * mean(nz(E.map((e) => e.todCorrect == null ? null : +e.todCorrect))), todConfCorrect: 100 * mean(nz(E.map((e) => e.todConfCorrect == null ? null : +e.todConfCorrect))), todRegret: mean(nz(E.map((e) => e.todRegret))), todConfRegret: mean(nz(E.map((e) => e.todConfRegret))), dropCover: 100 * mean(E.map((e) => +!!e.dropDetected)), dropErrMin: mean(nz(E.map((e) => e.dropErr))), dropAcc: 100 * (1 - mean(nz(E.map((e) => e.dropRel)))), errCover: 100 * mean(E.map((e) => +(e.errAcc != null))), errPrecision: 100 * mean(nz(E.map((e) => e.errClassifiedPrecision))), errAcc: 100 * mean(nz(E.map((e) => e.errAcc))), errShareAcc: 100 - mean(nz(E.map((e) => e.errShareErr))) };
  for (const [kn, k] of Object.entries(R.kinds)) {
    const Ae = DIRECT.flatMap((id) => k.A[id].err); const Ag = DIRECT.flatMap((id) => k.A[id].guessErr);
    const rr = k.C.flatMap((c) => c.rows);
    S.byKind[kn] = { Am: Object.fromEntries(DIRECT.map((id) => [id, accOf(k.A[id].err)])), Bans: 100 * mean(k.B.answered), A: accOf(Ae), Aguess: accOf(Ag), B: accOf(k.B.err), Bguess: accOf(k.B.guessErr), Bendorse: 100 * mean(k.B.endorse), Cnear: 100 * mean(rr.map((r) => +r.near)), CdefNear: 100 * mean(rr.map((r) => +r.defNear)), Cgain: mean(k.C.map((c) => c.gainPerLesson)), spentShare: 100 * mean(k.spentShare), Eerr: 100 - mean(k.E.map((e) => e.dropRel).filter((x) => x != null).map((x) => 100 * x)) };
  }
  return S;
}

// Group D (behaviour only), quoted from docs/SCORE-95.md, 30-day REAL-world pipeline run, held out, SIMULATED learners; classes = the measures not in A, B or C.
const GROUP_D = { note: 'quoted from docs/SCORE-95.md (pipeline run, real world, held-out seed 71107, 80 learners): all 100 measures guess 81.2, read-out 82.7, 8.1% of error removed; 0/100 measures reach 95', guess: 81.2, acc: 82.7, removed: 8.1 };

function md(R, S) {
  const L2 = [];
  L2.push(`Seed ${R.seed}, ${R.n} learners per kind, 10 kinds (${Object.keys(KINDS).join(', ')}). SIMULATED. Accuracy = 100 - mean absolute error in points vs the latent truth (the OLD metric); guess = the population mean.`);
  L2.push('', '#### A. Directly measured (8 measures, tasks inside the 5% budget, fused with a behaviour read)', '', '| measure | n | guess | accuracy | error removed | reliability r2 | reaches 95 |', '|---|---|---|---|---|---|---|');
  for (const id of DIRECT) { const a = S.A[id]; L2.push(`| ${id} | ${a.n} | ${f1(a.guess)} | ${f1(a.acc)} | ${f1(a.removed)}% | ${a.r2.toFixed(2)} | ${a.acc >= 95 ? 'yes' : 'no'} |`); }
  L2.push(`| **mean** | ${S.Aall.n} | ${f1(S.Aall.guess)} | ${f1(S.Aall.acc)} | ${f1(S.Aall.removed)}% | ${S.Aall.r2.toFixed(2)} | |`);
  L2.push('', 'Learner kinds whose accuracy vs the latent truth reaches 95 (kind mean over its 8 measures is not used; per measure):', '', '| measure | kinds at or above 95 | best kind | worst kind |', '|---|---|---|---|');
  for (const id of DIRECT) { const e = Object.entries(S.byKind).map(([k, v]) => [k, v.Am[id]]).sort((a, b) => b[1] - a[1]); L2.push(`| ${id} | ${e.filter((x) => x[1] >= 95).map((x) => x[0]).join(', ') || 'none'} | ${e[0][0]} ${f1(e[0][1])} | ${e[e.length - 1][0]} ${f1(e[e.length - 1][1])} |`); }
  L2.push('', '#### B. Learner-confirmed (28 preference + scale measures)', '', `| measure set | n | guess | behaviour only | after card | removed | r2 | learner endorses card (within 10) | by definition: card shows the learner's own answer |`, '|---|---|---|---|---|---|---|---|---|', `| 28 measures | ${S.B.n} | ${f1(S.B.guess)} | ${f1(S.B.behaviour)} | ${f1(S.B.acc)} | ${f1(S.B.removed)}% | ${S.B.r2.toFixed(2)} | ${f1(S.B.endorse)}% | ${f1(S.B.answered)}% |`);
  L2.push('', `Corrections: first answers corrected the shown number (15+ points) in ${f1(S.B.corrShare)}% of cases, mean shift ${f1(S.B.meanShift)} points.`);
  L2.push('', '#### C. Outcome-tested decisions (6 decisions x 3 or 2 options, per-learner bandit, lesson outcomes)', '', '| | all decisions | decisions that matter (default is 0.1+ sd below the best) |', '|---|---|---|', `| n | ${S.C.n} | ${S.C.matters} |`, `| bandit picks the best option | ${f1(S.C.correct)}% | ${f1(S.C.mattersCorrect)}% |`, `| bandit within 0.1 sd of the best | ${f1(S.C.near)}% | ${f1(S.C.mattersNear)}% |`, `| always-default within 0.1 sd of the best | ${f1(S.C.defNear)}% | ${f1(S.C.mattersDefNear)}% |`, `| default picks the best option | ${f1(S.C.defCorrect)}% | 0% |`, '', `Mean regret per decision at day 30 (sd units of lesson outcome): bandit ${S.C.regret.toFixed(3)}, always default ${S.C.defRegret.toFixed(3)}, random ${S.C.rndRegret.toFixed(3)}. Mean outcome gain per lesson of the bandit's assignments over the default: ${S.C.gain.toFixed(3)} sd; ${f1(S.C.negGainShare)}% of learners lost more than 0.05 sd per lesson net of the default; ${f1(S.C.confidentShare)}% of end-of-month picks were confident (P(best) >= 0.7, the level the plan acts on).`);
  L2.push('', `Picks by the probability they are best: ${S.C.tiers.map((t) => `P ${t.lo}-${Math.min(1, t.hi)}: n ${t.n}, best ${f1(t.correct)}%, within 0.1 sd ${f1(t.near)}%`).join('; ')}.`, '', '#### E. Logged stats (new, from the answer log, no study time)', '', '| stat | n learners | result |', '|---|---|---|', `| best part of day | ${S.E.n} | confident for ${f1(S.E.todConfCover)}%; right when confident ${f1(S.E.todConfCorrect)}%; right overall ${f1(S.E.todCorrect)}%; regret ${f1(S.E.todConfRegret)} accuracy points when confident |`, `| attention drop-off minutes | ${S.E.n} | detected for ${f1(S.E.dropCover)}%; mean error ${f1(S.E.dropErrMin)} min; accuracy (1 - relative error) ${f1(S.E.dropAcc)}% |`, `| slip vs misconception | ${S.E.n} | classified for ${f1(S.E.errCover)}% of learners; of wrong answers labelled slip/misconception ${f1(S.E.errPrecision)}% right; all labels incl. unclear ${f1(S.E.errAcc)}%; learner misconception share accuracy ${f1(S.E.errShareAcc)}% |`);
  L2.push('', '#### By learner kind (A and B accuracy vs guess; C within-0.1sd vs always-default; budget share spent)', '', '| kind | A guess | A | B guess | B | B endorse | B card = own answer | C bandit near-best | C default near-best | C gain/lesson | study time used on tasks |', '|---|---|---|---|---|---|---|---|---|---|---|');
  for (const [kn, v] of Object.entries(S.byKind)) L2.push(`| ${kn} | ${f1(v.Aguess)} | ${f1(v.A)} | ${f1(v.Bguess)} | ${f1(v.B)} | ${f1(v.Bendorse)}% | ${f1(v.Bans)}% | ${f1(v.Cnear)}% | ${f1(v.CdefNear)}% | ${v.Cgain.toFixed(3)} | ${v.spentShare.toFixed(1)}% |`);
  return L2.join('\n');
}

if (require.main === module) {
  const arg = (k, d) => { const m = process.argv.find((a) => a.startsWith(`--${k}=`)); return m ? m.split('=')[1] : d; };
  const R = run({ seed: Number(arg('seed', 31001)), n: Number(arg('n', 40)), noise: Number(arg('noise', 0.8)), effect: Number(arg('effect', 0.35)) }); const S = summarise(R);
  const text = md(R, S); console.log(text.split('\n').slice(0, 24).join('\n'));
  const fs = require('fs'); if (arg('md')) fs.writeFileSync(arg('md'), `${text}\n`); if (arg('json')) fs.writeFileSync(arg('json'), JSON.stringify(S, null, 1));
}
module.exports = { run, summarise, md, KINDS, DIRECT, GROUP_D, mulberry, mkNormal };
