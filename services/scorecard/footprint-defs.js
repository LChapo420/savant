/**
 * The footprints that are LIVE in the product (docs/SCORECARD-90.md section 11, "what is in the product"): the indicator each one feeds, the measures it
 * reads and which way. Pure data, no database, so indicators.js can read it without a cycle.
 *
 * Validity and error come from the design list, scripts/lib/scorecard-footprints.js, and are CONSERVATIVE ASSUMPTIONS, not measured: an indicator's
 * validity is the square root of its kind's ceiling (CP .40, VOL .35, EMB .50, PRM .35), and the likelihood in indicators.js then gives it its own
 * persistent error, sqrt(1 - v^2), plus the sampling noise of its n units. Each design footprint is its OWN indicator family: errors are assumed
 * independent between footprints (indicators of one footprint share the family correlation RHO). That independence is an assumption real data may
 * break (a learner who never taps anything skips them all), which is why the validities get re-measured against the designed items (11.6, item 6).
 *
 * footprint design id -> the indicators it feeds. `unit` is what one unit is (n of an observation counts these).
 */
'use strict';
const { KINDS, FOOTPRINTS } = require('../../scripts/lib/scorecard-footprints');

const round2 = (v) => Math.round(v * 100) / 100;
const KIND_OF = Object.fromEntries(FOOTPRINTS.map((f) => [f.id, f.kind]));

// [design footprint id, indicator key, what one unit is, [[measure, sign], ...]]
const LIVE_RAW = [
  ['extra_practice', 'fp.extra_practice', 'a sitting of the week: 1 if it was a replay of a level already passed or began after the day\'s minutes goal was met', [['intrinsic_motivation', 1], ['mastery_orientation', 1]]],
  ['extra_practice', 'fp.unprompted_start', 'a day with a sitting: 1 if the first sitting was the learner\'s own pick, not a scheduled review or retention enforcer', [['intrinsic_motivation', 1], ['mastery_orientation', 1]]],
  ['retry_after_fail', 'fp.retry_after_fail', 'a level not passed: minus log(1 + minutes until the learner worked that level again), capped at two days', [['productive_struggle', 1], ['persistence', 1]]],
  ['plan_set_and_kept', 'fp.plan_kept', 'a study day under a chosen daily goal: 1 if the active minutes reached 80% of it', [['planning_tendency', 1], ['strategy_awareness', 1], ['instruction_adherence', 1]]],
  ['plan_set_and_kept', 'fp.retention_choice', 'a retention goal saved: 1 for a test date or a bounded horizon, 0 for forever', [['planning_tendency', 1], ['strategy_awareness', 1]]],
  ['rule_switch', 'fp.switch_cost', 'a level of mixed reasoning items: log time on an item after a change of skill minus log time after the same skill, per level', [['cognitive_flexibility', -1], ['interference_susceptibility', 1]]],
  ['hint_or_try', 'fp.hint_first', 'a question where the coach was opened: 1 if within 8 s of the question appearing, 0 if the learner tried first', [['hint_dependency', 1], ['productive_struggle', -1]]],
  ['why_or_steps', 'fp.why_first', 'a lesson with a worked example: 1 if the learner opened "Why does this work?" before the checks, 0 if they went on with the steps', [['conceptual_bias', 1]]],
  ['deeper_or_move_on', 'fp.deeper', 'a closed level: 1 if the learner chose "Go deeper on this", 0 if "Move on"', [['depth_breadth', 1]]],
];

const LIVE = LIVE_RAW.map(([fp, key, unit, maps]) => {
  const kind = KIND_OF[fp];
  if (!kind || !KINDS[kind]) throw new Error(`footprint-defs: ${fp} is not in the design list`);
  const v = round2(Math.sqrt(KINDS[kind].rhoInf));
  return { fp, key, family: `fp.${fp}`, group: 'footprint', unit, kind, v, maps: maps.map(([stat, sign]) => ({ stat, sign, v })) };
});

/** Design footprints that are live, and the rest (design only). */
const LIVE_IDS = [...new Set(LIVE.map((d) => d.fp))];
const DESIGN_ONLY = FOOTPRINTS.map((f) => f.id).filter((id) => !LIVE_IDS.includes(id));

/** SCORECARD_FOOTPRINTS=off: no footprint is logged or read (comparison runs); default on. */
const isOn = () => String(process.env.SCORECARD_FOOTPRINTS || 'on').toLowerCase() !== 'off';

module.exports = { LIVE, LIVE_IDS, DESIGN_ONLY, isOn };
