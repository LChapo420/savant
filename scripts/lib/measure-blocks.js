// Prints the lines that differ between a measure low (10) and high (90) in the block a surface's writer gets.
// node scripts/lib/measure-blocks.js MEASURE SURFACE   (surfaces lesson, notes, podcast, test, material)
const ls = require('../../services/learning-spec');
const [m, surface = 'podcast'] = process.argv.slice(2);
const mk = (v) => ls.buildSpecFrom({ metrics: { [m]: { measured: v, confidence: 90 } }, age: 14, interests: ['basketball', 'video games'], topic: 'two-step equations' });
const a = ls.specToPrompt(mk(10), { surface }).split('\n'); const b = ls.specToPrompt(mk(90), { surface }).split('\n');
const only = (x, y) => x.filter((l) => !y.includes(l));
console.log(`== ${m} LOW only:`); only(a, b).forEach((l) => console.log('  - ' + l.slice(0, 260)));
console.log(`== ${m} HIGH only:`); only(b, a).forEach((l) => console.log('  + ' + l.slice(0, 260)));
