/**
 * Signals: what a learner actually did, turned into evidence for the scorecard.
 *
 * Every function here reads behavior the app already records — answers,
 * latencies, coach use, a lesson's reading time, what the learner said about a
 * level — and returns observations for scorecard.observe. Nothing here is a
 * questionnaire. The weights encode how much each kind of evidence is worth:
 *
 *   0.05–0.15  a hint (one fast answer, one self-report)
 *   0.2–0.3    a clear behavioral pattern within one level
 *   0.4–0.5    a controlled comparison (a within-learner experiment)
 *
 * The map from signal to stat lives in this file and nowhere else, so the
 * question "why did this stat move?" always has one place to look — and the
 * scorecard's log records the source and a note for every move.
 *
 * Two kinds of observation:
 *
 *   { stat, value, weight }   "this is evidence the stat is about here"
 *   { stat, hits, trials }    a RATE: how often something happened out of how
 *                             many chances it had to happen (see RATES)
 *
 * Rates exist because some behaviour only ever shows up one way. Coach use, a
 * rapid guess or a repeated mistake is an event; not using the coach is not an
 * event, it is the absence of one. Scored as a value ("used the coach -> 75"),
 * such a stat walks to the value however rarely the event happens, and records
 * "has this ever happened" instead of "how often". Counting the chances as well
 * as the events lets a learner who almost never does it read as low.
 */
const db = require('../../config/db');

const EXPERIMENT_WEIGHT = 0.45;
const DELAYED_WEIGHT = 0.3;

/**
 * The rate-scored stats, and what counts as a chance and an event for each.
 *
 * `norm` is the rate a typical learner shows: at the norm the stat reads 50,
 * at three times the norm 75, at a third of it 25. These are starting
 * assumptions, not measurements; once POPULATION_MIN learners have enough
 * chances on a stat, the population median replaces them (scorecard/index.js
 * populationPriors). `invert` reads the rate the other way round, for a stat
 * that is the opposite of the thing being counted.
 */
const RATES = {
  // Coach reliance is coach use when the learner could do it alone: the item
  // was within their reach by the ability model (scorecard/irt.js) and they
  // were not just coming off a miss. Coach use when stuck is help seeking, read
  // over the learner's own unstuck rate, so someone who always uses the coach
  // does not also read as someone who asks for help when it is needed.
  hint_dependency: { norm: 0.08, chance: 'an answer within their reach, outside an exam', event: 'reached with the coach' },
  help_seeking: { norm: 0.1, over: 'coach_unstuck', chance: 'a moment stuck (just missed one, or the item was beyond their measured level)', event: 'used the coach' },
  deliberation_depth: { norm: 0.08, chance: 'an answer without the coach', event: 'took over 2.5x their own usual time for an item like it' },
  perfectionism: { norm: 0.05, chance: 'a typed answer', event: 'revised 3 or more times' },
  // Out of the misses on a skill where they have made a tagged mistake before:
  // the same mistake again. Counting misses, not every question, keeps ability
  // out of it (a weaker learner misses more often, which is not persistence).
  misconception_persistence: { norm: 0.3, chance: 'a miss on a skill they have made a tagged mistake on', event: 'the same mistake again' },
  error_driven_learning: { norm: 0.3, invert: true, chance: 'a miss on a skill they have made a tagged mistake on', event: 'the same mistake again' },
  // Rushing: answers given in under 30% of the time the item deserves (a rapid
  // guess), and lesson pages skimmed, out of every answer and every page. An
  // answer right after a miss is left out: rushing then is frustration.
  rush_tendency: { norm: 0.07, chance: 'an answer (not right after a miss) or a lesson page', event: 'answered or read far faster than it deserves' },
  // Going back over a lesson: out of the lessons whose scrolling was recorded,
  // the share they scrolled back up over twice or more. One rate, read both
  // ways: needing to consolidate, and (inverted) tolerating dense text.
  consolidation_need: { norm: 0.25, chance: 'a lesson whose reading was recorded', event: 'scrolled back over it twice or more' },
  text_density_tolerance: { norm: 0.25, invert: true, chance: 'a lesson whose reading was recorded', event: 'scrolled back over it twice or more' },
  // Quitting after a run of misses, out of the moments it could have happened.
  persistence: { norm: 0.15, invert: true, chance: 'three or more misses in a row with questions left', event: 'stopped there' },
  // Round 5: confidence as a trait, out of the "how sure are you?" taps. How
  // sure people say they are is a stable individual difference, more reliable
  // than how well their confidence separates right from wrong (bias test-retest
  // r .67 against .45 for efficiency: Zhan, Castanheira & Fleming 2026,
  // preliminary; a robust confidence factor that predicts achievement beyond
  // self-efficacy questionnaires: Stankov, Lee, Luo & Hogan 2012). Placement
  // pitches every learner's levels near the same success rate, but a learner
  // ahead of the course is right (and sure) more often, so it is held to
  // validity 0.8 like other readings with a known leak.
  ...(process.env.SCORECARD_SURE_RATE === 'off' ? {} : {
    self_efficacy: { norm: 0.5, chance: 'a "how sure are you?" tap on a right answer', event: 'tapped "sure"', validity: 0.8 },
  }),
};
const rate = (stat, hit, note) => ({ stat, hits: hit ? 1 : 0, trials: 1, note: hit ? note : undefined });

/**
 * Shift-scored stats: a difference in performance AGAINST EXPECTATION between
 * two kinds of moment. Each answer's residual (right - expected, the expected
 * value from the item-calibrated ability model, scorecard/irt.js) goes into a
 * side; the stat is the logit shift between the sides (sum of residuals over
 * sum of p(1-p): one Newton step of a logistic shift), shrunk toward the
 * population by a normal prior of spread `tau` logits. `scale` is points per
 * logit; `norm` the typical shift (replaced by the population median once there
 * is one).
 */
const SHIFTS = {
  failure_response: { high: 'res_after_miss', low: 'res_otherwise', scale: 60, tau: 0.35, norm: 0 },
  error_recovery_speed: { high: 'res_after_miss', low: 'res_otherwise', scale: 60, tau: 0.35, norm: 0 },
  // Where in a level the learner does well, against expectation. Every level
  // has its own order (reviews first, a stretch item last), and the labels may
  // not price position in, so what is typical is not known until there is a
  // population (needsPopulation: never confident before then).
  // Warm-up: the first three answers of a level against the rest.
  warmup_latency: { high: 'res_after_opening', low: 'res_opening', scale: 60, tau: 0.3, norm: 0, needsPopulation: true },
  // Fatigue: the first half of a long level against the second.
  fatigue_curve: { high: 'res_first_half', low: 'res_second_half', scale: 60, tau: 0.3, norm: 0, needsPopulation: true },
  // Momentum: after two misses to open a level, the rest of it, against the
  // same positions in levels that opened otherwise.
  momentum_dependence: { high: 'res_rest_after_good_start', low: 'res_rest_after_bad_start', scale: 60, tau: 0.3, norm: 0, needsPopulation: true },
  // Round 5: language level from the answers themselves. Within each level, the
  // wordier half of the questions (textLoad) against the plainer half, each
  // against what the ability model expected: a learner whose reading holds them
  // back does worse on the wordy ones than their ability predicts (linguistic
  // complexity as a source of item bias against English learners of the same
  // ability: Martiniello 2008; Abedi & Lord 2001). Wordy items may be harder for
  // everyone, so the typical gap is the population's (needsPopulation), and it
  // is a reading through the item text. Validity 0.9 like other behaviour
  // standings (step 34: 0.8 gave 1 directive per 200 learners, 0.9 gave 2-4,
  // none false at four seeds; with no true effect, none fires).
  ...(process.env.SCORECARD_TEXT_LOAD === 'off' ? {} : {
    vocabulary_ceiling: { high: 'res_text_heavy', low: 'res_text_light', scale: 60, tau: 0.3, norm: 0, needsPopulation: true, validity: Number(process.env.SCORECARD_TEXT_VALIDITY || 0.9) },
  }),
};

/** An item's text load: its prompt's words, long words (7+ letters) counted twice. */
function textLoad(item) {
  const words = String((item && (item.prompt || item.question)) || '').split(/\s+/).filter(Boolean);
  return words.length + words.filter((w) => w.replace(/[^A-Za-zÀ-ɏ]/g, '').length >= 7).length;
}

/**
 * An experiment stat is a shift too: performance against expectation on the
 * outcome of a lesson taught with the choice (the high arm) minus taught
 * without it (the low arm). Raw arm outcomes are kept as residual sums per arm,
 * and the estimate is pooled-then-individual: the population's median
 * difference (the norm, "does this help people in general?") and the spread
 * between learners (tau, "do learners differ on it at all?") come from every
 * learner's arms (scorecard/index.js populationPriors), and one learner's
 * difference is shrunk toward the norm by how noisy it still is. With no
 * measurable spread every learner is held at the norm: a choice that helps
 * everyone belongs in the default lesson, not in one learner's directives.
 */
function experimentModel(stat) {
  return { high: `exp_hi:${stat}`, low: `exp_lo:${stat}`, scale: 60, tau: 0.3, norm: 0, experiment: true };
}

/**
 * Residual sums (right - expected) over a set of answers, from the ability
 * model's contexts. Rapid guesses and coach-assisted answers are left out;
 * memory tests (a day or more since the skill was practised) only when asked.
 */
function residuals(items, ctx = {}, { delayed = false } = {}) {
  const out = { r: 0, v: 0, n: 0 };
  for (const it of items || []) {
    const c = ctx[it.id];
    if (!c || !Number.isFinite(c.expected_lpo) || c.rapid || it.coach_used) continue;
    if (it.correct === null || it.correct === undefined) continue;
    if (c.delayed && !delayed) continue;
    const p = clamp(c.expected_lpo, 0.02, 0.98);
    out.r += (it.correct ? 1 : 0) - p;
    out.v += p * (1 - p);
    out.n += 1;
  }
  return out;
}

/** Observations crediting one experiment arm with an outcome's residual sums. */
function experimentOutcome(experiment, res, note) {
  if (!experiment || !experiment.stat || !res || !(res.n > 0)) return [];
  const side = `exp_${experiment.arm === 'high' ? 'hi' : 'lo'}:${experiment.stat}`;
  return [{ resid: side, r: res.r, v: res.v, n: res.n }, { stat: experiment.stat, shift: true, kind: 'experiment', note }];
}

/**
 * Tap-scored stats: a self-report read against what the learner was looking at
 * when they said it. "Too easy" / "too hard" after a level whose accuracy is
 * known says where their preferred success rate is; the stat is the posterior
 * of that rate (scorecard/index.js tapScore). High challenge appetite = a lower
 * preferred success rate.
 */
const TAPS = {
  challenge_appetite: { centre: 0.75, spread: 0.08, band: 0.15, softness: 0.06, pointsPerUnit: 50 / 0.15 },
};

/**
 * Contrast-scored stats: the difference between two of the learner's own side
 * rates. Calibration is how much more often they are right when they tap
 * "sure" than when they do not — their resolution. Comparing the two groups
 * directly takes ability out (a strong learner is right whatever they tap) and
 * how often they tap "sure" out (a confident learner taps it more, which says
 * nothing about whether the taps track being right). `norm` is the typical
 * difference, which reads 50; `scale` is points per unit of difference.
 */
const CONTRASTS = {
  // Calibration is metacognitive sensitivity: the chance that a right answer
  // got a more confident tap than a wrong one (the type-2 ROC area, Fleming &
  // Lau 2014), over the three taps (guess < think < sure). It is unaffected by
  // how often the learner taps "sure" (bias) and by how often they are right
  // (ability). 'ordinal' lists the side counts from least to most confident;
  // a card from before the split has only sure / unsure (fallback).
  confidence_calibration: { ordinal: ['tap_guess', 'tap_think', 'tap_sure'], fallback: ['tap_unsure', 'tap_sure'], norm: 0.65, tau: 0.08, scale: 250, high: 'tap_sure', low: 'tap_unsure' },
  self_monitoring: { ordinal: ['tap_guess', 'tap_think', 'tap_sure'], fallback: ['tap_unsure', 'tap_sure'], norm: 0.65, tau: 0.08, scale: 250, high: 'tap_sure', low: 'tap_unsure' },
  // Guessing among options is rapid answering on multiple choice beyond the
  // learner's rapid rate on typed answers: someone who rushes everything is
  // rushing, not guessing. Both sides are centred on their pooled rapid rate,
  // so general haste cancels.
  guessing_propensity: { high: 'rapid_mc', low: 'rapid_typed', norm: 0.03, tau: 0.025, scale: 500 },
  // Frustration: giving up on the answer right after a miss (a rapid answer)
  // beyond the learner's own rapid rate on the other answers. Someone who
  // rushes everything is rushing; someone who rushes only after being wrong
  // is frustrated. A low threshold (frustrates quickly) is a high rate after a
  // miss, so the high side is the ordinary answers.
  // How much more often people rush after a miss is not known before there is
  // a population to say (needsPopulation: never confident until then).
  frustration_threshold: { high: 'rapid_steady', low: 'rapid_after_miss', norm: -0.03, tau: 0.04, scale: 300, needsPopulation: true },
};

function clamp(v, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, v));
}

function words(text) {
  return String(text || '').split(/\s+/).filter(Boolean).length;
}

/**
 * How long a reasonable learner would take on this item, in ms: reading time
 * for the prompt and any passage at about 200 words a minute, plus thinking
 * time that grows with difficulty. A ratio against this is far more telling
 * than a raw latency, because a passage question and a one-line sum are not
 * comparable in seconds.
 */
function expectedMs(item) {
  const reading = (words(item.prompt) + words(item.passage) + words((item.choices || []).join(' '))) / 200 * 60000;
  return reading + 4000 + Number(item.difficulty || 5) * 1500;
}

function accuracy(items) {
  const answered = items.filter((i) => i.correct !== null && i.correct !== undefined);
  return answered.length ? answered.filter((i) => i.correct).length / answered.length : null;
}

// ── one answer ─────────────────────────────────────────────────────────────
/**
 * @param {object} item  the answered item row
 * @param {object} [ctx] what the ability model recorded for it (scorecard/irt.js
 *   contextFor): expected, prev_wrong, delayed, rapid, rel_ratio. Without it
 *   (an answer that never went through mastery) the older raw rules apply.
 */
function fromAnswer(item, ctx = null) {
  const obs = [];
  const ms = Number(item.ms || 0);
  const ratio = ms > 0 ? ms / expectedMs(item) : null;
  const right = !!item.correct;

  if (ratio !== null && item.role !== 'retention') {
    // Rapid answers on each format: the two sides of the guessing contrast.
    if (item.format) {
      const mc = item.format === 'multiple_choice';
      obs.push({ side: mc ? 'rapid_mc' : 'rapid_typed', hits: ratio < 0.3 ? 1 : 0, trials: 1 });
      obs.push({ stat: 'guessing_propensity', contrast: true, note: mc && ratio < 0.3 ? 'a very fast choice' : undefined });
    }
    // Taking long is read against the learner's own usual pace once it is known.
    const rel = ctx && ctx.rel_ratio !== null && ctx.rel_ratio !== undefined ? ctx.rel_ratio : ratio;
    if (!item.coach_used) obs.push(rate('deliberation_depth', rel > 2.5, 'took long over it'));
    if (!(ctx && ctx.prev_wrong)) obs.push(rate('rush_tendency', ratio < 0.3, 'answered far faster than the item deserves'));
    // The two sides of the frustration contrast (CONTRASTS above).
    if (ctx) {
      obs.push({ side: ctx.prev_wrong ? 'rapid_after_miss' : 'rapid_steady', hits: ratio < 0.3 ? 1 : 0, trials: 1 });
      obs.push({ stat: 'frustration_threshold', contrast: true, note: ctx.prev_wrong && ratio < 0.3 ? 'rushed the answer right after a miss' : undefined });
    }
    if (ratio < 0.5 && right) {
      obs.push({ stat: 'processing_velocity', value: 75, weight: 0.12, note: 'fast and right' });
    } else if (ratio > 2.5 && !right) {
      obs.push({ stat: 'processing_velocity', value: 30, weight: 0.12, note: 'took long and missed it' });
    }
  }

  // "How sure are you?" Each tap goes into a count for its level (guess,
  // think, sure: right out of answered), and calibration is the type-2 ROC
  // area over those counts (CONTRASTS above). The contrast observation carries
  // what this one answer alone suggests, for the log; the score comes from the
  // counts. (tap_unsure, think and guess together, is kept for older cards.)
  // Saying "I am guessing" is honesty
  // about a guess, not a tendency to guess, so it informs calibration only.
  if (item.confidence) {
    const sure = item.confidence === 'sure';
    // (Compared with being right. Comparing with what the ability model
    // expected instead was measured and recovered calibration worse.)
    const evidence = right ? 1 : 0;
    obs.push({ side: sure ? 'tap_sure' : 'tap_unsure', hits: evidence, trials: 1 });
    if (!sure) obs.push({ side: item.confidence === 'guess' ? 'tap_guess' : 'tap_think', hits: evidence, trials: 1 });
    const alone = sure ? (right ? 80 : 15) : (right ? 40 : 70);
    const note = sure ? (right ? 'sure and right' : 'sure but wrong') : (right ? 'unsure and right' : 'unsure and wrong');
    obs.push({ stat: 'confidence_calibration', contrast: true, value: alone, note });
    obs.push({ stat: 'self_monitoring', contrast: true, value: alone });
    if (item.confidence === 'guess') obs.push({ stat: 'self_efficacy', value: 40, weight: 0.05 });
    // Only taps on answers that were right count, so how often a learner is
    // right (which depends on where they stand against the course) does not
    // set how often they could say "sure". Measured (step 34): counting every
    // tap gave r 0.72-0.76 and a false directive on a learner of truth 61 who
    // was behind the course; right answers only, r 0.76-0.79 and none.
    // SCORECARD_SURE_RATE=all counts every tap, =off turns the rate off.
    if (RATES.self_efficacy && (process.env.SCORECARD_SURE_RATE === 'all' || right)) obs.push(rate('self_efficacy', sure, 'tapped "sure"'));
  }

  // Coach use, against the chances to use it: every answer for reliance, and
  // every moment stuck for asking for help when it is needed.
  if (item.role !== 'exam') {
    const coach = !!item.coach_used;
    if (ctx && Number.isFinite(ctx.expected)) {
      // Stuck: just missed one, the item was beyond their measured level, or
      // it is a memory test on something not practised for a day or more.
      const stuck = ctx.prev_wrong || ctx.expected < 0.5 || ctx.delayed;
      // A rapid answer when stuck is giving up (frustration), not a moment
      // they weighed asking for help, so it is not a chance for help seeking.
      if (stuck && !ctx.rapid) obs.push(rate('help_seeking', coach, 'asked the coach when stuck'));
      else if (stuck) { /* rapid: frustration's evidence, not help seeking's */ }
      else {
        obs.push(rate('hint_dependency', coach, 'used the coach on something within reach'));
        obs.push({ side: 'coach_unstuck', hits: coach ? 1 : 0, trials: 1 });
      }
    } else {
      obs.push(rate('hint_dependency', coach, 'used the coach'));
      if (coach || !right) obs.push(rate('help_seeking', coach, 'asked the coach when stuck'));
    }
  }

  if (item.format && item.format !== 'multiple_choice') {
    obs.push(rate('perfectionism', Number(item.answer_changes || 0) >= 3, 'revised the answer several times'));
  }

  // A memory test (a skill last practised a day or more ago) goes to the
  // forgetting model with its interval and what was expected of it had it been
  // fresh (scorecard/forgetting.js), so the review schedule and ability are
  // out of it. Without the ability model, the older fixed values for a review.
  if (ctx && ctx.delayed && Number.isFinite(ctx.expected) && ctx.interval_days !== null && !ctx.rapid && !item.coach_used) {
    obs.push({
      stat: 'decay_rate',
      memory: {
        dt: ctx.interval_days, nc: ctx.prior_correct, nw: Math.max(0, ctx.prior_attempts - ctx.prior_correct),
        ns: ctx.prior_spaced_right || 0, nsw: ctx.prior_spaced_wrong || 0,
        pk: ctx.expected, g: Number.isFinite(ctx.guess) ? ctx.guess : 0.1, y: right,
        open: Number(item.index) < 3, review: item.role === 'review',
      },
      note: `${right ? 'remembered' : 'forgot'} after ${Math.round(ctx.interval_days)} day${Math.round(ctx.interval_days) === 1 ? '' : 's'}`,
    });
  } else if (item.role === 'review' && !ctx) {
    obs.push({ stat: 'retrieval_strength', value: right ? 75 : 25, weight: 0.25, note: right ? 'recalled a due review' : 'missed a due review' });
    obs.push({ stat: 'decay_rate', value: right ? 30 : 75, weight: 0.25 });
    obs.push({ stat: 'retention_index', value: right ? 75 : 25, weight: 0.2 });
  }
  if (item.role === 'retention') {
    obs.push({ stat: 'retrieval_strength', value: right ? 65 : 35, weight: 0.1 });
  }
  // Every TREND_BIN fresh answers the ability model refits this learner's
  // slope of ability over practice (scorecard/irt.js): mastery velocity.
  if (ctx && ctx.velocity) obs.push({ stat: 'mastery_velocity', velocity: true });
  // And every few ordinary answers, the learner's answer pace: processing velocity.
  if (ctx && ctx.pace) obs.push({ stat: 'processing_velocity', pace: true });
  // And every few fresh answers, how far ahead of the course they are in this
  // subject (irt.js reach): scaffolding fade, the expertise reversal construct.
  if (ctx && ctx.reach) obs.push({ stat: 'scaffolding_fade', reach: ctx.reach });
  // (A stretch item answered right used to raise challenge appetite. That is
  // ability, not appetite; appetite is read from difficulty taps against the
  // level's accuracy — TAPS above.)
  return obs;
}

/**
 * A delayed review answered weeks after a lesson that was taught one way on
 * purpose: credit (or debit) that way of teaching. This is the strongest
 * signal the app has, because it is both controlled and delayed.
 */
function delayedExperimentOutcome(userId, item, ctx = null) {
  if (item.role !== 'review') return [];
  const since = Date.now() - 30 * 86400000;
  const row = db.find('level_signals', (r) => r.user_id === userId && r.skill_id === item.skill_id
    && r.experiment && r.experiment.stat && Date.parse(r.finished_at || 0) >= since
    && (r.delayed || 0) < 3)
    .slice(-1)[0];
  if (!row) return [];
  db.update('level_signals', row.id, { delayed: (row.delayed || 0) + 1 });
  const good = !!item.correct;
  const highArm = row.experiment.arm === 'high';
  const note = `delayed recall after a lesson taught ${highArm ? 'with' : 'without'} ${row.experiment.label}: ${good ? 'remembered' : 'forgot'}`;
  if (ctx && Number.isFinite(ctx.expected_lpo)) {
    return experimentOutcome(row.experiment, residuals([item], { [item.id]: ctx }, { delayed: true }), note);
  }
  return [{
    stat: row.experiment.stat,
    value: (good === highArm) ? 70 : 30,
    weight: DELAYED_WEIGHT,
    kind: 'experiment',
    note: `delayed recall after a lesson taught ${highArm ? 'with' : 'without'} ${row.experiment.label}: ${good ? 'remembered' : 'forgot'}`,
  }];
}

// ── one level ──────────────────────────────────────────────────────────────
/**
 * @param {object[]} items
 * @param {{priorErrorTags?: object, ctx?: object}} opts  ctx: item id -> the
 *   ability model's context for that answer (scorecard/irt.js contextsFor)
 */
function fromBlock(items, { priorErrorTags = {}, ctx = {} } = {}) {
  const obs = [];
  const answered = items.filter((i) => i.correct !== null && i.correct !== undefined)
    .sort((a, b) => a.index - b.index);
  if (answered.length < 3) return obs;
  const acc = accuracy(answered);
  const isRapid = (it) => (ctx[it.id] && ctx[it.id].rapid) || (it.ms && it.ms / expectedMs(it) < 0.3);

  const afterError = [];
  const otherwise = [];
  for (let i = 0; i < answered.length; i++) {
    if (i > 0 && !answered[i - 1].correct) afterError.push(answered[i]);
    else otherwise.push(answered[i]);
  }
  // What happens right after a wrong answer. With the ability model, each
  // answer is read against what was expected of it (right - expected), so the
  // item's difficulty and the learner's level on that skill are out of it;
  // rapid answers are left out (giving up is frustration, below), and so are
  // coach-assisted answers and memory tests. The sums go to two sides and the
  // stat is the shift between them (SHIFTS).
  const withModel = answered.filter((it) => ctx[it.id] && Number.isFinite(ctx[it.id].expected_lpo));
  if (withModel.length >= Math.min(3, answered.length)) {
    const sides = {};
    const add = (name, it, p) => {
      const s = sides[name] || (sides[name] = { r: 0, v: 0, n: 0 });
      s.r += (it.correct ? 1 : 0) - p;
      s.v += p * (1 - p);
      s.n += 1;
    };
    const long = answered.length >= 8;
    const half = Math.floor(answered.length / 2);
    const badStart = answered.length >= 5 && !answered[0].correct && !answered[1].correct;
    // The level's median text load (language level: res_text_heavy / light).
    const loads = SHIFTS.vocabulary_ceiling ? answered.map(textLoad) : [];
    const sortedLoads = [...loads].sort((x, y) => x - y);
    const midLoad = sortedLoads.length ? (sortedLoads[Math.floor((sortedLoads.length - 1) / 2)] + sortedLoads[Math.ceil((sortedLoads.length - 1) / 2)]) / 2 : 0;
    for (let i = 0; i < answered.length; i++) {
      const it = answered[i];
      const c = ctx[it.id];
      if (!c || !Number.isFinite(c.expected_lpo) || isRapid(it) || it.coach_used || c.delayed) continue;
      const p = clamp(c.expected_lpo, 0.02, 0.98);
      add(i > 0 && !answered[i - 1].correct ? 'res_after_miss' : 'res_otherwise', it, p);
      if (answered.length >= 6) add(i < 3 ? 'res_opening' : 'res_after_opening', it, p);
      if (long) add(i < half ? 'res_first_half' : 'res_second_half', it, p);
      if (answered.length >= 5 && i >= 2) add(badStart ? 'res_rest_after_bad_start' : 'res_rest_after_good_start', it, p);
      if (loads.length >= 4 && loads[i] !== midLoad) add(loads[i] > midLoad ? 'res_text_heavy' : 'res_text_light', it, p);
    }
    for (const [name, s] of Object.entries(sides)) if (s.n) obs.push({ resid: name, ...s });
    if (sides.res_after_miss) {
      const note = `${sides.res_after_miss.n} answers after a miss, ${sides.res_after_miss.r >= 0 ? 'above' : 'below'} what was expected of them`;
      obs.push({ stat: 'failure_response', shift: true, note });
      obs.push({ stat: 'error_recovery_speed', shift: true });
    }
    if (sides.res_opening && sides.res_after_opening) obs.push({ stat: 'warmup_latency', shift: true, note: `first three answers ${sides.res_opening.r >= 0 ? 'above' : 'below'} what was expected` });
    if (sides.res_first_half && sides.res_second_half) obs.push({ stat: 'fatigue_curve', shift: true, note: `second half ${sides.res_second_half.r >= 0 ? 'above' : 'below'} what was expected` });
    if (sides.res_text_heavy && sides.res_text_light) obs.push({ stat: 'vocabulary_ceiling', shift: true, note: `wordier questions ${sides.res_text_heavy.r >= sides.res_text_light.r ? 'no harder' : 'harder'} than expected` });
    if (sides.res_rest_after_bad_start) obs.push({ stat: 'momentum_dependence', shift: true, note: 'two misses to open the level' });
    else if (sides.res_rest_after_good_start) obs.push({ stat: 'momentum_dependence', shift: true });
  } else if (afterError.length >= 2 && otherwise.length >= 2) {
    // Without the model: the difference from the level's other questions.
    const recovered = accuracy(afterError);
    const usual = accuracy(otherwise);
    const value = clamp(50 + (recovered - usual) * 100);
    const weight = 0.25 * Math.min(1, afterError.length / 3);
    obs.push({ stat: 'failure_response', value, weight, note: `${Math.round(recovered * 100)}% right after a miss, ${Math.round(usual * 100)}% otherwise` });
    obs.push({ stat: 'error_recovery_speed', value, weight: weight * 0.6 });
  }
  // (Giving up after a miss, a rapid answer then, is counted per answer as a
  // contrast against the learner's own rapid rate otherwise: CONTRASTS. It
  // used to be a value here, 25 for rushing half the answers after misses,
  // which a learner who rushes everything earned as easily.)
  // (Persistence is the rate of stopping after a run of misses, counted over a
  // whole sitting in fromSession, where unanswered questions are visible.)

  // Fatigue, warm-up and momentum: with the ability model they are shifts
  // against expectation (SHIFTS, above). Without it, the older raw-accuracy
  // values, which read a level whose hard item comes last as fatigue.
  if (withModel.length < Math.min(3, answered.length)) {
    if (answered.length >= 8) {
      const half = Math.floor(answered.length / 2);
      const first = accuracy(answered.slice(0, half));
      const second = accuracy(answered.slice(half));
      obs.push({ stat: 'fatigue_curve', value: clamp(50 + (first - second) * 120), weight: 0.2, note: `accuracy ${Math.round(first * 100)}% then ${Math.round(second * 100)}%` });
    }
    if (answered.length >= 6) {
      const opening = accuracy(answered.slice(0, 3));
      const rest = accuracy(answered.slice(3));
      if (rest - opening >= 0.3) obs.push({ stat: 'warmup_latency', value: 72, weight: 0.15, note: 'slow start, then settled' });
      else if (Math.abs(rest - opening) < 0.15) obs.push({ stat: 'warmup_latency', value: 35, weight: 0.08 });
    }
    if (answered.length >= 5 && !answered[0].correct && !answered[1].correct) {
      const rest = accuracy(answered.slice(2));
      obs.push({ stat: 'momentum_dependence', value: rest < 0.5 ? 75 : rest >= 0.75 ? 30 : 50, weight: 0.2, note: 'two misses to open the level' });
    }
  }

  // (Struggling without reaching for help is counted per answer, as a rate:
  // see help_seeking in RATES.)

  // Producing an answer against recognizing one.
  const typed = answered.filter((i) => i.format !== 'multiple_choice');
  const chosen = answered.filter((i) => i.format === 'multiple_choice');
  if (typed.length >= 2 && chosen.length >= 2) {
    const diff = accuracy(typed) - accuracy(chosen);
    obs.push({ stat: 'open_response_performance', value: clamp(50 + diff * 100), weight: 0.2 });
    obs.push({ stat: 'recognition_recall_gap', value: clamp(50 - diff * 100), weight: 0.15 });
  }

  // A mistake the learner has made before on this skill, made again — out of
  // the misses on a skill where they have made a tagged mistake before (rapid
  // guesses aside). Conditioning on the miss keeps ability out: a weaker
  // learner misses more often, which is not the same as repeating a mistake.
  let chances = 0;
  let repeats = 0;
  const repeated = [];
  for (const item of answered) {
    const before = priorErrorTags[item.skill_id] || [];
    if (!before.length || item.correct || isRapid(item)) continue;
    chances++;
    if (!item.correct && item.error_tag && before.includes(item.error_tag)) {
      repeats++;
      repeated.push(item.error_tag.replace(/_/g, ' '));
    }
  }
  if (chances) {
    const note = repeated.length ? `repeated ${[...new Set(repeated)].join(', ')}` : undefined;
    obs.push({ stat: 'misconception_persistence', hits: repeats, trials: chances, note });
    obs.push({ stat: 'error_driven_learning', hits: repeats, trials: chances, note });
  }

  // Interleaving: how review items mixed into the level held up against focus items.
  const review = answered.filter((i) => i.role === 'review');
  const focus = answered.filter((i) => i.role === 'focus');
  if (review.length >= 2 && focus.length >= 3) {
    obs.push({ stat: 'interleaving_tolerance', value: clamp(50 + (accuracy(review) - accuracy(focus) + 0.1) * 100), weight: 0.1 });
  }

  if (acc !== null && acc >= 0.85) obs.push({ stat: 'self_efficacy', value: 65, weight: 0.05 });
  return obs;
}

// ── a lesson ───────────────────────────────────────────────────────────────
/**
 * Scroll-backs on a lesson (the page counts how often the learner scrolled
 * back up over what they had read): a chance for both rates whenever it was
 * recorded, an event at two or more. Nothing when it was not recorded.
 */
function scrollBackObs(scrollBacks) {
  if (scrollBacks === null || scrollBacks === undefined || scrollBacks === '' || !Number.isFinite(Number(scrollBacks))) return [];
  const back = Number(scrollBacks) >= 2;
  return [rate('consolidation_need', back, 'scrolled back over the lesson'), rate('text_density_tolerance', back)];
}

function lessonWords(lesson) {
  const parts = [lesson.intro, lesson.summary, ...(lesson.common_mistakes || [])];
  for (const s of lesson.sections || []) parts.push(s.heading, s.body, s.example);
  if (lesson.worked_example) parts.push(lesson.worked_example.problem, ...(lesson.worked_example.steps || []));
  return words(parts.join(' '));
}

/**
 * A lesson's evidence: how it was read and how its checks came out, against
 * this learner's usual result on a lesson. When the lesson was taught one way
 * on purpose (an experiment), the difference from the usual result is credited
 * to that way of teaching.
 */
function fromLesson(lesson, { telemetry = {}, checks = [], baseline = 0.7, ctx = null } = {}) {
  const obs = [];
  const acc = accuracy(checks);
  if (acc === null) return obs;
  const length = lessonWords(lesson);
  const readMs = Number(telemetry.read_ms || 0);
  const expected = Math.max(20000, length / 220 * 60000);
  const ratio = readMs ? readMs / expected : null;

  if (ratio !== null) {
    if (ratio >= 0.25) obs.push(rate('rush_tendency', false));
    if (ratio < 0.25) {
      obs.push(rate('rush_tendency', true, 'skimmed the lesson'));
      if (acc < baseline) obs.push({ stat: 'instruction_adherence', value: 30, weight: 0.1 });
    } else if (ratio < 0.6 && acc >= 0.75) {
      obs.push({ stat: 'processing_velocity', value: 75, weight: 0.2, note: 'read quickly and the checks held' });
    } else if (ratio > 1.8 && acc >= 0.75) {
      obs.push({ stat: 'processing_velocity', value: 35, weight: 0.15, note: 'took time and got there' });
    }
    if (readMs > 6 * 60000 && acc >= 0.75) {
      obs.push({ stat: 'attention_runway', value: 70, weight: 0.12, note: 'read a long lesson closely' });
    }
  }
  obs.push(...scrollBackObs(telemetry.scroll_backs));

  // How much this learner can take in at once: a long lesson whose checks held
  // up, or a short one whose did not.
  if (length > 550 && acc >= 0.75) obs.push({ stat: 'intake_baseline', value: 70, weight: 0.15, note: 'long lesson, checks held' });
  if (length < 300 && acc < 0.5) obs.push({ stat: 'intake_baseline', value: 30, weight: 0.15, note: 'short lesson, checks missed' });

  const delta = acc - baseline;
  const res = ctx ? residuals(checks, ctx) : null;
  if (lesson.experiment && lesson.experiment.stat && res && res.n) {
    obs.push(...experimentOutcome(lesson.experiment, res, `taught ${lesson.experiment.arm === 'high' ? 'with' : 'without'} it: checks ${res.r >= 0 ? 'above' : 'below'} what was expected`));
  } else if (lesson.experiment && lesson.experiment.stat) {
    const sign = lesson.experiment.arm === 'high' ? 1 : -1;
    obs.push({
      stat: lesson.experiment.stat,
      value: clamp(50 + sign * delta * 120),
      weight: EXPERIMENT_WEIGHT,
      kind: 'experiment',
      note: `taught ${lesson.experiment.arm === 'high' ? 'with' : 'without'} it: ${Math.round(acc * 100)}% against a usual ${Math.round(baseline * 100)}%`,
    });
  }

  obs.push({ stat: 'mastery_orientation', value: acc >= 0.75 ? 60 : 50, weight: 0.03 });
  return obs;
}

/**
 * A creator-made HTML lesson (content/base-lessons), or a learner's tailored
 * version of one. The page runs its own games and reports nothing back, so its
 * evidence is how long it was read against how long it is, and — the part that
 * matters — how the learner did on the practice level right after it, against
 * their usual result on the level after a lesson. When the page was taught one
 * way on purpose (an experiment), that difference is credited to the choice.
 *
 * @param {{readMs:number, words:number, nextAccuracy:number|null, baseline:number, experiment:object|null}} r
 */
function fromBaseLesson({ readMs = 0, words: length = 0, nextAccuracy = null, baseline = 0.7, experiment = null, outcome = null, scrollBacks = null }) {
  const obs = [...scrollBackObs(scrollBacks)];
  const expected = Math.max(60000, (length / 200) * 60000);
  const ratio = readMs ? readMs / expected : null;
  if (ratio !== null) {
    obs.push(rate('rush_tendency', ratio < 0.2, 'finished the lesson page very quickly'));
    if (ratio > 0.6 && readMs > 8 * 60000) obs.push({ stat: 'attention_runway', value: 72, weight: 0.15, note: `${Math.round(readMs / 60000)} minutes on the lesson page` });
    if (ratio < 0.5 && nextAccuracy !== null && nextAccuracy >= 0.8) {
      obs.push({ stat: 'processing_velocity', value: 75, weight: 0.2, note: 'read quickly and the next level held up' });
    }
  }
  if (nextAccuracy !== null) {
    if (length > 2500 && nextAccuracy >= 0.75) obs.push({ stat: 'intake_baseline', value: 70, weight: 0.12, note: 'a long lesson that stuck' });
    if (experiment && experiment.stat && outcome && outcome.n) {
      // The next level's answers against what was expected of them: difficulty
      // and ability are out of it, unlike accuracy against a usual result.
      obs.push(...experimentOutcome(experiment, outcome, `lesson taught ${experiment.arm === 'high' ? 'with' : 'without'} ${experiment.label}: next level ${outcome.r >= 0 ? 'above' : 'below'} what was expected`));
    } else if (experiment && experiment.stat) {
      const sign = experiment.arm === 'high' ? 1 : -1;
      obs.push({
        stat: experiment.stat,
        value: clamp(50 + sign * (nextAccuracy - baseline) * 120),
        weight: EXPERIMENT_WEIGHT,
      kind: 'experiment',
        note: `lesson taught ${experiment.arm === 'high' ? 'with' : 'without'} ${experiment.label}: next level ${Math.round(nextAccuracy * 100)}% against a usual ${Math.round(baseline * 100)}%`,
      });
    }
  }
  return obs;
}

// ── what the learner said ──────────────────────────────────────────────────
/**
 * Self-report about one level. Useful, and weighted low: people are good at
 * saying a lesson felt long, less good at saying what would have taught them.
 */
function fromFeedback(fb) {
  const obs = [];
  if (fb.length === 'long') {
    obs.push({ stat: 'brevity_preference', value: 75, weight: 0.25, note: 'said the level was too long' });
    obs.push({ stat: 'attention_runway', value: 35, weight: 0.15 });
  } else if (fb.length === 'short') {
    obs.push({ stat: 'brevity_preference', value: 25, weight: 0.25, note: 'said the level was too short' });
    obs.push({ stat: 'depth_breadth', value: 65, weight: 0.1 });
  } else if (fb.length === 'right') {
    obs.push({ stat: 'brevity_preference', value: 50, weight: 0.05 });
  }
  if (fb.pace === 'fast') {
    obs.push({ stat: 'processing_velocity', value: 30, weight: 0.2, note: 'said it moved too fast' });
    obs.push({ stat: 'intake_baseline', value: 30, weight: 0.2 });
    obs.push({ stat: 'step_explicitness', value: 70, weight: 0.12 });
  } else if (fb.pace === 'slow') {
    obs.push({ stat: 'processing_velocity', value: 75, weight: 0.2, note: 'said it moved too slowly' });
    obs.push({ stat: 'intake_baseline', value: 70, weight: 0.2 });
    obs.push({ stat: 'repetition_tolerance', value: 30, weight: 0.1 });
  }
  // Difficulty taps are read against the level's accuracy (TAPS): "too easy"
  // at 95% and at 60% say very different things. Without the accuracy, the
  // older fixed values.
  if (fb.difficulty && typeof fb.accuracy === 'number') {
    const note = fb.difficulty === 'right' ? undefined : `said it was too ${fb.difficulty} at ${Math.round(fb.accuracy * 100)}%`;
    obs.push({ stat: 'challenge_appetite', tap: fb.difficulty, acc: fb.accuracy, note });
    if (fb.difficulty === 'hard') obs.push({ stat: 'self_efficacy', value: 40, weight: 0.08 });
  } else if (fb.difficulty === 'easy') {
    obs.push({ stat: 'challenge_appetite', value: 70, weight: 0.15, note: 'said it was too easy' });
  } else if (fb.difficulty === 'hard') {
    obs.push({ stat: 'challenge_appetite', value: 38, weight: 0.12, note: 'said it was too hard' });
    obs.push({ stat: 'self_efficacy', value: 40, weight: 0.08 });
  }
  // What they wrote is read by the model per level, in services/learner-record.js;
  // here it only tells us how much they reflect.
  const written = `${fb.liked || ''} ${fb.disliked || ''}`.trim();
  if (written.length > 60) {
    obs.push({ stat: 'reflection_depth', value: 72, weight: 0.1, note: 'wrote specific feedback' });
  } else if (written.length > 0 && written.length < 15) {
    obs.push({ stat: 'reflection_depth', value: 40, weight: 0.05 });
  }
  return obs;
}

// ── a whole sitting ────────────────────────────────────────────────────────
// A gap this long between two answers is the learner leaving and coming back:
// the app keeps an unfinished sitting open and resumes it, so a sitting can
// span days, and a level can be left partway and finished another day.
const PAUSE_MS = 30 * 60000;

/** When an item was answered: its answer's write (the row's last update). */
function answeredAt(item) {
  return Date.parse(item.answered_at || item.updated_at || item.created_at || 0) || 0;
}

/**
 * @param {object} session
 * @param {object[]} items
 * @param {{abandoned?: boolean}} [opts]  abandoned: the sitting was closed
 *   unfinished (routes/learn.js, when another level was opened), so its
 *   unanswered questions were left for good.
 */
function fromSession(userId, session, items, { abandoned = false } = {}) {
  const obs = [];
  const answered = items.filter((i) => i.correct !== null && i.correct !== undefined && i.role !== 'retention');
  if (!answered.length) return obs;
  const started = Date.parse(session.started_at || 0);
  const ended = Date.parse(session.ended_at || new Date().toISOString());
  // Time actually spent: the breaks of a resumed sitting are left out.
  const times = [started, ...answered.map(answeredAt).filter((t) => t >= started).sort((a, b) => a - b), ended];
  let activeMs = 0;
  for (let i = 1; i < times.length; i++) {
    const gap = times[i] - times[i - 1];
    if (gap > 0 && gap < PAUSE_MS) activeMs += gap;
  }
  const minutes = activeMs / 60000;
  const unanswered = items.filter((i) => i.correct === null && i.role !== 'retention').length;
  const acc = accuracy(answered);

  if (minutes > 25 && acc >= 0.7) obs.push({ stat: 'attention_runway', value: 75, weight: 0.15, note: `${Math.round(minutes)} focused minutes` });
  if (unanswered > 0 && minutes < 8) {
    obs.push({ stat: 'attention_runway', value: 30, weight: 0.2, note: 'left early with questions unanswered' });
  }

  // Persistence: every moment with three or more misses in a row and questions
  // still to come in that level is a chance to stop. Stopping there is the
  // event: the rest of the level left unanswered (a sitting closed unfinished),
  // or the next answer only after a break (the level left partway and finished
  // another time: the app resumes an open sitting, so most quits look like
  // this). Carrying on is evidence too. A question skipped (a privileged skip)
  // is not a stop.
  const byLevel = {};
  for (const it of items) {
    if (it.role === 'retention') continue;
    const key = it.block !== undefined && it.block !== null ? `b${it.block}` : (it.level === undefined ? 'x' : it.level);
    (byLevel[key] = byLevel[key] || []).push(it);
  }
  let chances = 0;
  let stops = 0;
  let paused = 0;
  for (const list of Object.values(byLevel)) {
    const seq = list.sort((a, b) => (a.index || 0) - (b.index || 0));
    let run = 0;
    for (let i = 0; i < seq.length - 1; i++) {
      if (seq[i].correct === null || seq[i].correct === undefined) break;
      run = seq[i].correct ? 0 : run + 1;
      if (run < 3) continue;
      const next = seq[i + 1];
      const open = next.correct === null || next.correct === undefined;
      if (open && next.skipped) break;
      chances++;
      if (open) { stops++; break; }
      if (answeredAt(next) - answeredAt(seq[i]) >= PAUSE_MS) { stops++; paused++; run = 0; }
    }
  }
  if (chances) {
    const note = !stops ? 'kept going after a run of misses'
      : abandoned ? 'left the level after a run of misses and moved on'
        : paused ? 'left the level after a run of misses, finished it later' : 'stopped after a run of misses';
    obs.push({ stat: 'persistence', hits: stops, trials: chances, note });
  }
  // Levels per sitting used to score mastery velocity here. It measures time
  // on task, not how fast someone learns, and only ever pushed one way, so it
  // is gone: the rate of learning needs the slope of ability on calibrated
  // items, which is not measured yet.

  // Coming back after a break: did the first level suffer for it?
  const earlier = db.find('sessions', (s) => s.user_id === userId && s.id !== session.id && s.ended_at
    && s.kind !== 'placement' && Date.parse(s.ended_at) < started)
    .sort((a, b) => Date.parse(b.ended_at) - Date.parse(a.ended_at));
  if (earlier.length >= 2) {
    const gapDays = (started - Date.parse(earlier[0].ended_at)) / 86400000;
    const usual = earlier.slice(0, 6).reduce((a, s) => a + (s.score || 0), 0) / Math.min(6, earlier.length);
    const firstBlock = accuracy(answered.filter((i) => (i.block || 0) === 0));
    if (gapDays >= 3 && firstBlock !== null) {
      obs.push({
        stat: 'reentry_cost',
        value: usual - firstBlock > 0.2 ? 75 : 30,
        weight: 0.2,
        note: `${Math.round(gapDays)} days away, first level at ${Math.round(firstBlock * 100)}%`,
      });
    }
    // How regular their study is: the spread of the gaps between sittings.
    const recent = [session, ...earlier.slice(0, 9)].map((s) => Date.parse(s.started_at || s.created_at));
    if (recent.length >= 5) {
      const gaps = [];
      for (let i = 0; i < recent.length - 1; i++) gaps.push(Math.abs(recent[i] - recent[i + 1]) / 86400000);
      const mean = gaps.reduce((a, g) => a + g, 0) / gaps.length;
      const sd = Math.sqrt(gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length);
      obs.push({ stat: 'session_rhythm', value: clamp(90 - (sd / Math.max(0.5, mean)) * 50), weight: 0.15 });
    }
  }
  return obs;
}

/** Placement measures what the learner already knows about a subject. */
function fromPlacement(placedLevel, pathLength) {
  const share = pathLength ? placedLevel / pathLength : 0;
  // A placement is a designed test of many items, so it counts as four units
  // of evidence and may move the stat further at once (test: true) than a
  // level can (scorecard/index.js TEST_BATCH_CAP, TEST_MAX_STEP).
  return [{ stat: 'prior_knowledge', value: clamp(10 + share * 85), weight: 4, test: true, note: `placed at level ${placedLevel}` }];
}

/** This learner's usual check accuracy on a lesson: the bar an experiment is measured against. */
function lessonBaseline(userId) {
  const rows = db.find('level_signals', (r) => r.user_id === userId
    && (r.kind === 'lesson' || r.kind === 'base_lesson')
    && typeof r.accuracy === 'number' && !(r.experiment && r.experiment.stat))
    .slice(-10);
  if (rows.length < 2) return 0.7;
  return rows.reduce((a, r) => a + r.accuracy, 0) / rows.length;
}

module.exports = {
  experimentModel,
  residuals,
  experimentOutcome,
  RATES,
  CONTRASTS,
  SHIFTS,
  TAPS,
  expectedMs,
  fromAnswer,
  delayedExperimentOutcome,
  fromBlock,
  fromLesson,
  fromBaseLesson,
  fromFeedback,
  fromSession,
  fromPlacement,
  lessonBaseline,
  lessonWords,
  accuracy,
};
