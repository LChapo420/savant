#!/usr/bin/env node
/** One line per run file and goal: pass rates and mean hours (passers) for savant, normal studying, typical tutor; learners where savant is faster than normal / tutor. */
const fs = require('fs');
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '-');
for (const f of process.argv.slice(2)) {
  const o = JSON.parse(fs.readFileSync(f, 'utf8'));
  console.log(`${f.split('/').pop()}  (forget ${o.forget}, lesson ${o.lesson}, kloss ${o.kloss}, skipk ${o.skipk})`);
  for (const g of Object.keys(o.rows[0].goals)) {
    const cell = (a) => { const x = o.rows.map((r) => r.goals[g][a]); const ok = x.filter((y) => y.pass); return `${(100 * ok.length / x.length).toFixed(0)}% ${f1(mean(ok.map((y) => y.hours)))}h`; };
    const fast = (a) => o.rows.filter((r) => r.goals[g].savant.pass && (!r.goals[g][a].pass || r.goals[g].savant.hours < r.goals[g][a].hours)).length;
    console.log(`  ${g.padEnd(20)} savant ${cell('savant').padEnd(11)} normal ${cell('normal').padEnd(11)} tutor ${cell('tutor').padEnd(11)} bloom ${cell('tutor_bloom').padEnd(11)} savant faster than: normal ${fast('normal')}, tutor ${fast('tutor')}, bloom ${fast('tutor_bloom')} of ${o.rows.length}; savant recall ${(100 * mean(o.rows.map((r) => r.goals[g].savant.recall))).toFixed(0)}%`);
  }
}
