#!/usr/bin/env node
/**
 * Is an uploaded course 4x faster than studying the original, per learner, for the same exam result at the chosen horizon? SIMULATED: docs/UPLOAD-4X.md. No model calls, no database.
 *
 * Learners: scripts/lib/extreme-learners.js plus ordinary ones, as scripts/faster-by-goal-sim.js makes them. Memory and learning: its audited v2 model, constants copied unchanged (LM below); or, with
 * --memory=fsrs, FSRS-6's published default weights (py-fsrs, fit on real Anki users' logs: real people, other material). Documents: the counts of the 10 real built courses in docs/upload-4x/docs.json.
 * Savant's schedule is the real code: services/material-path.js (intervalDays, updateForgetting) for today, services/material-review-expand.js for the switch.
 *
 * Savant arms, each run once: course (today's lessons and questions), lean (the lean reading, today's intervals), expand (the lean reading, expanding intervals).
 * Baselines, on the original text, each searched per learner over a family of plans for the CHEAPEST that reaches Savant's exam score (generous: no real student knows which plan that is):
 *   careful  reads, writes a self-test per point, self-tests until it truly understands, then looks at every point on a generic expanding schedule
 *   reread   reads, rereads at once, rereads on a schedule, and may reread the day before the exam
 *   read5    the habit: reads five times in a sitting, whatever that reaches (not searched)
 * A baseline with no plan reaching the score is "cannot reach": never counted as a multiple.
 *
 *   node scripts/upload-4x-sim.js --seed=777005 --out=FILE [--docs=design|heldout|all] [--n-extreme=120] [--n-ordinary=40] [--reps=3]
 *        [--floor= --target= --g0= --g1= --review-qs=2 (1 = adaptive) --no-base] [--every=1 --forget=1 --kloss=0 --item-s=35 --wpm=230 --author-s=30 --memory=v2|fsrs --lean-gain=1 --careful-wpm=1 --read-space=0.5 --words-mult=1 --salt=]
 */
const fs = require('fs');
const path = require('path');
const X = require('./lib/extreme-learners');
const MP = require('../services/material-path');
const E = require('../services/material-review-expand');
const RG = require('../services/retention-goal');
const CU = require('../services/material-custom');
const TF = require('../services/material-testfirst');

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=?(.*)$/); return [m[1], m[2] === '' ? '1' : m[2]]; }));
const num = (k, d) => (args[k] === undefined ? d : Number(args[k]));
const SEED = num('seed', 777005);
const N_EXT = num('n-extreme', 120);
const N_ORD = num('n-ordinary', 40);
const REPS = num('reps', 3);
const WPM = num('wpm', 230);             // ASSUMED (docs/UPLOADS-ANY-FORMAT.md section 6)
const ITEM_S = num('item-s', 35);        // ASSUMED (docs/FASTER-BY-GOAL.md); 15 in round 4's "words" costs
const RIGHT_S = 3; const WRONG_S = 25; const RETRY_S = 38; // ASSUMED, services/retention-goal-sim.js as used by faster-by-goal-sim.js
const AUTHOR_S = num('author-s', 30);    // ASSUMED: seconds the careful student spends writing a self-test on one point (0 = free, the kindest reading for the student; 60 = a card a minute)
const CAREFUL_WPM = num('careful-wpm', 1); // the careful student reads at this share of normal speed
const REREAD_TIME = 0.8;                 // faster-by-goal-sim.js
const EVERY = num('every', 1);           // ADVERSE: the learner studies only every Nth day
const FORGET = num('forget', 1);         // multiplies every true half-life
const KLOSS = num('kloss', 0);           // ADVERSE: a deep lapse costs this share of understanding
const LEAN_GAIN = num('lean-gain', 1);   // ADVERSE: what a lean page teaches, as a share of a full page (v2 credits a page, not its words)
const REVIEW_QS = num('review-qs', 2);   // services/material-study.js: two questions a skill
const MEMORY = args.memory || 'v2';
const EST_R = num('est-r', 0.55);        // lever 3: how far the scorecard's estimate of a trait follows the truth (shrink toward 50) ...
const EST_SD = num('est-sd', 9);         // ... and its noise, in points; calibrated so the lean decisions are right about 70% of the time (docs/SCORE-95.md: 68.6 to 75.6)
const SURE_CAL = num('sure-cal', 1);     // lever 2: how often a right answer is given as "sure", as a multiple of the learner's true knowledge of the part (ASSUMED)
const SALT = args.salt || '';              // noise control: the same arms on another random stream
const WORDS_MULT = num('words-mult', 1);  // sensitivity: a less dense document, same points, this many times the words (the lean reading scales with it: an assumption)
const GUESS = 0.25;
const PASS = 0.75;
const P_EXPAND = { ...E.PARAMS, FLOOR: num('floor', E.PARAMS.FLOOR), FLOOR_SHORT: num('floor-short', E.PARAMS.FLOOR_SHORT), TARGET: num('target', E.PARAMS.TARGET), GROWTH_0: num('g0', E.PARAMS.GROWTH_0), GROWTH_1: num('g1', E.PARAMS.GROWTH_1) };
// A horizon: "remember it this long", with no known exam day, so no last look on the eve for anyone. A test: the day is known, so everyone may look on the eve; Savant through retention-goal.limitInterval.
const HORIZONS = [['1 week', 7], ['1 month', 30], ['6 months', 180], ['1 year', 365], ['no test day (3 y)', 1095], ['test in 1 week', 7, 'date'], ['test in 1 month', 30, 'date'], ['test in 6 months', 180, 'date'], ['test in 1 year', 365, 'date']];
const DAY_MS = 86400000; const EPOCH = Date.parse('2026-01-01T00:00:00Z');

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

// ---------- memory: v2, unchanged from scripts/faster-by-goal-sim.js ----------
const LM = { mass1: 0.3, massN: 5, mass2: 0.03, massDays: 0.25, sp0: 1.3, sp1: 1.5, h0: 2.8, missH: 1.5, miss: 0.4, a: 0.2, page: 0.5, pageSkim: 0.15, priorShift: 0.5, dd: 0.5 };
const READ_H = 2.5; const READ_MASS = 0.05; const READ_SPACE = num('read-space', 0.5); const READ_K2 = 0.5;
const V2 = {
  fresh: (mult) => ({ H: 2 * mult, mult, last: null, mass: 0 }),
  R: (m, t) => (m.last === null ? 1 : 2 ** (-(t - m.last) / m.H)),
  answer(m, correct, R, t) {
    const first = m.last === null; const days = first ? 0 : t - m.last;
    if (correct) {
      if (first) { m.H = LM.h0 * m.mult; m.mass = 1; }
      else if (days < LM.massDays) { m.H *= 1 + (m.mass < LM.massN ? LM.mass1 : LM.mass2); m.mass++; }
      else { m.H *= (LM.sp0 + LM.sp1 * (1 - R)) * (1 + LM.dd * clamp(0.8 - 0.7, -0.3, 0.4)); m.mass = 0; }
    } else { m.H = first ? LM.missH * m.mult : Math.max(LM.missH * m.mult, m.H * LM.miss); m.mass = 0; }
    m.last = t;
  },
  read(m, t) {
    if (m.last === null) { m.H = READ_H * m.mult; m.mass = 1; } else {
      const days = t - m.last;
      if (days < LM.massDays) m.H *= 1 + READ_MASS; else m.H *= (LM.sp0 + LM.sp1 * (1 - V2.R(m, t))) ** READ_SPACE;
    }
    m.last = t;
  },
};
// ---------- memory: FSRS-6 default weights (py-fsrs scheduler.py, read 7 Nov 2026); difficulty held at its middle, 5. Reads have no FSRS form: they keep this file's restudy rule. ----------
const W = [0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542];
const DECAY = -W[20]; const FACTOR = 0.9 ** (1 / DECAY) - 1; const D_MID = 5;
const FS = {
  fresh: (mult) => ({ S: W[2] * mult, mult, last: null }),
  R: (m, t) => (m.last === null ? 1 : (1 + FACTOR * (t - m.last) / m.S) ** DECAY),
  answer(m, correct, R, t) {
    const first = m.last === null; const days = first ? 0 : t - m.last;
    if (first) m.S = (correct ? W[2] : W[0]) * m.mult;
    else if (days < 0.25) m.S = Math.max(0.01, correct ? m.S * Math.exp(W[17] * (0 + W[18])) * m.S ** -W[19] : m.S * Math.exp(W[17] * (-2 + W[18])));
    else if (correct) m.S *= 1 + Math.exp(W[8]) * (11 - D_MID) * m.S ** -W[9] * (Math.exp(W[10] * (1 - R)) - 1);
    else m.S = Math.max(0.01, Math.min(m.S, W[11] * D_MID ** -W[12] * ((m.S + 1) ** W[13] - 1) * Math.exp(W[14] * (1 - R))));
    m.S = Math.max(0.01, m.S);
    m.last = t;
  },
  read(m, t) {
    if (m.last === null) { m.S = (READ_H / LM.h0) * W[2] * m.mult; } else if (t - m.last < LM.massDays) m.S *= 1 + READ_MASS;
    else m.S *= (1 + Math.exp(W[8]) * (11 - D_MID) * m.S ** -W[9] * (Math.exp(W[10] * (1 - FS.R(m, t))) - 1)) ** READ_SPACE;
    m.last = t;
  },
};
const MEM = MEMORY === 'fsrs' ? FS : V2;
const lapse = (R) => Math.max(0, 1 - 2 * R);

// ---------- learners, as scripts/faster-by-goal-sim.js ----------
const rngOf = (...p) => X.rngFor(X.hash(...p));
function ordinary(seed, i) {
  const u = rngOf('ord', seed, i);
  const traits = {};
  for (const id of X.IDS) traits[id] = clamp(50 + 17 * u.normal(), 2, 98);
  const age = 8 + Math.floor(u() * 63);
  return { id: `o${seed}-${i}`, kind: 'ordinary', age, band: X.bandOf(age), traits };
}
function paramsOf(L) {
  const T = L.traits; const z = (id) => (T[id] - 50) / 50; const uu = (id) => T[id] / 100;
  return {
    theta0: (T.prior_knowledge - 50) / 25,
    lr: clamp(1 + 0.75 * z('mastery_velocity'), 0.6, 1.5),
    timeMult: Math.exp(-0.6 * z('processing_velocity')),
    mult: Math.exp(-0.9 * z('decay_rate')) * FORGET,
    skim: 0.03 + 0.25 * (1 - uu('instruction_adherence')) ** 2,
  };
}

// ---------- one sitting's bricks ----------
function world(L, P, doc, rep) {
  const rnd = rngOf('run', L.id, doc.doc, rep, SALT);
  const kr = rngOf('know', L.id, doc.doc, rep);
  const sk = [];
  for (let i = 0; i < doc.skills; i++) {
    const rel = 0.5 * P.theta0 + 0.8 * kr.normal();
    sk.push({ k: clamp(sigmoid(1.5 * (rel - LM.priorShift)), 0.02, 0.97), m: MEM.fresh(P.mult), st: { right: 0, wrong_n: 0 }, due: null, stop: false, reviews: 0 });
  }
  return { rnd, sk, minutes: { read: 0, author: 0, practice: 0, review: 0 } };
}
function answer(w, P, s, t, bucket) {
  const R = MEM.R(s.m, t);
  s.k *= 1 - KLOSS * lapse(R);
  const p = s.k * R + (1 - s.k * R) * GUESS;
  const right = w.rnd() < p;
  w.minutes[bucket] += ((right ? ITEM_S + RIGHT_S : ITEM_S + WRONG_S + RETRY_S) / 60) * P.timeMult;
  MEM.answer(s.m, right, R, t);
  s.k = clamp(s.k + (1 - s.k) * LM.a * P.lr * (right ? 1 : 0.5), 0, 0.995);
  return right;
}
function readPage(w, P, s, t, words, nth, bucket, gain = 1, wpmMult = 1) {
  const skim = w.rnd() < P.skim;
  s.k += (1 - s.k) * clamp((skim ? LM.pageSkim : LM.page) * P.lr * READ_K2 ** nth * gain, 0, 0.95);
  w.minutes[bucket] += ((words / (WPM * wpmMult)) * P.timeMult * (skim ? 0.4 : 1)) * (nth > 0 ? REREAD_TIME : 1);
  MEM.read(s.m, t);
}
function exam(w, t) {
  let sum = 0; let low = 1;
  for (const s of w.sk) { const R = MEM.R(s.m, t); const v = s.k * (1 - KLOSS * lapse(R)) * R; sum += v; if (v < low) low = v; }
  return { score: sum / w.sk.length, low };
}
const nextStudyDay = (d) => (EVERY > 1 ? Math.ceil(d / EVERY) * EVERY : d);

// ---------- Savant ----------
const ARMS = {
  course: (doc) => ({ words: doc.today_words, practice: 3, checks: 5, expand: false }),
  lean: (doc) => ({ words: doc.lean_words, practice: doc.lean_practice / doc.skills, checks: doc.lean_checks / doc.skills, expand: false, gain: LEAN_GAIN }),
  expand: (doc) => ({ words: doc.lean_words, practice: doc.lean_practice / doc.skills, checks: doc.lean_checks / doc.skills, expand: true, gain: LEAN_GAIN }),
};
// Lever 2 and 3 arms (docs/UPLOAD-4X.md). tf1: today's starting-check rule, one right answer skips a part. tf: test-first with proof (two right, one sure, a recheck in 3 days). custom: tf plus the scorecard's knobs from ESTIMATED traits; oracle: the same from TRUE traits (an upper bound, never a claim).
ARMS.tf1 = (doc) => ({ ...ARMS.expand(doc), tf: { need: 1, sure: false } });
ARMS.tf = (doc) => ({ ...ARMS.expand(doc), tf: { need: TF.PARAMS.need, sure: true } });
ARMS.course_tf1 = (doc) => ({ ...ARMS.course(doc), tf: { need: 1, sure: false } }); // the same two rules on today's whole course, where a part costs about 8 questions, not a page
ARMS.course_tf = (doc) => ({ ...ARMS.course(doc), tf: { need: TF.PARAMS.need, sure: true } });
ARMS.custom = (doc) => ({ ...ARMS.expand(doc), tf: { need: TF.PARAMS.need, sure: true }, custom: 'est' });
ARMS.oracle = (doc) => ({ ...ARMS.expand(doc), tf: { need: TF.PARAMS.need, sure: true }, custom: 'true' });
const CUSTOM_CACHE = new Map();
function knobsFor(L, kind) {
  const key = `${L.id}:${kind}`;
  if (!CUSTOM_CACHE.has(key)) {
    const T = {};
    if (kind === 'true') Object.assign(T, L.traits);
    else { const r = rngOf('est', L.id); for (const id of X.IDS) T[id] = clamp(50 + EST_R * (L.traits[id] - 50) + EST_SD * r.normal(), 2, 98); }
    CUSTOM_CACHE.set(key, CU.plan(T));
  }
  return CUSTOM_CACHE.get(key);
}
/** A fractional count: this skill gets the floor or the ceiling, by its turn. */
const countOf = (x, i) => { const f = Math.floor(x); return f + ((i * 0.6180339887) % 1 < x - f ? 1 : 0); };
function savant(L, P, doc, rep, armName, H, dated = false) {
  const arm = ARMS[armName](doc);
  const knobs = arm.custom ? knobsFor(L, arm.custom).knobs : null;
  if (knobs) { arm.practice = Math.max(0, arm.practice + knobs.practiceDelta); if (knobs.testFirst === 'off') arm.tf = null; else if (arm.tf) arm.tf = { ...arm.tf, need: knobs.proofNeed }; }
  const w = world(L, P, doc, rep);
  const app = { m: 0, fresh: { right: 0, total: 0 } };
  const pagesWords = (arm.words * WORDS_MULT) / doc.skills;
  const freshOf = () => MP.freshAccuracy(app.fresh);
  const iso = (t) => EPOCH + t * DAY_MS;
  const check = (s, t, n) => { let r = 0; const used = Math.max(1, n); for (let q = 0; q < used; q++) { if (answer(w, P, s, t, 'practice')) r++; } return { r, n: used }; };
  /** Lesson, practice, then the mastery check; a failed check sends the learner back through the page. As services/material-study.js. */
  const learn = (s, i, t0) => {
    let t = t0;
    readPage(w, P, s, t, pagesWords, s.st.right + s.st.wrong_n > 0 ? 1 : 0, 'read', arm.gain || 1);
    for (let q = 0; q < countOf(arm.practice, i); q++) { if (answer(w, P, s, t, 'practice')) s.st.right++; else s.st.wrong_n++; }
    for (let tries = 0; tries < 5; tries++) {
      t += 0.002;
      const c = check(s, t, countOf(arm.checks, i));
      s.st.right += c.r; s.st.wrong_n += c.n - c.r;
      if (c.r / c.n >= PASS) { app.fresh.right += c.r; app.fresh.total += c.n; return t; }
      readPage(w, P, s, t, pagesWords, 1, 'read', arm.gain || 1);
    }
    return t;
  };
  let eff = null; let examDayNow = null;
  const examDayOf = () => examDayNow;
  /** A test date: the real rule of services/retention-goal.js, on whichever interval the arm chose. */
  const dateLimited = (days, t) => {
    const lim = RG.limitInterval(eff, days, iso(t));
    return lim.done ? null : lim.days;
  };
  const schedule = (s, t, end) => {
    let days;
    if (arm.expand) {
      // The app's own entry, with the goal as services/retention-goal.js gives it.
      const goal = dated ? eff : (end === null ? { status: 'forever' } : { status: 'horizon', days: H });
      const out = E.plan(s.st, { eff: goal, m: app.m, now: iso(t), finishedOn: end === null ? null : new Date(iso(examDayOf() - H)).toISOString(), fresh: freshOf(), p: P_EXPAND });
      if (out.done) { s.stop = true; s.due = null; return; }
      const dd = knobs && knobs.reviewScale !== 1 ? Math.max(1, Math.round(out.days * knobs.reviewScale)) : out.days;
      s.due = t + dd; s.interval = dd;
      return;
    } else {
      days = MP.intervalDays(s.st.right, s.st.wrong_n, app.m, null);
      if (end !== null && !dated && t + days > end) { s.stop = true; s.due = null; return; }
    }
    if (dated) { days = dateLimited(days, t); if (days === null) { s.stop = true; s.due = null; return; } }
    s.due = t + days; s.interval = days;
  };
  /** Lever 2: ask first. Adaptive: a miss ends it at once (learn the part); `need` right answers, one given as sure, skip it. */
  const tryTestFirst = (s, t0) => {
    let right = 0; let sure = 0;
    for (let q = 0; q < arm.tf.need; q++) {
      const know = s.k;
      if (!answer(w, P, s, t0, 'practice')) return false;
      right++; if (w.rnd() < clamp(SURE_CAL * know, 0.05, 0.95)) sure++;
    }
    if (arm.tf.sure && !sure) return false;
    s.st.right += right; app.fresh.right += right; app.fresh.total += right;
    return true;
  };
  let t = 0;
  w.sk.forEach((s, i) => {
    if (arm.tf && tryTestFirst(s, t)) { s.skipped = true; s.lastT = t; } else { t = learn(s, i, t); s.lastT = t; }
  });
  const finish = Math.ceil(t);
  const examDay = finish + H;
  const end = H >= 1095 ? null : examDay; // no test day: nothing ends the reviews; the exam is at 3 years
  examDayNow = examDay;
  if (dated) eff = { status: 'date', test_date: new Date(iso(examDay)).toISOString().slice(0, 10), set_on: new Date(iso(examDay - H)).toISOString().slice(0, 10) };
  w.sk.forEach((s) => {
    if (s.skipped) { // a skipped part is rechecked in a few days, then goes on the ordinary schedule
      const due = s.lastT + TF.PARAMS.recheckDays;
      if (end !== null && !dated && due >= end) { s.stop = true; s.due = null; } else if (dated && due > examDay) { s.stop = true; s.due = null; } else { s.due = due; s.interval = TF.PARAMS.recheckDays; }
    } else schedule(s, t, end);
  });
  for (let guard = 0; guard < 4000; guard++) {
    const open = w.sk.filter((s) => s.due !== null && (dated ? s.due <= examDay : s.due < examDay));
    if (!open.length) break;
    const day = nextStudyDay(Math.ceil(Math.min(...open.map((s) => s.due)) - 1e-9));
    if (day > examDay || (day === examDay && !dated)) break;
    let now = day === examDay ? day - 0.05 : day + 0.02; // whole days; a day-of look comes just before the exam
    for (const s of open) {
      if (s.due > day) continue;
      const days = now - s.lastT;
      let r = 0;
      const hadRightBefore = s.st.right; const hadWrongBefore = s.st.wrong_n;
      // --review-qs=1 is adaptive: one question, and a second only after a miss. A right first answer stands for both.
      let asked = 0;
      if (REVIEW_QS === 1) { asked = 1; if (answer(w, P, s, now, 'review')) r = 2; else { asked = 2; if (answer(w, P, s, now, 'review')) r = 1; } } else { for (let q = 0; q < 2; q++) { asked++; if (answer(w, P, s, now, 'review')) r++; } }
      const score = r / 2;
      if (arm.expand) app.m = E.updateM(app.m, s.st, days, score, { fresh: freshOf(), p: P_EXPAND });
      else app.m = MP.updateForgetting(app.m, days, hadRightBefore, hadWrongBefore, score, freshOf());
      const rightNow = REVIEW_QS === 1 ? (r === 2 ? 1 : r) : r;
      s.st.right += rightNow; s.st.wrong_n += asked - rightNow;
      s.reviews++; s.lastT = now;
      if (dated && day === examDay) { s.due = null; now += 0.0001; continue; } // the look on the day is the last
      if (r === 2) schedule(s, now, end);
      else if (r > 0) {
        if (arm.expand) E.afterShaky(s.st, iso(now), P_EXPAND);
        const half = Math.max(1, Math.floor((s.interval || 1) / 2));
        s.due = now + half; s.interval = half;
      } else {
        if (arm.expand) E.afterLapse(s.st, iso(now), P_EXPAND);
        now = learn(s, 1, now); s.lastT = now;
        schedule(s, now, end);
      }
      now += 0.0001;
    }
  }
  const e = exam(w, examDay);
  const by = w.minutes;
  return { min: by.read + by.practice + by.review, read: by.read, practice: by.practice, review: by.review, score: e.score, low: e.low, reviews: mean(w.sk.map((s) => s.reviews)), skipped: mean(w.sk.map((s) => (s.skipped ? 1 : 0))), m: app.m };
}

// ---------- baselines ----------
/** The student's schedule: looks at gaps growing by a ratio, from a first gap, up to the exam; or stopped after n looks. The search takes the cheapest that reaches the score, so this family decides how generous the baseline is. */
function planDays(H, eve) {
  const seen = new Set(); const out = [];
  for (const first of [1, 2, 4]) {
    for (const ratio of [1.25, 1.5, 1.75, 2, 2.5, 3]) {
      const base = [];
      for (let d = first, g = first; d < H; g *= ratio, d = Math.round(d + g)) base.push(Math.round(d));
      for (let n = 0; n <= base.length; n++) {
        for (const last of eve ? [false, true] : [false]) {
          const days = [...new Set([...base.slice(0, n), ...(last && H > 1 ? [H - 1] : [])])].sort((a, b) => a - b);
          const key = days.join(',');
          if (!seen.has(key)) { seen.add(key); out.push(days); }
        }
      }
    }
  }
  return out;
}
const DAYS_CACHE = new Map();
const plansFor = (H, eve) => { const key = `${H}:${eve ? 1 : 0}`; if (!DAYS_CACHE.has(key)) DAYS_CACHE.set(key, planDays(H, eve)); return DAYS_CACHE.get(key); };

function careful(L, P, doc, rep, H, plan) {
  const w = world(L, P, doc, rep);
  const words = (doc.src * WORDS_MULT) / doc.skills;
  w.sk.forEach((s) => {
    readPage(w, P, s, 0, words, 0, 'read', 1, CAREFUL_WPM);
    w.minutes.author += (AUTHOR_S / 60) * P.timeMult;
    for (let q = 0; q < 12 && s.k < plan.kStop; q++) answer(w, P, s, 0.001, 'practice');
  });
  for (const d of plan.days) { const day = nextStudyDay(d); if (day >= H) continue; w.sk.forEach((s) => answer(w, P, s, day + 0.5, 'review')); }
  const e = exam(w, H);
  return { min: w.minutes.read + w.minutes.author + w.minutes.practice + w.minutes.review, score: e.score, low: e.low };
}
function reread(L, P, doc, rep, H, plan) {
  const w = world(L, P, doc, rep);
  const words = (doc.src * WORDS_MULT) / doc.skills;
  w.sk.forEach((s) => { for (let n = 0; n <= plan.massed; n++) readPage(w, P, s, 0.0005 * n, words, n, 'read'); });
  let nth = plan.massed + 1;
  for (const d of plan.days) { const day = nextStudyDay(d); if (day >= H) continue; w.sk.forEach((s) => readPage(w, P, s, day + 0.5, words, Math.min(3, nth), 'read')); nth++; }
  const e = exam(w, H);
  return { min: w.minutes.read, score: e.score, low: e.low };
}
/** Every plan once: its mean minutes and exam over this learner's documents. */
function tableOf(fn, L, P, docsHere, H, plans) {
  return plans.map((plan) => {
    let min = 0; let score = 0;
    for (const [doc, rep] of docsHere) { const r = fn(L, P, doc, rep, H, plan); min += r.min; score += r.score; }
    return { min: min / docsHere.length, score: score / docsHere.length, plan };
  });
}
function cheapest(table, target) {
  let best = null; let top = -1; let topMin = 0;
  for (const row of table) {
    if (row.score > top) { top = row.score; topMin = row.min; }
    if (row.score >= target && (!best || row.min < best.min)) best = row;
  }
  return best ? { reached: true, min: best.min, score: best.score, looks: best.plan.days.length, massed: best.plan.massed || 0 } : { reached: false, top, topMin };
}

// ---------- run ----------
const ALL = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', 'upload-4x', 'docs.json'), 'utf8'));
const SPLIT = args.docs || 'all';
const DOCS = ALL.filter((d) => SPLIT === 'all' || (SPLIT === 'design' ? d.doc[0] === 'n' : d.doc[0] === 'h'));
const learners = [];
for (let i = 0; i < N_EXT; i++) learners.push(X.learner(SEED, i));
for (let i = 0; i < N_ORD; i++) learners.push(ordinary(SEED, i));

const out = { simulated: true, seed: SEED, memory: MEMORY, args, p: P_EXPAND, learners: [] };
for (const L of learners) {
  const P = paramsOf(L);
  const pick = rngOf('docs', L.id);
  const docsHere = [];
  for (let r = 0; r < REPS; r++) docsHere.push([DOCS[Math.floor(pick() * DOCS.length)], r]);
  const row = { id: L.id, kind: L.kind, age: L.age, prior: P.theta0, goals: {} };
  for (const [name, H, kind] of HORIZONS) {
    const cell = {};
    for (const arm of Object.keys(ARMS)) {
      const rs = docsHere.map(([d, rep]) => savant(L, P, d, rep, arm, H, kind === 'date'));
      cell[arm] = Object.fromEntries(['min', 'read', 'practice', 'review', 'score', 'low', 'reviews', 'skipped'].map((k) => [k, mean(rs.map((x) => x[k]))]));
    }
    if (args['no-base']) { row.goals[name] = cell; continue; }
    const src = mean(docsHere.map(([d]) => d.src));
    cell.read_once = (src / WPM) * P.timeMult;
    const days = plansFor(H, kind === 'date');
    const carefulPlans = []; for (const kStop of [0.7, 0.85, 0.95]) for (const d of days) carefulPlans.push({ kStop, days: d });
    const rereadPlans = []; for (const massed of [0, 1, 2, 4]) for (const d of days) rereadPlans.push({ massed, days: d });
    const carefulTable = tableOf(careful, L, P, docsHere, H, carefulPlans);
    const rereadTable = tableOf(reread, L, P, docsHere, H, rereadPlans);
    for (const arm of ['lean', 'expand', 'course', 'tf1', 'tf', 'custom', 'oracle', 'course_tf1', 'course_tf']) {
      const target = cell[arm].score;
      cell[`careful_${arm}`] = cheapest(carefulTable, target);
      cell[`reread_${arm}`] = cheapest(rereadTable, target);
    }
    const r5 = docsHere.map(([d, rep]) => reread(L, P, d, rep, H, { massed: 4, days: [] }));
    cell.read5 = { min: mean(r5.map((x) => x.min)), score: mean(r5.map((x) => x.score)) };
    row.goals[name] = cell;
  }
  out.learners.push(row);
}
if (args.out) { fs.mkdirSync(path.dirname(args.out), { recursive: true }); fs.writeFileSync(args.out, JSON.stringify(out)); }
console.log(`${out.learners.length} learners done, seed ${SEED}, memory ${MEMORY}`);
