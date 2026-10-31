/**
 * "Learn from your own material": study a built course on a path fitted to this learner.
 *
 *   material_progress   one per material   { user_id, material_id, skills: {id: {...}}, placement, placed, pending,
 *                                            pace, forget_m, steps }
 *
 * The decisions are services/material-path.js (pure, shared with the simulated learners in
 * scripts/material-learner-sim.js, so what is measured is what ships). This file keeps the state and the answer keys.
 *
 *   placement   one question at a time over the skill map (material-path.nextPlacement): the walk asks where the
 *               answer tells most, then every skill it would skip gets a quick check. Known skills are mastered by
 *               placement and come back for review on this learner's forgetting curve; half-known ones start a tier up.
 *   next        the one recommended step: placement, then due reviews, then remediation, then the first open skill on
 *               the path (its lesson, then its check). Every skill stays reachable from the map.
 *   lesson      the skill's lesson and a few practice questions (fewer for a fast learner, more when remediating),
 *               answered one at a time with the explanation and the quote from the learner's own text.
 *   mastery     QUIZ_SIZE questions at the skill's tier (missed ones first) plus one interleaved question from an
 *               earlier mastered skill; answers hidden until submitted; 75% on the skill masters it. A perfect check
 *               moves the skill up a tier, a failed one down, and marks it for remediation.
 *   remediation for each miss: the right answer, why, the misunderstanding behind the choice picked, and the passage.
 *   review      the due skills, interleaved, two questions each at tier 2 or above. 2 of 2 stretches the interval
 *               (the forgetting curve with this learner's multiplier), 1 of 2 halves the interval, 0 of 2 reopens
 *               the skill for remediation. Every review moves the learner's multiplier, read against their own
 *               accuracy on skills they had just mastered (so slips are not taken for forgetting).
 *
 * Quizzes are one-shot: the server remembers which questions it sent, grades from its own copy of the key, and
 * discards the quiz on submit. The client never receives answers, explanations or quotes before answering.
 * `steps` counts what the learner did (lessons opened, questions answered), for the path's own evidence.
 */
const crypto = require('crypto');
const db = require('../config/db');
const courses = require('./course-builder');
const path = require('./material-path');

const PASS = path.PASS;
const QUIZ_SIZE = 5;
const REVIEW_SIZE = 10;
const PER_SKILL_REVIEW = 2;
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

/** The misunderstanding behind a wrong multiple-choice pick, when the course recorded one. */
function misconceptionOf(q, given) {
  if (q.type !== 'multiple_choice' || !Number.isInteger(given) || given === q.answer_index) return null;
  return (q.misconceptions && q.misconceptions[given]) || null;
}

/** What the learner may see before answering. */
function publicQ(q, skillId) {
  const out = { id: q.id, skill: skillId, type: q.type, prompt: q.prompt, tier: q.tier || 2 };
  if (q.type === 'multiple_choice') out.choices = q.choices;
  if (q.source === 'general') out.source = 'general';
  return out;
}

function loadCourse(userId, materialId) {
  const c = courses.get(userId, materialId);
  // 'building' with skills: a partial course being resumed (or a build that died) stays studyable meanwhile.
  if (!c || !['ready', 'partial', 'building'].includes(c.status) || !(c.skills || []).length) return null;
  return c;
}

function row(userId, materialId) {
  const mid = Number(materialId);
  let r = db.findOne('material_progress', (p) => p.user_id === userId && p.material_id === mid);
  if (!r) {
    r = db.insert('material_progress', {
      user_id: userId, material_id: mid, skills: {}, placed: false, placement: { answers: [], pending: null }, pending: null,
      pace: 0, forget_m: 0, steps: { lessons: 0, questions: 0 }, created_at: new Date().toISOString(),
    });
  }
  if (!r.placement) r.placement = { answers: [], pending: null };
  if (!r.steps) r.steps = { lessons: 0, questions: 0 };
  return r;
}
function skillState(r, id) {
  if (!r.skills[id]) r.skills[id] = { status: 'new', best: null, attempts: 0, tier: 1, right: 0, wrong_n: 0, due: null, wrong: [], misconceptions: [], via: null, read: false, remediate: false, placement_p: null, last_tested: null };
  const st = r.skills[id];
  if (st.tier == null) st.tier = 1;
  if (st.right == null) st.right = 0;
  if (st.wrong_n == null) st.wrong_n = 0;
  if (!st.misconceptions) st.misconceptions = [];
  if (!st.wrong) st.wrong = [];
  return st;
}
function save(r) {
  return db.update('material_progress', r.id, {
    skills: r.skills, placed: r.placed, placement: r.placement, pending: r.pending, pace: r.pace || 0, forget_m: r.forget_m || 0, fresh: r.fresh || null,
    test: r.test || null, tests: r.tests || [], steps: r.steps, updated_at: new Date().toISOString(),
  });
}

function unlocked(course, r, skill) {
  return skill.prerequisites.every((p) => (r.skills[p] && r.skills[p].status === 'mastered') || !course.skills.some((s) => s.id === p));
}
const isDue = (st, now) => st.status === 'mastered' && st.due && Date.parse(st.due) <= now;
const dueAt = (now, days) => new Date(now + days * DAY).toISOString();
function scheduleReview(r, st, now) {
  const days = path.intervalDays(st.right, st.wrong_n, r.forget_m || 0);
  st.due = dueAt(now, days);
  st.interval_days = days;
  return days;
}

/** The one recommended step. { kind: placement | review | lesson | quiz | done | wait, skill? } */
function nextStep(course, r, now) {
  if (!r.placed) return { kind: 'placement' };
  if (course.skills.some((s) => isDue(r.skills[s.id] || {}, now))) return { kind: 'review' };
  const open = course.skills.filter((s) => unlocked(course, r, s) && (r.skills[s.id] || {}).status !== 'mastered');
  const fix = open.find((s) => r.skills[s.id] && r.skills[s.id].remediate);
  const s = fix || open[0];
  if (!s) return course.skills.every((k) => (r.skills[k.id] || {}).status === 'mastered') ? { kind: 'done' } : { kind: 'wait' };
  const st = r.skills[s.id] || {};
  return { kind: st.read && !st.remediate ? 'quiz' : 'lesson', skill: s.id, title: s.title, remediation: !!st.remediate };
}

/** The map: units, every skill (level, tier, status, open, due), the next step and the learner's counts. */
function state(userId, materialId, now = Date.now()) {
  const course = loadCourse(userId, materialId);
  if (!course) return { error: 'There is no course to study yet.', code: 'no_course' };
  const r = row(userId, materialId);
  const skills = course.skills.map((s, i) => {
    const st = r.skills[s.id] || {};
    return {
      id: s.id, title: s.title, summary: s.summary, prerequisites: s.prerequisites, unit_id: s.unit_id || null, level: s.level || i + 1,
      source: s.source || 'material', status: st.status || 'new', open: unlocked(course, r, s), best: st.best == null ? null : st.best,
      tier: st.tier || 1, due: st.due || null, is_due: isDue(st, now), via: st.via || null, remediate: !!st.remediate, questions: s.questions.length,
    };
  });
  const dues = skills.filter((s) => s.is_due);
  const upcoming = skills.filter((s) => s.status === 'mastered' && s.due && !s.is_due).map((s) => s.due).sort()[0] || null;
  return {
    course: { title: course.title, status: course.status },
    units: course.units || [{ id: 'u1', title: course.title, skills: course.skills.map((s) => s.id) }],
    placed: !!r.placed, skills, mastered: skills.filter((s) => s.status === 'mastered').length, total: skills.length,
    due_count: dues.length, next_due: dues.length ? 'now' : upcoming, next: nextStep(course, r, now),
    steps: r.steps, pace: Math.round((r.pace || 0) * 100) / 100,
  };
}

// ── placement, one question at a time ───────────────────────────────────────────
function placementAskable(course, r, rnd) {
  const used = new Set(r.placement.answers.map((a) => a.qid));
  return (skillId) => {
    const skill = course.skills.find((s) => s.id === skillId);
    if (!skill) return null;
    const left = skill.questions.filter((q) => !used.has(q.id));
    if (!left.length) return null;
    // Tier 2 first: it shows the skill can be used, not just recalled.
    const at = (t) => left.filter((q) => (q.tier || 2) === t);
    const pool = at(2).length ? at(2) : (at(3).length ? at(3) : left);
    return pool[Math.floor(rnd() * pool.length)];
  };
}

function seedOf(userId, materialId) { return (Number(userId) * 131 + Number(materialId) * 7) >>> 0; }

/** Apply what placement concluded: known skills mastered (review on the curve), half-known ones a tier up. */
function finishPlacement(course, r, now) {
  const result = path.placementResult(course, r.placement.answers, seedOf(r.user_id, r.material_id));
  for (const s of course.skills) {
    const v = result[s.id];
    const st = skillState(r, s.id);
    st.placement_p = Math.round(v.p * 1000) / 1000;
    const mine = r.placement.answers.filter((a) => a.skill === s.id);
    if (v.verdict === 'known' && st.status === 'new') {
      st.status = 'mastered'; st.via = 'placement'; st.tier = 2;
      st.right += mine.filter((a) => a.correct).length; st.wrong_n += mine.filter((a) => !a.correct).length;
      st.last_tested = new Date(now).toISOString();
      scheduleReview(r, st, now);
    } else if (st.status === 'new') {
      st.tier = path.startTier(v.p, r.pace);
    }
    for (const a of mine.filter((x) => !x.correct)) if (!st.wrong.includes(a.qid)) st.wrong.push(a.qid);
  }
  r.placed = true;
  r.placement.pending = null;
  r.placement.done_at = new Date(now).toISOString();
  return result;
}

function placementSummary(course, result) {
  const by = { known: [], unsure: [], unknown: [] };
  for (const s of course.skills) by[result[s.id].verdict].push({ id: s.id, title: s.title });
  return { known: by.known, unsure: by.unsure, to_learn: by.unknown };
}

/** The next placement question (no answer), or the placement's result when it is done. */
function placementNext(userId, materialId, opts = {}) {
  const now = opts.now || Date.now();
  const rnd = opts.random || Math.random;
  const course = loadCourse(userId, materialId);
  if (!course) return { error: 'There is no course to study yet.', code: 'no_course' };
  const r = row(userId, materialId);
  if (r.placed) return { error: 'You have already done the starting check.', code: 'already_placed' };
  const most = path.placementCap(course.skills.length) + course.skills.length;
  if (r.placement.pending) {
    const p = r.placement.pending;
    const skill = course.skills.find((s) => s.id === p.skill);
    const q = skill && skill.questions.find((x) => x.id === p.qid);
    if (q) return { done: false, question: publicQ(q, skill.id), stage: p.stage, asked: r.placement.answers.length, most };
  }
  const nx = path.nextPlacement(course, r.placement.answers, placementAskable(course, r, rnd), seedOf(userId, materialId));
  if (!nx) {
    const result = finishPlacement(course, r, now);
    save(r);
    db.flush();
    return { done: true, asked: r.placement.answers.length, ...placementSummary(course, result) };
  }
  r.placement.pending = { skill: nx.skill, qid: nx.question.id, stage: nx.stage };
  save(r);
  return { done: false, question: publicQ(nx.question, nx.skill), stage: nx.stage, asked: r.placement.answers.length, most };
}

/** Answer the pending placement question. No feedback: placement only decides where to start. */
function placementAnswer(userId, materialId, qid, answer, opts = {}) {
  const course = loadCourse(userId, materialId);
  if (!course) return { error: 'There is no course to study yet.', code: 'no_course' };
  const r = row(userId, materialId);
  if (r.placed) return { error: 'You have already done the starting check.', code: 'already_placed' };
  const p = r.placement.pending;
  if (!p || p.qid !== String(qid || '')) return { error: 'That question is not open any more.', code: 'no_quiz' };
  const skill = course.skills.find((s) => s.id === p.skill);
  const q = skill && skill.questions.find((x) => x.id === p.qid);
  if (!q) return { error: 'No such question.', code: 'not_found' };
  const correct = isCorrect(q, answer);
  r.placement.answers.push({ skill: p.skill, qid: q.id, correct, guess: path.guessOf(q), stage: p.stage });
  r.placement.pending = null;
  r.pace = path.updatePace(r.pace, q.tier || 2, correct);
  r.steps.questions++;
  save(r);
  return placementNext(userId, materialId, opts);
}

// ── lessons and practice ────────────────────────────────────────────────────────
/** The lesson and a few practice questions (no answers). Opens only when the prerequisites are mastered. */
function lesson(userId, materialId, skillId, opts = {}) {
  const rnd = opts.random || Math.random;
  const course = loadCourse(userId, materialId);
  if (!course) return { error: 'There is no course to study yet.', code: 'no_course' };
  const skill = course.skills.find((s) => s.id === skillId);
  if (!skill) return { error: 'No such skill.', code: 'not_found' };
  const r = row(userId, materialId);
  if (!unlocked(course, r, skill)) return { error: 'Master the earlier skills first.', code: 'locked' };
  const st = skillState(r, skill.id);
  if (st.status === 'new') st.status = 'learning';
  const remediating = !!st.remediate;
  const n = path.practiceCount(st.tier, r.pace, remediating);
  // Practice at the skill's tier and below, the ones missed before first.
  const practiceQs = path.pickForTier(skill, Math.max(1, st.tier - 1), n, st.wrong, [], rnd);
  st.read = true;
  st.remediate = false; // the remediation is this lesson; the check comes next
  st.practice_ids = practiceQs.map((q) => q.id);
  r.steps.lessons++;
  save(r);
  return {
    skill: {
      id: skill.id, title: skill.title, source: skill.source || 'material', tier: st.tier, lesson: skill.lesson,
      practice: practiceQs.map((q) => publicQ(q, skill.id)),
      remediation: remediating ? { misconceptions: st.misconceptions.slice(-3).map((m) => (typeof m === 'object' ? m.text : m)) } : null,
    },
  };
}

/** One practice question, answered and explained at once. Does not count toward mastery; moves the learner's pace. */
function practice(userId, materialId, skillId, qid, answer) {
  const course = loadCourse(userId, materialId);
  if (!course) return { error: 'There is no course to study yet.', code: 'no_course' };
  const skill = course.skills.find((s) => s.id === skillId);
  const q = skill && skill.questions.find((x) => x.id === qid);
  if (!q) return { error: 'No such question.', code: 'not_found' };
  const r = row(userId, materialId);
  if (!unlocked(course, r, skill)) return { error: 'Master the earlier skills first.', code: 'locked' };
  // Only a question the lesson handed out as practice, and never one that is open in a placement or a check: otherwise
  // this endpoint would give away the key to the question being asked.
  const st = r.skills[skill.id] || {};
  const pending = [...((r.pending && r.pending.qids) || []).map((x) => x[1]), (r.placement && r.placement.pending && r.placement.pending.qid) || null];
  if (!(st.practice_ids || []).includes(qid) || pending.includes(qid)) return { error: 'That question is not open for practice.', code: 'not_practice' };
  const correct = isCorrect(q, answer);
  r.pace = path.updatePace(r.pace, q.tier || 2, correct);
  r.steps.questions++;
  if (correct) st.misconceptions = (st.misconceptions || []).filter((m) => typeof m !== 'object' || m.q !== q.id);
  save(r);
  return { correct, answer: correctText(q), explanation: q.explanation, quote: q.quote, misconception: misconceptionOf(q, answer), source: q.source || 'material' };
}

// ── checks and reviews ──────────────────────────────────────────────────────────
function pickQuestions(course, r, mode, skillId, now, rnd) {
  if (mode === 'mastery') {
    const skill = course.skills.find((s) => s.id === skillId);
    const st = skillState(r, skillId);
    const main = path.pickForTier(skill, st.tier, QUIZ_SIZE, st.wrong, st.practice_ids, rnd).map((q) => ({ skill, q, role: 'main' }));
    // Interleave one question from an earlier mastered skill: the one closest to falling due.
    const earlier = course.skills.filter((s) => s.id !== skillId && (r.skills[s.id] || {}).status === 'mastered')
      .sort((a, b) => String(r.skills[a.id].due || '').localeCompare(String(r.skills[b.id].due || '')))[0];
    if (earlier) {
      const mix = path.pickForTier(earlier, Math.max(2, r.skills[earlier.id].tier || 2), 1, r.skills[earlier.id].wrong, [], rnd)[0];
      if (mix) main.splice(Math.floor(rnd() * (main.length + 1)), 0, { skill: earlier, q: mix, role: 'mix' });
    }
    return main;
  }
  // review: the due skills, interleaved, at tier 2 or above (harder after mastery)
  const due = course.skills.filter((s) => isDue(r.skills[s.id] || {}, now))
    .sort((a, b) => String(r.skills[a.id].due).localeCompare(String(r.skills[b.id].due)))
    .slice(0, Math.floor(REVIEW_SIZE / PER_SKILL_REVIEW));
  const picked = due.flatMap((s) => path.pickForTier(s, Math.max(2, r.skills[s.id].tier || 2), PER_SKILL_REVIEW, r.skills[s.id].wrong, [], rnd).map((q) => ({ skill: s, q, role: 'main' })));
  return shuffle(picked, rnd);
}

/** Start a one-shot quiz. mode: mastery (needs skill) | review. */
function startQuiz(userId, materialId, mode, skillId, opts = {}) {
  const now = opts.now || Date.now();
  const rnd = opts.random || Math.random;
  const course = loadCourse(userId, materialId);
  if (!course) return { error: 'There is no course to study yet.', code: 'no_course' };
  const r = row(userId, materialId);
  if (mode === 'placement') return { error: 'The starting check is one question at a time now.', code: 'use_placement' };
  if (mode === 'mastery') {
    const skill = course.skills.find((s) => s.id === skillId);
    if (!skill) return { error: 'No such skill.', code: 'not_found' };
    if (!unlocked(course, r, skill)) return { error: 'Master the earlier skills first.', code: 'locked' };
  } else if (mode === 'review') {
    if (!course.skills.some((s) => isDue(r.skills[s.id] || {}, now))) return { error: 'Nothing is due for review yet.', code: 'nothing_due' };
  } else return { error: 'Unknown quiz.', code: 'bad_mode' };

  const picked = pickQuestions(course, r, mode, skillId, now, rnd);
  if (!picked.length) return { error: 'No questions available.', code: 'empty' };
  const id = crypto.randomBytes(8).toString('hex');
  r.pending = { id, mode, skill: mode === 'mastery' ? skillId : null, qids: picked.map(({ skill, q, role }) => [skill.id, q.id, role]), issued_at: new Date(now).toISOString() };
  save(r);
  return {
    quiz_id: id, mode, pass_mark: mode === 'mastery' ? PASS : null,
    tier: mode === 'mastery' ? skillState(r, skillId).tier : null,
    questions: picked.map(({ skill, q }) => publicQ(q, skill.id)),
  };
}

/**
 * Every answer: the missed question comes first next time, its misconception is kept until it is answered right.
 * results: [{ q, sid, ok, given, role }]. Shared by the checks and reviews (submit) and the practice test.
 */
function noteAnswers(r, results, now) {
  for (const x of results) {
    const st = skillState(r, x.sid);
    const wrongSet = new Set(st.wrong);
    if (x.ok) wrongSet.delete(x.q.id); else wrongSet.add(x.q.id);
    st.wrong = [...wrongSet].slice(0, 20);
    // A misconception is kept with the question it came from, and dropped once that question is answered right.
    const mis = misconceptionOf(x.q, x.given);
    if (x.ok) st.misconceptions = st.misconceptions.filter((m) => typeof m !== 'object' || m.q !== x.q.id);
    else if (mis) st.misconceptions = [...st.misconceptions.filter((m) => (typeof m === 'object' ? m.text : m) !== mis), { q: x.q.id, text: mis }].slice(-6);
    if (x.role === 'mix') {
      // The interleaved question is a memory test of an earlier skill: a miss brings that skill's review forward.
      // A right answer is a successful retrieval of that skill, so it counts as its review: the clock restarts from now.
      if (x.ok) { st.right++; if (st.status === 'mastered') { st.last_tested = new Date(now).toISOString(); scheduleReview(r, st, now); } } else { st.wrong_n++; if (st.status === 'mastered') st.due = new Date(now).toISOString(); }
    }
  }
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
  for (const [sid, qid, role] of quiz.qids) {
    const skill = course.skills.find((s) => s.id === sid);
    const q = skill && skill.questions.find((x) => x.id === qid);
    if (!q) continue;
    const ok = isCorrect(q, given[qid]);
    r.pace = path.updatePace(r.pace, q.tier || 2, ok);
    r.steps.questions++;
    results.push({ q, sid, ok, given: given[qid], role: role || 'main' });
    if (role === 'mix') continue;
    const t = per.get(sid) || { right: 0, total: 0 };
    t.total++;
    if (ok) t.right++;
    per.set(sid, t);
  }

  const report = [];
  for (const [sid, t] of per) {
    const st = skillState(r, sid);
    const score = t.right / t.total;
    const skill = course.skills.find((s) => s.id === sid);
    const entry = { skill: sid, title: skill.title, right: t.right, total: t.total, score };
    st.attempts++;
    if (quiz.mode === 'mastery') {
      st.best = Math.max(st.best || 0, score);
      entry.passed = score >= PASS;
      st.right += t.right; st.wrong_n += t.total - t.right;
      st.tier = path.tierAfter(st.tier, score);
      entry.tier = st.tier;
      if (entry.passed) {
        // A passed check is an answer on a skill the learner knows right now: it measures their slips.
        r.fresh = { right: ((r.fresh && r.fresh.right) || 0) + t.right, total: ((r.fresh && r.fresh.total) || 0) + t.total };
        st.status = 'mastered'; st.via = 'quiz'; st.remediate = false; st.last_tested = new Date(now).toISOString();
        entry.next_in_days = scheduleReview(r, st, now);
      } else {
        st.status = 'learning'; st.remediate = true;
      }
    } else if (quiz.mode === 'review') {
      const days = st.last_tested ? Math.max(0, (now - Date.parse(st.last_tested)) / DAY) : 1;
      r.forget_m = path.updateForgetting(r.forget_m, days, st.right, st.wrong_n, score, path.freshAccuracy(r.fresh));
      st.right += t.right; st.wrong_n += t.total - t.right;
      st.last_tested = new Date(now).toISOString();
      if (t.right === t.total) {
        entry.passed = true;
        st.tier = Math.min(3, Math.max(st.tier, 2));
        entry.next_in_days = scheduleReview(r, st, now);
      } else if (t.right > 0) {
        // Half the last interval (at least a day): one miss in two is a wobble, not a reset.
        entry.passed = false; entry.shaky = true;
        const half = Math.max(1, Math.floor((st.interval_days || 1) / 2));
        st.due = dueAt(now, half); st.interval_days = half;
        entry.next_in_days = half;
      } else {
        entry.passed = false;
        st.status = 'learning'; st.remediate = true; st.tier = Math.max(1, st.tier - 1); st.due = null;
      }
    }
    report.push(entry);
  }
  noteAnswers(r, results, now);
  save(r);
  db.flush();

  const out = { mode: quiz.mode, report, overall: { right: results.filter((x) => x.ok).length, total: results.length } };
  // Remediation: for each miss, the answer, the reason, the misunderstanding behind the pick and the passage.
  out.remediation = results.filter((x) => !x.ok).map((x) => ({
    id: x.q.id, skill: x.sid, prompt: x.q.prompt,
    your_answer: x.q.type === 'multiple_choice' ? (Number.isInteger(x.given) ? x.q.choices[x.given] || null : null) : (typeof x.given === 'string' ? x.given.slice(0, 200) : null),
    correct_answer: correctText(x.q), explanation: x.q.explanation, misconception: misconceptionOf(x.q, x.given),
    from_your_material: x.q.quote, source: x.q.source || 'material',
  }));
  out.results = results.map((x) => ({ id: x.q.id, ok: x.ok, interleaved: x.role === 'mix' }));
  out.next = nextStep(course, r, now);
  return out;
}

/**
 * One check-in question from the podcast, answered while listening. The practice test's rule (services/material-test.js
 * submit) for a single question: graded on the server from the key kept with the episode, the miss is filed against
 * the skill by noteAnswers (first next time, with the mix-up the course recorded for that pick, when the item is the
 * course's own), and the skill's counts move. A mastered skill comes back for review on this learner's curve when the
 * answer was right, and is due now when it was wrong. A check-in never masters a skill or moves its tier: the mastery
 * check does that. A skipped question is never sent here, so it never reaches the model.
 */
function checkin(userId, materialId, check, answer, opts = {}) {
  const now = opts.now || Date.now();
  const course = loadCourse(userId, materialId);
  if (!course) return { error: 'There is no course to study yet.', code: 'no_course' };
  const skill = course.skills.find((s) => s.id === (check && check.skill));
  if (!skill) return { error: 'That question is not on this material any more.', code: 'not_found' };
  const given = Number(answer);
  const ok = Number.isInteger(given) && given === check.answer_index;
  // The question as the learner met it: the course's own item when the script took it from there (its misconceptions
  // too), else the copy the episode kept. The verdict is the episode's key, the one the choices were shown against.
  const own = (check.qid && (skill.questions || []).find((x) => x.id === check.qid)) || null;
  const q = own || { id: check.pack_qid || `podcast:${check.id}`, type: 'multiple_choice', choices: check.choices || [], answer_index: check.answer_index };
  const r = row(userId, materialId);
  const st = skillState(r, skill.id);
  r.pace = path.updatePace(r.pace, 2, ok);
  r.steps.questions++;
  noteAnswers(r, [{ q, sid: skill.id, ok, given: Number.isInteger(given) ? given : null, role: 'main' }], now);
  st.right += ok ? 1 : 0;
  st.wrong_n += ok ? 0 : 1;
  const out = { correct: ok, correct_index: check.answer_index, skill: skill.id, skill_title: skill.title, status: st.status };
  if (st.status === 'mastered') {
    if (ok) { st.last_tested = new Date(now).toISOString(); out.next_in_days = scheduleReview(r, st, now); } else { st.due = new Date(now).toISOString(); out.review_now = true; }
  }
  out.due = st.due || null;
  save(r);
  db.flush();
  return out;
}

function removeForMaterial(userId, materialId) {
  return db.remove('material_progress', (p) => p.user_id === userId && p.material_id === Number(materialId));
}

/**
 * What is due for review across all of a learner's courses (for the home page).
 * Titles and counts only: no questions, answers or quotes. `due_count` is skills, `cards_due` is flashcards
 * (services/material-cards.js; only cards already in the learner's deck, counted without writing anything).
 */
function dueSummary(userId, now = Date.now()) {
  const items = [];
  const seen = new Set();
  const cardsDue = (materialId) => {
    const deck = db.findOne('material_cards', (c) => c.user_id === userId && c.material_id === materialId);
    return deck ? deck.cards.filter((c) => !c.due || Date.parse(c.due) <= now).length : 0;
  };
  for (const r of db.find('material_progress', (p) => p.user_id === userId)) {
    const course = loadCourse(userId, r.material_id);
    if (!course) continue;
    seen.add(r.material_id);
    const due = course.skills.filter((s) => isDue(r.skills[s.id] || {}, now)).length;
    const cards = cardsDue(r.material_id);
    if (due || cards) items.push({ material_id: r.material_id, title: course.title, due_count: due, cards_due: cards });
  }
  // A deck for a material the learner has not started the path of (study pack only).
  for (const d of db.find('material_cards', (c) => c.user_id === userId && !seen.has(c.material_id))) {
    const m = db.findOne('materials', (x) => x.user_id === userId && x.id === d.material_id);
    const cards = m ? cardsDue(d.material_id) : 0;
    if (cards) items.push({ material_id: d.material_id, title: m.title, due_count: 0, cards_due: cards });
  }
  items.sort((a, b) => (b.due_count + b.cards_due) - (a.due_count + a.cards_due));
  return {
    total: items.reduce((n, i) => n + i.due_count, 0),
    cards_total: items.reduce((n, i) => n + i.cards_due, 0),
    materials: items,
  };
}

module.exports = {
  internals: { row, skillState, save, loadCourse, scheduleReview, noteAnswers, publicQ, correctText, misconceptionOf, shuffle },
  dueSummary, PASS, QUIZ_SIZE, gradeShort, isCorrect, misconceptionOf, state, nextStep, lesson, practice,
  placementNext, placementAnswer, startQuiz, submit, checkin, removeForMaterial,
};
