# Retention enforcers and the retention calendar (2026-10-24)

The owner's design, built live: flag `RETENTION_ENFORCERS` (default **on**). Parameters come from `curriculum-build/retention-enforcer-params.json` (version 1.2.0; evidence in `RETENTION-ENFORCER-EVIDENCE.md`).

**Changed 2026-10-25 (evidence-article/02-retention-review.md P1, P3, P5; each with an off switch, on by default; none of them applies to the owner's base version):**
- `ENFORCER_DIFFICULTY_WINDOW_95`: the difficulty window d(p now) is 1 up to 0.95; the old 0.65 step for 0.90-0.95 is gone (P1).
- `ENFORCER_DEFER_SITTING_RETENTION`: while a study session is running, a sitting's end-of-sitting retention set is not asked; the session enforcer asks those topics when the study session ends (P3).
- `ENFORCER_LEFT_OUT_FLAG`: a topic eligible in the last enforcers but not asked moves up (P5).

**Revised the evening of 2026-10-24 (owner's clarification).** The semi-weekly runs strictly on 3/4/3/4-day gaps from the anchor. When enforcers fall on one day the widest absorbs the narrower ones and that day's end-of-day enforcer: on a weekly's day there is one enforcer for the week, the semi-week and the day. A combined enforcer is one plan (the allocation rule below), not the sum of each scope's questions.

## What a learner sees

- **A session strip under the header**, on every signed-in page.
  - With no session running, it shows **Start session**.
  - While one runs, it shows the active minutes, **Pause** or **Resume**, and **End**.
  - **End** offers **End session** or **End day session**, then opens the enforcer page.
  - The strip also says when an enforcer is waiting, with a link to it.
- **The enforcer page** (`/enforcer?id=`):
  - **The tiers:** quick, medium, full, or no enforcer. Each shows its number of questions and minutes. One is preselected.
  - **The questions:** one at a time, each marked as soon as it is answered. On medium and full, a miss comes back as "One more try" on a different question, at least 3 questions later.
  - **Leaving halfway:** next time, the page offers to finish it, pick a different tier, or stop here.
  - **At the end:** the score, then "A second look" at every missed question with its answer and explanation.
- **Offered before the next session:** Start session answers 409 while anything is waiting. That covers an enforcer left unchosen, one left half done, or a scheduled one from an earlier day. The learner must finish it, choose a tier, or choose none. The owner can also **Skip**.
- **On a scheduled day:** nothing blocks that day's sessions. "End day session" is the scheduled enforcer (it absorbs the end-of-day one), and the end prompt says so ("Today End day session is your weekly retention enforcer (with the semi-weekly)..."). If the day ends without it, it is offered before the next session, marked late, still covering its day. A second "End day session" the same day, after the scheduled one is closed, is a plain end-of-day enforcer.
- **The retention calendar** (`/calendar`, a new "Calendar" nav and tab-bar entry, for every user).
  - **The month view:** one row per week, Monday first.
  - **Each scheduled day:** its type (S, W, B, M on phones; the full name on desktop) and its status. A weekly's day shows **W+S** (desktop: "Weekly + semi-weekly"): one enforcer that absorbed the semi-weekly. Past days show done (tick), missed (slash), stopped, none, skipped, or nothing to cover. Today shows "today, at End day session", and later days show coming up (dashed).
  - **Session marks:** a small mark for each end-of-session or end-of-day enforcer.
  - **Below the month:** a legend (with W+S: the wider takes in the other; every scheduled enforcer also covers its own day) and the next 8 scheduled enforcers, each with what it absorbs.
  - **Accessibility:** each cell carries a full sentence for screen readers. Today has `aria-current="date"`. The month buttons have text labels.
  - **Design:** built only from the "Measured and marked" tokens, so light and dark both work.

## The schedule (`services/retention-schedule.js`, pure)

Day 0 is the **anchor**, the local date of the learner's first study session. It is stored on the user as `retention_anchor`, with the browser's time zone as `retention_tz`. All days are local calendar dates, so the schedule survives DST changes and moves.

| Type | Days | Covers (always through its own day) |
|---|---|---|
| Semi-weekly | 3, 7, 10, 14, 17, 21, ... (7k+3 and 7k): gaps 3, 4, 3, 4 from the anchor | since the last semi-weekly |
| Weekly | 7, 14, 21, ... (absorbs that day's semi-weekly) | the week: since the last weekly |
| Bi-weekly | 12, 26, 40, ... (every 14, residue 5 of 7) | the 14 days ending on it |
| Monthly | the pocket day within 3 days of 30m | since the last monthly |

- **Absorption.** `typesOn(d)` lists every type on a day, widest first; `typeOn(d)` is the widest, which absorbs the rest. With these rules the only shared day is the weekly's (weekly + semi-weekly), every 7 days. The scheduled enforcer also absorbs its day's end-of-day enforcer, so every window ends on its own day. On a weekly's day the combined window is the week (the semi-week, its last 4 days, lies inside it) plus the day.
- **Bi-weekly, a day apart in the strict sense.** It sits two days after a semi-weekly and two before a weekly, with a free day on each side. The strict reading of the owner's rule can be met now that the semi-weekly has no offset.
- **How the monthly day is picked.** It goes on a day with no semi-weekly, weekly or bi-weekly. It prefers the day whose nearest enforcer is the easiest: a semi-weekly next door beats a weekly or a bi-weekly. After that it takes the day nearest 30m, then the earlier one. Every 7 days hold the day before a lone semi-weekly, so every monthly sits next to a semi-weekly only.
- **What the property test covers.** `scripts/retention-schedule-test.js` runs 35 checks over 8 years of days:
  - the plain 3/4 alternation from day 0;
  - absorption (one enforcer a day, the widest; only the weeklies shared);
  - the bi-weekly's free day on each side;
  - monthly placement against a brute force, and its cadence;
  - every type's windows covering each day exactly once, through their own day;
  - next and latest.

  It repeats the date and weekday checks for 549 anchors over 3 years, and for 11 time zones every 6 hours over 4 years (shared days resolve to the weekly in every zone).

## What is in an enforcer (`services/enforcers.js`, `services/retention-params.js`)

- **The window.** The questions come only from what the learner answered in the covered window:
  - End session: the session's time span.
  - End day session: that local day.
  - A scheduled enforcer: its local dates.

  Placement, Challenge Exam and enforcer answers are not counted as work done.
- **What each question is about.** Each window answer is grouped by its objective, using `coverage.attribute`. Where a grade has no objective model, it is grouped by skill.
- **The question itself:**
  1. a question written for that objective (`objective-items`);
  2. failing that, the bank's question on the same skill;
  3. failing that, one of the learner's own checks from the window, asked again. On scheduled scopes this is used only when nothing else exists.
- **The time budget** (from the params file):
  - B(tier) = multiplier × min(full_share × active time, full cap). The multipliers are quick 0.35, medium 0.65 and full 1.
  - **A combined enforcer** (a scheduled one with its end of day; a weekly with its semi-weekly and its day; a late merge): full = the largest part's full budget + 0.5 × the other parts', capped at the largest part's cap and at 9.5% of the union's active time (`combinedBudgetMs`). A part is one absorbed scope on its own window. So it is always less than the enforcers added up, and full stays under 10%.
  - The full shares are session 9.5%, day 9.5%, semi-weekly 6%, weekly 5%, bi-weekly 4% and monthly 3%.
  - The full caps are 8, 10, 12, 15, 15 and 20 minutes.
  - B is never more than 9.5% of active time, so full stays under the owner's 10%.
  - A day's enforcers have 20 minutes at most between them.
- **What one question costs.** The format's time is the learner's own median once they have 20 answers in that format (otherwise MC 20 s, typed 35 s). Add the expected feedback: p × 3 s + (1 − p) × 25 s. On medium and full, also add the expected retry.
- **The plan: the allocation rule** (`allocation` in the params file, `slots` and `plan` in `services/enforcers.js`; evidence: section 5a of the evidence report). One plan over the whole covered pool, however many scopes it absorbed:
  - every topic can get **one first try** (relearning to 1 correct per session), with its drop-out retry on medium and full;
  - a **fragile** topic can get **a second, varied try** on medium and full: a different question on the same objective, after all the first tries. Fragile means the last answer was wrong, or at least a third of the window's answers on it were, or its recall now is under 0.50. Mature topics (3 or more delayed checks, p_now at least 0.90, last right) never do, and end-of-session enforcers stay at one;
  - every slot is ranked by value per planned cost, eligible first; a second try is worth 0.35 of its first. The budget takes them in that order.
- **Filling the budget.** Questions fill the budget greedily by those slots.
  - **Score:** (1 − p at the scope's horizon) × the difficulty window d(p now), plus flags.
    - d(p now) is 1 from 0.50 to 0.95, 0.6 below 0.50 and 0.3 above 0.95 (`retention-params` `windowOf`, `difficultyWeight`). `ENFORCER_DIFFICULTY_WINDOW_95=off` puts back 1 to 0.90 and 0.65 for 0.90-0.95.
    - last answer wrong, 0.3;
    - a confident error, 0.25;
    - right but slow or unsure, 0.2;
    - no delayed retrieval yet, 0.15;
    - left out last time, 0.10 × min(1, times / 2): times is how many of the learner's latest planned enforcers in a row had the topic eligible but did not ask it. Each plan stores those keys as `left_out`; a plan that asks the topic ends the run (`leftOutCounts`; off with `ENFORCER_LEFT_OUT_FLAG=off`);
    - missed in a sitting whose retention set was left to this enforcer, 0.2, only when neither "last answer wrong" nor "slow or unsure" fired (below).
  - **The sitting's own retention set, deferred** (`deferSittingRetention`, called by `POST /api/sessions/:id/finish`). With enforcers on and a study session open that holds the sitting's answers, the up-to-3 end-of-sitting retention questions are not created, and the response says `retention_deferred: true`. The set's skills that were missed in the sitting are stored on the study session (`retention_deferred`) and flagged in its session or day enforcer; the sitting records `retention_deferred_to`. The per-level retention question is unchanged. With no study session open, for the owner's base version, or with `ENFORCER_DEFER_SITTING_RETENTION=off`, the set is asked as before. A scheduled enforcer that absorbs the day reads the flag when its tier is chosen (from `day_study_session_ids`), not in the tier preview.
  - **Where p comes from:** the coverage record and the forgetting curve (`adaptation.predictedRecall`).
  - **Lag rules:** an objective inside the scope's minimum lag (5 min, 30 min or 1 day), or kept in an enforcer in the last 20 hours, goes after the others rather than out. That way a short window still has questions. On an absorbed day, the day's own work keeps the end-of-day lag (30 minutes).
  - **Order:** the first tries interleaved by skill (oldest first for a session), then the second tries in the same topic order, as far from their firsts as the sitting allows, closing on a question the curve expects right.
  - **Retries** are counted per question chain, so a topic's second try keeps its own retry. On an objective, a retry is only another question written for it (never the skill bank's, which can be off-grade); none left, no retry.
- **Stopping on time.** Each answer adds its time to the enforcer's clock. Once the next question would go past the budget, the rest are dropped.
- **Where the results go.**
  - Answers go through the ordinary answer route, so they reach mastery (the review schedule) and the scorecard.
  - First tries carry their `objective_id`, so coverage reads them as retrieval evidence.
  - "One more try" answers are left out of coverage (`requeue_of`). A retry straight after feedback is not a retrieval from memory.
  - Nothing moves a level: the sittings are previews of kind `enforcer`.
- **Resuming and merging:**
  - An end-of-session offer lasts 24 hours and an end-of-day offer 48. After that it rolls into the next scheduled enforcer, which covers those days anyway.
  - Several scheduled enforcers due at once, for a learner back after time away, become one offer of the widest type, over all their windows, sized by the combined budget and planned by the allocation rule.
  - A scheduled day with work but never offered shows as missed.
- **Owner (`ownerBase`): the base version.**
  - Enforcers are there, but nothing is ranked by the owner's record: the window's work in time order, spread evenly.
  - Question times are the standard ones, not the owner's own.
  - The owner can skip any enforcer at any point (`POST /api/retention/enforcers/:id/skip`, 403 for everyone else).
- **Not built from the params file:**
  - the format quotas (the recall / varied / explain mix); only multiple-choice objective items exist, so a "varied" second try is a new question, not a new format;
  - steering toward the target accuracy band (0.70 to 0.85);
  - the overload guards' too-hard and too-easy shifts;
  - out-of-window "overdue" objectives in the pool.

  The last one is left out on purpose: the owner's rule is that the questions come only from what the learner did in the covered window. Older work stays with the folded daily review, below.

## Active time (`services/study-sessions.js`)

- **Heartbeats.** The page sends one every 30 s. It sends it only while the page is visible and the learner has done something in the last 4 minutes, or is working inside a lesson frame. Every answer also counts as activity.
- **Idle gaps.** A gap between two signs of activity counts 5 minutes at most.
- **Not study time.** Time on the enforcer, review and placement pages is not counted.
- **Ending by itself.** A session idle for 30 minutes (`RETENTION_IDLE_END_MIN`) ends at its last activity. A paused one ends at the local day change or after 12 hours. Both count as "left without choosing".
- **Starting by itself.** Answering with no session open starts one, unless an enforcer is waiting.

## The daily review, folded in

With `ENFORCER_FOLD_REVIEW` on (the default), the path's "Today's review" row becomes "Older work to keep". It shows only:
- objectives last answered before the earliest window of any enforcer still to come;
- objectives not kept in an enforcer in the last 20 hours;
- the lessons to learn again.

While the Final is held for consolidation, the review is whole, as before.

`ENFORCER_FOLD_REVIEW=off` restores the old review exactly.

## Data and API

- **New collections:** `study_sessions` and `enforcers`. Both are also in the consent export and delete list (`routes/consent.js`).
- **New routes:** `routes/retention.js`, under `/api/retention/*`. The routes are `state`, `study/start|beat|pause|resume|end`, `enforcers/:id`, `choose`, `finish`, `skip`, and `calendar`.
- **New user field:** `retention`, which tells the client whether to draw the strip and the nav link.
- **State:** `GET /api/retention/state` also returns `scheduled_today` ({type, label, absorbs, done}) for the end prompt.
- **Enforcer rows** for scheduled scopes carry `parts` (one per absorbed scope, with its window and active time), `absorbs` and `day_date`; their items carry `enforcer_try` (1 or 2). The view adds `absorbs`, `planned_topics` and `planned_second_tries`; calendar days and the upcoming list add `absorbs`.
