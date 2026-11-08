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
 *
 * The private beta (owner, 7 Nov: "the sign up and beta terms and stuff aren't on the onboarding they're on the application"): with BETA_SIGNIN_ONLY on or BETA_GATE=invite
 * no guest row is made and no agreement screen shows. /start is for an account that already exists and has no subject yet: age if it was never recorded, then the same
 * four questions and the first lesson. The agreement is recorded where the account is made (routes/auth.js, SIGNUP_AGREEMENT). See docs/ONBOARDING-V2.md section 4.
 */
const db = require('../config/db');

const ANSWERS = 'onboarding_answers';
const AGREEMENTS = 'learner_agreements';
/** Bump when the words on the agreement screen (public/js/start-content.js AGREEMENT) change. */
const AGREEMENT_VERSION = '2026-11-07.1';
const AGREEMENT_COVERS = ['beta_terms', 'privacy_policy', 'outside_ai'];
/** The line on the sign-up page (public/register.html, which must show these same words). A change to these words needs a new version. */
const SIGNUP_AGREEMENT = {
  version: 'signup-2026-11-07.1',
  text: 'By creating an account you agree that this is a beta that can change or break, that lessons can still be wrong even when fact checked, and that what you tell Savant, your answers and your interests go to outside AI companies to write your lessons.',
};
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
/** Invite or sign-in only: accounts come from the application, so nobody is a guest here. The public flow shows only with both off. */
function privateBeta(req) {
  return require('../middleware/signin-only').active(req || { socket: {}, headers: {} }) || require('../middleware/beta-gate').enabled();
}

/**
 * Owner, 7 Nov: "we haven't really fully built those so don't have those in the onboarding in the beta". Subjects kept out of every place a private-beta
 * tester picks one: /start's subjects, the add-a-subject page and the Everything menu's "Add a subject" (both /onboarding, which reads /api/catalog?view=grades).
 * BETA_HIDDEN_SUBJECTS is the one place to change it (comma-separated ids; empty shows everything). Nothing is deleted: the subjects, their pages and any
 * enrollment someone already has stay as they are, and interests (basketball as a hobby) are a different list.
 */
const HIDDEN_IN_BETA = 'basketball,chess,piano';
function hiddenSubjects(req) {
  if (!privateBeta(req)) return new Set();
  const raw = process.env.BETA_HIDDEN_SUBJECTS === undefined ? HIDDEN_IN_BETA : process.env.BETA_HIDDEN_SUBJECTS;
  return new Set(String(raw).split(',').map((x) => x.trim().toLowerCase()).filter(Boolean));
}
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
function cleanAnswers(raw, { child = false, hidden = null } = {}) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  const known = new Set(require('../config/curriculum').catalogue().map((t) => t.id).filter((id) => !(hidden && hidden.has(id))));
  if (Array.isArray(r.tracks)) out.tracks = [...new Set(r.tracks.map(String).filter((t) => known.has(t)))].slice(0, MAX_TRACKS);
  if (typeof r.notes === 'boolean') out.notes = !child && r.notes;
  // "How do you want to learn?" (UI_V2 only: docs/ONBOARDING-V2.md). A child account can't upload, so it never has an answer here.
  if (!child && ['curriculum', 'own', 'both'].includes(r.how)) out.how = r.how;
  if (WHY.includes(r.why)) out.why = r.why;
  const goals = require('./retention-goal');
  if (goals.CHOICES.includes(r.horizon)) out.horizon = r.horizon;
  if (typeof r.test_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.test_date)) out.test_date = r.test_date;
  if (r.interest === 'other' || INTERESTS[r.interest]) out.interest = r.interest;
  if (Array.isArray(r.interests)) {
    out.interests = [...new Set(r.interests.map(String).filter((i) => i === 'other' || INTERESTS[i]))];
    out.interest = out.interests[0] || null; // the first pick stays the main one
  }
  if (typeof r.test_skipped === 'boolean') out.test_skipped = r.test_skipped;
  if (typeof r.interest_text === 'string') out.interest_text = child ? '' : r.interest_text.trim().slice(0, 80);
  if (typeof r.ref === 'string' && /^[a-z0-9]{8}$/.test(r.ref)) out.ref = r.ref;
  return out;
}

function saveAnswers(user, raw, { hidden = null } = {}) {
  const child = !!(user.age_check && user.age_check.needs_parent);
  const clean = cleanAnswers(raw, { child, hidden });
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
function recordAgreement(user, policyVersion, { version = AGREEMENT_VERSION, via = 'onboarding_v2', text = null } = {}) {
  if (user.agreed_at) return user;
  const at = iso();
  db.insert(AGREEMENTS, { user_id: user.id, version, policy_version: policyVersion, covers: AGREEMENT_COVERS, agreed_at: at, via, ...(text ? { text } : {}) });
  return db.update('users', user.id, { agreed_at: at, agreement_version: version });
}

/**
 * An account (not a guest) that /start is for: in the private beta, not locked, and either with no subject and not through the flow yet, or with the
 * first lesson made and not opened yet (a reload on the last screen). Everyone else has a home to go to.
 */
function inFlow(req, user = req.user) {
  if (!enabled() || !user || user.guest || !privateBeta(req)) return false;
  if (consent().access(user).locked) return false;
  const row = rowOf(user.id);
  if (row && (row.lesson_opened_at || row.home_at)) return false;
  if (row && row.first_enrollment_id) return !!db.byId('enrollments', row.first_enrollment_id);
  return redoOnce(user) || !db.findOne('enrollments', (e) => e.user_id === user.id);
}

/**
 * Owner, 7 Nov: "make it so I onboard when I log in". An account named here goes through the flow one time even with subjects already, until it opens the
 * flow's first lesson. Its enrollments and progress stay: firstLesson keeps a learner already on an enrollment where they are. Empty the list to turn it off.
 */
function redoOnce(user) {
  const list = process.env.ONBOARDING_REDO_EMAILS === undefined ? 'landon@savantedu.com' : process.env.ONBOARDING_REDO_EMAILS;
  return list.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean).includes(String(user.email || '').toLowerCase());
}

/** Where an account (not a guest) belongs when it opens this flow: never through it again. */
function accountHome(user) {
  const a = consent().access(user);
  if (a.locked) return '/parent-needed';
  if (a.state === 'needs_age') return '/onboarding';
  const row = rowOf(user.id);
  return db.findOne('enrollments', (e) => e.user_id === user.id) || (row && row.home_at) ? '/dashboard' : '/onboarding';
}

/**
 * Owner, 7 Nov: "after picking the subjects it takes you to the homepage with a take placement button and a pick my grade button, instead of having to do all
 * those in the main onboarding". The flow ends here (UI_V2, private beta: public/js/ui2/start.js). An enrollment always has a grade (services/subject-placement.js
 * chooseGrade), so a subject without one can't be an enrollment, even a placement_pending one: the picked subjects wait on this row as `waiting`, and Home shows
 * each with "Take the placement" and "Pick my grade" until it has an enrollment, made the usual way by either. `home_at` ends the flow (inFlow), so the
 * redo-once account onboards once, as before. Subjects it already has aren't waiting: they carry on as they are.
 */
function toHome(user, { hidden = null } = {}) {
  try { require('./onboarding').closeOpen(user); } catch (err) { console.warn(`onboarding-v2: test not closed: ${err.message}`); }
  const row = saveAnswers(user, {});
  const have = new Set(db.find('enrollments', (e) => e.user_id === user.id).map((e) => e.track_id));
  const waiting = (row.tracks || []).filter((t) => !(hidden && hidden.has(t)) && !have.has(t));
  db.update(ANSWERS, row.id, { waiting, home_at: row.home_at || iso() });
  applyInterest(user);
  return { go: '/dashboard', waiting };
}

/** Home's subjects that still need a start: picked in the flow, not hidden now, and with no enrollment yet. Read only. */
function waitingFor(user, { hidden = null } = {}) {
  if (!enabled() || !user || user.guest) return [];
  const row = rowOf(user.id);
  if (!row || !row.home_at || !Array.isArray(row.waiting)) return [];
  const have = new Set(db.find('enrollments', (e) => e.user_id === user.id).map((e) => e.track_id));
  const cat = require('../config/curriculum').catalogue();
  return row.waiting.filter((t) => !have.has(t) && !(hidden && hidden.has(t))).map((t) => {
    const track = cat.find((x) => x.id === t);
    if (!track) return null;
    const q = encodeURIComponent(t);
    return { track: { id: t, name: track.name, icon: track.icon, color: track.color }, placement_href: `/subject-placement?track=${q}&mode=quick`, pick_href: `/onboarding?track=${q}&pick=1` };
  }).filter(Boolean);
}

/** Where the level the learner stands on opens: the same rule as the path page. */
function lessonHref(user, e) {
  const base = require('../config/base-lessons');
  const blocks = require('./block-levels');
  const at = e.current_level || 1;
  const grade = require('../config/curriculum').getGrade(e.track_id, e.grade_id);
  // A learner's own lesson opens straight on its page: through the session route, a background prefetch of this same level would start first and the learner would wait on it.
  const own = grade && blocks.kindFor(grade, at) === 'lesson' && blocks.visibleTo(user) && blocks.aiReady() && blocks.mayGenerate(user);
  if (own || (base.canSeeBaseLessons(user) && (base.levelsFor(e.track_id, e.grade_id) || []).includes(at))) {
    return `/base-lesson?track=${encodeURIComponent(e.track_id)}&grade=${encodeURIComponent(e.grade_id)}&level=${at}&enrollment=${e.id}`;
  }
  return `/session?enrollment=${e.id}`;
}

/** The learner's own lesson is written when they get here, so the page can wait for it (null: nothing to wait for). */
function ownLesson(user, e) {
  const blocks = require('./block-levels');
  const at = e.current_level || 1;
  const grade = require('../config/curriculum').getGrade(e.track_id, e.grade_id);
  if (!grade || blocks.kindFor(grade, at) !== 'lesson' || !blocks.visibleTo(user) || !blocks.aiReady() || !blocks.mayGenerate(user)) return null;
  return { api: `/api/lessons/${encodeURIComponent(e.track_id)}/${encodeURIComponent(e.grade_id)}/${at}` };
}

function enrollmentView(user, e) {
  return { id: e.id, track_id: e.track_id, grade_id: e.grade_id, grade_name: gradeNameOf(e.track_id, e.grade_id), href: lessonHref(user, e), own: ownLesson(user, e) };
}

/** Where the learner stands on the short test (the baseline, or the style quiz where the baseline is closed to them). */
function testState(user) {
  const baseline = require('./onboarding');
  const g = baseline.get(user.id);
  const open = g.active;
  return {
    allowed: baseline.mayTake(user),
    done: g.sessions.length > 0 || !!(require('./learner').getProfile(user.id) || {}).took_style_quiz,
    open: !!open,
    pending: !!(open && open.current && open.current.id === 'sv:interests'),
  };
}

/** What the page needs to pick up where the learner was, on any device state. */
function stateFor(req) {
  const c = consent();
  const user = req.user;
  if (user && !user.guest && !inFlow(req)) return { account: true, go: accountHome(user) };
  if (user) {
    const account = !user.guest;
    if (!account) touch(user);
    const row = rowOf(user.id) || {};
    const child = !!(user.age_check && user.age_check.needs_parent);
    const e = row.first_enrollment_id ? db.byId('enrollments', row.first_enrollment_id) : null;
    return {
      ...(account ? { account: true, onboarding: true, id: user.id, route: user.age_check ? (child ? 'parent' : 'self') : null, agreed: true } : { guest: true, route: child ? 'parent' : 'self', agreed: !!user.agreed_at }),
      nickname: child ? user.display_name : null,
      consent: c.publicConsent(user).consent,
      answers: {
        tracks: row.tracks || [], notes: !!row.notes, how: row.how || null, why: row.why || null, horizon: row.horizon || null, test_date: row.test_date || null, interest: row.interest || null, interests: row.interests || (row.interest ? [row.interest] : []), interest_text: row.interest_text || '', test_skipped: !!row.test_skipped,
      },
      test: testState(user),
      enrollment: e && e.user_id === user.id ? enrollmentView(user, e) : null,
      lesson_opened: !!row.lesson_opened_at,
    };
  }
  if (privateBeta(req)) return { signed_out: true, go: '/login?next=/start' };
  const screen = c.screenFromSession(req);
  return { route: screen ? (screen.needs_parent ? 'parent' : 'self') : null, age_answered: !!screen };
}

/** The retention and study goals, if any were given (the flow no longer asks). None given leaves the default, forever and full depth, and the line says so. */
function applyGoals(user, e, row) {
  const out = { summary: null };
  try {
    const goals = require('./retention-goal');
    if (row.horizon) {
      const saved = goals.save(user.id, 'enrollment', e.id, { horizon: row.horizon, test_date: row.test_date });
      if (!saved.error) {
        out.horizon = row.horizon;
        out.summary = goals.plainGoal(goals.effective(saved.row.retention_goal, goals.todayFor(user.id)));
      } else out.error = saved.error;
    }
    const study = require('./study-goal');
    if (row.why === 'test' && study.enabled() && study.choices().includes('test')) {
      const saved = study.save(user.id, 'enrollment', e.id, { goal: 'test' });
      if (!saved.error) out.study = 'test';
    }
    if (!out.summary) out.summary = goals.plainGoal(goals.forEnrollment(user.id, e));
  } catch (err) {
    console.warn(`onboarding-v2: goal not set: ${err.message}`);
    out.error = 'not set';
  }
  return out;
}

// ── a level check that had too little to go on (docs/ONBOARDING-V2.md section 2) ─────────
// The walk opens on the subject's first question and its belief starts wide, so a learner who stops after a few answers is placed at an end of the
// scale on almost nothing. The walk is not changed: it still measures the same way and its own answer stays on the row (walk_grade_id). This only
// decides whether the answers are enough to overrule the learner's age.
/** Real tries (not "I don't know") that can overrule age: as many as the walk itself wants before it calls someone a beginner. */
const ENOUGH_TRIES = 6;
/** Or this many right, with "I don't know" above them: that is a real edge, as long as there are ENOUGH_TRIES answers in all. */
const ENOUGH_RIGHT = 3;
/** From this age the start follows age when the answers can't place them. Younger learners keep a low result: their age doesn't argue with it. */
const TEEN_AGE = 13;
/** The highest school year age alone starts anyone at: past it, not everyone has met the material, and "too easy" is one tap. */
const START_YEAR_CAP = 9;

/** The school year in a grade's name ("9th Grade, first half" is 9, "7th to 8th Grade" is 8), or null. Subjects with none aren't tied to age. */
function schoolYearOf(name) {
  const m = /(\d+)(?:st|nd|rd|th)(?:\s+to\s+(\d+)(?:st|nd|rd|th))?\s+Grade/i.exec(String(name || ''));
  return m ? Number(m[2] || m[1]) : null;
}

/** The grade a learner of this age starts at when nothing else says where: the first of their school year, or null for a subject with no school years. */
function gradeForAge(trackId, age) {
  const rules = require('../config/subject-placement');
  const ids = rules.gradesFor(trackId);
  const years = ids.map((id) => schoolYearOf(rules.gradeName(trackId, id)));
  if (!Number.isFinite(age) || !years.some((y) => y != null)) return null;
  const year = Math.min(age - 5, START_YEAR_CAP); // a 6-year-old is in 1st grade
  if (year < 1) return ids[0];
  return ids[years.findIndex((y) => y != null && y >= year)] || null;
}

function enoughToPlace(evidence) {
  const tries = evidence.filter((a) => !a.idk).length;
  const right = evidence.filter((a) => a.correct).length;
  return tries >= ENOUGH_TRIES || (right >= ENOUGH_RIGHT && evidence.length >= ENOUGH_TRIES);
}

/**
 * Called on a walk's new result, for learners in this flow. With too little to go on: a teen or adult starts at the grade for their age; a younger
 * learner keeps a low result and is only brought down from one above their age. Answers that really place someone, low or high, stand.
 * Returns the placement to show.
 */
function settleStart(user, trackId, placement) {
  if (!enabled() || !placement || !placement.recommended_grade_id || !rowOf(user.id)) return placement;
  const sp = require('./subject-placement');
  const ids = placement.grade_ids || [];
  const walk = placement.recommended_grade_id;
  const age = require('./boosters').ageOf(user);
  const forAge = enoughToPlace(sp.evidenceOf(trackId, placement)) ? null : gradeForAge(trackId, age);
  const moveTo = forAge && forAge !== walk && (age >= TEEN_AGE || ids.indexOf(forAge) < ids.indexOf(walk)) ? forAge : null;
  if (!moveTo) return placement.age_start ? db.update('subject_placements', placement.id, { age_start: null }) : placement;
  const name = require('../config/subject-placement').gradeName(trackId, moveTo);
  return db.update('subject_placements', placement.id, {
    recommended_grade_id: moveTo,
    walk_grade_id: walk,
    age_start: { from: walk, to: moveTo, age, at: iso() },
    headline: `Start at ${name}. There weren't enough answers to place you, so this is based on your age, and the first lessons will check it.`,
  });
}

/** The grade's first teaching level (a summary doesn't count), or null when it has none. */
function firstLessonLevel(trackId, gradeId) {
  const curriculum = require('../config/curriculum');
  const LAYOUT = require('../config/level-layout');
  const grade = curriculum.getGrade(trackId, gradeId);
  if (!grade) return null;
  for (let level = 1; level <= grade.pathLength; level += 1) {
    if (curriculum.levelKind(level, grade.pathLength, grade) === 'lesson') {
      const entry = LAYOUT.entryFor(grade, level) || {};
      if (!/summary/i.test(String(entry.type || '')) && !/^summary:/i.test(String(entry.title || ''))) return level;
    }
  }
  return null;
}

/**
 * Stand the learner on lesson 1 of the grade the walk found (or the one they picked), and set the goals they asked for at step 5.
 * Safe to call twice: a learner already on the enrollment stays where they are.
 */
function firstLesson(user, { track, grade_id: gradeId }) {
  const sp = require('./subject-placement');
  try { require('./onboarding').closeOpen(user); } catch (err) { console.warn(`onboarding-v2: test not closed: ${err.message}`); }
  const trackId = String(track || '');
  const walk = sp.placementFor(user.id, trackId);
  const want = String(gradeId || (walk && (walk.chosen_grade_id || walk.recommended_grade_id)) || '');
  const chose = sp.chooseGrade(user.id, trackId, want);
  if (chose.error) return chose;
  let e = chose.enrollment;
  if (e.status === 'placement_pending') {
    const out = require('./owner-skips').skipPlacement({ userId: user.id, enrollment: e, level: 1 });
    if (out.error) return out;
    // Like a placement, this lands on a lesson, not the practice before it, and clears nothing on the way (routes/placement.js finishByUnit).
    const at = firstLessonLevel(trackId, e.grade_id);
    e = at && at !== 1 ? db.update('enrollments', out.enrollment.id, { current_level: at, level_items: 0 }) : out.enrollment;
  }
  const row = saveAnswers(user, {});
  const goal = applyGoals(user, e, row);
  db.update(ANSWERS, row.id, { first_enrollment_id: e.id, first_at: row.first_at || iso() });
  applyInterest(user); // before the lesson opens, so it is written with it. No write-ahead here: the learner opens it next, and that write takes the fast lane.
  return { enrollment: enrollmentView(user, e), goal };
}

/** What the learner said they're into, as words: the tiles' names and anything typed. */
function interestWords(row) {
  const ids = row.interests && row.interests.length ? row.interests : (row.interest ? [row.interest] : []);
  return ids.map((i) => (i === 'other' ? String(row.interest_text || '').trim() : INTERESTS[i])).filter(Boolean).join(', ');
}

/** The interests go into the survey the lesson writers read, only once this account's consent covers outside AI. Changing them replaces what this flow wrote. */
function applyInterest(user) {
  try {
    if (!user || !consent().access(user).ai_free_text) return false;
    const row = rowOf(user.id);
    if (!row || !row.interest) return false;
    const said = interestWords(row);
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
    const baseline = require('./onboarding');
    baseline.closeOpen(guest);
    baseline.moveToAccount(guest, account);
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
  ANSWERS, AGREEMENTS, AGREEMENT_VERSION, SIGNUP_AGREEMENT, privateBeta, hiddenSubjects, HIDDEN_IN_BETA, toHome, waitingFor, inFlow, recordAgreement, INTERESTS, WHY, enabled, cleanAnswers, saveAnswers, createGuest, stateFor, firstLesson, settleStart, gradeForAge, applyInterest, absorbGuest, sweep, accountHome, touch, rowOf,
};
