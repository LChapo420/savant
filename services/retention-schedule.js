/**
 * The retention calendar: which day each scheduled retention enforcer falls on
 * (curriculum-build/RETENTION-ENFORCERS.md). Pure: no database, no clock. Every
 * function takes day numbers counted from the learner's anchor, the local date
 * of their first study session (day 0), so the same schedule holds in any time
 * zone and across daylight-saving changes (a "day" is a calendar date, never
 * 24 hours of clock time).
 *
 * The owner's rules (clarified 2026-10-24), and how each is met:
 *
 *   semi-weekly  strictly every 3 then 4 days from the anchor, no offset:
 *                days 3, 7, 10, 14, 17, 21, ... (residues 3 and 0 of 7).
 *   weekly       every 7 days: days 7, 14, 21, ... Every other semi-weekly lands
 *                on a weekly's day; there the WEEKLY absorbs it: one enforcer
 *                covering the week, the semi-week and that day together.
 *   bi-weekly    every 14 days, on days 12, 26, 40, ... (14k - 2, residue 5 of
 *                7): two days after a semi-weekly and two before a weekly, so a
 *                free day on each side (at least a day apart, in the strict sense).
 *   monthly      about every 30 days: a "pocket" day (no semi-weekly, weekly or
 *                bi-weekly) within 3 days of day 30m, the one whose nearest
 *                enforcer is the easiest (a semi-weekly next door beats a weekly
 *                or a bi-weekly), then the one nearest 30m, then the earlier.
 *                Any 7 consecutive days hold a residue-2 day, the day before a
 *                semi-weekly with a free day on its other side, so every monthly
 *                sits next to a semi-weekly only; consecutive monthlies are 24 to
 *                36 days apart and never drift.
 *
 * Absorption: when enforcers fall on one day, the widest absorbs the narrower
 * ones (typesOn lists them widest first; typeOn is the widest). The end-of-day
 * enforcer of a scheduled day is part of the scheduled one, so every window
 * here ends ON its day: the scheduled enforcer is taken at the end of that day
 * (or, if the day ends without it, before the next session).
 *
 * scripts/retention-schedule-test.js checks every rule over years of calendar
 * for many anchors and time zones.
 */
const TYPES = ['semiweekly', 'weekly', 'biweekly', 'monthly'];
/** How hard each is: its window, so its size. Used for the monthly's "easier neighbour" and for absorbing and merging. */
const RANK = { day: 0.5, semiweekly: 1, weekly: 2, biweekly: 3, monthly: 4 };
const LABEL = { semiweekly: 'Semi-weekly', weekly: 'Weekly', biweekly: 'Bi-weekly', monthly: 'Monthly', session: 'End of session', day: 'End of day' };
const MONTH = 30;
const MONTH_SLACK = 3;

function isSemiweekly(d) { return Number.isInteger(d) && d >= 3 && (d % 7 === 3 || d % 7 === 0); }
function isWeekly(d) { return Number.isInteger(d) && d >= 7 && d % 7 === 0; }
function isBiweekly(d) { return Number.isInteger(d) && d >= 12 && d % 14 === 12; }

/** Semi-weekly, weekly and bi-weekly on day d, widest first ([] for none). */
function baseTypes(d) {
  if (!Number.isInteger(d) || d < 1) return [];
  const out = [];
  if (isBiweekly(d)) out.push('biweekly');
  if (isWeekly(d)) out.push('weekly');
  if (isSemiweekly(d)) out.push('semiweekly');
  return out;
}

/** The widest of them on day d before monthlies are placed (null for none). */
function baseType(d) { return baseTypes(d)[0] || null; }

/**
 * How hard the nearest enforcer to day d is: the widest type at the smallest
 * distance (either side) that has one; 0 when none is within 7 days.
 */
function nearestRank(d) {
  for (let k = 1; k <= 7; k++) {
    const r = Math.max(RANK[baseType(d - k)] || 0, RANK[baseType(d + k)] || 0);
    if (r) return r;
  }
  return 0;
}

const monthlyCache = new Map();
/** The day of the m-th monthly (m >= 1). */
function monthlyDay(m) {
  if (monthlyCache.has(m)) return monthlyCache.get(m);
  const target = MONTH * m;
  let best = null;
  for (let d = target - MONTH_SLACK; d <= target + MONTH_SLACK; d++) {
    if (d < 1 || baseType(d) !== null) continue;
    const key = [nearestRank(d), Math.abs(d - target), d];
    if (!best || key[0] < best.key[0] || (key[0] === best.key[0] && (key[1] < best.key[1] || (key[1] === best.key[1] && key[2] < best.key[2])))) {
      best = { d, key };
    }
  }
  const day = best ? best.d : target;
  if (monthlyCache.size > 5000) monthlyCache.clear();
  monthlyCache.set(m, day);
  return day;
}

function isMonthly(d) {
  if (!Number.isInteger(d) || d < 1) return false;
  const m = Math.round(d / MONTH);
  return m >= 1 && monthlyDay(m) === d;
}

/** Every scheduled type on day d, widest first: the first absorbs the rest. */
function typesOn(d) {
  const b = baseTypes(d);
  if (b.length) return b;
  return isMonthly(d) ? ['monthly'] : [];
}

/** The scheduled enforcer on day d (the widest, which absorbs the others), or null. */
function typeOn(d) { return typesOn(d)[0] || null; }

/** The narrower types the enforcer on day d absorbs (the end-of-day one is always part of it too). */
function absorbed(d) { return typesOn(d).slice(1); }

/** Every scheduled enforcer from day `from` to day `to`, inclusive: [{day, type, absorbs}]. */
function occurrences(from, to) {
  const out = [];
  for (let d = Math.max(1, from); d <= to; d++) {
    const types = typesOn(d);
    if (types.length) out.push({ day: d, type: types[0], absorbs: types.slice(1) });
  }
  return out;
}

/** The days of one type from day `from` to day `to` (on its own schedule, absorbed or not). */
function daysOf(type, from, to) {
  const out = [];
  if (type === 'monthly') {
    for (let m = Math.max(1, Math.floor((from - MONTH_SLACK) / MONTH)); MONTH * m - MONTH_SLACK <= to; m++) {
      const d = monthlyDay(m);
      if (d >= from && d <= to) out.push(d);
    }
    return out;
  }
  const test = type === 'semiweekly' ? isSemiweekly : type === 'weekly' ? isWeekly : isBiweekly;
  for (let d = Math.max(1, from); d <= to; d++) if (test(d)) out.push(d);
  return out;
}

const TEST = { semiweekly: isSemiweekly, weekly: isWeekly, biweekly: isBiweekly, monthly: isMonthly };
const has = (type, d) => (TEST[type] ? TEST[type](d) : false);

/** The occurrence of `type` before day d (the anchor, day 0, when there is none). */
function previous(type, d) {
  if (type === 'weekly') return Math.max(0, Math.floor((d - 1) / 7) * 7);
  if (type === 'monthly') {
    for (let m = Math.round(d / MONTH) + 1; m >= 1; m--) { const x = monthlyDay(m); if (x < d) return x; }
    return 0;
  }
  for (let x = d - 1; x >= 1; x--) if (has(type, x)) return x;
  return 0;
}

/** The occurrence of `type` on or after day d (on its own schedule). */
function next(type, d) {
  const start = Math.max(1, d);
  if (type === 'monthly') {
    for (let m = Math.max(1, Math.floor(start / MONTH) - 1); ; m++) { const x = monthlyDay(m); if (x >= start) return x; }
  }
  for (let x = start; x < start + 30; x++) if (has(type, x)) return x;
  return null;
}

/** The latest occurrence of `type` on or before day d, or null. */
function latest(type, d) {
  if (d < 1) return null;
  if (has(type, d)) return d;
  const p = previous(type, d);
  return p >= 1 ? p : null;
}

/**
 * The days an occurrence covers, inclusive: [from, to], always ending ON its
 * day (it absorbs that day's end-of-day enforcer). Semi-weekly, weekly and
 * monthly: since the last one of their kind (the first: since the anchor), so
 * each type's windows cover every day exactly once; bi-weekly: the 14 days
 * ending on its day. On a weekly's day the semi-weekly's window (its last 4
 * days) lies inside the weekly's, so the absorbing weekly covers both.
 */
function windowFor(type, d) {
  if (type === 'biweekly') return { from: Math.max(0, d - 13), to: d };
  const p = previous(type, d);
  return { from: p >= 1 ? p + 1 : 0, to: d };
}

/** The window of the enforcer on day d with everything it absorbs: the union of its types' windows. */
function combinedWindow(d) {
  const types = typesOn(d);
  if (!types.length) return null;
  const ws = types.map((t) => windowFor(t, d));
  return { from: Math.min(...ws.map((w) => w.from)), to: d };
}

// ── local calendar dates ──────────────────────────────────────────────────

const DAY_MS = 24 * 3600 * 1000;

/** A time zone this runtime understands, else 'UTC'. */
function validZone(tz) {
  if (!tz || typeof tz !== 'string' || tz.length > 64) return 'UTC';
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } catch { return 'UTC'; }
}

const formatters = new Map();
/** The local calendar date ('YYYY-MM-DD') of an instant in a time zone. */
function localDate(ts, tz = 'UTC') {
  const zone = validZone(tz);
  let f = formatters.get(zone);
  if (!f) { f = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }); formatters.set(zone, f); }
  const parts = f.formatToParts(new Date(ts));
  const get = (t) => (parts.find((p) => p.type === t) || {}).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Days since 1970-01-01 of a calendar date. */
function dateNumber(date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ''));
  if (!m) return NaN;
  return Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY_MS);
}

/** The calendar date n days after `date`. */
function addDays(date, n) {
  return new Date(dateNumber(date) * DAY_MS + n * DAY_MS).toISOString().slice(0, 10);
}

/** Day number of `date` counted from the anchor date. */
function dayIndex(anchor, date) {
  return dateNumber(date) - dateNumber(anchor);
}

module.exports = {
  TYPES, RANK, LABEL, MONTH, MONTH_SLACK,
  baseType, baseTypes, typeOn, typesOn, absorbed, occurrences, daysOf, monthlyDay, nearestRank,
  isSemiweekly, isWeekly, isBiweekly, isMonthly,
  previous, next, latest, windowFor, combinedWindow,
  validZone, localDate, dateNumber, addDays, dayIndex,
};
