// Section 07 step 1 (Semantic Scholar): OpenAlex's free daily budget for this IP was used up on 29 Oct, so the
// candidates come from Semantic Scholar's public API instead, slowly, with retries on 429. Seeds are looked up
// by title; each query adds its top results. Only works with an abstract. Same output shape as search.js.
const fs = require('fs');
const path = require('path');
const mechs = require('./mechanisms.json');
const OUT = path.join(__dirname, 'candidates.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = { 'user-agent': 'savant-evidence-check/1.0 (mailto:savant@example.com)' };
const FIELDS = 'title,year,abstract,externalIds,authors,venue,citationCount,publicationTypes';
const norm = (s) => String(s || '').toLowerCase().replace(/<[^>]+>/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const sim = (a, b) => { const A = new Set(norm(a).split(' ')); const B = new Set(norm(b).split(' ')); let n = 0; for (const x of A) if (B.has(x)) n++; return n / Math.max(A.size, B.size, 1); };

async function getJson(url) {
  for (let a = 0; a < 8; a++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30000) });
      if (r.status === 429) { await sleep(4000 + a * 3000); continue; }
      if (!r.ok) return null;
      return await r.json();
    } catch { await sleep(3000); }
  }
  return null;
}
const toCand = (w) => ({
  s2: w.paperId,
  doi: w.externalIds && w.externalIds.DOI ? String(w.externalIds.DOI).toLowerCase() : null,
  title: w.title,
  year: w.year,
  first_author: w.authors && w.authors[0] ? w.authors[0].name : null,
  venue: w.venue || null,
  type: (w.publicationTypes || []).join(',').toLowerCase() || null,
  cited_by: w.citationCount,
  abstract: w.abstract || '',
  abstract_src: 'semanticscholar',
});
const search = (q, n) => getJson(`https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(q)}&limit=${n}&fields=${FIELDS}`);

(async () => {
  const out = fs.existsSync(OUT) ? require(OUT) : {};
  for (const m of mechs) {
    if (out[m.id] && out[m.id].length) continue;
    const found = new Map();
    for (const t of m.seeds) {
      const j = await search(t, 5);
      const best = ((j && j.data) || []).map((w) => ({ w, s: sim(w.title, t) })).sort((a, b) => b.s - a.s)[0];
      if (best && best.s >= 0.6) { const c = toCand(best.w); c.seed = true; found.set(c.s2, c); } else console.log(`  ${m.id} seed not found: ${t}`);
      await sleep(2500);
    }
    for (const q of m.queries) {
      const j = await search(q, 8);
      for (const w of (j && j.data) || []) if (!found.has(w.paperId)) found.set(w.paperId, toCand(w));
      await sleep(2500);
    }
    out[m.id] = [...found.values()].filter((c) => c.abstract && c.abstract.length > 200).map((c, i) => ({ cid: `${m.id}-c${i + 1}`, ...c }));
    console.log(`${m.id}: ${out[m.id].length} candidates with abstracts (${out[m.id].filter((c) => c.seed).length} seeds)`);
    fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  }
})();
