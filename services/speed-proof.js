/**
 * Speed proof: the measurement that can show, on REAL learners, "the same skill understood about 4x faster, with equal or better retention,
 * than ordinary studying". docs/SPEED-PROOF.md is the plain-language version (design, consent wording, how to read the page).
 *
 * Simulated or AI-judged results are never read here: only rows written for real accounts, and the report says so.
 *
 * The unit is one lesson's stretch (its lesson level and practice levels up to the next lesson; speed-levers unitOf), not the grade's coarse skill: a grade has about 8 coarse skills over 70 lessons, so per coarse skill a
 * tester would meet a plain arm about once a grade, and the coarse skill's mastery, once high, would call every later lesson "understood" on its third answer. Rows keep their key in skill_id ("functions@20") with skill, from, to.
 * What is measured, per real learner and lesson (a row in `speed_proof`):
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
    'If you say yes, about 1 lesson in 8 will be taught the plain way instead of Savant\'s way: the standard lesson everyone gets, no changes for you, no skipping ahead with a test-out, and you can reread it at your own pace. It is the app without Savant\'s tailoring, so it may take you longer.',
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

const rowOf = (userId, skillId) => (db.forUser('speed_proof', userId).find((r) => r.skill_id === skillId) || null) || null;

function newBlockSlots(share, size = BLOCK_SIZE) {
  const nNormal = Math.round(share * size);
  const slots = Array.from({ length: size }, (_, i) => (i < nNormal ? 'normal' : 'savant'));
  for (let i = slots.length - 1; i > 0; i--) { const j = rng(i + 1); [slots[i], slots[j]] = [slots[j], slots[i]]; }
  return slots;
}

function nextSlot(userId, stratum) {
  let block = (db.forUser('speed_proof_blocks', userId).find((b) => b.stratum === stratum && b.next < b.slots.length) || null);
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
  const done = db.forUser('speed_proof', userId).filter((r) => r.arm === 'savant' && Number.isFinite(r.minutes) && r.understood_at).map((r) => r.minutes);
  const med = done.length >= 3 ? medianOf(done) : null;
  return Math.max(30, med ? 3 * med : 0);
}

function testDateSoon(userId, trackId, now) {
  try {
    const goals = lazy('./retention-goal');
    const enr = db.forUser('enrollments', userId).filter((e) => (!trackId || e.track_id === trackId))[0];
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
      const open = db.forUser('speed_proof', userId).filter((r) => r.arm === 'normal' && !r.switched_at && !r.understood_at);
      if (open.length) held = 'one_plain_skill_open';
      else if (testDateSoon(userId, trackId, now)) held = 'test_date_soon';
      else arm = 'normal';
    }
  }
  return db.insert('speed_proof', {
    user_id: userId, skill_id: skillId, track_id: trackId, grade_id: ctx.gradeId || null, stratum, arm, held_back: held, band: ageBand(user),
    ...(ctx.unit ? { skill: ctx.unit.skill, from: ctx.unit.from, to: ctx.unit.to } : {}),
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

/** The lesson stretch a level belongs to: { key, skill, from, to }, or null. */
function unitFor(grade, level) {
  try {
    const skill = lazy('../config/curriculum').levelPlan(grade, level).focus;
    if (!skill) return null;
    const { from, to } = lazy('./speed-levers').unitOf(grade, level);
    return { key: `${skill}@${from}`, skill, from, to };
  } catch { return null; }
}
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
    const unit = unitFor(grade, level === undefined || level === null ? enrollment.current_level : level);
    skillId = unit ? unit.key : null;
    if (skillId) assign(userId, skillId, { trackId: enrollment.track_id, gradeId: enrollment.grade_id, unit });
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

const PLAIN_NOTE = 'This skill is being taught the plain way (the standard lesson, read at your own pace), so there is no coach or tutor help on it. Switch it to the Savant way any time to get help.';

/**
 * Express middleware for routes that serve one level (/lessons/:track/:grade/:level/...): runs the rest of the request with the plain way
 * fixed when that level's skill is plain for this learner (so block-level tailoring, which asks blockLevels.tailorsFor, serves the shared
 * standard page), and refuses the lesson assistant for it.
 */
function lessonContext(req, res, next) {
  try {
    if (!req.user || !enabled()) return next();
    const grade = lazy('../config/curriculum').getGrade(req.params.track, req.params.grade);
    const unit = grade ? unitFor(grade, Number(req.params.level)) : null;
    const skill = unit ? unit.key : null;
    if (!skill || !normalFor(req.user.id, skill)) return next();
    if (/^\/assist/.test(req.path)) return res.status(409).json({ error: PLAIN_NOTE, plain_way: true });
    return ambient.run({ userId: req.user.id, skillId: skill }, next);
  } catch { return next(); }
}

/** The stretch an item was asked in, from its session's grade and its own level. */
function itemUnitKey(item) {
  const session = item && item.session_id ? db.byId('sessions', item.session_id) : null;
  const grade = session && session.track_id ? lazy('../config/curriculum').getGrade(session.track_id, session.grade_id) : null;
  const unit = grade ? unitFor(grade, Number(item.level) || Number(session.level)) : null;
  return unit && unit.skill === item.skill_id ? unit.key : null; // a review of another skill asked in this sitting is not part of the plain lesson
}
/** Is the lesson stretch at this level of this sitting taught the plain way? Used by the speed levers: a plain lesson gets none of them. { key } or null. */
function plainHere(userId, session, level) {
  if (!enabled() || !session || !session.track_id) return null;
  try {
    const grade = lazy('../config/curriculum').getGrade(session.track_id, session.grade_id);
    const unit = grade ? unitFor(grade, Number(level) || Number(session.level)) : null;
    return unit && normalFor(userId, unit.key) ? { key: unit.key } : null;
  } catch { return null; }
}

/** The same for /items/:id/...: the coach and the ask-the-tutor box are off on a plain skill ("ask" gets the standard explanation). */
function itemContext(req, res, next) {
  try {
    if (!req.user || !enabled()) return next();
    const item = db.byId('items', Number(req.params.id));
    if (!item || item.user_id !== req.user.id || !item.skill_id) return next();
    const unitKey = itemUnitKey(item);
    if (!unitKey || !normalFor(req.user.id, unitKey)) return next();
    if (/^\/ask/.test(req.path) && item.rationale && item.correct !== null && item.correct !== undefined) {
      return res.json({ reply: `${item.rationale}

The answer is ${item.answer}.`, source: 'plain_way', plain_way: true });
    }
    if (/^\/coach/.test(req.path) || /^\/ask/.test(req.path)) return res.status(409).json({ error: PLAIN_NOTE, plain_way: true });
    return ambient.run({ userId: req.user.id, skillId: item.skill_id }, next);
  } catch { return next(); }
}

/** Is the skill at the learner's current level taught the plain way? (The test-out offer is held back when it is.) */
function plainAtLevel(userId, enrollment, grade) {
  try { const u = unitFor(grade, enrollment.current_level); return !!u && normalFor(userId, u.key); } catch { return false; }
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
  const items = db.forUser('items', userId).filter((i) => i.skill_id && i.user_answer !== undefined && i.user_answer !== null && !NOT_LEARNING.has(i.role) && Number.isFinite(answeredAt(i)));
  items.sort((a, b) => answeredAt(a) - answeredAt(b) || a.id - b.id);
  const ms = new Map();
  const claimed = new Set();
  for (const s of db.forUser('study_sessions', userId).filter((r) => r.active_ms > 0)) {
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

/** When the app's own coverage model proved this lesson's objective (ms), or null. Same rule for both arms. */
function proofAt(userId, row) {
  try {
    const enr = db.findOne('enrollments', (e) => e.user_id === userId && e.track_id === row.track_id && e.grade_id === row.grade_id);
    const report = enr ? lazy('./coverage').forEnrollment(userId, enr) : null;
    const e = report && report.model && report.model.levelMap ? report.model.levelMap[row.from] : null;
    const s = e && report.states ? report.states[e.direct] : null;
    return s && Number.isFinite(s.proven_at) ? s.proven_at : null;
  } catch { return null; }
}

/**
 * Recompute a learner's rows from what the app recorded: minutes to understanding, understanding time, difficulty, and the guards that move
 * a struggling plain-way skill back to Savant. Idempotent; never writes anything but speed_proof rows. Returns the rows.
 */
function measure(userId, now = Date.now()) {
  const rows = db.forUser('speed_proof', userId).slice();
  if (!rows.length) return rows;
  const { items, ms } = attribute(userId);
  const events = new Map(db.forUser('events', userId).slice().map((e) => [e.item_id, e]));
  const bySkill = new Map();
  for (const i of items) { if (!bySkill.has(i.skill_id)) bySkill.set(i.skill_id, []); bySkill.get(i.skill_id).push(i); }
  for (const row of rows) {
    const isUnit = row.from !== undefined && row.from !== null;
    const own = (bySkill.get(isUnit ? row.skill : row.skill_id) || []).filter((i) => answeredAt(i) >= Date.parse(row.assigned_at) - 1000 && (!isUnit || (Number(i.level) >= row.from && Number(i.level) <= row.to)));
    if (!own.length) continue; // nothing recorded for it (yet): leave the row as it is
    let understoodAt = null;
    let upTo = -1;
    if (isUnit) {
      // Understood: the app's own proof for this lesson's objective (services/coverage.js; the same rule in both arms), else the tracker on this stretch's answers alone. Once set it stays, even if a later lapse clears the proof.
      const firstAt = row.understood_at ? Date.parse(row.understood_at) : proofAt(userId, row);
      const speed = lazy('./speed-levers');
      own.forEach((i, k) => {
        if (understoodAt || k + 1 < MIN_ANSWERS) return;
        const byProof = firstAt && answeredAt(i) >= firstAt;
        const byTracker = !firstAt && speed.shown(speed.trackerFromAnswers(own.slice(0, k + 1).map((a) => ({ correct: a.correct }))));
        if (byProof || byTracker) { understoodAt = new Date(answeredAt(i)).toISOString(); upTo = k; }
      });
    } else {
      own.forEach((i, k) => {
        if (understoodAt || k + 1 < MIN_ANSWERS) return;
        const ev = events.get(i.id);
        if (ev && Number(ev.mastery_after) >= MASTERY_LINE) { understoodAt = new Date(answeredAt(i)).toISOString(); upTo = k; }
      });
    }
    const used = upTo >= 0 ? own.slice(0, upTo + 1) : own;
    const minutes = used.reduce((a, i) => a + (ms.get(i.id) || 0), 0) / MIN;
    const diffs = used.map((i) => Number(i.difficulty)).filter(Number.isFinite);
    const minutesTotal = own.reduce((a, i) => a + (ms.get(i.id) || 0), 0) / MIN;
    const patch = {
      minutes_total: Number(Math.max(minutesTotal, MIN_MINUTES).toFixed(3)), answers_total: own.length,
      understood_at: understoodAt, answers: used.length, minutes: Number(Math.max(minutes, MIN_MINUTES).toFixed(3)),
      difficulty: diffs.length ? Number((diffs.reduce((a, b) => a + b, 0) / diffs.length).toFixed(2)) : null,
    };
    if (!understoodAt && !used.length) patch.minutes = null;
    if (JSON.stringify([row.understood_at, row.answers, row.minutes, row.difficulty, row.minutes_total]) !== JSON.stringify([patch.understood_at, patch.answers, patch.minutes, patch.difficulty, patch.minutes_total])) db.update('speed_proof', row.id, patch);
    // The harm guards: a plain-way skill on which the learner is stuck moves to Savant.
    if (row.arm === 'normal' && !row.switched_at && !understoodAt) {
      const lastN = own.slice(-WRONG_RUN_SWITCH);
      if (lastN.length === WRONG_RUN_SWITCH && lastN.every((i) => i.correct === false)) switchToSavant(userId, row.skill_id, 'wrong_run', now);
      else if (patch.minutes !== null && patch.minutes > timeCapMinutes(userId)) switchToSavant(userId, row.skill_id, 'time_cap', now);
    }
  }
  return db.forUser('speed_proof', userId).slice();
}

// ── delayed retention checks ─────────────────────────────────────────────────

/** The learner's chosen horizon in days for a track (null for forever or none). */
function goalDays(userId, trackId, understoodMs) {
  try {
    const goals = lazy('./retention-goal');
    const enr = db.forUser('enrollments', userId).filter((e) => (!trackId || e.track_id === trackId))[0];
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
  for (const row of db.forUser('speed_proof', userId).filter((r) => r.understood_at)) {
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
      if (now >= Date.parse(c.due_at)) out.push({ row_id: row.id, skill_id: row.skill_id, skill: row.skill || row.skill_id, from: row.from, to: row.to, plain: row.arm === 'normal', point: c.point, due_at: c.due_at });
      return c;
    });
    if (changed) db.update('speed_proof', row.id, { checks: next });
  }
  // Plain-way lessons first: they are 1 in 8, and at 3 questions a day first-come would leave them starved. No outcome is read, so this adds no bias between arms; it buys power.
  return out.sort((a, b) => (b.plain ? 1 : 0) - (a.plain ? 1 : 0) || Date.parse(a.due_at) - Date.parse(b.due_at));
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
    // Most items are typed (about 3 in 4 in the logs), and a typed one has no choices: other answers this learner met on the same skill stand in as choices, so the check stays one tap and no lesson is left unasked.
    const stretch = db.forUser('items', user.id).filter((i) => i.skill_id === d.skill && i.correct === true && typeof i.answer === 'string' && i.prompt && (d.from === undefined || d.from === null || (Number(i.level) >= d.from && Number(i.level) <= d.to)));
    const mc = stretch.filter((i) => Array.isArray(i.choices) && i.choices.length >= 3);
    let pick = mc.length ? mc[mc.length - 1] : null;
    if (!pick) {
      const typed = stretch[stretch.length - 1];
      const others = typed ? [...new Set(db.forUser('items', user.id).filter((i) => i.skill_id === d.skill && typeof i.answer === 'string' && i.answer).map((i) => i.answer))].filter((a) => a !== typed.answer).slice(-3) : [];
      if (typed && others.length >= 2) pick = { ...typed, choices: [typed.answer, ...others] };
    }
    if (!pick) continue;
    picks.push({ ...d, item: pick });
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
    // All the minutes logged on each lesson so far, retention levels included. The verdict's number stops at understanding; the owner's claim counts the whole road, so this is shown beside it. Reviews asked later under other levels are not in either.
    speedup_total: (() => { const a = rows.filter((r) => r.arm === 'savant' && r.understood_at && Number.isFinite(r.minutes_total)).map((r) => r.minutes_total); const b = rows.filter((r) => r.arm === 'normal' && r.understood_at && Number.isFinite(r.minutes_total)).map((r) => r.minutes_total); return a.length && b.length ? geomean(b) / geomean(a) : null; })(),
    time_capped: rows.filter((r) => r.arm === 'normal' && r.switch_reason === 'time_cap').length,
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
  const totals = sums.map((s) => s.speedup_total).filter((v) => Number.isFinite(v));
  const tot = meanCI(totals.map((v) => Math.log(v)));
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
      speedup_total_geomean: totals.length ? r3(Math.exp(tot.mean)) : null,
      speedup_total_ci95: [r3(tot.lo === null ? null : Math.exp(tot.lo)), r3(tot.hi === null ? null : Math.exp(tot.hi))],
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
      plain_skills_stopped_by_time_cap: sum('time_capped'),
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

const cdf = (x) => { // standard normal CDF (Abramowitz and Stegun 7.1.26)
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
};

/**
 * What a sample of n learners can detect, from the spread seen so far (sdLog: SD of per-learner log speed-up; sdRet: SD of per-learner
 * retention difference). Approximate (normal theory): the true speed-up that clears the 4x gate about 80% of the time, the chance the
 * retention gate is cleared when retention is truly equal, and the learners the retention gate needs for 80%.
 */
function detectability(n, sdLog, sdRet) {
  if (!(n >= 3) || !(sdLog > 0) || !(sdRet > 0)) return null;
  const t = stats.qt(0.975, n - 1);
  const se = sdLog / Math.sqrt(n);
  const retClear = cdf((NONINFERIORITY - t * (sdRet / Math.sqrt(n))) / (sdRet / Math.sqrt(n)));
  const nNeeded = Math.ceil((((stats.qnorm(0.8) + 1.96) * sdRet) / NONINFERIORITY) ** 2);
  return {
    n,
    speedup_cleared_80pct: r3(Math.exp(Math.log(TARGET) + (t + 0.8416) * se)),
    retention_gate_clear_prob_if_equal: r3(retClear),
    learners_for_retention_gate_80pct: nNeeded,
  };
}

/**
 * The honest early read, whatever the verdict: the estimate with its interval, and what can be claimed at this size.
 * "At least Mx faster" uses the lower end of the 95% interval, so it is a claim we can defend; below the verdict's learner minimum it is
 * labelled an early estimate. It never replaces the 4x verdict, which keeps its own gate.
 */
function estimateOf(g, min) {
  const [tLo, tHi] = g.time.speedup_ci95;
  const [rLo, rHi] = g.retention.diff_ci95;
  const nT = g.time.learners_with_both_arms;
  const pts = (v) => `${(v * 100).toFixed(1)}`;
  if (g.time.speedup_geomean === null || tLo === null) {
    return { n_learners: nT, point: g.time.speedup_geomean, ci95: g.time.speedup_ci95, at_least_x: null, early: true, statement: `No estimate yet: ${nT} learner${nT === 1 ? '' : 's'} with both a plain-way and a Savant-way skill understood (an interval needs at least 2).` };
  }
  const early = nT < min;
  const atLeast = Math.floor(tLo * 10) / 10;
  const ret = rLo === null ? 'Retention: no interval yet.' : `Retention difference (Savant minus plain) ${g.retention.diff_mean >= 0 ? '+' : ''}${pts(g.retention.diff_mean)} points (95% ${pts(rLo)} to ${pts(rHi)}); we can say retention is no more than ${Math.max(0, -rLo * 100).toFixed(1)} points worse.`;
  return {
    n_learners: nT, point: g.time.speedup_geomean, ci95: [tLo, tHi], at_least_x: atLeast, early,
    retention_diff: g.retention.diff_mean, retention_ci95: [rLo, rHi],
    statement: `${early ? 'Early estimate, not a verdict. ' : ''}With ${nT} learners, Savant took ${g.time.speedup_geomean}x less time than the plain way (95% interval ${tLo}x to ${tHi}x). We can say it is at least ${atLeast}x faster; we cannot say it is ${TARGET}x unless that lower end reaches ${TARGET}. ${ret}`,
  };
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
    byAge[band] = { ...g, verdict: verdict(g, Math.max(min, opts.minGroup || min)), estimate: estimateOf(g, Math.max(min, opts.minGroup || min)) };
  }
  return {
    generated_at: new Date(opts.now || Date.now()).toISOString(),
    label: opts.label || 'REAL_LEARNERS',
    version: VERSION,
    switch: { mode: mode(), normal_share: normalShare() },
    target: { speedup: TARGET, retention_margin_points: NONINFERIORITY * 100, min_learners: min },
    overall: {
      ...overall, verdict: verdict(overall, min), estimate: estimateOf(overall, min),
      detectability: detectability(overall.time.learners_with_both_arms, sd(per.map((x) => x.speedup).filter(Number.isFinite).map(Math.log)), sd(per.map((x) => x.retention_diff).filter(Number.isFinite))),
    },
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
      'Plain here is NOT normal studying: it is the app itself without tailoring or speed levers, with the same questions, proof rule and reviews. So this measures what tailoring and the levers add, and it says nothing against a student rereading a textbook. Only a separately recruited self-study group can say that.',
      "A plain lesson past its time cap (max(30 min, 3x the median Savant time)) moves to Savant and its plain minutes stop, so a learner's speed-up tops out near 4x once their median Savant lesson passes about 10 minutes. samples.plain_skills_stopped_by_time_cap counts how often this bit. The verdict is not changed by it; read it beside the result.",
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

/** Shown once: an eligible account that has not answered and has a placed enrolment (after the placement quiz). */
function offerNow(user) {
  if (ineligibleReason(user)) return false;
  if (user.speed_proof && user.speed_proof.consent) return false;
  return db.forUser('enrollments', user.id).filter((e) => e.status && e.status !== 'placement_pending').length > 0;
}

function status(user) {
  const why = ineligibleReason(user);
  return {
    available: !why, reason: why, offer: !why && offerNow(user), check_due: !why && due(user.id).due, needs_parent: !!(user && user.age_check && (user.age_check.under_13 || user.age_check.needs_parent)), consent_text: CONSENT, consent: user && user.speed_proof ? user.speed_proof.consent || null : null,
    skills: why ? [] : db.forUser('speed_proof', user.id).slice().map((r) => ({ skill_id: r.skill_id, way: r.arm === 'normal' && !r.switched_at ? 'plain' : 'savant', understood: !!r.understood_at })),
  };
}

module.exports = {
  VERSION, CONSENT, CONSENT_VERSION, POINTS, TARGET, NONINFERIORITY, BLOCK_SIZE,
  mode, enabled, normalShare, setRandom, ineligibleReason, eligible, ageBand, inBeta,
  unitFor, plainHere, itemUnitKey, setConsent, consentedNormal, assign, normalFor, withSkill, plainNowFor, lessonContext, itemContext, PLAIN_NOTE, offerNow, plainAtLevel, skillOfLevel, switchToSavant, measure, attribute, timeCapMinutes,
  detectability, estimateOf, due, dueChecks, start, answer, learnerSummary, groupStats, verdict, buildReport, report, status, meanCI, quantile,
};
