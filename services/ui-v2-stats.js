/**
 * The learner's own minutes, day by day, for the phone's "Leaderboard and stats" tab under UI_V2 (docs/UI-V2.md). GET /api/ui2/stats, read only: it stores nothing.
 *
 * Each of the last seven days (the learner's own calendar days) is counted exactly as services/ui-v2-today.js counts today: the larger of the study timer's minutes and the
 * day's finished sittings (each capped at its CAP_MIN), so one minute is never counted twice and a sitting left open overnight can't fill a day. An abandoned sitting isn't counted.
 * Streak and XP are not here: the page has them from the signed-in user, with the learner's own hide setting.
 */
const db = require('../config/db');
const { CAP_MIN } = require('./ui-v2-today');

const DAY_MS = 86400000;

function weekFor(userId, now = Date.now()) {
  const schedule = require('./retention-schedule'); // eslint-disable-line global-require
  const tz = require('./study-sessions').zoneFor(userId); // eslint-disable-line global-require
  const today = schedule.localDate(now, tz);
  // Noon on the learner's date, stepped back a day at a time: never two of one date or a skipped one across a clock change.
  const noon = Date.parse(`${today}T12:00:00Z`);
  const dates = [6, 5, 4, 3, 2, 1, 0].map((i) => new Date(noon - i * DAY_MS).toISOString().slice(0, 10));
  const timer = Object.fromEntries(dates.map((d) => [d, 0]));
  const sittings = Object.fromEntries(dates.map((d) => [d, 0]));
  const dayOf = (iso) => { const t = Date.parse(iso || ''); return Number.isFinite(t) ? schedule.localDate(t, tz) : null; };
  for (const s of db.forUser('study_sessions', userId)) {
    const d = dayOf(s.started_at || s.created_at);
    if (d in timer) timer[d] += (Number(s.active_ms) || 0) / 60000;
  }
  for (const s of db.forUser('sessions', userId)) {
    if (!s.ended_at || s.abandoned) continue;
    const d = dayOf(s.started_at);
    const min = (Date.parse(s.ended_at) - Date.parse(s.started_at)) / 60000;
    if (d in sittings && min > 0) sittings[d] += Math.min(CAP_MIN, min);
  }
  const days = dates.map((date) => ({ date, minutes: Math.round(Math.max(timer[date], sittings[date])) }));
  return { today, days, week_minutes: days.reduce((sum, d) => sum + d.minutes, 0) };
}

function reply(req, res) {
  if (!req.user) return res.status(401).json({ error: 'Sign in first.' });
  res.setHeader('Cache-Control', 'no-store');
  return res.json(weekFor(req.user.id));
}

module.exports = { weekFor, reply };
