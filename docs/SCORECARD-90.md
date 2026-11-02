# Scorecard 90: how close can every measure get in a month at an hour a day? (Phase 1)

**Everything below is SIMULATED.** The sim's learners, truth models and source validities are assumptions (see `docs/SCORECARD-MEASURED.md`, "Limits", and section 7 here). Nothing here is a real-learner result. Source: `scripts/scorecard-recovery-sim.js --minutes-per-day=60 --days=30`, summarised by `scripts/scorecard-90-report.js`.

## 1. What was run

- **Study pace** (new, off by default so the stored gate baseline is unchanged): one study day per calendar day for 30 days, each day filled with levels until 60 minutes of the sim's own level time are spent (the item and reading times it already generates plus 30 s between levels). A sitting keeps its default length (the learner's attention_runway sets the levels in it); the next sitting opens about 1.5 hours later the same day. Start times jitter with the learner's session rhythm. The sim's level takes **6.98 min** on average, so a learner does **286 and 292 levels** in the month (the default sim: about 45 in 30 days), at 64.8 min a day.
- 200 learners, 2 seeds (20261022 and 7), model-read off, the app as it is (indicators on, one experiment dimension per page, no optional channels): "defaults". Two more runs with every optional channel on (`--channels=all`) give the "every extra" column. The snapshot is taken on day 30.
- "Ideal observer" is the gate's: the better of a cross-validated ridge read-out of the learner's whole answer log (16 features, plus the indicator means for that measure), a recalibration of the app's own number, and the population mean. It is a floor found, not proved optimal: a better read-out, or one that knew the sim's truth model, could do better.
- Error is the **mean absolute error (MAE) in points** on the 0 to 100 scale. Guessing the population mean costs 13.6. For normal errors, an MAE of 10 means only about 58% of learners are within 10 points; 90% within 10 needs an MAE of about 4.9. See section 4.

## 2. Headline

| | MAE, all 100 measures | learners within 10 | learners within 5 |
|---|---|---|---|
| **app, defaults, 60 min a day, day 30** | **12.3** | 50% | 27% |
| app, every optional channel on | 11.9 | 51% | 27% |
| ideal observer, same data (defaults) | 10.9 | 55% | |
| guess the population mean | 13.6 | | |

About six times more practice than the sim's default pace (286 and 292 levels instead of about 45) moves the error from about 12.5 to 12.3: **more of the same data barely helps, and the best read-out of that data is 10.9, still above 10.** The target needs new information, not more time.

## 3. The four groups (day 30, defaults, mean of two seeds)

Rule: **(a)** the app's MAE is already at most 10. **(b)** the app is above 10 but the ideal observer is at most 10 on the same data: an app fix. **(c)** even the ideal observer is above 10: no source in the sim carries enough signal, a designed measurement is needed. **(d)** the quantity itself needs more than 30 days whatever the source (assigned by what the measure is, not by the data).

| group | measures | mean app MAE | mean ideal | what it means |
|---|---|---|---|---|
| (a) already within 10 | 16 | 7.8 | 6.2 | nothing to do; none reaches 90% of learners within 10 |
| (b) data allows it, app does not get there | 19 | 12.4 | 7.9 | an app fix (section 5) |
| (c) no source carries enough signal | 62 | 13.3 | 13.0 | a designed measurement (section 6) |
| (d) needs more than 30 days | 3 | 14.0 | 11.8 | time, or a retest schedule that only partly helps |

**Worst 10 by app MAE:** scaffolding_fade 19.2 (ideal 5.4, group b); session_rhythm 17.8 (ideal 13.6, group c); attention_runway 15.5 (ideal 5.9, group b); narrative_pull 14.5 (ideal 14.5, group c); example_density_need 14.3 (ideal 14.3, group c); productive_struggle 14.2 (ideal 13.7, group c); feedback_tone_sensitivity 14.2 (ideal 14.2, group c); repetition_tolerance 14.1 (ideal 8.6, group b); step_explicitness 14.1 (ideal 11.3, group c); reentry_cost 14.0 (ideal 14.1, group c).

- **(a), 16:** processing_velocity, vocabulary_ceiling, rush_tendency, deliberation_depth, challenge_appetite, failure_response, error_recovery_speed, frustration_threshold, hint_dependency, guessing_propensity, perfectionism, confidence_calibration, self_monitoring, brevity_preference, persistence, prior_knowledge. Share within 10 ranges 57% to 86%; within 5 32% to 55%.
- **(b), 19:** systems_thinking, pattern_detection, contradiction_sensitivity, attention_runway, fatigue_curve, recognition_recall_gap, consolidation_need, help_seeking, error_driven_learning, instruction_adherence, reflection_depth, self_efficacy, scaffolding_fade, notation_comfort, repetition_tolerance, open_response_performance, near_transfer, misconception_persistence, mastery_velocity.
- **(d), 3:** retrieval_strength, decay_rate, retention_index. These three are one model in the app (the memory trio): a half-life of weeks to months cannot be read from 30 days of use, and even the best read-out is 11.8.
- **(c), 62:** in the sim, 22 have no behavioural or text expression at all (only the questionnaire at r 0.4 and an idealised model read can see them), 21 are carried only by experiment arms, 6 only by the one-off questionnaire, and 13 by behaviour that is too weak (intake_baseline, text_density_tolerance, deductive_trajectory, causal_chain_depth, logical_rigor, warmup_latency, momentum_dependence, interleaving_tolerance, session_rhythm, reentry_cost, step_explicitness, far_transfer, depth_breadth). **Caveat:** "no expression in the sim" is an assumption of the sim, not proof that real behaviour carries nothing; the beta may show some of these in real chat, timing and choices.

## 4. The reliability a source needs

Error SD = population SD x sqrt(1 - reliability), with population SD 17. "Reliability" here is the share of the true value's variance the combined source carries (a validity squared, not just retest consistency: a very consistent scale that measures the wrong thing scores low). For normal errors MAE = 0.80 x SD. Independent sources add their precision (reliability / (1 - reliability)).

| target | error SD | reliability needed |
|---|---|---|
| **MAE 10** (the brief's "within 10") | 12.5 | **0.46** |
| **MAE 5** (the brief's "within 5") | 6.3 | **0.86** |
| 90% of learners within 10 | 6.1 | 0.87 |
| 90% of learners within 5 | 3.0 | 0.97 |

The current sources give group (c) a reliability of about 0.03 to 0.05 (an MAE of 13.3 corresponds to 0.03). **If the owner means "within 10 points" for nine learners in ten, the real bar is 0.87, the same as the MAE-5 row**; the MAE-10 row is the weaker reading and is what the plan below is sized for.

## 5. Group (b): app fixes (no new measurement)

The gate marks nearly all of them "biased or miscalibrated": a fixed linear recalibration of the app's own number would already cut the error, and at about 290 levels the bias is large (shown). This looks like calibration drift: the rules were tuned on 100 levels of use and these learners have three times as many. A few also show a log read-out that beats the recalibrated number (the rule discards log information).

| measure | app MAE | bias (truth - app) | recalibrated app | log read-out | gate reason |
|---|---|---|---|---|---|
| systems_thinking | 11.5 | 1.3 | 9.5 | 9.7 | biased or miscalibrated |
| pattern_detection | 11.3 | 0.0 | 9.4 | 9.8 | biased or miscalibrated |
| contradiction_sensitivity | 11.9 | -2.0 | 9.9 | 10.4 | passes the gate (ratio under 1.1) but MAE above 10 |
| attention_runway | 15.5 | -8.9 | 13.6 | 5.9 | biased or miscalibrated |
| fatigue_curve | 11.9 | -0.6 | 9.8 | 10.0 | biased or miscalibrated |
| recognition_recall_gap | 13.3 | -9.7 | 8.9 | 8.4 | biased or miscalibrated |
| consolidation_need | 10.5 | 1.2 | 9.8 | 9.5 | passes the gate (ratio under 1.1) but MAE above 10 |
| help_seeking | 11.5 | 7.3 | 8.3 | 8.4 | biased or miscalibrated |
| error_driven_learning | 11.3 | -0.4 | 7.2 | 7.2 | biased or miscalibrated |
| instruction_adherence | 10.4 | 2.1 | 10.0 | 10.1 | passes the gate (ratio under 1.1) but MAE above 10 |
| reflection_depth | 13.6 | -11.0 | 5.5 | 5.3 | biased or miscalibrated |
| self_efficacy | 10.1 | 5.1 | 9.0 | 3.9 | rule discards log information |
| scaffolding_fade | 19.2 | 18.8 | 5.9 | 5.4 | biased or miscalibrated |
| notation_comfort | 11.4 | 1.2 | 9.8 | 10.1 | biased or miscalibrated |
| repetition_tolerance | 14.1 | 8.7 | 11.8 | 8.6 | biased or miscalibrated |
| open_response_performance | 13.4 | 9.8 | 9.1 | 8.4 | biased or miscalibrated |
| near_transfer | 11.1 | -0.1 | 9.9 | 10.1 | biased or miscalibrated |
| misconception_persistence | 11.3 | 0.4 | 7.3 | 7.3 | biased or miscalibrated |
| mastery_velocity | 11.3 | -10.7 | 5.9 | 4.1 | biased or miscalibrated |

Check before building: scaffolding_fade's truth in the sim is the learner against a course that gets harder by 0.02 logits a level, a ramp set for 100 levels (6 logits at 290), so its large bias may partly be the sim's extrapolation. session_rhythm (group c) and attention_runway are partly hidden by the forced daily schedule, so they are not fair tests of the pace run.

## 6. Groups (c) and (d): designed measurements

Principles: (1) preference and tolerance traits are measured as **choices and paired within-lesson comparisons**, not asked about; (2) cognitive capacities by **short, domain-free task items**; (3) attitudes by **a few validated scale items**, never one long form; (4) everything is rotated through the month so no day costs more than 8 minutes. Expected reliabilities come from the literature and the Spearman-Brown formula. **None is simulated and none is measured on learners**; they are estimates to check on the beta.

| source | min a day | measures | expected reliability (range) | design and evidence |
|---|---|---|---|---|
| **COG** Daily 2-minute brain-teaser set (domain-free, rotating) | 2 | 9 | 0.7 (0.55 to 0.85) | About 5 calibrated items a day (about 150 over the month, 15 to 20 per measure after rotating): digit or Corsi span for working memory (span tasks, Conway et al. 2005: reliability 0.7 to 0.9), short matrix and number-series items for inductive and analogical reasoning (abbreviated Raven forms, Bilker et al. 2012: about 0.7 to 0.8), syllogisms for deductive, an if-then chain item for causal depth, a switch block for flexibility. **Switch costs are a difference score and unreliable (Hughes et al. 2014; Hedge, Powell & Sumner 2018); score mixed-block accuracy instead, expected 0.5 to 0.6.** Enkavi et al. 2019 found many behavioural task measures retest at only 0.3 to 0.5, so the top of the range is for span and series items only. |
| **SCALE** Validated scale items after a sitting (about 10 items a day, 12 s each) | 2 | 24 | 0.3 (0.2 to 0.4) alone | 8 to 10 items per measure over the month, from published short scales: MSLQ subscales (Pintrich et al. 1993) for strategy awareness, planning, task value, test anxiety; Achievement Goal Questionnaire (Elliot & McGregor 2001) for mastery orientation; Academic Motivation Scale (Vallerand et al. 1992) and the Learning Self-Regulation Questionnaire (Black & Deci 2000) for intrinsic motivation and autonomy; Epistemic Curiosity (Litman & Spielberger 2003) for curiosity; a short Boredom Proneness scale (Struk et al. 2017) and the Achievement Emotions Questionnaire (Pekrun et al. 2011) for boredom and emotional engagement; a hypercompetitive-attitude scale (Ryckman et al. 1990) for competitive drive; K-DOCS (Kaufman 2012) for creative extension. Internal consistency of 8 to 10 items is typically 0.8 to 0.88, but **self-report and behaviour correlate only 0.1 to 0.4 (Dang, King & Inzlicht 2020)**, so validity against true behaviour limits it; the 0.30 is that limit, not the alpha. |
| **TAPS** "Which would you do next?" and "which version helped?" taps (about 6 a day, 10 s each) | 1 | CROSS 23 and SCALE 24 (second source) | 0.45 (0.3 to 0.55) | Revealed preference by forced choice (Thurstone 1927; Bradley-Terry scoring): "which of these two would you do next" (game-like versus plain task, harder versus easier set, solo versus shared, short versus long explanation), and "which version helped?" after paired versions. About 180 taps in the month give a stable preference estimate (a choice rate over 30 trials has a standard error near 0.09). It measures **preference**; whether the preferred version teaches better is a separate and much weaker claim (Pashler et al. 2008). |
| **CROSS** paired crossover inside lessons | 0 | 23 | 0.45 (0.3 to 0.55) alone | Each lesson page and review set is shown in two versions that differ on one dimension (example density, text density, tone, humour, step size, feedback grain), both to the same learner on matched content, order counterbalanced (a micro-randomised trial, Klasnja et al. 2015), scored on accuracy, time and next-day recall. At the sim's own effect (0.4 logits per SD) about 60 paired items per arm per dimension give about 0.45 (hand calculation: signal 0.096 per SD of trait against noise 0.09). **If the real effect is smaller, as aptitude-treatment effects usually are, this falls toward 0 and the TAPS taps carry the estimate.** |
| **PROBE** Fixed calibrated probe items at sitting start and after a gap (normal items, reordered) | 0.5 | 6 | 0.45 (0.3 to 0.55) | Three fixed, calibrated items at the start of every sitting and the same three after a gap of a day or more, scored against the learner's later accuracy in the same sitting: warm-up, re-entry and momentum are differences between these; a pre-lesson three-item probe gives intake. About 90 probe items over the month. |
| **DELAYED** Spaced retests of earlier skills at 1, 3, 7, 14 and 28 days (real review items, but extra time) (group d) | 1 | 3 | 0.4 (0.25 to 0.5) | Retests at 1, 3, 7, 14 and 28 days (Cepeda et al. 2006; half-life regression, Settles & Meeder 2016): about 40 retests a learner. They give a short-horizon decay rate. A half-life longer than 28 days is not identified from data that stop at 28 days. |

**Total: 6.5 minutes a day on average** (195 minutes a month), inside the 5 to 8 minute budget, with room for a one-off 10-minute first-day setup. CROSS adds no minutes.

Expected result per family after combining sources (precisions add; correlated errors make these ceilings):

| family | measures | combined reliability | expected MAE | meets 10 (needs 0.46) | meets 5 (needs 0.86) |
|---|---|---|---|---|---|
| COG | 9 | 0.70 | 7.4 | yes | no |
| SCALE (scale + taps) | 24 | 0.55 | 9.0 | yes | no |
| CROSS (crossover + taps) | 23 | 0.62 | 8.4 | yes | no |
| PROBE | 6 | 0.45 | 10.1 | no | no |
| memory trio (retests) | 3 | 0.40 | 10.5 | no | no |

**What the plan can and cannot do.** On these estimates it brings every group (c) family to an MAE of about 8 to 9, and the memory trio to about 10.5 (just short). **"Within 5" is out of reach for all of them in a month**: it needs a reliability of 0.86, which for the cognitive tasks means about 2.7 times the daily trials (5.4 minutes a day for COG alone), and which a self-report or preference source cannot give at any length. The memory trio cannot reach 10 in a month if the half-life is weeks.

Which measures take which source:

- **COG:** working_memory_span, cognitive_flexibility, deductive_trajectory, inductive_trajectory, analogical_transfer, causal_chain_depth, logical_rigor, interference_susceptibility, far_transfer.
- **SCALE:** intrinsic_motivation, extrinsic_reward_sensitivity, competitive_drive, evaluation_anxiety, boredom_susceptibility, mastery_orientation, identity_alignment, autonomy_preference, strategy_awareness, planning_tendency, question_generation, productive_struggle, curiosity_hook, relevance_demand, emotional_engagement, conceptual_bias, application_orientation, integration_tendency, depth_breadth, creative_extension, gamification_response, novelty_hunger, structure_need, stimulus_envelope.
- **CROSS:** chunk_granularity, abstraction_tolerance, example_density_need, text_density_tolerance, jargon_absorption, spatial_anchoring, global_framing_need, humor_receptivity, narrative_pull, tone_formality, elaboration_benefit, mnemonic_receptivity, enactive_encoding, generation_effect, step_explicitness, worked_example_dependence, feedback_granularity, feedback_tone_sensitivity, dialogic_preference, praise_sensitivity, social_framing, interest_transfer, cycle_architecture.
- **PROBE:** intake_baseline, warmup_latency, momentum_dependence, interleaving_tolerance, session_rhythm, reentry_cost.
- **DELAYED (group d):** decay_rate, retention_index, retrieval_strength.

## 7. Honesty and limits

- All errors above are from a simulation whose truth models are assumptions. In particular, many group (c) measures have "no expression" because the sim gives them none, not because real behaviour carries none.
- The ideal observer is a ridge read-out of 16 log features; it can be beaten, so the (b)/(c) boundary may move.
- The pace run is idealised: a learner who really studies 60 minutes every day for a month is rarer than the sim's learners; quitting, resuming and leaving early are kept from the default sim.
- The plan's reliabilities are literature and arithmetic, not data. The most fragile are the SCALE validity (self-report against behaviour) and the CROSS effect size (the sim's 0.4 logits per SD is optimistic against the aptitude-treatment literature). Citations are given from memory of the literature and need checking before they go in any outward-facing text.
- Memory trio: with every optional channel on, its error went up (14.0 to 15.1 in these runs; the same kind of flip noted in `docs/SCORECARD-EVERYTHING.md` 5.4); not explained here.
- No learner data, model or paid API was used. Anthropic $0, Standard Compute $0.

## 8. Every measure, day 30 (simulated)

App MAE with defaults, share of learners within 10 and within 5, ideal observer's MAE, prior's MAE, app MAE with every optional channel, group, and the proposed source for (c) and (d).

| measure | sim truth | app MAE | within 10 | within 5 | ideal | prior | every-extra MAE | group | source |
|---|---|---|---|---|---|---|---|---|---|
| frustration_threshold | generative | 5.6 | 84% | 54% | 4.9 | 13.9 | 5.8 | a |  |
| challenge_appetite | generative | 5.6 | 86% | 55% | 4.8 | 13.8 | 5.0 | a |  |
| processing_velocity | generative | 6.0 | 84% | 48% | 2.2 | 13.9 | 5.8 | a |  |
| vocabulary_ceiling | generative | 6.5 | 78% | 45% | 5.8 | 12.8 | 5.1 | a |  |
| perfectionism | generative | 6.9 | 75% | 45% | 5.4 | 13.9 | 6.8 | a |  |
| brevity_preference | experiment | 7.3 | 74% | 42% | 6.2 | 13.4 | 7.3 | a |  |
| persistence | generative | 7.5 | 71% | 41% | 6.5 | 12.9 | 7.4 | a |  |
| rush_tendency | generative | 7.6 | 71% | 40% | 6.0 | 15.3 | 7.8 | a |  |
| prior_knowledge | generative | 7.9 | 69% | 37% | 5.8 | 14.1 | 7.9 | a |  |
| hint_dependency | generative | 8.6 | 66% | 40% | 7.4 | 13.4 | 8.4 | a |  |
| failure_response | generative | 8.9 | 64% | 36% | 8.2 | 14.2 | 9.3 | a |  |
| error_recovery_speed | alias | 8.9 | 64% | 36% | 8.2 | 14.2 | 9.3 | a |  |
| deliberation_depth | generative | 9.2 | 62% | 36% | 6.3 | 12.3 | 9.1 | a |  |
| confidence_calibration | generative | 9.6 | 64% | 35% | 6.2 | 13.0 | 9.1 | a |  |
| self_monitoring | alias | 9.6 | 64% | 33% | 6.2 | 13.0 | 9.0 | a |  |
| guessing_propensity | generative | 9.9 | 57% | 32% | 9.0 | 13.6 | 9.6 | a |  |
| self_efficacy | generative | 10.1 | 59% | 30% | 3.9 | 13.7 | 10.4 | b |  |
| instruction_adherence | generative | 10.4 | 56% | 33% | 10.0 | 13.7 | 10.3 | b |  |
| consolidation_need | generative | 10.5 | 55% | 28% | 9.5 | 14.1 | 10.8 | b |  |
| near_transfer | generative | 11.1 | 56% | 31% | 9.9 | 13.1 | 11.7 | b |  |
| error_driven_learning | alias | 11.3 | 52% | 28% | 7.2 | 14.6 | 11.1 | b |  |
| misconception_persistence | generative | 11.3 | 52% | 28% | 7.2 | 14.6 | 11.1 | b |  |
| mastery_velocity | generative | 11.3 | 50% | 22% | 4.1 | 12.1 | 11.8 | b |  |
| pattern_detection | generative | 11.3 | 53% | 29% | 9.4 | 13.5 | 12.6 | b |  |
| notation_comfort | generative | 11.4 | 51% | 28% | 9.8 | 12.8 | 11.3 | b |  |
| systems_thinking | generative | 11.5 | 51% | 30% | 9.5 | 14.2 | 12.2 | b |  |
| help_seeking | generative | 11.5 | 51% | 27% | 8.3 | 13.3 | 11.4 | b |  |
| far_transfer | generative | 11.8 | 50% | 27% | 10.3 | 13.2 | 12.6 | c | COG |
| contradiction_sensitivity | generative | 11.9 | 48% | 27% | 9.9 | 13.5 | 12.0 | b |  |
| elaboration_benefit | self-report | 11.9 | 48% | 29% | 12.0 | 12.7 | 11.9 | c | CROSS |
| fatigue_curve | generative | 11.9 | 49% | 25% | 9.8 | 12.6 | 10.8 | b |  |
| interleaving_tolerance | generative | 12.3 | 45% | 24% | 11.3 | 13.6 | 12.2 | c | PROBE |
| tone_formality | experiment | 12.3 | 47% | 24% | 12.3 | 13.0 | 12.1 | c | CROSS |
| evaluation_anxiety | none | 12.4 | 46% | 27% | 12.6 | 12.9 | 11.0 | c | SCALE |
| creative_extension | none | 12.5 | 51% | 27% | 12.5 | 13.0 | 12.3 | c | SCALE |
| question_generation | none | 12.6 | 50% | 29% | 12.6 | 13.6 | 12.8 | c | SCALE |
| strategy_awareness | none | 12.6 | 50% | 28% | 12.7 | 13.3 | 12.8 | c | SCALE |
| identity_alignment | none | 12.7 | 48% | 27% | 12.7 | 13.1 | 12.6 | c | SCALE |
| mastery_orientation | none | 12.7 | 48% | 24% | 12.8 | 13.0 | 12.7 | c | SCALE |
| abstraction_tolerance | experiment | 12.7 | 47% | 27% | 12.8 | 13.0 | 10.4 | c | CROSS |
| interest_transfer | experiment | 12.7 | 47% | 25% | 12.5 | 13.3 | 9.8 | c | CROSS |
| integration_tendency | none | 12.7 | 47% | 25% | 12.8 | 13.1 | 12.7 | c | SCALE |
| deductive_trajectory | alias | 12.7 | 48% | 24% | 12.7 | 13.4 | 12.7 | c | COG |
| curiosity_hook | experiment | 12.9 | 45% | 25% | 13.0 | 13.3 | 11.6 | c | SCALE |
| chunk_granularity | self-report | 12.9 | 44% | 24% | 13.1 | 14.0 | 12.9 | c | CROSS |
| application_orientation | none | 12.9 | 47% | 22% | 13.1 | 13.4 | 13.0 | c | SCALE |
| feedback_granularity | self-report | 13.0 | 45% | 26% | 13.0 | 14.8 | 13.0 | c | CROSS |
| conceptual_bias | none | 13.0 | 47% | 25% | 13.0 | 13.2 | 13.1 | c | SCALE |
| text_density_tolerance | generative | 13.0 | 45% | 23% | 12.8 | 13.7 | 13.3 | c | CROSS |
| social_framing | experiment | 13.0 | 47% | 25% | 13.1 | 13.5 | 13.0 | c | CROSS |
| generation_effect | self-report | 13.0 | 46% | 21% | 13.0 | 13.5 | 13.0 | c | CROSS |
| spatial_anchoring | self-report | 13.1 | 46% | 25% | 13.1 | 13.8 | 13.1 | c | CROSS |
| intake_baseline | generative | 13.1 | 48% | 25% | 11.9 | 12.6 | 13.0 | c | PROBE |
| humor_receptivity | experiment | 13.2 | 45% | 21% | 13.2 | 13.6 | 13.0 | c | CROSS |
| inductive_trajectory | experiment | 13.2 | 46% | 26% | 13.1 | 13.4 | 10.9 | c | COG |
| depth_breadth | generative | 13.3 | 49% | 24% | 13.3 | 14.0 | 13.3 | c | SCALE |
| praise_sensitivity | experiment | 13.3 | 46% | 25% | 13.2 | 13.2 | 12.8 | c | CROSS |
| jargon_absorption | experiment | 13.3 | 46% | 26% | 13.4 | 13.5 | 11.5 | c | CROSS |
| planning_tendency | none | 13.3 | 49% | 26% | 13.4 | 13.9 | 11.8 | c | SCALE |
| interference_susceptibility | none | 13.3 | 45% | 21% | 13.4 | 13.4 | 13.3 | c | COG |
| dialogic_preference | experiment | 13.3 | 42% | 22% | 13.4 | 13.7 | 11.8 | c | CROSS |
| boredom_susceptibility | none | 13.3 | 45% | 22% | 13.3 | 13.5 | 13.3 | c | SCALE |
| recognition_recall_gap | alias | 13.3 | 46% | 25% | 8.4 | 13.3 | 13.2 | b |  |
| emotional_engagement | experiment | 13.3 | 45% | 23% | 13.5 | 13.6 | 13.3 | c | SCALE |
| stimulus_envelope | none | 13.3 | 44% | 20% | 13.4 | 13.7 | 13.4 | c | SCALE |
| autonomy_preference | none | 13.4 | 43% | 23% | 13.5 | 13.8 | 13.4 | c | SCALE |
| open_response_performance | generative | 13.4 | 46% | 25% | 8.4 | 13.3 | 13.3 | b |  |
| logical_rigor | generative | 13.4 | 47% | 22% | 10.5 | 14.1 | 11.9 | c | COG |
| causal_chain_depth | generative | 13.4 | 42% | 24% | 10.2 | 14.2 | 13.0 | c | COG |
| analogical_transfer | experiment | 13.4 | 44% | 23% | 13.5 | 13.6 | 11.6 | c | COG |
| relevance_demand | experiment | 13.4 | 44% | 22% | 13.4 | 13.7 | 11.7 | c | SCALE |
| competitive_drive | none | 13.5 | 44% | 22% | 13.5 | 13.9 | 13.4 | c | SCALE |
| structure_need | none | 13.5 | 43% | 21% | 13.5 | 13.6 | 12.3 | c | SCALE |
| working_memory_span | none | 13.5 | 47% | 24% | 13.5 | 13.5 | 10.8 | c | COG |
| cycle_architecture | experiment | 13.5 | 47% | 24% | 13.1 | 13.2 | 12.0 | c | CROSS |
| momentum_dependence | generative | 13.6 | 44% | 22% | 11.6 | 14.7 | 14.2 | c | PROBE |
| novelty_hunger | experiment | 13.6 | 42% | 23% | 13.7 | 13.7 | 11.7 | c | SCALE |
| extrinsic_reward_sensitivity | none | 13.6 | 42% | 21% | 13.5 | 13.7 | 13.5 | c | SCALE |
| global_framing_need | experiment | 13.6 | 44% | 22% | 13.6 | 13.9 | 12.4 | c | CROSS |
| reflection_depth | generative | 13.6 | 34% | 16% | 5.3 | 14.0 | 13.1 | b |  |
| intrinsic_motivation | none | 13.7 | 41% | 22% | 13.8 | 14.4 | 13.7 | c | SCALE |
| worked_example_dependence | experiment | 13.8 | 45% | 25% | 13.8 | 14.3 | 11.6 | c | CROSS |
| mnemonic_receptivity | experiment | 13.8 | 43% | 23% | 13.7 | 13.7 | 13.5 | c | CROSS |
| gamification_response | none | 13.8 | 40% | 19% | 13.9 | 14.1 | 13.8 | c | SCALE |
| cognitive_flexibility | none | 13.9 | 44% | 24% | 14.0 | 14.2 | 13.8 | c | COG |
| warmup_latency | generative | 13.9 | 41% | 20% | 12.5 | 14.4 | 14.1 | c | PROBE |
| enactive_encoding | none | 13.9 | 42% | 20% | 14.0 | 14.0 | 13.9 | c | CROSS |
| retrieval_strength | alias | 14.0 | 43% | 24% | 11.8 | 13.3 | 15.1 | d | DELAYED |
| retention_index | alias | 14.0 | 43% | 24% | 11.8 | 13.3 | 15.1 | d | DELAYED |
| decay_rate | generative | 14.0 | 43% | 24% | 11.8 | 13.3 | 15.1 | d | DELAYED |
| reentry_cost | generative | 14.0 | 44% | 22% | 14.1 | 14.1 | 14.0 | c | PROBE |
| step_explicitness | generative | 14.1 | 44% | 24% | 11.3 | 14.2 | 13.8 | c | CROSS |
| repetition_tolerance | generative | 14.1 | 43% | 20% | 8.6 | 13.7 | 14.2 | b |  |
| feedback_tone_sensitivity | experiment | 14.2 | 41% | 19% | 14.2 | 14.2 | 13.8 | c | CROSS |
| productive_struggle | self-report | 14.2 | 43% | 24% | 13.7 | 14.4 | 14.2 | c | SCALE |
| example_density_need | experiment | 14.3 | 44% | 25% | 14.3 | 14.7 | 12.5 | c | CROSS |
| narrative_pull | experiment | 14.5 | 40% | 19% | 14.5 | 14.8 | 12.5 | c | CROSS |
| attention_runway | generative | 15.5 | 40% | 21% | 5.9 | 13.5 | 14.3 | b |  |
| session_rhythm | generative | 17.8 | 34% | 19% | 13.6 | 14.1 | 17.7 | c | PROBE |
| scaffolding_fade | generative | 19.2 | 21% | 9% | 5.4 | 13.4 | 18.8 | b |  |

## 10. Phase 3: more signal per minute (SIMULATED; nothing here is in the product)

**Everything in this section is simulated.** Source validities are assumptions with the anchor stated in `scripts/scorecard-90-measure.js` (the `--lev` block). Method: `scripts/scorecard-90-measure.js`; day-30 dumps from `scorecard-recovery-sim.js --minutes-per-day=60 --days=30 --truth-factors=1` for seeds 20261022 (A), 7 (B) and 31415 (C, **held out**: never used to calibrate or choose anything; the read-outs are calibrated on A+B and only C is scored with `--c=`). The default sim and `--gate-check` baseline are unchanged (the sim only gained `--ramp-cap` and `--dump`, both off by default).

### 10.1 Results, day 30, 60 min of study a day (average accuracy = 100 - mean absolute error)

| run | measuring min/day | seeds A+B (cross-fit) | seed C (held out) | measures within 5 (C) |
|---|---|---|---|---|
| the app as it is (S0) | 0 | 87.7 | 87.9 | 0 |
| Phase 2 plan (all six levers) | 6.3 | 92.6 | 92.9 | 4 |
| + cohort standardisation | 6.3 | 92.8 | 93.0 | 6 |
| + Phase 3 item levers (`--lev=all`) | 6.3 | 93.3 | 93.6 | 15 |
| same, budget raised to the brief's ~10 min a day | 9.9 | 93.5 | 93.7 | 21 |
| what-if: every source's method error divided by 5 | 9.9 | 95.3 | 95.4 | 72 |

Honest reading: the Phase 3 levers add about 0.7 points and the gain **holds on the held-out seed** (+0.6 to +0.7). Extra minutes add almost nothing (6.3 to 9.9 min: +0.1 to +0.2) because every measure is already at the ceiling of its sources, not short of time. **95% at day 30 is not reached with literature-conservative validities.** It is reached only if the persistent (method) error of the sources is about five times smaller than assumed (last row).

### 10.2 What was tried (each alone, seeds A+B, 9.9 min/day: 93.13 with no lever)

cohort standardisation of the app's number and answer-log features before the read-out (the app norms against its own cohort, and seeds differed by up to 7 points on one measure; read-outs trained on another cohort turned that into error: S1 88.5 to 89.05); best-worst blocks 93.22; adaptive item selection (CAT) 93.28; response times with scale/choice items 93.17; graded confidence on knowledge/reasoning items 93.18; items doubling as lesson practice 93.24; four-dimension production-task bundles 93.16; three-attribute conjoint choice bundles 93.25; all together 93.54. Treating the 100 recalibrated reads as correlated evidence (GLS with their out-of-fold error covariance) lifted the middle stages by 0.2 but not the final number.
Extracting more from answers already given (response-time distributions, error types, hints, skips, pace) was not added as a source: in the sim the measures that carry such behaviour (group a) are already at 2 to 6 points; the 62 questionnaire/LLM-only measures have, by the sim's construction, no behaviour to read, so only designed measurement or the joint posterior can reach them.

### 10.3 Why day 180 was lower than day 30 (S0 86.45 vs 87.7)

Not true-value drift (the sim's truths are fixed) and not a measuring-error bug. Two causes: (1) learners really improve (accuracy 58% to 71%, calibration and first-items features move a lot), so the app's fixed-norm numbers drift for the same underlying trait (self_monitoring and confidence_calibration read 78 against a true mean of 49); (2) the sim's long runs cap the course ramp, so everyone ends far above the course and the app's scaffolding_fade saturates at 100 (error 50). Fix that works in the sim: norm each number against learners of the same tenure (the cohort standardisation above, which needs no truth). Day 180 (80 learners, 40+40 cross-fit): S1 87.97 to 88.65; scaffolding_fade 7.4 to 6.9, self_monitoring 6.7 to 6.5. A real learner's traits do change, so a forgetting/state-space layer is still needed in the product; the sim cannot test it because its truths do not move.

Day 180, same method: S5 93.3 (Phase 2) to 93.6 with the levers at 6.2 min/day, 93.7 at 10.4 min/day; with method error divided by 5, 95.8; by 10, 96.5; by 25, 96.7. **98 to 99% was not reached at day 180** even with near-perfect sources: the rest is small-sample calibration (40 learners per side) plus the free sources' own noise. Day 365: runs are still going; not reported.

### 10.4 Worst measures at day 30 (held out seed C, 9.9 min/day, errors in points)

conceptual_bias 9.4, identity_alignment 9.3, cognitive_flexibility 9.0, competitive_drive 9.0, depth_breadth 8.9, productive_struggle 8.8, planning_tendency 8.8, emotional_engagement 8.7, intrinsic_motivation 8.7, integration_tendency 8.6. Reason for all ten: the sim gives them no behavioural footprint (free precision from the app 0.1 to 0.4 against 6.3 needed), so they depend on one-minute-class designed items whose persistent method error sets the ceiling (precision 1.4 to 1.8 at most). Average error 6.3; 21 measures within 5, 72 within 7.

### 10.5 What the still-missing measures need

An independent method with a persistent error of about a fifth of today's assumed self-report/choice error (a validity of roughly 0.9 against the learner's behaviour, where published self-report/behaviour correlations are 0.1 to 0.4), or a behavioural footprint the app can read. Without either, the closest possible at day 30 in this sim is about 93.7% on average. Confirming this needs a real-learner study; nothing here is real-learner proof.
