# Onboarding modes: Quick, Balanced, Accurate

**Everything with a percentage below is SIMULATED.** The learners, their true values and the validity of every item are assumptions (section 7). It compares designs in one stated world; it is not a result about real learners, and no AI-judged or simulated number here should be quoted as one.

Branch `subj-o`. Owner's goal (2026-11-02): before Savant generates anything, the most accurate possible picture of how this learner's brain works and how they learn best, in a mode that fits their time: **Quick under 5 minutes, Balanced about 15 to 20, Accurate under 60.**

## 0. Round 3 (3 Nov, evening): correlated traits, research-checked validities, a redesigned Quick

**Every number in this section is SIMULATED**, labelled with its scenario. Held-out seed 31415, 300 learners, one seed: a difference under about 1 point of "share of error removed" is noise. Raw output: `curriculum-build/onboarding-sim/r3-*.json`; reproduce with `node scripts/onboarding-sim.js --heldout --learners=300 --bundle=central` (also `pessimistic`, `optimistic`, and the flags in the script header). Nothing here is a result on real learners.

### 0.1 The answer to "why does no onboarding come near 90%"

The earlier tables (sections 1 to 2) averaged **100 traits**, assumed them **independent**, and used weak validities, so an hour of 220 items gave about two items a trait. That was a modelling choice, not a law. Three changes were made and measured:

1. **The selector now works over a correlated posterior** (`services/onboarding/model.js`): the 100 measures and 11 factors (a general factor g and one per scorecard category) are one Gaussian; after every answer the posterior of all of them is updated, so one cognitive answer moves every related trait, and the next item is the one with the most posterior sd removed (summed over all 100 measures) per expected second. A rank-k update keeps this fast; the server and the simulator run the same code.
2. **Validities and ceilings are research-checked** and run in three scenarios (0.3). Where no source states a coefficient it is marked unsupported and kept.
3. **Quick was redesigned** (0.4).

The result is a real gain and still not near 90%. **Share of possible error removed** = (accuracy - guess) / (100 - guess), where "guess" is guessing every trait's population mean (86.0% to 86.5% on these seeds). 90% accuracy would be about 27% of the possible error removed on all 100 traits; the best simulated Accurate (optimistic scenario) gets 16%.

### 0.2 Per trait group (research-central scenario, the shipped selector)

Groups are structural (`services/onboarding/groups.js`, they follow what the pool asks), not a result:

- **a (15 measures): established fast, reliable tests exist.** Read by a working-memory, speed, reading, reasoning or switching item at validity 0.25 or more: intake_baseline, working_memory_span, processing_velocity, abstraction_tolerance, text_density_tolerance, vocabulary_ceiling, jargon_absorption, deductive_trajectory, inductive_trajectory, cognitive_flexibility, analogical_transfer, causal_chain_depth, systems_thinking, pattern_detection, logical_rigor.
- **b (29 measures): a short choice task or survey reads them moderately** (mini-lesson choice points, A/B tastes, confidence, survey), validity 0.2 to 0.3: for example competitive_drive, conceptual_bias, depth_breadth, planning_tendency, productive_struggle, intrinsic_motivation, identity_alignment, emotional_engagement, integration_tendency, persistence, example_density_need, spatial_anchoring.
- **c (56 measures): onboarding has no fast test on day 0**; only the two self-report items per measure, what the correlated posterior borrows from related traits, and the factor self-ratings: decay_rate, retrieval_strength, retention_index, the pacing and fatigue traits, error recovery, evaluation_anxiety, feedback style, self_monitoring, prior_knowledge, mastery_velocity and the like.

SIMULATED, research-central validities, true traits correlated (cognitive loadings g .65 / category .3; other .25 / .4):

| onboarding | minutes (median, p90) | a: fast reliable tests (15) | b: choice task or survey (29) | c: no fast test (56) | all 100 traits | general factor g | 100 minus MAE (guess = 86.2) |
|---|---|---|---|---|---|---|---|
| none (guess the mean) | 0 | 0% | 0% | 0% | 0% | 0% | 86.2 |
| today's 20-item style quiz | about 3 to 4 | n/a | n/a | n/a | 0.4% | n/a | 86.25 |
| Quick | 4.65, 4.73 | 14.4% | 2.9% | 2.1% | 4.2% | 26.1% | 86.78 |
| Balanced | 19.41, 19.48 | 20.9% | 5.6% | 4.0% | 7.0% | 36.6% | 87.17 |
| Accurate | 58.92, 59.01 | 28.5% | 8.3% | 6.6% | 10.4% | 46.7% | 87.63 |

How to read it: **what onboarding can actually read** is the cognitive group: working memory (34% of its error removed in Accurate), vocabulary (36%), processing speed (30%), logical rigor (30%). **It cannot read** the self-regulation, memory-decay, feedback-style and anxiety traits (group c: 2 to 7%), and the factor levels beyond g (the category factors 0 to 12%). Of the 100, 82 are read better than guessing in Accurate (60 in Balanced, 32 in Quick, at a 0.3-point margin). "100 minus MAE" is as the scorecard reads the estimates after `baseline.js` feeds them (the ideal posterior read-out is a few tenths higher: share removed Quick 4.4%, Balanced 7.7%, Accurate 10.8%).

By category (Accurate, same scenario): intake 29%, reasoning 26%, transfer 22%, motivation 5%, pacing 4%, engagement 4%, resilience 4%, metacognition 3%, representation 3%, memory 2%. Days of use to reach a given 100-minus-MAE with the scorecard's own weekly curve (gate-r9-a-none.json, approximate): to 87%: Quick day 3, Balanced day 0, Accurate day 0; to 88%: Quick not reached, Balanced day 22, Accurate day 6; 90% and 95%: not reached in any mode.

### 0.3 Three scenarios

Pessimistic = the validities and ceilings the module used before the research check (from memory) and the recovery sim's own truth loadings (cognitive g .5 / .3). Research-central = the checked values (0.6) and cognitive g .65. Optimistic = the upper end of the cited ranges and cognitive g .77, other g .4. In every row the selector assumes the scenario's validities and the shipped prior (only cognitive traits correlate, g .65 / .3). SIMULATED:

| scenario | mode | a (15) | b (29) | c (56) | all 100 | g | 100 minus MAE | guess |
|---|---|---|---|---|---|---|---|---|
| pessimistic | Quick | 9.4% | 1.5% | 1.1% | 2.5% | 17.4% | 86.59 | 86.26 |
| pessimistic | Balanced | 14.2% | 4.0% | 3.0% | 4.9% | 28.2% | 86.93 | 86.26 |
| pessimistic | Accurate | 20.8% | 7.7% | 5.2% | 8.3% | 35.6% | 87.39 | 86.26 |
| research-central | Quick | 14.4% | 2.9% | 2.1% | 4.2% | 26.1% | 86.78 | 86.2 |
| research-central | Balanced | 20.9% | 5.6% | 4.0% | 7.0% | 36.6% | 87.17 | 86.2 |
| research-central | Accurate | 28.5% | 8.3% | 6.6% | 10.4% | 46.7% | 87.63 | 86.2 |
| optimistic | Quick | 22.4% | 5.0% | 3.9% | 7.0% | 38.3% | 87.04 | 86.06 |
| optimistic | Balanced | 30.6% | 9.1% | 7.5% | 11.5% | 47.1% | 87.66 | 86.06 |
| optimistic | Accurate | 40.0% | 13.4% | 10.8% | 16.0% | 58.6% | 88.29 | 86.06 |

**How far Accurate can go under 60 minutes: 8.3% (pessimistic), 10.4% (research-central), 16.0% (optimistic) of the possible error on all 100 traits; 20.8%, 28.5% and 40.0% on the cognitive group a.** The earlier model on today's pool (independent traits, pessimistic validities) gives 5.9% (87.26%): the correlated posterior and the research-checked validities are worth about 4.5 points of share in Accurate (87.63% now in the research-central scenario).

**What the pool itself allows (any time).** Accurate with every item in the pool (294 items, a median of 94 minutes), SIMULATED: 9.2% (pessimistic), 11.3% (research-central), 16.9% (optimistic); group a 23.7%, 31.1%, 42.1%. So Accurate at 59 minutes already holds about 90% of what this pool can ever give. **The limit is the method ceilings (the family `rho`s), not the minutes**: one task type cannot read a trait better than its ceiling however many items it has. More would need more independent methods per trait (a second working-memory paradigm, a second speed task, a vocabulary test), each with its own persistent error; none is built (0.8).

### 0.4 Quick, redesigned

Quick is 4.65 minutes at the median, p90 4.73 (budget 285 s). New in the pool: a **30-second symbol-matching block** (`t:speed_q`, 45 s with its instruction) and a **forward-only digit span** (`t:span_fwd`, 60 s), each excluding its long version, validity scaled by the Spearman-Brown prophecy for half the length at a reliability of about .85 (x0.93; the formula is Brown 1910 and Spearman 1910, DOI-verified, title-level only); and **22 factor self-ratings** (`fq:*`, two for g and two for each of the 10 category factors, `content/onboarding/factor-items.json`) that read a whole family of traits at once. The selector decides the order: the required interests question, then typically a g rating, a quiz item, the short speed block, the short span, and cheap self-report pairs on the traits the cognitive results lift. Under the shipped prior only the g and cognitive-factor ratings carry information, so the eight personality-like factor items are never asked (they matter only if non-cognitive correlations are evidenced).

**Checked after round 3 (3 Nov, later):** the 22 factor self-ratings were blind-judged by two free models of different families (NVIDIA Nemotron Ultra and MiniMax M3.1 Flash; `scripts/judge-factor-items.js`, report `curriculum-build/onboarding-sim/factor-judge.json`). Each judge had to pick the high statement from a shuffled pair and name the factor from the high statement alone. The first runs failed two items: representation b pointed the opposite way to representation a, and intake b read as attention, a pacing trait. Both were rewritten. Final run: 22 of 22 pick the right pole for both judges, and 21 of 22 name the exact factor for both. The other one (a g item named intake) is in the same cognitive family. The **switching task** is now scored by rate residual (Hughes et al. 2014, Behavior Research Methods, 10.3758/s13428-013-0411-5): correct answers per second on switch trials against repeat trials, so errors count. The slope is fixed at 1 in log rates until the app has learners to fit it, and the norm is assumed. The simulation works from validities, not this scoring, so the numbers above do not change.

What Quick achieves (research-central, SIMULATED): **group a 14.4%** (working memory 27.5%, processing speed 21.9%, chunk_granularity 18.4%, inductive_trajectory 17.9%), **the g factor 26.1%**, 4.2% of all 100 (the earlier Quick: 1.0%), groups b and c 2.9% and 2.1%. Optimistic: group a 22.4%, g 38.3%, 7.0% overall. It is a real first picture of the cognitive side and little else: with 15 items nothing in 4.7 minutes reads the motivation and self-regulation traits.

### 0.5 What the assumptions are worth (SIMULATED, 300 learners, share of error removed on all 100)

| the selector assumes | the world is | Quick | Balanced | Accurate | group a at Accurate |
|---|---|---|---|---|---|
| independent traits (the earlier selector), pessimistic validities | independent traits | 1.0% | 2.7% | 5.9% | 14.0% |
| independent traits | central (cognitive .65 / .3, other .25 / .4) | 1.0% | 2.8% | 5.5% | 13.9% |
| **only cognitive traits correlate (shipped)** | central | 4.2% | 7.0% | 10.4% | 28.5% |
| only cognitive traits correlate | only cognitive traits correlate | 4.2% | 7.2% | 10.5% | 28.5% |
| only cognitive traits correlate | independent traits | -0.4% | 1.8% | 4.2% | 10.0% |
| central (cognitive and personality-like) | central | 5.0% | 9.2% | 13.2% | 28.4% |
| central | only cognitive traits correlate | 4.1% | 6.1% | 9.0% | 27.5% |
| central | independent traits | -0.6% | 0.8% | 3.5% | 9.0% |
| central, world: one response error shared by every measure an item reads | central | 4.6% | 8.5% | 12.2% | 23.9% |

Three readings. (1) Modelling correlation is the largest lever found: an independent selector gets 5.5% against 10.4% (shipped) or 13.2% (central selector) in the same correlated world. (2) **It is a bet.** If traits really are independent, a selector that assumes correlation is slightly worse than guessing in Quick (-0.4% to -0.6%) and gets 4.2% (shipped) or 3.5% (central) in Accurate, where the earlier independent selector got 5.9% (that run used the pessimistic validities, so the comparison is indicative, not like for like). The cognitive correlation has a source (0.6), the personality-like one does not, so the shipped prior assumes only the cognitive part: it gives up 2.8 points of Accurate if the central personality-like loadings are real (10.4% against 13.2%) and gains 1.5 if only the cognitive traits correlate (10.5% against 9.0%), and 0.7 if nothing correlates (4.2% against 3.5%). (3) An item that reads several measures with one shared response error (the real case) is overstated by the model: 12.2% against 13.2% for the central selector, about one point.

### 0.6 Where every validity comes from

Scenario values for each method family (`model.js SCENARIOS`; evidence with verbatim quotes in `curriculum-build/evidence-article/09-work/validity-scenarios.json`, section 09 of the evidence article). "Ceiling" = the best correlation with the true trait any number of items of that family could reach; an item's own validity is scaled with its family's ceiling.

| family | before (from memory) | research-central (shipped) | optimistic | what the checked sources show | verdict |
|---|---|---|---|---|---|
| self-report | .45 | .45 | .56 | Fleeson and Gallagher 2009: trait questionnaires predict behaviour averaged over many occasions at r .42 to .56 (10.1037/a0016786); Mabe and West 1982: self-evaluations of ability against performance, mean r .29 (10.1037/0021-9010.67.3.280); Dang et al. 2020: self-report and behaviour correlate weakly (10.1016/j.tics.2020.01.007); Crede et al. 2012: single items understate (10.1037/a0027403) | partly: the .45 sits in the cited range; the per-item .25 is not measured on these items |
| interests and goals survey | .5 | .5 | .5 | none | **unsupported, conservative guess** |
| working-memory span | .85 | .82 | .91 | Unsworth and Engle 2005 automated operation span: alpha .78, retest .83 (10.3758/bf03192720); Waters and Caplan 2003: retest .52 to .81 over seven span tasks (10.3758/bf03195534); Calamia et al. 2013 (10.1080/13854046.2013.809795) | partly: reliability is cited, the task's loading on the construct is not |
| processing speed | .8 | .8 | .89 | Calamia 2013: typical retest r of .7 and higher; Strober et al. 2019: symbol-digit best of two measures (10.1177/1352458518808204); Salthouse 1996 (10.1037/0033-295x.103.3.403) | partly: the exact .80 and the task loading are unsupported |
| reading rate and comprehension | .75 | .75 | .75 | Brysbaert 2019: reliable individual differences, no coefficient in the abstract (10.1016/j.jml.2019.104047) | **unsupported, conservative guess** |
| short reasoning items | .75 | .75 | .85 | Bilker et al. 2012: a 9-item matrices form predicts the 60-item total at r about .90 in validation data (10.1177/1073191112446655) | partly: one source; single-item values unsupported |
| task switching | .5 | .5 | .71 | Eckart et al. 2021: retest ICC .78 and .82 for response-time switch costs (10.1037/emo0000972); Hughes et al. 2014: scoring method changes reliability (10.3758/s13428-013-0411-5); Hedge et al. 2018: reliabilities 0 to .82 for seven other tasks (10.3758/s13428-017-0935-1) | partly: no source states .5; the earlier attribution to Hughes 2014 was wrong |
| mini-lesson choice points | .55 | **.42** | .56 | Fleeson and Gallagher 2009: .42 to .56 holds for behaviour averaged over many occasions, so one episode is lower | partly; central lowered |
| A/B teaching taste and recall | .45 | .45 | .45 | Pashler et al. 2008: the case for matching instruction to preferred style is described, with evidence lacking (10.1111/j.1539-6053.2009.01038.x) | **unsupported, conservative guess** |
| confidence ratings | .55 | .55 | .55 | Pallier et al. 2002: a general confidence factor across tests (10.1080/00221300209602099) | **unsupported** (the trait is supported, the coefficient is not) |

Also used: the **factor self-ratings** are .29 for g and the cognitive categories (a self-evaluation of ability against performance, Mabe and West 1982, mean r .29) and .25 for the others (unsupported); the **trait correlations**: a general factor explains 45.9% of the variance of cognitive tests in 97 samples (Warne 2019, 10.1037/bul0000184), about a .68 loading, so the old g .5 was too weak and the central is .65; for personality-like measures, Digman 1997 (10.1037/0022-3514.73.6.1246) and van der Linden et al. 2010 (10.1016/j.jrp.2010.03.003) show the Big Five are not independent, but the **size could not be checked, so g .25 / category .4 is an unsupported conservative guess** (the shipped prior leaves it out). Other unsupported assumptions kept: the per-item validities (.25 to .65, a fraction of each ceiling), 10 s per self-report item and the other seconds, the fatigue loss of 20% of validity over an hour, the independence of different families' errors, and the factor structure itself (one general plus one per category; the real structure of these 100 scorecard measures has never been fitted).

### 0.7 What changed in the code (round 3)

`services/onboarding/model.js` (correlated posterior, scenarios, `cogonly` prior), `pool.js` (22 factor items, two short task versions, number-series and conditional-reasoning items to ten each, generated by code), `tasks.js` and `public/js/baseline.js` (the short versions: `dur`, `forwardOnly`; the factor words), `plan.js` (limits: Quick 285 s, Balanced 1170 s about 19.5 minutes, Accurate 3540 s about 59 minutes, stop below 0.05 points of posterior sd a minute), `groups.js` (the group split), `scripts/onboarding-sim.js` (bundles, correlated truth, groups, factor error), `scripts/onboarding-test.js` (seven new checks), `content/onboarding/factor-items.json`. The scorecard is untouched: `baseline.js` still feeds one observation a measure, now with the posterior's equivalent precision and reading, so the correlations reach the card as ordinary evidence. Consent is unchanged (`boosters.allowed`).

**Re-optimisation of Accurate under 60 minutes.** Budget 3420 to 3540 s and stop threshold 0.1 to 0.05 (the stop never binds; the pool and the ceilings do): the whole-pool run (0.3) shows the minutes leave almost nothing more to buy. What moved it: the correlated selector (about +4.5 points of share), ten generated items of the two generated reasoning kinds instead of five, and the research-checked validities.

### 0.8 Not done, not verified (round 3)

- Every number above is simulated. The factor structure, the personality-like loadings, the per-item validities and the independence of method errors across families are assumptions; where no source states a coefficient it says so above.
- The 22 factor self-ratings were written by hand and **not blind-judged** by a second model (the 200 per-measure pairs were). Only the g and cognitive-category ones are asked under the shipped prior.
- The new short tasks (30-second speed block, forward-only span) pass syntax and unit checks and the Quick session test, but were **not clicked through in a browser** this round.
- The second working-memory, speed and vocabulary methods that would raise the ceilings are not built.
- The earlier sections below describe round 2 (independent traits, from-memory validities); where they disagree with this section, this section holds.

---

*Sections 1 to 8 are round 2 (2 to 3 Nov): independent traits and the from-memory validities, at the earlier limits (Quick 276 s, Balanced 1080 s, Accurate 3420 s). They are kept as the earlier record; section 0 supersedes their numbers.*

## 1. The baseline every mode is compared to

Accuracy is 100 minus the mean absolute error, in points, over the 100 scorecard measures (as in docs/SCORECARD-90.md). True values are drawn with mean 50 and sd 17, so **guessing the population mean scores 86.46%** on this seed.

- **Day 0 with today's onboarding: 86.5%.** That is the real `seedFromStyleQuiz` on an in-memory card, fed the 20-item quiz as scripts/scorecard-recovery-sim.js models it. It is no better than guessing the mean: the quiz reaches 14 measures, weakly, and seeds five of them from a dimension that does not measure them.
- **After that, by use** (the app as it is, scripts/scorecard-recovery-sim.js, curriculum-build/scorecard-sim/gate-r9-a-none.json): day 7 87.8%, day 14 87.7%, day 21 88%, day 28 88.2%. docs/SCORECARD-90.md's 60-minutes-a-day run: 87.7% at day 30, and 86.45% at day 180. **Today's onboarding plus use never reaches 90% or 95%.**

## 2. What each mode achieves (held-out seed 31415, 300 learners)

| | Quick | Balanced | Accurate |
|---|---|---|---|
| time budget | under 5 min | about 15 to 20 min | under 60 min |
| median minutes | 4.51 | 17.91 | 56.89 |
| p90 minutes | 4.58 | 17.99 | 57 |
| items answered (median) | 24 | 104 | 223 |
| **day-0 accuracy, as the scorecard reads it** | **86.57%** | **86.8%** | **87.17%** |
| day-0 accuracy, ideal read-out | 86.61% | 86.89% | 87.24% |
| today's onboarding, same learners | 86.5% | 86.5% | 86.5% |
| gain over today's (points) | +0.07 | +0.3 | +0.67 |
| measures read better than "guess the mean" | 21 of 100 | 66 of 100 | 92 of 100 |
| days of use to 87% (today's: day 15) | day 9 | day 3 | day 0 |
| days of use to 88% (today's: not reached) | not reached | not reached | not reached |
| days of use to 90% (today's: not reached) | not reached | not reached | not reached |
| days of use to 95% (today's: not reached) | not reached | not reached | not reached |

Read it plainly: **no mode gets day-0 accuracy near 90%.** Accurate adds about 0.67 points over today's and Quick about 0.07. The cause is arithmetic, not a bug: with conservative validities, a minute of anything measures about 0.2 to 0.5 units of precision spread across the measures it reads, and 90% needs about 0.85 units on every one of 100 measures (roughly three hours at the best rate found). That is consistent with docs/SCORECARD-90.md ("95% at day 30 is not reached with literature-conservative validities"). What the modes do buy is **days of use saved** on the way to the level the app can reach (87%: Quick day 9, Balanced day 3, Accurate day 0, against today's day 15), and a first level written from something real for the 92 measures Accurate reads better than a guess (Quick 21, Balanced 66).

Days-to-X is the app's own weekly accuracy curve (gate-r9-a-none.json) with this onboarding's extra precision added per measure (precision = 1 / error variance, from each measure's mean absolute error; approximate: it assumes the onboarding and the app's behavioural evidence are independent). 90% and 95% are not reached within the four weeks the curve covers, in any mode.

**The worst ten measures from docs/SCORECARD-90.md section 10.4, error in points (as the scorecard reads them):**

| measure | today | Quick | Balanced | Accurate |
|---|---|---|---|---|
| conceptual_bias | 14 | 14 | 13.7 | 13 |
| identity_alignment | 12.7 | 12.4 | 11.9 | 11.8 |
| cognitive_flexibility | 13.9 | 13.8 | 13.6 | 13.3 |
| competitive_drive | 13.6 | 13.6 | 13.3 | 12.6 |
| depth_breadth | 15 | 15 | 14.7 | 13.9 |
| productive_struggle | 15.2 | 12.9 | 13.1 | 13.4 |
| planning_tendency | 12.9 | 12.9 | 12.7 | 12.1 |
| emotional_engagement | 13.5 | 13.5 | 13.4 | 12.9 |
| intrinsic_motivation | 13.2 | 12.6 | 12.9 | 12.5 |
| integration_tendency | 13 | 13 | 12.9 | 12.4 |

(The "today" column is the error of today's onboarding on the same learners. A measure the new items move little is one whose only source is self-report: conceptual_bias, depth_breadth, planning_tendency, competitive_drive and productive_struggle are read only inside the mini-lesson, which Quick has no time for.)

**Sensitivity.** The selector always assumes the validities in the pool; the simulated world can differ from them:

| world | Quick | Balanced | Accurate |
|---|---|---|---|
| validities 25% below what the selector assumes | 86.54% (+0.04) | 86.68% (+0.18) | 86.89% (+0.39) |
| as assumed (headline) | 86.57% (+0.07) | 86.8% (+0.3) | 87.17% (+0.67) |
| validities 33% above what the selector assumes | 86.62% (+0.12) | 86.98% (+0.48) | 87.5% (+1) |

Development seed, for the record (used while building): development seed 20261102: quick 86.62%, balanced 86.82%, accurate 87.28%; today 86.55%.

**The pool is complete (round 2, 3 Nov), and the numbers above are the shipped ones.** `node scripts/build-onboarding-items.js` finished on free models: **all 100 measures have two checked self-report items (200), 2 reading passages with 8 checked questions, 15 analogy, causal and abstract items (5 of each), 3 mini-lesson parts and 4 A/B taste pairs (12 recall questions, each solved from both versions)**, so the held-out simulation with only what exists (`--shipped`) gives the same numbers as the full designed pool: quick 86.57% (+0.07, median 4.51 min, p90 4.58), balanced 86.8% (+0.3, 17.91 min, p90 17.99), accurate 87.17% (+0.67, 56.89 min, p90 57). **Still true: no mode gets day-0 accuracy near 90%** (the arithmetic above is unchanged by the pool), and nothing here is a result on real learners. Round 1 had finished only 24 measures, and Balanced and Accurate stopped early with no mini-lesson; that is fixed.

## 3. How a session works

- **One picker** (public/baseline.html, public/js/baseline.js): Quick / Balanced / Accurate with honest minutes and what each is for; progress is minutes left, never a question count; "stop here and save what I have" is always there. Same clean flow as the quiz. Sign-up goes here instead of quiz-then-survey (public/js/auth.js).
- **The pool** (services/onboarding/pool.js, 267 items): two forced-choice self-report items per measure plus the 20 existing style-quiz items; a working-memory span, a processing-speed task, two reading passages with comprehension (rate and level), two task-switching blocks (switch cost), five kinds of reasoning item with a confidence rating on each (calibration), a three-part **mini-lesson with real choice points** (why or steps, hint or try, plan or dive in, go deeper or move on, challenge or solo, bonus or skip, connect it or not, one more or done), four **A/B teaching tastes** each with an in-session recall check on both versions (so preference is measured next to what was actually learned), and the interests and goals survey cut to the mode. Each item records which measures it reads, its validity and its median seconds.
- **Adaptive choice** (services/onboarding/model.js, plan.js): after every answer the next item is the one that removes the most posterior uncertainty (summed over the measures it reads) per expected second **at this learner's own pace**, among items that still fit in the time left. It stops at the mode's budget or when nothing is worth its time (Balanced and Accurate stop below 0.1 points of uncertainty per minute). A slow learner gets fewer items, never a longer session: Quick hard-stops at 4.6 minutes of the learner's own pace.
- **Wired into the scorecard** (services/onboarding/baseline.js, index.js): the estimates enter as designed-test observations (`scorecard.observe`, source 'onboarding'), so the scorecard, and therefore services/learning-spec.js, has the baseline before the first level is written. A deeper retake from the profile ("Go deeper on how you learn") starts from the evidence and the used items already stored and feeds only the precision it adds: the learned history is kept.
- **Consent**: the same rule as the other measurement channels (`boosters.allowed`). An account under its consent age without a parent's `measurement_extras` agreement, or without the age screen answered, gets no new channel: the page sends it to the old style quiz and survey, unchanged (scripts/onboarding-test.js checks nothing is stored).
- **Words and checks**: the words were written by free models and every keyed item was re-solved blind before release (scripts/build-onboarding-items.js, resumable). Round 2 writer: MiniMax M3.1 Flash through services/providers/xkiro.js (pipeline only, the owner's grant that expires 6 Nov; about 0.49M tokens used), NVIDIA nemotron-3-ultra as its fallback (12 calls). **Judge: nvidia/nemotron-3.5-lightning-30b-a3b (120 calls), a different model from the writer**; the two judges named in round 1 (glm-5.3-flash, deepseek-v4.1-flash) timed out on every call for hours, and the Gemini free tier was over quota, so neither was used. Each self-report pair passed a blind check that a judge shown the two options (shuffled) and the measure's low and high meaning picks the writer's high option; each keyed item (reading, reasoning, mini-lesson problem, taste recall) passed a judge solving it without the key. **Released after the checks:** 200 self-report items (100 measures x 2), 8 reading questions on 2 passages, 15 reasoning items, 3 mini-lesson parts, 12 taste questions. **Failed the re-solve (counted in this round's logs; the first partial run did not print its tally):** 6 reasoning items (1 causal, 5 abstract), 0 mini-lesson, 0 taste, and 0 self-report pairs failed the judge (suspiciously clean: a smaller judge that agrees easily is a weaker check, and about 12 candidate pairs were also dropped before the judge for length or duplicates, not counted). A checker that is smaller than the writer will accept some items a stronger one would not; no human has read these items. An item that failed or has no words is not offered (services/onboarding/index.js `available`). Keys never leave the server.

## 4. Subject placement at the new limits (SIMULATED, held-out seed 31415, 40 learners per level, round 2 of 3 Nov)

The owner's limits are Quick under 5 minutes, Balanced about 20, Accurate under 60 (they were 20 / 45 / 90). **Result: Balanced and Accurate are re-fitted and keep about 99% within one grade. Quick placement is NOT shipped at 5 minutes: it stays at its old 20-minute clock, because the best 5-minute design built here is under 90% within one grade on four of nine subjects.**

### What changed in how this is measured (round 1 was wrong in two ways)

1. **The clock did not end a Quick walk.** `services/subject-placement.js` only let the clock stop a walk once the mode's minimum number of answers was in (a rule from 2026-10-29, so a learner who stepped away was not placed on 4 answers). Quick's minimum is 18 answers plus a lift with the subject's length (27 in math), so round 1's "Quick at 4.4 minutes" kept asking until 18 to 28 answers were in. With the per-question seconds below, that is a **median of 8 to 21 minutes** (reading 21), not 5 (dev seed, the code as of a00beec). Round 1's table, which simulated "about 10 questions because the clock binds", described a walk the app did not do.
2. **A question is not 26 seconds.** 26 s was the old clocks' budget, never measured. No real timings of placement questions exist (the app holds three placements). So the per-question seconds are **ESTIMATED, not measured**, from each stored question's word counts and answer type (`services/placement-seconds.js`): 2.5 s to orient, the stem at 3 words a second, the options skimmed at 4.5 words a second, 1.5 s plus 0.5 s an option to decide, plus working time by band (2, 5, 9, 12 s, scaled by subject from 0.6 for recall subjects to 1.2 for arithmetic, logic and chess). It is built to over-estimate. Median per subject: math 29 s, English 42, reading 62 (the stems are passages), IQ 29, ACT 24, Spanish 18, chess 28, piano 23, basketball 26. The simulation gives each learner a pace (lognormal around the estimate, sd 0.28) and a plus or minus 20% jitter on every question, and ends a sitting by the app's own rule (`adaptive.clockEnded`).

### The fast-question design

Every mode now takes the quickest of the questions that are about equally informative (`nextBlock` with `fast`, mode flag `shortFirst`): among the unasked questions it scores seconds times (1 + (distance from the belief's middle / 0.5 grade)^2) and takes the lowest. Quick was also tried with no span lift and a minimum of 10 answers (`--quick=fast` in the simulator, not shipped). A walk also ends at 1.25 times its clock once 8 answers are in (`HARD_STOP`, `HARD_FLOOR`), so a mode whose minimum cannot be met (reading at 60 s a question) is not kept 60% past the limit.

### Quick: could 5 minutes hold 90% within one grade on every subject? No.

| subject | **5-minute design: within 1 grade** | exact | median min, p90 min (subject stage) | shipped Quick (old 14 + 6 clock, short-first): within 1 | median min, p90 min |
|---|---|---|---|---|---|
| math | 81.8% | 56.6% | 4.6, 5.0 | 98.4% | 13.7, 17.9 |
| english | 90.5% | 59.3% | 4.6, 5.8 | 99.1% | 13.1, 17.5 |
| reading | 84.6% | 51.1% | 5.9, 7.7 | 97.1% | 17.6, 18.7 |
| iq | 92.5% | 60.9% | 4.8, 6.1 | 98.9% | 11.9, 16.8 |
| act | 94.8% | 66.6% | 4.5, 4.9 | 99.1% | 10.1, 14.4 |
| spanish | 88.6% | 46.6% | 4.5, 4.7 | 99.8% | 9.6, 14.1 |
| chess | 92.5% | 60.5% | 4.6, 5.0 | 98.9% | 9.4, 14.4 |
| piano | 92.7% | 61.6% | 4.6, 4.9 | 100% | 8.3, 14.0 |
| basketball | 93.9% | 62.5% | 4.6, 5.2 | 99.5% | 9.5, 14.2 |
| **all nine** | **90.2%** | 58.4% | | **99.0%** | |

(The 5-minute design is a subject clock of 4.4 minutes, as much as the 5-minute whole leaves after about half a minute of in-grade questions: 12.7 questions on average. Reading's median is over 5 because its 10-answer minimum at 60 s a question cannot fit; the hard stop catches it by 7.7.) **Four subjects miss 90% (math 82%, reading 85%, Spanish 89%, English 90.5%), and math and reading miss by 5 to 8 points.** I did not lower the bar or the stop rule. So Quick placement keeps its old clock (14 minutes for the subject, 6 in the grade, 20 whole), and the owner's under-5 limit holds for the **baseline** (Quick onboarding, section 2) but not for **subject placement**. For comparison, round 1's code (a00beec as written, a 4.4-minute clock with a minimum of 18 answers) stopped at 1.25 times its 4.4-minute clock would place 89.4% (math 78%, reading 83%).

How long would a Quick placement need to hold 90% on every subject (same short-first design, minimum 10, same seed)? **About 8 minutes for the subject stage**: 96.7% on average, every subject 90% or better (reading exactly 90.0%, math 96.4%, 17 questions on average), median 7.2 to 8.5 minutes, p90 8.3 to 10.4. At 6 minutes it is 94.4% on average with reading at 88.2%. That is a proposal for the owner, not shipped: it would make Quick placement about 8.5 minutes whole, over the owner's 5.

### Balanced and Accurate at the new limits (held-out seed, short-first, estimated seconds)

| | old limits (32 / 57 min subject clocks, plain walk) | | new limits (14 / 40 min subject clocks, short-first) | |
|---|---|---|---|---|
| mode | within 1 grade | exact | within 1 grade | exact |
| balanced (whole 20 min: 14 subject + 6 in grade) | 99.5% | 69.8% | **99.0%** | 68.5% |
| accurate (whole 57 min: 40 subject + 14 in grade + 3 gap scan) | 99.5% | 69.7% | **99.6%** | 69.7% |
| quick (unchanged, 20 whole) | 98.3% (plain) | 68.2% | 99.0% (short-first) | 68.8% |

Short-first is what makes the new limits cost nothing: the plain walk at the new Balanced clock placed 98.8% (dev seed), short-first 99.1%. Where each mode stands against its limit, per subject, subject stage only (median minutes, p90): Balanced 8.5 to 17.5 (p90 14.2 to 18.7); Accurate 29 to 41 (p90 40.3 to 50.9, reading 51). **Reading is the exception:** its questions are passages (about 62 s each) and its minimum number of answers cannot fit, so Balanced reading runs about 17.5 minutes in the subject stage (p90 18.7) and so about 24 with the in-grade stage: over "about 20". The hard stop bounds it at 1.25 times the clock; it is not fixed. A reading placement with shorter passages is the fix and is content work, not done.

Per subject within 1 grade, Balanced: math 98.2, english 99.3, reading 97.1, iq 98.9, act 99.1, spanish 99.8, chess 98.9, piano 100, basketball 99.8; Accurate: 99.6, 100, 99.8, 99.3, 99.3, 99.8, 99.1, 100, 99.6.

(All nine simulated subjects; "within 1 grade" is the share placed within one grade of the truth, averaged over true levels from knows-nothing to knows-everything, the in-grade draw. Calibrated items only. Question seconds are estimated, so every minute count here moves with that estimate: a real learner who reads faster than 3 words a second fits more questions. The sealed Spanish files were not touched: the simulator reads Spanish only through `questionsFor`.)

## 5. What was not done or is not verified

- **No real-learner data.** Every accuracy here is simulated; the validities (model.js FAMILIES, pool.js) are conservative literature-anchored assumptions, not measured on this app's learners. Gains could be smaller (the pessimistic row) or larger.
- **Measures were treated as independent in round 2**, so no precision was borrowed from correlated measures. Round 3 (section 0) adds a correlated posterior and a correlated simulated truth; the factor structure is an assumption that has not been fitted on real learners.
- **Norms** for span, speed, reading rate and switch cost (services/onboarding/tasks.js) are assumed adult-and-teen figures; the scorecard re-standardises as its cohort grows. Children's norms are lower; under-13 accounts take none of these tasks without a parent's agreement.
- **Time per item** (10 s per forced-choice item, 110 s for the span task, ...) is estimated, not timed on people. The planner uses the learner's real pace as it goes, so the limits hold, but the item count in each mode would change.
- **The screens** (baseline.js) were clicked through in a browser on 3 Nov by a script, not by a person on a phone: picker, a full Quick run (a script that answers in about a second a screen, so 256 screens in 4.3 minutes wall clock, 4.5 minutes by the server's count and 'Done' showing 100 things measured; a person is slower and gets fewer items, never a longer session), the start of Balanced to a reasoning item with the confidence row, and an under-13 account without consent, which landed on the old style quiz (screenshots in curriculum-build/onboarding-shots/, a DB copy on port 6791).
- The mini-lesson's choice points and the tastes' recall check are single events with low individual validity (0.12 to 0.3); the model credits them as such. The spatial span and choice-reaction tasks in the first design were dropped for lack of a screen.
- **Subject placement Quick** is not at 5 minutes: it stays at 20 whole, because the 5-minute design built here (section 4) is 90.2% on average and under 90% on four subjects. The seconds behind every placement minute count are estimated from word counts, not measured. Reading's Balanced and Accurate runs exceed their limit (long passages).
- Money: free models only (NVIDIA free; MiniMax M3.1 Flash from the owner's xKiro grant, pipeline only); Standard Compute $0, Anthropic $0, OpenRouter $0, Modelflare not used.

## 6. Files

services/onboarding/{model,pool,plan,tasks,baseline,index}.js, routes/onboarding.js, public/baseline.html, public/js/baseline.js, content/onboarding/items.json, scripts/{onboarding-sim,build-onboarding-items,onboarding-test}.js, scripts/placement-sim.js (--summary, --limits, --clock, --fast, --quick=fast), services/placement-seconds.js, services/adaptive-placement.js (short-first, clockEnded) and unit-placement.js (limits), content/bank.js and services/lessons.js (the self-test fix, below), services/scorecard/index.js (exports STYLE_MAP), public/js/{auth,profile}.js, public/act.html and scripts/act-landing-test.js (the 20 to 57 minute text).

## 7. Assumptions in one place

Population sd 17 points; independent measures; each item has a validity r (single item: 0.1 to 0.65) and its family a ceiling rho (self-report 0.45, goals 0.5, working memory 0.85, speed 0.8, reading 0.75, reasoning 0.75, switching 0.5, mini-lesson 0.55, tastes 0.45, confidence 0.55); items of one family on one measure share a persistent method error (so repeating a method stops helping at its ceiling); a learner's pace is lognormal (sd 0.28) around the median; validity falls by up to 20% over an hour of fatigue; an item's seconds vary 20% around its median.

## 8. The self-test failure of 2 Nov (fixed in round 2)

`scripts/self-test.js` "its questions are not the worked example above them" failed on main 9f43826 as well, deterministically with the current data file. **Root cause:** `content/bank.js` decided a lesson's check question was "not the example" by `itemKey` (prompt + answer + options), so "Which word starts with the letter t?" with the answer tiger passed as a new question next to the worked example of the same stem with the answer toe. The test (correctly) holds that a check may not be the stem of the example above it. Whether the draw collided depended on the position of the self-test's seeded random stream, which earlier steps move by an amount that depends on the data file's contents, so it passed at the 9f43826 merge run and fails on today's file: not leftover state and not a date seed, a real hole that a lucky draw hid. **Fix (in the code, not the check):** `bank.stemKey` blocks an item's exact wording, `services/lessons.js` passes the stems of the worked examples (and of the first check) as `extraAvoid`, and `generateMany` gives a draw that carries stem keys 40 attempts instead of 8. Self-test passed 3 runs in a row on 3 copies of today's data file.
