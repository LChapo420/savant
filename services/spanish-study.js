/**
 * The head-to-head study: Savant vs Duolingo for beginner Spanish (docs/yc/DUOLINGO-STUDY-PROTOCOL.md).
 *
 *   spanish_study           one per participant  { user_id, arm, draw, consent_at, age_group, parent_aware, no_recent_spanish, start_date, joined_at, left_at }
 *   spanish_study_checkins  one per participant per day  { user_id, day, minutes, screenshot, created_at }   (Duolingo arm: self-reported minutes)
 *   spanish_study_tests     { user_id, test, phase, correct, n, chance, taken_at }   (written by the sealed-test module, slice 2)
 *
 * Arm is drawn from the public drand beacon (the same one spanish-check/ uses) in permuted blocks of four, so the
 * arms stay even with a small sample and anyone can recompute a draw from the stored round and randomness.
 * Savant minutes come from the app's own study-session clock; Duolingo minutes are self-reported with a screenshot
 * of Duolingo's own stats. Nothing here calls a model or spends money. The sealed founder tests under
 * spanish-check/ are not touched: this module reads only the beacon helper from them.
 */
const crypto = require('crypto');
const db = require('../config/db');
const external = require('../spanish-check/lib/external');

const ARMS = ['savant', 'duolingo'];
const TESTS = ['listening', 'daily'];
const PHASES = ['pre', 'post'];
const DAYS = 14;               // OWNER: the protocol default; change here and in the protocol together
const DAILY_MINUTES = 20;      // OWNER: the same fixed daily time in both arms
const MAX_DAY_MINUTES = 240;
const BLOCK = ['savant', 'savant', 'duolingo', 'duolingo'];

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

/** Deterministic Fisher-Yates driven by sha256(randomness:i), so a block can be recomputed from the beacon. */
function shuffleFrom(randomness, items) {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = parseInt(sha(`${randomness}:${i}`).slice(0, 8), 16) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** The arm for the next person: position in the current block of four; a new block gets a permutation from this draw. */
function nextAssignment(draw, rows = db.all('spanish_study')) {
  const pos = rows.length % BLOCK.length;
  const perm = pos === 0 ? shuffleFrom(draw.randomness, BLOCK) : rows[rows.length - pos].draw.block;
  return { arm: perm[pos], block: perm, position: pos };
}

function cleanJoin(body) {
  const b = body || {};
  if (b.consent !== true) return { error: 'Tick the box to say you agree to join the study.' };
  if (b.age_group !== 'adult' && b.age_group !== 'teen') {
    return { error: 'Say whether you are 18 or older, or 13 to 17. The study is not open to anyone under 13.' };
  }
  if (b.age_group === 'teen' && b.parent_aware !== true) return { error: 'Tick the box to confirm a parent or guardian knows you are joining.' };
  if (b.no_recent_spanish !== true) return { error: 'The study is for beginners: confirm you have not studied Spanish in the last two years.' };
  return { value: { age_group: b.age_group, parent_aware: b.age_group === 'teen', no_recent_spanish: true } };
}

const getEntry = (userId) => db.findOne('spanish_study', (r) => r.user_id === userId && !r.left_at) || null;

/** Join and be assigned. `beaconFn` is injectable so tests never touch the network. */
async function join(userId, value, { now = Date.now(), beaconFn = () => external.fetchBeacon() } = {}) {
  const existing = getEntry(userId);
  if (existing) return existing;
  const beacon = await beaconFn();
  const asg = nextAssignment({ randomness: beacon.randomness });
  const at = new Date(now).toISOString();
  return db.insert('spanish_study', {
    user_id: userId, arm: asg.arm, consent_at: at, ...value,
    draw: { round: beacon.round, randomness: beacon.randomness, block: asg.block, position: asg.position },
    start_date: isoDay(now), joined_at: at, left_at: null,
  });
}

function leave(userId, now = Date.now()) {
  const e = getEntry(userId);
  if (!e) return false;
  db.update('spanish_study', e.id, { left_at: new Date(now).toISOString() });
  return true;
}

function windowOf(e) {
  const start = Date.parse(`${e.start_date}T00:00:00Z`);
  return { from: e.start_date, to: isoDay(start + (DAYS - 1) * 86400000), start };
}

/** One day's self-reported Duolingo minutes (one row per day; a repeat replaces it). Savant minutes need no check-in. */
function checkin(userId, body, now = Date.now()) {
  const e = getEntry(userId);
  if (!e) return { error: 'You are not in the study.', status: 404 };
  const w = windowOf(e);
  const day = body && body.day ? String(body.day) : isoDay(now);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(day))) return { error: 'Use a date like 2026-11-20.', status: 400 };
  if (day < w.from || day > w.to) return { error: `Study days run from ${w.from} to ${w.to}.`, status: 400 };
  if (day > isoDay(now)) return { error: 'You cannot check in for a day that has not happened.', status: 400 };
  const minutes = Number(body && body.minutes);
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > MAX_DAY_MINUTES) return { error: `Minutes must be between 0 and ${MAX_DAY_MINUTES}.`, status: 400 };
  const shot = body && body.screenshot === true;
  const prior = db.findOne('spanish_study_checkins', (r) => r.user_id === userId && r.day === day);
  const row = { user_id: userId, day, minutes: Math.round(minutes), screenshot: shot, created_at: new Date(now).toISOString() };
  return { value: prior ? db.update('spanish_study_checkins', prior.id, row) : db.insert('spanish_study_checkins', row) };
}

/** Record one scored sitting. `chance` is the guessing rate of the item format (0.25 for four choices). */
function recordTest(userId, { test, phase, correct, n, chance, taken_at }) {
  if (!TESTS.includes(test) || !PHASES.includes(phase)) throw new Error('bad test or phase');
  if (!Number.isInteger(correct) || !Number.isInteger(n) || n <= 0 || correct < 0 || correct > n) throw new Error('bad score');
  if (!(chance >= 0 && chance < 1)) throw new Error('bad chance rate');
  const prior = db.findOne('spanish_study_tests', (r) => r.user_id === userId && r.test === test && r.phase === phase);
  if (prior) return prior;   // one sitting per test per phase: a repeat never overwrites
  return db.insert('spanish_study_tests', { user_id: userId, test, phase, correct, n, chance, taken_at: taken_at || new Date().toISOString() });
}

/** Chance-corrected score on a 0 to 1 scale (0 = guessing, 1 = perfect; below 0 is possible and kept). */
const corrected = (t) => (t.correct / t.n - t.chance) / (1 - t.chance);

// ---- statistics ----------------------------------------------------------

const T975 = [12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.160, 2.145, 2.131, 2.120, 2.110, 2.101, 2.093, 2.086, 2.080, 2.074, 2.069, 2.064, 2.060, 2.056, 2.052, 2.048, 2.045, 2.042];
const tCrit = (df) => (df < 1 ? null : df > 30 ? 1.96 : T975[Math.floor(df) - 1]);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
function sd(xs) {
  if (xs.length < 2) return null;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}
const r3 = (v) => (v === null || v === undefined || Number.isNaN(v) ? null : Math.round(v * 1000) / 1000);

/** Mean and 95% t interval for one group. */
function summarize(xs) {
  const n = xs.length;
  const m = mean(xs);
  const s = sd(xs);
  const t = s === null ? null : tCrit(n - 1);
  const half = s === null ? null : t * s / Math.sqrt(n);
  return { n, mean: r3(m), sd: r3(s), ci95: half === null ? null : [r3(m - half), r3(m + half)] };
}

/** Difference of means (a minus b) with a Welch 95% interval; null when either arm has fewer than two people. */
function diffCI(a, b) {
  if (a.length < 2 || b.length < 2) return { diff: a.length && b.length ? r3(mean(a) - mean(b)) : null, ci95: null, df: null };
  const va = sd(a) ** 2 / a.length;
  const vb = sd(b) ** 2 / b.length;
  const se = Math.sqrt(va + vb);
  const df = se === 0 ? a.length + b.length - 2 : (va + vb) ** 2 / (va ** 2 / (a.length - 1) + vb ** 2 / (b.length - 1));
  const half = tCrit(Math.floor(df)) * se;
  const d = mean(a) - mean(b);
  return { diff: r3(d), ci95: [r3(d - half), r3(d + half)], df: r3(df) };
}

/** People needed per arm to detect a true difference `delta` with 80% power at the 5% level, given a spread `sdv` (normal approximation). */
function minSamplePerArm(sdv, delta) {
  if (!(sdv > 0) || !(delta > 0)) return null;
  return Math.ceil(2 * ((1.96 + 0.8416) ** 2) * (sdv / delta) ** 2);
}

// ---- per participant and the report ----------------------------------------

function minutesFor(e) {
  const w = windowOf(e);
  if (e.arm === 'savant') {
    const rows = db.find('study_sessions', (s) => s.user_id === e.user_id && s.started_at && s.started_at.slice(0, 10) >= w.from && s.started_at.slice(0, 10) <= w.to);
    const days = new Set(rows.map((s) => s.started_at.slice(0, 10)));
    return { minutes: Math.round(rows.reduce((t, s) => t + (s.active_ms || 0), 0) / 60000), days_with_study: days.size, source: 'app clock', screenshots: null };
  }
  const rows = db.find('spanish_study_checkins', (r) => r.user_id === e.user_id);
  return { minutes: rows.reduce((t, r) => t + r.minutes, 0), days_with_study: rows.filter((r) => r.minutes > 0).length, source: 'self-report', screenshots: rows.filter((r) => r.screenshot).length };
}

/** Gain on one test (post minus pre, chance-corrected), or null if either sitting is missing. */
function gainOn(userId, test) {
  const pre = db.findOne('spanish_study_tests', (r) => r.user_id === userId && r.test === test && r.phase === 'pre');
  const post = db.findOne('spanish_study_tests', (r) => r.user_id === userId && r.test === test && r.phase === 'post');
  return pre && post ? corrected(post) - corrected(pre) : null;
}

function rowFor(e, today) {
  const user = db.byId('users', e.user_id) || {};
  const w = windowOf(e);
  const mins = minutesFor(e);
  const gains = {};
  for (const t of TESTS) gains[t] = gainOn(e.user_id, t);
  const vals = TESTS.map((t) => gains[t]).filter((g) => g !== null);
  const gain = vals.length === TESTS.length ? mean(vals) : null;   // primary outcome needs both tests
  const hours = mins.minutes / 60;
  const elapsed = Math.max(0, Math.min(DAYS, Math.floor((Date.parse(`${today}T00:00:00Z`) - w.start) / 86400000) + 1));
  return {
    user_id: e.user_id, name: user.display_name || '', arm: e.arm, joined_on: e.joined_at.slice(0, 10), start_date: e.start_date, end_date: w.to,
    age_group: e.age_group, ...mins, hours: r3(hours),
    expected_minutes: DAYS * DAILY_MINUTES, missing_days: Math.max(0, elapsed - mins.days_with_study),
    gain_listening: r3(gains.listening), gain_daily: r3(gains.daily), gain: r3(gain),
    gain_per_hour: gain !== null && hours > 0 ? r3(gain / hours) : null,
    status: gain !== null ? 'complete' : (vals.length ? 'partial_tests' : 'no_post_test'),
  };
}

const isReal = (e) => { const u = db.byId('users', e.user_id) || {}; return !(u.is_demo === true || u.is_test === true || u.account_kind === 'demo' || u.account_kind === 'test'); };

/** Everyone who joined, the two arms compared, and the plain statement of what the numbers can show. */
function report({ now = Date.now() } = {}) {
  const today = isoDay(now);
  const entries = db.all('spanish_study').filter(isReal);
  const rows = entries.filter((e) => !e.left_at).map((e) => rowFor(e, today));
  const arms = {};
  for (const arm of ARMS) {
    const rs = rows.filter((r) => r.arm === arm);
    const gains = rs.filter((r) => r.gain !== null).map((r) => r.gain);
    const eff = rs.filter((r) => r.gain_per_hour !== null).map((r) => r.gain_per_hour);
    arms[arm] = {
      joined: rs.length, complete: gains.length, left_study: entries.filter((e) => e.arm === arm && e.left_at).length,
      mean_hours: r3(mean(rs.map((r) => r.hours))), gain: summarize(gains), gain_per_hour: summarize(eff),
    };
  }
  const gA = (arm) => rows.filter((r) => r.arm === arm && r.gain_per_hour !== null).map((r) => r.gain_per_hour);
  const gainA = (arm) => rows.filter((r) => r.arm === arm && r.gain !== null).map((r) => r.gain);
  const allSd = sd(rows.filter((r) => r.gain !== null).map((r) => r.gain));
  return {
    totals: { joined: entries.length, left: entries.filter((e) => e.left_at).length, active: rows.length, complete: rows.filter((r) => r.status === 'complete').length },
    arms,
    difference_gain_per_hour: { savant_minus_duolingo: diffCI(gA('savant'), gA('duolingo')), unit: 'chance-corrected gain (0 to 1 scale) per hour studied' },
    difference_gain: { savant_minus_duolingo: diffCI(gainA('savant'), gainA('duolingo')), unit: 'chance-corrected gain, same fixed time in both arms' },
    minimum_sample: {
      observed_sd_of_gain: r3(allSd),
      per_arm_to_detect_0_10: minSamplePerArm(allSd, 0.10),
      per_arm_to_detect_0_20: minSamplePerArm(allSd, 0.20),
      note: 'Normal approximation, 80% power, 5% level, from the spread seen so far; it is only meaningful once several people have finished.',
    },
    note: 'With a handful of participants an interval this wide cannot show that either app teaches more. Report every participant, including dropouts and anyone with a zero or negative gain. Duolingo minutes are self-reported.',
    participants: rows,
  };
}

const CSV_COLUMNS = ['user_id', 'name', 'arm', 'status', 'age_group', 'start_date', 'end_date', 'minutes', 'hours', 'days_with_study', 'missing_days', 'source', 'screenshots', 'gain_listening', 'gain_daily', 'gain', 'gain_per_hour'];

function csvCell(v) {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rep = report()) {
  const lines = [CSV_COLUMNS.join(',')];
  for (const r of rep.participants) lines.push(CSV_COLUMNS.map((c) => csvCell(r[c])).join(','));
  return `${lines.join('\n')}\n`;
}

function mine(userId, now = Date.now()) {
  const e = getEntry(userId);
  if (!e) return { joined: false };
  const w = windowOf(e);
  const tests = db.find('spanish_study_tests', (r) => r.user_id === userId).map((t) => ({ test: t.test, phase: t.phase }));
  const checkins = e.arm === 'duolingo' ? db.find('spanish_study_checkins', (r) => r.user_id === userId).map((r) => ({ day: r.day, minutes: r.minutes, screenshot: r.screenshot })) : undefined;
  return { joined: true, arm: e.arm, start_date: w.from, end_date: w.to, days: DAYS, daily_minutes: DAILY_MINUTES, today: isoDay(now), tests_done: tests, checkins };
}

module.exports = {
  ARMS, TESTS, PHASES, DAYS, DAILY_MINUTES, windowOf, isoDay, shuffleFrom, nextAssignment, cleanJoin, getEntry, join, leave, checkin, recordTest, corrected,
  tCrit, summarize, diffCI, minSamplePerArm, report, toCsv, csvCell, mine,
};
