'use strict';
/**
 * Scoring for the listening-comprehension test. Pure functions, no AI, no clock, no randomness.
 * Every rule is written in PROTOCOL.md section 6 and sealed in SEAL.txt.
 *
 * Item:   { item_id, stratum, half, correct }               (correct = option index 0..3)
 * Answer: { item_id, choice (0..3 or null), dk, late, timed_out, server_ms, plays, leaves }
 *
 * Item score ("formula scoring", corrects for guessing with four options):
 *   right = +1, wrong = -1/3, "I don't know" / timeout / late / unanswered = 0.
 * A learner who guesses at random among 4 options averages (1/4)(1) + (3/4)(-1/3) = 0, so a pure guesser and a
 * learner who always answers "I don't know" both average 0.
 */
const { tCrit, differenceEstimate, median, mean } = require('../spanish-check/scoring');

const STRATA = ['easy', 'medium', 'hard'];
const WRONG = -1 / 3;
const SCORE_LO = WRONG; const SCORE_HI = 1;
const LIMITS = { item_s: 40, grace_s: 3, max_plays: 3, sitting_max_min: 16 };
const THRESHOLDS = {
  half_disagree: 0.5,     // |half0 - half1| formula score above this flags the sitting
  rushed_share: 0.25,     // share of items answered implausibly fast
  rushed_s: 3.0,          // a clip lasts a few seconds, so an answer faster than this cannot follow it
};
const STATEMENT = 'n=1, independent public sentence pool (Tatoeba), not an official level.';

/** One item -> { formula score, right, wrong, dk, late }. */
function scoreItem(item, ans) {
  if (!ans) return { score: 0, right: 0, kind: 'unanswered' };
  if (ans.auto) return { score: 0, right: 0, kind: 'timeout' }; // closed by the server because the item stayed open past the limit
  if (ans.late) return { score: 0, right: 0, kind: 'late' };
  if (ans.choice === null || ans.choice === undefined || ans.dk) return { score: 0, right: 0, kind: ans.dk ? 'dk' : 'timeout' };
  return Number(ans.choice) === item.correct ? { score: 1, right: 1, kind: 'right' } : { score: WRONG, right: 0, kind: 'wrong' };
}

/**
 * Pooled within-stratum variance with a pseudo pair (one observation at each extreme of the score range) added to
 * the residual sum of squares: s2 = (SS_within + d^2/2) / (N - S + 1), d = SCORE_HI - SCORE_LO of the scale used.
 * The pair keeps a sitting in which every item got the same score from claiming zero uncertainty.
 */
function pooledVariance(byStratum, range) {
  let ss = 0; let n = 0; let s = 0;
  for (const k of STRATA) {
    const x = byStratum[k] || [];
    if (!x.length) continue;
    const m = x.reduce((a, b) => a + b, 0) / x.length;
    for (const v of x) ss += (v - m) ** 2;
    n += x.length; s += 1;
  }
  const df = n - s + 1;
  return { s2: (ss + (range ** 2) / 2) / df, df };
}

/** est = sum_s w_s mean_s ; SE^2 = sum_s w_s^2 s2 / n_s ; df = N - S + 1. */
function stratifiedEstimate(byStratum, weights, range) {
  let est = 0; let v = 0;
  const { s2, df } = pooledVariance(byStratum, range);
  for (const k of STRATA) {
    const x = byStratum[k] || [];
    if (!x.length) continue;
    est += weights[k] * (x.reduce((a, b) => a + b, 0) / x.length);
    v += (weights[k] ** 2) * s2 / x.length;
  }
  return { est, se: Math.sqrt(v), df };
}

const ci = (est, se, df, lo, hi) => { const t = tCrit(df); return [Math.max(lo, est - t * se), Math.min(hi, est + t * se)]; };

function scoreSitting(meta, items, answers, extra) {
  const get = (id) => (answers instanceof Map ? answers.get(id) : answers[id]);
  const w = meta.strata_weights.items;
  const byF = { easy: [], medium: [], hard: [] }; const byR = { easy: [], medium: [], hard: [] };
  const perItem = []; const kinds = { right: 0, wrong: 0, dk: 0, timeout: 0, late: 0, unanswered: 0 };
  for (const it of items) {
    const a = get(it.item_id);
    const r = scoreItem(it, a);
    kinds[r.kind]++;
    byF[it.stratum].push(r.score); byR[it.stratum].push(r.right);
    perItem.push({ item_id: it.item_id, stratum: it.stratum, half: it.half, score: r.score, kind: r.kind, answered: !!a, late: !!(a && a.late), timed_out: !!(a && a.timed_out), server_ms: a ? a.server_ms : null, plays: a ? a.plays : null, leaves: a ? a.leaves || 0 : 0 });
  }
  const F = stratifiedEstimate(byF, w, SCORE_HI - SCORE_LO);
  const R = stratifiedEstimate(byR, w, 1);
  const out = {
    score: { ...F, ci: ci(F.est, F.se, F.df, SCORE_LO, SCORE_HI) },
    raw: { ...R, ci: ci(R.est, R.se, R.df, 0, 1) },
    counts: { ...kinds, n: items.length, dont_know: kinds.dk },
    stratum_means: {},
    items: perItem,
  };
  for (const s of STRATA) { const x = byF[s]; out.stratum_means[s] = x.length ? x.reduce((a, b) => a + b, 0) / x.length : null; }
  out.checks = qualityChecks(perItem, out, extra || {});
  return out;
}

function qualityChecks(perItem, scored, extra) {
  const flags = []; const checks = {};
  const h0 = perItem.filter((p) => p.half === 0).map((p) => p.score);
  const h1 = perItem.filter((p) => p.half === 1).map((p) => p.score);
  const m0 = mean(h0); const m1 = mean(h1);
  const diff = m0 === null || m1 === null ? null : Math.abs(m0 - m1);
  const dis = diff !== null && diff > THRESHOLDS.half_disagree;
  checks.split_half = { half0: m0, half1: m1, abs_diff: diff, ok: !dis };
  if (dis) flags.push(`odd/even halves disagree by ${(diff * 100).toFixed(0)} points`);
  const sm = scored.stratum_means;
  const mono = !(sm.easy !== null && sm.medium !== null && sm.easy < sm.medium) && !(sm.medium !== null && sm.hard !== null && sm.medium < sm.hard) && !(sm.easy !== null && sm.hard !== null && sm.easy < sm.hard);
  checks.monotonic = { easy: sm.easy, medium: sm.medium, hard: sm.hard, ok: mono };
  if (!mono) flags.push('easy >= medium >= hard does not hold');
  const rushed = perItem.filter((p) => p.server_ms !== null && p.server_ms / 1000 < THRESHOLDS.rushed_s).length;
  const share = perItem.length ? rushed / perItem.length : 0;
  checks.rushed = { rushed, of: perItem.length, ok: share <= THRESHOLDS.rushed_share };
  if (share > THRESHOLDS.rushed_share) flags.push(`${rushed} of ${perItem.length} items answered in under ${THRESHOLDS.rushed_s}s`);
  const timeouts = perItem.filter((p) => p.timed_out).length;
  const late = perItem.filter((p) => p.late).length;
  const leftItems = perItem.filter((p) => p.leaves > 0).length;
  const leaves = Number.isFinite(extra.leaves) ? extra.leaves : perItem.reduce((a, p) => a + (p.leaves || 0), 0);
  const overPlayed = perItem.filter((p) => p.plays !== null && p.plays > LIMITS.max_plays).length;
  checks.timing = { median_s_per_item: median(perItem.filter((p) => p.server_ms !== null).map((p) => p.server_ms / 1000)), timeouts, late, unanswered: perItem.filter((p) => !p.answered).length };
  checks.page_leaves = { leaves, items_open_when_left: leftItems };
  checks.plays = { over_limit: overPlayed };
  if (late) flags.push(`${late} answer(s) arrived after the time limit and scored 0`);
  if (overPlayed) flags.push(`${overPlayed} item(s) were played more than ${LIMITS.max_plays} times (the page enforces the limit; the server only sees what the page reports)`);
  if (leaves) flags.push(`left the page ${leaves} time(s)`);
  return { ...checks, flags };
}

/** Spearman-Brown corrected split-half reliability of the odd/even half scores of several sittings (needs >= 4). */
function splitHalfReliability(sittings) {
  const xs = []; const ys = [];
  for (const s of sittings) { const c = s.checks.split_half; if (c && c.half0 !== null && c.half1 !== null) { xs.push(c.half0); ys.push(c.half1); } }
  if (xs.length < 4) return { n_sittings: xs.length, r: null, spearman_brown: null };
  const mx = mean(xs); const my = mean(ys);
  let sxy = 0; let sxx = 0; let syy = 0;
  for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  if (sxx === 0 || syy === 0) return { n_sittings: xs.length, r: null, spearman_brown: null };
  const r = sxy / Math.sqrt(sxx * syy);
  return { n_sittings: xs.length, r, spearman_brown: (2 * r) / (1 + r) };
}

function changeFrom(first, later) {
  return { score: differenceEstimate(later.score, first.score), raw: differenceEstimate(later.raw, first.raw) };
}

module.exports = { STRATA, WRONG, SCORE_LO, SCORE_HI, LIMITS, THRESHOLDS, STATEMENT, scoreItem, pooledVariance, stratifiedEstimate, scoreSitting, qualityChecks, splitHalfReliability, changeFrom, median, mean, tCrit };
