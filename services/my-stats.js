/**
 * The owner's own learner account, day by day (owner, 2026-11-03: "my stats and cost and average and day to day ... separate
 * from everyone else and your tests, so I can get accurate numbers"). docs/MY-STATS.md is the plain-language version.
 *
 * One row per UTC day for the account(s) config/owner.js isOwnerLearner names (landon@savantedu.com), joining:
 *   study  minutes on the study timer (study_sessions active_ms), questions answered and how many were right
 *          (items with an answer, placement questions apart), from this account's own rows only
 *   app    the cost tracker's 'me' bucket: active minutes in the app, levels finished, level opens and waits,
 *          AI calls, actual cost and list-price cost (services/cost-tracker.js)
 * Then averages over the days with any study, and totals for the window.
 *
 * What keeps it clean: the tracker puts every row from a script, build job or test in its own bucket (src), even one that
 * names this account; other people's and team accounts are other buckets; a tab refreshing itself is not a session.
 * `kept_apart` shows the other buckets' totals for the same window, so the separation can be seen.
 * Read-only: no model is called and nothing is written.
 */
const db = require('../config/db');
const owner = require('../config/owner');
const tracker = require('./cost-tracker');

const dayOf = (at) => { const t = typeof at === 'number' ? at : Date.parse(at); return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null; };
const rnd = (x, d = 2) => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);
const median = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

function accounts() {
  return db.find('users', (u) => owner.isOwnerLearner(u)).map((u) => ({ id: u.id, email: u.email }));
}

/** opts: { days (30, 1-90), now (ms) } */
function compute(opts = {}) {
  const now = opts.now || Date.now();
  const days = Math.max(1, Math.min(90, Number(opts.days) || 30));
  const who = accounts();
  const ids = new Set(who.map((a) => a.id));
  const since = now - days * 86400000;
  const inWindow = (at) => { const t = Date.parse(at); return Number.isFinite(t) && t >= since && t <= now; };

  const rows = new Map();
  for (let i = days - 1; i >= 0; i--) {
    const d = dayOf(now - i * 86400000);
    rows.set(d, { day: d, study_min: 0, questions: 0, correct: 0, placement_questions: 0, q_ms: [] });
  }
  const row = (d) => rows.get(d);

  for (const s of db.find('study_sessions', (r) => ids.has(r.user_id))) {
    const at = s.started_at || s.created_at;
    if (inWindow(at) && row(dayOf(at))) row(dayOf(at)).study_min += (Number(s.active_ms) || 0) / 60000;
  }
  const placementSessions = new Set(db.find('sessions', (r) => ids.has(r.user_id) && r.kind === 'placement').map((r) => r.id));
  for (const it of db.find('items', (r) => ids.has(r.user_id) && typeof r.correct === 'boolean')) {
    if (!inWindow(it.created_at) || !row(dayOf(it.created_at))) continue;
    const r = row(dayOf(it.created_at));
    if (it.role === 'placement' || placementSessions.has(it.session_id)) { r.placement_questions++; continue; }
    r.questions++;
    if (it.correct) r.correct++;
    if (Number(it.ms) > 0 && Number(it.ms) < 30 * 60000) r.q_ms.push(Number(it.ms));
  }

  const cost = tracker.summarize({ days, scope: 'me', now });
  for (const c of cost.daily) {
    const r = row(c.day);
    if (!r) continue;
    Object.assign(r, { app_active_min: c.active_min, sessions: c.sessions, levels: c.levels, level_opens: c.level_opens,
      level_open_p50_ms: c.level_open_p50_ms, level_waits: c.level_waits, ai_calls: c.ai_calls, actual_usd: c.actual_usd, list_usd: c.list_usd });
  }

  const daily = [...rows.values()].map((r) => ({
    day: r.day, study_min: rnd(r.study_min, 1), app_active_min: r.app_active_min || 0, sessions: r.sessions || 0, levels: r.levels || 0,
    questions: r.questions, correct: r.correct, accuracy_pct: r.questions ? rnd((100 * r.correct) / r.questions, 1) : null,
    median_sec_per_question: r.q_ms.length ? rnd(median(r.q_ms) / 1000, 1) : null, placement_questions: r.placement_questions,
    level_opens: r.level_opens || 0, level_open_p50_ms: r.level_open_p50_ms === undefined ? null : r.level_open_p50_ms, level_waits: r.level_waits || 0,
    ai_calls: r.ai_calls || 0, actual_usd: r.actual_usd || 0, list_usd: r.list_usd || 0,
  })).reverse();

  const sum = (f) => daily.reduce((s, r) => s + (Number(r[f]) || 0), 0);
  const active = daily.filter((r) => r.study_min > 0 || r.questions > 0 || r.app_active_min > 0 || r.levels > 0);
  const studyMin = sum('study_min');
  const appMin = sum('app_active_min');
  // Cost per hour uses the study timer when it ran, else the app's own active time (the tracker's sessions).
  const hours = (studyMin || appMin) / 60;
  const totals = {
    active_days: active.length, study_min: rnd(studyMin, 1), app_active_min: rnd(appMin, 1), levels: sum('levels'),
    questions: sum('questions'), correct: sum('correct'), placement_questions: sum('placement_questions'),
    ai_calls: sum('ai_calls'), actual_usd: rnd(sum('actual_usd'), 4), list_usd: rnd(sum('list_usd'), 4), level_waits: sum('level_waits'), level_opens: sum('level_opens'),
  };
  const per = (x) => (active.length ? x / active.length : null);
  const averages = {
    basis_days: active.length,
    study_min_per_day: rnd(per(studyMin), 1), app_active_min_per_day: rnd(per(appMin), 1), levels_per_day: rnd(per(totals.levels), 2),
    questions_per_day: rnd(per(totals.questions), 1), accuracy_pct: totals.questions ? rnd((100 * totals.correct) / totals.questions, 1) : null,
    actual_usd_per_day: rnd(per(totals.actual_usd), 4), list_usd_per_day: rnd(per(totals.list_usd), 4),
    actual_usd_per_hour: hours > 0 ? rnd(totals.actual_usd / hours, 4) : null, list_usd_per_hour: hours > 0 ? rnd(totals.list_usd / hours, 4) : null,
    list_usd_per_level: totals.levels ? rnd(totals.list_usd / totals.levels, 4) : null,
    waited_share_pct: totals.level_opens ? rnd((100 * totals.level_waits) / totals.level_opens, 1) : null,
    hours_basis: studyMin ? 'study timer' : 'app active time',
  };

  return {
    generated_at: new Date(now).toISOString(), timezone: 'UTC', days, accounts: who, totals, averages, daily,
    kept_apart: cost.buckets,
  };
}

module.exports = { compute, accounts };
