/**
 * Personalization: what the learning scorecard adds to the single prompt that
 * writes a level for one learner (services/level-editor.js).
 *
 * The level editor already sends the creator's lesson page and the details brief
 * (services/details.js) — the survey in the learner's own words, their feedback
 * and its conclusions, where they stand. This adds the measured half:
 *
 *   scorecardSection  the 100-stat scorecard, already translated into a short
 *                     ranked list of instructions (scorecard/translate.js) —
 *                     never the raw numbers — plus how sure the app is and how
 *                     the last few levels went. Part of the details brief, so a
 *                     change in what the scorecard says makes a written page
 *                     stale and it is rewritten.
 *
 *   armFor            measurement built into the rewrite. A small share of
 *                     levels (PERSONALIZE_HOLDOUT, default 10%) are not tailored
 *                     at all, so `npm run scorecard:report` can show whether
 *                     tailored pages beat the shared one for the same learners.
 *                     On a share of the rest (PERSONALIZE_EXPERIMENT_RATE), one
 *                     stat the app is not yet sure about is deliberately taught
 *                     one way — examples first or rule first, an analogy or
 *                     none — and the next level's result, then delayed review,
 *                     is credited to that choice. Whether a level is a holdout
 *                     or an experiment is a hash of learner and level. WHICH
 *                     stat and arm (round 8, PERSONALIZE_ALLOCATOR=info) goes
 *                     where one more experiment teaches the app the most about
 *                     this learner, weighted by how much the stat changes a
 *                     lesson, and is stored the first time it is asked, so a
 *                     level's arm is the same every time it is asked about and
 *                     a page is never rewritten because the card moved.
 *                     PERSONALIZE_ALLOCATOR=weighted is the old hash-weighted
 *                     pick (the rollback). Round 9: under the allocator a page
 *                     can cross up to PERSONALIZE_FACTORIAL dimensions (default 1)
 *                     that do not touch the same part of it (PARTS), each
 *                     credited with the same outcome (signals.experimentsOf).
 *
 *   choiceDimension   which experiment stat a "which is clearer?" pairwise
 *                     choice (services/boosters.js choice) should ask about
 *                     next, by the same expected-information rule.
 *
 *   checkAgainstBase  two checks a tailored page must pass on top of the editor's
 *                     page contract: every element id in the creator's page is
 *                     still there (the page's script finds its controls by id), and
 *                     every script still compiles.
 *
 * Model: the `personalize` route — DeepSeek V4.1 Flash on OpenRouter, backed by
 * MiMo V2.6 Pro (services/providers).
 */
const crypto = require('crypto');
const vm = require('vm');
const providers = require('./providers');
const scorecard = require('./scorecard');
const translate = require('./scorecard/translate');
const learner = require('./learner');

const db = require('../config/db');
const { BY_ID } = require('./scorecard/stats');

const HOLDOUT = Number(process.env.PERSONALIZE_HOLDOUT === undefined ? 0.1 : process.env.PERSONALIZE_HOLDOUT);
const EXPERIMENT_RATE = Number(process.env.PERSONALIZE_EXPERIMENT_RATE === undefined ? 0.35 : process.env.PERSONALIZE_EXPERIMENT_RATE);
const EXPERIMENT_MAX_CONFIDENCE = 60;

function isEnabled() {
  return !!providers.current('personalize');
}

// ── the measured half of the brief ─────────────────────────────────────────
/**
 * The scorecard as lines for the details brief. No numbers and nothing random,
 * so the brief only changes when what the scorecard says changes.
 *
 * @param {number} userId
 * @param {{trackId?: string, gradeId?: string}} [where]
 * @returns {string[]}
 */
function scorecardSection(userId, where = {}, { recent = true } = {}) {
  // The owner gets the base product: nothing about them goes into a writer's
  // prompt (config/owner.js ownerBase; OWNER_BASE=off lifts it).
  // eslint-disable-next-line global-require
  if (require('../config/owner').ownerBase(userId)) return [];
  const card = scorecard.get(userId);
  const list = translate.directives(card, {
    use: 'L',
    trackId: where.trackId || null,
    hasInterests: learner.hasStatedInterests(userId),
  });
  // Nothing confident: say nothing (the research report's "omit, don't
  // hedge"). The writer's default is already "balanced and clear", and two
  // lines saying so cost tokens on most levels.
  const lines = [];
  if (list.length) {
    lines.push('HOW THEY LEARN BEST (measured from their behavior by the learning scorecard, most important first)');
    lines.push(`- ${translate.certaintyNote(card, list)}`);
    list.forEach((d, i) => lines.push(`${i + 1}. ${d.strong ? '(strong) ' : ''}${d.text}`));
  }
  if (recent) {
    const tail = recentLevelsSection(userId, where);
    if (tail.length && lines.length) lines.push('');
    lines.push(...tail);
  }
  return lines;
}

/**
 * How the last few levels went, from the scorecard's own level rows. These
 * change every level, so the details brief puts them last (after everything
 * that stays the same from level to level) for the providers' prompt caches.
 */
function recentLevelsSection(userId, where = {}) {
  // eslint-disable-next-line global-require
  const hooks = require('./scorecard/hooks');
  const conclusions = hooks.conclusionsFor(userId, { trackId: where.trackId, gradeId: where.gradeId, max: 5 });
  if (!conclusions.length) return [];
  return ['HOW THEIR RECENT LEVELS WENT (oldest first)', ...conclusions.map((c) => `- ${c}`)];
}

// ── holdout and experiments ────────────────────────────────────────────────
/**
 * The ways of teaching that can be tried on one level and judged by the result.
 * Each has a plain instruction for both arms. Every instruction has to be safe
 * for any subject and any age: it changes how something is taught, never what,
 * and never asks for anything frightening, harsh or competitive. `choice: false`
 * marks one that two short versions of an explanation cannot show (a page's
 * interactive structure), so it is never asked as a pairwise choice.
 */
const BASE_EXPERIMENTS = [
  { stat: 'inductive_trajectory', label: 'examples before the rule',
    high: 'Open with two or three concrete cases and state the rule only after them.',
    low: 'State the rule first, plainly, then show the cases.' },
  { stat: 'analogical_transfer', label: 'an analogy',
    high: 'Teach the core idea through one strong analogy to something familiar, mapped back explicitly.',
    low: 'Use no analogies or metaphors at all; explain the thing itself.' },
  { stat: 'narrative_pull', label: 'a story frame',
    high: 'Frame the teaching as a short story about a character facing a problem the idea solves.',
    low: 'No story or scenario; go straight to the content.' },
  { stat: 'interest_transfer', label: 'examples built on their interests',
    high: 'Build every example and worked example around what they said they are interested in.',
    low: 'Use neutral examples for this level, not their interests.' },
  { stat: 'brevity_preference', label: 'a very short version',
    high: 'Make the teaching as short as possible without dropping anything the level teaches.',
    low: 'Give a fuller explanation, with the reasoning behind each point spelled out.' },
  { stat: 'worked_example_dependence', label: 'extra worked examples',
    high: 'Make the worked examples the centerpiece, fully annotated, and add one more.',
    low: 'Keep worked examples brief and let the principle carry the teaching.' },
  { stat: 'curiosity_hook', label: 'a puzzle opener',
    high: 'Open with a puzzling question or surprising fact that the level then answers.',
    low: 'Open by stating plainly what the level covers.' },
  { stat: 'dialogic_preference', label: 'a question-and-answer style',
    high: 'Write the teaching as questions the learner would ask, each followed by its answer.',
    low: 'Explain directly; pose no questions in the teaching text.' },
  { stat: 'cycle_architecture', label: 'one continuous explanation', choice: false,
    high: 'Teach the whole idea in one continuous run before anything interactive.',
    low: 'After each short teaching section, put one quick interactive check before the next.' },
  { stat: 'abstraction_tolerance', label: 'the principle stated abstractly first',
    high: 'State the general principle first, abstractly; concrete cases confirm it.',
    low: 'Anchor everything in a concrete case first; generalize only at the end.' },
  { stat: 'humor_receptivity', label: 'light humor',
    high: 'Include a touch of light humor where it helps an idea stick.',
    low: 'Keep the tone entirely straightforward; no humor.' },
];

/**
 * Round 8: stats that had no measurement at all (only the after-level model's opinion), now tried the same way. Each one is a choice about
 * how to teach that a lesson writer can follow on any page and that two short versions of an explanation can show. Stats whose high arm
 * would push something on a learner (competition, points to beat) are not here; neither are those with no lesson directive to change.
 * PERSONALIZE_DIMENSIONS=base keeps only the eleven above.
 */
const NEW_EXPERIMENTS = [
  { stat: 'example_density_need', label: 'several examples per idea',
    high: 'Give two or three varied examples for each idea, deliberately different on the surface.',
    low: 'Give exactly one well-chosen example for each idea.' },
  { stat: 'jargon_absorption', label: 'the proper terms from the start',
    high: 'Use the subject\'s proper terms from the start, each defined once in a short clause.',
    low: 'Use everyday words; bring in at most two technical terms, each defined when it first appears and again the next time it is used.' },
  { stat: 'global_framing_need', label: 'a big-picture opening',
    high: 'Open with one or two sentences on where this lesson fits in the bigger picture and what it unlocks, before any detail.',
    low: 'Start directly with the first idea; no big-picture opening.' },
  { stat: 'mnemonic_receptivity', label: 'a memory aid',
    high: 'Where there is a list, an order or a rule to remember, give one short memory aid for it.',
    low: 'Use no mnemonics or memory tricks; explain why the order or rule is what it is.' },
  { stat: 'tone_formality', label: 'a formal register',
    high: 'Write in a clear, formal, textbook register.',
    low: 'Write casually and conversationally, like a friendly older student explaining it; keep it respectful.' },
  { stat: 'relevance_demand', label: 'where it is used in real life',
    high: 'Say early and concretely where this is used in everyday life or what it lets the learner do.',
    low: 'Teach the idea for its own sake; give no real-world justification.' },
  { stat: 'novelty_hunger', label: 'a varied format',
    high: 'Vary the format inside the lesson: a short scenario, a quick puzzle and a worked case, not three similar sections.',
    low: 'Use one familiar, predictable structure throughout: explanation, example, check.' },
  { stat: 'feedback_tone_sensitivity', label: 'gently framed corrections',
    high: 'Frame every correction in the page\'s checks gently and constructively.',
    low: 'Make every correction in the page\'s checks plain and brief: say what was wrong and what is right, with no cushioning, and never harshly.' },
  { stat: 'praise_sensitivity', label: 'specific acknowledgement',
    high: 'Acknowledge progress specifically (never generically) where the learner gets something right.',
    low: 'Give no praise or encouragement; keep feedback to what was right or wrong.' },
  { stat: 'social_framing', label: 'people in the examples',
    high: 'Put people in the examples: named characters making decisions.',
    low: 'Keep the examples about objects, numbers and situations, with no characters.' },
  { stat: 'emotional_engagement', label: 'examples with real stakes',
    high: 'Give the examples real stakes: something that matters to someone if it goes wrong (never frightening, violent or upsetting).',
    low: 'Keep the examples low-stakes and neutral.' },
];
const EXPERIMENTS = process.env.PERSONALIZE_DIMENSIONS === 'base' ? BASE_EXPERIMENTS : [...BASE_EXPERIMENTS, ...NEW_EXPERIMENTS];

// How much more often an experiment goes to these choices than to the rest.
const EXPERIMENT_FOCUS = { interest_transfer: Number(process.env.PERSONALIZE_FOCUS_WEIGHT || 4), brevity_preference: Number(process.env.PERSONALIZE_FOCUS_WEIGHT || 4) };

/** A number in [0, 1) from a string, stable across runs. */
function unit(text) {
  return crypto.createHash('sha1').update(text).digest().readUInt32BE(0) / 2 ** 32;
}

/**
 * Which arm one learner's version of one level is in.
 *
 * @returns {{arm: 'holdout'|'tailored', experiment: object|null}}
 */
function armFor(userId, where) {
  const key = `${userId}:${where.trackId}:${where.gradeId}:${where.level}`;
  if (unit(`holdout:${key}`) < HOLDOUT) return { arm: 'holdout', experiment: null };
  // Max-accuracy mode (services/boosters.js): an experiment on every tailored page, so what works for this learner is measured sooner.
  const rate = require('./boosters').maxAccuracy.isOn(userId) ? 1 : EXPERIMENT_RATE; // eslint-disable-line global-require
  if (unit(`experiment:${key}`) >= rate) return { arm: 'tailored', experiment: null };
  if (ALLOCATOR() === 'info') return { arm: 'tailored', experiment: allocated(userId, where, key) };
  const card = scorecard.get(userId);
  const open = EXPERIMENTS.filter((e) => scorecard.read(card, e.stat).confidence < EXPERIMENT_MAX_CONFIDENCE);
  if (!open.length) return { arm: 'tailored', experiment: null };
  // Experiments are few (a third of tailored pages), and one learner's effect
  // needs many of them, so they go mostly to the choices the research keeps as
  // lesson constructs (EXPERIMENT_FOCUS: interest-based examples and length)
  // rather than evenly over every choice. Still decided by the hash, so a
  // level's arm never changes.
  const weights = open.map((e) => (EXPERIMENT_FOCUS[e.stat] || 1));
  let pick = unit(`which:${key}`) * weights.reduce((a, w) => a + w, 0);
  let index = 0;
  while (index < open.length - 1 && pick >= weights[index]) { pick -= weights[index]; index++; }
  const e = open[index];
  const side = unit(`side:${key}`) < 0.5 ? 'high' : 'low';
  return { arm: 'tailored', experiment: { stat: e.stat, label: e.label, arm: side, text: e[side] } };
}

// ── the information allocator (round 8) ────────────────────────────────────
// An experiment's outcome is read against what the ability model expected (signals.residuals), so one experiment adds about
// ARM_INFO = sum of p(1 - p) over the next level's main answers (about seven at p near 0.7) to its arm. What that buys depends on what is
// already known: the learner's standing z on the stat has a posterior (scorecard.experimentState: the arm outcomes and any pairwise
// choices), and the difference between arms, d ~ N(tau z, 1/v_high + 1/v_low), tells the most when it fills the thinner arm of a stat
// still unknown. So each experiment goes to the stat and arm with the largest expected cut in the posterior variance of z, times the
// stat's importance: its impact on a written lesson (stats.js, 1-3, as (1 + impact) / 2) and the research's focus on interest-based
// examples and length (EXPERIMENT_FOCUS, as a fourth root), a tilt of at most about 3 to 1. The posterior counts everything measured about
// the stat (its standing, when there is one: brevity's length taps as well as its arms). Because one arm alone says nothing about a
// difference, the rule fills a stat's second arm before opening another, so experiments concentrate on a few stats at a time instead of
// spreading thinly over all of them: with about fifteen in a month of use, twenty stats with one each would measure none.
const ALLOCATOR = () => (process.env.PERSONALIZE_ALLOCATOR === 'weighted' ? 'weighted' : 'info');
const ARM_INFO = Number(process.env.PERSONALIZE_ARM_INFO || 1.4);
const ARM_PRIOR = 0.3; // information each arm is treated as already holding, so a stat with one arm filled is not infinitely uncertain
const blockedStats = () => new Set(String(process.env.PERSONALIZE_SKIP_STATS || '').split(',').map((s) => s.trim()).filter(Boolean));

/** How much a stat changes what is taught: its directive impact, tilted by the research focus. 0 when it has no lesson directive. */
function importanceOf(stat) {
  const s = BY_ID[stat];
  if (!s || !String(s.use || '').includes('L') || !(s.dir || []).some(Boolean)) return 0;
  return ((1 + Math.max(1, Number(s.impact) || 1)) / 2) * (EXPERIMENT_FOCUS[stat] || 1) ** 0.25;
}

/** The allocator's view of a stat: its arms and choices (scorecard.experimentState), with the SD of everything measured about it. */
function stateOf(card, stat) {
  const st = scorecard.experimentState(card, stat);
  const standing = scorecard.standing ? scorecard.standing(card, stat) : null;
  return standing && standing.sd > 0 && standing.sd < st.sd ? { ...st, sd: standing.sd } : st;
}

/** The experiments open for this learner: not yet confidently known, not switched off (PERSONALIZE_SKIP_STATS, or the learner's own lesson_prefs.off). */
function openExperiments(userId, card, { forChoice = false } = {}) {
  const off = blockedStats();
  let own = [];
  try { own = ((learner.getProfile(userId) || {}).lesson_prefs || {}).off || []; } catch { own = []; }
  for (const s of own) off.add(String(s));
  const interests = (() => { try { return learner.hasStatedInterests(userId); } catch { return false; } })();
  return EXPERIMENTS.filter((e) => !off.has(e.stat) && importanceOf(e.stat) > 0
    && !(e.stat === 'interest_transfer' && !interests)
    && !(forChoice && e.choice === false)
    && scorecard.read(card, e.stat).confidence < EXPERIMENT_MAX_CONFIDENCE);
}

/** The cut in the posterior variance of z from adding `info` to one arm (`arm`: 'high' | 'low'). */
function armGain(st, arm, info = ARM_INFO) {
  const tau2 = st.tau * st.tau;
  const s2 = (vh, vl) => 1 / (vh + ARM_PRIOR) + 1 / (vl + ARM_PRIOR);
  const before = 1 / (st.sd * st.sd);
  const now = s2(st.vHigh, st.vLow);
  const next = arm === 'high' ? s2(st.vHigh + info, st.vLow) : s2(st.vHigh, st.vLow + info);
  const after = before + tau2 * (1 / next - 1 / now);
  return 1 / before - 1 / after;
}

/**
 * What one more experiment on a stat is worth per experiment. A stat with neither arm yet tested is valued over the two experiments it
 * takes to fill both (half their joint gain each): one arm alone says nothing about a difference, so a one-step look would never open a
 * new stat while any started one still gains a little.
 */
function experimentValue(st, arm) {
  const one = armGain(st, arm);
  if (st.vHigh >= ARM_INFO / 2 || st.vLow >= ARM_INFO / 2) return one;
  const first = arm === 'high' ? { ...st, vHigh: st.vHigh + ARM_INFO } : { ...st, vLow: st.vLow + ARM_INFO };
  const tau2 = st.tau * st.tau;
  const s2 = (x) => 1 / (x.vHigh + ARM_PRIOR) + 1 / (x.vLow + ARM_PRIOR);
  const both = arm === 'high' ? { ...first, vLow: first.vLow + ARM_INFO } : { ...first, vHigh: first.vHigh + ARM_INFO };
  const before = 1 / (st.sd * st.sd);
  const after = before + tau2 * (1 / s2(both) - 1 / s2(st));
  return Math.max(one, (1 / before - 1 / after) / 2);
}

// ── factorial pages (round 9, docs/SCORECARD-EVERYTHING.md) ───────────────
// The month's experiments are the bottleneck: about fifteen pages, one dimension each. A page can run more than one when the dimensions
// do not touch the same part of it (a 2^k factorial: Collins, Dziak & Li 2009), so each dimension's arm is read from every page it was on
// and the others' arms are noise to it (their effects add when they work on different parts of the page). PERSONALIZE_FACTORIAL is how
// many dimensions a page may cross (1, the one-dimension design of round 8, is the default: measured in the recovery sim, two per page
// doubled the dimensions run and moved their recovery r by only +0.005 to +0.016 at 100 levels, while false directives rose from 0.9% to
// 1.9% and one untouched measure regressed; docs/SCORECARD-EVERYTHING.md section 4). Two dimensions conflict when they share a part
// of the page below; brevity conflicts with everything that adds text. More than two instructions per page are not the default: a writer
// follows fewer of them as they pile up (the research report, 4.2), and the page must still read as one lesson.
const FACTORIAL = () => Math.max(1, Math.min(3, Number(process.env.PERSONALIZE_FACTORIAL || 1)));
const PARTS = {
  inductive_trajectory: ['opening', 'order'], abstraction_tolerance: ['opening', 'order'], worked_example_dependence: ['examples', 'order', 'length'],
  cycle_architecture: ['order'], dialogic_preference: ['order', 'register'], novelty_hunger: ['order'],
  curiosity_hook: ['opening'], global_framing_need: ['opening', 'length'], relevance_demand: ['opening'], narrative_pull: ['opening', 'examples'],
  analogical_transfer: ['examples'], interest_transfer: ['examples'], example_density_need: ['examples', 'length'], social_framing: ['examples'],
  emotional_engagement: ['examples'], brevity_preference: ['length', 'examples', 'opening', 'order'],
  tone_formality: ['register'], jargon_absorption: ['register', 'terms'], humor_receptivity: ['register'],
  feedback_tone_sensitivity: ['feedback'], praise_sensitivity: ['feedback'], mnemonic_receptivity: ['memory aids'],
};
function compatible(a, b) {
  const pa = PARTS[a] || [a];
  const pb = PARTS[b] || [b];
  return a !== b && !pa.some((x) => pb.includes(x));
}

/**
 * The stat and arm one more experiment should go to, or null when nothing is open. Ties are broken by the level's hash, so the pick is a
 * pure function of the card and the level. `besides`: stats already on this page (only dimensions compatible with all of them).
 */
function pickExperiment(userId, card, key, besides = []) {
  let best = null;
  for (const e of openExperiments(userId, card)) {
    if (besides.some((b) => !compatible(b, e.stat))) continue;
    const st = stateOf(card, e.stat);
    const arm = st.vHigh === st.vLow ? (unit(`side:${key}:${e.stat}`) < 0.5 ? 'high' : 'low') : (st.vHigh < st.vLow ? 'high' : 'low');
    const value = importanceOf(e.stat) * experimentValue(st, arm) * (1 + 1e-6 * unit(`which:${key}:${e.stat}`));
    if (!best || value > best.value) best = { e, arm, value };
  }
  return best;
}

/** The experiment for one level under the allocator: stored the first time, so every later ask gets the same answer. */
function allocated(userId, where, key) {
  const match = (r) => r.user_id === userId && r.track_id === where.trackId && r.grade_id === where.gradeId && r.level === where.level;
  const kept = db.findOne('experiment_arms', match);
  if (kept) {
    const e = EXPERIMENTS.find((x) => x.stat === kept.stat);
    if (!e || !kept.arm) return null;
    const also = (kept.also || []).map((a) => { const x = EXPERIMENTS.find((y) => y.stat === a.stat); return x && a.arm ? { stat: x.stat, label: x.label, arm: a.arm, text: x[a.arm] } : null; }).filter(Boolean);
    return asExperiment({ stat: e.stat, label: e.label, arm: kept.arm, text: e[kept.arm] }, also);
  }
  const card = scorecard.get(userId);
  const best = pickExperiment(userId, card, key);
  const also = [];
  if (best) {
    // The page's other dimensions: the same rule over what is compatible with those already chosen. Credit for one does not change the
    // value of another before the page is read, so the picks are made from the same card.
    for (let k = 1; k < FACTORIAL(); k++) {
      const next = pickExperiment(userId, card, `${key}:${k}`, [best.e.stat, ...also.map((a) => a.stat)]);
      if (!next) break;
      also.push({ stat: next.e.stat, label: next.e.label, arm: next.arm, text: next.e[next.arm] });
    }
  }
  db.insert('experiment_arms', {
    user_id: userId, track_id: where.trackId, grade_id: where.gradeId, level: where.level, stat: best ? best.e.stat : null, arm: best ? best.arm : null,
    ...(also.length ? { also: also.map((a) => ({ stat: a.stat, arm: a.arm })) } : {}), at: new Date().toISOString(),
  });
  return best ? asExperiment({ stat: best.e.stat, label: best.e.label, arm: best.arm, text: best.e[best.arm] }, also) : null;
}

/** One page's experiment: the main dimension, plus the crossed ones (`also`) with every instruction in `text`. */
function asExperiment(main, also) {
  if (!also.length) return main;
  return { ...main, text: [main.text, ...also.map((a) => a.text)].join(' '), also };
}

/**
 * Which experiment stat a pairwise choice should ask about next ("which is clearer?", services/boosters.js choice): the open stat where
 * one more choice cuts the posterior variance of the learner's standing most (scorecard.choiceInfo), times its importance. Returns the
 * EXPERIMENTS entry, or null. `exclude`: stats not to ask about now.
 */
function choiceDimension(userId, { exclude = [] } = {}) {
  const card = scorecard.get(userId);
  let best = null;
  for (const e of openExperiments(userId, card, { forChoice: true })) {
    if (exclude.includes(e.stat)) continue;
    const st = stateOf(card, e.stat);
    const before = 1 / (st.sd * st.sd);
    const value = importanceOf(e.stat) * (1 / before - 1 / (before + scorecard.choiceInfo(st.z))) * (1 + 1e-6 * unit(`choice:${userId}:${e.stat}`));
    if (!best || value > best.value) best = { e, value };
  }
  return best ? best.e : null;
}

// ── checks a tailored page must pass against the creator's page ────────────
function ids(html) {
  return new Set([...String(html).matchAll(/\sid\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]));
}

/**
 * A tailored page may change any text and any content in the game data. It may
 * not remove a control the script looks for, and its scripts must still compile.
 *
 * @returns {string|null} the problem, or null when it passes
 */
function checkAgainstBase(html, baseHtml) {
  if (baseHtml) {
    const have = ids(html);
    const missing = [...ids(baseHtml)].filter((id) => !have.has(id));
    if (missing.length) return `element ids from the creator's page are missing: ${missing.slice(0, 5).join(', ')}`;
  }
  const scripts = [...String(html).matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  for (const [i, body] of scripts.entries()) {
    try {
      new vm.Script(body); // eslint-disable-line no-new
    } catch (err) {
      return `script ${i + 1} no longer compiles: ${err.message}`;
    }
  }
  return null;
}

module.exports = {
  compatible,
  PARTS,
  isEnabled,
  scorecardSection,
  recentLevelsSection,
  armFor,
  choiceDimension,
  importanceOf,
  armGain,
  experimentValue,
  checkAgainstBase,
  EXPERIMENTS,
  BASE_EXPERIMENTS,
  NEW_EXPERIMENTS,
  HOLDOUT,
};
