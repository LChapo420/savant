// Section 09: doc wording fixes after the citation check. Numbers of SIMULATED runs are unchanged (re-run on 3 Nov 2026 reproduced them exactly).
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
function edit(file, pairs) {
  const p = path.join(ROOT, file);
  let s = fs.readFileSync(p, 'utf8'); const crlf = s.includes('\r\n'); s = s.split('\r\n').join('\n');
  for (const [a, b] of pairs) { if (!s.includes(a)) throw new Error(`${file}: missing "${a.slice(0, 70)}"`); s = s.replace(a, b); }
  fs.writeFileSync(p, crlf ? s.split('\n').join('\r\n') : s);
}
edit('docs/SCORECARD-90.md', [
  ['the citations there are from memory and their coefficients were not re-checked in this session)',
    'on 3 Nov 2026 every citation there was resolved through Crossref and read against its abstract: no number was contradicted so none changed, the per-event values and the EMB and PRM ceilings are marked "unsupported, conservative guess", and three attributions were corrected, see `curriculum-build/evidence-article/09-nov3-builds.md`)'],
  ['The day-0 mini-lesson (`services/onboarding/model.js`) assumes up to 0.55 for the same kind of choice, so these are stricter, because in-use choices are made in a messier context.',
    'The day-0 mini-lesson (`services/onboarding/model.js`) assumed up to 0.55 for the same kind of choice (the research check puts that at .42 to .56, the range of trait standing against behaviour averaged over many occasions, `curriculum-build/evidence-article/09-work/validity-scenarios.json`), so these are at or just under the bottom of the cited range, because in-use choices are made in a messier context.'],
  ['| 0.30 (0.55, the day-0 mini-lesson\'s ceiling) |', '| 0.30 (0.55, the top of the cited .42 to .56 range, and the day-0 mini-lesson\'s old ceiling) |'],
  ['set from stability figures in the literature at first',
    'set from stability figures in the literature at first (rank-order retest correlations over 6.7 years: .31 in childhood, .54 in the college years, .64 at 30, about .74 from 50 to 70, Roberts & DelVecchio 2000; 83% of the reliable variance of personality traits is stable, while changing factors carry 42% to 56% of it for life satisfaction, self-esteem and affect, Anusic & Schimmack 2016; a 2022 meta-analysis finds little rise in stability after 25, Bleidorn et al. 2022; the toy\'s yearly stabilities of 0.8 to 0.95 bracket these only if retest correlations are spread evenly over the years, which is an assumption)'],
]);
edit('docs/RETENTION-GOALS.md', [
  ['Cepeda et al. (2008) and Rohrer and Pashler put the best gap at roughly 10-20% of the retention interval; 35% is as far as the\nsimulation allows.',
    'Cepeda et al. (2008) found that, as a proportion of the test delay, the best gap fell from about 20 to 40% of a 1-week delay to about 5 to 10% of a 1-year delay (1,350 people, gaps up to 3.5 months, delays up to 1 year); Rohrer and Pashler (2007) found the benefit of a gap depends jointly on the gap and the delay. There is no single "10 to 20%" figure: the best share shrinks as the horizon grows, and 35% is above the best share for any horizon over a week. 35% is therefore a ceiling the simulation allows (it keeps the monthly review at a 90-day horizon), not the evidence-best value; for a year the best gap is nearer 5 to 10% (about 18 to 36 days).'],
]);
console.log('docs edited');
