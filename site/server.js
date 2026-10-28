#!/usr/bin/env node
/**
 * Savant public site: serves the static pages and stores form submissions.
 *
 *   node server.js                 run the site (PORT, default 8787)
 *   node server.js forget <email>  delete every submission for an address
 *   node server.js export          write data/export-<form>.csv for each form
 *   node server.js admin-hash      print ADMIN_PASSWORD_HASH=... for admin.env (the
 *                                  password comes from ADMIN_PASSWORD_INPUT, or is
 *                                  typed without echo, or is piped in on stdin)
 *   node server.js admin-totp      print a new ADMIN_TOTP_SECRET=... and its otpauth:// URI
 *   node server.js admin-verify-code  read a 6-digit code on stdin; exit 0 if it matches
 *                                  ADMIN_TOTP_SECRET now (used by the VM's setup.sh)
 *   node server.js geo-update      download this month's DB-IP city file and rebuild geo/ip-city.bin
 *
 * The private admin page (admin.js) is configured by admin.env; see README.md,
 * "Private admin page". It is off, and its path is an ordinary 404, until
 * ADMIN_USER, ADMIN_PASSWORD_HASH and ADMIN_TOTP_SECRET are all set and valid.
 *
 * Submissions go to data/<form>.jsonl (one JSON object per line; data/ is
 * gitignored). Spam guards: a honeypot field, a minimum fill time, a per-IP and
 * a per-form rate limit (in memory; the IP is never stored with a submission), a
 * small body limit, and same-origin checks on every POST (Origin / Sec-Fetch-Site),
 * so another website cannot post forms on a visitor's behalf. The site sets
 * no cookies and loads nothing from other hosts.
 *
 * Visit statistics (analytics.js, analytics-report.js, geo.js): POST /api/visit,
 * /api/visit-events and /api/visit-choice, sent by assets/site.js. See README.md,
 * "Visit statistics", and privacy.html.
 *
 * Environment:
 *   PORT          port to listen on (default 8787)
 *   HOST          address to bind (default 127.0.0.1; 0.0.0.0 when NODE_ENV=production)
 *   SITE_ORIGINS  comma-separated origins allowed to post, e.g.
 *                 https://savant.example,https://www.savant.example
 *                 (default: the request's own host only). Also used for CORS
 *                 when the pages live on a static host and this runs elsewhere.
 *   TRUST_PROXY   express "trust proxy" value when behind a proxy (e.g. 1)
 *   DATA_DIR      where the .jsonl files go (default ./data)
 *   RATE_PER_IP   submissions per IP per form per 10 minutes (default 5)
 *   RATE_PER_FORM submissions per form per hour, all IPs (default 300)
 *   MIN_FILL_MS   a form sent faster than this after it was shown is treated
 *                 as a bot (default 1500)
 *   ADMIN_ENV_FILE  the admin page's private env file (default ./admin.env)
 *   GEO_FILE      the IP geolocation file (default ./geo/ip-city.bin). Without it,
 *                 every visit is counted anonymously only.
 *   DATA_MAX_MB   the data folder's size cap (default 2000); over it, the oldest
 *                 months of visit statistics are deleted first
 *   VISIT_RATE_PER_IP  page-view beacons per IP per 10 minutes (default 60)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const creators = require('./creators');

const ROOT = __dirname;
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const FORMS = ['updates', 'beta', 'investors'];
const CONSENT_TEXT = {
  updates: 'Send me occasional updates about Savant.',
  beta: 'Savant may email me about the beta.',
  age_ok: "I am 13 or older, or I'm a parent signing up for my child.",
};
const ROLES = ['learner', 'parent', 'teacher'];
// The beta's "Why should we accept you?" answer, in characters after trimming.
const WHY_MIN = 30;
const WHY_MAX = 1000;
const WHY_QUESTION = 'Why should we accept you?';
const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/;

/* ── storage ─────────────────────────────────────────────────────────────── */

function fileFor(form) { return path.join(DATA_DIR, `${form}.jsonl`); }

/**
 * Owner-only data: makes DATA_DIR (created if missing) and every folder under it
 * 0700 and every file 0600, so only the service user can read them, whatever
 * put them there (a restored backup, a copy). Run at start; new files are
 * created 0600 anyway. Symlinks are left alone. Not on Windows. Returns how many
 * modes it changed.
 */
function lockDownData(dir = DATA_DIR) {
  if (process.platform === 'win32') return 0;
  let changed = 0;
  const fix = (p, want) => {
    const st = fs.lstatSync(p);
    if ((st.mode & 0o777) !== want) { fs.chmodSync(p, want); changed += 1; }
  };
  const walk = (d) => {
    fix(d, 0o700);
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) fix(p, 0o600);
    }
  };
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    walk(dir);
  } catch (e) {
    console.error(`[site] could not make ${dir} private: ${e.message}`);
  }
  if (changed) console.warn(`[site] made ${changed} item${changed === 1 ? '' : 's'} in ${dir} owner-only (folders 0700, files 0600).`);
  return changed;
}

// One write at a time, so an append never interleaves with a rewrite.
let queue = Promise.resolve();
function serial(fn) {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

function readAll(form) {
  let text;
  try { text = fs.readFileSync(fileFor(form), 'utf8'); } catch (e) { return []; }
  return text.split('\n').filter(Boolean).map((line) => {
    try { return JSON.parse(line); } catch (e) { return null; }
  }).filter(Boolean);
}

function append(form, record) {
  return serial(() => {
    fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
    fs.appendFileSync(fileFor(form), `${JSON.stringify(record)}\n`, { mode: 0o600 });
  });
}

// Replaces a file in one step (write a temporary copy, then rename), mode 0600.
function rewrite(file, lines) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, lines.map((l) => `${l}\n`).join(''), { mode: 0o600 });
  try { fs.chmodSync(tmp, 0o600); } catch (e) { /* Windows */ }
  fs.renameSync(tmp, file);
}

/**
 * Drops the records of one form that match (at most `limit` of them), through
 * the serial queue so it never races an append. Lines that do not parse are
 * kept as they are. Returns how many went.
 */
function removeRecords(form, match, limit = Infinity) {
  return serial(() => {
    const file = fileFor(form);
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch (e) { return 0; }
    let removed = 0;
    const keep = text.split('\n').filter(Boolean).filter((line) => {
      if (removed >= limit) return true;
      let r;
      try { r = JSON.parse(line); } catch (e) { return true; }
      if (r && typeof r === 'object' && match(r)) { removed += 1; return false; }
      return true;
    });
    if (removed) rewrite(file, keep);
    return removed;
  });
}

/**
 * Removes every record for an email from every form, and with `analytics`, the
 * visit statistics linked to those submissions (every visit from the IPs they
 * were linked to). Returns { records, visits }: how many of each went.
 */
async function forget(email, analytics) {
  let records = 0;
  const ids = [];
  for (const form of FORMS) {
    records += await removeRecords(form, (r) => {
      if (r.email !== email) return false;
      if (typeof r.id === 'string') ids.push(r.id);
      return true;
    });
  }
  const visits = analytics ? await analytics.forgetSubmissions(ids) : 0;
  return { records, visits };
}

/* ── validation ──────────────────────────────────────────────────────────── */

// Strip control characters (keeping newlines and tabs where text allows them).
function clean(v, { multiline = false } = {}) {
  if (typeof v !== 'string') return '';
  const s = v.normalize('NFC').replace(multiline ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g, '');
  return s.trim();
}
const ticked = (v) => v === true || v === 'yes' || v === 'on' || v === 'true';

function checkEmail(raw, errors) {
  const email = clean(raw).toLowerCase();
  if (!email) errors.email = 'Enter your email address.';
  else if (email.length > 254 || !EMAIL_RE.test(email)) errors.email = 'That does not look like an email address. Check for a typo.';
  return email;
}
function checkName(raw, errors, label) {
  const name = clean(raw);
  if (!name) errors.name = label;
  else if (name.length > 80) errors.name = 'Keep this under 80 characters.';
  return name;
}

/** Returns { errors } or { record } for a form's body. */
function validate(form, body) {
  const errors = {};
  const at = new Date().toISOString();
  const id = crypto.randomBytes(8).toString('hex');
  if (form === 'updates') {
    const email = checkEmail(body.email, errors);
    if (!ticked(body.consent)) errors.consent = 'Tick this so we can send you updates.';
    return Object.keys(errors).length ? { errors } : {
      record: { id, at, form, email, consent: true, consent_text: CONSENT_TEXT.updates },
    };
  }
  if (form === 'beta') {
    const email = checkEmail(body.email, errors);
    const name = checkName(body.name, errors, 'Enter a name or nickname.');
    const role = clean(body.role);
    if (!ROLES.includes(role)) errors.role = 'Choose learner, parent or teacher.';
    const why = clean(body.why, { multiline: true });
    if (!why) errors.why = 'Tell us why we should accept you.';
    else if (why.length < WHY_MIN) errors.why = `Tell us a little more: at least ${WHY_MIN} characters.`;
    else if (why.length > WHY_MAX) errors.why = 'Keep this under 1,000 characters.';
    if (!ticked(body.age_ok)) errors.age_ok = 'Please confirm this to apply. Under 13? Ask a parent to apply for you.';
    if (!ticked(body.consent)) errors.consent = 'Tick this so we can email you about the beta.';
    return Object.keys(errors).length ? { errors } : {
      record: {
        id, at, form, email, name, role,
        why, why_question: WHY_QUESTION,
        age_confirmed: true, age_text: CONSENT_TEXT.age_ok,
        consent: true, consent_text: CONSENT_TEXT.beta,
        status: 'applied',
        ref: creators.pickCode(body) || null,
      },
    };
  }
  if (form === 'investors') {
    const name = checkName(body.name, errors, 'Enter your name.');
    const email = checkEmail(body.email, errors);
    const firm = clean(body.firm);
    if (firm.length > 120) errors.firm = 'Keep this under 120 characters.';
    const message = clean(body.message, { multiline: true });
    if (message.length < 10) errors.message = 'Write a short note, at least 10 characters.';
    else if (message.length > 4000) errors.message = 'Keep this under 4,000 characters.';
    return Object.keys(errors).length ? { errors } : {
      record: { id, at, form, name, email, firm: firm || null, message },
    };
  }
  if (form === 'forget') {
    const email = checkEmail(body.email, errors);
    return Object.keys(errors).length ? { errors } : { record: { email } };
  }
  return { errors: { form: 'Unknown form.' } };
}

/* ── spam guards ─────────────────────────────────────────────────────────── */

const RATE_PER_IP = Number(process.env.RATE_PER_IP || 5);
const RATE_PER_FORM = Number(process.env.RATE_PER_FORM || 300);
const MIN_FILL_MS = Number(process.env.MIN_FILL_MS || 1500);
const IP_WINDOW = 10 * 60 * 1000;
const FORM_WINDOW = 60 * 60 * 1000;
const hits = new Map(); // key -> array of timestamps, in memory only

function limited(key, max, windowMs) {
  const now = Date.now();
  const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (list.length >= max) { hits.set(key, list); return Math.ceil((windowMs - (now - list[0])) / 1000); }
  list.push(now);
  hits.set(key, list);
  return 0;
}
// Per-IP entries are dropped once their 10-minute window has passed, so an IP
// address is held for at most about 15 minutes (the privacy page says so);
// the per-form counters ("form|*") hold no address and keep their hour.
setInterval(() => {
  const now = Date.now();
  for (const [k, list] of hits) {
    const windowMs = k.endsWith('|*') ? FORM_WINDOW : IP_WINDOW;
    if (!list.some((t) => now - t < windowMs)) hits.delete(k);
  }
}, 5 * 60 * 1000).unref();

const ALLOWED = (process.env.SITE_ORIGINS || '').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);

function originAllowed(req) {
  const origin = req.get('origin');
  if (origin && origin !== 'null') {
    if (ALLOWED.length) return ALLOWED.includes(origin);
    try { return new URL(origin).host === req.get('host'); } catch (e) { return false; }
  }
  // No Origin (older browsers on same-origin form posts): fall back to the fetch
  // metadata, then the Referer. With none of them, refuse.
  const site = req.get('sec-fetch-site');
  if (site) return site === 'same-origin';
  const ref = req.get('referer');
  if (ref) {
    try {
      const u = new URL(ref);
      return ALLOWED.length ? ALLOWED.includes(u.origin) : u.host === req.get('host');
    } catch (e) { return false; }
  }
  return false;
}

/* ── app ─────────────────────────────────────────────────────────────────── */

const VISIT_RATE_PER_IP = Number(process.env.VISIT_RATE_PER_IP || 60);
const GEO_FILE = path.resolve(process.env.GEO_FILE || path.join(ROOT, 'geo', 'ip-city.bin'));

/** The visit statistics collector for this data folder (and the geo data, when present). */
function openAnalytics({ now, pendingMs, maintenance, quiet } = {}) {
  const geo = require('./geo').loadGeo(GEO_FILE);
  if (!geo && !quiet) console.warn(`[visits] no geo data at ${GEO_FILE}: every visit is counted anonymously only. Run: node server.js geo-update`);
  return require('./analytics').createAnalytics({ dataDir: DATA_DIR, serial, geo, now, pendingMs, maintenance, env: process.env });
}

/**
 * opts (for tests): now, a clock in ms for the admin page; adminLoginFloorMs,
 * the least time every admin sign-in answer takes (default 500); visitsNow and
 * visitPendingMs for the visit statistics; analytics, an existing collector.
 */
function createApp(opts = {}) {
  const express = require('express');
  const app = express();
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY) {
    const v = process.env.TRUST_PROXY;
    app.set('trust proxy', /^\d+$/.test(v) ? Number(v) : v);
  }
  const analytics = opts.analytics || openAnalytics({ now: opts.visitsNow, pendingMs: opts.visitPendingMs });
  app.locals.analytics = analytics;

  app.use((req, res, next) => {
    res.set({
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'X-Frame-Options': 'DENY',
    });
    if (req.secure) res.set('Strict-Transport-Security', 'max-age=31536000');
    next();
  });

  // Never served, whatever the route: dotfiles and admin.env* (any spelling or
  // encoding of the path). They get the normal 404 page.
  const NEVER = /(^|[/\\])(\.|admin\.env)/i;
  app.use((req, res, next) => {
    let p = req.path;
    try { p = decodeURIComponent(p); } catch (e) { /* keep the raw path */ }
    if (NEVER.test(p) || NEVER.test(req.path)) return res.status(404).sendFile(path.join(ROOT, '404.html'));
    return next();
  });

  // CORS, only for the origins in SITE_ORIGINS (pages on a static host), and only
  // on the real endpoints; any other /api path is the plain 404 below.
  const API_ROUTES = new Set(['health', ...FORMS, 'forget', 'visit', 'visit-events', 'visit-choice'].map((n) => `/${n}`));
  app.use('/api', (req, res, next) => {
    if (!API_ROUTES.has(req.path)) return next();
    const origin = req.get('origin');
    if (origin && ALLOWED.includes(origin)) {
      res.set({ 'Access-Control-Allow-Origin': origin, Vary: 'Origin' });
      if (req.method === 'OPTIONS') {
        res.set({ 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Content-Type, Accept', 'Access-Control-Max-Age': '600' });
        return res.sendStatus(204);
      }
    }
    if (req.method === 'OPTIONS') return res.sendStatus(403);
    return next();
  });

  app.get('/api/health', (req, res) => res.set('Cache-Control', 'no-store').json({ ok: true }));

  // 16 KB: room for the longest answers in non-Latin scripts (a form post
  // percent-encodes each such character as up to 9 bytes), still small.
  const json = express.json({ limit: '16kb', strict: true });
  const form = express.urlencoded({ extended: false, limit: '16kb', parameterLimit: 20 });

  const wantsHtml = (req) => req.is('application/x-www-form-urlencoded') && !String(req.get('accept') || '').includes('application/json');
  function reply(req, res, status, payload) {
    if (!wantsHtml(req)) return res.status(status).set('Cache-Control', 'no-store').json(payload);
    if (status < 300) return res.redirect(303, '/thanks.html');
    return res.status(status).type('html').send(errorPage(payload));
  }

  for (const kind of [...FORMS, 'forget']) {
    app.post(`/api/${kind}`, (req, res, next) => {
      if (!originAllowed(req)) return res.status(403).json({ ok: false, error: 'Sign-ups are only accepted from the Savant website.' });
      if (!req.is('application/json') && !req.is('application/x-www-form-urlencoded')) {
        return res.status(415).json({ ok: false, error: 'Unsupported content type.' });
      }
      return next();
    }, json, form, async (req, res) => {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const ipWait = limited(`${kind}|${req.ip}`, RATE_PER_IP, IP_WINDOW);
      const formWait = ipWait ? 0 : limited(`${kind}|*`, RATE_PER_FORM, FORM_WINDOW);
      const wait = ipWait || formWait;
      if (wait) {
        res.set('Retry-After', String(wait));
        return reply(req, res, 429, { ok: false, error: 'Too many tries. Please wait a few minutes and try again.' });
      }
      // Bots: a filled honeypot, or a form "filled in" faster than a person can.
      // They get the same answer as everyone else, and nothing is kept.
      const elapsed = Number(body.elapsed);
      if (clean(body.website) || (body.elapsed !== undefined && (!Number.isFinite(elapsed) || elapsed < MIN_FILL_MS))) {
        return reply(req, res, 200, { ok: true });
      }
      const { errors, record } = validate(kind, body);
      if (errors) return reply(req, res, 400, { ok: false, errors });
      try {
        if (kind === 'forget') {
          await forget(record.email, analytics);
          return reply(req, res, 200, { ok: true });
        }
        // Updates and beta: one entry per address. A repeat gets the same answer,
        // so the form never reveals who is already on a list.
        if (kind !== 'investors' && readAll(kind).some((r) => r.email === record.email)) {
          return reply(req, res, 200, { ok: true });
        }
        await append(kind, record);
        // Visit statistics: link the submission to this visitor's IP, if it was
        // recorded (identified) in the last 24 hours. The form record is unchanged.
        await analytics.linkSubmission(req.ip, kind, record.id).catch((e) => console.error('[visits] could not link a submission:', e.message));
        return reply(req, res, 200, { ok: true });
      } catch (e) {
        console.error(`[site] could not save ${kind}:`, e.message);
        return reply(req, res, 500, { ok: false, error: 'Something went wrong on our side. Please try again later.' });
      }
    });
  }

  // Visit statistics: small JSON beacons from assets/site.js (fetch, or sendBeacon
  // as text/plain), same-origin only, rate limited. Bots, the signed-in admin and
  // ADMIN_ALLOW_IPS are answered but nothing is kept.
  const beaconBody = express.text({ type: ['text/plain', 'application/json'], limit: '16kb' });
  const beacons = {
    visit: [VISIT_RATE_PER_IP, 20000, (r) => analytics.visit(r)],
    'visit-events': [VISIT_RATE_PER_IP * 5, 100000, (r) => analytics.events(r)],
    'visit-choice': [10, 2000, (r) => analytics.choice(r)],
  };
  for (const [name, [perIp, perHour, handle]] of Object.entries(beacons)) {
    app.post(`/api/${name}`, (req, res, next) => {
      if (!originAllowed(req)) return res.status(403).json({ ok: false });
      if (!req.is('application/json') && !req.is('text/plain')) return res.status(415).json({ ok: false });
      return next();
    }, beaconBody, async (req, res) => {
      res.set('Cache-Control', 'no-store');
      let body;
      try { body = JSON.parse(typeof req.body === 'string' ? req.body : ''); } catch (e) { return res.status(400).json({ ok: false }); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return res.status(400).json({ ok: false });
      const wait = limited(`${name}|${req.ip}`, perIp, IP_WINDOW) || limited(`${name}|*`, perHour, FORM_WINDOW);
      if (wait) { res.set('Retry-After', String(wait)); return res.status(429).json({ ok: false }); }
      const skip = typeof app.locals.isAdminVisit === 'function' && app.locals.isAdminVisit(req);
      try {
        const out = await handle({ ip: req.ip, ua: String(req.get('user-agent') || ''), headers: req.headers, host: req.get('host'), body, skip });
        return res.json(out);
      } catch (e) {
        console.error(`[visits] ${name}:`, e.message);
        return res.status(500).json({ ok: false });
      }
    });
  }
  app.all('/api/*', (req, res) => res.status(404).json({ ok: false, error: 'Not found.' }));

  // The private admin page (admin.js). Not configured, or not allowed for this
  // request, it falls through to the normal 404 below.
  require('./admin').mountAdmin(app, {
    express, root: ROOT, dataDir: DATA_DIR, forms: FORMS, readAll, removeRecords, serial, originAllowed, toCsv,
    now: opts.now, loginFloorMs: opts.adminLoginFloorMs, env: process.env, analytics,
  });

  // Static files: an explicit list, so server.js, data/, README and the rest
  // are never served.
  const cache = (secs) => (res) => res.set('Cache-Control', `public, max-age=${secs}`);
  app.use('/assets', express.static(path.join(ROOT, 'assets'), { dotfiles: 'deny', index: false, setHeaders: cache(3600) }));
  app.use('/fonts', express.static(path.join(ROOT, 'fonts'), { dotfiles: 'deny', index: false, setHeaders: cache(86400 * 30) }));
  const PAGES = {
    '/': 'index.html', '/index.html': 'index.html',
    '/privacy': 'privacy.html', '/privacy.html': 'privacy.html',
  '/evidence': 'evidence.html', '/evidence.html': 'evidence.html',
    '/thanks': 'thanks.html', '/thanks.html': 'thanks.html',
    '/config.js': 'config.js', '/favicon.svg': 'favicon.svg',
  };
  // /beta?ref=<creator code>: the home page with the code already in the beta form
  // (also without JavaScript). The code is cleaned to a-z 0-9 . _ - so it is safe in HTML.
  const homeHtml = () => fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  app.get('/beta', (req, res) => {
    const code = creators.pickCode(req.query);
    res.set('Cache-Control', 'no-store').type('html').send(homeHtml().replace('name="ref" value=""', `name="ref" value="${code}"`));
  });
  app.get('/creators', (req, res) => {
    res.set({ 'Cache-Control': 'public, max-age=300', 'X-Robots-Tag': 'noindex' });
    res.sendFile(path.join(ROOT, 'creators.html'));
  });
  for (const [route, file] of Object.entries(PAGES)) {
    app.get(route, (req, res) => {
      res.set('Cache-Control', 'public, max-age=300');
      res.sendFile(path.join(ROOT, file));
    });
  }
  app.use((req, res) => res.status(404).sendFile(path.join(ROOT, '404.html')));
  // Bad JSON, bodies over the limit and the like: a plain 400/413, no stack.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) console.error('[site]', err.message);
    res.status(status).json({ ok: false, error: status === 413 ? 'That was too long.' : 'That request could not be read.' });
  });
  return app;
}

function errorPage(payload) {
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const items = payload.errors ? Object.values(payload.errors) : [payload.error || 'That did not go through.'];
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Check your details | Savant</title><link rel="stylesheet" href="/assets/site.css"><script src="/assets/theme.js"></script></head>
<body><main id="main" class="wrap"><article class="doc"><h1>Nearly there.</h1><p>Please go back and fix:</p>
<ul>${items.map((m) => `<li>${esc(m)}</li>`).join('')}</ul><p>Use your browser's back button to return to the form with your answers, or go to <a href="/">the home page</a>.</p></article></main></body></html>`;
}

/* ── command line ────────────────────────────────────────────────────────── */

function toCsv(rows) {
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const cell = (v) => {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // keep spreadsheets from running formulas
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n') + '\n';
}

if (require.main === module) {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === 'forget') {
    const email = clean(arg || '').toLowerCase();
    if (!EMAIL_RE.test(email)) { console.error('Usage: node server.js forget <email>'); process.exit(1); }
    const analytics = openAnalytics({ maintenance: false, quiet: true });
    forget(email, analytics).then(({ records, visits }) => {
      console.log(`Removed ${records} record${records === 1 ? '' : 's'} and ${visits} linked visit${visits === 1 ? '' : 's'} for ${email}.`);
      process.exit(0);
    });
  } else if (cmd === 'geo-update') {
    require('./tools/build-geo').update().then(() => process.exit(0), (e) => { console.error(`geo-update failed: ${e.message}`); process.exit(1); });
  } else if (cmd === 'export') {
    fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
    for (const f of FORMS) {
      const rows = readAll(f);
      fs.writeFileSync(path.join(DATA_DIR, `export-${f}.csv`), toCsv(rows), { mode: 0o600 });
      console.log(`${f}: ${rows.length} row${rows.length === 1 ? '' : 's'} -> ${path.join(DATA_DIR, `export-${f}.csv`)}`);
    }
  } else if (cmd === 'admin-hash') {
    require('./admin').cliHash().catch((e) => { console.error(e.message); process.exit(1); });
  } else if (cmd === 'admin-totp') {
    require('./admin').cliTotp({ root: ROOT });
  } else if (cmd === 'admin-verify-code') {
    require('./admin').cliVerifyCode({ root: ROOT }).catch((e) => { console.error(e.message); process.exit(2); });
  } else {
    const port = Number(process.env.PORT || 8787);
    const host = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
    lockDownData();
    const app = createApp();
    app.listen(port, host, () => {
      console.log(`[site] Savant site on http://${host === '0.0.0.0' ? 'localhost' : host}:${port} (data in ${DATA_DIR})`);
      const a = app.locals.admin;
      if (a && a.enabled) {
        console.log(`[admin] private page on (authenticator code required, IP allow-list ${a.allowList ? 'on' : 'off'})`);
        if (process.env.TRUST_PROXY && host !== '127.0.0.1' && host !== '::1' && host !== 'localhost') {
          console.warn('[admin] TRUST_PROXY is set but the server listens on all addresses: anyone who reaches this port directly can fake their IP. Set HOST=127.0.0.1 behind the proxy.');
        }
      }
    });
  }
}

module.exports = { createApp, openAnalytics, validate, forget, removeRecords, readAll, toCsv, lockDownData, WHY_MIN, WHY_MAX, DATA_DIR };
