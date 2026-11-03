// Section 09: verify every quote verbatim against its abstract (code), then write 09-nov3-builds.md and 09-nov3-builds-sources.json.
const fs = require('fs');
const path = require('path');
const ART = path.join(__dirname, '..');
const R = require('./resolved09.json');
const M = require('./claims09.js');
const ALL = (() => { const all = []; (function w(o) { if (Array.isArray(o)) o.forEach(w); else if (o && typeof o === 'object') { if (o.doi) all.push(o); else Object.values(o).forEach(w); } })(['scorecard-sources.json', 'retention-sources.json'].map((f) => require(path.join(ART, '..', f))).concat(fs.readdirSync(ART).filter((f) => /^0[1-8].*-sources\.json$/.test(f)).map((f) => require(path.join(ART, f))))); return all; })();
const haveDoi = new Set(ALL.map((s) => String(s.doi).toLowerCase()));
const norm = (s) => String(s).toLowerCase().replace(/[‘’“”"'`]/g, '').replace(/&lt;/g, '<').replace(/(?<!\d)\.|\.(?!\d)/g, ' ').replace(/[^a-z0-9.=%<αβ]+/g, ' ').trim();
const words = (q) => q.trim().split(/\s+/).length;
const used = new Map(); const problems = [];
let total = 0; let counted = 0;
const byMech = {};
for (const m of M) {
  let n = 0;
  for (const s of m.sources) {
    const o = R[s.key]; if (!o || !o.doi) { problems.push(`${m.id}: no source ${s.key}`); continue; }
    const a = norm(o.abstract || '');
    if (!a.includes(norm(s.quote))) problems.push(`${m.id}/${s.key}: quote not verbatim: ${s.quote.slice(0, 70)}`);
    if (words(s.quote) >= 25) problems.push(`${m.id}/${s.key}: quote has ${words(s.quote)} words`);
    total++; if (s.counts) { n++; counted++; }
    if (!used.has(s.key)) used.set(s.key, { o, uses: [] });
    used.get(s.key).uses.push({ mech: m.id, quote: s.quote, shows: s.shows, counts: s.counts });
  }
  byMech[m.id] = n;
}
if (problems.length) { console.log(problems.join('\n')); process.exit(1); }

// sources JSON: sources not already in sections 01-08 or the shared lists
const sources = [];
for (const [key, u] of used) {
  const o = u.o; const first = u.uses[0];
  const already = haveDoi.has(String(o.doi).toLowerCase());
  sources.push({
    id: `09-${key}`, doi: o.doi, url: `https://doi.org/${o.doi}`, title: o.title, first_author: o.first_author, year: o.year, venue: o.venue, verified: true,
    verification: `DOI resolved on Crossref, title, first author and year match; quote found verbatim by code in the abstract (from ${o.abstract_from})${o.abstract_partial ? ' (a FRAGMENT of the abstract from a repository record, full text not seen)' : ''}; rated by one reviewer (Claude), not two models`,
    quote: first.quote, used_for: first.shows, cited_in: [...new Set(u.uses.map((x) => x.mech))].join(', '), already_in_evidence_base: already,
  });
}
const newOnes = sources.filter((s) => !s.already_in_evidence_base);
fs.writeFileSync(path.join(ART, '09-nov3-builds-sources.json'), JSON.stringify({ section: '09', generated: '2026-11-03', method: '09-work/resolve09.js (Crossref + abstracts), claims09.js, build09.js (verbatim check by code)', count: newOnes.length, also_used_already_in_base: sources.length - newOnes.length, sources: newOnes }, null, 1));

// markdown
const out = [];
const P = (s = '') => out.push(s);
P('# Evidence section 09: the 3 November 2026 builds');
P();
P('Written 3 November 2026 on branch ev-09. Scope: onboarding modes, retention goals, the practice ramp, the daily plan, uploads emphasis, behavioural footprints and drift, plus a check of the coefficients the simulations assumed.');
P();
P('## How it was checked, and the limits');
P();
P('- Every source was resolved through Crossref (title, first author and year match the DOI record). Abstracts came from Crossref, OpenAlex, Europe PMC or Semantic Scholar; the code checked that each quote below appears word for word in the abstract (`09-work/build09.js`). Each quote is under 25 words.');
P('- **The support rating is ONE reviewer\'s (Claude\'s), read against the abstract.** It was not rated by two independent models with planted errors as sections 06 to 08 were, because that setup was not run for this section. Treat the ratings as a careful single read, and the verbatim quotes as machine-checked.');
P('- A source counts toward a mechanism only if its abstract shows the claim as worded. Where no abstract could be retrieved the source is title-level only and is not counted. Mabe & West 1982 and Azucar et al. 2018 had no machine-readable abstract: their quotes are fragments of the abstract taken from a repository record and are flagged in the sources file. Their full texts were not seen.');
P('- Support is for the general principle. For every mechanism the exact numbers in the code (thresholds, weights, minutes) are design values unless stated.');
P('- All Savant accuracy figures in the docs are SIMULATED; nothing here is a result on real learners.');
P();
P('## Summary');
P();
P('| id | mechanism | counted sources | verdict (short) |');
P('|---|---|---|---|');
for (const m of M) P(`| ${m.id} | ${m.name} | ${byMech[m.id]} | ${m.verdict.split(/[:;(]/)[0].trim()} |`);
P();
const strong = M.filter((m) => /^strong/.test(m.verdict)).length; const mixed = M.filter((m) => /^mixed/.test(m.verdict)).length; const mod = M.filter((m) => /^moderate/.test(m.verdict)).length; const design = M.filter((m) => /^design/.test(m.verdict)).length;
const under3 = M.filter((m) => byMech[m.id] < 3);
P(`${M.length} mechanisms: ${strong} strong, ${mod} moderate, ${mixed} mixed, ${design} design choice. ${M.length - under3.length} have 3 or more counted sources; ${under3.length} have fewer (${under3.map((m) => `${m.id} with ${byMech[m.id]}`).join(', ')}) and are not claimed as backed. ${sources.length} distinct sources are cited here, ${newOnes.length} of them new to the evidence base and ${sources.length - newOnes.length} already in it.`);
P();
let lastGroup = '';
for (const m of M) {
  if (m.group !== lastGroup) { P(`## ${m.group}`); P(); lastGroup = m.group; }
  P(`### ${m.id}. ${m.name}`);
  P();
  P(`- **Where:** ${m.where}`);
  P(`- **What it does:** ${m.does}`);
  P('- **Evidence:**');
  for (const s of m.sources) {
    const o = R[s.key];
    P(`  - ${o.first_author} (${o.year}), ${o.venue}. DOI ${o.doi}. Setting: ${s.setting}. Shows: ${s.shows}.${s.counts ? '' : ' NOT COUNTED.'}`);
    P(`    "${s.quote}"`);
  }
  P(`- **Verdict:** ${m.verdict}`);
  P(`- **Does the code match?** ${m.match}`);
  P();
}
P('## The coefficients the simulations assumed, checked');
P();
P('Full numbers, scenarios and quotes: `09-work/validity-scenarios.json` (built by `09-work/build-validity.js`, quotes verified verbatim by code). The onboarding table below is `today` (the from-memory values, the pessimistic scenario), `central` (research-checked) and `optimistic` (top of the cited range).');
P();
const V = require('./validity-scenarios.json');
P('| family | today | central | optimistic | verdict |');
P('|---|---|---|---|---|');
for (const [k, f] of Object.entries(V.families)) P(`| ${k} | ${f.today} | ${f.central} | ${f.optimistic} | ${f.verdict} |`);
P();
P('Changes of value: only the mini-lesson family (.55 to .42 central). wm (.85 to .82 central) and the reasons for keeping the rest are in the JSON. Four coefficients are unsupported and are kept equal in central and optimistic: goal, read, taste and conf.');
P();
P('Truth correlation (the world the onboarding sim draws): the parent assumption (cognitive measures g .5 and category .3, others .25 and .4) is too WEAK for cognitive measures. A general factor explains an average of 45.9% of the variance of cognitive tests (SD 12.9%; 97 samples, 31 countries), a loading of about .68 and a between-test r near .46, against .25 across categories in the sim. For personality-like measures the Big Five are correlated (two higher-order factors, a general factor) but no abstract could be read for the size, so the sim\'s .06 across and .22 within stay as unsupported, conservative guesses.');
P();
P('### Footprints (`scripts/lib/scorecard-footprints.js`)');
P();
P('| item | before | after the check |');
P('|---|---|---|');
P('| CP ceiling validity .40 | "about .4 for averaged behaviour (Epstein 1979; Fleeson & Gallagher 2009)" | kept: Fleeson & Gallagher 2009 give .42 to .56 for behaviour averaged over many occasions (against self-reported trait standing), so .40 is just under the floor. Epstein 1979 could be checked at title level only and is not counted. |');
P('| CP per-event r .2, VOL .14, EMB .17, PRM rho1 .04 | stated as anchored | marked "unsupported, conservative guess": no checked source gives a single-event value. |');
P('| VOL ceiling .35 | "r .29 to .40 in a meta-analysis (Azucar 2018)" | kept: the range is right (.29 Agreeableness to .40 Extraversion) but it is traits predicted from social-media footprints against self-reported traits, not in-app behaviour against a true value. |');
P('| EMB ceiling .50 | "switch-cost difference scores are weakly reliable (Hedge 2018)" | WRONG attribution: Hedge tested Flanker, Stroop, stop-signal, go/no-go, Posner, Navon and SNARC, not task switching (reliabilities 0 to .82). Replaced by Eckart 2021 (response-time switch cost retest ICC .78 and .82, error-rate costs lower) and Hughes 2014. The .50 stays as an unsupported, conservative guess inside the spread. |');
P('| VOL "free-choice persistence is the standard behavioural measure (Deci 1999)" | | narrowed: free-choice behaviour is the measure the 128 experiments used; the paper gives effect sizes of rewards, not a validity. |');
P('| PRM ceiling .35 | | unsupported, conservative guess; Russell 1989 shows one-item affect ratings have adequate reliability and convergent validity for mood (a state). |');
P('| each footprint\'s `why` | 14 citations from memory | each rewritten to say what the source shows; 10 are now labelled "a design inference" or "unsupported" because the abstract does not show that the behaviour reads the named measure. Cacioppo & Petty 1982, Pirolli & Card 1999 and Schraw & Dennison 1994 are title-level only. |');
P();
P('Re-run of the footprint simulation on 3 Nov 2026 (`scripts/scorecard-90-measure.js --foot=1`, same dumps and flags as docs/SCORECARD-90.md section 11): no coefficient value changed, so every SIMULATED number reproduced exactly (held-out seed C 93.74 with footprints against 93.70 without; A+B 93.62 against 93.52; validity x0.75 93.71, x0.5 93.70; CP only 93.76, VOL only 93.71, EMB only 93.70, PRM only 93.71).');
P();
P('### Code and doc issues found and NOT changed here');
P();
P('- `services/retention-goal.js` line 16 repeats "best gap roughly 10-20% of the retention interval"; Cepeda 2008 gives 20 to 40% for a week and 5 to 10% for a year. `GAP_MAX = 0.35` (line 48) and `GAP_SHARE = 0.15` (line 50) are design values. docs/RETENTION-GOALS.md was corrected.');
P('- `services/onboarding/model.js` comment "switch-cost difference scores: reliability ~.5 (Hughes et al. 2014)": not in that abstract.');
P('- `services/onboarding/model.js` FAMILIES.ml ceiling .55 is the top of the range for behaviour averaged over many occasions; central .42.');
P('- `services/scorecard/index.js` EVIDENCE_HALF_LIFE_DAYS (line 74) is one value (90) for every measure; the evidence says state-like measures change more than traits (Anusic 2016).');
P('- Task-switch scoring (services/onboarding/tasks.js) should be checked against Hughes 2014: rate-residual, bin or inverse-efficiency scores beat a plain latency difference.');
P();
P('## Proposals (each needs 3 or more sources before it is built)');
P();
P('1. **Per-measure evidence half-lives** (design in docs/SCORECARD-90.md 11.7): sources Roberts & DelVecchio 2000, Anusic & Schimmack 2016, Bleidorn et al. 2022 (all counted). Effect: a better estimate when real change is bigger than noise (the toy gains 1.2 points at day 365 at stability .8). Risk: a wrong rate fades true evidence; a too-slow fade costs little. Files: services/scorecard/index.js (owned by another worktree), scripts/scorecard-drift-sim.js.');
P('2. **Score switch cost as a rate-residual or inverse-efficiency score** (Hughes 2014 only counted source for the scoring claim; needs two more). Files: services/onboarding/tasks.js, scripts/onboarding-test.js.');
P('3. **Test the exam-cue weight** (09-M20, one counted source): find 3 studies on instructor emphasis and test content before keeping 2.5. Files: services/material-keypoints.js.');
P('4. **Retention gap by horizon**: replace the single GAP_MAX with a share that falls with the horizon (20 to 40% at 1 week, 5 to 10% at 1 year, Cepeda 2008, Cepeda 2006, Rohrer & Pashler 2007). Files: services/retention-goal.js (no change made here).');
P();
P('## Sources cited but not counted');
P();
P('- Epstein 1979, Cacioppo & Petty 1982, Pirolli & Card 1999, Schraw & Dennison 1994, Thiede & Dunlosky 1999, Lorch 1989, Titsworth & Kiewra 2004, Schneider et al. 2018, Richter et al. 2016, Ponce et al. 2022, Johnson 1970, Reder & Anderson 1980: DOI resolved on Crossref but no abstract could be retrieved by code, so they are title-level only. Search-engine summaries of some were seen but are not verbatim and are not used.');
P('- Pashler et al. 2007 in 09-M11: its abstract lists questions, not results.');
P('- Hedge 2018 is cited in 09-M5 only for what it shows (difference-score tasks that are not task switching).');
fs.writeFileSync(path.join(ART, '09-nov3-builds.md'), out.join('\n'));
console.log(`mechanisms ${M.length}; sources cited ${sources.length} (new ${newOnes.length}); counted source slots ${counted} of ${total}; under 3: ${under3.map((m) => m.id + '=' + byMech[m.id]).join(', ')}; strong ${strong} moderate ${mod} mixed ${mixed} design ${design}`);
