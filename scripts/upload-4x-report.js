#!/usr/bin/env node
/**
 * Report of scripts/upload-4x-sim.js: multiple per goal and baseline, worst individuals, and the interval gate. SIMULATED. docs/UPLOAD-4X.md.
 *   node scripts/upload-4x-report.js FILE [FILE2...]       (several files are pooled: different seeds, same settings)
 *   node scripts/upload-4x-report.js --gate MAIN.json --variant NAME=FILE ...   the gate (see gateLines)
 */
const fs = require('fs');

const HORIZON_GOALS = ['1 week', '1 month', '6 months', '1 year', 'no test day (3 y)'];
const GOALS = [...HORIZON_GOALS, 'test in 1 week', 'test in 1 month', 'test in 6 months', 'test in 1 year'];
const MARGIN = -0.05; // scripts/speed-gate.js: the margin every speed gate uses; not moved here
const ABS = 0.7;      // the target of docs/FASTER-BY-GOAL.md and docs/speed-real/ROUND4.md
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);
const qLow = (xs, q) => { const a = [...xs].sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(q * a.length))] : NaN; };
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '-');
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '-');
const load = (files) => files.flatMap((f) => JSON.parse(fs.readFileSync(f, 'utf8')).learners);

function multiples(rows, arm, base) {
  const lines = [];
  for (const g of GOALS) {
    const ok = rows.filter((r) => r.goals[g][`${base}_${arm}`].reached);
    const xs = ok.map((r) => r.goals[g][`${base}_${arm}`].min / r.goals[g][arm].min);
    const looks = mean(ok.map((r) => r.goals[g][`${base}_${arm}`].looks));
    lines.push({ g, n: ok.length, of: rows.length, mean: mean(xs), med: qLow(xs, 0.5), w10: qLow(xs, 0.1), w5: qLow(xs, 0.05), w1: qLow(xs, 0.01), worst: Math.min(...xs), at4: xs.filter((x) => x >= 4).length, looks });
  }
  return lines;
}

function report(rows) {
  const o = [];
  o.push(`SIMULATED. ${rows.length} learners. Minutes at ASSUMED seconds; recall from the model.`);
  o.push('');
  o.push('goal | arm | minutes mean (read/practice/review) | worst 1% minutes | reviews a skill | exam mean | worst 1% exam | weakest point mean');
  for (const g of GOALS) {
    for (const arm of ['course', 'lean', 'expand']) {
      const c = rows.map((r) => r.goals[g][arm]);
      o.push(`${g} | ${arm} | ${f1(mean(c.map((x) => x.min)))} (${f1(mean(c.map((x) => x.read)))}/${f1(mean(c.map((x) => x.practice)))}/${f1(mean(c.map((x) => x.review)))}) | ${f1(qLow(c.map((x) => x.min), 0.99))} | ${f1(mean(c.map((x) => x.reviews)))} | ${f2(mean(c.map((x) => x.score)))} | ${f2(qLow(c.map((x) => x.score), 0.01))} | ${f2(mean(c.map((x) => x.low)))}`);
    }
    const r5 = rows.map((r) => r.goals[g].read5);
    o.push(`${g} | habit: read 5 times | ${f1(mean(r5.map((x) => x.min)))} | | | ${f2(mean(r5.map((x) => x.score)))} | ${f2(qLow(r5.map((x) => x.score), 0.01))} |`);
  }
  o.push('');
  o.push('Multiple = the cheapest baseline plan reaching the same exam / Savant minutes. n = both reach. "at 4x" of those n. Baseline plan picked per learner with the outcome known (generous to the baseline).');
  for (const arm of ['lean', 'expand']) {
    for (const base of ['careful', 'reread']) {
      o.push(`-- ${arm} against ${base}`);
      for (const l of multiples(rows, arm, base)) o.push(`${l.g}: mean x${f2(l.mean)} median x${f2(l.med)} worst 10/5/1% x${f2(l.w10)}/${f2(l.w5)}/${f2(l.w1)} lowest x${f2(l.worst)} n ${l.n}/${l.of} at 4x ${l.at4} baseline looks ${f1(l.looks)}`);
    }
  }
  o.push('');
  o.push('Against the rereading habit (read 5 times in a sitting, not matched): time ratio habit/expand, and exam expand minus habit, in points.');
  for (const g of GOALS) {
    const xs = rows.map((r) => r.goals[g].read5.min / r.goals[g].expand.min);
    const ds = rows.map((r) => 100 * (r.goals[g].expand.score - r.goals[g].read5.score));
    o.push(`${g}: x${f2(mean(xs))} worst 1% x${f2(qLow(xs, 0.01))}; exam ${f1(mean(ds))} pts, worst 1% ${f1(qLow(ds, 0.01))}`);
  }
  o.push('');
  o.push('Worst individuals, expand against careful (lowest multiple per goal) and lowest exam:');
  for (const g of GOALS) {
    const ok = rows.filter((r) => r.goals[g].careful_expand.reached).map((r) => ({ r, x: r.goals[g].careful_expand.min / r.goals[g].expand.min })).sort((a, b) => a.x - b.x)[0];
    const lo = [...rows].sort((a, b) => a.goals[g].expand.score - b.goals[g].expand.score)[0];
    o.push(`${g}: x${ok ? f2(ok.x) : '-'} ${ok ? `${ok.r.id} ${ok.r.kind} age ${ok.r.age} (${f1(ok.r.goals[g].expand.min)} min against ${f1(ok.r.goals[g].careful_expand.min)})` : ''}; lowest exam ${f2(lo.goals[g].expand.score)} ${lo.id} ${lo.kind} age ${lo.age} in ${f1(lo.goals[g].expand.min)} min`);
  }
  return o.join('\n');
}

/**
 * The gate, written before the held-out run. Expanding against today's intervals on the same first pass, per learner:
 *   exam mean and worst 1% difference at or above MARGIN (-5 points, as scripts/speed-gate.js); nobody under ABS (0.70) unless today's intervals are under it too;
 *   mean minutes at or below today's; a lower goal never slower for any learner (the owner's rule), compared on review minutes + first pass.
 * Adverse variants: the exam lines only.
 */
function gateLines(rows, name, main) {
  const o = []; let pass = true;
  for (const g of GOALS) {
    const d = rows.map((r) => r.goals[g].expand.score - r.goals[g].lean.score);
    const under = rows.filter((r) => r.goals[g].expand.score < ABS && r.goals[g].lean.score >= ABS).length;
    const mins = [mean(rows.map((r) => r.goals[g].expand.min)), mean(rows.map((r) => r.goals[g].lean.min))];
    const okM = mean(d) >= MARGIN; const ok1 = qLow(d, 0.01) >= MARGIN; const okA = under === 0; const okT = !main || mins[0] <= mins[1];
    if (!(okM && ok1 && okA && okT)) pass = false;
    o.push(`${name} ${g}: exam diff mean ${f1(100 * mean(d))} worst 5/1% ${f1(100 * qLow(d, 0.05))}/${f1(100 * qLow(d, 0.01))} pts; newly under 0.70: ${under}; minutes ${f1(mins[0])} against ${f1(mins[1])} ${okM && ok1 && okA && okT ? 'pass' : 'FAIL'}`);
  }
  if (main) {
    let inv = 0; let pairs = 0;
    for (const r of rows) for (let i = 0; i + 1 < HORIZON_GOALS.length; i++) { pairs++; if (r.goals[HORIZON_GOALS[i]].expand.min > r.goals[HORIZON_GOALS[i + 1]].expand.min + 0.01) inv++; }
    o.push(`${name} lower goal slower than the next: ${inv} of ${pairs} ${inv === 0 ? 'pass' : 'FAIL'}`);
    if (inv) pass = false;
  }
  o.push(`${name}: ${pass ? 'PASS' : 'FAIL'}`);
  return o;
}

const argv = process.argv.slice(2);
if (argv[0] === '--gate') {
  const mainFiles = []; const variants = [];
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--variant') { const [n, f] = argv[++i].split('='); variants.push([n, f]); } else mainFiles.push(argv[i]);
  }
  const lines = gateLines(load(mainFiles), 'main', true);
  for (const [n, f] of variants) lines.push(...gateLines(load([f]), n, false));
  console.log(lines.join('\n'));
} else {
  console.log(report(load(argv)));
}
