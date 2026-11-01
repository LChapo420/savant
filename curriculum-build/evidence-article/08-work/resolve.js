// Section 08 step 1: resolve the works cited by the 1 Nov builds (speed levers, scorecard round 9, beta comparison)
// on OpenAlex, keep the DOI, title and abstract, and mark which are already in the evidence base. No model calls.
const fs = require('fs');
const path = require('path');
const D = path.join(__dirname, '..');
const CITES = [
  ['SPEED-RETENTION', 'Averell', 2011, 'form of the forgetting curve'],
  ['SPEED-RETENTION', 'Brunmair', 2019, 'similarity matters meta-analysis interleaved learning'],
  ['SPEED-RETENTION', 'Cepeda', 2006, 'distributed practice in verbal recall tasks review quantitative synthesis'],
  ['SPEED-RETENTION', 'Cepeda', 2008, 'spacing effects in learning temporal ridgeline optimal retention'],
  ['SPEED-RETENTION', 'Donovan', 1999, 'meta-analytic review of the distribution of practice effect'],
  ['SPEED-RETENTION', 'Kalyuga', 2003, 'expertise reversal effect'],
  ['SPEED-RETENTION', 'Karpicke', 2008, 'critical importance of retrieval for learning'],
  ['SPEED-RETENTION', 'Koedinger', 2012, 'knowledge-learning-instruction framework'],
  ['SPEED-RETENTION', 'Kornell', 2009, 'unsuccessful retrieval attempts enhance subsequent learning'],
  ['SPEED-RETENTION', 'Kulik', 1990, 'effectiveness of mastery learning programs meta-analysis'],
  ['SPEED-RETENTION', 'Newell', 1981, 'mechanisms of skill acquisition and the law of practice'],
  ['SPEED-RETENTION', 'Pavlik', 2008, 'using a model to compute the optimal schedule of practice'],
  ['SPEED-RETENTION', 'Pyc', 2009, 'testing the retrieval effort hypothesis'],
  ['SPEED-RETENTION', 'Rawson', 2011, 'optimizing schedules of retrieval practice durable learning'],
  ['SPEED-RETENTION', 'Rohrer', 2015, 'interleaved practice improves mathematics learning'],
  ['SPEED-RETENTION', 'Rowland', 2014, 'effect of testing versus restudy on retention meta-analytic review'],
  ['SPEED-RETENTION', 'Settles', 2016, 'trainable spaced repetition model for language learning'],
  ['SPEED-RETENTION', 'Tetzlaff', 2025, 'adaptive learning'],
  ['SPEED-RETENTION', 'Wilson', 2019, 'eighty five percent rule for optimal learning'],
  ['SPEED-RETENTION', 'Wixted', 1991, 'on the form of forgetting'],
  ['SCORECARD-EVERYTHING', 'Aleven', 2006, 'toward meta-cognitive tutoring help-seeking'],
  ['SCORECARD-EVERYTHING', 'Baker', 2007, 'modeling and understanding students off-task behavior'],
  ['SCORECARD-EVERYTHING', "D'Mello", 2012, 'dynamics of affective states during complex learning'],
  ['SCORECARD-EVERYTHING', 'Graesser', 1994, 'question asking during tutoring'],
  ['SCORECARD-EVERYTHING', 'Lally', 2010, 'how are habits formed modelling habit formation real world'],
  ['SCORECARD-EVERYTHING', 'Epp', 2011, 'identifying emotional states using keystroke dynamics'],
  ['SCORECARD-EVERYTHING', 'Niederhoffer', 2002, 'linguistic style matching in social interaction'],
  ['SCORECARD-EVERYTHING', 'Park', 2015, 'automatic personality assessment through social media language'],
  ['SCORECARD-EVERYTHING', 'Pennebaker', 1999, 'linguistic styles language use as an individual difference'],
  ['SCORECARD-EVERYTHING', 'Peters', 2024, 'large language models can infer psychological dispositions of social media users'],
  ['SCORECARD-EVERYTHING', 'Ryan', 2000, 'self-determination theory facilitation of intrinsic motivation'],
  ['SCORECARD-EVERYTHING', 'Crossley', 2012, 'predicting the proficiency level of language learners using lexical indices'],
  ['SCORECARD-EVERYTHING', 'Tausczik', 2010, 'psychological meaning of words LIWC computerized text analysis'],
  ['SCORECARD-EVERYTHING', 'Yarkoni', 2010, 'personality in 100,000 words'],
  ['BETA-COMPARISON', 'Johari', 2017, 'peeking at A/B tests always valid inference'],
  ['BETA-COMPARISON', 'Robbins', 1970, 'statistical methods related to the law of the iterated logarithm'],
];
const have = new Set();
for (const f of fs.readdirSync(D).filter((x) => x.endsWith('-sources.json'))) {
  const j = JSON.parse(fs.readFileSync(path.join(D, f), 'utf8'));
  const lists = j.sources ? [j.sources] : Object.values(j).map((v) => (Array.isArray(v) ? v : Object.values(v).find(Array.isArray) || []));
  for (const l of lists) for (const s of l) if (s.doi) have.add(String(s.doi).toLowerCase().replace(/^https?:\/\/doi\.org\//, ''));
}
const abs = (inv) => { if (!inv) return ''; const w = []; for (const [t, ps] of Object.entries(inv)) for (const p of ps) w[p] = t; return w.join(' '); };
(async () => {
  const out = [];
  for (const [doc, author, year, hint] of CITES) {
    const u = `https://api.openalex.org/works?search=${encodeURIComponent(hint)}&filter=publication_year:${year - 1}-${year + 1}&per-page=5&mailto=savant-audit@example.invalid`;
    let r; try { r = await (await fetch(u)).json(); } catch (e) { out.push({ doc, author, year, error: String(e) }); continue; }
    const hit = (r.results || []).find((w) => (w.authorships || []).some((a) => (a.author.display_name || '').toLowerCase().includes(author.toLowerCase().replace(/'/g, '')))) || null;
    if (!hit) { out.push({ doc, author, year, hint, found: false }); continue; }
    const doi = (hit.doi || '').toLowerCase().replace(/^https?:\/\/doi\.org\//, '');
    out.push({ doc, author, year: hit.publication_year, title: hit.display_name, doi, venue: hit.primary_location && hit.primary_location.source && hit.primary_location.source.display_name, already: doi ? have.has(doi) : false, abstract: abs(hit.abstract_inverted_index) });
    await new Promise((s) => setTimeout(s, 150));
  }
  fs.writeFileSync(path.join(__dirname, 'resolved.json'), JSON.stringify(out, null, 1));
  console.log('existing DOIs', have.size);
  for (const o of out) console.log([o.already ? 'HAVE' : o.found === false ? 'NOTFOUND' : o.doi ? 'NEW ' : 'NODOI', o.author, o.year, (o.title || o.hint || '').slice(0, 60), o.abstract ? 'abs' + o.abstract.length : 'noabs'].join(' | '));
})();
