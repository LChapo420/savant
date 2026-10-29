# Savant vs Duolingo: beginner Spanish study protocol

Status: **DRAFT, not pre-registered.** It becomes pre-registered only when the owner fills the `OWNER:` lines,
then seals and time-stamps this file the way `spanish-check/` seals its protocol (SHA-256 in a seal file, RFC 3161
stamp), **before the first participant joins**. No participant numbers exist yet; none are quoted here.

## Question and claim

Per hour of study, does Savant teach everyday Spanish to beginners more than Duolingo? The claim is tested, not
assumed. A null or negative result is reported the same way as a positive one.

## Who

- Beginners: no Spanish study in the last two years (self-confirmed at sign-up).
- 18 or older, or 13 to 17 with a parent or guardian who knows (box at sign-up). Under 13: not eligible.
  Minors' data follows `docs/yc/PRIVACY.md`; the study stores the account id, arm, check-ins and test scores only.
- Consent is a separate box. A participant can leave at any time; leaving is recorded, never hidden.

## Assignment

Random, from the public drand quicknet beacon (the one `spanish-check/` uses), in permuted blocks of four so the arms
stay even with a small sample. Each participant's row stores the beacon round, its randomness and the block, so
anyone can recompute the draw (`services/spanish-study.js`, `shuffleFrom`). Participants cannot choose their arm.

## Dose

The same fixed daily time in both arms: OWNER: confirm 20 minutes a day for 14 days (the code default,
`DAILY_MINUTES` and `DAYS`).

- Savant arm: minutes come from the app's own study-session clock.
- Duolingo arm: minutes are **self-reported each day**, with a tick to confirm a screenshot of Duolingo's own
  stats was kept. The screenshot itself is kept by the participant and shown to the owner on request; the app
  stores only the tick. Self-report is less reliable than the app clock; this is a stated limit.
- Days with no minutes are counted as missing, not dropped.

## Outcomes

Primary: the gain, before to after, on the two sealed external tests, **chance-corrected**
(`(correct / n − chance) / (1 − chance)`, so 0 is guessing and 1 is perfect), averaged over the two tests:
1. Listening comprehension (no Spanish text shown).
2. The daily test.

Both are built from Tatoeba sentences, so neither app taught the exact items. The sealed test module for
participants is built separately from, and never edits, the founder's sealed tests (`spanish-check/`,
`spanish-check-lc/`). It takes a pre-test on day 0 and a post-test on the last day, timed, one sitting each.
**Not built yet** (see the backlog); until it exists the study cannot be run end to end.

Efficiency: gain per hour studied = gain divided by hours studied in the window. A participant with zero
minutes has no efficiency figure and is listed as such.

## Analysis

Fixed before any data: the difference in mean gain per hour (Savant minus Duolingo), with a Welch 95% interval
(t critical values, Satterthwaite degrees of freedom), and the same for gain at equal time. Intention to treat:
everyone assigned is analysed in the arm assigned, whether or not they finished; a missing post-test is shown as
missing, **not filled in**. Every participant is listed, including dropouts and zero or negative gains. No
subgroup analysis. No stopping early because a result looks good.

## Sample size and what a small sample can show

From the spread of gain actually observed, the report prints the number per arm needed to detect a true difference
of 0.10 or 0.20 on the 0 to 1 scale (80% power, 5% level, normal approximation). Until about that many people have
finished, an interval will be wide and the study **cannot show** that either app is better; it can only show
whether the data so far point one way, and how wide the doubt is. OWNER: set the target number per arm.

## Limits we state up front

- Volunteers, not a random sample of learners.
- Self-reported Duolingo minutes; no way to check them beyond the screenshot tick.
- Two weeks is short; the test measures recognition and listening, not speaking or writing.
- Participants know their arm; effort can differ for that reason.
- The owner built Savant. The pre-registration, the public beacon and publishing all participants are what stand
  in for independence.
