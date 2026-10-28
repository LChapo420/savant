/**
 * Who may do what beyond the ordinary path.
 *
 * One account can skip a question or a level. That is a deliberate exception
 * rather than a general privilege, so it lives here as a list of addresses that
 * can be read in a glance and changed in one line — not as a column on the user
 * row, which would put a data migration in front of a one-off decision, and not
 * as a query, which would make the rule something to look up rather than
 * something to read.
 *
 * The check is a constant, but it is only ever consulted server-side. `can_skip`
 * on the public user is how the browser learns it may offer the buttons; it
 * decides what to draw and nothing else, because the routes that do the work ask
 * the same question again. Hiding a button and refusing a request are separate
 * problems and only the second one is load-bearing.
 */
// The one account is the owner (config/owner.js; OWNER_EMAIL overrides the address).
const owner = require('./owner');

/** The one question this file answers. */
function canSkip(user) {
  if (!user) return false;
  return owner.isOwner(user);
}

/**
 * May this account read the whole curriculum, on every subject and every grade,
 * enrolled in it or not?
 *
 * Separate from `canSkip` because it answers a different question. Skipping is
 * about moving; this is about *looking*. An account that can skip can already
 * open a level far ahead, but only on a subject it has joined, and only within a
 * window around where it stands — so the other fifteen grades stayed invisible,
 * which is useless for anyone looking at how the product is built rather than
 * using it.
 *
 * The read is free of consequence: it marks nothing, advances nothing and grants
 * nothing. It is the difference between being shown the map and being given the
 * keys, and only one of those is being asked for here.
 */
function canBrowse(user) {
  if (!user) return false;
  return owner.isOwner(user);
}

module.exports = {
  /** The addresses that may skip and browse: the owner's, read now. */
  get SKIP_EMAILS() { return [owner.ownerEmail()]; },
  canSkip,
  canBrowse,
};
