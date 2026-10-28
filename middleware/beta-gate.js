/**
 * The approved-tester gate for the private beta.
 *
 * STAGED (2026-10-24, curriculum-build/BETA-LAUNCH-KIT.md section 4). Off unless
 * server.js mounts it (curriculum-build/staged/beta-launch/server.js.patch) AND
 * BETA_GATE=invite. With the gate off, sign-up works exactly as it does today.
 *
 * What it does with BETA_GATE=invite:
 *   GET  /join?invite=CODE   keeps the code in the session and sends the visitor to
 *                            /register with the code out of the address bar, so the
 *                            register page needs no change.
 *   POST /api/auth/register  needs a valid code (body `invite_code`, or the one kept
 *                            by /join) for the sign-up's own email or, for a child
 *                            sign-up, the parent email. Otherwise 403 with a plain
 *                            message. When the account is made (201), the code is
 *                            marked used by that account.
 *   POST /api/auth/login     with BETA_GATE_LOGIN=1 also: an account that did not
 *                            come through an invite (and is not an admin or in
 *                            BETA_ALLOW_EMAILS) is told the beta is invite-only,
 *                            but only after its password checks out, so the answer
 *                            never reveals which emails have accounts.
 *
 * Not here: the tester consent gate (tester terms; a parent's acceptance for a
 * minor). It is blocked in this session; see services/beta-invites.js.
 */
const bcrypt = require('bcryptjs');
const invites = require('../services/beta-invites');
const { limit } = require('../utils/rate-limit');

const MESSAGES = {
  missing: 'Savant is in a private beta. Apply on our website, and use the invite link or code from your email to sign up.',
  unknown: 'That invite code is not one we sent. Check it against your email, or apply on our website.',
  used: 'That invite code has already been used. If that was not you, reply to the invite email.',
  expired: 'That invite code has expired. Apply again on our website and we will send a new one.',
  revoked: 'That invite code is no longer active.',
  replaced: 'A newer invite was sent to this address. Use the code in the latest email.',
  other_email: 'That invite code belongs to a different email address. Sign up with the address the invite was sent to (for a child, use it as the parent email).',
  in_flight: 'That invite code is being used right now. Try again in a moment.',
};

const enabled = () => String(process.env.BETA_GATE || '').toLowerCase() === 'invite';

function allowList() {
  return String(process.env.BETA_ALLOW_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

function betaGate({ db = null, isAdmin = () => false } = {}) {
  const inFlight = new Set();
  // These two paths answer before the auth router's own limits run, so they
  // carry their own: the login path checks a password (it would otherwise be an
  // unthrottled password oracle), and the sign-up path says whether a code is
  // good (50 bits cannot be guessed, but nothing should answer unthrottled).
  const limitRegister = limit('beta-register', 20, 60 * 60 * 1000);
  const limitLogin = limit('beta-login', 20, 15 * 60 * 1000);

  function registerGate(req, res, next) {
    const body = req.body || {};
    const code = invites.normCode(body.invite_code || (req.session && req.session.beta_invite) || '');
    const verdict = invites.check(code, [body.email, body.parent_email]);
    if (!verdict.ok) return res.status(403).json({ error: MESSAGES[verdict.reason] || MESSAGES.missing, beta: verdict.reason });
    const hash = invites.hashCode(code);
    if (inFlight.has(hash)) return res.status(409).json({ error: MESSAGES.in_flight, beta: 'in_flight' });
    inFlight.add(hash);
    res.on('close', () => inFlight.delete(hash));
    res.on('finish', () => {
      inFlight.delete(hash);
      if (res.statusCode !== 201 || !req.session || !req.session.userId) return;
      const used = invites.redeem(code, req.session.userId);
      if (used && db) {
        try { db.update('users', req.session.userId, { beta_tester: { invite_id: used.id, since: used.redeemed_at } }); } catch { /* the invite file still records it */ }
      }
      if (req.session) { delete req.session.beta_invite; req.session.save(() => {}); }
    });
    return next();
  }

  function loginGate(req, res, next) {
    const body = req.body || {};
    const login = String(body.email || body.username || '').trim().toLowerCase();
    const user = login.includes('@')
      ? db.findOne('users', (u) => u.email === login)
      : db.findOne('users', (u) => u.username && u.username === login);
    if (!user) return next();
    const allowed = user.beta_tester || invites.isTester(user.id) || isAdmin(user)
      || (user.email && allowList().includes(user.email));
    if (allowed) return next();
    return limitLogin(req, res, () => bcrypt.compare(String(body.password || ''), user.password_hash || '').then((ok) => {
      // The router's exact 401, answered here so this account costs one bcrypt
      // like every other (a second one would show in the timing).
      if (!ok) return res.status(401).json({ error: 'That email or username and password do not match.' });
      return res.status(403).json({ error: 'Savant is in a private beta for invited testers. Apply on our website to join.', beta: 'not_invited' });
    }, next));
  }

  return function gate(req, res, next) {
    if (!enabled()) return next();

    if (req.method === 'GET' && req.path === '/join') {
      const code = invites.normCode(req.query.invite);
      if (code && req.session) req.session.beta_invite = code;
      return res.redirect(303, '/register');
    }
    if (req.method === 'POST' && req.path === '/api/auth/register') {
      return limitRegister(req, res, () => registerGate(req, res, next));
    }
    if (req.method === 'POST' && req.path === '/api/auth/login' && process.env.BETA_GATE_LOGIN === '1' && db) {
      return loginGate(req, res, next);
    }
    return next();
  };
}

module.exports = { betaGate, MESSAGES, enabled };
