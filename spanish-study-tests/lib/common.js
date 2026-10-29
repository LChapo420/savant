'use strict';
/**
 * Shared, pure helpers for the Spanish check: hashing, normalisation, the seeded
 * random generator, the cognate score used for distractor matching.
 * Everything here is deterministic. No Math.random, no Date.
 */
const crypto = require('crypto');

const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');

/** lowercase, accents/diacritics stripped (so n-tilde becomes n), everything but a-z0-9 becomes a single space. */
function normalize(s) {
  return String(s).normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
const tokensNorm = (s) => { const n = normalize(s); return n ? n.split(' ') : []; };

/** mulberry32 over a 32-bit seed. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** 32-bit seed from any string (first 8 hex digits of its SHA-256). */
const seedFrom = (str) => parseInt(sha256(String(str)).slice(0, 8), 16) >>> 0;
const rngFrom = (str) => mulberry32(seedFrom(str));

/** Fisher-Yates on a copy. */
function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

function lev(a, b) {
  if (a === b) return 0;
  const m = a.length; const n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = new Array(n + 1); let cur = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const c = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + c);
    }
    const t = prev; prev = cur; cur = t;
  }
  return prev[n];
}

/**
 * How many look-alike (cognate / shared-spelling) words a Spanish sentence shares with an
 * English one: for each distinct Spanish word of 4+ letters, the best 1 - lev/maxlen against
 * the English words of 4+ letters, counted when it is at least 0.6. Used only to pick distractors
 * with a similar score to the correct answer, so look-alike words are no clue.
 */
function cognateScore(spanish, english) {
  const sp = [...new Set(tokensNorm(spanish).filter((w) => w.length >= 4))];
  const en = [...new Set(tokensNorm(english).filter((w) => w.length >= 4))];
  let total = 0;
  for (const s of sp) {
    let best = 0;
    for (const e of en) {
      const sim = 1 - lev(s, e) / Math.max(s.length, e.length);
      if (sim > best) best = sim;
    }
    if (best >= 0.6) total += best;
  }
  return total;
}

const EN_STOP = new Set(('a an the i you he she it we they me him her us them my your his its our their this that these those ' +
  'is am are was were be been being do does did have has had will would can could should shall may might must to of in on at by for ' +
  'with from as and or but if so not no yes there here what which who whom when where why how all any some very too just than then ' +
  'about into out up down over under again s t d ll ve re m don didn doesn isn aren wasn weren').split(' '));
/** English content words (stop words removed). */
const enContentWords = (s) => tokensNorm(s).filter((w) => !EN_STOP.has(w));

const ES_STOP = new Set(('el la los las un una unos unas de del al a en y o u e ni que se me te le les lo nos os mi tu su mis tus sus ' +
  'es son era eran fue ser estar esta esta estoy estan por para con sin sobre como pero si no mas muy yo tu el ella ellos ellas nosotros').split(' '));
const esContentWords = (s) => tokensNorm(s).filter((w) => !ES_STOP.has(w));

/** Canonical JSON: stable key order via explicit construction by callers; plain stringify with 1-space indent. */
const stringifyStable = (obj) => JSON.stringify(obj);

module.exports = {
  sha256, normalize, tokensNorm, mulberry32, seedFrom, rngFrom, shuffle, lev, cognateScore,
  enContentWords, esContentWords, EN_STOP, ES_STOP, stringifyStable,
};
