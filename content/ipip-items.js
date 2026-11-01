/**
 * The sign-up questionnaire: sixteen items from the International Personality Item Pool (IPIP, Goldberg et al. 2006; ipip.ori.org),
 * which is in the PUBLIC DOMAIN: its items may be used, changed and translated free, with no permission and no fee. They are the Big-Five
 * marker items of the 50-item set, five-point agreement ("Very inaccurate" to "Very accurate", the IPIP's own response format).
 *
 * Each item is mapped to the scorecard measures a self-report of that kind can inform, with a direction (+1: agreeing means more of the
 * measure, -1: agreeing means less) and a weight. The mapping is a design choice with published links behind it (conscientiousness with
 * persistence, planning and perfectionism; emotional stability with test anxiety and frustration tolerance; intellect with vocabulary,
 * abstraction and curiosity), not a validated instrument of its own: a self-report predicts behaviour with r of about 0.3 to 0.5, so
 * each item moves a measure a little (weight 0.5 of an observation, as a prior, never as measured evidence) and what the learner
 * actually does in sessions outweighs it from the first levels.
 */
const SCALE = [
  { value: 1, label: 'Very inaccurate' },
  { value: 2, label: 'Moderately inaccurate' },
  { value: 3, label: 'Neither inaccurate nor accurate' },
  { value: 4, label: 'Moderately accurate' },
  { value: 5, label: 'Very accurate' },
];

const ITEMS = [
  { id: 'c_prepared', text: 'I am always prepared.', factor: 'conscientiousness', maps: [['planning_tendency', 1, 0.5]] },
  { id: 'c_schedule', text: 'I follow a schedule.', factor: 'conscientiousness', maps: [['planning_tendency', 1, 0.5], ['structure_need', 1, 0.5], ['session_rhythm', 1, 0.3]] },
  { id: 'c_order', text: 'I like order.', factor: 'conscientiousness', maps: [['structure_need', 1, 0.5]] },
  { id: 'c_exacting', text: 'I am exacting in my work.', factor: 'conscientiousness', maps: [['perfectionism', 1, 0.5]] },
  { id: 'c_chores', text: 'I get chores done right away.', factor: 'conscientiousness', maps: [['persistence', 1, 0.5]] },
  { id: 'c_belongings', text: 'I leave my belongings around.', factor: 'conscientiousness', maps: [['persistence', -1, 0.4], ['planning_tendency', -1, 0.3]] },
  { id: 'n_stressed', text: 'I get stressed out easily.', factor: 'emotional_stability', maps: [['evaluation_anxiety', 1, 0.5]] },
  { id: 'n_worry', text: 'I worry about things.', factor: 'emotional_stability', maps: [['evaluation_anxiety', 1, 0.5], ['perfectionism', 1, 0.2]] },
  { id: 'n_upset', text: 'I get upset easily.', factor: 'emotional_stability', maps: [['frustration_threshold', -1, 0.5]] },
  { id: 'n_relaxed', text: 'I am relaxed most of the time.', factor: 'emotional_stability', maps: [['evaluation_anxiety', -1, 0.4], ['frustration_threshold', 1, 0.3]] },
  { id: 'i_vocab', text: 'I have a rich vocabulary.', factor: 'intellect', maps: [['vocabulary_ceiling', 1, 0.4]] },
  { id: 'i_words', text: 'I use difficult words.', factor: 'intellect', maps: [['vocabulary_ceiling', 1, 0.4]] },
  { id: 'i_quick', text: 'I am quick to understand things.', factor: 'intellect', maps: [['self_efficacy', 1, 0.5], ['processing_velocity', 1, 0.3]] },
  { id: 'i_abstract', text: 'I have difficulty understanding abstract ideas.', factor: 'intellect', maps: [['abstraction_tolerance', -1, 0.5]] },
  { id: 'i_reflect', text: 'I spend time reflecting on things.', factor: 'intellect', maps: [['reflection_depth', 1, 0.5]] },
  { id: 'i_ideas', text: 'I am full of ideas.', factor: 'intellect', maps: [['curiosity_hook', 1, 0.4], ['creative_extension', 1, 0.4]] },
];

module.exports = { SCALE, ITEMS, SOURCE: 'International Personality Item Pool (public domain), Big-Five marker items' };
