/**
 * Seeded randomness. Every item is generated from a seed, so the same
 * (skill, difficulty, seed) always produces the same question — which is what
 * makes a bank item cacheable, reproducible in a bug report, and re-servable in
 * a review queue without storing the whole question twice.
 */
function makeRng(seed) {
  // mulberry32: small, fast, good enough for question generation.
  let a = (typeof seed === 'string' ? hashString(seed) : seed) >>> 0;
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const rng = {
    next: rnd,
    /** Integer in [min, max] inclusive. */
    int(min, max) {
      return Math.floor(rnd() * (max - min + 1)) + min;
    },
    /** Non-zero integer in [min, max], useful for coefficients. */
    nz(min, max) {
      let v = 0;
      while (v === 0) v = rng.int(min, max);
      return v;
    },
    pick(list) {
      return list[Math.floor(rnd() * list.length)];
    },
    /** n distinct members of list, in random order. */
    sample(list, n) {
      const copy = [...list];
      const out = [];
      while (out.length < n && copy.length) {
        out.push(copy.splice(Math.floor(rnd() * copy.length), 1)[0]);
      }
      return out;
    },
    shuffle(list) {
      const copy = [...list];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    },
    bool(p = 0.5) {
      return rnd() < p;
    },
    sign() {
      return rnd() < 0.5 ? -1 : 1;
    },
  };
  return rng;
}

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Build a four-choice multiple-choice item from a correct answer and distractors,
 * shuffled so the right answer is not always in the same slot. Distractors are
 * de-duplicated against the answer, because two identical choices make an item
 * unanswerable and is the single most common generator bug.
 */
function choicesFrom(rng, answer, distractors, count = 4) {
  const seen = new Set([String(answer)]);
  const pool = [];
  for (const d of distractors) {
    const s = String(d);
    if (seen.has(s)) continue;
    seen.add(s);
    pool.push(s);
  }
  const chosen = pool.slice(0, count - 1);
  return rng.shuffle([String(answer), ...chosen]);
}

module.exports = { makeRng, hashString, choicesFrom };
