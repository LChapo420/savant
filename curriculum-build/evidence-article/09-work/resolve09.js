// Section 09 step 1: resolve each candidate through Crossref (DOI, title, first author, year, venue) and fetch its abstract
// (Crossref, then OpenAlex, then Semantic Scholar). No model calls. A candidate only goes on if title, first author and year match.
const fs = require('fs');
const path = require('path');
const cands = require('./cand.js');
const OUT = path.join(__dirname, 'resolved09.json');
const out = fs.existsSync(OUT) ? require(OUT) : {};
const norm = (s) => String(s || '').toLowerCase().replace(/<[^>]+>/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
const sim = (a, b) => { const A = new Set(norm(a).split(' ')); const B = new Set(norm(b).split(' ')); let i = 0; for (const w of A) if (B.has(w)) i++; return i / Math.max(A.size, B.size); };
const abs = (inv) => { if (!inv) return ''; const w = []; for (const [t, ps] of Object.entries(inv)) for (const p of ps) w[p] = t; return w.join(' '); };
const clean = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/^\s*abstract\s*/i, '').trim();
const get = async (u) => { for (let i = 0; i < 3; i++) { try { const r = await fetch(u, { headers: { 'User-Agent': 'savant-evidence-audit (mailto:savant-audit@example.invalid)' } }); if (r.ok) return await r.json(); if (r.status === 404) return null; } catch (e) { /* retry */ } await new Promise((s) => setTimeout(s, 1500)); } return null; };
(async () => {
  for (const [key, fam, year, title, area] of cands) {
    if (out[key] && (out[key].doi || out[key].found === false) && !process.argv.includes('--redo')) continue;
    const u = `https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(`${title} ${fam} ${year}`)}&rows=6&select=DOI,title,author,issued,container-title,abstract,type&mailto=savant-audit@example.invalid`;
    const j = await get(u); const items = (j && j.message && j.message.items) || [];
    let best = null; let bs = 0;
    for (const it of items) {
      const t = (it.title || [''])[0]; const y = it.issued && it.issued['date-parts'] && it.issued['date-parts'][0][0];
      const fa = (it.author && it.author[0] && (it.author[0].family || '')) || '';
      const s = sim(title, t) + (norm(fa).includes(norm(fam).split(' ').pop()) ? 0.5 : 0) + (Math.abs((y || 0) - year) <= 1 ? 0.3 : 0);
      if (s > bs) { bs = s; best = { doi: it.DOI, title: t, first_author: fa, year: y, venue: (it['container-title'] || [''])[0], type: it.type, cr_abstract: clean(it.abstract), score: +s.toFixed(2), ts: +sim(title, t).toFixed(2) }; }
    }
    if (!best) { out[key] = { key, area, fam, year, query: title, found: false }; console.log('NOTFOUND', key); continue; }
    let abstract = best.cr_abstract; let from = abstract ? 'crossref' : '';
    if (!abstract) { const o = await get(`https://api.openalex.org/works/doi:${best.doi}?mailto=savant-audit@example.invalid`); if (o && o.abstract_inverted_index) { abstract = abs(o.abstract_inverted_index); from = 'openalex'; } }
    if (!abstract) { const e = await get(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=DOI:%22${encodeURIComponent(best.doi)}%22&resultType=core&format=json`); const a = e && e.resultList && e.resultList.result && e.resultList.result[0] && e.resultList.result[0].abstractText; if (a) { abstract = clean(a); from = 'europepmc'; } }
    if (!abstract) { const s2 = await get(`https://api.semanticscholar.org/graph/v1/paper/DOI:${best.doi}?fields=abstract`); if (s2 && s2.abstract) { abstract = s2.abstract; from = 'semanticscholar'; } await new Promise((s) => setTimeout(s, 1200)); }
    out[key] = { key, area, fam, year: best.year, query: title, doi: best.doi.toLowerCase(), title: best.title, first_author: best.first_author, venue: best.venue, type: best.type, score: best.score, title_sim: best.ts, abstract, abstract_from: from };
    console.log(key.padEnd(18), best.score, best.ts, best.first_author, best.year, (best.title || '').slice(0, 60), '|', best.doi, '|', from || 'NOABS');
    fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
    await new Promise((s) => setTimeout(s, 150));
  }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
})();
