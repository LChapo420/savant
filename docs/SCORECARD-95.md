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
