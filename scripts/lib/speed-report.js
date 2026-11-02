// Prints a speed-phase run per learner: words and fit, tailored against generic. node scripts/lib/speed-report.js FILE [kind]
const j = JSON.parse(require('fs').readFileSync(process.argv[2], 'utf8'));
const kind = process.argv[3] || 'notes';
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
let tw = 0; let gw = 0; const tf = []; const gf = []; const cov = [];
for (const r of j.speed.filter((x) => x.kind === kind && !x.result)) {
  const v = r.verdicts || [];
  const t = avg(v.map((x) => x.tailored.fit)); const g = avg(v.map((x) => x.generic.fit));
  const c = avg(v.map((x) => x.tailored.covered.length)); const gc = avg(v.map((x) => x.generic.covered.length));
  console.log(`${r.learner.padEnd(6)} words ${String(r.code.generic.words).padStart(4)} -> ${String(r.code.tailored.words).padStart(4)} (${r.code.tailored.words <= r.code.generic.words ? 'not longer' : 'LONGER'})  fit ${g.toFixed(1)} -> ${t.toFixed(1)}  objectives ${gc.toFixed(1)} -> ${c.toFixed(1)}  judges ${v.length}`);
  tw += r.code.tailored.words; gw += r.code.generic.words; tf.push(t); gf.push(g); cov.push(c);
}
console.log(`ALL words ${gw} -> ${tw}; fit ${avg(gf).toFixed(2)} -> ${avg(tf).toFixed(2)}; objectives tailored ${avg(cov).toFixed(2)}`);
