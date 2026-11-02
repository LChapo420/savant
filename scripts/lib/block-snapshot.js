// Writes the block each surface's writer receives for every measure moved on its own (low 10, high 90, confidence 90) and for the joint
// profiles, as text keyed by case, so a change of rules can be listed as exactly which cases changed.
// node scripts/lib/block-snapshot.js OUT.json
const fs = require('fs');
const ls = require('../../services/learning-spec');
const { STATS } = require('../../services/scorecard/stats');
const SURFACES = ['lesson', 'notes', 'podcast', 'test', 'material'];
const mk = (set) => ls.buildSpecFrom({ metrics: Object.fromEntries(Object.entries(set).map(([m, v]) => [m, { measured: v, confidence: 90 }])), age: 14, interests: ['basketball', 'video games'], topic: 'photosynthesis' });
const out = {};
for (const s of STATS) for (const v of [10, 90]) { const spec = mk({ [s.id]: v }); for (const surf of SURFACES) out[`${s.id}:${v}:${surf}`] = ls.specToPrompt(spec, { surface: surf }); }
fs.writeFileSync(process.argv[2], JSON.stringify(out));
console.log(Object.keys(out).length, 'blocks');
