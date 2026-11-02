// Section 08 step 3: add the sources that passed check08.js to the evidence base and the article.
// A source counts only if all three hold: its quote is verbatim in the abstract, and both checkers rated it "supported".
// Sources rated "partly" or "not_supported" are listed as not added, with the checkers' reasons.
const fs = require('fs');
const path = require('path');
const D = path.join(__dirname, '..');
const checks = require('./checks08.json');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const real = Object.entries(checks).filter(([, x]) => !x.planted);
const pass = real.filter(([, x]) => x.verbatim && x.minimax && x.mistral && x.minimax.rating === 'supported' && x.mistral.rating === 'supported');
const fail = real.filter(([k]) => !pass.find(([p]) => p === k));
const sources = pass.map(([k, x]) => ({ id: `08-${k.toLowerCase()}${x.year}`, doi: x.doi, url: `https://doi.org/${x.doi}`, title: x.title, first_author: k, year: x.year, venue: x.venue, verified: true, verification: `DOI + quote (abstract from ${x.abstract_from}); minimax and mistral both "supported"`, quote: x.quote, used_for: x.claim, cited_in: `docs/${x.doc}.md` }));
fs.writeFileSync(path.join(D, '08-new-builds-sources.json'), JSON.stringify({ section: '08', generated: '2026-11-01', method: '08-work/check08.js and add08.js', count: sources.length, sources }, null, 1));

let h = fs.readFileSync(path.join(D, 'article.html'), 'utf8');
if (h.includes('id="sec-08"')) { console.log('article already has section 08'); process.exit(0); }
const n0 = 699; const q0 = 643; const doi0 = 601; const n1 = n0 + sources.length; const q1 = q0 + sources.length;
const swap = (a, b) => { if (!h.includes(a)) throw new Error('not found: ' + a); h = h.split(a).join(b); };
swap(`${n0} distinct sources &middot; ${q0} verified`, `${n1} distinct sources &middot; ${q1} verified`);
swap(`The evidence base is ${n0} distinct sources`, `The evidence base is ${n1} distinct sources`);
swap(`; ${q0} have a verbatim quote confirmed`, `; ${q1} have a verbatim quote confirmed`);
swap(`deduplicated by DOI or URL</td><td><b>${n0}</b>`, `deduplicated by DOI or URL</td><td><b>${n1}</b>`);
swap(`the three rows above)</td><td><b>${n0}</b>`, `the three rows above)</td><td><b>${n1}</b>`);
swap(`Verified by DOI and a verbatim quote</td><td>${doi0}<`, `Verified by DOI and a verbatim quote</td><td>${doi0 + sources.length}<`);

const P = '<p style="margin-left:27pt;text-indent:-27pt;margin-bottom:4pt;text-align:left">';
const rows = sources.map((s, i) => `<tr><td>[${n0 + i + 1}] ${esc(s.first_author)} (${s.year})</td><td>${esc(s.used_for)}</td><td>"${esc(s.quote)}"</td><td>${esc(s.cited_in)}</td></tr>`).join('');
const notAdded = fail.map(([k, x]) => `<li>${esc(k)} (${esc(x.year || '')}): ${x.verbatim ? '' : 'no verbatim quote found; '}minimax ${esc(x.minimax && x.minimax.rating)}, mistral ${esc(x.mistral && x.mistral.rating)}. ${esc((x.minimax && x.minimax.problem) || '')}</li>`).join('');
const section = `<h2 id="sec-08">08. Sources added on 1 November 2026</h2>
<p>The builds of 1 November 2026 (scorecard round 9 in docs/SCORECARD-EVERYTHING.md, the speed levers in docs/SPEED-RETENTION.md, and the beta comparison in docs/BETA-COMPARISON.md) cite 36 published works. 22 were already in the evidence base. The other 14 were checked the same way as sections 06 and 07:</p>
<ul><li>each was resolved on OpenAlex to its DOI record and abstract;</li><li>a free model picked a supporting sentence, and the code confirmed it appears word for word in the abstract;</li><li>two free models from different families (MiniMax M3.1 Flash and Mistral Large) rated the claim against the abstract separately;</li><li>4 planted errors (a real claim paired with another source's abstract) were mixed in, and both checkers caught all 4.</li></ul>
<p>${sources.length} passed all three tests and are added below (for 3 of them, Aleven, Baker and Crossley, only after their claims were narrowed to what the abstract shows, using the checkers' own suggested fixes, and checked again from scratch; the scorecard doc's wording was narrowed to match) as references ${n0 + 1} to ${n1}. The ${fail.length} that did not are listed after the table and are not counted. The mechanisms these sources back belong to the 1 November builds; they are not part of the 309 mechanisms audited above.</p>
<table><tr><th>Source</th><th>What it is used for</th><th>Verbatim quote</th><th>Cited in</th></tr>${rows}</table>
<p>Not added (not counted):</p><ul>${notAdded}</ul>
`;
const hStart = h.indexOf('<h1><a name="references"></a>References</h1>');
if (hStart < 0) throw new Error('no References heading');
h = h.slice(0, hStart) + section + h.slice(hStart);
const refs = sources.map((s, i) => `${P}${n0 + i + 1}.&nbsp;<a name="ref-${n0 + i + 1}"></a>${esc(s.first_author)} et al. (${s.year}). ${esc(s.title)}. <i>${esc(s.venue || '')}</i>. <a href="${s.url}">${s.url}</a>. <b>Verified:</b> DOI + quote. Ids: ${s.id}. Cited in: 08.</p>`).join('');
h = h.replace('</body></html>', refs + '</body></html>');
fs.copyFileSync(path.join(D, 'article.html'), path.join(__dirname, 'article.before-08.html'));
fs.writeFileSync(path.join(D, 'article.html'), h);
console.log(`added ${sources.length}: total ${n1} distinct sources, ${q1} with a verbatim quote; not added ${fail.length}: ${fail.map(([k]) => k).join(', ')}`);
