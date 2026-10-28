# Block levels

Lessons, retention checks, game levels and checkpoint quizzes are built for each
learner from the block library, in two AI calls, on the `blocks` route
(**GLM 5.3 Flash** on OpenRouter, backed by **MiMo V2.6 Pro**, nothing else).

| Level | Call 1: layout | Call 2: fill-out | Delivered by |
|---|---|---|---|
| Lesson (`kind: lesson`) | which lesson blocks, in what order, what each is for, where the graded checks go | every block's data against its own schema, plus the check questions | `/base-lesson` page, `public/js/block-level.js` |
| Retention (`(retention)` activities) | retention + assessment blocks aimed at what the learner struggled with | same | same |
| Game level | a question plan: skill/style mix, interest theme, difficulty curve | the creator's game prompt (`scripts/lib/game-prompt.js`) plus the plan | the game engine, as before |
| Master / Grand Master / Final | a format and presentation style for each slot of the course's fixed blueprint | the questions, in parallel batches of ten | the ordinary session: 75% / 75% / 90% pass marks, retry or "work on what went wrong" |

Both calls get the same context: the learner brief (`services/details.js`: the
100-stat scorecard as ranked directives, the learner record's solid facts and
struggles with their hints, survey, feedback, mastery) and the level (subject,
grade and age, topic, topic generalization, skills, the lessons around it).
The layout call sees the library as one line per block (~2k tokens); the
fill-out call sees only the chosen blocks' schemas.

## What is checked in code

- Every block's data is validated against its schema (`services/block-schema.js`).
  Failures go back in one repair call; anything still failing is dropped.
- Check questions must have one answer among exactly four choices (or a short
  typed answer). The page never receives the answer: `/check` grades on the server,
  records an item (mastery gate + after-level read), then reveals it.
- Checkpoints may change presentation only, never skill, difficulty or hints.
- A holdout of 10% gets the level's shared, untailored plan, so tailoring can be measured.

## Base levels

`npm run generate:base -- --track english --grade proficient --from 1 --to 100`
writes the shared versions standard learners and the owner see (stop the
server first). In order: game engines assigned at random but balanced across
difficulty tiers and easier-to-harder within each run of activities; lessons,
each laid out from a coverage list of every point its topic and generalization
require; retention levels built on what those lessons covered; games, with the
lesson's coverage in the prompt and questions ordered evenly by difficulty; then
the Master quiz and essay, built on everything taught since the last
checkpoint. Every prompt carries the subject, grade, average age, topic, topic
generalization, and previous and future topics. A report goes to
`data/base-levels-report.json`.

## Everything the learner does reaches their record

- Answers: session questions, block-level checks, game questions (all items).
- Inside levels: what they tapped and typed in each block or lesson page, and
  what the block itself marked right or wrong (`public/js/level-capture.js`),
  sent on finish and again if they leave without finishing.
- Chat: the coach on questions, chat assist on every block, lesson page and game
  question (`services/assist.js`), questions asked after answering, and the tutor
  conversation after a failed checkpoint — quoted in their own words.
- Feedback after every level.

The after-level read gets all of it (`levelEvidence` in `services/learner-record.js`),
one read per level. The coach and every level writer get the same translation
of the record: scorecard directives, confirmed facts, and struggles with their hints.

## Essays

The topic and rubric are written per learner (MiMo, `deep`) and marked against
that rubric: each criterion 1–4 with a quoted piece of evidence, overall =
total / (criteria × 4), recomputed on the server; 75% passes. Under 75% the
learner retries at once or works through the weak criteria with the tutor
first; either way the retry is a **revision of the same piece** (topic, rubric
and last draft carried forward, with the feedback shown). "Essay Revision"
levels revise the draft level's piece. Math "Written Task" levels are marked on
reasoning and mathematical communication.

## Files

- `services/block-levels.js` — lessons and retention: context, layout, fill, repair, storage, prefetch, checks
- `services/block-checkpoints.js` — tailored Master / Grand Master / Final questions
- `services/game-payloads.js` — tailored game question sets
- `public/engine/checks/` — the server-graded check blocks
- `scripts/block-levels-test.js` — `npm run blocks:test`

## Shipped base levels

Written base levels live in the data file, which is not committed. After a
generation run, export them so they ship with the code:

    npm run base:export -- --track english --grade proficient

That writes `content/base-levels/<track>-<grade>.json` (shared plans and game
sets only — no answers, telemetry or accounts). The server adds any shipped
level the data file does not already have when it starts; `npm run base:import`
does the same by hand. Nothing already in the data file is overwritten.
