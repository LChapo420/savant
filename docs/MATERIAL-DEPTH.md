# Material uses the full depth of the scorecard (learning spec version 2)

Built 1 Nov 2026 on branch `material-depth`. Code: `services/learning-depth.js` (new), `services/learning-spec.js` (version 2), proof
`scripts/material-sensitivity-proof.js`, tests `scripts/learning-depth-test.js` and `scripts/material-sensitivity-proof.js --mock` (both
in `npm test`). Raw results: `docs/material-depth/*.json` (every judged pair, with both texts).

> **What kind of evidence this is.** Every learner here is simulated (scorecards set by hand), every material was written by a model,
> and every verdict is a model's. Nothing here shows that a real learner understands, remembers or learns faster. It shows that the
> material changes when a measure changes, in the direction the measure's own definition says, as two independent model judges
> read it, and that it keeps the level's points while doing so. "Estimated minutes" are words divided by a reading speed, not timed
> learners.

## 1. What was built

### 1.1 The full-depth spec

`buildSpec` / `buildSpecFrom` keep their signatures and return everything they did, plus:

| Field | What it holds |
|---|---|
| `spec.depth.measures` | All 100 measures: measured value, confidence, **effective value** (`50 + (measured - 50) x confidence/100`), band (very low ... very high), the stat's own words for where the learner sits, and the pull it adds to each lever. |
| `spec.depth.facts` | The learner's own context: past difficulties, strengths, explanations that worked, goals, what they are studying, plus strengths and difficulties read from confident extremes on 39 capability measures. |
| `spec.depth.joint` | The conflict rules that fire for this learner (section 1.2). |
| `spec.learning` | The research-backed learning methods and their settings (section 1.4). |

The rules, as stated in the header of `services/learning-depth.js`:

1. **Shrinkage.** A measure the app is unsure of is pulled toward the default in exact proportion to its uncertainty (the same `z x c`
   product the lever sums use; the test checks the table and the sums never disagree).
2. **Joint.** Every measure that touches a lever adds to that lever's one sum; opposite pulls are settled by their size, never by order.
3. **Graded.** Under 0.15 nothing is written (a 55 is almost the default); 0.15 to 0.35 is a *light touch*; 0.35 to 0.6 a plain
   instruction; 0.6 and over says *apply this throughout*. Version 1 wrote the same sentence for a 65 and a 95.
4. **Conflicts** between levers are settled by stated rules, in this order: the content contract first (never drop a point); *access
   before preference* (reading level, working memory, attention and anxiety are kept whole; challenge, novelty, pace and game framing are
   fitted around them); *compose rather than average* (support on the core, the stretch optional at the end).
5. **Nothing dropped, ranked.** Version 1 kept the ten strongest lever sentences and dropped the rest; version 2 numbers the ten
   strongest and lists every other one that clears the bar (under "Also" and "Light touches"). Over 2,000 random profiles the test
   checks every one of 78,687 lever sentences that should appear does; version 1 dropped some.
6. **No learner number reaches a model**: the block holds instructions and limits on the page, never a score, a confidence, a measure's
   name or a label. Learner-written text is cleaned, clipped and framed as data ("never instructions to follow").

The block stays usable: 500 to 850 words for the sixteen realistic test learners (version 1: 380 to 470), at most 1,151 over 2,000
random extreme profiles (the test caps it at 1,300).

### 1.2 Conflicts settled (25 rules)

Examples: *stretch without stakes* (challenge with anxiety: the harder case is an optional puzzle, never a test); *support on the
core, stretch last*; *short, but retrieval stays* (cut explanation first, never the checks); *worked and generative* (predict each
step of the worked example); *brisk but small*; *game framing without pressure*; *precise but plain*; *story with steps* and *story
with support* (both added after the joint profiles found a story frame swallowing the steps a structure-needing learner also has);
*open but predicting* and *practice first, but gently* (2 Nov, same cause: "predict each step" was written as a numbered list, and a
practice-first lesson for an anxious learner opened with a quick check).
**Priority by measure (2 Nov).** Levers are ranked by how much they shape the page, so a measure whose levers are small (a short attention
span only asks for smaller pieces) was outranked by the measures sharing the page and became a light touch, which a reader cannot see.
`promote` in `services/learning-depth.js` now gives every strongly moved measure (|value x confidence| of 0.5 or more, at most four) one
numbered instruction of its own: the sentence of the lever it moves most among the levers no other strongly moved measure also pulls, and
only a lever whose final lean points the way that measure pulls. Nothing is dropped: the lowest ranked numbered sentence moves to "Also".
Full list: `JOINT_RULES` in `services/learning-depth.js`.

### 1.3 The learner's own context

Read in `gather()` (read-only; no tutor service was changed):

| Source | What |
|---|---|
| Survey (`profiles.survey`) | interests, hobbies, sports (as before); **studying**; **notes**: first-person sentences that say something is hard (difficulties) or that they are good at something (strengths); dislikes as before |
| Tutor's facts (`services/tutor-facts.js` list, read only) | interest; **hard** and **misconception** (difficulties); **worked** (explanations that worked); **goal** |
| After-level record (`learner_records`) | dislike, solid interest (as before); **struggle** seen on two or more levels; solid **strength** |
| Scorecard | confident extremes (very high or very low *effective* value) on 39 capability measures, in the stat's own words; a guess (95 at confidence 30) is never named |

They reach every material block as "Strengths to build on", "Past difficulties to pre-empt (without saying they find it hard)",
"Explanations that have worked" and "What they are working toward". A learner who only told us a difficulty is no longer given the
default spec.

### 1.4 Learning methods tied to the measures (`spec.learning`, `learningLines`)

| Method | What the writer is told | Measures that modulate it |
|---|---|---|
| Retrieval practice | checks spread through the piece (or after each stretch, for a learner who must not be interrupted), each asks to recall or produce from memory, never reread; the last brings back an earlier idea | retrieval_strength, consolidation_need, generation_effect, recognition_recall_gap, enactive_encoding, cycle_architecture, rush_tendency |
| Fading worked examples | novice: fully worked, then a completion problem, then one alone; expert: at most one solved case, straight to problems (expertise reversal); else one worked example then one to try | prior_knowledge, worked_example_dependence, scaffolding_fade, hint_dependency, step_explicitness, productive_struggle, topic mastery |
| Concrete or abstract first | concrete cases, then the rule, then the general form; or principle first | abstraction_tolerance, deductive_trajectory, inductive_trajectory |
| Spacing and interleaving hooks | a question on an earlier idea, a look-alike problem mixed in, a closing line to recall tomorrow | interleaving_tolerance, decay_rate, interference_susceptibility, integration_tendency, systems_thinking, consolidation_need |
| Gap-only | known points get one line each (still stated, so every objective appears), the words go to what is new | prior_knowledge, mastery_velocity, topic mastery |
| Dual coding | the central idea (or each key idea) also as a picture in text; in a podcast, a picture described in words; the form follows the learner (no arrow chains for a short-cause-chain learner) | spatial_anchoring, cognitive_flexibility, text_density_tolerance, causal_chain_depth |
| Length | word budget and minutes (as before); own material for a learner who needs less is held to the length of a plain outline, with one interest analogy, not three | brevity_preference, attention_runway, processing_velocity, boredom_susceptibility, persistence |

A method sentence never contradicts a lever sentence in the same block (checked over 1,500 random profiles).

### 1.5 Every material kind

| Kind | Generator | Block | Change in version 2 |
|---|---|---|---|
| Lesson | `services/lessons.js` -> `ai.generateLesson` | `lesson` | full depth |
| Built-in base material (levels) | `services/level-editor.js` via `services/details.js` | `level` (same sentences as `lesson`) | full depth |
| Uploaded material, path | `services/course-builder.js` | `material` + `test` | full depth; depth no longer withheld (a source-limited sentence) |
| Notes | `services/material-notes.js` | `notes` | 18 more levers with notes sentences of their own (big picture, memory hook, look-alikes, named mix-up, rule or case first, why first, question bullets, own-words bullets, an optional harder question, ...) |
| Podcast | `services/material-podcast.js` | `podcast` | full depth; steps numbered aloud |
| Practice test | course-builder questions -> `services/material-test.js` | `test` | 24 more levers with question sentences (step size per question, support, look-alikes, a new setting, a running scenario, varied formats, worked and numbered explanations, ...) |
| Study pack | `services/material-pack.js` | `material` + `test` | full depth |
| Tutor | (not changed: another agent owns it) | `tutor` | unchanged; `depthLines(spec)` gives the version-2 groups when its owner wants them |

New exports (none changed): `depthLines`, `depthOn`, `needsLess`, `measuresOf`, `jointOf`, `learningOf`, `JOINT_RULES`, `NOTES_PHRASES`,
`TEST_PHRASES`, `PODCAST_PHRASES`, `MATERIAL_PHRASES`. `LEARNING_SPEC_DEPTH=off` gives the version 1 block back (used for the before and
after below).

Three measure rules gained an effect after the proof found the material ignoring them or going the wrong way: evaluation_anxiety (a
gentle ramp from an easy start), attention_runway (small pieces), productive_struggle (attempt before the reveal). These are design
choices from the measures' own definitions, labelled as such in the code; the scorecard's measurement rules (`signals.js` etc.) were
not touched.

## 2. Method of the proof

**Structural matrix (no model).** For each of the 100 measures, a base learner (age 14, interests basketball and video games, nothing
else known) with that one measure at 10 against at 90, at confidence 90: does the block each surface's writer receives change?

**Counterfactual pairs (models).** The same base learner, copied twice, one measure LOW (10) and HIGH (90) as settled measures,
everything else equal. The same base text (one of four topics) is made into the same kind of material for both through the app's real
generator (`ai.generateLesson`, `material-notes`, `material-podcast`, `course-builder` + `material-test`, `material-pack`). A blind judge
gets both versions in a seeded random order, the measure's definition (its low and high descriptions from `stats.js`), the base text and
the five key points, and says which learner each version suits (LOW, HIGH or EITHER), then checks each version's accuracy and missing
key points. Code also checks key-point coverage (term overlap). A verdict is *direction-correct* when it names the HIGH learner's version;
"either" counts as not correct.

- Writers: MiniMax M3.1 Flash on xKiro (the account's free token grant, reasoning low) for lessons, notes and podcasts; Standard Compute
  DeepSeek V4.1 Flash (through the ledger) for tests, paths and packs, which take many calls each.
- Judges: Mistral Large 3 (xKiro free tier) and Gemini 3.5 Flash Lite (Gemini free tier): two families, neither a writer's family.
- Judge v1 asked "which was written for the HIGH learner"; judges often described a version as suiting the low learner and then named
  it as the high one's. Judge v2 asks for the difference first, then which learner each version suits. Every result below is judge v2
  unless marked.
- Measures: a pilot of 11 (the highest-impact measure of every group, two in intake), then the top 30 by impact with every group
  covered (`--top 30`). A topic is chosen where the measure has something to act on (for example two-step equations for structure_need
  and worked examples), else the four topics in turn.
- Joint profiles: four measures moved at once in mixed directions against the mirror profile (all four flipped); the judge names the
  high version for each measure.
- Speed: eight learner types from the earlier proof, tailored against base (generic) material; a blind rubric per version (accuracy,
  which objectives it fully teaches, fit to the learner), plus words and estimated minutes (words / reading speed by age, 0.7 for a
  second-language reader, plus half a minute a check question).

## 3. Results

### 3.1 Structural: does the block change when one measure moves? (all 100 measures, no model)

| Surface | Version 1 | Version 2 |
|---|---|---|
| Any surface | 98 | **100** |
| Lesson | 98 | **100** |
| Built-in levels | 98 | **100** |
| Own material (course, pack) | 97 | **100** |
| Podcast | 94 | **100** |
| Notes | 22 | **70** |
| Practice test | 31 | **77** |
| Code that reads the spec (review timing, session, pace) | 15 | 15 |

The 30 measures that still leave notes unchanged are tone, feedback, motivation and session measures (humour, praise, competition,
game framing, feedback granularity, help seeking, planning, ...), which a one-sentence-a-bullet outline of the learner's own text has no
place for; the 23 that leave tests unchanged are teaching-order and session measures (rule or case first, warm-up latency, fatigue,
re-entry cost, mnemonics, ...). Both lists are in `--mock` output. This is the ceiling of what each kind *can* reflect, not proof that it
does.

### 3.2 Judged single measures

Before and after on the pilot's 11 measures (judge v2 for both):

| Kind | Version 1 | Version 2 (final code) |
|---|---|---|
| Lesson | 20/22 verdicts direction-correct; 9 of 11 measures moved the right way | 20/22; 9 of 11 |
| Notes | 7/12 verdicts; **5 of 11 measures did not change the notes at all**; 2 of 11 moved the right way | 16/22; none ignored; **7 of 11** moved the right way |

Over the top 30 measures by impact (every group covered), final code:

- **Lesson 80%** of 60 verdicts direction-correct (21 measures right, 6 split between the judges, 3 the wrong way).
- **Practice test 83%** (20 measures), **path 82%** (20 measures), **pack 77%** (11 measures, judge v1 and code before the pilot fixes).
  **Pack re-judged on version 2 (2 Nov): 14 of 16 verdicts (88%) direction-correct, 8 measures** (vocabulary_ceiling, working_memory_span,
  structure_need, evaluation_anxiety, prior_knowledge, interest_transfer, worked_example_dependence, deductive_trajectory); writer
  DeepSeek V4.1 Flash through the ledger, judges Gemini 3.5 Flash Lite and Modelflare Sol, judge v2. The two misses are structure_need and
  evaluation_anxiety (1 of 2 each). Content: a key point or an accuracy below 8 is flagged by a judge in 1 of the 8 pairs
  (deductive_trajectory) and by the code's term-overlap check in 3 (working_memory_span, structure_need, worked_example_dependence; a pack
  is a summary and a quiz, which paraphrase), so only 4 of 8 pairs are "intact" on both counts. Only 8 of the pilot's 11
  measures were re-run (the Standard Compute budget, section 5), and the other 3 (generation_effect, attention_runway, productive_struggle)
  are not re-judged. The earlier 77% is a different judge and writer, so the two numbers are not a like-for-like gain.
- **Podcast 63%** and **notes 65%** (30 measures): weaker. In both, about a third of the verdicts went the wrong way.
- Content: every lesson pair kept its five key points in 26 of 30 pairs (judges and code); for notes the term-overlap check flags
  more (16 of 27 intact) but the speed run below shows the same misses in the base notes (the notes generator paraphrases), so it is
  not caused by tailoring. Practice tests are a sample of questions, so only their accuracy is checked (15 of 15 intact).

Measures that went the wrong way for both judges in the first full run (the 2 Nov changes and their re-judge are listed after this paragraph): intake_baseline (notes, podcast: the high learner's
version read as more fragmented), attention_runway (notes, path), error_driven_learning (lesson, podcast), application_orientation
(lesson), analogical_transfer and productive_struggle (notes), causal_chain_depth, example_density_need, boredom_susceptibility,
consolidation_need, step_explicitness and working_memory_span (podcast), brevity_preference (path), reentry_cost (notes). Several are
judge readings that contradict their own evidence sentence (section 6); others are real: the writer did not make the difference large
enough to see.

**Re-check of the wrong-way measures on 2 Nov (notes only, one sample, ONE judge).** The new rules change the notes block of 11 of the
30 judged measures; 8 of them were re-written with the old and the new rules by the same writer (Mistral Large 3 on xKiro) and judged by Sol
(Gemini's free quota was spent, so there is one verdict a measure). Old rules 3 of 7 the right way (narrative_pull: block unchanged, so
ignored); new rules 7 of 8: attention_runway, worked_example_dependence, evaluation_anxiety and brevity_preference turned from wrong to right,
productive_struggle, prior_knowledge and boredom_susceptibility stayed right, and narrative_pull, which now changes the notes, was judged the wrong
way once. One verdict each cannot separate a fix from a lucky draw; read it as "nothing got worse and attention_runway and
productive_struggle (the two on the list above) are pointing the right way", not as proof. The other measures on the list (podcast,
path, lesson, intake_baseline and the rest) were not touched by 2 Nov's changes and were not re-run.

### 3.3 Joint profiles

Four measures moved at once (mixed directions) against the mirror profile: **36 of 64 verdicts direction-correct (56%), 15 "can't
tell", 13 the wrong way**. Lessons 19/32, notes 17/32 (12 of them "can't tell"). A code check shows the block itself is right: in all
16 profile-measures the measure's main lever moves its own way in the profile against the mirror. So the loss is in the writing (one
measure's effect masks another's, for example a story frame hiding numbered steps, which led to two new conflict rules) and in judging
four overlapping differences at once. This is the weakest result here and the most important one to improve: real learners differ on
many measures at once.

**Second attempt (2 Nov, branch `material-weak`): the goal of 75% was not reached, and the gain is not reliable.** AI-judged, simulated
learners; raw runs in `docs/material-depth/material-weak/`.

*The judge.* The joint question is now put to the judge once per measure, with the other three named as explanations that are not to be
credited, and "either" when the only visible difference is better explained by another measure (`--joint-judge each`; the first wording
stays as `old`). It is not easier: "either" and a wrong pick both still count as not correct. On the *same recorded texts* from the first
run, the new judge gives 31 of 64 with Mistral Large 3 and Gemini (11 "can't tell", 22 wrong) and 36 of 64 with Gemini and Modelflare Sol
(11 "can't tell"), against 36 of 64 and 15 "can't tell" for the old wording. So the judge change by itself does not raise the number; it
turns some "can't tell" into wrong answers.

*The writing.* Changes: priority by measure (section 1.2), two new conflict rules, a visible "nothing here is scored" sentence for the
anxious learner's lesson and a calm lead-in for their notes, a scene opening for a story-following learner's notes (those notes ignored
narrative_pull before), and the notes word limit (3.4). xKiro's MiniMax answered 503 for the whole of 1 Nov and its free quota ran out, so
before and after were both re-run with the same writer, Standard Compute DeepSeek V4.1 Flash, judges Gemini 3.5 Flash Lite and Sol, the
four original profiles, topics and mirror design, with fresh samples (`--rep`) because a single draw is noisy:

| Arm | Notes | Lesson | All |
|---|---|---|---|
| Rules as on 1 Nov (3 samples of notes, 2 of lessons) | 52/96 (54%), 24 "can't tell" | 56/64 (88%) | 108/160 (68%) |
| Rules of 2 Nov before the last notes tuning (same samples) | 63/96 (66%), 17 "can't tell" | 47/64 (73%), 0 | 110/160 (69%) |
| Final rules, notes only (2 samples; Gemini rate-limited, 18 verdicts lost) | 25/44 (57%), 11 "can't tell" | not re-run | |

Reading it honestly: only the J1 lesson block (vocabulary, attention, anxiety, prior knowledge) changed between the arms; the J2, J3 and J4
lesson blocks are character for character the same, so the lesson difference there (J4: 16/16 against 11/16) is sampling, not the rules.
J1 lessons, the one changed block, over 8 samples each: 43/64 (67%) to 47/64 (73%); in six extra samples evaluation_anxiety went from 4/12 to
8/12 and attention_runway from 3/12 to 5/12. Notes gained about 12 points before the last tuning, and "can't tell" fell from 24 to 17 of 96,
but the final-rules sample is smaller and lower (57%), so no gain on notes can be claimed for the final rules. Remaining misses are mostly
notes where a judge sees no difference ("can't tell") and confounds the judges themselves name (a reassuring "no earlier science needed"
for a low-prior-knowledge learner read as an anxious learner's). Not met: 75% direction-correct and "can't tell" well below 15 of 64.

### 3.4 Understanding, retention and speed: tailored against base material

Lessons (8 learner types): tailored lessons teach **all five objectives in all 8** by both judges' count (base lessons 3.5 to 4.5 of 5),
with accuracy 9.5 to 10 and fit 9.0 to 10 (base 2.0 to 6.5). Code finds no key point missing in 6 of 8 tailored lessons (1 in the other
two), against 1 or 2 missing in every base lesson.

Shorter where the learner needs less: Ethan (gifted) 643 -> 442 words, 4.9 -> 3.0 minutes; Ben (fast) 262 -> 208, 3.5 -> 2.6; Lena
(knows most) 643 -> 608, 5.2 -> 4.0 (fewer check questions); Noah (fast, gifted) 262 -> 300 words but 2.7 -> 2.4 minutes. Longer where
the learner needs more: Frank (slow, little background) 262 -> 438 words. Learners who need simpler words got shorter lessons too
(Sam, Grace, Omar: 643 -> 437 to 504).

Notes: tailored notes keep 5 of 5 objectives for every learner (as the base notes do). The first run found notes for learners who need
less growing *longer* than the base (Noah 186 -> 347 words, Ethan 237 -> 372, Lena 237 -> 298) as interest analogies and question
bullets were added; after the fix (one analogy, no longer than a plain outline) they are 220, 249 and 249: still 5% to 18% over the base,
and two judges scored Lena's and Noah's tailored notes as fitting a little worse than the base (7.5 against 8.5; 7.0 against 8.0).

**Notes word limit (2 Nov).** A learner who needs less (a short treatment asked for, or gap-only coverage) now gets notes held to a hard
limit: 85% of the passage's words, headings and bullets together (`notesWordLimit`; the plain outline runs 0.8 to 1.05 of the passage). The
limit is in the writer's prompt, a draft over it is sent back once with the overshoot named (`checkFollowed` `too_long`), and what is
still over is cut by code: scene and harder-question bullets always go from a short version, framed-analogy bullets go last-first until it
fits, a bullet that carries a point never does. The interests analogy is optional there and only inside the limit. Notes also now read
"please do not over-explain" as a dislike of repetition ("say each thing once"). A first try at 75% of the passage cut definitions and
steps (objectives fell to 3.5 to 4.5 of 5 for Omar, Sam and Lena) and was raised to 85%. Same writer (DeepSeek through the ledger), same
judges (Gemini and Sol), six learner types who need less, notes only, one sample each:

| | Words | Fit (0-10) |
|---|---|---|
| Base (generic) notes | 242 on average (224 to 251) | 7.0 |
| Tailored, rules as on 1 Nov | 320 (213 to 431; five of six longer than base) | 6.9 |
| Tailored, final rules | **167 (151 to 189; all six shorter than base)** | **7.75** (above base for five of six; Lena 7.5 against 9.5) |

Objectives taught (judges' count): 5 of 5 for four of the six, 4.5 for Sam and 4.0 for Ben (one judge counted a missing objective; the old
rules gave Ben 4.5). Not "no objective dropped" proven: it is a judge's reading of one sample, not a guarantee. The generic notes of a
single run are also noisy (a second run's generic fit for Lena was 7.5, a third's 9.5), so the fit column has about two points of play.
Learners who need more still get longer notes (Frank 570, Grace 393 words), as before. Lessons for these learners were not re-run on
2 Nov (budget), although the priority rule can change their blocks.

**What this does not show.** Not one learner was timed, tested a week later or asked. The estimated minutes are words over a reading
speed. A 25% to 35% cut in reading time for some learner types, with every objective kept, is far from "three times faster", and no
evidence here bears on retention. That needs real learners (section 6).


## 4. What failed and was fixed (in the order found)

| Found by | Failure | Fix |
|---|---|---|
| structural matrix | notes ignored 78 measures and tests 69 (version 1's short surface lists) | 48 more measures now change notes and 46 more change tests (new levers with sentences of their own); podcasts number steps aloud; own material withholds no lever (depth limited to the material's own reasoning) |
| pilot v1 | 5 of 11 pilot measures did not change the notes at all | as above: 0 of 11 ignored |
| pilot (tests, packs) | an anxious learner's practice test climbed as fast as anyone's | evaluation_anxiety now also asks for a gentle ramp from an easy start |
| pilot (tests) | a low working-memory learner's test had as many multi-step items | tests carry step size per question and partial steps |
| pilot (lesson) | the lesson writer's own "state the rule first" note beat "concrete first" | the concrete-first sentence now says it replaces that note |
| pilot (lesson) | low structure need wrote the same numbered lesson | the open-ended sentence is concrete (prose, one task with no set method) |
| pilot (notes) | short-focus notes were no smaller in their pieces; struggle-benefit learners were shown, not asked | attention_runway moves chunk size; productive_struggle asks for an attempt before the reveal |
| pilot (judges) | judges described a version as suiting the low learner and then named it the high one's | judge v2 (difference first, then which learner each version suits); every run re-judged |
| full run | the dual-coding "arrow chain" read as a long causal chain for a learner who follows one or two links | the picture's form follows causal_chain_depth |
| joint profiles | a story frame hid the numbered steps of a structure-needing learner | two conflict rules: story with steps, story with support |
| speed run | own material for learners who need less grew longer than the base | one interest analogy, and no longer than a plain outline (Noah's notes 347 -> 220 words) |
| writer | MiniMax gave unusable lessons about 1 time in 10 at first | one immediate retry in the harness (the app's own providers already retry) |
| joint profiles (2 Nov) | a measure with small levers (attention span) was a light touch next to three other moved measures, so the text did not show it | priority by measure: every strongly moved measure keeps one numbered instruction of its own |
| joint profiles (2 Nov) | "predict each step" was written as a numbered list (read as the step-needing learner's version); an anxious learner's practice-first lesson opened with a quick check | conflict rules open-but-predicting and practice-first-but-gently; the anxious lesson says once that nothing is scored |
| joint profiles (2 Nov) | notes ignored narrative_pull and low stakes | a scene opening for a story-following learner's notes, a calm lead-in for an anxious learner's |
| speed run (2 Nov) | notes for learners who need less were still 5% to 18% over the base (and 20% to 70% over with the other writer) | a hard word limit (85% of the passage) in the prompt, in the check and in code, scene and question bullets dropped from a short version |
| speed run (2 Nov) | a first limit of 75% cut definitions and steps | raised to 85% |
| harness (2 Nov) | the generic notes of one topic were built by several learners at once and came back "busy"; a lesson sample could not be redrawn | one build per generic version; `--rep` redraws lessons too |

## 5. Cost

| Provider | Spent | What |
|---|---|---|
| Standard Compute (through the ledger, `ceilingUsd` 38) | **$2.41** of the $2.50 budget (ledger $30.90 -> $33.39 over the session, which includes any other agent's calls) | DeepSeek V4.1 Flash writing tests, paths and packs |
| Standard Compute, 2 Nov (material-weak) | **$1.48** of the $1.50 budget (ledger $33.00 -> $34.47) | DeepSeek V4.1 Flash writing the joint-profile, speed and pack samples of both arms |
| Modelflare Sol, 2 Nov | not metered in the run; about 400 judge calls of about 3,000 tokens each, at the cheapest of the account's models | judge (third family) |
| xKiro, 2 Nov | 0 dollars; MiniMax answered 503 all day, Qwen and Mistral free models used up the day's free quota (the first re-run attempts, both arms, were lost to it) | judge and failed writer attempts |
| Anthropic key | $0 | not used |
| Modelflare | $0 | not used |
| xKiro MiniMax M3.1 Flash (free token grant) | 0 dollars; about 1.5M tokens of the grant | writer for lessons, notes, podcasts |
| xKiro free tier (Mistral Large 3) | 0 dollars; about 0.68M tokens (this run's own cap 0.6M, raised to 0.9M for the last runs; the plan allows 1M a day) | judge |
| Gemini key, free tier (3.5 Flash Lite) | 0 dollars; about 250 calls | judge |
| OpenRouter, NVIDIA, LLMGateway | not used (NVIDIA's free endpoint timed out) | |

## 6. Limits

- **Simulated learners, AI writers and AI judges.** No real learner. A direction-correct verdict means a model could tell which version
  was written for the high learner from the text, not that the high learner learns better from it.
- **Two judges, one of them small.** Gemini 3.5 Flash Lite and Mistral Large 3 often disagreed (a "split"); a third family was not added
  to stay inside the free tier. Some "wrong way" verdicts contradict the judge's own evidence sentence (for example describing the
  low version's small pieces and then naming it the high learner's), so the rates mix writer misses with judge misses.
- **Small samples.** One pair per measure and kind (two verdicts), one topic each; a single pair can flip with the writer's sampling.
  30 of 100 measures were judged on lessons, notes and podcasts, 20 on tests and paths, 11 on packs. The other 70 are covered only by
  the structural matrix.
- **Packs** were re-judged on 2 Nov on version 2 for 8 of the pilot's 11 measures (3.2), not all 11, and not against the other two arms.
- **Built-in levels** were not rewritten live: the level editor writes whole HTML pages. The level block has the same sentences as the
  lesson block (checked by the matrix), so the lesson results stand for it, but the HTML path itself was not judged.
- **Joint profiles are still weak.** 56% on 1 Nov; on 2 Nov, with a fairer judge and the new rules, 68% before and 69% after on the same writer and judges, 57% on the final notes (3.3). The 75% goal was not reached; notes often differ too little for any judge to say. Four profiles, two kinds and a few samples cannot show a small gain.
- **Three times faster is not shown.** The best measured cut is about 35% in estimated reading time for some learner types, with every
  objective kept. Notes for learners who need less are now shorter than the base (167 words against 242 on average, one sample each), but
  two of the six had an objective a judge counted as missing, and Lena's fit is below the base.
- **Wording after the runs.** The one-analogy instruction for learners who need less was reworded after the last runs (from "exactly one" to "at least one ... keep it to that one analogy") so the existing mock material proof can parse it; the meaning is the same, but those prompts were not re-run.
- **Tutor not touched.** The tutor's block is version 1; `depthLines` is ready for its owner.

## 7. Rerun

    node scripts/material-sensitivity-proof.js --mock                                    # structural matrix + harness (npm test)
    node scripts/material-sensitivity-proof.js --live --phase full --top 30 --kinds lesson,notes,podcast --cache FILE
    node scripts/material-sensitivity-proof.js --live --phase full --top 20 --kinds test,path --writer sc --budget 0.6 --cache FILE2
    node scripts/material-sensitivity-proof.js --live --phase joint --kinds lesson,notes --cache FILE
    node scripts/material-sensitivity-proof.js --live --phase speed --kinds lesson,notes --cache FILE
    node scripts/material-sensitivity-proof.js --render a.json,b.json --out FILE.md       # the tables below
    add --depth off for version 1
    node scripts/material-sensitivity-proof.js --live --phase joint --kinds lesson,notes --rep 2 --profiles J1 --judges gemini,sol --writer sc --budget 0.3 --cache FILE
        --joint-judge each|together|old   how the four measures are put to the judge; --replay FILE re-judges the texts of an earlier run
        --writer sc|nvidia|xkiro, --writer-model M (another xKiro or NVIDIA model), --judges mistral,gemini,sol,qwen,cohere
    node scripts/lib/joint-report.js FILE --evidence      # per measure, with the judges' words
    node scripts/lib/speed-report.js FILE notes           # words and fit per learner
    node scripts/lib/block-snapshot.js OUT.json; node scripts/lib/block-diff.js A.json B.json   # which single-measure blocks a rule change touched

## 8. Result tables (generated by --render)

### Single measures: summary per run and kind

| run | spec | kind | pairs | block unchanged (ignored) | build failed | direction-correct verdicts | said "same" | wrong way | measures right / split / wrong | content intact (pairs) |
|---|---|---|---|---|---|---|---|---|---|---|
| pilot-v1 | v1 | lesson | 11 | 0 | 0 | 20/22 (91%) | 1 | 1 | 9 / 2 / 0 | 8/11 |
| pilot-v1 | v1 | notes | 11 | 5 | 0 | 7/12 (58%) | 1 | 4 | 2 / 3 / 1 | 5/6 |
| full-v2 | v2 | lesson | 30 | 0 | 0 | 48/60 (80%) | 1 | 11 | 21 / 6 / 3 | 26/30 |
| full-v2 | v2 | notes | 30 | 2 | 1 | 35/54 (65%) | 2 | 17 | 13 / 9 / 5 | 16/27 |
| full-v2 | v2 | podcast | 30 | 0 | 0 | 38/60 (63%) | 0 | 22 | 16 / 6 / 8 | 20/30 |
| full-v2-sc | v2 | test | 20 | 2 | 3 | 25/30 (83%) | 1 | 4 | 11 / 3 / 1 | 15/15 |
| full-v2-sc | v2 | path | 20 | 0 | 3 | 28/34 (82%) | 0 | 6 | 13 / 2 / 2 | 16/17 |
| pack (judge v1, code before the pilot fixes) | v2 | pack | 11 | 0 | 0 | 17/22 (77%) | 0 | 5 | 8 / 1 / 2 | 9/11 |

### Single measures: per measure (correct verdicts of two judges; ign = the block did not change; fail = not built)

| measure | group | impact | lesson (v1) | notes (v1) | lesson (v2) | notes (v2) | podcast (v2) | test (v2) | path (v2) | pack (v2) |
|---|---|---|---|---|---|---|---|---|---|---|
| vocabulary_ceiling | intake | 3 | 2/2 | 1/2 | 2/2 | 1/2 | 2/2 | 1/2 (1 wrong) | 2/2 | 2/2 |
| deductive_trajectory | reasoning | 3 | 2/2 | ign | 1/2 (1 wrong) | 2/2 | 2/2 | ign | 2/2 | 0/2 (2 wrong) |
| working_memory_span | intake | 3 | 2/2 | 1/2 (1 wrong) * | 2/2 | 2/2 | 0/2 (2 wrong) * | 2/2 | 2/2 | 2/2 * |
| attention_runway | pacing | 3 | 2/2 | 0/2 (2 wrong) | 2/2 | 0/2 (2 wrong) | 2/2 | 2/2 | 0/2 (2 wrong) | 1/2 (1 wrong) |
| interest_transfer | engagement | 3 | 2/2 | 2/2 | 2/2 | 2/2 | 2/2 | 2/2 | 2/2 | 2/2 |
| generation_effect | memory | 2 | 1/2 * | ign | 2/2 * | 2/2 * | 2/2 * | 1/2 (1 wrong) | 2/2 | 2/2 * |
| productive_struggle | resilience | 2 | 2/2 * | ign | 2/2 * | 0/2 (2 wrong) * | 2/2 * | 2/2 | 2/2 | 2/2 |
| worked_example_dependence | representation | 3 | 1/2 (1 wrong) | ign | 1/2 (1 wrong) | 2/2 * | 1/2 (1 wrong) * | 2/2 | 2/2 | 2/2 |
| structure_need | metacognition | 2 | 2/2 | 2/2 | 2/2 * | 2/2 * | 1/2 (1 wrong) | 2/2 | 2/2 | 2/2 |
| evaluation_anxiety | motivation | 2 | 2/2 * | ign | 2/2 * | 1/2 (1 wrong) * | 2/2 | 2/2 | 1/2 (1 wrong) | 0/2 (2 wrong) |
| prior_knowledge | transfer | 3 | 2/2 | 1/2 (1 wrong) | 2/2 | 2/2 | 2/2 | 2/2 | 2/2 | 2/2 |
| abstraction_tolerance | intake | 3 |  |  | 2/2 | 2/2 | 2/2 | 1/2 (1 wrong) | 2/2 |  |
| brevity_preference | representation | 3 |  |  | 2/2 | 2/2 | 2/2 | 2/2 | 0/2 (2 wrong) |  |
| intake_baseline | intake | 3 |  |  | 1/2 (1 wrong) | 0/2 (2 wrong) * | 0/2 (2 wrong) * | 2/2 | 2/2 |  |
| inductive_trajectory | reasoning | 3 |  |  | 2/2 | 2/2 | 2/2 | ign | 2/2 |  |
| cycle_architecture | pacing | 3 |  |  | 2/2 | 1/2 (1 wrong) | 2/2 | 0/2 (1 wrong) | 1/2 (1 wrong) |  |
| step_explicitness | representation | 3 |  |  | 2/2 | 1/2 (1 wrong) * | 0/2 (2 wrong) * | 2/2 | 2/2 * |  |
| chunk_granularity | intake | 2 |  |  | 1/2 (1 wrong) | 2/2 * | 1/2 (1 wrong) * | fail | fail |  |
| analogical_transfer | reasoning | 2 |  |  | 2/2 | 0/2 (2 wrong) | 1/2 (1 wrong) | fail | fail |  |
| momentum_dependence | pacing | 2 |  |  | 2/2 | ign | 2/2 | fail | fail |  |
| challenge_appetite | engagement | 2 |  |  | 2/2 | fail | 2/2 |  |  |  |
| consolidation_need | memory | 2 |  |  | 0/2 (1 wrong) | 2/2 * | 0/2 (2 wrong) * |  |  |  |
| error_driven_learning | resilience | 2 |  |  | 0/2 (2 wrong) | 1/2 (1 wrong) | 0/2 (2 wrong) |  |  |  |
| self_efficacy | metacognition | 2 |  |  | 1/2 (1 wrong) | 1/2 (1 wrong) | 1/2 (1 wrong) |  |  |  |
| dialogic_preference | representation | 2 |  |  | 2/2 | ign | 2/2 |  |  |  |
| boredom_susceptibility | motivation | 2 |  |  | 2/2 | 2/2 * | 0/2 (2 wrong) * |  |  |  |
| application_orientation | transfer | 2 |  |  | 0/2 (2 wrong) | 1/2 | 2/2 |  |  |  |
| example_density_need | intake | 2 |  |  | 2/2 | 1/2 (1 wrong) | 0/2 (2 wrong) |  |  |  |
| causal_chain_depth | reasoning | 2 |  |  | 2/2 | 1/2 (1 wrong) | 0/2 (2 wrong) |  |  |  |
| reentry_cost | pacing | 2 |  |  | 1/2 (1 wrong) | 0/2 (2 wrong) * | 1/2 (1 wrong) * |  |  |  |

`*` = a key point was missing or a statement inaccurate in at least one of the two versions (judge or code).

### Joint profiles (joint-v2, v2)

| profile | kind | measure | profile has it | correct verdicts |
|---|---|---|---|---|
| J2 | lesson | working_memory_span | low | 0/2 |
| J2 | lesson | deductive_trajectory | high | 0/2 |
| J2 | lesson | interest_transfer | high | 2/2 |
| J2 | lesson | brevity_preference | high | 2/2 |
| J2 | notes | working_memory_span | low | 2/2 |
| J2 | notes | deductive_trajectory | high | 2/2 |
| J2 | notes | interest_transfer | high | 2/2 |
| J2 | notes | brevity_preference | high | 1/2 |
| J3 | lesson | worked_example_dependence | high | 2/2 |
| J3 | lesson | challenge_appetite | high | 2/2 |
| J3 | lesson | spatial_anchoring | low | 2/2 |
| J3 | lesson | tone_formality | high | 2/2 |
| J1 | lesson | vocabulary_ceiling | high | 2/2 |
| J1 | lesson | attention_runway | low | 0/2 |
| J1 | lesson | evaluation_anxiety | high | 0/2 |
| J1 | lesson | prior_knowledge | high | 2/2 |
| J1 | notes | vocabulary_ceiling | high | 0/2 |
| J1 | notes | attention_runway | low | 2/2 |
| J1 | notes | evaluation_anxiety | high | 0/2 |
| J1 | notes | prior_knowledge | high | 0/2 |
| J4 | lesson | structure_need | high | 0/2 |
| J4 | lesson | narrative_pull | high | 2/2 |
| J4 | lesson | productive_struggle | low | 1/2 |
| J4 | lesson | text_density_tolerance | low | 0/2 |
| J4 | notes | structure_need | high | 2/2 |
| J4 | notes | narrative_pull | high | 0/2 |
| J4 | notes | productive_struggle | low | 2/2 |
| J4 | notes | text_density_tolerance | low | 1/2 |
| J3 | notes | worked_example_dependence | high | 1/2 |
| J3 | notes | challenge_appetite | high | 2/2 |
| J3 | notes | spatial_anchoring | low | 0/2 |
| J3 | notes | tone_formality | high | 0/2 |

All: 36/64 verdicts direction-correct (56%), 15 "same".

### Tailored against base material (speed-v2, v2)

| learner | type | kind | words (base -> tailored) | est. minutes | objectives taught (judges) | key points missing (code) | accuracy | fit |
|---|---|---|---|---|---|---|---|---|
| Lena | age 60, knows most of it, art and gardening, long desk sessions | lesson | 643 -> 608 | 5.2 -> 4 | 4.5 -> 5.0 of 5 | 2 -> 0 | 10.0 -> 10.0 | 6.5 -> 9.0 |
| Noah | age 17, cars, fast and gifted-and-bored | lesson | 262 -> 300 | 2.7 -> 2.4 | 4.5 -> 5.0 of 5 | 1 -> 1 | 10.0 -> 10.0 | 5.5 -> 10.0 |
| Ethan | age 17, music, gifted-and-bored | lesson | 643 -> 442 | 4.9 -> 3 | 3.5 -> 5.0 of 5 | 2 -> 0 | 10.0 -> 9.5 | 4.0 -> 9.0 |
| Lena | age 60, knows most of it, art and gardening, long desk sessions | notes | 237 -> 249 | 1.2 -> 1.2 | 5.0 -> 5.0 of 5 | 0 -> 0 | 10.0 -> 10.0 | 8.5 -> 7.5 |
| Ben | age 11, fast, gaming, dislikes reading | lesson | 262 -> 208 | 3.5 -> 2.6 | 4.5 -> 5.0 of 5 | 1 -> 0 | 10.0 -> 10.0 | 5.0 -> 10.0 |
| Ethan | age 17, music, gifted-and-bored | notes | 237 -> 249 | 1.1 -> 1.1 | 5.0 -> 5.0 of 5 | 0 -> 0 | 10.0 -> 10.0 | 6.5 -> 9.0 |
| Noah | age 17, cars, fast and gifted-and-bored | notes | 186 -> 220 | 0.8 -> 1 | 5.0 -> 5.0 of 5 | 1 -> 1 | 10.0 -> 9.5 | 8.0 -> 7.0 |
| Ben | age 11, fast, gaming, dislikes reading | notes | 186 -> 177 | 1.4 -> 1.4 | 5.0 -> 5.0 of 5 | 1 -> 1 | 10.0 -> 9.0 | 7.5 -> 7.5 |
| Frank | age 60, art, slow pace, little background | lesson | 262 -> 438 | 2.8 -> 3.7 | 4.5 -> 5.0 of 5 | 1 -> 1 | 10.0 -> 10.0 | 5.0 -> 10.0 |
| Omar | age 8, almost no prior knowledge, loves cars | lesson | 643 -> 477 | 10 -> 7.5 | 3.5 -> 5.0 of 5 | 2 -> 0 | 10.0 -> 10.0 | 2.0 -> 9.5 |
| Frank | age 60, art, slow pace, little background | notes | 186 -> 431 | 0.9 -> 2.2 | 5.0 -> 5.0 of 5 | 1 -> 1 | 10.0 -> 9.0 | 7.0 -> 7.0 |
| Omar | age 8, almost no prior knowledge, loves cars | notes | 237 -> 183 | 3 -> 2.3 | 5.0 -> 5.0 of 5 | 0 -> 0 | 10.0 -> 10.0 | 6.5 -> 7.5 |
| Grace | age 25, English is a second language, cooking, step-by-step | lesson | 643 -> 504 | 5.8 -> 4.5 | 4.0 -> 5.0 of 5 | 2 -> 0 | 9.5 -> 10.0 | 4.0 -> 9.0 |
| Sam | age 14, dyslexia-like reading profile, art | lesson | 643 -> 437 | 5.6 -> 3.9 | 4.0 -> 5.0 of 5 | 2 -> 0 | 10.0 -> 10.0 | 3.5 -> 10.0 |
| Grace | age 25, English is a second language, cooking, step-by-step | notes | 237 -> 331 | 1.4 -> 2 | 5.0 -> 5.0 of 5 | 0 -> 0 | 10.0 -> 10.0 | 6.5 -> 9.0 |
| Sam | age 14, dyslexia-like reading profile, art | notes | 237 -> 222 | 1.3 -> 1.2 | 5.0 -> 5.0 of 5 | 0 -> 0 | 10.0 -> 9.5 | 8.5 -> 7.0 |


