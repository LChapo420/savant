/**
 * Serving a generated base lesson, its code, and finishing it.
 *
 * Three routes, and the splits are deliberate:
 *
 *   GET  the page, for an account allowed to see generated lessons
 *   POST its script, written to disk so the browser will load it
 *   POST finishing it, which is the only way a generated page changes anything
 *
 * The finish route is separate rather than a link out of the HTML because the page
 * is model-written: it is not trusted to know an enrollment id, and a page that
 * could mark a level complete for any account by carrying its own URL would be a
 * way to skip a whole course. The page is handed the id, and the id is the only
 * thing it is trusted with.
 *
 * ## Why the code is a file and not a string
 *
 * The app's content security policy is `script-src 'self'`, which forbids inline
 * script and `unsafe-eval`. So a lesson's code, which arrives from the model as a
 * string, cannot simply be run: not by writing it into the page, not with
 * `new Function`, not by appending a script whose text is set from a string. All
 * three are refused, and all three fail *quietly* — the lesson renders, its
 * styles apply, and none of its controls do anything.
 *
 * A same-origin file is the one form the policy permits. So the code is written
 * under `public/` and loaded as an ordinary `<script src>`, which is why this
 * route exists at all. It is not a general "run code" endpoint: it writes only
 * beneath the lesson's own directory, for a lesson that already exists, and only
 * for an account allowed to see it.
 */
const express = require('express');
const fs = require('fs');
const path = require('path');

const db = require('../config/db');
const curriculum = require('../config/curriculum');
const baseLessons = require('../config/base-lessons');
const subscriptions = require('../config/subscriptions');
const gameAssignments = require('../config/game-assignments');
const levelEditor = require('../services/level-editor');
const gamePayloads = require('../services/game-payloads');
const learner = require('../services/learner');
const mastery = require('../services/mastery');
const { requireAuth } = require('../middleware/auth');
const personalize = require('../services/personalize');
const scorecardHooks = require('../services/scorecard/hooks');
const learnerRecord = require('../services/learner-record');
const blockLevels = require('../services/block-levels');
const levelLogs = require('../services/level-logs');
const assist = require('../services/assist');
const writeAhead = require('../services/write-ahead');
const { limit } = require('../utils/rate-limit');
const crypto = require('crypto');

const router = express.Router();

/**
 * The inline scripts each account was served, per level, so the script route
 * below writes only code this server handed out.
 *
 * Before this, the route wrote whatever JavaScript the request carried, to a
 * file every learner on that level loads (security review 2026-10-24, finding 1):
 * any signed-in account allowed on a game level could post its own code and
 * have it run, same-origin, in the next learner's page. Now the route accepts a
 * script only when its text is one of the inline scripts in the page the GET
 * route served to this account for this level, and the file is named after the
 * text's hash, so one account's code can never replace another's.
 *
 * In memory, like the rate limits: a restart between the page and its script
 * request only means the page is opened again. Entries go after six hours.
 */
const SERVED_TTL_MS = 6 * 3600 * 1000;
const served = new Map();

/** The hash a script is known by. Line ends are normalised the way the browser's parser does. */
function scriptHash(code) {
  return crypto.createHash('sha256').update(String(code).replace(/\r\n?/g, '\n')).digest('hex');
}

/** The text of every inline (no src) script in a page, as the browser's template parse reads it. */
function inlineScripts(html) {
  const out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  let m;
  while ((m = re.exec(String(html || '')))) {
    if (!/\bsrc\s*=/i.test(m[1])) out.push(m[2]);
  }
  return out;
}

const servedKey = (userId, track, grade, level) => `${userId}|${track}|${grade}|${Number(level)}`;

/** Called wherever a page's HTML is sent to the browser. */
function rememberServed(userId, track, grade, level, html) {
  const now = Date.now();
  if (served.size > 5000) {
    for (const [k, v] of served) if (now - v.at > SERVED_TTL_MS) served.delete(k);
  }
  const key = servedKey(userId, track, grade, level);
  const prior = served.get(key);
  const hashes = prior && now - prior.at <= SERVED_TTL_MS && prior.hashes.size < 200 ? prior.hashes : new Set();
  for (const code of inlineScripts(html)) hashes.add(scriptHash(code));
  served.set(key, { at: now, hashes });
}

function wasServed(userId, track, grade, level, code) {
  const entry = served.get(servedKey(userId, track, grade, level));
  if (!entry || Date.now() - entry.at > SERVED_TTL_MS) return false;
  return entry.hashes.has(scriptHash(code));
}

// These engines are complete pages rather than small remade-game fragments.
// They load their own JavaScript, images, audio and (for Mario) a <base> URL.
// Keeping them in an iframe means none of those assets is mistaken for lesson
// code and sent through the lesson-script endpoint's 512 KB cap.
const FRAME_GAME_ENGINES = new Set(['mario', 'moto-x3m']);

function needsGameFrame(engineId) {
  return FRAME_GAME_ENGINES.has(String(engineId || ''));
}

function frameGameHtml(engineId, payload, track, grade, level) {
  const injected = gamePayloads.inject(engineId, payload);
  if (!injected) return null;

  // The payload is the only inline script in these engine pages. Give it a
  // nonce, then add a small external shell before the engine starts. The shell
  // owns the page-to-course event bridge; it does not contain game mechanics.
  const nonce = crypto.randomBytes(16).toString('base64');
  const withNonce = injected.replace(/<script>/g, `<script nonce="${nonce}">`);
  const attrs = ` data-course-game="true" data-track="${String(track)}"`
    + ` data-grade="${String(grade)}" data-level="${Number(level)}"`;
  let body = withNonce.replace(
    /<body([^>]*)>/i,
    `<body$1${attrs}><script src="/games/course-shell.js"></script>`,
  );
  if (engineId === 'moto-x3m') {
    const engineUrl = `/api/lessons/${encodeURIComponent(track)}/${encodeURIComponent(grade)}/${Number(level)}/moto-engine.js`;
    body = body.replace('src="motox3m4.min.js"', `src="${engineUrl}"`);
  } else if (engineId === 'mario') {
    const engineUrl = `/api/lessons/${encodeURIComponent(track)}/${encodeURIComponent(grade)}/${Number(level)}/mario-player.js`;
    body = body.replace('src="js/player.js"', `src="${engineUrl}"`);
  }
  return { html: body, nonce };
}

/** Serve a course-only full-page engine patch without changing standalone games. */
router.get('/lessons/:track/:grade/:level/:engine.js', requireAuth, (req, res) => {
  const { track, grade } = req.params;
  const level = Number(req.params.level);
  const assignment = gameAssignments.resolve(track, grade, level);
  const gradeRow = curriculum.getGrade(track, grade);
  const requested = req.params.engine;
  if (!gradeRow || !assignment || !['mario', 'moto-x3m'].includes(assignment.engineId)
    || requested !== `${assignment.engineId === 'mario' ? 'mario-player' : 'moto-engine'}`
    || !gamePayloads.accessFor(req.user, track, grade, level)) {
    return res.status(404).send('No such engine.');
  }
  const sourcePath = assignment.engineId === 'mario'
    ? path.join(__dirname, '..', 'public', 'games', 'mario', 'js', 'player.js')
    : path.join(__dirname, '..', 'public', 'games', 'moto-x3m', 'motox3m4.min.js');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const patched = assignment.engineId === 'mario'
    ? source.replace(
      "\tPlayer.prototype.exit = function() {",
      "\tPlayer.prototype.exit = function() {\n\t\tif (!this.exiting) { try { window.dispatchEvent(new CustomEvent('game:win', { detail: { source: 'mario', engineId: 'mario', result: 'win' } })); } catch (e) {} }",
    )
    : source.replace(
      'this.signalFinish.dispatch(1)',
      "this.signalFinish.dispatch(1),window.dispatchEvent(new CustomEvent('game:win',{detail:{source:'moto-x3m',engineId:'moto-x3m',result:'win'}}))",
    );
  res.type('application/javascript').set('Cache-Control', 'no-store').send(patched);
});

/**
 * Model-written pages run in a sandboxed frame (security review 2026-10-24, D4).
 *
 * A generated lesson page, a tailored page and a remade game page all carry code: the
 * lesson's from a model, the game's from the engine with model-written questions in
 * its data. Mounted into the course page, that code ran as Savant, with the learner's
 * session: it could read the learner's record, call any API as them, and a bad or
 * injected generation of a shared page would have been cross-site scripting for every
 * learner on that level.
 *
 * Now the course page gets a URL, `/api/lessons/:track/:grade/:level/page`, and loads
 * it in `<iframe sandbox="allow-scripts allow-forms">`, without allow-same-origin.
 * The response also carries `Content-Security-Policy: sandbox allow-scripts
 * allow-forms`, so even opened on its own (a link, a new tab) the document gets an
 * opaque origin. Inside it:
 *
 *   - the page cannot read the app's cookies, storage or DOM, and its requests reach
 *     the server as a cross-site `null` origin: no session rides along, and every
 *     state-changing /api call is refused by the same-origin check;
 *   - `connect-src 'none'`, `form-action 'none'`: no fetch, XHR, beacon or form post;
 *   - scripts run only with this response's nonce (or from this origin), and inline
 *     handlers only when their exact text was in the page the server sent;
 *   - it talks to the course page by postMessage only (public/js/lesson-frame.js),
 *     and the course page accepts a short list of messages, checked by source,
 *     origin ("null") and shape (public/js/base-lesson.js `frameMessage`).
 *
 * LESSON_SANDBOX=off brings back the old same-origin mount and the script route below
 * (LIVE-CHANGES-2026-10-24.md has the rollback).
 */
function sandboxOn() {
  return String(process.env.LESSON_SANDBOX || 'on').toLowerCase() !== 'off';
}

const FRAME_SANDBOX = 'allow-scripts allow-forms';

/** HTML attribute text as the browser reads it (the entities a page is likely to use). */
function decodeAttr(v) {
  return String(v)
    .replace(/&quot;/g, '"').replace(/&#0*39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

/** The inline event-handler attributes (onclick="...") in a page, as CSP hash sources. */
function handlerHashes(html) {
  const out = new Set();
  const tagRe = /<[a-z][^\s/>]*\s([^>]*)>/gi;
  let t;
  while ((t = tagRe.exec(String(html || '')))) {
    const attrRe = /(?:^|\s)on[a-z]+\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
    let a;
    while ((a = attrRe.exec(t[1]))) {
      const value = decodeAttr(a[1] !== undefined ? a[1] : a[2]);
      out.add(`'sha256-${crypto.createHash('sha256').update(value, 'utf8').digest('base64')}'`);
    }
    if (out.size > 200) break;
  }
  return [...out];
}

/** JSON that is safe inside a <script type="application/json"> block. */
function jsonForHtml(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

/**
 * The whole document the frame loads: the app's stylesheet (lessons were written
 * against it), the frame bridge, then the page. Every <script> tag gets the nonce.
 */
function sandboxDocument({ html, kind, track, grade, level, engineId = null, nextLevelUrl = null, cursorAt = 0 }) {
  const nonce = crypto.randomBytes(16).toString('base64');
  const body = String(html || '').replace(/<script\b(?![^>]*\bnonce=)/gi, `<script nonce="${nonce}"`);
  const config = { kind, track: String(track), grade: String(grade), level: Number(level), engineId, nextLevelUrl, cursorAt };
  const doc = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<link rel="stylesheet" href="/fonts/fonts.css">
<link rel="stylesheet" href="/css/style.css">
<style>html,body{margin:0;padding:0;background:transparent;min-height:0}body{overflow-x:hidden}#base-lesson-host{display:flow-root}</style>
<script type="application/json" id="polymath-frame-config">${jsonForHtml(config)}</script>
<script nonce="${nonce}" src="/js/level-capture.js"></script>
<script nonce="${nonce}" src="/js/lesson-frame.js"></script>
</head>
<body>
<div id="base-lesson-host">
${body}
</div>
</body>
</html>`;
  return { doc, nonce, handlers: handlerHashes(html) };
}

/** The headers that make the frame document a sandbox wherever it is opened. */
function sendSandboxed(req, res, built) {
  const host = req.get('host');
  const origin = host && /^[a-z0-9.:[\]-]+$/i.test(host) ? ` ${req.protocol}://${host}` : '';
  const handlers = built.handlers.length ? ` 'unsafe-hashes' ${built.handlers.join(' ')}` : '';
  res.removeHeader('X-Frame-Options');
  res.set('Content-Security-Policy', [
    `sandbox ${FRAME_SANDBOX}`,
    "default-src 'none'",
    `script-src 'self'${origin} 'nonce-${built.nonce}'${handlers}`,
    `style-src 'self'${origin} 'unsafe-inline'`,
    `img-src 'self'${origin} data: blob:`,
    `media-src 'self'${origin} data: blob:`,
    `font-src 'self'${origin}`,
    "connect-src 'none'",
    "form-action 'none'",
    "frame-src 'none'",
    "worker-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'self'",
  ].join('; '));
  res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.set('Referrer-Policy', 'no-referrer');
  res.set('Cross-Origin-Opener-Policy', 'same-origin');
  res.set('Cache-Control', 'no-store, must-revalidate');
  return res.type('html').send(built.doc);
}

const frameUrl = (track, grade, level) => `/api/lessons/${encodeURIComponent(track)}/${encodeURIComponent(grade)}/${Number(level)}/page`;

/**
 * The sandboxed document for one level: the game or page the JSON route below would
 * hand this account, under the same gates, in the same order.
 */
router.get('/lessons/:track/:grade/:level/page', requireAuth, async (req, res) => {
  const { track, grade } = req.params;
  const level = Number(req.params.level);
  const notFound = () => res.status(404).type('text').send('No such lesson.');
  if (!sandboxOn()) return notFound();
  const gradeRow = curriculum.getGrade(track, grade);
  if (!gradeRow || !Number.isInteger(level)) return notFound();
  const blockKind = blockLevels.kindFor(gradeRow, level);
  if ((blockKind === 'lesson' || blockKind === 'retention') && blockLevels.visibleTo(req.user)) {
    const { plan, writing } = await blockLevels.forLevel({ user: req.user, trackId: track, gradeId: grade, level });
    if (plan || writing) return notFound(); // a block level is laid out by the course page itself
  }
  const enrollmentId = enrollmentFor(req.user.id, track, grade);
  const cursorAt = Math.max(0, Math.min(1e6, Math.floor(Number(req.query.at) || 0)));
  const assignment = gameAssignments.resolve(track, grade, level);
  if (assignment && gamePayloads.accessFor(req.user, track, grade, level)) {
    if (needsGameFrame(assignment.engineId)) return notFound(); // served by /game-frame
    const ready = await gamePayloads.ensure(req.user.id, track, grade, level, { tailored: blockLevels.tailorsFor(req.user) });
    const html = ready ? gamePayloads.inject(assignment.engineId, ready.payload) : null;
    if (!html) return res.status(503).type('text').send('The game for this level is not ready yet.');
    return sendSandboxed(req, res, sandboxDocument({
      html, kind: 'game', track, grade, level, engineId: assignment.engineId, cursorAt,
      nextLevelUrl: enrollmentId ? `/session?enrollment=${enrollmentId}&level=${level + 1}` : null,
    }));
  }
  const mayEdit = subscriptions.canEditLevels(req.user, learner.getProfile(req.user.id));
  const edited = mayEdit ? levelEditor.forLevel(req.user.id, track, grade, level) : null;
  const shared = baseLessons.canSeeBaseLessons(req.user) ? baseLessons.get(track, grade, level) : null;
  const found = edited || shared;
  if (!found) return notFound();
  return sendSandboxed(req, res, sandboxDocument({ html: found.html, kind: 'page', track, grade, level }));
});

/**
 * Serve a complete engine in a same-origin frame. The parent course page owns
 * the learner/session contract; this route only serves the fixed engine with
 * the already validated question payload for this level.
 */
router.get('/lessons/:track/:grade/:level/game-frame', requireAuth, async (req, res) => {
  const { track, grade } = req.params;
  const level = Number(req.params.level);
  const assignment = gameAssignments.resolve(track, grade, level);
  const gradeRow = curriculum.getGrade(track, grade);
  if (!gradeRow || !assignment || !needsGameFrame(assignment.engineId)
    || !gamePayloads.accessFor(req.user, track, grade, level)) {
    return res.status(404).send('No such game.');
  }

  const ready = await gamePayloads.ensure(req.user.id, track, grade, level, {
    tailored: blockLevels.tailorsFor(req.user),
  });
  const frame = ready && frameGameHtml(assignment.engineId, ready.payload, track, grade, level);
  if (!frame) return res.status(503).send('The game for this level is not ready yet.');

  res.removeHeader('X-Frame-Options');
  const evalPolicy = assignment.engineId === 'moto-x3m' ? " 'unsafe-eval'" : '';
  res.set('Content-Security-Policy', `default-src 'self'; script-src 'self' 'nonce-${frame.nonce}'${evalPolicy}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'self'`);
  res.set('Cache-Control', 'no-store, must-revalidate');
  return res.type('html').send(frame.html);
});

/**
 * The page for one level: the learner's own if they have one, the shared one if
 * not.
 *
 * Two different questions are being answered here and they are deliberately not
 * collapsed, because they have different answers for different people:
 *
 *   - **A tailored page belongs to the learner it was written for.** Anyone on a
 *     plan that writes them has one, and only they can see it — it is theirs, not
 *     something that was shared.
 *   - **A shared page is still gated.** The owner and the accounts on
 *     `BASE_LESSON_ACCOUNTS`, because that page is the raw generated baseline and
 *     nothing has decided it should be public.
 *
 * Refused with 404 rather than 403 either way. The absence of a feature is not a
 * thing to advertise, and a 403 would confirm that a page exists where a 404 does
 * not.
 *
 * `kind` is sent alongside so the page's shell can decide what finishing means for
 * this level. A lesson is finished by reading it; a practice, quiz or exam level is
 * not, and its control leads into the session instead.
 */
router.get('/lessons/:track/:grade/:level', requireAuth, async (req, res) => {
  const { track, grade } = req.params;
  const level = Number(req.params.level);

  const gradeRow = curriculum.getGrade(track, grade);
  if (!gradeRow) return res.status(404).json({ error: 'No such lesson.' });

  // A game level comes first: when the pairing says this level is a game, the
  // game is what plays — the assignment is a deliberate choice, not a fallback.
  // Its questions are written once and kept, so this is usually a database read;
  // the first visit to a level writes them, and anyone waiting is told the truth
  // rather than shown half a game. Same gate as a generated lesson page: nothing
  // has decided a game is public.
  // A lesson or retention level built from blocks: the plan for this learner
  // (or the level's shared plan), as block data and checks without answers. The
  // page lays it out with the block library and asks the server about every
  // check. While a plan is still being written the page is told so, and asks
  // again; a level whose plan cannot be written falls through to its page below.
  const blockKind = blockLevels.kindFor(gradeRow, level);
  if ((blockKind === 'lesson' || blockKind === 'retention') && blockLevels.visibleTo(req.user)) {
    const { plan, writing } = await blockLevels.forLevel({ user: req.user, trackId: track, gradeId: grade, level });
    const enrollmentId = enrollmentFor(req.user.id, track, grade);
    const enrollment = enrollmentId ? db.byId('enrollments', enrollmentId) : null;
    if (enrollment) blockLevels.prefetchAhead({ user: req.user, enrollment, grade: gradeRow });
    if (plan) {
      res.set('Cache-Control', 'no-store, must-revalidate');
      const context = blockLevels.levelContext(track, grade, level);
      return res.json({
        track_id: track,
        grade_id: grade,
        level,
        plan: blockLevels.publicPlan(plan, req.user.id, blockLevels.checkItems(req.user, plan)),
        meta: {
          topic: context.topic,
          block_kind: blockKind,
          tailored: !!plan.user_id,
          approach: plan.approach || '',
          model: plan.model || null,
          generated_at: plan.finished_at || null,
        },
        basis: 'blocks',
        kind: curriculum.levelKind(level, gradeRow.pathLength, gradeRow),
        enrollment_id: enrollmentId,
      });
    }
    if (writing) {
      res.set('Cache-Control', 'no-store, must-revalidate');
      return res.status(202).json({
        writing: true, level, block_kind: blockKind, enrollment_id: enrollmentId,
        // Where the page goes if the writing takes too long: the standard session, lesson first.
        fallback_url: enrollmentId ? standardSessionUrl(enrollmentId, level) : null,
      });
    }
  }

  const assignment = gameAssignments.resolve(track, grade, level);
  if (assignment && gamePayloads.accessFor(req.user, track, grade, level)) {
    const ready = await gamePayloads.ensure(req.user.id, track, grade, level, { tailored: blockLevels.tailorsFor(req.user) });
    const html = ready ? gamePayloads.inject(assignment.engineId, ready.payload) : null;
    if (html) {
      const p = ready.payload;
      const kept = gamePayloads.stored(track, grade, level, req.user.id) || {};
      // Mario and Moto are fixed engines in their own frame (/game-frame); every other
      // game page runs in the sandboxed frame (/page) unless LESSON_SANDBOX=off.
      const sandboxed = !needsGameFrame(assignment.engineId) && sandboxOn();
      const frame = needsGameFrame(assignment.engineId)
        ? `/api/lessons/${encodeURIComponent(track)}/${encodeURIComponent(grade)}/${level}/game-frame`
        : sandboxed ? frameUrl(track, grade, level) : null;
      if (!frame) rememberServed(req.user.id, track, grade, level, html);
      res.set('Cache-Control', 'no-store, must-revalidate');
      return res.json({
        track_id: track,
        grade_id: grade,
        level,
        html: frame ? null : html,
        frame,
        sandboxed,
        meta: {
          engine_id: assignment.engineId,
          topic: p.meta.topic,
          subject: p.meta.subject,
          grade_band: p.meta.grade,
          age: { text: p.meta.ageRange },
          model: kept.model || null,
          generated_at: kept.generated_at || null,
          tailored: !!ready.tailored,
        },
        basis: 'game',
        kind: curriculum.levelKind(level, gradeRow.pathLength, gradeRow),
        enrollment_id: enrollmentFor(req.user.id, track, grade),
      });
    }
    // An assigned level whose questions could not be written says so plainly; the
    // session below it is untouched and the level is still playable the ordinary
    // way.
    return res.status(503).json({ error: 'The game for this level is not ready yet. Try again in a moment.' });
  }

  // The learner's own version first — and only while they are on a plan that
  // writes them. A tailored page is theirs, but it was written as part of a plan,
  // so dropping back to standard serves the shared page again rather than quietly
  // continuing to hand over the thing they stopped paying for. The page is not
  // deleted: it is still there, and a learner who comes back to pro gets it back.
  const mayEdit = subscriptions.canEditLevels(req.user, learner.getProfile(req.user.id));
  const edited = mayEdit ? levelEditor.forLevel(req.user.id, track, grade, level) : null;
  const shared = baseLessons.canSeeBaseLessons(req.user)
    ? baseLessons.get(track, grade, level)
    : null;

  const found = edited || shared;
  if (!found) {
    // A lesson or retention level whose block plan is not ready (its write failed,
    // or nothing can write it now) is never a dead end, and never questions alone:
    // the standard session teaches it, with the stored lesson or the bank's lesson
    // and its worked example first, then the checks (services/lessons.js forLevel).
    const enrollmentId = enrollmentFor(req.user.id, track, grade);
    if ((blockKind === 'lesson' || blockKind === 'retention') && enrollmentId) {
      res.set('Cache-Control', 'no-store, must-revalidate');
      return res.json({ ordinary: true, level, block_kind: blockKind, enrollment_id: enrollmentId, url: standardSessionUrl(enrollmentId, level) });
    }
    return res.status(404).json({ error: 'That lesson has not been written yet.' });
  }

  // The page's code runs in the sandboxed frame (see sandboxOn above), so its HTML is
  // not handed to the course page at all; with LESSON_SANDBOX=off it is, as before.
  const sandboxed = sandboxOn();
  if (!sandboxed) rememberServed(req.user.id, track, grade, level, found.html);
  res.set('Cache-Control', 'no-store, must-revalidate');
  res.json({
    track_id: track,
    grade_id: grade,
    level,
    html: sandboxed ? null : found.html,
    frame: sandboxed ? frameUrl(track, grade, level) : null,
    sandboxed,
    meta: found.meta,
    // Whether this page was written for this learner or is the shared one. The
    // page says so to the reader, and the difference matters: one is a baseline
    // and the other is theirs.
    basis: edited ? 'edited' : 'base',
    kind: curriculum.levelKind(level, gradeRow.pathLength, gradeRow),
    // The enrollment this page may be finished against, so the page does not have
    // to be told one. Null when the account is not on this course at all, in which
    // case the finish button has nothing to finish and says so.
    enrollment_id: enrollmentFor(req.user.id, track, grade),
  });
});

/** The standard session for this level: the level stood on, or (?level=) the one opened. */
function standardSessionUrl(enrollmentId, level) {
  const e = db.byId('enrollments', enrollmentId);
  const at = e && e.current_level !== level ? `&level=${level}` : '';
  return `/session?enrollment=${enrollmentId}&ordinary=1${at}`;
}

/** The account's live enrollment on a course, or null. */
function enrollmentFor(userId, track, grade) {
  const e = db.findOne('enrollments', (x) => x.user_id === userId
    && x.track_id === track && x.grade_id === grade);
  return e ? e.id : null;
}

/**
 * Write a lesson's code to disk and hand back the paths to load it from.
 *
 * The content security policy is `script-src 'self'`, so a lesson's behaviour
 * cannot come from a string in the page. It has to come from a file on this
 * origin, which is the only form the policy allows. So the code the model wrote is
 * saved next to the page and served back as an ordinary script.
 *
 * This is a write, and it is deliberately narrow:
 *
 *   - Only for a lesson that already exists, and only for an account allowed to
 *     see it. There is no way to create a page here.
 *   - Only beneath that lesson's own directory. The path is built from the same
 *     validated ids the read route uses, and the result is checked to be inside
 *     the lessons directory before anything is written — a name that survived
 *     validation still must not be able to climb out of it.
 *   - The file name is not taken from the request. It is derived from the level
 *     and an index, so nothing in the body can choose where on disk this lands.
 *   - The body is JavaScript, and it is written as JavaScript. It is not executed
 *     here, not parsed, and not interpolated into anything: it becomes a file the
 *     browser requests. A lesson that throws fails on the page, where a learner
 *     can see it, rather than taking the server down.
 */
router.post('/lessons/:track/:grade/:level/script', requireAuth, limit('lesson-script', 600, 60 * 60 * 1000), (req, res) => {
  // With the sandbox on, no lesson code is ever written into public/: the page's own
  // scripts run inside the sandboxed frame. The route only serves the rollback.
  if (sandboxOn()) return res.status(410).json({ error: 'Lessons now run in their own frame. Open the lesson again.' });
  const { track, grade: gradeId, level } = req.params;
  const levelNumber = Number(level);

  const isGameLevel = !!gameAssignments.resolve(track, gradeId, levelNumber);
  if (!baseLessons.canSeeBaseLessons(req.user)
    && !(isGameLevel && gamePayloads.accessFor(req.user, track, gradeId, levelNumber))) {
    return res.status(404).json({ error: 'No such lesson.' });
  }
  // A game level has no lesson page on disk, but its engine's code is written
  // here by the same rule: a level that resolves to a game is a level whose
  // scripts this route serves.
  if (!baseLessons.exists(track, gradeId, levelNumber) && !gameAssignments.resolve(track, gradeId, levelNumber)) {
    return res.status(404).json({ error: 'That lesson has not been written yet.' });
  }

  const scripts = Array.isArray(req.body && req.body.scripts) ? req.body.scripts : null;
  if (!scripts || !scripts.length) {
    return res.status(400).json({ error: 'No code was sent.' });
  }
  // A lesson is a page, not a program. Ten scripts is far more than any of them
  // has needed, and the cap is on size rather than on count being a guess.
  if (scripts.length > 10) {
    return res.status(400).json({ error: 'Too many scripts.' });
  }
  if (scripts.some((s) => typeof s !== 'string')) {
    return res.status(400).json({ error: 'Code must be text.' });
  }
  const total = scripts.reduce((n, s) => n + s.length, 0);
  if (total > 512 * 1024) {
    return res.status(413).json({ error: 'That lesson\'s code is too large to serve.' });
  }
  // Only code this server put in the page it served this account for this level
  // (see `rememberServed` above). Anything else is somebody's own JavaScript.
  if (scripts.some((code) => !wasServed(req.user.id, track, gradeId, levelNumber, code))) {
    return res.status(400).json({ error: 'That code is not part of this lesson. Open the lesson again.' });
  }

  // Written under `public/`, because that is the only directory the static mount
  // serves, and the whole point is that the browser can request this as an
  // ordinary same-origin script. `no-store` is set on it below: the file is
  // rewritten on every page load, so a cached copy would be yesterday's lesson
  // running against today's markup.
  const dir = path.join(baseLessons.PUBLIC_SCRIPT_DIR, String(track), String(gradeId));
  // The containment check, done on the resolved path rather than on the inputs:
  // `path.join` collapses `..`, and the ids are already restricted to word
  // characters, so this is belt and braces rather than the only guard.
  const root = path.resolve(baseLessons.PUBLIC_SCRIPT_DIR);
  const resolved = path.resolve(dir);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    return res.status(400).json({ error: 'That lesson cannot be served from there.' });
  }

  try {
    fs.mkdirSync(resolved, { recursive: true });
  } catch {
    return res.status(500).json({ error: 'The lesson\'s code could not be prepared.' });
  }

  // Named after the code's own hash: the same code always lands in the same file
  // (a reload gets the same URL and the directory does not fill with copies), and
  // two accounts served different code for one level (a tailored page beside the
  // shared one) never overwrite each other's file between the write and the load.
  const files = [];
  scripts.forEach((code) => {
    const name = `level-${levelNumber}-${scriptHash(code).slice(0, 24)}.js`;
    const file = path.join(resolved, name);
    if (path.dirname(path.resolve(file)) !== resolved) {
      throw new Error('a script would be written outside the lesson directory');
    }
    fs.writeFileSync(file, code, 'utf8');
    files.push(`/base-lesson-scripts/${track}/${gradeId}/${name}?v=${Date.now()}`);
  });

  res.json({ ok: true, files });
});

/** The same ids, validated the same way, for a lesson that already exists. */
function enrollmentFor(userId, track, grade) {
  const e = db.findOne('enrollments', (x) => x.user_id === userId
    && x.track_id === track && x.grade_id === grade);
  return e ? e.id : null;
}

/**
 * Mark a generated lesson's level complete and move on.
 *
 * The level is finished the way any other is: through the same mastery gate the
 * ordinary path uses, not by writing `current_level` directly. That matters more
 * here than anywhere else — a generated page has its own Finish button, so this is
 * the one place a learner can end a lesson without answering a question, and a
 * direct write would hand that power to a button on a page the model wrote.
 *
 * So: the level is recorded as cleared at full mastery, which is what finishing a
 * lesson means, and the enrollment advances to the next level the grade actually
 * has. A generated lesson that is not a lesson level — a quiz, say — is refused
 * rather than quietly treated as one.
 */
router.post('/lessons/:track/:grade/:level/finish', requireAuth, (req, res) => {
  const { track, grade: gradeId } = req.params;
  const level = Number(req.params.level);

  // The page this learner was shown: their own tailored version when they are on
  // a plan that writes them, otherwise the shared one if they may see it. A
  // learner reading a page written for them must be able to finish it whether or
  // not the shared page is open to their account.
  const mayEdit = subscriptions.canEditLevels(req.user, learner.getProfile(req.user.id));
  const edited = mayEdit ? levelEditor.forLevel(req.user.id, track, gradeId, level) : null;
  const shared = baseLessons.canSeeBaseLessons(req.user) && baseLessons.exists(track, gradeId, level)
    ? baseLessons.get(track, gradeId, level) : null;
  if (!edited && !shared) {
    return res.status(404).json({ error: 'No such lesson.' });
  }

  const grade = curriculum.getGrade(track, gradeId);
  if (!grade) return res.status(404).json({ error: 'No such subject.' });

  const enrollment = db.findOne('enrollments', (x) => x.user_id === req.user.id
    && x.track_id === track && x.grade_id === gradeId);
  if (!enrollment) return res.status(404).json({ error: 'You are not on that course.' });
  if (enrollment.status === 'graduated') {
    return res.status(409).json({ error: 'You have graduated this track.' });
  }

  // Only a lesson can be finished by reading it. A quiz is passed by answering it,
  // and a practice level is not finished at all — a button that marked either
  // complete would let a learner skip a checkpoint they never sat.
  const kind = curriculum.levelKind(level, grade.pathLength, grade);
  if (kind !== 'lesson') {
    return res.status(400).json({
      error: `Level ${level} is a ${kind}, not a lesson — only a lesson can be finished by reading it.`,
    });
  }

  // The enrollment has to be at this level, or one level behind. Finishing a
  // lesson you are not on would be a way to complete a course out of order, and
  // the level number in the URL is the only thing that says which lesson it is.
  //
  // At or one behind, and not merely "at or before": re-reading a lesson from
  // three levels back settles that lesson and must not hand out the credit for
  // the one the learner is actually on. `completeLesson` advances whatever level
  // the enrollment is standing at, so handing it a level far behind the position
  // marked the *current* lesson finished without the learner having read it —
  // which is a whole level skipped, and the one gap that must not exist in a
  // course whose levels are the creator's.
  const standing = enrollment.current_level || 1;
  if (level > standing) {
    return res.status(409).json({
      error: `Level ${level} is ahead of where you are (level ${standing}).`
        + ' Finish the levels in order.',
    });
  }
  if (level < standing - 1) {
    return res.status(409).json({
      error: `Level ${level} is behind where you are (level ${standing}).`
        + ' Lessons are finished in order — use Revisit on your own level instead.',
    });
  }

  // Finishing a lesson is finishing the lesson: `completeLesson` is what the
  // session path calls when a learner works through one, and it is the only thing
  // here that can advance a lesson.
  //
  // It is not `tryLevelUp`, which is what this route called first. A *practice*
  // level is decided by mastery, and `tryLevelUp` reports a lesson as
  // `requires: 'lesson'` without moving anybody — so the button recorded mastery,
  // the gate said the level was ready, and the learner sat where they were with a
  // button that appeared to do nothing. Reimplementing "advance if earned" beside
  // the real one is how that happened.
  const moved = mastery.completeLesson(req.user.id, db.byId('enrollments', enrollment.id), grade);

  // Evidence for the learning scorecard: how long the page was read against how
  // long it is. How well it taught is judged by the next practice level, which is
  // credited back to this record (services/scorecard/hooks.js).
  const page = edited || shared;
  const words = String(page.html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .split(/\s+/).filter(Boolean).length;
  const arm = edited
    ? (edited.meta.arm || 'tailored')
    : mayEdit && personalize.armFor(req.user.id, { trackId: track, gradeId, level }).arm === 'holdout' ? 'holdout' : 'base';
  // What they did on the page itself — its controls, its own checks — for the read.
  if (req.body && Array.isArray(req.body.interactions)) {
    levelLogs.save({ userId: req.user.id, trackId: track, gradeId, level, source: 'page', rows: req.body.interactions, finished: true });
  }
  scorecardHooks.onBaseLessonFinished(req.user.id, {
    trackId: track,
    gradeId,
    level,
    skillId: curriculum.levelPlan(grade, level).focus,
    readMs: req.body && req.body.read_ms,
    scrollBacks: req.body && req.body.scroll_backs,
    words,
    basis: edited ? 'edited' : 'base',
    arm,
    experiment: edited ? edited.meta.experiment || null : null,
  });
  // The after-level read. A lesson page has no questions, so it only runs if the
  // learner says something about it.
  learnerRecord.scheduleDebrief({
    userId: req.user.id, trackId: track, gradeId, level, kind: 'lesson', source: 'lesson page',
  });

  const after = db.byId('enrollments', enrollment.id);

  // The learner just moved on, which is the moment to start writing the level they
  // are moving to. Not awaited: they are about to read a page, and the work belongs
  // in the background where it has that page's whole reading time to finish.
  levelEditor.prefetchNext(req.user.id, after, after.current_level);
  // And the block levels ahead (write-ahead; nothing when WRITE_AHEAD=off).
  writeAhead.trigger({ user: req.user, enrollment: after, grade, reason: 'level finished' });

  res.json({
    finished: level,
    level: after.current_level,
    advanced: !!moved.advanced,
    next_kind: moved.next_kind || curriculum.levelKind(after.current_level, grade.pathLength, grade),
    next_lesson: curriculum.nextLessonLevel(grade, after.current_level),
    path_length: grade.pathLength,
  });
});

/**
 * One answer given inside a game, recorded like any practice answer.
 *
 * A game level's questions are its work: the same evidence a practice sitting
 * would have collected — right or not, at what difficulty, how long it took —
 * folded into the same skill state, so the level's mastery gate reads a played
 * game exactly as it reads a worked session. The difficulty comes from the
 * stored question, not from the page: a page the model could write does not get
 * to say how hard its own questions were.
 */
router.post('/lessons/:track/:grade/:level/game-answer', requireAuth, (req, res) => {
  const { track, grade: gradeId } = req.params;
  const level = Number(req.params.level);

  const grade = curriculum.getGrade(track, gradeId);
  if (!grade) return res.status(404).json({ error: 'No such subject.' });
  if (!gameAssignments.resolve(track, gradeId, level) || !gamePayloads.accessFor(req.user, track, gradeId, level)) {
    return res.status(404).json({ error: 'No such lesson.' });
  }

  const kept = gamePayloads.stored(track, gradeId, level, req.user.id);
  const question = kept && kept.payload && (kept.payload.questions || [])
    .find((q) => q.id === String(req.body.question_id || ''));
  if (!question) return res.status(400).json({ error: 'No such question.' });

  const plan = curriculum.levelPlan(grade, level);
  // The level teaches a small set of skills and the game's questions teach the
  // level, so each answer trains one of them in turn. The gate measures the
  // whole set, and a game that trained only one skill would leave the level
  // permanently short of the others however well it was played.
  const skills = (plan.introduced && plan.introduced.length) ? plan.introduced : [plan.focus];
  const at = Number(req.body.question_index) || 0;
  // A bank game's question (BANK_GAMES; services/game-bank.js) is the bank's own
  // item for one skill, so when that skill is one the gate measures here it trains
  // that skill rather than the next one in turn (curriculum-build/GAMES-PLACEMENT.md,
  // R6). A question on a skill outside the measured set is credited in turn, as before.
  const ownSkill = kept.payload.source === 'bank' && skills.includes(String(question.skill || '')) ? String(question.skill) : null;
  const skillId = ownSkill || skills[at % skills.length];
  // Help asked of the chat assist on this question before answering it makes the
  // answer weaker evidence, exactly as the coach does on a session question.
  const assisted = !!db.findOne('assist_chats', (c) => c.user_id === req.user.id && c.track_id === track
    && c.grade_id === gradeId && c.level === level && c.ref === `game:${question.id}` && !c.answered);
  mastery.recordAttempt({
    userId: req.user.id,
    skillId,
    correct: !!req.body.correct,
    difficulty: Number(question.difficulty) || 5,
    levelDifficulty: plan.difficulty,
    latencyMs: Number(req.body.ms) || 0,
    itemId: `game:${question.id}`,
    hintUsed: assisted,
  });
  // The answer is an item like any other, so the scorecard and the after-level
  // read see a played game the way they see a worked session. The engine says
  // whether it was right, not which wrong option was picked.
  const answerText = (question.choices || [])[Number(question.answerIndex)] || '';
  const gameItem = db.insert('items', {
    session_id: null,
    user_id: req.user.id,
    skill_id: skillId,
    skill_name: curriculum.skillName(skillId),
    difficulty: Number(question.difficulty) || 5,
    format: 'multiple_choice',
    prompt: question.prompt,
    choices: question.choices || null,
    answer: answerText,
    rationale: question.explanation || '',
    role: 'game',
    level,
    track_id: track,
    grade_id: gradeId,
    game_play: String(req.body.play || '').slice(0, 40) || null,
    game_question: question.id,
    user_answer: req.body.correct ? answerText : '(a wrong option)',
    correct: !!req.body.correct,
    ms: Math.max(0, Math.min(3600000, Number(req.body.ms) || 0)),
    coach_used: assisted,
    source: 'game',
  });
  scorecardHooks.onAnswer(req.user.id, gameItem, { trackId: track });

  const enrollment = enrollmentFor(req.user.id, track, gradeId);
  if (enrollment) {
    // The same counter the session flow keeps: the level-up gate counts the
    // questions answered at the level, and a game's questions are those.
    const row = db.byId('enrollments', enrollment);
    db.update('enrollments', enrollment, { level_items: (row.level_items || 0) + 1 });
  }
  res.json({ ok: true, skill: skillId });
});

/**
 * The game ended: settle the level through the gate practice already uses.
 *
 * The page never decides whether it passed — it reports what happened, and the
 * mastery gate decides. The gate is only asked about the level the learner is
 * standing on: `tryLevelUp` advances whatever level the enrollment is at, so
 * running it from a game opened behind them would settle the level they are on
 * without ever playing it.
 */
router.post('/lessons/:track/:grade/:level/game-finish', requireAuth, (req, res) => {
  const { track, grade: gradeId } = req.params;
  const level = Number(req.params.level);

  const grade = curriculum.getGrade(track, gradeId);
  if (!grade) return res.status(404).json({ error: 'No such subject.' });
  if (!gameAssignments.resolve(track, gradeId, level) || !gamePayloads.accessFor(req.user, track, gradeId, level)) {
    return res.status(404).json({ error: 'No such lesson.' });
  }
  const enrollmentId = enrollmentFor(req.user.id, track, gradeId);
  const enrollment = db.byId('enrollments', enrollmentId);
  if (!enrollment) return res.status(404).json({ error: 'You are not on that course.' });

  const plan = curriculum.levelPlan(grade, level);
  const standing = enrollment.current_level || 1;
  // The gate is only asked about the level the learner is standing on. A game
  // opened behind them is practice — worth playing, and it does not settle
  // anything, because the level it would settle is already behind them.
  const settles = level === standing;
  let moved = { advanced: false, progress: null };
  if (settles) {
    // A lesson-kind game level is cleared by working through it, like any other
    // lesson; everything else is decided by mastery.
    moved = plan.kind === 'lesson'
      ? mastery.completeLesson(req.user.id, enrollment, grade)
      : mastery.tryLevelUp(req.user.id, enrollment, grade);
    // Spanish levels are settled by the path's own pass mark (services/spanish/path.js),
    // not the practice gate: a game level the Duolingo-style player cannot build used to
    // leave the learner standing on it, with the next level shut. Finishing it with
    // 60% of the answers right (or no graded answers) moves them on.
    const correct = Math.max(0, Number(req.body && req.body.correct) || 0);
    const wrong = Math.max(0, Number(req.body && req.body.wrong) || 0);
    const accuracy = correct + wrong > 0 ? correct / (correct + wrong) : null;
    if (!moved.advanced && track === 'spanish' && enrollment.status === 'active'
      && (accuracy === null || accuracy >= 0.6)) {
      const to = mastery.advance(enrollment, grade);
      moved = { advanced: to !== level, level: to, progress: moved.progress };
    }
  }
  // The after-level read of the game: this play's answers, and anything they said.
  const play = String((req.body && req.body.play) || '').slice(0, 40);
  const played = db.find('items', (i) => i.user_id === req.user.id && i.role === 'game' && i.level === level
    && i.track_id === track && i.grade_id === gradeId && (play ? i.game_play === play : true))
    .slice(-60).map((i) => i.id);
  learnerRecord.scheduleDebrief({
    userId: req.user.id, trackId: track, gradeId, level, kind: 'game', source: 'game', itemIds: played,
  });
  const after = db.byId('enrollments', enrollment.id);
  writeAhead.trigger({ user: req.user, enrollment: after, grade, reason: 'level finished' });
  const progress = moved.progress || {};
  res.json({
    advanced: !!moved.advanced,
    settled: settles,
    standing,
    level: after.current_level,
    result: String(req.body.result || ''),
    correct: Number(req.body.correct) || 0,
    wrong: Number(req.body.wrong) || 0,
    progress: {
      ready: !!progress.ready,
      average: progress.average,
      weakest: progress.weakest,
      items: progress.items,
      blockers: progress.blockers || [],
    },
    next_kind: curriculum.levelKind(after.current_level, grade.pathLength, grade),
  });
});

/**
 * Grade one check on a block level.
 *
 * The page never knew the answer: it sends what the learner chose or typed,
 * and the server grades it against the plan it served, records it as an item
 * (so the mastery gate and the after-level read see it), and only then says
 * what the right answer was and why.
 */
router.post('/lessons/:track/:grade/:level/check', requireAuth, (req, res) => {
  const { track, grade: gradeId } = req.params;
  const level = Number(req.params.level);
  if (!blockLevels.visibleTo(req.user)) return res.status(404).json({ error: 'No such lesson.' });
  const plan = blockLevels.servedPlan(req.user, track, gradeId, level);
  if (!plan) return res.status(404).json({ error: 'No such lesson.' });
  const result = blockLevels.answerCheck({
    user: req.user,
    plan,
    checkId: req.body && req.body.check_id,
    answer: req.body && req.body.answer,
    ms: req.body && req.body.ms,
  });
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

/**
 * Finish a block level.
 *
 * Every graded check has to be answered first: they are the level's evidence.
 * Then the level is settled the way its kind is everywhere else — a lesson is
 * completed by working through it, a retention level by the mastery gate — and
 * only for the level the learner is standing on, so a level opened behind them
 * is review that settles nothing. The per-block time and interactions the page
 * measured are kept on the plan, and the after-level read is queued with the
 * checks' answers.
 */
router.post('/lessons/:track/:grade/:level/block-finish', requireAuth, (req, res) => {
  const { track, grade: gradeId } = req.params;
  const level = Number(req.params.level);
  if (!blockLevels.visibleTo(req.user)) return res.status(404).json({ error: 'No such lesson.' });
  const plan = blockLevels.servedPlan(req.user, track, gradeId, level);
  if (!plan) return res.status(404).json({ error: 'No such lesson.' });

  const grade = curriculum.getGrade(track, gradeId);
  if (!grade) return res.status(404).json({ error: 'No such subject.' });
  const enrollment = db.findOne('enrollments', (x) => x.user_id === req.user.id
    && x.track_id === track && x.grade_id === gradeId);
  if (!enrollment) return res.status(404).json({ error: 'You are not on that course.' });
  if (enrollment.status === 'graduated') return res.status(409).json({ error: 'You have graduated this track.' });

  const answered = new Set(Object.keys(plan.answers || {})
    .filter((k) => k.startsWith(`${req.user.id}:`)).map((k) => k.slice(String(req.user.id).length + 1)));
  const open = (plan.checks || []).filter((c) => !answered.has(c.id));
  if (open.length) {
    return res.status(409).json({ error: `Answer the ${open.length === 1 ? 'last question' : `${open.length} questions`} first.`, open: open.map((c) => c.id) });
  }

  const standing = enrollment.current_level || 1;
  if (level > standing) {
    return res.status(409).json({ error: `Level ${level} is ahead of where you are (level ${standing}). Finish the levels in order.` });
  }

  const telemetry = blockLevels.recordTelemetry(req.user, plan, req.body && req.body.blocks, { finished: true });
  const settles = level === standing;
  let moved = { advanced: false, progress: null };
  if (settles) {
    moved = plan.kind === 'lesson'
      ? mastery.completeLesson(req.user.id, enrollment, grade)
      : mastery.tryLevelUp(req.user.id, enrollment, grade);
  }

  const itemIds = blockLevels.itemIdsFor(req.user, plan);
  if (plan.kind === 'lesson') {
    const words = JSON.stringify((plan.blocks || []).map((b) => b.data)).replace(/[{}"\[\],:]/g, ' ')
      .split(/\s+/).filter(Boolean).length;
    scorecardHooks.onBaseLessonFinished(req.user.id, {
      trackId: track,
      gradeId,
      level,
      skillId: curriculum.levelPlan(grade, level).focus,
      readMs: req.body && req.body.read_ms,
      scrollBacks: req.body && req.body.scroll_backs,
      words,
      basis: plan.user_id ? 'edited' : 'base',
      arm: plan.arm || (plan.user_id ? 'tailored' : 'base'),
      experiment: plan.experiment || null,
    });
  }
  learnerRecord.scheduleDebrief({
    userId: req.user.id, trackId: track, gradeId, level, kind: plan.kind, source: 'block level', itemIds,
  });

  const after = db.byId('enrollments', enrollment.id);
  blockLevels.prefetchAhead({ user: req.user, enrollment: after, grade });
  const right = itemIds.map((id) => db.byId('items', id)).filter((i) => i && i.correct).length;
  const progress = moved.progress || {};
  res.json({
    finished: level,
    settled: settles,
    advanced: !!moved.advanced,
    level: after.current_level,
    correct: right,
    asked: itemIds.length,
    blocks_seen: telemetry.length,
    progress: {
      ready: !!progress.ready,
      average: progress.average,
      weakest: progress.weakest,
      items: progress.items,
      blockers: progress.blockers || [],
    },
    next_kind: moved.next_kind || curriculum.levelKind(after.current_level, grade.pathLength, grade),
    path_length: grade.pathLength,
  });
});

/**
 * What the learner did on a level, sent as they leave the page (and again if
 * they come back and leave again) — so a level walked away from still reaches
 * their record. The latest report is kept; finishing sends the same picture.
 * If there is anything in it, the level's after-level read is queued (it joins
 * any read already waiting for this level rather than adding a second).
 */
router.post('/lessons/:track/:grade/:level/log', requireAuth, (req, res) => {
  const { track, grade: gradeId } = req.params;
  const level = Number(req.params.level);
  const grade = curriculum.getGrade(track, gradeId);
  if (!grade || !Number.isInteger(level) || level < 1 || level > grade.pathLength) {
    return res.status(404).json({ error: 'No such level.' });
  }
  const source = ['blocks', 'page', 'game'].includes(req.body && req.body.source) ? req.body.source : 'page';
  const rows = req.body && req.body.blocks;
  let itemIds = [];
  if (source === 'blocks') {
    const plan = blockLevels.servedPlan(req.user, track, gradeId, level);
    if (!plan) return res.status(404).json({ error: 'No such lesson.' });
    blockLevels.recordTelemetry(req.user, plan, rows);
    itemIds = blockLevels.itemIdsFor(req.user, plan);
  } else {
    levelLogs.save({ userId: req.user.id, trackId: track, gradeId, level, source, rows });
    if (source === 'game') {
      itemIds = db.find('items', (i) => i.user_id === req.user.id && i.role === 'game' && i.level === level
        && i.track_id === track && i.grade_id === gradeId).slice(-60).map((i) => i.id);
    }
  }
  if (levelLogs.anything(rows) || itemIds.length) {
    learnerRecord.scheduleDebrief({
      userId: req.user.id, trackId: track, gradeId, level,
      kind: source === 'game' ? 'game' : curriculum.levelKind(level, grade.pathLength, grade),
      source: 'left the level', itemIds,
    });
  }
  res.json({ ok: true });
});

/**
 * Chat assist on a block of a lesson or retention level, or on the question on
 * screen in a game level. Not on checkpoints or essays — they are the test, and
 * they are not served here. A lesson's graded checks use the question coach
 * (/api/items/:id/coach and /ask) on their own items instead.
 */
router.post('/lessons/:track/:grade/:level/assist', requireAuth, limit('assist', 150, 60 * 60 * 1000), async (req, res) => {
  const { track, grade: gradeId } = req.params;
  const level = Number(req.params.level);
  const target = (req.body && req.body.target) || {};
  const messages = req.body && req.body.messages;
  if (target.type === 'block') {
    if (!blockLevels.visibleTo(req.user)) return res.status(404).json({ error: 'No such lesson.' });
    const plan = blockLevels.servedPlan(req.user, track, gradeId, level);
    if (!plan) return res.status(404).json({ error: 'No such lesson.' });
    const out = await assist.onBlock({ user: req.user, plan, index: target.index, messages });
    if (out.error) return res.status(400).json(out);
    return res.json(out);
  }
  if (target.type === 'game') {
    if (!gameAssignments.resolve(track, gradeId, level) || !gamePayloads.accessFor(req.user, track, gradeId, level)) {
      return res.status(404).json({ error: 'No such lesson.' });
    }
    const kept = gamePayloads.stored(track, gradeId, level, req.user.id);
    const out = await assist.onGameQuestion({
      user: req.user, trackId: track, gradeId, level, payload: kept && kept.payload, questionIndex: target.question_index, messages,
    });
    if (out.error) return res.status(400).json(out);
    return res.json(out);
  }
  if (target.type === 'page') {
    const mayEdit = subscriptions.canEditLevels(req.user, learner.getProfile(req.user.id));
    const edited = mayEdit ? levelEditor.forLevel(req.user.id, track, gradeId, level) : null;
    const shared = baseLessons.canSeeBaseLessons(req.user) && baseLessons.exists(track, gradeId, level)
      ? baseLessons.get(track, gradeId, level) : null;
    const page = edited || shared;
    if (!page) return res.status(404).json({ error: 'No such lesson.' });
    return res.json(await assist.onPage({ user: req.user, trackId: track, gradeId, level, html: page.html, messages }));
  }
  res.status(400).json({ error: 'Nothing to help with there.' });
});

module.exports = router;
// The page-script reading the script route trusts, for scripts/security-test.js.
module.exports.inlineScripts = inlineScripts;
// The sandboxed frame's pieces, for scripts/security-test.js.
module.exports.sandboxDocument = sandboxDocument;
module.exports.sendSandboxed = sendSandboxed;
module.exports.handlerHashes = handlerHashes;
module.exports.sandboxOn = sandboxOn;
module.exports.FRAME_SANDBOX = FRAME_SANDBOX;
