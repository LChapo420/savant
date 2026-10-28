/**
 * Session lookup and the gate on private routes.
 */
const db = require('../config/db');
const holdout = require('../content/holdout');
const { canSkip, canBrowse } = require('../config/capabilities');
const { canEditLevels } = require('../config/subscriptions');
const uxFlags = require('../config/ux');
const streakService = require('../services/streak');

/** Attach the signed-in user to the request, if there is one. */
function attachUser(req, res, next) {
  req.user = null;
  if (req.session && req.session.userId) {
    const user = db.byId('users', req.session.userId);
    if (user) req.user = user;
    else req.session.destroy(() => {}); // the account is gone; the cookie should be too
  }
  // The rest of the request runs with this learner's held-back questions in force
  // (content/holdout.js); for everyone without any, this is just next().
  holdout.runAs(req.user && req.user.id, next);
}

/** 401 on API routes that require an account. */
function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Sign in to continue.' });
  next();
}

/**
 * The gate on skipping, which is one account's privilege and not a role.
 *
 * The 401 is checked here rather than left to `requireAuth` running first,
 * because an anonymous request has to be told it needs an account rather than
 * that it lacks a capability — and because this function is written to be
 * correct on its own, in case it is ever mounted without the one in front of it.
 *
 * 403 rather than 404: the learner is known and the thing they asked for is
 * real, they simply may not have it. Unlike ownership checks elsewhere, there is
 * nothing here to hide — the account is theirs.
 */
function requireSkip(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Sign in to continue.' });
  if (!canSkip(req.user)) return res.status(403).json({ error: 'Skipping is not available on this account.' });
  next();
}

/**
 * Strip the fields no client should see.
 *
 * The profile is optional and comes second because the subscription lives on it,
 * not on the user row. A caller that does not have the profile to hand omits it,
 * and `can_edit_levels` then reads false — which is the safe direction for a
 * capability that costs money: it is off unless something has said it is on, so
 * forgetting to pass the profile turns a paid feature off rather than giving it
 * away.
 *
 * @param {object|null} user
 * @param {object|null} [profile]
 */
/**
 * Who may open the admin panel: every learner's scorecard, learning-style
 * summary, interests and progress. Named by address in ADMIN_EMAILS (comma
 * separated), the owner by default. Asked here, on the server, every time; the
 * flag on the public user only decides whether the link is drawn.
 */
function adminEmails() {
  // eslint-disable-next-line global-require
  return String(process.env.ADMIN_EMAILS || require('../config/owner').ownerEmail())
    .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
}

function isAdmin(user) {
  return !!user && adminEmails().includes(String(user.email || '').trim().toLowerCase());
}

/** 404 rather than 403 for everyone else, so the admin area does not advertise itself. */
function requireAdmin(req, res, next) {
  if (!isAdmin(req.user)) return res.status(404).json({ error: 'No such endpoint.' });
  next();
}

/**
 * Is the streak and XP display switched off for this account? By the learner
 * (`hide_stats`) or by their parent (the consent's `settings.hide_stats`).
 * It hides numbers on screen only; nothing is counted differently.
 */
function statsHidden(user) {
  if (!uxFlags.on('UX_HIDE_STATS')) return { hidden: false, by_parent: false };
  const consent = user.consent_id ? db.byId('parental_consents', user.consent_id) : null;
  const byParent = !!(consent && consent.status === 'active' && consent.settings && consent.settings.hide_stats === true);
  return { hidden: byParent || user.hide_stats === true, by_parent: byParent };
}

function publicUser(user, profile) {
  if (!user) return null;
  const hide = statsHidden(user);
  return {
    id: user.id,
    email: user.email,
    display_name: user.display_name,
    xp: user.xp || 0,
    // The run as it stands today: a lapsed run reads 0 rather than a stale number
    // (services/streak.js; the owner and STREAK_LOCAL_GRACE=off keep the stored one).
    streak: streakService.current(user),
    // Engagement settings (config/ux.js): hide the streak and XP, turn the break
    // line off, the browser's time zone, the planned next session, and which of
    // the UX switches are on. None of them gates anything on the server.
    hide_stats: hide.hidden,
    hide_stats_by_parent: hide.by_parent,
    break_nudge_off: user.break_nudge_off === true,
    client_tz: user.client_tz || null,
    next_study: user.next_study || null,
    // The visual style the learner picked in Profile ("auto" until they do); see public/js/style-boot.js.
    style_pref: user.style_pref || 'auto',
    under_13: !!(user.age_check && user.age_check.under_13),
    ux: uxFlags.flagsFor(user),
    onboarded: !!user.onboarded,
    // Whether to draw the skip controls, and nothing more. The routes that act
    // on them ask canSkip again, so a client that ignores this gains nothing.
    can_skip: canSkip(user),
    // Whether to offer the whole-curriculum view, and nothing more. The route
    // that serves it asks canBrowse again, so this only decides whether to draw
    // a link. It grants no access to a subject, moves nothing, and marks nothing.
    can_browse: canBrowse(user),
    // Whether to draw the study session strip and the retention calendar link
    // (RETENTION_ENFORCERS; the routes answer 404 when it is off).
    retention: String(process.env.RETENTION_ENFORCERS || 'on').toLowerCase() !== 'off',
    // Whether levels are written for this learner, and nothing more. Same rule:
    // the routes that spend the money ask canEditLevels again, so this decides
    // what is drawn and never what is allowed. False for the owner by design.
    can_edit_levels: canEditLevels(user, profile),
    // Whether to draw the Admin link, and nothing more: every admin route asks
    // isAdmin again.
    is_admin: isAdmin(user),
    created_at: user.created_at,
  };
}

module.exports = {
  attachUser, requireAuth, requireSkip, requireAdmin, isAdmin, publicUser, canSkip, canBrowse, canEditLevels,
};
