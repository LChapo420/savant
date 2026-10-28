'use strict';
/**
 * The sitting draw: a pure function of (sealed pool, items already used, public randomness).
 * Nothing here reads a clock or Math.random. Same inputs -> same 25 items, same answer options,
 * same option order. PROTOCOL.md section 5.
 */
const fs = require('fs');
const { normalize, tokensNorm, rngFrom, shuffle, cognateScore, enContentWords, esContentWords } = require('./common');

const stopShare = (t) => { const w = tokensNorm(t); return w.length ? 1 - enContentWords(t).length / w.length : 0; };

const MIX = {
  listening: { easy: 3, medium: 4, hard: 3 },
  reading: { easy: 5, medium: 5, hard: 5 },
};
const STRATA = ['easy', 'medium', 'hard'];
const HALF_START = { listening: { easy: 0, medium: 0, hard: 1 }, reading: { easy: 0, medium: 1, hard: 0 } };
const DIST_LEN_TOL = 0.2;
const DIST_SAMPLE = 600;
const DIST_SCAN = 6000;
const COGNATE_TOL = 0.1;
const STOP_SHARE_TOL = 0.2;   // |share of function words| difference allowed between a distractor and the correct option
const WORD_COUNT_TOL = 0.2;   // word count within +-20% (at least +-1) of the correct option's      // every distractor's look-alike-word score must be within this of the correct option's
const MAX_CONTENT_OVERLAP = 0.5;

function loadPool(file) {
  const text = fs.readFileSync(file, 'utf8');
  const obj = JSON.parse(text);
  const entries = obj.entries;
  const pool = { meta: obj.meta, entries, byId: new Map(), listenBy: {}, readBy: {}, distBy: {} };
  for (const s of STRATA) { pool.listenBy[s] = []; pool.readBy[s] = []; pool.distBy[s] = []; }
  for (const e of entries) {
    pool.byId.set(e.id, e);
    if (e.listen) pool.listenBy[e.stratum].push(e);
    if (e.read) pool.readBy[e.stratum].push(e);
    if (e.role === 'distractor' && e.en) pool.distBy[e.stratum].push(e);
  }
  return pool;
}

/** k distinct elements by a partial Fisher-Yates driven by rng (input array is not modified). */
function pick(arr, k, rng) {
  const a = arr.slice();
  if (a.length < k) throw new Error(`pool too small: need ${k}, have ${a.length}`);
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(rng() * (a.length - i));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a.slice(0, k);
}

const termOf = (s) => (s.trim().slice(-1));

/**
 * Three wrong English options for one Spanish sentence.
 * targetRank = how many of the three are SHORTER than the correct option (0..3), set by the caller from a balanced
 * list, so the correct option is equally likely to be the shortest, second, third or longest.
 */
function chooseDistractors(pool, stem, correctEn, stratum, banned, rng, targetRank) {
  const cands = pool.distBy[stratum];
  const order = shuffle(cands.map((_, i) => i), rng);
  const len = correctEn.length;
  const lo = len * (1 - DIST_LEN_TOL); const hi = len * (1 + DIST_LEN_TOL);
  const aWords = new Set(enContentWords(correctEn));
  const aNorm = normalize(correctEn);
  const stemEs = new Set(esContentWords(stem));
  const term = termOf(correctEn);
  const correctWords = tokensNorm(correctEn).length;
  const correctStop = stopShare(correctEn);
  const ok = [];
  let scanned = 0;
  for (const i of order) {
    if (++scanned > DIST_SCAN) break;
    const d = cands[i];
    if (banned.has(d.id)) continue;
    const t = d.en.text;
    if (t.length < lo || t.length > hi) continue;
    if (termOf(t) !== term) continue;
    const wc = tokensNorm(t).length;
    if (Math.abs(wc - correctWords) > Math.max(1, WORD_COUNT_TOL * correctWords)) continue;
    if (Math.abs(stopShare(t) - correctStop) > STOP_SHARE_TOL) continue;
    if (normalize(t) === aNorm) continue;
    const bWords = enContentWords(t);
    let shared = 0; for (const w of new Set(bWords)) if (aWords.has(w)) shared++;
    if (aWords.size && shared / aWords.size > MAX_CONTENT_OVERLAP) continue;
    if (bWords.length && shared / new Set(bWords).size > MAX_CONTENT_OVERLAP) continue;
    const dEs = esContentWords(d.text); let sh = 0; for (const w of new Set(dEs)) if (stemEs.has(w)) sh++;
    if (stemEs.size && dEs.length && sh / Math.min(stemEs.size, new Set(dEs).size) > MAX_CONTENT_OVERLAP) continue;
    ok.push({ d, rank: ok.length });
    if (ok.length >= DIST_SAMPLE) break;
  }
  const target = cognateScore(stem, correctEn);
  const scored = ok.map((o) => ({ ...o, gap: Math.abs(cognateScore(stem, o.d.en.text) - target) })).filter((o) => o.gap <= COGNATE_TOL);
  const byGap = (x, y) => (x.gap - y.gap) || (x.rank - y.rank);
  const shorter = scored.filter((o) => o.d.en.text.length < len).sort(byGap);
  const longer = scored.filter((o) => o.d.en.text.length >= len).sort(byGap);
  const lens = new Set([len]); // all four options get different lengths, so there are no ties for a length strategy to hide behind
  const take = (group, k, seen, chosen) => {
    for (const s of group) {
      if (k === 0) break;
      const n = normalize(s.d.en.text);
      if (seen.has(n) || lens.has(s.d.en.text.length)) continue;
      seen.add(n); lens.add(s.d.en.text.length); chosen.push(s.d); k--;
    }
    return k;
  };
  const chosen = []; const seen = new Set([aNorm]);
  const left = take(shorter, targetRank, seen, chosen) + take(longer, 3 - targetRank, seen, chosen);
  if (left > 0 || chosen.length < 3) throw new Error('could not find 3 distractors');
  return chosen;
}

/**
 * @param pool        loadPool() result
 * @param used        { keys:Set<string> (normalised sentences already used), dists:Set<number> (distractor ids already used) }
 * @param randomness  hex string of the drand round used as the seed
 * @returns { items:[...], used:{ keys:[...], dists:[...] } }
 */
function drawSitting(pool, used, randomness) {
  const base = `spanish-check-draw-v1|${String(randomness).toLowerCase()}`;
  const keys = new Set(used.keys); const dists = new Set(used.dists);
  const newKeys = []; const newDists = [];
  const out = { listening: [], reading: [] };

  const banned = new Set(dists);
  let skipped = 0; let accepted = 0;
  // balanced length ranks of the correct option among its four (how many distractors are shorter): 15 slots over 0..3
  const rankOff = Math.floor(rngFrom(`${base}|reading|rankoffset`)() * 4);
  const ranks = shuffle(Array.from({ length: 15 }, (_, i) => (i + rankOff) % 4), rngFrom(`${base}|reading|lengthranks`));
  for (const section of ['listening', 'reading']) {
    const src = section === 'listening' ? pool.listenBy : pool.readBy;
    const picked = [];
    for (const s of STRATA) {
      const eligible = src[s].filter((e) => !keys.has(e.key));
      let chosen;
      if (section === 'listening') {
        chosen = pick(eligible, MIX[section][s], rngFrom(`${base}|${section}|${s}`)).map((e) => ({ e }));
      } else {
        // walk a seeded shuffle and keep the first sentences for which three matching distractors exist
        const order = shuffle(eligible, rngFrom(`${base}|reading|${s}`));
        chosen = [];
        for (const e of order) {
          if (chosen.length === MIX.reading[s]) break;
          let d;
          try { d = chooseDistractors(pool, e.text, e.en.text, s, banned, rngFrom(`${base}|reading|dist|${e.id}`), ranks[accepted]); } catch (err) { skipped++; continue; }
          for (const x of d) banned.add(x.id);
          accepted++;
          chosen.push({ e, d });
        }
        if (chosen.length < MIX.reading[s]) throw new Error('reading pool exhausted');
      }
      chosen.forEach((c, i) => {
        picked.push({ e: c.e, d: c.d, stratum: s, half: (HALF_START[section][s] + i) % 2 });
        keys.add(c.e.key); newKeys.push(c.e.key);
      });
    }
    out[section] = shuffle(picked, rngFrom(`${base}|${section}|order`));
  }

  const items = [];
  out.listening.forEach((p, n) => {
    items.push({
      item_id: p.e.id, section: 'listening', n, stratum: p.stratum, half: p.half, key: p.e.key,
      reference: p.e.text, audio: p.e.audio,
    });
  });
  // balanced correct positions: 15 slots, each of the 4 positions 3 or 4 times
  const nR = out.reading.length;
  const posPool = [];
  const off = Math.floor(rngFrom(`${base}|reading|offset`)() * 4);
  for (let i = 0; i < nR; i++) posPool.push((i + off) % 4);
  const positions = shuffle(posPool, rngFrom(`${base}|reading|positions`));
  out.reading.forEach((p, n) => {
    const e = p.e;
    for (const d of p.d) newDists.push(d.id);
    const dOrder = shuffle(p.d, rngFrom(`${base}|reading|optorder|${e.id}`));
    const opts = dOrder.map((d) => d.en.text);
    const correct = positions[n];
    opts.splice(correct, 0, e.en.text);
    items.push({
      item_id: e.id, section: 'reading', n, stratum: p.stratum, half: p.half, key: e.key,
      stem: e.text, options: opts, correct, distractor_ids: dOrder.map((d) => d.id),
    });
  });
  return { items, used: { keys: newKeys, dists: newDists }, skipped_for_distractors: skipped };
}

module.exports = { MIX, STRATA, loadPool, drawSitting, pick, chooseDistractors };
