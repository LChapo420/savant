// Prints the lever leans and the lesson shape for a joint profile and its mirror. node scripts/lib/joint-leans.js J1
const ls = require('../../services/learning-spec');
const JOINT = {
  J1: { vocabulary_ceiling: 1, attention_runway: 0, evaluation_anxiety: 1, prior_knowledge: 1 },
  J2: { working_memory_span: 0, deductive_trajectory: 1, interest_transfer: 1, brevity_preference: 1 },
  J3: { worked_example_dependence: 1, challenge_appetite: 1, spatial_anchoring: 0, tone_formality: 1 },
  J4: { structure_need: 1, narrative_pull: 1, productive_struggle: 0, text_density_tolerance: 0 },
};
const set = JOINT[process.argv[2]];
const mk = (flip) => ls.buildSpecFrom({ metrics: Object.fromEntries(Object.entries(set).map(([m, h]) => [m, { measured: (h ? 1 : 0) === (flip ? 0 : 1) ? 90 : 10, confidence: 90 }])), age: 14, interests: ['basketball', 'video games'], topic: 'photosynthesis' });
const a = mk(false); const b = mk(true);
const keys = [...new Set([...Object.keys(a.levers || {}), ...Object.keys(b.levers || {})])];
for (const k of keys) { const x = (a.levers || {})[k]; const y = (b.levers || {})[k]; if (Math.abs(x) > 0.05 || Math.abs(y) > 0.05) console.log(k.padEnd(18), String(Number(x).toFixed(2)).padStart(6), String(Number(y).toFixed(2)).padStart(6)); }
console.log(JSON.stringify(a.lesson), '\n', JSON.stringify(b.lesson));
