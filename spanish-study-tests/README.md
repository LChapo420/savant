# Sealed pre and post tests for the Savant vs Duolingo study

A copy of the `spanish-check/` engine (draw from the public drand beacon, server-side timing, hash-chained log,
scoring) with its own seed prefix (`spanish-study-draw-v1`), **one engine and one log per participant**
(`data/spanish-study-tests/u<id>/log.jsonl`, never committed), and two sittings: the pre-test on study day 0 or
day 1, the post-test on the last study day or later. `spanish-check/` itself is not edited; its `pool.json` is read.

- Each finished sitting is written to the study with `recordTest`: listening dictation as a score out of 100
  (chance 0) and the everyday-sentence reading test as correct out of its items (chance 0.25).
- Participants cannot force a sitting: the 12-hour gap and one-a-day rules always apply.
- Until `SEAL.txt` exists, every sitting is refused. To seal: fill the `OWNER:` lines in
  `docs/yc/DUOLINGO-STUDY-PROTOCOL.md`, run `node spanish-study-tests/scripts/seal.js` on a machine that has
  `spanish-check/pool.json`, then time-stamp `SEAL.txt` (`spanish-check/scripts/timestamp-seal.js`) before
  anyone joins.
- No participant page yet (backlog 0a(c)); the API is `/api/spanish-study-test/*` (`routes/spanish-study-tests.js`).
- Deleting an account (adult, or a parent deleting a child) removes the participant's log folder via `removeForUser`.
