// Prints the block a surface's writer receives for one of the 16 proof learners. node scripts/lib/learner-block.js Lena notes
const ls = require('../../services/learning-spec');
process.env.NODE_ENV = 'test';
const base = require('../scorecard-modification-proof');
const [name, surface = 'notes'] = process.argv.slice(2);
const l = base.LEARNERS.find((x) => x.name === name);
const metrics = Object.fromEntries(Object.entries(l.stats).map(([m, v]) => [m, { measured: v, confidence: 90 }]));
const spec = ls.buildSpecFrom({ metrics, age: l.age, interests: String(l.survey.interests || '').split(/,\s*/), topic: 'photosynthesis' });
console.log(ls.specToPrompt(spec, { surface }));
