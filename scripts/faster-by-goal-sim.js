#!/usr/bin/env node
/**
 * Is Savant faster, the way the owner defines faster? (docs/FASTER-BY-GOAL.md; SIMULATED, no model calls.)
 *
 * Owner, 5 Nov 2026: "faster means they get all the information they normally would from normal studying or a personal tutor and remember it
 * for how ever long they chose the retention of that to be for". Measure per simulated learner: ACTIVE HOURS until the whole course is covered
 * (every skill understood, k >= 0.85) AND mean recall of the course at the test day is at least TARGET (default 0.70, fixed before any run). A
 * learner who does not reach it is a FAILURE, never dropped.
 *
 * Learning model: the audited v2 model of scripts/scorecard-recovery-sim.js (--learning=v2): each skill has a knowledge level k (raised by a lesson
 * page and by answers with feedback) and a half-life memory (mass vs spaced practice, miss penalty); recall = k x memory recall. Learner parameters
 * come from the generator's true traits (scripts/lib/extreme-learners.js) the way paramsFor() does there. The review policy is the app's real code:
 * services/retention-schedule.js (enforcer calendar), services/retention-goal.js (keptTypes, datePlan) and the 0.85 daily review of
 * services/mastery.js, with the app's own (noisy) estimate of each memory. Arms: Savant at each retention goal, normal studying, a personal tutor.
 *
 *   node scripts/faster-by-goal-sim.js --seed=909091 --out=docs/faster-by-goal/main.json [--forget=1] [--lesson=1] [--target=0.7] [--minutes=60]
 *        [--n-extreme=120] [--n-ordinary=40] [--arms=...] [--jit=1]
 */
const fs = require('fs');
const path = require('path');
const X = require('./lib/extreme-learners');
const schedule = require('../services/retention-schedule');
const speed = require('../services/speed-levers');
const goal = require('../services/retention-goal');

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=?(.*)$/); return [m[1], m[2] === '' ? '1' : m[2]]; }));
const num = (k, d) => (args[k] === undefined ? d : Number(args[k]));
const SEED = num('seed', 909091);
const FORGET = num('forget', 1);       // multiplies every true half-life (2 = slower forgetting, 0.5 = faster)
const LESSON = num('lesson', 1);       // multiplies lesson page time (0.5 = pages take half as long)
const TARGET = num('target', 0.7);
const MINUTES = num('minutes', 60);    // study minutes a day
const SKILLS = num('skills', 50);
const N_EXT = num('n-extreme', 120);
const N_ORD = num('n-ordinary', 40);
const JIT = args.jit === '1';          // goal-aware review floor (the candidate fix), see reviewDue()
const GOAL_MEM = num('goal-memory', 0.8);   // candidate fix only (--jit=1): a review is deferred while predicted recall on the test day stays at least this
const FLOOR = num('floor', 0.85); // goal-mode daily recall floor (candidate fix); 0.85 = the app today
const FINISH = args.finish === '1';     // round 3: horizon counted from finishing the course
const FINAL = args.final === '1';
const SKIPK = num('skipk', 2);          // lesson-skip variant: a page is skipped when the skill is already known to this level (a passed pretest: needs a screen, not wired); 2 = never
const KLOSS = num('kloss', 0);        // sensitivity: share of understanding lost in a deep lapse, i.e. memory recall under 0.5 (0 = the audited v2 model: k never decays)
const EST_SD = num('est-sd', 0.3);     // log-sd of the app's error in a learner's half-life multiplier
// ---------- speed levers (docs/SPEED-4X.md). None of these changes today's arms unless named as a variant. ----------
const SPEED_ARMS = args['speed-arms'] ? args['speed-arms'].split(',') : []; // names from SPEED_LADDER below, or "testout=1:short=1:...": adds cell.speed[name] to every goal
const COLD_GAIN = num('cold-gain', 1);   // ADVERSE sensitivity: an answer's learning is scaled towards this while none of the page has been read (1 = the model as audited)
const SKIP_LOSS = num('skip-loss', 0);   // ADVERSE sensitivity: share of a page's content its check questions do not test. A skipped share of it stays at what the learner knew before
const EST_GAIN = num('est-gain', 1);     // sensitivity: the tracker believes learning is this many times what it really is (above 1 stops too early)
const LR_HAT_SD = num('lr-hat-sd', 0.25);// log-sd of the app's error in a learner's learning rate
const GUESS_ARG = num('guess', 0.25);    // sensitivity: chance of a right answer without understanding on a check (the tracker keeps assuming 0.25)
const REVIEW_S = num('review-s', 0);     // cost variant: seconds per review answer for the speed arms (0 = same as practice). See docs/SPEED-4X.md
const REVIEW_S_ALL = args['review-s-all'] === '1'; // ... and for the baselines' reviews too
const IMPLICIT = num('implicit', 0);     // MODEL EXTENSION, off by default, shown both ways: a right answer on a skill counts as this share of a review of its prerequisite
// Round 2 (docs/SPEED-4X.md). The model's rate per practice is never touched here.
const HIER = num('hier', 0);             // PRIOR-KNOWLEDGE structure, every arm: with this chance a prerequisite edge means knowing a skill implies at least as much of what it builds on (0 = audited: independent given the learner)
const PRIOR_ADD = num('prior-add', 0);   // sensitivity, every arm: added to every learner's standing on every skill (0 = audited)
const PRIOR_NONE = args['prior-none'] === '1'; // sensitivity, every arm: nobody knows anything yet
const EDGE_A = num('edge-a', 8);         // slope of the assumed item-difficulty curve for the --edge arms (placement questions only)
const COMPOSITE_C = num('composite-c', 0.5); // a two-skill item takes (1 + this) item times to read and answer (1 = no saving); each skill gets the update of its own answer, the same rate as a separate item
const ITEM_S = num('item-s', 0);         // cost variant for EVERY arm: seconds to read and answer an item (0 = the sim's 35)
const WRONG_S = num('wrong-s', 0);       // ... and to read feedback after a miss (0 = 25)
const RETRY_S = num('retry-s', 0);       // ... and the retry (0 = 38)
const MEM_GAIN = num('mem-gain', 1);     // WHAT-IF only (never a headline): each spaced right answer grows memory by this power of the model's growth, Savant only
const SPEED_GAIN = num('speed-gain', 1); // WHAT-IF only (never in a headline number): the speed arms learn this many times what the audited model says, per page and per answer
// Round 3 (docs/SPEED-4X.md): how students really study. The reading-memory constants come from published restudy results; each has a range, see docs/SPEED-4X.md.
const RUN_SALT = args['run-salt'] || '';  // noise control: the same arm on another random stream
const READ_H = num('read-h', 2.5);        // half-life in days a read gives (times the learner's own multiplier). 1.6 to 3.6 is 0.2 to 0.45 of this model's half-life after a first pass of practice, the restudy/retrieval ratio in Roediger and Karpicke 2006; 7 is the lab's absolute figure, generous to the reader
const READ_MASS = num('read-mass', 0.05); // a massed reread adds this share to the half-life: nearly nothing (Callender and McDaniel 2009; Roediger and Karpicke 2006)
const READ_SPACE = num('read-space', 0.5);// a spaced reread grows memory by this power of a spaced right answer's growth (ASSUMED; spacing helps rereading, Rawson and Kintsch 2005, but less than retrieval)
const READ_K2 = num('read-k2', 0.5);      // each further read teaches this share of the read before it (ASSUMED; Callender and McDaniel 2009: little gain from a reread)
const REREAD_TIME = num('reread-time', 0.8); // a reread takes this share of the first read's minutes (ASSUMED)
// Round 3 levers: effects are never assumed, every value below is swept over a published range and the sweep is shown (docs/SPEED-4X.md).
const WE_S = num('we-s', 26);             // seconds to study one worked example (range 35, 26, 20): McLaren et al. 2016 report 46 to 69% less time than problems at equal test scores
const WE_GAIN = num('we-gain', 0.75);     // what one worked example teaches, as a share of a right answer with feedback (range 0.5, 0.75, 1)
const WE_LINE = num('we-line', 0.55);     // a worked example only while the tracker puts understanding under this (expertise reversal: none for a learner who has it)
const WE_MAX = num('we-max', 2);          // at most this many in a row, then a problem (fading)
const PRE_GAIN = num('pre-gain', 1);      // a page read after a question on it teaches this many times as much (pretesting; 1 = no credit; range from calibration on Chan et al. 2018)
const ILV_H = num('ilv-h', 1);            // interleaving: half-life after the first pass, this many times longer, for arms with the app's mixed practice (1 = no credit; range from calibration on Brunmair and Richter 2019)
const QUICK_S = num('quick-s', 15);       // seconds to read and answer a one-tap review question (range 25, 15, 10). Format makes little retention difference: Smith and Karpicke 2014, McDermott et al. 2014. The seconds are not measured.
const QUICK_MEM = num('quick-mem', 1);    // ADVERSE sensitivity: a one-tap review grows memory by this power of a typed review's growth (1 = the format makes no difference, as Smith and Karpicke 2014 mostly found; their fourth experiment and McDaniel et al. 2007 point the other way)
// Round 4 (docs/speed-real/ROUND4.md).
const SCREEN_S = num('screen-s', 0);      // the speed arms only: seconds the level's closing screen costs (the real path has one per level; a person's seconds, ASSUMED)
const ONE_S = num('one-s', 3);            // the same with SPEED_ONE_PROMPT: Continue on top, one optional question (ASSUMED)
const CKPT_ANS = num('ckpt-answers', 0);  // the speed arms only: checkpoint answers per lesson on the real path (MEASURED by scripts/speed-r4-walk.js: about 2 a lesson). Time only, no learning credit, which is conservative
const SPACE_DAYS = String(args['space-days'] || '1,7').split(',').map(Number); // SPEED_SPACE_RETENTION: the memory checks that replace the massed retention levels, days after learning (the real queue: adaptation.reviewQueue RETAIN_DAYS and RETAIN_SPAN_DAYS)
const EVERY = num('every', 1);            // ADVERSE sensitivity, every arm: the learner studies only every Nth day (a real learner does not come back daily)
const MASS2 = num('mass2', 0.03);         // ADVERSE sensitivity, every arm: what each massed right answer past the fifth adds to the half-life (0.03 audited). Higher favours massed retention levels
const TIGHT_GAIN = num('tight-gain', 1);  // ADVERSE sensitivity: what the tight page teaches, as a share of the whole page's teaching (1 = every key point kept teaches as much in fewer words)
const SELF_OVER = num('self-over', 0);    // sensitivity for the careful self-studier: stops practising this much under true understanding (0 = stops exactly at 0.85, an oracle no person has)
const PREREQ = num('prereq', 0.5);       // share of skills whose previous skill is a prerequisite (only with --implicit)
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

// v2 learning constants (scripts/scorecard-recovery-sim.js LM, literature set)
const LM = { mass1: 0.3, massN: 5, mass2: MASS2, massDays: 0.25, sp0: 1.3, sp1: 1.5, h0: 2.8, missH: 1.5, miss: 0.4, a: 0.2, page: 0.5, pageSkim: 0.15, priorShift: 0.5, dd: 0.5 };
const COST = { page_min: 7, item_s: ITEM_S || 35, right_s: 3, wrong_s: WRONG_S || 25, retry_s: RETRY_S || 38 }; // goal-sim's review costs (services/retention-goal-sim.js); a 7-minute page, so lesson pages are about 45% of first-pass hours (the owner: about half; the table reports the measured split)
const GUESS = GUESS_ARG;
/** Depth of a lapse: 0 while memory recall is at least 0.5, up to 1 when it is gone. A deep lapse costs understanding too (the --kloss sensitivity). */
const lapse = (R) => Math.max(0, 1 - 2 * R);
const REVIEW_TARGET = 0.85; // services/mastery.js
const TOO_EASY = 0.95;      // enforcers ask only items under this (retention-params selection.window)
const REVIEW_SHARE = 0.5;   // while the course is not covered, reviews take at most this share of a day (assumption: the daily plan caps them)

/** Candidate fix (--jit=1, rejected: docs/FASTER-BY-GOAL.md): a skill needs a review now only if, left alone, its predicted recall on the test day falls under the floor. */
function reviewNeeded(daysToTest, predictAt, floor) { return !Number.isFinite(daysToTest) || daysToTest <= 0 || predictAt(daysToTest) < floor; }

// ---------- memory ----------
const memNew = (mult) => ({ H: 2 * mult, mult, last: null, mass: 0 });
const memR = (m, t) => (m.last === null ? 1 : 2 ** (-(t - m.last) / m.H));
function memUpdate(m, correct, R, t, pItem = 0.7, boost = 1) {
  const first = m.last === null;
  const days = first ? 0 : t - m.last;
  if (correct) {
    if (first) { m.H = LM.h0 * m.mult; m.mass = 1; }
    else if (days < LM.massDays) { m.H *= 1 + (m.mass < LM.massN ? LM.mass1 : LM.mass2); m.mass++; }
    else { m.H *= ((LM.sp0 + LM.sp1 * (1 - R)) * (1 + LM.dd * clamp(0.8 - pItem, -0.3, 0.4))) ** boost; m.mass = 0; }
  } else {
    m.H = first ? LM.missH * m.mult : Math.max(LM.missH * m.mult, m.H * LM.miss);
    m.mass = 0;
  }
  m.last = t;
}

/** A read or reread: restudy builds far less memory than retrieval, and massed rereading adds nearly nothing. */
function memRead(m, t) {
  if (m.last === null) { m.H = READ_H * m.mult; m.mass = 1; } else {
    const days = t - m.last;
    if (days < LM.massDays) m.H *= 1 + READ_MASS; else m.H *= (LM.sp0 + LM.sp1 * (1 - memR(m, t))) ** READ_SPACE;
  }
  m.last = t;
}

// ---------- learners ----------
function rngOf(...p) { return X.rngFor(X.hash(...p)); }
function ordinary(seed, i) {
  const u = rngOf('ord', seed, i);
  const traits = {};
  for (const id of X.IDS) traits[id] = clamp(50 + 17 * u.normal(), 2, 98);
  const age = 8 + Math.floor(u() * 63);
  return { id: `o${seed}-${i}`, kind: 'ordinary', age, band: X.bandOf(age), traits };
}
function paramsOf(L) {
  const T = L.traits; const z = (id) => (T[id] - 50) / 50; const uu = (id) => T[id] / 100;
  const rg = rngOf('par', L.id);
  const skim = 0.03 + 0.25 * (1 - uu('instruction_adherence')) ** 2;
  return {
    theta0: (T.prior_knowledge - 50) / 25,
    lr: clamp(1 + 0.75 * z('mastery_velocity'), 0.6, 1.5),
    timeMult: Math.exp(-0.6 * z('processing_velocity')),
    mult: Math.exp(-0.9 * z('decay_rate')) * FORGET,
    skim,
    estErr: Math.exp(EST_SD * rg.normal()),
    lrHat: clamp(1 + 0.75 * z('mastery_velocity'), 0.6, 1.5) * Math.exp(LR_HAT_SD * rg.normal()),
  };
}

// ---------- one run ----------
/**
 * arm: { type: 'savant', goal: {id, kind: 'date'|'horizon'|'forever', H} } | { type: 'normal', cram } | { type: 'tutor', gain, weekly }
 * Returns { hours, by: {lesson, practice, review}, covered, coverDay, recall, pass, testDay }.
 */
function simulate(L, P, arm, plan) {
  const rnd = RUN_SALT ? rngOf('run', L.id, RUN_SALT) : rngOf('run', L.id);
  const kr = rngOf('know', L.id);
  const base = X.hash('start', L.id) % 60; // absolute calendar day of the first study day (enforcer calendar position)
  const { testRel: testRel0 } = plan;
  const FIN = !!plan.fromFinish;           // horizon counted from finishing the course (round 3)
  const FIN_ANY = FIN;
  let T = FIN ? 2200 : testRel0;           // the test day; with FIN it becomes finish + H once the course is covered
  const sk = [];
  const rels = []; for (let s = 0; s < SKILLS; s++) rels.push(0.5 * P.theta0 + 0.8 * kr.normal() + PRIOR_ADD);
  const hr = rngOf('hier', L.id); const prer0 = rngOf('prereq', L.id);
  if (HIER > 0) { const edges = [0]; for (let s = 1; s < SKILLS; s++) edges.push(prer0() < PREREQ ? 1 : 0); for (let s = SKILLS - 1; s > 0; s--) if (edges[s] && hr() < HIER) rels[s - 1] = Math.max(rels[s - 1], rels[s]); }
  for (let s = 0; s < SKILLS; s++) {
    const rel = rels[s];
    sk.push({ k: PRIOR_NONE ? 0.02 : clamp(sigmoid(1.5 * (rel - LM.priorShift)), 0.02, 0.97), m: memNew(P.mult), e: memNew(P.mult * P.estErr), a: null, rungs: [], end: Infinity, learnedFor: false, k0: 0, seen: 0, cap: 1, pre: null });
    sk[s].k0 = sk[s].k;
  }
  const prer = rngOf('prereq', L.id);
  for (let s = 1; s < SKILLS; s++) if (prer() < PREREQ) sk[s].pre = s - 1;
  const SP = arm.speed || null;
  const TGT = arm.target === undefined ? TARGET : arm.target; // matched retention: the arm's review line follows this learner's baseline
  const STU = arm.type === 'student' ? arm : null;
  let firstRight = 0; let firstN = 0;       // the learner's first answers so far (the tracker's prior for the next skill)
  let ansMin = 0; let ansN = 0;             // the app's running minutes per answer (for the final window)
  const tut = arm.type === 'tutor' ? arm : null;
  const pageMult = tut ? tut.page : 1;
  const gainMult = tut ? tut.gain : (STU && STU.gain) || 1;
  const by = { lesson: 0, practice: 0, review: 0, place: 0 };
  let next = 0; let coverDay = null; let t = 0; let minRecall = Infinity;

  const FAST = arm.speed && arm.speed.fast; // real friction only: two taps fewer and no verdict screen on a right answer (assumed 2 s + 2 s; nothing else is faster)
  const itemS = COST.item_s - (FAST ? 2 : 0); const rightS = FAST ? 1 : COST.right_s;
  const itemMin = (R, right) => (right ? (itemS + rightS) : (itemS + COST.wrong_s + COST.retry_s * (R < 1 ? 1 : 0))) / 60 * P.timeMult;
  function answer(s, now, isReview = false, item = null) {
    const R = memR(s.m, now);
    s.k *= 1 - KLOSS * lapse(R);
    const p = item ? speed.pRight(s.k * R, GUESS, item) : s.k * R + (1 - s.k * R) * GUESS;
    const right = rnd() < p;
    const quick = isReview && SP && SP.quick;
    const minutes = quick ? ((QUICK_S + (right ? rightS : COST.wrong_s + COST.retry_s * (R < 1 ? 1 : 0) * (QUICK_S / COST.item_s))) / 60) * P.timeMult : itemMin(R, right) * (isReview && REVIEW_S > 0 && (SP || REVIEW_S_ALL) ? REVIEW_S / COST.item_s : 1);
    const Re = memR(s.e, now);
    memUpdate(s.m, right, R, now, 0.7, (SP ? MEM_GAIN : 1) * (quick ? QUICK_MEM : 1));
    memUpdate(s.e, right, Re, now, 0.7, SP ? MEM_GAIN : 1);
    const cold = (SP ? COLD_GAIN + (1 - COLD_GAIN) * s.seen : 1) * (SP ? SPEED_GAIN : 1); // only with --cold-gain under 1: an answer on a page not read learns less
    s.k = clamp(s.k + (1 - s.k) * LM.a * P.lr * gainMult * cold * (right ? 1 : 0.5), 0, 0.995);
    if (s.tr) { speed.observe(s.tr, right, { recall: isReview ? Re : 1, item }); s.kHat = speed.kMean(s.tr); }
    if (SP && (SP.ilvH || ILV_H) !== 1 && !isReview && !s.ilvDone && right) { s.ilvDone = true; s.m.H *= SP.ilvH || ILV_H; }
    s.lastRight = right;
    if (isReview && !right && s.implied) { s.implied = false; s.relearn = true; } // an implied skill that fails a review goes back on the path
    ansMin += minutes; ansN++;
    if (SP && SP.implicit && IMPLICIT > 0 && right && s.pre !== null) credit(sk[s.pre], now);
    return minutes;
  }
  /** A right answer also retrieves the prerequisite, in part (the --implicit extension): the memory multiplier moves `IMPLICIT` of the way to a full review's. */
  function credit(q, now) {
    if (q.a === null) return;
    for (const mm of [q.m, q.e]) {
      const R = memR(mm, now); const before = mm.H; const lastBefore = mm.last; const massBefore = mm.mass;
      memUpdate(mm, true, R, now);
      mm.H = before * (1 + (mm.H / before - 1) * IMPLICIT);
      mm.last = lastBefore === null ? now : Math.min(now, lastBefore + (now - lastBefore) * IMPLICIT); // a partial retrieval refreshes in part
      mm.mass = massBefore;
    }
  }
  /** A two-skill item (--composite arms): each skill's own retrieval and update, as separate answers; time shared only for the reading and answering. Conjunctive: the item is right only if both are. */
  function answerPair(a, b, now, isReview) {
    const one = (s) => {
      const R = memR(s.m, now); s.k *= 1 - KLOSS * lapse(R);
      const right = rnd() < s.k * R + (1 - s.k * R) * GUESS; const Re = memR(s.e, now);
      memUpdate(s.m, right, R, now, 0.7, MEM_GAIN); memUpdate(s.e, right, Re, now, 0.7, MEM_GAIN);
      s.k = clamp(s.k + (1 - s.k) * LM.a * P.lr * SPEED_GAIN * (right ? 1 : 0.5), 0, 0.995);
      if (s.tr) { speed.observe(s.tr, right, { recall: Re }); s.kHat = speed.kMean(s.tr); }
      if (isReview && !right && s.implied) { s.implied = false; s.relearn = true; }
      return right;
    };
    const ra = one(a); const rb = one(b);
    const scale = isReview && REVIEW_S > 0 ? REVIEW_S / COST.item_s : 1;
    const sec = itemS * scale * (1 + COMPOSITE_C) + (ra && rb ? rightS : (ra ? 0 : COST.wrong_s + COST.retry_s) + (rb ? 0 : COST.wrong_s + COST.retry_s));
    const m = (sec / 60) * P.timeMult; ansMin += m / 2; ansN++;
    return m;
  }
  /** Placement by skill before the path (services/speed-levers.js): most advanced first; known skills never enter the path; implied ones are sampled. Answers carry feedback and count as practice. */
  function placeBySkill() {
    const state = sk.map((s, i) => ({ status: 'open', asked: 0, tr: (s.tr = speed.newTracker({ priorMean: speed.PARAMS.priorMean, lr: P.lrHat, gainMult: EST_GAIN })), i }));
    const fresh = (s) => { if (s.tr.n === 0) { const t = speed.newTracker({ priorMean: speed.priorFromHistory(firstRight, firstN), lr: P.lrHat, gainMult: EST_GAIN }); s.tr.p = t.p; } };
    const prereqs = (i) => (SP.implied && sk[i].pre !== null ? [sk[i].pre] : []);
    let used = 0; let guard = 0;
    for (;;) {
      if (guard++ > 400) break;
      const i = speed.placementNext(state);
      if (i === null) break;
      const s = sk[i];
      fresh(s);
      const item = SP.edge ? speed.bestItem(s.tr, { a: EDGE_A }) : null;
      const m = answer(s, used / 1440, false, item); used += m; by.practice += m; by.place += m;
      if (s.tr.n === 1) { firstN++; if (s.lastRight) firstRight++; }
      speed.placementAnswer(state, i, s.lastRight, prereqs, { useImplied: !!SP.implied, missEnds: !SP.edge });
    }
    for (let i = 0; i < SKILLS; i++) {
      const row = state[i]; const s = sk[i];
      if (row.status === 'known' || row.status === 'implied') {
        s.settled = true; s.implied = row.status === 'implied';
        if (s.implied) { // never answered: its memory starts as a first right answer would (conservative for a skill learned long ago), so it cannot read as never-forgotten
          s.tr = speed.newTracker({ priorMean: 0.85, lr: P.lrHat, gainMult: EST_GAIN });
          for (const mm of [s.m, s.e]) { mm.H = LM.h0 * mm.mult; mm.last = used / 1440; mm.mass = 1; }
        }
        s.kHat = speed.kMean(s.tr);
      }
    }
    return used;
  }
  /** The first pass under the speed levers. Stops on the tracker (a real app has no true k), or as today (true k) when the stop lever is off. */
  function learnSpeed(s, now) {
    if (s.settled) { s.a = Math.floor(now); s.kHat = speed.kMean(s.tr); return 0; } // placement: known or implied, never entered the path
    let weRun = 0; let used = 0; let n = s.tr ? s.tr.n : 0; let pageLeft = 1; let lastRight = s.tr && s.tr.n ? s.lastRight : null;
    if (!s.tr) s.tr = speed.newTracker({ priorMean: speed.priorFromHistory(firstRight, firstN), lr: P.lrHat, gainMult: EST_GAIN * (SP.safety || speed.PARAMS.safety) });
    const conf = SP.conf === undefined ? speed.PARAMS.conf : SP.conf; const minAnswers = SP.minAnswers === undefined ? speed.PARAMS.minAnswers : SP.minAnswers;
    const chunk = SP.short ? (SP.chunk || speed.PARAMS.chunk) : 1;
    const showPage = (f) => {
      const skim = rnd() < P.skim;
      const eff = clamp((skim ? LM.pageSkim : LM.page) * P.lr * (SP.testout && s.tr.n > 0 ? (SP.preGain || PRE_GAIN) : 1) * (SP.tight ? TIGHT_GAIN : 1), 0, 0.95);
      const min = COST.page_min * P.timeMult * LESSON * (skim ? 0.4 : 1) * f * (SP.tight || 1); // time and learning both in proportion to the share of the page (assumed linear; a targeted part is not credited with more)
      s.k += (1 - s.k) * clamp(eff * SPEED_GAIN, 0, 0.95) * f; s.seen = Math.min(1, s.seen + f);
      by.lesson += min; used += min; pageLeft = Math.max(0, pageLeft - f);
      speed.taught(s.tr, f);
    };
    if (!SP.testout && s.seen === 0) showPage(1); // no retrieval first: the whole page, as today
    // appN=1, the real path (config/curriculum.js, services/coverage.js, services/learner-path.js compressProven): three check questions, then whole levels of 14 answers until the objective is proven (at most seven; true understanding stands in for the coverage belief), then its two retention levels, which are never stepped over.
    let appPlan = 3 + Math.round((SP.stay || 0) * 14); let appLevels = 0; let appRet = false; // stay: sittings repeated on one level per lesson, MEASURED by scripts/speed-r4-walk.js; time and massed answers
    const stuckHere = SP.appN && SP.stuck ? rngOf('stuck', L.id, sk.indexOf(s))() < SP.stuck : false; // stuck: stretches the real proof never closes (ordinary practice answers cannot prove an objective), MEASURED by the walker; they walk every level left
    const appStop = () => { if (n < appPlan) return false; if (appRet) return true; if ((s.k >= 0.85 && !stuckHere) || appLevels >= 7) { appRet = true; appPlan = n + (SP.space && s.k >= 0.85 ? 0 : 28); return false; } appLevels++; appPlan = n + 14; return false; };
    const trueStop = () => (SP.appN ? appStop() : s.k >= 0.85 && n >= 3);
    while (n < (SP.appN ? 400 : 25)) {
      if (SP.stop) {
        const st = speed.nextStep(s.tr, { pageLeft }, { conf, minAnswers, lastRight, at: SP.firstAt });
        if (st === 'stop') break;
        if (st === 'teach') { showPage(Math.min(chunk, pageLeft)); lastRight = null; continue; }
      } else {
        if (trueStop()) break;
        if (lastRight === false && pageLeft > 1e-9) { showPage(Math.min(chunk, pageLeft)); lastRight = null; continue; }
      }
      if (SP.worked && weRun < WE_MAX && speed.kMean(s.tr) < WE_LINE) { // a worked example in place of a problem: studied, not answered, so no retrieval and no memory update
        const wm = (WE_S / 60) * P.timeMult; by.practice += wm; used += wm; weRun++; s.nWorked = (s.nWorked || 0) + 1;
        s.k = clamp(s.k + (1 - s.k) * LM.a * P.lr * WE_GAIN * SPEED_GAIN, 0, 0.995); speed.taught(s.tr, (LM.a * WE_GAIN) / LM.page); s.seen = Math.max(s.seen, 0.1);
        continue;
      }
      weRun = lastRight === false ? Math.min(weRun, WE_MAX - 1) : weRun;
      const rightBefore = s.tr.right;
      let m;
      const pair = SP.compositeFirst && s.pre !== null && sk[s.pre].a !== null && speed.kMean(sk[s.pre].tr) * memR(sk[s.pre].e, now + used / 1440) < 0.95 ? sk[s.pre] : null;
      if (pair) { m = answerPair(s, pair, now + used / 1440, false); } else m = answer(s, now + used / 1440);
      by.practice += m; used += m; n++;
      lastRight = s.tr.right > rightBefore;
      if (n === 1) { firstN++; if (lastRight) firstRight++; }
    }
    s.kHat = speed.kMean(s.tr);
    if (SP.space || SP.stop) s.spaceAt = SP.space ? SPACE_DAYS.map((x) => Math.floor(now) + x) : null;
    { // the real path's friction beyond the answers: a closing screen per level, and its checkpoints (time only)
      const levels = 1 + Math.ceil(Math.max(0, n - 3) / 14);
      const fr = ((levels * (SP.onePrompt ? ONE_S : SCREEN_S)) / 60) * P.timeMult + (CKPT_ANS * itemS / 60) * P.timeMult;
      if (SCREEN_S > 0 || CKPT_ANS > 0) { by.practice += fr; used += fr; }
    }
    if (SKIP_LOSS > 0) s.cap = 1 - SKIP_LOSS * (1 - s.seen) * (1 - s.k0); // the part of the unread page the checks never tested stays at what the learner knew
    s.a = Math.floor(now);
    return used;
  }
  /** A read or reread of a whole page: its minutes, what it teaches, and restudy's weak memory. */
  function readPage(s, now, nth) {
    const skim = rnd() < P.skim;
    const eff = clamp((skim ? LM.pageSkim : LM.page) * P.lr * READ_K2 ** nth * gainMult * ((STU && STU.pageGain) || 1), 0, 0.95);
    const min = COST.page_min * P.timeMult * LESSON * (skim ? 0.4 : 1) * (nth > 0 ? REREAD_TIME : 1);
    s.k += (1 - s.k) * eff; s.reads = nth + 1; memRead(s.m, now); memRead(s.e, now);
    return min;
  }
  /** How students really study (Karpicke, Butler and Roediger 2009; Dunlosky et al. 2013): read, reread at once, then some massed problems with no stopping rule. No retrieval until the problems, no spacing. */
  function learnStudent(s, now) {
    let used = 0;
    for (let r = 0; r <= STU.rereads; r++) { const m = readPage(s, now + used / 1440, r); by.lesson += m; used += m; }
    for (let p = 0; p < STU.problems; p++) { const m = answer(s, now + used / 1440); by.practice += m; used += m; }
    s.a = Math.floor(now);
    return used;
  }
  function learn(s, now) {
    if (SP) return learnSpeed(s, now);
    if (STU) return learnStudent(s, now);
    // lesson page
    if (s.k >= SKIPK) { let used = 0; const m = answer(s, now); by.practice += m; used += m; let n = 1; while ((s.k < 0.85 || n < 3) && n < 25) { const m2 = answer(s, now + used / 1440); by.practice += m2; used += m2; n++; } s.a = Math.floor(now); return used; }
    const skim = rnd() < P.skim;
    const pageEff = clamp((skim ? LM.pageSkim : LM.page) * P.lr * pageMult * (tut ? tut.pageEff : 1), 0, 0.95);
    const pageMin = COST.page_min * P.timeMult * LESSON * (skim ? 0.4 : 1) * pageMult;
    s.k = s.k + (1 - s.k) * pageEff;
    by.lesson += pageMin;
    let used = pageMin; let n = 0;
    while ((s.k < 0.85 - SELF_OVER || n < 3) && n < 25) { const m = answer(s, now + used / 1440); by.practice += m; used += m; n++; }
    s.a = Math.floor(now);
    return used;
  }
  const reviewMin = (s, now) => {
    if (STU && STU.cram === 'reread') { const m = readPage(s, now, Math.min(3, s.reads || 1)); by.review += m; return m; }
    const m = answer(s, now, true); by.review += m; return m;
  };
  const recallAt = (now) => mean(sk.map((s) => { const R = memR(s.m, now); return s.cap * s.k * (1 - KLOSS * lapse(R)) * R; }));

  // savant policy parts
  let types = []; let datePlanDays = new Map(); let horizonN = null;
  if (arm.type === 'savant') {
    const g = arm.goal;
    if (g.kind === 'date') { for (const p of goal.datePlan(base, base + T)) datePlanDays.set(p.day, p.kind); }
    else { horizonN = g.kind === 'horizon' ? g.H : null; types = goal.keptTypes({ status: g.kind === 'horizon' ? 'horizon' : 'forever', days: g.kind === 'horizon' ? g.H : null }); }
  }
  const savant = arm.type === 'savant';

  for (let d = 0; d <= T; d++) {
    let budget = EVERY > 1 && d % EVERY !== 0 ? 0 : MINUTES; let spent = 0; const abs = base + d;
    if (d === 0 && SP && SP.place) spent += placeBySkill();
    if (SP) for (let i = 0; i < next; i++) if (sk[i].relearn && spent < budget) { sk[i].relearn = false; sk[i].settled = false; spent += learnSpeed(sk[i], d + spent / 1440); }
    const covered = next >= SKILLS;
    // ----- reviews (savant: calendar + goal + daily recall floor; tutor: weekly recap; normal: none until the cram day) -----
    const due = [];
    const now0 = d;
    if (savant && SP && SP.review) {
      const known = !(FIN_ANY && coverDay === null) && arm.goal.kind !== 'forever';
      const toEnd = known ? T + 0.5 - d : null;
      const win = speed.endWindow(SKILLS, ansN ? ansMin / ansN : 1, MINUTES);
      for (let i = 0; i < next; i++) {
        const s = sk[i]; const Re = memR(s.e, now0);
        if (SP.firstAt && !speed.shown(s.tr, { conf: SP.coverConf || speed.PARAMS.conf, minAnswers: 2 }) && s.tr.n < 40) { if (Re < (SP.learnR || 0.9)) due.push({ i, Re }); continue; }
        if (speed.reviewDue({ k: s.kHat, recallNow: Re, recallAtEnd: known ? memR(s.e, T + 0.5) : null, daysToEnd: toEnd, target: TGT, margin: SP.margin === undefined ? speed.PARAMS.reviewMargin : SP.margin, endMargin: SP.endMargin, mode: SP.review, window: win })) due.push({ i, Re });
      }
    } else if (savant && arm.backward) {
      if (arm.backward.safety > 0 && d < T - arm.backward.P) for (let i = 0; i < next; i++) { const Re = memR(sk[i].e, now0); if (Re < REVIEW_TARGET && memR(sk[i].e, now0 + (T - d)) < arm.backward.safety) due.push({ i, Re }); } // safety check: a skill predicted far under target at the test is reviewed anyway
      if (d >= T - arm.backward.P && d < T) for (let i = 0; i < next; i++) { const Re = memR(sk[i].e, now0); if (Re < arm.backward.floor) due.push({ i, Re }); }
    } else if (savant) {
      const planKind = datePlanDays.get(abs) || (FIN && FINAL && plan.H <= 60 && coverDay !== null ? (d === T - 1 ? 'final' : d === T ? 'dayof' : undefined) : undefined); // round 3: a horizon that is counted from finishing also gets a final and a day-of look
      for (let i = 0; i < next; i++) {
        const s = sk[i];
        if (d > s.end) continue;
        const Re = memR(s.e, now0);
        let need = false;
        const wanted = !JIT || planKind === 'final' || planKind === 'dayof' || reviewNeeded(daysToTest(s, d), (x) => memR(s.e, now0 + x), GOAL_MEM);
        if (planKind && Re < TOO_EASY && wanted) need = true;
        if (!need && s.rungs.length && s.rungs[0] <= abs) { s.rungs.shift(); if (Re < TOO_EASY && wanted) need = true; }
        if (!need && Re < (JIT ? FLOOR : REVIEW_TARGET) && wanted) need = true;
        if (need) due.push({ i, Re });
      }
    } else if (tut && d > 0 && d % 7 === 0) {
      for (let i = 0; i < next; i++) if (sk[i].a !== null && sk[i].a >= d - 7 - 0.1 && sk[i].a < d) due.push({ i, Re: memR(sk[i].e, now0) });
    }
    if (arm.fixedSR) for (let i = 0; i < next; i++) if (sk[i].a !== null && d <= T - 1 && (Array.isArray(arm.fixedSR) ? arm.fixedSR : arm.fixedSR === 2 ? SR_DENSE : SR_DAYS).includes(d - sk[i].a)) due.push({ i, Re: memR(sk[i].e, now0) });
    if (arm.passes && (plan.noDate ? (coverDay !== null && d > coverDay && d <= coverDay + arm.passes) : (d >= T - arm.passes && d < T))) for (let i = 0; i < next; i++) due.push({ i, Re: memR(sk[i].e, now0) });
    if (SP && SP.space) for (let i = 0; i < next; i++) {
      const s = sk[i];
      if (s.spaceAt && s.spaceAt.length && s.spaceAt[0] <= d && (coverDay === null || d <= T)) { const hit = due.find((x) => x.i === i); if (hit) hit.Re = -1; else due.push({ i, Re: -1 }); }
    }
    if (arm.noReviews) due.length = 0; // calibration only: what a first pass alone leaves behind
    due.sort((x, y) => x.Re - y.Re);
    const revCap = covered ? Infinity : MINUTES * REVIEW_SHARE;
    let revSpent = 0;
    const pairedOff = new Set(); const dueSet = new Set(due.map((q) => q.i));
    for (const q of due) {
      if (revSpent >= revCap || spent >= budget) break;
      if (pairedOff.has(q.i)) continue;
      const pi = SP && SP.composite ? (sk[q.i].pre !== null && dueSet.has(sk[q.i].pre) && !pairedOff.has(sk[q.i].pre) ? sk[q.i].pre : (q.i + 1 < SKILLS && sk[q.i + 1].pre === q.i && dueSet.has(q.i + 1) && !pairedOff.has(q.i + 1) ? q.i + 1 : null)) : null;
      let m;
      if (pi !== null) { pairedOff.add(pi); pairedOff.add(q.i); m = answerPair(sk[q.i], sk[pi], d + spent / 1440, true); by.review += m; }
      else m = reviewMin(sk[q.i], d + spent / 1440);
      if (SP && SP.space && sk[q.i].spaceAt && sk[q.i].spaceAt[0] <= d) sk[q.i].spaceAt.shift();
      spent += m; revSpent += m;
    }
    // ----- new material -----
    while (next < SKILLS && spent < budget) {
      const m = learn(sk[next], d + spent / 1440); spent += m;
      const s = sk[next];
      if (savant) {
        for (const ty of types) { const r = schedule.next(ty, base + d); if (r !== null) s.rungs.push(r); }
        s.rungs.sort((a, b) => a - b);
        if (horizonN && !FIN) s.end = d + horizonN - 1;
      }
      next++;
      if (next >= SKILLS && coverDay === null && !(SP && SP.firstAt)) { coverDay = d; if (FIN) { T = coverDay + plan.H; for (const q of sk) q.end = T - 1; } }
    }
    if (SP && SP.firstAt && next >= SKILLS && coverDay === null && sk.every((q) => speed.shown(q.tr, { conf: SP.coverConf || speed.PARAMS.conf, minAnswers: 2 }) || q.tr.n >= 40)) { coverDay = d; if (FIN) T = coverDay + plan.H; }
    t = d;
    if (coverDay !== null && d >= coverDay && (d - coverDay) % Math.max(1, Math.floor((plan.H || 28) / 28)) === 0) { const rc = recallAt(d + 0.5); if (rc < minRecall) minRecall = rc; }
    if (plan.itemH) for (const s of sk) if (s.a !== null && s.rI === undefined && d >= s.a + plan.itemH) s.rI = s.k * (1 - KLOSS * lapse(memR(s.m, d + 0.99))) * memR(s.m, d + 0.99);
    if (arm.oracleStop && next >= SKILLS && recallAt(T + 0.5) >= TGT) break; // bound: stops the day the TRUE recall on the test day (with no more study) reaches the target
  }
  const recall = recallAt(T + 0.5);
  const recallItem = plan.itemH ? mean(sk.map((s) => (s.rI === undefined ? s.k * memR(s.m, T + 0.5) : s.rI))) : null;
  const covered = coverDay !== null;
  const hours = (by.lesson + by.practice + by.review) / 60;
  return { hours, by: { lesson: by.lesson / 60, practice: by.practice / 60, review: by.review / 60, place: by.place / 60 }, settled: sk.filter((s) => s.settled).length, covered, coverDay, recall, recallItem, passItem: recallItem !== null && coverDay !== null && recallItem >= TARGET, pass: covered && recall >= TGT, testDay: T, worked: mean(sk.map((s) => s.nWorked || 0)), meanK: mean(sk.map((s) => s.k)), understood: sk.filter((s) => s.cap * s.k >= 0.85).length / SKILLS, minRecall, pagesShown: mean(sk.map((s) => (SP ? s.seen : 1))), minK: Math.min(...sk.map((s) => s.cap * s.k)) };

  function projEnd(dayRel) {
    if (coverDay !== null) return coverDay + plan.H;
    const perSkill = next > 0 ? (by.lesson + by.practice) / next : 14;
    return dayRel + Math.ceil((SKILLS - next) * perSkill / MINUTES) + plan.H;
  }
  function daysToTest(s, dayRel) {
    if (!arm.goal || arm.goal.kind === 'forever') return Infinity;
    if (FIN) return projEnd(dayRel) - dayRel;
    return arm.goal.kind === 'horizon' ? s.end + 1 - dayRel : T - dayRel;
  }
}

// ---------- plan ----------
/** The learner plans their test day: the days a no-review pass would take (+40%) plus the horizon. */
function plannedCover(L, P) {
  const r = simulate(L, P, { type: 'normal', passes: 0 }, { testRel: 400 });
  // days to cover = hours per day budget; no-review run covers within coverDay
  return Math.ceil((r.coverDay + 1) * 1.4);
}

const PASS_STEPS = [0, 1, 2, 3, 5, 7, 10, 14];
/** The cheapest baseline that reaches the target: the fewest unspaced full-course retrieval passes in the last days before the test. */
function cheapest(L, P, arm, plan) {
  let last = null;
  for (const n of PASS_STEPS) { last = { ...simulate(L, P, { ...arm, passes: n }, plan), passes: n }; if (last.pass) return { first: n === 0 ? last : undefined, best: last }; }
  return { best: last };
}
/** The diligent self-studier: a generic fixed-interval schedule, one question per skill at these days after learning it (no estimates, no outcome knowledge). */
const SR_DAYS = [1, 3, 7, 14, 30, 60, 120, 240, 365, 540, 730, 900, 1000];
const SR_DENSE = [1, 2, 4, 7, 10, 14, 21, 30, 40, 55, 75, 100, 130, 170, 220, 280, 350, 430, 520, 620, 730, 850, 1000]; // a denser generic schedule (about x1.3 expansion), the second self-study variant
/** Generic expanding schedules, one question per skill at day 1, then each gap r times the last (no estimates; the ratios were written before any run). The design seed picks one per goal: the widest reaching 95%. */
const SR_RATIOS = args['self-r'] ? args['self-r'].split(',').map(Number) : [];
function srSchedule(r) { const out = []; let gap = 1; let day = 1; while (day <= 2300) { out.push(Math.round(day)); gap *= r; day += Math.max(1, gap); } return [...new Set(out)]; }
/** "testout=1:short=1:stop=1:review=through:conf=0.9:margin=0.05" */
function parseArm(s) { const o = {}; for (const kv of s.split(':')) { const [k, v] = kv.split('='); o[k] = v === 'through' || v === 'end' ? v : Number(v); } for (const k of ['testout', 'short', 'stop', 'implicit', 'place', 'implied', 'edge', 'composite', 'compositeFirst', 'fast', 'worked', 'quick', 'space', 'onePrompt']) o[k] = !!o[k]; return o; }
const BW_P = [7, 10, 14];
const BW_FLOOR = [0.95];
const BW_SAFETY = [0, 0.1, 0.2, 0.3];
const GOALS = [
  { id: 'horizon 1 week', kind: 'horizon', H: 7 },
  { id: 'horizon 1 month', kind: 'horizon', H: 30 },
  { id: 'horizon 6 months', kind: 'horizon', H: 180 },
  { id: 'horizon 1 year', kind: 'horizon', H: 365 },
  { id: 'no test day (3 y)', kind: 'forever', H: 1095 },
  { id: 'date 1 week', kind: 'date', H: 7 },
  { id: 'date 1 month', kind: 'date', H: 30 },
  { id: 'date 6 months', kind: 'date', H: 180 },
  { id: 'date 1 year', kind: 'date', H: 365 },
];
/** The lever ladder, biggest first, each adding to the last. `review: 'through'` keeps predicted recall at the target on every day of the goal; 'end' asks only in the final window. */
const SPEED_LADDER = {
  // the ladder (for attribution)
  page_tracker: { testout: false, short: false, stop: true },
  testout: { testout: true, short: false, stop: false },
  testout_short: { testout: true, short: true, stop: false },
  plus_stop: { testout: true, short: true, stop: true },
  review_only_through: { testout: false, short: false, stop: false, review: 'through', margin: 0.15, endMargin: 0.05 },
  review_only_end: { testout: false, short: false, stop: false, review: 'end', margin: 0.05 },
  // the two frozen configurations, chosen on design seed 777002 only (docs/SPEED-4X.md). safe: recall is kept at the target on every day of the goal.
  safe: { testout: true, short: true, stop: true, review: 'through', margin: 0.15, endMargin: 0.05 },
  // end: all reviewing goes in a final window before the goal's last day. Recall in between is NOT kept; it leans wholly on understanding never fading.
  end: { testout: true, short: true, stop: true, review: 'end', margin: 0.05, firstAt: 0.7, conf: 0.8, coverConf: 0.95, safety: 0.8 },
  // Round 2, each lever added to safe alone, then all together. Frozen on design seed 777002 before the second held-out seed ran.
  safe_place: { testout: true, short: true, stop: true, review: 'through', margin: 0.15, endMargin: 0.05, place: true },
  safe_implied: { testout: true, short: true, stop: true, review: 'through', margin: 0.15, endMargin: 0.05, place: true, implied: true },
  safe_edge: { testout: true, short: true, stop: true, review: 'through', margin: 0.15, endMargin: 0.05, place: true, edge: true },
  safe_composite: { testout: true, short: true, stop: true, review: 'through', margin: 0.15, endMargin: 0.05, composite: true },
  safe_composite2: { testout: true, short: true, stop: true, review: 'through', margin: 0.15, endMargin: 0.05, composite: true, compositeFirst: true },
  safe_fast: { testout: true, short: true, stop: true, review: 'through', margin: 0.15, endMargin: 0.05, fast: true },
  safe2: { testout: true, short: true, stop: true, review: 'through', margin: 0.15, endMargin: 0.05, place: true, implied: true, edge: true, composite: true, compositeFirst: true, fast: true }, // all of them
  safe3: { testout: true, short: true, stop: true, review: 'through', margin: 0.15, endMargin: 0.05, composite: true, fast: true }, // the two that helped on the design seed
  // bounds nobody could run: true-understanding stop and no pages
  floor_first: { testout: true, short: true, stop: false, chunk: 0.0001, review: 'through', margin: 0.15, endMargin: 0.05 },
  floor_first2: { testout: true, short: true, stop: false, chunk: 0.0001, review: 'through', margin: 0.15, endMargin: 0.05, composite: true, compositeFirst: true, fast: true },
  safe_implicit: { testout: true, short: true, stop: true, review: 'through', margin: 0.15, endMargin: 0.05, implicit: true },
  end_implicit: { testout: true, short: true, stop: true, review: 'end', margin: 0.05, firstAt: 0.7, conf: 0.8, coverConf: 0.95, safety: 0.8, implicit: true },
};
/**
 * How students really study. reread: read, reread once, reread again before the test. massed: read once, a block of problems with no stopping rule, massed problems before the test. mix: the two together, the usual habit.
 * Survey basis: Karpicke, Butler and Roediger 2009 (Memory 17): about 84% list rereading, about 55% as their top strategy. Fixed plans only: never a per-learner stop on an outcome the student cannot see.
 */
const STUDENTS = { reread: { rereads: 1, problems: 0, cram: 'reread' }, massed: { rereads: 0, problems: 5, cram: 'practice' }, mix: { rereads: 1, problems: 3, cram: 'reread' } };
const STUDENT_N = [0, 1, 2, 3, 5, 7, 10, 14, 21, 28, 42, 60]; // days of massed work before the test, within the daily minutes
const STUDENT_R = [1.3, 1.5, 2, 3];
// tutor_d037 and tutor_d079: multipliers solved by scripts/speed-calibrate.js from Nickow et al. 2020 (0.37 SD) and VanLehn 2011 (0.79 SD); no assumption that pages get shorter. d = 2 (Bloom 1984) needs over 6x in this model: the old bloom arm stays as a labelled ceiling, not derived.
const TUTOR_D = { d037: { type: 'tutor', gain: 1.2, page: 1, pageEff: 1.2, passes: 0 }, d079: { type: 'tutor', gain: 1.4, page: 1, pageEff: 1.4, passes: 0 } };
const TUTORS = { lo: { type: 'tutor', gain: 1.1, page: 0.9, pageEff: 1.1, passes: 0 }, typical: { type: 'tutor', gain: 1.3, page: 0.75, pageEff: 1.3, passes: 0 }, bloom: { type: 'tutor', gain: 1.8, page: 0.5, pageEff: 1.6, passes: 0 } };

function main() {
  const learners = [...X.generate(SEED, N_EXT).map((l) => ({ ...l })), ...Array.from({ length: N_ORD }, (_, i) => ordinary(SEED, i))];
  const rows = [];
  for (const L of learners) {
    const P = paramsOf(L);
    const cover = plannedCover(L, P);
    const row = { id: L.id, kind: L.kind, age: L.age, band: L.band, plannedCover: cover, goals: {} };
    for (const g of GOALS) {
      const plan = { testRel: cover + g.H, noDate: g.kind !== 'date', fromFinish: FINISH && g.kind !== 'date', H: g.H, itemH: g.kind === 'horizon' ? g.H : 0 };
      const speedCell = () => { const o = {}; for (const name of SPEED_ARMS) { const sp = name.includes('=') ? parseArm(name) : SPEED_LADDER[name]; if (!sp) throw new Error(`unknown speed arm ${name}`); o[name] = simulate(L, P, { type: 'savant', goal: g, speed: sp }, { ...plan, fromFinish: g.kind !== 'date' }); } return o; };
      if (args['speed-only']) { row.goals[g.id] = { speed: speedCell() }; continue; }
      if (args.quick) { row.goals[g.id] = { savant: simulate(L, P, { type: 'savant', goal: g }, plan) }; if (SPEED_ARMS.length) row.goals[g.id].speed = speedCell(); continue; }
      const slim = (r) => ({ hours: r.hours, pass: r.pass, recall: r.recall, covered: r.covered, passItem: r.passItem, minRecall: r.minRecall, understood: r.understood });
      const table = (arm) => PASS_STEPS.map((n) => ({ n, ...slim(simulate(L, P, { ...arm, passes: n }, plan)) }));
      const tabs = { normal: table({ type: 'normal' }), tutor_lo: table(TUTORS.lo), tutor: table(TUTORS.typical), tutor_bloom: table(TUTORS.bloom) };
      const oracle = (t) => t.find((x) => x.pass) || t[t.length - 1];
      const cell = {
        savant: simulate(L, P, { type: 'savant', goal: g }, plan),
        savant_stop: slim(simulate(L, P, { type: 'savant', goal: g, oracleStop: true }, plan)),
        self_sr: slim(simulate(L, P, { type: 'normal', fixedSR: true }, plan)),
        self_sr2: slim(simulate(L, P, { type: 'normal', fixedSR: 2 }, plan)),
        tabs,
        normal: oracle(tabs.normal), tutor: oracle(tabs.tutor), tutor_lo: oracle(tabs.tutor_lo), tutor_bloom: oracle(tabs.tutor_bloom),
      };
      if (g.kind === 'date') { cell.bw = {}; for (const P1 of BW_P) for (const f of BW_FLOOR) for (const sf of BW_SAFETY) cell.bw[P1 + '-' + f + '-' + sf] = slim(simulate(L, P, { type: 'savant', goal: g, backward: { P: P1, floor: f, safety: sf } }, plan)); }
      if (SPEED_ARMS.length) cell.speed = speedCell();
      if (args.students) {
        const studentTable = (habit) => STUDENT_N.map((n) => ({ n, ...slim(simulate(L, P, { type: 'student', ...habit, passes: n }, plan)) }));
        cell.tutorD = { d037: table(TUTOR_D.d037), d079: table(TUTOR_D.d079) };
        cell.students = { reread: studentTable(STUDENTS.reread), massed: studentTable(STUDENTS.massed), mix: studentTable(STUDENTS.mix) };
        cell.reread_sr = {}; for (const r of STUDENT_R) cell.reread_sr[r] = slim(simulate(L, P, { type: 'student', ...STUDENTS.reread, passes: 0, fixedSR: srSchedule(r) }, plan));
      }
      cell.self_r = {}; for (const r of SR_RATIOS) cell.self_r[r] = slim(simulate(L, P, { type: 'normal', fixedSR: srSchedule(r) }, plan));
      row.goals[g.id] = cell;
    }
    rows.push(row);
  }
  const out = { simulated: true, hier: HIER, prior_add: PRIOR_ADD, prior_none: PRIOR_NONE, composite_c: COMPOSITE_C, item_s: ITEM_S, speed_gain: SPEED_GAIN, cold_gain: COLD_GAIN, skip_loss: SKIP_LOSS, est_gain: EST_GAIN, guess: GUESS, review_s: REVIEW_S, review_s_all: REVIEW_S_ALL, implicit: IMPLICIT, read_h: READ_H, read_mass: READ_MASS, read_space: READ_SPACE, read_k2: READ_K2, reread_time: REREAD_TIME, we_s: WE_S, we_gain: WE_GAIN, pre_gain: PRE_GAIN, ilv_h: ILV_H, quick_s: QUICK_S, quick_mem: QUICK_MEM, run_salt: RUN_SALT, seed: SEED, forget: FORGET, lesson: LESSON, target: TARGET, minutes: MINUTES, skills: SKILLS, jit: JIT, final: FINAL, finish: FINISH, skipk: SKIPK, floor: FLOOR, goal_memory: GOAL_MEM, kloss: KLOSS, est_sd: EST_SD, n_extreme: N_EXT, n_ordinary: N_ORD, rows };
  if (args.out) { fs.mkdirSync(path.dirname(args.out), { recursive: true }); fs.writeFileSync(args.out, JSON.stringify(out)); console.log(`wrote ${args.out} (${rows.length} learners)`); }
  return out;
}
if (require.main === module) main();
module.exports = { simulate, paramsOf, ordinary, GOALS, TUTORS, STUDENTS, SPEED_LADDER };
