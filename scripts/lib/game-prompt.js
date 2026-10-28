/**
 * The one prompt that writes a game's questions.
 *
 * Every game level asks for its questions the same way: this template, filled
 * from the curriculum and the level's own row, sent as a single call. The fill-out
 * sections are the ones the game system was specified with:
 *
 *   {{SUBJECT}}                  {{GRADE}}                {{AVERAGE_AGE}}
 *   {{TOPIC}}                    {{LAST_LESSON_TOPIC}}    {{LAST_LESSON_SUMMARY}}
 *   {{PREVIOUS_LESSONS_SUMMARY}} {{FUTURE_LESSONS_PREVIEW}}
 *   {{GAME_MECHANIC_REQUIREMENTS}}
 *
 * The lesson neighbours come from `config/level-layout.js` and, where a generated
 * lesson page exists, from the `summary` its metadata carries — falling back to
 * the sheet's own "what it covers" line. Nothing here talks to a model or a
 * database: it is the fill-in, so it can be read and tested on its own.
 */
const curriculum = require('../../config/curriculum');
const LAYOUT = require('../../config/level-layout');
const lessonPrompt = require('./lesson-prompt');

/** How many lessons back and forward the context looks. */
const WINDOW = 3;

function entryText(grade, level) {
  const entry = LAYOUT.entryFor(grade, level) || {};
  return {
    level,
    title: String(entry.title || `Level ${level}`),
    covers: String(entry.covers || '').slice(0, 240),
    kind: LAYOUT.kindOf(grade, level, grade.pathLength),
  };
}

/**
 * The summary of one lesson: the summary its generated page recorded, or the
 * sheet's own words about it.
 */
function lessonSummary(trackId, gradeId, grade, level) {
  let meta = null;
  try {
    meta = require(`../../content/base-lessons/${trackId}/${gradeId}/level-${level}.html.meta.json`);
  } catch { /* no generated page for this lesson — the sheet is enough */ }
  const entry = entryText(grade, level);
  return {
    level,
    title: (meta && meta.topic) || entry.title,
    summary: (meta && meta.summary) || (meta && meta.generalization) || entry.covers,
  };
}

/** The lessons before `level`, newest first, up to WINDOW. */
function previousLessons(trackId, gradeId, grade, level) {
  const out = [];
  let at = LAYOUT.previousLesson(grade, level);
  while (at && out.length < WINDOW) {
    out.push(lessonSummary(trackId, gradeId, grade, at));
    at = LAYOUT.previousLesson(grade, at);
  }
  return out;
}

/** The lessons after `level`, soonest first, up to WINDOW. */
function futureLessons(trackId, gradeId, grade, level) {
  const out = [];
  let at = LAYOUT.nextLesson(grade, level);
  while (at && out.length < WINDOW) {
    out.push(entryText(grade, at));
    at = LAYOUT.nextLesson(grade, at + 1);
  }
  return out;
}

/**
 * What the engine needs from the questions, as prose the model can follow.
 *
 * Built from the engine's own question schema so the two cannot drift: the schema
 * is the machine-readable form, this is the same facts in the prompt.
 */
function mechanicRequirements(schema) {
  const d = (schema.difficultyScale || {});
  return [
    `Exactly ${schema.questionCount} questions.`,
    `Each question has exactly ${schema.choicesPerQuestion} answer choices, one correct.`,
    `Difficulty: ${d.label || schema.difficulty || 'medium'} — aim at ${d.start} to ${d.end} of 10 throughout.`,
    schema.requiresExplanation ? 'Every question carries a one-sentence explanation of the answer.' : '',
    schema.requiresTopicTag ? 'Every question names the topic of the level it tests in `topic`, and the skill in `skill`.' : '',
    `Difficulty markers per question: a whole number 1-10, inside the range above.`,
    schema.distractorRules ? `Wrong options: ${schema.distractorRules}` : '',
    'Plain text only — no HTML, no markdown, no quotation marks around whole options.',
    'Questions are written for this exact level and topic: the activity the level names, at the age given.',
  ].filter(Boolean).join('\n');
}

/**
 * The full prompt pair for one level's game.
 *
 * @param {string} trackId @param {string} gradeId @param {number} level
 * @param {{questionCount: number, choicesPerQuestion: number, difficultyScale: object,
 *          requiresExplanation?: boolean, requiresTopicTag?: boolean,
 *          distractorRules?: string, mechanic?: string}} schema the engine's question schema
 */
function buildGamePrompt(trackId, gradeId, level, schema) {
  const track = curriculum.getTrack(trackId);
  const grade = curriculum.getGrade(trackId, gradeId);
  const at = entryText(grade, level);
  const age = lessonPrompt.ageRangeForBand(grade.name.includes('—') ? grade.name.split('—')[1].trim() : grade.name);
  const last = previousLessons(trackId, gradeId, grade, level)[0] || null;
  const earlier = previousLessons(trackId, gradeId, grade, level).slice(1);
  const future = futureLessons(trackId, gradeId, grade, level);

  const system = `You write the questions for an educational game level. The game's mechanics are fixed and the questions you write are played inside it, so they must fit the level exactly and read well one after another.

Rules:

- Every question has exactly one defensible answer, decided by the question alone. No trick questions, no "all of the above", no answer that depends on an unstated convention.
- The wrong options are as good as the right one to somebody who does not know the material: the same kind of thing, the same units, the same part of speech, the same level of detail and the same length shape. An absurd or vaguer option can be eliminated without knowing anything, and the game becomes guessable.
- Do not repeat anything: not a phrasing, not a fact, not an example. The questions are played one after another and a learner will notice.
- Write for the level's own topic and the age given. The level is a serious piece of work, not a quiz on its title.
- Decide the correct option first, write the explanation about that option, then set answerIndex to its position (0-based). The explanation describes the option at answerIndex, never another one. (An audit of earlier games found 119 questions whose explanation described the right option while answerIndex pointed at a wrong one.)
- The options are all different texts: never the same option twice, even with different capitals.
- If two options could be defended (a comma splice is also a run-on; a dash both adds emphasis and sets off extra information), rewrite the options until exactly one is right. No question rests on a false premise.
- Plain text only.

Reply only through the tool.`;

  const user = [
    `SUBJECT: ${lessonPrompt.subjectName(trackId)}`,
    `GRADE: ${grade.name}`,
    `AVERAGE AGE: ${age.text}${age.average !== null ? ` (average ${age.average})` : ''}`,
    `LEVEL: ${level} of ${grade.pathLength} — ${at.kind}`,
    '',
    `TOPIC: ${at.title}`,
    `WHAT THE LEVEL COVERS: ${at.covers || '(the sheet does not say)'}`,
    '',
    'LAST LESSON TOPIC:',
    last ? `  ${last.title} (level ${last.level})` : '  (this is the first lesson of the grade)',
    'LAST LESSON SUMMARY:',
    last ? `  ${last.summary || '(no summary recorded)'}` : '  (none)',
    '',
    'PREVIOUS LESSONS SUMMARY:',
    earlier.length ? earlier.map((l) => `  - ${l.title} (level ${l.level}): ${l.summary || '(no summary recorded)'}`).join('\n') : '  (none before the last lesson)',
    '',
    'FUTURE LESSONS PREVIEW:',
    future.length ? future.map((l) => `  - ${l.title} (level ${l.level}): ${l.covers || ''}`).join('\n') : '  (none — this is the end of the grade)',
    '',
    'GAME MECHANIC REQUIREMENTS:',
    mechanicRequirements(schema),
    schema.mechanic ? `\nHOW THE GAME PLAYS: ${schema.mechanic}` : '',
    '',
    `Write the ${schema.questionCount} questions now, in play order, and use the game's own shape: { title, questions: [{ id, prompt, choices, answerIndex, explanation, difficulty, skill, topic }], feedback: { correct, incorrect, win, lose } }.`,
  ].join('\n');

  return { system, user, context: { topic: at.title, covers: at.covers, kind: at.kind, age, last, earlier, future } };
}

module.exports = { buildGamePrompt, mechanicRequirements, previousLessons, futureLessons };
