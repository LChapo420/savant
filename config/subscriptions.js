/**
 * Who gets their levels rewritten for them.
 *
 * The per-user level editor is the first thing in this app that costs real money
 * per learner per day, so it is the first feature that needs a tier to hang on. It
 * is also the first that has to be *withheld from the owner*, which is the opposite
 * of every other capability here.
 *
 * There is no billing and no subscription table. The tier is a field a learner
 * picks on their own profile, which is a testing arrangement rather than a model of
 * anything: when billing arrives it will write the same field, and everything that
 * reads it keeps working.
 */
const owner = require('./owner');

/** The tiers the profile offers. `standard` is the default and the fallback. */
const TIERS = ['standard', 'pro', 'school'];

/**
 * Which tiers have levels rewritten for them.
 *
 * `school` is here from the start rather than being added later, because the tier
 * exists and a tier that grants nothing is a tier that has never been exercised.
 * What separates school from pro beyond this is not decided yet, so for now it is
 * the same thing under a different name — and the honest way to say that is to give
 * it the same list rather than to write a second branch that does nothing.
 */
const EDITING_TIERS = ['pro', 'school'];

/**
 * May this account have levels rewritten for it?
 *
 * The owner is excluded deliberately. This account is the one that reads the raw
 * generated pages while building them, and a silently rewritten page would make it
 * impossible to tell a base page from a tailored one — which is the whole of what
 * the owner is looking at. Excluding it also means the exclusion is tested by every
 * single session, rather than being a branch nobody runs.
 *
 * The tier lives on the learner profile, not the user row, so the profile is a
 * second argument. A missing profile reads as `standard`, which is the safe
 * direction: the feature is off unless something has said it is on.
 *
 * @param {{email: string}|null} user
 * @param {{subscription?: string}|null} [profile]
 * @returns {boolean}
 */
function canEditLevels(user, profile) {
  if (!user || !user.email) return false;
  if (owner.isOwner(user)) return false;
  // Tester phase (owner, 2026-10-25): every tester gets levels written for them,
  // whatever tier is picked. TESTER_TAILORING=off goes back to the tier deciding.
  if (testerTailoring()) return true;
  const tier = (profile && profile.subscription) || 'standard';
  return EDITING_TIERS.includes(tier);
}

/** Is the tester-phase rule on (every non-owner account tailored)? On by default. */
function testerTailoring() {
  return String(process.env.TESTER_TAILORING || 'on').toLowerCase() !== 'off';
}

/**
 * May this account choose a tier?
 *
 * Everyone, for now. It becomes a billing question, and until there is billing a
 * learner changing their own tier is the only way to exercise the feature at all.
 * It stays a function rather than being assumed, because the day it stops being
 * true it should be one line to change and one place to look.
 *
 * @param {{email: string}|null} user
 * @returns {boolean}
 */
function canSetSubscription(user) {
  return !!user;
}

/** Is this one of the tiers we accept? Used by the route that saves it. */
function isTier(value) {
  return TIERS.includes(String(value || '').trim());
}

module.exports = {
  get OWNER() { return owner.ownerEmail(); },
  TIERS, EDITING_TIERS, canEditLevels, canSetSubscription, isTier, testerTailoring,
};
