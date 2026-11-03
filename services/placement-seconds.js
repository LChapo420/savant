/**
 * How many seconds a placement question takes, ESTIMATED from its words and its answer type.
 *
 * No real timings of placement questions exist (the app has recorded three placements, one answer
 * among them), so this is a model, not a measurement, and it is built to over-estimate rather than
 * under-estimate: a clock that thinks questions are quicker than they are would promise a placement
 * the learner has no time to finish.
 *
 *   seconds = ORIENT                          read the stem and move the eyes to the options
 *           + prompt words / READ_WPS          reading, at a slow adult / teen silent rate
 *           + option words / (READ_WPS * 1.5)  options are skimmed, not read twice
 *           + DECIDE + PER_OPTION * options    compare and tap
 *           + WORK[band] * KIND[track]         the thinking the item needs, by its band and subject
 *
 * Fixed per-item overhead (ORIENT + DECIDE) is why short items matter: a 6-word, 4-option item is
 * about 9 s of overhead and reading before any work, and a 40-word stem is 9 s more.
 * Used by the Quick walk (services/adaptive-placement.js nextBlock `secondsAware`) to prefer, among the
 * questions that are about equally informative, the one that takes least time; and by
 * scripts/placement-sim.js to run the clock. docs/ONBOARDING-MODES.md section 4 says what it rests on.
 */
const READ_WPS = 3.0; // words a second; a teen reads silently at 3.5 to 4, a child much slower
const ORIENT = 2.5;
const DECIDE = 1.5;
const PER_OPTION = 0.5;
const WORK = { easy: 2, medium: 5, hard: 9, capstone: 12 };
// How much working-out a subject's questions need next to the middle (1): arithmetic and logic take more, recall less.
const KIND = { math: 1.2, act: 1.1, iq: 1.2, chess: 1.2, piano: 0.7, english: 0.6, reading: 0.8, spanish: 0.6, basketball: 0.6 };

const words = (s) => String(s == null ? '' : s).trim().split(/\s+/).filter(Boolean).length;

/** Estimated seconds for one question {prompt, choices, band} of `trackId` for a median learner. */
function questionSeconds(q, trackId) {
  const options = Array.isArray(q.choices) ? q.choices : [];
  const optionWords = options.reduce((n, c) => n + words(c), 0);
  const work = (WORK[q.band] ?? WORK.medium) * (KIND[trackId] ?? 1);
  return ORIENT + words(q.prompt) / READ_WPS + optionWords / (READ_WPS * 1.5) + DECIDE + PER_OPTION * options.length + work;
}

module.exports = { questionSeconds, words, READ_WPS, ORIENT, DECIDE, PER_OPTION, WORK, KIND };
