# Night build: placement that is accurate from knowing nothing to knowing everything

Branch: `placement-accuracy` (created from `main`). Owner's ask (30 Oct): placement quizzes must place a learner
accurately whether they know nothing at all or everything in the subject, credibly backed and proven.

Read first: `services/subject-placement.js`, `services/adaptive-placement.js`, `services/unit-placement.js`,
`services/placement.js`, the routes and pages that serve them, `curriculum-build/PLACEMENT-CHOICE-SPEC.md`,
`curriculum-build/PLACEMENT-REVALIDATION-2026-10-24.md`, and
`curriculum-build/evidence-article/01-curriculum-levels-placement.md` (its mechanisms are the spec).

## How a run works (every night builder)

1. `git fetch origin`, check out this file's branch, `git pull --rebase`. Then `npm ci` (or `npm install`).
2. Read this whole file. Take the first item under **Queue** that is not `[claimed …]`, `[done]` or `[local only]`.
   Mark it `[claimed <UTC time>]`, commit and push that one line first, so two runs never take the same item.
3. Read every file the item names before changing anything. Build it fully, with tests. Add each new test to
   `scripts/test-steps.json`.
4. Run `npm test`. It must pass before you push. If an unrelated test breaks, fix it only if the fix is small and
   obviously right; otherwise write it under **Blocked** and stop.
5. Mark the item `[done <commit>]` with one line on how it was checked. Put leftovers back in the Queue as their
   own item. Add anything you discovered, with a reason. Commit and push this branch only.
6. If an item is too big for one run, finish a working, tested first slice and split the rest.

## Rules that never bend

- Push only to this file's branch. Never push to, merge into, or open a PR against `main`, `yc-next` or another
  branch. The owner's local agent verifies with real models and a browser, then merges.
- The rules in `git show origin/yc-next:docs/yc/BACKLOG.md` ("Rules that never bend") apply in full: sealed
  Spanish test files are never edited; no secrets, `.env` or `data/`; no paid provider outside the existing
  ledgers and never OpenRouter; honesty (no invented numbers, users or quotes).
- Model calls only through `services/ai.js` / `services/pool.js`, learner-class providers for anything that
  carries learner data. You have no keys: tests use the existing mocks. No new outside AI or speech vendor.
  Local open-source libraries that run on the owner's machine are fine.
- Evidence: every design choice that claims to help learning cites a mechanism id from
  `curriculum-build/evidence-article/*.md` (for example `06-M3`). A claim with no mechanism there goes to
  `docs/yc/SOURCES-TO-VERIFY.md` marked **UNVERIFIED**, with the search terms to check it. The owner's local agent
  verifies those with the article pipeline.
- Learner data is per learner, private, exported and deleted for real (`routes/profile.js` export and delete
  paths). Update `public/privacy.html` for any new data flow.
- Match the code around you (Node/Express, vanilla JS, existing CSS variables). Every page works at 375 px.
- "Proven" means a test or simulation in `scripts/` that fails if the claim stops being true, not prose.

## Queue

P1. [done e9900ef] **Simulation harness.** `scripts/placement-sim.js`: simulated learners whose true level runs from "knows
    nothing" to "knows everything" in every subject that has a placement. Each answers by an item-response model
    (chance of a right answer from item difficulty vs ability, guessing at 1/choices for multiple choice, a small
    slip rate), plus learners who press "I don't know". Measure placement error (placed minus true level), questions
    asked, and floor and ceiling cases. Write the table to `docs/PLACEMENT-ACCURACY.md` (baseline, before fixes).
    Checked: `npm test` passes with `scripts/placement-sim-test.js` (fixed seed, floor and ceiling within 1 grade).
P2. [done bd54139] **Floor.** A learner who knows nothing places at the very start, not in the middle because of lucky guesses:
    an "I don't know" choice on every item, correction for guessing, and an early stop at the floor.
    Checked: `npm test`; sim floor tests (guessers placed at grade 1 in <=25 questions, "I don't know" learners in <=8, 6 on English; was 21) in `scripts/placement-sim-test.js`; empty answer stored as idk (`scripts/adaptive-placement-test.js`, now in test-steps). The UI already had an "I don't know" button on every item (sends an empty answer). Unverified reading of the idk likelihood: `docs/night/PLACEMENT-UNVERIFIED.md`. Not done: baseline table not regenerated (kept as the before-fixes record); P4 will write the after table.
P3. [done 585854c] **Ceiling.** A learner who knows everything places at the top or tests out, confirmed by top-level items,
    never stuck mid-way. Where a ladder has too few hard items to tell, list it in P5.
    Checked: `scripts/placement-ceiling-test.js` (proof, stop gate, sim at 30 seeds: math, English, Reading, ACT place
    "knows everything" exactly and 98% within 1 grade of the top >= 95%). Mechanism: ceiling gate in
    `services/adaptive-placement.js` (06-M3: the end of the scale is measured too). Not fixed: IQ has 2 items in its
    top two grades, so the top cannot be proven; see P5a.
P5a. [local only] **IQ top end.** `content/placement-calibration/iq.json` has 2 items at positions >= 10 (grade 11 has none,
    grade 12 two). The ceiling proof needs at least 3 answered in the top two grades, so at least 6 calibrated items
    there (about 3 per grade) are needed for the sim to show "knows everything" placed at the top. Generate and calibrate
    with the content pipeline. Also ACT grades 13 and 15 have no calibrated items (indexes 12 and 14).
P4. [done cdd574a] **Adaptive stopping.** Stop when the level estimate is precise enough (standard error under a threshold),
    with confirmation items near the boundary. Target, proven by P1 for every subject: at most one level off for
    95% of simulated learners at every ability level, with the question count reported. Add the sim to
    `scripts/test-steps.json` with a fixed seed so a regression fails the suite.
    Checked: `scripts/placement-accuracy-test.js` (in test-steps): 40 learners per level, abilities spread across the grade, fixed
    seed; math, English, Reading (quick, and balanced for English/Reading) are >= 95% within one grade at every level, 22 to 29
    questions on average (`docs/PLACEMENT-ACCURACY-AFTER.md`). Changes in `services/adaptive-placement.js`: (1) a standard-error
    stop (belief spread <= 0.6 grade, ADAPTIVE_SE_MAX) and two confirmation answers within 0.75 grade of the middle before stopping
    (06-M3); (2) a real bug fixed: Accurate-mode learners who ran out of questions reached the top items last and passed 3 of 4 by
    luck, which "proved" the ceiling and placed a grade-6 learner at grade 16; the proof now also needs the belief near the top.
    P1c answer: the -1 mean error is a convention, not a bug. A learner exactly on a grade boundary is half in each grade, and the
    walk centres the belief 0.3 grade below an item's point (RELIABLE: the point is where answers are reliable). With abilities spread
    inside the grade, 70% are exact and ~28% are -1 (those in the first 0.3 grade); within-one is the claim. Not done: IQ and ACT
    top levels (P5/P5a); Spanish, chess, piano, basketball (P1b).
P5. [done cdd574a] **Content gaps.** Subjects whose item sets can't meet P4: write each as a `[local only]` item naming the
    levels and how many items are needed, so the owner's agent can generate and check them with the content
    pipeline.
P6. [done d0a5977] **Honest result screen.** After placement, show the placed level and what it is based on (how many questions,
    how sure), and a one-tap "this is too easy / too hard" that moves the learner and is recorded.

P5b. [local only] **IQ and ACT top end, measured.** With abilities spread across the grade, Quick IQ places 90% / 93% / 80% within one
    grade at the 75% / 90% / 98% levels (IQ has 0 items in grade 11, 2 in grade 12, 3 in grade 10, 2 in grade 9); ACT Quick 93% / 85% at
    90% / 98% (grades 13 and 15 have no calibrated items, grade 14 has few). Needed: about 3 calibrated items per grade for IQ grades 9-12
    (so >= 8 new, 6 of them in grades 11-12) and 3+ per grade for ACT grades 13-16 (indexes 12-15). Then re-run
    `node scripts/placement-sim.js --after` and extend `scripts/placement-accuracy-test.js` (remove the GAP entries for iq and act).
    The Spanish/chess/piano/basketball sets cannot be checked until P1b.
P1b. [local only] **Spanish, chess, piano, basketball have no calibrated items in source control**
    (`content/placement-calibration/<subject>.json` has no points), so the sim cannot cover them. The owner's agent
    should run `scripts/placement-second-judge.js calibrate` for each, commit the points, then
    `node scripts/placement-sim.js --write` to add them to the table. (Spanish tests are sealed: read only.)
P1c. Baseline findings to fix in P2-P4 (from `docs/PLACEMENT-ACCURACY.md`, 15 seeds per level): mid-level
    learners are placed one grade *below* their true grade almost every time in English/Reading (mean error -1.0 at
    25%/50%/75%; check whether this is the "reliable point" shift or a convention, and say which in the result);
    "I don't know" learners are worse (86.7% within 1 grade vs 93.3%); IQ and English ceiling "everything" placed
    within 1 grade only 93% (some -1 or -2). Only 15 seeds, so treat rates as coarse; P4 needs more seeds for 95%.

## Blocked

## Done
