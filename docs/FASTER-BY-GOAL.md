# Is Savant faster, the way the owner defines faster? (SIMULATED; not proof about real learners)

Owner, 5 Nov 2026: "faster means they get all the information they normally would from normal studying or a personal tutor and remember it for how ever long they chose the retention of that to be for, so lower retention times should be faster overall and higher should still be faster, just not as fast as low retention".

**Short answer, in this model: no.** Assumption (a) (lower goal, fewer hours) holds for all 160 held-out learners. Assumption (b) (every goal faster than the baselines) fails for every learner on every dated goal at the default forgetting model, and holds only where the baseline cannot reach the target at all (goals with no known test day). Nothing here is a marketing claim.

## What was measured

`scripts/faster-by-goal-sim.js` (no model calls; report `scripts/faster-by-goal-report.js`, grid `scripts/faster-by-goal-grid.js`). Per learner: **active hours until all 50 skills are understood (k >= 0.85) and mean recall of the course on the test day is at least 0.70**. The target was fixed before any run. A learner who misses it (or is not covered by the test day) is a failure, counted, never dropped.

- Learners: held-out seed 909091, 120 extreme (`scripts/lib/extreme-learners.js`: tails, contradictory mixes, random, ages 8-70, English learners) plus 40 ordinary. Design seed for the fix sweep: 777002 (80 learners). 60 minutes a day.
- Learning model: the audited v2 model of `scripts/scorecard-recovery-sim.js` (knowledge k raised by lesson page and answers; half-life memory with spacing gain and miss penalty; recall = k x memory). Learner parameters come from the generator's true traits as that script's `paramsFor` does.
- Savant's schedule uses the app's real code: `services/retention-schedule.js` (enforcer calendar), `services/retention-goal.js` (`keptTypes`, `datePlan`), the 0.85 daily review of `services/mastery.js`, with the app's own estimate of each memory (half-life multiplier off by a log-normal error, sd 0.3, assumed). Not run: the app server, sessions, the real forgetting-curve fitter.
- The test day is planned by the learner as 1.4 x their no-review study days plus the horizon (1 week, 1 month, 6 months, 1 year, "a year" horizon, "forever" tested at 3 years). Dated goals use `datePlan`; "a year (horizon)" and forever have no known test day.

**First finding: the goal does not change the level review.** `mastery.dueReviewsByRecallRaw` uses a flat 0.85 target and never reads a retention goal. A goal only changes the enforcer calendar (fewer types for a horizon, `datePlan` for a date, nothing after the horizon) and the daily plan. So the schedule differs by goal, but mostly by when reviewing stops, not by how much is reviewed before then.

## Baselines (each an assumption, with its source as recalled, not re-fetched here)

- **Normal studying:** learn once (page plus practice to understanding), no spaced review. "Read once" alone reaches the target for nobody past a few days, so the baseline hours are the cheapest of 0, 1, 2, 3, 5, 7, 10, 14 massed full-course retrieval passes: for a dated test, in the last days before it (cramming, generous); with no test day, right after finishing. Basis: students mostly re-read and rarely space or self-test (Karpicke, Butler and Roediger 2009; Dunlosky et al. 2013 rate re-reading low utility); massed practice helps a near test, spacing helps a far one (Cepeda et al. 2006, 2008).
- **Personal tutor:** one-to-one, so pages 25% shorter and 30% more learning per page and answer ("typical"), plus a weekly recap of last week's skills and the same cheapest-passes search. A second "Bloom-like" tutor: pages half as long, 1.8x learning. Evidence: Bloom 1984 reported two standard deviations for tutoring plus mastery learning in small studies; replications fall far short: VanLehn 2011 puts human tutoring near d = 0.79 and good step-based tutoring systems near 0.76; Nickow, Oreopoulos and Quan 2020 pooled RCTs at about 0.37 SD. So "typical" is the defensible arm and "Bloom-like" a ceiling. **Cannot be modelled:** rapport, motivation, a tutor spotting a misconception, tutor time cost (only the learner's hours are counted), what a real tutor reviews between sessions. The two multipliers are mechanism guesses, not fitted to an effect size.

## Result (held-out seed 909091, 160 learners, forgetting as v2, 0 failures for Savant)

Mean hours (median / worst 10% / worst 1%), passers only; per-learner mean ratio Savant / baseline (all learners pass both on dated goals):

| goal | Savant | normal studying | typical tutor | Bloom-like tutor | Savant faster than (of 160) |
|---|---|---|---|---|---|
| test in 1 week | 15.7 (14.6/23.0/33.0) | 13.2 (x1.20) | 11.0 (x1.43) | 9.0 (x1.74) | 0 / 0 / 0 |
| test in 1 month | 18.0 (16.9/25.8/35.9) | 13.4 (x1.36) | 11.4 (x1.60) | 9.3 (x1.94) | 0 / 0 / 0 |
| test in 6 months | 21.9 (20.5/31.5/42.2) | 13.4 (x1.66) | 11.5 (x1.93) | 9.4 (x2.36) | 0 / 0 / 0 |
| test in 1 year | 23.6 (22.1/34.0/45.4) | 13.4 (x1.78) | 11.5 (x2.08) | 9.4 (x2.53) | 0 / 0 / 0 |
| "a year" horizon | 22.5 (21.0/33.0/43.8) | 0% reach target | 1% reach | 0% reach | 160 / 159 / 160 |
| forever, tested at 3 years | 25.1 (23.3/36.9/47.6) | 0% reach | 0% reach | 0% reach | 160 / 160 / 160 |

Worst 1% of baselines is 24 to 28 hours, so the slowest Savant learners take 33 to 48. Every kind (tail_hi, tail_lo, tail_both, contradict, random, age_young, age_old, ell, ordinary) and every age band (8-12 to 60+) has the same pattern: all pass, mean ratio to the tutor 1.39 to 1.49 at one week and 1.88 to 2.15 at a year (full table: `docs/faster-by-goal/main.summary.txt`). Savant's mean recall on the day is 93% to 98%, far above the 0.70 target: it over-delivers and charges for it.

**Assumption (a), lower goal fewer hours: holds.** 0 of 160 inversions between adjacent goals; the extra cost of the longer goal is 2.3 h (week to month), 3.9 h (to 6 months), 1.6 h (to a year), 1.5 h (to forever).
**Assumption (b), every goal faster than the baselines: fails** on all four dated goals for 160 of 160 learners against all three baselines; it holds only on the two goals without a test day, because the baselines cannot reach 0.70 there.

**Hours split (Savant, mean h): lessons / practice / review.** 1 week 6.0 / 4.2 / 5.5; 1 month 6.0 / 4.2 / 7.8; 6 months 6.0 / 4.2 / 11.7; 1 year 6.0 / 4.2 / 13.4; forever 6.0 / 4.2 / 14.9. Lessons are 59% of first-pass hours (the owner's "about half") but only 38% of the total for a 1-week goal and 23% to 25% for a year or more. **Reviews are the biggest block (35% to 59%).** What would cut most without losing coverage: at short goals lesson pages (halving page time: 15.7 to 12.4 h at a week) and at long goals review cost per answer, not lessons. Skipping pages for skills already known (pretest, not wired) saved only 5% at a week and 3% at a year.

## How much the answer depends on the forgetting model (same held-out learners)

`docs/faster-by-goal/grid.txt` has every run. The v2 model never lets understanding (k) decay, so a cram right before the test rebuilds recall cheaply; that favours the baselines. Variant `--kloss` makes a deep lapse (memory recall under 0.5) also cost understanding (a sensitivity, an assumption).

| variant | 1 week: Savant / normal / tutor / Bloom-like (mean h of passers, pass %) | 1 year dated | Savant faster than normal / tutor / Bloom-like at 1 year |
|---|---|---|---|
| v2 as audited | 15.7 / 13.2 / 11.0 / 9.0 (all 100%) | 23.6 / 13.4 / 11.5 / 9.4 | 0 / 0 / 0 |
| deep lapse costs half of k | 15.7 / 16.0 (98%) / 13.4 (99%) / 11.1 | 23.7 / 18.0 (91%) / 15.7 (96%) / 12.7 | 16 / 6 / 1 |
| deep lapse costs all of k | 15.8 / 17.0 (93%) / 14.7 (97%) / 12.3 | 23.9 / 19.1 (60%) / 17.5 (78%) / 14.5 (94%) | 82 / 36 / 10 |
| fast forgetting (half-lives x0.5) | 17.3 / 15.6 / 13.6 / 11.6 | 26.0 / 16.0 / 13.9 / 12.1 | 3 / 2 / 0 |
| slow forgetting (x2) | 14.4 / 11.7 / 9.8 / 7.9 | 21.8 / 12.1 / 10.3 / 8.3 | 0 / 0 / 0 |
| pages take half the time | 12.4 / 10.1 / 8.7 / 7.4 | 20.6 / 10.4 / 9.2 / 7.9 | 0 / 0 / 0 |

(Those counts include learners whose baseline fails.) With slow forgetting, 5% (normal) to 18% (tutor) of baselines pass the year horizon. Even in the variant least favourable to the baselines (all of k lost) most learners are faster with a typical tutor than with Savant on a dated goal; Savant is clearly ahead only where there is no test day or when deep lapses cost all understanding.

## Fix attempts (design seed 777002, 80 learners; no held-out run because none cleared the bar)

Switches tried in the simulation only (`--jit=1`, `--floor`, `--goal-memory`): defer a review while predicted recall on the test day stays above a floor, and change the daily recall floor. Mean hours, 1 week / 1 year dated / forever, against 16.0 / 24.4 / 25.8 for the app as it is: defer only (floor 0.85): 15.9 / 24.0 / 25.8; floor 0.95: 16.2 / 23.7 / 26.5; floor 0.9: 16.1 / 23.7 / 25.8; floor 0.7: 15.6 / 26.0 / 27.9; floor 0.5: 15.3 / 30.8 / 36.2 (the horizon goal passes only 10%); floor 0.35: 15.2 / 36.1 / 31.6 (horizon 0%); defer at memory 0.6: 15.3 / 23.3 / 25.8 but the horizon goal passes only 24%. The best is about 2% to 5% fewer hours, some at the cost of failures. **No change to the real scheduler was made** and `services/` is untouched. The gap to the baselines (1.2x to 2.5x) is not a scheduling slip: reviews that keep recall at 93% to 98% cost 5 to 15 hours, and the cheaper alternative (cram before the test) works only because the v2 model keeps understanding forever.

## What limits it, and what is not done

- Review hours (35% to 59% of Savant's) and the cost per answer (35 s plus feedback, assumed from `services/retention-goal-sim.js`). Reducing item time or lesson time moves the answer more than any schedule change tried.
- The target 0.70 is easy; Savant overshoots it. A tutor or cram arm is cheaper because it stops at the target. Whether real learners want the margin is a product question.
- Results hinge on assumptions: Rasch-style answers, v2 half-lives, the app's memory estimate error, 7-minute lesson pages, 60 minutes a day, no attrition or quitting, tutor multipliers, and the 1.4x test-day plan. Not run: months (90 days) goal, a tutor who reviews monthly, the real app, any real learner. SIMULATED throughout.

## Reproduce

```
node scripts/faster-by-goal-sim.js --seed=909091 --out=docs/faster-by-goal/main.json     # held-out
node scripts/faster-by-goal-report.js docs/faster-by-goal/main.json [--set=extreme|ordinary] [--json]
node scripts/faster-by-goal-sim.js --seed=909091 --forget=0.5 --lesson=0.5 --kloss=0.5 --out=...   # variants (--skipk=0.7: skip known pages)
node scripts/faster-by-goal-sim.js --seed=777002 --n-extreme=60 --n-ordinary=20 --jit=1 --floor=0.85 --goal-memory=0.8 --out=...   # design seed
node scripts/faster-by-goal-grid.js FILE...
```
