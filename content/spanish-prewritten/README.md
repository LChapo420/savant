# Pre-written Spanish lessons

The 53 lesson slots of the first three Spanish grades (`entry`, `intermediate`,
`advanced` in `content/spanish-grades.js`), written and fact-checked by hand so a
learner is never left waiting on (or failed by) on-demand AI lesson writing.

| Grade | Name | Lesson slots |
|---|---|---|
| `entry` | Grade 1: Sounds and Survival Words | 3, 4, 16, 26, 31, 42, 52, 65, 80, 81, 84 |
| `intermediate` | Grade 2: First Phrases and Greetings | 27, 81, 85, 86, 97, 111, 112, 121, 122 |
| `advanced` | Grade 3: Identity, Numbers, and Family | 3, 4, 7, 15, 16, 19, 20, 27, 28, 31, 54, 65, 66, 69, 70, 80, 81, 84, 85, 92, 93, 96, 97, 104, 105, 108, 109, 119, 120, 131, 134, 162, 163 |

A slot is every level `services/block-levels.js` `kindFor` calls a `lesson` in
these grades (none of them has a retention slot; the Final Test is a checkpoint
and is written by `services/block-checkpoints.js`).

## Files

- `<grade>/level-NNN.json`: one lesson each, in exactly the shape block-levels
  stores for a finished lesson (a `block_plans` row; see below).
- `index.json`: every lesson with its file and content hash.
- `CHECKS.md`: how each lesson was checked and what was fixed.
- `blind-resolve.json`: the blind re-solve of every multiple-choice question.
- `src/`: the authoring source. Edit there, then rebuild:
  `node scripts/build-spanish-prewritten.js`, and check:
  `node scripts/check-spanish-prewritten.js`.

## Where a lesson lives in the app

A written lesson is a row of the `block_plans` collection in the data file
(`config/db.js`), keyed by `user_id`, `track_id`, `grade_id`, `level` and
`attempt` (1). `user_id: null` is the shared base version, served to the owner
and to every learner who is not tailored; a tailored learner is served their own
row first. `blockLevels.findPlan` returns a row only when its `status` is
`ready` and `servable()` passes, which needs a passed check record:
`verification.status: 'verified'` with a `check_tier` other than `free` under the
owner's key, or `self_check.status: 'passed'` without it. These rows carry both
(`check_tier: 'prewritten'`), so they are served at once in either setup and are
never queued for a re-check or a rewrite. The page gets the blocks and the
checks without their answers (`publicPlan`); answers are graded on the server
(`answerCheck`, `services/grading.js`).

The stored row: `user_id, track_id, grade_id, level, attempt, kind: 'lesson',
status: 'ready', arm, experiment, approach, coverage, layout_fallback,
blocks: [{ block, purpose, data, repaired, index }], checks: [{ skill_id,
skill_name, difficulty, format, prompt, answer, accepts?, rationale, hint,
choices?, source, id: 'cN', after, focus }], dropped, dropped_checks,
verification, self_check, check_tier, fact_sheet, model, layout_model, usage,
seconds, brief_hash, finished_at`, plus `prewritten: { id, version, sha256,
title, file }`, which the importer uses to recognize its own rows.

## Importing

Stop the server first (it holds the data file in memory), then:

```
node scripts/import-spanish-prewritten.js --data data/db.json --dry-run
node scripts/import-spanish-prewritten.js --data data/db.json
node scripts/import-spanish-prewritten.js --data data/db.json --for-user <account id>
```

The data file is copied to `<file>.backup-prewritten-<time>` before anything is
written. Running it again changes nothing. `--for-user` also stores the lessons
as that learner's own rows, which a tailored learner (every non-owner account
while `TESTER_TAILORING` is on) needs in order to be served them at once.
`scripts/spanish-prewritten-import-test.js` runs the whole thing end to end on a
throwaway data file made by the app.
