/**
 * Build a track from a creator spreadsheet.
 *
 * A sheet is a **layout**, not a syllabus. It names every level of every grade —
 * `App Level #`, `Type`, `Topic / Activity`, `What It Covers`, `Est. Min` — and
 * levels run 1 to N with nothing missing and nothing named twice. A grade's path
 * is its highest level plus the graduation exam, and every level is served with
 * the words its author wrote for it.
 *
 * Two sheets use this: `English_Levels_Topics.csv` and
 * `Reading_Levels_Topics.csv`, both from the creator. They have the same shape
 * and the same eleven types, so the reading is written once here rather than
 * twice in two generators that would then drift — and the English generator
 * already disagreed with a second copy of its own level rule twice, which is what
 * `config/level-layout.js` now exists to prevent.
 *
 * What the generator decides, and no more:
 *
 *   **A stable id per grade.** Grade ids are referenced by stored enrollments, so
 *   the ones a subject already had are kept and the rest are named from the
 *   heading rather than numbered.
 *
 *   **What kind of level each type is.** The sheet says "Lesson", "Activity",
 *   "Master Quiz" and nine others. The app has three behaviours — a teaching
 *   block, a sitting with a pass mark, or practice — so each type maps onto one,
 *   and the sheet's own word is kept as the level's `type` so nothing about it is
 *   lost. See TYPES.
 *
 *   **Which skill a level's questions come from.** Questions come from families
 *   keyed by skill, so a teaching level needs a skill. It is worked out from the
 *   level's title and then its coverage, and a level that matches neither is
 *   served from the whole skill its grade is built from — a broader question
 *   rather than a wrong one.
 */
const fs = require('fs');

/**
 * What each of the sheet's types is, in the app's three behaviours.
 *
 * `kind` is what the app *does*; `teaches` is whether it is a teaching block
 * with sections and check questions, or a block of questions.
 *
 *   Tester              practice   nine entry checks at the top of a grade. They
 *                                   are asked *of* the learner before the course
 *                                   starts and are not part of it, so they are
 *                                   questions rather than lessons, and they carry
 *                                   no pass mark — the sheet says the score "lets
 *                                   the student skip those lessons", which is a
 *                                   placement decision rather than a gate.
 *   Lesson              lesson     a teaching block.
 *   Summary             lesson     a review of the lessons before it. The sheet
 *                                   describes it as recall-first with a model to
 *                                   correct against, which is a lesson.
 *   Grade Review Lesson lesson     the same, for the whole grade.
 *   Activity            practice   a short drill on the lesson above it: a model
 *                                   to listen to, an echo, a game. The sheet gives
 *                                   each a fraction of a minute, so they are
 *                                   questions and not teaching.
 *   Grade Review Activity practice  as above, for the whole grade.
 *   Master Quiz         master     a quiz with a pass mark.
 *   Grand Master Quiz   grand      a cumulative quiz with a pass mark.
 *   Essay Draft         essay      a Master-style level the learner answers in
 *                                   writing. Replaces a quiz rather than adding
 *                                   one, so it is a sitting and carries the
 *                                   pass mark.
 *   Essay Revision      essay      the same writing sat again, against feedback
 *                                   and a model answer. The app already offers a
 *                                   retry on fresh questions at the level a
 *                                   checkpoint was failed, so this is that
 *                                   mechanism applied to a level the sheet
 *                                   creates for it — which is why it is a
 *                                   sitting rather than a level of questions. A
 *                                   revision with nothing to revise is still a
 *                                   revision, so it does not look behind for a
 *                                   draft to find.
 *   Written Task        essay      the Math sheet's word for the same thing: a
 *                                   checkpoint the learner answers by showing
 *                                   their work, so a short quiz to check it and a
 *                                   piece of writing marked against a rubric. The
 *                                   English and Reading sheets call this an Essay
 *                                   Draft, the Math sheet calls it a Written
 *                                   Task, and both are the same behaviour under
 *                                   two names. The sheet's own word is still what
 *                                   the page prints, so a learner sees whichever
 *                                   their course uses.
 *   Written Task Revision essay   the same sitting sat again against feedback,
 *                                   exactly as an Essay Revision is.
 *   Final               graduation the exam that ends the grade.
 *
 * A type not in this table is still a level: it is served, named and counted, and
 * behaves like practice. That is deliberate — the sheet is the creator's, and a
 * new row there should not take the build down. It is counted and printed so it
 * is noticed.
 */
const TYPES = {
  Tester: { kind: 'practice', teaches: false },
  Lesson: { kind: 'lesson', teaches: true },
  Summary: { kind: 'lesson', teaches: true },
  'Grade Review Lesson': { kind: 'lesson', teaches: true },
  Activity: { kind: 'practice', teaches: false },
  'Grade Review Activity': { kind: 'practice', teaches: false },
  'Master Quiz': { kind: 'master', teaches: false },
  'Grand Master Quiz': { kind: 'grand', teaches: false },
  'Essay Draft': { kind: 'essay', teaches: false },
  'Essay Revision': { kind: 'essay', teaches: false },
  'Written Task': { kind: 'essay', teaches: false },
  'Written Task Revision': { kind: 'essay', teaches: false },
  // IQ's reasoning tasks replace a quiz but are explicitly practice, not
  // pass/fail checkpoints. Keep that distinction in the app's behaviour while
  // preserving the sheet's own type on the level.
  'Reasoning Task': { kind: 'practice', teaches: false },
  'Task Revision': { kind: 'practice', teaches: false },
  // Chess. The quiz-2 slot is a game played and annotated rather than a quiz, and
  // a grade ends on a tournament before its Final. Games need the board, so they
  // are practice — never a gate — until the board can play them. The professional
  // and frontier grades answer in writing instead, which is the Written Task
  // behaviour under the sheet's own word.
  'Play and Show': { kind: 'practice', teaches: false },
  'Play and Annotate': { kind: 'practice', teaches: false },
  'Game Revision': { kind: 'practice', teaches: false },
  'Grade Tournament': { kind: 'practice', teaches: false },
  'Applied Task': { kind: 'essay', teaches: false },
  'Applied Task Revision': { kind: 'essay', teaches: false },
  'Capstone Project': { kind: 'essay', teaches: false },
  // Piano. The quiz-2 slot is a performance recorded, self-assessed and re-recorded
  // the next day, and a grade's recital comes before its skills Final. Playing is
  // judged against a rubric the learner fills in first, so these are practice —
  // never a gate — until the app can hear the playing it would be grading.
  'Play for Someone': { kind: 'practice', teaches: false },
  'Record and Self-Assess': { kind: 'practice', teaches: false },
  'Re-Record': { kind: 'practice', teaches: false },
  'Grade Recital': { kind: 'practice', teaches: false },
  // Basketball. The quiz-2 slot is a filmed, self-rated skills set taken into a
  // real game, and a grade ends on a skills combine and a game showcase before
  // its Court IQ Final. All of it happens on a court, so it is practice — logged
  // and self-assessed, never a gate.
  'Show Me': { kind: 'practice', teaches: false },
  'Film It, Rate It': { kind: 'practice', teaches: false },
  'Re-Film and Play It': { kind: 'practice', teaches: false },
  'Grade Combine': { kind: 'practice', teaches: false },
  'Game Showcase': { kind: 'practice', teaches: false },
  Final: { kind: 'graduation', teaches: false },
};

/** A CSV reader that understands quoted fields, commas and doubled quotes. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** "Level 10: College Composition — College Freshman (Year 1)" -> an id. */
function idFrom(heading, index) {
  const after = heading.replace(/^(Level|Grade)\s*\d+\s*:\s*/, '');
  const name = after.split('—')[0].trim() || after.split('-')[0].trim();
  const slug = name.toLowerCase()
    // An apostrophe in "Master's" is a joiner, not a separator, and dropping it
    // gives `masters` rather than `master_s`.
    .replace(/['’]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  return slug || `grade_${index + 1}`;
}

/**
 * Read a sheet into grades of levels.
 *
 * The stride is read from the header rather than assumed. The English sheet has
 * five columns per grade, and hard-coding that was right only for as long as
 * nothing else had a sheet; a grade with an unusual number of columns would be
 * read from the wrong place with no error raised, and every level would name the
 * wrong topic.
 *
 * @param {string} src absolute path to the sheet
 * @param {Function} [skillFor] level -> skill id. Called once per level here and
 *   stored on the level, so a caller that wants to fill gaps in afterwards can
 *   edit `l.skill` and have it stick. Recomputing at write time instead would
 *   throw away every repair, silently — the count looked unmoved after each one.
 * @returns {{grades: Array, unknownTypes: Map}}
 */
function readSheet(src, skillFor) {
  const rows = parseCsv(fs.readFileSync(src, 'utf8'));
  // Newer sheets (ACT, Spanish, Chess) label the row number "Level #"; it is the
  // same column, so it is read as one name.
  const header = (rows[1] || []).map((h) => String(h || '').trim().toLowerCase())
    .map((h) => (h === 'level #' ? 'app level #' : h));
  const firstBlock = header.slice(0, 12);
  let stride = firstBlock.findIndex((h, i) => i > 0 && h === 'app level #');
  if (stride < 1) stride = 5;
  if (header.length % stride !== 0) {
    throw new Error(`${src}: header row 2 has ${header.length} columns, which is not a whole`
      + ` number of ${stride}-column grades — the sheet layout has changed`);
  }
  if (header.filter((h) => h === 'app level #').length !== header.length / stride) {
    throw new Error(`${src}: header row 2 has`
      + ` ${header.filter((h) => h === 'app level #').length} "App Level #" columns for`
      + ` ${header.length / stride} grades — the sheet layout has changed`);
  }

  const grades = [];
  const unknownTypes = new Map();
  for (let g = 0; g * stride + stride - 1 < rows[0].length; g++) {
    const base = g * stride;
    const heading = (rows[0][base] || '').trim();
    if (!heading) continue;
    const levels = [];
    for (let r = 2; r < rows.length; r++) {
      const row = rows[r] || [];
      const level = Number(String(row[base] || '').trim());
      const type = (row[base + 1] || '').trim();
      const title = (row[base + 2] || '').trim();
      const covers = (row[base + 3] || '').replace(/\s*##\s*$/, '').trim();
      if (!level && !title && !type) continue;
      if (!title) throw new Error(`${heading}: row ${r + 1} is a "${type}" with no title`);
      if (!Number.isInteger(level) || level < 1) {
        throw new Error(`${heading}: row ${r + 1} is "${title}" with no usable level`
          + ` (got ${JSON.stringify(row[base])})`);
      }
      const mapped = TYPES[type];
      if (!mapped) unknownTypes.set(type, (unknownTypes.get(type) || 0) + 1);
      levels.push({
        level,
        type: type || 'Activity',
        kind: (mapped && mapped.kind) || 'practice',
        teaches: !!(mapped && mapped.teaches),
        title,
        covers,
        skill: skillFor ? skillFor({ level, type, title, covers }) : null,
      });
    }
    // A level twice is a fault rather than a second level: the level decides which
    // level it is, so two rows on one number means one is never served and the
    // other is served in its place.
    levels.sort((a, b) => a.level - b.level);
    for (let i = 1; i < levels.length; i++) {
      if (levels[i].level === levels[i - 1].level) {
        throw new Error(`${heading}: level ${levels[i].level} is named twice — `
          + `"${levels[i - 1].title}" and "${levels[i].title}"`);
      }
    }
    grades.push({ heading, levels });
  }
  return { grades, unknownTypes };
}

/**
 * Write a track's generated file.
 *
 * @param {object} opts
 * @param {Array} opts.grades from `readSheet`
 * @param {string} opts.out absolute path to write
 * @param {string} opts.subject the subject's name, for the header comment
 * @param {object} opts.meta grade id -> `{ name, tier, blurb }`
 * @param {object} [opts.keepIds] index -> grade id, for ids that already exist
 * @param {Map} [opts.unknownTypes] printed so an unmapped type is noticed
 * @param {Function} [opts.log] where the report goes, so a caller can add to it
 * @returns {{written: number, total: number, lessons: number, unmapped: Array}}
 */
function writeTrack({
  grades, out, subject, meta, keepIds, unknownTypes, log,
}) {
  const out_ = [];
  out_.push('/**');
  out_.push(` * The ${subject} track, as its ${grades.length} grades and their levels were written by hand.`);
  out_.push(' *');
  out_.push(' * Generated by scripts/build-sheet-track.js from the creator\'s spreadsheet, which is the');
  out_.push(' * source of truth. Do not hand-edit: change the sheet and regenerate, or the file and');
  out_.push(' * the sheet stop agreeing and neither can be trusted.');
  out_.push(' *');
  out_.push(' * Each grade carries `levels` — the whole of the grade, in level order, with the title');
  out_.push(' * the creator wrote and what that level covers. That list is the grade:');
  out_.push(' * `config/level-layout.js` answers "what is level N of this grade" from it, and');
  out_.push(' * nothing anywhere works the level out from arithmetic.');
  out_.push(' *');
  out_.push(' * The sheet\'s own word for the level is kept as `type` — Tester, Lesson, Activity,');
  out_.push(' * Summary, Master Quiz, Essay Draft, and so on — alongside `kind`, which is what the');
  out_.push(' * app does with it: a teaching block, a sitting with a pass mark, or practice.');
  out_.push(' * Both are kept because they answer different questions: the page should say');
  out_.push(' * "Activity", and the app has to know to serve questions.');
  out_.push(' *');
  out_.push(' * A level whose `skill` is null has no family behind it, so its questions come from');
  out_.push(' * the whole skill its grade is built from. The level is still served and still');
  out_.push(' * titled from the sheet — dropping a level the creator wrote would be worse than');
  out_.push(' * asking a broader question about it.');
  out_.push(' */');
  out_.push('const GRADES = [');

  const unmapped = [];
  for (let i = 0; i < grades.length; i++) {
    const g = grades[i];
    const id = (keepIds && keepIds[i]) || idFrom(g.heading, i);
    const m = (meta && meta[id]) || {
      name: g.heading.replace(/^Level\s*\d+\s*:\s*/, ''), tier: 5, blurb: '',
    };
    // The skills a grade is built from, in the order its levels first use them, so
    // a grade's own bands follow the sheet rather than an alphabetical list.
    const order = [];
    for (const l of g.levels) {
      if (l.skill && !order.includes(l.skill)) order.push(l.skill);
    }
    for (const l of g.levels) {
      if (!l.skill) unmapped.push(`${id} level ${l.level}: ${l.title}`);
    }

    out_.push('  {');
    out_.push(`    id: ${JSON.stringify(id)},`);
    out_.push(`    heading: ${JSON.stringify(g.heading)},`);
    out_.push(`    name: ${JSON.stringify(m.name)},`);
    out_.push(`    tier: ${m.tier},`);
    out_.push(`    blurb: ${JSON.stringify(m.blurb)},`);
    out_.push(`    skills: ${JSON.stringify(order)},`);
    out_.push('    levels: [');
    for (const l of g.levels) {
      out_.push(`      { level: ${l.level}, type: ${JSON.stringify(l.type)},`
        + ` kind: ${JSON.stringify(l.kind)},`
        + ` topic: ${JSON.stringify(l.title)},`
        + ` title: ${JSON.stringify(l.title)},`
        + ` covers: ${JSON.stringify(l.covers)},`
        + ` skill: ${JSON.stringify(l.skill)} },`);
    }
    out_.push('    ],');
    out_.push(`    levelCount: ${g.levels.length},`);
    out_.push(`    teachingLevelCount: ${g.levels.filter((l) => l.teaches).length},`);
    out_.push('  },');
  }
  out_.push('];');
  out_.push('');
  out_.push('module.exports = { GRADES };');
  out_.push('');

  fs.writeFileSync(out, out_.join('\n'), 'utf8');

  const total = grades.reduce((n, g) => n + g.levels.length, 0);
  const lessons = grades.reduce((n, g) => n + g.levels.filter((l) => l.teaches).length, 0);
  const say = log || console.log;
  say(`wrote ${out}`);
  say(`${grades.length} grades, ${total} levels, ${lessons} of them teaching`);
  for (const g of grades) {
    const byType = new Map();
    for (const l of g.levels) byType.set(l.type, (byType.get(l.type) || 0) + 1);
    const highest = g.levels[g.levels.length - 1].level;
    say(`  ${String(g.levels.length).padStart(4)} levels to ${String(highest).padStart(4)}`
      + `  ${idFrom(g.heading, 0).padEnd(30)}`
      + ` ${[...byType].map(([k, n]) => `${k} ${n}`).join(', ')}`);
  }
  if (unknownTypes && unknownTypes.size) {
    say(`\n${unknownTypes.size} type(s) this generator has no rule for — they are served as`
      + ' practice levels and keep their own type in the page:');
    for (const [type, n] of unknownTypes) say(`   "${type}" x${n}`);
  }
  if (unmapped.length) {
    say(`\n${unmapped.length} levels with no skill matched — their questions come from the`
      + ' whole skill:');
    for (const u of unmapped.slice(0, 40)) say(`   ${u}`);
    if (unmapped.length > 40) say(`   ... and ${unmapped.length - 40} more`);
  }
  return { total, lessons, unmapped };
}

module.exports = { TYPES, parseCsv, idFrom, readSheet, writeTrack };
