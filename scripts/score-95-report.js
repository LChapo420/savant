/**
 * Per-trait accuracy AND decision accuracy on a held-out dump (SIMULATED; docs/SCORE-95.md part 2). Never raw 100-minus-MAE alone: every row has the guess baseline, the share of error removed,
 * the sample size and the label.
 *   node scripts/score-95-report.js --cal=c-today-0.json,... --held=h-today-0.json,... [--json=out.json] [--md=out.md] [--traits=traits.md]
 * Estimates: S0 = the card as shipped; S1f = the read-out fitted on the calibration learners (held-out: never fitted on the learners it is scored on).
 * Accuracy = 100 - mean absolute error in points. Guess = the calibration mean of the truth for every learner.
 * Decision accuracy = services/scorecard/decisions.js (hard edge 30/70 and soft 40/60), against the "never lean" baseline (always the default) and the guess baseline.
 */
'use strict';
const fs = require('fs');
const R = require('../services/scorecard/readout');
const { ALL_FEATURES } = require('../services/scorecard/log-features');
const { STATS } = require('../services/scorecard/stats');
const { INDEX } = require('../services/scorecard/ceilings');
const D = require('../services/scorecard/decisions');

const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
const load = (spec) => spec.split(',').filter(Boolean).flatMap((f) => JSON.parse(fs.readFileSync(f, 'utf8')).learners);
const kindOf = (L) => (L.ext && L.ext.kind) || 'ordinary';
const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : 'n/a');

/** Everything the report says, from calibration and held-out learners. */
function analyse(cal, held) {
  const ids = STATS.map((s) => s.id).filter((id) => cal.every((L) => L.app[id] && L.truth[id] !== undefined) && held.every((L) => L.app[id] && L.truth[id] !== undefined));
  const models = {};
  for (const id of ids) models[id] = R.fitMeasure(cal.map((L) => ({ m: L.app[id][0], conf: L.app[id][2], feat: L.feat, y: L.truth[id] })), ALL_FEATURES);
  const read = (L, id) => R.readS1({ models, featNames: ALL_FEATURES }, id, { m: L.app[id][0], conf: L.app[id][2], feat: L.feat });
  const guessOf = Object.fromEntries(ids.map((id) => [id, mean(cal.map((L) => L.truth[id]))]));
  const est = { guess: (L, id) => guessOf[id], card: (L, id) => L.app[id][0], readout: (L, id) => read(L, id) };

  const perTrait = ids.map((id) => {
    const T = held.map((L) => L.truth[id]);
    const row = { id, group: STATS.find((s) => s.id === id).category, cls: INDEX[id], impact: STATS.find((s) => s.id === id).impact, n: held.length };
    for (const [k, f] of Object.entries(est)) {
      const E = held.map((L) => f(L, id));
      row[`mae_${k}`] = mean(E.map((e, i) => Math.abs(e - T[i])));
      row[`hard_${k}`] = D.decisionScore(E.map((e, i) => ({ est: e, truth: T[i] })), D.EDGES.hard);
      row[`soft_${k}`] = D.decisionScore(E.map((e, i) => ({ est: e, truth: T[i] })), D.EDGES.soft);
    }
    row.acc = Object.fromEntries(Object.keys(est).map((k) => [k, 100 - row[`mae_${k}`]]));
    row.removed = { card: 1 - row.mae_card / row.mae_guess, readout: 1 - row.mae_readout / row.mae_guess };
    row.neverLean = 100 * T.filter((t) => D.decide(t, D.EDGES.hard) === 0).length / T.length;
    return row;
  });

  const roll = (rows, name) => {
    const w = (f) => mean(rows.map(f));
    const m = (k) => 100 - w((r) => r[`mae_${k}`]);
    return {
      name, measures: rows.length, n: rows[0] ? rows[0].n : 0,
      acc: { guess: m('guess'), card: m('card'), readout: m('readout') },
      removed: { card: 1 - w((r) => r.mae_card) / w((r) => r.mae_guess), readout: 1 - w((r) => r.mae_readout) / w((r) => r.mae_guess) },
      decisionHard: { neverLean: w((r) => r.neverLean), guess: w((r) => r.hard_guess.accuracy), card: w((r) => r.hard_card.accuracy), readout: w((r) => r.hard_readout.accuracy), wrongWay: w((r) => r.hard_readout.wrongWay), caught: mean(rows.map((r) => r.hard_readout.caught).filter((v) => v !== null)), leanPrecision: mean(rows.map((r) => r.hard_readout.leanPrecision).filter((v) => v !== null)), leanSafe: mean(rows.map((r) => r.hard_readout.leanSafe).filter((v) => v !== null)), leans: w((r) => r.hard_readout.leans) },
      decisionSoft: { guess: w((r) => r.soft_guess.accuracy), card: w((r) => r.soft_card.accuracy), readout: w((r) => r.soft_readout.accuracy), wrongWay: w((r) => r.soft_readout.wrongWay) },
    };
  };
  const classes = [...new Set(perTrait.map((r) => r.cls))].map((c) => roll(perTrait.filter((r) => r.cls === c), c));
  const groups = [...new Set(perTrait.map((r) => r.group))].map((c) => roll(perTrait.filter((r) => r.group === c), c));
  const impactW = (rows, f) => { const s = rows.reduce((a, r) => a + r.impact, 0) || 1; return rows.reduce((a, r) => a + r.impact * f(r), 0) / s; };

  // per learner: mean accuracy and mean decision accuracy over every measure
  const perLearner = held.map((L) => {
    const acc = (f) => 100 - mean(ids.map((id) => Math.abs(f(L, id) - L.truth[id])));
    const dec = (f, e) => mean(ids.map((id) => (D.decide(f(L, id), e) === D.decide(L.truth[id], e) ? 100 : 0)));
    return { kind: kindOf(L), guess: acc(est.guess), card: acc(est.card), readout: acc(est.readout), decReadout: dec(est.readout, D.EDGES.hard), decGuess: dec(est.guess, D.EDGES.hard), decSoft: dec(est.readout, D.EDGES.soft) };
  });
  const dist = (vals) => { const v = vals.slice().sort((a, b) => a - b); const w = (q) => mean(v.slice(0, Math.max(1, Math.ceil(v.length * q)))); return { mean: mean(v), worst10: w(0.1), worst5: w(0.05), worst1: w(0.01), min: v[0] }; };
  const kinds = [...new Set(perLearner.map((p) => p.kind))].map((k) => {
    const P = perLearner.filter((p) => p.kind === k);
    return { kind: k, n: P.length, guess: mean(P.map((p) => p.guess)), readout: mean(P.map((p) => p.readout)), removed: 1 - (100 - mean(P.map((p) => p.readout))) / (100 - mean(P.map((p) => p.guess))), decReadout: mean(P.map((p) => p.decReadout)), decGuess: mean(P.map((p) => p.decGuess)) };
  });
  const all = roll(perTrait, 'all');
  all.decisionImpactWeighted = { readout: impactW(perTrait, (r) => r.hard_readout.accuracy), guess: impactW(perTrait, (r) => r.hard_guess.accuracy) };
  const reach = { traitAcc95: perTrait.filter((r) => r.acc.readout >= 95).length, decision95: perTrait.filter((r) => r.hard_readout.accuracy >= 95).length, decisionSoft95: perTrait.filter((r) => r.soft_readout.accuracy >= 95).length, of: perTrait.length };
  return {
    label: 'SIMULATED', heldLearners: held.length, calLearners: cal.length, all, classes, groups, kinds, reach,
    worst: { traitAccuracy: dist(perLearner.map((p) => p.readout)), decisionAccuracy: dist(perLearner.map((p) => p.decReadout)) },
    perTrait,
  };
}

function markdown(A, title) {
  const o = [`### ${title} (${A.label}: ${A.heldLearners} held-out learners, calibrated on ${A.calLearners}; no real learners)`, ''];
  const a = A.all;
  o.push(`All ${a.measures} measures: guess ${f1(a.acc.guess)}, card ${f1(a.acc.card)} (${f1(100 * a.removed.card)}% of error removed), read-out ${f1(a.acc.readout)} (${f1(100 * a.removed.readout)}% removed).`);
  o.push(`Decision accuracy at the hard edge (30/70): never lean ${f1(a.decisionHard.neverLean)}, guess ${f1(a.decisionHard.guess)}, card ${f1(a.decisionHard.card)}, read-out ${f1(a.decisionHard.readout)}; wrong-way ${f1(a.decisionHard.wrongWay)}%; clear traits caught ${f1(a.decisionHard.caught)}%. Of the leans actually made (${f1(a.decisionHard.leans)} per measure): ${f1(a.decisionHard.leanPrecision)}% right, ${f1(a.decisionHard.leanSafe)}% on the right side of the soft edge. Soft edge (40/60): read-out ${f1(a.decisionSoft.readout)} (guess ${f1(a.decisionSoft.guess)}). Impact-weighted hard: ${f1(a.decisionImpactWeighted.readout)}.`);
  o.push(`Measures reaching 95: trait accuracy ${A.reach.traitAcc95}/${A.reach.of}, hard decision ${A.reach.decision95}/${A.reach.of}, soft decision ${A.reach.decisionSoft95}/${A.reach.of}.`);
  o.push(`Per learner (read-out): trait accuracy mean ${f1(A.worst.traitAccuracy.mean)}, worst 10% ${f1(A.worst.traitAccuracy.worst10)}, worst 1% ${f1(A.worst.traitAccuracy.worst1)}; decision accuracy mean ${f1(A.worst.decisionAccuracy.mean)}, worst 10% ${f1(A.worst.decisionAccuracy.worst10)}, worst ${f1(A.worst.decisionAccuracy.min)}.`, '');
  o.push('| trait class | measures | guess | card | read-out | removed | decision: never lean | decision: read-out | wrong-way % | decision soft |', '|---|---|---|---|---|---|---|---|---|---|');
  for (const c of A.classes) o.push(`| ${c.name} | ${c.measures} | ${f1(c.acc.guess)} | ${f1(c.acc.card)} | ${f1(c.acc.readout)} | ${f1(100 * c.removed.readout)}% | ${f1(c.decisionHard.neverLean)} | ${f1(c.decisionHard.readout)} | ${f1(c.decisionHard.wrongWay)} | ${f1(c.decisionSoft.readout)} |`);
  o.push('', '| learner kind | n | guess | read-out | removed | decision: guess | decision: read-out |', '|---|---|---|---|---|---|---|');
  for (const k of A.kinds) o.push(`| ${k.kind} | ${k.n} | ${f1(k.guess)} | ${f1(k.readout)} | ${f1(100 * k.removed)}% | ${f1(k.decGuess)} | ${f1(k.decReadout)} |`);
  return o.join('\n');
}

function traitsTable(A) {
  const o = [`Per-trait (${A.label}, n = ${A.heldLearners} held-out learners each; accuracy = 100 - MAE; decision = same side of 30/70 as the truth)`, '', '| measure | class | impact | guess | card | read-out | removed | decision never-lean | decision read-out | wrong-way % |', '|---|---|---|---|---|---|---|---|---|---|'];
  for (const r of A.perTrait.slice().sort((x, y) => x.acc.readout - y.acc.readout)) o.push(`| ${r.id} | ${r.cls} | ${r.impact} | ${f1(r.acc.guess)} | ${f1(r.acc.card)} | ${f1(r.acc.readout)} | ${f1(100 * r.removed.readout)}% | ${f1(r.neverLean)} | ${f1(r.hard_readout.accuracy)} | ${f1(r.hard_readout.wrongWay)} |`);
  return o.join('\n');
}

module.exports = { analyse, markdown, traitsTable };

if (require.main === module) {
  const arg = (n) => { const a = process.argv.slice(2).find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : ''; };
  const A = analyse(load(arg('cal')), load(arg('held')));
  if (arg('json')) fs.writeFileSync(arg('json'), JSON.stringify(A));
  if (arg('md')) fs.writeFileSync(arg('md'), markdown(A, arg('title') || 'Held-out report'));
  if (arg('traits')) fs.writeFileSync(arg('traits'), traitsTable(A));
  if (!arg('md')) console.log(markdown(A, arg('title') || 'Held-out report'));
}
