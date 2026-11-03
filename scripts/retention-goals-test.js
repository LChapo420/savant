/**
 * Tests for retention goals (services/retention-goal.js, routes/retention-goals.js, and their wiring into
 * services/enforcers.js, services/write-ahead.js and the uploaded-course review): the goal's choices and checks,
 * which of the owner's enforcer types a goal keeps (forever keeps all of them, exactly), the compressed plan for a
 * test date, the review interval limits for an uploaded course, the enforcer offers for a learner with a test date
 * against one without, the routes, and the SIMULATED retention gate (scripts/retention-goals-sim.js --gate).
 *
 *   node scripts/retention-goals-test.js
 *
 * Runs on its own throwaway data file with every model key blanked.
 */
const os = require('os');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawnSync } = require('child_process');

process.env.NODE_ENV = 'test';
for (const k of Object.keys(process.env)) if (/_API_KEY$|_KEY$|ANTHROPIC|OPENROUTER|NVIDIA|GEMINI|MIMO|MODELFLARE|XKIRO/.test(k) && k !== 'NODE_ENV') process.env[k] = '';
const tmp = path.join(os.tmpdir(), `${path.basename(__filename, '.js')}-${process.pid}.json`);
process.env.DB_FILE = tmp;
for (const k of ['RETENTION_ENFORCERS', 'ENFORCER_FOLD_REVIEW', 'RETENTION_PARAMS', 'RETENTION_PARAMS_FILE', 'OWNER_EMAIL', 'OWNER_BASE', 'ADAPT_OWNER', 'ADMIN_EMAILS']) delete process.env[k];

const express = require('express');
const db = require('../config/db');
const coverage = require('../services/coverage');
const study = require('../services/study-sessions');
const enforcers = require('../services/enforcers');
const schedule = require('../services/retention-schedule');
const goal = require('../services/retention-goal');
const objItems = require('../services/objective-items');
const writeAhead = require('../services/write-ahead');

let failures = 0;
let checks = 0;
function check(label, ok, detail) {
  checks += 1;
  if (ok) { console.log(`  ok   ${label}`); return; }
  failures += 1;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` - ${JSON.stringify(detail).slice(0, 500)}`}`);
}

const DAY = 24 * 3600 * 1000;
// Day 0 of every learner here: 10:00 UTC eight days ago, so day 8 is today (the enforcers also read the real clock for their drafts).
const D0 = (() => { const n = new Date(); return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate(), 10) - 8 * 24 * 3600 * 1000; })();
const at = (day, hour = 10) => D0 + day * DAY + (hour - 10) * 3600 * 1000;
const D0_DATE = new Date(D0).toISOString().slice(0, 10);
const date = (day) => schedule.addDays(D0_DATE, day);
const TRACK = 'math';
const GRADE = 'counting_and_comparing';
const model = coverage.modelFor(TRACK, GRADE);
const withItems = model.objectives.filter((o) => objItems.forObjective(TRACK, GRADE, o.id).length >= 3);

let users = 0;
function learner() {
  users += 1;
  const user = db.insert('users', { email: `rg-${users}@example.test`, name: `g${users}`, password_hash: 'x', streak: 0, xp: 0, onboarded: true, retention_tz: 'UTC' });
  const enrollment = db.insert('enrollments', { user_id: user.id, track_id: TRACK, grade_id: GRADE, target_level: 300, current_level: 200, level_items: 0, levels_completed: 0, xp: 0, status: 'active', placed_at: new Date().toISOString() });
  const session = db.insert('sessions', { user_id: user.id, enrollment_id: enrollment.id, track_id: TRACK, grade_id: GRADE, level: 1, kind: 'lesson', blocks: [], started_at: new Date(D0 - DAY).toISOString() });
  return { user, enrollment, session };
}
function answer(who, o, t, correct = true) {
  return db.insert('items', {
    user_id: who.user.id, session_id: who.session.id, skill_id: o.skill, difficulty: 3, format: 'multiple_choice', role: 'check', level: o.lesson_level,
    prompt: `q ${o.id} ${t} ${Math.random()}`, answer: 'a', choices: ['a', 'b', 'c', 'd'], rationale: 'because', block: 0, index: 0,
    user_answer: correct ? 'a' : 'b', correct, ms: 15000, coach_used: false, answered_at: new Date(t).toISOString(), updated_at: new Date(t).toISOString(),
  });
}
/** A study session of 20 minutes starting at t0, with an answer a minute. */
function studied(who, t0) {
  study.start(who.user.id, { now: t0 });
  for (let k = 0; k < 40; k++) {
    const t = t0 + (k + 1) * 30000;
    study.beat(who.user.id, { now: t });
    if ((k + 1) % 2 === 0) answer(who, withItems[Math.floor(k / 2) % withItems.length], t);
  }
  study.end(who.user.id, { now: t0 + 20 * 60000 + 1000, kind: 'session' });
}

function serve(routers) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.user = db.byId('users', Number(req.headers['x-user'])) || null; next(); });
  for (const r of routers) app.use('/api', r);
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const call = (method, url, body, uid) => new Promise((done, fail) => {
        const data = body ? JSON.stringify(body) : null;
        const req = http.request({ host: '127.0.0.1', agent: false, port, path: url, method, headers: { 'content-type': 'application/json', 'x-user': String(uid || ''), ...(data ? { 'content-length': Buffer.byteLength(data) } : {}) } }, (res) => {
          let text = '';
          res.on('data', (c) => { text += c; });
          res.on('end', () => { let json = null; try { json = JSON.parse(text); } catch { json = null; } done({ status: res.statusCode, body: json }); });
        });
        req.on('error', fail);
        if (data) req.write(data);
        req.end();
      });
      resolve({ call, close: () => server.close() });
    });
  });
}

function finish() {
  try { fs.unlinkSync(tmp); } catch { /* gone */ }
  console.log(failures ? `\n${failures} of ${checks} check(s) FAILED` : `\nall ${checks} checks passed`);
  process.exit(failures ? 1 : 0);
}

(async () => {
  check('fixture: a grade with objective items', withItems.length >= 6, withItems.length);

  console.log('choices and checks');
  {
    const today = '2026-06-01';
    check('the five choices', JSON.stringify(goal.CHOICES) === JSON.stringify(['date', 'months', 'year', 'years', 'forever']));
    check('forever is the default', goal.effective(null, today).status === 'forever' && goal.effective(null, today).is_default === true);
    check('a test date needs a real date', !!goal.normalize({ horizon: 'date', test_date: '2026-02-30' }, today).error && !!goal.normalize({ horizon: 'date' }, today).error);
    check('a test date in the past is refused', !!goal.normalize({ horizon: 'date', test_date: '2026-05-31' }, today).error);
    check('a test date too far ahead is refused', !!goal.normalize({ horizon: 'date', test_date: '2031-06-01' }, today).error);
    check('a test today is fine', !goal.normalize({ horizon: 'date', test_date: today }, today).error);
    check('an unknown horizon is refused', !!goal.normalize({ horizon: 'decade' }, today).error);
    const g = goal.normalize({ horizon: 'date', test_date: '2026-06-11' }, today).goal;
    check('before the date: status date with days left', goal.effective(g, today).status === 'date' && goal.effective(g, today).days_left === 10);
    check('on the date: still a test day', goal.effective(g, '2026-06-11').days_left === 0);
    check('after the date, unanswered: asks, and carries on as forever', goal.effective(g, '2026-06-12').status === 'after_test' && goal.effective(g, '2026-06-12').ask === true && goal.keptTypes(goal.effective(g, '2026-06-12')).length === 4);
    check('after the date, keep as a year: a year from the test date', goal.effective({ ...g, keep_after: 'year' }, '2026-06-12').status === 'horizon' && goal.effective({ ...g, keep_after: 'year' }, '2026-06-12').days === 365);
    check('after the date, stop: reviews end', !goal.reviewsWanted(goal.effective({ ...g, keep_after: 'stop' }, '2026-06-12')) && goal.reviewsWanted(goal.effective(g, today)));
    check('ACT with a profile test date reads as a test date', goal.effective(null, today, { testDate: '2026-07-01' }).status === 'date' && goal.effective(null, today, { testDate: '2026-07-01' }).derived === true);
    check('the after-test choice is checked', !goal.normalizeAfter('decade').keep_after && goal.normalizeAfter('stop').keep_after === 'stop' && !goal.normalizeAfter('date').keep_after);
  }

  console.log('what a goal keeps of the owner\'s calendar');
  {
    const forever = goal.effective(null, '2026-06-01');
    check('forever keeps every type: the owner\'s calendar exactly', JSON.stringify(goal.keptTypes(forever)) === JSON.stringify(schedule.TYPES) && goal.droppedTypes(forever).length === 0 && goal.isCalendarIntact(forever));
    const horizon = (d) => ({ status: 'horizon', days: d });
    for (const h of ['months', 'year', 'years']) check(`${h}: the monthly stays (dropping it lowers simulated recall, docs/RETENTION-GOALS.md)`, goal.keptTypes(horizon(goal.HORIZONS[h].days)).includes('monthly'));
    check('a 20-day horizon keeps semi-weekly and weekly, drops bi-weekly and monthly', JSON.stringify(goal.keptTypes(horizon(20))) === JSON.stringify(['semiweekly', 'weekly']));
    check('a 6-day horizon drops every type', goal.keptTypes(horizon(6)).length === 0);
    check('kept types are always the narrow ones (nested)', [3, 6, 10, 20, 40, 90, 365].every((d) => { const k = goal.keptTypes(horizon(d)); return k.every((t, i) => schedule.TYPES[i] === t); }));
    check('a test date keeps no calendar type: its own plan replaces them', goal.keptTypes({ status: 'date', days_left: 30 }).length === 0);
    check('describe names what is dropped', /bi-weekly and monthly/.test(goal.describe(goal.effective({ horizon: 'date', test_date: '2026-06-20', set_on: '2026-06-01' }, '2026-06-01')).text) === false && goal.describe({ status: 'horizon', horizon: 'months', days: 20 }).dropped.length === 2);
  }

  console.log('the plan for a test date');
  {
    const plan = (tSet, tD) => goal.datePlan(tSet, tD);
    const p10 = plan(0, 10);
    check('10 days: a review every 2 days, then the final the day before and the day of', JSON.stringify(p10.map((x) => `${x.kind}:${x.day}`)) === JSON.stringify(['review:2', 'review:4', 'review:6', 'review:8', 'final:9', 'dayof:10']), p10.map((x) => `${x.kind}:${x.day}`));
    const p30 = plan(5, 35);
    check('30 days: the gap is about 15% of the time left', p30.filter((x) => x.kind === 'review').every((x, i, a) => i === 0 ? x.day - 5 === 5 : x.day - a[i - 1].day === 5), p30.map((x) => x.day));
    check('the final review is the day before and covers everything; the day-of is on the test day', p30.at(-2).kind === 'final' && p30.at(-2).day === 34 && p30.at(-2).from === 0 && p30.at(-1).kind === 'dayof' && p30.at(-1).day === 35);
    check('nothing is scheduled past the date', [plan(0, 1), plan(3, 40), plan(0, 200), plan(10, 10)].every((p, i) => p.every((x) => x.day <= [1, 40, 200, 10][i])));
    check('days rise, and no review sits next to the final', [plan(0, 7), plan(0, 21), plan(2, 90)].every((p) => p.every((x, i) => i === 0 || x.day > p[i - 1].day) && p.filter((x) => x.kind === 'review').every((x) => x.day < p.find((y) => y.kind === 'final').day - 1)));
    check('review windows tile: each starts the day after the last one', (() => { const r = plan(0, 60).filter((x) => x.kind === 'review'); return r.every((x, i) => i === 0 || x.from === r[i - 1].day + 1); })());
    check('tomorrow: only the final (today, end of day) and the day-of', JSON.stringify(plan(4, 5).map((x) => x.kind)) === JSON.stringify(['final', 'dayof']));
    check('a time budget size follows the length of work covered', goal.sizeFor(3) === 'semiweekly' && goal.sizeFor(7) === 'weekly' && goal.sizeFor(14) === 'biweekly' && goal.sizeFor(30) === 'monthly');
    check('re-teaching is shorter close to the test, whole when far or forever', goal.reteachScale({ status: 'date', days_left: 2 }) < goal.reteachScale({ status: 'date', days_left: 20 }) && goal.reteachScale({ status: 'date', days_left: 90 }) === 1 && goal.reteachScale({ status: 'forever' }) === 1);
  }

  console.log('an uploaded course\'s review interval');
  {
    const eff = (g) => goal.effective(g, '2026-06-01');
    const now = Date.parse('2026-06-01T10:00:00Z');
    check('forever: the curve\'s interval is untouched', goal.limitInterval(eff(null), 35, now).days === 35 && !goal.limitInterval(eff(null), 35, now).done);
    const test = eff({ horizon: 'date', test_date: '2026-06-21', set_on: '2026-06-01' });
    const far = goal.limitInterval(test, 70, now);
    check('a test date: an interval wider than a quarter of the time left is cut', far.days <= 5.01 && far.days >= 1 && !far.done, far);
    const last = goal.limitInterval(test, 3, Date.parse('2026-06-19T10:00:00Z'));
    check('close to the test, the next review is the final one, the day before', last.kind === 'final' && Math.abs(Date.parse('2026-06-19T10:00:00Z') + last.days * DAY - Date.parse('2026-06-20T00:00:00Z')) < 1000, last);
    const dayBefore = goal.limitInterval(test, 3, Date.parse('2026-06-20T12:00:00Z'));
    check('after the final, a short look on the day', dayBefore.kind === 'dayof' && Math.abs(Date.parse('2026-06-20T12:00:00Z') + dayBefore.days * DAY - Date.parse('2026-06-21T00:00:00Z')) < 1000, dayBefore);
    check('on or after the test day: no more reviews', goal.limitInterval(test, 3, Date.parse('2026-06-21T09:00:00Z')).done === true);
    check('a horizon stops reviews that land past it, keeps the ones inside it', goal.limitInterval(eff({ horizon: 'months', set_on: '2026-06-01' }), 140, now).done === true && goal.limitInterval(eff({ horizon: 'months', set_on: '2026-06-01' }), 35, now).days === 35);
    check('stopped after a test: nothing more', goal.limitInterval({ status: 'stopped' }, 3, now).done === true);
  }

  console.log('saving, listing and the routes');
  const app = await serve([require('../routes/retention-goals')]);
  const a = learner();
  const b = learner();
  const material = db.insert('materials', { user_id: a.user.id, title: 'My chapter', kind: 'text', text: 'x'.repeat(300), chars: 300 });
  {
    const list0 = (await app.call('GET', '/api/retention-goals', null, a.user.id)).body;
    check('every subject and course is listed, forever by default', list0.enrollments.length === 1 && list0.materials.length === 1 && list0.enrollments[0].goal.status === 'forever' && list0.enrollments[0].default_shown === true);
    check('the choices come with the page', list0.choices.map((c) => c.id).join() === 'date,months,year,years,forever');
    const noAuth = await app.call('GET', '/api/retention-goals', null, null);
    check('sign-in is required', noAuth.status === 401 || noAuth.status === 403 || noAuth.status === 500, noAuth.status);
    const bad = await app.call('PUT', '/api/retention-goals', { kind: 'enrollment', id: a.enrollment.id, horizon: 'date', test_date: '2020-01-01' }, a.user.id);
    check('a past test date is a 400 with a reason', bad.status === 400 && /passed/.test(bad.body.error), bad.body);
    const other = await app.call('PUT', '/api/retention-goals', { kind: 'enrollment', id: a.enrollment.id, horizon: 'year' }, b.user.id);
    check('another learner\'s subject is a 404', other.status === 404, other.status);
    const noKind = await app.call('PUT', '/api/retention-goals', { kind: 'chat', id: 1, horizon: 'year' }, a.user.id);
    check('an unknown kind is a 400', noKind.status === 400);
    const soon = goal.todayFor(a.user.id);
    const ok = await app.call('PUT', '/api/retention-goals', { kind: 'enrollment', id: a.enrollment.id, horizon: 'date', test_date: schedule.addDays(soon, 12) }, a.user.id);
    check('a test date is saved and described', ok.status === 200 && ok.body.item.goal.status === 'date' && /compressed to the date/.test(ok.body.item.summary) && ok.body.item.dropped.length === 4, ok.body);
    const mat = await app.call('PUT', '/api/retention-goals', { kind: 'material', id: material.id, horizon: 'months' }, a.user.id);
    check('a course gets its own goal', mat.status === 200 && mat.body.item.goal.horizon === 'months' && goal.forMaterial(a.user.id, material.id).status === 'horizon');
    check('another learner cannot set a course\'s goal', (await app.call('PUT', '/api/retention-goals', { kind: 'material', id: material.id, horizon: 'year' }, b.user.id)).status === 404);
    const prev = await app.call('GET', `/api/retention-goals/preview?horizon=date&test_date=${schedule.addDays(soon, 9)}`, null, a.user.id);
    check('the preview lists the plan before saving', prev.status === 200 && prev.body.plan.length >= 3 && prev.body.plan.at(-1).kind === 'dayof', prev.body);
    check('the nearest test is the headline for the daily plan', goal.headline(a.user.id).days_left === 12 && goal.headline(b.user.id) === null);
    check('write-ahead orders by the test date: days to the test, none for forever', writeAhead.testDaysOf(a.user.id, db.byId('enrollments', a.enrollment.id)) === 12 && writeAhead.testDaysOf(b.user.id, db.byId('enrollments', b.enrollment.id)) === null);
    const askRow = db.byId('enrollments', a.enrollment.id);
    const later = goal.effective(askRow.retention_goal, schedule.addDays(soon, 13));
    check('after the date the page asks whether to keep it', later.status === 'after_test');
    const keep = goal.save(a.user.id, 'enrollment', a.enrollment.id, { keep_after: 'years' });
    check('the answer is kept', !keep.error && keep.goal.keep_after === 'years' && goal.effective(keep.goal, schedule.addDays(soon, 13)).horizon === 'years');
    check('an answer with no test date to answer for is refused', !!goal.save(b.user.id, 'enrollment', b.enrollment.id, { keep_after: 'stop' }).error);
    // Back to a plain default for the scenarios below.
    db.update('enrollments', a.enrollment.id, { retention_goal: undefined });
  }
  app.close();

  console.log('the enforcer calendar for a learner with a test date');
  {
    // Work on day 0 and day 5. A test on day 10 (set on day 0): reviews on days 2, 4, 6, 8, the final on 9, the day-of on 10.
    const prep = () => {
      const w = learner();
      studied(w, at(0));
      studied(w, at(5));
      return w;
    };
    const plain = prep();
    const offerPlain = enforcers.offers(plain.user.id, { now: at(8, 12) })[0];
    check('control, no goal: the owner\'s calendar offers its weekly (absorbing the semi-weekly) on day 8', !!offerPlain && offerPlain.covers.every((c) => !c.goal) && offerPlain.covers.some((c) => c.type === 'weekly' && c.day === 7), offerPlain && offerPlain.covers);
    check('control: the calendar view has no goal reviews and no dropped days', (() => { const cal = enforcers.calendar(plain.user.id, { month: date(8).slice(0, 7), now: at(8, 12) }); return cal.goal_reviews.length === 0 && cal.days.every((d) => !d.scheduled || d.scheduled.status !== 'goal'); })());

    const g = prep();
    goal.save(g.user.id, 'enrollment', g.enrollment.id, { horizon: 'date', test_date: date(10) }, at(0));
    const offers = enforcers.offers(g.user.id, { now: at(8, 12) });
    const offer = offers[0];
    check('a test date: day 8 offers its own reviews, none of the owner\'s calendar', !!offer && offer.covers.length >= 1 && offer.covers.every((c) => c.goal === true && c.enrollment_id === g.enrollment.id), offer && offer.covers);
    check('its own reviews are the ones due by day 7 (days 2 and 6)', offer && offer.covers.map((c) => c.day).sort((x, y) => x - y).join() === '2,6', offer && offer.covers.map((c) => c.day));
    const empties = db.find('enforcers', (e) => e.user_id === g.user.id && e.status === 'empty');
    check('the owner\'s semi-weekly and weekly on day 7 are marked as dropped for the goal', empties.some((e) => e.scope === 'semiweekly' && e.reason === 'goal') && empties.some((e) => e.scope === 'weekly' && e.reason === 'goal'), empties.map((e) => `${e.scope}:${e.reason}`));
    const cal = enforcers.calendar(g.user.id, { month: date(8).slice(0, 7), now: at(8, 12) });
    check('the calendar marks the owner\'s days as not needed for the goal and lists the test reviews', cal.days.some((d) => d.scheduled && d.scheduled.status === 'goal') && cal.goal_reviews.some((r) => r.kind === 'final' && r.date === date(9)) && cal.goal_reviews.some((r) => r.kind === 'dayof' && r.date === date(10)), cal.goal_reviews);

    const t = prep();
    goal.save(t.user.id, 'enrollment', t.enrollment.id, { horizon: 'date', test_date: date(10) }, at(0));
    const morning = enforcers.offers(t.user.id, { now: at(10, 7) })[0];
    check('the morning of the test: the final and the day-of review are offered together, over everything', !!morning && morning.covers.some((c) => c.kind === 'final') && morning.covers.some((c) => c.kind === 'dayof') && morning.window.from_date === date(0), morning && morning.covers.map((c) => c.kind));
    const after = enforcers.offers(t.user.id, { now: at(14, 12) });
    check('nothing of the test date is offered after it, and its own reviews are not repeated', after.every((o) => o.covers.every((c) => !c.goal || c.day <= 10)));

    // Two subjects: a test date on one (worked on day 0), the default on the other (worked on day 5).
    const mixed = learner();
    const enrollB = db.insert('enrollments', { user_id: mixed.user.id, track_id: TRACK, grade_id: 'add_and_subtract_within_20', target_level: 300, current_level: 200, level_items: 0, levels_completed: 0, xp: 0, status: 'active', placed_at: new Date().toISOString() });
    const sessionB = db.insert('sessions', { user_id: mixed.user.id, enrollment_id: enrollB.id, track_id: TRACK, grade_id: 'add_and_subtract_within_20', level: 1, kind: 'lesson', blocks: [], started_at: new Date(D0 - DAY).toISOString() });
    studied(mixed, at(0));
    studied({ user: mixed.user, enrollment: enrollB, session: sessionB }, at(5));
    goal.save(mixed.user.id, 'enrollment', mixed.enrollment.id, { horizon: 'date', test_date: date(10) }, at(0));
    const other = enforcers.offers(mixed.user.id, { now: at(8, 12) })[0];
    const keys = other ? other.unit_plan.map((u) => u.key) : [];
    check('a test date on one subject and the default on another: the other keeps the owner weekly, the test subject gets its own reviews', !!other && other.covers.some((c) => !c.goal && c.type === 'weekly' && c.day === 7) && other.covers.some((c) => c.goal), other && other.covers);
    check('the work of both subjects is in it, each under its own goal', keys.some((k) => k.startsWith(`${TRACK}/${GRADE}/`)) && keys.some((k) => k.startsWith(`${TRACK}/add_and_subtract_within_20/`)), keys.slice(0, 6));
  }

  console.log('simulated retention gate');
  {
    const r = spawnSync(process.execPath, [path.join(__dirname, 'retention-goals-sim.js'), '--gate'], { encoding: 'utf8' });
    check('SIMULATED: every goal keeps recall at its target at least at today\'s level, overall and for every learner in the panel', r.status === 0, (r.stdout || '').slice(-400));
  }

  finish();
})().catch((e) => { console.error(e); failures += 1; finish(); });
