/**
 * The learning scorecard: storage and the arithmetic that moves it.
 *
 * Every stat is a score (0–100) plus an evidence mass. Confidence is derived
 * from the mass, so the same number means very different things at day one and
 * after fifty levels — and the translation layer (translate.js) only acts on
 * stats it is confident about.
 *
 * How a stat moves:
 *
 *   - Evidence arrives as observations: { stat, value 0–100, weight 0–1 }.
 *     A weight is how strong that one piece of evidence is: a self-report is
 *     weak, a measured A/B difference in delayed recall is strong.
 *   - Observations for the same stat in one batch are averaged by weight, and
 *     the batch's total weight is capped, so one unusual session cannot
 *     redefine a learner.
 *   - The score moves toward the batch value in proportion to the batch weight
 *     against the evidence already held (a Bayesian-style precision update),
 *     and never by more than MAX_STEP points at once.
 *   - Old evidence fades with TIME (half-life EVIDENCE_HALF_LIFE_DAYS), not
 *     with each update: a stat touched by every answer and one touched once a
 *     week lose the same share of their evidence in a quiet month. The mass is
 *     also capped, so a learner who changes is followed, not held to the past.
 *   - The score is a posterior: it starts from the population's value for the
 *     stat with a prior strength set by how much learners differ on it (the
 *     less they differ, the more evidence it takes to move one learner away).
 *   - Some stats are rates — events out of chances (signals.js RATES) — and
 *     are scored from their counts instead.
 *
 * Two scores per stat, because not all evidence is measurement:
 *
 *   s  the score the learner and the admin see. Everything moves it: behaviour,
 *      experiments, the questionnaire, and the after-level model read.
 *   m  the MEASURED score: only what the learner did (behaviour, feedback taps,
 *      experiments), with the questionnaire as a starting nudge. The model read
 *      never moves it. Confidence comes only from measured mass (mw), and the
 *      lesson directives are built from m. So a model that keeps suggesting
 *      the same thing can move what is shown, but can never make the app sure
 *      of it, or change a lesson because of it.
 *
 * Evidence mass is also kept by source (src: beh, exp, quiz, llm), so "why is
 * the app sure of this?" has an answer.
 *
 * New learners start at the population average for each stat once enough
 * learners have confident scores, and at 50 until then — with zero confidence
 * either way.
 */
const db = require('../../config/db');
const { STATS, BY_ID, CATEGORIES } = require('./stats');
const { RATES, CONTRASTS, SHIFTS, TAPS, experimentModel } = require('./signals');
const forgetting = require('./forgetting');

/** The shift model of a stat: its own (signals.js SHIFTS), or an experiment's. */
function shiftModelOf(statId) {
  return SHIFTS[statId] || experimentModel(statId);
}

const MAX_STEP = Number(process.env.SCORECARD_MAX_STEP || 15);
// A designed test (placement) is one measurement of many items, not one
// unusual session, so it may move a stat this far at once.
const TEST_MAX_STEP = 40;
const BATCH_WEIGHT_CAP = 2;
// A placement of ~20 adaptive items has a standard error of roughly 10 points
// on this scale, which is about 4-6 units of mass; it may count as 4.
const TEST_BATCH_CAP = 4;
const EVIDENCE_HALF_LIFE_DAYS = Number(process.env.SCORECARD_HALF_LIFE_DAYS || 90);
// Evidence mass never grows past this, so a learner who changes is followed
// within a few dozen observations instead of being held to who they were. At
// this mass confidence is already about 93%.
const MAX_MASS = 8;
const CONF_SCALE = 3;          // evidence mass at which confidence reaches ~63%
const LOG_KEEP = 400;
const POPULATION_MIN = Number(process.env.SCORECARD_POPULATION_MIN || 20); // learners needed before the population prior and standings are used (env knob: BASELINE step 37)
// Sources whose evidence counts as measured, and so toward confidence.
const MEASURED = ['beh', 'exp'];
const MODEL_SOURCES = /^(after-level read|recommendation review)/;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function confidenceOf(mass) {
  return Math.round(100 * (1 - Math.exp(-(mass || 0) / CONF_SCALE)));
}

const round2 = (v) => Number(v.toFixed(2));
const round4 = (v) => Number(v.toFixed(4));

/** The measured mass of a record; a record from before m existed has none recorded. */
function measuredMass(record) {
  return (record && record.mw) || 0;
}
function measuredScore(record) {
  return record && record.m !== undefined ? record.m : (record ? record.s : 50);
}

/** The population average for each stat, among learners the app is confident about. */
let populationCache = { at: 0, values: null };
function populationPriors() {
  if (populationCache.values && Date.now() - populationCache.at < 10 * 60 * 1000) return populationCache.values;
  const values = {};
  const strengths = {};
  const rows = db.all('scorecards');
  for (const stat of STATS) {
    const confident = rows
      .map((r) => r.stats && r.stats[stat.id])
      .filter((s) => s && confidenceOf(measuredMass(s)) >= 50);
    if (confident.length >= POPULATION_MIN) {
      const mean = confident.reduce((a, s) => a + measuredScore(s), 0) / confident.length;
      const sd = Math.sqrt(confident.reduce((a, s) => a + (measuredScore(s) - mean) ** 2, 0) / confident.length);
      values[stat.id] = Math.round(mean);
      // How much learners differ on this stat sets how strongly a new learner
      // is held at the population value: (REF_SD / spread)^2 units of mass, so a
      // stat everyone scores alike on needs more evidence to move one learner.
      strengths[stat.id] = clamp((REF_SD / Math.max(sd, 1)) ** 2, 0.5, 4);
    }
  }
  // A rate stat's norm is the median rate among learners with enough chances,
  // once there are enough of them; until then, the starting value in RATES.
  const norms = {};
  for (const statId of Object.keys(RATES)) {
    if (RATES[statId].over) continue; // read against the learner's own side rate instead
    const rates = rows.map((r) => r.stats && r.stats[statId] && r.stats[statId].rate)
      .filter((x) => x && x.n >= 30).map((x) => x.k / x.n).sort((a, b) => a - b);
    if (rates.length >= POPULATION_MIN) norms[statId] = Math.max(0.005, rates[Math.floor(rates.length / 2)]);
  }
  // A contrast's norm is the median difference between its two sides, and a
  // shift's norm and spread (tau) come from the population's own estimates:
  // the median shift, and the spread between learners that is left after the
  // noise in each learner's estimate is taken out (method of moments). A
  // spread near zero means learners do not measurably differ on it, and every
  // learner is then held near the norm: the honest answer.
  const contrastNorms = {};
  const ordinals = {};
  for (const [statId, model] of Object.entries(CONTRASTS)) {
    if (model.ordinal) {
      const est = rows.map((r) => r.sides && aurocOf(r.sides, model)).filter((e) => e && e.n0 >= 10 && e.n1 >= 10);
      if (est.length >= POPULATION_MIN) {
        const as = est.map((e) => e.a).sort((a, b) => a - b);
        const mean = as.reduce((x, a) => x + a, 0) / as.length;
        const varA = as.reduce((x, a) => x + (a - mean) ** 2, 0) / (as.length - 1);
        const noise = est.reduce((x, e) => x + e.v, 0) / est.length;
        ordinals[statId] = { norm: as[Math.floor(as.length / 2)], tau: Math.sqrt(Math.max(0.02 ** 2, varA - noise)) };
      }
      continue;
    }
    const est = rows.map((r) => r.sides || {})
      .filter((sd) => sd[model.high] && sd[model.low] && sd[model.high].n >= 20 && sd[model.low].n >= 20)
      .map((sd) => {
        const hi = sd[model.high];
        const lo = sd[model.low];
        const ph = hi.k / hi.n;
        const pl = lo.k / lo.n;
        return { d: ph - pl, s2: (ph * (1 - ph)) / hi.n + (pl * (1 - pl)) / lo.n };
      });
    if (est.length >= POPULATION_MIN) {
      const ds = est.map((e) => e.d).sort((a, b) => a - b);
      const mean = ds.reduce((a, d) => a + d, 0) / ds.length;
      const varD = ds.reduce((a, d) => a + (d - mean) ** 2, 0) / (ds.length - 1);
      const noise = est.reduce((a, e) => a + e.s2, 0) / est.length;
      contrastNorms[statId] = { norm: ds[Math.floor(ds.length / 2)], tau: Math.sqrt(Math.max((model.tau / 5) ** 2, varD - noise)) };
    }
  }
  const shifts = {};
  const experimentStats = new Set();
  for (const r of rows) for (const key of Object.keys(r.sides || {})) if (key.startsWith('exp_hi:')) experimentStats.add(key.slice(7));
  const shiftModels = [...Object.entries(SHIFTS), ...[...experimentStats].map((id) => [id, experimentModel(id)])];
  for (const [statId, model] of shiftModels) {
    const est = rows.map((r) => r.sides || {})
      .filter((sd) => sd[model.high] && sd[model.low] && sd[model.high].v >= 2 && sd[model.low].v >= 2)
      .map((sd) => ({ d: sd[model.high].r / sd[model.high].v - sd[model.low].r / sd[model.low].v, s2: 1 / sd[model.high].v + 1 / sd[model.low].v }));
    if (est.length >= POPULATION_MIN) {
      const ds = est.map((e) => e.d).sort((a, b) => a - b);
      const mean = ds.reduce((a, d) => a + d, 0) / ds.length;
      const varD = ds.reduce((a, d) => a + (d - mean) ** 2, 0) / (ds.length - 1);
      const noise = est.reduce((a, e) => a + e.s2, 0) / est.length;
      shifts[statId] = { norm: ds[Math.floor(ds.length / 2)], tau: Math.sqrt(Math.max(0.05 ** 2, varD - noise)) };
    }
  }
  const taps = {};
  for (const [statId, model] of Object.entries(TAPS)) {
    const est = rows.map((r) => r.sides && r.sides[`taps:${statId}`]).filter((t) => t && t.n >= 5)
      .map((t) => tapPosterior(t, model.centre, 0.25)).sort((a, b) => a.mean - b.mean);
    if (est.length >= POPULATION_MIN) {
      const mean = est.reduce((a, e) => a + e.mean, 0) / est.length;
      const varT = est.reduce((a, e) => a + (e.mean - mean) ** 2, 0) / (est.length - 1);
      const noise = est.reduce((a, e) => a + e.sd ** 2, 0) / est.length;
      taps[statId] = { centre: est[Math.floor(est.length / 2)].mean, spread: Math.sqrt(Math.max(0.02 ** 2, varT - noise)) };
    }
  }
  // Where a learner stands among learners (standing() below): for each rate
  // stat, the spread of learners' logit rates beyond their counting noise; for
  // each value-path stat, the spread of learners' weighted means beyond their
  // sampling noise (pooled within-learner variance).
  const rateLogits = {};
  for (const statId of Object.keys(RATES)) {
    const est = rows.map((r) => r.stats && r.stats[statId] && r.stats[statId].rate && r.stats[statId].rate.n >= RATE_EB_MIN
      ? rateLogit(statId, r.stats[statId].rate, r.sides || {}) : null).filter(Boolean);
    const eb = ebFigures(est);
    if (eb) rateLogits[statId] = eb;
  }
  const valuePaths = {};
  for (const stat of STATS) {
    const vxs = rows.map((r) => r.stats && r.stats[stat.id] && r.stats[stat.id].vx).filter((v) => v && v.w > 0);
    let ss = 0;
    let df = 0;
    for (const v of vxs) {
      if (v.tw) continue; // a test's error is its own, not the within-learner spread
      const free = v.w - v.ww / v.w;
      if (free <= 0) continue;
      ss += Math.max(0, v.q - (v.s * v.s) / v.w);
      df += free;
    }
    const within = df >= 5 ? ss / df : null;
    const est = vxs.filter((v) => (v.w * v.w) / Math.max(v.ww, 1e-9) >= VALUE_MIN_N || v.tw)
      .map((v) => valuePoint(v, within)).filter(Boolean);
    const eb = ebFigures(est);
    if (eb) valuePaths[stat.id] = { ...eb, within };
  }
  // Mastery velocity: learners' slopes of ability over practice (irt.js fitTrend).
  const velocity = ebFigures(rows.map((r) => r.ability && r.ability.trend && r.ability.trend.fit)
    .filter((v) => v && v.answers >= VELOCITY_MIN_ANSWERS && v.se > 0).map((v) => ({ x: v.slope, s2: v.se * v.se })));
  // Answer pace: learners' typical log time ratios (irt.js addPace).
  const pace = ebFigures(rows.map((r) => r.ability && r.ability.pace).filter((p) => p && p.n >= PACE_MIN)
    .map(pacePoint).filter(Boolean));
  // Reach per subject: learners' recent expected success on what the course serves them.
  const reach = {};
  if (REACH_ON) {
    const byTrack = {};
    for (const r of rows) {
      for (const [track, rc] of Object.entries((r.ability && r.ability.reach) || {})) {
        if (rc && rc.c >= REACH_MIN) (byTrack[track] = byTrack[track] || []).push(reachPoint(rc));
      }
    }
    for (const [track, est] of Object.entries(byTrack)) {
      const eb = ebFigures(est.filter(Boolean));
      if (eb) reach[track] = eb;
    }
  }
  // The forgetting curve, fitted to every learner's recent memory tests.
  const today = Date.now() / 86400000;
  const memoryLists = [];
  for (const r of rows) for (const list of Object.values(r.memory || {})) memoryLists.push(list);
  const memory = forgetting.population(memoryLists, today);
  populationCache = { at: Date.now(), values, norms, strengths, contrastNorms, ordinals, shifts, taps, memory, rateLogits, valuePaths, velocity, pace, reach };
  return values;
}

/**
 * How much evidence a stat's measurement rests on, by kind: evv counts the
 * value-path updates that carried measured weight, evx the model's own count
 * (chances for a rate, answers on the thinner side of a contrast or shift,
 * taps, memory tests) and evk its kind; tested marks a stat a designed test
 * (placement) measured. translate.js MIN_EVIDENCE says how much of each a
 * directive needs: a confident-looking estimate on a few levels of thin data
 * is still thin data, and the posterior's standard error is only as good as
 * the model behind it.
 */
function withEvidence(before, after, { value = 0, kind = null, count = 0, tested = false } = {}) {
  const out = { ...after, evv: ((before && before.evv) || 0) + value };
  if (kind) { out.evk = kind; out.evx = round2(Number(count) || 0); }
  if (tested || (before && before.tested)) out.tested = true;
  return out;
}

/** The thinner side's count for a contrast (both sides for a ROC area). */
function contrastEvidence(statId, sides) {
  const model = CONTRASTS[statId];
  if (model.ordinal) {
    const e = aurocOf(sides, model);
    return e ? Math.min(e.n0, e.n1) : 0;
  }
  return Math.min((sides[model.high] || {}).n || 0, (sides[model.low] || {}).n || 0);
}

/** The count behind a shift or a tap model. */
function modelEvidence(statId, sides, isTap) {
  if (isTap) return { kind: 'tap', count: (sides[`taps:${statId}`] || {}).n || 0 };
  const model = shiftModelOf(statId);
  return { kind: model.experiment ? 'experiment' : 'shift', count: Math.min((sides[model.high] || {}).n || 0, (sides[model.low] || {}).n || 0) };
}

/**
 * The fitted population forgetting curve, for review scheduling
 * (services/adaptation.js predictedRecall uses it in place of DEFAULT_CURVE).
 * Cheap: the population figures are cached for ten minutes.
 *
 * @param {object} [o]
 * @param {string} [o.userId]   also fit this learner's own half-life multiplier m
 * @param {string} [o.trackId]  ... from their memory tests in this subject only
 * @returns {{curve:{a,b,c}, fitted:boolean, source:'population'|'default', m:number,
 *   mSd:number, mSource:'learner'|'population'|'none', norm:number|null, tau:number|null,
 *   tests:number, learners:number, learnerTests:number, cap:number}}
 *   Read it with forgetting.recallAt(result, {days, right, wrong, fresh, guess}).
 *   Fallback: no fitted curve yet (fewer than 20 learners / 400 memory tests)
 *   gives DEFAULT_CURVE with m 0 and fitted false; any error gives the same.
 */
function forgettingCurve({ userId = null, trackId = null } = {}) {
  try {
    populationPriors();
    const pop = populationCache.memory || null;
    let rows = null;
    if (userId && pop && pop.curve) {
      const card = db.findOne('scorecards', (r) => r.user_id === userId);
      const memory = (card && card.memory) || {};
      rows = trackId ? memory[trackId] || [] : Object.values(memory).flat().sort((a, b) => a[6] - b[6]).slice(-forgetting.KEEP);
    }
    return forgetting.recallCurve(pop, rows, Date.now() / 86400000);
  } catch (err) {
    console.warn(`scorecard: forgetting curve failed: ${err.message}`);
    return forgetting.recallCurve(null, null);
  }
}

/** Forget the cached population figures, so the next read recomputes them (tests, simulations). */
function refreshPopulation() {
  populationCache = { at: 0, values: null };
}

function blankRecord(start = 50) {
  return { s: start, w: 0, n: 0, at: null, m: start, mw: 0, src: {} };
}

/** Prior strength for a stat, in mass units: 1 until the population says otherwise. */
function priorStrength(statId) {
  const strengths = (populationCache.values && populationCache.strengths) || {};
  return strengths[statId] || 1;
}

/** How much of a record's evidence is left after the time since it was last updated. */
function ageFactor(record, nowIso) {
  if (!record || !record.at) return 1;
  const days = (Date.parse(nowIso) - Date.parse(record.at)) / 86400000;
  return days > 0 ? 2 ** (-days / EVIDENCE_HALF_LIFE_DAYS) : 1;
}

function blankStats() {
  const priors = populationPriors();
  const stats = {};
  for (const stat of STATS) stats[stat.id] = blankRecord(priors[stat.id] !== undefined ? priors[stat.id] : 50);
  return stats;
}

function blank(userId) {
  return {
    user_id: userId,
    version: 2,
    stats: blankStats(),
    subjects: {},          // trackId -> { statId -> record }, for per-subject stats
    sides: {},             // side counts some rates are read against (signals.js RATES `over`)
    log: [],               // most recent evidence, for the learner and for debugging
    updates: 0,
  };
}

/**
 * A card from before measured scores existed. Its log says which stats were
 * ever moved by something other than the model read or the questionnaire; those
 * keep their score and mass as measured. The rest — moved only by opinion —
 * keep their shown score but start with no measured evidence. The log holds the
 * last LOG_KEEP moves, so measurement older than that is treated as absent:
 * the cautious direction.
 */
function migrate(card) {
  const measuredBy = new Set();
  for (const l of card.log || []) {
    if (!MODEL_SOURCES.test(String(l.source || '')) && l.source !== 'questionnaire') measuredBy.add(`${l.track || ''}:${l.stat}`);
  }
  const fix = (record, key) => {
    if (!record || record.m !== undefined) return record;
    const measured = measuredBy.has(key);
    return { ...record, m: measured ? record.s : 50, mw: measured ? record.w : 0, src: {} };
  };
  for (const stat of STATS) card.stats[stat.id] = fix(card.stats[stat.id], `:${stat.id}`) || blankRecord();
  for (const [trackId, recs] of Object.entries(card.subjects || {})) {
    for (const statId of Object.keys(recs)) recs[statId] = fix(recs[statId], `${trackId}:${statId}`);
  }
  card.version = 2;
  return card;
}

/** The scorecard for a user, created on first use. */
function get(userId) {
  const existing = db.findOne('scorecards', (r) => r.user_id === userId);
  if (existing) {
    if ((existing.version || 1) < 2) {
      migrate(existing);
      db.update('scorecards', existing.id, { stats: existing.stats, subjects: existing.subjects, version: 2 });
      return existing;
    }
    // A stat added after this scorecard was created starts neutral.
    let added = false;
    for (const stat of STATS) {
      if (!existing.stats[stat.id]) { existing.stats[stat.id] = blankRecord(); added = true; }
    }
    if (added) db.update('scorecards', existing.id, { stats: existing.stats });
    return existing;
  }
  return db.insert('scorecards', blank(userId));
}

/**
 * The score and confidence of one stat. For a per-subject stat, the subject's
 * own record is blended with the overall one by how much evidence each has —
 * a learner's first history lesson leans on what is known about them overall.
 *
 * Returns { score, confidence, measured, se }: `score` is what is shown,
 * `measured` is what lessons are tailored on, `confidence` is how sure the
 * measurement is, and `se` is the measured score's standard error in points
 * (REF_SD / sqrt(prior + mass)), so a caller can ask how far from 50 the
 * measurement really is.
 */
// Stats that are knowledge of one subject and nothing else. Their overall
// record (an average across subjects) means nothing, so a subject without its
// own evidence starts unknown instead of borrowing another subject's certainty:
// a full maths record must not make a first Spanish lesson look certain.
const SUBJECT_ONLY = new Set(['prior_knowledge']);

/** A measured score's standard error, in points, from its mass (one prior unit included). */
function seOf(mass) {
  return 25 / Math.sqrt(1 + (mass || 0));
}

// ── standing: where this learner stands among learners ─────────────────────
// A lesson directive says "this learner is unusual on this": among the people
// the app teaches, they are near the top (or bottom) on it. So the gate is a
// question about the learner's place in the population, asked of a calibrated
// posterior: the measurement (a rate, a contrast, a shift against expectation,
// taps read against the level, memory tests against the forgetting curve, or a
// weighted mean of observations) with its own sampling noise, read against the
// spread of the same measurement across learners once that noise is taken out
// (empirical Bayes: a normal prior with the population's centre and true
// spread). The result is a posterior for the learner's standardised standing
// z (0 = the typical learner, 1 = one between-learner SD above), from which
// translate.js asks P(z beyond the edge) directly, instead of turning an
// uncalibrated 0-100 score into a side.
//
// Every part is null until there is a population (POPULATION_MIN learners with
// enough of that evidence): with no population the old gate applies.
// Chances before a learner's rate counts toward the population's spread (its
// counting noise is taken out by the method of moments, so a rare event like
// stopping after three misses can count after a few).
const RATE_EB_MIN = 10;
const VALUE_MIN_N = 5; 
// A standing read through a second model's expectations (forgetting: the
// fitted curve and the ability model's expected recall; mastery velocity: the
// calibrated item difficulties) carries that model's misfit as well as its own
// noise, so translate.js widens it as for a behaviour-trait validity of 0.8
// instead of its usual 0.9. (Measured: a forgetting standing at z 1.6 +/- 0.6
// on a learner whose true decay was 47.)
const MODEL_VALIDITY = 0.8;
// A rate designed for one stat and also read, inverted, as another (the same
// chances and events: scroll-backs as consolidation need and as low tolerance
// for dense text; a repeated tagged mistake as misconception persistence and
// as not learning from errors). As evidence of the second stat it is evidence
// chosen for something else, held to the same lower validity. Measured: with
// full validity, low text-density-tolerance directives went false (3 of 4) on
// learners who simply re-read a lot; at 0.8 none did, and the misconception
// pair kept most of its true ones (at 0.7 it lost them all).
const SECONDARY_VALIDITY = MODEL_VALIDITY;
const SECONDARY_RATES = new Set(Object.keys(RATES).filter((id) => RATES[id].invert
  && Object.keys(RATES).some((other) => other !== id && !RATES[other].invert
    && RATES[other].chance === RATES[id].chance && RATES[other].event === RATES[id].event)));
const VELOCITY_MIN_ANSWERS = 200; // fresh answers before a learner's slope counts toward the population's
const PACE_MIN = 50;              // pace answers before a learner counts toward the population's pace

// Reach (round 4): how far ahead of the course the learner is in a subject, from
// the ability model's expectation of their recent fresh answers (irt.js reach).
// It is scaffolding fade's measurement: the expertise reversal effect says
// support should be full for a learner behind what the material assumes and
// faded for one ahead of it (Kalyuga 2007; Tetzlaff et al. 2025: d 0.505 and
// 0.428). SCORECARD_REACH=off turns it off (comparison runs).
const REACH_ON = process.env.SCORECARD_REACH !== 'off';
const REACH_STAT = 'scaffolding_fade';
const REACH_MIN = Number(process.env.SCORECARD_REACH_MIN || 150); // fresh answers in the subject before a learner's reach counts
// The ability model's own tracking error: an Elo estimate with learning rate K
// settles around the truth with a variance of K / (2 - K I), I = p(1 - p) about
// 0.21, which is 0.02 at the floor K of 0.04 (irt.js kUser) that a learner past
// 150 answers is at; that error is shared by every answer in the window, so it
// does not average out. (0.03 was measured first: 6-15 fewer true directives
// per 200 learners at four seeds, the same false ones.)
const REACH_TRACKING_VAR = Number(process.env.SCORECARD_REACH_TRACKING_VAR || 0.02);
/** Reach as a point: the faded mean logit of expected success, and its variance. */
function reachPoint(r) {
  if (!r || !(r.n > 1)) return null;
  const mean = r.s / r.n;
  const within = Math.max(0.01, r.q / r.n - mean * mean);
  return { x: mean, s2: within / r.n + REACH_TRACKING_VAR };
}
/** The evidence behind a learner's reach in a subject, for translate.js's minimum. */
function reachEvidence(card, trackId) {
  const r = card && card.ability && card.ability.reach && trackId && card.ability.reach[trackId];
  return r ? { kind: 'reach', count: r.c } : null;
}

/** Answer pace as a point: minus the mean log time ratio (faster = higher), and its sampling variance. */
function pacePoint(p) {
  if (!p || !(p.n > 1)) return null;
  const mean = p.s / p.n;
  const within = Math.max(0.01, p.q / p.n - mean * mean);
  return { x: -mean, s2: within / p.n };
}
         // effective observations before a value path counts toward the population
// A value path is a weighted mean of hand-set observations ("evidence the stat
// is about here"). For most stats those observations mix several behaviours
// (attention runway: session length, leaving early, a long lesson read, "too
// long" taps), so a learner's true mean is not the trait, and a posterior on
// it would be sure of the wrong thing (measured: attention_runway, intake and
// momentum directives went false). Only these read one behaviour, and only
// they (and any designed test) are read as a standing; the rest keep the old gate.
const MEASURED_VALUE_PATHS = new Set(['brevity_preference', 'prior_knowledge']);
// (processing_velocity's value path counts "fast and RIGHT", so ability leaks
// into it; its standing is its answer pace instead: the pace model in observe.)
const TEST_VARIANCE = 10 ** 2; // a designed test: a placement of ~20 adaptive items is about 10 points of error (TEST_BATCH_CAP above)

/** Population centre and true spread from point estimates { x, s2 } (method of moments). */
function ebFigures(est) {
  if (!est || est.length < POPULATION_MIN) return null;
  const xs = est.map((e) => e.x).sort((a, b) => a - b);
  const mean = xs.reduce((a, x) => a + x, 0) / xs.length;
  const varX = xs.reduce((a, x) => a + (x - mean) ** 2, 0) / (xs.length - 1);
  const noise = est.reduce((a, e) => a + e.s2, 0) / est.length;
  const tau2 = varX - noise;
  // No spread left once the noise is out: learners do not measurably differ.
  if (!(tau2 > 0)) return { mu: xs[Math.floor(xs.length / 2)], tau: null };
  return { mu: xs[Math.floor(xs.length / 2)], tau: Math.sqrt(tau2) };
}

/** A rate as a logit, with its counting variance; read over the learner's own side rate where the model says so. */
function rateLogit(statId, rate, sides) {
  const model = RATES[statId];
  const k = Math.max(0, rate.k);
  const n = Math.max(k, rate.n);
  const p = (k + 0.5) / (n + 1);
  let x = Math.log(p / (1 - p));
  if (model.over) {
    const norm = rateNorm(statId, sides);
    x -= Math.log(norm / (1 - norm));
  }
  return { x: model.invert ? -x : x, s2: 1 / (k + 0.5) + 1 / (n - k + 0.5) };
}

/** A value path's weighted mean and its sampling variance (pooled within-learner variance; a test's own error). */
function valuePoint(vx, within) {
  if (!vx || !(vx.w > 0)) return null;
  const x = vx.s / vx.w;
  const plain = Math.max(0, vx.ww - (vx.tw || 0));
  if (plain > 0 && within === null) return null;
  const s2 = ((plain > 0 ? within * plain : 0) + (vx.dv || 0)) / (vx.w * vx.w);
  return s2 > 0 ? { x, s2 } : null;
}

/** A normal posterior for z = (true - centre) / spread, from an estimate and its variance. */
function zPosterior(x, s2, mu, tau) {
  if (!tau || !(s2 > 0)) return null;
  const t2 = tau * tau;
  return { z: ((x - mu) / tau) * (t2 / (t2 + s2)), sd: Math.sqrt(s2 / (t2 + s2)) };
}

/** Combine posteriors of the same z (each from a N(0,1) prior): add their likelihoods. */
function combineZ(parts) {
  const ok = parts.filter((p) => p && p.sd > 0 && p.sd < 1);
  if (!ok.length) return null;
  if (ok.length === 1) return ok[0];
  const vs = ok.map((p) => p.v).filter(Boolean);
  let prec = 1;
  let num = 0;
  for (const p of ok) {
    prec += 1 / (p.sd * p.sd) - 1;
    num += p.z / (p.sd * p.sd);
  }
  return { z: num / prec, sd: Math.sqrt(1 / prec), ...(vs.length ? { v: Math.min(...vs) } : {}) };
}

/**
 * The learner's standing on a stat: { z, sd } (a posterior for their place
 * among learners, in between-learner SDs), or null when there is no
 * population for this kind of evidence yet or no evidence of it.
 */
function standing(card, statId, { trackId } = {}) {
  if (!populationCache.values) populationPriors();
  const pop = populationCache;
  const stat = BY_ID[statId];
  if (!stat) return null;
  // Scaffolding fade: reach in this subject against the subject's learners, and nothing else.
  if (statId === REACH_STAT && REACH_ON) {
    const r = trackId && card.ability && card.ability.reach && card.ability.reach[trackId];
    const f = pop.reach && trackId && pop.reach[trackId];
    if (!r || r.c < REACH_MIN || !f || !f.tau) return null;
    const e = reachPoint(r);
    return e ? zPosterior(e.x, e.s2, f.mu, f.tau) : null;
  }
  const overall = card.stats[statId];
  const sub = trackId && stat.subject && card.subjects && card.subjects[trackId] && card.subjects[trackId][statId];
  const own = trackId && SUBJECT_ONLY.has(statId);
  if (own && !sub) return null;
  // The subject's own record when it carries the evidence (as read() does).
  const rec = own || (sub && measuredMass(sub) >= measuredMass(overall)) ? sub : overall;
  if (!rec) return null;
  const sides = card.sides || {};
  const parts = [];
  if (RATES[statId] && rec.rate && rec.rate.n > 0 && pop.rateLogits && pop.rateLogits[statId]) {
    const e = rateLogit(statId, rec.rate, sides);
    const f = pop.rateLogits[statId];
    const z = zPosterior(e.x, e.s2, f.mu, f.tau);
    parts.push(z && (SECONDARY_RATES.has(statId) || RATES[statId].validity) ? { ...z, v: RATES[statId].validity || SECONDARY_VALIDITY } : z);
  }
  if (CONTRASTS[statId]) {
    const model = CONTRASTS[statId];
    if (model.ordinal) {
      const p = populationOf('ordinals', statId);
      const e = aurocOf(sides, model);
      if (p && e) parts.push(zPosterior(e.a, e.v, p.norm, p.tau));
    } else {
      const p = populationOf('contrastNorms', statId);
      const hi = sides[model.high];
      const lo = sides[model.low];
      if (p && hi && lo && hi.n > 0 && lo.n > 0) {
        const pooled = (hi.k + lo.k + 1) / (hi.n + lo.n + 2);
        const h = sideRate(hi, pooled);
        const l = sideRate(lo, pooled);
        parts.push(zPosterior(h.r - l.r, h.v + l.v, p.norm, p.tau));
      }
    }
  }
  if (TAPS[statId] && sides[`taps:${statId}`]) {
    const p = populationOf('taps', statId);
    if (p) {
      const { mean, sd } = tapPosterior(sides[`taps:${statId}`], p.centre, p.spread);
      // High appetite = a lower preferred success rate. The grid posterior is
      // already a posterior under the population's prior.
      parts.push({ z: (p.centre - mean) / p.spread, sd: Math.min(0.999, sd / p.spread) });
    }
  }
  const model = shiftModelOf(statId);
  if ((SHIFTS[statId] || sides[model.high]) && sides[model.high] && sides[model.low]) {
    const p = populationOf('shifts', statId);
    const hi = sides[model.high];
    const lo = sides[model.low];
    if (p && hi.v >= 0.5 && lo.v >= 0.5) {
      const z = zPosterior(hi.r / hi.v - lo.r / lo.v, 1 / hi.v + 1 / lo.v, p.norm, p.tau);
      parts.push(z && model.validity ? { ...z, v: model.validity } : z);
    }
  }
  // A model kept on the overall record (memory, mastery velocity, pace) counts
  // whichever record the rest is read from.
  const mz = rec.mz || (overall && overall.mz);
  if (mz) parts.push(mz);
  if (rec.vx && (MEASURED_VALUE_PATHS.has(statId) || rec.vx.tw) && pop.valuePaths && pop.valuePaths[statId]) {
    const f = pop.valuePaths[statId];
    const e = valuePoint(rec.vx, f.within);
    if (e) parts.push(zPosterior(e.x, e.s2, f.mu, f.tau));
  }
  return combineZ(parts);
}

function read(card, statId, { trackId } = {}) {
  // Evidence fades with time whether or not anything new arrives, so masses are
  // read as of now, not as of the record's last update.
  const nowIso = new Date().toISOString();
  const asOfNow = (record) => record && record.at && record.mw ? { ...record, mw: record.mw * ageFactor(record, nowIso) } : record;
  const overall = asOfNow(card.stats[statId]) || blankRecord();
  const stat = BY_ID[statId];
  const sub = asOfNow(trackId && stat && stat.subject && card.subjects[trackId] && card.subjects[trackId][statId]);
  const own = trackId && SUBJECT_ONLY.has(statId);
  if (!sub || !(sub.w || sub.mw)) {
    if (own) return { score: Math.round(overall.s), confidence: 0, measured: 50, se: seOf(0), evidence: null, tested: false };
    return { score: Math.round(overall.s), confidence: confidenceOf(measuredMass(overall)), measured: Math.round(measuredScore(overall)), se: seOf(measuredMass(overall)), ...evidenceOf(overall) };
  }
  // Subject evidence is the more specific, so it dominates as soon as there is
  // any: being advanced in maths says little about being advanced in Spanish.
  const blend = (a, b, wa, wb) => (a * wa + b * wb) / (wa + wb || 1);
  const score = blend(sub.s, overall.s, sub.w * 4, Math.min(overall.w, 1.5));
  const subM = measuredMass(sub);
  const allM = own ? 0 : measuredMass(overall);
  const measured = subM || allM
    ? blend(measuredScore(sub), measuredScore(overall), subM * 4, Math.min(allM, 1.5))
    : measuredScore(sub);
  return { score: Math.round(score), confidence: confidenceOf(Math.max(subM, allM)), measured: Math.round(measured), se: seOf(Math.max(subM, allM)), ...evidenceOf(subM >= allM ? sub : overall) };
}

/**
 * The evidence counts a directive is gated on (withEvidence). A record from
 * before they were kept, with measured evidence, is legacy: let through, so
 * existing learners' directives do not vanish until they build new counts.
 */
function evidenceOf(record) {
  if (!record) return { evidence: null, tested: false };
  if (record.evv === undefined && record.evx === undefined) return { evidence: { legacy: measuredMass(record) > 0 }, tested: !!record.tested };
  return { evidence: { value: record.evv || 0, kind: record.evk || null, count: record.evx || 0 }, tested: !!record.tested };
}

// ── rates (signals.js RATES) ───────────────────────────────────────────────
// A rate stat keeps counts — events and chances — instead of a running score.
// Old counts fade with time (half-life RATE_HALF_LIFE_DAYS), so the stat
// follows a learner who changes, and a quiet month weighs the same however
// many answers fell in it.
const RATE_HALF_LIFE_DAYS = 90;
const RATE_PRIOR_CHANCES = 40; // the norm counts as this many chances: rates differ between learners, but not wildly
// One unit of evidence mass is worth one observation with this spread, in
// points. It is how a rate's uncertainty is put on the same footing as every
// other stat's mass, so the one confidence rule applies to both.
const REF_SD = 25;

function fade(days) {
  return days > 0 ? 2 ** (-days / RATE_HALF_LIFE_DAYS) : 1;
}

/**
 * Score and mass from counts. The rate is a Beta posterior that starts at the
 * norm; the score is 100·r/(r + norm), so the norm reads 50, three times it 75
 * and a third of it 25; the mass comes from how uncertain that score still is.
 */
function rateScore(k, n, norm, invert) {
  // The score's standard error at counts (k, n), through the Beta posterior.
  const seAt = (hits, chances) => {
    const a = hits + RATE_PRIOR_CHANCES * norm;
    const b = Math.max(0, chances - hits) + RATE_PRIOR_CHANCES * (1 - norm);
    const r = a / (a + b);
    const sd = Math.sqrt((a * b) / ((a + b) ** 2 * (a + b + 1)));
    return { r, se: ((100 * norm) / (r + norm) ** 2) * sd };
  };
  const { r, se } = seAt(k, n);
  const score = (100 * r) / (r + norm);
  // Mass is what the data added beyond the prior: the prior alone (no
  // chances yet) is a starting point, not evidence about this learner.
  const prior = seAt(0, 0).se;
  const mass = clamp((REF_SD / Math.max(se, 0.01)) ** 2 - (REF_SD / prior) ** 2, 0, MAX_MASS);
  return { score: invert ? 100 - score : score, mass };
}

/**
 * The norm a rate is read against. For a rate measured over a learner's own
 * side count (RATES[stat].over), the norm is the allowance plus that learner's
 * side rate, shrunk toward a small default until it has data.
 */
function rateNorm(statId, sides = {}) {
  const model = RATES[statId];
  if (model.over) {
    const side = sides[model.over] || { k: 0, n: 0 };
    return model.norm + (side.k + RATE_PRIOR_CHANCES * 0.03) / (side.n + RATE_PRIOR_CHANCES);
  }
  const population = (populationCache.values && populationCache.norms) || {};
  return population[statId] || model.norm;
}

/** Fold new counts into a faded count record. */
function addCounts(prior, hits, trials, nowIso) {
  const was = prior || { k: 0, n: 0, at: nowIso };
  const f = fade((Date.parse(nowIso) - Date.parse(was.at)) / 86400000);
  return { k: Number((was.k * f + hits).toFixed(3)), n: Number((was.n * f + trials).toFixed(3)), at: nowIso };
}

// ── contrasts (signals.js CONTRASTS) ───────────────────────────────────────
/** One side's rate, lightly smoothed toward the pooled rate, and its variance. */
function sideRate(side, pooled) {
  const r = (side.k + 2 * pooled) / (side.n + 2);
  return { r, v: (r * (1 - r)) / (side.n + 2) };
}

/**
 * Score and mass from two side counts: the difference between the high side's
 * rate and the low side's (so whatever raises both — ability, general haste —
 * cancels), as a normal posterior around the norm with a prior spread tau,
 * the spread between learners (from the population once there is one). A
 * noisy difference is pulled toward the norm in proportion to its noise, so a
 * chance run of rapid choices does not read as a trait.
 */
function contrastScore(sides, model, pop) {
  const norm = pop ? pop.norm : model.norm;
  const tau = pop ? pop.tau : model.tau;
  const hi = sides[model.high];
  const lo = sides[model.low];
  if (!hi || !lo || !(hi.n > 0) || !(lo.n > 0)) return { score: 50, mass: 0 };
  const pooled = (hi.k + lo.k + 1) / (hi.n + lo.n + 2);
  const h = sideRate(hi, pooled);
  const l = sideRate(lo, pooled);
  const s2 = h.v + l.v;
  const t2 = tau ** 2;
  const post = ((h.r - l.r - norm) * t2) / (t2 + s2);
  const se = model.scale * Math.sqrt((t2 * s2) / (t2 + s2));
  const mass = clamp((REF_SD / Math.max(se, 0.01)) ** 2 - (REF_SD / (model.scale * tau)) ** 2, 0, MAX_MASS);
  return { score: clamp(50 + model.scale * post, 0, 100), mass };
}

function populationOf(key, statId) {
  const v = populationCache.values && populationCache[key] ? populationCache[key][statId] : undefined;
  return v === undefined ? null : v;
}

/**
 * The type-2 ROC area from side counts ordered least to most confident, each
 * { k: right, n: answered }: the chance a right answer was tapped more
 * confidently than a wrong one (ties count half), with its Hanley-McNeil
 * variance. Null until both right and wrong answers exist.
 */
function aurocOf(sides, model) {
  const split = model.ordinal.some((name) => name !== model.ordinal[model.ordinal.length - 1] && sides[name] && sides[name].n > 0);
  const order = split ? model.ordinal : model.fallback;
  const right = order.map((name) => (sides[name] ? sides[name].k : 0));
  const wrong = order.map((name) => (sides[name] ? Math.max(0, sides[name].n - sides[name].k) : 0));
  const n1 = right.reduce((a, x) => a + x, 0);
  const n0 = wrong.reduce((a, x) => a + x, 0);
  if (n1 < 1 || n0 < 1) return null;
  let wins = 0;
  let below = 0;
  for (let i = 0; i < order.length; i++) {
    wins += right[i] * (below + wrong[i] / 2);
    below += wrong[i];
  }
  const a = clamp(wins / (n1 * n0), 0.01, 0.99);
  const q1 = a / (2 - a);
  const q2 = (2 * a * a) / (1 + a);
  const v = Math.max(1e-4, (a * (1 - a) + (n1 - 1) * (q1 - a * a) + (n0 - 1) * (q2 - a * a)) / (n1 * n0));
  return { a, v, n0, n1 };
}

/** A normal posterior of the ROC area around the norm, as a score and mass. */
function ordinalScore(sides, model, pop) {
  const norm = pop ? pop.norm : model.norm;
  const tau = pop ? pop.tau : model.tau;
  const e = aurocOf(sides, model);
  if (!e) return { score: 50, mass: 0 };
  const t2 = tau ** 2;
  const post = ((e.a - norm) * t2) / (t2 + e.v);
  const se = model.scale * Math.sqrt((t2 * e.v) / (t2 + e.v));
  const mass = clamp((REF_SD / Math.max(se, 0.01)) ** 2 - (REF_SD / (model.scale * tau)) ** 2, 0, MAX_MASS);
  return { score: clamp(50 + model.scale * post, 0, 100), mass };
}

function applyContrast(record, statId, sides) {
  if (CONTRASTS[statId].ordinal) {
    const { score, mass } = ordinalScore(sides, CONTRASTS[statId], populationOf('ordinals', statId));
    return fromModel(record, score, mass);
  }
  const pop = populationOf('contrastNorms', statId);
  const { score, mass } = contrastScore(sides, CONTRASTS[statId], pop);
  // A contrast whose typical value is unknown until there is a population is
  // shown but never trusted before then.
  return fromModel(record, score, CONTRASTS[statId].needsPopulation && !pop ? 0 : mass);
}

// ── shifts (signals.js SHIFTS) ─────────────────────────────────────────────
/** Fold residual sums into a faded side record { r, v, n }. */
function addResid(prior, r, v, n, nowIso) {
  const was = prior || { r: 0, v: 0, n: 0, at: nowIso };
  const f = fade((Date.parse(nowIso) - Date.parse(was.at)) / 86400000);
  return { r: round4(was.r * f + r), v: round4(was.v * f + v), n: round4(was.n * f + n), at: nowIso };
}

/**
 * Score and mass of a shift: the logit shift between the two sides, as a
 * normal posterior around the norm with prior spread tau.
 */
function shiftScore(sides, model, pop) {
  const norm = pop ? pop.norm : model.norm;
  const tau = pop ? pop.tau : model.tau;
  const hi = sides[model.high];
  const lo = sides[model.low];
  if (!hi || !lo || hi.v < 0.5 || lo.v < 0.5) return { score: 50, mass: 0 };
  const d = hi.r / hi.v - lo.r / lo.v;
  const s2 = 1 / hi.v + 1 / lo.v;
  const t2 = tau ** 2;
  const post = ((d - norm) * t2) / (t2 + s2);
  const se = model.scale * Math.sqrt((t2 * s2) / (t2 + s2));
  const mass = clamp((REF_SD / Math.max(se, 0.01)) ** 2 - (REF_SD / (model.scale * tau)) ** 2, 0, MAX_MASS);
  return { score: clamp(50 + model.scale * post, 0, 100), mass };
}

/**
 * A stat can have two kinds of measured evidence: single observations moved
 * by the precision update (the value path: vm, vw) and a model over counts or
 * residuals (a contrast, a shift, an experiment, taps: xm, xw). Brevity, for
 * one, has length taps and an experiment. The measured score is both,
 * weighted by their masses; a model never wipes out the other's evidence.
 */
function combineMeasured(vm, vw, xm, xw) {
  // Neither confident: the model's point estimate is still the better guess to show.
  if (!(xw > 0) && !(vw > 0)) return { m: xm, mw: 0 };
  if (!(xw > 0)) return { m: vm, mw: vw };
  if (!(vw > 0)) return { m: xm, mw: xw };
  return { m: (vm * vw + xm * xw) / (vw + xw), mw: Math.min(MAX_MASS, vw + xw) };
}

/** A record with a model's new score and mass, keeping its value-path evidence and what opinion added to the shown score. */
function fromModel(record, score, mass, cls = 'beh') {
  const nowIso = new Date().toISOString();
  const f = ageFactor(record, nowIso);
  const opinion = (record.s !== undefined ? record.s : 50) - measuredScore(record);
  const modelled = record.xw !== undefined;
  const vm = modelled ? (record.vm !== undefined ? record.vm : 50) : measuredScore(record);
  const vw = (modelled ? (record.vw || 0) : measuredMass(record)) * f;
  const { m, mw } = combineMeasured(vm, vw, score, mass);
  return {
    ...record,
    s: round2(clamp(m + opinion, 0, 100)),
    w: round4(Math.max(mw, (record.w || 0) * f)),
    m: round2(clamp(m, 0, 100)),
    mw: round4(mw),
    vm: round2(vm),
    vw: round4(vw),
    xm: round2(clamp(score, 0, 100)),
    xw: round4(mass),
    src: { ...(record.src || {}), [cls]: round4(mass) },
    n: (record.n || 0) + 1,
    at: nowIso,
  };
}

function applyShift(record, statId, sides) {
  const model = shiftModelOf(statId);
  const pop = populationOf('shifts', statId);
  const { score, mass } = shiftScore(sides, model, pop);
  // A shift whose typical value is unknown until there is a population is
  // shown but never trusted before then.
  return fromModel(record, score, model.needsPopulation && !pop ? 0 : mass, model.experiment ? 'exp' : 'beh');
}

// ── taps (signals.js TAPS) ─────────────────────────────────────────────────
// A grid posterior over the preferred value (e.g. the success rate a learner
// wants): each tap's log-likelihood is added at every grid point; old taps
// fade with time like everything else.
const TAP_GRID = Array.from({ length: 31 }, (_, i) => 0.25 + i * 0.025);
const sig = (x) => 1 / (1 + Math.exp(-x));

function tapLikelihood(model, tap, acc, t) {
  const easy = sig((acc - t - model.band) / model.softness);
  const hard = sig((t - acc - model.band) / model.softness);
  const p = tap === 'easy' ? easy : tap === 'hard' ? hard : 1 - easy - hard;
  return Math.max(0.02, p);
}

function addTap(prior, model, tap, acc, nowIso) {
  const was = prior || { ll: TAP_GRID.map(() => 0), n: 0, at: nowIso };
  const f = fade((Date.parse(nowIso) - Date.parse(was.at)) / 86400000);
  return {
    ll: TAP_GRID.map((t, i) => round4(was.ll[i] * f + Math.log(tapLikelihood(model, tap, acc, t)))),
    n: round4(was.n * f + 1),
    at: nowIso,
  };
}

function tapPosterior(rec, centre, spread) {
  const lp = TAP_GRID.map((t, i) => (rec ? rec.ll[i] : 0) - ((t - centre) ** 2) / (2 * spread ** 2));
  const top = Math.max(...lp);
  const w = lp.map((x) => Math.exp(x - top));
  const total = w.reduce((a, x) => a + x, 0);
  const mean = TAP_GRID.reduce((a, t, i) => a + t * w[i], 0) / total;
  const sd = Math.sqrt(TAP_GRID.reduce((a, t, i) => a + (t - mean) ** 2 * w[i], 0) / total);
  return { mean, sd };
}

function applyTap(record, statId, sides) {
  const model = TAPS[statId];
  const pop = populationOf('taps', statId);
  const centre = pop ? pop.centre : model.centre;
  const spread = pop ? pop.spread : model.spread;
  const { mean, sd } = tapPosterior(sides[`taps:${statId}`], centre, spread);
  const se = Math.max(0.5, sd * model.pointsPerUnit);
  const mass = clamp((REF_SD / se) ** 2 - (REF_SD / (spread * model.pointsPerUnit)) ** 2, 0, MAX_MASS);
  return fromModel(record, 50 + (centre - mean) * model.pointsPerUnit, mass);
}

/** Mass by source, faded the way the record's mass is, plus what just arrived. */
function addSource(src, cls, weight, factor = 1) {
  const out = {};
  for (const [k, v] of Object.entries(src || {})) out[k] = round4(v * factor);
  out[cls] = round4(Math.min(MAX_MASS, (out[cls] || 0) + weight));
  return out;
}

function applyRate(record, statId, hits, trials, sides) {
  const nowIso = new Date().toISOString();
  const rate = addCounts(record.rate, hits, trials, nowIso);
  const { score, mass } = rateScore(rate.k, rate.n, rateNorm(statId, sides), RATES[statId].invert);
  // What the model read or the questionnaire added to the shown score stays
  // added; the measured score is the counts alone.
  const opinion = (record.s !== undefined ? record.s : 50) - measuredScore(record);
  return {
    ...record,
    s: round2(clamp(score + opinion, 0, 100)),
    w: round4(Math.max(mass, (record.w || 0) * ageFactor(record, nowIso))),
    m: round2(clamp(score, 0, 100)),
    mw: round4(mass),
    src: { ...(record.src || {}), beh: round4(mass) },
    n: (record.n || 0) + 1,
    at: nowIso,
    rate,
  };
}

/**
 * The precision update, for one score and its mass: move toward `value` by
 * `weight` against the evidence already held, never more than MAX_STEP.
 */
function moveToward(score, mass, value, weight, strength = 1, maxStep = MAX_STEP) {
  const prior = mass + strength;
  const target = (score * prior + value * weight) / (prior + weight);
  return round2(clamp(score + clamp(target - score, -maxStep, maxStep), 0, 100));
}

/**
 * The value path's running moments (faded like its mass), for standing():
 * sum of weights, of weight x value, of weight x value^2, of weight^2; a
 * designed test counts as one observation with its own known error (tw, dv).
 */
function addMoments(prev, value, weight, f, test) {
  const p = prev || { w: 0, s: 0, q: 0, ww: 0, tw: 0, dv: 0 };
  const wt = test ? 1 : weight;
  const f2 = f * f;
  return {
    w: round4(p.w * f + wt),
    s: round4(p.s * f + wt * value),
    q: round4(p.q * f + wt * value * value),
    ww: round4(p.ww * f2 + wt * wt),
    tw: round4((p.tw || 0) * f2 + (test ? 1 : 0)),
    dv: round4((p.dv || 0) * f2 + (test ? TEST_VARIANCE : 0)),
  };
}

/**
 * One batch for one stat. `weight` moves both scores; `measuredWeight` (the
 * part from behaviour and experiments) is all that adds measured mass, so the
 * questionnaire nudges the measured score without making the app sure of it.
 */
function applyTo(record, value, weight, measuredWeight = weight, bySource = { beh: weight }, { statId, maxStep = MAX_STEP, test = false } = {}) {
  const nowIso = new Date().toISOString();
  const f = ageFactor(record, nowIso);
  const vx = measuredWeight > 0 ? addMoments(record.vx, value, measuredWeight, f, test) : record.vx;
  const strength = statId ? priorStrength(statId) : 1;
  let src = record.src || {};
  let faded = false;
  for (const [cls, w] of Object.entries(bySource)) {
    if (w > 0) { src = addSource(src, cls, w, faded ? 1 : f); faded = true; }
  }
  const w = (record.w || 0) * f;
  const mw = measuredMass(record) * f;
  // A stat that also has a model (fromModel above) moves its value path and
  // recombines; any other moves its measured score directly, as it always has.
  if (record.xw !== undefined) {
    const vw0 = (record.vw || 0) * f;
    const vm = moveToward(record.vm !== undefined ? record.vm : 50, vw0, value, weight, strength, maxStep);
    const vw = round4(Math.min(MAX_MASS, vw0 + measuredWeight));
    const both = combineMeasured(vm, vw, record.xm, record.xw * f);
    return {
      ...record,
      s: moveToward(record.s, w, value, weight, strength, maxStep),
      w: round4(Math.min(MAX_MASS, w + weight)),
      m: round2(both.m),
      mw: round4(both.mw),
      vm,
      vw,
      xw: round4(record.xw * f),
      ...(vx ? { vx } : {}),
      src,
      n: (record.n || 0) + 1,
      at: nowIso,
    };
  }
  return {
    ...record,
    s: moveToward(record.s, w, value, weight, strength, maxStep),
    w: round4(Math.min(MAX_MASS, w + weight)),
    m: moveToward(measuredScore(record), mw, value, weight, strength, maxStep),
    mw: round4(Math.min(MAX_MASS, mw + measuredWeight)),
    ...(vx ? { vx } : {}),
    src,
    n: (record.n || 0) + 1,
    at: nowIso,
  };
}

function isRateObservation(o) {
  return o.trials !== undefined && RATES[o.stat] && Number(o.trials) > 0 && Number(o.hits) >= 0;
}

/** Which source an observation counts as. */
function sourceClass(o, source) {
  if (source === 'questionnaire') return 'quiz';
  if (o.kind === 'experiment') return 'exp';
  return 'beh';
}

/**
 * Fold a batch of observations into the scorecard.
 *
 * @param {number} userId
 * @param {Array<{stat:string,value:number,weight:number,note?:string,kind?:string}
 *   |{stat:string,hits:number,trials:number,note?:string}
 *   |{side:string,hits:number,trials:number}>} observations
 * @param {{source:string, trackId?:string}} meta
 * @returns the updated scorecard
 */
function observe(userId, observations, { source = 'unknown', trackId = null } = {}) {
  // Side counts (a rate that is not a stat itself, only a norm for one) first.
  const sideObs = (observations || []).filter((o) => o && o.side && Number(o.trials) > 0);
  // A contrast observation only says "this stat's side counts changed".
  const contrastIds = [...new Set((observations || []).filter((o) => o && o.contrast && CONTRASTS[o.stat]).map((o) => o.stat))];
  const contrastNotes = {};
  for (const o of observations || []) if (o && (o.contrast || o.shift || o.tap) && o.note) contrastNotes[o.stat] = o.note;
  const residObs = (observations || []).filter((o) => o && o.resid && Number(o.n) > 0);
  const shiftIds = [...new Set((observations || []).filter((o) => o && o.shift && BY_ID[o.stat] && (SHIFTS[o.stat] || o.kind === 'experiment')).map((o) => o.stat))];
  const tapObs = (observations || []).filter((o) => o && o.tap && TAPS[o.stat] && Number.isFinite(Number(o.acc)));
  const memoryObs = (observations || []).filter((o) => o && o.memory && o.stat === 'decay_rate');
  const velocityObs = (observations || []).filter((o) => o && o.velocity && o.stat === 'mastery_velocity');
  const paceObs = (observations || []).filter((o) => o && o.pace && o.stat === 'processing_velocity');
  const reachObs = REACH_ON ? (observations || []).filter((o) => o && o.reach && o.stat === REACH_STAT) : [];
  const valid = (observations || []).filter((o) => o && BY_ID[o.stat] && !o.contrast
    && (isRateObservation(o) || (o.trials === undefined && Number.isFinite(Number(o.value)) && Number(o.weight) > 0)));
  const card = get(userId);
  if (!valid.length && !sideObs.length && !contrastIds.length && !residObs.length && !shiftIds.length && !tapObs.length && !memoryObs.length && !velocityObs.length && !paceObs.length && !reachObs.length) return card;
  const sides = { ...(card.sides || {}) };
  const nowSides = new Date().toISOString();
  for (const o of sideObs) sides[o.side] = addCounts(sides[o.side], Math.min(Number(o.hits) || 0, Number(o.trials)), Number(o.trials), nowSides);
  for (const o of residObs) sides[o.resid] = addResid(sides[o.resid], Number(o.r) || 0, Number(o.v) || 0, Number(o.n), nowSides);
  const tapIds = [];
  for (const o of tapObs) {
    const key = `taps:${o.stat}`;
    sides[key] = addTap(sides[key], TAPS[o.stat], o.tap, clamp(Number(o.acc), 0, 1), nowSides);
    if (!tapIds.includes(o.stat)) tapIds.push(o.stat);
  }

  const grouped = {};
  const rates = {};
  for (const o of valid) {
    if (o.trials !== undefined) {
      const g = rates[o.stat] || (rates[o.stat] = { hits: 0, trials: 0, notes: [] });
      g.hits += Math.min(Number(o.hits), Number(o.trials));
      g.trials += Number(o.trials);
      if (o.note) g.notes.push(o.note);
      continue;
    }
    const g = grouped[o.stat] || (grouped[o.stat] = { sum: 0, w: 0, by: {}, notes: [], test: false });
    if (o.test) g.test = true;
    const w = clamp(Number(o.weight), 0, o.test ? TEST_BATCH_CAP : 1);
    const cls = sourceClass(o, source);
    g.sum += clamp(Number(o.value), 0, 100) * w;
    g.w += w;
    g.by[cls] = (g.by[cls] || 0) + w;
    if (o.note) g.notes.push(o.note);
  }

  const stats = { ...card.stats };
  const subjects = { ...card.subjects };
  const log = [...(card.log || [])];
  const now = new Date().toISOString();

  for (const [statId, g] of Object.entries(grouped)) {
    const value = g.sum / g.w;
    const scale = Math.min(g.test ? TEST_BATCH_CAP : BATCH_WEIGHT_CAP, g.w) / g.w; // the batch cap, shared out by source
    const weight = g.w * scale;
    const measuredWeight = MEASURED.reduce((a, cls) => a + (g.by[cls] || 0), 0) * scale;
    const bySource = Object.fromEntries(Object.entries(g.by).map(([cls, w]) => [cls, w * scale]));
    const before = stats[statId] || blankRecord();
    const opts = { statId, maxStep: g.test ? TEST_MAX_STEP : MAX_STEP, test: g.test };
    const ev = { value: measuredWeight > 0 ? 1 : 0, tested: g.test };
    stats[statId] = withEvidence(before, applyTo(before, value, weight, measuredWeight, bySource, opts), ev);
    if (trackId && BY_ID[statId].subject) {
      const track = { ...(subjects[trackId] || {}) };
      track[statId] = withEvidence(track[statId], applyTo(track[statId] || blankRecord(), value, weight, measuredWeight, bySource, opts), ev);
      subjects[trackId] = track;
    }
    log.push({
      at: now,
      stat: statId,
      value: Math.round(value),
      weight: Number(weight.toFixed(2)),
      from: Math.round(before.s),
      to: Math.round(stats[statId].s),
      source,
      track: trackId || undefined,
      note: g.notes.slice(0, 2).join('; ').slice(0, 200) || undefined,
    });
  }

  for (const [statId, g] of Object.entries(rates)) {
    const before = stats[statId] || blankRecord();
    stats[statId] = applyRate(before, statId, g.hits, g.trials, sides);
    stats[statId] = withEvidence(before, stats[statId], { kind: 'rate', count: stats[statId].rate.n });
    if (trackId && BY_ID[statId].subject) {
      const track = { ...(subjects[trackId] || {}) };
      const t = applyRate(track[statId] || blankRecord(), statId, g.hits, g.trials, sides);
      track[statId] = withEvidence(track[statId], t, { kind: 'rate', count: t.rate.n });
      subjects[trackId] = track;
    }
    // Chances that came and went are not worth a log line each; events are.
    if (g.hits || Math.round(before.s) !== Math.round(stats[statId].s)) {
      log.push({
        at: now,
        stat: statId,
        value: Math.round(stats[statId].s),
        weight: Number(Math.max(0, stats[statId].mw - measuredMass(before)).toFixed(2)),
        from: Math.round(before.s),
        to: Math.round(stats[statId].s),
        source,
        track: trackId || undefined,
        note: g.notes.slice(0, 2).join('; ').slice(0, 200) || `${g.hits} of ${g.trials} chances`,
      });
    }
  }

  for (const statId of contrastIds) {
    const before = stats[statId] || blankRecord();
    stats[statId] = withEvidence(before, applyContrast(before, statId, sides), { kind: 'contrast', count: contrastEvidence(statId, sides) });
    if (Math.round(before.s) !== Math.round(stats[statId].s)) {
      log.push({
        at: now, stat: statId, value: Math.round(stats[statId].s), weight: 0,
        from: Math.round(before.s), to: Math.round(stats[statId].s), source, track: trackId || undefined,
        note: contrastNotes[statId] || 'confidence taps against being right',
      });
    }
  }

  // Memory tests: kept per subject, and the forgetting model re-estimated
  // over all of them (overall) and over the subject's own (per subject).
  let memory = card.memory || {};
  if (memoryObs.length) {
    const key = trackId || '_';
    const day = Date.now() / 86400000;
    const added = memoryObs.map((o) => forgetting.row({ ...o.memory, day }));
    memory = { ...memory, [key]: [...(memory[key] || []), ...added].slice(-forgetting.KEEP) };
    populationPriors();
    const pop = populationCache.memory || null;
    // Standing (see standing()): a longer half-life than the population's
    // typical learner is a lower decay rate and a higher retention.
    const withZ = (rec, z) => {
      const out = { ...rec };
      if (z) out.mz = { z: round4(z.z), sd: round4(z.sd), v: MODEL_VALIDITY };
      else delete out.mz;
      return out;
    };
    const apply = (record, est) => {
      const ev = { kind: 'memory', count: est.tests };
      const zHalf = est.z === undefined ? null : est;
      return {
        decay_rate: withZ(withEvidence(record.decay_rate, fromModel(record.decay_rate || blankRecord(), est.score, est.mass), ev), zHalf && { z: -zHalf.z, sd: zHalf.zsd }),
        retention_index: withZ(withEvidence(record.retention_index, fromModel(record.retention_index || blankRecord(), 100 - est.score, est.mass), ev), zHalf && { z: zHalf.z, sd: zHalf.zsd }),
        retrieval_strength: withZ(withEvidence(record.retrieval_strength, fromModel(record.retrieval_strength || blankRecord(), 100 - est.score, est.mass), ev), zHalf && { z: zHalf.z, sd: zHalf.zsd }),
      };
    };
    const all = Object.values(memory).flat().sort((a, b) => a[6] - b[6]).slice(-forgetting.KEEP);
    const overall = forgetting.estimate(all, pop, day);
    const before = stats.decay_rate || blankRecord();
    Object.assign(stats, apply(stats, overall));
    if (trackId) {
      const track = { ...(subjects[trackId] || {}) };
      Object.assign(track, apply(track, forgetting.estimate(memory[key], pop, day)));
      subjects[trackId] = track;
    }
    if (Math.round(before.s) !== Math.round(stats.decay_rate.s)) {
      log.push({
        at: now, stat: 'decay_rate', value: Math.round(stats.decay_rate.s), weight: 0,
        from: Math.round(before.s), to: Math.round(stats.decay_rate.s), source, track: trackId || undefined,
        note: memoryObs.map((o) => o.note).filter(Boolean).slice(0, 2).join('; ') || 'memory tests against the forgetting curve',
      });
    }
  }

  // Mastery velocity: this learner's slope of ability over practice, read
  // against the population's slopes (centre and true spread). The score is the
  // standing itself, 17 points per between-learner SD; never confident until
  // there is a population, since the course's own climb in difficulty is in
  // every slope and only the population's typical slope takes it out.
  if (velocityObs.length) {
    const fit = card.ability && card.ability.trend && card.ability.trend.fit;
    populationPriors();
    const pop = populationCache.velocity || null;
    const before = stats.mastery_velocity || blankRecord();
    if (fit && fit.se > 0) {
      const z = pop && pop.tau ? zPosterior(fit.slope, fit.se * fit.se, pop.mu, pop.tau) : null;
      const score = z ? clamp(50 + 17 * z.z, 0, 100) : 50;
      const mass = z ? clamp((REF_SD / (17 * z.sd)) ** 2 - (REF_SD / 17) ** 2, 0, MAX_MASS) : 0;
      const rec = withEvidence(before, fromModel(before, score, mass), { kind: 'velocity', count: fit.answers });
      if (z) rec.mz = { z: round4(z.z), sd: round4(z.sd), v: MODEL_VALIDITY };
      else delete rec.mz;
      stats.mastery_velocity = rec;
      if (Math.round(before.s) !== Math.round(rec.s)) {
        log.push({
          at: now, stat: 'mastery_velocity', value: Math.round(rec.s), weight: 0,
          from: Math.round(before.s), to: Math.round(rec.s), source, track: trackId || undefined,
          note: `improving ${fit.slope >= 0 ? 'by' : 'down by'} ${Math.abs(fit.slope).toFixed(2)} logits per 100 answers`,
        });
      }
    }
  }

  // Processing velocity: the learner's answer pace against the population's.
  // Combined with the value path (reading speed, pace taps) in the score shown;
  // the standing (directives) rests on pace alone.
  if (paceObs.length) {
    const p = card.ability && card.ability.pace;
    const point = p && p.n >= 10 ? pacePoint(p) : null;
    populationPriors();
    const pop = populationCache.pace || null;
    if (point) {
      const before = stats.processing_velocity || blankRecord();
      const z = pop && pop.tau ? zPosterior(point.x, point.s2, pop.mu, pop.tau) : null;
      const score = z ? clamp(50 + 17 * z.z, 0, 100) : 50;
      const mass = z ? clamp((REF_SD / (17 * z.sd)) ** 2 - (REF_SD / 17) ** 2, 0, MAX_MASS) : 0;
      const rec = withEvidence(before, fromModel(before, score, mass), { kind: 'pace', count: p.n });
      if (z) rec.mz = { z: round4(z.z), sd: round4(z.sd) };
      else delete rec.mz;
      stats.processing_velocity = rec;
    }
  }

  // Scaffolding fade: where the learner stands against the course in this
  // subject (reach), as a standing among the subject's learners; the score
  // shown is that standing (17 points per between-learner SD). Kept on the
  // overall record from the subject last read; directives read the subject's
  // own reach (standing()).
  if (reachObs.length) {
    const track = String(reachObs[reachObs.length - 1].reach);
    const r = card.ability && card.ability.reach && card.ability.reach[track];
    populationPriors();
    const f = populationCache.reach && populationCache.reach[track];
    const point = r && r.c >= 20 ? reachPoint(r) : null;
    if (point) {
      const before = stats[REACH_STAT] || blankRecord();
      const z = f && f.tau && r.c >= REACH_MIN ? zPosterior(point.x, point.s2, f.mu, f.tau) : null;
      const score = z ? clamp(50 + 17 * z.z, 0, 100) : (before.m !== undefined ? before.m : 50);
      const mass = z ? clamp((REF_SD / (17 * z.sd)) ** 2 - (REF_SD / 17) ** 2, 0, MAX_MASS) : 0;
      const rec = withEvidence(before, fromModel(before, score, mass), { kind: 'reach', count: r.c });
      stats[REACH_STAT] = rec;
    }
  }

  const modelled = [
    ...shiftIds.map((id) => [id, applyShift, 'shift against expectation']),
    ...tapIds.map((id) => [id, applyTap, 'what they said, against how the level went']),
  ];
  for (const [statId, apply, fallback] of modelled) {
    const before = stats[statId] || blankRecord();
    stats[statId] = withEvidence(before, apply(before, statId, sides), modelEvidence(statId, sides, apply === applyTap));
    if (Math.round(before.s) !== Math.round(stats[statId].s)) {
      log.push({
        at: now, stat: statId, value: Math.round(stats[statId].s), weight: 0,
        from: Math.round(before.s), to: Math.round(stats[statId].s), source, track: trackId || undefined,
        note: contrastNotes[statId] || fallback,
      });
    }
  }

  return db.update('scorecards', card.id, {
    stats,
    subjects,
    sides,
    ...(memoryObs.length ? { memory } : {}),
    log: log.slice(-LOG_KEEP),
    updates: (card.updates || 0) + 1,
  });
}

/**
 * Move one stat by an exact number of points.
 *
 * Used by the after-level read (services/learner-record.js), whose rules are
 * about points rather than evidence weights: one point per read, and a bigger
 * move only once many reads have asked for it. It moves the shown score only.
 * Its mass is kept as model-read mass (src.llm), which never counts toward
 * confidence and never moves the measured score that lessons are built from:
 * a model's opinion, however often repeated, is not a measurement.
 */
function shift(userId, statId, delta, { source = 'after-level read', note = '', trackId = null } = {}) {
  if (!BY_ID[statId] || !Number.isFinite(Number(delta)) || !Number(delta)) return get(userId);
  const card = get(userId);
  const d = Number(delta);
  const before = card.stats[statId] || blankRecord();
  const mass = Math.min(1, 0.1 + Math.abs(d) / 25);
  const nowIso = new Date().toISOString();
  const move = (record) => {
    const f = ageFactor(record, nowIso);
    return {
      ...record,
      s: round2(clamp(record.s + d, 0, 100)),
      w: round4(Math.min(MAX_MASS, record.w * f + mass)),
      // The measured mass fades with time like everything else; the read adds none.
      mw: round4(measuredMass(record) * f),
      // So does the value-path part of a modelled stat (fromModel), which would
      // otherwise skip the fade for the time before this read.
      ...(record.vw !== undefined ? { vw: round4(record.vw * f) } : {}),
      ...(record.xw !== undefined ? { xw: round4(record.xw * f) } : {}),
      src: addSource(record.src, 'llm', mass, f),
      n: (record.n || 0) + 1,
      at: nowIso,
    };
  };
  const stats = { ...card.stats, [statId]: move(before) };
  const subjects = { ...card.subjects };
  if (trackId && BY_ID[statId].subject) {
    subjects[trackId] = { ...(subjects[trackId] || {}) };
    subjects[trackId][statId] = move(subjects[trackId][statId] || { ...blankRecord(before.s), m: measuredScore(before) });
  }
  const log = [...(card.log || []), {
    at: new Date().toISOString(),
    stat: statId,
    value: Math.round(stats[statId].s),
    weight: Number(mass.toFixed(2)),
    from: Math.round(before.s),
    to: Math.round(stats[statId].s),
    source,
    track: trackId || undefined,
    note: String(note || '').slice(0, 200) || undefined,
  }];
  return db.update('scorecards', card.id, { stats, subjects, log: log.slice(-LOG_KEEP), updates: (card.updates || 0) + 1 });
}

/**
 * Seed the scorecard from the learning-style questionnaire. A self-report is a
 * weak prior: it nudges the score, measured one included, but adds no measured
 * mass, so it never makes the app sure of anything on its own.
 */
const STYLE_MAP = {
  explanation_depth: [['step_explicitness', false], ['brevity_preference', true]],
  example_order: [['inductive_trajectory', false], ['deductive_trajectory', true]],
  visual_support: [['spatial_anchoring', false]],
  practice_density: [['chunk_granularity', true]],
  session_pacing: [['attention_runway', false], ['cycle_architecture', false]],
  challenge_appetite: [['challenge_appetite', false], ['productive_struggle', false]],
  verbalization: [['elaboration_benefit', false]],
  error_focus: [['feedback_granularity', false]],
  retrieval_style: [['generation_effect', false]],
};

function seedFromStyleQuiz(userId, styleVector) {
  const obs = [];
  for (const [dim, v] of Object.entries(styleVector || {})) {
    for (const [stat, invert] of STYLE_MAP[dim] || []) {
      const value = (invert ? 1 - v : v) * 100;
      obs.push({ stat, value, weight: 0.6, note: `questionnaire: ${dim.replace(/_/g, ' ')}` });
    }
  }
  return observe(userId, obs, { source: 'questionnaire' });
}

/**
 * The scorecard stat behind one of the profile's older dimensions, so
 * services/learner.js can lean on the richer model once it knows enough.
 */
const DIMENSION_STAT = {
  explanation_depth: ['step_explicitness', false],
  example_order: ['inductive_trajectory', false],
  visual_support: ['spatial_anchoring', false],
  practice_density: ['chunk_granularity', true],
  session_pacing: ['attention_runway', false],
  challenge_appetite: ['challenge_appetite', false],
  verbalization: ['elaboration_benefit', false],
  error_focus: ['feedback_granularity', false],
  retrieval_style: ['generation_effect', false],
};

function forDimension(userId, dim) {
  const map = DIMENSION_STAT[dim];
  if (!map) return null;
  const card = db.findOne('scorecards', (r) => r.user_id === userId);
  if (!card) return null;
  // Session settings follow what was measured, not what a model suggested.
  const { measured, confidence } = read(card, map[0]);
  const v = measured / 100;
  return { value: map[1] ? 1 - v : v, confidence };
}

// Interests are not stored here. The about-you survey (services/learner.js
// SURVEY_FIELDS) is where a learner says what they care about, and the level
// editor's brief quotes it in their own words; a second copy here would drift.

/** Everything the profile page shows, grouped the way the stats are defined. */
function view(userId, { trackId } = {}) {
  const card = get(userId);
  return {
    categories: CATEGORIES.map((cat) => ({
      id: cat.id,
      name: cat.name,
      stats: STATS.filter((s) => s.category === cat.id).map((s) => {
        const { score, confidence, measured } = read(card, s.id, { trackId });
        const record = card.stats[s.id] || {};
        return {
          id: s.id, name: s.name, low: s.low, high: s.high, score, confidence, measured,
          observations: record.n || 0,
          evidence: record.src || {},
        };
      }),
    })),
    updates: card.updates || 0,
    recent: (card.log || []).slice(-15).reverse().map((l) => ({
      ...l, name: BY_ID[l.stat] ? BY_ID[l.stat].name : l.stat,
    })),
  };
}

/** Average confidence across all stats: how well the app knows this learner. */
function overallConfidence(card) {
  const values = STATS.map((s) => read(card, s.id).confidence);
  return Math.round(values.reduce((a, v) => a + v, 0) / values.length);
}

module.exports = {
  get,
  read,
  standing,
  reachEvidence,
  REACH_STAT,
  SECONDARY_RATES,
  observe,
  shift,
  seedFromStyleQuiz,
  forDimension,
  DIMENSION_STAT,
  view,
  overallConfidence,
  confidenceOf,
  refreshPopulation,
  forgettingCurve,
  STATS,
  BY_ID,
  CATEGORIES,
  MAX_STEP,
};
