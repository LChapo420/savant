# YC backlog: the standing work queue

The owner's standing order (2026-10-28): keep improving whatever raises the chance of getting into YC W27
(deadline Nov 2, 2026, 8 pm PT; interviews and decisions by Dec 11) and a16z speedrun SR008 (closes Nov 1,
11:59 pm PT). Keep going until accepted. Every cloud run takes the **top unclaimed item**, finishes it, and
updates this file.

## How a run works

1. Work on branch `yc-next`. Pull it first (`git pull --rebase origin yc-next`).
2. Take the first item under **Queue** that isn't marked `[claimed …]` or `[local only]`. Mark it
   `[claimed <UTC time>]`, commit and push that one line straight away, so two runs never take the same item.
3. Build it fully, with tests. Read the files the item names before changing anything.
4. Run `npm test`. It must pass. If an existing test breaks for a reason outside your item, fix it only if the
   fix is small and obviously right; otherwise note it under **Blocked** and stop.
5. Move the item to **Done** with the date, the commit, and one line on how it was checked. Add any new item
   you discovered to the right place in **Queue**, with a reason.
6. Commit with a clear message and push to `yc-next`. **Never push to `main`, never merge into `main`, never
   open or merge a PR into `main`.** The owner approves every merge.
7. If an item is too big for one run, split it: finish a working, tested first slice, and put the rest back in
   the Queue as its own item.

## Rules that never bend

- Never edit the sealed Spanish tests: `spanish-check/`, `spanish-check-lc/`, `routes/spanish-check*.js`,
  `public/spanish-check*`, `public/spanish-listening*`, `public/js/spanish-check*`, `public/js/spanish-listening*`.
- Never commit secrets, `.env` or anything under `data/` (it's gitignored: learner data lives only on the
  owner's machine).
- No spending: never add code that calls a paid AI provider outside the existing ledgers
  (`services/anthropic-ledger.js` $24 stop, `services/standard-compute-ledger.js` $20 cap, the LLM Gateway
  ledger $5 for speech only). Never call OpenRouter.
- Honesty: never write a claim, number or quote you can't point to. Outside facts you couldn't open are marked
  **UNVERIFIED** and added to `docs/yc/SOURCES-TO-VERIFY.md`. Never invent users, traction or scores. The
  founder's pre-ACT score is never quoted.
- The founder is 16. Anything that touches minors' data follows `docs/yc/PRIVACY.md`.
- Don't draft the YC or speedrun application answers: the owner said the product will change too much first.
  Fact banks, evidence and interview prep are fine.
- Match the code around you: plain Node/Express, vanilla JS in `public/js/`, the existing CSS. Mobile first:
  check every page at 375 px wide.

## Queue (highest value first)

The wedge is **ACT prep**. What moves YC most is real outside users and honest evidence that the app raises
scores, so items that unblock those come first. Plan source: `docs/yc/ACT-READINESS.md` section 4.

3. **Measurement kit, third slice** (local: needs the owner). (a) The owner fills the `OWNER:` lines in
   `docs/yc/ACT-STUDY-PROTOCOL.md`, then seals and RFC 3161 time-stamps it with `spanish-check/scripts/`; (b) the
   owner decides whether to use the wait-list arm; (c) look at `/act-study` and `/act-study-admin` at 375 px in a
   real browser, signed in (a cloud run has no session; do it on the owner's machine or with a seeded demo login).
4. **An ACT landing page** at `/act` for students and parents: what it does today (truthfully), how it adapts,
   privacy in plain words, and one clear "Start free" button into onboarding with ACT preselected. Done when it
   loads fast on a phone and every claim on it is true of the code.
5. **Activation funnel numbers.** Extend the real-user metrics (`scripts/real-user-metrics*.js`) with the
   funnel YC asks about: signed up, finished onboarding, first lesson, came back day 2, came back week 1,
   minutes per active day. Excludes test and demo accounts. Done when one command prints it, with tests.
6. **Test-date plan** (item 4): from the test date and section scores, choose the skills with the most points
   available in the weakest sections and lay out a fixed number of sessions that fits the weeks left, with
   review timed to peak at the test date. Reuse placement, mastery and the retention scheduler.
7. **Real section timer** (item 5) for Timed Tasks and Finals, with pacing feedback. Section lengths are
   UNVERIFIED until checked on act.org: make them one config object and flag them.
8. **ACT-format English player** (item 6): passages with numbered underlined portions and "NO CHANGE"
   choices, the schema, and a validator. Content is written later by the owner's local pipeline.
9. **Fix the skill tagging** (item 7): the `act_rhetoric` fallback at `scripts/build-act-grades.js` should tag
   no levels.
10. **Invite a friend.** A share link with a referral code, counted in the metrics. No incentives that cost
    money.
11. **Interview prep, deepened.** For each of the 40 questions in `docs/yc/INTERVIEW.md`, a short answer built
    only from facts in the repo and `docs/yc/`, plus the one number or demo moment that backs it. Mark what
    the founder must fill in from his own experience.
12. **Demo script.** A 60-second and a 3-minute walkthrough of the app for the application video and the
    interview, using the demo account (`scripts/seed-demo-account.js`), with the exact clicks.
13. **Privacy gaps** from `docs/yc/PRIVACY.md` that code can close (deletion, export, parental notice, what
    goes to which provider), one gap per run.
14. **ACT Science passages with figures** (item 8): the player and schema for passage sets with a table or
    chart.
15. **ACT Reading passage sets** (item 9), the player and schema.
16. **ACT Writing** (item 10), reusing the English track's essay marking.

### Local only (a cloud run can't do these: they need `data/`, `.env` or the live server)

- [local only] Make the ACT level copy true (item 1): the workbook is `data/ACT_Grades_Topics.xlsx`.
- [local only] Write and fact-check ACT English passages through the pipeline once item 8 exists.
- [local only] Verify the outside facts in `docs/yc/SOURCES-TO-VERIFY.md` (cloud runs can't open web pages).
- [local only] Put the app online at beta.savantedu.com with the beta kit.

## Blocked

(none yet)

## Done

- 2026-10-28: **Measurement kit, second slice: wait-list arm** (item 3b; commit in this push). A student who ticks "happy to wait" on `/act-study` is assigned alternately to "now" or "wait" (start Savant only after the second test); everyone else is "now". Test order stays balanced within each group. The report, admin page and CSV show each group and flag wait students whose Savant minutes appear in the window (the app cannot stop them). Protocol updated; the choice of baseline is still the owner's. Checked: `scripts/act-study-test.js` (new wait-list section: validation, alternation, balance within group, flagging, by-group counts, CSV column) and `npm test`. Not checked: pages in a real browser at 375 px (moved to the Queue, item 3).
- 2026-10-28: **Measurement kit, first slice** (item 3; commit in this push). `/act-study` (instructions, links to ACT's own free practice tests, consent with a parent-knows box, "have you seen these forms", leave button), `services/act-study.js` + `routes/act-study.js` (`/api/act-study`): counterbalanced A-then-B / B-then-A assignment by the app, before/after pairing from the learner's `act_scores` (form letter A or B), dose from the study-session clock, exclusion of students who've seen the forms, test/demo accounts left out. `/act-study-admin` and a CSV list every participant's before and after, with counts of joined, left, finished and excluded, and a note that the averages are descriptive. `docs/yc/ACT-STUDY-PROTOCOL.md` is a DRAFT, unsealed, with no student numbers. `act_study` is in the account export and deletion. Checked: `scripts/act-study-test.js` (assignment balance, consent rules, pairing, dose window, exclusions, CSV formula defusing, admin-only routes, wiring) and `npm test` exit 0 (`scorecard-evidence-test` failed once on a timing check under load, passed alone and on the full rerun). Not checked: the pages in a real browser at 375 px. The ACT practice-test count and links are UNVERIFIED.
- 2026-10-28: **ACT score entry and test date** (item 2; commit in this push). `/act-scores` (linked from the profile): test date, target composite, and per-test scores (practice or real ACT, date, form, English, Math, Reading, optional Science), charted as inline SVG with a target line, countdown and gap to target. `services/act-scores.js`, `routes/act.js` (`/api/act`), collections `act_profiles` and `act_scores`, included in the account export and in parent/account deletion. Composite is the average of English, Math and Reading; whether Science counts is UNVERIFIED so Science is charted but never in the composite. Checked: `scripts/act-scores-test.js` (41 checks: validation, isolation between learners, caps, export/deletion wiring) and `npm test` exit 0. Not yet checked: the page in a real browser at 375 px (cloud run has no signed-in session); the next run or the owner should look.

- 2026-10-28: **The game-lab course-frame check now runs on a clean clone** (item 1d; commit in this push). `scripts/build-game-fixture.js` adds two synthetic shared sets (english/proficient level 14 Mario, marked a verified replacement; level 24 Moto, held) to `scripts/fixtures/test-db.json`; they pass the real `inspectPayload` and are placeholder questions, not course content. The check now runs as a standard-plan learner with tester tailoring off, so it never asks a model to write a set (the demo account is on a tailored plan and did try to). Checked: `npm test --strict` on a clean clone with no `data/`; the check prints PASS and no `ai:` lines.
- 2026-10-28: **The 5 workbook CSV steps now run on a clean clone** (item 1c; commit in this push). Spanish reads the committed `docs/spanish-replica/Spanish_Fluency_Path.csv`; IQ, chess, piano and basketball read sheets rebuilt each run into a temp dir from the committed `content/*-grades.js` by `scripts/build-test-sheets.js` (about 19 MB, so never committed). The tests take `SHEET_DIR` / `SPANISH_SHEET`; the owner's `data/` files win when present. Honest limit: the rebuilt sheets check the content against itself, only the real workbooks check it against the creator's sheet. Checked: no `data/`, `npm test --strict` exit 0 (the run-tests skip list is empty; two in-test skips remain: the ACT coverage map and game-lab course frame, item 1d); `run-tests-test.js` covers the builder. One earlier full run died with a V8 out-of-memory in `round3-consolidation-test` and did not repeat; it passes alone and on rerun, so treat it as a rare flake.
- 2026-10-28: **The 7 db-dependent test steps now run on a clean clone** (item 1b; commit in this push). `scripts/fixtures/test-db.json` is a synthetic db (the demo account from `seed-demo-account.js --offline`, password hash blanked, `@demo.savantedu.test` address only); `npm test` gives each of those steps its own temp copy through `DB_FILE` when `data/db.json` is absent. `subject-placement-test` had a real assumption that the db already held a question set; it now compares against what was stored just before. `game-lab-integration-test` skips its course-frame check loudly when the db has no shared game sets. Checked: no `data/`, `npm test` exit 0, 7 steps on the fixture, 5 CSV steps still skipped; `run-tests-test.js` guards the fixture (synthetic address, no hash). Note: `--strict` still fails on the 5 CSV skips (items 1c, 1d).
- 2026-10-28: **`npm test` passes on a clean clone** (commit 180c7d1). `npm test` now runs `scripts/run-tests.js`; the step list moved to `scripts/test-steps.json`. A step whose gitignored `data/` input is missing is SKIPPED loudly (12 steps: `db.json` ×7, five workbook CSVs); the ACT coverage-map check skips inside its own test. Checked: deleted `data/`, ran `npm test` on this fresh checkout after `npm ci`, exit 0 with the skip list; `scripts/run-tests-test.js` guards the step list. Note: a skip is not a pass, `--strict` fails on any skip, and the full suite still needs the owner's machine.
- 2026-10-28: the overnight review combined the Duolingo-style Spanish activities, 53 pre-written lessons,
  real-user metrics, the demo account, the beta kit, the YC research pack and the LLM Gateway budget into
  `integration-2026-10-28`; `yc-next` starts from it.
