/**
 * Where is the scorecard's remaining error? (docs/SCORECARD-REAL.md part 1; SIMULATED: nothing here is a real learner.)
 *   node scripts/scorecard-real-gaps.js --cal=a.json,b.json --held=c.json,d.json [--json=out.json] [--md=out.md]
 * For every measure, every trait group and every kind of learner, on a held-out dump: the guess baseline, the card, the read-out, the share of error removed, and the card's error
 * split three ways (Murphy): bias (the card's average is off), slope (the card's spread is the wrong size for what it knows) and unexplained (no signal: 1 - r^2).
 * A measure is called MISREAD when the card does worse than the guess or more than a third of its error is bias + slope, THIN when the correlation is small and the rest is noise.
 */
'use strict';
const fs = require('fs');
const R = require('../services/scorecard/readout');
const { ALL_FEATURES } = require('../services/scorecard/log-features');
const { STATS } = require('../services/scorecard/stats');
const { ceilings, vNeeded } = require('../services/scorecard/ceilings');

const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((v) => (v - m) ** 2))); };
const corr = (a, b) => { const ma = mean(a); const mb = mean(b); let ab = 0; let aa = 0; let bb = 0; a.forEach((v, i) => { ab += (v - ma) * (b[i] - mb); aa += (v - ma) ** 2; bb += (b[i] - mb) ** 2; }); return aa && bb ? ab / Math.sqrt(aa * bb) : 0; };
const load = (spec) => spec.split(',').filter(Boolean).flatMap((f) => JSON.parse(fs.readFileSync(f, 'utf8')).learners);
const kindOf = (L) => (L.ext && L.ext.kind) || 'ordinary';

/** Fit the read-out on calibration learners; returns read(L, id, withFeatures). */
function fitReadout(cal, ids) {
  const models = {};
  for (const id of ids) models[id] = R.fitMeasure(cal.map((L) => ({ m: L.app[id][0], conf: L.app[id][2], feat: L.feat, y: L.truth[id] })), ALL_FEATURES);
  return (L, id, feat) => R.readS1({ models, featNames: ALL_FEATURES }, id, { m: L.app[id][0], conf: L.app[id][2], feat: feat ? L.feat : undefined });
}

/** A measure's accuracy with the read-out, in another run. */
function perMeasure(cal, held, ids) {
  const read = fitReadout(cal, ids);
  return Object.fromEntries(ids.map((id) => [id, { acc: 100 - mean(held.map((L) => Math.abs(read(L, id, true) - L.truth[id]))), s0: 100 - mean(held.map((L) => Math.abs(L.app[id][0] - L.truth[id]))) }]));
}

function analyse(cal, held, { off = null, world = null } = {}) {
  const ids = STATS.map((s) => s.id).filter((id) => cal.every((L) => L.app[id] && L.truth[id] !== undefined));
  const read = fitReadout(cal, ids);
  const guessOf = Object.fromEntries(ids.map((id) => [id, mean(cal.map((L) => L.truth[id]))]));
  const C = ceilings();
  const rows = ids.map((id) => {
    const T = held.map((L) => L.truth[id]); const S0 = held.map((L) => L.app[id][0]); const S1 = held.map((L) => read(L, id, false)); const S1f = held.map((L) => read(L, id, true));
    const mae = (P) => mean(P.map((p, i) => Math.abs(p - T[i])));
    const guess = mean(T.map((t) => Math.abs(t - guessOf[id])));
    const r0 = corr(S0, T); const rf = corr(S1f, T);
    const mse = mean(S0.map((p, i) => (p - T[i]) ** 2)); const bias2 = (mean(S0) - mean(T)) ** 2; const slope2 = (sd(S0) - r0 * sd(T)) ** 2; const noise2 = Math.max(0, mse - bias2 - slope2);
    const hiConf = held.map((L, i) => (L.app[id][2] >= 60 ? Math.abs(S0[i] - T[i]) : null)).filter((v) => v !== null);
    const c = C[id] || {};
    return { id, group: STATS.find((s) => s.id === id).category, cls: c.cls, guess, s0: mae(S0), s1: mae(S1), s1f: mae(S1f), r0, rf, bias2Share: bias2 / mse, slopeShare: slope2 / mse, noiseShare: noise2 / mse, conf: mean(held.map((L) => L.app[id][2])), hiConfN: hiConf.length, hiConfMae: mean(hiConf), ceilV: c.v, ceilPts: c.v === undefined ? null : 100 - guess * Math.sqrt(1 - c.v * c.v), ceilRemoved: c.v === undefined ? null : 1 - Math.sqrt(1 - c.v * c.v) };
  });
  const offM = off ? perMeasure(off.cal, off.held, ids) : null;
  const worldM = world ? perMeasure(world.cal, world.held, ids) : null;
  const Cl = ceilings(0); const Ch = ceilings(2);
  rows.forEach((r) => {
    r.behaviourOnly = offM ? offM[r.id].acc : null; r.worldAcc = worldM ? worldM[r.id].acc : null; r.worldS0 = worldM ? worldM[r.id].s0 : null;
    r.ceilLow = 100 - r.guess * Math.sqrt(1 - Cl[r.id].v ** 2); r.ceilHigh = 100 - r.guess * Math.sqrt(1 - Ch[r.id].v ** 2);
    r.vFor95 = vNeeded(95, r.guess); r.can95 = Ch[r.id].v >= r.vFor95;
    r.aboveCeiling = r.s1f > 0 && 100 - r.s1f > r.ceilHigh;
    r.removedS0 = 1 - r.s0 / r.guess; r.removedS1f = 1 - r.s1f / r.guess;
    r.diagnosis = (r.s0 > r.guess * 1.02 || r.bias2Share + r.slopeShare > 0.33) ? 'misread' : (Math.abs(r.rf) < 0.3 ? 'thin' : 'read');
    r.misreadFixed = r.diagnosis === 'misread' ? r.s1f < r.guess * 0.98 : null;
  });
  const roll = (subset, name) => {
    const g = mean(subset.map((r) => r.guess)); const s0 = mean(subset.map((r) => r.s0)); const s1f = mean(subset.map((r) => r.s1f)); const c = subset.filter((r) => r.ceilPts !== null);
    return { name, n: subset.length, guess: 100 - g, s0: 100 - s0, s1f: 100 - s1f, removedS0: 1 - s0 / g, removedS1f: 1 - s1f / g, ceil: c.length ? mean(c.map((r) => r.ceilPts)) : null, removedCeil: c.length ? 1 - mean(c.map((r) => 100 - r.ceilPts)) / mean(c.map((r) => r.guess)) : null, misread: subset.filter((r) => r.diagnosis === 'misread').length, thin: subset.filter((r) => r.diagnosis === 'thin').length };
  };
  const groups = [...new Set(rows.map((r) => r.group))].map((g) => roll(rows.filter((r) => r.group === g), g));
  const classes = [...new Set(rows.map((r) => r.cls))].filter(Boolean).map((g) => roll(rows.filter((r) => r.cls === g), g));
  const kinds = [...new Set(held.map(kindOf))].map((k) => {
    const H = held.filter((L) => kindOf(L) === k);
    const perL = (f) => mean(H.map((L) => mean(ids.map((id) => Math.abs(f(L, id) - L.truth[id])))));
    const g = perL((L, id) => guessOf[id]); const s0 = perL((L, id) => L.app[id][0]); const s1f = perL((L, id) => read(L, id, true));
    const byCls = {};
    for (const cls of new Set(rows.map((r) => r.cls))) { if (!cls) continue; const cids = rows.filter((r) => r.cls === cls).map((r) => r.id); byCls[cls] = { guess: 100 - mean(H.map((L) => mean(cids.map((id) => Math.abs(guessOf[id] - L.truth[id]))))), s1f: 100 - mean(H.map((L) => mean(cids.map((id) => Math.abs(read(L, id, true) - L.truth[id]))))) }; }
    // how far the worst traits of this kind fall: the share of a learner's measures more than 20 points off
    const far = mean(H.map((L) => mean(ids.map((id) => (Math.abs(read(L, id, true) - L.truth[id]) > 20 ? 1 : 0)))));
    return { kind: k, n: H.length, guess: 100 - g, s0: 100 - s0, s1f: 100 - s1f, removedS0: 1 - s0 / g, removedS1f: 1 - s1f / g, farShare: far, byCls };
  });
  const perLearner = held.map((L) => ({ kind: kindOf(L), g: 100 - mean(ids.map((id) => Math.abs(guessOf[id] - L.truth[id]))), s1f: 100 - mean(ids.map((id) => Math.abs(read(L, id, true) - L.truth[id]))), ideal: L.daily && L.daily.ideal_mae !== undefined ? 100 - L.daily.ideal_mae : null, s0: 100 - mean(ids.map((id) => Math.abs(L.app[id][0] - L.truth[id]))) }));
  const sorted = perLearner.slice().sort((a, b) => a.s1f - b.s1f);
  const worst = (p) => mean(sorted.slice(0, Math.max(1, Math.round(sorted.length * p))).map((x) => x.s1f));
  const all = roll(rows, 'all');
  const ceilAt = (scn) => { const c = ceilings(scn); return { acc: mean(rows.map((r) => 100 - r.guess * Math.sqrt(1 - c[r.id].v ** 2))), removed: 1 - mean(rows.map((r) => r.guess * Math.sqrt(1 - c[r.id].v ** 2))) / mean(rows.map((r) => r.guess)) }; };
  all.ceilings = [ceilAt(0), ceilAt(1), ceilAt(2)];
  // the same ceiling for each kind of learner: their own guess error, shrunk by each class's residual
  const C1 = ceilings(1);
  for (const k of kinds) { const H = held.filter((L) => kindOf(L) === k.kind); const gi = (id) => mean(H.map((L) => Math.abs(guessOf[id] - L.truth[id]))); k.ceil = 100 - mean(ids.map((id) => gi(id) * Math.sqrt(1 - C1[id].v ** 2))); k.removedCeil = (k.ceil - k.guess) / (100 - k.guess); k.vFor95 = vNeeded(95, 100 - k.guess); }
  return { all, rows, groups, classes, kinds, worst: { w1: worst(0.01), w5: worst(0.05), w10: worst(0.1) }, ideal: mean(perLearner.map((p) => p.ideal)), n: held.length };
}

const f1 = (v) => (v === null || v === undefined ? '' : v.toFixed(1));
const pc = (v) => (v === null || v === undefined ? '' : `${Math.round(v * 100)}%`);
function markdown(a) {
  const L = [`SIMULATED, ${a.n} held-out learners, day 30, daily check on. Guess ${f1(a.all.guess)}, card ${f1(a.all.s0)} (removed ${pc(a.all.removedS0)}), read-out with log features ${f1(a.all.s1f)} (removed ${pc(a.all.removedS1f)}); worst 1/5/10% ${f1(a.worst.w1)} / ${f1(a.worst.w5)} / ${f1(a.worst.w10)}. Planner's own posterior before the card's combining rules: ${f1(a.ideal)}.`, ''];
  if (a.all.ceilings) L.push(`Research ceiling for the whole card at a month, this mix of learners: low ${f1(a.all.ceilings[0].acc)} (${pc(a.all.ceilings[0].removed)} removed), central ${f1(a.all.ceilings[1].acc)} (${pc(a.all.ceilings[1].removed)}), high ${f1(a.all.ceilings[2].acc)} (${pc(a.all.ceilings[2].removed)}).`, '');
  L.push('By how a trait can be read:', '', '| class | measures | guess | card | read-out | removed | ceiling (research) | ceiling removed | misread | thin |', '|---|---|---|---|---|---|---|---|---|---|');
  for (const g of a.classes) L.push(`| ${g.name} | ${g.n} | ${f1(g.guess)} | ${f1(g.s0)} | ${f1(g.s1f)} | ${pc(g.removedS1f)} | ${f1(g.ceil)} | ${pc(g.removedCeil)} | ${g.misread} | ${g.thin} |`);
  L.push('', 'By scorecard category:', '', '| category | guess | card | read-out | removed | ceiling | misread | thin |', '|---|---|---|---|---|---|---|---|');
  for (const g of a.groups) L.push(`| ${g.name} | ${f1(g.guess)} | ${f1(g.s0)} | ${f1(g.s1f)} | ${pc(g.removedS1f)} | ${f1(g.ceil)} | ${g.misread} | ${g.thin} |`);
  L.push('', 'By kind of learner (ceiling = research central):', '', '| kind | n | guess | card | read-out | removed | measures >20 pts off | ceiling | correlation 95 would need |', '|---|---|---|---|---|---|---|---|---|');
  for (const k of a.kinds.slice().sort((x, y) => x.s1f - y.s1f)) L.push(`| ${k.kind} | ${k.n} | ${f1(k.guess)} | ${f1(k.s0)} | ${f1(k.s1f)} | ${pc(k.removedS1f)} | ${pc(k.farShare)} | ${f1(k.ceil)} | ${k.vFor95 ? k.vFor95.toFixed(2) : ''} |`);
  L.push('', 'Every measure, weakest first. guess, S0 (card), Sf (read-out with log features), behaviour (Sf with no daily check), harsher world (Sf when the generator differs, research world) are accuracy in points. bias, slope, no signal: shares of the squared error of the card. ceiling: research low to high at a month. * means the simulated read beats even the high ceiling, so the simulation flatters that measure. correlation for 95: what 95 would need; no measure reaches it even at its high ceiling unless marked yes.', '', '| measure | class | guess | S0 | Sf | behaviour | harsher world | r(Sf) | removed Sf | bias | slope | no signal | diagnosis | ceiling | correlation for 95 | 95 possible? |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of a.rows.slice().sort((x, y) => x.removedS1f - y.removedS1f)) L.push(`| ${r.id} | ${r.cls || ''} | ${f1(100 - r.guess)} | ${f1(100 - r.s0)} | ${f1(100 - r.s1f)}${r.aboveCeiling ? '*' : ''} | ${f1(r.behaviourOnly)} | ${f1(r.worldAcc)} | ${r.rf.toFixed(2)} | ${pc(r.removedS1f)} | ${pc(r.bias2Share)} | ${pc(r.slopeShare)} | ${pc(r.noiseShare)} | ${r.diagnosis} | ${f1(r.ceilLow)}-${f1(r.ceilHigh)} | ${r.vFor95.toFixed(2)} | ${r.can95 ? 'yes' : 'no'} |`);
  return L.join('\n');
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const arg = (n, d = '') => { const x = argv.find((s) => s.startsWith(`--${n}=`)); return x ? x.slice(n.length + 3) : d; };
  const opt2 = {};
  if (arg('off-cal')) opt2.off = { cal: load(arg('off-cal')), held: load(arg('off-held')) };
  if (arg('world-held')) opt2.world = { cal: load(arg('cal')), held: load(arg('world-held')) };
  const a = analyse(load(arg('cal')), load(arg('held')), opt2);
  if (arg('json')) fs.writeFileSync(arg('json'), JSON.stringify(a));
  const md = markdown(a);
  if (arg('md')) fs.writeFileSync(arg('md'), md);
  console.log(md.split('\n').slice(0, 45).join('\n'));
}
module.exports = { analyse, markdown, load, kindOf };
