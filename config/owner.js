/**
 * The owner's account: one address, asked in one place.
 *
 * `isOwner` is the helper every check uses (services/block-levels.js re-exports
 * it as `blockLevels.isOwner`). It lives here, with no dependencies, so the
 * config files that services/block-levels.js itself requires (base-lessons,
 * capabilities, subscriptions) and middleware/auth.js can use it without a
 * require cycle. OWNER_EMAIL overrides the address.
 *
 * `ownerBase` is the owner's rule (2026-10-24, curriculum-build/OWNER-BASE-VS-OPTIMIZED.md):
 * the owner gets the base product, nothing modified, and every other account gets
 * every modification. True for the owner unless OWNER_BASE=off (the owner is
 * then an ordinary learner) or the older ADAPT_OWNER=1 (the same, kept as an alias).
 * Safety and integrity rules (answer-key guards, security, grade bands, verified
 * content, the too-fast rule on checkpoints) never ask it.
 */
const DEFAULT_OWNER = 'the.landon.d@gmail.com';

function ownerEmail() {
  return String(process.env.OWNER_EMAIL || DEFAULT_OWNER).trim().toLowerCase();
}

function isOwner(user) {
  return !!(user && user.email && String(user.email).trim().toLowerCase() === ownerEmail());
}

/** A user row from a row or an id; null when there is none. */
function userOf(userOrId) {
  if (userOrId === null || userOrId === undefined) return null;
  if (typeof userOrId === 'object') return userOrId;
  try {
    // eslint-disable-next-line global-require
    return require('./db').byId('users', userOrId) || null;
  } catch {
    return null;
  }
}

/** Is the owner-base rule switched on? */
function baseRuleOn() {
  if (String(process.env.OWNER_BASE || 'on').toLowerCase() === 'off') return false;
  return process.env.ADAPT_OWNER !== '1';
}

/** Does this account (a row or an id) get the base product, unmodified? */
function ownerBase(userOrId) {
  if (!baseRuleOn()) return false;
  return isOwner(userOf(userOrId));
}

module.exports = { DEFAULT_OWNER, ownerEmail, isOwner, ownerBase, baseRuleOn, userOf };
