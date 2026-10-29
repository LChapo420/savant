/**
 * "Learn from your own material", slice (c): study a built course with the app's own method.
 *
 *   material_progress   one per material   { user_id, material_id, skills: {id: {...}}, placed, pending }
 *
 * The flow, using the course from services/course-builder.js (every question is already grounded in the text):
 *   placement   one question per skill, once. A right answer marks that skill known (mastered by placement, reviewed
 *               tomorrow, so one lucky guess cannot hide a gap for long).
 *   lesson      the skill's lesson and its practice questions, checked one at a time with the explanation and the
 *               quote from the learner's own text. Practice never counts toward mastery.
 *   mastery     up to QUIZ_SIZE questions, answers hidden until submitted; PASS (75%) masters the skill. A skill is
 *               open only when its prerequisites are mastered.
 *   remediation a failed mastery quiz or a missed review shows, for each wrong answer, the right answer, why, and the
 *               passage that says it; the missed questions come first in the next quiz.
 *   review      spaced: a mastered skill falls due on an expanding interval (1, 3, 7, 14, 30, 60 days); a pass moves it
 *               up a step, a miss puts it back to 1 day. A review mixes the due skills (interleaved) and shuffles.
 *
 * Quizzes are one-shot: the server remembers which questions it sent, grades from its own copy of the key, and
 * discards the quiz on submit. The client never receives answers, explanations or quotes before submitting.
 *
 * Not yet shared with the built-in subjects' machinery (services/mastery.js, enforcers): the intervals here are a
 * per-skill forgetting-curve ladder, not the calendar of retention enforcers.
 */
const crypto = require('crypto');
const db = require('../config/db');
const courses = require('./course-builder');

const PASS = 0.75;
const QUIZ_SIZE = 5;
const REVIEW_SIZE = 8;
const PER_SKILL_REVIEW = 3;
const INTERVALS_DAYS = [1, 3, 7, 14, 30, 60];
const DAY = 24 * 60 * 60 * 1000;

const norm = (s) => String(s || '').toLowerCase().replace(/[“”„"‘’']/g, '').replace(/[^a-z0-9À-￿% .-]+/g, ' ').replace(/\s+/g, ' ').trim();
const STOP = new Set(['the', 'a', 'an', 'of', 'to', 'in', 'and', 'is', 'are', 'it', 'its', 'for', 'on', 'by']);
const NEGATION = /\b(not|no|never|none|isn t|doesn t|don t|cannot|without)\b/;

function shuffle(a, rnd) {
  const out = a.slice();
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

/** Short answers: the same words, or every word that matters, and no negation the key does not have. */
function gradeShort(given, key) {
  const g = norm(given);
  const k = norm(key);
  if (!g || !k) return false;
  if (g === k) return true;
  const words = k.split(' ').filter((w) => w.length > 2 && !STOP.has(w));
  if (!words.length || words.length > 4) return false;
  if (NEGATION.test(g) && !NEGATION.test(k)) return false;
  const gw = new Set(g.split(' '));
  return g.split(' ').length <= k.split(' ').length * 3 + 2 && words.every((w) => gw.has(w));
}

/**
 * The certain, free checks from services/typed-grading.js (preJudge): a number written in words, a contraction,
 * an answer that talks to the grader. They only ever settle what is certain; no model is called and nothing is spent.
 */
function certain(q, answer) {
  try {
    // eslint-disable-next-line global-require
    return require('./typed-grading').preJudge({ prompt: q.prompt, answer: q.answer }, answer);
  } catch { return null; }
}

function isCorrect(q, answer) {
  if (q.type === 'multiple_choice') return Number.isInteger(answer) && answer === q.answer_index;
  if (typeof answer !== 'string') return false;
  const v = certain(q, answer);
  if (v && v.injection) return false;
  return gradeShort(answer, q.answer) || !!(v && v.verdict === 'correct');
}

function correctText(q) { return q.type === 'multiple_choice' ? q.choices[q.answer_index] : q.answer; }

/** What the learner may see before answering. */
function publicQ(q, skillId) {
  const out = { id: q.id, skill: skillId, type: q.type, prompt: q.prompt };
  if (q.type === 'multiple_choice') out.choices = q.choices;
  return out;
}

function loadCourse(userId, materialId) {
  const c = courses.get(userId, materialId);
  if (!c || !['ready', 'partial'].includes(c.status) || !(c.skills || []).length) return null;
  return c;
}

function row(userId, materialId) {
  const mid = Number(materialId);
  let r = db.findOne('material_progress', (p) => p.user_id === userId && p.material_id === mid);
  if (!r) r = db.insert('material_progress', { user_id: userId, material_id: mid, skills: {}, placed: false, pending: null, created_at: new Date().toISOString() });
  return r;
}
function skillState(r, id) {
  if (!r.skills[id]) r.skills[id] = { status: 'new', best: null, attempts: 0, step: 0, due: null, wrong: [], via: null };
  return r.skills[id];
}
function save(r) { return db.update('material_progress', r.id, { skills: r.skills, placed: r.placed, pending: r.pending, updated_at: new Date().toISOString() }); }

function unlocked(course, r, skill) {
  return skill.prerequisites.every((p) => (r.skills[p] && r.skills[p].status === 'mastered') || !course.skills.some((s) => s.id === p));
}
const isDue = (st, now) => st.status === 'mastered' && st.due && Date.parse(st.due) <= now;

/** The map: every skill with its status, whether it is open, and what is due. */
function state(userId, materialId, now = Date.now()) {
  const course = loadCourse(userId, materialId);
  if (!course) return { error: 'There is no course to study yet.', code: 'no_course' };
  const r = row(userId, materialId);
  const skills = course.skills.map((s) => {
    const st = r.skills[s.id] || {};
    return {
      id: s.id, title: s.title, summary: s.summary, prerequisites: s.prerequisites,
      status: st.status || 'new', open: unlocked(course, r, s), best: st.best == null ? null : st.best,
      due: st.due || null, is_due: isDue(st, now), via: st.via || null, questions: s.questions.length,
    };
  });
  const dues = skills.filter((s) => s.is_due);
  const upcoming = skills.filter((s) => s.status === 'mastered' && s.due && !s.is_due).map((s) => s.due).sort()[0] || null;
  return {
    course: { title: course.title, status: course.status },
    placed: !!r.placed, skills, mastered: skills.filter((s) => s.status === 'mastered').length, total: skills.length,
    due_count: dues.length, next_due: dues.length ? 'now' : upcoming,
  };
}

/** The lesson and its practice questions (no answers). Opens only when the prerequisites are mastered. */
function lesson(userId, materialId, skillId) {
  const course = loadCourse(userId, materialId);
  if (!course) return { error: 'There is no course to study yet.', code: 'no_course' };
  const skill = course.skills.find((s) => s.id === skillId);
  if (!skill) return { error: 'No such skill.', code: 'not_found' };
  const r = row(userId, materialId);
  if (!unlocked(course, r, skill)) return { error: 'Master the earlier skills first.', code: 'locked' };
  const st = skillState(r, skill.id);
  if (st.status === 'new') st.status = 'learning';
  save(r);
  return { skill: { id: skill.id, title: skill.title, lesson: skill.lesson, practice: skill.questions.map((q) => publicQ(q, skill.id)) } };
}

/** One practice question, answered and explained at once. Does not count toward mastery. */
function practice(userId, materialId, skillId, qid, answer) {
  const course = loadCourse(userId, materialId);
  if (!course) return { error: 'There is no course to study yet.', code: 'no_course' };
  const skill = course.skills.find((s) => s.id === skillId);
  const q = skill && skill.questions.find((x) => x.id === qid);
  if (!q) return { error: 'No such question.', code: 'not_found' };
  if (!unlocked(course, row(userId, materialId), skill)) return { error: 'Master the earlier skills first.', code: 'locked' };
  return { correct: isCorrect(q, answer), answer: correctText(q), explanation: q.explanation, quote: q.quote };
}

function pickQuestions(course, r, mode, skillId, now, rnd) {
  const byId = new Map(course.skills.map((s) => [s.id, s]));
  const take = (skill, n) => {
    const wrong = new Set((r.skills[skill.id] && r.skills[skill.id].wrong) || []);
    const qs = shuffle(skill.questions, rnd).sort((a, b) => (wrong.has(b.id) ? 1 : 0) - (wrong.has(a.id) ? 1 : 0));
    return qs.slice(0, n).map((q) => ({ skill, q }));
  };
  if (mode === 'placement') return course.skills.flatMap((s) => take(s, 1)).slice(0, 12);
  if (mode === 'mastery') return take(byId.get(skillId), QUIZ_SIZE);
  // review: the due skills, interleaved
  const due = course.skills.filter((s) => isDue(r.skills[s.id] || {}, now));
  const per = Math.max(1, Math.min(PER_SKILL_REVIEW, Math.floor(REVIEW_SIZE / Math.max(1, due.length))));
  return shuffle(due.flatMap((s) => take(s, per)), rnd).slice(0, REVIEW_SIZE);
}

/** Start a one-shot quiz. mode: placement | mastery (needs skill) | review. */
function startQuiz(userId, materialId, mode, skillId, opts = {}) {
  const now = opts.now || Date.now();
  const rnd = opts.random || Math.random;
  const course = loadCourse(userId, materialId);
  if (!course) return { error: 'There is no course to study yet.', code: 'no_course' };
  const r = row(userId, materialId);
  if (mode === 'placement') {
    if (r.placed) return { error: 'You have already done the starting check.', code: 'already_placed' };
  } else if (mode === 'mastery') {
    const skill = course.skills.find((s) => s.id === skillId);
    if (!skill) return { error: 'No such skill.', code: 'not_found' };
    if (!unlocked(course, r, skill)) return { error: 'Master the earlier skills first.', code: 'locked' };
  } else if (mode === 'review') {
    if (!course.skills.some((s) => isDue(r.skills[s.id] || {}, now))) return { error: 'Nothing is due for review yet.', code: 'nothing_due' };
  } else return { error: 'Unknown quiz.', code: 'bad_mode' };

  const picked = pickQuestions(course, r, mode, skillId, now, rnd);
  if (!picked.length) return { error: 'No questions available.', code: 'empty' };
  const id = crypto.randomBytes(8).toString('hex');
  r.pending = { id, mode, skill: mode === 'mastery' ? skillId : null, qids: picked.map(({ skill, q }) => [skill.id, q.id]), issued_at: new Date(now).toISOString() };
  save(r);
  return { quiz_id: id, mode, pass_mark: mode === 'mastery' ? PASS : null, questions: picked.map(({ skill, q }) => publicQ(q, skill.id)) };
}

/** Grade and apply a quiz. answers: { [question id]: choice index | text }. */
function submit(userId, materialId, quizId, answers, opts = {}) {
  const now = opts.now || Date.now();
  const course = loadCourse(userId, materialId);
  if (!course) return { error: 'There is no course to study yet.', code: 'no_course' };
  const r = row(userId, materialId);
  const quiz = r.pending;
  if (!quiz || quiz.id !== String(quizId || '')) return { error: 'That quiz is not open any more. Start a new one.', code: 'no_quiz' };
  r.pending = null; // one shot, graded or not
  const given = answers && typeof answers === 'object' ? answers : {};

  const per = new Map(); // skill id -> { right, total }
  const results = [];
  for (const [sid, qid] of quiz.qids) {
    const skill = course.skills.find((s) => s.id === sid);
    const q = skill && skill.questions.find((x) => x.id === qid);
    if (!q) continue;
    const ok = isCorrect(q, given[qid]);
    const t = per.get(sid) || { right: 0, total: 0 };
    t.total++;
    if (ok) t.right++;
    per.set(sid, t);
    results.push({ q, sid, ok, given: given[qid] });
  }

  const report = [];
  for (const [sid, t] of per) {
    const st = skillState(r, sid);
    const score = t.right / t.total;
    const skill = course.skills.find((s) => s.id === sid);
    const entry = { skill: sid, title: skill.title, right: t.right, total: t.total, score };
    const dueIn = (step) => new Date(now + INTERVALS_DAYS[step] * DAY).toISOString();
    st.attempts++;
    if (quiz.mode === 'mastery') {
      st.best = Math.max(st.best || 0, score);
      entry.passed = score >= PASS;
      if (entry.passed) { st.status = 'mastered'; st.step = 0; st.due = dueIn(0); st.via = 'quiz'; } else { st.status = 'learning'; }
    } else if (quiz.mode === 'review') {
      entry.passed = score >= PASS;
      st.step = entry.passed ? Math.min(st.step + 1, INTERVALS_DAYS.length - 1) : 0;
      st.due = dueIn(st.step);
      entry.next_in_days = INTERVALS_DAYS[st.step];
    } else if (quiz.mode === 'placement') {
      entry.known = t.right === t.total;
      if (entry.known && st.status === 'new') { st.status = 'mastered'; st.via = 'placement'; st.step = 0; st.due = dueIn(0); }
    }
    // Remember what was missed so the next quiz asks it first; a right answer clears it.
    const wrongSet = new Set(st.wrong || []);
    for (const x of results.filter((y) => y.sid === sid)) { if (x.ok) wrongSet.delete(x.q.id); else wrongSet.add(x.q.id); }
    st.wrong = [...wrongSet].slice(0, 20);
    report.push(entry);
  }
  if (quiz.mode === 'placement') r.placed = true;
  save(r);
  db.flush();

  const out = { mode: quiz.mode, report, overall: { right: results.filter((x) => x.ok).length, total: results.length } };
  if (quiz.mode !== 'placement') {
    // Remediation: for each miss, the answer, the reason and the passage that says it.
    out.remediation = results.filter((x) => !x.ok).map((x) => ({
      id: x.q.id, skill: x.sid, prompt: x.q.prompt,
      your_answer: x.q.type === 'multiple_choice' ? (Number.isInteger(x.given) ? x.q.choices[x.given] || null : null) : (typeof x.given === 'string' ? x.given.slice(0, 200) : null),
      correct_answer: correctText(x.q), explanation: x.q.explanation, from_your_material: x.q.quote,
    }));
    out.results = results.map((x) => ({ id: x.q.id, ok: x.ok }));
  }
  return out;
}

function removeForMaterial(userId, materialId) {
  return db.remove('material_progress', (p) => p.user_id === userId && p.material_id === Number(materialId));
}

/**
 * What is due for review across all of a learner's courses (for the home page).
 * Titles and counts only: no questions, answers or quotes.
 */
function dueSummary(userId, now = Date.now()) {
  const items = [];
  for (const r of db.find('material_progress', (p) => p.user_id === userId)) {
    const course = loadCourse(userId, r.material_id);
    if (!course) continue;
    const due = course.skills.filter((s) => isDue(r.skills[s.id] || {}, now)).length;
    if (due) items.push({ material_id: r.material_id, title: course.title, due_count: due });
  }
  items.sort((a, b) => b.due_count - a.due_count);
  return { total: items.reduce((n, i) => n + i.due_count, 0), materials: items };
}

module.exports = { dueSummary, PASS, QUIZ_SIZE, INTERVALS_DAYS, gradeShort, isCorrect, state, lesson, practice, startQuiz, submit, removeForMaterial };
