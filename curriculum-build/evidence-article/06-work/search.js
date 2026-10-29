// Section 06 step 1: candidate sources for every mechanism, from OpenAlex (free, no model).
// Seeds are looked up by title; each query adds its top results. Only works with an abstract.
// Writes candidates.json { mechId: [ { cid, doi, title, year, first_author, venue, type, cited_by, abstract } ] }.
const fs = require('fs');
const path = require('path');
const mechs = require('./mechanisms.json');
const OUT = path.join(__dirname, 'candidates.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = { 'user-agent': 'savant-evidence-check/1.0 (mailto:savant@example.com)' };

const deInvert = (inv) => { if (!inv) return ''; const w = []; for (const [word, pos] of Object.entries(inv)) for (const p of pos) w[p] = word; return w.filter(Boolean).join(' '); };
const norm = (s) => String(s || '').toLowerCase().replace(/<[^>]+>/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const sim = (a, b) => { const A = new Set(norm(a).split(' ')); const B = new Set(norm(b).split(' ')); let n = 0; for (const x of A) if (B.has(x)) n++; return n / Math.max(A.size, B.size, 1); };

async function getJson(url) {
  for (let a = 0; a < 4; a++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30000) });
      if (r.status === 429) { await sleep(3000 * (a + 1)); continue; }
      if (!r.ok) return null;
      return await r.json();
    } catch { await sleep(1500); }
  }
  return null;
}

const SEL = 'id,doi,title,publication_year,authorships,primary_location,type,cited_by_count,abstract_inverted_index';
const toCand = (w) => ({
  oa: w.id,
  doi: w.doi ? w.doi.replace('https://doi.org/', '').toLowerCase() : null,
  title: w.title,
  year: w.publication_year,
  first_author: w.authorships && w.authorships[0] ? w.authorships[0].author.display_name : null,
  venue: w.primary_location && w.primary_location.source ? w.primary_location.source.display_name : null,
  type: w.type,
  cited_by: w.cited_by_count,
  abstract: deInvert(w.abstract_inverted_index),
});

(async () => {
  const out = fs.existsSync(OUT) ? require(OUT) : {};
  for (const m of mechs) {
    if (out[m.id] && out[m.id].length) continue;
    const found = new Map();
    for (const t of m.seeds) {
      const j = await getJson(`https://api.openalex.org/works?search=${encodeURIComponent(t)}&per-page=5&select=${SEL}`);
      const best = (j && j.results || []).map((w) => ({ w, s: sim(w.title, t) })).sort((a, b) => b.s - a.s)[0];
      if (best && best.s >= 0.6) { const c = toCand(best.w); c.seed = true; found.set(c.oa, c); } else console.log(`  ${m.id} seed not found: ${t}`);
      await sleep(150);
    }
    for (const q of m.queries) {
      const j = await getJson(`https://api.openalex.org/works?search=${encodeURIComponent(q)}&filter=has_abstract:true,type:article|review|book-chapter&sort=relevance_score:desc&per-page=8&select=${SEL}`);
      for (const w of (j && j.results) || []) if (!found.has(w.id)) found.set(w.id, toCand(w));
      await sleep(150);
    }
    out[m.id] = [...found.values()].filter((c) => c.abstract && c.abstract.length > 200).map((c, i) => ({ cid: `${m.id}-c${i + 1}`, ...c }));
    console.log(`${m.id}: ${out[m.id].length} candidates with abstracts (${out[m.id].filter((c) => c.seed).length} seeds)`);
    fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  }
})();
