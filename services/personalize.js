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
 *                     is credited to that choice. Decided by a hash of learner
 *                     and level rather than at random, so a level's arm is the
 *                     same every time it is asked about and a page is never
 *                     rewritten just because a coin landed differently.
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
 * Each has a plain instruction for both arms.
 */
const EXPERIMENTS = [
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
  { stat: 'cycle_architecture', label: 'one continuous explanation',
    high: 'Teach the whole idea in one continuous run before anything interactive.',
    low: 'After each short teaching section, put one quick interactive check before the next.' },
  { stat: 'abstraction_tolerance', label: 'the principle stated abstractly first',
    high: 'State the general principle first, abstractly; concrete cases confirm it.',
    low: 'Anchor everything in a concrete case first; generalize only at the end.' },
  { stat: 'humor_receptivity', label: 'light humor',
    high: 'Include a touch of light humor where it helps an idea stick.',
    low: 'Keep the tone entirely straightforward; no humor.' },
];

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
  if (unit(`experiment:${key}`) >= EXPERIMENT_RATE) return { arm: 'tailored', experiment: null };
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
  isEnabled,
  scorecardSection,
  recentLevelsSection,
  armFor,
  checkAgainstBase,
  EXPERIMENTS,
  HOLDOUT,
};
