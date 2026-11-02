// Prints the block a surface's writer receives for a joint profile and its mirror (the lines that differ are marked).
// node scripts/lib/joint-blocks.js J1 notes   (profiles J1..J4 as in material-sensitivity-proof.js; surfaces lesson, notes, podcast, test, material)
const ls = require('../../services/learning-spec');
const JOINT = {
  J1: { vocabulary_ceiling: 1, attention_runway: 0, evaluation_anxiety: 1, prior_knowledge: 1 },
  J2: { working_memory_span: 0, deductive_trajectory: 1, interest_transfer: 1, brevity_preference: 1 },
  J3: { worked_example_dependence: 1, challenge_appetite: 1, spatial_anchoring: 0, tone_formality: 1 },
  J4: { structure_need: 1, narrative_pull: 1, productive_struggle: 0, text_density_tolerance: 0 },
};
const [id, surface = 'notes'] = process.argv.slice(2);
const set = JOINT[id];
const mk = (flip) => ls.buildSpecFrom({ metrics: Object.fromEntries(Object.entries(set).map(([m, h]) => [m, { measured: (h ? 1 : 0) === (flip ? 0 : 1) ? 90 : 10, confidence: 90 }])), age: 14, interests: ['basketball', 'video games'], topic: 'photosynthesis' });
const a = ls.specToPrompt(mk(false), { surface }).split('\n');
const b = ls.specToPrompt(mk(true), { surface }).split('\n');
console.log('=== PROFILE'); console.log(a.join('\n'));
console.log('\n=== MIRROR'); console.log(b.join('\n'));
console.log(`\n(words: profile ${a.join(' ').split(/\s+/).length}, mirror ${b.join(' ').split(/\s+/).length})`);
