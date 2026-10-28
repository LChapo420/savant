/**
 * Consolidation before the Final (curriculum-build/ADAPTIVE-COVERAGE.md
 * section 7, decision 7; staged patch round3/02-consolidation).
 *
 * When a learner first stands on a grade's Graduation exam, the Final waits
 * while their record says the grade will not last: short review-only days
 * (the daily review, at most ADAPT_REVIEW_MINUTES, 10 minutes, a day) until
 * at least ADAPT_CONSOLIDATE_AT (90%) of the grade's objectives are predicted
 * to be recalled 30 days on, for at most ADAPT_CONSOLIDATE_DAYS (21) days
 * (adaptation.consolidation). In the simulation's ablation, taking this stretch
 * away dropped 30-day recall with no further study from 95.6% to 80.0%, below
 * today's lessons (93.8%).
 *
 * It costs calendar days, not study time, so it never holds the learner up:
 * the next grade can be started the same day, and worked alongside.
 *
 * It applies once, before the first sitting of the Final: a retry after a miss
 * is not held (remediation is the answer there), and a stretch that has ended
 * stays ended. The owner's account is never held.
 *
 * Off unless ADAPT_CONSOLIDATE=on, and only while the daily review (staged
 * patch round3/01, ADAPT_REVIEW_SESSION=on) is installed and on: holding the
 * Final with no review to do would only be a wait.
 */
const db = require('../config/db');
const curriculum = require('../config/curriculum');
const adaptation = require('./adaptation');

function reviewOn() {
  try {
    // eslint-disable-next-line global-require
    return require('./review-session').enabled();
  } catch {
    return false;
  }
}

function enabled() {
  // Default on since 2026-10-24 (owner approved, LIVE-CHANGES-2026-10-24.md); ADAPT_CONSOLIDATE=off turns it off.
  return String(process.env.ADAPT_CONSOLIDATE || 'on').toLowerCase() === 'on' && reviewOn();
}

/** The grade after this one on the track, and the learner's enrollment in it if they have one. */
function nextGrade(userId, enrollment) {
  const track = curriculum.getTrack(enrollment.track_id);
  if (!track) return null;
  const at = track.grades.findIndex((g) => g.id === enrollment.grade_id);
  const next = at >= 0 ? track.grades[at + 1] : null;
  if (!next) return null;
  const mine = db.findOne('enrollments', (e) => e.user_id === userId && e.track_id === enrollment.track_id && e.grade_id === next.id);
  return { id: next.id, name: next.name, enrollment_id: mine ? mine.id : null, status: mine ? mine.status : null };
}

/**
 * Where the stretch stands for one enrollment, or null when it does not apply
 * (off, not on the Final, already sat, held, the owner, or no objective model).
 * Starts the clock the first time the learner is found on the Final.
 */
function forEnrollment(userId, enrollment, grade = null, { now = Date.now() } = {}) {
  if (!enabled() || !enrollment || enrollment.status !== 'active' || enrollment.coverage_held_at) return null;
  const g = grade || curriculum.getGrade(enrollment.track_id, enrollment.grade_id);
  if (!g || curriculum.levelKind(enrollment.current_level, g.pathLength, g) !== 'graduation') return null;
  if ((enrollment.checkpoint_attempts || 0) > 0) return null;
  // A Final already under way (started before the stretch applied) is finished, not held.
  if (db.findOne('sessions', (s) => s.enrollment_id === enrollment.id && !s.ended_at && s.kind === 'graduation')) return null;
  if (adaptation.ownerSkips(userId)) return null;
  if (enrollment.consolidation_ended_at) {
    return { active: false, reason: enrollment.consolidation_reason || null, ended_at: enrollment.consolidation_ended_at };
  }
  const rec = adaptation.recordFor(userId, enrollment);
  if (!rec) return null;
  let started = Date.parse(enrollment.consolidation_started_at);
  if (!Number.isFinite(started)) {
    started = now;
    db.update('enrollments', enrollment.id, { consolidation_started_at: new Date(now).toISOString() });
  }
  const c = adaptation.consolidation({ model: rec.report.model, states: rec.report.states, now, startedAt: started, curve: rec.curve });
  if (!c.active) {
    db.update('enrollments', enrollment.id, { consolidation_ended_at: new Date(now).toISOString(), consolidation_reason: c.reason });
    return { ...c, ended_at: new Date(now).toISOString() };
  }
  // eslint-disable-next-line global-require
  const today = require('./review-session').today(userId, enrollment, { now });
  return {
    ...c,
    ...opensBy(c.ends_at, zoneOf(userId)),
    review: today ? { due: today.retrieve.length, minutes: today.minutes, reteach: today.reteach.length, done_today: today.done_today } : null,
    next_grade: nextGrade(userId, enrollment),
  };
}

/** The learner's day zone, as the streak and the retention calendar read it (retention_tz, else the browser's, else UTC). */
function zoneOf(userId) {
  try {
    // eslint-disable-next-line global-require
    return require('./streak').zoneOf(db.byId('users', userId));
  } catch {
    return 'UTC';
  }
}

/**
 * The one date the Final opens by, in the learner's own zone: { opens_on
 * (YYYY-MM-DD), opens_label ("November 15"), opens_tz }. The path, the
 * session route and the dashboard all show this label, so they cannot
 * disagree (the path used the browser's zone and the route UTC: one said
 * November 14, the other November 15).
 */
function opensBy(endsAt, tz = 'UTC') {
  const t = Date.parse(endsAt);
  if (!Number.isFinite(t)) return { opens_on: null, opens_label: null, opens_tz: tz };
  let zone = tz || 'UTC';
  let label;
  try {
    label = new Date(t).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: zone });
  } catch {
    zone = 'UTC';
    label = new Date(t).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: zone });
  }
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: zone })
    .formatToParts(new Date(t)).map((p) => [p.type, p.value]));
  return { opens_on: `${parts.year}-${parts.month}-${parts.day}`, opens_label: label, opens_tz: zone };
}

/** What the session route says when the Final is asked for during the stretch. */
function heldMessage(c) {
  const ends = c.opens_label || opensBy(c.ends_at, 'UTC').opens_label;
  return `Before the Final: a short review each day until this grade will last (day ${c.day} of at most ${c.days}). The Final opens by ${ends}, or sooner. You can start the next grade meanwhile.`;
}

module.exports = {
  enabled,
  reviewOn,
  nextGrade,
  forEnrollment,
  heldMessage,
  opensBy,
};
