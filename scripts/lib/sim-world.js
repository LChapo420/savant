/**
 * A simulated world whose generator differs from the model that reads it (docs/SCORECARD-REAL.md part 5). SIMULATED: this is a stress test of the score, not a model of real people.
 * In the default simulation the reader's assumptions and the generator are the same (paramsFor uses each trait directly; a daily answer has exactly the validity the planner believes).
 * That flatters the score. --world=alt or --world=research change the generator only; every reader (card, planner, read-out) stays as it is and is not told.
 *   express    what the learner does follows a mix of the trait, 2-3 other traits and a personal quirk, not the trait itself. alt: 0.85 for every measure; research: the class's central ceiling
 *              (services/scorecard/ceilings.js), so nothing can be read better than the research says.
 *   warp       the response is curved per measure (power 0.7 to 1.3), so a linear reader is slightly wrong.
 *   dayNoise   a learner's state moves from day to day (tired, keen): standardised noise per measure per day.
 *   itemScale  each daily item's true validity is the believed one times a draw: unvalidated items can be worth little.
 *   style      self-report response styles the reader does not model: acquiescence (agreeing whatever the item), desirability (a fixed direction per measure), careless answering
 *              (10% of learners), and a weaker read from ages 8-12. The sizes are ASSUMED and illustrative.
 *   expEffect  how much a teaching version really changes outcomes (logits, extreme learner; the default world says 0.8).
 */
'use strict';
const { ceilings } = require('../../services/scorecard/ceilings');

const WORLDS = {
  same: null,
  alt: { name: 'alt', fixedExpress: 0.85, warp: 0.3, dayNoise: 0.25, itemLo: 0.5, itemHi: 1.2, family: {}, acq: 0.25, des: 0.25, careless: 0.1, youngR: 0.75, expEffect: 0.8 },
  research: { name: 'research', ceilingExpress: true, warp: 0.3, dayNoise: 0.35, itemLo: 0.3, itemHi: 1.1, family: { tap: 0.6, scale: 0.8, self: 0.7, taste: 0.7, ml: 0.8 }, acq: 0.3, des: 0.3, careless: 0.1, youngR: 0.7, expEffect: 0.3 },
};

function hash(...parts) { let h = 2166136261 >>> 0; for (const c of parts.join('|')) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
function rng(seed) {
  let a = seed >>> 0;
  const u = () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  u.normal = () => { let x = 0; while (x === 0) x = u(); return Math.sqrt(-2 * Math.log(x)) * Math.cos(2 * Math.PI * u()); };
  return u;
}

/** @param {string} name same | alt | research  @param {{seed:number, ids:string[], popSd?:number}} o */
function make(name, { seed, ids, popSd = 17 }) {
  const W = WORLDS[name];
  if (name !== 'same' && !W) throw new Error(`unknown world ${name}`);
  if (!W) return { on: false, name: 'same', expEffect: null };
  const C = ceilings();
  const worldRng = rng(hash('world', name, seed));
  // the world's structure: fixed per world and seed, never seen by any reader
  const cross = Object.fromEntries(ids.map((id) => {
    const k = 2 + Math.floor(worldRng() * 2); const others = [];
    while (others.length < k) { const o = ids[Math.floor(worldRng() * ids.length)]; if (o !== id && !others.some((x) => x[0] === o)) others.push([o, worldRng() < 0.5 ? -1 : 1]); }
    return [id, others];
  }));
  const warp = Object.fromEntries(ids.map((id) => [id, 1 + W.warp * (2 * worldRng() - 1)]));
  const desDir = Object.fromEntries(ids.map((id) => [id, worldRng() < 0.5 ? -1 : 1]));
  const expressOf = (id) => (W.ceilingExpress ? C[id].v : W.fixedExpress);
  const persons = new Map();
  function person(index) {
    if (persons.has(index)) return persons.get(index);
    const r = rng(hash('person', name, seed, index));
    const p = { quirk: Object.fromEntries(ids.map((id) => [id, r.normal()])), acq: r.normal() * W.acq, des: r.normal() * W.des, careless: r() < W.careless ? 0.5 : 0.03, day: rng(hash('day', name, seed, index)) };
    persons.set(index, p);
    return p;
  }
  /** The learner's behavioural standing per measure: what paramsFor sees. Keeps the 0-100 scale. */
  function express(T, index) {
    const p = person(index); const out = { ...T };
    for (const id of ids) {
      const a = expressOf(id); const z = (T[id] - 50) / popSd;
      const rest = Math.sqrt(Math.max(0, 1 - a * a));
      const mix = cross[id].reduce((s, [o, sign]) => s + sign * (T[o] - 50) / popSd, 0) / Math.sqrt(cross[id].length);
      const zx = a * (Math.sign(z) * Math.abs(z) ** warp[id]) + rest * (0.5 * mix + Math.sqrt(0.75) * p.quirk[id]);
      out[id] = Math.max(2, Math.min(98, 50 + popSd * zx));
    }
    return out;
  }
  /** That standing on one day: the state of the day on top. */
  function day(Tx, index) {
    const p = person(index); const out = { ...Tx };
    for (const id of ids) out[id] = Math.max(2, Math.min(98, Tx[id] + popSd * W.dayNoise * p.day.normal()));
    return out;
  }
  const itemCache = new Map();
  const itemScale = (itemId, family) => { const k = `${itemId}`; if (!itemCache.has(k)) { const r = rng(hash('item', name, seed, k)); itemCache.set(k, (W.family[family] || 1) * (W.itemLo + (W.itemHi - W.itemLo) * r())); } return itemCache.get(k); };
  /** Added to a sign-adjusted reading of a self-report item. */
  const style = (index, stat, sign, family) => { if (!['scale', 'self', 'tap'].includes(family)) return 0; const p = person(index); return (family === 'scale' ? sign * p.acq : 0) + desDir[stat] * p.des; };
  return { on: true, name, express, day, person, itemScale, style, carelessP: (index) => person(index).careless, youngMult: (band) => (band === '8-12' ? W.youngR : 1), expEffect: W.expEffect };
}

module.exports = { make, WORLDS, hash, rng };
