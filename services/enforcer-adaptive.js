/**
 * Adaptive timing for the scheduled retention enforcers (switch ENFORCER_ADAPTIVE=on, default OFF;
 * off is today's fixed calendar, services/retention-schedule.js, untouched). docs/ENFORCER-ADAPTIVE.md.
 *
 * What is adaptive today: what goes INSIDE an enforcer (services/enforcers.js ranks by predicted recall) and each
 * skill's review timing. What this adds: WHEN a scheduled enforcer falls, and how big it is, from the learner's own
 * studied material instead of fixed days.
 *
 * Pure: no database, no clock. A unit is one studied objective: { value?: number (default 1), recallIn(x): predicted
 * recall x days from now }. Day numbers are counted from the learner's anchor, like the fixed calendar.
 *
 * Rule (decide): at the end of day d, with `gap` days since the last enforcer and `look` the days to the learner's next
 * likely study day (their recent rhythm, 1..7), a unit is AT RISK when recallIn(look) < the goal's recall target.
 *   due        gap >= minGap and (at-risk value share >= RISK_SHARE or at-risk count >= RISK_COUNT)
 *              or gap >= maxGap and anything at all is at risk (never longer than the fixed calendar's longest gap
 *              for the types the learner's goal keeps: 4, 7, 14 or 36 days)
 *   minGap     2 days (never on consecutive days) unless the at-risk share is HIGH_SHARE or more
 *   tier       by the at-risk share: quick < MEDIUM_SHARE <= medium < FULL_SHARE <= full (the FULL_CAP share rule is
 *              kept: budgets come from retention-params, services/enforcers.js)
 *   type       the smallest kept calendar type whose window holds the days since the last one (sizes the budget; it
 *              absorbs nothing else: one enforcer a day, and each window starts the day after the last one)
 * End-of-session and end-of-day enforcers are not touched by any of this.
 */
const LONGEST = { semiweekly: 4, weekly: 7, biweekly: 14, monthly: 36 };
const ORDER = ['semiweekly', 'weekly', 'biweekly', 'monthly'];
const DEFAULTS = {
  target: 0.8, // services/retention-goal.js GOAL_MEMORY
  minGap: 2, highShare: 0.5,
  riskShare: 0.2, riskCount: 4,
  mediumShare: 0.25, fullShare: 0.5,
};

function on() { return /^(on|1|true)$/i.test(String(process.env.ENFORCER_ADAPTIVE || '')); }

/** The longest gap the fixed calendar leaves for a goal that keeps `kept` types (null when it keeps none). */
function maxGapFor(kept) {
  const k = ORDER.filter((t) => (kept || []).includes(t));
  return k.length ? LONGEST[k[0]] : null;
}

/** The calendar type that sizes a window of `len` days, among the kept types (smallest that holds it, else the widest kept). */
function typeFor(len, kept = ORDER) {
  const k = ORDER.filter((t) => kept.includes(t));
  if (!k.length) return null;
  return k.find((t) => LONGEST[t] >= len) || k[k.length - 1];
}

/** The days to the next study day, from the learner's recent rhythm: the mean gap of their last study days, 1..7. */
function lookahead(studyDays, today) {
  const recent = studyDays.filter((d) => d <= today).slice(-8);
  if (recent.length < 2) return 1;
  const gaps = recent.slice(1).map((d, i) => d - recent[i]);
  const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  // the days already gone since the last study day count toward the next one
  const since = today - recent[recent.length - 1];
  return Math.max(1, Math.min(7, Math.round(mean - since) || 1));
}

function risk(units, look, target, shift = 0) {
  let total = 0; let at = 0; let count = 0;
  for (const u of units) {
    const v = u.value === undefined ? 1 : u.value;
    total += v;
    if (u.recallIn(look + shift) < target) { at += v; count += 1; }
  }
  return { count, share: total ? at / total : 0, total_units: units.length };
}

/**
 * Is an enforcer due at the end of this day? ctx: { day, last (the last enforcer's day, -1 for none), units, look,
 * kept (calendar types the goal keeps), target?, shift? (days ahead, for the forecast) }.
 * Returns { due, reason, count, share, tier, type, from } (from: first day of its window).
 */
function decide(ctx, p = DEFAULTS) {
  const { day, last, units, look = 1, kept = ORDER, shift = 0 } = ctx;
  const target = ctx.target === undefined ? p.target : ctx.target;
  const maxGap = maxGapFor(kept);
  const out = { due: false, reason: 'none', count: 0, share: 0, tier: null, type: null, from: last + 1 };
  if (maxGap === null || day < 1) return out;
  const gap = day - Math.max(0, last);
  const r = risk(units, look, target, shift);
  Object.assign(out, { count: r.count, share: r.share });
  if (!r.count) return out;
  const minGap = r.share >= p.highShare ? 1 : p.minGap;
  let reason = null;
  if (gap >= minGap && (r.share >= p.riskShare || r.count >= p.riskCount)) reason = 'need';
  else if (gap >= maxGap) reason = 'max_gap';
  if (!reason) return out;
  out.due = true;
  out.reason = reason;
  out.tier = r.share >= p.fullShare ? 'full' : r.share >= p.mediumShare ? 'medium' : 'quick';
  out.type = typeFor(day - out.from + 1, kept);
  return out;
}

/**
 * The next `n` enforcer days ("about" dates for the calendar), from today's state, assuming the learner studies
 * at their usual rhythm and each enforcer restores most of what was at risk (loss runs a third as fast after it).
 * Returns [{ offset (days from today), about: true }]. A forecast, not a promise: it moves as the learner studies.
 */
function forecast(ctx, n = 3, horizon = 21, p = DEFAULTS) {
  const out = [];
  const units = ctx.units.map((u) => ({ ...u }));
  let last = ctx.last;
  const refreshed = new Map();
  for (let k = 1; k <= horizon && out.length < n; k++) {
    const shifted = units.map((u, i) => {
      const at = refreshed.get(i);
      if (at === undefined) return u;
      return { value: u.value, recallIn: (x) => 1 - (1 - u.recallIn(Math.max(0, x - at))) / 3 };
    });
    const d = decide({ ...ctx, day: ctx.day + k, last, units: shifted, shift: k }, p);
    if (d.due) {
      out.push({ offset: k, about: true, tier: d.tier, type: d.type, reason: d.reason });
      units.forEach((u, i) => { if (u.recallIn(k + (ctx.look || 1)) < (ctx.target === undefined ? p.target : ctx.target) || refreshed.has(i)) refreshed.set(i, k); });
      last = ctx.day + k;
    }
  }
  return out;
}

module.exports = { on, decide, forecast, lookahead, maxGapFor, typeFor, LONGEST, ORDER, DEFAULTS };
