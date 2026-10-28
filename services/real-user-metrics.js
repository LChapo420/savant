/**
 * Real-user metrics: the numbers a fundraising application asks for, computed
 * from the data store with test, demo and team accounts kept out of them.
 * docs/METRICS.md is the plain-language version of every rule below; keep the
 * two in step.
 *
 * Who counts (classify(), first rule that matches wins):
 *
 *   1. demo     the account is flagged demo: `is_demo: true` or `account_kind: 'demo'`
 *               (scripts/seed-demo-account.js sets both).
 *   2. test     the account is flagged test: `is_test: true` or `account_kind: 'test'`.
 *   3. test     the email is in METRICS_EXCLUDE_EMAILS (comma separated).
 *   4. test     the email's domain is one no real person can receive mail at: a
 *               reserved test TLD (.test, .example, .invalid, .localhost; RFC 2606
 *               and 6761) or example.com / example.net / example.org. A child
 *               account has no email of its own, so its parent's email is checked.
 *   5. founder  the owner's address (OWNER_EMAIL, config/owner.js), FOUNDER_EMAILS,
 *               ADMIN_EMAILS, or any address at a team domain (TEAM_EMAIL_DOMAINS,
 *               default savantedu.com). Shown on its own as "founder", never as a user.
 *   6. real     everyone else.
 *
 * What counts as activity on a day (UTC calendar days): any row the learner made
 * by doing something — a sitting started or finished, a question served or
 * answered, a learning event, a study session's span, a tutor message they typed,
 * a chat assist, level feedback, a chess or piano attempt, a lesson page finished.
 * Signing up, or only signing in, is not activity.
 *
 * Nothing here writes, and nothing here calls a model.
 */
const fs = require('fs');
const path = require('path');
const owner = require('../config/owner');

const DAY_MS = 86400000;
const RESERVED_TLDS = ['test', 'example', 'invalid', 'localhost'];
const RESERVED_DOMAINS = ['example.com', 'example.net', 'example.org'];

const list = (v) => String(v || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const norm = (e) => String(e || '').trim().toLowerCase();
const domainOf = (email) => { const at = email.lastIndexOf('@'); return at >= 0 ? email.slice(at + 1) : ''; };
const dayOf = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null; };
const monthOf = (day) => (day ? day.slice(0, 7) : null);
const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const round = (n, d = 2) => (n === null || !Number.isFinite(n) ? null : Number(n.toFixed(d)));
const ratio = (a, b) => (b ? a / b : null);

/** The rules as data, so the page and the CSV can say exactly what was applied. */
function rules(env = process.env) {
  return {
    reserved_tlds: RESERVED_TLDS.map((t) => `.${t}`),
    reserved_domains: RESERVED_DOMAINS.slice(),
    exclude_emails: list(env.METRICS_EXCLUDE_EMAILS),
    founder_emails: [...new Set([owner.ownerEmail(), ...list(env.FOUNDER_EMAILS), ...list(env.ADMIN_EMAILS)])],
    team_domains: list(env.TEAM_EMAIL_DOMAINS === undefined ? 'savantedu.com' : env.TEAM_EMAIL_DOMAINS),
  };
}

function isReservedDomain(domain) {
  if (!domain) return false;
  const tld = domain.split('.').pop();
  return RESERVED_TLDS.includes(tld) || RESERVED_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

/**
 * Which group an account is in, and the rule that put it there.
 * @param {object} user  a users row
 * @param {object} r     rules()
 * @param {string} [parentEmail]  a child account's parent email (parental_consents)
 */
function classify(user, r, parentEmail = '') {
  const kind = norm(user.account_kind);
  if (user.is_demo === true || kind === 'demo') return { group: 'demo', rule: 'flagged demo' };
  if (user.is_test === true || kind === 'test') return { group: 'test', rule: 'flagged test' };
  const email = norm(user.email);
  const parent = norm(parentEmail);
  if (email && r.exclude_emails.includes(email)) return { group: 'test', rule: 'listed in METRICS_EXCLUDE_EMAILS' };
  if (isReservedDomain(domainOf(email))) return { group: 'test', rule: `reserved test domain (${domainOf(email)})` };
  if (!email && isReservedDomain(domainOf(parent))) return { group: 'test', rule: `parent email on a reserved test domain (${domainOf(parent)})` };
  if (email && r.founder_emails.includes(email)) return { group: 'founder', rule: 'owner / founder / admin address' };
  if (email && r.team_domains.includes(domainOf(email))) return { group: 'founder', rule: `team domain (${domainOf(email)})` };
  return { group: 'real', rule: null };
}

/**
 * Every timestamp of something the learner did, per user id. Each source is
 * listed by name so the documentation and this list can be compared.
 */
const ACTIVITY_SOURCES = [
  ['sessions', (r) => [r.started_at, r.ended_at]],
  ['items', (r) => [r.created_at, r.answered_at]],
  ['events', (r) => [r.created_at]],
  ['study_sessions', (r) => [r.started_at || r.created_at, r.ended_at, r.last_activity_at]],
  ['assist_chats', (r) => [r.created_at]],
  ['level_feedback', (r) => [r.submitted_at || r.created_at]],
  ['level_signals', (r) => [r.created_at]],
  ['chess_puzzle_attempts', (r) => [r.created_at]],
  ['chess_rush_runs', (r) => [r.created_at]],
  ['chess_drill_runs', (r) => [r.created_at]],
  ['piano_song_results', (r) => [r.updated_at || r.created_at]],
  ['essays', (r) => [r.created_at]],
  // The tutor keeps one row per learner; each turn the learner typed carries its own time.
  ['tutor_memory', (r) => (r.turns || []).filter((t) => t.role === 'user').map((t) => t.at)],
];

function activityDays(store) {
  const days = new Map();
  for (const [name, stamps] of ACTIVITY_SOURCES) {
    for (const row of store.all(name) || []) {
      if (row.user_id === null || row.user_id === undefined) continue;
      for (const at of stamps(row)) {
        const d = at ? dayOf(at) : null;
        if (!d) continue;
        if (!days.has(row.user_id)) days.set(row.user_id, new Set());
        days.get(row.user_id).add(d);
      }
    }
  }
  return days;
}

/** A finished sitting's length in minutes, capped: a tab left open is not study time. */
const SITTING_CAP_MIN = 90;
function sittingMinutes(s) {
  const a = Date.parse(s.started_at);
  const b = Date.parse(s.ended_at);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.min(SITTING_CAP_MIN, (b - a) / 60000);
}

/**
 * Paid AI spend from the ledgers in `dir` (files named *ledger*.json). Each
 * ledger is machine-wide: it counts the app AND the build pipeline on that
 * machine, so it cannot be split per learner. Only the last 1,000 log entries
 * are kept, so a month older than the oldest entry is marked partial.
 */
function readLedgers(dir) {
  const out = [];
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => /ledger.*\.json$/i.test(f)).sort(); } catch { return out; }
  for (const file of files) {
    let data;
    try { data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')); } catch (err) {
      out.push({ file, error: `unreadable: ${err.message}`, by_month: {} });
      continue;
    }
    const log = Array.isArray(data.log) ? data.log : [];
    const byMonth = {};
    let oldest = null;
    for (const e of log) {
      const d = dayOf(e && e.at);
      if (!d) continue;
      if (!oldest || d < oldest) oldest = d;
      if (e.refused === true || /^refused/.test(String(e.outcome || ''))) continue;
      const usd = Number(e.usd !== undefined ? e.usd : e.counted);
      if (!Number.isFinite(usd) || usd <= 0) continue;
      const m = monthOf(d);
      byMonth[m] = (byMonth[m] || 0) + usd;
    }
    const lifetime = data.counted_usd !== undefined
      ? Number(data.counted_usd)
      : Number(data.settled_usd || 0) + Number(data.seed_usd || 0);
    out.push({
      file,
      lifetime_usd: round(lifetime, 4),
      seed_usd: data.seed_usd !== undefined ? Number(data.seed_usd) : null,
      calls: Number(data.calls || 0),
      log_entries: log.length,
      oldest_log_day: oldest,
      // The log is trimmed to its last 1,000 entries; once it has been, months
      // before its oldest entry are incomplete.
      truncated: log.length >= 1000 || Number(data.calls || 0) > log.length,
      by_month: Object.fromEntries(Object.entries(byMonth).map(([k, v]) => [k, round(v, 4)])),
    });
  }
  return out;
}

/**
 * Everything the metrics view shows.
 * @param {{ all: (name: string) => object[] }} store  config/db.js, or a stand-in
 * @param {object} [opts]
 * @param {number} [opts.now]       epoch ms (tests pin it)
 * @param {number} [opts.days]      length of the daily series (default 30, max 366)
 * @param {string} [opts.ledgerDir] where the *ledger*.json files are
 * @param {object} [opts.env]       environment for the rules (default process.env)
 */
function compute(store, opts = {}) {
  const now = opts.now || Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  const days = Math.max(1, Math.min(366, Number(opts.days) || 30));
  const r = rules(opts.env || process.env);

  // ── who counts ─────────────────────────────────────────────────────────────
  const parentOf = new Map((store.all('parental_consents') || []).map((c) => [c.child_user_id, c.parent_email]));
  const users = store.all('users') || [];
  const groups = { real: [], founder: [], test: [], demo: [] };
  const excluded = [];
  const groupOf = new Map();
  for (const u of users) {
    const c = classify(u, r, parentOf.get(u.id));
    groups[c.group].push(u);
    groupOf.set(u.id, c.group);
    if (c.group !== 'real') {
      excluded.push({ id: u.id, email: u.email || null, username: u.username || null, name: u.display_name || null, group: c.group, rule: c.rule, joined: dayOf(u.created_at) });
    }
  }
  const realIds = new Set(groups.real.map((u) => u.id));
  const signupDay = new Map(users.map((u) => [u.id, dayOf(u.created_at)]));

  // ── activity ───────────────────────────────────────────────────────────────
  const activity = activityDays(store);
  const daysFor = (id) => activity.get(id) || new Set();

  const sessionsAll = store.all('sessions') || [];
  const studyAll = store.all('study_sessions') || [];
  const usageAll = store.all('ai_usage') || [];

  // ── sign-ups and active learners per day ───────────────────────────────────
  const from = addDays(today, -(days - 1));
  const daily = [];
  for (let d = from; d <= today; d = addDays(d, 1)) {
    const row = { day: d, signups: 0, signups_excluded: 0, active_learners: 0, founder_active: 0 };
    daily.push(row);
  }
  const dailyBy = new Map(daily.map((x) => [x.day, x]));
  for (const u of users) {
    const row = dailyBy.get(signupDay.get(u.id));
    if (!row) continue;
    if (realIds.has(u.id)) row.signups++;
    else row.signups_excluded++;
  }
  for (const [id, set] of activity) {
    const g = groupOf.get(id);
    for (const d of set) {
      const row = dailyBy.get(d);
      if (!row) continue;
      if (g === 'real') row.active_learners++;
      else if (g === 'founder') row.founder_active++;
    }
  }

  // ── retention cohorts (by UTC sign-up day) ─────────────────────────────────
  // Day-N return: active on exactly sign-up day + N. A cohort counts toward a
  // rate only once day N is over (sign-up day + N is before today).
  const cohortMap = new Map();
  for (const u of groups.real) {
    const d = signupDay.get(u.id);
    if (!d) continue;
    if (!cohortMap.has(d)) cohortMap.set(d, { day: d, size: 0, day1_returned: 0, day7_returned: 0, week1_returned: 0 });
    const c = cohortMap.get(d);
    c.size++;
    const set = daysFor(u.id);
    if (set.has(addDays(d, 1))) c.day1_returned++;
    if (set.has(addDays(d, 7))) c.day7_returned++;
    for (let k = 1; k <= 7; k++) if (set.has(addDays(d, k))) { c.week1_returned++; break; }
  }
  const cohorts = [...cohortMap.values()].sort((a, b) => a.day.localeCompare(b.day)).map((c) => {
    const d1Done = addDays(c.day, 1) < today;
    const d7Done = addDays(c.day, 7) < today;
    return {
      ...c,
      day1_complete: d1Done,
      day7_complete: d7Done,
      day1_rate: d1Done ? round(ratio(c.day1_returned, c.size), 4) : null,
      day7_rate: d7Done ? round(ratio(c.day7_returned, c.size), 4) : null,
      week1_rate: d7Done ? round(ratio(c.week1_returned, c.size), 4) : null,
    };
  });
  const pooled = (key, done) => {
    const eligible = cohorts.filter((c) => c[done]);
    const size = eligible.reduce((s, c) => s + c.size, 0);
    const back = eligible.reduce((s, c) => s + c[key], 0);
    return { eligible_users: size, returned: back, rate: size ? round(back / size, 4) : null };
  };

  // ── per month: active learners, sessions, minutes, AI cost ─────────────────
  const monthsSeen = new Set([monthOf(today)]);
  for (const u of users) if (signupDay.get(u.id)) monthsSeen.add(monthOf(signupDay.get(u.id)));
  for (const set of activity.values()) for (const d of set) monthsSeen.add(monthOf(d));
  const ledgers = readLedgers(opts.ledgerDir || path.join(__dirname, '..', 'data'));
  for (const l of ledgers) for (const m of Object.keys(l.by_month)) monthsSeen.add(m);

  function periodStats(ids, inPeriod, monthKey) {
    const idSet = new Set(ids);
    const active = ids.filter((id) => [...daysFor(id)].some(inPeriod));
    const activeSet = new Set(active);
    const sittings = sessionsAll.filter((s) => activeSet.has(s.user_id) && inPeriod(dayOf(s.started_at)));
    const study = studyAll.filter((s) => activeSet.has(s.user_id) && inPeriod(s.local_day || dayOf(s.started_at || s.created_at)));
    const studyMin = study.reduce((t, s) => t + (Number(s.active_ms) || 0) / 60000, 0);
    const sittingMin = sittings.reduce((t, s) => t + sittingMinutes(s), 0);
    const cents = usageAll.filter((u) => idSet.has(u.user_id) && inPeriod(u.day)).reduce((t, u) => t + (Number(u.cents) || 0), 0);
    const calls = usageAll.filter((u) => idSet.has(u.user_id) && inPeriod(u.day)).reduce((t, u) => t + (Number(u.calls) || 0), 0);
    const out = {
      active_learners: active.length,
      active_2plus_days: active.filter((id) => [...daysFor(id)].filter(inPeriod).length >= 2).length,
      sittings: sittings.length,
      sittings_per_active: round(ratio(sittings.length, active.length)),
      study_sessions: study.length,
      study_minutes: round(studyMin, 1),
      study_minutes_per_active: round(ratio(studyMin, active.length), 1),
      sitting_minutes: round(sittingMin, 1),
      sitting_minutes_per_active: round(ratio(sittingMin, active.length), 1),
      ai_calls: calls,
      ai_cost_usd_estimate: round(cents / 100, 4),
      ai_cost_per_active_usd_estimate: round(ratio(cents / 100, active.length), 4),
    };
    if (monthKey) {
      const ledgerUsd = ledgers.reduce((t, l) => t + (l.by_month[monthKey] || 0), 0);
      out.ledger_usd = round(ledgerUsd, 4);
      out.ledger_partial = ledgers.some((l) => l.truncated && l.oldest_log_day && l.oldest_log_day > `${monthKey}-01`);
      out.ledger_usd_per_active_upper_bound = round(ratio(ledgerUsd, active.length), 4);
    }
    return out;
  }

  const realList = [...realIds];
  const founderIds = groups.founder.map((u) => u.id);
  const months = [...monthsSeen].filter(Boolean).sort().map((m) => ({
    month: m,
    month_complete: m < monthOf(today),
    signups: groups.real.filter((u) => monthOf(signupDay.get(u.id)) === m).length,
    ...periodStats(realList, (d) => monthOf(d) === m, m),
    founder: (() => {
      const f = periodStats(founderIds, (d) => monthOf(d) === m, null);
      return { active: f.active_learners > 0, sittings: f.sittings, study_minutes: f.study_minutes, sitting_minutes: f.sitting_minutes, ai_cost_usd_estimate: f.ai_cost_usd_estimate };
    })(),
  }));

  const last30From = addDays(today, -29);
  const last30 = periodStats(realList, (d) => d >= last30From && d <= today, null);
  const allActiveDays = realList.map((id) => daysFor(id).size);

  const founderAll = groups.founder.map((u) => {
    const set = daysFor(u.id);
    const own = periodStats([u.id], () => true, null);
    return {
      id: u.id,
      email: u.email,
      name: u.display_name || null,
      joined: signupDay.get(u.id),
      active_days: set.size,
      last_active: [...set].sort().pop() || null,
      sittings: own.sittings,
      study_minutes: own.study_minutes,
      sitting_minutes: own.sitting_minutes,
      ai_cost_usd_estimate: own.ai_cost_usd_estimate,
    };
  });

  return {
    generated_at: new Date(now).toISOString(),
    today,
    timezone: 'UTC',
    rules: r,
    accounts: {
      total: users.length,
      real: groups.real.length,
      founder: groups.founder.length,
      test: groups.test.length,
      demo: groups.demo.length,
      excluded: excluded.length,
    },
    headline: {
      real_users: groups.real.length,
      ever_active: allActiveDays.filter((n) => n >= 1).length,
      active_2plus_days: allActiveDays.filter((n) => n >= 2).length,
      day1_return: pooled('day1_returned', 'day1_complete'),
      day7_return: pooled('day7_returned', 'day7_complete'),
      week1_return: pooled('week1_returned', 'day7_complete'),
      last_30_days: last30,
    },
    daily,
    cohorts,
    months,
    founder: founderAll,
    excluded,
    ledgers: ledgers.map((l) => ({ ...l })),
    notes: [
      'Days are UTC calendar days. Sign-up day is the day the account was created.',
      'Day-1 / day-7 return: share of a sign-up-day cohort with any activity exactly 1 / 7 days later. Week-1 return: any activity on days 1 to 7. A cohort is counted only once that day is over.',
      'Active learner: a real user with at least one activity on a day in the period. Signing in alone is not activity.',
      `Study minutes are the app's measured active time (Start session to End session, idle gaps capped at 5 minutes); learners who never press Start session have none. Sitting minutes are start-to-finish of finished sittings, each capped at ${SITTING_CAP_MIN} minutes, so they are an upper estimate.`,
      'AI cost per learner is an ESTIMATE: the app records token counts times list prices per call (ai_usage); free-tier providers (NVIDIA, free fallbacks) record $0.',
      'Ledger spend is machine-wide (app plus build pipeline plus the founder\'s own use) and cannot be split per learner; divided by active learners it is an upper bound, not a per-learner cost. The Standard Compute ledger prices tokens at a deliberately high assumed rate. A month marked partial predates the oldest kept ledger entry.',
    ],
  };
}

// ── CSV ──────────────────────────────────────────────────────────────────────

function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  // A leading = + - @ (or tab / CR) would be run as a formula by a spreadsheet.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const TABLES = {
  daily: (m) => [
    ['day', 'signups_real', 'signups_excluded', 'active_real_learners', 'founder_active'],
    ...m.daily.map((d) => [d.day, d.signups, d.signups_excluded, d.active_learners, d.founder_active]),
  ],
  cohorts: (m) => [
    ['signup_day', 'cohort_size', 'day1_returned', 'day1_rate', 'day7_returned', 'day7_rate', 'week1_returned', 'week1_rate', 'day1_complete', 'day7_complete'],
    ...m.cohorts.map((c) => [c.day, c.size, c.day1_returned, c.day1_rate, c.day7_returned, c.day7_rate, c.week1_returned, c.week1_rate, c.day1_complete, c.day7_complete]),
  ],
  monthly: (m) => [
    ['month', 'month_complete', 'signups_real', 'active_learners', 'active_2plus_days', 'sittings', 'sittings_per_active',
      'study_minutes', 'study_minutes_per_active', 'sitting_minutes_upper', 'sitting_minutes_per_active_upper',
      'ai_calls', 'ai_cost_usd_estimate', 'ai_cost_per_active_usd_estimate', 'ledger_usd_machine_wide', 'ledger_usd_per_active_upper_bound', 'ledger_partial',
      'founder_active', 'founder_sittings', 'founder_study_minutes', 'founder_ai_cost_usd_estimate'],
    ...m.months.map((x) => [x.month, x.month_complete, x.signups, x.active_learners, x.active_2plus_days, x.sittings, x.sittings_per_active,
      x.study_minutes, x.study_minutes_per_active, x.sitting_minutes, x.sitting_minutes_per_active,
      x.ai_calls, x.ai_cost_usd_estimate, x.ai_cost_per_active_usd_estimate, x.ledger_usd, x.ledger_usd_per_active_upper_bound, x.ledger_partial,
      x.founder.active, x.founder.sittings, x.founder.study_minutes, x.founder.ai_cost_usd_estimate]),
  ],
  excluded: (m) => [
    ['user_id', 'email', 'username', 'name', 'group', 'rule', 'joined'],
    ...m.excluded.map((e) => [e.id, e.email, e.username, e.name, e.group, e.rule, e.joined]),
  ],
};

function toCsv(metrics, table = 'daily') {
  const build = TABLES[table];
  if (!build) throw new Error(`unknown table: ${table}`);
  return `${build(metrics).map((row) => row.map(csvCell).join(',')).join('\n')}\n`;
}

module.exports = { compute, classify, rules, toCsv, TABLES: Object.keys(TABLES), ACTIVITY_SOURCES: ACTIVITY_SOURCES.map(([n]) => n), readLedgers, isReservedDomain };
