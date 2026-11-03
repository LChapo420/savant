# Spanish depth (package D), 2-3 Nov 2026

Every number below is labelled **SIMULATED** (simulated learners with a known true level, the app's own code), **AI-JUDGED** (a model was
the judge) or **COUNT** (a plain count of files). None is a measurement of a real learner.

## 1. Within-grade placement

`content/unit-placement/spanish.json` had 8 grades with 1 unit each (a grade is about 38 hours). It now has **all 57 grades cut into the
curriculum's own units** ("Unit n.k" of `Spanish_Fluency_Path.csv`): 721 units, 5 to 16 per grade, tiling levels 1..pathLength.
Built by `scripts/generate-spanish-unit-placement.js` (free NVIDIA models write from each unit's goal and lessons; curriculum text only).

* Every question was **re-solved blind** by a second model that never saw the key (Nemotron Ultra, or DeepSeek v4.1 flash for the units
  Nemotron wrote); a disagreement is dropped, a question the judge never answered is dropped (never kept on no evidence); a lint drops
  questions that quote their own answer or write the options into the prompt. **COUNT:** 3,499 written, **2,621 kept**, all `gate: agreed`.
* **Coverage: 57 of 57 grades are complete** (every unit has 3-5 gated questions). It was 35 on 2 Nov, 49 later that day; the last eight (40, 47, 50,
  53-57) stalled on NVIDIA 429s and were finished on 3 Nov with the same builder and gates (see the 3 Nov update below). `unit-placement.js`
  still ignores any grade with an unfinished unit, so a half-built grade is never served.
* **Time bound.** The in-grade stage runs on the mode's clock: Quick **6 min**, Balanced **13 min**, Accurate **25 min** (whole placement
  with the subject stage: 20 / 45 / 90). Question caps 14 / 30 / 80.
* **SIMULATED, held-out seed 20261102, 360 learners per mode over 10 grades, planted holes 0/10/30%** (`scripts/spanish-placement-sim.js`):

| Mode | Within 1 unit | Exact | Mean error (units) | Questions + checks | Sim minutes | Hours on known material, with placement (without) | Hours needed but skipped | Planted gaps on path | Gaps below the start reopened | False gaps |
|---|---|---|---|---|---|---|---|---|---|---|
| quick | 85.8% | 53.6% | -0.64 | 11.0 + 11.5 | 9.7 | 1.31 (12.49) | 0.24 | 99.6% | 93.1% | 1.6% |
| balanced | 85.3% | 58.9% | -0.76 | 18.2 + 10.0 | 12.2 | 1.45 (12.59) | 0.14 | 98.9% | 88.6% | 1.6% |
| accurate | 82.8% | 53.9% | -0.84 | 59.6 + 0.1 | 25.9 | 1.27 (12.49) | 0.19 | 98.5% | 83.3% | 0.0% |

  Development seed (balanced): 84.4% within 1, 1.44 h wasted, 96.8% gaps on path. HARD variant (wider slope, items moved by sd 0.4 unit,
  balanced): 81.4% within 1, 1.64 h wasted, 98.9% on path. Reading it: a learner who already knows part of a ~33 h grade would
  spend about 12.5 h on known units with no placement and about 1.4 h with it; the price is 0.14-0.24 h of needed material skipped on
  average. "Within 1 unit" is **below** math/English's 97.5% "within 1 grade" (a unit is a much finer target); the placement errs low
  (mean -0.7 units), which wastes a little time rather than skipping material. Accurate is not better than Balanced here (the bank has
  3-5 questions per unit, so the walk runs out of questions). The sim treats item positions as exact (the repo's convention, a best case).
* **Route test** (`scripts/spanish-depth-route-test.js`, a throwaway DB, real routes): a fresh account enrolls in grade 9, gets the adaptive unit walk
  (not the ladder), is placed at unit 5 for a learner who finished 4 (within 1) inside the bounded question count, with a unit plan.

### 3 Nov update: the last 8 grades (40, 47, 50, 53, 54, 55, 56, 57)

* Writer: MiniMax M3.1 Flash on xKiro (free grant, pipeline only, curriculum text only; `UNIT_WRITER=xkiro UNIT_WRITER_EFFORT=low`). Checker: the same
  blind re-solve as the other 49 grades (Nemotron Ultra, a different family, key withheld). No gate, lint or threshold was changed. Two fixes to
  the builder, not to the gates: it now passes a reasoning effort (MiniMax at its default "max" effort returned unusable replies) and accepts a
  reply that names a unit by its label ("55.3") instead of its position, when exactly one asked-for unit matches (that mismatch had silently dropped
  every question for 26 units).
* **COUNT:** the 8 grades have 104 units and 422 kept questions, all `gate: agreed`. 263 questions were written in the first pass; the blind
  re-solve disagreed with 8 (3.0%) and they were dropped, plus a few more on the units that needed rewrites (grade 53 unit 2 needed several tries; the
  writer is deterministic at temperature 0). Whole bank: 721 units, 3,388 questions.
* **SIMULATED, held-out seed 20261102, 24 learners per grade and hole rate, only these 8 grades (576 learners a mode):** within 1 unit
  **83.7% / 81.6% / 79.7%** (quick / balanced / accurate), exact 47.0 / 51.7 / 51.4%, mean error -0.70 / -0.87 / -0.98 units, planted gaps on path
  97.8 / 99.4 / 100%, false gaps 2.0 / 1.4 / 0.0%, lost hours 0.37 / 0.18 / 0.25 h. These upper grades place slightly **worse** than the table above
  (accurate sits just under 80% within 1 unit); reported as measured, nothing tuned.
* **SIMULATED, same seed, 10 grades spread over all 57 (720 learners a mode):** within 1 unit **86.1% / 82.6% / 83.8%**, exact 51.5 / 56.9 / 53.9%,
  mean error -0.62 / -0.84 / -0.86, gaps on path 98.2 / 98.4 / 99.5%, false gaps 1.6 / 1.3 / 0.0%, wasted h on known 1.68 / 1.93 / 2.02 (14.4 with no placement).
  `scripts/spanish-placement-sim.js --only=40,47,...` runs chosen grades; `--gate` (4 grades, balanced) passes at 80.6% within 1 unit against the 80% floor.

## 2. Catch-up for every grade

`services/spanish/catch-up.js` previously had questions only for the skills of grades 3-4. It now also draws on the gated unit bank,
so every unit of every complete grade is a skill with 3-5 checked questions (COUNT: `scripts/spanish-depth-route-test.js` asserts at
least 3 for every unit of every complete grade, and for grades 5-8). Gap-only as before: a skill is skipped only on evidence, an undecided skill is taught.
**SIMULATED** planted-gap run (`scripts/spanish-catchup-sim.js`, seed 20261102, targets grades 6/9/14/22, 8 learners each): gaps found
**98.1-98.6%**; known skills taught 0.0% at no slip but **7.6-9.0% at 3% slip** (above the 5% the other subjects hold; reported, not hidden);
with nothing missing the catch-up costs about 3.0 h (check only) against 220 h linear; with everything missing about 102 h against 220 h.
Table in `docs/CATCHUP-PROOF.md`.

## 3. Scorecard in the player

New `services/spanish/spec-fit.js` turns the learner's learning spec (`learning-spec.js`, called, not edited) into code-level knobs; the
Spanish wording stays in that file. Wired into `path.js` (lessons, sprint, role-play) and `ai-activities.js` (partner, writing coach):

| Spec field | Spanish effect |
|---|---|
| engagement.novelty / gamification | share of game-like steps (match pairs, tap what you hear) |
| engagement.dialogue / choices | complete-the-chat and read-and-respond steps |
| practice.typedAnswers | typed against picked answers |
| lesson.minutes + session.items (brevity, velocity, persistence) | steps per level, bounded 5-16, introductions never cut |
| practice.tryItems | extra retrieval on the new phrases |
| review.reviewShare | share of steps on earlier phrases |
| scaffolding level / hintLevel | new phrases at once (more support: one fewer; less: one more) |
| interests / dislikes | liked domains' phrases first, disliked last; partner small-talk topics (never a dislike); coach examples |
| levers.pace / pressure / challenge | speaking-sprint seconds per prompt |
| feedback tone / granularity / hintSize | partner and coach instructions |

A default spec (no scorecard, owner base) changes nothing (tested). Test: `scripts/spanish-spec-fit-test.js` (offline, 21 checks).
**AI-JUDGED** sensitivity (`scripts/spanish-spec-sensitivity.js --live`, results in `curriculum-build/spanish-depth/sensitivity.json`): for each of the ten
measure groups plus interests/dislikes, two synthetic learners differing only in that group get the same level; Nemotron Ultra is asked
which level fits a profile, then again with the profile swapped (the planted swap). In 9 of 11 groups the two levels differ in code
(reasoning and metacognition do not change a Spanish level). Of the 7 groups Nemotron judged, it saw the difference in both orders in **4**
(pacing, memory, motivation, interests/dislikes), and got the unswapped case right in 5. Two groups hit NVIDIA 429s (not judged). **Sol (Modelflare)
answered 401 on every call, so there is no second judge**; Gemini's free tier was spent on question writing. This is one free judge, one level
per group: weak evidence, not proof.

## 4. Grades 5-57 content (writing ahead)

`services/spanish/unit-writer.js` writes a unit's Duolingo-style content (phrases, scene, role-play, fills, chats, readings) on demand, just
ahead of the learner, with the checks: structure in code, every keyed item and every phrase re-solved blind, a native-speaker review, and a
unit that keeps too little is not stored. Only stored, checked units are registered with the player; a level whose unit is not stored
goes to the ordinary session. Verified: the offline test (`scripts/spanish-unit-writer-test.js`, 21 checks: planted wrong key dropped,
unanswerable item dropped, rejected line dropped, thin unit not stored, restart reload, damaged file skipped, what is written ahead) and
one live unit (grade 9, unit 9.2: 28 of 28 keyed items agreed, 1 scene line rejected, ~4 minutes). **It is OFF by default**
(`SPANISH_WRITE_AHEAD=on` turns it on): it has run live on one unit only. With it off, grades 5-57 are played through the ordinary
(checked) session and grades 1-4 through the Duolingo-style player, as before; nothing unchecked is served either way.

## Money and what is not done

Free only: NVIDIA free models, the Gemini free tier (until its quota ended), xKiro (quota already spent by other jobs, refused), OpenRouter
(its free Qwen route had become paid; not used). Modelflare Sol 401. Standard Compute $0, Anthropic $0.
Not done: the 22 grades' banks (rerun write + gate + prune); write-ahead switched on and checked live on more than one unit; a second
independent sensitivity judge; interest theming of the bank practice items beyond phrase order; the spec reaching the sealed Spanish
files (not touched). Merge note: no new export needed in `learning-spec.js`; `unit-placement.js` was not edited.
