/**
 * The daily review: one short sitting a day that keeps what a grade has already
 * taught (curriculum-build/ADAPTIVE-COVERAGE.md section 7, decision 6; staged
 * patch round3/01-daily-review).
 *
 * What is in it comes from the learner's own record (services/adaptation.js
 * `dailyReview`): memory checks first, because the coverage gate waits on
 * them, then objectives the forgetting curve says have faded, then the least
 * durable ones, one question each, cut to a time budget (ADAPT_REVIEW_MINUTES,
 * 10). Objectives the record says were forgotten are not questions: they are
 * listed to be taught again, from their own lesson.
 *
 * A review sitting is a session of kind `review`. It moves nothing: it is
 * stored as a look away from the learner's level (`preview`), so closing it,
 * finishing it or leaving it half done never clears, advances or holds a level.
 * Every question is tagged with its objective (`objective_id`), which is what
 * makes the answer count as evidence on that objective and no other
 * (coverage.attribute).
 *
 * Off unless ADAPT_REVIEW_SESSION=on.
 */
const db = require('../config/db');
const curriculum = require('../config/curriculum');
const bank = require('../content/bank');
const adaptation = require('./adaptation');
const mastery = require('./mastery');
const sessions = require('./sessions');
const objItems = require('./objective-items');

function enabled() {
  // Default on since 2026-10-24 (owner approved, LIVE-CHANGES-2026-10-24.md); ADAPT_REVIEW_SESSION=off turns it off.
  return String(process.env.ADAPT_REVIEW_SESSION || 'on').toLowerCase() === 'on';
}

/**
 * Questions written for one objective each (services/objective-items.js, built
 * from the content factory's kept items into content/objective-items/ by
 * scripts/build-objective-items.js): objective id -> items, for one grade.
 * Empty with OBJECTIVE_ITEMS=off. Where an objective has none not yet asked,
 * the bank's question on its skill, at its lesson's difficulty, is used.
 */
function objectiveItems(trackId, gradeId) {
  return objItems.enabled() ? objItems.forGrade(trackId, gradeId) : new Map();
}

/** Everything this learner has been asked on these skills, so a review does not repeat a recent question. */
function askedBefore(userId, skills) {
  const wanted = new Set(skills);
  return new Set(db.find('items', (i) => i.user_id === userId && wanted.has(i.skill_id)).slice(-600).map((i) => bank.itemKey(i)));
}

/** One question on one objective: a written-for-it item when there is one not yet asked, else the bank's. */
function questionFor(row, grade, avoid, trackId, seenShapes = null) {
  const plan = curriculum.levelPlan(grade, row.lesson_level);
  // Held to the grade's range and standard, like the lesson the objective came
  // from (config/grade-skills.js fitEntry; the review used to skip both).
  const entry = require('../config/grade-skills').fitEntry(grade, {
    skillId: row.skill, difficulty: Math.max(1, Math.min(10, Math.round(plan.difficulty * 10) / 10)), role: 'review',
  });
  const { difficulty } = entry;
  const written = objItems.pick({ trackId, gradeId: grade.id, objectiveId: row.objective, avoid, seenShapes, difficulty });
  if (written) return { ...written, skill_id: written.skill_id || row.skill };
  // Typed answers where the skill has them: one right typed recall is a whole
  // memory check, where a multiple-choice one is half of one.
  return sessions.generateWithPreference(entry, true, avoid);
}

/**
 * Folded into the retention enforcers (services/enforcers.js; on unless
 * ENFORCER_FOLD_REVIEW=off or RETENTION_ENFORCERS=off): the scheduled enforcers
 * already bring back everything the learner worked on in their windows, so the
 * daily review keeps only the older work no enforcer will reach (objectives last
 * answered before the earliest window still to come), and the lessons to learn
 * again. While the Final is held for consolidation it is the whole review, as
 * before: that stretch is made of daily reviews.
 */
function folded() {
  try {
    // eslint-disable-next-line global-require
    return require('./enforcers').foldsReview();
  } catch {
    return false;
  }
}

/** Today's review plan for one enrollment: adaptation.dailyReview, folded as above. */
function planFor(userId, enrollment, now = Date.now()) {
  if (!folded()) return adaptation.dailyReview({ userId, enrollment, now });
  try {
    // eslint-disable-next-line global-require
    const consolidation = require('./consolidation');
    const stretch = consolidation.forEnrollment(userId, enrollment, null, { now });
    if (stretch && stretch.active) return { ...adaptation.dailyReview({ userId, enrollment, now }), folded: false, consolidating: true };
  } catch { /* consolidation unreadable: fold as usual */ }
  const record = adaptation.recordFor(userId, enrollment);
  if (!record) return null;
  const k = adaptation.knobs();
  const plan = adaptation.dailyReview({ userId, enrollment, now, record, minutes: 1e6 });
  if (!plan) return null;
  // eslint-disable-next-line global-require
  const enforcers = require('./enforcers');
  // eslint-disable-next-line global-require
  const study = require('./study-sessions');
  // eslint-disable-next-line global-require
  const schedule = require('./retention-schedule');
  const reach = enforcers.reachStart(userId, now);
  const tz = study.zoneFor(userId);
  const lastAt = new Map(record.report.model.objectives.map((o, i) => [o.id, record.report.states[i].last_at]));
  // Kept in an enforcer in the last 20 hours: not asked again here (retention-enforcer-params.json record_updates).
  const since = now - 20 * 3600 * 1000;
  const kept = new Set(db.find('items', (i) => i.user_id === userId && i.enforcer_id && i.correct === true && i.objective_id
    && Date.parse(i.answered_at || i.updated_at || 0) >= since).map((i) => i.objective_id));
  const old = plan.retrieve.filter((r) => { const t = lastAt.get(r.objective); return !kept.has(r.objective) && (!t || schedule.localDate(t, tz) < reach); });
  const retrieve = [];
  let used = 0;
  for (const r of old) {
    if (retrieve.length && used + k.ITEM_MINUTES > k.REVIEW_MINUTES + 1e-9) break;
    used += k.ITEM_MINUTES;
    retrieve.push(r);
  }
  return {
    ...plan,
    budget: k.REVIEW_MINUTES,
    minutes: Number(used.toFixed(2)),
    retrieve,
    more: old.length - retrieve.length,
    due: retrieve.length + plan.reteach.length,
    folded: true,
    reach_from: reach,
  };
}

/** The review sitting left open on this enrollment, if any. */
function openFor(userId, enrollmentId) {
  return db.findOne('sessions', (s) => s.user_id === userId && s.enrollment_id === enrollmentId
    && s.kind === 'review' && !s.ended_at) || null;
}

/** Review sittings finished today (UTC day), for "done for today". */
function doneToday(userId, enrollmentId, now = Date.now()) {
  const day = new Date(now).toISOString().slice(0, 10);
  return db.find('sessions', (s) => s.user_id === userId && s.enrollment_id === enrollmentId
    && s.kind === 'review' && s.ended_at && !s.abandoned && String(s.ended_at).slice(0, 10) === day);
}

/**
 * Today's review for one enrollment, as the path and the review page show it.
 * Null when the grade has no objective model (or the learner is the owner).
 */
function today(userId, enrollment, { now = Date.now() } = {}) {
  if (enrollment.status !== 'active') return null;
  const plan = planFor(userId, enrollment, now);
  if (!plan) return null;
  const open = openFor(userId, enrollment.id);
  const done = doneToday(userId, enrollment.id, now);
  return {
    ...plan,
    open_session: open ? open.id : null,
    done_today: done.length,
    counts: {
      memory_check: plan.retrieve.filter((r) => r.reason === 'memory_check').length,
      fading: plan.retrieve.filter((r) => r.reason === 'fading').length,
      durability: plan.retrieve.filter((r) => r.reason === 'durability').length,
      reteach: plan.reteach.length,
    },
  };
}

/**
 * Start (or resume) today's review sitting: one question per objective on the
 * retrieval list, interleaved across skills as the list already is.
 *
 * @returns {{session, items, plan}|{error, status}}
 */
function start(userId, enrollment, { now = Date.now() } = {}) {
  const grade = curriculum.getGrade(enrollment.track_id, enrollment.grade_id);
  if (!grade) return { error: 'That subject is no longer available.', status: 400 };
  const open = openFor(userId, enrollment.id);
  if (open && sessions.itemsFor(open.id).length) {
    return { session: open, items: sessions.itemsFor(open.id), resumed: true };
  }
  const plan = planFor(userId, enrollment, now);
  if (!plan || !plan.retrieve.length) return { error: 'Nothing to review today.', status: 409 };

  const session = db.insert('sessions', {
    user_id: userId,
    enrollment_id: enrollment.id,
    track_id: enrollment.track_id,
    grade_id: enrollment.grade_id,
    level: enrollment.current_level,
    start_level: enrollment.current_level,
    end_level: enrollment.current_level,
    levels: [enrollment.current_level],
    blocks: [{ index: 0, level: enrollment.current_level, kind: 'review', resolved: false }],
    kind: 'review',
    // Stored as a look away from the level, so nothing about this sitting can
    // clear, advance or hold one (services/sessions.js reads `preview`).
    preview: true,
    at_level: enrollment.current_level,
    // Feedback on every answer: retrieval with feedback is the point.
    params: { itemCount: plan.retrieve.length, immediateFeedback: true },
    review_plan: { at: plan.at, minutes: plan.minutes, objectives: plan.retrieve.map((r) => ({ objective: r.objective, reason: r.reason, recall: r.recall })) },
    started_at: new Date(now).toISOString(),
    ended_at: null,
    score: null,
    analysis: null,
    xp_awarded: 0,
  });

  const avoid = askedBefore(userId, plan.retrieve.map((r) => r.skill));
  const shapes = new Set();
  const items = plan.retrieve.map((row, index) => {
    const q = questionFor(row, grade, avoid, enrollment.track_id, shapes);
    avoid.add(bank.itemKey(q));
    return db.insert('items', {
      ...q,
      session_id: session.id,
      user_id: userId,
      role: 'review',
      level: row.lesson_level,
      block: 0,
      index,
      objective_id: row.objective,
      // A memory check tests the objective; it does not teach it.
      objective_test: true,
      review_reason: row.reason,
      user_answer: null,
      correct: null,
      ms: null,
      coach_used: false,
    });
  });
  return { session: db.byId('sessions', session.id), items, plan, resumed: false };
}

/**
 * Close a review sitting: its score, XP and the day's streak, and what the
 * record says now (how many objectives are kept, how many still due).
 */
function finish(userId, session, { now = Date.now() } = {}) {
  const items = sessions.itemsFor(session.id);
  const answered = items.filter((i) => i.correct !== null && i.correct !== undefined);
  const right = answered.filter((i) => i.correct).length;
  const accuracy = answered.length ? right / answered.length : 0;
  const xp = mastery.xpForItems(answered);
  let streak = null;
  if (!session.ended_at) {
    db.update('sessions', session.id, {
      ended_at: new Date(now).toISOString(),
      score: accuracy,
      xp_awarded: xp,
      blocks: (session.blocks || []).map((b) => ({ ...b, resolved: true })),
    });
    // Local day plus one grace day (services/streak.js; STREAK_LOCAL_GRACE, the owner keeps the old UTC rule).
    streak = require('./streak').record(userId, { xp, now });
    const enrollment = db.byId('enrollments', session.enrollment_id);
    if (enrollment) db.update('enrollments', enrollment.id, { xp: (enrollment.xp || 0) + xp, last_review_at: new Date(now).toISOString() });
  }
  const enrollment = db.byId('enrollments', session.enrollment_id);
  const after = enrollment ? adaptation.dailyReview({ userId, enrollment, now }) : null;
  return {
    asked: items.length,
    answered: answered.length,
    right,
    accuracy,
    xp,
    streak,
    by_objective: answered.map((i) => ({ objective: i.objective_id, reason: i.review_reason, correct: !!i.correct })),
    gate: after ? after.gate : null,
    durability: after ? after.durability : null,
    still_due: after ? after.retrieve.filter((r) => r.reason === 'memory_check').length : null,
    reteach: after ? after.reteach : [],
  };
}

module.exports = {
  enabled,
  folded,
  planFor,
  today,
  start,
  finish,
  openFor,
  doneToday,
  questionFor,
  objectiveItems,
};
