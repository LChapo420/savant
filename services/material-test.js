/**
 * "Learn from your own material": a practice test on demand (S3).
 *
 * The learner picks skills of a built course and a length, timed or not. The server draws that many questions from
 * the course (missed ones first, spread across the picked skills), sends them without keys, and grades on submit:
 *
 *   multiple choice   marked against the stored key.
 *   short answer      the free certain checks first (material-study.isCorrect), then services/typed-grading.js
 *                     (its own cascade and the learner's consent for outside AI); at most MAX_JUDGED answers per test
 *                     go past the free checks. A cascade that cannot decide leaves the free check's verdict.
 *
 * Results feed the learner model (material_progress): answers update the skill's counts, missed questions come
 * first next time and their misconceptions are kept; a mastered skill answered all right restarts its review clock,
 * one answered wrong comes up for review now. A test never masters a skill and never moves a tier: the mastery
 * check does that. Questions left blank in the test are scored wrong but are not fed to the model (a skipped
 * question tells us little, and a timed test that ran out should not read as forgetting).
 *
 * One test is open per material (`material_progress.test`); submitting closes it. The last few results are kept in
 * `material_progress.tests` (counts only: no questions, no answers). Both go with the material and the account.
 * Time limits are enforced on the server clock: a late submission is graded and flagged, and says so.
 */
const crypto = require('crypto');
const study = require('./material-study');
const path = require('./material-path');
const typed = require('./typed-grading');
const adapt = require('./material-adapt');

const I = study.internals;
const MIN_LEN = 3;
const DEFAULT_LEN = 10;
const MAX_LEN = 40;
const SECONDS_PER_QUESTION = 75;
const GRACE_MS = 20 * 1000;
const MAX_JUDGED = 8;
const JUDGE_WAIT_MS = 20 * 1000;
const KEEP = 10;

const isBlank = (a) => a == null || (typeof a === 'string' && !a.trim());

/** What the test page needs to offer its choices: the skills, how many questions each has, the last results. */
function options(userId, materialId) {
  const course = I.loadCourse(userId, materialId);
  if (!course) return { error: 'There is no course to test yet.', code: 'no_course' };
  const r = I.row(userId, materialId);
  return {
    skills: course.skills.map((s) => ({ id: s.id, title: s.title, unit: s.unit || null, questions: (s.questions || []).length, status: (r.skills[s.id] || {}).status || 'new' })),
    min: MIN_LEN, max: MAX_LEN, default: DEFAULT_LEN, seconds_per_question: SECONDS_PER_QUESTION,
    open: !!r.test, history: (r.tests || []).slice(-KEEP).reverse(),
  };
}

/** Start a test. opts: { skills: [ids], length, timed, now, random }. */
function start(userId, materialId, opts = {}) {
  const now = opts.now || Date.now();
  const rnd = opts.random || Math.random;
  const course = I.loadCourse(userId, materialId);
  if (!course) return { error: 'There is no course to test yet.', code: 'no_course' };
  const r = I.row(userId, materialId);

  const asked = Array.isArray(opts.skills) ? [...new Set(opts.skills.map(String))] : [];
  let skills = course.skills.filter((s) => (s.questions || []).length);
  if (asked.length) {
    if (asked.length > course.skills.length || asked.some((id) => !course.skills.some((s) => s.id === id))) return { error: 'No such skill.', code: 'not_found' };
    skills = skills.filter((s) => asked.includes(s.id));
  }
  if (!skills.length) return { error: 'The skills you picked have no questions.', code: 'empty' };

  const n = Number.isFinite(Number(opts.length)) ? Math.round(Number(opts.length)) : DEFAULT_LEN;
  let want = Math.min(MAX_LEN, Math.max(MIN_LEN, n));
  // "Pick for me" (S12): only what this learner does not know yet, due, or missed, sized by how much that is.
  let planned = null;
  if (opts.adapt) {
    const pl = adapt.plan(course, r, now);
    const allowed = new Set(skills.map((s) => s.id));
    const mine = pl.skills.filter((e) => allowed.has(e.id));
    if (!mine.length) return { error: 'Nothing needs practice right now. You know these skills and none is due for review.', code: 'nothing_due', next_due: pl.next_due };
    planned = new Map(mine.map((e) => [e.id, e]));
    skills = skills.filter((s) => planned.has(s.id));
    if (!Number.isFinite(Number(opts.length))) want = Math.min(MAX_LEN, Math.max(MIN_LEN, mine.reduce((t, e) => t + e.items, 0)));
  }
  // Per skill: missed questions first, then the rest in a random order. Then take one from each skill in turn.
  const queues = I.shuffle(skills, rnd).map((s) => {
    const wrong = new Set((r.skills[s.id] || {}).wrong || []);
    if (planned) return adapt.pickFor(s, planned.get(s.id), [...wrong], rnd).map((q) => [s.id, q.id]);
    const qs = I.shuffle(s.questions, rnd);
    return qs.filter((q) => wrong.has(q.id)).concat(qs.filter((q) => !wrong.has(q.id))).map((q) => [s.id, q.id]);
  });
  const picked = [];
  while (picked.length < want && queues.some((q) => q.length)) {
    for (const q of queues) { if (q.length && picked.length < want) picked.push(q.shift()); }
  }
  const order = I.shuffle(picked, rnd);
  const timed = !!opts.timed;
  const seconds = timed ? order.length * SECONDS_PER_QUESTION : null;
  const id = crypto.randomBytes(8).toString('hex');
  r.test = { id, skills: skills.map((s) => s.id), qids: order, timed, seconds, issued_at: new Date(now).toISOString() };
  I.save(r);
  const byId = new Map(course.skills.map((s) => [s.id, s]));
  return {
    test_id: id, timed, seconds, ends_at: timed ? new Date(now + seconds * 1000).toISOString() : null,
    questions: order.map(([sid, qid]) => I.publicQ(byId.get(sid).questions.find((x) => x.id === qid), sid)),
  };
}

/** One written answer: the free checks, then the typed-grading cascade for what they cannot settle. */
async function markShort(userId, q, given, budget, opts) {
  if (study.isCorrect(q, given)) return { ok: true, by: 'rules' };
  if (isBlank(given) || typeof given !== 'string' || budget.judged >= MAX_JUDGED) return { ok: false, by: 'rules' };
  const sure = typed.preJudge({ prompt: q.prompt, answer: q.answer }, given); // text aimed at the grader and other certain cases
  if (sure && sure.verdict) return { ok: sure.verdict === 'correct', by: 'rules' };
  budget.judged++;
  try {
    const grade = opts.grade || typed.gradeTyped;
    let res = await grade({ item: { prompt: q.prompt, answer: q.answer }, userAnswer: given, userId });
    if (res && res.status === 'checking' && res.settle) {
      let timer;
      const wait = new Promise((resolve) => { timer = setTimeout(() => resolve(null), opts.judgeWaitMs || JUDGE_WAIT_MS); if (timer.unref) timer.unref(); });
      res = await Promise.race([res.settle, wait]);
      clearTimeout(timer);
    }
    if (res && res.status === 'accepted') return { ok: true, by: res.by || 'judges' };
    return { ok: false, by: (res && res.by) || 'rules', feedback: (res && res.feedback) || null };
  } catch {
    return { ok: false, by: 'rules' };
  }
}

/** Grade the open test and feed the learner model. answers: { [question id]: choice index | text }. */
async function submit(userId, materialId, testId, answers, opts = {}) {
  const now = opts.now || Date.now();
  const course = I.loadCourse(userId, materialId);
  if (!course) return { error: 'There is no course to test yet.', code: 'no_course' };
  let r = I.row(userId, materialId);
  const test = r.test;
  if (!test || test.id !== String(testId || '')) return { error: 'That test is not open any more. Start a new one.', code: 'no_test' };
  r.test = null; // one shot, graded or not; closed before any slow grading so a double submit finds nothing
  I.save(r);
  const given = answers && typeof answers === 'object' ? answers : {};
  const late = !!test.timed && now > Date.parse(test.issued_at) + test.seconds * 1000 + GRACE_MS;
  const used = Math.max(0, Math.round((now - Date.parse(test.issued_at)) / 1000));

  const budget = { judged: 0 };
  const items = [];
  for (const [sid, qid] of test.qids) {
    const skill = course.skills.find((s) => s.id === sid);
    const q = skill && skill.questions.find((x) => x.id === qid);
    if (!q) continue;
    const a = Object.prototype.hasOwnProperty.call(given, qid) ? given[qid] : null;
    const answered = !isBlank(a);
    // eslint-disable-next-line no-await-in-loop
    const m = q.type === 'multiple_choice' ? { ok: study.isCorrect(q, a), by: 'key' } : await markShort(userId, q, a, budget, opts);
    items.push({ q, sid, skill, given: a, answered, ok: !!m.ok, by: m.by, feedback: m.feedback || null, role: 'main' });
  }

  // Feed the learner model (re-read the row: grading was async).
  r = I.row(userId, materialId);
  const fed = items.filter((x) => x.answered);
  for (const x of fed) { r.pace = path.updatePace(r.pace, x.q.tier || 2, x.ok); r.steps.questions++; }
  I.noteAnswers(r, fed, now);
  const per = new Map();
  for (const x of items) {
    const t = per.get(x.sid) || { right: 0, total: 0, answered: 0, title: x.skill.title };
    t.total++; if (x.ok) t.right++; if (x.answered) t.answered++;
    per.set(x.sid, t);
  }
  const report = [];
  for (const [sid, t] of per) {
    const st = I.skillState(r, sid);
    const e = { skill: sid, title: t.title, right: t.right, total: t.total, score: t.right / t.total, passed: t.right / t.total >= path.PASS };
    if (t.answered) {
      const rightAnswered = fed.filter((x) => x.sid === sid && x.ok).length;
      st.right += rightAnswered; st.wrong_n += t.answered - rightAnswered;
      if (st.status === 'mastered') {
        if (rightAnswered === t.answered) { st.last_tested = new Date(now).toISOString(); e.next_in_days = I.scheduleReview(r, st, now); }
        else { st.due = new Date(now).toISOString(); e.review_now = true; }
      }
    }
    report.push(e);
  }
  const right = items.filter((x) => x.ok).length;
  const entry = { id: test.id, at: new Date(now).toISOString(), total: items.length, right, answered: fed.length, skills: test.skills, timed: !!test.timed, late, seconds: used };
  r.tests = [...(r.tests || []), entry].slice(-KEEP);
  I.save(r);
  require('../config/db').flush(); // eslint-disable-line global-require

  return {
    score: { right, total: items.length, answered: fed.length, percent: items.length ? Math.round((100 * right) / items.length) : 0 },
    timed: !!test.timed, late, seconds_used: used, seconds_allowed: test.seconds || null,
    report,
    weak: report.filter((e) => !e.passed).map((e) => ({ skill: e.skill, title: e.title })),
    results: items.map((x) => ({ id: x.q.id, skill: x.sid, ok: x.ok, answered: x.answered, by: x.by })),
    remediation: items.filter((x) => !x.ok).map((x) => ({
      id: x.q.id, skill: x.sid, prompt: x.q.prompt,
      your_answer: !x.answered ? null : (x.q.type === 'multiple_choice' ? (Number.isInteger(x.given) ? x.q.choices[x.given] || null : null) : (typeof x.given === 'string' ? x.given.slice(0, 200) : null)),
      correct_answer: I.correctText(x.q), explanation: x.q.explanation, misconception: I.misconceptionOf(x.q, x.given),
      from_your_material: x.q.quote, feedback: x.feedback || null,
    })),
  };
}

module.exports = { MIN_LEN, MAX_LEN, DEFAULT_LEN, SECONDS_PER_QUESTION, GRACE_MS, MAX_JUDGED, options, start, submit };
