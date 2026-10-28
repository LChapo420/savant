'use strict';
/**
 * The sitting draw: a pure function of (sealed pool, items already used here, what the first test showed, public randomness).
 * Nothing here reads a clock or Math.random. Same inputs -> same 24 items, same answer options, same option order.
 * PROTOCOL.md section 5. The distractor logic is the first test's (spanish-check/lib/draw.js) minus the Spanish-text
 * cognate matching, which does not apply when no Spanish text is shown, plus pairwise matching among the wrong options.
 */
const fs = require('fs');
const { normalize, tokensNorm, rngFrom, shuffle, enContentWords, esContentWords } = require('../../spanish-check/lib/common');

const STRATA = ['easy', 'medium', 'hard'];
const PER_STRATUM = 8;
const N_ITEMS = 24;
const DIST_LEN_TOL = 0.2;       // wrong option's character length within +-20% of the correct option's
const WORD_COUNT_TOL = 0;       // word count EQUAL for all four options (a tolerance leaks: the correct option tends to have more words than its neighbours)
const STOP_SHARE_TOL = 0.1;     // share of function words within 0.1
const MAX_CONTENT_OVERLAP = 0.5;
const DIST_SAMPLE = 600;
const DIST_SCAN = 6000;

const stopShare = (t) => { const w = tokensNorm(t); return w.length ? 1 - enContentWords(t).length / w.length : 0; };
const termOf = (s) => s.trim().slice(-1);

function loadPool(file) {
  const obj = JSON.parse(fs.readFileSync(file, 'utf8'));
  const pool = { meta: obj.meta, entries: obj.entries, byId: new Map(), itemsBy: {}, distBy: {} };
  for (const s of STRATA) { pool.itemsBy[s] = []; pool.distBy[s] = []; }
  for (const e of obj.entries) {
    e.enNorm = normalize(e.en.text);
    pool.byId.set(e.id, e);
    (e.role === 'item' ? pool.itemsBy : pool.distBy)[e.stratum].push(e);
  }
  return pool;
}

/** Three wrong English options (as pool entries) for one correct English sentence. targetRank = how many of the three are SHORTER than the correct one. */
function chooseDistractors(pool, stem, correctEn, stratum, bannedIds, bannedEn, rng, targetRank) {
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
    if (bannedIds.has(d.id) || bannedEn.has(d.enNorm) || d.enNorm === aNorm) continue;
    const t = d.en.text;
    if (t.length < lo || t.length > hi) continue;
    if (termOf(t) !== term) continue;
    const wc = tokensNorm(t).length;
    if (Math.abs(wc - correctWords) > WORD_COUNT_TOL) continue;
    const ss = stopShare(t);
    if (Math.abs(ss - correctStop) > STOP_SHARE_TOL) continue;
    const bWords = enContentWords(t);
    let shared = 0; for (const w of new Set(bWords)) if (aWords.has(w)) shared++;
    if (aWords.size && shared / aWords.size > MAX_CONTENT_OVERLAP) continue;
    if (bWords.length && shared / new Set(bWords).size > MAX_CONTENT_OVERLAP) continue;
    const dEs = esContentWords(d.text); let sh = 0; for (const w of new Set(dEs)) if (stemEs.has(w)) sh++;
    if (stemEs.size && dEs.length && sh / Math.min(stemEs.size, new Set(dEs).size) > MAX_CONTENT_OVERLAP) continue;
    ok.push({ d, len: t.length, wc, ss, words: new Set(bWords) });
    if (ok.length >= DIST_SAMPLE) break;
  }
  // wrong options must also resemble EACH OTHER as closely as they resemble the correct one, so the correct option is not the "centre" of the four
  const pairOk = (a, b) => {
    if (Math.abs(a.len - b.len) > DIST_LEN_TOL * Math.max(a.len, b.len)) return false;
    if (Math.abs(a.wc - b.wc) > WORD_COUNT_TOL) return false;
    if (Math.abs(a.ss - b.ss) > STOP_SHARE_TOL) return false;
    let sh = 0; for (const w of a.words) if (b.words.has(w)) sh++;
    if (a.words.size && sh / a.words.size > MAX_CONTENT_OVERLAP) return false;
    if (b.words.size && sh / b.words.size > MAX_CONTENT_OVERLAP) return false;
    return a.d.enNorm !== b.d.enNorm;
  };
  const shorter = ok.filter((o) => o.len < len); const longer = ok.filter((o) => o.len >= len);
  const chosen = []; const lens = new Set([len]);
  const take = (group, k) => {
    for (const s of group) {
      if (k === 0) break;
      if (lens.has(s.len) || !chosen.every((c) => pairOk(c, s))) continue; // all four options get different lengths
      lens.add(s.len); chosen.push(s); k--;
    }
    return k;
  };
  const left = take(shorter, targetRank) + take(longer, 3 - targetRank);
  if (left > 0 || chosen.length < 3) throw new Error('could not find 3 distractors');
  return chosen.map((c) => c.d);
}

/**
 * @param pool        loadPool() result
 * @param used        { keys:Set (normalised Spanish keys used in earlier sittings here), dists:Set (distractor ids), en:Set (normalised English options shown) }
 * @param randomness  hex string of the drand round
 * @param ext         { keys:Set, ids:Set, en:Set } what the first test showed (lib/firsttest.js toSets)
 */
function drawSitting(pool, used, randomness, ext) {
  ext = ext || { keys: new Set(), ids: new Set(), en: new Set() };
  const base = `spanish-listening-draw-v1|${String(randomness).toLowerCase()}`;
  const keys = new Set(used.keys);
  const bannedIds = new Set(used.dists);
  const bannedEn = new Set([...(used.en || []), ...ext.en]);
  const rankOff = Math.floor(rngFrom(`${base}|rankoffset`)() * 4);
  const ranks = shuffle(Array.from({ length: N_ITEMS }, (_, i) => (i + rankOff) % 4), rngFrom(`${base}|lengthranks`));
  let skipped = 0; let accepted = 0;
  const picked = [];
  for (const s of STRATA) {
    const eligible = pool.itemsBy[s].filter((e) => !keys.has(e.key) && !ext.keys.has(e.key) && !ext.ids.has(e.id));
    const order = shuffle(eligible, rngFrom(`${base}|${s}`));
    let n = 0;
    for (const e of order) {
      if (n === PER_STRATUM) break;
      if (bannedEn.has(e.enNorm)) { skipped++; continue; }
      let d;
      try { d = chooseDistractors(pool, e.text, e.en.text, s, bannedIds, bannedEn, rngFrom(`${base}|dist|${e.id}`), ranks[accepted]); } catch (err) { skipped++; continue; }
      accepted++;
      for (const x of d) { bannedIds.add(x.id); bannedEn.add(x.enNorm); }
      bannedEn.add(e.enNorm); keys.add(e.key);
      picked.push({ e, d, stratum: s, half: n % 2 });
      n++;
    }
    if (n < PER_STRATUM) throw new Error(`${s} pool exhausted`);
  }
  const ordered = shuffle(picked, rngFrom(`${base}|order`));
  // balanced correct positions: 24 slots, each of the four positions 6 times
  const off = Math.floor(rngFrom(`${base}|offset`)() * 4);
  const positions = shuffle(Array.from({ length: N_ITEMS }, (_, i) => (i + off) % 4), rngFrom(`${base}|positions`));
  const items = []; const newDists = []; const newEn = []; const newKeys = [];
  ordered.forEach((p, n) => {
    const e = p.e;
    const dOrder = shuffle(p.d, rngFrom(`${base}|optorder|${e.id}`));
    const opts = dOrder.map((d) => d.en.text);
    const correct = positions[n];
    opts.splice(correct, 0, e.en.text);
    items.push({ item_id: e.id, n, stratum: p.stratum, half: p.half, key: e.key, reference: e.text, audio: e.audio, options: opts, correct, distractor_ids: dOrder.map((d) => d.id) });
    newKeys.push(e.key);
    for (const d of dOrder) newDists.push(d.id);
    for (const o of opts) newEn.push(normalize(o));
  });
  return { items, used: { keys: newKeys, dists: newDists, en: newEn }, skipped_for_distractors: skipped };
}

module.exports = { STRATA, PER_STRATUM, N_ITEMS, loadPool, drawSitting, chooseDistractors };
