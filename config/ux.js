/**
 * Switches for the engagement and UX changes of 2026-10-25
 * (curriculum-build/evidence-article/05-engagement-ux-wellbeing.md; recorded in
 * curriculum-build/LIVE-CHANGES-2026-10-24.md). Each is on by default and turns
 * off with `=off`:
 *
 *   STREAK_LOCAL_GRACE       the streak counts the learner's own calendar day and
 *                            forgives one missed day a week (services/streak.js)
 *   BREAK_NUDGE              a dismissible break line in the study strip after
 *                            long continuous study (public/js/study.js)
 *   UX_TOUCH44               44 px targets on every coarse pointer (style.css)
 *   UX_HIDE_STATS            the "show my streak and XP" setting (learner, parent)
 *   UX_STYLE_COPY            learning-style copy that does not promise matching
 *   UX_TOAST_STAY            error toasts stay until dismissed
 *   UX_REPORT_DIALOG         "Report a problem" asks in an accessible dialog
 *   UX_NEXT_STUDY_PLANNER    "When will you study next?" (in-app only)
 *
 * The owner's account keeps the base product (config/owner.js): the three that
 * change what a learner is shown or counted (streak, break nudge, planner) do not
 * apply to it. The others are accessibility and wording fixes and do.
 * The browser is told the result for the signed-in user as `user.ux`
 * (middleware/auth.js), and reads nothing else.
 */
const owner = require('./owner');

function on(name) {
  return String(process.env[name] || 'on').trim().toLowerCase() !== 'off';
}

/** Minutes of unbroken study before the break line shows. */
function breakAfterMin() {
  const v = Number(process.env.BREAK_NUDGE_MIN);
  return Number.isFinite(v) && v >= 5 && v <= 180 ? Math.round(v) : 25;
}

/** What the browser is told for a user row. */
function flagsFor(user) {
  const base = owner.ownerBase(user);
  return {
    streak_local_grace: on('STREAK_LOCAL_GRACE') && !base,
    break_nudge: on('BREAK_NUDGE') && !base,
    break_after_min: breakAfterMin(),
    touch44: on('UX_TOUCH44'),
    hide_stats_setting: on('UX_HIDE_STATS'),
    style_copy: on('UX_STYLE_COPY'),
    toast_stay: on('UX_TOAST_STAY'),
    report_dialog: on('UX_REPORT_DIALOG'),
    next_study_planner: on('UX_NEXT_STUDY_PLANNER') && !base,
  };
}

module.exports = { on, breakAfterMin, flagsFor };
