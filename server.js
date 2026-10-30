/**
 * Polymath — an adaptive AI tutor.
 *
 * Start: `npm start` (or `npm run dev` for reload on change).
 * The site works with no API key: every screen runs on the deterministic content
 * bank, and the model only ever improves what is already there.
 */
require('dotenv').config();

// xKiro and UnoRouter are for the build pipeline only: their terms do not cover
// children, and no learner's words may reach them (services/providers/xkiro.js,
// unorouter.js). Both are switched on by an environment flag, so a server
// started from a pipeline shell, or with the flag copied into .env, would put
// them on every learner chain. The app server never honours the flags (security
// review 2026-10-24, finding 5).
for (const flag of ['XKIRO_PIPELINE', 'UNOROUTER_PIPELINE']) {
  if (process.env[flag]) {
    console.warn(`Ignoring ${flag}: build-pipeline providers are never used by the app server.`);
    delete process.env[flag];
  }
}

const express = require('express');
const session = require('express-session');
const path = require('path');
const crypto = require('crypto');

const { securityHeaders, enforceSameOrigin } = require('./middleware/security');
const { attachUser } = require('./middleware/auth');
const bank = require('./content/bank');

const app = express();
const PORT = Number(process.env.PORT || 6767);
const isProduction = process.env.NODE_ENV === 'production';

// A missing generator would mean a learner hitting a dead question mid-session,
// so the process refuses to start rather than fail later, in front of someone.
const missing = bank.missingSkills();
if (missing.length) {
  console.error(`Refusing to start: no content generator for ${missing.join(', ')}`);
  process.exit(1);
}

app.disable('x-powered-by');

// How many proxies sit in front of the app. This decides which address the app
// believes a request came from, so it is configured, never guessed: trusting a
// forwarded header when nothing is forwarding lets anyone put any address on
// their own requests and walk past every rate limit.
app.set('trust proxy', process.env.TRUST_PROXY !== undefined
  ? (Number.isNaN(Number(process.env.TRUST_PROXY)) ? process.env.TRUST_PROXY : Number(process.env.TRUST_PROXY))
  : (isProduction ? 1 : false));

app.use((req, res, next) => {
  if (isProduction && req.headers['x-forwarded-proto'] === 'http') {
    return res.redirect(308, `https://${req.headers.host}${req.originalUrl}`);
  }
  next();
});

app.use(securityHeaders);
// The body parser, skipped for the essay routes. A draft is markup rather than
// prose, and the same words in tags outrun the default ceiling, so those routes
// mount their own — see routes/essays.js. Everything else keeps 64kb, because
// raising it here would widen the surface for every route in the app.
// inflate: false: no browser sends a compressed body, and body-parser 1.20.8 (the
// one express 4.22.3 ships) can be made to hang on one (GHSA-27r3-jxmh-p828;
// security review 2026-10-24, finding 9). A compressed body is refused with 415.
const jsonBody = express.json({ limit: '64kb', inflate: false });
app.use((req, res, next) => (req.path.startsWith('/api/essays') ? next() : jsonBody(req, res, next)));

// The key that signs session cookies. In production a guessable key would let
// anyone forge a login cookie for any account, so the app refuses to run without
// a real one. In development a per-boot random key is fine: it only means
// restarting signs everyone out.
const secret = process.env.SESSION_SECRET;
if (isProduction && (!secret || secret.length < 32)) {
  console.error('Refusing to start: SESSION_SECRET must be at least 32 characters in production.');
  process.exit(1);
}
app.use(session({
  name: 'polymath.sid',
  secret: secret || crypto.randomBytes(48).toString('base64url'),
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    maxAge: 30 * 24 * 3600 * 1000,
  },
}));

app.use(attachUser);
// Age screen and parental consent (routes/consent.js). The permissions gate turns
// the camera and microphone off in the browser for an account that may not use
// them; the API gate keeps a child account's free text away from outside models
// and locks an account whose parent withdrew consent. Both run before any router.
const consent = require('./routes/consent');
app.use(consent.permissionsGate);
app.use('/api', enforceSameOrigin);
app.use('/api', consent.gate);

// Every API response is per-account and per-moment: a path, a dashboard, a
// session and a grade all change as the learner works. This is registered
// *before* the routers so a route cannot set its own header by accident, and it
// is `no-store` in development for the same reason the static files are.
//
// The static assets below already sent `no-store`, and that was not enough,
// which is worth recording. Levels 1-9 were on the wire from the route, absent
// from the page, and the cause was here: with no `Cache-Control` on an API
// response at all, the browser is free to apply a heuristic freshness lifetime
// and re-serve a stored copy on the next click — so "View path" replayed the
// path from before a grade had its levels. The scripts were fresh and the data
// was not, which is why checking the JavaScript proved nothing. A response with
// no cache header is a response that may be cached.
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', isProduction ? 'no-store' : 'no-store, must-revalidate');
  next();
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/consent', consent.router);
app.use('/api', require('./routes/catalog').router);
// The daily review (staged round 3; ADAPT_REVIEW_SESSION=on, 404 while off).
app.use('/api', require('./routes/review'));
app.use('/api', require('./routes/retention')); // study sessions, retention enforcers, the calendar (RETENTION_ENFORCERS)
app.use('/api/placement', require('./routes/placement'));
// The subject-level quiz: one walk up a whole subject, ending in a recommended
// percentage per grade for the learner who does not know where to start.
app.use('/api/subject-placement', require('./routes/subject-placement'));
app.use('/api/gap-scan', require('./routes/gap-scan')); // earlier-grade gaps after the subject placement, offered as a catch-up
app.use('/api', require('./routes/learn'));
app.use('/api', require('./routes/essays'));
app.use('/api', require('./routes/remediation'));
app.use('/api', require('./routes/profile'));
app.use('/api', require('./routes/goals')); // the goal picker: what a learner wants from a subject or grade (services/goals.js)
app.use('/api', require('./routes/referral')); // invite a friend: share code and counts (services/referrals.js)
app.use('/api', require('./routes/tutor')); // the persistent tutor (services/tutor.js)
app.use('/api', require('./routes/prefs')); // engagement settings: hide streak/XP, break line, time zone, next-study plan (config/ux.js)
// A held graduation (COVERAGE_GATE=enforce): what it waits on, and graduating once it is met.
app.use('/api/act', require('./routes/act')); // ACT score entry: test date, target, practice-test scores (services/act-scores.js)
app.use('/api/materials', require('./routes/materials')); // learn from your own material: upload, paste, list, delete (services/materials.js)
app.use('/api/act-study', require('./routes/act-study')); // the ACT measurement study: counterbalanced practice-test order, admin before/after (services/act-study.js)
app.use('/api/spanish-study', require('./routes/spanish-study')); // Savant vs Duolingo beginner-Spanish study (services/spanish-study.js)
app.use('/api', require('./routes/coverage'));
// Generated base-lesson pages, and the one way a generated page changes anything.
app.use('/api', require('./routes/base-lessons'));
// The chess puzzle trainer (rated puzzles and rush), graded on the server.
app.use('/api/chess', require('./routes/chess'));
// The piano song library and song path (stars per learner), scored on the server.
app.use('/api/piano', require('./routes/piano-songs'));
// Chess, piano and basketball: the skill record and its staged parts (skills
// round 3; SKILL_RECORD=on, every /api/skills route answers 404 while off).
app.use('/api', require('./routes/skills'));
// Every learner's scorecard and details, for the accounts in ADMIN_EMAILS.
app.use('/api/admin', require('./routes/admin'));
app.use(require('./routes/game-lab'));
// The Spanish section: its own API, and its rendered voice lines. Media files are
// named by a hash of their content, so they can be cached for good.
app.use('/api/es', require('./routes/spanish'));
// The daily Spanish check: one account only, sealed and timed (spanish-check/PROTOCOL.md).
app.use('/api/spanish-check', require('./routes/spanish-check'));
// The second sealed test, listening comprehension (spanish-check-lc/PROTOCOL.md): same single account.
app.use('/api/spanish-check-lc', require('./routes/spanish-check-lc'));
app.use('/spanish-media', express.static(path.join(__dirname, 'data', 'spanish-media'), {
  immutable: true, maxAge: '365d', fallthrough: false,
}));

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    ai: require('./services/ai').isEnabled(),
    // Which provider is actually answering, and why the preferred one is not.
    providers: require('./services/providers').status(),
    tracks: require('./config/curriculum').TRACKS.length,
    uptime_s: Math.round(process.uptime()),
  });
});

app.use('/api', (req, res) => res.status(404).json({ error: 'No such endpoint.' }));

// Static assets.
//
// `maxAge: 0` was not enough in development, and the symptom is a page that
// serves a stale script: the response says `public, max-age=0`, and `public`
// hands the file to any shared cache between the browser and here, and to the
// back/forward cache — so a click on "View path" runs the path.js that was
// there an hour ago, with none of the changes since. `no-store` in development
// says what is meant: do not keep this anywhere.
//
// Production keeps the one-hour max-age, because a deployed bundle does not
// change under a running server and re-downloading it every navigation is
// slower for no benefit. The filename is not versioned, so a deploy that
// changes a script is one where an hour of stale is acceptable.
app.use(express.static(path.join(__dirname, 'public'), {
  extensions: ['html'],
  maxAge: isProduction ? '1h' : 0,
  setHeaders: (res, file) => {
    if (!isProduction) res.setHeader('Cache-Control', 'no-store, must-revalidate');
    // The typefaces are also read by the sandboxed lesson frames (routes/base-lessons.js),
    // whose opaque origin makes a font load a cross-origin request. Public files only.
    if (/\.woff2?$/i.test(file)) res.setHeader('Access-Control-Allow-Origin', '*');
    // The service worker and manifest are re-checked on every visit so a deploy reaches phones at once.
    if (/[\\/]sw\.js$/.test(file)) { res.setHeader('Cache-Control', 'no-cache'); res.setHeader('Service-Worker-Allowed', '/'); }
    if (/\.webmanifest$/.test(file)) { res.setHeader('Content-Type', 'application/manifest+json'); res.setHeader('Cache-Control', 'no-cache'); }
  },
}));

// Anything else is a client-side route: serve the app shell.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('unhandled:', err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Something went wrong on our side.' });
});

app.listen(PORT, () => {
  // The after-level reads run in the background, one at a time.
  require('./services/learner-record').start();
  // Base levels shipped in content/base-levels are added if the data file lacks them.
  try {
    const shipped = require('./services/base-content').importAll();
    if (shipped.plans || shipped.games) console.log(`Base levels loaded: ${shipped.plans} lessons/retention/tests, ${shipped.games} games.`);
  } catch (err) {
    console.warn('Base levels could not be loaded:', err.message);
  }
  const ai = require('./services/ai');
  const providers = require('./services/providers');
  console.log(`Polymath listening on http://localhost:${PORT}`);
  if (ai.isEnabled()) {
    // Each kind of work can be on a different vendor, so say all three rather
    // than implying one model is doing everything.
    const say = (role, what) => {
      const p = providers.current(role);
      const next = providers.chain(role)[1];
      console.log(`  ${what.padEnd(34)} ${p ? `${p.name} ${p.modelFor(role)}` : 'question bank'}`
        + `${next ? ` (backup: ${next.name})` : p ? ' (no backup, pinned)' : ''}`);
    };
    console.log('AI on:');
    say('fast', 'chat, help, clarification');
    say('deep', 'lessons, analysis, authoring');
    say('regen', 'remaking a failed quiz');
    say('diagnose', 'reading a failed quiz');
  } else {
    console.log('AI off: running on the deterministic content bank. Set OPENROUTER_API_KEY or MIMO_API_KEY in .env to turn it on;');
    console.log('        `npm run ai:models` then lists the model ids your key can reach.');
  }
});
