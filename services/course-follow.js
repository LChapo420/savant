/**
 * Making a course follow its learner by CHECKING the written lesson, not only by asking for it (round 3, 6 Nov 2026; behind UPLOAD_FOLLOW=1, off by default).
 *
 * The lesson prompt already carries the learner's spec (services/learning-spec.js), and the measured result was that it was mostly ignored: of
 * the traits a judge checked, about two in three were followed, and the learner who wants the shortest version got a course 5x the source. So
 * after each skill's lesson is written this module checks it against the spec and names what is wrong; services/course-builder.js then
 * rewrites that skill once with the problems named and keeps the better draft. Three checks are the spec's own (sentence length, long words,
 * interests, via learning-spec checkFollowed); four are added here because a judge looks for them and the spec has no check: a worked example,
 * no test language for a learner who is anxious when tested, short paragraphs for a learner who cannot take dense text (done by splitting,
 * no model call), and a real word budget (a learner with a brevity preference gets a lesson of at most a share of the source's words).
 *
 * Pure functions; the model call is the builder's. Default and owner learners get nothing (spec.isDefault), so their courses are unchanged.
 */
const enabled = () => String(process.env.UPLOAD_FOLLOW || '') === '1';

/** { spec, wordShare } for this learner and material, or null when nothing applies (default spec, or the switch is off). */
function contextFor(userId, mat) {
  if (!enabled()) return null;
  try {
    const ls = require('./learning-spec'); // eslint-disable-line global-require
    const spec = ls.buildSpec(userId, { topic: mat.title, materialId: mat.id });
    if (!spec || spec.isDefault) return null;
    // UPLOAD_FOLLOW_PARTS=cap,checks (default both): the two moves can be switched apart to measure which one moves the number.
    const parts = String(process.env.UPLOAD_FOLLOW_PARTS || 'cap,checks').split(',');
    const out = { spec: parts.includes('checks') ? spec : null, wordShare: parts.includes('cap') ? wordShare(spec) : null };
    return out.spec || out.wordShare ? out : null;
  } catch { return null; }
}

/** The share of the source's words a lesson may use: only for a learner whose course is meant to be shorter; null means no cap. */
function wordShare(spec) {
  const s = spec && spec.course && spec.course.skillShare;
  if (!Number.isFinite(s) || s >= 0.9) return null;
  return Math.min(0.9, Math.max(0.3, s * 1.4));
}

const TEST_WORDS = /\b(tests?|tested|testing|quizz?es|quizzed|exams?|examined|graded|grades?|scores?|scored|timed|timers?|marks?)\b/i;
const WORKED = /worked example/i;
const words = (a) => a.reduce((n, t) => n + (String(t).match(/\S+/g) || []).length, 0);
const sentences = (t) => (String(t).replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) || []).map((s) => s.trim()).filter(Boolean);

/** Split paragraphs into chunks of at most `per` sentences (a learner who cannot take dense text). No model call, no word changed. */
function splitDense(paragraphs, spec) {
  const per = Math.max(2, Math.min(4, (spec && spec.lesson && spec.lesson.chunkSentences) || 3));
  const out = [];
  for (const p of paragraphs) {
    const ss = sentences(p);
    if (ss.length <= per + 1 && words([p]) <= 55) { out.push(p); continue; }
    for (let i = 0; i < ss.length; i += per) out.push(ss.slice(i, i + per).join(' '));
  }
  return out;
}
const needsSplit = (spec) => !!(spec && spec.lesson && spec.lesson.chunkSentences && spec.lesson.chunkSentences <= 3);

/** Replace test words in a question's text for a learner who is anxious when tested ("test" becomes "check", "quiz" becomes "practice"). */
function deTest(text) {
  return String(text || '')
    .replace(/\b(tested|testing)\b/gi, (m) => (m[0] === 'T' ? 'Checked' : 'checked'))
    .replace(/\btests?\b/gi, (m) => (m[0] === 'T' ? 'Check' : 'check'))
    .replace(/\bquizz?(es)?\b/gi, (m) => (m[0] === 'Q' ? 'Practice' : 'practice'))
    .replace(/\bexams?\b/gi, 'check')
    .replace(/\btimed\b/gi, '')
    .replace(/\s{2,}/g, ' ');
}

/** What is wrong with a written lesson for this learner: [{ id, detail }]. cap: the word limit, or null. own: words that are the topic's own. */
function problemsOf(paragraphs, keyPoints, spec, { cap = null, own = [] } = {}) {
  const ls = require('./learning-spec'); // eslint-disable-line global-require
  const body = [...paragraphs, ...keyPoints].join('\n');
  const probs = [];
  const got = ls.checkFollowed(body, spec, { exempt: own, structure: cap ? { words: words([...paragraphs, ...keyPoints]), maxWords: cap } : null, minShare: 0.3 });
  for (const p of got.problems) if (['sentence_length', 'vocabulary', 'interest_unused', 'avoid_domain', 'too_long'].includes(p.id)) probs.push(p);
  const pr = spec.practice || {};
  if ((pr.workedExamples || 0) >= 2 && (pr.workedToPractice || 0) >= 1.2 && !WORKED.test(body)) probs.push({ id: 'worked_example', detail: 'there is no worked example; add one paragraph that starts "Worked example:" and walks through every step of applying a point of the passage (use only the passage\'s own numbers, names and terms)' });
  if (spec.feedback && spec.feedback.lowStakes && TEST_WORDS.test(body)) probs.push({ id: 'test_language', detail: 'it uses test language (test, quiz, exam, grade, score, timed); this learner is anxious when tested, so say "practice" and "check" and frame everything as low stakes' });
  return probs;
}

module.exports = { enabled, contextFor, wordShare, splitDense, needsSplit, deTest, problemsOf, TEST_WORDS, WORKED };
