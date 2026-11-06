# Fact coverage: what stands between a model and a learner

Owner, 6 Nov 2026: "I want everything to be 100% fact checked, 100% tru and 100% fact checked are two different things, just make sure everything Savant makes and puts out is 100% fact checked."

This page answers one question for every path: **does a real check happen before a learner sees the text, and what happens when it cannot run?** It does not say the text is true. How much a check catches is measured below, and it is well under 100%.

Code: `services/fact-guard.js` (the check, and the one choke point in `services/ai.js` `withProviders`), `services/fact-registry.js` (a row for every model task), `scripts/fact-coverage-test.js` (fails when a task has no row or a shown task is missing here). The table is generated: `node scripts/fact-coverage-doc.js`.

## Where it stands

<!-- counts:start -->
Paths that show model text: 39. Before: 4 checked, 7 checked in part, 28 not checked. Now, with the switch on: 39 of 39 pass a model check before they are shown or stored.
<!-- counts:end -->

Switch: `FACT_CHECK_ALL`. On by default in this branch (`DEFAULT_ON` in `services/fact-guard.js`), because the owner decided the policy; `FACT_CHECK_ALL=0` restores the old behaviour exactly. `npm test` runs the older tests with it off, because they stub a single model answer that cannot also answer as the checker. `scripts/fact-coverage-test.js` turns it on and tests it.

"Passes a check" is not yet "100% fact checked" as the owner means it on every path. The open items are below, and until they close nothing in the product or the docs should claim it.

## The map

Found by following `services/ai.js` call sites and every `task:` in `services/` and `routes/`, not from memory. A set of rules that blocks numbers or words alone is counted as no check.

<!-- map:start -->
| What the learner sees | Task | Before (main at ab91559) | Now, with FACT_CHECK_ALL on: checked by | Against | If it says wrong or cannot run |
|---|---|---|---|---|---|
| The tutor dock on every page | `dock_help` | No check. A leak check, not a fact check | The guard, before it is shown: fact_live, mode general | the page the learner is on | a fixed sentence saying the reply was held (and one more try first when the check found a mistake) |
| Help inside a lesson part, a page, and the home chat | `assist_help` | No check | The guard, before it is shown: fact_live, mode general | the part or page they are on; none at home (general knowledge) | a fixed sentence |
| The question coach before answering, and the opener written ahead | `coach_turn` | No check. Streamed as written, leak guard only | The guard, before it is shown: fact_live, mode general | the question, key and stored explanation | a fixed sentence; a held opener is not stored |
| "Ask about this" after answering | `tutor_explain` | No check | The guard, before it is shown: fact_live, mode general | the question, key and stored explanation | a fixed sentence |
| The teaching chat after a failed checkpoint or essay | `remediation_teach` | No check | The guard, before it is shown: fact_live, mode general | what they got wrong and the diagnosis | a fixed sentence |
| The instant personal layer over a shared lesson | `part_layer` | No check. Rules only (numbers, words) | The guard, before it is stored: fact_live, mode overlay | the shared lesson, which already passed the level check | that piece is dropped; with too little left, no layer and the lesson stays open |
| Rewrites of feedback, hints, review prompts and stored uploaded lessons | `part_modify` | No check. Rules only (numbers kept, none added) | The guard, before it is stored: fact_live, mode source | the stored text being rewritten, with its question and key | the stored text stays; it was checked when it was written |
| A level page rewritten for one learner | `level_editor` | No check. Page structure and base comparison by rules | The guard, before it is stored: fact_live, mode source | the shared base page | the shared base page, or the ordinary session |
| The two short explanations the learner chooses between | `choice_pair` | No check | The guard, before it is stored: fact_live, mode general | general knowledge | no choice is offered |
| The after-level read, whose confirmed facts the scorecard page shows | `personalize_read` | No check | The guard, before it is stored: fact_live, mode general | general knowledge; statements about the learner are their own evidence (support from 2+ reads before they show) | that read is not stored |
| The debrief at the end of a session | `analyze_session` | No check | The guard, before it is stored: fact_live, mode general | general knowledge | the rule-based debrief, which holds no model text |
| Generated practice questions | `author_items` | No check. Shape rules only | The guard, before it is stored: fact_live, mode general | general knowledge, working the key out | that question is dropped; the bank fills the rest |
| Fresh questions for a checkpoint retry | `regen_items` | No check. Shape rules only | The guard, before it is stored: fact_live, mode general | general knowledge, working the key out | that question is dropped; the bank fills the rest |
| Master quizzes, Grand Master quizzes and the Final written for one learner | `checkpoint_fill` | Part: blind re-solve of multiple choice only, and only with no verifier key; typed questions and explanations none | The guard, before it is stored: fact_live, mode general | general knowledge, working the key out | that question is dropped; the bank fills its slot |
| Generated game questions | `game_questions` | Part: a blind judge only when explanation and key disagree by rule | The guard, before it is stored: fact_live, mode general | general knowledge, working the key out | that question is dropped; the writer is asked for more or the game is not served |
| A bank question restyled to an interest (also re-solved blind twice) | `theme` | Yes: two blind re-solves and a judge (the story around the question: no) | The guard, before it is stored: fact_live, mode general | general knowledge, plus two blind re-solves in services/item-theme.js | the plain bank question |
| Grading of a typed answer, and its feedback | `grade_free_response` | Part: the verdict by judges; the feedback line none | services/ai.js gradeFreeResponse: the judges vote on the verdict, and their feedback goes through fact-guard passesText | the question, the reference answer and the learner's answer | the verdict stands; the feedback is dropped and the stored explanation shows |
| The Spanish conversation partner | `spanish_partner_turn` | No check | The guard, before it is stored: fact_live, mode general | general knowledge of Spanish | the fixed partner line for that level |
| Marking and priorities on Spanish writing and speaking | `spanish_rubric` | No check | The guard, before it is stored: fact_live, mode general | general knowledge of Spanish | the rule-based mark |
| The short reaction on a Spanish activity | `spanish_reaction` | No check | The guard, before it is stored: fact_live, mode general | general knowledge of Spanish | no reaction, or the fixed one |
| Spanish units written ahead | `spanish_write_ahead` | Yes: review pass | services/spanish/unit-writer.js: a review pass (verdicts) keeps only what it passes | a second model re-reading each item | the item is dropped |
| Lessons and levels: the block text and graded checks | `block_fill` | Yes: verifyLevel, not served until passed | services/block-levels.js verifyLevel: claim-by-claim read and repairs; a level that has not passed is not served | the subject fact sheet and the verifier's own working | the bank lesson (the ordinary session) |
| Repairs of a level the verifier flagged | `fact_repair` | Yes: read again | services/block-levels.js verifyAndRepair: a repair is read again before the level can pass | the verifier's finding | the level is not served |
| The older single-page generated lesson (only while aiLessonsAllowed) | `lesson_write` | Part: maths rule, and a blind judge on flagged keys | The guard, before it is stored: fact_live, mode general | general knowledge; also math and key gates | the bank lesson |
| The same lesson when a learner is waiting | `lesson_write_urgent` | Part: maths rule, and a blind judge on flagged keys | The guard, before it is stored: fact_live, mode general | general knowledge; also math and key gates | the bank lesson |
| What went wrong on a failed checkpoint, with teaching and a worked problem | `diagnose` | No check | The guard, before it is stored: fact_live, mode general | general knowledge, working the worked problem out | the rule-based version, which holds no model text |
| An essay task and its guidance | `essay_prompt` | No check | The guard, before it is stored: fact_live, mode general | general knowledge | the course's stored prompt |
| Marks and comments on an essay | `essay_grade` | No check | The guard, before it is stored: fact_live, mode source | the task and what the learner wrote | the rule-based mark, labelled as such |
| Lessons of a course built from an upload (questions: material_verify) | `material_lesson` | Part: questions by material_verify; lesson paragraphs by rules only | The guard, before it is stored: fact_live, mode material | the passages of the upload; an outline-only topic is checked against general knowledge and labelled "general" | that paragraph is dropped; with none left the skill is dropped, never padded. Slot for services/material-factcheck.js (uploads-perfect) |
| A lesson shortened | `material_shorten` | No check. Rules only | The guard, before it is stored: fact_live, mode material | the passages of the upload | the longer checked lesson stays |
| A lesson rewritten for the learner | `material_follow` | No check. Rules only (no new number or name) | The guard, before it is stored: fact_live, mode material | the passages of the upload | the checked lesson stays |
| Facts the lesson had missed, added back | `material_sweep` | No check | The guard, before it is stored: fact_live, mode material | the sentences of the upload they come from | the fact is not added |
| Course outline: skill titles and one-line summaries | `material_outline` | No check | The guard, before it is stored: fact_live, mode material | the passages of the upload | that summary is blanked; the skill stays |
| Notes from an upload | `material_notes` | No check. A quote must exist, nothing reads whether the bullet says what the quote says | The guard, before it is stored: fact_live, mode material | the passages of the upload (each bullet also carries a word-for-word quote) | that bullet is dropped |
| Study pack: summary, flashcards, quiz and practice test | `material_pack` | Part: multiple choice and fill-in by material_verify; summary, cards and written items a quote only | The guard, before it is stored: fact_live, mode material | the passages of the upload (questions also pass material_verify) | that line, card or question is dropped |
| Podcast script from an upload | `material_podcast` | No check. A quote must exist | The guard, before it is stored: fact_live, mode material | the passages of the upload (a fact turn also carries a quote) | that turn is dropped; too few left and no podcast |
| Placement questions written for a subject | `placement_write` | No check when written live (the sets on disk went through their own pipeline judges) | The guard, before it is stored: fact_live, mode general | general knowledge, working the key out | that question is dropped; the set is built from what passed |
| Wrong options of a placement question rewritten | `placement_repair` | No check | The guard, before it is stored: fact_live, mode general | general knowledge: a new wrong option must not be right | the question keeps its old options |
| The sentence saying where to start after placement | `placement_recommend` | No check | The guard, before it is stored: fact_live, mode general | general knowledge; the placement scores are numbers from the code | the recommendation from the code, with no model sentence |
<!-- map:end -->

### Exempt (shown, no claim of fact)

<!-- exempt:start -->
- None. No task is exempt today: every task that shows model text goes through a check, greetings included.
<!-- exempt:end -->

### Never shown to a learner (no check needed)

<!-- internal:start -->
- `block_layout`: A plan of which blocks to use. No text of it is shown; what it leads to is block_fill.
- `material_verify`: The support check on upload questions: its verdicts are read by code, never shown.
- `fact_live`: This is the check itself (services/fact-guard.js).
- `fact_verify`: The level verifier.
- `fact_read`: The level verifier.
- `fact_claims`: The level verifier.
- `fact_research`: The level verifier's research sheet: read by the verifier, not by a learner.
- `key_check`: A key check: the verdict is read by code.
- `blind_mc`: A blind re-solve: the pick is read by code.
- `placement_key_judge`: A judge of placement keys: read by code.
- `placement_unit_judge`: A judge of placement units: read by code.
- `dock_leak_check`: YES or NO on whether a reply gives the answer away: read by code.
- `tutor_facts`: Notes about the learner, read from their own chat; they steer the tutor, whose replies are checked.
- `tutor_memory_fold`: The tutor's own memory summary, not shown as a statement; the replies built on it are checked.
- `tutor_vision`: A description of the learner's page for the tutor; the reply built on it is checked.
- `scorecard_transcript_read`: Scorecard evidence from a transcript: numbers read by code.
- `theme-solve`: A blind re-solve of a themed question: the pick is read by code.
- `pool_batch_test`: A load test of the pool in scripts/: never reaches a learner.
<!-- internal:end -->

### Text a learner sees that no model writes at that moment

| What | Where it comes from | Status |
|---|---|---|
| Daily plan, scorecard summary, reminders, tutor's offline reply, tutor how-to answers, held sentences | Code and fixed text (`services/daily-plan.js`, `services/scorecard/summary.js`, `services/tutor.js` offlineReply, `services/tutor-howto.js`) | No model at that moment |
| Bank questions and bank lessons (`content/`) | Written ahead by the build pipeline | Pipeline audits (research, audit, recheck). Not re-run here |
| Shared lessons and levels written ahead | `block_fill` in the build scripts | `verifyLevel`, the row above |
| Reading a reply aloud | Voice reads text that has already passed | Covered by the path that wrote it |
| Transcripts and OCR of a learner's own upload | Gladia, local OCR | This is the source, not a claim. Everything built from it is checked against it |

## How a check works

- **One way in.** Every model answer passes `withProviders` in `services/ai.js`, which calls `factGuard.pass` with the task. The registry row decides. A task with no row shows nothing, whether or not anyone remembered to add it, and the test fails.
- **The check is a real read.** A model reads the text with a strict prompt (work the sums out, flag only what is false), against general knowledge or against a source. Task `fact_live`. Another model family than the writer reads first where the check rests on general knowledge. If none answers in time, the writer's family reads it before anything is held. That is weaker, and the guard allows it because no check would mean no reply.
- **Pieces.** A batch is read piece by piece and only the flagged piece goes (a question, a bullet, a podcast turn, one analogy). Nothing is rewritten by the guard.
- **Live chat.** The reply is read whole before it shows. The coach no longer streams while the switch is on, since words on a screen cannot be taken back. If the check finds a mistake, the writer gets one more try with the finding, and that answer is checked too.
- **Stored text from before the guard.** Layers, rewritten feedback and hints, coach openers and cached generated questions carry a `fact_checked` mark; without it they are not served. See open item 2 for what else is stored.
- **The numbers** are kept in `fact_guard_stats`: per day and task, how many passed, were wrong or could not run, and how long they took. No learner and no text.

## When a check says wrong, or cannot run

| Case | What the learner gets |
|---|---|
| Tutor reply, check found a mistake twice | "I started to write an answer but my check found a mistake in it, so I held it back rather than risk teaching you something wrong. Could you ask that another way, or tell me which part you want to go over?" |
| Tutor reply, no checker could run | "I can't double-check my answer right now, so I would rather not guess. Please ask me again in a minute, or carry on with your lesson in the meantime." |
| Personal layer | No layer. The shared lesson stays open; the page removes the reserved space |
| Anything else | The fixed content that path already had (see the table): bank lesson, bank question, rule-based reading, stored explanation, or nothing |
| Every provider down | The writer gives nothing either, so the same fixed content, as today |
| Under-13 without consent (or no age given) | Nothing they say or are shown leaves this machine, checker included: the check runs through `services/ai.js` with their id. On a server with no local model that means fixed content only (tested: no outside slot is ever a candidate) |

Clicked through at phone width (375 x 812) in a real browser on a copy of the database, with the models replaced so a check could be made to fail: both tutor sentences read properly in the dock, nothing overflows, the next ordinary question is answered, and a layer whose check fails leaves the shared lesson open with no empty space.

## Uploads

The learner's material is the source. `material_*` rows use mode `material`: a statement must match their text, even where general knowledge disagrees. A fact from outside their text passes only if it is certainly true by general knowledge, otherwise it is flagged. Outline-only topics are checked against general knowledge and were already labelled "general" everywhere they show. This mode has unit tests of its routing but no measured catch rate of its own yet: the planted sets below are tutor, layer and lesson text.

Slot for the `uploads-perfect` build: its `services/material-factcheck.js` (sentence by sentence, with deterministic passes first) is stronger on lesson paragraphs. When it reaches main, keep the guard row for anything its own calls do not cover, and take care not to pay twice for the same sentence.

## 14 November

The owner's window for learner data on added providers ends 14 Nov. Who may check whose text:

| Learner | Today | After 14 Nov, nothing else decided |
|---|---|---|
| Adult, cleared | Coral, ZeroGPU GLM, NVIDIA | NVIDIA only |
| Under 13 with consent | Coral, ZeroGPU GLM, NVIDIA | NVIDIA only |
| Under 13 without consent | Local only (none on the server, so fixed content) | The same |

Measured with the window closed, on today's load: **18 of 18 tutor replies held and 0 of 4 layers shown**, because the shared free NVIDIA key answered 429 or timed out. Other builds were using that key at the time, so a quiet key will do better, but that has not been measured, and a beta on one free key is a risk in itself.

Finding: Coral's and Munito's own learner switches have no end date in code, against the owner's "up until november 14th". The check keeps to the window for Coral (`services/pool.js` refusal, `CORAL_LEARNER_UNTIL`). The writers on Coral, Munito and Gladia do not, and the owner should settle that on the 10 Nov question. Clearing one of Coral or ZeroGPU for the check keeps this page's speed and cost.

## What a check catches (measured, not a real-learner result)

AI-judged on planted errors and clean controls (`scripts/fact-guard-eval.js`, 6 Nov). The tutor and layer sets are hand-written, and easier than real mistakes. The lesson set is real lesson text with one subtle AI-planted error each, from `docs/fact-verifier-set.json`. Caught means it flagged the case.

| Checker | Tutor replies: caught, false alarms | Layers: caught, false alarms | Lesson text: caught, false alarms | Time p50 / p95 |
|---|---|---|---|---|
| Coral DeepSeek V4.1 Standard | 9/9, 0/17 (26 of 52 answered: the account's limit of 5 at once, shared with other builds) | 10/12, 0/12 | 16/36, 0/24 | 0.3 s / 0.6 s |
| ZeroGPU GLM-5.3 Flash | 24/24, 0/28 | 10/10, 0/12 (22 of 24 answered) | 16/36, 1/24 | tutor 1.2 to 2.7 s / 4 to 8 s; layer 6 to 7 s / 16 to 25 s |
| Either of the two | | | 17/36, 1/24 | |
| Gonka GLM-5.3 Flash | 23/23, 0/28 | | | 6.3 s / 21.6 s: too slow for live |
| NVIDIA GLM-5.3 Flash, free | 0 of 52 answered (429) | | | |
| NVIDIA Nemotron Ultra, free | | 0 of 24 answered | 3 of 60 answered | 4.7 s |

**Read this as:** plain errors are caught; more than half of the subtle ones in lesson text get through this fast check. Whole levels still get the slower `verifyLevel`. Raising the catch rate is the `fact-gate` build's job, and its `services/fact-code-checks.js` recomputes maths for free; `fact-guard.js` `recompute` picks it up the moment it is on main (it reads `checkLevel`, certain findings only).

Kimi K3.1 Pro: not justified. It answered only 6 of 60 (Lyceum "inference capacity exhausted"), caught 4 of 4 of what it answered, at p50 11 s and about $0.011 a call, roughly 50 times the chosen checkers. Too few answers to compare on catches, and too slow for live use anyway.

## Speed and cost

Measured on the real path with real models and simulated learners (12 extreme and random learners from a held-out seed x 3 lessons; 36 tutor questions across subjects), CPU about 57% with other builds running and sharing the keys. Simulated, not real-learner.

| Path | Without the check | Added by the check | Total | Shown |
|---|---|---|---|---|
| Tutor reply | writer p50 2.3 s, p95 3.7 s | p50 3.1 s, p95 6.5 s, worst 6.5 s | p50 5.2 s, p95 9.0 s | 36 of 36 (an earlier run, before the same-family last resort: 34 of 36, two held as "can't check") |
| Personal layer, from opening the lesson to the stored layer | lesson open at once, as before | about 0.3 to 1 s of the total | p50 2.1 s, p90 5.3 s, p95 6.5 s, worst 7.0 s (budget 14 s) | 36 of 36; each of the 12 learners 3 of 3 |

The check flagged none of these real answers, which is what a passing run looks like and is not proof they were right. I read a sample of the replies and layers: the tutor answers I read were correct, and the layers stayed on comparisons and reasons to care.

Cost per check from the ledgers (`by_task.fact_live`, settled, includes the larger lesson reads of the eval): **about $0.00015 on Coral and $0.00033 on ZeroGPU**. The cost tracker has no real learner days yet (no real use on this machine), so per-learner cost is modelled from those per-check costs, and is not a measured figure:

| Learner day | Checks | Added cost |
|---|---|---|
| Typical: 15 tutor turns, 2 levels with their layer and reads, 20 items' rewritten feedback, 1 debrief | about 60 | $0.01 to $0.02 |
| Heavy: 40 tutor turns, 6 levels, 60 items' rewritten feedback and hints, 5 diagnoses, 2 generated batches, a game, a checkpoint | about 200 | $0.03 to $0.07 |
| One upload built into notes, pack, podcast and a course (larger reads) | about 60 | about $0.03 |

Credit left on the PC's ledgers: Coral about $77 of $100, ZeroGPU about $235 of $245 (the server's ledgers are separate and must be added). That is thousands of learner-days. It fits, provided those two stay cleared. `scripts/fact-guard-cost.js` gives the real figure once the tracker has real days.

The check does not use up a learner's daily AI limit (`AI_DAILY_CALLS_PER_USER`). It would otherwise have halved it: found when a simulated learner hit the limit mid-run.

## Open, and what the owner decides

1. **After 14 Nov** (above): at least one of Coral or ZeroGPU must stay cleared for learner text for the check, or the tutor mostly holds. Ask on 10 Nov.
2. **Text already stored before the switch** is not all re-checked. On the 3 Nov database copy: 94 game payloads, 113 generated lessons, 1,261 generated items in old sessions, 2 essays. Layers, shaped feedback, openers and cached questions are handled. A beta on a fresh database has none of these; carrying the data over needs a re-check run, which is not built.
3. **`site/index.html` line 130** says "every lesson 100% fact-checked against credible sources". Lessons do pass a check, but checks do not always read outside sources: the free tier and this guard use model knowledge. I left the owner's page alone. Suggested wording: "every lesson fact-checked before you see it".
4. **Switches that lift the older gate:** `BLOCK_FACT_GATE=0` and `LEVEL_SELF_CHECK=off` still lift `verifyLevel`. Neither is set in `.env` today. Left as they are because tests use them.
5. **`TUTOR_FULL`:** its `factCheck` on the `tutor-full` branch would double the check on `dock_help`. Remove that call when it merges; its 14 s deadline (`TUTOR_DEADLINE_MS`) must also leave room for this one.
6. **Tutor reply time.** The check adds about 3 s at p50 because the writer is usually DeepSeek, so GLM reads first. A same-family reader first would add about 0.3 s, and is weaker on exactly the beliefs a model shares with itself. Left independent, as a real check is the point. The owner may prefer the speed.
