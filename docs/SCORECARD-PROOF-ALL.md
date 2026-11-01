# Scorecard proof, every kind of material

Run `full` (live models) on 2026-11-01. Written by `node scripts/scorecard-material-proof.js`.

> **This is a smoke run** (16 learners, 16 learner-topic cells, kinds: lesson, notes, podcast, test, pack, path), made to prove the pipeline end to end. It is too small to show a trend. The full proof is the command in the last section; running it rewrites this file.

For each learner and topic, the same short base text (what the learner "uploaded") is turned into each kind of material twice through the app's real generator: with the learner's **spec** (the learning spec in the prompt, built from their scorecard, survey and context) and **generic** (a learner we know nothing about: the default spec, no block). Kinds: Lesson, Notes, Podcast, Practice test, Study pack, Learning path. 16 learner-topic cells, 16 synthetic learners. Writer path: Standard Compute DeepSeek V4.1 Flash through the ledger (the free NVIDIA lineup was not answering). Writers: deepseek/deepseek-v4.1-flash-1017 x306.

Two judges from different model families, Gemini 3.8 Flash and Claude Sonnet 5.5 (both on Standard Compute, through the ledger), each read one learner's pair in a single call, **blind to which version is which** (labelled X and Y, order shuffled), and score each version 0 to 10 on every spec field that applies to that kind, plus key-fact coverage, accuracy, interests used, dislikes avoided and reading level. "Fit" is the mean of a kind's spec fields. A **win** is a cell where the spec version's fit is more than 0.25 above the generic one's; within 0.25 is a tie.

## Overview: spec against generic, every kind

| Kind | Cells | Gemini 3.8 Flash spec | generic | gain | Claude Sonnet 5.5 spec | generic | gain | Wins (judge 1 / 2) | Judges agree |
|---|---|---|---|---|---|---|---|---|---|
| Lesson | 16/16 | 9.2 | 5.2 | +4.0 | 7.6 | 4.3 | +3.3 | 16 of 16 / 16 of 16 | 16 of 16 |
| Notes | 16/16 | 7.8 | 6.6 | +1.2 | 6.7 | 5.6 | +1.1 | 13 of 16 / 11 of 16 | 14 of 16 |
| Podcast | 14/16 | 7.2 | 5.8 | +1.4 | 6.0 | 4.5 | +1.5 | 11 of 14 / 9 of 14 | 10 of 14 |
| Practice test | 16/16 | 8.3 | 5.3 | +3.1 | 6.8 | 4.6 | +2.3 | 16 of 16 / 16 of 16 | 16 of 16 |
| Study pack | 14/16 | 8.5 | 6.0 | +2.5 | 7.2 | 5.1 | +2.1 | 13 of 14 / 13 of 14 | 13 of 14 |
| Learning path | 16/16 | 8.0 | 4.1 | +3.9 | 6.5 | 3.7 | +2.8 | 16 of 16 / 15 of 16 | 15 of 16 |

Across all kinds: Gemini 3.8 Flash found the spec version better in 85 of 92 comparisons and worse in 1; Claude Sonnet 5.5 found the spec version better in 80 of 92 comparisons and worse in 3.

## Lesson

Real generator: `services/ai.js` `generateLesson` (the spec block, the post-check and one revision). What is judged: one short lesson (intro, sections, a worked example, a summary and check questions) on the topic.

| Spec field (0 to 10) | Gemini 3.8 Flash generic | spec | gain | Claude Sonnet 5.5 generic | spec | gain | n |
|---|---|---|---|---|---|---|---|
| Lesson and chunk length | 4.6 | 8.8 | +4.2 | 3.8 | 6.2 | +2.4 | 16 |
| Pacing | 6.4 | 9.0 | +2.6 | 4.5 | 6.8 | +2.3 | 16 |
| Retrieval checks | 4.6 | 9.9 | +5.4 | 3.1 | 8.4 | +5.4 | 16 |
| Difficulty start and ramp | 6.8 | 9.2 | +2.4 | 4.8 | 7.0 | +2.3 | 16 |
| Scaffolding and hint size | 4.8 | 9.9 | +5.1 | 3.9 | 8.6 | +4.7 | 16 |
| Worked example to practice | 2.9 | 9.2 | +6.3 | 1.6 | 7.1 | +5.6 | 16 |
| Explanation modes | 5.5 | 8.7 | +3.2 | 4.7 | 7.3 | +2.6 | 16 |
| Vocabulary level | 5.6 | 8.7 | +3.1 | 5.3 | 7.8 | +2.5 | 16 |
| Sentence length | 5.6 | 8.4 | +2.8 | 6.1 | 8.1 | +1.9 | 16 |
| Examples from interests | 0.2 | 9.6 | +9.4 | 0.4 | 8.6 | +8.2 | 16 |
| Avoided domains | 9.6 | 9.9 | +0.3 | 9.8 | 9.8 | +0.0 | 16 |
| Tone and feedback | 6.1 | 9.3 | +3.2 | 4.9 | 7.0 | +2.1 | 16 |
| Structure and format | 6.1 | 9.2 | +3.1 | 4.8 | 6.9 | +2.1 | 16 |
| Challenge and novelty | 3.9 | 9.1 | +5.2 | 3.3 | 7.6 | +4.3 | 16 |
| **Fit (mean of the fields)** | **5.2** | **9.2** | **+4.0** | **4.3** | **7.6** | **+3.3** |  |
| Key-fact coverage | 8.4 | 10.0 | +1.6 | 7.1 | 9.9 | +2.8 |  |
| Accuracy | 10.0 | 10.0 | +0.0 | 8.6 | 8.8 | +0.2 |  |
| Interests used | 0.2 | 9.6 | +9.4 | 0.3 | 9.0 | +8.8 |  |
| Dislikes avoided | 9.2 | 9.9 | +0.7 | 9.2 | 9.9 | +0.8 |  |
| Age-appropriate reading level | 5.4 | 9.3 | +3.8 | 5.1 | 8.4 | +3.4 |  |

**Wins:** Gemini 3.8 Flash 16 of 16 (0 ties, 0 worse); Claude Sonnet 5.5 16 of 16 (0 ties, 0 worse).

**Agreement between the judges:** the same verdict (spec better, tie or worse) in 16 of 16 cells; both found the spec version better in 16; opposite verdicts in 0. Correlation of the spec-minus-generic gain across cells 0.88; of the fit scores themselves 0.98; on average the two judges' fit scores for the same text differ by 1.2 points.

**Per-field weaknesses** (mean of both judges): lowest for the spec version: lesson and chunk length 7.5, pacing 7.9, explanation modes 8.0. Smallest gain over generic: avoided domains +0.2, difficulty start and ramp +2.3, sentence length +2.3.

**Learners the spec fitted least well:** Omar 8.0, Lena 8.1, Ava 8.2.

**Key facts the judges found missing:** generic/causes of World War I: nationalism in Balkans barely covered (x3); generic/causes of World War I: militarism absent (x2); generic/causes of World War I: imperialism absent (x2); generic/causes of World War I: Imperialism and rivalry for colonies (x2); generic/causes of World War I: Militarism absent (x2).

**What the code measured in the text (no model):**

| Measure (mean over cells) | spec | generic |
|---|---|---|
| Words | 526.8 | 451.7 |
| MeanSentenceWords | 12.3 | 14.0 |
| LongWordShare | 0.0 | 0.0 |
| Sections | 3.8 | 3.0 |
| Checks | 2.7 | 4.0 |
| Cells that used a disliked domain | 0 | 0 |
| Cells that used a stated interest (of those with interests) | 14 of 16 | 2 of 16 |
| Key facts missing by term overlap (of all) | 0 of 80 | 25 of 80 |

## Notes

Real generator: `services/material-notes.js` `build` (surface `notes`). What is judged: study notes: sections of one-sentence bullets that outline the base text in the order it teaches.

| Spec field (0 to 10) | Gemini 3.8 Flash generic | spec | gain | Claude Sonnet 5.5 generic | spec | gain | n |
|---|---|---|---|---|---|---|---|
| Bullet size | 8.2 | 7.0 | -1.2 | 6.9 | 6.9 | +0.0 | 16 |
| Brevity | 8.5 | 8.0 | -0.5 | 7.1 | 6.6 | -0.5 | 16 |
| Density layout | 7.6 | 7.9 | +0.3 | 6.2 | 6.4 | +0.2 | 16 |
| Vocabulary level | 6.4 | 7.6 | +1.2 | 5.7 | 6.9 | +1.3 | 16 |
| Sentence length | 6.3 | 6.3 | +0.1 | 5.3 | 6.6 | +1.3 | 16 |
| Register | 8.5 | 8.9 | +0.4 | 7.1 | 7.3 | +0.1 | 16 |
| Interest analogies | 0.0 | 8.1 | +8.1 | 0.0 | 6.1 | +6.1 | 16 |
| Rigor | 9.5 | 9.5 | +0.0 | 9.0 | 6.5 | -2.5 | 2 |
| Avoided domains | 10.0 | 10.0 | +0.0 | 10.0 | 8.0 | -2.0 | 2 |
| **Fit (mean of the fields)** | **6.6** | **7.8** | **+1.2** | **5.6** | **6.7** | **+1.1** |  |
| Key-fact coverage | 10.0 | 9.9 | -0.1 | 9.9 | 9.7 | -0.3 |  |
| Accuracy | 10.0 | 10.0 | +0.0 | 10.0 | 8.8 | -1.3 |  |
| Interests used | 0.0 | 8.4 | +8.4 | 0.0 | 7.1 | +7.1 |  |
| Dislikes avoided | 8.9 | 9.1 | +0.2 | 8.9 | 8.8 | -0.1 |  |
| Age-appropriate reading level | 6.6 | 8.0 | +1.4 | 6.1 | 7.4 | +1.3 |  |

**Wins:** Gemini 3.8 Flash 13 of 16 (3 ties, 0 worse); Claude Sonnet 5.5 11 of 16 (5 ties, 0 worse).

**Agreement between the judges:** the same verdict (spec better, tie or worse) in 14 of 16 cells; both found the spec version better in 11; opposite verdicts in 0. Correlation of the spec-minus-generic gain across cells 0.90; of the fit scores themselves 0.90; on average the two judges' fit scores for the same text differ by 1.1 points.

**Per-field weaknesses** (mean of both judges): lowest for the spec version: sentence length 6.4, bullet size 6.9, interest analogies 7.1. Smallest gain over generic: rigor -1.3, avoided domains -1.0, bullet size -0.6. **Fields where generic scored higher: bullet size -0.6, brevity -0.5, rigor -1.3, avoided domains -1.0**.

**Learners the spec fitted least well:** Maya 4.6, Omar 6.1, Leo 6.2.

**Key facts the judges found missing:** spec/two-step equations: Omits intermediate 2x=8 result in step one; spec/two-step equations: The 2x = 8 intermediate result is omitted; spec/two-step equations: x = 4 for the first example is only shown in the check; spec/two-step equations: missing the intermediate result 2x = 8 in step one; spec/two-step equations: Intermediate result 2x = 8 not stated.

**What the code measured in the text (no model):**

| Measure (mean over cells) | spec | generic |
|---|---|---|
| Words | 326.2 | 225.1 |
| MeanSentenceWords | 17.3 | 18.2 |
| LongWordShare | 0.0 | 0.0 |
| Sections | 4.8 | 4.6 |
| Bullets | 16.9 | 14.1 |
| BulletsPerSection | 3.6 | 3.1 |
| MeanBulletWords | 18.7 | 15.7 |
| Cells that used a disliked domain | 0 | 0 |
| Cells that used a stated interest (of those with interests) | 11 of 16 | 1 of 16 |
| Key facts missing by term overlap (of all) | 2 of 80 | 0 of 80 |

## Podcast

Real generator: `services/material-podcast.js` `build` (surface `podcast`; check-in spacing by `checkinSlots`). What is judged: a short two-host podcast script (host A explains, host B asks) that talks through the base text; the marks [CHECK-IN QUESTION] show where the app would pause to ask the listener a question.

Cells that did not complete: Zoe/causes of World War I: spec: An episode could not be made from that material. Try a longer or clearer text.; Ruth/causes of World War I: spec: An episode could not be made from that material. Try a longer or clearer text..

| Spec field (0 to 10) | Gemini 3.8 Flash generic | spec | gain | Claude Sonnet 5.5 generic | spec | gain | n |
|---|---|---|---|---|---|---|---|
| Pacing length | 7.4 | 6.7 | -0.6 | 5.6 | 5.6 | +0.0 | 14 |
| Vocabulary spoken | 5.9 | 7.3 | +1.4 | 5.2 | 7.0 | +1.8 | 14 |
| Sentence length | 6.4 | 8.6 | +2.3 | 5.3 | 8.6 | +3.3 | 14 |
| Check in frequency | 0.0 | 5.5 | +5.5 | 0.3 | 2.3 | +2.0 | 4 |
| Dialogue style | 7.6 | 7.6 | +0.0 | 5.3 | 5.9 | +0.6 | 14 |
| Tone | 7.0 | 7.9 | +0.9 | 5.2 | 6.3 | +1.1 | 14 |
| Explanation order | 6.1 | 7.1 | +1.0 | 4.4 | 5.6 | +1.1 | 7 |
| Interest analogies | 0.0 | 5.1 | +5.1 | 0.0 | 3.6 | +3.6 | 14 |
| Repetition recap | 7.8 | 5.8 | -2.0 | 5.8 | 4.0 | -1.8 | 4 |
| Avoided domains | 10.0 | 10.0 | +0.0 | 9.0 | 9.0 | +0.0 | 2 |
| **Fit (mean of the fields)** | **5.8** | **7.2** | **+1.4** | **4.5** | **6.0** | **+1.5** |  |
| Key-fact coverage | 10.0 | 7.9 | -2.1 | 9.8 | 7.4 | -2.4 |  |
| Accuracy | 10.0 | 9.7 | -0.3 | 9.9 | 8.4 | -1.6 |  |
| Interests used | 0.0 | 5.3 | +5.3 | 0.0 | 4.2 | +4.2 |  |
| Dislikes avoided | 8.1 | 8.9 | +0.9 | 7.8 | 8.4 | +0.6 |  |
| Age-appropriate reading level | 6.6 | 8.1 | +1.6 | 5.8 | 7.8 | +2.0 |  |

**Wins:** Gemini 3.8 Flash 11 of 14 (2 ties, 1 worse); Claude Sonnet 5.5 9 of 14 (3 ties, 2 worse). Cells where the spec version scored worse: Gemini 3.8 Flash: Sam/photosynthesis 5.4 vs 7.1 | Claude Sonnet 5.5: Frank/two-step equations 4.8 vs 5.8; Lena/photosynthesis 5.5 vs 6.2.

**Agreement between the judges:** the same verdict (spec better, tie or worse) in 10 of 14 cells; both found the spec version better in 9; opposite verdicts in 1. Correlation of the spec-minus-generic gain across cells 0.80; of the fit scores themselves 0.89; on average the two judges' fit scores for the same text differ by 1.2 points.

**Per-field weaknesses** (mean of both judges): lowest for the spec version: check in frequency 3.9, interest analogies 4.4, repetition recap 4.9. Smallest gain over generic: repetition recap -1.9, pacing length -0.3, avoided domains +0.0. **Fields where generic scored higher: pacing length -0.3, repetition recap -1.9**.

**Learners the spec fitted least well:** Maya 4.3, Frank 5.3, Sam 5.4.

**Key facts the judges found missing:** spec/photosynthesis: Oxygen is released as a by-product; spec/photosynthesis: Full role of chlorophyll absorbing light not finished; spec/photosynthesis: Oxygen as by-product absent; spec/photosynthesis: Chlorophyll absorbing light not stated; spec/photosynthesis: Word equation absent.

**What the code measured in the text (no model):**

| Measure (mean over cells) | spec | generic |
|---|---|---|
| Words | 347.6 | 336.2 |
| MeanSentenceWords | 9.8 | 13.2 |
| LongWordShare | 0.0 | 0.0 |
| Turns | 24.2 | 25.8 |
| WordsPerTurn | 14.9 | 13.9 |
| BQuestions | 6.5 | 11.1 |
| CheckIns | 0.2 | 0.1 |
| SpokenMinutes | 2.3 | 2.2 |
| Cells that used a disliked domain | 0 | 0 |
| Cells that used a stated interest (of those with interests) | 6 of 14 | 1 of 14 |
| Key facts missing by term overlap (of all) | 11 of 70 | 5 of 70 |

## Practice test

Real generator: `services/course-builder.js` `build` (the questions) then `services/material-test.js` `start` (length, order, timing). What is judged: a practice test on the base text: the questions in the order they are asked, each with its tier (1 recall, 2 use, 3 combine or a new setting), its answer and the explanation shown after a miss.

| Spec field (0 to 10) | Gemini 3.8 Flash generic | spec | gain | Claude Sonnet 5.5 generic | spec | gain | n |
|---|---|---|---|---|---|---|---|
| Difficulty start | 4.9 | 9.6 | +4.7 | 3.8 | 8.1 | +4.3 | 16 |
| Difficulty ramp | 2.1 | 8.9 | +6.8 | 2.1 | 6.8 | +4.7 | 16 |
| Question format | 9.8 | 9.9 | +0.1 | 7.6 | 8.4 | +0.8 | 16 |
| Feedback detail | 8.6 | 9.8 | +1.2 | 6.8 | 7.8 | +1.0 | 16 |
| Stakes tone | 6.1 | 7.4 | +1.4 | 5.3 | 6.2 | +0.9 | 16 |
| Wording | 5.9 | 7.6 | +1.8 | 6.3 | 7.4 | +1.1 | 16 |
| Warmup | 0.0 | 6.3 | +6.3 | 0.3 | 4.0 | +3.7 | 3 |
| Interest analogies | 0.0 | 5.4 | +5.4 | 0.0 | 3.3 | +3.3 | 16 |
| Avoided domains | 9.0 | 10.0 | +1.0 | 9.5 | 9.5 | +0.0 | 2 |
| **Fit (mean of the fields)** | **5.3** | **8.3** | **+3.1** | **4.6** | **6.8** | **+2.3** |  |
| Key-fact coverage | 9.5 | 8.9 | -0.6 | 8.1 | 7.8 | -0.3 |  |
| Accuracy | 10.0 | 9.9 | -0.1 | 9.4 | 8.8 | -0.6 |  |
| Interests used | 0.0 | 5.4 | +5.4 | 0.0 | 3.7 | +3.7 |  |
| Dislikes avoided | 7.1 | 8.4 | +1.3 | 7.8 | 8.3 | +0.6 |  |
| Age-appropriate reading level | 6.7 | 8.4 | +1.7 | 6.6 | 8.3 | +1.7 |  |

**Wins:** Gemini 3.8 Flash 16 of 16 (0 ties, 0 worse); Claude Sonnet 5.5 16 of 16 (0 ties, 0 worse).

**Agreement between the judges:** the same verdict (spec better, tie or worse) in 16 of 16 cells; both found the spec version better in 16; opposite verdicts in 0. Correlation of the spec-minus-generic gain across cells 0.91; of the fit scores themselves 0.95; on average the two judges' fit scores for the same text differ by 1.1 points.

**Per-field weaknesses** (mean of both judges): lowest for the spec version: interest analogies 4.3, warmup 5.2, stakes tone 6.8. Smallest gain over generic: question format +0.5, avoided domains +0.5, feedback detail +1.1.

**Learners the spec fitted least well:** Maya 5.2, Frank 6.6, Leo 6.8.

**Key facts the judges found missing:** spec/photosynthesis: Chlorophyll in chloroplasts of leaves absorbs light; spec/photosynthesis: Photosynthesis happens mainly in leaves; spec/photosynthesis: Plants make glucose from CO2 and water only in equation; spec/photosynthesis: Photosynthesis mainly in leaves not tested; spec/photosynthesis: Light energy from sun barely covered.

**What the code measured in the text (no model):**

| Measure (mean over cells) | spec | generic |
|---|---|---|
| Questions | 10.4 | 10.0 |
| MeanSentenceWords | 10.4 | 12.8 |
| LongWordShare | 0.0 | 0.0 |
| FirstTier | 1.3 | 2.4 |
| TypedShare | 0.3 | 0.2 |
| MeanExplanationWords | 18.8 | 13.9 |
| TestWordHits | 0.0 | 0.0 |
| SecondsPerQuestion | 86.7 | 75.0 |
| Cells that used a disliked domain | 0 | 0 |
| Cells that used a stated interest (of those with interests) | 11 of 16 | 1 of 16 |
| Key facts missing by term overlap (of all) | 24 of 80 | 25 of 80 |

## Study pack

Real generator: `services/material-pack.js` `build` (surface `material` plus the question shape). What is judged: a study pack: a short summary, flashcards, a quiz and a practice test, all from the base text.

Cells that did not complete: Frank/two-step equations: spec: The models were busy, so the pack could not be built yet.; Chloe/causes of World War I: spec: The models were busy, so the pack could not be built yet..

| Spec field (0 to 10) | Gemini 3.8 Flash generic | spec | gain | Claude Sonnet 5.5 generic | spec | gain | n |
|---|---|---|---|---|---|---|---|
| Summary style | 5.7 | 7.5 | +1.8 | 4.7 | 7.1 | +2.4 | 14 |
| Aid amounts | 7.6 | 8.0 | +0.4 | 7.0 | 7.1 | +0.1 | 14 |
| Vocabulary level | 5.9 | 8.0 | +2.1 | 5.9 | 7.7 | +1.9 | 14 |
| Sentence length | 5.9 | 8.5 | +2.6 | 5.2 | 7.9 | +2.7 | 14 |
| Question ramp | 4.2 | 9.1 | +4.9 | 3.6 | 7.4 | +3.8 | 14 |
| Question format | 9.6 | 9.4 | -0.2 | 7.9 | 8.1 | +0.2 | 14 |
| Explanations | 8.8 | 9.8 | +1.0 | 6.4 | 8.2 | +1.8 | 14 |
| Stakes tone | 6.6 | 8.7 | +2.1 | 5.1 | 6.8 | +1.6 | 14 |
| Interest analogies | 0.0 | 7.7 | +7.7 | 0.0 | 4.6 | +4.6 | 14 |
| Avoided domains | 2.0 | 7.0 | +5.0 | 5.0 | 7.0 | +2.0 | 1 |
| **Fit (mean of the fields)** | **6.0** | **8.5** | **+2.5** | **5.1** | **7.2** | **+2.1** |  |
| Key-fact coverage | 10.0 | 9.7 | -0.3 | 9.1 | 9.0 | -0.1 |  |
| Accuracy | 10.0 | 10.0 | +0.0 | 9.9 | 8.9 | -1.0 |  |
| Interests used | 0.0 | 7.7 | +7.7 | 0.0 | 5.4 | +5.4 |  |
| Dislikes avoided | 6.0 | 8.5 | +2.5 | 6.9 | 8.9 | +2.1 |  |
| Age-appropriate reading level | 5.6 | 8.7 | +3.1 | 5.6 | 8.4 | +2.8 |  |

**Wins:** Gemini 3.8 Flash 13 of 14 (1 ties, 0 worse); Claude Sonnet 5.5 13 of 14 (0 ties, 1 worse). Cells where the spec version scored worse: Claude Sonnet 5.5: Ruth/causes of World War I 5.9 vs 6.7.

**Agreement between the judges:** the same verdict (spec better, tie or worse) in 13 of 14 cells; both found the spec version better in 13; opposite verdicts in 0. Correlation of the spec-minus-generic gain across cells 0.93; of the fit scores themselves 0.92; on average the two judges' fit scores for the same text differ by 1.1 points.

**Per-field weaknesses** (mean of both judges): lowest for the spec version: interest analogies 6.2, avoided domains 7.0, summary style 7.3. Smallest gain over generic: question format +0.0, aid amounts +0.3, explanations +1.4.

**Learners the spec fitted least well:** Ruth 6.3, Maya 7.1, Leo 7.3.

**Key facts the judges found missing:** spec/photosynthesis: Oxygen by-product only in IN/OUT list, thin in summary; spec/two-step equations: Checking the answer omitted from summary, though present in cards.; generic/causes of World War I: Imperialism and colonies only lightly covered in summary; generic/causes of World War I: Serbia detail appears only in flashcards and test; spec/two-step equations: Step two (divide) shown only in examples, not stated as a general rule.

**What the code measured in the text (no model):**

| Measure (mean over cells) | spec | generic |
|---|---|---|
| Words | 718.2 | 701.7 |
| MeanSentenceWords | 13.1 | 16.8 |
| LongWordShare | 0.0 | 0.0 |
| SummaryParagraphs | 3.6 | 3.4 |
| Cards | 6.9 | 8.0 |
| Quiz | 3.0 | 4.0 |
| TestItems | 4.6 | 5.1 |
| TypedShare | 0.4 | 0.4 |
| MeanExplanationWords | 18.2 | 14.7 |
| TestWordHits | 0.0 | 0.0 |
| Cells that used a disliked domain | 0 | 0 |
| Cells that used a stated interest (of those with interests) | 8 of 14 | 1 of 14 |
| Key facts missing by term overlap (of all) | 1 of 70 | 0 of 70 |

## Learning path

Real generator: `services/course-builder.js` `build` (surface `material`). What is judged: a learning path: the skills in order, each with its short lesson text and key points, all from the base text.

| Spec field (0 to 10) | Gemini 3.8 Flash generic | spec | gain | Claude Sonnet 5.5 generic | spec | gain | n |
|---|---|---|---|---|---|---|---|
| Lesson chunking | 3.4 | 7.3 | +3.9 | 3.6 | 5.9 | +2.4 | 16 |
| Vocabulary level | 5.1 | 8.0 | +2.9 | 5.4 | 7.4 | +2.1 | 16 |
| Sentence length | 5.6 | 7.8 | +2.2 | 5.1 | 7.8 | +2.7 | 16 |
| Density layout | 3.9 | 7.8 | +3.9 | 4.0 | 6.1 | +2.1 | 16 |
| Explanation order | 6.4 | 8.4 | +2.1 | 4.8 | 6.4 | +1.6 | 16 |
| Pace repetition | 2.9 | 7.4 | +4.5 | 2.7 | 5.3 | +2.6 | 16 |
| Tone | 5.8 | 8.6 | +2.9 | 4.4 | 6.7 | +2.3 | 16 |
| Explanation modes | 3.4 | 8.0 | +4.6 | 2.8 | 6.1 | +3.3 | 16 |
| Interest analogies | 0.0 | 8.2 | +8.2 | 0.0 | 6.3 | +6.3 | 16 |
| Avoided domains | 4.5 | 9.0 | +4.5 | 6.0 | 7.5 | +1.5 | 2 |
| **Fit (mean of the fields)** | **4.1** | **8.0** | **+3.9** | **3.7** | **6.5** | **+2.8** |  |
| Key-fact coverage | 10.0 | 10.0 | +0.0 | 9.6 | 9.7 | +0.1 |  |
| Accuracy | 10.0 | 10.0 | +0.0 | 9.9 | 8.8 | -1.2 |  |
| Interests used | 0.0 | 8.4 | +8.4 | 0.0 | 7.4 | +7.4 |  |
| Dislikes avoided | 6.0 | 8.1 | +2.1 | 6.4 | 7.4 | +0.9 |  |
| Age-appropriate reading level | 5.3 | 8.4 | +3.1 | 4.9 | 7.8 | +2.8 |  |

**Wins:** Gemini 3.8 Flash 16 of 16 (0 ties, 0 worse); Claude Sonnet 5.5 15 of 16 (1 ties, 0 worse).

**Agreement between the judges:** the same verdict (spec better, tie or worse) in 15 of 16 cells; both found the spec version better in 15; opposite verdicts in 0. Correlation of the spec-minus-generic gain across cells 0.80; of the fit scores themselves 0.92; on average the two judges' fit scores for the same text differ by 1.1 points.

**Per-field weaknesses** (mean of both judges): lowest for the spec version: pace repetition 6.3, lesson chunking 6.6, density layout 7.0. Smallest gain over generic: explanation order +1.8, sentence length +2.4, vocabulary level +2.5.

**Learners the spec fitted least well:** Ethan 5.9, Maya 6.1, Lena 6.6.

**Key facts the judges found missing:** spec/two-step equations: Skill 1 leaves the second example's final step to the learner; spec/causes of World War I: Skill 4 lacks Balkans/Serbia and the spark in its lesson; spec/causes of World War I: Skill 1 is labeled Alliances but covers everything; generic/causes of World War I: Skill focus is blurred: every skill repeats all five facts; generic/causes of World War I: Skill key points are thin on imperialism and nationalism detail.

**What the code measured in the text (no model):**

| Measure (mean over cells) | spec | generic |
|---|---|---|
| Words | 1503.0 | 1112.3 |
| MeanSentenceWords | 13.7 | 16.0 |
| LongWordShare | 0.0 | 0.0 |
| Skills | 3.6 | 4.4 |
| ParagraphsPerSkill | 8.3 | 4.1 |
| WordsPerParagraph | 41.9 | 49.4 |
| SentencesPerParagraph | 3.4 | 3.0 |
| QuestionsPerSkill | 7.8 | 8.2 |
| Cells that used a disliked domain | 0 | 0 |
| Cells that used a stated interest (of those with interests) | 14 of 16 | 2 of 16 |
| Key facts missing by term overlap (of all) | 1 of 80 | 0 of 80 |

## Systemic patterns across learners and kinds

- Fields that recur across kinds, lowest first: interest analogies (notes, podcast, test, pack, path) spec 5.8, gain +5.8; explanation order (podcast, path) spec 6.9, gain +1.5; density layout (notes, path) spec 7.1, gain +1.6; stakes tone (test, pack) spec 7.3, gain +1.5.
- Kind with the smallest overall gain: notes +1.2; the largest: lesson +3.7.
- Learners the spec fitted least well across all kinds: Maya 5.9, Leo 7.0, Frank 7.3.
- **Interests in own-material kinds.** The learner's interests, hobbies and dislikes shape their own material too, with the text as the only source of facts: interests appear only as clearly framed analogies, examples or practice contexts that map back to a point of the text (`analogyProblems` in `services/learning-spec.js` checks that one adds no number, name or point the text lacks, and each generator falls back to the text's own words when it does). Cells where the spec version used a stated interest, of those with interests: lesson 14 of 16 (generic 2); notes 11 of 16 (generic 1); podcast 6 of 14 (generic 1); practice test 11 of 16 (generic 1); study pack 8 of 14 (generic 1); learning path 14 of 16 (generic 2). Spec versions that used a disliked domain: lesson 0, notes 0, podcast 0, test 0, pack 0, path 0. Analogies the check would flag in the spec version: lesson 0.0 per cell, notes 0.0 per cell, podcast 0.0 per cell, test 0.1 per cell, pack 0.0 per cell, path 0.1 per cell. The one lever own material still withholds is `depth` (one deeper why or edge case), which would bring facts the text lacks.
- Cells that did not complete: podcast Zoe/causes of World War I: spec: An episode could not be made from that material. Try a longer or clearer text.; podcast Ruth/causes of World War I: spec: An episode could not be made from that material. Try a longer or clearer text.; pack Frank/two-step equations: spec: The models were busy, so the pack could not be built yet.; pack Chloe/causes of World War I: spec: The models were busy, so the pack could not be built yet..

## Limits of this proof

- **Fit to the spec is not learning.** The judges score how well a version follows what the spec asks for and whether it keeps the base text's facts. They cannot measure that a real learner understands more or remembers longer. Only people learning from these materials can show that.
- **One writer, two judges.** Every spec and generic version was written by deepseek/deepseek-v4.1-flash-1017 and judged by Gemini 3.8 Flash and Claude Sonnet 5.5. Two families lower the risk that one model's taste decides the result, and the table above reports how often they agree, but both are still language models, and Gemini ran with low reasoning effort to keep the cost down.
- **A pair in one call.** Each judge scores the two versions of a learner side by side (blind, shuffled). That makes the comparison sharp but lets a judge contrast them; it is not two independent absolute ratings.
- **Short base texts.** Each topic's base text is about 1,300 to 1,800 characters. Longer material exercises more of the pipeline (several passages per call, longer scripts, more check-ins); this proof does not.
- **Podcast check-ins** are placed by the app's own `checkinSlots` from the script length and the spec (a check-in about every 2, 3 or 4 minutes of speech); a real episode pairs them with questions from the learning path. The judge sees the marks, not the questions. With a short base text the script is under two minutes of speech and has no check-in at all, in which case the field is left out of the judged fields for that cell and only the code count (above) speaks for it. A longer base text is needed to exercise it.
- **Practice test.** The questions are written once per learner by the course builder (with the spec's question shape in the prompt) and then ordered, sized and timed by `material-test`; a test never writes new questions at start time.
- **Synthetic learners.** Sixteen invented profiles with settled scorecards; most dislikes in them are of a subject or a format (maths, long reading, being timed), so the avoided-domain path is exercised less than the rest.
- **Fixes this work made** are listed in the commit; the generators that were not receiving the spec, or lost it, were fixed in the mechanism (see the commit message).

## Cost

- Standard Compute spend by this run: $3.3466 through the ledger (assumed prices, an upper bound), 306 writer calls and 182 judge calls (google/gemini-3.8-flash x92, anthropic/claude-sonnet-5.5 x90).
- Ledger: before spent $17.260975 (2767 calls, headroom $12.739025); after spent $21.17012 (3365 calls, headroom $8.82988).

## Running the full proof

```
node -r dotenv/config scripts/scorecard-material-proof.js --live --kind=all --learners=16 --tag full
```

with `DOTENV_CONFIG_PATH` set to the owner's `.env` and `STANDARD_COMPUTE_LEDGER_FILE` set to the real ledger (the script already defaults to both paths). Add `--writer sc` to write with Standard Compute DeepSeek V4.1 Flash instead of probing the free lineup, `--kind=notes,pack` for some kinds, `--learners=4 --topics=1` for fewer cells, `--budget USD` to stop at a spend, and re-run with the same cache file to pay only for what changed.
