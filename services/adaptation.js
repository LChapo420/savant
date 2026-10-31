/**
 * Adaptation: HOW one level teaches one learner, never WHAT it must cover.
 * (curriculum-build/ADAPTIVE-COVERAGE.md)
 *
 * What a grade must cover is services/coverage.js: its objectives, and the gate
 * that holds graduation until every one is proven and kept. This file only
 * decides the way there, per learner and per objective:
 *
 *   guidance   worked examples first / faded examples / problems first. From
 *              this learner's own record on THIS objective (expertise reversal:
 *              full guidance helps novices and stops helping, or hurts, once
 *              they know the material; Kalyuga 2007, Tetzlaff et al. 2025), and
 *              from the scorecard's prior-knowledge and scaffolding-fade
 *              directives when they are confident.
 *   length     short / standard / full teaching text: brevity and processing
 *              directives, and problems-first levels are short.
 *   practice   compress once the objective is proven (its remaining practice
 *              levels are not needed; its spaced-recall level is kept), extend
 *              when its own practice is used up and it is not proven yet,
 *              standard otherwise. Practice ends on proof, not on a count.
 *   items      how many questions a block has, and the stretch and support
 *              shares: pace, challenge and frustration directives.
 *   order      blocked practice on an objective while it is new, interleaved
 *              with other proven objectives once it is proven (interleaving
 *              helps discrimination; Brunmair & Richter 2019).
 *   review     which objectives to bring back, and when: a memory check one
 *              day or more after a proof, then whenever the forgetting curve
 *              says recall has fallen below REVIEW_AT, lowest first, mixed
 *              across skills (Cepeda et al. 2006; Lindsey et al. 2014).
 *
 * "Only confident scorecard evidence": a scorecard stat changes nothing here
 * unless scorecard/translate.js `directives()` returns it — the same calibrated
 * gate (P >= 0.98 on the learner's side, top or bottom fifth, enough evidence of
 * its kind) that decides lesson instructions. The forgetting model's per-learner
 * multiplier is never used (translate never lets memory-kind stats steer), so
 * review timing reads the population curve with this learner's own answers on
 * the objective.
 *
 * Nothing here changes what a learner sees unless ADAPTIVE_TEACHING=on, which
 * is the owner's call: `off` (default) computes nothing in live paths; `shadow`
 * computes and records; `on` applies.
 */
const coverage = require('./coverage');
const learningSpec = require('./learning-spec');

const DAY = coverage.DAY;

function mode() {
  // Default on since 2026-10-24 (owner approved, LIVE-CHANGES-2026-10-24.md); ADAPTIVE_TEACHING=off or shadow turns it back.
  const m = String(process.env.ADAPTIVE_TEACHING || 'on').toLowerCase();
  return ['off', 'shadow', 'on'].includes(m) ? m : 'on';
}

function knobs() {
  const num = (name, fallback) => {
    const v = Number(process.env[name]);
    return process.env[name] !== undefined && process.env[name] !== '' && Number.isFinite(v) ? v : fallback;
  };
  return {
    NOVICE_BELOW: num('ADAPT_NOVICE_BELOW', 0.5),
    REVIEW_AT: num('ADAPT_REVIEW_AT', 0.9),
    REVIEW_SHARE: num('ADAPT_REVIEW_SHARE', 0.3),
    // Round 2: retention to a horizon, not only to the next check.
    DURABLE_AT: num('ADAPT_DURABLE_AT', 0.9),
    DURABLE_DAYS: num('ADAPT_DURABLE_DAYS', 30),
    // Effort: rapid answers (faster than coverage's OBJ_RAPID_MS) on more than
    // RUSH_RATE of a learner's answers in the grade, 95% sure on at least
    // RUSH_MIN answers, turn on effort feedback.
    RUSH_RATE: num('ADAPT_RUSH_RATE', 0.05),
    RUSH_MIN: num('ADAPT_RUSH_MIN', 30),
    // Round 2: lapsed objectives taught again per session (0 = left for the gate, round 1).
    RETEACH: num('ADAPT_RETEACH', 3),
    MIN_ITEMS: num('ADAPT_MIN_ITEMS', 4),
    MAX_ITEMS: num('ADAPT_MAX_ITEMS', 18),
    // Round 3 (the app's side of round 2; staged/adaptation/round3/): the daily
    // review's time budget for retrieval questions, what one question and one
    // re-taught lesson cost, the consolidation stretch before the Final, and
    // how much remediation after a missed Final lists at once.
    REVIEW_MINUTES: num('ADAPT_REVIEW_MINUTES', 10),
    ITEM_MINUTES: num('ADAPT_ITEM_MINUTES', 0.75),
    RETEACH_MINUTES: num('ADAPT_RETEACH_MINUTES', 6),
    CONSOLIDATE_AT: num('ADAPT_CONSOLIDATE_AT', 0.9),
    CONSOLIDATE_DAYS: num('ADAPT_CONSOLIDATE_DAYS', 21),
    RECALL_MAX: num('ADAPT_RECALL_MAX', 12),
    RELEARN_MAX: num('ADAPT_RELEARN_MAX', 6),
  };
}

// ── what confident scorecard directives change ─────────────────────────────
/**
 * Each stat the scorecard can make confident, and the knob each side moves.
 * Only these; every other directive still reaches the writer as text through
 * the details brief, and moves no structure.
 *
 * The default table; decide() applies scorecard/contract.js knobsNow(), which is
 * this table with SCORECARD_DROP_RUSH_TYPED (P1: no typed switch for rushers)
 * and SCORECARD_SOFT_STRETCH (P2: challenge high +0.05, stretch clamp 0.25)
 * undone when switched off.
 */
const DIRECTIVE_KNOBS = {
  prior_knowledge: { high: { guidance: -1 }, low: { guidance: +1 } },
  scaffolding_fade: { high: { guidance: -1 }, low: { guidance: +1 } },
  brevity_preference: { high: { length: -1 }, low: { length: +1 } },
  processing_velocity: { high: { length: -1, items: +0.2 }, low: { items: -0.2 } },
  challenge_appetite: { high: { stretch: +0.05 }, low: { stretch: -0.05, support: +0.05 } },
  frustration_threshold: { low: { support: +0.1, stretch: -0.05 } },
  persistence: { low: { items: -0.2 } },
  attention_runway: { low: { items: -0.25, length: -1 }, high: { items: +0.15 } },
  interest_transfer: { high: { context: 'interests' } },
  consolidation_need: { high: { recap: true } },
};

/**
 * P3 (evidence article 03; SCORECARD_LENGTHEN_NEW_ONLY, default on): a stated
 * wish for full detail lengthens the teaching only on an objective taught with
 * worked examples (new to this learner, or lapsed). Expertise reversal
 * (kalyuga2003) and mayer1996 say longer text does not help someone who already
 * knows it, and kirschner2013 that a stated preference is weak grounds.
 */
function lengthenNewOnly() {
  return String(process.env.SCORECARD_LENGTHEN_NEW_ONLY || 'on').toLowerCase() !== 'off';
}

const GUIDANCE = ['problems_first', 'faded', 'worked_examples'];
const LENGTH = ['short', 'standard', 'full'];

/** The learner's confident directives as {stat: side}, from translate.directives (combined pairs split back). */
function confidentSides(list) {
  const out = {};
  for (const d of list || []) {
    if (d.side === 'high' || d.side === 'low') out[d.stat] = d.side;
    else if (d.parts) {
      // A combined instruction stands for two confident parts; their sides are
      // the ones its COMBINED row names.
      // eslint-disable-next-line global-require
      const { COMBINED } = require('./scorecard/translate');
      const row = COMBINED.find(([a, , b]) => a === d.parts[0] && b === d.parts[1]);
      if (row) { out[row[0]] = row[1]; out[row[2]] = row[3]; }
    }
  }
  return out;
}

// ── review timing ──────────────────────────────────────────────────────────

/**
 * The curve to time reviews with, as a scorecard recallCurve() result
 * ({curve, fitted, m, mSd, mSource, norm, cap}):
 *   - the scorecard's fitted population curve (scorecard.forgettingCurve,
 *     round 5) once there is one. It is fitted on every earlier answer
 *     (nc / nw) and the spaced ones among them (ns / nsw), capped, which the
 *     coverage record keeps per objective;
 *   - else null, which predictedRecall reads as round 1 did: DEFAULT_CURVE
 *     with the objective's spaced successes.
 * Never throws; any failure gives the round-1 behaviour.
 */
function curveFor({ userId = null, trackId = null } = {}) {
  try {
    // eslint-disable-next-line global-require
    const scorecard = require('./scorecard');
    if (typeof scorecard.forgettingCurve !== 'function') return null;
    const rc = scorecard.forgettingCurve({ userId, trackId });
    return rc && rc.fitted ? rc : null;
  } catch (err) {
    return null;
  }
}

/** A recallCurve()-style object (as opposed to a bare {a, b, c}). */
function isRecallCurve(c) {
  return !!(c && typeof c === 'object' && c.curve && Number.isFinite(c.curve.a));
}

/**
 * The half-life multiplier to schedule with from a recallCurve() result. A
 * learner's own estimate is used as it stands when it says they forget faster
 * than the typical learner (more reviews: the safe side), and only by what the
 * evidence is 95% sure of when it says slower (fewer reviews).
 */
function scheduleM(rc) {
  if (!isRecallCurve(rc)) return 0;
  const m = Number(rc.m) || 0;
  if (rc.mSource !== 'learner') return m;
  const norm = Number.isFinite(rc.norm) ? rc.norm : 0;
  if (m <= norm) return m;
  return Math.max(norm, m - 1.645 * (Number(rc.mSd) || 0));
}

/**
 * Predicted recall of a proven objective now: the population forgetting curve
 * (scorecard/forgetting.js; the fitted one from scorecard.forgettingCurve when
 * there is one, DEFAULT_CURVE until then) with this learner's right and wrong
 * answers on the objective, and the time since they last answered it.
 *
 * `curve` may be a bare {a, b, c} (round 1: read with the objective's spaced
 * successes) or a recallCurve() result (round 2: read with nc, nw, ns, nsw on
 * the fitted shape). A learner's own multiplier in it replaces the
 * grade-level `m` shift.
 */
function predictedRecall(state, now, curve = null, m = 0) {
  if (!state.last_at) return 0;
  // eslint-disable-next-line global-require
  const forgetting = require('./scorecard/forgetting');
  const rc = isRecallCurve(curve) ? curve : null;
  const c = rc ? rc.curve : curve || forgetting.DEFAULT_CURVE;
  const dt = Math.max(0, (now - state.last_at) / DAY);
  if (rc) {
    // The scorecard's curve (round 5): every earlier answer (nc / nw) and the
    // spaced ones among them (ns / nsw), on its fitted shape.
    const cap = rc.cap || forgetting.CAP || 15;
    const mm = scheduleM(rc) + (rc.mSource === 'learner' ? 0 : m);
    const r = [dt, Math.min(cap, state.nc || 0), Math.min(cap, state.nw || 0), 0.95, 0, 0, 0, 0, 0, Math.min(cap, state.ns || 0), Math.min(cap, state.nsw || 0)];
    return forgetting.predict(c, r, mm).P;
  }
  // What lengthens a half-life is a successful retrieval after a gap, not more
  // of the same day's practice (the spacing effect), so the curve is read with
  // the objective's memory checks: right ones (plus the proof itself) and
  // missed ones. Counting every same-day practice answer as a review made a
  // freshly drilled objective look good for ten days.
  const spacedRight = Math.max(0, (state.checks || 0) - (state.check_misses || 0)) + (state.proven_at ? 1 : 0);
  const cap = rc && rc.cap ? rc.cap : 8;
  return forgetting.predict(c, [dt, Math.min(cap, spacedRight), Math.min(cap, state.check_misses || 0), 0.95, 0], m).P;
}

/**
 * Durability: the memory strength the curve predicts `horizon` days from now
 * if nothing more is studied, as a share of fresh recall (predictedRecall
 * reads recall with a 5% slip, so a fresh memory is 0.95 there and 1 here).
 * Round 2's retention target (ADAPTIVE-COVERAGE.md section 5): an objective is
 * durable when this is at least DURABLE_AT.
 */
function durableRecall(state, now, curve = null, m = 0, horizon = knobs().DURABLE_DAYS) {
  return Math.min(1, predictedRecall(state, now + horizon * DAY, curve, m) / 0.95);
}

/**
 * How durable a grade's proven objectives are now: the share whose recall in
 * `horizon` days is predicted at or above `at`, and the ones that are not,
 * least durable first. Unproven objectives are a teaching matter, not a
 * review one, and are not listed.
 */
function durability(model, states, now, { curve = null, at = knobs().DURABLE_AT, horizon = knobs().DURABLE_DAYS } = {}) {
  const { m } = memoryAdjust(states);
  const below = [];
  let durable = 0;
  states.forEach((s, i) => {
    if (s.status !== 'proven' && s.status !== 'retained') return;
    const later = durableRecall(s, now, curve, m, horizon);
    if (later >= at) durable += 1;
    else below.push({ i, id: model.objectives[i].id, later, recall: predictedRecall(s, now, curve, m), skill: model.objectives[i].skill });
  });
  below.sort((a, b) => a.later - b.later);
  return { share: states.length ? durable / states.length : 1, durable, below };
}

/** P(X > x) for X ~ Beta(a, b), by a midpoint sum (a, b small integers here). */
function betaAbove(a, b, x, steps = 400) {
  let total = 0;
  let above = 0;
  for (let i = 0; i < steps; i++) {
    const u = (i + 0.5) / steps;
    const d = u ** (a - 1) * (1 - u) ** (b - 1);
    total += d;
    if (u > x) above += d;
  }
  return total ? above / total : 0;
}

/**
 * This learner's own memory checks in this grade, against what the curve
 * expects. Reviews are timed so recall is about REVIEW_AT, so about one check
 * in eight should fail. Only when their record says otherwise with 95%
 * posterior certainty (a Beta posterior on their failure rate; at least
 * MEMORY_MIN_CHECKS checks) does the curve move for them: a doubling shorter
 * when they forget clearly faster, half a doubling longer when clearly slower.
 * This is the learner's own evidence on this grade's objectives, not the
 * scorecard's decay-rate stat (which steers nothing until its posterior is
 * trusted).
 *
 * @returns {{m: number, checks: number, lapses: number, why: string|null}}
 */
function memoryAdjust(states) {
  const min = Number(process.env.ADAPT_MEMORY_MIN_CHECKS || 10);
  let checks = 0;
  let lapses = 0;
  for (const s of states) { checks += s.checks || 0; lapses += s.check_misses || 0; }
  if (checks < min) return { m: 0, checks, lapses, why: null };
  const a = 1 + lapses;
  const b = 1 + checks - lapses;
  if (betaAbove(a, b, 0.25) >= 0.95) return { m: -1, checks, lapses, why: `forgets faster than the curve: ${lapses} of ${checks} memory checks failed` };
  if (checks >= 2 * min && 1 - betaAbove(a, b, 0.05) >= 0.95) return { m: 0.5, checks, lapses, why: `keeps more than the curve: ${lapses} of ${checks} memory checks failed` };
  return { m: 0, checks, lapses, why: null };
}

/**
 * The objectives to bring back now, most urgent first and mixed across skills:
 *   - proven, not yet checked, and at least RETAIN_DAYS since the proof (the
 *     memory check the gate needs);
 *   - kept (or proven), and predicted recall below REVIEW_AT.
 * Lapsed objectives are not reviews: they go back to being taught.
 *
 * @returns {Array<{i, id, reason: 'memory_check'|'fading', recall: number}>}
 */
function reviewQueue(model, states, now, { limit = 12, curve = null, durable = null, reteach: maxReteach = 0, spec = null } = {}) {
  const k = knobs();
  const ck = coverage.knobs();
  // The learner's own recall target and spacing (services/learning-spec.js review.*): a learner who forgets fast
  // is reviewed sooner and to a higher target, one who keeps things is left longer. 0.9 and 1 for the default spec.
  const reviewAt = spec && !spec.isDefault ? spec.review.targetRecall : k.REVIEW_AT;
  const spacing = spec && !spec.isDefault ? spec.review.spacingScale : 1;
  const { m } = memoryAdjust(states);
  const due = [];
  // Round 2 (`durable`: {at, horizon, gap}): a kept objective whose predicted
  // recall `horizon` days on is below `at` also gets one spaced retrieval,
  // at most every `gap` days (default RETAIN_DAYS), until it is durable. On
  // the forgetting curve each spaced success adds the same doublings of
  // half-life whenever it comes, so the cheapest way to a durable memory is a
  // short retrieval on more days, not more items on one day.
  const gapMs = (durable && Number.isFinite(durable.gap) ? durable.gap : ck.RETAIN_DAYS) * DAY * spacing;
  const reteach = [];
  states.forEach((s, i) => {
    if (maxReteach > 0 && s.status === 'lapsed') {
      // Round 2: a lapsed objective is taught again at the next session, not
      // left until the gate (relearning soon after a lapse is cheaper).
      reteach.push({ i, id: model.objectives[i].id, reason: 'reteach', recall: 0, skill: model.objectives[i].skill });
    } else if (s.status === 'proven' && s.proven_at !== null && now - s.proven_at >= ck.RETAIN_DAYS * DAY && now - (s.last_at || 0) >= ck.RETAIN_DAYS * DAY * 0.5 * spacing
      // Already believed kept (R >= RETAIN_AT): what "retained" still waits on is
      // a check at least RETAIN_SPAN_DAYS after proof, so an earlier one is not
      // listed again (it would come back every half day until then).
      && !(Number.isFinite(s.R) && s.R >= ck.RETAIN_AT && now - s.proven_at < ck.RETAIN_SPAN_DAYS * DAY)) {
      due.push({ i, id: model.objectives[i].id, reason: 'memory_check', recall: predictedRecall(s, now, curve, m), skill: model.objectives[i].skill });
    } else if (s.status === 'retained' || s.status === 'proven') {
      const recall = predictedRecall(s, now, curve, m);
      const rested = now - (s.last_at || 0) >= ck.RETAIN_DAYS * DAY * 0.5 * spacing;
      if (recall < reviewAt && rested) {
        due.push({ i, id: model.objectives[i].id, reason: 'fading', recall, skill: model.objectives[i].skill });
      } else if (durable && now - (s.last_at || 0) >= gapMs) {
        const later = durableRecall(s, now, curve, m, durable.horizon || k.DURABLE_DAYS);
        if (later < (durable.at || k.DURABLE_AT)) due.push({ i, id: model.objectives[i].id, reason: 'durability', recall, later, skill: model.objectives[i].skill });
      }
    }
  });
  // Memory checks first (the gate waits on them), then the most faded, then
  // the least durable.
  const rank = { memory_check: 0, fading: 1, durability: 2 };
  due.sort((a, b) => (a.reason === b.reason ? (a.reason === 'durability' ? a.later - b.later : a.recall - b.recall) : rank[a.reason] - rank[b.reason]));
  // Round 2 (`reteach`: how many a session): lapsed objectives to teach
  // again come first; they are lessons, not single questions.
  return [...reteach.slice(0, maxReteach), ...interleave(due)].slice(0, limit);
}

/**
 * Before a checkpoint or the Graduation exam: every objective the exam covers
 * whose predicted recall is below EXAM_REVIEW_AT (0.9), or that is proven but
 * not yet checked a day later, lowest recall first and mixed across skills. A
 * short retrieval round before a test is itself spaced practice; it is not a
 * replacement for the test.
 */
function examReview(model, states, span, now, { curve = null, at = Number(process.env.ADAPT_EXAM_REVIEW_AT || 0.9) } = {}) {
  const { m } = memoryAdjust(states);
  const list = [];
  for (const i of span) {
    const s = states[i];
    if (s.status !== 'proven' && s.status !== 'retained') continue;
    const recall = predictedRecall(s, now, curve, m);
    if (recall < at || s.status === 'proven') list.push({ i, id: model.objectives[i].id, reason: s.status === 'proven' ? 'memory_check' : 'fading', recall, skill: model.objectives[i].skill });
  }
  list.sort((a, b) => a.recall - b.recall);
  return interleave(list);
}

/**
 * After a missed Final (or checkpoint): what to do with the objectives behind
 * the missed questions, from the learner's record. Unproven or lapsed ones are
 * taught again; proven ones are retrieved with feedback (a miss on something
 * they had is forgetting, not a gap). Kept objectives the curve says have
 * faded below `at` are retrieved too. The bar of the next sitting is not
 * touched.
 *
 * @param {number[]} missed  objective indices behind the missed questions
 * @returns {{reteach: number[], retrieve: number[]}}
 */
function remediation(model, states, missed, now, { curve = null, at = Number(process.env.ADAPT_EXAM_REVIEW_AT || 0.9) } = {}) {
  const { m } = memoryAdjust(states);
  const reteach = new Set();
  const retrieve = new Set();
  for (const i of missed) {
    const s = states[i];
    if (!s) continue;
    if (s.status === 'unproven' || s.status === 'lapsed') reteach.add(i);
    else retrieve.add(i);
  }
  states.forEach((s, i) => {
    if (reteach.has(i) || retrieve.has(i)) return;
    if (s.status === 'unproven' || s.status === 'lapsed') reteach.add(i);
    else if (predictedRecall(s, now, curve, m) < at) retrieve.add(i);
  });
  return { reteach: [...reteach], retrieve: interleave([...retrieve].map((i) => ({ i, skill: model.objectives[i].skill }))).map((x) => x.i) };
}

/**
 * Does the learner rush? Their own record in this grade: rapid answers (too
 * fast to have read the question; coverage counts them and never takes them
 * as evidence) against all answers. Flagged only when a Beta posterior is 95%
 * sure the rapid share is above RUSH_RATE, on at least RUSH_MIN answers.
 * A flag changes feedback and pacing, never what must be proven: rapid answers
 * already prove nothing.
 *
 * @returns {{rapid: number, answers: number, share: number, flagged: boolean}}
 */
function effort(states) {
  const k = knobs();
  let rapid = 0;
  let mass = 0;
  for (const s of states) { rapid += s.rapid || 0; mass += s.mass || 0; }
  const answers = rapid + mass;
  const flagged = answers >= k.RUSH_MIN && betaAbove(1 + rapid, 1 + answers - rapid, k.RUSH_RATE) >= 0.95;
  return { rapid: Number(rapid.toFixed(2)), answers: Number(answers.toFixed(2)), share: answers ? rapid / answers : 0, flagged };
}

/**
 * The rule for a scored sitting (checkpoint, Final) under effort monitoring:
 * an answer faster than OBJ_RAPID_MS is not scored; the learner is told it was
 * too fast to count and gets a parallel question on the same objective, at
 * most `maxReserve` times per question, after which the answer stands as
 * given. The pass mark and the number of scored questions are unchanged, so
 * the bar is the same: only answers someone actually read can pass or fail it.
 * (Effort monitoring with warnings: Wise, Bhola & Yang 2006.)
 *
 * `answer.rapidMs`, when given, is the item's own rapid line
 * (effort-monitor.rapidLine, P8 RAPID_ITEM_RELATIVE): never below OBJ_RAPID_MS.
 *
 * @returns {'score'|'reserve'}
 */
function sittingRule(answer, reservedSoFar = 0, { maxReserve = 2 } = {}) {
  const rapidMs = Math.max(coverage.knobs().RAPID_MS, Number(answer.rapidMs) || 0);
  return answer.ms && answer.ms > 0 && answer.ms < rapidMs && reservedSoFar < maxReserve ? 'reserve' : 'score';
}

/** Reorder so neighbours differ in skill where possible (round-robin by skill, order kept within each). */
function interleave(list) {
  const bySkill = new Map();
  for (const x of list) bySkill.set(x.skill, [...(bySkill.get(x.skill) || []), x]);
  const queues = [...bySkill.values()];
  const out = [];
  while (out.length < list.length) for (const q of queues) if (q.length) out.push(q.shift());
  return out;
}

// ── the decision ───────────────────────────────────────────────────────────

/**
 * How to teach one objective's level to one learner.
 *
 * @param {object} args
 * @param {object} args.model      coverage.modelFor()
 * @param {object[]} args.states   coverage.assess()
 * @param {number} args.level      the level about to be served
 * @param {object} [args.sides]    confidentSides(translate.directives(...))
 * @param {object} [args.base]     the session params the app would use (learner.sessionParams)
 * @param {number} [args.now]
 * @returns {object} the plan: {objective, what, knobs, reasons, review, practice}
 */
function decide({ model, states, level, sides = {}, base = {}, now = Date.now(), curve = null, durable = null, spec = null }) {
  const k = knobs();
  const entry = model.levelMap[level] || null;
  const i = entry && entry.direct !== undefined ? entry.direct : null;
  const o = i === null ? null : model.objectives[i];
  const s = i === null ? null : states[i];
  const reasons = [];

  // Guidance: the objective's own record first.
  let g = 1; // faded
  if (s) {
    if (s.status === 'proven' || s.status === 'retained') {
      g = 0;
      reasons.push(`guidance: problems first — this objective is already ${s.status} (${s.proven_by || 'evidence'})`);
    } else if (s.answers === 0 || s.L < k.NOVICE_BELOW) {
      g = 2;
      reasons.push(`guidance: worked examples first — ${s.answers ? `belief ${s.L.toFixed(2)} after ${s.answers} answers` : 'no evidence on it yet'}`);
    } else {
      reasons.push(`guidance: faded examples — belief ${s.L.toFixed(2)}, partly there`);
    }
    if (s.status === 'lapsed') { g = 2; reasons.push('guidance: worked examples again — it was proven, then forgotten'); }
  }
  let len = 1;
  let items = 0;
  let stretch = 0;
  let support = 0;
  let typed = null;
  let context = null;
  let recap = false;
  const lengthen = [];
  // eslint-disable-next-line global-require
  const contract = require('./scorecard/contract');
  const table = contract.knobsNow();
  for (const [stat, side] of Object.entries(sides)) {
    const change = table[stat] && table[stat][side];
    if (!change) continue;
    // A confident scorecard reading moves guidance only within what the
    // objective's own record allows: it can never take worked examples away
    // from an objective the learner has shown nothing on.
    if (change.guidance) {
      const before = g;
      if (!(change.guidance < 0 && s && s.answers === 0 && stat !== 'prior_knowledge')) g = Math.max(0, Math.min(2, g + change.guidance));
      if (g !== before) reasons.push(`guidance: ${GUIDANCE[g].replace('_', ' ')} — confident scorecard directive ${stat} ${side}`);
    }
    if (change.length > 0 && lengthenNewOnly()) lengthen.push([stat, side, change.length]); // applied below, once guidance is settled
    else if (change.length) { len += change.length; reasons.push(`length: ${change.length < 0 ? 'shorter' : 'fuller'} — confident directive ${stat} ${side}`); }
    if (change.items) { items += change.items; reasons.push(`items: ${change.items > 0 ? 'more' : 'fewer'} per block — confident directive ${stat} ${side}`); }
    if (change.stretch) stretch += change.stretch;
    if (change.support) support += change.support;
    if (change.typed) { typed = true; reasons.push(`format: typed answers preferred — confident directive ${stat} ${side}`); }
    if (change.context) { context = change.context; reasons.push(`examples: built on their stated interests — confident directive ${stat} ${side}`); }
    if (change.recap) { recap = true; reasons.push(`recap: end with a short retrieval recap — confident directive ${stat} ${side}`); }
  }
  for (const [stat, side, by] of lengthen) {
    if (g === 2) { len += by; reasons.push(`length: fuller — confident directive ${stat} ${side}, on an objective taught with worked examples`); }
    else reasons.push(`length: not lengthened — ${stat} ${side} lengthens only an objective new to this learner (SCORECARD_LENGTHEN_NEW_ONLY)`);
  }
  if (g === 0) len -= 1;
  len = Math.max(0, Math.min(2, len));

  // Practice: until proven, and no further.
  let practice = 'standard';
  if (o && s && entry.kind === 'activity') {
    const proven = s.status === 'proven' || s.status === 'retained';
    const lastOwn = o.practice[o.practice.length - 1];
    if (proven && !entry.retention) {
      practice = 'compress';
      reasons.push('practice: compress — proven; its remaining practice levels are not needed (its spaced-recall level stays)');
    } else if (!proven && level === lastOwn) {
      practice = 'extend';
      reasons.push('practice: extend — its own practice is used up and it is not proven yet');
    }
  } else if (o && s && !o.practice.length && level === o.lesson_level && s.status !== 'proven' && s.status !== 'retained') {
    // A grade built in units (most Spanish grades): the objective has no
    // practice level of its own; the unit's shared levels (games, stories,
    // dictation, labs) practise it. Extra practice waits until they have run.
    practice = 'unit';
    reasons.push('practice: from the unit\'s shared levels — extend only if it is still unproven after the unit check');
  }

  // Effort: the learner's own record says they rush. Feedback and pacing
  // change (a "too fast to count" note, a parallel question in place of a
  // rapid answer on scored sittings); what must be proven does not.
  const eff = effort(states);
  if (eff.flagged) reasons.push(`effort: ${Math.round(100 * eff.share)}% of answers in this grade were too fast to count — slow-down feedback, rapid answers on scored sittings are re-served`);

  // Proof check: the record is already sure but has too few right answers to
  // questions written for this objective (bank practice is written per skill).
  // A few of those settle it, instead of more practice.
  let proofCheck = 0;
  if (s && (s.status === 'unproven' || s.status === 'lapsed')) {
    const ck = coverage.knobs();
    if (s.L >= ck.PROVEN_AT && s.right >= ck.MIN_RIGHT && s.aligned < ck.MIN_ALIGNED) {
      proofCheck = Math.ceil(ck.MIN_ALIGNED - s.aligned) + 1;
      reasons.push(`proof check: ${proofCheck} questions written for this objective — the record is sure, but on skill-level practice`);
    }
  }

  const baseCount = Number(base.itemCount) || 10;
  let itemCount = Math.round(baseCount * (1 + items));
  // The learning spec adds the soft, all-metric part on top of the confident directives: half strength, so a
  // directive that already moved a number is not counted twice (spec.session.items is 8 for the default learner).
  const live = !!(spec && !spec.isDefault);
  if (live) itemCount = Math.round(itemCount * (1 + 0.5 * (spec.session.items / 8 - 1)));
  if (practice === 'compress') itemCount = Math.min(itemCount, k.MIN_ITEMS + 2);
  itemCount = Math.max(k.MIN_ITEMS, Math.min(k.MAX_ITEMS, itemCount));

  const review = reviewQueue(model, states, now, { limit: Math.max(1, Math.round(itemCount * (live ? spec.review.reviewShare : k.REVIEW_SHARE))), curve, durable, reteach: durable ? k.RETEACH : 0, spec });
  const order = s && s.status !== 'proven' && s.status !== 'retained' && g === 2 ? 'blocked' : 'interleaved';

  return {
    level,
    objective: o ? o.id : null,
    // WHAT: copied from the coverage model and locked; checkWhat() proves it.
    what: o ? { id: o.id, title: o.title, covers: o.covers, skill: o.skill, retention_levels: o.retention.slice() } : null,
    knobs: {
      guidance: GUIDANCE[g],
      length: LENGTH[len],
      practice,
      item_count: itemCount,
      stretch_share: clamp((Number(base.stretchShare) || 0.15) + stretch + (live ? 0.5 * (spec.difficulty.stretchShare - 0.12) : 0), 0.05, contract.stretchMax()),
      support_share: clamp((Number(base.supportShare) || 0.15) + support + (live ? 0.5 * (spec.difficulty.supportShare - 0.15) : 0), 0, 0.35),
      prefer_type_in: typed === null ? (!!base.preferTypeIn || (live && spec.practice.typedAnswers >= 0.65)) : typed,
      order,
      proof_check: proofCheck,
      context,
      recap,
      effort_feedback: eff.flagged,
      spec: live ? learningSpec.specHash(spec) : null,
    },
    review: review.map((r) => ({ objective: r.id, reason: r.reason, recall: Number(r.recall.toFixed(2)) })),
    reasons,
  };
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, Number(v.toFixed(3))));
}

/**
 * The session params with a plan applied: only the bounded structural knobs.
 * The level, its skill and its blueprint are not touched.
 */
function paramsFor(base, plan) {
  if (!plan) return base;
  return {
    ...base,
    itemCount: base.itemCount === null ? null : plan.knobs.item_count,
    stretchShare: plan.knobs.stretch_share,
    supportShare: plan.knobs.support_share,
    preferTypeIn: plan.knobs.prefer_type_in,
  };
}

const GUIDANCE_TEXT = {
  worked_examples: 'Open with a fully worked example, every step shown and explained, then a second one with the learner predicting each step. Problems only after that.',
  faded: 'Show one worked example, then examples with later steps left for the learner to complete, then problems.',
  problems_first: 'They already show they can do this: open with a problem to solve, keep explanation to a short check of the key idea, and give worked steps only as feedback on a miss.',
};
const LENGTH_TEXT = {
  short: 'Keep the teaching short: the key idea, one example, then practice.',
  standard: '',
  full: 'Give a fuller explanation, with the reason behind each step spelled out.',
};

/**
 * The plan as instruction lines for a level writer (level editor, block levels).
 * The first line restates what must be covered, word for word from the sheet.
 */
function promptLines(plan) {
  if (!plan || !plan.what) return [];
  const lines = [
    'HOW TO TEACH THIS LEVEL FOR THIS LEARNER (from their own record on this objective)',
    `- What it must cover is fixed and must be taught in full: ${plan.what.covers}`,
    `- ${GUIDANCE_TEXT[plan.knobs.guidance]}`,
  ];
  if (LENGTH_TEXT[plan.knobs.length]) lines.push(`- ${LENGTH_TEXT[plan.knobs.length]}`);
  if (plan.knobs.recap) lines.push('- End with a three-line recap they answer from memory.');
  if (plan.review.length) lines.push(`- Mix in quick recall of earlier objectives: ${plan.review.map((r) => r.objective).join(', ')}.`);
  return lines;
}

/**
 * The invariant, as a check: a plan may not change what the level covers. Its
 * objective must be the level's own, word for word, with every spaced-recall
 * level kept; compressing is allowed only on a proven objective and never on a
 * retention level. Returns the problems ([] when it holds).
 */
function checkWhat(model, states, plan) {
  const problems = [];
  const entry = model.levelMap[plan.level];
  const i = entry && entry.direct !== undefined ? entry.direct : null;
  if (i === null) {
    if (plan.what) problems.push('a level with no objective of its own got one');
    return problems;
  }
  const o = model.objectives[i];
  if (!plan.what) return ['the objective was dropped'];
  if (plan.what.id !== o.id) problems.push('objective id changed');
  if (plan.what.covers !== o.covers) problems.push('covers text changed');
  if (plan.what.skill !== o.skill) problems.push('skill changed');
  if (JSON.stringify(plan.what.retention_levels) !== JSON.stringify(o.retention)) problems.push('retention levels changed');
  const s = states[i];
  if (plan.knobs.practice === 'compress' && !(s.status === 'proven' || s.status === 'retained')) problems.push('compressed an unproven objective');
  if (plan.knobs.practice === 'compress' && entry.retention) problems.push('compressed a retention level');
  return problems;
}

// ── the app's side ─────────────────────────────────────────────────────────

/**
 * The plan for the level a learner is about to open, from the database: their
 * coverage record in this grade and their confident scorecard directives.
 * Returns null when adaptation is off, or the level has no objective model.
 */
/**
 * The confident sides decide() takes, from the scorecard's insertion contract
 * (services/scorecard/contract.js forAdaptation): the same gated list every other
 * consumer reads, with `hasInterests` from what the learner stated. Built here
 * from translate without `hasInterests`, an interest directive could steer a
 * learner who never named an interest (scorecard round 6).
 */
function sidesFor(userId, enrollment) {
  // eslint-disable-next-line global-require
  const contract = require('./scorecard/contract');
  const c = contract.read(userId, { trackId: enrollment ? enrollment.track_id : null, gradeId: enrollment ? enrollment.grade_id : null, memory: false });
  return contract.forAdaptation(c).sides;
}

function planForLevel({ userId, enrollment, level, base = {}, force = false }) {
  if (!force && mode() === 'off') return null;
  try {
    // The owner's account follows the sheet's layouts untailored
    // (docs/PRODUCT-DECISIONS.md; config/owner.js ownerBase: OWNER_BASE=off or
    // ADAPT_OWNER=1 adapts it too).
    if (!force && ownerSkips(userId)) return null;
    const report = coverage.forEnrollment(userId, enrollment);
    if (!report) return null;
    const sides = sidesFor(userId, enrollment);
    // Round 2: the scorecard's fitted population curve (DEFAULT_CURVE until
    // there is one) and durability reviews; ADAPT_DURABLE=0 gives round 1.
    const r2 = process.env.ADAPT_DURABLE !== '0';
    const curve = r2 ? curveFor({ userId, trackId: enrollment.track_id }) : null;
    // How this learner is taught (services/learning-spec.js), for this level's own objective.
    const entry = report.model.levelMap[Number(level)] || null;
    const obj = entry && entry.direct !== undefined && entry.direct !== null ? report.model.objectives[entry.direct] : null;
    const spec = learningSpec.buildSpec(userId, { skillIds: obj && obj.skill ? [obj.skill] : [], topic: obj ? obj.title : null, trackId: enrollment.track_id, gradeId: enrollment.grade_id });
    return decide({ model: report.model, states: report.states, level: Number(level), sides, base, curve, durable: r2 ? {} : null, spec });
  } catch (err) {
    console.warn(`adaptation: plan failed: ${err.message}`);
    return null;
  }
}

// ── round 3: what the staged patches serve (curriculum-build/staged/adaptation/round3) ──
//
// Read-only helpers over the database. Nothing in the live app calls them; the
// round-3 patches do, each behind its own flag (off by default). They decide
// what to serve and say why; the patches serve it.

/**
 * The owner's account is not adapted (docs/PRODUCT-DECISIONS.md): config/owner.js
 * ownerBase, the one check. OWNER_BASE=off (or the older ADAPT_OWNER=1) adapts it too.
 */
function ownerSkips(userId) {
  // eslint-disable-next-line global-require
  return require('../config/owner').ownerBase(userId);
}

/** One objective as a page shows it: what it is, where it is taught, where it is kept. */
function objectiveRow(model, i, extra = {}) {
  const o = model.objectives[i];
  return {
    objective: o.id,
    n: o.n,
    title: o.title,
    covers: o.covers,
    skill: o.skill,
    lesson_level: o.lesson_level,
    retention_levels: o.retention.slice(),
    ...extra,
  };
}

/** The learner's record on one enrollment, with the curve to read it by (null when there is no model). */
function recordFor(userId, enrollment) {
  const report = coverage.forEnrollment(userId, enrollment);
  if (!report) return null;
  const r2 = process.env.ADAPT_DURABLE !== '0';
  return { report, curve: r2 ? curveFor({ userId, trackId: enrollment.track_id }) : null, r2 };
}

/**
 * The daily review (ADAPTIVE-COVERAGE.md section 7, decision 6): reviewQueue
 * with the fitted curve, durability and re-teaching, cut to a time budget.
 *
 *   retrieve  memory checks (the gate waits on them), then faded objectives,
 *             then the least durable: one question each, ITEM_MINUTES each,
 *             as many as fit in `minutes` (at least one when any is due);
 *   reteach   lapsed objectives, at most RETEACH a day: the lesson again,
 *             RETEACH_MINUTES each, listed apart from the questions.
 *
 * Never throws: null when there is no objective model, the learner is the
 * owner, or anything fails.
 */
function dailyReview({ userId, enrollment, now = Date.now(), minutes: asked, record = null } = {}) {
  try {
    if (ownerSkips(userId)) return null;
    const rec = record || recordFor(userId, enrollment);
    if (!rec) return null;
    const { model, states } = rec.report;
    const k = knobs();
    // Review timing is the learner's own (services/learning-spec.js): the recall target and spacing in the queue,
    // and a time budget that follows how long they can work at a stretch.
    const spec = learningSpec.buildSpec(userId, { trackId: enrollment ? enrollment.track_id : null, gradeId: enrollment ? enrollment.grade_id : null });
    const minutes = asked === undefined ? (spec.isDefault ? k.REVIEW_MINUTES : Math.max(4, Math.round(k.REVIEW_MINUTES * Math.min(1.5, Math.max(0.6, spec.session.minutes / 20))))) : asked;
    const queue = reviewQueue(model, states, now, {
      limit: model.objectives.length,
      curve: rec.curve,
      durable: rec.r2 ? {} : null,
      reteach: rec.r2 ? k.RETEACH : 0,
      spec,
    });
    const reteach = [];
    const retrieve = [];
    let used = 0;
    let more = 0;
    for (const q of queue) {
      if (q.reason === 'reteach') {
        reteach.push(objectiveRow(model, q.i, { reason: 'reteach', status: states[q.i].status, minutes: k.RETEACH_MINUTES }));
        continue;
      }
      if (retrieve.length && used + k.ITEM_MINUTES > minutes + 1e-9) { more += 1; continue; }
      used += k.ITEM_MINUTES;
      retrieve.push(objectiveRow(model, q.i, {
        reason: q.reason,
        status: states[q.i].status,
        recall: Number(q.recall.toFixed(3)),
        later: q.later === undefined ? null : Number(q.later.toFixed(3)),
      }));
    }
    const dur = durability(model, states, now, { curve: rec.curve });
    const g = coverage.gate(model, states);
    return {
      at: new Date(now).toISOString(),
      budget: minutes,
      minutes: Number(used.toFixed(2)),
      retrieve,
      reteach,
      more,
      due: retrieve.length + reteach.length,
      durability: { share: Number(dur.share.toFixed(3)), durable: dur.durable, total: states.length, at: k.DURABLE_AT, horizon: k.DURABLE_DAYS },
      gate: { complete: g.complete, rule: g.rule, total: g.total, counts: g.counts, blocking: g.blocking.length },
    };
  } catch (err) {
    console.warn(`adaptation: daily review failed: ${err.message}`);
    return null;
  }
}

/**
 * Consolidation before the Final (decision 7): short review-only days until at
 * least CONSOLIDATE_AT of the grade's objectives are durable (predicted recall
 * DURABLE_DAYS on at or above DURABLE_AT), for at most CONSOLIDATE_DAYS days
 * from `startedAt` (the first day the learner stood on the Final). Pure.
 *
 * @returns {{active, share, at, day, days, started_at, ends_at, reason}}
 *          reason: 'durable' | 'time' when it is over, null while it runs
 */
function consolidation({ model, states, now = Date.now(), startedAt = now, curve = null }) {
  const k = knobs();
  const start = Number.isFinite(startedAt) ? startedAt : now;
  const dur = durability(model, states, now, { curve });
  const day = Math.max(1, Math.floor((now - start) / DAY) + 1);
  const endsAt = start + k.CONSOLIDATE_DAYS * DAY;
  const reason = dur.share >= k.CONSOLIDATE_AT ? 'durable' : now >= endsAt ? 'time' : null;
  return {
    active: reason === null,
    share: Number(dur.share.toFixed(3)),
    durable: dur.durable,
    total: states.length,
    at: k.CONSOLIDATE_AT,
    day: Math.min(day, k.CONSOLIDATE_DAYS),
    days: k.CONSOLIDATE_DAYS,
    minutes: k.REVIEW_MINUTES,
    started_at: new Date(start).toISOString(),
    ends_at: new Date(endsAt).toISOString(),
    reason,
  };
}

/**
 * Remediation after a missed Final (decision 9), from the learner's record:
 * `remediation()` over the objectives behind the missed questions (an exam
 * question speaks for the objectives on its skill), plus every objective that
 * is unproven, lapsed or faded. Re-teach lists the weakest beliefs first,
 * retrieval the lowest predicted recall first; both are capped so the page
 * stays one sitting's worth (RELEARN_MAX, RECALL_MAX). Never throws.
 */
function remediationPlanFor({ userId, enrollment, missedSkills = [], now = Date.now(), record = null } = {}) {
  try {
    if (ownerSkips(userId)) return null;
    const rec = record || recordFor(userId, enrollment);
    if (!rec) return null;
    const { model, states } = rec.report;
    const k = knobs();
    const skills = new Set(missedSkills.filter(Boolean));
    const missed = model.objectives.map((o, i) => i).filter((i) => skills.has(model.objectives[i].skill));
    const plan = remediation(model, states, missed, now, { curve: rec.curve });
    const { m } = memoryAdjust(states);
    const reteach = plan.reteach.slice().sort((a, b) => states[a].L - states[b].L);
    const retrieve = plan.retrieve.map((i) => ({ i, recall: predictedRecall(states[i], now, rec.curve, m) }))
      .sort((a, b) => a.recall - b.recall);
    return {
      at: new Date(now).toISOString(),
      missed_skills: [...skills],
      reteach: reteach.slice(0, k.RELEARN_MAX).map((i) => objectiveRow(model, i, {
        status: states[i].status, belief: Number(states[i].L.toFixed(3)), missed: missed.includes(i),
      })),
      retrieve: interleave(retrieve.slice(0, k.RECALL_MAX).map((x) => ({ ...x, skill: model.objectives[x.i].skill })))
        .map((x) => objectiveRow(model, x.i, { status: states[x.i].status, recall: Number(x.recall.toFixed(3)), missed: missed.includes(x.i) })),
      reteach_total: reteach.length,
      retrieve_total: retrieve.length,
    };
  } catch (err) {
    console.warn(`adaptation: remediation plan failed: ${err.message}`);
    return null;
  }
}

/**
 * What a held graduation is waiting on (decision 1, COVERAGE_GATE=enforce):
 * each blocking objective and what it needs next.
 *   learn         unproven: its lesson and practice, until proven
 *   relearn       proven once, then forgotten: the same, again
 *   memory_check  proven, waiting for one unaided answer a day or more later;
 *                 `due_at` says when it can be asked
 * Never throws: null when there is no objective model.
 */
function heldPlanFor({ userId, enrollment, now = Date.now(), record = null } = {}) {
  try {
    const rec = record || recordFor(userId, enrollment);
    if (!rec) return null;
    const { model, states } = rec.report;
    const ck = coverage.knobs();
    const g = coverage.gate(model, states);
    const blocking = new Set(g.blocking);
    const objectives = [];
    states.forEach((s, i) => {
      if (!blocking.has(model.objectives[i].id)) return;
      let needs = 'learn';
      let dueAt = null;
      if (s.status === 'lapsed') needs = 'relearn';
      else if (s.status === 'proven') {
        needs = 'memory_check';
        dueAt = Math.max((s.proven_at || 0) + ck.RETAIN_DAYS * DAY, (s.last_at || 0) + ck.RETAIN_DAYS * DAY * 0.5);
      }
      objectives.push(objectiveRow(model, i, {
        status: s.status,
        needs,
        belief: Number(s.L.toFixed(3)),
        due_at: dueAt ? new Date(dueAt).toISOString() : null,
        due_now: needs === 'memory_check' ? now >= dueAt : null,
      }));
    });
    const order = { relearn: 0, learn: 1, memory_check: 2 };
    objectives.sort((a, b) => order[a.needs] - order[b.needs] || a.lesson_level - b.lesson_level);
    return {
      complete: g.complete,
      rule: g.rule,
      total: g.total,
      counts: g.counts,
      kept: g.total - g.blocking.length,
      objectives,
    };
  } catch (err) {
    console.warn(`adaptation: held plan failed: ${err.message}`);
    return null;
  }
}

/** effort() from the database, for one enrollment (decision 8's slow-down feedback). Never throws. */
function effortFor({ userId, enrollment } = {}) {
  try {
    if (ownerSkips(userId)) return null;
    const report = coverage.forEnrollment(userId, enrollment);
    return report ? effort(report.states) : null;
  } catch {
    return null;
  }
}

module.exports = {
  mode,
  knobs,
  DIRECTIVE_KNOBS,
  confidentSides,
  sidesFor,
  predictedRecall,
  durableRecall,
  durability,
  curveFor,
  scheduleM,
  memoryAdjust,
  betaAbove,
  reviewQueue,
  examReview,
  remediation,
  effort,
  sittingRule,
  interleave,
  decide,
  paramsFor,
  promptLines,
  checkWhat,
  planForLevel,
  // round 3 (staged patches)
  ownerSkips,
  objectiveRow,
  recordFor,
  dailyReview,
  consolidation,
  remediationPlanFor,
  heldPlanFor,
  effortFor,
  GUIDANCE,
  LENGTH,
};
