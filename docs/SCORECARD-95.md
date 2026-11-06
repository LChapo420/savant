# Toward 95% at one month (SIMULATED; no real-learner result)

Branch `scorecard-95`, 5 November 2026. Every number is simulated, calibrated on simulated truths. Ruler: the one in `docs/SCORECARD-LIVE.md` section 3 (accuracy = 100 minus a learner's mean absolute error over the card's measures against the simulated truth; guess = calibration population mean per measure; worst 10% / 1% = the learners the guess serves worst, the same learners in every row; removed = 1 - error / guess error).

## What was built
- `services/scorecard/readout.js`: S1 (per-measure ridge on the card's measured value and confidence, or as-is, or the mean, whichever held out best) behind `SCORECARD_RECAL=1`; S2 (joint regression over all S1 reads) behind `SCORECARD_JOINT=1`. Both need a fitted artifact (`data/scorecard-readout.json`); without it or the switch the card is unchanged (tested). Hooked into `scorecard.read`; the raw score is kept as `raw_score`.
- `scripts/scorecard-95-fit.js`: fits on calibration dumps, scores a held-out dump (S0, S1, S1f = with answer-log features, S2, S2f, guess), by kind and age band.
- PROBE and CROSS as passive zero-minute items (`ps:probe|cross:<measure>:<slot>` in the pool, `passiveFor(day)` in `services/daily-check.js`, `DAILY_PASSIVE=1` / `--passive=1`). The plumbing and planner side exist; the producers (a lesson hook that turns a probe or paired-version result into a reading) are NOT wired, and in the simulation their validity is an assumption (item 0.2, family ceiling 0.67, low end 0.55). So that run is the assumption, not evidence.
- Part 3: `services/scorecard/readout-refit.js`, `scripts/scorecard-95-refit.js`: from real tester records (card reads, anchors from delayed outcomes or designed items, split halves) it measures each source's split-half reliability, correlation with the anchor and disattenuated validity next to the assumed ceiling, refits S1, and writes a markdown report. Guards: account 6689 and records not marked shareable never enter; fewer than 40 learners moves nothing; each measure moves only as far as keeps the 99th percentile change under 4 points and the largest under 8 (mix of old and new model, reversible). Tested on synthetic data (`scripts/scorecard-95-test.js`, in `npm test`).

## Results, NEW held-out seed 95095, 160 learners (122 extreme + 38 ordinary-ish), day 30, daily check on (about 5 min a day, unchanged), middle reliabilities
Calibrated on seeds 424242, 7 and 20261022 (not 95095).

| row | accuracy | worst 10% | worst 1% | removed | removed worst 10% |
|---|---|---|---|---|---|
| guess | 82.20 | 75.33 | 73.68 | 0 | 0 |
| S0 (app plus daily check) | 85.22 | 81.11 | 79.90 | 17.0% | 23.4% |
| S1 recalibrated (live path) | 86.20 | 83.08 | 81.64 | 22.5% | 31.4% |
| S1f with answer-log features (not wired live) | 86.69 | 83.58 | 82.10 | 25.2% | 33.4% |
| S2 joint | 85.99 | 81.69 | 80.72 | 21.3% | 25.8% |

S1 holds on the held-out seed and gains about 1.0 point; 4 learners in 160 are more than 0.5 point worse. S2 does NOT beat S1 (it helps ordinary learners, 89.0 against 88.7, and hurts the random and tail kinds); it stays off. Per kind and age band: `node scripts/scorecard-95-fit.js ... --json`. On an earlier dev check (calibrated only on ordinary learners, scored on the extreme seed) S1 still gained +1.0 and every S2 setting tried lost to S1 on extremes: a joint model shrinks tail learners toward the middle.

**Tail shrink (`--daily-tail=0.5`): finished only in part (80 of 160 learners).** S1 on those: 85.52 against S0 85.28; 19 of 80 learners worse by more than 0.5 point. Not shown better; stays OFF.

**PROBE and CROSS (`--passive=1`): 120 of 160 learners.** S0 85.41, S1 85.90, removed 18.4% / 21.1%. A different subset of learners from the base row, so not comparable to it; no gain can be claimed, and none could be proven anyway because the validity is assumed.

NOT run (budget of tool calls): day 180, the low-reliability worlds on this seed, a full-seed passive/tail run. Round 2 of `SCORECARD-LIVE.md` gave day 30 low-end about 15% less gain than the middle; S1's gain should be expected to shrink the same way.

## How far from 95, and what would close it
Best honest row: 86.2 (S1), 86.7 with log features not yet live. That is 8 to 9 points short. 95 is not reachable by these means: the missing piece is information, not calibration. About 9 items per measure a month read at reliability near 0.2, and recalibrating or pooling the same reads recovers about a point. Only real validities (the part 3 path, once testers exist) can show whether the assumed 0.45 to 0.7 combined reliabilities of the designed plan (S5, 90.4 on assumed quality) exist at all; SCORECARD-90 10.1 found only dividing every source's method error by 5 reaches 95.

## If real learners differ from the simulation
S1 coefficients encode the simulated card's bias and noise. A card that is better or worse than simulated makes S1 wrong in proportion; the safe fallback is its own as-is/prior choice, which the fit picks per measure by cross-validation, and the refit path replaces the simulated fit with real data in capped steps. Do not enable `SCORECARD_RECAL` for real learners before a real refit has run.

---

# Round 2 (6 November 2026): more real signal, new held-out seed 61106 (SIMULATED; no real-learner result)

Same ruler as above. Calibration: seeds 424242 (160 learners) and 424243 (80), day 30, daily check on. Held-out: NEW seed 61106, 80 learners (75% extreme: tails, contradictory mixes, ELL, ages 8 to 60+; 22 ordinary), never used to choose anything: the feature list, ridge settings and switches were fixed before it ran. Dumps and job lists: `C:/coding/savant-wt/_sim-61106/` (outside the repo).

## What was built
- **Merge fix:** the passive probe/cross items (zero seconds) now live in `pool.passivePool`, not `pool`, so the planner, `unlockedFree` and every timed-item check see exactly main's pool; `model.js` keeps `pessimistic === TODAY_RHO`, the low end in `low6`, no change to `eff`. `onboarding-test.js` is green again.
- **Answer-log features live (`SCORECARD_LOGFEAT=1`, OFF):** `services/scorecard/log-features.js` reduces the learner's own items and sittings (nothing new is stored) to 16 + 21 features and passes them to `readS1`; under 20 answers it passes none. The 21 new ones are within-learner contrasts: first item vs rest (warm-up), first answers after a 2+ day gap vs under a day, after 3 right in a row, after a skill switch, time after a miss, spread of times, hard vs easy, hour-of-day spread, sitting length and its spread, slowing inside a sitting, review vs new, changes on multiple choice, rapid answers among misses, coach use after a miss, accuracy trend, time on rights vs wrongs, skill breadth, "sure" among wrongs, typed vs choice time, night share. Needs `SCORECARD_RECAL=1` and a fitted artifact as before. Test: `scripts/scorecard-logfeat-test.js`.
- **PROBE and CROSS, what is actually wired:** the practice planner already puts due reviews first in every sitting, so the PROBE contrasts (warm-up, re-entry after a gap, momentum, interleaving, rhythm) exist in ordinary logs and are now produced by the log features above, not by a separate reorder. CROSS (paired lesson versions) already exists live as the 22 experiments (`personalize.armFor`; every tailored page in max-accuracy mode). A reorder-based probe and a dedicated paired-version producer were NOT built: the passive `ps:` items still run on an assumed validity only.
- **Channel audit:** `scripts/scorecard-95-audit.js` -> `docs/scorecard-95-channels.md`. Every one of the 100 measures is named by some reader (answer-log rule, experiment, questionnaire/task, chat or text, footprint, memory model), so none is unreadable; the gap is how little each read removes: 71 of 100 remove under 15% of the guess error at day 30 and 18 remove under 5% (session_rhythm, scaffolding_fade, attention_runway, step_explicitness, repetition_tolerance, retrieval_strength, decay_rate, retention_index, momentum_dependence, novelty_hunger, interest_transfer, deductive_trajectory, praise_sensitivity, logical_rigor, mnemonic_receptivity, interference_susceptibility, enactive_encoding, emotional_engagement). 20 of the 21 new contrasts target a measure from that weak list or the behaviour measures near it; 52 of the weak measures (mostly lesson-style and attitude measures: humor, narrative, tone, chunking, jargon, example density) have no behavioural contrast at all and can only be read by paired versions, chat or questionnaires.

## Results, held-out seed 61106, day 30 (accuracy = 100 - mean absolute error; worst 10% = 8 learners, worst 1% = 1 learner, the same learners every row)
| world | row | accuracy | worst 10% | worst 1% | error removed | removed, worst 10% |
|---|---|---|---|---|---|---|
| middle | guess | 81.60 | 74.84 | 73.94 | 0 | 0 |
| middle | S0 card as is | 84.78 | 80.53 | 82.66 | 17.3% | 22.6% |
| middle | S1 recalibrated | 86.01 | 82.65 | 85.14 | 24.0% | 31.0% |
| middle | **S1f + log features (new, live behind the switch)** | **86.59** | 83.43 | 86.83 | 27.1% | 34.1% |
| middle | S2 joint (stays off) | 85.54 | 81.92 | 87.07 | 21.4% | 28.2% |
| low (all reliabilities at the low end) | S0 | 84.60 | 80.22 | 82.19 | 16.3% | 21.4% |
| low | S1 | 85.77 | 82.32 | 84.59 | 22.6% | 29.7% |
| low | **S1f** | **86.34** | 83.11 | 86.28 | 25.8% | 32.9% |
| middle, experiment on every tailored page (CROSS at full rate) | S0 | 84.93 | 80.76 | 82.74 | 18.1% | 23.5% |

By kind and age band (S1f is in the JSON, S0/S1/S2/S2f in `fit30.txt`): every kind gains over S0 with S1 (ordinary 87.5 -> 88.4, random 80.6 -> 82.4, contradictory 84.3 -> 85.4, tail_both 84.6 -> 86.1, ELL 86.0 -> 86.6, age_old 85.1 -> 86.4); ages 8-12 86.8, 18-29 86.9, 30-59 85.4, 60+ 85.3, 13-17 87.8 (S1). No learner is more than 0.5 point worse than S0 with S1; S2 hurts 7 and stays off.

Day 180 (24 held-out learners, one shard, calibration only the 30 older day-180 learners without the new features, so S1f = S1): guess 80.90, S0 83.98, S1 84.38, removed 16.1% / 18.2%, worst 10% 78.8 / 79.6. Too small to rank anything; it shows no gain from time (day 30 is not worse).

What the numbers say:
- The log features add +0.58 on the middle world and +0.57 on the low world over S1 (the older 16 features alone were +0.5): small, but the same sign on the earlier seed and on a calibration-internal check, and they help the worst 10% (+0.8). A third more error removed than S0 at best (27%), not the 79%+ that 95% needs.
- Running an experiment on every tailored page adds +0.15 to S0 and moves nothing else. The experiments' per-learner readings are too thin at day 30, and S1/S1f fitted on the ordinary-rate world fit the max-rate card worse (S1f 85.85), so no gain is claimed.
- **Distance from 95: 8.4 points (middle), 8.7 (low), 11.0 (day 180, n = 24). Nothing here closes it.** 95% needs the card to remove about 72% of the guess error; the best row removes 27%. What would: real validities for the paired-version and probe channels (not assumed ones), more tailored pages that are experiments from day 1, and the part 3 refit on real testers. Do not call any of this real accuracy.

NOT run: day 180 for the low world and for the max-experiment world; full-size day 180 (24 learners only, so no tail statistic means anything: worst 1% is one learner at every n here); a calibration for day 180 with the new features (needs about 4 more hours of simulation).

Switches: `SCORECARD_RECAL`, `SCORECARD_JOINT`, `SCORECARD_LOGFEAT`, `DAILY_PASSIVE` all OFF by default; with them off the card is byte-identical to main (tested). They stay off: the gate (95) is not met and the fits are on simulated learners.
