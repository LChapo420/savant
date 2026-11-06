/**
 * The daily check: a few minutes a day of the measurement that the scorecard cannot get from lessons, in the normal flow (owner, 2026-10-31,
 * docs/PRODUCT-DECISIONS.md "Scorecard accuracy": quick, worthwhile ones are built into the normal flow and are always skippable).
 *
 * Why: in the held-out SIMULATION (docs/EXTREME-LEARNERS.md, docs/SCORECARD-90.md 6, 12) the app as it was removed 3% of the error for the worst 10%
 * of learners at day 30, and the designed plan about half. Most of that difference is measurement a learner never took on the side page /boosters.
 *
 * What a day holds (never more than the day's allowance; skipped at one tap; never in a lesson, never awaited by one):
 *   1. the memory check, when one is due (boosters.delayed: 30 s)
 *   2. a few of the sixteen IPIP items a day until all are answered (content/ipip-items.js), unless the questionnaire was done at sign-up
 *   3. the onboarding planner's own pick (services/onboarding/plan.js): at each step the item that removes the most uncertainty per second,
 *      with each measure weighted by how uncertain the scorecard still is about THIS learner (the less behaviour has told it, the more it counts).
 *      The pool is the onboarding one: span, speed and switching tasks, reasoning items, forced-choice taps (self-report pairs, style items).
 * Allowance: 10 minutes for the first 14 days of use, then 3 (docs/SCORECARD-90.md section 6: 6.3 minutes a day over the first month). The planner
 * stops sooner when an item is worth less than `minGainPerMin`, so a learner the card already knows costs less.
 *
 * Evidence goes only through the existing path (scorecard/hooks.js onDailyCheck / onQuestionnaire / onDelayedCheck -> scorecard.observe), as designed-test
 * observations, and only the precision a day ADDED is fed (services/onboarding/baseline.js), so a repeat never double counts.
 * Who: boosters.allowed(user) gates everything (an under-13 account without the parent's `measurement_extras` gets nothing). SCORECARD_DAILY=off turns
 * the whole thing off and the app behaves exactly as before. What is kept is in the learner's profiles row (`boosters.daily`, `onboarding.known`),
 * which account deletion and a parent's download already cover.
 *
 * ASSUMED: the item validities in services/onboarding/pool.js and model.js (a repeat of a task is treated as independent evidence); simulated only.
 */
'use strict';

const crypto = require('crypto');
const learner = require('./learner');
const boosters = require('./boosters');
const scorecard = require('./scorecard');
const baseline = require('./onboarding/baseline');
const tasks = require('./onboarding/tasks');
const { Planner } = require('./onboarding/plan');
const { byId, passivePool: PASSIVE_POOL } = require('./onboarding/pool');
const ipip = require('../content/ipip-items');
const hooks = () => require('./scorecard/hooks'); // eslint-disable-line global-require

const DAY = 86400000;
const FIRST_DAYS = Number(process.env.DAILY_FIRST_DAYS || 14);
const FIRST_SEC = Number(process.env.DAILY_FIRST_SEC || 600);
const LATER_SEC = Number(process.env.DAILY_LATER_SEC || 180);
const IPIP_PER_DAY = 4;
const IPIP_SEC = 10;
const KINDS = new Set(['forced', 'reason', 'span', 'speed', 'switch', 'scale']);   // short, repeatable-or-single, no reading passages or mini-lessons
const REPEAT = new Set(['span', 'speed', 'switch', 'passive']);                      // generated fresh in the browser each time, so they can come back
const MIN_GAIN_PER_MIN = 0.05;

const enabled = () => process.env.SCORECARD_DAILY !== 'off';
const dayOf = (t) => new Date(t).toISOString().slice(0, 10);

// ── what is kept ─────────────────────────────────────────────────────────────
const blank = () => ({ first_at: null, days: {}, ipip: [], active: null });
const getDaily = (userId) => ({ ...blank(), ...(boosters.get(userId).daily || {}) });
const putDaily = (userId, patch) => boosters.put(userId, { daily: { ...getDaily(userId), ...patch } });
function getKnown(userId) {
  const o = (learner.getProfile(userId) || {}).onboarding || {};
  return o.known || { state: require('./onboarding/model').emptyState(), used: [], fed: {} }; // eslint-disable-line global-require
}
function putKnown(userId, known) {
  const o = (learner.getProfile(userId) || {}).onboarding || {};
  learner.saveProfile(userId, { onboarding: { ...o, known } });
}

/** Seconds allowed on a day of use (0-based) and what is left today. */
const allowanceFor = (dayIndex) => (dayIndex < FIRST_DAYS ? FIRST_SEC : LATER_SEC);
function today(userId, now) {
  const d = getDaily(userId);
  const first = d.first_at ? Date.parse(d.first_at) : now;
  const dayIndex = Math.max(0, Math.floor((Date.parse(dayOf(now)) - Date.parse(dayOf(first))) / DAY));
  const rec = d.days[dayOf(now)] || { sec: 0, items: 0, skipped: false };
  return { d, dayIndex, rec, left: Math.max(0, allowanceFor(dayIndex) - rec.sec) };
}

/** How unsure the card still is about each measure: the weight a new reading on it is worth (less measured so far = more). */
function importanceOf(userId) {
  try {
    const card = scorecard.get(userId);
    const out = {};
    for (const [id, r] of Object.entries(card.stats || {})) out[id] = 1 / Math.sqrt(1 + ((r && r.mw) || 0));
    return out;
  } catch { return null; }
}

// ── the offer: cheap, no planning, so a page can show it at once ─────────────
function offer(user, now = Date.now()) {
  if (!enabled() || !boosters.allowed(user)) return { offer: false };
  const t = today(user.id, now);
  if (t.rec.skipped || t.left < 30) return { offer: false };
  return { offer: true, minutes: Math.max(1, Math.round(t.left / 60)), day: t.dayIndex + 1 };
}

function skip(user, now = Date.now()) {
  if (!enabled() || !boosters.allowed(user)) return { error: 'Not available for this account.', code: 'not_allowed' };
  const t = today(user.id, now);
  putDaily(user.id, { first_at: t.d.first_at || new Date(now).toISOString(), days: trim({ ...t.d.days, [dayOf(now)]: { ...t.rec, skipped: true } }), active: null });
  return { ok: true };
}
const trim = (days) => Object.fromEntries(Object.entries(days).sort().slice(-60));

// ── a run ────────────────────────────────────────────────────────────────────
/** Open a run for this learner (shared by the routes and the simulation). Returns { planner, pre, budget } or null when there is nothing to do. */
function openRun(userId, now = Date.now(), { importance = importanceOf(userId) } = {}) {
  const t = today(userId, now);
  if (t.left < 30) return null;
  const known = getKnown(userId);
  const used = known.used.filter((id) => !(byId[id] && REPEAT.has(byId[id].kind)));
  const planner = new Planner('quick', { state: known.state, used, importance });
  planner.mode = { ...planner.mode, id: 'daily', budgetSec: t.left, minGainPerMin: MIN_GAIN_PER_MIN, margin: 1.1, required: [] };
  planner.queue = [];
  planner.elapsed = 0;
  const pre = [];
  try { if (boosters.delayed.due(userId, now).due) pre.push({ kind: 'delayed', sec: 30 }); } catch { /* none */ }
  const left = ipip.ITEMS.filter((i) => !t.d.ipip.includes(i.id));
  if (left.length && !boosters.get(userId).questionnaire) pre.push({ kind: 'ipip', sec: IPIP_SEC * Math.min(IPIP_PER_DAY, left.length), ids: left.slice(0, IPIP_PER_DAY).map((i) => i.id) });
  planner.available = (it) => KINDS.has(it.kind) && !!tasks.present(it, 1);
  return { planner, pre, day: t.dayIndex };
}

/** Finish a run: feed the precision the planner added (only that) and write the day's record. */
function closeRun(userId, planner, now = Date.now(), { extraSec = 0, items = 0 } = {}) {
  const known = getKnown(userId);
  const est = planner.estimates();
  const obs = baseline.observations(est, known.fed);
  let fed = null;
  if (obs.length) { try { fed = hooks().onDailyCheck(userId, obs); } catch (err) { console.warn(`daily check: not applied: ${err.message}`); return { error: 'It could not be saved.', code: 'failed' }; } }
  putKnown(userId, { state: planner.state, used: [...new Set([...known.used, ...planner.used])], fed: baseline.fedAfter(est, known.fed) });
  const t = today(userId, now);
  const sec = Math.round(planner.elapsed + extraSec);
  putDaily(userId, { first_at: t.d.first_at || new Date(now).toISOString(), days: trim({ ...t.d.days, [dayOf(now)]: { ...t.rec, sec: t.rec.sec + sec, items: t.rec.items + items + planner.log.length, skipped: false } }), active: null });
  return { done: true, summary: { minutes: Math.round(sec / 6) / 10, measures_fed: obs.length, card_updated: !!fed } };
}

// ── the server flow (routes/daily-check.js) ──────────────────────────────────
function present(planner, item, active) {
  const seed = crypto.randomInt(1, 2 ** 31);
  const { _server, ...view } = tasks.present(item, seed);
  active.current = { id: item.id, seed, server: _server, at: Date.now(), kind: item.kind };
  return { step: view, progress: progressOf(planner, active) };
}
const progressOf = (planner, active) => ({ minutes_left: Math.max(0, Math.round(((planner.mode.budgetSec - planner.elapsed - (active.pre || []).reduce((a, p) => a + p.sec, 0)) / 60) * 2) / 2), budget_minutes: Math.max(1, Math.round(planner.mode.budgetSec / 60)), elapsed_minutes: Math.round((planner.elapsed / 60) * 10) / 10 });

function nextStep(user, active, planner) {
  const pre = (active.pre || [])[0];
  if (pre) {
    if (pre.kind === 'delayed') {
      const v = boosters.delayed.start(user);
      if (v.error) { active.pre.shift(); return nextStep(user, active, planner); }
      active.current = { id: 'delayed', kind: 'delayed', at: Date.now(), check_id: v.check_id, sec: pre.sec };
      return { step: { id: 'delayed', kind: 'delayed', check_id: v.check_id, questions: v.questions }, progress: progressOf(planner, active) };
    }
    active.current = { id: 'ipip', kind: 'ipip', at: Date.now(), ids: pre.ids, sec: pre.sec };
    return { step: { id: 'ipip', kind: 'ipip', scale: ipip.SCALE, items: ipip.ITEMS.filter((i) => pre.ids.includes(i.id)).map((i) => ({ id: i.id, text: i.text })) }, progress: progressOf(planner, active) };
  }
  for (let guard = 0; guard < 50; guard++) {
    const item = planner.next();
    if (!item) return null;
    if (!planner.available(item)) { planner.used.add(item.id); continue; }
    return present(planner, item, active);
  }
  return null;
}
const save = (userId, active, planner) => { active.planner = { ...planner.toJSON(), mode: 'quick' }; active.budget = planner.mode.budgetSec; active.importance = planner.importance; putDaily(userId, { active }); };
/** The planner of an open run, as it was saved (its mode is the daily one; the stored copy says 'quick' only so Planner.from accepts it). */
function restore(active) {
  const planner = Planner.from(active.planner, { importance: active.importance || null });
  planner.mode = { ...planner.mode, id: 'daily', budgetSec: active.budget, minGainPerMin: MIN_GAIN_PER_MIN, margin: 1.1, required: [] };
  planner.available = (it) => KINDS.has(it.kind) && !!tasks.present(it, 1);
  return planner;
}

function start(user, now = Date.now()) {
  if (!enabled()) return { error: 'Not available.', code: 'not_allowed' };
  if (!boosters.allowed(user)) return { error: 'Not available for this account.', code: 'not_allowed' };
  const run = openRun(user.id, now);
  if (!run) return { error: 'Nothing to check today.', code: 'nothing_due' };
  const active = { id: crypto.randomBytes(6).toString('hex'), at: new Date(now).toISOString(), pre: run.pre, extra: 0, items: 0, current: null };
  const step = nextStep(user, active, run.planner);
  if (!step) return closeRun(user.id, run.planner, now, { extraSec: 0 });
  save(user.id, active, run.planner);
  return { session: active.id, ...step };
}

function answer(user, body, now = Date.now()) {
  if (!enabled() || !boosters.allowed(user)) return { error: 'Not available for this account.', code: 'not_allowed' };
  const d = getDaily(user.id);
  const active = d.active;
  if (!active || !body || body.session !== active.id || !active.current || active.current.id !== body.id) return { error: 'That step is not open.', code: 'stale' };
  const planner = restore(active);
  const cur = active.current;
  const response = body.response && typeof body.response === 'object' ? body.response : {};
  if (cur.kind === 'delayed' || cur.kind === 'ipip') {
    active.pre.shift();
    active.extra += cur.sec;
    planner.elapsed += cur.sec;
    if (!body.skip && cur.kind === 'delayed') boosters.delayed.answer(user, cur.check_id, response.answers || {});
    if (!body.skip && cur.kind === 'ipip') {
      const answers = {};
      for (const id of cur.ids) { const v = Number(response.answers && response.answers[id]); if (v >= 1 && v <= 5) answers[id] = v; }
      if (Object.keys(answers).length) {
        try { hooks().onQuestionnaire(user.id, answers, ipip.ITEMS.filter((i) => answers[i.id] !== undefined)); } catch (err) { console.warn(`daily check: items not applied: ${err.message}`); }
        const dd = getDaily(user.id);
        putDaily(user.id, { ipip: [...new Set([...dd.ipip, ...Object.keys(answers)])] });
      }
    } else if (cur.kind === 'ipip') putDaily(user.id, { ipip: [...new Set([...getDaily(user.id).ipip, ...cur.ids])] }); // skipped: not asked again
    active.items += 1;
  } else {
    const item = byId[cur.id];
    const seconds = Math.min(Math.max(Number(body.ms) / 1000 || item.sec, 0.5), item.sec * 4);
    if (body.skip) { planner.used.add(item.id); planner.elapsed += seconds; planner.actual += seconds; planner.nominal += item.sec; } else planner.record(item, tasks.score(item, response, cur.server), seconds);
    if (item.kind === 'reason') for (const f of planner.unlockedFree()) planner.record(f, tasks.calibration(f, { [item.id]: { confidence: Math.max(0.2, Math.min(1, (Number(response.confidence) || 3) / 5)), correct: Number(response.choice) === cur.server.key } }), 0);
  }
  if (planner.elapsed >= planner.mode.budgetSec) return closeRun(user.id, planner, now, { extraSec: 0, items: active.items });
  const step = nextStep(user, active, planner);
  if (!step) return closeRun(user.id, planner, now, { extraSec: 0, items: active.items });
  save(user.id, active, planner);
  return { session: active.id, ...step };
}

function stop(user, now = Date.now()) {
  if (!enabled() || !boosters.allowed(user)) return { error: 'Not available for this account.', code: 'not_allowed' };
  const active = getDaily(user.id).active;
  if (!active) return { error: 'No check is open.', code: 'stale' };
  const out = closeRun(user.id, restore(active), now, { items: active.items });
  skip(user, now); // they chose to stop: no second offer today
  return out;
}

/** The simulation's way of recording that these questionnaire items were asked (the real flow does it in answer()). */
const markIpip = (userId, ids) => putDaily(userId, { ipip: [...new Set([...getDaily(userId).ipip, ...ids])] });

/**
 * The passive (zero-minute) items of one day: a PROBE and a CROSS item per measure they read (docs/SCORECARD-95.md). Off unless DAILY_PASSIVE=1, so every baseline reproduces.
 * The caller that has the day's reading (a lesson hook comparing the probe items, or the paired-version outcome) turns it into a standardised, sign-adjusted reading
 * per item and calls planner.record(item, { [stat]: x }, 0). Nothing here invents a reading.
 */
function passiveFor(dayIndex) {
  if (process.env.DAILY_PASSIVE !== '1') return [];
  const slot = ((Math.floor(dayIndex) % 30) + 30) % 30;
  return PASSIVE_POOL.filter((it) => it.slot === slot);
}

module.exports = { passiveFor, markIpip, enabled, offer, skip, start, answer, stop, openRun, closeRun, importanceOf, allowanceFor, getDaily, KINDS, REPEAT, FIRST_DAYS, FIRST_SEC, LATER_SEC, IPIP_PER_DAY };
