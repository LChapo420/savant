/**
 * Simulated learner subgroups for the stratified scorecard report (docs/SCORECARD-90.md section 12). ALL OF THIS IS SIMULATED.
 *
 * A subgroup here is a TRAIT-PROFILE PROXY: a shift (in population SDs, z) and a spread multiplier on the true values of the measures a group is
 * described as differing on in the literature. It is not a diagnosis, says nothing about any real person, and a real "ADHD" or "dyslexia" learner
 * is far more varied than a mean shift. Every shift cites its anchor; "ASSUMED" means no anchor gives the size and it is a plausible round number.
 * The shifts are applied to the latent z before it becomes a 0-100 true value (so the cross-measure correlation of truth-factors is kept), and the
 * learner's BEHAVIOUR in the sim follows the shifted true values exactly as for any other learner. Nothing here is visible to the app: it only
 * ever sees behaviour. (The age band is known to a real app from the date of birth; the profile is not.)
 *
 * Sizes use the sign convention of services/scorecard/stats.js: a higher true value is more of the thing the id names.
 */
const AGES = ['8-12', '13-17', '18-29', '30-59', '60+'];
const PROFILES = ['adhd', 'dyslexia', 'ell', 'low', 'high'];
// the share of learners drawn into each profile (ASSUMED round numbers near published prevalences: ADHD about 6 to 9% of children, 2.5% of adults, Willcutt 2012;
// dyslexia 5 to 10%, Peterson & Pennington 2012; US school English learners about 10%, NCES 2022; the tails are 7.5% each by construction)
const PROFILE_SHARE = { adhd: 0.1, dyslexia: 0.1, ell: 0.1, low: 0.075, high: 0.075 };

const CATS = {
  intake: 'intake_baseline,working_memory_span,processing_velocity,chunk_granularity,abstraction_tolerance,example_density_need,text_density_tolerance,vocabulary_ceiling,jargon_absorption,spatial_anchoring',
  reasoning: 'deductive_trajectory,inductive_trajectory,cognitive_flexibility,analogical_transfer,causal_chain_depth,systems_thinking,pattern_detection,logical_rigor,contradiction_sensitivity,global_framing_need',
  transfer: 'near_transfer,far_transfer,application_orientation,conceptual_bias,prior_knowledge,misconception_persistence,integration_tendency,depth_breadth,creative_extension,mastery_velocity',
};
const ids = (s) => s.split(',');
const COG = [...ids(CATS.intake), ...ids(CATS.reasoning), ...ids(CATS.transfer)];
const REASON = ids(CATS.reasoning);
const fill = (list, v, base = {}) => { const o = { ...base }; for (const id of list) o[id] = v; return o; };

// shift: id -> dz ; spread: id -> multiplier (default 1) ; '*' applies to every id not named
const AGE_PROFILES = {
  // Salthouse 2004/2009 (speed, working memory, fluid reasoning fall about 0.02 SD a year from the twenties; so 60+ is about -1 SD against 30s);
  // Kail & Salthouse 1994 and Kail 1991 (speed rises steeply from 8 to 15); Hartshorne & Germine 2015 (vocabulary and knowledge peak after 50);
  // Roberts, Walton & Viechtbauer 2006 (conscientiousness up, impulsivity down with age); Nelson & Dannefer 1992 (spread widens with age).
  '8-12': { shift: { ...fill(['processing_velocity', 'working_memory_span'], -1.0), pattern_detection: -0.8, ...fill(REASON.filter((x) => x !== 'pattern_detection'), -0.6), vocabulary_ceiling: -1.0, jargon_absorption: -0.8, prior_knowledge: -0.8, abstraction_tolerance: -0.6, text_density_tolerance: -0.5, rush_tendency: 0.5, attention_runway: -0.6, persistence: -0.4, planning_tendency: -0.7, self_monitoring: -0.5, confidence_calibration: -0.4, deliberation_depth: -0.5, novelty_hunger: 0.4, gamification_response: 0.5 }, spread: {} },
  '13-17': { shift: { processing_velocity: -0.3, working_memory_span: -0.3, vocabulary_ceiling: -0.4, prior_knowledge: -0.4, rush_tendency: 0.3, planning_tendency: -0.3, persistence: -0.2, novelty_hunger: 0.2, self_monitoring: -0.2 }, spread: {} },
  '18-29': { shift: { processing_velocity: 0.2, working_memory_span: 0.2, pattern_detection: 0.2, vocabulary_ceiling: -0.1 }, spread: {} },
  '30-59': { shift: { processing_velocity: -0.2, working_memory_span: -0.1, vocabulary_ceiling: 0.2, prior_knowledge: 0.3, persistence: 0.1, rush_tendency: -0.2 }, spread: {} },
  '60+': { shift: { processing_velocity: -1.0, working_memory_span: -0.6, pattern_detection: -0.6, ...fill(REASON.filter((x) => x !== 'pattern_detection'), -0.4), cognitive_flexibility: -0.5, interference_susceptibility: 0.4, retrieval_strength: -0.3, vocabulary_ceiling: 0.4, prior_knowledge: 0.6, rush_tendency: -0.5, persistence: 0.2 }, spread: { '*': 1.1 } },
};
const PROFILE_DEFS = {
  // ADHD-like: executive-function and working-memory deficits of d about 0.4 to 0.6 (Willcutt et al. 2005 meta-analysis; Kasper, Alderson & Hudec 2012), large
  // reaction-time variability d about 0.8 (Kofler et al. 2013), full-scale reasoning about 0.2 SD lower (Frazier et al. 2004). Attention and pacing measures also
  // vary MORE (spread x1.3, ASSUMED from the variability finding). The other sizes are ASSUMED round numbers in the direction the DSM-5 criteria describe.
  adhd: { shift: { working_memory_span: -0.5, processing_velocity: -0.3, ...fill(REASON, -0.2), attention_runway: -1.0, rush_tendency: 0.9, persistence: -0.7, deliberation_depth: -0.6, frustration_threshold: -0.4, boredom_susceptibility: 0.8, novelty_hunger: 0.6, planning_tendency: -0.7, self_monitoring: -0.4, guessing_propensity: 0.5, fatigue_curve: -0.3 }, spread: { ...fill(['attention_runway', 'rush_tendency', 'persistence', 'deliberation_depth', 'boredom_susceptibility', 'processing_velocity'], 1.3) } },
  // Dyslexia-like (slow decoding, intact reasoning): phonological and naming-speed deficits, verbal working memory d about 0.5 to 0.8 (Peterson & Pennington 2012;
  // Swanson & Hsieh 2009), lower print exposure shows as lower vocabulary (Stanovich 1986, the Matthew effect). Reasoning shift is zero by definition of the proxy.
  dyslexia: { shift: { processing_velocity: -0.7, text_density_tolerance: -1.2, working_memory_span: -0.5, vocabulary_ceiling: -0.5, jargon_absorption: -0.5, brevity_preference: 0.5, notation_comfort: -0.3, evaluation_anxiety: 0.4 }, spread: {} },
  // English-language learner (low vocabulary, intact reasoning): second-language test language depresses scores on language-loaded items, not on reasoning
  // (Abedi 2002; Cummins 1979 on academic language). Sizes ASSUMED; the reading-speed and prior-knowledge shifts are ASSUMED to follow from L2 reading.
  ell: { shift: { vocabulary_ceiling: -1.5, jargon_absorption: -1.0, text_density_tolerance: -0.7, prior_knowledge: -0.3, processing_velocity: -0.2, evaluation_anxiety: 0.3 }, spread: {} },
  // Low and high tails: selected on a general ability factor, 1.2 SD either way (the lowest and highest ~12%); cognitive measures move the full 1.2 SD, the others
  // 0.3 SD (the sim's own g-loading of 0.25 to 0.5 for non-cognitive measures). Spread x0.85 (range restriction from selection, ASSUMED).
  low: { shift: { ...fill(COG, -1.2), '*': -0.3 }, spread: { '*': 0.85 } },
  high: { shift: { ...fill(COG, 1.2), '*': 0.3 }, spread: { '*': 0.85 } },
};

const lookup = (m, id) => (m[id] !== undefined ? m[id] : (m['*'] !== undefined ? m['*'] : null));
/** Combine an age band and an optional profile into { dz(id), sp(id) }: shifts add, spreads multiply. */
function transform(age, profile) {
  const a = AGE_PROFILES[age] || { shift: {}, spread: {} }; const p = (profile && PROFILE_DEFS[profile]) || { shift: {}, spread: {} };
  const dz = (id) => (lookup(a.shift, id) || 0) + (lookup(p.shift, id) || 0);
  const sp = (id) => (lookup(a.spread, id) || 1) * (lookup(p.spread, id) || 1);
  return { dz, sp };
}
/** Which age band and profile learner number `i` of a seed has: a balanced stripe for age, a fixed-share draw for the profile, both a pure function of i. */
function assign(i, u) { // u: a uniform [0,1) for the profile draw
  const age = AGES[i % AGES.length]; let acc = 0; let profile = null;
  for (const k of PROFILES) { acc += PROFILE_SHARE[k]; if (u < acc) { profile = k; break; } }
  return { age, profile };
}
module.exports = { AGES, PROFILES, PROFILE_SHARE, AGE_PROFILES, PROFILE_DEFS, transform, assign };
