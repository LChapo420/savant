#!/usr/bin/env node
/**
 * Compare two accuracy-gate runs of scripts/scorecard-recovery-sim.js (their written JSON), for a write-up:
 *
 *   node scripts/scorecard-gate-compare.js before.json after.json             pass / fail / no signal by group and week, and the flips
 *   ... --stats=question_generation,tone_formality                            those measures' error / prior / achievable at every week
 *   ... --changed                                                             every measure whose week-4 error moved by 0.3 points or more
 *
 * Read only: prints markdown.
 */
const path = require('path');

const [fa, fb] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const opt = (n) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : null; };
if (!fa || !fb) { console.log('usage: scorecard-gate-compare.js before.json after.json [--stats=a,b] [--changed]'); process.exit(1); }
const load = (f) => require(path.resolve(f)).results.off; // eslint-disable-line global-require
const A = load(fa);
const B = load(fb);
const WEEKS = [1, 2, 3, 4];
const GROUPS = ['behavioural', 'experiment', 'questionnaire', 'llm-only', 'all'];
const cell = (t) => `${t.pass} / ${t.fail} / ${t.no_signal}`;
const tally = (g, w, grp) => (grp === 'all' ? g.weeks[w].all : g.weeks[w].groups[grp]);

console.log(`| group (pass / fail / no signal) | ${WEEKS.map((w) => `week ${w}`).join(' | ')} |`);
console.log(`|---|${WEEKS.map(() => '---').join('|')}|`);
for (const grp of GROUPS) console.log(`| ${grp} | ${WEEKS.map((w) => `${cell(tally(A.gate, w, grp))} → **${cell(tally(B.gate, w, grp))}**`).join(' | ')} |`);
console.log(`| mean 90% coverage (with signal) | ${WEEKS.map((w) => `${A.gate.weeks[w].all.mean_coverage90} → **${B.gate.weeks[w].all.mean_coverage90}**`).join(' | ')} |`);
const flips = [];
for (const w of WEEKS) {
  for (const [id, b] of Object.entries(B.gate.weeks[w].perStat)) {
    const a = A.gate.weeks[w].perStat[id];
    if (a.status === 'pass' && b.status === 'fail') flips.push(`week ${w} ${id} (ratio ${a.ratio} → ${b.ratio})`);
  }
}
console.log(`\nPassing before, failing after: ${flips.length ? flips.join('; ') : '**none**'}.`);
const meanMae = (g, w) => { const xs = Object.values(g.weeks[w].perStat).filter((r) => r.mae !== undefined); return (xs.reduce((s, r) => s + r.mae, 0) / xs.length).toFixed(2); };
console.log(`Mean error over all measures, weeks 1-4: ${WEEKS.map((w) => `${meanMae(A.gate, w)} → ${meanMae(B.gate, w)}`).join(', ')}.`);

const ids = opt('stats') ? opt('stats').split(',') : process.argv.includes('--changed')
  ? Object.keys(B.gate.weeks[4].perStat).filter((id) => Math.abs(B.gate.weeks[4].perStat[id].mae - A.gate.weeks[4].perStat[id].mae) >= 0.3) : [];
if (ids.length) {
  console.log('\n| measure | week 4 before: status, error / prior / achievable | week 4 after | after, coverage |');
  console.log('|---|---|---|---|');
  for (const id of ids) {
    const a = A.gate.weeks[4].perStat[id];
    const b = B.gate.weeks[4].perStat[id];
    console.log(`| ${id} | ${a.status}, ${a.mae} / ${a.prior} / ${a.achievable} | **${b.status}, ${b.mae} / ${b.prior} / ${b.achievable}** | ${b.coverage90} |`);
  }
}
