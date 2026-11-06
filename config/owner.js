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

/** Does this account (a row or an id) get the base product because it is the owner's? Only the owner; the beta holdout is not asked here. */
function ownerOnly(userOrId) {
  if (!baseRuleOn()) return false;
  return isOwner(userOf(userOrId));
}

/** Is the built-in beta comparison (services/beta-arm.js, docs/BETA-COMPARISON.md) switched on? BETA_COMPARE=off is the kill switch. */
function betaCompareOn() {
  // Off until the owner approves the beta terms and the base arm's features (BETA_COMPARE=on starts it).
  return String(process.env.BETA_COMPARE || 'off').trim().toLowerCase() === 'on';
}

/**
 * Is this account in the beta comparison's base (holdout) arm? The arm is stored on the user row once, at first use, and never changes
 * (services/beta-arm.js). Reading it here costs one property lookup, so this stays dependency-free.
 */
function holdoutBase(userOrId) {
  if (!betaCompareOn()) return false;
  const user = userOf(userOrId);
  return !!(user && user.beta_arm && user.beta_arm.arm === 'base');
}

/**
 * Does this account (a row or an id) get the base product, unmodified? The owner's account, and learners drawn into the beta comparison's
 * base arm: they get exactly what the owner's account gets (the standard curriculum and lessons, no scorecard-driven tailoring), so
 * "tailored vs base" compares the product with and without tailoring. Checks that are not tailoring (pass marks and skip rules,
 * the streak grace, the break nudge) ask `ownerOnly` instead, so the base arm keeps them: nobody in it gets a worse product.
 */
function ownerBase(userOrId, skillId) {
  if (ownerOnly(userOrId) || holdoutBase(userOrId)) return true;
  // The speed proof's optional plain-way arm (services/speed-proof.js): a skill drawn for it is taught as the base product, for that skill only.
  try { if (require('../services/speed-proof').plainNowFor(userOrId)) return true; } catch { /* not loaded */ } // eslint-disable-line global-require
  if (skillId) {
    try { const u = userOf(userOrId); return !!(u && require('../services/speed-proof').normalFor(u.id, skillId)); } catch { return false; } // eslint-disable-line global-require
  }
  return false;
}

/**
 * The owner's own learner account(s) (2026-11-02: landon@savantedu.com, an ordinary learner with every modification). Kept apart
 * from everyone else and from scripts and tests in the cost tracker and services/my-stats.js, so its numbers are its own.
 * OWNER_LEARNER_EMAILS (comma-separated) overrides.
 */
function ownerLearnerEmails() {
  return String(process.env.OWNER_LEARNER_EMAILS || 'landon@savantedu.com').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
}

function isOwnerLearner(user) {
  return !!(user && user.email && ownerLearnerEmails().includes(String(user.email).trim().toLowerCase()));
}

module.exports = { DEFAULT_OWNER, ownerEmail, isOwner, ownerLearnerEmails, isOwnerLearner, ownerBase, ownerOnly, holdoutBase, betaCompareOn, baseRuleOn, userOf };
