/**
 * Property test for the retention calendar (services/retention-schedule.js):
 * years of schedule, for many anchors and time zones, against every rule the
 * owner set (curriculum-build/RETENTION-ENFORCERS.md; clarified 2026-10-24:
 * semi-weekly strictly 3/4/3/4 from the anchor, absorbed by the weekly on the
 * weekly's day, the widest scope absorbing the narrower ones on any shared day).
 *
 *   node scripts/retention-schedule-test.js
 *
 * Pure: no database, no network.
 */
const s = require('../services/retention-schedule');

let failures = 0;
let checks = 0;
function check(label, ok, detail) {
  checks += 1;
  if (ok) { console.log(`  ok   ${label}`); return; }
  failures += 1;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 400)}`}`);
}
const gaps = (list) => list.slice(1).map((d, i) => d - list[i]);
const YEARS = 8;
const N = Math.ceil(365.25 * YEARS);

console.log(`the schedule, ${YEARS} years from the anchor`);
const S = s.daysOf('semiweekly', 1, N);
const W = s.daysOf('weekly', 1, N);
const B = s.daysOf('biweekly', 1, N);
const M = s.daysOf('monthly', 1, N);
const sets = { semiweekly: new Set(S), weekly: new Set(W), biweekly: new Set(B), monthly: new Set(M) };
const RANKS = { semiweekly: 1, weekly: 2, biweekly: 3, monthly: 4 };

{
  // Written apart from the scheduler: the plain alternation from the anchor, 0 +3 +4 +3 +4 ...
  const plain = [];
  for (let d = 0, k = 0; d <= N; d += k % 2 === 0 ? 3 : 4, k++) if (d > 0) plain.push(d);
  check('semi-weekly is the plain 3/4/3/4 alternation from the anchor, no offset (3, 7, 10, 14, ...)', plain.length === S.length && plain.every((d, i) => S[i] === d), S.slice(0, 6));
  const g = gaps([0, ...S]);
  check('semi-weekly gaps go 3, 4, 3, 4, ... for the whole span, from day 0', g.every((x, i) => x === (i % 2 === 0 ? 3 : 4)), g.slice(0, 12));
  check('weekly starts on day 7, every 7 days', W[0] === 7 && gaps(W).every((x) => x === 7));
  check('every weekly day is also a semi-weekly day (the alternation lands on it every other time)', W.every((d) => sets.semiweekly.has(d)));
  check('bi-weekly starts on day 12, every 14 days', B[0] === 12 && gaps(B).every((x) => x === 14));
  const mg = gaps(M);
  check('monthly: one about every 30 days (count)', Math.abs(M.length - Math.floor(N / 30)) <= 1, { n: M.length, expected: Math.floor(N / 30) });
  check('monthly: each within 3 days of 30 x m (no drift)', M.every((d, i) => Math.abs(d - 30 * (i + 1)) <= 3), M.slice(0, 6));
  check('monthly: consecutive ones 24 to 36 days apart', mg.every((x) => x >= 24 && x <= 36), { min: Math.min(...mg), max: Math.max(...mg) });
  check('monthly: the average gap is 30 days', Math.abs((M[M.length - 1] - M[0]) / (M.length - 1) - 30) < 0.2);
}

console.log('absorption: one enforcer a day, the widest');
{
  let bad = null;
  let absorbedDays = 0;
  for (let d = 0; d <= N; d++) {
    const want = Object.keys(sets).filter((n) => sets[n].has(d)).sort((a, b) => RANKS[b] - RANKS[a]);
    const got = s.typesOn(d);
    if (want.join() !== got.join() || (want[0] || null) !== s.typeOn(d) || s.absorbed(d).join() !== want.slice(1).join()) { bad = { d, want, got }; break; }
    if (want.length > 1) absorbedDays += 1;
  }
  check('typesOn lists every type on the day, widest first; typeOn is the widest; absorbed is the rest', !bad, bad);
  const shared = [];
  for (let d = 1; d <= N; d++) if (s.typesOn(d).length > 1) shared.push(d);
  check('the only shared days are the weeklies, each absorbing exactly the semi-weekly', shared.length === W.length && shared.every((d) => s.typesOn(d).join() === 'weekly,semiweekly'), shared.slice(0, 5).map((d) => [d, s.typesOn(d)]));
  check(`${absorbedDays} absorbed days in ${YEARS} years, one every 7 days`, absorbedDays === W.length);
  const occ = s.occurrences(1, N);
  check('occurrences: one per scheduled day, of the widest type, with what it absorbs', occ.length === new Set([...S, ...W, ...B, ...M]).size && occ.every((o) => o.type === s.typeOn(o.day) && o.absorbs.join() === s.absorbed(o.day).join()));
  check('a weekly\'s combined window covers the week, the semi-week and the day itself', W.every((d) => {
    const c = s.combinedWindow(d);
    const w = s.windowFor('weekly', d);
    const sw = s.windowFor('semiweekly', d);
    return c.to === d && w.to === d && sw.to === d && c.from === w.from && sw.from >= w.from && sw.from === d - 3;
  }));
  check('bi-weekly, monthly and lone semi-weekly days absorb only their own end-of-day (nothing else on the day)', [...B, ...M, ...S.filter((d) => !sets.weekly.has(d))].every((d) => s.typesOn(d).length === 1));
}

console.log('at least a day apart');
{
  check('bi-weekly never on a semi-weekly or weekly day', B.every((d) => !sets.semiweekly.has(d) && !sets.weekly.has(d)));
  check('bi-weekly has a free day on each side (no semi-weekly or weekly the day before or after: the strict reading)', B.every((d) => [d - 1, d + 1].every((x) => !sets.semiweekly.has(x) && !sets.weekly.has(x))));
  check('bi-weekly is two days from a semi-weekly and two from a weekly', B.every((d) => sets.semiweekly.has(d - 2) && sets.weekly.has(d + 2)));
  check('monthly never on a semi-weekly, weekly or bi-weekly day', M.every((d) => !sets.semiweekly.has(d) && !sets.weekly.has(d) && !sets.biweekly.has(d)));
}

console.log('the monthly pocket day');
{
  const rank = (d) => Math.max(0, ...['semiweekly', 'weekly', 'biweekly'].filter((n) => sets[n].has(d)).map((n) => RANKS[n]));
  const nearest = (d) => { for (let k = 1; k <= 7; k++) { const r = Math.max(rank(d - k), rank(d + k)); if (r) return r; } return 0; };
  let bad = null;
  M.forEach((d, i) => {
    const t = 30 * (i + 1);
    // Brute force, written apart from the scheduler: the best pocket day by
    // (nearest enforcer's hardness, distance to 30m, earlier).
    let best = null;
    for (let x = t - 3; x <= t + 3; x++) {
      if (x < 1 || rank(x) !== 0) continue;
      const key = [nearest(x), Math.abs(x - t), x];
      if (!best || key[0] < best[0] || (key[0] === best[0] && (key[1] < best[1] || (key[1] === best[1] && key[2] < best[2])))) best = key;
    }
    if (!best || best[2] !== d) bad = bad || { d, best, t };
  });
  check('every monthly is the pocket day nearest the easiest enforcer, then nearest 30m, then earlier', !bad, bad);
  check('every monthly sits next to a semi-weekly and next to no weekly or bi-weekly (the easier neighbour, always in reach)', M.every((d) => (sets.semiweekly.has(d - 1) || sets.semiweekly.has(d + 1)) && [d - 1, d + 1].every((x) => !sets.weekly.has(x) && !sets.biweekly.has(x))));
}

console.log('windows (each ends on its own day: the end-of-day enforcer is part of it)');
{
  const cover = (type, list) => {
    const seen = new Map();
    for (const d of list) {
      const w = s.windowFor(type, d);
      for (let x = w.from; x <= w.to; x++) seen.set(x, (seen.get(x) || 0) + 1);
    }
    return seen;
  };
  const once = (type, list) => {
    const seen = cover(type, list);
    for (let x = 0; x <= list[list.length - 1]; x++) if (seen.get(x) !== 1) return x;
    return true;
  };
  check('semi-weekly windows cover every day from the anchor exactly once ("since the last one", through its day)', once('semiweekly', S) === true, once('semiweekly', S));
  check('semi-weekly windows are 3 or 4 days (the first: days 0 to 3)', S.every((d, i) => { const w = s.windowFor('semiweekly', d); const n = w.to - w.from + 1; return i === 0 ? n === 4 : (n === 3 || n === 4); }));
  check('weekly windows cover every day exactly once: the week ending on the day (the first: from the anchor)', once('weekly', W) === true && W.every((d, i) => { const w = s.windowFor('weekly', d); return w.to === d && w.from === (i === 0 ? 0 : d - 6); }));
  check('bi-weekly windows are the 14 days ending on the day (the first: since the anchor), back to back', B.every((d, i) => { const w = s.windowFor('biweekly', d); return w.to === d && w.from === (i === 0 ? 0 : d - 13); }) && once('biweekly', B) === true);
  check('monthly windows cover every day since the anchor exactly once', once('monthly', M) === true, once('monthly', M));
  check('no window reaches into the future or before the anchor', [...S.map((d) => ['semiweekly', d]), ...W.map((d) => ['weekly', d]), ...B.map((d) => ['biweekly', d]), ...M.map((d) => ['monthly', d])]
    .every(([t, d]) => s.windowFor(t, d).to === d && s.windowFor(t, d).from >= 0));
  // Every day is covered by some scheduled enforcer that is taken on or after it: nothing falls between.
  const all = new Map();
  for (const [t, list] of Object.entries({ semiweekly: S, weekly: W, biweekly: B, monthly: M })) for (const [k, v] of cover(t, list)) all.set(k, (all.get(k) || 0) + v);
  let gap = null;
  for (let x = 0; x <= N - 7; x++) if (!all.get(x)) { gap = x; break; }
  check('every day is inside at least one scheduled window', gap === null, gap);
}

console.log('next, previous, latest');
{
  let bad = null;
  for (const type of s.TYPES) {
    const list = s.daysOf(type, 1, N);
    for (let d = 1; d < list[list.length - 2]; d += 1) {
      const nx = s.next(type, d);
      const want = list.find((x) => x >= d);
      if (nx !== want) { bad = { type, d, nx, want }; break; }
      const lt = s.latest(type, d);
      const wantL = [...list].reverse().find((x) => x <= d) || null;
      if (lt !== wantL) { bad = { type, d, lt, wantL }; break; }
    }
    if (bad) break;
  }
  check('next and latest agree with the lists, every day, every type', !bad, bad);
}

console.log('many anchors: calendar dates');
{
  let bad = null;
  let anchors = 0;
  for (let a = 0; a < 3 * 366; a += 2) {
    const anchor = s.addDays('2024-01-01', a);
    anchors += 1;
    for (let d = 0; d <= 5 * 366; d += 1) {
      const date = s.addDays(anchor, d);
      if (s.dayIndex(anchor, date) !== d) { bad = { anchor, d, date }; break; }
    }
    // A weekly (and the semi-weekly it absorbs) is always on the anchor's weekday, whatever the month lengths and leap years.
    const wd = new Date(`${anchor}T00:00:00Z`).getUTCDay();
    for (const d of W.slice(0, 260)) if (new Date(`${s.addDays(anchor, d)}T00:00:00Z`).getUTCDay() !== wd) { bad = { anchor, d, why: 'weekday' }; break; }
    // The lone semi-weeklies are always 3 weekdays after it, the bi-weeklies 5.
    for (const d of S.slice(0, 200)) if (!sets.weekly.has(d) && new Date(`${s.addDays(anchor, d)}T00:00:00Z`).getUTCDay() !== (wd + 3) % 7) { bad = { anchor, d, why: 'semi weekday' }; break; }
    for (const d of B.slice(0, 100)) if (new Date(`${s.addDays(anchor, d)}T00:00:00Z`).getUTCDay() !== (wd + 5) % 7) { bad = { anchor, d, why: 'bi weekday' }; break; }
    if (bad) break;
  }
  check(`${anchors} anchors over 3 years: day numbers and dates agree for 5 years each; weeklies keep the anchor's weekday, semi-weeklies +3, bi-weeklies +5`, !bad, bad);
}

console.log('time zones: a day is a local calendar date, through every DST change');
{
  const zones = ['UTC', 'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Europe/Berlin', 'Australia/Sydney', 'Asia/Kolkata', 'Pacific/Auckland', 'Pacific/Kiritimati', 'Pacific/Pago_Pago', 'America/Sao_Paulo'];
  let bad = null;
  let seenAbsorbed = 0;
  const start = Date.UTC(2025, 0, 1, 12);
  for (const tz of zones) {
    const anchor = s.localDate(start, tz);
    let prev = 0;
    for (let k = 0; k < 4 * 365 * 4; k++) {
      const ts = start + k * 6 * 3600 * 1000;
      const idx = s.dayIndex(anchor, s.localDate(ts, tz));
      if (idx < prev || idx > prev + 1) { bad = { tz, k, idx, prev }; break; }
      // Each local day maps to one enforcer (the widest), whatever the hour.
      if (s.typesOn(idx).length > 1) { seenAbsorbed += 1; if (s.typeOn(idx) !== 'weekly') { bad = { tz, idx, types: s.typesOn(idx) }; break; } }
      prev = idx;
    }
    if (bad) break;
  }
  check(`${zones.length} zones, 4 years every 6 hours: the day number never skips or steps back; shared days resolve to the weekly`, !bad && seenAbsorbed > 0, bad || seenAbsorbed);
  check('localDate reads the zone: 2025-03-30 00:30 UTC is still 29 March in New York', s.localDate(Date.UTC(2025, 2, 30, 0, 30), 'America/New_York') === '2025-03-29');
  check('localDate across the US spring change: 2025-03-09 23:30 local (03:30 UTC next day)', s.localDate(Date.UTC(2025, 2, 10, 3, 30), 'America/New_York') === '2025-03-09');
  check('an unknown zone reads as UTC', s.validZone('Not/AZone') === 'UTC' && s.localDate(Date.UTC(2025, 0, 1, 23), 'Not/AZone') === '2025-01-01');
  check('Kiritimati (UTC+14) is a day ahead of Pago Pago (UTC-11)', s.dayIndex(s.localDate(start, 'Pacific/Pago_Pago'), s.localDate(start, 'Pacific/Kiritimati')) === 1);
}

console.log(failures ? `\n${failures} of ${checks} check(s) FAILED` : `\nall ${checks} checks passed`);
process.exit(failures ? 1 : 0);
