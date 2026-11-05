# Extreme and randomly generated learners: how every part of Savant does for the learners who are least like everybody else

Branch `extremes`, 4 to 5 November 2026. Code: `scripts/lib/extreme-learners.js` (the generator), `scripts/extreme-learners.js` (reports), `scripts/lib/extreme-tailor.js`, `scripts/lib/extreme-outcome.js`, test `scripts/extreme-learners-test.js` (in `npm test`); small switches in `scripts/scorecard-recovery-sim.js` (`--extreme`) and `scripts/scorecard-90-measure.js` (`--per-learner`). Raw results: `docs/extreme-learners/`.

**Everything here is simulated.** The learners are generated numbers, not people. The scorecard and outcome figures come from the repo's own simulations; the tailoring figures are one AI judge's (GLM-5.3, blind, planted-swap checked) verdicts on text another AI wrote. None of it is evidence about real learners. **Real testers are the proof**, and the numbers below say what to look for when they arrive.

## 1. The generator

`scripts/lib/extreme-learners.js`: learner `i` of seed `S` is a pure function of `(S, i)`, so a held-out seed is another number. A stripe over `i % 10` puts every kind in every block of ten:

| kind | what it is |
|---|---|
| tail_hi / tail_lo | 3 to 9 random traits pushed to one tail (2-8 or 92-98), the rest ordinary |
| tail_both | 4 to 13 traits at either tail at random |
| contradict | one of 12 named contradictory mixes: fast but forgetful, high reasoning with slow decoding, anxious and competitive, curious but cannot sit still, brilliant and hates effort, works hard but learns slowly, confident and often wrong, solitary with no feedback wanted, creative but needs rigid structure, bursty and long gaps, skims yet remembers, needs praise but shuts down when corrected |
| random | every one of the 100 traits uniform over 2-98: the whole space, no population shape, no correlation between traits |
| age_young / age_old | ages 8-10 and 62-70, with the age band's cited shifts (`scripts/lib/scorecard-strata.js`) and a random tail on top |
| ell | an English learner (low vocabulary, intact reasoning) at any age |
| all_hi / all_lo | every trait at one tail (opt-in corner of the space, `{ corners: true }`; tested, not in the runs below) |

Every learner also has an age 8 to 70, 0 to 3 hobbies from a list of 78 (beekeeping, falconry, speedcubing, roller derby, tide pools, puppetry, not only soccer and music), 0 to 3 dislikes, 0 to 2 past difficulties and 0 to 2 strengths; about 8% of the rest are English learners with a first language. `node scripts/extreme-learners.js gen --seed 424242 --n 20` prints a sample.

## 2. Scorecard accuracy per individual (SIMULATED)

**Method.** The recovery simulation (`scripts/scorecard-recovery-sim.js --extreme=1`, 60 minutes a day, truth factors on, 30 other learners as the population) runs 160 learners on seed 424242, of which 122 are extreme (75%) and 38 ordinary beside them, so the cohort the read-out is standardised on is realistic. The recalibration is fitted ONLY on 250 ordinary learners from two other seeds (20261022 and 7, `--strata=1`) and scored on the held-out seed: the read-out has never seen an extreme learner. `scripts/scorecard-90-measure.js --per-learner` writes each learner's own error over the 100 measures at day 0 (prior only), and the stages S0 (the app as it is), S1 (recalibrated read) and S5 (the designed plan, 6.3 minutes a day), at day 30 and day 180. Accuracy is 100 minus the mean absolute error. The **guess baseline** is predicting the pooled calibration mean for everyone; **share of error removed** is `1 - error / baseline error`. Worst 10% / 5% / 1% is the mean accuracy of that share of individuals (n = 122: 13, 7 and 2 learners).

### Scorecard accuracy at day 30 (SIMULATED), 122 extreme learners (held out), 38 ordinary alongside

| stage | mean acc | worst 10% | worst 5% | worst 1% | worst one | guess baseline | share of error removed | removed, worst 10% | ordinary learners acc |
|---|---|---|---|---|---|---|---|---|---|
| day 0 (prior only) | 80.5 | 74.4 | 73.6 | 72.4 | 72.0 | 80.5 | 0% | 0% | 86.0 |
| the app as it is | 82.9 | 78.1 | 77.3 | 75.9 | 75.7 | 80.5 | 12% | 3% | 87.1 |
| recalibrated read | 83.7 | 78.7 | 77.9 | 76.9 | 76.3 | 80.5 | 17% | 8% | 88.3 |
| designed plan (6.3 min/day) | 90.4 | 88.2 | 87.8 | 87.4 | 87.4 | 80.5 | 51% | 43% | 92.7 |

By kind (S5 accuracy, guess baseline, share of error removed, worst individual):

| kind | n | S0 | S1 | S5 | guess | removed (S5) | worst |
|---|---|---|---|---|---|---|---|
| tail_hi | 15 | 83.6 | 84.4 | 90.8 | 81.6 | 50% | 89.2 |
| random | 24 | 79.2 | 79.9 | 88.8 | 75.8 | 54% | 87.4 |
| age_young | 11 | 84.3 | 85.7 | 91.1 | 82.8 | 48% | 90.1 |
| age_old | 14 | 82.9 | 84.0 | 90.5 | 80.6 | 51% | 89.7 |
| ell | 12 | 84.7 | 85.7 | 91.2 | 82.7 | 49% | 90.6 |
| tail_lo | 11 | 84.4 | 85.5 | 91.2 | 82.0 | 51% | 90.4 |
| contradict | 24 | 83.6 | 84.1 | 90.7 | 81.1 | 50% | 89.5 |
| tail_both | 11 | 83.8 | 84.2 | 90.6 | 81.4 | 49% | 89.3 |

Contradictory mixes (S5):

| mix | n | S5 acc | guess | removed |
|---|---|---|---|---|
| curious but cannot sit still | 2 | 89.9 | 81.3 | 46% |
| needs praise but shuts down when corrected | 4 | 91.4 | 80.7 | 55% |
| fast but forgetful | 5 | 90.5 | 80.8 | 50% |
| high reasoning, slow decoding | 3 | 90.5 | 80.8 | 50% |
| confident and often wrong | 3 | 90.2 | 80.9 | 49% |
| brilliant, hates effort | 2 | 90.5 | 81.1 | 50% |
| skims everything yet remembers | 2 | 91.4 | 83.3 | 48% |
| works very hard, learns slowly | 3 | 90.7 | 81.3 | 50% |

By age band (S5):

| band | n | S5 acc | guess | removed |
|---|---|---|---|---|
| 18-29 | 26 | 90.4 | 80.5 | 51% |
| 30-59 | 40 | 90.2 | 79.6 | 52% |
| 8-12 | 14 | 90.8 | 82.1 | 49% |
| 60+ | 28 | 90.6 | 80.5 | 52% |
| 13-17 | 14 | 90.6 | 81.2 | 50% |

Why: the measures that sit in a tail (<=10 or >=90; 1535 learner-measures) have S5 MAE 16.7 (guess 42.7); the rest 8.5 (guess 16.2).

By number of tail traits (S5):

| tails | n | S5 acc | guess | removed |
|---|---|---|---|---|
| 4-9 | 26 | 91.0 | 82.3 | 49% |
| 10-30 | 96 | 90.3 | 80.0 | 51% |

Measures with the largest S5 error when the learner is at that tail (n>=6): depth_breadth 34.6 (guess 45.4, n 9); conceptual_bias 33.6 (guess 44.2, n 13); integration_tendency 31.9 (guess 44.0, n 20); creative_extension 31.7 (guess 44.7, n 15); question_generation 28.4 (guess 44.6, n 11); mastery_orientation 26.2 (guess 43.5, n 16); planning_tendency 23.5 (guess 42.1, n 19); interference_susceptibility 23.4 (guess 43.4, n 16)

Individuals worse than the pooled-mean guess at S5: 0 of 122.

Worst five individuals at S5:
- x424242-96: accuracy 87.4 (guess 77.7, removed 43%). x424242-96 random age 27 ELL(Mandarin); high tail: text_density_tolerance, systems_thinking, momentum_dependence, stimulus_envelope, generation_effect, emotional_engagement, application_orientation; low tail: processing_velocity, deductive_trajectory, cognitive_flexibility, attention_runway, instruction_adherence; hobbies: bass guitar; dislikes: -; past difficulties: English is the second language. Largest errors: emotional_engagement 33.3, interference_susceptibility 30.6, application_orientation 28, conceptual_bias 28, far_transfer 24.4
- x424242-106: accuracy 87.5 (guess 72.0, removed 55%). x424242-106 random age 59; high tail: jargon_absorption, pattern_detection, interleaving_tolerance, gamification_response, challenge_appetite, help_seeking, structure_need, worked_example_dependence (+9); low tail: analogical_transfer, humor_receptivity, mastery_orientation, brevity_preference, dialogic_preference, extrinsic_reward_sensitivity, emotional_engagement; hobbies: competitive baking shows, drone racing; dislikes: rewrites of the same idea three times; past difficulties: missed a year of school, dyscalculia-like trouble with number sense. Largest errors: integration_tendency 45.2, emotional_engagement 33.8, extrinsic_reward_sensitivity 33.4, conceptual_bias 29.6, help_seeking 28.8
- x424242-43: accuracy 87.6 (guess 72.8, removed 54%). x424242-43 random age 30; high tail: spatial_anchoring, cognitive_flexibility, novelty_hunger, decay_rate, generation_effect, instruction_adherence, repetition_tolerance, open_response_performance (+2); low tail: working_memory_span, example_density_need, jargon_absorption, logical_rigor, cycle_architecture, attention_runway, interleaving_tolerance, rush_tendency (+8); hobbies: -; dislikes: being told the answer right away; past difficulties: -. Largest errors: persistence 41.4, cognitive_flexibility 40.7, question_generation 38.9, extrinsic_reward_sensitivity 35.8, competitive_drive 34
- x424242-153: accuracy 87.8 (guess 74.9, removed 51%). x424242-153 random age 31; high tail: intake_baseline, working_memory_span, spatial_anchoring, logical_rigor, cycle_architecture, fatigue_curve, recognition_recall_gap, generation_effect (+1); low tail: narrative_pull, failure_response, structure_need, notation_comfort, extrinsic_reward_sensitivity, emotional_engagement, far_transfer; hobbies: ship model building, fishing, fantasy football; dislikes: timed quizzes; past difficulties: missed a year of school, forgets formulas overnight. Largest errors: far_transfer 31.3, persistence 31, mastery_velocity 30.5, vocabulary_ceiling 30.2, failure_response 26.7
- x424242-136: accuracy 87.9 (guess 74.3, removed 53%). x424242-136 random age 58; high tail: generation_effect, hint_dependency, error_driven_learning, boredom_susceptibility, near_transfer; low tail: example_density_need, analogical_transfer, systems_thinking, deliberation_depth, humor_receptivity, gamification_response, consolidation_need, guessing_propensity (+6); hobbies: roller derby, lockpicking sport; dislikes: repetition drills, group work framing, word problems about money; past difficulties: math anxiety since middle school. Largest errors: depth_breadth 41.9, generation_effect 35.2, strategy_awareness 35, contradiction_sensitivity 31.8, creative_extension 30.4

### Scorecard accuracy at day 180 (SIMULATED), 122 extreme learners (held out), 38 ordinary alongside

| stage | mean acc | worst 10% | worst 5% | worst 1% | worst one | guess baseline | share of error removed | removed, worst 10% | ordinary learners acc |
|---|---|---|---|---|---|---|---|---|---|
| day 0 (prior only) | 80.5 | 74.4 | 73.6 | 72.5 | 72.1 | 80.5 | 0% | 0% | 86.0 |
| the app as it is | 82.5 | 77.8 | 76.9 | 75.7 | 75.6 | 80.5 | 10% | 2% | 86.9 |
| recalibrated read | 84.2 | 79.2 | 78.4 | 77.2 | 76.8 | 80.5 | 19% | 10% | 89.0 |
| designed plan (6.3 min/day) | 91.7 | 90.0 | 89.7 | 89.4 | 89.4 | 80.5 | 57% | 49% | 93.5 |

By kind (S5 accuracy, guess baseline, share of error removed, worst individual):

| kind | n | S0 | S1 | S5 | guess | removed (S5) | worst |
|---|---|---|---|---|---|---|---|
| tail_hi | 15 | 83.2 | 84.7 | 91.9 | 81.6 | 56% | 90.8 |
| random | 24 | 79.0 | 80.6 | 90.7 | 75.8 | 62% | 89.4 |
| age_young | 11 | 84.0 | 85.9 | 92.1 | 82.8 | 54% | 90.4 |
| age_old | 14 | 82.2 | 84.3 | 91.9 | 80.6 | 58% | 91.0 |
| ell | 12 | 84.4 | 86.0 | 92.1 | 82.7 | 54% | 91.2 |
| tail_lo | 11 | 84.2 | 86.0 | 92.2 | 82.0 | 57% | 90.4 |
| contradict | 24 | 83.1 | 84.6 | 91.5 | 81.1 | 55% | 90.0 |
| tail_both | 11 | 83.3 | 84.9 | 92.1 | 81.5 | 58% | 90.8 |

Contradictory mixes (S5):

| mix | n | S5 acc | guess | removed |
|---|---|---|---|---|
| curious but cannot sit still | 2 | 91.3 | 81.4 | 53% |
| needs praise but shuts down when corrected | 4 | 92.0 | 80.7 | 58% |
| fast but forgetful | 5 | 90.9 | 80.8 | 53% |
| high reasoning, slow decoding | 3 | 92.0 | 80.8 | 58% |
| confident and often wrong | 3 | 91.3 | 80.9 | 55% |
| brilliant, hates effort | 2 | 91.2 | 81.2 | 53% |
| skims everything yet remembers | 2 | 92.5 | 83.2 | 55% |
| works very hard, learns slowly | 3 | 91.1 | 81.2 | 53% |

By age band (S5):

| band | n | S5 acc | guess | removed |
|---|---|---|---|---|
| 18-29 | 26 | 91.6 | 80.5 | 57% |
| 30-59 | 40 | 91.5 | 79.7 | 58% |
| 8-12 | 14 | 91.8 | 82.1 | 54% |
| 60+ | 28 | 91.8 | 80.5 | 58% |
| 13-17 | 14 | 92.0 | 81.2 | 57% |

Why: the measures that sit in a tail (<=10 or >=90; 1535 learner-measures) have S5 MAE 14.0 (guess 42.7); the rest 7.5 (guess 16.2).

By number of tail traits (S5):

| tails | n | S5 acc | guess | removed |
|---|---|---|---|---|
| 4-9 | 26 | 92.1 | 82.3 | 55% |
| 10-30 | 96 | 91.6 | 80.0 | 58% |

Measures with the largest S5 error when the learner is at that tail (n>=6): depth_breadth 30.1 (guess 45.4, n 9); creative_extension 29.0 (guess 44.7, n 15); question_generation 27.5 (guess 44.6, n 11); integration_tendency 27.0 (guess 44.0, n 20); conceptual_bias 25.9 (guess 44.2, n 13); fatigue_curve 23.9 (guess 44.6, n 11); mastery_velocity 23.5 (guess 44.3, n 19); intrinsic_motivation 23.5 (guess 44.0, n 20)

Individuals worse than the pooled-mean guess at S5: 0 of 122.

Worst five individuals at S5:
- x424242-103: accuracy 89.4 (guess 77.8, removed 52%). x424242-103 random age 41; high tail: cognitive_flexibility, logical_rigor, deliberation_depth, reentry_cost, failure_response, confidence_calibration; low tail: contradiction_sensitivity, narrative_pull, challenge_appetite; hobbies: roller derby; dislikes: -; past difficulties: forgets formulas overnight. Largest errors: failure_response 29.2, error_recovery_speed 29.2, interference_susceptibility 27.9, confidence_calibration 26, self_monitoring 26
- x424242-106: accuracy 89.5 (guess 72.1, removed 62%). x424242-106 random age 59; high tail: jargon_absorption, pattern_detection, interleaving_tolerance, gamification_response, challenge_appetite, help_seeking, structure_need, worked_example_dependence (+9); low tail: analogical_transfer, humor_receptivity, mastery_orientation, brevity_preference, dialogic_preference, extrinsic_reward_sensitivity, emotional_engagement; hobbies: competitive baking shows, drone racing; dislikes: rewrites of the same idea three times; past difficulties: missed a year of school, dyscalculia-like trouble with number sense. Largest errors: error_driven_learning 33.1, misconception_persistence 33.1, recognition_recall_gap 30.6, open_response_performance 30.6, vocabulary_ceiling 30.5
- x424242-136: accuracy 89.6 (guess 74.4, removed 59%). x424242-136 random age 58; high tail: generation_effect, hint_dependency, error_driven_learning, boredom_susceptibility, near_transfer; low tail: example_density_need, analogical_transfer, systems_thinking, deliberation_depth, humor_receptivity, gamification_response, consolidation_need, guessing_propensity (+6); hobbies: roller derby, lockpicking sport; dislikes: repetition drills, group work framing, word problems about money; past difficulties: math anxiety since middle school. Largest errors: depth_breadth 32.9, productive_struggle 32.6, cognitive_flexibility 30.4, conceptual_bias 29.4, momentum_dependence 28
- x424242-153: accuracy 89.8 (guess 74.9, removed 59%). x424242-153 random age 31; high tail: intake_baseline, working_memory_span, spatial_anchoring, logical_rigor, cycle_architecture, fatigue_curve, recognition_recall_gap, generation_effect (+1); low tail: narrative_pull, failure_response, structure_need, notation_comfort, extrinsic_reward_sensitivity, emotional_engagement, far_transfer; hobbies: ship model building, fishing, fantasy football; dislikes: timed quizzes; past difficulties: missed a year of school, forgets formulas overnight. Largest errors: failure_response 36, error_recovery_speed 36, cycle_architecture 35.7, persistence 32.8, vocabulary_ceiling 29.3
- x424242-16: accuracy 89.8 (guess 73.7, removed 61%). x424242-16 random age 53; high tail: jargon_absorption, systems_thinking, challenge_appetite, decay_rate, elaboration_benefit, guessing_propensity, autonomy_preference, self_efficacy (+2); low tail: abstraction_tolerance, interleaving_tolerance, deliberation_depth, reentry_cost, curiosity_hook, error_recovery_speed, structure_need, notation_comfort (+2); hobbies: birdwatching, puppetry; dislikes: -; past difficulties: missed a year of school, dyslexia-like slow reading. Largest errors: creative_extension 35.2, integration_tendency 27.9, far_transfer 27.2, notation_comfort 26.1, recognition_recall_gap 24.8


**Reading it.**

- **No extreme learner is made worse than guessing by the designed plan or the recalibrated read; two are by the app as it is at day 180** (`x424242-117` and `x424242-56`, S0: equal to or 0.4 points under the baseline).
- Extreme learners have lower absolute accuracy than ordinary ones (S5 90.4 against 92.7 at day 30) only because the baseline is further from them (80.5 against 86.0). Their share of error removed is as good or better (S5 51% against 48% at day 30; 57% against 54% at day 180; S0 12% against 8% at day 30). The accuracy gap is the cost of being unusual, not a failure to read them.
- **The app as it is (S0) barely reads the worst learners:** the worst 10% remove 3% of their error at day 30 and 2% at day 180, the worst learner 75.7 against a day-0 prior of 72.0. The designed measurement plan (S5) is what separates them from the guess: worst 10% 88.2 at day 30 and 90.0 at day 180, worst 1% 87.4 and 89.4.
- **Which profiles fail, and why.** Not a kind: every kind of learner lands within 2 points of the others (S5 88.8 to 91.2 at day 30; the hardest is `random`, the easiest `tail_lo` and `ell`). The failure is a measure when it sits in a tail: a learner-measure at a tail (2 to 10 or 90 to 98) has S5 MAE 16.7 against 8.5 for the rest (the guess baseline there is 42.7), because every read-out shrinks toward the population mean and a tail is 2.6 SD from it. The worst tail measures are the low-signal ones (`depth_breadth` 34.6, `conceptual_bias` 33.6, `integration_tendency` 31.9, `creative_extension` 31.7, `question_generation` 28.4 at day 30). `random` learners are the hardest group because their traits are not correlated, and the joint posterior leans on the cross-measure correlation the population has. Age band hardly matters (S5 90.2 to 90.8).
- **The worst individuals** at S5 are `random` learners with 10 to 20 tail traits: `x424242-96` (day 30: accuracy 87.4, guess 77.7, 43% removed; an English learner with seven high-tail and five low-tail traits; largest errors `emotional_engagement` 33, `interference_susceptibility` 31) and `x424242-106` (87.5, guess 72.0; largest `integration_tendency` 45). Profiles are in `docs/extreme-learners/scorecard.json`.
- Existing switches that might help (`--fix=oh`, `prior,var`, `oh,prior,var`, `norm`, the age-band priors of SCORECARD-90 section 12) were re-measured on these held-out learners: every one moved the extreme learners' S5 by 0.1 point or less in either direction (`.exrun` runs, 90.4 to 90.6 mean; worst 10% 88.2 to 88.4). None is a fix for this.

## 3. Tailoring: the same level for two contrasting learners (AI-JUDGED on SIMULATED learners)

**Method.** `node scripts/extreme-learners.js tailor` (`scripts/lib/extreme-tailor.js`). 48 extreme learners from a second held-out seed (515151), each given a subject in turn (math, English, reading, Spanish, IQ, ACT: 8 each) and a level that the block writer really writes (`services/block-levels.js` `kindFor` is lesson or retention; a first pass picked non-lesson cells for 7 of the learners and those were redone on lesson levels). The level is written through the real pipeline (`blockLevels.write`, layout call, fill-out call, the learning-spec adapter's check and one revision) on a temporary database for (a) the learner, with a scorecard card holding every one of the 100 traits, interests and hobbies, dislikes, past difficulties and strengths in their own words in the survey, and the English-learner flag, and (b) a CONTRASTING learner: every trait mirrored (100 minus the value), another age, other interests, dislikes and difficulties. **Writer: Coral DeepSeek V4.1 Flash** (the app's own owner-credit writer for this; the harness switches the fact-check key gate and the blind re-solve off, as the sensitivity proofs do, so content accuracy below is the raw writer's). **Judge: GLM-5.3 on Lyceum**, blind: it sees both learners as P and Q (order random) and both texts as 1 and 2 (order random), never which is which. One in six pairs is a **planted swap** (the two texts are exchanged): the judge must then disagree with the true assignment. It says which text suits P and which suits Q, scores each text's fit for each learner 1 to 5, says whose interests each text draws on and whether that is natural (0 to 3), checks accuracy (0 to 10, listing false statements) and says whether both texts teach the same objective.

**Result.** (planted-swap catch is the credibility check: the judge was fooled by none.)

```
built and judged 56 of 56 pairs (8 planted swaps).
planted swaps: judge agreed with the planted (wrong) assignment on both learners in 0/8 (fooled), contradicted it on both in 8/8 (caught), mixed 0.
real pairs: both learners matched to their own version 43/48; the target matched 44/48; mean fit (1-5) of the version written for the target 4.3 vs the contrasting one 2.2.
interest use (38 learners with interests): own interests used naturally (>=2) 29; forced (1) 1; not used 8.
interest use where the scorecard says interests help (interest_transfer > 30, 28 learners): natural 26, forced 1, not used 1; where it says they do not (<= 30, 10 learners): used naturally 3, not used 7.
content: accuracy mean 8.0, min 5.0; objective drifted in 0/48.
```

- **Fit.** For 43 of the 48 learners the judge matched both learners to the text written for them; the learner's own text scored a mean 4.3 of 5 for them against 2.2 for the contrasting learner's text (mean margin 2.06). Misfits (the judge matched the contrasting learner's text to them, or got one of the two learners wrong): `x515151-0` (tail_hi, math), `x515151-13` (random, English), `x515151-15` (contradict "creative but needs rigid structure", Spanish, English learner), `x515151-22` (contradict "brilliant, hates effort", age 66, IQ), `x515151-35` (contradict "anxious and competitive", age 13, ACT). Four of the five are contradictory-mix or tail-heavy learners: contradictory mixes fit 7 of 10, every other kind 36 of 38.
- **Interests are real, not forced, and follow the scorecard.** The learner's own Interest transfer measure decides whether the writer is told to use interests. Where it says interests help (above 30; 28 learners with interests) the text used them naturally 26 times, forced them once (`x515151-42`, a puppet-cloth example that muddled the sum) and skipped them once (`x515151-39`, a 48-year-old English learner who wanted brevity). Where it says they do not help (30 or below; 10 learners), 7 texts correctly left them out. So the "interest not used" count (8 of 38) is 7 correct omissions and 1 miss, plus the 1 forced use. Dislikes: the judge flagged a text as using something its learner dislikes in 2 of the 32 learners who gave dislikes (`x515151-2` and `x515151-34`).
- **Content stays the same objective but is not always correct.** No pair drifted off the objective (0 of 48). The raw writer's accuracy: mean 8.0 of 10, 8 of 48 texts at 6 or below, 15 at 7 or below, worst 5. Typical errors the judge listed: a wrong gender in a Spanish check (`Ella va a la mercado`), arithmetic that does not add up in a math worked example (10 animals in three equal pens), a wrong direction in an IQ rotation rule, a paradox example that is only improbable. IQ is weakest (mean 7.0). These are writer errors with the app's verification gate switched off in this harness: **the production gate (fact cascade, key gate, blind re-solve) is what stands between them and a learner, and is not measured here.** It is an open item to measure with the gate on.
- **By subject (learners matched to their own text of 8):** math 7, English 7, reading 8, Spanish 7, IQ 7, ACT 7. By kind: tail_hi 4 of 5, tail_lo 5 of 5, tail_both 5 of 5, random 9 of 10, contradict 7 of 10, age_young 5 of 5, age_old 4 of 4, English learner 4 of 4.
- **Reliability of the harness.** 10 of the first 48 pairs failed to build or to judge (7 were non-lesson cells, 3 were GLM-5.3 returning no text because its thinking used the token budget); all were redone and every one of the 56 pairs (48 real plus 8 planted) is judged. One judge and one writer, one pair per learner: this is a screen for failures, not a measurement of how much better the tailored text teaches.

Per individual (the full table; `fit` is 2 when the judge matched both learners to their own text):

| learner | kind | subject, level | planted | fit (0-2) | fit score own vs other | own interests, natural 0-3 | accuracy | same objective |
|---|---|---|---|---|---|---|---|---|
| x515151-0 | tail_hi, 27 | math, multiplication_and_division L10 |  | 0 | 2 vs 4 | yes, 3 | 10 | yes |
| x515151-1 | tail_lo, 26 | english, advanced_intermediate L30 |  | 2 | 5 vs 2 | yes, 3 | 7 | yes |
| x515151-2 | contradict (brilliant, hates effort), 58 | reading, proficient_reader L30 |  | 2 | 4 vs 2 | yes, 2 | 9 | yes |
| x515151-3 | random, 21 | spanish, spanish_grade_04_time_food_shopping_and_core_verbs L8 |  | 2 | 5 vs 2 | yes, 2 | 5 | yes |
| x515151-4 | tail_both, 20 | iq, abstract_reasoning L20 |  | 2 | 5 vs 2 | none given | 8 | yes |
| x515151-5 | contradict (needs praise but shuts down when corrected), 35 | act, act_grade_10 L30 | yes (swapped) | 0 | 2 vs 5 | no, 0 | 8 | yes |
| x515151-5 | contradict (needs praise but shuts down when corrected), 35 | act, act_grade_10 L30 |  | 2 | 5 vs 2 | yes, 3 | 7 | yes |
| x515151-6 | random, 9, ELL | math, multiplication_and_division L10 |  | 2 | 5 vs 2 | yes, 3 | 9 | yes |
| x515151-7 | age_young, 10 | english, proficient L40 |  | 2 | 4 vs 2 | yes, 3 | 8 | yes |
| x515151-8 | age_old, 62 | reading, proficient_reader L30 |  | 2 | 5 vs 2 | none given | 8 | yes |
| x515151-9 | ell, 36, ELL | spanish, spanish_grade_05_home_places_and_directions L7 |  | 2 | 5 vs 2 | none given | 8 | yes |
| x515151-10 | tail_hi, 35 | iq, abstract_reasoning L20 |  | 2 | 5 vs 3 | yes, 3 | 8 | yes |
| x515151-11 | tail_lo, 35 | act, act_grade_4 L10 | yes (swapped) | 0 | 2 vs 4 | no, 2 | 8 | yes |
| x515151-11 | tail_lo, 35 | act, act_grade_4 L10 |  | 2 | 5 vs 2 | yes, 2 | 8 | yes |
| x515151-12 | contradict (anxious and competitive), 66, ELL | math, multiplication_and_division L10 |  | 2 | 5 vs 1 | yes, 3 | 5 | yes |
| x515151-13 | random, 41 | english, basics L10 |  | 0 | 2 vs 4 | no, 0 | 9 | yes |
| x515151-14 | tail_both, 57 | reading, intermediate_reader L20 |  | 2 | 4 vs 2 | none given | 7 | yes |
| x515151-15 | contradict (creative but needs rigid structure), 18, ELL | spanish, spanish_grade_04_time_food_shopping_and_core_verbs L8 |  | 0 | 2 vs 3 | none given | 8 | yes |
| x515151-16 | random, 46 | iq, abstract_reasoning L20 |  | 2 | 5 vs 2 | yes, 2 | 5 | yes |
| x515151-17 | age_young, 9 | act, act_grade_4 L10 | yes (swapped) | 0 | 2 vs 3 | no, 3 | 7 | yes |
| x515151-17 | age_young, 9 | act, act_grade_12 L20 |  | 2 | 4 vs 2 | yes, 3 | 9 | yes |
| x515151-18 | age_old, 66, ELL | math, algebra_1_part_a L30 |  | 2 | 5 vs 2 | yes, 2 | 7 | yes |
| x515151-19 | ell, 50, ELL | english, advanced_intermediate L30 |  | 2 | 5 vs 2 | yes, 3 | 9 | yes |
| x515151-20 | tail_hi, 52 | reading, proficient_reader L30 |  | 2 | 4 vs 2 | yes, 3 | 7 | yes |
| x515151-21 | tail_lo, 39 | spanish, spanish_grade_04_time_food_shopping_and_core_verbs L8 |  | 2 | 5 vs 2 | yes, 2 | 8 | yes |
| x515151-22 | contradict (brilliant, hates effort), 66 | iq, abstract_reasoning L20 |  | 0 | 2 vs 4 | no, 0 | 6 | yes |
| x515151-23 | random, 55 | act, act_grade_7 L20 | yes (swapped) | 0 | 3 vs 4 | no, 3 | 10 | yes |
| x515151-23 | random, 55 | act, act_grade_7 L20 |  | 2 | 5 vs 2 | no, 0 | 10 | yes |
| x515151-24 | tail_both, 44 | math, multiplication_and_division L10 |  | 2 | 4 vs 3 | none given | 10 | yes |
| x515151-25 | contradict (works very hard, learns slowly), 64 | english, advanced_intermediate L30 |  | 2 | 5 vs 2 | none given | 6 | yes |
| x515151-26 | random, 54 | reading, proficient_reader L30 |  | 2 | 3 vs 2 | none given | 9 | yes |
| x515151-27 | age_young, 9 | spanish, spanish_grade_05_home_places_and_directions L7 |  | 2 | 4 vs 2 | yes, 3 | 10 | yes |
| x515151-28 | age_old, 67 | iq, abstract_reasoning L20 |  | 2 | 4 vs 2 | none given | 5 | yes |
| x515151-29 | ell, 69, ELL | act, act_grade_10 L30 | yes (swapped) | 0 | 1 vs 4 | no, 3 | 6 | yes |
| x515151-29 | ell, 69, ELL | act, act_grade_10 L30 |  | 2 | 5 vs 2 | yes, 3 | 8 | yes |
| x515151-30 | tail_hi, 14, ELL | math, multiplication_and_division L10 |  | 2 | 5 vs 1 | yes, 3 | 10 | yes |
| x515151-31 | tail_lo, 61 | english, proficient L40 |  | 2 | 5 vs 2 | yes, 3 | 8 | yes |
| x515151-32 | contradict (bursty, long gaps, deep when in), 70 | reading, intermediate_reader L20 |  | 2 | 5 vs 2 | yes, 3 | 9 | yes |
| x515151-33 | random, 26, ELL | spanish, spanish_grade_04_time_food_shopping_and_core_verbs L8 |  | 2 | 4 vs 3 | no, 0 | 10 | yes |
| x515151-34 | tail_both, 59 | iq, abstract_reasoning L20 |  | 2 | 4 vs 3 | yes, 2 | 6 | yes |
| x515151-35 | contradict (anxious and competitive), 13 | act, act_grade_4 L10 | yes (swapped) | 0 | 2 vs 4 | no, 2 | 8 | yes |
| x515151-35 | contradict (anxious and competitive), 13 | act, act_grade_4 L10 |  | 1 | 4 vs 2 | yes, 3 | 8 | yes |
| x515151-36 | random, 33 | math, multiplication_and_division L10 |  | 2 | 4 vs 3 | no, 0 | 10 | yes |
| x515151-37 | age_young, 8 | english, basics L10 |  | 2 | 4 vs 2 | yes, 2 | 9 | yes |
| x515151-38 | age_old, 67 | reading, proficient_reader L30 |  | 2 | 3 vs 2 | none given | 8 | yes |
| x515151-39 | ell, 48, ELL | spanish, spanish_grade_04_time_food_shopping_and_core_verbs L8 |  | 2 | 3 vs 2 | no, 0 | 6 | yes |
| x515151-40 | tail_hi, 31, ELL | iq, abstract_reasoning L20 |  | 2 | 5 vs 2 | yes, 2 | 10 | yes |
| x515151-41 | tail_lo, 66 | act, act_grade_4 L10 | yes (swapped) | 0 | 2 vs 3 | no, 2 | 9 | yes |
| x515151-41 | tail_lo, 66 | act, act_grade_12 L20 |  | 2 | 4 vs 2 | yes, 2 | 9 | yes |
| x515151-42 | contradict (needs praise but shuts down when corrected), 23 | math, algebra_1_part_a L30 |  | 2 | 4 vs 2 | yes, 1 | 7 | yes |
| x515151-43 | random, 40 | english, advanced_intermediate L30 |  | 2 | 5 vs 2 | yes, 3 | 8 | yes |
| x515151-44 | tail_both, 20 | reading, proficient_reader L30 |  | 2 | 5 vs 2 | no, 0 | 7 | yes |
| x515151-45 | contradict (solitary, no feedback wanted), 52 | spanish, spanish_grade_05_home_places_and_directions L7 |  | 2 | 5 vs 3 | yes, 3 | 9 | yes |
| x515151-46 | random, 30 | iq, advanced_analytical_thinking L20 |  | 2 | 4 vs 2 | no, 0 | 8 | yes |
| x515151-47 | age_young, 9 | act, act_grade_7 L20 | yes (swapped) | 0 | 2 vs 4 | no, 0 | 9 | yes |
| x515151-47 | age_young, 9 | act, act_grade_7 L20 |  | 2 | 5 vs 2 | yes, 3 | 9 | yes |

## 4. Learning outcome, tailored schedule against the base ladder (SIMULATED)

**What this models.** The recovery simulation's audited learning model (`--learning=v2`: Rasch answers, a half-life forgetting curve, practice that raises ability, 100 levels, the learner's own true decay, pace and prior knowledge) with the old fixed review ladder (`--levers=none --review-pick=fixed`, "base") against the shipped per-learner schedule (`--levers=stop`, "tailored": model-based half-lives from the learner's own decay and extra spaced retrieval of what is due), on the same 120 extreme learners (seed 424243, held out). **It does not model tailored lesson text:** the simulation has no outcome model for text tailoring (`scripts/scorecard-recovery-sim.js` says so), so section 3's text tailoring is judged, not simulated here. Placement time on known material was not re-run (open). Command and per-learner rows: `docs/extreme-learners/outcome.json`.

### Simulated learning outcome, tailored schedule vs base ladder (120 extreme learners; SIMULATED)

Skills recalled at 30 days per practice hour, tailored / base: mean 11.5x, median 6.1x, worst 10% 1.8x, worst 5% 1.6x, worst 1% 1.3x, worst 1.2x, best 142.8x. Learners at or below 1.0x: 0; below 2x: 8; below 3x: 20.
Skills understood (k >= 0.85) per practice hour, tailored / base: mean 1.1x, median 0.9x, worst 10% 0.8x, worst 1% 0.7x, worst 0.7x.
Learners whose skills understood per practice hour is below the base's: 76 of 120. Gain in 30-day recall, percentage points (tailored minus base): mean 12.5, median 12.0, worst 10% 2.7, worst 1% 1.2, worst 1.2; learners with no gain: 0.
Mean recall at 30 days: base 2.7% -> tailored 15.1%; at 7 days 9.6% -> 30.9%; practice hours 11.3 -> 13.6; skills understood 37.7 -> 43.2.

By kind (mean ratio, worst):
- tail_hi (n 12): 6.2x, worst 1.3x
- tail_lo (n 12): 6.7x, worst 1.7x
- contradict (n 24): 11.2x, worst 1.2x
- random (n 24): 16.6x, worst 1.8x
- tail_both (n 12): 7.9x, worst 2.0x
- age_young (n 12): 12.0x, worst 2.0x
- age_old (n 12): 18.9x, worst 2.2x
- ell (n 12): 7.1x, worst 3.5x

By age band: 30-59 (n 40) 10.1x worst 1.7x; 13-17 (n 14) 8.8x worst 1.3x; 18-29 (n 22) 10.4x worst 1.2x; 8-12 (n 21) 13.4x worst 2.0x; 60+ (n 23) 14.7x worst 2.2x

True traits that go with the ratio (correlation): decay_rate 0.39, productive_struggle 0.22, analogical_transfer -0.21, autonomy_preference -0.20, persistence -0.20, pattern_detection -0.19, strategy_awareness 0.19, fatigue_curve 0.18

Worst five:
- x424243-42: 1.2x (30-day recall 4.0% -> 5.2%; hours 10.2 -> 11.2). x424243-42 contradict [anxious and competitive] age 21; high tail: inductive_trajectory, perfectionism, autonomy_preference, extrinsic_reward_sensitivity, competitive_drive, evaluation_anxiety; low tail: fatigue_curve, failure_response, frustration_threshold, confidence_calibration, self_efficacy; hobbies: knitting amigurumi, ice hockey, model railways; dislikes: formal academic tone; past difficulties: -
- x424243-20: 1.3x (30-day recall 12.2% -> 17.8%; hours 9.4 -> 10.3). x424243-20 tail_hi age 14; high tail: deductive_trajectory, inductive_trajectory, analogical_transfer, momentum_dependence, reentry_cost, interest_transfer, retention_index, confidence_calibration (+5); low tail: text_density_tolerance, causal_chain_depth, step_explicitness, brevity_preference; hobbies: -; dislikes: leaderboards; past difficulties: missed a year of school
- x424243-112: 1.5x (30-day recall 1.1% -> 2.4%; hours 8.2 -> 12.1). x424243-112 contradict [confident and often wrong] age 21; high tail: analogical_transfer, rush_tendency, humor_receptivity, guessing_propensity, self_efficacy, emotional_engagement, misconception_persistence; low tail: systems_thinking, deliberation_depth, confidence_calibration, error_driven_learning, self_monitoring, praise_sensitivity; hobbies: fermenting hot sauce, spoken word poetry, rally car watching; dislikes: being told the answer right away, gamified points, repetition drills; past difficulties: -
- x424243-91: 1.7x (30-day recall 11.9% -> 23.2%; hours 14.6 -> 16.6). x424243-91 tail_lo age 51; high tail: -; low tail: analogical_transfer, systems_thinking, cycle_architecture, fatigue_curve, momentum_dependence, novelty_hunger, gamification_response, recognition_recall_gap (+5); hobbies: -; dislikes: abstract symbols without a picture; past difficulties: long gap since last studied
- x424243-46: 1.8x (30-day recall 10.9% -> 21.3%; hours 10.0 -> 10.9). x424243-46 random age 54; high tail: analogical_transfer, momentum_dependence, depth_breadth; low tail: chunk_granularity, vocabulary_ceiling, spatial_anchoring, deliberation_depth, consolidation_need, hint_dependency, instruction_adherence, planning_tendency (+5); hobbies: fermenting hot sauce; dislikes: word problems about money; past difficulties: dyslexia-like slow reading

**Reading it.**

- **Retention improves for every one of the 120 learners; the largest ratios are on a very small base.** The base ladder keeps 2.7% of what was practised at 30 days (the audited model), so ratios of 6x to 143x are mostly the denominator. Read the absolute gain: mean +12.5 points of 30-day recall (2.7% to 15.1%), worst 10% +2.7 points, **worst learner +1.2 points**; no learner has none. Skills recalled per practice hour are at least 1.18x the base for everyone, below 2x for 8 learners and below 3x for 20.
- **Understanding per hour is NOT faster: 76 of 120 learners understand fewer skills per practice hour with the tailored schedule** (median 0.9x). The schedule spends about 20% more practice hours (11.3 to 13.6) on review and understands about 15% more skills (37.7 to 43.2). The owner's "about three times faster" is **not reached for understanding** in this model, for any kind of learner, and for retention it is a ratio against a base that retains almost nothing. That matches `docs/SPEED-RETENTION.md` ("3x is not honestly reachable on the evidence here").
- **Who gains least:** the learners with a slow forgetting curve already (the true `decay_rate` correlates 0.39 with the ratio: fast forgetters gain most) and persistent, autonomy-preferring ones. The worst are `x424243-42` (anxious and competitive, 1.2x, 4.0% to 5.2%) and `x424243-20` (tail_hi, 1.3x). By kind the worst ratios are 1.2x (contradict; age band 18-29) and 1.3x (tail_hi; age band 13-17); English learners never fall below 3.5x.

## 5. What is fixed, and what is open

**Fixed: nothing in the product.** This branch adds the generator, the report scripts, a fast deterministic test, and two opt-in switches to simulation scripts (default off; the default sim, its gate and `scripts/scorecard-strata-test.js` are unchanged). The failures found have no fix I could both prove on held-out learners and show to leave everyone else no worse:

1. **Tail measures shrink toward the mean** (S5 MAE 16.7 against 8.5). The existing priors and per-age options do not help (section 2). A heavier-tailed prior would help tails and cost typical learners; it needs real data to set.
2. **The app as it is (S0) barely beats guessing for the worst 10% of learners** (3% of error removed at day 30). The designed measurement plan does, and it is not yet in the app at 6.3 minutes a day.
3. **Contradictory-mix learners are the worst fit for tailored text** (7 of 10). The judge's per-pair reasons were not stored; the next step is to store them and read the five misfits.
4. **Raw-writer content errors** (8 of 48 texts at accuracy 6 or below) with the production verification gate off in the harness: measure with it on.
5. **Understanding per hour does not improve** under the shipped review schedule (76 of 120 learners worse per hour), only retention does.
6. **Not run:** placement time on known material, a second judge family for the tailoring screen (Kimi K3 was not used), Spanish with the sealed Spanish path, and anything involving real learners.

## 6. Reproduce

```
# scorecard: calibration on ordinary learners (two seeds), scored on held-out extreme ones (sharded with --only=, 10 learners a shard)
node scripts/scorecard-recovery-sim.js --modes=off --no-write --population=30 --strata=1 --minutes-per-day=60 --days=30 --truth-factors=1 --learners=50 --seed=20261022 --only=0,1,..,9 --dump=A.json   (and seed 7 for B)
node scripts/scorecard-recovery-sim.js --modes=off --no-write --population=30 --strata=1 --minutes-per-day=60 --days=30 --truth-factors=1 --learners=160 --extreme=1 --extreme-share=0.75 --seed=424242 --only=... --dump=C.json
node scripts/scorecard-90-measure.js --a=A*.json --b=B*.json --c=C*.json --strata=1 --days=30 --per-learner=pl30.json      (--days=180 with --days=180 dumps)
node scripts/extreme-learners.js scorecard --pl30 pl30.json --pl180 pl180.json --out scorecard.json --md scorecard.md
# tailoring (RUN_CAP_USD=10)
node scripts/extreme-learners.js tailor --live --writer coral --writer-model deepseek-v4.1-flash --judges lyc_glm --cache FILE --seed 515151 --n 48 --plant-every 6 --json docs/extreme-learners/tailor.json
node scripts/extreme-learners.js tailor-summary --json tailor.json,tailor-retry.json,... --table table.md
# outcome
node scripts/scorecard-recovery-sim.js --modes=off --learning=v2 --levels=100 --population=30 --truth-factors=1 --extreme=1 --extreme-share=1 --learners=120 --seed=424243 --only=... --write --out=DIR --name=b0 --levers=none --review-pick=fixed   (and --levers=stop for t0)
node scripts/extreme-learners.js outcome --base 'DIR/b*.json' --tailored 'DIR/t*.json' --out outcome.json
```

Spend: Lyceum GLM-5.3 judge $6.88 (79 calls, ledger task `extreme-tailor-judge`); Coral DeepSeek writer under $1; Gonka under $0.10 (one failed retry); no Anthropic, Standard Compute, Munito, xKiro or Modelflare. Under the $10 run cap.

## 7. Understanding per practice hour: where the extra hours go, and a second attempt (SIMULATED; gate MISSED)

**Setup.** Same learning model as section 4 (`--learning=v2`). Design seed 777001 (24 extreme learners), final numbers on held-out seed 909091 never used while designing: 120 extreme learners and 40 ordinary ones. Base = `--levers=none --review-pick=fixed`; shipped = `--levers=stop`; new = shipped plus `SR_STOP_SKIP=on` with the skip rule tightened (`SR_STOP_CAP` 1, `SR_STOP_MASTERY` 0.6; set by environment only, `services/efficiency.js` defaults unchanged: skip stays opt-in, 2 and 0.7). Tools: `scripts/understand-speed-run.sh`, `scripts/understand-speed-compare.js`. The sim now logs practice hours by role and by whether the skill was already understood (k >= 0.85) when asked (`dg_*` fields).

**Where the hours go (held-out, 120 extreme learners, mean hours per learner).** Base 11.7 h, shipped 14.0 h. Review of skills already understood: base 1.2 h, shipped 3.4 h (+2.1 h of the +2.3 h). Reviews of skills not yet understood: 0.5 -> 0.8 h. Focus/stretch items on skills already understood: 1.0 h (base), 0.9-1.3 h shipped. Lesson pages are about half of all hours in both arms. So the extra hours buy retention (30-day recall +12.3 points), not understanding; understanding rises only by +5.8 skills through the extra reviews of not-yet-understood skills.

**Result (new vs base, held-out).**

| | understood/hour, mean / median / worst 10% / worst 1% | below base | 30-day recall gain (pts) | hours | skills understood |
|---|---|---|---|---|---|
| shipped, 120 extreme | 1.07 / 0.93 / 0.78 / 0.75 | 77 | 12.3 | 11.7 -> 14.0 | 38.2 -> 44.0 |
| new, 120 extreme | 1.08 / 0.98 / 0.80 / 0.77 | 71 | 12.0 (97% of shipped) | 11.7 -> 13.4 | 38.2 -> 43.0 |
| shipped, 40 ordinary | 1.02 / 0.94 / 0.79 / 0.79 | 28 | 14.4 | 11.8 -> 14.2 | 40.5 -> 45.9 |
| new, 40 ordinary | 1.04 / 0.97 / 0.79 / 0.75 | 26 | 12.4 (86% of shipped) | 11.8 -> 13.8 | 40.5 -> 45.4 |

7-day recall (extreme): base 10.1%, shipped 32.2%, new 31.2%. Every kind and age band has a learner below base (worst kind minimum 0.77 to 0.90 of base per hour).

**Gate: NOT met.** Required: every kind and the worst 10% at or above base per hour, and 30-day gain at least 90% of shipped's, and tests green. Worst 10% is 0.80, not 1.0; no kind is at or above base for its worst learner; the ordinary-learner gain is 86% of shipped's. Distance from 3x: understanding per hour is 1.08x on average (median 0.98x), so 3x is not close by this measure. Not merge-ready.

**Tried on the design seed and not kept** (24 learners, understood/hour mean, worst 10%, 30-day gain): fewer extra reviews (3 instead of 6): 1.04, 0.87, +8.6; relearn+personal timing: 1.03, 0.78, +11.7; extra slots only for skills below 0.7 predicted recall or not secure: 1.03, 0.82, +12.5; a lower due target for secure skills (0.65, 0.55): no change in hours; skip + 4 extras: 1.05, 0.88, +9.8 (gain too low); skip at mastery 0.4: no better. Candidates not testable here: reviews of prerequisite skills (the sim's skills form a line, no dependency graph), retrieval that also advances new material (the sim's reviews already raise k), a per-learner budget scaled by forgetting rate (coded in a scratch version, not run).

**What limits it.** In this model recall is k times memory, and only a review answer raises memory; k is raised only by practice on the skill. Retention therefore needs about 2 hours of reviews of skills the learner already understands, and the "understood per hour" measure counts none of that. Cutting those hours loses the retention gain roughly one for one; keeping them leaves most learners below base on this measure. The measure and the goal pull against each other unless the cost per review answer falls (item time, not scheduling) or lesson pages (half the hours) get shorter or are skipped on a passed pretest (needs a screen, not wired).

**Assumptions the result leans on.** Rasch answers; half-life forgetting with the learner's own decay; k rises by about 0.2 per right answer scaled by learn rate (assumed); k >= 0.85 counts as understood; review items take the same time as practice items; a skipped item costs nothing; the review "secure" status in the app comes from a mastery record that rarely reaches 0.8 in the sim. **The skip half is not live in the app:** `sessions.recordAnswer` returns `skippable` ids but the session player does not act on them, so the new arm's gain over shipped exists only in the simulation. Simulated, not proof on real learners.
