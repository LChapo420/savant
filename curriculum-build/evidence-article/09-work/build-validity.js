// Builds validity-scenarios.json for the onboarding model (services/onboarding/model.js FAMILIES).
// Every quote is checked verbatim against the abstract held in resolved09.json (code, not a model); a quote that is not found stops the build.
const fs = require('fs');
const path = require('path');
const R = require('./resolved09.json');
const norm = (s) => String(s).toLowerCase().replace(/[“”"']/g, '').replace(/[^a-z0-9.=%αβ]+/g, ' ').trim();
const src = (key, quote, shows) => {
  const o = R[key]; if (!o) throw new Error(`no source ${key}`);
  if (!norm(o.abstract || '').includes(norm(quote))) throw new Error(`quote not verbatim in ${key}: ${quote}`);
  if (quote.split(/\s+/).length >= 25) throw new Error(`quote too long for ${key}`);
  return { key, doi: o.doi, first_author: o.first_author, year: o.year, title: o.title, quote, shows, abstract_from: o.abstract_from, abstract_partial: !!o.abstract_partial };
};
const fam = {
  self: {
    today: 0.45, central: 0.45, optimistic: 0.56, item_r_today: 0.25,
    basis: 'Ceiling = correlation of an unlimited set of forced-choice self-report items with the true value. Evidence is for self-report against BEHAVIOUR: a questionnaire trait score predicts average behaviour over many occasions at r .42 to .56 (15 experience-sampling studies); single self-evaluations of ability predict performance at mean r .29 (SD .25). Central keeps .45, the bottom of the questionnaire-to-behaviour range; optimistic is the top of it (.56). Single items sit below the questionnaire (Credé 2012 shows very short measures underestimate), so .25 per item is consistent with .29, but no source gives a forced-choice single-item value for these 100 constructs.',
    item_r_note: 'one forced-choice item r .25 (today). Mabe & West mean r .29 for single self-evaluations of ability against performance (not personality, not forced choice): consistent, not a measurement of these items.',
    sources: [
      src('fleeson2009', 'predicting average levels with correlations between .42 and .56', 'questionnaire trait standing vs average behaviour over many occasions, r .42 to .56 (the ceiling range used)'),
      src('mabe1982', 'mean r = .29', 'mean validity of self-evaluations of ability against performance, with high variability (SD .25)'),
      src('dang2020', 'Accumulating evidence indicates weak correlations between self-report and behavioral measures of the same construct.', 'self-report and behaviour correlate weakly, partly because behavioural measures are unreliable'),
      src('crede2012', 'particularly the use of single-item measures, can lead researchers to substantially underestimate the role that personality traits play', 'single-item measures understate trait effects: a longer composite is more valid than one item'),
    ],
    verdict: 'partly supported (range .42-.56 against self-reported-trait-to-behaviour is cited; the exact .45 and the per-item .25 are not measured for these items)',
  },
  goal: {
    today: 0.5, central: 0.5, optimistic: 0.5, item_r_today: '0.1 to 0.28',
    basis: 'The interests-and-goals survey as a reader of motivation measures (identity_alignment, intrinsic_motivation, relevance_demand ...). No source found gives a validity of a stated interest or goal against these constructs.',
    item_r_note: 'unsupported, conservative guess',
    sources: [], verdict: 'unsupported, conservative guess (kept equal in central and optimistic)',
  },
  wm: {
    today: 0.85, central: 0.82, optimistic: 0.91, item_r_today: 0.65,
    basis: 'Validity against the true trait is about sqrt(reliability) x the task loading on the construct. Reliability evidence: automated Ospan retest .83 and alpha .78; verbal WM span tasks retest .52 to .81. sqrt(.83) = .91 (optimistic ceiling, loading 1); the middle of the retest range, sqrt(.665) = .82 (central). The task loading on the WM construct is not given in any abstract found, so the single 110-second span task at r .65 is below sqrt(reliability) by an amount nobody measured.',
    item_r_note: 'span task r .65 today = sqrt(.7 to .83) x an implied loading of about .7 to .8; the loading itself is unsupported',
    sources: [
      src('unsworth2005', 'good internal consistency (alpha = .78) and test-retest reliability (.83)', 'one automated operation-span task: alpha .78, retest .83'),
      src('waters2003', 'ranged from .52 to .81', 'test-retest correlations of seven verbal working-memory span measures over about 6 weeks'),
      src('calamia2013', 'ranged from adequate to high (i.e., r=.7 and higher)', 'meta-analytic neuropsychological test-retest reliabilities; memory and executive scores sometimes lower'),
    ],
    verdict: 'partly supported (reliability is cited, the loading on the construct is not)',
  },
  speed: {
    today: 0.8, central: 0.8, optimistic: 0.89, item_r_today: 0.6,
    basis: 'Speed-of-processing tasks (symbol matching) have meta-analytic neuropsychological retest reliabilities mostly r .7 and above, so sqrt(.7) = .84 up to sqrt(.8) = .89 is the index ceiling if the task measures the trait with loading 1. Central keeps .80 (a loading below 1); optimistic .89. The SDMT-specific retest figures (oral SDMT .83-.86 in one healthy sample) could not be tied to a verified record in this audit, so they are not counted.',
    item_r_note: 'symbol-match r .60 today; loading on a speed construct unsupported (the theory papers cited show speed is a shared factor in cognition but give no loading)',
    sources: [
      src('calamia2013', 'ranged from adequate to high (i.e., r=.7 and higher)', 'typical meta-analytic retest reliability of widely used neuropsychological scores'),
      src('strober2019', 'the SDMT proved superior to the PASAT', 'the symbol-digit task was judged the better speed measure in 14 trials of the multiple sclerosis consortium (no coefficient in the abstract)'),
      src('salthouse1996', 'considerable shared age-related variance across various measures of speed', 'speed measures share variance, so one speed task reads a general speed factor'),
    ],
    verdict: 'partly supported (retest reliability supports a high ceiling; the exact .80 and the task loading are not given)',
  },
  read: {
    today: 0.75, central: 0.75, optimistic: 0.75, item_r_today: '0.25 to 0.5',
    basis: 'Reading rate and comprehension from two short passages. Brysbaert (2019) gives the population mean (238 wpm non-fiction) and says individual differences are reliable, with no coefficient. No source found gives a retest reliability or validity for a 2-passage reading measure.',
    item_r_note: 'unsupported, conservative guess',
    sources: [
      src('brysbaert2019', 'Within each group/task there are reliable individual differences', 'reading rate shows reliable individual differences (no coefficient in the abstract); norm 238 wpm for adults'),
    ],
    verdict: 'unsupported, conservative guess (kept equal in central and optimistic)',
  },
  reason: {
    today: 0.75, central: 0.75, optimistic: 0.85, item_r_today: '0.1 to 0.35',
    basis: 'A 9-item reduced Raven form predicts the 60-item total at r .98 in the fitting sample and .90 in held-out data, so a short set of reasoning items can carry most of the full test. The pool has five items of each of five kinds (not nine of one kind), so central keeps .75, below .90; optimistic .85. The correlation with the full-scale SCORE is not validity against the true trait (the full test is itself imperfect), so .90 is not used directly.',
    item_r_note: 'one reasoning item r .2 to .35 today; no source gives a single-item value',
    sources: [
      src('bilker2012', 'correlations of .9836 and .9782 were achieved for the reduced forms and .9063 and .8978 for the validation data', 'nine matrix items predict the 60-item total: .98 in fitting data, about .90 in validation data'),
    ],
    verdict: 'partly supported (one source, a lower bound on short-set quality; the pool design differs from the nine-item form)',
  },
  switch: {
    today: 0.5, central: 0.5, optimistic: 0.71, item_r_today: '0.12 to 0.35',
    basis: 'Task-switching difference scores: reaction-time switch costs were reliable in one well-controlled paradigm (retest ICC .78 and .82; internal consistency .92) but costs from error rates were substantially lower; scoring method changes reliability (Hughes 2014: rate-residual, bin and inverse-efficiency scores beat plain latency cost, no coefficients in the abstract). Other difference-score tasks range from 0 to .82 (Hedge 2018, which tested Flanker, Stroop, stop-signal, go/no-go, Posner, Navon and SNARC, NOT task switching). Today comment "reliability about .5 (Hughes 2014)" is NOT in the abstract: no source states .5. Central keeps .50 (inside the cited 0 to .82 spread, task and scoring dependent); optimistic .71 = sqrt(.5) (loading 1).',
    item_r_note: 'one switch block r .30 to .35 today; unsupported as a per-block value',
    sources: [
      src('eckart2021', 'good test-retest reliabilities (ICC(2,1) of .78 and .82, respectively) for response time-based switch costs', 'RT switch costs in an affective task-switching paradigm: retest ICC .78 and .82; error-rate costs lower'),
      src('hughes2014', 'the strongest methods were the rate residual and bin score methods', 'switch-cost scoring changes reliability and validity; alternatives to latency costs beat plain latency scoring'),
      src('hedge2018', 'Reliabilities ranged from 0 to .82, being surprisingly low for most tasks given their common use.', 'seven classic difference-score tasks (not task switching): low reliability from low between-person variance'),
    ],
    verdict: 'partly supported (the range is cited; the figure .5 attributed to Hughes 2014 is not in its abstract)',
  },
  ml: {
    today: 0.55, central: 0.42, optimistic: 0.56, item_r_today: '0.15 to 0.3',
    basis: 'Chosen behaviour in a short controlled episode is a few occasions, not the many occasions averaged in experience sampling. In 15 experience-sampling studies, trait standing predicted AVERAGE behaviour at r .42 to .56. Single occasions predict far less, so .55 (top of that range) is generous for three choice points. Central .42 (bottom of the range) is itself an upper bound for a short lesson; optimistic .56. The criterion in those studies was self-reported trait standing, not a true value.',
    item_r_note: 'one choice point r .15 to .3 today: unsupported; aggregation raises validity with occasions (Epstein 1979 is cited for this in the footprint file but only its title could be checked)',
    sources: [
      src('fleeson2009', 'predicting average levels with correlations between .42 and .56', 'trait standing against behaviour averaged over many experience-sampling reports'),
    ],
    verdict: 'partly supported (one source; applies to many occasions, so central is lowered below the old .55)',
  },
  taste: {
    today: 0.45, central: 0.45, optimistic: 0.45, item_r_today: '0.12 to 0.28',
    basis: 'A/B teaching-style taste plus recall of both versions. A review for the learning-styles literature found no adequate evidence that matching instruction to a stated preference improves learning, so preference is not shown to read learning benefit; whether a preference reads the TRAIT (for example inductive_trajectory) is a different question that no source found answers.',
    item_r_note: 'unsupported, conservative guess',
    sources: [
      src('pashler2008', 'Proponents of learning-style assessment contend that optimal instruction requires diagnosing individuals\' learning style and tailoring instruction accordingly.', 'describes the meshing claim the review then tests (its verdict, in the full abstract, is that evidence is lacking)'),
    ],
    verdict: 'unsupported, conservative guess (kept equal in central and optimistic)',
  },
  conf: {
    today: 0.55, central: 0.55, optimistic: 0.55, item_r_today: '0.1 to 0.2',
    basis: 'Confidence ratings on reasoning items read calibration, self-monitoring and self-efficacy. There is a stable individual-difference confidence factor that goes across test types (Pallier 2002), which supports a trait, but no abstract found gives its reliability, so the "about .5 to .7 over 20+ items" comment is unsupported here.',
    item_r_note: 'unsupported, conservative guess',
    sources: [
      src('pallier2002', 'Results again indicated the presence of a confidence factor that transcended the nature of the testing vehicle.', 'a general confidence factor exists across cognitive and perceptual tests'),
    ],
    verdict: 'unsupported (trait supported; the coefficient is a conservative guess)',
  },
};

const truth_correlation = {
  parent_assumption: 'scripts/scorecard-recovery-sim.js drawTruth: z_j = lg*g + lc*c(category) + specific; cognitive categories (intake, reasoning, transfer) lg .5, lc .3; all others lg .25, lc .4. Implied correlations: cognitive within category .34, cognitive across categories .25, other within .22, other across .06, cognitive-to-other .125.',
  cognitive: {
    low: { g: 0.5, category: 0.3, implied_r_across: 0.25, implied_r_within: 0.34, note: 'the parent assumption' },
    central: { g: 0.65, category: 0.3, implied_r_across: 0.42, implied_r_within: 0.51, note: 'average first-factor variance 45.9% (SD 12.9%) in 97 non-Western samples gives an average test loading of about .68 and an average between-test r of about .46; observed tests carry error, so true-score correlations are at least that' },
    high: { g: 0.77, category: 0.3, implied_r_across: 0.59, implied_r_within: 0.68, note: 'loading from one SD above the 45.9% mean (58.8% of variance)' },
    sources: [
      src('warne2019', 'The first factor in the initial EFA explained an average of 45.9% of observed variable variance (SD = 12.9%)', 'a general factor explains about 46% of the variance of cognitive tests (SD 13%)'),
      src('deary2010', 'Quantitative genetic studies have established that there are additive genetic contributions to different aspects of cognitive ability--especially general intelligence', 'general cognitive ability is a replicated construct (no correlation size in the abstract; not used for the number)'),
    ],
    verdict: 'parent assumption is too WEAK for the cognitive measures (cross-category r .25 against about .46 observed between tests); central .65 is derived from one meta-analytic figure and applies to ability TESTS, while Savant measures such as intake_baseline are scorecard constructs, so the transfer is an assumption',
  },
  non_cognitive: {
    low: { g: 0.25, category: 0.4, implied_r_across: 0.06, implied_r_within: 0.22, note: 'the parent assumption' },
    central: { g: 0.25, category: 0.4, implied_r_across: 0.06, implied_r_within: 0.22, note: 'unsupported by any verified number: kept' },
    high: { g: 0.4, category: 0.4, implied_r_across: 0.16, implied_r_within: 0.32, note: 'unsupported guess for a sensitivity run, not a cited value' },
    sources: [
      src('digman1997', 'Two higher-order factors were clearly evident in all studies.', 'the Big Five correlate: two higher-order factors in 14 studies (no correlation sizes in the abstract)'),
      src('vanderlinden2010', 'two meta-factors Stability and Plasticity', 'a meta-analysis of Big Five intercorrelations supports two meta-factors and a general factor (no sizes in the abstract fragment)'),
    ],
    verdict: 'non-zero correlation among personality-like measures is supported (Big Five are not independent); the SIZE could not be checked in any abstract, so .06 across and .22 within are conservative guesses, labelled unsupported',
  },
};

const out = {
  built: new Date().toISOString().slice(0, 10), for: 'services/onboarding/model.js FAMILIES (rho = best achievable composite correlation with the TRUE value) and pool.js (item r)',
  method: 'Quotes checked verbatim against the abstract by code (build-validity.js). Validity against the true trait is about sqrt(reliability) x construct loading; where a source gives a reliability the sqrt is applied, where no loading is given the loading is not invented. pessimistic = today (the from-memory values).',
  scenarios_note: 'pessimistic = `today`; research-central = `central`; optimistic = `optimistic`. Where the checked evidence says today is too high (ml) central is LOWER than today.',
  families: fam, truth_correlation,
};
fs.writeFileSync(path.join(__dirname, '..', '09-work', 'validity-scenarios.json'), JSON.stringify(out, null, 1));
console.log('families', Object.keys(fam).length, 'sources', Object.values(fam).reduce((a, f) => a + f.sources.length, 0));
for (const [k, f] of Object.entries(fam)) console.log(k.padEnd(7), f.today, f.central, f.optimistic, '|', f.verdict.split(' (')[0]);
