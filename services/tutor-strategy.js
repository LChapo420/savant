/**
 * How this learner is best helped: which way of explaining the tutor leans on, chosen from what has
 * worked for them, not from a learning-style label (06-M8: matching instruction to a stated modality
 * preference has no replicable support; measured behaviour is what is used).
 *
 *   styles    step_questions, worked_example, analogy, visual, brief, detailed. Each is a way of helping,
 *             never of answering: the hint rules of 06-M4 still sit last in the prompt.
 *   record    per learner and style: how often it was tried and how often the learner then showed they
 *             understood. The tutor-facts extraction reports both outcomes after a turn.
 *   choose    score = (worked + 2 * prior) / (tried + 2). With no history the prior alone decides, in the
 *             fallback order below; one success lifts a style above every untried one; a failure sinks it
 *             below the untried ones, so what fails is tried less and is not dropped for good.
 *   prior     fallback order is a design choice (06-M4 asks before telling, 06-M5 keeps replies short);
 *             a low or high mastery on the page's skill nudges it. Both are listed UNVERIFIED in
 *             docs/yc/SOURCES-TO-VERIFY.md.
 *
 * Stored per learner in tutor_strategies; exported and deleted with the account.
 */
const db = require('../config/db');

const STYLES = {
  step_questions: 'Guide with one small question at a time; let them do each step instead of explaining it.',
  worked_example: 'Show a short worked example on different numbers, then ask them to try theirs.',
  analogy: 'Use one familiar everyday analogy, then connect it back to their problem.',
  visual: 'Describe a picture or diagram they can imagine or sketch, then ask what they see.',
  brief: 'Keep it to two short sentences and one question.',
  detailed: 'Walk through the idea in a few more sentences, step by step, then check they followed.',
};
const ORDER = Object.keys(STYLES);
const META = '_meta';
const LOW = 0.4;
const HIGH = 0.7;

const rowsOf = (userId) => db.find('tutor_strategies', (r) => r.user_id === userId);
const rowFor = (userId, style) => rowsOf(userId).find((r) => r.style === style) || null;

function prior(style, mastery) {
  let p = 0.5 - 0.02 * ORDER.indexOf(style);
  if (mastery != null && mastery < LOW && style === 'worked_example') p += 0.15;
  if (mastery != null && mastery >= HIGH && (style === 'step_questions' || style === 'brief')) p += 0.1;
  return p;
}

function masteryOf(userId, skillId) {
  if (!skillId) return null;
  const s = db.findOne('skill_states', (r) => r.user_id === userId && r.skill_id === skillId);
  return s && s.attempts > 0 ? s.mastery : null;
}

/**
 * Every style with its score, best first. `shift` (optional, style -> number) moves a style's PRIOR, which is how the
 * scorecard leans the choice (services/tutor-plan.js); it is worth two observations at most, so what was measured
 * for this learner (worked / tried) overrules it as soon as there is any.
 */
function ranked(userId, skillId = null, shift = null) {
  const m = masteryOf(userId, skillId);
  return ORDER.map((style) => {
    const r = rowFor(userId, style);
    const worked = r ? r.worked || 0 : 0;
    const tried = r ? r.tried || 0 : 0;
    return { style, tried, worked, score: (worked + 2 * (prior(style, m) + ((shift && shift[style]) || 0))) / (tried + 2) };
  }).sort((a, b) => b.score - a.score || ORDER.indexOf(a.style) - ORDER.indexOf(b.style));
}

/** A resolved outcome for one style: they understood after it (`worked`) or did not (`failed`). */
function record(userId, style, outcome, now = Date.now()) {
  if (!userId || !STYLES[style] || (outcome !== 'worked' && outcome !== 'failed')) return false;
  const r = rowFor(userId, style);
  const at = new Date(now).toISOString();
  const next = { tried: (r ? r.tried || 0 : 0) + 1, worked: (r ? r.worked || 0 : 0) + (outcome === 'worked' ? 1 : 0), updated_at: at };
  if (r) db.update('tutor_strategies', r.id, next);
  else db.insert('tutor_strategies', { user_id: userId, style, ...next });
  return true;
}

function meta(userId) {
  return rowsOf(userId).find((r) => r.style === META) || null;
}

/**
 * The way to lean on in this reply, as one line for the prompt. `commit` remembers it so the next turn's
 * note-taking can judge how it landed (`previous`).
 */
function choose(userId, { skillId = null, commit = true, shift = null } = {}) {
  if (!userId) return null;
  const top = ranked(userId, skillId, shift)[0];
  if (commit) {
    const m = meta(userId);
    const last = m ? m.last || null : null;
    if (m) db.update('tutor_strategies', m.id, { prev: last, last: top.style });
    else db.insert('tutor_strategies', { user_id: userId, style: META, prev: null, last: top.style });
  }
  return { style: top.style, line: `Lean on this way of helping first (it is what has worked best for them so far, or the default while you learn): ${STYLES[top.style]} Switch if they say it is not helping. This changes how you explain, never whether you give the answer.` };
}

/** The style used on the turn before the one just taken, once: its outcome is judged and then cleared. */
function takePrevious(userId) {
  const m = meta(userId);
  if (!m || !m.prev) return null;
  const p = m.prev;
  db.update('tutor_strategies', m.id, { prev: null });
  return p;
}

function forgetAll(userId) {
  return db.remove('tutor_strategies', (r) => r.user_id === userId);
}

module.exports = { STYLES, ORDER, ranked, record, choose, takePrevious, forgetAll };
