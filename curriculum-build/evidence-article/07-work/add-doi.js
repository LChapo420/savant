// Section 07 step 1b: add named papers by DOI to mechanisms' candidates, with an abstract from
// OpenAlex, Semantic Scholar, Crossref or Europe PMC (free). Usage: node add-doi.js
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'candidates.json');
const cands = require(OUT);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = { 'user-agent': 'savant-evidence-check/1.0 (mailto:savant@example.com)' };
const ADD = {
  // filled from 07-work/mechanisms.json seeds once the own-material mechanisms are known: 'doi': ['07-Mn', ...]
};
const deInvert = (inv) => { if (!inv) return ''; const w = []; for (const [word, pos] of Object.entries(inv)) for (const p of pos) w[p] = word; return w.filter(Boolean).join(' '); };
async function getJson(url) {
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30000) });
      if (r.status === 429) { await sleep(3000 * (a + 1)); continue; }
      if (!r.ok) return null;
      return await r.json();
    } catch { await sleep(1500); }
  }
  return null;
}
(async () => {
  for (const [doi, mids] of Object.entries(ADD)) {
    const w = await getJson(`https://api.openalex.org/works/doi:${doi}`);
    let abstract = w ? deInvert(w.abstract_inverted_index) : '';
    let src = 'openalex';
    if (abstract.length < 200) { const s = await getJson(`https://api.semanticscholar.org/graph/v1/paper/DOI:${doi}?fields=abstract`); if (s && s.abstract) { abstract = s.abstract; src = 'semanticscholar'; } }
    if (abstract.length < 200) { const c = await getJson(`https://api.crossref.org/works/${encodeURIComponent(doi)}`); const a = c && c.message && c.message.abstract; if (a) { abstract = a.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); src = 'crossref'; } }
    if (abstract.length < 200) { const e = await getJson(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=DOI:"${doi}"&resultType=core&format=json`); const r = e && e.resultList && e.resultList.result[0]; if (r && r.abstractText) { abstract = r.abstractText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); src = 'europepmc'; } }
    const base = w ? {
      oa: w.id, doi, title: w.title, year: w.publication_year,
      first_author: w.authorships && w.authorships[0] ? w.authorships[0].author.display_name : null,
      venue: w.primary_location && w.primary_location.source ? w.primary_location.source.display_name : null,
      type: w.type, cited_by: w.cited_by_count,
    } : { doi };
    console.log(doi, '|', (base.title || '?').slice(0, 60), '|', abstract.length, src);
    if (abstract.length < 200) continue;
    for (const m of mids) {
      const list = cands[m] || (cands[m] = []);
      if (list.some((c) => c.doi === doi)) continue;
      list.push({ cid: `${m}-c${list.length + 1}`, ...base, abstract, abstract_src: src, seed: true });
    }
    await sleep(300);
  }
  fs.writeFileSync(OUT, JSON.stringify(cands, null, 1));
})();
