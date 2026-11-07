/**
 * Accounts: register, sign in, sign out, and who-am-I.
 *
 * Sign-up starts with the neutral age screen (POST /api/consent/age, see
 * routes/consent.js), which is held in the session. At or over the country's age
 * of digital consent the account is the usual one: email, password, name. Under
 * it, the account is a child account: a username instead of an email, a first
 * name or nickname, and a parent's or guardian's email, which gets the consent
 * request. The child is signed in to a limited account straight away.
 *
 * An account made without an age answer (an API client, or an older page) is
 * created and treated like an account from before the screen existed: limited
 * until the age question is answered on the next page it opens.
 */
const express = require('express');
const passwords = require('../services/passwords');
const db = require('../config/db');
const learner = require('../services/learner');
const { limit } = require('../utils/rate-limit');
const { publicUser } = require('../middleware/auth');
const consent = require('./consent');
const referrals = require('../services/referrals');
const signinOnly = require('../middleware/signin-only');

const router = express.Router();
const onboardingV2 = () => require('../services/onboarding-v2'); // eslint-disable-line global-require

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const REMEMBER_MS = 365 * 24 * 3600 * 1000; // "Remember me": a year from the last visit, since the cookie rolls with every response

function normalizeEmail(raw) {
  return String(raw || '').trim().toLowerCase();
}

/** The user as the browser sees it, with the age and consent state beside it. */
function userView(user) {
  if (!user) return null;
  return { ...publicUser(user, learner.getProfile(user.id)), ...consent.publicConsent(user) };
}

/** Sign the user in by rotating the session id first: reusing the id the visitor
 *  arrived with would let someone who planted it ride along on the login. The age
 *  screen answer is carried across, so it cannot be answered again by signing in. */
function startSession(req, user, { remember } = {}) {
  const screen = req.session && req.session.age_screen;
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.userId = user.id;
      req.session.uc = user.created_at; // whose id this is: see middleware/auth.js attachUser
      if (user.session_epoch) req.session.ep = user.session_epoch; // moved on by a password reset, which ends older sessions: see attachUser
      // Kept with the session, so the rolling cookie keeps this length. Unticked: no expiry, so the cookie ends with the browser and the
      // store drops the row a day after the last visit. A caller that does not say keeps the default in server.js.
      if (remember === true) req.session.cookie.maxAge = REMEMBER_MS;
      else if (remember === false) req.session.cookie.expires = false;
      if (screen) req.session.age_screen = screen;
      req.session.save((saveErr) => (saveErr ? reject(saveErr) : resolve()));
    });
  });
}

function checkPassword(password) {
  if (password.length < 8) return 'Use a password of at least 8 characters.';
  if (password.length > 200) return 'That password is too long.';
  return null;
}

// Sign-ups and sign-ins carry no account yet, so they count by address, and a classroom shares one: 60 sign-ups an hour and 120 sign-ins per
// 15 minutes fit a whole class arriving at once (it was 10 and 20). The guess a limit exists to stop is many tries at ONE account, which
// the per-account sign-in limit below stops at 15 per 15 minutes wherever they come from. The invite gate (BETA_GATE) is what keeps strangers out.
router.post('/register', signinOnly.refuseSignUp, limit('register', 60, 60 * 60 * 1000), async (req, res) => {
  const password = String(req.body.password || '');
  const displayName = String(req.body.display_name || '').trim();

  // The age answer: the one held for this browser session wins; an API client
  // may send it in the body instead, and it is then held the same way.
  let screen = consent.screenFromSession(req);
  if (!screen && req.body.birth_year !== undefined) {
    const out = consent.evaluateAge(req.body);
    if (out.error) return res.status(400).json({ error: out.error });
    screen = out.check;
    req.session.age_screen = screen;
  }

  if (screen && screen.needs_parent) return registerChild(req, res, screen, password, displayName);

  const email = normalizeEmail(req.body.email);
  if (!EMAIL.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  const weak = checkPassword(password);
  if (weak) return res.status(400).json({ error: weak });
  if (displayName.length < 2 || displayName.length > 32) {
    return res.status(400).json({ error: 'Your name should be 2 to 32 characters.' });
  }
  // Hashed before the check, so the check and the insert have nothing between them: with the wait in between, sign-ups racing for one email
  // all passed the check and each made an account (beta load test, Nov 2026).
  const passwordHash = await passwords.hash(password, 10);
  if (db.findOne('users', (u) => u.email === email)) {
    return res.status(409).json({ error: 'An account with that email already exists.' });
  }

  const user = db.insert('users', {
    email,
    display_name: displayName,
    password_hash: passwordHash,
    xp: 0,
    streak: 0,
    last_active_day: null,
    onboarded: false,
    // null when no age answer came with the sign-up: asked on the next page.
    age_check: screen ? { ...screen, asked_on: 'sign_up' } : null,
    account_type: 'standard',
  });
  referrals.attach(user, req.body.ref); // a friend's share link; an unknown code is ignored
  // The line on the sign-up page is the agreement (owner, 7 Nov: the application covers the terms, not the onboarding): recorded when the page that showed it says so, for a
  // learner at or over the consent age. A child's parent answers for them, as ever.
  if (screen && req.body.agreement === onboardingV2().SIGNUP_AGREEMENT.version) {
    const { version, text } = onboardingV2().SIGNUP_AGREEMENT;
    onboardingV2().recordAgreement(user, consent.POLICY_VERSION, { version, text, via: 'sign_up' });
  }
  require('../services/act-check').carry(user); // an applicant from the free ACT level check brings their result along

  await startSession(req, user);
  // A brand-new account has no profile row yet, so `getProfile` hands back the
  // blank one and the tier reads as standard — which is the right default for a
  // capability that costs money.
  res.status(201).json({ user: userView(user) });
});

/**
 * A child account: no child email is collected (data minimisation, and 312.5(c)(1)
 * allows only the parent's contact and the child's name before consent).
 */
async function registerChild(req, res, screen, password, displayName) {
  const username = String(req.body.username || '').trim().toLowerCase();
  const parentEmail = normalizeEmail(req.body.parent_email);
  if (!consent.USERNAME.test(username)) {
    return res.status(400).json({ error: 'Pick a username of 3 to 24 letters or numbers (dots, dashes and underscores are fine). Do not use your real name or email.' });
  }
  const weak = checkPassword(password);
  if (weak) return res.status(400).json({ error: weak });
  if (displayName.length < 2 || displayName.length > 32) {
    return res.status(400).json({ error: 'Your first name or a nickname should be 2 to 32 characters.' });
  }
  if (!EMAIL.test(parentEmail)) return res.status(400).json({ error: "Enter your parent's or guardian's email address." });
  const passwordHash = await passwords.hash(password, 10); // before the check, as above
  if (db.findOne('users', (u) => u.username === username)) {
    return res.status(409).json({ error: 'That username is taken. Try another.' });
  }

  const user = db.insert('users', {
    email: null,
    username,
    display_name: displayName,
    password_hash: passwordHash,
    xp: 0,
    streak: 0,
    last_active_day: null,
    onboarded: false,
    age_check: { ...screen, asked_on: 'sign_up' },
    account_type: 'child',
    consent_id: null,
  });

  let sent = true;
  try {
    await consent.requestConsent(req, user, parentEmail);
  } catch (err) {
    // The account stays limited and the child can send the request again from
    // their account; the failure is not hidden.
    console.warn('consent request email failed:', err.message);
    sent = false;
  }

  await startSession(req, user);
  res.status(201).json({ user: userView(db.byId('users', user.id)), consent_email_sent: sent });
}

router.post('/login', limit('login', 120, 15 * 60 * 1000), limit('login-account', 15, 15 * 60 * 1000, { by: (req) => normalizeEmail(req.body && (req.body.email || req.body.username)) }), async (req, res) => {
  const wasGuest = req.user && req.user.guest ? req.user : null; // onboarding v2: an unsaved learner signing in to an account they already have
  // One box takes an email or a child account's username.
  const login = normalizeEmail(req.body.email || req.body.username);
  const password = String(req.body.password || '');
  const user = login.includes('@')
    ? db.findOne('users', (u) => u.email === login)
    : db.findOne('users', (u) => u.username && u.username === login);

  // Compare against a dummy hash when the account does not exist, so the
  // response time does not reveal which emails are registered. It must be a real
  // 60-character hash: bcryptjs returns at once for a malformed one.
  const hash = user ? user.password_hash : consent.DUMMY_HASH;
  const ok = await passwords.compare(password, hash);
  if (!user || !ok) return res.status(401).json({ error: 'That email or username and password do not match.' });

  await startSession(req, user, { remember: req.body.remember });
  if (wasGuest) require('../services/onboarding-v2').absorbGuest(wasGuest, user); // eslint-disable-line global-require
  res.json({ user: userView(user) });
});

router.post('/logout', (req, res) => {
  if (!req.session) return res.json({ ok: true });
  req.session.destroy(() => {
    res.clearCookie('polymath.sid');
    res.json({ ok: true });
  });
});

router.get('/me', (req, res) => {
  res.json({ user: userView(req.user) });
});

router.helpers = { startSession, userView, normalizeEmail, checkPassword, EMAIL };

module.exports = router;
