/**
 * The learner's knowledge state: per-skill mastery, the review schedule, and the
 * rules that decide when a level is finished.
 *
 * Everything here is deliberately simple arithmetic rather than a trained model.
 * That is a Phase 1 choice with two reasons: it is inspectable (a support ticket
 * can be answered by reading three numbers), and it produces the event history
 * that Phase 12 needs in order to replace it with something trained.
 */
const db = require('../config/db');
const curriculum = require('../config/curriculum');
const learnerPath = require('./learner-path');
const irt = require('./scorecard/irt');
const efficiency = require('./efficiency');

const DEFAULT_EASE = 2.5;
const MIN_EASE = 1.3;
const MAX_EASE = 3.0;
const INTERVALS_DAYS = [1, 3, 7, 16, 35, 70, 140];

// ── review timing ───────────────────────────────────────────────────────────
// A skill is due for review when the app's own forgetting model (scorecard.forgettingCurve: the population's fitted
// half-life curve and this learner's own multiplier, the default curve until there are enough memory tests) predicts
// recall below REVIEW_TARGET, lowest predicted recall first, at most three a level. Measured in the recovery simulation
// (curriculum-build/SCORECARD-RESEARCH-2026-10-22.md 7.5 and 8.2): 30-day recall of practised skills up about 40% and
// skills retained per practice hour up about 40% against the fixed ladder, with false directives under 2%.
// REVIEW_SCHEDULE=fixed brings the old SM-2 ladder back (INTERVALS_DAYS above, next_due_at) without a deploy.
// services/efficiency.js (docs/SPEED-RETENTION.md) adds, each behind its own SR_* switch: the learner's own target and the
// successive-relearning retirement in dueReviewsByRecall, and extra review slots when more are due (SR_STOP, default on).
// REVIEW_TARGET overrides the flat target for experiments (the simulation's target sweep); unset it is 0.85.
const REVIEW_TARGET = Number(process.env.REVIEW_TARGET || 0.85);
const REVIEW_MAX = 3;
const DAY_MS = 24 * 3600 * 1000;
const scheduleMode = () => (String(process.env.REVIEW_SCHEDULE || 'model').toLowerCase() === 'fixed' ? 'fixed' : 'model');
const forgetting = () => require('./scorecard/forgetting'); // eslint-disable-line global-require

/** Predicted recall of one skill state after `days`, read from a recallCurve() result (the default curve when null). */
function predictedRecall(state, days, rc = null) {
  const right = Math.max(0, Number(state.correct) || 0);
  const wrong = Math.max(0, (Number(state.attempts) || 0) - right);
  return forgetting().recallAt(rc, {
    days, right, wrong, spacedRight: Number(state.spaced_right) || 0, spacedWrong: Number(state.spaced_wrong) || 0, fresh: 1, guess: 0,
  });
}

/** Days until predicted recall falls to `target` (recall only falls with time): bisection, 0.1 to 365 days. */
function daysToTarget(state, rc, target = REVIEW_TARGET) {
  if (predictedRecall(state, 0.1, rc) < target) return 0.1;
  if (predictedRecall(state, 365, rc) >= target) return 365;
  let lo = 0.1;
  let hi = 365;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (predictedRecall(state, mid, rc) >= target) lo = mid; else hi = mid;
  }
  return hi;
}

const LEVEL_UP = {
  averageMastery: 0.8,
  weakestMastery: 0.6,
  minItems: 12,
};

function blankState(userId, skillId) {
  return {
    user_id: userId,
    skill_id: skillId,
    mastery: 0,
    attempts: 0,
    correct: 0,
    streak: 0,
    ease: DEFAULT_EASE,
    error_tags: [],
    last_seen_at: null,
    next_due_at: null,
  };
}

function stateFor(userId, skillId) {
  return (db.forUser('skill_states', userId).find((s) => s.skill_id === skillId) || null)
    || blankState(userId, skillId);
}

function statesFor(userId, skillIds) {
  const map = {};
  for (const id of skillIds) map[id] = stateFor(userId, id);
  return map;
}

function learningRate(attempts) {
  // Early evidence should move the estimate fast; later evidence should not
  // let one bad item erase a long record.
  return attempts < 3 ? 0.35 : 0.15;
}

/**
 * Fold one answer into the learner's state for that skill.
 *
 * `levelDifficulty` is the difficulty the learner is currently working at, which
 * is what makes credit difficulty-weighted: clearing an item two bands above
 * your level counts for more than clearing one below it, and missing an easy
 * item costs more than missing a hard one.
 */
function recordAttempt({ userId, skillId, correct, difficulty, levelDifficulty, latencyMs, errorTag, hintUsed, itemId }) {
  const gap = Number(difficulty || 5) - Number(levelDifficulty || difficulty || 5);
  const stretchBonus = correct ? 1 + 0.15 * Math.max(0, gap) : 1 + 0.15 * Math.max(0, -gap);

  // The item-calibrated ability model (scorecard/irt.js): what this answer was
  // expected to be, read before the skill's state moves. It is stored beside
  // the state (skill_states.elo) and on the event, and nothing below reads it:
  // mastery, the review schedule and level-up are computed exactly as before.
  const before = stateFor(userId, skillId);
  let model = null;
  try {
    model = irt.attempt({ userId, skillId, state: before, itemId, difficulty, latencyMs, correct, hintUsed });
  } catch (err) {
    console.warn(`mastery: ability model failed: ${err.message}`);
  }

  const row = db.upsert(
    'skill_states',
    (s) => s.user_id === userId && s.skill_id === skillId,
    (existing) => {
      const prev = existing || blankState(userId, skillId);
      // An answer the coach walked them to is real progress, but it is not the
      // same evidence as one produced alone, so it moves mastery half as far.
      const coachDiscount = correct && hintUsed ? 0.5 : 1;
      const rate = Math.min(0.6, learningRate(prev.attempts) * stretchBonus * coachDiscount);
      const target = correct ? 1 : 0;
      const mastery = Math.max(0, Math.min(1, prev.mastery + rate * (target - prev.mastery)));
      const streak = correct ? (prev.streak || 0) + 1 : 0;
      const ease = Math.max(MIN_EASE, Math.min(MAX_EASE, (prev.ease || DEFAULT_EASE) + (correct ? 0.05 : -0.15)));
      const tags = new Set(prev.error_tags || []);
      if (!correct && errorTag) tags.add(errorTag);
      if (correct && errorTag) tags.delete(errorTag);

      const intervalIndex = Math.min(INTERVALS_DAYS.length - 1, Math.max(0, streak - 1));
      const fixedDays = correct
        ? INTERVALS_DAYS[intervalIndex] * (ease / DEFAULT_EASE) * (hintUsed ? 0.5 : 1)
        : 0.5; // a miss comes back in the next session, not next week
      // An answer a day or more after the skill was last practised, given alone and not in a rush, is a memory test
      // (forgetting.js reads these as their own terms; see recallAt). Counted beside correct and attempts.
      const gapDays = prev.last_seen_at ? (Date.now() - Date.parse(prev.last_seen_at)) / DAY_MS : 0;
      const spaced = gapDays >= 1 && !hintUsed && !(model && model.ctx && model.ctx.rapid);
      const next = {
        correct: prev.correct + (correct ? 1 : 0),
        attempts: prev.attempts + 1,
        spaced_right: (prev.spaced_right || 0) + (spaced && correct ? 1 : 0),
        spaced_wrong: (prev.spaced_wrong || 0) + (spaced && !correct ? 1 : 0),
        // Consecutive right answers given a day or more after the previous one (successive relearning, services/efficiency.js):
        // a miss, at any time, starts the count again.
        spaced_streak: !correct ? 0 : spaced ? (prev.spaced_streak || 0) + 1 : (prev.spaced_streak || 0),
      };
      // The date the skill is next listed (reminders, the profile's due list): the fixed ladder's, or when the default
      // curve says recall reaches the target. dueReviews() re-predicts with the learner's own fitted curve.
      const days = scheduleMode() === 'fixed' ? fixedDays : daysToTarget({ ...next, correct: next.correct }, null);
      return {
        user_id: userId,
        skill_id: skillId,
        mastery,
        attempts: next.attempts,
        correct: next.correct,
        spaced_right: next.spaced_right,
        spaced_wrong: next.spaced_wrong,
        spaced_streak: next.spaced_streak,
        streak,
        ease,
        error_tags: [...tags].slice(-8),
        last_seen_at: new Date().toISOString(),
        next_due_at: new Date(Date.now() + days * 24 * 3600 * 1000).toISOString(),
        ...(model ? { elo: model.skillElo } : (prev.elo ? { elo: prev.elo } : {})),
      };
    },
  );

  db.insert('events', {
    user_id: userId,
    item_id: itemId || null,
    skill_id: skillId,
    correct: !!correct,
    difficulty: Number(difficulty || 5),
    latency_ms: Number(latencyMs || 0),
    hint_used: !!hintUsed,
    error_tag: errorTag || null,
    mastery_after: row.mastery,
    // For the forgetting model and later analysis: what the ability model
    // expected, and how long since this skill was last practised.
    ...(model ? {
      expected: model.ctx.expected,
      interval_days: model.ctx.interval_days,
      prior_attempts: model.ctx.prior_attempts,
      prior_correct: model.ctx.prior_correct,
      rapid: model.ctx.rapid,
    } : {}),
  });

  return row;
}

/**
 * Skills whose review is due now, at most `limit` (three a level). model (the default): predicted recall below the
 * target, lowest first; each is returned as a copy of its state with `recall`. fixed (REVIEW_SCHEDULE=fixed): the old
 * ladder, weakest and most overdue first. A learner whose spec says they forget fast (or keep things) has the target
 * moved by up to 0.05 and the gap since the last answer stretched by up to 0.6x to 1.25x (services/learning-spec.js).
 */
const speedLevers = () => require('./speed-levers'); // eslint-disable-line global-require
function dueReviews(userId, skillIds, limit = REVIEW_MAX, goalCtx = null) {
  return scheduleMode() === 'fixed' ? dueReviewsFixed(userId, skillIds, limit) : dueReviewsByRecall(userId, skillIds, limit, goalCtx);
}

function dueReviewsByRecall(userId, skillIds, limit, goalCtx = null) {
  return efficiency.forLearner(userId, () => dueReviewsByRecallRaw(userId, skillIds, limit, goalCtx));
}

function dueReviewsByRecallRaw(userId, skillIds, limit, goalCtx = null) {
  const now = Date.now();
  // Retention goal (SR_GOAL_REVIEW / SR_GOAL_BACKWARD, services/retention-goal.js). goalCtx is null with both switches off: nothing below changes.
  const rg = goalCtx ? require('./retention-goal') : null; // eslint-disable-line global-require
  const win = rg ? rg.reviewWindow(goalCtx.eff, goalCtx.finishedOn, now) : null;
  if (win && (win.done || win.hold)) return [];
  // eslint-disable-next-line global-require
  const rev = require('./learning-spec').reviewFor(userId);
  const target = REVIEW_TARGET + (rev.spec && !rev.spec.isDefault ? rev.targetRecall - 0.9 : 0);
  let rc = null;
  try { rc = require('./scorecard').forgettingCurve({ userId }); } catch { rc = null; } // eslint-disable-line global-require
  const out = [];
  const m = rc && Number.isFinite(rc.m) ? rc.m : 0;
  for (const id of skillIds) {
    const s = stateFor(userId, id);
    if (!(s.attempts > 0)) continue;
    const last = Date.parse(s.last_seen_at);
    if (!Number.isFinite(last)) { if (s.next_due_at && Date.parse(s.next_due_at) <= now) out.push({ ...s, recall: 0 }); continue; } // no last answer on record: the stored date decides
    const days = Math.max(0, now - last) / DAY_MS / rev.spacingScale;
    const recall = predictedRecall(s, days, rc);
    // services/efficiency.js: the target is the learner's own (their forgetting multiplier, their spaced recalls so far), or the
    // maintenance level once the skill has met the successive-relearning criterion. The flat target with SR_ALL=off.
    let below = efficiency.dueBelow(target, s, m);
    if (win) {
      below = rg.reviewTargetFor(below, win, goalCtx.eff);
      // still above the goal's memory floor on its end day: defer (not in the final look)
      if (!win.final && goalCtx.eff.status === 'horizon' && !rg.reviewNeeded(win.daysToEnd, (more) => predictedRecall(s, days + more, rc))) continue;
    }
    // SPEED_REVIEW_TARGET (services/speed-levers.js): asked only when predicted recall falls under the learner's target, up to the goal's last day. Off: nothing changes.
    if (goalCtx && speedLevers().enabled('target')) {
      const toEnd = rg.daysToGoalEnd(goalCtx.eff, goalCtx.finishedOn, now);
      if (speedLevers().reviewWanted(userId, id, recall, toEnd === null ? null : { daysToEnd: toEnd, recallAtEnd: predictedRecall(s, days + Math.max(0, toEnd), rc) })) out.push({ ...s, recall });
      continue;
    }
    if (recall < below) out.push({ ...s, recall });
  }
  return out.sort((a, b) => (a.recall - b.recall) || (a.mastery - b.mastery)).slice(0, efficiency.reviewSlots(limit, out.length));
}

/** The old ladder: weakest and most overdue first. */
function dueReviewsFixed(userId, skillIds, limit) {
  const now = Date.now();
  // The learner's own spacing (services/learning-spec.js review.spacingScale): the gap between the last answer
  // and the review is stretched or shortened, within 0.6x to 1.25x. 1x for a learner with no spec.
  // eslint-disable-next-line global-require
  const scale = require('./learning-spec').reviewFor(userId).spacingScale;
  const dueAt = (s) => {
    const due = Date.parse(s.next_due_at);
    const last = Date.parse(s.last_seen_at);
    return scale === 1 || !Number.isFinite(last) || due <= last ? due : last + (due - last) * scale;
  };
  return skillIds
    .map((id) => stateFor(userId, id))
    .filter((s) => s.attempts > 0 && s.next_due_at && dueAt(s) <= now)
    .sort((a, b) => (a.mastery - b.mastery) || (Date.parse(a.next_due_at) - Date.parse(b.next_due_at)))
    .slice(0, limit);
}

/** The skills holding a learner back at their current level. */
function weakSkills(userId, skillIds, threshold = LEVEL_UP.weakestMastery) {
  return skillIds
    .map((id) => stateFor(userId, id))
    .filter((s) => s.mastery < threshold)
    .sort((a, b) => a.mastery - b.mastery);
}

function averageMastery(userId, skillIds) {
  if (!skillIds.length) return 0;
  const total = skillIds.reduce((sum, id) => sum + stateFor(userId, id).mastery, 0);
  return total / skillIds.length;
}

/**
 * Has the learner finished their current level?
 *
 * Three conditions, and all three matter: the average proves general competence,
 * the floor stops one ignored skill from riding along, and the item count stops a
 * lucky three-question streak from counting as a level.
 */
function levelProgress(userId, enrollment, grade) {
  const plan = curriculum.levelPlan(grade, enrollment.current_level);
  // "Everything the learner has met by now" (levelPlan): the list is the grade's skill order, not the order lessons teach them, so it holds skills no lesson has reached yet. Each of those
  // counted as mastery 0 in the gate: on ACT grade 1 a learner with every answer right stayed on level 21 for 26 sittings (docs/speed-real/ROUND4.md). The gate now reads the skills the learner
  // has met, plus this level's focus. LEVEL_GATE_MET=off restores the old reading.
  const met = String(process.env.LEVEL_GATE_MET || 'on').toLowerCase() !== 'off';
  const skills = met ? plan.introduced.filter((id) => id === plan.focus || stateFor(userId, id).attempts > 0) : plan.introduced;
  const avg = averageMastery(userId, skills);
  const weakest = skills.reduce((min, id) => Math.min(min, stateFor(userId, id).mastery), 1);
  const items = enrollment.level_items || 0;
  const shownUnderstood = plan.kind === 'practice' && items > 0 && speedLevers().practiceShown(userId, plan.focus, { grade, trackId: enrollment.track_id, enrollmentId: enrollment.id, level: enrollment.current_level }); // SPEED_MASTERY_STOP: off, always false
  const proofDone = plan.kind === 'practice' && items >= LEVEL_UP.minItems && speedLevers().proofPasses(userId, enrollment, enrollment.current_level); // SPEED_PROOF_PASSES: off, always false
  const ready = shownUnderstood || proofDone || (avg >= LEVEL_UP.averageMastery && weakest >= LEVEL_UP.weakestMastery && items >= LEVEL_UP.minItems);

  const blockers = [];
  if (avg < LEVEL_UP.averageMastery) blockers.push(`average mastery ${(avg * 100).toFixed(0)}% of ${LEVEL_UP.averageMastery * 100}%`);
  if (weakest < LEVEL_UP.weakestMastery) blockers.push(`weakest skill at ${(weakest * 100).toFixed(0)}%, needs ${LEVEL_UP.weakestMastery * 100}%`);
  if (items < LEVEL_UP.minItems) blockers.push(`${items} of ${LEVEL_UP.minItems} questions answered at this level`);

  return {
    ready,
    average: avg,
    weakest,
    items,
    required: LEVEL_UP,
    blockers,
    kind: plan.kind,
    checkpoint: plan.checkpoint,
    focus: plan.focus,
    introduced: skills,
  };
}

/**
 * Stand the learner on a level, clearing the work counter.
 *
 * Split out of advance() because the two are not the same move. Advancing is a
 * step of one, earned a level at a time. A skip is a jump of several, and it has
 * to be able to place the learner exactly on the level the exam proved — which
 * an unconditional +1 quietly ruins by landing them one past it, on material
 * nothing has checked.
 */
function moveTo(enrollment, grade, level, extra = {}) {
  const nextLevel = Math.max(1, Math.min(grade.pathLength, level));
  db.update('enrollments', enrollment.id, {
    current_level: nextLevel,
    level_items: 0,
    checkpoint_retry_at: null,
    ...extra,
  });
  return nextLevel;
}

/**
 * Move the learner on from the level they just finished.
 *
 * On a linear path that is the next level. On a gap-only path
 * (services/learner-path.js) it is the next level whose unit is still to be
 * worked: units the learner proved are stepped over, and their checkpoints are
 * recorded as cleared — with the evidence that cleared them — the way a jump
 * records the checkpoints below it. Finishing the last level of a unit being
 * worked marks that unit done.
 */
function advance(enrollment, grade, extra = {}) {
  const from = enrollment.current_level;
  // Passing the last level finishes the course; a retention goal counts a horizon from here (SR_GOAL_REVIEW). Written once, whatever the switches say.
  if (from >= grade.pathLength && !enrollment.finished_on) extra = { finished_on: new Date().toISOString(), ...extra };
  if (!learnerPath.planFor(enrollment)) {
    // learnerPath.nextLevelAfter is from + 1 on a path with no unit plan, except
    // that with ADAPTIVE_TEACHING=on it steps over the remaining practice of a
    // proven objective (never a retention level, never a checkpoint).
    return moveTo(enrollment, grade, learnerPath.nextLevelAfter(enrollment, grade, from), {
      levels_completed: (enrollment.levels_completed || 0) + 1,
      ...extra,
    });
  }
  const target = learnerPath.nextLevelAfter(enrollment, grade, from);
  learnerPath.finishLevel(enrollment, from);
  return moveTo(enrollment, grade, target, {
    levels_completed: (enrollment.levels_completed || 0) + 1,
    ...skippedCheckpointPatch(enrollment, grade, from, target),
    ...extra,
  });
}

/**
 * The checkpoint records for a move that steps over known units: each skipped
 * checkpoint in `checkpoints_cleared` (a timestamp, as a jump writes it, so
 * everything that reads that map reads these the same), and in
 * `checkpoint_sources` what proved the unit — placement, quick check, test-out
 * or gap scan — so a skip can always be told from a pass. Empty when nothing is
 * stepped over.
 */
function skippedCheckpointPatch(enrollment, grade, from, to) {
  const skipped = learnerPath.skippedCheckpoints(enrollment, grade, from, to);
  if (!skipped.length) return {};
  const fresh = db.byId('enrollments', enrollment.id) || enrollment;
  const now = new Date().toISOString();
  const cleared = { ...(fresh.checkpoints_cleared || {}) };
  const sources = { ...(fresh.checkpoint_sources || {}) };
  for (const s of skipped) {
    // A checkpoint already passed stays passed on its own record.
    if (cleared[s.level]) continue;
    cleared[s.level] = now;
    sources[s.level] = `unit_plan:${s.source}`;
  }
  return { checkpoints_cleared: cleared, checkpoint_sources: sources };
}

/**
 * Advance the learner if they have earned it.
 *
 * Only a practice level is decided by mastery. A lesson level is cleared by
 * working through the lesson, and a checkpoint level by passing its quiz — both
 * of those call their own path, so this one reports what the level requires
 * rather than pretending to judge it.
 */
function tryLevelUp(userId, enrollment, grade) {
  const progress = levelProgress(userId, enrollment, grade);
  if (progress.kind !== 'practice') {
    return { advanced: false, progress, requires: progress.kind };
  }
  if (!progress.ready) return { advanced: false, progress };
  const level = advance(enrollment, grade);
  return { advanced: true, level, progress, ...skipShownPractice(userId, enrollment, grade) };
}

/**
 * SPEED_MASTERY_STOP: the practice levels straight after this one, on a skill already shown understood, are passed over too. A lesson or a checkpoint always stops it: gates are
 * never passed over. Said to the learner (speed_skipped on the level's close). Off: nothing moves and this returns nothing.
 */
function skipShownPractice(userId, enrollment, grade) {
  if (!speedLevers().enabled('stop')) return {};
  let skipped = 0; let fresh = db.byId('enrollments', enrollment.id);
  while (fresh && fresh.status === 'active' && fresh.current_level < grade.pathLength && skipped < 50) {
    const plan = curriculum.levelPlan(grade, fresh.current_level);
    if (plan.kind !== 'practice' || !speedLevers().practiceShown(userId, plan.focus, { grade, trackId: enrollment.track_id, enrollmentId: enrollment.id, level: fresh.current_level })) break;
    advance(fresh, grade); skipped++; fresh = db.byId('enrollments', enrollment.id);
  }
  return skipped ? { speed_skipped: skipped } : {};
}

/** Called when a lesson level's lesson has been worked through. */
function completeLesson(userId, enrollment, grade) {
  const progress = levelProgress(userId, enrollment, grade);
  if (progress.kind !== 'lesson') return { advanced: false, progress };
  return { advanced: true, level: advance(enrollment, grade), progress, lesson: true };
}

/** Called when a checkpoint quiz is passed: moves the level, or graduates. */
function clearCheckpoint(enrollment, grade, kind) {
  if (kind === 'graduation') {
    // The coverage gate (services/coverage.js): every objective of the grade
    // proven and kept. By default (COVERAGE_GATE=shadow) it only records what it
    // would have said on the enrollment; with COVERAGE_GATE=enforce, an exam
    // passed while objectives are still unproven does not graduate yet. It
    // never throws, so a failure in it cannot stop a pass.
    // eslint-disable-next-line global-require
    const cover = require('./coverage').atGraduation(enrollment.user_id, enrollment);
    if (cover && cover.block) {
      db.update('enrollments', enrollment.id, { checkpoint_retry_at: null, coverage_held_at: new Date().toISOString() });
      return { graduated: false, coverage_held: true, coverage: cover.summary, level: enrollment.current_level };
    }
    // The skill stage gate (staged skills round 3, services/skill-gate.js;
    // SKILL_STAGE_GATE): leaving a chess, piano or basketball stage needs every
    // machine-provable exit metric proven on two cold days. Shadow, the default,
    // only records what it would say; `on` holds the graduation. Absent or
    // failing, it never stops a pass.
    let skillGate = null;
    try {
      // eslint-disable-next-line global-require
      skillGate = require('./skill-gate').atGraduation(enrollment);
    } catch (err) {
      skillGate = null;
    }
    if (skillGate && skillGate.block) {
      db.update('enrollments', enrollment.id, { checkpoint_retry_at: null, skill_held_at: new Date().toISOString() });
      return { graduated: false, skill_held: true, skill: skillGate.summary, level: enrollment.current_level };
    }
    db.update('enrollments', enrollment.id, {
      status: 'graduated',
      checkpoint_retry_at: null,
      graduated_at: new Date().toISOString(),
    });
    return { graduated: true, level: enrollment.current_level };
  }
  // The level being cleared, read before the move: the enrollment row is updated
  // in place, so after advance() its current_level is already the next level.
  const passedLevel = enrollment.current_level;
  const nextLevel = advance(enrollment, grade, { [`${kind}_passed_at`]: new Date().toISOString() });
  // Read back after the move, which may itself have recorded checkpoints it
  // stepped over (a gap-only path); spreading the copy from before would drop them.
  const after = db.byId('enrollments', enrollment.id) || enrollment;
  // A checkpoint below the level a jump landed on was already passed by that
  // jump, so a real attempt on it afterwards is not a first pass.
  db.update('enrollments', enrollment.id, {
    // The attempt count belongs to one checkpoint. Left standing, the first try
    // at the next checkpoint was counted as a retry of this one.
    checkpoint_attempts: 0,
    checkpoints_cleared: {
      ...(after.checkpoints_cleared || {}),
      [passedLevel]: new Date().toISOString(),
    },
  });
  return { graduated: false, level: nextLevel };
}

// ── The clean run ──────────────────────────────────────────────────────────
/**
 * How many levels in a row this learner has cleared at 90% or better.
 *
 * This is the counter behind the Challenge Exam, and it is tracked per
 * enrollment rather than per account because it describes one path: a strong
 * month of algebra says nothing about a simultaneous run through Spanish.
 *
 * Two decisions shape it. A level below the mark resets the run to zero rather
 * than merely not incrementing it, because "twenty-five consecutive levels" is a
 * claim about continuity and a weak level in the middle breaks the continuity.
 * And a checkpoint counts toward the run on its own score, not on the fact that
 * it was passed — a Master quiz cleared at 76% is a level cleared at 76%, and
 * crediting it at face value would let the weakest kind of level on the path buy
 * the strongest offer in the app.
 */
function streakFor(userId, enrollmentId) {
  return (db.forUser('streaks', userId).find((s) => s.enrollment_id === enrollmentId) || null)
    || {
      user_id: userId,
      enrollment_id: enrollmentId,
      run: 0,
      best: 0,
      last_level: 0,
      offered_level: null,
      taken_at: null,
      awarded_level: null,
    };
}

/**
 * Fold a cleared level into the run.
 *
 * Called once per level, by whichever path cleared it, and only when the level
 * actually moved — a level the learner did not advance through should not extend
 * a run, or standing still on one hard level would quietly earn the offer.
 *
 * `grade` is needed to ask which level follows this one, so that a layout with
 * gaps does not break a run that was not broken. It is optional: a caller that
 * has no grade in hand gets the old arithmetic, which is right for every grade
 * that holds every number.
 *
 * @param {object} args
 * @param {string} args.userId
 * @param {string} args.enrollmentId
 * @param {number} args.level
 * @param {number} args.accuracy
 * @param {object} [args.grade] the grade, so "the next level" can be asked
 * @returns {object} the streak row
 */
function recordLevelCleared({ userId, enrollmentId, level, accuracy, grade }) {
  const mark = Number(accuracy) >= curriculum.SKIP_MARK;
  return db.upsert(
    'streaks',
    (s) => s.user_id === userId && s.enrollment_id === enrollmentId,
    (prev) => {
      const before = prev || streakFor(userId, enrollmentId);
      // Extending the run needs the levels to be consecutive. Going over the level
      // just recorded is that, and matters more than it looks: a learner parked on
      // a checkpoint sits the same level twice, and the second clean pass is more
      // evidence and not a restart.
      //
      // Consecutive means "the next level this grade has", not "one higher than
      // the last". A stated layout need not hold every number — a course may put
      // its lessons at 7, 20 and 41 — and then a learner who cleared 7 and went on
      // to 20 has cleared two levels in a row, not broken their run on a level
      // that does not exist. The layout is asked which level follows.
      const next = grade ? curriculum.nextLevelAfter(grade, before.last_level) : null;
      // And on a gap-only path, the next level is the next one the path stands
      // on: stepping over a unit the learner proved is the path working, not a
      // break in the run.
      const enrollment = grade ? db.byId('enrollments', enrollmentId) : null;
      const pathNext = enrollment && learnerPath.planFor(enrollment)
        ? learnerPath.nextLevelAfter(enrollment, grade, before.last_level) : null;
      const continues = before.last_level === level - 1
        || before.last_level === level
        || (next != null && next === level)
        || (pathNext != null && pathNext === level);
      const run = !mark ? 0 : continues ? (before.run || 0) + (before.last_level === level ? 0 : 1) : 1;
      return {
        user_id: userId,
        enrollment_id: enrollmentId,
        run,
        best: Math.max(before.best || 0, run),
        last_level: level,
        // A run that breaks withdraws the offer it had earned. The learner is
        // welcome to earn it again by putting another run together.
        offered_level: mark ? before.offered_level : null,
      };
    },
  );
}

/**
 * Is this learner being offered the Challenge Exam?
 *
 * The offer stands until the run breaks or the exam is taken, whichever comes
 * first. It is not tied to a level: an offer earned at 78 is still an offer to
 * skip *from* wherever they are standing when they sit it, because the exam
 * measures against where they are, not against where they were when they
 * earned it.
 */
function skipOffer(userId, enrollment, grade) {
  const streak = streakFor(userId, enrollment.id);
  const base = {
    run: streak.run || 0,
    best: streak.best || 0,
    needed: curriculum.SKIP_STREAK_LEVELS,
    mark: curriculum.SKIP_MARK,
  };
  const standing = streak.run >= curriculum.SKIP_STREAK_LEVELS
    && !streak.taken_at
    && enrollment.status === 'active';
  if (!standing) return { ...base, offered: false };
  // The speed proof's plain-way skill has no test-out (services/speed-proof.js): the standard way is to work through it.
  try { if (require('./speed-proof').plainAtLevel(userId, enrollment, grade)) return { ...base, offered: false, held: 'plain_way' }; } catch { /* not loaded */ } // eslint-disable-line global-require
  return {
    ...base,
    offered: true,
    from_level: enrollment.current_level,
    // The bands the exam would be built with (the likelihood-ratio rule, evidence P3, or every band perfect for the owner).
    // eslint-disable-next-line global-require
    bands: curriculum.skipExamBands(enrollment.current_level, grade.pathLength, { rule: curriculum.skipRule({ base: require('../config/owner').ownerOnly(userId) }) }),
  };
}

/**
 * Close the offer without moving the learner: an exam that skipped nothing.
 *
 * Kept separate from awardSkip because the two do different things — one moves a
 * level, the other only spends the offer — and because "you took it and it did
 * not go your way" is a real outcome that has to be recorded rather than left
 * looking like an exam still sitting there waiting to be retaken.
 */
function spendOffer(userId, enrollmentId) {
  const row = (db.forUser('streaks', userId).find((s) => s.enrollment_id === enrollmentId) || null);
  if (row) db.update('streaks', row.id, { taken_at: new Date().toISOString() });
  return null;
}

/**
 * Whether this learner has already been credited with passing a checkpoint.
 *
 * A jump past a checkpoint is a pass, and there are several of them, so a single
 * `master_passed_at` cannot hold the answer — hence a map of levels, which
 * `jumpToLevel` writes and this reads. The old field is still consulted, because
 * everything before this existed wrote only that.
 */
function checkpointCleared(enrollment, level) {
  const map = enrollment && enrollment.checkpoints_cleared;
  if (map && map[level]) return true;
  return false;
}

/**
 * Move past a level without working on it.
 *
 * One account can do this, and it is the reason this function exists separately
 * from `advance` rather than being a flag on it: a skipped level is a level
 * nobody did anything on, so it must not count as one they cleared. The omission
 * of `recordLevelCleared` below is the entire point of this function, and it
 * looks like a bug if you read it cold — so it says so here.
 *
 * It also does not touch mastery. There is no evidence to record in either
 * direction, and inventing some would be worse than having none.
 */
function skipLevel(enrollment, grade) {
  const next = moveTo(enrollment, grade, enrollment.current_level + 1, {
    skipped_level: true,
    skipped_at: new Date().toISOString(),
  });
  return next;
}

/**
 * Stand the learner on a level, recording everything below it as done.
 *
 * One account can do this. It is not a loop of `advance` and
 * `recordLevelCleared` because a jump has to write one coherent record in one
 * pass: the run, the checkpoints, the skills and the level all have to agree, and
 * composing the jump out of the ordinary steps would let a bug leave the run at
 * 139 while the enrollment sat at 140 — worse than not having the button.
 *
 * Three things are written, and the reasoning on each is different:
 *
 * - **The run is replayed, level by level**, through `recordLevelCleared`, rather
 *   than set to a number. That counter has real rules — consecutive, reset below
 *   90%, not extended by re-clearing the same level — and it is the one number
 *   whose whole job is to be true. Replaying means a jump of three leaves a run
 *   of three, and a jump of 139 leaves a run of 139, because that is what really
 *   happened to it.
 *
 * - **Skills are brought to full mastery directly**, not through
 *   `recordAttempt`, which approaches 1 asymptotically and so could never report
 *   the 100% this is claiming. A skill already at or above full mastery is left
 *   alone rather than rewritten, so a jump cannot quietly lower real evidence.
 *
 * - **Checkpoints below the target are recorded as passed**, in a map, because
 *   `master_passed_at` holds one timestamp and a jump clears several.
 *
 * Every event it writes carries `skipped: true`. They are perfect attempts at
 * work nobody did, and the event log is the raw material a trained learner model
 * would later be built on — so they are marked well enough to be excluded from a
 * future training set, which is a decision someone has to remember to make.
 */
function jumpToLevel({ userId, enrollment, grade, to }) {
  const from = enrollment.current_level || 1;
  const target = Math.max(1, Math.min(grade.pathLength, Math.floor(Number(to) || 0)));
  if (target <= from) return { moved: false, level: from, reason: 'That level is not ahead of where you are.' };

  const cleared = [];
  const skills = new Set();

  for (let level = from; level < target; level++) {
    const plan = curriculum.levelPlan(grade, level);
    // The real rules, replayed. A jump to 140 is 139 consecutive clean levels
    // and the run says so.
    recordLevelCleared({
      userId, enrollmentId: enrollment.id, level, accuracy: 1, grade,
    });
    cleared.push(level);
    plan.introduced.forEach((id) => skills.add(id));
  }

  for (const skillId of skills) {
    const state = stateFor(userId, skillId);
    if (state.mastery >= 1) continue;
    db.upsert(
      'skill_states',
      (s) => s.user_id === userId && s.skill_id === skillId,
      (existing) => {
        const prev = existing || blankState(userId, skillId);
        return {
          ...prev,
          mastery: 1,
          attempts: prev.attempts + 1,
          correct: prev.correct + 1,
          streak: (prev.streak || 0) + 1,
          ease: MAX_EASE,
          // Nothing is wrong with any of it, so the tags a learner arrived with
          // are cleared rather than left contradicting the mark.
          error_tags: [],
          last_seen_at: new Date().toISOString(),
        };
      },
    );
    db.insert('events', {
      user_id: userId, item_id: null, skill_id: skillId, correct: true,
      difficulty: 0, latency_ms: 0, hint_used: false, error_tag: null,
      mastery_after: 1, skipped: true,
    });
  }

  // Checkpoints below the target, recorded per level. The Graduation level is left
  // alone: passing it graduates the track, and standing on it is not that.
  //
  // This asked the level number which checkpoints were on it by modulus, which is
  // a second copy of the level rule and was already wrong for every grade that
  // states its own levels — it recorded level 25 as a cleared checkpoint on each
  // English grade, where 25 is a lesson the learner was taught. It asks the
  // layout now, so a jump past a quiz the grade actually has marks that quiz, and
  // a jump past a level that is not a quiz marks nothing.
  const now = new Date().toISOString();
  const map = { ...(enrollment.checkpoints_cleared || {}) };
  const passed = [];
  for (let level = from; level < target; level++) {
    if (curriculum.isCheckpoint(curriculum.levelKind(level, grade.pathLength, grade))) {
      map[level] = now;
    }
  }

  const level = moveTo(enrollment, grade, target, {
    levels_completed: Math.max(enrollment.levels_completed || 0, target - 1),
    skipped_to: target,
    skipped_at: now,
    skipped_from: from,
    checkpoints_cleared: map,
  });

  return {
    moved: true,
    level,
    from,
    cleared: cleared.length,
    skills: skills.size,
    checkpoints: Object.keys(map).map(Number).sort((a, b) => a - b),
  };
}

/**
 * Send the learner to the level their exam earned.
 *
 * The offer is spent either way, including on an exam that skipped nothing:
 * it measures the levels above where they stood, and re-sitting it to fish for
 * a better draw is the same thing the old checkpoint cooldown existed to stop.
 *
 * The run itself is left alone. The levels they skipped are levels they did not
 * sit, so counting them would credit work nobody did; and zeroing the run would
 * throw away a genuine achievement on top of a level that was simply not a
 * chance to earn anything.
 */
function awardSkip(userId, enrollment, grade, targetLevel) {
  const level = Math.min(grade.pathLength, targetLevel);
  const row = db.upsert(
    'streaks',
    (s) => s.user_id === userId && s.enrollment_id === enrollment.id,
    () => ({ user_id: userId, enrollment_id: enrollment.id }),
  );
  db.update('streaks', row.id, {
    offered_level: level,
    taken_at: new Date().toISOString(),
    awarded_level: level,
  });
  moveTo(enrollment, grade, level, { skipped_to: level, skipped_at: new Date().toISOString() });
  return level;
}

/**
 * XP is earned for effort and accuracy, with a bonus for stretch items and a
 * reduction when the coach did part of the work — enough to make working it out
 * alone feel worth more, not enough to discourage asking for help.
 */
function xpForItems(items) {
  return items.reduce((sum, it) => {
    if (!it.correct) return sum + 2;
    const base = 10 + Math.round(Math.max(0, it.difficulty - 5));
    return sum + (it.coach_used ? Math.round(base * 0.6) : base);
  }, 0);
}

/**
 * Predicted recall of each skill that has an answer on record, now, from the learner's own fitted curve (the pool
 * services/efficiency.js interleaves from, and the order it takes it in). { skill_id, state, recall }, lowest first.
 */
function recallByskill(userId, skillIds) {
  let rc = null;
  try { rc = require('./scorecard').forgettingCurve({ userId }); } catch { rc = null; } // eslint-disable-line global-require
  const now = Date.now();
  return skillIds.map((id) => stateFor(userId, id)).filter((s) => s.attempts > 0).map((s) => {
    const last = Date.parse(s.last_seen_at);
    const days = Number.isFinite(last) ? Math.max(0, now - last) / DAY_MS : 0;
    return { skill_id: s.skill_id, state: s, recall: predictedRecall(s, days, rc) };
  }).sort((a, b) => a.recall - b.recall);
}

module.exports = {
  moveTo,
  recallByskill,
  REVIEW_TARGET, REVIEW_MAX, predictedRecall, daysToTarget, scheduleMode,
  LEVEL_UP,
  blankState,
  stateFor,
  statesFor,
  recordAttempt,
  dueReviews,
  weakSkills,
  averageMastery,
  levelProgress,
  tryLevelUp,
  completeLesson,
  advance,
  clearCheckpoint,
  recordLevelCleared,
  streakFor,
  skipOffer,
  spendOffer,
  awardSkip,
  skipLevel,
  jumpToLevel,
  checkpointCleared,
  xpForItems,
};
