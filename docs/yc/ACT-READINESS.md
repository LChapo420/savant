# ACT readiness: what the app's ACT prep is today, what's missing, and the build plan

Written 2026-10-28 from the code on `main` (commit `a61170d`). Every statement about the app has a file path.
Statements about the real ACT are marked **UNVERIFIED** where they could not be checked: act.org was blocked
by this session's network policy (see `SOURCES-TO-VERIFY.md`).

**What can't be seen from the repo:** `data/` is gitignored ("Learner data, ledgers and database backups
(all of data/)"), so the live `data/db.json` isn't here, and neither is `.env`. That means three things can't
be confirmed from the code alone:
- the stored ACT placement set;
- any stored ACT lesson or quiz plans and cached AI items;
- which AI providers the live server has configured.

These are flagged where they matter.

## Summary

The ACT track is a **very large, well-structured syllabus running on the app's general adaptive engine**:
- placement into one of 16 grades;
- lessons, practice and 75% mastery quizzes;
- remediation from wrong answers;
- scheduled spaced review.

**What it is not yet is ACT prep that can show a score gain in weeks.** Nothing in the app:
- measures or reports an ACT score;
- knows the student's test date;
- times a section;
- serves questions in the real test's format (English passages with underlined portions, Science with tables
  and figures, Reading as multi-question passage sets).

Some level descriptions the learner reads on the path also promise things the app doesn't do yet, such as "a
half-section at real ACT timing ... Scored like the real ACT" on a Timed Task. **Fix that first:** it's a
credibility problem with users, and with investors.

---

## 1. How a learner studies for the ACT today

1. **Picks ACT.** It's visible to every account. `/api/catalog` returns every track (`routes/catalog.js` lines
   16 to 29), and onboarding draws a card for each with "Find my grade" and "Pick a grade yourself"
   (`public/js/onboarding.js` lines 51 to 90). The server serves only `public/` (`server.js` line 190).
2. **"Find my grade"** (`routes/subject-placement.js`, `services/subject-placement.js`):
   - Seven questions per grade (easy, easy, medium, medium, hard, hard, capstone; `config/subject-placement.js`),
     so 112 across 16 grades.
   - The set is read from `placement_question_sets` in the database (`services/subject-placement.js` lines 243
     to 251). The ACT set was added on 2026-10-24: 112 questions, with keys checked by models from a different
     family than the writer, and 13 doubts source-checked (`curriculum-build/LIVE-CHANGES-2026-10-24.md`, the
     "ACT subject placement set added" row). It lives in `data/db.json`, so it can't be inspected here.
   - Each question's position on the grade scale comes from model judges (`content/placement-calibration/act.json`,
     84 points), **not from real students' results**.
   - Modes (`services/adaptive-placement.js` lines 57 to 67): quick (up to 32 questions, 14 minutes), balanced
     (70, 32 minutes), accurate (130, 57 minutes), or a full climb.
   - Then an in-grade placement quiz from the bank (`routes/placement.js`, `services/placement.js` lines 26 to
     43). ACT has no unit-placement bank: `content/unit-placement/` holds only English, math and reading.
3. **Works through the grade.** Each of the 16 grades is named by a target composite band ("Target composite:
   about 19-21", and so on; `content/act-grades.js`). Every level runs through `POST /api/sessions`
   (`routes/learn.js` line 226), and the level's type decides what happens:

   | Level type (count across all 16 grades) | What the learner gets | Where the questions come from |
   |---|---|---|
   | Lesson (892), Grade Review Lesson (16) | A lesson page | AI-written block pages when a model provider is up (`services/block-levels.js`). No ACT base lessons ship in the repo: `content/base-levels/` has only `english-proficient.json`. |
   | Activity (8,028), Tester (144), Summary (252), Grade Review Activity (144) | A practice session of 5 to 18 items (`services/learner.js` line 381) with due reviews mixed in | The deterministic bank (`content/bank.js`). AI items only from a cache, which is filled in the background (`services/ai.js` lines 364 to 459). 1,314 levels are served as bank-fed games instead (`services/game-bank.js`). |
   | Master Quiz (126), Grand Master (63), Final (16) | A checkpoint of 15, 25 or 40 questions (`CHECKPOINT_LENGTH`, `config/curriculum.js` line 607); 75% to pass | AI-tailored or stored quiz plans when available, otherwise the bank (`services/sessions.js` lines 597 to 622) |
   | Timed Task (63), Task Revision (63) | Served as ordinary practice | As for Activity |

4. **Fails a checkpoint:** the app reads the wrong answers, diagnoses the misunderstanding behind them, and
   teaches those areas; the retry is always open (README, "Not passing a checkpoint").
5. **Review:** earlier skills come back by a forgetting-curve model, with SM-2 as a fallback
   (`services/sessions.js`, `services/mastery.js`). There's also a daily review session
   (`services/review-session.js`), and weekly-to-monthly retention checks (`services/retention-schedule.js`,
   `services/enforcers.js`). A consolidation rule can hold a grade's Final for up to 21 days
   (`services/consolidation.js`). **None of this is ACT-specific, and none of it knows a test date.**

## 2. What exists (verified in the code)

| Piece | Evidence |
|---|---|
| 16 grades, 9,807 levels, built from an ACT workbook. Topics are tagged by section and interleaved: [Math], [English], [Reading], [Science], [Writing], [Strategy]. | `content/act-grades.js`; `docs/CURRICULUM-BUILD-GUIDE.md` section 9 |
| 37 skills, every one with a deterministic question generator (`bank.missingSkills()` is empty) | `scripts/act-curriculum-test.js`; `content/bank.js` |
| 112-question placement set, plus calibration points | `curriculum-build/LIVE-CHANGES-2026-10-24.md`; `content/placement-calibration/act.json` |
| Mastery quizzes at a 75% pass mark, with remediation from actual wrong answers | `config/curriculum.js`; README |
| Spaced review and retention checks | `services/mastery.js`, `services/review-session.js`, `services/retention-schedule.js` |
| 14 reading passages with 68 questions, shared with the ACT reading track | `content/passages.js` (6 passages, 28 questions), `content/passages-2.js` (8, 40) |
| A content research base for the enhanced ACT (section lengths and timing, composite = English + Math + Reading, reporting categories) | `docs/CURRICULUM-BUILD-GUIDE.md` section 9 (an earlier session's research; the numbers need the act.org check) |
| Tests | `scripts/act-curriculum-test.js`: four checks pass. The fifth fails on a clean clone, because it reads `data/ACT_Coverage_Map.csv`, which is gitignored. I ran it on 2026-10-28. |

## 3. What's missing for "ACT prep that measurably raises a score in weeks"

Ordered by how much each one matters to that goal.

1. **No ACT score anywhere.** Nothing computes, shows or stores a 1-36 section or composite score, a
   predicted score, or a score history, and a learner can't enter an official or practice-test score. Searches
   for composite, scaled and score fields in `routes/`, `services/`, `config/` and `public/js/` find nothing
   except the Spanish check. Session results are plain accuracy. Without a score, nothing can be "measurably
   raised".
2. **No test date.** `services/goals.js` lines 33 to 71 offer a generic "Prepare for a test or exam" goal with
   no date field. "ACT in spring" appears only as placeholder text in a free-text survey field
   (`services/learner.js` lines 118 to 122). Nothing shortens the path to fit the weeks a student has left.
3. **The path is far too long for weeks.** One grade is 408 to 785 levels (`content/act-grades.js`), and a
   student moving up one band works through a whole grade. A student six weeks from the test needs the
   highest-value skills for their weak sections, not a complete grade in order.
4. **No timing.** "Timed" exists only in level titles and descriptions. No session sets or shows a timer
   (`public/js/session.js` subtitle and heading code), and bank games are required to have no time limit:
   `services/game-bank.js` line 757 flags "a time limit is set" as a problem. Timing is a large part of the real
   test.
5. **The question format isn't ACT's.**
   - **English:** single-sentence items ("Choose the correct verb ..."). There are no passages, no underlined
     portions and no "NO CHANGE" option: 0 occurrences of "NO CHANGE" in `content/english-*.js`. The player
     shows a passage as one plain text block with no underline markup (`public/js/player.js` lines 64 to 65).
   - **Science:** `act_science` items describe the data in one sentence ("Study 1: as temperature rose ...").
     There are no tables, graphs or multi-question experiment sets. `act_data` tables are one line of text.
   - **Reading:** 14 passages in total, not the multi-question sets of the real test.
   - `docs/ROADMAP.md` line 147 planned "passage sets for English and ACT". They weren't built.
6. **The ACT-specific bank is thin, and most levels lean on it.** `act_rhetoric` is the skill on 2,582 levels
   and `act_data` on 1,638. In a 600-draw sample I ran on 2026-10-28, the bank produced only 19 distinct question
   shapes for `act_rhetoric`, 10 for `act_science` and 5 for `act_data`. Part of the reason: `scripts/build-act-grades.js`
   lines 172 to 175 tag every strategy or test-management level it can't classify as `act_rhetoric` ("the closest
   bank family"). So a level about pacing serves rhetoric questions.
7. **The copy promises what isn't built.** For every level that isn't a checkpoint, the path page shows the
   level's description (`public/js/path.js` lines 113 to 116). A Timed Task, for example, says "a half-section at
   real ACT timing ... Scored like the real ACT (scaled estimate for sections ...)", and what runs is an untimed
   practice session. Checkpoints show only "Covers everything up to here. Pass mark ...". But the curriculum
   data still describes each Final as, for example, "Full-length timed ACT practice test (English, Math,
   Reading, Science and the 40-minute Writing essay) under real timing ... Scored on the 1-36 scale" (grade 7),
   and what runs is an untimed 40-question quiz with a 75% pass mark. I didn't trace whether that Final text
   reaches the learner anywhere else, or reaches the prompts that write the quiz.
8. **No ACT Writing.** The written checkpoints (an essay marked against a rubric) belong to the English track
   (README). ACT Writing levels run as ordinary practice.
9. **Unknowns in production:**
   - Whether lessons and quizzes are AI-written depends on the live `.env` providers. If none is configured,
     ACT runs bank-only.
   - The placement set and any stored plans are in `data/db.json`.
   - The beta invite gate is built (`middleware/beta-gate.js`, `services/beta-invites.js`) but not mounted in
     `server.js` on `main` as of this commit. Another session is doing the deploy.
10. **`npm test` fails on a clean clone** at the ACT coverage-map check (item 2's table above). That's small,
    but anyone checking the repo will hit it.

## 4. Build plan, in priority order

Estimates are **rough guesses for one founder working with AI coding tools**, in focused days. They aren't
measured. "Done when" is the test of finished. The app code is owned by other sessions this week, so this is
a plan, not changes made here.

### P0: before the first outside student (this week)

| # | Build | Effort | Done when |
|---|---|---|---|
| 1 | **Make the copy true.** Rewrite the Timed Task, Final and "scored on the 1-36 scale" descriptions in the workbook (`data/ACT_Grades_Topics.xlsx`, rebuilt with `npm run build:act`) to say what the level actually does, until items 4 to 6 exist. | 0.5 to 1 day | no level description promises timing, scaling or a "full-length test" the app doesn't deliver |
| 2 | **Score entry and test date.** A small ACT profile: test date; the target score; section scores from each official practice test (date, form, English, Math, Reading, optional Science); and later the real ACT scores. Show the history as a simple chart. | 1 to 2 days | a learner can record a practice-test score, and it shows on their ACT page |
| 3 | **The measurement kit** (section 5): an instruction page, links to the official practice tests, and a spreadsheet or admin view of every participant's before and after scores | 0.5 day | the protocol in section 5 can be run with the first 5 students |

### P1: weeks 1 to 2 (makes "in weeks" possible)

| # | Build | Effort | Done when |
|---|---|---|---|
| 4 | **Test-date plan.** From the test date and the diagnostic section scores, pick the skills with the most points available in the weakest sections, and lay out a path that fits the weeks left, with review timed to peak at the test date. This reuses placement, mastery and the retention scheduler; the new parts are the date and the choosing. | 3 to 5 days | a student 6 weeks out gets a plan of a fixed number of sessions, not a 700-level grade |
| 5 | **Real timing.** A section timer for Timed Tasks and Finals, at the enhanced ACT's section lengths (UNVERIFIED: confirm the numbers on act.org first), with pacing feedback (time per question against the allowance) | 2 to 3 days | a timed level shows a clock, ends at time, and reports pacing |
| 6 | **ACT-format English.** Passages with numbered underlined portions and "NO CHANGE" choices: the player markup, a schema, and a first set of passages written and fact-checked through the existing pipeline | 4 to 6 days | English practice can serve a 15-question passage the way the real test does |
| 7 | **Fix the skill tagging.** Give strategy and pacing levels their own skill (or the right content skill) instead of the `act_rhetoric` fallback, and grow the `act_rhetoric` and `act_data` banks | 1 to 2 days | the fallback at `scripts/build-act-grades.js` line 175 tags no levels |

### P2: weeks 3 to 6

| # | Build | Effort | Done when |
|---|---|---|---|
| 8 | **Science passages** with tables and figures, as sets of 5 to 7 questions per experiment or data set | 5 to 8 days | Science practice uses a figure the learner has to read |
| 9 | **Reading passage sets** in the ACT format (several questions per passage, including a paired-passage set) | 4 to 6 days | at least one full-length Reading section can be assembled |
| 10 | **ACT Writing** with the four ACT domains, reusing the English track's essay marking | 3 to 4 days | an ACT Writing level is written and scored by domain |
| 11 | **A score estimate**, only after real data: once students have both practice-test scores and app accuracy, fit and validate a mapping. Until then, show only the official practice-test scores the student entered, never an invented 1-36 estimate. | after 30 or more paired results (a guess at what's needed) | the estimate's error against the next official practice test is measured and shown |
| 12 | Make `npm test` pass on a clean clone: ship the coverage map, or skip that check when the file is missing, with a message | 0.5 day | `npm test` passes after `npm ci` on a fresh clone |

What not to build first: more grades, more subjects, games for ACT, or a score predictor before there's data.

## 5. How to measure score gains honestly

The question to answer: **do students who use Savant for a few weeks score higher on an official ACT
practice test than they would have anyway?** "Anyway" matters, because retesting alone raises scores.

### 5.1 The instrument: official free ACT practice tests

- Use **ACT's own free practice tests**, never Savant's questions, so the test isn't the thing the app teaches
  to. UNVERIFIED: a search summary says ACT offers "two full-length online practice tests for the enhanced
  ACT, available in timed and untimed versions" (https://www.act.org/content/act/en/products-and-services/the-act-educator/the-act-test/enhancements-k12/faqs.html),
  and the free *Preparing for the ACT* booklet (https://www.act.org/content/dam/act/unsecured/documents/Preparing-for-the-ACT-e.pdf)
  contains a practice test with scoring tables. **Open both pages and confirm how many current-format tests
  exist before designing around two.**
- Students take the test **timed**, in one sitting, and score it with ACT's own scoring tables. Record the
  section scale scores and the composite (English, Math, Reading; Science separately, since it's not in the
  composite), and keep the raw answer sheet or a screenshot.

### 5.2 The design

1. **Pre-register before anyone takes a test.** Write down, then seal and time-stamp with the same tooling as
   `spanish-check/` (`scripts/seal.js`, `scripts/timestamp-seal.js`):
   - the question;
   - which practice tests are "before" and "after";
   - the gap in weeks;
   - the minimum Savant use that counts;
   - what will be reported.

   Nothing can then be tuned after the results come in.
2. **Before:** practice test A, timed. Record the student's test date and any other prep they're doing.
3. **Savant for a fixed period**, for example four weeks. The app logs minutes, sessions and levels, so the
   dose is measured, not self-reported.
4. **After:** practice test B, timed, under the same conditions.
5. **Counterbalance the forms.** Half the students take A then B, the other half B then A, so a harder form
   can't pass for a gain.
6. **Compare against a baseline, not zero.**
   - **External baseline (UNVERIFIED):** an ACT research brief reportedly found an average composite gain of
     1.14 points between first and last real test, about 8.3 months apart
     (https://www.act.org/content/dam/act/unsecured/documents/2022/R2274-Six-Things-About-Score-Gains-From-Retesting-10-2022.pdf).
   - **Coaching effect (UNVERIFIED):** reportedly under one ACT composite point on average (Briggs, NACAC 2009;
     `MARKET.md` section 5).
   - **A better internal comparison:** a wait-list group. Students who sign up take test A, then either start
     Savant now or start after test B (four weeks later). Only do this with their agreement, and never ask a
     student to delay prep right before their real test date.
   - **A cheap internal check:** Savant's test-date plan targets the weak sections. Compare the gains in
     sections the plan targeted with those it didn't, for the same student.
7. **Report everyone.** That includes students who dropped out, partial use, and gains that are zero or
   negative. Say how many started, how many finished, and why people left.
8. **Follow up with the real ACT.** For students who sit the December 12 national date or the spring Nebraska
   state ACT (both UNVERIFIED dates; `OUTREACH.md` section 1), ask for their official score as the final outcome.

### 5.3 What the numbers can and can't support

- **Noise.** ACT score reports reportedly show about ±1 composite point as the standard error of measurement
  (UNVERIFIED; *ACT User Handbook*,
  https://www.act.org/content/dam/act/unsecured/documents/ACT-UserHandbook.pdf). So one student's +1 or +2
  tells you nothing; only an average over many students does. Work out how many students you need from the
  spread of gains in the first pilot, not before.
- **Self-selection.** Students who sign up for free ACT prep are motivated, and would improve anyway. The
  wait-list group is what controls for that.
- **Exposure.** The official practice tests are public, so ask each student whether they have seen the form
  before, and exclude, by the pre-registered rule, anyone who has.
- **Other prep.** Ask, and report it.
- **What you can say afterwards:** "N students took official ACT practice test A, used Savant for a median of M
  hours over W weeks, then took test B. Their average composite change was X (range a to b), against Y for the
  wait-list group and about 1.1 points for retesting in ACT's research." **Not** "Savant raises ACT scores by X
  points", which needs far more evidence than a first pilot.

### 5.4 A minimum version for this week

If even that is too much before the application deadline: the founder takes official practice test A now,
timed, records the score with the date and a screenshot, and seals that record (as the Spanish check is
sealed). That is n = 1, so it proves nothing about other students. But it is the first true ACT number the
company has, and it starts the before-and-after record.
