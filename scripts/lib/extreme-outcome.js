/**
 * Learning outcome of the extreme learners, SIMULATED (docs/EXTREME-LEARNERS.md section 3).
 *
 *   node scripts/scorecard-recovery-sim.js --extreme=1 --extreme-share=1 --learning=v2 --levels=100 --modes=off --seed=S --learners=N --only=... --write --out DIR --name NAME
 *   twice on the same seed and learners:
 *     base      --levers=none --review-pick=fixed    the old fixed review ladder
 *     tailored  --levers=stop                        the shipped per-learner schedule (model-based half-lives, extra spaced retrieval of what is due)
 *   node scripts/extreme-learners.js outcome --base 'DIR/b*.json' --tailored 'DIR/t*.json' [--out FILE.json] [--md FILE.md]
 *
 * The sim models what a learner knows and recalls (true memory, Rasch answers, forgetting), so this measures the review and practice schedule being tailored to each learner's own
 * memory and pace. It has no outcome model for tailored lesson TEXT (scripts/scorecard-recovery-sim.js says so): the text tailoring of section 2 is judged, not simulated.
 */
const fs = require('fs');
const path = require('path');
const X = require('./extreme-learners');

const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : 'n/a');
const learnerOf = (id) => { const [, seed, idx] = /^x(\d+)-(\d+)$/.exec(id); return X.learner(Number(seed), Number(idx)); };

/** A spec is DIR/prefix*.json: every file in DIR whose name starts with prefix. */
function files(spec) {
  const dir = path.dirname(spec); const pre = path.basename(spec).split('*')[0];
  return fs.readdirSync(dir).filter((f) => f.startsWith(pre) && f.endsWith('.json')).map((f) => path.join(dir, f));
}
function load(spec) {
  const rows = [];
  for (const f of files(spec)) {
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    const r = j.results || j; const mode = Object.keys(r)[0];
    for (const o of ((r[mode] || r).learner_outcomes || [])) if (o.ext_id) rows.push(o);
  }
  return new Map(rows.map((o) => [o.ext_id, o]));
}
/** Distribution where HIGHER is better: mean, median, mean of the worst 10/5/1%, min, max. */
function dd(vals) {
  const v = vals.slice().sort((a, b) => a - b); const n = v.length;
  const w = (q) => mean(v.slice(0, Math.max(1, Math.ceil(n * q))));
  return { n, mean: mean(v), median: v[Math.floor(n / 2)], worst10: w(0.1), worst5: w(0.05), worst1: w(0.01), min: v[0], max: v[n - 1] };
}
const cor = (xs, ys) => { const mx = mean(xs); const my = mean(ys); let sxy = 0; let sx = 0; let sy = 0; xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sx += (x - mx) ** 2; sy += (ys[i] - my) ** 2; }); return sxy / Math.sqrt(sx * sy || 1); };

function outcomeReport(arg) {
  const B = load(arg('base')); const T = load(arg('tailored'));
  const ids = [...B.keys()].filter((id) => T.has(id));
  const rows = ids.map((id) => {
    const b = B.get(id); const t = T.get(id); const L = learnerOf(id);
    const ok = b.retained30_per_hour > 0 && t.retained30_per_hour !== null;
    return {
      id, kind: L.kind, mix: L.mixLabel, age: L.age, band: L.band, tails: Object.keys(X.tailsOf(L)).length,
      ratio: ok ? t.retained30_per_hour / b.retained30_per_hour : null,
      mph: b.mastered_k > 0 && b.practice_hours > 0 && t.practice_hours > 0 ? (t.mastered_k / t.practice_hours) / (b.mastered_k / b.practice_hours) : null,
      r30: [b.retention30, t.retention30], r7: [b.retention7, t.retention7], hours: [b.practice_hours, t.practice_hours], mastered: [b.mastered_k, t.mastered_k],
    };
  }).filter((r) => r.ratio !== null);
  const group = (key) => { const m = {}; for (const r of rows) (m[r[key]] = m[r[key]] || []).push(r); return Object.fromEntries(Object.entries(m).map(([k, rs]) => [k, { n: rs.length, mean: mean(rs.map((r) => r.ratio)), min: Math.min(...rs.map((r) => r.ratio)) }])); };
  const res = {
    label: 'SIMULATED (recovery sim, audited learning model v2, 100 levels, extreme learners); the sim has no outcome model for tailored lesson text',
    n: rows.length, ratio: dd(rows.map((r) => r.ratio)), mph: dd(rows.filter((r) => r.mph !== null).map((r) => r.mph)),
    r30: [mean(rows.map((r) => r.r30[0])), mean(rows.map((r) => r.r30[1]))], r7: [mean(rows.map((r) => r.r7[0])), mean(rows.map((r) => r.r7[1]))],
    hours: [mean(rows.map((r) => r.hours[0])), mean(rows.map((r) => r.hours[1]))], mastered: [mean(rows.map((r) => r.mastered[0])), mean(rows.map((r) => r.mastered[1]))],
    no_better: rows.filter((r) => r.ratio <= 1).map((r) => ({ id: r.id, kind: r.kind, mix: r.mix, age: r.age, ratio: r.ratio, tails: r.tails, hours: r.hours, r30: r.r30 })),
    mph_below_1: rows.filter((r) => r.mph !== null && r.mph < 1).length, r30_gain: dd(rows.map((r) => (r.r30[1] - r.r30[0]) * 100)), r30_gain_le0: rows.filter((r) => r.r30[1] <= r.r30[0]).length,
    below_2x: rows.filter((r) => r.ratio < 2).length, below_3x: rows.filter((r) => r.ratio < 3).length, byKind: group('kind'), byBand: group('band'),
  };
  res.top_correlates = X.IDS.map((id) => ({ id, r: cor(rows.map((r) => learnerOf(r.id).traits[id]), rows.map((r) => r.ratio)) })).sort((a, b) => Math.abs(b.r) - Math.abs(a.r)).slice(0, 8);
  res.worst = rows.slice().sort((a, b) => a.ratio - b.ratio).slice(0, 5).map((r) => ({ id: r.id, ratio: r.ratio, profile: X.describe(learnerOf(r.id)), r30: r.r30, hours: r.hours }));
  if (arg('out')) fs.writeFileSync(arg('out'), JSON.stringify(res, null, 1));
  const pc = (v) => `${(v * 100).toFixed(1)}%`;
  const o = [`## Simulated learning outcome, tailored schedule vs base ladder (${res.n} extreme learners; SIMULATED)`, '',
    `Skills recalled at 30 days per practice hour, tailored / base: mean ${f1(res.ratio.mean)}x, median ${f1(res.ratio.median)}x, worst 10% ${f1(res.ratio.worst10)}x, worst 5% ${f1(res.ratio.worst5)}x, worst 1% ${f1(res.ratio.worst1)}x, worst ${f1(res.ratio.min)}x, best ${f1(res.ratio.max)}x. Learners at or below 1.0x: ${res.no_better.length}; below 2x: ${res.below_2x}; below 3x: ${res.below_3x}.`,
    `Skills understood (k >= 0.85) per practice hour, tailored / base: mean ${f1(res.mph.mean)}x, median ${f1(res.mph.median)}x, worst 10% ${f1(res.mph.worst10)}x, worst 1% ${f1(res.mph.worst1)}x, worst ${f1(res.mph.min)}x.`,
    `Learners whose skills understood per practice hour is below the base's: ${res.mph_below_1} of ${res.n}. Gain in 30-day recall, percentage points (tailored minus base): mean ${f1(res.r30_gain.mean)}, median ${f1(res.r30_gain.median)}, worst 10% ${f1(res.r30_gain.worst10)}, worst 1% ${f1(res.r30_gain.worst1)}, worst ${f1(res.r30_gain.min)}; learners with no gain: ${res.r30_gain_le0}.`,
    `Mean recall at 30 days: base ${pc(res.r30[0])} -> tailored ${pc(res.r30[1])}; at 7 days ${pc(res.r7[0])} -> ${pc(res.r7[1])}; practice hours ${f1(res.hours[0])} -> ${f1(res.hours[1])}; skills understood ${f1(res.mastered[0])} -> ${f1(res.mastered[1])}.`,
    '', 'By kind (mean ratio, worst):', ...Object.entries(res.byKind).map(([k, v]) => `- ${k} (n ${v.n}): ${f1(v.mean)}x, worst ${f1(v.min)}x`),
    '', `By age band: ${Object.entries(res.byBand).map(([k, v]) => `${k} (n ${v.n}) ${f1(v.mean)}x worst ${f1(v.min)}x`).join('; ')}`,
    '', `True traits that go with the ratio (correlation): ${res.top_correlates.map((c) => `${c.id} ${c.r.toFixed(2)}`).join(', ')}`,
    '', 'Worst five:', ...res.worst.map((w) => `- ${w.id}: ${f1(w.ratio)}x (30-day recall ${pc(w.r30[0])} -> ${pc(w.r30[1])}; hours ${f1(w.hours[0])} -> ${f1(w.hours[1])}). ${w.profile}`)];
  console.log(o.join('\n'));
  if (arg('md')) fs.writeFileSync(arg('md'), o.join('\n'));
}

module.exports = { outcomeReport, load, dd };
