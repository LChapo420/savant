'use strict';
/**
 * Scoring for the Spanish check. Pure functions, no AI, no clock, no randomness.
 * Every rule here is written up in PROTOCOL.md section 6 and is sealed in SEAL.txt.
 *
 * Item objects (from engine.drawSitting):
 *   listening: { item_id, section:'listening', stratum, half, reference }
 *   reading:   { item_id, section:'reading',   stratum, half, correct }   (correct = option index 0..3)
 * Answer records: { item_id, answer?, choice?, late?, timed_out?, server_ms?, replays?, leaves? }
 */
const { tokensNorm } = require('./lib/common');

const STRATA = ['easy', 'medium', 'hard'];
const CHANCE = 0.25;
const LIMITS = { listening_s: 60, reading_s: 30, grace_s: 3 };
const THRESHOLDS = {
  half_disagree: 0.4,        // |odd - even| half scores above this flags the sitting
  rushed_share: 0.25,        // share of items answered implausibly fast
  rushed_listening_s: 2.0,
  rushed_reading_s: 1.0,
};

// ---- item scores --------------------------------------------------------

/** Longest common subsequence length of two word arrays. */
function lcsLen(a, b) {
  if (!a.length || !b.length) return 0;
  let prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    prev = cur;
  }
  return prev[b.length];
}

/** Dictation: share of the reference words found in order in what was typed. */
function scoreDictation(reference, typed) {
  const ref = tokensNorm(reference);
  const hyp = tokensNorm(typed || '');
  if (!ref.length) return { score: 0, exact: false };
  const score = lcsLen(ref, hyp) / ref.length;
  return { score, exact: ref.length === hyp.length && ref.every((w, i) => w === hyp[i]) };
}

/** One item -> { score 0..1, exact? }. A late or timed-out-late answer is worth 0. */
function scoreItem(item, ans) {
  if (!ans || ans.late) return { score: 0, exact: false };
  if (item.section === 'listening') return scoreDictation(item.reference, ans.answer);
  return { score: Number(ans.choice) === item.correct ? 1 : 0, exact: false };
}

// ---- statistics ---------------------------------------------------------

/** Two-sided 95% Student t critical value (Cornish-Fisher expansion about the normal; error < 0.5% for df >= 3). */
function tCrit(df) {
  const z = 1.959964;
  if (!(df > 0)) return z;
  if (df < 3) return df < 1 ? 12.71 : df < 2 ? 4.303 : 3.182 - (df - 2) * 0.35; // coarse for tiny df, always conservative
  const g1 = (z ** 3 + z) / 4;
  const g2 = (5 * z ** 5 + 16 * z ** 3 + 3 * z) / 96;
  const g3 = (3 * z ** 7 + 19 * z ** 5 + 17 * z ** 3 - 15 * z) / 384;
  return z + g1 / df + g2 / df ** 2 + g3 / df ** 3;
}

/**
 * Pooled within-stratum variance of the item scores, with one extra pair of pseudo observations (a 0 and a 1)
 * added to the residual sum of squares: s2 = (SS_within + 0.5) / (N - S + 1). The pair keeps a section in which every
 * item got the same score from claiming zero uncertainty (all-correct or all-wrong then gives a half-width of roughly
 * 0.18 to 0.2, about the "rule of three" bound for 10-15 items), and it matters little once items disagree.
 */
function pooledVariance(byStratum) {
  let ss = 0; let n = 0; let s = 0;
  for (const k of STRATA) {
    const x = byStratum[k] || [];
    if (!x.length) continue;
    const m = x.reduce((a, b) => a + b, 0) / x.length;
    for (const v of x) ss += (v - m) ** 2;
    n += x.length; s += 1;
  }
  const df = n - s + 1;
  return { s2: (ss + 0.5) / df, df };
}

/**
 * Stratified estimate of the mean item score with its standard error and df.
 * est = sum_s w_s * mean_s ;  SE^2 = sum_s w_s^2 * s2 / n_s ;  df = N - S + 1.
 * byStratum: { easy:[scores], medium:[...], hard:[...] }, weights: { easy:w, ... } (sum 1).
 */
function stratifiedEstimate(byStratum, weights) {
  let est = 0; let v = 0;
  const { s2, df } = pooledVariance(byStratum);
  for (const k of STRATA) {
    const x = byStratum[k] || [];
    if (!x.length) continue;
    est += weights[k] * (x.reduce((a, b) => a + b, 0) / x.length);
    v += (weights[k] ** 2) * s2 / x.length;
  }
  return { est, se: Math.sqrt(v), df };
}

/** t interval, clipped to the range the score can take (differences are never clipped). */
const ci = (est, se, df, lo = -Infinity, hi = Infinity) => {
  const t = tCrit(df);
  return [Math.max(lo, est - t * se), Math.min(hi, est + t * se)];
};

/** Difference of two independent estimates, with Welch-Satterthwaite df. */
function differenceEstimate(a, b) {
  const va = a.se ** 2; const vb = b.se ** 2;
  const se = Math.sqrt(va + vb);
  const denom = (va * va) / a.df + (vb * vb) / b.df;
  const df = denom > 0 ? (se ** 4) / denom : 1;
  const diff = a.est - b.est;
  const t = tCrit(df);
  return { diff, se, df, lo: diff - t * se, hi: diff + t * se };
}

// ---- a whole sitting ----------------------------------------------------

function weightsFor(meta, section) { return meta.strata_weights[section]; }

/**
 * Score one sitting.
 * @param meta     pool.json meta (for strata weights)
 * @param items    drawn items, in served order
 * @param answers  Map or object item_id -> answer record (the last record per item)
 * @param extra    { leaves } sitting-level count of page leaves (optional)
 */
function scoreSitting(meta, items, answers, extra) {
  const get = (id) => (answers instanceof Map ? answers.get(id) : answers[id]);
  const out = { listening: null, reading: null, items: [], counts: {} };
  const byS = { listening: { easy: [], medium: [], hard: [] }, reading: { easy: [], medium: [], hard: [] } };
  let exact = 0;
  const perItem = [];
  for (const it of items) {
    const a = get(it.item_id);
    const r = scoreItem(it, a);
    if (r.exact) exact++;
    byS[it.section][it.stratum].push(r.score);
    perItem.push({ item_id: it.item_id, section: it.section, stratum: it.stratum, half: it.half, score: r.score, answered: !!a, late: !!(a && a.late), timed_out: !!(a && a.timed_out), server_ms: a ? a.server_ms : null, replays: a ? a.replays : null, leaves: a ? a.leaves || 0 : 0 });
  }
  const L = stratifiedEstimate(byS.listening, weightsFor(meta, 'listening'));
  const R = stratifiedEstimate(byS.reading, weightsFor(meta, 'reading'));
  const Rcc = { est: (R.est - CHANCE) / (1 - CHANCE), se: R.se / (1 - CHANCE), df: R.df };
  const Comp = { est: (L.est + Rcc.est) / 2, se: Math.sqrt(L.se ** 2 + Rcc.se ** 2) / 2 };
  const dfComp = (Comp.se ** 4) / ((((L.se / 2) ** 4) / L.df) + (((Rcc.se / 2) ** 4) / Rcc.df) || 1);
  Comp.df = dfComp;
  out.listening = { ...L, ci: ci(L.est, L.se, L.df, 0, 1), exact_sentences: exact, n: perItem.filter((p) => p.section === 'listening').length };
  out.reading = { raw: R.est, raw_ci: ci(R.est, R.se, R.df, 0, 1), cc: Rcc.est, cc_ci: ci(Rcc.est, Rcc.se, Rcc.df, -CHANCE / (1 - CHANCE), 1), se_raw: R.se, ...Rcc, n: perItem.filter((p) => p.section === 'reading').length, correct: perItem.filter((p) => p.section === 'reading' && p.score === 1).length };
  out.composite = { ...Comp, ci: ci(Comp.est, Comp.se, Comp.df, -CHANCE / (2 * (1 - CHANCE)), 1) };
  out.stratum_means = {};
  for (const sec of ['listening', 'reading']) {
    out.stratum_means[sec] = {};
    for (const s of STRATA) { const x = byS[sec][s]; out.stratum_means[sec][s] = x.length ? x.reduce((a, b) => a + b, 0) / x.length : null; }
  }
  out.items = perItem;
  out.checks = qualityChecks(perItem, out, extra || {});
  return out;
}

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const median = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** Per-sitting quality checks. Failing a check flags the sitting; it does not void it. */
function qualityChecks(perItem, scored, extra) {
  const flags = [];
  const checks = {};
  for (const sec of ['listening', 'reading']) {
    const items = perItem.filter((p) => p.section === sec);
    const h0 = items.filter((p) => p.half === 0).map((p) => p.score);
    const h1 = items.filter((p) => p.half === 1).map((p) => p.score);
    const m0 = mean(h0); const m1 = mean(h1);
    const diff = m0 === null || m1 === null ? null : Math.abs(m0 - m1);
    const dis = diff !== null && diff > THRESHOLDS.half_disagree;
    checks[`split_half_${sec}`] = { half0: m0, half1: m1, abs_diff: diff, ok: !dis };
    if (dis) flags.push(`${sec}: odd/even halves disagree by ${(diff * 100).toFixed(0)} points`);
    const sm = scored.stratum_means[sec];
    const e = sm.easy; const m = sm.medium; const h = sm.hard;
    const mono = !(e !== null && m !== null && e < m) && !(m !== null && h !== null && m < h) && !(e !== null && h !== null && e < h);
    checks[`monotonic_${sec}`] = { easy: e, medium: m, hard: h, ok: mono };
    if (!mono) flags.push(`${sec}: easy >= medium >= hard does not hold`);
    const lim = sec === 'listening' ? THRESHOLDS.rushed_listening_s : THRESHOLDS.rushed_reading_s;
    const rushed = items.filter((p) => p.server_ms !== null && p.server_ms / 1000 < lim).length;
    const share = items.length ? rushed / items.length : 0;
    checks[`rushed_${sec}`] = { rushed, of: items.length, ok: share <= THRESHOLDS.rushed_share };
    if (share > THRESHOLDS.rushed_share) flags.push(`${sec}: ${rushed} of ${items.length} items answered in under ${lim}s`);
  }
  const timeouts = perItem.filter((p) => p.timed_out).length;
  const late = perItem.filter((p) => p.late).length;
  const leftItems = perItem.filter((p) => p.leaves > 0).length;
  // sitting-level count of times the page was left (including between items) when the replay supplies it
  const leaves = Number.isFinite(extra.leaves) ? extra.leaves : perItem.reduce((a, p) => a + (p.leaves || 0), 0);
  checks.timing = {
    median_s_per_item: median(perItem.filter((p) => p.server_ms !== null).map((p) => p.server_ms / 1000)),
    timeouts, late, unanswered: perItem.filter((p) => !p.answered).length,
  };
  checks.page_leaves = { leaves, items_open_when_left: leftItems };
  if (late) flags.push(`${late} answer(s) arrived after the time limit and scored 0`);
  if (leaves) flags.push(`left the page ${leaves} time(s)`);
  return { ...checks, flags };
}

/** Spearman-Brown corrected split-half reliability from the odd/even half scores of several sittings. Needs >= 4 sittings. */
function splitHalfReliability(sittings, section) {
  const xs = []; const ys = [];
  for (const s of sittings) { const c = s.checks[`split_half_${section}`]; if (c && c.half0 !== null && c.half1 !== null) { xs.push(c.half0); ys.push(c.half1); } }
  if (xs.length < 4) return { n_sittings: xs.length, r: null, spearman_brown: null };
  const mx = mean(xs); const my = mean(ys);
  let sxy = 0; let sxx = 0; let syy = 0;
  for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  if (sxx === 0 || syy === 0) return { n_sittings: xs.length, r: null, spearman_brown: null };
  const r = sxy / Math.sqrt(sxx * syy);
  return { n_sittings: xs.length, r, spearman_brown: (2 * r) / (1 + r) };
}

/** Change of sitting k from sitting 0, for each score. */
function changeFrom(first, later) {
  const L = differenceEstimate(later.listening, first.listening);
  const R = differenceEstimate({ est: later.reading.cc, se: later.reading.se, df: later.reading.df }, { est: first.reading.cc, se: first.reading.se, df: first.reading.df });
  const C = differenceEstimate(later.composite, first.composite);
  return { listening: L, reading_cc: R, composite: C };
}

const STATEMENT = 'n=1 learner, independent public sentence pool (Tatoeba), not an official CEFR level.';

module.exports = {
  STRATA, CHANCE, LIMITS, THRESHOLDS, STATEMENT,
  lcsLen, scoreDictation, scoreItem, tCrit, pooledVariance, stratifiedEstimate, differenceEstimate,
  scoreSitting, qualityChecks, splitHalfReliability, changeFrom, mean, median,
};
