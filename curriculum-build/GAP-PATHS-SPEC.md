# Gap-only learning paths: build spec (2026-10-22)

Goal (owner): after placement, each learner works **only on what they don't know**, so they reach the
grade they should be learning at. From `docs/PRODUCT-DECISIONS.md` (read it):

- Grade placement picks "the start point inside the grade, or only the topics still needed, so the
  learner skips what they proved".
- Subject placement "lightly recommends earlier grades where the learner missed things". Earlier-grade
  gaps are a **recommendation the learner can decline**, never a forced detour.

Everything must stay factual. Nothing may be marked known without evidence. A false skip (a gap unit
marked known) is the worst error; asking one extra question is cheap.

## What exists today

- An enrollment is one learner in one grade of one track (`routes/catalog.js` creates it). It has
  `current_level`, `level_items`, `levels_completed`, `checkpoints_cleared` and `status`, and the path
  is linear.
- Levels advance by +1 in `services/mastery.js` (`moveTo`, `advance`, `completeLesson`,
  `clearCheckpoint`). `routes/learn.js` `mayOpenLevel(level, standing, maySkip)` lets a learner open
  any level ≤ `current_level`.
- **Units.** A unit is a run of levels between two checkpoints. Banks are at
  `content/unit-placement/<track>.json` for math, english and reading: `grades[gradeId].units[]` with
  `{key, start, end, titles, questions[5]}`. Calibrated positions are in
  `content/unit-placement-calibration/<track>.json`. `services/unit-placement.js` provides
  `unitsFor`, `pointOf`, `score`, `markCheck`, `nextCheck` and `startLevelOf`.
- **In-grade placement** (`routes/placement.js` `finishByUnit` and `/quick-check`) sets
  `current_level` to the placed unit's first lesson and stores `placed_unit` and `quick_checks`.
  - The quick check asks about each skipped unit. Two misses reopen it, and today that moves
    `current_level` back, so the learner redoes everything after it. **That is the behaviour to
    replace.**
- **Subject placement** (`services/subject-placement.js`, `services/adaptive-placement.js`,
  `routes/subject-placement.js`) recommends a grade. Its answered questions carry calibrated `pos`
  (a grade index plus a fraction through that grade).

## Data model (new, on the enrollment row)

```
unit_plan: {
  version: 1,
  units: { [unitKey]: { status, source, evidence: {right, wrong}, at } },
  catch_up: [ { grade_id, unit_keys: [..], status: 'offered'|'accepted'|'declined'|'done', enrollment_id|null } ]
}
```

`status` is one of:
- `known`: proved; the path skips it.
- `learn`: must be worked.
- `done`: worked through on the path.
- `unseen`: no evidence yet; default for units after the start; worked normally.

`source` is one of `placement`, `quick_check`, `test_out`, `gap_scan`, `path` or `manual`.

### Evidence rules

All evidence is per unit, from that unit's own bank questions.

- **Before the placed unit:** `known` if a placement question in it was answered right, or its quick
  check passed. Two quick-check misses make it `learn`. This is the existing rule, now recorded per
  unit.
- **At or after the placed unit:** `unseen` by default. A unit becomes `known` only through a
  **test-out**: two bank questions in that unit, both right, with no miss on that unit's questions in
  placement. Offer a test-out only for units after the start where placement already saw a right
  answer. The test-out questions must not repeat ones already asked.
- **The placed unit itself** is always `learn`.

### Path rule

- When the learner finishes a level, the next level is the first level after it whose unit is not
  `known`.
- A learner may still open a `known` unit to review it; `mayOpenLevel` allows it.
- Skipping a known unit's checkpoint records it in `checkpoints_cleared` with the source, as jumps do
  today.
- `current_level` starts at the first level of the **earliest** `learn` unit.
- After a `learn` unit is done, the path continues to the next non-known unit, not linearly through
  known ones.

Grades without a unit bank (other tracks), and enrollments without `unit_plan`, behave exactly as today.

### Earlier-grade gaps (catch-up, offered)

1. After subject placement recommends grade G, find candidate gap units in grades below G:
   - Each grade-level question answered wrong whose calibrated `pos` lies in a lower grade maps to
     that grade's unit at fraction `pos - floor(pos)`.
   - Also include each unit of grade G-1 for a short scan, within the mode's remaining time.
2. **Gap scan:** one bank question per candidate unit, with a second question after a miss. Two misses
   make the unit a gap. Respect the mode's total clock: Quick ≤ 20 min for the whole placement,
   Accurate ≤ 90 min.
3. The gaps become `catch_up` entries on the main enrollment, offered to the learner as "Catch up on
   these N units of <grade> first (about X min)". Accepting creates or reuses the earlier grade's
   enrollment with a `unit_plan` where only the gap units are `learn` and the rest `known`
   (source `gap_scan`). Declining is remembered and never nags.

## Who owns which files (do not edit files you do not own)

| Agent | Owns | Delivers |
|---|---|---|
| A: core path | NEW `services/learner-path.js`; `services/mastery.js`; `routes/learn.js` (only `mayOpenLevel` and what the path needs); `routes/placement.js`; `services/unit-placement.js` (add helpers; keep the existing exports working); NEW `scripts/learner-path-test.js` | The data model, evidence rules, test-out (server side) and path rule |
| B: gap scan | NEW `services/gap-scan.js`; NEW `routes/gap-scan.js` mounted in `server.js` as `/api/gap-scan` (that one line in `server.js` is B's); NEW `scripts/gap-scan-test.js` | Candidate units, scan walk, catch-up offer, accept and decline |
| C: UI | `public/js/path.js`, `public/js/placement.js`, `public/js/dashboard.js`, `public/js/subject-placement.js`, CSS files | Test-out screen, the reopened-unit message (no more restart), known units shown as skipped with a review option, the catch-up offer, the gap scan screen |
| D: simulation | NEW `scripts/gap-path-sim.js` | Simulated learners with planted gaps, run end to end through A's and B's real code |

### Shared API (A and B implement these exactly; C and D call them)

`services/learner-path.js` (A):
- `planFor(enrollment)`: returns the `unit_plan`, or null
- `initFromPlacement(enrollment, scoreResult, answered)`: writes `unit_plan`, returns it
- `recordCheck(enrollment, unitNumber, correct)`: quick check or test-out answer; returns
  `{ plan, changed }`
- `testOutCandidates(enrollment)`: `[{unit, key, slots}]`
- `nextLevelAfter(enrollment, grade, level)`: the next level the path should stand on
- `firstLevel(enrollment, grade)`: where the learner should stand now
- `setUnit(enrollment, unitKey, status, source)`
- `summary(enrollment)`: `{ known, learn, done, unseen, catch_up }`, counts plus unit titles, for the UI

HTTP (A, in `routes/placement.js`):
- `GET /api/placement/test-out/:enrollmentId`: next test-out question, or done
- `POST /api/placement/test-out`: `{enrollment_id, unit, slot, answer}`
- `GET /api/placement/path/:enrollmentId`: the `summary`
- Existing `/quick-check` keeps its shape, but reopening no longer restarts the path.

HTTP (B):
- `POST /api/gap-scan/start`: `{track_id, mode, recommended_grade_id, subject_session_id?}` returns
  the first question and the clock
- `POST /api/gap-scan/answer` returns the next question, or `{done, gaps:[{grade_id, unit_keys, titles, minutes}]}`
- `POST /api/gap-scan/decide`: `{enrollment_id, grade_id, accept: bool}`

A's implementation notes (additions only; nothing above changed):
- `recordCheck(enrollment, unitNumber, correct, { slot })`: the 4th argument is optional. With a slot,
  the same question is never counted twice.
- Each unit entry also has `asked: [{slot, correct, source}]` (every bank question asked, never asked
  again) and `test_out: null|'pending'|'passed'|'failed'`. The plan also has `placed_unit`.
- Extra exports: `nextTestOut`, `askedSlots`, `unitAt`, `unitRows`, `finishLevel`, `skippedCheckpoints`.
- `summary()` returns `{planned, placed_unit, current_level, first_level, units:[{unit,key,title,start,end,status,source,test_out}], known|learn|done|unseen: {count, units}, catch_up, test_out}`.
- The test-out responses are `{question, candidates:[{unit,key,title}], summary:{passed:[units], failed:[units], pending, current_level}}`. GET `/api/path/:id` nodes carry `unit_status`, `unit_key`, `unit_number` and `unit_title`, and a known unit's levels are `reachable`.
- A skipped known unit's checkpoint is written to `checkpoints_cleared[level]` as a timestamp, like a jump, and `checkpoint_sources[level] = 'unit_plan:<source>'`.
- **Checkpoints between units** (e.g. math's Written Task Revision at 54, after unit 2 ends at 53;
  unit 3 starts at 55). Such a checkpoint covers the unit whose same-kind checkpoint it directly
  follows; failing that, every unit wholly between the previous checkpoint of its kind and itself
  (`learnerPath.betweenCovers`). It is stepped over only when every unit it covers is `known`, or was
  passed by the placement (before the placed unit, not `learn` and not `done`), or when it is already
  in `checkpoints_cleared`. It is recorded as cleared only when every covered unit is `known`. If a
  unit it covers was worked or will be, the learner takes it. Every other level outside the units
  is walked, including everything after the last unit (the grade review and Graduation).
- `POST /api/sessions` answers `unit_review: 'known'|'skipped'|null` for a level opened as a preview.
  `GET /api/placement/path/:id` calls `gapScan.attachOffers(userId, enrollment)` first; it is guarded,
  so a missing module or an error there does not break the route.

B calls `learnerPath.setUnit` and `planFor`. If A's file isn't there yet, code to this API and B's
tests can stub it. A must not change these signatures without updating this file.

## Ground rules for every agent

- Node: run with `NODE_PATH=../node_modules` from the app folder.
- **Never write `data/db.json`.** Tests use a DB copy through the `DB_FILE` env var, as
  `scripts/adaptive-placement-test.js` does; copy that pattern.
- **Do not edit** `content/unit-placement*` or `curriculum-build/placement-judge/*`. Another job is
  rewriting those banks right now; read them only.
- **Make no model or API calls.** This is all deterministic code. No commits, no `.env` edits, and
  never print keys.
- Match the surrounding code style: comment density, naming, small functions, and plain-language
  comments that explain why.
- Existing tests must still pass: `scripts/adaptive-placement-test.js`,
  `scripts/subject-placement-test.js`, `scripts/english-placement-test.js`.
- At the end, report exactly what was built, which tests were run and their output, and anything not
  done.

## Evidence model v2 (lead, 14:35 UTC; replaces the "one right answer" rules)

D's simulation (`scripts/gap-path-sim.js`, 2,160 planted-gap learners) shows the v1 rules fail the
targets. Results: false skips 4.1% (target ≤1%), missed gaps 3.0% (target ≤2%), and recall of
earlier-grade gaps 27%.

The causes, ordered by how many false skips each produced:
- 679: one right placement answer made a unit known.
- 419: one right quick-check answer passed the unit, even after misses.
- 281: one right gap-scan answer cleared a unit.
- 253: unscanned catch-up units were marked known.
- 46: a bug where a unit missed on every question with no questions left was stepped over.

v2 replaces every one of those rules with one shared model.

**One model for every skip decision** (placement, quick check, test-out, gap scan). Put it in
`services/learner-path.js` as an exported `unitBelief(evidence, opts)` and use it in all four places.
B imports it from there.

```
P(known) starts at a prior:
  prior_known = 1 - HOLE_PRIOR
    for units the placement put the learner past (before the placed unit, or in grades
    below the recommended one)
  prior_known = ISLAND_PRIOR
    for units at or after the placed unit (test-out)
Each answer to one of the unit's own bank questions updates it by Bayes:
  P(right | known)   = 1 - SLIP
  P(right | unknown) = g + LUCK, where g = 1/choices
Decision:
  known   if P(known) >= KNOWN_AT
  learn   if P(known) <= LEARN_AT
  otherwise ask another fresh question of that unit (if one is left and the time budget allows)
When questions or time run out and the unit is still undecided, it is NOT skipped:
  status 'unchecked'
```

Starting knobs (environment-overridable; D tunes them against the targets): `HOLE_PRIOR` 0.15,
`ISLAND_PRIOR` 0.3, `SLIP` 0.05, `LUCK` 0.15, `KNOWN_AT` 0.985, `LEARN_AT` 0.35.

Every answer in that unit counts as evidence, from every source: placement, scan, check and test-out.
Misses count against the unit. No single right answer can make a unit known on its own unless the
numbers say so.

### New status `unchecked`

The path treats an `unchecked` unit like `learn`: it is worked, never stepped over, so it can never
be a false skip. It differs from `learn` in two ways:
- The path view shows "Not checked yet, test out?". The learner can run a short test-out from the
  path at any time, outside placement, using the same model, to skip it.
- Summary counts list it separately.

`/api/placement/test-out` must accept unchecked units, not only units after the start.

### Gap scan (B)

- Use `unitBelief` for each candidate, with the same prior and update rules.
- A catch-up enrollment's **unscanned** units are `unchecked`, never `known`:
  - The catch-up path still leads with the confirmed gaps (`learn`).
  - Unchecked units come after them, as "not checked yet, test out?".
  - The offer text names only the confirmed gaps and their time.
- Add an optional "keep checking <grade>" scan that runs outside the placement budget, using the same
  routes with a flag, so a learner who wants to can confirm more of the earlier grade.

### Time

The mode budget (Quick 20, Balanced 45, Accurate 90 minutes) covers the whole placement, including
quick checks. Quick checks get the time the stages leave. Undecided units become `unchecked`, which
is safe, rather than going over the budget. Test-outs from the path view are outside placement and
have no budget.

### Targets (unchanged)

The targets for D's sim:
- false skips ≤ 1% of units
- missed gaps ≤ 2%
- placement plus checks never over budget

Also report waste (known units left on the path) and the share of units left `unchecked`. These two
are the price paid for safety, so keep them as low as the targets allow.

### v2 as implemented (A)

- **The model.** `learnerPath.unitBelief(evidence, { prior, choices })` takes three evidence shapes:
  `[{correct, choices?}]`, a unit entry with `asked`, or `{right, wrong}`. `prior` is `'past'`
  (default), `'island'` or a number. It returns `{p, decision: 'known'|'learn'|'undecided', right,
  wrong, answered, prior}`. `beliefKnobs()` reads the six env knobs on every call. Each answer's
  `choices` comes from its bank question, and defaults to 4.
- **Priors.** A unit gets `'island'` only when it is after the plan's `placed_unit`. Every other unit
  gets `'past'`, including all units of a plan with no placed unit (catch-up grades).
- **Placement** (`initFromPlacement`, plan `version: 2`). Before the placed unit, the status comes
  from the model: known, learn, or `unchecked`. The placed unit is `learn`. Units after it are
  `unseen`. Earlier `asked` rows (gap scan and other sources) are kept and count as evidence.
- **Quick check.** It asks one row per `unchecked` unit before the placed unit
  (`learnerPath.quickChecks`), one unit at a time, in unit order, with fresh questions until the model
  decides the unit. When questions or time run out, the unit stays `unchecked`.
  - Clock (`checkDeadline`): the mode's total, minus the in-grade session, minus the subject walk
    and its gap scan when they finished within 2 hours before this placement. It is stored as
    `quick_check_deadline_at`. A question is asked only if `QUICK_CHECK_SECONDS` (default 26) still
    fit.
  - The question last shown (`quick_check_shown`) is still accepted after the clock runs out. No
    other question is.
  - GET and POST return `{question, done, summary}`. `summary` adds `unchecked: [units]` and
    `seconds_left`.
- **Test-out.**
  - Open on any `unchecked` unit at any time. Also open on an unseen unit after the placed one that
    hasn't been started, that placement answered right at least once, and that is not already `learn`
    by the model.
  - In both cases, only when the fresh questions left could still prove it.
  - It ends known (`test_out: 'passed'`); `learn` when the model says so; or `'failed'` when it can
    no longer be proved.
  - `GET /test-out/:id?unit=N` and `POST {unit, slot, answer, only_unit}` restrict it to one unit.
    Responses add `done`, `candidates[].status` and `summary.to_learn`.
  - At the starting knobs a unit after the placed one can't be proved: 0.3 plus five rights reaches
    only 0.970. So only `unchecked` units get test-outs until ISLAND_PRIOR or KNOWN_AT change.
- **Path order.**
  - Units to learn come first, in level order. Then units not proved (`unchecked`, `unseen`), in
    level order, including ones behind the learner, so none is left behind. Known and done units
    are never worked.
  - `nextLevelAfter` finishes the unit under way (and any follow-up checkpoint between units),
    then goes to the next unit in that order. With none left, it goes on to the grade review and
    Graduation.
  - `firstLevel` is the earliest `learn` unit (or the current level, if inside it). Otherwise it is
    the unit not proved that the learner is inside, or the earliest one.
  - The path can now jump back. A walk that simulates it must call `finishLevel` at each level and
    must not stop when the next level is lower.
- **Placement result** (`/finish`) adds `start_level` (where the learner stands; it can be before
  `placedLevel`), `to_learn` and `unchecked`.
- **Path nodes** (`GET /api/path/:id`) add `unit_can_test_out`. The summary rows add `can_test_out`,
  and the summary has an `unchecked` group.

## Placement choices (2026-10-22)

Probabilities per grade, picking any grade, the catch-up quiz across every lower grade (its own
clock, ordered catch-up route) and retaking the in-grade placement are specified, as implemented, in
`curriculum-build/PLACEMENT-CHOICE-SPEC.md`. The shared API above is unchanged, with additions only:
- `initFromPlacement` keeps `done` units and non-placement proofs on a retake.
- The `catch_up` entries are kept lowest grade first, and carry `units` and `catch_up_order`.
- `services/gap-scan.js` adds `startCatchUp`, `declineCatchUp`, `catchUpQuiz`, `routeOf`,
  `routeFor`, `routeForEnrollment` and `decideAll`.
