/**
 * Invite a friend: each adult-or-teen (standard) account has a share link
 * `/register?ref=CODE`. A sign-up that arrives with a valid code records who
 * invited it. There are no rewards: nothing here gives or costs money.
 *
 * Privacy (docs/yc/PRIVACY.md): the inviter sees only counts, never who joined.
 * Child accounts (under the age of digital consent) neither get a link nor are
 * recorded as invited, so no tie between minors is stored. A sign-up that is not
 * a standard account ignores the code.
 *
 * Storage: `referral_code` on the inviter's users row (made on first ask) and
 * `referred_by` (the inviter's user id) on the new row.
 */
const crypto = require('crypto');
const db = require('../config/db');

const ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz'; // no 0 1 i l o
const LENGTH = 8;
const CODE_RE = new RegExp(`^[${ALPHABET}]{${LENGTH}}$`);

const normCode = (c) => String(c || '').trim().toLowerCase();

function makeCode() {
  const bytes = crypto.randomBytes(LENGTH);
  let out = '';
  for (let i = 0; i < LENGTH; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

const canShare = (user) => !!user && user.account_type !== 'child';

/** The learner's code, made on first use. Null for an account that cannot share. */
function codeFor(user) {
  if (!canShare(user)) return null;
  if (user.referral_code && CODE_RE.test(user.referral_code)) return user.referral_code;
  let code;
  do code = makeCode(); while (db.findOne('users', (u) => u.referral_code === code));
  db.update('users', user.id, { referral_code: code });
  return code;
}

/** The inviter a code belongs to, or null. */
function resolve(code) {
  const c = normCode(code);
  if (!CODE_RE.test(c)) return null;
  const owner = db.findOne('users', (u) => u.referral_code === c);
  return canShare(owner) ? owner : null;
}

/** Record the inviter on a newly made account. Returns true when one was recorded. */
function attach(newUser, code) {
  if (!canShare(newUser) || !code) return false;
  const inviter = resolve(code);
  if (!inviter || inviter.id === newUser.id) return false;
  db.update('users', newUser.id, { referred_by: inviter.id });
  return true;
}

/** What the inviter may see: counts only. "Started" = answered a first question outside placement. */
function summary(user) {
  const invited = db.find('users', (u) => u.referred_by === user.id);
  const kindOf = new Map(db.all('sessions').map((s) => [s.id, s.kind]));
  const ids = new Set(invited.map((u) => u.id));
  const started = new Set();
  for (const it of db.all('items')) {
    if (!ids.has(it.user_id) || !it.answered_at || kindOf.get(it.session_id) === 'placement') continue;
    started.add(it.user_id);
  }
  return { joined: invited.length, started: started.size };
}

module.exports = { codeFor, resolve, attach, summary, canShare, normCode, CODE_RE };
