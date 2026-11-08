/**
 * The score-month layer on the live data (docs/SCORE-MONTH.md). SCORECARD_MONTH=1 turns it on (default OFF; with it off nothing here changes any lesson, card or route).
 *
 * One row per learner in the `scorecard_month` collection: { user_id, confirm (confirm-card state), bandit (decision-bandit state), direct ({ speed_task, span_task, calibration, reading, precheck }),
 * updated_at }. This module only reads and writes that row, and builds the modification plan from it plus the answer log and the tutor calendar. It does NOT add routes, screens or task UIs:
 * those are the next step (the profile card, the in-flow task widgets); the pure pieces they call are direct-tasks.js, confirm-card.js and decision-bandit.js.
 *
 * Under-13 accounts without the parent's measurement agreement, and anyone boosters.allowed() refuses, get no card, no tasks and no bandit (`mayMeasure` false); the plan then comes from
 * the logged stats alone, which need no new channel. The owner's base account (config/owner.js) gets nothing.
 */
'use strict';
const COLLECTION = 'scorecard_month';
const on = () => process.env.SCORECARD_MONTH === '1';

const lazy = (p) => require(p); // eslint-disable-line global-require

function mayMeasure(user) {
  try { return !!lazy('../boosters').allowed(user); } catch { return false; }
}

function load(userId) {
  const db = lazy('../../config/db'); const r = db.forUser(COLLECTION, userId)[0];
  const C = lazy('./confirm-card'); const B = lazy('./decision-bandit');
  return r || { user_id: userId, confirm: C.newState(), bandit: B.newState(), direct: { speed_task: [], span_task: [], calibration: [], reading: [], precheck: {} } };
}
function save(row) {
  const db = lazy('../../config/db'); const next = { ...row, updated_at: new Date().toISOString() };
  return db.upsert(COLLECTION, (r) => r.user_id === row.user_id, () => next);
}

/** Everything the plan needs for a learner, from stored state and the logs. Never throws: a missing piece just leaves its knob at the default. */
function statsFor(userId, { today = new Date().toISOString().slice(0, 10), user = null } = {}) {
  const D = lazy('./direct-tasks'); const L = lazy('./learner-stats'); const C = lazy('./confirm-card'); const B = lazy('./decision-bandit'); const out = {};
  const row = load(userId); const band = D.ageBand(user && user.age);
  try {
    const answers = L.fromDb(userId, lazy('../../config/db'));
    out.timeOfDay = L.timeOfDay(answers); out.dropoff = L.sessionDropoff(answers); out.errors = L.errorTypes(answers); out.device = L.deviceStats(answers);
    const rs = D.readingSpeed(row.direct.reading, band); if (rs) out.readingWpm = rs.wpm;
    let events = []; try { events = lazy('../tutor-events').list(userId, { from: today }); } catch { /* no calendar */ }
    const studyDays = [...new Set(answers.map((a) => new Date(a.t).toISOString().slice(0, 10)))];
    out.schedule = L.schedule({ events, today, studyDays, answers });
    out.horizonDays = L.horizon({ personal: row.confirm.personal, sched: out.schedule }).days;
  } catch { /* logs unavailable */ }
  if (!user || mayMeasure(user)) {
    const sp = D.combine(row.direct.span_task, 'span_task', { band }); if (sp.k) out.spanPoints = sp.est;
    const sd = D.combine(row.direct.speed_task, 'speed_task', { band }); if (sd.k) out.speedPoints = sd.est;
    const cr = D.calibrationReading(row.direct.calibration); if (cr) out.calibration = { bias: cr.bias };
    const dr = D.decayReading(row.direct.reviews || []); if (dr) out.decayM = dr.m;
    out.confirmed = {}; for (const id of C.CONFIRMABLE) { const r = C.confirmedReading(row.confirm, id, { band }); if (r) out.confirmed[id] = r.est; }
    out.bandit = B.best(row.bandit);
  }
  return out;
}

/** The plan and its prompt lines for a learner; null when the switch is off. */
function planFor(userId, opts = {}) {
  if (!on()) return null;
  const decisions = lazy('./decisions'); const plan = decisions.modificationPlan(statsFor(userId, opts));
  return { plan, lines: decisions.planLines(plan) };
}

module.exports = { COLLECTION, on, mayMeasure, load, save, statsFor, planFor };
