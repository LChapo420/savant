/**
 * Retention enforcers (curriculum-build/RETENTION-ENFORCERS.md): a short
 * retrieval sitting that locks in what the learner did in one study session
 * ("End session"), one whole day ("End day session"), or the window of a
 * scheduled enforcer (semi-weekly, weekly, bi-weekly, monthly; the days come
 * from services/retention-schedule.js).
 *
 *   tiers      quick, medium, full, or no enforcer. A tier's time is its share of
 *              the covered ACTIVE time (study-sessions.js): full under 10%
 *              (retention-params FULL_CAP), quick and medium shorter. A tier
 *              whose time does not fit one question is not offered.
 *   content    only from what the learner actually did in the covered window:
 *              every question targets an objective (or skill) one of their
 *              window answers was on. A question written for that objective
 *              first (services/objective-items.js), then the bank's question on
 *              its skill, then one of their own checks from the window again.
 *              Ranked by predicted forgetting (adaptation.predictedRecall on the
 *              coverage record), errors in the window, and memory checks the
 *              coverage gate is waiting on (scheduled scopes); mixed across
 *              skills.
 *   allocation one plan over the whole covered pool, never a per-scope quota
 *              added up (retention-enforcer-params.json allocation): one first
 *              try per topic; a second, varied one (a new question on the same
 *              objective, late in the sitting) only for fragile topics (a miss,
 *              a confident error, a high miss rate, low recall at the horizon)
 *              on medium and full; every slot ranked by value per cost, the
 *              second worth a fraction of the first; mature topics last.
 *   absorbing  the widest enforcer on a day absorbs the narrower ones and that
 *              day's end-of-day enforcer (services/retention-schedule.js): on a
 *              scheduled day "End day session" is that one enforcer (the week,
 *              the semi-week and the day together on a weekly's day), sized by
 *              the combined budget (retention-params combinedBudgetMs).
 *   results    every answer goes through the ordinary answer route, so it lands
 *              in mastery (the review schedule) and the scorecard; the items
 *              carry their objective as a test of it, so coverage reads them as
 *              retrieval evidence. Nothing moves a level (sessions are previews).
 *   resume     an enforcer left unchosen or half done is offered again on return,
 *              before the next study session starts: finish it, choose a tier
 *              (again), or none. Session ones are offered for 24 hours, day
 *              ones for 48, then roll into the next scheduled enforcer.
 *   owner      config/owner.js ownerBase: the base version. Enforcers are there,
 *              but not tailored: no ranking by the owner's record (the window's
 *              work in time order, spread evenly), the standard question time
 *              rather than their own, and they can skip any enforcer.
 *
 * Off with RETENTION_ENFORCERS=off (every route answers 404, the daily review
 * comes back as it was).
 */
const db = require('../config/db');
const curriculum = require('../config/curriculum');
const bank = require('../content/bank');
const owner = require('../config/owner');
const schedule = require('./retention-schedule');
const params = require('./retention-params');
const study = require('./study-sessions');
const coverage = require('./coverage');
const adaptation = require('./adaptation');
const mastery = require('./mastery');
const objItems = require('./objective-items');

const DAY = 24 * 3600 * 1000;
const FINAL = new Set(['done', 'declined', 'skipped', 'stopped', 'expired', 'empty', 'merged']);
const SCHEDULED = new Set(['semiweekly', 'weekly', 'biweekly', 'monthly']);
const WIDTH = { session: 0, day: 0.5, semiweekly: 1, weekly: 2, biweekly: 3, monthly: 4 };

function enabled() { return study.enabled(); }

/** Fold the daily review into this system (its own row and page go, its older work stays): on unless ENFORCER_FOLD_REVIEW=off. */
function foldsReview() {
  return enabled() && String(process.env.ENFORCER_FOLD_REVIEW || 'on').toLowerCase() !== 'off';
}

const isBase = (userId) => owner.ownerBase(userId);
const iso = (t) => new Date(t).toISOString();

// ── what the learner did in a window ──────────────────────────────────────

function answeredAt(i) {
  const t = Date.parse(i.answered_at || i.updated_at || i.created_at);
  return Number.isFinite(t) ? t : 0;
}

/**
 * The learner's answered items in a window: {from_ms, to_ms} (a study
 * session) and/or {from_date, to_date} (local dates, inclusive, in `tz`).
 * Placement, Challenge Exam and enforcer answers are not "what they did";
 * skipped, set-aside and unanswered questions are not answers.
 */
function windowItems(userId, win, tz) {
  const sessions = new Map(db.find('sessions', (s) => s.user_id === userId).map((s) => [s.id, s]));
  const out = [];
  for (const i of db.find('items', (x) => x.user_id === userId && x.correct !== null && x.correct !== undefined)) {
    if (i.enforcer_id || i.skipped || i.reserved || i.dropped) continue;
    const s = i.session_id != null ? sessions.get(i.session_id) : null;
    if (s && (s.kind === 'placement' || s.kind === 'skip' || s.kind === 'enforcer')) continue;
    const t = answeredAt(i);
    if (!t) continue;
    if (win.from_ms !== undefined && t < win.from_ms) continue;
    if (win.to_ms !== undefined && t > win.to_ms) continue;
    if (win.from_date || win.to_date) {
      const d = schedule.localDate(t, tz);
      if (win.from_date && d < win.from_date) continue;
      if (win.to_date && d > win.to_date) continue;
    }
    const track = (s && s.track_id) || i.track_id || null;
    const gradeId = (s && s.grade_id) || i.grade_id || null;
    if (!track || !gradeId || !i.skill_id) continue;
    out.push({ item: i, t, track_id: track, grade_id: gradeId, session: s });
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Active time in a window: its study sessions' clocks; with none, the answering time itself. */
function activeMs(userId, win, rows) {
  if (win.study_session_ids && win.study_session_ids.length) {
    return win.study_session_ids.reduce((sum, id) => sum + (Number((db.byId('study_sessions', id) || {}).active_ms) || 0), 0);
  }
  if (win.from_date) {
    const list = study.inDays(userId, win.from_date, win.to_date || win.from_date);
    const total = list.reduce((sum, s) => sum + (Number(s.active_ms) || 0), 0);
    if (total > 0) return total;
  }
  const c = params.load().cost;
  return rows.reduce((sum, r) => sum + Math.min(c.item_ms_max, Math.max(0, Number(r.item.ms) || 0)) + c.feedback_right_ms, 0);
}

/**
 * What one question costs this learner, per format: their own median answer
 * time once they have `median_after` timed answers in that format, else the
 * format's default. The owner's base version always uses the defaults.
 */
function costModel(userId, base = isBase(userId), now = Date.now()) {
  const c = params.load().cost;
  const medians = {};
  const slow = {};
  if (!base) {
    const rapid = coverage.knobs().RAPID_MS;
    const by = {};
    for (const i of db.find('items', (x) => x.user_id === userId && x.correct !== null && x.correct !== undefined && Number(x.ms) > rapid && answeredAt(x) >= now - 60 * DAY)) {
      const f = i.format || 'other';
      (by[f] = by[f] || []).push(Number(i.ms));
    }
    for (const [f, list] of Object.entries(by)) {
      list.sort((a, b) => a - b);
      const med = list[Math.floor(list.length / 2)];
      slow[f] = med * 2;
      if (list.length >= c.median_after) medians[f] = Math.min(c.item_ms_max, med);
    }
  }
  const fmtMs = (format) => medians[format] || c.formats_ms[format] || c.other_ms;
  return { medians, slow, fmtMs };
}

/** Planned cost of one question: answer + expected feedback + (when the tier retries) an expected retry. */
function costOf(format, p, attempts, model) {
  const c = params.load().cost;
  const pr = Math.max(0, Math.min(1, Number.isFinite(p) ? p : 0.8));
  const one = model.fmtMs(format) + pr * c.feedback_right_ms + (1 - pr) * c.feedback_wrong_ms;
  return Math.round(one + (attempts > 1 ? (1 - pr) * one : 0));
}

// ── units: what one question is about ─────────────────────────────────────

/** The coverage record per (track, grade) for this learner, read once. */
function recordCache(userId) {
  const cache = new Map();
  return (trackId, gradeId) => {
    const key = `${trackId}/${gradeId}`;
    if (cache.has(key)) return cache.get(key);
    const enrollment = db.findOne('enrollments', (e) => e.user_id === userId && e.track_id === trackId && e.grade_id === gradeId);
    let rec = null;
    try {
      if (enrollment) rec = adaptation.recordFor(userId, enrollment);
    } catch { rec = null; }
    const model = rec ? rec.report.model : coverage.modelFor(trackId, gradeId);
    const entry = { enrollment, rec, model: model && model.objectives && model.objectives.length ? model : null };
    cache.set(key, entry);
    return entry;
  };
}

/**
 * Group the window's answers into units: one objective (when the grade has an
 * objective model and the answer speaks for one), else one skill in that grade.
 */
function unitsFrom(userId, rows) {
  const recFor = recordCache(userId);
  const units = new Map();
  for (const r of rows) {
    const { item } = r;
    const ctx = recFor(r.track_id, r.grade_id);
    let objective = null;
    let oi = -1;
    if (ctx.model) {
      const shares = coverage.attribute(ctx.model, {
        objective: item.objective_id || null, level: Number(item.level) || (r.session && r.session.level) || null, role: item.role || null, skill: item.skill_id,
      });
      if (shares.length) {
        const top = shares.slice().sort((a, b) => b.w - a.w || a.i - b.i)[0];
        oi = top.i;
        objective = ctx.model.objectives[oi].id;
      }
    }
    const key = objective ? `${r.track_id}/${r.grade_id}/o:${objective}` : `${r.track_id}/${r.grade_id}/s:${item.skill_id}`;
    let u = units.get(key);
    if (!u) {
      u = {
        key, track_id: r.track_id, grade_id: r.grade_id, enrollment_id: ctx.enrollment ? ctx.enrollment.id : null,
        objective, oi, skill: objective ? ctx.model.objectives[oi].skill || item.skill_id : item.skill_id,
        level: Number(item.level) || null, first_t: r.t, last_t: r.t, n: 0, wrong: 0, items: [], last: null, formats: {},
      };
      units.set(key, u);
    }
    u.n += 1;
    if (!item.correct) u.wrong += 1;
    if (r.t >= u.last_t) { u.last_t = r.t; u.last = item; }
    if (Number(item.level)) u.level = Number(item.level);
    const f = item.format || 'other';
    u.formats[f] = (u.formats[f] || 0) + 1;
    u.items.push(item.id);
  }
  return { units: [...units.values()], recFor };
}

/** Objectives (or skills) answered right in an enforcer in the last 20 hours: not asked again so soon. */
function recentlyKept(userId, now) {
  const since = now - params.load().selection.recent_enforcer_ms;
  const out = new Set();
  for (const i of db.find('items', (x) => x.user_id === userId && x.enforcer_id && x.correct === true && !x.requeue_of && answeredAt(x) >= since)) {
    out.add(i.objective_id ? `${i.track_id}/${i.grade_id}/o:${i.objective_id}` : `${i.track_id}/${i.grade_id}/s:${i.skill_id}`);
  }
  return out;
}

/**
 * P5 (eligible_but_left_out_last_time; ENFORCER_LEFT_OUT_FLAG, on unless off):
 * for each topic, how many of the learner's latest planned enforcers in a row
 * had it eligible in their pool but did not ask it (each plan stores its
 * `left_out` keys). A plan that asked it ends the run. `exclude`: the enforcer
 * being planned. Null when the switch is off.
 */
function leftOutCounts(userId, exclude = null) {
  if (!params.on('ENFORCER_LEFT_OUT_FLAG')) return null;
  const planned = db.find('enforcers', (e) => e.user_id === userId && e.id !== exclude && Array.isArray(e.left_out))
    .sort((a, b) => b.id - a.id).slice(0, 20);
  const runs = new Map();
  for (const e of planned) {
    for (const k of Object.keys(e.units || {})) { const s = runs.get(k); if (!s) runs.set(k, { n: 0, done: true }); else s.done = true; }
    for (const k of e.left_out) { const s = runs.get(k); if (!s) runs.set(k, { n: 1, done: false }); else if (!s.done) s.n += 1; }
  }
  const out = new Map();
  for (const [k, s] of runs) if (s.n) out.set(k, s.n);
  return out;
}

/** P3: the skills whose end-of-sitting retention questions were left to these study sessions' enforcer. */
function deferredOf(studyIds) {
  if (!params.on('ENFORCER_DEFER_SITTING_RETENTION') || !Array.isArray(studyIds) || !studyIds.length) return null;
  const out = new Set();
  for (const id of studyIds) for (const k of (db.byId('study_sessions', id) || {}).retention_deferred || []) out.add(k);
  return out;
}

/**
 * P3 (evidence-article/02-retention-review.md; ENFORCER_DEFER_SITTING_RETENTION,
 * on unless off): with retention enforcers on and a study session open that
 * holds this sitting's answers, the sitting's own end-of-sitting retention set
 * (up to 3 questions straight away) is not asked. The session enforcer asks the
 * same window's topics when the study session ends, later and oldest first; the
 * skills of the set that were missed in the sitting are kept on the study
 * session (`retention_deferred`) and flagged there (flags.deferred_retention).
 * The per-level retention question is unchanged. Never for the owner's base
 * version, an enforcer sitting, or with no open study session. Returns true
 * when the set is deferred.
 */
function deferSittingRetention(userId, session, retentionPlan, sittingItems, { now = Date.now() } = {}) {
  try {
    if (!params.on('ENFORCER_DEFER_SITTING_RETENTION') || !enabled() || isBase(userId)) return false;
    if (!session || session.kind === 'enforcer') return false;
    const open = study.current(userId, now);
    if (!open) return false;
    const from = Date.parse(open.started_at) || 0;
    const answered = (sittingItems || []).filter((i) => i.correct !== null && i.correct !== undefined && i.role !== 'retention');
    if (!answered.some((i) => answeredAt(i) >= from)) return false;
    const missed = new Set(answered.filter((i) => i.correct === false).map((i) => i.skill_id));
    const keys = (retentionPlan || []).filter((x) => x && missed.has(x.skillId) && session.track_id && session.grade_id)
      .map((x) => `${session.track_id}/${session.grade_id}/${x.skillId}`);
    const kept = new Set([...(open.retention_deferred || []), ...keys]);
    db.update('study_sessions', open.id, { retention_deferred: [...kept] });
    db.update('sessions', session.id, { retention_deferred_to: open.id });
    return true;
  } catch (err) {
    console.warn(`deferring the sitting's retention set failed: ${err.message}`);
    return false;
  }
}

/**
 * Score each unit (selection.step_2_score): need = 1 - p_H, recall at the
 * scope's horizon, times d(p_now), the desirable-difficulty window, plus the
 * flags (last answer wrong, a confident error, right but slow or unsure, no
 * delayed retrieval yet; left out of the last enforcers, P5; a skill whose
 * sitting retention set was deferred to this enforcer, P3). p comes from the coverage record and the forgetting
 * curve (adaptation.predictedRecall); a unit with no objective reads the
 * skill's mastery. Eligibility (step 1) is soft here: a unit inside the
 * scope's minimum lag, or kept in an enforcer in the last 20 hours, goes after
 * the eligible ones instead of out, so a short window still has its questions.
 * The owner's base version: none of this; every unit at p = 0.8, in time order.
 */
function score(userId, units, recFor, { scope, now, base, model, dayDate = null, tz = 'UTC', studyIds = [], exclude = null }) {
  const p = params.load();
  const sp = p.scopes[scope] || p.scopes.session;
  const dw = params.windowOf(p);
  const flags = p.selection.flags;
  const al = p.allocation;
  const recent = base ? new Set() : recentlyKept(userId, now);
  const deferred = base ? null : deferredOf(studyIds);
  const leftOut = base ? null : leftOutCounts(userId, exclude);
  for (const u of units) {
    u.lag_ms = now - u.last_t;
    if (base) { u.p_now = 0.8; u.p_h = 0.8; u.score = 0; u.eligible = true; u.fragile = false; u.mature = false; continue; }
    const ctx = recFor(u.track_id, u.grade_id);
    let pNow = 0.5;
    let pH = 0.4;
    let delayed = true;
    let checks = 0;
    if (u.objective && ctx.rec) {
      const states = ctx.rec.report.states;
      const s = states[u.oi];
      const { m } = adaptation.memoryAdjust(states);
      if (s && s.last_at) {
        pNow = adaptation.predictedRecall(s, now, ctx.rec.curve, m);
        pH = adaptation.predictedRecall(s, now + sp.horizon_days * DAY, ctx.rec.curve, m);
      }
      delayed = !!(s && (s.checks || 0) > 0);
      checks = (s && s.checks) || 0;
    } else {
      const st = mastery.stateFor(userId, u.skill);
      pNow = Math.max(0.05, Math.min(0.97, Number(st.mastery) || 0.5));
      pH = pNow * 0.85;
    }
    // 1 for 0.50 <= p_now <= 0.95, 0.6 below, 0.3 above (retention-params windowOf).
    const d = params.difficultyWeight(pNow, dw);
    const last = u.last || {};
    const slowAt = model.slow[last.format || 'other'] || Infinity;
    let f = 0;
    if (last.correct === false) f += flags.last_wrong;
    if (last.correct === false && last.confidence === 'sure') f += flags.high_confidence_error;
    const unsure = last.correct === true && (last.confidence === 'guess' || last.confidence === 'think' || Number(last.ms) > slowAt);
    if (unsure) f += flags.slow_or_unsure;
    if (!delayed) f += flags.no_delayed_retrieval;
    // P3: a skill that wobbled in a sitting whose retention set was left to this enforcer.
    u.deferred = !!(deferred && deferred.size && (deferred.has(`${u.track_id}/${u.grade_id}/${u.skill}`) || deferred.has(`${u.track_id}/${u.grade_id}/${last.skill_id}`)));
    if (u.deferred && last.correct !== false && !unsure) f += flags.deferred_retention;
    // P5: eligible in the learner's last enforcers but not chosen.
    u.left_out = (leftOut && leftOut.get(u.key)) || 0;
    if (u.left_out) f += flags.left_out * Math.min(1, u.left_out / flags.left_out_saturates_at);
    u.p_now = Number(pNow.toFixed(3));
    u.p_h = Number(pH.toFixed(3));
    u.score = (1 - pH) * d + f;
    // allocation.age and .fragile: who may earn a second try in this sitting.
    const missRate = u.n ? u.wrong / u.n : 0;
    u.checks = checks;
    u.mature = checks >= al.mature.checks_at_least && pNow >= al.mature.p_now_at_least && last.correct === true;
    u.fragile = !u.mature && (last.correct === false || pNow < al.fragile.p_now_below
      || (u.n >= al.fragile.min_answers && missRate >= al.fragile.miss_rate_at_least));
    // On an absorbed day, the day's own work keeps the end-of-day lag (30 min), not the scheduled scope's day.
    const own = dayDate && schedule.localDate(u.last_t, tz) >= dayDate;
    const minLag = own ? Math.min(sp.min_lag_ms, p.scopes.day.min_lag_ms) : sp.min_lag_ms;
    u.eligible = u.lag_ms >= minLag && !recent.has(u.key);
  }
  return units;
}

/** The usual format of a unit's questions (what its question will most likely be). */
function formatOf(u) {
  if (u.objective) return 'multiple_choice';
  const top = Object.entries(u.formats).sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : 'multiple_choice';
}

/** Units in the order a budget is filled: eligible first, then score per cost (greedy); the owner: time order. */
function fillOrder(units, { base, attempts, model }) {
  if (base) return units.slice().sort((a, b) => a.first_t - b.first_t);
  const ratio = (u) => u.score / costOf(formatOf(u), u.p_now, attempts, model);
  return units.slice().sort((a, b) => (Number(b.eligible) - Number(a.eligible)) || (ratio(b) - ratio(a)));
}

/**
 * The allocation rule (retention-enforcer-params.json allocation): every slot
 * a plan can hold, in the order a budget takes them. A slot is one first try
 * on a topic: k = 1 for every topic, k = 2 (a second, varied question later
 * in the sitting) for a fragile topic on a tier that allows it, up to the
 * scope's max_first. Value: the topic's score for k = 1, second_value (0.35)
 * of it for k = 2. Order: eligible first, then value per planned cost, so a
 * fragile topic's second try can beat a secure topic's first, and one plan
 * serves however many scopes the enforcer covers. Each entry of `plan` is
 * {key, eligible, score, fragile, cost, cost_retry}. The owner's base
 * version: one slot per topic, in the order given (time order).
 */
function slots(plan, { scope, tier, base = false, attempts = 1 }) {
  const al = params.load().allocation;
  const second = !base && (al.max_first[scope] || 1) >= 2 && al.second_tiers.includes(tier);
  const out = [];
  (plan || []).forEach((u, i) => {
    const cost = attempts > 1 ? u.cost_retry : u.cost;
    out.push({ key: u.key, k: 1, i, eligible: !!u.eligible, value: u.score || 0, cost });
    if (second && u.fragile) out.push({ key: u.key, k: 2, i, eligible: !!u.eligible, value: al.second_value * (u.score || 0), cost });
  });
  if (base) return out;
  return out.sort((a, b) => (Number(b.eligible) - Number(a.eligible)) || (b.value / Math.max(1, b.cost) - a.value / Math.max(1, a.cost)) || a.k - b.k || a.i - b.i);
}

/** The base version, when not everything fits: spread evenly over the window in time order. */
function spread(list, n) {
  if (n >= list.length) return list;
  const out = [];
  for (let k = 0; k < n; k++) out.push(list[Math.floor((k * list.length) / n)]);
  return out;
}

/** Time already spent in enforcers today (the daily cap). */
function spentToday(userId, now) {
  const tz = study.zoneFor(userId);
  const today = schedule.localDate(now, tz);
  return db.find('enforcers', (e) => e.user_id === userId && e.local_day === today && e.elapsed_ms)
    .reduce((s, e) => s + (e.elapsed_ms || 0), 0);
}

/** A tier's budget for this enforcer: the params' rule, inside the day's cap. */
function budgetFor(enf, tier) {
  // An enforcer that absorbed others (a weekly with its semi-weekly and its day; any scheduled one with its day; a late merge): the combined budget.
  const b = Array.isArray(enf.parts) && enf.parts.length > 1
    ? params.combinedBudgetMs(enf.parts, tier, enf.base_active_ms || 0)
    : params.budgetMs(enf.scope, tier, enf.base_active_ms || 0);
  const left = Math.max(0, params.load().daily_cap_ms - (enf.spent_today_ms || 0));
  return Math.min(b, left);
}

/** How many questions a tier's budget holds under the allocation rule (slots), on how many topics, and their planned time. */
function fit(enf, tier) {
  const attempts = params.attemptsFor(enf.scope, tier);
  const budget = budgetFor(enf, tier);
  let used = 0;
  let n = 0;
  const firsts = new Set();
  for (const x of slots(enf.unit_plan || [], { scope: enf.scope, tier, base: !!enf.base, attempts })) {
    if (x.k === 2 && !firsts.has(x.key)) continue;
    if (used + x.cost > budget) continue;
    used += x.cost;
    n += 1;
    if (x.k === 1) firsts.add(x.key);
  }
  return { n, used, budget, attempts, topics: firsts.size };
}

/**
 * The tiers as the card shows them. While an enforcer is waiting to be chosen,
 * each tier's count, topics and minutes are its drafted plan (draftsOf): the
 * very questions `plan` will serve, so "6 questions" is 6 questions. (fit()
 * alone is an estimate from the usual format of each topic; the questions
 * actually found can cost more, or not exist, which is how a card promised 6
 * and served 3, or offered 1 and then found none.) On a half-done enforcer a
 * tier can only keep or drop questions already planned, so its count is capped
 * by them.
 */
function options(enf) {
  const pool = (enf.unit_plan || []).length;
  const d = enf.status === 'choosing' ? draftsOf(enf) : null;
  const planned = enf.status === 'running' ? itemsOf(enf) : null;
  return params.TIERS.map((tier) => {
    const f = fit(enf, tier);
    const t = d && d.tiers ? d.tiers[tier] : null;
    let n = f.n;
    let used = f.used;
    let topics = f.topics;
    if (t) {
      n = t.slots.length;
      used = t.spent;
      topics = t.topics;
    } else if (planned) {
      n = Math.min(f.n, planned.length);
      used = Math.min(f.used, planned.slice(0, n).reduce((s, i) => s + (i.planned_cost_ms || 0), 0));
      topics = Math.min(f.topics, new Set(planned.slice(0, n).map((i) => i.enforcer_unit)).size);
    }
    const need = tier === 'quick' || pool < 2 ? 1 : 2;
    return {
      tier,
      items: n,
      topics,
      minutes: Number((used / 60000).toFixed(1)),
      budget_minutes: Number((f.budget / 60000).toFixed(1)),
      retries: f.attempts > 1,
      available: n >= need,
    };
  });
}

/**
 * The tier offered first (choice_resume_merge.default_preselected_tier):
 * medium; full when two or more objectives were last answered wrong or the
 * mean recall at the horizon is under 0.75; quick when the session was under
 * 15 minutes or the learner chose quick the last three times. Only an
 * available tier.
 */
function defaultTier(enf) {
  const p = params.load().default_tier;
  const opts = options(enf).filter((o) => o.available).map((o) => o.tier);
  if (!opts.length) return 'none';
  let want = 'medium';
  const pool = enf.unit_plan || [];
  const wrong = pool.filter((u) => u.last_wrong).length;
  const meanH = pool.length ? pool.reduce((s, u) => s + u.p_h, 0) / pool.length : 1;
  if (!enf.base && (wrong >= p.full_wrong_objectives || meanH < p.full_mean_p_h)) want = 'full';
  const lastThree = db.find('enforcers', (e) => e.user_id === enf.user_id && e.id !== enf.id && e.tier && e.tier !== 'none').slice(-3);
  if ((enf.scope === 'session' && (enf.base_active_ms || 0) < p.quick_below_ms) || (lastThree.length === 3 && lastThree.every((e) => e.tier === 'quick'))) want = 'quick';
  if (opts.includes(want)) return want;
  return opts[opts.length - 1];
}

// ── questions ─────────────────────────────────────────────────────────────

function askedBefore(userId) {
  return new Set(db.find('items', (i) => i.user_id === userId).slice(-600).map((i) => bank.itemKey(i)));
}

function difficultyAt(trackId, gradeId, level, fallback = 5) {
  const grade = curriculum.getGrade(trackId, gradeId);
  if (!grade || !level) return fallback;
  try { return Math.max(1, Math.min(10, Math.round(curriculum.levelPlan(grade, level).difficulty * 10) / 10)); } catch { return fallback; }
}

/** One of the learner's own window questions on this unit, asked again (a miss first, then the latest). */
function ownCheck(u, used) {
  const rows = u.items.map((id) => db.byId('items', id)).filter((i) => i && i.prompt && i.answer !== undefined && i.answer !== null && !used.has(`own:${i.id}`));
  if (!rows.length) return null;
  const pick = rows.find((i) => !i.correct) || rows[rows.length - 1];
  used.add(`own:${pick.id}`);
  return {
    skill_id: pick.skill_id, skill_name: pick.skill_name || null, difficulty: pick.difficulty || 5, format: pick.format,
    prompt: pick.prompt, passage: pick.passage || null, fen: pick.fen || null, choices: pick.choices || null,
    answer: pick.answer, rationale: pick.rationale || null, accepts: pick.accepts || undefined, source: 'own_check', source_item_id: pick.id,
  };
}

/**
 * A question on one unit, never one already in this enforcer: written for the
 * objective first, then the bank's question on its skill, then the learner's
 * own check from the window. On scheduled scopes the exact instance from the
 * window is used only when nothing else exists (selection.item_instance).
 */
function questionFor(u, avoid, used, shapes, { scope = 'session', varied = false } = {}) {
  const difficulty = difficultyAt(u.track_id, u.grade_id, u.level);
  if (u.objective) {
    const q = objItems.pick({ trackId: u.track_id, gradeId: u.grade_id, objectiveId: u.objective, avoid, seenShapes: shapes, difficulty });
    if (q) return { ...q, skill_id: q.skill_id || u.skill };
    // A second (varied) try is a new question on the same objective, or none.
    if (varied) return null;
  }
  if (u.skill) {
    try {
      // Held to the grade's range and standard (config/grade-skills.js fitEntry).
      const grade = curriculum.getGrade(u.track_id, u.grade_id);
      const entry = { skillId: u.skill, difficulty, role: 'review' };
      // eslint-disable-next-line global-require
      const q = require('./sessions').generateWithPreference(grade ? require('../config/grade-skills').fitEntry(grade, entry) : entry, false, avoid);
      if (q && !avoid.has(bank.itemKey(q))) return { ...q, source: q.source || 'bank' };
    } catch { /* no bank generator for this skill */ }
  }
  if (varied) return null; // never the learner's own check again as a "varied" try
  const q = ownCheck(u, used);
  if (q && !used.has(bank.itemKey(q))) return { ...q, reused_instance: SCHEDULED.has(scope) };
  return null;
}

// ── creating and planning ─────────────────────────────────────────────────

/** Measure a window and store the enforcer for it (status `choosing`, or `empty` when nothing fits). */
function create(userId, { scope, win, covers = [], studyIds = [], dayStudyIds = [], status = 'choosing', late = false, now = Date.now() }) {
  const tz = study.zoneFor(userId);
  const rows = windowItems(userId, win, tz);
  const base = isBase(userId);
  const model = costModel(userId, base, now);
  const { units, recFor } = unitsFrom(userId, rows);
  // A scheduled enforcer absorbs its day's end-of-day enforcer and, on a shared
  // day, the narrower scheduled ones: one part per absorbed scope, each on its
  // own window (allocation.budget.combined).
  const scheduled = covers.filter((c) => SCHEDULED.has(c.type));
  const dayDate = scheduled.length ? scheduled.reduce((m, c) => (c.date > m ? c.date : m), scheduled[0].date) : null;
  let parts = null;
  if (scheduled.length) {
    const spans = new Map();
    for (const c of scheduled) {
      const x = spans.get(c.type);
      if (!x || c.from_date < x.from_date) spans.set(c.type, { from_date: c.from_date, to_date: c.to_date });
    }
    spans.set('day', { from_date: dayDate, to_date: dayDate });
    parts = [...spans.entries()].map(([type, w]) => {
      const inPart = rows.filter((r) => { const d = schedule.localDate(r.t, tz); return d >= w.from_date && d <= w.to_date; });
      return { scope: type, from_date: w.from_date, to_date: w.to_date, active_ms: Math.round(inPart.length ? activeMs(userId, w, inPart) : 0) };
    });
  }
  score(userId, units, recFor, { scope, now, base, model, dayDate, tz, studyIds });
  const order = fillOrder(units, { base, attempts: 1, model });
  const enf = {
    user_id: userId,
    scope,
    status,
    base,
    late,
    covers,
    study_session_ids: studyIds,
    window: { from_date: win.from_date || null, to_date: win.to_date || null, from_ms: win.from_ms === undefined ? null : win.from_ms, to_ms: win.to_ms === undefined ? null : win.to_ms },
    local_day: schedule.localDate(now, tz),
    tz,
    base_active_ms: Math.round(activeMs(userId, { ...win, study_session_ids: studyIds }, rows)),
    spent_today_ms: spentToday(userId, now),
    parts,
    day_date: dayDate,
    absorbs: parts ? parts.map((x) => x.scope).filter((x) => x !== scope) : [],
    unit_plan: order.map((u) => ({
      key: u.key, p_now: u.p_now, p_h: u.p_h, score: Number((u.score || 0).toFixed(3)), eligible: u.eligible, last_wrong: !!(u.last && u.last.correct === false),
      fragile: !!u.fragile, mature: !!u.mature, left_out: u.left_out || 0, deferred: !!u.deferred,
      cost: costOf(formatOf(u), u.p_now, 1, model), cost_retry: costOf(formatOf(u), u.p_now, 2, model),
    })),
    unit_count: units.length,
    answered_in_window: rows.length,
    tier: null,
    order: [],
    session_ids: [],
    elapsed_ms: 0,
    requeues: 0,
    offered_at: iso(now),
    params_source: params.load().source,
  };
  if (dayStudyIds && dayStudyIds.length) enf.day_study_session_ids = dayStudyIds;
  if (!rows.length) { enf.status = 'empty'; enf.reason = 'nothing_answered'; return db.insert('enforcers', enf); }
  // Too short even on paper: no tier's time holds one question.
  if (!params.TIERS.some((t) => fit(enf, t).n >= 1)) { enf.status = 'empty'; enf.reason = 'too_short'; return db.insert('enforcers', enf); }
  const row = db.insert('enforcers', enf);
  if (row.status !== 'choosing') return row;
  // The tiers' real questions (draftsOf), so the card offers only what can be served.
  // None at all (nothing to ask on this window's work) closes it as empty, calmly, instead of offering tiers that fail.
  if (!options(row).some((o) => o.available)) {
    return db.update('enforcers', row.id, { status: 'empty', reason: row.drafts && row.drafts.found ? 'too_short' : 'no_questions', drafts: null });
  }
  return db.byId('enforcers', row.id);
}

/** The window an enforcer row covers, for windowItems. */
function winOf(enf) {
  const w = enf.window || {};
  const out = {};
  if (w.from_ms !== null && w.from_ms !== undefined) out.from_ms = w.from_ms;
  if (w.to_ms !== null && w.to_ms !== undefined) out.to_ms = w.to_ms;
  if (w.from_date) out.from_date = w.from_date;
  if (w.to_date) out.to_date = w.to_date;
  return out;
}

/**
 * Build the questions for a tier (selection.step_3_fill and step_4_order):
 * fill the tier's budget greedily, one first attempt per objective, with each
 * question's real planned cost; then interleave by skill (session scope:
 * oldest exposure first), and close on one the curve expects right.
 */
/** What `plan` and insertItem need of a unit, small enough to keep on the row. */
function slimUnit(u) {
  return {
    key: u.key, track_id: u.track_id, grade_id: u.grade_id, enrollment_id: u.enrollment_id || null, objective: u.objective || null, oi: u.oi,
    skill: u.skill, level: u.level || null, p_now: u.p_now, eligible: !!u.eligible, last_t: u.last_t, items: (u.items || []).slice(-20),
  };
}

/**
 * Draft every tier's questions at once (selection.step_3_fill and step_4_order),
 * without writing anything: fill each tier's budget greedily, one first attempt
 * per objective, with each question's real cost (its own format, not the
 * topic's usual one); then interleave by skill (session scope: oldest exposure
 * first), and close on one the curve expects right. A topic's question is drawn
 * once and shared by the tiers that take it, so the draft is no bigger than the
 * full tier. Returns { at, tiers: {tier: {slots: [{key, k, c}], spent, budget,
 * attempts, topics, seconds, left_out}}, questions: {"key|k": q}, units }.
 */
function draftAll(userId, enf, { now = Date.now() } = {}) {
  const rows = windowItems(userId, winOf(enf), enf.tz || study.zoneFor(userId));
  const base = !!enf.base;
  const model = costModel(userId, base, now);
  const { units, recFor } = unitsFrom(userId, rows);
  score(userId, units, recFor, {
    scope: enf.scope, now, base, model, dayDate: enf.day_date || null, tz: enf.tz || study.zoneFor(userId),
    studyIds: [...(enf.study_session_ids || []), ...(enf.day_study_session_ids || [])], exclude: enf.id || null,
  });
  const avoid = askedBefore(userId);
  const used = new Set();
  const shapes = new Set();
  const drawn = new Map();
  const qOf = (u, k) => {
    const id = `${u.key}|${k}`;
    if (!drawn.has(id)) {
      const q = questionFor(u, avoid, used, shapes, { scope: enf.scope, varied: k === 2 });
      if (q) { avoid.add(bank.itemKey(q)); used.add(bank.itemKey(q)); }
      drawn.set(id, q || null);
    }
    return drawn.get(id);
  };
  const byKey = new Map(units.map((u) => [u.key, u]));
  const tiers = {};
  // The widest tier first, so the narrower ones reuse its questions.
  for (const tier of params.TIERS.slice().reverse()) {
    const attempts = params.attemptsFor(enf.scope, tier);
    const budget = budgetFor(enf, tier);
    // The allocation rule: one plan over the whole pool (slots), whatever it absorbed.
    let list;
    if (base) list = spread(fillOrder(units, { base, attempts, model }), fit(enf, tier).n).map((u) => ({ u, k: 1 }));
    else {
      const entries = units.map((u) => ({ key: u.key, eligible: u.eligible, score: u.score, fragile: u.fragile, cost: costOf(formatOf(u), u.p_now, 1, model), cost_retry: costOf(formatOf(u), u.p_now, 2, model) }));
      list = slots(entries, { scope: enf.scope, tier, base, attempts }).map((x) => ({ u: byKey.get(x.key), k: x.k }));
    }
    const chosen = [];
    const firstOf = new Set();
    let spent = 0;
    for (const { u, k } of list) {
      if (!u || (k === 2 && !firstOf.has(u.key))) continue;
      const q = qOf(u, k);
      if (!q) continue;
      const c = costOf(q.format, u.p_now, attempts, model);
      if (spent + c > budget) continue;
      spent += c;
      chosen.push({ u, c, k });
      if (k === 1) firstOf.add(u.key);
    }
    let ordered = chosen;
    if (!base && chosen.length) {
      // allocation.spacing_within_sitting: every first try (interleaved by skill),
      // then the second tries in the same topic order, as far from their first as
      // the sitting allows; close on one the curve expects right.
      let firsts = chosen.filter((x) => x.k === 1).map((x) => ({ ...x, skill: x.u.skill }));
      if (enf.scope === 'session') firsts = firsts.slice().sort((a, b) => a.u.last_t - b.u.last_t);
      firsts = adaptation.interleave(firsts);
      const at = new Map(firsts.map((x, i) => [x.u.key, i]));
      const seconds = chosen.filter((x) => x.k === 2).sort((a, b) => at.get(a.u.key) - at.get(b.u.key));
      const twice = new Set(seconds.map((x) => x.u.key));
      const close = firsts.slice().reverse().find((x) => x.u.p_now >= params.load().selection.close_easy_at && !twice.has(x.u.key));
      ordered = close && chosen.length > 1 ? [...firsts.filter((x) => x !== close), ...seconds, close] : [...firsts, ...seconds];
    }
    tiers[tier] = {
      slots: ordered.map((x) => ({ key: x.u.key, k: x.k, c: x.c })),
      spent,
      budget,
      attempts,
      topics: firstOf.size,
      seconds: chosen.filter((x) => x.k === 2).length,
      // P5: eligible topics this plan would not ask (the next plans' "left out last time").
      left_out: base ? null : units.filter((u) => u.eligible && !firstOf.has(u.key)).map((u) => u.key),
    };
  }
  const questions = {};
  const unitsOut = {};
  for (const t of Object.values(tiers)) {
    for (const s of t.slots) {
      questions[`${s.key}|${s.k}`] = drawn.get(`${s.key}|${s.k}`);
      unitsOut[s.key] = slimUnit(byKey.get(s.key));
    }
  }
  return { at: iso(now), tiers, questions, units: unitsOut, found: [...drawn.values()].filter(Boolean).length };
}

/** How long a waiting enforcer's draft stands before the page re-drafts it (scores move with time). */
const DRAFT_TTL_MS = 6 * 3600 * 1000;

/**
 * The drafted tiers of a waiting enforcer, made once and kept on its row, so
 * the card and the questions served are the same plan. Made again when there is
 * none (or `fresh` and it is older than DRAFT_TTL_MS: the page asks for that
 * when it shows the card, never when a tier is chosen).
 */
function draftsOf(enf, { fresh = false, now = Date.now() } = {}) {
  const d = enf.drafts;
  if (d && d.tiers && !(fresh && now - (Date.parse(d.at) || 0) > DRAFT_TTL_MS)) return d;
  const made = draftAll(enf.user_id, enf, { now });
  enf.drafts = made;
  if (enf.id) db.update('enforcers', enf.id, { drafts: made });
  return made;
}

function plan(userId, enf, tier, { now = Date.now() } = {}) {
  const o = options(enf).find((x) => x.tier === tier);
  if (!o || !o.available) return { error: 'There is not enough time in this window for that enforcer.', status: 409 };
  const d = draftsOf(enf, { now });
  const t = d.tiers[tier];
  const attempts = t.attempts;
  const budget = t.budget;
  const spent = t.spent;
  const slotsList = t.slots.map((s) => ({ u: d.units[s.key], q: d.questions[`${s.key}|${s.k}`], c: s.c, k: s.k })).filter((x) => x.u && x.q);
  if (!slotsList.length) return { error: 'No questions could be found for this window.', status: 409 };
  const firstOf = new Set(slotsList.filter((x) => x.k === 1).map((x) => x.u.key));
  const base = !!enf.base;

  const sessionFor = new Map();
  const order = [];
  const unitInfo = {};
  slotsList.forEach(({ u, q, c, k: kTry }, k) => {
    const gk = `${u.track_id}/${u.grade_id}`;
    let s = sessionFor.get(gk);
    if (!s) {
      const enrollment = u.enrollment_id ? db.byId('enrollments', u.enrollment_id) : null;
      const at = (enrollment && enrollment.current_level) || u.level || 1;
      s = db.insert('sessions', {
        user_id: userId,
        enrollment_id: enrollment ? enrollment.id : null,
        track_id: u.track_id,
        grade_id: u.grade_id,
        level: at,
        start_level: at,
        end_level: at,
        levels: [at],
        blocks: [{ index: 0, level: at, kind: 'review', resolved: false }],
        kind: 'enforcer',
        // A look away from the level, like the daily review: nothing here clears,
        // advances or holds a level (services/sessions.js reads `preview`).
        preview: true,
        at_level: at,
        enforcer_id: enf.id,
        params: { itemCount: 0, immediateFeedback: true },
        started_at: iso(now),
        ended_at: null,
        score: null,
        analysis: null,
        xp_awarded: 0,
      });
      sessionFor.set(gk, s);
    }
    unitInfo[u.key] = { track_id: u.track_id, grade_id: u.grade_id, objective: u.objective, skill: u.skill, level: u.level, p_now: u.p_now, items: u.items.slice(-20) };
    const row = insertItem(userId, s, u, q, k, enf.id, { planned_cost_ms: c, attempt: 1, enforcer_try: kTry || 1, ...(kTry === 2 ? { varied_try: true } : {}) });
    order.push(row.id);
  });
  for (const s of sessionFor.values()) db.update('sessions', s.id, { params: { ...s.params, itemCount: order.filter((id) => (db.byId('items', id) || {}).session_id === s.id).length } });
  return db.update('enforcers', enf.id, {
    status: 'running',
    tier,
    attempts,
    chosen_at: iso(now),
    started_at: enf.started_at || iso(now),
    budget_ms: budget,
    planned_ms: spent,
    planned: order.length,
    planned_topics: firstOf.size,
    planned_second_tries: slotsList.filter((x) => x.k === 2).length,
    order,
    session_ids: [...sessionFor.values()].map((s) => s.id),
    units: unitInfo,
    // P5: eligible topics this plan did not ask (the next plans' "left out last time").
    ...(base ? {} : { left_out: t.left_out || [] }),
    // The draft is served now; its other tiers are not needed again.
    drafts: null,
    elapsed_ms: 0,
    requeues: 0,
  });
}

function insertItem(userId, session, u, q, index, enforcerId, extra = {}) {
  return db.insert('items', {
    ...q,
    ...extra,
    session_id: session.id,
    user_id: userId,
    track_id: u.track_id,
    grade_id: u.grade_id,
    role: 'review',
    level: u.level || session.level,
    block: 0,
    index,
    ...(u.objective ? { objective_id: u.objective, objective_test: true } : {}),
    review_reason: 'enforcer',
    enforcer_id: enforcerId,
    enforcer_unit: u.key,
    // Which window answer this question came from (the learner's own check), else the unit's latest.
    source_item_id: q.source_item_id || u.items[u.items.length - 1],
    user_answer: null,
    correct: null,
    ms: null,
    coach_used: false,
  });
}

// ── the offers waiting for a learner ──────────────────────────────────────

/** End of a study session: the enforcer for it (or for the whole day). */
function onSessionEnded(userId, row, { scope = 'session', auto = false, now = Date.now() } = {}) {
  if (!enabled()) return null;
  try {
    if (scope === 'day') {
      const day = row.local_day;
      const sameDay = study.inDays(userId, day, day);
      // The day's own session enforcers still waiting are folded into the day's.
      for (const e of db.find('enforcers', (x) => x.user_id === userId && x.scope === 'session' && x.status === 'choosing' && x.local_day === day)) {
        db.update('enforcers', e.id, { status: 'merged', merged_at: iso(now), drafts: null });
      }
      // A scheduled day: its end-of-day enforcer is part of the scheduled one (the widest absorbs the rest).
      const at = dayOf(userId, now);
      if (at && at.today === day && schedule.typesOn(at.t).some((type) => !rowFor(userId, type, at.t))) {
        const combined = scheduledOffer(userId, now, { includeToday: true });
        if (combined && combined.status !== 'running') return combined;
      }
      return create(userId, { scope: 'day', win: { from_date: day, to_date: day, to_ms: now }, studyIds: sameDay.map((s) => s.id), now, late: false });
    }
    const from = Date.parse(row.started_at);
    const to = Date.parse(row.ended_at) || now;
    const enf = create(userId, { scope: 'session', win: { from_ms: from, to_ms: to }, studyIds: [row.id], now });
    if (auto) db.update('enforcers', enf.id, { left_without_choosing: true });
    return db.byId('enforcers', enf.id);
  } catch (err) {
    console.warn(`enforcer for study session ${row.id} failed: ${err.message}`);
    return null;
  }
}

/**
 * Retire offers past their validity (choice_resume_merge.validity): an end of
 * session one after 24 hours, an end of day one after 48. Their days are inside
 * the next scheduled enforcer's window, so they roll into it (`merged`).
 */
function expire(userId, now) {
  const v = params.load().validity_ms;
  for (const e of db.find('enforcers', (x) => x.user_id === userId && (x.status === 'choosing' || x.status === 'running') && !SCHEDULED.has(x.scope))) {
    const limit = e.scope === 'day' ? v.day : v.session;
    if (now - (Date.parse(e.offered_at || e.created_at) || now) > limit) {
      if (e.status === 'running') {
        closeSittings(e, now);
        db.update('enforcers', e.id, { status: 'stopped', closed_at: iso(now), results: results(e) });
      } else db.update('enforcers', e.id, { status: 'merged', merged_at: iso(now), reason: 'rolled', drafts: null });
    }
  }
}

/** The learner's anchor and today's day number (null before their first study session). */
function dayOf(userId, now = Date.now()) {
  const anchor = study.anchorOf(userId);
  if (!anchor) return null;
  const tz = study.zoneFor(userId);
  const today = schedule.localDate(now, tz);
  return { anchor, tz, today, t: schedule.dayIndex(anchor, today) };
}

/** Rows that already speak for a scheduled occurrence. */
function rowFor(userId, type, day) {
  return db.findOne('enforcers', (e) => e.user_id === userId && Array.isArray(e.covers) && e.covers.some((c) => c.type === type && c.day === day)) || null;
}

/**
 * The scheduled enforcers due now: for each type, its latest occurrence on or
 * before today, when no row speaks for it and its window holds work. Several
 * due at once (a learner back after a week away) are one offer, of the widest
 * type, over all their windows together.
 */
function scheduledOffer(userId, now, { includeToday = false } = {}) {
  const at = dayOf(userId, now);
  if (!at || at.t < 1) return null;
  // Today's scheduled enforcer covers today too (it absorbs the end-of-day one),
  // so it is taken at End day session (includeToday), else before the next
  // session on a later day; never before today's own sessions.
  const upTo = includeToday ? at.t : at.t - 1;
  const due = [];
  for (const type of schedule.TYPES) {
    const d = upTo >= 1 ? schedule.latest(type, upTo) : null;
    if (!d || rowFor(userId, type, d)) continue;
    const w = schedule.windowFor(type, d);
    const win = { from_date: schedule.addDays(at.anchor, w.from), to_date: schedule.addDays(at.anchor, w.to) };
    const cover = { type, day: d, date: schedule.addDays(at.anchor, d), from_date: win.from_date, to_date: win.to_date };
    if (!windowItems(userId, win, at.tz).length) {
      db.insert('enforcers', { user_id: userId, scope: type, status: 'empty', reason: 'nothing_answered', covers: [cover], window: { ...win, from_ms: null, to_ms: null }, base: isBase(userId), local_day: at.today, tz: at.tz, offered_at: iso(now) });
      continue;
    }
    due.push(cover);
  }
  const open = db.findOne('enforcers', (e) => e.user_id === userId && SCHEDULED.has(e.scope) && (e.status === 'choosing' || e.status === 'running'));
  if (!due.length) return open;
  if (open && open.status === 'running') {
    // A half-done one is finished first; what came due since waits for it.
    return open;
  }
  const covers = [...((open && open.covers) || []), ...due];
  const widest = covers.reduce((a, c) => (schedule.RANK[c.type] > schedule.RANK[a.type] ? c : a), covers[0]);
  const win = { from_date: covers.reduce((m, c) => (c.from_date < m ? c.from_date : m), covers[0].from_date), to_date: covers.reduce((m, c) => (c.to_date > m ? c.to_date : m), covers[0].to_date) };
  const late = covers.some((c) => c.day < at.t);
  if (includeToday && covers.some((c) => c.day === at.t)) win.to_ms = now;
  if (open) db.update('enforcers', open.id, { status: 'merged', merged_at: iso(now), drafts: null });
  const studyIds = includeToday ? study.inDays(userId, at.today, at.today).map((x) => x.id) : [];
  // The day's sessions go in at creation, so the drafted tiers already see them (P3's deferred topics).
  const enf = create(userId, { scope: widest.type, win, covers, studyIds: [], dayStudyIds: studyIds, now, late });
  if (enf.status === 'empty') return includeToday ? db.byId('enforcers', enf.id) : null;
  return db.byId('enforcers', enf.id);
}

/** What is waiting for this learner, in the order it is offered: half-done, unchosen, then scheduled. */
function offers(userId, { now = Date.now() } = {}) {
  if (!enabled()) return [];
  expire(userId, now);
  const mine = db.find('enforcers', (e) => e.user_id === userId && (e.status === 'running' || e.status === 'choosing'));
  const running = mine.filter((e) => e.status === 'running' && !SCHEDULED.has(e.scope));
  const choosing = mine.filter((e) => e.status === 'choosing' && !SCHEDULED.has(e.scope));
  const scheduled = scheduledOffer(userId, now);
  const list = [...running, ...choosing];
  if (scheduled) list.push(db.byId('enforcers', scheduled.id));
  // A running one first, whatever its scope.
  return list.filter(Boolean).sort((a, b) => (a.status === 'running' ? 0 : 1) - (b.status === 'running' ? 0 : 1) || a.id - b.id);
}

// ── answering, finishing, stopping ────────────────────────────────────────

function itemsOf(enf) {
  return (enf.order || []).map((id) => db.byId('items', id)).filter(Boolean);
}

/** Reopen a sitting another route closed (skipping a level closes every open sitting on it). */
function reopen(enf) {
  for (const id of enf.session_ids || []) {
    const s = db.byId('sessions', id);
    if (s && s.ended_at && !s.enforcer_closed) db.update('sessions', id, { ended_at: null, abandoned: false });
  }
}

/**
 * After an answer on an enforcer question: count its time; on a miss, while the
 * tier allows more attempts and the budget holds, bring the objective back on a
 * different question at least `retry_gap` (3) questions later ("one more
 * try"); and once the next question would go past the budget, stop serving.
 */
function afterAnswer(userId, item, { ms = 0, correct = null } = {}) {
  if (!item || !item.enforcer_id) return null;
  const enf = db.byId('enforcers', item.enforcer_id);
  if (!enf || enf.user_id !== userId || enf.status !== 'running') return null;
  const p = params.load();
  const pr = correct === false ? 0 : 1;
  const elapsed = (enf.elapsed_ms || 0) + Math.min(p.cost.item_ms_max, Math.max(0, Number(ms) || 0))
    + (pr ? p.cost.feedback_right_ms : p.cost.feedback_wrong_ms);
  let order = (enf.order || []).slice();
  const rows = () => order.map((id) => db.byId('items', id)).filter(Boolean);
  const isOpen = (i) => (i.user_answer === null || i.user_answer === undefined) && !i.dropped;
  const openCost = () => rows().filter(isOpen).reduce((sum, i) => sum + (i.planned_cost_ms || 0), 0);
  let added = null;
  // Attempts on this question's chain (a first try and its retries), so a topic's second, varied try keeps its own retries.
  const root = item.requeue_of || item.id;
  const tries = rows().filter((i) => i.id === root || i.requeue_of === root).length;
  if (correct === false && tries < (enf.attempts || 1)) {
    const info = (enf.units || {})[item.enforcer_unit];
    const model = costModel(userId, !!enf.base);
    if (info) {
      const u = { key: item.enforcer_unit, ...info, enrollment_id: null };
      const avoid = askedBefore(userId);
      const used = new Set(itemsOf(enf).map((i) => bank.itemKey(i)));
      for (const i of itemsOf(enf)) if (i.source === 'own_check' && i.source_item_id) used.add(`own:${i.source_item_id}`);
      // A retry on an objective is another question written for it, or none: never the skill bank's question,
      // which can sit far from the objective's grade (seen in the click-through: a perimeter problem on a Pre-K objective).
      const q = questionFor(u, avoid, used, new Set(), { scope: enf.scope, varied: !!u.objective });
      const c = q ? costOf(q.format, 0.6, 1, model) : 0;
      if (q && elapsed + openCost() + c <= enf.budget_ms) {
        const session = db.byId('sessions', item.session_id);
        added = insertItem(userId, session, u, q, order.length, enf.id, { requeue_of: item.requeue_of || item.id, attempt: tries + 1, planned_cost_ms: c });
        // At least `retry_gap` questions after this one, else at the end.
        const here = order.indexOf(item.id);
        let at = order.length;
        let seen = 0;
        for (let k = here + 1; k < order.length; k++) {
          const r = db.byId('items', order[k]);
          if (r && isOpen(r)) seen += 1;
          if (seen === p.retry_gap) { at = k + 1; break; }
        }
        order.splice(at, 0, added.id);
      }
    }
  }
  let dropped = 0;
  const left = rows().filter(isOpen);
  if (left.length) {
    // Keep what fits; drop the rest once the next one would go past the budget.
    let used = elapsed;
    let stop = false;
    for (const i of left) {
      if (!stop && used + (i.planned_cost_ms || 0) <= enf.budget_ms) { used += i.planned_cost_ms || 0; continue; }
      stop = true;
      db.update('items', i.id, { dropped: true });
      dropped += 1;
    }
    if (dropped) order = order.filter((id) => !(db.byId('items', id) || {}).dropped);
  }
  db.update('enforcers', enf.id, { elapsed_ms: Math.round(elapsed), order, requeues: (enf.requeues || 0) + (added ? 1 : 0), dropped: (enf.dropped || 0) + dropped });
  // eslint-disable-next-line global-require
  const sessions = require('./sessions');
  const answeredN = order.map((id) => db.byId('items', id)).filter((i) => i && i.user_answer !== null && i.user_answer !== undefined).length;
  return {
    elapsed_ms: Math.round(elapsed),
    budget_ms: enf.budget_ms,
    remaining: order.length - answeredN,
    time_up: dropped > 0,
    order,
    added: added && !added.dropped && order.includes(added.id) ? { ...sessions.sanitize(added), session_id: added.session_id, again: true } : null,
  };
}

/** Close an enforcer's sittings: their score and XP. */
function closeSittings(enf, now, abandoned = false) {
  let xp = 0;
  for (const id of enf.session_ids || []) {
    const s = db.byId('sessions', id);
    if (!s) continue;
    // eslint-disable-next-line global-require
    const answered = require('./sessions').itemsFor(id).filter((i) => i.correct !== null && i.correct !== undefined);
    const right = answered.filter((i) => i.correct).length;
    const sxp = abandoned ? 0 : mastery.xpForItems(answered);
    xp += sxp;
    db.update('sessions', id, {
      ended_at: s.ended_at && s.enforcer_closed ? s.ended_at : iso(now),
      enforcer_closed: true,
      abandoned: abandoned && !answered.length,
      score: answered.length ? right / answered.length : null,
      xp_awarded: sxp,
      blocks: (s.blocks || []).map((b) => ({ ...b, resolved: true })),
    });
    if (s.enrollment_id && answered.length) {
      const e = db.byId('enrollments', s.enrollment_id);
      if (e) db.update('enrollments', e.id, { xp: (e.xp || 0) + sxp, last_review_at: iso(now) });
    }
  }
  return xp;
}

function results(enf) {
  const items = itemsOf(enf);
  const answered = items.filter((i) => i.correct !== null && i.correct !== undefined);
  const right = answered.filter((i) => i.correct).length;
  return {
    asked: items.length,
    answered: answered.length,
    right,
    accuracy: answered.length ? right / answered.length : 0,
    elapsed_ms: enf.elapsed_ms || 0,
    budget_ms: enf.budget_ms || 0,
    by_unit: answered.map((i) => ({ unit: i.enforcer_unit, objective: i.objective_id || null, skill: i.skill_id, correct: !!i.correct, again: !!i.requeue_of })),
  };
}

function finish(userId, enf, { now = Date.now() } = {}) {
  if (enf.status !== 'running') return { error: 'This enforcer is not running.', status: 409 };
  const xp = closeSittings(enf, now);
  const res = { ...results(enf), xp };
  const user = db.byId('users', userId);
  if (user && xp) db.update('users', userId, { xp: (user.xp || 0) + xp });
  db.update('enforcers', enf.id, { status: res.answered ? 'done' : 'stopped', finished_at: iso(now), results: res });
  return { enforcer: db.byId('enforcers', enf.id), results: res };
}

/** No enforcer: before choosing (declined), or partway (stopped, the answers so far kept). */
function decline(userId, enf, { now = Date.now() } = {}) {
  if (FINAL.has(enf.status)) return { enforcer: enf };
  if (enf.status === 'running') {
    const xp = closeSittings(enf, now);
    const res = { ...results(enf), xp };
    db.update('enforcers', enf.id, { status: 'stopped', finished_at: iso(now), results: res });
  } else {
    db.update('enforcers', enf.id, { status: 'declined', tier: 'none', chosen_at: iso(now), drafts: null });
  }
  return { enforcer: db.byId('enforcers', enf.id) };
}

/** The owner's skip: any enforcer, at any point. */
function skip(userId, enf, { now = Date.now() } = {}) {
  if (FINAL.has(enf.status)) return { enforcer: enf };
  if (enf.status === 'running') closeSittings(enf, now, true);
  db.update('enforcers', enf.id, { status: 'skipped', finished_at: iso(now), results: enf.status === 'running' ? results(enf) : null, drafts: null });
  return { enforcer: db.byId('enforcers', enf.id) };
}

/**
 * Choose a tier (or 'none'). On a half-done enforcer a tier changes how much is
 * left: a smaller one drops the questions past its count (finishing it when
 * that many are already answered).
 */
function choose(userId, enf, tier, { now = Date.now() } = {}) {
  if (tier === 'none') return decline(userId, enf, { now });
  if (!params.TIERS.includes(tier)) return { error: 'Choose quick, medium, full or no enforcer.', status: 400 };
  if (FINAL.has(enf.status)) return { error: 'This enforcer is already closed.', status: 409 };
  if (enf.status === 'running') {
    if (tier === enf.tier) { reopen(enf); return { enforcer: db.byId('enforcers', enf.id) }; }
    const opt = options(enf).find((x) => x.tier === tier);
    if (!opt || !opt.available) return { error: 'That tier does not fit this window.', status: 409 };
    const n = opt.items;
    const items = itemsOf(enf);
    const answered = items.filter((i) => i.user_answer !== null && i.user_answer !== undefined);
    const budget = budgetFor(enf, tier);
    if (answered.length >= n) {
      db.update('enforcers', enf.id, { tier, budget_ms: budget, attempts: params.attemptsFor(enf.scope, tier) });
      for (const i of items) if (i.user_answer === null || i.user_answer === undefined) db.update('items', i.id, { dropped: true });
      db.update('enforcers', enf.id, { order: answered.map((i) => i.id) });
      return finish(userId, db.byId('enforcers', enf.id), { now });
    }
    const keep = [];
    let open = 0;
    for (const i of items) {
      if (i.user_answer !== null && i.user_answer !== undefined) keep.push(i.id);
      else if (answered.length + open < n) { keep.push(i.id); open += 1; } else db.update('items', i.id, { dropped: true });
    }
    reopen(enf);
    return { enforcer: db.update('enforcers', enf.id, { tier, budget_ms: budget, attempts: params.attemptsFor(enf.scope, tier), order: keep, retiered_at: iso(now) }) };
  }
  const out = plan(userId, enf, tier, { now });
  if (out.error) return out;
  return { enforcer: out };
}

// ── what the pages read ───────────────────────────────────────────────────

function view(enf, { userId = null, withItems = false } = {}) {
  if (!enf) return null;
  // eslint-disable-next-line global-require
  const sessions = require('./sessions');
  const all = enf.status === 'running' || (withItems && FINAL.has(enf.status)) ? itemsOf(enf) : [];
  const items = withItems ? all : [];
  const answered = all.filter((i) => i.user_answer !== null && i.user_answer !== undefined).length;
  const user = userId ? db.byId('users', userId) : null;
  // The card is about to be shown: a draft made hours ago (a late offer) is made again now, and kept for the choice.
  // If no tier has a question any more, it closes as empty rather than offering tiers that would fail.
  if (enf.status === 'choosing') {
    const d = draftsOf(enf, { fresh: true });
    if (!options(enf).some((o) => o.available)) {
      enf = db.update('enforcers', enf.id, { status: 'empty', reason: d.found ? 'too_short' : 'no_questions', drafts: null });
    }
  }
  return {
    id: enf.id,
    scope: enf.scope,
    label: schedule.LABEL[enf.scope] || enf.scope,
    status: enf.status,
    reason: enf.reason || null,
    tier: enf.tier || null,
    late: !!enf.late,
    left_without_choosing: !!enf.left_without_choosing,
    covers: (enf.covers || []).map((c) => ({ type: c.type, label: schedule.LABEL[c.type], date: c.date, from_date: c.from_date, to_date: c.to_date })),
    // What this one enforcer absorbed on its day (a semi-weekly on a weekly's day, the end-of-day enforcer), as one plan.
    absorbs: (enf.absorbs || []).map((t) => ({ type: t, label: schedule.LABEL[t] || t })),
    day_date: enf.day_date || null,
    planned_topics: enf.planned_topics || null,
    planned_second_tries: enf.planned_second_tries || 0,
    window: { from_date: (enf.window || {}).from_date || null, to_date: (enf.window || {}).to_date || null, from: (enf.window || {}).from_ms ? iso(enf.window.from_ms) : null, to: (enf.window || {}).to_ms ? iso(enf.window.to_ms) : null },
    active_minutes: Number(((enf.base_active_ms || 0) / 60000).toFixed(1)),
    default_tier: enf.status === 'choosing' ? defaultTier(enf) : null,
    answered_in_window: enf.answered_in_window || 0,
    options: enf.status === 'choosing' || enf.status === 'running' ? options(enf) : [],
    base: !!enf.base,
    can_skip: !!(user && owner.isOwner(user)),
    budget_ms: enf.budget_ms || null,
    elapsed_ms: enf.elapsed_ms || 0,
    // Questions in it now: the plan, plus any "one more try", less what the budget dropped.
    planned: enf.status === 'running' ? all.length : enf.planned || 0,
    answered,
    items: items.map((it) => ({
      ...sessions.sanitize(it),
      session_id: it.session_id,
      again: !!it.requeue_of,
      ...(it.user_answer !== null && it.user_answer !== undefined ? { answer: it.answer, rationale: it.rationale } : {}),
    })),
    results: enf.results || null,
    created_at: enf.created_at,
  };
}

/**
 * The calendar for one month (local dates): every scheduled day with its type
 * and status (done, none, skipped, stopped, missed, nothing to cover, due,
 * upcoming), and the end-of-session and end-of-day enforcers on each day.
 * Before the first study session the schedule is drawn from today, as a preview.
 */
function calendar(userId, { month = null, now = Date.now() } = {}) {
  const tz = study.zoneFor(userId);
  const today = schedule.localDate(now, tz);
  const real = study.anchorOf(userId);
  const anchor = real || today;
  if (real) offers(userId, { now });
  const ym = /^\d{4}-\d{2}$/.test(String(month || '')) ? month : today.slice(0, 7);
  const first = `${ym}-01`;
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const t = schedule.dayIndex(anchor, today);
  const rows = db.find('enforcers', (e) => e.user_id === userId);
  // Days with answered work, for "missed" against "nothing to cover".
  const worked = new Set();
  const lookFrom = schedule.addDays(first, -40);
  for (const r of windowItems(userId, { from_date: lookFrom, to_date: last }, tz)) worked.add(schedule.localDate(r.t, tz));
  const anyWork = (from, to) => { for (let d = from; d <= to; d = schedule.addDays(d, 1)) if (worked.has(d)) return true; return false; };
  const STATUS = { done: 'done', declined: 'none', skipped: 'skipped', stopped: 'stopped', expired: 'missed', empty: 'empty', running: 'due', choosing: 'due', merged: 'merged' };
  const days = [];
  for (let date = first; date <= last; date = schedule.addDays(date, 1)) {
    const idx = schedule.dayIndex(anchor, date);
    const types = idx >= 1 ? schedule.typesOn(idx) : [];
    const type = types[0] || null;
    let ev = null;
    if (type) {
      const w = schedule.combinedWindow(idx);
      const win = { from_date: schedule.addDays(anchor, w.from), to_date: schedule.addDays(anchor, w.to) };
      let row = rows.filter((e) => Array.isArray(e.covers) && e.covers.some((c) => c.type === type && c.day === idx)).sort((a, b) => b.id - a.id);
      row = row.find((e) => e.status !== 'merged') || row[0] || null;
      let status;
      if (row) status = STATUS[row.status] || row.status;
      else if (idx > t) status = 'upcoming';
      else if (!real) status = 'upcoming';
      else if (idx === t) status = 'today';
      else status = anyWork(win.from_date, win.to_date) ? 'missed' : 'empty';
      if (status === 'merged') status = idx < t ? 'missed' : 'due';
      ev = {
        type, label: schedule.LABEL[type], status,
        // The narrower ones it absorbs on this day; it is also this day's end-of-day enforcer.
        absorbs: types.slice(1).map((x) => ({ type: x, label: schedule.LABEL[x] })),
        with_day: true, tier: row ? row.tier || null : null, window: win,
        done_on: row && row.finished_at ? schedule.localDate(Date.parse(row.finished_at), tz) : null,
        enforcer_id: row ? row.id : null,
      };
    }
    const ends = rows.filter((e) => (e.scope === 'session' || e.scope === 'day') && e.local_day === date && e.status !== 'merged')
      .map((e) => ({ scope: e.scope, label: schedule.LABEL[e.scope], status: STATUS[e.status] || e.status, tier: e.tier || null, enforcer_id: e.id }));
    days.push({ date, day: idx, today: date === today, past: date < today, scheduled: ev, ends });
  }
  const upcoming = [];
  for (let d = Math.max(1, t + 1); upcoming.length < 8 && d < t + 80; d++) {
    const types = schedule.typesOn(d);
    if (!types.length) continue;
    const w = schedule.combinedWindow(d);
    upcoming.push({ type: types[0], label: schedule.LABEL[types[0]], absorbs: types.slice(1).map((x) => ({ type: x, label: schedule.LABEL[x] })), date: schedule.addDays(anchor, d), window: { from_date: schedule.addDays(anchor, w.from), to_date: schedule.addDays(anchor, w.to) } });
  }
  return { tz, today, anchor: real, preview: !real, month: ym, first, last, days, upcoming };
}

/** Today's scheduled enforcer (taken at End day session), or null: {type, label, absorbs, done}. */
function scheduledToday(userId, now = Date.now()) {
  const at = dayOf(userId, now);
  if (!at || at.t < 1) return null;
  const types = schedule.typesOn(at.t);
  if (!types.length) return null;
  const row = rowFor(userId, types[0], at.t);
  return { type: types[0], label: schedule.LABEL[types[0]], absorbs: types.slice(1).map((x) => ({ type: x, label: schedule.LABEL[x] })), done: !!(row && FINAL.has(row.status)), enforcer_id: row ? row.id : null };
}

/**
 * Where the scheduled enforcers stop reaching: the earliest day any of the
 * next occurrences' windows starts. Work older than this is no enforcer's, so
 * the folded daily review keeps it (services/review-session.js).
 */
function reachStart(userId, now = Date.now()) {
  const tz = study.zoneFor(userId);
  const today = schedule.localDate(now, tz);
  const anchor = study.anchorOf(userId) || today;
  const t = schedule.dayIndex(anchor, today);
  let from = Math.max(0, t);
  for (const type of schedule.TYPES) {
    let x = schedule.next(type, Math.max(1, t));
    const r = x === t ? rowFor(userId, type, x) : null;
    if (r && FINAL.has(r.status)) x = schedule.next(type, t + 1);
    from = Math.min(from, schedule.windowFor(type, x).from);
    // An earlier one still waiting (offered, or due and not yet seen) reaches back too.
    const p = x !== t ? schedule.latest(type, t) : null;
    if (p) {
      const pr = rowFor(userId, type, p);
      if (!pr || !FINAL.has(pr.status)) from = Math.min(from, schedule.windowFor(type, p).from);
    }
  }
  return schedule.addDays(anchor, from);
}

module.exports = {
  enabled, foldsReview, windowItems, activeMs, unitsFrom, spread, options,
  create, plan, onSessionEnded, offers, deferSittingRetention, leftOutCounts, scheduledOffer, afterAnswer, finish, decline, skip, choose, reopen,
  view, calendar, reachStart, scheduledToday, itemsOf, results, FINAL, SCHEDULED, WIDTH, costModel, costOf, score, fillOrder, slots, budgetFor, fit, defaultTier,
  draftAll, draftsOf,
};
