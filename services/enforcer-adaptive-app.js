/**
 * The app side of adaptive enforcer timing (ENFORCER_ADAPTIVE=on; the rule itself is services/enforcer-adaptive.js,
 * docs/ENFORCER-ADAPTIVE.md). Nothing here runs while the switch is off.
 *
 * A decided day is remembered by the enforcer row that speaks for it (its cover carries `adaptive: true`), so no new
 * collection: the last decided day is the latest such cover, and each window starts the day after it. The decision for
 * a day is made from the learner's studied material since then: each objective's predicted recall
 * (services/adaptation.js predictedRecall, the same number the enforcer ranks by) at the learner's next likely study day.
 */
const db = require('../config/db');
const schedule = require('./retention-schedule');
const adaptation = require('./adaptation');
const mastery = require('./mastery');
const core = require('./enforcer-adaptive');

const DAY = 24 * 3600 * 1000;

/** Days (from the anchor) of every adaptive cover the learner has, sorted. */
function decidedDays(userId) {
  const out = [];
  for (const e of db.forUser('enforcers', userId)) for (const c of e.covers || []) if (c.adaptive && Number.isInteger(c.day)) out.push(c.day);
  return out.sort((a, b) => a - b);
}

/** The adaptive covers' rows: [{ day, type, from_date, to_date }] (for the calendar's past days). */
function pastCovers(userId) {
  const seen = new Map();
  for (const e of db.forUser('enforcers', userId)) for (const c of e.covers || []) if (c.adaptive && !c.goal) seen.set(c.day, c);
  return seen;
}

/** Each unit's predicted recall x days from `now`, as the core wants it. */
function unitFns(units, recFor, userId, now) {
  return units.map((u) => {
    const ctx = recFor(u.track_id, u.grade_id);
    if (u.objective && ctx.rec) {
      const s = ctx.rec.report.states[u.oi];
      if (s && s.last_at) {
        const { m } = adaptation.memoryAdjust(ctx.rec.report.states);
        return { value: 1, recallIn: (x) => adaptation.predictedRecall(s, now + x * DAY, ctx.rec.curve, m) };
      }
    }
    const st = mastery.stateFor(userId, u.skill);
    const p0 = Math.max(0.05, Math.min(0.97, Number(st.mastery) || 0.5));
    return { value: 1, recallIn: (x) => p0 * (1 - 0.15 * Math.min(1, x / 7)) };
  });
}

/** The days (from the anchor) on which the learner answered work in the last 40 days, for their study rhythm. */
function studyDaysOf(E, userId, at) {
  const set = new Set();
  for (const r of E.windowItems(userId, { from_date: schedule.addDays(at.today, -40), to_date: at.today }, at.tz)) set.add(schedule.dayIndex(at.anchor, schedule.localDate(r.t, at.tz)));
  return [...set].sort((a, b) => a - b);
}

/** The state the decision (and the forecast) reads: units since the last decided day, as core units. */
function stateFor(E, userId, at, now, day, kept) {
  const days = decidedDays(userId);
  const last = days.length ? days[days.length - 1] : -1;
  const from = Math.max(0, last + 1);
  const win = { from_date: schedule.addDays(at.anchor, from), to_date: schedule.addDays(at.anchor, day) };
  const rows = E.windowItems(userId, win, at.tz);
  const { units, recFor } = E.unitsFrom(userId, rows);
  // the end of `day` is the clock for the decision; a later `now` only makes recall lower, so measure from now
  const fns = unitFns(units, recFor, userId, now);
  const look = core.lookahead(studyDaysOf(E, userId, at), day);
  return { last, from, win, ctx: { day, last, units: fns, look, kept }, rows: rows.length };
}

/**
 * The adaptive enforcer due for `day` (today with includeToday, else yesterday), as a cover like the calendar's, or null.
 * kept: the calendar types some subject's goal still keeps (none: nothing is adaptive).
 */
function cover(E, userId, at, now, { includeToday = false, kept }) {
  if (!core.on() || !kept || !kept.length) return null;
  const day = includeToday ? at.t : at.t - 1;
  if (day < 1) return null;
  const s = stateFor(E, userId, at, now, day, kept);
  if (s.last >= day || !s.rows) return null;
  const d = core.decide(s.ctx);
  if (!d.due) return null;
  return {
    type: d.type, day, date: schedule.addDays(at.anchor, day), from_date: s.win.from_date, to_date: s.win.to_date,
    adaptive: true, tier: d.tier, reason: d.reason, at_risk: d.count,
  };
}

/** The next few enforcer days as "about" dates: [{ day, date, type, about: true }]. */
function forecastDays(E, userId, at, now, kept, n = 3) {
  if (!core.on() || !kept || !kept.length) return [];
  const s = stateFor(E, userId, at, now, at.t, kept);
  return core.forecast(s.ctx, n).map((f) => ({
    day: at.t + f.offset, date: schedule.addDays(at.anchor, at.t + f.offset), type: f.type, about: true,
    window: { from_date: s.win.from_date, to_date: schedule.addDays(at.anchor, at.t + f.offset) },
  }));
}

module.exports = { cover, forecastDays, decidedDays, pastCovers };
