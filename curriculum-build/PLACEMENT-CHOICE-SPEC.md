# Placement choices: server spec and front-end spec (2026-10-22)

The owner's decisions, built server side. The front end is being redesigned in `public-v2/`, so no
page was changed. Everything below the "Front-end spec" heading is the brief for the UI pass after the
merge. Read `curriculum-build/GAP-PATHS-SPEC.md` for the unit plan, `unitBelief`, and the gap scan
this builds on.

The owner's words:

> "the placement quiz should give a percentage for how best it thinks the user should start at that
> one, and they have the option to choose from any of those or they have the option to start at the
> highest percentage recommendation grade but take a catch up quiz that mostly based on the subject
> placement quiz sees what things the user either doesn't remember or wasn't taught from the grades
> before the one they were recommended most, so then they can take a catchup grade that catches them
> up to where now they know everything from the grades previous to the one most recommended"

> In-grade placement can be RETAKEN: "offer it the same place the normal one is offered".

## What was built

### 1. A probability for every grade

- `services/adaptive-placement.js`
  - `gradeMass(span, post)` returns the posterior mass in each grade. It sums to 1.
  - `wholePercents(mass)` rounds to whole percents that add up to exactly 100 (largest remainder).
  - `recommend()` now also returns `probabilities` (whole percents), `mass` and `middle` (the old
    median grade). Its `index`, the recommended grade, is now the **most probable grade**, so the grade
    called "recommended" always has the highest percentage. `ADAPTIVE_PICK=median` restores the old
    median pick. Simulated testers, cached judge verdicts, 2 seeds: the two picks place the same
    testers within one grade, except math balanced (385 vs 387 of 392). The most probable pick is
    exact slightly more often (see Results).
  - `percents` (scaled so the top grade reads 100) is kept for older pages.
- `services/subject-placement.js`
  - `evidenceOf(trackId, placement)` returns the walk's answers as `{pos, guess, correct}`. This moved
    here from gap-scan; gap-scan's `placementEvidence` now calls it.
  - `probabilitiesFor(trackId, placement)` returns
    `{model: 'posterior-v1', most_likely_grade_id, grades: [{grade_id, name, probability, mass}]}`. It
    works for adaptive walks and the full climb. On the full climb the recommendation still comes from
    the model or the answer shape, so `most_likely_grade_id` can differ there.
  - `recommend()` stores `probabilities` on the `subject_placements` row. Each recommendation row now
    carries `probability` beside `percent`.
  - `resultFor(trackId, row)` is the one result shape (see the API below). Rows written before this
    change get their probabilities worked out from their answers.
  - `chooseGrade(userId, trackId, gradeId)` enrols the learner in any grade, the way
    `routes/catalog.js` does: a new enrollment is `placement_pending`, and an existing one is reused. It
    also records `chosen_grade_id` on the walk.
  - `start()` (a retaken subject placement) resets `probabilities`, `chosen_grade_id` and
    `catch_up_choice`.

### 2. The catch-up quiz ("start at the recommended grade + catch up")

The catch-up quiz is in `services/gap-scan.js`. It is the existing gap scan, widened:

- **Candidates.** Every unit of **every** grade below the recommended one, where the grade has a unit
  bank. Units the learner's own enrollment in that grade already has as `known` or `done` are left
  out. A unit that enrollment has as `learn` is already a gap. A gap scan of the same walk and grade
  carries over: its decisions stand, and its questions are never asked again. At most 160 open
  candidates are kept.
- **Ranking: "mostly based on the subject placement quiz".** Each candidate gets a starting chance of
  being known, `(1 - P(frontier below the unit)) × (1 - HOLE_PRIOR)`, from the walk's posterior. The
  walk's own answers mapped to that unit (calibrated `pos`, as before) then update it, rights and
  misses alike. Units far below the frontier that the walk saw answered right sort last. Units near a
  miss, or near the frontier, sort first. Questions still go a round at a time (`byPriority`): every
  candidate gets one question before any gets a second.
- **Deciding.** This step is unchanged. `beliefOf` uses the `'past'` prior, the walk misses mapped to
  the unit, and the unit's own bank answers, with the same `unitBelief` knobs. A unit is decided only
  once at least one of its own bank questions has been answered. The walk ranking never decides
  anything.
- **Clock.** The quiz has its own clock, outside the placement budget: Quick 10 minutes (23
  questions), Balanced 20 (46), Accurate 40 (92). The minutes can be changed through env knobs
  `GAP_CATCH_UP_<MODE>_MINUTES`. When the clock or the questions run out, every undecided unit is
  `unchecked`. "Keep checking <grade>" (`extended: true`) carries on past it, as before.
- **Result.**
  - Gaps are grouped by grade, lowest grade first. `attachOffers` writes them onto the recommended
    grade's enrollment as `unit_plan.catch_up` entries, sorted lowest grade first, plus
    `unit_plan.catch_up_order: [grade_id...]`. Declined grades are left out of that list.
  - Each entry now also has `units` (unit numbers).
  - Accepting creates or reuses a catch-up enrollment per earlier grade, as before. The gap units are
    `learn`, units the quiz proved are `known`, and every other unit is `unchecked`, never `known`.
- **Route.** `routeOf` / `routeFor` / `routeForEnrollment` build the one ordered plan: "Catch up: 3
  units of Grade 2, 2 units of Grade 3, then start Grade 4". `next` points at the first step not yet
  done, then at the main grade. `syncCatchUp` marks a step `done` once its gap units are done or
  known.
- **Remembered decisions.**
  - Declining the quiz is stored as `subject_placements.catch_up_choice = {status: 'declined', grade_id,
    at}`.
  - Declining the catch-up is stored per grade in `gap_decisions`, as before. A declined grade stays
    declined when offers are attached again, and is never re-offered.
  - The learner can still start the quiz by hand later, or accept a declined grade with an explicit
    `/decide`.
- `start()` (the in-budget gap scan) hands back a running or finished catch-up quiz for the same grade
  instead of replacing it.

### 3. Retaking the in-grade placement

- `POST /api/placement/start` on an enrollment that is already placed returns **409** unless the
  request has `retake: true`. "Placed" means its status is not `placement_pending`, or it has a
  finished placement session.
- With `retake: true`, a placement session with `retake: true` and `retake_of` starts. The enrollment
  stays `active`, so the path keeps working while the retake runs. An open retake resumes like any
  open placement.
- `POST /api/placement/retake/cancel {enrollment_id}` closes an open retake (`cancelled: true`) and
  changes nothing else. `/finish` on a cancelled retake returns 409.
- Finishing a retake:
  - `learnerPath.initFromPlacement` rebuilds the plan from the new answers. Units that were `done`
    **stay done** (completed work is never un-finished). Units proved `known` by a test-out, quick
    check, gap scan or by hand stay known, unless the new answers miss in that unit and the model then
    says `learn`. Test-out, check and scan answers stay as evidence. Only the old placement's answers
    are replaced.
  - Open lesson sittings on the enrollment are closed with `closed_by: 'placement_retake'`. The
    scorecard's quit hook is **not** called, so a retake is not a quit.
  - `placement_retakes` (a count) and `placement_history` (the last 20) are written. The result has
    `retake: true` and `kept_done: [units]`.

### Tests and simulation

- New `scripts/placement-choice-test.js` (78 checks) covers:
  - probabilities: they sum to 100 and match the posterior
  - choosing any grade
  - catch-up candidates span every lower grade and come lowest grade first; the route, accept-all and
    decline-all
  - declining is remembered
  - `unchecked` never becomes `known` without evidence
  - a retake keeps done units and test-out proofs; it is not a quit, can be cancelled, and an
    accidental restart is refused
- `scripts/gap-path-sim.js` changes:
  - a `deep` profile: 1 to 3 holes two grades down
  - a catch-up quiz stage after placement, on by default; `--catch-up=no` turns it off for a before
    and after comparison
  - a `G-2rc` column for recall two or more grades down
  - the catch-up clock is checked: the `over` column's third number must be 0

### Results (2026-10-22)

The suites all pass: adaptive-placement, subject-placement, english-placement, gap-scan,
learner-path, placement-choice, self-test and qa4-fixes.

`scripts/gap-path-sim.js --quick`: 6 seeds, 7 profiles (with the new `deep`), 378 learners. Every row
passes (false skips ≤ 1%, missed gaps ≤ 2%, never over budget, catch-up never past its clock).

| | catch-up quiz off (`--catch-up=no`) | catch-up quiz on (default) |
|---|---|---|
| gaps found in the grade below (G-1) | 120/213 (56.3%) | 156/213 (73.2%) |
| gaps found two or more grades down | 13/112 (11.6%) | 68/112 (60.7%) |
| `deep` profile, two grades down, by row (math, english, reading × quick/bal/acc) | 16.7/33.3/28.6, 7.7/0/30.8, 0/0/15.4 | 66.7/66.7/57.1, 53.8/72.7/69.2, 69.2/76.9/69.2 |
| false skips (count, all sources) | 29 | 30 (one from the gap scan) |
| unknown catch-up units marked known without a scan | 0 | 0 |

Catch-up questions average 23 (Quick), 44-46 (Balanced) and 86-92 (Accurate), always within their own
clock. The false-skip *percent* falls with the quiz on (for example math quick 0.23% to 0.13%) mostly
because more units are judged. In absolute terms it is one more false skip, still well inside target.

Recommended grade = most probable grade, against the old median pick
(`scripts/placement-testers.js run`, 2 seeds, cached judge verdicts):

| | most probable (new) within ±1 / exact | median (old) within ±1 / exact |
|---|---|---|
| math quick / balanced / accurate (392 each) | 385/250, 385/251, 385/252 | 385/247, 387/249, 387/251 |
| english quick / balanced / accurate (128 each) | 128/89, 128/92, 128/90 | 128/90, 128/93, 128/91 |
| reading quick / balanced / accurate (128 each) | 128/91, 128/91, 128/92 | 128/90, 128/90, 128/92 |

`GAP_CATCH_UP_ORDER=rank` (rank alone instead of rounds) found 80% of grade-below gaps against 73%, and
the same share further down, with 3 gap-scan false skips against 1, on the below, deep, mixed and
strong profiles. That is too close to call on six seeds, so rounds stay the default.

## API (as implemented)

All routes need a signed-in user, and every error body is `{error}`.

### Subject placement result: probabilities

`POST /api/subject-placement/:track/finish`, `POST /api/subject-placement/:track/quit` (adds
`quit: true`), and `GET /api/subject-placement/:track` (as `result`, once finished) all return:

```
{
  already: bool,
  recommended_grade_id, recommended_grade_name, headline,
  probabilities: [ { grade_id, name, probability: 0-100 int | null, recommended: bool } ],  // every grade, sums to 100
  probability_model: 'posterior-v1' | null,
  most_likely_grade_id,          // = recommended_grade_id for Quick/Balanced/Accurate walks
  chosen_grade_id | null,        // the learner's own pick, once made
  percent: [ { grade_id, percent, probability, why } ],   // older shape, kept
  grades: [ { grade_id, name } ], scores: [...]
}
```

`GET /api/subject-placement/percent/mine` also carries `probabilities` for each track.

### Pick any grade

`POST /api/subject-placement/:track/choose {grade_id}` returns 201 when it creates an enrollment, or
200 when it reuses one:

```
{ enrollment: {id, track_id, grade_id, status, current_level}, created, recommended: bool, grade_name,
  next: 'placement' | 'path' }
```

It returns 400 for a grade outside the subject.

### Catch-up quiz

- `GET /api/gap-scan/state/:track` adds:
  - `catch_up_quiz: {available, grade_id, grades_below, mode, minutes, max_questions, status:
    'not_started'|'running'|'done'|'declined', declined_at}`. It is null before the walk is finished.
  - `route`: see below; null until a scan is done.
- `POST /api/gap-scan/start {track_id, catch_up: true, recommended_grade_id, mode?}`. The mode
  defaults to the walk's mode, then Balanced.
  - The reply is `{track_id, resumed, kind: 'catch_up', grade_id, done, question?: {grade_id,
    grade_name, unit, slot, index, format, prompt, choices}, clock: {deadline_at, minutes,
    seconds_left, asked, max_questions}}`.
  - When it is done, the reply also has `gaps` and `route`.
  - Errors: 404 if there is no walk; 409 if the walk is not finished; 400 if there is no grade below.
- `POST /api/gap-scan/answer {track_id, grade_id, unit, slot, answer}` is the same as the scan. A done
  catch-up reply carries `route`. A stale answer returns 409 with the question being asked.
- `POST /api/gap-scan/catch-up/decline {track_id, grade_id?}` returns `{track_id, catch_up_quiz}`
  with `status: 'declined'`.
- `POST /api/gap-scan/decide {enrollment_id | track_id, all: true, accept: bool}` accepts or declines
  every offered step at once, lowest grade first. With only `track_id`, it makes or reuses the
  enrollment for the scan's grade. It returns `{enrollment_id, results: [{grade_id, ok, error,
  catch_up_enrollment_id}], route}`.
- `POST /api/gap-scan/decide {enrollment_id, grade_id, accept}` decides one grade, as before.
- `GET /api/gap-scan/route/:track` returns `{track_id, route}`.

The route:

```
{
  grade_id, grade_name,                         // the main (recommended) grade
  status: 'none'|'offered'|'accepted'|'done'|'declined',
  headline: 'Catch up: 3 units of Grade 2, 2 units of Grade 3, then start Grade 4',
  steps: [ { grade_id, grade_name, status: 'offered'|'accepted'|'done', enrollment_id|null,
             unit_keys, units, titles, unit_count, minutes, unchecked_count } ],   // lowest grade first
  declined: [grade_id], total_units, total_minutes,                              // over open steps
  next: { kind: 'catch_up', grade_id, enrollment_id, accepted } | { kind: 'main', grade_id, enrollment_id }
}
```

`GET /api/placement/path/:enrollmentId` adds `catch_up_route` (the same route, for that enrollment)
and `placement: {placed, retake_available, retakes}`.

### Retake

- `POST /api/placement/start {enrollment_id, mode?, retake?}`:
  - On a placed enrollment without `retake: true`, it returns **409** `{error: 'This grade is already
    placed. To take its placement again, start a retake: units you have finished stay finished.',
    placed: true, retake_available: true, enrollment_id}`.
  - Otherwise it returns 201 as before, plus `retake: bool`. A resumed placement returns 200 with
    `resumed: true, retake`.
- `POST /api/placement/retake/cancel {enrollment_id}` returns `{cancelled: true, enrollment_id,
  current_level}`. It returns 409 if no retake is open.
- `POST /api/placement/finish` returns the same result as before. A retake adds `retake: true` and
  `kept_done: [unit numbers]`. A cancelled retake returns 409 `{cancelled: true}`.

## Front-end spec (for the UI pass in public-v2)

The copy below is a suggestion in the product's plain voice; keep the meaning.

### A. Subject placement result screen (`subject-placement`)

1. **Header.** "Start at {recommended_grade_name}". Under it, the `headline`.
2. **Grade list.**
   - Every row of `probabilities` with `probability > 0`, plus the recommended row and its neighbours.
     A "Show all grades" toggle reveals the rest.
   - Each row shows the name, a bar, and "{probability}%". The `recommended: true` row is highlighted
     and tagged "Recommended".
   - The percentages are probabilities and add up to 100, so word them that way: "How likely each
     grade is the right place to start". Do not say "score".
   - If `probability` is null (an old walk with no answers), show the older `percent` instead and hide
     the "likely" wording.
3. **Three actions**, the first being primary:
   - **"Start at {recommended} and catch up first"**. Show it only when `catch_up_quiz.available` and
     its `status` is not `declined`. The subline is "A {minutes}-minute check of the grades below
     {recommended} finds anything you missed or forgot."
     - Call `POST /choose {grade_id: recommended}`, then `POST /gap-scan/start {catch_up: true,
       recommended_grade_id}`, then show the catch-up quiz screen (B).
   - **"Start at {recommended}"** (no catch-up).
     - Call `POST /gap-scan/catch-up/decline`, then `POST /choose`, then go to `next` (`placement` →
       `/placement?enrollment=id`, `path` → `/path?enrollment=id`).
   - **"Choose a different grade"**. Tapping a row of the list selects it, and a "Start at {name}"
     button appears.
     - Call `POST /choose {grade_id}`, then go to `next`.
     - When the pick is below the recommended grade, add the note "You can always move up: lessons you
       already know can be tested out of."
4. **States.**
   - `catch_up_quiz.status === 'running'`: the primary button reads "Continue the catch-up check".
   - `done`: "See your catch-up plan" (screen C).
   - `declined`: show only "Start at {recommended}" and "Choose a different grade". A small link
     "Check the grades below anyway" starts the quiz.
   - `catch_up_quiz.available === false`: there is no grade below, so hide the catch-up action.

### B. Catch-up quiz screen

- Reuse the gap-scan question screen. Title: "Catch-up check: grades below {recommended}". Subline:
  "Nothing is marked as you go. Answer what you can; skip-guessing is fine."
- Show "Question {clock.asked + 1}" and a time bar from `clock.seconds_left` out of `clock.minutes`.
  Do not show the question cap as a target.
- Each question shows `grade_name` as a small chip, so the learner sees it moving across grades.
- Answer with `POST /gap-scan/answer`. A 409 reply carries the current question: redraw it.
- When `done`, go to screen C with `route`.
- Reload resumes: `GET /gap-scan/state/:track` gives `scan` (with `kind: 'catch_up'`), `question` or
  `done`, and `route`.

### C. Catch-up plan screen (the ordered list)

- **Heading:** the route's `headline`, for example "Catch up: 3 units of Grade 2, 2 units of Grade 3,
  then start Grade 4".
- **Steps.** Show `steps` in order, lowest grade first.
  - Each step is a card: `grade_name`, "{unit_count} units · about {minutes} min", and the `titles`
    as a list.
  - If `unchecked_count > 0`, add a muted line: "{unchecked_count} more units here weren't checked;
    you can test out of them on that grade's path."
- **Last step.** A final card: "Then: {grade_name}". Its in-grade placement comes first if it is
  still pending.
- **Buttons.**
  - Primary: **"Start the catch-up"** calls `POST /gap-scan/decide {enrollment_id: main.id, all: true,
    accept: true}`, then goes to `/path?enrollment={route.next.enrollment_id}`.
  - Secondary: **"Skip it and start {grade_name}"** calls `/decide {all: true, accept: false}`, then
    goes to the main enrollment (placement or path). The learner is not asked again.
  - Tertiary link: **"Check more of {grade}"**, one link per step grade, starts keep-checking with
    `POST /gap-scan/start {extended: true, grade_id}`.
- **Empty state.** If `route.status === 'none'` (no gaps found): "Nothing to catch up on in the
  grades we checked." Then a "Start {grade_name}" button.
- **Partial state.** If some grades were declined earlier (`route.declined`): "Skipped: {names}"
  in muted text.

### D. Path page and dashboard (catch-up progress)

- `GET /api/placement/path/:id` returns `catch_up_route`. While its `status` is `accepted`:
  - Show a banner on the main grade's path: the headline, plus the `next` step's grade with
    "Continue catch-up" → `/path?enrollment={next.enrollment_id}`.
  - Show a banner on a catch-up grade's path: "Catch-up {i} of {n}: {grade_name}. Then {next step or
    main grade}."
- Once the route's `status` is `done`: "Caught up. Start {grade_name}" → the main enrollment.
- On the dashboard, list the catch-up enrollments under the main grade, in route order, not as
  unrelated courses.

### E. Retake the in-grade placement

- **Where.** Offer it where the normal in-grade placement is offered, and on the same control: the
  dashboard card and the path page header for that grade. When `placement.retake_available`, show
  "Retake placement" beside "Continue".
- **Confirm dialog.** "Retake the placement for {grade}? Units you've finished stay finished, and units
  you tested out of stay skipped unless you miss them now. It takes about {mode minutes}."
  Buttons: "Retake" / "Cancel".
- **Start.** `POST /api/placement/start {enrollment_id, retake: true}`, then the normal placement
  screen with a "Retake" chip and a "Stop retake" link. "Stop retake" calls `POST
  /placement/retake/cancel` and returns to the path.
- **The placement page itself** must stop redirecting a placed enrollment to the path when `?retake=1`
  is in the URL. Without it, keep today's redirect. If `/start` answers 409 with `retake_available`,
  go to the path; never show an error.
- **Result.** As today, plus a line when `kept_done.length`: "Kept as finished: units
  {kept_done}." Then "Go to your path".
- A retake is not a quit, so add nothing to streaks or persistence copy.

## Not done

- No page was changed (`public/`, `public-v2/`). The front-end spec above is the brief.
- The full climb (no mode) keeps its model or shape recommendation. Its probabilities come from the
  same posterior and can disagree with that recommendation (`most_likely_grade_id`). The UI can hide
  the probabilities for `percent_model` walks that are not adaptive, or show both.
