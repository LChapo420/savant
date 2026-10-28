/**
 * Engagement and UX changes of 2026-10-25 (curriculum-build/evidence-article/05-engagement-ux-wellbeing.md;
 * switches in config/ux.js):
 *
 *   node scripts/ux-engagement-test.js
 *
 * Runs on a throwaway copy of data/db.json with every model key blanked and
 * OLLAMA_ENABLED=0. Checks:
 *   1. the streak: the learner's own calendar day, one grace day a week, a lapsed
 *      run reads 0, the owner and the switch keep the old UTC rule exactly
 *   2. the settings route (hide streak/XP, break line, time zone, next-study plan)
 *      and what the public user tells the browser, including the parent's switch
 *   3. the pages: no window.prompt in the report flow, the 44 px rule and its off
 *      switch, honest learning-style copy, error toasts that stay, nothing in the
 *      planner that sends a message
 */
const os = require('os');
const path = require('path');
const fs = require('fs');
const http = require('http');

process.env.NODE_ENV = 'test';
for (const k of Object.keys(process.env)) if (/_API_KEY$|_KEY$|ANTHROPIC|OPENROUTER|NVIDIA|GEMINI|MIMO|MODELFLARE|XKIRO|UNOROUTER/.test(k) && k !== 'NODE_ENV') process.env[k] = '';
process.env.OLLAMA_ENABLED = '0';
const SOURCE = path.join(__dirname, '..', 'data', 'db.json');
const tmp = path.join(os.tmpdir(), `ux-engagement-test-${process.pid}.json`);
if (fs.existsSync(SOURCE)) fs.copyFileSync(SOURCE, tmp);
process.env.DB_FILE = tmp;
for (const k of ['OWNER_EMAIL', 'OWNER_BASE', 'ADAPT_OWNER', 'STREAK_LOCAL_GRACE', 'BREAK_NUDGE', 'BREAK_NUDGE_MIN', 'UX_TOUCH44', 'UX_HIDE_STATS',
  'UX_STYLE_COPY', 'UX_TOAST_STAY', 'UX_REPORT_DIALOG', 'UX_NEXT_STUDY_PLANNER']) delete process.env[k];

const express = require('express');
const db = require('../config/db');
const owner = require('../config/owner');
const uxFlags = require('../config/ux');
const streak = require('../services/streak');
const schedule = require('../services/retention-schedule');
const auth = require('../middleware/auth');

let failures = 0;
let passes = 0;
function check(label, ok, detail) {
  if (ok) { passes++; console.log(`  ok   ${label}`); return; }
  failures++;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 400)}`}`);
}
function done() {
  try { fs.unlinkSync(tmp); } catch { /* gone */ }
  console.log(failures ? `\n${failures} check(s) FAILED (${passes} passed)` : `\nall ${passes} checks passed`);
  process.exit(failures ? 1 : 0);
}

let seq = 0;
function learner(extra) {
  seq += 1;
  return db.insert('users', { email: `ux-${process.pid}-${seq}@example.test`, display_name: `UX ${seq}`, password_hash: 'x', streak: 0, xp: 0, onboarded: true, ...extra });
}
const at = (iso) => Date.parse(iso);
const fresh = (id) => db.byId('users', id);

function serve(router) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.user = db.byId('users', Number(req.headers['x-user'])) || null; next(); });
  app.use('/api', router);
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const call = (method, url, body, uid) => new Promise((ok, fail) => {
        const data = body ? JSON.stringify(body) : null;
        const req = http.request({ host: '127.0.0.1', port, path: url, method, headers: { 'content-type': 'application/json', 'x-user': String(uid || ''), ...(data ? { 'content-length': Buffer.byteLength(data) } : {}) } }, (res) => {
          let text = '';
          res.on('data', (c) => { text += c; });
          res.on('end', () => { let json = null; try { json = JSON.parse(text); } catch { json = text; } ok({ status: res.statusCode, json }); });
        });
        req.on('error', fail);
        if (data) req.write(data);
        req.end();
      });
      resolve({ call, close: () => server.close() });
    });
  });
}

(async () => {
  console.log('engagement and UX (on a copy of data/db.json, keys blanked, OLLAMA_ENABLED=0)');

  // ── 1. the streak ─────────────────────────────────────────────────────────
  console.log('\n1. streak: local day and one grace day');
  // Auckland is UTC+13 in late October: 20:00Z on the 24th is already the 25th there.
  let u = learner({ retention_tz: 'Pacific/Auckland', streak: 3, last_active_day: '2026-10-24' });
  let s = streak.record(u.id, { xp: 10, now: at('2026-10-24T20:00:00Z') });
  check('local day: 20:00Z on the 24th is the 25th in Auckland, so yesterday\'s run grows', s === 4 && fresh(u.id).last_active_day === '2026-10-25' && fresh(u.id).xp === 10, fresh(u.id));
  // Los Angeles is UTC-7: 03:00Z on the 25th is still the evening of the 24th there.
  u = learner({ retention_tz: 'America/Los_Angeles', streak: 3, last_active_day: '2026-10-24' });
  s = streak.record(u.id, { xp: 5, now: at('2026-10-25T03:00:00Z') });
  check('local day: 03:00Z on the 25th is still the 24th in Los Angeles, so it is not counted twice', s === 3 && fresh(u.id).last_active_day === '2026-10-24' && fresh(u.id).xp === 5, fresh(u.id));
  u = learner({ client_tz: 'America/Los_Angeles', streak: 0, last_active_day: null });
  streak.record(u.id, { now: at('2026-10-25T03:00:00Z') });
  check('no retention_tz: the browser\'s time zone is used', fresh(u.id).last_active_day === '2026-10-24' && fresh(u.id).streak === 1, fresh(u.id));
  u = learner({ retention_tz: 'Pacific/Auckland', client_tz: 'America/Los_Angeles', streak: 0, last_active_day: null });
  streak.record(u.id, { now: at('2026-10-24T20:00:00Z') });
  check('retention_tz wins over the browser\'s zone', fresh(u.id).last_active_day === '2026-10-25', fresh(u.id));
  u = learner({ streak: 0, last_active_day: null });
  streak.record(u.id, { now: at('2026-10-24T23:30:00Z') });
  check('no zone known at all: UTC', fresh(u.id).last_active_day === '2026-10-24');

  u = learner({ retention_tz: 'UTC', streak: 5, last_active_day: '2026-10-22' });
  s = streak.record(u.id, { now: at('2026-10-24T10:00:00Z') });
  check('one missed day is forgiven: the run continues and today counts', s === 6 && fresh(u.id).streak_grace_at === '2026-10-24', fresh(u.id));
  s = streak.record(u.id, { now: at('2026-10-24T18:00:00Z') });
  check('a second sitting the same day changes nothing', s === 6 && fresh(u.id).streak === 6);
  u = fresh(u.id);
  db.update('users', u.id, { last_active_day: '2026-10-26' });
  s = streak.record(u.id, { now: at('2026-10-28T10:00:00Z') });
  check('a second missed day inside the same week is not forgiven: the run starts again', s === 1, fresh(u.id));
  u = learner({ retention_tz: 'UTC', streak: 5, last_active_day: '2026-10-10', streak_grace_at: '2026-10-01' });
  s = streak.record(u.id, { now: at('2026-10-12T10:00:00Z') });
  check('the grace day comes back after 7 days', s === 6 && fresh(u.id).streak_grace_at === '2026-10-12', fresh(u.id));
  u = learner({ retention_tz: 'UTC', streak: 9, last_active_day: '2026-10-20' });
  s = streak.record(u.id, { now: at('2026-10-24T10:00:00Z') });
  check('three days away: the run starts again at 1', s === 1);
  u = learner({ retention_tz: 'UTC', streak: 4, last_active_day: '2026-10-24' });
  s = streak.record(u.id, { now: at('2026-10-23T10:00:00Z') });
  check('a date in the past (the clock moved back) changes nothing', s === 4 && fresh(u.id).last_active_day === '2026-10-24');
  u = learner({ retention_tz: 'UTC', streak: 0, last_active_day: null });
  s = streak.record(u.id, { xp: 7, now: at('2026-10-24T10:00:00Z') });
  check('a first sitting starts the run at 1 and adds its XP', s === 1 && fresh(u.id).xp === 7);

  const view = (extra, now) => streak.current(learner({ retention_tz: 'UTC', ...extra }), now);
  check('current: yesterday keeps the run', view({ streak: 4, last_active_day: '2026-10-23' }, at('2026-10-24T10:00:00Z')) === 4);
  check('current: one missed day with the grace day free still shows the run', view({ streak: 4, last_active_day: '2026-10-22' }, at('2026-10-24T10:00:00Z')) === 4);
  check('current: one missed day with the grace day spent this week reads 0', view({ streak: 4, last_active_day: '2026-10-22', streak_grace_at: '2026-10-20' }, at('2026-10-24T10:00:00Z')) === 0);
  check('current: a lapsed run reads 0, not a stale number', view({ streak: 12, last_active_day: '2026-10-01' }, at('2026-10-24T10:00:00Z')) === 0);
  check('current: the public user carries it', auth.publicUser(learner({ retention_tz: 'UTC', streak: 12, last_active_day: '2020-01-01' })).streak === 0);

  // The owner and the switch keep the old rule, exactly.
  let me = db.findOne('users', (x) => owner.isOwner(x));
  if (!me) me = db.insert('users', { email: owner.ownerEmail(), display_name: 'Owner', password_hash: 'x', streak: 0, xp: 0, onboarded: true });
  db.update('users', me.id, { retention_tz: 'Pacific/Auckland', streak: 3, last_active_day: '2026-10-24', streak_grace_at: null });
  s = streak.record(me.id, { xp: 1, now: at('2026-10-24T20:00:00Z') });
  check('the owner keeps the old UTC rule (same UTC day: no change)', s === 3 && fresh(me.id).last_active_day === '2026-10-24', fresh(me.id));
  db.update('users', me.id, { last_active_day: '2026-10-21', streak: 3 });
  s = streak.record(me.id, { now: at('2026-10-24T10:00:00Z') });
  check('the owner has no grace day: a two-day gap resets to 1', s === 1 && !fresh(me.id).streak_grace_at, fresh(me.id));
  db.update('users', me.id, { last_active_day: '2020-01-01', streak: 8 });
  check('the owner\'s displayed streak is the stored one', auth.publicUser(fresh(me.id)).streak === 8);
  process.env.STREAK_LOCAL_GRACE = 'off';
  u = learner({ retention_tz: 'UTC', streak: 5, last_active_day: '2026-10-22' });
  s = streak.record(u.id, { now: at('2026-10-24T10:00:00Z') });
  check('STREAK_LOCAL_GRACE=off: the old rule (a missed day resets)', s === 1);
  delete process.env.STREAK_LOCAL_GRACE;

  // The two call sites go through the helper.
  const src = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
  check('sessions.js and review-session.js both record the streak through services/streak.js', /require\('\.\/streak'\)\.record\(userId, \{ xp \}\)/.test(src('services', 'sessions.js'))
    && /require\('\.\/streak'\)\.record\(userId, \{ xp, now \}\)/.test(src('services', 'review-session.js'))
    && !/toISOString\(\)\.slice\(0, 10\)[^\n]*\n[^\n]*streak/.test(src('services', 'review-session.js')));

  // ── 2. settings and the public user ───────────────────────────────────────
  console.log('\n2. settings route and public user');
  const prefs = require('../routes/prefs');
  const app = await serve(prefs);
  const L = learner({ retention_tz: 'UTC' });
  let r = await app.call('POST', '/api/prefs', { hide_stats: true }, L.id);
  check('hide_stats: saved, and the public user says so', r.status === 200 && r.json.user.hide_stats === true && fresh(L.id).hide_stats === true, r.json);
  r = await app.call('POST', '/api/prefs', { hide_stats: 'yes' }, L.id);
  check('hide_stats must be a boolean', r.status === 400);
  r = await app.call('POST', '/api/prefs', { hide_stats: false, break_nudge: false }, L.id);
  check('shown again, and the break line off', r.json.user.hide_stats === false && r.json.user.break_nudge_off === true && fresh(L.id).break_nudge_off === true);
  r = await app.call('POST', '/api/prefs', { tz: 'Europe/Paris' }, L.id);
  check('the browser time zone is kept', fresh(L.id).client_tz === 'Europe/Paris' && r.json.user.client_tz === 'Europe/Paris');
  r = await app.call('POST', '/api/prefs', { tz: 'Not/AZone' }, L.id);
  check('an invalid time zone is ignored', fresh(L.id).client_tz === 'Europe/Paris');
  r = await app.call('POST', '/api/prefs', { tz: 'x'.repeat(200) }, L.id);
  check('an over-long time zone is ignored', fresh(L.id).client_tz === 'Europe/Paris');
  r = await app.call('POST', '/api/prefs', { hide_stats: true }, null);
  check('signed out: 401', r.status === 401);

  const today = schedule.localDate(Date.now(), 'UTC');
  r = await app.call('POST', '/api/prefs', { next_study: { date: schedule.addDays(today, 2), time: '17:30' } }, L.id);
  check('next_study: a day within 60 days and a time are kept', r.status === 200 && fresh(L.id).next_study.time === '17:30' && fresh(L.id).next_study.date === schedule.addDays(today, 2), r.json);
  r = await app.call('POST', '/api/prefs', { next_study: { date: schedule.addDays(today, 200), time: '17:30' } }, L.id);
  check('next_study: too far ahead is refused', r.status === 400);
  r = await app.call('POST', '/api/prefs', { next_study: { date: schedule.addDays(today, -10), time: '17:30' } }, L.id);
  check('next_study: in the past is refused', r.status === 400);
  r = await app.call('POST', '/api/prefs', { next_study: { date: today, time: '25:99' } }, L.id);
  check('next_study: a bad time is refused', r.status === 400);
  r = await app.call('POST', '/api/prefs', { next_study: null }, L.id);
  check('next_study: null clears the plan', r.status === 200 && fresh(L.id).next_study === null);
  const before = JSON.stringify(Object.keys(fresh(L.id)).sort());
  await app.call('POST', '/api/prefs', { next_study: { date: today, time: '09:00' }, evil: 'x', xp: 99999, streak: 99 }, L.id);
  check('unknown keys are ignored: XP and streak cannot be set from here', fresh(L.id).xp === 0 && fresh(L.id).streak === 0 && fresh(L.id).evil === undefined && JSON.stringify(Object.keys(fresh(L.id)).sort()) === before);
  const kid = learner({ age_check: { needs_parent: true, under_13: true, age_at_check: 9, consent_age: 13, country: 'US' } });
  r = await app.call('POST', '/api/prefs', { next_study: { date: today, time: '09:00' } }, kid.id);
  check('under 13: the plan is kept in the app, flagged under_13 for the page, and no mailer or notifier is loaded by the route', r.status === 200 && r.json.user.under_13 === true
    && !/mailer|nodemailer|webpush|push/i.test(src('routes', 'prefs.js').replace(/\/\*[\s\S]*?\*\//g, '')));
  r = await app.call('POST', '/api/prefs', { next_study: { date: today, time: '09:00' } }, me.id);
  check('the owner has no planner: 404', r.status === 404);
  process.env.UX_NEXT_STUDY_PLANNER = 'off';
  r = await app.call('POST', '/api/prefs', { next_study: { date: today, time: '09:00' } }, L.id);
  check('UX_NEXT_STUDY_PLANNER=off: 404', r.status === 404);
  delete process.env.UX_NEXT_STUDY_PLANNER;

  // The parent's switch lives on the consent; the public user folds it in.
  const consent = db.insert('parental_consents', { child_user_id: kid.id, status: 'active', settings: { camera_mic_off: false, hide_stats: true } });
  db.update('users', kid.id, { consent_id: consent.id });
  let pub = auth.publicUser(fresh(kid.id));
  check('a parent\'s hide_stats hides the numbers and is reported as the parent\'s', pub.hide_stats === true && pub.hide_stats_by_parent === true, pub);
  db.update('users', kid.id, { hide_stats: false });
  check('the child cannot undo the parent\'s switch', auth.publicUser(fresh(kid.id)).hide_stats === true);
  db.update('parental_consents', consent.id, { settings: { camera_mic_off: false, hide_stats: false } });
  check('the parent turning it off shows them again', auth.publicUser(fresh(kid.id)).hide_stats === false);
  db.update('parental_consents', consent.id, { status: 'revoked', settings: { hide_stats: true } });
  check('a revoked consent\'s settings do not apply', auth.publicUser(fresh(kid.id)).hide_stats === false);
  process.env.UX_HIDE_STATS = 'off';
  db.update('users', L.id, { hide_stats: true });
  check('UX_HIDE_STATS=off: nothing is hidden', auth.publicUser(fresh(L.id)).hide_stats === false && auth.publicUser(fresh(L.id)).ux.hide_stats_setting === false);
  delete process.env.UX_HIDE_STATS;

  // The flags the browser is told.
  const ux = auth.publicUser(fresh(L.id)).ux;
  check('flags: everything on by default for a learner', ux.streak_local_grace && ux.break_nudge && ux.touch44 && ux.hide_stats_setting && ux.style_copy && ux.toast_stay && ux.report_dialog && ux.next_study_planner && ux.break_after_min === 25, ux);
  const oux = auth.publicUser(fresh(me.id)).ux;
  check('flags: the owner gets no streak change, no break line, no planner (base product)', !oux.streak_local_grace && !oux.break_nudge && !oux.next_study_planner && oux.touch44 && oux.report_dialog, oux);
  process.env.BREAK_NUDGE = 'off'; process.env.UX_TOUCH44 = 'off'; process.env.UX_TOAST_STAY = 'off'; process.env.UX_REPORT_DIALOG = 'off'; process.env.UX_STYLE_COPY = 'off';
  const off = uxFlags.flagsFor(fresh(L.id));
  check('each flag turns its own change off', !off.break_nudge && !off.touch44 && !off.toast_stay && !off.report_dialog && !off.style_copy && off.hide_stats_setting, off);
  for (const k of ['BREAK_NUDGE', 'UX_TOUCH44', 'UX_TOAST_STAY', 'UX_REPORT_DIALOG', 'UX_STYLE_COPY']) delete process.env[k];
  process.env.BREAK_NUDGE_MIN = '40';
  check('BREAK_NUDGE_MIN sets the minutes (5 to 180)', uxFlags.flagsFor(fresh(L.id)).break_after_min === 40);
  process.env.BREAK_NUDGE_MIN = '1';
  check('BREAK_NUDGE_MIN out of range falls back to 25', uxFlags.flagsFor(fresh(L.id)).break_after_min === 25);
  delete process.env.BREAK_NUDGE_MIN;
  app.close();

  // ── 3. the pages ──────────────────────────────────────────────────────────
  console.log('\n3. pages');
  const js = (f) => src('public', 'js', f);
  const css = src('public', 'css', 'style.css');
  check('Report a problem uses a dialog, not window.prompt', !/window\.prompt\(/.test(js('player.js')) && /App\.askText\(/.test(js('player.js')) && /dlg\.showModal\(\)/.test(js('app.js')));
  check('the dialog has a labelled field, an error line, Escape (native) and returns focus', /aria-labelledby': 'ask-h'/.test(js('app.js')) && /for="ask-text"/.test(js('app.js')) && /role="alert"/.test(js('app.js')) && /opts\.opener\.focus\(\)/.test(js('app.js')));
  check('error toasts stay until dismissed, with a Dismiss button, unless UX_TOAST_STAY is off', /toast-stay/.test(js('app.js')) && /Dismiss this message/.test(js('app.js')) && /toast_stay === false/.test(js('app.js')) && /\.toast-close/.test(css));
  check('error toasts are announced (role alert inside a polite live region)', /role: kind === 'error' \? 'alert' : null/.test(js('app.js')) && /'aria-live': 'polite'/.test(js('app.js')));
  check('44 px on coarse pointers for small buttons, chips, back links, text buttons, and the off switch', /pointer: coarse/.test(css) && /data-touch44="off"\]\) \.btn-sm/.test(css) && /\.confidence-row \.chip-btn/.test(css) && /\.back-link/.test(css) && /touch44 === false/.test(js('app.js')));
  check('the dashboard and quiz copy no longer promise style matching (and the old text stays behind the switch)', /does not raise scores/.test(js('dashboard.js')) && /raises scores/.test(js('placement.js')) && /does not decide how you are taught/.test(js('style-quiz.js'))
    && /style_copy === false/.test(js('dashboard.js')));
  check('hiding the numbers: header, dashboard, profile, outcome cards, parent page', /user\.hide_stats \? 0/.test(js('app.js')) && /hideStats \? ''/.test(js('dashboard.js')) && /pref-show-stats/.test(js('profile.js')) && /STAT_LABELS/.test(js('app.js')) && /data-act="stats"/.test(js('parent.js')));
  check('break line: dismissible, once per stretch, not announced, off for the owner via the flag', /break-dismiss/.test(js('study.js')) && /breakMinutes/.test(js('study.js')) && !/announce\([^)]*break/i.test(js('study.js')) && /break_nudge === true/.test(js('study.js')));
  check('the planner sends nothing: no network call but /api/prefs, and no calendar file on a child account', (js('dashboard.js').match(/App\.api\.post\('\/api\/prefs'/g) || []).length === 2 && /future && !isChild/.test(js('dashboard.js')));

  done();
})().catch((err) => { console.error(err); failures++; done(); });
