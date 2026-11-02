// Sums several joint-profile run files (one per sample set) into one table: direction-correct verdicts by kind, by judge and by measure.
// Files with the same sample (same profile and kind and rep) written by different judges can be given together: verdicts add up.
// node scripts/lib/joint-summary.js FILE [FILE ...] [--measures]
const fs = require('fs');
const args = process.argv.slice(2);
const files = args.filter((a) => !a.startsWith('--'));
const byMeasure = args.includes('--measures');
const tally = () => ({ c: 0, s: 0, n: 0 });
const add = (t, v, m) => { t.n += 1; if (v.correct[m]) t.c += 1; else if (v.same[m]) t.s += 1; };
const kinds = {}; const judges = {}; const measures = {};
let total = tally();
for (const f of files) {
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const r of j.jointRecs || []) {
    for (const v of (r.verdicts || [])) {
      if (v.error) continue;
      for (const m of Object.keys(r.set)) {
        add(total, v, m);
        add(kinds[r.kind] = kinds[r.kind] || tally(), v, m);
        add(judges[v.judge.split('/').pop()] = judges[v.judge.split('/').pop()] || tally(), v, m);
        add(measures[`${r.kind}:${r.profile}:${m}`] = measures[`${r.kind}:${r.profile}:${m}`] || tally(), v, m);
      }
    }
  }
}
const pct = (t) => (t.n ? `${t.c}/${t.n} (${Math.round((100 * t.c) / t.n)}%), ${t.s} can't tell, ${t.n - t.c - t.s} wrong way` : 'none');
console.log(`ALL ${pct(total)}`);
for (const [k, t] of Object.entries(kinds)) console.log(`  ${k}: ${pct(t)}`);
for (const [k, t] of Object.entries(judges)) console.log(`  judge ${k}: ${pct(t)}`);
if (byMeasure) for (const [k, t] of Object.entries(measures).sort()) console.log(`  ${k.padEnd(48)} ${t.c}/${t.n}`);
