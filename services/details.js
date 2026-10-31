/**
 * Everything the app knows about one learner, in two forms: an object for the
 * profile page, and a compact text brief for a prompt.
 *
 * ## Why one module and not two
 *
 * The profile page and the level editor need the same facts. If the page showed
 * one set and the prompt carried another, the learner would be reading an
 * explanation of a decision that was not the one made — which is the failure the
 * style quiz's "what this changes" table exists to avoid, one level further down.
 * So both are built here, from the same reads, and `brief()` is a compaction of
 * `report()` rather than a second opinion.
 *
 * ## What it is made of
 *
 *   - **Learning style** — the stated vector from the questionnaire and the
 *     observed one from sessions, blended by `learner.effective`, plus the session
 *     settings that blend actually produces.
 *   - **Interests** — what the learner wrote. The only part of this that is not
 *     inferred, and the only source for what a person actually wants.
 *   - **Conclusions from their input** — what they said about the levels they have
 *     done, and the summary a model wrote of it.
 *   - **Where they are** — mastery on the course they are standing on.
 *   - **Notes from the tutor** — traits the session analyst has already inferred.
 *
 * Everything here degrades to empty rather than throwing. A learner with no
 * questionnaire, no sessions and no feedback is the normal case for a new account,
 * and the report has to read sensibly then rather than being a wall of zeros.
 */
const crypto = require('crypto');

const db = require('../config/db');
const curriculum = require('../config/curriculum');
const learner = require('./learner');
const mastery = require('./mastery');

/** How much of the brief one section may contribute. Keeps the prompt bounded. */
const LIMITS = {
  traits: 6,
  feedback: 6,
  conclusions: 5,
  weakSkills: 5,
  strongSkills: 4,
};

/** The learner's feedback, newest first. */
function feedbackFor(userId, limit) {
  return db.find('level_feedback', (f) => f.user_id === userId)
    .sort((a, b) => Date.parse(b.submitted_at) - Date.parse(a.submitted_at))
    .slice(0, limit);
}

/** The enrollment this brief is being built for, if there is one. */
function enrollmentFor(userId, where) {
  if (!where || !where.trackId || !where.gradeId) return null;
  return db.findOne('enrollments', (e) => e.user_id === userId
    && e.track_id === where.trackId && e.grade_id === where.gradeId);
}

/** Where the learner stands on a course, as rows worth quoting. */
function masteryRows(userId, where) {
  const enrollment = enrollmentFor(userId, where);
  if (!enrollment) return null;
  const grade = curriculum.getGrade(where.trackId, where.gradeId);
  if (!grade) return null;

  const progress = mastery.levelProgress(userId, enrollment, grade);
  const introduced = progress.introduced || [];
  const states = introduced.map((skillId) => ({
    skill_id: skillId,
    name: curriculum.skillName(skillId),
    ...mastery.stateFor(userId, skillId),
  })).sort((a, b) => a.mastery - b.mastery);

  return {
    level: enrollment.current_level,
    kind: progress.kind,
    average: Number((progress.average || 0).toFixed(3)),
    weakest: Number((progress.weakest || 0).toFixed(3)),
    weak: states.filter((s) => s.mastery < 0.6).slice(0, LIMITS.weakSkills)
      .map((s) => `${s.name} (${Math.round(s.mastery * 100)}%)`),
    strong: states.filter((s) => s.mastery >= 0.8).slice(-LIMITS.strongSkills)
      .map((s) => `${s.name} (${Math.round(s.mastery * 100)}%)`),
  };
}

/**
 * The details report, as the profile page reads it.
 *
 * @param {number} userId
 * @param {{trackId?: string, gradeId?: string, level?: number}} [where] the course
 *   to include mastery for. Omit it and the report carries no position.
 */
function report(userId, where) {
  const profile = learner.getProfile(userId);
  const params = learner.sessionParams(profile);
  const feedback = feedbackFor(userId, LIMITS.feedback);

  return {
    style: {
      stated: learner.describe(profile.style_vector || {}),
      observed: learner.describe(profile.observed || {}),
      traits: (profile.observed_traits || []).slice(-LIMITS.traits),
      evidence_count: profile.evidence_count || 0,
      took_style_quiz: !!profile.took_style_quiz,
      applied: {
        session_length: params.itemCount,
        stretch_share: Number(params.stretchShare.toFixed(2)),
        prefer_type_in: params.preferTypeIn,
        immediate_feedback: params.immediateFeedback,
        explanation_depth: params.explanationDepth,
        name_the_error: params.nameTheError,
      },
    },
    interests: (profile.survey && profile.survey.interests) || '',
    survey: { ...learner.blankSurvey(), ...(profile.survey || {}) },
    survey_answered: learner.surveyAnswered(profile.survey),
    conclusions: profile.feedback_conclusions || [],
    feedback,
    mastery: masteryRows(userId, where),
  };
}

/**
 * The same facts as a text brief for a prompt.
 *
 * Deliberately short and in the `- ` bullet style the prompts already use, because
 * it is appended to a prompt that is already 16,000 characters before it starts.
 * A brief that doubled the prompt's length would buy nothing and cost latency on
 * every single level.
 *
 * The instruction that makes this worth having comes first: a writer told a
 * learner's preferences can honour them. A writer not told will produce the
 * generic page, which is what the base lesson already is.
 *
 * Order, for the providers' prompt caches (an exact prefix is served cheaper):
 * the fixed lines first, then what stays the same from level to level (what
 * they told us, the scorecard's measured instructions, what their record holds
 * for sure, notes from earlier sessions), and last what changes every level
 * (their feedback, where they stand, how the last few levels went).
 *
 * There used to be a "HOW THEY ARE BEST TAUGHT" section here as well: the
 * questionnaire's stated style and the session analyst's observed one, beside
 * the scorecard's instructions. Two overlapping, partly conflicting channels
 * into one writer (research report 1.3g); the stated half is self-report about
 * what teaches you best, the least trusted kind (Deslauriers et al. 2019). The
 * measured instructions are the one channel now. The style vector still sets
 * session settings (learner.sessionParams) and the profile page still shows it.
 *
 * @param {number} userId
 * @param {{trackId: string, gradeId: string, level: number}} where
 * @returns {string}
 */
function brief(userId, where) {
  const r = report(userId, where);
  const lines = [];
  // Required lazily, like services/ai.js below, so loading this module does not
  // pull in the provider chain.
  // eslint-disable-next-line global-require
  const personalize = require('./personalize');
  // eslint-disable-next-line global-require
  const learnerRecord = require('./learner-record');

  lines.push('--- THIS LEARNER ---');
  lines.push('This lesson is written for one person. Everything below is about them.');
  lines.push('Teach this topic to this person. Where their preferences and the');
  lines.push('subject disagree, the subject wins — but the way it is explained is theirs.');
  lines.push('');

  // What they care about, in their own words.
  //
  // This is the only part of the brief a person wrote themselves, so it is quoted
  // rather than summarised — a paraphrase of "I play pickup soccer and I hate being
  // told the answer before I have tried it" loses exactly the detail that makes it
  // usable as an instruction. Each field is labelled so the writer knows which
  // question it answers, because "ACT in spring" means something different under
  // "studying" than it would under "hobbies".
  lines.push('WHAT THEY TOLD US ABOUT THEMSELVES');
  const said = Object.entries(learner.SURVEY_FIELDS)
    .map(([key, spec]) => [spec.label, String((r.survey && r.survey[key]) || '').trim()])
    .filter(([, value]) => value.length > 0);
  if (said.length) {
    for (const [label, value] of said) {
      lines.push(`- ${label}`);
      for (const part of value.split(/\n+/).map((x) => x.trim()).filter(Boolean)) {
        lines.push(`    ${part}`);
      }
    }
  } else {
    lines.push('- They have not filled this in. Do not invent interests; use examples');
    lines.push('  that suit the subject, and keep them plain.');
  }
  lines.push('');

  // The measured half: the 100-stat learning scorecard, as ranked instructions
  // (nothing at all when nothing is confident).
  const measured = personalize.scorecardSection(userId, where || {}, { recent: false });
  if (measured.length) lines.push(...measured, '');
  // The learning spec (services/learning-spec.js): every metric, interests, dislikes and context as one block, so a level
  // writer rebuilds the level for this learner and keeps what it covers. A change in it changes this brief's hash, so a
  // written page is rewritten. Empty for a learner we know nothing about, and for the owner.
  // eslint-disable-next-line global-require
  const specLines = require('./learning-spec').linesFor(userId, { trackId: (where && where.trackId) || null, gradeId: (where && where.gradeId) || null }, 'level');
  if (specLines.length) lines.push(...specLines, '');
  // What the after-level reads have established for sure, and where they
  // struggle (with the hints to add).
  lines.push(...learnerRecord.briefLines(userId, where || {}, { recent: false }));

  if (r.style.traits.length) {
    lines.push('NOTED FROM EARLIER SESSIONS');
    for (const t of r.style.traits) lines.push(`- ${t}`);
    lines.push('');
  }

  // ── from here on, what changes from level to level ──
  const feedbackLines = [];
  for (const fb of r.feedback.slice(0, LIMITS.feedback)) {
    const at = `${fb.track_id}/${fb.grade_id} level ${fb.level}`;
    if (fb.liked) feedbackLines.push(`- Liked, at ${at}: ${fb.liked}`);
    if (fb.disliked) feedbackLines.push(`- Did not like, at ${at}: ${fb.disliked}`);
    if (fb.comments) feedbackLines.push(`- Also said, at ${at}: ${fb.comments}`);
  }
  if (r.conclusions.length) {
    lines.push('WHAT WE CONCLUDED FROM THEIR FEEDBACK');
    for (const c of r.conclusions.slice(0, LIMITS.conclusions)) lines.push(`- ${c}`);
    lines.push('');
  }
  if (feedbackLines.length) {
    lines.push('WHAT THEY SAID ABOUT LEVELS, MOST RECENT FIRST');
    lines.push(...feedbackLines);
    lines.push('');
  }

  // Where they are.
  if (r.mastery) {
    lines.push('WHERE THEY ARE ON THIS COURSE');
    lines.push(`- Standing on level ${r.mastery.level}, which is a ${r.mastery.kind} level`);
    lines.push(`- Mastery here: ${Math.round(r.mastery.average * 100)}%, weakest skill ${Math.round(r.mastery.weakest * 100)}%`);
    if (r.mastery.weak.length) lines.push(`- Weak right now: ${r.mastery.weak.join('; ')}`);
    if (r.mastery.strong.length) lines.push(`- Solid: ${r.mastery.strong.join('; ')}`);
    lines.push('');
  }

  // How the last few levels went: the scorecard's level rows, then what the
  // after-level reads concluded.
  const recentRows = personalize.recentLevelsSection(userId, where || {});
  if (recentRows.length) lines.push(...recentRows, '');
  lines.push(...learnerRecord.recentConclusionLines(userId, where || {}));

  lines.push('--- END THIS LEARNER ---');
  return lines.join('\n');
}

/**
 * A stable fingerprint of the brief for one course.
 *
 * Used to tell whether a level that was written for this learner is still current.
 * Anything that changes the brief — a new interest, a piece of feedback, another
 * analysed session, a different mastery position — changes the hash, and a stored
 * page whose hash no longer matches is one that may be rewritten.
 *
 * Level is part of the key on purpose: mastery and "where they are" move as they
 * progress, so level 120's brief should not be treated as stale because level 121's
 * would differ.
 */
function briefHash(userId, where) {
  return crypto.createHash('sha1').update(brief(userId, where)).digest('hex').slice(0, 16);
}

module.exports = {
  report, brief, briefHash, LIMITS,
};
