/**
 * Goal-shaped unit order for the subjects that have a unit plan (everything but
 * Spanish, which has its own rules in services/spanish/goal-fit.js).
 *
 * The path works the units to learn first and then the ones not proved yet, in
 * level order (services/learner-path.js unitsToWork). When the learner's goal
 * text names skills ("fractions", "quadratic equations"), units whose titles
 * or question skills match those words move to the front of their group. The
 * match is on words only: no model, so a reorder can always be explained.
 *
 * Nothing is hidden. A unit that is moved back is still on the path and every
 * level stays open; a goal with no matching words leaves the order untouched,
 * and so does the owner's account (the base product, services/goals.js).
 */
const goals = require('./goals');

// Words that say what kind of goal it is, not what skill it names.
const STOP = new Set([
  'about', 'after', 'again', 'also', 'before', 'being', 'better', 'class', 'could', 'every', 'exam', 'finish', 'from', 'good',
  'have', 'into', 'just', 'learn', 'level', 'like', 'make', 'more', 'most', 'much', 'need', 'next', 'only', 'over', 'prepare',
  'ready', 'really', 'score', 'some', 'something', 'stuff', 'test', 'than', 'that', 'their', 'them', 'then', 'there', 'these',
  'this', 'topic', 'want', 'week', 'weeks', 'what', 'when', 'will', 'with', 'work', 'would', 'year', 'your',
]);

/** The words of a goal worth matching: lower case, 4+ letters, no filler, a trailing plural s dropped. */
function keywords(text) {
  const out = new Set();
  for (const w of String(text || '').toLowerCase().split(/[^a-z]+/)) {
    if (w.length < 4 || STOP.has(w)) continue;
    out.add(w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);
  }
  return [...out];
}

/** How many goal words a unit's titles and question skills contain. */
function scoreUnit(unit, words) {
  if (!unit || !words.length) return 0;
  const hay = [...(unit.titles || []), ...(unit.questions || []).map((q) => q.skill || '')].join(' ').toLowerCase();
  return words.filter((w) => hay.includes(w)).length;
}

/**
 * `indexes` (unit indexes in level order) with the units the goal names first.
 * Stable: equal scores keep their level order. Returns the same array when
 * nothing applies.
 */
function order(enrollment, units, indexes) {
  if (!enrollment || !enrollment.user_id || enrollment.track_id === 'spanish' || indexes.length < 2) return indexes;
  if (!goals.applies(enrollment.user_id)) return indexes;
  const goal = goals.forEnrollment(enrollment);
  const words = goal ? keywords(goal.text) : [];
  if (!words.length) return indexes;
  const scored = indexes.map((i, at) => ({ i, at, s: scoreUnit(units[i], words) }));
  if (!scored.some((x) => x.s > 0)) return indexes;
  return scored.sort((a, b) => b.s - a.s || a.at - b.at).map((x) => x.i);
}

/** The units a goal text puts first on a grade, for the goal card: [{ key, title }] or []. */
function named(enrollment, units) {
  if (!units) return [];
  const goal = enrollment && enrollment.user_id ? goals.forEnrollment(enrollment) : null;
  const words = goal ? keywords(goal.text) : [];
  return units.filter((u) => scoreUnit(u, words) > 0).slice(0, 5).map((u) => ({ key: u.key, title: (u.titles || [])[0] || u.key }));
}

module.exports = { keywords, scoreUnit, order, named };
