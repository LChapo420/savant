# Scorecard proof, every kind of material

Run `smoke` (live models) on 2026-10-31. Written by `node scripts/scorecard-material-proof.js`.

> **This is a smoke run** (2 learners, 2 learner-topic cells, kinds: lesson, notes, podcast, test, pack, path), made to prove the pipeline end to end. It is too small to show a trend. The full proof is the command in the last section; running it rewrites this file.

For each learner and topic, the same short base text (what the learner "uploaded") is turned into each kind of material twice through the app's real generator: with the learner's **spec** (the learning spec in the prompt, built from their scorecard, survey and context) and **generic** (a learner we know nothing about: the default spec, no block). Kinds: Lesson, Notes, Podcast, Practice test, Study pack, Learning path. 2 learner-topic cells, 2 synthetic learners. Writer path: Standard Compute DeepSeek V4.1 Flash through the ledger (the free NVIDIA lineup was not answering). Writers: n/a.

Two judges from different model families, Gemini 3.8 Flash and Claude Sonnet 5.5 (both on Standard Compute, through the ledger), each read one learner's pair in a single call, **blind to which version is which** (labelled X and Y, order shuffled), and score each version 0 to 10 on every spec field that applies to that kind, plus key-fact coverage, accuracy, interests used, dislikes avoided and reading level. "Fit" is the mean of a kind's spec fields. A **win** is a cell where the spec version's fit is more than 0.25 above the generic one's; within 0.25 is a tie.

## Overview: spec against generic, every kind

| Kind | Cells | Gemini 3.8 Flash spec | generic | gain | Claude Sonnet 5.5 spec | generic | gain | Wins (judge 1 / 2) | Judges agree |
|---|---|---|---|---|---|---|---|---|---|
| Lesson | 2/2 | 9.2 | 4.1 | +5.1 | 7.6 | 3.3 | +4.4 | 2 of 2 / 2 of 2 | 2 of 2 |
| Notes | 2/2 | 7.4 | 6.3 | +1.2 | 6.1 | 4.8 | +1.3 | 2 of 2 / 2 of 2 | 2 of 2 |
| Podcast | 2/2 | 6.5 | 5.3 | +1.2 | 5.5 | 4.0 | +1.5 | 2 of 2 / 2 of 2 | 2 of 2 |
| Practice test | 2/2 | 7.8 | 5.2 | +2.6 | 7.0 | 4.7 | +2.3 | 2 of 2 / 2 of 2 | 2 of 2 |
| Study pack | 2/2 | 8.7 | 5.6 | +3.1 | 7.8 | 4.7 | +3.1 | 2 of 2 / 2 of 2 | 2 of 2 |
| Learning path | 2/2 | 7.3 | 2.6 | +4.8 | 7.3 | 2.5 | +4.8 | 2 of 2 / 2 of 2 | 2 of 2 |

Across all kinds: Gemini 3.8 Flash found the spec version better in 12 of 12 comparisons and worse in 0; Claude Sonnet 5.5 found the spec version better in 12 of 12 comparisons and worse in 0.

## Lesson

Real generator: `services/ai.js` `generateLesson` (the spec block, the post-check and one revision). What is judged: one short lesson (intro, sections, a worked example, a summary and check questions) on the topic.

| Spec field (0 to 10) | Gemini 3.8 Flash generic | spec | gain | Claude Sonnet 5.5 generic | spec | gain | n |
|---|---|---|---|---|---|---|---|
| Lesson and chunk length | 3.5 | 9.0 | +5.5 | 2.0 | 6.0 | +4.0 | 2 |
| Pacing | 6.5 | 9.0 | +2.5 | 4.0 | 7.5 | +3.5 | 2 |
| Retrieval checks | 3.5 | 10.0 | +6.5 | 2.5 | 7.5 | +5.0 | 2 |
| Difficulty start and ramp | 7.0 | 9.0 | +2.0 | 4.5 | 7.0 | +2.5 | 2 |
| Scaffolding and hint size | 4.0 | 10.0 | +6.0 | 3.0 | 8.5 | +5.5 | 2 |
| Worked example to practice | 3.0 | 9.0 | +6.0 | 1.5 | 7.0 | +5.5 | 2 |
| Explanation modes | 4.5 | 9.0 | +4.5 | 3.5 | 7.5 | +4.0 | 2 |
| Vocabulary level | 3.5 | 9.0 | +5.5 | 2.5 | 7.5 | +5.0 | 2 |
| Sentence length | 2.0 | 8.0 | +6.0 | 3.5 | 7.5 | +4.0 | 2 |
| Examples from interests | 0.0 | 9.5 | +9.5 | 0.0 | 9.5 | +9.5 | 2 |
| Avoided domains | 10.0 | 10.0 | +0.0 | 10.0 | 10.0 | +0.0 | 2 |
| Tone and feedback | 3.0 | 9.5 | +6.5 | 3.0 | 7.0 | +4.0 | 2 |
| Structure and format | 4.5 | 9.0 | +4.5 | 4.0 | 7.0 | +3.0 | 2 |
| Challenge and novelty | 2.5 | 9.0 | +6.5 | 2.0 | 7.5 | +5.5 | 2 |
| **Fit (mean of the fields)** | **4.1** | **9.2** | **+5.1** | **3.3** | **7.6** | **+4.4** |  |
| Key-fact coverage | 10.0 | 10.0 | +0.0 | 9.0 | 10.0 | +1.0 |  |
| Accuracy | 10.0 | 10.0 | +0.0 | 9.0 | 9.5 | +0.5 |  |
| Interests used | 0.0 | 10.0 | +10.0 | 0.0 | 9.5 | +9.5 |  |
| Dislikes avoided | 10.0 | 10.0 | +0.0 | 6.5 | 9.5 | +3.0 |  |
| Age-appropriate reading level | 3.0 | 9.5 | +6.5 | 2.5 | 8.5 | +6.0 |  |

**Wins:** Gemini 3.8 Flash 2 of 2 (0 ties, 0 worse); Claude Sonnet 5.5 2 of 2 (0 ties, 0 worse).

**Agreement between the judges:** the same verdict (spec better, tie or worse) in 2 of 2 cells; both found the spec version better in 2; opposite verdicts in 0. Correlation of the spec-minus-generic gain across cells n/a; of the fit scores themselves 1.00; on average the two judges' fit scores for the same text differ by 1.2 points.

**Per-field weaknesses** (mean of both judges): lowest for the spec version: lesson and chunk length 7.5, sentence length 7.8, difficulty start and ramp 8.0. Smallest gain over generic: avoided domains +0.0, difficulty start and ramp +2.3, pacing +3.0.

**Learners the spec fitted least well:** Leo 8.4, Maya 8.5.

**Key facts the judges found missing:** generic/photosynthesis: Mainly in leaves is only implied.

**What the code measured in the text (no model):**

| Measure (mean over cells) | spec | generic |
|---|---|---|
| Words | 368.0 | 384.5 |
| MeanSentenceWords | 9.4 | 13.8 |
| LongWordShare | 0.0 | 0.0 |
| Sections | 4.0 | 3.0 |
| Checks | 3.0 | 4.0 |
| Cells that used a disliked domain | 0 | 0 |
| Cells that used a stated interest (of those with interests) | 2 of 2 | 1 of 2 |
| Key facts missing by term overlap (of all) | 0 of 10 | 2 of 10 |

## Notes

Real generator: `services/material-notes.js` `build` (surface `notes`). What is judged: study notes: sections of one-sentence bullets that outline the base text in the order it teaches.

| Spec field (0 to 10) | Gemini 3.8 Flash generic | spec | gain | Claude Sonnet 5.5 generic | spec | gain | n |
|---|---|---|---|---|---|---|---|
| Bullet size | 6.5 | 8.0 | +1.5 | 5.5 | 7.0 | +1.5 | 2 |
| Brevity | 7.5 | 8.5 | +1.0 | 6.0 | 7.0 | +1.0 | 2 |
| Density layout | 6.0 | 7.0 | +1.0 | 4.5 | 5.5 | +1.0 | 2 |
| Vocabulary level | 6.5 | 7.0 | +0.5 | 5.0 | 5.5 | +0.5 | 2 |
| Sentence length | 3.5 | 5.5 | +2.0 | 3.0 | 5.0 | +2.0 | 2 |
| Register | 7.5 | 8.5 | +1.0 | 4.5 | 6.5 | +2.0 | 2 |
| **Fit (mean of the fields)** | **6.3** | **7.4** | **+1.2** | **4.8** | **6.1** | **+1.3** |  |
| Key-fact coverage | 10.0 | 9.5 | -0.5 | 10.0 | 9.0 | -1.0 |  |
| Accuracy | 10.0 | 10.0 | +0.0 | 10.0 | 10.0 | +0.0 |  |
| Interests used | 0.0 | 0.0 | +0.0 | 0.0 | 0.0 | +0.0 |  |
| Dislikes avoided | 7.5 | 8.0 | +0.5 | 6.0 | 7.0 | +1.0 |  |
| Age-appropriate reading level | 6.0 | 7.0 | +1.0 | 5.0 | 6.0 | +1.0 |  |

**Wins:** Gemini 3.8 Flash 2 of 2 (0 ties, 0 worse); Claude Sonnet 5.5 2 of 2 (0 ties, 0 worse).

**Agreement between the judges:** the same verdict (spec better, tie or worse) in 2 of 2 cells; both found the spec version better in 2; opposite verdicts in 0. Correlation of the spec-minus-generic gain across cells n/a; of the fit scores themselves 1.00; on average the two judges' fit scores for the same text differ by 1.4 points.

**Per-field weaknesses** (mean of both judges): lowest for the spec version: sentence length 5.3, density layout 6.3, vocabulary level 6.3. Smallest gain over generic: vocabulary level +0.5, brevity +1.0, density layout +1.0.

**Learners the spec fitted least well:** Maya 6.0, Leo 7.5.

**Key facts the judges found missing:** spec/two-step equations: Intermediate step 2x = 8 and explicit x = 4 omitted in body; spec/two-step equations: Intermediate results 2x = 8 and x = 4 not shown in steps.

**What the code measured in the text (no model):**

| Measure (mean over cells) | spec | generic |
|---|---|---|
| Words | 202.0 | 232.5 |
| MeanSentenceWords | 13.8 | 18.8 |
| LongWordShare | 0.0 | 0.0 |
| Sections | 5.0 | 4.5 |
| Bullets | 14.5 | 14.5 |
| BulletsPerSection | 2.9 | 3.3 |
| MeanBulletWords | 13.4 | 15.8 |
| Cells that used a disliked domain | 0 | 0 |
| Cells that used a stated interest (of those with interests) | 0 of 2 | 0 of 2 |
| Key facts missing by term overlap (of all) | 1 of 10 | 0 of 10 |

## Podcast

Real generator: `services/material-podcast.js` `build` (surface `podcast`; check-in spacing by `checkinSlots`). What is judged: a short two-host podcast script (host A explains, host B asks) that talks through the base text; the marks [CHECK-IN QUESTION] show where the app would pause to ask the listener a question.

| Spec field (0 to 10) | Gemini 3.8 Flash generic | spec | gain | Claude Sonnet 5.5 generic | spec | gain | n |
|---|---|---|---|---|---|---|---|
| Pacing length | 8.0 | 6.5 | -1.5 | 5.0 | 5.5 | +0.5 | 2 |
| Vocabulary spoken | 5.5 | 7.5 | +2.0 | 4.5 | 7.5 | +3.0 | 2 |
| Sentence length | 3.0 | 7.0 | +4.0 | 2.5 | 7.5 | +5.0 | 2 |
| Check in frequency | 0.0 | 0.0 | +0.0 | 0.0 | 0.0 | +0.0 | 1 |
| Dialogue style | 8.0 | 8.0 | +0.0 | 5.0 | 4.5 | -0.5 | 2 |
| Tone | 4.0 | 7.0 | +3.0 | 4.0 | 6.5 | +2.5 | 2 |
| Explanation order | 5.0 | 5.0 | +0.0 | 4.5 | 4.0 | -0.5 | 2 |
| **Fit (mean of the fields)** | **5.3** | **6.5** | **+1.2** | **4.0** | **5.5** | **+1.5** |  |
| Key-fact coverage | 10.0 | 8.0 | -2.0 | 10.0 | 5.5 | -4.5 |  |
| Accuracy | 10.0 | 9.5 | -0.5 | 10.0 | 8.5 | -1.5 |  |
| Interests used | 0.0 | 0.0 | +0.0 | 0.0 | 0.0 | +0.0 |  |
| Dislikes avoided | 5.5 | 8.0 | +2.5 | 6.5 | 9.0 | +2.5 |  |
| Age-appropriate reading level | 5.0 | 7.0 | +2.0 | 4.5 | 7.5 | +3.0 |  |

**Wins:** Gemini 3.8 Flash 2 of 2 (0 ties, 0 worse); Claude Sonnet 5.5 2 of 2 (0 ties, 0 worse).

**Agreement between the judges:** the same verdict (spec better, tie or worse) in 2 of 2 cells; both found the spec version better in 2; opposite verdicts in 0. Correlation of the spec-minus-generic gain across cells n/a; of the fit scores themselves 0.95; on average the two judges' fit scores for the same text differ by 1.1 points.

**Per-field weaknesses** (mean of both judges): lowest for the spec version: check in frequency 0.0, explanation order 4.5, pacing length 6.0. Smallest gain over generic: pacing length -0.5, dialogue style -0.3, explanation order -0.3. **Fields where generic scored higher: pacing length -0.5, dialogue style -0.3, explanation order -0.3**.

**Learners the spec fitted least well:** Maya 4.6, Leo 7.4.

**Key facts the judges found missing:** spec/photosynthesis: Oxygen is released as a by-product; spec/photosynthesis: Chlorophyll absorbing light not stated; spec/photosynthesis: Oxygen by-product missing; spec/photosynthesis: Script ends before oxygen and equation; spec/photosynthesis: Word equation and dark cupboard case missing.

**What the code measured in the text (no model):**

| Measure (mean over cells) | spec | generic |
|---|---|---|
| Words | 279.0 | 328.5 |
| MeanSentenceWords | 7.3 | 14.0 |
| LongWordShare | 0.0 | 0.0 |
| Turns | 24.5 | 24.0 |
| WordsPerTurn | 11.7 | 14.7 |
| BQuestions | 12.0 | 10.0 |
| CheckIns | 0.0 | 0.5 |
| SpokenMinutes | 1.8 | 2.2 |
| Cells that used a disliked domain | 0 | 0 |
| Cells that used a stated interest (of those with interests) | 0 of 2 | 0 of 2 |
| Key facts missing by term overlap (of all) | 2 of 10 | 1 of 10 |

## Practice test

Real generator: `services/course-builder.js` `build` (the questions) then `services/material-test.js` `start` (length, order, timing). What is judged: a practice test on the base text: the questions in the order they are asked, each with its tier (1 recall, 2 use, 3 combine or a new setting), its answer and the explanation shown after a miss.

| Spec field (0 to 10) | Gemini 3.8 Flash generic | spec | gain | Claude Sonnet 5.5 generic | spec | gain | n |
|---|---|---|---|---|---|---|---|
| Difficulty start | 5.5 | 8.5 | +3.0 | 5.5 | 8.5 | +3.0 | 2 |
| Difficulty ramp | 3.0 | 8.5 | +5.5 | 2.5 | 7.0 | +4.5 | 2 |
| Question format | 9.0 | 10.0 | +1.0 | 7.5 | 8.5 | +1.0 | 2 |
| Feedback detail | 7.5 | 10.0 | +2.5 | 6.0 | 8.5 | +2.5 | 2 |
| Stakes tone | 3.0 | 4.5 | +1.5 | 4.0 | 4.5 | +0.5 | 2 |
| Wording | 5.5 | 8.5 | +3.0 | 4.0 | 7.0 | +3.0 | 2 |
| Warmup | 0.0 | 1.0 | +1.0 | 1.0 | 2.0 | +1.0 | 1 |
| **Fit (mean of the fields)** | **5.2** | **7.8** | **+2.6** | **4.7** | **7.0** | **+2.3** |  |
| Key-fact coverage | 9.0 | 8.0 | -1.0 | 8.0 | 6.5 | -1.5 |  |
| Accuracy | 10.0 | 9.5 | -0.5 | 9.0 | 9.0 | +0.0 |  |
| Interests used | 0.0 | 0.0 | +0.0 | 0.0 | 0.0 | +0.0 |  |
| Dislikes avoided | 5.0 | 7.5 | +2.5 | 4.5 | 7.5 | +3.0 |  |
| Age-appropriate reading level | 5.5 | 8.5 | +3.0 | 4.5 | 8.0 | +3.5 |  |

**Wins:** Gemini 3.8 Flash 2 of 2 (0 ties, 0 worse); Claude Sonnet 5.5 2 of 2 (0 ties, 0 worse).

**Agreement between the judges:** the same verdict (spec better, tie or worse) in 2 of 2 cells; both found the spec version better in 2; opposite verdicts in 0. Correlation of the spec-minus-generic gain across cells n/a; of the fit scores themselves 1.00; on average the two judges' fit scores for the same text differ by 0.7 points.

**Per-field weaknesses** (mean of both judges): lowest for the spec version: warmup 1.5, stakes tone 4.5, difficulty ramp 7.8. Smallest gain over generic: question format +1.0, stakes tone +1.0, warmup +1.0.

**Learners the spec fitted least well:** Maya 6.8, Leo 8.0.

**Key facts the judges found missing:** spec/photosynthesis: Chloroplasts are not mentioned; spec/photosynthesis: Glucose made from CO2 and water only via equation; spec/photosynthesis: Photosynthesis mainly in leaves not stated; spec/photosynthesis: Sun/light role thin; generic/photosynthesis: Sun as light source only implied.

**What the code measured in the text (no model):**

| Measure (mean over cells) | spec | generic |
|---|---|---|
| Questions | 5.0 | 10.0 |
| MeanSentenceWords | 9.9 | 12.6 |
| LongWordShare | 0.0 | 0.0 |
| FirstTier | 1.5 | 2.0 |
| TypedShare | 0.3 | 0.3 |
| MeanExplanationWords | 15.8 | 14.0 |
| TestWordHits | 0.0 | 0.0 |
| SecondsPerQuestion | 94.0 | 75.0 |
| Cells that used a disliked domain | 0 | 0 |
| Cells that used a stated interest (of those with interests) | 0 of 2 | 0 of 2 |
| Key facts missing by term overlap (of all) | 4 of 10 | 3 of 10 |

## Study pack

Real generator: `services/material-pack.js` `build` (surface `material` plus the question shape). What is judged: a study pack: a short summary, flashcards, a quiz and a practice test, all from the base text.

| Spec field (0 to 10) | Gemini 3.8 Flash generic | spec | gain | Claude Sonnet 5.5 generic | spec | gain | n |
|---|---|---|---|---|---|---|---|
| Summary style | 3.0 | 8.0 | +5.0 | 3.0 | 8.0 | +5.0 | 2 |
| Aid amounts | 8.5 | 9.0 | +0.5 | 8.0 | 7.0 | -1.0 | 2 |
| Vocabulary level | 5.0 | 8.5 | +3.5 | 4.0 | 7.0 | +3.0 | 2 |
| Sentence length | 3.0 | 8.5 | +5.5 | 3.0 | 9.0 | +6.0 | 2 |
| Question ramp | 4.0 | 9.0 | +5.0 | 3.5 | 8.5 | +5.0 | 2 |
| Question format | 9.5 | 9.5 | +0.0 | 8.0 | 8.5 | +0.5 | 2 |
| Explanations | 7.0 | 9.5 | +2.5 | 5.0 | 8.5 | +3.5 | 2 |
| Stakes tone | 4.5 | 7.5 | +3.0 | 3.0 | 6.0 | +3.0 | 2 |
| **Fit (mean of the fields)** | **5.6** | **8.7** | **+3.1** | **4.7** | **7.8** | **+3.1** |  |
| Key-fact coverage | 10.0 | 9.5 | -0.5 | 9.5 | 8.5 | -1.0 |  |
| Accuracy | 10.0 | 10.0 | +0.0 | 10.0 | 9.5 | -0.5 |  |
| Interests used | 0.0 | 0.0 | +0.0 | 0.5 | 1.0 | +0.5 |  |
| Dislikes avoided | 5.0 | 8.5 | +3.5 | 4.5 | 8.0 | +3.5 |  |
| Age-appropriate reading level | 4.0 | 8.5 | +4.5 | 3.5 | 8.5 | +5.0 |  |

**Wins:** Gemini 3.8 Flash 2 of 2 (0 ties, 0 worse); Claude Sonnet 5.5 2 of 2 (0 ties, 0 worse).

**Agreement between the judges:** the same verdict (spec better, tie or worse) in 2 of 2 cells; both found the spec version better in 2; opposite verdicts in 0. Correlation of the spec-minus-generic gain across cells n/a; of the fit scores themselves 1.00; on average the two judges' fit scores for the same text differ by 0.9 points.

**Per-field weaknesses** (mean of both judges): lowest for the spec version: stakes tone 6.8, vocabulary level 7.8, summary style 8.0. Smallest gain over generic: aid amounts -0.3, question format +0.3, explanations +3.0. **Fields where generic scored higher: aid amounts -0.3**.

**Learners the spec fitted least well:** Maya 8.0, Leo 8.5.

**Key facts the judges found missing:** spec/photosynthesis: Oxygen as by-product only in the IN/OUT list and cards; spec/two-step equations: checking answer missing from summary; spec/two-step equations: check step only lightly shown in summary.

**What the code measured in the text (no model):**

| Measure (mean over cells) | spec | generic |
|---|---|---|
| Words | 592.5 | 655.5 |
| MeanSentenceWords | 9.4 | 16.1 |
| LongWordShare | 0.0 | 0.0 |
| SummaryParagraphs | 4.0 | 3.5 |
| Cards | 8.0 | 8.0 |
| Quiz | 3.5 | 4.0 |
| TestItems | 5.5 | 5.0 |
| TypedShare | 0.3 | 0.4 |
| MeanExplanationWords | 13.2 | 14.1 |
| TestWordHits | 0.0 | 0.0 |
| Cells that used a disliked domain | 0 | 0 |
| Cells that used a stated interest (of those with interests) | 0 of 2 | 0 of 2 |
| Key facts missing by term overlap (of all) | 0 of 10 | 0 of 10 |

## Learning path

Real generator: `services/course-builder.js` `build` (surface `material`). What is judged: a learning path: the skills in order, each with its short lesson text and key points, all from the base text.

| Spec field (0 to 10) | Gemini 3.8 Flash generic | spec | gain | Claude Sonnet 5.5 generic | spec | gain | n |
|---|---|---|---|---|---|---|---|
| Lesson chunking | 1.0 | 6.0 | +5.0 | 1.5 | 6.0 | +4.5 | 2 |
| Vocabulary level | 5.0 | 8.5 | +3.5 | 3.5 | 7.5 | +4.0 | 2 |
| Sentence length | 2.0 | 7.5 | +5.5 | 1.5 | 8.5 | +7.0 | 2 |
| Density layout | 1.5 | 7.0 | +5.5 | 1.5 | 6.5 | +5.0 | 2 |
| Explanation order | 3.5 | 7.5 | +4.0 | 3.0 | 7.5 | +4.5 | 2 |
| Pace repetition | 2.0 | 7.0 | +5.0 | 2.5 | 7.0 | +4.5 | 2 |
| Tone | 3.0 | 7.5 | +4.5 | 3.5 | 7.0 | +3.5 | 2 |
| Explanation modes | 2.5 | 7.5 | +5.0 | 3.0 | 8.0 | +5.0 | 2 |
| **Fit (mean of the fields)** | **2.6** | **7.3** | **+4.8** | **2.5** | **7.3** | **+4.8** |  |
| Key-fact coverage | 10.0 | 10.0 | +0.0 | 9.5 | 10.0 | +0.5 |  |
| Accuracy | 10.0 | 10.0 | +0.0 | 10.0 | 9.5 | -0.5 |  |
| Interests used | 0.0 | 0.0 | +0.0 | 0.5 | 1.0 | +0.5 |  |
| Dislikes avoided | 3.5 | 6.0 | +2.5 | 4.5 | 7.0 | +2.5 |  |
| Age-appropriate reading level | 4.0 | 8.5 | +4.5 | 2.5 | 8.5 | +6.0 |  |

**Wins:** Gemini 3.8 Flash 2 of 2 (0 ties, 0 worse); Claude Sonnet 5.5 2 of 2 (0 ties, 0 worse).

**Agreement between the judges:** the same verdict (spec better, tie or worse) in 2 of 2 cells; both found the spec version better in 2; opposite verdicts in 0. Correlation of the spec-minus-generic gain across cells n/a; of the fit scores themselves 0.99; on average the two judges' fit scores for the same text differ by 0.3 points.

**Per-field weaknesses** (mean of both judges): lowest for the spec version: lesson chunking 6.0, density layout 6.8, pace repetition 7.0. Smallest gain over generic: vocabulary level +3.8, tone +4.0, explanation order +4.3.

**Learners the spec fitted least well:** Maya 6.9, Leo 7.7.

**Key facts the judges found missing:** none reported.

**What the code measured in the text (no model):**

| Measure (mean over cells) | spec | generic |
|---|---|---|
| Words | 800.0 | 1004.0 |
| MeanSentenceWords | 9.9 | 15.5 |
| LongWordShare | 0.0 | 0.0 |
| Skills | 2.5 | 4.0 |
| ParagraphsPerSkill | 5.5 | 4.0 |
| WordsPerParagraph | 49.0 | 51.5 |
| SentencesPerParagraph | 5.5 | 3.2 |
| QuestionsPerSkill | 8.2 | 8.3 |
| Cells that used a disliked domain | 0 | 0 |
| Cells that used a stated interest (of those with interests) | 0 of 2 | 0 of 2 |
| Key facts missing by term overlap (of all) | 1 of 10 | 0 of 10 |

## Systemic patterns across learners and kinds

- Fields that recur across kinds, lowest first: stakes tone (test, pack) spec 5.6, gain +2.0; explanation order (podcast, path) spec 6.0, gain +2.0; density layout (notes, path) spec 6.5, gain +3.1; tone (podcast, path) spec 7.0, gain +3.4.
- Kind with the smallest overall gain: notes +1.2; the largest: learning path +4.8.
- Learners the spec fitted least well across all kinds: Maya 6.8, Leo 7.9.
- **Interests are deliberately withheld from own-material kinds.** The spec's `material`, `notes` and `podcast` surfaces block the interest, story, analogy and application levers (`MATERIAL_BLOCKED` in `services/learning-spec.js`) because the learner's own text is the only source. The code count shows it: notes 0 of 2 cells used a stated interest (generic 0); podcast 0 of 2 cells used a stated interest (generic 0); practice test 0 of 2 cells used a stated interest (generic 0); study pack 0 of 2 cells used a stated interest (generic 0); learning path 0 of 2 cells used a stated interest (generic 0); the lesson, which is the one kind allowed to, 2 of 2 (generic 1). Whether own-material kinds should add clearly-labelled interest analogies is a product decision, not something this proof can settle.
- Cells that did not complete: none.

## Limits of this proof

- **Fit to the spec is not learning.** The judges score how well a version follows what the spec asks for and whether it keeps the base text's facts. They cannot measure that a real learner understands more or remembers longer. Only people learning from these materials can show that.
- **One writer, two judges.** Every spec and generic version was written by the same writer and judged by Gemini 3.8 Flash and Claude Sonnet 5.5. Two families lower the risk that one model's taste decides the result, and the table above reports how often they agree, but both are still language models, and Gemini ran with low reasoning effort to keep the cost down.
- **A pair in one call.** Each judge scores the two versions of a learner side by side (blind, shuffled). That makes the comparison sharp but lets a judge contrast them; it is not two independent absolute ratings.
- **Short base texts.** Each topic's base text is about 1,300 to 1,800 characters. Longer material exercises more of the pipeline (several passages per call, longer scripts, more check-ins); this proof does not.
- **Podcast check-ins** are placed by the app's own `checkinSlots` from the script length and the spec (a check-in about every 2, 3 or 4 minutes of speech); a real episode pairs them with questions from the learning path. The judge sees the marks, not the questions. With a short base text the script is under two minutes of speech and has no check-in at all, in which case the field is left out of the judged fields for that cell and only the code count (above) speaks for it. A longer base text is needed to exercise it.
- **Practice test.** The questions are written once per learner by the course builder (with the spec's question shape in the prompt) and then ordered, sized and timed by `material-test`; a test never writes new questions at start time.
- **Synthetic learners.** Sixteen invented profiles with settled scorecards; most dislikes in them are of a subject or a format (maths, long reading, being timed), so the avoided-domain path is exercised less than the rest.
- **Fixes this work made** are listed in the commit; the generators that were not receiving the spec, or lost it, were fixed in the mechanism (see the commit message).

## Cost

- This smoke run, in all (generation, judging and two re-judgings of changed fields, all on Standard Compute through the ledger at its assumed upper-bound prices): **$0.58** on the ledger, 16.683 before to 17.261 after. The final report above was rendered from the live results of the first run (writers: DeepSeek V4.1 Flash, 54 calls; judges: Gemini 3.8 Flash and Claude Sonnet 5.5, 24 pairs read once each) held in the run's cache, so rendering it again cost nothing.
- Judge calls cost about $0.005 (Gemini, low reasoning effort) and $0.011 (Sonnet) for a pair of materials of this size; the six kinds' writers about $0.04 per learner-topic cell.
- **What changed after this run:** the smoke was generated by the code as it stood when the harness was first written. It then showed three things that were fixed in the generators (see the commit): the practice test drew its questions at random (so a learner who needs easy wins could get no tier-1 question), a learning-path skill kept its lesson text at the format's five paragraphs whatever size the learner reads, and the own-material blocks told a writer to cut to "the key idea, one example, then practice" (the podcast and test lost facts in this run: key-fact coverage 7.5 and 8.0 for spec against 10 and 9 for generic). Those fixes are covered by unit tests; a second live smoke to see them work was started and stopped at the cost limit, so **the numbers above are for the code before those fixes**, and the full proof will be the first live measurement of them.

## Running the full proof

```
node -r dotenv/config scripts/scorecard-material-proof.js --live --kind=all --learners=16 --tag full
```

with `DOTENV_CONFIG_PATH` set to the owner's `.env` and `STANDARD_COMPUTE_LEDGER_FILE` set to the real ledger (the script already defaults to both paths). Add `--writer sc` to write with Standard Compute DeepSeek V4.1 Flash instead of probing the free lineup, `--kind=notes,pack` for some kinds, `--learners=4 --topics=1` for fewer cells, `--budget USD` to stop at a spend, and re-run with the same cache file to pay only for what changed.
