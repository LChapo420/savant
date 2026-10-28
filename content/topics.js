/**
 * Which topic does this level teach?
 *
 * `levelPlan` already divides a grade into one band per skill, so a level knows
 * its focus and how far through the grade it is. This turns that into the
 * specific thing being taught: the first lesson in a skill's band takes the first
 * topic on that skill's list, the last takes the last, and the ones between take
 * what is in between, in order.
 *
 * Two deliberate properties:
 *
 * **The last lesson on a skill reaches the last topic.** A learner who finishes
 * the grade has been taught the whole list, in the order it should be taught,
 * and has not been told about anything past the end of the path.
 *
 * **When the list runs out, difficulty carries on instead of inventing a topic.**
 * A skill with six topics and nine lesson levels repeats the sixth and goes
 * harder, which is what a class does when it runs out of new ground. Making up a
 * seventh heading over material that was not written would be worse: it looks
 * like progress and teaches nothing.
 */
const SYLLABUS = require('./syllabus');

// The layout is asked, not restated. This file used to keep its own copy of the
// lesson intervals and its own `isLessonLevel`, written separately to break a
// require cycle — and it had already drifted: it had no grade argument, so it
// said level 25 was not a lesson while the curriculum said it was. Nothing
// failed, because each copy agreed with itself. `config/level-layout.js` has no
// dependency on the curriculum, so there is nothing to break and nothing to
// copy.
const LAYOUT = require('../config/level-layout');

const BY_TRACK = {
  math: SYLLABUS.MATH,
  english: SYLLABUS.ENGLISH,
  iq: SYLLABUS.IQ,
  spanish: SYLLABUS.SPANISH,
  // The ACT tracks are not separate subjects: they are the reading, writing,
  // maths and science of an exam, drawn from the same skills the other tracks
  // teach. Giving them their own lists would mean maintaining a second copy of
  // every rule, and the two copies would drift. So they read the syllabus of the
  // track that owns the material — which is also what a learner should see: the
  // ACT reading section teaches reading, not "ACT reading".
  act: SYLLABUS.ACT,
};

/**
 * The topics a grade teaches, in teaching order.
 *
 * A grade carries its own syllabus when it has one — the sixteen English grades
 * do, from the creator's spreadsheet. Every other grade is built from the
 * per-skill lists in content/syllabus.js, flattened into one list in skill
 * order: the skills are the order the material is taught in, and a grade is one
 * course, not six run end to end.
 *
 * Flattening is what makes "one lesson per topic" achievable at all. Bounding
 * each skill to a slice of the path splits N lessons S ways, so a skill with
 * more than N/S topics can never be given a lesson for every one of them — and
 * the surplus of lessons that would fix it is the repetition this is here to
 * remove. The skill a lesson is about still comes from its topic; it just does
 * not partition anything.
 */
function topicsFor(grade, trackId, skillId) {
  if (Array.isArray(grade.topics) && grade.topics.length) return grade.topics;
  const list = BY_TRACK[trackId];
  if (!list) return [];
  return list[skillId] || [];
}

/**
 * The grade's list of things to be taught, in order.
 *
 * A grade that states its **levels** — the sixteen English grades, whose sheet
 * names every level of the course with a title, a type and what it covers — is
 * served from that. Every level is something to be taught or practised, and its
 * own row is where its title and its coverage come from, so a lesson is titled
 * from the level it is on rather than from a list walked by position.
 *
 * A grade with a plain topic list, and a grade built from per-skill lists, are
 * both flattened into the same shape: a topic list, walked one lesson at a time.
 */
function gradeTopicList(grade, trackId) {
  if (Array.isArray(grade.levels) && grade.levels.length) {
    // IQ CSV rows include activities, reviews, and quizzes between lessons. They
    // are levels on the path, but only lesson rows introduce topics.
    const levels = trackId === 'iq' || trackId === 'spanish'
      ? grade.levels.filter((level) => level.kind === 'lesson')
      : grade.levels;
    // The skill index is counted per skill, not across the grade, because families
    // are per skill: a skill with nine families gives its third topic the third
    // family whichever number that topic happens to be in the grade.
    const seen = new Map();
    return levels.map((l) => {
      const skill = l.skill || grade.skills[0];
      const skillIndex = seen.get(skill) || 0;
      seen.set(skill, skillIndex + 1);
      return {
        topic: l.title,
        covers: l.covers || '',
        skill,
        skillIndex,
        level: Number.isInteger(l.level) ? l.level : null,
        type: l.type || null,
      };
    });
  }
  if (Array.isArray(grade.topics) && grade.topics.length) {
    // The skill index is counted per skill, not across the grade, because
    // families are per skill: a skill with nine families gives its third topic
    // the third family whichever number that topic happens to be in the grade.
    const seen = new Map();
    return grade.topics.map((t) => {
      const skill = t.skill || grade.skills[0];
      const skillIndex = seen.get(skill) || 0;
      seen.set(skill, skillIndex + 1);
      return {
        topic: t.name,
        covers: t.covers || '',
        skill,
        skillIndex,
        level: Number.isInteger(t.level) ? t.level : null,
      };
    });
  }
  const list = BY_TRACK[trackId];
  if (!list) return [];
  const out = [];
  for (const skillId of grade.skills) {
    const own = list[skillId] || [];
    own.forEach((t, i) => {
      out.push(typeof t === 'string'
        ? { topic: t, covers: '', skill: skillId, skillIndex: i }
        : { topic: t.name, covers: t.covers || '', skill: t.skill || skillId, skillIndex: i });
    });
  }
  return out;
}

/**
 * The families a skill's questions come from, in the order its topics run.
 *
 * Loaded by name inside the function rather than at the top, because the family
 * files and this one refer to each other: a family is defined in terms of the
 * topics it is asked about, and requiring it at load time would hand this module
 * a half-built one. The require is cached, so it costs nothing after the first.
 */
function familiesFor(trackId, skillId) {
  if (trackId === 'english') return require('./english-families').FAMILIES[skillId] || [];
  if (trackId === 'spanish') return require('./spanish-families').FAMILIES[skillId] || [];
  if (trackId === 'iq') return require('./iq-families').FAMILIES[skillId] || [];
  return [];
}

/**
 * The family behind a topic, when the bank can name one.
 *
 * A topic is only worth teaching if something can be asked about it. Where a
 * topic maps to a family — a distinct rule with its own question format — the
 * lesson's questions are drawn from that family alone, so the checks really do
 * test what the lesson taught. Where it does not, the checks come from the whole
 * skill, which is the best that can be done without inventing a question format
 * the bank cannot produce.
 */
function familyFor(trackId, skillId, topicIndex) {
  let pool = [];
  if (trackId === 'english') {
    const { FAMILIES } = require('./english-families');
    pool = FAMILIES[skillId] || [];
  } else if (trackId === 'spanish') {
    const { FAMILIES } = require('./spanish-families');
    pool = FAMILIES[skillId] || [];
  } else if (trackId === 'iq') {
    const { FAMILIES } = require('./iq-families');
    pool = FAMILIES[skillId] || [];
  }
  if (!pool.length) return null;
  // The topic's own place in the list, so topic 3 of nine is asked about the
  // third family and not the first — the two walk together by design.
  return pool[Math.max(0, Math.min(pool.length - 1, topicIndex))] || null;
}

/**
 * How many lessons the path holds, and which of them this level is.
 *
 * Always the whole path. A grade is one course, so lesson k of the path teaches
 * topic k of the syllabus; banding this by skill is what left arithmetic
 * reporting sixty-eight lessons while never reaching "GCF and LCM", because every
 * band restarted at topic one and the fractions band ran out of levels before it
 * ran out of topics.
 *
 * The lesson levels are the layout's, not a list built here. That is the whole
 * point of asking one place: a grade whose lessons sit wherever its creator put
 * them is counted the same way as one on the rule, and this function no longer
 * has to know which it is looking at.
 */
function lessonPosition(grade, level) {
  const end = grade.pathLength || 0;
  const total = LAYOUT.lessonCount(grade);
  if (!total) return { index: 0, total: 1 };
  // A level that is not itself a lesson — a practice or checkpoint level —
  // resolves to the last lesson at or before it, so a caller asking on any level
  // still gets the topic in force there.
  let index = -1;
  let seen = 0;
  for (let l = 1; l <= end; l++) {
    if (LAYOUT.kindOf(grade, l, end) !== 'lesson') continue;
    if (l <= level) index = seen;
    seen++;
  }
  return { index: Math.max(0, index), total };
}

/** The index of the last entry at or below `level`; 0 if level precedes them all. */
function lowerBound(sorted, level) {
  let at = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i] <= level) at = i;
  }
  return at;
}

/**
 * The topic for one level, or null if the grade has no syllabus.
 *
 * Two ways to answer, and which one applies is the grade's own business. A grade
 * that states the level of each lesson is read by that level. A grade that does
 * not has its lesson's place on the path read as its place in the topic list,
 * walked one step per lesson. There is no division anywhere: scaling a position
 * by a topic count skips topics whenever the ratio is inexact — fourteen lessons
 * across seventeen topics jumps 0, 1, 2, 3, 4, **6** — and six of the seventeen
 * were then never taught by any lesson, in any grade, with nothing failing. A
 * walk cannot skip, because each step moves at most one place.
 *
 * The skill comes from the topic, not from the level's band. The level's focus
 * skill is still what a question about it is graded under; what it no longer
 * decides is which topics the lesson may reach.
 */
function topicFor(grade, level, skillId, trackId) {
  if (trackId === 'spanish' && Array.isArray(grade.levels) && grade.levels.length) {
    const entry = grade.levels.find((candidate) => candidate.level === level)
      || (level === grade.pathLength ? grade.levels[grade.levels.length - 1] : null);
    if (!entry) return null;
    const list = gradeTopicList(grade, trackId);
    const topic = entry.kind === 'lesson'
      ? list.find((candidate) => candidate.level === entry.level)
      : {
        topic: entry.title,
        covers: entry.covers || '',
        skill: entry.skill || skillId,
        skillIndex: 0,
        level: entry.level,
        type: entry.type || null,
      };
    return topic ? describe(topic, grade, list, level, skillId, trackId) : null;
  }
  if (trackId === 'iq' && Array.isArray(grade.levels) && grade.levels.length) {
    const entry = grade.levels.find((candidate) => candidate.level === level);
    const lessons = grade.levels.filter((candidate) => candidate.kind === 'lesson');
    const mostRecent = lessons.filter((candidate) => candidate.level <= level).at(-1)
      || lessons[0];
    // IQ quiz rows keep their own labels. Every other level follows the lesson
    // most recently taught, including activities and review levels between lessons.
    const chosen = entry && (entry.kind === 'master' || entry.kind === 'grand')
      ? entry
      : mostRecent;
    if (!chosen) return null;
    const list = gradeTopicList(grade, trackId);
    const topic = list.find((candidate) => candidate.level === chosen.level) || {
      topic: chosen.title,
      covers: chosen.covers || '',
      skill: chosen.skill || skillId,
      skillIndex: 0,
      level: chosen.level,
      type: chosen.type || null,
    };
    const described = describe(topic, grade, list, level, skillId, trackId);
    if (entry && (entry.kind === 'master' || entry.kind === 'grand')) {
      const lessonIndex = list.findIndex((candidate) => candidate.level === mostRecent.level);
      return {
        ...described,
        index: lessonIndex,
        next: list[lessonIndex + 1] || null,
      };
    }
    return described;
  }
  const list = gradeTopicList(grade, trackId);
  if (!list.length) return null;

  // A grade whose lessons state their level is looked up by that level, not by
  // position. The English sheet gives all 1,144 of its lessons an explicit level
  // and they are not every tenth one: it runs 10, 20, 25, 30, 40, 50, 60, 70,
  // 75, 80, 90, 100 — the 25s and 75s are lessons and 26, 51 and 76 are the
  // Master quizzes. A lesson that took "the nth lesson teaches the nth topic"
  // would answer 25 with the fourth topic, because the quizzes between them are
  // not lessons and do not advance the count. Reading the level is the only way
  // to get the topic the creator put there.
  const stated = statedTopicAt(grade, list, level);
  if (stated) return describe(stated, grade, list, level, skillId, trackId);

  // A grade that does not say walks its own list, one step per lesson. The
  // position is the whole path's, so a lesson k teaches topic k and the levels
  // between keep practising it. There is no division anywhere: scaling a position
  // by a topic count skips topics whenever the ratio is inexact — fourteen
  // lessons across seventeen topics jumps 0, 1, 2, 3, 4, **6** — and six of the
  // seventeen were then never taught by any lesson, in any grade, with nothing
  // failing.
  const { index, total } = lessonPosition(grade, level);
  return describe(
    list[Math.min(list.length - 1, index)], grade, list, level, skillId, trackId,
  );
}

/**
 * The topic a level names, if the grade says so.
 *
 * Exact match first, then the topic in force at that level: the levels between
 * two lessons are the practice of the lesson before them, so a level the sheet
 * does not name still has to answer with something. Returns null when the grade
 * states no levels at all, which is the signal to fall back to walking.
 */
function statedTopicAt(grade, list, level) {
  if (!list.every((t) => Number.isInteger(t.level) && t.level > 0)) return null;
  const exact = list.find((t) => t.level === level);
  if (exact) return exact;
  let before = null;
  for (const t of list) {
    if (t.level > level) break;
    before = t;
  }
  return before;
}

/** The shape every topic answer takes, whoever chose the topic. */
function describe(chosen, grade, list, level, skillId, trackId) {
  // A skill repeated in a grade's list is taught once, but the topics after it
  // are not the first ones again: each entry remembers which skill it came from
  // and how many of that skill's topics precede it, so its family is chosen from
  // its own list rather than from the grade's.
  const ownIndex = chosen.skillIndex != null ? chosen.skillIndex : 0;
  return {
    topic: chosen.topic,
    covers: chosen.covers,
    skill: chosen.skill || skillId,
    index: list.indexOf(chosen),
    of: list.length,
    level: chosen.level || null,
    // The last lesson in the path teaches the last topic, so "what comes next"
    // has an answer for every lesson that is not that one.
    next: list[list.indexOf(chosen) + 1] || null,
    family: familyFor(trackId, chosen.skill || skillId, ownIndex),
  };
}

/** Every topic a grade teaches, in the order it teaches them. */
function gradeOutline(grade, trackId) {
  return gradeTopicList(grade, trackId);
}

/** Every topic a grade teaches, in the order it teaches them. */
function gradeOutline(grade, trackId) {
  return gradeTopicList(grade, trackId);
}

/**
 * The family a topic is asked through.
 *
 * The index is the topic's place among the *skill's own* topics, not among the
 * grade's, because families are per skill: a skill with nine families gives its
 * third topic the third family, whichever number it happens to be in the grade.
 */
function familyFor(trackId, skillId, topicIndex) {
  const pool = familiesFor(trackId, skillId);
  if (!pool.length) return null;
  // The topic's own place in the list, so topic 3 of nine is asked about the
  // third family and not the first — the two walk together by design.
  return pool[Math.max(0, Math.min(pool.length - 1, topicIndex))] || null;
}

module.exports = {
  topicFor, topicsFor, familyFor, familiesFor, lessonPosition, gradeOutline,
  gradeTopicList, BY_TRACK,
};
