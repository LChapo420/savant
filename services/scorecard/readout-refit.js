/**
 * The calibration path for real testers (docs/SCORECARD-95.md part 3). Pure functions; scripts/scorecard-95-refit.js reads a file and writes the artifact and the report.
 * A record per learner: { userId, shareable, reads: { measure: { m, conf } }, anchor: { measure: value 0-100 }, halves: { family: { measure: [halfA, halfB] } } }.
 *   anchor   a delayed outcome or a designed-item read of the measure (the best stand-in for the truth), noisy but unbiased; the regression of it on the card's reads
 *            estimates the same thing as the regression on the truth, so the S1 fit needs no disattenuation, only enough learners.
 *   halves   the same source read twice (odd/even items, or the two halves of the month): split-half reliability by Spearman-Brown, and the source's correlation with the anchor.
 * Guards: account 6689 and any record not marked shareable never enter; a measure needs MIN_N learners before it moves at all; a fitted model replaces the old one only by a
 * step alpha, the largest of 1, .5, .25, .1, 0 that keeps the 99th percentile of any learner's change on that measure under MAX_P99 points and the largest under MAX_ANY, so no
 * card changes abruptly. The old model is kept inside the new artifact ("mix"), so the move is visible and the next refit continues from the model really in force.
 */
'use strict';
const R = require('./readout');

const OWNER_ID = 6689;
const MIN_N = 40; const MAX_P99 = 4; const MAX_ANY = 8;
const mean = R.mean;
const corr = (a, b) => {
  const ma = mean(a); const mb = mean(b); let sab = 0; let saa = 0; let sbb = 0;
  a.forEach((v, i) => { sab += (v - ma) * (b[i] - mb); saa += (v - ma) ** 2; sbb += (b[i] - mb) ** 2; });
  return saa && sbb ? sab / Math.sqrt(saa * sbb) : 0;
};
const sb = (r) => (r > -1 ? (2 * r) / (1 + r) : 0); // Spearman-Brown for two halves

const eligible = (recs) => recs.filter((r) => Number(r.userId) !== OWNER_ID && r.shareable === true);

/** Per source and measure: split-half reliability, correlation with the anchor, and the disattenuated validity, next to the assumed ceiling. */
function validity(recs, assumed = {}) {
  const out = [];
  const fams = new Set(); recs.forEach((r) => Object.keys(r.halves || {}).forEach((f) => fams.add(f)));
  for (const fam of fams) {
    const measures = new Set(); recs.forEach((r) => Object.keys((r.halves || {})[fam] || {}).forEach((m) => measures.add(m)));
    for (const id of measures) {
      const rows = recs.filter((r) => r.halves[fam] && r.halves[fam][id] && r.anchor && r.anchor[id] !== undefined);
      if (rows.length < MIN_N) { out.push({ family: fam, measure: id, n: rows.length, status: 'too few learners' }); continue; }
      const a = rows.map((r) => r.halves[fam][id][0]); const b = rows.map((r) => r.halves[fam][id][1]);
      const rel = Math.max(0.01, sb(corr(a, b))); const both = a.map((v, i) => (v + b[i]) / 2); const rxy = corr(both, rows.map((r) => r.anchor[id]));
      out.push({ family: fam, measure: id, n: rows.length, split_half: +rel.toFixed(3), r_anchor: +rxy.toFixed(3), validity: +Math.min(1, rxy / Math.sqrt(rel)).toFixed(3), assumed: assumed[fam] === undefined ? null : assumed[fam], status: 'measured' });
    }
  }
  return out;
}

/** Refit S1 on real records; returns { art, report, used, dropped }. `old` is the artifact in force (or null). */
function refit(records, old, { featNames = [], minN = MIN_N } = {}) {
  const recs = eligible(records); const dropped = records.length - recs.length;
  const ids = old ? old.ids : [...new Set(recs.flatMap((r) => Object.keys(r.anchor || {})))];
  const models = {}; const rep = [];
  for (const id of ids) {
    const rows = recs.filter((r) => r.reads && r.reads[id] && r.anchor && r.anchor[id] !== undefined).map((r) => ({ m: r.reads[id].m, conf: r.reads[id].conf, y: r.anchor[id] }));
    const prev = old && old.models[id];
    if (rows.length < minN) { if (prev) models[id] = prev; rep.push({ measure: id, n: rows.length, action: 'kept (too few learners)' }); continue; }
    const fitted = R.fitMeasure(rows, null);
    if (!prev) { models[id] = fitted; rep.push({ measure: id, n: rows.length, action: `new: ${fitted.kind}`, cv_rmse: +fitted.cvRmse.toFixed(2) }); continue; }
    // the largest step that keeps every learner's change small
    const base = prev.kind === 'mix' ? prev.b : prev;
    let chosen = null; let shifts = [];
    for (const alpha of [1, 0.5, 0.25, 0.1, 0]) {
      const cand = alpha === 0 ? prev : { kind: 'mix', a: base, b: fitted, alpha };
      shifts = rows.map((r) => Math.abs(R.readS1({ models: { [id]: cand } }, id, r) - R.readS1({ models: { [id]: prev } }, id, r))).sort((x, y) => x - y);
      const p99 = shifts[Math.min(shifts.length - 1, Math.floor(shifts.length * 0.99))];
      if (p99 <= MAX_P99 && shifts[shifts.length - 1] <= MAX_ANY) { chosen = { cand, alpha }; break; }
    }
    models[id] = chosen.cand;
    rep.push({ measure: id, n: rows.length, action: chosen.alpha === 1 ? 'moved fully' : chosen.alpha === 0 ? 'held back (the change would be abrupt)' : `moved ${chosen.alpha} of the way`, max_change: +shifts[shifts.length - 1].toFixed(1), cv_rmse: +fitted.cvRmse.toFixed(2) });
  }
  const art = { version: (old ? old.version : 0) + 1, fitted_on: old ? `${old.fitted_on}; refit on ${recs.length} real learners` : `${recs.length} real learners`, n: recs.length, ids, featNames: old ? old.featNames : featNames, models, s2: old ? old.s2 : undefined };
  return { art, report: rep, used: recs.length, dropped };
}

function reportMarkdown({ report, used, dropped }, val) {
  const L = ['# Read-out refit report', '', `Learners used ${used}; left out ${dropped} (account ${OWNER_ID}, or not marked shareable).`, '', '## Each source: assumed against measured validity', '', '| source | measure | n | split-half | r with anchor | measured validity | assumed ceiling |', '|---|---|---|---|---|---|---|'];
  for (const v of val) L.push(v.status === 'measured' ? `| ${v.family} | ${v.measure} | ${v.n} | ${v.split_half} | ${v.r_anchor} | ${v.validity} | ${v.assumed === null ? 'n/a' : v.assumed} |` : `| ${v.family} | ${v.measure} | ${v.n} | | | ${v.status} | |`);
  L.push('', '## What happened to each measure', '', '| measure | n | action | largest change (points) | held-out RMSE |', '|---|---|---|---|---|');
  for (const r of report) L.push(`| ${r.measure} | ${r.n} | ${r.action} | ${r.max_change === undefined ? '' : r.max_change} | ${r.cv_rmse === undefined ? '' : r.cv_rmse} |`);
  return L.join('\n');
}

module.exports = { refit, validity, reportMarkdown, eligible, OWNER_ID, MIN_N, MAX_P99, MAX_ANY };
