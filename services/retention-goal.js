/**
 * Retention goals: how long the learner wants to remember a subject or an uploaded
 * course, and what that changes (owner, 2026-11-02; docs/RETENTION-GOALS.md has the
 * research and the SIMULATED numbers).
 *
 * The choices: a test on a date, a few months (90 days), a year, years (3 years), or
 * forever. A goal sits on each enrollment (`enrollments.retention_goal`) and each
 * uploaded course (`materials.retention_goal`); none set means forever, which is
 * today's behaviour exactly. ACT with a test date on its profile (services/act-scores.js)
 * and no goal of its own reads as a test on that date.
 *
 * What a goal changes
 *   forever      the owner's enforcer calendar (services/retention-schedule.js), untouched:
 *                semi-weekly, weekly, bi-weekly and monthly all stay.
 *   horizon      (months, year, years) an enforcer type is kept while its spacing is at most
 *                GAP_MAX (35%) of the horizon; wider ones are dropped, and the learner is told which.
 *                The best gap shrinks as the horizon grows: about 20-40% of a 1-week delay, about
 *                5-10% of a 1-year delay (Cepeda et al. 2008; Rohrer and Pashler 2007), so 35% is a
 *                ceiling the simulation allows, not the evidence-best share (docs/RETENTION-GOALS.md).
 *                Reviews of an uploaded course stop once the next one would land past the horizon.
 *   date         the calendar rungs are replaced by a plan compressed to the date (datePlan):
 *                a review about every GAP_SHARE (15%) of the time left, a cumulative final
 *                review the day before and a short one on the day. Nothing is scheduled past
 *                the date; when it passes, the learner is asked whether to keep the subject
 *                (until they answer it carries on as forever, so nothing is lost silently).
 *   re-teach     a forgotten objective is re-taught at a fraction of the usual time when the
 *                test is close (reteachScale). Level gates and pass marks are not changed.
 *
 * Pure except the storage helpers at the bottom (which load the database on first use).
 */
const schedule = require('./retention-schedule');

const HORIZONS = {
  date: { label: 'A test on a date', short: 'Test date', days: null },
  months: { label: 'A few months', short: 'Months', days: 90 },
  year: { label: 'A year', short: 'A year', days: 365 },
  years: { label: 'Years', short: 'Years', days: 1095 },
  forever: { label: 'Forever', short: 'Forever', days: null },
};
const CHOICES = Object.keys(HORIZONS);
const DEFAULT_HORIZON = 'forever';
/** Subjects whose default (forever) is shown to the learner as a default they can change. */
const DEFAULT_SHOWN = ['math', 'english', 'iq', 'spanish'];
/** The longest a test date may be set ahead, in days. */
const MAX_AHEAD = 1095;
/** Average days between two enforcers of each type on the owner's calendar. */
const SPACING = { semiweekly: 3.5, weekly: 7, biweekly: 14, monthly: 30 };
/** A type is kept while its spacing is at most this share of the horizon (set from the simulation, docs/RETENTION-GOALS.md). */
const GAP_MAX = 0.35;
/** The gap between a test-date goal's reviews, as a share of the time left (Cepeda 2008: 10-20% from a week to a year). */
const GAP_SHARE = 0.15;
/** A course's review is never spaced wider than this share of the time left to a test (the optimum is 10-20%; this is the generous end). */
const INTERVAL_CAP = 0.25;
const DAY = 24 * 3600 * 1000;

const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && schedule.addDays(s, 0) === s;

/**
 * Check a learner's choice: { horizon, test_date?, keep_after? } to a stored goal, or { error }.
 * `today` is the learner's local date.
 */
function normalize(input, today) {
  const b = input || {};
  const horizon = String(b.horizon || '');
  if (!CHOICES.includes(horizon)) return { error: 'Choose a test date, a few months, a year, years or forever.' };
  const goal = { horizon, set_on: today };
  if (horizon === 'date') {
    if (!isDate(b.test_date)) return { error: 'The test date must be a real date, like 2027-02-06.' };
    const ahead = schedule.dayIndex(today, b.test_date);
    if (ahead < 0) return { error: 'The test date has already passed.' };
    if (ahead > MAX_AHEAD) return { error: 'That test date is too far ahead.' };
    goal.test_date = b.test_date;
    goal.keep_after = null;
  }
  return { goal };
}

/** The choice after a test: a horizon to keep, or 'stop'. */
function normalizeAfter(choice) {
  const c = String(choice || '');
  if (c === 'stop' || (CHOICES.includes(c) && c !== 'date')) return { keep_after: c };
  return { error: 'Choose to keep it (forever, years, a year, a few months) or to stop.' };
}

/**
 * What a stored goal means today: { horizon, status, days, ... }.
 * status: forever | horizon | date | after_test (date passed, not yet answered; reviews carry on as forever) | stopped.
 * opts.testDate: an outside test date used when there is no goal (ACT's profile).
 */
function effective(goal, today, opts = {}) {
  let g = goal && CHOICES.includes(goal.horizon) ? goal : null;
  let derived = false;
  if (!g && opts.testDate && isDate(opts.testDate)) { g = { horizon: 'date', test_date: opts.testDate, set_on: opts.setOn || today, keep_after: null }; derived = true; }
  if (!g) return { horizon: DEFAULT_HORIZON, status: 'forever', days: null, is_default: true, derived: false };
  if (g.horizon === 'date') {
    const left = schedule.dayIndex(today, g.test_date);
    if (left >= 0) return { horizon: 'date', status: 'date', test_date: g.test_date, days_left: left, set_on: g.set_on || today, days: left, is_default: false, derived };
    const k = g.keep_after;
    if (k === 'stop') return { horizon: 'date', status: 'stopped', test_date: g.test_date, is_default: false, derived };
    if (k && CHOICES.includes(k) && k !== 'date') return { ...effective({ horizon: k, set_on: g.test_date }, today), after_test: true, test_date: g.test_date };
    return { horizon: 'forever', status: 'after_test', ask: true, test_date: g.test_date, days: null, is_default: false, derived };
  }
  const h = HORIZONS[g.horizon];
  return { horizon: g.horizon, status: g.horizon === 'forever' ? 'forever' : 'horizon', days: h.days, set_on: g.set_on || today, is_default: false, derived: false };
}

/** The scheduled enforcer types a goal keeps on the owner's calendar (a date goal keeps none: its own plan replaces them). */
function keptTypes(eff) {
  if (!eff || eff.status === 'forever' || eff.status === 'after_test') return schedule.TYPES.slice();
  if (eff.status === 'horizon') return schedule.TYPES.filter((t) => SPACING[t] <= GAP_MAX * eff.days);
  return [];
}

/** The calendar types a goal drops, widest last. */
function droppedTypes(eff) { const k = new Set(keptTypes(eff)); return schedule.TYPES.filter((t) => !k.has(t)); }

/** Is every type of the owner's calendar kept? (the fast path: nothing to filter) */
function isCalendarIntact(eff) { return keptTypes(eff).length === schedule.TYPES.length; }

/** Which budget size a review over `len` days of work uses (the scope of services/retention-params.js). */
function sizeFor(len) { return len <= 4 ? 'semiweekly' : len <= 7 ? 'weekly' : len <= 14 ? 'biweekly' : 'monthly'; }

/**
 * A test-date goal's reviews, as anchor day numbers. tSet: the day the goal was set; tD: the test day.
 *   review   about every GAP_SHARE of the time left (never under 2 days), each over the work since the last one;
 *   final    the day before: everything done in the subject, weakest first (the enforcer ranks by predicted forgetting);
 *   dayof    the test day: a short look at what is most at risk.
 * Returns [{ day, kind, from, to, type }] in day order; `type` sizes the budget.
 */
function datePlan(tSet, tD) {
  if (!Number.isInteger(tSet) || !Number.isInteger(tD) || tD < 0) return [];
  const set = Math.max(0, tSet);
  const n = tD - set;
  if (n < 0) return [];
  const gap = Math.max(2, Math.round(GAP_SHARE * n));
  const out = [];
  let prev = Math.max(0, set - gap);
  const stop = tD - 1 - Math.max(1, Math.floor(gap / 2));
  for (let d = set + gap; d <= stop; d += gap) {
    out.push({ day: d, kind: 'review', from: prev, to: d, type: sizeFor(d - prev + 1) });
    prev = d + 1;
  }
  if (tD - 1 >= Math.max(1, set)) out.push({ day: tD - 1, kind: 'final', from: 0, to: tD - 1, type: 'monthly' });
  if (tD >= 1) out.push({ day: tD, kind: 'dayof', from: 0, to: tD, type: 'semiweekly' });
  return backwardOn() ? out.filter((p) => p.kind !== 'review') : out;
}

// ── goal-aware review (round 3; docs/FASTER-BY-GOAL.md, SIMULATED) ──────────
// Two opt-in switches, both OFF by default (off = today's behaviour exactly):
//   SR_GOAL_REVIEW (default on)  a horizon is counted from when the learner FINISHES the course (enrollments.finished_on, written when the last level is passed), not from
//                        when the goal was set or from each skill, so all of the course is still there H days after finishing. Until the course is finished the
//                        end is unknown and reviews run. In the last two days of a horizon of FINAL_MAX_DAYS or less every skill under 0.95 predicted recall is
//                        asked (a final look). A skill whose predicted recall at the end stays at or above GOAL_MEMORY is deferred.
//   SR_GOAL_BACKWARD=on  a dated test gets no recall-triggered review until BACKWARD_DAYS before the date, then every skill under 0.95 predicted recall is asked;
//                        the plan's mid reviews are dropped (its final and day-of reviews stay).
const GOAL_MEMORY = 0.8;
const FINAL_MAX_DAYS = 60;
const FINAL_RECALL = 0.95;
const BACKWARD_DAYS = 10;
const goalReviewOn = () => String(process.env.SR_GOAL_REVIEW || 'on').toLowerCase() === 'on'; // on by default since 5 Nov 2026: passed on a fresh held-out seed; =off restores the old rule
const backwardOn = () => String(process.env.SR_GOAL_BACKWARD || 'off').toLowerCase() === 'on';

/**
 * Where a goal puts the learner in time: { daysToEnd, final, hold, done }. daysToEnd is Infinity when no end applies yet (forever, a horizon before the
 * course is finished); final: the last two days of a short horizon or a dated test; hold: a dated test still more than BACKWARD_DAYS away (no
 * recall-triggered review); done: past the end. With both switches off it returns { daysToEnd: Infinity } and callers behave as today.
 */
function reviewWindow(eff, finishedOn, nowMs = Date.now()) {
  const none = { daysToEnd: Infinity, final: false, hold: false, done: false };
  if (!eff) return none;
  if (eff.status === 'horizon' && goalReviewOn()) {
    const fin = finishedOn ? Date.parse(finishedOn) : NaN;
    if (!Number.isFinite(fin)) return none;
    const d = (fin + eff.days * DAY - nowMs) / DAY;
    return { daysToEnd: d, final: eff.days <= FINAL_MAX_DAYS && d <= 2, hold: false, done: d < 0 };
  }
  if (eff.status === 'date' && (goalReviewOn() || backwardOn())) {
    const d = (startOf(eff.test_date) - nowMs) / DAY;
    return { daysToEnd: d, final: d <= 2, hold: backwardOn() && d > BACKWARD_DAYS, done: d < 0 };
  }
  return none;
}

/** The recall under which a skill is asked, given the window: the final look asks everything under FINAL_RECALL; a dated test inside the backward window too. */
function reviewTargetFor(base, win, eff) {
  if (!win) return base;
  if (win.final) return Math.max(base, FINAL_RECALL);
  if (eff && eff.status === 'date' && backwardOn() && !win.hold) return Math.max(base, FINAL_RECALL);
  return base;
}

/** Defer a review while predicted recall on the end day stays at least `floor` (predictAt(days): recall after that many more days with no review). */
function reviewNeeded(daysToEnd, predictAt, floor = GOAL_MEMORY) {
  if (!Number.isFinite(daysToEnd) || daysToEnd <= 0) return true;
  return predictAt(daysToEnd) < floor;
}

/** What the scheduler needs from an enrollment: its effective goal and when it was finished; null with both switches off (nothing changes). */
function reviewContext(userId, enrollment, now = Date.now()) {
  if (!goalReviewOn() && !backwardOn() && !require('./speed-levers').enabled('target')) return null; // eslint-disable-line global-require
  return { eff: forEnrollment(userId, enrollment, now), finishedOn: (enrollment && enrollment.finished_on) || null };
}

/** SPEED_REVIEW_TARGET: days to the goal's last day, or null when none is known yet: a horizon counts from finishing, a dated test from its date; forever has none. */
function daysToGoalEnd(eff, finishedOn, nowMs = Date.now()) {
  if (!eff) return null;
  if (eff.status === 'horizon') { const fin = finishedOn ? Date.parse(finishedOn) : NaN; return Number.isFinite(fin) ? (fin + eff.days * DAY - nowMs) / DAY : null; }
  if (eff.status === 'date') return (startOf(eff.test_date) - nowMs) / DAY;
  return null;
}

/** How much of the usual re-teaching time a forgotten objective gets: shorter when the test is close. */
function reteachScale(eff) {
  if (!eff || eff.status !== 'date') return 1;
  if (eff.days_left <= 3) return 0.4;
  if (eff.days_left <= 7) return 0.5;
  if (eff.days_left <= 30) return 0.75;
  return 1;
}

/** Should the daily review of this subject still run? Not after a test the learner chose to stop after. */
function reviewsWanted(eff) { return !eff || eff.status !== 'stopped'; }

const startOf = (date) => Date.parse(`${date}T00:00:00Z`);

/**
 * Limit the next review of an uploaded course's skill or card to what the goal needs.
 * `days` is the interval the course's own forgetting curve chose. Returns { days, done }:
 * done true means no further review is wanted (days is then null).
 */
function limitInterval(eff, days, nowMs = Date.now(), finishedOn = null) {
  if (!eff || eff.status === 'forever' || eff.status === 'after_test') return { days, done: false };
  if (eff.status === 'stopped') return { days: null, done: true };
  if (eff.status === 'horizon') {
    let end = startOf(eff.set_on) + eff.days * DAY;
    if (goalReviewOn()) { // counted from finishing; unknown (reviews carry on) until then
      const fin = finishedOn ? Date.parse(finishedOn) : NaN;
      if (!Number.isFinite(fin)) return { days, done: false };
      end = fin + eff.days * DAY;
    }
    if (nowMs + days * DAY > end) return { days: null, done: true };
    return { days, done: false };
  }
  // A test date: reviews no wider than INTERVAL_CAP of the time left, the final one the day before, a short one on the day, nothing after.
  const test = startOf(eff.test_date);
  const finalAt = test - DAY;
  const dayOf = test;
  const left = (test - nowMs) / DAY;
  if (nowMs >= dayOf) return { days: null, done: true };
  if (nowMs >= finalAt) return { days: Math.max(0.01, (dayOf - nowMs) / DAY), done: false, kind: 'dayof' };
  const wanted = Math.max(1, Math.min(days, INTERVAL_CAP * left));
  if (nowMs + wanted * DAY >= finalAt) return { days: Math.max(0.01, (finalAt - nowMs) / DAY), done: false, kind: 'final' };
  return { days: wanted, done: false };
}

/** What the learner is told: one plain sentence and the calendar types dropped, with why. */
function describe(eff, { trackName = null } = {}) {
  const what = trackName ? `${trackName}: ` : '';
  const names = { semiweekly: 'semi-weekly', weekly: 'weekly', biweekly: 'bi-weekly', monthly: 'monthly' };
  const dropped = droppedTypes(eff);
  if (eff.status === 'forever') return { text: `${what}${eff.is_default ? 'Forever (the default). ' : ''}The full long-term schedule: semi-weekly, weekly, bi-weekly and monthly reviews.`, dropped: [] };
  if (eff.status === 'after_test') return { text: `${what}Your test on ${eff.test_date} has passed. Keep this subject? Until you choose, the full long-term schedule carries on.`, dropped: [] };
  if (eff.status === 'stopped') return { text: `${what}Reviews stopped after your test on ${eff.test_date}. You can switch them back on any time.`, dropped: schedule.TYPES.slice() };
  if (eff.status === 'date') {
    const left = eff.days_left;
    const when = left === 0 ? 'today' : left === 1 ? 'tomorrow' : `in ${left} days`;
    const gap = Math.max(2, Math.round(GAP_SHARE * left));
    return { text: `${what}Test ${eff.test_date} (${when}). Reviews are compressed to the date${left > 4 ? `, about every ${gap} days` : ''}, with a final review the day before and a short one on the day. Nothing is scheduled after it, and you will be asked whether to keep the subject.`, dropped: schedule.TYPES.slice() };
  }
  const list = dropped.map((t) => names[t]);
  const head = `${what}${HORIZONS[eff.horizon].label}.`;
  if (!dropped.length) return { text: `${head} Your goal is long enough that every review on the long-term schedule still helps, so none is dropped.`, dropped: [] };
  return { text: `${head} The ${list.join(' and ')} review${list.length > 1 ? 's are' : ' is'} dropped: ${list.length > 1 ? 'they are' : 'it is'} spaced wider than this goal needs.`, dropped };
}

// ── enforcer support ──────────────────────────────────────────────────────

/**
 * The extra covers a learner's test-date goals add to the enforcer calendar, as enforcer covers:
 * [{ type, day, date, from_date, to_date, goal: true, kind, enrollment_id }]. `goals` is
 * [{ enrollment_id, eff, tSet, tD }] (anchor day numbers). Only days up to `upTo` (a final or
 * day-of review on the day itself is offered that morning).
 */
function goalCovers(goals, anchor, upTo) {
  const out = [];
  for (const g of goals) {
    if (g.eff.status !== 'date') continue;
    for (const p of datePlan(g.tSet, g.tD)) {
      if (p.day > upTo) continue;
      out.push({ type: p.type, day: p.day, date: schedule.addDays(anchor, p.day), from_date: schedule.addDays(anchor, p.from), to_date: schedule.addDays(anchor, p.to), goal: true, kind: p.kind, enrollment_id: g.enrollment_id });
    }
  }
  return out;
}

/**
 * Does a cover speak for a row of work? `row` is { enrollment_id, date, goalOf } with the row's own
 * effective goal. Calendar covers follow the owner's types the goal keeps; a goal's own covers
 * follow its enrollment and window.
 */
function coverKeeps(cover, row) {
  if (cover.goal) return cover.enrollment_id === row.enrollment_id && row.date >= cover.from_date && row.date <= cover.to_date;
  return keptTypes(row.eff).includes(cover.type);
}

// ── storage ───────────────────────────────────────────────────────────────

const lazy = (name) => require(name); // eslint-disable-line global-require, import/no-dynamic-require
const TABLES = { enrollment: 'enrollments', material: 'materials' };

function todayFor(userId, now = Date.now()) {
  const study = lazy('./study-sessions');
  return schedule.localDate(now, study.zoneFor(userId));
}

/** The stored goal of an enrollment or an uploaded course the learner owns (null when none). */
function rowOf(userId, kind, id) {
  const db = lazy('../config/db');
  const table = TABLES[kind];
  if (!table) return null;
  const row = db.byId(table, Number(id));
  return row && row.user_id === userId ? row : null;
}

function actDate(userId, trackId) {
  if (trackId !== 'act') return null;
  try { return lazy('./act-scores').getProfile(userId).test_date || null; } catch { return null; }
}

/** The effective goal of an enrollment row. */
function forEnrollment(userId, enrollment, now = Date.now()) {
  const today = todayFor(userId, now);
  return effective(enrollment && enrollment.retention_goal, today, { testDate: actDate(userId, enrollment && enrollment.track_id), setOn: today });
}

/** The effective goal of an uploaded course. */
function forMaterial(userId, materialId, now = Date.now()) {
  const db = lazy('../config/db');
  const row = db.byId('materials', Number(materialId));
  const goal = row && row.user_id === userId ? row.retention_goal : null;
  return effective(goal, todayFor(userId, now));
}

/** Save a goal ({horizon, test_date}) or the after-test choice ({keep_after}) on an enrollment or a course. */
function save(userId, kind, id, body, now = Date.now()) {
  const row = rowOf(userId, kind, id);
  if (!row) return { error: 'Not found.', status: 404 };
  const db = lazy('../config/db');
  const today = todayFor(userId, now);
  let goal;
  if (body && body.keep_after !== undefined && !body.horizon) {
    const cur = row.retention_goal;
    if (!cur || cur.horizon !== 'date') return { error: 'There is no test date to answer for.', status: 400 };
    const a = normalizeAfter(body.keep_after);
    if (a.error) return { error: a.error, status: 400 };
    goal = { ...cur, keep_after: a.keep_after };
  } else {
    const n = normalize(body, today);
    if (n.error) return { error: n.error, status: 400 };
    goal = n.goal;
  }
  db.update(TABLES[kind], row.id, { retention_goal: goal });
  // A goal chosen is a footprint of planning (services/scorecard/footprints.js); a choice after a test is not. Never throws.
  if (body && body.horizon) { try { lazy('./scorecard/footprints').onRetentionGoal(userId, goal); } catch { /* never in the way of saving */ } }
  return { goal, row: db.byId(TABLES[kind], row.id) };
}

/** Every enrollment's and course's goal for one learner, ready for the page. */
function listFor(userId, now = Date.now()) {
  const db = lazy('../config/db');
  const curriculum = lazy('../config/curriculum');
  const today = todayFor(userId, now);
  const view = (eff, base) => {
    const d = describe(eff, {});
    return { ...base, goal: eff, summary: d.text, dropped: d.dropped, ask_after_test: eff.status === 'after_test' };
  };
  const enrollments = db.find('enrollments', (e) => e.user_id === userId).map((e) => {
    const track = curriculum.getTrack(e.track_id);
    const grade = curriculum.getGrade(e.track_id, e.grade_id);
    const eff = effective(e.retention_goal, today, { testDate: actDate(userId, e.track_id), setOn: today });
    return view(eff, { kind: 'enrollment', id: e.id, track_id: e.track_id, grade_id: e.grade_id, title: `${track ? track.name : e.track_id}${grade ? `: ${grade.name}` : ''}`, default_shown: DEFAULT_SHOWN.includes(e.track_id), stored: e.retention_goal || null });
  });
  const materials = db.find('materials', (m) => m.user_id === userId).map((m) => view(effective(m.retention_goal, today), { kind: 'material', id: m.id, title: m.title || `Material ${m.id}`, default_shown: true, stored: m.retention_goal || null }));
  return { today, choices: CHOICES.map((id) => ({ id, label: HORIZONS[id].label })), max_ahead: MAX_AHEAD, enrollments, materials };
}

/**
 * The nearest test date among a learner's subjects and courses, for the daily plan: { title, test_date, days_left, kind, id } or null.
 */
function headline(userId, now = Date.now()) {
  const all = listFor(userId, now);
  const dated = [...all.enrollments, ...all.materials].filter((x) => x.goal.status === 'date').sort((a, b) => a.goal.days_left - b.goal.days_left);
  const x = dated[0];
  return x ? { title: x.title, test_date: x.goal.test_date, days_left: x.goal.days_left, kind: x.kind, id: x.id } : null;
}

/**
 * The test-date and horizon goals of a learner's enrollments, with anchor day numbers, for the enforcers:
 * { byEnrollment: Map(id -> eff), byTrackGrade: Map('track/grade' -> {id, eff}), goals: [{enrollment_id, eff, tSet, tD}] }.
 * `intact` is true when every enrollment keeps the owner's whole calendar (the fast path).
 */
function enforcerView(userId, anchor, now = Date.now()) {
  const db = lazy('../config/db');
  const today = todayFor(userId, now);
  const byTrackGrade = new Map();
  const goals = [];
  let intact = true;
  for (const e of db.find('enrollments', (x) => x.user_id === userId)) {
    const eff = effective(e.retention_goal, today, { testDate: actDate(userId, e.track_id), setOn: today });
    byTrackGrade.set(`${e.track_id}/${e.grade_id}`, { enrollment_id: e.id, eff });
    if (!isCalendarIntact(eff)) intact = false;
    if (eff.status === 'date') goals.push({ enrollment_id: e.id, eff, tSet: schedule.dayIndex(anchor, eff.set_on), tD: schedule.dayIndex(anchor, eff.test_date) });
  }
  return { intact, byTrackGrade, goals, today };
}

module.exports = {
  HORIZONS, CHOICES, DEFAULT_HORIZON, DEFAULT_SHOWN, SPACING, GAP_MAX, GAP_SHARE, MAX_AHEAD,
  normalize, normalizeAfter, effective, keptTypes, droppedTypes, isCalendarIntact, sizeFor, datePlan, reteachScale, reviewsWanted,
  limitInterval, describe, goalCovers, coverKeeps,
  GOAL_MEMORY, FINAL_MAX_DAYS, BACKWARD_DAYS, goalReviewOn, backwardOn, daysToGoalEnd, reviewWindow, reviewTargetFor, reviewNeeded, reviewContext,
  todayFor, forEnrollment, forMaterial, save, listFor, headline, enforcerView,
};
