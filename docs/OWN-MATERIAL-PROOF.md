# Learn from your own material: proof

Branch `own-material-paths` (from `main`). Written 2026-10-29/30 by a Claude Code side session for item 0b of
`docs/yc/BACKLOG.md`. Every number below comes from a file the proof scripts wrote; how to rerun them is at the end.
Where something could not be proven, this says what was measured instead.

## Summary

- **What was built:** any upload (PDF, Word, text, paste) becomes a course of units, skills with prerequisites, and
  levels in the material's own order. Each learner then gets a path of their own:
  - placement over the skill graph, one question at a time, with a quick check of every skip;
  - three difficulty tiers inside each skill;
  - remediation that names the misunderstanding behind a wrong answer;
  - interleaved checks;
  - spaced review timed by a forgetting curve with this learner's own multiplier.
- **Six inputs built with the final code:**
  - MIT OCW 18.01 lecture notes (62-page PDF);
  - Strunk's *Elements of Style* (English);
  - a short notes paste;
  - the 18.01 syllabus alone (no content);
  - a Wells DOCX;
  - the 85-page US Constitution PDF.
- **Skill-map judge** (a model of a different family from the generator):
  - 18.01 lectures, Strunk, notes, syllabus and Wells score 4/5, with the source's order kept;
  - the only "invented" topics it named (2 for Strunk) were found in the skill's own passages when checked against their full text;
  - the 85-page constitution scores 2/5 (see limits).
- **Item checks** (two checkers from two more families):
  - planted wrong answers caught: 123 of 123 by checker A and 119 of 119 by checker B (100% each);
  - planted false lesson sentences caught: 23 of 23 by each checker;
  - real items passed: 323 of 328 by A (98%) and 320 of 320 by B (100%).
- **Simulated learners** (five profiles, 20 learners each, on each of the six courses). Steps to mastery, adaptive as a share of a fixed linear walk:
  - "knows the first half": 0.63 to 0.83;
  - "scattered gaps": 0.53 to 0.69;
  - "careless": 0.48 to 0.98 (0.50 to 0.72 counting learning steps only; its extra steps are reviews);
  - "knows nothing": 0.95 to 1.07 (parity);
  - "forgets fast": 0.81 to 1.11 (parity).
  - Placement's skips were right 86% to 100% of the time. Day-30 retention matched the linear walk with its own fixed review ladder.
- **Real UI** (Playwright, on a copy of the database on its own port): upload, build, placement, study and review all
  work at 375 px and at desktop width.
- **`npm test`:** passes (86 steps), with new tests for each new piece.
- **Not proven:** see "What is still not proven" below. In particular, the learner results come from simulation, not real learners.

## What was built

| Piece | File | What it does |
|---|---|---|
| Course builder v2 | `services/course-builder.js` | Text → passages with exact offsets. The outline is planned window by window (each window told the skills so far), in source order, at most one skill per 250 characters and 30 in all; forward prerequisite edges are dropped. Per skill: a lesson and 6 to 9 questions, each with a tier and, for multiple choice, the misconception behind each wrong choice. Choices are shuffled. Every quote is checked against its passage (exact, or a near-verbatim run of at least 70% that is replaced by the passage's own words), then a second model pass must say "supported". A skill that fails is generated once more before it is dropped. Skills build in parallel. A partial build resumes and keeps every edge. Topics a syllabus only names are taught from general knowledge and labelled as such. |
| Per-learner path | `services/material-path.js` (new, pure) | Graph placement: Gibbs belief plus expected-information-gain question choice, then a quick check of every skip. Tiers, pace (Elo over tiers), practice count, question picking, review interval (scorecard forgetting curve with the learner's multiplier) and slip-aware multiplier updates. |
| Study service | `services/material-study.js` | Step-by-step placement API. One recommended next step. Lessons with a few practice questions (only those can be practised: no key leaks for a placement or check question). Checks at the skill's tier with one interleaved earlier question. Remediation naming the misconception, which is cleared once answered right. Reviews of 2 questions per skill: 2/2 stretches the interval, 1/2 halves it, 0/2 reopens the skill. Counts the learner's steps. |
| Routes | `routes/materials.js` | `GET/POST /api/materials/:id/study/placement`, plus the existing study routes. |
| Pages | `public/js/my-material-study.js`, `public/js/my-material.js` | Path page: next-step card, units, levels, tiers, general-knowledge label. Placement one question at a time, with "I don't know". Lesson with remediation notes. Results with the misconception. Build progress ("12 of 30 skills ready"). Uses the existing CSS only. |
| Tests | `scripts/material-path-test.js` (new), `scripts/course-builder-test.js`, `scripts/material-study-test.js` | Each piece above, plus regression tests for every review finding. |
| Proof scripts | `scripts/material-proof-build.js`, `material-proof-check.js`, `material-learner-sim.js`, `material-proof-ui.js` | Build, independent checks with planted errors, simulated learners against a linear walk, and the Playwright run. |
| Mechanisms | `docs/OWN-MATERIAL-MECHANISMS.json` | 13 mechanisms with code locations, claims and sources, for evidence-article section 07. |

What is reused from the built-in engine, and what is not:
- **Reused:** the answer model of `services/adaptive-placement.js` (`assumed`); the forgetting curve of `services/scorecard/forgetting.js` (`recallAt`, its default curve); `typed-grading.preJudge`; the 75% pass mark; and the idea of an error tag that is kept on a miss and cleared on a right answer.
- **New, because a skill graph is not a grade line:** the graph belief and the question selection.
- **Not used yet:** the scorecard's fitted population curve and its learner estimate. The multiplier here moves by a simple step.

## Inputs

All inputs are public or written for the test. They are kept outside the repository (`C:\coding\savant-wt\_proof-inputs`) and never committed.

1. **MIT OCW 18.01 Single Variable Calculus, Fall 2006** (CC BY-NC-SA, personal test use): lecture notes for lectures 1-7, 9 and 10, merged into one 62-page PDF (42,896 characters extracted).
2. **English:** W. Strunk Jr., *The Elements of Style* (1918, Project Gutenberg #37134, public domain), as text (86,048 characters).
3. **A short notes paste** written for the test: 960 characters on cell energy.
4. **A messy syllabus with no content:** the 18.01 syllabus and calendar pages as text (7,443 characters: goals, logistics, and a session table of topics).
5. **A DOCX:** H. G. Wells, *A Short History of the World* (1922), chapters 1-6, made into a Word file (49,719 characters).
6. **A long PDF:** the US Constitution, GPO pocket edition, 85 pages (303,975 characters). The builder reads the first 120 passages (about 290,000 characters) and flags the rest as truncated.

## Results

### Builds

| Input | Kind | Size | Units | Skills (general) | Questions | Tiers 1/2/3 | MC with misconceptions | Dropped by checks | Build time | Generator |
|---|---|---|---|---|---|---|---|---|---|---|
| MIT OCW 18.01 lecture notes (PDF, lectures 1-7, 9, 10) | pdf, 62 pp | 42896 chars | 11 | 27 (0) | 159 | 58/54/47 | 114/118 (97%) | 68 ungrounded, 2 invalid, 0 unsupported, 0 skills, 2 skills retried | 576 s | standard-compute deepseek-v4.1-flash |
| Strunk, The Elements of Style (text) | text | 86048 chars | 14 | 28 (0) | 223 | 79/80/64 | 157/162 (97%) | 1 ungrounded, 2 invalid, 2 unsupported, 0 skills, 1 skills retried | 366 s | standard-compute deepseek-v4.1-flash |
| Short notes paste (written for the test) | paste | 960 chars | 2 | 4 (0) | 33 | 12/11/10 | 12/21 (57%) | 0 ungrounded, 0 invalid, 0 unsupported, 0 skills | 36 s | standard-compute deepseek-v4.1-flash |
| MIT OCW 18.01 syllabus and calendar only (no content) | text | 7443 chars | 4 | 29 (29) | 221 | 61/87/73 | 142/144 (99%) | 0 ungrounded, 10 invalid, 1 unsupported, 0 skills | 317 s | standard-compute deepseek-v4.1-flash |
| Wells, A Short History of the World ch. 1-6 (DOCX) | docx | 49719 chars | 10 | 28 (0) | 232 | 83/84/65 | 161/161 (100%) | 0 ungrounded, 0 invalid, 0 unsupported, 0 skills | 420 s | standard-compute deepseek-v4.1-flash |
| US Constitution, GPO pocket edition (long PDF) | pdf, 85 pp | 303975 chars | 14 | 23 (7) | 182 | 69/64/49 | 130/130 (100%) | 3 ungrounded, 0 invalid, 8 unsupported, 0 skills, text truncated at 120 passages | 538 s | standard-compute deepseek-v4.1-flash |

### Skill-map judge (second model against the source)

| Input | Score /5 | Order matches source | Invented topics | Important topics missing | Wrong prerequisites | Missing prerequisites | Source shown to judge |
|---|---|---|---|---|---|---|---|
| MIT OCW 18.01 lecture notes (PDF, lectures 1-7, 9, 10) | 4 | yes | 0 | 2 | 2 | 1 | the opening 1481 characters of each of 27 passages (37180 of 42896 characters) |
| Strunk, The Elements of Style (text) | 4 | yes | 2 | 2 | 5 | 2 | the opening 625 characters of each of 64 passages (40115 of 86048 characters) |
| Short notes paste (written for the test) | 4 | yes | 0 | 2 | 0 | 0 | whole text |
| MIT OCW 18.01 syllabus and calendar only (no content) | 4 | yes | 0 | 0 | 3 | 2 | whole text |
| Wells, A Short History of the World ch. 1-6 (DOCX) | 4 | yes | 0 | 0 | 1 | 2 | the opening 1290 characters of each of 31 passages (38746 of 49719 characters) |
| US Constitution, GPO pocket edition (long PDF) | 2 | no | 3 | 5 | 5 | 1 | the opening 254 characters of each of 157 passages (40918 of 303975 characters) |

### Item and lesson checkers, with planted errors

| Input | Skills checked | Real items passed by A | by B | by both | Planted wrong answers caught by A | by B | by either | Real lessons passed A/B | Planted lesson errors caught A/B |
|---|---|---|---|---|---|---|---|---|---|
| MIT OCW 18.01 lecture notes (PDF, lectures 1-7, 9, 10) | 8/27 | 42/42 (100%) | 42/42 (100%) | 42/42 (100%) | 18/18 (100%) | 18/18 (100%) | 18/18 (100%) | 4/4 , 4/4 | 4/4 , 4/4 |
| Strunk, The Elements of Style (text) | 8/28 | 60/61 (98%) | 53/53 (100%) | 52/61 (85%) | 22/22 (100%) | 18/18 (100%) | 22/22 (100%) | 4/4 , 3/4 | 4/4 , 4/4 |
| Short notes paste (written for the test) | 4/4 | 33/33 (100%) | 33/33 (100%) | 33/33 (100%) | 15/15 (100%) | 15/15 (100%) | 15/15 (100%) | 4/4 , 4/4 | 0/0 , 0/0 |
| MIT OCW 18.01 syllabus and calendar only (no content) | 8/29 | 60/60 (100%) | 60/60 (100%) | 60/60 (100%) | 17/17 (100%) | 17/17 (100%) | 17/17 (100%) | 2/2 , 2/2 | 6/6 , 6/6 |
| Wells, A Short History of the World ch. 1-6 (DOCX) | 8/28 | 67/68 (99%) | 68/68 (100%) | 67/68 (99%) | 25/25 (100%) | 25/25 (100%) | 25/25 (100%) | 3/4 , 4/4 | 4/4 , 4/4 |
| US Constitution, GPO pocket edition (long PDF) | 8/23 | 61/64 (95%) | 64/64 (100%) | 61/64 (95%) | 26/26 (100%) | 26/26 (100%) | 26/26 (100%) | 3/3 , 3/3 | 5/5 , 5/5 |
| **All** | | 323/328 (98%) | 320/320 (100%) | 315/328 (96%) | 123/123 (100%) | 119/119 (100%) | 123/123 (100%) | 20/21 , 20/21 | 23/23 , 23/23 |

### Simulated learners: MIT OCW 18.01 lecture notes (PDF, lectures 1-7, 9, 10) (27 skills, 20 learners per profile, 30 days, 40 steps a day)

| Profile | Placement questions | Skipped (truly known at start) | Skips that were right | Lessons on what they did not know | Steps to mastery, adaptive (learning + review) | Linear walk (learning + review) | Adaptive / linear | Adaptive fewer | Truly known at mastery A / L | Truly known day 30 A / L | Reviews | Mean interval (days) | Forgetting multiplier | Tier ups | Remediations (with a misconception named) | Interleaved questions |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| novice | 5.95 | 0 (0) | n/a | 1 | 394.25 (351.75 + 42.5) [20/20] | 384.05 (299.35 + 84.7) [20/20] | 1.03 (learning only 1.18) | 9/20 | 1 / 1 | 1 / 1 | 28.1 | 12.36 | 2.84 | 19 | 9.3 (8.7) | 34.9 |
| first_half | 28.1 | 12.45 (13) | 0.96 | 0.88 | 285.3 (224.6 + 60.7) [20/20] | 374 (286.3 + 87.7) [20/20] | 0.76 (learning only 0.79) | 20/20 | 0.99 / 1 | 0.99 / 1 | 28.95 | 12.35 | 2.88 | 11.2 | 6.7 (6.1) | 21.25 |
| scattered | 29 | 16.9 (20.25) | 0.92 | 0.59 | 243.1 (168.8 + 74.3) [20/20] | 354.85 (267.95 + 86.9) [20/20] | 0.69 (learning only 0.63) | 19/20 | 0.99 / 1 | 1 / 1 | 31.25 | 11.79 | 2.8 | 9.1 | 6.25 (5.4) | 16.35 |
| careless | 31.85 | 17.2 (22) | 0.99 | 0.32 | 468.16 (268.47 + 199.68) [19/20] | 490.3 (390.3 + 100) [20/20] | 0.97 (learning only 0.69) | 14/20 | 1 / 1 | 1 / 1 | 54.35 | 4.24 | 0.38 | 8.1 | 23 (20.95) | 32.6 |
| fast_forgetter | 24.4 | 8.3 (9) | 0.96 | 0.76 | 424.2 (329.4 + 94.8) [20/20] | 409 (316.8 + 92.2) [20/20] | 1.04 (learning only 1.04) | 6/20 | 0.96 / 0.96 | 0.92 / 0.91 | 36 | 7.39 | 1.27 | 21.15 | 19.85 (18.85) | 38.55 |

Path difference (share of lessons not shared, same seed): novice vs first_half 0.41; novice vs scattered 0.55; novice vs careless 0.4; novice vs fast_forgetter 0.12; first_half vs scattered 0.57; first_half vs careless 0.44; first_half vs fast_forgetter 0.35; scattered vs careless 0.61; scattered vs fast_forgetter 0.55; careless vs fast_forgetter 0.4.

### Simulated learners: Strunk, The Elements of Style (text) (28 skills, 20 learners per profile, 30 days, 40 steps a day)

| Profile | Placement questions | Skipped (truly known at start) | Skips that were right | Lessons on what they did not know | Steps to mastery, adaptive (learning + review) | Linear walk (learning + review) | Adaptive / linear | Adaptive fewer | Truly known at mastery A / L | Truly known day 30 A / L | Reviews | Mean interval (days) | Forgetting multiplier | Tier ups | Remediations (with a misconception named) | Interleaved questions |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| novice | 5.55 | 0 (0) | n/a | 1 | 411.1 (367.8 + 43.3) [20/20] | 417.55 (327.15 + 90.4) [20/20] | 0.99 (learning only 1.13) | 10/20 | 1 / 1 | 1 / 1 | 27.55 | 12.74 | 2.75 | 19.45 | 8.6 (8.4) | 35.35 |
| first_half | 30.25 | 12.25 (14) | 0.94 | 0.81 | 295.45 (235.35 + 60.1) [20/20] | 395.85 (305.55 + 90.3) [20/20] | 0.75 (learning only 0.78) | 20/20 | 1 / 1 | 1 / 1 | 28.55 | 12.31 | 2.83 | 12.25 | 5.95 (5.75) | 21.7 |
| scattered | 28.25 | 17.45 (20.85) | 0.94 | 0.58 | 251.7 (176.5 + 75.2) [20/20] | 396.75 (304.65 + 92.1) [20/20] | 0.64 (learning only 0.58) | 20/20 | 0.99 / 1 | 1 / 1 | 30.3 | 11.98 | 2.93 | 8.75 | 5.6 (5.25) | 16.15 |
| careless | 28.45 | 16.75 (23) | 0.98 | 0.26 | 541.16 (323.89 + 217.26) [19/20] | 575.4 (454.5 + 120.9) [20/20] | 0.95 (learning only 0.72) | 13/20 | 1 / 1 | 0.99 / 1 | 57.4 | 3.82 | 0.15 | 9 | 26.4 (25.05) | 37.3 |
| fast_forgetter | 29.55 | 6.45 (9) | 0.95 | 0.76 | 470.4 (375.7 + 94.7) [20/20] | 427.4 (333 + 94.4) [20/20] | 1.11 (learning only 1.14) | 6/20 | 0.97 / 0.97 | 0.94 / 0.95 | 35.5 | 7.75 | 1.42 | 20.25 | 18.9 (18.25) | 40.45 |

Path difference (share of lessons not shared, same seed): novice vs first_half 0.39; novice vs scattered 0.55; novice vs careless 0.36; novice vs fast_forgetter 0.1; first_half vs scattered 0.62; first_half vs careless 0.48; first_half vs fast_forgetter 0.34; scattered vs careless 0.64; scattered vs fast_forgetter 0.57; careless vs fast_forgetter 0.38.

### Simulated learners: Short notes paste (written for the test) (4 skills, 20 learners per profile, 30 days, 40 steps a day)

| Profile | Placement questions | Skipped (truly known at start) | Skips that were right | Lessons on what they did not know | Steps to mastery, adaptive (learning + review) | Linear walk (learning + review) | Adaptive / linear | Adaptive fewer | Truly known at mastery A / L | Truly known day 30 A / L | Reviews | Mean interval (days) | Forgetting multiplier | Tier ups | Remediations (with a misconception named) | Interleaved questions |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| novice | 2.5 | 0.05 (0) | 0 | 1 | 59.95 (57.25 + 2.7) [20/20] | 58.65 (52.65 + 6) [20/20] | 1.07 (learning only 1.14) | 8/20 | 1 / 1 | 1 / 1 | 12.65 | 8.23 | 1.22 | 2.95 | 1.85 (0.7) | 4.55 |
| first_half | 4.4 | 2 (2) | 0.92 | 0.87 | 29.25 (28.75 + 0.5) [20/20] | 48.95 (44.55 + 4.4) [20/20] | 0.63 (learning only 0.67) | 19/20 | 0.94 / 1 | 1 / 1 | 13.3 | 7.6 | 1.3 | 1.6 | 0.95 (0.45) | 2.95 |
| scattered | 4.4 | 2.5 (3.3) | 0.99 | 0.53 | 20.85 (20.65 + 0.2) [20/20] | 40.25 (38.25 + 2) [20/20] | 0.53 (learning only 0.54) | 18/20 | 0.99 / 1 | 1 / 1 | 12.55 | 7.82 | 1.6 | 0.7 | 0.25 (0.15) | 1.75 |
| careless | 4.1 | 2.95 (4) | 1 | 0 | 25.1 (23.9 + 1.2) [20/20] | 58.55 (52.65 + 5.9) [20/20] | 0.48 (learning only 0.5) | 16/20 | 1 / 1 | 1 / 1 | 19.45 | 3.56 | -0.5 | 1.55 | 3.05 (1.15) | 3.9 |
| fast_forgetter | 3.65 | 1 (1) | 0.96 | 0.86 | 39.35 (38.35 + 1) [20/20] | 52.4 (47.7 + 4.7) [20/20] | 0.81 (learning only 0.85) | 17/20 | 0.95 / 0.99 | 0.96 / 0.93 | 13.45 | 6.74 | 0.72 | 3.15 | 2.05 (1) | 4.9 |

Path difference (share of lessons not shared, same seed): novice vs first_half 0.43; novice vs scattered 0.6; novice vs careless 0.48; novice vs fast_forgetter 0.11; first_half vs scattered 0.6; first_half vs careless 0.58; first_half vs fast_forgetter 0.4; scattered vs careless 0.7; scattered vs fast_forgetter 0.63; careless vs fast_forgetter 0.49.

### Simulated learners: MIT OCW 18.01 syllabus and calendar only (no content) (29 skills, 20 learners per profile, 30 days, 40 steps a day)

| Profile | Placement questions | Skipped (truly known at start) | Skips that were right | Lessons on what they did not know | Steps to mastery, adaptive (learning + review) | Linear walk (learning + review) | Adaptive / linear | Adaptive fewer | Truly known at mastery A / L | Truly known day 30 A / L | Reviews | Mean interval (days) | Forgetting multiplier | Tier ups | Remediations (with a misconception named) | Interleaved questions |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| novice | 4.95 | 0.05 (0) | 0 | 1 | 428.45 (387.15 + 41.3) [20/20] | 432.2 (335.7 + 96.5) [20/20] | 1 (learning only 1.16) | 14/20 | 1 / 1 | 1 / 1 | 26.75 | 13.91 | 2.79 | 18.95 | 10.25 (9.95) | 37.9 |
| first_half | 27.8 | 12.05 (14) | 0.99 | 0.86 | 300.4 (241.5 + 58.9) [20/20] | 411.5 (316.8 + 94.7) [20/20] | 0.73 (learning only 0.76) | 20/20 | 1 / 1 | 1 / 1 | 28.25 | 12.75 | 2.9 | 11.5 | 5.05 (4.8) | 21.95 |
| scattered | 30.5 | 18.85 (21.7) | 0.95 | 0.6 | 247.2 (169.7 + 77.5) [20/20] | 411.75 (318.15 + 93.6) [20/20] | 0.6 (learning only 0.53) | 20/20 | 1 / 1 | 0.99 / 1 | 31.15 | 12.16 | 2.91 | 8.25 | 5.55 (5.4) | 15.7 |
| careless | 30.8 | 19.05 (24) | 0.99 | 0.3 | 556 (311.6 + 244.4) [20/20] | 575.95 (458.55 + 117.4) [20/20] | 0.98 (learning only 0.69) | 10/20 | 1 / 1 | 1 / 1 | 57.05 | 4.08 | 0.45 | 8.3 | 23.9 (22.95) | 33.85 |
| fast_forgetter | 22.55 | 8.15 (9) | 0.98 | 0.8 | 458.05 (363.45 + 94.6) [20/20] | 446.35 (344.25 + 102.1) [20/20] | 1.03 (learning only 1.06) | 8/20 | 0.96 / 0.96 | 0.93 / 0.95 | 36.2 | 8.83 | 1.73 | 20.5 | 19.85 (19.15) | 40.65 |

Path difference (share of lessons not shared, same seed): novice vs first_half 0.39; novice vs scattered 0.57; novice vs careless 0.4; novice vs fast_forgetter 0.13; first_half vs scattered 0.64; first_half vs careless 0.48; first_half vs fast_forgetter 0.32; scattered vs careless 0.64; scattered vs fast_forgetter 0.58; careless vs fast_forgetter 0.44.

### Simulated learners: Wells, A Short History of the World ch. 1-6 (DOCX) (28 skills, 20 learners per profile, 30 days, 40 steps a day)

| Profile | Placement questions | Skipped (truly known at start) | Skips that were right | Lessons on what they did not know | Steps to mastery, adaptive (learning + review) | Linear walk (learning + review) | Adaptive / linear | Adaptive fewer | Truly known at mastery A / L | Truly known day 30 A / L | Reviews | Mean interval (days) | Forgetting multiplier | Tier ups | Remediations (with a misconception named) | Interleaved questions |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| novice | 4.4 | 0 (0) | n/a | 1 | 415.3 (372.2 + 43.1) [20/20] | 430.65 (337.95 + 92.7) [20/20] | 0.97 (learning only 1.11) | 11/20 | 1 / 1 | 1 / 1 | 27.3 | 13.03 | 2.82 | 19.2 | 9.25 (9.05) | 36.05 |
| first_half | 23.2 | 12.6 (14) | 0.98 | 0.86 | 300.85 (237.05 + 63.8) [20/20] | 389.35 (299.25 + 90.1) [20/20] | 0.78 (learning only 0.8) | 18/20 | 1 / 1 | 1 / 1 | 29.3 | 12.31 | 2.9 | 11.1 | 6.9 (6.6) | 22.25 |
| scattered | 31.55 | 17.75 (20.85) | 0.94 | 0.59 | 258.8 (181.6 + 77.2) [20/20] | 396.15 (305.55 + 90.6) [20/20] | 0.65 (learning only 0.6) | 20/20 | 0.99 / 1 | 0.99 / 1 | 32.15 | 12.05 | 2.94 | 8.9 | 6.3 (6.1) | 16.55 |
| careless | 31.2 | 18.3 (23) | 0.99 | 0.32 | 468.95 (271.47 + 197.47) [19/20] | 559.45 (444.15 + 115.3) [20/20] | 0.85 (learning only 0.62) | 14/20 | 1 / 1 | 1 / 1 | 52.9 | 4.35 | 0.73 | 7.7 | 20.4 (19.6) | 29.95 |
| fast_forgetter | 17.9 | 8.1 (9) | 0.99 | 0.77 | 437.75 (340.85 + 96.9) [20/20] | 417 (321.3 + 95.7) [20/20] | 1.05 (learning only 1.07) | 8/20 | 0.97 / 0.96 | 0.93 / 0.93 | 37 | 7.92 | 1.41 | 21.7 | 20.05 (19.7) | 39.8 |

Path difference (share of lessons not shared, same seed): novice vs first_half 0.41; novice vs scattered 0.55; novice vs careless 0.42; novice vs fast_forgetter 0.12; first_half vs scattered 0.59; first_half vs careless 0.51; first_half vs fast_forgetter 0.37; scattered vs careless 0.65; scattered vs fast_forgetter 0.57; careless vs fast_forgetter 0.42.

### Simulated learners: US Constitution, GPO pocket edition (long PDF) (23 skills, 20 learners per profile, 30 days, 40 steps a day)

| Profile | Placement questions | Skipped (truly known at start) | Skips that were right | Lessons on what they did not know | Steps to mastery, adaptive (learning + review) | Linear walk (learning + review) | Adaptive / linear | Adaptive fewer | Truly known at mastery A / L | Truly known day 30 A / L | Reviews | Mean interval (days) | Forgetting multiplier | Tier ups | Remediations (with a misconception named) | Interleaved questions |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| novice | 5.8 | 0.2 (0) | 0 | 1 | 327.75 (295.15 + 32.6) [20/20] | 347.5 (277.2 + 70.3) [20/20] | 0.95 (learning only 1.07) | 14/20 | 1 / 1 | 1 / 1 | 27.3 | 12.5 | 2.77 | 16.5 | 6.7 (6.65) | 28.45 |
| first_half | 24.95 | 9.6 (11) | 0.92 | 0.84 | 256.95 (209.15 + 47.8) [20/20] | 311.1 (240.3 + 70.8) [20/20] | 0.83 (learning only 0.87) | 19/20 | 1 / 1 | 1 / 1 | 27.9 | 12.64 | 2.85 | 10.15 | 5.55 (5.55) | 18.95 |
| scattered | 25.2 | 16 (17.45) | 0.95 | 0.6 | 191.25 (125.75 + 65.5) [20/20] | 314.65 (244.35 + 70.3) [20/20] | 0.61 (learning only 0.51) | 20/20 | 0.99 / 1 | 1 / 1 | 29.7 | 11.75 | 2.86 | 6.75 | 4.65 (4.6) | 11.65 |
| careless | 23.4 | 14.3 (19) | 0.97 | 0.29 | 397.45 (231.85 + 165.6) [20/20] | 444.75 (363.15 + 81.6) [20/20] | 0.9 (learning only 0.64) | 13/20 | 1 / 1 | 1 / 1 | 49.5 | 4.13 | 0.37 | 7.3 | 17.5 (17.2) | 26.1 |
| fast_forgetter | 24.4 | 6.85 (7) | 0.86 | 0.82 | 346.05 (279.45 + 66.6) [20/20] | 339.3 (265.5 + 73.8) [20/20] | 1.02 (learning only 1.06) | 9/20 | 0.96 / 0.96 | 0.91 / 0.94 | 32.75 | 7.99 | 1.47 | 17.6 | 15.7 (15.5) | 31.85 |

Path difference (share of lessons not shared, same seed): novice vs first_half 0.37; novice vs scattered 0.6; novice vs careless 0.39; novice vs fast_forgetter 0.15; first_half vs scattered 0.63; first_half vs careless 0.45; first_half vs fast_forgetter 0.3; scattered vs careless 0.69; scattered vs fast_forgetter 0.61; careless vs fast_forgetter 0.41.

### Reading the per-profile numbers

- **"Skipped" and "skips that were right":** how many skills placement skipped, and the share the learner really knew at the start. "Lessons on what they did not know" is the share of lessons opened on skills the learner did not know at the start.
- **Steps:** a step is a lesson opened or a question answered. "Learning + review" splits steps to mastery into learning work and reviews done before the last skill was mastered. The linear walk reads every lesson in order, answers 3 practice questions, takes a 5-question check, repeats until it passes, and reviews each skill on a fixed 1/3/7/14/30-day ladder.
- **"Truly known":** read from the simulated learner's hidden state, not from the app.
- **Path difference:** the share of lessons two profiles' learners (same seed) do not share. A different path for each profile shows here.
- **Spaced review:** "Reviews", "Mean interval" and "Forgetting multiplier" show it being scheduled and adapted. The careless profile's multiplier stays near the others' because slips are read against the learner's own accuracy on skills just mastered. The fast forgetter's is lower, so it gets shorter intervals.
- **Tiers:** "Tier ups" counts perfect checks that moved a skill up a tier (harder after mastery). Reviews always ask tier 2 or above. "Remediations" counts remediation lessons, and how many named a misconception from the learner's own wrong choice.

## UI runs (real app, copy of the database, own port, Playwright)

- **Phone, 375 px** (notes paste, built through the app's own NVIDIA learner path):
  - Final run, after all fixes: sign-up, paste upload, and a build through the app's own NVIDIA learner path. The build took 1,334 s (4 skills in 2 units, ready) under the NVIDIA limit.
  - Placement took 5 questions and showed "You already know (2)" and "To learn (2)". Lesson practice feedback quoted the learner's own notes. The check scored 5 of 5 (mastered, next review in 1 day). After review dates were moved forward in the copy database, the review showed 3 skills due and 6 questions.
  - No sideways scroll at 375 px, and no page errors.
  - An earlier run before the review fixes also passed every step (3 skills, 142 s, with the NVIDIA limit not yet set).
- **Desktop, 1280 px** (MIT 18.01 Lecture 1 notes, 6-page PDF):
  - Upload worked, and the app's build ran through the real UI and providers.
  - Under the NVIDIA limit set for this proof (two calls in flight, no Nemotron Ultra, so the live tutor keeps its share), it reached 9 of 10 skills before the test's 60-minute clock stopped it.
  - The same account was then signed back into, and placement (4 questions), lesson and practice feedback, the check (5 of 5, mastered, next review in 1 day) and the review all passed. No sideways scroll, no page errors.
  - An earlier desktop run on the full 62-page PDF failed to build at all on the free tier in 58 minutes (see limits).
- **Screenshots:** `docs/own-material-proof/`.

## Checkers and the planted-error test

- **The skills checked:** for each course, up to 8 skills are sampled (all of them for a course with fewer). Each checker sees the skill's passages, the lesson and the questions (marked answer, explanation, quote).
- **The planted errors:** about 30% of the items are copied with a wrong marked answer, and about half of the lessons get one false sentence (a key point negated). These are mixed in unlabelled.
- **Generator:** DeepSeek V4.1 Flash on Standard Compute, for the six final builds (see "Paid use").
- **Checker A:** Modelflare GPT 6.1 Sol; GPT 6.1 Terra for Strunk's final round, after the owner's Modelflare credit ran low (Terra is half Sol's price).
- **Checker B:** Mistral Large (xKiro Mistral Large 2512 for the first rounds; NVIDIA Mistral Large 4 for the final round, after xKiro's daily allowance was spent).
- **Skill-map judge:** Modelflare GPT 6.1 Sol for 18.01, the notes, the syllabus and Wells; GPT 6.1 Terra for Strunk and the constitution. xKiro Qwen 3.8 Max judged the first rounds until the allowance ran out; its scores for 18.01 and the notes were 3 and 4. The 18.01 "order" complaint in that round came from the checker grouping skills by unit, not from the course (fixed).
- **The judge's limited view:** for a long text it sees only the opening of each passage. So each topic it calls "invented" in a skill is checked again against the full text of that skill's own passages (the second stage, used with Terra). 0 of 2 such claims held for Strunk and 0 of 3 for the constitution.
- **Every checker is a different model family from the generator.**
- **An earlier round's checks are not counted:** a bug in the checker (passage offsets) showed checkers the wrong text. It was fixed in the builder and the checker.

## Paid use (owner allowed Standard Compute and the Anthropic key where it matters; costs logged here)

| Service | What it bought | Cost |
|---|---|---|
| Standard Compute, DeepSeek V4.1 Flash (inside `services/standard-compute-ledger.js`) | Seven final course builds ($1.71: six, plus the Strunk rebuild) and earlier attempts that were stopped or fixed (early builds, checker A before it moved to Sol) | about $2.41 in all. The shared ledger went from $1.94 to $4.06 during the builds, plus $0.29 for the Strunk rebuild. It now reads $5.00 of the $20 cap, with other sessions' use included. |
| Modelflare GPT 6.1 Sol and GPT 6.1 Terra (budget set on the key) | Checker A and the skill-map judge, for about 13 rounds of course checks. Switched to Terra when the key had about $0.20 left | not metered here (the key's own budget applies) |
| Anthropic / FACT_CHECK key | not used | $0 |
| OpenRouter | not used (keys blanked in every proof process) | $0 |

Free use:
- **NVIDIA:** the app's own learner path in both UI runs and the earlier free builds; checker B in the final round.
- **xKiro:** about 130,000 tokens from this worktree, on public inputs only. Every proof script refuses a course not marked `--public`.

## Independent review (fresh agent, given only the diff and the brief)

| # | Finding | What was done |
|---|---|---|
| 1 | Quotes in non-Latin scripts were always dropped (letters/digits check was a-z only) | Unicode letters and digits; test with Cyrillic quotes and topic lines |
| 2 | Resuming a partial build could lose a prerequisite edge for good | Edges are rebuilt from the outline on every build; test where the prerequisite's model fails first |
| 3 | `/study/practice` returned the key for any question of an open skill, including the pending placement or check question | Only questions the lesson handed out as practice, never one that is open in a placement or check; tests |
| 4 | Misconceptions were never cleared | Kept with their question and cleared when it is answered right; test |
| 5 | "1 of 2 brings it back tomorrow" no longer true (it halves the interval) | UI, mechanisms and test now say and check halving (8 days to 4) |
| 6 | Reuse of the built-in engine was overstated | Header comment and mechanisms now say exactly what is reused and what is new |
| 7 | The outline cuts a window's extra topics silently, though the commit said "covers to the end" | Stated plainly in the mechanisms (the model is told to merge; the code keeps the window's share) |
| 8 | A resumed course was unstudyable while rebuilding, and a build that died stayed locked | A course with skills stays studyable while building; a dead build with skills shows as partial |
| 9 | Wrong line ranges in the mechanisms file | Regenerated from the code |
| 10 | Mechanisms said 350 characters per skill; code says 250 | Fixed |
| 11 | "Partly known" screen said all start a step up (only those at or above 0.5 do) | Wording fixed |
| 12 | Four tests could not fail | Rewritten so each one can fail |
| 13 | Proof scripts would send any file to pipeline-only checkers | Build needs `--public`; the checker refuses any course not marked public |

After the fixes: `npm test` passed (86 steps), and the phone and desktop UI proofs were rerun (results above).

## Other bugs found by the proof itself (all fixed, with tests)

- **Right answer first:** the generator put the right answer first in every multiple-choice question; choices are now shuffled.
- **Remediation loop:** after a failed check the path never offered the check again.
- **Wrong passage offsets:** these misled the first round of checkers.
- **Cut-off answers:** a lesson answer cut off by reasoning tokens, or missing one `tier`, was rejected whole.
- **Skill cap:** one skill per 1,500 characters made a four-topic note a one-skill course (judge score 2).
- **Syllabus stopped early:** the syllabus outline stopped at session 28 of 39.
- **Slips read as forgetting:** a careless learner's slips counted as forgetting (intervals shrank to about 2 days); review now uses the learner's own accuracy on skills just mastered.
- **Interleaved answers ignored:** a right interleaved answer did not count as that skill's review.
- **Long outlines timed out:** a long text's single outline call timed out; the outline is now planned in windows.

## What is still not proven

1. **No real learners.** All per-learner results are simulated learners driving the real study code. The learner model (slip rates, half-lives, learning chances) is an assumption, and the comparison is only as good as it. Real learners may behave differently.
2. **"Optimal" is not proven.** What was measured is:
   - fewer steps than a fixed linear walk for learners with prior knowledge (about 0.6 to 0.8 of the steps);
   - parity for novices and fast forgetters, where placement and interleaving cost what they save under this learner model;
   - the same 30-day retention as a linear walk with its own fixed reviews.

   No other adaptive method was compared.
3. **Item correctness is checked by models, not people.** Two independent model families caught every planted wrong answer (123/123 and 119/119) and passed 98% and 100% of real items. Planted errors are of one kind (a wrong marked answer, a negated lesson sentence); subtler errors may be missed. Only 8 skills per course were sampled.
4. **Coverage of very long documents.** The 85-page constitution is capped at 30 skills and its first 120 passages, so a 7-article, 27-amendment document cannot be covered skill for skill.
   - The final judge gave it 2/5 (an earlier judge gave 3/5): 5 areas missing and order changes among the amendments.
   - Its 3 "invented" claims were not borne out by the full passages.
   - Long books need more than one course or a larger cap; neither is built.
5. **An outline window that fails three times is left out silently.**
   - The first Strunk build lost its opening window (the introduction and rules 1 to 9) after two tries, and the judge scored it 2/5.
   - The rebuild with three tries covers rules 1 to 18 in order and scores 4/5.
   - The builder still does not tell the learner when a window was lost, and does not re-plan it on resume.
6. **The free tier is too slow for large uploads under the current NVIDIA limits.** With two calls in flight and no Nemotron Ultra (the share left for the live tutor), the app's own build took over 60 minutes for a 6-page PDF and failed in 58 minutes for the 62-page one. The proof builds used Standard Compute ($0.03 to $0.27 a course, 1 to 10 minutes). The app does not use it for learners: it is pipeline-only and learner text may not go to it. Until a learner-class provider with more capacity is approved, large uploads will be slow or partial for real users. A partial course is studyable, and "Make a course" again finishes it.
7. **Maths PDFs lose questions.** Formula extraction from PDFs is noisy. In the 18.01 build, 68 questions were dropped as ungrounded even with near-verbatim matching (27 skills, 159 questions remained).
8. **Not done yet:**
   - photos, URLs, slides and video as inputs;
   - feeding own-material skills into the built-in retention enforcers;
   - the typed-answer model judges (only the free certain checks grade short answers);
   - a learner-visible map of prerequisites.
9. **Not tested:** screen readers and keyboard-only use of the new pages.

## Follow-ups (not done here)

- `config/db.js`: one failed file rename (EPERM on Windows, here from another process reading the file) crashes the server. A short retry would avoid that.
- A learner-class provider with capacity for course builds, so uploads build in minutes for real users (owner decision on cost and consent).
- Courses longer than about 120 passages: split into several linked courses rather than truncate.
- Outline windows that fail every try: mark the course partial, say which part is missing, and re-plan just that window when "Make a course" is pressed again.

## How to rerun

Read `_proof-inputs/env.sh` first: it blanks every paid key except the ones named, caps NVIDIA, and pins the build models.

```bash
source ../_proof-inputs/env.sh
DB_FILE=<copy of db.json> STANDARD_COMPUTE_PIPELINE=1 node -r dotenv/config scripts/material-proof-build.js --public --llm sc --file <input> --out <dir>
PROOF_JUDGE=sol PROOF_CHECK_B=mistralai/mistral-large-4-1t-a52b XKIRO_PIPELINE=1 node -r dotenv/config scripts/material-proof-check.js --course <dir>/<name>.course.json --text <dir>/<name>.text.txt --out <dir> --skills 8
node scripts/material-learner-sim.js --course <dir>/<name>.course.json --seeds 20 --out <dir>/<name>.sim.json
PROOF_DB=<copy of db.json> NODE_PATH=<playwright> node scripts/material-proof-ui.js --phone-paste <notes.txt> --desktop-file <pdf> --shots <dir>
```

The raw outputs (course files, check files, simulation files, logs, screenshots) are in `C:\coding\savant-wt\_proof-out`, outside the repository.
