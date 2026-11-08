#!/usr/bin/env node
/**
 * Report of the lever 2 and 3 arms of scripts/upload-4x-sim.js: per goal, minutes, exam and the multiple against careful study and rereading; each arm against the lean + expanding-interval arm
 * (`expand`) on the same learners; worst individuals; by learner kind. SIMULATED. docs/UPLOAD-4X.md.
 *   node scripts/upload-4x2-report.js FILE [FILE2...]     (several files are pooled: different seeds, same settings)
 */
const fs = require('fs');

const GOALS = ['1 week', '1 month', '6 months', '1 year', 'no test day (3 y)', 'test in 1 week', 'test in 1 month', 'test in 6 months', 'test in 1 year'];
const ARMS = ['expand', 'tf1', 'tf', 'custom', 'oracle'];
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);
const q = (xs, p) => { const a = [...xs].sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : NaN; };
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '-');
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '-');
const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const rows = files.flatMap((f) => JSON.parse(fs.readFileSync(f, 'utf8')).learners);
const o = [];
o.push(`SIMULATED. ${rows.length} learners (${rows.filter((r) => r.kind !== 'ordinary').length} extreme/random, ${rows.filter((r) => r.kind === 'ordinary').length} ordinary). Minutes at ASSUMED seconds; recall from the v2 model.`);
o.push('Arms: expand = lean page + expanding intervals (the round-1 reference). tf1 = a part is skipped on one right answer (today\'s starting-check rule). tf = test first with proof (2 right, one sure, recheck in 3 days).');
o.push('custom = tf + the scorecard knobs from ESTIMATED traits (only habit, performance, contrast, memory). oracle = same from TRUE traits (an upper bound, not a claim).');
o.push('');
o.push('## Minutes and exam');
o.push('goal | arm | minutes mean | worst 1% minutes | exam mean | exam worst 1% | skipped on test-first, mean share');
for (const g of GOALS) {
  for (const arm of ARMS) {
    const c = rows.map((r) => r.goals[g][arm]);
    o.push(`${g} | ${arm} | ${f1(mean(c.map((x) => x.min)))} | ${f1(q(c.map((x) => x.min), 0.99))} | ${f2(mean(c.map((x) => x.score)))} | ${f2(q(c.map((x) => x.score), 0.01))} |`);
  }
}
o.push('');
o.push('## Each arm against `expand`, same learners: time saved, exam difference (points), worst case');
o.push('goal | arm | minutes % of expand (mean) | slowest-relative learner | exam diff mean | exam diff worst 1% | exam diff worst | learners >5 pts lower | newly under 0.70');
for (const g of GOALS) {
  for (const arm of ARMS.slice(1)) {
    const rel = rows.map((r) => r.goals[g][arm].min / r.goals[g].expand.min);
    const d = rows.map((r) => 100 * (r.goals[g][arm].score - r.goals[g].expand.score));
    const lower = d.filter((x) => x < -5).length;
    const newly = rows.filter((r) => r.goals[g][arm].score < 0.7 && r.goals[g].expand.score >= 0.7).length;
    o.push(`${g} | ${arm} | ${f1(100 * mean(rel))}% | x${f2(Math.max(...rel))} | ${f1(mean(d))} | ${f1(q(d, 0.01))} | ${f1(Math.min(...d))} | ${lower} | ${newly}`);
  }
}
o.push('');
o.push('## By prior knowledge (theta0 tercile of the learners), 1 month: each arm against expand, minutes % and exam diff points, and the share of parts skipped');
const sortedP = rows.map((r) => r.prior).sort((a, b) => a - b); const t1 = sortedP[Math.floor(sortedP.length / 3)]; const t2 = sortedP[Math.floor(2 * sortedP.length / 3)];
for (const g of ['1 month', '1 year']) {
  for (const [label, sub] of [['low prior', rows.filter((r) => r.prior <= t1)], ['mid prior', rows.filter((r) => r.prior > t1 && r.prior <= t2)], ['high prior', rows.filter((r) => r.prior > t2)]]) {
    const cells = ARMS.slice(1).map((arm) => `${arm} ${f1(100 * mean(sub.map((r) => r.goals[g][arm].min / r.goals[g].expand.min)))}% / ${f1(mean(sub.map((r) => 100 * (r.goals[g][arm].score - r.goals[g].expand.score))))} pts / skipped ${f2(mean(sub.map((r) => r.goals[g][arm].skipped)))}`);
    o.push(`${g} | ${label} (n ${sub.length}) | ${cells.join(' | ')}`);
  }
}
o.push('');
o.push('## Test-first on the whole course of today (a part costs about 8 questions there): each arm against `course`, same learners');
o.push('goal | arm | minutes % of course | exam diff mean | exam diff worst 1% | worst | learners >5 pts lower | share of parts skipped');
for (const g of GOALS) {
  for (const arm of ['course_tf1', 'course_tf']) {
    const rel = rows.map((r) => r.goals[g][arm].min / r.goals[g].course.min);
    const d = rows.map((r) => 100 * (r.goals[g][arm].score - r.goals[g].course.score));
    o.push(`${g} | ${arm} | ${f1(100 * mean(rel))}% | ${f1(mean(d))} | ${f1(q(d, 0.01))} | ${f1(Math.min(...d))} | ${d.filter((x) => x < -5).length} | ${f2(mean(rows.map((r) => r.goals[g][arm].skipped)))}`);
  }
}
o.push('');
o.push('## The multiple: baseline minutes over Savant minutes (cheapest careful or reread plan reaching the same exam). Mean, worst 1% in brackets, n both reach, learners at 4x');
for (const base of ['careful', 'reread']) {
  o.push(`-- against ${base}`);
  o.push(`goal | ${ARMS.join(' | ')}`);
  for (const g of GOALS) {
    const cells = ARMS.map((arm) => {
      const ok = rows.filter((r) => r.goals[g][`${base}_${arm}`] && r.goals[g][`${base}_${arm}`].reached);
      const xs = ok.map((r) => r.goals[g][`${base}_${arm}`].min / r.goals[g][arm].min);
      return `x${f2(mean(xs))} (${f2(q(xs, 0.01))}) n${ok.length} 4x:${xs.filter((x) => x >= 4).length}`;
    });
    o.push(`${g} | ${cells.join(' | ')}`);
  }
}
o.push('');
o.push('## By learner kind, custom against expand (minutes %, exam diff points), 1 month and 1 year');
for (const g of ['1 month', '1 year']) {
  for (const kind of [...new Set(rows.map((r) => r.kind))].sort()) {
    const sub = rows.filter((r) => r.kind === kind);
    if (sub.length < 3) continue;
    const rel = sub.map((r) => r.goals[g].custom.min / r.goals[g].expand.min);
    const d = sub.map((r) => 100 * (r.goals[g].custom.score - r.goals[g].expand.score));
    o.push(`${g} | ${kind} (n ${sub.length}) | ${f1(100 * mean(rel))}% | exam ${f1(mean(d))}, worst ${f1(Math.min(...d))}`);
  }
}
o.push('');
o.push('## Worst individuals, custom (lowest multiple against careful per goal, and biggest exam drop against expand)');
for (const g of GOALS) {
  const ok = rows.filter((r) => r.goals[g].careful_custom && r.goals[g].careful_custom.reached);
  let lo = null; for (const r of ok) { const x = r.goals[g].careful_custom.min / r.goals[g].custom.min; if (!lo || x < lo.x) lo = { x, r }; }
  let dr = null; for (const r of rows) { const x = 100 * (r.goals[g].custom.score - r.goals[g].expand.score); if (!dr || x < dr.x) dr = { x, r }; }
  o.push(`${g}: lowest x${f2(lo && lo.x)} ${lo ? `${lo.r.kind}, ${lo.r.age}, ${f1(lo.r.goals[g].custom.min)} min against ${f1(lo.r.goals[g].careful_custom.min)}` : ''}; biggest exam drop ${f1(dr.x)} pts (${dr.r.kind}, ${dr.r.age}: ${f2(dr.r.goals[g].custom.score)} against ${f2(dr.r.goals[g].expand.score)})`);
}
console.log(o.join('\n'));
