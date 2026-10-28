/**
 * Is personalization working?
 *
 *   npm run scorecard:report
 *
 * Reads the data file and answers the questions that decide whether the learning
 * scorecard and the level editor are earning their keep:
 *
 *   - Do levels written for a learner beat the holdout (the shared page, served
 *     unchanged on purpose to the same kind of learner) on the level after them?
 *     If they do not, a stat or an instruction is wrong.
 *   - What have the within-learner experiments found?
 *   - How well does the app know its learners — how many stats are confident?
 *
 * Read-only, and safe to run while the server is up.
 */
process.env.DB_READONLY = '1';

const db = require('../config/db');
const scorecard = require('../services/scorecard');

function pct(v) {
  return v === null || v === undefined ? '  —  ' : `${(v * 100).toFixed(1).padStart(5)}%`;
}
function mean(values) {
  return values.length ? values.reduce((a, v) => a + v, 0) / values.length : null;
}

const pages = db.all('level_signals').filter((r) => r.kind === 'base_lesson' && typeof r.accuracy === 'number');

console.log('\nLESSON PAGES, JUDGED BY THE LEVEL AFTER THEM');
console.log('version        pages   next-level accuracy');
for (const arm of ['tailored', 'holdout', 'base']) {
  const rows = pages.filter((r) => (r.arm || 'base') === arm);
  console.log(`${arm.padEnd(14)} ${String(rows.length).padStart(5)}   ${pct(mean(rows.map((r) => r.accuracy)))}`);
}
console.log('tailored = written for the learner; holdout = a learner on a plan that writes levels, shown the');
console.log('shared page on purpose; base = a learner whose plan does not write levels.');
if (pages.filter((r) => r.arm === 'tailored').length < 30 || pages.filter((r) => r.arm === 'holdout').length < 10) {
  console.log('Not enough yet to call it: aim for 30+ tailored and 10+ holdout before reading anything into the gap.');
}

console.log('\nEXPERIMENTS (one way of teaching tried per level, judged by the level after)');
const byStat = {};
for (const r of pages) {
  if (!r.experiment || !r.experiment.stat) continue;
  const e = byStat[r.experiment.stat] || (byStat[r.experiment.stat] = { label: r.experiment.label, high: [], low: [] });
  e[r.experiment.arm].push(r.accuracy);
}
if (!Object.keys(byStat).length) console.log('none finished yet');
for (const [stat, e] of Object.entries(byStat)) {
  console.log(`${stat.padEnd(28)} with ${e.label}: ${pct(mean(e.high))} (${e.high.length})   without: ${pct(mean(e.low))} (${e.low.length})`);
}

const edits = db.all('level_edits');
console.log(`\nLEVEL EDITOR: ${edits.filter((e) => !e.problem).length} pages served, ${edits.filter((e) => e.problem).length} refused by the checks`);
const models = {};
for (const e of edits.filter((x) => !x.problem)) models[e.model] = (models[e.model] || 0) + 1;
for (const [m, n] of Object.entries(models)) console.log(`  ${m}: ${n}`);

console.log('\nSCORECARD COVERAGE');
const cards = db.all('scorecards');
console.log(`learners with a scorecard: ${cards.length}`);
if (cards.length) {
  console.log(`average confidence across all 100 stats: ${mean(cards.map((c) => scorecard.overallConfidence(c))).toFixed(1)}%`);
  const counts = scorecard.STATS.map((s) => ({ id: s.id, n: cards.filter((c) => scorecard.read(c, s.id).confidence >= 50).length }))
    .sort((a, b) => b.n - a.n);
  console.log('best measured:  ', counts.slice(0, 8).map((x) => `${x.id} (${x.n})`).join(', '));
  console.log('least measured: ', counts.slice(-8).map((x) => `${x.id} (${x.n})`).join(', '));
}
console.log('');
