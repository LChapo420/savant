/**
 * Where the scorecard meets the learning loop.
 *
 * The rest of the app calls these at the moments evidence appears — an answer,
 * a level closing, a creator-made lesson page finished, a learner saying how a
 * level felt, a session ending — and never touches the scorecard's arithmetic
 * directly. Every hook swallows its own errors: the scorecard learning something
 * is never allowed to break the thing the learner is actually doing.
 *
 * One row per level lives in `level_signals`: how it was read, how it went, what
 * the learner said, which experiment (if any) it ran, and a plain-language
 * conclusion the next level's writer is told.
 */
const db = require('../../config/db');
const scorecard = require('./index');
const signals = require('./signals');
const irt = require('./irt');

function safely(label, fn) {
  try {
    return fn();
  } catch (err) {
    console.warn(`scorecard: ${label} failed: ${err.message}`);
    return null;
  }
}

/** One graded answer. */
function onAnswer(userId, item, { trackId } = {}) {
  return safely('answer', () => {
    // What the ability model expected of this answer (recorded by
    // mastery.recordAttempt just before), so signals read it against that.
    const ctx = irt.contextFor(userId, item);
    const obs = [...signals.fromAnswer(item, ctx), ...signals.delayedExperimentOutcome(userId, item, ctx)];
    if (obs.length) scorecard.observe(userId, obs, { source: `answer:${item.role || 'item'}`, trackId });
  });
}

function levelRow(userId, where) {
  return db.find('level_signals', (r) => r.user_id === userId && r.track_id === where.trackId
    && r.grade_id === where.gradeId && r.level === where.level && r.kind !== 'session')
    .slice(-1)[0] || null;
}

function upsertLevelRow(userId, where, patch) {
  const existing = levelRow(userId, where);
  if (existing) return db.update('level_signals', existing.id, patch);
  return db.insert('level_signals', {
    user_id: userId, track_id: where.trackId, grade_id: where.gradeId, level: where.level, ...patch,
  });
}

/**
 * Error tags this learner had already produced on each skill before this level,
 * so a repeat can be told apart from a first mistake.
 */
function errorTagsBefore(userId, firstItemId) {
  const tags = {};
  for (const item of db.find('items', (i) => i.user_id === userId && i.error_tag && i.id < firstItemId)) {
    (tags[item.skill_id] = tags[item.skill_id] || []).push(item.error_tag);
  }
  return tags;
}

/**
 * A plain-language line about how one level went, for the next level's writer.
 * Written from facts, not from a model, so it is always there.
 */
function conclusionFor({ kind, level, items }) {
  const answered = items.filter((i) => i.correct !== null && i.correct !== undefined);
  const right = answered.filter((i) => i.correct).length;
  const parts = [`Level ${level} (${String(kind).replace(/_/g, ' ')}): ${right}/${answered.length} right`];
  const coached = answered.filter((i) => i.coach_used).length;
  if (coached) parts.push(`${coached} with the coach`);
  const slow = answered.filter((i) => i.ms && i.ms > signals.expectedMs(i) * 2.5).length;
  if (slow >= 2) parts.push(`${slow} answers took much longer than expected`);
  const tags = [...new Set(answered.filter((i) => !i.correct && i.error_tag).map((i) => i.error_tag.replace(/_/g, ' ')))];
  if (tags.length) parts.push(`mistakes: ${tags.join(', ')}`);
  const missedSkills = [...new Set(answered.filter((i) => !i.correct).map((i) => i.skill_name || i.skill_id))];
  if (missedSkills.length && missedSkills.length <= 3) parts.push(`missed on ${missedSkills.join(', ')}`);
  return `${parts.join('; ')}.`;
}

/**
 * A creator-made lesson page was finished. Its evidence is only half known now —
 * how long it was read — and the other half arrives with the next practice level,
 * which is credited back to this row (see creditPendingLesson).
 */
function onBaseLessonFinished(userId, { trackId, gradeId, level, skillId, readMs, words, basis, experiment, arm, scrollBacks = null }) {
  return safely('lesson page', () => {
    const backs = cleanCount(scrollBacks);
    const obs = signals.fromBaseLesson({ readMs, words, nextAccuracy: null, scrollBacks: backs });
    if (obs.length) scorecard.observe(userId, obs, { source: 'lesson page', trackId });
    const minutes = ((Number(readMs) || 0) / 60000).toFixed(1);
    // A new record each time: reading a lesson page again is a second reading,
    // with its own time and its own next level, not an edit of the first.
    return db.insert('level_signals', {
      user_id: userId,
      track_id: trackId,
      grade_id: gradeId,
      level,
      kind: 'base_lesson',
      skill_id: skillId || null,
      basis: basis || 'base',
      arm: arm || null,
      experiment: experiment || null,
      read_ms: Math.max(0, Math.min(4 * 3600000, Number(readMs) || 0)),
      ...(backs === null ? {} : { scroll_backs: backs }),
      words: Number(words) || 0,
      pending: true,
      finished_at: new Date().toISOString(),
      conclusion: `Level ${level} (lesson page${basis === 'edited' ? ', written for them' : ''}): read in ${minutes} min.`,
    });
  });
}

/** A count from the page: a whole number 0-200, or null when it was not sent. */
function cleanCount(v) {
  if (v === null || v === undefined || v === '' || !Number.isFinite(Number(v))) return null;
  return Math.max(0, Math.min(200, Math.round(Number(v))));
}

/**
 * How a lesson level's lesson (an AI-written lesson in a session) was read:
 * the time it was open before the checks and how often the learner scrolled
 * back up over it. Saved on the level's row, where the level read
 * (onBlockResolved -> signals.fromLesson) finds it as telemetry.
 */
function onLessonRead(userId, { trackId, gradeId, level, readMs, scrollBacks }) {
  return safely('lesson read', () => {
    const backs = cleanCount(scrollBacks);
    const ms = Number(readMs);
    const patch = {};
    if (Number.isFinite(ms) && ms > 0) patch.read_ms = Math.min(4 * 3600000, Math.round(ms));
    if (backs !== null) patch.scroll_backs = backs;
    if (!Object.keys(patch).length) return null;
    return upsertLevelRow(userId, { trackId, gradeId, level }, patch);
  });
}

/**
 * The practice level after a lesson page is the test of that page. Credit its
 * accuracy back to the most recent lesson page on this course still waiting for
 * an outcome, if it is close behind.
 */
function creditPendingLesson(userId, { trackId, gradeId, level, accuracy, items = null, ctx = null }) {
  if (accuracy === null || accuracy === undefined) return;
  const pending = db.find('level_signals', (r) => r.user_id === userId && r.kind === 'base_lesson'
    && r.pending && r.track_id === trackId && r.grade_id === gradeId
    && r.level < level && level - r.level <= 5)
    .slice(-1)[0];
  if (!pending) return;
  const baseline = signals.lessonBaseline(userId);
  // The outcome of the page: the next level's main questions (not its
  // reviews or warm-up support) against what the ability model expected.
  let outcome = null;
  if (items && ctx && pending.experiment) {
    const answered = items.filter((i) => i.correct !== null && i.correct !== undefined);
    const main = answered.filter((i) => ['focus', 'stretch', 'check'].includes(i.role));
    outcome = signals.residuals(main.length ? main : answered, ctx);
  }
  const obs = signals.fromBaseLesson({
    readMs: 0, words: pending.words, nextAccuracy: accuracy, baseline, experiment: pending.experiment, outcome,
  });
  if (obs.length) scorecard.observe(userId, obs, { source: 'lesson page, judged by the next level', trackId });
  db.update('level_signals', pending.id, {
    pending: false,
    accuracy,
    conclusion: `${String(pending.conclusion || `Level ${pending.level} (lesson page).`).replace(/\.$/, '')}; `
      + `the level after it came out at ${Math.round(accuracy * 100)}%.`,
  });
}

/** A level closed: its block-level patterns, and for a lesson, how the lesson worked. */
function onBlockResolved(userId, { session, kind, level, items, trackId, experiment = null }) {
  return safely('block', () => {
    const graded = items.filter((i) => i.correct !== null && i.correct !== undefined);
    if (!graded.length) return null;
    const where = { trackId: session.track_id, gradeId: session.grade_id, level };
    const firstId = Math.min(...graded.map((i) => i.id));
    const ctx = irt.contextsFor(userId, graded);
    const obs = signals.fromBlock(graded, { priorErrorTags: errorTagsBefore(userId, firstId), ctx });
    const accuracy = signals.accuracy(graded);

    if (kind === 'block_lesson') {
      // A block lesson's own checks are the first outcome of the way it was
      // taught (the next practice level is the second, through its page row).
      if (experiment) obs.push(...signals.experimentOutcome(experiment, signals.residuals(graded, ctx), `block lesson taught ${experiment.arm === 'high' ? 'with' : 'without'} ${experiment.label}: its checks against expectation`));
    } else if (kind === 'lesson') {
      const lesson = db.findOne('lessons', (l) => l.user_id === userId && l.level === level
        && l.track_id === session.track_id && l.grade_id === session.grade_id);
      if (lesson) {
        obs.push(...signals.fromLesson(lesson, {
          telemetry: levelRow(userId, where) || {},
          checks: graded.filter((i) => i.role === 'check'),
          baseline: signals.lessonBaseline(userId),
          ctx,
        }));
      }
    } else {
      creditPendingLesson(userId, { ...where, accuracy, items: graded, ctx });
    }

    if (obs.length) scorecard.observe(userId, obs, { source: `level:${kind}`, trackId });
    return upsertLevelRow(userId, where, {
      kind,
      session_id: session.id,
      accuracy,
      items: graded.length,
      conclusion: conclusionFor({ kind, level, items: graded }),
    });
  });
}

/**
 * What the learner said about a level, from the feedback form: the quick taps
 * (pace, length, difficulty) and whatever they wrote.
 */
function onFeedback(userId, { trackId, gradeId, level, pace, length, difficulty, liked, disliked }) {
  return safely('feedback', () => {
    const said = {
      pace: ['slow', 'right', 'fast'].includes(pace) ? pace : null,
      length: ['short', 'right', 'long'].includes(length) ? length : null,
      difficulty: ['easy', 'right', 'hard'].includes(difficulty) ? difficulty : null,
    };
    // A difficulty tap means something only against how the level went.
    const row = said.difficulty ? levelRow(userId, { trackId, gradeId, level }) : null;
    const accuracy = row && typeof row.accuracy === 'number' ? row.accuracy : undefined;
    const obs = signals.fromFeedback({ ...said, liked, disliked, accuracy });
    if (obs.length) scorecard.observe(userId, obs, { source: 'learner feedback', trackId });
    if (said.pace || said.length || said.difficulty) {
      upsertLevelRow(userId, { trackId, gradeId, level }, { said, said_at: new Date().toISOString() });
    }
    return said;
  });
}

/**
 * A session ended: the patterns only visible across a whole sitting. What a
 * model reads out of each level is done per level, by the after-level read
 * (services/learner-record.js), under its one-point rule.
 */
function onSessionFinished(userId, session, items) {
  safely('session', () => {
    const obs = signals.fromSession(userId, session, items);
    if (obs.length) scorecard.observe(userId, obs, { source: 'session', trackId: session.track_id });
  });
}

/**
 * A sitting closed unfinished: routes/learn.js closes the open sitting when
 * the learner opens a different level instead of coming back to it. Its
 * patterns were never read (only a finished sitting goes through
 * onSessionFinished), and a level left partway in it is a quit — the evidence
 * persistence is about. Its end is its last answer, not the moment it was
 * closed, which can be days later. A preview (a look at another level) being
 * closed is not a quit and is not passed here; neither is a sitting closed
 * by a privileged skip or jump.
 */
function onSessionAbandoned(userId, session, items) {
  return safely('abandoned session', () => {
    if (!session || session.preview || session.kind === 'placement' || session.kind === 'skip') return null;
    const answered = (items || []).filter((i) => i.correct !== null && i.correct !== undefined && i.role !== 'retention');
    if (!answered.length) return null;
    const last = Math.max(...answered.map((i) => Date.parse(i.answered_at || i.updated_at || i.created_at || 0) || 0));
    const asLeft = { ...session, ended_at: new Date(last || Date.now()).toISOString() };
    const obs = signals.fromSession(userId, asLeft, items, { abandoned: true });
    if (obs.length) scorecard.observe(userId, obs, { source: 'sitting left unfinished', trackId: session.track_id });
    return obs;
  });
}

function onPlacement(userId, { trackId, placedLevel, pathLength }) {
  return safely('placement', () => scorecard.observe(userId, signals.fromPlacement(placedLevel, pathLength),
    { source: 'placement', trackId }));
}

/**
 * The most recent conclusions for one course, oldest first: what the next level's
 * writer is told about how the last few levels went.
 */
function conclusionsFor(userId, { trackId, gradeId, max = 6 } = {}) {
  return db.find('level_signals', (r) => r.user_id === userId && r.conclusion
    && (!trackId || r.track_id === trackId) && (!gradeId || r.grade_id === gradeId))
    .slice(-max)
    .map((r) => {
      const said = r.said || {};
      const bits = [];
      if (said.length && said.length !== 'right') bits.push(`said it was too ${said.length}`);
      if (said.pace && said.pace !== 'right') bits.push(`said the pace was too ${said.pace}`);
      if (said.difficulty && said.difficulty !== 'right') bits.push(`said it was too ${said.difficulty}`);
      return bits.length ? `${r.conclusion} Learner ${bits.join(', ')}.` : r.conclusion;
    });
}

module.exports = {
  onAnswer,
  onLessonRead,
  onBaseLessonFinished,
  onBlockResolved,
  onFeedback,
  onSessionFinished,
  onSessionAbandoned,
  onPlacement,
  conclusionsFor,
  conclusionFor,
  creditPendingLesson,
};
