/**
 * The learner profile: how this person is taught, as opposed to what they know
 * (that lives in services/mastery.js).
 *
 * Two sources feed it. The optional style quiz is stated preference, which is a
 * decent prior and a poor oracle. Session evidence is observed behavior — where
 * accuracy holds, where latency spikes, which formats produce the cleanest
 * recall — and it outranks the quiz as soon as there is enough of it. The
 * blending rule below is the whole idea: stated preference dominates early,
 * observed behavior dominates later.
 *
 * Deliberately not modeled: "visual/auditory/kinesthetic learner" types. That
 * framing does not hold up when tested, and building the product on it would
 * make every downstream decision worse. What is modeled instead are choices the
 * app can actually act on: how much explanation, examples before rules or after,
 * session length, difficulty step, review load, feedback timing.
 */
const db = require('../config/db');
const scorecard = require('./scorecard');
const translate = require('./scorecard/translate');
// The owner gets the base product: no stated or observed style, no scorecard,
// no personal coach brief (config/owner.js ownerBase; OWNER_BASE=off lifts it).
const owner = require('../config/owner');

const DIMENSIONS = {
  explanation_depth: { low: 'brief explanations', high: 'thorough explanations' },
  example_order:     { low: 'rule first, then examples', high: 'examples first, then the rule' },
  visual_support:    { low: 'plain prose', high: 'tables and diagrams' },
  practice_density:  { low: 'fewer, harder questions', high: 'more, smaller questions' },
  session_pacing:    { low: 'short frequent sessions', high: 'longer deep sessions' },
  feedback_timing:   { low: 'feedback after each answer', high: 'feedback at the end' },
  challenge_appetite:{ low: 'build confidence first', high: 'push into hard material' },
  verbalization:     { low: 'work it silently', high: 'explain reasoning in words' },
  error_focus:       { low: 'show the correct method', high: 'name what went wrong' },
  retrieval_style:   { low: 'recognize the answer', high: 'recall it cold' },
};

/**
 * The style quiz. Each item is a forced choice between two concrete behaviors
 * rather than a self-rating, because people are better at recognizing what they
 * do than at scoring what they are.
 */
const STYLE_QUESTIONS = [
  { id: 'q1', dim: 'explanation_depth', prompt: 'A new idea is introduced. What helps you more?',
    low: 'One or two sentences, then let me try it', high: 'The full reasoning before I try anything' },
  { id: 'q2', dim: 'explanation_depth', prompt: 'You got a question wrong. What do you want next?',
    low: 'The short version of the fix', high: 'A worked solution from the first step' },
  { id: 'q3', dim: 'example_order', prompt: 'Learning a rule works better for you when',
    low: 'the rule is stated first, then demonstrated', high: 'you see cases first and the rule emerges' },
  { id: 'q4', dim: 'example_order', prompt: 'Faced with an unfamiliar problem type, you would rather',
    low: 'be told the method to apply', high: 'see two solved examples and infer the method' },
  { id: 'q5', dim: 'visual_support', prompt: 'When the material has structure, you follow it best as',
    low: 'clear sentences', high: 'a table, tree, or diagram' },
  { id: 'q6', dim: 'visual_support', prompt: 'To compare several cases at once you prefer',
    low: 'a written description of the differences', high: 'a side-by-side layout' },
  { id: 'q7', dim: 'practice_density', prompt: 'Given 20 minutes of practice you would rather have',
    low: '4 hard problems', high: '15 quick ones' },
  { id: 'q8', dim: 'practice_density', prompt: 'You feel you are learning when',
    low: 'a single problem takes real effort', high: 'you are moving through many items' },
  { id: 'q9', dim: 'session_pacing', prompt: 'Your best study block is',
    low: '10 to 15 minutes', high: '40 minutes or more' },
  { id: 'q10', dim: 'session_pacing', prompt: 'Across a week you would rather do',
    low: 'a little most days', high: 'two long sittings' },
  { id: 'q11', dim: 'feedback_timing', prompt: 'During a quiz you want to know you are right',
    low: 'immediately after each question', high: 'at the end, all at once' },
  { id: 'q12', dim: 'feedback_timing', prompt: 'Being told mid-quiz that you missed one',
    low: 'helps you correct course', high: 'breaks your concentration' },
  { id: 'q13', dim: 'challenge_appetite', prompt: 'When material gets hard you tend to',
    low: 'want easier items to rebuild footing', high: 'want to stay on the hard ones' },
  { id: 'q14', dim: 'challenge_appetite', prompt: 'A question well above your level feels',
    low: 'discouraging', high: 'interesting' },
  { id: 'q15', dim: 'verbalization', prompt: 'You understand something better after',
    low: 'working through it yourself', high: 'explaining it in your own words' },
  { id: 'q16', dim: 'verbalization', prompt: 'Being asked to write why an answer works',
    low: 'slows you down', high: 'locks it in' },
  { id: 'q17', dim: 'error_focus', prompt: 'After a wrong answer, the more useful feedback is',
    low: 'here is the correct method, step by step', high: 'here is the specific mistake you made' },
  { id: 'q18', dim: 'error_focus', prompt: 'You would rather a tutor',
    low: 'reteach the topic', high: 'point at the exact line where your reasoning broke' },
  { id: 'q19', dim: 'retrieval_style', prompt: 'You remember things longer when you',
    low: 'pick the right answer from options', high: 'produce the answer from memory' },
  { id: 'q20', dim: 'retrieval_style', prompt: 'Typing an answer with no choices shown feels',
    low: 'unnecessarily hard', high: 'like the real test of whether you know it' },
];

const SCALE = [
  { value: 0, label: 'Strongly the first' },
  { value: 0.33, label: 'Somewhat the first' },
  { value: 0.67, label: 'Somewhat the second' },
  { value: 1, label: 'Strongly the second' },
];

/**
 * The about-you survey: what a learner says about themselves, in their own words.
 *
 * Everywhere else in this app a learner is measured — what they answer, how long
 * they take, whether they used a hint. This is the one place they are simply asked,
 * and it is the only source for the things no amount of answering reveals: what
 * they are interested in, what they are already studying, and what they would not
 * mind seeing in an example.
 *
 * The fields, their labels and their caps live here rather than in the page that
 * renders them, because three things read this list: the survey page at signup, the
 * profile page where it can be edited later, and the server that saves it. A field
 * added to one and not the others is a field that silently does nothing.
 *
 * `max` is a character cap, not a target. They are generous because a person
 * writing three sentences about their hobbies should not be cut off, and bounded
 * because this text is compacted into a prompt on every level.
 */
const SURVEY_FIELDS = {
  interests: {
    label: 'What are you interested in?',
    hint: 'Anything at all — subjects, ideas, things you read about.',
    placeholder: 'Space, ancient history, how machines work…',
    max: 2000,
  },
  studying: {
    label: 'What are you studying, or what are you trying to get better at?',
    hint: 'A class, a test, or just something you want to understand.',
    placeholder: 'Algebra 2, the ACT in spring, writing essays that do not sound like a robot…',
    max: 800,
  },
  hobbies: {
    label: 'What do you do for fun?',
    hint: 'These make good examples, so the more specific the better.',
    placeholder: 'Building model rockets, cooking, arguing about basketball stats…',
    max: 800,
  },
  sports: {
    label: 'Do you play or follow any sports?',
    hint: 'Watching counts.',
    placeholder: 'Play pickup soccer, follow Formula 1…',
    max: 400,
  },
  notes: {
    label: 'Anything else that would help?',
    hint: 'How you like to be taught, what has not worked before, anything at all.',
    placeholder: 'I lose focus after about twenty minutes. I hate being told the answer '
      + 'before I have tried it…',
    max: 2000,
  },
};

/** An empty survey, with every field present so nothing reads as undefined. */
function blankSurvey() {
  const survey = {};
  for (const key of Object.keys(SURVEY_FIELDS)) survey[key] = '';
  return survey;
}

/**
 * Clean a submitted survey: keep only known fields, trim, and cap.
 *
 * @param {object} raw
 * @returns {object} a survey with every field present
 */
function cleanSurvey(raw) {
  const out = blankSurvey();
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, spec] of Object.entries(SURVEY_FIELDS)) {
    out[key] = String(raw[key] || '').trim().slice(0, spec.max);
  }
  return out;
}

/** Is there anything in it? A survey nobody filled in is not one. */
function surveyAnswered(survey) {
  if (!survey) return false;
  return Object.keys(SURVEY_FIELDS).some((key) => String(survey[key] || '').trim().length > 0);
}

function blankProfile(userId) {
  return {
    user_id: userId,
    style_vector: {},        // dimension -> 0..1 from the quiz
    observed: {},            // dimension -> 0..1 inferred from sessions
    observed_traits: [],     // short strings written by the analyst
    evidence_count: 0,       // number of analyzed sessions
    took_style_quiz: false,
    // What the learner told us about themselves, and the conclusions drawn from
    // what they said about levels. These are what the per-user level editor is
    // tailored from — see services/details.js.
    subscription: 'standard',
    survey: blankSurvey(),
    survey_at: null,
    feedback_conclusions: [],
    updated_at: null,
  };
}

function getProfile(userId) {
  return db.findOne('profiles', (p) => p.user_id === userId) || blankProfile(userId);
}

function saveProfile(userId, patch) {
  return db.upsert('profiles', (p) => p.user_id === userId, (existing) => ({
    ...(existing || blankProfile(userId)),
    ...patch,
  }));
}

/** Score the style quiz into a 0..1 value per dimension. */
function scoreStyleQuiz(answers) {
  const sums = {};
  const counts = {};
  for (const q of STYLE_QUESTIONS) {
    const raw = answers[q.id];
    if (raw === undefined || raw === null || raw === '') continue;
    const v = Math.max(0, Math.min(1, Number(raw)));
    if (!Number.isFinite(v)) continue;
    sums[q.dim] = (sums[q.dim] || 0) + v;
    counts[q.dim] = (counts[q.dim] || 0) + 1;
  }
  const vector = {};
  for (const dim of Object.keys(DIMENSIONS)) {
    if (counts[dim]) vector[dim] = Number((sums[dim] / counts[dim]).toFixed(3));
  }
  return vector;
}

/** Human-readable lines for the profile screen. */
function describe(vector) {
  return Object.entries(vector)
    .filter(([dim]) => DIMENSIONS[dim])
    .map(([dim, v]) => {
      const d = DIMENSIONS[dim];
      const strength = Math.abs(v - 0.5) < 0.12 ? 'balanced' : v > 0.5 ? d.high : d.low;
      return { dim, label: dim.replace(/_/g, ' '), value: v, reads: strength };
    });
}

/**
 * P4 (evidence article 03, mechanism 15): SCORECARD_OBSERVED_PREFS.
 *   on      observed behaviour replaces the stated preference (observed weight
 *           0.15 a session, capped at 1.0, so after 7 analysed sessions the
 *           quiz answer has no weight), and the scorecard term counts only when
 *           the insertion contract's calibrated gate passes that stat.
 *   shadow  the old rule decides; what the new rule would give is recorded
 *           (observedPrefsShadow()) and logged once per learner and dimension.
 *   off     the old rule: observed weight capped at 0.75, and the scorecard term
 *           blended in at confidence >= 30, outside the gate.
 * Self-reported preference is a poor basis for tailoring (pashler2008,
 * rogowsky2015, kirschner2013, nisbett1977).
 */
function observedPrefsMode() {
  const m = String(process.env.SCORECARD_OBSERVED_PREFS || 'on').toLowerCase();
  return ['on', 'shadow', 'off'].includes(m) ? m : 'on';
}

const SHADOW_KEEP = 500;
const shadowLog = [];
const shadowSeen = new Map();
/** What the new rule would have changed while in shadow (newest last; in memory only, no learner text). */
function observedPrefsShadow() {
  return shadowLog.slice();
}

// The contract's gated sides for a learner, re-read only when their card changes.
const gatedMemo = new Map();
function gatedSides(userId) {
  const card = db.findOne('scorecards', (r) => r.user_id === userId);
  if (!card) return {};
  // The population moves the standing gate too, so a hit also expires after a minute.
  const key = `${card.updated_at || ''}:${card.updates || 0}:${(card.log || []).length}`;
  const hit = gatedMemo.get(userId);
  if (hit && hit.key === key && Date.now() - hit.at < 60000) return hit.sides;
  // eslint-disable-next-line global-require
  const contract = require('./scorecard/contract');
  const sides = contract.read(userId, { memory: false }).lesson.sides || {};
  if (gatedMemo.size > 2000) gatedMemo.clear();
  gatedMemo.set(userId, { key, sides, at: Date.now() });
  return sides;
}

function blendStated(profile, dim, fallback, cap) {
  const stated = profile.style_vector ? profile.style_vector[dim] : undefined;
  const observed = profile.observed ? profile.observed[dim] : undefined;
  const w = Math.min(cap, (profile.evidence_count || 0) * 0.15);
  if (stated === undefined && observed === undefined) return fallback;
  if (observed === undefined) return stated;
  if (stated === undefined) return observed;
  return stated * (1 - w) + observed * w;
}

function withCard(value, card) {
  const cw = Math.min(0.85, card.confidence / 100);
  return value * (1 - cw) + card.value * cw;
}

/** The old rule (SCORECARD_OBSERVED_PREFS=off). */
function effectiveOld(profile, dim, fallback, card) {
  let value = blendStated(profile, dim, fallback, 0.75);
  // The learning scorecard measures the same thing from far more evidence. Once
  // it is reasonably sure, it takes over in proportion to how sure it is.
  if (card && card.confidence >= 30) value = withCard(value, card);
  return value;
}

/** The new rule: behaviour replaces the statement; the scorecard term only through the gate. */
function effectiveNew(profile, dim, fallback, card) {
  let value = blendStated(profile, dim, fallback, 1.0);
  const map = scorecard.DIMENSION_STAT && scorecard.DIMENSION_STAT[dim];
  if (card && map && gatedSides(profile.user_id)[map[0]]) value = withCard(value, card);
  return value;
}

/**
 * The effective value of a dimension: stated preference blended with observed
 * behavior, where observation gains weight with every analyzed session, plus
 * the scorecard's reading (see observedPrefsMode for the rule in force).
 */
function effective(profile, dim, fallback = 0.5) {
  if (profile && profile.user_id && owner.ownerBase(profile.user_id)) return fallback;
  const mode = observedPrefsMode();
  const card = profile.user_id ? scorecard.forDimension(profile.user_id, dim) : null;
  if (mode === 'on') return effectiveNew(profile, dim, fallback, card);
  const old = effectiveOld(profile, dim, fallback, card);
  if (mode === 'shadow') {
    let next = old;
    try { next = effectiveNew(profile, dim, fallback, card); } catch { /* shadow never breaks a session */ }
    if (Math.abs(next - old) >= 0.01) {
      shadowLog.push({ at: new Date().toISOString(), user_id: profile.user_id || null, dim, old: Number(old.toFixed(3)), new: Number(next.toFixed(3)) });
      if (shadowLog.length > SHADOW_KEEP) shadowLog.splice(0, shadowLog.length - SHADOW_KEEP);
      const k = `${profile.user_id}:${dim}`;
      const was = shadowSeen.get(k);
      if (was === undefined || Math.abs(was - next) >= 0.05) {
        shadowSeen.set(k, next);
        console.log(`observed-prefs shadow: user ${profile.user_id} ${dim} ${old.toFixed(2)} -> ${next.toFixed(2)}`);
      }
    }
  }
  return old;
}

/** A scorecard stat as 0..1, or null when the app is not yet confident about it. */
function stat(userId, statId, minConfidence = 40) {
  if (!userId) return null;
  const card = db.findOne('scorecards', (r) => r.user_id === userId);
  if (!card) return null;
  // Session settings follow what was measured, not what a model read suggested.
  const { measured, confidence } = scorecard.read(card, statId);
  return confidence >= minConfidence ? measured / 100 : null;
}

/**
 * Turn the profile into the concrete parameters a session is built from. This is
 * the function that makes the profile matter: nothing else in the app reads the
 * style vector directly.
 */
function sessionParams(profile, { checkpoint = null, scorecard: useScorecard = true, goal = null } = {}) {
  const density = effective(profile, 'practice_density');
  const pacing = effective(profile, 'session_pacing');
  const appetite = effective(profile, 'challenge_appetite');
  const retrieval = effective(profile, 'retrieval_style');
  const timing = effective(profile, 'feedback_timing');
  const depth = effective(profile, 'explanation_depth');
  const errorFocus = effective(profile, 'error_focus');

  let length = Math.round(6 + density * 6 + pacing * 6); // 6-18 items
  let supportShare = appetite > 0.6 ? 0.1 : 0.2;
  let stretchShare = 0.1 + appetite * 0.2;
  let preferTypeIn = retrieval > 0.55;
  // What the scorecard may move, only through the insertion contract's calibrated
  // gate (services/scorecard/contract.js forSession). This used to read attention
  // runway and frustration from the raw score at 40% confidence, outside the gate,
  // so a session could shrink on a reading the scorecard itself would not act on
  // (scorecard round 6). `scorecard: false` gives the base before it, which is what
  // adaptation's plan starts from, so a confident side is applied once, not twice.
  if (useScorecard && profile && profile.user_id && !owner.ownerBase(profile.user_id)) {
    // eslint-disable-next-line global-require
    const contract = require('./scorecard/contract');
    const s = contract.forSession(contract.read(profile.user_id, { memory: false }));
    if (s.items) length = Math.round(length * (1 + s.items));
    supportShare = Math.max(0, Math.min(0.35, supportShare + s.support));
    // P2 (SCORECARD_SOFT_STRETCH): at most 0.25 stretch (0.35 when off).
    stretchShare = Math.max(0.05, Math.min(contract.stretchMax(), stretchShare + s.stretch));
    if (s.typed) preferTypeIn = true;
  }
  const params = {
    itemCount: checkpoint ? null : Math.max(5, Math.min(18, length)),
    reviewShare: 0.25,                                  // adjusted by due reviews at build time
    stretchShare,                                       // share of items above level
    supportShare,                                       // share below level
    preferTypeIn,
    immediateFeedback: timing < 0.55,
    explanationDepth: depth > 0.6 ? 'thorough' : depth < 0.4 ? 'brief' : 'standard',
    nameTheError: errorFocus >= 0.5,
    verbalize: effective(profile, 'verbalization') > 0.6,
  };
  // The learner's stated goal for this grade moves the mix a bounded amount, on top
  // of everything above (services/goals.js). Never for the owner's base account,
  // and never on a checkpoint, which is a test of the grade, not a session to shape.
  if (goal && !checkpoint && profile && profile.user_id && !owner.ownerBase(profile.user_id)) {
    // eslint-disable-next-line global-require
    return require('./goals').adjustParams(params, goal);
  }
  return params;
}

const ERROR_TAG_PHRASES = {
  sign_error: 'drops or flips signs',
  order_of_operations: 'evaluates in the wrong order',
  careless_arithmetic: 'makes arithmetic slips under speed',
  conceptual_gap: 'is missing the underlying idea, not the procedure',
  incomplete_reasoning: 'stops one step short of the answer',
  misread_prompt: 'answers a different question than the one asked',
  units_or_format: 'gets the value right but the form wrong',
  vocabulary_gap: 'does not know the word being used',
  grammar_rule: 'has not internalized the rule',
  conjugation_form: 'picks the wrong verb form',
  agreement_error: 'misses agreement between words',
  pattern_misread: 'reads the pattern wrong before reasoning about it',
  overgeneralization: 'applies a rule past where it holds',
  no_attempt: 'gives up before trying',
};

/**
 * Has this learner actually said anything about what they are interested in?
 *
 * The scorecard carries one instruction that builds the teaching on what they
 * said they like. With nothing said it is worse than useless — it invites the
 * writer to invent an interest — so `translate.directives` drops it unless this
 * is true. Both briefs need that answer, and they must not each decide it for
 * themselves: they did once, and the level writer was the one telling the model
 * to use interests the learner had never mentioned.
 *
 * @param {number} userId
 * @returns {boolean}
 */
function hasStatedInterests(userId) {
  const survey = getProfile(userId).survey || {};
  return !!String(survey.interests || survey.hobbies || survey.sports || '').trim();
}

/**
 * The teaching brief: everything a tutor would want to know about this person
 * before opening their mouth, written as instructions rather than data.
 *
 * This is what stops the chat from being a generic assistant that happens to
 * know the answer. Two learners stuck on the same question get a different
 * opening move, a different amount of explanation, and a different thing
 * checked first, because the brief says so.
 *
 * It composes three things:
 *   - how this person learns (stated preferences, then observed behavior)
 *   - what they actually know about this skill right now
 *   - how they have gone wrong on it before
 */
function teachingBrief(userId, { skillId, skillName, level, trackName, noSpec = false } = {}) {
  // Required lazily: mastery has no dependency on this module, but keeping the
  // import local documents that this is the only place the two meet.
  // eslint-disable-next-line global-require
  const mastery = require('./mastery');
  // eslint-disable-next-line global-require
  const db = require('../config/db');

  const profile = getProfile(userId);
  const params = sessionParams(profile);
  const lines = [];
  // The owner's brief is the standard one: the neutral teaching lines (effective()
  // and sessionParams() read nothing personal for this account) and the context.
  const base = owner.ownerBase(userId);

  // ── how to teach them ────────────────────────────────────────────────────
  const how = [];
  how.push(params.explanationDepth === 'brief'
    ? 'Say less. One or two sentences per turn, then hand it back to them. Long explanations lose this learner.'
    : params.explanationDepth === 'thorough'
      ? 'Give the reasoning, not just the step. This learner wants to know why a move is legal before they make it.'
      : 'Keep turns to two or three sentences.');

  how.push(effective(profile, 'example_order') > 0.55
    ? 'Lead with a concrete case and let them pull the rule out of it. Do not state the rule first.'
    : 'Name the rule, then show it working on this problem.');

  if (effective(profile, 'visual_support') > 0.6) {
    how.push('Lay out comparisons as a short list or a two-column contrast in plain text. This learner follows structure better than prose.');
  }
  how.push(params.nameTheError
    ? 'When they go wrong, name the exact move that was wrong and what it produced. Do not restart the explanation from the top.'
    : 'When they go wrong, walk the method again from the last step that was right, rather than dwelling on the mistake.');

  if (params.verbalize) {
    how.push('Ask them to say why a step works in their own words before moving on. Explaining it out loud is what makes it stick for this learner.');
  }
  if (effective(profile, 'challenge_appetite') > 0.6) {
    how.push('They respond to being pushed. Offer the harder version once they have it, rather than consolidating.');
  } else if (effective(profile, 'challenge_appetite') < 0.4) {
    how.push('They lose confidence when stretched. Get one clean success before raising difficulty, and say plainly when they have got something right.');
  }
  if (effective(profile, 'retrieval_style') > 0.6) {
    how.push('Make them produce the answer rather than recognize it. Do not offer a shortlist to pick from.');
  }
  if (base) {
    how.push('Teach a typical learner at this level, clearly and plainly.');
    lines.push(`HOW TO TEACH\n${how.map((h) => `- ${h}`).join('\n')}`);
    if (level || trackName) lines.push(`CONTEXT\n- ${trackName || 'this track'}${level ? `, level ${level}` : ''}.`);
    return lines.join('\n\n');
  }
  if ((profile.evidence_count || 0) < 2) {
    how.push('There is little history on this learner yet, so watch how they respond and adjust within this conversation.');
  }

  lines.push(`HOW THIS LEARNER IS BEST TAUGHT\n${how.map((h) => `- ${h}`).join('\n')}`);

  // The scorecard's own read, for the conversational side of teaching.
  const coachDirectives = translate.directives(scorecard.get(userId), {
    use: 'C', max: 8, hasInterests: hasStatedInterests(userId),
  });
  if (coachDirectives.length) {
    lines.push(`FROM THIS LEARNER'S MEASURED SCORECARD\n${coachDirectives.map((d) => `- ${d.text}`).join('\n')}`);
  }
  // The learning spec for the tutor (services/learning-spec.js): the language level, the examples that suit them and
  // the ones to avoid, the tone. Nothing for a learner we know nothing about.
  // `noSpec`: the lesson writer, which is given the spec's own lesson block beside this brief and must not get two.
  const specLines = noSpec ? [] : require('./learning-spec').linesFor(userId, { skillIds: skillId ? [skillId] : [] }, 'tutor'); // eslint-disable-line global-require
  if (specLines.length) lines.push(specLines.join('\n'));
  // What the after-level reads have established: confirmed facts, the topics and
  // question shapes they struggle with (with the hint idea for each), and what
  // their recent levels and feedback concluded. The coach is the moment those
  // struggles matter most, so it gets the same record the level writers get.
  // eslint-disable-next-line global-require
  const recordLines = require('./learner-record').briefLines(userId, {}).filter((l) => l !== '');
  if (recordLines.length) lines.push(`FROM THEIR LEARNER RECORD\n${recordLines.join('\n')}`);
  const survey = getProfile(userId).survey || {};
  const said = ['interests', 'hobbies', 'sports']
    .map((k) => String(survey[k] || '').trim()).filter(Boolean).join('; ').slice(0, 400);
  if (said) lines.push(`THEIR INTERESTS, IN THEIR WORDS (use one for an example only if it genuinely helps)\n- ${said}`);

  // ── what they know ───────────────────────────────────────────────────────
  if (skillId) {
    const state = mastery.stateFor(userId, skillId);
    const known = [];
    const name = skillName || skillId;
    if (state.attempts === 0) {
      known.push(`This is their first work on ${name}. Assume nothing; find out what they already have.`);
    } else {
      const pct = Math.round(state.mastery * 100);
      known.push(`${name}: ${pct}% mastery over ${state.attempts} questions (${state.correct} right).`);
      if (state.mastery >= 0.8) known.push('They mostly have this. Expect a slip or a gap in one specific case rather than a missing idea.');
      else if (state.mastery >= 0.5) known.push('They half have this. The idea is there and the execution is not reliable yet.');
      else known.push('This is not built yet. Go back to the simplest case that is still this skill.');
    }
    const tags = (state.error_tags || []).map((t) => ERROR_TAG_PHRASES[t]).filter(Boolean);
    if (tags.length) {
      known.push(`Their recorded pattern on this skill: ${tags.join('; ')}. Check for that before anything else.`);
    }

    // How they have answered this skill lately, which is more current than the
    // rolling mastery number.
    const recent = db.find('items', (i) => i.user_id === userId && i.skill_id === skillId && i.correct !== null).slice(-6);
    if (recent.length >= 3) {
      const right = recent.filter((i) => i.correct).length;
      const coached = recent.filter((i) => i.coach_used).length;
      known.push(`Last ${recent.length} questions on this skill: ${right} right${coached ? `, ${coached} of them with the coach` : ''}.`);
      const slow = recent.filter((i) => (i.ms || 0) > 45000).length;
      if (slow >= 2) known.push('They are taking a long time per question here, so break steps smaller than usual.');
    }
    lines.push(`WHAT THEY KNOW RIGHT NOW\n${known.map((k) => `- ${k}`).join('\n')}`);
  }

  if (profile.observed_traits && profile.observed_traits.length) {
    lines.push(`NOTED FROM EARLIER SESSIONS\n${profile.observed_traits.slice(-4).map((t) => `- ${t}`).join('\n')}`);
  }
  if (level || trackName) {
    lines.push(`CONTEXT\n- ${trackName || 'this track'}${level ? `, level ${level}` : ''}.`);
  }

  return lines.join('\n\n');
}

/**
 * Fold a session analysis into the profile. `observed` moves slowly: a single
 * session should nudge the model, not redefine the learner.
 */
function absorbAnalysis(userId, analysis) {
  const profile = getProfile(userId);
  const observed = { ...(profile.observed || {}) };
  const signals = analysis && analysis.observed_signals ? analysis.observed_signals : {};
  for (const [dim, value] of Object.entries(signals)) {
    if (!DIMENSIONS[dim]) continue;
    const v = Math.max(0, Math.min(1, Number(value)));
    if (!Number.isFinite(v)) continue;
    observed[dim] = observed[dim] === undefined ? v : Number((observed[dim] * 0.7 + v * 0.3).toFixed(3));
  }
  const traits = [...(profile.observed_traits || [])];
  for (const t of (analysis && analysis.traits) || []) {
    if (typeof t === 'string' && t.trim() && !traits.includes(t.trim())) traits.push(t.trim());
  }
  return saveProfile(userId, {
    observed,
    observed_traits: traits.slice(-10),
    evidence_count: (profile.evidence_count || 0) + 1,
  });
}

module.exports = {
  DIMENSIONS,
  STYLE_QUESTIONS,
  SCALE,
  SURVEY_FIELDS,
  blankProfile,
  blankSurvey,
  cleanSurvey,
  surveyAnswered,
  getProfile,
  saveProfile,
  scoreStyleQuiz,
  describe,
  effective,
  observedPrefsMode,
  observedPrefsShadow,
  hasStatedInterests,
  stat,
  sessionParams,
  teachingBrief,
  absorbAnalysis,
  ERROR_TAG_PHRASES,
};
