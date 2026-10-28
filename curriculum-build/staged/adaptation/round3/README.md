# Staged: adaptation round 3, the owner decisions as one-step patches

Round 2 (`../../../ADAPTIVE-COVERAGE.md` sections 5 and 7) proved its fixes in simulation: with adaptive2, every learner passes the Final, in 49% of linear's study minutes, with 95.7% 30-day recall. Those fixes needed path, session and screen changes that were not built. This folder builds them, one patch per owner decision.

**Nothing here is live.** Each patch is off by default behind its own flag.

## How to apply (any one, any subset, in number order)

```
cd <repo root>
git apply --check -p1 curriculum-build/staged/adaptation/round3/01-daily-review.patch   # dry run
git apply -p1 curriculum-build/staged/adaptation/round3/01-daily-review.patch
# then set the flag in .env and restart
```

- **Independence:** each patch applies cleanly on its own to today's tree (`git apply --check -p1`). Every subset of the five also applies, in number order. All 31 subsets were checked, with `node --check` run on every changed file.
- **The one dependency:** patch 02 does nothing unless 01 is applied and on. A consolidation stretch with no review to do would only be a wait, so 02 switches itself off without 01.
- **What else they need:** they use read-only helpers already in the live `services/adaptation.js` (`dailyReview`, `consolidation`, `remediationPlanFor`, `heldPlanFor`, `effortFor`). These were added this round, and nothing live calls them.
- **New tests:** each patch brings a test, `scripts/round3-*-test.js`. The tests are not added to `npm test`, so the patches don't collide on `package.json`. Add them to the chain when you apply a patch.
- **Undo:** `git apply -R -p1 <patch>`.

## The five decisions

### 01 Daily review session (decision 6): `ADAPT_REVIEW_SESSION=on`

**What the learner sees**
- **On the path:** a "Today's review" row at the top of the path. It says, for example, "7 questions, about 5 min: 2 memory checks, 5 fading. 1 to learn again."
- **The review page** (`/review?enrollment=`) lists what is due and why:
  - **Memory check:** something you proved a day or more ago. One right answer now counts it as kept.
  - **Fading:** the forgetting curve says it is slipping.
  - **Make it last:** kept, but not yet likely to last 30 days.
- **The sitting:** one question per objective, with feedback after each, at most `ADAPT_REVIEW_MINUTES` (10) a day. Typed answers where the skill has them.
- **Forgotten objectives** are not questions. They are listed as "Learn again", each with a button that opens its lesson.
- **Afterwards:** a summary (right, XP, days in a row, kept in this grade), and "Done for today" on the path.
- **Nothing here moves the level.**

**Server**
- **What's due:** `adaptation.dailyReview`, which is `reviewQueue` with the fitted curve, durability and re-teaching, cut to the time budget.
- **New files:** `services/review-session.js` and `routes/review.js`.
  - `GET /api/review/:id`, `POST /api/review/:id/start`, `POST /api/review/sessions/:id/finish`.
  - All three answer 404 while the flag is off.
- **The session:** a new kind, `review`. It is stored with `preview: true`, so it can never clear, advance or hold a level.
  - Opening the learner's own level closes an open review instead of resuming it.
- **Questions:** every question carries `objective_id` and `objective_test`, so it is evidence on that objective alone.
- **Objective items:** once the staged objective items are imported as `content/objective-items/<track>.<grade>.json` (decision 3), they are used first. Until then, the review uses the bank's question on the objective's skill, at its lesson's difficulty.

**Files:** `server.js` (1 mount line), `public/js/path.js`, `public/css/style.css` (section 14), and new: `public/review.html`, `public/js/review.js`, `routes/review.js`, `services/review-session.js`, `scripts/round3-review-test.js`.

**Tuning:** `ADAPT_REVIEW_MINUTES` (10), `ADAPT_ITEM_MINUTES` (0.75), `ADAPT_RETEACH_MINUTES` (6), `ADAPT_RETEACH` (3 a day), `ADAPT_DURABLE_AT` / `ADAPT_DURABLE_DAYS`.

### 02 Consolidation before the Final (decision 7): `ADAPT_CONSOLIDATE=on`, needs 01 on

**What the learner sees**
- **Before the first sitting of the Final**, while the record says the grade will not last, the path's main action becomes "Today's review".
- **Under it, a line:** "Before the Final: about 10 minutes of review a day until this grade will last. Day 1 of at most 21; the Final opens by November 13, or sooner." Beside it, a meter: "Likely to last a month" against 90%.
- **The next grade is never blocked:**
  - **Start <next grade> now** enrolls the learner and takes them to its placement.
  - **Go on with <next grade>** appears instead if they are already enrolled there.
- **Asking for the Final early** (from a link or the path row) shows a plain note with "Today's review", not an error.

**How the stretch ends**
- **It ends** when 90% of the grade's objectives are predicted to be recalled 30 days on (`ADAPT_CONSOLIDATE_AT`), or after 21 days (`ADAPT_CONSOLIDATE_DAYS`). Either way it stays ended.
- **It never applies to:**
  - a retry after a missed Final;
  - a Final already under way;
  - a held graduation;
  - the owner's account.
- **Simulation (round-2 ablation):** removing this stretch drops 30-day recall from 95.6% to 80.0%. It costs calendar days, not study minutes.

**Files:** `routes/learn.js` (a hold on the Final in `POST /sessions`, plus `GET /api/consolidation/:id`), `public/js/path.js`, `public/js/session.js` (the note), `public/css/style.css`, and new: `services/consolidation.js`, `scripts/round3-consolidation-test.js`.

### 03 "Too fast to count" on checkpoints and the Final (decision 8): `ADAPT_EFFORT=on`

**What the learner sees**
- **On a Master, Grand Master, essay quick check or the Final:** an answer faster than 1.2 s (`OBJ_RAPID_MS`) is not scored.
  - A note says: "Too fast to count. That answer came in too fast to count, so it is not scored. Here is another question on the same thing. Take your time…"
  - A parallel question takes its place: the same skill, difficulty, place and format, and the same objective when tagged.
- **At most twice per question** (`ADAPT_MAX_RESERVE`, 2). After that, the answer stands as given.
- **The bar does not move:** the question count and the pass mark are unchanged.
- **Slow-down feedback:** in practice, a rapid answer from a learner whose own record flags rushing gets a one-line note under the verdict. The flag comes from `adaptation.effort`: more than 5% rapid answers, 95% sure, on at least 30 answers. The note changes no score.

**What is recorded:** the set-aside answer is kept on its item (`reserved`, with its time) and never graded. The live `services/coverage.js` reads it as a rapid answer: evidence of rushing, never of knowing.

**Simulation:** rushers who pass the Final go from 54% to 100%.

**Files:** `routes/learn.js` (answer route), `services/sessions.js` (`sanitize` sends `reserved`), `public/js/session.js`, `public/css/style.css` (section 11), and new: `services/effort-monitor.js`, `scripts/round3-effort-test.js`.

### 04 Record-based remediation after a missed Final (decision 9): `ADAPT_REMEDIATION=on`

**What the learner sees:** "Work on what went wrong" after a missed Final opens with "What your record says to do first", read from every answer in the grade. It has two lists:
- **Learn again:** objectives that are unproven, or proven and since forgotten, weakest first, at most 6. Each has an "Open the lesson" button.
- **Recall:** kept objectives that are fading, lowest predicted recall first, at most 12. "Start 12 recall questions" runs one question per objective with the answer straight after, then scores the round.

**What stays the same**
- The skill areas, tutor diagnosis and drills are unchanged below the record plan.
- The retry is always available.
- Master and Grand Master quizzes are unchanged.

**Files:** `services/remediation.js` (the plan stored on the remediation row), `routes/remediation.js` (`/recall`, `/recall/finish`), `public/js/help.js`, `public/css/style.css` (section 22), `scripts/round3-remediation-test.js`.

**Note:** recall answered the same day as the missed Final counts as relearning, not as memory checks. The memory model needs a gap of half a day or more since the objective was last answered, and the Final's questions just touched these objectives. This is by design.

### 05 Graduation-held screen (decision 1): `COVERAGE_GATE=enforce` (default `shadow`)

**What the learner sees**
- **After passing the Final**, if objectives are not yet proven and kept, the recap says: "Graduation exam passed at 90%. Graduation waits on 12 objectives your record has not yet seen proven and kept; you will not sit the Final again." Its button is "See what graduation waits on".
- **The path** says the same, with the same button.
- **The held page** (`/held?enrollment=`) shows a "Proven and kept" meter and three lists:
  - **Learn again:** forgotten objectives, with a button to open the lesson.
  - **Not proven yet:** with a button to open the lesson.
  - **Memory checks:** each says "Ready now" or "Ready Saturday 5:50 AM". With patch 01 on, a "Do the memory checks now" button opens today's review; without it, a check means answering the lesson's own questions again.
- **When the record is complete**, the page offers "Graduate". This asks the same gate again (`mastery.clearCheckpoint`), so the bar never moves.

**Server:** `GET /api/coverage/:id/held` and `POST /api/coverage/:id/graduate`, in the new `routes/coverage.js`.

**Files:** `server.js` (1 line), `public/js/path.js`, `public/js/session.js` (recap), `public/css/style.css` (section 16), and new: `public/held.html`, `public/js/held.js`, `routes/coverage.js`, `scripts/round3-held-test.js`.

## Test results (2026-10-23)

- **Where the tests ran:** a scratch copy of the app with all five patches applied, on a copy of `data/db.json`, with every key blanked and `OLLAMA_ENABLED=0`. `ollama-provider-test` ran without that variable, because it mocks HTTP and checks the variable itself. The runner is `tools/chain.js`.
- **Full `npm test` chain plus `learner-path-test` and the five new tests:** 37 of 37 pass.
- **Each patch applied alone:** its own test, `coverage-test` and `self-test` all pass.

| new test | checks | covers |
|---|---|---|
| `round3-review-test.js` | 33 | off gives 404; what is due and in what order; time budget; start and resume; answers through the ordinary route; memory check recorded; level unchanged; done for today; an open review never taken for the level; ownership and 401 |
| `round3-consolidation-test.js` | 25 | off, and off without 01; active on the Final; day and end date; Final refused with 409; earlier lessons still open; next grade can be started; ends on time or when durable and stays ended; not for retries, a Final under way, held, or below the Final |
| `round3-effort-test.js` | 25 | off scores as before; rapid answer set aside with a parallel question; chain counted; third answer stands; scored count unchanged; coverage counts rapid; practice not monitored; `ADAPT_MAX_RESERVE=0`; slow-down only for a flagged learner |
| `round3-remediation-test.js` | 22 | off unchanged; record plan (forgotten and unproven to re-teach, faded to recall, capped); payload; recall round tagged by objective; scored and kept; level unchanged; Master quiz unchanged; ownership |
| `round3-held-test.js` | 22 | shadow graduates as before; enforce holds; what each objective needs; due now or due at; graduate refused until complete, then graduates and is released; guards |

**Patch checks**
- `git apply --check -p1` is clean for all five on today's tree.
- All 31 subsets apply in number order.

**Live tree**
- **Untouched** except the two owned service files. Checked with a diff against the snapshot taken at the start.
- **`services/adaptation.js`:** about 260 lines of round-3 helpers, inert.
- **`services/coverage.js`:** `answersFor` also reads a set-aside answer as a rapid one. Only patch 03 creates set-aside answers.
- **Backups:** in scratchpad `before-adaptation-r3/`.

## Screenshots (`screenshots/`, each at 1280 and 375 px)

The click-through ran on the placement-uitest server copy: port 6799, a copy of `db.uitest.json`, all five flags on, keys blanked. It used a seeded adult test learner with five enrollments (`tools/seed-ui.js`, `tools/shoot-all.sh`). No page overflowed horizontally at either width, and no page logged a console error apart from the expected 409 when the Final is refused.

| file | what it shows |
|---|---|
| `01-path-review-node` | the "Today's review" row at the top of the path |
| `02-review-overview` | the review page: counts, the two meters, what is in it, learn again |
| `03-review-question`, `04-review-verdict` | the sitting, a memory check, a verdict |
| `05-review-done` | the summary. The run answered everything wrong on purpose: the two failed memory checks became "Learn again", as designed |
| `06-consolidation-path` | the Final's level during consolidation: today's review, go on with the next grade, the 90% meter |
| `07-consolidation-final-waits` | the note when the Final is asked for during the stretch |
| `08-remediation-help` | after a missed Final: learn again and recall above the skill areas |
| `09-held-recap` | the Final passed, graduation held |
| `10-held-page`, `10b-held-path` | what graduation waits on, and the path's action |
| `11-too-fast` | the "too fast to count" note with its parallel question |

## Known limits and follow-ups (not blockers)

- **Memory-check questions:** until the objective items are imported (decision 3), a memory check is the bank's question on the objective's skill. A skill-level question does not test the objective as closely; the round-1 simulation measured this.
- **The held recap's analysis line** still says "the next one steps up". That line comes from the rule-based session analysis, which these patches don't touch; it could be reworded when patch 05 is applied.
- **"Retake placement" on the Final's level:** during consolidation it sits between "Today's review" and "Go on with…", because the existing code inserts it after the first button.
- **The dashboard** does not show the review yet. The path does.
