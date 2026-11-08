/**
 * SIMULATED comparison: the fixed enforcer calendar against adaptive timing (services/enforcer-adaptive.js).
 * No learner data, no model call: the FSRS-4.5-style memory model of services/retention-goal-sim.js (same constants,
 * helpers re-used) with learners whose parameters are known. Every number is SIMULATED, not proof about real learners.
 *
 * One scenario = one learner x one goal. The learner studies on some days (their own rhythm, breaks, cramming) and
 * learns new items on those days; on each study day they do the daily review (items under 0.85 recall, both sides) and,
 * at day's end, any enforcer that came due. Both sides see the same learner, study days and per-item per-day random draws
 * (common random numbers). The only difference is when an enforcer comes due and how big it is.
 *
 *   fixed      services/retention-schedule.js for the types the goal keeps (retention-goal.keptTypes); a test date uses
 *              retention-goal.datePlan. Tier: a fixed one (the baseline's tier is a parameter; "medium" is the main row).
 *   adaptive   enforcer-adaptive.decide each day end; for a test date the plan's final and day-of reviews stay and the
 *              mid reviews become adaptive. The policy sees each item's stability with +-30% error (it is an estimate).
 *
 * Enforcer content, as in the app: items answered since the window's start (daily review or learning; enforcer answers
 * are not counted), weakest first while under 0.95 recall, until the tier's budget (retention-params.budgetMs on the
 * window's active minutes). A window starts the day after the previous one (adaptive) or follows the calendar (fixed).
 * Measured: each item's recall at its goal date (learned + horizon; a test date; "forever" at 180 days), before any review that day.
 */
const schedule = require('./retention-schedule');
const goal = require('./retention-goal');
const params = require('./retention-params');
const adaptive = require('./enforcer-adaptive');
const base = require('./retention-goal-sim');

const { recall, minutesFor, rng } = base;
const W = [0.5701, 1.4436, 4.1386, 10.9355, 5.1443, 1.2006, 0.8627, 0.0362, 1.629, 0.1342, 1.0166, 2.1174, 0.0839, 0.3204, 1.4676, 0.219, 2.8237];
const afterPass = (S, D, R, g) => S * (1 + g * Math.exp(W[8]) * (11 - D) * S ** -W[9] * (Math.exp(W[10] * (1 - R)) - 1));
const afterMiss = (S, D, R) => Math.min(S, W[11] * D ** -W[12] * ((S + 1) ** W[13] - 1) * Math.exp(W[14] * (1 - R)));
const REVIEW = 0.85;
const EASY = 0.95;
const LEARN_MIN = 1.5; // active minutes to learn one new item
const FOREVER_H = 180;
const LEARN_DAYS = 60;
const MIN = 60000;
const TIER_ORDER = ['quick', 'medium', 'full'];

/** A deterministic uniform for (seed, a, b): common random numbers across policies. */
function u01(seed, a, b) {
  let h = (seed ^ Math.imul(a + 1, 0x9E3779B1) ^ Math.imul(b + 1, 0x85EBCA6B)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d); h = Math.imul(h ^ (h >>> 15), 0x846ca68b); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const normal = (seed, a) => Math.sqrt(-2 * Math.log(u01(seed, a, 991) + 1e-12)) * Math.cos(2 * Math.PI * u01(seed, a, 992));

const PANEL = base.PANEL.map((l) => ({ ...l, pStudy: 0.7, perDay: 4, breaks: [] }));
const EXTREMES = [
  { id: 'fast-forgetter', s0: 0.2, g: 0.4, D: 9, pStudy: 0.8, perDay: 4, breaks: [] },
  { id: 'slow-forgetter', s0: 2.2, g: 1.5, D: 3, pStudy: 0.8, perDay: 4, breaks: [] },
  { id: 'daily-heavy', s0: 1, g: 1, D: 6, pStudy: 1, perDay: 10, breaks: [] },
  { id: 'rare-study', s0: 1, g: 1, D: 6, pStudy: 0.12, perDay: 6, breaks: [] },
  { id: 'long-break', s0: 1, g: 1, D: 6, pStudy: 0.8, perDay: 4, breaks: [[20, 45]] },
  { id: 'two-breaks', s0: 0.7, g: 0.8, D: 7, pStudy: 0.9, perDay: 5, breaks: [[10, 25], [40, 55]] },
  { id: 'fast-forgetter-rare', s0: 0.2, g: 0.4, D: 9, pStudy: 0.15, perDay: 5, breaks: [] },
  { id: 'strong-irregular', s0: 1.8, g: 1.4, D: 4, pStudy: 0.25, perDay: 8, breaks: [[30, 50]] },
];
function randomLearner(rnd, i) {
  const br = [];
  if (rnd() < 0.4) { const a = 5 + Math.floor(rnd() * 40); br.push([a, a + 7 + Math.floor(rnd() * 25)]); }
  return { id: `rand-${i}`, s0: 0.2 + rnd() * 2, g: 0.4 + rnd() * 1.1, D: 3 + rnd() * 6, pStudy: 0.1 + rnd() * 0.9, perDay: 2 + Math.floor(rnd() * 9), breaks: br };
}
function learnerSet(seed, nRandom) {
  const rnd = rng(seed);
  return [...PANEL, ...EXTREMES, ...Array.from({ length: nRandom }, (_, i) => randomLearner(rnd, i))];
}

/** Goals: horizon days, forever, or a test date (cramming: sparse study, then daily in the last 8 days). */
const GOALS = [
  { id: 'week', days: 7 }, { id: 'month', days: 30 }, { id: 'months', days: 90 }, { id: 'year', days: 365 },
  { id: 'forever', days: null }, { id: 'test-date', date: 28 },
];

/** Build a scenario: study days and new items per day, from the learner and a seed. */
function scenario(learner, g, seed) {
  const T = g.date || null;
  const lastLearn = T ? T - 1 : LEARN_DAYS;
  const H = T ? 0 : (g.days || FOREVER_H);
  const end = T || lastLearn + H;
  const study = new Uint8Array(end + 2);
  const per = new Int16Array(end + 2);
  // after the learning days the learner keeps studying at their rhythm (review only: the daily review and the enforcers)
  for (let t = 0; t <= end; t++) {
    let p = learner.pStudy;
    let n = t <= lastLearn ? learner.perDay : 0;
    if (T && t <= lastLearn) { if (t >= T - 8) { p = 1; n = Math.round(learner.perDay * 2); } else p = Math.min(p, 0.35); }
    if (learner.breaks.some(([a, b]) => t >= a && t <= b)) p = 0;
    if (t === 0 || u01(seed, 7, t) < p) { study[t] = 1; per[t] = n; }
  }
  return { learner, goal: g, seed, T, lastLearn, H, end, study, per };
}

/** One policy through one scenario. policy: { kind: 'fixed'|'adaptive', tier } */
function run(scn, policy, p = adaptive.DEFAULTS) {
  const { learner, goal: g, seed, T, end, study, per } = scn;
  const horizon = g.days ? { status: 'horizon', days: g.days } : null;
  const kept = T ? [] : (horizon ? goal.keptTypes(horizon) : schedule.TYPES.slice());
  const dplan = T ? goal.datePlan(0, T) : [];
  const S = []; const last = []; const touch = []; const sEst = []; const meas = [];
  const byMeasure = new Map();
  const active = new Float64Array(end + 2);
  let enfMin = 0; let reviewMin = 0; let nEnf = 0;
  const tiers = { quick: 0, medium: 0, full: 0 };
  const pend = [];
  let lastEnf = -1; // last decided day (adaptive)
  const studyDays = [];
  const forecastLog = [];
  const decisionDays = [];

  const ask = (i, t) => {
    const R = recall(t - last[i], S[i]);
    const cost = minutesFor(R);
    if (u01(seed, 1000 + i, t) < R) S[i] = afterPass(S[i], learner.D, R, learner.g);
    else S[i] = afterMiss(S[i], learner.D, R);
    last[i] = t;
    return cost;
  };
  const unitsAt = (t, from) => {
    const us = [];
    for (let i = 0; i < S.length; i++) {
      if (touch[i] < from) continue;
      const Se = sEst[i]; const l = last[i];
      us.push({ recallIn: (x) => recall(t - l + x, Se) });
    }
    return us;
  };

  for (let t = 0; t <= end; t++) {
    const ms = byMeasure.get(t);
    if (ms) for (const i of ms) meas[i] = recall(t - last[i], S[i]);
    if (study[t]) {
      studyDays.push(t);
      let act = 0;
      for (let i = 0; i < S.length; i++) {
        if (last[i] < t && recall(t - last[i], S[i]) < REVIEW) { const c = ask(i, t); act += c; reviewMin += c; touch[i] = t; }
      }
      for (let k = 0; k < per[t]; k++) {
        const i = S.length;
        S.push(W[2] * learner.s0); last.push(t); touch.push(t);
        sEst.push(W[2] * learner.s0 * Math.exp(0.3 * normal(seed, i)));
        meas.push(null);
        const m = T ? T : t + scn.H;
        if (!byMeasure.has(m)) byMeasure.set(m, []);
        byMeasure.get(m).push(i);
        act += LEARN_MIN;
      }
      active[t] = act;
      if (pend.length && t >= 1) {
        const from = Math.min(...pend.map((x) => x.from));
        const tier = pend.map((x) => x.tier).sort((a, b) => TIER_ORDER.indexOf(b) - TIER_ORDER.indexOf(a))[0];
        const widest = pend.reduce((a, x) => (schedule.RANK[x.type] > schedule.RANK[a.type] ? x : a), pend[0]);
        let activeMs = 0;
        for (let d = Math.max(0, from); d <= t; d++) activeMs += active[d] * MIN;
        const budget = params.budgetMs(widest.type, tier, activeMs) / MIN;
        const cand = [];
        for (let i = 0; i < S.length; i++) if (touch[i] >= from) { const R = recall(t - last[i], S[i]); if (R < EASY) cand.push([R, i]); }
        cand.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        let used = 0;
        for (const [R, i] of cand) {
          if (used + minutesFor(R) > budget) break;
          used += ask(i, t);
        }
        enfMin += used; nEnf += 1; tiers[tier] += 1;
        pend.length = 0;
      }
    }
    // end of day: what comes due
    if (policy.kind === 'fixed') {
      if (T) {
        const pl = dplan.find((x) => x.day === t);
        if (pl) pend.push({ day: t, type: pl.type, from: pl.from, tier: policy.tier });
      } else if (t >= 1) {
        const types = schedule.typesOn(t).filter((x) => kept.includes(x));
        if (types.length) {
          const from = Math.min(...types.map((x) => schedule.windowFor(x, t).from));
          pend.push({ day: t, type: types[0], from, tier: policy.tier });
        }
      }
    } else if (t >= 1 && t < end && !pend.length) {
      const fixedFinal = T ? dplan.find((x) => x.day === t && x.kind !== 'review') : null;
      if (fixedFinal) { pend.push({ day: t, type: fixedFinal.type, from: fixedFinal.from, tier: policy.tier }); lastEnf = t; }
      else if (!T || t < T - 1) {
        const look = adaptive.lookahead(studyDays, t);
        const from = Math.max(0, lastEnf + 1);
        const us = unitsAt(t, from);
        const keptA = T ? adaptive.ORDER : kept;
        const d = adaptive.decide({ day: t, last: lastEnf, units: us, look, kept: keptA }, p);
        if (d.due) {
          pend.push({ day: t, type: d.type, from, tier: d.tier });
          lastEnf = t; decisionDays.push(t);
        } else {
          const f = adaptive.forecast({ day: t, last: lastEnf, units: us, look, kept: keptA }, 1, 14, p);
          if (f.length) forecastLog.push([t, t + f[0].offset]);
        }
      }
    }
  }
  const got = meas.filter((x) => x !== null);
  return {
    recall: got.length ? got.reduce((s, x) => s + x, 0) / got.length : null,
    enforcer_min: enfMin, review_min: reviewMin, enforcers: nEnf, items: S.length, tiers,
    decisions: decisionDays, forecasts: forecastLog,
  };
}

/** How often the forecast made 3+ days ahead named the actual day (exactly, and within 1 day). */
function forecastScore(runs) {
  let n = 0; let hit = 0; let near = 0;
  for (const r of runs) {
    let prev = -1;
    for (const D of r.decisions) {
      const f = r.forecasts.filter(([made, say]) => made <= D - 3 && made > prev && say >= made).pop();
      prev = D;
      if (!f) continue;
      n += 1;
      if (f[1] === D) hit += 1;
      if (Math.abs(f[1] - D) <= 1) near += 1;
    }
  }
  return { n, exact: n ? hit / n : null, within_1_day: n ? near / n : null };
}

const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const EQUAL_RECALL = 0.01; // adaptive recall may be this much lower (absolute) and still count as equal

/** Compare over a learner set and the goals: [{learner, goal, fixed: {quick, medium, full}, adaptive}]. */
function compare({ seed, nRandom, goals = GOALS, p = adaptive.DEFAULTS }) {
  const learners = learnerSet(seed, nRandom);
  const rows = [];
  for (const g of goals) {
    for (const [li, learner] of learners.entries()) {
      const scn = scenario(learner, g, (seed * 31 + li * 7919 + 17) >>> 0);
      const fx = {};
      for (const tier of TIER_ORDER) fx[tier] = run(scn, { kind: 'fixed', tier });
      rows.push({ learner: learner.id, goal: g.id, fixed: fx, adaptive: run(scn, { kind: 'adaptive', tier: 'medium' }, p) });
    }
  }
  return { rows, learners: learners.length };
}

function summarise(rows, vs = 'medium') {
  const ok = rows.filter((r) => r.fixed[vs].recall !== null && r.adaptive.recall !== null);
  const dR = (r) => r.adaptive.recall - r.fixed[vs].recall;
  const dM = (r) => r.adaptive.enforcer_min - r.fixed[vs].enforcer_min;
  const equal = ok.filter((r) => dR(r) >= -EQUAL_RECALL);
  const win = equal.filter((r) => dM(r) <= 0);
  const by = (list, f) => list.slice().sort((a, b) => f(a) - f(b))[0];
  const tag = (r, side) => ({ learner: r.learner, goal: r.goal, recall: +side.recall.toFixed(3), enforcer_min: +side.enforcer_min.toFixed(1) });
  const wr = by(ok, dR); const wm = by(ok, (r) => -dM(r));
  const lf = by(ok, (r) => r.fixed[vs].recall); const la = by(ok, (r) => r.adaptive.recall);
  const side = (k) => ({ enforcer_min: mean(ok.map((r) => r[k][vs] ? r[k][vs].enforcer_min : r[k].enforcer_min)), enforcers: mean(ok.map((r) => (r[k][vs] || r[k]).enforcers)), recall: mean(ok.map((r) => (r[k][vs] || r[k]).recall)), review_min: mean(ok.map((r) => (r[k][vs] || r[k]).review_min)), total_min: mean(ok.map((r) => (r[k][vs] || r[k]).enforcer_min + (r[k][vs] || r[k]).review_min)) });
  return {
    scenarios: ok.length, fixed: side('fixed'), adaptive: side('adaptive'),
    mean_delta_recall: mean(ok.map(dR)), mean_delta_enforcer_min: mean(ok.map(dM)),
    share_equal_or_better_recall: equal.length / ok.length,
    share_equal_recall_and_not_more_time: win.length / ok.length,
    worst_recall_change: { ...tag(wr, wr.adaptive), fixed_recall: +wr.fixed[vs].recall.toFixed(3), fixed_min: +wr.fixed[vs].enforcer_min.toFixed(1) },
    worst_time_change: { ...tag(wm, wm.adaptive), fixed_recall: +wm.fixed[vs].recall.toFixed(3), fixed_min: +wm.fixed[vs].enforcer_min.toFixed(1) },
    lowest_recall_fixed: tag(lf, lf.fixed[vs]), lowest_recall_adaptive: tag(la, la.adaptive),
  };
}

module.exports = { compare, summarise, scenario, run, forecastScore, learnerSet, GOALS, EQUAL_RECALL };
