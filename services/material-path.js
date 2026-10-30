/**
 * "Learn from your own material": the per-learner path through a built course. Pure functions; the state lives in
 * services/material-study.js (material_progress rows). Nothing here touches the database or a model.
 *
 * What it takes from the built-in subjects, and what is new here:
 *   - placement reads each answer with the answer model of services/adaptive-placement.js (`assumed`): a 10% chance
 *     of slipping on something known and 15 points of luck above guessing on something not, taken at its two ends
 *     (known / not known) because a material skill has no grade position. The belief over the skill graph (a Gibbs
 *     sampler) and the choice of question by expected information gain are new: the built-in walk is one-dimensional;
 *   - review timing uses the half-life forgetting curve of services/scorecard/forgetting.js (`recallAt`, its default
 *     curve: the population fit and the scorecard's own learner estimate are not used here) with THIS learner's
 *     half-life multiplier m, moved after every review by a simple step (M_RATE times how far the prediction missed),
 *     not the scorecard's fitted estimate;
 *   - mastery is the app's 75% pass; a missed answer's misconception is kept like services/mastery.js keeps error
 *     tags (added on a miss, cleared when that question is later answered right).
 *
 * Placement. The course is a graph: skills and their prerequisites. The belief is a joint one over which skills the
 * learner knows, with three kinds of evidence: each answer (the model above); each prerequisite edge (knowing a skill
 * makes it likely its prerequisites are known: a known skill over an unknown prerequisite costs EDGE); and a shared
 * "how much of this material do they know" rate (the share of answers right, shrunk toward a half), so a run of
 * misses lowers every untested skill too. It is sampled (Gibbs, seeded, so the same answers give the same belief).
 * The next question is the one whose answer is expected to shrink the total uncertainty most; the walk stops when
 * every skill is decided (below UNKNOWN_AT or above KNOWN_AT) or at the cap. Then every skill it would skip gets a
 * quick check (nextPlacement), like the check that confirms a unit skip in services/unit-placement.js.
 *
 * Tiers inside a skill. Every question carries a tier: 1 recall, 2 use, 3 combine or transfer (the course's levels
 * are its skills in dependency order; tiers are the difficulty inside one). A skill's checks start at tier 1, or
 * tier 2 when placement thought it half known; a perfect check moves the skill up a tier, a failed one moves it down
 * and sends the learner back through remediation first. Reviews ask at least tier 2: harder after mastery. The
 * learner's pace is an Elo-style ability over tiers; a
 * fast learner gets fewer practice questions before a check.
 */
const ap = require('./adaptive-placement');
const forgetting = require('./scorecard/forgetting');

const PASS = 0.75;
const KNOWN_AT = 0.75;
const UNKNOWN_AT = 0.25;
const EDGE = 0.1;              // weight of "knows a skill but not one of its prerequisites"
const SWEEPS = 320;
const BURN = 60;
const PER_SKILL_PLACEMENT = 2; // questions on one skill at most, during placement
const TARGET_RECALL = 0.75;    // a review falls due when predicted recall drops to this
const MAX_INTERVAL = 180;
const M_RATE = 0.6;            // how far one review moves the learner's half-life multiplier
const M_LIMIT = 3;
const TIER_B = { 1: -1, 2: 0, 3: 1 }; // Elo difficulty of a question tier
const PACE_K = 0.25;

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const sigmoid = (x) => 1 / (1 + Math.exp(-x));

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The guessing floor of a question: one over the choices, near zero typed. */
const guessOf = (q) => (q && q.type === 'multiple_choice' && Array.isArray(q.choices) ? 1 / q.choices.length : 0.02);

/** Chance of a right answer if the skill is known / not known (adaptive-placement's model at its two ends). */
function answerModel(guess) {
  return { known: ap.assumed(100, 0, guess), unknown: ap.assumed(-100, 0, guess) };
}

// ── placement ─────────────────────────────────────────────────────────────────────
/**
 * The belief over which skills are known, from placement answers [{skill, correct, guess}].
 * Returns { p: {skill: P(known)}, samples: [Uint8Array], ids }.
 */
function belief(course, answers, seed = 1) {
  const ids = course.skills.map((s) => s.id);
  const idx = new Map(ids.map((id, i) => [id, i]));
  const n = ids.length;
  const prereqs = course.skills.map((s) => (s.prerequisites || []).map((p) => idx.get(p)).filter((i) => i != null));
  const dependents = ids.map(() => []);
  prereqs.forEach((ps, i) => ps.forEach((p) => dependents[p].push(i)));
  const ll = ids.map(() => [0, 0]); // [log P(answers | not known), log P(answers | known)]
  for (const a of answers || []) {
    const i = idx.get(a.skill);
    if (i == null) continue;
    const m = answerModel(a.guess || 0);
    ll[i][1] += Math.log(a.correct ? m.known : 1 - m.known);
    ll[i][0] += Math.log(a.correct ? m.unknown : 1 - m.unknown);
  }
  const rand = rng(seed + 7919 * (answers || []).length);
  // The shared rate: the share of answers that were right, shrunk toward a half (a fixed point, not sampled: a
  // sampled rate makes "knows all" and "knows none" two sticky modes a one-skill-at-a-time sampler cannot cross).
  const right = (answers || []).filter((a) => a.correct).length;
  const rate = clamp((1 + right) / (2 + (answers || []).length), 0.1, 0.9);
  const z = new Uint8Array(n);
  for (let i = 0; i < n; i++) z[i] = rand() < rate ? 1 : 0;
  const lnE = Math.log(EDGE);
  const samples = [];
  for (let sweep = 0; sweep < SWEEPS; sweep++) {
    for (let i = 0; i < n; i++) {
      let l1 = Math.log(rate) + ll[i][1];
      let l0 = Math.log(1 - rate) + ll[i][0];
      for (const p of prereqs[i]) if (!z[p]) l1 += lnE;        // i known over an unknown prerequisite
      for (const d of dependents[i]) if (z[d]) l0 += lnE;      // a known dependent over i unknown
      const p1 = sigmoid(l1 - l0);
      z[i] = rand() < p1 ? 1 : 0;
    }
    if (sweep >= BURN) samples.push(Uint8Array.from(z));
  }
  const p = {};
  ids.forEach((id, i) => { p[id] = samples.reduce((s, x) => s + x[i], 0) / samples.length; });
  return { p, samples, ids };
}

const H = (p) => (p <= 0 || p >= 1 ? 0 : -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p)));
const decided = (p) => p >= KNOWN_AT || p <= UNKNOWN_AT;

/** The most the adaptive walk may ask: about one per skill and a couple more, never fewer than 4. */
function placementCap(n) { return Math.max(4, Math.min(n + 2, 40)); }

/**
 * The next placement question, or null when placement is done. Two stages, like the built-in subjects:
 *   walk   ask where the answer is expected to shrink the total uncertainty most, until every skill is decided or
 *          the cap is reached;
 *   check  every skill the walk would skip (P(known) at or above KNOWN_AT) without a right answer of its own gets a
 *          quick check: one question; a miss earns a second (services/unit-placement.js reopens a unit missed twice).
 * askable(skillId) -> the question to ask on that skill, or null. answers: [{skill, correct, guess, stage}].
 * Returns { skill, stage, gain?, question } | null.
 */
function nextPlacement(course, answers, askable, seed = 1) {
  const list = answers || [];
  const b = belief(course, list, seed);
  const tally = {};
  for (const a of list) {
    const t = tally[a.skill] || (tally[a.skill] = { asked: 0, right: 0, wrong: 0 });
    t.asked++; if (a.correct) t.right++; else t.wrong++;
  }
  const walked = list.filter((a) => a.stage !== 'check').length;
  const walking = !list.some((a) => a.stage === 'check');
  if (walking && walked < placementCap(course.skills.length) && !b.ids.every((id) => decided(b.p[id]))) {
    const total = b.ids.reduce((s, id) => s + H(b.p[id]), 0);
    let best = null;
    for (let c = 0; c < b.ids.length; c++) {
      const id = b.ids[c];
      if (((tally[id] && tally[id].asked) || 0) >= PER_SKILL_PLACEMENT || decided(b.p[id])) continue;
      const q = askable(id);
      if (!q) continue;
      const m = answerModel(guessOf(q));
      // Expected total entropy after the answer, reweighting the current samples.
      const right = new Float64Array(b.ids.length);
      const wrong = new Float64Array(b.ids.length);
      let wr = 0; let ww = 0;
      for (const s of b.samples) {
        const pc = s[c] ? m.known : m.unknown;
        wr += pc; ww += 1 - pc;
        for (let i = 0; i < s.length; i++) if (s[i]) { right[i] += pc; wrong[i] += 1 - pc; }
      }
      const pr = wr / (wr + ww);
      let after = 0;
      for (let i = 0; i < b.ids.length; i++) after += pr * H(right[i] / wr) + (1 - pr) * H(wrong[i] / ww);
      const gain = total - after;
      if (!best || gain > best.gain + 1e-9) best = { skill: id, stage: 'walk', gain, question: q };
    }
    if (best) return best;
  }
  // The quick check of what the walk would skip, in path order.
  for (const id of b.ids) {
    const t = tally[id] || { asked: 0, right: 0, wrong: 0 };
    if (t.right || t.wrong >= 2) continue;
    const skipping = b.p[id] >= KNOWN_AT;
    const secondChance = t.wrong === 1 && b.p[id] >= 0.5 - 1e-9 && list.some((a) => a.skill === id && a.stage === 'check');
    if (!skipping && !secondChance) continue;
    const q = askable(id);
    if (q) return { skill: id, stage: 'check', question: q };
  }
  return null;
}

/**
 * What the placement concluded: per skill 'known' (P(known) at or above KNOWN_AT and a right answer of its own),
 * 'unknown' (at or below UNKNOWN_AT) or 'unsure', with P(known).
 */
function placementResult(course, answers, seed = 1) {
  const b = belief(course, answers, seed);
  const rightOn = new Set((answers || []).filter((a) => a.correct).map((a) => a.skill));
  const out = {};
  for (const id of b.ids) {
    const p = b.p[id];
    out[id] = { p, verdict: p >= KNOWN_AT && rightOn.has(id) ? 'known' : (p <= UNKNOWN_AT ? 'unknown' : 'unsure') };
  }
  return out;
}

// ── tiers and pace ───────────────────────────────────────────────────────────────
/** Move the learner's pace (Elo-style ability over question tiers) after one answer. */
function updatePace(pace, tier, correct) {
  const expected = sigmoid((pace || 0) - (TIER_B[tier] ?? 0));
  return clamp((pace || 0) + PACE_K * ((correct ? 1 : 0) - expected), -3, 3);
}

/** The tier a new skill's work starts at: from placement's belief and the learner's pace. */
function startTier(placementP, pace) {
  let lv = placementP != null && placementP >= 0.5 ? 2 : 1;
  if ((pace || 0) >= 1 && lv < 3) lv += 1;
  return lv;
}

/** How many practice questions to offer before a check: fewer for a fast learner or a half-known skill. */
function practiceCount(tier, pace, remediating) {
  if (remediating) return 3;
  if (tier >= 2 && (pace || 0) >= 0.5) return 1;
  return tier >= 2 ? 2 : 3;
}

/** After a check on a skill: the tier it moves to. */
function tierAfter(tier, score) {
  if (score >= 1) return Math.min(3, (tier || 1) + 1);
  if (score < PASS) return Math.max(1, (tier || 1) - 1);
  return tier || 1;
}

/**
 * Pick questions from one skill for a check at `tier`: the ones missed before first (remediation), then those at
 * the tier and the one above, then the rest. `avoid` holds ids just used in practice.
 */
function pickForTier(skill, tier, n, wrongIds, avoid, rnd) {
  const wrong = new Set(wrongIds || []);
  const skip = new Set(avoid || []);
  const lv = (q) => q.tier || 2;
  const score = (q) => (wrong.has(q.id) ? 0 : 10)
    + (lv(q) === tier ? 0 : (lv(q) === tier + 1 ? 1 : (lv(q) > tier ? 2 : 3 + (tier - lv(q)))))
    + (skip.has(q.id) ? 5 : 0) + rnd() * 0.5;
  return skill.questions.map((q) => ({ q, s: score(q) })).sort((a, b) => a.s - b.s).slice(0, n).map((x) => x.q);
}

// ── spaced review, fitted to this learner ─────────────────────────────────────────
/** Predicted recall of a skill after `days`, from the forgetting curve, its right/wrong counts and the learner's m. */
function recall(days, right, wrong, m, fresh = 0.95) {
  return forgetting.recallAt(null, { days, right, wrong, fresh, guess: 0, m });
}

/**
 * How often this learner answers right on a skill they have just shown they know (their checks that passed): the
 * "fresh" accuracy of services/scorecard/forgetting.js. A careless learner's slips are then not read as forgetting.
 * Shrunk toward 0.95 by 20 answers' worth.
 */
function freshAccuracy(fresh) {
  const f = fresh || { right: 0, total: 0 };
  return clamp((f.right + 19) / (f.total + 20), 0.5, 0.99);
}

/** Days until the next review: the last whole day predicted recall is still at or above TARGET_RECALL. */
function intervalDays(right, wrong, m) {
  let d = 1;
  while (d < MAX_INTERVAL && recall(d + 1, right, wrong, m) >= TARGET_RECALL) d++;
  return d;
}

/** Move the learner's half-life multiplier after a review: by how far the curve's prediction missed. */
function updateForgetting(m, days, right, wrong, score, fresh = 0.95) {
  const predicted = recall(days, right, wrong, m || 0, fresh);
  return clamp((m || 0) + M_RATE * (score - predicted), -M_LIMIT, M_LIMIT);
}

module.exports = {
  PASS, KNOWN_AT, UNKNOWN_AT, TARGET_RECALL, TIER_B,
  guessOf, answerModel, belief, nextPlacement, placementResult, placementCap,
  updatePace, startTier, practiceCount, tierAfter, pickForTier,
  recall, intervalDays, updateForgetting, freshAccuracy, rng,
};
