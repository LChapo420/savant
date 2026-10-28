/**
 * The age screen and verifiable parental consent.
 *
 * Built from curriculum-build/KIDS-CAMERA-MIC-PRIVACY.md (recommendation option 2,
 * the data-flow contract in section 6, the copy in section 7) and the product
 * decision "under 13: parent/guardian-linked". Why each choice was made, and what
 * a lawyer has to confirm, is in curriculum-build/KIDS-CONSENT-IMPLEMENTATION.md.
 *
 * The shape:
 *
 *   1. A neutral age screen before any account details: month and year of birth
 *      and country, no default answer, nothing that says which answer "passes".
 *      The first answer in a browser session is the one that counts, so going
 *      back and picking an older year changes nothing (FTC FAQ D.7).
 *   2. At or above the country's age of digital consent: a normal account.
 *      Below it: a child account with no child email (a username instead), the
 *      parent's email, and a consent request emailed to the parent.
 *   3. The parent opens the link, reads the notice (with the camera and
 *      microphone paragraph), and agrees or declines. Agreeing makes a parent
 *      account. Method: "email plus" (16 CFR 312.5(b)(2)(vi)): the email link,
 *      plus a delayed confirmation email a day later that repeats how to revoke.
 *      Email plus is allowed only when the child's data is not disclosed, so it
 *      covers the account, the learning record and the on-device camera and
 *      microphone, and nothing that sends the child's own words to an outside
 *      AI. Those two opt-ins (outside AI processing, AI training) are separate,
 *      unticked, and only take effect after a signed consent form (method
 *      312.5(b)(2)(i)) is checked by the operator.
 *   4. Until consent, and for whatever consent does not cover, the child account
 *      is limited: camera and microphone are switched off by Permissions-Policy
 *      (the browser refuses getUserMedia; every camera and mic block has a tap or
 *      on-screen-key fallback), and the endpoints that send the child's free
 *      text or recordings to an outside model refuse.
 *   5. Parents sign in to review the data, download it, turn camera and mic off,
 *      change the opt-ins, revoke consent (the account locks), and delete the
 *      child's account and data.
 *
 * Retention (also in public/privacy.html): a request nobody answers is deleted
 * with the child's account after CONSENT_PENDING_DAYS (14); a revoked account is
 * deleted after CONSENT_REVOKED_DAYS (30) unless consent is given again; a parent
 * deletion is immediate. What stays afterwards is a consent stub: dates, method,
 * notice version and a hash of the parent's email, no child data.
 */
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const mailer = require('../utils/mailer');
const { limit } = require('../utils/rate-limit');
const { isAdmin } = require('../middleware/auth');

const router = express.Router();

// ── versions and settings ────────────────────────────────────────────────────

/** Bump when the parent notice text in public/parent-consent.html changes. The
 *  page sends the version it showed; a mismatch is refused, so a record always
 *  names the words the parent actually read. */
const NOTICE_VERSION = '2026-10-22.1';
/** Bump when public/privacy.html changes in substance. */
const POLICY_VERSION = '2026-10-22.1';
/** The age screen itself, so a later change to its wording can be told apart. */
const SCREEN_VERSION = '2026-10-22.1';

const DAY = 24 * 3600 * 1000;
const PENDING_DAYS = () => Number(process.env.CONSENT_PENDING_DAYS || 14);
const REVOKED_DAYS = () => Number(process.env.CONSENT_REVOKED_DAYS || 30);
const CONFIRM_DELAY_MS = () => Number(process.env.CONSENT_CONFIRM_DELAY_HOURS || 24) * 3600 * 1000;
/** 'limited' (default, the owner's choice): a child can use the tap-only parts
 *  while the request waits. 'locked': nothing until a parent agrees, the stricter
 *  reading of 312.5(c)(1) in the research doc, section 7A. */
const PENDING_ACCESS = () => (process.env.CONSENT_PENDING_ACCESS === 'locked' ? 'locked' : 'limited');

/**
 * Ages of digital consent, from the research doc: US 13 (COPPA); GDPR Art. 8 as
 * the member states set it (UK, Denmark, Sweden 13; Spain, Italy 14; France 15;
 * Germany, Netherlands 16). Every other country takes the GDPR default of 16,
 * which is the strictest age the doc lists: asking for a parent too often is a
 * nuisance, asking too rarely is the violation.
 */
const CONSENT_AGE = { US: 13, GB: 13, DK: 13, SE: 13, ES: 14, IT: 14, FR: 15, DE: 16, NL: 16 };
const DEFAULT_CONSENT_AGE = 16;

/** The countries offered on the screen, alphabetical, with "Another country" last.
 *  Listed because they are named in the research doc or are likely early markets;
 *  any country not here is "Another country" and takes the default age. */
const COUNTRIES = [
  ['AU', 'Australia'], ['AT', 'Austria'], ['BE', 'Belgium'], ['BR', 'Brazil'], ['CA', 'Canada'],
  ['DK', 'Denmark'], ['FR', 'France'], ['DE', 'Germany'], ['IN', 'India'], ['IE', 'Ireland'],
  ['IT', 'Italy'], ['MX', 'Mexico'], ['NL', 'Netherlands'], ['NZ', 'New Zealand'], ['PL', 'Poland'],
  ['PT', 'Portugal'], ['ES', 'Spain'], ['SE', 'Sweden'], ['CH', 'Switzerland'],
  ['GB', 'United Kingdom'], ['US', 'United States'],
].map(([code, name]) => ({ code, name })).concat([{ code: 'OTHER', name: 'Another country' }]);
const COUNTRY_CODES = new Set(COUNTRIES.map((c) => c.code));

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const USERNAME = /^[a-z0-9][a-z0-9_.-]{2,23}$/;

/**
 * A real bcrypt hash of nothing anyone knows, compared against when an account
 * does not exist. bcryptjs answers at once for a malformed hash (the old
 * placeholder was 66 characters, not 60), so a missing account answered in about
 * a millisecond and a real one in about seventy: which emails and usernames exist
 * could be read off the clock (security review 2026-10-24, finding 4).
 */
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 10);

const sha256 = (text) => crypto.createHash('sha256').update(String(text)).digest('hex');
const nowIso = () => new Date().toISOString();
const normEmail = (raw) => String(raw || '').trim().toLowerCase();

let noticeHash = null;
/** The SHA-256 of the consent page as served, recorded with each consent. */
function noticeFileHash() {
  if (noticeHash) return noticeHash;
  try {
    noticeHash = sha256(fs.readFileSync(path.join(__dirname, '..', 'public', 'parent-consent.html'), 'utf8'));
  } catch { noticeHash = null; }
  return noticeHash;
}

function maskEmail(email) {
  const [local, domain] = String(email || '').split('@');
  if (!domain) return '';
  return `${local.slice(0, 1)}${'*'.repeat(Math.max(1, Math.min(6, local.length - 1)))}@${domain}`;
}

/**
 * Where the links in a parent's email point. Without APP_ORIGIN the only source
 * is the request's Host header, which whoever sends the request chooses: a
 * child sign-up sent with `Host: savant-login.example` made Savant itself email
 * a real parent a consent link to that site, where the parent is asked to set a
 * password (security review 2026-10-24, finding 6). So the Host is used only for
 * this machine (local development and the tests) or an origin listed in
 * ALLOWED_ORIGINS; anywhere else APP_ORIGIN must be set, and until it is the
 * email is not sent (the child is told, and can send it again later).
 */
const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
function originOf(req) {
  if (process.env.APP_ORIGIN) return process.env.APP_ORIGIN.replace(/\/$/, '');
  const origin = `${req.protocol}://${req.get('host')}`;
  const listed = String(process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
  if (listed.includes(origin) || LOOPBACK.has(String(req.hostname || '').toLowerCase())) return origin;
  throw new Error('APP_ORIGIN is not set, so a link built from this request\'s Host header cannot be trusted');
}

// ── the age screen ───────────────────────────────────────────────────────────

/**
 * The youngest the person could be, given a month and year of birth: the birthday
 * is taken as the last day of the month, so a child born this month is not yet
 * counted a year older. Rounding toward younger sends a borderline case to a
 * parent, which is the safe direction.
 */
function minimumAge(year, month, now = new Date()) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  return y - year - (m <= month ? 1 : 0);
}

/**
 * Check an age-screen answer and say which way it goes. Never says what the
 * threshold is: the screen must not teach a child which year to pick.
 *
 * @returns {{ error: string } | { check: object }}
 */
function evaluateAge(body, now = new Date()) {
  const year = Number(body && body.birth_year);
  const month = Number(body && body.birth_month);
  const country = String((body && body.country) || '').toUpperCase();
  const thisYear = now.getUTCFullYear();
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12
      || year < thisYear - 120 || year > thisYear) {
    return { error: 'Choose the month and year you were born.' };
  }
  if (year === thisYear && month > now.getUTCMonth() + 1) return { error: 'Choose the month and year you were born.' };
  if (!COUNTRY_CODES.has(country)) return { error: 'Choose the country you live in.' };
  const consentAge = CONSENT_AGE[country] || DEFAULT_CONSENT_AGE;
  const age = minimumAge(year, month, now);
  return {
    check: {
      country,
      birth_ym: `${year}-${String(month).padStart(2, '0')}`,
      age_at_check: age,
      consent_age: consentAge,
      needs_parent: age < consentAge,
      under_13: age < 13,
      checked_at: now.toISOString(),
      screen_version: SCREEN_VERSION,
    },
  };
}

/** The age-screen answer held for this browser session, if one was given in the last day. */
function screenFromSession(req) {
  const held = req.session && req.session.age_screen;
  if (!held || !held.checked_at) return null;
  if (Date.now() - Date.parse(held.checked_at) > DAY) return null;
  return held;
}

// ── consent records ──────────────────────────────────────────────────────────

function newToken() {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, hash: sha256(token) };
}

function addHistory(consent, event, by, detail) {
  const history = Array.isArray(consent.history) ? consent.history.slice() : [];
  history.push({ at: nowIso(), event, by, ...(detail ? { detail } : {}) });
  return history;
}

/** An opt-in is in force only once its stronger method has been checked. */
function scopeActive(consent, scope) {
  const s = consent && consent.scopes && consent.scopes[scope];
  return !!(s && s.active);
}

function blankScopes() {
  return {
    // Covered by the base consent (email plus): internal use only.
    account_and_learning: { active: false },
    camera_mic_on_device: { active: false },
    // Disclosures: separate, unticked, and not in force until a signed form is checked.
    third_party_ai: { requested: false, active: false, method: null, requested_at: null, verified_at: null },
    ai_training: { requested: false, active: false, method: null, requested_at: null, verified_at: null },
  };
}

async function sendRequestEmail(req, consent, child, token) {
  const link = `${originOf(req)}/parent-consent?token=${encodeURIComponent(token)}`;
  const days = PENDING_DAYS();
  return mailer.send({
    to: consent.parent_email,
    tag: 'consent-request',
    subject: `${child.display_name} wants to use Savant: please read and decide`,
    text: [
      'Hello,',
      '',
      `Someone signing up to Savant, a learning app, as "${child.display_name}" gave this email address as their parent or guardian.`,
      'Because of their age, Savant needs a parent or guardian to agree before their account can be used in full.',
      '',
      'Read what Savant collects and decide here (the link works once and for the next 14 days):',
      link,
      '',
      'If you do nothing, the account and this email address are deleted after ' + days + ' days.',
      'If you do not know who this is, you can ignore this email or open the link and choose "Do not agree", which deletes the account now.',
      '',
      'Savant privacy policy: ' + `${originOf(req)}/privacy`,
    ].join('\n'),
  });
}

/**
 * Create (or refresh) the pending consent request for a child account and email
 * the parent. Used at sign-up and when an existing account answers the age
 * screen as under its country's consent age.
 */
async function requestConsent(req, child, parentEmail) {
  const email = normEmail(parentEmail);
  const { token, hash } = newToken();
  const expires = new Date(Date.now() + PENDING_DAYS() * DAY).toISOString();
  let consent = child.consent_id ? db.byId('parental_consents', child.consent_id) : null;
  if (consent && consent.status === 'pending') {
    consent = db.update('parental_consents', consent.id, {
      parent_email: email,
      token_hash: hash,
      expires_at: expires,
      resends: (consent.resends || 0) + 1,
      history: addHistory(consent, 'request_resent', 'child', { to: maskEmail(email) }),
    });
  } else {
    consent = db.insert('parental_consents', {
      child_user_id: child.id,
      parent_email: email,
      parent_id: null,
      status: 'pending',
      token_hash: hash,
      requested_at: nowIso(),
      expires_at: expires,
      resends: 0,
      notice_version: null,
      policy_version: null,
      granted: null,
      scopes: blankScopes(),
      settings: { camera_mic_off: false },
      confirmation: { due_at: null, sent_at: null },
      revoked_at: null,
      deleted_at: null,
      history: [{ at: nowIso(), event: 'requested', by: 'child', detail: { to: maskEmail(email) } }],
    });
    db.update('users', child.id, { consent_id: consent.id });
  }
  const sent = await sendRequestEmail(req, consent, child, token);
  return { consent, sent };
}

/**
 * What a signed-in learner may do, from their age check and their consent.
 *
 *   full       at or over their country's consent age
 *   needs_age  an account from before the age screen: asked on the next page
 *   pending    under the consent age, waiting for a parent
 *   active     a parent agreed (email plus); outside-AI only with its opt-in
 *   revoked    a parent withdrew consent: locked until they give it again
 */
function access(user) {
  if (!user) return null;
  const check = user.age_check;
  if (!check) return { state: 'needs_age', locked: false, camera_mic: false, ai_free_text: false };
  if (!check.needs_parent) return { state: 'full', locked: false, camera_mic: true, ai_free_text: true };
  const consent = user.consent_id ? db.byId('parental_consents', user.consent_id) : null;
  if (!consent || consent.status === 'pending') {
    return { state: 'pending', locked: PENDING_ACCESS() === 'locked', camera_mic: false, ai_free_text: false };
  }
  if (consent.status === 'active') {
    return {
      state: 'active',
      locked: false,
      camera_mic: !(consent.settings && consent.settings.camera_mic_off),
      ai_free_text: scopeActive(consent, 'third_party_ai'),
    };
  }
  return { state: 'revoked', locked: true, camera_mic: false, ai_free_text: false };
}

/** The part of the account's consent state the browser is told, for /me. */
function publicConsent(user) {
  if (!user) return {};
  const a = access(user);
  const consent = user.consent_id ? db.byId('parental_consents', user.consent_id) : null;
  const check = user.age_check;
  return {
    username: user.username || null,
    account_type: user.account_type || (check && check.needs_parent ? 'child' : 'standard'),
    age_needed: a.state === 'needs_age',
    // The kids variant of the design (App.applyAudience) for learners under 13.
    ...(check && check.under_13 ? { audience: 'kids' } : {}),
    consent: {
      state: a.state,
      locked: a.locked,
      camera_mic: a.camera_mic,
      ai_free_text: a.ai_free_text,
      parent_email: consent && consent.status === 'pending' ? maskEmail(consent.parent_email) : null,
      has_request: !!(consent && consent.status === 'pending'),
      expires_at: consent && consent.status === 'pending' ? consent.expires_at : null,
    },
  };
}

// ── deletion ─────────────────────────────────────────────────────────────────

/** Collections that hold no learner's rows (shared content), or are handled apart. */
const SHARED = new Set(['users', 'content_cache', 'placement_question_sets', 'fact_pools', 'parents', 'parental_consents']);

/**
 * Delete a child's account and every row tied to it, and reduce the consent
 * record to a stub (dates, method, notice version, hashed parent email).
 */
function deleteChild(consent, reason, by) {
  const childId = consent.child_user_id;
  const removed = {};
  for (const name of collectionNames()) {
    if (SHARED.has(name)) continue;
    const n = db.remove(name, (r) => r && r.user_id === childId);
    if (n) removed[name] = n;
  }
  removed.users = db.remove('users', (u) => u.id === childId);
  const stub = {
    status: reason === 'expired' ? 'expired' : reason === 'declined' ? 'declined' : 'deleted',
    parent_email: null,
    parent_email_sha256: consent.parent_email ? sha256(consent.parent_email) : consent.parent_email_sha256 || null,
    token_hash: null,
    deleted_at: nowIso(),
    deletion_reason: reason,
    deletion_requested_at: reason === 'parent_request' ? nowIso() : consent.deletion_requested_at || null,
    child_summary: null,
    history: addHistory(consent, 'deleted', by, { reason, rows: removed }),
  };
  db.update('parental_consents', consent.id, stub);
  return removed;
}

/**
 * Every collection that can hold a learner's rows. config/db does not export its
 * list, so the known names are probed (an unknown name throws in db.all). A
 * collection added later with a `user_id` column must be added here, and
 * scripts/consent-test.js fails when the store has one this list lacks.
 */
const KNOWN_COLLECTIONS = [
    'users', 'enrollments', 'skill_states', 'profiles', 'sessions', 'items', 'events', 'content_cache', 'ai_usage',
    'reports', 'lessons', 'remediations', 'streaks', 'essays', 'level_feedback', 'level_edits', 'scorecards',
    'level_signals', 'learner_records', 'level_debriefs', 'placement_question_sets', 'subject_placements',
    'game_payloads', 'block_plans', 'assist_chats', 'level_logs', 'chess_ratings', 'chess_puzzle_attempts',
  'chess_rush_runs', 'chess_drill_cards', 'chess_drill_runs', 'fact_pools', 'piano_song_results', 'parents', 'parental_consents',
  'skill_records', 'study_sessions', 'enforcers', 'learner_goals', 'tutor_memory', 'es_path_runs', 'es_review',
  'act_profiles', 'act_scores', 'act_study', 'spanish_study', 'spanish_study_checkins', 'spanish_study_tests', 'materials',
];
function collectionNames() {
  return KNOWN_COLLECTIONS.filter((name) => {
    try { db.all(name); return true; } catch { return false; }
  });
}

/** Everything held about a child, for the parent's review and download. */
function childData(childId) {
  const out = {};
  for (const name of collectionNames()) {
    if (SHARED.has(name)) continue;
    const rows = db.find(name, (r) => r && r.user_id === childId);
    if (rows.length) out[name] = rows;
  }
  return out;
}

// ── the sweep: expiry, the delayed confirmation, revoked clean-up ────────────

async function sendConfirmation(consent) {
  const child = db.byId('users', consent.child_user_id);
  const origin = process.env.APP_ORIGIN || '';
  await mailer.send({
    to: consent.parent_email,
    tag: 'consent-confirmation',
    subject: 'Savant: confirming the consent you gave',
    text: [
      'Hello,',
      '',
      `Yesterday this email address agreed to ${child ? `"${child.display_name}"` : 'a child'} using Savant.`,
      'If that was you, there is nothing to do.',
      '',
      'If it was not you, or you have changed your mind, you can withdraw consent at any time: sign in at',
      `${origin}/parent and choose "Withdraw consent", or delete the account and its data from the same page.`,
      '',
      'You can also see everything Savant keeps about your child there.',
      `Privacy policy: ${origin}/privacy`,
    ].join('\n'),
  });
}

/**
 * One pass over the consent records. Runs every ten minutes in the server and is
 * called directly by the tests with a later `now`.
 */
async function sweep(now = Date.now()) {
  const out = { expired: 0, confirmed: 0, revoked_deleted: 0 };
  for (const c of db.all('parental_consents').slice()) {
    if (c.status === 'pending' && c.expires_at && Date.parse(c.expires_at) <= now) {
      deleteChild(c, 'expired', 'system');
      out.expired++;
    } else if (c.status === 'active' && c.confirmation && c.confirmation.due_at && !c.confirmation.sent_at
        && Date.parse(c.confirmation.due_at) <= now) {
      try {
        await sendConfirmation(c);
        db.update('parental_consents', c.id, {
          confirmation: { ...c.confirmation, sent_at: new Date(now).toISOString() },
          history: addHistory(c, 'confirmation_sent', 'system'),
        });
        out.confirmed++;
      } catch (err) {
        console.warn('consent confirmation email failed:', err.message);
      }
    } else if (c.status === 'revoked' && c.revoked_at && Date.parse(c.revoked_at) + REVOKED_DAYS() * DAY <= now) {
      deleteChild(c, 'revoked_expired', 'system');
      out.revoked_deleted++;
    }
  }
  return out;
}

if (process.env.CONSENT_SWEEP !== 'off') {
  const timer = setInterval(() => { sweep().catch((err) => console.warn('consent sweep:', err.message)); }, 10 * 60 * 1000);
  if (timer.unref) timer.unref();
}

// ── middleware: the limits on a child account ────────────────────────────────

/**
 * Endpoints that send a learner's own words or recordings to an outside model.
 * Off for an account whose consent does not include the outside-AI opt-in.
 */
const OUTSIDE_AI = [
  /^\/items\/\d+\/(coach|coach\/prime|coach\/stream|ask)$/, // the question coach and "ask about this"
  /^\/lessons\/[^/]+\/[^/]+\/\d+\/assist$/,                 // chat assist on a block or game question
  /^\/tutor\/chat$/,                                         // the persistent tutor (services/tutor.js)
  /^\/essays\/\d+\/submit$/,                                 // essay marking by a model
  /^\/es\/(asr|upload|conversation\/turn|conversation\/end|writing\/feedback|writing\/score|recording\/score|reaction)$/,
];
/** Endpoints that are fine as taps but send any typed words to a model. */
const TEXT_FIELDS = [
  { re: /^\/levels\/[^/]+\/[^/]+\/\d+\/feedback$/, fields: ['liked', 'disliked', 'comments'] },
  { re: /^\/profile\/survey$/, fields: null }, // every survey field is free text
  { re: /^\/goals$/, fields: ['text'] },       // a learner goal in their own words (services/goals.js)
];
/**
 * Endpoints that upload a learner's own recording or file. Off for every child
 * account, whatever the opt-ins say: the research doc (section 2, the upload
 * row) prefers uploads disabled for children until a lawyer approves them.
 */
const CHILD_MEDIA_UPLOAD = /^\/(es\/(asr|upload)|materials(\/paste)?)$/;
/** What a locked account can still reach. */
const LOCKED_ALLOW = /^\/(auth\/|consent\/|health$)/;

function hasText(body, fields) {
  if (!body || typeof body !== 'object') return false;
  const keys = fields || Object.keys(body);
  return keys.some((k) => typeof body[k] === 'string' && body[k].trim());
}

/**
 * The path as the routers will match it. Express matches paths case-insensitively
 * and with or without a trailing slash, so `/ITEMS/5/coach` and `/items/5/coach/`
 * reach the coach route; the lists above are written in lower case without one.
 * Matching the raw path let either spelling walk past every limit here (security
 * review 2026-10-24, finding 2).
 */
function routePath(req) {
  let p = String(req.path || '');
  try { p = decodeURIComponent(p); } catch { /* malformed escapes: match as sent */ }
  return p.toLowerCase().replace(/\/{2,}/g, '/').replace(/(.)\/+$/, '$1');
}

/** Mounted on /api before every router. */
function gate(req, res, next) {
  if (!req.user) return next();
  const a = access(req.user);
  const reqPath = routePath(req);
  if (a.locked && !LOCKED_ALLOW.test(reqPath)) {
    return res.status(403).json({
      error: a.state === 'revoked'
        ? 'A parent or guardian has turned this account off. Ask them to look at the parent page.'
        : 'This account opens once a parent or guardian agrees.',
      code: a.state === 'revoked' ? 'consent_revoked' : 'consent_pending',
    });
  }
  const child = ['pending', 'active', 'revoked'].includes(a.state);
  if (child && req.method === 'POST' && CHILD_MEDIA_UPLOAD.test(reqPath)) {
    return res.status(403).json({
      error: 'Recordings and files are not uploaded from child accounts. Type your answer instead.',
      code: 'child_upload_off',
    });
  }
  if (!a.ai_free_text && req.method !== 'GET') {
    const outside = OUTSIDE_AI.some((re) => re.test(reqPath))
      || TEXT_FIELDS.some((t) => t.re.test(reqPath) && hasText(req.body, t.fields));
    if (outside) {
      return res.status(403).json({
        error: a.state === 'needs_age'
          ? 'Answer the date-of-birth question first: open Subjects to see it.'
          : 'This uses an outside AI service, which is off for this account until a parent or guardian allows it on the parent page. Everything with taps and buttons still works.',
        code: a.state === 'needs_age' ? 'age_needed' : 'parent_opt_in_required',
      });
    }
  }
  return next();
}

/**
 * Mounted on the whole app after the user is known: an account that may not use
 * the camera or microphone gets them switched off in the browser for every page
 * and frame (Permissions-Policy), so getUserMedia is refused before any engine
 * code runs and the blocks show their tap and on-screen-key fallbacks.
 */
function permissionsGate(req, res, next) {
  res.vary('Cookie');
  if (req.user) {
    const a = access(req.user);
    if (!a.camera_mic) res.set('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
  }
  next();
}

// ── parent session ───────────────────────────────────────────────────────────

function attachParent(req, res, next) {
  req.parent = null;
  if (req.session && req.session.parentId) {
    const p = db.byId('parents', req.session.parentId);
    if (p) req.parent = p;
  }
  next();
}
router.use(attachParent);

function requireParent(req, res, next) {
  if (!req.parent) return res.status(401).json({ error: 'Sign in as a parent or guardian to continue.' });
  next();
}

/** Parent sign-in rotates the session and drops any learner signed in on this browser. */
function startParentSession(req, parent) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.parentId = parent.id;
      req.session.save((saveErr) => (saveErr ? reject(saveErr) : resolve()));
    });
  });
}

function consentFor(req, id) {
  const c = db.byId('parental_consents', id);
  if (!c || !req.parent || c.parent_id !== req.parent.id) return null;
  return c;
}

function describeConsent(c) {
  const child = db.byId('users', c.child_user_id);
  return {
    id: c.id,
    status: c.status,
    child: child ? {
      display_name: child.display_name,
      username: child.username || null,
      created_at: child.created_at,
      country: child.age_check ? child.age_check.country : null,
      under_13: !!(child.age_check && child.age_check.under_13),
      xp: child.xp || 0,
    } : null,
    requested_at: c.requested_at,
    granted: c.granted,
    notice_version: c.notice_version,
    policy_version: c.policy_version,
    scopes: c.scopes,
    settings: c.settings,
    confirmation: c.confirmation,
    revoked_at: c.revoked_at,
    delete_after: c.status === 'revoked' && c.revoked_at
      ? new Date(Date.parse(c.revoked_at) + REVOKED_DAYS() * DAY).toISOString() : null,
    history: (c.history || []).map((h) => ({ at: h.at, event: h.event, by: h.by })),
  };
}

// ── routes: the age screen ───────────────────────────────────────────────────

router.get('/config', (req, res) => {
  res.json({
    countries: COUNTRIES,
    notice_version: NOTICE_VERSION,
    policy_version: POLICY_VERSION,
    pending_days: PENDING_DAYS(),
    revoked_days: REVOKED_DAYS(),
    mail: mailer.transportName(),
  });
});

/**
 * The neutral screen. Before sign-up it is held in the session (the first answer
 * stands for a day); for a signed-in account with no age on file it is stored on
 * the account at once. Answers `route: 'self' | 'parent'`, never the threshold.
 */
router.post('/age', limit('age-screen', 30, 60 * 60 * 1000), (req, res) => {
  if (req.user && req.user.age_check) {
    return res.json({ route: req.user.age_check.needs_parent ? 'parent' : 'self', locked: true });
  }
  const held = screenFromSession(req);
  let check;
  let locked = false;
  if (held) { check = held; locked = true; } else {
    const out = evaluateAge(req.body);
    if (out.error) return res.status(400).json({ error: out.error });
    check = out.check;
    req.session.age_screen = check;
  }
  if (req.user && !req.user.age_check) {
    db.update('users', req.user.id, {
      age_check: { ...check, asked_on: 'existing_account' },
      account_type: check.needs_parent ? 'child' : 'standard',
    });
  }
  res.json({ route: check.needs_parent ? 'parent' : 'self', locked });
});

// ── routes: the child's side ─────────────────────────────────────────────────

router.get('/child', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Sign in to continue.' });
  res.json({ ...publicConsent(req.user), mail: mailer.transportName() });
});

/** Send (or send again, or to a corrected address) the request to the parent. */
router.post('/child/request', limit('consent-request', 6, 60 * 60 * 1000), async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Sign in to continue.' });
  const check = req.user.age_check;
  if (!check || !check.needs_parent) return res.status(400).json({ error: 'This account does not need a parent to agree.' });
  const existing = req.user.consent_id ? db.byId('parental_consents', req.user.consent_id) : null;
  if (existing && existing.status !== 'pending') {
    return res.status(409).json({ error: 'A parent has already answered for this account.' });
  }
  if (existing && (existing.resends || 0) >= 5) return res.status(429).json({ error: 'That is enough emails for now. Ask your parent to check their inbox and spam folder.' });
  const parentEmail = normEmail(req.body.parent_email || (existing && existing.parent_email));
  if (!EMAIL.test(parentEmail)) return res.status(400).json({ error: "Enter your parent's or guardian's email address." });
  try {
    const { consent } = await requestConsent(req, req.user, parentEmail);
    res.json({ ok: true, parent_email: maskEmail(consent.parent_email), expires_at: consent.expires_at });
  } catch (err) {
    res.status(503).json({ error: 'The email could not be sent. Try again later.' });
  }
});

// ── routes: the parent's answer ──────────────────────────────────────────────

function pendingByToken(token) {
  if (!token || typeof token !== 'string' || token.length < 20) return null;
  const hash = sha256(token);
  const c = db.findOne('parental_consents', (r) => r.token_hash === hash);
  if (!c || c.status !== 'pending') return null;
  if (Date.parse(c.expires_at) <= Date.now()) return null;
  return c;
}

router.get('/request/:token', limit('consent-view', 60, 60 * 60 * 1000), (req, res) => {
  const c = pendingByToken(req.params.token);
  if (!c) return res.status(404).json({ error: 'This link has been used or has run out. Ask your child to send a new one from their account.' });
  const child = db.byId('users', c.child_user_id);
  res.json({
    child: { display_name: child ? child.display_name : 'your child', username: child ? child.username || null : null },
    parent_email: c.parent_email,
    parent_account: !!db.findOne('parents', (p) => p.email === c.parent_email),
    signed_in_as_this_parent: !!(req.parent && req.parent.email === c.parent_email),
    expires_at: c.expires_at,
    notice_version: NOTICE_VERSION,
    policy_version: POLICY_VERSION,
  });
});

router.post('/request/:token', limit('consent-answer', 20, 60 * 60 * 1000), async (req, res) => {
  const c = pendingByToken(req.params.token);
  if (!c) return res.status(404).json({ error: 'This link has been used or has run out.' });
  const body = req.body || {};

  if (body.decision === 'decline') {
    deleteChild(c, 'declined', 'parent');
    return res.json({ ok: true, decision: 'declined' });
  }
  if (body.decision !== 'agree') return res.status(400).json({ error: 'Choose to agree or not to agree.' });
  if (body.notice_version !== NOTICE_VERSION) {
    return res.status(409).json({ error: 'The notice has changed since this page was opened. Reload the page and read it again.' });
  }
  if (body.i_am_parent !== true) {
    return res.status(400).json({ error: 'Confirm that you are this child\'s parent or legal guardian.' });
  }

  // The parent account: signed in already, an existing one (password), or a new one.
  let parent = db.findOne('parents', (p) => p.email === c.parent_email);
  const password = String(body.password || '');
  if (parent) {
    const signedIn = req.parent && req.parent.id === parent.id;
    if (!signedIn && !(await bcrypt.compare(password, parent.password_hash))) {
      return res.status(401).json({ error: 'That password does not match your parent account.' });
    }
  } else {
    if (password.length < 8) return res.status(400).json({ error: 'Choose a password of at least 8 characters for your parent account.' });
    if (password.length > 200) return res.status(400).json({ error: 'That password is too long.' });
    parent = db.insert('parents', { email: c.parent_email, password_hash: await bcrypt.hash(password, 10) });
  }

  const at = nowIso();
  const wantsAi = body.opt_third_party_ai === true;
  const wantsTraining = body.opt_ai_training === true;
  const scopes = blankScopes();
  scopes.account_and_learning = { active: true, method: 'email_plus', at };
  scopes.camera_mic_on_device = { active: true, method: 'email_plus', at };
  if (wantsAi) scopes.third_party_ai = { requested: true, active: false, method: 'signed_form', requested_at: at, verified_at: null };
  if (wantsTraining) scopes.ai_training = { requested: true, active: false, method: 'signed_form', requested_at: at, verified_at: null };

  db.update('parental_consents', c.id, {
    status: 'active',
    parent_id: parent.id,
    token_hash: null,
    expires_at: null,
    notice_version: NOTICE_VERSION,
    policy_version: POLICY_VERSION,
    granted: {
      at,
      method: 'email_plus',
      method_detail: 'Consent link sent to the parent email, answered on the notice page; delayed confirmation email with the withdrawal route follows (16 CFR 312.5(b)(2)(vi)).',
      notice_version: NOTICE_VERSION,
      notice_sha256: noticeFileHash(),
      policy_version: POLICY_VERSION,
      evidence: { ip_sha256: sha256(`${req.ip}|${process.env.SESSION_SECRET || ''}`).slice(0, 32), user_agent: String(req.get('user-agent') || '').slice(0, 200) },
    },
    scopes,
    settings: { camera_mic_off: body.camera_mic_off === true },
    confirmation: { due_at: new Date(Date.now() + CONFIRM_DELAY_MS()).toISOString(), sent_at: null },
    history: addHistory(c, 'granted', 'parent', {
      method: 'email_plus', third_party_ai_requested: wantsAi, ai_training_requested: wantsTraining,
    }),
  });

  await startParentSession(req, parent);
  res.json({ ok: true, decision: 'agreed', needs_signed_form: wantsAi || wantsTraining });
});

// ── routes: the parent page ──────────────────────────────────────────────────

router.post('/parent/login', limit('parent-login', 20, 15 * 60 * 1000), async (req, res) => {
  const email = normEmail(req.body.email);
  const password = String(req.body.password || '');
  const parent = db.findOne('parents', (p) => p.email === email);
  const hash = parent ? parent.password_hash : DUMMY_HASH;
  const ok = await bcrypt.compare(password, hash);
  if (!parent || !ok) return res.status(401).json({ error: 'That email and password do not match a parent account.' });
  await startParentSession(req, parent);
  res.json({ ok: true });
});

router.post('/parent/logout', (req, res) => {
  if (!req.session) return res.json({ ok: true });
  req.session.destroy(() => {
    res.clearCookie('polymath.sid');
    res.json({ ok: true });
  });
});

router.get('/parent/me', (req, res) => {
  if (!req.parent) return res.json({ parent: null });
  const children = db.find('parental_consents', (c) => c.parent_id === req.parent.id && ['active', 'revoked'].includes(c.status));
  res.json({
    parent: { email: req.parent.email, created_at: req.parent.created_at },
    children: children.map(describeConsent),
    notice_version: NOTICE_VERSION,
    revoked_days: REVOKED_DAYS(),
  });
});

/** Everything kept about the child: a summary on the page, the whole thing as a download. */
router.get('/parent/children/:id/data', requireParent, (req, res) => {
  const c = consentFor(req, req.params.id);
  if (!c || !['active', 'revoked'].includes(c.status)) return res.status(404).json({ error: 'No such child on this account.' });
  const child = db.byId('users', c.child_user_id);
  const data = childData(c.child_user_id);
  const account = child ? {
    id: child.id, username: child.username || null, email: child.email || null, display_name: child.display_name,
    created_at: child.created_at, xp: child.xp || 0, streak: child.streak || 0, age_check: child.age_check || null,
  } : null;
  if (req.query.download === '1') {
    res.set('Content-Disposition', 'attachment; filename="savant-child-data.json"');
    return res.json({ exported_at: nowIso(), account, consent: describeConsent(c), data });
  }
  const counts = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length]));
  res.json({ account, counts });
});

router.post('/parent/children/:id/settings', requireParent, (req, res) => {
  const c = consentFor(req, req.params.id);
  if (!c || c.status !== 'active') return res.status(404).json({ error: 'No such child on this account.' });
  const settings = { ...(c.settings || {}) };
  let history = c.history;
  // Each setting changes only when the request names it. (The camera switch used to
  // be reset by any request, which would have turned it back on when another
  // setting was sent alone.) A body with neither key changes nothing.
  if (typeof req.body.hide_stats === 'boolean') {
    // Hide the streak and XP on the child's screens (UX_HIDE_STATS; middleware/auth.js).
    settings.hide_stats = req.body.hide_stats;
    history = addHistory({ history }, req.body.hide_stats ? 'stats_hidden' : 'stats_shown', 'parent');
  }
  if (typeof req.body.camera_mic_off === 'boolean' || typeof req.body.hide_stats !== 'boolean') {
    const off = req.body.camera_mic_off === true;
    settings.camera_mic_off = off;
    history = addHistory({ history }, off ? 'camera_mic_off' : 'camera_mic_on', 'parent');
  }
  db.update('parental_consents', c.id, { settings, history });
  res.json({ ok: true, settings: db.byId('parental_consents', c.id).settings });
});

/**
 * The two disclosure opt-ins. Turning one off takes effect now; turning one on
 * asks for the signed form, and the operator's check is what switches it on.
 */
router.post('/parent/children/:id/opt-ins', requireParent, (req, res) => {
  const c = consentFor(req, req.params.id);
  if (!c || c.status !== 'active') return res.status(404).json({ error: 'No such child on this account.' });
  const scopes = { ...blankScopes(), ...(c.scopes || {}) };
  const at = nowIso();
  const events = [];
  for (const key of ['third_party_ai', 'ai_training']) {
    if (typeof req.body[key] !== 'boolean') continue;
    const was = scopes[key] || {};
    if (req.body[key] && !was.requested) {
      scopes[key] = { requested: true, active: false, method: 'signed_form', requested_at: at, verified_at: null };
      events.push(`${key}_requested`);
    } else if (!req.body[key] && (was.requested || was.active)) {
      scopes[key] = { requested: false, active: false, method: null, requested_at: null, verified_at: null, withdrawn_at: at };
      events.push(`${key}_withdrawn`);
    }
  }
  let history = c.history;
  for (const e of events) history = addHistory({ history }, e, 'parent');
  db.update('parental_consents', c.id, { scopes, history });
  res.json({ ok: true, scopes });
});

router.post('/parent/children/:id/revoke', requireParent, (req, res) => {
  const c = consentFor(req, req.params.id);
  if (!c || c.status !== 'active') return res.status(404).json({ error: 'No such child on this account.' });
  db.update('parental_consents', c.id, {
    status: 'revoked',
    revoked_at: nowIso(),
    scopes: { ...blankScopes(), withdrawn_at: nowIso() },
    history: addHistory(c, 'revoked', 'parent'),
  });
  res.json({ ok: true, delete_after: new Date(Date.now() + REVOKED_DAYS() * DAY).toISOString() });
});

/** Consent given again from the parent page after a withdrawal (the parent is signed in). */
router.post('/parent/children/:id/consent', requireParent, (req, res) => {
  const c = consentFor(req, req.params.id);
  if (!c || c.status !== 'revoked') return res.status(404).json({ error: 'No such child on this account.' });
  if (req.body.notice_version !== NOTICE_VERSION) return res.status(409).json({ error: 'Read the current notice first.' });
  if (req.body.i_am_parent !== true) return res.status(400).json({ error: 'Confirm that you are this child\'s parent or legal guardian.' });
  const at = nowIso();
  const scopes = blankScopes();
  scopes.account_and_learning = { active: true, method: 'email_plus', at };
  scopes.camera_mic_on_device = { active: true, method: 'email_plus', at };
  db.update('parental_consents', c.id, {
    status: 'active',
    revoked_at: null,
    notice_version: NOTICE_VERSION,
    policy_version: POLICY_VERSION,
    granted: {
      ...(c.granted || {}),
      at,
      method: 'email_plus',
      method_detail: 'Given again from the parent account made through the original email link; delayed confirmation email follows.',
      notice_version: NOTICE_VERSION,
      notice_sha256: noticeFileHash(),
      policy_version: POLICY_VERSION,
    },
    scopes,
    confirmation: { due_at: new Date(Date.now() + CONFIRM_DELAY_MS()).toISOString(), sent_at: null },
    history: addHistory(c, 'granted_again', 'parent'),
  });
  res.json({ ok: true });
});

router.post('/parent/children/:id/delete', requireParent, (req, res) => {
  const c = consentFor(req, req.params.id);
  if (!c || !['active', 'revoked'].includes(c.status)) return res.status(404).json({ error: 'No such child on this account.' });
  if (String(req.body.confirm || '').trim().toUpperCase() !== 'DELETE') {
    return res.status(400).json({ error: 'Type DELETE to confirm.' });
  }
  db.update('parental_consents', c.id, { deletion_requested_at: nowIso() });
  const removed = deleteChild(db.byId('parental_consents', c.id), 'parent_request', 'parent');
  res.json({ ok: true, removed });
});

/** A parent account with no linked children left can be closed. */
router.post('/parent/delete-account', requireParent, (req, res) => {
  const linked = db.find('parental_consents', (c) => c.parent_id === req.parent.id && ['active', 'revoked'].includes(c.status));
  if (linked.length) return res.status(409).json({ error: 'Delete or keep each child\'s account first.' });
  const id = req.parent.id;
  for (const c of db.find('parental_consents', (r) => r.parent_id === id)) {
    db.update('parental_consents', c.id, { parent_id: null });
  }
  db.remove('parents', (p) => p.id === id);
  req.session.destroy(() => {
    res.clearCookie('polymath.sid');
    res.json({ ok: true });
  });
});

// ── routes: the operator's check of a signed form ────────────────────────────

function requireAdminUser(req, res, next) {
  if (!isAdmin(req.user)) return res.status(404).json({ error: 'No such endpoint.' });
  next();
}

router.get('/admin/forms', requireAdminUser, (req, res) => {
  const rows = db.find('parental_consents', (c) => c.status === 'active'
    && ['third_party_ai', 'ai_training'].some((k) => c.scopes && c.scopes[k] && c.scopes[k].requested && !c.scopes[k].active));
  res.json({
    waiting: rows.map((c) => ({
      id: c.id,
      parent_email: c.parent_email,
      child: (db.byId('users', c.child_user_id) || {}).display_name || null,
      granted_at: c.granted && c.granted.at,
      requested: ['third_party_ai', 'ai_training'].filter((k) => c.scopes[k].requested && !c.scopes[k].active),
    })),
  });
});

router.post('/admin/forms/:id/verify', requireAdminUser, (req, res) => {
  const c = db.byId('parental_consents', req.params.id);
  const scope = String(req.body.scope || '');
  if (!c || c.status !== 'active' || !['third_party_ai', 'ai_training'].includes(scope)
      || !c.scopes[scope] || !c.scopes[scope].requested) {
    return res.status(404).json({ error: 'Nothing waiting for that form.' });
  }
  if (req.body.checked !== true) return res.status(400).json({ error: 'Confirm that the signed form was checked against the parent email and the child.' });
  const scopes = { ...c.scopes, [scope]: { ...c.scopes[scope], active: true, verified_at: nowIso(), verified_by: req.user.email, method: 'signed_form' } };
  db.update('parental_consents', c.id, {
    scopes,
    history: addHistory(c, `${scope}_verified`, 'operator', { note: String(req.body.note || '').slice(0, 200) }),
  });
  res.json({ ok: true, scopes });
});

/**
 * Proof for the operator: one consent record as stored (to answer a parent or a
 * regulator), and a deletion audit that counts what any collection still holds
 * for an account id (all zeros after a deletion).
 */
router.get('/admin/records/:id', requireAdminUser, (req, res) => {
  const c = db.byId('parental_consents', req.params.id);
  if (!c) return res.status(404).json({ error: 'No such record.' });
  res.json({ record: { ...c, token_hash: c.token_hash ? '(set)' : null } });
});

router.get('/admin/rows/:userId', requireAdminUser, (req, res) => {
  const id = Number(req.params.userId);
  const counts = {};
  for (const name of collectionNames()) {
    if (name === 'parental_consents' || name === 'parents') continue;
    const n = name === 'users'
      ? db.find('users', (u) => u.id === id).length
      : db.find(name, (r) => r && r.user_id === id).length;
    if (n) counts[name] = n;
  }
  res.json({ user_id: id, counts, total: Object.values(counts).reduce((a, b) => a + b, 0) });
});

/**
 * Run the sweep now (admins). Outside production a test may pass `at` to run it
 * as of a later moment, which is how the expiry and the delayed confirmation are
 * tested without waiting a day.
 */
router.post('/admin/sweep', requireAdminUser, async (req, res) => {
  const at = process.env.NODE_ENV !== 'production' && req.body && req.body.at ? Date.parse(req.body.at) : Date.now();
  if (!Number.isFinite(at)) return res.status(400).json({ error: 'Bad time.' });
  res.json(await sweep(at));
});

module.exports = {
  router,
  gate,
  permissionsGate,
  access,
  publicConsent,
  evaluateAge,
  screenFromSession,
  requestConsent,
  sweep,
  deleteChild,
  minimumAge,
  CONSENT_AGE,
  DEFAULT_CONSENT_AGE,
  NOTICE_VERSION,
  POLICY_VERSION,
  USERNAME,
  EMAIL,
  DUMMY_HASH,
};
