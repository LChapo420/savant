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
C2. **Every digital subject.** List the app's subjects and which have the skill graph and items catch-up needs (for
    example math, reading, English, ACT sections, science, Spanish). Wire "Catch me up to grade N" on each ready
    subject's page. Subjects that lack content get a `[local only]` item naming exactly what is missing.
C3. **Proof per subject.** `scripts/catchup-sim.js`: simulated learners with planted gaps (a few, many, none, all)
    for each wired subject. Catch-up must find at least 95% of planted gaps, teach no skill the learner already
    knew more than 5% of the time, and use fewer items than the linear path. Write the table to
    `docs/CATCHUP-PROOF.md`. Add the sim to the suite with a fixed seed.
C4. **Evidence map.** In `docs/CATCHUP-PROOF.md`, each design choice (diagnostic first, skip mastered skills,
    prerequisite order, retrieval practice, spacing, final re-check) cites its mechanism id.
C5. **Real UI.** The page shows the target, what was found missing, progress, and when the next review is due;
    works at 375 px with the existing CSS variables.

## Blocked

## Done

C1 (ed7f227): `services/catchup-engine.js` is the adapter-driven state machine (check with early stop per skill, gaps only as blocks in grade order, spaced-review hook, final re-check with per-skill send-back). `services/spanish/catch-up.js` delegates to it; storage, questions, player and review seeding stay in the subject adapter. Checked: `scripts/catchup-engine-test.js` (toy subject, in the suite), `spanish-catchup-test.js` unchanged and passing, full `npm test` passing. Not yet done: the Spanish route/view/persistence layer (`ensure`, `view`, `routeShape`) is still Spanish-only; C2 needs a generic persistence/route layer per subject (adapter for rows, player URL, review seeding).

