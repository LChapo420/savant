/**
 * The public catalogue and the enrollment list. Everything a learner needs to
 * decide what to study, and the record of what they chose.
 */
const express = require('express');
const db = require('../config/db');
const curriculum = require('../config/curriculum');
const learner = require('../services/learner');
const mastery = require('../services/mastery');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

/** Tracks, grades, and how long each placement quiz runs. Open to visitors: the
 *  catalogue is the marketing surface as much as the product surface. */
router.get('/catalog', (req, res) => {
  const tracks = curriculum.catalogue();
  // Smaller forms for the pages that draw less (learner follow-ups 2026-10-24):
  // the full list is 149 KB, mostly every grade's skill list.
  //   ?view=summary  the landing page: each subject's name, blurb and grade count.
  //   ?view=grades   onboarding: every grade without its skill list.
  if (req.query.view === 'summary') {
    return res.json({ tracks: tracks.map((t) => ({ id: t.id, name: t.name, icon: t.icon, color: t.color, blurb: t.blurb, grade_count: t.grades.length })) });
  }
  if (req.query.view === 'grades') {
    return res.json({ tracks: tracks.map((t) => ({ ...t, grades: t.grades.map(({ skills, ...g }) => g) })) });
  }
  res.json({ tracks });
});

/** The learning-style questionnaire. The scale is served with it so the wording
 *  of the options lives in one place. */
router.get('/style-quiz', (req, res) => {
  res.json({
    questions: learner.STYLE_QUESTIONS.map((q) => ({ id: q.id, prompt: q.prompt, low: q.low, high: q.high })),
    scale: learner.SCALE,
  });
});

function enrollmentView(userId, enrollment) {
  const track = curriculum.getTrack(enrollment.track_id);
  const grade = curriculum.getGrade(enrollment.track_id, enrollment.grade_id);
  if (!track || !grade) return null;
  const progress = enrollment.status === 'placement_pending'
    ? null
    : mastery.levelProgress(userId, enrollment, grade);
  return {
    id: enrollment.id,
    track: { id: track.id, name: track.name, icon: track.icon, color: track.color },
    grade: { id: grade.id, name: grade.name, tier: grade.tier, pathLength: grade.pathLength },
    status: enrollment.status,
    current_level: enrollment.current_level,
    // What the learner is standing on: practice, lesson, master, grand, graduation.
    // `delivered` is the kind it is *given* as, which on an English track differs
    // from its kind — a Master quiz the learner is asked to write.
    level_kind: enrollment.status === 'placement_pending'
      ? null
      : curriculum.levelKind(enrollment.current_level, grade.pathLength, grade),
    delivered: enrollment.status === 'placement_pending'
      ? null
      : curriculum.checkpointKind(grade, enrollment.current_level),
    // Whether this level can fail at all, decided here rather than in the browser.
    // The dashboard used to keep its own list of the kinds that can, and left
    // `essay` out of it, so a learner standing on a written Master saw no way to
    // take it.
    is_checkpoint: enrollment.status !== 'placement_pending'
      && curriculum.isCheckpoint(curriculum.checkpointKind(grade, enrollment.current_level)),
    xp: enrollment.xp || 0,
    levels_completed: enrollment.levels_completed || 0,
    checkpoint_retry_at: enrollment.checkpoint_retry_at || null,
    placed_at: enrollment.placed_at || null,
    last_session_at: enrollment.last_session_at || null,
    placement_length: curriculum.placementLength(grade.tier),
    progress,
  };
}

router.get('/enrollments', requireAuth, (req, res) => {
  const rows = db.find('enrollments', (e) => e.user_id === req.user.id)
    .map((e) => enrollmentView(req.user.id, e))
    .filter(Boolean);
  res.json({ enrollments: rows });
});

/**
 * Enroll in one or more (track, grade) pairs. Every new enrollment starts in
 * placement_pending: a level is something the product measures, never something
 * the learner asserts.
 */
router.post('/enrollments', requireAuth, (req, res) => {
  const selections = Array.isArray(req.body.selections) ? req.body.selections.slice(0, 10) : [];
  if (!selections.length) return res.status(400).json({ error: 'Choose at least one subject.' });

  const created = [];
  const skipped = [];
  for (const sel of selections) {
    const grade = curriculum.getGrade(String(sel.track_id || ''), String(sel.grade_id || ''));
    if (!grade) {
      skipped.push({ ...sel, reason: 'unknown subject or level' });
      continue;
    }
    const existing = db.findOne('enrollments', (e) => e.user_id === req.user.id
      && e.track_id === sel.track_id && e.grade_id === sel.grade_id);
    if (existing) {
      skipped.push({ ...sel, reason: 'already enrolled' });
      continue;
    }
    created.push(db.insert('enrollments', {
      user_id: req.user.id,
      track_id: sel.track_id,
      grade_id: sel.grade_id,
      target_level: grade.pathLength,
      current_level: 1,
      level_items: 0,
      levels_completed: 0,
      xp: 0,
      status: 'placement_pending',
      pending_checkpoint: null,
      placed_at: null,
    }));
  }

  if (created.length) db.update('users', req.user.id, { onboarded: true });
  res.status(201).json({
    created: created.map((e) => enrollmentView(req.user.id, e)),
    skipped,
  });
});

/** Leave a track. The skill history stays: re-enrolling later should not start
 *  from zero on knowledge the learner demonstrably has. */
router.delete('/enrollments/:id', requireAuth, (req, res) => {
  const enrollment = db.byId('enrollments', req.params.id);
  if (!enrollment || enrollment.user_id !== req.user.id) return res.status(404).json({ error: 'Not found.' });
  db.remove('enrollments', (e) => e.id === enrollment.id);
  res.json({ ok: true });
});

module.exports = { router, enrollmentView };
