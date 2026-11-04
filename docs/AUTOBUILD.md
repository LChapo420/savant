# Autobuild: a builder with no Claude calls

`scripts/autobuild.js` builds the tasks in `docs/night/AUTO-QUEUE.md` with aider on cheap or free models and an independent reviewer. It never calls Claude, never pushes, never merges.

## The queue
Only the owner or the orchestrating Claude session writes tasks (id, goal quoted from the owner, acceptance criteria, files in scope, test command). The builder may change one thing: each task's `Status:` line (`open`, `claimed <date>`, `done <commit>`, `blocked <reason>`). After every write it checks that the file with Status values blanked is byte-identical to before, and refuses otherwise. It cannot touch PRODUCT-DECISIONS.md, RULES.md, the queue's task text, `.env`, `data/`, the sealed Spanish files, `run-tests.js` or itself (scope gate).

## One task
1. Claim it (Status), make worktree `auto-<id>` on branch `auto/<id>` from `main` (node_modules junction, copy of `data/db.json`).
2. Aider with the listed files only. Attempt 1 free MiniMax M3.1 Flash on xKiro (only until 2026-11-07), attempt 2 Munito DeepSeek V4.1 Flash (ledgered), attempt 3 free NVIDIA Nemotron. A Coral model slots in at `writers()` when a provider exists (none yet).
3. Gates, all must pass, else the failure is fed into the next attempt (3 max, then `blocked`):
   1. the task's test, then the full `npm test`;
   2. scope: only listed files plus new `scripts/*-test.js`; sealed files refused even if listed;
   3. no gate weakening: removed assertions, loosened thresholds, added skips in test and gate files;
   4. review by a different model family than the writer (Munito DeepSeek or NVIDIA Nemotron for a MiniMax writer). It must answer pass or fail against the acceptance criteria; any number, citation or fact not traceable to a repo file (or marked ASSUMED) fails. No reviewer reachable means fail.
4. Pass: commit on `auto/<id>` ("Built by autobuild (<model>)", no Claude trailer), a paragraph in `docs/night/AUTO-LOG.md` (task, branch, commit, gates, models, cost, time).

One run at a time (lock file in the temp dir, stale after the budget). Time budget `AUTOBUILD_MINUTES` (default 100). Munito spend goes through `services/munito-ledger.js`; the rest is free.

## Scheduling (the owner does this; autobuild never creates the task)
```
schtasks /Create /SC HOURLY /MO 2 /TN "SavantAutobuild" /TR "cmd /c cd /d C:\coding\savant-wt\autobuild && node scripts\autobuild.js >> autobuild-run.log 2>&1"
```
Run by hand: `node scripts/autobuild.js [--task=<id>] [--max-tasks=N]`.

## Daily review (about five minutes)
Read `docs/night/AUTO-LOG.md`. For each `done`, look at `git diff main...auto/<id>` and merge the ones you accept; for each `blocked`, read the reason and either rewrite the task (edit the queue yourself) or drop it. Autobuild passes mean "the gates held", not "the product is right": a reviewer model is a second opinion, not proof.

## Tests
`node scripts/autobuild-test.js` (fake aider and reviewer): claims, retries with feedback, the blocked path, scope, weakening detection, status-only queue writes, the lock.
