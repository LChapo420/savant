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
const uploadRetention = require('./upload-retention');
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
/**
 * What a learner did on a level everyone shares sits on that level's row: their typed answers (keyed "<id>:<check>") and per-block times. A
 * row with an owner goes with its owner; a shared row stays, so these are taken out of it.
 */
function clearFromSharedPlans(id) {
  const prefix = `${id}:`;
  let cleared = 0;
  for (const plan of db.find('block_plans', (p) => p && !p.user_id && (p.answers || p.telemetry))) {
    const answers = Object.fromEntries(Object.entries(plan.answers || {}).filter(([k]) => !k.startsWith(prefix)));
    const telemetry = { ...(plan.telemetry || {}) };
    const hadAnswers = Object.keys(answers).length !== Object.keys(plan.answers || {}).length;
    const hadTelemetry = telemetry[id] !== undefined;
    if (!hadAnswers && !hadTelemetry) continue;
    delete telemetry[id];
    db.update('block_plans', plan.id, { ...(plan.answers ? { answers } : {}), ...(plan.telemetry ? { telemetry } : {}) });
    cleared++;
  }
  return cleared;
}

function deleteAccount(user) {
  const id = user.id;
  const removed = {};
  const shared = clearFromSharedPlans(id);
  if (shared) removed.shared_plan_rows_cleared = shared;
  for (const name of consent.collectionNames()) {
    if (consent.SHARED.has(name)) continue;
    const n = db.remove(name, (r) => r && r.user_id === id);
    if (n) removed[name] = n;
  }
  for (const u of db.find('users', (x) => x.referred_by === id)) db.update('users', u.id, { referred_by: null });
  const files = uploadRetention.removeForUser(id);
  if (files) removed.spanish_upload_files = files;
  require('./spanish-study-tests').removeForUser(id);
  removed.users = db.remove('users', (u) => u.id === id);
  return removed;
}

module.exports = { enabled, refusal, deleteAccount, clearFromSharedPlans };
