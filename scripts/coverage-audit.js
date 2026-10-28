/**
 * Coverage audit: does every learner master every objective of a grade before
 * the grade is complete, however their levels are adapted, and at what cost?
 * (curriculum-build/ADAPTIVE-COVERAGE.md)
 *
 *   NODE_PATH=../node_modules node scripts/coverage-audit.js             default grades, 8 learners per profile
 *   ... --learners=4 --tracks=math,english --grades=math:numbers_to_10 --seed=7 --align=0.7 --json=out.json
 *   ... --validate-only        only the machine checks of every grade's objectives
 *
 * Two parts.
 *
 * 1. The objectives of every grade of the six subjects (math, english, reading,
 *    iq, act, spanish), built by services/coverage.js from the sheets and
 *    machine-checked (coverage.validate): each states what it covers, has a skill
 *    the grade teaches, is practised and is assessed.
 *
 * 2. Simulated learners (the ideas of scripts/gap-path-sim.js and
 *    scripts/scorecard-recovery-sim.js: a hidden truth drives the answers, the
 *    app's own code reads them) walk real grades under three policies:
 *
 *      linear    the grade as the sheet lays it out today: every level in order,
 *                a practice level repeated until 70% (about the mastery gate),
 *                checkpoints and the Graduation exam at their pass marks, no
 *                coverage gate. What the app does now.
 *      gate      linear, plus the coverage gate at graduation (COVERAGE_GATE=
 *                enforce): objectives not proven are taught again, and proven
 *                ones get a memory check a day later, until the gate is met.
 *      adaptive  the gate, plus services/adaptation.js deciding how each level
 *                teaches: a short probe before each lesson (proven => the
 *                lesson and its practice are compressed), worked examples /
 *                faded / problems first by the objective's own record, practice
 *                that ends on proof and extends when proof has not come, and a
 *                daily review queue of memory checks and fading objectives.
 *
 *      adaptive2 round 2 (ADAPTIVE-COVERAGE.md section 5): adaptive plus the
 *                fitted forgetting curve, re-teaching lapsed objectives at once,
 *                durability reviews, a consolidation stretch before the Final,
 *                effort monitoring on scored sittings, remediation from the
 *                record, and unit-built grades extending after their unit
 *                (R2_FLAGS below; --r2= picks a subset for ablation).
 *
 *    Every answer goes through coverage.attribute and coverage.fold (the
 *    record the app keeps), every plan through adaptation.decide and
 *    adaptation.checkWhat (the invariant that WHAT is never changed), and the
 *    gate is coverage.gate.
 *
 * The truth model. Each learner knows each objective or not; a known objective
 * has a half-life, and recall now is 2^(-days since last retrieval / half-life).
 * An answer is right with 1 - slip when recalled, else by a guess (1/4 on a
 * choice, 2% typed). Rapid guessers answer some questions in under a second at
 * random; coach users reach some answers with the coach. A lesson teaches with
 * a chance set by its guidance against what the learner knows (expertise
 * reversal: worked examples x1.0 for a novice, faded x0.85, problems first
 * x0.6), practice teaches with the profile's learning rate, and a successful
 * retrieval after a gap lengthens the half-life more the harder it was
 * (spacing). Practice items from the bank are aligned with the level's
 * objective only ALIGN of the time (--align, 0.7): the rest are its skill's
 * other objectives, which the app still files under this one — the honest
 * worst case of skill-level bank items. Memory checks and probes use questions
 * written for one objective (the staged pilot in
 * curriculum-build/staged/adaptation/), aligned by construction.
 *
 * Nothing touches data/db.json: no database, no network, no model.
 */
const fs = require('fs');
const path = require('path');

process.env.NODE_ENV = 'test';
const coverage = require('../services/coverage');
const adaptation = require('../services/adaptation');
const curriculum = require('../config/curriculum');

const argv = process.argv.slice(2);
function opt(name, fallback) {
  const a = argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : fallback;
}
const SEED = Number(opt('seed', 20261023));
const LEARNERS = Number(opt('learners', 8));
const ALIGN = Number(opt('align', 0.7));
const TRACKS = opt('tracks', 'math,english,reading,iq,act,spanish').split(',');
const POLICIES = opt('policies', 'linear,gate,adaptive,adaptive2').split(',');
const PROFILE_LIST = opt('profiles', 'novice,typical,strong,holes,slow,forgetful,rusher,coached').split(',');
const VALIDATE_ONLY = argv.includes('--validate-only');
// Round 2 (policy `adaptive2`): which fixes are on, and their settings.
//   curve        review timing from a population curve fitted to the simulated
//                learners' memory tests (forgetting.population, the code the
//                scorecard fits the live one with), read with each learner's
//                own multiplier (forgetting.recallCurve), as the app would with
//                scorecard.forgettingCurve (every earlier answer and the
//                spaced ones among them, on the fitted shape). --curve=default
//                keeps round 1's DEFAULT_CURVE; --pop=file caches the fit
//   durable      daily spaced retrieval of objectives not yet durable (recall
//                in ADAPT_DURABLE_DAYS predicted below ADAPT_DURABLE_AT)
//   reteach      a lapsed objective is taught again at the next daily session
//                (ADAPT_RETEACH a session), not left for the gate
//   consolidate  before the Final, short review-only days until
//                --consolidate-at of objectives are durable (at most
//                --consolidate-days days)
//   effort       scored sittings re-serve rapid answers (adaptation.sittingRule);
//                --warn is how much each "too fast" warning cuts the learner's
//                rapid-guess rate (0 = assume no change in behaviour)
//   remed        after a missed Final, adaptation.remediation: re-teach what is
//                unproven, retrieve what has faded, on the missed skills
//   unit         objectives with no practice level of their own (unit-built
//                grades) wait for the unit's shared levels before extending
const R2_FLAGS = new Set(opt('r2', 'curve,durable,reteach,consolidate,effort,remed,unit').split(',').filter(Boolean));
const CURVE_MODE = opt('curve', 'fit');
const POP_FILE = opt('pop', null);
const CONSOLIDATE_AT = Number(opt('consolidate-at', 0.9));
const CONSOLIDATE_DAYS = Number(opt('consolidate-days', 21));
const WARN = Number(opt('warn', 0));
const CAL_LEARNERS = Number(opt('cal-learners', 2));
const forgetting = require('../services/scorecard/forgetting');
const JSON_OUT = opt('json', null);
const DAY = coverage.DAY;
const MIN = 60000;

// ── rng ────────────────────────────────────────────────────────────────────
function rngFrom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashSeed(...parts) {
  let h = 2166136261;
  for (const ch of parts.join('|')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// ── part 1: the objectives of every grade ──────────────────────────────────
function validateAll() {
  const out = {};
  for (const trackId of TRACKS) {
    const track = curriculum.getTrack(trackId);
    if (!track) continue;
    const row = { grades: 0, objectives: 0, problems: 0, warnings: 0, failing: [], unit_goal_grades: 0, retention_levels: 0, mapped_share: 0 };
    let levels = 0;
    let mapped = 0;
    for (const g of track.grades) {
      const v = coverage.validate(trackId, g.id);
      row.grades += 1;
      row.objectives += v.stats.objectives || 0;
      row.problems += v.problems.length;
      row.warnings += v.warnings.length;
      row.retention_levels += v.stats.retention_levels || 0;
      if (v.stats.source === 'unit_goals') row.unit_goal_grades += 1;
      levels += v.stats.levels || 0;
      mapped += v.stats.mapped_levels || 0;
      if (!v.ok) row.failing.push({ grade: g.id, problems: v.problems.slice(0, 3) });
    }
    row.mapped_share = levels ? Number((mapped / levels).toFixed(4)) : 0;
    out[trackId] = row;
  }
  return out;
}

// ── profiles ───────────────────────────────────────────────────────────────
const PROFILES = {
  novice: { prior: 0.03, learn: 0.12, slip: 0.08, h0: 2.5, rapid: 0.02, coach: 0.04, perDay: 40 },
  typical: { prior: 0.2, learn: 0.15, slip: 0.07, h0: 3, rapid: 0.03, coach: 0.05, perDay: 40 },
  strong: { prior: 0.75, learn: 0.25, slip: 0.05, h0: 5, rapid: 0.02, coach: 0.02, perDay: 45 },
  holes: { prior: 0.88, learn: 0.2, slip: 0.06, h0: 4, rapid: 0.02, coach: 0.03, perDay: 45 },
  slow: { prior: 0.03, learn: 0.06, slip: 0.1, h0: 2, rapid: 0.03, coach: 0.06, perDay: 35 },
  forgetful: { prior: 0.15, learn: 0.15, slip: 0.07, h0: 1, rapid: 0.03, coach: 0.05, perDay: 40 },
  rusher: { prior: 0.2, learn: 0.12, slip: 0.1, h0: 3, rapid: 0.12, coach: 0.02, perDay: 40 },
  coached: { prior: 0.1, learn: 0.12, slip: 0.08, h0: 3, rapid: 0.02, coach: 0.35, perDay: 40 },
};

const LESSON_LEARN = 0.55;
const MATCH = { worked_examples: 1, faded: 0.85, problems_first: 0.6 };
const LESSON_MIN = { worked_examples: 8, faded: 6, problems_first: 3 };
const ITEM_MIN = { choice: 0.4, typed: 0.7 };
const TYPED_SHARE = 0.4;

// ── one simulated learner on one grade under one policy ────────────────────
function simulate(model, profileName, idx, policy, { pop = null, collect = null, seed = SEED } = {}) {
  const SEED = seed; // eslint-disable-line no-shadow
  const ADA = policy === 'adaptive' || policy === 'adaptive2';
  const R2 = policy === 'adaptive2' ? R2_FLAGS : new Set();

  // This learner's memory tests (answers a day or more after the last one on
  // the objective), as the scorecard keeps them: [dt, nc, nw, pk, g, y, day].
  const memRows = [];
  let curveCache = { day: -1, rc: null };
  const curveNow = () => {
    if (!R2.has('curve') || !pop) return null;
    if (curveCache.day === day) return curveCache.rc;
    const rc = forgetting.recallCurve(pop, memRows.length ? memRows.slice(-forgetting.KEEP) : null, t / DAY);
    curveCache = { day, rc };
    return rc;
  };
  const base = PROFILES[profileName];
  const rand = rngFrom(hashSeed(SEED, model.gradeId, profileName, idx, 'truth'));
  const act = rngFrom(hashSeed(SEED, model.gradeId, profileName, idx, policy));
  const jitter = () => Math.exp((rand() - 0.5) * 0.6);
  const p = { ...base, learn: Math.min(0.9, base.learn * jitter()), h0: base.h0 * jitter() };
  const n = model.objectives.length;
  // The truth: same for one learner under every policy (rand is policy-free).
  const truth = model.objectives.map(() => {
    const known = rand() < p.prior;
    return { known, h: known ? p.h0 * 4 : p.h0, last: 0 };
  });
  const k = coverage.knobs();
  const states = model.objectives.map(() => coverage.blankState(k));
  const skillOf = model.objectives.map((o) => o.skill);
  const taught = new Array(n).fill(false);
  let t = 0;
  let dayStart = 0;
  let used = 0;
  let items = 0;
  let blocks = 0;
  let proofs = 0;
  let falseProofs = 0;
  let whatViolations = 0;
  let day = 0;
  // Where the time goes: active minutes by phase and activity, and minutes of
  // a study day left unused because the next step had to wait for a new day.
  let phase = 'walk';
  let activity = 'other';
  const timeBy = {};
  let active = 0;
  let idle = 0;
  const doing = (a, fn) => { const before = activity; activity = a; try { return fn(); } finally { activity = before; } };

  // Time moves on by what each step takes; a day's study ends when the next
  // step starts after the learner's daily minutes are used.
  function spend(minutes) {
    if (used >= p.perDay) newDay();
    used += minutes;
    t += minutes * MIN;
    active += minutes;
    const key = `${phase}.${activity}`;
    timeBy[key] = (timeBy[key] || 0) + minutes;
  }
  function newDay() {
    if (used >= 0 && used < p.perDay) idle += p.perDay - used;
    day += 1;
    dayStart += DAY;
    t = dayStart;
    used = 0;
    if (ADA) reviewSession();
  }
  function recall(i) {
    const tr = truth[i];
    if (!tr.known) return 0;
    return 2 ** (-Math.max(0, t - tr.last) / DAY / tr.h);
  }
  function learnFrom(i, chance) {
    const tr = truth[i];
    if (!tr.known && act() < chance) { tr.known = true; tr.h = p.h0; tr.last = t; }
  }

  /**
   * One answer: the truth objective `ti` decides it, the app files it as
   * `ans` (level, role, skill, objective tag) and folds it.
   */
  let lastMs = 20000;
  function ask(ti, ans, { teach = 0.85 } = {}) {
    const typed = act() < TYPED_SHARE;
    const choices = typed ? 0 : 4;
    const g = typed ? 0.02 : 0.25;
    const tr = truth[ti];
    let correct;
    let ms = 20000;
    let coach = false;
    const r = recall(ti);
    const recalled = act() < r;
    if (act() < p.rapid) { correct = act() < g; ms = 700; } else if (recalled) {
      correct = act() >= p.slip;
    } else if (act() < p.coach) { correct = true; coach = true; } else correct = act() < g;
    // What the answer does to memory: a retrieval after a gap strengthens it more
    // the harder it was; a miss (with feedback) or a coached answer can teach.
    if (recalled && correct && ms > 1000) {
      const gapDays = (t - tr.last) / DAY;
      tr.h *= gapDays >= 0.5 ? 1 + 1.6 * (1 - r) + 0.3 : 1.04;
      tr.last = t;
    } else if (!recalled && ms > 1000) {
      if (tr.known) { if (act() < p.learn * 2) { tr.h = Math.max(p.h0, tr.h * 0.6); tr.last = t; } } else learnFrom(ti, p.learn * teach * (coach ? 0.5 : 1));
    }
    items += 1;
    lastMs = ms;
    spend(ms < 1000 ? 0.05 : typed ? ITEM_MIN.typed : ITEM_MIN.choice);
    const full = { ...ans, t, correct, choices, ms, coach };
    for (const share of coverage.attribute(model, full)) {
      const s = states[share.i];
      const before = s.status;
      if (share.w >= 0.5 && ms >= k.RAPID_MS && s.last_at !== null && t - s.last_at >= DAY) {
        memRows.push(forgetting.row({ dt: (t - s.last_at) / DAY, nc: s.nc, nw: s.nw, ns: s.ns, nsw: s.nsw, pk: 0.95, g: coverage.guessOf(full, k), y: correct, day: t / DAY }));
      }
      coverage.fold(s, full, share, k);
      if ((before === 'unproven' || before === 'lapsed') && (s.status === 'proven' || s.status === 'retained')) {
        proofs += 1;
        if (!truth[share.i].known) falseProofs += 1;
      }
    }
    return correct;
  }

  const proven = (i) => states[i].status === 'proven' || states[i].status === 'retained';
  const predictedRecallNow = (i) => adaptation.predictedRecall(states[i], t, curveNow(), adaptation.memoryAdjust(states).m);
  const earlierSameSkill = (i) => {
    const list = [];
    for (let j = 0; j < n; j++) if (taught[j] && j !== i && skillOf[j] === skillOf[i]) list.push(j);
    return list;
  };
  const pick = (list) => list[Math.floor(act() * list.length)];

  /** A bank practice item at objective i's level: aligned ALIGN of the time. */
  function practiceItem(i, level, teach) {
    let ti = i;
    if (act() > ALIGN) { const other = earlierSameSkill(i); if (other.length) ti = pick(other); }
    return ask(ti, { level, role: 'focus', skill: skillOf[i] }, { teach });
  }
  /** A review item in a block: an earlier objective, filed by its skill. */
  function reviewItem(level) {
    const pool = [];
    for (let j = 0; j < n; j++) if (taught[j]) pool.push(j);
    if (!pool.length) return null;
    const ti = pick(pool);
    return ask(ti, { level, role: 'review', skill: skillOf[ti] });
  }
  /** A question written for one objective (probe, memory check), tagged with it. */
  function targeted(i, role = 'retention') {
    return doing(activity === 'other' ? ({ probe: 'probe', check: 'proof_check' }[role] || 'memory') : activity, () => ask(i, { level: model.objectives[i].lesson_level, role, skill: skillOf[i], objective: model.objectives[i].id, objectiveTest: role === 'probe' }));
  }
  function sharedItems(span, level, count, role = 'exam') {
    return doing(activity === 'other' ? `shared_${role}` : activity, () => sharedItemsInner(span, level, count, role));
  }
  const missedSkills = new Set();
  function sharedItemsInner(span, level, count, role) {
    let right = 0;
    for (let q = 0; q < count; q++) {
      const ti = pick(span);
      let c = ask(ti, { level, role, skill: skillOf[ti] });
      // Effort monitoring on a scored sitting: a rapid answer is not scored;
      // "too fast to count", and a parallel question on the same objective.
      if (R2.has('effort') && role === 'exam') {
        for (let reserved = 0; adaptation.sittingRule({ ms: lastMs }, reserved) === 'reserve'; reserved++) {
          p.rapid *= 1 - WARN;
          c = ask(ti, { level, role, skill: skillOf[ti] });
        }
      }
      if (c) right += 1;
      else if (role === 'exam') missedSkills.add(skillOf[ti]);
    }
    return right / Math.max(1, count);
  }
  function lesson(i, guidance) { return doing('lesson', () => lessonInner(i, guidance)); }
  function lessonInner(i, guidance) {
    const tr = truth[i];
    spend(LESSON_MIN[guidance]);
    if (tr.known) { if (recall(i) > 0.2) tr.last = t; } else learnFrom(i, LESSON_LEARN * MATCH[guidance]);
    taught[i] = true;
    for (let q = 0; q < 3; q++) ask(i, { level: model.objectives[i].lesson_level, role: 'check', skill: skillOf[i] });
    blocks += 1;
  }
  function practiceBlock(...args) { return doing('practice', () => practiceBlockInner(...args)); }
  function practiceBlockInner(i, level, count, { teach = 0.85, stopOnProof = false } = {}) {
    let right = 0;
    let asked = 0;
    for (let q = 0; q < count; q++) {
      if (stopOnProof && proven(i)) break;
      const c = q % 4 === 0 && q > 0 ? reviewItem(level) : practiceItem(i, level, teach);
      if (c !== null) { asked += 1; if (c) right += 1; }
    }
    blocks += 1;
    return asked ? right / asked : 1;
  }

  // ── the walk ──
  const rows = (curriculum.getGrade(model.trackId, model.gradeId).levels || []).slice().sort((a, b) => a.level - b.level);
  const directOf = (L) => { const e = model.levelMap[L]; return e && e.direct !== undefined ? e.direct : null; };
  let stuck = false;

  function checkpoint(span, L, count, mark) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const score = sharedItems(span, L, count);
      blocks += 1;
      if (score >= mark) return true;
      // Remediation: a drill on the span, then a retry.
      sharedItems(span, L, 5, 'drill');
    }
    return false;
  }

  function reviewSession() { const ph = phase; phase = phase === 'maintenance' || phase === 'consolidation' ? phase : 'daily_review'; try { doing('memory', reviewSessionInner); } finally { phase = ph; } }
  function reviewSessionInner() {
    // Due memory checks and fading objectives, one written question each.
    // About a third of the day's minutes at most.
    const due = adaptation.reviewQueue(model, states, t, { limit: Math.max(15, Math.round((0.3 * p.perDay) / 0.5)), curve: curveNow(), durable: R2.has('durable') ? {} : null, reteach: R2.has('reteach') ? adaptation.knobs().RETEACH : 0 });
    if (process.env.COVERAGE_AUDIT_DEBUG === '2') {
      const c = {}; for (const d of due) c[d.reason] = (c[d.reason] || 0) + 1;
      const st = {}; for (const x of states) st[x.status] = (st[x.status] || 0) + 1;
      const dur = adaptation.durability(model, states, t, { curve: curveNow() });
      console.log(`  [debug] day ${day} ${phase} due ${JSON.stringify(c)} states ${JSON.stringify(st)} durable ${dur.share.toFixed(2)} m ${curveNow() ? curveNow().m.toFixed(2) : '-'}`);
    }
    for (const d of due) {
      // Round 2: a lapsed objective is taught again (probe, lesson, practice).
      if (d.reason === 'reteach') { doing('reteach', () => adaptiveObjective(d.i)); continue; }
      // A memory check runs until it settles (at most three questions); a
      // fading objective gets one retrieval.
      for (let q = 0; q < (d.reason === 'memory_check' ? 3 : 1); q++) {
        if (!targeted(d.i) || states[d.i].status !== 'proven') break;
      }
    }
  }

  // Round 2 'unit': objectives with no practice level of their own wait for
  // the unit's shared levels; the last such level is where they extend.
  const lastShared = new Array(n).fill(null);
  for (const [L, e] of Object.entries(model.levelMap)) {
    if (e.shared && e.kind !== 'graduation') for (const i of e.shared) if (lastShared[i] === null || Number(L) > lastShared[i]) lastShared[i] = Number(L);
  }
  const pendingUnit = new Set();
  function adaptiveObjective(i, { defer = false } = {}) {
    // Probe: questions written for this objective, stopping at the first miss.
    for (let q = 0; q < 5 && !proven(i); q++) if (!targeted(i, 'probe')) break;
    const o = model.objectives[i];
    if (proven(i)) {
      taught[i] = true;
      blocks += 1;
      return;
    }
    const plan0 = adaptation.decide({ model, states, level: o.lesson_level, base: { itemCount: 10 }, now: t });
    lesson(i, plan0.knobs.guidance);
    let guidance = plan0.knobs.guidance;
    let retentionDone = false;
    for (const L of o.practice) {
      const plan = adaptation.decide({ model, states, level: L, base: { itemCount: 10 }, now: t });
      if (adaptation.checkWhat(model, states, plan).length) whatViolations += 1;
      const entry = model.levelMap[L];
      if (plan.knobs.practice === 'compress') continue;
      if (entry.retention) {
        // The free-recall level runs once, short, after proof; the spaced one is
        // the review queue's memory check, served when it is due.
        if (!retentionDone && proven(i)) { practiceBlock(i, L, 4); retentionDone = true; }
        else if (!proven(i)) practiceBlock(i, L, plan.knobs.item_count, { teach: MATCH[guidance], stopOnProof: true });
        continue;
      }
      guidance = plan.knobs.guidance;
      if (plan.knobs.proof_check) { proofCheck(i, plan.knobs.proof_check); if (proven(i)) continue; }
      practiceBlock(i, L, plan.knobs.item_count, { teach: MATCH[guidance], stopOnProof: true });
      const after = adaptation.decide({ model, states, level: L, base: { itemCount: 10 }, now: t });
      if (after.knobs.proof_check) proofCheck(i, after.knobs.proof_check);
    }
    if (R2.has('unit') && defer && !o.practice.length && lastShared[i] !== null && lastShared[i] > o.lesson_level) {
      if (!proven(i)) pendingUnit.add(i);
      return;
    }
    extendObjective(i, { justTaught: !o.practice.length });
  }
  function extendObjective(i, { justTaught = false } = {}) {
    const o = model.objectives[i];
    // Extend: not proven after its own practice: teach again, worked examples.
    // (Round 2: not straight after the lesson it just had.)
    for (let round = 0; round < 6 && !proven(i); round++) {
      if (round % 3 === 0 && !(R2.has('unit') && justTaught && round === 0)) lesson(i, 'worked_examples');
      practiceBlock(i, o.practice[0] || o.lesson_level, 10, { teach: 1, stopOnProof: true });
      const after = adaptation.decide({ model, states, level: o.practice[0] || o.lesson_level, base: { itemCount: 10 }, now: t });
      if (after.knobs.proof_check) proofCheck(i, after.knobs.proof_check);
    }
  }

  /** Questions written for the objective, until it is proven or one is missed. */
  function proofCheck(i, count) {
    for (let q = 0; q < count && !proven(i); q++) if (!targeted(i, 'check')) break;
  }

  function linearObjectiveLevel(L) {
    const i = directOf(L);
    const e = model.levelMap[L];
    if (e.kind === 'lesson') { lesson(i, 'faded'); return; }
    for (let rep = 0; rep < 3; rep++) if (practiceBlock(i, L, 10) >= 0.7) break;
  }

  for (const r of rows) {
    const L = r.level;
    const e = model.levelMap[L];
    if (!e) continue;
    if (e.kind === 'graduation') continue; // after the walk
    if (e.direct !== undefined) {
      if (ADA) {
        if (e.kind === 'lesson' || (e.kind === 'unit' && model.objectives[e.direct].lesson_level === L)) adaptiveObjective(e.direct, { defer: true });
        // The objective's other levels were handled inside adaptiveObjective.
        continue;
      }
      if (e.kind === 'unit' && model.objectives[e.direct].lesson_level === L) { lesson(e.direct, 'faded'); continue; }
      linearObjectiveLevel(L);
      continue;
    }
    if (!e.shared || !e.shared.length) continue;
    if (e.kind === 'tester') { sharedItems(e.shared, L, 3, 'tester'); blocks += 1; continue; }
    if (e.kind === 'summary') { spend(3); sharedItems(e.shared, L, 3, 'check'); blocks += 1; continue; }
    if (e.kind === 'unit') { if (e.shared.some((i) => taught[i])) { sharedItems(e.shared.filter((i) => taught[i]), L, 6, 'focus'); blocks += 1; } }
    else if (e.kind === 'review') { sharedItems(e.shared, L, 10, 'focus'); blocks += 1; }
    else if (e.kind === 'checkpoint') {
      const kind = r.kind === 'grand' ? 'grand' : 'master';
      const count = r.kind === 'essay' ? 5 : curriculum.CHECKPOINT_LENGTH[kind];
      if (!checkpoint(e.shared.filter((i) => taught[i]).length ? e.shared.filter((i) => taught[i]) : e.shared, L, count, 0.75)) stuck = true;
    }
    // Round 2 'unit': the unit's shared practice has run; what is still
    // unproven now extends.
    if (pendingUnit.size) {
      for (const i of [...pendingUnit]) {
        if (lastShared[i] <= L) { pendingUnit.delete(i); if (!proven(i)) doing('other', () => extendObjective(i, { justTaught: false })); }
      }
    }
  }
  for (const i of [...pendingUnit]) { pendingUnit.delete(i); if (!proven(i)) extendObjective(i); }
  // The Graduation exam.
  const finalLevel = rows.find((r) => r.kind === 'graduation');
  const all = model.objectives.map((_, i) => i);
  let passedFinal = false;
  phase = 'exam_review';
  let consolidationDays = 0;
  if (R2.has('consolidate')) {
    // Round 2: before the Final, short review-only days (the daily review
    // queue, run by newDay) until most objectives are durable.
    phase = 'consolidation';
    for (; consolidationDays < CONSOLIDATE_DAYS; consolidationDays++) {
      if (adaptation.durability(model, states, t, { curve: curveNow() }).share >= CONSOLIDATE_AT) break;
      newDay();
    }
    phase = 'exam_review';
  }
  if (ADA) {
    // A retrieval round before the exam (adaptation.examReview), on a new day.
    newDay();
    for (const d of adaptation.examReview(model, states, all, t, { at: 0.97, curve: curveNow() })) targeted(d.i);
  }
  for (let attempt = 0; attempt < 8 && !passedFinal; attempt++) {
    phase = 'final';
    const finalScore = sharedItems(all, finalLevel ? finalLevel.level : rows[rows.length - 1].level, 40);
    passedFinal = finalScore >= 0.9;
    if (process.env.COVERAGE_AUDIT_DEBUG) {
      let rs = 0; let kn = 0;
      for (let i = 0; i < n; i++) { rs += recall(i); if (truth[i].known) kn++; }
      console.log(`  [debug] ${profileName}#${idx} ${policy} final attempt ${attempt + 1}: score ${finalScore.toFixed(2)}, mean true recall ${(rs / n).toFixed(3)}, known ${kn}/${n}, day ${day}`);
    }
    blocks += 1;
    phase = 'final_remediation';
    if (!passedFinal && R2.has('remed')) {
      // Round 2: remediation from the record and the missed skills
      // (adaptation.remediation): re-teach what is unproven or lapsed,
      // retrieve with feedback what has faded; then a new day.
      const missed = all.filter((i) => missedSkills.has(skillOf[i]) && predictedRecallNow(i) < 0.97);
      missedSkills.clear();
      const plan = adaptation.remediation(model, states, missed, t, { curve: curveNow(), at: 0.95 });
      for (const i of plan.reteach) adaptiveObjective(i);
      for (const i of plan.retrieve) targeted(i);
      newDay();
      for (const d of adaptation.examReview(model, states, all, t, { at: 0.99, curve: curveNow() })) targeted(d.i);
    } else if (!passedFinal && policy === 'adaptive') {
      // Missed the 90%: another retrieval round on a new day, at a stricter bar.
      newDay();
      for (const d of adaptation.examReview(model, states, all, t, { at: 0.99 })) targeted(d.i);
    }
    if (!passedFinal && !R2.has('remed')) {
      // Remediation on the weakest objectives the app can see.
      const weak = all.slice().sort((a, b) => states[a].L - states[b].L).slice(0, 3);
      for (const i of weak) { if (ADA) adaptiveObjective(i); else { lesson(i, 'faded'); practiceBlock(i, model.objectives[i].practice[0] || model.objectives[i].lesson_level, 10); } }
    }
  }
  // The coverage gate (gate and adaptive): hold until every objective is proven and kept.
  let sweeps = 0;
  phase = 'gate';
  if (policy !== 'linear') {
    for (; sweeps < 40; sweeps++) {
      const g = coverage.gate(model, states);
      if (g.complete) break;
      const ids = new Map(model.objectives.map((o, i) => [o.id, i]));
      for (const id of g.missing) {
        const i = ids.get(id);
        if (ADA) adaptiveObjective(i);
        else {
          lesson(i, 'faded');
          for (let rep = 0; rep < 6 && !proven(i); rep++) practiceBlock(i, model.objectives[i].practice[0] || model.objectives[i].lesson_level, 10);
        }
      }
      // Memory checks need a day to pass; then one written question each.
      const waiting = coverage.gate(model, states).unretained.map((id) => ids.get(id));
      if (waiting.length) {
        if (waiting.some((i) => t - states[i].proven_at < k.RETAIN_DAYS * DAY || t - states[i].last_at < k.RETAIN_DAYS * DAY * 0.5)) newDay();
        // A memory check: up to three written questions, stopping once it is
        // settled either way.
        for (const i of waiting) for (let q = 0; q < 3 && states[i].status === 'proven'; q++) if (!targeted(i)) break;
      }
    }
  }
  const g = coverage.gate(model, states);
  const completed = passedFinal && (policy === 'linear' || g.complete);
  // Outcomes from the truth.
  const recallAt = (extraDays) => {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const tr = truth[i];
      if (tr.known) sum += 2 ** (-Math.max(0, t + extraDays * DAY - tr.last) / DAY / tr.h);
    }
    return sum / n;
  };
  const knownShare = truth.filter((x) => x.known).length / n;
  const markedButUnknownNow = states.filter((s, i) => (s.status === 'proven' || s.status === 'retained') && !truth[i].known).length;
  const at = { t, used, day, items, active, idle };
  const timeAt = { ...timeBy };
  phase = 'maintenance';
  // After the grade: 30 days of the review queue only (what the next grade
  // carries on with), at most 10 questions a day, and recall at the end.
  const r30 = recallAt(30);
  // Recall at 30 days by where the objective sits in the grade (tenths), and
  // how many spaced retrievals each had: where the forgetting is.
  const byTenth = new Array(10).fill(0).map(() => [0, 0]);
  for (let i = 0; i < n; i++) {
    const tr = truth[i];
    const v = tr.known ? 2 ** (-Math.max(0, t + 30 * DAY - tr.last) / DAY / tr.h) : 0;
    const b = byTenth[Math.min(9, Math.floor((10 * i) / n))];
    b[0] += v; b[1] += 1;
  }
  const recall30ByTenth = byTenth.map(([a, c]) => (c ? a / c : 0));
  let maintItems = 0;
  const counted = { proofs, falseProofs };
  used = -1e9; // no study-day bookkeeping in maintenance
  for (let d = 0; d < 30; d++) {
    t = at.t + (d + 1) * DAY;
    const due = adaptation.reviewQueue(model, states, t, { limit: 10, curve: curveNow(), durable: R2.has('durable') ? {} : null });
    for (const x of due) { targeted(x.i); maintItems += 1; }
  }
  const recallMaint = recallAt(0);
  t = at.t; used = at.used; day = at.day; items = at.items; active = at.active; idle = at.idle;
  proofs = counted.proofs; falseProofs = counted.falseProofs;
  const markedButUnknown = markedButUnknownNow;
  return {
    completed,
    stuck,
    passedFinal,
    gate_complete: g.complete,
    gate_counts: g.counts,
    days: day + 1,
    minutes: day * p.perDay + used,
    active_minutes: active,
    idle_minutes: idle,
    time_by: timeAt,
    items,
    blocks,
    sweeps,
    proofs,
    false_proofs: falseProofs,
    marked_unknown: markedButUnknown,
    known_share: knownShare,
    recall_now: recallAt(0),
    recall_7: recallAt(7),
    recall_30: r30,
    recall_30_by_tenth: recall30ByTenth,
    recall_30_maintained: recallMaint,
    maintenance_minutes_per_day: (maintItems * 0.52) / 30,
    what_violations: whatViolations,
    mem_rows: collect ? memRows : undefined,
    consolidation_days: consolidationDays,
    rapid_left: p.rapid,
    objectives: n,
  };
}

// ── run ────────────────────────────────────────────────────────────────────
function defaultGrades() {
  const pickGrades = {
    math: ['numbers_to_10', 20],
    english: [2, 7],
    reading: [2, 8],
    iq: [0, 1],
    act: ['act_grade_6', 2],
    spanish: [5, 'spanish_grade_51_translation_and_stylistics'],
  };
  const out = [];
  for (const trackId of TRACKS) {
    const track = curriculum.getTrack(trackId);
    if (!track) continue;
    for (const ref of pickGrades[trackId] || [0]) {
      const g = typeof ref === 'number' ? track.grades[ref] : track.grades.find((x) => x.id === ref);
      if (g) out.push(`${trackId}:${g.id}`);
    }
  }
  return out;
}

function mean(list, f) {
  return list.length ? list.reduce((s, x) => s + f(x), 0) / list.length : 0;
}
const pct = (v) => `${(100 * v).toFixed(1)}%`;

function main() {
  const started = Date.now();
  const validation = validateAll();
  console.log('PART 1. Objectives of every grade (services/coverage.js, machine-checked)');
  console.log('  track      grades  objectives  problems  warnings  unit-goal grades  levels mapped  retention levels');
  let totalObj = 0;
  let totalProblems = 0;
  for (const [trackId, v] of Object.entries(validation)) {
    totalObj += v.objectives;
    totalProblems += v.problems;
    console.log(`  ${trackId.padEnd(10)} ${String(v.grades).padStart(6)}  ${String(v.objectives).padStart(10)}  ${String(v.problems).padStart(8)}  ${String(v.warnings).padStart(8)}  ${String(v.unit_goal_grades).padStart(16)}  ${pct(v.mapped_share).padStart(13)}  ${String(v.retention_levels).padStart(16)}`);
    for (const f of v.failing.slice(0, 3)) console.log(`     FAIL ${f.grade}: ${f.problems.join('; ')}`);
  }
  console.log(`  total: ${totalObj} objectives, ${totalProblems} problems`);
  const out = { seed: SEED, learners_per_profile: LEARNERS, align: ALIGN, validation, grades: {} };
  if (VALIDATE_ONLY) { finish(out, started, totalProblems === 0); return; }

  const grades = opt('grades', null) ? opt('grades').split(',') : defaultGrades();
  // Round 2: the population forgetting curve, fitted the way the scorecard
  // fits the live one (forgetting.population) to the memory tests of a
  // separate calibration cohort (another seed) taught by adaptive2 on the
  // round-1 default curve.
  let pop = null;
  if (POP_FILE && fs.existsSync(path.resolve(POP_FILE))) {
    pop = JSON.parse(fs.readFileSync(path.resolve(POP_FILE), 'utf8'));
    out.curve = { mode: CURVE_MODE, from: POP_FILE, ...pop };
    console.log(`  population curve from ${POP_FILE}: ${JSON.stringify(pop.curve)}`);
  } else if (POLICIES.includes('adaptive2') && R2_FLAGS.has('curve') && CURVE_MODE === 'fit') {
    const lists = [];
    for (const ref of grades) {
      const [trackId, gradeId] = ref.split(':');
      const model = coverage.modelFor(trackId, gradeId);
      if (!model) continue;
      for (const prof of PROFILE_LIST) for (let i = 0; i < CAL_LEARNERS; i++) lists.push(simulate(model, prof, i, 'adaptive2', { collect: true, seed: SEED + 1 }).mem_rows.slice(-forgetting.KEEP));
    }
    pop = forgetting.population(lists, undefined);
    out.curve = { mode: CURVE_MODE, calibration_learners: lists.length, ...(pop || { fitted: false }) };
    console.log(`  population curve (${CURVE_MODE}) from ${lists.length} calibration learners: ${pop ? `${JSON.stringify(pop.curve)}; median multiplier ${pop.norm === null ? '-' : pop.norm.toFixed(2)}, spread ${pop.tau === null ? '-' : pop.tau.toFixed(2)}; ${pop.tests} tests` : 'not enough tests, default curve'}`);
    if (pop && POP_FILE) fs.writeFileSync(path.resolve(POP_FILE), JSON.stringify(pop));
  }
  console.log(`\nPART 2. Simulated learners: ${PROFILE_LIST.length} profiles x ${LEARNERS} learners x ${POLICIES.length} policies on ${grades.length} grades (seed ${SEED}, bank item alignment ${ALIGN})`);
  const all = {};
  for (const ref of grades) {
    const [trackId, gradeId] = ref.split(':');
    const model = coverage.modelFor(trackId, gradeId);
    if (!model) { console.log(`  no model for ${ref}`); continue; }
    out.grades[ref] = { objectives: model.objectives.length, policies: {} };
    for (const policy of POLICIES) {
      const runs = [];
      for (const prof of PROFILE_LIST) for (let i = 0; i < LEARNERS; i++) runs.push({ prof, ...simulate(model, prof, i, policy, { pop }) });
      out.grades[ref].policies[policy] = summarize(runs);
      all[policy] = [...(all[policy] || []), ...runs.map((r) => ({ ...r, grade: ref }))];
    }
    printGrade(ref, model, out.grades[ref]);
  }
  console.log('\nALL GRADES');
  out.overall = {};
  for (const policy of POLICIES) {
    out.overall[policy] = summarize(all[policy] || []);
    out.overall[policy].by_profile = {};
    for (const prof of PROFILE_LIST) out.overall[policy].by_profile[prof] = summarize((all[policy] || []).filter((r) => r.prof === prof));
  }
  printTable(out.overall);
  if (out.overall.adaptive2 && out.overall.linear) {
    console.log('\nBY PROFILE (round 2): linear / round-1 adaptive -> adaptive2: completed, active minutes, recall at 30 days with no study');
    for (const prof of PROFILE_LIST) {
      const a2 = out.overall.adaptive2.by_profile[prof];
      const l = out.overall.linear.by_profile[prof];
      const a = out.overall.adaptive ? out.overall.adaptive.by_profile[prof] : null;
      console.log(`  ${prof.padEnd(10)} done ${pct(l.completed_share)} / ${a ? pct(a.completed_share) : '-'} -> ${pct(a2.completed_share)}; active minutes ${Math.round(l.active_minutes)} / ${a ? Math.round(a.active_minutes) : '-'} -> ${Math.round(a2.active_minutes)} (x${(a2.active_minutes / l.active_minutes).toFixed(2)} of linear); recall at 30 days ${pct(l.recall_30)} / ${a ? pct(a.recall_30) : '-'} -> ${pct(a2.recall_30)}`);
    }
  }
  console.log('\nBY PROFILE (adaptive vs linear): minutes ratio, recall at 30 days');
  for (const prof of PROFILE_LIST) {
    const a = out.overall.adaptive && out.overall.adaptive.by_profile[prof];
    const l = out.overall.linear && out.overall.linear.by_profile[prof];
    const gt = out.overall.gate && out.overall.gate.by_profile[prof];
    if (!a || !l) continue;
    console.log(`  ${prof.padEnd(10)} minutes ${Math.round(l.minutes)} -> gate ${gt ? Math.round(gt.minutes) : '-'} -> adaptive ${Math.round(a.minutes)} (x${(a.minutes / l.minutes).toFixed(2)}); objectives proven at completion ${pct(l.app_proven_share)} -> ${pct(a.app_proven_share)}; truly known ${pct(l.known_share)} -> ${pct(a.known_share)}; recall at 30 days ${pct(l.recall_30)} -> ${pct(a.recall_30)}`);
  }
  // The guarantee, checked.
  const failures = [];
  for (const policy of POLICIES.filter((x) => x !== 'linear')) {
    for (const r of all[policy] || []) {
      if (r.completed && !r.gate_complete) failures.push(`${policy} ${r.grade} ${r.prof}: completed without the gate`);
      if (r.what_violations) failures.push(`${policy} ${r.grade} ${r.prof}: ${r.what_violations} plans changed WHAT`);
    }
    // The gate must never deadlock: everyone who passed the Graduation exam
    // reaches a complete gate within the sweeps.
    const held = (all[policy] || []).filter((r) => r.passedFinal && !r.gate_complete);
    if (held.length) failures.push(`${policy}: ${held.length} learners passed the Graduation exam but the gate never completed`);
  }
  out.guarantee = { failures };
  console.log(`\nGUARANTEE (gate, adaptive): ${failures.length ? `${failures.length} FAILURES` : 'every completed learner had 100% of objectives proven and retained by the app; no plan changed WHAT'}`);
  for (const f of failures.slice(0, 20)) console.log(`  ${f}`);
  finish(out, started, totalProblems === 0 && !failures.length);
}

function summarize(runs) {
  const done = runs.filter((r) => r.completed);
  return {
    learners: runs.length,
    completed_share: runs.length ? done.length / runs.length : 0,
    final_failed_share: runs.length ? runs.filter((r) => !r.passedFinal).length / runs.length : 0,
    gate_unfinished_share: runs.length ? runs.filter((r) => r.passedFinal && !r.gate_complete).length / runs.length : 0,
    minutes: mean(done, (r) => r.minutes),
    active_minutes: mean(done, (r) => r.active_minutes),
    idle_minutes: mean(done, (r) => r.idle_minutes),
    time_by: (() => { const o = {}; for (const r of done) for (const [key, v] of Object.entries(r.time_by)) o[key] = (o[key] || 0) + v / done.length; for (const key of Object.keys(o)) o[key] = Number(o[key].toFixed(1)); return o; })(),
    days: mean(done, (r) => r.days),
    items: mean(done, (r) => r.items),
    blocks: mean(done, (r) => r.blocks),
    minutes_per_objective: mean(done, (r) => r.minutes / r.objectives),
    app_proven_share: mean(done, (r) => (r.gate_counts.proven + r.gate_counts.retained) / r.objectives),
    app_retained_share: mean(done, (r) => r.gate_counts.retained / r.objectives),
    known_share: mean(done, (r) => r.known_share),
    recall_now: mean(done, (r) => r.recall_now),
    recall_7: mean(done, (r) => r.recall_7),
    recall_30: mean(done, (r) => r.recall_30),
    recall_30_by_tenth: new Array(10).fill(0).map((_, j) => Number(mean(done, (r) => r.recall_30_by_tenth[j]).toFixed(3))),
    recall_30_maintained: mean(done, (r) => r.recall_30_maintained),
    maintenance_minutes_per_day: mean(done, (r) => r.maintenance_minutes_per_day),
    recall30_per_study_hour: mean(done, (r) => (r.recall_30 * r.objectives) / (r.minutes / 60)),
    false_proof_rate: (() => { const p = runs.reduce((s, r) => s + r.proofs, 0); return p ? runs.reduce((s, r) => s + r.false_proofs, 0) / p : 0; })(),
    marked_unknown_share: mean(done, (r) => r.marked_unknown / r.objectives),
    sweeps: mean(done, (r) => r.sweeps),
  };
}

function printTable(byPolicy) {
  console.log('  policy     done   minutes  active  /objective  days  items  levels  app-proven  app-retained  truly known  recall now  7 days  30 days  30d+queue  false proofs  marked-but-unknown');
  for (const [policy, s] of Object.entries(byPolicy)) {
    console.log(`  ${policy.padEnd(9)} ${pct(s.completed_share).padStart(6)} ${String(Math.round(s.minutes)).padStart(8)} ${String(Math.round(s.active_minutes)).padStart(7)} ${s.minutes_per_objective.toFixed(1).padStart(10)} ${s.days.toFixed(0).padStart(5)} ${String(Math.round(s.items)).padStart(6)} ${String(Math.round(s.blocks)).padStart(7)} ${pct(s.app_proven_share).padStart(11)} ${pct(s.app_retained_share).padStart(13)} ${pct(s.known_share).padStart(12)} ${pct(s.recall_now).padStart(11)} ${pct(s.recall_7).padStart(7)} ${pct(s.recall_30).padStart(8)} ${pct(s.recall_30_maintained).padStart(10)} ${pct(s.false_proof_rate).padStart(13)} ${pct(s.marked_unknown_share).padStart(19)}`);
  }
}

function printGrade(ref, model, g) {
  console.log(`\n${ref} (${model.objectives.length} objectives)`);
  printTable(g.policies);
}

function finish(out, started, ok) {
  out.seconds = Number(((Date.now() - started) / 1000).toFixed(1));
  if (JSON_OUT) fs.writeFileSync(path.resolve(JSON_OUT), JSON.stringify(out, null, 1));
  console.log(`\n${ok ? 'PASS' : 'FAIL'} (${out.seconds}s)`);
  process.exitCode = ok ? 0 : 1;
}

main();
