/**
 * The placement quiz: start, answer, finish.
 *
 * Two things are deliberately different from a lesson. Nothing is graded back to
 * the learner mid-quiz — a diagnostic that tells you as you go changes how you
 * answer — and mastery is written once at the end, from the whole pattern of
 * responses rather than item by item.
 */
const express = require('express');
const db = require('../config/db');
const curriculum = require('../config/curriculum');
const placement = require('../services/placement');
const unitPlacement = require('../services/unit-placement');
const learnerPath = require('../services/learner-path');
const sessions = require('../services/sessions');
const lessons = require('../services/lessons');
const scorecardHooks = require('../services/scorecard/hooks');
const levelEditor = require('../services/level-editor');
const grading = require('../services/grading');
const goals = require('../services/goals');
const { requireAuth, requireSkip } = require('../middleware/auth');
const { limit } = require('../utils/rate-limit');
// The write-ahead (WRITE_AHEAD): the first levels after a placement, written before they are opened.
const writeAhead = require('../services/write-ahead');

const router = express.Router();

function ownedEnrollment(req) {
  const enrollment = db.byId('enrollments', req.body.enrollment_id || req.params.enrollmentId);
  if (!enrollment || enrollment.user_id !== req.user.id) return null;
  return enrollment;
}

/**
 * Has this enrollment been placed already? Any enrollment past
 * `placement_pending` (placed by its own placement, or by the gap scan as a
 * catch-up grade), or one with a finished placement on record.
 */
function isPlaced(enrollment) {
  if (enrollment.status && enrollment.status !== 'placement_pending') return true;
  return !!db.findOne('sessions', (s) => s.enrollment_id === enrollment.id && s.kind === 'placement' && s.ended_at && !s.cancelled);
}

/**
 * What a finished retake does besides writing the new placement: the lesson
 * sittings left open on the enrollment are closed as moved past, not quit —
 * the learner asked to be placed again, which is not giving up on a level, so
 * the scorecard is not told (scorecardHooks.onSessionAbandoned is not called) —
 * and the retake is kept in the enrollment's placement history.
 */
function afterRetake(session, enrollment, placedUnit, placedLevel) {
  if (!session.retake) return {};
  const now = new Date().toISOString();
  for (const sitting of db.find('sessions', (s) => s.enrollment_id === enrollment.id && !s.ended_at && s.kind !== 'placement')) {
    db.update('sessions', sitting.id, { ended_at: now, abandoned: true, closed_by: 'placement_retake' });
  }
  const history = Array.isArray(enrollment.placement_history) ? enrollment.placement_history.slice(-19) : [];
  history.push({ session_id: session.id, retake_of: session.retake_of || null, placed_unit: placedUnit || null, placed_level: placedLevel || null, at: now });
  return { placement_history: history, placement_retakes: (Number(enrollment.placement_retakes) || 0) + 1 };
}

/**
 * Skip this grade's placement quiz (the owner's account only: requireSkip, 403
 * for everyone else): stand on level 1, or on `level`, as placed. An open
 * placement sitting is cancelled (services/owner-skips.js).
 */
router.post('/skip', requireAuth, requireSkip, limit('placement-skip', 200, 60 * 60 * 1000), (req, res) => {
  const enrollment = ownedEnrollment(req);
  if (!enrollment) return res.status(404).json({ error: 'Enrollment not found.' });
  // eslint-disable-next-line global-require
  const out = require('../services/owner-skips').skipPlacement({ userId: req.user.id, enrollment, level: req.body.level || 1 });
  if (out.error) return res.status(out.status || 400).json({ error: out.error });
  writeAhead.trigger({ user: req.user, enrollment: out.enrollment, reason: 'placement skip' });
  res.json({ ok: true, enrollment_id: out.enrollment.id, level: out.level });
});

router.post('/start', requireAuth, limit('placement-start', 30, 60 * 60 * 1000), (req, res) => {
  const enrollment = ownedEnrollment(req);
  if (!enrollment) return res.status(404).json({ error: 'Enrollment not found.' });
  const grade = curriculum.getGrade(enrollment.track_id, enrollment.grade_id);
  if (!grade) return res.status(400).json({ error: 'That subject is no longer available.' });

  // An unfinished placement is resumed rather than restarted, so a closed tab
  // does not cost the learner their progress through a 50-question quiz.
  const open = db.findOne('sessions', (s) => s.user_id === req.user.id
    && s.enrollment_id === enrollment.id && s.kind === 'placement' && !s.ended_at);
  if (open) {
    const items = sessions.itemsFor(open.id);
    return res.json({
      session_id: open.id,
      resumed: true,
      retake: !!open.retake,
      adaptive: !!open.unit_mode,
      mode: open.unit_mode || null,
      deadline_at: open.deadline_at || null,
      total: open.unit_mode ? unitPlacement.MODES[open.unit_mode].max : items.length,
      items: items.map((it, i) => ({ ...sessions.sanitize(it, i), answered: it.correct !== null })),
    });
  }

  // A grade already placed is placed again only when the learner asks for it
  // (`retake: true`, from the same places the first placement is offered). The
  // placement page used to start a fresh placement whenever it was opened, so a
  // reload of the result screen or the back button from the path quietly began
  // the whole quiz again; now that is refused and the page is told why.
  const retake = req.body.retake === true || req.body.retake === 'true';
  const placed = isPlaced(enrollment);
  if (placed && !retake) {
    return res.status(409).json({
      error: 'This grade is already placed. To take its placement again, start a retake: units you have finished stay finished.',
      placed: true,
      retake_available: true,
      enrollment_id: enrollment.id,
    });
  }

  // A grade with a unit bank is placed to within one unit, adaptively: one
  // question at a time, each picked from the answers so far. The mode is the
  // one the learner chose (or chose for the subject's placement), Balanced if
  // none.
  const unitBank = unitPlacement.available(enrollment.track_id, enrollment.grade_id);
  const subjectWalk = db.findOne('subject_placements', (p) => p.user_id === req.user.id && p.track_id === enrollment.track_id);
  const mode = unitPlacement.MODES[req.body.mode] ? req.body.mode
    : unitPlacement.MODES[subjectWalk && subjectWalk.mode] ? subjectWalk.mode
      // No mode chosen anywhere: the learner's goal for this grade picks the length
      // (services/goals.js; null for the owner and for a learner with no goal).
      : unitPlacement.MODES[goals.placementMode(req.user.id, enrollment.track_id, enrollment.grade_id)]
        ? goals.placementMode(req.user.id, enrollment.track_id, enrollment.grade_id) : 'balanced';

  const session = db.insert('sessions', {
    user_id: req.user.id,
    enrollment_id: enrollment.id,
    track_id: enrollment.track_id,
    grade_id: enrollment.grade_id,
    level: 0,
    kind: 'placement',
    started_at: new Date().toISOString(),
    ended_at: null,
    score: null,
    analysis: null,
    xp_awarded: 0,
    unit_mode: unitBank ? mode : null,
    deadline_at: unitBank ? new Date(Date.now() + unitPlacement.MODES[mode].minutes * 60 * 1000).toISOString() : null,
    retake: placed,
    retake_of: placed ? enrollment.placement_session_id || null : null,
  });

  if (unitBank) {
    const first = unitPlacement.nextQuestion(enrollment.track_id, enrollment.grade_id, mode, []);
    const row = db.insert('items', {
      ...unitPlacement.itemFor(enrollment.track_id, enrollment.grade_id, first.unit, first.slot),
      session_id: session.id,
      user_id: req.user.id,
      role: 'placement',
      index: 0,
      user_answer: null,
      correct: null,
      ms: null,
    });
    return res.status(201).json({
      session_id: session.id,
      resumed: false,
      retake: placed,
      adaptive: true,
      mode,
      deadline_at: session.deadline_at,
      total: unitPlacement.MODES[mode].max,
      items: [sessions.sanitize(row, 0)],
    });
  }

  const generated = placement.buildItems(grade, goals.placementLength(req.user.id, enrollment.track_id, enrollment.grade_id));
  const rows = generated.map((item, index) => db.insert('items', {
    ...item,
    session_id: session.id,
    user_id: req.user.id,
    role: 'placement',
    index,
    user_answer: null,
    correct: null,
    ms: null,
  }));

  res.status(201).json({
    session_id: session.id,
    resumed: false,
    retake: placed,
    total: rows.length,
    items: rows.map((it, i) => sessions.sanitize(it, i)),
  });
});

/** Record an answer without revealing whether it was right. */
router.post('/answer', requireAuth, (req, res) => {
  const session = db.byId('sessions', req.body.session_id);
  if (!session || session.user_id !== req.user.id || session.kind !== 'placement') {
    return res.status(404).json({ error: 'Quiz not found.' });
  }
  if (session.ended_at) return res.status(409).json({ error: 'This quiz is already finished.' });

  const item = db.byId('items', req.body.item_id);
  if (!item || item.session_id !== session.id) return res.status(404).json({ error: 'Question not found.' });

  const verdict = grading.grade(item, req.body.answer);
  db.update('items', item.id, {
    user_answer: String(req.body.answer == null ? '' : req.body.answer),
    correct: verdict.correct,
    ms: Number(req.body.ms || 0),
  });

  const all = sessions.itemsFor(session.id);
  const answered = all.filter((i) => i.correct !== null);
  if (!session.unit_mode) return res.json({ recorded: true, answered: answered.length });

  // Adaptive: the next question is picked from everything answered so far, or
  // the walk is done (sure enough, at the cap, or out of time).
  const next = all.length > answered.length ? null : unitPlacement.nextQuestion(
    session.track_id,
    session.grade_id,
    session.unit_mode,
    answered.map((i) => ({ unit: i.unit, slot: i.slot, correct: !!i.correct })),
    { deadline: session.deadline_at },
  );
  if (!next) return res.json({ recorded: true, answered: answered.length, done: all.length === answered.length });
  const row = db.insert('items', {
    ...unitPlacement.itemFor(session.track_id, session.grade_id, next.unit, next.slot),
    session_id: session.id,
    user_id: req.user.id,
    role: 'placement',
    index: all.length,
    user_answer: null,
    correct: null,
    ms: null,
  });
  res.json({ recorded: true, answered: answered.length, done: false, next_item: sessions.sanitize(row, all.length) });
});

/**
 * Finish: score the quiz, seed the learner's skill state, and place the
 * enrollment at the level the answers support.
 */
router.post('/finish', requireAuth, (req, res) => {
  const session = db.byId('sessions', req.body.session_id);
  if (!session || session.user_id !== req.user.id || session.kind !== 'placement') {
    return res.status(404).json({ error: 'Quiz not found.' });
  }
  const enrollment = db.byId('enrollments', session.enrollment_id);
  const grade = enrollment && curriculum.getGrade(enrollment.track_id, enrollment.grade_id);
  if (!enrollment || !grade) return res.status(400).json({ error: 'That subject is no longer available.' });

  if (session.cancelled) return res.status(409).json({ error: 'This retake was cancelled; your placement is unchanged.', cancelled: true });
  const items = sessions.itemsFor(session.id).filter((i) => i.correct !== null);
  if (!items.length) return res.status(400).json({ error: 'Answer at least one question first.' });

  if (session.ended_at) {
    return res.json({ result: session.analysis, already: true });
  }

  if (session.unit_mode) return finishByUnit(req, res, { session, enrollment, grade, items });

  const result = placement.score(items, grade);
  placement.seedSkillStates(req.user.id, result);

  const named = {
    ...result,
    skills: result.skills.map((s) => ({ ...s, name: curriculum.skillName(s.skill_id) })),
    gaps: result.gaps.map((id) => ({ id, name: curriculum.skillName(id) })),
    strengths: result.strengths.map((id) => ({ id, name: curriculum.skillName(id) })),
    track_name: curriculum.getTrack(enrollment.track_id).name,
    grade_name: grade.name,
    path_length: grade.pathLength,
  };

  db.update('sessions', session.id, {
    ended_at: new Date().toISOString(),
    score: result.overall,
    analysis: named,
  });
  db.update('enrollments', enrollment.id, {
    status: 'active',
    current_level: result.placedLevel,
    level_items: 0,
    placed_at: new Date().toISOString(),
    placement_session_id: session.id,
    ...afterRetake(session, enrollment, null, result.placedLevel),
  });
  if (session.retake) named.retake = true;

  // Placement lands on a lesson level, so write that lesson now while the
  // learner reads their result — it is the only cover there is for the first
  // one, since nothing earlier could have prefetched it.
  // What the learner already knows about this subject is the scorecard's
  // per-subject prior knowledge, measured rather than asked.
  scorecardHooks.onPlacement(req.user.id, {
    trackId: enrollment.track_id, placedLevel: result.placedLevel, pathLength: grade.pathLength,
  });

  lessons.prefetch({ userId: req.user.id, enrollment: db.byId('enrollments', enrollment.id), grade, level: result.placedLevel });
  // A new enrollment's first level, and the ones after it (write-ahead).
  writeAhead.trigger({ user: req.user, enrollment: db.byId('enrollments', enrollment.id), grade, reason: 'placed' });

  // And the same for their own version of it, for an account whose levels are
  // written for them. Also for the level after it, because the placed level is
  // about to be read and the one they move to has only that reading time to be
  // ready. Nothing waits on either.
  levelEditor.ensure({
    userId: req.user.id,
    enrollment: db.byId('enrollments', enrollment.id),
    grade,
    level: result.placedLevel,
  }).catch(() => {});
  levelEditor.prefetchNext(req.user.id, db.byId('enrollments', enrollment.id), result.placedLevel);

  res.json({ result: named });
});

/** Everything that follows placing a learner at a level: the lesson written ahead, and their own version. */
function afterPlacing(req, enrollment, grade, level) {
  scorecardHooks.onPlacement(req.user.id, {
    trackId: enrollment.track_id, placedLevel: level, pathLength: grade.pathLength,
  });
  const fresh = db.byId('enrollments', enrollment.id);
  lessons.prefetch({ userId: req.user.id, enrollment: fresh, grade, level });
  writeAhead.trigger({ user: req.user, enrollment: fresh, grade, reason: 'placed' });
  levelEditor.ensure({ userId: req.user.id, enrollment: fresh, grade, level }).catch(() => {});
  levelEditor.prefetchNext(req.user.id, fresh, level);
}

/**
 * Finish a placement by unit: write the unit plan the gap-only path walks
 * (services/learner-path.js), keep a quick check for each unit it passed
 * without proving, and stand the learner on the earliest unit still to learn
 * or not checked yet. A grade's enrollment without a plan (none written before
 * plans existed) keeps the old start at the placed unit's first lesson.
 */
function finishByUnit(req, res, { session, enrollment, grade, items }) {
  const answered = items.map((i) => ({ unit: i.unit, slot: i.slot, correct: !!i.correct }));
  const result = unitPlacement.score(enrollment.track_id, enrollment.grade_id, answered);
  const named = {
    ...result,
    adaptive: true,
    mode: session.unit_mode,
    overall: result.asked ? result.correct / result.asked : 0,
    track_name: curriculum.getTrack(enrollment.track_id).name,
    grade_name: grade.name,
    path_length: grade.pathLength,
  };
  if (session.retake) named.retake = true;
  db.update('sessions', session.id, { ended_at: new Date().toISOString(), score: named.overall, analysis: named });
  db.update('enrollments', enrollment.id, {
    status: 'active',
    current_level: result.placedLevel,
    level_items: 0,
    placed_at: new Date().toISOString(),
    placement_session_id: session.id,
    placed_unit: result.unit,
    quick_checks: result.checks,
    ...afterRetake(session, enrollment, result.unit, result.placedLevel),
  });
  let start = result.placedLevel;
  const plan = learnerPath.initFromPlacement(db.byId('enrollments', enrollment.id), result, answered);
  if (plan) {
    // The quick check asks the units the placement passed but did not prove, on
    // whatever time the mode's budget has left. Until a unit is proved it is
    // worked, so the learner stands on the earliest one that is not.
    const fresh = db.byId('enrollments', enrollment.id);
    const checks = learnerPath.quickChecks(fresh);
    start = learnerPath.firstLevel(fresh, grade);
    db.update('enrollments', enrollment.id, {
      quick_checks: checks,
      quick_check_deadline_at: learnerPath.checkDeadline(fresh, db.byId('sessions', session.id)),
      current_level: start,
    });
    named.checks = checks;
    named.start_level = start;
    named.unchecked = learnerPath.unitRows(fresh).filter((u) => u.status === 'unchecked').map((u) => u.unit);
    named.to_learn = learnerPath.unitRows(fresh).filter((u) => u.status === 'learn').map((u) => u.unit);
    // On a retake, the units already worked that stayed done (never un-finished).
    named.kept_done = learnerPath.unitRows(fresh).filter((u) => u.status === 'done').map((u) => u.unit);
    db.update('sessions', session.id, { analysis: named });
  }
  afterPlacing(req, enrollment, grade, start);
  res.json({ result: named });
}

/**
 * The quick check of the units a placement passed. On an enrollment with a unit
 * plan: questions from each unit not yet proved, one unit at a time, asked
 * until its answers decide it (learnerPath.unitBelief) or its fresh questions
 * or the mode's time run out. Proved, and the path skips it; a hole, and it is
 * put on the path to learn; undecided, and it stays `unchecked` — worked, never
 * skipped. The learner is stood on the earliest unit still to work after each
 * answer, so nothing is restarted. Nothing is said about right or wrong until
 * the end, the same as the placement itself.
 *
 * An enrollment without a plan keeps the old check: one question, a second
 * after a miss, and two misses move the start back to the unit.
 */
function ownedById(req, id) {
  const enrollment = db.byId('enrollments', Number(id));
  return enrollment && enrollment.user_id === req.user.id ? enrollment : null;
}

/**
 * The question the quick check is asking, or null when nothing is left to ask.
 * The clock only holds back a question not yet shown: `{ clock: false }` is the
 * question already on the learner's screen, whose answer is taken even if the
 * time ran out while they were reading it.
 */
function checkQuestion(enrollment, { clock = true } = {}) {
  const planned = !!learnerPath.planFor(enrollment);
  if (clock && planned && !learnerPath.checkTimeLeft(enrollment.quick_check_deadline_at)) return null;
  const next = unitPlacement.nextCheck(enrollment.quick_checks);
  if (!next) return null;
  const item = unitPlacement.itemFor(enrollment.track_id, enrollment.grade_id, next.unit, next.slot);
  return { unit: next.unit, slot: next.slot, format: item.format, prompt: item.prompt, choices: item.choices };
}

function checkSummary(enrollment) {
  const checks = enrollment.quick_checks || [];
  const planned = !!learnerPath.planFor(enrollment);
  const timeLeft = !planned || learnerPath.checkTimeLeft(enrollment.quick_check_deadline_at);
  const deadline = planned && enrollment.quick_check_deadline_at ? Date.parse(enrollment.quick_check_deadline_at) : null;
  return {
    total: checks.length,
    passed: checks.filter((c) => c.status === 'passed').length,
    reopened: checks.filter((c) => c.status === 'reopened').map((c) => c.unit),
    pending: timeLeft ? checks.filter((c) => c.status === 'pending' && c.slots.length).length : 0,
    // Units the check could not settle — out of questions or out of time. They
    // stay on the path, as "not checked yet", with a test-out on offer.
    unchecked: checks.filter((c) => c.status === 'unchecked' || (c.status === 'pending' && (!timeLeft || !c.slots.length))).map((c) => c.unit),
    seconds_left: deadline ? Math.max(0, Math.round((deadline - Date.now()) / 1000)) : null,
    current_level: enrollment.current_level,
  };
}

/**
 * The check rows after an answer, read back from the plan: a unit proved is
 * passed, a unit found to be a hole is reopened, and one still undecided keeps
 * its fresh questions — or is left unchecked when none are left.
 */
function refreshChecks(enrollment, rows, answeredUnit, correct) {
  const plan = learnerPath.planFor(enrollment);
  const units = unitPlacement.unitsFor(enrollment.track_id, enrollment.grade_id) || [];
  const asked = learnerPath.askedSlots(enrollment);
  return (rows || []).map((c) => {
    if (c.status !== 'pending') return c;
    const entry = plan.units[(units[c.unit - 1] || {}).key] || {};
    const misses = (c.misses || 0) + (c.unit === answeredUnit && !correct ? 1 : 0);
    if (entry.status === 'known') return { ...c, status: 'passed', misses, slots: [] };
    if (entry.status === 'learn') return { ...c, status: 'reopened', misses, slots: [] };
    const slots = c.slots.filter((s) => !(asked[c.unit] || new Set()).has(s));
    return { ...c, misses, slots, status: slots.length ? 'pending' : 'unchecked' };
  });
}

router.get('/quick-check/:enrollmentId', requireAuth, (req, res) => {
  const enrollment = ownedById(req, req.params.enrollmentId);
  if (!enrollment) return res.status(404).json({ error: 'Enrollment not found.' });
  res.json(checkState(enrollment));
});

router.post('/quick-check', requireAuth, limit('placement-quick-check', 300, 60 * 60 * 1000), (req, res) => {
  const enrollment = ownedById(req, req.body.enrollment_id);
  if (!enrollment) return res.status(404).json({ error: 'Enrollment not found.' });
  const asked = checkQuestion(enrollment) || shownQuestion(enrollment);
  if (!asked || asked.unit !== Number(req.body.unit) || asked.slot !== Number(req.body.slot)) {
    return res.status(409).json({ error: 'That is not the question being checked.', ...checkState(enrollment) });
  }
  const item = unitPlacement.itemFor(enrollment.track_id, enrollment.grade_id, asked.unit, asked.slot);
  const correct = !!grading.grade(item, req.body.answer).correct;
  if (!learnerPath.planFor(enrollment)) {
    // An enrollment placed before unit plans existed keeps the old rule. Only ever
    // back: a learner who has already moved past a reopened unit's start is moved
    // back to it, and one who is behind it stays where they are.
    const marked = unitPlacement.markCheck(enrollment.track_id, enrollment.grade_id, enrollment.quick_checks, asked.unit, correct);
    const patch = { quick_checks: marked.checks };
    if (marked.reopenLevel && marked.reopenLevel < enrollment.current_level) patch.current_level = marked.reopenLevel;
    const updated = db.update('enrollments', enrollment.id, patch);
    return res.json(checkState(updated));
  }
  learnerPath.recordCheck(enrollment, asked.unit, correct, { slot: asked.slot, source: 'quick_check' });
  const updated = db.update('enrollments', enrollment.id, {
    quick_checks: refreshChecks(db.byId('enrollments', enrollment.id), enrollment.quick_checks, asked.unit, correct),
  });
  standOn(updated, learnerPath.firstLevel(updated, curriculum.getGrade(updated.track_id, updated.grade_id)));
  res.json(checkState(db.byId('enrollments', enrollment.id)));
});

/** What the quick check answers with: the next question, or `done` when nothing is left to ask. */
function checkState(enrollment) {
  const question = checkQuestion(enrollment);
  // Remembered so its answer is taken even if the clock runs out while it is on screen.
  if (question) db.update('enrollments', enrollment.id, { quick_check_shown: { unit: question.unit, slot: question.slot } });
  return { question, done: !question, summary: checkSummary(enrollment) };
}

/**
 * The question last shown, when the clock has run out since: it is still the
 * one being asked, and its answer is taken. Any other question waits.
 */
function shownQuestion(enrollment) {
  const open = checkQuestion(enrollment, { clock: false });
  const shown = enrollment.quick_check_shown;
  return open && shown && shown.unit === open.unit && shown.slot === open.slot ? open : null;
}

/** Move the learner to a level, clearing the work counted at the old one. */
function standOn(enrollment, level) {
  if (!level || level === enrollment.current_level) return;
  db.update('enrollments', enrollment.id, { current_level: level, level_items: 0, checkpoint_retry_at: null });
}

// ── The test-out ───────────────────────────────────────────────────────────
/**
 * The test-out: fresh questions from a unit until its answers prove it
 * (learnerPath.unitBelief), and the path skips it too. Open on any unit not
 * checked yet, at any time — from the placement result or from the path, with
 * no clock — and on a later unit the placement saw answered right. Answers that
 * show a hole put the unit on the path to learn. Optional, and nothing is said
 * about right or wrong until the end.
 *
 * `unit` (query on GET, `only_unit` with `unit` on POST) keeps the test-out to
 * one unit, for a test-out started from that unit on the path.
 */
function testOutQuestion(enrollment, onlyUnit = null) {
  const next = learnerPath.nextTestOut(enrollment, onlyUnit);
  if (!next) return null;
  const item = unitPlacement.itemFor(enrollment.track_id, enrollment.grade_id, next.unit, next.slot);
  return { unit: next.unit, slot: next.slot, title: next.title, format: item.format, prompt: item.prompt, choices: item.choices };
}

function testOutState(enrollment, onlyUnit = null) {
  const rows = learnerPath.unitRows(enrollment);
  const candidates = learnerPath.testOutCandidates(enrollment).filter((c) => !onlyUnit || c.unit === Number(onlyUnit));
  const question = testOutQuestion(enrollment, onlyUnit);
  return {
    question,
    done: !question,
    candidates: candidates.map((c) => ({ unit: c.unit, key: c.key, title: c.title, status: c.status })),
    summary: {
      passed: rows.filter((r) => r.test_out === 'passed').map((r) => r.unit),
      failed: rows.filter((r) => r.test_out === 'failed').map((r) => r.unit),
      to_learn: rows.filter((r) => r.test_out === 'failed' && r.status === 'learn').map((r) => r.unit),
      pending: candidates.length,
      current_level: enrollment.current_level,
    },
  };
}

/** A positive unit number from a query or body value, or null. */
function unitParam(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

router.get('/test-out/:enrollmentId', requireAuth, (req, res) => {
  const enrollment = ownedById(req, req.params.enrollmentId);
  if (!enrollment) return res.status(404).json({ error: 'Enrollment not found.' });
  res.json(testOutState(enrollment, unitParam(req.query.unit)));
});

router.post('/test-out', requireAuth, limit('placement-test-out', 300, 60 * 60 * 1000), (req, res) => {
  const enrollment = ownedById(req, req.body.enrollment_id);
  if (!enrollment) return res.status(404).json({ error: 'Enrollment not found.' });
  const unit = unitParam(req.body.unit);
  const onlyUnit = req.body.only_unit ? unit : null;
  // Any unit open to a test-out may be answered; the slot has to be the one
  // that unit is asking.
  const asked = unit ? testOutQuestion(enrollment, unit) : null;
  if (!asked || asked.slot !== Number(req.body.slot)) {
    return res.status(409).json({ error: 'That is not the question being asked.', ...testOutState(enrollment, onlyUnit) });
  }
  const item = unitPlacement.itemFor(enrollment.track_id, enrollment.grade_id, asked.unit, asked.slot);
  const verdict = grading.grade(item, req.body.answer);
  const outcome = learnerPath.recordCheck(enrollment, asked.unit, !!verdict.correct, { slot: asked.slot, source: 'test_out' });
  // A unit the learner is standing in, now proved, is stepped over at once.
  const updated = db.byId('enrollments', enrollment.id);
  if (outcome.changed) {
    const here = learnerPath.unitAt(updated, updated.current_level);
    if (here && here.status === 'known') {
      standOn(updated, learnerPath.firstLevel(updated, curriculum.getGrade(updated.track_id, updated.grade_id)));
    }
  }
  res.json(testOutState(db.byId('enrollments', enrollment.id), onlyUnit));
});

/**
 * Leave a retake without finishing it: `{enrollment_id}`. The open retake is
 * closed as cancelled and nothing about the placement or the path changes —
 * the plan, the level and the units done stay as they were. Not a quit. Only a
 * retake can be cancelled: a first placement left open is simply resumed.
 */
router.post('/retake/cancel', requireAuth, (req, res) => {
  const enrollment = ownedEnrollment(req);
  if (!enrollment) return res.status(404).json({ error: 'Enrollment not found.' });
  const open = db.findOne('sessions', (s) => s.user_id === req.user.id
    && s.enrollment_id === enrollment.id && s.kind === 'placement' && !s.ended_at);
  if (!open || !open.retake) return res.status(409).json({ error: 'No retake is open for this grade.' });
  db.update('sessions', open.id, { ended_at: new Date().toISOString(), cancelled: true });
  res.json({ cancelled: true, enrollment_id: enrollment.id, current_level: enrollment.current_level });
});

/** The learner's unit plan in counts and titles: what the path skips, and what is left to learn. */
router.get('/path/:enrollmentId', requireAuth, (req, res) => {
  const enrollment = ownedById(req, req.params.enrollmentId);
  if (!enrollment) return res.status(404).json({ error: 'Enrollment not found.' });
  res.json(pathReply(req.user.id, enrollment));
});

/**
 * Every enrollment's plan in one reply, `{ [enrollmentId]: <the /path/:id reply> }`
 * (learner follow-ups 2026-10-24): the dashboard asked /path/:id once per
 * enrollment. `?ids=1,2` limits it to those of the learner's own enrollments.
 * One enrollment that cannot be read is left out; the page draws it without.
 */
router.get('/paths', requireAuth, (req, res) => {
  const want = req.query.ids ? new Set(String(req.query.ids).split(',').map(Number).filter(Boolean)) : null;
  const out = {};
  for (const e of db.find('enrollments', (x) => x.user_id === req.user.id && (!want || want.has(x.id)))) {
    try { out[e.id] = pathReply(req.user.id, e); } catch (err) { console.warn('[placement] plan not read for', e.id, err && err.message); }
  }
  res.json(out);
});

/** One enrollment's plan reply, shared by /path/:id and /paths. */
function pathReply(userId, enrollment) {
  attachCatchUp(userId, enrollment);
  const fresh = db.byId('enrollments', enrollment.id);
  return {
    summary: learnerPath.summary(fresh),
    // The catch-up as one ordered plan ("Catch up: 3 units of Grade 2, ... then
    // start Grade 4"), and whether this grade's placement can be retaken.
    catch_up_route: catchUpRoute(userId, fresh),
    placement: { placed: isPlaced(fresh), retake_available: isPlaced(fresh) && !!curriculum.getGrade(fresh.track_id, fresh.grade_id), retakes: Number(fresh.placement_retakes) || 0 },
  };
}

/** The ordered catch-up for an enrollment (services/gap-scan.js routeForEnrollment), or null; guarded like attachCatchUp. */
function catchUpRoute(userId, enrollment) {
  try {
    // eslint-disable-next-line global-require
    const gapScan = require('../services/gap-scan');
    return typeof gapScan.routeForEnrollment === 'function' ? gapScan.routeForEnrollment(userId, enrollment) : null;
  } catch (err) {
    if (!err || err.code !== 'MODULE_NOT_FOUND') console.warn('[placement] catch-up route not read:', err && err.message);
    return null;
  }
}

/**
 * Put any catch-up offer the gap scan found for this track onto the enrollment
 * before its plan is read. The scan can finish before the learner has an
 * enrollment for the grade it recommends (they enrol through onboarding after
 * it), and this is the first place that enrollment is looked at. The gap scan
 * makes it safe to call any number of times. Nothing here depends on it: if the
 * gap scan is missing or throws, the plan is answered as it stands.
 */
function attachCatchUp(userId, enrollment) {
  try {
    // eslint-disable-next-line global-require
    const gapScan = require('../services/gap-scan');
    if (typeof gapScan.attachOffers === 'function') gapScan.attachOffers(userId, enrollment);
  } catch (err) {
    if (!err || err.code !== 'MODULE_NOT_FOUND') console.warn('[placement] catch-up offers not attached:', err && err.message);
  }
}

module.exports = router;
