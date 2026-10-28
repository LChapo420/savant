/**
 * Exercise the base-lesson finish path without HTTP, as a signed-in request.
 *
 * The browser check needs a password, and the only route that can set one is
 * `/api/dev/set-password`, which exists behind `DEV_TOOLS` — a flag deliberately
 * off unless a person turns it on. Enabling it to check a button would leave a
 * route that can reset any account's password switched on, which is a far larger
 * thing to hand back than a lesson page.
 *
 * So this drives the same router with a session already attached, which is the
 * part the button actually depends on:
 *
 *   GET  /lessons/:track/:grade/:level          — the page, and the enrollment id
 *   POST /lessons/:track/:grade/:level/finish   — what `polymathFinishLesson` calls
 *
 * Every guard in the finish route is the real one, because this is the real
 * router with the real middleware — not a reimplementation of it.
 */
const express = require('express');
const path = require('path');

const db = require('../config/db');
const curriculum = require('../config/curriculum');
const baseLessons = require('../config/base-lessons');
const router = require('../routes/base-lessons');
const { requireAuth } = require('../middleware/auth');

const [userIdRaw, trackId, gradeId, levelRaw] = process.argv.slice(2);
const userId = Number(userIdRaw);
const level = Number(levelRaw);

if (!Number.isInteger(userId) || !trackId || !gradeId || !Number.isInteger(level)) {
  console.error('usage: node scripts/check-finish-path.js <userId> <track> <grade> <level>');
  process.exit(1);
}

const user = db.byId('users', userId);
if (!user) { console.error(`no user ${userId}`); process.exit(1); }

const app = express();
// The finish route reads a JSON body; the global 64kb parser is mounted in
// server.js, and a lesson id is a few bytes.
app.use(express.json({ limit: '64kb' }));
// Stand in for the session and the two middlewares that run before every route.
// `attachUser` resolves req.user from the session, and `enforceSameOrigin` is
// the CSRF guard — neither has anything to say about which lesson may be
// finished, which is the question here.
app.use((req, res, next) => { req.user = user; req.session = { userId: user.id }; next(); });
app.use(router);

const server = app.listen(0);
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

async function call(method, route, body) {
  const res = await fetch(base + route, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { parsed = text.slice(0, 300); }
  return { status: res.status, body: parsed };
}

(async () => {
  const grade = curriculum.getGrade(trackId, gradeId);
  const before = db.findOne('enrollments', (e) => e.user_id === userId
    && e.track_id === trackId && e.grade_id === gradeId);

  console.log(`user ${userId} (${user.email})`);
  console.log(`  may see base lessons: ${baseLessons.canSeeBaseLessons(user)}`);
  console.log(`  page generated:       ${baseLessons.exists(trackId, gradeId, level)}`);
  console.log(`  level ${level} is a:   ${curriculum.levelKind(level, grade.pathLength, grade)}`);
  console.log(`  standing on level:    ${before.current_level}\n`);

  const page = await call('GET', `/lessons/${trackId}/${gradeId}/${level}`);
  console.log(`GET  the page: ${page.status}`);
  if (page.status !== 200) { console.log('  ', JSON.stringify(page.body)); server.close(); process.exit(1); }
  const html = page.body.html;
  console.log(`  served ${html.length} characters of lesson html`);
  console.log(`  enrollment id handed to the page: ${page.body.enrollment_id}`);
  // What the button depends on, read off the served markup rather than the file
  // on disk, because the file is not what a learner gets.
  const visible = /<(button|a)\b[^>]*>\s*(?:<[^>]+>\s*)*Finish Lesson/i.test(html);
  const calls = /polymathFinishLesson/.test(html);
  console.log(`  has a visible Finish Lesson button: ${visible}`);
  console.log(`  calls window.polymathFinishLesson: ${calls}`);

  const finish = await call('POST', `/lessons/${trackId}/${gradeId}/${level}/finish`,
    { enrollment_id: page.body.enrollment_id });
  console.log(`\nPOST the finish: ${finish.status}`);
  console.log('  ', JSON.stringify(finish.body));

  const after = db.byId('enrollments', before.id);
  console.log(`\n  enrollment was on level ${before.current_level}, is now on ${after.current_level}`);
  console.log(`  advanced: ${after.current_level !== before.current_level}`);

  server.close();
  process.exit(finish.status === 200 && after.current_level !== before.current_level ? 0 : 1);
})().catch((e) => { console.error(e.message); server.close(); process.exit(1); });
