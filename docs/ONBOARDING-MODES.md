# Onboarding modes: Quick, Balanced, Accurate

**Everything with a percentage below is SIMULATED.** The learners, their true values and the validity of every item are assumptions (section 7). It compares designs in one stated world; it is not a result about real learners, and no AI-judged or simulated number here should be quoted as one.

Branch `subj-o`. Owner's goal (2026-11-02): before Savant generates anything, the most accurate possible picture of how this learner's brain works and how they learn best, in a mode that fits their time: **Quick under 5 minutes, Balanced about 15 to 20, Accurate under 60.**

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

**As shipped at this commit (the items that exist, not the whole designed pool).** The free endpoint was rate-limited for hours, so the item builder (scripts/build-onboarding-items.js, resumable) finished only part of the words: 24 of 100 measures have both checked self-report items, and the reading passages, mini-lesson parts, A/B taste pairs and the analogy, cause and abstract reasoning items **have no words yet, so the app does not offer them** (the number-series and conditional items, span, speed, switching and the survey need no builder and are offered). The same simulation limited to what exists (`--shipped`): quick 86.58% (+0.08, median 4.51 min, p90 4.58); balanced 86.77% (+0.27, median 17.88 min, p90 18); accurate 86.82% (+0.32, median 24.65 min, p90 36.59). So **the section 2 numbers need the builder to finish (a rerun of `node scripts/build-onboarding-items.js`); until then Balanced and Accurate stop early (nothing left worth its time) and carry no mini-lesson.** That is the main thing left to do.

## 3. How a session works

- **One picker** (public/baseline.html, public/js/baseline.js): Quick / Balanced / Accurate with honest minutes and what each is for; progress is minutes left, never a question count; "stop here and save what I have" is always there. Same clean flow as the quiz. Sign-up goes here instead of quiz-then-survey (public/js/auth.js).
- **The pool** (services/onboarding/pool.js, 267 items): two forced-choice self-report items per measure plus the 20 existing style-quiz items; a working-memory span, a processing-speed task, two reading passages with comprehension (rate and level), two task-switching blocks (switch cost), five kinds of reasoning item with a confidence rating on each (calibration), a three-part **mini-lesson with real choice points** (why or steps, hint or try, plan or dive in, go deeper or move on, challenge or solo, bonus or skip, connect it or not, one more or done), four **A/B teaching tastes** each with an in-session recall check on both versions (so preference is measured next to what was actually learned), and the interests and goals survey cut to the mode. Each item records which measures it reads, its validity and its median seconds.
- **Adaptive choice** (services/onboarding/model.js, plan.js): after every answer the next item is the one that removes the most posterior uncertainty (summed over the measures it reads) per expected second **at this learner's own pace**, among items that still fit in the time left. It stops at the mode's budget or when nothing is worth its time (Balanced and Accurate stop below 0.1 points of uncertainty per minute). A slow learner gets fewer items, never a longer session: Quick hard-stops at 4.6 minutes of the learner's own pace.
- **Wired into the scorecard** (services/onboarding/baseline.js, index.js): the estimates enter as designed-test observations (`scorecard.observe`, source 'onboarding'), so the scorecard, and therefore services/learning-spec.js, has the baseline before the first level is written. A deeper retake from the profile ("Go deeper on how you learn") starts from the evidence and the used items already stored and feeds only the precision it adds: the learned history is kept.
- **Consent**: the same rule as the other measurement channels (`boosters.allowed`). An account under its consent age without a parent's `measurement_extras` agreement, or without the age screen answered, gets no new channel: the page sends it to the old style quiz and survey, unchanged (scripts/onboarding-test.js checks nothing is stored).
- **Words and checks**: the self-report items, passages, analogy/cause/abstract items, mini-lesson parts and taste pairs were written by free NVIDIA models (scripts/build-onboarding-items.js) and every one with a key or a pole was re-solved blind by a second pass; the number-series and conditional-reasoning items are generated with keys by construction. Kept after the checks: self-report items for 24 of 100 measures with both items and 24 with at least one, reading passages 0, analogy/causal/abstract items 0, mini-lesson parts 0, taste pairs 0. An item that failed or has no words is not offered (services/onboarding/index.js `available`). Keys never leave the server. The free endpoint was slow and rate-limited for some models during the build; the script prints which model answered how many checks, so a check a model made on its own writing is visible as such.

## 4. Subject placement at the new limits (simulated, scripts/placement-sim.js --summary, 40 learners per level)

The owner's limits are Quick under 5 minutes, Balanced about 20, Accurate under 60 (they were 20 / 45 / 90). A question is budgeted at 26 seconds, as the old clocks were. The walk and its stop rule (`sure`) are unchanged; only the caps and clocks shrink (`WHOLE_MINUTES` 5 / 20 / 57; subject-stage clocks Quick 4.4, Balanced 14, Accurate 40 minutes; in-grade clocks Quick 0.5, Balanced 6, Accurate 14. **The question caps and the stop rule are unchanged, so the clock binds**: at the 26-second budget that is about 10 subject questions in Quick, 32 in Balanced and 92 in Accurate, and a faster learner gets more, up to the old cap. The tables below simulate those counts (the simulator ignores clocks, so they are run with the cap set to the count the clock allows)).

| mode | today's limits: within 1 grade | exact | questions | new limits: within 1 grade | exact | questions |
|---|---|---|---|---|---|---|
| quick, clock-bound at 26 s a question (10 questions) | 99.4% | 69.9% | 24.8 | 82.0% | 52.4% | 9.7 |
| quick, if a question takes 18 s or less (14 questions fit) | 99.4% | 69.9% | 24.8 | 94.0% | 63.5% | 14.2 |
| balanced | 99.4% | 69.8% | 34.2 | 99.3% | 69.3% | 23.7 |
| accurate | 99.4% | 69.8% | 78.0 | 99.4% | 69.8% | 63.6 |

(All nine simulated subjects; "within 1 grade" is the share placed within one grade of the truth, averaged over true levels from knows-nothing to knows-everything, the in-grade draw. The sealed Spanish files were not touched.)

Within 1 grade, per subject:

| subject | Quick before | Quick now | Balanced before | Balanced now | Accurate before | Accurate now |
|---|---|---|---|---|---|---|
| math | 99.6% | 64.8% | 99.6% | 99.1% | 99.6% | 99.6% |
| english | 99.8% | 89.3% | 99.8% | 99.8% | 99.8% | 99.8% |
| reading | 99.8% | 88.2% | 99.8% | 99.8% | 99.8% | 99.8% |
| iq | 99.8% | 90.9% | 99.8% | 99.8% | 99.8% | 99.8% |
| act | 99.3% | 91.8% | 99.3% | 98.9% | 99.3% | 99.3% |
| spanish | 99.8% | 56.8% | 99.8% | 99.3% | 99.8% | 99.8% |
| chess | 99.1% | 85.5% | 99.1% | 99.1% | 99.1% | 99.1% |
| piano | 98.6% | 83.6% | 98.6% | 98.9% | 98.6% | 98.6% |
| basketball | 98.9% | 87.1% | 99.1% | 98.9% | 99.1% | 99.1% |

**Quick under 5 minutes drops below 90% within one grade: 82.0% on average (math and Spanish fall furthest), against 99.4% at the old 20 minutes.** Balanced and Accurate keep within-1 at about 99% and exact at about 69%; they only lose time. I did not weaken the stop rule or any test gate to hide this: Quick simply gets about 10 questions in the time (up to 16 if the learner is quick), and the beginner-floor gate in scripts/placement-sim-test.js, and the ceiling and floor gates (scripts/placement-ceiling-test.js, placement-sim-test.js), which a 10-question cap fails (a top-of-subject learner is placed up to 19 grades low in math), are why the count caps are left as they were and the clock does the limiting. Those gates therefore still pass on counts the clock no longer lets Quick reach: they say nothing about Quick at 5 minutes, and the table above does.

**The best design that fits 5 minutes** (nothing of it is built; it is proposed): the count of questions, not the clock, is what limits Quick. With the same walk, a cap of 16 questions (it stops itself at 14.2 on average) places **94.0%** within one grade and a cap of 21 (17.5 on average) places **97.5%**. Five minutes holds that many only if a question takes about 21 seconds (14 questions) to 17 seconds (17 questions) instead of 26. So: (1) give Quick a walk that spends seconds, not questions, preferring the short calibrated items near its target (the walk already picks the item nearest the belief's middle; add item length to that choice); (2) measure real seconds per placement question per subject to confirm the 26-second budget (no real timings exist; everything here rests on that number); (3) start Quick from a prior (the learner's stated grade or age) instead of the flat prior, which the walk already supports for the first target. Until then Quick is a provisional placement that the first levels' own adaptivity corrects. The owner should decide whether Quick placement at about 82% is acceptable as a first look, or whether Quick keeps a longer clock for placement only.

## 5. What was not done or is not verified

- **No real-learner data.** Every accuracy here is simulated; the validities (model.js FAMILIES, pool.js) are conservative literature-anchored assumptions, not measured on this app's learners. Gains could be smaller (the pessimistic row) or larger.
- **Measures are treated as independent**, so no precision is borrowed from correlated measures. Real measures correlate; a factor model fitted on real learners would raise accuracy per minute, and cannot be validated in this simulation (its truth model has no correlations).
- **Norms** for span, speed, reading rate and switch cost (services/onboarding/tasks.js) are assumed adult-and-teen figures; the scorecard re-standardises as its cohort grows. Children's norms are lower; under-13 accounts take none of these tasks without a parent's agreement.
- **Time per item** (10 s per forced-choice item, 110 s for the span task, ...) is estimated, not timed on people. The planner uses the learner's real pace as it goes, so the limits hold, but the item count in each mode would change.
- **The screens** (baseline.js) were exercised through the service in tests, not clicked through in a browser by a person on a phone.
- The mini-lesson's choice points and the tastes' recall check are single events with low individual validity (0.12 to 0.3); the model credits them as such. The spatial span and choice-reaction tasks in the first design were dropped for lack of a screen.
- **Subject placement Quick** is below 90% (section 4); the 5-minute design is proposed, not built.
- Money: free NVIDIA models only; Standard Compute $0, Anthropic $0.

## 6. Files

services/onboarding/{model,pool,plan,tasks,baseline,index}.js, routes/onboarding.js, public/baseline.html, public/js/baseline.js, content/onboarding/items.json, scripts/{onboarding-sim,build-onboarding-items,onboarding-test}.js, scripts/placement-sim.js (--summary, --limits), services/adaptive-placement.js and unit-placement.js (limits), services/scorecard/index.js (exports STYLE_MAP), public/js/{auth,profile}.js, public/act.html and scripts/act-landing-test.js (the 5 to 57 minute text).

## 7. Assumptions in one place

Population sd 17 points; independent measures; each item has a validity r (single item: 0.1 to 0.65) and its family a ceiling rho (self-report 0.45, goals 0.5, working memory 0.85, speed 0.8, reading 0.75, reasoning 0.75, switching 0.5, mini-lesson 0.55, tastes 0.45, confidence 0.55); items of one family on one measure share a persistent method error (so repeating a method stops helping at its ceiling); a learner's pace is lognormal (sd 0.28) around the median; validity falls by up to 20% over an hour of fatigue; an item's seconds vary 20% around its median.
