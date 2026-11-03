// usage: node bydoi.js key=doi key=doi ... : (re)resolve a candidate by an explicit DOI via Crossref + abstract chain
const fs = require('fs'); const OUT = './resolved09.json'; const out = require(OUT);
const clean = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/^\s*abstract\s*/i, '').trim();
const abs = (inv) => { if (!inv) return ''; const w = []; for (const [t, ps] of Object.entries(inv)) for (const p of ps) w[p] = t; return w.join(' '); };
const get = async (u) => { try { const r = await fetch(u, { headers: { 'User-Agent': 'savant-evidence-audit (mailto:savant-audit@example.invalid)' } }); return r.ok ? await r.json() : null; } catch { return null; } };
(async () => {
  for (const kv of process.argv.slice(2)) {
    const [key, doi] = kv.split('='); const j = await get(`https://api.crossref.org/works/${encodeURIComponent(doi)}?mailto=savant-audit@example.invalid`);
    if (!j) { console.log('NO CROSSREF', key, doi); continue; }
    const m = j.message; const it = out[key] || { key };
    let abstract = clean(m.abstract); let from = abstract ? 'crossref' : '';
    if (!abstract) { const o = await get(`https://api.openalex.org/works/doi:${doi}`); if (o && o.abstract_inverted_index) { abstract = abs(o.abstract_inverted_index); from = 'openalex'; } }
    if (!abstract) { const e = await get(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=DOI:%22${encodeURIComponent(doi)}%22&resultType=core&format=json`); const a = e && e.resultList && e.resultList.result && e.resultList.result[0] && e.resultList.result[0].abstractText; if (a) { abstract = clean(a); from = 'europepmc'; } }
    if (!abstract) { await new Promise((s) => setTimeout(s, 2500)); const s2 = await get(`https://api.semanticscholar.org/graph/v1/paper/DOI:${doi}?fields=abstract`); if (s2 && s2.abstract) { abstract = s2.abstract; from = 'semanticscholar'; } }
    Object.assign(it, { doi: doi.toLowerCase(), title: (m.title || [''])[0], first_author: (m.author && m.author[0] && m.author[0].family) || '', year: m.issued && m.issued['date-parts'][0][0], venue: (m['container-title'] || [''])[0], type: m.type, abstract, abstract_from: from, doi_override: true });
    out[key] = it; console.log(key, it.first_author, it.year, it.title.slice(0, 70), '|', it.venue, '|', from || 'NOABS');
  }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
})();
