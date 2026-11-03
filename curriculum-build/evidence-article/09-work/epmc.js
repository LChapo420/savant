// usage: node epmc.js "query" [n]  -> prints Europe PMC hits: doi, first author, year, journal, title, abstract (first 500 chars)
const q = process.argv[2]; const n = Number(process.argv[3] || 3); const full = process.argv[4] === 'full';
(async () => {
  const j = await (await fetch(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(q)}&resultType=core&format=json&pageSize=${n}`)).json();
  for (const r of (j.resultList && j.resultList.result) || []) {
    console.log(`- ${r.doi} | ${r.authorString ? r.authorString.split(',')[0] : ''} | ${r.pubYear} | ${r.journalTitle} | ${r.title}`);
    const a = String(r.abstractText || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    console.log('  ' + (full ? a : a.slice(0, 600)));
  }
})();
