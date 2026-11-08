/**
 * Custom material from the scorecard (docs/UPLOAD-4X.md lever 3). UPLOAD_CUSTOM=1 (default off).
 *
 * Only measures from the four classes whose DECISION accuracy beats the never-lean baseline are used (docs/SCORE-95.md, 30-day default world: habit 75.6, performance 73.4, contrast 69.3,
 * memory 68.6 against never-lean 57-61). Benefit, preference and hidden (63.6, 54.7, 58.3 against 64.0, 57.7, 63.8) are left out on purpose, and so are reasoning and scale, which that
 * table does not clear. A measure leans only past the card's hard edge (services/scorecard/decisions.js decide: 30 / 70) and only with confidence at or above MIN_CONF when one is given.
 *
 * Each rule says what the lean does to this learner's plan; votes on the same knob add, and a knob moves only when the votes agree past a threshold. Pure functions, no I/O.
 * plan(metrics) -> { used, ignored, knobs: { page, testFirst, practiceDelta, proofNeed, reviewScale, interleave, startTierBias, sitting }, reasons }
 *   metrics: { traitId: number | { measured, confidence } } on the 0-100 scorecard scale.
 */
'use strict';
const D = require('./scorecard/decisions');
const { INDEX } = require('./scorecard/ceilings');

const ALLOWED = new Set(['habit', 'performance', 'contrast', 'memory']);
const MIN_CONF = 0.5;
const enabled = () => process.env.UPLOAD_CUSTOM === '1';

// [trait, knob, effect of a LOW read (-1), effect of a HIGH read (+1)]. Directions follow the sim's own reading of each measure (scripts/upload-4x-sim.js paramsOf; decay_rate high = forgets faster).
const RULES = [
  ['prior_knowledge', 'testFirst', -1, 1],
  ['jargon_absorption', 'page', -1, 1],
  ['vocabulary_ceiling', 'page', -1, 1],
  ['brevity_preference', 'page', -1, 1],
  ['text_density_tolerance', 'page', -1, 1],
  ['instruction_adherence', 'practiceDelta', 1, 0],
  ['mastery_velocity', 'practiceDelta', 1, -1],
  ['guessing_propensity', 'proofNeed', 0, 1],
  ['rush_tendency', 'proofNeed', 0, 1],
  ['decay_rate', 'reviewScale', 1, -1],
  ['retention_index', 'reviewScale', -1, 1],
  ['retrieval_strength', 'reviewScale', -1, 1],
  ['interleaving_tolerance', 'interleave', -1, 1],
  ['interference_susceptibility', 'interleave', 1, -1],
  ['challenge_appetite', 'startTierBias', -1, 1],
  ['attention_runway', 'sitting', -1, 1],
  ['fatigue_curve', 'sitting', 1, -1],
];

const valueOf = (m) => (m == null ? null : typeof m === 'number' ? { v: m, c: null } : { v: Number(m.measured), c: m.confidence == null ? null : Number(m.confidence) });

function plan(metrics) {
  const votes = {}; const reasons = []; const ignored = [];
  for (const [id, knob, lowEffect, highEffect] of RULES) {
    const cls = INDEX[id];
    if (!ALLOWED.has(cls)) { ignored.push({ id, class: cls || null, why: 'class does not beat never-lean' }); continue; }
    const x = valueOf((metrics || {})[id]);
    if (!x || !Number.isFinite(x.v)) continue;
    if (x.c !== null && x.c < MIN_CONF) continue;
    const d = D.decide(x.v);
    if (d === 0) continue;
    const effect = d < 0 ? lowEffect : highEffect;
    if (!effect) continue;
    votes[knob] = (votes[knob] || 0) + effect;
    reasons.push({ id, class: cls, decision: d, knob, effect });
  }
  const v = (k) => votes[k] || 0;
  const knobs = {
    page: v('page') >= 2 ? 'lean' : v('page') <= -2 ? 'full' : 'default',
    testFirst: v('testFirst') > 0 ? 'all' : v('testFirst') < 0 ? 'off' : 'default',
    practiceDelta: Math.max(-1, Math.min(1, v('practiceDelta'))),
    proofNeed: v('proofNeed') >= 1 ? 3 : 2,
    reviewScale: v('reviewScale') >= 1 ? 1.2 : v('reviewScale') <= -1 ? 0.8 : 1,
    interleave: v('interleave') < 0 ? false : true,
    startTierBias: Math.max(-1, Math.min(1, v('startTierBias'))),
    sitting: v('sitting') < 0 ? 'short' : 'default',
  };
  return { used: reasons.length, ignored, knobs, reasons };
}

module.exports = { ALLOWED, MIN_CONF, RULES, enabled, plan };

/** This learner's plan from their scorecard; null when the switch is off, there is no card, or nothing leans. Never throws. */
function forUser(userId) {
  if (!enabled() || !userId) return null;
  try {
    /* eslint-disable global-require */
    const db = require('../config/db');
    const card = db.forUser('scorecards', userId)[0] || null;
    if (!card) return null;
    const scorecard = require('./scorecard');
    const { STATS } = require('./scorecard/stats');
    const metrics = {};
    for (const s of STATS) { if (ALLOWED.has(INDEX[s.id])) { const r = scorecard.read(card, s.id, {}); metrics[s.id] = { measured: r.measured, confidence: r.confidence }; } }
    const p = plan(metrics);
    return p.used ? p : null;
  } catch { return null; }
}
module.exports.forUser = forUser;
