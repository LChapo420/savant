// Generate content/iq-grades.js from the IQ level/topic CSV.
//
// The CSV is the source of truth for all twelve IQ grades. This file only maps
// those rows to the question families the app already knows how to serve; the
// visible type, topic/activity and coverage remain the creator's exact words.
const path = require('path');
const { readSheet, writeTrack } = require('./build-sheet-track');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'data', 'IQ_Levels_Topics.csv');
const OUT = path.join(ROOT, 'content', 'iq-grades.js');

// The IQ bank has a small set of reusable reasoning families. These rules choose
// the closest family for generated session questions; they do not rewrite the
// level's topic or coverage.
const RULES = [
  [/working memory|memory span|memory palace|memor|recall|retrieval|attention|focus|sleep|rest and incubation|chunk/i, 'working_memory'],
  [/syllog|categorical logic|quantifier|premise|conclusion|validity|tautolog|contradiction|conditional|modus|deduction|proof|fallac|argument|evidence|assumption|reasoning chain|necessary and sufficient/i, 'syllogism'],
  [/code|cipher|cryptarithm|digit substitution|symbol substitution/i, 'code_cipher'],
  [/fold|punch|unfold|rotation|rotate|spatial|shape|cube|solid|map|direction|mirror|reflection|handedness|chirality|tiling|packing|knot|geometry|figure/i, 'spatial_reason'],
  [/letter series|alphabet|letter pattern|symbol series|word series|spelling|phonics/i, 'letter_series'],
  [/number series|sequence|pattern|matrix|grid|classification|hidden abstract|odd one|group|category|rule finding|analogy.*figure|figure analogy/i, 'matrix_pattern'],
  [/analogy|near synonym|word meaning|vocabulary|terminology|language|verbal|word group|definition|polysemy|ambiguity/i, 'verbal_analogy'],
  [/odd one|classification|shared propert|outlier|distinguish|sort|compare|matching|same and different/i, 'odd_one_out'],
  [/number|numeric|quantity|count|arithmetic|fraction|decimal|percent|ratio|rate|probability|chance|algebra|equation|calculation|data|table|graph|statistics|average|money|finance|econom|growth|logarithm|binomial|path|subset/i, 'numeric_reason'],
  [/logic|reason|problem|decision|planning|strategy|theory|experiment|science|research|caus|effect|inference|induct|deduct|synthesis|claim|result|solution/i, 'logic_deduction'],
];

function skillFor(level) {
  const text = `${level.title} ${level.covers}`;
  for (const [pattern, skill] of RULES) {
    if (pattern.test(text)) return skill;
  }
  // Keep every row attached to a usable IQ family even when a new topic uses
  // wording no rule has seen yet. The CSV text still remains fully visible.
  return 'logic_deduction';
}

const GRADE_META = {
  concrete_thinking_foundations: {
    name: 'Concrete Thinking Foundations', tier: 1,
    blurb: 'IQ 70 tier: everyday objects, directions, numbers, and concrete reasoning.',
  },
  everyday_reasoning_basics: {
    name: 'Everyday Reasoning Basics', tier: 1,
    blurb: 'IQ 80 tier: practical language, patterns, memory, and everyday problem solving.',
  },
  building_flexible_reasoning: {
    name: 'Building Flexible Reasoning', tier: 2,
    blurb: 'IQ 90 tier: flexible strategies across language, numbers, evidence, and space.',
  },
  core_reasoning_skills: {
    name: 'Core Reasoning Skills', tier: 2,
    blurb: 'IQ 100 tier: core logic, memory, spatial, quantitative, and scientific reasoning.',
  },
  abstract_reasoning: {
    name: 'Abstract Reasoning', tier: 3,
    blurb: 'IQ 110 tier: abstraction, analogy, probability, evidence, and formal problem solving.',
  },
  advanced_analytical_thinking: {
    name: 'Advanced Analytical Thinking', tier: 3,
    blurb: 'IQ 120 tier: multi-step analysis, models, uncertainty, and strategic reasoning.',
  },
  complex_reasoning_and_synthesis: {
    name: 'Complex Reasoning and Synthesis', tier: 4,
    blurb: 'IQ 130 tier: combining evidence, formal models, advanced memory, and complex systems.',
  },
  expert_reasoning: {
    name: 'Expert Reasoning', tier: 4,
    blurb: 'IQ 140 tier: expert-level mathematics, logic, science, language, and spatial analysis.',
  },
  formal_and_original_thinking: {
    name: 'Formal and Original Thinking', tier: 5,
    blurb: 'IQ 150 tier: formal systems, original arguments, advanced mathematics, and research judgment.',
  },
  extreme_difficulty_reasoning: {
    name: 'Extreme-Difficulty Reasoning', tier: 5,
    blurb: 'IQ 160 tier: extreme-difficulty synthesis, proof, strategy, uncertainty, and transfer.',
  },
  frontier_reasoning: {
    name: 'Frontier Reasoning (aspirational tier)', tier: 5,
    blurb: 'IQ 170 tier: frontier topics for ambitious practice, without claiming a measurable IQ score.',
  },
  mastery_frontier: {
    name: 'Mastery Frontier (aspirational tier)', tier: 5,
    blurb: 'IQ 180 tier: frontier synthesis and generalization, without claiming a measurable IQ score.',
  },
};

const { grades, unknownTypes } = readSheet(SRC, skillFor);

if (grades.length !== 12) {
  throw new Error(`Expected 12 IQ grades, found ${grades.length}.`);
}

writeTrack({
  grades,
  out: OUT,
  subject: 'IQ Training',
  meta: GRADE_META,
  keepIds: {
    0: 'concrete_thinking_foundations',
    1: 'everyday_reasoning_basics',
    2: 'building_flexible_reasoning',
    3: 'core_reasoning_skills',
    4: 'abstract_reasoning',
    5: 'advanced_analytical_thinking',
    6: 'complex_reasoning_and_synthesis',
    7: 'expert_reasoning',
    8: 'formal_and_original_thinking',
    9: 'extreme_difficulty_reasoning',
    10: 'frontier_reasoning',
    11: 'mastery_frontier',
  },
  unknownTypes,
});