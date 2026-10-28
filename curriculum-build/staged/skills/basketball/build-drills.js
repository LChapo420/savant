/**
 * Builds basketball/drills.json: combine protocols for the staged gates with their
 * statistics computed (makes needed, chance of a lucky pass, chance of an unlucky
 * fail), the miss-pattern fix map, decision-clip set specs and access swaps.
 *
 *   node curriculum-build/staged/skills/basketball/build-drills.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const S = require('../lib/stats');

// 0.9 for short gates (n_min <= 20) and 0.8 for longer ones: with a check after every set of 10
// (cap 200 attempts) that keeps a lucky pass by a shooter 10 points below the threshold at or under
// about 3% (simulated in verify-skill-curricula.js), while a shooter 10 points above passes ~97-99%.
const confFor = (n) => (n <= 20 ? 0.9 : 0.8);
function gate(id, stage, test, thr, n, extra = {}) {
  const CONF = confFor(n);
  const k = S.makesNeeded(thr, n, CONF);
  return {
    id, stage, test, threshold: thr, n_min: n, confidence: CONF,
    makes_needed_at_n_min: k,
    p_pass_if_true_rate_10_below: Math.round(S.binomUpper(k, n, Math.max(0.01, thr - 0.10)) * 1000) / 1000,
    p_pass_if_true_rate_at_threshold: Math.round(S.binomUpper(k, n, thr) * 1000) / 1000,
    p_fail_if_true_rate_10_above: Math.round((1 - S.binomUpper(k, n, Math.min(0.99, thr + 0.10))) * 1000) / 1000,
    ...extra,
  };
}

const combine = [
  gate('bb-layup-low-ring-R', 'BB1', 'lay-ups at a low ring, right hand, over 2 sessions', 0.5, 20),
  gate('bb-layup-low-ring-L', 'BB1', 'lay-ups at a low ring, left hand, over 2 sessions', 0.5, 20),
  gate('bb-form-1m', 'BB2', 'one-hand form shots from 1 m, age ring, 2 sessions', 0.6, 40),
  gate('bb-layup-dribble-R', 'BB2', 'lay-ups off a dribble, right hand', 0.6, 20),
  gate('bb-layup-dribble-L', 'BB2', 'lay-ups off a dribble, left hand', 0.6, 20),
  gate('bb-ft-junior', 'BB3', 'free throws at the age line and ring, routine every shot, 3 sessions', 0.5, 60),
  gate('bb-ft-youth', 'BB4-5', 'free throws, FIBA line, 3 sessions', 0.65, 100),
  gate('bb-spot-midrange', 'BB4-5', 'catch-and-shoot mid-range per zone (5 spots), 3 sessions', 0.45, 50, { note: 'threshold normed by age band after 200 learners [R]' }),
];

// How many attempts a single 'test day' would need for the same protection, for the record.
const sizing = [0.5, 0.6, 0.7, 0.8].map((p) => ({ true_rate: p, half_width_95_at_50: Math.round(1.96 * Math.sqrt(p * (1 - p) / 50) * 1000) / 1000, half_width_95_at_100: Math.round(1.96 * Math.sqrt(p * (1 - p) / 100) * 1000) / 1000, half_width_95_at_200: Math.round(1.96 * Math.sqrt(p * (1 - p) / 200) * 1000) / 1000 }));

const out = {
  subject: 'basketball', version: 1, status: 'STAGED', generated_by: 'basketball/build-drills.js',
  doc: 'Combine gates with computed statistics (Beta(1+makes, 1+misses) posterior; a gate passes when P(true rate >= threshold) >= the gate confidence (0.9 for gates of 20 attempts, 0.8 for longer ones) at n_min attempts or more, checked after every cold set), the 95% margin of a make rate at 50/100/200 attempts (why one short test day is never enough), a miss-pattern fix map, decision-clip set specs and equipment/access swaps. Counts are learner-confirmed; camera counts are estimates the learner can correct.',
  combine_gates: combine,
  sample_size_note: sizing,
  baselines: [
    { id: 'bb-base-form', test: '10 form shots from the lesson spot', use: "personal 'before' number; never ranked" },
    { id: 'bb-base-dribble', test: '30 s stationary dribble count, each hand', use: 'weak/strong ratio for the weak_hand lever' },
    { id: 'bb-base-layup', test: '10 lay-ups each hand', use: 'starting point for BB1-BB2 gates' },
  ],
  miss_pattern_map: [
    { miss: 'short', fix_drill: 'legs-to-arc: dip and push the floor away, then a higher arc toward the back half of the rim', cue: 'push the floor away; send it up and over the front of the rim' },
    { miss: 'long', fix_drill: 'soft-touch form shots close in, higher arc, hold the follow-through', cue: 'high arc, soft drop through the middle' },
    { miss: 'left or right', fix_drill: 'line shooting: shoot along a floor line toward the rim, one hand', cue: 'send the ball straight up the line to the middle of the rim' },
    { miss: 'flat (low arc)', fix_drill: 'shoot over a raised target (a held pad or a partner hand) at short range', cue: 'over the hand, down into the rim' },
  ],
  decision_clip_sets: [
    { id: 'dc-2v1', stage: 'BB1', format: 'top-down SVG court, pause at decision, 3 options (pass, shoot, dribble)', items: 10, pass: 0.8 },
    { id: 'dc-3v3', stage: 'BB2', format: 'top-down SVG, 3-4 options (open teammate, cut, fill, hold)', items: 15, pass: 0.8 },
    { id: 'dc-4v4-first-person', stage: 'BB3', format: 'first-person scenes as in Rosch, Schultz & Honer 2021: 4 passing options (right/left, inside/outside), each scene twice in random blocks, accuracy primary, response time secondary', items: 18, pass: 0.8 },
    { id: 'dc-ball-screen', stage: 'BB4-5', format: 'first-person or broadcast-angle SVG; options include reject/use the screen, pass to roller/popper, pull-up', items: 24, pass: 0.8 },
    { id: 'dc-varsity', stage: 'BB6-7', format: 'mixed: transition, zone recognition, late-clock choices', items: 30, pass: 0.8 },
  ],
  access_swaps: [
    { missing: 'hoop', swap: 'form shooting up a wall line or into a laundry basket; finishing footwork without the ball; objectives needing a hoop wait in the queue and are flagged' },
    { missing: 'partner', swap: 'wall passes, rebound-return net or self-toss catch-and-shoot; ghost defence for reads' },
    { missing: 'indoor space only', swap: 'stationary handling with a soft ball, tape targets, imagery scripts' },
    { missing: 'time', swap: 'the session card keeps warm-up + the one cold set + one game-like drill; no objective is removed' },
  ],
};
fs.writeFileSync(path.join(__dirname, 'drills.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify(combine.map((g) => [g.id, g.makes_needed_at_n_min + '/' + g.n_min, g.p_pass_if_true_rate_10_below, g.p_pass_if_true_rate_at_threshold, g.p_fail_if_true_rate_10_above])));
