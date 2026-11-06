/**
 * Every model task in the app, and what stands between its text and a learner (read by services/fact-guard.js on every answer; docs/FACT-COVERAGE.md is the
 * table for people; scripts/fact-coverage-test.js fails when a task in the code has no row here, or a shown task has no row in the doc).
 *
 *   kind: 'inline'      checked by the guard before the caller gets it
 *           mode        general (against general knowledge) | source (against the source the caller gives) | material (the learner's own upload decides) |
 *                       overlay (a layer over a checked lesson: no fact of its own)
 *           live        a learner is waiting: fast lane, and a chat that is held gets a fixed sentence
 *           budgetMs    how long the check may take before it counts as "could not run"
 *           pieces(d)   splits structured output: [{ text, drop }]; only the flagged piece is removed, on a copy
 *           atLeast(d)  after drops: is enough left to show? Otherwise nothing is shown
 *           html        the text is a page: tags are stripped before the check
 *   kind: 'downstream'  `by` names the verifier later in the same pipeline, `file` the file it lives in, `symbol` a word the test finds there
 *   kind: 'internal'    the output is never shown to a learner; `why` says what it is
 *   kind: 'exempt'      shown, but holds no claim of fact; `why` says why (the owner asked for this list: keep it short)
 */
const LIVE_MS = 7000;
const dropper = (arr, i) => () => { arr[i] = null; };
const compact = (d, key) => { if (Array.isArray(d[key])) d[key] = d[key].filter(Boolean); };

/** One text per array element, with a drop that removes it; the array is compacted when `atLeast` runs, so numbering stays right while dropping. */
function each(d, key, render) {
  const arr = Array.isArray(d[key]) ? d[key] : [];
  return arr.map((x, i) => ({ text: render(x), drop: dropper(arr, i) }));
}
const q = (x) => [x.prompt, Array.isArray(x.choices) && x.choices.length ? `Choices: ${x.choices.join(' | ')}` : '', x.answer !== undefined && x.answer !== null && x.answer !== '' ? `Key: ${x.answer}` : '', x.answerIndex !== undefined ? `Key: choice ${Number(x.answerIndex) + 1}` : '', x.answer_index !== undefined ? `Key: choice ${Number(x.answer_index) + 1}` : '', x.rationale ? `Explanation: ${x.rationale}` : '', x.explanation ? `Explanation: ${x.explanation}` : '', x.hint ? `Hint: ${x.hint}` : ''].filter(Boolean).join(' / ');
const items = (key) => ({ pieces: (d) => each(d, key, q), atLeast: (d) => { compact(d, key); return Array.isArray(d[key]) && d[key].length > 0; } });

function lessonPieces(d) {
  const l = d.lesson || d;
  const out = [];
  for (const key of ['paragraphs', 'key_points']) {
    const arr = Array.isArray(l[key]) ? l[key] : [];
    arr.forEach((t, i) => out.push({ text: String(t), drop: dropper(arr, i) }));
  }
  return out;
}
const lessonLeft = (d) => { const l = d.lesson || d; compact(l, 'paragraphs'); compact(l, 'key_points'); return Array.isArray(l.paragraphs) && l.paragraphs.length > 0; };

const CHAT = { kind: 'inline', mode: 'general', live: true, budgetMs: LIVE_MS };

const TASKS = {
  // ── the tutor: live chat, read whole before it is shown ─────────────────────────────────────────────────────
  dock_help: { ...CHAT, what: 'The tutor dock on every page', source: 'the page the learner is on', ifHeld: 'a fixed sentence saying the reply was held (and one more try first when the check found a mistake)' },
  assist_help: { ...CHAT, what: 'Help inside a lesson part, a page, and the home chat', source: 'the part or page they are on; none at home (general knowledge)', ifHeld: 'a fixed sentence' },
  coach_turn: { ...CHAT, what: 'The question coach before answering, and the opener written ahead', source: 'the question, key and stored explanation', ifHeld: 'a fixed sentence; a held opener is not stored' },
  tutor_explain: { ...CHAT, what: '"Ask about this" after answering', source: 'the question, key and stored explanation', ifHeld: 'a fixed sentence' },
  remediation_teach: { ...CHAT, what: 'The teaching chat after a failed checkpoint or essay', source: 'what they got wrong and the diagnosis', ifHeld: 'a fixed sentence' },

  // ── written for one learner, before it is stored or shown ──────────────────────────────────────────────────
  part_layer: {
    kind: 'inline', mode: 'overlay', budgetMs: 7000, what: 'The instant personal layer over a shared lesson', source: 'the shared lesson, which already passed the level check', ifHeld: 'that piece is dropped; with too little left, no layer and the lesson stays open',
    pieces: (d) => {
      const out = [];
      if (d.why) out.push({ text: d.why, drop: () => { d.why = ''; } });
      if (d.hook) out.push({ text: d.hook, drop: () => { d.hook = ''; } });
      (Array.isArray(d.analogies) ? d.analogies : []).forEach((a, i) => { out.push({ text: `${a.point ? `(about: ${a.point}) ` : ''}${a.text}`, drop: dropper(d.analogies, i) }); });
      return out;
    },
    atLeast: (d) => { compact(d, 'analogies'); return [!!d.why, !!d.hook, (d.analogies || []).length > 0].filter(Boolean).length >= 2; },
  },
  part_modify: { kind: 'inline', mode: 'source', budgetMs: 45000, what: 'Rewrites of feedback, hints, review prompts and stored uploaded lessons', source: 'the stored text being rewritten, with its question and key', ifHeld: 'the stored text stays; it was checked when it was written' },
  level_editor: { kind: 'inline', mode: 'source', html: true, budgetMs: 90000, what: 'A level page rewritten for one learner', source: 'the shared base page', ifHeld: 'the shared base page, or the ordinary session' },
  choice_pair: { kind: 'inline', mode: 'general', budgetMs: 45000, what: 'The two short explanations the learner chooses between', source: 'general knowledge', ifHeld: 'no choice is offered' },
  personalize_read: { kind: 'inline', mode: 'general', budgetMs: 45000, what: 'The after-level read, whose confirmed facts the scorecard page shows', source: 'general knowledge; statements about the learner are their own evidence (support from 2+ reads before they show)', ifHeld: 'that read is not stored' },
  analyze_session: { kind: 'inline', mode: 'general', budgetMs: 45000, what: 'The debrief at the end of a session', source: 'general knowledge', ifHeld: 'the rule-based debrief, which holds no model text' },

  // ── questions and answers ──────────────────────────────────────────────────────────────────────────────────
  author_items: { kind: 'inline', mode: 'general', budgetMs: 120000, ...items('items'), what: 'Generated practice questions', source: 'general knowledge, working the key out', ifHeld: 'that question is dropped; the bank fills the rest' },
  regen_items: { kind: 'inline', mode: 'general', budgetMs: 120000, ...items('items'), what: 'Fresh questions for a checkpoint retry', source: 'general knowledge, working the key out', ifHeld: 'that question is dropped; the bank fills the rest' },
  checkpoint_fill: { kind: 'inline', mode: 'general', budgetMs: 120000, ...items('items'), what: 'Master quizzes, Grand Master quizzes and the Final written for one learner', source: 'general knowledge, working the key out', ifHeld: 'that question is dropped; the bank fills its slot' },
  game_questions: { kind: 'inline', mode: 'general', budgetMs: 120000, ...items('questions'), what: 'Generated game questions', source: 'general knowledge, working the key out', ifHeld: 'that question is dropped; the writer is asked for more or the game is not served' },
  theme: {
    kind: 'inline', mode: 'general', budgetMs: 45000, what: 'A bank question restyled to an interest (also re-solved blind twice)', source: 'general knowledge, plus two blind re-solves in services/item-theme.js', ifHeld: 'the plain bank question',
  },
  grade_free_response: { kind: 'downstream', by: 'services/ai.js gradeFreeResponse: the judges vote on the verdict, and their feedback goes through fact-guard passesText', file: 'services/ai.js', symbol: 'passesText', what: 'Grading of a typed answer, and its feedback', source: 'the question, the reference answer and the learner\'s answer', ifHeld: 'the verdict stands; the feedback is dropped and the stored explanation shows' },
  spanish_partner_turn: { kind: 'inline', mode: 'general', live: true, budgetMs: LIVE_MS, what: 'The Spanish conversation partner', source: 'general knowledge of Spanish', ifHeld: 'the fixed partner line for that level' },
  spanish_rubric: { kind: 'inline', mode: 'general', budgetMs: 30000, what: 'Marking and priorities on Spanish writing and speaking', source: 'general knowledge of Spanish', ifHeld: 'the rule-based mark' },
  spanish_reaction: { kind: 'inline', mode: 'general', live: true, budgetMs: LIVE_MS, what: 'The short reaction on a Spanish activity', source: 'general knowledge of Spanish', ifHeld: 'no reaction, or the fixed one' },
  spanish_write_ahead: { kind: 'downstream', by: 'services/spanish/unit-writer.js: a review pass (verdicts) keeps only what it passes', file: 'services/spanish/unit-writer.js', symbol: 'REVIEW_SCHEMA', what: 'Spanish units written ahead', source: 'a second model re-reading each item', ifHeld: 'the item is dropped' },

  // ── lessons and levels ─────────────────────────────────────────────────────────────────────────────────────
  block_fill: { kind: 'downstream', by: 'services/block-levels.js verifyLevel: claim-by-claim read and repairs; a level that has not passed is not served', file: 'services/block-levels.js', symbol: 'verifyLevel', what: 'Lessons and levels: the block text and graded checks', source: 'the subject fact sheet and the verifier\'s own working', ifHeld: 'the bank lesson (the ordinary session)' },
  block_layout: { kind: 'internal', why: 'A plan of which blocks to use. No text of it is shown; what it leads to is block_fill.' },
  fact_repair: { kind: 'downstream', by: 'services/block-levels.js verifyAndRepair: a repair is read again before the level can pass', file: 'services/block-levels.js', symbol: 'verifyAndRepair', what: 'Repairs of a level the verifier flagged', source: 'the verifier\'s finding', ifHeld: 'the level is not served' },
  lesson_write: { kind: 'inline', mode: 'general', budgetMs: 120000, what: 'The older single-page generated lesson (only while aiLessonsAllowed)', source: 'general knowledge; also math and key gates', ifHeld: 'the bank lesson' },
  lesson_write_urgent: { kind: 'inline', mode: 'general', budgetMs: 120000, what: 'The same lesson when a learner is waiting', source: 'general knowledge; also math and key gates', ifHeld: 'the bank lesson' },
  diagnose: {
    kind: 'inline', mode: 'general', budgetMs: 30000, what: 'What went wrong on a failed checkpoint, with teaching and a worked problem', source: 'general knowledge, working the worked problem out', ifHeld: 'the rule-based version, which holds no model text',
    pieces: (d) => (Array.isArray(d.areas) ? each(d, 'areas', (a) => JSON.stringify(a)) : [{ text: JSON.stringify(d), drop: () => { d.diagnosis = null; d.teach = null; } }]),
    atLeast: (d) => { if (Array.isArray(d.areas)) { compact(d, 'areas'); return d.areas.length > 0; } return !!d.teach; },
  },
  essay_prompt: { kind: 'inline', mode: 'general', budgetMs: 45000, what: 'An essay task and its guidance', source: 'general knowledge', ifHeld: 'the course\'s stored prompt' },
  essay_grade: { kind: 'inline', mode: 'source', budgetMs: 45000, what: 'Marks and comments on an essay', source: 'the task and what the learner wrote', ifHeld: 'the rule-based mark, labelled as such' },

  // ── uploads: the learner's own material decides ────────────────────────────────────────────────────────────
  material_lesson: { kind: 'inline', mode: 'material', budgetMs: 90000, pieces: lessonPieces, atLeast: lessonLeft, what: 'Lessons of a course built from an upload (questions: material_verify)', source: 'the passages of the upload; an outline-only topic is checked against general knowledge and labelled "general"', ifHeld: 'that paragraph is dropped; with none left the skill is dropped, never padded. Slot for services/material-factcheck.js (uploads-perfect)' },
  material_shorten: { kind: 'inline', mode: 'material', budgetMs: 45000, pieces: lessonPieces, atLeast: lessonLeft, what: 'A lesson shortened', source: 'the passages of the upload', ifHeld: 'the longer checked lesson stays' },
  material_follow: { kind: 'inline', mode: 'material', budgetMs: 45000, pieces: lessonPieces, atLeast: lessonLeft, what: 'A lesson rewritten for the learner', source: 'the passages of the upload', ifHeld: 'the checked lesson stays' },
  material_sweep: {
    kind: 'inline', mode: 'material', budgetMs: 45000, what: 'Facts the lesson had missed, added back', source: 'the sentences of the upload they come from', ifHeld: 'the fact is not added',
    pieces: (d) => each(d, 'facts', String), atLeast: (d) => { compact(d, 'facts'); return true; },
  },
  material_outline: {
    kind: 'inline', mode: 'material', budgetMs: 45000, what: 'Course outline: skill titles and one-line summaries', source: 'the passages of the upload', ifHeld: 'that summary is blanked; the skill stays',
    pieces: (d) => (Array.isArray(d.skills) ? d.skills : []).map((s) => ({ text: `${s.title}: ${s.summary || ''}`, drop: () => { s.summary = ''; } })),
  },
  material_notes: {
    kind: 'inline', mode: 'material', budgetMs: 90000, what: 'Notes from an upload', source: 'the passages of the upload (each bullet also carries a word-for-word quote)', ifHeld: 'that bullet is dropped',
    pieces: (d) => {
      const out = [];
      (Array.isArray(d.sections) ? d.sections : []).forEach((s) => (Array.isArray(s.bullets) ? s.bullets : []).forEach((b, i) => out.push({ text: `${s.heading}: ${b.text}`, drop: dropper(s.bullets, i) })));
      return out;
    },
    atLeast: (d) => { (d.sections || []).forEach((s) => compact(s, 'bullets')); d.sections = (d.sections || []).filter((s) => s.bullets && s.bullets.length); return d.sections.length > 0; },
  },
  material_pack: {
    kind: 'inline', mode: 'material', budgetMs: 90000, what: 'Study pack: summary, flashcards, quiz and practice test', source: 'the passages of the upload (questions also pass material_verify)', ifHeld: 'that line, card or question is dropped',
    pieces: (d) => [
      ...each(d, 'summary', String),
      ...each(d, 'flashcards', (c) => `${c.front} / ${c.back}`),
      ...each(d, 'questions', q),
    ],
    atLeast: (d) => { ['summary', 'flashcards', 'questions'].forEach((k) => compact(d, k)); return (d.summary || []).length + (d.flashcards || []).length + (d.questions || []).length > 0; },
  },
  material_podcast: {
    kind: 'inline', mode: 'material', budgetMs: 90000, what: 'Podcast script from an upload', source: 'the passages of the upload (a fact turn also carries a quote)', ifHeld: 'that turn is dropped; too few left and no podcast',
    pieces: (d) => each(d, 'turns', (t) => t.text), atLeast: (d) => { compact(d, 'turns'); return (d.turns || []).length > 0; },
  },
  material_verify: { kind: 'internal', why: 'The support check on upload questions: its verdicts are read by code, never shown.' },

  // ── placement ──────────────────────────────────────────────────────────────────────────────────────────────
  placement_write: {
    kind: 'inline', mode: 'general', budgetMs: 180000, what: 'Placement questions written for a subject', source: 'general knowledge, working the key out', ifHeld: 'that question is dropped; the set is built from what passed',
    pieces: (d) => {
      const out = [];
      (Array.isArray(d.grades) ? d.grades : []).forEach((g) => (Array.isArray(g.questions) ? g.questions : []).forEach((x, i) => out.push({ text: q(x), drop: dropper(g.questions, i) })));
      return out;
    },
    atLeast: (d) => { (d.grades || []).forEach((g) => compact(g, 'questions')); return true; },
  },
  placement_repair: { kind: 'inline', mode: 'general', budgetMs: 120000, what: 'Wrong options of a placement question rewritten', source: 'general knowledge: a new wrong option must not be right', ifHeld: 'the question keeps its old options' },
  placement_recommend: { kind: 'inline', mode: 'general', budgetMs: 45000, what: 'The sentence saying where to start after placement', source: 'general knowledge; the placement scores are numbers from the code', ifHeld: 'the recommendation from the code, with no model sentence' },

  // ── never shown ────────────────────────────────────────────────────────────────────────────────────────────
  fact_live: { kind: 'internal', why: 'This is the check itself (services/fact-guard.js).' },
  fact_verify: { kind: 'internal', why: 'The level verifier.' },
  fact_read: { kind: 'internal', why: 'The level verifier.' },
  fact_claims: { kind: 'internal', why: 'The level verifier.' },
  fact_research: { kind: 'internal', why: 'The level verifier\'s research sheet: read by the verifier, not by a learner.' },
  key_check: { kind: 'internal', why: 'A key check: the verdict is read by code.' },
  blind_mc: { kind: 'internal', why: 'A blind re-solve: the pick is read by code.' },
  placement_key_judge: { kind: 'internal', why: 'A judge of placement keys: read by code.' },
  placement_unit_judge: { kind: 'internal', why: 'A judge of placement units: read by code.' },
  dock_leak_check: { kind: 'internal', why: 'YES or NO on whether a reply gives the answer away: read by code.' },
  tutor_facts: { kind: 'internal', why: 'Notes about the learner, read from their own chat; they steer the tutor, whose replies are checked.' },
  tutor_memory_fold: { kind: 'internal', why: 'The tutor\'s own memory summary, not shown as a statement; the replies built on it are checked.' },
  tutor_vision: { kind: 'internal', why: 'A description of the learner\'s page for the tutor; the reply built on it is checked.' },
  scorecard_transcript_read: { kind: 'internal', why: 'Scorecard evidence from a transcript: numbers read by code.' },
  'theme-solve': { kind: 'internal', why: 'A blind re-solve of a themed question: the pick is read by code.' },
  pool_batch_test: { kind: 'internal', why: 'A load test of the pool in scripts/: never reaches a learner.' },
};

// Exempt: nothing yet. Every shown task is checked; a future greeting or button label goes here with its reason.
const EXEMPT_NOTE = 'No task is exempt today: every task that shows model text goes through a check, greetings included.';

const lookup = (task) => (task && Object.prototype.hasOwnProperty.call(TASKS, task) ? TASKS[task] : null);
const shown = () => Object.entries(TASKS).filter(([, e]) => e.kind === 'inline' || e.kind === 'downstream' || e.kind === 'exempt').map(([k]) => k);

module.exports = { TASKS, lookup, shown, EXEMPT_NOTE, renderQuestion: q };
