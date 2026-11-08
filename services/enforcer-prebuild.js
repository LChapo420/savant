/**
 * Pre-built enforcer questions (docs/SESSION-BAR.md). While a study session runs, the questions the retention enforcer would ask
 * are drawn ahead of time, so End opens the enforcer with them ready instead of drawing them then.
 *
 * What is kept: only the question objects (from the objective items and the bank, both already checked content; no model is called
 * here, so there is nothing unchecked to show), in memory, per learner, for the running session. Nothing is written to the database,
 * nothing is an answered item, and nothing counts toward coverage, mastery or the scorecard.
 *
 * How the final set stays exact: the ranking, the tiers and the budgets are still worked out at End from the whole window, exactly
 * as before (services/enforcers.js draftAll). A pre-built question is used only for a topic the final plan picks, and only if it is not
 * one the learner has been asked since; any other topic's question is drawn at End as before.
 *
 * Refresh: at most every REFRESH_MS (ENFORCER_PREBUILD_MS, default 3 min), and only when the learner has answered something new since the
 * last build, driven by the page's own heartbeat. The first PRE_N picks of the widest tier are the "first questions" recorded in `first`.
 * ENFORCER_PREBUILD=off turns it off (End draws everything, as before).
 */
const study = require('./study-sessions');

const PRE_N = 2;
const cache = new Map(); // userId -> { session_id, at, n, questions, first, ms }
const stats = { builds: 0, hits: 0, reused: 0, drawn: 0 };

const enabled = () => study.enabled() && String(process.env.ENFORCER_PREBUILD || 'on').toLowerCase() !== 'off';
const refreshMs = () => { const v = Number(process.env.ENFORCER_PREBUILD_MS); return Number.isFinite(v) && v >= 0 ? v : 180000; };

/** Draw (or refresh) the running session's questions. Returns the cache record, or null when there is nothing to draw from yet. */
function build(userId, { now = Date.now(), force = false } = {}) {
  if (!enabled()) return null;
  const s = study.current(userId, now);
  if (!s) { cache.delete(userId); return null; }
  const enforcers = require('./enforcers'); // eslint-disable-line global-require
  const prev = cache.get(userId);
  if (!force && prev && prev.session_id === s.id && now - prev.at < refreshMs()) return prev;
  const tz = study.zoneFor(userId);
  const win = { from_ms: Date.parse(s.started_at), to_ms: now };
  const rows = enforcers.windowItems(userId, win, tz);
  if (!rows.length) return prev && prev.session_id === s.id ? prev : null;
  if (!force && prev && prev.session_id === s.id && prev.n === rows.length) { prev.at = now; return prev; }
  const t0 = process.hrtime.bigint();
  const enf = {
    user_id: userId, scope: 'session', window: { from_ms: win.from_ms, to_ms: null }, study_session_ids: [s.id], tz, base: enforcers.isBase(userId), covers: [],
    base_active_ms: Math.round(enforcers.activeMs(userId, { ...win, study_session_ids: [s.id] }, rows)), spent_today_ms: 0, prebuild: true,
  };
  const d = enforcers.draftAll(userId, enf, { now, seed: null });
  const full = d.tiers.full || d.tiers[Object.keys(d.tiers).pop()];
  const rec = {
    session_id: s.id, at: now, n: rows.length, questions: d.questions,
    first: ((full && full.slots) || []).slice(0, PRE_N).map((x) => `${x.key}|${x.k}`),
    ms: Number(process.hrtime.bigint() - t0) / 1e6,
  };
  stats.builds += 1;
  cache.set(userId, rec);
  return rec;
}

/** Fire and forget from a request: never makes the request wait, never throws. */
function later(userId) {
  if (!enabled()) return;
  setImmediate(() => { try { build(userId); } catch (err) { console.warn(`enforcer prebuild failed: ${err.message}`); } });
}

/** The kept question for a unit's try, or null. Used by draftAll. */
function seedFor(userId) {
  const rec = enabled() ? cache.get(userId) : null;
  return rec ? rec.questions : null;
}

const forget = (userId) => { cache.delete(userId); };
const peek = (userId) => cache.get(userId) || null;

module.exports = { build, later, seedFor, forget, peek, enabled, stats, PRE_N };
