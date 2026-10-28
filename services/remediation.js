/**
 * What happens when a Master or Grand Master quiz is not passed.
 *
 * The learner is not sent away to wait. They get two doors, and both stay open:
 *
 *   Retry the quiz    Same level, same topics, questions written fresh
 *                     (services/sessions.js, on the `regen` model). Recognising
 *                     the questions from a failed attempt is not a retest.
 *   Help me learn     The tutor reads the attempt, works out what actually went
 *                     wrong, and teaches those areas one at a time — a short
 *                     lesson, a conversation, and drill questions — until each
 *                     one holds. The retry button is on screen the whole time.
 *
 * An area is "held" when the learner answers its drill questions at or above the
 * pass mark. Holding every area does not advance the level: only passing the
 * quiz does that. This file owns the record of the failure and the state of the
 * teaching; the quiz itself belongs to services/sessions.js.
 */
const db = require('../config/db');
const curriculum = require('../config/curriculum');
const ai = require('./ai');
const learner = require('./learner');

/** How many drill questions per area, and the share of them that must be right. */
const DRILL_COUNT = 5;

/**
 * After a missed Final, plan from the learner's record as well as from the
 * missed questions (staged round 3, ADAPT_REMEDIATION=on; off by default):
 * which objectives to learn again (unproven, or proven and since forgotten) and
 * which to retrieve (kept, but fading), from every answer in the grade
 * (services/adaptation.js remediationPlanFor). Checkpoints below the Final keep
 * the skill areas alone.
 */
function recordPlanOn(kind) {
  // Default on since 2026-10-24 (owner approved, LIVE-CHANGES-2026-10-24.md); ADAPT_REMEDIATION=off turns it off.
  return kind === 'graduation' && String(process.env.ADAPT_REMEDIATION || 'on').toLowerCase() === 'on';
}

/**
 * Group a failed attempt by skill, worst first, keeping the actual wrong answers.
 *
 * The wrong answers are the whole point: "weak at factoring" is not a diagnosis,
 * and a tutor that only knows the topic teaches the topic again. What fixes
 * something is knowing that they factored correctly and then dropped the sign.
 */
function areasFrom(items) {
  const graded = items.filter((i) => i.correct !== null && i.role !== 'retention');
  const bySkill = new Map();
  for (const item of graded) {
    const row = bySkill.get(item.skill_id) || {
      skill_id: item.skill_id,
      skill_name: item.skill_name || curriculum.skillName(item.skill_id),
      asked: 0,
      correct: 0,
      difficulty: 0,
      missed: [],
      tags: {},
    };
    row.asked++;
    row.difficulty += item.difficulty || 5;
    if (item.correct) {
      row.correct++;
    } else {
      row.missed.push({
        item_id: item.id,
        prompt: item.prompt,
        answer: item.answer,
        user_answer: item.user_answer,
        error_tag: item.error_tag || null,
        difficulty: item.difficulty,
      });
      if (item.error_tag) row.tags[item.error_tag] = (row.tags[item.error_tag] || 0) + 1;
    }
    bySkill.set(item.skill_id, row);
  }

  return [...bySkill.values()]
    .filter((r) => r.missed.length)
    .map((r) => ({
      ...r,
      accuracy: r.correct / r.asked,
      difficulty: Math.round((r.difficulty / r.asked) * 10) / 10,
      top_tag: Object.entries(r.tags).sort((a, b) => b[1] - a[1])[0] || null,
    }))
    .sort((a, b) => a.accuracy - b.accuracy || b.missed.length - a.missed.length);
}

/** The teaching to show when the model is unavailable. Honest, not clever. */
function fallbackTeaching(area) {
  const tag = area.top_tag && area.top_tag[0];
  const phrase = tag && learner.ERROR_TAG_PHRASES[tag];
  return {
    headline: area.skill_name,
    diagnosis: `You got ${area.correct} of ${area.asked} right here`
      + `${phrase ? `, and the pattern in the misses is ${phrase}` : ''}.`,
    misconception: '',
    teach: null,
    opener: `Let's take one of these apart. Looking at "${String(area.missed[0].prompt).slice(0, 160)}" —`
      + ' what is the first thing you would do, and why that first?',
    source: 'rules',
  };
}

/**
 * Record a failed checkpoint and start the teaching material.
 *
 * The record is written from the rules immediately, because the learner is about
 * to land on the recap screen and something real has to be there. The deep read —
 * what the misunderstanding actually is, and the teaching for it — replaces it on
 * the same row when it lands, which is usually while they are still reading.
 */
/**
 * Diagnoses already in flight, keyed by the session they belong to.
 *
 * The point of this map is the five-second page. Reading a failed quiz properly
 * takes MiMo pro over a minute, and a learner who clicks "help me learn" does not
 * want to watch that. So the work starts the moment the quiz becomes
 * unwinnable — while they are still answering the last few questions — and by the
 * time they have read the recap and clicked, the answer is already on the row.
 */
const inFlight = new Map();

/**
 * Called after each answer on a checkpoint. Once the best possible score has
 * dropped below the pass mark, the quiz is decided and the teaching can be
 * written from what has been answered so far.
 */
function startEarly({ userId, session, enrollment, kind, required }) {
  if (inFlight.has(session.id)) return;
  const items = db.find('items', (i) => i.session_id === session.id && i.role === 'exam');
  if (!items.length) return;
  const graded = items.filter((i) => i.correct !== null);
  const correct = graded.filter((i) => i.correct).length;
  const unanswered = items.length - graded.length;
  // Everything still unanswered counted as correct: the ceiling on this attempt.
  const ceiling = (correct + unanswered) / items.length;
  if (ceiling >= required) return;
  // Wait for a little evidence before diagnosing, or the areas are one question.
  if (graded.length < Math.min(5, items.length)) return;

  const areas = areasFrom(items);
  if (!areas.length) return;
  const shared = {
    kindLabel: curriculum.CHECKPOINT_LABEL[kind] || kind,
    level: enrollment.current_level,
    accuracy: correct / Math.max(1, graded.length),
    required,
    userId,
  };
  // Two calls, both on MiMo pro. The first covers only the area the learner will
  // land on and answers in about fifteen seconds; the second covers everything and
  // takes over a minute. Started here — mid-quiz — the first is almost always
  // finished before the learner has stopped answering questions.
  inFlight.set(session.id, {
    startedAt: Date.now(),
    areas,
    first: ai.diagnoseArea({ ...shared, area: areas[0] }).catch((err) => {
      console.warn(`ai: first-area diagnosis failed: ${err.message}`);
      return null;
    }),
    rest: ai.diagnoseCheckpoint({ ...shared, areas }).catch((err) => {
      console.warn(`ai: early checkpoint diagnosis failed: ${err.message}`);
      return null;
    }),
  });
}

/** Whatever the early diagnosis produced, and how long ago it was asked for. */
function earlyFor(sessionId) {
  return inFlight.get(sessionId) || null;
}

function clearEarly(sessionId) {
  inFlight.delete(sessionId);
}

/**
 * Open the two doors out of a failed checkpoint.
 *
 * `areas` is passed in by the written checkpoint, which knows its weak areas
 * from the rubric rather than from missed questions. Everything downstream of
 * this — the teaching conversation, the drills, the held-when-back-up test — is
 * the same either way, which is the point: a learner who writes an essay badly
 * and a learner who answers fifteen questions badly are in the same place and
 * should be offered the same two ways out.
 */
function open({ userId, session, enrollment, kind, accuracy, required, areas: given }) {
  const areas = given || areasFrom(db.find('items', (i) => i.session_id === session.id));
  // Nothing wrong in any one skill and still under the mark: spread thin rather
  // than concentrated. Take the whole attempt as one area to work on.
  const row = db.insert('remediations', {
    user_id: userId,
    enrollment_id: enrollment.id,
    session_id: session.id,
    track_id: enrollment.track_id,
    grade_id: enrollment.grade_id,
    kind,
    level: enrollment.current_level,
    accuracy,
    required,
    attempt: (enrollment.checkpoint_attempts || 0) + 1,
    areas: areas.map((area) => ({ ...area, ...fallbackTeaching(area), held: false, drills: [] })),
    diagnosis_source: 'rules',
    cleared_at: null,
  });

  if (recordPlanOn(kind)) {
    // eslint-disable-next-line global-require
    const adaptation = require('./adaptation');
    const record = adaptation.remediationPlanFor({ userId, enrollment, missedSkills: areas.map((a) => a.skill_id) });
    if (record) db.update('remediations', row.id, { record: { ...record, rounds: [] } });
  }

  // If the diagnosis was started mid-quiz, attach to it rather than asking again.
  const early = earlyFor(session.id);
  if (early) {
    clearEarly(session.id);
    // Whichever lands first is folded in first, so the page is usable as early as
    // possible and gets more complete rather than waiting to be complete.
    early.first.then((area) => { if (area) foldIn(row.id, [area]); });
    early.rest.then((diagnosed) => {
      if (diagnosed) foldIn(row.id, diagnosed);
      else if (row.diagnosis_source === 'rules') {
        upgradeDiagnosis(row.id, { userId, kind, areas, accuracy, required, level: enrollment.current_level });
      }
    });
  } else {
    upgradeDiagnosis(row.id, { userId, kind, areas, accuracy, required, level: enrollment.current_level });
  }
  return row;
}

/**
 * Merge a diagnosis into a stored remediation, keeping the model's ordering.
 *
 * Called twice in the normal case — once with the first area, once with all of
 * them — so it must be safe to apply partially and then again more fully.
 */
function foldIn(remediationId, diagnosed) {
  const row = db.byId('remediations', remediationId);
  if (!row) return;
  const bySkill = new Map(diagnosed.map((d) => [d.skill_id, d]));
  const merged = row.areas
    .map((area) => (bySkill.has(area.skill_id) ? { ...area, ...bySkill.get(area.skill_id) } : area))
    .sort((a, b) => {
      const ai_ = diagnosed.findIndex((d) => d.skill_id === a.skill_id);
      const bi = diagnosed.findIndex((d) => d.skill_id === b.skill_id);
      return (ai_ === -1 ? 99 : ai_) - (bi === -1 ? 99 : bi);
    });
  // "partial" when only some areas have been read — the first-area call lands
  // long before the full one, and the client keeps checking while it says partial.
  const complete = merged.every((area) => area.source === 'ai');
  db.update('remediations', remediationId, {
    areas: merged,
    diagnosis_source: complete ? 'ai' : 'ai_partial',
  });
}

/**
 * Ask the deep model what went wrong and fold it into the row. Nobody waits on
 * this: the rule-based version is already on screen, and the client re-reads the
 * row once to pick this up.
 */
function upgradeDiagnosis(remediationId, { userId, kind, areas, accuracy, required, level }) {
  if (!areas.length) return;
  ai.diagnoseCheckpoint({
    kindLabel: curriculum.CHECKPOINT_LABEL[kind] || kind,
    level,
    accuracy,
    required,
    areas,
    userId,
  })
    .then((diagnosed) => { if (diagnosed) foldIn(remediationId, diagnosed); })
    .catch((err) => console.warn(`ai: checkpoint diagnosis failed: ${err.message}`));
}

function activeFor(userId, enrollmentId) {
  const rows = db.find('remediations', (r) => r.user_id === userId
    && r.enrollment_id === Number(enrollmentId) && !r.cleared_at);
  return rows.length ? rows[rows.length - 1] : null;
}

/** Called when the checkpoint is finally passed. */
function clearFor(userId, enrollmentId) {
  const at = new Date().toISOString();
  let cleared = 0;
  for (const row of db.find('remediations', (r) => r.user_id === userId
    && r.enrollment_id === Number(enrollmentId) && !r.cleared_at)) {
    db.update('remediations', row.id, { cleared_at: at });
    cleared++;
  }
  return cleared;
}

function areaAt(row, index) {
  return (row.areas || [])[Number(index)] || null;
}

/** Record how a round of drills on one area went, and whether it now holds. */
function recordDrill(remediationId, index, { correct, asked, sessionId }) {
  const row = db.byId('remediations', remediationId);
  if (!row) return null;
  const areas = row.areas.map((area, i) => {
    if (i !== Number(index)) return area;
    const accuracy = asked ? correct / asked : 0;
    return {
      ...area,
      drills: [...(area.drills || []), { correct, asked, accuracy, session_id: sessionId, at: new Date().toISOString() }],
      held: accuracy >= row.required,
    };
  });
  db.update('remediations', remediationId, { areas });
  return db.byId('remediations', remediationId);
}

/** Record a round of recall questions from the record's plan (round 3). */
function recordRecall(remediationId, { correct, asked, sessionId }) {
  const row = db.byId('remediations', remediationId);
  if (!row || !row.record) return row || null;
  const rounds = [...(row.record.rounds || []), { correct, asked, accuracy: asked ? correct / asked : 0, session_id: sessionId, at: new Date().toISOString() }];
  db.update('remediations', remediationId, { record: { ...row.record, rounds } });
  return db.byId('remediations', remediationId);
}

/** Save a teaching conversation so it is still there after a reload. */
function recordTalk(remediationId, index, messages) {
  const row = db.byId('remediations', remediationId);
  if (!row) return null;
  const areas = row.areas.map((area, i) => (i === Number(index)
    ? { ...area, messages: messages.slice(-24) }
    : area));
  db.update('remediations', remediationId, { areas });
  return db.byId('remediations', remediationId);
}

/** What the browser sees. The missed questions are the learner's own, so they
 *  are fine to send back; nothing here belongs to the upcoming retry. */
function sanitize(row) {
  if (!row) return null;
  return {
    id: row.id,
    kind: row.kind,
    level: row.level,
    accuracy: row.accuracy,
    required: row.required,
    attempt: row.attempt,
    diagnosis_source: row.diagnosis_source,
    // The record's plan after a missed Final (round 3), or null.
    record: row.record ? {
      reteach: row.record.reteach || [],
      retrieve: row.record.retrieve || [],
      reteach_total: row.record.reteach_total || 0,
      retrieve_total: row.record.retrieve_total || 0,
      rounds: (row.record.rounds || []).map((x) => ({ correct: x.correct, asked: x.asked, accuracy: x.accuracy, at: x.at })),
    } : null,
    areas: (row.areas || []).map((area, index) => ({
      index,
      skill_id: area.skill_id,
      skill_name: area.skill_name,
      accuracy: area.accuracy,
      asked: area.asked,
      correct: area.correct,
      headline: area.headline,
      diagnosis: area.diagnosis,
      misconception: area.misconception,
      teach: area.teach || null,
      opener: area.opener,
      held: !!area.held,
      drills: (area.drills || []).map((d) => ({ correct: d.correct, asked: d.asked, accuracy: d.accuracy })),
      messages: area.messages || [],
      missed: (area.missed || []).slice(0, 4).map((m) => ({
        prompt: m.prompt,
        answer: m.answer,
        user_answer: m.user_answer,
      })),
    })),
  };
}

module.exports = {
  DRILL_COUNT,
  startEarly,
  earlyFor,
  foldIn,
  areasFrom,
  open,
  activeFor,
  clearFor,
  areaAt,
  recordDrill,
  recordRecall,
  recordPlanOn,
  recordTalk,
  sanitize,
  fallbackTeaching,
};
