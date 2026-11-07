/**
 * The beta comparison's arms: which learners get the tailored product and which get the base product, drawn at random, once, and kept.
 * docs/BETA-COMPARISON.md is the plain-language version; services/beta-compare.js reads the arms and writes the daily report.
 *
 * Arms
 *   tailored   today's app for a learner: scorecard-driven material, tutor depth, the speed levers when they are on.
 *   base       the base product, the same one the owner's account gets (config/owner.js ownerBase): the standard curriculum and lessons with no
 *              scorecard-driven tailoring, no per-learner brief for the tutor or the writers, and the speed levers off
 *              (services/efficiency.js forLearner). Pass marks, skip rules, the streak grace and the break nudge are NOT part of it: the base arm
 *              keeps them (config/owner.js ownerOnly), so it is the product without tailoring, never a worse one.
 *
 * Who is drawn. A learner is drawn at first use (services/../middleware/auth.js attachUser calls ensure) when ALL of these hold:
 *   - BETA_COMPARE=on (off by default until the owner approves; with it off everyone is tailored and nothing is reported);
 *   - the account is a real learner: not the owner, not a team, test or demo account (services/real-user-metrics.js classify);
 *   - the account has answered the age screen, and, below the country's age of consent, a parent has agreed to the optional measurement
 *     (consent scope measurement_extras; services/boosters.js allowed). A learner who is not drawn gets the ordinary product and is not
 *     measured: no extra measurement channel opens for an under-13 learner without a parent's agreement (docs/PRODUCT-DECISIONS.md).
 *
 * How. Stratified, permuted blocks. Learners are grouped by age band (under 13 / 13-17 / 18 and over) and the subject of their first enrolment.
 * For each group a block of BLOCK_SIZE slots is shuffled, with round(BETA_HOLDOUT_SHARE x BLOCK_SIZE) slots for the base arm (default share
 * 20%), and learners take the slots in order, so every group stays within one learner of the planned share at all times. The shuffle uses
 * crypto randomness; nothing about the learner (not their email, score or time of arrival) picks the arm.
 *
 * Never moved. The arm is written to the user row once (`user.beta_arm`) and nothing here changes it. Raising or lowering the holdout share
 * changes only blocks drawn afterwards. If a parent later withdraws the measurement agreement the learner stays in their arm (their product
 * does not change) and is left out of the report (services/beta-compare.js).
 */
const crypto = require('crypto');
const db = require('../config/db');
const owner = require('../config/owner');

const BLOCK_SIZE = 20;
const VERSION = 1;

let rng = (n) => crypto.randomInt(n); // uniform integer in [0, n); tests replace it
function setRandom(fn) { rng = fn || ((n) => crypto.randomInt(n)); }

const enabled = () => owner.betaCompareOn();

/** The planned share of learners in the base arm, 0 to 0.5 (BETA_HOLDOUT_SHARE, default 0.2). */
function share() {
  const v = process.env.BETA_HOLDOUT_SHARE === undefined || process.env.BETA_HOLDOUT_SHARE === '' ? 0.2 : Number(process.env.BETA_HOLDOUT_SHARE);
  return Number.isFinite(v) ? Math.min(0.5, Math.max(0, v)) : 0.2;
}

// eslint-disable-next-line global-require
const boosters = () => require('./boosters');
// eslint-disable-next-line global-require
const metrics = () => require('./real-user-metrics');

/** The age band the stratification and the report use. null when the age screen has not been answered. */
function bandOf(user) {
  const check = user && user.age_check;
  if (!check) return null;
  if (check.under_13) return 'under13';
  const age = Number.isFinite(Number(check.age_at_check)) ? Number(check.age_at_check) : boosters().ageOf(user);
  if (age === null || age === undefined || !Number.isFinite(age)) return null;
  if (age < 13) return 'under13';
  return age < 18 ? '13to17' : '18plus';
}

/** The subject of the learner's first enrolment ('none' before they have one). */
function subjectOf(userId) {
  const rows = db.forUser('enrollments', userId).slice();
  if (!rows.length) return 'none';
  rows.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || a.id - b.id);
  return String(rows[0].track_id || 'none');
}

/**
 * Why a learner is not drawn (and so not measured), or null when they may be. Also used by the report, which re-asks it at read time so
 * that a withdrawn agreement takes the learner out of the numbers.
 * @returns {string|null} 'off' | 'no_user' | 'not_a_real_learner' | 'age_not_answered' | 'needs_parent_agreement'
 */
function ineligibleReason(user) {
  if (!enabled()) return 'off';
  if (!user || !user.id) return 'no_user';
  if (owner.ownerOnly(user)) return 'not_a_real_learner';
  let group = 'real';
  try {
    const m = metrics();
    const consent = user.consent_id ? db.byId('parental_consents', user.consent_id) : null;
    group = m.classify(user, m.rules(), consent && consent.parent_email).group;
  } catch { group = 'real'; }
  if (group !== 'real') return 'not_a_real_learner';
  if (!user.age_check) return 'age_not_answered';
  if (!boosters().allowed(user)) return 'needs_parent_agreement';
  return null;
}

const stratumKey = (band, subject) => `${band}|${subject}`;

/** A shuffled block of arm slots: round(share x size) 'base' and the rest 'tailored' (Fisher-Yates on the injected random source). */
function newBlockSlots(planned, size = BLOCK_SIZE) {
  const nBase = Math.round(planned * size);
  const slots = Array.from({ length: size }, (_, i) => (i < nBase ? 'base' : 'tailored'));
  for (let i = slots.length - 1; i > 0; i--) {
    const j = rng(i + 1);
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  return slots;
}

/** Take the next slot of the stratum's open block, opening a fresh shuffled block when there is none. */
function nextSlot(stratum) {
  let block = db.findOne('beta_blocks', (b) => b.stratum === stratum && b.next < b.slots.length);
  if (!block) block = db.insert('beta_blocks', { stratum, share: share(), slots: newBlockSlots(share()), next: 0 });
  const arm = block.slots[block.next];
  db.update('beta_blocks', block.id, { next: block.next + 1 });
  return { arm, block_id: block.id, position: block.next };
}

/**
 * Draw this learner's arm if they have none and may have one. Idempotent: a learner who already has an arm is returned untouched, so a
 * learner is never moved. Cheap when there is nothing to do (called on every request).
 * @param {object} user a users row
 * @returns {object|null} user.beta_arm, or null when the learner is not in the comparison
 */
function ensure(user) {
  if (!user) return null;
  if (user.beta_arm) return user.beta_arm;
  if (!enabled() || !user.age_check) return null; // the cheap exits: switched off, or the age screen is not answered yet
  if (ineligibleReason(user)) return null;
  const band = bandOf(user);
  if (!band) return null;
  const subject = subjectOf(user.id);
  const stratum = stratumKey(band, subject);
  const slot = nextSlot(stratum);
  const record = {
    arm: slot.arm, stratum, band, subject, assigned_at: new Date().toISOString(), share: share(), block_id: slot.block_id, position: slot.position, v: VERSION,
  };
  db.update('users', user.id, { beta_arm: record });
  return user.beta_arm;
}

/** 'tailored', 'base', or null (not in the comparison, or the comparison is off). */
function armOf(userOrId) {
  if (!enabled()) return null;
  const user = owner.userOf(userOrId);
  return user && user.beta_arm ? user.beta_arm.arm : null;
}

/** Is this learner in the base arm (and the comparison on)? */
function isBase(userOrId) { return owner.holdoutBase(userOrId); }

module.exports = {
  BLOCK_SIZE, VERSION, enabled, share, bandOf, subjectOf, ineligibleReason, stratumKey, newBlockSlots, ensure, armOf, isBase, setRandom,
};
