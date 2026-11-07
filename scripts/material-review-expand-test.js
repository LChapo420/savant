/**
 * Expanding review intervals (services/material-review-expand.js, UPLOAD_REVIEW_EXPAND, off by default).
 *
 *   node scripts/material-review-expand-test.js
 *
 * Throwaway db, no model. The rule, the switch off leaving today's numbers exactly, and the real scheduleReview and card rating with the switch on.
 */
const os = require('os');
const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(os.tmpdir(), `material-review-expand-test-${process.pid}.json`);
try { fs.unlinkSync(process.env.DB_FILE); } catch { /* none there */ }
delete process.env.UPLOAD_REVIEW_EXPAND;

const db = require('../config/db');
const E = require('../services/material-review-expand');
const MP = require('../services/material-path');
const ms = require('../services/material-study');
const cards = require('../services/material-cards');

let failures = 0;
function check(label, ok, detail) {
  if (ok) { console.log(`  ok   ${label}`); return; }
  failures++;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` - ${JSON.stringify(detail).slice(0, 300)}`}`);
}
const DAY = 86400000;
const T0 = Date.parse('2026-06-01T12:00:00Z');
const I = ms.internals;

// ── the rule, pure ──
check('off by default', E.on() === false);
check('the start is the curve: same half-life as forgetting.DEFAULT_CURVE', E.baseHalfLife(5, 0) === 2 ** 2.5 && E.baseHalfLife(40, 0) === E.baseHalfLife(15, 0));
{
  const st = { right: 5, wrong_n: 0 };
  const seq = [];
  let t = T0;
  for (let i = 0; i < 10; i++) { const o = E.afterRight(st, { now: t }); seq.push(o.days); t += o.days * DAY; }
  check('intervals keep growing past the 15-day stop', seq[seq.length - 1] > 15 && seq.every((d, i) => i === 0 || d >= seq[i - 1]), seq);
  check('and reach months after about ten reviews, no more', seq[9] > 60, seq);
}
check('a review sooner than half a day does not stretch the half-life', (() => { const st = { right: 5, wrong_n: 0 }; E.afterRight(st, { now: T0 }); const h = st.h_days; E.afterRight(st, { now: T0 + 3600000 }); return st.h_days === h; })());
check('a later review stretches more than an earlier one', E.grown(10, 10, 20) > E.grown(10, 10, 2));
check('a wobble and a lapse bring the half-life down, the lapse further', (() => { const a = { h_days: 40 }; const b = { h_days: 40 }; E.afterShaky(a, T0); E.afterLapse(b, T0); return b.h_days < a.h_days && a.h_days < 40; })());
check('a learner who misses gets a lower multiplier, one who holds gets a higher', E.updateM(0, { h_days: 20 }, 5, 0) < 0 && E.updateM(0, { h_days: 20 }, 5, 1) > 0);
check('the multiplier stays in bounds', E.updateM(3, { h_days: 20 }, 5, 1) === 3 && E.updateM(-3, { h_days: 20 }, 5, 0) === -3);

// ── the goal ──
check('forever has no end and no finish', (() => { const o = E.nextReview({ hEff: 20 }); return !o.done && o.days >= 1; })());
check('a horizon that holds is done', E.nextReview({ hEff: 500, endInDays: 7 }).done === true);
check('a horizon that does not hold gets a review inside it', (() => { const o = E.nextReview({ hEff: 5, endInDays: 30, floor: 0.85 }); return !o.done && o.days >= 1 && o.days < 30; })());
{
  const hEff = 40; const end = 10; const o = E.nextReview({ hEff, endInDays: end, floor: 0.9 });
  const R = E.predicted(hEff, o.days);
  const after = hEff * (E.PARAMS.GROWTH_0 + E.PARAMS.GROWTH_1 * (1 - R));
  check('the last look holds the floor on the last day, as the growth predicts', o.last === true && E.predicted(after, end - o.days) >= 0.9 - 1e-9, o);
}
check('a horizon of a month or less asks less than a longer one', E.floorFor(7) === E.PARAMS.FLOOR_SHORT && E.floorFor(30) === E.PARAMS.FLOOR_SHORT && E.floorFor(180) === E.PARAMS.FLOOR);
check('a horizon is not known until the course is finished', E.endInDays({ status: 'horizon', days: 7 }, null, T0) === null && E.endInDays({ status: 'horizon', days: 7 }, new Date(T0).toISOString(), T0) === 7);
{
  const eff = { status: 'date', test_date: '2027-06-01', set_on: '2026-06-01' };
  const st = { right: 5, wrong_n: 0, h_days: 100000 };
  const o = E.plan(st, { eff, now: T0 });
  const eve = (Date.parse('2027-06-01T00:00:00Z') - T0) / DAY - 1;
  check('a far test: a strong memory still looks on the eve', !o.done && Math.abs(o.days - eve) < 1e-6, o);
  const late = E.plan({ right: 5, wrong_n: 0 }, { eff, now: Date.parse('2027-05-31T12:00:00Z') });
  check('a far test: nothing after the eve', late.done === true, late);
  const nearEff = { status: 'date', test_date: '2026-06-08', set_on: '2026-06-01' };
  const near = E.plan({ right: 5, wrong_n: 0 }, { eff: nearEff, now: T0 });
  check('a near test keeps limitInterval', !near.done && near.days >= 1 && near.days <= 7, near);
  check('a stopped goal asks nothing', E.plan({ right: 5, wrong_n: 0 }, { eff: { status: 'stopped' }, now: T0 }).done === true);
}
{
  const live = { isDefault: false, review: { targetRecall: 0.85, spacingScale: 0.6 } };
  const plain = E.afterRight({ right: 13, wrong_n: 0 }, { now: T0 });
  const fast = E.afterRight({ right: 13, wrong_n: 0 }, { now: T0, spec: live });
  check('a learner\'s own spec tightens the interval, as intervalDays does', fast.days < plain.days, [plain, fast]);
}

// ── the real scheduleReview ──
const USER = 910001;
const mat = db.insert('materials', { user_id: USER, title: 'Test', text: 'Mitochondria release usable energy.', retention_goal: null, created_at: new Date(T0).toISOString() });
const row = () => ({ user_id: USER, material_id: mat.id, skills: {}, forget_m: 0, fresh: null });
{
  const r = row(); const st = { status: 'mastered', right: 13, wrong_n: 0 };
  const days = I.scheduleReview(r, st, T0);
  check('switch off: today\'s interval exactly', days === MP.intervalDays(13, 0, 0, I.specOf ? I.specOf(USER) : null) && !('h_days' in st), [days, st]);
}
process.env.UPLOAD_REVIEW_EXPAND = 'on';
{
  const r = row(); const st = { status: 'mastered', right: 5, wrong_n: 0 };
  let t = T0; const seq = [];
  for (let i = 0; i < 9; i++) { const d = I.scheduleReview(r, st, t); seq.push(d); t += d * DAY; st.right += 2; }
  check('switch on, forever: the real path passes 15 days', seq[8] > 15 && Number.isFinite(st.h_days), seq);
  check('and writes a due date from it', Date.parse(st.due) === t - seq[8] * DAY + seq[8] * DAY);
}
{
  db.update('materials', mat.id, { retention_goal: { horizon: 'months', set_on: '2026-06-01' } });
  const row0 = db.byId('materials', mat.id).retention_goal;
  const horizonGoal = require('../services/retention-goal').forMaterial(USER, mat.id, T0); // eslint-disable-line global-require
  if (horizonGoal.status === 'horizon') {
    const r = row(); const st = { status: 'mastered', right: 15, wrong_n: 0, h_days: 2000, h_at: new Date(T0).toISOString() };
    I.scheduleReview(r, st, T0);
    check('a horizon, course not finished: reviews run (the safe side)', !!st.due && !st.goal_done, st);
    r.finished_on = new Date(T0).toISOString();
    I.scheduleReview(r, st, T0);
    check('a horizon, finished, memory holds: no more reviews', st.due === null && st.goal_done === true, st);
  } else {
    check('the months horizon reads as a horizon', false, [row0, horizonGoal]);
  }
  db.update('materials', mat.id, { retention_goal: null });
}
{
  const course = { skills: [{ id: 'a' }, { id: 'b' }] };
  const r = row();
  const stA = { status: 'mastered', right: 5, wrong_n: 0, h_days: 8, h_at: new Date(T0).toISOString(), due: new Date(T0 + 400 * DAY).toISOString() };
  r.skills = { a: stA, b: { status: 'learning', right: 1, wrong_n: 1 } };
  I.noteFinished(course, r, T0 + DAY);
  check('not every skill mastered: not finished', !r.finished_on);
  r.skills.b = { status: 'mastered', right: 5, wrong_n: 0, h_days: 8, h_at: new Date(T0 + DAY).toISOString() };
  const hA = stA.h_days;
  I.noteFinished(course, r, T0 + DAY);
  check('every skill mastered: the finish is noted once', r.finished_on === new Date(T0 + DAY).toISOString());
  check('re-timing counts no new retrieval', stA.h_days === hA);
  check('and pulls a stale due date back to the curve', Date.parse(stA.due) < T0 + 400 * DAY, stA.due);
}

// ── a real card ──
{
  const added = cards.add(USER, mat.id, { front: 'What is the powerhouse?', back: 'The mitochondrion.' }, T0);
  const id = added && added.card;
  if (id && typeof cards.review === 'function') {
    let t = T0; let last = 0; let ok = true;
    for (let i = 0; i < 12; i++) { const o = cards.review(USER, mat.id, id, 'good', t); if (o.error) { ok = false; break; } last = o.next_in_days; t += o.next_in_days * DAY; }
    check('a card rated good twelve times passes the 15-day stop', ok && last > 15, last);
    const miss = cards.review(USER, mat.id, id, 'again', t);
    check('"again" comes back in minutes', miss.next_in_days === 0);
  } else {
    check('card helpers found', false, Object.keys(cards));
  }
}
delete process.env.UPLOAD_REVIEW_EXPAND;

try { fs.unlinkSync(process.env.DB_FILE); } catch { /* gone */ }
console.log(failures ? `${failures} FAILED` : 'all passed');
process.exit(failures ? 1 : 0);
