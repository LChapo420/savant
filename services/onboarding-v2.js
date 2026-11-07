/**
 * Onboarding v2 (docs/ONBOARDING-V2.md), behind ONBOARDING_V2, off by default.
 *
 * What it adds to the data: a `users` row with `guest: true` (no email, no password, created when the level check starts) and one
 * `onboarding_answers` row per learner holding what they said on the way in. Everything else is the app's own: the walk, the enrollment,
 * the lesson, the goals. A guest becoming an account is the same row gaining credentials, so progress cannot be lost in the move.
 *
 * Consent (owner, 7 Nov): everyone agrees before they get access. A learner at or over their country's consent age makes a real choice right after
 * the age screen (terms, privacy, outside AI); the guest row is created by agreeing, and recordAgreement keeps what was agreed and when. From there
 * routes/consent.js access() treats them as any consenting learner. A row with no agreement stays limited. An under-consent-age learner cannot agree
 * for themselves: they are today's limited child account with the parent's request sent, and only the username and password wait.
 */
const db = require('../config/db');

const ANSWERS = 'onboarding_answers';
const AGREEMENTS = 'learner_agreements';
/** Bump when the words on the agreement screen (public/js/start-content.js AGREEMENT) change. */
const AGREEMENT_VERSION = '2026-11-07.1';
const AGREEMENT_COVERS = ['beta_terms', 'privacy_policy', 'outside_ai'];
const DAY = 24 * 3600 * 1000;
const GUEST_DAYS = () => Number(process.env.ONBOARDING_GUEST_DAYS || 30);

/** Interests with a pre-written example (public/js/start-content.js has the text; the test checks the two lists agree). */
const INTERESTS = {
  soccer: 'soccer', basketball: 'basketball', music: 'music', gaming: 'video games', cooking: 'cooking', art: 'drawing and art',
  animals: 'animals', space: 'space', movies: 'movies and TV', cars: 'cars', fashion: 'fashion', coding: 'coding',
};
const WHY = ['test', 'school', 'work', 'curious', 'love'];
const MAX_TRACKS = 6;

const enabled = () => /^(1|on|true)$/i.test(String(process.env.ONBOARDING_V2 || ''));
/* eslint-disable global-require */
const consent = () => require('../routes/consent');
const iso = () => new Date().toISOString();
const expiry = () => new Date(Date.now() + GUEST_DAYS() * DAY).toISOString();

function rowOf(userId) { return db.findOne(ANSWERS, (r) => r.user_id === userId); }
function gradeNameOf(trackId, gradeId) {
  const g = require('../config/curriculum').getGrade(trackId, gradeId);
  return g ? g.name : '';
}

/** Keep only what is known. A child's typed words are never kept: tap choices only (`child`). */
function cleanAnswers(raw, { child = false } = {}) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  const known = new Set(require('../config/curriculum').catalogue().map((t) => t.id));
  if (Array.isArray(r.tracks)) out.tracks = [...new Set(r.tracks.map(String).filter((t) => known.has(t)))].slice(0, MAX_TRACKS);
  if (typeof r.notes === 'boolean') out.notes = !child && r.notes;
  if (WHY.includes(r.why)) out.why = r.why;
  const goals = require('./retention-goal');
  if (goals.CHOICES.includes(r.horizon)) out.horizon = r.horizon;
  if (typeof r.test_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.test_date)) out.test_date = r.test_date;
  if (r.interest === 'other' || INTERESTS[r.interest]) out.interest = r.interest;
  if (typeof r.interest_text === 'string') out.interest_text = child ? '' : r.interest_text.trim().slice(0, 80);
  if (typeof r.ref === 'string' && /^[a-z0-9]{8}$/.test(r.ref)) out.ref = r.ref;
  return out;
}

function saveAnswers(user, raw) {
  const child = !!(user.age_check && user.age_check.needs_parent);
  const clean = cleanAnswers(raw, { child });
  const row = rowOf(user.id);
  if (row) return db.update(ANSWERS, row.id, { ...clean, updated_at: iso() });
  return db.insert(ANSWERS, { user_id: user.id, ...clean });
}

function touch(user) {
  if (user && user.guest) db.update('users', user.id, { guest_expires_at: expiry() });
}

/** A new guest from the age answer held in the session. The caller starts the session. */
function createGuest(screen, { nickname = null } = {}) {
  return db.insert('users', {
    guest: true,
    guest_expires_at: expiry(),
    email: null,
    username: null,
    display_name: nickname || 'New learner',
    password_hash: null,
    xp: 0,
    streak: 0,
    last_active_day: null,
    onboarded: false,
    age_check: { ...screen, asked_on: 'onboarding_v2' },
    account_type: screen.needs_parent ? 'child' : 'standard',
    consent_id: null,
  });
}

/** Keep what was agreed and when. Exported and deleted with the account (routes/profile.js EXPORT_MORE, routes/consent.js KNOWN_COLLECTIONS). */
function recordAgreement(user, policyVersion) {
  if (user.agreed_at) return user;
  const at = iso();
  db.insert(AGREEMENTS, { user_id: user.id, version: AGREEMENT_VERSION, policy_version: policyVersion, covers: AGREEMENT_COVERS, agreed_at: at, via: 'onboarding_v2' });
  return db.update('users', user.id, { agreed_at: at, agreement_version: AGREEMENT_VERSION });
}

/** Where an account (not a guest) belongs when it opens this flow: never through it again. */
function accountHome(user) {
  const a = consent().access(user);
  if (a.locked) return '/parent-needed';
  if (a.state === 'needs_age') return '/onboarding';
  return db.findOne('enrollments', (e) => e.user_id === user.id) ? '/dashboard' : '/onboarding';
}

/** Where the level the learner stands on opens: the same rule as the path page. */
function lessonHref(user, e) {
  const base = require('../config/base-lessons');
  const at = e.current_level || 1;
  if (base.canSeeBaseLessons(user) && (base.levelsFor(e.track_id, e.grade_id) || []).includes(at)) {
    return `/base-lesson?track=${encodeURIComponent(e.track_id)}&grade=${encodeURIComponent(e.grade_id)}&level=${at}&enrollment=${e.id}`;
  }
  return `/session?enrollment=${e.id}`;
}

function enrollmentView(user, e) {
  return { id: e.id, track_id: e.track_id, grade_id: e.grade_id, grade_name: gradeNameOf(e.track_id, e.grade_id), href: lessonHref(user, e) };
}

/** What the page needs to pick up where the learner was, on any device state. */
function stateFor(req) {
  const c = consent();
  const user = req.user;
  if (user && !user.guest) return { account: true, go: accountHome(user) };
  if (user) {
    touch(user);
    const row = rowOf(user.id) || {};
    const child = !!(user.age_check && user.age_check.needs_parent);
    const e = row.first_enrollment_id ? db.byId('enrollments', row.first_enrollment_id) : null;
    return {
      guest: true,
      route: child ? 'parent' : 'self',
      agreed: !!user.agreed_at,
      nickname: child ? user.display_name : null,
      consent: c.publicConsent(user).consent,
      answers: {
        tracks: row.tracks || [], notes: !!row.notes, why: row.why || null, horizon: row.horizon || null, test_date: row.test_date || null, interest: row.interest || null, interest_text: row.interest_text || '',
      },
      enrollment: e && e.user_id === user.id ? enrollmentView(user, e) : null,
      lesson_opened: !!row.lesson_opened_at,
    };
  }
  const screen = c.screenFromSession(req);
  return { route: screen ? (screen.needs_parent ? 'parent' : 'self') : null, age_answered: !!screen };
}

/** The retention and study goals from step 5, in the learner's words. A failure leaves the default (forever, full depth). */
function applyGoals(user, e, row) {
  const out = { summary: null };
  try {
    const goals = require('./retention-goal');
    if (row.horizon) {
      const saved = goals.save(user.id, 'enrollment', e.id, { horizon: row.horizon, test_date: row.test_date });
      if (!saved.error) {
        out.horizon = row.horizon;
        out.summary = goals.describe(goals.effective(saved.row.retention_goal, goals.todayFor(user.id))).text;
      } else out.error = saved.error;
    }
    const study = require('./study-goal');
    if (row.why === 'test' && study.enabled() && study.choices().includes('test')) {
      const saved = study.save(user.id, 'enrollment', e.id, { goal: 'test' });
      if (!saved.error) out.study = 'test';
    }
  } catch (err) {
    console.warn(`onboarding-v2: goal not set: ${err.message}`);
    out.error = 'not set';
  }
  return out;
}

/**
 * Stand the learner on lesson 1 of the grade the walk found (or the one they picked), and set the goals they asked for at step 5.
 * Safe to call twice: a learner already on the enrollment stays where they are.
 */
function firstLesson(user, { track, grade_id: gradeId }) {
  const sp = require('./subject-placement');
  const trackId = String(track || '');
  const walk = sp.placementFor(user.id, trackId);
  const want = String(gradeId || (walk && (walk.chosen_grade_id || walk.recommended_grade_id)) || '');
  const chose = sp.chooseGrade(user.id, trackId, want);
  if (chose.error) return chose;
  let e = chose.enrollment;
  if (e.status === 'placement_pending') {
    const out = require('./owner-skips').skipPlacement({ userId: user.id, enrollment: e, level: 1 });
    if (out.error) return out;
    e = out.enrollment;
  }
  const row = saveAnswers(user, {});
  const goal = applyGoals(user, e, row);
  db.update(ANSWERS, row.id, { first_enrollment_id: e.id, first_at: row.first_at || iso() });
  applyInterest(user);
  // A learner who has agreed gets their first lesson started as soon as the level is known, as after any placement.
  if (consent().access(user).ai_free_text) {
    try { require('./write-ahead').trigger({ user, enrollment: e, reason: 'onboarding v2 first lesson' }); } catch (err) { console.warn(`onboarding-v2: write-ahead not started: ${err.message}`); }
  }
  return { enrollment: enrollmentView(user, e), goal };
}

/** The interest from step 6 goes into the survey the lesson writers read, only once this account's consent covers outside AI. Changing it replaces what this flow wrote. */
function applyInterest(user) {
  try {
    if (!user || !consent().access(user).ai_free_text) return false;
    const row = rowOf(user.id);
    if (!row || !row.interest) return false;
    const said = row.interest === 'other' ? String(row.interest_text || '').trim() : INTERESTS[row.interest];
    if (!said || row.interest_applied === said) return false;
    const learner = require('./learner');
    const survey = learner.cleanSurvey(learner.getProfile(user.id).survey || {});
    const before = row.interest_applied || '';
    let text = survey.interests;
    if (before && text.includes(before)) text = text.replace(before, said);
    else if (!text.toLowerCase().includes(said.toLowerCase())) text = text ? `${text}, ${said}` : said;
    survey.interests = text;
    learner.saveProfile(user.id, { survey, survey_at: iso() });
    db.update(ANSWERS, row.id, { interest_applied: said, interest_applied_at: iso() });
    return true;
  } catch (err) {
    console.warn(`onboarding-v2: interest not carried: ${err.message}`);
    return false;
  }
}

/** A guest who signs in to an existing account: the finished level check comes along where the account has none. Lesson answers do not. */
function absorbGuest(guest, account) {
  try {
    if (!guest || !guest.guest || !account || guest.id === account.id) return false;
    if (guest.age_check && guest.age_check.needs_parent) return false; // a child row waits on its parent; the sweep owns it
    const sp = require('./subject-placement');
    for (const walk of db.find('subject_placements', (p) => p.user_id === guest.id && p.finished_at)) {
      if (!sp.placementFor(account.id, walk.track_id)) {
        const { id, user_id: _u, created_at: _c, updated_at: _up, ...rest } = walk;
        db.insert('subject_placements', { ...rest, user_id: account.id, source: 'onboarding_v2' });
      }
    }
    for (const e of db.find('enrollments', (x) => x.user_id === guest.id)) {
      if (db.findOne('enrollments', (x) => x.user_id === account.id && x.track_id === e.track_id)) continue;
      const made = sp.chooseGrade(account.id, e.track_id, e.grade_id);
      if (made.enrollment) require('./owner-skips').skipPlacement({ userId: account.id, enrollment: made.enrollment, level: 1 });
    }
    const row = rowOf(guest.id);
    if (row && !rowOf(account.id)) {
      const { id, user_id: _u, first_enrollment_id: _f, created_at: _c, updated_at: _up, ...rest } = row;
      db.insert(ANSWERS, { ...rest, user_id: account.id });
      applyInterest(db.byId('users', account.id));
    }
    require('./account-deletion').deleteAccount(guest);
    return true;
  } catch (err) {
    console.warn(`onboarding-v2: guest not absorbed: ${err.message}`);
    return false;
  }
}

/** Run by the consent sweep: unclaimed guests that have gone idle, and interests a parent's opt-in has since cleared. */
function sweep(now = Date.now()) {
  const out = { guests_deleted: 0, interests_applied: 0 };
  for (const u of db.find('users', (x) => x.guest === true && !x.consent_id && x.guest_expires_at && Date.parse(x.guest_expires_at) <= now)) {
    require('./account-deletion').deleteAccount(u);
    out.guests_deleted++;
  }
  for (const r of db.find(ANSWERS, (x) => x.interest && !x.interest_applied)) {
    const u = db.byId('users', r.user_id);
    if (u && applyInterest(u)) out.interests_applied++;
  }
  return out;
}

module.exports = {
  ANSWERS, AGREEMENTS, AGREEMENT_VERSION, recordAgreement, INTERESTS, WHY, enabled, cleanAnswers, saveAnswers, createGuest, stateFor, firstLesson, applyInterest, absorbGuest, sweep, accountHome, touch, rowOf,
};
