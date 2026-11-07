/**
 * Sign-in only (owner, 2026-11-06): a logged-out visitor to beta.savantedu.com sees the sign-in page and nothing else
 * of the app, and no account can be made. Accounts that exist still sign in; a signed-in learner lands where they did.
 *
 * BETA_SIGNIN_ONLY=off restores the old site (landing page, sign-up). =on forces it everywhere. Unset, it is on for
 * every request except one made straight to this machine's own loopback address (a dev server, a test server, the
 * deploy kit's checks). That needs the connection AND the Host header to be local with no proxy header, which a
 * visitor coming through Caddy cannot produce: Caddy keeps the real Host, and only proxies the site names it serves.
 *
 * Public while on, because a visitor from an ad or a parent's email must never meet a login wall: the free ACT check
 * and its application form (live videos link there with ?ref=), the privacy page, the parent pages a consent email
 * opens, the offline page the service worker keeps, /healthz. Under /api nothing changes here (each route checks for
 * itself), and neither do static assets. Everything else, known page or not, goes to /login.
 */
const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PUBLIC_PAGES = new Set(['/login', '/act-check', '/privacy', '/offline', '/parent-consent', '/parent-form', '/parent', '/healthz']);
// These draw the shared header, so they carry a mark on <body> that tells it to drop the sign-up links (public/js/app.js).
const MARKED_PAGES = new Set(['/login', '/privacy', '/parent-consent', '/parent-form', '/parent']);
const CLOSED = { error: 'Savant is in a private beta and is not taking new accounts right now. Apply on our website to join.', beta: 'closed' };
const OFF = new Set(['0', 'off', 'false', 'no']);
const ON = new Set(['1', 'on', 'true', 'yes']);
const LOOPBACK_PEER = /^(127\.|::1$|::ffff:127\.)/;
const LOOPBACK_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

function directLocal(req) {
  const peer = (req.socket && req.socket.remoteAddress) || '';
  return LOOPBACK_PEER.test(peer) && LOOPBACK_HOST.test(String(req.headers.host || '')) && !req.headers['x-forwarded-host'];
}

/** Is the site sign-in only for this request? */
function active(req) {
  const setting = String(process.env.BETA_SIGNIN_ONLY || '').trim().toLowerCase();
  if (OFF.has(setting)) return false;
  if (ON.has(setting)) return true;
  return !directLocal(req);
}

const pageOf = (p) => (p.toLowerCase().replace(/\/+$/, '').replace(/\.html?$/, '') || '/');
// A file with an extension that is not a page. The check is on the raw path, so an encoded dot reads as a page and is gated.
const isAsset = (p) => /\.[a-z0-9]{1,12}$/i.test(p) && !/\.html?$/i.test(p);

const marked = new Map();
/** The page with its mark, and on the sign-in page without the block that offers sign-up. A deploy restarts the process, so a file read once stays right. */
function markedPage(page) {
  if (!marked.has(page)) {
    const html = fs.readFileSync(path.join(PUBLIC_DIR, `${page.slice(1)}.html`), 'utf8');
    marked.set(page, html.replace(/<!-- sign-up -->[\s\S]*?<!-- \/sign-up -->\s*/, '').replace('<body ', '<body data-signin-only="1" '));
  }
  return marked.get(page);
}

function gate(req, res, next) {
  if ((req.method !== 'GET' && req.method !== 'HEAD') || !active(req)) return next();
  const lower = req.path.toLowerCase();
  if (lower === '/api' || lower.startsWith('/api/') || isAsset(req.path)) return next();
  const page = pageOf(req.path);
  if (req.user) {
    if (page === '/login' || page === '/register') { res.setHeader('Cache-Control', 'no-store'); return res.redirect(302, '/'); }
    return next();
  }
  if (MARKED_PAGES.has(page)) {
    res.setHeader('Cache-Control', 'no-cache');
    return res.type('html').send(markedPage(page));
  }
  if (PUBLIC_PAGES.has(page)) return next();
  // no-store: a remembered redirect would send a learner back here after they sign in.
  res.setHeader('Cache-Control', 'no-store');
  const back = req.originalUrl;
  const worthKeeping = !['/', '/index', '/register', '/join'].includes(page) && back.startsWith('/') && !back.startsWith('//') && !back.includes('\\');
  return res.redirect(302, worthKeeping ? `/login?next=${encodeURIComponent(back)}` : '/login');
}

/** On the sign-up route itself, so no spelling of the address gets past it. */
function refuseSignUp(req, res, next) {
  return active(req) ? res.status(403).json(CLOSED) : next();
}

module.exports = { gate, active, refuseSignUp, PUBLIC_PAGES, CLOSED };
