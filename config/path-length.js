/**
 * How long a path is, given what it has to hold.
 *
 * A path's length used to be *derived* by solving for it: the app guessed a
 * length, counted how many lessons that length held under the level rule, and
 * kept the shortest one holding a lesson per topic. That is four hundred guesses
 * per grade at boot, and it only means anything when the rule is regular — which
 * is the thing a stated layout is not.
 *
 * A grade that states its levels already knows: the path runs to the highest
 * level it states, plus the graduation exam. That is the whole calculation, and
 * it lives here so every grade's length comes from one place rather than from a
 * guess about a rule.
 *
 * A grade with no stated levels is still solved for, because the rule it is on
 * gives nothing to solve from — the lesson count and the length are both
 * arithmetic, and neither can be found from the other without trying. That is a
 * fallback for a grade not yet given a layout, and it stops being needed as
 * grades arrive with one.
 *
 * The dependency runs one way: this file asks config/level-layout.js how many
 * lessons a grade holds, and never the reverse. The layout does not know how long
 * a path is, because a stated list makes the question unnecessary.
 *
 * `topicCount` lives here rather than in the layout because it is a property of
 * a syllabus, not of a layout — and because a stated grade does not need it.
 */
const layout = require('./level-layout');

const DEFAULTS = { minPath: 50, maxPath: 4000 };

/**
 * The length this grade's path should be.
 *
 * A stated layout first, then the solved fallback for a grade with none.
 *
 * @param {object} opts
 * @param {object} opts.grade the grade
 * @param {number} [opts.topicCount] how many topics it has to teach, for the
 *   fallback only
 * @returns {number} a level count
 */
function forGrade({ grade, topicCount } = {}) {
  if (!grade) return DEFAULTS.minPath;
  if (layout.isStated(grade)) {
    return layout.endOf(grade) + 1;
  }
  return solvedLength(grade, topicCount || 0);
}
/**
 * The shortest length whose lesson count reaches the topic count.
 *
 * Every length is tried, not every checkpoint: a grade with thirty-three topics
 * reaches thirty-three lessons somewhere between two checkpoints, and stepping to
 * the next one overshoots by a lesson or two. Exact means exact, so the count is
 * asked of the layout rather than estimated here.
 */
function solvedLength(grade, wanted) {
  const { minPath, maxPath } = DEFAULTS;
  if (!wanted) return minPath;
  for (let length = minPath; length <= maxPath; length++) {
    // The trial length is passed as the end, so "beyond the end is the
    // graduation exam" answers correctly for each guess. A grade on the rule has
    // no length of its own until this loop finds one.
    if (countLessons(grade, length) >= wanted) return length;
  }
  // A grade wanting more lessons than a path this long can hold. The cap is a
  // limit the length states rather than a silent drop: a grade is never quietly
  // given fewer lessons than topics, because the syllabus is the promise and a
  // topic with no lesson is a topic nobody is taught.
  return maxPath;
}

function countLessons(grade, length) {
  let count = 0;
  for (let l = 1; l < length; l++) {
    if (layout.kindOf(grade, l, length) === 'lesson') count++;
  }
  return count;
}

/**
 * How many topics this grade has to teach, however it records them.
 *
 * A grade with its own syllabus counts it directly. A grade whose skills each
 * hold a list has its topics added up across the skills — *not* de-duplicated by
 * name. Spanish's `-ar` and `-er/-ir` skills both list "Choosing the ending" and
 * those are two different lessons on two different conjugations, taught in two
 * different places. Counting them once gave fifty-three topics fifty lessons and
 * left three topics with no lesson, which is the thing this count exists to
 * prevent.
 */
function topicCount(grade, trackId, topics) {
  if (Array.isArray(grade.topics) && grade.topics.length) return grade.topics.length;
  let total = 0;
  for (const skillId of grade.skills) total += topics.topicsFor(grade, trackId, skillId).length;
  return total;
}

/**
 * Give every grade on every track its path length.
 *
 * Called once by curriculum.js after the tracks are declared: a length depends on
 * the grade's topics, and a grade that cannot answer that question yet has none.
 */
function assignPathLengths(tracks, topics) {
  for (const track of tracks) {
    for (const grade of track.grades) {
      grade.pathLength = forGrade({
        grade, topicCount: topicCount(grade, track.id, topics),
      });
    }
  }
  return tracks;
}

module.exports = { forGrade, assignPathLengths, topicCount, DEFAULTS };
