/**
 * Extreme, randomly generated SIMULATED learners (docs/EXTREME-LEARNERS.md). Generator: scripts/lib/extreme-learners.js. Everything here is simulated; real testers are the proof.
 *
 *   node scripts/extreme-learners.js gen --seed 424242 --n 20                 print learners (profile lines)
 *   node scripts/extreme-learners.js scorecard --pl30 FILE [--pl180 FILE] [--out FILE.json] [--md FILE.md]
 *        per-INDIVIDUAL scorecard accuracy of the extreme learners (mean, worst 10/5/1%, the worst learner's profile), with the guess baseline and share of error
 *        removed, by kind and by tail. FILE is --per-learner output of scripts/scorecard-90-measure.js on dumps from scripts/scorecard-recovery-sim.js --extreme=1
 *        (calibrated on ordinary learners, scored on held-out extreme ones; see the doc for the commands).
 *   node scripts/extreme-learners.js tailor ...   (see tailor section)     node scripts/extreme-learners.js outcome ...   (see outcome section)
 */
const fs = require('fs');
const X = require('./lib/extreme-learners');

const argv = process.argv.slice(2);
const cmd = argv[0];
const arg = (n, d = null) => { const eq = argv.find((a) => a.startsWith(`--${n}=`)); if (eq) return eq.slice(n.length + 3); const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : 'n/a');

/** Distribution of per-individual values where higher is better: mean, mean of the worst 10/5/1% of individuals, and the single worst. */
function dist(vals) {
  const v = vals.slice().sort((a, b) => a - b); const n = v.length;
  const worst = (q) => mean(v.slice(0, Math.max(1, Math.ceil(n * q))));
  return { n, mean: mean(v), worst10: worst(0.1), worst5: worst(0.05), worst1: worst(0.01), min: v[0], p10cut: v[Math.floor(n * 0.1)] };
}

function scorecardReport() {
  const out = { label: 'SIMULATED learners; calibrated on ordinary simulated learners, scored on held-out extreme ones', days: {} };
  const learnerOf = (e) => { const [, seed, idx] = /^x(\d+)-(\d+)$/.exec(e.id); return X.learner(Number(seed), Number(idx)); };
  for (const [day, file] of [['30', arg('pl30')], ['180', arg('pl180')]]) {
    if (!file || !fs.existsSync(file)) continue;
    const all = JSON.parse(fs.readFileSync(file, 'utf8'));
    const ex = all.filter((x) => x.ext).map((x) => ({ ...x, L: learnerOf(x.ext) }));
    const ord = all.filter((x) => !x.ext);
    const accOf = (rows, st) => rows.map((r) => 100 - r[st]);
    const stage = {};
    for (const st of ['D0', 'S0', 'S1', 'S5']) {
      const d = dist(accOf(ex, st));
      const gb = mean(ex.map((r) => r.GB)); const er = mean(ex.map((r) => r[st]));
      // share of error removed per individual (1 - own error / own guess-baseline error), the distribution where a low value is bad
      const rem = dist(ex.map((r) => 1 - r[st] / r.GB));
      stage[st] = { ...d, guess_acc: 100 - gb, removed: 1 - er / gb, removed_worst10: rem.worst10, removed_worst1: rem.worst1, removed_min: rem.min, ordinary_acc: ordinary(ord, st) };
    }
    function ordinary(rows, st) { return rows.length ? mean(accOf(rows, st)) : null; }
    // by kind
    const kinds = [...new Set(ex.map((r) => r.ext.kind))];
    const byKind = {};
    for (const k of kinds) {
      const rows = ex.filter((r) => r.ext.kind === k);
      byKind[k] = { n: rows.length, acc_S5: mean(accOf(rows, 'S5')), acc_S1: mean(accOf(rows, 'S1')), acc_S0: mean(accOf(rows, 'S0')), guess: mean(accOf(rows, 'GB')), removed_S5: 1 - mean(rows.map((r) => r.S5)) / mean(rows.map((r) => r.GB)), worst_S5: Math.min(...accOf(rows, 'S5')) };
    }
    const mixes = {};
    for (const r of ex.filter((x) => x.ext.mix)) { (mixes[r.ext.mix] = mixes[r.ext.mix] || []).push(r); }
    const byMix = Object.fromEntries(Object.entries(mixes).map(([k, rows]) => [k, { n: rows.length, acc_S5: mean(accOf(rows, 'S5')), guess: mean(accOf(rows, 'GB')), removed_S5: 1 - mean(rows.map((r) => r.S5)) / mean(rows.map((r) => r.GB)) }]));
    // tail measures vs the rest, per measure error (S5 and the guess baseline), the "why"
    const IDS = X.IDS; const tail = { S5: [], S1: [], GB: [] }; const rest = { S5: [], S1: [], GB: [] };
    const perMeasureTail = {}; // id -> {sumS5, sumGB, n}
    for (const r of ex) {
      IDS.forEach((id, k) => {
        const v = r.L.traits[id]; const inTail = v >= 90 || v <= 10;
        for (const st of ['S5', 'S1', 'GB']) (inTail ? tail : rest)[st].push(r.e[st][k]);
        if (inTail) { const m = (perMeasureTail[id] = perMeasureTail[id] || { s5: 0, gb: 0, n: 0 }); m.s5 += r.e.S5[k]; m.gb += r.e.GB[k]; m.n += 1; }
      });
    }
    const tails = { tail_measures: tail.S5.length, tail_S5_mae: mean(tail.S5), rest_S5_mae: mean(rest.S5), tail_S1_mae: mean(tail.S1), rest_S1_mae: mean(rest.S1), tail_guess_mae: mean(tail.GB), rest_guess_mae: mean(rest.GB) };
    const worstMeasures = Object.entries(perMeasureTail).filter(([, m]) => m.n >= 6).map(([id, m]) => ({ id, n: m.n, s5: m.s5 / m.n, gb: m.gb / m.n })).sort((a, b) => b.s5 - a.s5).slice(0, 8);
    // error by number of tail traits (a learner with many tails is further from the population the read-out was fitted on)
    const buckets = { '0-3': [], '4-9': [], '10-30': [], '31+': [] };
    for (const r of ex) { const t = Object.keys(X.tailsOf(r.L)).length; (t <= 3 ? buckets['0-3'] : t <= 9 ? buckets['4-9'] : t <= 30 ? buckets['10-30'] : buckets['31+']).push(r); }
    const byTails = Object.fromEntries(Object.entries(buckets).filter(([, v]) => v.length).map(([k, rows]) => [k, { n: rows.length, acc_S5: mean(accOf(rows, 'S5')), guess: mean(accOf(rows, 'GB')), removed: 1 - mean(rows.map((r) => r.S5)) / mean(rows.map((r) => r.GB)) }]));
    // the worst individuals at S5
    const sorted = ex.slice().sort((a, b) => b.S5 - a.S5);
    const worst = sorted.slice(0, 5).map((r) => ({ id: r.ext.id, acc_S5: 100 - r.S5, guess: 100 - r.GB, removed: 1 - r.S5 / r.GB, profile: X.describe(r.L), worst_measures: r.worst_measures }));
    // an individual that the app made WORSE than guessing the pooled mean
    const worseThanGuess = ex.filter((r) => r.S5 > r.GB).map((r) => ({ id: r.ext.id, kind: r.ext.kind, S5_acc: 100 - r.S5, guess: 100 - r.GB }));
    const ageBands = {};
    for (const r of ex) { const b = r.L.band; (ageBands[b] = ageBands[b] || []).push(r); }
    const byAge = Object.fromEntries(Object.entries(ageBands).map(([b, rows]) => [b, { n: rows.length, acc_S5: mean(accOf(rows, 'S5')), guess: mean(accOf(rows, 'GB')), removed: 1 - mean(rows.map((r) => r.S5)) / mean(rows.map((r) => r.GB)) }]));
    out.days[day] = { n_extreme: ex.length, n_ordinary: ord.length, stage, byKind, byMix, tails, worstMeasures, byTails, byAge, worst, worseThanGuess };
  }
  if (arg('out')) fs.writeFileSync(arg('out'), JSON.stringify(out, null, 1));
  const lines = [];
  for (const [day, r] of Object.entries(out.days)) {
    lines.push(`## Scorecard accuracy at day ${day} (SIMULATED), ${r.n_extreme} extreme learners (held out), ${r.n_ordinary} ordinary alongside`);
    lines.push('', '| stage | mean acc | worst 10% | worst 5% | worst 1% | worst one | guess baseline | share of error removed | removed, worst 10% | ordinary learners acc |', '|---|---|---|---|---|---|---|---|---|---|');
    const name = { D0: 'day 0 (prior only)', S0: 'the app as it is', S1: 'recalibrated read', S5: 'designed plan (6.3 min/day)' };
    for (const st of ['D0', 'S0', 'S1', 'S5']) { const s = r.stage[st]; lines.push(`| ${name[st]} | ${f1(s.mean)} | ${f1(s.worst10)} | ${f1(s.worst5)} | ${f1(s.worst1)} | ${f1(s.min)} | ${f1(s.guess_acc)} | ${(s.removed * 100).toFixed(0)}% | ${(s.removed_worst10 * 100).toFixed(0)}% | ${s.ordinary_acc === null ? 'n/a' : f1(s.ordinary_acc)} |`); }
    lines.push('', 'By kind (S5 accuracy, guess baseline, share of error removed, worst individual):', '', '| kind | n | S0 | S1 | S5 | guess | removed (S5) | worst |', '|---|---|---|---|---|---|---|---|');
    for (const [k, v] of Object.entries(r.byKind)) lines.push(`| ${k} | ${v.n} | ${f1(v.acc_S0)} | ${f1(v.acc_S1)} | ${f1(v.acc_S5)} | ${f1(v.guess)} | ${(v.removed_S5 * 100).toFixed(0)}% | ${f1(v.worst_S5)} |`);
    lines.push('', 'Contradictory mixes (S5):', '', '| mix | n | S5 acc | guess | removed |', '|---|---|---|---|---|');
    for (const [k, v] of Object.entries(r.byMix)) lines.push(`| ${X.MIXES[k].label} | ${v.n} | ${f1(v.acc_S5)} | ${f1(v.guess)} | ${(v.removed_S5 * 100).toFixed(0)}% |`);
    lines.push('', 'By age band (S5):', '', '| band | n | S5 acc | guess | removed |', '|---|---|---|---|---|');
    for (const [k, v] of Object.entries(r.byAge)) lines.push(`| ${k} | ${v.n} | ${f1(v.acc_S5)} | ${f1(v.guess)} | ${(v.removed * 100).toFixed(0)}% |`);
    lines.push('', `Why: the measures that sit in a tail (<=10 or >=90; ${r.tails.tail_measures} learner-measures) have S5 MAE ${f1(r.tails.tail_S5_mae)} (guess ${f1(r.tails.tail_guess_mae)}); the rest ${f1(r.tails.rest_S5_mae)} (guess ${f1(r.tails.rest_guess_mae)}).`);
    lines.push('', 'By number of tail traits (S5):', '', '| tails | n | S5 acc | guess | removed |', '|---|---|---|---|---|');
    for (const [k, v] of Object.entries(r.byTails)) lines.push(`| ${k} | ${v.n} | ${f1(v.acc_S5)} | ${f1(v.guess)} | ${(v.removed * 100).toFixed(0)}% |`);
    lines.push('', 'Measures with the largest S5 error when the learner is at that tail (n>=6): ' + r.worstMeasures.map((m) => `${m.id} ${f1(m.s5)} (guess ${f1(m.gb)}, n ${m.n})`).join('; '));
    lines.push('', `Individuals worse than the pooled-mean guess at S5: ${r.worseThanGuess.length} of ${r.n_extreme}.`, '', 'Worst five individuals at S5:');
    for (const w of r.worst) lines.push(`- ${w.id}: accuracy ${f1(w.acc_S5)} (guess ${f1(w.guess)}, removed ${(w.removed * 100).toFixed(0)}%). ${w.profile}. Largest errors: ${w.worst_measures.map((m) => `${m[0]} ${m[1]}`).join(', ')}`);
    lines.push('');
  }
  if (arg('md')) fs.writeFileSync(arg('md'), lines.join('\n'));
  console.log(lines.join('\n'));
}

if (cmd === 'gen') {
  const seed = Number(arg('seed', 424242)); const n = Number(arg('n', 20));
  for (const L of X.generate(seed, n)) console.log(X.describe(L));
} else if (cmd === 'scorecard') {
  scorecardReport();
} else if (cmd === 'outcome') {
  require('./lib/extreme-outcome').outcomeReport(arg);
} else if (cmd === 'tailor') {
  require('./lib/extreme-tailor').tailor(arg).catch((e) => { console.error(e); process.exit(1); });
} else if (cmd === 'tailor-summary') {
  const T = require('./lib/extreme-tailor'); const m = T.mergeRuns(arg('json').split(',')); console.log(T.tailorSummary(m)); if (arg('table')) fs.writeFileSync(arg('table'), T.tailorTable(m));
} else if (require.main === module) {
  console.error('usage: gen | scorecard | tailor | outcome (see the header)');
  process.exit(2);
}
module.exports = { dist, mean };
