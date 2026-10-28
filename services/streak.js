/**
 * The day streak, counted on the learner's own calendar day, with one grace day.
 *
 * Evidence (curriculum-build/evidence-article/05-engagement-ux-wellbeing.md, M1
 * and P2): Lally et al. 2009 (one missed opportunity "did not materially affect
 * the habit formation process"), Kahneman and Tversky 1979 (losses weigh more
 * than gains, which is the pull a streak leans on and why a single miss should
 * not wipe it), and the UK Children's Code standard 5 (a child must be able to
 * disengage without feeling pressured). The old code compared UTC dates, so an
 * evening learner far from UTC lost or kept a streak wrongly, and any gap reset
 * the count.
 *
 * The rules (STREAK_LOCAL_GRACE, on by default; off, and always for the owner's
 * account, the old UTC rule runs unchanged):
 *   - A day is the learner's local date: their `retention_tz` if set, else the
 *     browser's time zone (kept on the row as `client_tz`), else UTC.
 *   - A finished sitting or review on a new day continues the run when the last
 *     active day was yesterday.
 *   - One missed day is forgiven, once in any 7 days (`streak_grace_at` is the
 *     day it was last used): the run continues and counts today.
 *   - Any longer gap starts again at 1.
 *   - A date in the past (the zone moved west, a clock set back) changes nothing.
 *
 * `current` is what to show: a run that has already lapsed reads 0 rather than a
 * stale number, so the header never claims a streak that the next sitting would
 * reset. It is read-only; only `record` writes.
 */
const db = require('../config/db');
const owner = require('../config/owner');
const schedule = require('./retention-schedule');

const GRACE_EVERY_DAYS = 7;

function enabled() {
  return String(process.env.STREAK_LOCAL_GRACE || 'on').trim().toLowerCase() !== 'off';
}

/** Does the new rule apply to this user (a row)? */
function appliesTo(user) {
  return enabled() && !!user && !owner.ownerBase(user);
}

/** The learner's zone: retention_tz, else the browser's, else UTC. */
function zoneOf(user) {
  return schedule.validZone((user && (user.retention_tz || user.client_tz)) || 'UTC');
}

function graceReady(user, today) {
  if (!user.streak_grace_at) return true;
  const since = schedule.dateNumber(today) - schedule.dateNumber(user.streak_grace_at);
  return !(since >= 0) || since >= GRACE_EVERY_DAYS;
}

/**
 * Where the streak stands after a sitting ends at `now`. Pure: returns the
 * fields to write, or `{ changed: false }` when today was already counted.
 */
function advance(user, now = Date.now()) {
  const today = schedule.localDate(now, zoneOf(user));
  const last = user.last_active_day || null;
  const run = user.streak || 0;
  if (!last) return { changed: true, streak: 1, last_active_day: today };
  const gap = schedule.dateNumber(today) - schedule.dateNumber(last);
  if (!(gap >= 1)) return { changed: false, streak: run, last_active_day: last };
  if (gap === 1) return { changed: true, streak: run + 1, last_active_day: today };
  if (gap === 2 && run > 0 && graceReady(user, today)) {
    return { changed: true, streak: run + 1, last_active_day: today, streak_grace_at: today, grace_used: true };
  }
  return { changed: true, streak: 1, last_active_day: today };
}

/** The streak to show for a user row at `now`. */
function current(user, now = Date.now()) {
  const run = Number(user && user.streak) || 0;
  if (!run || !appliesTo(user)) return run;
  const today = schedule.localDate(now, zoneOf(user));
  const last = user.last_active_day;
  if (!last) return 0;
  const gap = schedule.dateNumber(today) - schedule.dateNumber(last);
  if (!(gap >= 2)) return run;
  return gap === 2 && graceReady(user, today) ? run : 0;
}

/** The pre-change rule, kept exactly for the owner and for the switch off. */
function advanceLegacy(user, now) {
  const today = new Date(now).toISOString().slice(0, 10);
  const run = user.streak || 0;
  if (user.last_active_day === today) return { changed: false, streak: run, last_active_day: today };
  const yesterday = new Date(now - 24 * 3600 * 1000).toISOString().slice(0, 10);
  return { changed: true, streak: user.last_active_day === yesterday ? run + 1 : 1, last_active_day: today };
}

/**
 * Count a finished sitting or review for this learner and add its XP, in one
 * write. Returns the streak after it.
 *
 * @param {number|string} userId
 * @param {{ xp?: number, now?: number }} [opts]
 * @returns {number}
 */
function record(userId, { xp = 0, now = Date.now() } = {}) {
  const user = db.byId('users', userId);
  if (!user) return 0;
  const step = appliesTo(user) ? advance(user, now) : advanceLegacy(user, now);
  const patch = { xp: (user.xp || 0) + xp };
  if (step.changed) {
    patch.streak = step.streak;
    patch.last_active_day = step.last_active_day;
    if (step.streak_grace_at) patch.streak_grace_at = step.streak_grace_at;
  }
  db.update('users', userId, patch);
  return step.streak;
}

module.exports = { GRACE_EVERY_DAYS, enabled, appliesTo, zoneOf, advance, advanceLegacy, current, record };
