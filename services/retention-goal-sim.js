/**
 * SIMULATED retention under a retention goal (services/retention-goal.js) against today's one-size
 * schedule. No learner data, no model call: a forgetting-curve model with learners whose parameters
 * are known, so every number it produces is labelled SIMULATED and is not proof about real learners.
 *
 * The memory model is an FSRS-4.5-style one (open spaced-repetition scheduler; power-law forgetting,
 * stability that grows more when a review comes at lower recall, which is the spacing effect):
 *
 *   recall      R(t, S) = (1 + 19/81 * t / S) ^ -0.5        t days since the last review, S the stability
 *   after a pass  S' = S * (1 + g * e^w8 * (11 - D) * S^-w9 * (e^(w10 (1 - R)) - 1))
 *   after a miss  S' = min(S, w11 * D^-w12 * ((S + 1)^w13 - 1) * e^(w14 (1 - R)))
 *   first learn   S0 = w2 * s0   (a first successful practice, scaled by the learner)
 *
 * The constants are the published FSRS-4.5 defaults as recalled; they are a stand-in, not fitted to Savant
 * learners. A learner is (s0, g, D): how fast a memory is first set, how much a review adds, how hard
 * the material is for them. The panel below spans strong to struggling.
 *
 * Today's schedule ("baseline"): the owner's enforcer calendar (services/retention-schedule.js, the real
 * module: each piece of work is reviewed by the next enforcer of every type on or after the day it was
 * done) plus the daily review (an item is asked when its recall has fallen under REVIEW_TARGET, 0.85,
 * services/mastery.js), forever. An enforcer only asks an item whose recall is under TOO_EASY (0.95)
 * (retention-params selection.window).
 *
 * A goal's schedule is what the app does for it: the types retention-goal.keptTypes keeps (horizon), or
 * retention-goal.datePlan (date), the same daily review, and nothing after the horizon or the date.
 * Cost: a question's planned seconds from retention-params DEFAULTS (35 s a question, 3 s feedback on a
 * right answer, 25 s on a wrong one, and one retry on a wrong one).
 *
 * Common random numbers: each item draws one uniform per day, shared by every policy, so differences
 * between policies are not sampling noise. Deterministic for a seed.
 */
const schedule = require('./retention-schedule');
const goal = require('./retention-goal');

const W = [0.5701, 1.4436, 4.1386, 10.9355, 5.1443, 1.2006, 0.8627, 0.0362, 1.629, 0.1342, 1.0166, 2.1174, 0.0839, 0.3204, 1.4676, 0.219, 2.8237];
const REVIEW_TARGET = 0.85;
const TOO_EASY = 0.95;
const LIFETIME_DAYS = 1825; // five years: how far "today's" forever schedule is counted for lifetime minutes
const Q = { question_s: 35, right_s: 3, wrong_s: 25, retry_s: 38 };

/** The panel: strong to struggling, equal weight. (s0, g, D) as described above. */
const PANEL = [
  { id: 'strong', s0: 1.5, g: 1.25, D: 4 },
  { id: 'above-average', s0: 1.2, g: 1.1, D: 5 },
  { id: 'average', s0: 1.0, g: 1.0, D: 6 },
  { id: 'below-average', s0: 0.7, g: 0.8, D: 7 },
  { id: 'struggling', s0: 0.45, g: 0.6, D: 8 },
];

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const recall = (t, S) => (1 + (19 / 81) * Math.max(0, t) / S) ** -0.5;
const afterPass = (S, D, R, g) => S * (1 + g * Math.exp(W[8]) * (11 - D) * S ** -W[9] * (Math.exp(W[10] * (1 - R)) - 1));
const afterMiss = (S, D, R) => Math.min(S, W[11] * D ** -W[12] * ((S + 1) ** W[13] - 1) * Math.exp(W[14] * (1 - R)));
const minutesFor = (R) => (Q.question_s + R * Q.right_s + (1 - R) * (Q.wrong_s + Q.retry_s)) / 60;

/**
 * One item through one policy.
 * policy: { types: [calendar types kept], plan: [{day (relative to learning), kind}] | null, end: last relative day with a review,
 *           measureAt: relative day of the target, after: measure after that day's review (a test day, where the day-of review comes
 *           first) or before it (a horizon: the review on the very day it ends is not part of it) }
 * item: { a: absolute calendar day it was learned, learner, draws: Float64Array of uniforms, one per day }
 * Returns { recall: recall at measureAt (after that day's review), minutes_to: minutes through measureAt, minutes_all: through the lifetime }.
 */
function run(item, policy) {
  const { learner, draws, a } = item;
  let S = W[2] * learner.s0;
  let last = 0;
  const rung = new Set();
  for (const type of policy.types) rung.add(schedule.next(type, a) - a);
  const plan = new Map((policy.plan || []).map((p) => [p.day, p.kind]));
  let minutesTo = 0;
  let minutesAll = 0;
  let measured = null;
  for (let t = 0; t <= LIFETIME_DAYS; t++) {
    if (t === policy.measureAt && !policy.after) measured = recall(t - last, S);
    if (t >= 1 && t <= policy.end) {
      const R = recall(t - last, S);
      let ask = false;
      if (plan.has(t)) ask = R < TOO_EASY;
      if (!ask && rung.has(t)) ask = R < TOO_EASY;
      if (!ask && R < REVIEW_TARGET) ask = true;
      if (ask) {
        const cost = minutesFor(R);
        minutesAll += cost;
        if (t <= policy.measureAt) minutesTo += cost;
        if (draws[t] < R) S = afterPass(S, learner.D, R, learner.g);
        else S = afterMiss(S, learner.D, R);
        last = t;
      }
    }
    if (t === policy.measureAt && policy.after) measured = recall(t - last, S);
    if (t > policy.end && measured !== null) break;
  }
  return { recall: measured, minutes_to: minutesTo, minutes_all: minutesAll };
}

function items(count, seed, learnerSet, spread) {
  const rnd = rng(seed);
  const out = [];
  for (const learner of learnerSet) {
    for (let i = 0; i < count; i++) {
      const draws = new Float64Array(LIFETIME_DAYS + 2);
      for (let d = 0; d < draws.length; d++) draws[d] = rnd();
      out.push({ learner, draws, base: Math.floor(rnd() * 60), lag: spread ? Math.floor(rnd() * spread) : 0, id: i });
    }
  }
  return out;
}

const BASELINE = { types: schedule.TYPES, plan: null, end: LIFETIME_DAYS };

/** Mean of a list of numbers. */
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

/**
 * Compare a goal with today's schedule over the panel.
 * spec: { horizon: 'months'|'year'|'years' } or { date: n } (a test n days after the goal is set).
 * Returns per learner and overall: recall at the target for both, minutes (through the target and lifetime), and the dropped types.
 */
function compare(spec, { count = 120, seed = 20261103, learners = PANEL } = {}) {
  const isDate = spec.date !== undefined;
  const N = isDate ? spec.date : goal.HORIZONS[spec.horizon].days;
  // A test date: new work keeps arriving until the test (learned on any of the N days before it). A horizon: each item is judged N days after it was learned.
  const set = items(count, seed, learners, isDate ? Math.max(1, N) : 0);
  const rows = new Map(learners.map((l) => [l.id, []]));
  for (const it of set) {
    const learnedAt = it.base + it.lag; // absolute calendar day the item was learned
    const item = { a: learnedAt, learner: it.learner, draws: it.draws };
    const horizon = isDate ? N - it.lag : N; // days from learning to the target
    let goalPolicy;
    if (isDate) {
      // Each review covers the work since the previous one, so an item is asked at the first review on or after the day it was
      // learned; the final review and the day-of one cover everything.
      const all = goal.datePlan(it.base, it.base + N);
      const firstReview = all.find((p) => p.kind === 'review' && p.day >= learnedAt);
      const plan = all
        .filter((p) => p.kind !== 'review' || p === firstReview)
        .map((p) => ({ day: p.day - learnedAt, kind: p.kind }))
        .filter((p) => p.day >= 0 && p.day <= horizon);
      goalPolicy = { types: [], plan, end: horizon, measureAt: horizon, after: true };
    } else {
      const types = goal.keptTypes({ status: 'horizon', days: N });
      goalPolicy = { types, plan: null, end: Math.max(0, N - 1), measureAt: N, after: false };
    }
    const base = run(item, { ...BASELINE, measureAt: Math.max(0, horizon), after: isDate });
    const g = run(item, goalPolicy);
    rows.get(it.learner.id).push({ base, g });
  }
  const summarise = (list) => ({
    recall_today: mean(list.map((r) => r.base.recall)),
    recall_goal: mean(list.map((r) => r.g.recall)),
    minutes_today_to_target: mean(list.map((r) => r.base.minutes_to)),
    minutes_goal_to_target: mean(list.map((r) => r.g.minutes_to)),
    minutes_today_lifetime: mean(list.map((r) => r.base.minutes_all)),
    minutes_goal_lifetime: mean(list.map((r) => r.g.minutes_all)),
  });
  const per = {};
  for (const [id, list] of rows) per[id] = summarise(list);
  const all = summarise([...rows.values()].flat());
  const dropped = isDate ? schedule.TYPES.slice() : goal.droppedTypes({ status: 'horizon', days: N });
  return { spec, days: N, dropped, kept: isDate ? [] : goal.keptTypes({ status: 'horizon', days: N }), overall: all, per_learner: per, items: set.length };
}

module.exports = { PANEL, compare, run, recall, minutesFor, rng, LIFETIME_DAYS, REVIEW_TARGET, TOO_EASY };
