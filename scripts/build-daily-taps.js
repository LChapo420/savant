#!/usr/bin/env node
/**
 * Writes the daily check's own-wording tap bank (content/daily-check/tap-items.json): two "which would you do next?" taps per measure that has no other carrier.
 * Writer: DeepSeek V4.1 Flash through Munito (xKiro 503 and NVIDIA did not answer; no learner data). Reviewer: GLM-5.3 Flash through Munito (a different family), judging each tap for
 * reading level across ages 8 to 70, no diagnosis or sensitive-trait wording, and that it is about the measure it claims. Only taps the reviewer passes are kept.
 * Every tap is marked validated:false: it is our own wording, never described as a validated instrument.
 *   node scripts/build-daily-taps.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: 'C:/coding/claudecommittdIq/folderThing/.env' });
process.env.XKIRO_PIPELINE = '1';
const { STATS } = require('../services/scorecard/stats');
process.env.MUNITO_PIPELINE = '1';
const { munito } = require('../services/providers/munito');

const IDS = ('chunk_granularity abstraction_tolerance example_density_need text_density_tolerance jargon_absorption spatial_anchoring global_framing_need humor_receptivity narrative_pull tone_formality elaboration_benefit mnemonic_receptivity enactive_encoding generation_effect step_explicitness worked_example_dependence feedback_granularity feedback_tone_sensitivity dialogic_preference praise_sensitivity social_framing interest_transfer cycle_architecture '
  + 'intrinsic_motivation extrinsic_reward_sensitivity competitive_drive evaluation_anxiety boredom_susceptibility mastery_orientation identity_alignment autonomy_preference strategy_awareness planning_tendency question_generation productive_struggle curiosity_hook relevance_demand emotional_engagement conceptual_bias application_orientation integration_tendency depth_breadth creative_extension gamification_response novelty_hunger structure_need stimulus_envelope '
  + 'intake_baseline warmup_latency momentum_dependence interleaving_tolerance session_rhythm reentry_cost').split(' ');
const byId = Object.fromEntries(STATS.map((s) => [s.id, s]));
const WSCHEMA = { type: 'object', properties: { taps: { type: 'array', items: { type: 'object', properties: { measure: { type: 'string' }, prompt: { type: 'string' }, high: { type: 'string' }, low: { type: 'string' } }, required: ['measure', 'prompt', 'high', 'low'] } } }, required: ['taps'] };
const RSCHEMA = { type: 'object', properties: { verdicts: { type: 'array', items: { type: 'object', properties: { n: { type: 'number' }, reading_ok: { type: 'boolean' }, sensitive: { type: 'boolean' }, about_measure: { type: 'string', enum: ['yes', 'partly', 'no'] }, note: { type: 'string' } }, required: ['n', 'reading_ok', 'sensitive', 'about_measure'] } } }, required: ['verdicts'] };

const WSYS = 'You write short "which would you do next?" choice taps for a learning app used by people aged 8 to 70. Each tap offers two things the person could do next while studying; the choice reveals a learning preference. Rules: plain words (reading age about 10, under 14 words per option), no jargon, no mention of diagnoses, disorders, or sensitive traits, no moral judgement (both options are fine), both options equally attractive and about the same length, concrete actions not self-descriptions. The "high" option is what a person high on the measure would pick, "low" the opposite pole. Write exactly 2 taps per measure, on different situations.';

(async () => {
  const kept = []; let proposed = 0;
  for (let i = 0; i < IDS.length; i += 9) {
    const batch = IDS.slice(i, i + 9);
    const user = batch.map((id) => `- ${id} (${byId[id].name}): low = ${byId[id].low}; high = ${byId[id].high}`).join('\n');
    const w = await munito.structured({ task: 'daily-taps-writer', system: WSYS, user: `Measures:
${user}`, schema: WSCHEMA, schemaName: 'submit_taps', maxTokens: 6000, timeoutMs: 240000 });
    const taps = ((w && (w.data || w).taps) || []).filter((t) => byId[t.measure] && t.prompt && t.high && t.low);
    proposed += taps.length;
    const rsys = 'You review choice taps for a learning app for ages 8 to 70. For each numbered tap say: reading_ok (plain enough for a 10-year-old, no long or technical words), sensitive (true if it names or hints at a diagnosis, disorder, mental-health label, or sensitive personal trait), about_measure (yes, partly or no: does choosing "high" over "low" really show more of the named measure, as defined?). Be strict.';
    const ru = taps.map((t, n) => `${n}. measure ${t.measure} (low = ${byId[t.measure].low}; high = ${byId[t.measure].high})\n   prompt: ${t.prompt}\n   high option: ${t.high}\n   low option: ${t.low}`).join('\n');
    const r = await munito.structured({ task: 'daily-taps-review', system: rsys, user: ru, schema: RSCHEMA, schemaName: 'submit_verdicts', maxTokens: 6000, timeoutMs: 240000, model: 'zai-org/glm-5.3-flash' });
    const vs = ((r && (r.data || r).verdicts) || []);
    taps.forEach((t, n) => {
      const v = vs.find((x) => x.n === n);
      if (v && v.reading_ok && !v.sensitive && v.about_measure === 'yes') kept.push({ measure: t.measure, prompt: t.prompt, high: t.high, low: t.low, validated: false, review: 'glm-5.3-flash: reading ok, not sensitive, on the measure' });
    });
    console.log(`batch ${i / 9 + 1}: proposed ${taps.length}, kept so far ${kept.length}`);
  }
  const perMeasure = {}; for (const k of kept) perMeasure[k.measure] = (perMeasure[k.measure] || 0) + 1;
  const out = { note: 'Own wording, validated:false. Writer deepseek-v4.1-flash (Munito); reviewer glm-5.3-flash (Munito, a different family). Never described as a validated instrument.', proposed, kept: kept.length, items: kept.map((k, n) => ({ id: `tp:${k.measure}:${n}`, ...k })) };
  fs.writeFileSync(path.join(__dirname, '..', 'content', 'daily-check', 'tap-items.json'), JSON.stringify(out, null, 1));
  console.log(`proposed ${proposed}, kept ${kept.length}, measures covered ${Object.keys(perMeasure).length}/${IDS.length}`);
})().catch((e) => { console.error(e.message); process.exit(1); });
