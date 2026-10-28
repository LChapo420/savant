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
- **Redesign in progress (2026-10-28):** the owner is choosing a new visual design for the whole app. Do not restyle pages or change `public/css/` beyond what an item strictly needs; new pages should use the existing CSS variables so they pick up the new look later.
- Match the code around you: plain Node/Express, vanilla JS in `public/js/`, the existing CSS. Mobile first:
  check every page at 375 px wide.

## Queue (highest value first)

The wedge is **ACT prep**. What moves YC most is real outside users and honest evidence that the app raises
scores, so items that unblock those come first. Plan source: `docs/yc/ACT-READINESS.md` section 4.

   **Priority (owner, 2026-10-28 evening): 0b and 0c come first — they are the TikTok demo pieces. Ship a working, demo-able first slice of each as fast as possible.**
0b. **Learn from your own material (owner's request, 2026-10-28; high YC value: it is the "learn anything" demo).**
   A learner uploads study material (PDF, DOCX, TXT/Markdown, or pasted text; photos of notes later) and Savant turns
   it into a course taught with the app's own engine: placement, lessons, retrieval practice, mastery at 75%,
   remediation of the misunderstanding behind wrong answers, interleaving, and spaced review timed to the
   forgetting curve. Build it in slices, each tested and pushed on its own:
   - **(a) DONE, see Done.** (was: Upload and storage.) A `/my-material` page (use the existing CSS variables; a redesign is in
     progress) with upload, paste, a list and delete. Server route with size limits (20 MB, about 300 pages),
     type checks by magic bytes, text extraction (look for an existing dependency first; add a small, well-known
     one only if needed), stored per user under the db layer (private to that user, never shared, deleted for
     real on delete). Rate limits. Tests.
   - **(b) Course builder.** [claimed 2026-10-28 23:15Z] From the extracted text: chunk it, build a concept map, order the skills by
     prerequisite, and for each skill write a short lesson and retrieval questions (multiple choice and short
     answer), every item **grounded in the source** with a pointer to the passage it came from. A second pass
     checks each item is supported by its passage and drops any that are not. Use `services/pool.js` with
     **learner-class providers only** (uploads are learner data: never pipeline-only providers, never
     OpenRouter), the `AI_POOL` kill switch, the existing ledgers, a per-upload token budget, and caching. Tests
     use a mocked provider; no real AI calls in tests.
   - **(c) Teach it with the engine.** The built course appears as a subject on the learner's home and path, with
     a short diagnostic from the material, lessons, practice, mastery quizzes, remediation and the retention
     scheduler, exactly like the built-in subjects. Done when a learner can upload a PDF, get a course, study
     it, and see review come back on schedule (end-to-end test on the fixture db with the mocked provider).
   - **(d) Later:** photos of notes or textbook pages (vision model or OCR), and URLs.
   Privacy: tell the learner in plain words where their file goes and how to delete it; follow
   `docs/yc/PRIVACY.md`. Copyright: personal study use only, never shared with other learners.

0b2. **Harden material parsing.** Run PDF and DOCX extraction in a child process with a time and memory limit, so a hostile or pathological file cannot hang or crash the server (reason: slice (a) parses in-process). Test with a PDF that makes pdf.js loop.

0c. **The tutor talks, remaining slices** (first slice is under Done).
   - **(b) Better voice through the ledger.** Text-to-speech and speech-to-text through LLM Gateway, only via its
     ledger ($5 total, speech only) with a per-user daily cap; the browser voice and recognizer stay the free default.
   - **(c) Context gaps.** The builder reads `material_courses` once item 0b creates it (name it there or adjust
     `materialLines` in `services/tutor-context.js`); add the item and passage on screen from the lesson, practice and
     mastery pages (pages pass it in `pageInfo()`), and a "no answers" mode for timed tasks and finals once those
     pages exist (add their paths to `METHOD_ONLY`).
   - **(d) Look at the dock at 375 px in a real browser, signed in** (a cloud run has no session), including push-to-talk
     on a phone, and Spanish speech on the Spanish lab.

0d. **Tutor: voice and text modes, and it can see the screen (owner's spec, 2026-10-28). Can start now in parallel with 0c:** build the mode memory, the voice/text toggle UI, and the page snapshot builder (plus the vision fallback) as standalone modules with tests. **Leave the LLM Gateway text-to-speech and speech-to-text to 0c (b)**, which runs at the same time: use the browser voice and recognizer through a small interface 0c (b) can plug into. Plug them into 0c's dock if it has landed (pull first); otherwise expose them for 0c to call and add a follow-up line for the wiring.
   - **Two modes, one button:** the learner can talk (push-to-talk or tap-to-talk, with the tutor answering out
     loud) or type (with the tutor answering in text). One clearly visible toggle switches between them at any
     time. **The default is whichever mode the learner used for their last message** (remember it per learner,
     server-side, plus localStorage for instant paint). In voice mode, show the transcript too.
   - **Speech:** as in 0c: browser voices are free, and the better TTS/STT goes through the LLM Gateway ledger
     ($5 total, speech only) with a per-user daily cap. In Spanish lessons, use a Spanish voice; never read
     Spanish in an English voice (`public/spanish/js/core/audio.js` already refuses to).
   - **Sees the screen:** the tutor can look at what the learner is looking at in Savant. Build a client-side
     snapshot of the current page: the visible question or lesson text, the choices, what the learner selected or
     typed, any feedback shown, and the scroll position, as structured text. When that isn't enough (a graph, a
     chess board, a drawing), send an image of the page area to a vision-capable, learner-class model through
     `services/pool.js`. It covers only Savant's own page, never other tabs or the device's screen. When the
     dock opens, say plainly "The tutor can see this page." The server also knows "what should be on the
     screen" (the current item and its answer key), but the tutor must not reveal answers during
     placement, mastery quizzes, timed tasks or study tests.
   - Tests with a mocked provider, including the mode memory, the toggle, the snapshot builder, and the
     no-answers rule during tests.

0a. **Head-to-head study kit, remaining slices** (first slice is under Done). The claim: *per hour of study, Savant teaches everyday Spanish more than Duolingo.*
   - **(b) Sealed multi-participant tests.** Create `spanish-study-tests/` (a new module, **never edit `spanish-check/`,
     `spanish-check-lc/` or their routes and pages**) that copies their engine code with its own fresh seal, per-participant
     draws and logs, and the same integrity rules (timed, one sitting per day, no Spanish text in listening). Pre-test day 0,
     post-test last day; write results with `recordTest` in `services/spanish-study.js`. Until this exists the study cannot run end to end.
   - **(c) Participant and admin pages:** sign-up with consent (teen parental box), daily check-in with the screenshot tick,
     and an admin results page with a per-arm bar chart of gain per hour, the CI and a CSV link (use CSS variables; redesign in progress).
   - **(d) End-to-end fixture test** once (b) and (c) exist. Then the owner fills the `OWNER:` lines in
     `docs/yc/DUOLINGO-STUDY-PROTOCOL.md`, seals and time-stamps it before anyone joins.
   - [local only, later] Find Duolingo's own published efficacy studies and cite them in the protocol, marked UNVERIFIED until a person checks them.

3. **Measurement kit, third slice** (local: needs the owner). (a) The owner fills the `OWNER:` lines in
   `docs/yc/ACT-STUDY-PROTOCOL.md`, then seals and RFC 3161 time-stamps it with `spanish-check/scripts/`; (b) the
   owner decides whether to use the wait-list arm; (c) look at `/act-study` and `/act-study-admin` at 375 px in a
   real browser, signed in (a cloud run has no session; do it on the owner's machine or with a seeded demo login).
4. **Link the ACT page.** Add `/act` to the home page and header once the owner approves the wording (the track blurb in `config/curriculum.js` still says "under the timing the real test imposes", which the app does not do; fix with item 1).
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

- 2026-10-28: `scripts/scorecard-evidence-test.js` check "review today() for a learner on the Final stays under 4 s" is a wall-clock check that takes 4.5 to 5.4 s in the cloud container, with and without the ACT landing page change (reproduced on a stashed, untouched `yc-next`). Every other `npm test` step passed. Not fixed here: raising the limit would hide a real slowdown; the owner should say whether to loosen it for slow machines or profile `review today()`.

## Done

- 2026-10-28: **Learn from your own material, slice (a): upload and storage** (item 0b(a); commit in this push). `/my-material` (`public/my-material.html`, `public/js/my-material.js`, shared CSS only, linked from the profile): upload a PDF, Word (.docx), .txt or .md, or paste text; list with a preview; delete. `routes/materials.js` (`/api/materials`: list, upload as raw body, paste, get one, delete) and `services/materials.js`. File type is decided from the bytes (PDF header, zip with `word/document.xml`, UTF-8 text with no NUL), never the name or content type. Limits: 20 MB, 300 PDF pages, about 900k characters, 20 materials and 3M characters per learner, 12 uploads and 20 pastes per hour per address; a zip's central directory is read first so a zip bomb (over 200 MB unpacked or 5000 entries) is refused before unpacking. Only the extracted text is stored (collection `materials`, owner-only; the file is discarded); delete removes the row and flushes the db file at once. Added dependencies `unpdf` (PDF text) and `mammoth` (DOCX text). Plain-words privacy note on the page. Child accounts cannot upload or paste (same rule as Spanish file uploads); they can still delete. `materials` is in the account export and the account/parent deletion lists. No model is called in this slice. Checked: `scripts/materials-test.js` (58 checks, real PDF and DOCX built in memory: extraction, bad and oversized files, zip bomb, page cap, isolation between learners, deletion from the disk file, caps, wiring) added to `npm test`; full `npm test` otherwise passes ("All steps passed") with `scorecard-evidence-test` skipped, because it stops the runner on the known timing failure under Blocked (4.6 to 4.9 s here, same as before); server boots, `/my-material` serves 200 and the API refuses signed-out. Not checked: the page in a real browser at 375 px signed in (no session in a cloud run); scanned PDFs and photos (they are refused with a message; item 0b(d)). Scope notes: the PDF is parsed by pdf.js inside the server process, so a hostile PDF is a real attack surface; the rate limits and size caps are the guard, and a worker process would be stronger (see Queue).

- 2026-10-28: **The tutor dock, first slice** (item 0c; commit in this push). `public/js/tutor-dock.js` + `public/css/tutor-dock.css` (CSS variables only): a button and chat panel on every page, loaded by `js/app.js`, shown only to a signed-in learner, reusing the existing tutor memory (`services/tutor.js`). `services/tutor-context.js` builds a context block capped at 3,600 characters in priority order (page, goals, ACT date and scores, today's plan with review items due, mastery, weak skills and recent mistakes, diagnosed misconceptions, recent and upcoming topics, style and interests, own courses once 0b exists). Routes `GET/POST /api/tutor/dock`. Integrity is decided on the server from the page path: the sealed Spanish pages get no dock and a 403, placement, subject placement, stage check, skip, enforcer and review pages get "hints about method only, no answers" with a visible note, recent mistakes left out. Voice is the browser's own: speech out on a toggle (Spanish on `/spanish*` pages), push-to-talk where the browser has a recognizer; text always works. Learner data goes only through `ai.talk`, nothing new spends money. Checked: `scripts/tutor-dock-test.js` (32 checks, mocked provider: modes by path, what goes in, the budget, the integrity note, routes, wiring, sealed files untouched) and full `npm test` with the one timing step under Blocked excluded: all steps pass. Not checked: the dock in a real browser at 375 px or push-to-talk (Queue 0c(d)); the paid voice (0c(b)).

- 2026-10-28: **Savant vs Duolingo study kit, first slice** (item 0a; commit in this push). `docs/yc/DUOLINGO-STUDY-PROTOCOL.md` (DRAFT, unsealed, `OWNER:` lines for dose, sample target and sealing; states limits and what a small sample cannot show). `services/spanish-study.js` + `routes/spanish-study.js` (`/api/spanish-study`: me, join, checkin, leave, admin report and CSV): consent (adults, or 13 to 17 with a parent-knows box; under 13 refused; beginners only), arm drawn from the public drand beacon in permuted blocks of four with the round and randomness stored so the draw can be recomputed, Savant minutes from the app's study-session clock, Duolingo minutes self-reported daily with a screenshot tick (missing days flagged), chance-corrected pre/post gain on two tests, gain per hour, per-arm mean with t intervals, Welch difference interval, minimum sample per arm, every participant listed (dropouts included, nothing imputed), demo/test accounts excluded. New collections `spanish_study`, `spanish_study_checkins`, `spanish_study_tests` are in `config/db.js` and the account export and deletion. The sealed Spanish files are untouched. Checked: `scripts/spanish-study-test.js` (about 45 checks, fake beacon, no network) and full `npm test` exit 0 ("All steps passed"). Not built: the sealed participant tests, the pages (see the Queue). Not checked: the live drand call.

- 2026-10-28: **Creator links for the beta form** (item 0; commit in this push). `/beta?ref=<code>` (or `?utm_source=`) serves the home page with the code already in a hidden `ref` field (works without JavaScript; `assets/site.js` also reads the URL and keeps the code for the tab in `sessionStorage`), and the code is stored as `ref` on the beta application, cleaned to a-z 0-9 . _ - (40 characters). `ref` also becomes the visit's source in the visit statistics, so visits count per code. `site/creators.json` (code, name, added; one example row to delete) is display-only: unknown codes are still recorded. `/creators` (`site/creators.html`, noindex) gives the link format and one honest paragraph about Savant, each with a copy button, and says not to promise results. Admin: a new **Creators** tab (per code: visits, applications, consented emails, the emails) and a "Creator code" column on the Beta tab and in its CSV. Checked: `site/test.js` (5 new tests: cleaning and fallback, hidden field and form post, the page, the JSON and summary, and two test codes producing separate counts in the admin); site suite 64 of 65, the one failure (`visits: the admin Visitors tab`, a `land.json` globe check) fails the same on untouched `yc-next`. Not checked: the pages in a real browser at 375 px, and the copy buttons. Notes: a visit-only source nobody listed or applied with is not shown as a creator (otherwise Google would be); anonymous visits (EU/UK without consent) are counted; the live domain is not hard-coded (the page shows the link from where it is opened). The site tests are not part of the root `npm test`.

- 2026-10-28: **ACT landing page** (item 4; commit in this push). `/act` (`public/act.html`, `public/js/act-landing.js`): what it does today, how it adapts, what it does not do yet (no timing, no real-format questions, no score prediction, no test-date plan), "no results yet" for score gains, and privacy in plain words taken from `public/privacy.html`. Static HTML, 8 KB, no third-party scripts. "Start free" goes to `/register?track=act`; `js/auth.js` carries the subject through the style quiz and survey into `/onboarding?track=act`, and onboarding scrolls to the ACT card and focuses "Find my grade" (signed-in learners get `/onboarding?track=act` directly). Checked: `scripts/act-landing-test.js` (claims against code: 16 grades, 20 to 90 minute placement, 75% pass mark, Science out of the composite, privacy wording; no invented numbers; served by the static handler without sign-in; sign-up chain encoding) and `npm test` (all steps pass except the timing check under Blocked, which fails the same on untouched `yc-next`); the page at 375 px in headless Chromium: no horizontal overflow, layout read from a screenshot. Not checked: the full sign-up flow in a real browser, and the link from the home page (not added; the owner decides where to link it). Note: `self-test.js` failed once while two suites ran at once and passed alone.
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
