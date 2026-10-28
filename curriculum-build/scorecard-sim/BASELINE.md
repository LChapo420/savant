# Scorecard recovery simulation: baseline

Generated 2026-10-22 by `NODE_PATH=../node_modules node scripts/scorecard-recovery-sim.js` (200 synthetic learners per mode, 100 levels, seed 20261022, 20.1s). Full numbers: `baseline.json` next to this file. This is the measuring stick for item 1 of the plan in `curriculum-build/SCORECARD-RESEARCH-2026-10-22.md`; nothing in the app was changed to make it.

## What it does

Each synthetic learner has a known true value for every stat (population mean 50, SD 17, so about one learner in eight is past each directive edge). Where a stat means something the app's data could show, that value drives the learner's behaviour: answers from a Rasch model with noisy difficulty labels, forgetting by half-life on the real `mastery.js` review schedule, rapid guesses, coach use, confidence taps, revisions, misconception tags, quitting, feedback taps, reading time and days between sittings. Lesson pages (every third level) get their holdout / experiment arm from the real `personalize.armFor`, and an experiment arm really changes the next level's accuracy (up to 0.8 logits between arms for an extreme learner). All of it goes through the app's own `scorecard/hooks.js`, `seedFromStyleQuiz` and `learner-record.applyDebrief`, against an in-memory database.

The after-level model read is a stub in three modes: **off**; **honest** (reads 5 stats' true values with noise and suggests the gap; an upper bound, since it assumes a model can perceive traits nothing in the level shows); **confirming** (ignores the truth: two of its five suggestions per level go to a fixed set of eight "pet" stats per learner, the rest to stats the card already leans on, always pushing further the way the card leans — anchoring plus the "the lesson followed the directive and went fine" loop). Its suggestions go through the real one-point, big-move and hold rules.

## What the numbers mean

- **MAE**: mean |card score − true value| on the 0–100 scale. A card that never moves scores about 13.5 ("vs 50"); anything not clearly below that has learned nothing.
- **r**: correlation between card score and true value across learners. Scale-free; "—" means the stat never moved.
- **past-edge**: share of (learner, stat) pairs at ≥30% confidence and ≥20 from 50.
- **FALSE directive**: a directive a lesson writer actually receives (`translate.directives`, cap 22) whose side contradicts the truth (says "high" when the learner is below 50, or the reverse). This is the critical error: it makes a lesson worse for that learner on purpose.
- **unmeasured**: directives on stats whose behavioural + feedback-tap + experiment evidence is below what the confidence gate needs, so the questionnaire and/or the model read carried them over the gate.
- **tokens**: characters ÷ 4 of what the scorecard adds per tailored level: the brief section twice (layout and fill calls) plus the after-level read's 100-stat guide and its system prompt.

## Baseline

```
Scorecard recovery simulation: 200 learners x 3 model-read modes, up to 100 levels, seed 20261022 (20.1s)
Stat groups (research split): behavioural 40 (+brevity = 41 with a signals.js rule), experiment 11, questionnaire-only 7, LLM-only 42

OVERALL (all 100 stats)        levels   MAE  (vs 50) mean r  past-edge  dirs/learner  FALSE dir  false/lrn  LLM-only dirs/lrn  unmeasured  tokens/tailored level
  off                              10  13.6    13.6   0.22    0.1%          0.04   25.0%       0.01                  0    0.0%      4271
  off                              30  13.8    13.6    0.3    0.9%          0.41   18.1%       0.07                  0    0.0%      4313
  off                             100  14.1    13.6   0.35    5.4%          3.74   42.1%       1.57                  0    0.0%      4486
  honest                           10  13.3    13.6   0.35    0.1%          0.03   33.3%       0.01                  0    0.0%      4271
  honest                           30  13.1    13.6   0.52    0.8%           0.4   10.0%       0.04                  0    1.3%      4312
  honest                          100  12.1    13.6    0.7    5.1%          3.48   33.0%       1.15               0.01    2.0%      4481
  confirming                       10  13.6    13.6   0.12    0.2%           0.1   15.0%       0.01                  0   45.0%      4275
  confirming                       30    14    13.6   0.15    3.1%          1.67   25.7%       0.43                  0   26.9%      4374
  confirming                      100  16.7    13.6   0.12   16.9%         11.96   42.4%       5.07               2.24   41.0%      4897
  off at 100 levels, range over 4 learner batches: false dir 37%–49%, mean r 0.33–0.37, dirs/learner 3.58–3.94
  honest at 100 levels, range over 4 learner batches: false dir 26%–38%, mean r 0.7–0.71, dirs/learner 3.22–3.8
  confirming at 100 levels, range over 4 learner batches: false dir 41%–46%, mean r 0.1–0.14, dirs/learner 11.84–12.12

MOST FREQUENT DIRECTIVES at 100 levels (stat fired/learners, false)
  off         hint_dependency 189/200 (93 false), guessing_propensity 184/200 (87 false), misconception_persistence 168/200 (78 false), error_driven_learning 109/200 (45 false), frustration_threshold 30/200 (1 false), failure_response 21/200 (5 false), rush_tendency 16/200 (1 false)
  honest      hint_dependency 171/200 (76 false), guessing_propensity 164/200 (72 false), misconception_persistence 141/200 (57 false), error_driven_learning 70/200 (19 false), frustration_threshold 31/200 (0 false), failure_response 26/200 (5 false), mastery_velocity 21/200 (0 false)
  confirming  hint_dependency 198/200 (102 false), guessing_propensity 198/200 (99 false), misconception_persistence 178/200 (87 false), mastery_velocity 165/200 (72 false), error_driven_learning 160/200 (76 false), frustration_threshold 106/200 (36 false), failure_response 73/200 (21 false)

BY EVIDENCE SOURCE at 100 levels   MAE  mean r (n, >=.7)   past-edge  dirs/lrn  FALSE dir  confident ever  median lvls to 30%
  off         behavioural       15   0.43 (36,  5)   13.3%      3.69   42.7%   72.8%      21
  off         experiment      13.6    0.1 (11,  1)    0.5%      0.05    0.0%   47.4%      47
  off         questionnaire   13.3    0.3 ( 7,  0)    0.0%         0    —      0.0%       —
  off         llm-only        13.6      — ( 0,  0)    0.0%         0    —      0.0%       —
  honest      behavioural     13.6   0.64 (40, 15)   12.5%      3.35   34.3%   82.2%      29
  honest      experiment      11.5   0.54 (11,  1)    1.0%       0.1    0.0%   63.9%      48
  honest      questionnaire   10.9   0.64 ( 7,  2)    0.4%      0.02    0.0%   45.4%      66
  honest      llm-only        11.1   0.81 (42, 42)    0.0%      0.01    0.0%    2.4%      92
  confirming  behavioural     17.5   0.24 (40,  3)   27.3%      7.58   41.8%   81.2%      29
  confirming  experiment      16.1    0.1 (11,  1)   11.8%      1.16   35.9%   60.3%      41
  confirming  questionnaire     17   0.22 ( 7,  0)   19.9%      0.99   34.7%   43.4%      33
  confirming  llm-only        16.1      0 (42,  0)    7.8%      2.24   50.9%    8.0%      31

KEPT CONSTRUCTS (research 2.4), recovery r at 100 levels, by mode
  construct          stat                               off     honest confirming
  expertise          prior_knowledge                   0.85       0.91       0.75
  forgetting_rate    decay_rate                        0.37       0.45       0.33
  reading_speed      processing_velocity               0.85       0.88       0.72
  length_budget      brevity_preference                0.87        0.9       0.79
  interest_context   interest_transfer                 0.03       0.54       0.07
  misconceptions     misconception_persistence         0.31       0.49       0.13
  target_difficulty  challenge_appetite                 0.4        0.7        0.2
  quit_risk          persistence                       0.42       0.69       0.14
  rapid_guess_rate   rush_tendency                     0.66       0.69       0.67
  calibration        confidence_calibration            0.12        0.2       0.12
  coach_reliance     hint_dependency                   0.56       0.69       0.14
  language_level     vocabulary_ceiling                   —       0.77      -0.03

WORST FALSE DIRECTIVES, off, at 100 levels (stat: false of fired; truth model)
  hint_dependency                93 of 189  (behavioural, truth: generative; r 0.56)
  guessing_propensity            87 of 184  (behavioural, truth: generative; r 0.37)
  misconception_persistence      78 of 168  (behavioural, truth: generative; r 0.31)
  error_driven_learning          45 of 109  (behavioural, truth: alias; r 0.33)
  failure_response                5 of 21   (behavioural, truth: generative; r 0.42)
  mastery_velocity                5 of 9    (behavioural, truth: generative; r 0.05)
  rush_tendency                   1 of 16   (behavioural, truth: generative; r 0.66)
  frustration_threshold           1 of 30   (behavioural, truth: generative; r 0.63)

WORST FALSE DIRECTIVES, honest, at 100 levels (stat: false of fired; truth model)
  hint_dependency                76 of 171  (behavioural, truth: generative; r 0.69)
  guessing_propensity            72 of 164  (behavioural, truth: generative; r 0.46)
  misconception_persistence      57 of 141  (behavioural, truth: generative; r 0.49)
  error_driven_learning          19 of 70   (behavioural, truth: alias; r 0.55)
  failure_response                5 of 26   (behavioural, truth: generative; r 0.57)
  rush_tendency                   1 of 18   (behavioural, truth: generative; r 0.69)

WORST FALSE DIRECTIVES, confirming, at 100 levels (stat: false of fired; truth model)
  hint_dependency               102 of 198  (behavioural, truth: generative; r 0.14)
  guessing_propensity            99 of 198  (behavioural, truth: generative; r 0.08)
  misconception_persistence      87 of 178  (behavioural, truth: generative; r 0.13)
  error_driven_learning          76 of 160  (behavioural, truth: alias; r 0.19)
  mastery_velocity               72 of 165  (behavioural, truth: generative; r -0.07)
  frustration_threshold          36 of 106  (behavioural, truth: generative; r 0.29)
  productive_struggle            23 of 45   (questionnaire, truth: self-report; r 0)
  failure_response               21 of 73   (behavioural, truth: generative; r 0.28)

Activity per learner (off): 65 days, 10.41 experiments, 3.61 holdout pages, 176.9 review answers, 6.04 abandoned levels (1.56 left early, the rest quit after misses); accuracy 0.67 (focus 0.71, review 0.62)
Tokens at 100 levels (off): brief 299 (x2 calls), coach 108, after-level read stat guide 3199 + system/rules 689; per tailored level 4486
```

## What it exposes

- **With no model read at all**, the scorecard still issues 3.74 directives per learner at 100 levels, and 42.1% of them contradict the truth (1.57 per learner). Behavioural stats: 42.7% false; experiment stats reach a directive for 0.5% of pairs.
- **A self-confirming model read** gives 11.96 directives per learner, 42.4% false, and 2.24 of them on LLM-only stats (which have no measured evidence at all; 50.9% of those are false).
- **An honest read that sees the truth** recovers LLM-only stats well in ranking (mean r 0.81) but, under the one-point rule, only 2.4% of them ever reach the confidence gate in 100 levels. So the read's rules cap the damage a biased model does only by also capping what a good one could add; and nothing checks which of the two the model is.
- **One-sided signals fire for almost everyone.** hint_dependency 189/200 learners (93 false); guessing_propensity 184/200 learners (87 false); misconception_persistence 168/200 learners (78 false); error_driven_learning 109/200 learners (45 false). They only ever emit one value, so they record "has this ever happened", and they account for nearly all false directives with the read off.
- **Confident but no better than never moving** (mean confidence ≥ 50%, MAE ≥ the always-50 card): deliberation_depth (64% sure, MAE 24 vs 12, r 0.26); hint_dependency (70% sure, MAE 24 vs 12.8, r 0.56); guessing_propensity (74% sure, MAE 22.6 vs 12.9, r 0.37); misconception_persistence (66% sure, MAE 23.3 vs 14.7, r 0.31); error_driven_learning (58% sure, MAE 20.9 vs 14.7, r 0.33); self_monitoring (72% sure, MAE 18.1 vs 12.3, r 0.17); confidence_calibration (70% sure, MAE 16.9 vs 12.3, r 0.12); failure_response (88% sure, MAE 18.4 vs 14.2, r 0.42); error_recovery_speed (72% sure, MAE 18.1 vs 14.2, r 0.42); help_seeking (74% sure, MAE 17 vs 13.4, r 0.52); attention_runway (67% sure, MAE 13.8 vs 13.5, r 0.41); warmup_latency (56% sure, MAE 14.2 vs 14.2, r 0.2). Confidence measures how much evidence arrived, not whether it measures the trait.
- **Well recovered but almost never acted on** (r ≥ 0.7, past the edge for ≤ 10% of learners): processing_velocity (r 0.85, 67% sure, recall 14.0%); session_rhythm (r 0.85, 68% sure, recall —); perfectionism (r 0.85, 30% sure, recall 0.0%); reflection_depth (r 0.89, 24% sure, recall —); brevity_preference (r 0.87, 63% sure, recall 16.4%); prior_knowledge (r 0.85, 28% sure, recall 0.0%). prior_knowledge in particular has one observation (placement, weight 1 = 28% confidence) and never passes the 30% gate.
- **Experiments are too weak to act.** 10.41 experiments per learner in 100 levels, spread over 11 stats: about 0.9 experiment weight per stat. Experiment-stat mean r 0.1, past the edge for 0.5% of pairs, although the simulated arm effects are real (up to 0.8 logits).
- **Kept constructs below r 0.7 with the read off**: forgetting_rate (decay_rate, 0.37), interest_context (interest_transfer, 0.03), misconceptions (misconception_persistence, 0.31), target_difficulty (challenge_appetite, 0.4), quit_risk (persistence, 0.42), rapid_guess_rate (rush_tendency, 0.66), calibration (confidence_calibration, 0.12), coach_reliance (hint_dependency, 0.56), language_level (vocabulary_ceiling, never moves).
- **Tokens.** 4486 scorecard tokens per tailored level with the read off; 3888 of them (86.7%) are the after-level read's stat guide and rules, which are the same size whatever the card says. The brief grows with directives (299 tokens off, 503 with the confirming read).
- Per-stat detail (r, recall, false directives, evidence weight by source, time to confidence) is in `baseline.json`.

## Stats the sim cannot give a generative meaning

Said plainly rather than invented. These have a true value, but nothing the simulated learner does depends on it:

- **No channel in the app's data (43)**: working_memory_span, example_density_need, vocabulary_ceiling, jargon_absorption, cognitive_flexibility, causal_chain_depth, systems_thinking, pattern_detection, logical_rigor, contradiction_sensitivity, global_framing_need, stimulus_envelope, novelty_hunger, gamification_response, relevance_demand, tone_formality, mnemonic_receptivity, interference_susceptibility, enactive_encoding, strategy_awareness, mastery_orientation, autonomy_preference, structure_need, question_generation, planning_tendency, scaffolding_fade, notation_comfort, feedback_tone_sensitivity, intrinsic_motivation, extrinsic_reward_sensitivity, competitive_drive, praise_sensitivity, evaluation_anxiety, boredom_susceptibility, social_framing, identity_alignment, emotional_engagement, near_transfer, far_transfer, application_orientation, conceptual_bias, integration_tendency, creative_extension. Only the honest model stub sees them.
- **Self-report only (6)**: chunk_granularity, spatial_anchoring, elaboration_benefit, generation_effect, productive_struggle, feedback_granularity: the questionnaire answer (r = 0.4) and the model read.
- **Dead-wired (2)**: text_density_tolerance (only signal reads telemetry.scroll_backs, which nothing in the app records); consolidation_need (only signal reads telemetry.scroll_backs, which nothing in the app records).
- **Aliases (7)**: deductive_trajectory = inverse of inductive_trajectory; retrieval_strength = inverse of decay_rate; recognition_recall_gap = inverse of open_response_performance; retention_index = inverse of decay_rate; error_recovery_speed = same latent as failure_response; error_driven_learning = inverse of misconception_persistence; self_monitoring = same latent as confidence_calibration. The scorecard stores them as separate stats; the sim treats them as one latent each.

What the sim does **not** model: whether following a directive improves learning (no outcome model for tailoring other than the experiment arms and page length); AI-lesson (`lessons`) levels, checkpoints, games and block levels; the population prior (each learner runs alone, so priors stay at 50); facts and recommendations reviews in the learner record (the review is a second model call); the questionnaire's real question wording.

## Targets future changes must beat

Run the same command (same seed) after each change and compare:

1. **False directives ≤ 2%** of directives produced, at every checkpoint and in every model-read mode (baseline at 100 levels: off 42.1%, honest 33.0%, confirming 42.4%).
2. **No LLM-only stat ever produces a directive**: 0 per learner in every mode (baseline: off 0, honest 0.01, confirming 2.24).
3. **Recovery r ≥ 0.7 on the kept constructs** (research section 2.4) at 100 levels with the model read off. Baseline: expertise 0.85, forgetting_rate 0.37, reading_speed 0.85, length_budget 0.87, interest_context 0.03, misconceptions 0.31, target_difficulty 0.4, quit_risk 0.42, rapid_guess_rate 0.66, calibration 0.12, coach_reliance 0.56, language_level —.
4. Also watch: unmeasured-directive share → 0; experiment-stat recall above 0 for real effects; scorecard tokens per tailored level from 4486 toward the research estimate of 400–800.

## Progress

One row per change, same seed and learners, at 100 levels. Targets: false directives ≤ 2%, LLM-only directives 0, kept constructs r ≥ 0.7 (all 12).

| run | date | FALSE directive rate | false per learner | LLM-only directives per learner | kept r ≥ 0.7 (read off) | mean r | directives per learner | tokens per tailored level | change |
|---|---|---|---|---|---|---|---|---|---|
| baseline | 2026-10-22 | off 42.1%, honest 33.0%, confirming 42.4% | off 1.57, honest 1.15, confirming 5.07 | off 0, honest 0.01, confirming 2.24 | 3/12 | off 0.35, honest 0.7, confirming 0.12 | off 3.74, honest 3.48, confirming 11.96 | 4486 | current code (before any fix) |
| step-1 | 2026-10-22 | off 4.5%, honest 2.8%, confirming 38.1% | off 0.02, honest 0.01, confirming 2.75 | off 0, honest 0.01, confirming 2.27 | 3/12 | off 0.37, honest 0.69, confirming 0.14 | off 0.44, honest 0.54, confirming 7.23 | 4313 | one-sided signals -> rates per chance (coach use, help when stuck, rapid choice over own typed haste, long answers, revisions, misconception repeats), Beta posterior with a 40-chance prior; failure_response residual vs the rest of the level; two-way frustration/persistence; levels-per-sitting mastery_velocity rule removed |
| step-2 | 2026-10-22 | off 4.9%, honest 4.9%, confirming 4.9% | off 0.03, honest 0.03, confirming 0.03 | off 0, honest 0, confirming 0 | 3/12 | off 0.37, honest 0.71, confirming 0.15 | off 0.51, honest 0.51, confirming 0.51 | 4314 | model-read quarantine: shown score s vs measured score m; read() returns measured; confidence and directives from behaviour+experiment mass only; questionnaire nudges m without mass; mass kept by source; legacy cards migrated from their log; shift() keeps rate counts |
| step-3 | 2026-10-22 | off 3.3%, honest 3.3%, confirming 3.3% | off 0.01, honest 0.01, confirming 0.01 | off 0, honest 0, confirming 0 | 4/12 | off 0.37, honest 0.72, confirming 0.15 | off 0.46, honest 0.46, confirming 0.46 | 4311 | evidence fades by time (90-day half-life) not per update; prior strength from population spread; placement counts as a test (step up to 40; its weight 2 was still clamped to 1 here, fixed in step 4); prior_knowledge never borrows another subject's evidence |
| step-4 | 2026-10-22 | off 2.2%, honest 2.2%, confirming 2.2% | off 0.01, honest 0.01, confirming 0.01 | off 0, honest 0, confirming 0 | 4/12 | off 0.38, honest 0.72, confirming 0.15 | off 0.47, honest 0.47, confirming 0.47 | 4310 | calibration/self-monitoring as a contrast (accuracy when sure minus when not, Beta posteriors around pooled accuracy); directive gate also needs the measured score 2 standard errors from 50 (SCORECARD_GATE_Z); placement counts as a test of weight 4 (was clamped to 1); evidence read as of now (time decay applied on read, not only on update); Elo/IRT not built (needs mastery.js) |
| step-5 | 2026-10-22 | off 33.3%, honest 33.3%, confirming 33.3% | off 0.63, honest 0.63, confirming 0.63 | off 0, honest 0, confirming 0 | 4/12 | off 0.38, honest 0.72, confirming 0.15 | off 1.89, honest 1.89, confirming 1.89 | 4379 | REJECTED, reverted: reviews scored against a fixed population forgetting curve (half-life 2 days x2.5 per correct). decay_rate r unchanged (0.36) and 96 directives, 42 false: an uncalibrated curve biases every learner the same way. Needs the curve fitted from all learners' events (HLR) first |
| step-6 | 2026-10-22 | off 2.2%, honest 2.2%, confirming 2.2% | off 0.01, honest 0.01, confirming 0.01 | off 0, honest 0, confirming 0 | 4/12 | off 0.38, honest 0.72, confirming 0.15 | off 0.47, honest 0.47, confirming 0.47 | 3887 (423 uncached) | after-level read: stat guide without the learner's current scores (no anchoring; the system prompt + guide is now one cacheable prefix, identical for every learner and level), rules say suggestions never change lessons; review keeps values; at most 6 lesson directives (was 22) |
| step-7 | 2026-10-22 | off 12.1%, honest 12.1%, confirming 12.1% | off 0.02, honest 0.02, confirming 0.02 | off 0, honest 0, confirming 0 | 4/12 | off 0.38, honest 0.73, confirming 0.13 | off 0.17, honest 0.17, confirming 0.17 | 3874 (410 uncached) | MEASUREMENT CHANGE, no app change: the sim now has a population (60 other learners, own seed, run first through the same code; their cards are read-only rows every measured learner sees, and shared tables are restored per learner), so population priors, prior strengths and rate norms work as in the app. Same code as step-6: false directives 2.2% -> 12.1% (prior_knowledge and perfectionism directives that were right mostly disappear under population priors; guessing/deliberation/rush/hint false ones remain). --population=0 reproduces step-6 exactly |
| step-8 | 2026-10-22 | off 0.0%, honest 0.0%, confirming 0.0% | off 0, honest 0, confirming 0 | off 0, honest 0, confirming 0 | 7/12 | off 0.43, honest 0.75, confirming 0.14 | off 0.17, honest 0.17, confirming 0.17 | 3872 (408 uncached) | Elo/IRT ability (new scorecard/irt.js; mastery.recordAttempt stores expected p, skill Elo and the gap since last practice beside its unchanged state; label/format difficulties calibrated across learners in one shared content_cache row; rapid guesses, coach answers and day-old memory tests left out of the updates) and signals read against it: failure_response/error_recovery as a logit shift vs expectation with a population-fitted spread; coach use split into reliance (when within reach) and help-seeking (when stuck, over their unstuck rate); deliberation vs own pace; misconceptions out of misses; persistence as a stop-after-3-misses rate; challenge appetite from difficulty taps against the level's accuracy (grid posterior); calibration as type-2 ROC area over guess/think/sure; guessing as MC-vs-typed rapid contrast with population shrinkage; rush as a rapid-answer rate |
| step-9 | 2026-10-22 | off 0.0%, honest 0.0%, confirming 0.0% | off 0, honest 0, confirming 0 | off 0, honest 0, confirming 0 | 7/12 | off 0.44, honest 0.77, confirming 0.15 | off 0.12, honest 0.12, confirming 0.12 | 3872 (408 uncached) | experiment estimator: raw arm outcomes kept as residual sums per arm (next level's main questions, an AI lesson's checks, a block lesson's own checks, delayed reviews; each against the ability model's expectation instead of accuracy vs a moving baseline), estimated pooled-then-individual (population median difference and between-learner spread by method of moments; each learner shrunk by their noise; spread ~0 = no per-learner directive); a stat with taps and an experiment (brevity) combines both instead of one overwriting the other; block levels now go through the level read when finished (patterns, credit of the lesson page before, a block lesson's own experiment) once per plan - their arm used to be stored and never credited; experiments weighted 4x toward interest examples and length (the kept constructs); help-seeking ignores rapid answers. No bandit: per-learner arm effects are too small for adaptive allocation to pay at ~10 experiments per learner |
| step-10 | 2026-10-22 | off 0.0%, honest 0.0%, confirming 0.0% | off 0, honest 0, confirming 0 | off 0, honest 0, confirming 0 | 7/12 | off 0.45, honest 0.78, confirming 0.14 | off 0.13, honest 0.14, confirming 0.14 | 3873 (409 uncached) | forgetting model (new scorecard/forgetting.js): half-life regression P = g + (pk - g) 2^(-dt/h), log2 h = a + b*right + c*wrong (earlier answers on the skill) + m, on every memory test (a skill last practised a day or more ago): dt is the real review interval, pk the ability model's fresh expectation, g the guessing floor. a,b,c fitted by Fisher scoring to every learner's last 200 tests (kept per subject on the card); m per learner shrunk toward the population's median with the spread between learners; never confident until there is a population (the step-5 failure). decay_rate, retention_index and retrieval_strength all from it. decay_rate r 0.36 -> 0.46; an oracle that knows each test's true half-life structure reaches only 0.65 at 100 levels on this review schedule, so the remaining gap is mostly information, not model |
| step-11 | 2026-10-22 | off 0.0%, honest 0.0%, confirming 0.0% | off 0, honest 0, confirming 0 | off 0, honest 0, confirming 0 | 7/12 | off 0.44, honest 0.78, confirming 0.15 | off 0.13, honest 0.14, confirming 0.14 | 3873 (409 uncached) | evidence-quantity gate per construct (translate MIN_EVIDENCE): besides confidence and 2 SE, a directive needs 8 measured value updates, or 30 chances (rate), 15 answers on the thinner side (contrast), 10 (shift), 6 (experiment arm), 8 taps, 20 memory tests - unless placement measured it; old cards count as enough. Also: a model estimate with no mass is still the score shown. With no population yet (--population=0, the app's first weeks) false directives are 0.0% / 0.0% / 0.0% at 10 / 30 / 100 levels with 0.15 / 0.30 / 0.61 directives per learner (step-6 at the same setting: 4.5% / 4.5% / 2.2%, 0.22 / 0.33 / 0.47) |
| step-12 | 2026-10-22 | off 0.0%, honest 0.0%, confirming 0.0% | off 0, honest 0, confirming 0 | off 0, honest 0, confirming 0 | 7/12 | off 0.45, honest 0.6, confirming 0.23 | off 0.18, honest 0.18, confirming 0.18 | 1605 (291 uncached) | wiring and tokens: lesson pages (AI lessons in session.js, creator pages in base-lesson.js, block levels in block-level.js) count scroll-backs, and an AI lesson's read time and scroll-backs now reach its level row (block-finish route -> hooks.onLessonRead), where signals.fromLesson reads them; consolidation_need / text_density_tolerance are rates over recorded lessons instead of one-sided values (the sim now generates scroll-backs: consolidation_need r — -> 0.64). details.brief: the duplicate HOW THEY ARE BEST TAUGHT section (stated + observed style) removed, fixed lines first and per-level lines (feedback, standing, recent levels, recent conclusions) last; the scorecard section says nothing when nothing is confident; the after-level read sends the 100-stat guide and asks for stat changes only when the learner wrote something (a read never changes a lesson, and performance is measured by the rules) - read tokens per level are the 30% feedback / 70% performance mix; the model read's evidence fade can no longer touch the measured value path. Harness: population figures recomputed for every learner (steps 8-11 let a mode inherit the last learner's figures, which made honest/confirming differ from off by one directive), and memory tests counted in the evidence ledger |
| step-13 | 2026-10-22 | off 0.5%, honest 0.5%, confirming 0.5% | off 0.01, honest 0.01, confirming 0.01 | off 0, honest 0, confirming 0 | 7/12 | off 0.44, honest 0.6, confirming 0.23 | off 0.99, honest 0.99, confirming 0.99 | 1719 (405 uncached) | RECALL ROUND. Directive gate as a calibrated posterior on the learner's STANDING among learners (scorecard.standing): each measured kind (rate as a logit with its counting variance, contrast, ROC area, shift, tap grid, forgetting multiplier, and the value path of the three single-behaviour stats processing_velocity / brevity_preference / prior_knowledge as a weighted mean with pooled within-learner variance; a placement as one test of known error) is read against the population's centre and true spread (method of moments), giving a posterior for z; the trait posterior is widened for a behaviour-trait validity of 0.9; a directive needs P(trait on that side of the typical learner) >= 0.98 and best estimate /z/ >= 0.88 (top/bottom fifth). No population yet: the old gate, unchanged. Mixed-signal value paths (attention_runway, intake, momentum...) keep the old gate: read as standings they went false |
| step-14 | 2026-10-22 | off 0.5%, honest 0.5%, confirming 0.5% | off 0.01, honest 0.01, confirming 0.01 | off 0, honest 0, confirming 0 | 7/12 | off 0.45, honest 0.6, confirming 0.24 | off 0.99, honest 0.99, confirming 0.99 | 1719 (405 uncached) | mastery_velocity from the slope of ability over practice: irt.js bins every 10 fresh, unaided, non-rapid answers (when, how many right, mean/variance of the items' calibrated label+format difficulty, never the skill's own Elo) and refits a per-learner logistic P = sigmoid(a + slope*t - b), t in hundreds of answers, every bin; the slope is read against the population's slopes (centre, true spread by method of moments) as a standing, 17 points per between-learner SD; never confident without a population (the course's own climb is in every slope); a directive needs 300 fresh answers. mastery_velocity r — -> 0.5 at 100 levels, no directive yet: its sampling error (0.096 logits/100 answers) is larger than the true spread between learners (0.056), so the 0.98 gate is not reached in 100 levels |
| step-15 | 2026-10-22 | off 0.6%, honest 0.6%, confirming 0.6% | off 0.01, honest 0.01, confirming 0.01 | off 0, honest 0, confirming 0 | 7/12 | off 0.43, honest 0.6, confirming 0.23 | off 0.91, honest 0.91, confirming 0.91 | 1706 (392 uncached) | MEASUREMENT CHANGE, no app change: a level left partway now leaves its sitting OPEN, as in the app (the client cannot finish a practice level halfway, and an open sitting is resumed). At the next sitting the learner comes back to it (the app resumes it: the rest of the level is answered in the same rows after the break) or opens another level (the app closes it as abandoned), half and half (--abandon). Until now every quit sitting was finished with its unanswered questions, which the app never does. Same code as step-14: persistence r 0.72 -> 0.03 (the app never saw a quit); everything else within noise |
| step-16 | 2026-10-22 | off 0.6%, honest 0.6%, confirming 0.6% | off 0.01, honest 0.01, confirming 0.01 | off 0, honest 0, confirming 0 | 7/12 | off 0.45, honest 0.6, confirming 0.24 | off 0.91, honest 0.91, confirming 0.91 | 1706 (392 uncached) | mid-level quits recorded (app change): hooks.onSessionAbandoned, called by routes/learn.js when opening another level closes the learner's open sitting on their own level (a preview being closed, and a privileged skip/jump, are not quits and are not passed), reads the sitting as left at its last answer: persistence counts a level left after a run of 3+ misses with its questions unanswered. And signals.fromSession now sees a quit inside a resumed sitting: the next answer after a run of misses coming 30+ minutes later is a stop (the app resumes open sittings, so most quits look like this); a sitting's minutes leave the breaks out; a skipped question is not a stop. persistence r 0.03 -> 0.68 (step-14, before the sim saw what the app sees: 0.72) |
| step-17 | 2026-10-22 | off 0.5%, honest 0.5%, confirming 0.5% | off 0.01, honest 0.01, confirming 0.01 | off 0, honest 0, confirming 0 | 7/12 | off 0.44, honest 0.6, confirming 0.24 | off 1.01, honest 1.01, confirming 1.01 | 1716 (402 uncached) | processing_velocity from answer pace (anything-else 1): irt.js keeps faded sums of log(answer time / the time the item deserves) over ordinary answers (not rapid, no coach, not a deliberate think over 2.5x their own pace), and the scorecard reads it as a standing among learners (score 50 + 17 z); its old value path (fast and RIGHT 75 / slow and wrong 30) let ability leak in and gave the one false directive left at every gate setting, so the standing rests on pace alone (the value path still moves the score shown). Also: a standing read through a second model's expectations (forgetting curve + expected recall; mastery velocity's calibrated difficulties) is widened as for validity 0.8 instead of 0.9 (a forgetting standing at z 1.6 +/- 0.6 fired on a learner whose true decay was 47). processing_velocity r 0.86 -> 0.98, recall 0.56 -> 0.93 |
| step-18 | 2026-10-22 | off 0.5%, honest 0.5%, confirming 0.5% | off 0.01, honest 0.01, confirming 0.01 | off 0, honest 0, confirming 0 | 7/12 | off 0.44, honest 0.6, confirming 0.24 | off 1.03, honest 1.03, confirming 1.03 | 1718 (404 uncached) | rates enter the population's spread after 10 chances (was 30; their counting noise is taken out by the method of moments) and, with a calibrated standing, a rate directive needs 10 chances (was 30): persistence (about 13 chances, runs of three misses, per 100 levels) and consolidation_need could not get a standing before. A rate designed for one stat and read inverted as another (text_density_tolerance from scroll-backs, error_driven_learning from repeated tagged mistakes) is held to validity 0.8 as that second stat: at full validity 3 of 4 low text-density directives went false (a latent problem: they would have appeared in the app once 20 learners had 30 recorded lessons). Lowering every kind's minimum instead was measured and rejected (3.3% false at 30 levels) |
| step-19 | 2026-10-22 | off 0.5%, honest 0.5%, confirming 0.5% | off 0.01, honest 0.01, confirming 0.01 | off 0, honest 0, confirming 0 | 7/12 | off 0.45, honest 0.6, confirming 0.24 | off 1.09, honest 1.09, confirming 1.09 | 1724 (410 uncached) | frustration_threshold as a contrast (anything-else 3): the rapid-answer rate right after a miss against the learner's own rapid rate on the other answers (general haste cancels), per answer, read with the population's norm and spread (CONTRASTS; never confident before there is a population, since how much more people rush after a miss is not known until then). Replaces the level-level value (25 when half the answers after misses were rushed, 62 when none), which a learner who rushes everything earned as easily. frustration_threshold r 0.73 -> 0.87, recall 0 -> 0.52 (13 directives, 0 false) |
| step-20 | 2026-10-22 | off 0.5%, honest 0.5%, confirming 0.5% | off 0.01, honest 0.01, confirming 0.01 | off 0, honest 0, confirming 0 | 7/12 | off 0.45, honest 0.61, confirming 0.24 | off 1.09, honest 1.09, confirming 1.09 | 1724 (410 uncached) | warm-up, fatigue and momentum as shifts against the ability model's expectation (anything-else 4), like failure_response: per level, residuals (right - expected, rapid / coach / memory-test answers left out) of the first three answers against the rest, the first half of a long level against the second, and the rest of a level after two opening misses against the same positions after another start; read with the population's norm and spread, never confident before there is a population (a level's own order, reviews first and the stretch item last, is in every learner's numbers). The raw-accuracy values they replace stay only for answers without the ability model. warmup r 0.23 -> 0.32, fatigue 0.30 -> 0.45, momentum 0.17 -> 0.17; no directive yet (a 10-question level holds too little of each) |
| step-21 | 2026-10-22 | off 0.4%, honest 0.4%, confirming 0.4% | off 0.01, honest 0.01, confirming 0.01 | off 0, honest 0, confirming 0 | 7/12 | off 0.45, honest 0.61, confirming 0.24 | off 1.14, honest 1.14, confirming 1.14 | 1729 (415 uncached) | a placement counts as one test of 10 points' error (variance 100) in its standing, the error index.js's own TEST_BATCH_CAP comment states for ~20 adaptive items (was 12.5, i.e. weight 4 read as 625/4). prior_knowledge recall 0.10 -> 0.23 (4 -> 12 directives, 0 false). Caveat: 10 points is also exactly the sim's placement error; if the real placement is noisier, prior_knowledge standings are over-confident in proportion |
| step-22 | 2026-10-22 | off 0.5%, honest 0.5%, confirming 0.5% | off 0.01, honest 0.01, confirming 0.01 | off 0, honest 0, confirming 0 | 7/12 | off 0.45, honest 0.61, confirming 0.24 | off 1.09, honest 1.09, confirming 1.09 | 1726 (412 uncached) | ROBUSTNESS ACROSS SEEDS (the sim at seeds 7, 11 and 3 as well as 20261022, 200 learners each). Found: the forgetting model's posterior is over-confident (seed 11: true decay 47 read z 2.2 +/- 0.6 from 108 memory tests, a false directive on decay, retention and retrieval); low text-density-tolerance (scroll-backs read inverted) went false twice at seed 11 even at validity 0.8; and with no population the old gate went over 2% at two seeds (2.7% at seed 7: challenge taps and perfectionism; 2.8% at seed 11 at 30 levels). Changes: memory-kind stats and the inverted second reading of a rate (text_density_tolerance, error_driven_learning) steer no lesson; the no-population gate also applies the trait rule, reading the score as if 17 points were one between-learner SD (the scale the edge of 20 assumes). After: false directives at 10/30/100 levels with the population, seeds 20261022 / 7 / 11 / 3: 0/0/0.5%, 0/0.8/0%, 1.9/0/0.4%, 0/0.7/0.5%; with no population 0/0/0% at all four seeds (before: up to 2.8%), at the cost of true directives with no population (0.50 -> 0.15 per learner at 100 levels). Validity 0.85 instead of 0.9 was measured on the same four seeds: about 30% fewer true directives for no clear false-directive gain, so 0.9 stays |
| step-23 | 2026-10-23 | off 0.5%, honest 0.5%, confirming 0.5% | off 0.01, honest 0.01, confirming 0.01 | off 0, honest 0, confirming 0 | 7/12 | off 0.45, honest 0.61, confirming 0.24 | off 1.09, honest 1.09, confirming 1.09 | 1726 (412 uncached) | MEASUREMENT CHANGE, no app change (round 4): learning outcomes added to the sim, read only. Recall of every practised skill 7 and 30 days after the checkpoint from the learners' true half-lives, practice hours, review answers, skills recalled at 30 days per practice hour; and what the directives are worth to learning: prior-knowledge directives valued by the expertise-reversal meta-analysis (Tetzlaff et al. 2025: d 0.505 assistance for novices, 0.428 less assistance for experts, negative on the wrong side), experiment-stat directives by the sim's own arm model (logits on the next level's main questions), each against an oracle that gives every learner truly past an edge the right directive. Same code as step-22: every other number unchanged |
| step-24 | 2026-10-23 | off 0.5%, honest 0.5%, confirming 0.5% | off 0.01, honest 0.01, confirming 0.01 | off 0, honest 0, confirming 0 | 7/12 | off 0.45, honest 0.6, confirming 0.24 | off 1.09, honest 1.09, confirming 1.09 | 1726 (412 uncached) | MEASUREMENT CHANGE, no app change (round 4): scaffolding_fade gets a truth the app's data can show. Expertise relative to the material is the one learner-by-teaching interaction with a replicated effect (expertise reversal; Tetzlaff et al. 2025), so the sim now defines scaffolding fade's truth as where the learner stands against the course at the checkpoint (true ability minus the difficulty the course is pitched at for them at that level, as a standing among the measured learners, 50 + 17 z); it moves from the LLM-only group (now 41) to behavioural, and its directives are valued like prior knowledge's (d 0.505 / 0.428). Same code as step-23 (the app does not measure it yet: no directive) |
| step-25 | 2026-10-23 | off 0.5%, honest 0.5%, confirming 0.5% | off 0.01, honest 0.01, confirming 0.01 | off 0, honest 0, confirming 0 | 7/12 | off 0.45, honest 0.6, confirming 0.24 | off 1.09, honest 1.09, confirming 1.09 | 1726 (412 uncached) | BUG FIX (round 4): irt.js packed an answer's context with pace and prior_correct under the same key ('pc'), so since step 17 every stored context lost its earlier-right count and the forgetting model read nc as the pace flag (0 or 1) and nw as nearly every earlier attempt. Each field now has its own key, checked at load. decay_rate / retention / retrieval r 0.49 -> 0.54 at 100 levels (standing r 0.49 -> 0.54); every other number unchanged. (Memory-kind stats still steer no lesson: step 22's over-confidence finding was made with the corrupted counts and is worth re-measuring, but a recall-recap directive is something the research says to bake into every lesson anyway.) |
| step-26 | 2026-10-23 | off 0.5% | off 0.01 | off 0 | 7/12 | off 0.45 | off 1.08 | 1724 (410 uncached) | REJECTED, reverted (model read off only; the three modes give the same directives; measured before step 24's sim change, so against the same code's normal-approximation run, not step-25): rate standings from the exact logit-normal model (a binomial GLMM: population mu and tau by maximum marginal likelihood over learners' faded counts, each learner's z posterior on a grid with the binomial likelihood) instead of the logit with counting variance 1/(k+.5)+1/(n-k+.5). Rush 20 -> 25 and deliberation 0 -> 3 directives, but hint dependency 16 -> 9; true directives per learner 0.82 -> 0.81, learners with one 59.5% -> 58%; same false directives; three times slower. Its JSON is step-26-rejected.json |
| step-27 | 2026-10-23 | off 0.4%, honest 0.4%, confirming 0.4% | off 0.01, honest 0.01, confirming 0.01 | off 0, honest 0, confirming 0 | 7/12 | off 0.46, honest 0.61, confirming 0.25 | off 1.23, honest 1.23, confirming 1.23 | 1737 (423 uncached) | EXPERTISE AGAINST THE COURSE (round 4): scaffolding fade is measured. irt.js keeps, per subject, a faded mean (about the last 100 fresh answers) of the logit of the ability model's expectation of each fresh, unaided, non-rapid answer before it is seen (reach: how far within reach the items the course serves this learner are, whatever the difficulty labels mean); the scorecard reads it as a standing among the subject's learners (method of moments, with the Elo's own tracking error of variance 0.03 in each learner's noise), never before there is a population, and a directive needs 150 fresh answers in the subject. Low = keep full support, high = fade support quickly: the expertise reversal effect (Tetzlaff et al. 2025: d 0.505 / 0.428), read against the material in front of them rather than a placement score. scaffolding_fade r — -> 0.79, 28 directives at 100 levels (0 false), recall 0.40; expertise-matched directive value 0.027 -> 0.084 d per learner (oracle 0.198); true directives per learner 0.82 -> 0.91, learners with one 59.5% -> 64%. Seeds 7 / 11 / 3: 25 / 30 / 27 scaffolding directives, 0 / 1 (truth 51) / 0 false; false directives at 10/30/100 levels 0/0.7/0.0%, 1.9/0.0/0.7%, 0/0.7/0.4% |
| step-28 | 2026-10-23 | off 0.4%, honest 0.4%, confirming 0.4% | off 0.01, honest 0.01, confirming 0.01 | off 0, honest 0, confirming 0 | 7/12 | off 0.46, honest 0.61, confirming 0.25 | off 1.26, honest 1.26, confirming 1.26 | 1739 (425 uncached) | Reach's noise set from the ability model rather than guessed (round 4): an Elo estimate with learning rate K settles around the truth with variance K / (2 - K I), I = p(1 - p) about 0.21, which is 0.02 at the floor K of 0.04 that a learner past 150 answers is at (step 27 used 0.03). Also: reach finds an answer's subject through its sitting (the app's practice rows carry session_id, not track_id; the sim's rows no longer carry track_id either, which changed no number). Scaffolding fade directives 28 -> 34 (0 false), recall 0.40 -> 0.44; expertise directive value 0.084 -> 0.094 d per learner. Seeds 11 / 7 / 3: scaffolding directives 30 -> 45, 25 -> 32, 27 -> 30, false unchanged (the one at seed 11 is a learner of truth 51); false directives at 10/30/100 levels 1.9/0.0/0.7%, 0.0/0.7/0.0%, 0.0/0.7/0.4%. 0.015 gave more still (44 at this seed) but is below the model's own floor; a 100-answer minimum instead of 150 added a false directive at seed 11 and was not kept |
| step-29 | 2026-10-23 | off 0.4% | off 0.01 | off 0 | 7/12 | off 0.46 | off 1.26 | 1739 (425 uncached) | ROUND 5. EXPORT + MEASUREMENT, no change to any score (model read off; the three modes give identical directives since step 2, so round 5 runs `--modes=off`): `scorecard.forgettingCurve({ userId, trackId })` returns the fitted population curve (and the learner's multiplier) for review scheduling in adaptation.js, `forgetting.recallAt` reads it; the sim now reports how well that curve predicts each learner's TRUE recall of each practised skill at +7 / +30 days (30-day MAE 0.100, bias -0.087, r 0.80; the default curve adaptation.js used: 0.112 / -0.101 / 0.76), and has `--memory=fsrs` (the FSRS-6 memory model with its published defaults as the learners' true memory, a robustness check). Same numbers as step 28 at all four seeds |
| step-30 | 2026-10-23 | off 0.4% | off 0.01 | off 0 | 7/12 | off 0.46 | off 1.26 | 1739 | REJECTED, kept off (code stays behind env switches, rows now record spaced counts): three changes to the forgetting curve, four seeds each. (a) terms for earlier SPACED right / wrong answers beside all answers (irt.js now counts them per skill): 30-day prediction MAE better at all seeds (0.100 -> 0.087, 0.083 -> 0.078, 0.085 -> 0.080, 0.088 -> 0.081) but r worse at all (0.80 -> 0.78, 0.82 -> 0.78, 0.79 -> 0.74, 0.77 -> 0.73), decay r worse (0.54 -> 0.51, 0.47 -> 0.42, 0.48 -> 0.47, 0.47 -> 0.44), and with reviews scheduled by it (`--review-pick=model`) 30-day recall LOWER at three seeds (24.6 -> 23.8%, 23.8 -> 22.8%, 22.3 -> 21.4%, 21.1 -> 21.1%): spaced successes are partly the learner's own memory, so they explain away the learner's multiplier. (b) a power-law shape chosen by likelihood (plus a): over-predicted at two seeds (bias +0.04) and lowered decay r. (c) a joint refit with each learner's multiplier as an offset: no measurable gain (30-day recall under model scheduling +0.3 / -0.4 / -0.1 / +0.5 points). Under the FSRS-6 memory, (b)+(c) is much better (below) |
| step-31 | 2026-10-23 | off 1.2% | off 0.01 | off 0 | 7/12 | off 0.45 | off 1.28 | 1742 | MEASUREMENT CHANGE, no app change: language level shows in the answers (`--text-load=0.6`, now the default): an item's answer logit moves by 0.6 x z(vocabulary_ceiling) x its prompt length as a z, so a learner at 20 loses about 0.36 logits per SD of wordiness. The direction is replicated (item linguistic complexity predicts difficulty gaps against English learners of the same ability: Martiniello 2008; Abedi & Lord 2001); the size is an assumption. Vocabulary ceiling becomes behavioural/measurable. False directives at 10/30/100, seeds 20261022 / 7 / 11 / 3: 0/1.4/1.2, 0/0/0.4, 1.8/0.7/0.4, 0/0.6/0.8% (the answer stream changed) |
| step-32 | 2026-10-23 | off 1.2% | off 0.01 | off 0 | 8/12 | off 0.46 | off 1.29 | 1742 | LANGUAGE LEVEL FROM THE ANSWERS (no new item type): signals.js splits each level's answers at its median text load (prompt words, long words twice) and reads the wordier half against the plainer half, each against the ability model's expectation (a shift, `res_text_heavy` / `res_text_light`), as a standing among learners, never before there is a population, validity 0.8. language level r — -> 0.72 / 0.76 / 0.73 / 0.80 (seeds 20261022 / 7 / 11 / 3), 1 directive per seed, none false; every other number identical. Kept constructs at r >= 0.7: 7 -> 8 of 12. Safety: with no true effect (`--text-load=0`) r is 0.0 and no directive fires, every number as step 29; at half the effect (0.3) r 0.45-0.53 and no directive. `SCORECARD_TEXT_LOAD=off` turns it off |
| step-33 | 2026-10-23 | off 0.4% | off 0.01 | off 0 | 7/12 | off 0.46 | off 1.23 | 1738 | REJECTED (measured on the step-29 stick): reach over the last ~50 fresh answers instead of ~100 (fresher, noisier). Scaffolding directives 34 -> 27, 32 -> 32, 45 -> 40, 30 -> 33 and expertise value lower at three seeds (0.094 -> 0.083, 0.124 -> 0.122, 0.139 -> 0.130 d per learner). Also measured on that stick, as a product call: confidence taps shown mostly on the level's harder questions (`--tap-pick=hard`, same number of taps): calibration r 0.50 -> 0.49, 0.57 -> 0.53, 0.53 -> 0.60, 0.65 -> 0.67, no directive, and 2.1% false at 30 levels at seed 7: no gain |
| step-34 | 2026-10-23 | off 1.1% | off 0.01 | off 0 | 8/12 | off 0.47 | off 1.34 | 1746 | CONFIDENCE AS A TRAIT (self-efficacy) and more language-level directives. (1) self_efficacy gets a rate: of the "how sure are you?" taps on RIGHT answers, the share that were "sure", read as a standing among learners, validity 0.8. How sure people say they are is a stable trait, more reliable than how well confidence separates right from wrong (bias test-retest r .67 vs .45 for efficiency: Zhan, Castanheira & Fleming 2026, preliminary; a robust confidence factor predicting achievement beyond self-efficacy questionnaires: Stankov et al. 2012). self_efficacy r 0.23 / 0.21 / 0.32 / 0.26 -> 0.77 / 0.76 / 0.77 / 0.79 (seeds 20261022 / 7 / 11 / 3), 8 / 23 / 10 / 14 directives, none false. Counting every tap instead (not only right answers) gave r 0.72-0.76 and a false directive on a learner of truth 61 behind the course, so only right answers count. (2) the language-level standing at validity 0.9 instead of 0.8: 1 -> 3 / 4 / 2 / 4 directives, none false. Together, against step 32: true directives per learner 0.94 -> 0.99, 0.95 -> 1.04, 0.91 -> 0.95, 0.96 -> 1.01; recall 10.7 -> 11.2%, 11.0 -> 12.1%, 10.1 -> 10.7%, 10.8 -> 11.5%; false directives at 10/30/100: 0/1.4/1.1, 0/0/0.3, 1.8/0.7/0.4, 0/0.6/0.7% (step 32: 0/1.4/1.2, 0/0/0.4, 1.8/0.7/0.4, 0/0.6/0.7%) |
| step-35 | 2026-10-24 | off 1.1% (memory steering on; unchanged) | off 0.01 | off 0 | 8/12 | off 0.47 | off 1.34 | 1746 | REJECTED, kept off (`SCORECARD_MEMORY_STEER=on`): memory-kind stats (decay, retention, retrieval) allowed through the same gate, re-measuring step 22 after step 25's bug fix. Default memory, seeds 20261022 / 7 / 11 / 3: true directives +0 / +4 / +6 / +4 per 200 learners, false unchanged (0/1.4/1.1, 0/0/0.3, 1.8/0.7/0.4, 0/0.6/0.7%). FSRS-6 memory (`--memory=fsrs`, power-law forgetting): false directives 0.7 -> 2.7% at 30 levels (seed 7) and 1.7 -> 2.7% at 100 levels (seed 3), where all 3 memory directives fired were false. The exponential curve's learner multipliers are over-confident when real forgetting is power-law, so memory stats keep steering nothing until the curve's shape is checked on real memory tests |
| step-36 | 2026-10-24 | off 1.1% | off 0.01 | off 0 | 8/12 | off 0.47 | off 1.34 | 1746 | MEASUREMENT, no change to any score (round 6): the insertion contract. The sim reads every card through `contract.read` as well as `translate.directives`: 0 mismatches in sides or shape over 33,928 reads per seed (four seeds, both memories) and 28,711 (population of 20). translate.directives now also returns each directive's gate, posterior probability and evidence (no score or list changed). Also measured on the same code: a population of exactly 20 (the app's threshold): false 0/2.0/1.0, 1.6/0/0, 2.0/0/1.1, 0/0.7/1.4% (at the 2% limit, not over), true directives per learner 1.02 / 0.85 / 0.73 / 0.94 (population 60: 0.99 / 1.04 / 0.95 / 1.01); FSRS-6 memory, population 60: 0/1.3/0.4, 0/0.7/0.4, 0/0/0, 0/1.3/1.7% |
| step-37 | 2026-10-24 | — | — | — | — | — | — | — | REJECTED, kept at 20 (`SCORECARD_POPULATION_MIN=10`, population of 10): standings and population priors from 10 learners instead of 20, so the calibrated gate would switch on sooner in the tester phase. False directives 0/1.4/1.2, 0/0/0, 2.2/3.0/0.7, 0/0/1.8% (seed 11 over 2% at 10 and 30 levels), true directives per learner 0.93 / 0.84 / 0.56 / 0.73: fewer true and more false than at 20. The method-of-moments spread from 10 learners is too noisy |

## Round 2 (steps 7–12): notes

- **Step 7 changes the measuring stick, not the app.** Until then every simulated learner ran alone, so the app's population machinery (priors, prior strengths, rate norms, and now the shared item calibration and the fitted forgetting curve) never switched on — but in the app it does once 20 learners exist. The sim now first runs 60 learners of its own (own seed), keeps their cards as read-only "other learners", restores the shared tables before each measured learner and recomputes population figures per learner. On the step-6 code this alone moved false directives from 2.2% to 12.1% at 100 levels (fewer, and different, directives). `--population=0` reproduces the round-1 setting exactly; the app's first weeks (no population yet) are that setting.
- **Final state (step 12), false directives at 10 / 30 / 100 levels**: with a population 0.0% / 0.0% / 0.0% (6 / 4 / 36 directives over 200 learners, every model-read mode identical); with no population 0.0% / 0.0% / 0.0% (30 / 60 / 122 directives; step 6 in that setting: 4.5% / 4.5% / 2.2%, 44 / 66 / 94). No LLM-only directive in any mode; unmeasured-directive share 0.
- **Kept constructs at 100 levels, read off (step 6 → step 12)**: expertise 0.86 → 0.86, forgetting 0.36 → 0.51, reading speed 0.85 → 0.87, length 0.87 → 0.88, interest context 0.04 → 0.18, misconceptions 0.48 → 0.66, target difficulty 0.40 → 0.84, quit risk 0.46 → 0.73, rapid guessing 0.76 → 0.90, calibration 0.32 → 0.49, coach reliance 0.61 → 0.75, language level — → —. 7 of 12 at r ≥ 0.7 (was 4).
- **Tokens per tailored level**: 3,887 → 1,605 (291 not cacheable): the after-level read carries the 100-stat guide only when the learner wrote something, and the brief's scorecard section is empty when nothing is confident.
- **What is still short, and why.** Forgetting: an oracle that knows every review's true half-life structure and true ability reaches only r 0.65 at 100 levels on the fixed review schedule (most reviews land where recall is still ~0.75–0.9), so the lever is scheduling reviews nearer each learner's half-life, not the estimator. Interest context: ~10 experiments per learner per 100 levels (2–3 on interest examples even after weighting) cannot separate a per-learner effect of this size; the hierarchical estimator holds learners at the population answer instead of guessing. Calibration: one tap in three gives ~230 taps per 100 levels, and a learner who taps the same way every time has little resolution to measure; at 300 levels it reaches ~0.67. Misconceptions: 0.66, limited by slips and real misconceptions sharing one tag list. Language level: no channel in the app's data.
- The per-learner false directives are listed in each step's JSON (`false_list` per checkpoint) for diagnosis.

## Round 3 (steps 13–22): recall

Round 2 left false directives at 0 but directives rare: the app barely tailored. Round 3 measures recall as well. The harness now prints, per checkpoint: **true directives per learner** (a directive on the side the learner's true value is past the edge), **recall** (of the (learner, stat) pairs truly past an edge, on stats the app's data can show and with directive text on that side, the share that got that directive), and **learners with at least one true directive**. Step 12's code was re-measured with them (`SCORECARD_STANDING=off` reproduces the old gate exactly). All rows: 200 learners, seed 20261022, model read off (the three read modes give identical directives since step 2; the progress table above has all three), population of 60 for "population", `--population=0` for "no population".

| run | false dirs 10/30/100 (population) | false dirs 10/30/100 (no population) | true directives per learner 10/30/100 | recall (measurable extreme traits) at 100 | learners with a true directive at 100 | no population: true dirs/learner at 100 | kept r ≥ 0.7 (read off) | tokens per tailored level |
|---|---|---|---|---|---|---|---|---|
| step-12 (re-measured) | 0.0% / 0.0% / 0.0% | 0.0% / 0.0% / 0.0% | 0.02 / 0.02 / 0.12 | 1.4% | 10.0% | 0.48 | 7/12 | 1605 |
| step-13 | 0.0% / 1.2% / 0.5% | 0.0% / 0.0% / 0.0% | 0.04 / 0.32 / 0.67 | 7.9% | 50.0% | 0.48 | 7/12 | 1719 |
| step-14 | 0.0% / 1.2% / 0.5% | 0.0% / 0.0% / 0.0% | 0.04 / 0.32 / 0.67 | 7.9% | 50.0% | 0.48 | 7/12 | 1719 |
| step-15 | 0.0% / 1.3% / 0.6% | 0.0% / 0.0% / 1.5% | 0.05 / 0.29 / 0.64 | 7.6% | 50.0% | 0.5 | 7/12 | 1706 |
| step-16 | 0.0% / 1.3% / 0.6% | 0.0% / 0.0% / 1.5% | 0.05 / 0.29 / 0.64 | 7.6% | 50.0% | 0.5 | 7/12 | 1706 |
| step-17 | 0.0% / 0.0% / 0.5% | 0.0% / 0.0% / 1.5% | 0.14 / 0.45 / 0.76 | 9.0% | 54.5% | 0.5 | 7/12 | 1716 |
| step-18 | 0.0% / 0.0% / 0.5% | 0.0% / 0.0% / 1.5% | 0.15 / 0.45 / 0.76 | 9.0% | 55.0% | 0.5 | 7/12 | 1718 |
| step-19 | 0.0% / 0.0% / 0.5% | 0.0% / 0.0% / 1.5% | 0.15 / 0.45 / 0.82 | 9.8% | 58.5% | 0.5 | 7/12 | 1724 |
| step-20 | 0.0% / 0.0% / 0.5% | 0.0% / 0.0% / 1.5% | 0.15 / 0.45 / 0.82 | 9.8% | 58.5% | 0.5 | 7/12 | 1724 |
| step-21 | 0.0% / 0.0% / 0.4% | 0.0% / 0.0% / 1.5% | 0.18 / 0.47 / 0.85 | 10.1% | 59.5% | 0.5 | 7/12 | 1729 |
| step-22 | 0.0% / 0.0% / 0.5% | 0.0% / 0.0% / 0.0% | 0.18 / 0.47 / 0.82 | 9.8% | 59.5% | 0.15 | 7/12 | 1726 |

- **Step 13 is the main lever: a calibrated posterior gate.** A directive says the learner is unusual, so the gate asks where they stand among learners: each measurement with its own sampling noise, against the population's centre and true spread (empirical Bayes), widened for a behaviour–trait validity of 0.9, and a directive needs P(right side of the typical learner) ≥ 0.98 with a best estimate in the top or bottom fifth. The user's example gate, P(z beyond 0.88) ≥ 0.9, was measured too: 0.6% false and 0.56 true directives per learner, against 0.5% and 0.67. Without the validity margin the same posterior went 3% false (behaviours are not traits: help seeking leaks into coach reliance, a rusher's lucky fast answers into processing speed). The value paths that average several behaviours (attention runway, intake, momentum) went false when read as standings and keep the old gate.
- **Step 15 changes the measuring stick, not the app.** The client cannot finish a practice level halfway; an unfinished sitting stays open and is resumed, or closed as abandoned when another level is opened. The sim used to finish every quit sitting with its unanswered questions, which the app never does. Measured honestly, persistence fell from r 0.72 to 0.03: the app had never seen a quit. Step 16 records them (abandoned sittings, and a 30-minute break right after a run of misses inside a resumed sitting): r 0.68. `--abandon` sets the resumed/abandoned split (0.5, a guess).
- **Steps 17–21: better measurements of stats that already had a channel.** Answer pace for processing velocity (r 0.86 → 0.98, recall 0.56 → 0.93, and the one false directive left at every gate setting gone); frustration as a contrast (r 0.73 → 0.87, recall 0 → 0.52); placement read as 10 points of error (prior-knowledge recall 0.10 → 0.23); warm-up / fatigue / momentum as shifts against expectation (r up, no directives yet); mastery velocity from the slope of ability (r — → 0.5; its sampling error is still larger than the spread between learners at 100 levels).
- **Step 22: robustness across seeds.** The same code at seeds 7, 11 and 3 found three things the main seed did not: the forgetting model's posterior is over-confident (a learner of true decay 47 read z 2.2 ± 0.6), the inverted second reading of scroll-backs (text density tolerance) went false, and the no-population gate exceeded 2% at two seeds (2.7%, 2.8%: challenge taps and perfectionism). Fixed by: memory-kind stats and inverted second readings steer no lesson; the no-population gate applies the same trait rule. Cost: with no population, 0.50 → 0.15 true directives per learner. False directives after step 22, 10 / 30 / 100 levels:

| seed | population | no population |
|---|---|---|
| 20261022 | 0.0% / 0.0% / 0.5% | 0.0% / 0.0% / 0.0% |
| 7 | 0.0% / 0.8% / 0.0% | 0.0% / 0.0% / 0.0% |
| 11 | 1.9% / 0.0% / 0.4% | 0.0% / 0.0% / 0.0% |
| 3 | 0.0% / 0.7% / 0.5% | 0.0% / 0.0% / 0.0% |

  (Seed 11's 1.9% at 10 levels is one rush directive on a learner of true rush 49 among 27 directives; the remaining false directives are all on learners within 5 of the middle.) Validity 0.85 instead of 0.9 on the same four seeds: about 30% fewer true directives, no clear false-directive gain.
- **Where recall is now (step 22, 100 levels, per stat):** processing velocity 0.93 (72 directives), rush 0.65, hint dependency 0.56, perfectionism 0.55, frustration 0.52, brevity 0.51 (1 false), prior knowledge 0.23, misconception persistence 0.17, challenge appetite 0.09, consolidation 0.06, persistence (1 directive, r 0.68). Pooled recall over every measurable extreme trait is 9.8% because most measurable stats are still weak (r < 0.6) or have directive text on one side only.
- **What limits it now, and is not a code fix:** the product calls below; and information per learner (taps on one level in three, ~16 difficulty taps and ~10 experiments per 100 levels; a 10-question level holds 3 opening answers).

### Product calls, measured (not done; sim knobs only, same code as step 21, population of 60, 100 levels)

| call | how it was measured | effect |
|---|---|---|
| Confidence tap on every question (now one in three) | `--tap-rate=1` | calibration and self-monitoring r 0.50 → 0.59, 0 → 4 directives each (recall 0.24); overall true directives per learner unchanged (0.85) and false directives 2.1% at 100 levels on that random stream (hint dependency, rush, brevity near the middle) |
| More experiments (every tailored page, now one in three) | `PERSONALIZE_EXPERIMENT_RATE=1` | 10 → 30 experiments per learner; interest examples r 0.19 → 0.19; brevity recall 0.51 → 0.71; true directives per learner 0.85 → 0.88; false 0.8% |
| More and concentrated experiments (every page, nearly all on interest examples and length) | `PERSONALIZE_EXPERIMENT_RATE=1 PERSONALIZE_FOCUS_WEIGHT=100` | interest examples r 0.19 → 0.36, still no directive; experiment-stat mean r 0.12 → 0.17; true directives per learner 0.83; false 1.4% |
| Review scheduling that tests memory nearer its limit (FSRS-style) | `--review-pick=oldest` (the three skills practised longest ago instead of the due ones: a crude stand-in, not FSRS) | decay r 0.49 → 0.52; round 2's oracle bound on the fixed schedule is 0.65; the forgetting stats steer no lesson since step 22 in any case |
| A language-level channel | none possible: nothing the app records reflects reading level | vocabulary ceiling stays unmeasured (r —) |

## Round 4 (steps 23–28): learning outcomes, expertise against the course

Round 4 asks what the scorecard is for: does the level a learner gets teach them more, keep it
longer, in less time? The research behind it is section 7 of
`curriculum-build/SCORECARD-RESEARCH-2026-10-22.md`. All rows: 200 learners, seed 20261022,
population 60, model read off.

**New measurements (steps 23, 24; read only, no app change):**
- **Learning outcomes from true memory**: share of practised skills still recalled 7 and 30 days
  after the checkpoint with no more practice, practice hours, review answers, skills recalled at
  30 days per practice hour.
- **What directives are worth**: prior-knowledge and scaffolding-fade directives valued in d from
  the expertise-reversal meta-analysis (Tetzlaff et al. 2025: +0.505 full support to a learner at
  the low edge, +0.428 faded support to one at the high edge, negative on the wrong side),
  against an oracle giving every learner past an edge the right one; experiment stats by the
  sim's arm model.
- **Scaffolding fade gets a truth**: where the learner stands against the course at the
  checkpoint (true ability minus the course's difficulty for them, as a standing among the
  measured learners). It moves from LLM-only (now 41) to behavioural.
- Also printed: the standing posterior's own r, and the holdout comparison's power.

| run | false dirs 10/30/100 | true dirs per learner 10/30/100 | recall at 100 | learners with a true directive | expertise value, d per learner (oracle) | scaffolding fade r / directives | decay r | 30-day recall | skills retained per practice hour | kept r ≥ 0.7 | tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|
| step-22 | 0.0% / 0.0% / 0.5% | 0.18 / 0.47 / 0.82 | 9.8% | 59.5% | — | — / 0 | 0.49 | — | — | 7/12 | 1726 |
| step-23 | 0.0% / 0.0% / 0.5% | 0.18 / 0.47 / 0.82 | 9.8% | 59.5% | 0.0272 (0.0919) | — / 0 | 0.49 | 17.3% | 0.876 | 7/12 | 1726 |
| step-24 | 0.0% / 0.0% / 0.5% | 0.18 / 0.47 / 0.82 | 9.5% | 59.5% | 0.0272 (0.1975) | — / 0 | 0.49 | 17.3% | 0.876 | 7/12 | 1726 |
| step-25 | 0.0% / 0.0% / 0.5% | 0.18 / 0.47 / 0.82 | 9.5% | 59.5% | 0.0272 (0.1975) | — / 0 | 0.54 | 17.3% | 0.876 | 7/12 | 1726 |
| step-26 (rejected) | 0.0% / 0.0% / 0.5% | 0.17 / 0.46 / 0.81 | 9.6% | 58.0% | 0.0272 (0.0919) | — / 0 | 0.49 | 17.3% | 0.876 | 7/12 | 1724 |
| step-27 | 0.0% / 0.0% / 0.4% | 0.18 / 0.53 / 0.91 | 10.5% | 64.0% | 0.0841 (0.1975) | 0.79 / 28 | 0.54 | 17.3% | 0.876 | 7/12 | 1737 |
| step-28 | 0.0% / 0.0% / 0.4% | 0.18 / 0.54 / 0.92 | 10.7% | 64.0% | 0.094 (0.1975) | 0.79 / 34 | 0.54 | 17.3% | 0.876 | 7/12 | 1739 |

(Step 24 adds scaffolding fade to the pool of measurable extreme traits, so recall's denominator
grows: 9.8% -> 9.5% with no change in directives.)

- **Step 25, a bug fix.** `irt.js` packed each answer's context with the pace flag and the
  earlier-right count under the same key since step 17, so the forgetting model read 0 or 1
  earlier right answers and nearly every attempt as wrong. Decay r 0.49 -> 0.54. Step 22's finding
  that the forgetting posterior is over-confident was made on corrupted counts; memory stats
  still steer no lesson (a recall recap belongs in every lesson anyway).
- **Step 27–28, expertise against the course.** `irt.js` keeps per subject a faded mean (about
  100 fresh answers) of the logit of what the ability model expected of each fresh, unaided,
  non-rapid answer before it was seen: how far within reach the items the course serves this
  learner are. Read as a standing among the subject's learners it is scaffolding fade (low: keep
  full support; high: fade it), the one learner-by-teaching interaction with a replicated effect.
  A practice answer's subject is its sitting's (app rows carry `session_id`, not `track_id`; the
  sim's rows no longer carry `track_id` either, which changed no number). Seeds:

| seed | scaffolding directives (false) | false dirs 10/30/100, all stats |
|---|---|---|
| 20261022 | 34 (0) | 0.0 / 0.0 / 0.4% |
| 11 | 45 (1: a learner at 51) | 1.9 / 0.0 / 0.7% |
| 7 | 32 (0) | 0.0 / 0.7 / 0.0% |
| 3 | 30 (0) | 0.0 / 0.7 / 0.4% |

  With no population (`--population=0`): 0.0 / 0.0 / 0.0% false, 0.15 true directives per
  learner, as step 22 (reach needs a population). Measured and not kept: a 100-answer minimum
  (a false directive at seed 11); a tracking variance of 0.015 (below the Elo's own floor).
- **Not kept, reverted:** step 26 (exact rate model, above); storing each lesson page's
  next-level residual for the holdout report (in simulation it varies between pages as much as raw
  accuracy, 16.0 vs 16.2 points, because placement already pitches every learner near 70%).

### Product calls, measured (round 4; not done, the owner decides)

| call | knob | expected gain at 100 levels | cost / risk |
|---|---|---|---|
| Review scheduling by predicted recall (FSRS-style) | `--review-pick=model --review-target=0.85` (code as step 25) | 30-day recall 17.3% -> 24.6% (+42%), 7-day 37.4% -> 47.6%; 5% fewer review answers, same practice time; skills retained per hour 0.88 -> 1.26 (+43%); decay r 0.54 -> 0.53. Target 0.90: 24.7%, +3% reviews. Oracle half-lives (target 0.85, before the fix): 22.7% | review accuracy 61% -> 55%; false directives 0.9% (target 0.90: 1.8%) on the changed answer stream; changes `mastery.js` |
| A reading-level channel | `--reading-test=1` / `=4` (a calibrated test, ~10 points' error) | language level r — -> 0.85 / 0.95; kept constructs 7 -> 8 of 12; +16 / +32 true directives per 200 learners, none false | needs calibrated passage items; minutes of learner time per test |
| Confidence tap on every question | `--tap-rate=1` (step-27 code) | calibration r 0.50 -> 0.59, 4 directives (recall 0.24); true directives 0.91 -> 0.93 | false directives 1.9% at 100 levels: at the limit |
| Experiments on every tailored page | `PERSONALIZE_EXPERIMENT_RATE=1` (step-27 code) | brevity recall 0.51 -> 0.71; interest examples r 0.19 -> 0.19, no directive; true directives 0.91 -> 0.95; false 0.8% | 30-day recall 17.3% -> 16.9% |

Holdout power: next-level accuracy varies about 16–17 points between pages, so seeing a
5-point gain from tailoring needs about 160–190 pages per arm (roughly 1,600–1,900 tailored pages
at a 10% holdout). In the simulation tailored minus holdout is 0.1 ± 1.4 points: following the
directives does not change next-level accuracy here, because the sim has no model of that beyond
the experiment arms.

## Round 5 (steps 29–34): the curve for scheduling, confidence, language level

All rows: 200 learners, model read off (`--modes=off`), population 60, and every change run at
seeds 20261022, 7, 11 and 3; kept only with no regression and false directives at or under 2% at
10 / 30 / 100 levels at every seed. The research is section 8 of
`curriculum-build/SCORECARD-RESEARCH-2026-10-22.md`.

| run | false dirs 10/30/100 (seeds 20261022 / 7 / 11 / 3) | true dirs per learner at 100 | self-efficacy r / dirs | language level r / dirs | 30-day prediction MAE / bias / r (seed 20261022) | kept r ≥ 0.7 |
|---|---|---|---|---|---|---|
| step-29 (= step-28 code + export) | 0/0/0.4, 0/0.7/0, 1.9/0/0.7, 0/0.7/0.4 | 0.92, 0.95, 0.98, 0.90 | 0.29 / 0 | — | 0.100 / -0.087 / 0.80 | 7/12 |
| step-31 (measurement: text load) | 0/1.4/1.2, 0/0/0.4, 1.8/0.7/0.4, 0/0.6/0.8 | 0.94, 0.95, 0.90, 0.95 | 0.23 / 0 | — | 0.090 / -0.067 / 0.80 | 7/12 |
| step-32 | 0/1.4/1.2, 0/0/0.4, 1.8/0.7/0.4, 0/0.6/0.7 | 0.94, 0.95, 0.91, 0.96 | 0.23 / 0 | 0.72 / 1 (seeds: 0.72-0.80, 1 each) | same | 8/12 |
| step-34 | 0/1.4/1.1, 0/0/0.3, 1.8/0.7/0.4, 0/0.6/0.7 | 0.99, 1.04, 0.95, 1.01 | 0.77 / 8 (seeds 0.76-0.79, 8-23, none false) | 0.72 / 3 (seeds 2-4, none false) | same | 8/12 |

With no population (`--population=0`, step-34 code): 0 / 0 / 0% false at all four seeds, 0.20-0.24
true directives per learner (step 22: 0.15).

- **The export.** `scorecard.forgettingCurve({ userId, trackId })` (index.js) and
  `forgetting.recallAt` give adaptation.js the fitted curve and the learner's multiplier, with
  `DEFAULT_CURVE` and m 0 as the fallback. The sim reads it through the app path at every
  checkpoint and compares it with each learner's true recall of each practised skill.
- **Not kept (step 30, step 33):** spaced-answer terms in the curve (better calibrated, worse
  ranked, lower retention when reviews are scheduled by it); a power-law shape and a joint
  refit on the simulation's default memory (together: 30-day prediction MAE worse at three
  seeds, 0.083 -> 0.115, 0.085 -> 0.097, 0.088 -> 0.110, r down to 0.57 at seed 3; with reviews
  scheduled by it, 30-day recall +0.3 / -0.4 / -0.3 / +0.3 points); reach over 50 answers; taps aimed at harder
  questions (a product call: no calibration gain).
- **Robustness of the measuring stick (`--memory=fsrs`).** The round 1-4 memory model rewards
  massed practice (each right answer in a sitting multiplies the half-life by 1.3) and spacing
  modestly; FSRS-6's model, fitted to millions of Anki reviews, barely moves stability on a
  same-day review and multiplies it several-fold on a spaced one, and forgets by a power law. On
  that memory the app's exponential curve under-predicts 30-day recall by 0.34-0.46, and the
  outcome numbers change a lot (30-day recall about 54% instead of 17%). Directives and false
  rates barely change. Both memories are assumptions; the real one decides how big the
  review-scheduling gain is (below).

### Product calls, measured (round 5; not done, the owner decides)

| call | knob | expected gain at 100 levels (four seeds) | cost / risk |
| --- | --- | --- | --- |
| Review scheduling by predicted recall (FSRS-style) | `--review-pick=model --review-target=0.85` | default memory: 30-day recall +42% to +49% (17.3 -> 24.6, 16.4 -> 23.8, 15.0 -> 22.3, 14.5 -> 21.1%), skills retained per practice hour +43% to +48%, 5% fewer review answers. FSRS-6 memory: +7% (54.1 -> 57.9% etc.), +6% to +9% per hour, 11% fewer reviews; with a power-law curve and joint refit, another +0.5 to +0.7 points | false directives up to 1.8% (default memory) and 2.1% at 30 levels at one seed (FSRS-6 memory): at the limit on the changed answer stream; review accuracy falls (reviews come when memory is weaker); changes `mastery.js` / adaptation.js |
| A calibrated reading test | `--reading-test=1` / `=4` (round 4) | language level r 0.85 / 0.95 whatever the size of the wordiness effect; the in-app reading from wordy items (step 32) gives r 0.72-0.80 only if the effect is as assumed, about 0.5 at half, 0 without | minutes of learner time per test, calibrated passage items |
| Confidence tap on every question | `--tap-rate=1` (round 4) | calibration r 0.50 -> 0.59 (round 4); round 5 found no cheaper route: the same number of taps aimed at harder questions gave r 0.49-0.67 against 0.50-0.65, no directive. The trait (self-efficacy) needs no extra taps (step 34) | false directives 1.9% at 100 levels (round 4): at the limit; three times the taps |
| Experiments on every tailored page | `PERSONALIZE_EXPERIMENT_RATE=1` (round 4) | unchanged from round 4 (brevity recall 0.51 -> 0.71; interest examples still no directive) | 30-day recall 17.3% -> 16.9% |

## Round 6 (steps 35–37): the insertion contract, memory steering, population size

All rows: 200 learners, model read off, four seeds (20261022, 7, 11, 3), population 60 unless
stated. Raw outputs are in `round6/` (ref = step-34 code, s35 = memory steering on, reff / s35f =
the same on FSRS-6 memory, p20 = a population of 20, p10 = a population of 10 with a minimum of
10). The research basis and the contract: `curriculum-build/SCORECARD-EVIDENCE-REPORT.md` and
`docs/SCORECARD.md` ("The insertion contract").

| run | false dirs 10/30/100 (seeds 20261022 / 7 / 11 / 3) | true dirs per learner at 100 | kept |
|---|---|---|---|
| step-34 code (reference) | 0/1.4/1.1, 0/0/0.3, 1.8/0.7/0.4, 0/0.6/0.7 | 0.99, 1.04, 0.95, 1.01 | — |
| step-35 memory steering, default memory | 0/1.4/1.1, 0/0/0.3, 1.8/0.7/0.4, 0/0.6/0.7 | 0.99, 1.06, 0.98, 1.03 | no |
| step-34 code, FSRS-6 memory | 0/1.3/0.4, 0/0.7/0.4, 0/0/0, 0/1.3/1.7 | 0.96, 1.01, 0.98, 1.03 | (reference) |
| step-35 memory steering, FSRS-6 memory | 0/1.3/0.4, 0/**2.7**/0.4, 0/0/0, 0/1.3/**2.7** | 0.96, 1.01, 0.98, 1.03 | no |
| step-36 contract check (every run with it) | 0 mismatches in 33,928 reads per seed | — | yes (measurement) |
| population of exactly 20 (the threshold) | 0/2.0/1.0, 1.6/0/0, 2.0/0/1.1, 0/0.7/1.4 | 1.02, 0.85, 0.73, 0.94 | (measurement) |
| step-37 population minimum 10, population 10 | 0/1.4/1.2, 0/0/0, **2.2/3.0**/0.7, 0/0/1.8 | 0.93, 0.84, 0.56, 0.73 | no |

- **Kept:** the contract (`services/scorecard/contract.js`); each directive's gate, posterior
  probability and evidence returned by `translate.directives`; two env knobs that default to the
  old behaviour (`SCORECARD_MEMORY_STEER`, `SCORECARD_POPULATION_MIN`). No score, directive or
  false rate changed.
- **Rejected, with numbers:** memory steering (fine on the exponential memory, over 2% false on
  power-law memory, where all three memory directives at seed 3 were false: the curve's shape must
  be checked on real memory tests first); a population minimum of 10 (over 2% false at seed 11,
  fewer true directives at every seed).
- **Found:** at exactly 20 learners the gate holds at the 2% limit, not under it with room. The
  tester phase (3 scorecards in the database copy today) runs on the no-population gate, which
  was 0% false at all four seeds in round 5.
