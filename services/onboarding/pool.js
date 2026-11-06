/**
 * The onboarding item and task pool, as data: what each item reads, how well (validity r, conservative and research-anchored in model.js
 * FAMILIES), and how long it takes for a median learner (seconds, including its instruction). The words and the task generators live in
 * content/onboarding/ and public/js/onboarding-*.js; this file is what the selector (model.js pickNext) sees.
 *
 *   sf:<stat>:a|b   two forced-choice self-report items for every measure (written by a free model, each checked by a blind second model:
 *                   scripts/build-onboarding-items.js), 10 s each
 *   sq:<id>         today's 20 style-quiz items (services/learner.js STYLE_QUESTIONS), reused, mapped as scorecard STYLE_MAP maps them
 *   t: r: m: a:     behavioural tasks (span, speed, reading, switching), reasoning items, the mini-lesson parts and the A/B tastes
 *   fq:<factor>:a|b two self-ratings for each of the 11 trait FACTORS (g and the 10 categories), a pair each (content/onboarding/factor-items.json): one
 *                   answer reads the factor, and through the correlated posterior (model.js) every trait that loads on it. Validity: .29 for the
 *                   cognitive factors (a self-evaluation of ability against performance, Mabe & West 1982: mean r .29), .25 for the rest (unsupported: the single-item value)
 *   t:speed_q, t:span_fwd   shortened versions of the speed (30 s) and span (forward only) tasks for Quick: validity scaled by the Spearman-Brown
 *                   prophecy for half the length at the longer task's reliability (about .85): x0.93. Each excludes the long version.
 *   c:cal           the confidence ratings given on reasoning items, read for calibration (no extra seconds: the rating is part of the item)
 *   sv:*            the interests and goals survey, cut to the mode
 *
 * Signs: a reading of +1 means "high on the measure". An item whose high pole is a LOW score on the measure has sign -1.
 */
'use strict';

const { STATS } = require('../scorecard/stats');
const learner = require('../learner');
const scorecard = require('../scorecard');
const { RHO, FACTOR_IDS } = require('./model');

const IDS = new Set([...STATS.map((s) => s.id), ...FACTOR_IDS]);
const inf = (stat, r, sign = 1) => {
  if (!IDS.has(stat)) throw new Error(`onboarding pool: unknown stat ${stat}`);
  return { stat, r, sign };
};

const pool = [];
const add = (id, family, sec, kind, informs, extra = {}) => pool.push({ id, family, sec, kind, informs, ...extra });

// ── self-report, forced choice ─────────────────────────────────────────────
for (const s of STATS) {
  for (const k of ['a', 'b']) add(`sf:${s.id}:${k}`, 'self', 10, 'forced', [inf(s.id, 0.25)]);
}
for (const q of learner.STYLE_QUESTIONS) {
  const informs = (scorecard.STYLE_MAP[q.dim] || []).map(([stat, invert]) => inf(stat, 0.25, invert ? -1 : 1));
  if (informs.length) add(`sq:${q.id}`, 'self', 10, 'forced', informs, { legacy: true });
}

// Factor self-ratings: two for g and two for each category (the correlated posterior carries each to every measure that loads on the factor).
for (const F of FACTOR_IDS) {
  const cognitive = F === 'F:g' || ['F:intake', 'F:reasoning', 'F:transfer'].includes(F);
  for (const k of ['a', 'b']) add(`fq:${F.slice(2)}:${k}`, 'self', 10, 'forced', [inf(F, cognitive ? 0.29 : 0.25)], { factor: true });
}

// ── behavioural tasks ──────────────────────────────────────────────────────
add('t:span_verbal', 'wm', 110, 'span', [inf('working_memory_span', 0.65), inf('intake_baseline', 0.25), inf('chunk_granularity', 0.2)], { excludes: ['t:span_fwd'] });
add('t:symbol_match', 'speed', 75, 'speed', [inf('processing_velocity', 0.6), inf('intake_baseline', 0.2), inf('warmup_latency', 0.12, -1)], { excludes: ['t:speed_q'] });
add('t:read_1', 'read', 110, 'read', [inf('vocabulary_ceiling', 0.45), inf('processing_velocity', 0.3), inf('text_density_tolerance', 0.3), inf('intake_baseline', 0.25), inf('jargon_absorption', 0.25)]);
add('t:read_2', 'read', 130, 'read', [inf('vocabulary_ceiling', 0.5), inf('jargon_absorption', 0.3), inf('abstraction_tolerance', 0.25), inf('text_density_tolerance', 0.3)], { requires: ['t:read_1'] });
add('t:speed_q', 'speed', 45, 'speed', [inf('processing_velocity', 0.56), inf('intake_baseline', 0.19), inf('warmup_latency', 0.11, -1)], { dur: 30, excludes: ['t:symbol_match'] });
add('t:span_fwd', 'wm', 60, 'span', [inf('working_memory_span', 0.6), inf('intake_baseline', 0.23), inf('chunk_granularity', 0.19)], { forwardOnly: true, excludes: ['t:span_verbal'] });
add('t:switch_a', 'switch', 75, 'switch', [inf('cognitive_flexibility', 0.35), inf('error_recovery_speed', 0.15), inf('reentry_cost', 0.12, -1)]);
add('t:switch_b', 'switch', 60, 'switch', [inf('cognitive_flexibility', 0.3), inf('interleaving_tolerance', 0.2)], { requires: ['t:switch_a'] });

// Short reasoning items, with a confidence rating on each (4 s). Keyed by construction, or blind re-solved (build-onboarding-items.js).
const REASON = [
  ['deduct', [['deductive_trajectory', 0.25], ['logical_rigor', 0.3], ['contradiction_sensitivity', 0.2]], 38],
  ['series', [['inductive_trajectory', 0.25], ['pattern_detection', 0.35], ['processing_velocity', 0.1]], 32],
  ['analogy', [['analogical_transfer', 0.3], ['far_transfer', 0.2], ['vocabulary_ceiling', 0.2]], 30],
  ['causal', [['causal_chain_depth', 0.3], ['systems_thinking', 0.25], ['integration_tendency', 0.15]], 45],
  ['abstract', [['abstraction_tolerance', 0.3], ['conceptual_bias', 0.15], ['near_transfer', 0.15]], 40],
];
for (const [kind, reads, sec] of REASON) {
  // number series and conditional reasoning are generated by code (tasks.js), so Accurate may have up to ten of each; the written kinds stay at five
  for (let i = 1; i <= (kind === 'series' || kind === 'deduct' ? 10 : 5); i++) {
    add(`r:${kind}:${i}`, 'reason', sec + 4, 'reason', reads.map(([stat, r]) => inf(stat, r)), {
      conf: true, requires: i > 1 ? [`r:${kind}:${i - 1}`] : undefined,
    });
  }
}
// The confidence rating on a reasoning item, read for calibration: one reading per answered item, after the first two.
for (let i = 1; i <= 5; i++) {
  add(`c:cal:${i}`, 'conf', 0.1, 'rating', [inf('confidence_calibration', 0.2), inf('self_monitoring', 0.12), inf('self_efficacy', 0.1)], {
    requires: [`r:deduct:${i}`, `r:series:${i > 1 ? i - 1 : 1}`], free: true,
  });
}

// The mini-lesson: one short neutral lesson in three parts with real choice points (what the learner does when it is theirs to decide).
// Reading time inside a part is also read (pace, depth). The parts are taken in order.
add('m:part1', 'ml', 150, 'minilesson', [
  inf('conceptual_bias', 0.3), inf('productive_struggle', 0.3), inf('hint_dependency', 0.25, -1), inf('planning_tendency', 0.3), inf('help_seeking', 0.2),
  inf('processing_velocity', 0.2), inf('intake_baseline', 0.2),
]);
add('m:part2', 'ml', 130, 'minilesson', [
  inf('depth_breadth', 0.3), inf('competitive_drive', 0.3), inf('intrinsic_motivation', 0.25), inf('curiosity_hook', 0.25), inf('autonomy_preference', 0.2), inf('structure_need', 0.15, -1),
], { requires: ['m:part1'] });
add('m:part3', 'ml', 130, 'minilesson', [
  inf('integration_tendency', 0.3), inf('emotional_engagement', 0.3), inf('identity_alignment', 0.25), inf('reflection_depth', 0.25), inf('persistence', 0.2), inf('failure_response', 0.2),
], { requires: ['m:part2'] });

// A/B tastes: two versions of a short excerpt, a recall check on each, and which the learner preferred. Preference and the recall gap both read.
add('a:examples', 'taste', 160, 'taste', [inf('inductive_trajectory', 0.28), inf('deductive_trajectory', 0.28, -1), inf('example_density_need', 0.25), inf('worked_example_dependence', 0.2)]);
add('a:visual', 'taste', 160, 'taste', [inf('spatial_anchoring', 0.28), inf('text_density_tolerance', 0.2, -1), inf('notation_comfort', 0.12)]);
add('a:depth', 'taste', 150, 'taste', [inf('brevity_preference', 0.28), inf('step_explicitness', 0.22, -1), inf('repetition_tolerance', 0.15, -1), inf('chunk_granularity', 0.15, -1)]);
add('a:story', 'taste', 150, 'taste', [inf('narrative_pull', 0.28), inf('humor_receptivity', 0.15), inf('tone_formality', 0.2, -1), inf('relevance_demand', 0.15)]);

// Interests and goals: the survey, cut to the mode (the fields are services/learner.js SURVEY_FIELDS, plus one "why are you learning" question).
add('sv:interests', 'goal', 25, 'survey', [inf('relevance_demand', 0.2), inf('interest_transfer', 0.2), inf('curiosity_hook', 0.12)], { survey: 'interests' });
add('sv:studying', 'goal', 25, 'survey', [inf('identity_alignment', 0.2), inf('application_orientation', 0.2), inf('intrinsic_motivation', 0.15)], { survey: 'studying' });
add('sv:hobbies', 'goal', 20, 'survey', [inf('interest_transfer', 0.15), inf('novelty_hunger', 0.1)], { survey: 'hobbies' });
add('sv:sports', 'goal', 12, 'survey', [inf('competitive_drive', 0.12), inf('social_framing', 0.1)], { survey: 'sports' });
add('sv:notes', 'goal', 45, 'survey', [inf('autonomy_preference', 0.15), inf('instruction_adherence', 0.1, -1), inf('help_seeking', 0.1), inf('misconception_persistence', 0.1)], { survey: 'notes' });
add('sv:why', 'goal', 20, 'survey', [inf('intrinsic_motivation', 0.28), inf('extrinsic_reward_sensitivity', 0.2, -1), inf('identity_alignment', 0.28), inf('mastery_orientation', 0.2)], { survey: 'why' });

// ── the daily check's own banks (content/daily-check/): IPIP scale items and own-wording taps. dailyOnly: the onboarding modes never pick them. ──────────
{
  const bank = require('../../content/daily-check');
  for (const it of bank.SCALE_ITEMS) add(it.id, 'scale', 9, 'scale', it.maps.map(([stat, dir, r]) => inf(stat, r, dir)), { dailyOnly: true });
  for (const it of bank.TAP_ITEMS) add(it.id, 'tap', 8, 'forced', [inf(it.measure, 0.2)], { dailyOnly: true, tap: true });
}

// ── passive sources of the daily check (PROBE and CROSS; docs/SCORECARD-95.md): they cost the learner no minutes and are read from what a lesson already does (a probe =
// normal items reordered to the start of a sitting and after a gap; a cross = paired lesson versions). One item per measure per day slot. They are free:true (zero seconds),
// passive:true so the planner never offers or unlocks them: services/daily-check.js passiveFor(day) hands them to whoever has the day's reading. Validity ASSUMED.
const PROBE_STATS = ['intake_baseline', 'warmup_latency', 'momentum_dependence', 'interleaving_tolerance', 'session_rhythm', 'reentry_cost'];
const CROSS_STATS = ['chunk_granularity', 'abstraction_tolerance', 'example_density_need', 'text_density_tolerance', 'jargon_absorption', 'spatial_anchoring', 'global_framing_need', 'humor_receptivity', 'narrative_pull', 'tone_formality', 'elaboration_benefit', 'mnemonic_receptivity', 'enactive_encoding', 'generation_effect', 'step_explicitness', 'worked_example_dependence', 'feedback_granularity', 'feedback_tone_sensitivity', 'dialogic_preference', 'praise_sensitivity', 'social_framing', 'interest_transfer', 'cycle_architecture'];
const PASSIVE_SLOTS = 30;
for (const [fam, list] of [['probe', PROBE_STATS], ['cross', CROSS_STATS]]) {
  for (const stat of list) for (let k = 0; k < PASSIVE_SLOTS; k++) add(`ps:${fam}:${stat}:${k}`, fam, 0, 'passive', [inf(stat, 0.2)], { dailyOnly: true, free: true, passive: true, slot: k, requires: [] });
}

for (const it of pool) {
  for (const i of it.informs) if (i.r > RHO[it.family]) throw new Error(`pool: ${it.id} validity ${i.r} above its family ceiling`);
}

module.exports = { pool, byId: Object.fromEntries(pool.map((p) => [p.id, p])) };
