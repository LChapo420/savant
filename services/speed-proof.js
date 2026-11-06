/**
 * Speed proof: the measurement that can show, on REAL learners, "the same skill understood about 4x faster, with equal or better retention,
 * than ordinary studying". docs/SPEED-PROOF.md is the plain-language version (design, consent wording, how to read the page).
 *
 * Simulated or AI-judged results are never read here: only rows written for real accounts, and the report says so.
 *
 * What is measured, per real learner and skill (a row in `speed_proof`):
 *   - active minutes to understanding: the learner's study-session active time (services/study-sessions.js active_ms) is shared out over
 *     the answers they gave in that session, each answer taking the time since the previous sign of activity (capped at the 5 minute idle cap),
 *     so reading before an answer counts for the skill answered next. Answers outside any session count their own recorded time (items.ms,
 *     capped). Placement, test-out ("skip") and game answers are not learning time. "Understanding" is the first answer after which the
 *     skill's mastery reaches 0.8 (the app's line for "known"; events.mastery_after), reached by learning (not credited by a placement or
 *     test-out) with at least MIN_ANSWERS answers. A skill not understood yet is counted as such, never dropped silently.
 *   - delayed retention checks at 1, 7 and 30 days after understanding, and at the learner's chosen horizon (services/retention-goal.js;
 *     none for "forever"). A check is the existing delayed memory check's shape (about 30 seconds, up to 3 questions, an earlier right answer
 *     re-asked as multiple choice; services/boosters.js delayed) and is offered inside the daily check. A point not answered inside its window
 *     is "missed" and counted per arm, so uneven drop-out is visible.
 *
 * The fair within-person comparison. A learner who says yes (optional, with plain wording, CONSENT) gets a small share of their skills
 * (SPEED_PROOF_NORMAL_SHARE, default 1 in 8) taught the "normal studying" way: the plain standard lesson (the base lesson the owner's account
 * gets), reread at their own pace, no tailoring, no test-out. Which skills is random: a shuffled block per learner, track and grade (so
 * "matched" means the same learner, subject and level), crypto randomness, written once and never changed. The learner's other skills are the
 * Savant arm. Time and retention are compared INSIDE each learner, then across learners.
 * Kept from harming the learner: at most one plain-way skill open at once; none when a test date is within 21 days; the learner can switch
 * any skill to the Savant way at any time; a plain-way skill is switched automatically after 5 wrong answers in a row or when it has run past
 * a time cap (max(30 min, 3x the learner's median Savant time)). A switched skill stays in its assigned arm in the analysis (intention to
 * treat) and the minutes after the switch still count, which can only make the plain arm look faster, so it works against the 4x claim.
 *
 * The statistics. Per learner: speed-up = geometric mean minutes of plain-way skills / geometric mean minutes of Savant skills; retention
 * difference = Savant minus plain, on checks answered. Across learners: mean log speed-up with a t interval (95%), shown as the geometric-mean
 * speed-up; mean retention difference with a t interval; medians; the worst 10% (10th percentile and the mean of the bottom tenth of
 * learners); all by age group. Verdict (stated before any data): "shown" only when the lower end of the speed-up interval is at least 4
 * AND the lower end of the retention interval is above -5 points (non-inferior) AND there are at least MIN_LEARNERS learners with both arms.
 * Fewer than that, the report says "not enough data" and gives no verdict.
 *
 * Who is in: SPEED_PROOF=on | off | beta (default beta: only accounts in the beta, i.e. that carry a beta arm (services/beta-arm.js), an invite
 * (`beta_invite`), or `in_beta`). Never the owner, the owner's learner account (6689 and OWNER_LEARNER_EMAILS), admins, test or demo or team accounts.
 * Under-13s (and any age below its consent age) only with the parent's agreement to the optional measurement (services/boosters.js allowed).
 * Passive timing and checks need that; the plain-way arm also needs the learner's own yes.
 */
const crypto = require('crypto');
const db = require('../config/db');
const owner = require('../config/owner');
const stats = require('./beta-stats');

const VERSION = 1;
const DAY = 86400000;
const MIN = 60000;
const IDLE_CAP_MS = 5 * MIN;
const MASTERY_LINE = 0.8;
const MIN_ANSWERS = 3;
const MIN_MINUTES = 0.25; // floor so a skill cannot take zero minutes (a log of zero is undefined)
const BLOCK_SIZE = 8;
const OWNER_LEARNER_IDS = new Set([6689]);
const excludedIds = () => new Set([...OWNER_LEARNER_IDS, ...String(process.env.SPEED_PROOF_EXCLUDE_IDS || '').split(',').map((v) => Number(v.trim())).filter(Number.isFinite)]);
const POINTS = [
  { id: 'd1', days: 1, window: 2 },
  { id: 'd7', days: 7, window: 4 },
  { id: 'd30', days: 30, window: 10 },
];
const GOAL_WINDOW_DAYS = 14;
const MAX_CHECK_QUESTIONS = 3;
const WRONG_RUN_SWITCH = 5;
const TEST_DATE_BLOCK_DAYS = 21;
const NONINFERIORITY = 0.05;
const TARGET = 4;
const AGE_GROUPS = ['under13', '13to17', '18plus'];

/** The words a learner (or parent) sees before saying yes. Plain, and it says what the plain way is and that it is optional. */
const CONSENT_VERSION = 1;
const CONSENT = {
  version: CONSENT_VERSION,
  title: 'Help us check, fairly, how much faster Savant is',
  body: [
    'We say Savant helps you learn the same things faster and remember them as well or better. We would like to test that on real learners, you included, rather than just claim it.',
    'If you say yes, about 1 skill in 8 will be taught the plain way instead of Savant\'s way: the standard lesson everyone gets, no changes for you, no skipping ahead with a test-out, and you can reread it at your own pace. It is the ordinary way of studying, so it may take you longer.',
    'We then compare, for you, how long the plain way and the Savant way each took, and how much you remembered later, using short memory checks of about 30 seconds, 1 day, 7 days and 30 days after you learn a skill, and at the time you told us you want to remember it.',
    'It is optional. If you say no, nothing else changes and you still get the full Savant way for every skill. You can switch any skill to the Savant way at any time, and if you get stuck on a plain-way skill we switch you ourselves. Results are only used added up with other learners, never shown with your name.',
    'If you are under 13, a parent must agree to the optional measurement first.',
  ],
};

let rng = (n) => crypto.randomInt(n);
function setRandom(fn) { rng = fn || ((n) => crypto.randomInt(n)); }

// ── switch, eligibility ──────────────────────────────────────────────────────

/** SPEED_PROOF: 'on' (everyone eligible), 'off' (nothing), 'beta' (default: accounts in the beta only). */
function mode() {
  const v = String(process.env.SPEED_PROOF || 'beta').trim().toLowerCase();
  return v === 'on' || v === 'off' ? v : 'beta';
}
const enabled = () => mode() !== 'off';

function normalShare() {
  const v = process.env.SPEED_PROOF_NORMAL_SHARE === undefined || process.env.SPEED_PROOF_NORMAL_SHARE === '' ? 1 / BLOCK_SIZE : Number(process.env.SPEED_PROOF_NORMAL_SHARE);
  return Number.isFinite(v) ? Math.min(0.5, Math.max(0, v)) : 1 / BLOCK_SIZE;
}

const lazy = (p) => require(p); // eslint-disable-line global-require, import/no-dynamic-require

function inBeta(user) {
  return !!(user && (user.beta_arm || user.beta_invite || user.in_beta));
}

function ageBand(user) {
  const check = user && user.age_check;
  if (!check) return null;
  if (check.under_13) return 'under13';
  let age = Number.isFinite(Number(check.age_at_check)) ? Number(check.age_at_check) : null;
  if (age === null) { try { age = lazy('./boosters').ageOf(user); } catch { age = null; } }
  if (age === null || age === undefined || !Number.isFinite(age)) return null;
  if (age < 13) return 'under13';
  return age < 18 ? '13to17' : '18plus';
}

/**
 * Why this account is not measured, or null when it is. 'off' | 'no_user' | 'not_in_beta' | 'owner' | 'admin' | 'not_a_real_learner' |
 * 'age_not_answered' | 'needs_parent_agreement'.
 */
function ineligibleReason(user, { ignoreSwitch = false } = {}) {
  if (!ignoreSwitch && !enabled()) return 'off';
  if (!user || user.id === undefined || user.id === null) return 'no_user';
  if (excludedIds().has(Number(user.id)) || owner.isOwner(user) || owner.isOwnerLearner(user)) return 'owner';
  try { if (lazy('../middleware/auth').isAdmin(user)) return 'admin'; } catch { /* no admin list */ }
  if (!ignoreSwitch && mode() === 'beta' && !inBeta(user)) return 'not_in_beta';
  try {
    const m = lazy('./real-user-metrics');
    const consent = user.consent_id ? db.byId('parental_consents', user.consent_id) : null;
    if (m.classify(user, m.rules(), consent && consent.parent_email).group !== 'real') return 'not_a_real_learner';
  } catch { /* classify unavailable: carry on */ }
  if (!user.age_check) return 'age_not_answered';
  try { if (!lazy('./boosters').allowed(user)) return 'needs_parent_agreement'; } catch { return 'needs_parent_agreement'; }
  return null;
}
const eligible = (user) => ineligibleReason(user) === null;

// ── consent, per learner ─────────────────────────────────────────────────────

const stateOf = (user) => (user && user.speed_proof) || { v: VERSION, consent: null, open: null };

/** The learner's own yes or no to the plain-way arm (the passive measurement needs no extra yes beyond the existing gates). */
function setConsent(user, normalArm) {
  const why = ineligibleReason(user);
  if (why) return { error: 'Not available for this account.', code: 'not_allowed', reason: why };
  const st = stateOf(user);
  const consent = { normal_arm: !!normalArm, at: new Date().toISOString(), version: CONSENT_VERSION };
  const next = { ...st, v: VERSION, consent };
  db.update('users', user.id, { speed_proof: next });
  return { ok: true, consent };
}
const consentedNormal = (user) => !!(user && user.speed_proof && user.speed_proof.consent && user.speed_proof.consent.normal_arm === true);

// ── assignment ───────────────────────────────────────────────────────────────

const rowOf = (userId, skillId) => db.findOne('speed_proof', (r) => r.user_id === userId && r.skill_id === skillId) || null;

function newBlockSlots(share, size = BLOCK_SIZE) {
  const nNormal = Math.round(share * size);
  const slots = Array.from({ length: size }, (_, i) => (i < nNormal ? 'normal' : 'savant'));
  for (let i = slots.length - 1; i > 0; i--) { const j = rng(i + 1); [slots[i], slots[j]] = [slots[j], slots[i]]; }
  return slots;
}

function nextSlot(userId, stratum) {
  let block = db.findOne('speed_proof_blocks', (b) => b.user_id === userId && b.stratum === stratum && b.next < b.slots.length);
  if (!block) block = db.insert('speed_proof_blocks', { user_id: userId, stratum, share: normalShare(), slots: newBlockSlots(normalShare()), next: 0 });
  const arm = block.slots[block.next];
  db.update('speed_proof_blocks', block.id, { next: block.next + 1 });
  return arm;
}

function medianOf(a) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Minutes after which a plain-way skill is switched: max(30, 3 x the learner's median Savant time to understanding). */
function timeCapMinutes(userId) {
  const done = db.find('speed_proof', (r) => r.user_id === userId && r.arm === 'savant' && Number.isFinite(r.minutes) && r.understood_at).map((r) => r.minutes);
  const med = done.length >= 3 ? medianOf(done) : null;
  return Math.max(30, med ? 3 * med : 0);
}

function testDateSoon(userId, trackId, now) {
  try {
    const goals = lazy('./retention-goal');
    const enr = db.find('enrollments', (e) => e.user_id === userId && (!trackId || e.track_id === trackId))[0];
    const eff = goals.forEnrollment(userId, enr || null, now);
    return !!(eff && eff.status === 'date' && Number.isFinite(eff.days_left) && eff.days_left <= TEST_DATE_BLOCK_DAYS);
  } catch { return false; }
}

/**
 * The arm of a skill the learner is starting: written once on first call, then returned unchanged. Every eligible learner's skills get a
 * row (so Savant-arm time and retention are measured); only a learner who said yes (and passes the guards) can draw the plain-way arm.
 * Returns the row, or null when this account is not measured.
 */
function assign(userId, skillId, ctx = {}, now = Date.now()) {
  if (!enabled() || !skillId) return null;
  const existing = rowOf(userId, skillId);
  if (existing) return existing;
  const user = db.byId('users', userId);
  if (!user || ineligibleReason(user)) return null;
  const trackId = ctx.trackId || null;
  const stratum = `${trackId || 'none'}|${ctx.gradeId || 'none'}`;
  let arm = 'savant';
  let held = null;
  if (consentedNormal(user)) {
    const slot = nextSlot(userId, stratum); // the draw is always taken, so the block stays balanced whatever the guards do
    if (slot === 'normal') {
      const open = db.find('speed_proof', (r) => r.user_id === userId && r.arm === 'normal' && !r.switched_at && !r.understood_at);
      if (open.length) held = 'one_plain_skill_open';
      else if (testDateSoon(userId, trackId, now)) held = 'test_date_soon';
      else arm = 'normal';
    }
  }
  return db.insert('speed_proof', {
    user_id: userId, skill_id: skillId, track_id: trackId, grade_id: ctx.gradeId || null, stratum, arm, held_back: held, band: ageBand(user),
    assigned_at: new Date(now).toISOString(), switched_at: null, switch_reason: null, understood_at: null, minutes: null, answers: 0, difficulty: null,
    checks: [], v: VERSION,
  });
}

/** Is this skill, for this learner, taught the plain way right now? (config/owner.js ownerBase asks this when it is given a skill.) */
function normalFor(userId, skillId) {
  if (!enabled() || !skillId) return false;
  const user = db.byId('users', userId);
  if (!consentedNormal(user)) return false;
  const row = rowOf(userId, skillId);
  return !!(row && row.arm === 'normal' && !row.switched_at);
}

const { AsyncLocalStorage } = require('async_hooks');
const ambient = new AsyncLocalStorage();

/** The skill a level teaches (what a lesson or practice sitting at that level is about), or null. */
function skillOfLevel(grade, level) {
  try { return lazy('../config/curriculum').levelPlan(grade, level).focus || null; } catch { return null; }
}

/**
 * Run `fn` (building a lesson or a practice sitting for this learner and level) with the skill's way fixed for everything inside it:
 * config/owner.js ownerBase answers "plain" for this learner while it runs, so every tailoring switch the writers and planners already
 * ask about (scorecard lines, tutor brief, block adaptation, speed levers) is off for a plain-way skill and only for it. Also draws the
 * skill's arm if it has none. Without an eligible, consenting learner it just runs `fn`.
 */
function withSkill(userId, grade, enrollment, level, fn) {
  let skillId = null;
  try {
    skillId = skillOfLevel(grade, level === undefined || level === null ? enrollment.current_level : level);
    if (skillId) assign(userId, skillId, { trackId: enrollment.track_id, gradeId: enrollment.grade_id });
  } catch (err) { console.warn(`speed-proof: not applied: ${err.message}`); skillId = null; }
  if (!skillId || !normalFor(userId, skillId)) return fn();
  return ambient.run({ userId, skillId }, fn);
}

/** True while a plain-way skill is being built for this learner (see withSkill). */
function plainNowFor(userOrId) {
  const s = ambient.getStore();
  if (!s) return false;
  const id = userOrId && typeof userOrId === 'object' ? userOrId.id : userOrId;
  return s.userId === id;
}

/** Is the skill at the learner's current level taught the plain way? (The test-out offer is held back when it is.) */
function plainAtLevel(userId, enrollment, grade) {
  try { const s = skillOfLevel(grade, enrollment.current_level); return !!s && normalFor(userId, s); } catch { return false; }
}

/** The learner (or a guard) moves a skill to the Savant way. The row keeps its assigned arm for the analysis. */
function switchToSavant(userId, skillId, reason = 'learner', now = Date.now()) {
  const row = rowOf(userId, skillId);
  if (!row || row.arm !== 'normal' || row.switched_at) return { error: 'That skill is not being taught the plain way.', code: 'not_found' };
  db.update('speed_proof', row.id, { switched_at: new Date(now).toISOString(), switch_reason: reason });
  return { ok: true };
}

// ── minutes and understanding, from study_sessions and items ─────────────────

const NOT_LEARNING = new Set(['placement', 'skip', 'game']);
const answeredAt = (i) => Date.parse(i.updated_at || i.created_at);

/** Minutes each answered item took: the study-session active time shared by gaps between activity, or the item's own recorded time. */
function attribute(userId) {
  const items = db.find('items', (i) => i.user_id === userId && i.skill_id && i.user_answer !== undefined && i.user_answer !== null && !NOT_LEARNING.has(i.role) && Number.isFinite(answeredAt(i)));
  items.sort((a, b) => answeredAt(a) - answeredAt(b) || a.id - b.id);
  const ms = new Map();
  const claimed = new Set();
  for (const s of db.find('study_sessions', (r) => r.user_id === userId && r.active_ms > 0)) {
    const start = Date.parse(s.started_at);
    const end = Date.parse(s.ended_at || s.last_activity_at || s.started_at);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    const inside = items.filter((i) => { const t = answeredAt(i); return t >= start && t <= end + 1000 && !claimed.has(i.id); });
    if (!inside.length) continue;
    let prev = start;
    const w = inside.map((i) => { const t = answeredAt(i); const g = Math.min(Math.max(0, t - prev), IDLE_CAP_MS); prev = t; return g; });
    const total = w.reduce((a, b) => a + b, 0);
    inside.forEach((i, k) => {
      claimed.add(i.id);
      ms.set(i.id, total > 0 ? (w[k] / total) * s.active_ms : s.active_ms / inside.length);
    });
  }
  for (const i of items) if (!claimed.has(i.id)) ms.set(i.id, Math.min(Math.max(0, Number(i.ms) || 0), IDLE_CAP_MS));
  return { items, ms };
}

/**
 * Recompute a learner's rows from what the app recorded: minutes to understanding, understanding time, difficulty, and the guards that move
 * a struggling plain-way skill back to Savant. Idempotent; never writes anything but speed_proof rows. Returns the rows.
 */
function measure(userId, now = Date.now()) {
  const rows = db.find('speed_proof', (r) => r.user_id === userId);
  if (!rows.length) return rows;
  const { items, ms } = attribute(userId);
  const events = new Map(db.find('events', (e) => e.user_id === userId).map((e) => [e.item_id, e]));
  const bySkill = new Map();
  for (const i of items) { if (!bySkill.has(i.skill_id)) bySkill.set(i.skill_id, []); bySkill.get(i.skill_id).push(i); }
  for (const row of rows) {
    const own = (bySkill.get(row.skill_id) || []).filter((i) => answeredAt(i) >= Date.parse(row.assigned_at) - 1000);
    if (!own.length) continue; // nothing recorded for it (yet): leave the row as it is
    let understoodAt = null;
    let upTo = -1;
    own.forEach((i, k) => {
      if (understoodAt || k + 1 < MIN_ANSWERS) return;
      const ev = events.get(i.id);
      if (ev && Number(ev.mastery_after) >= MASTERY_LINE) { understoodAt = new Date(answeredAt(i)).toISOString(); upTo = k; }
    });
    const used = upTo >= 0 ? own.slice(0, upTo + 1) : own;
    const minutes = used.reduce((a, i) => a + (ms.get(i.id) || 0), 0) / MIN;
    const diffs = used.map((i) => Number(i.difficulty)).filter(Number.isFinite);
    const patch = {
      understood_at: understoodAt, answers: used.length, minutes: Number(Math.max(minutes, MIN_MINUTES).toFixed(3)),
      difficulty: diffs.length ? Number((diffs.reduce((a, b) => a + b, 0) / diffs.length).toFixed(2)) : null,
    };
    if (!understoodAt && !used.length) patch.minutes = null;
    if (JSON.stringify([row.understood_at, row.answers, row.minutes, row.difficulty]) !== JSON.stringify([patch.understood_at, patch.answers, patch.minutes, patch.difficulty])) db.update('speed_proof', row.id, patch);
    // The harm guards: a plain-way skill on which the learner is stuck moves to Savant.
    if (row.arm === 'normal' && !row.switched_at && !understoodAt) {
      const lastN = own.slice(-WRONG_RUN_SWITCH);
      if (lastN.length === WRONG_RUN_SWITCH && lastN.every((i) => i.correct === false)) switchToSavant(userId, row.skill_id, 'wrong_run', now);
      else if (patch.minutes !== null && patch.minutes > timeCapMinutes(userId)) switchToSavant(userId, row.skill_id, 'time_cap', now);
    }
  }
  return db.find('speed_proof', (r) => r.user_id === userId);
}

// ── delayed retention checks ─────────────────────────────────────────────────

/** The learner's chosen horizon in days for a track (null for forever or none). */
function goalDays(userId, trackId, understoodMs) {
  try {
    const goals = lazy('./retention-goal');
    const enr = db.find('enrollments', (e) => e.user_id === userId && (!trackId || e.track_id === trackId))[0];
    const eff = goals.forEnrollment(userId, enr || null, understoodMs);
    if (!eff) return null;
    if (eff.status === 'horizon' && Number.isFinite(eff.days)) return eff.days;
    if (eff.status === 'date' && Number.isFinite(eff.days_left) && eff.days_left > 1) return eff.days_left;
    return null;
  } catch { return null; }
}

/** The points of a row that are due now (open window, not answered). Fills in the row's schedule the first time its skill is understood. */
function dueChecks(userId, now = Date.now()) {
  const out = [];
  for (const row of db.find('speed_proof', (r) => r.user_id === userId && r.understood_at)) {
    const u = Date.parse(row.understood_at);
    let checks = row.checks;
    if (!checks.length) {
      const gd = goalDays(userId, row.track_id, u);
      const pts = POINTS.map((p) => ({ point: p.id, days: p.days, window: p.window }));
      if (gd && !POINTS.some((p) => p.days === gd)) pts.push({ point: 'goal', days: gd, window: GOAL_WINDOW_DAYS });
      checks = pts.map((p) => ({ point: p.point, due_at: new Date(u + p.days * DAY).toISOString(), closes_at: new Date(u + (p.days + p.window) * DAY).toISOString(), done_at: null, asked: 0, right: 0, missed: false }));
      db.update('speed_proof', row.id, { checks });
    }
    let changed = false;
    const next = checks.map((c) => {
      if (c.done_at) return c;
      if (now > Date.parse(c.closes_at)) { if (c.missed) return c; changed = true; return { ...c, missed: true }; }
      if (now >= Date.parse(c.due_at)) out.push({ row_id: row.id, skill_id: row.skill_id, point: c.point, due_at: c.due_at });
      return c;
    });
    if (changed) db.update('speed_proof', row.id, { checks: next });
  }
  return out.sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at));
}

function due(userId, now = Date.now()) {
  const user = db.byId('users', userId);
  if (!user || ineligibleReason(user)) return { due: false, questions: 0 };
  const d = dueChecks(userId, now);
  return { due: d.length > 0, questions: Math.min(MAX_CHECK_QUESTIONS, d.length), seconds: 30 };
}

/** Start the memory check: up to 3 due points, one question each, in the shape of services/boosters.js delayed (multiple choice, shuffled). */
function start(user, now = Date.now()) {
  const why = ineligibleReason(user);
  if (why) return { error: 'Not available for this account.', code: 'not_allowed' };
  const st = stateOf(user);
  if (st.open && now - Date.parse(st.open.at) < 30 * MIN) return view(st.open);
  const picks = [];
  for (const d of dueChecks(user.id, now)) {
    const rows = db.find('items', (i) => i.user_id === user.id && i.skill_id === d.skill_id && i.correct === true && Array.isArray(i.choices) && i.choices.length >= 3 && typeof i.answer === 'string' && i.prompt);
    if (!rows.length) continue;
    picks.push({ ...d, item: rows[rows.length - 1] });
    if (picks.length >= MAX_CHECK_QUESTIONS) break;
  }
  if (!picks.length) return { error: 'Nothing to check yet.', code: 'nothing_due' };
  const id = `sp${crypto.randomBytes(6).toString('hex')}`;
  const questions = picks.map((p, i) => {
    const choices = p.item.choices.slice(0, 5);
    const order = choices.map((c, k) => [crypto.createHash('sha1').update(`${id}:${i}:${k}`).digest()[0], c]).sort((a, c) => a[0] - c[0]).map((x) => x[1]);
    return { n: i + 1, row_id: p.row_id, skill: p.skill_id, point: p.point, prompt: p.item.prompt, choices: order, key: order.indexOf(p.item.answer) };
  }).filter((q) => q.key >= 0);
  if (!questions.length) return { error: 'Nothing to check yet.', code: 'nothing_due' };
  const open = { id, at: new Date(now).toISOString(), questions };
  db.update('users', user.id, { speed_proof: { ...st, v: VERSION, open } });
  return view(open);
}
const view = (open) => ({ check_id: open.id, seconds: 30, questions: open.questions.map((q) => ({ n: q.n, prompt: q.prompt, choices: q.choices })) });

/** answers: { n: choice index }. A skipped question stays due until its window closes (then it is "missed"). */
function answer(user, checkId, answers, now = Date.now()) {
  const st = stateOf(user);
  const open = st.open;
  if (!open || open.id !== String(checkId || '')) return { error: 'That check is not open any more.', code: 'not_found' };
  let right = 0;
  let answered = 0;
  for (const q of open.questions) {
    const given = answers && answers[q.n];
    if (given === undefined || given === null || given === '') continue;
    const row = db.byId('speed_proof', q.row_id);
    if (!row || row.user_id !== user.id) continue;
    const ok = Number(given) === q.key;
    answered++;
    if (ok) right++;
    const checks = row.checks.map((c) => (c.point === q.point && !c.done_at ? { ...c, done_at: new Date(now).toISOString(), asked: 1, right: ok ? 1 : 0, missed: false } : c));
    db.update('speed_proof', row.id, { checks });
  }
  db.update('users', user.id, { speed_proof: { ...st, open: null } });
  return { ok: true, asked: open.questions.length, answered, right };
}

// ── the statistics ───────────────────────────────────────────────────────────

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
function sd(a) { if (a.length < 2) return null; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); }
function quantile(a, p) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const h = (s.length - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return s[lo] + (s[hi] - s[lo]) * (h - lo);
}
const r3 = (v) => (v === null || v === undefined || !Number.isFinite(v) ? null : Number(v.toFixed(3)));

/** Mean of a sample with a two-sided t interval. n < 2 gives no interval. */
function meanCI(a, alpha = 0.05) {
  const n = a.length;
  if (!n) return { n: 0, mean: null, lo: null, hi: null, sd: null };
  const m = mean(a);
  const s = sd(a);
  if (n < 2 || s === null) return { n, mean: m, lo: null, hi: null, sd: s };
  const half = stats.qt(1 - alpha / 2, n - 1) * (s / Math.sqrt(n));
  return { n, mean: m, lo: m - half, hi: m + half, sd: s };
}

const geomean = (a) => Math.exp(mean(a.map((x) => Math.log(Math.max(x, MIN_MINUTES)))));

/**
 * One learner's numbers from their rows. `rows` are speed_proof rows. Returns null parts when a side is missing.
 * speedup = plain geometric-mean minutes / Savant geometric-mean minutes (above 1 means Savant is faster).
 */
function learnerSummary(rows) {
  const done = (arm) => rows.filter((r) => r.arm === arm && r.understood_at && Number.isFinite(r.minutes));
  const S = done('savant');
  const N = done('normal');
  const checksOf = (arm) => rows.filter((r) => r.arm === arm).flatMap((r) => r.checks || []);
  const tally = (arm) => {
    const c = checksOf(arm);
    const answered = c.filter((x) => x.done_at);
    return { answered: answered.length, right: answered.reduce((a, x) => a + (x.right || 0), 0), missed: c.filter((x) => x.missed && !x.done_at).length, scheduled: c.length };
  };
  const tS = tally('savant');
  const tN = tally('normal');
  const byPoint = {};
  for (const arm of ['savant', 'normal']) {
    for (const x of checksOf(arm).filter((c) => c.done_at)) {
      const k = `${arm}:${x.point}`;
      byPoint[k] = byPoint[k] || { asked: 0, right: 0 };
      byPoint[k].asked += x.asked || 1;
      byPoint[k].right += x.right || 0;
    }
  }
  return {
    savant_skills: S.length, normal_skills: N.length,
    savant_minutes: S.length ? geomean(S.map((r) => r.minutes)) : null,
    normal_minutes: N.length ? geomean(N.map((r) => r.minutes)) : null,
    speedup: S.length && N.length ? geomean(N.map((r) => r.minutes)) / geomean(S.map((r) => r.minutes)) : null,
    savant_retention: tS.answered ? tS.right / tS.answered : null,
    normal_retention: tN.answered ? tN.right / tN.answered : null,
    retention_diff: tS.answered && tN.answered ? tS.right / tS.answered - tN.right / tN.answered : null,
    savant_checks: tS, normal_checks: tN, by_point: byPoint,
    savant_not_yet: rows.filter((r) => r.arm === 'savant' && !r.understood_at).length,
    normal_not_yet: rows.filter((r) => r.arm === 'normal' && !r.understood_at).length,
    switched: rows.filter((r) => r.arm === 'normal' && r.switched_at).length,
    difficulty_savant: S.filter((r) => Number.isFinite(r.difficulty)).length ? mean(S.filter((r) => Number.isFinite(r.difficulty)).map((r) => r.difficulty)) : null,
    difficulty_normal: N.filter((r) => Number.isFinite(r.difficulty)).length ? mean(N.filter((r) => Number.isFinite(r.difficulty)).map((r) => r.difficulty)) : null,
  };
}

const minLearners = () => { const v = Number(process.env.SPEED_PROOF_MIN_LEARNERS); return Number.isFinite(v) && v >= 2 ? Math.floor(v) : 20; };

/** The group figures from per-learner summaries. */
function groupStats(sums) {
  const sp = sums.map((s) => s.speedup).filter((v) => Number.isFinite(v));
  const logs = sp.map((v) => Math.log(v));
  const tci = meanCI(logs);
  const rd = sums.map((s) => s.retention_diff).filter((v) => Number.isFinite(v));
  const rci = meanCI(rd);
  const k = Math.max(1, Math.ceil(sp.length * 0.1));
  const sortedSp = [...sp].sort((a, b) => a - b);
  const sortedRd = [...rd].sort((a, b) => a - b);
  const kr = Math.max(1, Math.ceil(rd.length * 0.1));
  const sum = (key) => sums.reduce((a, s) => a + (s[key] || 0), 0);
  return {
    learners: sums.length,
    time: {
      learners_with_both_arms: sp.length,
      speedup_geomean: sp.length ? r3(Math.exp(tci.mean)) : null,
      speedup_ci95: [r3(tci.lo === null ? null : Math.exp(tci.lo)), r3(tci.hi === null ? null : Math.exp(tci.hi))],
      speedup_median: r3(quantile(sp, 0.5)),
      speedup_p10: r3(quantile(sp, 0.1)),
      speedup_worst10_mean: sp.length ? r3(mean(sortedSp.slice(0, k))) : null,
      speedup_p25: r3(quantile(sp, 0.25)),
      speedup_p75: r3(quantile(sp, 0.75)),
      learners_below_1x: sp.filter((v) => v < 1).length,
      savant_median_minutes: r3(quantile(sums.map((s) => s.savant_minutes).filter(Number.isFinite), 0.5)),
      normal_median_minutes: r3(quantile(sums.map((s) => s.normal_minutes).filter(Number.isFinite), 0.5)),
    },
    retention: {
      learners_with_both_arms: rd.length,
      diff_mean: r3(rci.mean),
      diff_ci95: [r3(rci.lo), r3(rci.hi)],
      diff_median: r3(quantile(rd, 0.5)),
      diff_p10: r3(quantile(rd, 0.1)),
      diff_worst10_mean: rd.length ? r3(mean(sortedRd.slice(0, kr))) : null,
      learners_savant_worse_by_10pts: rd.filter((v) => v < -0.1).length,
      savant_mean: sums.filter((s) => s.savant_retention !== null).length ? r3(mean(sums.filter((s) => s.savant_retention !== null).map((s) => s.savant_retention))) : null,
      normal_mean: sums.filter((s) => s.normal_retention !== null).length ? r3(mean(sums.filter((s) => s.normal_retention !== null).map((s) => s.normal_retention))) : null,
    },
    samples: {
      savant_skills_understood: sum('savant_skills'), normal_skills_understood: sum('normal_skills'),
      savant_not_yet_understood: sum('savant_not_yet'), normal_not_yet_understood: sum('normal_not_yet'),
      savant_checks_answered: sums.reduce((a, s) => a + s.savant_checks.answered, 0), normal_checks_answered: sums.reduce((a, s) => a + s.normal_checks.answered, 0),
      savant_checks_missed: sums.reduce((a, s) => a + s.savant_checks.missed, 0), normal_checks_missed: sums.reduce((a, s) => a + s.normal_checks.missed, 0),
      plain_skills_switched_to_savant: sum('switched'),
    },
    balance: {
      mean_item_difficulty_savant: sums.filter((s) => s.difficulty_savant !== null).length ? r3(mean(sums.filter((s) => s.difficulty_savant !== null).map((s) => s.difficulty_savant))) : null,
      mean_item_difficulty_normal: sums.filter((s) => s.difficulty_normal !== null).length ? r3(mean(sums.filter((s) => s.difficulty_normal !== null).map((s) => s.difficulty_normal))) : null,
    },
  };
}

/** The verdict from group figures. status: not_enough_data | shown | not_shown | speed_shown_retention_worse | inconclusive. */
function verdict(g, min = minLearners()) {
  const nT = g.time.learners_with_both_arms;
  const nR = g.retention.learners_with_both_arms;
  const [tLo, tHi] = g.time.speedup_ci95;
  const [rLo, rHi] = g.retention.diff_ci95;
  const pts = (v) => `${(v * 100).toFixed(1)} points`;
  if (nT < min || nR < min || tLo === null || rLo === null) {
    return { status: 'not_enough_data', four_x_shown: false, statement: `Not enough data. 4x faster with equal or better retention has NOT been shown, and it has not been shown to be false either. `
      + `${nT} learner${nT === 1 ? '' : 's'} with both a plain-way and a Savant-way skill understood (need ${min}), ${nR} with memory checks on both (need ${min}).` };
  }
  const speedOk = tLo >= TARGET;
  const retOk = rLo > -NONINFERIORITY;
  if (speedOk && retOk) {
    return { status: 'shown', four_x_shown: true, statement: `Shown, on real learners: Savant took ${g.time.speedup_geomean}x less time (95% interval ${tLo}x to ${tHi}x, lower end at least ${TARGET}x) with retention ${g.retention.diff_mean >= 0 ? 'equal or better' : 'not worse than'} the plain way (difference ${pts(g.retention.diff_mean)}, lower end ${pts(rLo)}, above the -${NONINFERIORITY * 100}-point margin).` };
  }
  if (tHi < TARGET) {
    return { status: 'not_shown', four_x_shown: false, statement: `Not shown. Savant is ${g.time.speedup_geomean}x faster (95% interval ${tLo}x to ${tHi}x); the upper end is below ${TARGET}x, so 4x is ruled out on this data.` };
  }
  if (speedOk && !retOk) {
    return { status: 'speed_shown_retention_worse', four_x_shown: false, statement: `Speed reached ${TARGET}x (lower end ${tLo}x) but retention is not shown to be equal or better: difference ${pts(g.retention.diff_mean)}, lower end ${pts(rLo)} is not above -${NONINFERIORITY * 100} points. 4x with equal retention is NOT shown.` };
  }
  return { status: 'inconclusive', four_x_shown: false, statement: `Not shown yet. Savant is ${g.time.speedup_geomean}x faster (95% interval ${tLo}x to ${tHi}x), which includes values below ${TARGET}x; retention difference ${pts(g.retention.diff_mean)} (${pts(rLo)} to ${pts(rHi)}). More learners are needed.` };
}

/**
 * Build the report from per-learner rows. Pure: `learners` is [{ user_id, band, rows }]. Used by the page and by the synthetic tests.
 * opts.label is copied into the report ('SIMULATED' in tests) so a simulated report can never read as a real one.
 */
function buildReport(learners, opts = {}) {
  const min = opts.minLearners || minLearners();
  const per = learners.map((l) => ({ user_id: l.user_id, band: l.band || 'unknown', ...learnerSummary(l.rows) }));
  const overall = groupStats(per);
  const byAge = {};
  for (const band of AGE_GROUPS) {
    const sub = per.filter((p) => p.band === band);
    const g = groupStats(sub);
    byAge[band] = { ...g, verdict: verdict(g, Math.max(min, opts.minGroup || min)) };
  }
  return {
    generated_at: new Date(opts.now || Date.now()).toISOString(),
    label: opts.label || 'REAL_LEARNERS',
    version: VERSION,
    switch: { mode: mode(), normal_share: normalShare() },
    target: { speedup: TARGET, retention_margin_points: NONINFERIORITY * 100, min_learners: min },
    overall: { ...overall, verdict: verdict(overall, min) },
    by_age: byAge,
    learners: per.map((p) => ({
      user_id: p.user_id, band: p.band, savant_skills: p.savant_skills, normal_skills: p.normal_skills, speedup: r3(p.speedup),
      savant_minutes: r3(p.savant_minutes), normal_minutes: r3(p.normal_minutes),
      savant_retention: r3(p.savant_retention), normal_retention: r3(p.normal_retention), retention_diff: r3(p.retention_diff),
    })),
    notes: [
      'Only real learners: the owner, 6689, admins, test, demo and team accounts are left out; simulated and AI-judged results are never added here.',
      'Plain-way skills are random per learner, track and grade; a skill switched to Savant stays in the plain arm (intention to treat), which works against the 4x claim.',
      'Speed-up is plain minutes divided by Savant minutes inside each learner (geometric means), then averaged on the log scale across learners.',
    ],
  };
}

/**
 * The live report: measures every eligible learner who has rows, then builds. Learners no longer eligible (a parent withdrew agreement,
 * the account is excluded) are left out at read time.
 */
function report(opts = {}) {
  const now = opts.now || Date.now();
  const byUser = new Map();
  for (const r of db.all('speed_proof')) { if (!byUser.has(r.user_id)) byUser.set(r.user_id, []); byUser.get(r.user_id).push(r); }
  const learners = [];
  let left = 0;
  for (const [userId] of byUser) {
    const user = db.byId('users', userId);
    if (!user || ineligibleReason(user, { ignoreSwitch: true })) { left++; continue; }
    const rows = measure(userId, now);
    dueChecks(userId, now); // writes the schedule and marks windows that closed unanswered as missed
    learners.push({ user_id: userId, band: ageBand(user), rows });
  }
  const out = buildReport(learners, opts);
  out.left_out_accounts = left;
  return out;
}

function status(user) {
  const why = ineligibleReason(user);
  return {
    available: !why, reason: why, consent_text: CONSENT, consent: user && user.speed_proof ? user.speed_proof.consent || null : null,
    skills: why ? [] : db.find('speed_proof', (r) => r.user_id === user.id).map((r) => ({ skill_id: r.skill_id, way: r.arm === 'normal' && !r.switched_at ? 'plain' : 'savant', understood: !!r.understood_at })),
  };
}

module.exports = {
  VERSION, CONSENT, CONSENT_VERSION, POINTS, TARGET, NONINFERIORITY, BLOCK_SIZE,
  mode, enabled, normalShare, setRandom, ineligibleReason, eligible, ageBand, inBeta,
  setConsent, consentedNormal, assign, normalFor, withSkill, plainNowFor, plainAtLevel, skillOfLevel, switchToSavant, measure, attribute, timeCapMinutes,
  due, dueChecks, start, answer, learnerSummary, groupStats, verdict, buildReport, report, status, meanCI, quantile,
};
