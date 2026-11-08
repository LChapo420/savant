#!/usr/bin/env node
/**
 * Fastest, Balanced and Highest against the frozen normal-student baseline (docs/four-x/). SIMULATED: no real learner, no model call, no money.
 *
 * One memory law for both sides (FSRS-6 curve, strengths from docs/four-x/baseline.json). Prior knowledge is a real memory trace. Understanding
 * (transfer) is measured apart from recall. The paths use services/learning-modes.js, the app's own constants.
 *
 *   node scripts/four-x-sim.js --seed=20261108 --out=FILE [--docs=design|heldout|all] [--density=measured|textbook] [--n-extreme=120] [--n-ordinary=40] [--reps=3]
 *   sensitivity: --decay=0.5 --q-s=45 --q-review-s=45 --fmt-mult=1 --short-wrong-s=25 --mcq-mult=0.7 --core-words=60 --core-gain=0.7 --core-u=0.6 --u-mult=0.5 --override='{"fastest":{"firstQs":0.5}}'
 */
'use strict';
const fs = require('fs');
const path = require('path');
const X = require('./lib/extreme-learners');
const M = require('../services/learning-modes');

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=?(.*)$/); return [m[1], m[2] === '' ? '1' : m[2]]; }));
const num = (k, d) => (args[k] === undefined ? d : Number(args[k]));
const B = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', 'four-x', 'baseline.json'), 'utf8'));
const SEED = num('seed', 777108);
const N_EXT = num('n-extreme', 120);
const N_ORD = num('n-ordinary', 40);
const N_SPARSE = num('n-sparse', 20);
const N_CHILD = num('n-child', 20);
const REPS = num('reps', 3);
const DENSITY = args.density || 'measured';
const DECAY = num('decay', B.memory.curve ? 0.1542 : 0.1542);
const Q_S = num('q-s', B.savantTimeCosts.questionFirstS);
const QR_S = num('q-review-s', B.savantTimeCosts.questionReviewS);
const RIGHT_S = B.savantTimeCosts.rightFeedbackS; const WRONG_S = B.savantTimeCosts.wrongFeedbackS; const RETRY_S = B.savantTimeCosts.retryS;
const MCQ_MULT = num('mcq-mult', 1);
const CORE_GAIN = num('core-gain', 0.85);   // ASSUMED: what a core-only page teaches relative to a full page. Reder and Anderson 1980 support about 1 for main points.
const CORE_U = num('core-u', 0.8);          // ASSUMED: same for understanding (fewer examples)
const U_MULT = num('u-mult', 1);            // sensitivity: every retrieval's gain in understanding, a multiple
const PAIR_STRENGTH = num('pair-strength', 0.8); // ASSUMED: one question covering two points strengthens each by this much of a single question
const CORE_WORDS = num('core-words', 35);     // ASSUMED: the essentials of a point in about 35 words (Reder and Anderson 1980: chapter summaries beat the chapters)
const FMT_MULT = num('fmt-mult', 36 / 41);     // Schneid et al. 2014: three options vs four or five
const SHORT_WRONG_S = num('short-wrong-s', 12); // ASSUMED: one-line why after a wrong answer
const OVERRIDE = args.override ? JSON.parse(args.override) : {};
const WORDS_MULT = DENSITY === 'textbook' ? 3 : 1;
const LEAN_MULT = DENSITY === 'textbook' ? 1.5 : 1; // ASSUMED: a less dense source needs a somewhat longer lean page

const MODES = {};
for (const id of M.LIST) MODES[id] = { ...M.MODES[id], ...(OVERRIDE[id] || {}) };

const HORIZONS = [['1 week', 7], ['1 month', 30], ['3 months', 90], ['1 year', 365], ['test in 1 week', 7, 1], ['test in 1 month', 30, 1], ['test in 3 months', 90, 1]];

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const R = (S, t) => M.recall(S, t, DECAY);
const gap = (S, target) => M.gapDays(S, target, DECAY);

// ---------- learners (ordinary and extreme as scripts/upload-4x-sim.js; child and sparse added) ----------
const rngOf = (...p) => X.rngFor(X.hash(...p));
function ordinary(seed, i, tag = 'ordinary') {
  const u = rngOf('ord', seed, i, tag);
  const traits = {}; for (const id of X.IDS) traits[id] = clamp(50 + 17 * u.normal(), 2, 98);
  let age = 8 + Math.floor(u() * 63); if (tag === 'child') age = 8 + Math.floor(u() * 5);
  return { id: `${tag[0]}${seed}-${i}`, kind: tag, age, band: X.bandOf(age), traits };
}
function paramsOf(L) {
  const T = L.traits; const z = (id) => (T[id] - 50) / 50;
  return {
    theta0: (T.prior_knowledge - 50) / 25,
    lr: clamp(1 + 0.75 * z('mastery_velocity'), 0.6, 1.5),
    timeMult: Math.exp(-0.6 * z('processing_velocity')) * (L.age <= 12 ? 1.25 : 1),
    mult: Math.exp(-0.9 * z('decay_rate')),
    skim: 0.03 + 0.25 * (1 - T.instruction_adherence / 100) ** 2,
  };
}

// ---------- one learner, one document ----------
function world(L, P, doc, rep) {
  const rnd = rngOf('run', L.id, doc.doc, rep);
  const kr = rngOf('know', L.id, doc.doc, rep);
  const pts = [];
  for (let i = 0; i < doc.skills; i++) {
    const rel = 0.5 * P.theta0 + 0.8 * kr.normal();
    const k = clamp(sigmoid(1.5 * (rel - 0.5)), 0.02, 0.97);
    const p = { k, u: k * 0.7, S: null, last: null, nReads: 0, Se: null };
    if (k > 0.35) { // a real trace: strength and an age since it was last used
      p.S = Math.exp(Math.log(B.learning.priorS_median_days) + B.learning.priorS_logSd * kr.normal()) * P.mult;
      p.last = -(B.learning.priorAge_days_min + kr() * (B.learning.priorAge_days_max - B.learning.priorAge_days_min));
    }
    pts.push(p);
  }
  return { rnd, pts, minutes: { read: 0, practice: 0, review: 0 } };
}
const Rat = (p, t) => (p.S ? R(p.S, t - p.last) : 0);
const growth = (S, r) => 1 + Math.exp(1.8722) * 6 * S ** -0.1666 * (Math.exp(0.796 * (1 - r)) - 1);

function read(p, P, t, gain = 1, uGain = 1, rnd) {
  const skim = rnd && rnd() < P.skim;
  const i = Math.min(p.nReads, B.learning.kGainByRead.length - 1);
  p.k += (1 - p.k) * clamp(B.learning.kGainByRead[i] * P.lr * gain * (skim ? 0.3 : 1), 0, 0.95);
  const uG = (p.nReads === 0 ? B.learning.uGainFirstRead : p.nReads === 1 ? B.learning.uGainReread : B.learning.uGainLaterRead) * P.lr * uGain * (skim ? 0.3 : 1);
  p.u += (1 - p.u) * clamp(uG, 0, 0.95);
  const r = Rat(p, t);
  if (p.S === null) p.S = B.memory.readFirstS * P.mult;
  else if (t - p.last < 0.25 && p.nReads > 0) p.S *= B.memory.readSecondSameSittingMultiplier;
  else p.S *= growth(p.S, r) ** B.memory.readLaterGrowthExponent;
  p.last = t; p.nReads += 1;
}

/** One question. kind: 'mcq' or 'recall'. Returns { right }. Does not add time (callers do). */
function ask(p, P, t, kind, uGainKey, rnd, strengthMult = 1, guess = B.learning.guess) {
  const r = Rat(p, t) || (p.S === null ? 0 : 0);
  const known = p.k * (p.S === null ? 0 : r);
  const pRight = kind === 'mcq' ? known + (1 - known) * guess : known;
  const right = rnd() < pRight;
  const S0 = (kind === 'mcq' ? B.memory.firstCorrectMcqS * MCQ_MULT : B.memory.firstCorrectRecallS) * P.mult * strengthMult;
  if (right) {
    if (p.S === null) p.S = S0;
    else if (p.S < S0) p.S = S0;
    else if (t - p.last < 0.25) p.S *= 1 + (B.memory.massedCorrectMultiplier - 1) * strengthMult;
    else p.S *= 1 + (growth(p.S, r) - 1) * strengthMult;
  } else {
    p.S = p.S === null ? B.memory.firstWrongS * P.mult : Math.max(B.memory.firstWrongS * P.mult, p.S * 0.4);
  }
  p.last = t;
  p.k = clamp(p.k + (1 - p.k) * B.learning.kGainOnAnswer * P.lr * (right ? 1 : 0.5), 0, 0.995);
  const gainU = ({ plain: B.learning.uGainPlainRetrieval, explain: B.learning.uGainExplainedRetrieval, transfer: B.learning.uGainTransferQuestion }[uGainKey] || 0) * U_MULT;
  p.u = clamp(p.u + (1 - p.u) * gainU * (right ? 1 : 0.6), 0, 0.995);
  return { right, known };
}

function examAt(w, t) {
  let rec = 0; let tr = 0; let low = 1;
  for (const p of w.pts) { const r = Rat(p, t); const v = p.k * r; rec += v; tr += p.u * r ** B.learning.transferExponentOnR; if (v < low) low = v; }
  return { recall: rec / w.pts.length, transfer: tr / w.pts.length, low };
}

// ---------- the normal student (docs/four-x/baseline.json, frozen) ----------
function wpmFor(profile, doc) {
  const srcWords = doc.src * WORDS_MULT;
  const dense = (doc.skills / srcWords) * 1000 > B.time.manyNewConceptsAbovePointsPer1000Words;
  if (profile === 'lazy') return B.time.readingWpm.lazy;
  return dense ? B.time.readingWpm.understand_manyNewConcepts : B.time.readingWpm.understand_someNewConcepts;
}
function normal(L, P, doc, rep, profile, H, dated) {
  const Prof = B.time.profiles[profile];
  const w = world(L, P, doc, rep);
  const wpm = wpmFor(profile, doc);
  const words = doc.src * WORDS_MULT;
  const pass = ((words / wpm) * P.timeMult);
  // first read and any same-sitting reread
  w.minutes.read += pass * Prof.noteOverhead;
  for (const p of w.pts) read(p, P, 0, 1, 1, w.rnd);
  for (let i = 0; i < Prof.sameSittingRereads; i++) { w.minutes.read += pass * B.time.rereadCostShare; for (const p of w.pts) read(p, P, 0.001 + i * 0.01, 1, 1, w.rnd); }
  // later rereads and the self-test, within the horizon
  for (const d of Prof.laterRereads) { if (d >= H) continue; w.minutes.review += pass * B.time.rereadCostShare; for (const p of w.pts) read(p, P, d, 1, 1, w.rnd); }
  if (Prof.selfTestPerPoint && Prof.selfTestDay != null && Prof.selfTestDay < H) {
    const d = Prof.selfTestDay;
    for (const p of w.pts) {
      const { right } = ask(p, P, d, 'recall', 'plain', w.rnd);
      w.minutes.review += ((B.time.selfTestSeconds + (right ? RIGHT_S : WRONG_S)) / 60) * P.timeMult;
    }
  }
  if (dated && Prof.evePass) { const d = H - 1; const f = Prof.evePass; w.minutes.review += pass * B.time.rereadCostShare * f; for (const p of w.pts) read(p, P, d, f, f, w.rnd); }
  return { min: w.minutes.read + w.minutes.practice + w.minutes.review, ...examAt(w, H) };
}

// ---------- Savant, per mode ----------
function savant(L, P, doc, rep, modeId, H, dated) {
  const m = MODES[modeId];
  const w = world(L, P, doc, rep);
  const rnd = w.rnd;
  const wpm = wpmFor('typical', doc); // the same pace a normal student reads at
  const leanPer = (doc.lean_words / doc.skills) * LEAN_MULT;
  const pageWords = m.page === 'full' ? (doc.today_words / doc.skills) * LEAN_MULT : m.page === 'lean' ? leanPer : Math.min(leanPer * 0.5, CORE_WORDS);
  const pageGain = m.page === 'core' ? CORE_GAIN : 1;
  const pageU = m.page === 'core' ? CORE_U : 1;

  const short = !!m.shortFormat;
  const fmtMult = short ? FMT_MULT : 1;                // Schneid et al. 2014: 3-option items 36 s against 41 s
  const guess = short ? 1 / 3 : B.learning.guess;
  const wrongS = short ? SHORT_WRONG_S : WRONG_S;      // ASSUMED: a one-line why reads in under half the time of a long explanation
  const retryS = short ? Math.min(RETRY_S, 30) : RETRY_S;
  const addQ = (bucket, right, secs = Q_S) => { w.minutes[bucket] += ((secs * fmtMult + (right ? RIGHT_S : wrongS)) / 60) * P.timeMult; };
  const askM = (p, t, key, strengthMult = 1) => ask(p, P, t, 'mcq', key, rnd, strengthMult, guess);

  // per-learner fit: the schedule starts from 1 and learns the learner's forgetting from reviews
  const fit = { mult: 1, n: 0 };
  const sparse = L.kind === 'sparse';
  const refit = () => { fit.n += 1; if (sparse) return; const noise = rngOf('fit', L.id, doc.doc, rep, fit.n).normal(); fit.mult = P.mult * Math.exp((0.5 / Math.sqrt(fit.n + 1)) * noise); };

  const known = new Set();
  // 1. diagnose: one question per part (or two for proof); right and sure = known
  w.pts.forEach((p, i) => {
    if (m.diagnose === 'none') return;
    const a1 = askM(p, 0, 'plain', 0.5); addQ('practice', a1.right);
    const sure = a1.right && rnd() < (a1.known > 0.6 ? 0.85 : 0.15);
    if (m.diagnose === 'one') { if (a1.right && sure) known.add(i); return; }
    if (a1.right) { const a2 = askM(p, 0.002, 'plain', 0.5); addQ('practice', a2.right); if (a2.right && sure) known.add(i); }
  });
  // 2. teach what is not known
  const needed = w.pts.map((_, i) => i).filter((i) => !known.has(i));
  for (const i of needed) {
    const p = w.pts[i];
    w.minutes.read += ((pageWords / wpm) * P.timeMult);
    read(p, P, 0.003, pageGain, pageU, rnd);
    if (m.worked && p.k < 0.6) { w.minutes.read += (25 / 60) * P.timeMult; p.u += (1 - p.u) * B.learning.uGainWorkedExample * P.lr; }
    // first-pass retrievals
    const uKey = m.explain ? 'explain' : 'plain';
    if (m.firstQs === 'pair') {
      // one question covers this part and the next unknown part (odd parts are checked together with the part before them)
      const idx = needed.indexOf(i);
      if (idx % 2 === 0) {
        const j = needed[idx + 1];
        const q = j != null ? w.pts[j] : null;
        if (q) { w.minutes.read += ((pageWords / wpm) * P.timeMult); read(q, P, 0.003, pageGain, pageU, rnd); }
        const a = askM(p, 0.004, uKey, q ? PAIR_STRENGTH : 1);
        const b = q ? askM(q, 0.004, uKey, PAIR_STRENGTH) : { right: true };
        const both = a.right && b.right;
        w.minutes.practice += (((Q_S * (q ? 1.5 : 1)) * fmtMult + (both ? RIGHT_S : wrongS)) / 60) * P.timeMult;
        for (const [x, ok] of [[p, a.right], [q, b.right]]) { if (!x || ok) continue; w.minutes.practice += (retryS / 60) * P.timeMult; askM(x, 0.006, uKey); }
      }
    } else {
      const qs = m.firstQs === 'criterion' ? 6 : m.firstQs;
      let right3 = 0;
      for (let q = 0; q < qs; q++) {
        const a = askM(p, 0.004 + q * 0.001, uKey); addQ('practice', a.right);
        if (a.right) right3 += 1;
        if (!a.right && m.firstQs !== 'criterion' && q === qs - 1) { askM(p, 0.01 + q * 0.001, uKey); w.minutes.practice += (retryS / 60) * P.timeMult; }
        if (m.firstQs === 'criterion' && right3 >= 3) break;
      }
    }
    const tq = m.transferQs > 0 && m.transferQs < 1 ? (needed.indexOf(i) % Math.round(1 / m.transferQs) === 0 ? 1 : 0) : m.transferQs;
    for (let q = 0; q < tq; q++) { const a = askM(p, 0.02 + q * 0.001, 'transfer'); addQ('practice', a.right, Q_S + 15); }
  }
  // 3. reviews on the mode's plan, using the scheduler's estimated strength (not the true one)
  const estS = (p) => (p.S || 0) / P.mult * fit.mult;
  w.pts.forEach((p, i) => {
    p.due = M.nextReview(estS(p) || 0.2, m, H).dueInDays;
    if (known.has(i)) p.due = Math.min(p.due ?? H, 3);
  });
  const nextDue = () => { let bestI = -1; let best = Infinity; w.pts.forEach((p, i) => { if (p.due != null && p.due < best) { best = p.due; bestI = i; } }); return bestI; };
  let reviews = 0; let safety = 0;
  while (safety++ < 400) {
    const i = nextDue();
    if (i < 0) break;
    const p = w.pts[i]; const t = Math.ceil(p.due);
    if (t >= H) { p.due = null; continue; }
    // pair review: another part due within a day, memory of both predicted strong
    let pair = -1;
    if (m.pairReviews) {
      w.pts.forEach((q, j) => { if (j !== i && q.due != null && Math.ceil(q.due) - t <= 1 && pair < 0 && R(estS(p) || 0.2, t - p.last) >= 0.8 && R(estS(q) || 0.2, t - q.last) >= 0.8) pair = j; });
    }
    if (pair >= 0) {
      const q = w.pts[pair];
      const a = askM(p, t, m.explain ? 'explain' : 'plain', PAIR_STRENGTH);
      const b = askM(q, t, m.explain ? 'explain' : 'plain', PAIR_STRENGTH);
      const both = a.right && b.right;
      w.minutes.review += ((QR_S * 1.5 * fmtMult + (both ? RIGHT_S : wrongS)) / 60) * P.timeMult; reviews += 1;
      for (const [x, ok] of [[p, a.right], [q, b.right]]) {
        if (!ok) { w.minutes.review += ((QR_S * fmtMult + wrongS) / 60) * P.timeMult; read(x, P, t + 0.01, pageGain, pageU, rnd); w.minutes.review += ((pageWords / wpm) * P.timeMult); }
        refit();
        x.due = (() => { const n = M.nextReview(estS(x) || 0.2, m, H - t, DECAY); return n.done ? null : t + n.dueInDays; })();
      }
      continue;
    }
    const a = askM(p, t, m.explain ? 'explain' : 'plain');
    addQ('review', a.right, QR_S); reviews += 1;
    if (!a.right) { read(p, P, t + 0.01, pageGain, pageU, rnd); w.minutes.review += ((pageWords / wpm) * P.timeMult); askM(p, t + 0.02, m.explain ? 'explain' : 'plain'); w.minutes.review += (retryS / 60) * P.timeMult; }
    refit();
    const n = M.nextReview(estS(p) || 0.2, m, H - t, DECAY);
    p.due = n.done ? null : t + n.dueInDays;
  }
  // a dated test: one look on the eve for parts below the floor
  if (dated) { for (const p of w.pts) { const t = H - 1; if ((Rat(p, t + 1) || 0) < M.floorFor(m, H)) { const a = askM(p, t, 'plain'); addQ('review', a.right, QR_S); reviews += 1; } } }
  return { min: w.minutes.read + w.minutes.practice + w.minutes.review, read: w.minutes.read, practice: w.minutes.practice, review: w.minutes.review, reviews: reviews / doc.skills, skipped: known.size / doc.skills, ...examAt(w, H) };
}

// ---------- run ----------
const ALL = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', 'upload-4x', 'docs.json'), 'utf8'));
const SPLIT = args.docs || 'all';
const DOCS = ALL.filter((d) => SPLIT === 'all' || (SPLIT === 'design' ? d.doc[0] === 'n' : d.doc[0] === 'h'));
const learners = [];
for (let i = 0; i < N_EXT; i++) learners.push(X.learner(SEED, i));
for (let i = 0; i < N_ORD; i++) learners.push(ordinary(SEED, i, 'ordinary'));
for (let i = 0; i < N_SPARSE; i++) learners.push(ordinary(SEED, i, 'sparse'));
for (let i = 0; i < N_CHILD; i++) learners.push(ordinary(SEED, i, 'child'));

const out = { simulated: true, seed: SEED, density: DENSITY, args, baseline: 'docs/four-x/baseline.json (frozen)', learners: [] };
for (const L of learners) {
  const P = paramsOf(L);
  const pick = rngOf('docs', L.id);
  const docsHere = []; for (let r = 0; r < REPS; r++) docsHere.push([DOCS[Math.floor(pick() * DOCS.length)], r]);
  const row = { id: L.id, kind: L.kind, age: L.age, goals: {} };
  for (const [name, H, dated] of HORIZONS) {
    const cell = {};
    const avg = (fn) => { const rs = docsHere.map(([d, rep]) => fn(d, rep)); const o = {}; for (const k of Object.keys(rs[0])) o[k] = mean(rs.map((x) => x[k])); return o; };
    for (const pf of ['lazy', 'typical', 'diligent']) cell[pf] = avg((d, rep) => normal(L, P, d, rep, pf, H, !!dated));
    for (const mode of M.LIST) cell[mode] = avg((d, rep) => savant(L, P, d, rep, mode, H, !!dated));
    row.goals[name] = cell;
  }
  out.learners.push(row);
}
if (args.out) { fs.mkdirSync(path.dirname(args.out), { recursive: true }); fs.writeFileSync(args.out, JSON.stringify(out)); }
console.log(`${out.learners.length} learners, seed ${SEED}, density ${DENSITY}`);
