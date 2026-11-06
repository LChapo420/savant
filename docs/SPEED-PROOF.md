# Speed proof: showing "4x faster, equal or better retention" on real learners

Code: `services/speed-proof.js`, `routes/speed-proof.js` (learner), `GET /api/admin/speed-proof` and the "Speed proof (4x)" page at `/admin#speedproof` (owner).
Test: `node scripts/speed-proof-test.js` (synthetic data only; none of it says anything about real learners).

Simulated and AI-judged results are never read by this report. Only rows written for real accounts are.

## Changed 6 Nov 2026, after walking it as a tester (`scripts/speed-proof-walk.js`, and a browser at phone width on a database copy)
- **Rows are per lesson stretch, not per coarse skill.** A grade has about 8 coarse skills over about 70 lessons. Per coarse skill a tester would have met a plain arm about once a grade, and a high coarse mastery called every later lesson "understood" on its third answer. Below, "skill" now means a lesson stretch. Old rows without `from` keep the old reading.
- **Understood** is the app's own proof for that lesson's objective (`services/coverage.js`), the same rule in both arms, else the tracker on that stretch's answers.
- **Total minutes.** `minutes_total` and `speedup_total` count every answer on the stretch, retention levels included, because the owner's claim counts the whole road. Reviews asked later under other levels are in neither number.
- **Typed items can be checked.** 73% of items are typed and the check only took multiple choice, so many lessons could never be asked. A typed item now gets other answers the learner met on that skill as its choices.
- **The memory check has its own dashboard card**, for learners with a plain arm. Before, it lived only inside the 10 minute daily check, behind the other delayed check. Plain lessons are asked first, since they are 1 in 8 and only 3 questions fit a day.
- **No speed lever on a plain lesson**, and the learner can now switch: the consent wording promised a switch that had no button.

## What this proof can and cannot show (read this first)
**It cannot show 4x against normal studying, whatever the truth is.** The plain arm is the app itself: same questions, same proof rule, same retention levels, same reviews. It only leaves out tailoring and the levers. So it measures what tailoring and the levers add. With today's defaults (fast item only) the two arms run almost the same path, so expect a ratio near 1x to 1.3x. A student rereading a textbook is not in it.
**The time cap also tops it out.** A plain lesson moves to Savant at max(30 min, 3x the median Savant lesson), so once that median passes about 10 minutes a learner's ratio cannot go far above 4x. The report counts how often this bit (`plain_skills_stopped_by_time_cap`). The gate is unchanged, and the cap protects learners.
**It will not read on Nov 15.** The earliest retention result is 30 days on, about Dec 15.

## What a real result would take
Against the plain arm, from the table below: a true 5x to 6x, and 100 to 250 learners with both arms and checks. A learner meets about 1 plain lesson in 8 to 11, since a plain lesson stays open and holds back the next draw, so each needs about 20 lessons for 2 plain ones. A true 4x exactly can never show, because the lower end must reach 4.

Against normal studying, a separate group is needed, and nothing in the app supplies one:
- Same material, same unannounced delayed test at 30 days, one group in Savant and one studying their own way, timed by a plain timer page. Randomised, not self-selected.
- Speed gate, assuming a between-person log SD of 0.7 (assumed, no real data yet), 80% power, lower end at or above 4: a true 6x needs about 47 per group, a true 5x about 154.
- Retention gate, assuming an SD of 20 points: a 5-point margin needs about 250 per group, a 10-point margin about 63. **This is the slow gate.**
- So about 250 per group, about 500 people, for a claim with these margins. About 50 per group gives an honest "at least Nx" and would catch a true 6x on speed, but says little on retention.

Reading a result: if the group study shows 2x, that matches the best course-level study found (docs/speed-real/ROUND3.md). 4x would be beyond anything found in a controlled study.

## What is measured, per real learner and skill
- **Active minutes to understanding.** A study session's active time (`study_sessions.active_ms`) is shared over the answers given in it, each answer taking the time since the previous sign of activity (capped at the 5 minute idle cap), so reading before an answer counts for the skill answered next. Answers outside any session count their own recorded time (`items.ms`, capped). Placement, test-out and game answers are not learning time. "Understanding" is the first answer after which the skill's mastery is 0.8 or more (`events.mastery_after`), reached by learning, with at least 3 answers. A skill not yet understood is counted as such and shown, never dropped.
- **Delayed retention checks** at 1, 7 and 30 days after understanding, and at the learner's chosen horizon (`services/retention-goal.js`; none for "forever"). Same shape as the existing delayed check (`boosters.delayed`: about 30 seconds, up to 3 multiple-choice questions on an earlier right answer), offered inside the daily check when none of the existing ones is due. Windows: day 1 (2 days), 7 (4), 30 (10), horizon (14). A point not answered in its window is "missed" and counted per arm, so uneven drop-out shows.
  These answers do not feed the forgetting model (the existing check does); they are for the proof only.

## The fair within-person comparison
A learner who says yes (optional) gets about 1 skill in 8 (`SPEED_PROOF_NORMAL_SHARE`) taught "normal studying": the plain standard lesson (the base lesson the owner's account gets), reread at their own pace, no tailoring, no test-out. Which skills is random: a shuffled block of 8 per learner, track and grade ("matched" = same learner, subject and level), crypto randomness, written once and never changed. Every other skill is the Savant arm. Mean item difficulty by arm is shown as a balance check.

How a plain skill is served: `services/lessons.js` write and `services/sessions.js` createSession run inside `speedProof.withSkill`, which draws the arm and, for a plain skill, makes `owner.ownerBase()` answer true for that learner for the duration (AsyncLocalStorage), so every tailoring switch already behind `ownerBase` is off for that skill only. The test-out offer (`mastery.skipOffer`) is held back at a plain skill's level. Pass marks and care features are kept, as in the base arm.
Also covered: `routes/base-lessons.js` (`/lessons/:track/:grade/:level/...`) and `routes/learn.js` (`/items/:id/...`) run through `lessonContext`/`itemContext`. For a plain skill: block levels are served the shared standard page (`blockLevels.tailorsFor` is false inside), the lesson assistant (`/assist`), the question coach and the ask-the-tutor box are off (ask returns the standard explanation; the others say why and offer the switch).

**What still differs, and which way it biases the comparison.** (a) The tutor dock and the home chat are not tied to a skill, so a learner can still chat with the tailored tutor while working a plain skill. That helps the plain arm, so it makes Savant look less fast: conservative against the 4x claim. (b) Scorecard-driven things that run outside lessons and sessions (daily plan ordering, spaced-review scheduling, the daily check) apply to every skill alike, plain or not: they affect both arms equally, so they do not bias the ratio but they are not part of what is being contrasted. (c) Retention checks and reviews of a plain skill follow the same schedule as Savant's, so no bias there. (d) A learner who knows they are in the plain arm may try harder or give up sooner (no blinding is possible); the auto-switch and time cap bound this, and switched skills stay in the plain arm.

## The question the learner sees
`public/js/speed-offer.js` draws one card on the dashboard (`#speed-offer`), once, after placement (`status.offer`: eligible, not yet answered, at least one enrolment past `placement_pending`). The wording is the server's `CONSENT`. "Yes, include me" and "No thanks, nothing changes" are equal-size buttons; either answer is saved (`POST /api/speed-proof/consent`) and the card never returns. An under-13 account only sees it when a parent has already agreed to the optional measurement (`boosters.allowed`); the card then says so. A no changes nothing (every skill stays the Savant way).

### Kept from harming the learner
- Needs the learner's own yes; a no changes nothing. Wording is `CONSENT` in the service (shown by `GET /api/speed-proof`): it says what the plain way is, that it is optional, how it is measured, that they can switch any skill at any time, and that results are never shown by name.
- At most one plain skill open at once; none when a test date is within 21 days.
- The learner can switch a skill to Savant any time (`POST /api/speed-proof/switch`); it switches itself after 5 wrong answers in a row or past a time cap (max(30 min, 3x the learner's median Savant time)).
- A switched skill stays in the plain arm in the analysis (intention to treat), minutes after the switch included. That can only make the plain arm look faster, so it works against the 4x claim.

## The report
Per learner: speed-up = plain geometric-mean minutes / Savant geometric-mean minutes; retention difference = Savant minus plain on answered checks.
Across learners: mean log speed-up with a 95% t interval (shown as a geometric-mean speed-up); mean retention difference with a 95% t interval; medians; 10th percentile and the mean of the worst tenth of learners; counts below 1x; all by age group (under 13, 13 to 17, 18 and over); sample sizes (learners, skills per arm, checks answered and missed per arm).

**Verdict, fixed before any data.** "Shown" only when all of: at least `SPEED_PROOF_MIN_LEARNERS` (20) learners with both arms understood and with checks on both; the lower end of the speed-up interval is at least 4; the lower end of the retention interval is above -5 points (non-inferior). Fewer learners: "Not enough data", no claim either way. Other outcomes: `not_shown` (upper end below 4), `speed_shown_retention_worse`, `inconclusive`.

## Who is in, and the switch
`SPEED_PROOF=beta` (default): only accounts in the beta (a `beta_arm`, `beta_invite` or `in_beta` on the user row). `on`: every eligible account. `off`: nothing recorded, nothing offered, no plain skills.
Never: the owner, the owner's learner account (id 6689 and `OWNER_LEARNER_EMAILS`; more ids via `SPEED_PROOF_EXCLUDE_IDS`), admins, test, demo and team accounts. Under-13s (and any age below the country's consent age) only with the parent's agreement to the optional measurement (`boosters.allowed`); a withdrawn agreement removes the child from the report at read time. Rows (`speed_proof`, `speed_proof_blocks`) are registered for account deletion and export.

## What 50, 100 and 250 learners can show (synthetic: 40 held-out seeds, 5% extreme learners, equal retention, 3 checks per arm per learner)
| Learners | True speed-up | "4x shown" | Median estimate | Median 95% interval | Retention lower end |
|---|---|---|---|---|---|
| 50 | 3x | 0% | 2.97x | 2.43x to 3.64x | -6.4 pts |
| 50 | 5x | 23% | 4.89x | 3.98x to 5.93x | -6.4 pts |
| 50 | 8x | 38% | 7.62x | 6.18x to 9.51x | -6.4 pts |
| 100 | 3x | 0% | 2.95x | 2.60x to 3.37x | -3.9 pts |
| 100 | 5x | 53% | 4.85x | 4.23x to 5.56x | -3.9 pts |
| 100 | 8x | 70% | 7.64x | 6.55x to 8.77x | -3.9 pts |
| 250 | 3x | 0% | 3.00x | 2.74x to 3.25x | -2.8 pts |
| 250 | 5x | 93% | 4.88x | 4.43x to 5.33x | -2.8 pts |
| 250 | 8x | 95% | 7.61x | 6.89x to 8.36x | -2.8 pts |

Reading it: at 50 learners the retention gate (not speed) is what blocks "4x shown", even at a true 8x, because its lower end sits near -6 points against a -5 margin. At 100 the speed gate clears for a true 5x about half the time and 8x about 70% (capped by retention). At 250 either clears about 95% of the time. A true 4x is never "shown" (the lower end has to reach 4). More checks per learner would shrink the retention interval; the gate itself is unchanged.

**Honest wording at each size** (the report prints it from the data, `overall.estimate`): "With N learners, Savant took Px less time (95% interval Lx to Hx). We can say it is at least Lx faster; we cannot say it is 4x unless that lower end reaches 4", plus "retention is no more than D points worse". Below 20 learners it is prefixed "Early estimate, not a verdict". Typical at 50: a true 5x reads "at least 3.9x"; at 100: "at least 4.2x"; at 250: "at least 4.4x". The report also prints, from the spread seen so far, the true speed-up that would clear the gate 80% of the time and the learners the retention gate needs (`overall.detectability`).

## What the first testers will actually give
Synthetic check (`scripts/speed-proof-test.js`, 40 held-out seeds): with a true 6x and no retention gap, "shown" is reached about 72% of the time at 120 learners and 93% at 250; retention (3 checks per arm per learner, a 5-point margin) is the slow gate, not speed. A true 4x or 3x is never "shown". Plan for roughly 250 learners with both arms, or more checks per learner, before expecting a verdict. With 10% extreme learners the gate clears more slowly (57% at 120). These are properties of the test, not of Savant.
