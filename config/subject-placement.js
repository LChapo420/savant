/**
 * The rules of the subject placement quiz.
 *
 * A learner who does not know where to start is walked up a whole subject — every
 * grade it has, first to last — seven questions at a time, until the questions
 * stop being answerable. It exists because picking a grade off a list asks the
 * learner to know something they are here precisely because they do not know:
 * whether "Algebra 1, Part A" is the right door.
 *
 * Nothing here talks to a model or a database. It is the arithmetic of the walk —
 * how many questions a grade gets, when the walk gives up, and when it offers to
 * skip ahead — so it can be read in one place and tested without one.
 *
 * The questions themselves are written by the model, because a bank question is
 * generated from a skill and a difficulty and has no idea which grade it belongs
 * to; these rules only decide how the answers are read.
 */
const curriculum = require('./curriculum');

/** Seven per grade: two easy, two medium, two hard, and one only a finished grade could answer. */
const QUESTIONS_PER_GRADE = 7;

/**
 * The shape of every grade's seven, in order.
 *
 * `capstone` is the seventh: the question a learner can only answer if they have
 * worked through the whole grade, not just skimmed its first levels. It is the
 * one that separates "has met this" from "has finished this", and it is why a
 * grade can be cleared without being aced.
 */
const MIX = ['easy', 'easy', 'medium', 'medium', 'hard', 'hard', 'capstone'];

/** What each band is asking for, in words, for the prompt and for the UI. */
const BANDS = {
  easy: 'answerable by someone who has just started this grade',
  medium: 'answerable part-way through the grade',
  hard: 'answerable near the end of the grade, but before the last levels',
  capstone: 'answerable only by someone who has finished every level of this grade',
};

/** How many grades in a row may be blank before the walk is looking for the exit. */
const BLANK_GRADES = 3;

/** The fourth grade in such a run has to be this weak or weaker to end the walk. */
const FOURTH_BELOW = 4;

/**
 * A skip is only offered on a subject at least this long. Math has forty-nine
 * grades; Spanish has three, where the whole quiz is shorter than the skip would
 * be, and offering it there would only invite someone to lose four grades of
 * evidence they had already spent the time to collect.
 */
const SKIP_OVER_GRADES = 30;

/** How many grades in a row have to be completely right before a skip is offered. */
const SKIP_AFTER_PERFECT = 4;

/** How many grades a skip steps over. */
const SKIP_SIZE = 4;

/** The subject's grades, in the order they are walked: first to last. */
function gradesFor(trackId) {
  const track = curriculum.getTrack(trackId);
  if (!track || !Array.isArray(track.grades)) return [];
  return track.grades.map((g) => g.id);
}

/** The display name of one grade of a subject, or the id if it is not there. */
function gradeName(trackId, gradeId) {
  const grade = curriculum.getGrade(trackId, gradeId);
  return grade ? grade.name : gradeId;
}

/**
 * How hard a grade's questions should sit on the ten-point scale.
 *
 * A subject is a ladder, so the seventh grade's "easy" question is not the first
 * grade's "easy" question: the whole set climbs from the start of the subject to
 * its end, and this is the line it climbs along. The first grade sits near the
 * floor and the last near the ceiling, and each grade's seven are spread around
 * that point by `difficultyFor`.
 */
function gradeRamp(index, total) {
  if (total <= 1) return 5.5;
  const t = Math.max(0, Math.min(1, index / (total - 1)));
  return Math.round((1.5 + t * 8) * 10) / 10;
}

/**
 * The difficulty one question of one grade should be pitched at.
 *
 * @param {number} degreeIndex  0-based position of the grade in the subject
 * @param {number} total        how many grades the subject has
 * @param {string} band         one of MIX
 * @returns {number} 1–10
 */
function difficultyFor(degreeIndex, total, band) {
  const ramp = gradeRamp(degreeIndex, total);
  const offset = { easy: -2, medium: 0, hard: 2, capstone: 4 }[band] || 0;
  return Math.max(1, Math.min(10, Math.round((ramp + offset) * 10) / 10));
}

/** A grade is perfect when every question in it was right. */
function isPerfect(score) {
  return !!score && score.asked > 0 && score.correct === score.asked;
}

// ── the shape of a grade's answers ─────────────────────────────────────────

/**
 * What the answers to one grade alone say about starting there.
 *
 * This is deliberately not a function of how many were right. The seven are two
 * easy, two medium, two hard and one capstone, and *which* of them were right is
 * the whole signal: four right is 90 or 5 depending on which four. A percentage
 * that rises in a straight line with the count is the one thing this quiz must
 * never produce, because the count is the one part of the answer that carries
 * no information about where a learner belongs.
 *
 * The curve is fixed by the example that asked for it — the four core right and
 * nothing above is the strongest start-here signal there is, and every hard
 * question cleared on top of that is grade already outgrown:
 *
 *   4 right (easy, easy, medium, medium)  → 90
 *   5 right (…plus one hard)              → 75
 *   6 right (…plus both hard)             → 50
 *   7 right (…plus the capstone)          → 20
 *
 * so the numbers rise non-linearly to the peak at four and fall non-linearly
 * from it. Below the peak the same asymmetry the recommendation prompt states
 * is in the arithmetic: a missed easy costs far more than a missed medium
 * (25 → 55 against 15 → 35), and a missed capstone costs nothing at all on its
 * own — it is pitched past the end of the grade, so most people who belong at
 * the grade still miss it. A passed capstone is the opposite: the strongest
 * single piece of evidence that the grade is finished, worth more than a hard.
 *
 * A grade that was sat and scored nothing is not zero — zero is reserved for
 * the grades the walk never reached, which is what the caller passes as null.
 *
 * @param {{asked: number, correct: number, bands?: object}|null} score
 * @returns {number} 0–100
 */
const EASY_HELD = [0, 25, 55];
const MEDIUM_HELD = [0, 15, 35];
const HARD_OUTGROWS = [0, 15, 40];
const CAPSTONE_OUTGROWS = 30;
const SAT_FLOOR = 5;

function shapePercent(score) {
  if (!score || !(score.asked > 0)) return 0;

  // How many of each band were right. A row written before the bands were kept
  // is read as a prefix of the fixed order — "the first N right" — which is the
  // only reading its own `correct` count supports.
  const held = {};
  if (score.bands && Object.keys(score.bands).length) {
    for (const band of MIX) {
      const row = score.bands[band];
      held[band] = row ? Math.max(0, Math.min(row.asked || 0, row.correct || 0)) : 0;
    }
  } else {
    let left = Math.max(0, Math.min(MIX.length, score.correct || 0));
    for (const band of ['easy', 'medium', 'hard', 'capstone']) {
      held[band] = Math.min(band === 'capstone' ? 1 : 2, left);
      left -= held[band];
    }
  }

  const raw = EASY_HELD[Math.min(2, held.easy)]
    + MEDIUM_HELD[Math.min(2, held.medium)]
    - HARD_OUTGROWS[Math.min(2, held.hard)]
    - (held.capstone ? CAPSTONE_OUTGROWS : 0);

  return Math.max(SAT_FLOOR, Math.min(100, Math.round(raw)));
}

/**
 * Has the walk reached the end of what this learner can answer?
 *
 * Three grades in a row answered entirely wrong, and a fourth grade that is
 * still nearly all wrong, is the point where more grades would be guessing: the
 * subject has closed over their head and every further grade reads the same. The
 * fourth is required because three blanks on their own are as likely to be three
 * hard questions as a ceiling — one recovering grade is enough to carry on.
 *
 * Only the most recent grades can end it, so this is checked after every grade
 * and fires the moment the pattern appears.
 *
 * @param {Array<{grade_id: string, asked: number, correct: number}>} scores
 * @returns {boolean}
 */
function shouldStop(scores) {
  const list = Array.isArray(scores) ? scores : [];
  if (list.length < BLANK_GRADES + 1) return false;
  const window = list.slice(-(BLANK_GRADES + 1));
  const blanks = window.slice(0, BLANK_GRADES);
  const fourth = window[BLANK_GRADES];
  return blanks.every((s) => s.asked > 0 && s.correct === 0)
    && fourth.asked > 0 && fourth.correct < FOURTH_BELOW;
}

/**
 * Should the walk offer to step over the next few grades?
 *
 * Offered only on a long subject, and only after a run of grades answered
 * completely right — at that point the next few grades are very likely to be
 * more of the same, and the learner has already shown they would rather not
 * answer them. The offer is a choice, never automatic, and the UI says plainly
 * that taking it makes the recommendation slightly less certain, because the
 * evidence for those grades is then missing rather than collected.
 *
 * `position` is the index of the next grade to walk, which is what stops the
 * offer coming back the instant it is taken: after a skip the position is ahead
 * of the answers collected, and only falls back in step once the learner answers
 * another grade.
 *
 * @returns {{from: number, count: number}|null}
 */
function skipOffer(scores, position, totalGrades) {
  const list = Array.isArray(scores) ? scores : [];
  if (totalGrades <= SKIP_OVER_GRADES) return null;
  if (position !== list.length) return null;
  if (list.length < SKIP_AFTER_PERFECT) return null;
  if (!list.slice(-SKIP_AFTER_PERFECT).every(isPerfect)) return null;
  const count = Math.min(SKIP_SIZE, totalGrades - position);
  if (count <= 0) return null;
  return { from: position, count };
}

/** The grade the walk should recommend from, given what it has: the last one cleared. */
function frontierIndex(scores) {
  const list = Array.isArray(scores) ? scores : [];
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].correct > 0) return i;
  }
  return 0;
}

module.exports = {
  QUESTIONS_PER_GRADE,
  MIX,
  BANDS,
  BLANK_GRADES,
  FOURTH_BELOW,
  SKIP_OVER_GRADES,
  SKIP_AFTER_PERFECT,
  SKIP_SIZE,
  gradesFor,
  gradeName,
  gradeRamp,
  difficultyFor,
  isPerfect,
  shapePercent,
  shouldStop,
  skipOffer,
  frontierIndex,
};
