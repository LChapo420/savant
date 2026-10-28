/**
 * The owner's skips (2026-10-24): skip a placement quiz, skip a whole grade, and
 * stand on any level of any grade, ahead or behind.
 *
 * Only for the account config/capabilities.js canSkip allows (the owner,
 * config/owner.js isOwner). The routes ask that with middleware/auth.js
 * requireSkip; this file asks nothing, so it must never be reached any other way.
 * Skipping a question and skipping one level are the older routes in
 * routes/learn.js (/items/:id/skip, /enrollments/:id/skip-level).
 *
 * No gate holds the owner on the way: a grade skipped here graduates without the
 * Final, the coverage gate, the skill stage gate or consolidation; holds already
 * on the enrollment are cleared. What a jump forward records is
 * mastery.jumpToLevel's (every level below at 100%, marked `skipped`); a jump
 * back only moves the position and leaves the record as it is.
 */
const db = require('../config/db');
const curriculum = require('../config/curriculum');
const mastery = require('./mastery');

const iso = () => new Date().toISOString();

/** Close the sittings left open on an enrollment: moved past, not quit. A placement is cancelled. */
function closeOpen(userId, enrollmentId) {
  for (const s of db.find('sessions', (x) => x.user_id === userId && x.enrollment_id === enrollmentId && !x.ended_at)) {
    db.update('sessions', s.id, { ended_at: iso(), abandoned: true, closed_by: 'owner_skip', ...(s.kind === 'placement' ? { cancelled: true } : {}) });
  }
}

function enrollmentFor(userId, trackId, gradeId) {
  return db.findOne('enrollments', (e) => e.user_id === userId && e.track_id === trackId && e.grade_id === gradeId) || null;
}

/**
 * Stand on `level` of a grade: enrolled if not yet, placement skipped, a
 * graduated grade opened again, holds cleared.
 *
 * @returns {{enrollment, level, created, cleared, reopened}|{error, status}}
 */
function go({ userId, trackId, gradeId, level = 1 }) {
  const grade = curriculum.getGrade(String(trackId || ''), String(gradeId || ''));
  if (!grade) return { error: 'Unknown subject or grade.', status: 400 };
  const target = Math.max(1, Math.min(grade.pathLength, Math.floor(Number(level)) || 1));
  let enrollment = enrollmentFor(userId, trackId, gradeId);
  let created = false;
  const now = iso();
  if (!enrollment) {
    enrollment = db.insert('enrollments', {
      user_id: userId,
      track_id: trackId,
      grade_id: gradeId,
      target_level: grade.pathLength,
      current_level: 1,
      level_items: 0,
      levels_completed: 0,
      xp: 0,
      status: 'active',
      pending_checkpoint: null,
      placed_at: now,
      placement_skipped_at: now,
    });
    db.update('users', userId, { onboarded: true });
    created = true;
  }
  closeOpen(userId, enrollment.id);
  const reopened = enrollment.status === 'graduated';
  const patch = { checkpoint_retry_at: null, coverage_held_at: null, skill_held_at: null, pending_checkpoint: null };
  if (enrollment.status !== 'active') {
    Object.assign(patch, { status: 'active', placed_at: enrollment.placed_at || now });
    if (enrollment.status === 'placement_pending') patch.placement_skipped_at = now;
    if (reopened) patch.reopened_at = now;
  }
  db.update('enrollments', enrollment.id, patch);
  enrollment = db.byId('enrollments', enrollment.id);

  let cleared = 0;
  const from = enrollment.current_level || 1;
  if (target > from) {
    const out = mastery.jumpToLevel({ userId, enrollment, grade, to: target });
    cleared = out.cleared || 0;
  } else if (target < from) {
    db.update('enrollments', enrollment.id, { current_level: target, level_items: 0, moved_back_at: now, moved_back_from: from });
  }
  // eslint-disable-next-line global-require
  require('./remediation').clearFor(userId, enrollment.id);
  return { enrollment: db.byId('enrollments', enrollment.id), level: target, created, cleared, reopened };
}

/** Skip an enrollment's placement quiz: stand on `level` (1 by default) as placed. */
function skipPlacement({ userId, enrollment, level = 1 }) {
  return go({ userId, trackId: enrollment.track_id, gradeId: enrollment.grade_id, level });
}

/** The grade after this one on its subject, or null at the top. */
function nextGrade(trackId, gradeId) {
  const track = curriculum.getTrack(trackId);
  const grades = (track && track.grades) || [];
  const i = grades.findIndex((g) => g.id === gradeId);
  return i >= 0 && i + 1 < grades.length ? grades[i + 1] : null;
}

/**
 * Skip a whole grade: graduated now, without the Final or any gate; the next
 * grade is joined (placement skipped) where the owner has not joined it yet, or
 * opened where it was waiting on its placement.
 *
 * @returns {{graduated, next}|{error, status}}
 */
function skipGrade({ userId, enrollment }) {
  const grade = curriculum.getGrade(enrollment.track_id, enrollment.grade_id);
  if (!grade) return { error: 'That subject is no longer available.', status: 400 };
  closeOpen(userId, enrollment.id);
  const now = iso();
  db.update('enrollments', enrollment.id, {
    status: 'graduated',
    graduated_at: now,
    grade_skipped_at: now,
    checkpoint_retry_at: null,
    coverage_held_at: null,
    skill_held_at: null,
    pending_checkpoint: null,
  });
  // eslint-disable-next-line global-require
  require('./remediation').clearFor(userId, enrollment.id);
  const after = nextGrade(enrollment.track_id, enrollment.grade_id);
  let next = null;
  if (after) {
    const existing = enrollmentFor(userId, enrollment.track_id, after.id);
    if (!existing || existing.status === 'placement_pending') {
      next = go({ userId, trackId: enrollment.track_id, gradeId: after.id, level: 1 }).enrollment;
    } else {
      next = existing;
    }
  }
  return { graduated: db.byId('enrollments', enrollment.id), next };
}

module.exports = { go, skipPlacement, skipGrade, nextGrade };
