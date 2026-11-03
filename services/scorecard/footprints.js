/**
 * Behavioural footprints, LIVE (docs/SCORECARD-90.md section 11, "what is in the product"): things a learner does inside normal use, read as
 * calibrated evidence for the measures they bear on. The list, kinds, validities and errors are scripts/lib/scorecard-footprints.js, through
 * footprint-defs.js; every footprint is one or two indicators (indicators.js) that reach the scorecard through scorecard.observe, never as a value
 * written into the card. The validities are CONSERVATIVE ASSUMPTIONS, not measured: real tester data is what calibrates them.
 *
 * Who. Nothing here runs for an account that boosters.allowed() says no to (age screen unanswered, or under the consent age without a parent's
 * measurement_extras agreement): no new measurement channel for them, the same gate as usageSweep and the onboarding. SCORECARD_FOOTPRINTS=off stops
 * all of it.
 *
 * What is kept. One compact row per feed in `footprint_events`: { user_id, fp, ind, x, n, level, at }, a number and a count, never text, keys or
 * answers; rows older than KEEP_DAYS are dropped when a sweep runs. The rows are what the validity check against the designed items (11.6, item 6)
 * is computed from, and go with the account (routes/consent.js deletion, routes/profile.js export).
 *
 * Live (from behaviour the app already has):
 *   extra_practice       replays of passed levels and sittings after the day's minutes goal; first sitting of a day that was the learner's own pick
 *   retry_after_fail     how soon a level not passed was worked again
 *   plan_set_and_kept    the daily plan's minutes goal kept (PUT /api/plan/minutes sets it); a retention goal chosen
 *   rule_switch          switch cost on IQ levels: time after a change of skill against after the same skill
 *   hint_or_try          the coach opened within 8 s of a question appearing, or after trying first (the coach button already exists)
 *   why_or_steps         the new "Why does this work?" choice under a lesson's worked example (public/js/session.js)
 *   deeper_or_move_on    the new "Go deeper / Move on" choice on the level-complete card (public/js/session.js)
 * Design only: race_or_solo, link_prompt, feel_tap, topic_pick, skip_and_exit, reward_panel, ask_a_question.
 */
'use strict';
const db = require('../../config/db');
const defs = require('./footprint-defs');

const DAY = 86400000;
const KEEP_DAYS = 180;
const HINT_FIRST_MS = 8000;
const PROMPTED_KINDS = new Set(['enforcer', 'review']);
const NOT_PRACTICE = new Set(['placement', 'skip', 'enforcer', 'review']);
const FP_OF = Object.fromEntries(defs.LIVE.map((d) => [d.key, d.fp]));

const round3 = (v) => Math.round(v * 1000) / 1000;
const lazy = (p) => require(p); // eslint-disable-line global-require, import/no-dynamic-require
const scorecard = () => lazy('./index');
const indicators = () => lazy('./indicators');

function safely(label, fn) {
  try { return fn(); } catch (err) { console.warn(`footprints: ${label} failed: ${err.message}`); return null; }
}

/** Whether footprints may be read for this account at all (the switch, and boosters.allowed). */
function may(userId) {
  if (!defs.isOn()) return false;
  const user = db.byId('users', userId);
  return !!(user && lazy('../boosters').allowed(user));
}

/** Whether the lesson page should offer the two in-lesson choices to this learner (the same gate). */
function choicesOffered(user) {
  try { return !!(user && defs.isOn() && lazy('../boosters').allowed(user)); } catch { return false; }
}

/**
 * Feed rows [{ ind, x, n }] to the scorecard as one batch per footprint and log each. Rows outside the live list, with a non-finite value or no
 * units, are dropped. Returns the rows fed.
 */
function feed(userId, rows, { level = null, now = Date.now() } = {}) {
  const clean = (rows || []).filter((r) => r && FP_OF[r.ind] && Number.isFinite(Number(r.x)) && Number(r.n) > 0)
    .map((r) => ({ ind: r.ind, x: Number(r.x), n: Math.min(500, Number(r.n)) }));
  if (!clean.length) return [];
  const at = new Date(now).toISOString();
  const bySource = {};
  for (const r of clean) (bySource[FP_OF[r.ind]] = bySource[FP_OF[r.ind]] || []).push(r);
  for (const [fp, list] of Object.entries(bySource)) {
    const batch = Object.fromEntries(list.map((r) => [r.ind, { mean: r.x, n: r.n }]));
    scorecard().observe(userId, indicators().observations(batch), { source: `footprint:${fp}` });
    for (const r of list) db.insert('footprint_events', { user_id: userId, fp, ind: r.ind, x: round3(r.x), n: r.n, level: level || null, at });
  }
  return clean;
}

const levelKey = (session, level) => (session && session.track_id ? `${session.track_id}/${session.grade_id}/${level}` : null);

// ── hint or try first: the coach button is already in the practice screen ────
/** One row for a block's questions where the coach was opened: the share opened within 8 s of the question appearing. */
function hintFirstRow(items) {
  let n = 0;
  let first = 0;
  for (const i of items || []) {
    // Typed answers settled later have a changed `updated_at`, so the time the question appeared cannot be read from it: left out.
    if (!i || !i.coach_used || !i.coach_started_at || !(Number(i.ms) > 0) || i.correct === null || i.correct === undefined || i.grading_settled_at) continue;
    const shown = Date.parse(i.updated_at || 0) - Number(i.ms);
    const offset = Date.parse(i.coach_started_at) - shown;
    if (!Number.isFinite(offset) || offset < -5000) continue;
    n += 1;
    if (offset < HINT_FIRST_MS) first += 1;
  }
  return n ? { ind: 'fp.hint_first', x: first / n, n } : null;
}

// ── switch cost on mixed IQ items ────────────────────────────────────────────
/** One row for an IQ level: log time on a correct item after a change of skill minus after the same skill (at least 2 of each). */
function switchCostRow(items, trackId) {
  if (trackId !== 'iq') return null;
  const seq = (items || []).filter((i) => i && i.correct !== null && i.correct !== undefined && i.role !== 'retention' && Number(i.ms) > 0 && i.skill_id)
    .sort((a, b) => a.index - b.index);
  const sw = [];
  const rep = [];
  for (let k = 1; k < seq.length; k++) {
    if (seq[k].correct !== true) continue;
    (seq[k].skill_id !== seq[k - 1].skill_id ? sw : rep).push(Math.log(Math.min(Number(seq[k].ms), 180000)));
  }
  if (sw.length < 2 || rep.length < 2) return null;
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  return { ind: 'fp.switch_cost', x: mean(sw) - mean(rep), n: Math.min(sw.length, rep.length) };
}

/** A real (not preview) level closed: the footprints in its answers. Called from hooks.onBlockResolved. */
function onBlock(userId, { session, level, items }) {
  return safely('block', () => {
    if (!may(userId) || !session || session.preview || NOT_PRACTICE.has(session.kind)) return null;
    const rows = [hintFirstRow(items), switchCostRow(items, session.track_id)].filter(Boolean);
    return feed(userId, rows, { level: levelKey(session, level) });
  });
}

// ── the two new in-lesson choices (public/js/session.js) ─────────────────────
const CHOICES = {
  why_or_steps: { ind: 'fp.why_first', pick: { why: 1, steps: 0 } },
  deeper_or_move_on: { ind: 'fp.deeper', pick: { deeper: 1, move: 0 } },
};

/**
 * What the learner chose, sent with the level's close: [{ id, choice }]. At most one of each per level; anything else is ignored. A row is one
 * choice: how long it took is not kept.
 */
function onChoices(userId, { session, level, choices }) {
  return safely('choices', () => {
    if (!Array.isArray(choices) || !may(userId) || !session || session.preview || NOT_PRACTICE.has(session.kind)) return null;
    const rows = [];
    const seen = new Set();
    for (const c of choices.slice(0, 4)) {
      const spec = c && CHOICES[c.id];
      if (!spec || seen.has(c.id) || !Object.prototype.hasOwnProperty.call(spec.pick, String(c.choice))) continue;
      seen.add(c.id);
      rows.push({ ind: spec.ind, x: spec.pick[c.choice], n: 1 });
    }
    return feed(userId, rows, { level: levelKey(session, level) });
  });
}

// ── a retention goal chosen ──────────────────────────────────────────────────
/** A learner saved a retention goal (services/retention-goal.js save): a test date or a bounded horizon reads as planning, forever as none. */
function onRetentionGoal(userId, goal) {
  return safely('retention goal', () => {
    if (!goal || !goal.horizon || !may(userId)) return null;
    return feed(userId, [{ ind: 'fp.retention_choice', x: goal.horizon === 'forever' ? 0 : 1, n: 1 }]);
  });
}

// ── the weekly read of what the app already stores ───────────────────────────
function localDay(ts, tz) { return lazy('../retention-schedule').localDate(ts, tz); }

function minutesOf(s) {
  const a = Date.parse(s.started_at || 0);
  const b = Date.parse(s.ended_at || 0);
  return a && b && b > a ? Math.min(45, (b - a) / 60000) : 0;
}

/** A preview of a level the learner had already passed (the app opens those as previews): a replay. */
const isReplay = (s) => !!s.preview && Number(s.at_level) > Number(s.start_level || 0);

/** Sittings the learner chose to open: not a placement, skip exam, review or enforcer; a preview only when it was a replay of a passed level. */
function ownSittings(sessions) {
  return sessions.filter((s) => !NOT_PRACTICE.has(s.kind) && (!s.preview || isReplay(s)));
}

function extraPracticeRows(sessions, { goalMinutes, tz }) {
  const own = ownSittings(sessions).sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at));
  const spent = {};
  let n = 0;
  let extra = 0;
  for (const s of own) {
    const day = localDay(Date.parse(s.started_at), tz);
    const over = (spent[day] || 0) >= goalMinutes;
    n += 1;
    if (isReplay(s) || over) extra += 1;
    spent[day] = (spent[day] || 0) + minutesOf(s);
  }
  const rows = n ? [{ ind: 'fp.extra_practice', x: extra / n, n }] : [];
  // The first sitting of each day: the learner's own pick, or the app's scheduled review or enforcer.
  const first = {};
  const opened = sessions.filter((x) => x.kind !== 'placement' && x.kind !== 'skip' && (!x.preview || isReplay(x)))
    .sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at));
  for (const s of opened) {
    const day = localDay(Date.parse(s.started_at), tz);
    if (first[day] === undefined) first[day] = PROMPTED_KINDS.has(s.kind) ? 0 : 1;
  }
  const days = Object.values(first);
  if (days.length) rows.push({ ind: 'fp.unprompted_start', x: days.reduce((a, b) => a + b, 0) / days.length, n: days.length });
  return rows;
}

/** The daily-plan goal kept: study days under a goal the learner chose (PUT /api/plan/minutes), active minutes against 80% of it. */
function planKeptRow(userId, since, goalMinutes) {
  if (!goalMinutes) return null;
  const rows = db.find('study_sessions', (s) => s.user_id === userId && Date.parse(s.started_at || 0) >= since);
  const byDay = {};
  for (const s of rows) byDay[s.local_day] = (byDay[s.local_day] || 0) + (Number(s.active_ms) || 0) / 60000;
  const days = Object.values(byDay).filter((m) => m > 0);
  if (!days.length) return null;
  return { ind: 'fp.plan_kept', x: days.filter((m) => m >= 0.8 * goalMinutes).length / days.length, n: days.length };
}

/**
 * A level not passed: how soon the learner worked that level again (minus log of 1 + minutes, capped at two days). Blocks that failed in
 * (from, to]; one not worked again by two days after it counts as the cap. `sessions` are the learner's sessions of the last month.
 */
function retryRow(userId, sessions, { from, to, now }) {
  const mine = sessions.filter((s) => !s.preview && !NOT_PRACTICE.has(s.kind));
  if (!mine.length) return null;
  const ids = new Set(mine.map((s) => s.id));
  const items = db.find('items', (i) => i.user_id === userId && ids.has(i.session_id) && i.role !== 'retention');
  const span = new Map();
  for (const i of items) {
    const k = `${i.session_id}:${i.block || 0}`;
    const t0 = Date.parse(i.created_at || 0);
    const t1 = Date.parse(i.updated_at || i.created_at || 0);
    const cur = span.get(k) || { start: Infinity, end: 0 };
    span.set(k, { start: Math.min(cur.start, t0 || Infinity), end: Math.max(cur.end, t1 || 0) });
  }
  const blocks = [];
  for (const s of mine) {
    for (const b of s.blocks || []) {
      const sp = span.get(`${s.id}:${b.index}`);
      if (!sp || !Number.isFinite(sp.start) || b.kind === 'lesson') continue;
      blocks.push({ enrollment: s.enrollment_id, level: b.level, failed: !!b.resolved && !b.level_complete, start: sp.start, end: sp.end });
    }
  }
  let sum = 0;
  let n = 0;
  for (const f of blocks) {
    if (!f.failed || f.end <= from || f.end > to) continue;
    const next = blocks.filter((o) => o.enrollment === f.enrollment && o.level === f.level && o.start > f.end).sort((a, b) => a.start - b.start)[0];
    const gapMin = next ? (next.start - f.end) / 60000 : (now - f.end >= 2 * DAY ? 2880 : null);
    if (gapMin === null) continue;
    sum += -Math.log1p(Math.min(2880, Math.max(0, gapMin)));
    n += 1;
  }
  return n ? { ind: 'fp.retry_after_fail', x: sum / n, n: Math.min(n, 50) } : null;
}

/**
 * Once a week per learner: the footprints that are read off rows the app already keeps (extra practice, own starts, retries after a fail, the
 * daily goal kept). Called after a sitting finishes (hooks.onSessionFinished). `now` for tests. Returns the rows fed, or null.
 */
function weeklySweep(userId, { now = Date.now() } = {}) {
  return safely('weekly sweep', () => {
    if (!may(userId)) return null;
    const sc = scorecard();
    const card = sc.get(userId);
    if (card.fp_at && now - Date.parse(card.fp_at) < 7 * DAY) return null;
    const since = now - 7 * DAY;
    const all = db.find('sessions', (s) => s.user_id === userId && s.kind !== 'placement' && Date.parse(s.started_at || 0) >= now - 30 * DAY);
    const recent = all.filter((s) => Date.parse(s.started_at || 0) >= since);
    if (!recent.length) return null;
    const user = db.byId('users', userId);
    const plan = lazy('../daily-plan');
    const study = lazy('../study-sessions');
    const goalExplicit = user && user.daily_plan_minutes ? plan.savedMinutes(userId) : null;
    const tz = study.zoneFor(userId);
    const rows = [
      ...extraPracticeRows(recent, { goalMinutes: plan.savedMinutes(userId), tz }),
      planKeptRow(userId, since, goalExplicit),
      retryRow(userId, all, { from: Math.max(Date.parse(card.fp_retry_to || 0) || 0, now - 9 * DAY), to: now - 2 * DAY, now }),
    ].filter(Boolean);
    const fed = feed(userId, rows, { now });
    db.update('scorecards', sc.get(userId).id, { fp_at: new Date(now).toISOString(), fp_retry_to: new Date(now - 2 * DAY).toISOString() });
    prune(now);
    return fed;
  });
}

/** Drop footprint rows older than KEEP_DAYS. Returns how many went. */
function prune(now = Date.now()) {
  const cut = now - KEEP_DAYS * DAY;
  return db.remove('footprint_events', (r) => Date.parse(r.at || 0) < cut);
}

module.exports = {
  may, choicesOffered, feed, onBlock, onChoices, onRetentionGoal, weeklySweep, prune,
  hintFirstRow, switchCostRow, extraPracticeRows, planKeptRow, retryRow, ownSittings, KEEP_DAYS, HINT_FIRST_MS,
};
