// Section 07 step 3: every DOI on Crossref. Title, first author and year must match what the picks say.
// Adds { crossref: { ok, title, first_author, year_print, year_issued, venue, issues } } to each pick in picks.json.
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'picks.json');
const picks = require(OUT);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = { 'user-agent': 'savant-evidence-check/1.0 (mailto:savant@example.com)' };
const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/<[^>]+>/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const sim = (a, b) => { const A = new Set(norm(a).split(' ')); const B = new Set(norm(b).split(' ')); let n = 0; for (const x of A) if (B.has(x)) n++; return n / Math.max(Math.min(A.size, B.size), 1); };
const cache = {};

async function crossref(doi) {
  if (cache[doi] !== undefined) return cache[doi];
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, { headers: UA, signal: AbortSignal.timeout(30000) });
      if (r.status === 404) return (cache[doi] = null);
      if (r.ok) return (cache[doi] = (await r.json()).message);
    } catch { /* retry */ }
    await sleep(2000);
  }
  return (cache[doi] = null);
}

(async () => {
  for (const [mid, m] of Object.entries(picks)) {
    for (const p of m.picks) {
      if (!p.doi) { p.crossref = { ok: !!p.url, official_url: p.url, issues: p.url ? [] : ['no DOI and no URL'] }; continue; }
      const c = await crossref(p.doi);
      if (!c) { p.crossref = { ok: false, issues: ['DOI not found on Crossref'] }; console.log(mid, p.doi, 'NOT ON CROSSREF'); continue; }
      const title = String((c.title || [''])[0]).replace(/<[^>]+>/g, '');
      const fam = c.author && c.author[0] ? c.author[0].family : '';
      const yp = (c['published-print'] || {})['date-parts'];
      const yi = (c.issued || {})['date-parts'];
      const issues = [];
      if (sim(title, p.title) < 0.7) issues.push(`title differs: "${title.slice(0, 80)}"`);
      if (fam && p.first_author && !norm(p.first_author).includes(norm(fam))) issues.push(`first author ${fam} vs ${p.first_author}`);
      const years = [yp && yp[0][0], yi && yi[0][0]].filter(Boolean);
      if (p.year && years.length && !years.includes(p.year)) issues.push(`year ${p.year} vs Crossref ${years.join('/')}`);
      p.crossref = { ok: !issues.length, title, first_author: fam, year_print: yp && yp[0][0], year_issued: yi && yi[0][0], venue: (c['container-title'] || [''])[0], type: c.type, issues };
      if (issues.length) console.log(mid, p.doi, issues.join('; '));
      await sleep(150);
    }
  }
  fs.writeFileSync(OUT, JSON.stringify(picks, null, 1));
  const all = Object.values(picks).flatMap((m) => m.picks);
  console.log(`checked ${all.length}: ${all.filter((p) => p.crossref.ok).length} match, ${all.filter((p) => !p.crossref.ok).length} with issues`);
})();
