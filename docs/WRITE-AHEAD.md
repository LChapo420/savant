# Write-ahead: instant by default (owner, 3 Nov 2026)

Rule: nothing a learner waits on is slow unless it has to be written when they arrive. Write about twice what makes
it instant, no further. Code: `services/write-ahead.js` (header comment has the detail), `services/pool.js`,
`services/material-autobuild.js`, `services/sessions.js`, `services/block-checkpoints.js`. Test: `scripts/instant-test.js`.

## What is written ahead
- Levels (lesson and retention): the level stood on plus the horizon (`aheadFor`: 2x the learner's pace x write time, 3 to 10).
- Checkpoints (Master, Grand Master, Final) inside the horizon: a tailored learner's own quiz, and for base-product
  accounts the level's shared first-attempt quiz (`block-checkpoints.prefetchShared`).
- Starting a checkpoint never waits on writing (`CHECKPOINT_START_WAIT_MS`, 1 s at most): ready questions, then the bank;
  replacements are written in the background for the next attempt (before: 20 s wait on a retry).
- The first level after a placement or skip is FAST: jumps the queue, ignores the global and per-learner caps, runs as a
  waiting-learner call. `WRITE_AHEAD_FAST=off` undoes it.
- Uploads (paste, link, YouTube, transcript, file) start their notes and study pack (summary, flashcards, quiz, practice
  test) on upload, one build at a time per learner (build-gate), at most `UPLOAD_AUTOBUILD_PER_DAY` (6) materials a day,
  only for accounts allowed an outside model call. The learning path (course) builds only when opened or asked.
  `UPLOAD_AUTOBUILD=off` turns it off (`npm test` sets it).

## A waiting learner comes first (pool)
- Calls are foreground (default) or background (write-ahead, autobuild, retry prefetch; `pool.runBackground`).
- Each free slot keeps `POOL_FOREGROUND_RESERVE` (1) permit that background calls cannot take.
- A foreground call with free slots busy or slow goes to the cheapest capable Munito model after
  `POOL_FOREGROUND_HEDGE_MS` (8 s). Background never hedges to a paid slot for speed (paid is its last resort after every
  free slot failed). A background write a learner then opens is promoted in place.
- Munito is allowed for `level_editor`, `material_notes`, `material_pack`, `material_outline`, `material_verify`
  (config/model-lineup.json), beside the block tasks that already allowed it. The tutor's routing is unchanged: its tasks
  (`dock_help`...) have no Munito allowance; adding one is an owner decision.

## Not wasteful
- A passive trigger (`trigger({passive: true})`, for sweeps) writes nothing for a learner with no activity for 7 days
  (`WRITE_AHEAD_DORMANT_DAYS`); a request-driven trigger is the learner returning. No passive caller exists yet.
- At most `WRITE_AHEAD_DAILY_CAP` (40) background level or checkpoint writes per learner per day (in memory: a restart
  resets it). The fast first level and waiting-learner work do not count.

## Proof
`WALK_SERIAL=1 node scripts/learner-walk.js <url>` (one learner at a time) and without it (7 at once) print a
time-to-content table; `WALK_OUT=file.json` saves it. Numbers are in the commit message and the build report.
