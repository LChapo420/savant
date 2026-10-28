/**
 * The curriculum is data, not code: tracks, the grades a learner can enroll in,
 * and the skills each grade is made of. Phase 10 hands this file to a content
 * team and moves it into the database; nothing else in the app needs to change,
 * because every other module reads it through the helpers at the bottom.
 *
 * A grade is a path of `pathLength` levels. Levels are not hand-authored: each
 * level maps onto a focus skill and a difficulty derived from how far along the
 * path it sits, which is what lets five tracks cover 250 levels each without
 * 1,250 hand-written lesson plans.
 *
 * `tier` (1–5) is the learner's claimed depth. It sets how long the placement
 * quiz is, and placement always ends a band above the tier so the ceiling gets
 * probed rather than assumed.
 */

/**
 * The English grades, from the creator's spreadsheet.
 *
 * Sixteen grades and 755 topics, each with a description of what it covers. The
 * data is generated into `content/english-grades.js` so the sheet stays the one
 * place it is edited; this only reshapes it for the curriculum.
 *
 * A grade's `skills` is the set of skills its own topics name, in the order they
 * first appear, so the grade's bands follow its syllabus rather than an
 * alphabetical list. A topic naming no skill falls back to the first skill the
 * grade does use, because a grade with no skills has no bands and therefore no
 * levels at all.
 */
const { GRADES: ENGLISH_GRADES } = require('../content/english-grades');
const { GRADES: READING_GRADES } = require('../content/reading-grades');
const { GRADES: MATH_GRADES } = require('../content/math-grades');
const { GRADES: IQ_GRADES } = require('../content/iq-grades');
const { GRADES: SPANISH_GRADES } = require('../content/spanish-grades');
const { GRADES: ACT_GRADES } = require('../content/act-grades');
const { GRADES: CHESS_GRADES } = require('../content/chess-grades');
const { GRADES: PIANO_GRADES } = require('../content/piano-grades');
const { GRADES: BASKETBALL_GRADES } = require('../content/basketball-grades');
const GRADE_SKILLS = require('./grade-skills');

function englishGrades() {
  return sheetGrades(ENGLISH_GRADES, DEFAULT_ENGLISH_SKILLS, null, 'english');
}

/**
 * The Math grades, from the creator's Math spreadsheet.
 *
 * Forty-nine grades and 28,780 levels, from Sense of Quantity in preschool to
 * Setting the Agenda of a Field as a senior scholar — generated into
 * `content/math-grades.js` by `npm run build:math` and read the same way as the
 * other two sheets.
 *
 * These replace the four rule-shaped grades the track used to have, which had no
 * sheet behind them. See the note on the track itself for what happened to the
 * enrollments that pointed at them.
 */
function mathGrades() {
  return sheetGrades(MATH_GRADES, DEFAULT_MATH_SKILLS, null, 'math');
}

/**
 * The Reading grades, from the creator's second spreadsheet.
 *
 * Sixteen grades, 6,578 levels, and the same shape as the English sheet: every
 * level is named, with a type, a title and what it covers, and levels run 1 to N
 * with nothing missing. It is generated into `content/reading-grades.js` by
 * `npm run build:reading`, and `config/level-layout.js` answers every question
 * about a Reading level from it — so a level the sheet wrote is a level the app
 * serves, with the creator's own words on it.
 *
 * Reading is a separate track from English rather than more English grades, and
 * the difference is what gets asked. English asks about the craft of writing and
 * about language; Reading asks what a text says, why it says it, and how a reader
 * gets there. So it gets its own track, its own sheet and its own questions, and
 * the two sit side by side on the dashboard.
 */
function readingGrades() {
  return sheetGrades(READING_GRADES, DEFAULT_READING_SKILLS, null, 'reading');
}

/** The IQ grades are the twelve level columns in data/IQ_Levels_Topics.csv. */
function iqGrades() {
  return sheetGrades(IQ_GRADES, DEFAULT_IQ_SKILLS);
}

/**
 * Reshape a sheet's grades for the curriculum.
 *
 * Both tracks come out of a creator spreadsheet and come in the same form, so
 * this is the one place either of them is reshaped. A grade's `skills` is the set
 * of skills its own levels name, in the order they first appear, so the grade's
 * bands follow its sheet rather than an alphabetical list; a level naming no skill
 * falls back to the track's defaults, because a grade with no skills has no bands
 * and therefore no levels at all.
 */
function sheetGrades(rows, fallbackSkills, trackId, fitTrack) {
  return rows.map((g, index) => {
    // Grade-fit (GRADE_SKILLS=on): the sheet's keyword tags re-pointed at the
    // bank skills that fit this grade, so a preschool grade cannot be served
    // linear equations nor a doctoral one phonics. See config/grade-skills.js.
    const fit = GRADE_SKILLS.remap(fitTrack || trackId, index, g, fallbackSkills);
    const skills = fit ? fit.skills : (g.skills.length ? g.skills : fallbackSkills);
    return {
      id: g.id,
      trackId: trackId || null,
      heading: g.heading,
      name: g.name,
      tier: g.tier,
      blurb: g.blurb,
      skills,
      // The layout, carried through whole: every level of the grade with the
      // title its author gave it, what it covers, its type, and the skill its
      // questions come from. `config/level-layout.js` answers "what is level N of
      // this grade" from this and nothing else, so a level the sheet named is a
      // level the app serves.
      //
      // It used to be `topics: g.topics` — a syllabus rather than a layout — and
      // when the sheet changed to name every level the grade silently stopped
      // being stated: `levels` came through as `undefined`, the layout fell back
      // to the arithmetic rule, and the second-grade path was solved to 1,431
      // levels for a grade the sheet says has 555. Nothing failed, because the
      // fallback is a working layout of the wrong one.
      levels: fit ? fit.levels : g.levels,
    };
  });
}

// Used only by a grade whose levels name no skill, which is a sign the mapping
// missed something rather than that the grade is unteachable. A grade that does
// have no skills at all is a bug in the generator, and this is what it looks like
// while it is still one.
const DEFAULT_ENGLISH_SKILLS = ['parts_of_speech', 'sentence_struct', 'punctuation_basic', 'vocab_context'];

// The same idea, for Reading: the early material is decoding and the rest is
// comprehension, so a fallback that starts in phonics does not hand a
// graduate-level level a question about letter sounds.
const DEFAULT_READING_SKILLS = ['phonics', 'main_idea', 'detail_support', 'inference', 'vocab_context'];

// The generator assigns every IQ row to one of these existing question families;
// this fallback keeps older generated files usable while the CSV is rebuilt.
const DEFAULT_IQ_SKILLS = [
  'number_series', 'letter_series', 'verbal_analogy', 'odd_one_out',
  'matrix_pattern', 'logic_deduction', 'syllogism', 'code_cipher',
  'numeric_reason', 'spatial_reason', 'working_memory',
];

const DEFAULT_SPANISH_SKILLS = [
  'es_greetings', 'es_vocab_core', 'es_gender', 'es_numbers', 'es_present_ar',
  'es_present_erir', 'es_ser_estar', 'es_questions', 'es_adjectives',
  'es_translate', 'es_preterite', 'es_imperfect', 'es_object_pron', 'es_subjunctive',
];

// And for Chess, in the order a learner meets them.
const DEFAULT_CHESS_SKILLS = [
  'chess_board', 'chess_moves', 'chess_material', 'chess_mate', 'chess_tactics', 'chess_notation',
  'chess_endgame', 'chess_opening', 'chess_strategy', 'chess_practical',
];

// And for Piano, in the order a learner meets them.
const DEFAULT_PIANO_SKILLS = [
  'piano_keyboard', 'piano_reading', 'piano_rhythm', 'piano_terms', 'piano_intervals', 'piano_keys',
  'piano_scales', 'piano_chords', 'piano_technique', 'piano_repertoire',
];

// And for Basketball, in the order a learner meets them.
const DEFAULT_BASKETBALL_SKILLS = [
  'bb_skills', 'bb_court', 'bb_rules', 'bb_health', 'bb_tactics', 'bb_mental', 'bb_stats', 'bb_history',
];

// And for Math. Counted in the order a course meets them — counting, place value,
// the four operations, then the shapes of algebra and geometry — so a grade whose
// own levels name no skill still has bands in the order a learner walks them. The
// twenty-four are every math skill the bank has, so a fallback can stand in for
// any of them.
const DEFAULT_MATH_SKILLS = [
  'add_sub', 'mul_div', 'integers', 'order_ops', 'fractions', 'decimals', 'percents',
  'ratios', 'exponents', 'geometry_area', 'slope_lines', 'trig_basics', 'linear_eq',
  'inequalities', 'systems', 'quadratics', 'polynomials', 'rational_expr', 'functions',
  'logs', 'sequences', 'complex_nums', 'word_problems', 'act_data',
];

const SKILLS = {
  // ── Mathematics ──────────────────────────────────────────────────────────
  add_sub:        { name: 'Addition and subtraction', formats: ['type_in', 'multiple_choice'] },
  mul_div:        { name: 'Multiplication and division', formats: ['type_in', 'multiple_choice'] },
  fractions:      { name: 'Fractions', formats: ['type_in', 'multiple_choice'] },
  decimals:       { name: 'Decimals', formats: ['type_in', 'multiple_choice'] },
  percents:       { name: 'Percents', formats: ['type_in', 'multiple_choice'] },
  word_problems:  { name: 'Word problems', formats: ['type_in'] },
  integers:       { name: 'Signed numbers', formats: ['type_in', 'multiple_choice'] },
  order_ops:      { name: 'Order of operations', formats: ['type_in'] },
  exponents:      { name: 'Exponents and roots', formats: ['type_in', 'multiple_choice'] },
  ratios:         { name: 'Ratios and proportions', formats: ['type_in'] },
  linear_eq:      { name: 'Linear equations', formats: ['type_in', 'multiple_choice'] },
  inequalities:   { name: 'Inequalities', formats: ['multiple_choice'] },
  slope_lines:    { name: 'Slope and lines', formats: ['type_in', 'multiple_choice'] },
  systems:        { name: 'Systems of equations', formats: ['type_in'] },
  quadratics:     { name: 'Quadratics', formats: ['type_in', 'multiple_choice'] },
  geometry_area:  { name: 'Area, perimeter, and volume', formats: ['type_in'] },
  polynomials:    { name: 'Polynomial arithmetic', formats: ['multiple_choice', 'type_in'] },
  functions:      { name: 'Functions and notation', formats: ['type_in', 'multiple_choice'] },
  logs:           { name: 'Exponentials and logarithms', formats: ['type_in', 'multiple_choice'] },
  sequences:      { name: 'Sequences and series', formats: ['type_in'] },
  rational_expr:  { name: 'Rational expressions', formats: ['multiple_choice'] },
  complex_nums:   { name: 'Complex numbers', formats: ['type_in', 'multiple_choice'] },
  trig_basics:    { name: 'Right-triangle trigonometry', formats: ['type_in', 'multiple_choice'] },
  // Grade-fit skills (2026-10-24): the early and late ends of the track. Which
  // grade may use each is config/grade-skills.js; generators in math-grade-items.js.
  counting:         { name: 'Counting and comparing', formats: ['type_in', 'multiple_choice'] },
  facts_within_20:  { name: 'Addition and subtraction within 20', formats: ['type_in'] },
  shapes:           { name: 'Shapes, patterns and comparing', formats: ['multiple_choice', 'type_in'] },
  place_value:      { name: 'Place value', formats: ['type_in', 'multiple_choice'] },
  measurement:      { name: 'Money, time and measurement', formats: ['type_in', 'multiple_choice'] },
  data_stats:       { name: 'Data and statistics', formats: ['type_in'] },
  calculus:         { name: 'Calculus', formats: ['type_in', 'multiple_choice'] },
  linear_algebra:   { name: 'Linear algebra', formats: ['type_in'] },
  probability:      { name: 'Probability and counting', formats: ['type_in'] },
  discrete_math:    { name: 'Discrete mathematics and logic', formats: ['type_in', 'multiple_choice'] },
  abstract_algebra: { name: 'Abstract algebra', formats: ['type_in', 'multiple_choice'] },
  analysis:         { name: 'Real and complex analysis', formats: ['type_in', 'multiple_choice'] },
  topology:         { name: 'Topology', formats: ['type_in', 'multiple_choice'] },

  // ── English ──────────────────────────────────────────────────────────────
  parts_of_speech:   { name: 'Parts of speech', formats: ['multiple_choice'] },
  // Decoding and spelling: the preschool and early-reader half of the English
  // track, which the first sixteen grades of the creator's sheet are mostly made
  // of. Multiple choice because the answer is always a named letter or sound.
  phonics:           { name: 'Phonics, decoding and spelling', formats: ['multiple_choice'] },
  subject_verb:      { name: 'Subject-verb agreement', formats: ['multiple_choice'] },
  punctuation_basic: { name: 'End punctuation and capitals', formats: ['multiple_choice'] },
  sentence_struct:   { name: 'Fragments and run-ons', formats: ['multiple_choice'] },
  pronoun_case:      { name: 'Pronouns', formats: ['multiple_choice'] },
  verb_tense:        { name: 'Verb tense and form', formats: ['multiple_choice'] },
  comma_use:         { name: 'Commas', formats: ['multiple_choice'] },
  apostrophes:       { name: 'Apostrophes and possessives', formats: ['multiple_choice'] },
  modifiers:         { name: 'Modifiers and parallelism', formats: ['multiple_choice'] },
  word_choice:       { name: 'Commonly confused words', formats: ['multiple_choice'] },
  transitions:       { name: 'Transitions and logic', formats: ['multiple_choice'] },
  vocab_context:     { name: 'Vocabulary in context', formats: ['multiple_choice'] },
  main_idea:         { name: 'Main idea and summary', formats: ['multiple_choice'] },
  inference:         { name: 'Inference', formats: ['multiple_choice'] },
  author_purpose:    { name: 'Author purpose and tone', formats: ['multiple_choice'] },
  detail_support:    { name: 'Supporting detail', formats: ['multiple_choice'] },
  // Grade-fit skills (2026-10-24), in content/english-grade-items.js.
  early_literacy:      { name: 'Letters, sounds and books', formats: ['multiple_choice', 'type_in'] },
  early_comprehension: { name: 'Understanding short texts', formats: ['multiple_choice'] },
  literary_analysis:   { name: 'Literary analysis and theory', formats: ['multiple_choice'] },
  academic_writing:    { name: 'Research, sources and argument', formats: ['multiple_choice'] },
  linguistics:         { name: 'Linguistics', formats: ['multiple_choice'] },

  // ── IQ training ──────────────────────────────────────────────────────────
  number_series:   { name: 'Number series', formats: ['type_in'] },
  letter_series:   { name: 'Letter series', formats: ['type_in'] },
  verbal_analogy:  { name: 'Verbal analogies', formats: ['multiple_choice'] },
  odd_one_out:     { name: 'Odd one out', formats: ['multiple_choice'] },
  matrix_pattern:  { name: 'Matrix patterns', formats: ['multiple_choice'] },
  logic_deduction: { name: 'Deductive puzzles', formats: ['multiple_choice'] },
  syllogism:       { name: 'Syllogisms', formats: ['multiple_choice'] },
  numeric_reason:  { name: 'Numerical reasoning', formats: ['type_in'] },
  code_cipher:     { name: 'Codes and ciphers', formats: ['type_in'] },
  spatial_reason:  { name: 'Spatial reasoning', formats: ['multiple_choice'] },
  working_memory:  { name: 'Working memory', formats: ['type_in'] },

  // ── ACT-specific ─────────────────────────────────────────────────────────
  act_rhetoric:    { name: 'Rhetorical skills', formats: ['multiple_choice'] },
  act_data:        { name: 'Charts, tables, and rates', formats: ['type_in', 'multiple_choice'] },
  act_science:     { name: 'Scientific reasoning', formats: ['multiple_choice'] },

  // ── Spanish ──────────────────────────────────────────────────────────────
  es_greetings:    { name: 'Greetings and courtesy', formats: ['multiple_choice', 'type_in'] },
  es_vocab_core:   { name: 'Core vocabulary', formats: ['multiple_choice', 'type_in'] },
  es_gender:       { name: 'Gender and articles', formats: ['multiple_choice'] },
  es_numbers:      { name: 'Numbers and time', formats: ['type_in'] },
  es_present_ar:   { name: 'Present tense: -ar verbs', formats: ['type_in'] },
  es_present_erir: { name: 'Present tense: -er and -ir verbs', formats: ['type_in'] },
  es_ser_estar:    { name: 'Ser and estar', formats: ['multiple_choice'] },
  es_questions:    { name: 'Questions and negation', formats: ['multiple_choice', 'type_in'] },
  es_adjectives:   { name: 'Adjective agreement', formats: ['multiple_choice'] },
  es_translate:    { name: 'Translation', formats: ['short_answer'] },
  es_preterite:    { name: 'Preterite past tense', formats: ['type_in'] },
  es_imperfect:    { name: 'Imperfect past tense', formats: ['type_in'] },
  es_object_pron:  { name: 'Object pronouns', formats: ['multiple_choice'] },
  es_subjunctive:  { name: 'Present subjunctive', formats: ['type_in', 'multiple_choice'] },
  // Grade-fit skills for B2 to C2 (2026-10-24), in content/spanish-grade-items.js.
  es_adv_grammar:     { name: 'Advanced grammar', formats: ['multiple_choice'] },
  es_idioms_register: { name: 'Idioms, register and dialects', formats: ['multiple_choice'] },
  es_literature:      { name: 'Hispanic literature and culture', formats: ['multiple_choice'] },

  // ── Chess ────────────────────────────────────────────────────────────────
  // The board skills are computed by content/chess-board.js; the idea skills are
  // authored. Answers to board questions are moves in algebraic notation.
  chess_board:        { name: 'The board and squares', formats: ['multiple_choice', 'type_in'] },
  chess_moves:        { name: 'How the pieces move', formats: ['type_in'] },
  chess_notation:     { name: 'Chess notation', formats: ['type_in'] },
  chess_material:     { name: 'Piece values and trades', formats: ['multiple_choice'] },
  chess_mate:         { name: 'Checkmate patterns', formats: ['type_in'] },
  chess_tactics:      { name: 'Tactics and calculation', formats: ['type_in'] },
  chess_endgame:      { name: 'Endgames', formats: ['multiple_choice'] },
  chess_strategy:     { name: 'Strategy and planning', formats: ['multiple_choice'] },
  chess_opening:      { name: 'Openings', formats: ['multiple_choice'] },
  chess_practical:    { name: 'Practical play and study', formats: ['multiple_choice'] },
  chess_history:      { name: 'Chess history and culture', formats: ['multiple_choice'] },
  chess_professional: { name: 'Coaching, arbiting and composition', formats: ['multiple_choice'] },
  chess_engines:      { name: 'Engines, tablebases and theory', formats: ['multiple_choice'] },

  // ── Piano ────────────────────────────────────────────────────────────────
  // The theory skills are computed by content/piano-theory.js, which spells every
  // note; the others are authored. Playing is judged in the levels, not the bank.
  piano_keyboard:   { name: 'The keyboard', formats: ['multiple_choice', 'type_in'] },
  piano_reading:    { name: 'Reading the staff', formats: ['multiple_choice'] },
  piano_rhythm:     { name: 'Rhythm and metre', formats: ['type_in'] },
  piano_keys:       { name: 'Keys and key signatures', formats: ['multiple_choice'] },
  piano_scales:     { name: 'Scales', formats: ['type_in'] },
  piano_intervals:  { name: 'Intervals', formats: ['multiple_choice', 'type_in'] },
  piano_chords:     { name: 'Chords', formats: ['multiple_choice', 'type_in'] },
  piano_jazz:       { name: 'Jazz harmony', formats: ['multiple_choice'] },
  piano_terms:      { name: 'Terms and signs', formats: ['multiple_choice'] },
  piano_technique:  { name: 'Technique and pedalling', formats: ['multiple_choice'] },
  piano_repertoire: { name: 'Repertoire and history', formats: ['multiple_choice'] },
  piano_practice:   { name: 'Practice and performance', formats: ['multiple_choice'] },
  piano_profession: { name: 'Teaching, collaboration and the instrument', formats: ['multiple_choice'] },
  piano_science:    { name: 'Piano science and technology', formats: ['multiple_choice'] },

  // ── Basketball ───────────────────────────────────────────────────────────
  // Statistics are computed from generated box-score lines; the rest is authored.
  // Playing itself is judged on the court, from film, counts and logs.
  bb_stats:       { name: 'Shooting and team statistics', formats: ['type_in'] },
  bb_rules:       { name: 'Rules', formats: ['multiple_choice'] },
  bb_court:       { name: 'The court and equipment', formats: ['multiple_choice'] },
  bb_skills:      { name: 'Skills and technique', formats: ['multiple_choice'] },
  bb_tactics:     { name: 'Team tactics', formats: ['multiple_choice'] },
  bb_health:      { name: 'Injury prevention and health', formats: ['multiple_choice'] },
  bb_mental:      { name: 'Mental skills', formats: ['multiple_choice'] },
  bb_history:     { name: 'History of the game', formats: ['multiple_choice'] },
  bb_officiating: { name: 'Officiating', formats: ['multiple_choice'] },
  bb_coaching:    { name: 'Coaching', formats: ['multiple_choice'] },
  bb_frontier:    { name: 'Analytics and research', formats: ['multiple_choice'] },
};

const TRACKS = [
  {
    id: 'math',
    name: 'Mathematics',
    icon: 'sigma',
    color: '#4f6bed',
    blurb: 'Forty-nine grades from counting blocks to a doctoral qualifying exam.',
    // The grades come from content/math-grades.js, generated from the creator's
    // Math spreadsheet: forty-nine grades, 28,780 levels, from Sense of Quantity
    // in preschool to Setting the Agenda of a Field as a senior scholar.
    //
    // This replaces four rule-shaped grades — arithmetic, prealgebra, algebra1 and
    // algebra2 — which had no spreadsheet behind them and no levels the sheet did
    // not name. They are not kept as aliases: a grade id is referenced by stored
    // enrollments, and the four had 1,728 of them, so keeping the id and changing
    // what it points at would leave every one of those learners on a course whose
    // level numbers mean something different. `scripts/migrate-math-enrollments.js`
    // moves each one to the nearest grade in the sheet and puts it back in front
    // of the placement quiz, which is the only honest thing to do with a level on
    // a different course.
    grades: mathGrades(),
  },
  {
    id: 'english',
    name: 'English',
    icon: 'book',
    color: '#7a5af5',
    blurb: 'Sixteen grades from preschool to field authority, each with its own syllabus.',
    // The grades come from content/english-grades.js, which is generated from
    // the creator's spreadsheet. Three of them — basics, grammar and reading —
    // keep the ids they have always had, because stored enrollments and paths
    // already point at them; the other thirteen are new.
    grades: englishGrades(),
  },
  {
    id: 'reading',
    name: 'Reading',
    icon: 'book-open',
    color: '#2f7fd1',
    blurb: 'Sixteen grades from decoding to literary studies, each with its own sheet.',
    // The grades come from content/reading-grades.js, generated from the
    // creator's second spreadsheet. Reading is a track of its own rather than
    // more English grades: English asks about the craft of writing and about
    // language, and this asks what a text says, why it says it, and how a reader
    // gets there. Same shape as the English sheet, so the same generator reads
    // both — `npm run build:reading`.
    grades: readingGrades(),
  },
  {
    id: 'iq',
    name: 'IQ Training',
    icon: 'brain',
    color: '#0e9f6e',
    blurb: 'Twelve IQ-training grades from concrete thinking to an aspirational mastery frontier.',
    // Generated from data/IQ_Levels_Topics.csv by scripts/build-iq-grades.js.
    // Every CSV row remains a named, served level with its own type, activity, and
    // coverage text.
    grades: iqGrades(),
  },
  {
    id: 'act',
    name: 'ACT Prep',
    icon: 'target',
    color: '#d97706',
    blurb: 'Section-by-section preparation under the timing the real test imposes.',
    // Sixteen authored grades and every level come from the ACT workbook.
    grades: ACT_GRADES,
  },
  {
    id: 'spanish',
    name: 'Spanish',
    icon: 'globe',
    color: '#e11d48',
    blurb: 'From first greetings to the subjunctive, with translation throughout.',
    // Generated from data/Spanish_Fluency_Path.csv. The generator keeps the
    // existing ids for the first three grades so stored enrollments still resolve.
    grades: sheetGrades(SPANISH_GRADES, DEFAULT_SPANISH_SKILLS, 'spanish'),
  },
  {
    id: 'chess',
    name: 'Chess',
    icon: 'crown',
    color: '#7c3aed',
    blurb: 'Nineteen grades from a first look at the board to grandmaster play, coaching, arbiting and engine research.',
    // Generated from data/Chess_Grades_Levels.csv by scripts/build-chess-grades.js
    // (`npm run build:chess`). The sheet itself is built from researched topic
    // lists in curriculum-build/chess, which records how and why.
    grades: sheetGrades(CHESS_GRADES, DEFAULT_CHESS_SKILLS, 'chess'),
  },
  {
    id: 'piano',
    name: 'Piano',
    icon: 'music',
    color: '#0891b2',
    blurb: 'Nineteen grades from a first touch of the keys to concert artistry, teaching, piano technology and music science.',
    // Generated from data/Piano_Grades_Levels.csv by scripts/build-piano-grades.js
    // (`npm run build:piano`). The sheet is built from researched topic lists in
    // curriculum-build/piano, which records how and why.
    grades: sheetGrades(PIANO_GRADES, DEFAULT_PIANO_SKILLS, 'piano'),
  },
  {
    id: 'basketball',
    name: 'Basketball',
    icon: 'ball',
    color: '#ea580c',
    blurb: 'Fifteen grades from a first bounce of the ball to elite play, coaching, officiating, analytics and research.',
    // Generated from data/Basketball_Grades_Levels.csv by scripts/build-basketball-grades.js
    // (`npm run build:basketball`). The sheet is built from researched topic lists in
    // curriculum-build/basketball, which records how and why. Lessons pair a short
    // screen part with a court session; the court work is logged, never a gate.
    grades: sheetGrades(BASKETBALL_GRADES, DEFAULT_BASKETBALL_SKILLS, 'basketball'),
  },
];

// A grade's path is as long as its syllabus needs — one lesson per topic, no more
// and no less. The length is solved for rather than rounded to, because rounding
// is what left every grade with surplus lessons; see config/path-length.js.
const PATH_LENGTH = require('./path-length');
// The one place that answers what a level is. Required here because the level
// rule moved out of this file, and everything below that used to work it out now
// asks this instead.
const LAYOUT = require('./level-layout');

// ── What each level is ─────────────────────────────────────────────────────
// The spacing constants, kept as exports because three services read them, but
// they are no longer where the layout lives: `level-layout.js` owns that, and it
// answers from a grade's stated levels when it has them. These three remain only
// as the shape a grade falls back on when it has not been given a layout.
const MASTER_EVERY = 25;
const GRAND_EVERY = 100;
const LESSON_EVERY = 10;

/**
 * Every level is one of a few things, and the number decides which.
 *
 * There is no rule here any more. `config/level-layout.js` is the only place that
 * answers "what is level N of this grade", because it is the only place that can
 * answer it for a grade whose layout is *stated* rather than arithmetic — a
 * lesson on 25 and a quiz on 26, or seven levels of practice then a quiz, which
 * no formula produces.
 *
 * `pathLength` is still accepted so a caller that has it can pass it, but the
 * layout gets a grade's real end from the layout itself, and a stated grade's end
 * is the highest level it states.
 *
 * @param {number} level
 * @param {number} [pathLength] the end of the path
 * @param {object} [grade] the grade the level belongs to
 * @returns {string} a kind, e.g. 'lesson', 'master', 'practice'
 */
function levelKind(level, pathLength, grade) {
  return LAYOUT.kindOf(grade, level, pathLength);
}

/** Does this grade say where its own levels are, rather than using a rule? */
function statesLessonLevels(grade) {
  return LAYOUT.isStated(grade);
}

/** The level after `level` that this grade has, for counting a run of them. */
function nextLevelAfter(grade, level) {
  return LAYOUT.nextLevelAfter(grade, level);
}

const CHECKPOINT_KINDS = LAYOUT.CHECKPOINT_KINDS;
const isCheckpoint = LAYOUT.isCheckpoint;

// Now that the layout can answer for every grade, each one is given its length.
// The call has to come after `levelKind` exists because that is the question the
// fallback solves a length by asking.
PATH_LENGTH.assignPathLengths(TRACKS, require('../content/topics'));

// ── Written checkpoints ────────────────────────────────────────────────────
/**
 * The tracks whose Master and Grand Master checkpoints are written work rather
 * than multiple choice. The Graduation exam stays a written quiz in every
 * track: a course should still end on a test that covers everything in it.
 *
 * The check below is on the track, not on a flag on the grade, so adding a
 * track to this list is the whole of adding written checkpoints to it.
 */
const ESSAY_TRACKS = ['english'];

/** What a written checkpoint is called, and how long its quick check runs. */
const ESSAY_QUIZ_LENGTH = { master: 5, grand: 8 };
/** A written checkpoint is passed on the writing itself. */
const ESSAY_PASS_MARK = 0.75;
const ESSAY_MIN_WORDS = 80;

/**
 * Is this level answered in writing?
 *
 * A course that names its levels says so itself. The English sheet has two kinds
 * that are written: **Essay Draft**, which replaces a Master quiz with an oral
 * retell or a piece of writing, and **Essay Revision**, which is the same work
 * sat again against feedback. Both are written, and neither is a `master` or a
 * `grand` — so this used to return false for every one of them, and a learner
 * assigned an Essay Draft was served multiple choice instead.
 *
 * A course that does not name its levels is judged by track: every Master and
 * Grand Master in an English track is a piece of writing, because that is what
 * the track has always been.
 *
 * @param {object} grade
 * @param {number} level
 * @returns {boolean}
 */
function isEssayCheckpoint(grade, level) {
  if (!grade) return false;
  const kind = levelKind(level, grade.pathLength, grade);
  if (kind === 'essay') return true;
  if (kind !== 'master' && kind !== 'grand') return false;
  // On a grade that names its levels, a `master` is a Master quiz and a `grand` is
  // a Grand Master — it is not a piece of writing unless the sheet said so. The
  // track's rule applied to both, which delivered every Master quiz in the
  // sixteen English grades as an essay and left the sheet's own Essay Draft rows
  // as multiple choice.
  if (LAYOUT.isStated(grade)) return false;
  return ESSAY_TRACKS.includes(grade.trackId);
}

/**
 * The kind a checkpoint is *delivered* as, which is not always the kind it is.
 *
 * Level 25 of English is a Master quiz by its number and an essay by what the
 * learner actually does, and a great deal of the app branches on which of those
 * two it is — the pass mark, the label, the client title. Answering it in one
 * place keeps those from drifting apart.
 */
function checkpointKind(grade, level) {
  return isEssayCheckpoint(grade, level) ? 'essay' : levelKind(level, grade.pathLength, grade);
}

/**
 * Placement lands on a level the learner can be taught on rather than tested on.
 *
 * A new learner starts by being taught, and a checkpoint is never a landing spot:
 * a quiz on material they have not been shown yet is a level they can only fail.
 * So a placement rounds to the nearest level that is not a checkpoint, looking
 * ahead first and then behind.
 *
 * The old version rounded *down a multiple of ten*, which only lands on a lesson
 * because lessons happen to be every tenth level — the assumption this whole
 * change removes. It now asks the layout, which is the same question the rest of
 * the app asks.
 *
 * @param {number} level the level the difficulty inverts to
 * @param {number} pathLength the end of the path
 * @param {object} grade the grade, so the layout knows what a level is
 * @returns {number} a level that is not a checkpoint
 */
function roundToPlacement(level, pathLength, grade) {
  return LAYOUT.roundToPlacement(grade, level, pathLength);
}

/**
 * What it takes to clear a checkpoint. A Master or Grand Master quiz passes at
 * 75%; the Graduation exam, which ends a whole track, still asks for 90%.
 *
 * Below the mark the learner is not sent away to wait. They choose: retry the
 * quiz on freshly written questions — same level, same topics, questions they
 * have not seen — or work through what they actually got wrong first, with the
 * retry available the whole time. A cooldown used to guard against grinding the
 * quiz until the random draw was kind; regenerating every attempt removes the
 * thing it was guarding against, so there is no wait any more.
 */
const PASS_MARKS = { master: 0.75, grand: 0.75, graduation: 0.9, essay: ESSAY_PASS_MARK };
const CHECKPOINT_LENGTH = { master: 15, grand: 25, graduation: 40, essay: ESSAY_QUIZ_LENGTH.master };
/** What each one is called, wherever a learner is told about it. */
const CHECKPOINT_LABEL = {
  master: 'Master quiz',
  grand: 'Grand Master quiz',
  graduation: 'Graduation exam',
  essay: 'Essay',
  grand_essay: 'Grand Master essay',
};

/**
 * What this checkpoint is called for this learner, which is not always what it
 * is called for everyone. Level 25 of English is a Master quiz by its number and
 * an Essay by what they are asked to do, and four places in the app need to say
 * so without each of them working it out.
 */
function checkpointLabel(grade, level) {
  const kind = levelKind(level, grade.pathLength, grade);
  if (!isCheckpoint(kind)) return CHECKPOINT_LABEL[kind] || 'Level';
  if (!isEssayCheckpoint(grade, level)) return CHECKPOINT_LABEL[kind] || 'checkpoint';
  return kind === 'grand' ? CHECKPOINT_LABEL.grand_essay : CHECKPOINT_LABEL.essay;
}

// ── The Challenge Exam ─────────────────────────────────────────────────────
/**
 * After a long clean run, a learner is offered a way past the levels they have
 * already proved they can do. The offer is earned rather than purchased: every
 * level in the run has to be cleared at 90% or better, which is a higher bar
 * than any checkpoint on the path asks for.
 */
const SKIP_STREAK_LEVELS = 25;
const SKIP_MARK = 0.9;
const SKIP_BAND_COUNT = 5;
const SKIP_BAND_SIZE = 7;
/** What it is called everywhere a learner is told about it. */
const SKIP_LABEL = 'Challenge Exam';

/**
 * The bands a Challenge Exam is drawn from, in the order they are asked.
 *
 * Taken at level 92 the bands are the next five ten-level marks — 100, 110,
 * 120, 130, 140 — so the exam is always about material above where the learner
 * is standing, never a retest of the ground they already hold. Seven questions
 * a band, thirty-five in all.
 *
 * Bands past the end of the path are dropped rather than clamped, because a
 * question pitched at a level that does not exist would be pitched at a
 * difficulty nothing else on the path ever reaches.
 */
function skipExamBands(level, pathLength, { rule = skipRule() } = {}) {
  const first = Math.floor(level / LESSON_EVERY) * LESSON_EVERY + LESSON_EVERY;
  const bands = [];
  for (let i = 0; i < SKIP_BAND_COUNT; i++) {
    const bandLevel = first + i * LESSON_EVERY;
    if (bandLevel > pathLength) break;
    if (rule === 'sprt') {
      // The likelihood-ratio rule (skipTargetFromBands): a longer first band, the gate,
      // and shorter bands above it whose evidence accumulates.
      const count = i === 0 ? SKIP_GATE_SIZE : SKIP_SPRT_BAND_SIZE;
      bands.push({ index: i, level: bandLevel, count, needed: i === 0 ? neededToPass('skip', count) : count - 1, rule });
    } else {
      bands.push({ index: i, level: bandLevel, count: SKIP_BAND_SIZE, needed: SKIP_BAND_SIZE, rule: 'perfect' });
    }
  }
  return bands;
}

/** How many questions a Challenge Exam at this level actually has. */
function skipExamLength(level, pathLength, opts = {}) {
  return skipExamBands(level, pathLength, opts).reduce((sum, b) => sum + b.count, 0);
}

// ── Pass decisions by likelihood ratio (evidence article 01, P3) ────────────
/**
 * A fixed "N of M or fail" misclassifies learners near the mark: with the Final
 * at 36 of 40, a learner whose true accuracy is 90% fails it 37% of the time, and
 * a Challenge band of seven that must be perfect is cleared by a 90% learner only
 * 48% of the time. Wald's sequential probability ratio test (lewis1990, spray1996,
 * eggen1999) instead weighs each answer as evidence for "should pass" (accuracy
 * `pass`) against "should not" (accuracy `fail`), with the error rates set here:
 *
 *   alpha  chance a learner at `fail` passes     0.05 (checkpoints), 0.10 (Challenge)
 *   beta   chance a learner at `pass` fails      0.10
 *
 * Exact binomial operating characteristics at the full lengths (P(pass) by true accuracy):
 *
 *   Master 15 (12 needed, as before)   .65 .173  .70 .297  .75 .461  .85 .823  .90 .944
 *   Grand 25  (19 needed, as before)   .65 .173  .70 .341  .75 .561  .85 .930  .90 .991
 *   Final 40  (34 needed, was 36)      .70 .024  .75 .096  .80 .286  .85 .607  .90 .900  .95 .997
 *                         (was 36:     .70 .003  .75 .016  .80 .076  .85 .263  .90 .629  .95 .952)
 *
 * At the full length the test reduces to "correct >= needed", where needed comes
 * from where the likelihood ratio crosses even (passCut). It differs from the old
 * rule in two places: the Final (34 of 40, not 36), and an exam ended early or
 * with questions skipped, which now passes only on decisive evidence (the SPRT's
 * upper boundary) rather than on the accuracy of whatever was answered (3 of 3
 * used to pass a Master quiz). The Challenge Exam's rule is skipTargetFromBands.
 *
 * CHECKPOINT_SPRT=off and CHALLENGE_SPRT=off restore the fixed marks. The owner
 * gets the fixed marks (config/owner.js ownerBase; callers pass `base`).
 */
const PASS_DECISION = {
  master: { pass: 0.85, fail: 0.65, alpha: 0.05, beta: 0.10 },
  grand: { pass: 0.85, fail: 0.65, alpha: 0.05, beta: 0.10 },
  graduation: { pass: 0.9, fail: 0.75, alpha: 0.05, beta: 0.10 },
  skip: { pass: 0.9, fail: 0.7, alpha: 0.10, beta: 0.10 },
};
/** The Challenge Exam's gate band and the bands above it, under the likelihood-ratio rule. */
const SKIP_GATE_SIZE = 16;
const SKIP_SPRT_BAND_SIZE = 6;
/** An ended-early or part-skipped exam is judged at its length only if at least this share was answered. */
const PASS_MIN_SHARE = 0.6;

function checkpointSprtOn({ base = false } = {}) {
  return !base && String(process.env.CHECKPOINT_SPRT || 'on').toLowerCase() !== 'off';
}

function challengeSprtOn({ base = false } = {}) {
  return !base && String(process.env.CHALLENGE_SPRT || 'on').toLowerCase() !== 'off';
}

/** The Challenge Exam rule a new exam is built and scored by: 'sprt' or 'perfect'. */
function skipRule({ base = false } = {}) {
  return challengeSprtOn({ base }) ? 'sprt' : 'perfect';
}

/** One answer's weight of evidence (log likelihood ratio) for this kind: right adds `win`, wrong adds `loss` (< 0). */
function passStep(kind) {
  const d = PASS_DECISION[kind] || PASS_DECISION.master;
  return { win: Math.log(d.pass / d.fail), loss: Math.log((1 - d.pass) / (1 - d.fail)), ...d };
}

/** The accuracy at which the evidence is even: above it, "should pass" is the likelier. */
function passCut(kind) {
  const { win, loss } = passStep(kind);
  return -loss / (win - loss);
}

/** Right answers needed out of n for the evidence to favour a pass. */
function neededToPass(kind, n) {
  return Math.ceil(passCut(kind) * n - 1e-9);
}

/**
 * The pass mark to show for a checkpoint kind: the share its decision really
 * needs at its standard length (80% for a Master, 85% for the Final under the
 * likelihood-ratio rule), or the fixed mark when that rule is off or for the
 * owner's base product. The banners used to show the fixed 90% for a Final that
 * passes at 34 of 40.
 */
function passMarkFor(kind, { base = false } = {}) {
  const n = CHECKPOINT_LENGTH[kind];
  if (!PASS_DECISION[kind] || !n || !checkpointSprtOn({ base })) return PASS_MARKS[kind] || null;
  return neededToPass(kind, n) / n;
}

/** Every kind's shown pass mark, for the path page. */
function passMarksFor({ base = false } = {}) {
  const out = { ...PASS_MARKS };
  for (const kind of Object.keys(PASS_MARKS)) out[kind] = passMarkFor(kind, { base });
  return out;
}

/**
 * Pass or fail a checkpoint on the answers it got.
 * @param {string} kind master | grand | graduation
 * @param {{correct: number, answered: number, skipped?: number, planned: number}} counts
 * @returns {{passed, decided: 'clear'|'at_length'|'too_few', llr, upper, lower, needed, required}}
 */
function passDecision(kind, { correct, answered, skipped = 0, planned }) {
  const s = passStep(kind);
  const llr = correct * s.win + (answered - correct) * s.loss;
  const upper = Math.log((1 - s.beta) / s.alpha);
  const lower = Math.log(s.beta / (1 - s.alpha));
  const needed = neededToPass(kind, planned);
  const complete = answered + skipped >= planned && answered >= Math.ceil(PASS_MIN_SHARE * planned);
  let passed;
  let decided;
  if (llr >= upper) { passed = true; decided = 'clear'; }
  else if (llr <= lower) { passed = false; decided = 'clear'; }
  else if (complete) { passed = correct >= neededToPass(kind, answered); decided = 'at_length'; }
  else { passed = false; decided = 'too_few'; }
  return { passed, decided, llr, upper, lower, needed, required: planned ? needed / planned : PASS_MARKS[kind] };
}

/**
 * Where a finished Challenge Exam sends the learner.
 *
 * Each band makes a claim — "you can do this level" — and the bands stack, so
 * the first one that is not perfect is the level they land on: everything below
 * it was proved, and it is the one they now get to do properly. The band after
 * it is ignored rather than counted, because a claim that failed is not
 * strengthened by what came further out.
 *
 * The first band is the exception, and it is the whole gate. It sits one ten
 * level mark above where the learner stood, so failing it means they are not
 * ready to leave at all, and nothing is skipped however well the bands after it
 * went:
 *
 *   100, 100, 100, 100, 100  ->  140   every band held
 *   100, 100, 100,  40, 100  ->  130   band 4 broke; band 5 ignored
 *   100, 100,  40, 100, 100  ->  120
 *    70, 100, 100, 100, 100  ->  null  the first band broke; nothing is skipped
 *
 * Returns the level to land on, or null when the run never started.
 */
function skipTargetFromBands(bandResults, { rule = 'perfect' } = {}) {
  if (rule === 'sprt') return skipVerdicts(bandResults).target;
  const first = bandResults[0];
  if (!first || !first.total || first.correct < first.total) return null;
  for (let i = 0; i < bandResults.length; i++) {
    const band = bandResults[i];
    if (!band || !band.total || band.correct < band.total) return i === 0 ? null : band.level;
  }
  const last = bandResults[bandResults.length - 1];
  return last ? last.level : null;
}

/**
 * The likelihood-ratio Challenge Exam (evidence article 01, P3; CHALLENGE_SPRT).
 *
 * The bands still stack, and the first one is still the gate, but a band is held
 * on the weight of the evidence, not on being perfect:
 *   - the gate (16 questions) holds at 14 right: where the evidence for "90%"
 *     over "70%" crosses even (passCut('skip') = 0.814 of the answers);
 *   - a band above it (6 questions) holds with at most one miss (5 of 6 is
 *     0.833, above the cut, so it adds evidence for a pass);
 *   - and, as a guard should the band sizes change, the evidence over every band
 *     so far, taken together, must still favour a pass (right >= 0.814 of asked).
 * The first band that does not hold is where the learner lands, as before.
 * Unanswered questions count as misses. 40 questions in all (was 35).
 *
 * Simulated (200,000 exams per row; learners of a fixed true accuracy):
 *   P(skips anything)     .70: 0.100 (was 0.083)  .80: 0.352  .90: 0.790 (was 0.479)  .95: 0.957 (was 0.698)
 *   P(all five bands)     .70: 0.003 (was 0.000)  .80: 0.065  .90: 0.488 (was 0.026)  .95: 0.838 (was 0.168)
 *   accuracy .95 falling .05 a band: reaches bands 1-5 at .957 .848 .659 .431 .229 (was .698 .333 .105 .022 .003)
 *
 * @returns {{target: number|null, held: boolean[]}}
 */
function skipVerdicts(bandResults) {
  const held = [];
  let right = 0;
  let asked = 0;
  let broken = false;
  for (let i = 0; i < bandResults.length; i++) {
    const b = bandResults[i];
    const total = b ? b.total || 0 : 0;
    const correct = b ? b.correct || 0 : 0;
    right += correct;
    asked += total;
    const own = i === 0 || correct >= total - 1;
    const ok = !broken && total > 0 && own && right >= neededToPass('skip', asked);
    if (!ok) broken = true;
    held.push(ok);
  }
  const firstBroken = held.indexOf(false);
  let target;
  if (!bandResults.length || firstBroken === 0) target = null;
  else if (firstBroken === -1) target = bandResults[bandResults.length - 1].level;
  else target = bandResults[firstBroken].level;
  return { target, held };
}

// ── Lookups ────────────────────────────────────────────────────────────────
function getTrack(trackId) {
  return TRACKS.find((t) => t.id === trackId) || null;
}

function getGrade(trackId, gradeId) {
  const track = getTrack(trackId);
  if (!track) return null;
  // Existing IQ enrollments use the two pre-sheet ids. Resolve them without
  // publishing duplicate catalogue grades or rewriting learner records in place.
  const legacyIqIds = trackId === 'iq' ? {
    foundations: 'concrete_thinking_foundations',
    advanced: 'advanced_analytical_thinking',
  } : {};
  // These section-only grade ids predate the sixteen-grade ACT pathway. Keep
  // stored enrollments usable at the workbook's benchmark-ready Grade 6.
  const legacyActIds = trackId === 'act' ? {
    act_english: 'act_grade_6',
    act_math: 'act_grade_6',
    act_reading: 'act_grade_6',
    act_science: 'act_grade_6',
  } : {};
  const resolvedId = legacyIqIds[gradeId] || legacyActIds[gradeId] || gradeId;
  const grade = track.grades.find((g) => g.id === resolvedId) || null;
  // Stamped on the way out rather than written into every grade literal, so the
  // track stays the only place a track id is typed. Everything downstream — the
  // path, the session builders, the essay predicate — reads the grade it is
  // handed and needs to know which track it belongs to.
  if (grade && !grade.trackId) grade.trackId = trackId;
  return grade;
}

function skillName(skillId) {
  return (SKILLS[skillId] && SKILLS[skillId].name) || skillId;
}

function skillFormats(skillId) {
  return (SKILLS[skillId] && SKILLS[skillId].formats) || ['multiple_choice'];
}

/** How many placement questions a claimed tier earns: 20 at tier 1, 50 at tier 5. */
function placementLength(tier) {
  return Math.round(20 + ((Math.max(1, Math.min(5, tier)) - 1) * 30) / 4);
}

/**
 * Difficulty 1–10 for a level on a path. Linear is the honest choice for v1:
 * item statistics in Phase 8 replace it with a curve fitted to real p-values.
 */
function difficultyForLevel(level, pathLength, grade = null) {
  const t = (Math.max(1, level) - 1) / Math.max(1, pathLength - 1);
  const band = grade ? gradeBand(grade) : null;
  if (band) return Math.max(1, Math.min(10, band.lo + t * (band.hi - band.lo)));
  return Math.max(1, Math.min(10, 1 + t * 9));
}

/**
 * The part of the bank's 1-10 scale a grade is served from (GRADE_BANDS=on).
 *
 * The bank's scale is subject-wide: 1 is a first lesson in the subject and 10 the
 * hardest material it has. Without a band every grade runs the whole scale, so a
 * Kindergarten math grade ends on difficulty-10 algebra and a doctoral grade opens
 * on "3 + 4" (subjects audit, 2026-10-24). With it, a grade's levels climb across
 * its own slice of the scale, placed by the grade's position in its track: the
 * slice is centred on that position and at least GRADE_BAND_WIDTH wide (default 2),
 * so a grade still gets harder from its first level to its Final.
 * Placement keeps its own scale (services/placement.js inverts the unbanded one).
 * On by default since 2026-10-24 (the owner approved verified fixes going live);
 * GRADE_BANDS=off restores the whole-scale climb.
 */
function gradeBand(grade) {
  if (String(process.env.GRADE_BANDS || 'on').toLowerCase() !== 'on' || !grade || !grade.trackId) return null;
  const track = TRACKS.find((t) => t.id === grade.trackId);
  const index = track ? track.grades.findIndex((g) => g.id === grade.id) : -1;
  if (!track || index < 0 || track.grades.length < 2) return null;
  const n = track.grades.length;
  const width = Math.min(9, Math.max(Number(process.env.GRADE_BAND_WIDTH || 2), 9 / n));
  const centre = 1 + (9 * (index + 0.5)) / n;
  let lo = centre - width / 2;
  let hi = centre + width / 2;
  if (lo < 1) { hi += 1 - lo; lo = 1; }
  if (hi > 10) { lo -= hi - 10; hi = 10; }
  return { lo: Math.max(1, lo), hi: Math.min(10, hi) };
}

/**
 * The skill a level focuses on, plus the skills already introduced by then.
 *
 * The focus is normally the skill whose band the level sits in. On a lesson level
 * it is the skill *of the topic being taught*, which is usually the same and
 * sometimes not — and where they differ, the topic wins.
 *
 * A grade is one course with one list of topics, so a level's position in the
 * path is its position in that list, while its position in the skill bands is a
 * different division entirely. The two drift apart by a lesson or two at every
 * boundary, which is a nineteenth of a grade's lessons — enough that arithmetic
 * taught 8% of its lessons while the questions came from the fractions pool.
 * The lesson taught one rule and the check questions asked about another, and
 * the shape filter was comparing two different pools. Letting the topic name the
 * skill is what makes "the questions follow the lesson" true.
 */
function levelPlan(grade, level) {
  const skills = grade.skills;
  const span = grade.pathLength / skills.length;
  const focusIndex = Math.min(skills.length - 1, Math.floor((level - 1) / span));
  const kind = levelKind(level, grade.pathLength, grade);

  // Resolved lazily: topics.js requires the curriculum for its own level
  // arithmetic, and a top-level require here would close that cycle and hand it
  // a half-built module. The require therefore happens on the first lesson plan
  // rather than at load.
  let focus = skills[focusIndex];
  if (kind === 'lesson' || grade.trackId === 'spanish') {
    // eslint-disable-next-line global-require
    const topic = require('../content/topics').topicFor(grade, level, focus, grade.trackId);
    if (topic && topic.skill && skills.includes(topic.skill)) focus = topic.skill;
    if (grade.trackId === 'spanish') {
      const row = LAYOUT.entryFor(grade, level);
      if (row && row.skill && skills.includes(row.skill)) focus = row.skill;
    }
  }
  if (grade.trackId === 'act') {
    const row = LAYOUT.entryFor(grade, level);
    if (row && row.skill && skills.includes(row.skill)) focus = row.skill;
  }

  const introducedThrough = grade.trackId === 'act' && skills.includes(focus)
    ? skills.indexOf(focus)
    : focusIndex;

  return {
    level,
    kind,
    // What this level actually is for this learner, which differs from its kind
    // by number in exactly one case: a written checkpoint. Everything that
    // builds a level reads this rather than deciding for itself.
    delivered: checkpointKind(grade, level),
    focus,
    // Everything the learner has met by now, in the order the grade teaches it.
    // A skill whose topics are already behind the learner stays in review, which
    // is what keeps level 200 from forgetting level 3.
    introduced: skills.slice(0, introducedThrough + 1),
    difficulty: difficultyForLevel(level, grade.pathLength, grade),
    // The checkpoint a learner is standing on, if this level is one.
    checkpoint: isCheckpoint(kind) ? kind : null,
  };
}

/**
 * The next lesson level at or after `level`, or null.
 *
 * Used to prepare a lesson while the learner is working through the one before
 * it. The old version scanned only twelve levels ahead, on the assumption that
 * lessons were ten apart — so a grade whose lessons sat further apart stopped
 * being prefetched without a word. The layout walks the grade's own list, or the
 * whole path where there is no list, so the window is whatever the grade says it
 * is.
 */
function nextLessonLevel(grade, level) {
  return LAYOUT.nextLesson(grade, level);
}

/**
 * The last level a topic is practised on: the level before the next lesson, or
 * the end of the path.
 *
 * Distinct from `nextLessonLevel`, which decides what to prefetch and is happy to
 * answer nothing. A lesson saying "these levels practise it, and the next lesson
 * is X" needs the whole answer.
 */
function practiceUntil(grade, level) {
  return LAYOUT.practiceUntil(grade, level);
}

/** Every skill any MVP grade uses — the content bank must cover all of these. */
function allUsedSkills() {
  const set = new Set();
  for (const track of TRACKS) {
    for (const grade of track.grades) grade.skills.forEach((s) => set.add(s));
  }
  return [...set];
}

/** Public shape sent to the browser: no internals, no skill answers. */
function catalogue() {
  return TRACKS.map((t) => ({
    id: t.id,
    name: t.name,
    icon: t.icon,
    color: t.color,
    blurb: t.blurb,
    grades: t.grades.map((g) => ({
      id: g.id,
      name: g.name,
      tier: g.tier,
      blurb: g.blurb,
      pathLength: g.pathLength,
      placementLength: placementLength(g.tier),
      skills: g.skills.map((s) => ({ id: s, name: skillName(s) })),
    })),
  }));
}

module.exports = {
  TRACKS,
  SKILLS,
  MASTER_EVERY,
  GRAND_EVERY,
  LESSON_EVERY,
  levelKind,
  statesLessonLevels,
  nextLevelAfter,
  isCheckpoint,
  roundToPlacement,
  nextLessonLevel,
  practiceUntil,
  PASS_MARKS,
  CHECKPOINT_LENGTH,
  CHECKPOINT_LABEL,
  CHECKPOINT_KINDS,
  ESSAY_TRACKS,
  ESSAY_QUIZ_LENGTH,
  ESSAY_PASS_MARK,
  ESSAY_MIN_WORDS,
  isEssayCheckpoint,
  checkpointKind,
  checkpointLabel,
  SKIP_STREAK_LEVELS,
  SKIP_MARK,
  SKIP_BAND_COUNT,
  SKIP_BAND_SIZE,
  SKIP_LABEL,
  skipExamBands,
  skipExamLength,
  skipTargetFromBands,
  skipVerdicts,
  skipRule,
  SKIP_GATE_SIZE,
  SKIP_SPRT_BAND_SIZE,
  PASS_DECISION,
  PASS_MIN_SHARE,
  checkpointSprtOn,
  challengeSprtOn,
  passStep,
  passCut,
  neededToPass,
  passMarkFor,
  passMarksFor,
  passDecision,
  getTrack,
  getGrade,
  skillName,
  skillFormats,
  placementLength,
  difficultyForLevel,
  gradeBand,
  levelPlan,
  allUsedSkills,
  catalogue,
};
