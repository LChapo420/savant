/**
 * The learner's own view of themselves: the style quiz, the profile the app has
 * built, the dashboard summary, and the account data they can take with them.
 */
const express = require('express');
const db = require('../config/db');
const curriculum = require('../config/curriculum');
const baseLessons = require('../config/base-lessons');
const subscriptions = require('../config/subscriptions');
const learner = require('../services/learner');
const mastery = require('../services/mastery');
const sessions = require('../services/sessions');
const ai = require('../services/ai');
const providers = require('../services/providers');
const personalize = require('../services/personalize');
const scorecard = require('../services/scorecard');
const translate = require('../services/scorecard/translate');
const summary = require('../services/scorecard/summary');
const { requireAuth, publicUser } = require('../middleware/auth');
const { enrollmentView } = require('./catalog');
// The write-ahead (WRITE_AHEAD): opening the dashboard writes ahead of where the learner is.
const writeAhead = require('../services/write-ahead');

const router = express.Router();

router.get('/profile', requireAuth, (req, res) => {
  const profile = learner.getProfile(req.user.id);
  const params = learner.sessionParams(profile);
  res.json({
    user: publicUser(req.user, profile),
    took_style_quiz: !!profile.took_style_quiz,
    evidence_count: profile.evidence_count || 0,
    dimensions: learner.DIMENSIONS,
    stated: learner.describe(profile.style_vector || {}),
    observed: learner.describe(profile.observed || {}),
    traits: profile.observed_traits || [],
    // What the profile actually changes about a session, so the learner can see
    // that the questionnaire had consequences.
    applied: {
      session_length: params.itemCount,
      stretch_share: Number(params.stretchShare.toFixed(2)),
      prefer_type_in: params.preferTypeIn,
      immediate_feedback: params.immediateFeedback,
      explanation_depth: params.explanationDepth,
      name_the_error: params.nameTheError,
    },
    // The details report: what we know about this learner, what they told us, and
    // what was concluded from what they said about levels. This is also the source
    // of the brief the level editor is tailored from, so the page and the prompt
    // are reading the same thing by construction.
    subscription: profile.subscription || 'standard',
    tiers: subscriptions.TIERS,
    can_set_subscription: subscriptions.canSetSubscription(req.user),
    can_edit_levels: subscriptions.canEditLevels(req.user, profile),
    // What they told us about themselves, the definitions of those fields, and
    // whether anything has been answered yet. The definitions travel with the
    // answers so the survey page and the profile page render from one list rather
    // than each keeping its own copy of the questions.
    survey: { ...learner.blankSurvey(), ...(profile.survey || {}) },
    survey_fields: learner.SURVEY_FIELDS,
    survey_answered: learner.surveyAnswered(profile.survey),
    survey_at: profile.survey_at || null,
    conclusions: profile.feedback_conclusions || [],
    feedback_recent: db.find('level_feedback', (f) => f.user_id === req.user.id)
      .sort((a, b) => Date.parse(b.submitted_at) - Date.parse(a.submitted_at))
      .slice(0, 8)
      .map((f) => ({
        id: f.id,
        track_id: f.track_id,
        grade_id: f.grade_id,
        level: f.level,
        kind: f.kind,
        liked: f.liked,
        disliked: f.disliked,
        submitted_at: f.submitted_at,
      })),
    ai_enabled: ai.isEnabled(),
    ai_provider: ai.providerName(),
  });
});

/**
 * The tier the learner picked for themselves.
 *
 * There is no billing, so this is the whole of the subscription model: a field
 * they set, read by `canEditLevels` every time a level is about to be written.
 * Validated against the known tiers rather than stored as free text, because the
 * value decides whether money is spent.
 */
router.post('/profile/subscription', requireAuth, (req, res) => {
  if (!subscriptions.canSetSubscription(req.user)) {
    return res.status(403).json({ error: 'Choosing a plan is not available on this account.' });
  }
  const tier = String(req.body.subscription || '').trim();
  if (!subscriptions.isTier(tier)) {
    return res.status(400).json({ error: `Pick one of: ${subscriptions.TIERS.join(', ')}.` });
  }
  const profile = learner.saveProfile(req.user.id, { subscription: tier });
  res.json({
    subscription: profile.subscription,
    // What the new tier actually means, rather than leaving the learner to infer
    // it from a label. The owner sees false here whatever they pick, which is the
    // one case where the answer is not about the tier.
    can_edit_levels: subscriptions.canEditLevels(req.user, profile),
  });
});

/**
 * The about-you survey, saved from the signup flow or from the profile later.
 *
 * Every field is optional and every one is capped, because there is no answer a
 * person is obliged to give here and the text is compacted into a prompt. A partial
 * survey is the normal case — somebody who answers two of the five boxes has told us
 * two useful things, and refusing the submission until all five are filled would
 * turn a helpful question into a form.
 *
 * The field list comes from `learner.SURVEY_FIELDS` rather than from the request, so
 * an unknown key is dropped instead of stored and a field added on the server is
 * capped the moment it exists.
 */
router.post('/profile/survey', requireAuth, (req, res) => {
  const survey = learner.cleanSurvey(req.body);
  const profile = learner.saveProfile(req.user.id, {
    survey,
    survey_at: learner.surveyAnswered(survey) ? new Date().toISOString() : null,
  });
  res.json({ survey: profile.survey, answered: learner.surveyAnswered(profile.survey) });
});

router.post('/profile/style-quiz', requireAuth, (req, res) => {
  const answers = req.body.answers && typeof req.body.answers === 'object' ? req.body.answers : null;
  if (!answers) return res.status(400).json({ error: 'No answers submitted.' });

  const vector = learner.scoreStyleQuiz(answers);
  if (!Object.keys(vector).length) return res.status(400).json({ error: 'Answer at least one question.' });

  const profile = learner.saveProfile(req.user.id, {
    style_vector: vector,
    took_style_quiz: true,
    style_quiz_at: new Date().toISOString(),
  });
  // A weak prior for the learning scorecard: what people say about how they learn
  // is a starting point that their behaviour soon outweighs.
  scorecard.seedFromStyleQuiz(req.user.id, vector);
  res.json({
    stated: learner.describe(profile.style_vector),
    applied: learner.sessionParams(profile),
  });
});

/** Everything the dashboard needs in one request. */
router.get('/progress', requireAuth, (req, res) => {
  writeAhead.triggerForUser({ user: req.user, reason: 'dashboard' });
  const enrollments = db.find('enrollments', (e) => e.user_id === req.user.id)
    .map((e) => enrollmentView(req.user.id, e))
    .filter(Boolean);

  // A sitting closed without a single answer — a review opened and left, a
  // preview looked at, a session quit on its first question — is not a session
  // the learner did, and listing it gave them rows of "level 1 · — · 0". Those
  // are left out. And the level shown is the level(s) they answered questions
  // at: the stored `level` is moved on when a level closes, so a lesson worked
  // at 42 used to be listed as level 43. Candidates are read in one batch (the
  // newest few dozen) so this stays one pass over the items, however many
  // empty sittings there are.
  const ended = db.find('sessions', (s) => s.user_id === req.user.id && s.ended_at)
    .sort((a, b) => Date.parse(b.ended_at) - Date.parse(a.ended_at))
    .slice(0, 60);
  const work = sessions.workDone(ended);
  const recent = ended
    .filter((s) => (work.get(s.id) || {}).answered > 0)
    .slice(0, 8)
    .map((s) => ({ s, done: work.get(s.id) }))
    .map(({ s, done }) => ({
      id: s.id,
      kind: s.kind,
      level: done.levels.length ? done.levels[done.levels.length - 1] : s.level,
      levels: done.levels.length ? done.levels : [s.level],
      answered: done.answered,
      track_id: s.track_id,
      grade_id: s.grade_id,
      score: s.score,
      xp: s.xp_awarded,
      ended_at: s.ended_at,
      summary: s.analysis ? s.analysis.summary || null : null,
    }));

  // Reviews that have come due, across every track, weakest first: this is the
  // list the email reminders in Phase 4 are built from.
  const now = Date.now();
  const due = db.find('skill_states', (s) => s.user_id === req.user.id
    && s.next_due_at && Date.parse(s.next_due_at) <= now)
    .sort((a, b) => a.mastery - b.mastery)
    .slice(0, 8)
    .map((s) => ({ id: s.skill_id, name: curriculum.skillName(s.skill_id), mastery: Number(s.mastery.toFixed(3)) }));

  const profile = learner.getProfile(req.user.id);
  res.json({
    user: publicUser(req.user, profile),
    enrollments,
    // Which levels of each enrolled course have a generated base lesson, so the
    // dashboard's lesson button opens the page rather than the adaptive session.
    //
    // The same shape and the same gate as the path route sends, because the two
    // pages offer the same choice about the same level and disagreeing about
    // whether a page exists is how one of them ends up linking to a lesson the
    // other does not know about. Courses with no generated pages are left out
    // rather than sent as empty lists.
    // The ids are nested on a view as `track.id` and `grade.id`, not flat. Reading
    // `e.track_id` here finds nothing for every enrollment and the whole map comes
    // back empty — which is indistinguishable from "no pages exist", so it fails
    // silently and looks like a working feature with nothing in it.
    base_lessons: baseLessons.canSeeBaseLessons(req.user)
      ? enrollments.reduce((acc, e) => {
        const levels = baseLessons.levelsFor(e.track.id, e.grade.id);
        if (!levels.length) return acc;
        acc[e.track.id] = acc[e.track.id] || {};
        acc[e.track.id][e.grade.id] = levels;
        return acc;
      }, {})
      : {},
    recent,
    due,
    profile: {
      took_style_quiz: !!profile.took_style_quiz,
      evidence_count: profile.evidence_count || 0,
      traits: profile.observed_traits || [],
    },
    ai_enabled: ai.isEnabled(),
    ai_provider: ai.providerName(),
  });
});

/** Per-skill mastery for one track, for the profile page's detail view. */
router.get('/mastery/:enrollmentId', requireAuth, (req, res) => {
  const enrollment = db.byId('enrollments', req.params.enrollmentId);
  if (!enrollment || enrollment.user_id !== req.user.id) return res.status(404).json({ error: 'Enrollment not found.' });
  const grade = curriculum.getGrade(enrollment.track_id, enrollment.grade_id);
  if (!grade) return res.status(400).json({ error: 'That subject is no longer available.' });

  res.json({
    skills: grade.skills.map((id) => {
      const state = mastery.stateFor(req.user.id, id);
      return {
        id,
        name: curriculum.skillName(id),
        mastery: Number(state.mastery.toFixed(3)),
        attempts: state.attempts,
        correct: state.correct,
        ease: Number((state.ease || 2.5).toFixed(2)),
        due_at: state.next_due_at,
        error_tags: state.error_tags || [],
      };
    }),
  });
});

/**
 * Data export. Phase 5 needs this for its privacy posture; shipping it now costs
 * one route and means the answer to "what do you have on me" is always a link.
 */
const EXPORT_MORE = [
  'essays', 'assist_chats', 'level_logs', 'learner_records', 'level_debriefs', 'subject_placements', 'remediations',
  'streaks', 'reports', 'ai_usage', 'chess_ratings', 'chess_puzzle_attempts', 'chess_rush_runs', 'chess_drill_cards',
  'chess_drill_runs', 'piano_song_results', 'learner_goals', 'tutor_memory', 'es_path_runs', 'es_review',
  'act_profiles', 'act_scores', 'act_study', 'spanish_study', 'spanish_study_checkins', 'spanish_study_tests', 'materials', 'material_courses',
];

router.get('/account/export', requireAuth, (req, res) => {
  const userId = req.user.id;
  const profile = learner.getProfile(userId);
  res.set('Content-Disposition', 'attachment; filename="savant-export.json"');
  res.json({
    exported_at: new Date().toISOString(),
    user: publicUser(req.user, profile),
    profile,
    enrollments: db.find('enrollments', (e) => e.user_id === userId),
    skill_states: db.find('skill_states', (s) => s.user_id === userId),
    sessions: db.find('sessions', (s) => s.user_id === userId),
    items: db.find('items', (i) => i.user_id === userId),
    events: db.find('events', (e) => e.user_id === userId),
    // What they told us about levels, which is theirs in their own words. Their
    // tailored level pages are deliberately not here: they are derived from these
    // plus the base pages, they run to tens of megabytes across a course, and the
    // base pages they were made from are not exported either.
    level_feedback: db.find('level_feedback', (f) => f.user_id === userId),
    scorecard: db.findOne('scorecards', (r) => r.user_id === userId),
    level_signals: db.find('level_signals', (r) => r.user_id === userId),
    // Everything else the store keeps about this account, in its own words or
    // about it (security review 2026-10-24, finding 7: the export stopped at the
    // collections above while essays, chat turns, the after-level reads and the
    // rest were kept too). The pages written for the learner (lessons,
    // level_edits, block_plans, game_payloads) stay out for the reason given above.
    age_check: req.user.age_check || null,
    ...Object.fromEntries(EXPORT_MORE.map((name) => [name, db.find(name, (r) => r && r.user_id === userId)])),
  });
});

/**
 * The learning scorecard: all hundred stats with their confidence, a plain
 * summary, the instructions they currently produce for the levels written for
 * this learner, and the latest evidence. Shown to the learner on purpose — a
 * system that changes how you are taught should be able to show you why.
 */
router.get('/scorecard', requireAuth, (req, res) => {
  const card = scorecard.get(req.user.id);
  const trackId = typeof req.query.track === 'string' && req.query.track ? req.query.track : null;
  const view = scorecard.view(req.user.id, { trackId });
  const p = providers.current('personalize');
  res.json({
    ...view,
    overall_confidence: scorecard.overallConfidence(card),
    summary: summary.summarize(card, { trackId }),
    applied: translate.directives(card, { use: 'L', trackId })
      .map((d) => ({ name: d.name, text: d.text, confidence: d.confidence, strong: d.strong })),
    tracks: Object.keys(card.subjects || {}),
    // What the after-level reads have confirmed. Only solid facts and repeated
    // struggles: a learner should not read a guess about themselves as a finding.
    learned: (() => {
      // eslint-disable-next-line global-require
      const rec = require('../services/learner-record').get(req.user.id);
      return rec.facts.filter((f) => f.status === 'solid' || (f.kind === 'struggle' && f.support >= 2 && f.status !== 'superseded'))
        .map((f) => ({ kind: f.kind, topic: f.topic, text: f.text, levels: f.support }));
    })(),
    personalizer: personalize.isEnabled() && p ? { provider: p.name, model: p.modelFor('personalize') } : null,
  });
});

/**
 * The scorecard as prompt-ready text, for any one-prompt level generator
 * (lessons, true/false, tic-tac-toe, connect four...): add it to the generator's
 * prompt and the level comes out written for this learner. ?track= and ?grade=
 * scope the per-subject stats and the recent-level history.
 */
router.get('/scorecard/prompt-block', requireAuth, (req, res) => {
  const trackId = typeof req.query.track === 'string' ? req.query.track : null;
  const gradeId = typeof req.query.grade === 'string' ? req.query.grade : null;
  res.json({ text: personalize.scorecardSection(req.user.id, { trackId, gradeId }).join('\n') });
});

module.exports = router;
