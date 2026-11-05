#!/usr/bin/env node
/** Summaries of scripts/faster-by-goal-sim.js output: node scripts/faster-by-goal-report.js FILE [--md] */
const fs = require('fs');
const f = process.argv[2];
const o = JSON.parse(fs.readFileSync(f, 'utf8'));
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);
const q = (xs, p) => { if (!xs.length) return NaN; const a = xs.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : 'n/a');
const pc = (x) => `${(100 * x).toFixed(0)}%`;
const goals = Object.keys(o.rows[0].goals);
const subsets = { all: () => true, extreme: (r) => r.kind !== 'ordinary', ordinary: (r) => r.kind === 'ordinary' };
const arms = ['savant', 'normal', 'tutor', 'tutor_bloom'];
const out = [];
const log = (s = '') => out.push(s);
const sel = subsets[(process.argv.find((a) => a.startsWith('--set=')) || '--set=all').slice(6)];
const rows = o.rows.filter(sel);
log(`file ${f} seed ${o.seed} forget ${o.forget} lesson ${o.lesson} target ${o.target} jit ${o.jit} learners ${rows.length}`);
// per goal table
log('\nHOURS to cover the course and reach the target at the test day (passers only), and pass rate. mean / median / p90 / p99 (worst 1%).');
for (const g of goals) {
  const line = [g.padEnd(20)];
  for (const a of arms) {
    const x = rows.map((r) => r.goals[g][a]);
    const ok = x.filter((y) => y.pass).map((y) => y.hours);
    line.push(`${a} pass ${pc(ok.length / x.length)} ${f1(mean(ok))}/${f1(q(ok, 0.5))}/${f1(q(ok, 0.9))}/${f1(q(ok, 0.99))}`);
  }
  log(line.join(' | '));
}
log('\nPER-LEARNER comparison, savant vs baseline (n learners): faster / slower-or-equal (both pass) / savant fails / baseline fails (savant passes) / both fail');
for (const g of goals) {
  const line = [g.padEnd(20)];
  for (const a of ['normal', 'tutor', 'tutor_bloom']) {
    let fast = 0, slow = 0, sf = 0, bf = 0, both = 0; const ratio = [];
    for (const r of rows) {
      const s = r.goals[g].savant, b = r.goals[g][a];
      if (s.pass && b.pass) { if (s.hours < b.hours) fast++; else slow++; ratio.push(s.hours / b.hours); }
      else if (!s.pass && b.pass) sf++; else if (s.pass && !b.pass) bf++; else both++;
    }
    line.push(`${a}: ${fast}/${slow}/${sf}/${bf}/${both} ratio mean ${(mean(ratio)).toFixed(2)} med ${q(ratio, 0.5).toFixed(2)} p90 ${q(ratio, 0.9).toFixed(2)}`);
  }
  log(line.join(' | '));
}
// assumption (a): monotone in goal
log('\nASSUMPTION (a) lower goal takes fewer hours: learners with an inversion between adjacent goals (hours at the lower goal exceed the next by > 0.1 h, both passing), of passers at both');
const order = ['test in 1 week', 'test in 1 month', 'test in 6 months', 'test in 1 year', 'forever (3 y test)'];
for (let i = 0; i + 1 < order.length; i++) {
  const A = order[i], B = order[i + 1]; let inv = 0, n = 0; const diffs = [];
  for (const r of rows) { const a = r.goals[A].savant, b = r.goals[B].savant; if (a.pass && b.pass) { n++; diffs.push(b.hours - a.hours); if (a.hours > b.hours + 0.1) inv++; } }
  log(`${A} -> ${B}: inversions ${inv}/${n}; extra hours for the longer goal mean ${f1(mean(diffs))} median ${f1(q(diffs, 0.5))} min ${f1(Math.min(...diffs))}`);
}
// by kind and age band, for each goal: savant hours (passers) and pass rate
for (const key of ['kind', 'band']) {
  log(`\nBY ${key.toUpperCase()}: savant hours mean (worst) and pass rate; ratio to the typical tutor (both pass) mean`);
  const groups = [...new Set(rows.map((r) => r[key]))].sort();
  for (const gr of groups) {
    const rs = rows.filter((r) => r[key] === gr);
    const parts = goals.map((g) => {
      const ok = rs.map((r) => r.goals[g].savant).filter((y) => y.pass).map((y) => y.hours);
      const rt = rs.filter((r) => r.goals[g].savant.pass && r.goals[g].tutor.pass).map((r) => r.goals[g].savant.hours / r.goals[g].tutor.hours);
      return `${f1(mean(ok))} (${f1(Math.max(...ok))}) ${pc(ok.length / rs.length)} x${mean(rt).toFixed(2)}`;
    });
    log(`${String(gr).padEnd(11)} n${String(rs.length).padStart(3)} | ${parts.join(' | ')}`);
  }
}
log('\nHOURS SPLIT (savant, mean over learners, hours): lesson / practice / review, and share of lesson in first-pass (lesson+practice)');
for (const g of goals) {
  const x = rows.map((r) => r.goals[g].savant);
  const L = mean(x.map((y) => y.by.lesson)), P = mean(x.map((y) => y.by.practice)), R = mean(x.map((y) => y.by.review));
  log(`${g.padEnd(20)} ${f1(L)} / ${f1(P)} / ${f1(R)}  lesson share of first pass ${pc(L / (L + P))}, review share of all ${pc(R / (L + P + R))}`);
}
const kfail = {};
for (const g of goals) { const x = rows.filter((r) => !r.goals[g].savant.pass); log(`${g}: savant failures ${x.length}${x.length ? ` (not covered ${x.filter((r) => !r.goals[g].savant.covered).length}; mean recall of failures ${f1(100 * mean(x.map((r) => r.goals[g].savant.recall)))}%)` : ''}`); }
if (process.argv.includes('--json')) fs.writeFileSync(f.replace(/\.json$/, '.summary.txt'), out.join('\n'));
console.log(out.join('\n'));
