# The daily check in the live app (SIMULATED proof; no real-learner result yet)

Branch `scorecard-live`, 4 November 2026. Code: `services/daily-check.js`, `routes/daily-check.js`, `public/js/daily-offer.js`, `public/daily-check.html` (reuses the baseline page's step renderers, `public/js/baseline.js`), `scripts/daily-check-test.js`, and `--daily=1` in `scripts/scorecard-recovery-sim.js` (off by default: every committed baseline reproduces).

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
