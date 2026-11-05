/**
 * A generator of very different SIMULATED learners (docs/EXTREME-LEARNERS.md). Seeded and reproducible: learner i of seed S is a pure function of (S, i), so a
 * held-out seed is just another number. Nothing here is a real person and nothing is a diagnosis; a trait tail is a number on the scorecard's 0-100 scale.
 *
 *   const X = require('./lib/extreme-learners');
 *   X.learner(seed, i)         one learner: { id, seed, index, kind, age, band, ell, profile, traits (true 0-100 per stat), hobbies, dislikes, difficulties,
 *                                           strengths, tags }
 *   X.generate(seed, n)        learners 0..n-1
 *   X.truth(learner)           the true value per stat id (same numbers as learner.traits)
 *
 * Kinds (a stripe over i % 10, so every block of ten holds all of them):
 *   tail_hi / tail_lo    3 to 9 random traits pushed to one tail (2-8 or 92-98), the rest ordinary
 *   tail_both            some traits at the top tail and some at the bottom, at random
 *   contradict           one named contradictory mix (fast but forgetful, high reasoning with slow decoding, anxious and competitive, ...)
 *   random               every trait uniform over 2-98 (the whole space, no population shape)
 *   all_hi / all_lo      every trait at one tail, with jitter (the corner of the space)
 *   age_young / age_old  ages 8-10 / 62-70 with the age band's own shifts and a random tail on top
 *   ell                  an English learner (low vocabulary, intact reasoning) at any age, optionally with a tail mix
 *   Every learner also gets an age 8-70, 0-3 unusual hobbies, 0-3 dislikes, 0-2 past difficulties and 0-2 strengths.
 */
const { STATS } = require('../../services/scorecard/stats');
const STRATA = require('./scorecard-strata');

const IDS = STATS.map((s) => s.id);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

function hash(...parts) { let h = 2166136261 >>> 0; for (const c of parts.join('|')) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
function rngFor(seed) {
  let a = seed >>> 0;
  const u = () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  u.normal = () => { let x = 0; while (x === 0) x = u(); return Math.sqrt(-2 * Math.log(x)) * Math.cos(2 * Math.PI * u()); };
  u.int = (n) => Math.floor(u() * n);
  u.pick = (arr) => arr[u.int(arr.length)];
  u.some = (arr, k) => { const c = arr.slice(); const out = []; while (out.length < k && c.length) out.push(c.splice(u.int(c.length), 1)[0]); return out; };
  return u;
}

const KINDS = ['tail_hi', 'tail_lo', 'contradict', 'random', 'tail_both', 'contradict', 'random', 'age_young', 'age_old', 'ell'];
const EXTRA_KINDS = ['all_hi', 'all_lo']; // appended only by generate(..., { corners: true }): the corner of the space, 1 in 20 of a corner run

// A contradictory mix names the traits and which tail each goes to (1 = high 90s, 0 = low 5s). Ids are scorecard stat ids (sign: higher = more of the thing named;
// decay_rate high = forgets fast, evaluation_anxiety high = anxious).
const MIXES = {
  fast_but_forgetful: { label: 'fast but forgetful', hi: ['processing_velocity', 'mastery_velocity', 'rush_tendency', 'decay_rate', 'interference_susceptibility'], lo: ['retrieval_strength', 'consolidation_need', 'deliberation_depth'] },
  reasoning_slow_decoding: { label: 'high reasoning, slow decoding', hi: ['deductive_trajectory', 'inductive_trajectory', 'analogical_transfer', 'systems_thinking', 'logical_rigor', 'pattern_detection', 'abstraction_tolerance'], lo: ['processing_velocity', 'text_density_tolerance', 'vocabulary_ceiling', 'notation_comfort'] },
  anxious_competitive: { label: 'anxious and competitive', hi: ['evaluation_anxiety', 'competitive_drive', 'perfectionism', 'extrinsic_reward_sensitivity'], lo: ['frustration_threshold', 'self_efficacy', 'failure_response', 'confidence_calibration'] },
  curious_unfocused: { label: 'curious but cannot sit still', hi: ['curiosity_hook', 'novelty_hunger', 'boredom_susceptibility', 'question_generation', 'creative_extension'], lo: ['attention_runway', 'persistence', 'instruction_adherence', 'planning_tendency'] },
  lazy_genius: { label: 'brilliant, hates effort', hi: ['intake_baseline', 'working_memory_span', 'far_transfer', 'cognitive_flexibility', 'prior_knowledge'], lo: ['persistence', 'repetition_tolerance', 'mastery_orientation', 'intrinsic_motivation', 'planning_tendency'] },
  diligent_struggler: { label: 'works very hard, learns slowly', hi: ['persistence', 'planning_tendency', 'repetition_tolerance', 'mastery_orientation', 'help_seeking', 'hint_dependency'], lo: ['mastery_velocity', 'working_memory_span', 'processing_velocity', 'near_transfer', 'pattern_detection'] },
  sure_and_wrong: { label: 'confident and often wrong', hi: ['self_efficacy', 'guessing_propensity', 'rush_tendency', 'misconception_persistence'], lo: ['confidence_calibration', 'self_monitoring', 'error_driven_learning', 'deliberation_depth'] },
  lone_wolf: { label: 'solitary, no feedback wanted', hi: ['autonomy_preference', 'intrinsic_motivation', 'productive_struggle'], lo: ['help_seeking', 'dialogic_preference', 'social_framing', 'praise_sensitivity', 'feedback_granularity'] },
  rule_bound_creative: { label: 'creative but needs rigid structure', hi: ['creative_extension', 'narrative_pull', 'humor_receptivity', 'structure_need', 'step_explicitness'], lo: ['autonomy_preference', 'cognitive_flexibility', 'interleaving_tolerance'] },
  burst_marathoner: { label: 'bursty, long gaps, deep when in', hi: ['attention_runway', 'reentry_cost', 'consolidation_need', 'depth_breadth'], lo: ['session_rhythm', 'warmup_latency', 'planning_tendency', 'momentum_dependence'] },
  skimmer_with_memory: { label: 'skims everything yet remembers', hi: ['retrieval_strength', 'elaboration_benefit', 'recognition_recall_gap', 'brevity_preference', 'rush_tendency'], lo: ['text_density_tolerance', 'instruction_adherence', 'reflection_depth', 'deliberation_depth'] },
  praise_starved_hider: { label: 'needs praise but shuts down when corrected', hi: ['praise_sensitivity', 'feedback_tone_sensitivity', 'evaluation_anxiety', 'identity_alignment'], lo: ['error_recovery_speed', 'failure_response', 'frustration_threshold', 'help_seeking'] },
};

const HOBBIES = [
  'competitive beekeeping', 'amateur radio', 'falconry', 'speedcubing', 'urban foraging', 'birdwatching', 'lockpicking sport', 'sourdough baking', 'roller derby', 'Dungeons and Dragons',
  'model railways', 'competitive chess', 'drone racing', 'quilting', 'sea kayaking', 'soap carving', 'mushroom hunting', 'tabletop wargames', 'train spotting', 'astrophotography',
  'competitive yo-yo', 'anime drawing', 'ham-fisted woodworking', 'gardening carnivorous plants', 'cosplay sewing', 'rock climbing', 'bass guitar', 'beatboxing', 'pottery', 'knife sharpening',
  'fantasy football', 'fishing', 'aquarium keeping', 'speedrunning old video games', 'minecraft redstone', 'longboarding', 'spoken word poetry', 'restoring old tractors', 'cave exploring', 'fermenting hot sauce',
  'competitive baking shows', 'K-pop dance covers', 'collecting vintage typewriters', 'ice hockey', 'horse riding', 'crochet', 'stand-up comedy open mics', 'rally car watching', 'weather chasing', 'genealogy',
  'knitting amigurumi', 'puppetry', 'ultimate frisbee', 'cattle showing', 'parkour', 'writing fan fiction', 'monster truck rallies', 'sewing historical costume', 'trading card games', 'dog agility',
  'volunteering at a food bank', 'learning to juggle', 'paper airplane engineering', 'coin collecting', 'making rap beats', 'bird song recording', 'fixing bicycles', '3D printing miniatures', 'tide pool exploring', 'ship model building',
  'ballroom dancing', 'welding art', 'tea ceremony', 'competitive eating videos', 'rugby', 'cricket', 'tabletop roleplaying audio dramas', 'taxidermy curiosity', 'ice fishing', 'Formula 1 strategy',
];
const DISLIKES = [
  'long reading passages', 'timed quizzes', 'being told the answer right away', 'word problems about money', 'sports examples', 'cute mascots', 'gamified points', 'leaderboards', 'being praised for easy things',
  'repetition drills', 'abstract symbols without a picture', 'jokes in lessons', 'stories that waste time', 'formal academic tone', 'audio-only explanations', 'being rushed', 'group work framing', 'rewrites of the same idea three times',
  'cartoon characters', 'violence in examples', 'food examples', 'competitive framing', 'open-ended essays', 'multiple choice trick questions',
];
const DIFFICULTIES = [
  'dyslexia-like slow reading', 'dyscalculia-like trouble with number sense', 'attention that drifts after five minutes', 'math anxiety since middle school', 'missed a year of school', 'English is the second language',
  'working memory overload on multi-step problems', 'test panic', 'never learned phonics well', 'forgets formulas overnight', 'lost confidence after failing a class', 'long gap since last studied',
];
const STRENGTHS = [
  'visual-spatial reasoning', 'strong vocabulary from reading', 'excellent mental arithmetic', 'pattern spotting', 'persistence on hard puzzles', 'remembers stories verbatim', 'fast typist', 'explains things to others well',
  'good at music and rhythm', 'strong mechanical intuition', 'learns languages by ear',
];
const LANGS = ['Spanish', 'Mandarin', 'Arabic', 'Hindi', 'Portuguese', 'Vietnamese', 'Russian', 'Tagalog', 'Swahili', 'French'];

/** Age 8 to 70 mapped to the strata band that supplies its cited shifts. */
const bandOf = (age) => (age <= 12 ? '8-12' : age <= 17 ? '13-17' : age <= 29 ? '18-29' : age <= 59 ? '30-59' : '60+');

function drawKind(i, opts) {
  if (opts && opts.corners && hash('corner', i) % 20 === 0) return EXTRA_KINDS[hash('corner2', i) % 2];
  return KINDS[i % KINDS.length];
}

/** One learner. A pure function of (seed, i). */
function learner(seed, i, opts = {}) {
  const r = rngFor(hash('extreme', seed, i));
  const kind = opts.kind || drawKind(i, opts);
  let age = 8 + r.int(63); // 8..70
  if (kind === 'age_young') age = 8 + r.int(3);
  if (kind === 'age_old') age = 62 + r.int(9);
  const ell = kind === 'ell' || r() < 0.08;
  const band = bandOf(age);
  const X = STRATA.transform(band, ell ? 'ell' : null);

  // ordinary baseline: an independent draw per trait around 50 (population shape), shifted by the age band and the ELL proxy, exactly as the strata sim does
  const base = {};
  for (const id of IDS) base[id] = clamp(50 + 20 * (X.sp(id) * r.normal() + X.dz(id)), 2, 98);

  const tags = [kind];
  const setTail = (id, hi) => { base[id] = hi ? 91 + 7 * r() : 2 + 7 * r(); };
  let mix = null;
  if (kind === 'tail_hi' || kind === 'tail_lo') { for (const id of r.some(IDS, 3 + r.int(7))) setTail(id, kind === 'tail_hi'); }
  else if (kind === 'tail_both') { for (const id of r.some(IDS, 4 + r.int(10))) setTail(id, r() < 0.5); }
  else if (kind === 'contradict') {
    const key = r.pick(Object.keys(MIXES)); mix = key; const m = MIXES[key];
    for (const id of m.hi) setTail(id, true); for (const id of m.lo) setTail(id, false);
    tags.push(key);
  } else if (kind === 'random') { for (const id of IDS) base[id] = 2 + 96 * r(); }
  else if (kind === 'all_hi' || kind === 'all_lo') { for (const id of IDS) setTail(id, kind === 'all_hi'); }
  else if (kind === 'age_young' || kind === 'age_old') { for (const id of r.some(IDS, 2 + r.int(5))) setTail(id, r() < 0.5); }
  else if (kind === 'ell') { if (r() < 0.5) for (const id of r.some(IDS, 2 + r.int(5))) setTail(id, r() < 0.5); }
  if (ell) tags.push('ell');
  tags.push(band);

  const traits = {};
  for (const id of IDS) traits[id] = Number(clamp(base[id], 2, 98).toFixed(2));
  const nH = r.int(4); const nD = r.int(4); const nP = r.int(3); const nS = r.int(3);
  return {
    id: `x${seed}-${i}`, seed, index: i, kind, mix, mixLabel: mix ? MIXES[mix].label : null, age, band, ell, language: ell ? r.pick(LANGS) : 'English', profile: ell ? 'ell' : null, traits,
    hobbies: r.some(HOBBIES, nH), dislikes: r.some(DISLIKES, nD), difficulties: r.some(DIFFICULTIES.filter((d) => ell || !/second language/.test(d)), nP), strengths: r.some(STRENGTHS, nS), tags,
  };
}
const generate = (seed, n, opts) => Array.from({ length: n }, (_, i) => learner(seed, i, opts));
const truth = (L) => L.traits;

/** Which traits are in a tail (<=10 or >=90), as { id: 'hi'|'lo' }: the profile of a learner, for the worst-case report. */
function tailsOf(L) { const o = {}; for (const id of IDS) { if (L.traits[id] >= 90) o[id] = 'hi'; else if (L.traits[id] <= 10) o[id] = 'lo'; } return o; }
/** A short human line for a learner. */
function describe(L) {
  const t = tailsOf(L); const hi = Object.keys(t).filter((k) => t[k] === 'hi'); const lo = Object.keys(t).filter((k) => t[k] === 'lo');
  const cut = (a) => (a.length > 8 ? `${a.slice(0, 8).join(', ')} (+${a.length - 8})` : a.join(', '));
  return `${L.id} ${L.kind}${L.mixLabel ? ` [${L.mixLabel}]` : ''} age ${L.age}${L.ell ? ` ELL(${L.language})` : ''}; high tail: ${cut(hi) || '-'}; low tail: ${cut(lo) || '-'}; hobbies: ${L.hobbies.join(', ') || '-'}; dislikes: ${L.dislikes.join(', ') || '-'}; past difficulties: ${L.difficulties.join(', ') || '-'}`;
}
/** The learner as a scorecard-like read for a lesson writer: the trait directives that sit confidently at an edge (<=30 or >=70) in order of distance from 50, plus interests. */
function writerProfile(L, maxTraits = 8) {
  const edge = STATS.map((s) => ({ s, v: L.traits[s.id], d: Math.abs(L.traits[s.id] - 50) })).filter((x) => x.d >= 20 && ((x.v >= 70 && x.s.dir && x.s.dir[1]) || (x.v <= 30 && x.s.dir && x.s.dir[0])))
    .sort((a, b) => b.d - a.d || b.s.impact - a.s.impact).slice(0, maxTraits);
  return {
    age: L.age, language: L.language, interests: L.hobbies, dislikes: L.dislikes, pastDifficulties: L.difficulties, strengths: L.strengths,
    directives: edge.map((x) => ({ id: x.s.id, value: Math.round(x.v), instruction: x.v >= 50 ? x.s.dir[1] : x.s.dir[0] })),
  };
}

module.exports = { IDS, KINDS, EXTRA_KINDS, MIXES, HOBBIES, DISLIKES, DIFFICULTIES, STRENGTHS, LANGS, bandOf, learner, generate, truth, tailsOf, describe, writerProfile, hash, rngFor };
