# The daily check in the live app (SIMULATED proof; no real-learner result yet)

Branch `scorecard-live`, 4 November 2026. Code: `services/daily-check.js`, `routes/daily-check.js`, `public/js/daily-offer.js`, `public/daily-check.html` (reuses the baseline page's step renderers, `public/js/baseline.js`), `scripts/daily-check-test.js`, and `--daily=1` in `scripts/scorecard-recovery-sim.js` (off by default: every committed baseline reproduces).

# Round 2 (4 November 2026, still SIMULATED; no real-learner result): item banks that carry signal

Round 1 ended with the daily check removing 8% of the error of the worst 10% of learners at 4.4 minutes a day (gate 30%: missed). Round 2 asks where the missing signal is, builds the sources that buy the most of it, and re-runs the proof at the middle and the LOW end of the section 6 reliabilities. **Every gain below depends on assumed validities. None is measured on a learner.** Part 1, the gap table, was written first.

## 1. The gap, by measure (day 30, round 1 dumps, 160 held-out learners)

Full table (every measure, S0, round-1 daily check, S5, and the S5 source that closes it): `docs/scorecard-live-gap-by-measure.md`. By source:

| S5 source | measures | S0 error | round-1 daily | S5 | gap S0 to S5 |
|---|---|---|---|---|---|
| COG (span, reasoning, switching) | 9 | 18.3 | 17.0 | 9.9 | 8.5 |
| CROSS (paired crossovers in lessons) | 23 | 17.7 | 16.8 | 7.9 | 9.8 |
| SCALE (agreement items) | 24 | 16.9 | 15.9 | 10.7 | 6.2 |
| PROBE (fixed probe items) | 6 | 17.9 | 17.4 | 8.6 | 9.3 |
| DELAYED (spaced retests) | 3 | 16.6 | 17.7 | 6.8 | 9.8 |
| the app already reads these | 35 | 13.6 | 13.4 | 8.7 | 4.9 |

Error points removable per learner-minute of daily measuring, from section 6's own minutes (a gap times the number of measures over the minutes the source costs): CROSS has no minutes but cannot be built as daily items (it lives inside lessons: 23 measures, 225 points, not built here); SCALE plus TAPS about 125 points per minute (3 minutes, and the taps also stand in for CROSS's measures); PROBE about 110 (needs lesson hooks, not built); COG about 38 (the span, speed, switch and series tasks it would use are already in the pool, so a new bank buys little); DELAYED about 29. **Chosen: SCALE and TAPS**, the two that can be daily items today and reach the most measures.

## 2. The banks (`content/daily-check/`)

- `scale-items.js`: 99 real IPIP items (public domain, ipip.ori.org), from Achievement-Striving, Anxiety, Anger, Self-Discipline, Orderliness, Self-Efficacy, Intellect, Need for Cognition, Imagination, Adventurousness, Cautiousness (NEO set), Curiosity and Love of Learning (VIA set), Curiosity, Competitive and Not Autonomous (HPI set), Perseverance (6FPQ set) and one Mastery item. Each carries its source page and the IPIP key sign. They were read from the IPIP key pages with WebFetch on 4 November (the fetch tool summarises pages: spot-check a sample against the live pages before any public claim). The sixteen sign-up items are not repeated. The mapping from scale to scorecard measure (31 measures) and each item's validity (0.12 to 0.3) are OUR design and ASSUMED. No scale with a licence fee is used (the MSLQ, AMS and similar of section 6 are not here).
- `tap-items.json`: 88 "which would you do next?" taps in our own wording for 47 of the 53 measures with no other carrier, every one `validated: false` and never described as validated. Writer DeepSeek V4.1 Flash, reviewer GLM-5.3 Flash (a different family; both through Munito), 106 written, 88 passed the reviewer's three checks (reading level across ages 8 to 70, no diagnosis or sensitive-trait wording, about the measure it claims). xKiro answered 503 and NVIDIA did not answer, so Munito was used (about a cent or two of the $100 ledger). A reviewer is a model, not a person: a human read of the bank is still owed. `scripts/build-daily-taps.js` regenerates it.
- The planner picks them like any other pool item (`dailyOnly`: the onboarding modes never see them), in families `scale` (ceiling 0.55, low end 0.45) and `tap` (0.67, low end 0.55): the square roots of section 6's reliabilities (0.3 and 0.45; low 0.2 and 0.3). The low end ("low6") also lowers every other family the check uses to the low end of its range.

## 3. Results (SIMULATED, held-out seed 424242, 160 learners: 122 extreme + 38 ordinary; day 30)

Ruler: accuracy = 100 minus mean absolute error of the card's numbers against the simulated truth; guess baseline = the population mean per measure; "worst 10%" = the learners the guess serves worst, the same learners for every row. This ruler differs from round 1's cross-fitted scorecard report (which gave 3% and 8% for the worst 10%), so round 1 is recomputed on it ("ROUND1"). The cross-fitted ruler was NOT re-run for round 2 (its calibration shards were cut to save time).

```
S0: n=160 acc 83.90 | worst10 acc 78.41 worst1% 76.68 | guess acc 81.90 (worst10 75.03) | removed mean 11.1% worst10 13.5% worst1% 14.9% | min/day mean 0.00 p90 0.00 max 0.00
ROUND1: n=160 acc 84.53 | worst10 acc 79.34 worst1% 77.42 | guess acc 81.90 (worst10 75.03) | removed mean 14.5% worst10 17.2% worst1% 17.6% | min/day mean 4.37 p90 4.49 max 4.62
NEW: n=160 acc 84.90 | worst10 acc 80.02 worst1% 77.78 | guess acc 81.90 (worst10 75.03) | removed mean 16.6% worst10 20.0% worst1% 18.9% | min/day mean 4.99 p90 5.11 max 5.24
NEW vs S0, accuracy points gained by kind: tail_hi +1.01, undefined +0.89, random +1.56, age_young +0.95, age_old +0.82, ell +1.17, tail_lo +0.92, contradict +0.84, tail_both +0.62; learners worse by >0.5 pt: 1
```

**Gate: worst 10% remove at least 30% of error at day 30, at 6.5 minutes a day or less, at the MIDDLE reliabilities. MISSED: about 20% (round 1's check, same ruler: 17%; the app before: 13.5%), at 5.0 minutes a day.** No kind of learner is worse than S0 on average (every kind gains 0.6 to 1.6 points); 1 learner in 160 is more than 0.5 points worse.

**Low end of the section 6 ranges** (the simulated world's families all at the low end, the planner still believing the middle values), first 9 of 16 shards (90 learners; the rest were still running when this was written). Gain over S0 in accuracy points, middle vs low end: mean 0.94 vs 0.80; worst 10% removed 19.8% at both. So about 15% of the mean gain disappears at the low end and the worst-10% figure does not move, **because the gain is small at the middle already**:

```
S0: n=90 acc 83.97 | worst10 acc 78.72 worst1% 75.99 | guess acc 82.00 (worst10 75.41) | removed mean 10.9% worst10 13.5% worst1% 11.4% | min/day mean 0.00 p90 0.00 max 0.00
NEW_middle: n=90 acc 84.91 | worst10 acc 80.28 worst1% 76.97 | guess acc 82.00 (worst10 75.41) | removed mean 16.2% worst10 19.8% worst1% 15.0% | min/day mean 4.99 p90 5.11 max 5.19
NEW_low_end: n=90 acc 84.77 | worst10 acc 80.27 worst1% 76.98 | guess acc 82.00 (worst10 75.41) | removed mean 15.4% worst10 19.8% worst1% 15.1% | min/day mean 4.99 p90 5.11 max 5.20
NEW_middle vs S0, accuracy points gained by kind: tail_hi +0.89, undefined +0.80, random +1.53, age_young +0.60, age_old +0.76, ell +1.29, tail_lo +0.95, contradict +0.80, tail_both +0.80; learners worse by >0.5 pt: 1
NEW_low_end vs S0, accuracy points gained by kind: tail_hi +0.61, undefined +0.63, random +1.37, age_young +0.50, age_old +0.63, ell +1.28, tail_lo +0.82, contradict +0.59, tail_both +0.81; learners worse by >0.5 pt: 3
```

**Day 180** (only 1 of 3 shards finished: 10 learners, so read it as an anecdote): the check keeps adding at 0.85 minutes a day averaged over 180 days (the planner stops when an item is worth less than its time):

```
S0_d180: n=10 acc 84.42 | worst10 acc 79.54 worst1% 79.54 | guess acc 83.73 (worst10 78.34) | removed mean 4.3% worst10 5.6% worst1% 5.6% | min/day mean 0.00 p90 0.00 max 0.00
NEW_d180: n=10 acc 85.39 | worst10 acc 80.85 worst1% 80.85 | guess acc 83.73 (worst10 78.34) | removed mean 10.2% worst10 11.6% worst1% 11.6% | min/day mean 0.85 p90 0.87 max 0.87
NEW_d180 vs S0_d180, accuracy points gained by kind: tail_hi +0.99, undefined +0.94, random +1.31, age_young +0.86, age_old +0.38, ell +1.40; learners worse by >0.5 pt: 0
```

**Tail shrink (part 3): built, not proven.** `DAILY_TAIL_K` / `--daily-tail=K` gives a reading far from the middle more weight (off by default; unit-tested). The held-out run with K = 0.5 (fixed before any run, no tuning) had not finished when this was written, so it stays OFF and no claim is made. Round 1's diagnosis (item validities too low, not the shrink) is also what these results point to.

## 4. What limits it, and what it costs a learner

- With honest per-item validities (a scale item 0.12 to 0.3, a tap 0.2) and the shared method error inside a family, about 9 items per measure over a month (the whole check is 150 minutes) read a measure at a reliability of about 0.2, which removes about 10% of its error. The designed plan's removal of about 45% assumes combined reliabilities of 0.45 to 0.7 (section 6): that is 3 to 5 times the information per minute, and no short item bank here supplies it. **The gap is the assumed validity, not the plumbing.** Closing it needs either real validities measured on learners (then the numbers can be set from data, up or down) or sources that read behaviour already happening (CROSS and PROBE inside lessons: 23 and 6 measures, zero or half a minute; not built).
- **Cost to the learner:** 5.0 minutes a day on average over 30 days (p90 5.1), 8% of a 60-minute study day (the sim's day); mean accuracy +1.0 point over the app before (about 0.2 points per daily minute), worst 10% +1.6 points. The previous check was 4.4 minutes for +0.6 mean. So by default I would NOT make it default-on for everyone; offer it, skippable, and make it a choice a learner can see the price of.
- Money: Munito about 2 cents of its $100 (tap writing and review, 14 calls); nothing else paid; no learner data left the machine.
- Not done: CROSS and PROBE, a human read of the tap bank, spot-checking the WebFetch-read IPIP stems against the live pages, Spanish (sealed), real learners.


# Round 1 (kept for the record)

## What it is

One small card (home page, end of a sitting, end of a base lesson), drawn after the page and only when the server says there is an offer; one tap on "Not today" hides it until tomorrow. It never blocks or delays a lesson. A run holds, in order: the memory check when one is due; a few of the sixteen IPIP items a day until all are answered; then the onboarding planner's own picks (span, speed, switching, reasoning items, forced-choice taps), each step the item removing the most uncertainty per second, with each measure weighted by how unsure the scorecard still is about this learner. Allowance: 10 minutes for the first 14 days, then 3 (design average 6.3 a day over the first month); the planner stops earlier when an item is worth too little. Evidence goes only through `scorecard/hooks.js` (`onDailyCheck`, `onQuestionnaire`, `onDelayedCheck`) into `scorecard.observe`, as designed-test observations, and only the precision a run added is fed.

Privacy unchanged: `boosters.allowed` gates every call (under-13 without `measurement_extras`: no offer, start, answer or skip). `SCORECARD_DAILY=off` restores today's behaviour exactly. No new collection: everything is in the profiles row (`boosters.daily`, `onboarding.known`), which deletion and the download already cover; both lists carry a comment saying so.

Not done: "which is clearer" was not extended (its pairs need a model writing them, which conflicts with "renders instantly"); the forced-choice taps are the onboarding pool's self-report pairs. The brain games stay on /boosters (the planner's span and speed tasks read the same traits). S1 (recalibration) was NOT put into the live read-out: see below.

## Results, day 30 (SIMULATED; 122 extreme held-out learners on seed 424242, 38 ordinary beside them; accuracy = 100 minus mean absolute error)

| | mean acc | worst 10% | worst 1% | guess baseline | error removed (mean) | removed, worst 10% | minutes a day used |
|---|---|---|---|---|---|---|---|
| S0, the app before | 82.9 | 78.1 | 75.9 | 80.5 | 12% | 3% | 0 |
| new default (daily check, all offers taken) | 83.6 | 79.1 | 76.4 | 80.5 | 16% | 8% | 4.4 mean over 30 days (p90 4.5, max 4.6) |
| new default, 50% of offers skipped | 83.6 | 79.0 | 76.9 | 80.5 | 16% | 8% | 2.9 mean (p90 3.4) |
| S5, the designed plan (analytic) | 90.4 | 88.2 | 87.4 | 80.5 | 51% | 43% | 6.3 |

By kind, the new default's S0 against the old (no kind is worse): tail_hi 84.4 vs 83.6, random 80.1 vs 79.2, age_young 85.2 vs 84.3, age_old 83.4 vs 82.9, ell 85.2 vs 84.7, tail_lo 85.0 vs 84.4, contradict 84.1 vs 83.6, tail_both 84.3 vs 83.8. Ordinary learners: 87.6 vs 87.1. The recalibrated read (S1, fitted on dumps from the same mode) would add about 1 point: 84.5 mean, 80.0 worst 10%, 21% removed (not built into the live read-out).

Gate: worst 10% remove at least 30% at day 30 within 6.5 minutes a day. **MISSED: 8% against 30%.** All tests pass (see the commit). Day 180: see the end of this file.

## What limits it (a diagnostic, 6 held-out learners)

The planner's own posterior, before the card's combining rules, has a mean absolute error of 11.9 to 22.0 points against the card's 11.4 to 21.1: it is no better than the card. So the feed into the card is not the loss; the information in 130 minutes of the onboarding pool is. Two causes, both testable: the items' validities are small (a forced-choice self-report pair is 0.25; every task is a single noisy draw), and the planner's model shrinks every learner toward 50 with a population spread of 17 points, which is wrong for exactly the learners with traits at the tails. Halving the offers changed nothing, which says more minutes of the same items add little; a different, more informative item mix or a wider prior is what could. The designed plan S5 gets 43% for the worst 10% because it uses a joint posterior and per-measure items that the onboarding pool lacks. These are simulated learners and ASSUMED validities (`services/onboarding/model.js`); none of this is accuracy on real people.

## Reproduce

```
node scripts/scorecard-recovery-sim.js --modes=off --no-write --population=30 --strata=1 --minutes-per-day=60 --days=30 --truth-factors=1 --daily=1 [--daily-skip=0.5] --learners=160 --extreme=1 --extreme-share=0.75 --seed=424242 --only=0,1,..,9 --dump=C.json
(and --learners=50 --seed=20261022 / 7 for the calibration dumps; then scripts/scorecard-90-measure.js and scripts/extreme-learners.js scorecard as in docs/EXTREME-LEARNERS.md section 6)
```

## Day 180

NOT run to completion. Three held-out shards (30 learners, `--days=180 --daily=1`) were started and had not finished when this was written (a 180-day shard takes more than an hour under load); no day-180 number is claimed. The command is the one above with `--days=180`.
