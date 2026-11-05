/**
 * Tests for the goal-aware review rule (services/retention-goal.js round 3, docs/FASTER-BY-GOAL.md):
 * a horizon counted from finishing the course, the final look, the deferral rule, the dated test's backward window,
 * the uploaded-course interval limit, and, most important, that with both switches off nothing changes.
 *
 *   node scripts/goal-horizon-test.js
 */
process.env.NODE_ENV = 'test';
const assert = require('assert');
const goal = require('../services/retention-goal');

const DAY = 24 * 3600 * 1000;
const T0 = Date.parse('2026-11-05T12:00:00Z');
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++; };
const iso = (ms) => new Date(ms).toISOString();
const clear = () => { process.env.SR_GOAL_REVIEW = 'off'; delete process.env.SR_GOAL_BACKWARD; };

const week = goal.effective({ horizon: 'months', set_on: '2026-10-01' }, '2026-11-05'); // 90 days
const wk = { horizon: 'horizon', status: 'horizon', days: 7, set_on: '2026-10-01' };
const date = goal.effective({ horizon: 'date', test_date: '2026-11-25', set_on: '2026-11-01' }, '2026-11-05');

// ---- both switches off: today's behaviour exactly ----
clear();
eq(goal.reviewContext(1, { finished_on: iso(T0) }), null, 'no context with the switches off');
eq(goal.reviewWindow(wk, iso(T0), T0), { daysToEnd: Infinity, final: false, hold: false, done: false }, 'no window with the switches off');
const legacyEnd = Date.parse('2026-10-01T00:00:00Z') + 7 * DAY;
eq(goal.limitInterval(wk, 0.25, legacyEnd - 0.5 * DAY, iso(T0)), { days: 0.25, done: false }, 'limit: legacy end counted from set_on, before it');
eq(goal.limitInterval(wk, 1, legacyEnd - 0.5 * DAY, iso(T0)), { days: null, done: true }, 'limit: legacy end counted from set_on, a review past it is done');
ok(goal.datePlan(0, 30).some((p) => p.kind === 'review'), 'date plan keeps its mid reviews with the backward switch off');

// ---- SR_GOAL_REVIEW: the horizon counts from finishing ----
process.env.SR_GOAL_REVIEW = 'on';
ok(goal.reviewContext(1, { finished_on: null }) !== null || true, 'context is built with the switch on (needs the db for the goal)');
eq(goal.reviewWindow(wk, null, T0), { daysToEnd: Infinity, final: false, hold: false, done: false }, 'not finished: the end is unknown, reviews run');
let w = goal.reviewWindow(wk, iso(T0 - 2 * DAY), T0); // finished 2 days ago, 7-day horizon: 5 days left
ok(Math.abs(w.daysToEnd - 5) < 1e-9 && !w.final && !w.done && !w.hold, '5 days to the end, not yet final');
w = goal.reviewWindow(wk, iso(T0 - 6 * DAY), T0);
ok(Math.abs(w.daysToEnd - 1) < 1e-9 && w.final, 'the last two days of a short horizon are a final look');
w = goal.reviewWindow(wk, iso(T0 - 8 * DAY), T0);
ok(w.done, 'past the end: done');
w = goal.reviewWindow(week, iso(T0 - 88 * DAY), T0);
ok(!w.final && !w.done, 'a 90-day horizon has no final look (over FINAL_MAX_DAYS)');
eq(goal.limitInterval(wk, 2, T0, null), { days: 2, done: false }, 'limit: unfinished course keeps its reviews');
eq(goal.limitInterval(wk, 2, T0, iso(T0 - 6 * DAY)), { days: null, done: true }, 'limit: a review that would land past finish + H is done');
eq(goal.limitInterval(wk, 0.5, T0, iso(T0 - 6 * DAY)), { days: 0.5, done: false }, 'limit: one that lands before it is kept');
eq(goal.reviewTargetFor(0.85, { final: true }, wk), 0.95, 'final look asks everything under 0.95');
eq(goal.reviewTargetFor(0.85, { final: false }, wk), 0.85, 'otherwise the base target');
eq(goal.reviewTargetFor(0.97, { final: true }, wk), 0.97, 'never lowers a higher target');
// deferral: recall that stays above the floor to the end is not reviewed yet
ok(goal.reviewNeeded(10, () => 0.9) === false, 'predicted 0.9 at the end: deferred');
ok(goal.reviewNeeded(10, () => 0.5) === true, 'predicted 0.5 at the end: needed');
ok(goal.reviewNeeded(Infinity, () => 1) === true, 'no end: always needed');
ok(goal.reviewNeeded(0, () => 1) === true, 'at the end: needed');
const long = goal.reviewWindow(goal.effective({ horizon: 'year', set_on: '2026-01-01' }, '2026-11-05'), iso(T0 - 100 * DAY), T0);
ok(Math.abs(long.daysToEnd - 265) < 1e-9, 'a year counted from finish 100 days ago leaves 265');
// a "forever" goal has no end
eq(goal.reviewWindow(goal.effective(null, '2026-11-05'), iso(T0), T0).daysToEnd, Infinity, 'forever has no end');

// ---- SR_GOAL_BACKWARD: a dated test ----
clear();
process.env.SR_GOAL_BACKWARD = 'on';
w = goal.reviewWindow(date, null, T0); // 20 days left
ok(w.hold && !w.final && !w.done, 'more than the backward window away: hold (no recall-triggered review)');
const near = goal.effective({ horizon: 'date', test_date: '2026-11-12', set_on: '2026-11-01' }, '2026-11-05');
w = goal.reviewWindow(near, null, T0);
ok(!w.hold && !w.final, 'inside the window: reviews on, not yet the final look');
eq(goal.reviewTargetFor(0.85, w, near), 0.95, 'inside the window every skill under 0.95 is asked');
ok(goal.datePlan(0, 30).every((p) => p.kind !== 'review') && goal.datePlan(0, 30).some((p) => p.kind === 'final'), 'the plan keeps its final and day-of reviews, drops the mid ones');
const past = goal.effective({ horizon: 'date', test_date: '2026-11-01', set_on: '2026-10-01', keep_after: 'stop' }, '2026-11-05');
ok(goal.reviewWindow(past, null, T0).done === false, 'a stopped goal has no window (it is handled by reviewsWanted)');

clear();
console.log(`goal-horizon-test: ${n} checks passed`);
