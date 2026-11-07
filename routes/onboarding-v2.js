/**
 * The new onboarding's API (services/onboarding-v2.js, docs/ONBOARDING-V2.md). 404 unless ONBOARDING_V2 is on.
 *
 *   GET  /api/ob2/state          where this visitor stands: account (go), guest (answers, enrollment), or just the age route
 *   POST /api/ob2/agree          { decision: 'agree', version } the terms, privacy and outside AI, at or over the consent age: makes the guest row and records it
 *   POST /api/ob2/begin          bring the guest row up to date; under the consent age, create it with { nickname, parent_email }
 *   POST /api/ob2/answers        keep the answers from steps 4 to 6 on a guest row
 *   POST /api/ob2/first-lesson   { track, grade_id? } stand on lesson 1 and set the goals
 *   POST /api/ob2/lesson-opened  the learner went into the lesson
 *   POST /api/ob2/claim          the guest row gains credentials; a failure changes nothing
 *
 * Age answers go through POST /api/consent/age, consent requests through routes/consent.js: nothing about them is decided here.
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const ob = require('../services/onboarding-v2');
const consent = require('./consent');
const referrals = require('../services/referrals');
const { limit } = require('../utils/rate-limit');
const { startSession, userView, normalizeEmail, checkPassword, EMAIL } = require('./auth').helpers;

const router = express.Router();
const HOUR = 60 * 60 * 1000;

router.use((req, res, next) => (ob.enabled() ? next() : res.status(404).json({ error: 'No such endpoint.' })));

const guestOnly = (req, res, next) => {
  if (!req.user || !req.user.guest) return res.status(409).json({ error: 'This is only for a learner who has not saved an account yet.', code: 'not_guest' });
  return next();
};

router.get('/state', (req, res) => res.json(ob.stateFor(req)));

/** A real choice, never assumed: declining sends nothing here, and a child cannot agree for themselves. */
router.post('/agree', limit('ob2-agree', 30, HOUR), async (req, res) => {
  if (req.user && !req.user.guest) return res.status(409).json({ error: 'You already have an account.', code: 'account', go: ob.accountHome(req.user) });
  const body = req.body || {};
  const screen = req.user ? req.user.age_check : consent.screenFromSession(req);
  if (!screen) return res.status(400).json({ error: 'Tell us when you were born first.', code: 'age_needed' });
  if (screen.needs_parent) return res.status(403).json({ error: 'A parent or guardian decides this for you.', code: 'parent_decides' });
  if (body.decision !== 'agree') return res.status(400).json({ error: 'Choose whether you agree first.', code: 'no_decision' });
  if (body.version !== ob.AGREEMENT_VERSION) return res.status(409).json({ error: 'These words have changed. Reload the page and read them again.', code: 'stale' });
  const fresh = !req.user;
  const user = req.user || ob.createGuest(screen);
  const updated = ob.recordAgreement(user, consent.POLICY_VERSION);
  if (fresh) await startSession(req, updated);
  res.status(fresh ? 201 : 200).json({ user: userView(db.byId('users', user.id)) });
});

router.post('/begin', limit('ob2-begin', 30, HOUR), async (req, res) => {
  if (req.user && !req.user.guest) return res.status(409).json({ error: 'You already have an account.', code: 'account', go: ob.accountHome(req.user) });
  const body = req.body || {};
  if (req.user) {
    ob.saveAnswers(req.user, body.answers);
    ob.applyInterest(req.user);
    return res.json({ user: userView(req.user), resumed: true });
  }
  const screen = consent.screenFromSession(req);
  if (!screen) return res.status(400).json({ error: 'Tell us when you were born first.', code: 'age_needed' });
  if (!screen.needs_parent) return res.status(403).json({ error: 'Agree to the terms first.', code: 'agreement_needed' });

  let nickname = null;
  let parentEmail = null;
  if (screen.needs_parent) {
    nickname = String(body.nickname || '').trim();
    parentEmail = normalizeEmail(body.parent_email);
    if (nickname.length < 2 || nickname.length > 32) return res.status(400).json({ error: 'Your first name or a nickname should be 2 to 32 characters.', field: 'nickname' });
    if (!EMAIL.test(parentEmail)) return res.status(400).json({ error: "Enter your parent's or guardian's email address.", field: 'parent_email' });
  }
  const user = ob.createGuest(screen, { nickname });
  ob.saveAnswers(user, body.answers);
  let sent = null;
  if (screen.needs_parent) {
    sent = true;
    try {
      await consent.requestConsent(req, user, parentEmail);
    } catch (err) {
      console.warn('consent request email failed:', err.message);
      sent = false; // the account stays limited and the request can be sent again; the failure is shown
    }
  }
  await startSession(req, user);
  res.status(201).json({ user: userView(db.byId('users', user.id)), consent_email_sent: sent });
});

router.post('/answers', guestOnly, limit('ob2-answers', 240, HOUR), (req, res) => {
  ob.saveAnswers(req.user, req.body);
  ob.applyInterest(req.user);
  ob.touch(req.user);
  res.json({ ok: true });
});

router.post('/first-lesson', guestOnly, limit('ob2-first-lesson', 60, HOUR), (req, res) => {
  const out = ob.firstLesson(req.user, req.body || {});
  if (out.error) return res.status(out.status || 400).json({ error: out.error });
  res.json(out);
});

router.post('/lesson-opened', guestOnly, (req, res) => {
  const row = ob.saveAnswers(req.user, {});
  if (!row.lesson_opened_at) db.update(ob.ANSWERS, row.id, { lesson_opened_at: new Date().toISOString() });
  res.json({ ok: true });
});

router.post('/claim', guestOnly, limit('register', 10, HOUR), async (req, res) => {
  const guest = req.user;
  const body = req.body || {};
  const password = String(body.password || '');
  const weak = checkPassword(password);
  const child = !!(guest.age_check && guest.age_check.needs_parent);
  if (!child && !guest.agreed_at) return res.status(403).json({ error: 'Agree to the terms first.', code: 'agreement_needed' });
  let patch;
  if (child) {
    // No child email, whatever the request carries (312.5(c)(1); routes/auth.js registerChild).
    const username = String(body.username || '').trim().toLowerCase();
    if (!consent.USERNAME.test(username)) {
      return res.status(400).json({ error: 'Pick a username of 3 to 24 letters or numbers (dots, dashes and underscores are fine). Do not use your real name or email.', field: 'username' });
    }
    if (weak) return res.status(400).json({ error: weak, field: 'password' });
    if (db.findOne('users', (u) => u.username === username)) return res.status(409).json({ error: 'That username is taken. Try another.', field: 'username' });
    patch = { username };
  } else {
    const email = normalizeEmail(body.email);
    const displayName = String(body.display_name || '').trim();
    if (displayName.length < 2 || displayName.length > 32) return res.status(400).json({ error: 'Your name should be 2 to 32 characters.', field: 'display_name' });
    if (!EMAIL.test(email)) return res.status(400).json({ error: 'Enter a valid email address.', field: 'email' });
    if (weak) return res.status(400).json({ error: weak, field: 'password' });
    if (db.findOne('users', (u) => u.email === email)) return res.status(409).json({ error: 'An account with that email already exists.', field: 'email', code: 'email_taken' });
    patch = { email, display_name: displayName };
  }
  const hash = await bcrypt.hash(password, 10);
  const user = db.update('users', guest.id, { ...patch, password_hash: hash, guest: false, guest_expires_at: null, claimed_at: new Date().toISOString() });

  const row = ob.rowOf(user.id);
  if (!child) {
    referrals.attach(user, body.ref || (row && row.ref));
    require('../services/act-check').carry(user); // eslint-disable-line global-require
  }
  ob.applyInterest(user);
  // Saving is the agreement that lets the first lessons be written ahead with outside AI, as for any new account.
  try {
    const first = db.findOne('enrollments', (e) => e.user_id === user.id);
    if (first && !child) require('../services/write-ahead').trigger({ user, enrollment: first, reason: 'onboarding v2 saved' }); // eslint-disable-line global-require
  } catch (err) { console.warn(`onboarding-v2: write-ahead not started: ${err.message}`); }

  await startSession(req, user);
  res.status(201).json({ user: userView(db.byId('users', user.id)) });
});

module.exports = router;
