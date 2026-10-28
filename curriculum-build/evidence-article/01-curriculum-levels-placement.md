# 01. Curriculum, levels and placement: the evidence (2026-10-25)

This section covers how Savant places a learner, how a grade's path is laid out, how a lesson is built, how a session is planned, how mastery moves a learner on, how grade-fit and objective coverage are enforced, how a failed checkpoint is remediated, and the rules the AI lesson writers work under.

**How to read it.**
- Each mechanism gives `file:line`, what it does with its numbers, at least three sources, a verdict and whether the code matches the evidence.
- Sources marked **NEW** were verified for this section. They are listed in `01-curriculum-levels-placement-sources.json`, with their DOIs checked on Crossref (or DataCite for arXiv and Zenodo DOIs). Titles, first authors and years match.
- Every other id is reused, already DOI-verified, from `scorecard-sources.json` or `retention-sources.json`. Their quotes come from `SCORECARD-CLAIM-CHECK-2026-10-25.md` or from the retention recheck quotes.
- Eight reused sources are used here for a new claim (kang2007, smith2014, kulik1988, bangertdrowns1991freq, ackerman2009, renkl2003, kapur2016, mettler2016). Their abstracts were re-fetched from OpenAlex by DOI, their titles were confirmed and they were requoted. They are marked **requoted**.
- "Title-level only" means no abstract could be retrieved, so the claim rests on the title and the venue.
- Grade-fit standards: `curriculum-build/GRADE-FIT-STANDARDS.md` was not in the repo when this was written. Mechanisms 54 and 55 cite the Common Core pages directly and should cross-reference that file once it lands. `FACT-REVERIFY-2026-10-25.md` was also absent.

**Totals.**

| | Count |
| --- | --- |
| Mechanisms | 64 |
| With 3 or more sources | 64 |
| Strong | 19 |
| Moderate | 27 |
| Mixed | 6 |
| Design choice | 12 |
| Distinct sources cited | 168 (47 new, 121 reused) |
| Proposals | 10 (P1-P10) |

---

## A. Placement: the difficulty ladder (`services/placement.js`)

The difficulty ladder is used for grades without a unit bank. Grades with a bank use the adaptive walk in section B.

### M1. Placement length scales with the claimed tier
- **Where:** `config/curriculum.js:745-747`, used by `services/placement.js:26-28`.
- **What:** 20 questions at tier 1, rising 7.5 per tier to 50 at tier 5. Fixed length, with no precision-based stop.
- **Evidence:**
  - babcock2012 **NEW** (10.7333/1212-0101001). *Setting:* simulation of CAT termination rules.
    - "longer CATs yielded more accurate trait estimation, but there were diminishing returns with a very large number of items"
  - ackerman2009 **requoted** (10.1037/a0015719). *Setting:* 239 first-year university students on SAT batteries of 3.5 to 5.5 hours.
    - "subjective fatigue increased with increasing time-on-task. However, mean performance increased in the longer test length conditions"
  - debeer2014 (10.3102/1076998614558485). *Setting:* PISA 2009 reading, 15-year-olds.
    - "A decrease in examinee effort during the PISA reading assessment was found consistently across countries"
  - borgonovi2016 (10.1016/j.lindif.2016.06.001). *Setting:* PISA 2012, 15-year-olds.
    - "academic endurance, defined as students' ability to maintain their baseline rates of successful test completion for the duration of a low-stakes cognitive test"
- **Verdict:** design choice. More items buy precision with diminishing returns, while effort drops over a low-stakes test. No study fixes 20 to 50.
- **Match:** partly. The trade-off is respected by the cap. The gap is that the ladder stops on length, not on precision. The adaptive walk (M8) already does the better thing; this ladder is the fallback.

### M2. Strictly ascending ladder, rotating through the grade's skills
- **Where:** `services/placement.js:17-38`.
- **What:**
  - Difficulty climbs linearly from 1 to one point above the claimed tier's target (`{1:3, 2:4.5, 3:6, 4:7.5, 5:9}`), with a cap of 10.
  - Item *i* goes to skill `i % skills.length`, so every skill is sampled at several difficulties.
- **Evidence:**
  - weiss1984 (10.1111/j.1745-3984.1984.tb01040.x). *Setting:* review of CAT applications in education.
    - "Each of these applications makes use of item response theory to select test questions from an item pool"
  - wauters2010 (10.1111/j.1365-2729.2010.00368.x). *Setting:* review of adaptive item-based learning environments.
    - "adaptive item sequencing by matching the difficulty of the items to the learner's knowledge level"
  - hartig2012 (https://openalex.org/W2117924135). *Setting:* PISA, multilevel IRT.
    - "A significant negative effect of item position on performance was found in all countries"
  - debeer2013 (10.1111/jedm.12009). *Setting:* IRT methodology.
    - "changes in item order may affect item and test characteristics"
  - wainer1987 **NEW** (10.1111/j.1745-3984.1987.tb00274.x). *Setting:* measurement essay.
    - "a bundle of items that can be arranged either hierarchically or linearly, thus maintaining the efficiency of an adaptive test"
- **Verdict:** mixed.
  - Content balancing across skills is standard.
  - A fixed ascending order confounds difficulty with position and fatigue: the hardest items always come last, when effort is lowest. Adaptive selection is more efficient.
- **Match:** partly. Skill rotation matches. Ascending order means a tired learner looks less able at the top of the ladder.

### M3. Band scoring: hold at 70%, half credit at 50-70%, stop after two failing bands
- **Where:** `services/placement.js:44-54`, `services/placement.js:71-123`.
- **What:**
  - Five difficulty bands. A band at 70% or better is held, which credits its top. A band at 50-70% credits its middle.
  - Two consecutive bands under 50% end the walk, so one lucky hard answer or one slip cannot decide the level.
- **Evidence:**
  - lewis1990 **NEW** (10.1177/014662169001400404). *Setting:* simulated certification exam.
    - "average test lengths can be reduced by half without sacrificing classification accuracy"
  - spray1996 **NEW** (10.3102/10769986021004405). *Setting:* simulated pass/fail classification.
    - "the SPRT procedure required fewer test items than the sequential Bayes procedure to achieve the same level of classification accuracy"
  - wise2017 (10.1111/emip.12165). *Setting:* review of low-stakes testing.
    - "very short response time—termed rapid guessing—has been shown to indicate disengaged test taking"
  - guskey2007 **NEW** (10.4219/jaa-2007-704). *Setting:* review of mastery learning.
    - "Bloom believed that all students could be helped to reach a high criterion of learning if both the instructional methods and time were varied"
- **Verdict:** design choice. Sequential classification with a stopping rule is well supported. The 70/50 cut-offs and the "two bands" rule are reasoned values.
- **Match:** yes in spirit.
  - The gap: with roughly 4 to 10 items a band, a 70% band is noisy, and nothing models guessing on 4-option items.
  - The adaptive walk (M7) models guessing explicitly. The ladder does not.

### M4. Placement lands on a lesson, never on a checkpoint
- **Where:** `config/level-layout.js:490-508`, `services/placement.js:56-69`.
- **What:**
  - The placed level is rounded to the nearest lesson at or below it, or else ahead of it.
  - A learner is never dropped onto a quiz they have not been taught for, nor onto a bare practice level.
- **Evidence:**
  - kalyuga2003 (10.1207/s15326985ep3801_4). *Setting:* review, cognitive load theory.
    - "Instructional techniques that are highly effective with inexperienced learners can lose their effectiveness and even have negative consequences when used with more experienced learners."
  - tetzlaff2025 (10.1016/j.learninstruc.2025.102142). *Setting:* meta-analysis of the expertise reversal effect.
    - "Low prior knowledge learners learn better from high-assistance instruction (d = 0.505)."
  - renkl2014 (10.1111/cogs.12086). *Setting:* theory review, example-based learning.
    - "Learning from examples is a very effective means of initial cognitive skill acquisition."
  - pan2023pretest **NEW** (10.1007/s10648-023-09814-5). *Setting:* review of the pretesting literature.
    - "can benefit learning if there is an opportunity to study the correct answers afterwards"
- **Verdict:** moderate. Starting new material with instruction rather than a test fits the guidance and worked-example literature. A test without later study is the case pretesting does not support.
- **Match:** yes.

### M5. Seeded mastery is shrunk and capped; the first review comes early
- **Where:** `services/placement.js:142-161`.
- **What:**
  - Seeded mastery is `min(0.7, accuracy × 0.85)`. The placement items are added to `attempts`, so later evidence keeps its weight.
  - The first review is due in 1 day, or in 3 days for a skill at 80% or better.
- **Evidence:**
  - morris1983 (10.1080/01621459.1983.10477920). *Setting:* statistics review.
    - "reviews the state of multiparameter shrinkage estimators with emphasis on the empirical Bayes viewpoint"
  - casella1985 (10.1080/00031305.1985.10479400). *Setting:* statistics tutorial.
    - "The empirical Bayes model is much richer than either the classical or the ordinary Bayes model and often provides superior estimates of parameters."
  - bock1982 **NEW** (10.1177/014662168200600405). *Setting:* CAT simulation.
    - "Simulation studies are reported showing the near equivalence of the posterior standard deviation and the standard error of measurement."
  - cepeda2008 (10.1111/j.1467-9280.2008.02209.x). *Setting:* 1,354 adults, retention up to a year.
    - "the optimal gap declined from about 20 to 40% of a 1-week test delay to about 5 to 10% of a 1-year test delay"
- **Verdict:** design choice. Shrinking thin evidence toward a prior is the textbook remedy. The 0.7 cap, the 0.85 factor and the 1-day or 3-day gaps are reasoned values.
- **Match:** yes.
  - The shrinkage is a fixed multiplier, not one scaled by how many items each skill got.
  - A skill seen twice and a skill seen ten times shrink alike. See proposal P6.

### M6. Per-skill "gaps" under 60% and "strengths" at 80% or better
- **Where:** `services/placement.js:125-139`.
- **What:** each skill's raw placement accuracy marks it as a gap (under 60%) or a strength (80% or better).
- **Evidence:**
  - parsons2019 (10.1177/2515245919879695). *Setting:* methods paper, cognitive-behavioural measures.
    - "subpar reliability has severe implications for measures’ validity and interpretation"
  - hedge2018 (10.3758/s13428-017-0935-1). *Setting:* reliability of cognitive tasks.
    - "Experimental effects become well established - and thus those tasks become popular - when between-subject variability is low."
  - brown1978 (10.1016/s0364-0213(78)80004-4). *Setting:* elementary arithmetic bugs.
    - "explaining why a student is making a mistake as opposed to simply identifying the mistake"
  - kalyuga2004 (10.1037/0022-0663.96.3.558). *Setting:* rapid knowledge tests.
    - "a highly significant correlation (up to.92) between performance on the rapid measure and traditional measures of knowledge"
- **Verdict:** mixed.
  - Rapid diagnostic tests can be valid when they are built for the purpose (kalyuga2004).
  - A raw percentage from 4 to 12 incidental items per skill is unreliable. It labels a gap without saying why (brown1978).
- **Match:** partly. A skill can be called a gap on 1 of 3 right. Proposal P6 makes this Bayesian, with an "unsure" outcome.

---

## B. Adaptive placement: the subject walk and the unit walk

### M7. A Bayesian belief over position, with a guessing floor and a slip ceiling
- **Where:** `services/adaptive-placement.js:24-41`, `services/adaptive-placement.js:69-96`.
- **What:**
  - Belief sits on a grid in steps of 0.05 grade.
  - P(correct) = luck + (1 − slip − luck)·logistic((x − pos + 0.3)/0.2), where luck = guess + 0.15 (capped at 0.6) and slip = 0.10.
  - The posterior comes from summed log likelihoods.
- **Evidence:**
  - owen1975 **NEW** (10.1080/01621459.1975.10479871). *Setting:* adaptive mental testing (statistical method).
    - "A new kind of Bayesian motivated procedure is introduced which leads to a strongly consistent estimator."
  - bock1982 **NEW** (10.1177/014662168200600405). *Setting:* CAT simulation.
    - "is shown to have unusually good properties for computerized adaptive testing"
  - barton1981 **NEW** (10.1002/j.2333-8504.1981.tb01255.x). *Setting:* four achievement-test data sets.
    - "The fourth parameter increased the likelihood in only two of the four sets."
  - baker2008 **NEW** (10.1007/978-3-540-69132-7_44). *Setting:* Cognitive Tutor data.
    - "existing methods for determining these parameters are prone to the Identifiability Problem"
  - vanderlinden1998 **NEW** (10.1007/bf02294775). *Setting:* CAT method.
    - "This paper suggests several item selection criteria for adaptive testing which are all based on the use of the true posterior."
- **Verdict:** strong. Grid (EAP-style) Bayesian estimation with a guessing floor is the established CAT method.
- **Match:** yes.
  - The upper asymptote (slip) is added. Barton and Lord found it helps only sometimes, so it is harmless rather than necessary.
  - The parameters were tuned on simulated testers, not fitted to real responses (see M10).

### M8. Ask nearest the belief's middle; stop when the belief is narrow, or at the cap or the clock
- **Where:** `services/adaptive-placement.js:44-67` (MODES), `services/adaptive-placement.js:176`, `services/adaptive-placement.js:205-211`.
- **What:**

  | Mode | Most questions | Fewest questions | Mass within ±1 grade to stop |
  | --- | --- | --- | --- |
  | Quick | 32 | 18 | 0.94 |
  | Balanced | 70 | 20 | 0.97 |
  | Accurate | 130 | 40 | 0.995 |

  - Questions come in grade blocks, re-aimed after every answer.
- **Evidence:**
  - babcock2012 **NEW** (10.7333/1212-0101001). *Setting:* CAT simulation.
    - "Fixed-length CATs performed either slightly worse or comparable to their variable-length termination counterparts"
  - lewis1990 **NEW** (10.1177/014662169001400404). *Setting:* simulated certification test.
    - "shorter tests for individuals who have clearly mastered (or clearly not mastered) a given subject and longer tests for those individuals"
  - eggen1999 **NEW** (10.1177/01466219922031365). *Setting:* simulated classification CAT.
    - "Wald’s (1947) sequential probability ratio test can be implemented as an adaptive test for classifying examinees into categories."
  - wainer1987 **NEW** (10.1111/j.1745-3984.1987.tb00274.x). *Setting:* the case for testlets.
    - "Performance on the separate testlets is aggregated to yield ability estimates."
- **Verdict:** strong for the principle (variable-length, posterior-based stopping). The thresholds are design choices, tuned in simulation.
- **Match:** yes.

### M9. Mode time budgets: Quick 20, Balanced 45, Accurate 90 minutes
- **Where:** `services/adaptive-placement.js:50-55`, `services/unit-placement.js:32-47`, `services/gap-scan.js:31-40`.
- **What:** one budget per mode, shared by the subject walk, the in-grade walk and the gap scan. The owner set the limits.
- **Evidence:**
  - ackerman2009 **requoted** (10.1037/a0015719). *Setting:* university students.
    - "subjective fatigue increased with increasing time-on-task"
  - debeer2014 (10.3102/1076998614558485). *Setting:* PISA.
    - "A decrease in examinee effort during the PISA reading assessment was found consistently across countries"
  - wise2005 (10.1207/s15324818ame1802_2). *Setting:* low-stakes computer-based testing.
    - "unmotivated examinees will answer too quickly (i.e., before they have time to read and fully consider the item)"
  - babcock2012 **NEW** (10.7333/1212-0101001). *Setting:* CAT simulation.
    - "there were diminishing returns with a very large number of items"
- **Verdict:** design choice.
- **Match:** yes. The learner picks the precision they will sit for.
  - Gap: 90 minutes is long for a child, and the walk does not watch for rapid guessing late in a long session. The scorecard measures rapid guessing, but placement does not use it.

### M10. Item positions calibrated by judges and simulated testers; "reliable" shift 0.3
- **Where:** `services/adaptive-placement.js:24-41`, `services/unit-placement.js:80-117`.
- **What:**
  - Each question has a calibrated point, the place where a learner answers it reliably (about 9 in 10). The judges set it (`scripts/placement-second-judge.js`).
  - The slope is centred 0.3 grade below that point.
  - Uncalibrated unit questions sit at 0.75 of their unit.
- **Evidence:**
  - kaser2024 (10.1007/s40593-023-00337-2). *Setting:* systematic review of simulated learners.
    - "almost half of the studies using simulated learners do not provide any evidence that their modeling addresses the most fundamental question in simulation design"
  - meyers2009 (10.1080/08957340802558342). *Setting:* state test equating.
    - "item parameter invariance is threatened when an item appears in a different location on the live test"
  - pelanek2016 (10.1016/j.compedu.2016.03.017). *Setting:* review, Elo in adaptive systems. Title-level only.
  - klinkenberg2011 (10.1016/j.compedu.2011.02.003). *Setting:* Math Garden, on-the-fly item calibration. Title-level only.
  - doroudi2017 (10.1145/3051457.3051463). *Setting:* offline policy evaluation.
    - "existing methods for doing so can overestimate the performance of new teaching methods"
- **Verdict:** mixed.
  - Calibrating from expert judgement and simulation is a reasonable cold start.
  - The literature calibrates item difficulty from real responses, and warns that simulation-validated policies overestimate.
- **Match:** partly. No step updates item positions from live learner responses. See P4.

### M11. In-grade unit placement
- **Where:** `services/unit-placement.js:31-61`, `services/unit-placement.js:167-230`.
- **What:**

  | Mode | Most questions | Fewest questions | Confidence to stop | Clock |
  | --- | --- | --- | --- | --- |
  | Quick | 14 | 6 | 0.85 | 6 min |
  | Balanced | 30 | 10 | 0.95 | 13 min |
  | Accurate | 80 | 16 | 0.995 | 25 min |

  - Unit slope width 0.2 and reliable shift 0.3 (in units). Rounding goes 0.15 past the middle.
  - The learner starts at the placed unit's first lesson.
- **Evidence:**
  - lewis1990 **NEW** (10.1177/014662169001400404). Mastery testing with Bayesian decision theory.
    - "A theoretical framework for mastery testing based on item response theory and Bayesian decision theory is described."
  - spray1996 **NEW** (10.3102/10769986021004405). Placement as classification.
    - "Examples of such applications include licensure and certification, college selection, and placement into entry-level or developmental college courses."
  - eggen1999 **NEW** (10.1177/01466219922031365). *Setting:* simulation.
    - "testing algorithms using KLI-based item selection performed better than or as well as those using FI-based item selection"
  - owen1975 **NEW** (10.1080/01621459.1975.10479871). As in M7.
- **Verdict:** moderate. The method is the established classification CAT. The numbers are simulation-tuned design choices.
- **Match:** yes. The comment's claim that the simulated Accurate mode places 926 of 928 testers is a simulation, not a field result (kaser2024).

### M12. Quick check of skipped units; a unit missed twice is reopened
- **Where:** `services/unit-placement.js:1-20`, `services/unit-placement.js:244-301` (`markCheck`, with `misses >= 2` at line 290).
- **What:**
  - Each unit placed past gets one check question, unless placement already saw that unit answered right.
  - A unit whose check is missed twice is reopened, and the learner restarts at the earliest reopened unit.
- **Evidence:**
  - kalyuga2005 (10.1007/bf02504800). *Setting:* adaptive e-learning.
    - "instruction was dynamically tailored to changing levels of expertise using rapid tests of knowledge combined with measures of cognitive load"
  - kalyuga2004 (10.1037/0022-0663.96.3.558). *Setting:* rapid assessment.
    - "a highly significant correlation (up to.92) between performance on the rapid measure and traditional measures of knowledge"
  - lewis1990 **NEW** (10.1177/014662169001400404).
    - "average test lengths can be reduced by half without sacrificing classification accuracy"
  - pan2023pretest **NEW** (10.1007/s10648-023-09814-5).
    - "The evidence to date indicates that prequestioning and pretesting can often enhance learning"
- **Verdict:** design choice.
- **Match:** yes. Gap-only paths replace this with the unit belief (M13).

---

## C. Gap-only learning paths (`services/learner-path.js`, `services/gap-scan.js`)

### M13. One evidence model per unit; nothing is skipped without the unit's own evidence
- **Where:** `services/learner-path.js:1-20`, `services/learner-path.js:30-58` (knobs), `services/learner-path.js:60-110` (`unitBelief`).
- **What:**
  - The model folds answers into a Bayes belief that the unit is known, using these knobs:

    | Knob | Value |
    | --- | --- |
    | Prior for a unit placed past (HOLE_PRIOR) | 0.15 |
    | Prior at or after the placed unit (ISLAND_PRIOR) | 0.65 |
    | SLIP | 0.15 |
    | LUCK | 0.15 + 1/choices |
    | Known at | 0.965 or above |
    | Learn at | 0.6 or below |

  - The model is asymmetric on purpose: a false skip is "the worst mistake", so undecided units are worked.
- **Evidence:**
  - vandesande2013 **NEW** (10.5281/zenodo.3554629). *Setting:* analysis of BKT.
    - "use the individual student's performance at each opportunity to apply a skill to update the conditional probability that the student has learned that skill"
  - baker2008 **NEW** (10.1007/978-3-540-69132-7_44). *Setting:* Cognitive Tutor.
    - "The model uses four parameters per skill, fit using student performance data, to relate performance to learning."
  - lewis1990 **NEW** (10.1177/014662169001400404). Asymmetric losses in Bayesian mastery decisions.
    - "A theoretical framework for mastery testing based on item response theory and Bayesian decision theory is described."
  - corbett1994 (10.1007/bf01099821). *Setting:* knowledge tracing in the ACT Programming Tutor. Title-level only.
  - doroudi2019fair (10.1145/3303772.3303838). *Setting:* knowledge-tracing equity.
    - "knowledge tracing algorithms are substantially more equitable than giving all students the same amount of practice, such algorithms can still be inequitable"
- **Verdict:** strong for the method (Bayesian evidence and decision thresholds). The knob values are design choices.
- **Match:** yes.
  - Gap: the SLIP and LUCK knobs are global, not fitted per unit (baker2008).

### M14. The path steps over known units and records why
- **Where:** `services/mastery.js:221-273` (`advance`, `skippedCheckpointPatch`), `services/learner-path.js:1-20`.
- **What:**
  - Units that are known or done are stepped over. Their checkpoints are recorded as cleared, with their source: placement, quick check, test-out or gap scan.
  - A unit that is still unchecked is worked like `learn`.
- **Evidence:**
  - kalyuga2007 (10.1007/s10648-007-9054-3). *Setting:* review, learner-tailored instruction.
    - "This paper reviews recent empirical findings associated with the expertise reversal effect"
  - kalyuga2003 (10.1207/s15326985ep3801_4).
    - "Instructional techniques that are highly effective with inexperienced learners can lose their effectiveness"
  - steenbergenhu2016 **NEW** (10.3102/0034654316675417). *Setting:* second-order meta-analysis, K-12.
    - "accelerated students significantly outperformed their nonaccelerated same-age peers (g = 0.70)"
  - kulik1984accel **NEW** (10.3102/00346543054003409). *Setting:* meta-analysis of 26 controlled studies, K-12.
    - "examination performance of accelerates surpassed by nearly one grade level the performance of nonaccelerates of equivalent age and intelligence"
  - major2021 (10.1111/bjet.13116). *Setting:* meta-analysis, low- and middle-income countries.
    - "more personalised approaches which adapt or adjust to learners' level led to significantly greater impact (an effect size of 0.35)"
- **Verdict:** strong. Not re-teaching known material, and letting proven learners move on, both have converging meta-analytic support.
- **Match:** yes.

### M15. Earlier-grade gap scan, offered and never forced
- **Where:** `services/gap-scan.js:1-40`.
- **What:**
  - The scan looks at units below the recommended grade: where placement misses map down, and every unit of the grade just below.
  - Every candidate unit gets one question before any gets a second, likeliest gaps first.
  - A unit is decided only after one of its own bank questions. Units still undecided when the questions or the clock run out are `unchecked`, and are worked.
- **Evidence:**
  - vanlehn1990 (https://openalex.org/W1564397683). *Setting:* children's arithmetic.
    - "As children acquire arithmetic skills, they often develop small, local misconceptions that cause systematic errors."
  - brown1978 (10.1016/s0364-0213(78)80004-4). *Setting:* procedural bugs in arithmetic.
    - "explaining why a student is making a mistake as opposed to simply identifying the mistake"
  - kalyuga2005 (10.1007/bf02504800). Rapid diagnostic assessment.
    - "instruction was dynamically tailored to changing levels of expertise using rapid tests of knowledge"
  - koedinger2023 (10.1073/pnas.2221311120). *Setting:* 27 datasets, 1.3 million observations.
    - "typically increasing by about 0.1 log odds or 2.5% in accuracy per opportunity"
- **Verdict:** design choice. Local gaps below the frontier are well documented. Fixing them by targeted practice fits koedinger2023's finding that missing prior practice, not learning rate, is what separates students. No study sets the scan's order or the optional offer.
- **Match:** yes.

---

## D. The learning path and level layout (`config/curriculum.js`, `config/level-layout.js`)

### M16. Level rhythm: lesson every 10, Master every 25, Grand Master every 100, Graduation at the end
- **Where:**
  - `config/level-layout.js:64` (`DEFAULT_RULE`) and `config/level-layout.js:267-285` (`ruleKind`).
  - `config/curriculum.js:468-470`.
  - Level 1 is a lesson.
- **What:**
  - On a grade without a stated layout, levels 10, 20, 30 and so on are lessons, 25, 50 and 75 are Master quizzes, 100 and 200 are Grand Master quizzes, and the last level is the Graduation exam.
  - Grades with stated layouts (the English, ACT and Spanish sheets) put levels where the sheet says.
- **Evidence:**
  - bangertdrowns1991freq **requoted** (10.1080/00220671.1991.10702818). *Setting:* meta-analysis of classroom testing frequency.
    - "students who took at least one test during a 15-week term scored about one half of a standard deviation higher"
  - yang2021 (10.1037/bul0000309). *Setting:* meta-analysis of classroom quizzing.
    - "overall testing (quizzing) raises student academic achievement to a medium extent (g = 0.499)"
  - kulik1990 (10.2307/1170612). *Setting:* meta-analysis of 108 mastery learning studies.
    - "mastery learning programs have positive effects on the examination performance of students"
  - khanna2013 (10.1177/0098628313487458). *Setting:* college introductory psychology.
    - "Students completing courses with cumulative finals retained more than students who took noncumulative finals."
- **Verdict:** moderate.
  - Frequent checkpoints, mastery gating and a cumulative final are each supported.
  - The 10/25/100 spacing is a design choice.
- **Match:** yes.

### M17. Practice levels between lessons
- **Where:**
  - `config/level-layout.js:267-285`, where levels that are not lessons or checkpoints are `practice`.
  - `config/curriculum.js:866-876` (`practiceUntil`).
  - `services/lessons.js:193-203`.
- **What:**
  - The nine or so levels after a lesson practise that lesson's topic until the next lesson.
  - The focus skill stays the same across the run. Review and weak-skill items are mixed in only by the session planner (M41-M43).
- **Evidence:**
  - rohrer2007 (10.1007/s11251-007-9015-8). *Setting:* college mathematics.
    - "the practice problems are systematically shuffled so that each practice set includes a variety of problems drawn from many previous lessons"
  - rohrer2020 (10.1037/edu0000367). *Setting:* RCT in 7th-grade mathematics classes.
    - "the interleaved group outscored the blocked group, 61% versus 38%, d = 0.83"
  - taylor2010 (10.1002/acp.1598). *Setting:* 4th-grade mathematics.
    - "interleaving rather than blocking practice of different skills... usually improves subsequent test performance"
  - brunmair2019 (10.1037/bul0000209). *Setting:* meta-analysis.
    - "interleaving can effectively foster inductive learning... should be used with caution in certain conditions, especially for expository texts and words"
- **Verdict:** mixed.
  - Massed practice right after a lesson aids acquisition.
  - The interleaving studies show that mixing in earlier topics beats blocked runs on delayed tests, in mathematics especially. Brunmair limits this for expository text and words.
- **Match:** partly. Within a level, about 30% review and every third focus item come from other skills, so practice is partly interleaved. The run as a whole is still blocked on one topic. See P1.

### M18. Grade-band difficulty, linear inside the band
- **Where:** `config/curriculum.js:749-787` (`difficultyForLevel`, `gradeBand`).
- **What:**
  - A grade gets a slice of the 1-10 scale, centred on its position in the track and at least 2 points wide (`GRADE_BAND_WIDTH`).
  - Difficulty climbs linearly from the first level to the Final.
  - The code itself calls this "Linear is the honest choice for v1: item statistics in Phase 8 replace it".
- **Evidence:**
  - wilson2019 (10.1038/s41467-019-12552-4). *Setting:* theory and simulation.
    - "the optimal error rate for training is around 15.87% or, conversely, that the optimal training accuracy is about 85%"
  - wauters2010 (10.1111/j.1365-2729.2010.00368.x).
    - "adaptive item sequencing by matching the difficulty of the items to the learner's knowledge level"
  - koedinger2023 (10.1073/pnas.2221311120).
    - "typically increasing by about 0.1 log odds or 2.5% in accuracy per opportunity"
  - metcalfe2005 (10.1016/j.jml.2004.12.001). *Setting:* study-time allocation (region of proximal learning). Title-level only.
- **Verdict:** design choice.
  - A steady, slow increase in challenge fits the learning-rate data.
  - The linear map from level to item difficulty is uncalibrated.
- **Match:** partly. See P4: calibrate from real p-values, as the code already plans.

### M19. Each level's focus skill, and the cumulative "introduced" set
- **Where:** `config/curriculum.js:789-850` (`levelPlan`).
- **What:**
  - The focus skill is the skill of the topic taught at that level.
  - `introduced` holds every skill met so far. Review, checkpoints and level-up all draw on that set, "which is what keeps level 200 from forgetting level 3".
- **Evidence:**
  - mayfield2002 (10.1901/jaba.2002.35-105). *Setting:* college students, mathematics.
    - "On the final test, the cumulative group outscored the other groups on application and problem‐solving items."
  - rohrer2007 (10.1007/s11251-007-9015-8).
    - "each practice set includes a variety of problems drawn from many previous lessons"
  - lawrence2013 (10.1177/0098628312465858). *Setting:* introductory psychology.
    - "However, low-scoring students remembered more of the course material when they took cumulative exams throughout the semester."
  - szpunar2007 (10.3758/BF03193473). *Setting:* lab.
    - "subjects benefited more from initial testing when they also knew they would need to remember the information for ..."
- **Verdict:** strong. Cumulative practice and cumulative assessment converge.
- **Match:** yes.

### M20. Retention levels (retrieval only)
- **Where:**
  - `services/block-levels.js:64-70` (`isRetention`) and `services/block-levels.js:81-91`.
  - `services/block-levels.js:765-791`, where `SHAPE.retention` is 3-6 blocks and 3-6 checks, and the prompt says "Every block makes the learner produce or recognize from memory; nothing re-teaches at length".
- **What:** practice levels the sheet labels "(retention)" are built as pure retrieval practice on material already taught, aimed at the learner's struggles.
- **Evidence:**
  - roediger2006 (10.1111/j.1467-9280.2006.01693.x). *Setting:* college, prose passages.
    - "Taking a memory test not only assesses what one knows, but also enhances later retention"
  - adesope2017 (10.3102/0034654316689306). *Setting:* meta-analysis.
    - "practice tests are more beneficial for learning than restudying and all other comparison conditions"
  - agarwal2021 (10.1007/s10648-021-09595-9). *Setting:* review of applied research in schools.
    - "the majority of which (57%) revealed medium or large benefits from retrieval practice"
  - rowland2014 (10.1037/a0037559). *Setting:* meta-analysis.
    - "initial recall tests yielding larger testing benefits than recognition tests"
- **Verdict:** strong.
- **Match:** yes.

### M21. Checkpoint lengths 15, 25 and 40; pass marks 75%, 75% and 90%
- **Where:** `config/curriculum.js:595-607`.
- **What:**
  - A Master quiz is 15 items, a Grand Master quiz 25 and the Graduation exam 40.
  - The pass marks are 75%, 75% and 90%. Because accuracy must reach the mark, 15 items need 12 right (80%), 25 need 19 and 40 need 36.
- **Evidence:**
  - kulik1990 (10.2307/1170612).
    - "mastery learning programs have positive effects on the examination performance of students"
  - guskey2007 **NEW** (10.4219/jaa-2007-704).
    - "Bloom believed that all students could be helped to reach a high criterion of learning"
  - keller1968 **NEW** (10.1901/jaba.1968.1-79). *Setting:* the unit-mastery personalized system of instruction. Title-level only.
  - kulik1979 **NEW** (10.1037/0003-066X.34.4.307). *Setting:* meta-analysis of PSI outcome studies. Title-level only.
  - babcock2012 **NEW** (10.7333/1212-0101001).
    - "longer CATs yielded more accurate trait estimation"
- **Verdict:** moderate. Mastery gating at a high criterion is supported. The exact marks and lengths are design choices.
- **Match:** partly. This section worked out the binomial pass rates:

  | Checkpoint | Learner who is truly at | Chance of passing |
  | --- | --- | --- |
  | Master (15 items) | 70% | 0.30 |
  | Master (15 items) | 80% | 0.65 |
  | Master (15 items) | 90% | 0.94 |
  | Final (40 items) | 90% | 0.63 |

  - So the Final fails about a third of learners who really are at the mark.
  - Fixed-length checkpoints carry known classification error that nothing reports. See P3.

### M22. Written checkpoints in English
- **Where:**
  - `config/curriculum.js:512-571` (`ESSAY_TRACKS`, `ESSAY_PASS_MARK 0.75`, `ESSAY_MIN_WORDS 80`, quick-check lengths 5 and 8).
  - `services/sessions.js:1279-1330` (`areasFromEssay`: a rubric criterion under 3/4 is an area to work on).
- **What:** English Master and Grand Master checkpoints, or the sheet's Essay Draft and Essay Revision rows, are written work marked on a rubric. Under-scoring criteria become drill areas.
- **Evidence:**
  - graham2015 **NEW** (10.1086/681947). *Setting:* meta-analysis, grades 1-8.
    - "feedback to students about writing from adults, peers, self, and computers statistically enhanced writing quality"
  - panadero2013 **NEW** (10.1016/j.edurev.2013.01.002). *Setting:* review of 21 rubric studies.
    - "Findings indicate that rubrics may have the potential to influence students learning positively"
  - jonsson2007 **NEW** (10.1016/j.edurev.2007.05.002). *Setting:* review of rubric reliability and validity. Title-level only.
  - kane2013 (10.1111/jedm.12000). *Setting:* validity theory.
    - "To validate an interpretation or use of test scores is to evaluate the plausibility of the claims based on the scores."
- **Verdict:** moderate.
- **Match:** yes.
  - Gap: the AI rubric marking has no reported agreement with human markers, which the rubric-reliability literature asks for.

### M23. The Challenge Exam: a 25-level clean run, then five bands of seven, each band perfect
- **Where:**
  - `config/curriculum.js:630-702` (`SKIP_STREAK_LEVELS 25`, `SKIP_MARK 0.9`, 5 bands × 7 questions).
  - `services/mastery.js:407-487`.
- **What:**
  - After 25 levels each cleared at 90% or better, a 35-question exam on the next five ten-level marks is offered.
  - The learner lands on the first band that is not 7/7. Missing the first band skips nothing.
- **Evidence:**
  - steenbergenhu2016 **NEW** (10.3102/0034654316675417).
    - "acceleration appeared to have a positive, moderate, and statistically significant impact on students’ academic achievement (g = 0.42)"
  - kulik1984accel **NEW** (10.3102/00346543054003409).
    - "examination performance of accelerates surpassed by nearly one grade level the performance of nonaccelerates"
  - lewis1990 **NEW** (10.1177/014662169001400404).
    - "shorter tests for individuals who have clearly mastered (or clearly not mastered) a given subject"
  - kalyuga2003 (10.1207/s15326985ep3801_4).
    - "can lose their effectiveness and even have negative consequences when used with more experienced learners"
- **Verdict:** moderate. Letting proven learners skip ahead is well supported. The "perfect band" rule is a design choice.
- **Match:** partly.
  - A learner with a true 90% accuracy clears a 7/7 band only 48% of the time, and 70% at 95%. Clearing all five bands at 95% happens 17% of the time.
  - The rule is far stricter than its stated intent. See P3: a Bayesian band decision such as M13's.

---

## E. Lesson structure (`services/lessons.js`, `public/js/session.js`)

### M24. The order of a lesson: topic, worked example, a harder example, summary, then "Check what stuck"
- **Where:**
  - `services/lessons.js:153-224` (`buildFallback` sections).
  - `public/js/session.js:283-297`, which renders intro → sections → worked example → common mistakes → "In short" → a "Check what stuck (N questions)" button.
- **What:** every lesson states its topic and what it covers, shows a worked example, shows one a step harder, summarises, then asks 3 check questions (2 or more for AI lessons).
- **Evidence:**
  - sweller1985 (10.1207/s1532690xci0201_3). *Setting:* high-school algebra.
    - "schema acquisition is retarded by conventional problem-solving search techniques"
  - renkl2003 **requoted** (10.1207/s15326985ep3801_3). *Setting:* theory review.
    - "learning from worked-out examples, in comparison to problem solving, is very effective during the initial stages of cognitive skill acquisition"
  - atkinson2000 (10.2307/1170661). *Setting:* review.
    - "Worked examples are instructional devices that provide an expert's problem solution for a learner to study."
  - mayer1996 (10.1037/0022-0663.88.1.64). *Setting:* college, science summaries.
    - "recalled these steps and solved transfer problems as well as or better than students who received the full text along with the summary"
  - roediger2006 (10.1111/j.1467-9280.2006.01693.x).
    - "Taking a memory test not only assesses what one knows, but also enhances later retention"
- **Verdict:** strong. Worked examples first, then retrieval, is one of the most replicated sequences.
- **Match:** yes.

### M25. Examples at difficulty d−1 then d; checks at d and d±0.5
- **Where:** `services/lessons.js:118-151`.
- **What:**
  - Demo 1 sits at d−1 and demo 2 at d, both from the topic's family where one exists.
  - One on-topic check sits at d, and two from the rest of the skill sit at d−0.5 and d+0.5.
  - There is no fading: examples are complete, then checks are full problems.
- **Evidence:**
  - renkl2002 **NEW** (10.1080/00220970209599510). *Setting:* one field and two lab experiments.
    - "the fading procedure fosters learning, at least when near transfer performance is considered"
  - atkinson2003 **NEW** (10.1037/0022-0663.95.4.774). *Setting:* two experiments, probability problems.
    - "this combination produced medium to large effects on near and far transfer without requiring additional time on task"
  - salden2010 (10.1007/s11251-009-9107-8). *Setting:* Cognitive Tutor geometry.
    - "Both experiments provide evidence of improved learning results from adaptive fading of worked examples"
  - vanmerrienboer2003 **NEW** (10.1207/s15326985ep3801_2). *Setting:* design framework.
    - "we present a framework for scaffolding practice and just-in-time information presentation, aiming to control cognitive load effectively"
  - pollock2002 **NEW** (10.1016/s0959-4752(01)00016-0). *Setting:* simple-to-complex sequencing of complex information. Title-level only.
- **Verdict:** moderate. Moving from easier to harder is supported. Fading worked steps, with self-explanation prompts, beats example-problem pairs.
- **Match:** partly. The easy-to-hard step matches. Fading and self-explanation prompts are missing. See P2.

### M26. Checks never repeat the examples, or anything asked recently
- **Where:**
  - `services/lessons.js:75-90` (`LESSON_HISTORY 400`) and `services/lessons.js:135-150`.
  - `services/sessions.js:109-125` (`HISTORY_WINDOW 600`) and `services/sessions.js:81-107`, which tries up to 10 regenerations for an unseen item.
- **What:**
  - A check is never the example shown above it.
  - Practice avoids the last 600 items the learner was asked, on the same skills; lessons avoid the last 400.
- **Evidence:**
  - pan2018 (10.1037/bul0000151). *Setting:* meta-analysis of transfer.
    - "testing can yield transferrable learning as measured relative to a nontesting reexposure control condition (d = 0.40"
  - butler2017 (10.1037/xap0000142). *Setting:* four experiments, college.
    - "All four experiments showed that variability during retrieval practice produced superior transfer of knowledge to new examples."
  - hausknecht2007 **NEW** (10.1037/0021-9010.92.2.373). *Setting:* meta-analysis, 107 samples, 134,436 people.
    - "effects were larger when practice was accompanied by test coaching and when identical forms were used"
  - smith2014 **requoted** (10.1080/09658211.2013.831454). *Setting:* college, N=372.
    - "those that could be answered by recalling information verbatim from the texts and those that required inferences"
- **Verdict:** strong. Repeating an item measures memory for that item, and varied items transfer better.
- **Match:** yes.

### M27. The lesson says where it sits: topic N of M, which levels practise it, and the next lesson
- **Where:** `services/lessons.js:153-203` (`onward`, `about`, `intro`).
- **What:** the lesson opens with its topic and the creator's "covers" sentence, and ends by naming the practice levels and the next topic.
- **Evidence:**
  - ausubel1960 **NEW** (10.1037/h0046669). *Setting:* college students, an unfamiliar passage. Ausubel's stated hypothesis, which his study supported:
    - "can be facilitated by the advance introduction of relevant subsuming concepts (organizers)"
  - luiten1980 **NEW** (10.3102/00028312017002211). *Setting:* meta-analysis of 135 studies.
    - "Advance organizers were shown to have a facilitative effect on both learning and retention."
  - porter2002 **NEW** (10.3102/0013189X031007003). *Setting:* K-12 alignment tools.
    - "tools for measuring the content of instruction, the content of instructional materials, and the alignment between these"
  - hattan2023 **NEW** (10.3102/00346543221148478). *Setting:* systematic review of 54 articles on prior-knowledge activation in reading. It replaces the unverified scorecard citation, whose title belongs to a 2015 paper by the same first author.
    - "the prompting of students’ existing knowledge was beneficial during and after reading as well"
- **Verdict:** moderate. Advance organizers have meta-analytic support with small effects. Stating the objective is good practice.
- **Match:** yes.

### M28. A lesson level is cleared by working through it, not by its check score
- **Where:** `services/sessions.js:1134-1150` (`resolveBlock`), `services/mastery.js:292-297` (`completeLesson`).
- **What:**
  - Finishing the lesson advances the learner whatever the checks scored.
  - The comment states that a failed check "should send the learner back over the lesson, not stall the path". No code sends them back.
- **Evidence:**
  - kapur2016 **requoted** (10.1080/00461520.2016.1155457). *Setting:* theory review.
    - "Conditions that maximize performance in the initial learning may not maximize learning in the longer term."
  - pan2023pretest **NEW** (10.1007/s10648-023-09814-5).
    - "can benefit learning if there is an opportunity to study the correct answers afterwards"
  - pashler2005 (10.1037/0278-7393.31.1.3). *Setting:* college, foreign vocabulary.
    - "Supplying the correct answer after an incorrect response not only improved performance during the initial learning session--it also increased final retention by 494%."
  - hattie2007 (10.3102/003465430298487). *Setting:* review.
    - "Feedback is one of the most powerful influences on learning and achievement, but this impact can be either positive or negative."
- **Verdict:** design choice. A check that does not gate is defensible, because retrieval and feedback teach even when the answer is wrong. The literature says a miss should be followed by corrective study.
- **Match:** partly.
  - Feedback after each check exists.
  - Nothing targets re-study after missed lesson checks, though the next practice levels do pick up weak skills. See P7.

### M29. The lesson writer is told the topic, its neighbours and the last 4 lessons
- **Where:** `services/ai.js:531-555`, `services/lessons.js:256-293` (the last 4 lessons, each summary cut to 200 characters).
- **What:**
  - The writer gets: "Teach this topic. Do not teach the whole skill, and do not substitute a neighbouring topic."
  - It also gets: "Do not teach any of those again. Take the next step beyond them".
- **Evidence:**
  - kalyuga2003 (10.1207/s15326985ep3801_4). Redundant instruction harms more expert learners.
    - "can lose their effectiveness and even have negative consequences when used with more experienced learners"
  - liu2024lost (10.1162/tacl_a_00638). *Setting:* LLM long-context benchmarks.
    - "significantly degrades when models must access relevant information in the middle of long contexts"
  - levy2024 (10.18653/v1/2024.acl-long.818). *Setting:* LLM reasoning versus input length.
    - "a notable degradation in LLMs' reasoning performance at much shorter input lengths than their technical maximum"
  - shi2023 (10.48550/arxiv.2302.00093). *Setting:* LLM distraction.
    - "model performance is dramatically decreased when irrelevant information is included"
- **Verdict:** design choice. Keeping the context short and relevant fits the LLM findings. Not re-teaching fits expertise reversal.
- **Match:** yes.

### M30. The AI lesson writer's rules
- **Where:** `services/ai.js:556-585` (lesson system prompt).
- **What:** the prompt sets these rules.
  - Teach one idea.
  - Everything must be correct, so do the arithmetic.
  - The worked example shows every step with its reasoning.
  - Common mistakes are written as a fixed "Wrong: … Why: … Right: …" string, never as a rule.
  - Checks must be answerable from the lesson, with exactly one correct answer and four choices for multiple choice.
  - Plain text only. Never mention AI.
- **Evidence:**
  - harp1998 (10.1037/0022-0663.90.3.414). *Setting:* college, science passages.
    - "students who read expository passages with seductive details... recalled significantly fewer main ideas"
  - sundararajan2020 (10.1007/s10648-020-09522-4). *Setting:* meta-analysis.
    - "learners exposed to interesting and irrelevant information, known as seductive details, do not perform as much as those who learned without seductive details"
  - schroeder2023 (10.1007/s10648-021-09656-z). *Setting:* meta-analysis of refutation text.
    - "refutation text is associated with a positive, moderate effect ( g = 0.41"
  - mclaren2016 (10.1007/s40593-015-0064-x). *Setting:* middle school, decimals, web tutor.
    - "the erroneous examples group performed significantly better on a delayed test, given a week after the initial post-test (d = .33, for gain scores)"
  - tippett2010 (10.1007/s10763-010-9203-x). *Setting:* science education review.
    - "These structures often contain misconceptions—inaccurate or incomplete information—that are highly resistant to change"
- **Verdict:** moderate. Coherence (one idea, no seductive detail), refutation of misconceptions and erroneous examples marked as wrong all have meta-analytic or delayed-test support.
- **Match:** yes.

### M31. Validating lessons and items, including the key gate
- **Where:**
  - `services/ai.js:269-310` (`validateItem`).
  - `services/ai.js:606-640` (`validateLesson`).
  - `services/ai.js:592-604`: the key gate removes a multiple-choice check whose rationale describes another option and that a blind check does not confirm. A lesson left with fewer than 2 checks is refused.
- **What:** the validators enforce these rules.
  - Sections need 20 or more characters.
  - A worked example needs 2 or more steps and an answer.
  - Multiple choice has exactly 4 distinct choices, and the answer is one of them.
  - An answer longer than 6 characters must not appear inside the prompt.
  - No "NaN" or "undefined".
  - A rationale needs 10 or more characters.
- **Evidence:**
  - haladyna2002 **NEW** (10.1207/S15324818AME1503_5). *Setting:* review of 27 textbooks and 27 studies.
    - "A taxonomy of 31 multiple-choice item-writing guidelines was validated through a logical process"
  - little2012 (10.1177/0956797612443370). *Setting:* college.
    - "multiple-choice tests could trigger productive retrieval processes-provided the alternatives were made plausible enough"
  - kurdi2020 **NEW** (10.1007/s40593-019-00186-y). *Setting:* review of 93 automatic question generation papers.
    - "there is little focus in the current literature on generating questions of controlled difficulty"
  - wang2022sc **NEW** (10.48550/arXiv.2203.11171). *Setting:* LLM reasoning benchmarks.
    - "selects the most consistent answer by marginalizing out the sampled reasoning paths"
  - rodriguez2005 **NEW** (10.1111/j.1745-3992.2005.00006.x). *Setting:* meta-analysis of 80 years of research.
    - "More 3‐option items can be administered than 4‐ or 5‐option items per testing time while improving content coverage"
- **Verdict:** moderate. Machine checks for well-formed items follow item-writing guidelines. An independent re-solve (the key gate) follows self-consistency.
- **Match:** yes, with one note. Insisting on exactly 4 options is stricter than the evidence needs, since 3 options are psychometrically as good. That is harmless but costs writing tokens. See P8.

### M32. How a block lesson is laid out
- **Where:** `services/block-levels.js:765-791` (`SHAPE`, `DEFAULT_LAYOUT`, `LAYOUT_SYSTEM`).
- **What:**
  - A lesson has 4-10 blocks and 2-5 checks. The default is rule card → text → steps → common error → cheat sheet.
  - The prompt sets this order: activate prior knowledge, teach in short chunks, make the learner retrieve and apply, confront the likely misconception, and end with a summary or memory anchor.
  - Coverage points are listed first. Prerequisites come before dependents, concrete before abstract, and practice right after its idea. No tag may be used more than twice.
- **Evidence:**
  - rey2019 (10.1007/s10648-018-9456-4). *Setting:* meta-analysis of segmenting.
    - "reveals a significant segmenting effect with small to medium effects for retention and transfer performance"
  - noetel2022 (10.3102/00346543211052329). *Setting:* meta-meta-analysis of multimedia design.
    - "We found 11 design principles that demonstrated significant, positive, meta-analytic effects on learning"
  - luiten1980 **NEW** (10.3102/00028312017002211).
    - "Advance organizers were shown to have a facilitative effect on both learning and retention."
  - schroeder2023 (10.1007/s10648-021-09656-z).
    - "refutation text is associated with a positive, moderate effect ( g = 0.41"
  - yang2021 (10.1037/bul0000309).
    - "overall testing (quizzing) raises student academic achievement to a medium extent (g = 0.499)"
- **Verdict:** strong for each component.
- **Match:** yes. These are prompt instructions. Whether a given layout follows them is not checked by code beyond the schema, the tag limit and the coverage list.

### M33. Checks may not be answerable from the text verbatim; they test understanding on new material
- **Where:**
  - `services/block-levels.js:896-907`: "A check must not be answerable from a block's text verbatim".
  - `services/block-checkpoints.js:68-80`: "Test understanding, not recognition: make the learner use, identify, correct, compare or justify on new material".
- **Evidence:**
  - anderson1972 **NEW** (10.3102/00346543042002145). *Setting:* measurement review.
    - "to propose the distinctions necessary to determine whether a person has comprehended an instructional communication"
  - agarwal2019 (10.1037/edu0000282). *Setting:* classroom and lab experiments.
    - "Critically, higher order and mixed quizzes improved higher order test performance, but fact quizzes did not."
  - pan2019clicker (10.1187/cbe.18-12-0248). *Setting:* college biology.
    - "Benefits of jargon quizzing did not consistently generalize, however, to exam questions that assessed conceptual knowledge"
  - butler2017 (10.1037/xap0000142).
    - "variability during retrieval practice produced superior transfer of knowledge to new examples"
- **Verdict:** moderate.
- **Match:** partly.
  - For multiple choice, the server only refuses an answer longer than 6 characters that appears in the prompt (`services/block-levels.js:1080-1083`).
  - Nothing checks overlap between a check and the block text. Enforcement rests on the prompt and the verifier.

### M34. Fact research and the verification gate
- **Where:** `services/block-levels.js:1215-1260` (research and verify prompts), `services/block-levels.js:1346-1365` (`gateOn`, `servable`, `verifyOn`), `services/block-levels.js:1679-1690` (`tooMuchRemoved`).
- **What:**
  - Before writing, a researcher builds a fact sheet with source quotes, and marks each fact established, contested, opinion or theoretical.
  - After writing, a verifier checks every claim one by one. False and unsupported claims are removed. Contested claims stated as fact are reworded.
  - Under the gate, only a verified plan is served. A plan that loses more than a third of its blocks is written again.
  - The code notes that the in-house GLM route caught only 2 of 13 known errors, so the gate needs the owner's key.
- **Evidence:**
  - ji2023 **NEW** (10.1145/3571730). *Setting:* survey of NLG hallucination.
    - "deep learning based generation is prone to hallucinate unintended text, which degrades the system performance"
  - huang2025 **NEW** (10.1145/3703155). *Setting:* survey of LLM hallucination.
    - "LLMs are prone to hallucination, generating plausible yet nonfactual content."
  - dhuliawala2024 **NEW** (10.18653/v1/2024.findings-acl.212). *Setting:* LLM experiments.
    - "we show COVE decreases hallucinations across a variety of tasks"
  - min2023 **NEW** (10.18653/v1/2023.emnlp-main.741). *Setting:* LLM biographies.
    - "breaks a generation into a series of atomic facts and computes the percentage of atomic facts supported by a reliable knowledge source"
  - lewis2020 **NEW** (10.48550/arXiv.2005.11401). *Setting:* knowledge-intensive question answering.
    - "their ability to access and precisely manipulate knowledge is still limited"
  - bastani2025 (10.1073/pnas.2422633122). *Setting:* about 1,000 high-school maths students.
    - "48% improvement in grades for GPT Base... 17% reduction in grades for GPT Base"
- **Verdict:** strong. LLMs produce factual errors, and claim-level verification against retrieved sources reduces them.
- **Match:** yes when the gate is on.
  - Gap: with no verifier key configured, `gateOn()` is false and plans are served unverified.
  - Given 2 of 13 errors caught on the fallback route, that is the main residual risk in this section. See P10.

### M35. A 10% holdout gets the shared plan
- **Where:** `services/block-levels.js:29-35`, `services/block-levels.js:1909-1913`, `services/block-levels.js:2226-2230`.
- **What:** among tailored learners, 10% are served the untailored shared plan, so the effect of tailoring can be measured.
- **Evidence:**
  - kohavi2009 **NEW** (10.1007/s10618-008-0114-1). *Setting:* online controlled experiments in industry.
    - "Controlled experiments embody the best scientific design for establishing a causal relationship between changes and their influence on user-observable behavior."
  - doroudi2017 (10.1145/3051457.3051463).
    - "existing methods for doing so can overestimate the performance of new teaching methods"
  - cheung2016 (10.3102/0013189x16656615). *Setting:* 645 education studies.
    - "Effect sizes were roughly twice as large for published articles, small-scale trials, and experimenter-made measures"
  - lortieforgues2019 (10.3102/0013189x19832850). *Setting:* 141 large educational RCTs.
    - "These sat within relatively large confidence intervals (mean width = 0.30 SDs), which meant that the results were often uninformative"
- **Verdict:** strong as method.
- **Match:** yes. lortieforgues2019 warns that small holdouts give wide intervals, so the comparison needs enough learners before it is read.

---

## F. Checkpoints (`services/block-checkpoints.js`, `services/sessions.js`)

### M36. A fixed blueprint; tailoring changes only how questions are presented
- **Where:** `services/block-checkpoints.js:1-28`, `services/block-checkpoints.js:57-80`.
- **What:**
  - The skill and difficulty of each slot come from the course and are the same for everyone.
  - Tailoring picks the format and the style: plain, scenario, interest, data, error-spot or compare.
  - No hints, no easier wording and no fewer steps: "the style changes the surface, never the amount of thinking".
- **Evidence:**
  - aera2014 **NEW** (https://www.testingstandards.net/open-access-files.html). The *Standards for Educational and Psychological Testing* (AERA, APA, NCME, 2014). Title-level only.
  - messick1995 (10.1037/0003-066x.50.9.741). *Setting:* validity theory.
    - "The new unified concept of validity interrelates these issues as fundamental aspects of a more comprehensive theory of construct validity"
  - kane2013 (10.1111/jedm.12000).
    - "To validate an interpretation or use of test scores is to evaluate the plausibility of the claims based on the scores."
  - walkington2013 (10.1037/a0031882). *Setting:* 9th-grade algebra in Cognitive Tutor.
    - "students in the personalization condition solved problems faster and more accurately within the modified unit"
- **Verdict:** moderate.
  - Standardising what is measured is the core fairness requirement.
  - walkington2013 shows interest contexts can change performance, which means an "interest" style may not be difficulty-neutral.
- **Match:** partly. Whether each style changes difficulty is asserted in the prompt but never measured. That is a validity question the item statistics could answer (P4).

### M37. Checkpoint sampling covers every introduced skill, on a difficulty ramp
- **Where:** `services/sessions.js:179-192` (`planCheckpoint`).
- **What:**
  - Skills are drawn round-robin from `introduced`, or from all of the grade's skills for the Final.
  - Difficulty ramps across ±1 around the level, or ±2 for the Final.
  - The fill rule asks for the lessons taught to be covered "in proportion — none left out" (`services/block-checkpoints.js:68-80`).
- **Evidence:**
  - khanna2013 (10.1177/0098628313487458).
    - "Students completing courses with cumulative finals retained more than students who took noncumulative finals."
  - szpunar2007 (10.3758/BF03193473).
    - "subjects benefited more from initial testing when they also knew they would need to remember the information for ..."
  - chan2006 (10.1037/0096-3445.135.4.553). *Setting:* college lab.
    - "testing enhanced recall 24 hr later for the initially nontested material."
  - porter2002 **NEW** (10.3102/0013189X031007003).
    - "tools for measuring the content of instruction, the content of instructional materials, and the alignment between these"
- **Verdict:** strong for cumulative, content-aligned checkpoints.
- **Match:** yes.

### M38. Checkpoint formats and styles are varied
- **Where:** `services/block-checkpoints.js:35` (`STYLES`), `services/block-checkpoints.js:57-80`.
- **What:**
  - Formats mix typed answers and choices. Typed answers are favoured for learners who recognise more than they recall.
  - The six styles are spread across the quiz, and the multiple-choice answer position is varied.
- **Evidence:**
  - butler2017 (10.1037/xap0000142).
    - "variability during retrieval practice produced superior transfer of knowledge to new examples"
  - mcdaniel2007 (10.1080/09541440701326154). *Setting:* college course quizzes.
    - "short answer quizzes produced more robust benefits than multiple choice quizzes"
  - mcdermott2014 (10.1037/xap0000004). *Setting:* middle and high school classes.
    - "short-answer and multiple-choice classroom quizzing could enhance retention of information on classroom exams"
  - haladyna2002 **NEW** (10.1207/S15324818AME1503_5). Key position is among the 31 guidelines.
    - "A taxonomy of 31 multiple-choice item-writing guidelines was validated through a logical process"
  - mclaren2016 (10.1007/s40593-015-0064-x). Supports the error-spot style.
    - "the erroneous examples group performed significantly better on a delayed test"
- **Verdict:** moderate.
- **Match:** yes.

### M39. Every retry uses freshly written questions, with no cooldown
- **Where:** `config/curriculum.js:595-605`, `services/sessions.js:194-251` (`examPromptsSeen`, `REGEN_WAIT_MS 20000`, `prefetchRetry`).
- **What:**
  - A retry is the same level and topics with new questions, and every exam prompt already seen at that level is avoided.
  - The old cooldown was removed, because regenerating takes away the grinding it guarded against.
- **Evidence:**
  - hausknecht2007 **NEW** (10.1037/0021-9010.92.2.373).
    - "effects were larger when practice was accompanied by test coaching and when identical forms were used"
  - way1998 **NEW** (10.1111/j.1745-3992.1998.tb00632.x). *Setting:* measurement practice.
    - "How can item exposure be limited?"
  - guskey2007 **NEW** (10.4219/jaa-2007-704). Bloom's model of correctives followed by a second assessment.
    - "Bloom labeled the strategy to accomplish this instructional variation and differentiation mastery learning."
  - kulik1990 (10.2307/1170612).
    - "mastery learning programs have positive effects on the examination performance of students"
- **Verdict:** strong that parallel (fresh) forms avoid the inflation from repeated identical forms.
- **Match:** yes.
  - Gap: Bloom's model puts correctives *before* the second test. Here the learner may retry at once.
  - That is the owner's product choice. The evidence favours nudging toward "Help me learn" after a low score (P7).

---

## G. Session planning (`services/sessions.js` planLesson, `services/learner.js` sessionParams, `content/pool.js`)

### M40. Session length: 6 to 18 items from the profile
- **Where:** `services/learner.js:274-305`.
- **What:**
  - Length is `6 + 6·density + 6·pacing`, clamped to 5-18.
  - The scorecard can stretch it only through the insertion contract's calibrated gate.
- **Evidence:**
  - lyle2020 (10.1007/s10648-019-09489-x). *Setting:* college precalculus.
    - "although some evidence suggested that the effect of amount of practice was less robust than the effect of spacing."
  - rawson2011 (10.1037/a0023956). *Setting:* 533 college students.
    - "Across 3 experiments, 533 students learned conceptual material via retrieval practice with restudy."
  - debeer2014 (10.3102/1076998614558485).
    - "A decrease in examinee effort during the PISA reading assessment was found consistently across countries"
  - rey2019 (10.1007/s10648-018-9456-4).
    - "a significant segmenting effect with small to medium effects for retention and transfer performance"
- **Verdict:** design choice.
- **Match:** yes.

### M41. About 30% due review, first, at d−1
- **Where:** `services/sessions.js:131-141`, `services/sessions.js:164-167`.
- **What:**
  - Up to `round(0.3 × count)` due reviews from introduced skills, at the level's difficulty minus 1.
  - They are placed before new material: "retrieval before new material".
- **Evidence:**
  - pastotter2014 (10.3389/fpsyg.2014.00286). *Setting:* review of lab studies. Title-level phrase: "Retrieval practice enhances new learning: the forward effect of testing".
  - lindsey2014 (10.1177/0956797613504302). *Setting:* 8th-grade Spanish course.
    - "personalized review yielded a 16.5% boost in course retention over current educational practice (massed study)"
  - latimier2021 (10.1007/s10648-020-09572-8). *Setting:* meta-analysis of 29 studies.
    - "We carried out meta-analyses on 29 studies investigating the benefit of spacing out retrieval practice episodes on final retention."
  - roediger2011 (10.1016/j.tics.2010.09.003). *Setting:* review.
    - "retrieval practice is actually a powerful mnemonic enhancer, often producing large gains in long-term retention relative to repeated studying"
- **Verdict:** strong.
- **Match:** yes. The full retention schedule is in `RETENTION-ENFORCER-EVIDENCE.md`.

### M42. Support and stretch shares
- **Where:** `services/learner.js:284-299`, `services/sessions.js:143-162`.
- **What:**
  - Support is 0.1 of the session when challenge appetite is above 0.6, otherwise 0.2. Support items sit at d−1.5 on the weakest introduced skill.
  - Stretch is `0.1 + 0.2·appetite` at d+1.5 on the focus skill.
  - The scorecard can move each share, clamped to 0-0.35 for support and 0.05-0.35 for stretch.
- **Evidence:**
  - wilson2019 (10.1038/s41467-019-12552-4).
    - "the optimal training accuracy is about 85%"
  - tetzlaff2025 (10.1016/j.learninstruc.2025.102142).
    - "Low prior knowledge learners learn better from high-assistance instruction (d = 0.505)."
  - belland2017 (10.3102/0034654316670999). *Setting:* meta-analysis, computer-based scaffolding in STEM.
    - "computer-based scaffolding showed a consistently positive (ḡ = 0.46) effect on cognitive outcomes"
  - vandepol2010 (10.1007/s10648-010-9127-6). *Setting:* review.
    - "contingency, fading, and transfer of responsibility are discerned in this review as the three key characteristics of scaffolding"
- **Verdict:** moderate for the principle: easier items for the weak, harder ones for the ready.
- **Match:** partly. The shares are set from a profile, not from the learner's realised accuracy, so nothing checks that focus items land near the 80-85% band. See P9.

### M43. Interleaving within the focus items, and the order of roles
- **Where:** `services/sessions.js:153-167`.
- **What:**
  - Every third focus item comes from the next weakest skill.
  - The final order is review, then support, then focus, then stretch. The body is not shuffled.
- **Evidence:**
  - rohrer2015 (10.1037/edu0000001). *Setting:* 7th-grade mathematics.
    - "Cohen’s ds 0.42 and 0.79, respectively"
  - rohrer2020 (10.1037/edu0000367).
    - "the interleaved group outscored the blocked group, 61% versus 38%, d = 0.83"
  - firth2021 (10.1002/rev3.3266). *Setting:* systematic review.
    - "Memory... showed an interleaving benefit with effect sizes (Hedges’ g ) of up to 0.65"
  - brunmair2019 (10.1037/bul0000209).
    - "should be used with caution in certain conditions, especially for expository texts and words"
  - tauber2013 (10.3758/s13423-012-0319-6). *Setting:* learner preferences.
    - "Participants overwhelmingly preferred to block their study, even though interleaving is normatively better for learning."
- **Verdict:** strong for interleaving in mathematics.
- **Match:** partly.
  - The comment says "an interleaved body", but the body is grouped by role: all support items, then the focus run, then all stretch items.
  - Only one focus item in three switches skill. See P1.

### M44. Question families, shape rotation and no-repeat history
- **Where:**
  - `content/pool.js:1-30` (families).
  - `content/pool.js:94-135` (`pickByDifficulty`: spent shapes are filtered out).
  - `content/pool.js:356-400` (`SHAPE_ROTATION_LIMIT 12`: the base generator and a shape generator alternate).
  - `services/sessions.js:81-125`.
- **What:**
  - One template with slot banks yields hundreds of questions. The code notes a 94% repeat rate on fixed lists before families.
  - A question's *shape* is tracked, so a spent shape is not served again with new nouns.
- **Evidence:**
  - butler2017 (10.1037/xap0000142).
    - "variability during retrieval practice produced superior transfer of knowledge to new examples"
  - paas1994 (10.1037/0022-0663.86.1.122). *Setting:* geometry training, variability.
    - "Four computer-based training strategies for geometrical problem solving... were studied with regard to their effects on training performance, transfer performance, and cognitive load"
  - pan2018 (10.1037/bul0000151).
    - "testing can yield transferrable learning"
  - hausknecht2007 **NEW** (10.1037/0021-9010.92.2.373).
    - "when identical forms were used"
- **Verdict:** moderate.
- **Match:** yes.

### M45. Typed answers preferred for recall-leaning learners
- **Where:** `services/learner.js:287` (`retrieval_style > 0.55`), `services/sessions.js:81-107`.
- **What:** for those learners, the generator tries again for a format other than multiple choice.
- **Evidence:**
  - rowland2014 (10.1037/a0037559).
    - "initial recall tests yielding larger testing benefits than recognition tests"
  - mcdaniel2007 (10.1080/09541440701326154).
    - "short answer quizzes produced more robust benefits than multiple choice quizzes"
  - kang2007 **requoted** (10.1080/09541440601056620). *Setting:* college, no feedback.
    - "having had an intervening MC test led to better performance than an intervening SA test"
  - smith2014 **requoted** (10.1080/09658211.2013.831454).
    - "Practising retrieval in all format conditions enhanced retention, relative to a study-only control condition"
  - little2012 (10.1177/0956797612443370).
    - "multiple-choice tests could trigger productive retrieval processes-provided the alternatives were made plausible enough"
- **Verdict:** mixed.
  - Recall formats often help more.
  - With no feedback, multiple choice beat short answer (kang2007), and format differences are often small (smith2014).
- **Match:** yes. The preference is soft, and feedback is always given.

### M46. One recall question at the end of each level, from what was missed
- **Where:** `services/sessions.js:1095-1126` (`blockRetentionItem`).
- **What:** one item on a skill missed in the level (or any skill, if none was missed), at the level's average difficulty minus 0.5.
- **Evidence:**
  - pashler2005 (10.1037/0278-7393.31.1.3).
    - "Supplying the correct answer after an incorrect response ... also increased final retention by 494%."
  - pyc2007 (10.3758/BF03192925). *Setting:* college lab.
    - "it was particularly effective for learning initially incorrect items."
  - vaughn2011 (10.1177/0956797611417724). *Setting:* college lab.
    - "increasing the criterion level enhanced associative memory"
  - metcalfe2011 (10.1037/a0021962). *Setting:* adults, general information.
    - "errors that are committed with high confidence are easier to correct than low-confidence errors"
- **Verdict:** moderate.
- **Match:** yes. It comes minutes after the miss: a short lag, which the spacing evidence (M47) rates below a delayed retest.

### M47. The end-of-session recall set
- **Where:** `services/sessions.js:1510-1558` (`retentionPlan`).
- **What:**
  - One question per level covered, oldest level first, taken from what was missed there.
  - Topped up to 3 from the weakest remaining skills, at d−0.5.
- **Evidence:**
  - carpenter2009hist (10.1002/acp.1507). *Setting:* 8th-grade US history.
    - "Facts reviewed through testing were retained significantly better than facts reviewed through re‐studying"
  - agarwal2021 (10.1007/s10648-021-09595-9).
    - "the majority of which (57%) revealed medium or large benefits from retrieval practice"
  - cepeda2006 (10.1037/0033-2909.132.3.354). *Setting:* 839 assessments in 317 experiments.
    - "This review found 839 assessments of distributed practice in 317 experiments located in 184 articles."
  - cepeda2008 (10.1111/j.1467-9280.2008.02209.x).
    - "the optimal gap declined from about 20 to 40% of a 1-week test delay"
- **Verdict:** moderate.
- **Match:** partly. Within-session recall is a short gap. Its value is diagnostic plus a small retention gain. The larger gain needs a delay of a day or more, which the retention enforcers and due reviews supply. See P5.

### M48. Next-session difficulty moves ±0.5
- **Where:** `services/sessions.js:1500-1504` (rule-based analysis fallback).
- **What:** next session's difficulty goes up 0.5 at 85% accuracy or better, down 0.5 at 50% or worse, and is otherwise unchanged.
- **Evidence:**
  - wilson2019 (10.1038/s41467-019-12552-4).
    - "the optimal training accuracy is about 85%"
  - wauters2010 (10.1111/j.1365-2729.2010.00368.x).
    - "adaptive item sequencing by matching the difficulty of the items to the learner's knowledge level"
  - mettler2016 **requoted** (10.1037/xge0000170). *Setting:* adults, adaptive spacing.
    - "it may be better optimized by adaptive adjustments of spacing to learners' ongoing performance"
  - major2021 (10.1111/bjet.13116).
    - "more personalised approaches which adapt or adjust to learners' level led to significantly greater impact"
- **Verdict:** design choice.
- **Match:** yes.

---

## H. Mastery and advancement (`services/mastery.js`)

### M49. Mastery is an exponential moving average, weighted by difficulty
- **Where:** `services/mastery.js:52-92`.
- **What:**
  - The learning rate is 0.35 for the first 3 attempts, then 0.15.
  - It is multiplied by `1 + 0.15·max(0, gap)`: credit for beating harder items, extra penalty for missing easier ones.
  - The rate is capped at 0.6.
  - An IRT/Elo estimate is stored beside it but does not drive decisions.
- **Evidence:**
  - pelanek2017mastery **NEW** (10.1145/3079628.3079667). *Setting:* simulated and real data.
    - "We argue that a simple exponential moving average method is a suitable technique for mastery criterion"
  - pelanek2017mastery **NEW**, same paper.
    - "the choice of data sources used for mastery decision and setting of thresholds are more important than the choice of a learner modeling technique"
  - pelanek2016 (10.1016/j.compedu.2016.03.017). Elo in adaptive education. Title-level only.
  - koedinger2023 (10.1073/pnas.2221311120).
    - "typically increasing by about 0.1 log odds or 2.5% in accuracy per opportunity"
  - vandesande2013 **NEW** (10.5281/zenodo.3554629).
    - "has the functional form of an exponential"
- **Verdict:** moderate.
- **Match:** yes.

### M50. Coach-assisted answers count for less
- **Where:**
  - `services/mastery.js:87-90`: a correct answer the coach walked them to moves mastery half as far.
  - `services/mastery.js:675-680`: it earns 60% of the XP.
  - `services/coverage.js:103`: it carries 0.25 weight as evidence.
- **Evidence:**
  - aleven2003 (10.3102/00346543073003277). *Setting:* review of help seeking.
    - "although effective help-seeking behavior in ILEs is related to better learning outcomes, learners are not using help facilities effectively"
  - aleven2016help (10.1007/s40593-015-0089-1). *Setting:* ITS help-seeking research.
    - "feedback on help seeking helped students to use on-demand help more deliberately... but not to achieve better learning outcomes"
  - baker2008 **NEW** (10.1007/978-3-540-69132-7_44). Contextual guess estimates are what this discount approximates.
    - "using machine learning to make contextual estimations of the probability that a student has guessed or slipped"
  - wood1976 (10.1111/j.1469-7610.1976.tb00381.x). *Setting:* tutoring of young children. Title-level only.
- **Verdict:** design choice.
- **Match:** yes.

### M51. Review intervals and ease
- **Where:** `services/mastery.js:15-18`, `services/mastery.js:94-102`.
- **What:**
  - Correct streaks step through 1, 3, 7, 16, 35, 70 and 140 days, scaled by ease/2.5.
  - Ease is clamped to 1.3-3.0, rising 0.05 per right answer and falling 0.15 per miss.
  - A miss returns in half a day. A hint halves the interval.
- **Evidence:**
  - kang2014 (10.3758/s13423-014-0636-z). *Setting:* lab.
    - "However, the expanding schedule yielded much higher average recallability over the whole training period."
  - cepeda2008 (10.1111/j.1467-9280.2008.02209.x).
    - "the optimal gap declined from about 20 to 40% of a 1-week test delay to about 5 to 10% of a 1-year test delay"
  - settles2016 (10.18653/v1/p16-1174). *Setting:* Duolingo logs.
    - "reducing error by 45%+ compared to several baselines at predicting student recall rates"
  - tabibian2019 (10.1073/pnas.1815156116). *Setting:* online flashcard users.
    - "current spaced repetition algorithms are simple rule-based heuristics with a few hard-coded parameters"
- **Verdict:** moderate.
- **Match:** yes as a heuristic. Fitted models beat hand-set intervals. `RETENTION-ENFORCER-EVIDENCE.md` covers the schedule in full.

### M52. Due reviews: weakest and most overdue first
- **Where:** `services/mastery.js:143-151`.
- **What:** among skills that are due, the lowest mastery goes first, with ties broken by the earliest due date.
- **Evidence:**
  - lindsey2014 (10.1177/0956797613504302).
    - "personalized review yielded a 16.5% boost in course retention"
  - eglington2020 (10.1038/s41539-020-00074-4). *Setting:* experiment plus simulation.
    - "up to 40% more items recalled in conditions where practice was scheduled optimally according to the model"
  - pyc2007 (10.3758/BF03192925).
    - "it was particularly effective for learning initially incorrect items."
  - mettler2016 **requoted** (10.1037/xge0000170).
    - "it may be better optimized by adaptive adjustments of spacing to learners' ongoing performance"
- **Verdict:** moderate.
- **Match:** yes.

### M53. The level-up gate: average 0.8 or better, weakest 0.6 or better, 12 or more items
- **Where:** `services/mastery.js:20-24`, `services/mastery.js:167-199`, `services/mastery.js:275-290`.
- **What:**
  - Practice levels advance only when all three conditions hold over the introduced skills.
  - Lessons advance on completion (M28). Checkpoints advance on a pass (M21).
- **Evidence:**
  - bloom1984 (10.2307/1175554). *Setting:* review of the mastery learning and tutoring studies.
    - "Mastery Learning. Students learn the subject matter in a class with about 30 students per teacher."
  - kulik1990 (10.2307/1170612).
    - "mastery learning programs have positive effects on the examination performance of students"
  - pelanek2017mastery **NEW** (10.1145/3079628.3079667).
    - "setting of thresholds are more important than the choice of a learner modeling technique"
  - doroudi2019fair (10.1145/3303772.3303838).
    - "substantially more equitable than giving all students the same amount of practice"
- **Verdict:** moderate. Mastery gating is supported. The 0.8, 0.6 and 12 values are design choices.
- **Match:** yes.

---

## I. Grade-fit (`config/grade-skills.js`)

### M54. Which skills fit which grade, and re-tagging by rule
- **Where:** `config/grade-skills.js:1-60` (FIT for math), `config/grade-skills.js:106-200` (ENGLISH, READING, SPANISH and BASKETBALL FIT, RULES and MODE), `config/grade-skills.js:205-290` (`remap`).
- **What:**
  - Each skill has a range of grade positions where it is neither above nor far below the grade. A skill outside the range is never served.
  - Lesson titles are re-tagged by keyword rules that must also fit the grade. The grade's skill list is rebuilt from its rows.
- **Evidence:**
  - ccss_8_ee **NEW** (https://www.thecorestandards.org/Math/Content/8/EE/). Standard. Slope begins in grade 8, as the FIT comment cites.
    - "Graph proportional relationships, interpreting the unit rate as the slope of the graph."
  - ccss_3_nbt **NEW** (https://www.thecorestandards.org/Math/Content/3/NBT/). Standard. Rounding is grade 3.
    - "Use place value understanding to round whole numbers to the nearest 10 or 100."
  - porter2002 **NEW** (10.3102/0013189X031007003).
    - "The validity of data produced through use of these tools is found to be quite good."
  - anderson1972 **NEW** (10.3102/00346543042002145). Tests must state what they count.
    - "the primitive first requirement for a system of measurement, namely that there is a clear and consistent definition of the things being counted"
- **Verdict:** strong. Content is aligned to an official standard.
- **Match:** yes for math, English and Reading, where the comments cite the standards. IQ, ACT, chess and piano have no FIT, by design. Cross-reference `GRADE-FIT-STANDARDS.md` when it lands.

### M55. Difficulty caps per grade and skill, and the school grade passed to the bank
- **Where:** `config/grade-skills.js:293-341` (`DIFFICULTY_RANGE`), `config/grade-skills.js:343-394` (`capDifficulty`, `SCHOOL`, `fitEntry`).
- **What:**
  - Inside a skill, each grade gets a difficulty range. For example, Kindergarten `facts_within_20` is capped at 1-2.19, because sums to 20 are grade 1.
  - Every plan entry carries the US school grade, so the bank serves that grade's standard.
  - The planners, lessons, retention items and checkpoints all apply this (`services/sessions.js:170-177`, `services/lessons.js:130-133`).
- **Evidence:**
  - ccss_k_oa **NEW** (https://www.thecorestandards.org/Math/Content/K/OA/). Standard.
    - "add and subtract within 10, e.g., by using objects or drawings to represent the problem."
  - ccss_k_cc **NEW** (https://www.thecorestandards.org/Math/Content/K/CC/). Standard.
    - "Write numbers from 0 to 20."
  - ccss_3_nbt **NEW** (URL as in M54).
    - "Use place value understanding to round whole numbers to the nearest 10 or 100."
  - porter2002 **NEW** (10.3102/0013189X031007003).
    - "the alignment between these"
- **Verdict:** strong (standards-based).
- **Match:** yes.

---

## J. Objective coverage (`services/coverage.js`)

### M56. Objectives come from each lesson's own "covers" sentence
- **Where:** `services/coverage.js:1-20`, `services/coverage.js:135-240` (objective building and `levelMap`).
- **What:**
  - Each teaching lesson is one objective: its title, the author's "covers" sentence, its skill and the levels that teach and practise it.
  - Answers at a shared level (an entry check, a summary or a checkpoint) count for several objectives at once.
- **Evidence:**
  - porter2002 **NEW** (10.3102/0013189X031007003).
    - "This article describes tools for measuring the content of instruction"
  - anderson1972 **NEW** (10.3102/00346543042002145).
    - "to propose the distinctions necessary to determine whether a person has comprehended an instructional communication"
  - messick1995 (10.1037/0003-066x.50.9.741).
    - "a more comprehensive theory of construct validity"
  - kane2013 (10.1111/jedm.12000).
    - "to evaluate the plausibility of the claims based on the scores"
- **Verdict:** moderate.
- **Match:** yes.

### M57. Knowledge tracing per objective, and what counts as proof
- **Where:** `services/coverage.js:20-35`, `services/coverage.js:84-105`, `services/coverage.js:360-370`.
- **What:**
  - Each objective is traced with BKT using these parameters:

    | Parameter | Value |
    | --- | --- |
    | PRIOR | 0.2 |
    | LEARN | 0.15 |
    | SLIP | 0.1 |
    | Guess (choices) | 1/n + 0.1 |
    | Guess (typed) | 0.05 + 0.05 |

  - Proof needs a belief of 0.95 or more, at least 3 units of unaided evidence, 3 right answers, and 2 right answers to questions written for that objective.
  - An answer shared by k objectives counts 1/k. A coach-led answer counts 0.25. Rapid guesses are not evidence.
- **Evidence:**
  - corbett1994 (10.1007/bf01099821). Title-level only.
  - vandesande2013 **NEW** (10.5281/zenodo.3554629).
    - "update the conditional probability that the student has learned that skill"
  - baker2008 **NEW** (10.1007/978-3-540-69132-7_44).
    - "The model uses four parameters per skill, fit using student performance data"
  - wise2006 (10.1111/j.1745-3984.2006.00002.x). *Setting:* effort-moderated IRT.
    - "rapid guessing (i.e., reflecting low examinee effort)"
  - wise2017 (10.1111/emip.12165).
    - "very short response time—termed rapid guessing—has been shown to indicate disengaged test taking"
- **Verdict:** strong for the method. The parameters are design choices: they are set by hand, not fitted, which is what baker2008 warns about.
- **Match:** yes. The "aligned answers" requirement is a sound guard against proving the skill rather than the objective.

### M58. Retained or lapsed: a delayed, unaided check
- **Where:** `services/coverage.js:36-40`, `services/coverage.js:96-101`, `services/coverage.js:455-495`.
- **What:**
  - An objective is retained when it was proven, and then an unaided answer at least 1 day later came out right often enough: R of 0.9 or more, starting from a prior of 0.7.
  - It lapses when R falls to 0.4 or below. L is then capped at 0.5, and it must be proven again.
- **Evidence:**
  - cepeda2006 (10.1037/0033-2909.132.3.354).
    - "This review found 839 assessments of distributed practice in 317 experiments"
  - janes2020 (10.1002/acp.3699). *Setting:* college biopsychology.
    - "successive relearning boosted students' learning of course content by at least 10% (with d s ranging from 0.54 to 1.10)"
  - higham2022 (10.1037/edu0000693). *Setting:* college course.
    - "Recall Of Course Material At The End Of The Semester Was Better For Relearning Compared With Restudying."
  - rawson2018 (10.1037/xap0000146). *Setting:* college.
    - "the advantage of successive relearning over single-session learning (i.e., relearning potency ) was substantial"
- **Verdict:** moderate.
- **Match:** partly. A 1-day delay is the minimum that counts as a memory check. cepeda2008 puts the optimal gap for durable retention well beyond a day, so "retained" is a fairly weak claim. See P5.

### M59. The coverage gate holds graduation until every objective is retained
- **Where:** `services/coverage.js:40-48`, `services/coverage.js:107-112` (`COVERAGE_GATE` defaults to `enforce` since 2026-10-24), `services/mastery.js:300-312`.
- **What:** passing the Final does not graduate a learner while objectives are unproven or lapsed. The record notes the hold.
- **Evidence:**
  - bloom1984 (10.2307/1175554). Title-level phrase only.
  - guskey2007 **NEW** (10.4219/jaa-2007-704).
    - "Bloom believed that all students could be helped to reach a high criterion of learning"
  - kulik1990 (10.2307/1170612).
    - "mastery learning programs have positive effects on the examination performance of students"
  - guskey1988 **NEW** (10.1080/00220671.1988.10885824). *Setting:* meta-analysis of 46 studies of group-based mastery learning in schools.
    - "Results show that such applications yield consistently positive effects on both cognitive and affective student learning outcomes"
  - keller1968 **NEW** (10.1901/jaba.1968.1-79). Unit-mastery requirement. Title-level only.
- **Verdict:** moderate.
- **Match:** yes.

---

## K. Remediation after a failed checkpoint (`services/remediation.js`)

### M60. Two doors: retry now, or "Help me learn"
- **Where:** `services/remediation.js:1-17`, `services/sessions.js:1220-1292` (`resolveCheckpoint`).
- **What:** below the mark, the learner stays on the checkpoint and chooses between a fresh retry and taught remediation. The retry stays available throughout.
- **Evidence:**
  - guskey2007 **NEW** (10.4219/jaa-2007-704).
    - "Bloom argued that educators and teachers must increase variation in instructional approaches and learning time"
  - kulik1990 (10.2307/1170612).
    - "mastery learning programs have positive effects on the examination performance of students"
  - hausknecht2007 **NEW** (10.1037/0021-9010.92.2.373).
    - "adjusted overall effect size of .26"
  - aleven2003 (10.3102/00346543073003277). Learners under-use help.
    - "learners are not using help facilities effectively"
- **Verdict:** moderate.
- **Match:** partly. Learners pick the faster door and under-use help, so an unguided choice tends toward a retry without the correctives. See P7.

### M61. Diagnosis from the actual wrong answers
- **Where:** `services/remediation.js:40-87` (`areasFrom`), `services/remediation.js:89-104` (`fallbackTeaching`).
- **What:**
  - Missed items are grouped by skill, worst accuracy first. Each group keeps the prompt, the right answer, the learner's answer and the error tag, plus the most common tag.
  - The tutor teaches from those answers: "they factored correctly and then dropped the sign".
- **Evidence:**
  - brown1978 (10.1016/s0364-0213(78)80004-4).
    - "explaining why a student is making a mistake as opposed to simply identifying the mistake"
  - vanlehn1990 (https://openalex.org/W1564397683).
    - "they often develop small, local misconceptions that cause systematic errors."
  - vanderkleij2015 (10.3102/0034654314564881). *Setting:* meta-analysis of computer-based feedback.
    - "elaborated feedback... produced larger effect sizes (0.49) than feedback regarding the correctness of the answer (KR; 0.05)"
  - butler2013 (10.1037/a0031026). *Setting:* college.
    - "explanation feedback produced superior performance on the new inference questions."
- **Verdict:** strong. Error-specific, elaborated feedback beats correctness-only feedback.
- **Match:** yes.

### M62. Five drill questions per area; an area holds at the pass mark
- **Where:** `services/remediation.js:22-25` (`DRILL_COUNT 5`), `services/remediation.js:301-317` (`recordDrill`, where `held` means accuracy at or above the mark).
- **What:** holding every area does not advance the learner. Only passing the quiz does.
- **Evidence:**
  - rawson2011 (10.1037/a0023956).
    - "Across 3 experiments, 533 students learned conceptual material via retrieval practice with restudy."
  - vaughn2011 (10.1177/0956797611417724).
    - "increasing the criterion level enhanced associative memory"
  - janes2020 (10.1002/acp.3699).
    - "successive relearning boosted students' learning of course content by at least 10%"
  - pyc2007 (10.3758/BF03192925).
    - "particularly effective for learning initially incorrect items."
- **Verdict:** moderate. Practice to a criterion is supported. Five items at 75% is a reasoned size.
- **Match:** yes.
  - Gap: one round of 5 at 75% means 4 of 5 right, which is a coarse signal (compare the binomial note in M21).

### M63. Diagnosis starts as soon as the quiz is lost
- **Where:** `services/remediation.js:106-170` (`startEarly`).
- **What:** once the best possible score has fallen below the mark, the diagnosis starts while the learner is still answering, so the teaching is ready when they click.
- **Evidence:**
  - shute2008 (10.3102/0034654307313795). *Setting:* review of formative feedback.
    - "formative feedback should be nonevaluative, supportive, timely, and specific"
  - kulik1988 **requoted** (10.2307/1170349). *Setting:* meta-analysis of 53 studies.
    - "Applied studies using actual classroom quizzes and real learning materials have usually found immediate feedback to be more effective than delayed."
  - butler2007 (10.1037/1076-898X.13.4.273). *Setting:* college.
    - "delayed feedback led to superior final test performance relative to immediate feedback."
  - metcalfe2009 (10.3758/MC.37.8.1077). *Setting:* children and adults, vocabulary.
    - "there was no difference between the delayed and immediate feedback conditions when the lag to test was controlled"
- **Verdict:** mixed. Classroom studies favour timely feedback. Lab studies often favour a delay.
- **Match:** yes. This is mainly a latency fix that keeps the learner from waiting, with no learning claim of its own.

### M64. After a failed Final, remediation is planned from the whole record
- **Where:** `services/remediation.js:27-38` (`recordPlanOn`, default on since 2026-10-24).
- **What:** after a missed Final, the plan says what to learn again (objectives unproven, or proven and since lapsed) and what to retrieve (kept, but fading), not just which skills the Final missed.
- **Evidence:**
  - rawson2018 (10.1037/xap0000146).
    - "the advantage of successive relearning over single-session learning (i.e., relearning potency ) was substantial"
  - higham2022 (10.1037/edu0000693).
    - "Recall Of Course Material At The End Of The Semester Was Better For Relearning Compared With Restudying."
  - janes2020 (10.1002/acp.3699).
    - "successive relearning boosted students' learning of course content by at least 10%"
  - lindsey2014 (10.1177/0956797613504302).
    - "personalized review yielded a 16.5% boost in course retention"
- **Verdict:** moderate.
- **Match:** yes.

---

## Proposals: supported by three or more sources, not built yet

Code changes come after review. Each proposal gives its sources, the expected effect, the risk and the files it would touch.

### P1. Interleave the session body
- **Status: BUILT (flag `INTERLEAVE_SESSIONS`, default on; 2026-10-25, implementer B).**
  - Review still comes first. The first practice level after a lesson stays blocked.
  - From the second, the body is spread evenly across skills (`sessions.spreadBySkill`). From the third, one focus item in two is on an earlier topic.
  - Spanish, Reading and English Reading are unchanged, and the owner gets the base product.
  - Sitting repeats did not rise: 20.6% vs 22.0% at level 13, and 19.3% vs 19.8% at level 44 (10 runs each, on vs off).
  - Tests: `scripts/curriculum-evidence-test.js`.
- **What:** shuffle support, focus and stretch items across skills within a level, with review still first. On the practice runs after a lesson, raise the share of focus items drawn from earlier topics, for example from 1 in 3 to 1 in 2, after the first one or two practice levels.
- **Sources:** rohrer2015, rohrer2020, taylor2010, firth2021, brunmair2019.
- **Expected effect:** delayed-test gains in mathematics of d≈0.4-0.8 (rohrer2015, rohrer2020). The effect is smaller for vocabulary and expository material (brunmair2019).
- **Risk:** sessions feel harder, and learners prefer blocking (tauber2013). Keep a short block right after a lesson, then interleave. Leave the Spanish and reading text tracks unshuffled, or test them first.
- **Files:** `services/sessions.js` (`planLesson`, lines 153-167); `services/adaptation.js` if its plan builds the order.

### P2. Fade worked examples, and add self-explanation prompts
- **Status: SKIPPED (2026-10-25).** This would change the lesson format.
  - It needs a new lesson schema and prompt in `services/ai.js`, and a graded blank step in the lesson render in `public*/js/session.js`.
  - Both are outside the implementer's files.
  - The bank fallback alone cannot fade a step without that input.
- **What:**
  - Turn "worked example, then one step harder" into complete example → example with its last step blank → full problem, fading backward.
  - Add a one-line "which rule justifies this step?" prompt to each worked step.
- **Sources:** renkl2002, atkinson2003, salden2010, renkl2003, bisra2018 (g = .55 for inducing self-explanation).
- **Expected effect:** better near transfer from fading (renkl2002), and medium to large near and far transfer with prompts and fading together, without extra time (atkinson2003).
- **Risk:** longer lessons. The blank step needs a graded input. Expertise reversal means advanced learners should skip it (kalyuga2003).
- **Files:**
  - `services/lessons.js` (`buildFallback`).
  - `services/ai.js` (lesson system prompt, `LESSON_SCHEMA`, `validateLesson`).
  - `public/js/session.js` (lesson render), plus its `public-v2/` and `public-redesign/` copies.
  - `services/block-levels.js` (`LAYOUT_SYSTEM`, `Basic_Steps` usage).

### P3. Report and control classification error at checkpoints and the Challenge Exam
- **Status: BUILT (flags `CHECKPOINT_SPRT` and `CHALLENGE_SPRT`, default on; 2026-10-25, implementer B). Not built: extending a near-mark checkpoint by a few questions, which needs the quiz client to accept extra questions.**
- **The decision** (`config/curriculum.js` `passDecision`, `skipVerdicts`):
  - Each answer is weighed by Wald's log likelihood ratio between "should pass" and "should not":
    - Master and Grand: 0.85 vs 0.65.
    - Final: 0.90 vs 0.75.
    - Challenge: 0.90 vs 0.70.
  - Error rates: α = 0.05 (0.10 for the Challenge) and β = 0.10.
  - At full length the test reduces to "right ≥ needed". `needed` is where the ratio crosses even: 0.760 of the answers for Master and Grand, 0.834 for the Final, and 0.814 for the Challenge.
  - An exam ended early, or with skipped questions, passes only on decisive evidence (the upper SPRT boundary). 3 of 3 no longer passes a Master.
- **Checkpoints, exact binomial P(pass) by true accuracy:**

  | | .65 | .70 | .75 | .80 | .85 | .90 | .95 |
  |---|---|---|---|---|---|---|---|
  | Master 15, 12 needed (as before) | .173 | .297 | .461 | .648 | .823 | .944 | .995 |
  | Grand 25, 19 needed (as before) | .173 | .341 | .561 | .780 | .930 | .991 | 1.000 |
  | Final 40, **34 needed** | .004 | .024 | .096 | .286 | .607 | **.900** | .997 |
  | Final 40, 36 needed (old) | .000 | .003 | .016 | .076 | .263 | .629 | .952 |

  The Master and Grand bands sit at the owner's 75% mark. A 70% learner, just under it, still passes a Master 30% of the time. Only the extension (not built) or a longer quiz can cut that.
- **Challenge Exam:**
  - A gate band of 16 holds at 14 right. Each band of 6 above it holds with at most one miss.
  - The evidence over all bands so far must also favour a pass. This is a guard; with these sizes it never binds.
  - 40 questions (was 35).
  - Gate alone, exact: P(hold) is .789 at 90% (7/7 was .478) and .099 at 70% (was .082).
  - Simulated, 200,000 exams per row:

  | true accuracy | P(skips anything) new / old | P(all five bands) new / old |
  |---|---|---|
  | .70 | .100 / .083 | .003 / .000 |
  | .80 | .352 / .209 | .065 / .000 |
  | .90 | .790 / .479 | .488 / .026 |
  | .95 | .957 / .698 | .838 / .168 |
  | .95 falling .05 a band | bands 1-5 reached .957 .848 .659 .431 .229 / old .698 .333 .105 .022 .003 | |

  - The pages show "N of M needed" and "held". The rule is stored on each exam (`pass_rule`), so an open exam keeps the old rule.
  - The owner keeps five bands of seven, each perfect.
- **Why not a sequential (stop-early) Challenge:** separating 90% from 70% needs about 12-15 answers per decision. The exam's items are all sent up front, and the answer route returns no band state. A curtailed SPRT at 7-16 per band gave P(.9) .80 and P(.7) .12, with a mean of 12.4 questions a band (`scratchpad/sprt.js`).
- **Tests:** `scripts/curriculum-evidence-test.js`. `self-test.js` pins the off state.
- **What:**
  - Use a sequential Bayes or SPRT decision for the Challenge Exam bands instead of "7/7 or fail". Today a learner at 90% clears a band 48% of the time.
  - Use the same decision to extend a checkpoint by a few items when the score sits within the error band of the mark, rather than failing a learner at the true mark about a third of the time, as happens on the Final.
- **Sources:** lewis1990, spray1996, eggen1999, babcock2012, bock1982.
- **Expected effect:** the same or better classification accuracy with fewer items (lewis1990: test length halved), and fewer false fails for learners at the mark.
- **Risk:** variable-length quizzes look unequal to learners. Keep a minimum length and full skill coverage, and explain the extension.
- **Files:**
  - `config/curriculum.js` (`PASS_MARKS`, `CHECKPOINT_LENGTH`, `skipTargetFromBands`).
  - `services/sessions.js` (`planCheckpoint`, `resolveCheckpoint`, `planSkipExam`, `scoreSkipExam`).
  - `services/block-checkpoints.js` (write extra slots).

### P4. Calibrate difficulty and placement items from live responses
- **Status: SKIPPED, needs data (2026-10-25).** Online Elo or IRT calibration needs answer volume per item, which the app does not have yet.
- **What:**
  - Fit item difficulty online, by Elo or IRT, from real answers. Use it to replace the linear `difficultyForLevel`, the judge-calibrated placement points and the 0.75-of-unit default.
  - Use the same statistics to check that checkpoint styles are difficulty-neutral (M36).
- **Sources:** klinkenberg2011, pelanek2016, wauters2010, meyers2009, kaser2024, doroudi2017.
- **Expected effect:** levels pitched nearer the target success rate. Placement error measured on real learners instead of simulated ones.
- **Risk:** this needs volume per item. Cold-start items keep the judged values. Shrink toward the judged value until enough answers arrive.
- **Files:**
  - `config/curriculum.js` (`difficultyForLevel`, `gradeBand`).
  - `services/adaptive-placement.js`, `services/unit-placement.js`.
  - `content/unit-placement-calibration/*.json`, `services/scorecard/irt.js`.

### P5. Make "kept" mean a real delay
- **Status: BUILT, the "retained" half (flag `RETAIN_REAL_DELAY`, default on; 2026-10-25, implementer B).**
  - `RETAIN_SPAN_DAYS` defaults to 7 (was 1): an objective counts as retained only on a correct unaided check at least 7 days after its proof. Memory checks still start a day after.
  - Implementer C gated `adaptation.reviewQueue` so that, once retention is believed, a proven objective is not re-listed before day 7.
  - 21 days was not used, because graduation waits on "retained" (COVERAGE_GATE=enforce) and consolidation is capped at 21 days.
  - Not built: moving part of the end-of-session recall to the next session. It overlaps the retention section's P3 (the end-of-sitting set), which implementer A owns.
  - Tests: `coverage-test.js`.
- **What:**
  - Move part of the end-of-session recall to the start of the next session (one day or more).
  - Raise `RETAIN_DAYS` from 1 to a schedule that grows with time since proof, for example 1 day, then 7, then 21 or more, before an objective counts as retained at graduation.
- **Sources:** cepeda2006, cepeda2008, latimier2021, rawson2013power, janes2020, carpenter2009hist.
- **Expected effect:** larger long-term retention gains than same-session recall. "Retained" becomes an honest claim.
- **Risk:** graduation takes longer. Coordinate with the retention enforcers (`RETENTION-ENFORCER-EVIDENCE.md`) so items are not double-scheduled.
- **Files:** `services/sessions.js` (`retentionPlan`, `createSession`); `services/coverage.js` (`RETAIN_DAYS`, `RETAIN_SPAN_DAYS`); `services/mastery.js` (`dueReviews`).

### P6. Placement per-skill gaps on a belief, not a raw percentage
- **Status: BUILT (flag `PLACEMENT_SKILL_BELIEF`, default on; 2026-10-25, implementer B).**
  - `placement.score` uses unitBelief's Bayes update from an even prior: a strength needs P(known) ≥ 0.9, a gap P(known) ≤ 0.15, and anything between is a new "unsure" list.
  - One miss is no longer a gap, and two rights are no longer a strength.
  - An unsure skill is seen again the next day.
  - The owner keeps the percentage rule.
  - `routes/placement.js` does not display "unsure" yet.
  - Tests: `scripts/curriculum-evidence-test.js`.
- **What:** replace "under 60% is a gap" with a Bayesian belief using the same machinery as `unitBelief`, with a third outcome, "unsure", that the first sessions resolve.
- **Sources:** parsons2019, hedge2018, morris1983, vandesande2013, baker2008.
- **Expected effect:** fewer false gaps and false strengths seeded from 1-3 items.
- **Risk:** low. It changes only seeding and display.
- **Files:** `services/placement.js` (`score`, `seedSkillStates`), and the placement results display in `routes/placement.js`.

### P7. After a missed check or a failed checkpoint, nudge toward correctives before the retry
- **Status: SKIPPED (2026-10-25).** Both halves are UI: making "Help me learn" the default door, and re-showing the worked example with the missed check explained. Both live in `public*/js/session.js`, outside the implementer's files, and no server-only version reaches the learner.
- **What:**
  - When a lesson's checks are mostly missed, queue a short targeted re-study, the lesson's worked example re-shown with the missed check explained, before the next practice level.
  - After a failed checkpoint, make "Help me learn" the default door. The retry stays one tap away.
- **Sources:** guskey2007, bloom1984, kulik1990, pashler2005, vanderkleij2015, aleven2003.
- **Expected effect:** the corrective step that defines Bloom's mastery learning gets used, which learners skip when left to choose (aleven2003).
- **Risk:** it slows learners who missed by carelessness. Make it skippable and short.
- **Files:** `services/sessions.js` (`resolveBlock`, `resolveCheckpoint`); `services/lessons.js`; `services/remediation.js`; `public/js/session.js`.

### P8. Allow 3-option multiple choice where a fourth plausible distractor does not exist
- **Status: SKIPPED for practice and block items (2026-10-25).** The gate is `ai.validateItem` in `services/ai.js`, which is outside the implementer's files. Objective items now allow 3 options (03-scorecard-adaptation P11, flag `OBJ_ITEMS_3_OPTIONS`).
- **What:** accept 3 distinct options in `validateItem` and `whyRefused` for practice items, and keep 4 for checkpoints if the owner wants.
- **Sources:** rodriguez2005, haladyna2002, little2012.
- **Expected effect:** fewer implausible filler distractors, fewer repair calls, and more items per minute (rodriguez2005).
- **Risk:** guessing rises from 25% to 33%, so the coverage and unit-belief guess terms must read the real option count. They already take `choices`.
- **Files:** `services/ai.js` (`validateItem`); `services/block-levels.js` (`whyRefused`, `FILL_SYSTEM`); `services/block-checkpoints.js` (`FILL_SYSTEM`).

### P9. Close the loop on challenge
- **Status: SKIPPED, needs data (2026-10-25).** Tuning the shares to realised accuracy by role needs logged real sessions.
- **What:** log realised accuracy by role (support, focus, stretch). Move `stretchShare` and `supportShare`, and the next-session difficulty delta, so that focus items run near 80-85%.
- **Sources:** wilson2019, wauters2010, klinkenberg2011, belland2017, tetzlaff2025.
- **Expected effect:** time spent where learning per item is highest.
- **Risk:** feedback loops can oscillate. Clamp the step size, as `sessionParams` already clamps the shares.
- **Files:** `services/learner.js` (`sessionParams`); `services/adaptation.js`; `services/sessions.js` (`ruleBasedAnalysis`).

### P10. Never serve an unverified AI level when the verifier key is missing
- **Status: BUILT (flag `LEVEL_SELF_CHECK`, default on; 2026-10-25, implementer B).**
  - With no `FACT_CHECK_ANTHROPIC_KEY`, a block level is served only after a self-check (`block-levels.selfCheck`):
    - a claim-by-claim read on the app's own route, with repairs;
    - a blind re-solve of every multiple-choice check by a judge from another family (`key-gate.blindResolve`; NVIDIA first, never xKiro or UnoRouter). A disagreeing check is dropped; if no judge answers, the level fails.
  - Levels verified earlier under the key (Claude) are still served.
  - Everything else falls back to the ordinary session and the bank lesson.
  - Tailored checkpoints keep only the questions the blind judge confirms, and the bank fills the rest.
  - Model-written ordinary lessons (`lessons.js`) are not served without the key.
  - It is a safety rule, so it applies to the owner too.
  - With the key set, nothing changes.
  - Tests: `block-levels-test.js` and `key-gate-test.js`.
  - In the browser on a no-key test copy: an unverified English base plan went to the bank lesson, and a Sonnet-verified chess level was served.
- **What:** when `gateOn()` is false, run a cheaper independent check rather than serving the plan unverified:
  - a self-consistency re-solve of every graded check (the key gate already does this for lessons);
  - a Chain-of-Verification pass on factual claims, on a free model allowed by the owner's model rules;
  - otherwise fall back to the bank lesson.
- **Sources:** dhuliawala2024, manakul2023, wang2022sc, min2023, ji2023, bastani2025.
- **Expected effect:** fewer factual and answer-key errors reaching learners. The code records the fallback route catching 2 of 13 known errors.
- **Risk:** latency and free-tier limits. The bank fallback guarantees nothing breaks.
- **Files:** `services/block-levels.js` (`gateOn`, `servable`, `verifyOn`, `verifyAndRepair`); `services/key-gate.js`; `services/providers`.

---

## Source index

These are the sources used in this section beyond the new ones in `01-curriculum-levels-placement-sources.json`, all reused and already verified:

rohrer2007, rohrer2015, rohrer2020, taylor2010, firth2021, brunmair2019, tauber2013, sweller1985, renkl2014, renkl2003, atkinson2000, salden2010, kalyuga2003, kalyuga2004, kalyuga2005, kalyuga2007, tetzlaff2025, belland2017, vandepol2010, wood1976, kapur2016, roediger2006, roediger2011, rowland2014, adesope2017, yang2021, agarwal2021, agarwal2019, pan2018, pan2019clicker, butler2017, butler2013, butler2007, mcdaniel2007, mcdermott2014, little2012, kang2007, smith2014, pastotter2014, carpenter2009hist, chan2006, szpunar2007, khanna2013, lawrence2013, mayfield2002, bangertdrowns1991freq, kulik1990, bloom1984, major2021, doroudi2019fair, doroudi2017, kaser2024, koedinger2023, wilson2019, metcalfe2005, wauters2010, pelanek2016, klinkenberg2011, weiss1984, hartig2012, debeer2013, debeer2014, borgonovi2016, ackerman2009, meyers2009, wise2005, wise2006, wise2017, morris1983, casella1985, parsons2019, hedge2018, brown1978, vanlehn1990, metcalfe2011, hattie2007, shute2008, vanderkleij2015, pashler2005, kulik1988, metcalfe2009, schroeder2023, tippett2010, mclaren2016, harp1998, sundararajan2020, mayer1996, rey2019, noetel2022, liu2024lost, levy2024, shi2023, bastani2025, cheung2016, lortieforgues2019, messick1995, kane2013, walkington2013, corbett1994, cepeda2006, cepeda2008, latimier2021, lindsey2014, settles2016, tabibian2019, kang2014, eglington2020, pyc2007, mettler2016, vaughn2011, rawson2011, rawson2018, janes2020, higham2022, lyle2020, aleven2003, aleven2016help, paas1994, bisra2018, rawson2013power.
