/**
 * Placement: the first thing a learner does, and the most valuable single
 * artifact the product produces. It answers "what level am I actually at?" in
 * ten minutes, which is the hook the marketing plan is built on and the input
 * everything downstream depends on.
 *
 * Shape of the quiz: strictly ascending difficulty, starting at the floor of the
 * track and ending one band above the level the learner claimed, so the ceiling
 * is measured rather than assumed. Length scales with the claimed tier
 * (20 questions at tier 1, 50 at tier 5).
 */
const curriculum = require('../config/curriculum');
const bank = require('../content/bank');
const mastery = require('../services/mastery');
const db = require('../config/db');

/** Difficulty a claimed tier is expected to top out at. */
function targetDifficulty(tier) {
  return { 1: 3, 2: 4.5, 3: 6, 4: 7.5, 5: 9 }[Math.max(1, Math.min(5, tier))] || 5;
}

/**
 * The item plan: ascending difficulty across the whole quiz, rotating through
 * the grade's skills so every skill is sampled at more than one difficulty.
 */
function buildPlan(grade, lengthFactor = 1) {
  // A learner's goal can shorten or lengthen the fixed-length quiz (services/goals.js).
  const count = Math.max(12, Math.round(curriculum.placementLength(grade.tier) * lengthFactor));
  const ceiling = Math.min(10, targetDifficulty(grade.tier) + 1);
  const floor = 1;
  const skills = grade.skills;
  const plan = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 1 : i / (count - 1);
    const difficulty = Math.round((floor + t * (ceiling - floor)) * 10) / 10;
    plan.push({ skillId: skills[i % skills.length], difficulty });
  }
  return plan;
}

function buildItems(grade, lengthFactor = 1) {
  return bank.generateMany(buildPlan(grade, lengthFactor));
}

const BANDS = [
  { name: '1-2', lo: 1, hi: 2.49 },
  { name: '3-4', lo: 2.5, hi: 4.49 },
  { name: '5-6', lo: 4.5, hi: 6.49 },
  { name: '7-8', lo: 6.5, hi: 8.49 },
  { name: '9-10', lo: 8.5, hi: 10 },
];

function bandOf(difficulty) {
  return BANDS.find((b) => difficulty >= b.lo && difficulty <= b.hi) || BANDS[BANDS.length - 1];
}

/**
 * Invert difficultyForLevel: what level on this path sits at difficulty d?
 *
 * The result is then rounded to a placement level — a multiple of ten, which is a
 * lesson — so a learner always starts by being taught rather than dropped into the
 * middle of a practice run, and never onto a checkpoint they have not worked up
 * to. The grade comes along so the rounding asks the grade what a checkpoint is,
 * which a grade that states its own lesson levels answers differently.
 */
function levelForDifficulty(d, pathLength, grade) {
  const t = (Math.max(1, Math.min(10, d)) - 1) / 9;
  const raw = Math.max(1, Math.min(pathLength - 1, Math.round(1 + t * (pathLength - 1))));
  return curriculum.roundToPlacement(raw, pathLength, grade);
}

/**
 * Score a finished placement.
 *
 * The level estimate is the top of the highest band the learner held at 70%,
 * and the walk stops once two consecutive bands fall under 50% — so a lucky
 * answer at difficulty 9 cannot place someone into material they cannot do,
 * and a careless slip at difficulty 3 cannot pin someone to the floor.
 */
function score(items, grade) {
  const byBand = {};
  for (const band of BANDS) byBand[band.name] = { name: band.name, asked: 0, correct: 0, lo: band.lo, hi: band.hi };
  const bySkill = {};

  for (const item of items) {
    const band = byBand[bandOf(item.difficulty).name];
    band.asked++;
    if (item.correct) band.correct++;

    const s = bySkill[item.skill_id] || (bySkill[item.skill_id] = {
      skill_id: item.skill_id,
      name: curriculum.skillName(item.skill_id),
      asked: 0,
      correct: 0,
      hardestCorrect: 0,
    });
    s.asked++;
    if (item.correct) {
      s.correct++;
      s.hardestCorrect = Math.max(s.hardestCorrect, item.difficulty);
    }
  }

  const bands = BANDS.map((b) => {
    const row = byBand[b.name];
    return { ...row, accuracy: row.asked ? row.correct / row.asked : null };
  });

  let heldDifficulty = 1;
  let consecutiveFailures = 0;
  for (const band of bands) {
    if (band.accuracy === null) continue;
    if (band.accuracy >= 0.7) {
      heldDifficulty = band.hi;
      consecutiveFailures = 0;
    } else if (band.accuracy >= 0.5) {
      // Partial command of a band: credit the middle of it and keep walking.
      heldDifficulty = Math.max(heldDifficulty, (band.lo + band.hi) / 2);
      consecutiveFailures = 0;
    } else {
      consecutiveFailures++;
      if (consecutiveFailures >= 2) break;
    }
  }

  const overall = items.length ? items.filter((i) => i.correct).length / items.length : 0;
  const placedLevel = levelForDifficulty(heldDifficulty, grade.pathLength, grade);
  const skillRows = Object.values(bySkill).map((s) => ({ ...s, accuracy: s.asked ? s.correct / s.asked : 0 }));
  const userId = (items.find((i) => i && i.user_id) || {}).user_id || null;
  const belief = skillBeliefOn(userId) ? skillBeliefs(items) : null;

  if (belief) {
    for (const row of skillRows) {
      const b = belief.get(row.skill_id);
      row.p_known = b ? Number(b.p.toFixed(3)) : null;
      row.verdict = b ? b.verdict : 'unsure';
    }
    return {
      overall,
      correct: items.filter((i) => i.correct).length,
      asked: items.length,
      bands,
      heldDifficulty: Math.round(heldDifficulty * 10) / 10,
      placedLevel,
      skills: skillRows.sort((a, b) => a.accuracy - b.accuracy),
      gaps: skillRows.filter((s) => s.verdict === 'gap').map((s) => s.skill_id),
      strengths: skillRows.filter((s) => s.verdict === 'strength').map((s) => s.skill_id),
      // Too few answers to say either way: the first sessions decide.
      unsure: skillRows.filter((s) => s.verdict === 'unsure').map((s) => s.skill_id),
      skill_rule: 'belief',
    };
  }

  return {
    overall,
    correct: items.filter((i) => i.correct).length,
    asked: items.length,
    bands,
    heldDifficulty: Math.round(heldDifficulty * 10) / 10,
    placedLevel,
    skills: skillRows.sort((a, b) => a.accuracy - b.accuracy),
    gaps: skillRows.filter((s) => s.accuracy < 0.6).map((s) => s.skill_id),
    strengths: skillRows.filter((s) => s.accuracy >= 0.8).map((s) => s.skill_id),
  };
}

/**
 * Per-skill gaps and strengths on a belief, not a raw percentage (evidence
 * article 01, P6; PLACEMENT_SKILL_BELIEF, default on; never for the owner).
 *
 * "Under 60% is a gap, 80% or better a strength" read one or two answers as a
 * verdict: one miss made a gap, two rights a strength. The same Bayes update as
 * a unit's (services/learner-path.js unitBelief: right with 1 - SLIP if known,
 * by a guess of 1/choices + LUCK if not), from an even prior, gives a third
 * outcome: a strength needs P(known) >= 0.9 (three rights and no miss on four
 * options), a gap P(known) <= 0.15 (two misses), and anything between is
 * "unsure", left to the first sessions. PLACE_STRENGTH_AT / PLACE_GAP_AT tune it.
 */
function skillBeliefOn(userId) {
  if (String(process.env.PLACEMENT_SKILL_BELIEF || 'on').toLowerCase() === 'off') return false;
  try {
    // eslint-disable-next-line global-require
    return !require('../config/owner').ownerBase(userId);
  } catch {
    return false;
  }
}

function skillBeliefs(items) {
  // eslint-disable-next-line global-require
  const { unitBelief } = require('./learner-path');
  const num = (name, fallback) => (Number.isFinite(Number(process.env[name])) && process.env[name] ? Number(process.env[name]) : fallback);
  const strengthAt = num('PLACE_STRENGTH_AT', 0.9);
  const gapAt = num('PLACE_GAP_AT', 0.15);
  const bySkill = new Map();
  for (const i of items) {
    const list = bySkill.get(i.skill_id) || [];
    list.push({ correct: !!i.correct, choices: Array.isArray(i.choices) && i.choices.length ? i.choices.length : 0 });
    bySkill.set(i.skill_id, list);
  }
  const out = new Map();
  for (const [skill, answers] of bySkill) {
    // A typed answer is hardly ever right by guessing: counted as ten options.
    const { p } = unitBelief(answers.map((a) => ({ correct: a.correct, choices: a.choices || 10 })), { prior: 0.5 });
    out.set(skill, { p, verdict: p >= strengthAt ? 'strength' : p <= gapAt ? 'gap' : 'unsure' });
  }
  return out;
}

/**
 * Write the placement result into the learner's knowledge state. Placement is
 * thin evidence — a handful of items per skill — so seeded mastery is capped at
 * 0.7 and marked with a low attempt count, which keeps the next few sessions
 * influential instead of locking in a first impression.
 */
function seedSkillStates(userId, result) {
  for (const skill of result.skills) {
    const estimate = Math.min(0.7, skill.accuracy * 0.85);
    db.upsert('skill_states', (s) => s.user_id === userId && s.skill_id === skill.skill_id, (existing) => ({
      ...(existing || mastery.blankState(userId, skill.skill_id)),
      mastery: existing ? Math.max(existing.mastery, estimate) : estimate,
      attempts: (existing ? existing.attempts : 0) + skill.asked,
      correct: (existing ? existing.correct : 0) + skill.correct,
      last_seen_at: new Date().toISOString(),
      // A strength comes back later; with the belief on (P6), only a believed one,
      // so an "unsure" skill is seen again the next day.
      next_due_at: new Date(Date.now() + ((skill.verdict ? skill.verdict === 'strength' : skill.accuracy >= 0.8) ? 3 : 1) * 24 * 3600 * 1000).toISOString(),
      placed_accuracy: Number(skill.accuracy.toFixed(3)),
    }));
  }
}

module.exports = { buildPlan, buildItems, score, seedSkillStates, targetDifficulty, levelForDifficulty, BANDS };
