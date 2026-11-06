#!/usr/bin/env node
/**
 * The 4x measure (docs/SPEED-4X.md; SIMULATED): hours until all material is understood AND recall at the chosen horizon meets the same target.
 *   node scripts/speed-4x-report.js DESIGN.json HELD.json RULE.json [--arms=safe,end] [--json=OUT.json]
 * DESIGN: faster-by-goal-sim output on the design seed. It only picks the baselines' fixed plans (never looked at for the speed arms' result).
 * HELD: the same on the held-out seed. RULE: a --quick run on the held-out seed with the round 3 rule on (--finish=1 --jit=1 --final=1).
 * A baseline that misses the target is not a win: those learners are counted as "baseline misses" and left out of the ratio. A speed arm's failure is reported, never dropped.
 */
const fs = require('fs');

const pos = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flag = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const m = a.match(/^--([^=]+)=?(.*)$/); return [m[1], m[2]]; }));
const [D, H, R] = pos.slice(0, 3).map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
const ARMS = (flag.arms || 'safe,end').split(',');
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);
const q = (xs, p) => { if (!xs.length) return NaN; const a = xs.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };
const f = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : 'n/a');
const pct = (x) => `${(100 * x).toFixed(0)}%`;
const goals = Object.keys(H.rows[0].goals);

/** A fixed plan per goal, chosen on the design seed only: the fewest passes (or widest schedule) reaching 95%, else the highest share. Never per learner. */
function pickN(goal, tab) {
  const steps = D.rows[0].goals[goal].tabs[tab].map((x) => x.n);
  let best = null;
  for (let i = 0; i < steps.length; i++) {
    const share = mean(D.rows.map((r) => (r.goals[goal].tabs[tab][i].pass ? 1 : 0)));
    if (share >= 0.95) return { n: steps[i], i, share };
    if (!best || share > best.share) best = { n: steps[i], i, share };
  }
  return best;
}
function pickR(goal) {
  const rs = Object.keys(D.rows[0].goals[goal].self_r || {}).map(Number).sort((a, b) => b - a); // widest first
  let best = null;
  for (const r of rs) {
    const share = mean(D.rows.map((x) => (x.goals[goal].self_r[r].pass ? 1 : 0)));
    if (share >= 0.95) return { r, share };
    if (!best || share > best.share) best = { r, share };
  }
  return best;
}
const BASE = {
  'dense self-study': (c) => c.self_sr2,
  'sparse self-study': (c) => c.self_sr,
  'self-study at 95% (design pick)': (c, g) => { const p = pickR(g); return p ? c.self_r[p.r] : null; },
  'normal, fixed N': (c, g) => c.tabs.normal[pickN(g, 'normal').i],
  'typical tutor, fixed N': (c, g) => c.tabs.tutor[pickN(g, 'tutor').i],
};
/** Strict: covered, recall at the day at the target, and every one of the skills truly understood (a real stop rule can leave a skill short; the old oracle stop could not). */
const strict = (a) => !!(a && a.pass && a.understood === 1);
const rows = H.rows;
const ruleRow = R ? new Map(R.rows.map((r) => [r.id, r])) : new Map();
const out = { simulated: true, seed: H.seed, n: rows.length, variant: { kloss: H.kloss, forget: H.forget, lesson: H.lesson, cold_gain: H.cold_gain, skip_loss: H.skip_loss, est_gain: H.est_gain, guess: H.guess, review_s: H.review_s, review_s_all: H.review_s_all, implicit: H.implicit, speed_gain: H.speed_gain }, goals: {}, gate: {} };
const lines = [`SIMULATED. Held-out seed ${H.seed}, ${rows.length} learners. Variant: ${JSON.stringify(out.variant)}`];
const fails = {};
for (const arm of ARMS) fails[arm] = [];

for (const g of goals) {
  const cells = rows.map((r) => r.goals[g]);
  const G = { arms: {}, baselines: {} };
  lines.push(`\n=== ${g}`);
  const today = cells.map((c) => c.savant);
  const todayShare = mean(today.map((a) => (a.pass ? 1 : 0)));
  const rule = rows.map((r) => (ruleRow.get(r.id) ? ruleRow.get(r.id).goals[g].savant : null));
  const ruleShare = rule[0] ? mean(rule.map((a) => (a.pass ? 1 : 0))) : NaN;
  lines.push(`before 5 Nov ${f(mean(today.map((a) => a.hours)), 1)} h, reach ${pct(todayShare)} (L ${f(mean(today.map((a) => a.by.lesson)), 1)} P ${f(mean(today.map((a) => a.by.practice)), 1)} R ${f(mean(today.map((a) => a.by.review)), 1)}), recall ${f(mean(today.map((a) => a.recall)))}${rule[0] ? ` | TODAY (round 3 rule, on by default) ${f(mean(rule.map((a) => a.hours)), 1)} h (L ${f(mean(rule.map((a) => a.by.lesson)), 1)} P ${f(mean(rule.map((a) => a.by.practice)), 1)} R ${f(mean(rule.map((a) => a.by.review)), 1)}), reach ${pct(ruleShare)}, recall ${f(mean(rule.map((a) => a.recall)))}` : ''}`);
  // "today" for the gate: the round 3 rule, which has been on by default since 5 Nov 2026 (SR_GOAL_REVIEW). The old rule is printed beside it for the record.
  const comparator = rule[0] ? rule : today;
  for (const name of Object.keys(BASE)) {
    const bs = cells.map((c) => BASE[name](c, g));
    if (!bs[0]) continue;
    G.baselines[name] = { hours: mean(bs.map((b) => b.hours)), reach: mean(bs.map((b) => (b.pass ? 1 : 0))), recall: mean(bs.map((b) => b.recall)), keptMin: mean(bs.map((b) => (Number.isFinite(b.minRecall) ? b.minRecall : 0))) };
    lines.push(`  baseline ${name.padEnd(32)} ${f(G.baselines[name].hours, 1)} h, reach ${pct(G.baselines[name].reach)}, recall on the day ${f(G.baselines[name].recall)}, lowest recall during ${f(G.baselines[name].keptMin)}`);
  }
  for (const arm of ARMS) {
    const as = cells.map((c) => c.speed[arm]);
    const h = as.map((a) => a.hours);
    const A = { hours: mean(h), median: q(h, 0.5), w10: q(h, 0.9), w5: q(h, 0.95), w1: q(h, 0.99), lesson: mean(as.map((a) => a.by.lesson)), practice: mean(as.map((a) => a.by.practice)), review: mean(as.map((a) => a.by.review)), pages: mean(as.map((a) => a.pagesShown)), reach: mean(as.map((a) => (a.pass ? 1 : 0))), strict: mean(as.map((a) => (strict(a) ? 1 : 0))), understood: mean(as.map((a) => a.understood)), recall: mean(as.map((a) => a.recall)), keptMin: mean(as.map((a) => (Number.isFinite(a.minRecall) ? a.minRecall : 0))), ratios: {} };
    lines.push(`  ${arm}: ${f(A.hours, 1)} h (median ${f(A.median, 1)}, worst 10/5/1% ${f(A.w10, 1)}/${f(A.w5, 1)}/${f(A.w1, 1)}), L ${f(A.lesson, 1)} P ${f(A.practice, 1)} R ${f(A.review, 1)}, page share ${f(A.pages)}, reach ${pct(A.reach)}, reach+all understood ${pct(A.strict)}, skills understood ${f(100 * A.understood, 1)}%, recall on the day ${f(A.recall)}, lowest recall during ${f(A.keptMin)}`);
    // against each baseline
    for (const name of Object.keys(BASE)) {
      const bs = cells.map((c) => BASE[name](c, g));
      if (!bs[0]) continue;
      const pairs = as.map((a, i) => ({ a, b: bs[i], r: rows[i] })).filter((x) => strict(x.a) && x.b.pass);
      const rat = pairs.map((x) => x.b.hours / x.a.hours);
      const lo = rat.slice().sort((x, y) => x - y);
      const rr = { mean: mean(rat), median: q(rat, 0.5), w10: q(lo, 0.1), w5: q(lo, 0.05), w1: q(lo, 0.01), n: rat.length, baselineMisses: as.filter((a, i) => strict(a) && !bs[i].pass).length, armMisses: as.filter((a) => !strict(a)).length, at4x: rat.filter((x) => x >= 4).length };
      A.ratios[name] = rr;
      lines.push(`    x vs ${name.padEnd(32)} mean ${f(rr.mean)} median ${f(rr.median)} worst 10/5/1% ${f(rr.w10)}/${f(rr.w5)}/${f(rr.w1)} (n ${rr.n}; baseline misses ${rr.baselineMisses}, arm misses ${rr.armMisses}; at 4x: ${rr.at4x})`);
    }
    // by kind and age, against the dense self-study and today
    const groups = {};
    rows.forEach((r, i) => { for (const key of [`kind:${r.kind}`, `band:${r.band}`]) (groups[key] = groups[key] || []).push(i); });
    A.groups = {};
    for (const [key, idx] of Object.entries(groups)) {
      const dense = idx.filter((i) => strict(as[i]) && cells[i].self_sr2.pass).map((i) => cells[i].self_sr2.hours / as[i].hours);
      const tod = idx.map((i) => comparator[i].hours / as[i].hours);
      A.groups[key] = { n: idx.length, reachStrict: mean(idx.map((i) => (strict(as[i]) ? 1 : 0))), hours: mean(idx.map((i) => as[i].hours)), todayHours: mean(idx.map((i) => comparator[i].hours)), ratioDense: mean(dense), nDense: dense.length, ratioToday: mean(tod), worstToday: Math.min(...tod) };
    }
    lines.push(`    by group (hours, today's, ratio to today, worst learner, ratio to dense self-study, reach+understood):`);
    for (const [key, v] of Object.entries(A.groups)) lines.push(`      ${key.padEnd(18)} n ${String(v.n).padStart(3)} ${f(v.hours, 1)} h / ${f(v.todayHours, 1)} h  x${f(v.ratioToday)} worst x${f(v.worstToday)}  dense x${f(v.ratioDense)} (n ${v.nDense})  ${pct(v.reachStrict)}`);
    // the gate
    const perLearner = as.map((a, i) => comparator[i].hours / a.hours).sort((x, y) => x - y);
    A.today = { hours: mean(comparator.map((a) => a.hours)), ratioMean: mean(perLearner), ratioW10: q(perLearner, 0.1), ratioW1: q(perLearner, 0.01), slower: perLearner.filter((x) => x < 1).length };
    lines.push(`    vs today: ${f(A.today.hours, 1)} h, per-learner ratio mean ${f(A.today.ratioMean)} worst 10% ${f(A.today.ratioW10)} worst 1% ${f(A.today.ratioW1)}, slower for ${A.today.slower} of ${rows.length}`);
    if (A.strict < 1) fails[arm].push(`${g}: ${pct(A.strict)} reach the target with all understood`);
    if (A.today.ratioW10 < 1) fails[arm].push(`${g}: worst 10% x${f(A.today.ratioW10)} against today`);
    if (A.hours >= A.today.hours) fails[arm].push(`${g}: mean ${f(A.hours, 1)} h not under today's ${f(A.today.hours, 1)} h`);
    for (const [key, v] of Object.entries(A.groups)) if (v.hours >= v.todayHours) fails[arm].push(`${g}: ${key} ${f(v.hours, 1)} h not under ${f(v.todayHours, 1)} h`);
    G.arms[arm] = A;
  }
  out.goals[g] = G;
}
lines.push('\n=== GATE: every goal: all learners reach the target with all material understood, the worst 10% and every kind and age band faster than today');
for (const arm of ARMS) { out.gate[arm] = fails[arm]; lines.push(`${arm}: ${fails[arm].length ? `MISSED (${fails[arm].length}): ${fails[arm].slice(0, 12).join('; ')}${fails[arm].length > 12 ? ' ...' : ''}` : 'MET'}`); }
console.log(lines.join('\n'));
if (flag.json) fs.writeFileSync(flag.json, JSON.stringify(out));
