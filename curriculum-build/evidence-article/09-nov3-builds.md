# Evidence section 09: the 3 November 2026 builds

Written 3 November 2026 on branch ev-09. Scope: onboarding modes, retention goals, the practice ramp, the daily plan, uploads emphasis, behavioural footprints and drift, plus a check of the coefficients the simulations assumed.

## How it was checked, and the limits

- Every source was resolved through Crossref (title, first author and year match the DOI record). Abstracts came from Crossref, OpenAlex, Europe PMC or Semantic Scholar; the code checked that each quote below appears word for word in the abstract (`09-work/build09.js`). Each quote is under 25 words.
- **The support rating is ONE reviewer's (Claude's), read against the abstract.** It was not rated by two independent models with planted errors as sections 06 to 08 were, because that setup was not run for this section. Treat the ratings as a careful single read, and the verbatim quotes as machine-checked.
- A source counts toward a mechanism only if its abstract shows the claim as worded. Where no abstract could be retrieved the source is title-level only and is not counted. Mabe & West 1982 and Azucar et al. 2018 had no machine-readable abstract: their quotes are fragments of the abstract taken from a repository record and are flagged in the sources file. Their full texts were not seen.
- Support is for the general principle. For every mechanism the exact numbers in the code (thresholds, weights, minutes) are design values unless stated.
- All Savant accuracy figures in the docs are SIMULATED; nothing here is a result on real learners.

## Summary

| id | mechanism | counted sources | verdict (short) |
|---|---|---|---|
| 09-M1 | Adaptive item choice: the next item is the one that removes the most uncertainty per expected second | 4 | strong for adaptive selection in general |
| 09-M2 | Fully adaptive selection over a correlated posterior (one answer updates every related measure) | 3 | moderate |
| 09-M3 | Working-memory span task (verbal span, 110 s) | 4 | strong for the reliability of span tasks |
| 09-M4 | Processing-speed task (symbol matching, 75 s) | 4 | moderate |
| 09-M5 | Task-switch cost (two blocks, switch cost as a difference score) | 4 | mixed |
| 09-M6 | Reading rate and comprehension (two short passages) | 2 | design choice |
| 09-M7 | Mini-lesson with choice points (what the learner chooses when it is theirs to decide) | 4 | moderate to design choice |
| 09-M8 | A/B teaching-style taste with a recall check on both versions | 4 | strong against using a stated preference to choose how to teach |
| 09-M9 | Reliability and validity of short self-report (two forced-choice items per measure) | 5 | mixed |
| 09-M10 | Best review gap as a share of the retention interval (gap limit 35% of the horizon; a review about every 15% of the time left before a test) | 4 | strong for the direction |
| 09-M11 | Spacing against cramming for a test date (reviews spread, a final review the day before, a short one the day of) | 3 | moderate for spacing over cramming |
| 09-M12 | Starting difficulty near the learner's level (start offset, clamped to base plus or minus 2) | 4 | moderate |
| 09-M13 | Warm-ups and difficulty rising within a block | 3 | mixed to design choice |
| 09-M14 | Desirable difficulties, and errorless against errorful learning | 5 | strong for errorful practice with feedback in neurologically typical learners |
| 09-M15 | Reviews first, then new material | 3 | moderate |
| 09-M16 | Splitting the day across subjects | 4 | moderate to mixed |
| 09-M17 | Time budgeting by need and level length | 3 | design choice with moderate support for the principle that study time should follow need and the region of proximal learning |
| 09-M18 | Breaks at block boundaries (every breakEveryMinutes, default 15; breakMinutes, default 3) | 3 | mixed |
| 09-M19 | Signaling: headings, bold, boxes and repetition as cues to what matters | 3 | moderate |
| 09-M20 | Instructor emphasis as a cue to what will be assessed ("this will be on the exam" weighs 2.5) | 1 | design choice with fewer than 3 usable sources |
| 09-M21 | Coverage of key points (every point of weight 3.4 or more must be taught, one revision, then "partial") | 2 | design choice with fewer than 3 usable sources |
| 09-M22 | Behaviour as a trait indicator, in aggregate (footprints: kinds CP, VOL, EMB, PRM) | 4 | moderate for the principle |
| 09-M23 | Specific footprints: voluntary practice, persistence after failure, help-seeking, goal keeping | 4 | design choice |
| 09-M24 | Trait change over time, which justifies fading old evidence (one 90-day half-life; per-measure rates designed, not built) | 4 | strong that traits are mostly stable but do change, and that state-like measures change more |

24 mechanisms: 6 strong, 9 moderate, 4 mixed, 5 design choice. 21 have 3 or more counted sources; 3 have fewer (09-M6 with 2, 09-M20 with 1, 09-M21 with 2) and are not claimed as backed. 71 distinct sources are cited here, 36 of them new to the evidence base and 35 already in it.

## 1 Onboarding modes

### 09-M1. Adaptive item choice: the next item is the one that removes the most uncertainty per expected second

- **Where:** services/onboarding/model.js gainOf and pickNext (lines 78 and 93 at 726cf67); services/onboarding/plan.js Planner.next (line 61)
- **What it does:** After every answer the next item is the one with the largest drop in summed posterior sd per expected second at the learner's own pace, among items that fit in the time left; Balanced and Accurate stop below 0.1 points per minute.
- **Evidence:**
  - Weiss (1982), Applied Psychological Measurement. DOI 10.1177/014662168200600408. Setting: review of adaptive-testing research (IRT). Shows: IRT-based adaptive tests improve measurement quality and efficiency.
    "adaptive tests can be designed (1) to improve both measurement quality and measurement efficiency"
  - Gibbons (2008), Psychiatric Services. DOI 10.1176/ps.2008.59.4.361. Setting: 800 outpatients in treatment for mood or anxiety disorder, simulated then live. Shows: a CAT cut a 616-item mood and anxiety scale to 24 to 30 items with a .93 correlation to the full score.
    "Both simulated and live CAT showed a 95% average reduction (585 items) in items administered"
  - Choi (2009), Quality of Life Research. DOI 10.1007/s11136-009-9560-5. Setting: post hoc simulation on PROMIS calibration data. Shows: CAT beat fixed short forms of a 28-item depression bank, but short forms did only marginally worse.
    "CAT outperformed each static short form in almost all criteria"
  - van der Linden (2008), Journal of Educational and Behavioral Statistics. DOI 10.3102/1076998607302626. Setting: hierarchical model, adaptive LSAT example. Shows: time can enter item selection when a response-time model exists.
    "Response times on items can be used to improve item selection in adaptive testing provided that a probabilistic model for their distribution is available."
- **Verdict:** strong for adaptive selection in general (large item savings at the same precision); design choice for the exact rule "information per second" (the abstracts show response times can inform selection, not that dividing gain by seconds is best)
- **Does the code match?** Partly. The principle matches. Choi 2010 finds fixed short forms only marginally worse, so the gain from adaptivity is modest where the pool is small; the stopping threshold (0.1 points per minute) and the importance weights are design values with no study.

### 09-M2. Fully adaptive selection over a correlated posterior (one answer updates every related measure)

- **Where:** services/onboarding/model.js (posterior and selection, the correlated-prior change of 3 Nov); correlation structure from scripts/scorecard-recovery-sim.js drawTruth (--truth-factors)
- **What it does:** Measures are not treated as independent: a prior covariance (a general factor plus one factor per category) lets one reading move the estimates of related measures, and the next item is chosen for the gain across all 100.
- **Evidence:**
  - Segall (1996), Psychometrika. DOI 10.1007/bf02294343. Setting: simulated response data. Shows: adaptive testing that uses correlated dimensions needs about a third fewer items for the same reliability.
    "multidimensional adaptive testing (MAT) can provide equal or higher reliabilities with about one-third fewer items"
  - Wang (2011), Psychometrika. DOI 10.1007/s11336-011-9215-7. Setting: two simulation studies. Shows: item-selection rules for multidimensional adaptive tests differ in accuracy; mutual information did best in two simulation studies.
    "mutual information not only improved the overall estimation accuracy but also yielded the smallest conditional mean squared error in most region of"
  - Gibbons (2008), Psychiatric Services. DOI 10.1176/ps.2008.59.4.361. Setting: 800 outpatients. Shows: a bifactor (general plus group factors) model fitted a clinical scale and supported its adaptive form.
    "Tests of competing models based on item response theory supported the scale's bifactor structure"
- **Verdict:** moderate (all three are simulations or one clinical scale; none tests a 100-measure learner profile)
- **Does the code match?** Principle matches; the size of the gain depends on the true correlations of the 100 measures, which are an assumption (validity-scenarios.json truth_correlation: supported for cognitive measures, unsupported in size for the rest).

### 09-M3. Working-memory span task (verbal span, 110 s)

- **Where:** services/onboarding/pool.js t:span_verbal (line 41 at 726cf67); services/onboarding/tasks.js; model.js FAMILIES.wm
- **What it does:** A span task reads working_memory_span (r .65), with small readings on intake_baseline and chunk_granularity; the family ceiling is .85 (central .82, optimistic .91 after the check).
- **Evidence:**
  - Unsworth (2005), Behavior Research Methods. DOI 10.3758/bf03192720. Setting: automated Ospan, undergraduate samples. Shows: an automated operation-span task is reliable and loads on a working-memory factor.
    "good internal consistency (alpha = .78) and test-retest reliability (.83)"
  - Waters (2003), Behavior Research Methods, Instruments, &amp; Computers. DOI 10.3758/bf03195534. Setting: 139 adults in five age groups. Shows: retest correlations of seven verbal span measures over about 6 weeks.
    "ranged from .52 to .81"
  - Redick (2012), European Journal of Psychological Assessment. DOI 10.1027/1015-5759/a000123. Setting: over 6,000 young adults. Shows: norms and reliability for three automated complex-span tasks.
    "Combining the samples from three testing locations yielded data from over 6,000 young adult participants"
  - Calamia (2013), The Clinical Neuropsychologist. DOI 10.1080/13854046.2013.809795. Setting: meta-analysis of neuropsychological tests. Shows: some memory and executive scores have retest reliability below .7.
    "The values for some of the memory and executive functioning scores were lower (i.e., less than r=.7)."
- **Verdict:** strong for the reliability of span tasks; unsupported for this 110-second verbal task (no source measured it) and for the .65 loading
- **Does the code match?** Ceiling .85 is at the top of what the retest range supports (sqrt of .52 to .83 is .72 to .91); central .82. The per-task r .65 stays below that, but the loading of a task on the construct is not given by any source.

### 09-M4. Processing-speed task (symbol matching, 75 s)

- **Where:** services/onboarding/pool.js t:symbol_match (line 42); model.js FAMILIES.speed
- **What it does:** A timed symbol-match task reads processing_velocity (r .60) and small readings on intake_baseline and warmup_latency; ceiling .80.
- **Evidence:**
  - Salthouse (1996), Psychological Review. DOI 10.1037/0033-295x.103.3.403. Setting: review of adult age differences in cognition. Shows: speed measures share variance, so one speed task reads a general speed factor.
    "considerable shared age-related variance across various measures of speed"
  - Strober (2018), Multiple Sclerosis Journal. DOI 10.1177/1352458518808204. Setting: data from 14 MS registration trials. Shows: the symbol-digit task was the better speed measure in 14 multiple sclerosis trials (no coefficient in the abstract).
    "the SDMT proved superior to the PASAT"
  - Kail (1994), Acta Psychologica. DOI 10.1016/0001-6918(94)90003-5. Setting: review across the lifespan. Shows: processing speed is related to reasoning and memory across the lifespan.
    "speed of processing should be viewed as a fundamental part of the architecture of the cognitive system"
  - Calamia (2013), The Clinical Neuropsychologist. DOI 10.1080/13854046.2013.809795. Setting: meta-analysis. Shows: typical meta-analytic retest reliability of widely used neuropsychological scores.
    "ranged from adequate to high (i.e., r=.7 and higher)"
- **Verdict:** moderate (reliability and the role of speed are supported; the task's own validity and the .80 are not given)
- **Does the code match?** Partly: a high ceiling is supported by retest reliability of .7 and above; no source gives the loading of a 75-second task on the app's processing_velocity.

### 09-M5. Task-switch cost (two blocks, switch cost as a difference score)

- **Where:** services/onboarding/pool.js t:switch_a, t:switch_b (lines 45 to 46); model.js FAMILIES.switch; scripts/lib/scorecard-footprints.js rule_switch
- **What it does:** Switch cost reads cognitive_flexibility (r .30 to .35) and related measures; the family ceiling is .50.
- **Evidence:**
  - Eckart (2021), Emotion. DOI 10.1037/emo0000972. Setting: two-week retest, healthy adults. Shows: response-time switch costs were reliable in an affective task-switching paradigm; error-rate costs were substantially lower.
    "good test-retest reliabilities (ICC(2,1) of .78 and .82, respectively) for response time-based switch costs"
  - Hughes (2013), Behavior Research Methods. DOI 10.3758/s13428-013-0411-5. Setting: two experiments with and without response deadlines. Shows: the scoring method changes the reliability and validity of switch costs.
    "the strongest methods were the rate residual and bin score methods"
  - Hedge (2017), Behavior Research Methods. DOI 10.3758/s13428-017-0935-1. Setting: seven classic tasks, three studies. Shows: difference-score tasks (not task switching) often have low reliability because people differ little.
    "Reliabilities ranged from 0 to .82, being surprisingly low for most tasks given their common use."
  - Kiesel (2010), Psychological Bulletin. DOI 10.1037/a0019842. Setting: review. Shows: the paradigm is an established way to study cognitive control.
    "The task-switching paradigm offers enormous possibilities to study cognitive control as well as task interference."
- **Verdict:** mixed (reliable for response times in one well-controlled paradigm, much weaker for error rates and for other difference scores; no source gives .5)
- **Does the code match?** Partly. The old code comment "reliability about .5 (Hughes 2014)" is not in that abstract. The ceiling .50 sits inside the cited spread; the abstracts support scoring with rate-residual or inverse-efficiency scores rather than a plain latency difference, which tasks.js should be checked against.

### 09-M6. Reading rate and comprehension (two short passages)

- **Where:** services/onboarding/pool.js t:read_1, t:read_2 (lines 43 to 44); tasks.js norms; model.js FAMILIES.read
- **What it does:** Reading time and comprehension of two passages read vocabulary_ceiling, processing_velocity, text_density_tolerance and others; ceiling .75.
- **Evidence:**
  - Brysbaert (2019), Journal of Memory and Language. DOI 10.1016/j.jml.2019.104047. Setting: 190 studies, 18,573 participants. Shows: adult silent reading rate averages 238 wpm for non-fiction, with reliable individual differences.
    "Within each group/task there are reliable individual differences"
  - Rayner (2016), Psychological Science in the Public Interest. DOI 10.1177/1529100615623267. Setting: review of reading research. Shows: reading speed rests on language skill and cannot be raised greatly without losing comprehension.
    "language skill is at the heart of reading speed"
- **Verdict:** design choice (population norms are supported; no source gives the reliability or validity of a 2-passage measure; fewer than 3 usable sources)
- **Does the code match?** The 238 wpm norm is supported. The .75 ceiling is an unsupported, conservative guess.

### 09-M7. Mini-lesson with choice points (what the learner chooses when it is theirs to decide)

- **Where:** services/onboarding/pool.js m:part1 to m:part3 (lines near 70 at 726cf67); tasks.js scoreMiniLesson (line 170); model.js FAMILIES.ml
- **What it does:** Seven to eight choices in three parts (why or steps, hint or try, plan or dive in, deeper or move on, challenge or solo, bonus or skip, connect, one more) read about 15 measures at r .15 to .30; family ceiling .55 (central .42 after the check).
- **Evidence:**
  - Fleeson (2009), Journal of Personality and Social Psychology. DOI 10.1037/a0016786. Setting: 15 experience-sampling studies, more than 20,000 reports. Shows: trait standing predicts behaviour averaged over many occasions at r .42 to .56 (not one occasion).
    "predicting average levels with correlations between .42 and .56"
  - Kornell (2006), Journal of Experimental Psychology: Learning, Memory, and Cognition. DOI 10.1037/0278-7393.32.3.609. Setting: three experiments with college students. Shows: what learners choose when given control is systematic and related to learning.
    "participants chose the easiest items and benefited from doing so"
  - Son (2000), Journal of Experimental Psychology: Learning, Memory, and Cognition. DOI 10.1037/0278-7393.26.1.204. Setting: review and three experiments. Shows: study-time choices follow judged difficulty, but flip under time pressure.
    "people allocate more study time to judged-difficult than to judged-easy items"
  - Karich (2014), Review of Educational Research. DOI 10.3102/0034654314526064. Setting: meta-analysis, 18 articles, 29 effects. Shows: giving learners control did not change outcomes on average (so the choices are reads, not an intervention).
    "The overall effect of including learner control within educational technology was almost zero (g = 0.05)"
- **Verdict:** moderate to design choice: choices are systematic and aggregated behaviour relates to traits, but no study validates these choice points as reads of these 15 measures
- **Does the code match?** No. The .55 ceiling equals the top of the range found for behaviour averaged over MANY occasions; three choice points are a few occasions, so the central ceiling is lowered to .42 and the sims report .55 as the optimistic case.

### 09-M8. A/B teaching-style taste with a recall check on both versions

- **Where:** services/onboarding/pool.js a:examples, a:visual, a:depth, a:story; tasks.js; model.js FAMILIES.taste
- **What it does:** The learner reads two versions of a short excerpt, recalls from each, and says which they preferred; preference and the recall gap both read teaching-style measures; ceiling .45.
- **Evidence:**
  - Pashler (2008), Psychological Science in the Public Interest. DOI 10.1111/j.1539-6053.2009.01038.x. Setting: review of learning-styles research. Shows: the meshing claim; the review concludes the evidence for it is lacking.
    "Proponents of learning-style assessment contend that optimal instruction requires diagnosing individuals' learning style and tailoring instruction accordingly."
  - Rogowsky (2015), Journal of Educational Psychology. DOI 10.1037/a0037478. Setting: college-educated adults, random assignment to audiobook or e-text. Shows: matching instruction mode to stated preference did not improve comprehension.
    "the results of our investigation failed to statistically support the meshing hypothesis"
  - Knoll (2016), British Journal of Psychology. DOI 10.1111/bjop.12214. Setting: word-pair and picture-pair lists, cued recall. Shows: a stated verbal or visual preference was linked to feeling of learning, not to recall.
    "There was no association between VVQ scores and recall or JOL accuracy."
  - Willingham (2015), Teaching of Psychology. DOI 10.1177/0098628315589505. Setting: review. Shows: learning-styles theories lack scientific support.
    "scientific support for these theories is lacking"
- **Verdict:** strong against using a stated preference to choose how to teach; the design (preference measured next to what was actually learned) follows what that literature asks for, but a single excerpt gives a single-trial recall gap
- **Does the code match?** Partly. Savant does not tailor by preference alone; it records the recall gap too. The ceiling .45 is an unsupported guess, since these sources test whether preference predicts benefit, not whether it reads the app's teaching-style traits.

### 09-M9. Reliability and validity of short self-report (two forced-choice items per measure)

- **Where:** services/onboarding/pool.js sf:<stat>:a and b (line 33); model.js FAMILIES.self (ceiling .45)
- **What it does:** Each of 100 measures has two forced-choice items at r .25; items of one family share a persistent error so repetition stops helping at .45.
- **Evidence:**
  - Fleeson (2009), Journal of Personality and Social Psychology. DOI 10.1037/a0016786. Setting: 15 experience-sampling studies. Shows: questionnaire trait standing against averaged behaviour: the ceiling range used.
    "predicting average levels with correlations between .42 and .56"
  - Mabe (1982), Journal of Applied Psychology. DOI 10.1037/0021-9010.67.3.280. Setting: 55 studies (abstract fragment from a mirror; full text not seen). Shows: self-evaluations of ability against performance: low mean validity, high variability (SD .25).
    "mean r = .29"
  - Dang (2020), Trends in Cognitive Sciences. DOI 10.1016/j.tics.2020.01.007. Setting: review. Shows: self-report and behaviour correlate weakly, partly because behavioural measures are unreliable.
    "Accumulating evidence indicates weak correlations between self-report and behavioral measures of the same construct."
  - Credé (2012), Journal of Personality and Social Psychology. DOI 10.1037/a0027403. Setting: employees (N = 437) and students (N = 355). Shows: single items understate trait effects; longer measures are more valid.
    "particularly the use of single-item measures, can lead researchers to substantially underestimate the role that personality traits play"
  - Nisbett (1977), Psychological Review. DOI 10.1037/0033-295x.84.3.231. Setting: review of experiments. Shows: people's reports on their own cognitive processes rest on implicit theories, not introspection.
    "there may be little or no direct introspective access to higher order cognitive processes"
- **Verdict:** mixed: .42 to .56 for a questionnaire against averaged behaviour, .29 mean for single ability self-evaluations with a spread of .25, weak for self-report against behavioural tasks; the forced-choice single-item value is not measured
- **Does the code match?** Partly. The .45 ceiling is inside the cited range and .25 per item is consistent with .29, but no source gives a single forced-choice item validity for these 100 constructs. Mabe & West is about ability, not these traits.

## 2 Retention goals

### 09-M10. Best review gap as a share of the retention interval (gap limit 35% of the horizon; a review about every 15% of the time left before a test)

- **Where:** services/retention-goal.js GAP_MAX (line 48), GAP_SHARE (line 50), datePlan (line 129); docs/RETENTION-GOALS.md
- **What it does:** An enforcer type is kept while its spacing is at most 35% of the horizon; a test-date plan reviews about every 15% of the time left, never under 2 days.
- **Evidence:**
  - Cepeda (2008), Psychological Science. DOI 10.1111/j.1467-9280.2008.02209.x. Setting: 1,350+ people, gaps to 3.5 months, delays to 1 year, facts. Shows: the best gap, as a share of the delay, shrinks as the delay grows.
    "the optimal gap declined from about 20 to 40% of a 1-week test delay to about 5 to 10% of a 1-year test delay"
  - Cepeda (2006), Psychological Bulletin. DOI 10.1037/0033-2909.132.3.354. Setting: meta-analysis of 839 assessments. Shows: in 317 experiments the best gap grows with the retention interval.
    "the ISI producing maximal retention increased as retention interval increased"
  - Rohrer (2007), Current Directions in Psychological Science. DOI 10.1111/j.1467-8721.2007.00500.x. Setting: learners studying facts, with a mathematics focus. Shows: the benefit of a gap depends on both the gap and the test delay.
    "depends jointly on the interval between study sessions and the interval between study and test"
  - Bahrick (1993), Psychological Science. DOI 10.1111/j.1467-9280.1993.tb00571.x. Setting: 4 subjects over 9 years, 300 word pairs. Shows: long gaps matched twice as many short-gap sessions for retention up to 5 years.
    "Thirteen retraining sessions spaced at 56 days yielded retention comparable to 26 sessions spaced at 14 days."
- **Verdict:** strong for the direction (best share falls as the interval grows); the exact 35% cap and 15% step are design values
- **Does the code match?** No for the doc and a code comment: the old text said the best gap is "roughly 10-20% of the retention interval". The evidence is 20 to 40% for a week and 5 to 10% for a year, so no single share holds. 35% is a permissive cap (above the best share for any horizon past a week), and 15% a step lies between the 20 to 40% and 5 to 10% ends, so it suits a horizon between a week and a year by interpolation only. Code issue (not changed here): services/retention-goal.js line 16 repeats the 10-20% wording.

### 09-M11. Spacing against cramming for a test date (reviews spread, a final review the day before, a short one the day of)

- **Where:** services/retention-goal.js datePlan (line 129); docs/RETENTION-GOALS.md "A test date"
- **What it does:** A test date replaces the calendar types with reviews every ~15% of the time left, a final review the day before over everything weakest first, and a short review on the day.
- **Evidence:**
  - Kornell (2009), Applied Cognitive Psychology. DOI 10.1002/acp.1537. Setting: GRE-type word pairs, web-based flashcards, three experiments. Shows: spacing beat massing study on the last day before the test, for 90% of participants.
    "Spacing was also more effective than cramming"
  - Carpenter (2008), Applied Cognitive Psychology. DOI 10.1002/acp.1507. Setting: 8th grade students, U.S. history facts. Shows: a late review by testing gave the best 9-month retention in a classroom.
    "The best retention occurred for facts that were reviewed by testing after a 16-week time interval."
  - Pashler (2007), Psychonomic Bulletin &amp; Review. DOI 10.3758/bf03194050. Setting: review of the authors' studies. Shows: the research programme on spacing over retention intervals up to a year (abstract states the questions, not the answers). NOT COUNTED.
    "How does spacing of practice affect retention of information over significant retention intervals (up to 1 year)?"
  - Cepeda (2006), Psychological Bulletin. DOI 10.1037/0033-2909.132.3.354. Setting: meta-analysis. Shows: spacing grows with the retention interval.
    "the ISI producing maximal retention increased as retention interval increased"
- **Verdict:** moderate for spacing over cramming; design choice for the day-before final review and the day-of review (no abstract tests them)
- **Does the code match?** Partly. Spacing against cramming is supported with a final test after a delay; none of the sources tests the last review the day before or the day of. Pashler 2007 is not counted (its abstract only lists questions).

## 3 Practice ramp

### 09-M12. Starting difficulty near the learner's level (start offset, clamped to base plus or minus 2)

- **Where:** services/sessions.js applySpecRamp (line 176): difficulty = clamp(base + s + r x (k - (n-1)/2), base-2, base+2)
- **What it does:** The focus items of a block start at the learner's base difficulty plus a start offset and rise by a ramp step, never more than 2 from base.
- **Evidence:**
  - Wilson (2019), Nature Communications. DOI 10.1038/s41467-019-12552-4. Setting: artificial and biologically plausible neural networks, not people. Shows: training is fastest at about 85% accuracy for gradient-descent learners.
    "the optimal error rate for training is around 15.87% or, conversely, that the optimal training accuracy is about 85%"
  - Guadagnoli (2004), Journal of Motor Behavior. DOI 10.3200/jmbr.36.2.212-224. Setting: framework for motor learning. Shows: practice difficulty should be matched to the performer's skill.
    "The fundamental idea is that motor tasks represent different challenges for performers of different abilities."
  - Metcalfe (2003), Journal of Experimental Psychology: General. DOI 10.1037/0096-3445.132.4.530. Setting: learners studying items of varied difficulty. Shows: time on medium-difficulty items gave the best performance.
    "best performance resulted when most time was given to the medium-difficulty items"
  - Kornell (2006), Journal of Experimental Psychology: Learning, Memory, and Cognition. DOI 10.1037/0278-7393.32.3.609. Setting: three experiments with college students. Shows: when forced to choose among unknown items, choosing the easiest helped.
    "participants chose the easiest items and benefited from doing so"
- **Verdict:** moderate: matching difficulty to skill is supported across a theory paper, a framework and two experiments; the 85% figure is for algorithms, not people
- **Does the code match?** Principle yes; the numbers (offset, ramp, the plus or minus 2 clamp) are design values. Do not cite the 85% rule as human evidence.

### 09-M13. Warm-ups and difficulty rising within a block

- **Where:** services/sessions.js applySpecRamp (line 176): up to 3 warm-ups at base - 1.5, then focus items rising around the start offset
- **What it does:** Up to three easier items open the block (base - 1.5); the focus items then rise step by step.
- **Evidence:**
  - Renkl (2003), Educational Psychologist. DOI 10.1207/s15326985ep3801_3. Setting: theoretical analysis of cognitive load across skill acquisition. Shows: as skill grows, demands can rise gradually without overload.
    "a gradual increase of problem-solving demands is possible without inducing cognitive overload"
  - Hawkins (2005), School Psychology Review. DOI 10.1080/02796015.2005.12088016. Setting: 52 fifth-graders, six math assignments. Shows: adding brief easy problems improved accuracy on harder target problems in one assignment type.
    "target problem accuracy was significantly higher for the 1:3 ratio relative to the other two ratios"
  - Belfiore (1997), Journal of Applied Behavior Analysis. DOI 10.1901/jaba.1997.30-327. Setting: 2 students, alternative school. Shows: a sequence of easy problems shortened the latency to start hard ones.
    "intervention resulted in a decrease in latency between problems for both students"
- **Verdict:** mixed to design choice: small, mostly single-case or one-class studies of easy items before hard ones; no study of warm-ups at base - 1.5 or of a rising ramp inside a practice block
- **Does the code match?** Partly. Easy-first sequencing has small supporting studies (52 and 2 students) and a gradual-rise argument; the sizes (3 warm-ups, -1.5) are design values.

### 09-M14. Desirable difficulties, and errorless against errorful learning

- **Where:** services/sessions.js planLessonRaw stretch items at base + 1.5 and applySpecRamp; support items at base - 1.5
- **What it does:** Each block includes stretch items one and a half above base and keeps reviews first; no mode removes errors entirely.
- **Evidence:**
  - Kornell (2009), Journal of Experimental Psychology: Learning, Memory, and Cognition. DOI 10.1037/a0015729. Setting: college students, six experiments. Shows: trying and failing before seeing the answer beat reading the answer.
    "Unsuccessful retrieval attempts enhanced learning with both types of materials."
  - Hays (2013), Journal of Experimental Psychology: Learning, Memory, and Cognition. DOI 10.1037/a0028468. Setting: three experiments. Shows: failed tests help when feedback is immediate.
    "failed tests followed by immediate feedback produced greater retention than did a presentation-only condition"
  - Metcalfe (2017), Annual Review of Psychology. DOI 10.1146/annurev-psych-010416-044022. Setting: review of laboratory studies. Shows: errors followed by feedback help neurologically typical students.
    "errorful learning followed by corrective feedback is beneficial to learning"
  - Clare (2008), Neuropsychology Review. DOI 10.1007/s11065-008-9051-4. Setting: review of memory rehabilitation. Shows: errorless learning helps some people with memory impairment on some tasks.
    "The evidence suggests that EL offers valuable benefits for at least some people with memory impairments when teaching certain types of tasks."
  - Soderstrom (2015), Perspectives on Psychological Science. DOI 10.1177/1745691615569000. Setting: integrative review. Shows: in-session performance can mislead about learning.
    "performance, which is often an unreliable index of whether the relatively long-term changes that constitute learning have taken place"
- **Verdict:** strong for errorful practice with feedback in neurologically typical learners; errorless learning is supported only for some people with memory impairment
- **Does the code match?** Yes for typical learners (stretch items, feedback). Under-13 and learners with memory difficulty are not separately handled by the ramp; no source tested the exact stretch of +1.5.

## 4 Daily plan

### 09-M15. Reviews first, then new material

- **Where:** services/daily-plan.js allocate (line 164), REVIEW_SHARE 0.5 and REVIEW_SHARE_URGENT 0.8 (lines 44 to 45)
- **What it does:** Review sittings come first, up to half the day (80% when a test is within 7 days or a memory check waits), then new material.
- **Evidence:**
  - PastÃ¶tter (2014), Frontiers in Psychology. DOI 10.3389/fpsyg.2014.00286. Setting: review of laboratory research. Shows: recalling old material first can improve learning of new material.
    "recall testing of previously studied information can enhance learning of subsequently presented new information"
  - Szpunar (2008), Journal of Experimental Psychology: Learning, Memory, and Cognition. DOI 10.1037/a0013082. Setting: four laboratory experiments. Shows: tests inside a study session reduce proactive interference.
    "interpolating tests during the study sequence insulates against this negative influence"
  - Carpenter (2008), Applied Cognitive Psychology. DOI 10.1002/acp.1507. Setting: 8th grade students. Shows: reviewing by testing beat restudy 9 months later.
    "Facts reviewed through testing were retained significantly better than facts reviewed through re-studying"
- **Verdict:** moderate (laboratory and one classroom study support retrieval before new material; no study sets the 50% and 80% shares)
- **Does the code match?** Principle yes; the shares are design values.

### 09-M16. Splitting the day across subjects

- **Where:** services/daily-plan.js allocate: need = 1 + date need + 4 x lag + catch-up 0.6 + momentum 0.3, x1.5 after a missed day; share by need / (minutes given + 6); a subject untouched for two days gets its next level first
- **What it does:** New material is shared among subjects by need, not given all to one subject a day.
- **Evidence:**
  - Cepeda (2006), Psychological Bulletin. DOI 10.1037/0033-2909.132.3.354. Setting: meta-analysis. Shows: distributed practice effects over 317 experiments.
    "the ISI producing maximal retention increased as retention interval increased"
  - Kornell (2009), Applied Cognitive Psychology. DOI 10.1002/acp.1537. Setting: flashcards, three experiments. Shows: spreading study beat massing it the day before a test.
    "Spacing was also more effective than cramming"
  - Rohrer (2015), Journal of Educational Psychology. DOI 10.1037/edu0000001. Setting: 126 seventh-grade students, 3 months. Shows: mixing problem types beat blocking by one subject-matter in mathematics.
    "interleaved practice produced higher scores on both the immediate and delayed tests (Cohen's ds 0.42 and 0.79, respectively)"
  - Brunmair (2019), Psychological Bulletin. DOI 10.1037/bul0000209. Setting: meta-analysis. Shows: interleaving can hurt for texts and words.
    "The interleaved learning, however, should be used with caution in certain conditions, especially for expository texts and words."
- **Verdict:** moderate to mixed: spreading practice over days helps; interleaving helps in mathematics and can hurt with texts and words; the need formula is a design
- **Does the code match?** Partly. Splitting across subjects is spacing across days (supported), not interleaving within a session; the weights (4 x lag, 0.5 + 4e^(-days/10)) are design values.

### 09-M17. Time budgeting by need and level length

- **Where:** services/daily-plan.js needOf (line 108), dateNeed (line 100), levelMinutes (line 80)
- **What it does:** Minutes go to the subjects with the greatest need; a level is never cut; minutes come from the learner's own pace once two sessions are seen.
- **Evidence:**
  - Metcalfe (2003), Journal of Experimental Psychology: General. DOI 10.1037/0096-3445.132.4.530. Setting: learners with items of varied difficulty. Shows: self-chosen study time goes to medium items, easiest first, and was largely appropriate.
    "people, given free choice, devoted most time to medium-difficulty items and studied the easiest items first"
  - Son (2000), Journal of Experimental Psychology: Learning, Memory, and Cognition. DOI 10.1037/0278-7393.26.1.204. Setting: review and three experiments. Shows: under time pressure people shift time to easy items.
    "in Experiment 1, when participants had insufficient time to study, they allocated more time to the judged-easy items than to the judged-difficult items"
  - Kornell (2006), Journal of Experimental Psychology: Learning, Memory, and Cognition. DOI 10.1037/0278-7393.32.3.609. Setting: three experiments. Shows: study choices link to learning.
    "when forced to choose among items they did not know, participants chose the easiest items and benefited from doing so"
- **Verdict:** design choice with moderate support for the principle that study time should follow need and the region of proximal learning; no study sets the formula
- **Does the code match?** Partly. The studies concern allocating study time among items in a session; allocating minutes among school subjects by test date and lag is an extension with no direct study.

### 09-M18. Breaks at block boundaries (every breakEveryMinutes, default 15; breakMinutes, default 3)

- **Where:** services/daily-plan.js studyBudget (line 121), withBreaks (line 316); default session in gather (line 453)
- **What it does:** Breaks are placed between blocks and counted against the day's minutes.
- **Evidence:**
  - Ariga (2011), Cognition. DOI 10.1016/j.cognition.2010.12.007. Setting: laboratory vigilance task. Shows: a brief switch of task prevented the decline in a vigilance task.
    "when observers were asked to sporadically recollect the digits during the vigilance task, the vigilance decrement was averted"
  - Albulescu (2022), PLOS ONE. DOI 10.1371/journal.pone.0272460. Setting: meta-analysis, 22 samples, N = 2,335. Shows: micro-breaks give small gains in vigor, no significant gain in performance overall.
    "statistically significant but small effects of micro-breaks in boosting vigor"
  - Sievertsen (2016), Proceedings of the National Academy of Sciences. DOI 10.1073/pnas.1516947113. Setting: Danish public school children, 2009 to 2013. Shows: a 20 to 30 minute break raised standardized test scores.
    "a 20- to 30-minute break improves average test scores"
- **Verdict:** mixed: breaks help vigor and, in one large school dataset, test scores; the performance effect of micro-breaks overall was not significant; no study sets 15 minutes and 3 minutes
- **Does the code match?** Partly: breaks are supported in direction; the 15 and 3 defaults are design values taken from the spec.

## 5 Uploads emphasis

### 09-M19. Signaling: headings, bold, boxes and repetition as cues to what matters

- **Where:** services/material-keypoints.js (signals and weights, lines 18 to 39); docs/UPLOADS-ANY-FORMAT.md section 2
- **What it does:** Boxed lines, bold, summaries, "I'll say that again" and restatement add to a key point's emphasis weight (1 to 5).
- **Evidence:**
  - Mautone (2001), Journal of Educational Psychology. DOI 10.1037/0022-0663.93.2.377. Setting: students given a short science lesson, three experiments. Shows: a preview summary, section headings and pointer words improved transfer.
    "The signaling did not add any additional content information about lift but helped clarify the structure of the passage."
  - Lorch (1993), Journal of Educational Psychology. DOI 10.1037/0022-0663.85.2.281. Setting: two text-recall experiments. Shows: headings, overviews and summaries improved memory for topics and their organization.
    "Signaling produced better memory for the topics and their organization."
  - Rickards (1997), Journal of Educational Psychology. DOI 10.1037/0022-0663.89.3.508. Setting: undergraduates listening to or reading passages. Shows: structural cues plus note-taking maximized recall.
    "When notetaking on signaled text, recall was maximized; on nonsignaled text, recall was minimized."
- **Verdict:** moderate (consistent effects of headings, overviews, summaries and pointer words in text recall and transfer; bold type and boxes are not tested in these abstracts)
- **Does the code match?** Partly. The cue types tested are headings, overviews, summaries and pointer words; the weights for bold, boxes and "on the exam" lines (2.0, 1.6, 2.5) are design values.

### 09-M20. Instructor emphasis as a cue to what will be assessed ("this will be on the exam" weighs 2.5)

- **Where:** services/material-keypoints.js TEST_CUES (line 31), weight 2.5; docs/UPLOADS-ANY-FORMAT.md
- **What it does:** A spoken or written test cue raises the weight of the sentence it concerns and of the slide it is in.
- **Evidence:**
  - Brown (1977), Child Development. DOI 10.2307/1128873. Setting: 20 subjects at each of four age levels (8, 10, 12, 18). Shows: readers' recall follows adult ratings of structural importance of a passage's units.
    "At all ages, the units judged most important dominated recall attempts, while the least important units were rarely recalled."
- **Verdict:** design choice with fewer than 3 usable sources (one abstract-checked study shows importance drives recall; no abstract-checked study shows that instructors' exam cues predict test content). Not counted as backed.
- **Does the code match?** Unsupported at 3 sources: kept as a design weight. Proposal below.

### 09-M21. Coverage of key points (every point of weight 3.4 or more must be taught, one revision, then "partial")

- **Where:** services/course-builder.js GATE_MIN (line 63); services/material-keypoints.js
- **What it does:** After a build, each key point with two real signals must appear in some skill's lesson, key points or questions.
- **Evidence:**
  - Brown (1977), Child Development. DOI 10.2307/1128873. Setting: four age groups. Shows: important units dominate what is recalled, so omitting them costs recall of what matters.
    "the units judged most important dominated recall attempts"
  - Lorch (1993), Journal of Educational Psychology. DOI 10.1037/0022-0663.85.2.281. Setting: two experiments. Shows: signalled structure improves memory for the text's topics.
    "Signaling produced better memory for the topics and their organization."
- **Verdict:** design choice with fewer than 3 usable sources (the gate is a completeness check on the builder, not a learning mechanism a study tested)
- **Does the code match?** Matches the product aim. No study sets 3.4. Not counted as backed.

## 6 Behavioural footprints and drift

### 09-M22. Behaviour as a trait indicator, in aggregate (footprints: kinds CP, VOL, EMB, PRM)

- **Where:** scripts/lib/scorecard-footprints.js KINDS (ceiling validities .40, .35, .50, .35)
- **What it does:** In-app choices, voluntary behaviour, embedded switches and one-tap prompts read 24 measures at conservative ceilings.
- **Evidence:**
  - Fleeson (2009), Journal of Personality and Social Psychology. DOI 10.1037/a0016786. Setting: 15 experience-sampling studies. Shows: trait standing predicts behaviour averaged over many occasions at r .42 to .56 (.40 is just under).
    "predicting average levels with correlations between .42 and .56"
  - Azucar (2018), Personality and Individual Differences. DOI 10.1016/j.paid.2017.12.018. Setting: meta-analysis of 14 works (abstract fragment from a repository record). Shows: traits predicted from social-media digital footprints correlate .29 to .40 with self-reported traits.
    "correlations ranging from 0.29 (Agreeableness) to 0.40 (Extraversion)"
  - Kosinski (2013), Proceedings of the National Academy of Sciences. DOI 10.1073/pnas.1218772110. Setting: over 58,000 volunteers. Shows: digital behavioural records predict personal attributes including personality traits.
    "easily accessible digital records of behavior, Facebook Likes, can be used to automatically and accurately predict a range of highly sensitive personal attributes"
  - Fleeson (2001), Journal of Personality and Social Psychology. DOI 10.1037/0022-3514.80.6.1011. Setting: three experience-sampling studies, 2 to 3 weeks. Shows: people's average behaviour is a stable individual difference while single occasions vary widely.
    "individual differences in central tendencies of behavioral distributions were almost perfectly stable"
- **Verdict:** moderate for the principle (behaviour aggregated over many occasions reads traits at about .3 to .5); the per-event values and the independence of the footprints' errors are unsupported
- **Does the code match?** Yes for the ceilings (.40 is under the .42 floor, .35 inside .29 to .40); no for any per-event value (unsupported, conservative guesses).

### 09-M23. Specific footprints: voluntary practice, persistence after failure, help-seeking, goal keeping

- **Where:** scripts/lib/scorecard-footprints.js extra_practice, retry_after_fail, plan_set_and_kept; services/scorecard hooks (not changed)
- **What it does:** Extra practice nobody scheduled reads intrinsic motivation; a retry after a fail reads persistence; a plan set and kept reads planning tendency.
- **Evidence:**
  - Deci (1999), Psychological Bulletin. DOI 10.1037/0033-2909.125.6.627. Setting: meta-analysis of 128 studies. Shows: free-choice behaviour is the behavioural measure of intrinsic motivation in 128 experiments (no validity value).
    "engagement-contingent, completion-contingent, and performance-contingent rewards significantly undermined free-choice intrinsic motivation"
  - Aleven (2006), International Journal of Artificial Intelligence in Education. DOI 10.3233/irg-2006-16(2)02. Setting: intelligent tutor logs. Shows: help-seeking can be modelled and evaluated from tutor logs.
    "we used it off-line to evaluate students' help-seeking behavior in an existing data set of student-tutor interactions"
  - Baker (2007), Proceedings of the SIGCHI Conference on Human Factors in Computing Systems. DOI 10.1145/1240624.1240785. Setting: intelligent tutoring system students. Shows: off-task behaviour in a tutor is detectable from logs and related to attitudes and motivation.
    "We use this model in combination with motivational and attitudinal instruments, developing a profile of the attitudes and motivations associated with off-task behavior"
  - Gollwitzer (1999), American Psychologist. DOI 10.1037/0003-066x.54.7.493. Setting: program of research. Shows: if-then plans help people act on goals (this is a cause, not a trait read).
    "A program of research demonstrates that implementation intentions further the attainment of goals"
- **Verdict:** design choice: logs can detect these behaviours and the constructs are real, but no checked study validates "extra practice", "retry after fail" or "plan kept" as reads of the named measures
- **Does the code match?** Partly. The old file said free-choice persistence is "the standard behavioural measure"; the abstract shows it is the measure in that meta-analysis, not a validity.

### 09-M24. Trait change over time, which justifies fading old evidence (one 90-day half-life; per-measure rates designed, not built)

- **Where:** services/scorecard/index.js EVIDENCE_HALF_LIFE_DAYS (line 74, value 90, not changed here); scripts/scorecard-drift-sim.js (toy, stabilities 0.8 to 0.95 a year)
- **What it does:** Old evidence fades with time; the design adds a half-life per measure and variance inflation per day.
- **Evidence:**
  - Roberts (2000), Psychological Bulletin. DOI 10.1037/0033-2909.126.1.3. Setting: meta-analysis of 152 longitudinal studies. Shows: rank-order consistency of traits rises with age; retest correlations over 6.7 years are .54 to .74 for adults.
    "trait consistency increased from .31 in childhood to .54 during the college years, to .64 at age 30"
  - Anusic (2016), Journal of Personality and Social Psychology. DOI 10.1037/pspp0000066. Setting: meta-analytic stability and change model. Shows: most reliable trait variance is stable, and changing factors matter more for affect, self-esteem and life satisfaction (42% to 56%).
    "The results showed that the majority of reliable variance in personality traits is attributable to stable influences (83%)."
  - Bleidorn (2022), Psychological Bulletin. DOI 10.1037/bul0000365. Setting: meta-analysis of longitudinal studies, N = 242,542. Shows: rank-order stability reaches a plateau in young adulthood and cumulative mean-level changes are slightly smaller than earlier estimates.
    "we found little evidence for increasing rank-order stabilities after Age 25"
  - Roberts (2006), Psychological Bulletin. DOI 10.1037/0033-2909.132.1.1. Setting: meta-analysis of 92 samples. Shows: mean levels of traits change across the life course.
    "people increase in measures of social dominance (a facet of extraversion), conscientiousness, and emotional stability, especially in young adulthood"
- **Verdict:** strong that traits are mostly stable but do change, and that state-like measures change more; the exact half-life (90 days) and the toy's yearly stability are design values
- **Does the code match?** Partly. A one-year rank-order stability of .8 to .95 brackets the adult retest correlations of .54 to .74 over 6.7 years only if change is spread evenly over the years (an assumption); the code keeps ONE 90-day half-life for every measure, while the evidence says state-like measures (affect, self-esteem) change more than traits. The per-measure half-life in docs/SCORECARD-90.md 11.7 is not built.

## The coefficients the simulations assumed, checked

Full numbers, scenarios and quotes: `09-work/validity-scenarios.json` (built by `09-work/build-validity.js`, quotes verified verbatim by code). The onboarding table below is `today` (the from-memory values, the pessimistic scenario), `central` (research-checked) and `optimistic` (top of the cited range).

| family | today | central | optimistic | verdict |
|---|---|---|---|---|
| self | 0.45 | 0.45 | 0.56 | partly supported (range .42-.56 against self-reported-trait-to-behaviour is cited; the exact .45 and the per-item .25 are not measured for these items) |
| goal | 0.5 | 0.5 | 0.5 | unsupported, conservative guess (kept equal in central and optimistic) |
| wm | 0.85 | 0.82 | 0.91 | partly supported (reliability is cited, the loading on the construct is not) |
| speed | 0.8 | 0.8 | 0.89 | partly supported (retest reliability supports a high ceiling; the exact .80 and the task loading are not given) |
| read | 0.75 | 0.75 | 0.75 | unsupported, conservative guess (kept equal in central and optimistic) |
| reason | 0.75 | 0.75 | 0.85 | partly supported (one source, a lower bound on short-set quality; the pool design differs from the nine-item form) |
| switch | 0.5 | 0.5 | 0.71 | partly supported (the range is cited; the figure .5 attributed to Hughes 2014 is not in its abstract) |
| ml | 0.55 | 0.42 | 0.56 | partly supported (one source; applies to many occasions, so central is lowered below the old .55) |
| taste | 0.45 | 0.45 | 0.45 | unsupported, conservative guess (kept equal in central and optimistic) |
| conf | 0.55 | 0.55 | 0.55 | unsupported (trait supported; the coefficient is a conservative guess) |

Changes of value: only the mini-lesson family (.55 to .42 central). wm (.85 to .82 central) and the reasons for keeping the rest are in the JSON. Four coefficients are unsupported and are kept equal in central and optimistic: goal, read, taste and conf.

Truth correlation (the world the onboarding sim draws): the parent assumption (cognitive measures g .5 and category .3, others .25 and .4) is too WEAK for cognitive measures. A general factor explains an average of 45.9% of the variance of cognitive tests (SD 12.9%; 97 samples, 31 countries), a loading of about .68 and a between-test r near .46, against .25 across categories in the sim. For personality-like measures the Big Five are correlated (two higher-order factors, a general factor) but no abstract could be read for the size, so the sim's .06 across and .22 within stay as unsupported, conservative guesses.

### Footprints (`scripts/lib/scorecard-footprints.js`)

| item | before | after the check |
|---|---|---|
| CP ceiling validity .40 | "about .4 for averaged behaviour (Epstein 1979; Fleeson & Gallagher 2009)" | kept: Fleeson & Gallagher 2009 give .42 to .56 for behaviour averaged over many occasions (against self-reported trait standing), so .40 is just under the floor. Epstein 1979 could be checked at title level only and is not counted. |
| CP per-event r .2, VOL .14, EMB .17, PRM rho1 .04 | stated as anchored | marked "unsupported, conservative guess": no checked source gives a single-event value. |
| VOL ceiling .35 | "r .29 to .40 in a meta-analysis (Azucar 2018)" | kept: the range is right (.29 Agreeableness to .40 Extraversion) but it is traits predicted from social-media footprints against self-reported traits, not in-app behaviour against a true value. |
| EMB ceiling .50 | "switch-cost difference scores are weakly reliable (Hedge 2018)" | WRONG attribution: Hedge tested Flanker, Stroop, stop-signal, go/no-go, Posner, Navon and SNARC, not task switching (reliabilities 0 to .82). Replaced by Eckart 2021 (response-time switch cost retest ICC .78 and .82, error-rate costs lower) and Hughes 2014. The .50 stays as an unsupported, conservative guess inside the spread. |
| VOL "free-choice persistence is the standard behavioural measure (Deci 1999)" | | narrowed: free-choice behaviour is the measure the 128 experiments used; the paper gives effect sizes of rewards, not a validity. |
| PRM ceiling .35 | | unsupported, conservative guess; Russell 1989 shows one-item affect ratings have adequate reliability and convergent validity for mood (a state). |
| each footprint's `why` | 14 citations from memory | each rewritten to say what the source shows; 10 are now labelled "a design inference" or "unsupported" because the abstract does not show that the behaviour reads the named measure. Cacioppo & Petty 1982, Pirolli & Card 1999 and Schraw & Dennison 1994 are title-level only. |

Re-run of the footprint simulation on 3 Nov 2026 (`scripts/scorecard-90-measure.js --foot=1`, same dumps and flags as docs/SCORECARD-90.md section 11): no coefficient value changed, so every SIMULATED number reproduced exactly (held-out seed C 93.74 with footprints against 93.70 without; A+B 93.62 against 93.52; validity x0.75 93.71, x0.5 93.70; CP only 93.76, VOL only 93.71, EMB only 93.70, PRM only 93.71).

### Code and doc issues found and NOT changed here

- `services/retention-goal.js` line 16 repeats "best gap roughly 10-20% of the retention interval"; Cepeda 2008 gives 20 to 40% for a week and 5 to 10% for a year. `GAP_MAX = 0.35` (line 48) and `GAP_SHARE = 0.15` (line 50) are design values. docs/RETENTION-GOALS.md was corrected.
- `services/onboarding/model.js` comment "switch-cost difference scores: reliability ~.5 (Hughes et al. 2014)": not in that abstract.
- `services/onboarding/model.js` FAMILIES.ml ceiling .55 is the top of the range for behaviour averaged over many occasions; central .42.
- `services/scorecard/index.js` EVIDENCE_HALF_LIFE_DAYS (line 74) is one value (90) for every measure; the evidence says state-like measures change more than traits (Anusic 2016).
- Task-switch scoring (services/onboarding/tasks.js) should be checked against Hughes 2014: rate-residual, bin or inverse-efficiency scores beat a plain latency difference.

## Proposals (each needs 3 or more sources before it is built)

1. **Per-measure evidence half-lives** (design in docs/SCORECARD-90.md 11.7): sources Roberts & DelVecchio 2000, Anusic & Schimmack 2016, Bleidorn et al. 2022 (all counted). Effect: a better estimate when real change is bigger than noise (the toy gains 1.2 points at day 365 at stability .8). Risk: a wrong rate fades true evidence; a too-slow fade costs little. Files: services/scorecard/index.js (owned by another worktree), scripts/scorecard-drift-sim.js.
2. **Score switch cost as a rate-residual or inverse-efficiency score** (Hughes 2014 only counted source for the scoring claim; needs two more). Files: services/onboarding/tasks.js, scripts/onboarding-test.js.
3. **Test the exam-cue weight** (09-M20, one counted source): find 3 studies on instructor emphasis and test content before keeping 2.5. Files: services/material-keypoints.js.
4. **Retention gap by horizon**: replace the single GAP_MAX with a share that falls with the horizon (20 to 40% at 1 week, 5 to 10% at 1 year, Cepeda 2008, Cepeda 2006, Rohrer & Pashler 2007). Files: services/retention-goal.js (no change made here).

## Sources cited but not counted

- Epstein 1979, Cacioppo & Petty 1982, Pirolli & Card 1999, Schraw & Dennison 1994, Thiede & Dunlosky 1999, Lorch 1989, Titsworth & Kiewra 2004, Schneider et al. 2018, Richter et al. 2016, Ponce et al. 2022, Johnson 1970, Reder & Anderson 1980: DOI resolved on Crossref but no abstract could be retrieved by code, so they are title-level only. Search-engine summaries of some were seen but are not verbatim and are not used.
- Pashler et al. 2007 in 09-M11: its abstract lists questions, not results.
- Hedge 2018 is cited in 09-M5 only for what it shows (difference-score tasks that are not task switching).