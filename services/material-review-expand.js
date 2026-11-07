/**
 * Expanding review intervals for uploaded material (UPLOAD_REVIEW_EXPAND, off by default; off leaves every path as it was).
 *
 * Why. services/material-path.js intervalDays reads the half-life from a skill's answer count, and services/scorecard/forgetting.js caps that count at 15,
 * so with m = 0 the interval stops at 15 days. Every successful review after that buys no more time.
 *
 * What this does instead. Each skill keeps its own half-life `h_days`:
 *   - it starts where the curve starts (same a, b, c as forgetting.DEFAULT_CURVE, from the skill's right and wrong counts);
 *   - a right review a day or more after the last one multiplies it by GROWTH (more when the review came later, as predicted recall was lower);
 *   - a wobble (one of two right) cuts it by SHAKY, a lapse (none right) by LAPSE, which is the v2 model's own miss penalty (scripts/faster-by-goal-sim.js);
 *   - the learner's multiplier m still scales every skill and moves by how far the prediction missed, so a learner who forgets faster than the growth assumes
 *     gets lower scores, m falls and every interval shrinks. That loop, not the constant, is what keeps a wrong GROWTH safe.
 *
 * Goal. The next review is the last day predicted recall is still at TARGET. A horizon is counted from finishing the course. With a horizon: no more reviews once predicted recall on the
 * last day holds at FLOOR; otherwise the last review falls as late as lets the grown half-life hold FLOOR on the last day. Until the course is finished the end is unknown and reviews run (the safe side).
 * A dated test past SHORT_DAYS gets one look on the eve and before it only what the floor needs (nextForTest); a nearer one keeps limitInterval. Forever runs on with the wider MAX_DAYS.
 *
 * Constants are frozen on the design seed: docs/UPLOAD-4X.md. Nothing here touches the database or a model.
 */
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

const on = () => String(process.env.UPLOAD_REVIEW_EXPAND || 'off').toLowerCase() === 'on';

const PARAMS = Object.freeze({
  TARGET: 0.75,   // a review falls due when predicted recall reaches this (the app's TARGET_RECALL)
  FLOOR: 0.85,    // predicted recall wanted on a horizon's last day, for a horizon past SHORT_DAYS
  FLOOR_SHORT: 0.75, // and for one of SHORT_DAYS or less
  SHORT_DAYS: 30,
  GROWTH_0: 1.3,  // the v2 model's sp0: growth of the half-life at a right review with recall still at 1
  GROWTH_1: 1.5,  // the v2 model's sp1: extra growth as predicted recall falls
  SHAKY: 0.6,
  LAPSE: 0.4,     // the v2 model's miss penalty
  M_RATE: 0.6,    // as services/material-path.js
  M_LIMIT: 3,
  MAX_DAYS: 365,
  MIN_SPACED_DAYS: 0.5, // a retrieval sooner than this after the last one does not stretch the half-life
  CAP: 15,        // services/scorecard/forgetting.js CAP
  A: 1, B: 0.3, C: -0.1, // services/scorecard/forgetting.js DEFAULT_CURVE
  FRESH: 0.95,
});

/** The curve's half-life in days from a skill's counts, before the learner's multiplier. */
function baseHalfLife(right, wrong) {
  const L = PARAMS.A + PARAMS.B * Math.min(PARAMS.CAP, right || 0) + PARAMS.C * Math.min(PARAMS.CAP, wrong || 0);
  return 2 ** clamp(L, -6, 12);
}

const effective = (h, m) => h * 2 ** (m || 0);

/** Predicted recall after `days`, with this half-life already scaled by the learner. */
const predicted = (hEff, days, fresh = PARAMS.FRESH) => fresh * 2 ** (-Math.max(0, days) / hEff);

/** The recall a horizon asks for on its last day. */
const floorFor = (horizonDays, p = PARAMS) => (horizonDays != null && horizonDays <= p.SHORT_DAYS ? p.FLOOR_SHORT : p.FLOOR);

/**
 * A known test day: one look on the eve for every skill, and before it only what the floor needs, with the same growth. No compressing series of looks (services/retention-goal.js limitInterval halves
 * the gap as the day comes near; that is where its hours go, see docs/UPLOAD-4X.md). `left`: days to the test.
 */
function nextForTest({ hEff, left, p = PARAMS, fresh = PARAMS.FRESH, target = null }) {
  if (left <= 1) return { days: null, done: true };
  const eve = left - 1;
  const out = nextReview({ hEff, endInDays: eve, p, fresh, target, floor: p.FLOOR });
  if (out.done) return { days: Math.max(1, eve), done: false, eve: true };
  return { days: Math.min(out.days, Math.max(1, eve)), done: false, eve: out.days >= eve };
}

/** Days until predicted recall falls to `target`: at least a day. */
function gapFor(hEff, target, fresh = PARAMS.FRESH) {
  if (fresh <= target) return 1;
  return Math.max(1, hEff * Math.log2(fresh / target));
}

/** The half-life after a right retrieval, `elapsed` days since the last one. */
function grown(h, hEff, elapsed, p = PARAMS, fresh = PARAMS.FRESH) {
  if (!(elapsed >= p.MIN_SPACED_DAYS)) return h;
  const R = clamp(predicted(hEff, elapsed, fresh), 0, 1);
  return h * (p.GROWTH_0 + p.GROWTH_1 * (1 - R));
}

/**
 * The next review, pure: { days, done }.
 * endInDays: days to a horizon's last day, or null when none is known (forever, or the course is not finished yet).
 */
function nextReview({ hEff, endInDays = null, p = PARAMS, fresh = PARAMS.FRESH, target = null, floor = null }) {
  const T = target == null ? p.TARGET : target;
  const F = floor == null ? p.FLOOR : floor;
  const wide = Math.min(p.MAX_DAYS, gapFor(hEff, T, fresh));
  if (endInDays == null) return { days: Math.max(1, Math.floor(wide)), done: false };
  if (endInDays <= 0) return { days: null, done: true };
  if (predicted(hEff, endInDays, fresh) >= F) return { days: null, done: true };
  if (wide >= endInDays) {
    // The last look: as early as still holds the floor on the last day, assuming it grows the half-life as a look at that moment would. Never later than the end, and always a day or more away.
    let d = Math.floor(endInDays);
    const holds = (x) => {
      const R = clamp(predicted(hEff, x, fresh), 0, 1);
      return predicted(hEff * (p.GROWTH_0 + p.GROWTH_1 * (1 - R)), endInDays - x, fresh) >= F;
    };
    for (let x = 1; x < Math.floor(endInDays); x += 1) if (holds(x)) { d = x; break; }
    return { days: Math.max(1, d), done: false, last: true };
  }
  return { days: Math.max(1, Math.floor(wide)), done: false };
}

/**
 * A skill or card was retrieved right: update its half-life and return the next review. Mutates `st` (h_days, h_at).
 *   st: { right, wrong_n|wrong, h_days?, h_at? }. A first call (a skill just mastered, or a row from before the switch) starts from the curve.
 *   endInDays as nextReview. spec: services/learning-spec.js, the same +-0.05 on the target and 0.6x to 1.25x stretch as intervalDays.
 */
function afterRight(st, { m = 0, now = Date.now(), endInDays = null, horizonDays = null, testInDays = null, noGrow = false, spec = null, fresh = PARAMS.FRESH, wrong = null, p = PARAMS } = {}) {
  const wrongN = wrong == null ? (st.wrong_n || 0) : wrong;
  if (!Number.isFinite(st.h_days)) {
    st.h_days = baseHalfLife(st.right, wrongN);
  } else if (st.h_at && !noGrow) {
    const elapsed = (now - Date.parse(st.h_at)) / 86400000;
    st.h_days = grown(st.h_days, effective(st.h_days, m), elapsed, p, fresh);
  }
  st.h_at = new Date(now).toISOString();
  const live = spec && !spec.isDefault && spec.review;
  const target = live ? p.TARGET + (spec.review.targetRecall - 0.9) : p.TARGET;
  const out = testInDays != null
    ? nextForTest({ hEff: effective(st.h_days, m), left: testInDays, p, fresh, target })
    : nextReview({ hEff: effective(st.h_days, m), endInDays, p, fresh, target, floor: floorFor(horizonDays, p) });
  if (live && out.days != null && !out.last && testInDays == null) out.days = Math.max(1, Math.min(p.MAX_DAYS, Math.round(out.days * spec.review.spacingScale)));
  return out;
}

/** One of two right: the half-life comes down, the caller keeps its own half-the-interval rule. */
function afterShaky(st, now = Date.now(), p = PARAMS) {
  if (Number.isFinite(st.h_days)) { st.h_days = Math.max(1, st.h_days * p.SHAKY); st.h_at = new Date(now).toISOString(); }
}
/** None right: back to learning, and the half-life with it. */
function afterLapse(st, now = Date.now(), p = PARAMS) {
  if (Number.isFinite(st.h_days)) { st.h_days = Math.max(1, st.h_days * p.LAPSE); st.h_at = new Date(now).toISOString(); }
}

/** Move the learner's multiplier by how far this skill's own prediction missed. */
function updateM(m, st, days, score, { fresh = PARAMS.FRESH, wrong = null, p = PARAMS } = {}) {
  const h = Number.isFinite(st.h_days) ? st.h_days : baseHalfLife(st.right, wrong == null ? (st.wrong_n || 0) : wrong);
  const pred = predicted(effective(h, m || 0), days, fresh);
  return clamp((m || 0) + p.M_RATE * (score - pred), -p.M_LIMIT, p.M_LIMIT);
}

/**
 * Days to the goal's last day, as the switch reads it: a horizon counts from finishing; forever, unfinished and "after the test" have no end here.
 * eff: services/retention-goal.js effective(). A dated test is left to limitInterval (returns null here).
 */
function endInDays(eff, finishedOn, now = Date.now()) {
  if (!eff || eff.status !== 'horizon') return null;
  const fin = finishedOn ? Date.parse(finishedOn) : NaN;
  if (!Number.isFinite(fin)) return null;
  return (fin + eff.days * 86400000 - now) / 86400000;
}

/**
 * The switch's one entry for the app: read the goal (services/retention-goal.js effective()) and update the skill. Returns { days, done }.
 * noGrow: the course just finished, so the end of a horizon is known: re-time from the last retrieval without counting a new one (`now` then is that retrieval's moment).
 */
function plan(st, { eff, m = 0, now = Date.now(), finishedOn = null, spec = null, fresh = PARAMS.FRESH, wrong = null, noGrow = false, p = PARAMS } = {}) {
  if (eff && eff.status === 'stopped') return { days: null, done: true };
  const ctx = { m, now, spec, fresh, wrong, noGrow, p };
  if (eff && eff.status === 'date') {
    const test = Date.parse(`${eff.test_date}T00:00:00Z`);
    const start = eff.set_on ? Date.parse(`${eff.set_on}T00:00:00Z`) : NaN;
    const total = Number.isFinite(start) ? (test - start) / 86400000 : (test - now) / 86400000;
    if (total > p.SHORT_DAYS) return afterRight(st, { ...ctx, testInDays: (test - now) / 86400000 });
    // A test near at hand keeps today's rule (its gaps close in, then the eve and the day), on the wider interval: without it the worst learners fell 8 points on the design seed, and no floor brought them back.
    const out = afterRight(st, ctx);
    const lim = require('./retention-goal').limitInterval(eff, out.days, now); // eslint-disable-line global-require
    return lim.done ? { days: null, done: true } : { days: lim.days, done: false };
  }
  return afterRight(st, { ...ctx, endInDays: endInDays(eff, finishedOn, now), horizonDays: eff && eff.status === 'horizon' ? eff.days : null });
}

module.exports = { on, plan, PARAMS, baseHalfLife, effective, predicted, floorFor, gapFor, grown, nextReview, nextForTest, afterRight, afterShaky, afterLapse, updateM, endInDays };
