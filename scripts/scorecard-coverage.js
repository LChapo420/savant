#!/usr/bin/env node
/**
 * The scorecard's coverage matrix (docs/SCORECARD-EVERYTHING.md): for every measure, the observable evidence that reaches it, read from
 * the code (signals.js rules, personalize.js experiments, the questionnaire's map, item tags, the games, the reading check, and the round-9
 * indicators with their validities). Prints a markdown table.
 *
 *   node scripts/scorecard-coverage.js            the table
 *   node scripts/scorecard-coverage.js --counts   how many measures each kind of source reaches
 */
const path = require('path');
const os = require('os');

process.env.DB_FILE = path.join(os.tmpdir(), 'scorecard-coverage-unused.json');
process.env.DB_READONLY = '1';
const { STATS } = require('../services/scorecard/stats');
const { RATES, SHIFTS, CONTRASTS, TAPS } = require('../services/scorecard/signals');
const personalize = require('../services/personalize');
const ipip = require('../content/ipip-items');
const itemTags = require('../services/scorecard/item-tags');
const ind = require('../services/scorecard/indicators');
const boosters = require('../services/boosters');

const quiz = new Set(ipip.ITEMS.flatMap((it) => it.maps.map(([s]) => s)));
// The sign-up style quiz (scorecard/index.js STYLE_MAP: a starting nudge, self-report).
const style = new Set(['step_explicitness', 'brevity_preference', 'inductive_trajectory', 'deductive_trajectory', 'spatial_anchoring', 'chunk_granularity',
  'attention_runway', 'cycle_architecture', 'challenge_appetite', 'productive_struggle', 'elaboration_benefit', 'feedback_granularity', 'generation_effect']);
const games = new Set(Object.values(boosters.GAMES).map((g) => g.stat));
const exp = new Set(personalize.EXPERIMENTS.map((e) => e.stat));
const tags = new Set(itemTags.TAG_STATS || []);
// Rules whose evidence is not in RATES/SHIFTS/CONTRASTS/TAPS: value paths and models (signals.js fromAnswer/fromBlock/fromSession/fromFeedback,
// the forgetting model, the ability model's pace, slope and reach). Read off the round-8 research split (scorecard-recovery-sim.js SIGNAL_STATS).
const MODELS = { decay_rate: 'memory tests', retention_index: 'memory tests', retrieval_strength: 'memory tests', mastery_velocity: 'ability slope',
  processing_velocity: 'answer pace', scaffolding_fade: 'reach vs the course', prior_knowledge: 'placement', vocabulary_ceiling: 'reading check' };
const VALUE = new Set(['attention_runway', 'intake_baseline', 'brevity_preference', 'depth_breadth', 'step_explicitness', 'repetition_tolerance',
  'reflection_depth', 'session_rhythm', 'mastery_orientation', 'warmup_latency', 'momentum_dependence', 'fatigue_curve', 'failure_response',
  'error_recovery_speed', 'interleaving_tolerance', 'open_response_performance', 'recognition_recall_gap', 'consolidation_need', 'text_density_tolerance']);

const rows = STATS.map((s) => {
  const own = [];
  if (RATES[s.id]) own.push('rate');
  if (SHIFTS[s.id]) own.push(SHIFTS[s.id].tagged ? 'item tags' : 'shift');
  if (CONTRASTS[s.id]) own.push('contrast');
  if (TAPS[s.id]) own.push('taps');
  if (VALUE.has(s.id) && !own.length) own.push('behaviour');
  if (MODELS[s.id]) own.push(MODELS[s.id]);
  if (exp.has(s.id)) own.push('experiment + choice');
  if (tags.has(s.id) && !own.includes('item tags')) own.push('item tags');
  if (quiz.has(s.id)) own.push('questionnaire');
  if (style.has(s.id)) own.push('style quiz');
  if (games.has(s.id)) own.push('game');
  const news = (ind.BY_STAT[s.id] || []).map((m) => `${m.key.replace(/^llm\.\w+$/, 'llm read')} ${m.sign > 0 ? '+' : '-'}${m.v}`);
  return { id: s.id, own, news };
});

if (process.argv.includes('--counts')) {
  const n = (f) => rows.filter(f).length;
  console.log(`measures ${rows.length}; with a round-9 indicator ${n((r) => r.news.length)}; with neither an own source nor an indicator ${n((r) => !r.own.length && !r.news.length)}`);
  console.log(`with no own source before round 9 ${n((r) => !r.own.length)}, of which now reached by an indicator ${n((r) => !r.own.length && r.news.length)}`);
} else {
  console.log('| measure | evidence before round 9 | round-9 indicators (sign, validity) |');
  console.log('|---|---|---|');
  for (const r of rows) console.log(`| ${r.id} | ${r.own.join(', ') || 'none (model read only)'} | ${r.news.join(', ') || '—'} |`);
}
