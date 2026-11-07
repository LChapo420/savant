/**
 * Plain-text textbooks as a source (brief fact-100): OpenStax books in offline-sources/openstax, as pdftotext output, searched by BM25 in memory. Checking only: their text is never shown to a learner.
 *   search(claim, { track, k })  -> [{ source, title, text, score }]
 * FACT_TEXTBOOKS_DIR points at the folder. No model, no network.
 */
const fs = require('fs');
const path = require('path');

const DIR = () => process.env.FACT_TEXTBOOKS_DIR || path.join(__dirname, '..', '..', 'offline-sources', 'openstax');
const BOOKS = {
  'Prealgebra-OP_oYhyXVE': { title: 'OpenStax Prealgebra', tracks: ['math'] },
  'ElementaryAlgebra-OP_Ft8T0ij': { title: 'OpenStax Elementary Algebra', tracks: ['math'] },
  'IntermediateAlgebra-OP_TyKO63g': { title: 'OpenStax Intermediate Algebra', tracks: ['math'] },
  'CollegeAlgebra-OP': { title: 'OpenStax College Algebra', tracks: ['math'] },
};
const STOP = new Set('a an the and or but if then than of to in on at by for with from into is are was were be been it its this that these those as not no so can you your we they he she i do does did has have had will would should could may might must which who what when where how why there here all any each one two'.split(' '));
const tokenize = (t) => (String(t).toLowerCase().match(/[a-z0-9^=+/-]+/g) || []).filter((w) => w.length > 1 && !STOP.has(w));

let index = null;
function load() {
  if (index) return index;
  const docs = []; const postings = new Map(); const df = new Map();
  for (const [file, meta] of Object.entries(BOOKS)) {
    const f = path.join(DIR(), `${file}.txt`);
    if (!fs.existsSync(f)) continue;
    const raw = fs.readFileSync(f, 'utf8').replace(/[ \t]+/g, ' ').replace(/-\n\s*/g, '').replace(/\f/g, '\n\n');
    // Windows of a few sentences, overlapping by one, from paragraphs of real prose.
    const paras = raw.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim()).filter((p) => p.length > 60 && /[a-z]{3}/.test(p) && !/^(Access for free|Figure \d)/.test(p));
    for (const p of paras) {
      const sents = p.split(/(?<=[.!?:])\s+/);
      for (let i = 0; i < sents.length; i += 3) {
        const text = sents.slice(i, i + 4).join(' ').slice(0, 800);
        if (text.length < 50) continue;
        const id = docs.length;
        const toks = tokenize(text);
        docs.push({ title: meta.title, tracks: meta.tracks, text, len: toks.length });
        const tf = new Map();
        for (const t of toks) tf.set(t, (tf.get(t) || 0) + 1);
        for (const [t, n] of tf) { if (!postings.has(t)) postings.set(t, []); postings.get(t).push([id, n]); df.set(t, (df.get(t) || 0) + 1); }
      }
    }
  }
  const avg = docs.reduce((a, d) => a + d.len, 0) / Math.max(1, docs.length);
  index = { docs, postings, df, avg };
  return index;
}

function search(claim, { track = null, k = 3 } = {}) {
  const { docs, postings, df, avg } = load();
  if (!docs.length) return [];
  const score = new Map();
  for (const t of new Set(tokenize(claim))) {
    const list = postings.get(t); if (!list) continue;
    const idf = Math.log(1 + (docs.length - df.get(t) + 0.5) / (df.get(t) + 0.5));
    for (const [id, n] of list) {
      const d = docs[id];
      if (track && !d.tracks.includes(track)) continue;
      const s = idf * (n * 2.2) / (n + 1.2 * (0.25 + 0.75 * d.len / avg));
      score.set(id, (score.get(id) || 0) + s);
    }
  }
  return [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, k).map(([id, s]) => ({ source: 'textbook', title: docs[id].title, text: docs[id].text, score: +s.toFixed(2) }));
}
const size = () => load().docs.length;

module.exports = { search, size, BOOKS };
