/**
 * The subject placement quiz.
 *
 * One sitting that walks a whole subject — every grade it has, in order — seven
 * questions at a time, and ends by telling the learner what percentage of each
 * grade they should sit at. It exists for the learner who does not know where to
 * start, which is the learner who most needs the answer: choosing a grade from a
 * list asks them to know a thing they are here because they do not know.
 *
 * Three things are worth knowing before reading it.
 *
 * The questions are written by the model, not the bank, and the whole subject is
 * asked for in one call. A bank question is generated from a skill and a
 * difficulty and does not know which grade it belongs to; worse, it cannot know
 * what the question before it asked. The set has to climb — the seventh grade's
 * easy question is not the first grade's easy question — and it has to be a set,
 * so that no question is a repeat of one already asked or one still to come. That
 * is a single document, so it is a single call, cached per subject and shared by
 * every learner rather than written again for each.
 *
 * The walk obeys `config/subject-placement.js` and stops when the questions stop
 * being answerable. The learner never sees a right/wrong verdict while it runs,
 * for the same reason the per-grade placement does not show one: the questions
 * get harder until they are guessing, and being told so mid-quiz teaches them
 * nothing except to stop.
 *
 * The percentages at the end are the model's, given the exact score of every
 * grade — not a formula over the totals. The pattern the scores make (a clean run,
 * a stumble, a recovery, a collapse) is the actual evidence about where somebody
 * belongs, and a number that reads the pattern is doing the job a percentage is
 * for.
 */
const fs = require('fs');
const path = require('path');
const db = require('../config/db');
const curriculum = require('../config/curriculum');
const rules = require('../config/subject-placement');
const grading = require('./grading');
const ai = require('./ai');
const providers = require('./providers');
const englishPlacement = require('../content/english-placement');
const adaptive = require('./adaptive-placement');
const unitPlacement = require('./unit-placement');

const SETS = 'placement_question_sets';
const PLACEMENTS = 'subject_placements';

// ── the questions ──────────────────────────────────────────────────────────

/**
 * The output contract for one subject's questions.
 *
 * Flat where it can be: `grade_id` on every question rather than nesting, because
 * a model that has to close the right number of braces 343 times will not.
 */
const QUESTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['grades'],
  properties: {
    grades: {
      type: 'array',
      description: 'One entry per grade, in the order given.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['grade_id', 'questions'],
        properties: {
          grade_id: { type: 'string' },
          questions: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['band', 'prompt', 'answer', 'rationale'],
              properties: {
                band: { type: 'string', enum: rules.MIX.filter((b, i, a) => a.indexOf(b) === i) },
                prompt: { type: 'string' },
                topic: { type: 'string', description: 'Which topic of this grade\'s syllabus the question tests.' },
                choices: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Four options, one of which is the answer. Omit only if the question cannot be multiple choice.',
                },
                answer: { type: 'string' },
                rationale: { type: 'string', description: 'One sentence: why the answer is the answer.' },
              },
            },
          },
        },
      },
    },
  },
};

function questionSystemPrompt() {
  return `You write placement quizzes for an adaptive tutoring product. A learner who does not know which grade to start at takes one, and their answers decide where they are told to begin.

What makes this quiz different from a test is that it is a ladder. You are writing every grade of one subject, first to last, and the reader is going to climb it until the questions stop being answerable. So:

- The set climbs. The first grade's questions are the easiest in the whole subject and the last grade's are the hardest. A question's difficulty should rise smoothly from the start of the subject to the end, and the average of each grade's seven should be a step above the grade before it.
- The set is one document. Nothing may repeat: not a phrasing, not a fact, not an example. Every question has to earn its place next to the ones before and after it, because a learner who has answered the earlier ones will see the later ones and will notice.
- Within a grade, the order is fixed: two easy, two medium, two hard, one capstone. The capstone is the one that separates having met a grade from having finished it — it should be answerable by someone who worked through every level of that grade and not by someone who only got part of the way.
- A grade is a serious body of work. Each one is hundreds of levels long, and a learner must finish all of them before moving to the next grade. A question that could be answered by someone who read the grade's title is a wasted question.
- Every question must have exactly one defensible answer, and it must be defensible from the question alone. No trick questions, no "all of the above", no questions where the answer depends on a convention the question does not state.
- Say which topic of that grade each question tests in \`topic\`, in a few words. The set is read question by question after the walk, and a miss is only as useful as what it is known to be a miss on.
- Prefer multiple choice with four options. Use a free-response question only where the answer is short, single and unambiguous, and never where two spellings or two equivalent forms would both be right.

The choices are half the question, and a learner must have to know the material to pick the right one. They have not had to: in the sets written so far the answer sat in the first slot 93% of the time, was the longest option 67% of the time, and in a quarter of the questions was longer than every wrong option by a wide margin — so the answer could be found without knowing it. Those are failures now, not style points:

- The answer's position varies. Across a subject, each of the four slots holds the answer about as often as the others. Do not settle into any habit — not first, not last, not a rotation the learner could catch.
- The answer is not identifiable by its length. If the answer is a full sentence, the wrong options are full sentences; if it is a number with units, so are they; if it is one word, so are they. Never one complete, carefully qualified answer beside three bare fragments, and never the reverse.
- The wrong options are as good as the right one to somebody who does not know the material: the same kind of thing, the same units, the same part of speech, the same level of detail and the same certainty, and each a specific mistake somebody learning this material would actually make. An absurd option, a vaguer option, or an option about something else can be eliminated without knowing anything — and a question that can be narrowed by elimination is being answered by the choices, not by the learner.
- No giveaways of form: nothing that makes one option the odd one out in grammar, in length, in how specific it is, or in whether it repeats words from the stem. Two options that are the same idea in different words are one wasted slot.

Reply only through the tool.`;
}

/**
 * The prompt for a whole subject.
 *
 * Every grade is named with its position, its ramp point and its neighbours, so
 * the model is never guessing what came before or what is still to come — the two
 * things that make the difference between a set and forty unrelated quizzes.
 *
 * A long subject is written in batches of grades, and a batch gets the whole
 * ladder as context plus everything written before it, because the point of one
 * document is that nothing repeats — including across calls.
 */
function questionUserPrompt(trackId, gradeIds, opts = {}) {
  const track = curriculum.getTrack(trackId);
  const total = gradeIds.length;
  const batch = opts.batch || gradeIds;
  const lines = [];

  lines.push(`SUBJECT: ${track ? track.name : trackId}`);
  lines.push(`${total} grades, in the order they must be placed in. Grade 1 is the earliest, grade ${total} the latest.`);
  lines.push('');
  if (batch.length < total) {
    const names = batch.map((id) => rules.gradeName(trackId, id));
    lines.push(`THIS CALL WRITES EXACTLY THESE ${batch.length} GRADES, and nothing else: ${names.join('; ')}.`);
    lines.push('The whole ladder is below so these questions still sit at the right height in it, and what has already been written is listed after it.');
    lines.push('');
  }
  lines.push(`Write exactly ${rules.QUESTIONS_PER_GRADE} questions for every one of the ${batch.length} grades to write, in this order: ${rules.MIX.join(', ')}.`);
  lines.push('');
  lines.push('THE GRADES:');
  gradeIds.forEach((gradeId, i) => {
    const name = rules.gradeName(trackId, gradeId);
    const ramp = rules.gradeRamp(i, total);
    const before = i > 0 ? rules.gradeName(trackId, gradeIds[i - 1]) : null;
    const after = i < total - 1 ? rules.gradeName(trackId, gradeIds[i + 1]) : null;
    lines.push(`${i + 1}. ${name}  [grade_id: ${gradeId}]${batch.includes(gradeId) ? '  ← write this one' : ''}`);
    lines.push(`   difficulty to aim at: about ${ramp} of 10`);
    if (before) lines.push(`   the grade before it: ${before}`);
    if (after) lines.push(`   the grade after it: ${after}`);
  });
  if (opts.written && opts.written.length) {
    lines.push('');
    lines.push(`ALREADY WRITTEN (${opts.written.length} questions). None of these may be repeated — not a phrasing, not a fact, not an example:`);
    for (const row of opts.written) {
      for (const q of row.questions || []) {
        lines.push(`- [${row.grade_id}] ${String(q.prompt || '').slice(0, 160)} → ${String(q.answer || '').slice(0, 60)}`);
      }
    }
  }
  lines.push('');
  lines.push('What each band asks for:');
  for (const band of ['easy', 'medium', 'hard', 'capstone']) {
    lines.push(`- ${band}: ${rules.BANDS[band]}`);
  }
  lines.push('');
  lines.push('The capstone of the last grade should be the hardest question in the whole set, and the easy questions of the first grade the easiest.');
  lines.push('');
  lines.push(`Return every one of the ${batch.length} grades to write, every one with exactly seven questions, and use the grade_id exactly as written above. `
    + 'A reply missing a grade is thrown away and asked for again.');

  return lines.join('\n');
}

/** How many tokens to allow: seven questions a grade, sized generously. */
function tokenBudget(gradeCount) {
  return Math.min(200000, 2000 + gradeCount * rules.QUESTIONS_PER_GRADE * 240);
}

/**
 * Can the answer be found by its shape rather than by knowing it?
 *
 * The loudest giveaway is length: one long, complete answer beside three short
 * fragments is answered by the choices rather than by the learner, and a quarter
 * of the first sets were exactly that. The same rule reads the other way round —
 * one bare answer among three paragraphs is just as findable.
 */
function lengthCue(choices, answer) {
  const answerText = String(answer == null ? '' : answer).trim();
  const options = (Array.isArray(choices) ? choices : []).map((c) => String(c == null ? '' : c).trim());
  const others = options.filter((c) => c !== answerText).map((c) => c.length);
  if (options.length < 3 || !answerText.length || !others.length) return false;
  if (!options.some((c) => c === answerText)) return false;
  const meanOther = others.reduce((a, b) => a + b, 0) / others.length;
  const maxOther = Math.max(...others);
  const longer = answerText.length >= 1.8 * meanOther && answerText.length - maxOther >= 10;
  const shorter = maxOther >= 1.8 * answerText.length && maxOther - answerText.length >= 10;
  return longer || shorter;
}

/**
 * Check the model's answer before it is stored.
 *
 * Returns a list of problems, empty when the set is usable. A set that is short a
 * question is not a slightly worse set — the walk counts on seven, and the stop
 * rule counts on a grade being blank or not, so a five-question grade would be
 * read as a worse learner than sat the quiz.
 */
function inspectSet(result, gradeIds) {
  const problems = [];
  if (!result || !Array.isArray(result.grades)) return ['no grades in the reply'];

  const byId = new Map(result.grades.map((g) => [String(g.grade_id || ''), g]));
  for (const gradeId of gradeIds) {
    const row = byId.get(gradeId);
    if (!row) { problems.push(`${gradeId}: missing`); continue; }
    const questions = Array.isArray(row.questions) ? row.questions : [];
    if (questions.length !== rules.QUESTIONS_PER_GRADE) {
      problems.push(`${gradeId}: ${questions.length} questions, expected ${rules.QUESTIONS_PER_GRADE}`);
      continue;
    }
    questions.forEach((q, i) => {
      if (!q || typeof q.prompt !== 'string' || !q.prompt.trim()) problems.push(`${gradeId} q${i + 1}: no prompt`);
      if (!q || typeof q.answer !== 'string' || !q.answer.trim()) problems.push(`${gradeId} q${i + 1}: no answer`);
      const choices = Array.isArray(q.choices) ? q.choices.filter((c) => String(c || '').trim()) : [];
      if (choices.length && choices.length < 3) problems.push(`${gradeId} q${i + 1}: ${choices.length} choices`);
      if (choices.length && !choices.some((c) => String(c).trim() === String(q.answer).trim())) {
        problems.push(`${gradeId} q${i + 1}: the answer is not among the choices`);
      }
      if (lengthCue(choices, q && q.answer)) problems.push(`${gradeId} q${i + 1}: the answer is identifiable by its length`);
    });
  }
  return problems.slice(0, 20);
}

/** The stored set for a subject, or null. */
function questionSet(trackId) {
  // English is the first calibrated instrument. Keep it in source control so a
  // model rewrite cannot change the difficulty between two learners; other
  // subjects continue to use their stored/generated sets.
  const set = trackId === 'english'
    ? englishPlacement.questionSet()
    : db.findOne(SETS, (s) => s.track_id === trackId) || null;
  return withRevisions(trackId, set);
}

/**
 * Questions replaced after the simulated testers found them mispitched or their
 * key wrong (scripts/placement-testers.js, scripts/revise-placement.js). Kept in
 * content/placement-revisions/<track>.json, by grade and position, so every
 * revision is reviewable on its own and the set underneath stays as written.
 */
const revisionCache = new Map();
function revisionsFor(trackId) {
  const file = path.join(__dirname, '..', 'content', 'placement-revisions', `${trackId}.json`);
  let stamp = 0;
  try { stamp = fs.statSync(file).mtimeMs; } catch { return null; }
  const hit = revisionCache.get(trackId);
  if (hit && hit.stamp === stamp) return hit.data;
  let data = null;
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { data = null; }
  revisionCache.set(trackId, { stamp, data });
  return data;
}

function withRevisions(trackId, set) {
  const revisions = set && revisionsFor(trackId);
  if (!revisions) return set;
  return {
    ...set,
    grades: (set.grades || []).map((g) => {
      const mine = revisions[g.grade_id];
      if (!mine) return g;
      return {
        ...g,
        questions: (g.questions || []).map((q, i) => {
          const r = mine[String(i)];
          return r ? { ...q, topic: r.topic || q.topic, prompt: r.prompt, answer: r.answer, choices: r.choices, revised: r.round || true } : q;
        }),
      };
    }),
  };
}

/** How many grades are written per call. See `writeQuestionSet` for why it is not all of them. */
const GRADES_PER_CALL = Number(process.env.PLACEMENT_GRADES_PER_CALL || 15);

/**
 * Who writes placement questions. By default the `placement` role's provider;
 * PLACEMENT_WRITER=mimo has MiMo V2.6 Pro write them, streamed (the owner's token
 * plan, 2026-10-21: the plan endpoint drops a silent request after about eight
 * minutes, and a stream keeps talking while the model thinks). Returns the data,
 * as `ai.structured` does.
 */
async function placementStructured(args) {
  if (String(process.env.PLACEMENT_WRITER || '').toLowerCase() === 'mimo') {
    // eslint-disable-next-line global-require
    const reply = await require('./providers/mimo').structuredStream({
      role: 'placement', system: args.system, user: args.user, schema: args.schema, schemaName: args.schemaName, maxTokens: Math.min(args.maxTokens || 32000, 64000),
    }).catch((err) => { console.warn(`subject-placement: MiMo could not write (${String(err.message || err).slice(0, 160)})`); return null; });
    return reply && reply.data ? reply.data : null;
  }
  return ai.structured(args);
}

function placementWriterName() {
  return String(process.env.PLACEMENT_WRITER || '').toLowerCase() === 'mimo' ? 'mimo-v2.6-pro' : ((providers.current('placement') || {}).name || null);
}

/** How one question of a reply is kept. The band is the position. See `usable`. */
function storedQuestion(q, i) {
  const row = q && typeof q === 'object' ? q : {};
  const band = rules.MIX[i] || 'medium';
  const stated = String(row.band || '');
  return {
    band,
    stated_band: stated && stated !== band ? stated : null,
    topic: row.topic ? String(row.topic).slice(0, 80) : null,
    prompt: String(row.prompt || ''),
    choices: Array.isArray(row.choices) && row.choices.length ? row.choices.map(String) : null,
    answer: String(row.answer || ''),
    rationale: String(row.rationale || ''),
  };
}

// ── the repair ─────────────────────────────────────────────────────────────

/**
 * The output contract for repairing a question's wrong options.
 */
const REPAIR_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['questions'],
  properties: {
    questions: {
      type: 'array',
      description: 'One entry per question given, carrying the number it arrived with.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['n', 'choices'],
        properties: {
          n: { type: 'integer', description: 'The number the question arrived with, unchanged.' },
          choices: {
            type: 'array',
            items: { type: 'string' },
            description: 'Four options: the same correct answer, exactly as written, among three new wrong ones.',
          },
        },
      },
    },
  },
};

function repairSystemPrompt() {
  return `You fix multiple-choice questions whose wrong options give the answer away.

For each question below the correct answer is findable without knowing the material: it is the only option of its shape — much longer than the rest, much shorter than the rest, or the only complete sentence among fragments. A learner can pick it by looking at the options instead of by knowing the answer.

Rewrite the THREE WRONG options. Leave the question and the correct answer exactly as they are: the same words, unchanged.

The wrong options must be:

- The same kind of thing as the answer: the same units, the same part of speech, the same level of detail, and within about a third of its length. Whatever shape the answer has, all four options have it.
- Each a specific mistake somebody learning this material would actually make — as plausible as the answer to somebody who does not know it. No absurd option, no vaguer option, no option about something else: those can be eliminated without knowing anything.
- Distinct from each other and from the answer. No idea twice in different words.

Return four options per question with the answer among them, and put the answer in a different position for each question. Reply only through the tool.`;
}

/** One line per question to repair: its number, the question, the answer to keep. */
function repairUserPrompt(items) {
  const lines = ['Rewrite the wrong options of these questions. Keep each question and its correct answer word for word.', ''];
  for (const item of items) {
    lines.push(`N${item.n}  [${item.topic || item.grade_id}]`);
    lines.push(`Q: ${item.prompt}`);
    lines.push(`Answer (keep these exact words): ${item.answer}`);
    lines.push(`Options now: ${(item.choices || []).join(' | ')}`);
    lines.push('');
  }
  return lines.join('\n');
}

/**
 * Ask for better wrong options, and take only the ones that are actually better.
 *
 * The repair is checked, not trusted: the answer has to survive word for word,
 * the question keeps four options, and the shape must no longer give it away.
 * A repair that fails any of those changes nothing — the original stands, with
 * the problem that asked for the repair still beside it.
 */
async function repairChoices(items, userId = null, role = 'placement') {
  const result = await placementStructured({
    role,
    system: repairSystemPrompt(),
    user: repairUserPrompt(items),
    schema: REPAIR_SCHEMA,
    schemaName: 'submit_repaired_choices',
    // Room for the thinking as well as the options: a reply cut off before the
    // tool call is a reply that repairs nothing, and the thinking is not small.
    maxTokens: Math.min(50000, 3000 + items.length * 340),
    userId,
    lane: 'background',
  });
  const fixed = new Map();
  // Some models send the list as a JSON string inside the tool call.
  const rows = (() => {
    const v = result && result.questions;
    if (Array.isArray(v)) return v;
    if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p : null; } catch { return null; } }
    return null;
  })();
  if (!rows) return fixed;
  for (const raw of rows) {
    const row = raw && typeof raw.choices === 'string'
      ? { ...raw, choices: (() => { try { return JSON.parse(raw.choices); } catch { return raw.choices; } })() }
      : raw;
    const n = Number(row.n);
    const item = items.find((x) => x.n === n);
    if (!item) continue;
    const choices = Array.isArray(row.choices)
      ? row.choices.map((c) => String(c == null ? '' : c)).filter((c) => c.trim())
      : [];
    if (choices.length !== 4) continue;
    if (!choices.some((c) => c.trim() === item.answer.trim())) continue;
    if (lengthCue(choices, item.answer)) continue;
    fixed.set(n, choices);
  }
  return fixed;
}

/**
 * Write the whole subject's questions, or return null.
 *
 * One subject is one document, but it is written in batches of grades: a reply
 * that has to hold a whole subject's questions with the choices they now need no
 * longer fits in one answer, and what came back was the first handful of grades
 * and then silence. Each batch gets the whole ladder so the set still climbs, and
 * everything written before it so nothing repeats.
 *
 * A batch that comes back short of grades is thrown away and asked for again —
 * and if it is short twice, the whole subject is left as it was. An incomplete
 * set is not a slightly worse set: the walk would ask for a grade that is not
 * there and stop dead in the middle of the subject.
 */
async function writeQuestionSet(trackId, { userId = null } = {}) {
  const gradeIds = rules.gradesFor(trackId);
  if (!gradeIds.length) return null;
  if (!placementWriterName()) return null;

  const rows = [];
  for (let from = 0; from < gradeIds.length; from += GRADES_PER_CALL) {
    const batch = gradeIds.slice(from, from + GRADES_PER_CALL);
    // eslint-disable-next-line no-await-in-loop
    const written = await writeBatch(trackId, gradeIds, batch, rows, userId);
    if (!written) return null;
    rows.push(...written);
  }

  // The questions whose options still give the answer away by their shape are
  // rewritten — the wrong options are the part that is wrong, and the question
  // and its answer are kept exactly. Asked several times and measured: a first
  // pass fixes most of them, and a pass that fixes none is still worth another —
  // measured on a real set, three passes took twenty-nine giveaways down to five
  // where one pass fixed nothing at all.
  // Counted so the note beside the set says how much of it was written twice.
  let repaired = 0;
  for (let pass = 0; pass < 3; pass++) {
    const fixable = [];
    for (const row of rows) {
      (row.questions || []).forEach((q, i) => {
        if (q.choices && lengthCue(q.choices, q.answer)) {
          fixable.push({
            n: fixable.length,
            grade_id: row.grade_id,
            index: i,
            topic: q.topic,
            prompt: q.prompt,
            answer: q.answer,
            choices: q.choices,
          });
        }
      });
    }
    if (!fixable.length) break;
    // eslint-disable-next-line no-await-in-loop
    const fixed = await repairChoices(fixable, userId);
    for (const item of fixable) {
      const choices = fixed.get(item.n);
      if (!choices) continue;
      rows.find((r) => r.grade_id === item.grade_id).questions[item.index].choices = choices;
      repaired++;
    }
  }

  // Checked once more, after the repair: the problems kept beside a set are what
  // the next person reads before deciding whether to rewrite it, and a note
  // describing something the repair already fixed is worse than no note.
  const problems = inspectSet({ grades: rows }, gradeIds);
  const relabelled = [];
  for (const g of rows) {
    for (const q of g.questions) {
      if (q.stated_band) relabelled.push(`${g.grade_id}: a question called ${q.stated_band} sits at a ${q.band} position, so it is scored as ${q.band}`);
    }
  }
  // Which slot the answer sits in, kept so the model's own habit is visible. It
  // no longer reaches the learner — see `spreadChoices` — but a set that answers
  // in one slot is a set whose writer is not listening.
  const answer_slots = [0, 0, 0, 0];
  for (const g of rows) {
    for (const q of g.questions) {
      const at = (q.choices || []).findIndex((c) => String(c).trim() === String(q.answer).trim());
      if (at >= 0 && at < answer_slots.length) answer_slots[at]++;
    }
  }
  const row = db.insert(SETS, {
    track_id: trackId,
    grade_ids: gradeIds,
    model: placementWriterName(),
    grades: rows,
    answer_slots,
    repaired,
    problems,
    relabelled,
    written_at: new Date().toISOString(),
  });
  return row;
}

/**
 * One batch of grades, or null if it could not be written complete.
 *
 * Two attempts, because the failure mode is a reply that stops early — the model
 * returns a handful of grades and closes the object — and that is exactly the
 * kind of answer worth asking again.
 */
async function writeBatch(trackId, allGradeIds, batchGradeIds, written, userId) {
  // Grades that came back whole are kept, and only the rest are asked for again:
  // a reply that stops after two of three grades has done two thirds of the work,
  // and throwing it away made a 49-grade subject fail on any one short reply.
  const done = new Map();
  for (let attempt = 1; attempt <= 4 && done.size < batchGradeIds.length; attempt++) {
    const wanted = batchGradeIds.filter((id) => !done.has(id));
    // eslint-disable-next-line no-await-in-loop
    const result = await placementStructured({
      role: 'placement',
      system: questionSystemPrompt(),
      user: questionUserPrompt(trackId, allGradeIds, {
        batch: wanted,
        written: [...written, ...batchGradeIds.filter((id) => done.has(id)).map((id) => done.get(id))],
      }),
      schema: QUESTION_SCHEMA,
      schemaName: 'submit_placement_questions',
      maxTokens: tokenBudget(wanted.length),
      userId,
      // A minutes-long authoring call must not sit in the lane a coach turn is
      // waiting in.
      lane: 'background',
    });
    // A reply that is not shaped like a reply at all counts as short. It used to
    // fall through to `.map` and throw, which aborted the run for every subject
    // after this one — a malformed answer cost the whole batch of subjects.
    if (!result || !Array.isArray(result.grades)) continue;
    const byId = new Map(result.grades.map((g) => [String(g.grade_id || ''), g]));
    for (const gradeId of wanted) {
      const row = byId.get(gradeId);
      const whole = row && !inspectSet({ grades: [row] }, [gradeId]).some((p) => /missing|questions, expected|no grades/.test(p));
      if (whole) done.set(gradeId, { grade_id: gradeId, questions: row.questions.map(storedQuestion) });
    }
    if (done.size < batchGradeIds.length) {
      console.warn(`subject-placement: ${trackId} batch came back with ${done.size} of ${batchGradeIds.length} grades `
        + `whole (attempt ${attempt})`);
    }
  }
  if (done.size < batchGradeIds.length) return null;
  return batchGradeIds.map((gradeId) => done.get(gradeId));
}

/**
 * Make sure a subject has its questions, without making the request wait.
 *
 * Writing a subject takes minutes and an HTTP request that long is a request that
 * times out, so the first caller starts the work and is told to wait for it. The
 * in-flight set is remembered by track id so a second learner clicking at the
 * same moment joins the first one's call rather than starting another.
 */
const writing = new Map();

function ensureQuestionSet(trackId, userId = null) {
  const existing = questionSet(trackId);
  if (existing) return existing;
  if (writing.has(trackId)) return null;
  if (!providers.current('placement')) return null;

  const task = writeQuestionSet(trackId, { userId })
    .catch((err) => {
      console.warn(`subject-placement: writing ${trackId} failed: ${err.message}`);
      return null;
    })
    .finally(() => writing.delete(trackId));
  writing.set(trackId, task);
  return null;
}

function isWriting(trackId) {
  return writing.has(trackId);
}

// ── the walk ───────────────────────────────────────────────────────────────

function placementFor(userId, trackId) {
  return db.findOne(PLACEMENTS, (p) => p.user_id === userId && p.track_id === trackId) || null;
}

/**
 * Start the walk, or hand back the one already running.
 *
 * Resuming is the default and starting again is asked for, not assumed. A page
 * reload mid-walk is far more common than a deliberate retake, and the first
 * version of this reset the position every time it was called — which meant
 * refreshing the page threw away every grade already answered. The route calls
 * this twice on the way in (once to begin, once once the questions exist), so
 * the difference is not academic.
 *
 * @param {{restart?: boolean}} [opts]
 */
function start(userId, trackId, { restart = false, mode = null, startGradeId = null } = {}) {
  const gradeIds = rules.gradesFor(trackId);
  if (!gradeIds.length) return null;
  const existing = placementFor(userId, trackId);
  if (existing && !restart) return existing;

  const patch = {
    grade_ids: gradeIds,
    position: 0,
    scores: [],
    skipped: [],
    draft: null,
    stop_reason: null,
    recommendation: null,
    recommended_grade_id: null,
    headline: null,
    percent_model: null,
    probabilities: null,
    chosen_grade_id: null,
    catch_up_choice: null,
    finished_at: null,
    started_at: new Date().toISOString(),
    mode: null,
    start_hint: null,
    asked_blocks: [],
    answered: [],
    current_block: null,
    deadline_at: null,
  };
  // Quick, Balanced and Accurate ask where the evidence is thinnest instead of
  // climbing from the first grade (services/adaptive-placement.js). A learner
  // who says where they think they are starts the search there.
  if (adaptive.MODES[mode]) {
    const hint = gradeIds.indexOf(String(startGradeId || ''));
    patch.mode = mode;
    patch.start_hint = hint >= 0 ? hint : null;
    patch.deadline_at = new Date(Date.now() + adaptive.MODES[mode].minutes * 60 * 1000).toISOString();
    const set = questionSet(trackId);
    if (set) {
      const block = adaptive.nextBlock(blocksOf(trackId), [], adaptive.firstTarget(gradeIds.length, patch.start_hint ?? NaN));
      if (block) { patch.current_block = block; patch.position = block.grade; }
    }
  }
  if (existing) return db.update(PLACEMENTS, existing.id, patch);
  return db.insert(PLACEMENTS, { user_id: userId, track_id: trackId, ...patch });
}

/** The subject's question blocks, as the adaptive walk sees them. */
function blocksOf(trackId) {
  return adaptive.blocksFor(rules.gradesFor(trackId).map((id) => questionsFor(trackId, id) || []));
}

function isAdaptive(placement) {
  return !!(placement && adaptive.MODES[placement.mode]);
}

/**
 * What the learner is answering now: a whole grade on the full walk, one block of
 * it on an adaptive one. Each question keeps its index in the grade, which is what
 * answers are saved and scored by.
 */
function currentQuestions(placement) {
  if (!placement) return null;
  const gradeId = (placement.grade_ids || [])[placement.position || 0] || null;
  const all = gradeId ? questionsFor(placement.track_id, gradeId) : null;
  if (!all) return null;
  const idx = isAdaptive(placement) && placement.current_block && placement.current_block.grade === placement.position
    ? placement.current_block.idx
    : all.map((_, i) => i);
  return { grade_id: gradeId, questions: idx.map((i) => sanitize(all[i], i)) };
}

/**
 * Hand in one block of an adaptive walk, update the belief, and pick the next
 * block — or finish, when the belief is narrow enough for the mode, the mode's
 * cap is reached, or its clock has run out.
 */
function submitBlock(userId, trackId, answers, { partial = false } = {}) {
  const placement = placementFor(userId, trackId);
  if (!placement || !isAdaptive(placement)) return { error: 'no adaptive placement running' };
  const block = placement.current_block;
  if (!block) return { error: 'nothing is being asked' };
  const gradeId = placement.grade_ids[block.grade];
  const questions = questionsFor(trackId, gradeId);
  if (!questions) return { error: 'no questions for that grade' };

  const given = new Map();
  const draft = placement.draft && placement.draft.grade_id === gradeId ? placement.draft.answers || {} : {};
  for (const key of Object.keys(draft)) given.set(Number(key), String(draft[key] == null ? '' : draft[key]));
  for (const a of Array.isArray(answers) ? answers : []) given.set(Number(a.index), String(a.answer == null ? '' : a.answer));

  const bands = {};
  const detail = [];
  const answered = [...(placement.answered || [])];
  let correct = 0;
  for (const i of block.idx) {
    const q = questions[i];
    const said = given.has(i) ? given.get(i) : '';
    if (partial && !String(said).trim()) continue;
    const verdict = grading.grade({ format: q.choices ? 'multiple_choice' : 'type_in', prompt: q.prompt, choices: q.choices, answer: q.answer, accepts: [] }, said);
    const right = !!(verdict && verdict.correct);
    const band = bands[q.band] || (bands[q.band] = { asked: 0, correct: 0 });
    band.asked++;
    if (right) { band.correct++; correct++; }
    detail.push({ band: q.band, correct: right, prompt: String(q.prompt).slice(0, 220), given: String(said).slice(0, 100), answer: String(q.answer).slice(0, 100) });
    // An empty answer is the "I don't know" button: not a guess, so the belief allows no luck for it.
    answered.push({ pos: adaptive.positionOf(q, block.grade), guess: q.choices ? 1 / q.choices.length : 0.02, correct: right, ...(!String(said).trim() ? { idk: true } : {}) });
  }
  if (!detail.length && !partial) return { error: 'Answer at least one question first.' };

  const scores = detail.length
    ? [...(placement.scores || []), { grade_id: gradeId, part: block.part, asked: detail.length, correct, bands, answers: detail }]
    : placement.scores || [];
  const asked = [...(placement.asked_blocks || []), { grade: block.grade, part: block.part }];
  const post = adaptive.posterior(placement.grade_ids.length, answered);
  // The clock only ends a walk that has its minimum answers. A learner who stepped away mid-quiz was stopped
  // after 4 answers and placed three grades up on them (owner, 2026-10-29).
  const late = placement.deadline_at && Date.now() >= Date.parse(placement.deadline_at)
    && answered.length >= adaptive.limits(placement.mode, placement.grade_ids.length).min;
  const allBlocks = blocksOf(trackId);
  const ctx = { topLeft: adaptive.topLeft(placement.grade_ids.length, allBlocks, asked) };
  const next = adaptive.done(placement.mode, answered, post, ctx) || late || partial
    ? null
    : adaptive.nextBlock(allBlocks, asked, adaptive.nextTarget(answered, post, ctx));

  const updated = db.update(PLACEMENTS, placement.id, {
    scores,
    answered,
    asked_blocks: asked,
    current_block: next,
    position: next ? next.grade : placement.position,
    draft: null,
    stop_reason: next ? null : (late ? 'the clock ran out' : partial ? 'learner quit' : 'sure enough'),
    finished_at: next ? null : new Date().toISOString(),
  });
  return {
    grade_id: gradeId,
    correct,
    asked: detail.length,
    stopped: !next,
    skip: null,
    next_grade_id: next ? placement.grade_ids[next.grade] : null,
    placement: updated,
  };
}

/**
 * Every answer a walk holds, as {pos, guess, correct}, pos in grades from the
 * start of the subject. An adaptive walk keeps exactly that. The full climb
 * keeps only per-grade answer lists, so each is found again in its grade's
 * questions for its calibrated point, or placed by its band.
 */
function evidenceOf(trackId, placement) {
  if (!placement) return [];
  if ((placement.answered || []).length) return placement.answered.filter((a) => Number.isFinite(a.pos));
  const gradeIds = placement.grade_ids || rules.gradesFor(trackId);
  const out = [];
  for (const score of placement.scores || []) {
    const gi = gradeIds.indexOf(score.grade_id);
    if (gi < 0) continue;
    const questions = questionsFor(trackId, score.grade_id) || [];
    for (const a of score.answers || []) {
      const q = questions.find((x) => String(x.prompt).slice(0, 220) === a.prompt);
      const pos = q ? adaptive.positionOf(q, gi) : gi + (adaptive.BAND_AT[a.band] ?? 0.5);
      out.push({ pos, guess: q && q.choices ? 1 / q.choices.length : 0.25, correct: !!a.correct });
    }
  }
  return out;
}

/**
 * For every grade, the probability (whole percents adding up to 100) that it is
 * the right grade to start in: the share of the walk's belief that falls in it
 * (services/adaptive-placement.js posterior), not scaled to the strongest grade.
 * Works for any walk with answers, adaptive or the full climb. On the full
 * climb the recommended grade comes from the model or the shape of the answers,
 * so it can differ from the most probable grade here; `most_likely_grade_id`
 * says which that is. Null when nothing was answered.
 */
function probabilitiesFor(trackId, placement) {
  if (!placement) return null;
  const gradeIds = placement.grade_ids || rules.gradesFor(trackId);
  const evidence = evidenceOf(trackId, placement);
  if (!gradeIds.length || !evidence.length) return null;
  const post = adaptive.posterior(gradeIds.length, evidence);
  const rec = adaptive.recommend(gradeIds.length, post, evidence);
  return {
    model: 'posterior-v1',
    most_likely_grade_id: gradeIds[rec.index],
    grades: gradeIds.map((id, i) => ({
      grade_id: id,
      name: rules.gradeName(trackId, id),
      probability: rec.probabilities[i],
      mass: Math.round(rec.mass[i] * 1e6) / 1e6,
    })),
  };
}

/** The recommendation an adaptive walk makes on its own: no model, the belief itself. */
function recommendAdaptive(trackId, placement) {
  const gradeIds = placement.grade_ids || rules.gradesFor(trackId);
  const post = adaptive.posterior(gradeIds.length, placement.answered || []);
  const rec = adaptive.recommend(gradeIds.length, post, placement.answered || []);
  const name = rules.gradeName(trackId, gradeIds[rec.index]);
  return {
    recommendation: gradeIds.map((id, i) => ({
      grade_id: id,
      percent: rec.percents[i],
      probability: rec.probabilities[i],
      why: i === rec.index ? 'where your answers place you' : rec.percents[i] >= 50 ? 'close to where your answers place you' : '',
    })),
    recommended_grade_id: gradeIds[rec.index],
    headline: `Start at ${name}. ${rec.sure >= 0.95
      ? 'Your answers point here clearly.'
      : 'Your answers point here; the grades either side are close, and the first lessons will confirm it.'}`,
    percent_model: `adaptive-${placement.mode}`,
  };
}

/** The state the quiz page draws from: which grade, which questions, what is left. */
function stateFor(userId, trackId) {
  const placement = placementFor(userId, trackId);
  const set = questionSet(trackId);
  const gradeIds = rules.gradesFor(trackId);
  return {
    track_id: trackId,
    track_name: (curriculum.getTrack(trackId) || {}).name || trackId,
    grade_count: gradeIds.length,
    ready: !!set,
    writing: isWriting(trackId),
    // A provider is only needed to write a new question set. Existing calibrated
    // questions (including English's source-controlled set) remain playable offline.
    available: !!set || !!providers.current('placement'),
    placement,
    percent: placement && placement.recommendation ? placement.recommendation : null,
    // Every grade's probability of being the right start, once the walk is done.
    result: placement && placement.recommendation ? resultFor(trackId, placement) : null,
    // For the mode picker: the grades to say "I think I'm about here" from, and
    // each mode's clock.
    grades: gradeIds.map((id) => ({ grade_id: id, name: rules.gradeName(trackId, id) })),
    // The mode the learner's goal for this subject suggests (null with none, and for
    // the owner); the picker marks it, and the learner still chooses.
    // eslint-disable-next-line global-require
    suggested_mode: require('./goals').placementMode(userId, trackId, null),
    // The whole budget: this walk, then the one inside the chosen grade.
    modes: Object.fromEntries(Object.entries(adaptive.MODES).map(([k, m]) => [k, {
      minutes: m.minutes,
      total_minutes: adaptive.WHOLE_MINUTES[k] || m.minutes + ((unitPlacement.MODES[k] || {}).minutes || 0),
      max_questions: m.max,
    }])),
  };
}

/**
 * A question is what its position says it is, and its options have to contain
 * its answer.
 *
 * The band comes from the position, not from the label the model put on it. The
 * order is the specification — two easy, then two medium, then two hard, then the
 * capstone — and it is the order the learner actually meets the questions in, so
 * the seventh question is the capstone whether or not it was called that. One
 * grade in eighty-eight came back as three easy, two medium and one hard: scored
 * by its own labels, a missed medium question would have been reported to the
 * recommendation as a missed easy one, which is the strongest signal there is
 * that a learner is not ready for a grade. The label is kept beside it as
 * `stated_band` so the disagreement is visible rather than silently corrected.
 *
 * The options are the other thing a model gets wrong. Occasionally its reasoning
 * runs on into the option text and the answer never appears among the choices
 * (1 question in 343 on the math set). Left alone the question is unanswerable:
 * the learner cannot pick the right option because it is not there, so the grade
 * they are shown is one question worse than the one they sat. The options are
 * what is wrong, not the question, so it is kept and asked as free response.
 *
 * Both are applied here, where the question is read, rather than only when it is
 * written, so a set stored before either rule existed is repaired too.
 */
function usable(question, index) {
  const band = rules.MIX[index] || question.band || 'medium';
  const choices = Array.isArray(question.choices)
    ? question.choices.map((c) => String(c == null ? '' : c)).filter((c) => c.trim())
    : null;
  const answer = String(question.answer || '').trim();
  const answerable = choices && choices.length >= 3 && choices.some((c) => c.trim() === answer);
  return { ...question, band, choices: answerable ? choices : null };
}

/**
 * The order the learner sees, deliberately not the order it was written in.
 *
 * The first sets had the answer in the first slot 93% of the time, so "pick the
 * first one" was a working strategy. The writer is now told not to do that — and
 * this makes it unobservable either way, for every set however old: the choices
 * are put in a different order on the way out, one that is derived from the
 * question's own text. The same question therefore always arrives in the same
 * order (a learner going back to it must not see the options dance), no question
 * needs its order remembered anywhere, and marking is by answer text, so the
 * order it is checked in has never mattered.
 */
function spreadChoices(question, index, questions) {
  const choices = Array.isArray(question.choices) ? question.choices : null;
  if (!choices || choices.length < 3) return question;
  // Hash the full item before shuffling. The earlier prompt hash and LCG sent
  // every answer in this English bank to display slot D.
  const text = `${question.prompt}\u0000${question.answer || ''}`;
  let seed = 2166136261;
  for (let i = 0; i < text.length; i++) {
    seed ^= text.charCodeAt(i);
    seed = Math.imul(seed, 16777619) >>> 0;
  }
  const spread = choices.slice();
  for (let i = spread.length - 1; i > 0; i--) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    const j = (seed >>> 0) % (i + 1);
    const swap = spread[i];
    spread[i] = spread[j];
    spread[j] = swap;
  }

  // Balance correct-answer positions across each seven-question grade, while
  // deriving the sequence from that grade's text so it stays stable but avoids
  // both repeated positions and an obvious A/B/C/D cycle.
  if (choices.length === 4 && Number.isInteger(index) && Array.isArray(questions)) {
    const gradeText = questions.map((q) => q.prompt).join('\u0000');
    let positionSeed = 2166136261;
    for (let i = 0; i < gradeText.length; i++) {
      positionSeed ^= gradeText.charCodeAt(i);
      positionSeed = Math.imul(positionSeed, 16777619) >>> 0;
    }
    function nextPositionRandom() {
      positionSeed ^= positionSeed << 13;
      positionSeed ^= positionSeed >>> 17;
      positionSeed ^= positionSeed << 5;
      return positionSeed >>> 0;
    }
    const positions = [0, 0, 1, 1, 2, 2, 3];
    for (let attempt = 0; attempt < 32; attempt++) {
      for (let i = positions.length - 1; i > 0; i--) {
        const j = nextPositionRandom() % (i + 1);
        [positions[i], positions[j]] = [positions[j], positions[i]];
      }
      if (!positions.some((value, i) => i > 0 && value === positions[i - 1])) break;
    }
    if (positions.some((value, i) => i > 0 && value === positions[i - 1])) {
      positions.splice(0, positions.length, 0, 1, 2, 3, 0, 1, 2);
    }
    const desired = positions[index % positions.length];
    const answerIndex = spread.indexOf(question.answer);
    const [answer] = spread.splice(answerIndex, 1);
    spread.splice(desired, 0, answer);
  }
  return { ...question, choices: spread };
}

/** The seven questions for one grade, with the answers stripped for the browser. */
function questionsFor(trackId, gradeId) {
  const set = questionSet(trackId);
  if (!set) return null;
  const row = (set.grades || []).find((g) => g.grade_id === gradeId);
  if (!row) return null;
  const calibration = calibrationFor(trackId);
  return row.questions.map(usable).map((question, index, questions) => {
    const spread = spreadChoices(question, index, questions);
    const pos = calibration ? calibration[adaptive.questionKey(spread)] : undefined;
    return Number.isFinite(pos) ? { ...spread, pos } : spread;
  });
}

/**
 * Where each question really sits, for the adaptive walk: the mean of two
 * independent judges' readings of it (scripts/placement-second-judge.js
 * calibrate), in content/placement-calibration/<track>.json, keyed by
 * adaptive.questionKey. A question without an entry is placed by its band.
 *
 * Calibrating on where questions sit instead of where they were written for is
 * what a placement test does with its items. Measured on simulated testers,
 * calibrated on one judge and tested against the other: 124-128 of 128 placed
 * within one grade, against 98-115 on the written positions.
 */
const calibrationCache = new Map();
function calibrationFor(trackId) {
  const file = path.join(__dirname, '..', 'content', 'placement-calibration', `${trackId}.json`);
  let stamp = 0;
  try { stamp = fs.statSync(file).mtimeMs; } catch { return null; }
  const hit = calibrationCache.get(trackId);
  if (hit && hit.stamp === stamp) return hit.data;
  let data = null;
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')).points || null; } catch { data = null; }
  calibrationCache.set(trackId, { stamp, data });
  return data;
}

/**
 * What the browser is allowed to see of a question: never the answer, and never
 * the band.
 *
 * The band is left out on purpose. "This one is the capstone" is exactly the
 * thing that would make a learner stop trying on it, and the whole point of the
 * seventh question is to find out whether they can do it, not whether they will
 * attempt it. The reply carries enough to render the question and nothing that
 * hints at how hard it is supposed to be.
 */
function sanitize(question, index) {
  return {
    index,
    format: question.choices ? 'multiple_choice' : 'type_in',
    prompt: question.prompt,
    choices: question.choices || null,
  };
}

/**
 * Save one answer the moment it is given.
 *
 * The walk used to collect a grade's seven in the browser and send them all at
 * the end, so a page closed at question six lost six answers and a learner who
 * was not sure whether their work was kept could not find out. Now every answer
 * lands here as it is made: reloading returns the grade exactly as it was left,
 * and going back to an earlier question finds what was put there.
 *
 * Only the grade the walk is standing on can be answered. A learner who has
 * moved past a grade has moved past it — that is the same line the "previous"
 * button draws in the page.
 */
function recordAnswer(userId, trackId, gradeId, index, answer) {
  const placement = placementFor(userId, trackId);
  if (!placement) return { error: 'no placement running' };
  const current = (placement.grade_ids || [])[placement.position || 0] || null;
  if (!current || gradeId !== current) return { error: 'that grade is not the one being answered' };
  const questions = questionsFor(trackId, gradeId);
  if (!questions) return { error: 'no questions for that grade' };
  const at = Number(index);
  if (!Number.isInteger(at) || at < 0 || at >= questions.length) return { error: 'no such question' };

  const answers = placement.draft && placement.draft.grade_id === gradeId
    ? { ...(placement.draft.answers || {}) }
    : {};
  answers[String(at)] = String(answer == null ? '' : answer).slice(0, 2000);
  const draft = { grade_id: gradeId, answers, saved_at: new Date().toISOString() };
  db.update(PLACEMENTS, placement.id, { draft });
  return { saved: true, question: at, answered: Object.keys(answers).length, asked: questions.length };
}

/**
 * Score one grade's answers and move the walk on.
 *
 * @param {Array<{index: number, answer: string}>} answers
 */
function submitGrade(userId, trackId, gradeId, answers, { partial = false } = {}) {
  const placement = placementFor(userId, trackId);
  if (!placement) return { error: 'no placement running' };
  const questions = questionsFor(trackId, gradeId);
  if (!questions) return { error: 'no questions for that grade' };

  // What was saved as it was given, then anything this request carries on top.
  // The two agree in practice; the merge is what makes a grade submit fail
  // halfway through cost nothing.
  const given = new Map();
  const draft = placement.draft && placement.draft.grade_id === gradeId ? placement.draft.answers || {} : {};
  for (const key of Object.keys(draft)) given.set(Number(key), String(draft[key] == null ? '' : draft[key]));
  for (const a of Array.isArray(answers) ? answers : []) given.set(Number(a.index), String(a.answer == null ? '' : a.answer));
  let correct = 0;
  // Kept per band as well as in total: "four of seven" is a weaker signal than
  // "the easy and medium ones, and nothing past that", and the second is what
  // tells the model where in the grade this learner actually stopped.
  const bands = {};
  // And question by question, which is everything else there is: what was asked,
  // what they put, and whether it was right. The recommendation is meant to come
  // from every piece of context rather than from a count, and a tally throws away
  // exactly the part that carries the meaning — which topic the miss was on, and
  // whether a wrong answer was a near miss or a different subject entirely.
  const detail = [];
  const clip = (text, n) => String(text == null ? '' : text).slice(0, n);
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const item = {
      format: q.choices ? 'multiple_choice' : 'type_in',
      prompt: q.prompt,
      choices: q.choices,
      answer: q.answer,
      accepts: [],
    };
    const said = given.has(i) ? given.get(i) : '';
    if (partial && !String(said).trim()) continue;
    const verdict = grading.grade(item, said);
    const band = bands[q.band] || (bands[q.band] = { asked: 0, correct: 0 });
    band.asked++;
    if (verdict && verdict.correct) { correct++; band.correct++; }
    detail.push({
      band: q.band,
      format: item.format,
      correct: !!(verdict && verdict.correct),
      topic: clip(q.topic, 80) || null,
      prompt: clip(q.prompt, 220),
      given: clip(said, 100),
      answer: clip(q.answer, 100),
    });
  }

  if (!detail.length) return { error: 'Answer at least one question first.' };

  const scores = [...(placement.scores || []), {
    grade_id: gradeId,
    asked: detail.length,
    correct,
    bands,
    answers: detail,
  }];
  const position = (placement.position || 0) + 1;

  const stopped = rules.shouldStop(scores);
  const offer = stopped ? null : rules.skipOffer(scores, position, placement.grade_ids.length);
  const atEnd = position >= placement.grade_ids.length;

  const updated = db.update(PLACEMENTS, placement.id, {
    scores,
    position,
    // The grade is scored now, so what was saved while answering it has done its
    // job. Keeping it would leave a draft pointing at a grade the walk has left,
    // which is exactly what `recordAnswer` refuses to write to.
    draft: null,
    stop_reason: stopped ? 'three blank grades and a weak fourth' : (atEnd ? 'the end of the subject' : null),
    finished_at: stopped || atEnd ? new Date().toISOString() : null,
  });

  return {
    grade_id: gradeId,
    correct,
    asked: questions.length,
    stopped: stopped || atEnd,
    skip: offer,
    next_grade_id: stopped || atEnd ? null : placement.grade_ids[position],
    placement: updated,
  };
}

/**
 * Quit is a real finish, not a discarded draft. A partial grade records only the
 * questions actually answered; unanswered questions are uncertainty, not wrong
 * answers. That distinction keeps leaving early from falsely pushing a learner
 * below the grade they were working on.
 */
function quit(userId, trackId, gradeId, answers) {
  const placement = placementFor(userId, trackId);
  if (!placement) return { error: 'no placement running' };
  const current = (placement.grade_ids || [])[placement.position || 0] || null;
  if (current && gradeId && current !== gradeId) return { error: 'that grade is not the one being answered' };

  const target = gradeId || current;
  let outcome = { placement };
  if (target) {
    const submitted = isAdaptive(placement)
      ? submitBlock(userId, trackId, answers, { partial: true })
      : submitGrade(userId, trackId, target, answers, { partial: true });
    if (!submitted.error) outcome = submitted;
    else if (submitted.error !== 'Answer at least one question first.') return submitted;
  }

  const updated = db.update('subject_placements', placement.id, {
    stop_reason: 'learner quit',
    finished_at: new Date().toISOString(),
    draft: null,
  });
  return { ...outcome, placement: updated, quit: true };
}

/** Step over the offered grades. Returns the new next grade. */
function skip(userId, trackId, count) {
  const placement = placementFor(userId, trackId);
  if (!placement) return { error: 'no placement running' };
  const offer = rules.skipOffer(placement.scores || [], placement.position || 0, placement.grade_ids.length);
  if (!offer) return { error: 'no skip is on offer' };
  const take = Math.max(1, Math.min(offer.count, Number(count) || offer.count));
  const skipped = [...(placement.skipped || []), { from: offer.from, count: take }];
  const position = offer.from + take;
  const atEnd = position >= placement.grade_ids.length;
  const updated = db.update(PLACEMENTS, placement.id, {
    skipped,
    position,
    stop_reason: atEnd ? 'the end of the subject' : placement.stop_reason,
    finished_at: atEnd ? new Date().toISOString() : placement.finished_at,
  });
  return { skipped: take, next_grade_id: atEnd ? null : placement.grade_ids[position], placement: updated };
}

// ── the recommendation ─────────────────────────────────────────────────────

/**
 * Every grade gets a percentage, including the ones never reached.
 *
 * Not a distribution: these do not add up to anything, and asking for them to
 * would force the model to spread a hundred points over forty-nine grades and
 * make every number meaningless. Each is its own answer to "how strongly would
 * you tell this learner to start here".
 */
const RECOMMEND_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['recommended_grade_id', 'headline', 'grades'],
  properties: {
    recommended_grade_id: { type: 'string' },
    headline: { type: 'string', description: 'One sentence to the learner: where to start, and the single strongest reason.' },
    grades: {
      type: 'array',
      description: 'Every grade of the subject, in order, each with the percentage to show beside it.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['grade_id', 'percent'],
        properties: {
          grade_id: { type: 'string' },
          percent: { type: 'integer', minimum: 0, maximum: 100 },
          why: { type: 'string', description: 'A few words on why this grade scored what it did.' },
        },
      },
    },
  },
};

function recommendSystemPrompt() {
  return `You read one learner's placement quiz and tell them, for every grade in the subject, how strongly you recommend they start there.

The quiz walked the grades in order and the learner answered seven questions per grade until the questions stopped being answerable. You are given exactly what they scored, band by band.

Every grade's seven are asked in the same fixed order: two easy, two medium, two hard, then one capstone. The capstone is written so that only somebody who has worked through every level of that grade can answer it — it is the question that separates having met a grade from having finished it. The seven are therefore not seven equal votes, and reading them as though they were is the easiest way to get this wrong:

- Missing an easy question is the strongest evidence there is that they are not ready for that grade. Somebody who cannot do the first thing a grade teaches is not placed by how they did on the rest of it.
- Missing a medium or hard question is ordinary evidence: the grade is partly held.
- Missing the capstone says very little on its own. It is pitched at the end of the grade's work, so most people who belong at that grade still miss it. Do not read "capstone 0/1" as a failure, and never let it outweigh a missed easy question.
- Getting the capstone is the strongest evidence in that grade that it is genuinely finished — worth more than any other single question there.
- A grade whose easy and medium questions are all right and whose capstone is missed is a grade they hold. Do not recommend starting there on the strength of the capstone alone.

What the percentage is:

- It is a recommendation, not a score. A grade they sailed through scores LOW, because the useful answer is "you already have this — do not start here", not 100%. The highest percentage belongs where they should actually begin.
- They are independent. They do not sum to 100 or to anything else. Do not spread a fixed number of points across the grades; score each one on its own evidence.
- A grade that is clearly already known gets a small number, not zero. Zero means "this grade is not where you are at all".

What the percentage is NOT is a count of how many were answered. It must never be a straight line in the number right: which of the seven were right is the whole signal, and the number right is the one part of the answer that carries none of it. Two grades with four right can be ninety points apart, and should be.

The shape that fixes the curve, from the worked example that asked for it:

- Four right — both easy and both medium, nothing above — is the strongest start-here signal there is: about 90.
- Five right (that core plus one hard) is about 75. Six right (core plus both hard) is about 50. Every hard question cleared on top of the core is grade already outgrown, so the number comes DOWN as they clear more of it.
- All seven right is about 20: the grade is finished, and the answer there is "you have this — start above it".

Those numbers describe the shape of the curve; they are not a table to apply whatever the context. Each grade's line carries "the shape of the answers alone" — the percentage its own answers produce with nothing else considered. Start there, and move it only for what an answer pattern cannot see: the grades around it, a stumble that recovers or deepens into a collapse, which topics the misses were on, questions skipped rather than answered, and how hard this grade's questions were pitched against the rest of the subject. Never move it because more or fewer were answered.

How to read the pattern — this is the whole job:

- A clean run of grades answered completely right is ground they already hold. Those grades score low, and the longer the run, the more certain that is.
- The first grade where they stopped getting everything right is a candidate: they have some of it and not all of it. That is what a starting point looks like.
- Where a stumble is followed by a recovery — later grades answered completely right again — the stumble was probably noise, and the grades after it are also held. Score the stumble meaningfully but not as the winner.
- Where a stumble is followed by worse, and worse, and then a run of grades answered entirely wrong, the first grade of that decline is the real frontier. It is the strongest single candidate in the whole quiz and should score highest.
- Grades inside a collapse score low even if they were not blank, because the learner had already stopped being able to answer.
- A run of blank grades at the end is the floor. Those grades score zero, and so does everything past them. The learner cannot answer questions at that level; recommending they start there wastes their time.

Be decisive about where the peak is. A learner reading this wants one obvious answer with a few nearby alternatives, not forty grades that all look equally plausible. If the evidence is thin — a short set, or grades skipped rather than answered — say so in the headline and keep the peak where the evidence actually points.

Where questions were skipped over rather than answered, there is no evidence for those grades: score them on their neighbours, and do not give them a percentage as confident as one that was measured.

Reply only through the tool.`;
}

/**
 * One grade's whole line: what it teaches, how hard it was pitched, every
 * question asked and what the learner put — including the empty ones.
 *
 * Everything is here on purpose. A percentage that is meant to come from every
 * piece of context can only be as good as the context it is given, and the
 * tally the first version sent ("easy 2/2, hard 0/2") had already thrown away
 * which topic the miss was on and whether the wrong answer was a near miss.
 */
function recommendUserPrompt(trackId, placement, options = {}) {
  const gradeIds = placement.grade_ids || rules.gradesFor(trackId);
  const total = gradeIds.length;
  const scores = new Map((placement.scores || []).map((s) => [s.grade_id, s]));
  const skippedAt = new Map();
  for (const s of placement.skipped || []) {
    for (let i = s.from; i < s.from + s.count; i++) skippedAt.set(i, true);
  }
  const lines = [];
  const track = curriculum.getTrack(trackId);
  const bands = ['easy', 'medium', 'hard', 'capstone'];

  lines.push(`SUBJECT: ${track ? track.name : trackId}`);
  lines.push('The grades, in the order they were walked. Grade 1 is the earliest and the easiest, the last is the latest and the hardest.');
  lines.push('Every grade is seven questions in the same fixed order: 2 easy, 2 medium, 2 hard, 1 capstone. '
    + 'The capstone is the one only somebody who finished every level of that grade can answer, so it is the weakest signal when it is missed '
    + 'and the strongest when it is passed.');
  lines.push('Each grade below carries what it teaches, the difficulty its own seven were pitched at on the subject\'s 1-10 ladder, '
    + 'every question with what the learner put against the answer, and "the shape of the answers alone" — the percentage its answers produce '
    + 'with nothing else considered.');
  lines.push('');

  gradeIds.forEach((gradeId, i) => {
    const name = rules.gradeName(trackId, gradeId);
    const score = scores.get(gradeId);
    lines.push(`${i + 1}. ${name}  [grade_id: ${gradeId}]`);

    // What the grade teaches: its own words, and the topics its questions come
    // from. A miss on a topic is a different fact from a miss on another one.
    const grade = curriculum.getGrade(trackId, gradeId);
    if (grade) {
      if (grade.blurb) lines.push(`   teaches: ${String(grade.blurb).slice(0, 200)}`);
      const topics = (grade.skills || []).map((s) => curriculum.skillName(s)).filter(Boolean);
      if (topics.length) {
        lines.push(`   topics: ${topics.slice(0, 16).join(', ')}${topics.length > 16 ? `, and ${topics.length - 16} more` : ''}`);
      }
    }
    lines.push(`   pitched at (1-10): ${bands.map((b) => `${b} ${rules.difficultyFor(i, total, b)}`).join(', ')}`);

    if (score) {
      const tally = score.bands || {};
      const bandText = bands
        .filter((b) => tally[b])
        .map((b) => `${b} ${tally[b].correct}/${tally[b].asked}`)
        .join(', ');
      lines.push(`   answered: ${score.correct} of ${score.asked} right${bandText ? `  (${bandText})` : ''}`);
      for (const a of score.answers || []) {
        const mark = a.correct ? 'right' : (a.given ? 'WRONG' : 'BLANK');
        const asked = a.topic ? `"${a.prompt}"  [${a.topic}]` : `"${a.prompt}"`;
        lines.push(`     ${a.band} ${mark}: ${asked}`
          + (a.correct ? '' : ` — they put ${a.given ? `"${a.given}"` : 'nothing'}, the answer is "${a.answer}"`));
      }
      lines.push(`   the shape of the answers alone: ${rules.shapePercent(score)}`);
    } else if (skippedAt.get(i)) {
      lines.push('   skipped: not answered, no evidence for this grade');
    } else {
      lines.push('   not reached: the quiz stopped before this grade');
    }
  });

  lines.push('');
  if (options.availableNote) lines.push(options.availableNote);
  lines.push('');
  lines.push(`The quiz stopped after ${(placement.scores || []).length} of ${total} grades. Reason: ${placement.stop_reason || 'the learner finished'}.`);
  lines.push(`Give every one of the ${total} grades a percentage, using the grade_id exactly as written.`);

  return lines.join('\n');
}

/**
 * The recommendation with no model involved: the shape of the answers alone.
 *
 * The same numbers the prompt anchors on, read mechanically — so the feature
 * still answers when the model is down, and so the percentages can never fall
 * back to a count. What it cannot see is what the model is for: the trajectory
 * across grades, and which topic a miss was on. The one cross-grade rule it does
 * apply is the floor: a run of blank grades at the end of the walk is where the
 * subject closed over the learner's head, so those grades score zero and so does
 * everything past them.
 */
function recommendFromShape(trackId, placement) {
  const gradeIds = placement.grade_ids || rules.gradesFor(trackId);
  const scores = new Map((placement.scores || []).map((s) => [s.grade_id, s]));
  const blankRun = new Set();
  const walked = placement.scores || [];
  for (let i = walked.length - 1; i >= 0 && walked[i].correct === 0; i--) blankRun.add(walked[i].grade_id);

  const recommendation = gradeIds.map((id) => {
    const score = scores.get(id) || null;
    const percent = !score || blankRun.has(id) ? 0 : rules.shapePercent(score);
    return { grade_id: id, percent, why: shapeWhy(score, blankRun.has(id)) };
  });

  // The peak, and ties break toward the later grade: if the core of two grades
  // in a row is already theirs, the later one is the front of what they know.
  // When nothing scored at all there is no peak to point at, and the subject
  // simply starts at its beginning.
  let best = recommendation[0];
  for (const r of recommendation) if (r.percent >= best.percent) best = r;
  const named = best.percent > 0 ? best : recommendation[0];
  const name = rules.gradeName(trackId, named.grade_id);

  return {
    recommendation,
    recommended_grade_id: named.grade_id,
    headline: named.percent > 0
      ? `Start at ${name}. The shape of your answers peaks there — the material below it is already yours, and this is where the work starts.`
      : `Start at ${name}. Nothing in the walk was answerable yet, so the subject starts at its beginning.`,
    percent_model: null,
  };
}

/**
 * English uses a deterministic calibrated recommendation. The question set is
 * fixed, so sending the same evidence to a model would add variance without
 * adding information. Each grade is scored independently, then the sequence is
 * used to keep passed grades low while preserving a non-zero uncertainty tail for
 * grades that were skipped or never reached.
 */
function recommendEnglishFromShape(trackId, placement) {
  const gradeIds = placement.grade_ids || rules.gradesFor(trackId);
  const scores = new Map((placement.scores || []).map((s) => [s.grade_id, s]));
  const ordered = placement.scores || [];

  function accuracy(score, band) {
    const row = score && score.bands && score.bands[band];
    if (!row || !row.asked) return null;
    return row.correct / row.asked;
  }

  function readiness(score) {
    if (!score || !(score.asked > 0)) return null;
    const weights = { easy: 0.35, medium: 0.30, hard: 0.20, capstone: 0.15 };
    let readiness = 0;
    let observedWeight = 0;
    for (const [band, weight] of Object.entries(weights)) {
      const value = accuracy(score, band);
      if (value === null) continue;
      readiness += value * weight;
      observedWeight += weight;
    }
    // A short sitting is evidence, but not as strong as a complete grade. Pull
    // the estimate toward the middle rather than treating one answer as a grade.
    const confidence = Math.min(1, score.asked / 7);
    const normalized = observedWeight ? readiness / observedWeight : score.correct / score.asked;
    return normalized * confidence + 0.5 * (1 - confidence);
  }

  function directNeed(score) {
    const value = readiness(score);
    if (value === null) return null;
    return Math.max(6, Math.min(96, Math.round((1 - value) * 100)));
  }

  // A learner who clears the two easy and two medium items but misses one of
  // the hard items is near the grade, not past it. Treat that 5/7 shape as the
  // boundary so only a genuinely complete grade can move the recommendation on.
  const FIRST_SUBSTANTIAL_GAP_NEED = 20;

  const measured = gradeIds.map((id) => ({ id, score: scores.get(id) || null }));
  const firstGap = measured.findIndex(({ score }, index) => {
    const need = directNeed(score);
    // A single missed advanced item is not enough to define the starting grade.
    // The gap must be substantial, and a partially answered grade cannot be the
    // only evidence for a hard placement call.
    if (!(score && score.asked >= 5 && need >= FIRST_SUBSTANTIAL_GAP_NEED)) return false;
    const nextTwo = measured.slice(index + 1, index + 3);
    return !nextTwo.some(({ score: later }) => readiness(later) >= 0.72);
  });

  const recommendation = gradeIds.map((id, index) => {
    const score = scores.get(id);
    const direct = directNeed(score);
    if (direct === null) {
      const distance = firstGap >= 0 && index > firstGap ? index - firstGap : index;
      return {
        grade_id: id,
        percent: Math.max(12, Math.min(34, 34 - distance * 3)),
        why: placement.skipped && placement.skipped.length ? 'not measured; estimated from nearby grades' : 'not reached yet; provisional estimate',
      };
    }

    const prior = index > 0 ? readiness(measured[index - 1].score) : null;
    const priorPrior = index > 1 ? readiness(measured[index - 2].score) : null;
    const current = readiness(score);
    const strongRecovery = current >= 0.72;
    const laterGap = firstGap >= 0
      && index > firstGap
      && index - firstGap >= 3
      && priorPrior !== null
      && prior >= 0.72
      && priorPrior >= 0.72
      && current < 0.72;

    let percent;
    let why;
    if (firstGap < 0) {
      percent = Math.max(6, Math.min(30, direct));
      why = 'strong command; no substantial gap was measured';
    } else if (index < firstGap) {
      percent = Math.max(6, Math.min(28, direct));
      why = 'strong command before the first substantial gap';
    } else if (index === firstGap) {
      percent = Math.max(72, Math.min(96, direct + 32));
      why = 'the first substantial gap in the sequence';
    } else if (laterGap) {
      percent = Math.max(62, Math.min(90, direct + 20));
      why = 'a later gap after a strong measured recovery';
    } else if (strongRecovery) {
      percent = Math.max(6, Math.min(22, direct));
      why = 'strong measured recovery; likely ready to skip this grade';
    } else {
      // A low score after the first gap is expected: the quiz has moved above the
      // learner's demonstrated ceiling. Keep it nonzero, but do not let harder
      // unmastered grades outrank the first grade that needs teaching.
      percent = Math.max(12, Math.min(38, Math.round(direct * 0.35)));
      why = 'above the first gap; lower confidence than the grade to work on first';
    }
    return {
      grade_id: id,
      percent,
      why,
    };
  });

  let best = recommendation[0] || { grade_id: null, percent: 0 };
  // When no substantial gap exists, equal low percentages mean "already past
  // this grade". Prefer the later measured grade in that tie so an advanced
  // learner is not sent back to an earlier course merely because several passed
  // grades share the same uncertainty floor.
  for (const row of recommendation) {
    if (row.percent > best.percent || (row.percent === best.percent && firstGap < 0)) best = row;
  }
  if (firstGap < 0) {
    // One noisy 5/7 grade must not outweigh a sustained strong run later in the
    // walk. Require two adjacent complete grades above the command threshold so
    // an isolated lucky score cannot move an advanced learner to the wrong end.
    let latestSustained = -1;
    for (let index = 1; index < measured.length; index++) {
      if (readiness(measured[index - 1].score) >= 0.72
        && readiness(measured[index].score) >= 0.72) latestSustained = index;
    }
    if (latestSustained >= 0 && recommendation[latestSustained]) best = recommendation[latestSustained];
  }
  const name = rules.gradeName(trackId, best.grade_id);
  const thin = ordered.some((s) => s.asked < 7) || (placement.skipped || []).length > 0;
  return {
    recommendation,
    recommended_grade_id: best.grade_id,
    headline: `Start at ${name}. ${thin ? 'Some grades were not fully measured, so the surrounding percentages keep a little uncertainty.' : 'The highest percentage marks the first grade that still needs focused work.'}`,
    percent_model: 'calibrated-english-v1',
  };
}

/** One short line on why a grade's answers produced what they did. */
function shapeWhy(score, blanked) {
  if (!score || !(score.asked > 0)) return 'not reached in this walk';
  if (blanked) return 'the walk closed over their head here';
  if (!score.correct) return 'nothing right here';
  const bands = score.bands || {};
  const core = (bands.easy ? bands.easy.correct : 0) + (bands.medium ? bands.medium.correct : 0);
  const top = (bands.hard ? bands.hard.correct : 0) + (bands.capstone ? bands.capstone.correct : 0);
  if (core === 4 && !top) return 'the core is theirs and nothing past it';
  if (top >= 3) return 'already finished';
  if (core === 4) return 'the core is theirs and part of the top';
  return 'part of the grade is already theirs';
}

/**
 * Ask the model where this learner belongs, and store what it says.
 *
 * The model gets every piece of context there is — question by question, the
 * topics the misses were on, the pitch of each grade's seven, the whole walk —
 * and each grade's mechanical prior to move with it. When it cannot answer at
 * all, the shape of the answers stands on its own rather than the feature
 * showing nothing: those percentages are narrower evidence, and the record says
 * so by carrying no model name.
 */
async function recommend(userId, trackId, options = {}) {
  const placement = placementFor(userId, trackId);
  if (!placement) return null;

  // An adaptive walk decides from its own belief: no model call (and nothing it
  // could add — the belief already uses every answer).
  const result = trackId === 'english' || isAdaptive(placement) ? null : (providers.current('placement')
    ? await ai.structured({
      role: 'placement',
      system: recommendSystemPrompt(),
      user: recommendUserPrompt(trackId, placement, options),
      schema: RECOMMEND_SCHEMA,
      schemaName: 'submit_placement_recommendation',
      maxTokens: 6000,
      userId,
      lane: 'background',
    })
    : null);

  const gradeIds = placement.grade_ids || [];
  let decided;
  if (isAdaptive(placement)) {
    decided = recommendAdaptive(trackId, placement);
  } else if (trackId === 'english') {
    decided = recommendEnglishFromShape(trackId, placement);
  } else if (result && Array.isArray(result.grades)) {
    const seen = new Map();
    for (const g of result.grades) {
      const id = String(g.grade_id || '');
      if (!gradeIds.includes(id)) continue;
      const pct = Math.max(0, Math.min(100, Math.round(Number(g.percent) || 0)));
      seen.set(id, { grade_id: id, percent: pct, why: String(g.why || '').slice(0, 240) });
    }
    // A grade the model left out is a grade the picker would show nothing for, so
    // it is filled in at zero rather than dropped: "no recommendation" and "not
    // where you are" read the same to a learner, and only one of them is true.
    const recommendation = gradeIds.map((id) => seen.get(id) || { grade_id: id, percent: 0, why: '' });

    const recommended = gradeIds.includes(String(result.recommended_grade_id))
      ? String(result.recommended_grade_id)
      : recommendation.slice().sort((a, b) => b.percent - a.percent)[0].grade_id;

    decided = {
      recommendation,
      recommended_grade_id: recommended,
      headline: String(result.headline || '').slice(0, 400),
      percent_model: (providers.current('placement') || {}).name || null,
    };
  } else {
    decided = recommendFromShape(trackId, placement);
  }

  // The probabilities come from the walk's own belief whatever made the
  // recommendation, so every result can say "how likely each grade is".
  const probabilities = probabilitiesFor(trackId, placement);
  return db.update(PLACEMENTS, placement.id, { ...decided, probabilities, finished_at: new Date().toISOString() });
}

/**
 * The result a page shows for a finished walk, the same shape from /finish,
 * /quit and anywhere else: the recommended grade, every grade with its
 * probability of being the right start (adding up to 100), and the older
 * `percent` list. Probabilities missing from a row written before they existed
 * are worked out from its answers. The learner may start at any grade
 * (chooseGrade); the recommended one is the most probable.
 */
/**
 * What a placement rests on, in plain terms for the result screen: how many questions were answered and how sure the
 * walk is (the share of its belief within one grade of the placed grade, services/adaptive-placement.js). Nothing is
 * claimed that was not measured: with no usable answers the basis is null (06-M3: a placement is a measurement and
 * reports its precision).
 */
function basisOf(trackId, placement) {
  const evidence = evidenceOf(trackId, placement);
  if (!evidence.length) return null;
  const gradeIds = placement.grade_ids || rules.gradesFor(trackId);
  const post = adaptive.posterior(gradeIds.length, evidence);
  const sure = adaptive.massWithin(post, adaptive.median(post) - 1, adaptive.median(post) + 1);
  return {
    questions: evidence.length,
    sure_percent: Math.round(sure * 100),
    certainty: sure >= 0.95 ? 'clear' : sure >= 0.8 ? 'fair' : 'rough',
  };
}

function resultFor(trackId, placement) {
  if (!placement) return null;
  const probabilities = placement.probabilities || probabilitiesFor(trackId, placement);
  const byId = new Map(((probabilities && probabilities.grades) || []).map((g) => [g.grade_id, g.probability]));
  return {
    recommended_grade_id: placement.recommended_grade_id,
    recommended_grade_name: rules.gradeName(trackId, placement.recommended_grade_id),
    headline: placement.headline || '',
    percent: placement.recommendation,
    probabilities: (placement.grade_ids || []).map((id) => ({
      grade_id: id,
      name: rules.gradeName(trackId, id),
      probability: byId.has(id) ? byId.get(id) : null,
      recommended: id === placement.recommended_grade_id,
    })),
    probability_model: probabilities ? probabilities.model : null,
    most_likely_grade_id: probabilities ? probabilities.most_likely_grade_id : null,
    chosen_grade_id: placement.chosen_grade_id || null,
    basis: basisOf(trackId, placement),
    walk_grade_id: placement.walk_grade_id || placement.recommended_grade_id || null,
    adjustments: (placement.adjustments || []).map((a) => ({ said: a.said, from: a.from, to: a.to, at: a.at })),
    grades: (placement.grade_ids || []).map((id) => ({ grade_id: id, name: rules.gradeName(trackId, id) })),
    scores: placement.scores || [],
  };
}

/**
 * "This is too easy" / "this is too hard" on the result: moves the recommendation one grade up or down (clamped to
 * the subject) and records what the learner said and where the walk had put them, so the correction is never lost
 * and the walk's own placement stays on the record (`walk_grade_id`). Returns {placement} or {error, status}.
 */
function adjust(userId, trackId, said) {
  if (!['too_easy', 'too_hard'].includes(said)) return { error: 'Say whether it was too easy or too hard.', status: 400 };
  const placement = placementFor(userId, trackId);
  if (!placement || !placement.recommended_grade_id) return { error: 'Finish the quiz first.', status: 400 };
  const gradeIds = placement.grade_ids || rules.gradesFor(trackId);
  const at = gradeIds.indexOf(placement.recommended_grade_id);
  if (at < 0) return { error: 'That placement has no grade to move from.', status: 400 };
  const to = Math.max(0, Math.min(gradeIds.length - 1, at + (said === 'too_easy' ? 1 : -1)));
  const now = new Date().toISOString();
  const updated = db.update(PLACEMENTS, placement.id, {
    walk_grade_id: placement.walk_grade_id || placement.recommended_grade_id,
    recommended_grade_id: gradeIds[to],
    adjustments: [...(placement.adjustments || []), { said, from: gradeIds[at], to: gradeIds[to], at: now }],
  });
  return { placement: updated, moved: to !== at };
}

/**
 * Start at any grade of the subject: the learner's own pick from the result,
 * recommended or not. Enrolls them there the way choosing a grade on the
 * catalog does (routes/catalog.js: a new enrollment waits for its in-grade
 * placement), or hands back the enrollment they already have, and remembers the
 * pick on the walk. Returns {enrollment, created, recommended} or {error, status}.
 */
function chooseGrade(userId, trackId, gradeId) {
  const gradeIds = rules.gradesFor(trackId);
  if (!gradeIds.includes(String(gradeId || ''))) return { error: 'That grade is not part of this subject.', status: 400 };
  const grade = curriculum.getGrade(trackId, gradeId);
  if (!grade) return { error: 'That grade is not available.', status: 400 };
  let enrollment = db.findOne('enrollments', (e) => e.user_id === userId && e.track_id === trackId && e.grade_id === gradeId);
  const created = !enrollment;
  if (!enrollment) {
    enrollment = db.insert('enrollments', {
      user_id: userId,
      track_id: trackId,
      grade_id: gradeId,
      target_level: grade.pathLength,
      current_level: 1,
      level_items: 0,
      levels_completed: 0,
      xp: 0,
      status: 'placement_pending',
      pending_checkpoint: null,
      placed_at: null,
    });
    db.update('users', userId, { onboarded: true });
  }
  const placement = placementFor(userId, trackId);
  if (placement) db.update(PLACEMENTS, placement.id, { chosen_grade_id: gradeId, chosen_at: new Date().toISOString() });
  return { enrollment, created, recommended: !!(placement && placement.recommended_grade_id === gradeId) };
}

module.exports = {
  basisOf,
  adjust,
  QUESTION_SCHEMA,
  RECOMMEND_SCHEMA,
  questionSystemPrompt,
  questionUserPrompt,
  recommendSystemPrompt,
  recommendUserPrompt,
  tokenBudget,
  inspectSet,
  lengthCue,
  repairChoices,
  questionSet,
  writeQuestionSet,
  ensureQuestionSet,
  isWriting,
  placementFor,
  start,
  stateFor,
  questionsFor,
  usable,
  spreadChoices,
  sanitize,
  recordAnswer,
  submitGrade,
  submitBlock,
  currentQuestions,
  isAdaptive,
  recommendAdaptive,
  evidenceOf,
  probabilitiesFor,
  resultFor,
  chooseGrade,
  skip,
  recommend,
  recommendFromShape,
  recommendEnglishFromShape,
  quit,
};
