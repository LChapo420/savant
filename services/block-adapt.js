/**
 * One adapter between the learning spec (services/learning-spec.js) and every built-in level a block writer makes: block lessons
 * and retention levels (block-levels.js), game question sets (game-payloads.js) and Master / Grand Master / Final checkpoints
 * (block-checkpoints.js), for math, English, IQ and Spanish alike. Written 2 Nov 2026 (subjects audit gaps 6, 8, 10, 13).
 *
 * Before this, a built-in level got the spec only as the general lines inside the learner brief (details.js), with nothing
 * that fixed a number (length, blocks, checks, examples), nothing that told a game or a checkpoint how its questions are shaped,
 * nothing per subject, and no check that the writer followed any of it. Uploaded material (notes, podcast, lessons from the
 * legacy writer) already had all of that (checkFollowed + one revision). This gives built-in levels the same depth with the
 * same pieces, and no copy of them:
 *
 *   begin()   the spec for one learner and one level, and from it the lines each call gets:
 *               layout      how many blocks and checks, in what order of difficulty, in what answer formats
 *               fill        words, examples per idea, worked steps, hints, explanation detail, interests, subject wording
 *               game        the question shape (tier mix and order, formats, explanation, wording, theme), subject wording
 *               checkpoint  presentation only: answer format, explanation detail and tone, wording, setting. Never difficulty,
 *                           hints or skills (a checkpoint measures the skill; the blueprint is the same for everyone)
 *   revise()  learning-spec.reviseOnce on a writer's reply: the same checkFollowed (key points kept, interests used, dislikes
 *             avoided, sentence length, vocabulary, hint and profile leaks, length against the learner's time) and one revision.
 *
 * An empty spec (a learner we know nothing about, the shared base version, the owner under the owner-base rule) gives
 * `active: false` and every line empty, so the prompts are exactly what they were (scripts/block-diff.js proves it).
 * Memory-kind measures stay out, as everywhere (03-M5). Numbers here are limits on the page, never facts about the learner.
 */
const ls = require('./learning-spec');

const KINDS = ['lesson', 'retention', 'game', 'checkpoint'];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const list = (a) => (a || []).filter(Boolean);
const ofTrack = (trackId) => (['math', 'english', 'iq', 'spanish'].includes(trackId) ? trackId : null);

/** The spec for one learner at one level: topic and skills in, so the example domains suit the topic. null for no learner. */
function specFor(userId, where, context) {
  if (!userId) return null;
  try {
    return ls.buildSpec(userId, { trackId: where.trackId, gradeId: where.gradeId, topic: (context && context.topic) || null, skillIds: (context && context.skills) || [] });
  } catch { return null; }
}
const activeSpec = (spec) => !!(spec && !spec.isDefault);

// ── per-subject wording ─────────────────────────────────────────────────────
// Only what differs by subject: how a worked step, an example and a question look in each. Chosen by the spec's own fields.
const domainsOf = (spec) => ((spec.interests && spec.interests.exampleDomains) || []).slice(0, 3);
const useDomains = (spec) => (domainsOf(spec).length && spec.interests.share >= 0.3 ? domainsOf(spec).join(', ') : null);
const SUBJECT_LINES = {
  math(spec, kind) {
    const out = [];
    const worked = spec.explain.numberedSteps || spec.scaffolding.level >= 0.65 || spec.practice.workedExamples >= 2;
    if (kind !== 'game' && kind !== 'checkpoint' && worked) out.push('Every worked example writes one operation per line, numbered, with the reason in a few words beside it; the learner can follow each line without the next.');
    if (spec.explain.notation === 'words-first') out.push('Say each operation in words the first time (add 3 to both sides) and show the symbols after.');
    else if (spec.explain.notation === 'symbols') out.push('Use standard symbols and notation from the first line.');
    const d = useDomains(spec);
    if (d) out.push(`Word problems and examples are set in ${d}; the numbers, the operations and every answer are exactly what the topic needs, and the setting adds no quantity of its own.`);
    return out;
  },
  english(spec) {
    const out = [];
    const d = useDomains(spec);
    if (d) out.push(`Model sentences, passages and examples are about ${d}; every model sentence is correct English, and a wrong or weak one is always labelled as wrong and shown with its fix.`);
    if (spec.explain.contrastLookalikes || spec.explain.misconception) out.push('Put look-alike words, forms or punctuation side by side and give the one test that tells them apart.');
    if (spec.language.eslSupport || spec.language.avoidIdioms) out.push('Avoid idioms and phrasal verbs in the explanations; give a short plain gloss for any uncommon word.');
    return out;
  },
  iq(spec) {
    const out = ['State each pattern or rule in one plain sentence before the puzzles; every puzzle is solved by that rule alone, and the explanation names the cue that gives the answer away.'];
    if (spec.learning && spec.learning.dualCoding && spec.learning.dualCoding.on) out.push('Describe any figure or arrangement fully in words (shapes, counts, positions, order) so the puzzle can be solved from the words.');
    const d = useDomains(spec);
    if (d) out.push(`Puzzle stories and objects may come from ${d}; the logic, the options and the answer stay exactly what the reasoning skill needs.`);
    return out;
  },
  spanish(spec) {
    const out = ['Give every new Spanish word or phrase an English gloss at first use; always write accents, "¿" and "¡"; the explanations are in plain English.'];
    const d = useDomains(spec);
    if (d) out.push(`Example sentences and dialogues are about ${d}, in Spanish the learner's grade can read; each is correct, natural Spanish.`);
    if (spec.language.eslSupport) out.push('Keep the English in the explanations to short, simple sentences.');
    return out;
  },
};
function subjectLines(spec, trackId, kind) {
  const t = ofTrack(trackId);
  return t ? SUBJECT_LINES[t](spec, kind) : [];
}

// ── the lines each call gets ────────────────────────────────────────────────
/** How the checks are ordered: from the spec's difficulty start and ramp (the same words as the question shape). */
function orderLine(spec) {
  const d = spec.difficulty;
  const start = d.startOffset <= -0.5 ? 'the first is clearly easier than the level' : d.startOffset >= 0.5 ? 'the first is already at or above the level' : 'the first is at the level';
  const step = d.rampLabel === 'steep' ? 'each next one a clear step harder' : d.rampLabel === 'gradual' ? 'each next one only slightly harder' : 'each next one a little harder';
  return `${start}, ${step}`;
}

function layoutLines(spec, kind) {
  const range = kind === 'retention' ? { blocks: [3, 6], checks: [3, 6] } : { blocks: [4, 10], checks: [2, 5] };
  const minutes = spec.lesson.minutes;
  const blocks = clamp(Math.round(minutes / 1.6), range.blocks[0], range.blocks[1]);
  const checks = clamp(Math.round(spec.learning && spec.learning.retrieval ? spec.learning.retrieval.questions : spec.lesson.retrievalChecks), range.checks[0], range.checks[1]);
  const typed = spec.practice.typedAnswers;
  const lines = [
    `Size: this learner has about ${minutes} minutes for the level, so plan about ${blocks} blocks (never fewer than the points need; if the points need more, split the blocks, do not cut a point) and about ${checks} graded checks.`,
    typed >= 0.7 ? 'Make most checks type_in.' : typed <= 0.3 ? 'Make most checks multiple_choice.' : 'Mix multiple_choice and type_in checks.',
    `Order the checks by difficulty: ${orderLine(spec)}.`,
  ];
  if (spec.lesson.warmupItems >= 2) lines.push('Open with a block that warms up what the learner already knows, before anything new.');
  return lines;
}

function fillLines(spec, kind, trackId) {
  const l = spec.lesson; const p = spec.practice; const lang = spec.language; const f = spec.feedback;
  const lines = [
    `Length: all the text of all the blocks together stays under about ${l.wordBudget} words (the learner has about ${l.minutes} minutes): cut repeats and padding first, never a point of the coverage.`,
    `Wording: reading grade ${lang.vocabularyGrade}; most sentences ${lang.maxSentenceWords} words or fewer; at most ${l.maxNewTerms} new terms in any one block.`,
    `Examples: ${p.examplesPerIdea} example${p.examplesPerIdea === 1 ? '' : 's'} per idea${p.workedExamples >= 1 ? `, ${p.workedExamples} of them fully worked, every step shown` : ', none fully worked before the learner tries'}.`,
    `Check questions: ${ls.questionShape(spec).replace(/^Questions: /, '')}`,
  ];
  if (spec.scaffolding.hintInChecks) lines.push('Every check has a hint of one line (a nudge toward the idea, never the answer); do not leave the hint empty.');
  else lines.push('Leave every check\'s hint empty.');
  if (f.granularity === 'brief') lines.push('Every check\'s rationale is one short sentence.');
  if (kind === 'retention') lines.push('Every block makes the learner produce or recognise from memory; nothing re-teaches at length.');
  lines.push(...subjectLines(spec, trackId, kind));
  const d = useDomains(spec);
  if (d && !ofTrack(trackId)) lines.push(`Use ${d} for the examples where it fits naturally; they add no fact of their own.`);
  return lines;
}

function gameLines(spec, trackId) {
  const out = [ls.questionShape(spec), ...subjectLines(spec, trackId, 'game')];
  const d = useDomains(spec);
  if (d) out.push(`Theme: set scenarios in ${d} where it fits naturally; the theme never changes a question's skill, its single correct option or its difficulty.`);
  out.push(`Difficulty order inside the fixed range: ${orderLine(spec)}.`);
  return out;
}

/** Presentation only: a checkpoint's skill, difficulty and hints are the course's, the same for everyone. */
function checkpointLines(spec, trackId) {
  const f = spec.feedback; const lang = spec.language; const typed = spec.practice.typedAnswers;
  const out = [
    typed >= 0.7 ? 'Lean toward type_in for the slots where a short exact answer is natural.' : typed <= 0.3 ? 'Lean toward multiple_choice for the slots where the choices are natural.' : null,
    f.granularity === 'detailed' ? 'Each rationale is two or three sentences: why the right answer is right and why the tempting wrong one fails.' : f.granularity === 'brief' ? 'Each rationale is one short sentence: the right answer and the single fix.' : 'Each rationale is one or two sentences.',
    f.tone.correction === 'gentle' ? 'Word every rationale gently: say what is right first.' : null,
    f.lowStakes ? 'Low stakes: never use the words test, exam, timed, score or graded in a question or a rationale.' : null,
    `Wording: reading grade ${lang.vocabularyGrade}; question prompts of ${lang.maxSentenceWords + 4} words or fewer where the idea allows.`,
    ...subjectLines(spec, trackId, 'checkpoint'),
    'None of this changes a slot\'s skill or difficulty, and no question gets a hint.',
  ];
  return list(out);
}

/**
 * How long the learner wants to remember this subject (services/retention-goal.js) as one line for the lesson writer: a test close by asks for
 * the shortest route to recall; a horizon of months or longer asks for the one thing to carry away from each idea. Nothing for "forever" (the
 * default), and nothing unless BLOCK_GOAL=on (not yet proven at lesson level). Never throws.
 */
function goalLine(userId, where) {
  if (String(process.env.BLOCK_GOAL || 'off').toLowerCase() !== 'on') return null; // off until a lesson-level proof passes (docs/MODIFICATION-AUDIT-PARTS.md)
  try {
    const rg = require('./retention-goal'); // eslint-disable-line global-require
    const db = require('../config/db'); // eslint-disable-line global-require
    const e = (db.forUser('enrollments', userId).find((x) => x.track_id === where.trackId && x.grade_id === where.gradeId) || null);
    if (!e) return null;
    const g = rg.forEnrollment(userId, e);
    if (g.status === 'date' && g.days_left <= 30) return `They have a test on ${g.test_date} (${g.days_left} days): after each idea give the one thing to be able to recall for it, and keep side points out; every fact stays.`;
    if (g.status === 'date') return `They want to keep this for a test on ${g.test_date}: end each idea with the one thing to be able to recall later.`;
    if (g.status === 'horizon') return 'They want to remember this for the long run: end each idea with the one thing to carry away, said once, plainly.';
    return null;
  } catch { return null; }
}

/**
 * Everything one level write needs from the spec.
 * @returns {{active: boolean, spec: object|null, layout: string, fill: string, game: string, checkpoint: string}}
 */
function begin({ userId, where, kind, context }) {
  const none = { active: false, spec: null, layout: '', fill: '', game: '', checkpoint: '' };
  if (!KINDS.includes(kind) || !userId || String(process.env.BLOCK_ADAPT || 'on').toLowerCase() === 'off') return none;
  const spec = specFor(userId, where, context);
  if (!activeSpec(spec)) return none;
  const trackId = where.trackId;
  const block = (title, lines) => (lines.length ? `\n${title}:\n${lines.map((x) => `- ${x}`).join('\n')}` : '');
  const head = 'FOR THIS LEARNER AT THIS LEVEL (from their full learning profile; the numbers are limits on the page; never mention the profile; where this conflicts with an earlier note it wins, and the coverage and every fact stay as they are)';
  try {
    if (kind === 'lesson' || kind === 'retention') {
      const fill = fillLines(spec, kind, trackId);
      const goal = goalLine(userId, where);
      if (goal) fill.push(goal);
      return {
        active: true, spec, layout: block(head, layoutLines(spec, kind)), fill: block(head, fill), game: '', checkpoint: '',
      };
    }
    if (kind === 'game') return { active: true, spec, layout: '', fill: '', game: block(head, gameLines(spec, trackId)), checkpoint: '' };
    return { active: true, spec, layout: '', fill: '', game: '', checkpoint: block('FOR THIS LEARNER (presentation only; from their full learning profile; never mention it)', checkpointLines(spec, trackId)) };
  } catch { return none; }
}

// ── the check and one revision ──────────────────────────────────────────────
const SKIP_KEYS = new Set(['id', 'index', 'type', 'kind', 'tag', 'block', 'color', 'colour', 'icon', 'emoji', 'url', 'src', 'image', 'fen', 'format', 'level', 'seconds', 'minutes', 'count', 'answer', 'answerIndex', 'accepts', 'correct', 'slot', 'skill', 'skill_id', 'style']);
/** Every sentence-bearing string in a reply's data (block data, check prompts and rationales), in order. */
function textOf(value, depth = 0) {
  if (value == null || depth > 8) return [];
  if (typeof value === 'string') return /[A-Za-zÀ-ÿ]{3,}/.test(value) && value.trim().split(/\s+/).length >= 2 ? [value.trim()] : [];
  if (Array.isArray(value)) return value.flatMap((v) => textOf(v, depth + 1));
  if (typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => (SKIP_KEYS.has(k) ? [] : textOf(v, depth + 1)));
  return [];
}
const wordCount = (strings) => (strings.join(' ').match(/[A-Za-zÀ-ÿ'-]+/g) || []).length;

/**
 * Write once, check against the spec, write once more with the problems named, keep the better draft (learning-spec.reviseOnce).
 * `generate(note)` returns the model's reply (or null); `parts(reply)` returns { teach: [strings], checks: [strings] } to check.
 * With an inactive adapter this is just generate(null).
 */
async function revise(a, { generate, parts, keyFacts = [], topic = '', wordLimit = true, interestNeed = null }) {
  if (!a || !a.active) return { result: await generate(null), revised: false, problems: [], checked: false };
  const view = (r) => { const p = parts(r) || { teach: [], checks: [] }; return { teach: p.teach || [], checks: p.checks || [] }; };
  const run = await ls.reviseOnce({
    generate,
    textOf: (r) => { const v = view(r); return [...v.teach, ...v.checks].join(' '); },
    structureOf: wordLimit ? (r) => ({ words: wordCount(view(r).teach) }) : null,
    spec: a.spec,
    keyFacts,
    exempt: String(topic || '').toLowerCase().match(/[a-zà-ÿ]{4,}/g) || [],
    minShare: 0.3,
    interestNeed,
  });
  return { result: run.result, revised: !!run.revised, problems: (run.problems || []).map((p) => p.id), before: (run.before || []).map((p) => p.id), checked: true, stats: run.stats || null };
}

module.exports = { begin, goalLine, revise, textOf, wordCount, specFor, subjectLines, layoutLines, fillLines, gameLines, checkpointLines, KINDS };
