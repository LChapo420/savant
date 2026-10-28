/**
 * Study sessions: the learner's "Start session" ... "End session" span, which
 * the end-of-session retention enforcer is sized from
 * (curriculum-build/RETENTION-ENFORCERS.md).
 *
 * A study session is not a sitting (services/sessions.js): it can hold any
 * number of sittings, lesson pages and games, in any subject. What it records is
 * when it ran and how much of that was active time:
 *
 *   - Active time grows only while it is running, from the page's heartbeat
 *     (every 30 s while the page is visible and the learner has done something
 *     in the last few minutes) and from every answer. A gap between two signs of
 *     activity counts at most `idle_cap_ms` (5 min): a learner who walks away
 *     with the page open is not studying.
 *   - Pause stops the clock; Resume restarts it.
 *   - A running session with no activity for RETENTION_IDLE_END_MIN (30) minutes
 *     ends by itself, at its last activity; a paused one ends when the local day
 *     changes or after 12 hours. Either way the learner "left without
 *     choosing", so the enforcer for it is offered when they come back.
 *
 * Days are the learner's local calendar days (their browser's time zone, kept
 * on the user row as `retention_tz`). The first session's local date is the
 * learner's anchor (`retention_anchor`), day 0 of their retention calendar.
 */
const db = require('../config/db');
const schedule = require('./retention-schedule');
const params = require('./retention-params');

function enabled() {
  return String(process.env.RETENTION_ENFORCERS || 'on').toLowerCase() !== 'off';
}

function idleEndMs() {
  const v = Number(process.env.RETENTION_IDLE_END_MIN);
  return (Number.isFinite(v) && v > 0 ? v : 30) * 60000;
}
const PAUSE_END_MS = 12 * 3600 * 1000;

/** The learner's time zone: the hint from the browser when valid (and kept), else what is stored, else UTC. */
function zoneFor(userId, hint = null) {
  const user = db.byId('users', userId);
  if (!user) return 'UTC';
  const valid = hint ? schedule.validZone(hint) : null;
  // A hint that is not a real zone reads as UTC; it replaces a stored zone only when it really was 'UTC'.
  if (valid && (valid !== 'UTC' || hint === 'UTC') && valid !== user.retention_tz) {
    db.update('users', userId, { retention_tz: valid });
    return valid;
  }
  return schedule.validZone(user.retention_tz || 'UTC');
}

/** Today's local date for this learner. */
function today(userId, now = Date.now(), tz = null) {
  return schedule.localDate(now, tz || zoneFor(userId));
}

/** The learner's anchor date (their first study session's local date), or null before the first. */
function anchorOf(userId) {
  const user = db.byId('users', userId);
  return user && user.retention_anchor ? user.retention_anchor : null;
}

function view(s, now = Date.now()) {
  if (!s) return null;
  return {
    id: s.id,
    status: s.status,
    started_at: s.started_at,
    ended_at: s.ended_at || null,
    local_day: s.local_day,
    active_ms: Math.round(s.active_ms || 0),
    paused: s.status === 'paused',
    end_kind: s.end_kind || null,
    auto_started: !!s.auto_started,
    enforcer_id: s.enforcer_id || null,
    server_now: new Date(now).toISOString(),
  };
}

function openOf(userId) {
  return db.findOne('study_sessions', (s) => s.user_id === userId && (s.status === 'running' || s.status === 'paused')) || null;
}

/** Count the time since the last sign of activity (capped), and move the mark. */
function accrue(s, now) {
  if (s.status !== 'running') return s;
  const cap = params.load().idle_cap_ms;
  const last = Number(s.last_beat_ms) || now;
  const add = Math.max(0, Math.min(cap, now - last));
  return db.update('study_sessions', s.id, { active_ms: (s.active_ms || 0) + add, last_beat_ms: now, last_activity_at: new Date(now).toISOString() });
}

/**
 * Close a session. `kind`: 'session' | 'day' (the learner chose), 'idle' |
 * 'paused_timeout' (it ended by itself; the enforcer is offered on return).
 */
function close(s, kind, at, now = Date.now()) {
  const segs = (s.segments || []).map((g) => (g.end ? g : { ...g, end: new Date(at).toISOString() }));
  const row = db.update('study_sessions', s.id, { status: 'ended', ended_at: new Date(at).toISOString(), end_kind: kind, segments: segs });
  // eslint-disable-next-line global-require
  const enforcers = require('./enforcers');
  const enf = enforcers.onSessionEnded(s.user_id, row, { scope: kind === 'day' ? 'day' : 'session', auto: kind !== 'session' && kind !== 'day', now });
  if (enf) db.update('study_sessions', s.id, { enforcer_id: enf.id });
  return db.byId('study_sessions', s.id);
}

/** The open session, after ending one that has gone idle or stayed paused too long. */
function current(userId, now = Date.now()) {
  const s = openOf(userId);
  if (!s) return null;
  if (s.status === 'running' && now - (Number(s.last_beat_ms) || now) > idleEndMs()) {
    close(s, 'idle', Number(s.last_beat_ms) || now, now);
    return null;
  }
  if (s.status === 'paused') {
    const pausedAt = Date.parse(s.paused_at) || now;
    if (now - pausedAt > PAUSE_END_MS || today(userId, now) !== s.local_day) {
      close(s, 'paused_timeout', pausedAt, now);
      return null;
    }
  }
  return s;
}

/** Start a session (or return the open one). The first one sets the learner's anchor. */
function start(userId, { now = Date.now(), tz = null, auto = false } = {}) {
  const open = current(userId, now);
  if (open) return open;
  const zone = zoneFor(userId, tz);
  const day = schedule.localDate(now, zone);
  const user = db.byId('users', userId);
  if (user && !user.retention_anchor) db.update('users', userId, { retention_anchor: day, retention_tz: zone });
  return db.insert('study_sessions', {
    user_id: userId,
    status: 'running',
    started_at: new Date(now).toISOString(),
    ended_at: null,
    local_day: day,
    tz: zone,
    active_ms: 0,
    last_beat_ms: now,
    last_activity_at: new Date(now).toISOString(),
    segments: [{ start: new Date(now).toISOString(), end: null }],
    auto_started: !!auto,
    end_kind: null,
  });
}

/** A heartbeat or an answer: count the time, and resume a paused session on real work (`work`). */
function beat(userId, { now = Date.now(), work = false } = {}) {
  let s = current(userId, now);
  if (!s) return null;
  if (s.status === 'paused') {
    if (!work) return s;
    s = resume(userId, { now });
  }
  return accrue(s, now);
}

function pause(userId, { now = Date.now() } = {}) {
  const s = current(userId, now);
  if (!s || s.status !== 'running') return s;
  const after = accrue(s, now);
  const segs = (after.segments || []).map((g) => (g.end ? g : { ...g, end: new Date(now).toISOString() }));
  return db.update('study_sessions', s.id, { status: 'paused', paused_at: new Date(now).toISOString(), segments: segs });
}

function resume(userId, { now = Date.now() } = {}) {
  const s = current(userId, now);
  if (!s || s.status !== 'paused') return s;
  return db.update('study_sessions', s.id, {
    status: 'running',
    paused_at: null,
    last_beat_ms: now,
    segments: [...(s.segments || []), { start: new Date(now).toISOString(), end: null }],
  });
}

/** End the open session: kind 'session' (End session) or 'day' (End day session). */
function end(userId, { kind = 'session', now = Date.now() } = {}) {
  const s = current(userId, now);
  if (!s) return null;
  const counted = s.status === 'running' ? accrue(s, now) : s;
  return close(counted, kind === 'day' ? 'day' : 'session', now, now);
}

/**
 * Activity: an answer. Counts toward the open session, and starts one when
 * none is open and no enforcer is waiting (a deep link straight into a level
 * still has its time counted; while an enforcer waits, the learner is offered
 * it first and the work still counts toward the scheduled ones).
 */
function touch(userId, { now = Date.now() } = {}) {
  if (!enabled()) return null;
  try {
    const open = current(userId, now);
    if (open) return beat(userId, { now, work: true });
    // eslint-disable-next-line global-require
    const enforcers = require('./enforcers');
    if (enforcers.offers(userId, { now }).length) return null;
    return start(userId, { now, auto: true });
  } catch (err) {
    console.warn(`study session touch failed: ${err.message}`);
    return null;
  }
}

/** Sessions whose local day is in [fromDate, toDate] (dates inclusive). */
function inDays(userId, fromDate, toDate) {
  return db.find('study_sessions', (s) => s.user_id === userId && s.local_day >= fromDate && s.local_day <= toDate);
}

module.exports = {
  enabled, zoneFor, today, anchorOf, view, current, start, beat, pause, resume, end, touch, inDays, close, openOf, idleEndMs, PAUSE_END_MS,
};
