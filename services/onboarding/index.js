/**
 * The baseline session: three modes (Quick / Balanced / Accurate), adaptive item choice, and the hand-off to the scorecard.
 *
 *   modes(user)                    what to offer, with honest minutes, and what is already known (a deeper retake builds on it)
 *   start(user, modeId)            opens a session, returns the first step
 *   answer(user, body)             { session, id, response, ms }: scores the step, returns the next step or the finished summary
 *   finish(user)                   closes early (the learner can stop any time; what was answered still counts)
 *
 * Who may: boosters.allowed(user), the same rule the other measurement channels use. An account under its country's consent age without a
 * parent's `measurement_extras` agreement, or one that has not answered the age screen, gets NO new measurement channel: modes() says so
 * and the page sends it to the existing style quiz, unchanged. The one addition is mayTake(): a learner in the new onboarding who has no saved account
 * yet but has agreed (services/onboarding-v2.js) may take this test, and only this test. Every other channel still waits for the saved account.
 *
 * The new onboarding (/start) asks interests on its own screen right after the test, so it opens the session with interests_last: Quick's required
 * interests question (sv:interests) comes last instead of first, its time stays reserved so the same tasks fit, and that screen's answer goes through the
 * same scoring. docs/ONBOARDING-V2.md section 3 has what that changes, measured. The old /baseline page does not pass it and is unchanged.
 *
 * What is kept (the learner's profile row, so account deletion and the data download already cover it): `onboarding.known` (the model's
 * accumulated evidence, the items already used and the precision already fed to the scorecard, so a retake builds on it), `onboarding.active`
 * (the open session) and `onboarding.sessions` (one line per finished session). Keys and shuffles stay in the open session, never sent out.
 *
 * Feeding the scorecard: baseline.observations() turns the estimates into designed-test observations (source 'onboarding'); a retake feeds only
 * the precision it added, so the learned history is kept. The learning spec reads the scorecard, so the first levels written after this already
 * use the baseline.
 */
'use strict';

const crypto = require('crypto');
const learner = require('../learner');
const boosters = require('../boosters');
const scorecard = require('../scorecard');
const model = require('./model');
const baseline = require('./baseline');
const tasks = require('./tasks');
const { Planner, MODES } = require('./plan');
const { byId, pool } = require('./pool');

const get = (userId) => {
  const p = learner.getProfile(userId) || {};
  const o = p.onboarding || {};
  return { known: o.known || { state: model.emptyState(), used: [], fed: {} }, active: o.active || null, sessions: o.sessions || [] };
};
const put = (userId, o) => learner.saveProfile(userId, { onboarding: o });

/** Who may take the test: the usual rule, or a guest who has agreed (a child guest still needs the parent's measurement agreement). */
function mayTake(user) {
  if (!user || !user.age_check) return false;
  if (user.guest !== true) return boosters.allowed(user);
  const child = user.age_check.needs_parent || user.age_check.under_13;
  return (child || !!user.agreed_at) && boosters.allowed({ ...user, guest: false });
}

/** An item is offered only if its words or generator exist (content/onboarding/items.json; the checks drop what they cannot verify). */
const availableCache = new Map();
function available(item) {
  if (!availableCache.has(item.id)) availableCache.set(item.id, !!tasks.present(item, 1));
  return availableCache.get(item.id);
}

function modes(user) {
  const allowed = mayTake(user);
  const g = get(user.id);
  const done = g.sessions.length;
  return {
    allowed,
    reason: allowed ? null : 'This account takes the learning-style quiz only (no extra measurement without a parent\'s agreement).',
    done,
    last: done ? g.sessions[done - 1] : null,
    modes: Object.values(MODES).map((m) => ({ id: m.id, label: m.label, minutes: m.minutes, blurb: m.blurb })),
  };
}

function stepOf(planner, item, seed, userId) {
  const shown = tasks.present(item, seed);
  const { _server, ...view } = shown;
  return {
    step: view,
    server: _server,
    progress: { minutes_left: Math.max(0, Math.round((planner.secondsLeft / 60) * 2) / 2), budget_minutes: Math.round(planner.mode.budgetSec / 60), elapsed_minutes: Math.round((planner.elapsed / 60) * 10) / 10 },
  };
}

/** Put a question held back by interests_last in front of the queue, and give back the time reserved for it. */
function releaseDeferred(active, planner) {
  const id = active.deferred;
  active.deferred = null;
  planner.used.delete(id);
  planner.queue = [id];
  planner.elapsed = Math.max(0, planner.elapsed - byId[id].sec);
  active.closing = true; // this answer ends the session: the learner has moved on to the next screen
  return byId[id];
}

function next(user, active, planner, { release = false } = {}) {
  const g = get(user.id);
  planner.available = available;
  for (let guard = 0; guard < 50; guard++) {
    let item = release && active.deferred ? releaseDeferred(active, planner) : planner.next();
    if (!item && active.deferred) item = releaseDeferred(active, planner);
    if (!item) return null;
    if (!available(item)) { planner.used.add(item.id); if (planner.queue[0] === item.id) planner.queue.shift(); continue; }
    const seed = crypto.randomInt(1, 2 ** 31);
    const out = stepOf(planner, item, seed, user.id);
    active.current = { id: item.id, seed, server: out.server, at: Date.now() };
    active.planner = planner.toJSON();
    put(user.id, { known: g.known, active, sessions: g.sessions });
    return { ...out, server: undefined };
  }
  return null;
}

/**
 * @param {object} [opts]
 * @param {boolean} [opts.resume] an open session of this mode carries on from the step it was on (a reload), instead of starting over
 * @param {boolean} [opts.interests_last] see the top of this file
 */
function start(user, modeId, { resume = false, interests_last: interestsLast = false } = {}) {
  if (!mayTake(user)) return { error: 'Not available for this account.', code: 'not_allowed' };
  if (!MODES[modeId]) return { error: 'Choose Quick, Balanced or Accurate.', code: 'bad_mode' };
  const g = get(user.id);
  if (resume && g.active && g.active.mode === modeId && g.active.current && byId[g.active.current.id]) {
    const out = stepOf(Planner.from(g.active.planner, { state: null }), byId[g.active.current.id], g.active.current.seed, user.id);
    return { session: g.active.id, mode: modeId, resumed: true, step: out.step, progress: out.progress };
  }
  const planner = new Planner(modeId, { state: g.known.state, used: g.known.used });
  planner.available = available;
  const active = { id: crypto.randomBytes(6).toString('hex'), mode: modeId, started_at: new Date().toISOString(), history: {}, planner: planner.toJSON(), current: null };
  const held = 'sv:interests';
  if (interestsLast && planner.queue.includes(held) && available(byId[held])) {
    planner.queue = planner.queue.filter((id) => id !== held);
    planner.used.add(held); // not picked mid-way; given back by releaseDeferred
    planner.elapsed += byId[held].sec;
    active.deferred = held;
  }
  const step = next(user, active, planner);
  if (!step) return finish(user, active, planner);
  return { session: active.id, mode: modeId, ...step };
}

function finish(user, active, planner) {
  const g = get(user.id);
  const est = planner.estimates();
  const obs = baseline.observations(est, g.known.fed);
  const tracked = obs.length ? scorecard.observe(user.id, obs, { source: 'onboarding' }) : null;
  const fed = baseline.fedAfter(est, g.known.fed);
  const line = { id: active.id, mode: active.mode, at: new Date().toISOString(), minutes: Math.round((planner.elapsed / 60) * 10) / 10, items: planner.log.filter((l) => l.seconds > 0).length, measures_fed: obs.length };
  put(user.id, { known: { state: planner.state, used: [...planner.used], fed }, active: null, sessions: [...g.sessions, line] });
  // The baseline replaces the old style quiz for this account, so the pages stop offering that quiz once it is done.
  learner.saveProfile(user.id, { took_style_quiz: true });
  try { require('../scorecard/hooks').onOnboarding && require('../scorecard/hooks').onOnboarding(user.id, line); } catch { /* optional hook */ }
  return { done: true, summary: { ...line, known: obs.length, card_updated: !!tracked } };
}

function answer(user, body) {
  if (!mayTake(user)) return { error: 'Not available for this account.', code: 'not_allowed' };
  const g = get(user.id);
  const active = g.active;
  if (!active || !body || body.session !== active.id || !active.current || active.current.id !== body.id) return { error: 'That step is not open.', code: 'stale' };
  const planner = Planner.from(active.planner, { state: null });
  planner.available = available;
  const item = byId[active.current.id];
  const nominal = item.sec;
  const seconds = Math.min(Math.max(Number(body.ms) / 1000 || nominal, 0.5), nominal * 4);
  const response = body.response && typeof body.response === 'object' ? body.response : {};
  if (body.skip) {
    // A skipped step reads nothing and still costs its time; it is not offered again.
    planner.used.add(item.id); if (planner.queue[0] === item.id) planner.queue.shift();
    planner.elapsed += seconds; planner.nominal += nominal; planner.actual += seconds;
  } else {
    const readings = tasks.score(item, response, active.current.server);
    planner.record(item, readings, seconds);
    if (item.kind === 'reason') {
      active.history[item.id] = { confidence: clampConf(response.confidence), correct: Number(response.choice) === active.current.server.key };
      for (const f of planner.unlockedFree()) planner.record(f, tasks.calibration(f, active.history), 0);
    }
  }
  if (active.closing) return finish(user, active, planner);
  const step = next(user, active, planner);
  if (!step) return finish(user, active, planner);
  return { session: active.id, ...step };
}
const clampConf = (c) => Math.max(0.2, Math.min(1, (Number(c) || 3) / 5));

/** Close early: what was answered counts. With interests_last and that question still held back, it comes next instead, so the answer on the page still reads. */
function stop(user, { interests_last: interestsLast = false } = {}) {
  const g = get(user.id);
  if (!g.active) return { error: 'No session is open.', code: 'stale' };
  const planner = Planner.from(g.active.planner, {});
  if (interestsLast && g.active.deferred) {
    const step = next(user, g.active, planner, { release: true });
    if (step) return { session: g.active.id, ...step };
  }
  return finish(user, g.active, planner);
}

/** A session still open when the learner has moved on (the first lesson, saving): close it, so what they answered reaches the scorecard. */
function closeOpen(user) {
  if (mayTake(user) && get(user.id).active) return stop(user);
  return null;
}

/**
 * A guest signing in to an account they already have: a finished test moves across when the account has none, fed to its scorecard as it would have been there.
 * Nothing is replaced: an account that already took it keeps its own.
 */
function moveToAccount(guest, account) {
  const from = get(guest.id);
  if (!from.sessions.length || get(account.id).sessions.length) return false;
  const obs = baseline.observations(model.estimates(from.known.state, require('./plan').STAT_IDS), {});
  if (obs.length) scorecard.observe(account.id, obs, { source: 'onboarding' });
  put(account.id, { known: from.known, active: null, sessions: from.sessions });
  learner.saveProfile(account.id, { took_style_quiz: true });
  return true;
}

module.exports = { modes, mayTake, start, answer, stop, closeOpen, moveToAccount, get, available, MODES, pool };
