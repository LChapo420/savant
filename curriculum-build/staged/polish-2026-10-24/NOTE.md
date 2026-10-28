# Staged: polish findings too big for a look-only pass (2026-10-24)

Found by the polish audit (`curriculum-build/POLISH-2026-10-24.md`). Nothing here is applied. Each item changes an API, server behaviour or content, so it needs an owner or a feature agent.

## Speed

1. **Compression on the dev/laptop server.** `server.js` sends every file and JSON body uncompressed.
   - Measured (gzip -9): `style.css` 119 KB to 25 KB.
   - Path JSON is the heaviest body: `GET /api/path/:id` is 91 to 374 KB (basketball 374 KB, chess 279 KB). `GET /api/catalog` is 149 KB on the landing page.
   - The staged beta deploy (`staged/beta-launch/deploy/Caddyfile`) already has `encode zstd gzip`, so production is covered once it goes out behind Caddy.
   - Until then, any tester on the laptop server downloads everything raw.
   - Don't add a generic compression middleware without excluding `/coach/stream`: compression buffers server-sent events.
2. **Dashboard: one request per enrollment.** `dashboard.js` asks `GET /api/placement/path/:id` once per enrollment, all at once. With 11 enrollments that is 11 calls of about 190 ms each on the test copy.
   - A batch form, `GET /api/placement/paths` returning `{ [enrollmentId]: reply }`, would turn this into one call. The page already tolerates a missing reply.
3. **Landing catalogue.** The landing page needs names, blurbs and grade counts. `/api/catalog` sends every grade's full record (149 KB).
   - A `?summary=1` form, or a static `catalog-summary.json` written at build time, would cut it to about 10 KB.
4. **Path payload.** `/api/path/:id` sends every level's description for all of a grade's levels (up to 437). The page shows descriptions only for the current, next and checkpoint rows.
   - Sending descriptions only for those rows, or on demand, would cut it by about two thirds.

## Copy that comes from content or the server (not changed here)

5. **Raw metric names in skill bars.** These come from `content/skill-progressions/*.json`, for example "Bar: cold take noteAccuracy >= 0.9, no stops." on `/stage-left` and `/stage-check`.
   - Suggested: a `bar_text` field written for learners ("9 notes in 10 right, without stopping").
6. **Stage codes shown to learners.** Learners see "Stage PI1: Pre-reader." and "leave stage PI1".
   - Suggested: show the stage name only.
7. **"Attested" on `/stage-check`.** This marks a skill the app cannot check. A learner won't know the word.
   - Suggested: "You say when it's done", if that is what it means (the owner should confirm).
8. **Recap analysis line after a held graduation.** `services/sessions.js:1451` writes "The level is no longer the constraint, so the next one steps up." It does this even when graduation is held (the recap above it says graduation waits on 12 objectives).
   - Suggested: skip that sentence when `heldGraduation`.
9. **Placement result after all "I don't know".** On the English Intermediate classic placement, answering "I don't know" to every question gave "You start at unit 6 of 20", with units 1 to 5 "not checked yet".
   - It is internally consistent: the test starts at the grade's own level, and the earlier units are offered as a check.
   - But a learner who knew nothing is told they skip 5 units until they take the check. Passed to the placement re-validation agent's area.
10. **Em dashes in stored names.** Grade and level names keep " — " ("Sense of Quantity — Preschool, ages 3-4", "Final: Grade 2 — Rules Learner").
    - The display now turns these into commas (`App.cleanTitle`, `App.gradeLabel`).
    - Fixing them at the source would let other surfaces (emails, the admin) match.

## Accessibility left as is

11. **Chess board coordinates.** The 8 to 1 and a to h labels on `/engine/chess/*` and in stage checks are 1.9 to 2.0:1 against their square. That is the usual chess convention: they use the opposite square's colour.
    - They are not essential (each square's name is also in the board's accessible labels), so this is not a 1.4.3 failure in practice. Still, a darker label colour would help low-vision players.
    - It lives in the chess engine's CSS, which this pass does not edit.
12. **Verdict heading level.** The player's verdict ("Not quite. The answer is ...") is an `h4` straight under the page's `h1`. It is announced correctly; the skipped levels are a best-practice note, not a failure.
    - Changing the tag touches CSS used by 4 screens, so it is left for a markup pass.
