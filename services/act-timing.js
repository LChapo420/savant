'use strict';

/**
 * Real timing for the ACT track's exams (Master, Grand Master, Graduation).
 *
 * UNVERIFIED: the section lengths below come from an earlier session's research
 * (docs/CURRICULUM-BUILD-GUIDE.md section 9), not from act.org. Check them there
 * (docs/yc/SOURCES-TO-VERIFY.md) before any number is shown as "the real test".
 * They are one object so a correction is one edit.
 *
 * An exam here mixes sections, so its allowance per question is the blend of the
 * three scored sections: total minutes over total questions.
 */
const SECTIONS = {
  english: { questions: 50, minutes: 35 },
  math: { questions: 45, minutes: 50 },
  reading: { questions: 36, minutes: 40 },
  science: { questions: 40, minutes: 40 },
  writing: { questions: 1, minutes: 40 },
};
const SCORED = ['english', 'math', 'reading'];
const UNVERIFIED = true;
const TIMED_TRACKS = ['act'];
const TIMED_KINDS = ['master', 'grand', 'graduation'];

/** Seconds a question gets on the real test, blended over the scored sections. */
function blendedSecondsPerQuestion() {
  const q = SCORED.reduce((n, s) => n + SECTIONS[s].questions, 0);
  const m = SCORED.reduce((n, s) => n + SECTIONS[s].minutes, 0);
  return (m * 60) / q;
}

/**
 * The clock for an exam, or null when it is not timed (another track, or not an
 * exam). Total time is rounded up to a whole minute.
 */
function timingFor({ trackId, kind, questionCount }) {
  if (!TIMED_TRACKS.includes(trackId) || !TIMED_KINDS.includes(kind)) return null;
  const n = Math.floor(Number(questionCount));
  if (!(n > 0)) return null;
  const per = blendedSecondsPerQuestion();
  return {
    total_seconds: Math.ceil((n * per) / 60) * 60,
    per_question_seconds: Math.round(per),
    questions: n,
    unverified: UNVERIFIED,
  };
}

/**
 * Pacing against the allowance. `answers` is the time spent on each question in
 * ms (null or 0 for unanswered). Reports the median and the questions that took
 * more than twice the allowance, and says in words whether the learner ran short
 * or finished early. Pure, so the same function serves the page and the tests.
 */
function pacing(timing, answers, { timedOut = false } = {}) {
  if (!timing) return null;
  const spent = (answers || []).map((v) => Number(v)).filter((v) => v > 0);
  const answered = spent.length;
  const per = timing.per_question_seconds;
  const sorted = [...spent].sort((a, b) => a - b);
  const median = answered ? Math.round(sorted[Math.floor((answered - 1) / 2)] / 1000) : 0;
  const slow = spent.filter((v) => v > per * 2000).length;
  const total = Math.round(spent.reduce((a, b) => a + b, 0) / 1000);
  let verdict;
  if (timedOut || (timing.questions > answered && total >= timing.total_seconds)) {
    verdict = `Time ran out with ${timing.questions - answered} of ${timing.questions} unanswered. Aim for about ${per} seconds a question; skip a slow one and come back.`;
  } else if (median > per) {
    verdict = `You averaged ${median} seconds a question against about ${per} allowed. Speed up on the easy ones to bank time.`;
  } else {
    verdict = `You kept to the pace: ${median} seconds a question against about ${per} allowed.`;
  }
  return { answered, median_seconds: median, allowance_seconds: per, slow_count: slow, total_seconds: total, timed_out: !!timedOut, verdict };
}

module.exports = { SECTIONS, SCORED, UNVERIFIED, blendedSecondsPerQuestion, timingFor, pacing };
