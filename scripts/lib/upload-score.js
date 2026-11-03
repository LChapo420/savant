/**
 * Scoring for the upload proof: how much of a document's planted key points an extraction kept, and whether the emphasis
 * weights put them in the planted order. Everything here is deterministic; judges (models) live in scripts/uploads-proof.js.
 */
const K = require('../../services/material-keypoints');

/** Share of the planted point's content words found in `set` (a Set of terms). */
function containment(kpText, set) {
  const t = K.termSet(kpText);
  if (!t.size) return 1;
  let n = 0;
  for (const x of t) if (set.has(x)) n++;
  return n / t.size;
}

/** Sentences and lines of an extracted text, as term sets (a planted point must sit in ONE of them, not be spread over the page). */
function sentenceSets(text) {
  return String(text).replace(/(?<![.!?:])\n(?!\n)/g, ' ').split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length > 12).map((s) => K.termSet(s));
}

/** Text recall: planted points whose words are (>= 0.8) inside one sentence of the extracted text. */
function textRecall(kps, text) {
  const sets = sentenceSets(text);
  const hit = kps.map((k) => sets.some((s) => containment(k.text, s) >= 0.8));
  return { found: hit.filter(Boolean).length, total: kps.length, recall: kps.length ? hit.filter(Boolean).length / kps.length : 1, missed: kps.filter((_, i) => !hit[i]).map((k) => k.id) };
}

/**
 * Key-point recall and emphasis agreement. `extracted` is the material's key_points. A planted point is matched by the
 * extracted point holding most of its words (>= 0.7); several planted points may not share one extracted point.
 */
function keypointScore(planted, extracted) {
  const used = new Set();
  const pairs = [];
  for (const p of [...planted].sort((a, b) => b.level - a.level)) {
    let best = -1; let bestC = 0.7 - 1e-9;
    extracted.forEach((e, i) => {
      if (used.has(i)) return;
      const c = containment(p.text, K.termSet(e.text));
      if (c > bestC) { bestC = c; best = i; }
    });
    if (best >= 0) { used.add(best); pairs.push({ p, e: extracted[best] }); }
  }
  const stressed = planted.filter((p) => p.level >= 2);
  const matchedStressed = pairs.filter((x) => x.p.level >= 2).length;
  const rho = K.spearman(pairs.map((x) => x.p.level), pairs.map((x) => x.e.weight));
  // Rank agreement over ALL planted points, an unmatched point counting as weight 0 (it was not seen as stressed at all).
  const rhoAll = K.spearman(planted.map((p) => p.level), planted.map((p) => { const m = pairs.find((x) => x.p === p); return m ? m.e.weight : 0; }));
  return {
    planted: planted.length, matched: pairs.length, recall: planted.length ? pairs.length / planted.length : 1,
    stressed: stressed.length, matchedStressed, recallStressed: stressed.length ? matchedStressed / stressed.length : 1,
    rho, rhoAll, extracted: extracted.length,
    missed: planted.filter((p) => !pairs.some((x) => x.p === p)).map((p) => `${p.id}(L${p.level})`),
    pairs: pairs.map((x) => `${x.p.id}:L${x.p.level}->${x.e.weight}`),
  };
}

const pct = (n) => (n == null ? 'n/a' : `${Math.round(n * 100)}%`);
const r2 = (n) => (n == null ? 'n/a' : (Math.round(n * 100) / 100).toFixed(2));

module.exports = { containment, textRecall, keypointScore, sentenceSets, pct, r2 };
