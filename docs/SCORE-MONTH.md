# Scorecard in a learner's first month: direct measures, the learner's own card, outcome-tested decisions

Everything here is SIMULATED (learner kinds: ordinary, fast, slow, noisy, inconsistent, adversarial, child, sparse, random, extreme; 60 each; held-out seed 77123, run after the code was fixed on development seed 31001; the bandit's tempering and floors were tuned on the development seed only). No real learner is in any number. Real testers start 15 Nov. The simulation's truth is a latent number I draw, so every figure is "accuracy against a made-up truth", and the noise models are my assumptions (cited where a literature figure exists, flagged where it is my judgement).

## The plain answer

- **No group reaches 95 on the old metric (100 minus mean absolute error vs the latent truth) as a group average in one month.** Directly measured traits average 91.3 (guess 84.3), learner-confirmed traits 91.3 (guess 84.3), outcome-tested decisions pick the exactly best option 55% of the time (within 0.1 sd of the best: 85%), behaviour-only traits stay at 82.7 (guess 81.2; pipeline run, docs/SCORE-95.md).
- **Cells that do reach 95** (old metric, held-out): learner-confirmed traits for the `fast` kind (95.2) and `confidence_calibration` for `fast` and `adversarial` learners (95.4). `ordinary` learners are close (confirmed 94.8, `prior_knowledge` 93.9, `notation_comfort` 94.3). Nothing reaches 95 for child, sparse, noisy, inconsistent or random learners.
- **A second metric, shown beside the old one and never instead of it:** for preference and self-view traits the learner's own answer is the ground truth by definition, so "the card shows what the learner says" is 100% for every learner who answers. In simulation that is **92.1% of the 28 traits overall; 100% for ordinary, fast, slow, noisy and adversarial learners; 99.5-99.9% for child and inconsistent; 97.7% for random; only 24.2% for sparse learners** (they answer too few questions). This is a definitional metric: it says the card is not contradicted by the person, not that it predicts how they learn (Pashler 2008). The independent accuracy is the old-metric figure above.
- Where the work paid: error removed from the guess is 44.7% (direct) and 44.5% (confirmed) against 8.1% for behaviour only. Routing around behaviour inference moves the card from about 82.7 to about 91, not to 95.
- Why direct tasks stop at about 91: each task keeps a persistent task bias (device lag, strategy; nominal 5 points) that more sittings cannot average away, a bad-day term (6 points, averaged over the days it ran), and the 5% budget allows only about 6 sittings of each task; 95 needs a total error sd of about 6.3 points. Pre-checks split the same budget over three measures (about 2 blocks each), so `prior_knowledge` has reliability r2 0.50. Careless (random, noisy) and shortened (child) versions sit lower still.
- Honest negative: for `random` learners (answer noise sd 22, 30% careless) confirming makes the card WORSE than the guess (84.6 vs 86.8). The module assumes a nominal answer noise and does not yet detect a learner whose repeat answers disagree. See "Not done".

## 1. What was built (all behind `SCORECARD_MONTH=1`, default off)

| piece | file | what it does |
|---|---|---|
| Direct measurement | `services/scorecard/direct-tasks.js` | reading speed (wpm) on real lesson text (0 extra minutes), processing-speed and span tasks, adaptive Rasch pre-check per ability or objective (known / shaky / new / unsure), confidence calibration from ratings, per-learner forgetting multiplier from the learner's own reviews, reliability-weighted `combine` and `fuse`, child versions (fewer items, shorter lists), and a budget planner: at most 5% of study time, 3 task minutes and 2 blocks a day, none without consent |
| Learner-confirmed card | `services/scorecard/confirm-card.js` | 28 preference and self-view traits, at most 4 questions a day, 5 steps (3 for children), "is this right?" with corrections stored as evidence, re-ask after 12 days for traits answered once, `profileView` for the profile screen, stated personal answers (session length, best time, days a week, goal, retention horizon, device) |
| Outcome-tested decisions | `services/scorecard/decision-bandit.js` | 6 decisions (explanation style, example type, worked-first vs problem-first, spacing gap, chunk size, modality), a factorial Bayesian ridge fit on the learner's own lesson outcomes, Thompson draws on the joint posterior, a default floor for the first 12 lessons, a safety guard against options that look worse than the default, `best` with P(best) |
| New stats | `services/scorecard/learner-stats.js` | time-of-day, attention drop-off in minutes, slip vs misconception, device and input, schedule from `tutor-events.js`, retention horizon |
| Wiring | `decisions.js` (new exports `MODIFIERS`, `modificationPlan`, `planLines`; existing exports and signatures untouched), `month-stats.js`, `contract.js` | each stat to the content knob it moves; with the switch on, `contract.read` adds `month: { plan, lines }` (a separate field, not in `promptLines`, because those carry no numbers) |
| Simulation, test | `scripts/score-month-sim.js`, `scripts/score-month-test.js` (in `scripts/test-steps.json`) | |

## 2. Accuracy by group at day 30 (held-out seed 77123, SIMULATED)

| group | measures | n | guess | old metric: 100 - MAE | error removed | reliability r2 | reaches 95 in a month? |
|---|---|---|---|---|---|---|---|
| A. directly measured | 8 | 600 each | 84.3 | **91.3** | 44.7% | 0.69 | no (best cells: fast/adversarial calibration 95.4) |
| B. learner-confirmed | 28 | 16,800 | 84.3 (behaviour alone 85.4) | **91.3** | 44.5% | 0.64 | no overall; `fast` 95.2, `ordinary` 94.8; by-definition metric 92.1% |
| C. outcome-tested decisions | 6 | 3,600 | default is best 36.5% | exactly best **55.4%**, within 0.1 sd **85.2%** | regret 0.058 vs 0.178 (always default) | n/a | no |
| D. behaviour only | 64 (the rest, incl. the 12 benefit traits) | 80 learners, pipeline run | 81.2 | 82.7 | 8.1% | n/a | no (0 of 100 measures) |
| E. logged stats (new) | 3 | 600 | n/a | best part of day right 94.6% when confident (58.5% of learners get a confident pick); attention minutes accuracy 85.8% (mean error 2.9 min); 90.4% of labelled errors right (slip vs misconception) | n/a | n/a | no |

D is NOT re-simulated: it is quoted from `docs/SCORE-95.md` (30-day real-world pipeline run, held-out seed 71107). Group E error labels are scored against a ground truth I wrote into the sim, so 90.4% shows the rule works on data built like the rule assumes, not on real errors.


## 3. Bandit sensitivity (held-out seed, bandit only; effect size is the main assumption)

The simulated learner has a real option effect on 60% of decisions, sd 0.35 of the lesson-outcome noise (the rest near zero). Pashler 2008 found little evidence that a matched style helps, so this is the optimistic end. Within 0.1 sd of the best option (all decisions / decisions where the default is 0.1 sd short), bandit vs always-default:

| world | bandit | default | gain per lesson over default | learners losing more than 0.05 sd a lesson |
|---|---|---|---|---|
| effect 0.35, outcome noise 0.8 (headline) | 85.2% / 63.8% | 67.6% | +0.28 sd | 21% |
| effect 0.15 | 83.0% / 52.0% | 73.0% | +0.07 sd | 19% |
| effect 0.35, noise 1.2 | 79.9% / 55.7% | 64.7% | +0.23 sd | 22% |
| no real effect (0) | 100% | 100% | 0.000 | 0% |

So "equal or more retention" holds on average and in the no-effect world, but about a fifth of learners (those whose default was already best) pay a small exploration cost in the month. Tempered draws (0.5 x sd), the 12-lesson default floor and the safety guard were tuned on the development seed to bring that down from about 28-37%. Learners with fewer than about 12 lessons (sparse) get almost nothing from the bandit (gain 0.04 sd) and mostly the default. Picks the plan acts on (P(best) >= 0.7) were the exactly best option about 69-84% of the time; the probability is roughly calibrated (see the tier line below).

## 4. New stats and what each one moves

`decisions.js` `MODIFIERS` lists them; `modificationPlan(stats)` applies them and `planLines(plan)` writes them as prompt lines.

| stat | status | what it moves |
|---|---|---|
| reading speed (wpm) | NEW (`readingSpeed`) | words per chunk (about 75 s of reading, 80-400), re-read prompts |
| prior knowledge and mastery per objective | existed in `irt.js` and `mastery.js`; the adaptive pre-check and known/shaky/new/unsure states are NEW | which objectives are taught in full, refreshed or skipped |
| per-learner forgetting curve | existed (`forgetting.js`); `decayReading` adds a learner multiplier with its own sd, FSRS-style | review interval multiplier 2^m, clamped 0.5-2.5 |
| time-of-day performance | NEW | when to nudge (only when confident, gap 4+ points) |
| session length / attention drop-off | NEW (minutes) | maximum sitting length, break prompt at 80% |
| error type (slip vs misconception) | NEW | refutation with a contrasting case vs check-before-submit |
| confidence calibration | existed as a measure; direct bias and resolution from ratings are NEW | predict-then-check vs show past successes |
| device and input | NEW | tap over typed items, shorter prompts |
| availability / schedule | NEW, reads `tutor-events.js` | cram (test in 3 days or fewer), build (4-14), steady; coverage-first |
| goal / horizon | NEW (stated or from the calendar) | compress to the horizon, stop reviews after it |
| working memory and speed (direct) | existed as measures, now measured by task | one idea per step, no timed items |
| confirmed preferences | NEW | tone and framing sides |
| bandit picks | NEW | the six content decisions |

## 5. Switches and what to turn on

- `SCORECARD_MONTH=1`: the plan appears on the contract (`month` field) and `month-stats.planFor` works. Off by default. Turning it on alone changes nothing a learner sees: no screen or in-flow task uses the new modules yet.
- Recommended with it, from the earlier round: `SCORECARD_ACTIVE=1`, `SCORECARD_ANCHOR=0.25`.
- Consent: `boosters.allowed(user)` gates the card, tasks and bandit; under-13 without the parent agreement get logged stats only (no new channel). The tester-phase child-access rule in memory still applies.

## 6. Not done or not verified

- No real learner; every noise level is an assumption, the simulation shares assumptions with the modules, and the slip-vs-misconception rule was developed against sim data built the same way.
- No UI: the profile "Is this right?" card, the in-flow task widgets (span, speed, pre-check) and the confidence tap do not exist; the row store (`scorecard_month`) and the pure functions do. No route writes the confirm or bandit state yet.
- The plan reaches the contract only; lesson and material writers do not read `contract.month` yet (the build on `upload-4x-2` reads `decisions.js`; its exports are unchanged).
- `random` learners are made worse by the card: no check of the learner's own answer consistency yet. A pooled test-retest noise estimate per learner should set `sdScale`.
- Per-objective pre-checks are unit-tested but not in the simulation (the sim reads trait-level knowledge); `fromDb` assumes item field names that were not checked against live data.
- Group D is quoted, not re-run; the full 30-day pipeline (about 30 minutes per 120 learners) was not run with the new modules.
- Direct tasks use the whole 5% for about six sittings of each. More passive evidence (first attempts on tagged lesson items feeding the Rasch posterior at no study time) would raise `prior_knowledge`; not built.
- Reading-speed norms (Brysbaert 2019; Hasbrouck and Tindal) are quoted from memory, not re-read.

## Reproduce

```
node scripts/score-month-sim.js --seed=77123 --n=60 --md=out.md        (held-out; development seed 31001)
node scripts/score-month-sim.js --seed=77123 --n=60 --effect=0.15      (bandit sensitivity)
node scripts/score-month-test.js
```

## Full simulation output (held-out seed 77123)

Seed 77123, 60 learners per kind, 10 kinds (ordinary, fast, slow, noisy, inconsistent, adversarial, child, sparse, random, extreme). SIMULATED. Accuracy = 100 - mean absolute error in points vs the latent truth (the OLD metric); guess = the population mean.

#### A. Directly measured (8 measures, tasks inside the 5% budget, fused with a behaviour read)

| measure | n | guess | accuracy | error removed | reliability r2 | reaches 95 |
|---|---|---|---|---|---|---|
| processing_velocity | 600 | 84.1 | 93.0 | 56.2% | 0.83 | no |
| working_memory_span | 600 | 83.6 | 91.7 | 49.7% | 0.78 | no |
| prior_knowledge | 600 | 83.8 | 90.1 | 39.0% | 0.57 | no |
| vocabulary_ceiling | 600 | 84.6 | 90.7 | 39.6% | 0.57 | no |
| notation_comfort | 600 | 83.9 | 89.6 | 35.3% | 0.54 | no |
| confidence_calibration | 600 | 84.6 | 92.9 | 54.3% | 0.79 | no |
| decay_rate | 600 | 84.4 | 92.8 | 53.6% | 0.83 | no |
| retention_index | 600 | 85.0 | 90.7 | 38.0% | 0.69 | no |
| **mean** | 600 | 84.2 | 91.4 | 45.7% | 0.70 | |

Learner kinds whose accuracy vs the latent truth reaches 95 (kind mean over its 8 measures is not used; per measure):

| measure | kinds at or above 95 | best kind | worst kind |
|---|---|---|---|
| processing_velocity | none | slow 94.6 | extreme 89.8 |
| working_memory_span | none | fast 94.4 | sparse 88.0 |
| prior_knowledge | none | ordinary 93.4 | random 79.6 |
| vocabulary_ceiling | none | ordinary 94.3 | random 82.6 |
| notation_comfort | none | fast 94.8 | random 79.5 |
| confidence_calibration | ordinary | ordinary 95.3 | random 90.0 |
| decay_rate | none | fast 94.6 | extreme 87.5 |
| retention_index | none | child 92.9 | extreme 87.6 |

#### B. Learner-confirmed (28 preference + scale measures)

| measure set | n | guess | behaviour only | after card | removed | r2 | learner endorses card (within 10) | by definition: card shows the learner's own answer |
|---|---|---|---|---|---|---|---|---|
| 28 measures | 16800 | 84.4 | 85.5 | 91.3 | 44.0% | 0.63 | 64.2% | 92.2% |

Corrections: first answers corrected the shown number (15+ points) in 55.7% of cases, mean shift 17.8 points.

#### C. Outcome-tested decisions (6 decisions x 3 or 2 options, per-learner bandit, lesson outcomes)

| | all decisions | decisions that matter (default is 0.1+ sd below the best) |
|---|---|---|
| n | 3600 | 1165 |
| bandit picks the best option | 55.3% | 60.1% |
| bandit within 0.1 sd of the best | 85.2% | 63.8% |
| always-default within 0.1 sd of the best | 67.6% | 0.0% |
| default picks the best option | 36.8% | 0% |

Mean regret per decision at day 30 (sd units of lesson outcome): bandit 0.059, always default 0.168, random 0.178. Mean outcome gain per lesson of the bandit's assignments over the default: 0.278 sd; 21.2% of learners lost more than 0.05 sd per lesson net of the default; 31.7% of end-of-month picks were confident (P(best) >= 0.7, the level the plan acts on).

Picks by the probability they are best: P 0-0.5: n 880, best 41.5%, within 0.1 sd 78.0%; P 0.5-0.7: n 1567, best 51.9%, within 0.1 sd 83.9%; P 0.7-0.9: n 1045, best 69.0%, within 0.1 sd 92.0%; P 0.9-1: n 108, best 85.2%, within 0.1 sd 97.2%.

#### E. Logged stats (new, from the answer log, no study time)

| stat | n learners | result |
|---|---|---|
| best part of day | 600 | confident for 60.2%; right when confident 90.6%; right overall 79.3%; regret 0.2 accuracy points when confident |
| attention drop-off minutes | 600 | detected for 96.8%; mean error 2.9 min; accuracy (1 - relative error) 85.7% |
| slip vs misconception | 600 | classified for 100.0% of learners; of wrong answers labelled slip/misconception 90.3% right; all labels incl. unclear 83.8%; learner misconception share accuracy 95.6% |

#### By learner kind (A and B accuracy vs guess; C within-0.1sd vs always-default; budget share spent)

| kind | A guess | A | B guess | B | B endorse | B card = own answer | C bandit near-best | C default near-best | C gain/lesson | study time used on tasks |
|---|---|---|---|---|---|---|---|---|---|---|
| ordinary | 85.9 | 93.6 | 87.0 | 94.9 | 82.3% | 100.0% | 87.2% | 65.8% | 0.443 | 5.0% |
| fast | 86.6 | 93.9 | 86.3 | 95.1 | 82.7% | 100.0% | 88.6% | 66.9% | 0.361 | 4.8% |
| slow | 87.0 | 93.2 | 86.4 | 94.0 | 77.3% | 100.0% | 86.9% | 68.1% | 0.254 | 5.0% |
| noisy | 86.5 | 91.7 | 87.0 | 91.6 | 64.5% | 100.0% | 85.8% | 69.2% | 0.293 | 5.0% |
| inconsistent | 86.1 | 92.7 | 86.4 | 90.2 | 57.9% | 99.9% | 86.4% | 72.2% | 0.235 | 5.0% |
| adversarial | 86.5 | 91.3 | 86.3 | 90.8 | 60.2% | 100.0% | 87.5% | 68.3% | 0.374 | 5.0% |
| child | 86.4 | 91.4 | 86.8 | 90.5 | 57.4% | 99.4% | 81.7% | 67.2% | 0.191 | 5.0% |
| sparse | 86.6 | 90.4 | 86.5 | 88.8 | 52.3% | 24.4% | 73.6% | 63.1% | -0.013 | 5.0% |
| random | 85.2 | 87.2 | 86.6 | 84.2 | 39.0% | 98.5% | 84.4% | 68.1% | 0.262 | 5.0% |
| extreme | 65.5 | 89.0 | 64.9 | 92.5 | 68.6% | 100.0% | 89.4% | 67.5% | 0.380 | 5.0% |
