/**
 * The subject placement quiz: which questions, what was scored, and where the
 * learner belongs.
 *
 * Nothing is graded back to the learner while the walk runs — the same reason the
 * per-grade placement stays quiet: a quiz that tells you as you go stops being a
 * measurement and becomes a conversation. The verdict arrives once, at the end,
 * as a percentage per grade.
 *
 * Writing a subject's questions takes minutes, so `/start` never waits on it: it
 * begins the work and says so, and the page polls until the ladder is ready.
 */
const express = require('express');
const curriculum = require('../config/curriculum');
const rules = require('../config/subject-placement');
const subjectPlacement = require('../services/subject-placement');
const { requireAuth } = require('../middleware/auth');
const { limit } = require('../utils/rate-limit');

const router = express.Router();

function trackOf(req) {
  const trackId = String(req.params.track || '');
  const track = curriculum.getTrack(trackId);
  return track ? trackId : null;
}

/** The percentages this learner already has for every subject, for the picker. */
router.get('/percent/mine', requireAuth, (req, res) => {
  const rows = require('../config/db').find('subject_placements', (p) => p.user_id === req.user.id);
  const out = {};
  for (const row of rows) {
    if (!row.recommendation) continue;
    out[row.track_id] = {
      percent: row.recommendation,
      probabilities: (subjectPlacement.resultFor(row.track_id, row) || {}).probabilities || null,
      recommended_grade_id: row.recommended_grade_id,
      headline: row.headline || '',
      finished_at: row.finished_at || null,
      grades_walked: (row.scores || []).length,
      grade_count: (row.grade_ids || []).length,
      skipped: (row.skipped || []).reduce((n, s) => n + (s.count || 0), 0),
      model: row.percent_model || null,
    };
  }
  res.json({ placement: out });
});

/** What the quiz page needs to draw itself, whatever stage it is at. */
router.get('/:track', requireAuth, (req, res) => {
  const trackId = trackOf(req);
  if (!trackId) return res.status(404).json({ error: 'No such subject.' });
  res.json(subjectPlacement.stateFor(req.user.id, trackId));
});

/**
 * Begin the walk. If the subject has no questions yet, this starts writing them
 * and returns without them — the page waits and asks again.
 */
router.post('/:track/start', requireAuth, limit('subject-placement-start', 20, 60 * 60 * 1000), (req, res) => {
  const trackId = trackOf(req);
  if (!trackId) return res.status(404).json({ error: 'No such subject.' });

  const set = subjectPlacement.questionSet(trackId) || subjectPlacement.ensureQuestionSet(trackId, req.user.id);
  // Resuming by default; `restart` is sent only when a learner asks to take it
  // again from a finished result.
  // `mode` is quick, balanced or accurate for the adaptive walk (anything else is
  // the full climb from the first grade); `start_grade_id` is where the learner
  // thinks they are, which the adaptive walk starts its search from.
  const placement = subjectPlacement.start(req.user.id, trackId, {
    restart: !!req.body.restart,
    mode: req.body.mode ? String(req.body.mode) : null,
    startGradeId: req.body.start_grade_id ? String(req.body.start_grade_id) : null,
  });
  const current = subjectPlacement.currentQuestions(placement);
  const gradeId = current ? current.grade_id : null;
  const questions = current ? current.questions : null;

  res.status(set ? 200 : 202).json({
    ready: !!set,
    writing: !set,
    available: !!subjectPlacement.stateFor(req.user.id, trackId).available,
    placement,
    grade_id: questions ? gradeId : null,
    grade_name: questions ? rules.gradeName(trackId, gradeId) : null,
    grade_number: questions ? (placement.position || 0) + 1 : null,
    grade_count: (placement.grade_ids || []).length,
    questions: questions || [],
    mode: placement.mode || 'full',
    deadline_at: placement.deadline_at || null,
    asked_so_far: (placement.answered || []).length,
  });
});

/** The seven questions for one grade, without the answers. */
router.get('/:track/grade/:gradeId', requireAuth, (req, res) => {
  const trackId = trackOf(req);
  if (!trackId) return res.status(404).json({ error: 'No such subject.' });
  const questions = subjectPlacement.questionsFor(trackId, req.params.gradeId, { core: true });
  if (!questions) return res.status(404).json({ error: 'No questions for that grade.' });
  res.json({
    grade_id: req.params.gradeId,
    grade_name: rules.gradeName(trackId, req.params.gradeId),
    questions: questions.map(subjectPlacement.sanitize),
  });
});

/** One answer, saved the moment it is given, so nothing is lost by leaving. */
router.post('/:track/answer', requireAuth, limit('subject-placement-answer', 300, 60 * 60 * 1000), (req, res) => {
  const trackId = trackOf(req);
  if (!trackId) return res.status(404).json({ error: 'No such subject.' });
  const saved = subjectPlacement.recordAnswer(
    req.user.id,
    trackId,
    String(req.body.grade_id || ''),
    req.body.index,
    req.body.answer,
  );
  if (saved.error) return res.status(400).json({ error: saved.error });
  res.json(saved);
});

/** Quit at any point and score only the answers already given. */
router.post('/:track/quit', requireAuth, limit('subject-placement-quit', 30, 60 * 60 * 1000), async (req, res) => {
  const trackId = trackOf(req);
  if (!trackId) return res.status(404).json({ error: 'No such subject.' });
  const outcome = subjectPlacement.quit(
    req.user.id,
    trackId,
    req.body.grade_id ? String(req.body.grade_id) : '',
    req.body.answers,
  );
  if (outcome.error) return res.status(400).json({ error: outcome.error });

  const updated = await subjectPlacement.recommend(req.user.id, trackId);
  if (!updated) return res.status(503).json({ error: 'Your answers were saved, but the recommendation could not be written yet.' });
  res.json({ already: false, quit: true, ...subjectPlacement.resultFor(trackId, updated) });
});

/**
 * Hand in one grade's answers. The reply carries the score for that grade — it is
 * already asked and gone — and whether the walk carries on, moves to the next
 * grade, or offers to step over the next four.
 */
router.post('/:track/grade', requireAuth, (req, res) => {
  const trackId = trackOf(req);
  if (!trackId) return res.status(404).json({ error: 'No such subject.' });
  const gradeId = String(req.body.grade_id || '');
  if (!(req.body.answers || []).length) return res.status(400).json({ error: 'Answer something first.' });

  const running = subjectPlacement.placementFor(req.user.id, trackId);
  const outcome = subjectPlacement.isAdaptive(running)
    ? subjectPlacement.submitBlock(req.user.id, trackId, req.body.answers)
    : subjectPlacement.submitGrade(req.user.id, trackId, gradeId, req.body.answers);
  if (outcome.error) return res.status(400).json({ error: outcome.error });

  const current = outcome.next_grade_id ? subjectPlacement.currentQuestions(outcome.placement) : null;
  const nextQuestions = current ? current.questions : null;
  res.json({
    grade_id: outcome.grade_id,
    grade_name: rules.gradeName(trackId, outcome.grade_id),
    correct: outcome.correct,
    asked: outcome.asked,
    stopped: outcome.stopped,
    skip: outcome.skip,
    // How much of the subject is left, so the page can say where they are without
    // knowing the rules itself.
    grades_walked: (outcome.placement.scores || []).length,
    grade_count: (outcome.placement.grade_ids || []).length,
    next_grade_id: nextQuestions ? outcome.next_grade_id : null,
    next_grade_name: nextQuestions ? rules.gradeName(trackId, outcome.next_grade_id) : null,
    next_grade_number: nextQuestions ? (outcome.placement.position || 0) + 1 : null,
    questions: nextQuestions || [],
    mode: outcome.placement.mode || 'full',
    deadline_at: outcome.placement.deadline_at || null,
    asked_so_far: (outcome.placement.answered || []).length,
  });
});

/** Take the offered skip. */
router.post('/:track/skip', requireAuth, (req, res) => {
  const trackId = trackOf(req);
  if (!trackId) return res.status(404).json({ error: 'No such subject.' });
  const outcome = subjectPlacement.skip(req.user.id, trackId, req.body.count);
  if (outcome.error) return res.status(400).json({ error: outcome.error });
  const nextQuestions = outcome.next_grade_id ? subjectPlacement.questionsFor(trackId, outcome.next_grade_id, { core: true }) : null;
  res.json({
    skipped: outcome.skipped,
    stopped: !nextQuestions,
    next_grade_id: nextQuestions ? outcome.next_grade_id : null,
    next_grade_name: nextQuestions ? rules.gradeName(trackId, outcome.next_grade_id) : null,
    next_grade_number: nextQuestions ? (outcome.placement.position || 0) + 1 : null,
    grade_count: (outcome.placement.grade_ids || []).length,
    questions: nextQuestions ? nextQuestions.map(subjectPlacement.sanitize) : [],
  });
});

/**
 * The end of the walk: the percentages. This is a model call, so it can take a
 * few seconds — the page shows that rather than pretending it is instant.
 */
router.post('/:track/finish', requireAuth, limit('subject-placement-finish', 30, 60 * 60 * 1000), async (req, res) => {
  const trackId = trackOf(req);
  if (!trackId) return res.status(404).json({ error: 'No such subject.' });

  const placement = subjectPlacement.placementFor(req.user.id, trackId);
  if (!placement) return res.status(400).json({ error: 'Take the quiz first.' });

  // Already decided: hand back what was stored rather than paying for it twice.
  if (placement.recommendation && !req.body.again) {
    return res.json({ already: true, ...subjectPlacement.resultFor(trackId, placement) });
  }
  if (!(placement.scores || []).length) return res.status(400).json({ error: 'Answer at least one question first.' });

  const updated = await subjectPlacement.recommend(req.user.id, trackId);
  if (!updated) {
    return res.status(503).json({
      error: 'The recommendation could not be written right now. Your answers are saved — try again in a moment.',
    });
  }

  res.json({ already: false, ...subjectPlacement.resultFor(trackId, updated) });
});

/**
 * "This is too easy" / "this is too hard": `{said: 'too_easy' | 'too_hard'}`. Moves the recommendation one grade and
 * records it (subjectPlacement.adjust). Hands back the updated result.
 */
router.post('/:track/adjust', requireAuth, limit('subject-placement-adjust', 60, 60 * 60 * 1000), (req, res) => {
  const trackId = trackOf(req);
  if (!trackId) return res.status(404).json({ error: 'No such subject.' });
  const outcome = subjectPlacement.adjust(req.user.id, trackId, String((req.body && req.body.said) || ''));
  if (outcome.error) return res.status(outcome.status || 400).json({ error: outcome.error });
  res.json({ moved: outcome.moved, ...subjectPlacement.resultFor(trackId, outcome.placement) });
});

/**
 * Start at any grade: `{grade_id}`. The result recommends the most probable
 * grade, but the learner may pick any of them. This enrolls them in that grade
 * the way choosing it on the catalog does (its in-grade placement comes next),
 * or hands back the enrollment they already have. `next` says where the page
 * goes: the in-grade placement for a new enrollment, the path for one already
 * placed.
 */
router.post('/:track/choose', requireAuth, limit('subject-placement-choose', 60, 60 * 60 * 1000), (req, res) => {
  const trackId = trackOf(req);
  if (!trackId) return res.status(404).json({ error: 'No such subject.' });
  const outcome = subjectPlacement.chooseGrade(req.user.id, trackId, String(req.body.grade_id || ''));
  if (outcome.error) return res.status(outcome.status || 400).json({ error: outcome.error });
  const e = outcome.enrollment;
  res.status(outcome.created ? 201 : 200).json({
    enrollment: { id: e.id, track_id: e.track_id, grade_id: e.grade_id, status: e.status, current_level: e.current_level },
    created: outcome.created,
    recommended: outcome.recommended,
    grade_name: rules.gradeName(trackId, e.grade_id),
    next: e.status === 'placement_pending' ? 'placement' : 'path',
  });
});

module.exports = router;
