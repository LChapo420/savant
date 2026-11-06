/**
 * Which channel reads each of the card's 100 measures from what the app already holds, and how much of the guess error the card removes at day 30 (SIMULATED).
 *   node scripts/scorecard-95-audit.js --dumps=a.json,b.json > docs/scorecard-95-channels.md
 * Channels are found by where the measure's id appears: answer-log rules (signals.js), paired lesson versions (personalize.js EXPERIMENTS), questionnaires and tasks (content/ipip-items.js,
 * content/daily-check, services/onboarding/pool.js), chat and text (transcript-read.js, text-features.js, tutor-learner-model.js), footprints (footprint-defs.js, the indicators), and the
 * new within-learner log contrasts (services/scorecard/log-features.js, by the measure each is meant for: LOGMAP below).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const R = require('../services/scorecard/readout');
const { STATS } = require('../services/scorecard/stats');
const argv = process.argv.slice(2);
const arg = (n, d = '') => { const a = argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const root = path.join(__dirname, '..');
const read = (f) => { try { return fs.readFileSync(path.join(root, f), 'utf8'); } catch { return ''; } };
const CH = {
  'answer-log rule': ['services/scorecard/signals.js', 'services/scorecard/item-tags.js', 'services/scorecard/irt.js'],
  'paired versions (experiment)': ['services/personalize.js'],
  'questionnaire / task': ['content/ipip-items.js', 'services/onboarding/pool.js', 'content/style-quiz.js'],
  'chat / text': ['services/scorecard/transcript-read.js', 'services/scorecard/text-features.js', 'services/tutor-learner-model.js'],
  'footprint / indicator': ['services/scorecard/footprint-defs.js', 'services/scorecard/indicators.js'],
  'memory model': ['services/scorecard/forgetting.js'],
};
// the new log contrasts and the measures they are meant to inform (the ridge decides whether any of it is used)
const LOGMAP = { warmLat: ['warmup_latency', 'intake_baseline'], reentryGap: ['reentry_cost', 'decay_rate'], streakEff: ['momentum_dependence'], switchEff: ['interleaving_tolerance', 'cognitive_flexibility'], missMs: ['error_recovery_speed', 'failure_response'], msSd: ['deliberation_depth', 'attention_runway'], hardEff: ['challenge_appetite', 'productive_struggle'], hourSd: ['session_rhythm'], sitLen: ['attention_runway', 'fatigue_curve'], sitLenSd: ['session_rhythm', 'stimulus_envelope'], msTrend: ['fatigue_curve'], reviewGap: ['retrieval_strength', 'retention_index', 'consolidation_need'], chgMc: ['self_monitoring', 'perfectionism'], rapidMiss: ['guessing_propensity', 'rush_tendency'], coachMiss: ['help_seeking', 'hint_dependency'], accTrend: ['mastery_velocity', 'scaffolding_fade'], rightSlow: ['deliberation_depth', 'rush_tendency'], skillBreadth: ['depth_breadth', 'novelty_hunger'], sureWrong: ['confidence_calibration', 'self_efficacy'], typedMs: ['brevity_preference', 'recognition_recall_gap'], nightRate: ['session_rhythm'] };
const src = Object.fromEntries(Object.values(CH).flat().map((f) => [f, read(f)]));
const daily = fs.existsSync(path.join(root, 'content/daily-check')) ? fs.readdirSync(path.join(root, 'content/daily-check')).map((f) => read(`content/daily-check/${f}`)).join('\n') : '';
const dumps = arg('dumps').split(',').filter(Boolean).flatMap((f) => JSON.parse(fs.readFileSync(f, 'utf8')).learners);
const m = R.mean;
const rem = {};
if (dumps.length) {
  const ids = STATS.map((s) => s.id).filter((id) => dumps.every((l) => l.app[id] && l.truth[id] !== undefined));
  for (const id of ids) { const g = m(dumps.map((l) => l.truth[id])); const s0 = m(dumps.map((l) => Math.abs(l.app[id][0] - l.truth[id]))); const gb = m(dumps.map((l) => Math.abs(g - l.truth[id]))); rem[id] = { s0: +s0.toFixed(1), gb: +gb.toFixed(1), rem: Math.round(100 * (1 - s0 / gb)) }; }
}
const rows = STATS.map((s) => {
  const ch = Object.entries(CH).filter(([, files]) => files.some((f) => new RegExp(`\\b${s.id}\\b`).test(src[f]))).map(([k]) => k);
  if (new RegExp(`\\b${s.id}\\b`).test(daily)) ch.push('daily check bank');
  const lf = Object.entries(LOGMAP).filter(([, v]) => v.includes(s.id)).map(([k]) => k);
  return { id: s.id, ch, lf, ...(rem[s.id] || {}) };
});
const out = [`# Channels per measure (SIMULATED day-30 removal; ${dumps.length} learners)`, '', 'removed = 1 - card error / guess error. "weak" = under 15% removed. Channels are where the id appears in code (a reader exists), not a validity.', '', '| measure | channels now | log contrasts added | S0 MAE | guess MAE | removed % |', '|---|---|---|---|---|---|'];
for (const r of rows.sort((a, b) => (a.rem === undefined ? 0 : a.rem) - (b.rem === undefined ? 0 : b.rem))) out.push(`| ${r.id} | ${r.ch.join(', ') || 'NONE'} | ${r.lf.join(', ')} | ${r.s0 ?? ''} | ${r.gb ?? ''} | ${r.rem ?? ''} |`);
const none = rows.filter((r) => !r.ch.length); const weak = rows.filter((r) => r.rem !== undefined && r.rem < 15);
out.push('', `Measures with no reader at all: ${none.length ? none.map((r) => r.id).join(', ') : 'none'}. Weak (under 15% removed): ${weak.length} of ${rows.length}. Of those, with no log contrast yet: ${weak.filter((r) => !r.lf.length).map((r) => r.id).join(', ')}.`);
console.log(out.join('\n'));
