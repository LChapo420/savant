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

1. `services/study-goal.js` (+ route, page control, tests): a study goal per subject and per uploaded course, chosen next to the retention goal: **Full depth** (default, today's behaviour), **Core parts, fast**, **Ready for a test** (added because the audit found the practice mix and check frequency reach nothing a learner can choose). `STUDY_GOAL=off` restores today's behaviour (and core needs `STUDY_GOAL_CORE=on`, off by default); the goal is stored on the enrollment or material row, so account export and deletion already cover it.
2. Core: extra plain practice levels (the third and later of an objective) are set aside, read from `coverage.js`'s own objectives and level map; never a lesson, retention level, unit check, summary, checkpoint, review or the grade's last level. For a course, skills that no other skill needs and that do not end a unit. Lessons are written to about 55% of the words, one example, no story or recap, never fewer than three checks. The set-aside list is shown on the profile and the course page, each item can be brought back, and `Bring all back` is one click. The coverage gate is untouched.
3. `approachLines` in `services/block-adapt.js`: the stored hook, story, recap, why-it-matters, big-picture, order, analogy and layout fields now reach the built-in block writer (`BLOCK_APPROACH=off` removes them for comparison).

Update 6 Nov: core is now OFF by default (`STUDY_GOAL_CORE`), approach lines are OFF by default (`BLOCK_APPROACH`), Spanish core sets aside its repeat-drill rows (Game, Speaking Game; 8.4% of Spanish levels) from the coverage map's own level kinds, and the tutor is told each non-default goal (`study-goal.tutorLines`). Still not done: a goal change does not rewrite lessons already stored; a project-style goal was not built.

Proof numbers are in the report of the run that produced them (`docs/MODIFICATION-AUDIT.md` section 6). Everything there is SIMULATED learners judged by models, not a result on real people.

## 6. Proof (SIMULATED learners, AI-judged; not a result on real people)

Raw files: `_out/sg3/` of the savant-wt folder (core-runA-glm-gemini.json, approach.json; run B if present). Script: `scripts/study-goal-proof.js`. Writer: Coral DeepSeek V4.1 Flash through the real block writer. Held-out seeds 919191 (core) and 919192 (approach); extreme learners drawn by `scripts/lib/extreme-learners.js` (tails, contradictory mixes, ages 8-70, English learners). Subjects: math, English, IQ, Spanish.

Changes since the 5 Nov run: the core questions are written from the course's own objective text before either version exists; the answerer sees one version only; GLM-5.3 judge gets a 24000-token cap (it returned empty text at 6000) and every judge call is retried; a pair whose answers or grades cannot be read is dropped and counted as UNSCORED (never scored zero); grades are read in whatever JSON shape the grader uses; the writer is retried when it returns an unusable reply; approach pairs are written in two phases, because the earlier run flipped a process-wide switch under concurrency.

Bug found and fixed: core's old floors (120 words, 3 minutes) RAISED the budget of a short-attention or young learner whose full-depth budget was already lower, so the worst learners got more words. The core budget is now never above the learner's own full-depth number, and a core lesson over its budget (not 1.3x) is sent back once.

### Core parts, fast (run A: judges GLM-5.3 + Gemini 3.5 Flash Lite, n=80 drawn, 25 scored)
Gemini's free quota ran out mid-run: 53 of 80 pairs are unscored, so only 25 learners are in the numbers. That is too few to turn the goal on.

| Measure | Gate | Result |
|---|---|---|
| Words, mean over scored learners | at least 25% fewer | 27.2% fewer (worst 10%: 8.4% fewer; worst 5%: 3.2%; worst 1%: 1.5% MORE; 1 of 25 learners got more words) |
| Core-question answerability, GLM answers/grades | not lower | full 0.647, core 0.727 (diff +0.08, 95% CI -0.03 to +0.20) |
| Same, Gemini | not lower | full 0.647, core 0.733 (diff +0.09, CI -0.02 to +0.21) |
| Worst-learner answerability drop | report | worst 1%: 0.50; 5%: 0.33; 10%: 0.17 (one learner in ten loses a sixth of the questions) |
| Blind pick of the core version | report | 18 of 20 real pairs; planted identical pairs 5 of 5 TIE |
| Words by learner type | report | young 16%, old 10%, contradictory 22%, tail-high 34%, tail-low 38% fewer: the old and young learners fall short of 25% |

Hours: levels set aside are 45-47% of math, English and IQ levels and 8.4% of Spanish levels (the Spanish repeat drills only); lesson minutes fall from 5.4 to 4.3 per level. With fewer levels the same grade is about 0.5 of the full-depth time. That is not 4x.

### Lesson-opening and order lines (approach), 40 learners, 31 real pairs, 8 planted
The line with the lines on was picked 11 times, the line with them off 19 times, TIE once (chance is half). Planted identical pairs: 8 of 8 TIE. Both versions taught the same facts in 28 of 39 scored pairs. This does not beat chance, so the lines are OFF by default (`BLOCK_APPROACH=on` enables them).

### 6 Nov evening: held-out seed 929291, 80 learners drawn, judges GLM-5.3 (zai) + Grok 4.3 (xai), 8 questions written from the objective alone before either version

Run B of the morning (GLM + Nemotron) was stopped: NVIDIA's free tier throttled it past two hours. Judges were then chosen for allowance (both on credit ledgers, no free-tier quota), and only 5 of 80 core pairs were unscored.

Core (75 scored; changes: core and test keep every key point stated outright at 70% of its terms, an explicit line that each coverage point is asked about):
- Words 25.8% fewer (gate 25%: passes by a hair). Worst 10% of learners 6.2% fewer; worst 5% 31% MORE; worst 1% 86% MORE; 6 of 75 learners got more words than full depth. By type: young 18%, old 16%, contradictory 17%, tail-low 20% fewer (all under 25%); random 37%, tail-both 35%.
- Answerability: GLM full 0.882, core 0.845 (diff -0.037, CI -0.062 to -0.013); Grok full 0.790, core 0.782 (diff -0.008, CI -0.045 to +0.025). Worst 10% / 5% / 1% drop: GLM 0.125 / 0.25 / 0.375; Grok 0.25 / 0.375 / 0.375. Gate (not lower; worst 10% within 0.10): FAILS. Blind pick of core 52 of 60; planted 15 of 15 TIE.
- Core stays OFF.

Ready for a test (80 scored, no unscored; gate: exam-style answerability not lower overall, worst 10% of learners lose at most 0.10):
- Overall diff 0.000 for both judges (GLM 0.702 vs 0.702, CI -0.042 to +0.041; Grok 0.673 vs 0.673, CI -0.048 to +0.045). Worst 10% / 5% / 1% drop: GLM 0.25 / 0.375 / 0.50; Grok 0.25 / 0.25 / 0.50. Worst-10% gate FAILS.
- Words only 3.8% fewer, so the goal barely changes the text (blind pick 37 of 64, planted 16 of 16 TIE). A note on the gate: with 8 questions and one written sample per version, a learner can lose 2 questions to writing variance alone. No full-versus-full control was run, so how much of the worst-10% loss is noise is unmeasured; the gate was not loosened.
- Test goal stays OFF (`STUDY_GOAL_TEST=on` enables it).

### Defaults after this run
- Core: OFF (`STUDY_GOAL_CORE=on` enables it). Fails the answerability and worst-10% gates on 75 scored learners (above).
- Approach lines: OFF.
- Ready for a test: OFF (`STUDY_GOAL_TEST=on`). With both off only Full depth exists and the profile and My material pickers are not shown.
