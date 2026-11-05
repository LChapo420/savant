# Is Savant faster, the way the owner defines faster? (SIMULATED; not proof about real learners)

Owner, 5 Nov 2026: "faster means they get all the information they normally would from normal studying or a personal tutor and remember it for how ever long they chose the retention of that to be for, so lower retention times should be faster overall and higher should still be faster, just not as fast as low retention".

**Round 1 answer (see Round 2 below, which corrects its baselines): no.** Assumption (a) (lower goal, fewer hours) holds for all 160 held-out learners. Assumption (b) (every goal faster than the baselines) fails for every learner on every dated goal at the default forgetting model, and holds only where the baseline cannot reach the target at all (goals with no known test day). Nothing here is a marketing claim.

## Round 2 (supersedes the round 1 comparison below where they differ)

Round 1 was tilted. Corrections, all SIMULATED, same 0.70 target, held-out seed 909091 (160 learners), design seed 777002 (80 learners, never used to report):

1. **The round 1 baselines were an oracle.** Confirmed: `cheapest()` tried 0, 1, 2, 3, 5, 7, 10, 14 passes per learner and kept the first that reached the target, so it stopped exactly at target using the outcome. That arm is kept and labelled "ORACLE bound" (a best case no real student or tutor can reach). Added non-oracle arms: one pass count per goal fixed in advance for everyone (rule: the smallest N whose design-seed pass share is at least 95%, else the highest share), reported on the held-out seed with hours and the share reaching the target; the same for the tutors; and a **self-studier on a generic fixed-interval spaced schedule** (one question per skill at fixed days after learning, no estimates; sparse: 1, 3, 7, 14, 30, 60, 120, 240... days; dense: 1, 2, 4, 7, 10, 14, 21, 30, 40, 55, 75... days; both written before running, not tuned).
2. **Horizon goals are now the main table** (the owner: "remember it for how ever long they chose"): the whole course must be recalled at 0.70 on the day the horizon ends after finishing. A win where the baseline cannot reach the target at all is **not counted as faster**; it is shown as "baseline misses". Hours are means over all learners, including those who miss.
3. **Backward plan** for a dated test (`backward` arm: no review until a final window of P days before the date, in it only skills whose own predicted recall is under a floor; the first pass of 6.0 + 4.2 h kept) and a **stop-at-target bound** for Savant (it stops the day the TRUE recall on the test day, with no more study, reaches 0.70: it uses the outcome, so it is a bound).
4. Tutor multipliers are guesses with a range (below).

Mean hours over all learners, and the share reaching the target (course level, forgetting as v2). Savant (app) is the shipped schedule; "per-skill" is the share reaching it when each skill is judged H days after it was learned instead.

| goal | Savant (app) | Savant stop-at-target BOUND | self-study sparse | self-study dense | normal, fixed N | typical tutor, fixed N | tutor ORACLE bound |
|---|---|---|---|---|---|---|---|
| remember 1 week | 12.6 h, 0% (per-skill 71%) | 12.6 h, 0% | 13.3 h, 16% | 14.6 h, 71% | 17.2 h, 99% (N 10) | 15.1 h, 99% (N 10) | 13.7 h, 100% |
| remember 1 month | 16.4 h, 76% (per-skill 100%) | 16.3 h, 76% | 14.6 h, 6% | 16.8 h, 64% | 19.6 h, 96% (N 14) | 17.6 h, 98% (N 14) | 16.2 h, 98% |
| remember 6 months | 20.9 h, 100% | 20.1 h, 100% | 16.8 h, 0% | 21.4 h, 51% | 19.6 h, 7% | 17.6 h, 18% | 17.6 h, 18% |
| remember 1 year | 22.5 h, 100% | 21.6 h, 100% | 19.1 h, 3% | 23.9 h, 48% | 10.2 h, 0% | 8.7 h, 0% | 17.6 h, 1% |
| no test day (tested at 3 y) | 25.1 h, 100% | 24.1 h, 100% | 23.6 h, 0% | 28.7 h, 45% | 10.2 h, 0% | 8.7 h, 0% | 17.6 h, 0% |
| dated test, 1 week | 15.7 h, 100% | 14.5 h | 13.3 h, 16% | 14.6 h, 71% | 15.4 h, 99% (N 7) | 13.7 h, 99% | 11.0 h, 100% |
| dated test, 1 month | 18.0 h, 100% | 16.7 h | 14.6 h, 6% | 16.8 h, 64% | 15.5 h, 99% | 13.9 h, 99% | 11.4 h |
| dated test, 6 months | 21.9 h, 100% | 20.4 h | 16.8 h, 0% | 21.4 h, 51% | 15.5 h, 99% | 13.9 h, 99% | 11.5 h |
| dated test, 1 year | 23.6 h, 100% | 22.1 h | 19.1 h, 3% | 23.9 h, 48% | 15.5 h, 99% | 13.9 h, 99% | 11.5 h |

(Where a baseline misses the target for nearly everyone its hours are low because it stopped early, so read hours together with the share.) Per-learner counts against each baseline (faster / not faster, both reach / Savant misses / baseline misses, so no hours comparison, not counted as faster / both miss) are in `docs/faster-by-goal/r2-report-k0.txt`. Highlights: against the **dense self-study schedule** Savant is faster for all 77 learners where both reach the target at a 1-year horizon (72 of 72 with no test day, 72 of 82 at 6 months), but the dense schedule misses the target for 49% to 55% of learners there; at 1 week and 1 month Savant is no faster than it (1 month: 60 faster, 21 not, 22 where only the dense schedule reaches the target). Against **fixed-N cram** on dated tests Savant is faster for only 70 of 160 learners at 1 week (15.7 h against 15.4 h on average: a tie) and slower later (mean hours about 1.2x at 1 month, 1.5x at a year). Against the **tutor** with fixed N it is slower for nearly every learner on dated tests.

**What this says.** (i) Where retention must outlast a few weeks and no test day is known, only Savant's schedule reaches 0.70 for everyone and the dense generic one for about half; cram cannot. That is "reaches the target or not, at similar hours", not a speed win. (ii) For a known test date, a fixed 7 cram passes costs 15.5 h and reaches 99%, which beats Savant's 18 to 24 h; in this model that holds because understanding never decays. (iii) **The app's short horizons fall short:** for "remember 1 week" the per-skill horizon ends 7 days after each skill was learned, before the course is finished, so 0% of learners recall the whole course on the day (71% judged per skill). That is a design finding about the horizon goal, not a forgetting-model effect.

**Backward plan (dated tests), design then held-out.** No setting reached 100% on the design seed; the best (7 passes, floor 0.95) reached 96% to 98%. Held-out: 14.7 / 14.9 / 15.0 / 15.0 h at 1 week / 1 month / 6 months / 1 year with 99% reaching the target (one learner misses), against the app's 15.7 to 23.6 h and close to fixed-N cram, so most of the app's excess on dated tests is the reviewing it does before the final week. **It is not built into the scheduler:** the gate was no learner failing, one learner fails, and when deep lapses cost understanding it reaches the target for 19% to 61% (kloss 0.5) and 0% to 28% (kloss 1) of learners. Stop-at-target bound: Savant needs 14.5 / 16.7 / 20.4 / 22.1 h at best, still above fixed-N cram from 1 month on.

**Sensitivity to forgetting** (`r2-report-k0.5.txt`, `r2-report-k1.txt`: a deep lapse, memory recall under 0.5, costs half or all of understanding): cram's share reaching the target falls (normal fixed-N at a dated 1-year test: 91% / 60%; typical tutor 96% / 78%) while Savant (app) stays at 100%. Savant is then faster than fixed-N cram for 4 (kloss 0.5) to 30 (kloss 1) of 160 learners at a year and for 102 to 148 at a month; the rest of the gap is learners the baseline misses. The dense self-study schedule reaches the target for 24% to 36% (kloss 1) at 1 month and beyond.

**Tutor sources, re-checked 5 Nov 2026 by search (secondary summaries; the VanLehn paper and Bloom's essay were not retrieved in full, and a fetch of the ERIC record failed):** Bloom 1984 ("The 2 Sigma Problem", Educational Researcher) shows tutoring at 2.00 SD, but the figure was illustrative, and among 65 tutoring studies in a 1982 meta-analysis one randomized dissertation study reported two sigma (Education Next, von Hippel, https://www.educationnext.org/two-sigma-tutoring-separating-science-fiction-from-science-fact/). VanLehn 2011 (Educational Psychologist 46(4), 197-221): human tutoring about d = 0.79 and intelligent tutoring systems about 0.76 against no tutoring (0.75 for both in his slides), substep-based 0.40 (https://eric.ed.gov/?id=EJ946764 and secondary summaries). Nickow, Oreopoulos and Quan 2020 (https://www.nber.org/papers/w27476.pdf): 96 pre-K-12 tutoring experiments, pooled 0.37 SD, none near 2 SD. **The tutor arms' multipliers are guesses, not fitted to any of these.** Range: low 1.1x learning and pages 10% shorter, typical 1.3x and 25%, high 1.8x and 50%. At a dated 1-year test, fixed-N tutor hours are 15.3 / 13.9 / 11.9 h (low / typical / high), all below Savant (app) 23.6 h, so that conclusion does not depend on the guess in this range. Not modelled: rapport, a tutor's reading of misconceptions, tutor cost (only learner hours counted).

Reproduce round 2: `node scripts/faster-by-goal-sim.js --seed=777002 --n-extreme=60 --n-ordinary=20 --kloss=K --out=D.json` and `--seed=909091 --kloss=K --out=H.json`, then `node scripts/faster-by-goal-report2.js D.json H.json` (outputs in `docs/faster-by-goal/r2-*`).

## Round 1 (kept for the record; its baseline columns used the oracle above, and its horizon rows only judged a per-skill horizon)

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
