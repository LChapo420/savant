#!/usr/bin/env node
/**
 * The 4x measure against how people really study (docs/SPEED-4X.md, round 3; SIMULATED). Every baseline side by side, never only the favourable one.
 *   node scripts/speed-real-report.js BASE_DIR ARMS_DIR [--arms=label=spec,...] [--json=FILE]
 * BASE_DIR: base-design.json, base-h1.json, base-h2.json, base-h3.json (faster-by-goal-sim --students=1). The design seed only picks each baseline's fixed plan.
 * ARMS_DIR: JSON files named FRAME-SEED-NAME from runs with --quick=1 on the same held-out seeds, same flags; each label=spec is looked up in any file for that seed.
 *
 * Measure 1, to a fixed target: hours until recall of the whole course on the day is at least 0.70 (the arm must also have every skill truly understood). A baseline that misses is never a win: counted as "baseline misses", left out of the ratio.
 * Measure 2, equal or more retention (the owner's wording): the baseline does its usual habit, fixed in advance. Ratio = its hours / the arm's hours, counted as a win only when the arm's recall on the day is at least the baseline's.
 *   Here a baseline's low retention is what it really gets, so this is the fairer reading of "at least 4x faster with equal or more retention than studying".
 */
const fs = require('fs');
const path = require('path');

const pos = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flag = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const m = a.match(/^--([^=]+)=?(.*)$/); return [m[1], m[2]]; }));
const [BASE, ARMS] = pos;
const load = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const PRE = flag.prefix || 'base-'; // --prefix=cost- reads cost-design.json and --held=h1 reads cost-h1.json
const D = load(path.join(BASE, `${PRE}design.json`));
const Hs = (flag.held || 'h1,h2,h3').split(',').map((h) => load(path.join(BASE, `${PRE}${h}.json`)));
const armFiles = fs.readdirSync(ARMS).filter((f) => f.endsWith('.json') && (!flag.match || f.includes(flag.match)));
const specs = (flag.arms || '').split(';').filter(Boolean).map((s) => { const i = s.indexOf('='); return { label: s.slice(0, i), spec: s.slice(i + 1) }; });
const armData = armFiles.map((f) => ({ f, d: load(path.join(ARMS, f)) }));
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
const q = (a, p) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.floor(p * (s.length - 1))]; };
const f = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : 'n/a');
const pct = (x) => `${(100 * x).toFixed(0)}%`;
const strict = (a) => !!(a && a.pass && a.understood === 1);
const goals = Object.keys(Hs[0].rows[0].goals);

/** A fixed plan per goal, design seed only: the fewest passes reaching 95%, else the highest share. */
function pick(goal, getTab) {
  const tab0 = getTab(D.rows[0].goals[goal]);
  let best = null;
  for (let i = 0; i < tab0.length; i++) {
    const share = mean(D.rows.map((r) => (getTab(r.goals[goal])[i].pass ? 1 : 0)));
    if (share >= 0.95) return { i, n: tab0[i].n, share };
    if (!best || share > best.share) best = { i, n: tab0[i].n, share };
  }
  return best;
}
function pickR(goal, key) {
  const rs = Object.keys(D.rows[0].goals[goal][key] || {}).map(Number).sort((a, b) => b - a);
  let best = null;
  for (const r of rs) {
    const share = mean(D.rows.map((x) => (x.goals[goal][key][r].pass ? 1 : 0)));
    if (share >= 0.95) return { r, share };
    if (!best || share > best.share) best = { r, share };
  }
  return best;
}
const plans = {
  'careful: self-study, wide schedule reaching 95%': { kind: 'r', key: 'self_r' },
  'careful: dense self-study': { kind: 'cell', get: (c) => c.self_sr2 },
  'typical student: reread, some problems, cram rereads': { kind: 'tab', get: (c) => c.students.mix },
  'rereader: read, reread, cram rereads': { kind: 'tab', get: (c) => c.students.reread },
  'rereader spaced, widest schedule reaching 95%': { kind: 'r', key: 'reread_sr' },
  'massed problems: read, 5 problems, cram problems': { kind: 'tab', get: (c) => c.students.massed },
  'tutor d = 0.37 (Nickow et al. 2020)': { kind: 'tab', get: (c) => c.tutorD.d037 },
  'tutor d = 0.79 (VanLehn 2011)': { kind: 'tab', get: (c) => c.tutorD.d079 },
  'tutor ceiling (old guess: 1.8x, half pages)': { kind: 'tab', get: (c) => c.tabs.tutor_bloom },
};
const planFor = (name, goal) => {
  const p = plans[name];
  if (p.kind === 'cell') return { label: '', get: p.get };
  if (p.kind === 'r') { const r = pickR(goal, p.key); return { label: `r ${r.r}, design ${pct(r.share)}`, get: (c) => c[p.key][r.r] }; }
  const n = pick(goal, p.get); return { label: `N ${n.n}, design ${pct(n.share)}`, get: (c) => p.get(c)[n.i] };
};
// the habit for measure 2, fixed in advance: about one full reread pass before the test (5 days at the daily minutes), no more
const HABIT_N = Number(flag.habit || 5);
const habits = { 'typical student': (c) => c.students.mix, rereader: (c) => c.students.reread, 'massed problems': (c) => c.students.massed };
const habit = (c, get) => get(c).find((x) => x.n === HABIT_N);

function armRows(spec, goal, seedIdx) {
  const seed = Hs[seedIdx].seed;
  for (const { d } of armData) if (d.seed === seed && d.rows[0].goals[goal].speed && d.rows[0].goals[goal].speed[spec]) return d.rows.map((r) => r.goals[goal].speed[spec]);
  if (spec === 'today') { for (const { d } of armData) if (d.seed === seed && d.rows[0].goals[goal].savant) return d.rows.map((r) => r.goals[goal].savant); }
  return null;
}
const lines = [`SIMULATED. Held-out seeds ${Hs.map((h) => h.seed).join(', ')}: ${Hs.reduce((s, h) => s + h.rows.length, 0)} learners (3 in 4 extreme). Design seed ${D.seed} picks each baseline's plan. Read half-life ${Hs[0].read_h} d.`];
const out = { simulated: true, goals: {} };
const ALL_ARMS = [{ label: 'today (audited: stops on true understanding, no app can)', spec: 'today' }, ...specs];
for (const g of goals) {
  const cells = Hs.flatMap((h) => h.rows.map((r) => r.goals[g]));
  const kinds = Hs.flatMap((h) => h.rows.map((r) => r.kind));
  const arms = ALL_ARMS.map((a) => { const rows = Hs.map((_, i) => armRows(a.spec, g, i)); return { ...a, rows: rows.every(Boolean) ? rows.flat() : null }; }).filter((a) => a.rows);
  out.goals[g] = { arms: {}, baselines: {}, habits: {} };
  lines.push(`\n=== ${g}`);
  for (const a of arms) { lines.push(`  arm ${a.label}: ${f(mean(a.rows.map((x) => x.hours)), 1)} h, recall ${f(mean(a.rows.map((x) => x.recall)))}, reach+all understood ${pct(mean(a.rows.map((x) => (strict(x) ? 1 : 0))))}`); out.goals[g].arms[a.label] = { hours: mean(a.rows.map((x) => x.hours)), recall: mean(a.rows.map((x) => x.recall)), strict: mean(a.rows.map((x) => (strict(x) ? 1 : 0))) }; }
  lines.push(' measure 1 (to 0.70): baseline h, reach | per arm: x mean / median / worst 10, 5, 1% (n), at 4x, baseline misses');
  for (const name of Object.keys(plans)) {
    const pl = planFor(name, g); const bs = cells.map(pl.get);
    const B = { hours: mean(bs.map((b) => b.hours)), reach: mean(bs.map((b) => (b.pass ? 1 : 0))), plan: pl.label, arms: {} };
    lines.push(`  ${name} [${pl.label}]: ${f(B.hours, 1)} h, reach ${pct(B.reach)}`);
    for (const a of arms) {
      const rat = a.rows.map((x, i) => (strict(x) && bs[i].pass ? bs[i].hours / x.hours : null)).filter((v) => v !== null);
      const misses = a.rows.filter((x, i) => strict(x) && !bs[i].pass).length;
      const r = { mean: mean(rat), median: q(rat, 0.5), w10: q(rat, 0.1), w5: q(rat, 0.05), w1: q(rat, 0.01), n: rat.length, at4x: rat.filter((v) => v >= 4).length, baselineMisses: misses };
      B.arms[a.label] = r;
      lines.push(`     ${a.label.slice(0, 30).padEnd(30)} x${f(r.mean)} / ${f(r.median)} / ${f(r.w10)}, ${f(r.w5)}, ${f(r.w1)} (n ${r.n}), at 4x ${r.at4x}, baseline misses ${r.baselineMisses}`);
    }
    out.goals[g].baselines[name] = B;
  }
  lines.push(` measure 2 (equal or more retention than the habit: ${HABIT_N} days of work before the test): habit h, its recall | x mean / median / worst 10, 5, 1%, arm below the habit's recall, at 4x`);
  for (const [name, get] of Object.entries(habits)) {
    const bs = cells.map((c) => habit(c, get));
    const H = { hours: mean(bs.map((b) => b.hours)), recall: mean(bs.map((b) => b.recall)), arms: {} };
    lines.push(`  ${name}: ${f(H.hours, 1)} h, recall on the day ${f(H.recall)}`);
    for (const a of arms) {
      const all = a.rows.map((x, i) => ({ r: bs[i].hours / x.hours, ok: x.recall >= bs[i].recall && x.understood === 1, kind: kinds[i] }));
      const rat = all.filter((z) => z.ok).map((z) => z.r); const below = all.filter((z) => !z.ok).length;
      const r = { mean: mean(rat), median: q(rat, 0.5), w10: q(rat, 0.1), w5: q(rat, 0.05), w1: q(rat, 0.01), n: rat.length, below, at4x: rat.filter((v) => v >= 4).length };
      H.arms[a.label] = r;
      lines.push(`     ${a.label.slice(0, 30).padEnd(30)} x${f(r.mean)} / ${f(r.median)} / ${f(r.w10)}, ${f(r.w5)}, ${f(r.w1)}, below ${below} of ${all.length}, at 4x ${r.at4x}`);
    }
    out.goals[g].habits[name] = H;
  }
}
console.log(lines.join('\n'));
if (flag.json) fs.writeFileSync(flag.json, JSON.stringify(out));
