/** A small made-up sentence pool in the spanish-check pool.json shape, so the participant tests run without the real (gitignored) pool. */
const crypto = require('crypto');

const rngFor = (seed) => { let a = parseInt(crypto.createHash('sha256').update(seed).digest('hex').slice(0, 8), 16); return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const SYL = ['ba', 'ko', 'mi', 'ra', 'su', 'te', 'lo', 'pa', 'ni', 'do', 'fe', 'gu', 'ha', 'ju', 'vi', 'ze'];
const word = (r) => { let w = ''; const n = 2 + Math.floor(r() * 2); for (let i = 0; i < n; i++) w += SYL[Math.floor(r() * SYL.length)]; return w; };
const sentence = (r, n) => Array.from({ length: n }, () => word(r)).join(' ');

function makePool({ itemsPerStratum = 60, distractorsPerStratum = 500 } = {}) {
  const entries = [];
  let id = 1000;
  const r = rngFor('study-test-fixture');
  for (const stratum of ['easy', 'medium', 'hard']) {
    const words = stratum === 'easy' ? 5 : stratum === 'medium' ? 6 : 7;
    for (let i = 0; i < itemsPerStratum; i++) {
      const es = sentence(r, words); const en = sentence(r, words);
      entries.push({ id: id++, key: `${stratum}-${i}-${es}`, text: `${es}.`, words, difficulty: 1, stratum, role: 'item', audio: { audio_id: id + 50000, user: 'fixture', license: 'CC BY 2.0 FR' }, en: { id: id + 90000, text: `${en}.` }, listen: i % 2 === 0, read: i % 2 === 1 });
    }
    for (let i = 0; i < distractorsPerStratum; i++) {
      const es = sentence(r, words); const en = sentence(r, words - 1 + Math.floor(r() * 3));
      entries.push({ id: id++, key: `${stratum}-d${i}-${es}`, text: `${es}.`, words, difficulty: 1, stratum, role: 'distractor', en: { id: id + 90000, text: `${en}.` }, listen: false, read: false });
    }
  }
  const tally = (pred) => { const t = { easy: 0, medium: 0, hard: 0 }; for (const e of entries) if (pred(e)) t[e.stratum]++; return t; };
  const L = tally((e) => e.listen); const R = tally((e) => e.read);
  const share = (t) => Object.fromEntries(Object.keys(t).map((s) => [s, t[s] / (t.easy + t.medium + t.hard)]));
  return { meta: { spec: 'fixture', pool_sizes: { listening: L, reading: R }, strata_weights: { listening: share(L), reading: share(R) } }, entries };
}

module.exports = { makePool };
