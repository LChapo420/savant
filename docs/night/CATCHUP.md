# Night build: catch-up for every subject that is learned well digitally

Branch: `catchup-all` (created from `catchup-rebuild`, which has the finished Spanish catch-up). Owner's ask
(30 Oct): the full catch-up feature for all subjects that are easily learned digitally, evidence-backed, and
working: it finds exactly what this learner is missing for the grade they want to reach, teaches only that, as
fast and with as much retention as possible, then re-checks.

Read first: `git diff --stat origin/main...origin/catchup-rebuild` and the Spanish catch-up files it lists
(services, routes, pages and tests), `services/learner-path.js`, `services/subject-placement.js`, the curricula
under `content/` and `curriculum-build/`, and `curriculum-build/evidence-article/01-*.md` and `02-*.md` (their
mechanisms are the spec).

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

C1. [done ed7f227] **Subject-agnostic engine.** Move the Spanish catch-up logic into a shared module: target grade → the
    prerequisite skills below it → a skill-by-skill check that stops early per skill → only missed skills are
    taught, in prerequisite order, in the Duolingo-style player → spaced review → a final re-check. Spanish keeps
    working exactly as now (its tests must still pass).
C2. [done da1cf8a, first slice; rest split into C2b, C2c] **Every digital subject.** List the app's subjects and which have the skill graph and items catch-up needs (for
    example math, reading, English, ACT sections, science, Spanish). Wire "Catch me up to grade N" on each ready
    subject's page. Subjects that lack content get a `[local only]` item naming exactly what is missing.
C2b. [done a7f7e42, items 1-2; rest is C2d] **Wire math, english, reading into the player.** `routes/learn.js` now lets a learner open a
    level of a catch-up block (`catchupUnits.allowsLevel`) and, when a finished session scores at or above the master bar
    (0.75), calls `onLevelPassed` for the levels it covered. Checked: `scripts/catchup-units-test.js` (allowsLevel true in
    the block, false outside it and for another subject) and the full `npm test`. Not exercised end to end through HTTP.
C2d. [done f4f2ecf, item 1 only; rest is C2e] **Pages.** `public/catchup.html` + `public/js/catchup.js` (target, found missing,
    progress, next review due, 375 px width cap, existing CSS variables) and a "Catch me up to this grade" link on the math,
    english and reading path page. Checked by a static test in `scripts/catchup-units-test.js` and `npm test`; NOT opened in
    a browser (no login in this run).
C2e. [done, item 1 only; rest is C2f] **Review queue, lookback, browser.** (1) Put each finished block's reviews (`block.reviews`, +1/3/7/21 days) into the real
    review queue (`services/review-session.js` / `retention-schedule.js`); today they live only on the catch-up row.
    Finding (30 Oct night): `adaptation.dailyReview` builds the queue from the learner's per-objective record, not a seeded
    list, and catch-up levels are played on a real enrollment, so their answers already feed it. Unproven: needs a played
    session (HTTP) showing a caught-up objective appear in `dailyReview` after its forgetting-curve gap; until then
    `next_review_due_at` on the page is the catch-up row's own +1/3/7/21 schedule and the page should say so.
    (2) Owner decision: lookback (default 2 grades below the target). (3) Drive the whole flow through HTTP in a browser at
    375 px and look at the page (the owner's local agent has the browser).
C2f. [done aa4c8d6, HTTP route-layer part only; rest is C2g] **Lookback and browser.** (2) Owner decision: lookback (default 2 grades below the target). (3) Drive the whole flow through HTTP in a browser at
    375 px and look at the page (owner's local agent). Also: a played-session HTTP run showing a caught-up objective in `dailyReview` through the route layer.
    Done in C2e: `scripts/catchup-review-queue-test.js` (in the suite) shows answers on a real enrollment are not due right after and due after a 120-day gap in `adaptation.dailyReview`; the page's review line now says it is the catch-up plan's own schedule and that the daily review also brings fading skills back.
C2g. [local only] **Lookback decision and browser.** Owner decision: lookback (default 2 grades below the target). Drive the flow in a browser at 375 px (owner's local agent). Still unproven: a played learn-session through `routes/learn.js` showing a caught-up objective in `dailyReview`. Done in C2f: `scripts/catchup-http-test.js` (in the suite) drives `/api/catchup` over real HTTP: auth required, check finds planted gaps, `/next` opens the block level, other learners see nothing.
C3. [done d0dedb9, math/english/reading; Spanish is covered by its own sealed test] **Proof per subject.** `scripts/catchup-sim.js`: simulated learners with planted gaps (a few, many, none, all)
    for each wired subject. Catch-up must find at least 95% of planted gaps, teach no skill the learner already
    knew more than 5% of the time, and use fewer items than the linear path. Write the table to
    `docs/CATCHUP-PROOF.md`. Add the sim to the suite with a fixed seed.
C3b. **Slip-tolerant check.** `scripts/catchup-sim.js` measures that with a 3% slip about 9% of known skills are still
    taught (one miss sends a skill to learn; every unit bank has exactly 5 questions, 2 kept for the re-check). Gaps found are
    98%+ either way. To meet "teach a known skill <= 5%" at 3% slip, banks need >= 7 questions per unit
    (`scripts/generate-unit-placement.js`, owner's models, so `[local only]` for the generation) and the check then asks a
    second question after a first miss. Then move the sim's gated slip from 0 to 3%.
C4. [done 41789a0; checked by scripts/catchup-evidence-test.js and full npm test] **Evidence map.** In `docs/CATCHUP-PROOF.md`, each design choice (diagnostic first, skip mastered skills,
    prerequisite order, retrieval practice, spacing, final re-check) cites its mechanism id.
C5. **Real UI.** The page shows the target, what was found missing, progress, and when the next review is due;
    works at 375 px with the existing CSS variables.
    Status (30 Oct night): the page exists (C2d) but has never been opened in a browser. A scripted Chromium run in the cloud
    (own server on a throwaway DB, register, walk math/english/reading at 375 px) produced no output in 300 s and was killed,
    so nothing is claimed. Needs the owner's local agent: load `/catchup?track=math&grade=<grade 6 id>` at 375 px, check no
    horizontal scroll on intro, question, summary and done, and that the review line reads honestly (see C2e).

## Blocked

## Done

C2 slice (da1cf8a): `services/catchup-units.js` (unit-bank adapter on the shared engine) for math, english, reading: readiness check (49/16/16 grades all have complete unit banks, 5 questions each), `catchup_units` collection (exported/deleted via profile and consent lists, privacy page updated), `/api/catchup/*` routes. Checked: `scripts/catchup-units-test.js` (in suite): planted gaps found exactly, only gaps become blocks, reviews dated at +1 day, re-check closes it; `npm test` passing.

C1 (ed7f227): `services/catchup-engine.js` is the adapter-driven state machine (check with early stop per skill, gaps only as blocks in grade order, spaced-review hook, final re-check with per-skill send-back). `services/spanish/catch-up.js` delegates to it; storage, questions, player and review seeding stay in the subject adapter. Checked: `scripts/catchup-engine-test.js` (toy subject, in the suite), `spanish-catchup-test.js` unchanged and passing, full `npm test` passing. Not yet done: the Spanish route/view/persistence layer (`ensure`, `view`, `routeShape`) is still Spanish-only; C2 needs a generic persistence/route layer per subject (adapter for rows, player URL, review seeding).

C3 (d0dedb9): `scripts/catchup-sim.js` (in the suite, seed 20261030): 12 simulated learners per row for math, english, reading, scenarios none/few/many/all at slip 0 and 3%; gaps found 98%+, known skills taught 0% at slip 0 (9% at slip 3%, see C3b), less work than the linear path in none/few/many. Table in `docs/CATCHUP-PROOF.md`. `npm test` passing.

C4 (41789a0): evidence map in `docs/CATCHUP-PROOF.md` (01-M7/11/12/13/14/15/43/51, 02-M1/27/30); `scripts/catchup-evidence-test.js` (in the suite) fails if a cited id disappears. Prerequisite order has no mechanism: UNVERIFIED in `docs/yc/SOURCES-TO-VERIFY.md` section 7, with search terms, as is the 21-day review step.
