/**
 * Tests for adaptive enforcer timing (services/enforcer-adaptive.js, enforcer-adaptive-app.js, enforcer-adaptive-sim.js,
 * the adaptive paths of services/enforcers.js). ENFORCER_ADAPTIVE is off by default: off must be today's fixed calendar.
 *
 *   node scripts/enforcer-adaptive-test.js
 *
 * The simulation checks are on a small fixed seed, labelled SIMULATED (docs/ENFORCER-ADAPTIVE.md has the full held-out run).
 */
const os = require('os');
const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'test';
for (const k of Object.keys(process.env)) if (/_API_KEY$|_KEY$|ANTHROPIC|OPENROUTER|NVIDIA|GEMINI|MIMO|MODELFLARE|XKIRO/.test(k) && k !== 'NODE_ENV') process.env[k] = '';
const tmp = path.join(os.tmpdir(), `${path.basename(__filename, '.js')}-${process.pid}.json`);
try { fs.unlinkSync(tmp); } catch { /* none there */ }
process.env.DB_FILE = tmp;
for (const k of ['ENFORCER_ADAPTIVE', 'RETENTION_ENFORCERS', 'ENFORCER_FOLD_REVIEW', 'RETENTION_PARAMS', 'RETENTION_PARAMS_FILE', 'OWNER_EMAIL', 'OWNER_BASE', 'ADAPT_OWNER', 'ADMIN_EMAILS']) delete process.env[k];

const db = require('../config/db');
const coverage = require('../services/coverage');
const study = require('../services/study-sessions');
const enforcers = require('../services/enforcers');
const schedule = require('../services/retention-schedule');
const objItems = require('../services/objective-items');
const core = require('../services/enforcer-adaptive');
const sim = require('../services/enforcer-adaptive-sim');

let failures = 0;
let checks = 0;
function check(label, ok, detail) {
  checks += 1;
  if (ok) { console.log(`  ok   ${label}`); return; }
  failures += 1;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 500)}`}`);
}

const unit = (p0, decay = 0.1) => ({ value: 1, recallIn: (x) => Math.max(0, p0 - decay * x) });
const many = (n, p0, decay) => Array.from({ length: n }, () => unit(p0, decay));

console.log('the switch');
check('default off', core.on() === false);
process.env.ENFORCER_ADAPTIVE = 'on';
check('=on turns it on', core.on() === true);
process.env.ENFORCER_ADAPTIVE = 'off';
check('=off is off', core.on() === false);
delete process.env.ENFORCER_ADAPTIVE;

console.log('the rule');
{
  const fresh = many(10, 0.97, 0.01);
  check('nothing at risk: not due, however long', !core.decide({ day: 30, last: 0, units: fresh, look: 1, kept: core.ORDER }).due);
  const risky = many(10, 0.82, 0.05); // at risk at the next study day (look 1: 0.77 < 0.8)
  check('a lot at risk and the minimum gap passed: due', core.decide({ day: 5, last: 3, units: risky, look: 1, kept: core.ORDER }).due);
  check('minimum gap: not the day after the last one', !core.decide({ day: 4, last: 3, units: [...many(4, 0.82, 0.05), ...many(6, 0.99, 0.001)], look: 1, kept: core.ORDER }).due);
  check('... unless the risk is high', core.decide({ day: 4, last: 3, units: many(10, 0.5, 0.05), look: 1, kept: core.ORDER }).due);
  const one = [unit(0.82, 0.05), ...many(30, 0.99, 0.001)]; // one at risk of 31: under the share and the count
  check('a little at risk: waits', !core.decide({ day: 5, last: 3, units: one, look: 1, kept: core.ORDER }).due);
  const wait = core.decide({ day: 3 + 4, last: 3, units: one, look: 1, kept: core.ORDER });
  check('maximum gap: with anything at risk, due at the fixed calendar\'s longest gap (4 days)', wait.due && wait.reason === 'max_gap', wait);
  check('... and not earlier than that', !core.decide({ day: 3 + 3, last: 3, units: one, look: 1, kept: core.ORDER }).due);
  const weeklyOnly = core.decide({ day: 3 + 4, last: 3, units: one, look: 1, kept: ['weekly', 'biweekly', 'monthly'] });
  check('a goal that keeps only weekly and wider allows 7 days', !weeklyOnly.due && core.decide({ day: 3 + 7, last: 3, units: one, look: 1, kept: ['weekly', 'biweekly', 'monthly'] }).due);
  check('a goal that keeps nothing: never due', !core.decide({ day: 9, last: 3, units: many(10, 0.3, 0.05), look: 1, kept: [] }).due);
  const q = core.decide({ day: 5, last: 3, units: [...many(5, 0.82, 0.05), ...many(25, 0.99, 0.001)], look: 1, kept: core.ORDER });
  const m = core.decide({ day: 5, last: 3, units: [...many(9, 0.82, 0.05), ...many(21, 0.99, 0.001)], look: 1, kept: core.ORDER });
  const f = core.decide({ day: 5, last: 3, units: many(10, 0.6, 0.05), look: 1, kept: core.ORDER });
  check('sized to the need: quick, medium, full', q.tier === 'quick' && m.tier === 'medium' && f.tier === 'full', [q.tier, m.tier, f.tier]);
  check('type sizes the window since the last one', core.typeFor(3) === 'semiweekly' && core.typeFor(6) === 'weekly' && core.typeFor(12) === 'biweekly' && core.typeFor(30) === 'monthly');
  check('study rhythm: look-ahead is the usual gap, 1..7', core.lookahead([0, 2, 4, 6, 8], 8) === 2 && core.lookahead([0, 1, 2, 3], 3) === 1 && core.lookahead([0, 30], 30) === 7);
  const fc = core.forecast({ day: 10, last: 8, units: many(20, 0.9, 0.04), look: 1, kept: core.ORDER }, 3);
  check('forecast: a few about-dates, ahead of today, in order', fc.length >= 1 && fc.every((x, i) => x.about && x.offset >= 1 && (i === 0 || x.offset > fc[i - 1].offset)), fc);
  check('forecast: consecutive days only when risk is high', fc.every((x, i) => i === 0 || x.offset - fc[i - 1].offset >= 2));
}

console.log('the simulation (SIMULATED, fixed seed 20261108, 6 random learners)');
{
  const a = sim.compare({ seed: 20261108, nRandom: 6 });
  const b = sim.compare({ seed: 20261108, nRandom: 6 });
  check('deterministic for a seed', JSON.stringify(a.rows.map((r) => [r.fixed.medium.recall, r.adaptive.recall, r.adaptive.enforcer_min])) === JSON.stringify(b.rows.map((r) => [r.fixed.medium.recall, r.adaptive.recall, r.adaptive.enforcer_min])));
  check('covers the extreme and random learners and every goal', a.learners === 5 + 8 + 6 && new Set(a.rows.map((r) => r.goal)).size === sim.GOALS.length);
  const s = sim.summarise(a.rows, 'medium');
  check('fewer enforcers than the fixed calendar', s.adaptive.enforcers < s.fixed.enforcers, [s.adaptive.enforcers, s.fixed.enforcers]);
  check('less enforcer time than the fixed calendar (medium)', s.adaptive.enforcer_min < s.fixed.enforcer_min, [s.adaptive.enforcer_min, s.fixed.enforcer_min]);
  check('mean recall at the goal date equal or better (within 0.005)', s.adaptive.recall >= s.fixed.recall - 0.005, [s.adaptive.recall, s.fixed.recall]);
  check('recall equal or better for 90% of scenarios', s.share_equal_or_better_recall >= 0.9, s.share_equal_or_better_recall);
  const week = sim.summarise(a.rows.filter((r) => r.goal === 'week'), 'medium');
  check('a one-week goal keeps no scheduled enforcers on either side', week.fixed.enforcers === 0 && week.adaptive.enforcers === 0);
  const ds = a.rows.filter((r) => r.goal !== 'week' && r.goal !== 'test-date').flatMap((r) => r.adaptive.decisions.slice(1).map((d, i) => d - r.adaptive.decisions[i]));
  check('no adaptive enforcers on consecutive days except at high risk (under 5%)', ds.filter((g) => g < 2).length / ds.length < 0.05, ds.filter((g) => g < 2).length / ds.length);
  const fcs = sim.forecastScore(a.rows.map((r) => r.adaptive));
  check('forecast made 3 or more days ahead names the day within a day, mostly (>=85%)', fcs.n > 100 && fcs.within_1_day >= 0.85, fcs);
}

console.log('the calendar in the app');
(async () => {
  const MIN = 60000;
  const DAY = 24 * 3600 * 1000;
  const TRACK = 'math';
  const GRADE = 'counting_and_comparing';
  const model = coverage.modelFor(TRACK, GRADE);
  const withItems = model.objectives.filter((o) => objItems.forObjective(TRACK, GRADE, o.id).length >= 3);
  const user = db.insert('users', { email: 'adaptive@example.test', name: 'a', password_hash: 'x', streak: 0, xp: 0, onboarded: true, retention_tz: 'UTC' });
  const enrollment = db.insert('enrollments', { user_id: user.id, track_id: TRACK, grade_id: GRADE, target_level: 300, current_level: 200, level_items: 0, levels_completed: 0, xp: 0, status: 'active', placed_at: new Date().toISOString() });
  const session = db.insert('sessions', { user_id: user.id, enrollment_id: enrollment.id, track_id: TRACK, grade_id: GRADE, level: 1, kind: 'lesson', blocks: [], started_at: new Date(Date.now() - 90 * DAY).toISOString() });
  let n = 0;
  const answer = (o, t, correct) => db.insert('items', {
    user_id: user.id, session_id: session.id, skill_id: o.skill, difficulty: 3, format: 'multiple_choice', role: 'check', level: o.lesson_level,
    prompt: `q ${o.id} ${t} ${n++}`, answer: 'a', choices: ['a', 'b', 'c', 'd'], rationale: 'because', block: 0, index: 0,
    user_answer: correct ? 'a' : 'b', correct, ms: 15000, coach_used: false, answered_at: new Date(t).toISOString(), updated_at: new Date(t).toISOString(),
  });
  // Day 0: a first study session with answers on every objective (some wrong); then five quiet days.
  const t0 = Date.UTC(2026, 5, 1, 10, 0, 0);
  study.start(user.id, { now: t0 });
  for (let k = 0; k < 240; k++) { study.beat(user.id, { now: t0 + (k + 1) * 30000 }); if ((k + 1) % 2 === 0) answer(withItems[(k / 2 | 0) % withItems.length], t0 + (k + 1) * 30000, k % 3 !== 0); }
  study.end(user.id, { now: t0 + 121 * MIN });
  const now = t0 + 5 * DAY + 8 * 3600 * 1000; // day 5, evening (UTC)
  const offOn = (v) => { if (v) process.env.ENFORCER_ADAPTIVE = v; else delete process.env.ENFORCER_ADAPTIVE; };

  offOn(null);
  const calOff = enforcers.calendar(user.id, { month: '2026-06', now });
  const fixedDays = calOff.days.filter((d) => d.scheduled).map((d) => d.day);
  const want = schedule.occurrences(1, 40).map((o) => o.day);
  check('off: the calendar is the fixed one (days 3, 7, 10, ...), not adaptive', calOff.adaptive === false && fixedDays.length > 3 && fixedDays.every((d) => want.includes(d)) && fixedDays.includes(3) && fixedDays.includes(7), fixedDays);
  check('off: no adaptive covers anywhere', !db.all('enforcers').some((e) => (e.covers || []).some((c) => c.adaptive)));

  offOn('on');
  // Day 3 evening, at End day session: nothing decided yet, the studied material is at risk: today's enforcer is adaptive.
  const now3 = t0 + 3 * DAY + 8 * 3600 * 1000;
  const st3 = enforcers.scheduledToday(user.id, now3);
  check('on: day 3, end of day: scheduledToday finds an adaptive enforcer', !!(st3 && !st3.done && !st3.enforcer_id), st3);
  const offer = enforcers.scheduledOffer(user.id, now3, { includeToday: true });
  const cov = offer && (offer.covers || []).find((c) => c.adaptive);
  check('on: its offer is one adaptive enforcer with a window and a size', !!(cov && cov.day === 3 && cov.from_date === '2026-06-01' && cov.to_date === '2026-06-04' && ['quick', 'medium', 'full'].includes(cov.tier)), offer && offer.covers);
  check('on: the offer starts at that size', !!offer && enforcers.defaultTier(offer) === cov.tier || offer.status === 'empty', [offer && offer.status, cov && cov.tier]);
  const st3b = enforcers.scheduledToday(user.id, now3);
  check('on: asked again the same day it is the same one (no second decision)', !!(st3b && st3b.enforcer_id === offer.id), st3b);
  // Day 5: the calendar shows day 3 as an adaptive day and the days ahead as about-dates.
  const calOn = enforcers.calendar(user.id, { month: '2026-06', now });
  const evs = calOn.days.filter((d) => d.scheduled);
  check('on: the calendar says it is adaptive and shows day 3', calOn.adaptive === true && evs.some((d) => d.day === 3 && !d.scheduled.about && d.scheduled.enforcer_id === offer.id), evs.map((d) => [d.day, d.scheduled.about]));
  check('on: it is not the fixed calendar (day 7, 10, 14 are not all there)', !(evs.some((d) => d.day === 7) && evs.some((d) => d.day === 10) && evs.some((d) => d.day === 14)) || evs.some((d) => d.scheduled.about));
  check('on: only days after today are "about"', evs.every((d) => (d.scheduled.about === true) === (d.day > 5)), evs.map((d) => [d.day, d.scheduled.about]));
  check('on: upcoming lists about-dates, later than today', calOn.upcoming.every((u) => u.about && u.date > calOn.today));
  check('on: reachStart is the day after the last decided day', enforcers.reachStart(user.id, now) === '2026-06-05', enforcers.reachStart(user.id, now));
  offOn(null);
  const fixedAgain = enforcers.calendar(user.id, { month: '2026-06', now });
  check('off again: back to the fixed calendar', fixedAgain.adaptive === false && fixedAgain.days.filter((d) => d.scheduled).map((d) => d.day).includes(7));

  try { fs.unlinkSync(tmp); } catch { /* gone */ }
  console.log(failures ? `\n${failures} of ${checks} check(s) FAILED` : `\nall ${checks} checks passed`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log(e.stack); process.exit(1); });
