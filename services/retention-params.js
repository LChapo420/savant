/**
 * What a retention enforcer contains, per scope and tier: its time budget,
 * what one question costs, how questions are scored and retried
 * (curriculum-build/RETENTION-ENFORCERS.md).
 *
 * The source is the research file curriculum-build/retention-enforcer-params.json
 * (RETENTION_PARAMS_FILE overrides the path; its evidence is in
 * RETENTION-ENFORCER-EVIDENCE.md). It is read into the flat shape below; any
 * value it lacks, or that fails the checks here, falls back to DEFAULTS (the
 * same numbers, built in, so the app runs without the file). Whatever a file
 * says, a full enforcer's planned time stays at most FULL_CAP (0.095) of the
 * covered active time, under the owner's 10%, and quick < medium <= full.
 *
 * Budget (item_count.budget_seconds):
 *   B(tier) = multiplier(tier) * min(full_share * covered, full_cap), and never
 *   more than FULL_CAP * covered.
 * Combined (one enforcer for several absorbed scopes): combinedBudgetMs.
 * Cost of one question (global.item_cost_seconds.planning_cost):
 *   the learner's median for its format (after `median_after` answers in it),
 *   else the format default, plus expected feedback p*right + (1-p)*wrong, plus
 *   (1-p) * a retry when the tier retries.
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'curriculum-build', 'retention-enforcer-params.json');
const FULL_CAP = 0.095;
const SCOPES = ['session', 'day', 'semiweekly', 'weekly', 'biweekly', 'monthly'];
const TIERS = ['quick', 'medium', 'full'];
const MIN = 60000;
const H = 3600000;

const DEFAULTS = {
  source: 'defaults',
  version: 'builtin',
  full_cap: FULL_CAP,
  multipliers: { quick: 0.35, medium: 0.65, full: 1 },
  cost: {
    formats_ms: { multiple_choice: 20000, cloze: 25000, short_answer: 35000, type_in: 35000, problem: 60000 },
    other_ms: 35000,
    feedback_right_ms: 3000,
    feedback_wrong_ms: 25000,
    median_after: 20,
    item_ms_max: 180000,
  },
  idle_cap_ms: 5 * MIN,
  daily_cap_ms: 20 * MIN,
  scopes: {
    session: { full_share: 0.095, cap_ms: 8 * MIN, horizon_days: 1, min_lag_ms: 5 * MIN, spaced: false },
    day: { full_share: 0.095, cap_ms: 10 * MIN, horizon_days: 3.5, min_lag_ms: 30 * MIN, spaced: false },
    semiweekly: { full_share: 0.06, cap_ms: 12 * MIN, horizon_days: 7, min_lag_ms: 24 * H, spaced: true },
    weekly: { full_share: 0.05, cap_ms: 15 * MIN, horizon_days: 14, min_lag_ms: 24 * H, spaced: true },
    biweekly: { full_share: 0.04, cap_ms: 15 * MIN, horizon_days: 30, min_lag_ms: 24 * H, spaced: true },
    monthly: { full_share: 0.03, cap_ms: 20 * MIN, horizon_days: 60, min_lag_ms: 24 * H, spaced: true },
  },
  // attempts per objective: 1 = no retry; 2 = one retry; 3 = until right, at most 3 (scopes.*.tiers).
  attempts: { quick: 1, medium: 2, full: 3 },
  retry_gap: 3,
  selection: {
    // score = need * d(p_now) + flags; need = 1 - p_H (recall at the scope's horizon).
    // d = 1 for lo <= p_now <= hi, `below` under lo, `above` over too_easy. hi is
    // 0.95 since 2026-10-25 (eglington2020: practice at 0.86 and 0.94 equal-best;
    // evidence-article/02-retention-review.md P1); ENFORCER_DIFFICULTY_WINDOW_95=off
    // puts back 0.90 and its 0.65 step for 0.90-0.95 (windowOf).
    window: { lo: 0.5, hi: 0.95, below: 0.6, above: 0.3, too_easy: 0.95 },
    // left_out: + left_out * min(1, times left out / left_out_saturates_at) for a
    // topic eligible in the learner's last enforcers but not chosen (P5,
    // ENFORCER_LEFT_OUT_FLAG). deferred_retention: a skill that wobbled in a
    // sitting whose end-of-sitting retention set was handed to the session
    // enforcer (P3, ENFORCER_DEFER_SITTING_RETENTION); the weight of a right but
    // unsure answer, added only when no answer flag already fired.
    flags: {
      last_wrong: 0.3, high_confidence_error: 0.25, slow_or_unsure: 0.2, no_delayed_retrieval: 0.15,
      left_out: 0.1, left_out_saturates_at: 2, deferred_retention: 0.2,
    },
    recent_enforcer_ms: 20 * H,
    close_easy_at: 0.8,
  },
  target_band: [0.7, 0.85],
  default_tier: { quick_below_ms: 15 * MIN, full_wrong_objectives: 2, full_mean_p_h: 0.75 },
  validity_ms: { session: 24 * H, day: 48 * H },
  feedback: { immediate: true, recap_missed: true },
  // allocation: retrievals per topic in one sitting, one plan over the union
  // pool however many scopes it covers (the research file's `allocation`).
  allocation: {
    max_first: { session: 1, day: 2, semiweekly: 2, weekly: 2, biweekly: 2, monthly: 2 },
    second_tiers: ['medium', 'full'],
    second_value: 0.35,
    fragile: { p_now_below: 0.5, miss_rate_at_least: 0.34, min_answers: 2 },
    mature: { checks_at_least: 3, p_now_at_least: 0.9 },
    others_weight: 0.5,
  },
};

const num = (v, lo, hi, fallback) => (v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Math.max(lo, Math.min(hi, Number(v))) : fallback);
const KEY = { session: 'session', day: 'day', semi_weekly: 'semiweekly', semiweekly: 'semiweekly', weekly: 'weekly', bi_weekly: 'biweekly', biweekly: 'biweekly', monthly: 'monthly' };

/** The research file's shape, read into the flat one. Unknown or bad values keep the defaults. */
function fromResearch(raw, base) {
  const p = JSON.parse(JSON.stringify(base));
  const g = raw.global || {};
  const m = g.tier_multipliers_of_full_budget || {};
  for (const t of TIERS) p.multipliers[t] = num(m[t], 0.01, 1, p.multipliers[t]);
  const c = g.item_cost_seconds || {};
  for (const [f, s] of Object.entries(c.defaults || {})) p.cost.formats_ms[f] = num(s, 2, 600, p.cost.formats_ms[f] / 1000 || 35) * 1000;
  const fb = c.feedback_seconds || {};
  p.cost.feedback_right_ms = num(fb.correct_fast_confident, 0, 120, 3) * 1000;
  p.cost.feedback_wrong_ms = (num(fb.wrong, 0, 120, 15) + num(fb.elaborated_extra, 0, 120, 10)) * 1000;
  p.cost.median_after = num(c.use_learner_median_after_answers, 1, 1000, p.cost.median_after);
  const hard = g.hard_rule || {};
  // The file states the margin it applies (0.095); never above the built-in cap.
  const applied = /([0-9.]+)\s*\*\s*covered/.exec(String(hard.applied_as || ''));
  p.full_cap = Math.min(FULL_CAP, num(applied && applied[1], 0.01, FULL_CAP, FULL_CAP), num(hard.full_share_max_exclusive, 0.01, 0.1, 0.1) - 0.005);
  for (const [k, s] of Object.entries(raw.scopes || {})) {
    const scope = KEY[k];
    if (!scope || !s || typeof s !== 'object') continue;
    const d = p.scopes[scope];
    const b = s.budget || {};
    d.full_share = num(b.full_share, 0.001, p.full_cap, d.full_share);
    d.cap_ms = num(b.full_cap_minutes, 0.5, 120, d.cap_ms / MIN) * MIN;
    d.horizon_days = num(s.horizon_days, 0.1, 365, d.horizon_days);
    if (s.min_lag_minutes_since_last_exposure !== undefined) d.min_lag_ms = num(s.min_lag_minutes_since_last_exposure, 0, 24 * 60, 5) * MIN;
    if (s.min_lag_days !== undefined) d.min_lag_ms = num(s.min_lag_days, 0, 30, 1) * 24 * H;
    if (s.counts_as_spaced !== undefined) d.spaced = !!s.counts_as_spaced;
    d.tiers = {};
    for (const t of TIERS) {
      const x = (s.tiers || {})[t] || {};
      d.tiers[t] = { attempts: Math.round(num(x.attempts_per_item, 1, 5, p.attempts[t])), mix: x.mix || null };
    }
  }
  const sc = (raw.selection || {}).step_2_score || {};
  const fl = sc.flags || {};
  p.selection.flags = {
    last_wrong: num(fl.last_attempt_wrong_within_14_days, 0, 5, p.selection.flags.last_wrong),
    high_confidence_error: num(fl.high_confidence_error, 0, 5, p.selection.flags.high_confidence_error),
    slow_or_unsure: num(fl.correct_but_slow_or_low_confidence, 0, 5, p.selection.flags.slow_or_unsure),
    no_delayed_retrieval: num(fl.no_delayed_retrieval_yet, 0, 5, p.selection.flags.no_delayed_retrieval),
    left_out: p.selection.flags.left_out,
    left_out_saturates_at: p.selection.flags.left_out_saturates_at,
    deferred_retention: num(fl.wobbled_in_deferred_sitting_set, 0, 5, p.selection.flags.deferred_retention),
  };
  // "0.10 * min(1, times_left_out / 2)": the weight and where it saturates.
  const lo = /([0-9.]+)\s*\*\s*min\(\s*1\s*,\s*times_left_out\s*\/\s*([0-9.]+)\s*\)/.exec(String(fl.eligible_but_left_out_last_time || ''));
  if (lo) {
    p.selection.flags.left_out = num(lo[1], 0, 5, p.selection.flags.left_out);
    p.selection.flags.left_out_saturates_at = num(lo[2], 1, 20, p.selection.flags.left_out_saturates_at);
  }
  const band = (g.target_first_try_accuracy || {}).band;
  if (Array.isArray(band) && band.length === 2) p.target_band = [num(band[0], 0, 1, 0.7), num(band[1], 0, 1, 0.85)];
  const og = raw.overload_guards || {};
  p.daily_cap_ms = num(og.daily_enforcer_minutes_cap, 1, 240, 20) * MIN;
  const al = raw.allocation || {};
  const ft = al.first_tries_per_topic || {};
  for (const [k, v] of Object.entries(ft.max || {})) { if (KEY[k]) p.allocation.max_first[KEY[k]] = Math.round(num(v, 1, 3, p.allocation.max_first[KEY[k]])); }
  if (Array.isArray(ft.second_only_on_tiers)) p.allocation.second_tiers = ft.second_only_on_tiers.filter((t) => TIERS.includes(t));
  p.allocation.second_value = num((al.value || {}).second_value_factor, 0, 1, p.allocation.second_value);
  const fr = al.fragile || {};
  p.allocation.fragile = {
    p_now_below: num(fr.p_now_below, 0, 1, p.allocation.fragile.p_now_below),
    miss_rate_at_least: num(fr.miss_rate_at_least, 0, 1, p.allocation.fragile.miss_rate_at_least),
    min_answers: Math.round(num(fr.min_answers, 1, 50, p.allocation.fragile.min_answers)),
  };
  p.allocation.mature = {
    checks_at_least: Math.round(num(fr.mature_checks_at_least, 1, 50, p.allocation.mature.checks_at_least)),
    p_now_at_least: num(fr.mature_p_now_at_least, 0, 1, p.allocation.mature.p_now_at_least),
  };
  p.allocation.others_weight = num((al.budget || {}).others_weight, 0, 1, p.allocation.others_weight);
  p.source = path.basename(file());
  p.version = String(raw.version || 'unknown');
  return p;
}

function check(p) {
  for (const scope of SCOPES) {
    const s = p.scopes[scope];
    s.full_share = Math.min(p.full_cap, s.full_share);
    s.tiers = s.tiers || {};
    for (const t of TIERS) s.tiers[t] = { attempts: p.attempts[t], mix: null, ...(s.tiers[t] || {}) };
  }
  // quick < medium <= full.
  if (!(p.multipliers.quick < p.multipliers.medium && p.multipliers.medium <= p.multipliers.full)) p.multipliers = { ...DEFAULTS.multipliers };
  p.multipliers.full = Math.min(1, p.multipliers.full);
  return p;
}

let cached = null;
let cachedKey = null;
function file() { return process.env.RETENTION_PARAMS_FILE || FILE; }

/** The params in force (re-read when the file changes; RETENTION_PARAMS=defaults ignores the file). */
function load() {
  const f = file();
  let stat = null;
  try { stat = process.env.RETENTION_PARAMS === 'defaults' ? null : fs.statSync(f); } catch { stat = null; }
  const key = stat ? `${f}:${stat.mtimeMs}:${stat.size}` : 'defaults';
  if (cached && cachedKey === key) return cached;
  let p = JSON.parse(JSON.stringify(DEFAULTS));
  if (stat) {
    try {
      p = fromResearch(JSON.parse(fs.readFileSync(f, 'utf8')), p);
    } catch (err) {
      p = JSON.parse(JSON.stringify(DEFAULTS));
      p.problem = `unreadable: ${err.message}`;
    }
  }
  cached = check(p);
  cachedKey = key;
  return cached;
}

/** A tier's time budget for `activeMs` of covered active time. */
function budgetMs(scope, tier, activeMs) {
  const p = load();
  const s = p.scopes[scope] || p.scopes.session;
  if (!TIERS.includes(tier)) return 0;
  const full = Math.min(s.full_share * activeMs, s.cap_ms, p.full_cap * activeMs);
  return Math.max(0, Math.floor(p.multipliers[tier] * full));
}

/**
 * A combined enforcer's budget (allocation.budget.combined; merge_rule): each
 * part is one absorbed scope on its own window, {scope, active_ms}. Full =
 * the largest part's full budget + others_weight * the others, capped at the
 * largest cap among the parts and at FULL_CAP of the union's active time;
 * a tier takes its multiplier of that. One part is budgetMs itself.
 */
function combinedBudgetMs(parts, tier, unionActiveMs) {
  const p = load();
  if (!TIERS.includes(tier) || !Array.isArray(parts) || !parts.length) return 0;
  if (parts.length === 1) return budgetMs(parts[0].scope, tier, Math.min(parts[0].active_ms || 0, unionActiveMs));
  const fulls = parts.map((x) => {
    const s = p.scopes[x.scope] || p.scopes.session;
    const a = Math.max(0, Number(x.active_ms) || 0);
    return { full: Math.min(s.full_share * a, s.cap_ms, p.full_cap * a), cap: s.cap_ms };
  });
  const top = Math.max(...fulls.map((x) => x.full));
  const rest = fulls.reduce((sum, x) => sum + x.full, 0) - top;
  const full = Math.min(top + p.allocation.others_weight * rest, Math.max(...fulls.map((x) => x.cap)), p.full_cap * Math.max(0, unionActiveMs || 0));
  return Math.max(0, Math.floor(p.multipliers[tier] * full));
}

function attemptsFor(scope, tier) {
  const p = load();
  const s = p.scopes[scope] || p.scopes.session;
  return (s.tiers[tier] || {}).attempts || p.attempts[tier] || 1;
}

function reset() { cached = null; cachedKey = null; }

/** A switch that is on unless set to off (the 2026-10-25 changes; LIVE-CHANGES-2026-10-24.md). */
const on = (name) => String(process.env[name] || 'on').toLowerCase() !== 'off';

/**
 * The desirable-difficulty window in force. ENFORCER_DIFFICULTY_WINDOW_95=off is
 * the rollback: hi back to 0.90, with `step` (0.65, halfway between 1 and
 * `above`) for 0.90 < p_now <= 0.95. With the switch on there is no step.
 */
function windowOf(p = load()) {
  const w = { ...p.selection.window, step: null };
  if (!on('ENFORCER_DIFFICULTY_WINDOW_95')) { w.hi = 0.9; w.step = (1 + w.above) / 2; }
  return w;
}

/** d(p_now) for one topic. */
function difficultyWeight(pNow, w = windowOf()) {
  if (pNow > w.too_easy) return w.above;
  if (pNow < w.lo) return w.below;
  if (w.step !== null && pNow > w.hi) return w.step; // only with ENFORCER_DIFFICULTY_WINDOW_95=off
  return 1;
}

module.exports = { load, budgetMs, combinedBudgetMs, attemptsFor, reset, windowOf, difficultyWeight, on, DEFAULTS, FULL_CAP, SCOPES, TIERS, FILE, file, fromResearch };
