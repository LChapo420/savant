/**
 * How well each scorecard measure can realistically be known after a month of use (docs/SCORECARD-REAL.md part 1). A RESEARCH-BASED ESTIMATE, not a measurement on Savant's learners.
 *
 * v is the correlation the best one-month read could have with the learner's stable true value. Error removed from the guess is 1 - sqrt(1 - v^2) (for a roughly normal trait the mean
 * absolute error scales with the residual sd), so "95 on the ruler" (removing 73% of a guess error of 18.4 points) needs v = 0.96: a test-retest reliability of about 0.93.
 * A test can correlate with its own true score at most sqrt(reliability), which is how a retest figure becomes a v.
 *
 * Each class says how the trait can be read, its v (low / central / high) and the reason. Sources, all checked 6 Nov 2026 except where marked:
 *   Enkavi et al. 2019 PNAS 10.1073/pnas.1818430116: retest over 2-4 months (150 people), survey median ICC .674, behavioural task median ICC .311.
 *   Hedge, Powell & Sumner 2018 Behav Res Methods 10.3758/s13428-017-0935-1: classic task effects (difference scores) retest 0 to .82, most low.
 *   Dang, King & Inzlicht 2020 Trends Cogn Sci: self-report vs behavioural measures of one construct correlate about 0 to .2.
 *   Eisenberg et al. 2019 Nat Commun 10.1038/s41467-019-10301-1: 522 people; surveys modestly predict real-world outcomes, tasks largely do not.
 *   Mabe & West 1982 (cited in services/onboarding/model.js): self-evaluation vs performance r = .29. Not re-read this round.
 *   Fleeson & Gallagher 2009 (same file): aggregated behaviour vs trait .42-.56. Not re-read this round.
 *   Unsworth et al. 2005 (same file): automated operation span retest .83. Not re-read this round.
 *   Bilker et al. 2012 (same file): 9-item matrices vs the 60-item total r = .90. Not re-read this round.
 *   Zerr et al. 2018 Psychol Sci 10.1177/0956797618772540: learning efficiency reliable across days and three years; no separate figure for forgetting rate.
 *   Pashler et al. 2008 (same file): little evidence that a learner's preference predicts the benefit of a matched lesson.
 */
'use strict';

const CLASSES = {
  performance: { label: 'Direct performance over hundreds of answers or a designed task', v: [0.8, 0.88, 0.93], why: 'Behaviour is the trait and a month gives many trials. Operation span retest .83 gives .91; a 9-item reasoning form predicts the long form at .90. Above .93 would need a retest of .87+, which only long clinical batteries reach.' },
  habit: { label: 'Habits logged by the app itself', v: [0.65, 0.78, 0.88], why: 'A rate of what the learner does is close to reliable once there are many sittings, but only describes the app context: aggregated behaviour vs trait .42-.56 (Fleeson & Gallagher); truth defined as the in-app habit is why the central value is higher. One real month would measure this split-half.' },
  memory: { label: 'Memory over time, from spaced reviews', v: [0.55, 0.7, 0.82], why: 'Every spaced review is a memory test, but delays are long, few per skill in a month, and confounded with how well each skill was learned. Zerr 2018 supports stable learning efficiency; no published retest for a forgetting rate alone was found. ASSUMED until the real log gives split-half.' },
  reasoning: { label: 'A specific reasoning or transfer skill, apart from general ability', v: [0.55, 0.68, 0.8], why: 'A composite is well read, but the specific part of one facet is small: most of what such items read is the general factor. A separate number per facet needs many items of each.' },
  contrast: { label: 'A within-person contrast (warm-up, fatigue, momentum, re-entry, post-error)', v: [0.4, 0.58, 0.72], why: 'Difference scores: retest 0 to .82, mostly low (Hedge 2018); tasks median .311 (Enkavi 2019, v = .56). A month of aggregation helps sampling noise, not the trait instability.' },
  scale: { label: 'An attitude or self-view with a validated scale', v: [0.6, 0.78, 0.85], why: 'Surveys retest at median .674 (Enkavi 2019, v = .82), literature mean .716. That is a read of the self-view, which is the trait for these. Short forms lose some (Spearman-Brown). If the measure is meant as behaviour, not self-view, self-report is worth only 0 to .2 (Dang 2020).' },
  preference: { label: 'A stated taste (tone, humour, story)', v: [0.5, 0.68, 0.8], why: 'Asking and watching choices reads the preference itself, but no validated short scale exists: our own items (88 taps) are unvalidated. Survey retest is the upper limit.' },
  benefit: { label: 'Whether a kind of teaching helps this learner more', v: [0.2, 0.38, 0.55], why: 'Needs a difference in outcome per learner between two versions, with few experiments per dimension in a month (about 28 pages over 22 dimensions). Preference is a poor stand-in (Pashler 2008). Ceiling reached only in a year or more of paired versions, if the stable effect exists at all.' },
  hidden: { label: 'An inner state with no direct behaviour and no validated item here', v: [0.25, 0.45, 0.6], why: 'Nothing in the app shows it directly and no validated scale is in the bank: read only through related traits, chat, or our own items. Unknowable from behaviour alone.' },
};

const BY_CLASS = {
  performance: ['prior_knowledge', 'vocabulary_ceiling', 'processing_velocity', 'working_memory_span', 'open_response_performance', 'notation_comfort', 'recognition_recall_gap', 'jargon_absorption', 'intake_baseline', 'confidence_calibration'],
  habit: ['rush_tendency', 'guessing_propensity', 'hint_dependency', 'help_seeking', 'session_rhythm', 'attention_runway', 'deliberation_depth', 'instruction_adherence', 'perfectionism', 'persistence', 'brevity_preference', 'reflection_depth', 'dialogic_preference', 'self_monitoring', 'question_generation'],
  memory: ['retrieval_strength', 'decay_rate', 'retention_index', 'consolidation_need', 'misconception_persistence', 'interference_susceptibility', 'mastery_velocity'],
  reasoning: ['deductive_trajectory', 'inductive_trajectory', 'cognitive_flexibility', 'analogical_transfer', 'causal_chain_depth', 'systems_thinking', 'pattern_detection', 'logical_rigor', 'contradiction_sensitivity', 'near_transfer', 'far_transfer', 'abstraction_tolerance'],
  contrast: ['warmup_latency', 'fatigue_curve', 'momentum_dependence', 'interleaving_tolerance', 'reentry_cost', 'error_recovery_speed', 'failure_response', 'error_driven_learning', 'scaffolding_fade', 'text_density_tolerance', 'challenge_appetite'],
  scale: ['evaluation_anxiety', 'self_efficacy', 'frustration_threshold', 'structure_need', 'planning_tendency', 'mastery_orientation', 'intrinsic_motivation', 'curiosity_hook', 'competitive_drive', 'autonomy_preference', 'novelty_hunger', 'boredom_susceptibility', 'productive_struggle', 'creative_extension', 'extrinsic_reward_sensitivity', 'praise_sensitivity'],
  preference: ['humor_receptivity', 'tone_formality', 'narrative_pull', 'feedback_tone_sensitivity', 'social_framing', 'gamification_response', 'relevance_demand', 'application_orientation', 'global_framing_need', 'depth_breadth', 'stimulus_envelope', 'feedback_granularity'],
  benefit: ['chunk_granularity', 'example_density_need', 'elaboration_benefit', 'generation_effect', 'mnemonic_receptivity', 'enactive_encoding', 'spatial_anchoring', 'worked_example_dependence', 'step_explicitness', 'repetition_tolerance', 'cycle_architecture', 'interest_transfer'],
  hidden: ['strategy_awareness', 'integration_tendency', 'identity_alignment', 'emotional_engagement', 'conceptual_bias'],
};

/**
 * How much one self-report reading is worth, by how the measure is read, as a share of what its item claims. A self-view is what scale and preference measures are, so full value there.
 * For a measure that is really behaviour, self-report correlates about 0 to .2 with the behaviour (Dang 2020), against a believed family ceiling near .5: about a third. Whether a kind of teaching helps
 * is a poor match for what people say helps (Pashler 2008). Our judgement from those sources, not a measured value. A real refit replaces it.
 */
const SELF_REPORT_WORTH = { scale: 1, preference: 1, hidden: 0.8, benefit: 0.4, habit: 0.4, performance: 0.3, reasoning: 0.3, contrast: 0.25, memory: 0.25 };

const INDEX = Object.fromEntries(Object.entries(BY_CLASS).flatMap(([cls, list]) => list.map((id) => [id, cls])));

/** { measure: { cls, label, v, low, high, why } } under a scenario: 0 low, 1 central, 2 high. */
function ceilings(scn = 1) {
  return Object.fromEntries(Object.entries(INDEX).map(([id, cls]) => { const c = CLASSES[cls]; return [id, { cls, label: c.label, v: c.v[scn], low: c.v[0], high: c.v[2], why: c.why }]; }));
}
/** The correlation a measure needs for a target accuracy, given its guess error in points. */
const vNeeded = (target, guessMae) => { const k = (100 - target) / guessMae; return k >= 1 ? 0 : Math.sqrt(1 - k * k); };

module.exports = { SELF_REPORT_WORTH, CLASSES, BY_CLASS, INDEX, ceilings, vNeeded };
