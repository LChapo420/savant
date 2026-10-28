/**
 * Tests for study sessions and retention enforcers (services/study-sessions.js,
 * services/enforcers.js, services/retention-params.js, routes/retention.js):
 * the time budget (full under 10% of active time, at measured item timings),
 * choosing and resuming on return, scheduled enforcers, owner base against
 * optimized, and that no question comes from outside the covered window.
 *
 *   node scripts/retention-enforcers-test.js
 *
 * Runs on its own throwaway data file with every model key blanked.
 */
const os = require('os');
const path = require('path');
const fs = require('fs');
const http = require('http');

process.env.NODE_ENV = 'test';
for (const k of Object.keys(process.env)) if (/_API_KEY$|_KEY$|ANTHROPIC|OPENROUTER|NVIDIA|GEMINI|MIMO|MODELFLARE|XKIRO/.test(k) && k !== 'NODE_ENV') process.env[k] = '';
const tmp = path.join(os.tmpdir(), `${path.basename(__filename, '.js')}-${process.pid}.json`);
process.env.DB_FILE = tmp;
for (const k of ['RETENTION_ENFORCERS', 'ENFORCER_FOLD_REVIEW', 'RETENTION_PARAMS', 'RETENTION_PARAMS_FILE', 'OWNER_EMAIL', 'OWNER_BASE', 'ADAPT_OWNER', 'ADMIN_EMAILS']) delete process.env[k];

const express = require('express');
const db = require('../config/db');
const coverage = require('../services/coverage');
const params = require('../services/retention-params');
const study = require('../services/study-sessions');
const enforcers = require('../services/enforcers');
const schedule = require('../services/retention-schedule');
const objItems = require('../services/objective-items');
const { DEFAULT_OWNER } = require('../config/owner');

let failures = 0;
let checks = 0;
function check(label, ok, detail) {
  checks += 1;
  if (ok) { console.log(`  ok   ${label}${process.env.SHOW_DETAIL && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ''}`); return; }
  failures += 1;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 500)}`}`);
}

const MIN = 60000;
const DAY = 24 * 3600 * 1000;
const TRACK = 'math';
const GRADE = 'counting_and_comparing';
const model = coverage.modelFor(TRACK, GRADE);
const withItems = model.objectives.filter((o) => objItems.forObjective(TRACK, GRADE, o.id).length >= 3);

let users = 0;
function learner(email) {
  users += 1;
  const user = db.insert('users', { email: email || `ret-${users}@example.test`, name: `r${users}`, password_hash: 'x', streak: 0, xp: 0, onboarded: true, retention_tz: 'UTC' });
  const enrollment = db.insert('enrollments', {
    user_id: user.id, track_id: TRACK, grade_id: GRADE, target_level: 300, current_level: 200, level_items: 0, levels_completed: 0, xp: 0, status: 'active', placed_at: new Date().toISOString(),
  });
  const session = db.insert('sessions', { user_id: user.id, enrollment_id: enrollment.id, track_id: TRACK, grade_id: GRADE, level: 1, kind: 'lesson', blocks: [], started_at: new Date(Date.now() - 90 * DAY).toISOString(), ended_at: new Date().toISOString() });
  return { user, enrollment, session };
}

/** One answered multiple-choice check on objective o at time t. */
function answer(who, o, t, correct = true, ms = 15000, extra = {}) {
  return db.insert('items', {
    user_id: who.user.id, session_id: who.session.id, skill_id: o.skill, difficulty: 3, format: 'multiple_choice', role: 'check', level: o.lesson_level,
    prompt: `q ${o.id} ${t} ${Math.random()}`, answer: 'a', choices: ['a', 'b', 'c', 'd'], rationale: 'because', block: 0, index: 0,
    user_answer: correct ? 'a' : 'b', correct, ms, coach_used: false, answered_at: new Date(t).toISOString(), updated_at: new Date(t).toISOString(), ...extra,
  });
}

/** A study session from t0 lasting `minutes` of steady activity (a beat every 30 s), with an answer every `every` minutes. */
function studied(who, t0, minutes, { objectives = withItems, every = 1, wrongFrom = Infinity, ms = 15000 } = {}) {
  study.start(who.user.id, { now: t0 });
  const made = [];
  for (let k = 0; k < minutes * 2; k++) {
    const t = t0 + (k + 1) * 30000;
    study.beat(who.user.id, { now: t });
    if ((k + 1) % (every * 2) === 0) {
      const n = made.length;
      const o = objectives[n % objectives.length];
      made.push(answer(who, o, t, n < wrongFrom, ms));
    }
  }
  return made;
}

function serve(routers) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.user = db.byId('users', Number(req.headers['x-user'])) || null; next(); });
  for (const r of routers) app.use('/api', r);
  app.use('/api', (req, res) => res.status(404).json({ error: 'No such endpoint.' }));
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const call = (method, url, body, uid) => new Promise((done, fail) => {
        const data = body ? JSON.stringify(body) : null;
        const req = http.request({ host: '127.0.0.1', port, path: url, method, headers: { 'content-type': 'application/json', 'x-user': String(uid || ''), ...(data ? { 'content-length': Buffer.byteLength(data) } : {}) } }, (res) => {
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

/** Answer every open question of a running enforcer through the ordinary route: `pick(item, k)` says right or wrong. */
async function play(app, uid, id, { pick = () => true, ms = 15000, stopAfter = Infinity } = {}) {
  let n = 0;
  for (let guard = 0; guard < 200; guard++) {
    const enf = (await app.call('GET', `/api/retention/enforcers/${id}`, null, uid)).body.enforcer;
    const next = enf.items.find((i) => !i.answered);
    if (!next || n >= stopAfter) return enf;
    const row = db.byId('items', next.id);
    const right = pick(row, n);
    const r = await app.call('POST', `/api/sessions/${next.session_id}/answer`, { item_id: next.id, answer: right ? row.answer : '__wrong__', ms }, uid);
    if (r.status !== 200) return { error: r };
    n += 1;
  }
  return null;
}

function done() {
  try { fs.unlinkSync(tmp); } catch { /* gone */ }
  console.log(failures ? `\n${failures} of ${checks} check(s) FAILED` : `\nall ${checks} checks passed`);
  process.exit(failures ? 1 : 0);
}

(async () => {
  const app = await serve([require('../routes/retention'), require('../routes/learn'), require('../routes/review')]);
  check('fixture: a grade with objective items', withItems.length >= 6, withItems.length);

  console.log('params');
  {
    const p = params.load();
    check('the research file is in force', p.source === 'retention-enforcer-params.json' && p.version === '1.2.0', { source: p.source, version: p.version });
    let worst = 0;
    for (const scope of params.SCOPES) {
      for (let active = 1 * MIN; active <= 40 * 3600 * 1000; active += 7 * MIN) {
        const q = params.budgetMs(scope, 'quick', active);
        const m = params.budgetMs(scope, 'medium', active);
        const f = params.budgetMs(scope, 'full', active);
        worst = Math.max(worst, f / active);
        if (!(q < m && m <= f) && f > 0) { check(`quick < medium <= full (${scope}, ${active})`, false, { q, m, f }); break; }
      }
    }
    check('every scope, 1 min to 40 h of active time: full budget <= 9.5% (under the owner\'s 10%), quick < medium <= full', worst <= 0.095 + 1e-9, worst);
    check('weekly takes its share and cap from the file (5%, 15 min)', p.scopes.weekly.full_share === 0.05 && p.scopes.weekly.cap_ms === 15 * MIN);
    check('tiers retry as the file says (quick 1, medium 2, full 3 attempts)', params.attemptsFor('day', 'quick') === 1 && params.attemptsFor('day', 'medium') === 2 && params.attemptsFor('day', 'full') === 3);
    check('the allocation rule comes from the file (2 first tries at most, 1 on a session; seconds on medium and full; 0.35)', p.allocation.max_first.weekly === 2 && p.allocation.max_first.session === 1 && p.allocation.second_tiers.join() === 'medium,full' && p.allocation.second_value === 0.35, p.allocation);
    // The combined budget: never the sum of its parts, always under 10% of the union.
    let worstC = 0;
    let sumOk = true;
    for (let wk = 30 * MIN; wk <= 40 * 3600 * 1000; wk += 37 * MIN) {
      const parts = [{ scope: 'weekly', active_ms: wk }, { scope: 'semiweekly', active_ms: wk * 0.55 }, { scope: 'day', active_ms: wk * 0.15 }];
      for (const t of params.TIERS) {
        const c = params.combinedBudgetMs(parts, t, wk);
        worstC = Math.max(worstC, c / wk);
        const each = parts.map((x) => params.budgetMs(x.scope, t, x.active_ms));
        if (!(c <= each.reduce((a, b) => a + b, 0) && c >= Math.min(Math.max(...each), Math.floor(params.load().full_cap * wk * params.load().multipliers[t])) - 1)) sumOk = false;
      }
    }
    check('combined budget (weekly + semi-weekly + day), 30 min to 40 h: at most 9.5% of the union, under the sum of the parts, at least the largest part', worstC <= 0.095 + 1e-9 && sumOk, { worstC, sumOk });
  }

  console.log('the allocation rule, on its own');
  {
    const plan = [
      { key: 'a', eligible: true, score: 1.2, fragile: true, cost: 30000, cost_retry: 40000 },
      { key: 'b', eligible: true, score: 0.5, fragile: false, cost: 30000, cost_retry: 40000 },
      { key: 'c', eligible: true, score: 0.05, fragile: false, cost: 30000, cost_retry: 40000 },
      { key: 'd', eligible: false, score: 2, fragile: true, cost: 30000, cost_retry: 40000 },
    ];
    const full = enforcers.slots(plan, { scope: 'weekly', tier: 'full', attempts: 3 });
    const show = (l) => l.map((x) => `${x.key}${x.k}`).join(' ');
    check('full: one first try per topic, a second only for the fragile ones', full.filter((x) => x.k === 1).length === 4 && full.filter((x) => x.k === 2).map((x) => x.key).sort().join() === 'a,d', show(full));
    check('ranked by value per cost: a fragile topic\'s second (0.35 x 1.2) beats a secure topic\'s first (0.05); eligible before not', show(full) === 'a1 b1 a2 c1 d1 d2', show(full));
    check('quick: no second tries', enforcers.slots(plan, { scope: 'weekly', tier: 'quick' }).every((x) => x.k === 1));
    check('end of session: one try per topic, whatever the tier', enforcers.slots(plan, { scope: 'session', tier: 'full', attempts: 3 }).every((x) => x.k === 1));
    check('the owner\'s base version: one per topic, in the order given', show(enforcers.slots(plan, { scope: 'weekly', tier: 'full', base: true })) === 'a1 b1 c1 d1');
  }

  console.log('study sessions');
  {
    const a = learner();
    const t0 = Date.now() - 5 * 3600 * 1000;
    // A zone where t0 is about 10:00, so the 40 minutes below never cross the learner's
    // midnight (a paused session ends with its local day): in UTC it failed when run
    // between about 04:20 and 05:00 UTC (found 2026-10-25 04:31 UTC).
    const tenOff = Math.max(-12, Math.min(12, 10 - new Date(t0).getUTCHours()));
    db.update('users', a.user.id, { retention_tz: tenOff === 0 ? 'UTC' : `Etc/GMT${tenOff > 0 ? '-' : '+'}${Math.abs(tenOff)}` });
    study.start(a.user.id, { now: t0 });
    study.beat(a.user.id, { now: t0 + 60000 });
    study.beat(a.user.id, { now: t0 + 21 * MIN }); // 20 minutes without a sign of activity counts 5
    const s1 = study.current(a.user.id, t0 + 21 * MIN);
    check('active time: an idle gap counts at most 5 minutes', s1.active_ms === 60000 + 5 * MIN, s1.active_ms);
    study.pause(a.user.id, { now: t0 + 22 * MIN });
    study.beat(a.user.id, { now: t0 + 30 * MIN });
    check('paused: heartbeats add nothing', study.current(a.user.id, t0 + 30 * MIN).active_ms === 60000 + 6 * MIN);
    study.resume(a.user.id, { now: t0 + 40 * MIN });
    study.beat(a.user.id, { now: t0 + 40.5 * MIN });
    check('resumed: the clock runs again from the resume', study.current(a.user.id, t0 + 40.5 * MIN).active_ms === 60000 + 6.5 * MIN);
    check('the first session sets the anchor (local day)', db.byId('users', a.user.id).retention_anchor === schedule.localDate(t0, 'UTC'));
    const late = study.current(a.user.id, t0 + 40.5 * MIN + 31 * MIN);
    const ended = db.find('study_sessions', (x) => x.user_id === a.user.id)[0];
    check('a session idle for 30 minutes ends by itself, as "left without choosing"', late === null && ended.end_kind === 'idle');
    check('...and with no answers there is nothing to lock in', !!ended.enforcer_id && db.byId('enforcers', ended.enforcer_id).status === 'empty');
  }

  console.log('end session: the time budget at measured item timings');
  let b;
  let enfB;
  {
    b = learner();
    // Measured timings: 40 earlier answers at 15 s (above median_after = 20).
    for (let k = 0; k < 40; k++) answer(b, withItems[k % withItems.length], Date.now() - 20 * DAY - k * MIN, true, 15000);
    const t0 = Date.now() - 61 * MIN;
    // Something outside the window, on other objectives, just before the session.
    const outside = model.objectives.filter((o) => !withItems.includes(o)).slice(0, 3);
    const before = outside.map((o) => answer(b, o, t0 - 10 * MIN, false));
    const inWin = studied(b, t0, 60, { objectives: withItems.slice(0, 8), every: 2, wrongFrom: 20 });
    const after = outside.map((o) => answer(b, o, t0 + 200 * MIN, false));
    const r = await app.call('POST', '/api/retention/study/end', { kind: 'session' }, b.user.id);
    check('end answers with the enforcer to choose for', r.status === 200 && r.body.enforcer && r.body.enforcer.status === 'choosing', r.body);
    // The session really ended at "now"; read its window back as what was studied.
    enfB = db.byId('enforcers', r.body.enforcer.id);
    const active = enfB.base_active_ms;
    check('the enforcer is sized from the session\'s active time (about 60 min)', Math.abs(active - 60 * MIN) <= 2 * MIN, active);
    const opts = r.body.enforcer.options;
    check('all three tiers fit a 60-minute session', opts.every((o) => o.available), opts);
    check('quick < medium < full in questions and minutes', opts[0].items <= opts[1].items && opts[1].items <= opts[2].items && opts[0].minutes < opts[2].minutes, opts);
    check('full is planned under 10% of active time', opts[2].minutes * MIN < 0.1 * active, { full: opts[2].minutes, active: active / MIN });
    check('a default tier is preselected', ['quick', 'medium', 'full'].includes(r.body.enforcer.default_tier), r.body.enforcer.default_tier);
    const c = await app.call('POST', `/api/retention/enforcers/${enfB.id}/choose`, { tier: 'full' }, b.user.id);
    check('choose full: running, with questions', c.status === 200 && c.body.enforcer.status === 'running' && c.body.enforcer.items.length >= 2, c.body);
    enfB = db.byId('enforcers', enfB.id);
    check('the plan\'s own cost is within the full budget', enfB.planned_ms <= enfB.budget_ms && enfB.budget_ms <= 0.095 * active, { planned: enfB.planned_ms, budget: enfB.budget_ms });
    const qs = enforcers.itemsOf(enfB);
    const winIds = new Set(inWin.map((i) => i.id));
    const winObjectives = new Set(withItems.slice(0, 8).map((o) => o.id));
    check('no question from outside the window: every one is on an objective worked in the session', qs.every((q) => winObjectives.has(q.objective_id)), qs.map((q) => q.objective_id));
    check('...and traces back to an answer inside the window', qs.every((q) => winIds.has(q.source_item_id)), qs.map((q) => q.source_item_id));
    check('...never to the answers just before or after it', qs.every((q) => !before.concat(after).some((x) => x.id === q.source_item_id)));
    check('objective items first: questions written for their objective', qs.every((q) => q.source === 'objective_item'), qs.map((q) => q.source));
    check('optimized: the objectives answered wrong come first in the plan', enfB.unit_plan.slice(0, 2).every((u) => u.last_wrong), enfB.unit_plan.map((u) => u.last_wrong));
    // Answer at the measured 15 s, every first try wrong: retries come back, the time stays under 10%.
    const end = await play(app, b.user.id, enfB.id, { pick: (row) => !!row.requeue_of, ms: 15000 });
    enfB = db.byId('enforcers', enfB.id);
    const items = enforcers.itemsOf(enfB);
    const retries = items.filter((i) => i.requeue_of);
    check('a miss comes back as "one more try" on a different question', retries.length >= 1 && retries.every((rq) => rq.prompt !== db.byId('items', rq.requeue_of).prompt), retries.length);
    const firstMiss = items.find((i) => !i.requeue_of && i.correct === false);
    const retryOf = items.find((i) => i.requeue_of === (firstMiss && firstMiss.id));
    check('a retry is at least 3 questions after its miss (when that many remain)', !retryOf || enfB.order.indexOf(retryOf.id) - enfB.order.indexOf(firstMiss.id) >= Math.min(3, enfB.order.length - 1 - enfB.order.indexOf(firstMiss.id)), enfB.order);
    check('the time actually used stays under 10% of the session (answers at the measured timing)', enfB.elapsed_ms < 0.1 * active, { used: enfB.elapsed_ms, active });
    check('nothing is left to answer once the budget is spent', end && !end.error && end.items.every((i) => i.answered), end && end.error);
    const fin = await app.call('POST', `/api/retention/enforcers/${enfB.id}/finish`, {}, b.user.id);
    check('finish: done, with results', fin.status === 200 && fin.body.enforcer.status === 'done' && fin.body.results.answered === items.filter((i) => i.correct !== null).length, fin.body);
    const ans = coverage.answersFor(b.user.id, db.byId('enrollments', b.enrollment.id));
    check('coverage reads the enforcer\'s first tries as evidence on their objectives', ans.filter((x) => x.role === 'review' && x.objective).length === items.filter((i) => !i.requeue_of && i.correct !== null).length, ans.length);
    check('...and leaves out the retries right after feedback (not a retrieval from memory)', retries.length > 0 && ans.filter((x) => x.role === 'review').length < items.filter((i) => i.correct !== null).length);
    const st = require('../services/mastery').stateFor(b.user.id, items[0].skill_id);
    check('the review schedule (mastery) has the answers', st.attempts > 0 && !!st.next_due_at);
    check('the learner\'s level did not move', db.byId('enrollments', b.enrollment.id).current_level === 200);
  }

  console.log('timing property: many sessions, measured timings, full at most 9.5% planned');
  {
    let worst = 0;
    for (let k = 0; k < 12; k++) {
      const w = learner();
      const ms = 6000 + k * 4000;
      for (let j = 0; j < 25; j++) answer(w, withItems[j % withItems.length], Date.now() - 30 * DAY - j * MIN, true, ms);
      const minutes = 6 + k * 9;
      const t0 = Date.now() - 6 * 3600 * 1000;
      studied(w, t0, minutes, { every: 1, ms, wrongFrom: k % 3 === 0 ? 0 : 1e9 });
      const ended = study.end(w.user.id, { now: t0 + minutes * MIN + 1000 });
      const e = db.byId('enforcers', ended.enforcer_id);
      if (e.status !== 'choosing') continue;
      for (const o of enforcers.options(e)) if (o.available) worst = Math.max(worst, (o.minutes * MIN) / e.base_active_ms);
      const full = enforcers.options(e).find((o) => o.tier === 'full');
      if (full.available) {
        enforcers.choose(w.user.id, e, 'full');
        const pe = db.byId('enforcers', e.id);
        worst = Math.max(worst, pe.planned_ms / pe.base_active_ms);
      }
    }
    check('12 learners, 6 to 105 minutes, answer times 6 to 50 s: every tier planned under 10% (worst share)', worst > 0 && worst <= 0.095 + 1e-9, worst);
  }

  console.log('left without choosing, and halfway: offered on return');
  {
    const c = learner();
    // A zone where it is about noon now, so the session two hours ago and the
    // End day session after it fall on one local day whatever the UTC hour (it
    // failed between 00:00 and 02:00 UTC in UTC, 2026-10-25).
    const noonOff = Math.max(-12, Math.min(12, 12 - new Date().getUTCHours()));
    db.update('users', c.user.id, { retention_tz: noonOff === 0 ? 'UTC' : `Etc/GMT${noonOff > 0 ? '-' : '+'}${Math.abs(noonOff)}` });
    const t0 = Date.now() - 2 * 3600 * 1000;
    studied(c, t0, 40, { objectives: withItems.slice(0, 6), every: 2 });
    // The learner closes the tab; the session ends itself after 30 idle minutes.
    study.current(c.user.id, t0 + 40 * MIN + 31 * MIN);
    let s = await app.call('GET', '/api/retention/state', null, c.user.id);
    check('on return: the unchosen enforcer is offered', s.body.offer && s.body.offer.scope === 'session' && s.body.offer.status === 'choosing' && s.body.offer.left_without_choosing, s.body);
    const blocked = await app.call('POST', '/api/retention/study/start', {}, c.user.id);
    check('Start session waits for it (409, with the offer)', blocked.status === 409 && blocked.body.offer.id === s.body.offer.id, blocked.status);
    const id = s.body.offer.id;
    await app.call('POST', `/api/retention/enforcers/${id}/choose`, { tier: 'medium' }, c.user.id);
    await play(app, c.user.id, id, { stopAfter: 1 });
    // The learner leaves halfway (another route even closes the sitting).
    const sid = db.byId('enforcers', id).session_ids[0];
    db.update('sessions', sid, { ended_at: new Date().toISOString(), abandoned: true });
    s = await app.call('GET', '/api/retention/state', null, c.user.id);
    check('on return: the half-done enforcer is offered to finish', s.body.offer && s.body.offer.id === id && s.body.offer.status === 'running', s.body.offer);
    const again = await app.call('POST', '/api/retention/study/start', {}, c.user.id);
    check('Start session waits for it too', again.status === 409);
    const view = await app.call('GET', `/api/retention/enforcers/${id}`, null, c.user.id);
    check('the enforcer page has the answered and the open questions, and its sitting is open again', view.body.enforcer.answered === 1 && view.body.enforcer.items.some((i) => !i.answered) && !db.byId('sessions', sid).ended_at, view.body.enforcer.answered);
    const quick = await app.call('POST', `/api/retention/enforcers/${id}/choose`, { tier: 'quick' }, c.user.id);
    const q = db.byId('enforcers', id);
    check('choosing another tier on return re-sizes what is left (or closes it)', quick.status === 200 && (q.tier === 'quick' || q.status === 'done'), { status: quick.status, tier: q.tier, st: q.status });
    if (q.status === 'running') await play(app, c.user.id, id);
    if (db.byId('enforcers', id).status === 'running') await app.call('POST', `/api/retention/enforcers/${id}/finish`, {}, c.user.id);
    const ok = await app.call('POST', '/api/retention/study/start', {}, c.user.id);
    check('once it is closed, the next session starts', ok.status === 201 && ok.body.study.status === 'running', ok.status);
    const e2 = await app.call('POST', '/api/retention/study/end', { kind: 'day' }, c.user.id);
    check('End day session: covers the whole day', e2.status === 200 && (e2.body.enforcer.scope === 'day'), e2.body.enforcer && e2.body.enforcer.scope);
    const none = await app.call('POST', `/api/retention/enforcers/${e2.body.enforcer.id}/choose`, { tier: 'none' }, c.user.id);
    check('no enforcer: closed as declined, nothing waiting', none.body.enforcer.status === 'declined' && !(await app.call('GET', '/api/retention/state', null, c.user.id)).body.offer);
  }

  console.log('scheduled enforcers');
  {
    const d = learner();
    const today = schedule.localDate(Date.now(), 'UTC');
    const anchor = schedule.addDays(today, -9);
    db.update('users', d.user.id, { retention_anchor: anchor });
    const at = (day, h) => Date.parse(`${schedule.addDays(anchor, day)}T${String(h).padStart(2, '0')}:00:00Z`);
    for (let day = 0; day <= 8; day++) {
      const t0 = at(day, 9);
      studied(d, t0, 30, { objectives: withItems.slice(day % 3, (day % 3) + 3), every: 3 });
      study.end(d.user.id, { now: t0 + 31 * MIN });
      for (const e of db.find('enforcers', (x) => x.user_id === d.user.id && x.status === 'choosing')) enforcers.decline(d.user.id, e);
    }
    const outside = answer(d, model.objectives[model.objectives.length - 1], Date.now() + 1000);
    const s = await app.call('GET', '/api/retention/state', null, d.user.id);
    const o = s.body.offer;
    check('day 9: the semi-weekly and the weekly still waiting are one offer, of the wider type', o && o.scope === 'weekly' && o.covers.map((x) => x.type).sort().join() === 'semiweekly,weekly', o && { scope: o.scope, covers: o.covers });
    check('its window runs from the anchor through the weekly\'s own day (day 7)', o.window.from_date === anchor && o.window.to_date === schedule.addDays(anchor, 7), o.window);
    check('it took in the semi-weekly and the end of day 7 (absorbed), as one enforcer', (o.absorbs || []).map((x) => x.type).sort().join() === 'day,semiweekly', o.absorbs);
    check('it is marked late (the weekly was due on day 7)', o.late === true);
    const ch = await app.call('POST', `/api/retention/enforcers/${o.id}/choose`, { tier: 'quick' }, d.user.id);
    const qs = enforcers.itemsOf(db.byId('enforcers', o.id));
    const src = qs.map((q) => db.byId('items', q.source_item_id));
    check('choose quick: questions, none from outside the window', ch.status === 200 && qs.length >= 1 && src.every((x) => x && x.id !== outside.id && schedule.localDate(Date.parse(x.answered_at), 'UTC') <= o.window.to_date), src.map((x) => x && x.answered_at));
    check('quick does not retry (1 attempt)', db.byId('enforcers', o.id).attempts === 1);
    await play(app, d.user.id, o.id, { pick: () => false });
    check('a quick enforcer adds no retries after misses', !enforcers.itemsOf(db.byId('enforcers', o.id)).some((i) => i.requeue_of));
    await app.call('POST', `/api/retention/enforcers/${o.id}/finish`, {}, d.user.id);
    const cal = await app.call('GET', `/api/retention/calendar?month=${today.slice(0, 7)}`, null, d.user.id);
    const byDate = new Map(cal.body.days.map((x) => [x.date, x]));
    const w7 = byDate.get(schedule.addDays(anchor, 7));
    const s5 = byDate.get(schedule.addDays(anchor, 3));
    if (w7) check('calendar: day 7 is one weekly that absorbed the semi-weekly, done', w7.scheduled && w7.scheduled.type === 'weekly' && w7.scheduled.status === 'done' && w7.scheduled.absorbs.map((x) => x.type).join() === 'semiweekly', w7.scheduled);
    if (s5) check('calendar: the semi-weekly on day 3, never offered, shows missed', s5.scheduled && s5.scheduled.type === 'semiweekly' && s5.scheduled.status === 'missed', s5.scheduled);
    const next = cal.body.upcoming;
    check('calendar: upcoming list follows the schedule', next.length >= 4 && next.every((u) => u.type === schedule.typeOn(schedule.dayIndex(anchor, u.date))), next.slice(0, 4));
    check('calendar: never two types on one day', cal.body.days.every((x) => !x.scheduled || schedule.typeOn(x.day) === x.scheduled.type));
  }

  console.log('absorption: End day session on a weekly\'s day is one combined enforcer, one plan');
  {
    // A zone where it is about noon now, so "today" has room for a session whatever the UTC hour.
    const off = Math.max(-12, Math.min(12, 12 - new Date().getUTCHours()));
    const tz = off === 0 ? 'UTC' : `Etc/GMT${off > 0 ? '-' : '+'}${Math.abs(off)}`;
    const e = learner();
    db.update('users', e.user.id, { retention_tz: tz });
    for (let j = 0; j < 30; j++) answer(e, withItems[j % withItems.length], Date.now() - 40 * DAY - j * MIN, true, 15000);
    const today = schedule.localDate(Date.now(), tz);
    const anchor = schedule.addDays(today, -7);
    db.update('users', e.user.id, { retention_anchor: anchor });
    const localAt = (date, h) => Date.parse(`${date}T${String(h).padStart(2, '0')}:00:00Z`) - off * 3600 * 1000;
    const before = withItems.slice(0, 4);
    const todays = withItems.slice(4, 8);
    // Days 4, 5, 6 of the week: 30 minutes each on four objectives (their session enforcers declined).
    for (const day of [4, 5, 6]) {
      const t0 = localAt(schedule.addDays(anchor, day), 9);
      studied(e, t0, 30, { objectives: before, every: 3 });
      study.end(e.user.id, { now: t0 + 31 * MIN });
      for (const x of db.find('enforcers', (r) => r.user_id === e.user.id && r.status === 'choosing')) enforcers.decline(e.user.id, x);
    }
    // Outside every window: the day before the anchor.
    const outside = answer(e, withItems[8 % withItems.length], localAt(schedule.addDays(anchor, -1), 12), false);
    let st = await app.call('GET', '/api/retention/state', null, e.user.id);
    check('on the weekly\'s day, nothing scheduled blocks today\'s sessions (it is taken at End day session)', !st.body.offer || !enforcers.SCHEDULED.has(st.body.offer.scope), st.body.offer && st.body.offer.scope);
    check('the state says today is the weekly, with the semi-weekly absorbed', st.body.scheduled_today && st.body.scheduled_today.type === 'weekly' && st.body.scheduled_today.absorbs.map((x) => x.type).join() === 'semiweekly' && !st.body.scheduled_today.done, st.body.scheduled_today);
    // Today: an hour on four new objectives, the first 12 answers wrong (a miss rate of about 0.4: fragile).
    const t0 = Date.now() - 61 * MIN;
    const inToday = studied(e, t0, 60, { objectives: todays, every: 2, wrongFrom: 0 }).map((i, k) => (k >= 12 ? db.update('items', i.id, { correct: true, user_answer: 'a' }) : i));
    const r = await app.call('POST', '/api/retention/study/end', { kind: 'day' }, e.user.id);
    const o = r.body.enforcer;
    check('End day session answers with ONE enforcer: the weekly', r.status === 200 && o && o.scope === 'weekly' && o.status === 'choosing', o && { scope: o.scope, status: o.status });
    check('it stands for the weekly and the semi-weekly of today and absorbs the end of day', o.covers.map((c) => c.type).sort().join() === 'semiweekly,weekly' && o.covers.every((c) => c.date === today) && o.absorbs.map((x) => x.type).sort().join() === 'day,semiweekly', { covers: o.covers, absorbs: o.absorbs });
    check('its window: the week, the semi-week and today together (anchor to today)', o.window.from_date === anchor && o.window.to_date === today, o.window);
    check('no separate end-of-day enforcer was made', !db.find('enforcers', (x) => x.user_id === e.user.id && x.scope === 'day').length);
    let enf = db.byId('enforcers', o.id);
    const partScopes = enf.parts.map((x) => x.scope).sort().join();
    check('sized from its parts: weekly, semi-weekly and day, each on its own window', partScopes === 'day,semiweekly,weekly' && enf.parts.every((x) => x.active_ms > 0), enf.parts);
    const sep = (t) => enf.parts.reduce((sum, x) => sum + params.budgetMs(x.scope, t, x.active_ms), 0);
    const opts = enforcers.options(enf);
    check('the combined budget is less than the three enforcers added up, and under 10% of the covered time', opts.every((x) => x.budget_minutes * MIN <= sep(x.tier) + 1 && x.budget_minutes * MIN < 0.1 * enf.base_active_ms), { opts, sum_full: sep('full') / MIN, active: enf.base_active_ms / MIN });
    const c = await app.call('POST', `/api/retention/enforcers/${o.id}/choose`, { tier: 'full' }, e.user.id);
    enf = db.byId('enforcers', o.id);
    check('choose full: running, its plan within the budget (under 10%)', c.status === 200 && enf.status === 'running' && enf.planned_ms <= enf.budget_ms && enf.budget_ms <= 0.095 * enf.base_active_ms, { planned: enf.planned_ms, budget: enf.budget_ms });
    const qs = enforcers.itemsOf(enf);
    const winObjectives = new Set([...before, ...todays].map((x) => x.id));
    const winRows = new Set(db.find('items', (i) => i.user_id === e.user.id && !i.enforcer_id && i.correct !== null && i.correct !== undefined && schedule.localDate(Date.parse(i.answered_at), tz) >= anchor && schedule.localDate(Date.parse(i.answered_at), tz) <= today).map((i) => i.id));
    check('no question from outside the window: objectives worked in it, tracing back to its answers', qs.every((q) => winObjectives.has(q.objective_id) && winRows.has(q.source_item_id) && q.source_item_id !== outside.id), qs.map((q) => [q.objective_id, q.source_item_id]));
    check('today\'s work is in the plan (the day was absorbed, not dropped)', qs.some((q) => todays.some((x) => x.id === q.objective_id)) && qs.some((q) => before.some((x) => x.id === q.objective_id)), qs.map((q) => q.objective_id));
    const perTopic = {};
    for (const q of qs) perTopic[q.enforcer_unit] = (perTopic[q.enforcer_unit] || 0) + 1;
    check('NOT the sum per scope: at most 2 first tries on any topic, though it covers three scopes', Object.values(perTopic).every((n) => n <= 2), perTopic);
    const fragile = new Set(enf.unit_plan.filter((u) => u.fragile).map((u) => u.key));
    const twice = Object.keys(perTopic).filter((k) => perTopic[k] === 2);
    check('a second try only on a fragile topic (missed today), and there is at least one', twice.length >= 1 && twice.every((k) => fragile.has(k)), { twice, fragile: [...fragile] });
    check('the secure topics of earlier days (all right, recall fine now) get one try each: their fading is for the next spaced enforcer', before.every((x) => !fragile.has(`${TRACK}/${GRADE}/o:${x.id}`) && (perTopic[`${TRACK}/${GRADE}/o:${x.id}`] || 0) <= 1) && before.some((x) => perTopic[`${TRACK}/${GRADE}/o:${x.id}`] === 1), { perTopic, fragile: [...fragile] });
    check('the second tries are varied: a different question on the same objective, never the learner\'s own check', qs.filter((q) => q.enforcer_try === 2).every((q) => q.source === 'objective_item' && qs.some((p) => p.enforcer_unit === q.enforcer_unit && p.enforcer_try === 1 && p.prompt !== q.prompt)));
    const pos = (q) => enf.order.indexOf(q.id);
    const firstPos = new Map(qs.filter((q) => q.enforcer_try === 1).map((q) => [q.enforcer_unit, pos(q)]));
    const lastFirst = Math.max(...qs.filter((q) => q.enforcer_try === 1).map(pos).filter((p, _i, a) => p < a.length + qs.length));
    check('spaced within the sitting: each second try comes after the first tries, far from its own first', qs.filter((q) => q.enforcer_try === 2).every((q) => pos(q) > firstPos.get(q.enforcer_unit) && pos(q) - firstPos.get(q.enforcer_unit) >= Math.min(3, enf.planned_topics - 1)), { order: qs.map((q) => `${q.enforcer_unit.split(':').pop().slice(-6)}#${q.enforcer_try}`), lastFirst });
    const f = enforcers.fit(enf, 'full');
    check('the plan follows the rule: as many questions and topics as the allocation fits in the budget', enf.planned === f.n && enf.planned_topics === f.topics, { planned: enf.planned, topics: enf.planned_topics, fit: f });
    await play(app, e.user.id, o.id, { pick: (row) => row.enforcer_try !== 1 || !todays.some((x) => x.id === row.objective_id) });
    enf = db.byId('enforcers', o.id);
    check('the time used stays under 10% of the covered active time', enf.elapsed_ms < 0.1 * enf.base_active_ms, { used: enf.elapsed_ms, active: enf.base_active_ms });
    const items = enforcers.itemsOf(enf);
    check('every retry on an objective is a question written for it (never the skill bank question, which can be off-grade)', items.filter((i) => i.requeue_of && i.objective_id).every((i) => i.source === 'objective_item'), items.filter((i) => i.requeue_of).map((i) => i.source));
    check('a missed first try keeps its own retry chain (attempts counted per question, not per topic)', items.filter((i) => i.requeue_of).every((rq) => items.filter((x) => x.id === rq.requeue_of || x.requeue_of === rq.requeue_of).length <= 3));
    await app.call('POST', `/api/retention/enforcers/${o.id}/finish`, {}, e.user.id);
    st = await app.call('GET', '/api/retention/state', null, e.user.id);
    check('once done: today shows the weekly done, nothing waiting', st.body.scheduled_today.done === true && !st.body.offer, st.body);
    const cal = await app.call('GET', `/api/retention/calendar?month=${today.slice(0, 7)}`, null, e.user.id);
    const cell = cal.body.days.find((x) => x.date === today);
    check('calendar: today is ONE weekly that absorbed the semi-weekly (and the end of day), done', cell && cell.scheduled.type === 'weekly' && cell.scheduled.absorbs.map((x) => x.type).join() === 'semiweekly' && cell.scheduled.with_day && cell.scheduled.status === 'done' && !cell.ends.some((x) => x.scope === 'day'), cell && cell.scheduled);
    check('calendar: the absorbed window runs from the anchor to today', cell.scheduled.window.from_date === anchor && cell.scheduled.window.to_date === today, cell.scheduled.window);
    const nextW = cal.body.upcoming.find((u) => u.type === 'weekly');
    check('calendar: the next weekly is listed with the semi-weekly it absorbs', nextW && nextW.absorbs.map((x) => x.type).join() === 'semiweekly', cal.body.upcoming.slice(0, 4));
    // Studying more and ending the day again: the scheduled one is done, so a plain end-of-day one.
    studied(e, Date.now() - 20 * MIN, 15, { objectives: todays, every: 3 });
    const again = await app.call('POST', '/api/retention/study/end', { kind: 'day' }, e.user.id);
    check('a second End day session the same day is a plain end-of-day enforcer (the scheduled one is done)', again.status === 200 && again.body.enforcer && again.body.enforcer.scope === 'day', again.body.enforcer && again.body.enforcer.scope);
    if (again.body.enforcer) enforcers.decline(e.user.id, db.byId('enforcers', again.body.enforcer.id));
  }

  console.log('a lone semi-weekly day: End day session is the semi-weekly, absorbing the day');
  {
    const off = Math.max(-12, Math.min(12, 12 - new Date().getUTCHours()));
    const tz = off === 0 ? 'UTC' : `Etc/GMT${off > 0 ? '-' : '+'}${Math.abs(off)}`;
    const g = learner();
    db.update('users', g.user.id, { retention_tz: tz });
    const today = schedule.localDate(Date.now(), tz);
    db.update('users', g.user.id, { retention_anchor: schedule.addDays(today, -10) }); // day 10: a semi-weekly alone
    const localAt = (date, h) => Date.parse(`${date}T${String(h).padStart(2, '0')}:00:00Z`) - off * 3600 * 1000;
    const t1 = localAt(schedule.addDays(today, -2), 9);
    studied(g, t1, 30, { objectives: withItems.slice(0, 3), every: 3 });
    study.end(g.user.id, { now: t1 + 31 * MIN });
    for (const x of db.find('enforcers', (r) => r.user_id === g.user.id && r.status === 'choosing')) enforcers.decline(g.user.id, x);
    // Day 7 (weekly) was 3 days ago with no work in its window: nothing waits.
    for (const x of db.find('enforcers', (r) => r.user_id === g.user.id && enforcers.SCHEDULED.has(r.scope) && r.status === 'choosing')) enforcers.decline(g.user.id, x);
    studied(g, Date.now() - 41 * MIN, 40, { objectives: withItems.slice(3, 6), every: 2 });
    const r = await app.call('POST', '/api/retention/study/end', { kind: 'day' }, g.user.id);
    const o = r.body.enforcer;
    check('End day session on day 10 is the semi-weekly, covering days 8 to 10 and absorbing the end of day', o && o.scope === 'semiweekly' && o.window.from_date === schedule.addDays(today, -2) && o.window.to_date === today && o.absorbs.map((x) => x.type).join() === 'day', o && { scope: o.scope, window: o.window, absorbs: o.absorbs });
    if (o) enforcers.decline(g.user.id, db.byId('enforcers', o.id));
  }

  console.log('owner: base version, and can skip');
  {
    const own = learner(DEFAULT_OWNER);
    const other = learner();
    for (const w of [own, other]) for (let j = 0; j < 30; j++) answer(w, withItems[j % withItems.length], Date.now() - 30 * DAY - j * MIN, true, 6000);
    const t0 = Date.now() - 45 * MIN;
    const runs = {};
    for (const w of [own, other]) {
      // Six objectives in order; only the last two are answered wrong.
      studied(w, t0, 36, { objectives: withItems.slice(0, 6), every: 6, wrongFrom: 4 });
      const r = await app.call('POST', '/api/retention/study/end', { kind: 'session' }, w.user.id);
      runs[w === own ? 'own' : 'other'] = db.byId('enforcers', r.body.enforcer.id);
    }
    check('the owner gets enforcers, marked base', runs.own.base === true && runs.own.status === 'choosing' && runs.other.base === false);
    const mc = params.load().cost.formats_ms.multiple_choice;
    check('base: the standard question time, not the owner\'s own (6 s measured)', runs.own.unit_plan.every((u) => u.cost >= mc) && runs.other.unit_plan.some((u) => u.cost < mc), { own: runs.own.unit_plan[0].cost, other: runs.other.unit_plan[0].cost });
    check('optimized: the two missed objectives rank first', runs.other.unit_plan.slice(0, 2).every((u) => u.last_wrong), runs.other.unit_plan.map((u) => u.last_wrong));
    check('base: the session\'s work in time order, not ranked by the owner\'s record', runs.own.unit_plan.map((u) => u.key).join() === withItems.slice(0, 6).map((o) => `${TRACK}/${GRADE}/o:${o.id}`).join(), runs.own.unit_plan.map((u) => u.key));
    check('base: no record-based scores', runs.own.unit_plan.every((u) => u.score === 0 && u.p_now === 0.8));
    const no = await app.call('POST', `/api/retention/enforcers/${runs.other.id}/skip`, {}, other.user.id);
    check('another learner cannot skip (403)', no.status === 403, no.status);
    const yes = await app.call('POST', `/api/retention/enforcers/${runs.own.id}/skip`, {}, own.user.id);
    check('the owner can skip any enforcer', yes.status === 200 && yes.body.enforcer.status === 'skipped' && yes.body.enforcer.can_skip === true);
    await app.call('POST', `/api/retention/enforcers/${runs.other.id}/choose`, { tier: 'quick' }, other.user.id);
    const mid = await app.call('POST', `/api/retention/enforcers/${runs.other.id}/skip`, {}, own.user.id);
    check('the owner cannot touch someone else\'s enforcer', mid.status === 404, mid.status);
  }

  console.log('P1: the difficulty window runs to 0.95 (eglington2020)');
  {
    const w = params.windowOf();
    const dw = (x) => params.difficultyWeight(x);
    check('window: 1.0 from 0.50 to 0.95, no step', w.hi === 0.95 && w.step === null && dw(0.5) === 1 && dw(0.8) === 1 && dw(0.93) === 1 && dw(0.95) === 1, w);
    check('...0.6 under 0.50 and 0.3 over 0.95 (0.40 and 0.98 were worse)', dw(0.4) === 0.6 && dw(0.97) === 0.3);
    check('the research file says the same', /<= p_now <= 0\.95/.test(require('../curriculum-build/retention-enforcer-params.json').selection.step_2_score.difficulty_window));
    process.env.ENFORCER_DIFFICULTY_WINDOW_95 = 'off';
    check('ENFORCER_DIFFICULTY_WINDOW_95=off: back to 1.0 to 0.90 and 0.65 for 0.90-0.95', params.windowOf().hi === 0.9 && dw(0.93) === 0.65 && dw(0.95) === 0.65 && dw(0.9) === 1 && dw(0.97) === 0.3);
    delete process.env.ENFORCER_DIFFICULTY_WINDOW_95;
  }

  console.log('P5: topics left out of the last enforcers move up');
  {
    // Synthetic plans, oldest first: x left out three times in a row; y asked in the middle one.
    const uid = 900000 + users;
    db.insert('enforcers', { user_id: uid, status: 'done', left_out: ['x', 'y'], units: {} });
    db.insert('enforcers', { user_id: uid, status: 'done', left_out: ['x'], units: { y: {} } });
    const newest = db.insert('enforcers', { user_id: uid, status: 'done', left_out: ['x', 'z'], units: {} });
    const runs = enforcers.leftOutCounts(uid);
    check('times left out: the run of latest plans that had it eligible and did not ask it', runs.get('x') === 3 && runs.get('z') === 1 && !runs.has('y'), [...runs]);
    check('the plan being made is not counted', enforcers.leftOutCounts(uid, newest.id).get('x') === 2 && !enforcers.leftOutCounts(uid, newest.id).has('z'));
    // A real one: a short session with many topics, quick tier, so most are left out.
    const g = learner();
    const t0 = Date.now() - 5 * 3600 * 1000;
    studied(g, t0, 24, { objectives: withItems, every: 1 });
    const e1 = db.byId('enforcers', study.end(g.user.id, { now: t0 + 24 * MIN + 1000 }).enforcer_id);
    const ok1 = e1.status === 'choosing' && enforcers.options(e1).find((o) => o.tier === 'quick').available;
    if (ok1) enforcers.choose(g.user.id, e1, 'quick');
    const p1 = db.byId('enforcers', e1.id);
    const asked = new Set(Object.keys(p1.units || {}));
    check('a plan stores the eligible topics it did not ask', ok1 && Array.isArray(p1.left_out) && p1.left_out.length >= 1 && p1.left_out.every((k) => !asked.has(k)), { left_out: p1.left_out, asked: [...asked] });
    // The next session on the same topics: the left-out ones carry the flag (+0.10 x min(1, 1/2) = +0.05).
    const t1 = t0 + 60 * MIN;
    studied(g, t1, 24, { objectives: withItems, every: 1 });
    const e2 = db.byId('enforcers', study.end(g.user.id, { now: t1 + 24 * MIN + 1000 }).enforcer_id);
    const flagged = (e2.unit_plan || []).filter((u) => u.left_out > 0);
    check('the next enforcer flags them (left out once)', flagged.length >= 1 && flagged.every((u) => p1.left_out.includes(u.key) && u.left_out === 1), (e2.unit_plan || []).map((u) => [u.key, u.left_out]));
    const tz = 'UTC';
    const rows = enforcers.windowItems(g.user.id, { from_ms: t1, to_ms: t1 + 24 * MIN + 1000 }, tz);
    const at = Date.now();
    const costM = enforcers.costModel(g.user.id, false, at);
    const scoreOf = (off) => {
      if (off) process.env.ENFORCER_LEFT_OUT_FLAG = 'off';
      const { units, recFor } = enforcers.unitsFrom(g.user.id, rows);
      enforcers.score(g.user.id, units, recFor, { scope: 'session', now: at, base: false, model: costM, tz, exclude: e2.id });
      delete process.env.ENFORCER_LEFT_OUT_FLAG;
      return new Map(units.map((u) => [u.key, u.score]));
    };
    const withFlag = scoreOf(false);
    const without = scoreOf(true);
    const k = flagged.length ? flagged[0].key : null;
    check('...worth +0.05 on the score; ENFORCER_LEFT_OUT_FLAG=off drops it', k && Math.abs(withFlag.get(k) - without.get(k) - 0.05) < 1e-9, k && [withFlag.get(k), without.get(k)]);
  }

  console.log('P3: the end-of-sitting retention set is left to the session enforcer');
  {
    const h = learner();
    const [o1, o2] = withItems.reduce((acc, o) => (acc.length < 2 && !acc.some((x) => x.skill === o.skill) ? [...acc, o] : acc), []);
    const t0 = Date.now() - 40 * MIN;
    study.start(h.user.id, { now: t0 });
    const sitting = db.insert('sessions', { user_id: h.user.id, enrollment_id: h.enrollment.id, track_id: TRACK, grade_id: GRADE, level: 1, kind: 'lesson', blocks: [], started_at: new Date(t0).toISOString(), ended_at: null });
    const sit = { ...h, session: sitting };
    const its = [answer(sit, o1, t0 + 2 * MIN, false), answer(sit, o2, t0 + 3 * MIN, true), answer(sit, o1, t0 + 4 * MIN, true)];
    study.beat(h.user.id, { now: t0 + 20 * MIN });
    const plan = [{ skillId: o1.skill, level: 1 }, { skillId: o2.skill, level: 1 }];
    const now = t0 + 20 * MIN;
    process.env.ENFORCER_DEFER_SITTING_RETENTION = 'off';
    check('ENFORCER_DEFER_SITTING_RETENTION=off: the set is asked as before', enforcers.deferSittingRetention(h.user.id, sitting, plan, its, { now }) === false);
    delete process.env.ENFORCER_DEFER_SITTING_RETENTION;
    check('a study session running: the set is deferred', enforcers.deferSittingRetention(h.user.id, sitting, plan, its, { now }) === true);
    const ss = study.current(h.user.id, now);
    check('...and only its missed skills are kept on the study session', ss.retention_deferred.join() === `${TRACK}/${GRADE}/${o1.skill}`, ss.retention_deferred);
    check('...the sitting records where it went', db.byId('sessions', sitting.id).retention_deferred_to === ss.id);
    const ended = study.end(h.user.id, { now: now + 1000 });
    const enf = db.byId('enforcers', ended.enforcer_id);
    const objOf = (key) => model.objectives.find((o) => key.endsWith(`/o:${o.id}`));
    const def = (enf.unit_plan || []).filter((u) => u.deferred);
    check('the session enforcer flags the deferred skill\'s topics, and no others', def.length >= 1 && def.every((u) => objOf(u.key) && objOf(u.key).skill === o1.skill) && (enf.unit_plan || []).filter((u) => !u.deferred).every((u) => !objOf(u.key) || objOf(u.key).skill !== o1.skill), (enf.unit_plan || []).map((u) => [u.key, u.deferred]));
    const rows = enforcers.windowItems(h.user.id, enf.window.from_ms !== null ? { from_ms: enf.window.from_ms, to_ms: enf.window.to_ms } : {}, 'UTC');
    const at = Date.now();
    const costM = enforcers.costModel(h.user.id, false, at);
    const scored = (ids) => { const { units, recFor } = enforcers.unitsFrom(h.user.id, rows); enforcers.score(h.user.id, units, recFor, { scope: 'session', now: at, base: false, model: costM, tz: 'UTC', studyIds: ids }); return units; };
    const a = scored([ended.id]).find((u) => u.objective === o1.id);
    const b0 = scored([]).find((u) => u.objective === o1.id);
    check('...worth +0.20 when its last answer was right (missed earlier in the sitting)', a && b0 && Math.abs(a.score - b0.score - 0.2) < 1e-9, a && [a.score, b0.score]);
    // No study session open: the set is asked.
    const n = learner();
    const sitN = db.insert('sessions', { user_id: n.user.id, enrollment_id: n.enrollment.id, track_id: TRACK, grade_id: GRADE, level: 1, kind: 'lesson', blocks: [], started_at: new Date(t0).toISOString() });
    const itsN = [answer({ ...n, session: sitN }, o1, t0 + 2 * MIN, false)];
    check('no study session open: the set is asked', enforcers.deferSittingRetention(n.user.id, sitN, plan, itsN, { now }) === false);
    // The owner's base version: unchanged.
    const ow = learner(DEFAULT_OWNER);
    study.start(ow.user.id, { now: t0 });
    const sitO = db.insert('sessions', { user_id: ow.user.id, enrollment_id: ow.enrollment.id, track_id: TRACK, grade_id: GRADE, level: 1, kind: 'lesson', blocks: [], started_at: new Date(t0).toISOString() });
    const itsO = [answer({ ...ow, session: sitO }, o1, t0 + 2 * MIN, false)];
    study.beat(ow.user.id, { now: t0 + 3 * MIN });
    check('the owner\'s base version: the set is asked as before', enforcers.deferSittingRetention(ow.user.id, sitO, plan, itsO, { now: t0 + 3 * MIN }) === false);
    study.end(ow.user.id, { now: t0 + 4 * MIN });
  }

  console.log('tier cards: the count shown is the count served (bug fix, 2026-10-25)');
  {
    // The questions found come back as slow "problem" items (60 s), not the
    // multiple choice (20 s) a topic's usual format suggests: the card's old
    // estimate (fit) promised about three times what the budget then held
    // (the click-through: Medium "6 questions" served 3, Quick "3" served 2).
    const realPick = objItems.pick;
    objItems.pick = (args) => { const q = realPick(args); return q ? { ...q, format: 'problem' } : q; };
    const sessionsSvc = require('../services/sessions');
    for (const [label, who] of [['optimized', learner()], ['owner (base)', learner(DEFAULT_OWNER)]]) {
      for (let j = 0; j < 30; j++) answer(who, withItems[j % withItems.length], Date.now() - 30 * DAY - j * MIN, true, 15000);
      const t0 = Date.now() - 5 * 3600 * 1000;
      const ses = studied(who, t0, 60, { objectives: withItems.slice(0, 8), every: 2, wrongFrom: 10 });
      study.end(who.user.id, { now: t0 + 61 * MIN });
      const win = { from_ms: t0, to_ms: t0 + 61 * MIN };
      const sid = db.find('study_sessions', (x) => x.user_id === who.user.id).map((x) => x.id);
      let estimateHigher = false;
      const seen = [];
      for (const tier of params.TIERS) {
        const e = enforcers.create(who.user.id, { scope: 'session', win, studyIds: sid });
        const card = (await app.call('GET', `/api/retention/enforcers/${e.id}`, null, who.user.id)).body.enforcer.options.find((o) => o.tier === tier);
        if (enforcers.fit(db.byId('enforcers', e.id), tier).n > card.items) estimateHigher = true;
        if (!card.available) { seen.push(`${tier}: not offered`); continue; }
        const r = await app.call('POST', `/api/retention/enforcers/${e.id}/choose`, { tier }, who.user.id);
        const served = r.body.enforcer;
        seen.push(`${tier}: card ${card.items} / ${card.minutes} min, served ${served.items.length} / ${(db.byId('enforcers', e.id).planned_ms / MIN).toFixed(1)} min`);
        check(`${label}, ${tier}: the card's count is the number of questions served`, r.status === 200 && served.status === 'running' && served.items.length === card.items && served.planned === card.items, { card, served: served.items.length, status: r.status });
        check(`${label}, ${tier}: and its minutes are the plan's`, Math.abs(db.byId('enforcers', e.id).planned_ms / MIN - card.minutes) < 0.06, { card: card.minutes, planned: db.byId('enforcers', e.id).planned_ms / MIN });
        check(`${label}, ${tier}: the draft is dropped once served`, !db.byId('enforcers', e.id).drafts);
      }
      check(`${label}: this window is one where the old estimate promised more than fits`, estimateHigher, seen);
      if (ses.length < 1) check('fixture', false);
    }
    objItems.pick = realPick;

    // A 6-minute session with 1 answer on which no question can be found: the
    // card used to offer "1 question" on every tier, then fail with "No
    // questions could be found for this window."
    const tiny = learner();
    const realGen = sessionsSvc.generateWithPreference;
    objItems.pick = () => null;
    sessionsSvc.generateWithPreference = () => null;
    const t1 = Date.now() - 3 * 3600 * 1000;
    study.start(tiny.user.id, { now: t1 });
    for (let k = 1; k <= 12; k++) study.beat(tiny.user.id, { now: t1 + k * 30000 });
    answer(tiny, withItems[0], t1 + 5 * MIN, true, 9000, { prompt: null });
    study.beat(tiny.user.id, { now: t1 + 6 * MIN });
    const ended = study.end(tiny.user.id, { now: t1 + 6 * MIN + 1000 });
    const te = db.byId('enforcers', ended.enforcer_id);
    check('no question to be found: no tiers are offered, it closes as empty (no_questions)', te.status === 'empty' && te.reason === 'no_questions', { status: te.status, reason: te.reason });
    const tv = (await app.call('GET', `/api/retention/enforcers/${te.id}`, null, tiny.user.id)).body.enforcer;
    check('...and its page shows no tiers to pick', tv.status === 'empty' && tv.options.length === 0);
    check('...and nothing is left waiting before the next session', !(await app.call('GET', '/api/retention/state', null, tiny.user.id)).body.offer);
    // A waiting offer whose draft has gone stale and finds nothing when the card is shown again closes the same way.
    objItems.pick = realPick;
    sessionsSvc.generateWithPreference = realGen;
    const late = learner();
    const t2 = Date.now() - 4 * 3600 * 1000;
    studied(late, t2, 30, { objectives: withItems.slice(0, 4), every: 3 });
    const le = db.byId('enforcers', study.end(late.user.id, { now: t2 + 31 * MIN }).enforcer_id);
    check('a waiting offer has a draft', le.status === 'choosing' && le.drafts && le.drafts.tiers && le.drafts.tiers.quick.slots.length >= 1);
    db.update('enforcers', le.id, { drafts: { ...le.drafts, at: new Date(Date.now() - 7 * 3600 * 1000).toISOString() } });
    objItems.pick = () => null;
    sessionsSvc.generateWithPreference = () => null;
    for (const i of db.find('items', (x) => x.user_id === late.user.id)) db.update('items', i.id, { prompt: null });
    const lv = (await app.call('GET', `/api/retention/enforcers/${le.id}`, null, late.user.id)).body.enforcer;
    check('a stale draft is made again when the card is shown; with nothing to ask it closes as empty', lv.status === 'empty' && lv.reason === 'no_questions' && lv.options.length === 0, { status: lv.status, reason: lv.reason });
    objItems.pick = realPick;
    sessionsSvc.generateWithPreference = realGen;
  }

  console.log('the daily review, folded in');
  {
    const r = require('../services/review-session');
    check('folded while enforcers are on', r.folded() === true);
    process.env.ENFORCER_FOLD_REVIEW = 'off';
    check('ENFORCER_FOLD_REVIEW=off restores the old review', r.folded() === false);
    delete process.env.ENFORCER_FOLD_REVIEW;
  }

  console.log('switched off');
  {
    process.env.RETENTION_ENFORCERS = 'off';
    const r = await app.call('GET', '/api/retention/state', null, 1);
    check('RETENTION_ENFORCERS=off: the routes answer 404', r.status === 404);
    check('...and the review is not folded', require('../services/review-session').folded() === false);
    delete process.env.RETENTION_ENFORCERS;
  }

  app.close();
  db.flush();
  done();
})().catch((err) => { console.error(err); failures += 1; done(); });
