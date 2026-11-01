# Beta comparison: tailored vs base

When the beta starts the app proves by itself whether tailoring helps. Learners are drawn at random into two groups, a large **tailored** group and a small **base** holdout. A daily job compares them on what the app already records and writes `data/beta-report.json`. The owner reads it on the page `/beta-report` (admin only). Nobody runs anything by hand.

Code: `services/beta-arm.js` (the draw), `services/beta-compare.js` (outcomes, report, daily job), `services/beta-stats.js` (the intervals), `routes/admin.js` (`GET /api/admin/beta-report`), `public/beta-report.html`, `scripts/beta-compare-test.js` (in `npm test`), `scripts/beta-compare-sim.js` (the simulated proof), `scripts/beta-report.js` (print the report from a copy of the data).

## What is compared

| Arm | What the learner gets |
| --- | --- |
| tailored | The app as it is: scorecard-driven material, tutor depth, per-learner briefs, adaptive teaching, and the speed levers (`SR_*`) whenever they are switched on. |
| base | The base product, the same one the owner's account gets (`config/owner.js` `ownerBase`): the standard curriculum and lessons, no scorecard-driven tailoring, no per-learner brief for the tutor or the writers, and the speed levers off. |

The base arm uses the owner-base switch that already existed (`OWNER_BASE`; see `curriculum-build/OWNER-BASE-VS-OPTIMIZED.md`), so every place the app already knows how to serve the base product is covered at once. The speed levers are read deep inside the scheduler, so they are switched off per learner by wrapping the four planning functions in `efficiency.forLearner` (`mastery.dueReviewsByRecall`, `sessions.planLesson`, `sessions.curveReviews`, `sessions.stoppableItems`). Everyone else is untouched, so the 200-learner accuracy gate and the simulations do not move.

## The draw

- **When:** at first use, on the learner's first request once they qualify (`middleware/auth.js` `attachUser` calls `betaArm.ensure`). Stored once on the user row as `user.beta_arm` (`arm`, `stratum`, `band`, `subject`, `assigned_at`, `share`, `block_id`).
- **Who qualifies:** a real learner (not the owner, not a team, test or demo account: the existing `real-user-metrics` classification) who has answered the age screen. **A learner under their country's consent age is drawn only if a parent has agreed to the optional measurement** (consent scope `measurement_extras`, the same gate as every other extra measurement channel, `boosters.allowed`). An under-13 learner without that agreement gets the ordinary product and is not drawn, not counted and not measured. A learner who has not answered the age screen is not drawn until they do. If a parent later withdraws the agreement, the child stays in their arm (their product does not change) and is **left out of the report** from then on.
- **How:** stratified, permuted blocks. Strata are age band (under 13, 13 to 17, 18 and over) by the subject of the learner's first enrolment. For each stratum a block of 20 slots is shuffled with `crypto` randomness, with `round(share x 20)` of them base (default share **20%**, `BETA_HOLDOUT_SHARE`, capped at 50%), and learners take the slots in order, so each stratum stays within one block of the planned share. Nothing about the learner picks the arm.
- **Never moved:** `ensure` returns the stored arm and nothing else writes it. Changing the share changes only blocks opened afterwards. Tested.
- **Kill switch:** `BETA_COMPARE=off` makes everyone tailored again at once (the base arm's learners get the tailored product back) and stops the report.

## Ethics

- The base arm gets today's base product: the product every learner had before tailoring was built and the one the owner's account uses. It is the control, not a degraded version of anything.
- Care and assessment rules are **not** part of tailoring, so the base arm keeps them: the streak grace, the break nudge, the pass marks, the skip-exam rule and the checkpoint scoring rule (`ownerOnly` instead of `ownerBase` at those places). The only things taken away are tailoring and the speed levers, both of which are unproven; proving them is the point.
- Nobody is moved between arms. When the comparison has answered its question, `BETA_COMPARE=off` gives the base arm the tailored product at once.
- No new data is collected for this. The report reads sittings and answers the app already stores, holds counts and statistics only (no account, email or id), and is behind the admin check (404 for everyone else).
- The honest limit: learners are not told which arm they are in. The beta terms should say that some learners get a plainer version so the app can learn what helps (owner to approve the wording).

## Outcomes

Counted from each learner's own `assigned_at`, so nothing from before the draw leaks in.

**Primary, fixed before any data existed: retained skills per practice hour.** A skill is *mastered* the first time an answer leaves its mastery at 0.8 or more (the app's own "known" line; a skill credited by a placement or a skip is not counted). It is *retained* if the first answer on it at least 7 days later is right. *Practice hours* are the learner's sittings (placement and skip sittings left out), each capped at 45 minutes so a tab left open is not counted. Only skills mastered and hours spent up to 7 days ago are read, so every skill counted has had its chance to be retested. The arm's figure is a ratio of totals (sum of retained skills over sum of hours) with the delta-method variance, so a learner who practised for ten minutes does not swing it.

**Secondary (six), each read at alpha 0.05 / 6 (Bonferroni):**

1. Skills mastered per practice hour.
2. Recall after about 7 days: share of answers right on a skill last answered 5 to 10 days earlier.
3. Recall after about 30 days: the same for a gap of 21 to 45 days.
4. Return within 7 days: a second day of use within a week of the first.
5. Sitting length: average sitting, each capped at 45 minutes.
6. Checkpoint score: average score on Master and Grand quizzes, Graduation exams and essays.

Delayed recall is measured from the answers learners give anyway (review items and later practice), not from a new test.

## Stopping rule and the interval

There is **no fixed stopping point and no look schedule**. The interval is an *always-valid* confidence sequence (a normal-mixture sequential probability ratio test, mSPRT; Robbins 1970, Johari, Pekelis and Walsh 2017), so the report can be read every day, and the daily job reads it every day, without inflating false positives. The chance that the interval **ever** excludes the true difference is at most 5%, however often it is looked at. Its mixing scale is 0.3 of a per-learner standard deviation (a small-to-medium effect), fixed in code before any data.

Rules the report follows:

- An outcome is not read until each arm has **20 learners** with a value for it ("too early").
- The verdict for an outcome is one of: *tailored ahead* (the interval excludes zero on the good side), *tailored behind* (excludes zero on the bad side: look at this first), *no gain as big as 20%* (the interval's top is below a 20% gain), or *too early to tell*.
- The overall line is the primary outcome's verdict. Secondary results do not rescue a null primary; they say where to look.
- The ordinary Welch interval is written next to it, labelled "single look only", for comparison. It is never used for a verdict.

## Power: how many learners it takes

The report states, for each outcome, the learners still needed to settle a 20% gain (20% of the base arm's estimate), from the arms' own variances and the actual split, in two numbers: a fixed-sample figure (80% power at one planned look) and a figure for the always-valid interval (where an observed 20% gain would just clear zero).

With the noise these outcomes have in the simulations (a coefficient of variation of 1.1 to 1.7 per learner), **a 20% gain needs roughly 1,500 to 3,600 learners in total at a 20% holdout** (about 2,000 for retained skills per hour; 2,500 for the always-valid interval). A beta of a few hundred learners cannot settle +20%; it can find a gain of about +50% (the always-valid interval then excludes zero in 55 to 85% of simulated betas of 500 learners, depending on the outcome), and it can show if tailoring is *worse*. Until then the report says "too early to tell", and means it. A 50% holdout would need about a third fewer learners in total (the variance factor falls from 6.25 to 4), at the cost of putting half the learners on the plainer product.

## Proof (simulated learners, not real ones)

`node scripts/beta-compare-sim.js --reps=2000` simulates betas with a true effect of 0, +20% and +50% on three kinds of outcome (a rate per practice hour from Poisson counts with learner-level multipliers and 12% inactive; a 30%-zero lognormal mean; a yes/no), 20% base arm, the report read every 5 learners from n = 100 to 500 (the daily-peeking worst case). Run on 1 Nov 2026 (seed 1, 2,000 runs per row):

| | always-valid (used) | ordinary Welch |
| --- | --- | --- |
| Coverage of the true difference, one planned look (n = 100, 150, 400) | 99.0% to 99.9% (conservative) | 92.0% to 95.9% |
| Coverage while read at **every** daily look | 95.5% to 98.4% | 71.1% to 77.8% |
| False positives with no effect, read at every look | **2.2% to 4.5%** (planned: at most 5%) | 22.2% to 28.9% |
| Power at +50% (excludes zero by n = 500) | 36.7% to 84.4% | 68.8% to 98.4% |
| Power at +20% (excludes zero by n = 500) | 7.6% to 8.7% | 26.4% to 36.1% |

Read this as: the interval is honest under daily peeking and slightly conservative at a single look (coverage above 95%, not near it: that is the price of being safe to read daily); the textbook interval is right at one look and wrong when read daily. The test `scripts/beta-compare-test.js` re-runs a smaller version on every `npm test` and fails if coverage while peeking drops under 92%, or false positives rise above 9% (a loose bound for 300 runs), or the textbook interval stops showing the peeking damage.

The test also writes simulated learners as real sittings and answers, runs them through `beta-compare.buildReport`, and checks the report's interval holds the true difference in all 12 simulated betas (effects 0 and +50%).

**What this does not show:** whether tailoring helps. It shows the comparison is sound when real learners arrive.

## Reading the report

`/beta-report` (owner only), or `GET /api/admin/beta-report` (`?refresh=1` recomputes), or `data/beta-report.json`, or `npm run beta:report` against a copy of the data.

- **Summary line:** the primary outcome's plain-English verdict.
- **In the comparison:** learners per arm and the share in the base arm (planned 20%); *left out of the numbers* counts learners the rules would not draw today (a withdrawn parent agreement).
- **Table:** per outcome, n and estimate per arm; the difference (tailored minus base) with its interval; the interval relative to the base estimate; the reading, with learners still needed to settle +20%.
- **Cautions** to take seriously: the base arm is small by design; if the share of mastered skills that were retested differs between arms by more than 15 points the report says so (the primary counts only retested skills, and the tailored product may schedule more reviews, which is part of what is being tested but should be known).

Secondary outcomes are at 99.2% intervals (alpha 0.05 / 6): wider on purpose. A secondary result on its own is a lead, not a finding.

## Settings

| Variable | Default | Effect |
| --- | --- | --- |
| `BETA_COMPARE` | on | `off`: nobody is drawn, everyone is tailored, no report |
| `BETA_HOLDOUT_SHARE` | 0.2 | Share of new blocks in the base arm (0 to 0.5) |
| `BETA_REPORT_DAILY` | on | `off`: the daily job is not scheduled (the page still computes on request) |
| `BETA_REPORT_FILE` | `data/beta-report.json` | Where the report is written (tests use a temp file) |

## Known limits

- **Retests are not randomised.** The primary counts a skill as retained only if it was retested a week or more later; if the tailored product retests more, its count rises even for the same retention. The report prints retest coverage per arm. A common delayed check given to both arms (the existing 30-second memory checks, `services/boosters.js`) would remove this; it is not used as an outcome because it is opt-in and sparse.
- **Learners who have not answered the age screen are not drawn.** In a copy of the development database only 3 of 108 accounts had answered it, and 4 were real learners (the rest test, demo or team accounts), so there is nothing to read yet. Beta sign-ups answer it at registration.
- **Mastery events for a placement or skip are not learning** and are excluded; a skill mastered before the draw is nobody's gain.
- **Practice hours are sitting time** (start to end, capped), not attention.
- **The first-enrolment subject** is the stratum; a learner who later takes other subjects keeps one arm across all of them.
- Validity of the interval is asymptotic (the variance is estimated). The simulation covers skewed, zero-heavy and yes/no data from 20 learners per arm; it does not cover heavier tails than those.
