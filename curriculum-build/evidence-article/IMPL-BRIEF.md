# Implementation brief (2026-10-25, overnight)

The owner approved this rule: an improvement backed by 3 or more credible sources goes **live** once it passes all tests and a browser check. It must have a flag that can turn it off, and rollback steps in `curriculum-build/LIVE-CHANGES-2026-10-24.md`.

For the weak scorecard rules, the owner said to "add, modify and remove what is needed to make the scorecard proven as perfect and accurate as possible".

## Rules
- **Repo:** `C:\coding\claudecommittdIq\folderThing\iq-max-repo-2-claude-adoring-mayer-woc9sq`. Run node with `NODE_PATH=..\node_modules`.
- **Never:** commit, touch `.env`, write `data/db.json` or `data/parallel`, or stop the app on 6767. I restart it after you finish.
- **Editing:** use the Edit or Write tools only. Never use PowerShell `Get-Content`/`Set-Content` round trips; they corrupt UTF-8.
- **Before you edit any shared file, re-read it.** Other agents work in parallel.
- **Backups:** back up every file before your first edit to `C:\Users\admin\AppData\Local\Temp\claude\C--coding-claudecommittdIq-folderThing\34e6f487-b3f5-4acd-899c-244171ef0427\scratchpad\before-impl-<your letter>\`.
- **Owner account:** the.landon.d@gmail.com (`config/owner.js`, `OWNER_BASE`) always gets the base app. New optimizations must not apply to that account. `scripts/owner-base-test.js` must still pass.

## For each proposal you build
1. Check that it really has 3 or more credible, verified sources in its section file (`curriculum-build/evidence-article/0N-*.md`). If it doesn't, skip it and say why.
2. Skip anything that needs real-learner data we don't have, such as calibration from live responses. List it under "needs data".
3. Put it behind an env flag, on by default. Name the flag after the change and document it.
4. Add or extend tests that prove the new behaviour.
5. Verify:
   - your new tests;
   - the full `npm test` chain on a DB copy with keys blanked and `OLLAMA_ENABLED=0` (`ollama-provider-test` runs without it);
   - for any visible change, a browser check on a test copy (copy `data/db.json` into your scratchpad and start the app on a free port with `DB_FILE` set, using the built-in browser preview tools) at 375 and 1280 px, with no console errors and no overflow.
6. Record it in `LIVE-CHANGES-2026-10-24.md` (flag, rollback) and append a line to the Log in `curriculum-build/AWAY-2026-10-24.md`.
7. Update the matching section file: mark the proposal "BUILT (flag X)", or "SKIPPED: reason".

## Final report
Keep it short:
- built, with flags and the tests added;
- skipped or needs data, with reasons;
- full-chain result;
- whether a restart is needed.

Be token-efficient.
