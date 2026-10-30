/**
 * The learner's engagement settings (config/ux.js; curriculum-build/evidence-article/05-engagement-ux-wellbeing.md).
 *
 *   POST /api/prefs   any of
 *     hide_stats   boolean   hide the streak and XP on screen (the learner's own switch;
 *                            a parent can also set it, routes/consent.js)
 *     break_nudge  boolean   false turns the break line in the study strip off
 *     tz           string    the browser's time zone, kept for the streak's local day
 *                            when the learner has no retention time zone yet
 *     next_study   object|null  { date: 'YYYY-MM-DD', time: 'HH:MM' }, the learner's own plan
 *                            for the next session, shown in the app. It sends nothing to
 *                            anyone: no email, no push, no message, whatever the age.
 *
 * Every value is checked and capped; an unknown key is ignored. The answer is the
 * public user, the same shape as /api/auth/me.
 */
const express = require('express');
const db = require('../config/db');
const uxFlags = require('../config/ux');
const schedule = require('../services/retention-schedule');
const streak = require('../services/streak');
const { requireAuth, publicUser } = require('../middleware/auth');
const learner = require('../services/learner');

const router = express.Router();

function realZone(tz) {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return null;
  const valid = schedule.validZone(tz);
  return valid === 'UTC' && tz !== 'UTC' ? null : valid;
}

/** A plan for the next session: a date from today to 60 days ahead, a time of day. */
function cleanPlan(plan, user, now = Date.now()) {
  if (!plan || typeof plan !== 'object') return null;
  const date = String(plan.date || '');
  const time = String(plan.time || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const today = schedule.localDate(now, streak.zoneOf(user));
  const ahead = schedule.dateNumber(date) - schedule.dateNumber(today);
  // One day of slack each way: the browser's "today" can differ from the stored zone's near midnight.
  if (!(ahead >= -1 && ahead <= 61)) return null;
  return { date, time, set_at: new Date(now).toISOString() };
}

const STYLE_IDS = ['auto', 'chunky', 'night', 'bento', 'editorial', 'desk', 'notebook'];

router.post('/prefs', requireAuth, (req, res) => {
  const body = req.body || {};
  const patch = {};
  if (body.hide_stats !== undefined) {
    if (typeof body.hide_stats !== 'boolean') return res.status(400).json({ error: 'hide_stats must be true or false.' });
    patch.hide_stats = body.hide_stats;
  }
  if (body.style !== undefined) {
    // The visual style (public/css/styles): "auto" or one of the ids js/style-boot.js knows.
    if (typeof body.style !== 'string' || !STYLE_IDS.includes(body.style)) return res.status(400).json({ error: 'That style does not exist.' });
    patch.style_pref = body.style;
  }
  if (body.break_nudge !== undefined) {
    if (typeof body.break_nudge !== 'boolean') return res.status(400).json({ error: 'break_nudge must be true or false.' });
    patch.break_nudge_off = !body.break_nudge;
  }
  if (body.tz !== undefined) {
    const zone = realZone(body.tz);
    if (zone && zone !== req.user.client_tz) patch.client_tz = zone;
  }
  if (body.next_study !== undefined) {
    if (!uxFlags.flagsFor(req.user).next_study_planner) return res.status(404).json({ error: 'No such endpoint.' });
    if (body.next_study === null) patch.next_study = null;
    else {
      const plan = cleanPlan(body.next_study, req.user);
      if (!plan) return res.status(400).json({ error: 'Pick a day from today to 60 days ahead, and a time.' });
      patch.next_study = plan;
    }
  }
  const user = Object.keys(patch).length ? db.update('users', req.user.id, patch) : req.user;
  res.json({ user: { ...publicUser(user, learner.getProfile(req.user.id)), ...require('./consent').publicConsent(user) } });
});

module.exports = router;
