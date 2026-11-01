/**
 * The beta comparison: does the tailored product beat the base product for the same kind of learner? Built in, so it runs by itself.
 * docs/BETA-COMPARISON.md is the plain-language version (design, primary outcome, stopping rule, ethics, how to read the report).
 *
 * Learners are drawn into two arms once, at random, and kept there (services/beta-arm.js). This file reads what the app ALREADY records
 * for them (sessions, answers/events), adds nothing to collect, and writes `data/beta-report.json` once a day (startDaily, called from
 * server.js) and on demand for the owner (routes/admin.js GET /api/admin/beta-report). It never calls a model and never writes to a learner's
 * records.
 *
 * Outcomes. Counted from each learner's `assigned_at` onward, so nothing from before the draw (when everyone had the same product) leaks in.
 *   PRIMARY, named before any data existed: retained skills per practice hour (RETAINED_PER_HOUR). A skill is "mastered" the first time an
 *     answer leaves its mastery at 0.8 or more (the app's own line for "known"; a skill credited by a placement or skip is not counted); it is
 *     "retained" when the first answer on it at least 7 days later is right. Practice hours are the learner's sittings (placement and skip
 *     sittings left out), each capped at 45 minutes so a tab left open is not counted. Only skills mastered, and hours spent, up to 7 days
 *     ago are read, so every skill counted has had its chance to be retested. The arm's figure is a ratio of totals (sum of retained skills /
 *     sum of hours), with the delta-method variance.
 *   SECONDARY (six; each interval at alpha / 6, the Bonferroni correction for six comparisons): skills mastered per practice hour; delayed
 *     recall at about 7 days (gap 5-10 days) and about 30 days (gap 21-45 days), as the share of answers on a skill last answered that long
 *     before that are right; return within 7 days (a second day of use within a week of the first); average sitting length; the average score
 *     on checkpoints (Master quizzes, Grand quizzes, Graduation exams, essays).
 *
 * The interval is the always-valid one in services/beta-stats.js, so opening the report daily cannot inflate false positives. A learner is
 * left out of the numbers when they would not be drawn today (services/beta-arm.js ineligibleReason): a parent who withdraws the optional
 * measurement agreement removes the child from the report. The report holds counts and statistics only, never a learner id or an answer.
 */
const fs = require('fs');
const path = require('path');
const stats = require('./beta-stats');
const layout = require('../config/level-layout');

const DAY = 86400000;
const HOUR = 3600000;
const MASTERED_AT = 0.8;          // mastery at or above this is "known" (services/details.js, act-plan.js use the same line)
const RETEST_AFTER_DAYS = 7;      // retained = right on the first answer at least this long after mastering
const SESSION_CAP_MS = 45 * 60000; // a sitting counts at most this long
const MIN_PRACTICE_HOURS = 0;     // a learner with no practice time has no rate and is left out of the two per-hour ratios
const RECALL_BUCKETS = { recall_7d: [5, 10], recall_30d: [21, 45] };
const NOT_PRACTICE = new Set(['placement', 'skip']);
const PLAN_GAIN = 0.2;            // the gain the power line asks about
const VERSION = 1;

const PRIMARY = 'retained_per_hour';
const OUTCOMES = [
  { id: PRIMARY, label: 'Retained skills per practice hour', kind: 'ratio', primary: true, unit: 'skills per hour', note: 'Mastered and still right 7+ days later, per hour practised (skills mastered up to 7 days ago).' },
  { id: 'mastered_per_hour', label: 'Skills mastered per practice hour', kind: 'ratio', unit: 'skills per hour', note: 'Skills that reached the app\'s "known" line, per hour practised.' },
  { id: 'recall_7d', label: 'Recall after about 7 days', kind: 'mean', unit: 'share right', note: 'Answers on a skill last answered 5 to 10 days earlier.' },
  { id: 'recall_30d', label: 'Recall after about 30 days', kind: 'mean', unit: 'share right', note: 'Answers on a skill last answered 21 to 45 days earlier.' },
  { id: 'return_7d', label: 'Came back within 7 days', kind: 'mean', unit: 'share of learners', note: 'A second day of use within a week of the first.' },
  { id: 'session_minutes', label: 'Sitting length', kind: 'mean', unit: 'minutes', note: 'Average sitting, each capped at 45 minutes.' },
  { id: 'checkpoint_score', label: 'Checkpoint score', kind: 'mean', unit: 'share right', note: 'Average score on Master and Grand quizzes, Graduation exams and essays.' },
];
const SECONDARY = OUTCOMES.filter((o) => !o.primary);

const t = (iso) => { const v = Date.parse(iso); return Number.isFinite(v) ? v : null; };
const dayNo = (ms) => Math.floor(ms / DAY);
const round = (v, d = 4) => (v === null || v === undefined || !Number.isFinite(v) ? null : Number(v.toFixed(d)));

// ── one learner's outcomes ──────────────────────────────────────────────────
/**
 * @param {{beta_arm:{assigned_at:string}}} user
 * @param {{sessions:object[], events:object[]}} mine that learner's sittings and events (any order)
 * @param {number} now ms
 * @returns {Object<string, any>} outcome id -> a number, a [y, x] pair for a ratio, or null when the learner has no value yet
 */
function learnerOutcomes(user, mine, now) {
  const from = t(user.beta_arm.assigned_at);
  const cutoff = now - RETEST_AFTER_DAYS * DAY;
  const out = Object.fromEntries(OUTCOMES.map((o) => [o.id, null]));

  // Sittings.
  const sits = mine.sessions.map((s) => ({ s, at: t(s.started_at || s.created_at), end: t(s.ended_at) })).filter((x) => x.at !== null && x.at >= from);
  const practice = sits.filter((x) => !NOT_PRACTICE.has(x.s.kind));
  const dur = (x) => (x.end !== null && x.end > x.at ? Math.min(x.end - x.at, SESSION_CAP_MS) : 0);
  const hoursAll = practice.reduce((a, x) => a + dur(x), 0) / HOUR;
  const hoursCut = practice.filter((x) => x.at <= cutoff).reduce((a, x) => a + dur(x), 0) / HOUR;

  // Skills: first crossing of the known line, and the first answer a week or more later.
  const events = mine.events.map((e) => ({ e, at: t(e.created_at) })).filter((x) => x.at !== null).sort((a, b) => a.at - b.at || (a.e.id || 0) - (b.e.id || 0));
  const bySkill = new Map();
  for (const x of events) { if (!bySkill.has(x.e.skill_id)) bySkill.set(x.e.skill_id, []); bySkill.get(x.e.skill_id).push(x); }
  let mastered = 0; let masteredCut = 0; let retained = 0; let tested = 0;
  const recall = { recall_7d: [], recall_30d: [] };
  for (const list of bySkill.values()) {
    const cross = list.find((x) => Number(x.e.mastery_after) >= MASTERED_AT);
    if (cross && !cross.e.skipped && cross.at >= from) {
      mastered++;
      if (cross.at <= cutoff) {
        masteredCut++;
        const retest = list.find((x) => !x.e.skipped && x.at >= cross.at + RETEST_AFTER_DAYS * DAY);
        if (retest) { tested++; if (retest.e.correct === true) retained++; }
      }
    }
    const real = list.filter((x) => !x.e.skipped && x.at >= from);
    for (let i = 1; i < real.length; i++) {
      const gap = (real[i].at - real[i - 1].at) / DAY;
      for (const [id, [lo, hi]] of Object.entries(RECALL_BUCKETS)) if (gap >= lo && gap <= hi) recall[id].push(real[i].e.correct === true ? 1 : 0);
    }
  }
  const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);

  if (hoursCut > MIN_PRACTICE_HOURS) out[PRIMARY] = [retained, hoursCut];
  if (hoursAll > MIN_PRACTICE_HOURS) out.mastered_per_hour = [mastered, hoursAll];
  out.recall_7d = mean(recall.recall_7d);
  out.recall_30d = mean(recall.recall_30d);

  // Return within 7 days of the first day of use (only once that week is over).
  if (sits.length) {
    const first = Math.min(...sits.map((x) => x.at));
    if (first + 7 * DAY <= now) out.return_7d = sits.some((x) => dayNo(x.at) > dayNo(first) && x.at <= first + 7 * DAY) ? 1 : 0;
  }
  const lengths = practice.map(dur).filter((d) => d > 0);
  out.session_minutes = lengths.length ? mean(lengths) / 60000 : null;
  const cps = sits.filter((x) => layout.isCheckpoint(x.s.kind) && x.end !== null && Number.isFinite(Number(x.s.score))).map((x) => Number(x.s.score));
  out.checkpoint_score = mean(cps);
  out._diag = { mastered_cut: masteredCut, tested };
  return out;
}

// ── the report ──────────────────────────────────────────────────────────────
const fmt = (v, unit) => {
  if (v === null || v === undefined) return 'n/a';
  if (unit === 'share right' || unit === 'share of learners') return `${(v * 100).toFixed(0)}%`;
  if (unit === 'minutes') return `${v.toFixed(1)} min`;
  return v.toFixed(2);
};

/** Plain-English reading of one outcome's result. */
function readingOf(o, r) {
  const noun = o.label.toLowerCase();
  if (r.status === 'too_few') {
    const need = stats.MIN_ARM_N;
    return `Too early to read ${noun}: ${r.tailored.n} tailored and ${r.base.n} base learners have a value so far, and it is not read until each group has ${need}.`;
  }
  const d = r.diff;
  const span = `between ${fmt(d.lo, o.unit)} and ${fmt(d.hi, o.unit)} (in ${o.unit}; negative means worse)`;
  if (r.status === 'tailored_ahead') return `Tailored is ahead on ${noun}: the true difference is very likely ${span}; it excludes zero at the ${r.alpha_label} level.`;
  if (r.status === 'tailored_behind') return `Tailored is BEHIND on ${noun}: the true difference is very likely ${span}. This needs a look before anything else.`;
  if (r.status === 'no_gain_that_large') return `No sign of a gain as big as 20% on ${noun}: the true difference is very likely ${span}, and the top of that is below a 20% gain.`;
  const more = r.power && r.power.sequential_total && r.power.more_learners_for_sequential !== null
    ? ` About ${r.power.more_learners_for_sequential} more learners would be needed to settle a 20% gain.` : '';
  return `Too early to tell on ${noun}: the true difference could be ${span}, so no effect and a 20% gain are both still possible.${more}`;
}

/** Build one outcome's block from the two arms' per-learner values. */
function summarizeOutcome(o, valuesT, valuesB, opts) {
  const alpha = o.primary ? opts.alpha : opts.alpha / SECONDARY.length;
  const sum = (vals) => (o.kind === 'ratio' ? stats.summarizeRatio(vals) : stats.summarizeMean(vals));
  const T = sum(valuesT); const B = sum(valuesB);
  const r = {
    id: o.id, label: o.label, unit: o.unit, kind: o.kind, primary: !!o.primary, note: o.note, alpha, alpha_label: `${((1 - alpha) * 100).toFixed(alpha < 0.01 ? 2 : 1).replace(/\.0$/, '')}%`,
    tailored: { n: T.n, estimate: round(T.estimate) }, base: { n: B.n, estimate: round(B.estimate) },
    status: 'too_few', diff: null, welch_single_look: null, relative: null, power: null,
  };
  if (T.n >= stats.MIN_ARM_N && B.n >= stats.MIN_ARM_N && T.v !== null && B.v !== null) {
    const cs = stats.sequentialInterval(T, B, alpha);
    const w = stats.welchInterval(T, B, alpha);
    r.diff = { estimate: round(cs.estimate), lo: round(cs.lo), hi: round(cs.hi), method: cs.method };
    r.welch_single_look = { lo: round(w.lo), hi: round(w.hi), note: 'Right only at one planned look; shown to compare, never used for a verdict.' };
    if (B.estimate > 0) r.relative = { estimate: round(cs.estimate / B.estimate), lo: round(cs.lo / B.estimate), hi: round(cs.hi / B.estimate), note: 'The difference interval divided by the base arm\'s estimate; the base estimate has its own uncertainty.' };
    const gain = PLAN_GAIN * Math.max(B.estimate, 0);
    const shareBase = B.n / (T.n + B.n);
    const fixed = stats.nForPower(T.unit_var, B.unit_var, gain, shareBase);
    const seq = stats.nForSequential(T.unit_var, B.unit_var, gain, shareBase, alpha);
    r.power = {
      planned_gain: round(gain), gain_basis: '20% of the base arm\'s estimate',
      fixed_sample_total: fixed ? fixed.total : null, sequential_total: seq ? seq.total : null,
      learners_now: T.n + B.n,
      more_learners_for_sequential: seq ? Math.max(0, seq.total - (T.n + B.n)) : null,
      more_learners_for_fixed: fixed ? Math.max(0, fixed.total - (T.n + B.n)) : null,
      note: 'fixed_sample_total: 80% power at one planned look. sequential_total: where an observed 20% gain would just clear zero on the always-valid interval; plan on at least this.',
    };
    if (cs.lo > 0) r.status = 'tailored_ahead';
    else if (cs.hi < 0) r.status = 'tailored_behind';
    else if (B.estimate > 0 && cs.hi < gain) r.status = 'no_gain_that_large';
    else r.status = 'too_early';
  }
  r.reading = readingOf(o, r);
  return r;
}

/**
 * The whole report from plain rows (no database), so the simulation and the tests run the same code.
 * @param {{users:object[], sessions:object[], events:object[], consents?:Function, eligible?:(u:object)=>string|null, now?:number, alpha?:number, share?:number}} input
 */
function buildReport({ users, sessions, events, eligible, now = Date.now(), alpha = stats.DEFAULT_ALPHA, share = 0.2 }) {
  const enrolled = users.filter((u) => u.beta_arm && (u.beta_arm.arm === 'tailored' || u.beta_arm.arm === 'base'));
  const counted = []; const leftOut = {};
  for (const u of enrolled) {
    const why = eligible ? eligible(u) : null;
    if (why) { leftOut[why] = (leftOut[why] || 0) + 1; continue; }
    counted.push(u);
  }
  const ids = new Set(counted.map((u) => u.id));
  const sByU = new Map(); const eByU = new Map();
  for (const s of sessions) if (ids.has(s.user_id)) { if (!sByU.has(s.user_id)) sByU.set(s.user_id, []); sByU.get(s.user_id).push(s); }
  for (const e of events) if (ids.has(e.user_id)) { if (!eByU.has(e.user_id)) eByU.set(e.user_id, []); eByU.get(e.user_id).push(e); }

  const per = { tailored: [], base: [] };
  const diag = { tailored: { mastered: 0, tested: 0 }, base: { mastered: 0, tested: 0 } };
  for (const u of counted) {
    const o = learnerOutcomes(u, { sessions: sByU.get(u.id) || [], events: eByU.get(u.id) || [] }, now);
    per[u.beta_arm.arm].push(o);
    diag[u.beta_arm.arm].mastered += o._diag.mastered_cut;
    diag[u.beta_arm.arm].tested += o._diag.tested;
  }

  const outcomes = OUTCOMES.map((o) => {
    const pick = (arm) => per[arm].map((p) => p[o.id]).filter((v) => v !== null && v !== undefined);
    return summarizeOutcome(o, pick('tailored'), pick('base'), { alpha });
  });
  const primary = outcomes.find((o) => o.primary);

  const strata = {};
  for (const u of counted) {
    const k = u.beta_arm.stratum || 'unknown';
    strata[k] = strata[k] || { tailored: 0, base: 0 };
    strata[k][u.beta_arm.arm]++;
  }
  const retest = (a) => (diag[a].mastered ? round(diag[a].tested / diag[a].mastered, 3) : null);
  const cautions = [
    'Everything here is real-learner data from the beta, not a simulation; the simulated checks of the method are in docs/BETA-COMPARISON.md.',
    'Learners are randomised, so a difference is caused by the product, but small groups swing: read the interval, not the middle number.',
    'The base group is small by design (a holdout), so it is the bottleneck for every outcome.',
  ];
  const rt = retest('tailored'); const rb = retest('base');
  if (rt !== null && rb !== null && Math.abs(rt - rb) > 0.15) {
    cautions.push(`Retest coverage differs: ${(rt * 100).toFixed(0)}% of tailored learners' mastered skills had a retest at 7+ days, against ${(rb * 100).toFixed(0)}% for base. The primary counts only skills that were retested, so read it with that in mind.`);
  }

  return {
    version: VERSION,
    generated_at: new Date(now).toISOString(),
    design: {
      arms: { tailored: 'the app with tailoring on', base: 'the base product (as the owner account gets it), no tailoring, speed levers off' },
      holdout_share_planned: share,
      primary_outcome: PRIMARY,
      secondary_outcomes: SECONDARY.map((o) => o.id),
      alpha_primary: alpha,
      alpha_each_secondary: round(alpha / SECONDARY.length, 5),
      correction: `Bonferroni over ${SECONDARY.length} secondary outcomes`,
      interval: { method: 'mSPRT confidence sequence (always valid: safe to read every day)', tau_std: stats.TAU_STD, min_learners_per_arm: stats.MIN_ARM_N },
      outcome_window: 'from each learner\'s draw date; hours and mastered skills up to 7 days ago for the primary',
      planned_gain_for_power: PLAN_GAIN,
    },
    enrolment: {
      in_comparison: counted.length,
      by_arm: { tailored: per.tailored.length, base: per.base.length },
      share_base: counted.length ? round(per.base.length / counted.length, 3) : null,
      by_stratum: strata,
      left_out_of_numbers: leftOut,
      retest_coverage: { tailored: rt, base: rb },
    },
    primary: primary ? { id: primary.id, status: primary.status, reading: primary.reading } : null,
    summary: summaryLine(primary, counted.length),
    outcomes,
    cautions,
  };
}

function summaryLine(primary, n) {
  if (!n) return 'No learners are in the comparison yet. Learners are drawn at first use once they have answered the age screen.';
  if (!primary) return 'No primary result.';
  return primary.reading;
}

// ── reading the app's records ───────────────────────────────────────────────
function compute({ now = Date.now() } = {}) {
  const db = require('../config/db'); // eslint-disable-line global-require
  const arm = require('./beta-arm'); // eslint-disable-line global-require
  return buildReport({
    users: db.all('users'), sessions: db.all('sessions'), events: db.all('events'),
    eligible: (u) => { const why = arm.ineligibleReason(u); return why === 'off' ? null : why; },
    now, share: arm.share(),
  });
}

const reportFile = () => process.env.BETA_REPORT_FILE || path.join(__dirname, '..', 'data', 'beta-report.json');

function writeReport(report) {
  const file = reportFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(report, null, 2), 'utf8');
  fs.renameSync(tmp, file);
  return file;
}

function readReport() {
  try { return JSON.parse(fs.readFileSync(reportFile(), 'utf8')); } catch { return null; }
}

/** Compute and write today's report. */
function runDaily() {
  const report = compute();
  writeReport(report);
  return report;
}

/** The daily job: checks hourly, writes when the file is missing or more than 23 hours old. BETA_REPORT_DAILY=off disables it. */
function startDaily() {
  if (String(process.env.BETA_REPORT_DAILY || 'on').toLowerCase() === 'off' || !require('../config/owner').betaCompareOn()) return null; // eslint-disable-line global-require
  const due = () => { const r = readReport(); return !r || !(Date.now() - Date.parse(r.generated_at) < 23 * HOUR); };
  const tick = () => { try { if (due()) runDaily(); } catch (err) { console.warn(`beta report: ${err.message}`); } };
  const first = setTimeout(tick, 60 * 1000);
  const timer = setInterval(tick, HOUR);
  if (first.unref) first.unref();
  if (timer.unref) timer.unref();
  return timer;
}

module.exports = {
  PRIMARY, OUTCOMES, SECONDARY, MASTERED_AT, RETEST_AFTER_DAYS, SESSION_CAP_MS, RECALL_BUCKETS, PLAN_GAIN,
  learnerOutcomes, summarizeOutcome, buildReport, compute, runDaily, startDaily, reportFile, readReport, writeReport,
};
