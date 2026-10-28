# Owner base vs optimized (2026-10-24)

The owner's rule: "the user the.landon.d@gmail.com gets the base everything, nothing modified, and all other users actually get everything perfectly optimally modified like how the app should." The coordinator added: the owner's account must be able to skip anything (placement quizzes, questions, whole grades, and any level of any grade), from the UI, with no gate blocking it, and no other learner may do any of it.

- **What "base" means here:** the standard curriculum and lessons, unmodified. There is no scorecard-driven tailoring, no adaptive teaching change, no per-user block or lesson tailoring, no adaptive pacing or dosing, and no personal coach brief.
- **What stays on for everyone:** safety and integrity rules, and verified content. Both accounts get the same versions.
- **Data collection** (scorecard, learner record, debriefs, skill record) keeps running for the owner. It only records, and nothing reads it back for the owner while the rule is on. So `OWNER_BASE=off` has a full record to work from at once.

**Owner check.** There is one owner check, `isOwner` in the new `config/owner.js`. `OWNER_EMAIL` overrides the address, and `services/block-levels.js` re-exports it as `blockLevels.isOwner`. It moved into a module with no dependencies so that the config files block-levels itself requires can use it without a require cycle. `ownerBase(userOrId)` is the rule: it is true for the owner unless `OWNER_BASE=off`, or the older `ADAPT_OWNER=1`, kept as an alias.

These copies of the address now use the helper, so no hard-coded copy is left outside `config/owner.js` (the test checks this):

- `config/base-lessons.js`
- `config/capabilities.js` (`canSkip`, `canBrowse`, `SKIP_EMAILS`)
- `config/subscriptions.js` (`canEditLevels`)
- `middleware/auth.js` (the `ADMIN_EMAILS` default)
- `services/block-levels.js`
- the three `ADAPT_OWNER` copies in `adaptation.js` and `learner-path.js`, and the copy in `coverage.js`

## Inventory

Line numbers are for the tree after this change.

### Personalization: base for the owner, on for every other learner

| # | Feature | Where | Owner | Other learners | Was it a gap? |
|---|---|---|---|---|---|
| 1 | Session settings from the style quiz, observed behaviour and scorecard dimensions (`effective`) | `services/learner.js:239` | Neutral values (fallback 0.5 on every dimension) | Stated, observed and scorecard blend | **Gap, fixed.** The owner's style vector and scorecard were sizing their sessions. |
| 2 | Scorecard structure on sessions: items, support, stretch, typed (`sessionParams` → `contract.forSession`) | `services/learner.js:293` | Off | On, through the contract's calibrated gate | **Gap, fixed** |
| 3 | Scorecard insertion contract (`contract.read`), feeding adaptation sides, sessions and lesson writers | `services/scorecard/contract.js:187` | Returns what a brand-new learner gets (`status: 'empty'`, `owner_base: true`) | Read from the card | **Gap, fixed.** This is the one place every contract consumer is covered. |
| 4 | Coach, tutor, help-chat, remediation-tutor and legacy lesson-writer brief (`teachingBrief`) | `services/learner.js:377` | Standard brief: neutral how-to-teach lines, plus "teach a typical learner", plus context. No style, scorecard, record, interests, mastery or observed traits. | Full personal brief | **Gap, fixed** |
| 5 | Lesson-writer style notes (`lessonStyleNotes` via `effective`) | `services/ai.js:479` | Neutral | Personal | **Gap, fixed** (by #1) |
| 6 | Scorecard prompt block (`personalize.scorecardSection`, `/api/scorecard/prompt-block`) | `services/personalize.js:65` | Empty | Lines from the card | **Gap, fixed** |
| 7 | Legacy per-learner lessons (`services/lessons.js`) | `lessons.js:40` `fitFor`, `store` | Written with the standard brief and marked `base_written`. The 10 lessons written for the owner in September carry their profile, so they are written again (or replaced by the bank lesson) instead of being served. | Personal brief | **Gap, fixed** |
| 8 | Adaptive teaching on lesson and practice levels (`planForLevel`: guidance, length, items, review mix) | `services/adaptation.js:658`, applied at `sessions.js:538` | None | On (`ADAPTIVE_TEACHING=on`) | Already gated; now uses the helper |
| 9 | Adaptive lines in the legacy lesson writer | `services/lessons.js:233` `adaptLines`, `ai.js:579` | None | **New for learners:** the contract's lesson lines plus `adaptation.promptLines` | **Learner gap, fixed.** Only block levels and the level editor got them, and those only on tailoring plans. |
| 10 | Path skips a proven objective's practice (`compressProven`) | `services/learner-path.js:590` | Walks the sheet | On | Already gated; now uses the helper |
| 11 | Daily review (`dailyReview`, `/review`, the path row) | `adaptation.js:724`, `review-session.js:80` | None (the row is null; start returns 409) | On | Already gated |
| 12 | Consolidation before the Final | `consolidation.js:66`, `routes/learn.js:239` | Never held. The route also refuses to hold any account that `canSkip` allows. | On | Gated; the route check was added |
| 13 | Remediation lists from the record (after a missed Final) | `adaptation.js:813` | Off. The base remediation stays: areas from the missed questions, drills, the tutor. | On | Already gated |
| 14 | Slow-down note from the learner's own rushing record | `effort-monitor.js:127`, `adaptation.js:896` | Off | On | Already gated; now explicit |
| 15 | Block levels, games, checkpoints and essays written per learner | `block-levels.js:115` `tailorsFor`; `game-payloads.js:430`; `sessions.js:208,450`; `essays.js:330` | Shared base versions, even though the owner's profile says `pro`. `BLOCK_TAILOR_OWNER=1` is an explicit opt-in. | Pro and school tiers: their own. Standard tier: the shared base, by the tier design. | Already gated |
| 16 | Level editor (per-user rewritten pages) | `config/subscriptions.js:49`, `level-editor.js:251` | Never | Pro and school tiers | Already gated; now uses the helper |
| 17 | Personalization experiments and holdout arms (`armFor`) | `block-levels.js` `write`, `game-payloads.js` `writeTailored` | Never reached (owner is not tailored) | Tailored learners | Already gated |
| 18 | Skill practice dose ("Today's practice", `/skill-practice`) | `skill-dose.js:48` `onFor`, `:94`; `routes/skill-dose.js:26` | No row; the page returns 404. Stage checks then open at the Final, as standard. | On | **Gap, fixed** |

### Gates: they never hold the owner

| # | Feature | Where | Owner | Other learners | Was it a gap? |
|---|---|---|---|---|---|
| 19 | Coverage gate at graduation (`COVERAGE_GATE=enforce`) | `coverage.js:700` `exempt`, `:734` | Never held. What the gate would say is still recorded. | Held until every objective is proven and kept | Already exempt; now uses the helper |
| 20 | Skill stage gate (PI0, PI1, BB0, CH0, CH1 on) | `skill-gate.js:65`, `:157`, `:186` | Never held; recorded as shadow; no gate row on the path | Held | **Gap, fixed.** It mirrors the coverage gate. |

### Kept on for everyone: safety, integrity, assessment and content

| # | Feature | Where | Owner | Other learners | Why it stays on |
|---|---|---|---|---|---|
| 21 | Answer-key gate, labelled mistakes, game-prompt key rules | `key-gate.js` `on` | On | On | Integrity: a wrong key is wrong for anyone |
| 22 | Game holds, verified game swaps, lesson rewrites and key fixes in the DB | `game-payloads.js:67` | On | On | Verified content fixes |
| 23 | Grade difficulty bands | `config/curriculum.js:744` | On | On | Part of the standard curriculum: what a grade covers |
| 24 | Objective items (in review and remediation, and the coverage "written for this objective" rule) | `objective-items.js:36` | On (as content) | On | Content. The owner gets no review, so they only reach the owner as content. |
| 25 | Security: sandboxed lesson frame, grading-injection check, CSP, body tracking, dev tools | `middleware/security.js`, `typed-grading.js`, `routes/base-lessons.js` | On | On | Security |
| 26 | Too fast to count, on checkpoints | `effort-monitor.js:106` | **Exempt** (the coordinator's skip rule: no gate blocks the owner) | On | An integrity rule for learners. For the owner's test account it is a block, so the owner is exempt. |
| 27 | Placement (subject and in-grade CAT), unit plan and test-outs from placement | `learner-path.js:248`, `routes/placement.js` | On (or skipped; see the skips table) | On | Product decision: placement is base (PRODUCT-DECISIONS, "Placement"). Layout tailoring is separate. |
| 28 | Core practice mix (due reviews and weakest-skill support items in a block) | `sessions.js:130` `planLesson`, `mastery.js:144` | On | On | The standard practice engine every tier has had from the start. It is not the scorecard or adaptation. Flagged below. |
| 29 | Recording: scorecard hooks, learner record, debriefs, session analysis, skill record | `scorecard/hooks`, `learner-record.js:787`, `ai.js:1161`, `skill-record.js` | Records | Records | Data, not modification |
| 30 | Stage checks (skill sittings) | `skill-checks.js` | On | On | Assessment |
| 31 | Remediation (base: areas from misses), Challenge Exam, free skips | `remediation.js`, `routes/learn.js` | On | On | The standard product |

### The owner's skips

Every route below uses `requireSkip`, which is `canSkip`, which is `isOwner`. Every other account gets 403.

| Skip | Server | UI (drawn only for the owner) |
|---|---|---|
| A placement quiz | `POST /api/placement/skip` (`routes/placement.js:64`) cancels the open quiz and stands on level 1. Uses `services/owner-skips.js`. | **Skip placement** button in the placement player's top bar (`public/js/placement.js`). Subject placement gets a "Skip: pick any grade and level" link to the curriculum browser (`subject-placement.js`). |
| A question | `POST /api/items/:id/skip` (existing, `routes/learn.js:1075`) | **Skip question** in a sitting (existing, `session.js:831`) |
| A level | `POST /api/enrollments/:id/skip-level` (existing) | **Skip this level** on the path (existing) |
| Jump to a level, ahead or behind | `POST /api/enrollments/:id/jump-to`. Back-jumps are new: only the position moves. | **Owner: Go to level [n] Go** on the path hero (`path.js`), plus the existing **Skip to here** rows |
| A whole grade | `POST /api/enrollments/:id/skip-grade` (new, `routes/learn.js:1162`). The grade graduates without the Final or any gate, and the next grade opens at level 1 with no placement. | **Skip this grade** on the path hero |
| Any level of any grade | `POST /api/owner/go {track_id, grade_id, level}` (new, `:1170`). Joins the grade if needed, skips placement, reopens a graduated grade, clears holds and remediation, and moves ahead or back. | **Go here** on every level row and **Start here, no placement** on every grade card of `/curriculum` (a page only the owner can open, `can_browse`). There is also an **Any grade** link from the path. |

## Changes (files)

- **New files:**
  - `config/owner.js`, the helper and the rule.
  - `services/owner-skips.js`
  - `scripts/owner-base-test.js` (63 checks; in `npm test`, and also as `npm run test:owner-base`)
  - this document
- **Edited files:**
  - `config/base-lessons.js`, `config/capabilities.js`, `config/subscriptions.js`, `middleware/auth.js` (owner check consolidated)
  - `services/block-levels.js` (re-exports the helper)
  - `services/adaptation.js`, `services/learner-path.js`, `services/coverage.js` (use the helper)
  - `services/learner.js` (#1, #2, #4)
  - `services/scorecard/contract.js` (#3)
  - `services/personalize.js` (#6)
  - `services/lessons.js` and `services/ai.js` (#7, #9)
  - `services/skill-dose.js` and `routes/skill-dose.js` (#18)
  - `services/skill-gate.js` (#20)
  - `services/effort-monitor.js` (#14, #26)
  - `routes/learn.js` (consolidation check, back-jump, skip-grade, owner/go)
  - `routes/placement.js` (skip)
  - `public/js/path.js`, `placement.js`, `subject-placement.js`, `curriculum.js` (owner controls)
  - `package.json` (test)
- **Backups:** `C:\Users\admin\AppData\Local\Temp\claude\C--coding-claudecommittdIq-folderThing\34e6f487-b3f5-4acd-899c-244171ef0427\scratchpad\before-owner-base\`. Every edited file is there at its own path. `backup.log` has each file's md5 at copy time, and `new-files.txt` lists the new files.

## Switches and rollback

- **`OWNER_BASE=off`:** the owner becomes an ordinary learner, with personalization, adaptation, review and dose. This also lifts the older adaptation exemption. `ADAPT_OWNER=1` does the same.
  - The skips stay: they are capabilities, not personalization.
  - The two graduation gates (coverage and skill) and the too-fast rule still never hold the owner's account, because its skips leave no proof.
- **`BLOCK_TAILOR_OWNER=1`:** the owner's block levels are tailored again. Unchanged.
- **`OWNER_EMAIL=<address>`:** moves every owner check, including skip, browse, admin default, base pages and the rule.
- **To roll back the code:** copy the files in `before-owner-base\` back to their paths, then delete the four new files. Other agents edited `routes/learn.js`, `package.json` and `services/sessions.js` tonight. `sessions.js` is untouched by this change. For those shared files, diff against the backup and reverse only this change's hunks.

## Learner-side notes and owner decisions

- **Learner gap closed (#9):** standard-tier learners' legacy lessons now get the adaptive "how to teach this level" lines and the scorecard lesson lines. This only adds text to a prompt that already carried the learner's brief.
- **Not changed, flagged for the owner:**
  - Standard-tier (free) learners read the shared base block levels and games, not ones written for them. This is the tier design (per-learner writing costs money per learner) and is not a gate bug. If beta testers should get pro tailoring, set their profile tier to `pro`, or decide a tester default.
  - Placement-driven unit skipping and the core practice mix (#27, #28) are treated as base product.
- **Data:** `data/db.json` and `.env` were not touched. Every test ran on copies.
