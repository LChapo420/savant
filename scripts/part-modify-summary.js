#!/usr/bin/env node
/** Prints a proof's JSON as lines: node scripts/part-modify-summary.js docs/part-modify/pm3a.json [...]. SIMULATED learners, AI judges. */
const fs = require('fs');

const pct = (x) => (x === null || x === undefined ? 'n/a' : `${Math.round(x * 100)}%`);
for (const file of process.argv.slice(2)) {
  const r = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const [part, p] of Object.entries(r.parts)) {
    const f = p.facts;
    console.log(`\n${part}: ${f.passed}/${f.checked} served, ${f.declined} refused; attempts ${JSON.stringify(f.gate_attempts)}; partial ${f.partial}; coverage fails ${f.coverage_fail}`);
    console.log(`  refused because: ${Object.entries(f.declined_because).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${v}x ${k}`).join(' | ')}`);
    console.log(`  claims ${JSON.stringify(f.claims)} strict ${JSON.stringify(f.strict)} old-sample same ${f.same_yes}/${f.same_asked} conflict ${f.conflict_yes}/${f.conflict_asked} flagged ${(f.flagged || []).length}`);
    for (const [arm, a] of Object.entries(p.arms)) {
      const fam = Object.entries(a.by_family).filter(([, v]) => v.verdicts).map(([k, v]) => `${k} ${pct(v.share)} (n${v.verdicts}, p ${v.p === null ? 'n/a' : v.p.toExponential(1)})`).join('; ');
      console.log(`  ${arm}: ${pct(a.real.share)} of ${a.real.verdicts} (same ${a.real.same}, empty ${a.real.empty}); ${fam}; swap ${pct(a.swap_fooled.share)}; control ${pct(a.control_picks_vL.share)}; worst 10/5/1 ${pct(a.individuals.worst_10pct)}/${pct(a.individuals.worst_5pct)}/${pct(a.individuals.worst_1pct)}; learners ${a.individuals.n}, below half ${a.individuals.below_half}`);
    }
  }
  if (r.hint_dose) console.log('hint dose', JSON.stringify({ ...r.hint_dose, samples: undefined }));
  if (r.stats) console.log('stats', JSON.stringify({ calls: r.stats.calls, errors: r.stats.errors, seconds: r.stats.seconds }));
}
