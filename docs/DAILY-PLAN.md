# The daily plan

Owner's subjects audit, gap 2: there was no daily plan. `services/daily-plan.js` now builds one from what Savant already knows, for the minutes the learner has today.

## What the learner sees

On the dashboard, inside the existing "Today's plan" section (nothing restyled), a card with:

- a minutes picker: 30, 45, 60, 90 or 120, remembered per learner (`PUT /api/plan/minutes`; 45 until they pick);
- the day as a short list, each step with a reason ("test in 4 days", "3 days since you last studied it", "written ahead, opens at once", "about 8 min at your pace"), five steps shown and "Show all" for the rest;
- breaks from the learner's own spec;
- one **Start** button that opens the first step (a review, an enforcer left half done, a level, a placement).

`GET /api/plan/today?minutes=N` (10 to 240) returns the same plan as data.

## How the plan is built

| Part | Rule |
| --- | --- |
| Reviews first | One sitting per subject, as the review page serves it (`review-session.today`), plus own courses with skills or cards due. Ordered by forgetting risk (lowest recall; a memory check counts as 1.0) times the goal's weight: a test date in 3 days weighs about 1.9, forever 0.8. At most half the day (80% when a test is 7 days off or a memory check waits). Whatever does not fit is deferred whole, never cut in half. |
| Then new material | Split by need: test date (`0.5 + 4 e^(-days/10)`, damped by progress), how far a subject lags the learner's other subjects (4 x the gap in path progress), a catch-up under way (+0.6), momentum (+0.3), x1.5 once a day is missed. Greedy by `need / (minutes already given + 6)`, so shares follow need. |
| No starving | A subject two days untouched gets its next level first, before anything else, unless its goal is met (graduated, or a test it chose to stop after). |
| Written ahead | A level already written (it opens at once) scores 1.25x an unwritten one when subjects compete; a run whose first level is not yet written goes later in the day so the write-ahead has time. A plan cannot skip a level inside a subject, so what it can do is limited to which subject goes next and when. |
| Time | A level's minutes from the learner's own pace (`write-ahead.paceFor`, two sessions in seven days), scaled by level kind; else the grade default for the kind scaled by the spec's session minutes. A block is never cut: a level longer than `session.minutes` is flagged `long`. |
| Spec | `session.breakEveryMinutes` and `session.breakMinutes` place breaks at block boundaries; breaks count against the minutes given. The plan never exceeds the minutes (tested at 10 to 240). |
| Catch-up, placement | An accepted catch-up (`gap-scan.routeForEnrollment`) is worked before the grade it leads to; the grade's levels wait and its untouched days belong to the group. A placement not taken comes first of the new material. A held Final or a cooling checkpoint retry gets its review but no level. |

Evidence status (3 Nov 2026, curriculum-build/evidence-article/09-nov3-builds.md, 09-M15 to 09-M18): that retrieval before new material, spreading practice over days, studying what needs time and taking breaks help is supported by abstract-checked studies of mostly short laboratory or school settings (the forward effect of testing, Pastotter & Bauml 2014; spacing against cramming, Kornell 2009; study-time allocation, Metcalfe & Kornell 2003; a 20 to 30 minute break and test scores, Sievertsen et al. 2016). The numbers here (the 50% and 80% review shares, the need formula, 15 minutes of study and 3 of break) are design values: no study sets them. Interleaving is supported in mathematics and can hurt with texts and words (Rohrer & Taylor; Brunmair & Richter 2019), and the plan splits subjects across days, which is spacing.

## Tie to the enforcers (nothing counted twice; the owner's calendar untouched)

`services/enforcers.js` is read, not changed. The plan never calls `enforcers.offers` (it writes rows); it reads open rows and `scheduledToday`.

- An enforcer left half done or waiting goes first ("finish it"). An end-of-session offer past 24 hours or an end-of-day one past 48 is not shown (the enforcers retire them into the next scheduled one).
- Today's scheduled enforcer (weekly with the semi-weekly it absorbs, and so on) goes last as "End day session", sized by the retention params (`FULL_CAP` of the window's active time, capped by the daily cap), and its minutes are taken off the day. A waiting scheduled offer from an earlier day is merged into it, because `scheduledOffer` merges them: one block, not two.
- With the daily review folded into the enforcers (`ENFORCER_FOLD_REVIEW`, the default) the review already skips what an enforcer covers. Unfolded, review rows on objectives the scheduled enforcer's window covers are dropped from the plan's review block.
- Tested: planning creates or changes no enforcer row.

## SIMULATED numbers (scripts/daily-plan-sim.js)

14 days, 4 subjects, seeded, the real planner on simulated learners that follow the plan in order until their minutes run out. Each level creates review items at +1, +4 and +10 days (two each). Plan estimates use the learner's pace once two studied days exist, else the grade defaults, so the estimate error is part of the result. **These are simulated learners on a rule-based model of time and forgetting. They show the planner keeps its own rules; they are not evidence that real learners learn faster.**

| Archetype | Minutes | Plan used (est.) | Time actually used | Est. error | Reviews on due day | Within 1 day | Max days a subject untouched | Share on written levels | Levels done |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| fast (0.7x time) | 60 | 94% | 83% | 14% | 90% | 92% | 0 | 100% | 80 |
| slow (1.5x time) | 60 | 90% | 91% | 17% | 100% | 100% | 1 | 100% | 41 |
| test in 8 days | 60 | 93% | 93% | 10% | 100% | 100% | 0 | 100% | 62 |
| one subject far behind | 60 | 94% | 93% | 10% | 100% | 100% | 0 | 100% | 61 |
| low minutes | 30 | 94% | 87% | 11% | 100% | 100% | 2 | 100% | 30 |
| high minutes | 120 | 92% | 92% | 9% | 90% | 96% | 0 | 100% | 122 |

- The test subject got 49% of its pre-test plan time and of the new material (an equal split is 25%). The far-behind subject got 32% of plan time, 31% of the new material (it catches up, then the share falls back).
- Baseline, the dashboard as it was (one "Up next" subject all day, no reviews): the other three subjects went **14 of 14 days untouched** in every archetype. It completes more levels (91, 55, 83, 61, 40, 91 against 80, 41, 62, 61, 30, 122), because it spends nothing on reviews or spread; the sim does not measure what that costs in retention or learning, so the level counts are not a verdict.
- "Share on written levels" assumes the write-ahead is caught up at the start of each day (current level and three written ahead, raised by pace). It was 100% in nearly every run because a day's levels rarely pass that window; it is a property of the write-ahead keeping up, not of the plan. A plan cannot skip a level, so the preference only reorders subjects. With the write-ahead behind the number would be lower, and this sim does not test that.
- Time used is under 100% for two reasons: a level that does not fit the minutes left is not started, and a fast learner finishes before the estimate (which comes from grade defaults until the pace is seen).

## Not done, honest limits

- The plan is not yet fed to the write-ahead. `plan.unwritten` lists the levels the plan wants that are not written; passing them to `write-ahead.trigger` as a horizon floor is the next step (it changes the queue's "no longer ahead" drop rule, so it is a separate change).
- Estimates are rough until the learner has two sessions in a week; the card says so.
- Subject need uses path progress, not mastery; a test date is a pressure on a whole subject, not on the objectives the test covers.
- Own-course reviews are one block per course at 0.6 minute an item (2 to 8 minutes); there is no measured pace for them yet.
- Not run against real learners.
