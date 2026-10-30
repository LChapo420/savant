/**
 * The plan for ONE tutor reply: how big a hint, which way of explaining, how fast, how warm, when to check, chosen
 * from this learner's own record, then put into the prompt as a short instruction (owner, 30 Oct 2026: "always help
 * it through problems in the way that is most perfectly optimal for that specific user, likely utilizing the
 * scorecard").
 *
 * It is a plain function, `plan(userId, {...})`, with no model call, so it can be tested and explained.
 *
 * What it reads
 *   mastery     skill_states on the page's skill: strong learners start with the smallest hint, weak ones with a
 *               bigger one (the assistance dilemma, koedinger2007: how much to give is learner-dependent; 06-M4).
 *   streak      misses in a row on that skill (items): a long streak raises the start of the ladder and gentles the
 *               tone (03 #23 frustration low: a gentler ramp and more support; 03 #26 persistence).
 *   errors      the most common error tag on the skill: named so the hint can aim at the real mix-up (03 #32).
 *   scorecard   a few measured stats (services/scorecard): hint dependency, productive struggle, frustration,
 *               self-efficacy, processing velocity, attention runway, brevity, humour, praise, feedback tone,
 *               worked-example dependence, analogy, spatial anchoring, dialogue, step explicitness. A stat is used
 *               only when it is measured with enough confidence and lies far enough from the middle
 *               (LEAN_CONFIDENCE, LEAN_EDGE: the same gates as services/scorecard/summary.js), and none of it is a
 *               learning-style label: these are behaviours (06-M8, 03 #30, #31).
 *   strategies  which way of explaining led to a right next answer for them (services/tutor-strategy.js, T4): the
 *               scorecard only moves a style's prior (worth two observations at most), so what was MEASURED
 *               overrules it, and a style that keeps failing for them sinks below the untried ones and is named as
 *               one to avoid.
 *   this chat   how many replies they have already had on this question and whether the message looks like an
 *               attempt (then the reply answers their reasoning at the same size instead of climbing).
 *
 * What it never does: give an answer. The ladder tops out at "walk their problem and leave the last step to them",
 * and on a method-only page (placement, mastery checks, retrieval sittings) it stops at rung 2, approach only. The
 * integrity rule stays LAST in the prompt (services/tutor-context.js MODE_NOTE); the plan sits above it and says
 * so.
 *
 * Mechanism ids: 06-M4 (hint ladder), 06-M5 (reply shape), 06-M6 (learner model chosen for the moment), 06-M8
 * (behaviour not style labels), 03 #23, #26, #30, #31, #32 (curriculum-build/evidence-article).
 */
const db = require('../config/db');
const curriculum = require('../config/curriculum');
const strategy = require('./tutor-strategy');

const RUNGS = {
  1: 'ask what they tried or where exactly they are stuck',
  2: 'name the idea or rule that applies, nothing more',
  3: 'give the first step only',
  4: 'work a different, similar example all the way through',
  5: "walk their problem step by step but leave the last step to them",
};
const LEAN_CONFIDENCE = 35; // scorecard confidence at which a stat may steer a reply
const LEAN_EDGE = 15;       // distance from 50 worth acting on
const STRONG = 0.75;
const WEAK = 0.4;

const STUCK = /\b(stuck|confus|don'?t (get|understand)|do not (get|understand)|no idea|idk|lost|still (don'?t|not|no)|what\??$|i give up|help|hard|makes no sense|huh)\b/i;
const ATTEMPT = /(\d|=|\b(i think|is it|would it|so (it|the|i)|my answer|i got|i tried|because|then i|first i)\b)/i;

const STAT_IDS = ['hint_dependency', 'productive_struggle', 'frustration_threshold', 'self_efficacy', 'processing_velocity', 'attention_runway',
  'brevity_preference', 'humor_receptivity', 'praise_sensitivity', 'feedback_tone_sensitivity', 'worked_example_dependence', 'analogical_transfer',
  'spatial_anchoring', 'dialogic_preference', 'step_explicitness', 'chunk_granularity', 'abstraction_tolerance', 'cycle_architecture', 'help_seeking'];

/** -1 / 0 / +1: which way a stat leans, only when it is measured well enough and far enough from the middle. */
function leanOf(read) {
  if (!read || !(read.confidence >= LEAN_CONFIDENCE) || Math.abs(read.score - 50) < LEAN_EDGE) return 0;
  return read.score >= 50 ? 1 : -1;
}

/** The scorecard reads the plan uses: { stat_id: -1|0|1 }. An unreadable scorecard is all zeros (a new learner). */
function scorecardLeans(userId, overrides = null) {
  const out = Object.fromEntries(STAT_IDS.map((id) => [id, 0]));
  if (overrides) return { ...out, ...overrides };
  try {
    /* eslint-disable global-require */
    const scorecard = require('./scorecard');
    const card = scorecard.get(userId);
    /* eslint-enable global-require */
    for (const id of STAT_IDS) out[id] = leanOf(scorecard.read(card, id, {}));
  } catch { /* new learner: neutral */ }
  return out;
}

/** The prior shift each scorecard lean puts on a way of explaining (06-M8: a behaviour read, not a label). */
function styleShift(l) {
  const shift = {};
  const add = (style, v) => { shift[style] = (shift[style] || 0) + v; };
  add('analogy', 0.12 * l.analogical_transfer);
  add('visual', l.spatial_anchoring > 0 ? 0.12 : l.spatial_anchoring < 0 ? -0.1 : 0);
  add('worked_example', l.worked_example_dependence > 0 ? 0.12 : l.worked_example_dependence < 0 ? -0.05 : 0);
  add('step_questions', l.dialogic_preference > 0 ? 0.1 : 0);
  add('worked_example', l.dialogic_preference < 0 ? 0.05 : 0);
  add('detailed', l.dialogic_preference < 0 ? 0.05 : 0);
  add('step_questions', l.step_explicitness > 0 ? 0.05 : 0);
  add('detailed', l.step_explicitness > 0 ? 0.08 : 0);
  add('step_questions', l.chunk_granularity < 0 ? 0.08 : 0);
  add('analogy', l.abstraction_tolerance < 0 ? 0.06 : 0);
  add('worked_example', l.abstraction_tolerance < 0 ? 0.06 : 0);
  add('brief', l.brevity_preference > 0 ? 0.12 : 0);
  add('detailed', l.brevity_preference > 0 ? -0.08 : l.brevity_preference < 0 ? 0.1 : 0);
  return shift;
}

/** This learner's recent record on the skill: mastery, attempts, the miss streak and the most common mix-up. */
function recordOn(userId, skillId) {
  const out = { mastery: null, attempts: 0, streak: 0, recentMisses: 0, topError: null };
  const state = skillId ? db.findOne('skill_states', (r) => r.user_id === userId && r.skill_id === skillId) : null;
  if (state && state.attempts > 0) { out.mastery = state.mastery; out.attempts = state.attempts; }
  const mine = db.find('items', (i) => i.user_id === userId && i.role !== 'placement' && typeof i.correct === 'boolean' && (!skillId || i.skill_id === skillId)).slice(-30);
  for (let i = mine.length - 1; i >= 0 && mine[i].correct === false; i--) out.streak += 1;
  const misses = mine.filter((i) => i.correct === false);
  out.recentMisses = misses.length;
  const tags = {};
  for (const m of misses) if (m.error_tag) tags[m.error_tag] = (tags[m.error_tag] || 0) + 1;
  const top = Object.entries(tags).sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] >= 2) out.topError = { tag: top[0], times: top[1] };
  return out;
}

/** What this chat so far says: replies already given, whether the last message is a stuck message or an attempt. */
function chatState(history) {
  const msgs = Array.isArray(history) ? history : [];
  const lastUser = [...msgs].reverse().find((m) => m && m.role === 'user');
  const text = lastUser ? String(lastUser.content || '') : '';
  const replies = msgs.filter((m) => m && m.role === 'assistant').length;
  return { replies, stuck: STUCK.test(text), attempt: ATTEMPT.test(text) && !STUCK.test(text), askedLength: text.length };
}

const clampRung = (n) => Math.max(1, Math.min(5, Math.round(n)));

/**
 * The plan for this reply.
 *   skillId  the page's skill (from the browser; only a known one counts)
 *   history  the conversation so far (user and assistant messages)
 *   mode     'full' or 'method' (the server's decision from the page path)
 *   commit   record the chosen style so the next turn can judge how it landed (tutor-strategy `choose`)
 *   lean     tests: override the scorecard reads ({ stat_id: -1|0|1 })
 * Returns { rung, start, max, style, avoid, pace, check, tone, reasons, leans, record, line }.
 */
function plan(userId, { skillId = null, history = [], mode = 'full', commit = true, lean = null } = {}) {
  const skill = typeof skillId === 'string' && curriculum.skillName(skillId) !== skillId ? skillId : null;
  const rec = recordOn(userId, skill);
  const chat = chatState(history);
  const l = scorecardLeans(userId, lean);
  const reasons = [];

  // ── hint size: where the ladder starts and the most this reply may climb to ──
  let start = 1;
  let max = 4;
  if (rec.mastery !== null && rec.attempts >= 3 && rec.mastery >= STRONG) { start = 1; max = 3; reasons.push('strong on this skill: smallest hint first'); }
  else if (rec.mastery !== null && rec.attempts >= 2 && rec.mastery < WEAK) { start = 2; max = 5; reasons.push('still weak on this skill: name the idea sooner'); }
  if (rec.streak >= 3) { start = Math.max(start, 2); max = 5; reasons.push(`${rec.streak} misses in a row: a bigger first hint`); }
  if (rec.streak >= 5) { start = Math.max(start, 3); reasons.push('a long miss streak: give the first step'); }
  if (l.frustration_threshold < 0 && rec.streak >= 2) { start = Math.min(5, start + 1); reasons.push('they get frustrated quickly after misses: more support now'); }
  if (l.productive_struggle < 0 && rec.streak >= 2) { start = Math.min(5, start + 1); reasons.push('they need rescue early on a struggle'); }
  if (l.hint_dependency > 0 && rec.streak < 3) { start = Math.max(1, start - 1); max = Math.min(max, 4); reasons.push('leans on hints: make them think first'); }
  if (l.productive_struggle > 0 && rec.streak < 3) { start = Math.max(1, start - 1); reasons.push('benefits from struggling a little first'); }
  if (l.self_efficacy < 0) reasons.push('doubts they can learn this: make the first step clearly achievable and say they did it');
  let rung = start;
  // This chat: climb one rung for each reply they have already had and are still stuck after (06-M4); an attempt gets a reply at the same size.
  if (chat.replies > 0 && !chat.attempt) rung = start + Math.min(chat.replies, chat.stuck ? 3 : 2);
  rung = clampRung(Math.min(rung, max));
  // A method-only page: approach only, never past naming the idea (06-M3).
  const methodOnly = mode === 'method';
  if (methodOnly) { rung = Math.min(rung, 2); max = 2; start = Math.min(start, 2); }

  // ── the way of explaining: measured first, the scorecard as a prior ──
  const shift = styleShift(l);
  const ranked = strategy.ranked(userId, skill, shift);
  const picked = strategy.choose(userId, { skillId: skill, commit, shift });
  const style = picked ? picked.style : ranked[0].style;
  const avoid = ranked.filter((r) => r.tried >= 2 && r.worked / r.tried < 0.34).map((r) => r.style);
  if (avoid.length) reasons.push(`explanations that did not land for them: ${avoid.join(', ').replace(/_/g, ' ')}`);
  const winning = ranked.find((r) => r.tried >= 2 && r.worked / r.tried >= 0.6);
  if (winning) reasons.push(`${winning.style.replace(/_/g, ' ')} has worked ${winning.worked} of ${winning.tried} times`);

  // ── pace, checking, tone ──
  const slow = l.processing_velocity < 0 || l.attention_runway < 0 || l.cycle_architecture < 0 || l.chunk_granularity < 0;
  const pace = l.brevity_preference > 0 || slow ? 'short: one idea, at most two sentences' : l.brevity_preference < 0 ? 'fuller: three or four sentences, step by step' : 'normal: two or three sentences';
  if (slow) reasons.push('takes things in small pieces');
  const strong = rec.mastery !== null && rec.mastery >= STRONG;
  const check = (rec.streak >= 2 || (rec.mastery !== null && rec.mastery < WEAK) || slow || l.self_efficacy < 0)
    ? 'end by asking them to say the next step in their own words before you add more'
    : strong ? 'only check understanding if they hesitate; otherwise ask them to try the next step' : 'end with one question that makes them do the next small step';
  const tone = [];
  if (l.frustration_threshold < 0 || l.feedback_tone_sensitivity > 0 || rec.streak >= 3) tone.push('gentle, no blunt "wrong"; name one thing they got right');
  if (l.self_efficacy < 0) tone.push('point out what they already did right');
  if (l.praise_sensitivity > 0) tone.push('praise the effort and the specific move, not the person');
  if (l.humor_receptivity > 0) tone.push('a light joke is welcome');
  else if (l.humor_receptivity < 0) tone.push('no jokes: they find them distracting');
  if (chat.stuck && rec.streak < 3) tone.push('they sound stuck: acknowledge it in half a sentence before helping');

  // ── one short instruction ──
  const parts = [
    `Hint size: rung ${rung} of 5 (${RUNGS[rung]}). ${methodOnly ? 'This is a graded page: approach only, nothing past rung 2.' : `Go no bigger than this on this reply (never past rung ${Math.max(rung, max)} in this chat); if they are still stuck after it, the next reply climbs one rung.`}`,
    `Way to explain: ${strategy.STYLES[style]}`,
    avoid.length ? `Do not use: ${avoid.map((s) => s.replace(/_/g, ' ')).join(', ')} (it has not helped them).` : '',
    `Pace: ${pace}. ${check[0].toUpperCase()}${check.slice(1)}.`,
    tone.length ? `Tone: ${tone.join('; ')}.` : '',
    rec.topError ? `Their usual mix-up on this skill: ${rec.topError.tag.replace(/_/g, ' ')} (${rec.topError.times} times); aim the hint at it without telling them the answer.` : '',
  ].filter(Boolean);
  return { rung, start, max, style, avoid, pace, check, tone, reasons, leans: l, record: rec, line: `${parts.join(' ')} This sets the size and style of help only; the rule below about answers still wins.` };
}

module.exports = { RUNGS, STAT_IDS, LEAN_CONFIDENCE, LEAN_EDGE, plan, leanOf, scorecardLeans, styleShift, recordOn, chatState };
