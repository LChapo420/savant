# Retention goals

Owner's rule (2 Nov 2026): the learner chooses how long they want to remember each subject and each uploaded course, and
everything is scheduled for that goal, so no time goes on remembering longer than they need.

All numbers below are **SIMULATED**: a forgetting-curve model with learners whose parameters are known. They show that the
schedule does what the research says it should; they are not proof about real learners. Reproduce with
`node scripts/retention-goals-sim.js` (deterministic; `--gate` is part of `npm test`).

## What the learner sees

Profile page, "How long to remember": every subject (enrollment) and every uploaded course, each with a choice and a plain
sentence about what it does.

| Choice | Meaning |
|---|---|
| A test on a date | a date picker (today to 3 years ahead); the plan is compressed to the date |
| A few months | 90 days |
| A year | 365 days |
| Years | 3 years |
| Forever | the default for every subject (shown as "(default)" for Maths, English, IQ and Spanish and for courses), and for anything with no goal set |

- Easy to change later: the same card, Save.
- After a test date passes the card asks "Keep this?" (forever, years, a year, a few months, or stop reviews). Until the learner
  answers, the subject carries on as forever, so nothing is dropped silently.
- ACT with a test date on its ACT profile reads as a test on that date unless the learner sets a goal.
- The calendar marks the owner's enforcer days that a goal does not need ("not needed for your retention goal") and the API lists
  the test-date reviews coming up (`goal_reviews`). The retention state carries the nearest test date (`test`) for the daily plan.

API: `GET /api/retention-goals`, `PUT /api/retention-goals` (`{kind: 'enrollment'|'material', id, horizon, test_date}` or
`{kind, id, keep_after}`), `GET /api/retention-goals/preview`.

## What a goal changes

**Forever** keeps the owner's enforcer calendar exactly (semi-weekly, weekly, bi-weekly, monthly: `services/retention-schedule.js`
is untouched, and for a learner with no goals every code path in `services/enforcers.js` is the old one; `retention-enforcers-test`
still passes unchanged, 140 checks).

**A horizon** (months, year, years): an enforcer type is kept while its spacing is at most `GAP_MAX` (35%) of the horizon.
Cepeda et al. (2008) and Rohrer and Pashler put the best gap at roughly 10-20% of the retention interval; 35% is as far as the
simulation allows. The first version used 25%, which dropped the monthly at 90 days; the simulation showed the
average and below-average learners' recall at 90 days falling (93.6% to 93.0%, 92.6% to 91.7%), so the monthly stays for any
horizon of 86 days or more. Reviews of the subject's older work stop once the objective was proven more than the horizon ago
(`adaptation.dailyReview`), and an uploaded course's reviews stop once the next one would land past the horizon.

**A test date** replaces the calendar types for that subject with `datePlan`:

- a review about every 15% of the time left (never under 2 days), each over the work since the last one;
- a final review the day before, over everything done in the subject, weakest first (the enforcer already ranks by predicted forgetting);
- a short review on the day of the test; nothing after it.

Examples: 10 days left gives reviews on days 2, 4, 6, 8, the final on 9 and the day-of on 10; 30 days left gives one every 5 days.
These are ordinary enforcers (covers marked `goal`, one per window, sized by the same budget rules and the 9.5% cap). The
end-of-day enforcer stays for every subject, and a mixed learner (test date on one subject, forever on another) gets both: each
subject's work is asked about only by the enforcers its own goal keeps. An uploaded course with a test date has its review
interval cut to at most a quarter of the time left, the next-to-last review set to the day before and a short one on the day.

**Re-teaching** a forgotten objective takes 40% of the usual time with 3 days or fewer to the test, 50% within a week, 75%
within a month. **Mastery thresholds and level gates are not changed** (a goal never makes a gate easier).

**Write-ahead:** with equal priority, the subject whose test is nearer is written first; no test date sorts last.

## Which enforcers are dropped, by horizon

| Goal | Owner's calendar types dropped | What replaces them |
|---|---|---|
| Forever | none | nothing: the calendar as it is |
| Years (3 y) | none | reviews stop 3 years after the objective was proven |
| A year | none | reviews stop 1 year after |
| A few months (90 d) | none (dropping the monthly lowers simulated recall) | reviews stop 90 days after |
| Test on a date, any distance from tomorrow to 4 months | semi-weekly, weekly, bi-weekly, monthly (all four) | the compressed plan above |

For a horizon shorter than the choices offer (the function is general), the wide types go first: a 20-day horizon keeps
semi-weekly and weekly and drops bi-weekly and monthly; under 7 days it drops them all.

## SIMULATED results

Model: FSRS-4.5-style memory (power-law forgetting, stability grows more when a review comes at lower recall: the spacing effect).
Five learners with known parameters (strong, above-average, average, below-average, struggling), 120 items each, a fixed seed. Today's schedule = the owner's calendar
(the real `retention-schedule.js`) plus the daily review (an item is asked when recall is under 0.85), forever; an enforcer asks
only items under 0.95 recall. A goal's schedule is what the app does for it. Minutes are model minutes per item learned
(35 s a question, 3 s feedback right, 25 s wrong, one retry on a wrong one). Recall is at the target (horizon end, or the test, after the day-of review).
Minutes "to target" count reviews up to then; "5-year" counts today's schedule over five years against the goal's schedule,
which is what is saved if the learner stops after the test (it comes back if they keep the subject).

| Goal | Recall at target: today to goal | Minutes to target: today to goal | 5-year minutes per item: today to goal (saved) |
|---|---|---|---|
| Test tomorrow | 97.1% to 97.9% | 0.05 to 0.14 | 6.94 to 0.14 (6.8) |
| Test in 3 days | 96.0% to 98.0% | 0.20 to 0.42 | 6.94 to 0.42 (6.5) |
| Test in 1 week | 96.0% to 98.7% | 0.52 to 0.76 | 6.86 to 0.76 (6.1) |
| Test in 2 weeks | 95.9% to 98.7% | 0.86 to 0.99 | 6.85 to 0.99 (5.9) |
| Test in 1 month | 94.9% to 98.6% | 1.22 to 1.39 | 6.80 to 1.39 (5.4) |
| Test in 2 months | 93.9% to 98.7% | 1.65 to 1.87 | 6.58 to 1.87 (4.7) |
| Test in 4 months | 94.0% to 98.8% | 2.23 to 2.39 | 6.65 to 2.39 (4.3) |
| A few months | 93.0% to 93.0% | 2.73 to 2.72 | 6.78 to 2.72 (4.1) |
| A year | 93.0% to 93.0% | 4.35 to 4.33 | 6.78 to 4.33 (2.4) |
| Years | 93.2% to 93.2% | 5.92 to 5.92 | 6.78 to 5.92 (0.9) |

Reading it honestly:

- Test dates raise recall on the day (the final and day-of reviews land when they matter) at a few more minutes before the test
  (0.1 to 0.3 per item), and save the long tail afterwards. Recall is at least as high for every learner in the panel (the gate checks each one).
- Months, a year and years change nothing before their horizon: the owner's ladder is already efficient for them, and the
  simulation says dropping any of it would cost recall. What they save is the reviews after the horizon.
- Per 100 items learned, "test in 1 week" is about 610 model minutes saved over five years if the learner stops after the test.
- Not proof: the constants are the FSRS-4.5 defaults as recalled (a stand-in, not fitted to Savant learners), the panel is five
  hand-set profiles, and no real learner has been measured. A real-learner check needs a test-date cohort.

## Gate

`node scripts/retention-goals-sim.js --gate` (in `npm test`) fails unless every goal's recall at its target is at least today's,
overall and for every learner in the panel, and no goal costs more minutes over the lifetime. Results are also written to
`docs/retention-goals-sim.json` (`--write`).

## Not done

- The goal control is on the profile page only; the material page has no card of its own yet (the profile lists courses).
- A horizon goal on an uploaded course is measured from the day it was set; the course's items have no "first learned" date.
- Mastery thresholds and level pass marks are deliberately untouched.
- Time zone for a course's test date is UTC (enrollments use the learner's zone).
