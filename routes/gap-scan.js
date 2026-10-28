/**
 * The earlier-grade gap scan and its catch-up offer (services/gap-scan.js).
 *
 * Like the placements, nothing is graded back while the scan runs: a scan that
 * says "wrong" after every miss stops measuring and starts teaching. What the
 * learner hears at the end is which units of which earlier grade are worth
 * catching up on, and they decide whether to.
 */
const express = require('express');
const db = require('../config/db');
const curriculum = require('../config/curriculum');
const subjectPlacement = require('../services/subject-placement');
const gapScan = require('../services/gap-scan');
const { requireAuth } = require('../middleware/auth');
const { limit } = require('../utils/rate-limit');

const router = express.Router();

function trackOf(value) {
  const trackId = String(value || '');
  return curriculum.getTrack(trackId) ? trackId : null;
}

/** Is this the keep-checking walk rather than the scan? */
function isExtended(body) {
  return body.extended === true || body.extended === 'true';
}

function flag(value) {
  return value === true || value === 'true';
}

function fail(res, outcome) {
  return res.status(outcome.status || 400).json({ error: outcome.error });
}

/**
 * Begin the scan after the subject placement: `{track_id, mode,
 * recommended_grade_id, subject_session_id?, enrollment_id?}`. The reply is
 * the first question and the clock, or `done` with the gaps when there is
 * nothing to ask (no grade below, nothing worth checking, or no time left).
 * `enrollment_id` is optional: when the in-grade placement has already run,
 * its real time is what the clock counts instead of its whole budget.
 *
 * `{track_id, extended: true, grade_id}` instead starts "keep checking
 * <grade>" once the scan is done: the same questions, outside the placement
 * budget, with no clock (`clock.deadline_at` is null) and a question cap.
 *
 * `{track_id, catch_up: true, recommended_grade_id, mode?}` starts the
 * catch-up quiz instead: every grade below, on its own clock (Quick about 10
 * minutes, Balanced 20, Accurate 40), outside the placement budget. It is
 * answered through `/answer` like the scan; its reply carries `kind:
 * 'catch_up'`, and once done, `route` (the ordered catch-up plan).
 */
router.post('/start', requireAuth, limit('gap-scan-start', 30, 60 * 60 * 1000), (req, res) => {
  const trackId = trackOf(req.body.track_id);
  if (!trackId) return res.status(404).json({ error: 'No such subject.' });
  if (isExtended(req.body)) {
    const ext = gapScan.startExtended(req.user.id, { trackId, gradeId: String(req.body.grade_id || '') });
    if (ext.error) return fail(res, ext);
    return res.json({ track_id: trackId, resumed: ext.resumed, ...gapScan.view(trackId, ext.walk, Date.now(), ext.scan) });
  }
  if (flag(req.body.catch_up)) {
    const quiz = gapScan.startCatchUp(req.user.id, {
      trackId,
      mode: req.body.mode ? String(req.body.mode) : null,
      gradeId: String(req.body.recommended_grade_id || req.body.grade_id || ''),
      subjectId: req.body.subject_session_id || null,
    });
    if (quiz.error) return fail(res, quiz);
    const body = { track_id: trackId, resumed: quiz.resumed, ...gapScan.view(trackId, quiz.scan, Date.now()) };
    if (body.done) body.route = gapScan.routeFor(req.user.id, trackId);
    return res.json(body);
  }
  const outcome = gapScan.start(req.user.id, {
    trackId,
    mode: req.body.mode ? String(req.body.mode) : null,
    gradeId: String(req.body.recommended_grade_id || ''),
    subjectId: req.body.subject_session_id || null,
    enrollmentId: req.body.enrollment_id || null,
  });
  if (outcome.error) return fail(res, outcome);
  res.json({ track_id: trackId, resumed: outcome.resumed, ...gapScan.view(trackId, outcome.scan, Date.now()) });
});

/**
 * One answer: `{track_id, grade_id, unit, slot, answer, extended?}`. The reply
 * is the next question, or `{done, gaps:[{grade_id, unit_keys, titles,
 * minutes, known_count, unchecked_count}]}`. `extended: true` answers the
 * keep-checking walk; its `gaps` are the whole scan's, updated.
 */
router.post('/answer', requireAuth, limit('gap-scan-answer', 300, 60 * 60 * 1000), (req, res) => {
  const trackId = trackOf(req.body.track_id);
  if (!trackId) return res.status(404).json({ error: 'No such subject.' });
  const given = { grade_id: req.body.grade_id, unit: req.body.unit, slot: req.body.slot, answer: req.body.answer };
  const outcome = isExtended(req.body)
    ? gapScan.answerExtended(req.user.id, trackId, given)
    : gapScan.answer(req.user.id, trackId, given);
  // A stale or repeated answer gets the question actually being asked back, so
  // the page can redraw instead of getting stuck.
  if (outcome.error && !outcome.scan) return fail(res, outcome);
  const walk = outcome.walk || outcome.scan;
  const body = { track_id: trackId, recorded: !outcome.error && !outcome.already, ...gapScan.view(trackId, walk, Date.now(), outcome.scan) };
  // A finished catch-up quiz (or keep-checking after it) answers with the ordered catch-up plan.
  if (body.done && outcome.scan && outcome.scan.kind === 'catch_up') body.route = gapScan.routeFor(req.user.id, trackId);
  if (outcome.error) return res.status(outcome.status || 409).json({ error: outcome.error, ...body });
  res.json(body);
});

/**
 * Take or turn down one earlier grade's catch-up: `{enrollment_id, grade_id,
 * accept}`. `enrollment_id` is the recommended grade's enrollment, which holds
 * the offer. Accepting creates (or reuses) the earlier grade's enrollment with
 * only the gap units to learn; declining is remembered and never asked again.
 */
router.post('/decide', requireAuth, limit('gap-scan-decide', 60, 60 * 60 * 1000), (req, res) => {
  let enrollment = req.body.enrollment_id ? db.byId('enrollments', req.body.enrollment_id) : null;
  if (!enrollment && !req.body.enrollment_id && flag(req.body.all)) enrollment = scanEnrollment(req);
  if (!enrollment || enrollment.user_id !== req.user.id) return res.status(404).json({ error: 'Enrollment not found.' });
  // Every offer at once, lowest grade first: "Start the catch-up" / "Skip the catch-up".
  if (flag(req.body.all)) {
    const all = gapScan.decideAll(req.user.id, enrollment, flag(req.body.accept));
    return res.json({ enrollment_id: enrollment.id, results: all.results, route: all.route });
  }
  const gradeId = String(req.body.grade_id || '');
  if (!gradeId) return res.status(400).json({ error: 'Which grade?' });
  const outcome = gapScan.decide(req.user.id, enrollment, gradeId, req.body.accept === true || req.body.accept === 'true');
  if (outcome.error) return fail(res, outcome);
  const earlier = outcome.catch_up_enrollment;
  res.json({
    entry: outcome.entry,
    catch_up: (outcome.plan && outcome.plan.catch_up) || [],
    catch_up_enrollment: earlier ? { id: earlier.id, grade_id: earlier.grade_id, current_level: earlier.current_level, status: earlier.status } : null,
    already: !!outcome.already,
  });
});

/**
 * The recommended grade's enrollment for `{track_id}`, for a decision sent
 * without one: the enrollment for the grade the learner's scan was for, made
 * the way choosing that grade makes it if they have none yet (accepting the
 * catch-up is choosing to start that grade after it).
 */
function scanEnrollment(req) {
  const trackId = trackOf(req.body.track_id);
  if (!trackId) return null;
  const state = gapScan.stateFor(req.user.id, trackId);
  const gradeId = state.scan && state.scan.grade_id;
  if (!gradeId) return null;
  const chosen = subjectPlacement.chooseGrade(req.user.id, trackId, gradeId);
  return chosen.error ? null : chosen.enrollment;
}

/**
 * Start at the recommended grade without the catch-up quiz: `{track_id,
 * grade_id?}`. Remembered, so the result page does not offer it again for this
 * walk. The reply is the quiz's state.
 */
router.post('/catch-up/decline', requireAuth, limit('gap-scan-decline', 60, 60 * 60 * 1000), (req, res) => {
  const trackId = trackOf(req.body.track_id);
  if (!trackId) return res.status(404).json({ error: 'No such subject.' });
  const outcome = gapScan.declineCatchUp(req.user.id, trackId, req.body.grade_id ? String(req.body.grade_id) : null);
  if (outcome.error) return fail(res, outcome);
  res.json({ track_id: trackId, catch_up_quiz: outcome.quiz });
});

/** The catch-up as one ordered plan, lowest grade first, for a subject. `route` is null until a scan or catch-up quiz is done. */
router.get('/route/:track', requireAuth, (req, res) => {
  const trackId = trackOf(req.params.track);
  if (!trackId) return res.status(404).json({ error: 'No such subject.' });
  res.json({ track_id: trackId, route: gapScan.routeFor(req.user.id, trackId) });
});

/** Where the scan and its offers stand for a subject, for a page that reloads. */
router.get('/state/:track', requireAuth, (req, res) => {
  const trackId = trackOf(req.params.track);
  if (!trackId) return res.status(404).json({ error: 'No such subject.' });
  res.json({ track_id: trackId, ...gapScan.stateFor(req.user.id, trackId) });
});

module.exports = router;
