#!/usr/bin/env node
'use strict';
/**
 * Validation by simulation (PROTOCOL.md section 10). Pure compute, no network, deterministic (fixed seeds).
 *  A. Simulated learners (knows nothing / easy only / easy+medium / everything) on random draws of the real
 *     sealed pool: spread of scores across draws, CI coverage of the true value, false alarms between draws.
 *  B. Equivalence of draws: per-draw mean difficulty, mean sentence length.
 *  C. Guessing strategies that use ONLY the four English options (no audio): the formula score must stay at about 0.
 *  D. Structural checks on the answer options.
 * Usage: node scripts/simulate.js [--draws N]
 */
const path = require('path');
const { rngFrom, normalize, tokensNorm, enContentWords, ES_STOP, sha256 } = require('../../spanish-check/lib/common');
const cand = require('../../spanish-check/lib/candidates');
const { loadPool, drawSitting } = require('../lib/draw');
const firsttest = require('../lib/firsttest');
const scoring = require('../scoring');

const di = process.argv.indexOf('--draws');
const DRAWS = di >= 0 ? Number(process.argv[di + 1]) : 100;
const pool = loadPool(path.join(__dirname, '..', 'pool.json'));
const all = cand.loadSpanish();
const stats = cand.corpusStats(all);
const rankOf = (w) => stats.rank.get(w.toLowerCase());
const W = pool.meta.strata_weights.items;

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)); };
const f3 = (x) => x.toFixed(3);

// ---- learner model --------------------------------------------------------------------------------------------
// A word of corpus rank r is known with probability pk(r) = 1 / (1 + (r / K)^2.5)  (K = rank at which it is 50/50;
// K = 0 knows nothing, K = Infinity knows everything). On hearing a clip the learner UNDERSTANDS it with probability
// u = 0.95 * (share of its content words known). If it understood it, it picks the right option; otherwise it either
// guesses uniformly among the four options ("guesser") or says "I don't know" ("calibrated").
// Under formula scoring the expected score of a guesser equals u (a blind guess is worth 0 on average).
const LEARNERS = [
  { name: 'a. knows nothing (guesses everything)', K: 0, mode: 'guess' },
  { name: 'a2. knows nothing (always "I don\'t know")', K: 0, mode: 'dk' },
  { name: 'b. knows the 250 commonest words, guesses the rest', K: 250, mode: 'guess' },
  { name: 'c. knows the 1000 commonest words, guesses the rest', K: 1000, mode: 'guess' },
  { name: 'd. knows everything (hears it all)', K: Infinity, mode: 'guess' },
  { name: 'c2. knows the 1000 commonest words, "I don\'t know" when lost', K: 1000, mode: 'dk' },
];
const wordsOf = (text) => text.normalize('NFC').match(/\p{L}+/gu) || [];
const pk = (w, K) => (K === 0 ? 0 : K === Infinity ? 1 : 1 / (1 + (rankOf(w) / K) ** 2.5));
const contentWords = (text) => { const w = wordsOf(text); const c = w.filter((x) => !ES_STOP.has(normalize(x))); return c.length ? c : w; };
const understandP = (text, K) => 0.95 * mean(contentWords(text).map((x) => pk(x, K)));

function populationValue(K) {
  let v = 0;
  for (const s of scoring.STRATA) v += W[s] * mean(pool.itemsBy[s].map((e) => understandP(e.text, K)));
  return v;
}
function populationRaw(K) { // expected share right: u + (1-u)/4 for a guesser
  let v = 0;
  for (const s of scoring.STRATA) v += W[s] * mean(pool.itemsBy[s].map((e) => { const u = understandP(e.text, K); return u + (1 - u) / 4; }));
  return v;
}

function realise(draw, L, rng) {
  const items = draw.items.map((it) => ({ item_id: it.item_id, stratum: it.stratum, half: it.half, correct: it.correct }));
  const answers = new Map();
  for (const it of draw.items) {
    const understood = L.K !== 0 && rng() < understandP(it.reference, L.K);
    let a;
    if (understood) a = { item_id: it.item_id, choice: it.correct };
    else if (L.mode === 'dk') a = { item_id: it.item_id, choice: null, dk: true };
    else a = { item_id: it.item_id, choice: Math.floor(rng() * 4) };
    answers.set(it.item_id, { ...a, server_ms: 20000, plays: 2 });
  }
  return scoring.scoreSitting(pool.meta, items, answers);
}

const ex = firsttest.toSets(firsttest.exclusionsFrom(firsttest.readFirstLog(path.join(firsttest.FIRST_DIR, 'results')), firsttest.readFirstLog(path.join(firsttest.FIRST_DIR, 'results')).length - 1));
console.log(`Simulation: ${DRAWS} random draws from the sealed pool (items ${JSON.stringify(Object.fromEntries(scoring.STRATA.map((s) => [s, pool.itemsBy[s].length])))}, distractor-only ${JSON.stringify(Object.fromEntries(scoring.STRATA.map((s) => [s, pool.distBy[s].length])))}); first-test exclusions applied: ${ex.keys.size} sentences, ${ex.en.size} English options\n`);
const draws = [];
for (let i = 0; i < DRAWS; i++) {
  draws.push(drawSitting(pool, { keys: new Set(), dists: new Set(), en: new Set() }, sha256(`lc-simulation-draw-${i}`), ex));
}

// B. equivalence
console.log('B. Draw equivalence (stratum-weighted means per draw vs the item pool)');
{
  const popLog = scoring.STRATA.reduce((a, s) => a + W[s] * mean(pool.itemsBy[s].map((e) => Math.log(e.difficulty))), 0);
  const popLen = scoring.STRATA.reduce((a, s) => a + W[s] * mean(pool.itemsBy[s].map((e) => e.words)), 0);
  const lg = draws.map((d) => scoring.STRATA.reduce((a, s) => a + W[s] * mean(d.items.filter((x) => x.stratum === s).map((x) => Math.log(pool.byId.get(x.item_id).difficulty))), 0));
  const ln = draws.map((d) => scoring.STRATA.reduce((a, s) => a + W[s] * mean(d.items.filter((x) => x.stratum === s).map((x) => pool.byId.get(x.item_id).words)), 0));
  console.log(`  mean log-difficulty per draw ${f3(mean(lg))} (SD ${f3(sd(lg))}, pool ${f3(popLog)}); words per sentence ${f3(mean(ln))} (SD ${f3(sd(ln))}, pool ${f3(popLen)})`);
}

// A. learners
console.log('\nA. Simulated learners over the draws (formula score; "true" = expected value over the whole item pool)');
const summary = [];
for (const L of LEARNERS) {
  const rng = rngFrom('lc-sim-learner-' + L.name);
  const sc = draws.map((d) => realise(d, L, rng));
  const trueV = L.mode === 'dk' ? populationValue(L.K) : populationValue(L.K);
  const tv = L.K === 0 ? 0 : trueV;
  const est = sc.map((s) => s.score.est); const raw = sc.map((s) => s.raw.est);
  const cov = sc.filter((s) => s.score.ci[0] <= tv && tv <= s.score.ci[1]).length / DRAWS;
  let fa = 0; let pairs = 0;
  for (let i = 0; i + 1 < DRAWS; i += 2) { const c = scoring.changeFrom(sc[i], sc[i + 1]); pairs++; if (c.score.lo > 0 || c.score.hi < 0) fa++; }
  const hw = mean(sc.map((s) => (s.score.ci[1] - s.score.ci[0]) / 2));
  const dkMean = mean(sc.map((s) => s.counts.dont_know));
  summary.push({ name: L.name, est: mean(est) });
  console.log(`  ${L.name}`);
  console.log(`    formula score: true ${f3(tv)} | draws mean ${f3(mean(est))} SD ${f3(sd(est))} min ${f3(Math.min(...est))} max ${f3(Math.max(...est))} | CI half-width ${f3(hw)} | CI covers truth ${(cov * 100).toFixed(1)}%`);
  console.log(`    raw share right: mean ${f3(mean(raw))} | "I don't know" per sitting ${dkMean.toFixed(1)}`);
  console.log(`    two draws of the same learner differ "significantly": ${fa} of ${pairs} comparisons (${(100 * fa / pairs).toFixed(1)}%, nominal 5%)`);
}
const guessers = summary.filter((s) => /^[abcd]\./.test(s.name));
console.log('\n  Ordering a < b < c < d (mean formula score): ' + guessers.map((l) => `${l.name.slice(0, 1)}: ${f3(l.est)}`).join('   '));
console.log('  strictly increasing: ' + guessers.every((l, i) => i === 0 || l.est > guessers[i - 1].est));

// C. strategies on the options only
console.log('\nC. Guessing strategies that use only the four English options (no audio). Chance right = 25%; formula score = right - wrong/3 per item, so about 0 is the target.');
const argmaxScores = (a) => a;
const wc = (o) => tokensNorm(o).length;
const funcShare = (o) => { const w = tokensNorm(o); return w.length ? 1 - enContentWords(o).length / w.length : 0; };
// English word frequency over the pool's own English sentences (a crude "how natural does it sound" proxy)
const efreq = new Map();
for (const e of pool.entries) for (const w of tokensNorm(e.en.text)) efreq.set(w, (efreq.get(w) || 0) + 1);
const avgFreq = (o) => mean(tokensNorm(o).map((w) => Math.log(1 + (efreq.get(w) || 0))));
const share = (a, b) => { const sa = new Set(enContentWords(a)); return enContentWords(b).filter((w) => sa.has(w)).length; };
const consensus = (opts) => opts.map((o, i) => opts.reduce((a, p, j) => a + (j === i ? 0 : share(o, p)), 0));
const medoid = (vals) => vals.map((v, i) => -vals.reduce((a, w, j) => a + (j === i ? 0 : Math.abs(v - w)), 0));
const strategies = {
  'longest option': (it) => it.options.map((o) => o.length),
  'shortest option': (it) => it.options.map((o) => -o.length),
  'option closest to the median length': (it) => { const L = it.options.map((o) => o.length).sort((a, b) => a - b); const med = (L[1] + L[2]) / 2; return it.options.map((o) => -Math.abs(o.length - med)); },
  'length medoid (smallest total length distance to the others)': (it) => medoid(it.options.map((o) => o.length)),
  'odd one out by length': (it) => it.options.map((o, i) => Math.abs(o.length - mean(it.options.filter((_, j) => j !== i).map((x) => x.length)))),
  'most words': (it) => it.options.map(wc),
  'fewest words': (it) => it.options.map((o) => -wc(o)),
  'word-count medoid': (it) => medoid(it.options.map(wc)),
  'longest average word': (it) => it.options.map((o) => o.length / wc(o)),
  'highest share of function words': (it) => it.options.map(funcShare),
  'lowest share of function words': (it) => it.options.map((o) => -funcShare(o)),
  'function-share medoid': (it) => medoid(it.options.map(funcShare)),
  'shares most content words with the other options (consensus)': (it) => consensus(it.options),
  'shares fewest content words with the other options': (it) => consensus(it.options).map((v) => -v),
  'most natural-sounding (highest mean word frequency)': (it) => it.options.map(avgFreq),
  'least natural-sounding (lowest mean word frequency)': (it) => it.options.map((o) => -avgFreq(o)),
  'starts with the most common first word of the four': (it) => { const f = it.options.map((o) => tokensNorm(o)[0]); return f.map((w) => f.filter((x) => x === w).length); },
  'contains an "I" / "you" / "we" subject': (it) => it.options.map((o) => (/\b(i|you|we)\b/i.test(o) ? 1 : 0)),
  'alphabetically first': (it) => { const s = it.options.map((o) => o.toLowerCase()); const m = s.slice().sort()[0]; return s.map((x) => (x === m ? 1 : 0)); },
  'always position A': () => [1, 0, 0, 0], 'always position B': () => [0, 1, 0, 0], 'always position C': () => [0, 0, 1, 0], 'always position D': () => [0, 0, 0, 1],
};
console.log(`  items skipped (no matching distractors) per draw: ${(draws.reduce((a, d) => a + d.skipped_for_distractors, 0) / DRAWS).toFixed(1)}`);
const its = draws.flatMap((d) => d.items);
let worst = 0;
for (const [name, fn] of Object.entries(strategies)) {
  let right = 0;
  for (const it of its) { const sc = argmaxScores(fn(it)); const mx = Math.max(...sc); const ties = sc.filter((v) => Math.abs(v - mx) < 1e-9).length; if (Math.abs(sc[it.correct] - mx) < 1e-9) right += 1 / ties; }
  const p = right / its.length; const se = Math.sqrt(p * (1 - p) / its.length);
  const form = p - (1 - p) / 3; const fse = se * (4 / 3);
  worst = Math.max(worst, Math.abs(form));
  console.log(`  ${name.padEnd(64)} right ${(p * 100).toFixed(1)}% (95% CI ${((p - 1.96 * se) * 100).toFixed(1)} to ${((p + 1.96 * se) * 100).toFixed(1)}) -> formula score ${form >= 0 ? '+' : ''}${f3(form)} (+-${f3(1.96 * fse)}), n=${its.length}`);
}
console.log(`  largest |formula score| of any strategy: ${f3(worst)}`);

// D. structure
let lenOk = 0; let n = 0; let ratioMax = 0; let distinctOk = 0; let dupEn = 0;
for (const it of its) {
  const c = it.options[it.correct].length;
  it.options.forEach((o, i) => { if (i === it.correct) return; n++; const r = Math.abs(o.length - c) / c; if (r <= 0.2 + 1e-9) lenOk++; ratioMax = Math.max(ratioMax, r); });
  if (new Set(it.options.map((o) => o.length)).size === 4) distinctOk++;
  if (new Set(it.options.map(normalize)).size < 4) dupEn++;
}
const pos = [0, 0, 0, 0]; its.forEach((x) => pos[x.correct]++);
const rankCounts = [0, 0, 0, 0]; its.forEach((it) => { const c = it.options[it.correct].length; rankCounts[it.options.filter((o) => o.length < c).length]++; });
console.log(`\nD. Structure over ${its.length} items`);
console.log(`  wrong options within +-20% of the correct option's length: ${lenOk} of ${n} (max deviation ${(ratioMax * 100).toFixed(1)}%)`);
console.log(`  items whose four options all have different lengths: ${distinctOk} of ${its.length}; items with duplicate English options: ${dupEn}`);
console.log(`  correct-option position counts (A/B/C/D): ${pos.join(' / ')}`);
console.log(`  correct option's length rank (0 = shortest ... 3 = longest): ${rankCounts.join(' / ')}`);
console.log(`  strata per draw: ${JSON.stringify(Object.fromEntries(scoring.STRATA.map((s) => [s, draws[0].items.filter((x) => x.stratum === s).length])))}`);
