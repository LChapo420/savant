// Prints a joint-profile run per measure: correct / same / wrong for each kind, and the judges' evidence for what was not correct.
// node scripts/lib/joint-report.js FILE [--evidence]
const fs = require('fs');
const f = process.argv[2];
const j = JSON.parse(fs.readFileSync(f, 'utf8'));
const evidence = process.argv.includes('--evidence');
const by = {};
for (const r of j.jointRecs) {
  if (!r.verdicts) continue;
  for (const m of Object.keys(r.set)) {
    const v = r.verdicts.filter((x) => !x.error);
    const k = `${r.kind}:${r.profile}:${m}`;
    by[k] = { high: !!r.set[m], c: v.filter((x) => x.correct[m]).length, s: v.filter((x) => x.same[m]).length, n: v.length, ev: v.filter((x) => !x.correct[m]).map((x) => `${x.judge.split('/').pop().slice(0, 6)} ${x.same[m] ? 'SAME' : 'WRONG'} ${(String(x.evidence || '').split('; ').find((e) => e.startsWith(m)) || '').slice(0, 170)}`) };
  }
}
let c = 0; let s = 0; let n = 0;
const kinds = {};
for (const [k, v] of Object.entries(by)) {
  c += v.c; s += v.s; n += v.n;
  const kd = k.split(':')[0]; kinds[kd] = kinds[kd] || { c: 0, s: 0, n: 0 }; kinds[kd].c += v.c; kinds[kd].s += v.s; kinds[kd].n += v.n;
  if (v.c < v.n) { console.log(`${k.padEnd(52)} ${v.high ? 'hi' : 'lo'} ${v.c}/${v.n} same ${v.s}`); if (evidence) for (const e of v.ev) console.log(`      ${e}`); }
}
console.log(`TOTAL ${c}/${n} (${Math.round((100 * c) / n)}%) same ${s} wrong ${n - c - s}; ${Object.entries(kinds).map(([k, v]) => `${k} ${v.c}/${v.n} same ${v.s}`).join(', ')}`);
