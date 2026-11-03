/**
 * Tests for the daily plan (services/daily-plan.js, routes/daily-plan.js, the dashboard card's script, and the tie to
 * services/enforcers.js): the pure allocation (reviews first by risk and goal, new material by need, the two-day rule,
 * written-ahead levels preferred, breaks from the spec, minutes never exceeded, catch-up and placement), the learner's own
 * pace in the time estimates, the plan on a real database (enrollments, a test date, an enforcer waiting and one due today),
 * the routes and the remembered minutes, and the SIMULATED gate (scripts/daily-plan-sim.js --gate).
 *
 *   node scripts/daily-plan-test.js
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
for (const k of ['RETENTION_ENFORCERS', 'ENFORCER_FOLD_REVIEW', 'RETENTION_PARAMS', 'RETENTION_PARAMS_FILE', 'OWNER_EMAIL', 'OWNER_BASE', 'ADAPT_OWNER', 'ADMIN_EMAILS', 'ADAPT_REVIEW_SESSION']) delete process.env[k];

const express = require('express');
const db = require('../config/db');
const coverage = require('../services/coverage');
const study = require('../services/study-sessions');
const enforcers = require('../services/enforcers');
const schedule = require('../services/retention-schedule');
const goal = require('../services/retention-goal');
const objItems = require('../services/objective-items');
const plan = require('../services/daily-plan');

let failures = 0;
let checks = 0;
function check(label, ok, detail) {
  checks += 1;
  if (ok) { console.log(`  ok   ${label}`); return; }
  failures += 1;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` - ${JSON.stringify(detail).slice(0, 600)}`}`);
}

const SESSION = { minutes: 20, breakEveryMinutes: 15, breakMinutes: 3 };
const lv = (from, n, kind = 'practice', est = 6, ready = true) => Array.from({ length: n }, (_, k) => ({ level: from + k, kind, estMinutes: est, ready, paceBased: false }));
function subject(id, over = {}) {
  return { enrollmentId: id, trackId: `t${id}`, title: `Subject ${id}`, role: 'main', graduated: false, goal: { status: 'forever' }, progress: 0.4, gapDays: 0, momentum: 0, blocked: null, placement: null, levels: lv(10, 14), review: null, ...over };
}
const review = (est, risk, extra = {}) => ({ estMinutes: est, items: Math.round(est / 0.75), reteach: 0, memoryChecks: 0, minRecall: 1 - risk, risk, ...extra });
const run = (subjects, minutes = 60, extra = {}) => plan.allocate({ minutes, session: SESSION, subjects, materials: [], enforcers: {}, ...extra });
const kinds = (p) => p.blocks.map((b) => b.kind);
const real = (p) => p.blocks.filter((b) => b.kind !== 'break');

const DAY = 24 * 3600 * 1000;
const D0 = (() => { const n = new Date(); return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate(), 10) - 7 * DAY; })(); // day 7 is today
const at = (day, hour = 10) => D0 + day * DAY + (hour - 10) * 3600 * 1000;
const D0_DATE = new Date(D0).toISOString().slice(0, 10);
const TRACK = 'math';
const GRADE = 'counting_and_comparing';
const GRADE2 = 'add_and_subtract_within_20';
const model = coverage.modelFor(TRACK, GRADE);
const withItems = model.objectives.filter((o) => objItems.forObjective(TRACK, GRADE, o.id).length >= 3);

let users = 0;
function learner(grades = [GRADE], over = {}) {
  users += 1;
  const user = db.insert('users', { email: `dp-${users}@example.test`, name: `p${users}`, password_hash: 'x', streak: 0, xp: 0, onboarded: true, retention_tz: 'UTC', ...over });
  const enrollments = grades.map((g, i) => db.insert('enrollments', { user_id: user.id, track_id: TRACK, grade_id: g, target_level: 300, current_level: 200 + i, level_items: 0, levels_completed: 0, xp: 0, status: 'active', placed_at: new Date().toISOString(), created_at: new Date(D0 - DAY).toISOString() }));
  const session = db.insert('sessions', { user_id: user.id, enrollment_id: enrollments[0].id, track_id: TRACK, grade_id: grades[0], level: 1, kind: 'lesson', blocks: [], started_at: new Date(D0 - DAY).toISOString(), ended_at: new Date(D0 - DAY + 600000).toISOString() });
  return { user, enrollment: enrollments[0], enrollments, session };
}
function answer(who, o, t, correct = true) {
  return db.insert('items', {
    user_id: who.user.id, session_id: who.session.id, skill_id: o.skill, difficulty: 3, format: 'multiple_choice', role: 'check', level: o.lesson_level,
    prompt: `q ${o.id} ${t} ${Math.random()}`, answer: 'a', choices: ['a', 'b', 'c', 'd'], rationale: 'because', block: 0, index: 0,
    user_answer: correct ? 'a' : 'b', correct, ms: 15000, coach_used: false, answered_at: new Date(t).toISOString(), updated_at: new Date(t).toISOString(),
  });
}
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
  console.log('minutes and time estimates');
  {
    check('minutes: whole numbers from 10 to 240', plan.cleanMinutes(45) === 45 && plan.cleanMinutes('60') === 60 && plan.cleanMinutes(9) === null && plan.cleanMinutes(241) === null && plan.cleanMinutes('x') === null && plan.cleanMinutes(null) === null && plan.cleanMinutes('') === null);
    check('the presets are 30, 45, 60, 90 and 120', JSON.stringify(plan.PRESETS) === JSON.stringify([30, 45, 60, 90, 120]));
    const own = plan.levelMinutes('lesson', { levelsPerHour: 6, sessions: 3 }, SESSION);
    check('a measured pace sets the minutes (6 levels an hour: a lesson about 13 minutes, a practice level shorter)', own.paceBased && own.minutes === 13 && plan.levelMinutes('practice', { levelsPerHour: 6, sessions: 3 }, SESSION).minutes < own.minutes, own);
    const def = plan.levelMinutes('lesson', { levelsPerHour: 0, sessions: 1 }, SESSION);
    check('no pace yet (one session is too little): the grade default for the kind', !def.paceBased && def.minutes === plan.LEVEL_DEFAULT_MIN.lesson, def);
    check('the spec scales the defaults (a 30-minute sitter longer, a 12-minute sitter shorter)', plan.levelMinutes('lesson', null, { minutes: 30 }).minutes > def.minutes && plan.levelMinutes('lesson', null, { minutes: 12 }).minutes < def.minutes);
    check('a checkpoint takes longer than a lesson, a practice level shorter', plan.levelMinutes('graduation', null, SESSION).minutes > plan.levelMinutes('lesson', null, SESSION).minutes && plan.levelMinutes('practice', null, SESSION).minutes < plan.levelMinutes('lesson', null, SESSION).minutes);
    check('a test date soon outweighs forever, in reviews and in new material', plan.goalWeight({ status: 'date', days_left: 3 }) > plan.goalWeight({ status: 'date', days_left: 40 }) && plan.goalWeight({ status: 'date', days_left: 40 }) > plan.goalWeight({ status: 'forever' }) && plan.dateNeed({ status: 'date', days_left: 3 }, 0.3) > plan.dateNeed({ status: 'date', days_left: 40 }, 0.3) && plan.dateNeed({ status: 'forever' }, 0.3) === 0);
  }

  console.log('the allocation');
  {
    const p = run([subject(1, { review: review(6, 0.3) }), subject(2, { review: review(6, 0.8) }), subject(3)], 60);
    const firstLevel = p.blocks.findIndex((b) => b.kind === 'level');
    const lastReview = p.blocks.map((b) => b.kind).lastIndexOf('review');
    check('reviews come before any new material', firstLevel > lastReview && lastReview >= 1, kinds(p));
    check('reviews are ordered by forgetting risk', real(p)[0].enrollmentId === 2 && real(p)[1].enrollmentId === 1, real(p).slice(0, 2).map((b) => b.enrollmentId));
    const t = run([subject(1, { review: review(6, 0.6) }), subject(2, { review: review(6, 0.6), goal: { status: 'date', days_left: 4 } })], 60);
    check('a test date soon outranks forever at the same risk', real(t)[0].enrollmentId === 2 && /test in 4 days/.test(real(t)[0].why), real(t)[0]);
    const m = run([subject(1, { review: review(6, 0.3), goal: { status: 'date', days_left: 400 } }), subject(2, { review: review(6, 0.45), goal: { status: 'forever' } })], 60);
    check('a higher risk can still beat a date that is far off', real(m)[0].enrollmentId === 2, real(m)[0]);
    check('every block has the fields a screen needs and a reason', p.blocks.every((b) => ['enrollmentId', 'trackId', 'kind', 'level', 'estMinutes', 'why'].every((k) => k in b) && typeof b.why === 'string' && b.why.length > 5 && ['review', 'level', 'catchup', 'break'].includes(b.kind)), p.blocks.find((b) => !b.why));
    check('level blocks go in order from the learner\'s level, one subject at a time', (() => { const by = new Map(); for (const b of p.blocks.filter((x) => x.kind === 'level')) { const a = by.get(b.enrollmentId) || []; a.push(b.level); by.set(b.enrollmentId, a); } return [...by.values()].every((l) => l.every((x, i) => i === 0 || x === l[i - 1] + 1)) && p.blocks.filter((x) => x.kind === 'level').every((b, i, a) => i === 0 || b.enrollmentId === a[i - 1].enrollmentId || !a.slice(0, i - 1).some((x) => x.enrollmentId === b.enrollmentId)); })());

    for (const minutes of [10, 20, 30, 45, 60, 90, 120, 240]) {
      const q = run([subject(1, { review: review(8, 0.7) }), subject(2, { review: review(5, 0.5) }), subject(3), subject(4)], minutes);
      check(`${minutes} minutes: the plan, breaks included, never goes over`, q.minutes_used <= minutes + 1e-9, q.minutes_used);
    }
    check('an empty day plans nothing and says so', run([], 30).blocks.length === 0 && run([subject(1, { levels: [] })], 30).blocks.length === 0);
  }

  console.log('no subject is starved');
  {
    const subs = [subject(1, { goal: { status: 'date', days_left: 3 }, progress: 0.2 }), subject(2, { progress: 0.9 }), subject(3, { progress: 0.9 }), subject(4, { progress: 0.9, gapDays: 2 })];
    const p = run(subs, 30);
    check('a subject two days untouched gets a block today, even against a test date', real(p).some((b) => b.enrollmentId === 4), real(p).map((b) => b.enrollmentId));
    const q = run([subject(1, { gapDays: 5 }), subject(2, { gapDays: 2 }), subject(3)], 10);
    check('with room for one, the longest untouched goes first', real(q).length === 1 && real(q)[0].enrollmentId === 1, real(q).map((b) => b.enrollmentId));
    check('a subject one day untouched is lifted, not forced', run([subject(1, { gapDays: 1 }), subject(2)], 30).blocks.filter((b) => b.enrollmentId === 1).length >= run([subject(1), subject(2)], 30).blocks.filter((b) => b.enrollmentId === 1).length);
    check('a subject whose goal is met takes no time', real(run([subject(1, { gapDays: 9, goal: { status: 'stopped' } }), subject(2, { graduated: true, gapDays: 9 }), subject(3)], 60)).every((b) => b.enrollmentId === 3));
    const r = run([subject(1, { review: review(6, 0.5) }), subject(2, { gapDays: 2 })], 60);
    check('a review counts as a touch (its subject is not also forced a level)', r.blocks.filter((b) => b.enrollmentId === 1 && b.kind === 'level').length <= r.blocks.filter((b) => b.enrollmentId === 2 && b.kind === 'level').length + 3);
  }

  console.log('new material is split by need');
  {
    const p = run([subject(1, { goal: { status: 'date', days_left: 5 }, progress: 0.3 }), subject(2), subject(3)], 90);
    const share = (id) => p.blocks.filter((b) => b.kind === 'level' && b.enrollmentId === id).reduce((n, b) => n + b.estMinutes, 0);
    check('a test date soon takes the biggest share of the new material', share(1) > share(2) && share(1) > share(3), [share(1), share(2), share(3)]);
    const behind = run([subject(1, { progress: 0.1 }), subject(2, { progress: 0.7 }), subject(3, { progress: 0.7 })], 90);
    const sb = (id) => behind.blocks.filter((b) => b.kind === 'level' && b.enrollmentId === id).reduce((n, b) => n + b.estMinutes, 0);
    check('a subject far behind the others gets more', sb(1) > sb(2) && sb(1) > sb(3), [sb(1), sb(2), sb(3)]);
    const even = run([subject(1), subject(2), subject(3)], 90);
    const se = [1, 2, 3].map((id) => even.blocks.filter((b) => b.kind === 'level' && b.enrollmentId === id).reduce((n, b) => n + b.estMinutes, 0));
    check('equal subjects share about equally', Math.max(...se) - Math.min(...se) <= 12, se);
    const ready = run([subject(1, { levels: lv(10, 14, 'lesson', 10, false) }), subject(2, { levels: lv(10, 14, 'lesson', 10, true) })], 40);
    check('levels already written ahead are preferred: the written one goes first, and the share on written levels is high', real(ready)[0].enrollmentId === 2 && real(ready)[0].ready === true && ready.ready_share >= 0.5, [real(ready)[0], ready.ready_share]);
    check('the reason says whether a level opens at once', real(ready).some((b) => /written ahead, opens at once/.test(b.why)) && real(run([subject(1, { levels: lv(10, 3, 'lesson', 10, false) })], 30)).every((b) => /written when you open it/.test(b.why)));
    const slow = run([subject(1, { levels: lv(1, 14, 'lesson', 14) })], 60);
    check('time estimates add up inside the minutes (14-minute levels: three, breaks included)', real(slow).length === 3 && slow.minutes_used <= 60, [real(slow).length, slow.minutes_used]);
  }

  console.log('breaks follow the spec');
  {
    const p = run([subject(1, { levels: lv(1, 14, 'lesson', 8) }), subject(2, { levels: lv(1, 14, 'lesson', 8) })], 90);
    const bs = p.blocks.filter((b) => b.kind === 'break');
    check('breaks are the spec\'s length', bs.length >= 2 && bs.every((b) => b.estMinutes === SESSION.breakMinutes), bs.length);
    check('no stretch of study runs much past the break interval', (() => { let since = 0; let worst = 0; for (const b of p.blocks) { if (b.kind === 'break') { since = 0; } else { since += b.estMinutes; worst = Math.max(worst, since); } } return worst <= SESSION.breakEveryMinutes * 1.6; })());
    check('a plan never starts or ends on a break', p.blocks[0].kind !== 'break' && p.blocks.at(-1).kind !== 'break');
    const short = plan.allocate({ minutes: 60, session: { minutes: 12, breakEveryMinutes: 6, breakMinutes: 2 }, subjects: [subject(1, { levels: lv(1, 14, 'practice', 5) })], materials: [], enforcers: {} });
    const longer = plan.allocate({ minutes: 60, session: { minutes: 30, breakEveryMinutes: 28, breakMinutes: 5 }, subjects: [subject(1, { levels: lv(1, 14, 'practice', 5) })], materials: [], enforcers: {} });
    check('a learner who needs short stretches gets more breaks than one who does not', short.blocks.filter((b) => b.kind === 'break').length > longer.blocks.filter((b) => b.kind === 'break').length, [short.break_minutes, longer.break_minutes]);
    check('breaks count against the minutes given', p.minutes_used === p.study_minutes + p.break_minutes && p.break_minutes === bs.length * 3);
    check('a block longer than the sitting is flagged, not cut', real(run([subject(1, { levels: lv(1, 3, 'graduation', 25) })], 60)).some((b) => b.long === true));
  }

  console.log('catch-up and placement');
  {
    const p = run([subject(1, { placement: { estMinutes: 12, href: '/placement?enrollment=1' }, levels: [] }), subject(2)], 60);
    check('a placement not yet taken comes first of the new material, and its levels wait', real(p)[0].placement === true && real(p)[0].kind === 'catchup' && real(p)[0].href === '/placement?enrollment=1' && !real(p).some((b) => b.enrollmentId === 1 && b.kind === 'level'), real(p)[0]);
    const c = run([subject(1, { blocked: 'catch-up first', levels: lv(50, 10) }), subject(2, { role: 'catchup', group: 1, levels: lv(5, 10) })], 60);
    check('a catch-up is worked before the grade it leads to (the grade\'s levels wait)', real(c).every((b) => b.enrollmentId === 2) && real(c).every((b) => b.kind === 'catchup'), real(c).map((b) => [b.enrollmentId, b.kind]));
    const g = run([subject(1, { blocked: 'catch-up first', gapDays: 3 }), subject(2, { role: 'catchup', group: 1, levels: lv(5, 10), gapDays: 3 }), subject(3)], 30);
    check('the catch-up carries its grade\'s untouched days: the group is touched together', real(g).some((b) => b.enrollmentId === 2), real(g).map((b) => b.enrollmentId));
    check('a blocked subject (a held Final, a cooling retry) gets its review but no level', (() => { const b = run([subject(1, { blocked: 'cooling', levels: [], review: review(5, 0.6) }), subject(2)], 40); return b.blocks.some((x) => x.enrollmentId === 1 && x.kind === 'review') && !b.blocks.some((x) => x.enrollmentId === 1 && x.kind === 'level'); })());
  }

  console.log('enforcers are counted once');
  {
    const e = run([subject(1, { review: review(6, 0.5) }), subject(2)], 60, { enforcers: { resume: [{ enforcerId: 7, estMinutes: 4, label: 'Semi-weekly' }], scheduled: { estMinutes: 8, label: 'Weekly', absorbs: ['Semi-weekly', 'End of day'] } } });
    check('an enforcer left half done goes first', e.blocks[0].enforcer === true && e.blocks[0].enforcerId === 7 && /half done/.test(e.blocks[0].why) && /enforcer\?id=7/.test(e.blocks[0].href), e.blocks[0]);
    check('today\'s scheduled enforcer goes last and says it covers the day', e.blocks.at(-1).scheduledEnforcer === true && /End day session/.test(e.blocks.at(-1).why) && /Semi-weekly and End of day/.test(e.blocks.at(-1).why), e.blocks.at(-1));
    const without = run([subject(1, { review: review(6, 0.5) }), subject(2)], 60);
    check('their time is taken off the day: the same minutes hold less new material', e.blocks.filter((b) => b.kind === 'level').reduce((n, b) => n + b.estMinutes, 0) < without.blocks.filter((b) => b.kind === 'level').reduce((n, b) => n + b.estMinutes, 0) && e.minutes_used <= 60, [e.minutes_used, without.minutes_used]);
    check('the scheduled enforcer is capped at a third of the day', run([subject(1)], 30, { enforcers: { scheduled: { estMinutes: 20, label: 'Monthly', absorbs: [] } } }).blocks.at(-1).estMinutes <= 10);
  }

  console.log('the plan on a database');
  {
    const who = learner([GRADE, GRADE2]);
    // Seven days of study, a sitting a day, so day 7 (today) has the weekly and the semi-weekly due.
    for (let d = 0; d < 7; d++) studied(who, at(d));
    for (const e of who.enrollments) db.update('sessions', who.session.id, { enrollment_id: e.id });
    const now = at(7, 12);
    const rowsBefore = JSON.stringify(db.find('enforcers', (x) => x.user_id === who.user.id));
    const p = plan.planFor(who.user.id, { minutes: 60, now });
    check('a learner with two subjects gets a plan inside the minutes, with reasons', p.blocks.length > 0 && p.minutes_used <= 60 && p.blocks.every((b) => typeof b.why === 'string' && b.why), p.blocks.map((b) => b.kind));
    check('level blocks start at each enrollment\'s own level', p.blocks.filter((b) => b.kind === 'level').every((b) => { const e = db.byId('enrollments', b.enrollmentId); return b.level >= e.current_level; }), p.blocks.filter((b) => b.kind === 'level').map((b) => [b.enrollmentId, b.level]));
    check('a block opens its own screen (the session, a base lesson or the review page)', p.blocks.filter((b) => b.kind !== 'break').every((b) => /^\/(session|base-lesson|review|enforcer|placement|my-material)/.test(b.href)), p.blocks.map((b) => b.href));
    const sched = enforcers.scheduledToday(who.user.id, now);
    const last = p.blocks.at(-1);
    check('the weekly enforcer due today is in the plan once, last, with its semi-weekly absorbed', !!sched && !sched.done && last.scheduledEnforcer === true && p.blocks.filter((b) => b.scheduledEnforcer).length === 1 && /Semi-weekly/i.test(last.why), [sched, last]);
    check('planning writes nothing the enforcers own (no enforcer row was created or changed)', JSON.stringify(db.find('enforcers', (x) => x.user_id === who.user.id)) === rowsBefore);
    plan.planFor(who.user.id, { minutes: 90, now });
    check('and again: unchanged', JSON.stringify(db.find('enforcers', (x) => x.user_id === who.user.id)) === rowsBefore);

    // An unchosen offer from an earlier day is taken in by today's scheduled enforcer (enforcers.scheduledOffer merges them): one block, not two.
    const offer = enforcers.offers(who.user.id, { now })[0];
    const q = plan.planFor(who.user.id, { minutes: 60, now });
    const eb = q.blocks.filter((b) => b.enforcer);
    check('an offer waiting and the scheduled enforcer today are one block, last, not two', !!offer && eb.length === 1 && eb[0].scheduledEnforcer === true && q.blocks.at(-1) === eb[0], eb.map((b) => [b.enforcerId, b.scheduledEnforcer]));

    // With nothing scheduled today, a waiting offer is resumed first.
    const waiting = learner([GRADE]);
    for (let d = 0; d < 5; d++) studied(waiting, at(d));
    const w5 = at(5, 12);
    const woffer = enforcers.offers(waiting.user.id, { now: w5 })[0];
    const wp = plan.planFor(waiting.user.id, { minutes: 60, now: w5 });
    check('with nothing scheduled today, a waiting enforcer is the first block and says it is half done or waiting', !!woffer && !enforcers.scheduledToday(waiting.user.id, w5) && wp.blocks[0].enforcer === true && wp.blocks[0].enforcerId === woffer.id && !wp.blocks.some((b) => b.scheduledEnforcer), wp.blocks.slice(0, 2));
    check('an end-of-session offer past its 24 hours is not in the plan (it has rolled into the next scheduled one)', (() => { const x = db.insert('enforcers', { user_id: waiting.user.id, scope: 'session', status: 'choosing', offered_at: new Date(w5 - 30 * 3600 * 1000).toISOString(), covers: [], local_day: schedule.localDate(w5, 'UTC') }); const pl = plan.planFor(waiting.user.id, { minutes: 60, now: w5 }); return !pl.blocks.some((b) => b.enforcerId === x.id); })());

    // Review blocks come from the review page's own list (review-session.today); it is stubbed here with two rows so the
    // folding rule can be seen: one row of an objective the scheduled enforcer's window covers, one it does not.
    const reviewSession = require('../services/review-session');
    const realToday = reviewSession.today;
    const realFolds = enforcers.foldsReview;
    const o1 = withItems[0];
    const rows = (recall) => [{ objective: o1.id, skill: o1.skill, reason: 'fading', recall }, { objective: 'zz-9', skill: 'zz_skill', reason: 'fading', recall }];
    const stub = (byEnrollment) => { reviewSession.today = (uid, e) => { const r = byEnrollment(e); return r ? { retrieve: r, reteach: [], minutes: r.length * 0.75, due: r.length, done_today: 0, open_session: null } : null; }; };
    try {
      stub(() => rows(0.5));
      enforcers.foldsReview = () => true;
      const f = plan.planFor(who.user.id, { minutes: 60, now });
      const fr = f.blocks.filter((b) => b.kind === 'review' && !b.enforcer);
      check('folded (the default): a review block is the review page own list, both rows', fr.length === 2 && fr.every((b) => b.items === 2 && /fading/.test(b.why) && /lowest recall 50%/.test(b.why)), fr.map((b) => [b.enrollmentId, b.items, b.why]));
      enforcers.foldsReview = () => false;
      const u = plan.planFor(who.user.id, { minutes: 60, now });
      const ur = u.blocks.filter((b) => b.kind === 'review' && !b.enforcer);
      check('unfolded: the row the weekly enforcer covers is left to the enforcer, the other stays (nothing counted twice)', ur.length === 2 && ur.every((b) => b.items === 1), ur.map((b) => b.items));
      stub((e) => (e.id === who.enrollments[0].id ? rows(0.9) : rows(0.4)));
      const rk = plan.planFor(who.user.id, { minutes: 60, now });
      const order = rk.blocks.filter((b) => b.kind === 'review' && !b.enforcer).map((b) => b.enrollmentId);
      check('the subject whose recall is lowest is reviewed first', order[0] === who.enrollments[1].id && order.length === 2, order);
      const tgl = learner([GRADE, GRADE2]);
      for (let d = 0; d < 7; d++) studied(tgl, at(d));
      goal.save(tgl.user.id, 'enrollment', tgl.enrollments[1].id, { horizon: 'date', test_date: schedule.addDays(D0_DATE, 10) }, at(0));
      stub(() => rows(0.6));
      const tg = plan.planFor(tgl.user.id, { minutes: 60, now });
      const first = tg.blocks.find((b) => b.kind === 'review' && !b.enforcer);
      check('equal recall: the subject with a test in 3 days is reviewed first, and says so', first.enrollmentId === tgl.enrollments[1].id && /test in 3 days/.test(first.why), first);
      const done = plan.planFor(who.user.id, { minutes: 60, now });
      reviewSession.today = (uid, e) => ({ retrieve: rows(0.5), reteach: [], minutes: 1.5, due: 2, done_today: 1, open_session: null });
      const dn = plan.planFor(who.user.id, { minutes: 60, now });
      check('a review already done today is not planned again', done.blocks.some((b) => b.kind === 'review' && !b.enforcer) && !dn.blocks.some((b) => b.kind === 'review' && !b.enforcer));
    } finally { reviewSession.today = realToday; enforcers.foldsReview = realFolds; }

    // A test date on the second subject: its review and its levels come ahead.
    const tester = learner([GRADE, GRADE2]);
    for (let d = 0; d < 7; d++) studied(tester, at(d));
    db.update('sessions', tester.session.id, { enrollment_id: tester.enrollments[0].id });
    goal.save(tester.user.id, 'enrollment', tester.enrollments[1].id, { horizon: 'date', test_date: schedule.addDays(D0_DATE, 12) }, at(0));
    const t = plan.planFor(tester.user.id, { minutes: 90, now });
    const lv2 = t.blocks.filter((b) => b.kind === 'level' && b.enrollmentId === tester.enrollments[1].id).length;
    const lv1 = t.blocks.filter((b) => b.kind === 'level' && b.enrollmentId === tester.enrollments[0].id).length;
    check('a test date on one subject: it gets at least as many new levels, and the reason names the test', lv2 >= lv1 && lv2 > 0 && t.blocks.some((b) => b.enrollmentId === tester.enrollments[1].id && /test in 5 days/.test(b.why)), [lv1, lv2]);

    // A subject untouched for days is brought back.
    const gap = learner([GRADE, GRADE2]);
    db.update('sessions', gap.session.id, { enrollment_id: gap.enrollments[0].id, ended_at: new Date(now - 4 * DAY).toISOString(), started_at: new Date(now - 4 * DAY - 600000).toISOString() });
    db.insert('sessions', { user_id: gap.user.id, enrollment_id: gap.enrollments[1].id, track_id: TRACK, grade_id: GRADE2, level: 1, kind: 'lesson', blocks: [], started_at: new Date(now - DAY).toISOString(), ended_at: new Date(now - DAY + 600000).toISOString() });
    const gp = plan.planFor(gap.user.id, { minutes: 30, now });
    check('a subject four days untouched has a block today, with the days in its reason', gp.blocks.some((b) => b.enrollmentId === gap.enrollments[0].id && b.kind === 'level' && /3 days since you last studied it/.test(b.why)), gp.blocks.map((b) => [b.enrollmentId, b.kind, b.why.slice(0, 40)]));

    // A pace from the learner's own sittings changes the estimate.
    const paced = plan.planFor(who.user.id, { minutes: 60, now, paces: { [who.enrollments[0].id]: { levelsPerHour: 12, sessions: 4 } } });
    const own = paced.blocks.find((b) => b.kind === 'level' && b.enrollmentId === who.enrollments[0].id);
    check('a measured pace is used for the minutes and named in the reason', !!own && /at your pace/.test(own.why) && own.estMinutes <= 4, own);

    // A graduated or placement-pending enrollment.
    const pend = learner([GRADE]);
    db.update('enrollments', pend.enrollment.id, { status: 'placement_pending' });
    const pp = plan.planFor(pend.user.id, { minutes: 30, now });
    check('a placement not taken is a catch-up block with the placement page', pp.blocks.length === 1 && pp.blocks[0].placement === true && /^\/placement\?enrollment=/.test(pp.blocks[0].href), pp.blocks);
    const none = db.insert('users', { email: 'dp-none@example.test', name: 'none', password_hash: 'x', onboarded: true });
    check('a learner with no subjects gets an empty plan, not an error', plan.planFor(none.id, { minutes: 30, now }).blocks.length === 0);
  }

  console.log('the route and the remembered minutes');
  {
    const who = learner([GRADE]);
    const app = await serve([require('../routes/daily-plan')]);
    const anon = await app.call('GET', '/api/plan/today?minutes=30', null, null);
    check('signed-out is refused', anon.status === 401, anon.status);
    const r = await app.call('GET', '/api/plan/today?minutes=30', null, who.user.id);
    check('GET /api/plan/today?minutes=30 answers the blocks, the minutes and the presets', r.status === 200 && r.body.minutes === 30 && Array.isArray(r.body.blocks) && JSON.stringify(r.body.presets) === JSON.stringify([30, 45, 60, 90, 120]) && r.body.minutes_used <= 30, r.body && Object.keys(r.body));
    check('a bad minutes value is refused', (await app.call('GET', '/api/plan/today?minutes=5', null, who.user.id)).status === 400 && (await app.call('GET', '/api/plan/today?minutes=abc', null, who.user.id)).status === 400 && (await app.call('GET', '/api/plan/today?minutes=999', null, who.user.id)).status === 400);
    const d = await app.call('GET', '/api/plan/today', null, who.user.id);
    check('with no minutes it uses the default (45) until the learner picks', d.status === 200 && d.body.minutes === 45, d.body && d.body.minutes);
    const put = await app.call('PUT', '/api/plan/minutes', { minutes: 90 }, who.user.id);
    check('the choice is remembered per learner', put.status === 200 && put.body.minutes === 90 && db.byId('users', who.user.id).daily_plan_minutes === 90);
    const again = await app.call('GET', '/api/plan/today', null, who.user.id);
    const other = learner([GRADE]);
    const otherPlan = await app.call('GET', '/api/plan/today', null, other.user.id);
    check('the next visit starts from it, and another learner is not affected', again.body.minutes === 90 && otherPlan.body.minutes === 45, [again.body.minutes, otherPlan.body.minutes]);
    check('an out-of-range choice is refused and not stored', (await app.call('PUT', '/api/plan/minutes', { minutes: 3 }, who.user.id)).status === 400 && db.byId('users', who.user.id).daily_plan_minutes === 90);
    check('an explicit minutes value wins over the remembered one without changing it', (await app.call('GET', '/api/plan/today?minutes=30', null, who.user.id)).body.minutes === 30 && db.byId('users', who.user.id).daily_plan_minutes === 90);
    app.close();
  }

  console.log('the dashboard card');
  {
    const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'dashboard.js'), 'utf8');
    check('the card has the five presets and remembers the pick', /PRESETS = \[30, 45, 60, 90, 120\]/.test(js) && /PUT', '\/api\/plan\/minutes/.test(js) && /\/api\/plan\/today/.test(js));
    check('Start opens the first block', /Start: /.test(js) && /plan\.blocks \|\| \[\]/.test(js) && /find\(\(b\) => b\.kind !== 'break' && b\.href\)/.test(js));
    check('the card sits in the existing Today\'s plan section (no restyle of the page)', /id="daily-plan"/.test(js) && /home-plan/.test(js) && !/<style/.test(js));
  }

  console.log('simulated gate');
  {
    const r = spawnSync(process.execPath, [path.join(__dirname, 'daily-plan-sim.js'), '--gate'], { encoding: 'utf8' });
    check('SIMULATED: no subject untouched more than 2 days, the minutes used, the test and far-behind subjects favoured, the old dashboard starves', r.status === 0, (r.stdout || '').slice(-400));
  }

  finish();
})().catch((e) => { console.error(e); failures += 1; finish(); });
