/**
 * Delete your own account (docs/yc/PRIVACY.md gap 4: the policy promises deletion, and until now only a
 * parent could delete a child's). Removes the users row and every row tied to the account in every
 * learner collection (the same list the parent's deletion and the data export use), and clears the
 * `referred_by` tie on anyone this account invited. Nothing is kept: no stub, no hash of the email.
 *
 * Who may not use it: child accounts (a parent deletes those, with the consent record handled in
 * routes/consent.js) and the owner/admin address (deleting it would hand the admin role to whoever
 * registers that email next; see PRIVACY.md gap 9). ACCOUNT_DELETE=off turns it off.
 */
const db = require('../config/db');
const consent = require('../routes/consent');
const { isAdmin } = require('../middleware/auth');

function enabled() {
  return String(process.env.ACCOUNT_DELETE || '').trim().toLowerCase() !== 'off';
}

/** null when this account may delete itself, else the reason, in words for the learner. */
function refusal(user) {
  if (!enabled()) return 'Account deletion is switched off on this server. Email us and we will delete it by hand.';
  if (user.account_type === 'child') return 'A parent deletes a child account, from the parent page.';
  if (isAdmin(user)) return 'The owner account cannot be deleted here.';
  return null;
}

/** Remove the account and its rows. Returns how many rows went from each collection. */
function deleteAccount(user) {
  const id = user.id;
  const removed = {};
  for (const name of consent.collectionNames()) {
    if (consent.SHARED.has(name)) continue;
    const n = db.remove(name, (r) => r && r.user_id === id);
    if (n) removed[name] = n;
  }
  for (const u of db.find('users', (x) => x.referred_by === id)) db.update('users', u.id, { referred_by: null });
  removed.users = db.remove('users', (u) => u.id === id);
  return removed;
}

module.exports = { enabled, refusal, deleteAccount };
