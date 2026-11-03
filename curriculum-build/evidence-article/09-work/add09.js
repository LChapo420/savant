// Section 09 step 3: add the section and its new sources to article.html the way add08.js did for section 08. Counts come from the real file, not from constants.
const fs = require('fs');
const path = require('path');
const D = path.join(__dirname, '..');
const R = require('./resolved09.json');
const M = require('./claims09.js');
const V = require('./validity-scenarios.json');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
let h = fs.readFileSync(path.join(D, 'article.html'), 'utf8');
if (h.includes('id="sec-09"')) { console.log('article already has section 09'); process.exit(0); }
const hl = h.toLowerCase();
const J = JSON.parse(fs.readFileSync(path.join(D, '09-nov3-builds-sources.json'), 'utf8'));
const fresh = J.sources.filter((s) => !hl.includes(String(s.doi).toLowerCase()));
const n0 = Number(/(\d+) distinct sources &middot; \d+ verified/.exec(h)[1]);
const q0 = Number(/\d+ distinct sources &middot; (\d+) verified/.exec(h)[1]);
const doi0 = Number(/Verified by DOI and a verbatim quote<\/td><td>(\d+)</.exec(h)[1]);
const k = fresh.length; const n1 = n0 + k; const q1 = q0 + k;
const swap = (a, b) => { if (!h.includes(a)) throw new Error('not found: ' + a); h = h.split(a).join(b); };
swap(`${n0} distinct sources &middot; ${q0} verified`, `${n1} distinct sources &middot; ${q1} verified`);
swap(`The evidence base is ${n0} distinct sources`, `The evidence base is ${n1} distinct sources`);
swap(`; ${q0} have a verbatim quote confirmed`, `; ${q1} have a verbatim quote confirmed`);
swap(`deduplicated by DOI or URL</td><td><b>${n0}</b>`, `deduplicated by DOI or URL</td><td><b>${n1}</b>`);
swap(`the three rows above)</td><td><b>${n0}</b>`, `the three rows above)</td><td><b>${n1}</b>`);
swap(`Verified by DOI and a verbatim quote</td><td>${doi0}<`, `Verified by DOI and a verbatim quote</td><td>${doi0 + k}<`);

const P = '<p style="margin-left:27pt;text-indent:-27pt;margin-bottom:4pt;text-align:left">';
const counted = (m) => m.sources.filter((s) => s.counts).length;
const mechRows = M.map((m) => `<tr><td>${m.id}</td><td>${esc(m.name)}</td><td>${counted(m)}</td><td>${esc(m.verdict.split(/[:;(]/)[0].trim())}</td><td>${esc(m.match.split('. ')[0])}.</td></tr>`).join('');
const srcRows = fresh.map((s, i) => `<tr><td>[${n0 + i + 1}] ${esc(s.first_author)} (${s.year})</td><td>${esc(s.used_for)}</td><td>"${esc(s.quote)}"</td><td>${esc(s.cited_in)}</td></tr>`).join('');
const famRows = Object.entries(V.families).map(([f, x]) => `<tr><td>${f}</td><td>${x.today}</td><td>${x.central}</td><td>${x.optimistic}</td><td>${esc(x.verdict)}</td></tr>`).join('');
const under3 = M.filter((m) => counted(m) < 3);
const section = `<h2 id="sec-09">09. The 3 November 2026 builds, and a check of the simulation coefficients</h2>
<p>The builds of 3 November 2026 are the onboarding modes (docs/ONBOARDING-MODES.md), retention goals (docs/RETENTION-GOALS.md), the practice ramp (services/sessions.js applySpecRamp), the daily plan (docs/DAILY-PLAN.md), upload emphasis (docs/UPLOADS-ANY-FORMAT.md) and behavioural footprints with a drift layer (docs/SCORECARD-90.md section 11). The full section, with the code location, the numbers and every quote per mechanism, is curriculum-build/evidence-article/09-nov3-builds.md; the sources are in 09-nov3-builds-sources.json.</p>
<p>How it was checked, and what that does not show:</p>
<ul><li>each DOI was resolved on Crossref and its title, first author and year matched;</li><li>each quote is under 25 words and the code confirmed it appears word for word in the abstract;</li><li><b>the support rating is one reviewer's (Claude's)</b>, read against the abstract. It was not rated by two independent models with planted errors as in sections 06 to 08;</li><li>a source is counted only if its abstract shows the claim as worded; sources whose abstract could not be retrieved are title-level only and not counted;</li><li>Mabe and West (1982) and Azucar et al. (2018) have quotes taken from fragments of the abstract in a repository record, flagged in the sources file;</li><li>all Savant accuracy figures remain simulated.</li></ul>
<p>${M.length} mechanisms were examined; ${M.length - under3.length} have three or more counted sources and ${under3.length} do not (${under3.map((m) => `${m.id} with ${counted(m)}`).join(', ')}), so they are design choices and not claimed as backed. ${fresh.length} new sources were added as references ${n0 + 1} to ${n1}; ${J.sources.length + J.also_used_already_in_base - fresh.length} more that the section cites were already in the evidence base. These mechanisms are not part of the 309 audited above.</p>
<table><tr><th>Id</th><th>Mechanism</th><th>Counted sources</th><th>Verdict</th><th>Does the code match?</th></tr>${mechRows}</table>
<p><b>The coefficients the simulations assumed.</b> The onboarding model's family ceilings were "from memory, not re-checked". They were checked against abstracts; the table gives the values used before (the pessimistic scenario), the research-checked value (central) and the top of the cited range (optimistic). Only the mini-lesson ceiling falls (.55 to .42, because the .42 to .56 range applies to behaviour averaged over many occasions); four are unsupported and kept as conservative guesses (goal, read, taste, conf). For the footprint model no value was contradicted; three attributions were wrong or too strong (Epstein 1979 was cited for a validity it does not give, Hedge 2018 did not test task switching, and the Fleeson and Gallagher range is .42 to .56, not about .4), and every footprint's reason was rewritten to what its source shows. The footprint simulation re-run reproduced its simulated numbers exactly. For the truth correlation the onboarding simulation draws, the cognitive measures were assumed too weakly related (a general factor explains an average of 45.9% of the variance of cognitive tests); the size for personality-like measures is unsupported.</p>
<table><tr><th>Onboarding family</th><th>Today</th><th>Central</th><th>Optimistic</th><th>Verdict</th></tr>${famRows}</table>
<p>New sources:</p>
<table><tr><th>Source</th><th>What it is used for</th><th>Verbatim quote</th><th>Cited in</th></tr>${srcRows}</table>
`;
const hStart = h.indexOf('<h1><a name="references"></a>References</h1>');
if (hStart < 0) throw new Error('no References heading');
h = h.slice(0, hStart) + section + h.slice(hStart);
const refs = fresh.map((s, i) => `${P}${n0 + i + 1}.&nbsp;<a name="ref-${n0 + i + 1}"></a>${esc(s.first_author)} et al. (${s.year}). ${esc(s.title)}. <i>${esc(s.venue || '')}</i>. <a href="${s.url}">${s.url}</a>. <b>Verified:</b> DOI + quote. Ids: ${s.id}. Cited in: 09.</p>`).join('');
if (!h.includes('</body></html>')) throw new Error('no closing tags');
h = h.replace('</body></html>', refs + '</body></html>');
fs.copyFileSync(path.join(D, 'article.html'), path.join(__dirname, 'article.before-09.html'));
fs.writeFileSync(path.join(D, 'article.html'), h);
console.log(`added ${k} sources: ${n1} distinct, ${q1} with a verbatim quote; DOI-verified ${doi0 + k}; ${M.length} mechanisms`);
