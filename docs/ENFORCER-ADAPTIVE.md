# Adaptive timing for scheduled retention enforcers

Owner, 8 Nov 2026: "I thought for the retention enforcers we were doing adaptive since it would yield better efficient results." Built behind a switch, then measured.

**All numbers below are SIMULATED (a forgetting-curve model with known learners). They are not proof about real learners.**

## What

Today the scheduled enforcers (semi-weekly, weekly, bi-weekly, monthly) fall on fixed days from the learner's anchor (`services/retention-schedule.js`). What goes inside an enforcer, and each skill's review timing, were already adaptive. This adds adaptive WHEN and HOW BIG for the scheduled enforcers only. End-of-session and end-of-day enforcers are unchanged.

## Switch

`ENFORCER_ADAPTIVE=on` (default off). Off is today's code path: the fixed-calendar tests (`retention-schedule-test`, `retention-enforcers-test`, `retention-goals-test`, `daily-plan-test`) pass unchanged, and `enforcer-adaptive-test` checks the off calendar is the fixed one.

## Rules (`services/enforcer-adaptive.js`, pure)

At the end of each day, with `gap` days since the last enforcer and `look` days to the learner's next likely study day (their recent rhythm, 1 to 7):

- A studied objective is at risk when its predicted recall at `look` days is under the goal's target (0.8, `GOAL_MEMORY`).
- Due when `gap >= 2` and (at-risk share >= 20% or at-risk count >= 4); or when `gap >=` the fixed calendar's longest gap for the types the goal keeps (4, 7, 14 or 36 days) and anything is at risk.
- Never on consecutive days unless at-risk share >= 50%.
- Size by need: quick under 25% at risk, medium under 50%, full above. The FULL_CAP share rule is kept, since budgets still come from `retention-params`. The type (S, W, B, M) is the smallest kept type whose window holds the days since the last enforcer; each window starts the day after the last one. One enforcer a day, so nothing is left to absorb.
- A goal that keeps no calendar types (a one-week horizon, a test date) gets no adaptive scheduled enforcers, as today. A test date's own reviews are unchanged in the app.
- The forecast (`forecast`) steps forward on the learner's usual rhythm, assuming each enforcer restores most of what was at risk, and gives the next 3 "about" dates.

## In the app (`services/enforcer-adaptive-app.js`, hooks in `services/enforcers.js`)

- The decision uses each objective's `adaptation.predictedRecall` (the number the enforcer already ranks by) over the work since the last decided day. A decided day is remembered by the enforcer row (its cover has `adaptive: true`), so there is no new collection and no migration.
- The offer is the adaptive cover; its tier is the default tier offered. The calendar (`/api/retention/calendar`, `public/js/calendar.js`) shows decided days as usual, later days as "~" with "about" in the label and list, and an adaptive legend. `scheduledToday`, `reachStart` and the end-of-day fold follow the same rule.
- Switching on mid-use works. Rows from the fixed calendar stay as they were and do not count as adaptive days.

## Simulation method (`services/enforcer-adaptive-sim.js`, `scripts/enforcer-adaptive-sim.js`)

Memory is the FSRS-4.5-style model of `retention-goal-sim.js` (same constants, a stand-in not fitted to Savant learners). One scenario is one learner on one goal. The learner studies on some days (own rhythm, breaks, cramming), learns items on 60 days, and keeps studying review-only after that. Both sides share the daily review (items under 0.85 recall), the learner, the study days and per-item per-day random draws (common random numbers). The only difference is when an enforcer is due and its size.

- Fixed: the real calendar for the goal's kept types (`keptTypes`); a test date uses `datePlan`. Baseline tier is a parameter: quick, medium (main row) and full are all reported.
- Adaptive: this rule. The policy sees each item's stability with +-30% error (it is an estimate, not the truth). For a test date the final and day-of reviews stay and only the mid reviews are adaptive (simulated only: the app leaves date-goal reviews alone).
- Enforcer content: items answered since the window start, weakest first under 0.95 recall, until the tier's `budgetMs`.
- Measured: each item's recall at its goal date (learned + horizon; the test date; "forever" at 180 days), before any review that day.
- Learners: the 5-learner panel, 8 extremes (fast and slow forgetters, daily heavy, rare study, long breaks, two breaks, rare fast-forgetter, strong irregular) and N seeded random learners (all traits, study rate 10 to 100%, optional break). Goals: 7 days, 30 days, 90 days, 365 days, forever, test date at day 28 (cramming: sparse study, then daily in the last 8 days).
- Dev seed 20261108 (25 learners, 150 scenarios) was used to try thresholds. A sweep of target and share thresholds changed nothing material, so the defaults stand. **Final numbers: held-out seed 7771117, 93 learners, 558 scenarios**, never used for tuning.

Run: `node scripts/enforcer-adaptive-sim.js --seed 7771117 --random 80`

## Numbers (held-out seed 7771117, SIMULATED, per scenario means)

"Min" is enforcer minutes. "Total" is enforcer plus daily-review minutes. "Equal+" is the share of scenarios where adaptive recall is within 0.01 of fixed or better. "Win" is the share that is also not more enforcer minutes.

| vs fixed at | n | enforcers fixed | adaptive | min fixed | adaptive | total fixed | adaptive | recall fixed | adaptive | equal+ | win |
|---|---|---|---|---|---|---|---|---|---|---|---|
| quick | 558 | 44.3 | 18.8 | 16.2 | 8.8 | 404 | 405 | 0.912 | 0.912 | 100% | 80% |
| medium | 558 | 44.3 | 18.8 | 35.8 | 8.8 | 407 | 405 | 0.913 | 0.912 | 98% | 94% |
| full | 558 | 44.3 | 18.8 | 57.2 | 8.8 | 411 | 405 | 0.913 | 0.912 | 93% | 92% |

By goal (against medium):

| goal | enforcers fixed | adaptive | min fixed | adaptive | total fixed | adaptive | recall fixed | adaptive | equal+ |
|---|---|---|---|---|---|---|---|---|---|
| 7 days | 0 | 0 | 0 | 0 | 253 | 253 | 0.889 | 0.889 | 100% |
| 30 days | 19.6 | 12.1 | 28.6 | 11.8 | 345 | 342 | 0.900 | 0.900 | 98% |
| 90 days | 42.8 | 19.6 | 55.2 | 11.4 | 476 | 472 | 0.930 | 0.929 | 94% |
| 365 days | 128.2 | 47.9 | 63.3 | 12.4 | 727 | 724 | 0.929 | 0.929 | 98% |
| forever | 70.5 | 29.4 | 59.6 | 12.0 | 588 | 584 | 0.928 | 0.928 | 97% |
| test date | 5.0 | 3.9 | 8.1 | 5.2 | 53 | 52 | 0.898 | 0.897 | 100% |

Worst individual scenarios (adaptive vs fixed medium):

- Worst recall change: rand-72 on "forever", recall 0.879 adaptive against 0.901 fixed (-0.022), using 38.9 enforcer minutes against 210.4.
- Worst time change: fast-forgetter-rare on the test date, 16.6 enforcer minutes against 7.6 (recall 0.881 against 0.882).
- Lowest recall on either side: rand-31 on the test date, 0.518 on both, with no enforcers (a learner who barely studies before a test; timing does not help it).
- Forecast: the "about" date named 3 or more days ahead is exact 70% of the time and within one day 93% (7,105 forecasts).

## What it shows, plainly

1. Adaptive meets the owner's retention test: recall at the goal date is equal to fixed (mean 0.912 against 0.913; 98% of scenarios equal or better within 0.01; the worst scenario is -0.022).
2. It cuts enforcers by 58% (18.8 against 44.3) and enforcer minutes by 75% against the medium tier (8.8 against 35.8), 46% against quick, 85% against full. For nearly every scenario (94%) it is equal recall and not more enforcer time.
3. **It does not cut total study time.** Minutes the enforcers no longer take come back as daily-review minutes: enforcer plus review is 405 against 407 minutes (medium), within 1%. In this model an enforcer mostly pre-empts a review the learner would have done anyway, and recall at the goal date is almost the same with any of the three baseline tiers. So the gain is fewer, better-timed sittings, not less time overall or better retention.
4. The recall result rests on a model with the same weak spot as the baseline: it says enforcers add little recall once the daily review runs, which may not hold for real learners (who skip reviews).

## Limits

- Simulated only, with FSRS defaults not fitted to Savant learners. The policy gets item stability with +-30% noise, not the app's real prediction error.
- The in-app version has never run on a real learner. The test covers one learner with a fixture on one subject; it does not cover several subjects with different goals together.
- Date-goal mid reviews are adaptive in the simulation only; the app still uses `datePlan` for them.
- With no study for many days the decision is made on the next day the learner returns (as the fixed calendar offers a missed one late). Windows start the day after the last decided day, so a long break makes one large window.
- The forecast is a heuristic: its later dates are less certain than the first, and it ignores new material.
- Switching on or off mid-use leaves earlier rows as they were.

## Recommendation

Keep it off by default. It is safe to turn on for a test group if the owner wants fewer, larger sittings (58% fewer in the simulation), but the simulation does not show less total time or better retention, and it has no real-learner evidence. Revisit once real learners' recall checks exist.
