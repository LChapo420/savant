/**
 * Has the learner met today's chosen minutes? For Home's "Done for today" under UI_V2 (docs/UI-V2.md). GET /api/ui2/today, read only: it stores nothing and the plan is not touched.
 *
 * The plan (services/daily-plan.js) fills the chosen minutes again after each sitting and has no notion of done, so this counts the time apart from it:
 *   timer     today's minutes on the study timer (study_sessions active_ms, as My stats counts them)
 *   sittings  today's finished sittings, from start to end, each capped at CAP_MIN so a sitting left open overnight or over lunch can't fill the day
 * The larger of the two is the time spent: the timer runs over the sittings, so adding them would count one minute twice. An abandoned sitting isn't counted.
 * What it can't see: a lesson page read with no timer running leaves no time here.
 */
const db = require('../config/db');

const CAP_MIN = 45;

function spentToday(userId, now = Date.now()) {
  const schedule = require('./retention-schedule'); // eslint-disable-line global-require
  const tz = require('./study-sessions').zoneFor(userId); // eslint-disable-line global-require
  const today = schedule.localDate(now, tz);
  const isToday = (iso) => { const t = Date.parse(iso || ''); return Number.isFinite(t) && schedule.localDate(t, tz) === today; };
  let timer = 0;
  for (const s of db.forUser('study_sessions', userId)) if (isToday(s.started_at || s.created_at)) timer += (Number(s.active_ms) || 0) / 60000;
  let sittings = 0;
  for (const s of db.forUser('sessions', userId)) {
    if (!isToday(s.started_at) || !s.ended_at || s.abandoned) continue;
    const min = (Date.parse(s.ended_at) - Date.parse(s.started_at)) / 60000;
    if (min > 0) sittings += Math.min(CAP_MIN, min);
  }
  return { date: today, spent: Math.round(Math.max(timer, sittings)) };
}

function todayFor(userId, now = Date.now()) {
  const goal = require('./daily-plan').savedMinutes(userId); // eslint-disable-line global-require
  const { date, spent } = spentToday(userId, now);
  return { date, spent, goal, done: spent >= goal };
}

function reply(req, res) {
  if (!req.user) return res.status(401).json({ error: 'Sign in first.' });
  res.setHeader('Cache-Control', 'no-store');
  return res.json(todayFor(req.user.id));
}

module.exports = { todayFor, spentToday, reply, CAP_MIN };
