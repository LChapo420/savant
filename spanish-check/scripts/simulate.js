#!/usr/bin/env node
'use strict';
/**
 * Validation by simulation (PROTOCOL.md section 9). Pure compute, no network, deterministic (fixed seed).
 *  A. Simulated learners (knows nothing / easy only / easy+medium / everything) on 200 random draws of the
 *     real sealed pool: spread of scores across draws, CI coverage of the true value, false alarms between draws.
 *  B. Equivalence of draws: per-draw mean difficulty, mean sentence length.
 *  C. Reading distractor guessing strategies on the same draws.
 * Usage: node scripts/simulate.js [--draws N]
 */
const path = require('path');
const { rngFrom, normalize, tokensNorm, cognateScore, enContentWords, esContentWords } = require('../lib/common');
const { loadPool, drawSitting } = require('../lib/draw');
const cand = require('../lib/candidates');
const scoring = require('../scoring');

const di = process.argv.indexOf('--draws');
const DRAWS = di >= 0 ? Number(process.argv[di + 1]) : 200;
const pool = loadPool(path.join(__dirname, '..', 'pool.json'));
const all = cand.loadSpanish();
const stats = cand.corpusStats(all);
const rankOf = (w) => stats.rank.get(w.toLowerCase());

const LEARNERS = [
  { name: 'a. knows nothing', K: 0 },
  { name: 'b. knows the 250 commonest words', K: 250 },
  { name: 'c. knows the 1000 commonest words', K: 1000 },
  { name: 'd. knows all', K: Infinity },
];

// Learner model. A word of corpus rank r is known with probability pk(r) = 1 / (1 + (r / K)^2.5)  (K = rank at which it is 50/50;
// K = 0 knows nothing, K = Infinity knows everything). Known words are typed correctly 95% of the time; unknown words are omitted.
// Reading: P(right) = 0.25 + 0.70 * (share of content words known)  -> 0.95 when all are known, 0.25 (a pure guess) when none are.
// Knowledge is re-drawn for every item, so a learner lapses on easy words and gets lucky on hard ones, like a real one.
function wordsOf(text) { return (text.normalize('NFC').match(/\p{L}+/gu) || []); }
const pk = (w, K) => (K === 0 ? 0 : K === Infinity ? 1 : 1 / (1 + (rankOf(w) / K) ** 2.5));
const TYPED_OK = 0.95;
const { ES_STOP } = require('../lib/common');
const contentWords = (text) => { const w = wordsOf(text); const c = w.filter((x) => !ES_STOP.has(normalize(x))); return c.length ? c : w; };
const expListen = (text, K) => { const w = wordsOf(text); return w.length ? TYPED_OK * mean0(w.map((x) => pk(x, K))) : 0; };
const expRead = (text, K) => { const c = contentWords(text); return 0.25 + 0.70 * mean0(c.map((x) => pk(x, K))); };
function mean0(a) { return a.reduce((x, y) => x + y, 0) / a.length; }

// population value for each learner = stratum-weighted mean expected score over the whole pool
function populationValue(section, K) {
  const src = section === 'listening' ? pool.listenBy : pool.readBy;
  const w = pool.meta.strata_weights[section];
  let v = 0;
  for (const s of scoring.STRATA) {
    let sum = 0; for (const e of src[s]) sum += section === 'listening' ? expListen(e.text, K) : expRead(e.text, K);
    v += w[s] * (sum / src[s].length);
  }
  return v;
}

// a realised sitting for a learner on a draw
function realise(draw, K, rng) {
  const items = draw.items.map((it) => (it.section === 'listening'
    ? { item_id: it.item_id, section: 'listening', stratum: it.stratum, half: it.half, reference: it.reference }
    : { item_id: it.item_id, section: 'reading', stratum: it.stratum, half: it.half, correct: it.correct }));
  const answers = new Map();
  for (const it of draw.items) {
    if (it.section === 'listening') {
      const typed = [];
      for (const w of wordsOf(it.reference)) if (rng() < pk(w, K) && rng() < TYPED_OK) typed.push(w);
      answers.set(it.item_id, { item_id: it.item_id, answer: typed.join(' '), server_ms: 30000, replays: 1 });
    } else {
      const c = contentWords(it.stem); const f = c.filter((w) => rng() < pk(w, K)).length / c.length;
      const pRight = 0.25 + 0.70 * f; // probability of marking the right option
      const choice = rng() < pRight ? it.correct : (it.correct + 1 + Math.floor(rng() * 3)) % 4;
      answers.set(it.item_id, { item_id: it.item_id, choice, server_ms: 12000, replays: 0 });
    }
  }
  return scoring.scoreSitting(pool.meta, items, answers);
}

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)); };
const f3 = (x) => x.toFixed(3);

console.log(`Simulation: ${DRAWS} random draws from the sealed pool (listening ${JSON.stringify(Object.fromEntries(scoring.STRATA.map((s) => [s, pool.listenBy[s].length])))}, reading ${JSON.stringify(Object.fromEntries(scoring.STRATA.map((s) => [s, pool.readBy[s].length])))})\n`);
const draws = [];
const diffs = []; const lens = []; const logd = [];
for (let i = 0; i < DRAWS; i++) {
  const hex = require('../lib/common').sha256(`simulation-draw-${i}`);
  const d = drawSitting(pool, { keys: new Set(), dists: new Set() }, hex);
  draws.push(d);
}

// B. equivalence of draws on the items themselves
const popLog = {}; const popLen = {};
for (const sec of ['listening', 'reading']) {
  const src = sec === 'listening' ? pool.listenBy : pool.readBy; const w = pool.meta.strata_weights[sec];
  popLog[sec] = scoring.STRATA.reduce((a, s) => a + w[s] * mean(src[s].map((e) => Math.log(e.difficulty))), 0);
  popLen[sec] = scoring.STRATA.reduce((a, s) => a + w[s] * mean(src[s].map((e) => e.words)), 0);
}
console.log('B. Draw equivalence (stratum-weighted means per draw vs the pool)');
for (const sec of ['listening', 'reading']) {
  const lg = draws.map((d) => { const its = d.items.filter((x) => x.section === sec); const w = pool.meta.strata_weights[sec]; return scoring.STRATA.reduce((a, s) => { const xs = its.filter((x) => x.stratum === s).map((x) => Math.log(pool.byId.get(x.item_id).difficulty)); return a + w[s] * mean(xs); }, 0); });
  const ln = draws.map((d) => { const its = d.items.filter((x) => x.section === sec); const w = pool.meta.strata_weights[sec]; return scoring.STRATA.reduce((a, s) => { const xs = its.filter((x) => x.stratum === s).map((x) => pool.byId.get(x.item_id).words); return a + w[s] * mean(xs); }, 0); });
  console.log(`  ${sec}: mean log-difficulty per draw ${f3(mean(lg))} (SD ${f3(sd(lg))}, pool ${f3(popLog[sec])}); words per sentence ${f3(mean(ln))} (SD ${f3(sd(ln))}, pool ${f3(popLen[sec])})`);
}

// A. learners
console.log('\nA. Simulated learners over the draws (stratum-weighted scores; "true" = expected value over the whole pool)');
const learnerSummary = [];
for (const L of LEARNERS) {
  const rng = rngFrom('sim-learner-' + L.name);
  const sc = draws.map((d) => realise(d, L.K, rng));
  const trueL = populationValue('listening', L.K); const trueR = (populationValue('reading', L.K) - 0.25) / 0.75;
  const lis = sc.map((s) => s.listening.est); const rcc = sc.map((s) => s.reading.cc); const rraw = sc.map((s) => s.reading.raw);
  const covL = sc.filter((s) => s.listening.ci[0] <= trueL && trueL <= s.listening.ci[1]).length / DRAWS;
  const covR = sc.filter((s) => s.reading.cc_ci[0] <= trueR && trueR <= s.reading.cc_ci[1]).length / DRAWS;
  // false alarms: pairs of independent draws (i, i+1) whose difference CI excludes 0
  let fa = 0; let pairs = 0;
  for (let i = 0; i + 1 < DRAWS; i += 2) {
    const c = scoring.changeFrom(sc[i], sc[i + 1]);
    pairs++; if (c.listening.lo > 0 || c.listening.hi < 0) fa++;
    pairs++; if (c.reading_cc.lo > 0 || c.reading_cc.hi < 0) fa++;
  }
  const hw = mean(sc.map((s) => (s.listening.ci[1] - s.listening.ci[0]) / 2)); const hwR = mean(sc.map((s) => (s.reading.cc_ci[1] - s.reading.cc_ci[0]) / 2));
  learnerSummary.push({ name: L.name, lis: mean(lis), rraw: mean(rraw), rcc: mean(rcc) });
  console.log(`  ${L.name}`);
  console.log(`    listening: true ${f3(trueL)} | draws mean ${f3(mean(lis))} SD ${f3(sd(lis))} min ${f3(Math.min(...lis))} max ${f3(Math.max(...lis))} | CI half-width ${f3(hw)} | CI covers truth ${(covL * 100).toFixed(1)}%`);
  console.log(`    reading raw: mean ${f3(mean(rraw))} (SD ${f3(sd(rraw))}); above chance: true ${f3(trueR)} | mean ${f3(mean(rcc))} SD ${f3(sd(rcc))} | CI half-width ${f3(hwR)} | CI covers truth ${(covR * 100).toFixed(1)}%`);
  console.log(`    two draws of the same learner differ "significantly": ${fa} of ${pairs} comparisons (${(100 * fa / pairs).toFixed(1)}%, nominal 5%)`);
}
console.log('\n  Ordering a < b < c < d (mean listening / reading raw): ' + learnerSummary.map((l) => `${l.name.slice(0, 1)}: ${f3(l.lis)} / ${f3(l.rraw)}`).join('   '));
const inc = learnerSummary.every((l, i) => i === 0 || (l.lis > learnerSummary[i - 1].lis && l.rraw > learnerSummary[i - 1].rraw));
console.log('  strictly increasing in both sections: ' + inc);

// C. reading distractor strategies
console.log('\nC. Reading: guessing strategies that use only the options and the Spanish sentence (chance = 25%)');
const strategies = {
  'longest option': (it) => argmax(it.options.map((o) => o.length)),
  'shortest option': (it) => argmax(it.options.map((o) => -o.length)),
  'option closest to the median length': (it) => { const L = it.options.map((o) => o.length).sort((a, b) => a - b); const med = (L[1] + L[2]) / 2; return it.options.map((o) => -Math.abs(o.length - med)); },
  'option whose length is most different from the others (odd one out)': (it) => argmax(it.options.map((o, i) => Math.abs(o.length - mean(it.options.filter((_, j) => j !== i).map((x) => x.length))))),
  'most words': (it) => argmax(it.options.map((o) => o.split(/\s+/).length)),
  'longest average word': (it) => argmax(it.options.map((o) => o.length / o.split(/\s+/).length)),
  'shares most look-alike words with the Spanish (cognates)': (it) => argmax(it.options.map((o) => cognateScore(it.stem, o))),
  'shares most exact letters-only words with the Spanish': (it) => argmax(it.options.map((o) => { const s = new Set(tokensNorm(it.stem)); return tokensNorm(o).filter((w) => s.has(w) && w.length > 2).length; })),
  'consensus: shares most content words with the other options': (it) => argmax(it.options.map((o, i) => { const c = new Set(enContentWords(o)); return it.options.reduce((a, p, j) => a + (j === i ? 0 : enContentWords(p).filter((w) => c.has(w)).length), 0); })),
  'most common English words (highest share of stop words)': (it) => argmax(it.options.map((o) => tokensNorm(o).filter((w) => !enContentWords(w).length).length / tokensNorm(o).length)),
  'fewest function words (inverse of the line above)': (it) => it.options.map((o) => -tokensNorm(o).filter((w) => !enContentWords(w).length).length / tokensNorm(o).length),
  'always position A': (it) => 0, 'always position B': (it) => 1, 'always position C': (it) => 2, 'always position D': (it) => 3,
};
// a strategy returns a score per option; ties share the credit equally (the strategy picks one of the tied options at random)
function argmax(a) { return a; }
console.log(`  items skipped because three matching distractors could not be found: ${draws.reduce((a, d) => a + d.skipped_for_distractors, 0)} over ${DRAWS} draws (${(draws.reduce((a, d) => a + d.skipped_for_distractors, 0) / DRAWS).toFixed(1)} per draw)`);
const reads = draws.flatMap((d) => d.items.filter((x) => x.section === 'reading'));
for (const [name, fn] of Object.entries(strategies)) {
  let right = 0; for (const it of reads) { const sc = fn(it); if (Array.isArray(sc)) { const mx = Math.max(...sc); const ties = sc.filter((v) => v === mx).length; if (sc[it.correct] === mx) right += 1 / ties; } else if (sc === it.correct) right += 1; }
  const p = right / reads.length; const se = Math.sqrt(p * (1 - p) / reads.length);
  console.log(`  ${name.padEnd(70)} ${(p * 100).toFixed(1)}%  (95% CI ${((p - 1.96 * se) * 100).toFixed(1)} to ${((p + 1.96 * se) * 100).toFixed(1)}, n=${reads.length})`);
}
// structural checks on distractors
let lenOk = 0; let n = 0; let ratioMax = 0;
for (const it of reads) { const c = it.options[it.correct].length; it.options.forEach((o, i) => { if (i === it.correct) return; n++; const r = Math.abs(o.length - c) / c; if (r <= 0.2 + 1e-9) lenOk++; ratioMax = Math.max(ratioMax, r); }); }
console.log(`\n  distractors within +-20% of the correct option's length: ${lenOk} of ${n} (max deviation ${(ratioMax * 100).toFixed(1)}%)`);
const posCounts = [0, 0, 0, 0]; draws.forEach((d) => d.items.filter((x) => x.section === 'reading').forEach((x) => posCounts[x.correct]++));
console.log(`  correct-option position counts over all draws: ${posCounts.join(' / ')}`);
