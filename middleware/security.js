/**
 * Security headers and the same-origin check on state-changing requests.
 *
 * Script sources are strict: no inline script, no third-party origin, so the
 * payload an XSS would need has nowhere to run. Style is the one concession —
 * progress meters, mastery bars, and per-track colors are computed values
 * written as style attributes, and the alternative today would be a class for
 * every percentage. It is a real if small loosening (styles can be used to
 * exfiltrate visible data), and the fix is a nonce on the rendered markup, which
 * belongs with the templating change in Phase 4.
 */
const isProduction = () => process.env.NODE_ENV === 'production';

/**
 * Where a page may send data (connect-src): this origin only, everywhere. No
 * third-party host, no ws:/wss:, no blob: or data: targets, so a frame, clip or
 * sound cannot be sent anywhere else even if code tried (the no-upload contract,
 * curriculum-build/KIDS-CAMERA-MIC-PRIVACY.md section 6, points 1 and 3).
 *
 * The camera and microphone tools' own pages (/engine/basketball/ and
 * /engine/piano/) are narrower still: they may only reach the app's API, which is
 * where outcomes (stars, note events, shot results) go. Inside a lesson the same
 * modules run in the lesson page, which needs 'self' for its other blocks; there
 * scripts/consent-test.js is the backstop, failing the build if a camera or mic
 * module gains a network call. The path form needs the origin spelled out, since
 * 'self' cannot carry a path.
 */
const CAMERA_MIC_PAGES = /^\/engine\/(basketball|piano)\//;

/**
 * Basketball body tracking (owner approved 2026-10-24; LIVE-CHANGES-2026-10-24.md):
 * MediaPipe Pose runs in the browser from the app's own files (/vendor/mediapipe/,
 * public/engine/basketball/pose.js). Its WebAssembly needs 'wasm-unsafe-eval' in
 * script-src, and it reads its wasm and model from /vendor/mediapipe/ (connect-src).
 * Both are granted on the camera pages only: the basketball tools' own pages
 * (/engine/basketball/) and the block-lesson page when it hosts the basketball
 * camera blocks (/base-lesson?track=basketball). Same origin only; no frame leaves
 * the device (scripts/consent-test.js no-upload scan). BODY_TRACKING=off takes both
 * grants away, and the tools fall back to motion as before.
 */
const BASKETBALL_PAGES = /^\/engine\/basketball\//;
function bodyTrackingOn() {
  return String(process.env.BODY_TRACKING || 'on').toLowerCase() !== 'off';
}
function bodyTrackingPage(req) {
  if (!bodyTrackingOn()) return false;
  if (BASKETBALL_PAGES.test(req.path)) return true;
  return /^\/base-lesson(\.html)?$/.test(req.path) && !!req.query && req.query.track === 'basketball';
}

function connectSrc(req) {
  if (CAMERA_MIC_PAGES.test(req.path)) {
    const host = req.get('host');
    if (host && /^[a-z0-9.:[\]-]+$/i.test(host)) {
      const origin = `${req.protocol}://${host}`;
      return `connect-src ${origin}/api/${bodyTrackingPage(req) ? ` ${origin}/vendor/mediapipe/` : ''}`;
    }
    return "connect-src 'none'";
  }
  // Every other page, the basketball lesson page included: 'self', which already
  // covers /vendor/mediapipe/.
  return "connect-src 'self'";
}

function scriptSrc(req) {
  return bodyTrackingPage(req) ? "script-src 'self' 'wasm-unsafe-eval'" : "script-src 'self'";
}

function securityHeaders(req, res, next) {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Microphone and camera are allowed for this origin only: the Spanish
  // section's speaking exercises record the learner, and grade projects can be
  // filmed. Every other origin stays blocked. An account that may not use them
  // (a child before a parent agrees, or with a parent's "camera and mic off")
  // gets both switched off by routes/consent.js permissionsGate.
  res.set('Permissions-Policy', 'geolocation=(), camera=(self), microphone=(self)');
  res.set('Content-Security-Policy', [
    "default-src 'self'",
    scriptSrc(req),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    // blob: so a learner can play back their own recording.
    "media-src 'self' blob:",
    // The typefaces are self-hosted in public/fonts (SIL OFL), so no font host is allowed.
    "font-src 'self'",
    connectSrc(req),
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join('; '));
  if (isProduction()) {
    res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
}

/**
 * A cookie-authenticated API needs an origin check, or any site the learner
 * visits could make their browser post to this one with their session attached.
 */
function enforceSameOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  const origin = req.get('origin');
  const referer = req.get('referer');
  const host = req.get('host');
  const allowed = new Set([
    `http://${host}`,
    `https://${host}`,
    ...(process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  ]);

  if (origin) {
    if (allowed.has(origin)) return next();
    return res.status(403).json({ error: 'Request blocked: origin not allowed.' });
  }
  if (referer) {
    try {
      const url = new URL(referer);
      if (allowed.has(url.origin)) return next();
    } catch { /* malformed referer is treated as missing */ }
    return res.status(403).json({ error: 'Request blocked: referer not allowed.' });
  }
  // Neither header present: a same-origin fetch from this app always sends one,
  // so this is either a non-browser client or a stripped request. Allow it only
  // when there is no session riding along.
  if (!req.session || !req.session.userId) return next();
  return res.status(403).json({ error: 'Request blocked: missing origin.' });
}

/** Keep private pages out of search results. */
function noIndex(req, res, next) {
  res.set('X-Robots-Tag', 'noindex, nofollow');
  next();
}

module.exports = { securityHeaders, enforceSameOrigin, noIndex, connectSrc, scriptSrc, bodyTrackingPage };
