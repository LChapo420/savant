/**
 * Goal fit for the main Spanish path: which levels come next and which
 * activities a level holds, decided from the learner's stated goal
 * (services/goals.js) by fixed rules. Nothing here calls a model, so every
 * decision can be read back and explained. The rules are written out for
 * people in docs/spanish-replica/GOAL-FIT.md; scripts/spanish-path-test.js
 * checks the two agree on the examples given there.
 *
 * Four profiles:
 *   sprint        a goal with a date within 14 days (SPRINT_DAYS), other than a
 *                 test goal: conversation's rules, plus more type-what-you-hear
 *                 and what-does-this-mean listening in every recipe, and the
 *                 learner's review queue first in every session.
 *   conversation  "Speak and understand everyday Spanish, fast", "Just the
 *                 essentials", or a typed goal about talking / days / impressive
 *                 progress. Highest-frequency words first, listening and
 *                 speaking weighted up, enrichment and long writing put aside.
 *   test          "Prepare for a test": every level kept; reading, typing
 *                 and listening weighted up.
 *   standard      anything else, or no goal: the curriculum order and a
 *                 balanced mix.
 *
 * A level put aside is not removed. The path steps over it, it is marked
 * "saved for later" on the path page, and it stays open to the learner.
 */
const goals = require('../goals');

/** Words in a typed goal that mean "conversation, soon". Matched case-insensitively. */
const CONVERSATION_WORDS = [
  'convers', 'speak', 'talk', 'chat', 'fluent', 'travel', 'trip', 'vacation', 'holiday',
  'everyday', 'survive', 'survival', 'impress', 'progress', 'fast', 'quick', 'days', 'week',
  'listen', 'understand', 'hablar', 'conversación',
];

const PROFILES = {
  conversation: {
    id: 'conversation',
    label: 'Conversation, fast',
    why: 'Your goal is to talk soon, so the most-used words and phrases come first, with more listening and speaking. Culture, long writing and extra pronunciation levels are saved for later.',
  },
  sprint: {
    id: 'sprint',
    label: 'Sprint to your date',
    why: 'Your date is close, so every session starts with what is due for review, then the most-used words and phrases, with extra listening and typing what you hear. Culture, long writing and extra pronunciation levels are saved for later.',
  },
  test: {
    id: 'test',
    label: 'Preparing for a test',
    why: 'Your goal is a test, so every level stays in order, with more reading, typing and listening checks.',
  },
  standard: {
    id: 'standard',
    label: 'Following the course',
    why: 'Levels follow the course order with a balanced mix of activities. Set a goal to tune it.',
  },
};

/**
 * Does the Spanish goal fit apply to this account? The owner's account gets
 * the base product under services/goals.js (OWNER_BASE). A goal the learner
 * picked and can see on the path is their own choice rather than a hidden
 * change, so Spanish applies it to every account unless
 * SPANISH_GOAL_FIT=respect-owner-base (then it follows goals.applies), and
 * SPANISH_GOAL_FIT=off turns it off for everyone.
 */
function appliesTo(userId) {
  const mode = String(process.env.SPANISH_GOAL_FIT || 'on').trim().toLowerCase();
  if (mode === 'off') return false;
  if (mode === 'respect-owner-base') return goals.applies(userId);
  return !!userId;
}

/** A date this close (days from today, inclusive) makes the goal a sprint. */
const SPRINT_DAYS = 14;

/** Profiles that walk the path the way `conversation` does. */
const CONVERSATION_LIKE = new Set(['conversation', 'sprint']);

/** The profile a goal row maps to (a goal view from goals.forGrade, or null). */
function profileOfGoal(goal) {
  if (!goal || !goal.choice) return 'standard';
  if (goal.choice !== 'test' && Number.isFinite(goal.days_left) && goal.days_left >= 0 && goal.days_left <= SPRINT_DAYS) return 'sprint';
  if (goal.choice === 'conversation' || goal.choice === 'essentials') return 'conversation';
  if (goal.choice === 'test') return 'test';
  if (goal.choice === 'specific') {
    const t = String(goal.text || '').toLowerCase();
    if (CONVERSATION_WORDS.some((w) => t.includes(w))) return 'conversation';
  }
  return 'standard';
}

/**
 * The learner's profile on a Spanish grade.
 * @returns {{id: string, label: string, why: string, goal: object|null}}
 */
function profileFor(userId, gradeId) {
  const goal = userId ? goals.forGrade(userId, 'spanish', gradeId) : null;
  const id = appliesTo(userId) ? profileOfGoal(goal) : 'standard';
  return { ...PROFILES[id], goal };
}

// Level types that are always walked: the checks that place, gate and review.
const NEVER_DEFER = new Set(['Placement Test/Entry Check', 'Preview/Unit Intro', 'Quiz/Unit Check', 'Test/Checkpoint', 'Final Test/Final']);
// Put aside for the conversation profile, by Level Type / Activity.
const DEFER_TYPES = new Set([
  'Writing/Writing Lab', 'Essay/Writing Lab', 'Translating/Mediation Task', 'Project/Grade Project',
  'Live Speaking/Live Conversation', 'Real-World Mission/Mission', 'Reading/Reading Block', 'Pronunciation/Sound Refresh',
]);

/**
 * Why a level is put aside for this profile, or null when it is walked.
 * @param {object} row a level row of content/spanish-grades.js
 * @param {object} grade the grade (its levels)
 * @param {string} profileId
 */
function deferReason(row, grade, profileId) {
  if (!CONVERSATION_LIKE.has(profileId) || !row) return null;
  const key = `${row.type}/${row.activity}`;
  if (NEVER_DEFER.has(key)) return null;
  const last = grade.levels[grade.levels.length - 1];
  if (last && last.level === row.level) return null;
  const path = String(row.path || '');
  if (path === 'Enrichment') return 'Enrichment (culture and extras)';
  if (path === 'Optional unit') return 'Optional in the course';
  if (/^Domain/i.test(path)) return 'A specialist domain';
  if (DEFER_TYPES.has(key)) return `${row.activity} (long-form practice)`;
  if (key === 'Pronunciation/Topic') {
    // The first pronunciation level of a unit stays; the deeper ones wait.
    const first = grade.levels.find((l) => l.unit === row.unit && l.type === 'Pronunciation' && l.activity === 'Topic');
    if (first && first.level !== row.level) return 'Extra pronunciation detail';
  }
  return null;
}

/** Every level a profile puts aside on a grade: Map level -> reason. */
function deferredLevels(grade, profileId) {
  const out = new Map();
  if (!grade || !CONVERSATION_LIKE.has(profileId)) return out;
  for (const row of grade.levels) {
    const why = deferReason(row, grade, profileId);
    if (why) out.set(row.level, why);
  }
  return out;
}

/**
 * The next level to stand on from `next`, stepping over levels this profile
 * puts aside. Called by services/learner-path.js nextLevelAfter for Spanish.
 */
function stepOverDeferred(enrollment, grade, next) {
  if (!enrollment || enrollment.track_id !== 'spanish' || !grade || !Array.isArray(grade.levels)) return next;
  const profile = profileFor(enrollment.user_id, enrollment.grade_id);
  if (!CONVERSATION_LIKE.has(profile.id)) return next;
  const deferred = deferredLevels(grade, profile.id);
  let at = next;
  const max = grade.pathLength || grade.levels.length;
  while (deferred.has(at) && at < max) at += 1;
  return at;
}

/**
 * The activity recipe for a slot under a profile: an ordered list of item
 * kinds. `new` kinds use a phrase being introduced, `old` a phrase being
 * recycled (due reviews first), `any` either. The table is GOAL-FIT.md's.
 */
const RECIPES = {
  standard: {
    vocabulary: ['intro:new', 'intro:new', 'intro:new', 'select_meaning:new', 'match_pairs:any', 'listen_choose:new', 'select_translation:old', 'translate_es:new', 'translate_en:new', 'fill_choice:unit', 'tap_heard:any', 'speak:new', 'type_heard:old', 'translate_en:old'],
    grammar: ['intro:new', 'intro:new', 'select_meaning:new', 'fill_choice:unit', 'fill_choice:unit', 'translate_es:new', 'translate_en:new', 'complete_translation:new', 'match_pairs:any', 'complete_chat:unit', 'translate_en:old', 'speak:new'],
    listening: ['listen_choose:new', 'listen_meaning:new', 'listen_choose:new', 'listen_image:any', 'listen_meaning:old', 'tap_heard:new', 'listen_choose:old', 'tap_heard:old', 'type_heard:new', 'listen_meaning:any', 'type_heard:old'],
    speaking: ['intro:new', 'speak:new', 'speak:new', 'listen_choose:new', 'speak:new', 'complete_chat:unit', 'speak:old', 'speak:any', 'tap_heard:new', 'speak:old'],
    pronunciation: ['sound_tip:unit', 'minimal_pair:unit', 'speak:new', 'listen_choose:any', 'speak:new', 'minimal_pair:unit', 'speak:old', 'type_heard:any', 'speak:any'],
    reading: ['read_respond:unit', 'select_meaning:new', 'read_respond:unit', 'complete_chat:unit', 'select_translation:new', 'fill_choice:unit', 'translate_es:any', 'select_meaning:old', 'read_respond:unit', 'match_pairs:any'],
    writing: ['translate_en:new', 'complete_translation:new', 'type_heard:new', 'translate_en:old', 'complete_translation:old', 'type_heard:any', 'translate_en:any', 'fill_choice:unit'],
    review: ['select_meaning:old', 'listen_choose:old', 'translate_en:old', 'tap_heard:old', 'speak:old', 'match_pairs:old', 'type_heard:old', 'translate_es:old', 'listen_meaning:old', 'fill_choice:unit', 'select_translation:old', 'type_heard:old'],
  },
  conversation: {
    vocabulary: ['intro:new', 'intro:new', 'intro:new', 'listen_choose:new', 'select_meaning:new', 'speak:new', 'match_pairs:any', 'tap_heard:new', 'listen_meaning:old', 'speak:old', 'complete_chat:unit', 'type_heard:new', 'translate_es:any', 'speak:any'],
    grammar: ['intro:new', 'intro:new', 'listen_choose:new', 'speak:new', 'complete_chat:unit', 'fill_choice:unit', 'tap_heard:new', 'listen_meaning:old', 'speak:old', 'type_heard:new', 'translate_es:any', 'speak:any'],
    listening: ['listen_choose:new', 'listen_meaning:new', 'tap_heard:new', 'listen_choose:old', 'type_heard:new', 'listen_image:any', 'listen_meaning:old', 'speak:new', 'tap_heard:old', 'type_heard:old', 'listen_meaning:any', 'type_heard:any'],
    speaking: ['intro:new', 'listen_choose:new', 'speak:new', 'speak:new', 'complete_chat:unit', 'tap_heard:new', 'speak:old', 'listen_meaning:old', 'speak:any', 'type_heard:any', 'speak:old'],
    pronunciation: ['sound_tip:unit', 'minimal_pair:unit', 'speak:new', 'listen_choose:any', 'speak:old', 'type_heard:any', 'speak:any'],
    reading: ['select_meaning:new', 'read_respond:unit', 'complete_chat:unit', 'listen_meaning:new', 'speak:new', 'read_respond:unit', 'type_heard:any', 'select_meaning:old', 'speak:old'],
    writing: ['tap_heard:new', 'type_heard:new', 'translate_en:new', 'speak:new', 'type_heard:old', 'complete_translation:any', 'speak:old'],
    review: ['listen_choose:old', 'speak:old', 'listen_meaning:old', 'tap_heard:old', 'type_heard:old', 'select_meaning:old', 'speak:old', 'match_pairs:old', 'type_heard:old', 'listen_choose:old', 'speak:old', 'translate_es:old'],
  },
  test: {
    vocabulary: ['intro:new', 'intro:new', 'intro:new', 'select_meaning:new', 'select_translation:new', 'translate_es:new', 'translate_en:new', 'match_pairs:any', 'fill_choice:unit', 'type_heard:new', 'complete_translation:old', 'translate_en:old', 'listen_meaning:any', 'translate_es:old'],
    grammar: ['intro:new', 'intro:new', 'fill_choice:unit', 'fill_choice:unit', 'complete_translation:new', 'translate_en:new', 'translate_es:new', 'select_translation:old', 'complete_chat:unit', 'translate_en:old', 'type_heard:any'],
    listening: ['listen_choose:new', 'listen_meaning:new', 'type_heard:new', 'tap_heard:new', 'listen_image:any', 'listen_meaning:old', 'type_heard:old', 'listen_choose:old', 'type_heard:any', 'listen_meaning:any'],
    speaking: ['intro:new', 'speak:new', 'listen_choose:new', 'speak:new', 'complete_chat:unit', 'translate_en:new', 'speak:old', 'type_heard:any', 'speak:any'],
    pronunciation: ['sound_tip:unit', 'minimal_pair:unit', 'speak:new', 'listen_choose:any', 'minimal_pair:unit', 'type_heard:any', 'speak:any'],
    reading: ['read_respond:unit', 'select_meaning:new', 'read_respond:unit', 'select_translation:new', 'fill_choice:unit', 'complete_chat:unit', 'translate_es:any', 'read_respond:unit', 'select_meaning:old', 'translate_es:old'],
    writing: ['translate_en:new', 'complete_translation:new', 'type_heard:new', 'translate_en:old', 'complete_translation:old', 'type_heard:any', 'translate_en:any', 'fill_choice:unit'],
    review: ['select_meaning:old', 'translate_en:old', 'type_heard:old', 'complete_translation:old', 'listen_choose:old', 'translate_es:old', 'select_translation:old', 'fill_choice:unit', 'type_heard:old', 'listen_meaning:old', 'translate_en:old', 'match_pairs:old'],
  },
};

/**
 * How many new phrases a level introduces, and in what order the unit's
 * phrases are taken: the conversation profile takes the most frequent first
 * (tier 1, then 2, then 3), the others keep the unit's written order.
 */
function orderPhrases(phrases, profileId) {
  if (!CONVERSATION_LIKE.has(profileId)) return phrases;
  return phrases.map((p, i) => ({ p, i })).sort((a, b) => (a.p.tier || 2) - (b.p.tier || 2) || a.i - b.i).map((x) => x.p);
}

/**
 * The sprint recipe for a slot: the conversation recipe with the learner's
 * review queue first (two steps drawing on due phrases) and two more hearing
 * steps at the end. Built from RECIPES.conversation so the two never drift.
 */
RECIPES.sprint = Object.fromEntries(Object.entries(RECIPES.conversation).map(([slot, steps]) => [
  slot,
  ['listen_meaning:old', 'type_heard:old', ...steps, 'listen_meaning:any', 'type_heard:any'],
]));

function recipe(profileId, slot) {
  const table = RECIPES[profileId] || RECIPES.standard;
  return table[slot] || RECIPES.standard[slot] || RECIPES.standard.vocabulary;
}

/** Recycled share target: how many of a run's items reuse earlier phrases. */
function recycleShare(profileId) {
  return profileId === 'sprint' ? 0.5 : profileId === 'conversation' ? 0.4 : 0.3;
}

module.exports = {
  PROFILES, CONVERSATION_WORDS, SPRINT_DAYS, CONVERSATION_LIKE, RECIPES, NEVER_DEFER, DEFER_TYPES,
  appliesTo, profileOfGoal, profileFor, deferReason, deferredLevels, stepOverDeferred,
  orderPhrases, recipe, recycleShare,
};
