/**
 * What each level of a grade is, and where the next one of each kind is.
 *
 * This module is the answer to one question — "what is level N of this grade?" —
 * and every other part of the app asks it here rather than working it out. The
 * layout used to be arithmetic on the level number, and the arithmetic was
 * written out in **four** places:
 *
 *   config/curriculum.js  levelKind(level, pathLength, grade)
 *   content/topics.js     isLessonLevel(level, pathLength)      a second copy
 *   services/mastery.js   level % GRAND_EVERY, level % MASTER_EVERY
 *   public/js/path.js     master_every * Math.ceil(level / master_every)
 *
 * The second copy had drifted from the first — it had no grade argument, so it
 * said level 25 was not a lesson while the curriculum said it was — and the
 * fourth had drifted further, rounding up to a multiple of 25 and so naming the
 * wrong level for every English grade. Nothing failed, because each copy was
 * internally consistent; the page just said things the server disagreed with.
 *
 * So the layout is *stated* rather than computed. A grade that has a list of
 * levels is described by it; a grade that has none is described by the rule,
 * which lives here once and is the only place it is written down. When a CSV
 * arrives with a level, a title and a type for every level of every grade, it
 * fills in the stated side of this and the rule is used for nothing.
 *
 * ## What a stated level can say
 *
 * `kind` is open. It is not an enum this file checks against, because the whole
 * point is that a grade's author may name a kind this file has never heard of.
 * A kind the app has no behaviour for is still a level: it is served, named,
 * shown in the path, and counted. It simply gets the default behaviour, which is
 * the behaviour of a practice level — questions, no pass mark, no retry. A new
 * kind can never become a dead level that silently refuses to render.
 *
 * Kinds with behaviour of their own:
 *
 *   lesson      a teaching block, not questions
 *   practice    questions at the level's difficulty
 *   master      a Master quiz
 *   grand       a Grand Master quiz
 *   graduation  the exam that certifies the track
 *   essay       a written checkpoint, on a track whose Master is written
 *
 * The last four are *checkpoints*: a pass mark, an attempt, a retry. That set is
 * what `isCheckpoint` answers, and it is the only place the app decides which
 * levels can fail.
 *
 * This module does not know how a path's length is worked out — that is
 * config/path-length.js, and it asks *this* module how many lessons a grade has,
 * so the dependency runs one way. A grade that states its levels takes its length
 * from the list; a grade on the rule has one solved for, because a length is a
 * number this module cannot invent for a rule that is itself arithmetic.
 */
const DEFAULTS = { minPath: 50, maxPath: 4000 };

/**
 * The arithmetic fallback, written once.
 *
 * Only used for a grade with no stated levels. It is not the curriculum's
 * policy any more — it is the shape the app had before a grade could state its
 * own layout, kept so that a new grade with nothing declared behaves the way the
 * others always have, rather than having to be taught the rule.
 */
const DEFAULT_RULE = { lessonEvery: 10, masterEvery: 25, grandEvery: 100 };

/** The kinds that can fail, and so own a pass mark, an attempt and a retry. */
const CHECKPOINT_KINDS = new Set(['master', 'grand', 'graduation', 'essay']);

/** What a level is called, by kind. A kind not here is titled by its own title. */
const DEFAULT_LABELS = {
  master: 'Master quiz',
  grand: 'Grand Master quiz',
  graduation: 'Graduation exam',
  essay: 'Essay',
  grand_essay: 'Grand Master essay',
};

const isCheckpoint = (kind) => CHECKPOINT_KINDS.has(kind);

/**
 * The stated levels of a grade, or null when it has none.
 *
 * A grade states its levels in one of two places, and both are read, because a
 * level list is a different thing from a syllabus and a creator will reach for
 * whichever they have:
 *
 *   `grade.levels`  the general form: every level, with a kind and a title. This
 *                   is where a new CSV belongs — a layout is a layout, and no
 *                   topic list is needed to say that level 41 is a lesson.
 *   `grade.topics`  the sixteen English grades, whose topics each carry the level
 *                   they were taught on. Every one of those levels is a lesson
 *                   and the levels between them are the rule's, so a grade in
 *                   this form states its lessons without stating its quizzes.
 *
 * So a grade with topics-that-carry-levels is *partly* stated, and the layout
 * says so: those levels are taken from the list and everything else falls to the
 * rule. That is what a mixed grade is — a lesson at 25 with a quiz on 26 from the
 * rule — and it is the shape the English grades have always had.
 *
 * Cached on the grade, because this is asked once per level per request and
 * rebuilding the index every time is a few thousand allocations before the first
 * response is sent. A grade with nothing stated answers null every time, which is
 * the signal to fall back to the rule alone.
 */
function statedIndex(grade) {
  if (!grade) return null;
  if (grade._layoutIndex !== undefined) return grade._layoutIndex;

  const rows = statedRows(grade);
  if (!rows) {
    grade._layoutIndex = null;
    return null;
  }

  const byLevel = new Map();
  const lessons = [];
  const checkpoints = [];
  let lastLevel = 0;
  for (const row of rows) {
    const level = Number(row.level);
    if (!Number.isFinite(level)) continue;
    byLevel.set(level, row);
    if (level > lastLevel) lastLevel = level;
    if (isCheckpoint(row.kind)) checkpoints.push(row);
    else if (row.kind === 'lesson') lessons.push(row);
  }
  lessons.sort((a, b) => a.level - b.level);
  checkpoints.sort((a, b) => a.level - b.level);
  grade._layoutIndex = {
    byLevel,
    lessons,
    checkpoints,
    first: lessons[0] || null,
    last: lessons[lessons.length - 1] || null,
    lastLevel,
  };
  return grade._layoutIndex;
}

/**
 * A grade's stated levels, normalised, or null when it states none.
 *
 * @param {object} grade
 * @returns {Array<{level: number, kind: string, title: string, covers: string,
 *   topic: string, skill: string|null}>|null}
 */
function statedRows(grade) {
  const fromLevels = normalise(grade.levels);
  if (fromLevels) return fromLevels;
  return normalise(gradedTopics(grade));
}

function normalise(raw) {
  if (!Array.isArray(raw) || !raw.length) return null;
  const out = [];
  for (const row of raw) {
    if (!row) continue;
    const level = Number(row.level);
    if (!Number.isFinite(level) || level < 1) continue;
    const title = row.title ? String(row.title) : '';
    out.push({
      level,
      // `type` and `kind` both spell it, because a CSV header is written by
      // hand and either word is the obvious one to reach for.
      kind: String(row.kind || row.type || 'practice'),
      // The course's own word for the level — Tester, Lesson, Activity, Summary,
      // Master Quiz, Essay Draft — kept separately from `kind`, which is what the
      // app *does*. The page says the first and behaves on the second, and
      // dropping the first made every level on a sheet-backed path read "Practice".
      type: row.type ? String(row.type) : '',
      title,
      covers: row.covers ? String(row.covers) : '',
      topic: row.topic ? String(row.topic) : title,
      skill: row.skill || null,
      columns: row.columns && typeof row.columns === 'object' ? row.columns : null,
    });
  }
  return out.length ? out : null;
}

/**
 * A grade whose topics each name the level they are taught on.
 *
 * Every such level is a lesson, and that is not an assumption: the topic list is
 * the lesson list. The quizzes between them are not stated here, so the rule
 * supplies them — which is the arrangement the English grades already had, and
 * which a CSV naming every level explicitly will replace.
 */
function gradedTopics(grade) {
  if (!Array.isArray(grade.topics) || !grade.topics.length) return null;
  const rows = [];
  for (const t of grade.topics) {
    if (!t || !Number.isInteger(t.level) || t.level < 1) continue;
    rows.push({
      level: t.level,
      kind: t.kind || t.type || 'lesson',
      title: t.name || t.title || '',
      covers: t.covers || '',
      topic: t.name || t.title || '',
      skill: t.skill || null,
    });
  }
  return rows.length ? rows : null;
}

/** Does this grade state its own levels, rather than using the rule? */
function isStated(grade) {
  return statedIndex(grade) !== null;
}

/**
 * What level N of this grade is.
 *
 * A stated level wins. A level the list does not mention falls to the rule, which
 * is what makes a *partly* stated grade work: the English grades state their
 * lessons — every topic carries the level it is taught on — and the rule supplies
 * the quizzes between them. A CSV that states every level makes the rule
 * unreachable for that grade, and nothing has to change here when it arrives.
 *
 * A level beyond the end of a rule-shaped path is the graduation exam, which is
 * true either way: nothing else is out there.
 *
 * @param {object} grade
 * @param {number} level
 * @param {number} [length] the end of a rule-shaped path
 * @returns {string} a kind
 */
function kindOf(grade, level, length) {
  const stated = statedIndex(grade);
  if (stated) {
    const found = stated.byLevel.get(Number(level));
    if (found) return found.kind;
    const end = length != null ? length : (grade && grade.pathLength);
    if (end != null && level >= end) return 'graduation';
    // A grade whose every level is named is finished at that: a level it does not
    // name is one it does not have, and answering with the rule would invent
    // levels the creator never wrote.
    if (fullyStated(grade)) return 'practice';
  }
  const end = length != null ? length : (grade && grade.pathLength);
  if (end != null && level >= end) return 'graduation';
  return ruleKind(level, stated && quizzesFollowLessons(grade));
}

/**
 * The arithmetic fallback, written once.
 *
 * There are two shapes in it, and which one a grade gets was decided before
 * there was a fallback to decide between — by its lessons. A grade that puts a
 * lesson on 25 is a grade whose quizzes are on 26, 51, 76; a grade that does not
 * is a grade whose quizzes are on 25, 50, 75 with the lesson after. Nothing
 * else distinguishes them, and both are read off the same levels.
 *
 * A path opens on **level 1 as a lesson**, and then every tenth level after it.
 * It used to open on level 10 with levels 1 to 9 as practice, which meant every
 * course in the app began with nine levels of questions before anything was
 * taught — and a learner who opens a path at level 1 sees a run of practice with
 * no lesson in it. The first thing a course does should be a lesson. A grade that
 * names its own levels says where its first lesson is, and the sheet puts it at
 * 10; the fallback has to agree, or the two layouts would open differently.
 *
 * @param {number} level
 * @param {boolean} quizzesFollowLessons whether this grade's lessons sit on the
 *   round number, which puts the quiz on the level after
 * @returns {string} a kind
 */
function ruleKind(level, quizzesFollowLessons) {
  const { lessonEvery, masterEvery, grandEvery } = DEFAULT_RULE;
  // Level 1 teaches. `1 % grandEvery === 1` is why the quizzes below are guarded
  // on `level > 1` — without it level 1 would be a Grand Master, and a learner who
  // has done nothing does not start on the exam.
  if (level === 1) return 'lesson';
  if (quizzesFollowLessons) {
    if (level % grandEvery === 1) return 'grand';
    if (level % masterEvery === 1) return 'master';
    if (level % lessonEvery === 0) return 'lesson';
    return 'practice';
  }
  if (level % grandEvery === 0) return 'grand';
  if (level % masterEvery === 0) return 'master';
  if (level % lessonEvery === 0) return 'lesson';
  const previous = level - 1;
  if (previous > 0 && (previous % masterEvery === 0 || previous % grandEvery === 0)) return 'lesson';
  return 'practice';
}

/**
 * Does this grade put its lessons on the round number?
 *
 * Read off its own lessons rather than declared, because a layout that is
 * arriving in a CSV should not have to also answer this: a grade whose lessons
 * are 10, 20, 25, 30 is plainly the "+1" shape, and one whose lessons are 10, 20,
  30, 40 is plainly the other. A grade with a lesson on a level ending in a five
 * has quizzes that follow its lessons; a grade without one has quizzes that
 * precede them.
 */
function quizzesFollowLessons(grade) {
  const stated = statedIndex(grade);
  if (!stated) return false;
  for (const l of stated.lessons) {
    if (l.level % 10 !== 0) return true;
  }
  return false;
}

/** Everything said about one level, or null when the grade does not state it. */
function entryFor(grade, level) {
  const stated = statedIndex(grade);
  if (!stated) return null;
  return stated.byLevel.get(Number(level)) || null;
}

/**
 * The next level at or after `level` that is a lesson, or null.
 *
 * A grade whose levels are *all* stated is answered from its list alone. One
 * whose lessons are only partly stated — the English grades, whose topics each
 * carry a level — is answered from the list and then from the rule, because the
 * rule still places the quizzes in its gaps.
 *
 * A grade on the rule walks, and walks the whole path rather than a fixed
 * window — the old code looked twelve levels ahead on the assumption that lessons
 * were ten apart, and a grade whose lessons were further apart silently stopped
 * prefetching them.
 */
function nextLesson(grade, level) {
  const end = (grade && grade.pathLength) || 0;
  const stated = statedIndex(grade);
  if (stated) {
    const at = stated.lessons.findIndex((l) => l.level >= level);
    if (at >= 0) return stated.lessons[at].level;
    // Nothing stated ahead of here. For a fully-stated grade that is the end of
    // the line; for a partly-stated one the rule may still put a lesson further
    // on, so fall through and let it answer.
    if (fullyStated(grade)) return null;
  }
  for (let l = level; l <= end; l++) {
    if (kindOf(grade, l, end) === 'lesson') return l;
  }
  return null;
}

/**
 * Does this grade name every level it has?
 *
 * A layout that stops naming levels is either complete — the list *is* the
 * layout, and nothing the rule would say may be added to it — or partial, where
 * the rule fills the gaps. Which of the two is decided by where the list came
 * from, not by counting:
 *
 *   `grade.levels`  a layout. It is the whole of what this grade has, and the
 *                   rule is not consulted for it at all.
 *   `grade.topics`  a syllabus whose topics happen to carry levels. It states
 *                   the *lessons*; the quizzes between them are the rule's, and
 *                   the rule has to keep filling those gaps.
 *
 * That is the whole distinction, and it is why a CSV that names every level needs
 * no further work: it lands in `grade.levels` and the rule steps aside.
 */
function fullyStated(grade) {
  return Array.isArray(grade.levels) && grade.levels.length > 0;
}

/**
 * The level after `level` that this grade actually has, or null.
 *
 * For a stated grade it is the next number in its list. For a grade on the rule
 * it is one higher, because the rule holds every number.
 *
 * This is what "the next level" means when a layout may skip numbers. A streak
 * that counts consecutive levels has to ask rather than add one, or a learner who
 * cleared level 7 and then level 20 — because 8 to 19 are not levels this course
 * has — would lose a run they had not broken.
 *
 * @param {object} grade
 * @param {number} level
 * @returns {number|null}
 */
function nextLevelAfter(grade, level) {
  const stated = statedIndex(grade);
  if (stated) {
    const levels = [...new Set([
      ...[...stated.byLevel.keys()],
      // The rule's own levels are still real on a partly-stated grade, and the
      // gap between two stated ones can hold a quiz the rule placed.
      ...[...Array(Math.max(0, (stated.lastLevel || 0) + 1)).keys()].map((i) => i + 1),
    ])].sort((a, b) => a - b);
    const at = levels.findIndex((l) => l > level);
    return at < 0 ? null : levels[at];
  }
  return level + 1;
}

/** The lesson before `level`, or null when `level` is the first one. */
function previousLesson(grade, level) {
  if (isStated(grade)) {
    const stated = statedIndex(grade);
    let found = null;
    for (const l of stated.lessons) {
      if (l.level >= level) break;
      found = l.level;
    }
    return found;
  }
  let found = null;
  for (let l = 1; l < level; l++) {
    if (kindOf(grade, l, level) === 'lesson') found = l;
  }
  return found;
}

/**
 * The last level a topic is practised on: the level before the next lesson.
 *
 * Where a grade has no further lesson, the end of the path — so the sentence on
 * the lesson can say "levels 40 to 118 practise this" without a special case at
 * the last one.
 */
function practiceUntil(grade, level) {
  const end = (grade && grade.pathLength) || 0;
  const next = nextLesson(grade, level + 1);
  if (next == null) return end;
  return next - 1;
}

/** Every level of one kind at or after `from`, in order. */
function levelsOfKind(grade, kind, from) {
  const out = [];
  if (fullyStated(grade)) {
    for (const e of statedIndex(grade).byLevel.values()) {
      if (e.kind === kind && e.level >= from) out.push(e.level);
    }
    return out.sort((a, b) => a - b);
  }
  const end = (grade && grade.pathLength) || 0;
  for (let l = from; l <= end; l++) if (kindOf(grade, l, end) === kind) out.push(l);
  return out;
}

/** The next level of one kind at or after `level`, or null. */
function nextOfKind(grade, kind, level) {
  if (fullyStated(grade)) {
    const all = [...statedIndex(grade).byLevel.values()];
    const at = all.findIndex((e) => e.kind === kind && e.level >= level);
    if (at >= 0) return all[at].level;
    if (kind === 'graduation' && grade.trackId === 'spanish'
      && grade.pathLength >= level) {
      return grade.pathLength;
    }
    return null;
  }
  const end = (grade && grade.pathLength) || 0;
  for (let l = level; l <= end; l++) if (kindOf(grade, l, end) === kind) return l;
  return null;
}

/** The next checkpoint of any kind at or after `level`, or null. */
function nextCheckpoint(grade, level) {
  if (fullyStated(grade)) {
    const at = statedIndex(grade).checkpoints.findIndex((e) => e.level >= level);
    if (at >= 0) return statedIndex(grade).checkpoints[at].level;
    if (grade.trackId === 'spanish' && grade.pathLength >= level) return grade.pathLength;
    return null;
  }
  const end = (grade && grade.pathLength) || 0;
  for (let l = level; l <= end; l++) {
    if (isCheckpoint(kindOf(grade, l, end))) return l;
  }
  return null;
}

/** How many lessons the grade has. */
function lessonCount(grade) {
  if (fullyStated(grade)) return statedIndex(grade).lessons.length;
  const end = (grade && grade.pathLength) || 0;
  let n = 0;
  for (let l = 1; l < end; l++) if (kindOf(grade, l, end) === 'lesson') n++;
  return n;
}

/**
 * A level a learner can be placed on: one that teaches rather than tests.
 *
 * Placement rounds a difficulty to a level, and a level that is a quiz is one the
 * learner has to pass having just been given it by a quiz rather than taught it.
 * A stated grade answers by looking for the nearest level that is a lesson; a
 * grade on the rule rounds down a ten at a time, which is the shape it has always
 * had.
 */
function roundToPlacement(grade, level, length) {
  const end = length != null ? length : (grade && grade.pathLength);
  if (end == null) return Math.max(1, level);
  const at = Math.max(1, Math.min(end - 1, level));
  // Nearest lesson at or below the level, so a placement lands where the learner
  // is about to be taught rather than on a quiz they have not been prepared for,
  // and not on a bare practice level either.
  for (let l = at; l >= 1; l--) {
    if (kindOf(grade, l, end) === 'lesson') return l;
  }
  // Ahead, for a grade whose first lesson is above where the difficulty put the
  // learner — better a lesson slightly further on than a practice block at the
  // start of the path.
  for (let l = at + 1; l <= end - 1; l++) {
    if (kindOf(grade, l, end) === 'lesson') return l;
  }
  return at;
}

/**
 * The last level of a grade, which is the graduation exam unless the grade says
 * otherwise.
 *
 * A stated grade ends where its list ends. The rule ends at `pathLength`, which
 * is derived from the grade's own lesson count — see config/path-length.js.
 */
function endOf(grade) {
  const stated = statedIndex(grade);
  if (stated) return stated.lastLevel;
  return (grade && grade.pathLength) || 0;
}

module.exports = {
  // The one answer.
  kindOf, ruleKind, entryFor, isCheckpoint, isStated, statedIndex,
  quizzesFollowLessons,
  // Walking a stated list, falling back to the rule for the gaps.
  nextLesson, previousLesson, nextOfKind, nextCheckpoint, levelsOfKind,
  nextLevelAfter, lessonCount, practiceUntil, endOf, roundToPlacement,
  // What a kind is called.
  labelFor: (kind) => DEFAULT_LABELS[kind] || '',
  DEFAULT_RULE, CHECKPOINT_KINDS, DEFAULT_LABELS, DEFAULTS,
};