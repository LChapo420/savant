/**
 * The base-lesson generation prompt.
 *
 * One prompt, for every lesson, in every subject. Everything in the
 * "LESSON INPUT CONFIGURATION" block is read from the curriculum rather than typed
 * in by hand, because a value that is written by hand is a value that is wrong the
 * next time a sheet changes — and the prompt is the only thing standing between a
 * creator's level title and a page of teaching that does not match it.
 *
 * ## The fields, and where each comes from
 *
 *   SUBJECT                the track's own name
 *   TOPIC NAME             the level's title, from the sheet
 *   TOPIC GENERALIZATION   the level's "what it covers", from the sheet — the same
 *                          text, used as the creator intended
 *   TARGET GRADE LEVEL     the grade's band
 *   TARGET AVERAGE AGE     the band's average age, minus two and plus two
 *   LEVEL NUMBER           the level on the path
 *   LESSON SEQUENCE NUMBER the lesson's chronological position in the grade, from 1
 *   PREVIOUS LESSONS       the lesson before it, by title
 *   FUTURE LESSONS         the two lessons after it, by title
 *
 * ## The age rule
 *
 * "Take the average age and minus two and add two." The average has to come from
 * somewhere, so it is read off the year of school the band names: a 9th grader is
 * taken at 14.5, which is the ordinary age for that year. The range is that minus
 * two and plus two, and the halves are kept rather than rounded — the rule says
 * add and subtract, and rounding first would be a second rule nobody asked for.
 * The creator's own worked example is 3rd-4th grade, average 8, range 6-10, and 8
 * is the ordinary age for a 3rd grader, so the same reading reproduces it.
 *
 * ## The base lesson
 *
 * This is the lesson as the course teaches it, with nothing about any particular
 * learner in it. Tailoring it to a learner is a later step, and a later prompt:
 * the page this one produces is the same for everybody who sees it, which is what
 * makes it a baseline to adapt rather than a version to remember.
 */
// This file lives in scripts/lib, so the app's own modules are two levels up. The
// path is built rather than written as a literal so the same require works whether
// this is loaded from the command line or from another module.
const path = require('path');
const curriculum = require(path.join(__dirname, '..', '..', 'config', 'curriculum'));
const LAYOUT = require(path.join(__dirname, '..', '..', 'config', 'level-layout'));

/**
 * The age a year of school is normally taken at, keyed on the year.
 *
 * Whole years, because that is what the creator's own worked example says: a 3rd
 * grader averages 8. The halves I tried first — 8.5, and a 6.5-10.5 range — did
 * not reproduce the example the rule is defined by, and a rule that disagrees with
 * its own example is not the rule. So the average is a whole year and the range
 * comes out whole too, which is the shape every example in the prompt uses
 * ("Ages 10-13", "Ages 14-16", "Ages 16-20").
 *
 * Keyed on the year rather than the grade, so two grades in the same band —
 * Algebra 1 Part A and Part B — are taught to the same children.
 */
const AGE_BY_YEAR = {
  preschool: 3, 'pre-k': 4, kindergarten: 5,
  1: 6, 2: 7, 3: 8, 4: 9, 5: 10, 6: 11, 7: 12, 8: 13,
  9: 14, 10: 15, 11: 16, 12: 17,
  freshman: 18, sophomore: 19, junior: 20, senior: 21,
  graduate: 26, postdoctoral: 31,
};

/**
 * The average age for a grade band, or null when the band does not say.
 *
 * Read from what the band names, in the order the bands are written: the college
 * years first, because "College Junior" contains a year-like number nowhere and
 * would otherwise be read as nothing at all; then the graduate bands; then the
 * school years.
 *
 * A band that matches nothing returns null rather than a guess, because a default
 * age is a number the prompt would state as fact.
 */
function averageAgeForBand(band) {
  const t = String(band || '').toLowerCase();
  for (const word of ['freshman', 'sophomore', 'junior', 'senior']) {
    if (new RegExp(`college\\s+${word}`).test(t)) return AGE_BY_YEAR[word];
  }
  if (/postdoctoral|senior scholar|field leader/.test(t)) return AGE_BY_YEAR.postdoctoral;
  if (/graduate school|graduate core|master|doctoral|phd/.test(t)) return AGE_BY_YEAR.graduate;
  if (/preschool/.test(t)) return AGE_BY_YEAR.preschool;
  if (/pre-?k/.test(t)) return AGE_BY_YEAR['pre-k'];
  if (/kindergarten/.test(t)) return AGE_BY_YEAR.kindergarten;
  const m = /\b(\d{1,2})(?:st|nd|rd|th)\b/.exec(t);
  if (m && AGE_BY_YEAR[Number(m[1])] !== undefined) return AGE_BY_YEAR[Number(m[1])];
  return null;
}

/**
 * The age range a band is taught to: the average, minus two and plus two.
 *
 * Whole years, following the creator's example exactly: 3rd-4th grade averages 8
 * and is taught to ages 6-10. The rule is his, and it is reproduced rather than
 * improved on.
 *
 * @param {string} band the grade's band, e.g. "9th to 10th Grade"
 * @returns {{average: number|null, low: number|null, high: number|null,
 *   text: string}} `text` is ready to drop into the prompt
 */
function ageRangeForBand(band) {
  const average = averageAgeForBand(band);
  if (average === null) {
    return {
      average: null, low: null, high: null,
      text: '[Insert Target Age Range — the band above does not name a school year,'
        + ' so no average age could be read from it]',
    };
  }
  const low = average - 2;
  const high = average + 2;
  return { average, low, high, text: `Ages ${low}-${high}` };
}

/**
 * The subject name as a learner would say it, from the track id.
 *
 * The track ids are the sheet's own (`english`, `reading`, `math`, `act`,
 * `spanish`, `iq`) and the prompt says "English", "Mathematics" — so a rule
 * rather than a lookup table, because a table would need an entry per track and
 * would be missing the next one.
 */
const SUBJECT_NAME = {
  math: 'Mathematics',
  english: 'English',
  reading: 'Reading',
  spanish: 'Spanish',
  iq: 'IQ & Reasoning',
  act: 'ACT Preparation',
};
function subjectName(trackId) {
  return SUBJECT_NAME[trackId]
    || String(trackId || '').charAt(0).toUpperCase() + String(trackId || '').slice(1);
}

/**
 * Every field the prompt needs, read from the curriculum.
 *
 * Refuses a level that is not a lesson. A quiz has no lesson page and a practice
 * level has no lesson content, so asking for one would produce a page teaching
 * something that is not a lesson — and a generated page teaching a Master quiz
 * would be a way to "finish" a quiz by reading about it.
 *
 * @param {string} trackId
 * @param {string} gradeId
 * @param {number} level
 * @returns {object} the filled configuration, including what was found
 * @throws when there is no such level, or it is not a lesson
 */
function lessonConfig(trackId, gradeId, level) {
  const track = curriculum.getTrack(trackId);
  const grade = curriculum.getGrade(trackId, gradeId);
  if (!grade) throw new Error(`no grade ${trackId}/${gradeId}`);

  const entry = LAYOUT.entryFor(grade, level);
  if (!entry) throw new Error(`${grade.id} has no level ${level}`);
  if (entry.kind !== 'lesson') {
    throw new Error(`level ${level} of ${grade.id} is a ${entry.type}, not a lesson —`
      + ' this prompt is for lessons');
  }

  // The lessons in order, and this one's place among them. The sequence number is
  // a *count*, not a level number: a grade's lessons are ten or twenty-five levels
  // apart, so lesson 12 of 61 can sit on level 105.
  const index = LAYOUT.statedIndex(grade);
  const lessons = index
    ? [...index.byLevel.values()].filter((l) => l.kind === 'lesson')
      .sort((a, b) => a.level - b.level)
    : [];
  const at = lessons.findIndex((l) => l.level === level);
  const sequence = at < 0 ? null : at + 1;

  // The band is the part of the name after the dash, which is where the sheet puts
  // the school year. The whole name is kept as a fallback so a band that is not
  // split still produces something the prompt can show rather than nothing.
  const nameParts = String(grade.name).split('—');
  const band = (nameParts.length > 1 ? nameParts.slice(1).join('—') : grade.name).trim();
  const age = ageRangeForBand(band);

  return {
    trackId,
    gradeId: grade.id,
    level,
    isLesson: entry.kind === 'lesson',
    sequence,
    lessonCount: lessons.length,
    subject: subjectName(trackId),
    trackName: track ? track.name : trackId,
    topic: entry.title,
    generalization: entry.covers,
    type: entry.type,
    gradeBand: band,
    age,
    previous: at > 0 ? lessons[at - 1].title : 'None / Foundational',
    future: (at >= 0 ? [lessons[at + 1], lessons[at + 2]] : []).filter(Boolean).map((l) => l.title),
    // The game engine the prompt picks, worked out here so it can be reported
    // rather than left to be read off the model's arithmetic.
    variant: sequence === null ? null : ((sequence - 1) % 20) + 1,
  };
}

module.exports = {
  lessonConfig, ageRangeForBand, averageAgeForBand, subjectName, AGE_BY_YEAR,
};
