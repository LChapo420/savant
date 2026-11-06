# Modification audit: which goal or scorecard measure changes which part of a lesson, check, review and uploaded course

Written 5 Nov 2026 by reading the code path that serves learners (not the docs). Sources: `docs/SCORECARD-MAP.md` (which spec fields have a code reader and which reach a writer only through a prompt sentence), `services/learning-spec.js`, `services/block-adapt.js` (the built-in level writer's adapter), `services/lessons.js` (the older lesson writer), `services/material-*.js`, `services/course-builder.js`, `services/learner-path.js`, `services/retention-goal.js`. "Prompt" means the writer is told a sentence and a post-check may or may not hold it to it (checkFollowed checks length, sentence length, vocabulary, key facts, interests, hint and profile leaks; nothing else). "Code" means a number is read and acts. This is a reading of the code, not a runtime trace of every cell: a cell marked "not reached" was searched for and not found.

Order: what a learner notices most first.

## 1. Lesson parts, by writer

Built-in levels are written by the block writer (`block-levels.js` through `block-adapt.js`); the older lesson writer (`lessons.js` through `ai.generateLesson`) is the bank-fallback path and still used for some tracks.

| Part of a lesson | Built-in levels (block writer) | Older lesson writer | Measures / goals that move it |
|---|---|---|---|
| Length (words, minutes) | Code + prompt: ceiling in the fill line, checked and revised once (`lesson.wordBudget`, `lesson.minutes`) | Prompt + check | length, pace, attention, device, age; **study goal (new)** |
| Number of blocks / sections | Code: `layoutLines` (minutes / 1.6) | Prompt (`lesson.sections`) | same, chunk size |
| Reading level, sentence length, new terms | Code + prompt, checked | Prompt, checked | vocabulary_ceiling, jargon_absorption, age, ESL |
| Examples per idea, worked steps, try-it items | Code + prompt (`workedExamples`, `examplesPerIdea`) | Prompt | example_density_need, worked-example dependence; **study goal (new)** |
| Interests in examples | Code (`exampleDomains`, share), item theme | Prompt, checked | interests, dislikes |
| Check questions: count, order of difficulty, format, hint, explanation size | Code (`layoutLines`, `questionShape`) | Code (`retrievalChecks`) + prompt | scaffolding, typed answers, feedback detail, challenge; **study goal (new)** |
| Hint size | Code (`hintInChecks`) + prompt | Prompt | scaffold, hint size |
| Hook / opening | **Not reached before this change** (`lesson.hook` was read only by the older writer) | Prompt | curiosity, story; **now wired** (`approachLines`) |
| Story frame, why-it-matters, big picture first, recaps | **Not reached before this change** | Prompt | story, relevance, big picture, recap; **now wired** |
| Order: rule first or case first | **Not reached before this change** (only per-subject wording lines) | Prompt | deductive and inductive trajectory, abstraction; **now wired** |
| Analogy used or avoided | **Not reached before this change** for built-in levels; reaches uploaded notes through `analogyGuard` | Prompt | analogical_transfer; **now wired** for lessons |
| Layout (table, step list) | **Not reached before this change** (numbered steps for math only) | Prompt | spatial_anchoring; **now wired** |
| Tone of feedback (gentle, low stakes) | Checkpoints only (`checkpointLines`); not in lesson blocks | Prompt | warmth, gentleness, evaluation anxiety |
| Pacing inside a session (breaks, session length) | Code: `daily-plan.js` reads `spec.session` | n/a | attention, session rhythm |
| What is skipped | Code: `learner-path.js` (placement units, proven objectives, Spanish goal fit); **study goal (new): extra practice levels** | n/a | prior knowledge, placement; **study goal** |
| What is stressed | Nothing from the learner reaches it: the key-fact list is the curriculum's, the same for everyone (a safe default) | same | none (see section 4) |

## 2. Reviews, checks and tests

| Part | What changes it today | Notes |
|---|---|---|
| Review spacing and target recall | Code: `spec.review.spacingScale`, `targetRecall` (retention path, material cards); retention goal (test date, horizon) in `retention-goal.js` | The only place memory-kind measures (retrieval_strength, decay_rate, retention_index) act, by design (03-M5): they never steer lesson text |
| Review question format | Typed-recall share (`review.typedRecall`) | prompt for generated questions |
| Uploaded-course tests | Code: `difficulty.startOffset`, `course.testScale`, `lesson.pace`, warm-up items | `material-test.js` |
| Mastery checkpoints | Presentation only by rule (answer format, rationale length, tone), never difficulty | by the owner's rule |

## 3. Uploaded-material courses

| Part | What changes it | Gap |
|---|---|---|
| Notes | Prompt + length limit (`notesWordLimit`, only for a learner who needs less) + analogy guard + one revision | Study goal (new) reaches it through the spec, live |
| Podcast | Prompt + check frequency + one revision | Study goal (new), live |
| Pack (cards, quiz mix) | Code: counts scale with `retrievalChecks` | Study goal (new), live |
| Skill lessons and questions | Written once at build with the builder's spec block (`course-builder.js`) | A goal chosen after the build does not rewrite already-written lessons; the path (what is set aside) and every later notes, podcast and pack do follow it |
| Order of skills | Prerequisite order, fixed; placement marks known skills | **Study goal (new): set aside skills with no dependants** |
| Placement, tiers, practice per skill | Code: `material-path.js` (pace, tier) | |

## 4. Measures that reach nothing, and parts no measure reaches

- Measures: none are dead in `SCORECARD-MAP.md` (the spec gives every one a lever). Three memory-kind measures (`retrieval_strength`, `decay_rate`, `retention_index`) reach review timing only, never lesson text, by the owner's 03-M5 rule. About two thirds of the spec's fields reach a writer only as a prompt sentence with no check behind them (the `prompt only` rows of the map): they change the text only if the writer follows them, which is why the proof below shows the text changed.
- Parts no measure reached before this work: the opening, story, recap, why-it-matters, big-picture, rule-or-case order, analogy and layout of the built-in level writer (wired now), and, for every route, the learner's own choice of how much they want. Still reached by nothing: which facts a learner's material stresses (heaviest-weight points come from the material's own emphasis), the number of levels in a grade except through placement, and the tutor's lesson length.

## 5. What was changed (this branch)

1. `services/study-goal.js` (+ route, page control, tests): a study goal per subject and per uploaded course, chosen next to the retention goal: **Full depth** (default, today's behaviour), **Core parts, fast**, **Ready for a test** (added because the audit found the practice mix and check frequency reach nothing a learner can choose). `STUDY_GOAL=off` restores today's behaviour; the goal is stored on the enrollment or material row, so account export and deletion already cover it.
2. Core: extra plain practice levels (the third and later of an objective) are set aside, read from `coverage.js`'s own objectives and level map; never a lesson, retention level, unit check, summary, checkpoint, review or the grade's last level. For a course, skills that no other skill needs and that do not end a unit. Lessons are written to about 55% of the words, one example, no story or recap, never fewer than three checks. The set-aside list is shown on the profile and the course page, each item can be brought back, and `Bring all back` is one click. The coverage gate is untouched.
3. `approachLines` in `services/block-adapt.js`: the stored hook, story, recap, why-it-matters, big-picture, order, analogy and layout fields now reach the built-in block writer (`BLOCK_APPROACH=off` removes them for comparison).

Not done: Spanish has no coverage level map, so core shortens its lessons but sets no levels aside (Spanish already has its own goal fit, which was not touched); a goal change does not rewrite lessons already stored; the tutor does not read the goal; a project-style goal was not built.

Proof numbers are in the report of the run that produced them (`docs/MODIFICATION-AUDIT.md` section 6). Everything there is SIMULATED learners judged by models, not a result on real people.

## 6. Proof (SIMULATED learners, AI-judged)

See the end of this file once the run completed; if the section is empty the run did not finish and the gate counts as not met (the goal ships off the gate's evidence).
