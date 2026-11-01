/**
 * Indicators (round 9, docs/SCORECARD-EVERYTHING.md): everything a learner does, says or types that is not already an answer, a tap or a
 * lesson-page reading, as calibrated evidence for the measures it bears on.
 *
 * An indicator is one number per unit of behaviour (a message in a tutor chat, an answered question, a week of use), kept per learner as
 * faded moments, never as the text or the keys:
 *
 *   txt.*   deterministic features of the learner's own words (text-features.js): length, questions, hedges, vocabulary, register...
 *   llm.*   a model's structured read of the learner's chat transcripts (transcript-read.js) and the tutor's own observations
 *           (hooks.onTutorObservation): one per measure, -3..3 per read
 *   cap.*   browser capture on question screens (public/js/silent-signals.js, the opt-in "silent signals" extra): tab-aways, time away,
 *           changes of a multiple-choice pick before checking, long pauses while typing, idle stretches
 *   use.*   how the app is used (hooks.usageSweep, read from the learner's own rows): extras switched on, settings changed, own material
 *           uploaded, how regular the hour of starting is, how much they talk to the tutor
 *
 * How an indicator becomes evidence. For the learner's long-run mean of indicator k (standardised against the population: centre mu_k
 * and true between-learner spread tau_k, empirical Bayes like every other standing), the model is
 *
 *     x_k = a_k z + e_k,    a_k = sign x validity (MAP below),   Var(e_k) = 1 - v_k^2 + noise_k,
 *
 * z the learner's standing on the measure, noise_k = within_k / (n_k tau_k^2) the sampling noise of n_k units. The validity v_k is what the
 * long-run mean could tell even with unlimited data; the rest of the learner's spread on the indicator is other things (a verbose person
 * writes long messages whatever their reflection depth), so more messages never make an indicator more valid than v. Indicators of one
 * family (txt and llm are both "text": the same words) share part of that nuisance: correlation RHO between their e's, so ten lexical
 * counts of the same words are not ten independent witnesses. The posterior for z is the generalised least squares one under a N(0, 1)
 * prior: precision 1 + a' S^-1 a, mean a' S^-1 x / precision. scorecard/index.js read() and standing() combine it with the measure's own
 * evidence (its existing posterior as the prior), so no source is dropped and none is counted twice.
 *
 * Every validity is set conservatively, at or below what the cited research found for the best case (docs/SCORECARD-EVERYTHING.md, the
 * coverage matrix), and the recovery sim models each source with the SAME validity (never higher) plus a run at half of it.
 * SCORECARD_INDICATORS=off ignores them all (comparison runs); SCORECARD_INDICATOR_FAMILIES=text,capture,usage keeps only those.
 */

// [indicator key, family, what one unit is, [[stat, sign, validity], ...]]
const RAW = [
  // ── text: deterministic features of the learner's own words (one unit = one message, or one open typed answer) ──
  ['txt.len', 'text', 'log words in the message', [['reflection_depth', 1, 0.25], ['dialogic_preference', 1, 0.15], ['brevity_preference', -1, 0.15], ['elaboration_benefit', 1, 0.1]]],
  ['txt.question', 'text', 'the message is a question', [['question_generation', 1, 0.4], ['help_seeking', 1, 0.2], ['dialogic_preference', 1, 0.2], ['curiosity_hook', 1, 0.15]]],
  ['txt.deepq', 'text', 'a why / how / what-if question', [['question_generation', 1, 0.3], ['curiosity_hook', 1, 0.2], ['causal_chain_depth', 1, 0.15], ['conceptual_bias', 1, 0.15], ['intrinsic_motivation', 1, 0.15]]],
  ['txt.hedge', 'text', 'hedges per 10 words (maybe, I think, not sure)', [['self_efficacy', -1, 0.25], ['evaluation_anxiety', 1, 0.15]]],
  ['txt.certain', 'text', 'certainty words per 10 words (definitely, I know)', [['self_efficacy', 1, 0.2]]],
  ['txt.vocab', 'text', 'share of words of 7+ letters (messages of 5+ words)', [['vocabulary_ceiling', 1, 0.3], ['jargon_absorption', 1, 0.15], ['text_density_tolerance', 1, 0.1]]],
  ['txt.grade', 'text', 'reading grade of the message (Flesch-Kincaid, 8+ words)', [['vocabulary_ceiling', 1, 0.25], ['abstraction_tolerance', 1, 0.1]]],
  ['txt.nonstd', 'text', 'share of common misspellings and dropped apostrophes', [['vocabulary_ceiling', -1, 0.15]]],
  ['txt.formal', 'text', 'formal minus informal markers per 10 words', [['tone_formality', 1, 0.3]]],
  ['txt.humour', 'text', 'a laugh or joke marker (haha, lol, jk)', [['humor_receptivity', 1, 0.3]]],
  ['txt.emoji', 'text', 'emoji and emoticons (capped at 3)', [['tone_formality', -1, 0.2], ['emotional_engagement', 1, 0.1], ['gamification_response', 1, 0.1]]],
  ['txt.exclaim', 'text', 'exclamation marks (capped at 3)', [['emotional_engagement', 1, 0.1], ['stimulus_envelope', 1, 0.1]]],
  ['txt.polite', 'text', 'please / thanks / sorry', [['tone_formality', 1, 0.15]]],
  ['txt.negemo', 'text', 'frustration words (ugh, annoying, I hate, give up)', [['frustration_threshold', -1, 0.25], ['persistence', -1, 0.1], ['evaluation_anxiety', 1, 0.1]]],
  ['txt.posemo', 'text', 'enjoyment words (cool, fun, interesting, love)', [['intrinsic_motivation', 1, 0.2], ['emotional_engagement', 1, 0.15]]],
  ['txt.anxiety', 'text', 'worry words (nervous, scared, stressed, the test)', [['evaluation_anxiety', 1, 0.3], ['self_efficacy', -1, 0.1]]],
  ['txt.boredom', 'text', 'boredom words (boring, bored, so long, meh)', [['boredom_susceptibility', 1, 0.3], ['novelty_hunger', 1, 0.15], ['stimulus_envelope', 1, 0.1]]],
  ['txt.answerseek', 'text', 'asks for the answer itself (just tell me)', [['hint_dependency', 1, 0.25], ['productive_struggle', -1, 0.25], ['mastery_orientation', -1, 0.2]]],
  ['txt.metacog', 'text', 'talks about their own understanding (I get it now, I mixed up)', [['strategy_awareness', 1, 0.25], ['self_monitoring', 1, 0.15], ['reflection_depth', 1, 0.2]]],
  ['txt.connect', 'text', 'links to something else (this is like, reminds me)', [['integration_tendency', 1, 0.3], ['analogical_transfer', 1, 0.2], ['far_transfer', 1, 0.1]]],
  ['txt.relevance', 'text', 'asks or says what it is for in real life', [['relevance_demand', 1, 0.25], ['application_orientation', 1, 0.25], ['identity_alignment', 1, 0.15]]],
  ['txt.planning', 'text', 'plans and steps (first I will, my plan, by Friday)', [['planning_tendency', 1, 0.3], ['structure_need', 1, 0.15]]],
  ['txt.creative', 'text', 'tries a variation (what if, my own, another way)', [['creative_extension', 1, 0.3], ['cognitive_flexibility', 1, 0.1]]],
  ['txt.autonomy', 'text', 'wants to do it themselves (let me try, don\'t tell me)', [['autonomy_preference', 1, 0.3], ['productive_struggle', 1, 0.15]]],
  ['txt.compete', 'text', 'competition words (beat, win, rank, faster than)', [['competitive_drive', 1, 0.3], ['gamification_response', 1, 0.15]]],
  ['txt.reward', 'text', 'reward words (points, streak, badge, prize)', [['extrinsic_reward_sensitivity', 1, 0.3], ['gamification_response', 1, 0.2]]],
  ['txt.examplereq', 'text', 'asks for an example', [['example_density_need', 1, 0.25], ['worked_example_dependence', 1, 0.2]]],
  ['txt.simplerreq', 'text', 'asks for it simpler or for a word\'s meaning', [['jargon_absorption', -1, 0.2], ['step_explicitness', 1, 0.2], ['abstraction_tolerance', -1, 0.15]]],
  ['txt.bigpicture', 'text', 'asks what it is for or how it fits', [['global_framing_need', 1, 0.25], ['relevance_demand', 1, 0.15]]],
  ['txt.drift', 'text', 'share of the message\'s words not in the tutor\'s last message', [['boredom_susceptibility', 1, 0.15], ['attention_runway', -1, 0.1]]],
  ['txt.latency', 'text', 'log seconds from the tutor\'s reply to theirs', [['deliberation_depth', 1, 0.1], ['processing_velocity', -1, 0.15]]],
  // ── capture: the question screens (opt-in silent signals; one unit = one answered question) ──
  ['cap.tabaway', 'capture', 'times they left the tab while the question was open', [['attention_runway', -1, 0.25], ['boredom_susceptibility', 1, 0.15]]],
  ['cap.away', 'capture', 'share of the question\'s time spent away from the tab', [['attention_runway', -1, 0.2]]],
  ['cap.mcchange', 'capture', 'a different choice picked before checking', [['deliberation_depth', 1, 0.2], ['self_monitoring', 1, 0.15], ['perfectionism', 1, 0.1]]],
  ['cap.pause', 'capture', 'pauses of 2 s or more while typing an answer', [['deliberation_depth', 1, 0.15], ['working_memory_span', -1, 0.1]]],
  ['cap.idle', 'capture', 'a stretch of 30 s or more with no input, tab still open', [['attention_runway', -1, 0.15], ['fatigue_curve', 1, 0.1]]],
  // ── usage: how the app is used (one unit = one week) ──
  ['use.extras', 'usage', 'optional extras switched on', [['strategy_awareness', 1, 0.15], ['intrinsic_motivation', 1, 0.1], ['autonomy_preference', 1, 0.1]]],
  ['use.uploads', 'usage', 'own material uploaded in the week', [['intrinsic_motivation', 1, 0.2], ['application_orientation', 1, 0.15], ['autonomy_preference', 1, 0.15], ['identity_alignment', 1, 0.15]]],
  ['use.reread', 'usage', 'lesson pages opened again in the week (log 1 + count)', [['consolidation_need', 1, 0.2], ['text_density_tolerance', -1, 0.1]]],
  ['use.hour', 'usage', 'spread of the hour they start a sitting (circular SD, hours)', [['session_rhythm', -1, 0.3], ['planning_tendency', -1, 0.15]]],
  ['use.chat', 'usage', 'messages to the tutor per sitting', [['dialogic_preference', 1, 0.2], ['help_seeking', 1, 0.15], ['question_generation', 1, 0.1]]],
];

/**
 * The measures a model can read from a chat transcript (transcript-read.js), each its own llm.<stat> indicator. The validity, 0.25, is
 * below the average a zero-shot model reached for the Big Five from many posts (Peters & Matz 2024, r about 0.29) and below
 * open-vocabulary language models (Park et al. 2015, r about 0.38): a tutor chat is shorter than a year of posts, and most of these
 * measures are narrower than a personality trait.
 */
const LLM_STATS = ['question_generation', 'curiosity_hook', 'intrinsic_motivation', 'identity_alignment', 'evaluation_anxiety', 'self_efficacy',
  'frustration_threshold', 'strategy_awareness', 'reflection_depth', 'autonomy_preference', 'structure_need', 'planning_tendency',
  'creative_extension', 'integration_tendency', 'application_orientation', 'relevance_demand', 'humor_receptivity', 'tone_formality',
  'competitive_drive', 'extrinsic_reward_sensitivity', 'boredom_susceptibility', 'conceptual_bias', 'global_framing_need',
  'dialogic_preference', 'mastery_orientation', 'productive_struggle', 'persistence', 'social_framing', 'emotional_engagement',
  'cognitive_flexibility', 'vocabulary_ceiling', 'stimulus_envelope', 'gamification_response', 'praise_sensitivity', 'narrative_pull'];
const LLM_VALIDITY = 0.25;
for (const stat of LLM_STATS) RAW.push([`llm.${stat}`, 'text', `a model's read of the chat on ${stat} (-3..3)`, [[stat, 1, LLM_VALIDITY]]]);

// Correlation of the nuisance between two indicators of the same family for the same measure (they are read off the same words or the
// same screens). 0.3 is set, not measured; the sim uses the same.
const RHO = Number(process.env.SCORECARD_INDICATOR_RHO || 0.3);
// Units (messages, answers, weeks) before a learner's mean counts toward the population's figures.
const POP_MIN_UNITS = 3;
// How fast old units fade (days), as the rest of the scorecard's evidence.
const HALF_LIFE_DAYS = Number(process.env.SCORECARD_HALF_LIFE_DAYS || 90);

const families = () => {
  const f = String(process.env.SCORECARD_INDICATOR_FAMILIES || '').split(',').map((s) => s.trim()).filter(Boolean);
  return f.length ? new Set(f) : null;
};
const isOn = () => process.env.SCORECARD_INDICATORS !== 'off';

const INDICATORS = Object.fromEntries(RAW.map(([key, family, unit, maps]) => [key, { key, family, unit, maps: maps.map(([stat, sign, v]) => ({ stat, sign, v })) }]));
/** stat -> [{ key, family, sign, v }] */
const BY_STAT = {};
for (const ind of Object.values(INDICATORS)) for (const m of ind.maps) (BY_STAT[m.stat] = BY_STAT[m.stat] || []).push({ key: ind.key, family: ind.family, sign: m.sign, v: m.v });

const round4 = (v) => Number(v.toFixed(4));

/**
 * Fold a batch of n units with mean x into a learner's moments for one indicator, faded by time: w = sum of weights (n, faded), s and q =
 * weighted sums of the batch means and their squares, ww = sum of faded-weight^2 / n (so the mean's sampling variance is within x ww / w^2,
 * and is within / n for unfaded units), b = batches. Only aggregates leave the browser, so a learner's own spread is read from the spread
 * of their batch means (each has variance within / n), pooled across learners.
 */
function addUnits(prev, mean, n, nowIso) {
  const p = prev || { w: 0, s: 0, q: 0, ww: 0, b: 0, at: null };
  const days = p.at ? (Date.parse(nowIso) - Date.parse(p.at)) / 86400000 : 0;
  const f = days > 0 ? 2 ** (-days / HALF_LIFE_DAYS) : 1;
  return { w: round4(p.w * f + n), s: round4(p.s * f + n * mean), q: round4(p.q * f + n * mean * mean), ww: round4(p.ww * f * f + n), b: (p.b || 0) + 1, at: nowIso };
}

/** The population figures for every indicator, from the learners' moments: { key: { mu, tau, within } }. `eb` is scorecard ebFigures. */
function population(cards, eb) {
  const out = {};
  for (const key of Object.keys(INDICATORS)) {
    const ms = cards.map((c) => c && c.ind && c.ind[key]).filter((m) => m && m.w >= POP_MIN_UNITS);
    // Pooled within-learner variance of one unit: the weighted spread of each learner's batch means (sum of n_b (x_b - mean)^2, expected
    // (batches - 1) x within), over the learners' batches minus one each.
    let ss = 0;
    let df = 0;
    for (const m of ms) {
      if ((m.b || 0) < 2) continue;
      ss += Math.max(0, m.q - (m.s * m.s) / m.w);
      df += m.b - 1;
    }
    if (df < 5) continue;
    const within = ss / df;
    const est = ms.map((m) => ({ x: m.s / m.w, s2: within * m.ww / (m.w * m.w) }));
    const f = eb(est);
    if (f && f.tau) out[key] = { mu: f.mu, tau: f.tau, within, n: est.length };
  }
  return out;
}

/** Small dense solve, A x = b (Gauss-Jordan with pivoting). */
function solveVec(A, b) {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c] || 1e-12;
    for (let k = c; k <= n; k++) M[c][k] /= d;
    for (let r = 0; r < n; r++) {
      if (r === c || !M[r][c]) continue;
      const f = M[r][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row) => row[n]);
}

/**
 * The likelihood the indicators give about z for one stat: { info, num, keys, units } (information a' S^-1 a and the numerator a' S^-1 x,
 * so a posterior with any prior is (num + prior part) / (info + prior precision)), or null when there is none. `pop` = population().
 * `scale` multiplies every validity (a robustness knob for tests; 1 in the app).
 */
function likelihood(ind, statId, pop, { scale = 1 } = {}) {
  if (!isOn() || !ind || !pop) return null;
  const fam = families();
  const parts = [];
  for (const m of BY_STAT[statId] || []) {
    if (fam && !fam.has(m.family)) continue;
    const mom = ind[m.key];
    const f = pop[m.key];
    if (!mom || !(mom.w > 0) || !f || !f.tau) continue;
    const nEff = (mom.w * mom.w) / Math.max(mom.ww, 1e-9);
    const x = (mom.s / mom.w - f.mu) / f.tau;
    const noise = f.within / (nEff * f.tau * f.tau);
    const v = Math.min(0.95, m.v * scale);
    parts.push({ key: m.key, family: m.family, a: m.sign * v, x, nuis: Math.sqrt(1 - v * v), noise, units: mom.w });
  }
  if (!parts.length) return null;
  const k = parts.length;
  // The shared nuisance is assumed to point the way of each indicator's sign for this measure (method variance that looks like signal):
  // the conservative case, which never lets two indicators of opposite sign cancel each other's nuisance and so never adds information
  // by assumption. (Where the true correlation helps instead, the intervals come out wider than they need to be, not narrower.)
  const S = parts.map((p, i) => parts.map((q, j) => (i === j ? p.nuis * p.nuis + p.noise : (p.family === q.family ? RHO * p.nuis * q.nuis * Math.sign(p.a) * Math.sign(q.a) : 0))));
  const a = parts.map((p) => p.a);
  const sa = solveVec(S, a);
  const info = sa.reduce((acc, v, i) => acc + v * a[i], 0);
  const num = sa.reduce((acc, v, i) => acc + v * parts[i].x, 0);
  if (!(info > 0) || k === 0) return null;
  return { info, num, keys: parts.map((p) => p.key), units: Math.round(parts.reduce((acc, p) => acc + p.units, 0)) };
}

/** The posterior for z from the indicators alone (N(0, 1) prior): { z, sd }. */
function posterior(ind, statId, pop, opts) {
  const l = likelihood(ind, statId, pop, opts);
  if (!l) return null;
  const prec = 1 + l.info;
  return { z: l.num / prec, sd: Math.sqrt(1 / prec), keys: l.keys, units: l.units };
}

/**
 * Combine an existing posterior for z (the measure's own evidence: z, sd) with the indicators' likelihood: the existing posterior is the
 * prior of the indicator update. One that claims to be wider than the population (sd >= 1) is read as N(z, 1): its centre is kept and
 * its width capped at the population's. The scorecard reports such widths for evidence it does not count as measured (a questionnaire's
 * nudge moves the measured score with no measured mass, so its standard error stays at 25 points): taking that width at its word let a
 * weak indicator pull a good self-report estimate toward the middle (measured in the recovery sim: planning tendency and structure need
 * lost 0.3 to 0.6 points of accuracy before this rule). With no evidence of its own (z = 0) it is the population prior.
 */
function combine(existing, l) {
  if (!l) return existing;
  const pe = existing && existing.sd > 0 ? Math.max(1, 1 / (existing.sd * existing.sd)) : 1;
  const ze = existing ? existing.z : 0;
  const prec = pe + l.info;
  return { z: (ze * pe + l.num) / prec, sd: Math.sqrt(1 / prec) };
}

/** Observations for a batch of indicator means: { key: { mean, n } } -> [{ indicator, x, n }]. Unknown keys and non-numbers are dropped. */
function observations(batch) {
  const out = [];
  for (const [key, v] of Object.entries(batch || {})) {
    if (!INDICATORS[key] || !v) continue;
    const x = Number(v.mean);
    const n = Number(v.n);
    if (Number.isFinite(x) && n > 0) out.push({ indicator: key, x, n: Math.min(n, 500) });
  }
  return out;
}

module.exports = { INDICATORS, BY_STAT, LLM_STATS, LLM_VALIDITY, RHO, POP_MIN_UNITS, addUnits, population, likelihood, posterior, combine, observations, isOn };
