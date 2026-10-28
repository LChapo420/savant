# Live changes, 2026-10-24 (owner approved: "Apply them live")

Everything the owner approved at 03:00 UTC is now live in the code. Every feature can be switched off with one environment variable, so no code change is needed to undo it. The app server was stopped the whole time and was never started. `.env` was not edited. Nothing was committed.

**Backups:** `C:\Users\admin\AppData\Local\Temp\claude\C--coding-claudecommittdIq-folderThing\34e6f487-b3f5-4acd-899c-244171ef0427\scratchpad\before-live\`. This folder is called `before-live/` below.
- **The files:** every file as it was before this run touched it, at its own path. `backed-up.txt` lists them, and `new-files.txt` lists the files this run created.
- **Partway copies:** `after-step1/` and `after-step3/` hold copies taken between steps.
- **The database:** `data/db.json` before the content fixes is saved as `scratchpad\db.before-live-fixes.json`.

## Switches (what each one does, and how to turn it off)

Every default below is now set in the code. To turn a feature off, set its variable in the environment or in `.env`, then restart the server.

| Feature | Variable, and its new default | What learners get | To turn it off |
|---|---|---|---|
| Adaptive teaching (round 1 wiring) | `ADAPTIVE_TEACHING` = `on` | Lesson and practice prompts adapt to the learner's record on the objective. The path steps over the rest of the practice on an objective the learner has already proven. It never skips a retention level or a checkpoint. | `ADAPTIVE_TEACHING=off`, or `shadow` to record without applying |
| Daily review (round 3, 01) | `ADAPT_REVIEW_SESSION` = `on` | A "Today's review" row on the path and a `/review` page: memory checks and fading objectives, 10 minutes a day at most. It never moves the level. | `ADAPT_REVIEW_SESSION=off` |
| Consolidation before the Final (02) | `ADAPT_CONSOLIDATE` = `on`; it needs the daily review on | Before the first sitting of a Final: short daily reviews until 90% of the grade will last, for 21 days at most. The next grade can be started meanwhile. | `ADAPT_CONSOLIDATE=off` |
| Too fast to count (03) | `ADAPT_EFFORT` = `on` | On checkpoints and the Final, an answer under 1.2 s is set aside and a parallel question replaces it, twice at most. The pass mark is unchanged. | `ADAPT_EFFORT=off` |
| Remediation from the record (04) | `ADAPT_REMEDIATION` = `on` | After a missed Final: "Learn again" and "Recall" lists from the learner's record, with a recall round. | `ADAPT_REMEDIATION=off` |
| Graduation held (05) | `COVERAGE_GATE` = `enforce` (was `shadow`) | A passed Final graduates only once every objective is proven and kept. Until then a "what graduation waits on" page (`/held`) shows the rest, and the Final is not sat again. | `COVERAGE_GATE=shadow` (records only) or `off` |
| Skill record (skills 01) | `SKILL_RECORD` = `on` | A per-learner, per-skill record for chess, piano and basketball. A parent's export and a child's deletion reach it (`skill_records` in `routes/consent.js`). | `SKILL_RECORD=off`. This also turns off the three switches below. |
| Stage checks (skills 02) | `SKILL_STAGE_TESTS` = `on` | A "Stage check" row and a `/stage-check` page. | `SKILL_STAGE_TESTS=off` |
| **Stage gate (skills 03), per stage** | `SKILL_STAGE_GATE` = `on` (was `shadow`) | Graduation from a stage's last grade waits until every skill a machine can prove is proven on two cold days. **This applies only on stages where every such skill has a working check.** Today those are **PI0, PI1 and BB0**; PI11-16 has nothing to prove, so it never holds. **Every chess stage, and PI2-PI10 and BB1-BB12, stays in shadow**: shadow records what the gate would say and holds nobody. A stage switches on by itself once its last `not_wired` entry in `content/skill-stage-checks.js` is replaced by a working check. | `SKILL_STAGE_GATE=shadow` (every stage) or `off`. To keep chosen stages in shadow: `SKILL_STAGE_GATE_SHADOW=PI1,BB0` |
| Practice dose (skills 04) | `SKILL_DOSE` = `on` | "Today's practice" (`/skill-practice`), planned from the learner's record, with a maintenance share. | `SKILL_DOSE=off` |
| Answer-key gate at generation (guards 02) | `KEY_GATE` = `on` | Newly written game questions, lesson checks and block-plan checks are checked. One whose explanation describes a different option than its key goes to a blind re-key: kept if the judge picks the key, otherwise rejected and rewritten. The judge follows the app's learner-safe chain, NVIDIA first: Nemotron Ultra by name, then the rest of the app's own chain (local models, the free APIs, then Claude inside the key's ledger). It never uses xKiro or UnoRouter. Only the question and its options are sent. | `KEY_GATE=off` |
| Lesson prompt with labelled mistakes (guards 01) | none: always on | Common mistakes in newly written lessons take the form "Wrong: … Why: … Right: …". The live math gate also drops an unlabelled one. | Reverse the patch (see below) |
| Game prompt key rules (guards 03) | none: always on | Game writers are told to decide the key first, never repeat an option, and avoid two defensible options and false premises. | Reverse the patch |
| Chess practice links | none: always on | The chess path page links to Rated puzzles, Move trainer and Play a human-like opponent. | Reverse the patch |
| Game serving holds | `GAME_HOLDS` = `on` (new) | The 70 English Proficient quiz games the fact audit found wrong are not served. Their levels open as an ordinary practice session instead. Four verified replacements have been swapped back in (rows 1, 2, 3 and 13), so 66 are held; see "Content fixes" below. | `GAME_HOLDS=off` (serves the old sets again) |
| Basketball body tracking | `BODY_TRACKING` = `on` (new) | On the camera pages only (`/engine/basketball/*`, and `/base-lesson?track=basketball`, which hosts the camera blocks), the policy allows `'wasm-unsafe-eval'` in `script-src`. On `/engine/basketball/*` it also allows this site's own `/vendor/mediapipe/` in `connect-src`; the lesson page already has `'self'`. MediaPipe Pose then runs on the device. Every other page keeps `script-src 'self'`, and nothing leaves the device. | `BODY_TRACKING=off`. The tools then fall back to motion, as before. |

The tuning knobs from the staged READMEs are unchanged, for example `ADAPT_REVIEW_MINUTES`, `ADAPT_CONSOLIDATE_AT`, `OBJ_RAPID_MS`, `ADAPT_MAX_RESERVE` and `SKILL_MAINT_SHARE`.

## What was applied, in order

Each patch was checked against the current tree, applied with `git apply -p1`, and passed `node --check`. No patch needed rebasing.

1. **Adaptation**
   - `staged/adaptation/adaptive-teaching-on.patch`.
   - `staged/adaptation/round3/01`–`05`.
   - Defaults were changed in `services/adaptation.js`, `services/coverage.js`, `services/review-session.js`, `services/consolidation.js`, `services/effort-monitor.js` and `services/remediation.js`.
2. **Skills**
   - `staged/adaptation/skills-round3/01`–`04`.
   - The per-stage rule is in `services/skill-gate.js`: `stageMode()` and the `mode`, `fully_wired` and `unwired` fields of `left()`.
   - The defaults are in `services/skill-record.js`, `skill-checks.js` and `skill-dose.js`.
3. **Accuracy guards**
   - `staged/content-fixes/guards/01`–`03`.
   - The judge was rewired in `services/key-gate.js` (`nemotronJudge`): Nemotron Ultra first, then `providers.chain('check')`, with xKiro and UnoRouter filtered out.
4. **Chess links:** `staged/chess-links/path-js.patch`.
5. **Holds and body tracking**
   - **Game holds:** `services/game-payloads.js` gained `held()` and `holdsOn()`. The checks were added to `ensure`, `sharedReady`, `accessFor` and `stored`. A held level is never written again on a visit either.
   - **Hold list:** the new `content/game-holds.json` lists the 70 levels, so a fresh store that imports the shipped sets holds them too.
   - **Export:** `services/base-content.js` does not export a held set.
   - **Body tracking:** `middleware/security.js` gained `scriptSrc()` and `bodyTrackingPage()`.

**Tests changed so they still test what they were written for:**
- **Off-state tests:** where a test checked the switched-off state by leaving a variable unset, it now sets the variable to off explicitly. These are `scripts/self-test.js` (two spots), `coverage-test.js`, `round3-*-test.js` and `lib/skills-r3-fixture.js`.
- **New default checks:** `coverage-test.js` now checks that each new default is on.
- **`skills-r3-gate-test.js`:** new checks for the per-stage rule. The chess retention case now expects shadow, which is the live rule.
- **`key-gate-test.js`:** checks the default and the judge chain, including that xKiro and UnoRouter are never asked.
- **`consent-test.js`:** checks the camera-page CSP grants exactly, and that no other page gets them.
- **New `scripts/game-holds-test.js`.**

**Added to `npm test`:** `key-gate-test`, `game-holds-test`, `round3-review`, `round3-consolidation`, `round3-effort`, `round3-remediation`, `round3-held`, and `skills-r3-record`, `-checks`, `-gate` and `-dose`.

## Content fixes in `data/db.json` (one write, owner approved)

- **Before the write:** the server was not running. md5 before: `d843b6e8bd68b6921cbb761342e1202c`. The copy is `scratchpad\db.before-live-fixes.json`.
- **The method:** each change was dry-run on a copy first, then written once. The scripts are in `scratchpad\live-test\`: `apply-db-live.js` and `apply-db-fixes.js`. Reports are in `scratchpad\live-test\step5-live-report.json` and `.fixes.json`.
- **Answer-key fixes:** 129 exact one-field fixes, every `rekey` entry in `staged/content-fixes/fixes.json` with an exact `set` and a source.
  - Before each change, the row had to still show the audited wrong key.
  - By collection: game_payloads 118, items 9, lessons 1, block_plans 1.
  - **Not applied:** the one `replace_duplicate_options_then_rekey` entry (Q2, game row 64). Its target option appears twice, so it is not a one-field fix.
- **Games held:** each of the 70 English Proficient game rows was given `serving_hold`, except any row swapped back in.
- **Games swapped back in:** only a replacement that passed the code checks and both judges qualified.
  - "Code checks" means the app's `inspectPayload`, the explanation-key check and repeated options.
  - "Both judges" means both blind judges kept all 50 questions, and a further blind re-judge agreed on all 50.
  - The swapped row carries `verified_replacement`.
  - The final list is in the night log and in the report. **Row 64 was refused:** its re-judge disagreed on 2 of 50.
- **Lesson rewrites:** only the content factory's rewrites marked `verified` qualified, with both reviews all fixed and true, no code problems and no math claims left.
  - Every edit's "before" text had to match the stored row exactly.
  - The rewritten lesson then had to pass `services/math-claims.js`.
  - Each rewritten row carries `verified_rewrite`.
  - Lesson 30 ("needs owner") was not applied.
- **After the write (about 06:50 UTC):** md5 `8eafc0cf52f439920ea56d00ba0b3194`. The written file matches the verified dry run, apart from the timestamps.
  - **Key fixes:** 129 applied; 1 not applied (Q2).
  - **Games held:** 66 of the 70.
  - **Games swapped back in:** 4, all with `verified_replacement` set.
    - **Rows 1, 2 and 3** (levels 2, 1 and 3): from the night factory's `games-night/`. MiniMax wrote them; a MiniMax blind pass was judge A, and judge B was another family (Nemotron Ultra and Gemini 3.6 Flash). Both judges kept all 50, and 0 to 1 failed the code checks.
    - **Row 13** (level 15): from the day sample `games/`. Nemotron Ultra and Nemotron Lightning both kept all 50, and the blind re-judge agreed on 50 of 50.
    - All four passed the app's own `inspectPayload`, the explanation-key check and the repeated-option check.
  - **Refused:** row 64; its re-judge agreed on 48 of 50.
  - **Lesson and block-plan rewrites:** 29 of the 40 the factory had staged were applied: 22 lessons and 7 block plans.
    - **Not applied, 11:** 9 are marked "needs owner" or lack a judge's all-clear: block plans 2, 4 and 10, and lessons 30, 233, 1219, 1801, 2040 and 80.
    - **Also not applied:** lessons 193 and 424. Their rewrites still carry math claims.
  - **Tests after the write:** the full chain on a copy of the new DB passed 47 of 47, and the click-through showed nothing wrong.

## How to roll back

- **One feature:** set its switch from the table above, then restart.
- **One patch:** from the app folder, run `git apply -R -p1 <patch>` in reverse order. The patches are: skills `04` → `01`, round 3 `05` → `01`, `adaptive-teaching-on.patch`, guards `03` → `01`, and `chess-links/path-js.patch`.
  - Undo this run's own edits to the same files first, by copying the `after-step*` copies back or restoring from `before-live/`.
  - **The simplest way to roll back everything:** copy every file in `before-live/` back to its own path, and delete the files listed in `before-live/new-files.txt`.
  - **Caution:** other agents edited some of the same files tonight, and their edits are not in `before-live/`. These are `routes/consent.js`, `services/game-payloads.js`, `server.js` and `package.json`. Restoring a whole file removes their work. Prefer reversing the patch, `git apply -R`, which leaves their lines alone.
- **The database:** stop the server, then copy `scratchpad\db.before-live-fixes.json` back over `data/db.json`.
  - This undoes all three changes at once: the 129 key fixes, the holds and the swap and rewrites.
  - To undo only the holds, set `GAME_HOLDS=off` instead.

## Coordination and follow-ups

- **For the chess agent:** a chess stage starts holding learners the moment none of its provable metrics is `not_wired` any more. Only replace a `not_wired` entry once that sitting works end to end on the server. Otherwise add the stage to `SKILL_STAGE_GATE_SHADOW`.
- **For the content factory:** to swap another game in, re-run `apply-db-live.js --swap=<rows>` on a stopped server's DB. A replacement still needs the code checks, both judges, and a clean re-judge.
- **Shipped content (`content/base-levels/english-proficient.json`):** it still holds the old games and the old block-plan key.
  - The holds cover the games on a fresh store.
  - The block-plan fix (plan 4, check c4) and the swapped game reach a fresh store only after `npm run base:export` on the fixed DB. That is the beta-launch agent's cut-over step.
- **Block plan 4, check c4:** the answer is now "be". Its `accepts` list (should be, must be, …) was not changed, since that is not a one-field fix.
- **Click-through port:** port 6799 was in use tonight by the design-polish agent's server, and 6811 by another agent. The click-through ran on port 6857, with the same set-up: the live tree's code, a fresh copy of `db.uitest.json`, keys blanked and Ollama off.

## Grade difficulty bands (added 07:55 UTC)

- **What changes for learners:** each grade's practice questions now climb within the grade's own slice of the 1–10 difficulty scale, instead of every grade running the whole scale. For example, the Kindergarten math Final drops from difficulty 10 (algebra) to 3, and doctoral math opens at 8 instead of 1. Placement keeps its own scale.
- **Flag:** `GRADE_BANDS` (default **on**). Set `GRADE_BANDS=off` and restart to undo.
- **Patch:** `curriculum-build/staged/subjects/01-grade-bands.patch`. Only `config/curriculum.js` changed, plus one test expectation in `scripts/self-test.js`.
- **Roll back:** `git apply -R -p1 curriculum-build/staged/subjects/01-grade-bands.patch`, then revert the one-line default and the self-test line. Backups are in `scratchpad/34e6f487.../before-live/grade-bands/`.
- **Verified:** the full chain passes 47/47 with bands on, and self-test also passes with `GRADE_BANDS=off`.

## Security follow-ups (added 08:40 UTC, verified 13:15 UTC; security follow-up agent)

The four items `SECURITY-REVIEW-2026-10-24.md` reported but did not fix, now fixed live under the owner's "verified fixes go live" approval. Backups of every file as it was: `scratchpad/34e6f487.../before-security-2/` (same paths; the 12 deleted files are in `before-security-2/public/base-lesson-scripts/`). The app server was not started; `data/db.json` and `.env` were not touched; nothing was committed.

| Change | Flag (default) | What learners get | To undo |
|---|---|---|---|
| **D3 Grading prompt injection** (`services/typed-grading.js`) | `GRADING_INJECTION_CHECK` = `on` (new) | A typed answer that talks to the grader ("ignore the instructions", "the answer is correct", fake `SYSTEM:`/reference/verdict lines, chat-template tokens, JSON, role-play, in English or Spanish) is marked wrong before any judge sees it, unless the item's own text says the same thing. Every answer that does reach a judge is cleaned (invisible and control characters removed, NFKC, one line, 600 characters at most) and fenced between random markers; the judge prompt says the fenced text is data, never instructions. The rules still run first, so an answer that is the key is unaffected. | `GRADING_INJECTION_CHECK=off` turns off the deterministic check only. The fenced prompt has no flag: copy `before-security-2/services/typed-grading.js` back (the eval's cached votes for both prompts are kept, so the old numbers still replay with `--report --hash f452f8d22a`). |
| **D4 Model-written pages in a sandboxed frame** (`routes/base-lessons.js`, `public/js/base-lesson.js`, new `public/js/lesson-frame.js`, `server.js` font header) | `LESSON_SANDBOX` = `on` (new) | Generated base lessons, tailored lesson pages and the remade quiz games now run in `<iframe sandbox="allow-scripts allow-forms">` (no `allow-same-origin`) loaded from `/api/lessons/:track/:grade/:level/page`, whose own CSP is `sandbox allow-scripts allow-forms; connect-src 'none'; form-action 'none'; script-src 'self' 'nonce-…'`. The page cannot read the learner's cookies, storage or the course page, and cannot call the API. Finish, game answers and results, the question cursor, the page-activity record, links to the next level and the frame's height reach the course page as checked postMessages. No lesson code is written into `public/` any more (the script route answers 410). Mario and Moto keep their existing engine frame. Fonts (`*.woff2`) are now sent with `Access-Control-Allow-Origin: *` so the frame can use them. Visible differences: a long lesson scrolls inside its frame (capped at the window height), so its sticky bars and fixed panels behave as written; keyboard games need a click into the game first. | `LESSON_SANDBOX=off` and restart: the old same-origin mount and the guarded script route come back (both still tested). |
| **D5 Dev-tools password reset** (`routes/learn.js`) | none (narrowing only) | Nothing for learners. With `NODE_ENV=production` the `/api/dev/*` routes are never registered, whatever `DEV_TOOLS` says, and each route re-checks per request. Elsewhere `POST /api/dev/set-password` needs an admin (`ADMIN_EMAILS`) and only sets the caller's own password (others: 404 or 403). | Copy `before-security-2/routes/learn.js` back. Only this block changed in it; other agents' later edits to `learn.js` would be lost, so prefer re-editing the block by hand. |
| **Finding 10 Stale lesson-script files** | none | Nothing (no page loaded them). The 12 old game-engine copies under `public/base-lesson-scripts/english/proficient/` (`level-{2,3,4,5,17,22,47,86,87,106,107,108}-0.js`) were deleted after a search found no reference to them anywhere in the repo or in `data/db.json`. | Copy them back from `before-security-2/public/base-lesson-scripts/english/proficient/`. |

## Learner follow-ups (added 09:10 UTC, learner follow-ups agent)

The five learner-facing items left open by POLISH-2026-10-24.md and SUBJECTS-FUNCTIONAL-AUDIT.md, live under the owner's "verified fixes go live" approval. Backups of every file as it was before this agent touched it: `scratchpad/34e6f487.../before-followups/` (same paths; `backup.log` has each file's md5 at copy time). New files: `content/skill-learner-text.js`, `public/js/say-aloud.js`, `scripts/learner-followups-test.js` (60 checks, in `npm test` and `npm run test:followups`). Verified on the test copy (port 6831, scratchpad copy of the polish `db.uitest.json`, keys blanked, Ollama off) at 375 and 1280 px, light and dark: no sideways scroll, no console errors.

| # | Change | Behaviour change? | Switch | To undo |
|---|---|---|---|---|
| 1 | **Skill pages say what a skill asks in learner words.** Every one of the 84 chess, piano and basketball exit metrics has a written line ("Two pieces from this grade, played cold. To pass: 90% of the notes right, with no stops.") instead of `test. Bar: cold take noteAccuracy >= 0.9, no stops.`; numbers for wired checks are the ones the check grades by (the test cross-checks them). Stage codes are gone ("Stage: Pre-reader.", "before you leave this stage"). "Why this plan" on Today's practice is in learner words (it listed `five_finger: cold stage test — ...`). Build notes (`gap`, "a build job", the `needs` text on logged drills) show only with `?debug=1`; "Attested" reads "Recorded, not marked"; "Whether a person's sign-off should is the owner's decision" is gone. | Copy only. One added `plain` field on the skill views (`services/skill-{coverage,record,gate,dose}.js`, new `why` list in skill-dose); no logic change. | none | Restore `public/js/{stage-left,stage-check,skill-practice}.js` from the backup (the pages fall back to `test` without `plain`); the added fields are harmless. |
| 2 | **Recap after a passed Final.** A held graduation (coverage gate) now reads "The Final is passed. What comes next is proving the objectives graduation waits on, not another Final."; a skill-gate hold reads "...Graduation now waits on this stage's measured skills..." and the recap's banner and button point to the stage list (it said "You are now at level N"); a graduation reads "...this grade is complete." The model-written analysis that lands later gets the same line. | Yes, recap text (`services/sessions.js` `outcomeSummary`, `public/js/session.js`). | none | Remove the `outcomeLine` lines in `finish()`; restore the recap lines in `session.js`. |
| 3 | **Fewer, smaller requests.** `GET /api/placement/paths` returns every enrollment's plan in one reply (the dashboard made one call per enrollment); `GET /api/path/:id?view=ticks` (dashboard: checkpoint ticks, current row, next checkpoints) and `?view=page` (path page: the same rows without fields it never reads or empty values); `GET /api/catalog?view=summary` (landing) and `?view=grades` (onboarding, no skill lists). Default replies are unchanged for every other caller. | No visible change (the test compares every drawn value). | none | Point `dashboard.js`, `path.js`, `landing.js`, `onboarding.js` back at the plain URLs; the routes can stay. |
| 4 | **Spoken checkpoints for preschool and Kindergarten.** The 26 "Explain Aloud" (math: sense_of_quantity, counting_and_comparing, numbers_to_10, numbers_to_20_and_teen_numbers) and "Oral Retell" (english basics, reading foundations) checkpoints were an 80-word typed essay marked by a model. Now: the sitting's 5 tap-to-answer questions decide the pass (75%, as before for essays); then "Say it aloud" with "Read it to me" (on-device voice only), an optional recording kept in the page and played back from a blob (nothing uploaded, gone on leaving; the consent test's no-upload scan now covers `say-aloud.js`), a required "I said it out loud" tick, and an optional "Grown-up: I heard ..." tick. `POST /api/essays/:id/oral` takes only those two yes/no answers; a typed `/submit` on these levels is refused. No model call (saves the essay topic and grading calls). Coverage: the tap answers are ordinary multiple-choice evidence; a grown-up's confirmation is one yes/no answer at weight `OBJ_ATTEST_W` (0.25) on the checkpoint's shared span, never direct, so it can never prove an objective on its own (60 of them prove nothing, tested); the learner's own tick is not evidence. Pages call it a "Say-it-aloud check". | **Yes** (new response mode on those 26 levels only). | `YOUNG_ORAL=off` restores the typed essay. `OBJ_ATTEST_W=0` drops the grown-up's tick from coverage. | Set the switch and restart. Files: `services/essays.js`, `routes/essays.js`, `services/coverage.js` (attest answers + weight), `services/sessions.js` (areas from the tap misses), `public/js/session.js`, `public/js/path.js`, `routes/learn.js` (`spoken` flag), `public/session.html`, `public/css/style.css` (end), `scripts/consent-test.js` (scan), `scripts/self-test.js` (its written-checkpoint section now sits English 1st Grade, plus 3 spoken checks). |
| 5 | **Chess board coordinates** (`public/engine/chess/board.js`, the injected CSS string only): dark ink on both square colours at full opacity, 7.44:1 on light and 5.68:1 on dark squares (was 1.94 and 2.01:1). Engine logic untouched. | Look only. | none | Restore the two colour values and `opacity:.8` from the backup. |

**Measured (test copy):**
- Dashboard: plan calls 11 → 1 for an 11-enrollment learner (idle localhost: 30 → 19 ms wall; under load the polish audit saw about 190 ms a call). The lead path read for the scale fell from the full path (92-382 KB) to `?view=ticks` (3-11 KB); dashboard API bytes for the chess learner about 292 → 16 KB.
- Path page JSON (`?view=page`): 111 → 54 KB (math K), 286 → 134 KB (reading foundations), 382 → 193 KB (basketball), 373 → 188 KB (piano), about −50% with every drawn value the same. (Descriptions are still sent for every row: the page draws them in folded units, so trimming them would need on-demand loading.)
- Landing catalogue: 152,177 → 1,637 bytes (−99%); onboarding catalogue 152 → 48 KB (−69%).
- Oral checkpoints: 0 model calls (were a topic call plus a grading call per attempt).

**Coordination:** `routes/learn.js`, `package.json` and `scripts/self-test.js` were also edited by other agents tonight; undo this agent's edits by reversing them (diff each file against its copy in `before-followups/`; in `package.json` it is the one appended `learner-followups-test` step and the `test:followups` script), not by restoring whole files. **`routes/learn.js` differs from its backup by more than this agent's edits:** the security follow-up's dev-tools change (D5) landed after the backup was taken, so reverse only this agent's hunks there (`ticksOnly`, `pageNode`, `?view=page`, `spoken`).

## Chess sittings, bot fix and rating mapping (added 12:20 UTC, chess and piano agent)

Owner-approved through the coordinator. Backups: scratchpad `34e6f487...\before-skills-live\` (every file below as it was, at its own path; the files patch 05 adds are new). Verified on a fresh copy of the live tree with a `data/db.json` copy, keys blanked, `OLLAMA_ENABLED=0`; results at the end.

| Change | Switch, and its default | What learners get | To undo |
|---|---|---|---|
| **Chess sittings (skills patch 05)** | `SKILL_CHESS_SITTINGS` = `on` (new) | Every chess stage check that was "not checkable here yet" in CH0-CH5 can now be sat: star mazes, set-up from memory, K+Q/K+R/K+P play-outs against table-perfect defence, Lucena and Philidor against Stockfish, recorded games against measured bots (server clock, Stockfish review), whole-line calculation. Details: `staged/adaptation/skills-round3/README.md` section 05. A check this server cannot run (no Stockfish, no measured bot in the band) still says what it needs. | `SKILL_CHESS_SITTINGS=off` (back to 02's list), or `git apply -R -p1 curriculum-build/staged/adaptation/skills-round3/05-chess-sittings.patch` after restoring `services/skill-chess-sittings.js` and `content/skill-chess-sittings.data.json` from the backups' state (see below) |
| **Stage gate on chess** | `SKILL_STAGE_GATE_SHADOW` default = `CH2,CH3,CH4,CH5` (new code default; an env value replaces it, and an empty value clears it) | With 05 on, every chess stage is fully wired. **CH0 and CH1 now hold** graduation until their measured skills are proven on two cold days (their checks were each run end to end in the test copy: mazes, set-up, the 02 item checks, KQK play-outs, two legal games against the strength-1 bot). **CH2-CH5 stay in shadow**: their recorded-game checks need two blocks of 12 rapid games per stage, which is an owner call (a rolling window would be lighter), and CH4-CH5 lean on the Maia-2 worker, which restarted about 65 times in the bench games. | `SKILL_STAGE_GATE_SHADOW=CH0,CH1,CH2,CH3,CH4,CH5` (all chess in shadow), or restore `services/skill-gate.js` |
| **Practice bot fix** (`public/engine/chess/bot.js` `chooseMove`) | none | At strengths 6-10 the bot no longer plays an arbitrary move once its node budget runs out (every root move searched after that scored +MATE). Now each depth is searched with the full budget and the deepest complete one decides. Strengths 1-5 choose exactly the same moves as before (0 of 431 test positions differ). Measured: strength 10 from 1039 to **1663** (95% 1541-1797), strength 7 1386 (1275-1508), Lichess scale. | Restore `public/engine/chess/bot.js` from the backups |
| **Strength-to-rating mapping** (`bot.js` `RATED`, `strengthForRating`; used by `routes/chess.js` `POST /bot/move` and `public/engine/chess/spar.js`) | none | A requested rating now gets the measured strength nearest it: 1 = 125, 3 = 788, 5 = 973, 7 = 1386, 10 = 1663 (was strength = (rating - 300) / 100, which put strength 1 at 400 and 10 at 1300). Maia-2 still plays ratings 1000 and up where it is installed. | Restore `routes/chess.js` and `public/engine/chess/spar.js` |
| Tests | `package.json`: `skills-r3-chess-test` added after `skills-r3-dose-test`; `scripts/lib/skills-r3-fixture.js` sets `SKILL_CHESS_SITTINGS=off` and an empty shadow list so 01-04's own tests see 02's checks | | Restore both |

- **Recorded-game bands** use the measured ratings above (`content/skill-chess-sittings.data.json` `opponents`): CH1 legal games strength 1; 600-800 strength 3; 900-1100 strength 5 and Maia-2 1100; 1200-1400 strength 7 and Maia-2 1300; 1400-1600 Maia-2 1500 (strength 7, within 100 points, where Maia-2 is absent). The rating numbers and method: `skill-apps-bench/CHESS-ENGINE-BAKEOFF.md`, "A rating for our bot".
- **To roll back all of it:** copy every file in `before-skills-live\` back to its path, then delete the files patch 05 added: `content/chess-endgame-tables.js`, `content/chess-endgame-tables.data.json`, `content/skill-chess-sittings.js`, `content/skill-chess-sittings.data.json`, `services/skill-chess-sittings.js`, `public/js/chess-sittings.js`, `scripts/skills-r3-chess-test.js`.

## Objective items served live (added 12:50 UTC, objective-items agent)

Owner-approved ("verified fixes go live") through the coordinator. Memory checks, fading and durability retrievals in the daily review, and the recall round of record-based remediation, now ask a question **written for that objective** before falling back to the bank's question on its skill. Backups: scratchpad `34e6f487...\before-objective-items\` (every edited file as it was, at its own path). `data/db.json` and `.env` were not touched; no model was called; nothing was committed.

| Change | Switch, and its default | What learners get | To undo |
|---|---|---|---|
| **Objective items** (`services/objective-items.js`, new; `content/objective-items/<track>.<grade>.json`, new) | `OBJECTIVE_ITEMS` = `on` (new) | A review or recall question on an objective that has kept items is one of them (choices shuffled; never one this learner was asked in the last 600 items or earlier in the sitting). When an objective has none, or none left unasked, the bank's question is used as before. Keys and rationales stay server-side until the answer (`sessions.sanitize`). | `OBJECTIVE_ITEMS=off`: the bank everywhere, exactly as before |
| **Coverage: "written for this objective"** (`services/coverage.js` `answersFor`, `fold`, new `writtenRule`) | same switch | A right answer to an objective item counts toward the proof's aligned-evidence rule (`OBJ_MIN_ALIGNED`); a bank question that only carries the objective's tag is still that objective's evidence but no longer counts as aligned. Lesson checks and games count as before. Simulated answers (no `written` flag) are read as before. | `OBJECTIVE_ITEMS=off`: every tagged answer counts as aligned again |
| Where they are asked | `services/review-session.js` `questionFor` / `start`; `routes/remediation.js` `POST /remediation/:id/recall` | | Restore both from the backups |
| Build (`scripts/build-objective-items.js`, new; `npm run build:objective-items`) | none | Re-runnable: reads only the factory's kept lists (`staged/adaptation/objective-items.cache.jsonl`, `objective-items.*.json`, `objective-items-night/*.jsonl` and `*.json`, plus `OBJECTIVE_ITEM_SOURCES`), requires `verified.code` and two blind judges from two different model families, re-runs the app checks (structure, 4 distinct options, key among them, key not in the question, length cue, rationale-key agreement, math-claims for math, no picture/audio, rationale present), drops duplicates, and rewrites the grade files. Report: `content/objective-items/_build-report.json`. | Delete `content/objective-items/` (the review then falls back to the bank) |
| Tests | `package.json`: `objective-items-test` added after `round3-held-test`; `test:objective-items` script | | Restore `package.json` |

- **Imported at 12:48 UTC:** 1,010 items on 295 objectives in 8 grades. Math 382 items, 103 objectives (counting_and_comparing 35/35, sense_of_quantity 28/28, volume_coordinates_and_expressions 40/41); English 396, 129 (basics 32/33, grammar 43/45, intermediate 54/57); reading 232, 63 (foundations 37/40, early_decoder 26/41, still being written). 36 kept items failed the app checks again and were dropped, all from the day pilot, which predates the length-cue and key-agreement checks: 18 length cue, 13 rationale pointing to another option, 5 math-claims (2 of them real wrong arithmetic in rationales, 3 are the checker misreading "1,000").
- **Re-import newer kept items:** `node scripts/build-objective-items.js` (add `--dry` to report only), then restart the server (grade files are read once per process).
- **Verified:** `objective-items-test` (56 checks: loading, only kept/valid served, fallback, no repeats in or across sittings, keys hidden, coverage counting, remediation recall); the full `npm test` chain **50/50** on a `data/db.json` copy with keys blanked and `OLLAMA_ENABLED=0` (ollama-provider-test without it); a headless click-through of a review sitting on a scratchpad copy of `db.uitest.json` (port 6871, never the live server): 10 of 10 questions were objective items, all distinct, keys only shown after answering, 0 console errors, every API call 2xx.
- **To roll back all of it:** set `OBJECTIVE_ITEMS=off`, or copy `before-objective-items\services\review-session.js`, `services\coverage.js`, `routes\remediation.js` and `package.json` back, then delete `services/objective-items.js`, `scripts/build-objective-items.js`, `scripts/objective-items-test.js` and `content/objective-items/`.

## Placement re-validation (placement agent, 13:10 UTC)

Owner-approved through the coordinator: verified fixes go live. Backups: scratchpad `34e6f487...\before-placement\` (code, content, judge caches as they were at 03:17; every `data/db.json` write also has its own full copy there). Report: `curriculum-build/PLACEMENT-REVALIDATION-2026-10-24.md`.

| Change | What learners get | To undo |
|---|---|---|
| **"I don't know" placement fix** (`services/unit-placement.js placedUnit`, `services/adaptive-placement.js quantile`; knobs `UNIT_THIN_SURE` 0.5, `UNIT_THIN_Q` 0.1, `UNIT_THIN_ASKED` 6) | An in-grade placement with no right answer places at unit 1 (it said "unit 6 of 20" after one "I don't know", "unit 11" with none). A walk stopped before 6 answers starts at the low end of the belief. Complete walks place exactly as before (tester suites unchanged in every row). | `UNIT_THIN_ASKED=0` turns off the quantile rule; restore the two files from `before-placement\services\`. |
| **Math subject placement: 2 wrong keys fixed** (`content/placement-revisions/math.json` md5 cccdef57… → 6491ee13…, `content/placement-calibration/math.json` 16b7c7c4… → 2f6a6b11…) | Grade 4 easy: the ten-frame item described 5 + 2 boxes but keyed 12; now describes 10 + 2. Calculus I hard: the balloon related-rates item keyed 3/(16π), right answer 3/(64π) was not an option; now it is, and keyed. Calibration carried over. | Copy `before-placement\placement-revisions.math.before-mathfix-*.json` and `placement-calibration.math.before-mathfix-*.json` back. |
| **IQ subject placement set replaced** (`data/db.json` `placement_question_sets`: row 69, the `subject-placement-test.js` fixture "easy question 1 … right/wrong1" from 2026-10-06, replaced by row 70; md5 **8eafc0cf52f439920ea56d00ba0b3194 → f49a1d07f68de8d290b3bd4172aa3f22**) plus new `content/placement-calibration/iq.json` (62 points) | IQ "Find my grade" asks 84 real questions (12 grades × 7) instead of placeholders. Every key checked by two judges of families other than the writer (A MiniMax blind key check; B Gemini 3.6 Flash / Nemotron), 8 judge doubts source-checked: 8 items rewritten (keys worked by hand), 3 doubts overruled with the working. Simulated testers within one grade: 16/96 before → 76-85/96 (by judge). | `before-placement\db.json.before-placement-sets-2026-10-24T13-10-10-926Z` is the whole file before the write; delete `content/placement-calibration/iq.json`. |

**Verified (13:15 UTC):**
- **Grading eval, NVIDIA only:** Ultra and Lightning on all cases, GLM 5.3 max on the ones they left open. The live policy is unchanged and still the winner: 0 false accepts on all 585 cases, including the 44 adversarial ones. Accuracy on the original 541 cases is 0.9926, the same as before. Ultra alone said "correct" to 6 of 42 adversarial answers with the old prompt and 0 of 44 with the new one. The eval block in `config/model-lineup.json` was updated; the policy fields were not touched.
- **Frame check:** every stored page ran in the sandboxed frame, 114 of 114 (18 base lessons, 67 shared games, 12 tailored games, 17 tailored lesson pages). In each, storage and the API were unreachable, and there were 0 errors. Finish worked on all 18 lessons, and a game answer and win were recorded end to end. The same probe on the old mount gave the same results on all 84 pages it could open.
- **Tests:** `security-test` passes 100/100 (19 of the new checks fail on the code from before the fix). The full chain passes 48/48.
- **Full write-up:** `SECURITY-REVIEW-2026-10-24.md`, "Follow-up fixes".
| **ACT subject placement set added** (`data/db.json` `placement_question_sets` row 71, new; md5 **0cf31aad7840bf9f97e339a2845df31b → 13f4ef3a815ec5a457e2c4ec324c30ca**, 14:14 UTC) plus new `content/placement-calibration/act.json` (84 points) | ACT "Find my grade" had no set (the first learner would have triggered an unchecked live model write); it now has 112 verified questions (16 grades × 7). Keys: A MiniMax blind key check, B Gemini 3.6 Flash / Nemotron / GLM-5.3 (never the writer's family); 13 doubts source-checked: 8 items rewritten, 1 key fixed (20/132), 4 doubts overruled with the working. Simulated testers within one grade: 112-113 of 128 in every mode. | `before-placement\db.json.before-placement-sets-2026-10-24T14-14-55-896Z`; delete `content/placement-calibration/act.json`. |

The two math key fixes listed above were applied at 12:33 UTC and survived the 13:20 crash (md5 6491ee13… and 2f6a6b11… unchanged).

## Owner base vs optimized, and the owner's skips (owner-base agent)

The owner's rule: their account (the.landon.d@gmail.com) gets the base product with nothing modified, and every other learner gets every modification. On top of that, the owner may skip anything, from the UI, and no gate holds them.

- **Inventory and reasoning:** `curriculum-build/OWNER-BASE-VS-OPTIMIZED.md`, with 31 features listed.
- **Backups:** `scratchpad/34e6f487.../before-owner-base/`. `backup.log` has each file's md5, and `new-files.txt` lists the new files.
- **Not touched:** `data/db.json` and `.env`. Nothing was committed.
- **Restart needed:** the running server (port 6767) only picks this up after a restart.

| Change | Switch (default) | What changes | To undo |
|---|---|---|---|
| **One owner check** (`config/owner.js` `isOwner`, `ownerEmail`, `ownerBase`) | `OWNER_EMAIL` (unset: the.landon.d@gmail.com) | `capabilities`, `subscriptions`, `base-lessons`, the `ADMIN_EMAILS` default, `block-levels` and the old `ADAPT_OWNER` copies now all ask it. Nothing changes for anyone at the default address. | Restore the files from the backup |
| **Owner gets base** | `OWNER_BASE` = `on` (new); `ADAPT_OWNER=1` is the old alias | For the owner only: neutral session settings, an empty scorecard contract, the standard coach and lesson brief, an empty scorecard prompt block, no skill practice dose (404), no stage-gate hold, no too-fast set-aside and no slow-down note. Old legacy lessons written with the owner's profile are rewritten as base lessons. | `OWNER_BASE=off` and restart |
| **Learners: legacy lesson writer gets adaptation lines** (`services/lessons.js` `adaptLines`) | follows `ADAPTIVE_TEACHING` | Lessons written in a sitting now get the contract's lesson lines and "how to teach this level" from the learner's record, as block levels and the level editor already did | Restore `services/lessons.js` and `services/ai.js` |
| **Owner skips** (`services/owner-skips.js`) | none; owner only, through `requireSkip` (403 for everyone else) | `POST /api/placement/skip`, `/api/enrollments/:id/skip-grade`, `/api/owner/go` (any level of any grade), and `jump-to` backwards. UI: "Skip placement" (placement player), "Go to level / Skip this grade / Any grade" (path hero), "Go here / Start here, no placement" (curriculum browser), and a link past the subject placement. | Restore `routes/learn.js`, `routes/placement.js` and the four `public/js` files; delete `services/owner-skips.js` |
| Tests | — | New `scripts/owner-base-test.js` (63 checks, on a copy of `data/db.json`) is in `npm test` and also runs as `npm run test:owner-base` | Restore `package.json` |

## Retention enforcers and the retention calendar (retention agent, 2026-10-24 evening)

Owner approved, through the coordinator: live, with the flag on by default, an off switch and a rollback. How it works: `curriculum-build/RETENTION-ENFORCERS.md`. The parameters are from the research file `curriculum-build/retention-enforcer-params.json` (v1.0.0), read through `services/retention-params.js`.

- **Backups:** `scratchpad/34e6f487.../before-retention/`, every edited file at its own path. `backup.log` has the md5s, and `new-files.txt` lists the new files.
- **Not touched:** `data/db.json` and `.env`. Nothing was committed.
- **Restart needed:** the server on 6767 picks this up only after a restart.

| Change | Switch (default) | What learners get | To undo |
|---|---|---|---|
| **Study sessions** (`services/study-sessions.js`, `public/js/study.js`) | `RETENTION_ENFORCERS` = `on` (new) | A strip under the header on every signed-in page: Start session, then Pause/Resume and End. It counts only active time: a heartbeat while the page is visible and in use, with gaps capped at 5 minutes. End offers "End session" or "End day session". | `RETENTION_ENFORCERS=off`: the strip, Calendar link and `/api/retention/*` go (404), and the daily review comes back unfolded |
| **Retention enforcers** (`services/enforcers.js`) | same | At the end, the learner picks quick, medium, full or none. Full is at most 9.5% of the covered active time, and the others are shorter. Questions come only from the covered window, ranked by predicted forgetting and errors. A miss gets one more try on medium and full. Results go to coverage (retrieval evidence) and mastery (the review schedule). An enforcer left unchosen or half done is offered before the next session. The owner gets the base version and a Skip button. | same |
| **Scheduled enforcers and calendar** (`services/retention-schedule.js`, `/calendar`) | same | Semi-weekly (days 7k+2 and 7k+5), weekly (7k), bi-weekly (14k−4) and monthly (a pocket day near 30m), counted from the first session's local date. A calendar page shows each day's type and status. | same |
| **Daily review folded in** (`services/review-session.js` `planFor`, `public/js/path.js`, `public/js/review.js`) | `ENFORCER_FOLD_REVIEW` = `on` (new) | The path's "Today's review" row becomes "Older work to keep": only objectives no enforcer will reach, plus the lessons to learn again. It is whole again while the Final is held for consolidation. | `ENFORCER_FOLD_REVIEW=off` |
| **Coverage: retries are not evidence** (`services/coverage.js` `answersFor`) | follows enforcers (only enforcer retries carry `requeue_of`) | An enforcer's "one more try" straight after feedback is not read as a retrieval | Remove the 3-line `requeue_of` skip |
| **Other edits** | none | `config/db.js` (2 collections); `routes/consent.js` (export and delete them); `routes/learn.js` (an enforcer sitting is never taken for the level's open sitting; the answer route ticks the study clock and the enforcer budget); `services/sessions.js` (the same exclusion); `server.js` (mount); `middleware/auth.js` (`retention` on `/api/auth/me`); `public/js/app.js` (Calendar nav, loads `study.js`); `public/css/style.css` (section 30); `package.json` (2 tests, `test:retention`) | | |

**Tuning knobs:** `RETENTION_IDLE_END_MIN` (30), `RETENTION_PARAMS=defaults` (ignore the file), `RETENTION_PARAMS_FILE`.

**Rollback:**
- **Flags:** `RETENTION_ENFORCERS=off`, then restart. This alone restores the old behaviour.
- **Code:** copy the files in `before-retention/` back, then delete the files listed in `before-retention/new-files.txt`.
- **Caution:** `routes/learn.js`, `services/sessions.js`, `package.json` and `public/js/app.js` are shared with other agents' work. Prefer reversing only this change's hunks: diff each against its backup.
- **Data:** the `study_sessions` and `enforcers` rows are harmless when off.

**Verified:**
- `retention-schedule-test`: 32 checks over 8 years; 549 anchors; 11 time zones, every 6 hours for 4 years.
- `retention-enforcers-test`: 65 checks. They cover the params file in force; full at most 9.5% at every active time; planned and actually used time under 10% at measured timings; resume and choose on return; scheduled merging; calendar statuses; owner base vs optimized, and skip; no question from outside the window; the switches.
- The full `npm test` chain on a `data/db.json` copy, keys blanked, `OLLAMA_ENABLED=0` (ollama-provider-test without it): **53/53 pass**, on the final code.
- Click-through on a test copy (port 6893, scratchpad copy of `db.uitest.json`, keys blanked, Ollama off, `OWNER_EMAIL` set to a test owner) at 375 and 1280 px, dark and light. It covered:
  - the waiting scheduled offer, quick, and the result with "A second look";
  - Start session, the running strip, End, End session, and full with retries;
  - leaving halfway, the offer on return, and the resume panel, through to finished;
  - the owner's day enforcer, with standard timing and Skip;
  - the calendar month, statuses, legend and upcoming list.

  There was no sideways scroll and no console errors.

## Retention enforcers revised: absorption and the allocation rule (retention agent, 2026-10-24 night)

Owner's clarification, through the coordinator. How it works now: `curriculum-build/RETENTION-ENFORCERS.md`; the evidence for the new rule: section 5a of `RETENTION-ENFORCER-EVIDENCE.md`; parameters: `retention-enforcer-params.json` v1.1.0 (new `allocation` section).

- **Backups:** `scratchpad/34e6f487.../before-retention-2/`, every edited file at its own path.
- **Not touched:** `data/db.json` (md5 checked before and after) and `.env`. Nothing was committed.
- **Restart needed:** the server on 6767 picks this up only after a restart. (It was not listening when this work finished; nothing here stopped it.)

| Change | What learners get |
|---|---|
| **Schedule** (`services/retention-schedule.js`) | Semi-weekly strictly every 3 then 4 days from the anchor (3, 7, 10, 14, ...), no offset. On a weekly's day the weekly absorbs it: one enforcer. Bi-weekly moves to 12, 26, 40, ..., with a free day on each side. Monthly: the pocket day nearest a lone semi-weekly. Every window now ends on its own day, because the scheduled enforcer absorbs that day's end-of-day enforcer. |
| **When it is offered** (`services/enforcers.js`) | On a scheduled day nothing blocks that day's sessions. "End day session" is the scheduled enforcer, and the end prompt says so. If the day ends without it, it is offered before the next session (late). |
| **One plan, not a sum** (`slots`, `plan`, `fit`) | One first try per topic. A second, varied try (a new question on the same objective, late in the sitting) only for fragile topics, on medium and full. All slots ranked by value per cost. At most 2 first tries per topic, whatever the enforcer absorbed. |
| **Combined budget** (`services/retention-params.js` `combinedBudgetMs`) | The largest part + 0.5 × the others, capped at the largest cap and at 9.5% of the union's active time: always less than the separate enforcers added up, and full under 10%. |
| **Retries** | Counted per question chain. On an objective, a retry is only another question written for it. Before, it fell back to the skill bank, which in the click-through served a perimeter problem on a Pre-K counting objective. |
| **UI** (`public/js/calendar.js`, `public/js/enforcer.js`, `public/js/study.js`, `public/css/style.css` one selector) | The calendar shows W+S (desktop: "Weekly + semi-weekly") on absorbed days, "today, at End day session" for today's, and a legend line. The enforcer page says what it took in. `GET /api/retention/state` adds `scheduled_today` (`routes/retention.js`). |
| **Sources** (`retention-sources.json`) | 5 added, all verified by DOI, title, first author and year (pyc2007, vaughn2013, rawson2020end, karpicke2011spaced, rawson2013relearn). The lyle2020 abstract was retrieved; rawson2011 was re-checked against its abstract. 82 new + 65 reused. |

**Rollback:**
- Copy the files in `before-retention-2/` back. No new files, no data migration.
- Old enforcer rows still work: they have no `parts`, so they use the single-scope budget.

**Verified:**
- `retention-schedule-test`: 35 checks over 8 years; 549 anchors; 11 time zones, every 6 hours for 4 years. It covers the plain 3/4 alternation, absorption (only the weeklies are shared), the bi-weekly's free days, monthly placement against a brute force, and windows covering each day exactly once.
- `retention-enforcers-test`: 99 checks. New: the allocation rule on its own; the combined budget over 30 min to 40 h (at most 9.5%, under the sum of its parts); End day session on a weekly's day as one weekly over the week, the semi-week and the day, with no separate day enforcer; at most 2 tries per topic, a second only on fragile topics, varied and spaced after the first tries; the plan equal to what the rule fits; no question from outside the window; retries on objective items; the calendar's absorbed day; a lone semi-weekly day; a second End day after the scheduled one.
- The full `npm test` chain on a `data/db.json` copy, keys blanked, `OLLAMA_ENABLED=0` (ollama-provider-test without it): **53/53 pass**, on the final code.
- Click-through on a test copy (port 6917, scratchpad copy of `db.uitest.json`, keys blanked, Ollama off) at 1280 and 375 px. It covered:
  - the end prompt naming today's weekly with the semi-weekly;
  - End day session opening ONE weekly enforcer that "takes in the semi-weekly and the end of October 24";
  - full: 8 topics, 4 fragile topics with a second try, 12 questions, budget 14.9 of 156.5 active minutes;
  - leaving after 1 question, the "half done" strip, and the resume panel, through to results (13 min used);
  - the calendar showing W+S on today and on every weekly, done after finishing, with no sideways scroll at 375 px;
  - after the retry fix, an all-wrong full run: every retry an on-objective item, 14.7 of 14.8 budget minutes (9.4% of active time).

  There were no console errors.

## Owner-review items (added 20:55 UTC, owner-review agent)

Details are in CONTENT-FACT-AUDIT.md section 9. Backups are in scratchpad `34e6f487…\before-owner-review\` (with `backup.md5`).

| Change | State | To undo |
|---|---|---|
| **Skill curriculum sources** (`curriculum-build/basketball/drafts/B03–B07.txt`, `piano/drafts/P04.txt`, `P05.txt`): the 5 night-verified lesson changes, B06 and P04 | **Live in the source files.** `validate.js` passes for basketball and piano. **Built into the app at 22:05 UTC** (see "Skill rebuild" at the end of this file); the matching `data/db.json` level remap is staged there. | Copy the 7 files back from `before-owner-review\drafts\`. |
| **`data/db.json`: 20 rows, 106 fields.** Block plans 1, 2, 3, 4, 10, 14, 17, 19, 23 and 27; lessons 30, 80, 233, 1219, 1801, 2040, 2815 and 3069; items 7178 and 61322. | **Staged, not written:** the app is running on 6767. The changes are `curriculum-build/staged/content-fixes/owner-review/db-changes.json`, applied with `apply-owner-review.js`. On a dry run against a copy of the live DB (md5 `6b8c0686…`), 20 of 20 applied, and the full chain passed 53/53 on that copy. | Restore the backup taken before the apply. |

**B06** now says exactly "1.25 m to the inner edge and 1.30 m to the outer edge of its 5 cm line", from FIBA OBR 2026 2.5.7 and the 5 cm line width.

**P04** now teaches "Minor Keys Sharing Major Signatures" before "A and D Natural Minor Scales". This follows the graph edge relative_minor → natural_minor and ordering rule 1. Judge A's earlier "wrong" was a misreading of the "<->" notation.

**B05 and P05** were shortened to the 25-word limit and re-judged.

**To apply the DB changes (coordinator):**
1. Stop the app.
2. Back up `data/db.json` and log its md5.
3. Run `node curriculum-build/staged/content-fixes/owner-review/apply-owner-review.js data/db.json curriculum-build/staged/content-fixes/owner-review/db-changes.json <report.json> --write`.
4. Log the md5 after, then restart.

The script refuses any row whose stored value is no longer the audited "before". Shipped `content/base-levels/english-proficient.json` still holds the old block plans until `npm run base:export`.

## Piano PI2-PI10 and basketball BB1-BB12 stage checks (added 2026-10-24 evening, piano/basketball checks agent; away-run task 5)

Every piano and basketball stage check that was "not checkable here yet" can now be sat, as chess's patch 05 did for chess. Details, rules and test list: `staged/adaptation/skills-round3/README.md` section 06. **The running app on 6767 needs a restart** for the server side; the page scripts are served from disk at once and work with the old server until then (new fields are ignored).

| Change | Switch (default) | What it does | Turn off / roll back |
|---|---|---|---|
| **Piano and basketball sittings** | `SKILL_PIANO_BB_SITTINGS` = `on` (new) | Sight-reading (2 never-seen excerpts drawn in notation, SR2/SR3/SR4, SR5-7 by grade), PI5-7 and PI8-10 technique with evenness, PI5-7 repertoire with restarts from memory, MIDI dynamics, MIDI legato pedalling (CC64), a new piece learned alone within 14 days; basketball decision scenes on the court for BB1-BB7 (keys re-derived from the positions), BB4-5/BB6-7 zone counts with the Beta rule, BB4-5 FIBA-line free throws, BB8-12 applied computations. Camera and microphone stay on the device; a microphone or camera result counts only when confirmed, as before. | `SKILL_PIANO_BB_SITTINGS=off` (back to 02's "not wired" list, and PI2-PI4 go back to shadow by themselves) and restart; or restore the backed-up files (below) and delete the new ones |
| **Stage gate on piano and basketball** | `SKILL_STAGE_GATE_SHADOW` default = `CH2,CH3,CH4,CH5,PI5-7,PI8-10,BB1,BB2,BB3,BB4-5,BB6-7,BB8-12` (new code default; an env value replaces it, an empty value clears it) | **PI2, PI3 and PI4 now hold** graduation until every measured skill is proven on two cold days (each of their metrics was sat end to end through the API in the test copy, then graduation was held and released). **PI5-7, PI8-10 and BB1-BB12 stay in shadow**: PI5-7's repertoire has 3 library pieces, all from its first grade, and its tempo/CV cuts are [R]; PI8-10 has no library pieces at its grades; the decision scenes have no measured reliability (the progression asks split-half >= 0.8 after 100 learners); BB4-BB7 zone marks are [R]; BB8-12 checks only the computations of its applied tasks. | `SKILL_STAGE_GATE_SHADOW=CH2,CH3,CH4,CH5,PI2,PI3,PI4,PI5-7,PI8-10,BB1,BB2,BB3,BB4-5,BB6-7,BB8-12` keeps PI2-PI4 in shadow too; or restore `services/skill-gate.js` |
| Fix to the 02 technique check | none (a bug fix, outside the flag) | Arpeggios now climb to the top tonic (PI3 "G major arpeggio" stopped on D, so a right performance came out late on every note down and failed), and PI4 "chromatic from C" has notes (a sitting that drew it crashed). | Restore `services/skill-checks.js` |
| Learner lines | none | 12 metric lines in `content/skill-learner-text.js` now state the numbers they are graded by (as `learner-followups-test` requires once a check is wired). | Restore the file |
| Tests | `package.json`: `skills-r3-piano-bb-test` (88 checks) after `skills-r3-chess-test`; `scripts/lib/skills-r3-fixture.js` sets `SKILL_PIANO_BB_SITTINGS=off` so 01-04's own tests see 02's checks | | Restore both |

- **Verified (test copy `scratchpad/app-skill2`, a copy of `data/db.json`, keys blanked, `OLLAMA_ENABLED=0`, `ollama-provider-test` without it):** full `npm test` chain plus `learner-path-test`, 55 of 55 (see the run log in the AWAY log); `skills-r3-piano-bb-test` 88 checks PASS; `consent-test` (no-upload scan) PASS; `skill-audit.js --checks=<copy>`: PASS, guarantee 0 violations, piano 25 of 25 and basketball 19 of 19 provable metrics have a sitting. Click-through on port 6811 (a scratchpad copy of `db.uitest.json`, seeded test learner): PI2 sight-reading drawn and played on the on-screen keys (both pieces at the bar, counted cold), BB4-5 scenes played and paused on the court, answered, reviewed with reasons, zone count form with the mid/3-point choice and per-zone intervals, PI8-10 piece to learn and pedalling page (microphone button hidden); no console errors, no horizontal overflow at 278 px.
- **New files:** `content/piano-sight-reading.js`, `content/basketball-scenes.js`, `content/skill-piano-bb-sittings.js`, `content/skill-piano-bb-sittings.data.json`, `services/skill-piano-bb-sittings.js`, `public/js/piano-notation.js`, `scripts/skills-r3-piano-bb-test.js`, `curriculum-build/staged/adaptation/skills-round3/tools/build-piano-bb-data.js`.
- **Changed files (backed up with md5s in scratchpad `before-skill-checks-2/`):** `content/skill-stage-checks.js`, `content/skill-learner-text.js`, `services/skill-checks.js`, `services/skill-gate.js`, `services/skill-dose.js`, `routes/skill-checks.js`, `public/js/skill-kit.js`, `public/js/stage-check.js`, `public/js/skill-practice.js`, `public/stage-check.html`, `public/skill-practice.html`, `public/css/skills.css`, `scripts/lib/skills-r3-fixture.js`, `package.json`, `curriculum-build/staged/adaptation/skills/skill-audit.js`, `curriculum-build/staged/adaptation/skills-round3/README.md`.
- **Full rollback:** copy every file in `before-skill-checks-2/` back over the live tree, delete the new files above, restart. `data/db.json` was not written; learner rows only gain `seen_excerpts` and `assignment` fields on `skill_records` when the new checks are used, which the old code ignores.
- **Not done / owner calls:** the decision-scene sets need real learners for reliability before BB1-BB7 can hold; a piano teacher should set tempo targets and CV cuts before PI5-7/PI8-10 hold; more library pieces at PI5-PI10 grades would let the repertoire check use the right grade.

## Grade-appropriate skills (grade-fit agent, 2026-10-24 night)

Task 4 of `AWAY-2026-10-24.md`, owner-approved through the coordinator ("verified fixes go live"). The subjects audit's open item 1: grades drew from skills that did not fit them, because the sheets' skill tags were keyword guesses. Sense of Quantity (preschool) carried linear equations and addition; Abstract Algebra I tagged "Order of an Element" as addition; doctoral Reading listed phonics, so its Final could ask "Which type of syllable is 'rain'?"; three C2 Spanish grades had no tags and fell back to all fourteen A1-B1 skills. Grade bands (07:55) fixed the difficulty inside a skill; this fixes which skills a grade draws from.

- **Backups:** `scratchpad/34e6f487...\before-grade-skills\`, every edited file as it was, at its own path.
- **Not touched:** `data/db.json` (md5 `cc525e73f3b1975648b10924b88532d6` before and after) and `.env`. No model was called. Nothing was committed.
- **Restart needed:** the server on 6767 reads the curriculum and the bank once, at start. It was left running.

| Change | Switch, and its default | What learners get | To undo |
|---|---|---|---|
| **Grade-fit mapping** (`config/grade-skills.js`, new; `config/curriculum.js` `sheetGrades`) | `GRADE_SKILLS` = `on` (new) | Each track has a fit table: for every skill, the first and last grade where it is neither above nor far below the grade. Each lesson is re-tagged with the first fitting skill its own title, then its coverage text, names (ordered keyword rules); failing that, its sheet tag if it fits; failing that, the fitting core skill nearest the grade. Other rows follow their lesson. Spanish and basketball keep every tag that fits and replace only those that do not. A grade's skills, and so its path, checkpoints and Final, come only from those. Math, English, Reading, Spanish and basketball are mapped. IQ, ACT, chess and piano are unchanged (age-neutral reasoning families; one exam's content; researched per-level tags). | `GRADE_SKILLS=off`: the sheets' own tags, exactly as before |
| **New bank skills where none fitted** (`content/math-grade-items.js`, `content/english-grade-items.js`, `content/spanish-grade-items.js`, new; wired in `content/math-items.js` and `content/bank.js`; names in `config/curriculum.js` `SKILLS`) | served only where `GRADE_SKILLS` maps them | **Math, 13:** counting, facts within 20, shapes and patterns, place value, money/time/units, data and statistics, calculus, linear algebra, probability, discrete mathematics, abstract algebra, analysis, topology. Every answer is computed. **English and Reading, 5:** early literacy and early comprehension (generated, checked against the text shown), plus literary analysis and theory (43 items), research and argument (32) and linguistics (27). **Spanish B2-C2, 3:** advanced grammar (2 families and 20 items), idioms, register and dialects (34), and Hispanic literature and culture (34). | With `GRADE_SKILLS=off` no grade lists them, so none is served |
| **Coverage keeps old evidence** (`services/coverage.js`: `sheet_skill`, `onSkill`) | same switch | A learner's answers recorded under a lesson's old tag still count as on that objective's skill. | Off: objectives carry no `sheet_skill` |
| **Objective items on the objective's current skill** (`services/objective-items.js` `pick`) | same switch (with it off, the current skill is the sheet tag) | A review or recall item is served, and so recorded, on the skill its objective has now. Without this, history keyed by skill missed yesterday's items. The objective-items test caught a repeat across sittings. | Restore the file from the backups |
| **Checks** | none | `scripts/grade-skills-test.js` (new, in the `npm test` chain after `coverage-test`; `npm run test:grade-skills`). The template audits now cover the new skills: `math-reading-template-audit.js` has 100 new independent verifiers, plus a section for the English and Reading items with `REVIEWED_ENGLISH`; `spanish-template-audit.js` has the two family verifiers and `REVIEWED_ES`. Test expectations updated where they asserted the old tags: `self-test.js` (a jump in Sense of Quantity masters its own first skill, not `add_sub`), `spanish-csv-test.js` (looks up the new Spanish generators too), `objective-items-test.js` (a stored item may carry the replaced tag; new check that it is served on the current skill). | Restore from the backups |

**What changed, in numbers:**
- **Grades re-pointed:**
  - math 49 of 49, English 16 of 16, Reading 16 of 16;
  - Spanish 38 of 57 (19 A1-B1 grades already fitted);
  - basketball 1 of 15 (court basics leave the research grade).
- **Level rows re-tagged:** math 25,232 of 28,780; English 6,567 of 8,388; Reading 5,640 of 6,578; Spanish 6,104 of 10,169; basketball 10.
- **Objectives re-tagged:** 4,126 of the 6,793 in mapped tracks.
- **For example:**
  - preschool math is now counting and shapes;
  - Kindergarten: counting, shapes and facts within 10;
  - doctoral math: abstract algebra, probability, analysis, linear algebra, topology and discrete mathematics;
  - doctoral English and Reading: literary analysis, research and linguistics;
  - C2 Spanish literature: es_literature, es_idioms_register and es_adv_grammar.

**Verified:**
- **`grade-skills-test`:**
  - It covers all 219 grades: 136,351 level rows, 136,570 level plans, 3,616 checkpoint plans and the Final through the real planners (`sessions.planLesson` and `planCheckpoint`), 50,855 bank items generated from those plans, and 13,070 objectives.
  - Every skill fits its grade. Generation never threw, and the coverage model validates for every grade.
  - The audit's cases pass: preschool math's Final asks only counting and shapes with answers within 20; doctoral Reading's Final never asks about syllables; preschool English's Final has no ACT-style passage questions.
  - Of the objectives in classify-mode tracks, these have a skill their own title or coverage names: math 2,324 of 2,617 (89%), English 652 of 755 (86%), Reading 526 of 584 (90%). The rest follow the lesson before them or the grade's nearest core skill, which also fits.
  - IQ, ACT, chess and piano are byte-for-byte the sheets' tags. With `GRADE_SKILLS=off` the sheets' level rows are served unchanged (checked in a child process).
- **Template audits clean:**
  - math-reading: 400 families, 111,848 renderings; the 13 new math skills were also run at 300 seeds per difficulty;
  - Spanish: clean, including 716 renderings of the 3 new skills;
  - English, other and IQ: clean.
  - `npm run check`: 31,500 items across 126 skills, no problems.
- **The full `npm test` chain** on a `data/db.json` copy, keys blanked, `OLLAMA_ENABLED=0` (ollama-provider-test without it): **55/55 pass** (the chain now includes `grade-skills-test`). After a final line-ending fix the 12 affected commands were re-run: 12/12. `self-test`, `objective-items-test`, `spanish-csv-test` and `coverage-test` also pass with `GRADE_SKILLS=off`.

**Limits:**
- Lessons and block layouts already stored for a learner keep their questions until they are rewritten. A learner's mastery on a replaced skill stays in their record, unused.
- The authored C1-C2 and doctoral pools are 22 to 45 items each, so a long grade will repeat some. The objective items the content factory is writing remain the deeper fix.
- Preschool and Kindergarten math share the same difficulty band, so both draw counting up to 20.

**To roll back:**
- **Switch only:** set `GRADE_SKILLS=off` and restart.
- **Remove it all:**
  - Copy back from `before-grade-skills\`: `config/curriculum.js`, `content/bank.js`, `content/math-items.js`, `services/coverage.js`, `services/objective-items.js`, `scripts/math-reading-template-audit.js`, `scripts/spanish-template-audit.js`, `scripts/self-test.js`, `scripts/spanish-csv-test.js` and `scripts/objective-items-test.js`.
  - In `package.json`, remove `node scripts/grade-skills-test.js && ` from `test` and the `test:grade-skills` line. Do this by hand rather than copying the backup, because other agents edit the test chain too.
  - Delete the new files: `config/grade-skills.js`, `content/math-grade-items.js`, `content/english-grade-items.js`, `content/spanish-grade-items.js` and `scripts/grade-skills-test.js`.
  - Restart.
  - Before copying, compare each file with its backup: another agent may have edited it since.

## Skill rebuild: basketball and piano lesson changes built into the app, with a level remap (skill-rebuild agent, 22:05 UTC)

The 7 owner-review draft changes (`curriculum-build/basketball/drafts/B03–B07.txt`, `piano/drafts/P04.txt`, `P05.txt`) are now in the app's levels. Owner-approved through the coordinator ("verified fixes go live").

**What changed for learners:**
- Basketball Grade 4 (Junior Club Player) gains lesson 347, "Log Fifty Shots Before Judging a Change" (bb_stats). The grade goes from 894 to 904 levels, and its path end from 895 to 905.
- Basketball Grade 5 (Youth Team Player) gains lesson 1060, "Judge Shooting by the Next-Day Cold Set" (bb_skills): 1213 to 1223 levels, path end 1214 to 1224.
- Piano Grade 5 (Elementary 2) gains lesson 278, "Shuffle Scales After One Correct Run" (piano_scales): 874 to 884 levels, path end 875 to 885.
- Piano Grade 4 (Elementary 1) now teaches "Minor Keys Sharing Major Signatures" (level 337) before "A and D Natural Minor Scales" (level 349). The grade keeps 754 levels.
- Wording fixes, with no levels moved:
  - B03's form-shot cue;
  - B06's semicircle: 1.25 m to the inner edge and 1.30 m to the outer edge of its 5 cm line;
  - B07's external-focus cue.
- In the four changed grades, the summaries, master quizzes and testers regroup around the new lessons. That is why later levels move:
  - basketball G4: 610 levels;
  - basketball G5: 327;
  - piano G4: 21;
  - piano G5: 599.

**Verified before going live:**
- **The build reproduces today's files exactly.** The old drafts (`before-owner-review\drafts\`) rebuild all 6 output CSVs, and from them `content/basketball-grades.js` and `content/piano-grades.js`, byte for byte. So the only diff is the intended one. Across all 34 grades, only basketball G3–G7 and piano G4–G5 differ.
- **`validate.js`:** 0 errors for basketball and for piano.
- **Test copy** (scratchpad `app-rebuild`; a copy of `data/db.json` with the remap applied; no `.env`, so keys are blank; `OPENROUTER_API_KEY` unset; `OLLAMA_ENABLED=0`; `ollama-provider-test` run without it):
  - full `npm test` chain: **55/55 pass**, including grade-skills-test, basketball-items-test, piano-items-test and skills-r3-piano-bb-test;
  - `skill-audit.js --checks=<copy>`: PASS. The guarantee holds with 0 violations. Piano 25 of 25 and basketball 19 of 19 provable metrics have a sitting. Knowledge objectives are piano 1444 and basketball 1187, exactly +1 and +2 for the new lessons. Problems: 0.
- **Click-through** on port 6821, with a scratchpad copy of `db.uitest.json` (remapped) and two seeded test learners:
  - the basketball G4 path reads "Level 347 of 905", and the new lesson 347 opens and teaches;
  - a level-346 session ran 12 of 12 and finished (the mastery gate kept the learner on 346, as designed);
  - piano G4 level 337 opens "Minor Keys Sharing Major Signatures";
  - piano G5 level 278 opens "Shuffle Scales After One Correct Run";
  - stored plan 108 ("Drive and Kick to the Open Spot", once level 696) serves at level 706, and level 696 (now "Half-Court Spacing Around the Arc") correctly reports no written lesson;
  - no console errors except the expected 404s, and no horizontal overflow at 278 px.
- **Live files match the copy:** the live rebuild gives the same files, byte for byte, as the tested copy.

**What is keyed by level number, and what was done about it:**
- **`data/db.json` holds 2 affected rows**, both exact (same lesson):
  - block plan 108: level 696 → 706;
  - fact pool 3: key `…:686` → `…:696`, start 686 → 696, end 740 → 750, lessons [686,696,706,719,729] → [696,706,716,729,739]. It is checked to be exactly one unit of the new layout, by the `services/fact-cascade.js` unitOf rule.
  - Nothing else in the live DB is in an affected grade:
    - no basketball or piano enrollments, progress, attempts, items, lessons or game_payloads;
    - no held games (`content/game-holds.json` has none);
    - no objective ids `grade:L<n>`;
    - no learner-record level strings.
  - Piano block plan 107 and fact pool 2 are in Grade 1, which is unchanged.
- **`data/parallel/*.db.json`** (the agents' 2026-10-21 working copies) need these exact remaps:
  - basketball: 15 rows, 22 fields. These are enrollment 5680 (current 697 → 707, target 895 → 905); 6 items, 1 level_signal (with its "Level 696" text), 2 level_debriefs and 2 level_logs (696 → 706); 2 learner_records (fact level strings and conclusions); and block plan 108.
  - piano and chess: block plan 108 only.
- **Checked and not keyed by level number:**
  - skill stage maps (`content/skill-stage-checks.js`, `services/skill-coverage.js`, `skill-progressions/*.json`) are keyed by stage and grade id;
  - `SKILL_STAGE_GATE_SHADOW` lists stage ids;
  - `config/grade-skills.js` is keyed by grade and lesson title;
  - coverage objectives are rebuilt from the content at start;
  - the objective-item files have no basketball or piano;
  - `content/unit-placement`, `content/base-levels` and `public/base-lesson-scripts` are English, math and Reading only;
  - the staged placement sets are per grade, not per level;
  - the night runner's jobs do not cover basketball or piano levels;
  - the tests hold no basketball or piano level numbers (only comments).
- **`site/assets/grade-levels.js`:** regenerated with the new path lengths (piano G5 885, basketball G4 905 and G5 1224).

**Live now** (backups and md5s in scratchpad `34e6f487…\before-skill-rebuild\`):
- `curriculum-build/basketball/outputs/*.csv` and `piano/outputs/*.csv` (rebuilt by `build.js`);
- `data/Basketball_Grades_Levels.csv`, `data/Basketball_Lesson_Tags.csv`, `data/Piano_Grades_Levels.csv` and `data/Piano_Lesson_Tags.csv`;
- `content/basketball-grades.js` (md5 `5f7e2ada…`) and `content/piano-grades.js` (md5 `d0c772ce…`), from `npm run build:basketball` and `npm run build:piano`;
- `site/assets/grade-levels.js`.

**Not written:** `data/db.json` (md5 still `cc525e73…`), `data/parallel/*` and `.env`. Nothing committed.

**The running app on 6767 still has the old layout in memory, which matches the DB as it stands.**
- **Do not restart it without applying the remap in the same stop.** A restart alone would load the new layout. Plan 108 would then show at level 696 (now another lesson), and pool 3 would sit under the wrong unit key.
- **To apply (coordinator):**
  1. Stop the app.
  2. Back up `data/db.json` and log its md5.
  3. Run `node curriculum-build/staged/content-fixes/skill-rebuild/remap-levels.js data/db.json curriculum-build/staged/content-fixes/skill-rebuild/remap-input.json <report.json> --write`.
  4. Log the md5 after, then restart.
- **Expected result:** 2 rows and 5 fields changed, all exact, with 0 approximate, 0 refused and 0 unknown. This matches `dry-run.db.report.json`, which was run on the live file (md5 `cc525e73…`).
- **Parallel copies (optional; nothing serves them):** run the same command on each `data/parallel/<subject>.db.json`. Their dry runs are `dry-run.<subject>.db.report.json`.
- **How the script works:**
  - It remaps whatever is in the DB at apply time. Rows the running app writes before the stop are covered too, since they use the old numbering.
  - It refuses to write unless the rebuilt content files are live, or if any level would map only approximately (a regrouped summary, quiz or tester). Approximate maps on stored content are always refused.
  - It stamps each changed row with `level_remap` (old and new values per field), so a second run changes nothing (tested).
  - It writes through a temp file and a rename, in the same JSON format as `config/db.js`. Only the remapped rows differ (tested on a copy).
  - `build-remap-input.js` rebuilds `remap-input.json` from the old content (scratchpad `skill-rebuild\oldtree`) and the new content.

**To roll back:**
- **Content:** copy `before-skill-rebuild\repo\{data,content,site}` over the repo and `before-skill-rebuild\curriculum-build\*\outputs` over `curriculum-build\<subject>\outputs`, then restart.
- **If the remap was applied:** restore the `data/db.json` backup taken before it, in the same stop. The content and the DB must go back together.
- **Drafts:** to undo the drafts themselves, see "Owner-review items" above.

## UI fixes: touch targets, placement grade subtitle, "Skip to here" (2026-10-25, ui-fix agent)

Only `public/css/style.css` changed. Static file: no restart, no flag. `public/js/path.js` was changed earlier today (every `.path` is bound); this run only verified it in a browser. `data/db.json`, `data/parallel` and `.env` untouched (db.json md5 still `9d9105c7...`). Nothing committed. Backups of `style.css`, `path.js` and `study.js` before this run: scratchpad `before-ui-fix\`.

1. **Study-strip touch targets (Pause, Resume, End, End session, End day session, Keep going, Start session, Calendar, Choose/Finish it).** They were 36 px (`.btn-sm`, and `.study-actions .btn-text { min-height: 36px }`). New rule at the end of the study block: at `max-width: 560px` or `pointer: coarse`, `.study-actions .btn` and `.btn-text` are `min-height: 44px` (text buttons also `min-width: 44px`). A desktop with a mouse keeps the compact 36 px strip (measured: 36 px, strip 49 px, same as before). Measured at 375 px: Start session 112x44, Calendar 66x44, Pause 44x44, Resume 54x44, End 51x44, End session 105x44, End day session 132x44, Keep going 71x44; the strip is 85.5 px tall while running; no horizontal overflow.
2. **Placement grade subtitle at 375 px.** Cause is CSS, not data: `@media (max-width: 480px)` hid `.player-head .player-sub` for every grade (Pre-K as well as Kindergarten), and the subtitle is the only place a placement page names the grade (the title is just "Mathematics placement"). The data is fine: Pre-K "Counting and Comparing, Pre-K, ages 4-5", K "Numbers to 20 and Teen Numbers, Kindergarten, second half". Fix: on phones `.player-sub` stays visible, wrapped to at most 2 lines (`#subtitle`, the lesson player's, is still hidden). Also found on the same page: the owner's extra "Skip placement" button made the chips row wider than the screen (398 px page width at 375, 0 overflow for a non-owner); `.player-chips` may now wrap at 480 px and below (`flex-wrap: wrap; min-width: 0`). Measured after: K subtitle 2 lines (35 px) and Pre-K 1 line, not clipped, page width 375 = viewport. At 1280 px nothing changed (the long K subtitle still ends in an ellipsis in its 286 px column; the full text is only on a phone).
3. **"Skip to here" verified in a browser** (test copy, port 6941): on piano_diploma (path with two `.path` blocks: the empty `.path.skill-stage` and `.path.path-units`), clicking "Skip to here" on level 6 jumped 5 to 6; on level 9 the confirm read "Skip to level 9? That marks levels 6-8 as done at 100%, passes every checkpoint in between, and cannot be undone." and the owner moved to level 9. A jump button retargeted to level 4 (the page only offers Skip to here ahead of the current level) showed "Go back to level 4? You will continue from level 4." and the owner went to level 4. Math (numbers_to_10): level 3 to 5 with "Skip to level 5?" confirm. No console errors.

**Rollback:** copy `before-ui-fix\style.css` over `public/css/style.css`.

## Fact re-verification fixes (fact re-check agent, 2026-10-25 02:11 UTC)

Details, sources and quotes: `FACT-REVERIFY-2026-10-25.md`. Nothing in `data/db.json`; no level moved.

| Change | Switch | What it does | Roll back |
|---|---|---|---|
| Piano technique note names | none (a bug fix inside `SKILL_RECORD`/`SKILL_STAGE_TESTS` and `SKILL_PIANO_BB_SITTINGS`) | Scale, arpeggio and five-finger parts show the scale's own spelling (D harmonic minor: Bb4 and C#5, not A#4; melodic minor down with its descending notes; chromatic sharps up, flats down). 59 of 102 items showed a wrong name before. `PC_OF` now reads ## and bb. Grading is unchanged: targets are MIDI. | Copy `services\skill-checks.js`, `services\skill-piano-bb-sittings.js`, `content\piano-sight-reading.js` and `scripts\skills-r3-piano-bb-test.js` back from scratchpad `before-fact-reverify\`. |
| Basketball B03 and B07 aim cue | none | "toward the back of the ring" / "such as the back of the ring, not your elbow" (Tran and Silverberg 2008: aiming at the center lowers makes by about 3%). | Copy `drafts\basketball\B03.txt`, `B07.txt`, `bb-outputs\*.csv`, `data\Basketball_*.csv` and `content\basketball-grades.js` back from `before-fact-reverify\`. |

**The app on 6767 needs a restart** to load both (server side and content).

## Grade fit against the standards (standards-check agent, 2026-10-25 night)

This is an independent check of "Grade-appropriate skills" above against CCSS Math, CCSS ELA (with the Reading Foundational Skills) and the CEFR Companion Volume. Each range's standard code and URL, every finding, and the before/after numbers are in `curriculum-build/GRADE-FIT-STANDARDS.md`.

- **Approval:** owner-approved through the coordinator ("verified fixes go live").
- **Not written:** `data/db.json` (md5 `9d9105c7c43f765dd9ac20b787766466` before and after), `data/parallel` and `.env`. No model was called. Nothing was committed.
- **Backups:** scratchpad `34e6f487…\before-grade-standards\`, every edited file at its own path, with `MD5SUMS.txt`. The `services\effort-monitor.js` backup was rebuilt by reversing this run's one edit, because it was edited before it was copied.
- **Restart needed:** the server on 6767 reads the curriculum and the bank once, at start. It was not restarted by this agent.
- **Other agents:**
  - After this run's test, another agent (the retention implementer) edited `services/enforcers.js` and `services/review-session.js`: the streak, the enforcer weights, and deferred and left-out units. This run's `fitEntry` lines in both files are intact, but their new code was not part of this test.
  - The curriculum-and-sessions implementer may edit `services/sessions.js` and `services/lessons.js` next.
  - Every other file here matched the tested copy when this was written.

| Change | Switch, and its default | What learners get | To undo |
|---|---|---|---|
| **Ranges** (`config/grade-skills.js` `FIT`) | `GRADE_SKILLS` = `on` | Changes by track:<ul><li>Math: slope starts at grade 8, not 7.</li><li>Math: calculus and linear algebra skip AP-level Statistics; `FIT` can now list two ranges.</li><li>Math: `act_data` starts at grade 6.</li><li>English: `word_choice` starts at grade 4 (L.4.1g) and `modifiers` at grades 7-8 (L.7.1c).</li><li>Spanish: the subjunctive starts at B1 (grade 15, was A1 7); the preterite at A2 (8); greetings and numbers stop at the end of A2 (14).</li></ul>One calculus rule word was added ("secant lines"). | `GRADE_SKILLS=off` (as before), or restore the file |
| **Ranges inside a grade** (`DIFFICULTY_RANGE`, extended) | same switch | Per-grade difficulty ranges, all on one decimal:<ul><li>`counting`, `shapes`, `facts_within_20`, `measurement`, `data_stats`, `probability` (grade 7), `calculus` (Precalculus) and `integers` (grade 7) are new;</li><li>`place_value`: grade 2 is 2–2.3 with no rounding, grade 3 is 2.4–2.7.</li></ul> | same |
| **School grade with each draw** (`schoolGrade`, `fitEntry`; plumbed through `services/sessions.js` (plans, block retention item, `generateWithPreference`), `services/lessons.js`, `services/review-session.js`, `routes/remediation.js`, `services/enforcers.js`, `routes/learn.js` (end-of-session retention) and `services/effort-monitor.js`, then `content/bank.js`, which passes `ctx.school`) | same switch: with it off, `schoolGrade` is null and nothing is passed | Math and English grades from preschool to grade 12 are served their grade's standard (next two rows). Reviews, drills, enforcer questions and retention items now also go through `capDifficulty`; before, they skipped it. The ACT, college grades and the other tracks get no school grade and are served exactly what they were. | Off, or restore the files |
| **Math school tiers** (`content/math-grade-items.js` `SCHOOL`; routed in `content/math-items.js`) | same | Tiers by grade from preschool to grade 8 for `add_sub`, `mul_div`, `fractions`, `decimals`, `geometry_area`, `exponents`, `integers`, `linear_eq`, `inequalities`, `percents`, `word_problems` and `order_ops`. Results stay non-negative until grade 7 (7.NS.1). | Off, or restore |
| **Grade-fit generator tiers** (`content/math-grade-items.js`) | same | <ul><li>`measurement`: four grade tiers and 6 new frames.</li><li>`facts_within_20`: Kindergarten gets no compare problems; 2 new Kindergarten frames.</li><li>`shapes`: Kindergarten shape names; halves and fourths before thirds.</li><li>`place_value`: no rounding in the grade-2 slice.</li><li>`calculus`: a limits-only tier below difficulty 5.</li></ul> | restore |
| **English and Reading by grade** (`content/english-grade-items.js` `SCHOOL_GRADES`; applied in `content/english-items.js` and `content/phonics-families.js`; filtered in `content/pool.js` `forSchool`) | same | Each of 293 entries in 14 pools carries the first US grade whose standard teaches it. A school grade is served only those entries; once it has seen them all it repeats one, instead of reaching a later grade's rule. New items:<ul><li>Phonics: 4 Kindergarten families and 1 grade-1 family.</li><li>Academic writing: 3 grade-4 items.</li></ul> | Off, or restore |
| **Checks** | none | <ul><li>`scripts/grade-skills-test.js`: new section "each school grade gets its own standard" (10 checks).</li><li>`scripts/math-reading-template-audit.js`: about 70 new verifiers, plus renders at tenth steps and at every school grade.</li><li>`REVIEWED_ENGLISH`: the 3 new items.</li><li>Phonics rules: the 5 new families.</li></ul> | restore |

**Verified:**
- **Where:** test copy `scratchpad/…/app-gfs`. It is a copy of the repo and of `data/db.json` (`9d9105c7…`), with no `.env`, every key unset, and `OLLAMA_ENABLED=0` except for `ollama-provider-test`.
- **Full `npm test` chain: 55/55 pass.**
- **Also pass with `GRADE_SKILLS=off`:** `self-test`, `objective-items-test`, `spanish-csv-test`, `coverage-test` and `act-curriculum-test`.
- **Template audit:** clean, at 603 families and 215,410 renderings.
- **`npm run check`:** no problems, 31,500 items across 126 skills.
- **`self-test`:** 3 of 3 runs pass after the final change.
- **`npm run sitting` median:** 21.5% (21.9% before).
- **Sampled before and after:** 102,400 items through the planner, covering 138 grades.
  - Math preschool to grade 8: 1,038 items were above the grade before, 0 after.
  - English and Reading grades 1-3: 267 before, 0 after.
  - Kindergarten phonics: 355 of 400 before, 0 after.
  - Spanish A1-A2 subjunctive: 120 before, 0 after.

**Already flaky before this run (not changed by it):**
- **`self-test` "a real sitting repeats less than 1 question in 4":**
  - Over 30 draws, the code from before this run averaged 29.7 repeats out of 132, with 10% of draws at or over the limit of 33. After this run: 29.4, with 5% over.
  - In 1 of the 4 earlier runs on the first build it failed at 34; 2 Kindergarten fact frames and 2 phonics families were then added.
- **`self-test` "its questions are not the worked example above them":** the English basics lesson fallback can repeat a prompt with a different answer. It fails about 3% of the time on both builds.

**To roll back:**
- **Switch only:** `GRADE_SKILLS=off` turns off this run and the earlier grade-fit work together. Then restart.
- **This run only:** copy back from `before-grade-standards\`:
  - `config/grade-skills.js`;
  - `content/bank.js`, `content/pool.js`, `content/math-items.js`, `content/math-grade-items.js`, `content/english-items.js`, `content/english-grade-items.js` and `content/phonics-families.js`;
  - `services/sessions.js`, `services/lessons.js`, `services/review-session.js`, `services/enforcers.js` and `services/effort-monitor.js`;
  - `routes/remediation.js` and `routes/learn.js`;
  - `scripts/grade-skills-test.js` and `scripts/math-reading-template-audit.js`.

  Delete `curriculum-build/GRADE-FIT-STANDARDS.md` if you want it gone. Then restart.
- **Before copying,** compare each file with its backup, since another agent may have edited it since. The `services/*` and `routes/*` edits are small: each passes `fitEntry` or `school`.
- **For `services/enforcers.js` and `services/review-session.js`,** undo the `fitEntry` lines by hand rather than copying the backups. Copying would drop the retention implementer's later work.

## Engagement and UX (implementer D, 2026-10-25)

Source: `evidence-article/05-engagement-ux-wellbeing.md` (M1, M4, M9, M13, M26, M29, M33; P1, P2, P3, P4, P5, P6 copy). Switches are in `config/ux.js` and reach the browser as `user.ux`. Backups: scratchpad `before-impl-D\`. Tests: `scripts/ux-engagement-test.js` (57 checks, in the `npm test` chain). **A restart is needed** (server files changed); the static pages load fresh. Nothing in `data/db.json` was touched. Nothing committed.

| Change | Flag (default on) | What it does | Owner account | Roll back |
|---|---|---|---|---|
| Streak on the learner's local day, one grace day a week (P2) | `STREAK_LOCAL_GRACE=off` | `services/streak.js`. Day = `retention_tz`, else the browser's zone (`client_tz`), else UTC. A missed day is forgiven once in 7 days; a longer gap restarts at 1; a lapsed run reads 0 in the header instead of a stale number. Call sites: `services/sessions.js` (finish) and `services/review-session.js` (finish). | Not applied (the old UTC rule runs, no grace). | Set the flag off, or copy `before-impl-D\services\{sessions,review-session}.js` back. New user fields: `client_tz`, `streak_grace_at`. |
| Break line in the study strip (P1) | `BREAK_NUDGE=off`; `BREAK_NUDGE_MIN` (5-180, default 25) | `public/js/study.js`. After the set minutes of active study without a pause, one quiet line: "About N minutes in a row. A short break helps you feel fresher." with "Pause for a break" and "Not now". Once per stretch, not announced, never blocks, no effect on the streak or XP. A pause resets the stretch. Learners turn it off on the profile page (`break_nudge_off`). | Not shown. | Flag off. |
| 44 px targets on every coarse pointer and on phones (P4) | `UX_TOUCH44=off` (sets `<html data-touch44="off">`) | `style.css` section 31: `.btn-sm`, `.chip-btn`, confidence chips, `.back-link`, `.btn-text`, `.icon-btn`, checkbox rows, brand link, subject title link. Desktop with a mouse keeps 36 px. | Applies (an accessibility fix). | Flag off, or copy `before-impl-D\public\css\style.css` back. |
| Hide streak and XP (P5) | `UX_HIDE_STATS=off` | Learner: profile page "Display and wellbeing" (`POST /api/prefs {hide_stats}`). Parent: "Streak and XP" box on the parent page (`POST /api/consent/parent/children/:id/settings {hide_stats}`); a child cannot undo the parent's choice. Hides the header pills, dashboard streak card and XP column, profile facts, outcome cards (rows labelled XP / Days in a row), Challenge Exam and help XP text. Still counted. The consent settings route now changes a setting only when the request names it (it used to reset the camera switch on any request). | Applies if the owner chooses it. | Flag off. |
| Learning-style copy (M9) | `UX_STYLE_COPY=off` | Dashboard card, placement page and quiz intro say the quiz sets pace and comfort and does not choose how you are taught, citing that matching teaching to a style does not raise scores. | Applies. | Flag off (old text returns). |
| Error toasts stay until dismissed (M33) | `UX_TOAST_STAY=off` | `App.toast` error toasts: `role="alert"` inside the polite live region, a 44 px Dismiss button, at most 3 at once, no duplicates. Info toasts still fade. | Applies. | Flag off (old 5.2 s fade). |
| "Report a problem" dialog (M26) | `UX_REPORT_DIALOG=off` | `App.askText`: native `<dialog>`, labelled field, Escape and backdrop cancel, focus returns, focus moves to Next after sending. Replaces `window.prompt` in `player.js`. | Applies. | Flag off (falls back to `window.prompt`). |
| "When will you study next?" planner (P3, in-app part) | `UX_NEXT_STUDY_PLANNER=off` | Dashboard card; saves a day (today to 60 days ahead) and time on the user row (`next_study`). **It sends nothing to anyone**: no email, push or message, at any age. "Add to my calendar" downloads a file the learner chooses to open, and is not offered on child accounts. | Not shown (route answers 404). | Flag off. |

**Deferred (not built):** the graded hint ladder / try-first step (P7) needs `routes/learn.js`, `services/ai.js` and `services/mastery.js`; and an emailed or texted reminder (the rest of P3) needs `utils/mailer`, `routes/consent.js` parent opt-ins and a lawyer's view on COPPA. The streak counting a qualifying study session or review (not only a finished adaptive session) needs `services/study-sessions.js`.

## Retention and review: P1, P3, P5 (implementer A, 2026-10-25)

From `curriculum-build/evidence-article/02-retention-review.md`. Each change is on by default, has its own off switch, and does not apply to the owner's base version: the owner's `score` takes the base path, and the owner's sitting keeps its retention set. Parameters: `retention-enforcer-params.json` is now v1.2.0. Docs: `RETENTION-ENFORCERS.md`, `RETENTION-ENFORCER-EVIDENCE.md` section 5. Nothing was written to `data/db.json`, and nothing was committed. Backups of every file before the first edit are in scratchpad `before-impl-A\`.

| Change | Switch | What it does | Owner | Roll back |
|---|---|---|---|---|
| P1: difficulty window to 0.95 (`services/retention-params.js` `window.hi` 0.95, `windowOf`, `difficultyWeight`; `services/enforcers.js` `score`) | `ENFORCER_DIFFICULTY_WINDOW_95` = `on` | d(p_now) = 1 from 0.50 to 0.95. The 0.65 step for 0.90-0.95 is gone (eglington2020: practice at 0.86 and 0.94 was equal-best). 0.6 below 0.50 and 0.3 above 0.95 are unchanged. | Unaffected (base path). | `ENFORCER_DIFFICULTY_WINDOW_95=off` brings back 1 up to 0.90 and 0.65 for 0.90-0.95 |
| P3: no end-of-sitting retention set while a study session runs (`routes/learn.js` finish route; `enforcers.deferSittingRetention`) | `ENFORCER_DEFER_SITTING_RETENTION` = `on` | With enforcers on and a study session open that holds the sitting's answers, the up-to-3 recall questions after "Finish session" are not created, and the recap has no "Retention check" card (`retention_deferred: true`). The set's skills that were missed in the sitting are kept on the study session (`retention_deferred`). The session or day enforcer gives them +0.20, but only when "last answer wrong" or "slow or unsure" did not already fire. The per-level recall question is unchanged. | Set still asked. | `ENFORCER_DEFER_SITTING_RETENTION=off` (or `RETENTION_ENFORCERS=off`) |
| P5: "left out last time" flag (`enforcers.leftOutCounts`, `plan` stores `left_out`) | `ENFORCER_LEFT_OUT_FLAG` = `on` | A topic that was eligible but not asked in the learner's latest enforcers in a row gets +0.10 × min(1, times / 2). | Unaffected (base path; no `left_out` stored). | `ENFORCER_LEFT_OUT_FLAG=off` |

**Full rollback:** copy `services\retention-params.js`, `services\enforcers.js`, `routes\learn.js`, `curriculum-build\retention-enforcer-params.json`, `RETENTION-ENFORCER-EVIDENCE.md`, and `RETENTION-ENFORCERS.md` back from scratchpad `before-impl-A\`. In `scripts\retention-enforcers-test.js`, delete the three "P1:", "P5:" and "P3:" sections and set the version check back to `1.1.0`. Do not copy `learn.js` back if another agent has edited it since; remove the `deferRetention` lines instead. Restart.

**Tests:** `scripts/retention-enforcers-test.js` has 17 new checks (116 in all, every one passing); `retention-schedule-test` passes 35 of 35; `owner-base-test` passes 63 of 63. **Browser check** on a test copy (port 6951, a seeded test learner): with a study session running, "Finish session" showed the recap with no Retention check card. The per-level recall still showed. Ending the study session gave a session enforcer whose topic was flagged as deferred, and its tier page and question ran. At 375 and 1280 px there was no overflow and no console errors.

**The app on 6767 needs a restart** to load these changes.

## Skill tracks: P1, P2, P3, P5, P7, P9, P12 (implementer E, 2026-10-25)

From `curriculum-build/evidence-article/04-skill-tracks-games.md`; each proposal there now has a status line. Each change is on by default, has its own off switch (set it to `off` and restart), and does not apply to the owner's base product (the owner has no practice plan; the puzzle target, quiet positions and two-day line are skipped for the owner; the stage gate already exempts the owner). Backups of every file before its first edit: scratchpad `before-impl-E\` (same relative paths). Nothing was written to `data/db.json`; nothing committed.

| Change | Switch | What it does | Roll back |
|---|---|---|---|
| P1: practice puzzles at a 0.75 expected score (`content/chess-trainer.js` `practiceTarget`) | `CHESS_PRACTICE_TARGET` = `on` (`off`, or a number 0.5-0.95) | A rated puzzle aims 400·log10(E/(1-E)) points below the learner (Elo expectation: 191 for 0.75, 70 for 0.6), not at the rating. Glicko-2 updates unchanged. While a stage check's rated-puzzle sitting (CH4/CH5 `tactics_rating`) is open, the target stays at the rating (measurement optimum). | `CHESS_PRACTICE_TARGET=off` |
| P2: bandwidth and on-request feedback on warm piano takes (`services/skill-dose.js` `feedbackFor`, `piano-core.outsideBar`, `public/js/skill-kit.js`) | `PIANO_FEEDBACK_FADE` = `on` | After 2 clean warm takes in a row on a metric, a take shows only what is outside the bar; "Show all the numbers" shows the rest. A miss brings full feedback back. Cold stage takes unchanged. New row field: `practice_streak`. | `PIANO_FEEDBACK_FADE=off` |
| P3a: tempo ladder on warm piano sets (`piano-core.tempoLadder`, `skill-dose.practiceParts`) | `PIANO_TEMPO_LADDER` = `on` | A warm part starts at 65% of its tempo, +10% after 2 clean takes, -10% after 2 misses (60-100%). Below the target tempo a clean set is not "at target", so warm sets only call a cold test at full speed (the 5-day forced check still runs). Not applied to beat taps, cadences or pedal parts. Cold takes stay at the target tempo. New row field: `tempo_ladder`. | `PIANO_TEMPO_LADDER=off` |
| P3b: hotspot loop (`piano-core.barErrors/hotspot/sliceBars`, `skill-dose.hotspotPart`) | `PIANO_HOTSPOT_LOOP` = `on` | A warm library piece that misses: its worst 1-2 bars become the next set, by note name, at 65% of the target tempo; the set after rejoins the piece. A loop set never counts as at target. New row field: `hotspot_part`. | `PIANO_HOTSPOT_LOOP=off` |
| P5: scene-set reliability gates the BB stages (`services/skill-scene-reliability.js` new; `services/skill-gate.js`; `skill-checks.finish` keeps `detail.marks` on scene sittings) | `SCENE_RELIABILITY_GATE` = `on` | Odd/even split-half of each learner's first scene sitting, Spearman-Brown corrected; a stage with scene sets leaves shadow only when every set is >= 0.8 on 100+ learners. BB1-BB3 leave the hand list (`COMPUTED_SHADOW`); BB4-5/BB6-7 stay listed for [R] zone marks. **Today BB1-BB7 all stay in shadow** (no data). `gate.left` reports `scene_reliability`. Report: `node services/skill-scene-reliability.js`. | `SCENE_RELIABILITY_GATE=off` (the hand list `HAND_SHADOW` returns) |
| P7: youth weekly load caps and rest days, basketball (`services/skill-dose.js` `loadFor`, `trimToLoad`, `loadBlock`, `logLoad`; `skill-checks.count`; `public/js/skill-practice.js` notice) | `SKILL_LOAD_CAPS` = `on` | Age from the age screen's `birth_ym`: 3/5/10/14 h a week and 2/2/1/1 rest days (7-8 and younger / 9-11 / 12-14 / high school); adults and unknown ages uncapped. Rolling 7 UTC days. Court work over the limit is cut from the plan (spare sets, then practice to one set each, then sittings); a rest day has no court work; court sets and court counts are refused on a rest day or once the week is used. Screen sets (scenes, rules, safety) are not load. Logged minutes kept on the enrollment (`skill_load`, 14 days). Hook for others: `require('./skill-dose').logLoad(userId, 'basketball', minutes)` (court sessions in `services/sessions.js` are not counted yet). | `SKILL_LOAD_CAPS=off` |
| P9: the two-day rule as a delayed test (`content/skill-learner-text.js` `TWO_DAY_RULE`; `skill-gate.left`, `skill-checks.overview`; `public/js/stage-check.js`, `public/js/stage-left.js`; `SKILL-CURRICULA.md` §1.2) | `SKILL_TWO_DAY_TEXT` = `on` | One added sentence on the stage pages: a later test, not a promise of getting better overnight. No existing skill text promised a sleep gain; a guard test now fails if one appears. | `SKILL_TWO_DAY_TEXT=off` |
| P12: "nothing to find" positions in CH2/CH3 tactics (`content/chess-quiet-pool.js` new, built by `scripts/chess-quiet-pool-build.js` with Stockfish 19; `skill-checks.buildChessTactics`/`gradeItem`; `content/skill-stage-checks.js` `nothing_share`; `public/js/skill-kit.js` "Nothing wins" button) | `CHESS_NOTHING_TO_FIND` = `on` | CH2: 5 of 30, CH3: 6 of 30 are quiet positions (a real pool position's pieces on random squares; Stockfish 1M nodes found no mate and nothing ending > 80 cp above material). Every position offers "Nothing wins", right only on a quiet one; a 5-item practice set has 1. | `CHESS_NOTHING_TO_FIND=off` |

**Files changed:** `content/chess-trainer.js`, `content/skill-stage-checks.js`, `content/skill-learner-text.js`, `services/skill-dose.js`, `services/skill-gate.js`, `services/skill-checks.js`, `public/engine/piano/piano-core.js`, `public/js/skill-kit.js`, `public/js/skill-practice.js`, `public/js/stage-check.js`, `public/js/stage-left.js` (the skill-track pages' own JS), `curriculum-build/SKILL-CURRICULA.md`, tests `scripts/chess-trainer-test.js`, `skills-r3-dose-test.js`, `skills-r3-gate-test.js`, `skills-r3-piano-bb-test.js`, `skills-r3-checks-test.js`, `piano-items-test.js`. **New:** `services/skill-scene-reliability.js`, `scripts/chess-quiet-pool-build.js`, `content/chess-quiet-pool.js`.

**Full rollback:** copy each changed file back from scratchpad `before-impl-E\` (re-check first that no other agent has edited it since), delete the three new files, restart. `skill_records` rows may keep the new fields `practice_streak`, `tempo_ladder`, `hotspot_part` and sittings' `detail.marks`, and enrollments `skill_load`; all are ignored by the old code.

**Not built:** P4 (needs media), P6 (needs data), P8 (needs data; also `services/personalize.js`), P10 (needs media and data), P11 (exercise content not among the verified sources; schema in `services/block-levels.js`). Reasons in the section file.

**Tests:** new checks in `chess-trainer-test` (8), `piano-items-test` (13), `skills-r3-piano-bb-test` (22), `skills-r3-dose-test` (11), `skills-r3-gate-test` (5) and `skills-r3-checks-test` (8). The skill audit (`curriculum-build/staged/adaptation/skills/skill-audit.js`) passes, and so do `consent-test` and `owner-base-test`. Full `npm test` chain on a DB copy with keys blanked and `OLLAMA_ENABLED=0`: every script passes. `ollama-provider-test` was run without `OLLAMA_ENABLED=0`, as it requires. One run had a self-test failure in an English drill check, which passed alone and on the rerun. **Browser check** on a test copy (port 6955, seeded test learner aged 13): the puzzle trainer served and graded rated puzzles; a warm piano set showed "at 75% speed", bandwidth feedback with "Show all the numbers", and the next set was the hotspot loop (bars 5-6 at 65 of 100 bpm); the basketball plan on a rest day showed the rest-day notice with only screen sets; the stage-check page showed the two-day line and a cold piano sitting at full tempo; the CH3 tactics sitting showed "Nothing wins". At 375 and 1280 px: no overflow, no console errors.

**The app on 6767 needs a restart** to load these changes.

## Scorecard and adaptation: P1-P8, P10 (implementer C, 2026-10-25)

From `curriculum-build/evidence-article/03-scorecard-adaptation.md`; every proposal there has 3 or more verified sources.
- **Defaults and owner:** each change is on by default and has its own off switch (set it, then restart). None of them reaches the owner's base version: the owner gets no plan, an empty contract and `effective()` = fallback, and P8 returns the fixed line for the owner.
- **Backups:** `scratchpad\34e6f487...\before-impl-C\`, every file at its own path.
- **New files:** `services/scorecard/reliability.js`, `scripts/scorecard-evidence-test.js`.

| Change | Switch (default) | What it does | Roll back |
|---|---|---|---|
| P1: no typed-answer switch for rushers (`contract.js` KNOBS / `knobsNow()`, `adaptation.js` DIRECTIVE_KNOBS) | `SCORECARD_DROP_RUSH_TYPED` = `on` | A confident `rush_tendency` high no longer sets `prefer_type_in`. The effort monitor still handles rushers. | `=off` restores `rush_tendency: { high: { typed: true } }` |
| P2: softer challenge high side (`contract.js`, `adaptation.js` stretch clamp, `learner.js` sessionParams clamp, `stats.js` text) | `SCORECARD_SOFT_STRETCH` = `on` | challenge_appetite high adds +0.05 stretch (was +0.1). The stretch share is capped at 0.25 (was 0.35). The directive is "Teach the core at the usual level, then end with one optional harder 'try this' case". | `=off`: +0.1, 0.35 and the old text |
| P3: lengthen only for a new objective (`adaptation.js` decide) | `SCORECARD_LENGTHEN_NEW_ONLY` = `on` | brevity_preference low makes the teaching fuller only when the objective is taught with worked examples (new to the learner, or lapsed). The shorter side is unchanged. | `=off` |
| P4: observed behaviour replaces the stated preference; scorecard term gated (`learner.js` effective) | `SCORECARD_OBSERVED_PREFS` = `on` (also `shadow`, `off`) | Observed weight is capped at 1.0 (was 0.75), so after 7 analysed sessions the quiz answer has no weight. The scorecard reading is blended in only when the insertion contract's calibrated gate passes that stat (it was at confidence >= 30, ungated). `shadow` keeps the old rule and records what would change (`learner.observedPrefsShadow()`, plus one log line per learner and dimension). Shadow on a live-DB copy changed 2 of 107 profiles, stretch 0.125 to 0.1; the recovery sim gives the same numbers as before. | `=shadow` or `=off` |
| P5: hint_dependency text (`stats.js` TEXT_V2) | `SCORECARD_WORKED_HINT_TEXT` = `on` | "Open with one fully worked example of exactly this step, then ask the learner to try the next step themselves before any hint." | `=off`: old text |
| P6: self_efficacy text (`stats.js` TEXT_V2) | `SCORECARD_SUBGOAL_TEXT` = `on` | Adds "Split the task into short sub-goals, and after the first one say specifically what they did right and that it shows they can do this kind of step." | `=off`: old text |
| P7: the split-half check (`services/scorecard/reliability.js` `splitHalf`) | none (a check, not a behaviour) | It splits by day at random 500 times, applies Spearman-Brown, and passes when the corrected point is >= 0.6 and the lower 95% bound is >= 0.5. The report's section 11 says the same. Running it on real learners needs data. | delete the file |
| P8: item-relative rapid line (`effort-monitor.js` `rapidLine`/`itemLine`; `adaptation.sittingRule`; `coverage.js` line 444 and one line in `answersFor`) | `RAPID_ITEM_RELATIVE` = `on`; `OBJ_RAPID_REL` 0.10, `OBJ_RAPID_MIN_N` 30, `OBJ_RAPID_CACHE_MS` 600000 | Once an item (`bank.itemKey`) has 30 or more timed answers across learners, an answer under max(1.2 s, 0.10 x the item's median) is rapid in coverage. It is also set aside on checkpoints and the Final (at most 2 reserves, as before). A set-aside answer is read as rapid whatever its time, never as wrong. The median map is built once per 10 minutes. `slowDown` uses the item line only when the caller passes `item` (`routes/learn.js` does not yet, so the note keeps 1.2 s). | `=off`: the fixed 1.2 s everywhere |
| P10: the leak guard catches the key's place (`ai.js` `choiceLeak`, in `leakGuard` and the streamed `wouldLeak`) | `COACH_LEAK_CHOICE` = `on` | Before the learner names it, a coach reply that names the key's own choice number, letter or ordinal ("(2)", "option 2", "choice B", "the second one", "the last option") is replaced with the redirect. Other options, "3(2)" and "answer a question" are not caught. The streamed coach holds back 20 characters on multiple choice. | `=off` |
| Coordination fix for implementer B (`adaptation.js` reviewQueue) | none | Once retention is believed (R >= RETAIN_AT), a proven objective is not listed for a memory check before RETAIN_SPAN_DAYS after proof. | restore `adaptation.js` |
| Report fixes (`SCORECARD-EVIDENCE-REPORT.md`) | none | Section 7: the Haldane-Anscombe logit with the Gart-Zweifel variance, and the 0.98 basis in posterior false discovery. Sections 6.6, 6.7 and 6.10 get the new sources. Sections 6.2, 6.3 and 6.4 match the new texts. Section 11 now specifies the split-half check. Section 13 lists the new sources. | the backup copy |

**Not built:**
- **P9 (needs data):** no repo simulation measures how well the models follow 3, 6, 9 or 12 directives, so COACH_MAX stays 8.
- **P11:** implementer B's.

**Tests:**
- `scripts/scorecard-evidence-test.js` (new, in `npm test`): 60 checks, each switch on and off. They cover P8's set-aside answer never counted wrong, the median map built once, a cost bound on review today(), and the reviewQueue gate.
- `scorecard-contract-test`: the stretch clamp is read from `contract.stretchMax()`, plus 2 new checks.

**Performance:** P8's first version read 18 environment variables and did a `require` per answer. review today() took about 11.7 s and round3-consolidation-test failed. It is fixed: today() takes 1.3-2.1 s, against 1.2-1.9 s before tonight.

**Rollback:**
- **One change:** set its switch to `off`, then restart.
- **Everything:** copy the files in `before-impl-C\` back, then delete the 2 new files and the `scorecard-evidence-test` step in `package.json`.
- **Caution:** `coverage.js` and `package.json` are shared with other implementers, so remove only these hunks there. In `coverage.js` that is line 444's `Math.max(..., answer.rapidMs)` and the `rapidMs:` line in `answersFor`.

## Curriculum, sessions and checkpoints: P10, P1, P3, P4, P5, P6, P11 (implementer B, 2026-10-25)

Source: `evidence-article/01-curriculum-levels-placement.md` (P1, P3, P5, P6, P10), `02-retention-review.md` (P4) and `03-scorecard-adaptation.md` (P11). Every proposal has 3 or more sources, all in the section's sources JSON. Every switch below defaults to on. The owner keeps the base product (`config/owner.js` ownerBase) except under P10, which is a safety rule like the other verified-content rules.

| Change | Switch and default | What learners get | To turn it off |
|---|---|---|---|
| P10: no unverified AI level without the verifier key (`block-levels.js` `selfCheckOn`/`servable`/`selfCheck`/`verifiedByKey`, `key-gate.js` `blindResolve`, `block-checkpoints.js`, `lessons.js` `aiLessonsAllowed`) | `LEVEL_SELF_CHECK` = `on` | Applies only when `FACT_CHECK_ANTHROPIC_KEY` is not set. With the key, the full gate applies as before. A block level is served only once it has passed a self-check: a claim-by-claim read on the app's own route, with repairs, and a blind re-solve of every multiple-choice check by a judge from another model family (NVIDIA first; never xKiro or UnoRouter). A check the judge answers differently is dropped. If no judge answers, the level is not served. Levels verified earlier under the key (Claude) are still served. Anything else goes to the ordinary session with the bank lesson. A tailored checkpoint keeps only the questions the blind judge confirms, and the bank fills the rest. Model-written ordinary lessons (`lessons.js`) are not served without the key: the bank lesson is served instead. On a copy of the live DB with no key: 28 ready base plans with no verification are now held, and 3 Sonnet-verified plans are served. | `LEVEL_SELF_CHECK=off` |
| P1: interleaved practice body (`sessions.js` `planLesson`, `interleaveMode`, `spreadBySkill`) | `INTERLEAVE_SESSIONS` = `on` | Review still comes first. The first practice level after a lesson stays blocked. From the second, the body is spread evenly across skills. From the third, one focus item in two is on an earlier topic (was one in three, and only for a weak skill). Spanish, Reading and English Reading are unchanged. Sitting repeats at levels 13 and 44 went from 22.0% to 20.6% and from 19.8% to 19.3% (10 runs each). | `INTERLEAVE_SESSIONS=off` |
| P3: checkpoints by likelihood ratio (`config/curriculum.js` `passDecision`, `PASS_DECISION`; `sessions.js` `resolveCheckpoint`) | `CHECKPOINT_SPRT` = `on` | At full length: Master 12/15 and Grand 19/25 as before; the Final 34/40 (was 36/40). A true-90% learner now passes the Final 90% of the time (was 63%); a 70% learner 2.4%, a 75% learner 9.6%. An exam ended early, or with questions skipped, passes only on decisive evidence: 3 of 3 no longer passes a Master. The recap's "needed" is the decision's own share (80% for a Master, 85% for the Final). | `CHECKPOINT_SPRT=off` |
| P3: the Challenge Exam by likelihood ratio (`curriculum.js` `skipVerdicts`, `skipExamBands`; `sessions.js` create/score; `mastery.js` skipOffer; `public*/js/skip.js`; the offer text in `public*/js/path.js` and `public*/js/session.js`) | `CHALLENGE_SPRT` = `on` | A gate band of 16 holds at 14 right; bands of 6 above it allow one miss; 40 questions (was 35). Simulated: P(skips anything) is 0.79 at 90% (was 0.48) and 0.10 at 70% (was 0.08); P(all five bands) is 0.49 at 90% (was 0.03). The rule is stored on the exam (`pass_rule`), so an exam already open is scored the old way. The pages show "N of M needed" and "held". Also fixed: the exam header overflowed at 375 px. | `CHALLENGE_SPRT=off` |
| P4 (retention section): lesson reviews from the forgetting curve (`sessions.js` `curveReviews`, `materialize`) | `CURVE_REVIEWS` = `on` | Where the grade has an objective model, planLesson's 30% review share comes from `adaptation.reviewQueue` (memory checks, fading, least durable), mapped to introduced skills, at most two per skill. Each review is tagged with its objective (`objective_id`, `review_reason`), and the question is written for that objective when one is left. With no model, the SM-2 ladder decides, as before. About 1 ms per plan on the live data. | `CURVE_REVIEWS=off` |
| P5: "retained" needs a real delay (`coverage.js` knobs) | `RETAIN_REAL_DELAY` = `on` | An objective counts as retained only on a correct unaided check at least 7 days after its proof (`RETAIN_SPAN_DAYS` 7, was 1). Memory checks still start a day after the proof. Implementer C gated reviewQueue so that, once retention is believed, a proven objective is not re-listed before day 7. The coverage gate never holds the owner. | `RETAIN_REAL_DELAY=off` (or set `RETAIN_SPAN_DAYS`) |
| P6: placement gaps and strengths on a belief (`placement.js` `score`, `seedSkillStates`) | `PLACEMENT_SKILL_BELIEF` = `on` | Gaps, strengths and a new "unsure" list come from unitBelief's Bayes update. A strength needs P(known) >= 0.9 (3 right and no miss on 4 options); a gap needs P(known) <= 0.15 (2 misses). One miss is no longer a gap, and two rights are no longer a strength. An unsure skill comes back the next day. `routes/placement.js` does not show "unsure" yet. | `PLACEMENT_SKILL_BELIEF=off` |
| P11 (scorecard section): 3-option objective items (`objective-items.js` `problems`) | `OBJ_ITEMS_3_OPTIONS` = `on` | Objective items may have 3 or 4 options. Coverage already guesses 1/n from the real option count. The files hold only 4-option items today, so nothing changes until a build writes 3-option ones. | `OBJ_ITEMS_3_OPTIONS=off` |

**Not built:**
- **P2 (faded worked examples, self-explanation):** it needs the lesson schema and prompt in `services/ai.js` and the lesson render in `public*/js/session.js`. Those files are outside implementer B's set, and the change would alter the lesson format.
- **P7 (correctives first):** the core is UI: the "Help me learn" default door and a re-shown worked example in `public*/js/session.js`. No server-only version gives the learner anything.
- **P8 (3-option practice items):** the gate is `ai.validateItem` in `services/ai.js`, outside implementer B's files. P11 covers objective items.
- **P5, second half:** moving part of the end-of-session recall to the next session. It overlaps implementer A's retention P3 (the end-of-sitting set) and is left to that work.
- **P4 (difficulty from live responses) and P9 (closing the loop on challenge):** these need real-learner data.
- **P3, extending a near-mark checkpoint by a few questions:** this needs the client to accept extra questions mid-quiz (`routes/learn.js` and `public*/js/session.js`). The decision is in place, so a later extension can use `passDecision`'s `decided: 'at_length'` band.

**Hook for implementer E:** when a basketball sitting finishes, `sessions.finish` logs its minutes, start to finish and at most 120, through `skill-dose.logLoad`, so it counts toward `SKILL_LOAD_CAPS`. Previews and placements are not logged. A test is in `curriculum-evidence-test.js`. To roll back, remove that block from `finish`.

**Follow-up for whoever owns `routes/learn.js`:** the Final's start banner still says "pass mark 90%" (`curriculum.PASS_MARKS`), while the decision needs 34/40 (85%). The recap already says 85%. `curriculum.neededToPass(kind, n) / n` gives the figure to show.

**Tests:**
- `scripts/curriculum-evidence-test.js` (new, in `npm test`): P1, P3, P4 and P6, with each switch on and off and the owner case.
- `block-levels-test.js`: a P10 section (10 checks) plus a checkpoint self-check. Its older sections now set `LEVEL_SELF_CHECK=off` explicitly.
- `key-gate-test.js`: blindResolve.
- `coverage-test.js`: the 7-day rule.
- `objective-items-test.js`: 3 options.
- `self-test.js`: the Challenge section pins the off state (`CHALLENGE_SPRT=off`). The "a real sitting repeats" check pools three sittings per grade. One draw put it at 21-22%, against a 25% bound, with about one run in ten failing; this happened with every new switch off as well (measured 15-30 runs each way). Five runs after the change all pass.
- `round3-review-test.js` and `round3-held-test.js`: their 1-day memory-check fixtures run with `RETAIN_REAL_DELAY=off`.

**Rollback:**
- **One change:** set its switch to `off`, then restart.
- **Everything:** copy the files in `scratchpad\before-impl-B\` back, keeping the same paths. Then delete `scripts/curriculum-evidence-test.js` and its step in `package.json`. The `public*` path.js and session.js copies there are rebuilt from the edit; only the Challenge offer paragraph differs.
- **Caution:** `coverage.js`, `sessions.js`, `self-test.js` and `package.json` are shared. Remove only these hunks:
  - `coverage.js`: the `RETAIN_SPAN_DAYS` line.
  - `sessions.js`: `ownerBaseOf`; planLesson with `interleaveMode`, `spreadBySkill` and `curveReviews`; the objective lines in `materialize`; `rule` and `pass_rule` in the Challenge create and score; the decision block in `resolveCheckpoint`.
  - `self-test.js`: the `CHALLENGE_SPRT` lines and the three-draw loop.
- A restart is needed to load all of this.

## Click-through bug fixes (bug-fix agent, 2026-10-25 ~05:00 UTC)

The six bugs and two minor ones from the 04:10 combined click-through (AWAY log). No new switches: each fix sits inside the feature it repairs, so that feature's existing off switch still turns it off. The owner's base version is unchanged (the base path is untouched or covered by the same fix). Backups of every file before its first edit: scratchpad `before-bugfix\` (same relative paths, md5s in `backup.md5`). `data/db.json`, `data/parallel` and `.env` were not touched. Nothing committed. **The app on 6767 needs a restart** for the server-side fixes (1, 2, 3, 5, 6); the page scripts and CSS are served fresh.

| # | Bug | Fix | Files |
|---|---|---|---|
| 1 | `INTERLEAVE_SESSIONS` did nothing on the 2nd and 3rd practice levels after a lesson: the "earlier topic" was `weak[0]`, and a brand-new focus topic (mastery 0) is itself the weakest skill | With interleaving on, the alternate is always an introduced skill other than the focus: the weakest of those first, then the earliest introduced, in turn. One focus item in three from the 2nd practice level, one in two from the 3rd (P1). The off state and the owner keep the old rule exactly. | `services/sessions.js` (`planLesson`) |
| 2 | Enforcer tier cards promised more than they served (Medium "6" served 3, Quick "3" served 2); a 6-minute, 1-answer session offered "1 question" on every tier, then failed with "No questions could be found"; the error toast stayed after "No enforcer" | A waiting enforcer drafts every tier's real questions once (`draftAll`, `draftsOf`; a topic's question is drawn once and shared by the tiers) and keeps the draft on its row; the card's count, topics and minutes are the draft's, and `plan` serves exactly that draft, then drops it. A draft older than 6 h is made again when the card is shown (never at the choice). With no tier left, the enforcer closes as `empty` (`no_questions`, or `too_short`) with a calm line instead of offering tiers. On a half-done enforcer a tier's count is capped by the questions already planned. "No enforcer" / "Stop here" clear any error toast. | `services/enforcers.js`, `public/js/enforcer.js`, `public/js/study.js` (the end-of-session line for `no_questions`) |
| 3 | A piano take at 68 of 104 bpm said "At the bar"; the set summary then said "That set was below the bar" | The server says both lines: a take below the target tempo is "Clean at 68 bpm (target 104)."; the set is "Clean at 68 bpm, a practice tempo (target 104). It counts as at the target once it is clean at 104." plus what the next set does ("stays at 68 bpm; one more clean set steps it up", "steps up to 78 bpm", "is at the full 104 bpm"). A slow hotspot loop: "Clean on the slow loop (bars 5-6), at 65 bpm" / "The next set rejoins the whole piece." `at_target` is unchanged (still false below tempo). | `services/skill-dose.js` (`takeVerdict`, `setSummary`; the ladder lives here, not in `skill-piano-bb-sittings.js`), `public/js/skill-kit.js`, `public/js/skill-practice.js` |
| 4 | "Stop here" said "The time for this tier ran out…" | A stopped enforcer says "You stopped here; the rest is kept for next time." The time-ran-out line is only for a finished one whose budget dropped questions. | `public/js/enforcer.js` |
| 5 | Held Final: the path said "opens by November 14" (browser zone), the session page and API "November 15" (UTC); the dashboard offered "Take the Graduation exam" | One source: `consolidation.opensBy` gives `opens_on`, `opens_label` and `opens_tz` in the learner's day zone (retention_tz, else the browser's, else UTC, as the streak reads it). The path, the 409 message and the dashboard all show that label. The dashboard's held Final shows "Today's review" (or "Today's review is done" and View path) with the day count and the opens-by date, as the path does. | `services/consolidation.js`, `public/js/path.js`, `public/js/dashboard.js` |
| 6 | The basketball stage-check "Log it" form opened on a rest day; the refusal came only as a toast after "Record it" | `skill-checks.overview` marks each court count refused today (`court_block`, from `skill-dose.loadBlock`) and returns the note (`load`); a blocked count is not "ready now". The page shows the rest-day notice above the checks, as the practice page does, and the court counts get a disabled "Log it" marked "Rest day" (or "Week used up"); no form opens. Screen checks (scenes, rules) are unaffected. | `services/skill-checks.js`, `public/js/stage-check.js` |
| minor | The owner's base-lesson page with AI off: "back to dashboard" was 20 px tall at 375 | Its two links get `notice-link`: 44 px on coarse pointers and phones (`style.css` section 31, under `UX_TOUCH44`); a desktop mouse keeps the inline link. | `public/js/base-lesson.js`, `public/css/style.css` |
| minor | "How you learn best" phrasing implying learning-style matching | Profile scorecard: "One hundred measures of how you've been doing…"; tailored-level lines (profile, base lesson, block level): "from how you've been doing and what you have said…"; the dashboard's style-quiz card heading "How you learn" is now "Your preferences". The AI prompt heading "HOW THEY LEARN BEST (measured from their behavior by the learning scorecard)" in `services/personalize.js` / `scorecard/contract.js` is not learner-facing and was left. | `public/js/profile.js`, `base-lesson.js`, `block-level.js`, `dashboard.js` |

**Tests:**
- `curriculum-evidence-test`: 7 new P1 checks on a lesson that brings in a new topic after earlier ones (2nd level one in three, 3rd level one in two, weakest earlier skill first, never the focus, fallback to the earliest introduced). Against the old `sessions.js` two of them fail (the 3rd level got 3 of 8 instead of 4, and with nothing earlier weak it got 0 of 8). The old P1 check passed only because its grade had a single introduced skill. `self-test` run 5 times: "a real sitting repeats less than 1 question in 4" passed every time.
- `retention-enforcers-test`: 25 new checks (141 in all): card count and minutes equal what is served on every tier, optimized and owner base, on a window where the old estimate promised about three times what fits; the draft is dropped once served; no question to be found closes as empty (`no_questions`), shows no tiers and leaves nothing waiting; a stale draft re-made at the card closes the same way. All 19 new card checks fail on the old `enforcers.js`. Also fixed a time-of-day flake in its "study sessions" fixture (a paused session ends at the learner's midnight; it failed between about 04:20 and 05:00 UTC, also on the old code): the fixture now pins a zone where it runs mid-morning.
- `skills-r3-piano-bb-test`: 10 new checks (take and summary agree at a practice tempo, the next-set line, the slow loop, and the copy table).
- `round3-consolidation-test`: 3 new checks (one label in the stretch and the 409 message; the learner's zone: 02:00 UTC on November 15 is November 14 in New York).
- `skills-r3-dose-test`: 3 new checks (the stage-check overview knows the rest day before any form, blocked counts are not ready, no cap means nothing blocked).
- Replay of the click-through's own enforcers (scratchpad `combined-click\db.json`, enforcers 1, 2, 5, 6) before and after: `scratchpad\bugfix\enf-repro-before.txt` (e.g. enforcer 6 Quick card 5 served 2, Medium card 7 served 4; enforcer 5 card 1 then "No questions could be found") and `enf-repro-after.txt` (every card equals what is served).
- Full `npm test` chain on a DB copy, keys blanked, `OLLAMA_ENABLED=0` (ollama-provider-test without it): **58/58 pass** on the final code (`scratchpad\bugfix\chain-result-2.txt`). The first run was 57/58: the `retention-enforcers-test` midnight flake above, fixed and re-run.
- Browser re-check on a test copy (scratchpad `bugfix\db.json`, copied from `data/db.json`, port 6973, keys blanked, Ollama off, `OWNER_EMAIL` set to a test owner; seeded by `bugfix\seed.js`), at 375 and 1280: (2) a 61-minute session's card Quick 6 / Medium 8 / Full 8, Medium served "1 / 8"; a 30-minute one Full 2 served "1 / 2"; a 6-minute one offered only what it holds (Quick not offered, Medium 1, Full 1); a too-short one closed calmly; an error toast cleared by "No enforcer"; (4) "Stop here" after one answer: "You stopped here; the rest is kept for next time."; (5) path, 409 message and dashboard all "opens by November 14" (browser and learner zone America/Chicago; `ends_at` 04:33 UTC on November 15), dashboard lead "Today's review is done" with the day count, no "Take the Graduation exam"; (3) a clean PI2 take at 60 of 92 bpm: "Clean at 60 bpm (target 92)", set summary "Clean at 60 bpm, a practice tempo (target 92)…" and "The next set stays at 60 bpm; one more clean set steps it up." (the take's notes were supplied by a page-side shim on the take request, since the pane cannot play in time); (6) a 10-year-old's BB0 stage check on a rest day: the notice above the checks, lay-ups and dribbling "Rest day" with a disabled "Log it", the two screen checks still "Sit it"; owner base lesson with AI off: both links 44 px at 375 (touch), inline 20 px at 1280 with a mouse; profile copy. No horizontal overflow; console errors only the expected 409/404 responses.

**Rollback:** copy the files in scratchpad `before-bugfix\` back (no new files, no data migration). Enforcer rows may keep a `drafts` field while waiting; the old code ignores it.

## Write-ahead: lessons never keep a learner waiting (write-ahead agent, 2026-10-25 ~14:30 UTC)

**Why.** The owner opened a lesson and waited about a minute: the level was written live, on NVIDIA, and then checked by Sonnet. `prefetchAhead` only ran when a level was opened, and it counted path positions. Up to 7 practice levels lie between two written levels, so the next lesson was usually still cold. Almost nothing is pre-built (33 block plans).

**The owner's decision, as built.** Switch: `WRITE_AHEAD` = `on` (default). Knobs: `WRITE_AHEAD_LEVELS` = 3 and `WRITE_AHEAD_SONNET` = 1.

| | What it does |
|---|---|
| Which levels | The level the learner stands on, plus the next **3 written levels** (lesson and retention) ahead of it. Practice levels are the ordinary session, served at once from the bank, so they are not counted; the scan reads up to 40 path levels on (`WRITE_AHEAD_SCAN`). On a gap-only path, the levels the path skips are skipped here too (`levelsAhead`). Tailored checkpoints before the third level get the existing `block-checkpoints.prefetch`. Essays keep their own prefetch. |
| 1 ahead | Written with the **Sonnet check**, in advance: research, then a Sonnet read of every claim, as before. |
| 2 and 3 ahead | Written with the **free check**: the claim read on the app's own route and the blind re-solve (`key-gate.blindResolve`), the `LEVEL_SELF_CHECK` path, run even though the key is set. Nothing goes to the key. The plan is marked `check_tier: 'free'`. |
| Moving forward | When a free-checked level becomes the next level, it is **upgraded**: its Sonnet check runs in the background (`blockLevels.upgrade`, which is `verifyStored` on the key). It is not rewritten. A Sonnet check that cannot finish (the key fails, or the ledger stops) changes nothing, and the level stays on its free check. |
| Opened early | A level opened before its Sonnet check is done is **served as soon as its free check has passed**, and Sonnet runs on open (`forLevel`). A level that is opened cold, or that the learner stands on, is written on the free check first and then Sonnet-checked straight after. Nothing unchecked is ever served: under the key, `servable` means Sonnet-checked, or a free check that passed while `WRITE_AHEAD` is on. |
| The ledger | Past the $24 stop, or with less than $0.50 of room left (`WRITE_AHEAD_SONNET_RESERVE_USD`), the next level gets the free check too. Upgrades wait until there is room. |
| Who gets what | Tailored learners get their own levels. That now includes every tester, through `TESTER_TAILORING`. The owner, and everyone on the base product, gets the shared base levels (`user_id` null), which every base user reuses. Nothing personalised is written for the owner. Accounts that may not generate (`mayGenerate`) get nothing written, and nothing is written while no model is ready (`aiReady`). A child's consent is applied inside `services/ai.js` on every call. There is no bulk pre-building. |
| Triggers | All fire-and-forget, never awaited: the dashboard (`/api/progress`, the 2 most recent enrollments, `WRITE_AHEAD_ENROLLMENTS`); the path page (`/api/path/:id`); finishing a level or block (`block-finish` on both routes, `finish`, `game-finish`, session `finish`); skip-level, jump-to (both ways), skip-grade, `owner/go`, placement skip and placement finish (the target level is first in the queue); and starting a session or opening a level (the existing `prefetchAhead` calls, which now hand over to the write-ahead). |
| Limits | Work is queued best first: the level the learner stands on before anything ahead. Queued work is de-duplicated by the level's plan key, the same key as `block-levels`' in-flight map. A write, a re-check and an upgrade of one level share one in-flight slot, so a request and a write-ahead never write a level twice; `lessons.js` and `essays.js` keep their own maps. There are at most 2 jobs per account (`WRITE_AHEAD_PER_USER`) and 4 in all (`WRITE_AHEAD_GLOBAL`). When a learner jumps, queued work that is no longer ahead of them is dropped. The provider order is unchanged (NVIDIA first; OpenRouter only on its $0 lane). |
| Retries | A level whose write failed is tried again on a later trigger, after 10 minutes and then with a growing pause (`WRITE_AHEAD_RETRY_MS`). |

**Files:**
- `services/write-ahead.js` (new).
- `services/block-levels.js`: the check tiers (an AsyncLocalStorage tier around the write: `freeTier`, `keyReady`, `tierFor`, `onTier`, `sonnetAffordable`, `sonnetChecked`, `sonnetPending`, `upgrade`, `planKey`); `servable`; `ensure` and `forLevel` with tiers; `prefetchAhead` hands over to the write-ahead; `check_tier` and `sonnet_check` on plans.
- `routes/learn.js`, `routes/profile.js`, `routes/placement.js`, `routes/base-lessons.js`: the triggers.
- `scripts/write-ahead-test.js` (new, in `npm test`).

### Bug fixes that came with it (math numbers_to_20 level 10, the owner)

- **A lesson level never shows only its questions.** The ordinary session's lesson was served as an unstored bank fallback (`id: null`) while the model-written one was still being written. The sitting kept no `lesson_id`, so reopening it showed the checks alone; that was session 5887. Now:
  - The fallback is stored (`lessons.storedFallback`).
  - A sitting that lost its lesson gets it back on resume (`lessons.forSitting`; `sessions.js` resume and `resumedLesson`; the resume path in `routes/learn.js`). It is the stored lesson where it may be served (the owner never gets one written with their profile), or else the bank's lesson with its worked example.
  - A lesson or retention level whose block plan is not ready and not being written now goes to the standard session (lesson first, then the checks), instead of a 404.
  - While a plan is still being written, the page goes there by itself after 60 seconds (`public/js/block-level.js`, `base-lesson.js`).
  - The standard-session link keeps the level that was opened (`&level=`).
- **A "writing" plan never stays stuck.**
  - A write or re-check that has not ended after `BLOCK_WRITE_TIMEOUT_MS` (25 minutes; one NVIDIA call can take four 5-minute tries) is released. Its row is marked failed, the next visit or write-ahead writes it again, and a late finish of the old write is ignored (`write_token`).
  - A row left at `writing` by a stopped server is not in flight, so it is simply written again on read. Row 109 recovered this way on a test copy, with no edit to `data/db.json`.
- **Failed levels are retried** by the write-ahead (above).

**Tests:**
- `scripts/write-ahead-test.js`: 65 checks, mocked models, keys blanked, `OLLAMA_ENABLED=0`. It covers:
  - a jump queues the target and the next 3 written levels, target first;
  - the tiers (1 ahead Sonnet with research; 2 and 3 free, with no Sonnet call);
  - opened early, the level is served at once and Sonnet runs on open;
  - moving forward upgrades the new next level without rewriting it;
  - nothing unchecked is served;
  - the owner gets base levels only (tester-phase on and off);
  - the ledger stop;
  - consent and readiness;
  - no duplicate writes (3 triggers and 2 requests on one level: written once), and at most 2 jobs per account;
  - retries;
  - the stuck row, the time-out, and a late finish being ignored;
  - a lesson sitting's lesson stored and restored on resume (including the owner case);
  - the route wiring;
  - `WRITE_AHEAD=off` restores `prefetchAhead`'s old reach, with the key's full check on every write.
- Full `npm test` chain on a DB copy, keys blanked, `OLLAMA_ENABLED=0` (ollama-provider-test without it): **60/60 pass**. The result is in scratchpad `write-ahead\chain-result.txt`. The browser timing check is in the AWAY log.

**Rollback:**
- **The write-ahead:** set `WRITE_AHEAD=off` and restart. `prefetchAhead` and the gate then work as before. Plans already written on the free check are held for Sonnet (verified on the next visit, as any held plan).
- **Everything:**
  - Copy the files in scratchpad `before-write-ahead\` back (`backed-up.txt`, md5s in `backup.md5`). `public/js/base-lesson.js` and `block-level.js` there were rebuilt by reversing this run's edits. The rebuilt `block-level.js` matches `public-v2` on the edited lines.
  - Delete `services/write-ahead.js` and `scripts/write-ahead-test.js`, and the `write-ahead-test` step in `package.json`.
  - Plans may keep `check_tier`, `sonnet_check` and `write_token` fields; the old code ignores them. No data migration.
- **Caution:** these files are shared with other agents, so restore only these hunks: `routes/base-lessons.js` (another agent's bank-games hunk landed during this run), `package.json`, `services/sessions.js` and `routes/learn.js`.
- **A restart of the app on 6767 is needed.**

## Bank-fed learning games (games agent, 2026-10-25)

Learning games now reach math, reading, English, Spanish, IQ, ACT and the knowledge rows of piano, basketball and chess. Before this, only English Proficient had games.

- **Where they go:** at the spots the evidence picks; the rules and their 42 sources are in `curriculum-build/GAMES-PLACEMENT.md` and `curriculum-build/games-placement-sources.json`.
- **Where the questions come from:** they are computed from the verified question bank (`content/bank.js` and the kept objective items).
  - No model writes them, nothing is stored, and the same set is computed for every account, the owner included.
  - A level's set is seeded, so it is the same set in every process.
  - A set takes milliseconds to compute.
- **Not touched:** `data/db.json`, `data/parallel` and `.env`. Nothing was committed.
- **Backups** of every file before its first edit: scratchpad `before-games\` (same relative paths).

| What | Switch | What learners get | To turn it off |
|---|---|---|---|
| Bank-fed games | `BANK_GAMES` = `on` (new) | **Where:** each lesson's 4th and 6th practice levels (the 5th stands in when one of those rows is a timed, spoken, written or drawn task), and Spanish `Game` and `Review Game` rows. **The game:** a turn-based engine that waits for every answer. **The questions:** the bank's own items, held to the grade's difficulty and largest number. **Never a game:** lessons, the guided activities 1-3, testers, retention levels, checkpoints, graduate grades, and skill rows played on a board, keyboard or court. **Unchanged:** English Proficient keeps its 73 authored games, and `GAME_HOLDS` still applies. **Scoring:** each answer is an item and a mastery attempt on the question's own skill when the gate measures it (otherwise credited in turn, as before), and the finish goes through `tryLevelUp`. | `BANK_GAMES=off`, then restart: `resolve()` is the old engine cycle exactly |

**Files:**
- **New:**
  - `services/game-bank.js`: the placement rules, the question builder, the engine pools and the contract check `validate()`.
  - `scripts/bank-games-test.js`: added to `npm test` after `game-holds-test`.
  - `curriculum-build/GAMES-PLACEMENT.md` and `curriculum-build/games-placement-sources.json`.
- **Edited:**
  - `config/game-assignments.js`: `authoredGrade()`. `resolve()` asks `services/game-bank.js` after the grade and subject rules, and before the cycle.
  - `services/game-payloads.js`: a bank branch in `ensure`, `sharedReady`, `accessFor` and `stored`.
  - `routes/base-lessons.js` (`game-answer`): the question's own skill is used when the gate measures it.
  - `content/bank.js`: a `stable` option on `generate`.
  - `content/pool.js`: `stably()`, and `withShapes` honouring it. Without them the first 12 draws of a shape-rotating skill in a process could differ.
  - `scripts/spanish-csv-test.js`: the registry-mapping check runs with `BANK_GAMES=off`, and a new check that a bank game sits only on a Spanish game row.
  - `package.json`.
- **Not edited:** `services/block-levels.js`, `services/lessons.js`, the sessions write-ahead and `config/subscriptions.js`. No hook was needed there.

**Known limit (Spanish):** Spanish practice rows practise their row's skill, but the level gate measures `levelPlan().introduced`, which can leave that skill out. For example, level 5 practises `es_vocab_core` while its gate measures `es_greetings`. A game answer on such a skill is still credited in turn to a measured skill, as before.

**Rollback:**
1. Set `BANK_GAMES=off` and restart; that is enough.
2. To remove the code too:
   - Restore the 7 files from scratchpad `before-games\`. Other agents may have edited `routes/base-lessons.js`, `services/game-payloads.js` and `package.json` since, so prefer reversing only the hunks named above.
   - Delete the 4 new files.

**Tests:** see the AWAY log entry for this change.
