/**
 * The translation layer: from one hundred numbers to a short list of things a
 * writer can actually do.
 *
 * A model handed "deductive_trajectory: 73" does not reliably turn it into the
 * right teaching move, and a hundred numbers dilute its attention. So the
 * numbers stop here. What leaves this file is a ranked list of plain
 * instructions, built under four rules:
 *
 *   1. Filter. Only stats clearly away from neutral, and only ones the app is
 *      confident about, produce an instruction. Everything else stays at the
 *      writer's sensible default.
 *   2. Convert. Each stat has hand-written instruction text for its low and
 *      high side (stats.js). Nothing is generated here.
 *   3. Resolve. Pairs of instructions that would pull against each other are
 *      replaced by one combined instruction written for that combination, so
 *      the model never has to pick a side.
 *   4. Rank and cap. Ranked by impact x distance from neutral x confidence,
 *      and capped, so the most important instructions are read first and the
 *      list stays short enough to be followed.
 */
const scorecard = require('./index');
const { STATS, BY_ID } = require('./stats');

const EDGE = Number(process.env.SCORECARD_EDGE || 20);           // distance from 50 that counts as "clearly"
const MIN_CONF = Number(process.env.SCORECARD_MIN_CONFIDENCE || 30);
// Instruction-following degrades as instructions pile up, and the middle of a
// long list is read least (research report 4.2), so at most six, most important first.
const MAX_DIRECTIVES = Number(process.env.SCORECARD_MAX_DIRECTIVES || 6);
// How many standard errors from 50 a measured score must be before it steers a
// lesson. At 2, a directive is on the wrong side of the learner's true value
// less than about one time in forty.
const GATE_Z = Number(process.env.SCORECARD_GATE_Z || 2);
// And the measurement has to rest on enough evidence of its kind, unless a
// designed test (placement) measured it. The posterior's standard error says
// how sure the model is; these say whether there is enough data for the model
// itself to be trusted. Early false directives came from thin first-week data.
const MIN_EVIDENCE = {
  value: 8,         // updates that carried measured weight
  rate: 30,         // chances
  contrast: 15,     // answers on the thinner side
  shift: 10,        // answers on the thinner side
  experiment: 6,    // outcome answers on the thinner arm
  tap: 8,           // taps
  memory: 20,       // memory tests
  velocity: 300,    // fresh answers behind the slope of ability over practice
  pace: 50,         // ordinary answers behind the answer pace
  reach: Number(process.env.SCORECARD_REACH_MIN || 150), // fresh answers in the subject behind where they stand against the course (round 4)
};
// Once there is a population, the gate is a calibrated posterior instead
// (scorecard.standing: the learner's place among learners, z in
// between-learner SDs, with its posterior SD). A false directive is one on the
// wrong side of the typical learner, so the gate asks exactly that: a
// directive needs P(the trait is on that side of the typical learner) >=
// SIDE_P, and the posterior's best estimate at least MEAN_Z from the middle
// (0.88: the 65 of a 50 +/- 17 scale, roughly the top or bottom fifth).
// (Measured against "P(beyond 0.88) >= 0.9": the same false-directive rate,
// fewer true directives.)
const SIDE_P = Number(process.env.SCORECARD_SIDE_P || 0.98);
const MEAN_Z = Number(process.env.SCORECARD_MEAN_Z || 15 / 17);
// What is measured is a behaviour (how often they rush, how fast they answer);
// the directive is about the trait behind it, and the two are not the same
// thing (a rusher's lucky fast answers, help seeking that leaks into coach
// reliance). So the posterior is widened as if the behaviour's true level
// correlated VALIDITY with the trait: z_trait | z_behaviour ~ N(V z, 1 - V^2).
// At 1, the measured cases above went false 3% of the time; at 0.9, 0.5%.
const VALIDITY = Number(process.env.SCORECARD_VALIDITY || 0.9);
function toTrait(st) {
  const v = Math.min(VALIDITY, st.v || 1);
  return { z: v * st.z, sd: Math.sqrt(v * v * st.sd * st.sd + 1 - v * v) };
}
// SCORECARD_STANDING=off keeps the pre-population gate everywhere (comparison runs).
const STANDING = process.env.SCORECARD_STANDING !== 'off';
const FALLBACK_TRAIT = process.env.SCORECARD_FALLBACK_TRAIT !== 'off';
// Memory-kind stats (decay, retention, retrieval) steer no lesson by default
// (step 22). SCORECARD_MEMORY_STEER=on lets them through the same gate, for
// re-measuring that finding (BASELINE step 35).
const MEMORY_STEER = process.env.SCORECARD_MEMORY_STEER === 'on';
// "(strong)" when the best estimate is in the top or bottom fifteenth.
const STRONG_Z = 1.5;

/** The standard normal CDF (Abramowitz-Stegun 26.2.17; error < 1e-7). */
function phi(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp(-x * x / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x > 0 ? 1 - p : p;
}

/** P(true standing beyond +/- edge) on each side, from a standing posterior. */
function beyond(st, edge) {
  return { high: 1 - phi((edge - st.z) / st.sd), low: phi((-edge - st.z) / st.sd) };
}

// With a calibrated standing (below) a rate's counting noise is in its
// posterior (the logit's variance), so it needs fewer chances than the bare
// score did: persistence sees a run of three misses about 13 times in 100
// levels. (Lowering every kind's minimum was measured: more false directives,
// from thin value paths and tap posteriors at 30 levels.)
const MIN_EVIDENCE_CALIBRATED = { ...MIN_EVIDENCE, rate: 10 };
function enoughEvidence(evidence, min = MIN_EVIDENCE) {
  if (!evidence) return false;
  if (evidence.legacy) return true;
  if (evidence.value >= min.value) return true;
  return !!evidence.kind && evidence.count >= (min[evidence.kind] || Infinity);
}

/**
 * Combinations with their own instruction. Each is [statA, sideA, statB, sideB,
 * text] where side is 'high' or 'low'; when both are active, both are replaced.
 */
const COMBINED = [
  ['step_explicitness', 'high', 'brevity_preference', 'high',
    'Show every step, but keep each step to one short line, and cut every sentence that is not a step or a required point.'],
  ['inductive_trajectory', 'high', 'deductive_trajectory', 'high',
    'Show one quick concrete case, then state the rule, then confirm it on a second case.'],
  ['attention_runway', 'low', 'worked_example_dependence', 'high',
    'Keep the lesson short and make one fully annotated worked example its centerpiece; drop everything else that is not required.'],
  ['attention_runway', 'low', 'example_density_need', 'high',
    'Keep the lesson short: use several very brief examples (one line each) instead of long explanation.'],
  ['brevity_preference', 'high', 'example_density_need', 'high',
    'Teach mostly through short examples and cut explanatory prose to the minimum.'],
  ['prior_knowledge', 'high', 'step_explicitness', 'high',
    'Skip the basics the learner already knows, but show every step of the new part.'],
  ['prior_knowledge', 'low', 'brevity_preference', 'high',
    'Assume no background, but keep each prerequisite to a single short clause in passing rather than a detour.'],
  ['brevity_preference', 'high', 'consolidation_need', 'high',
    'Keep the lesson tight, and end with a three-line recap of the key points.'],
  ['challenge_appetite', 'high', 'frustration_threshold', 'low',
    'Include a hard case, but approach it in small, clearly signposted steps so it never feels like a wall.'],
  ['narrative_pull', 'high', 'brevity_preference', 'high',
    'Frame the lesson in a very short scenario (two sentences at most), then get straight to the content.'],
  ['interest_transfer', 'high', 'narrative_pull', 'high',
    'Build a short scenario around one of the learner\'s interests listed below and teach the idea inside it.'],
  ['abstraction_tolerance', 'low', 'notation_comfort', 'low',
    'Keep everything concrete and in words; introduce a symbol only at the very end, read out in words.'],
  ['dialogic_preference', 'high', 'cycle_architecture', 'low',
    'Write it as a sequence of short question-and-answer exchanges, each followed by a quick self-check.'],
  ['dialogic_preference', 'low', 'generation_effect', 'high',
    'Explain directly, but before each step of the worked example ask the learner to predict it.'],
];

function side(score) {
  if (score >= 50 + EDGE) return 'high';
  if (score <= 50 - EDGE) return 'low';
  return null;
}

/**
 * The ranked instructions for one learner.
 *
 * @param {object} card     the scorecard (scorecard.get)
 * @param {object} opts
 * @param {string} [opts.use]       'L' for a lesson, 'C' for the coach
 * @param {string} [opts.trackId]   subject, for per-subject stats
 * @param {boolean} [opts.hasInterests]  drop interest instructions when there are none
 * @param {number} [opts.max]
 */
function directives(card, { use = 'L', trackId = null, hasInterests = true, max = MAX_DIRECTIVES } = {}) {
  const active = {};
  for (const stat of STATS) {
    if (!stat.use.includes(use)) continue;
    // The measured score, not the shown one: the after-level model read can
    // move what the learner sees, but a lesson only changes on measurement.
    const read = scorecard.read(card, stat.id, { trackId });
    const { confidence, se, tested } = read;
    // Scaffolding fade rests on the subject's own reach (how far ahead of the
    // course they are), so its evidence is that subject's count.
    const evidence = stat.id === scorecard.REACH_STAT && scorecard.reachEvidence ? scorecard.reachEvidence(card, trackId) : read.evidence;
    let score = read.measured;
    // Two kinds of measurement steer no lesson, whatever they say. The
    // forgetting model's posterior was found over-confident (another seed of the
    // simulation: a learner of true decay 47 read z 2.2 +/- 0.6 from 108 memory
    // tests); until reviews are scheduled to measure memory, decay, retention
    // and retrieval are shown, not acted on. And a rate read inverted as a
    // second stat (scorecard SECONDARY_RATES: scroll-backs as low tolerance
    // for dense text, repeated mistakes as not learning from errors) is the
    // first stat's evidence; it went false on learners who simply re-read a lot.
    if ((evidence && evidence.kind === 'memory' && !MEMORY_STEER) || (scorecard.SECONDARY_RATES && scorecard.SECONDARY_RATES.has(stat.id))) continue;
    const st0 = STANDING ? scorecard.standing(card, stat.id, { trackId }) : null;
    const st = st0 && toTrait(st0);
    if (!tested && !enoughEvidence(evidence, st ? MIN_EVIDENCE_CALIBRATED : MIN_EVIDENCE)) continue;
    let s;
    let strong;
    let sure = confidence / 100;
    if (st) {
      // Calibrated: where the learner stands among learners.
      const p = beyond(st, 0);
      s = p.high >= SIDE_P && st.z >= MEAN_Z ? 'high' : p.low >= SIDE_P && st.z <= -MEAN_Z ? 'low' : null;
      if (!s) continue;
      sure = p[s];
      score = Math.round(100 * phi(st.z));   // the posterior's percentile, for ranking
      strong = Math.abs(st.z) >= STRONG_Z;
    } else {
      // No population yet: the 0-100 score, its confidence, and GATE_Z
      // standard errors from 50, so a noisy early reading that happens to land
      // past the edge does not change a lesson.
      if (confidence < MIN_CONF) continue;
      if (se && Math.abs(score - 50) < GATE_Z * se) continue;
      s = side(score);
      if (!s) continue;
      // And the same trait rule as a standing, reading the score as if 17
      // points were one between-learner SD (the scale the edge of 20 assumes):
      // a behaviour is not the trait, whatever its standard error.
      if (FALLBACK_TRAIT && se) {
        const t = toTrait({ z: (score - 50) / 17, sd: se / 17 });
        if (beyond(t, 0)[s] < SIDE_P) continue;
      }
      strong = Math.abs(score - 50) >= 35;
    }
    const text = stat.dir[s === 'high' ? 1 : 0];
    if (!text) continue;
    if (stat.id === 'interest_transfer' && s === 'high' && !hasInterests) continue;
    const distance = Math.abs(score - 50) / 50;
    active[stat.id] = {
      stat: stat.id,
      name: stat.name,
      side: s,
      score,
      confidence,
      strong,
      text,
      priority: (stat.impact + 1) * distance * sure,
      // For the insertion contract (contract.js): which gate passed it, the
      // posterior probability it is on this side (null on the score gate,
      // which has no posterior), and the evidence it rests on.
      gate: st ? 'standing' : tested ? 'test' : 'score',
      p: st ? Number(sure.toFixed(4)) : null,
      evidence: evidence ? { kind: evidence.kind || 'value', count: evidence.kind ? evidence.count : evidence.value } : null,
    };
  }

  // Resolve combinations before ranking, so a combined instruction competes for
  // a slot with the priority of the stronger of its two parts.
  const combined = [];
  for (const [a, sa, b, sb, text] of COMBINED) {
    if (active[a] && active[b] && active[a].side === sa && active[b].side === sb) {
      combined.push({
        stat: `${a}+${b}`,
        name: `${BY_ID[a].name} + ${BY_ID[b].name}`,
        side: 'combined',
        score: null,
        confidence: Math.min(active[a].confidence, active[b].confidence),
        strong: active[a].strong || active[b].strong,
        text,
        priority: Math.max(active[a].priority, active[b].priority) + 0.01,
        parts: [a, b],
        sides: [sa, sb],
        gate: active[a].gate === active[b].gate ? active[a].gate : 'mixed',
        p: active[a].p !== null && active[b].p !== null ? Math.min(active[a].p, active[b].p) : null,
        evidence: null,
      });
      delete active[a];
      delete active[b];
    }
  }

  return [...Object.values(active), ...combined]
    .sort((x, y) => y.priority - x.priority)
    .slice(0, max);
}

/** The instructions as numbered prompt text. "Strongly" marks the clear cases. */
function asPromptText(list) {
  if (!list.length) return '';
  return list.map((d, i) => `${i + 1}. ${d.strong ? '(strong) ' : ''}${d.text}`).join('\n');
}

/**
 * A one-line read of how well the app knows this learner, so the writer knows
 * whether to follow the instructions tightly or teach in a balanced default way.
 */
function certaintyNote(card, list = null) {
  const overall = scorecard.overallConfidence(card);
  // What the writer is about to read matters more than the average over all
  // hundred stats: confident instructions are confident whatever the rest say.
  if (list && list.length) {
    return 'The numbered instructions below are measured from this learner\'s own behaviour and are reliable. '
      + 'For anything they do not cover, teach in a balanced, clear way.';
  }
  if (overall < 15) {
    return 'Very little is known about this learner yet. Teach in a balanced, clear default style and follow only the instructions listed.';
  }
  if (overall < 45) {
    return 'Some evidence about this learner exists. Follow the listed instructions; for everything else use a balanced default.';
  }
  return 'This learner\'s profile is well established. Follow the listed instructions closely.';
}

module.exports = { directives, asPromptText, certaintyNote, COMBINED, EDGE, MIN_CONF, MAX_DIRECTIVES, GATE_Z, MIN_EVIDENCE, SIDE_P, MEAN_Z, VALIDITY, phi, beyond };
