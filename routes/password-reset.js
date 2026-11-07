/**
 * Forgot password: an email with a one-hour, single-use link, and a page to set a new password.
 *
 * PASSWORD_RESET=on turns it on, and the owner has not decided yet, so it is off by default. Off, the sign-in page is served exactly as before, and
 * these pages and routes are 404. On in production with no way to send (no mail provider, or no APP_ORIGIN for the link), it stays off the same way,
 * with a warning at start-up: a link that promises an email nobody can send is worse than no link. MAIL_ALLOW_OUTBOX=1 counts as a way to send: the
 * email is then a file in the outbox, for the owner to pass on by hand.
 *
 * The token: 256 random bits, of which only the SHA-256 is kept, on the account's own row (`password_reset`), so a new request replaces the old one and
 * the row goes with the account. publicUser and the account export list their fields, so it never reaches a browser. The token travels in the link's
 * #fragment, which browsers never send: it cannot reach a server or proxy log, or a Referer. The page posts it in the body, and only that POST spends it,
 * so a mail scanner opening the link spends nothing.
 *
 * The answer to a request is sent before anything is looked up, so it reads the same, and takes the same time, whether or not the address has an account.
 * How many emails one address gets is limited silently for the same reason; the limit by network address is an ordinary 429, which says nothing about
 * any account. After a reset the account's session_epoch moves on, which ends every session signed in before it (middleware/auth.js attachUser), and the
 * learner signs in on the sign-in page, so every check on signing in (the beta gate, the sign-in limits) still applies.
 *
 * Who can use it: only an account routes/consent.js reads as 'full', with its own email and password. Nothing is ever sent for anyone else, and the answer
 * does not change:
 *   - a child account: no email is sent to the child, and it may hold one, from before the age screen. The parent's email is not used either: it was
 *     collected to ask for consent (16 CFR 312.5(c)(1)), and the notice the parent read promises nothing about passwords. A link to the parent would also
 *     let whoever types a username make Savant write to that parent.
 *   - an account with no age answer: it may be a child's, and nobody has said it is not.
 *   - a guest, which has no password, and a parent account (`parents`), which is not looked at here: that login controls a child's settings.
 * The same check runs again when a link is used, so an account that became a child's after asking cannot use it. A reset changes the password and nothing
 * else: no consent row, no lock. A locked account stays locked.
 */
const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../config/db');
const mailer = require('../utils/mailer');
const passwords = require('../services/passwords');
const signinOnly = require('../middleware/signin-only');
const { limit, take } = require('../utils/rate-limit');
const consent = require('./consent');
const { checkPassword, normalizeEmail, EMAIL } = require('./auth').helpers;

const HOUR = 60 * 60 * 1000;
const TOKEN = /^[A-Za-z0-9_-]{43}$/; // 32 random bytes, base64url
const EMAILS_PER_ADDRESS = 3; // per hour; the link already sent keeps working past this
const PUBLIC = path.join(__dirname, '..', 'public');
const VIEWS = path.join(__dirname, '..', 'views', 'password-reset');
const PAGES = { '/forgot-password': 'forgot.html', '/reset-password': 'reset.html' };
const SCRIPT = '/password-reset.js';
const BAD_LINK = 'This link has run out or has already been used. Ask for a new one.';

const sha256 = (text) => crypto.createHash('sha256').update(String(text)).digest('hex');
const byAddress = (req) => req.ip || (req.socket && req.socket.remoteAddress) || 'unknown'; // by address even when signed in, unlike the default count

function switchedOn() {
  return String(process.env.PASSWORD_RESET || '').trim().toLowerCase() === 'on';
}

function canSend() {
  if (process.env.NODE_ENV !== 'production') return true; // the dev outbox
  return !!process.env.APP_ORIGIN && (mailer.transportName() !== 'dev-outbox' || process.env.MAIL_ALLOW_OUTBOX === '1');
}

function active() {
  return switchedOn() && canSend();
}

/** At start-up: plug in the mail provider the environment names, which nothing else in the app does, and say so if it cannot send. Off, it does nothing. */
function setup() {
  if (!switchedOn()) return;
  try {
    require('../utils/mail-transports').installFromEnv(); // eslint-disable-line global-require
  } catch (err) {
    console.warn(`Password reset: the mail provider could not be set up: ${err.message}`);
  }
  if (!canSend()) console.warn('PASSWORD_RESET=on, but it stays off: production needs MAIL_PROVIDER (or MAIL_ALLOW_OUTBOX=1) and APP_ORIGIN to send its email.');
}

/** May this account be sent a link, and use one? See the header. */
function eligible(user) {
  if (!user || !user.email || !user.password_hash || user.guest === true) return false;
  if (user.account_type === 'child' || user.username || user.consent_id) return false;
  const a = consent.access(user);
  return !!a && a.state === 'full';
}

/** A place on this site to go after signing in, or null. Stricter than the sign-in page's own check, which still applies after this one. */
function safeNext(raw) {
  if (typeof raw !== 'string' || !raw || raw.length > 512) return null;
  if (!raw.startsWith('/') || raw.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(raw)) return null; // browsers drop tabs and newlines, so "/\t/x" is "//x"
  let url;
  try { url = new URL(raw, 'http://savant.invalid'); } catch { return null; }
  if (url.origin !== 'http://savant.invalid') return null;
  return /^\/(forgot-password|reset-password)(\/|\.html?)?$/i.test(url.pathname) ? null : raw;
}

function clearToken(userId) {
  db.update('users', userId, { password_reset: null });
}

/** The account a token opens, or null. A token that has run out is cleared on the way. */
function holderOf(token) {
  if (typeof token !== 'string' || !TOKEN.test(token)) return null;
  const hash = sha256(token);
  const user = db.findOne('users', (u) => u.password_reset && u.password_reset.token_hash === hash);
  if (!user) return null;
  const held = user.password_reset;
  if (!(Date.parse(held.expires_at) > Date.now()) || held.email !== user.email || !eligible(user)) {
    clearToken(user.id);
    return null;
  }
  return user;
}

function resetEmail(user, link) {
  return {
    to: user.email,
    tag: 'password-reset',
    subject: 'Reset your Savant password',
    text: [
      'Hello,',
      '',
      'Someone asked to reset the password for the Savant account that uses this email address.',
      '',
      'Set a new password here. The link works once, for the next hour:',
      link,
      '',
      'If this was not you, you can ignore this email. Your password stays the same.',
    ].join('\n'),
  };
}

/** Everything a request does, after its answer has gone. It never says what it found. */
async function handleRequest(req, email, next) {
  if (!EMAIL.test(email) || email.length > 254) return;
  if (!take('password-reset-email', email, EMAILS_PER_ADDRESS, HOUR)) return;
  const now = Date.now();
  for (const u of db.find('users', (x) => x.password_reset && !(Date.parse(x.password_reset.expires_at) > now))) clearToken(u.id);
  const user = db.findOne('users', (u) => u.email === email);
  if (!eligible(user)) return;
  const origin = consent.originOf(req); // first: with no address to trust, nothing is stored and nothing is sent
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = sha256(token);
  db.update('users', user.id, {
    password_reset: { token_hash: tokenHash, email: user.email, expires_at: new Date(now + HOUR).toISOString(), next },
  });
  try {
    await mailer.send(resetEmail(user, `${origin}/reset-password#token=${token}`));
  } catch (err) {
    const fresh = db.byId('users', user.id);
    if (fresh && fresh.password_reset && fresh.password_reset.token_hash === tokenHash) clearToken(user.id);
    // A provider may quote what it was sent back in its error.
    console.warn(`Password reset: the email was not sent: ${String(err.message).split(token).join('[token]')}`);
  }
}

const router = express.Router();

// Off: straight through, so the answer is whatever any /api address that does not exist gets.
router.use((req, res, next) => next(active() ? undefined : 'router'));

router.post('/request', limit('password-reset-request', 30, HOUR, { by: byAddress }), (req, res) => {
  const body = req.body || {};
  const email = typeof body.email === 'string' ? normalizeEmail(body.email) : '';
  const next = safeNext(body.next);
  res.json({ ok: true });
  setImmediate(() => handleRequest(req, email, next).catch((err) => console.warn(`Password reset: the request failed: ${err.message}`)));
});

/** Is this link still good? Asked when the page opens, so nobody types a new password into a dead link. Spends nothing. */
router.post('/check', limit('password-reset-check', 60, 15 * 60 * 1000, { by: byAddress }), (req, res) => {
  res.json({ valid: !!holderOf(req.body && req.body.token) });
});

router.post('/reset', limit('password-reset-set', 30, 15 * 60 * 1000, { by: byAddress }), async (req, res) => {
  const body = req.body || {};
  const user = holderOf(body.token);
  if (!user) return res.status(400).json({ error: BAD_LINK, code: 'bad_link' });
  const password = typeof body.password === 'string' ? body.password : '';
  const weak = checkPassword(password); // the sign-up rules; a refused password does not spend the link
  if (weak) return res.status(400).json({ error: weak, code: 'weak_password' });
  const { next } = user.password_reset;
  // Spent before the wait: a second request with this link, however close behind, finds nothing.
  clearToken(user.id);
  let passwordHash;
  try {
    passwordHash = await passwords.hash(password, 10);
  } catch (err) {
    console.error(`Password reset: hashing failed: ${err.message}`);
    return res.status(500).json({ error: 'Something went wrong on our side. Ask for a new link and try again.' });
  }
  const fresh = db.byId('users', user.id);
  if (!fresh) return res.status(400).json({ error: BAD_LINK, code: 'bad_link' });
  db.update('users', user.id, {
    password_hash: passwordHash,
    password_reset: null, // and any link asked for during the wait
    session_epoch: (fresh.session_epoch || 0) + 1,
    password_changed_at: new Date().toISOString(),
  });
  const redirect = `/login?reset=1${next ? `&next=${encodeURIComponent(next)}` : ''}`;
  // This browser, if it was signed in to any saved account, signs in again like the others. A guest keeps its session, so signing in still brings its work along.
  if (req.user && !req.user.guest && req.session) {
    await new Promise((resolve) => { req.session.destroy(() => resolve()); });
    res.clearCookie('polymath.sid');
  }
  return res.json({ ok: true, redirect });
});

/** The sign-in page with the link on it, and a line after a reset. The file itself is untouched, which is what keeps it exact while this is off. */
function loginHtml(req) {
  let html = fs.readFileSync(path.join(PUBLIC, 'login.html'), 'utf8');
  if (signinOnly.active(req)) html = signinOnly.markHtml(html);
  const next = safeNext(req.query.next);
  const href = `/forgot-password${next ? `?next=${encodeURIComponent(next)}` : ''}`;
  html = html.replace('</form>', () => `</form>\n      <p class="auth-switch"><a href="${href}">Forgot password?</a></p>`);
  if (req.query.reset === '1') {
    html = html.replace('<div id="error"', () => '<div class="notice notice-success" role="status">Your password was changed. Sign in with the new one.</div>\n      <div id="error"');
  }
  return html;
}

/** Mounted ahead of the sign-in-only gate, which would send a logged-out visitor from these pages to sign-in. */
function pages(req, res, next) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  const page = req.path.toLowerCase().replace(/\/+$/, '').replace(/\.html?$/, '') || '/';
  const ours = page === SCRIPT || Object.prototype.hasOwnProperty.call(PAGES, page);
  if (!active()) {
    if (!ours) return next();
    if (!req.user && signinOnly.active(req)) return res.status(404).type('text/plain').send('Not found');
    return res.status(404).sendFile(path.join(PUBLIC, 'not-found.html'));
  }
  if (page === '/login' && !req.user) {
    res.setHeader('Cache-Control', 'no-cache');
    return res.type('html').send(loginHtml(req));
  }
  if (!ours) return next();
  res.setHeader('Cache-Control', 'no-store');
  if (page === SCRIPT) return res.sendFile(path.join(VIEWS, 'page.js'));
  const html = fs.readFileSync(path.join(VIEWS, PAGES[page]), 'utf8');
  return res.type('html').send(signinOnly.active(req) ? signinOnly.markHtml(html) : html);
}

module.exports = { router, pages, setup, active, eligible, safeNext };
