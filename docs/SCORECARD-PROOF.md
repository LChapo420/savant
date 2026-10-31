# Scorecard modification proof

Run `run3` (live models) on 2026-10-31. Written by `node scripts/scorecard-modification-proof.js`.

Sixteen synthetic learners, two topics each (32 lessons per arm), every topic covered by 6 to 9 learners. Three arms: **spec** (the learning spec in the prompt, with its check and one revision), **legacy** (what the app did before: the scorecard's gated directives and the survey), **generic** (a learner we know nothing about: the shared version). Each lesson was judged blind by a model from a different family than any writer of it, against the learner's spec. Writer path: Standard Compute DeepSeek V4.1 Flash through the ledger (the free NVIDIA lineup was not answering). Judges used: google/gemini-3.8-flash. Writers: deepseek/deepseek-v4.1-flash-1017 x51.

## Averages: spec against generic and legacy

The legacy and generic rows are carried from run `run2`: those lessons do not depend on the spec, so they were not written again. Each was judged there against the learner's spec of that run (the spec's shape lines have been refined since, so the judge's per-dimension text differs a little); read the spec column of this run against them as a comparison, not as a paired test.

| Dimension (0 to 10) | spec | legacy | generic | spec - generic | spec - legacy |
|---|---|---|---|---|---|
| Lesson and chunk length | 7.8 | 3.3 | 2.9 | 5.0 | 4.5 |
| Pacing | 8.8 | 7.3 | 6.0 | 2.8 | 1.6 |
| Retrieval checks | 9.8 | 5.1 | 4.9 | 4.9 | 4.7 |
| Difficulty start and ramp | 8.8 | 7.5 | 6.4 | 2.4 | 1.3 |
| Scaffolding and hint size | 9.9 | 5.1 | 4.7 | 5.3 | 4.8 |
| Worked example to practice | 9.0 | 2.7 | 2.5 | 6.5 | 6.3 |
| Explanation modes | 8.4 | 6.5 | 4.3 | 4.2 | 2.0 |
| Vocabulary level | 7.9 | 5.9 | 4.3 | 3.7 | 2.0 |
| Sentence length | 8.1 | 5.3 | 4.0 | 4.0 | 2.8 |
| Examples from interests | 9.7 | 4.9 | 0.2 | 9.5 | 4.8 |
| Avoided domains | 10.0 | 9.6 | 8.7 | 1.3 | 0.4 |
| Tone and feedback | 9.1 | 7.5 | 5.3 | 3.8 | 1.6 |
| Structure and format | 8.9 | 6.0 | 4.7 | 4.3 | 2.9 |
| Challenge and novelty | 8.6 | 5.9 | 3.5 | 5.2 | 2.7 |
| Interests used (judge) | 9.9 | 5.6 | 0.2 | 9.7 | 4.3 |
| Dislikes avoided (judge) | 9.8 | 8.8 | 8.1 | 1.7 | 1.0 |
| Age-appropriate reading level | 8.5 | 6.9 | 4.9 | 3.6 | 1.7 |
| Key-fact coverage | 10.0 | 8.0 | 9.0 | 1.0 | 2.0 |
| Accuracy | 10.0 | 10.0 | 10.0 | 0.0 | 0.0 |
| **Mean fit to the spec (14 dimensions)** | **8.9** | **5.9** | **4.4** | **4.5** | **3.0** |

Cells where the spec lesson fits better than the generic one by more than 0.25: 32 of 32; better than legacy: 32 of 32. Cells where it fits worse than generic: 0.

## What the code measured in the text (no model)

| Measure | spec | legacy | generic |
|---|---|---|---|
| Lessons written and judged | 32 | 32 | 32 |
| Cells with no lesson or no verdict (the app would serve the bank lesson) | 0 | 0 | 0 |
| Mean sentence length (words) | 11.2 | 14.4 | 14.3 |
| Share of long words (11+ letters, not the topic's own) | 1.0% | 1.4% | 1.7% |
| Sections | 3.7 | 3.3 | 3.0 |
| Sentences per section | 7.1 | 10.1 | 7.0 |
| Check questions | 2.7 | 3.8 | 3.8 |
| Words in the lesson | 504 | 862 | 587 |
| Lessons that used a disliked domain | 0 | 0 | 0 |
| Lessons that used an interest (of those with interests) | 31 of 32 | 24 of 32 | 4 of 32 |
| Key facts missing (term overlap, of all) | 1 of 160 | 34 of 160 | 14 of 160 |
| Lessons revised once by the spec check | 14 | n/a | n/a |
| Lessons that left a spec problem open after the revision | 9 | n/a | n/a |

Spec followed, by the code's count (spec arm): sentence length within 25% of the cap 32 of 32; section count within 2 31 of 32; number of checks within 1 32 of 32; no disliked domain 32 of 32; interests used when the spec asks 31 of 32.

## Per learner

Averages over the learner's two topics, 0 to 10 (fit = mean of the 14 spec dimensions).

### Maya: age 8, short attention, loves Minecraft, dislikes reading
Topics: photosynthesis, Spanish greetings.

| Dimension | spec | legacy | generic |
|---|---|---|---|
| Lesson and chunk length | 8.0 | 2.5 | 1.5 |
| Pacing | 10.0 | 7.0 | 5.5 |
| Retrieval checks | 10.0 | 3.5 | 1.5 |
| Difficulty start and ramp | 9.5 | 7.5 | 5.5 |
| Scaffolding and hint size | 10.0 | 9.0 | 8.0 |
| Worked example to practice | 10.0 | 3.5 | 2.5 |
| Explanation modes | 8.5 | 6.0 | 2.5 |
| Vocabulary level | 9.0 | 6.0 | 2.0 |
| Sentence length | 7.0 | 2.0 | 1.0 |
| Examples from interests | 9.5 | 6.5 | 0.0 |
| Avoided domains | 10.0 | 10.0 | 6.0 |
| Tone and feedback | 9.0 | 8.0 | 2.5 |
| Structure and format | 9.0 | 4.5 | 1.5 |
| Challenge and novelty | 9.0 | 7.0 | 0.5 |
| Interests used (judge) | 10.0 | 7.5 | 0.0 |
| Dislikes avoided (judge) | 9.5 | 4.5 | 6.0 |
| Age-appropriate reading level | 9.0 | 4.5 | 1.5 |
| Key-fact coverage | 10.0 | 9.0 | 9.0 |
| Accuracy | 10.0 | 10.0 | 10.0 |
| **Fit (mean)** | **9.2** | **5.9** | **2.9** |

### Leo: age 11, soccer, visual and step-by-step, dislikes maths
Topics: two-step equations, causes of World War I.

| Dimension | spec | legacy | generic |
|---|---|---|---|
| Lesson and chunk length | 7.5 | 2.0 | 3.0 |
| Pacing | 9.5 | 7.5 | 7.0 |
| Retrieval checks | 10.0 | 5.5 | 7.0 |
| Difficulty start and ramp | 9.0 | 8.0 | 7.0 |
| Scaffolding and hint size | 10.0 | 0.0 | 0.0 |
| Worked example to practice | 7.5 | 2.0 | 2.0 |
| Explanation modes | 9.0 | 8.0 | 4.0 |
| Vocabulary level | 9.0 | 5.0 | 5.0 |
| Sentence length | 7.5 | 2.5 | 2.5 |
| Examples from interests | 9.0 | 4.5 | 0.0 |
| Avoided domains | 10.0 | 10.0 | 10.0 |
| Tone and feedback | 9.0 | 4.0 | 2.0 |
| Structure and format | 9.0 | 4.5 | 4.0 |
| Challenge and novelty | 8.5 | 6.0 | 4.0 |
| Interests used (judge) | 9.5 | 6.0 | 0.0 |
| Dislikes avoided (judge) | 10.0 | 10.0 | 10.0 |
| Age-appropriate reading level | 9.0 | 5.0 | 4.5 |
| Key-fact coverage | 10.0 | 10.0 | 8.5 |
| Accuracy | 10.0 | 10.0 | 10.0 |
| **Fit (mean)** | **8.9** | **5.0** | **4.1** |

### Ava: age 14, music, verbal, test-anxious
Topics: causes of World War I, photosynthesis.

| Dimension | spec | legacy | generic |
|---|---|---|---|
| Lesson and chunk length | 9.5 | 6.0 | 6.0 |
| Pacing | 10.0 | 8.5 | 8.0 |
| Retrieval checks | 10.0 | 7.5 | 4.5 |
| Difficulty start and ramp | 10.0 | 7.5 | 7.0 |
| Scaffolding and hint size | 10.0 | 0.5 | 0.0 |
| Worked example to practice | 10.0 | 3.5 | 3.5 |
| Explanation modes | 8.0 | 4.0 | 3.0 |
| Vocabulary level | 9.5 | 8.5 | 8.0 |
| Sentence length | 8.5 | 5.0 | 6.0 |
| Examples from interests | 10.0 | 3.5 | 0.0 |
| Avoided domains | 10.0 | 10.0 | 10.0 |
| Tone and feedback | 9.5 | 7.0 | 3.5 |
| Structure and format | 10.0 | 8.0 | 7.5 |
| Challenge and novelty | 9.0 | 4.5 | 3.0 |
| Interests used (judge) | 10.0 | 4.0 | 0.0 |
| Dislikes avoided (judge) | 10.0 | 10.0 | 8.0 |
| Age-appropriate reading level | 10.0 | 8.5 | 8.5 |
| Key-fact coverage | 10.0 | 9.5 | 10.0 |
| Accuracy | 10.0 | 10.0 | 10.0 |
| **Fit (mean)** | **9.6** | **6.0** | **5.0** |

### Noah: age 17, cars, fast and gifted-and-bored
Topics: two-step equations, causes of World War I.

| Dimension | spec | legacy | generic |
|---|---|---|---|
| Lesson and chunk length | 7.0 | 3.5 | 2.5 |
| Pacing | 9.0 | 7.0 | 4.0 |
| Retrieval checks | 10.0 | 5.5 | 4.0 |
| Difficulty start and ramp | 5.5 | 6.0 | 3.0 |
| Scaffolding and hint size | 10.0 | 9.5 | 9.0 |
| Worked example to practice | 10.0 | 2.0 | 2.0 |
| Explanation modes | 9.5 | 8.0 | 6.5 |
| Vocabulary level | 6.0 | 6.5 | 3.5 |
| Sentence length | 9.5 | 6.5 | 5.5 |
| Examples from interests | 9.5 | 2.0 | 0.0 |
| Avoided domains | 10.0 | 10.0 | 10.0 |
| Tone and feedback | 9.0 | 7.0 | 7.0 |
| Structure and format | 9.5 | 7.5 | 6.0 |
| Challenge and novelty | 7.5 | 3.0 | 1.0 |
| Interests used (judge) | 9.5 | 2.5 | 0.0 |
| Dislikes avoided (judge) | 8.5 | 10.0 | 7.5 |
| Age-appropriate reading level | 6.5 | 7.5 | 4.0 |
| Key-fact coverage | 10.0 | 8.5 | 9.0 |
| Accuracy | 10.0 | 10.0 | 10.0 |
| **Fit (mean)** | **8.7** | **6.0** | **4.6** |

### Grace: age 25, English is a second language, cooking, step-by-step
Topics: photosynthesis, Spanish greetings.

| Dimension | spec | legacy | generic |
|---|---|---|---|
| Lesson and chunk length | 9.0 | 4.0 | 2.5 |
| Pacing | 10.0 | 8.0 | 7.5 |
| Retrieval checks | 10.0 | 6.0 | 5.5 |
| Difficulty start and ramp | 10.0 | 8.0 | 7.5 |
| Scaffolding and hint size | 10.0 | 0.5 | 0.5 |
| Worked example to practice | 9.0 | 4.0 | 2.5 |
| Explanation modes | 9.5 | 8.0 | 6.0 |
| Vocabulary level | 9.0 | 7.0 | 5.0 |
| Sentence length | 8.5 | 8.0 | 4.0 |
| Examples from interests | 10.0 | 8.5 | 1.0 |
| Avoided domains | 10.0 | 10.0 | 10.0 |
| Tone and feedback | 9.5 | 8.5 | 8.0 |
| Structure and format | 9.5 | 7.0 | 4.5 |
| Challenge and novelty | 9.0 | 8.0 | 6.5 |
| Interests used (judge) | 10.0 | 9.0 | 1.0 |
| Dislikes avoided (judge) | 10.0 | 10.0 | 10.0 |
| Age-appropriate reading level | 9.5 | 9.0 | 7.0 |
| Key-fact coverage | 10.0 | 8.0 | 9.0 |
| Accuracy | 10.0 | 10.0 | 10.0 |
| **Fit (mean)** | **9.5** | **6.8** | **5.1** |

### Frank: age 60, art, slow pace, little background
Topics: two-step equations, Spanish greetings.

| Dimension | spec | legacy | generic |
|---|---|---|---|
| Lesson and chunk length | 8.5 | 3.5 | 2.5 |
| Pacing | 7.0 | 6.5 | 3.0 |
| Retrieval checks | 10.0 | 6.0 | 7.5 |
| Difficulty start and ramp | 9.5 | 8.0 | 7.5 |
| Scaffolding and hint size | 10.0 | 0.0 | 0.0 |
| Worked example to practice | 8.0 | 3.0 | 2.5 |
| Explanation modes | 9.0 | 5.0 | 4.0 |
| Vocabulary level | 8.5 | 5.0 | 5.0 |
| Sentence length | 7.0 | 7.5 | 6.0 |
| Examples from interests | 10.0 | 8.0 | 0.0 |
| Avoided domains | 10.0 | 10.0 | 10.0 |
| Tone and feedback | 9.5 | 9.0 | 7.0 |
| Structure and format | 8.5 | 7.0 | 5.0 |
| Challenge and novelty | 9.0 | 8.0 | 6.0 |
| Interests used (judge) | 10.0 | 9.0 | 0.0 |
| Dislikes avoided (judge) | 10.0 | 10.0 | 10.0 |
| Age-appropriate reading level | 9.0 | 8.0 | 7.0 |
| Key-fact coverage | 10.0 | 6.0 | 7.5 |
| Accuracy | 10.0 | 10.0 | 10.0 |
| **Fit (mean)** | **8.9** | **6.2** | **4.7** |

### Sam: age 14, dyslexia-like reading profile, art
Topics: photosynthesis, two-step equations.

| Dimension | spec | legacy | generic |
|---|---|---|---|
| Lesson and chunk length | 9.0 | 3.5 | 2.5 |
| Pacing | 9.5 | 8.5 | 7.5 |
| Retrieval checks | 10.0 | 8.0 | 7.0 |
| Difficulty start and ramp | 9.5 | 8.5 | 7.5 |
| Scaffolding and hint size | 10.0 | 9.0 | 8.0 |
| Worked example to practice | 9.5 | 2.0 | 2.5 |
| Explanation modes | 8.5 | 7.5 | 4.0 |
| Vocabulary level | 8.0 | 6.0 | 4.5 |
| Sentence length | 8.5 | 7.0 | 4.5 |
| Examples from interests | 10.0 | 5.5 | 0.0 |
| Avoided domains | 10.0 | 7.0 | 2.5 |
| Tone and feedback | 8.5 | 8.5 | 6.0 |
| Structure and format | 8.5 | 5.5 | 2.5 |
| Challenge and novelty | 9.0 | 7.5 | 5.0 |
| Interests used (judge) | 10.0 | 7.0 | 0.0 |
| Dislikes avoided (judge) | 10.0 | 7.0 | 2.0 |
| Age-appropriate reading level | 9.5 | 8.0 | 4.0 |
| Key-fact coverage | 10.0 | 8.5 | 9.0 |
| Accuracy | 10.0 | 10.0 | 10.0 |
| **Fit (mean)** | **9.2** | **6.7** | **4.6** |

### Zoe: age 11, attention difficulty, phone-only short sessions, gaming and dance
Topics: causes of World War I, Spanish greetings.

| Dimension | spec | legacy | generic |
|---|---|---|---|
| Lesson and chunk length | 4.5 | 2.5 | 0.5 |
| Pacing | 4.5 | 3.0 | 2.0 |
| Retrieval checks | 9.5 | 3.5 | 1.0 |
| Difficulty start and ramp | 9.5 | 8.0 | 6.0 |
| Scaffolding and hint size | 10.0 | 8.0 | 7.5 |
| Worked example to practice | 10.0 | 3.0 | 3.5 |
| Explanation modes | 9.0 | 7.5 | 3.5 |
| Vocabulary level | 9.5 | 6.0 | 3.5 |
| Sentence length | 7.5 | 4.0 | 1.0 |
| Examples from interests | 10.0 | 4.5 | 0.0 |
| Avoided domains | 10.0 | 10.0 | 10.0 |
| Tone and feedback | 9.0 | 6.0 | 2.5 |
| Structure and format | 9.0 | 5.0 | 2.0 |
| Challenge and novelty | 8.5 | 4.0 | 0.5 |
| Interests used (judge) | 10.0 | 5.0 | 0.0 |
| Dislikes avoided (judge) | 10.0 | 10.0 | 10.0 |
| Age-appropriate reading level | 9.0 | 5.5 | 3.0 |
| Key-fact coverage | 10.0 | 7.5 | 9.0 |
| Accuracy | 10.0 | 10.0 | 10.0 |
| **Fit (mean)** | **8.6** | **5.4** | **3.1** |

### Ethan: age 17, music, gifted-and-bored
Topics: photosynthesis, causes of World War I.

| Dimension | spec | legacy | generic |
|---|---|---|---|
| Lesson and chunk length | 7.0 | 2.5 | 2.5 |
| Pacing | 9.0 | 8.5 | 6.0 |
| Retrieval checks | 10.0 | 4.0 | 4.0 |
| Difficulty start and ramp | 6.0 | 8.0 | 2.5 |
| Scaffolding and hint size | 10.0 | 10.0 | 8.5 |
| Worked example to practice | 10.0 | 2.5 | 1.0 |
| Explanation modes | 9.0 | 8.5 | 7.5 |
| Vocabulary level | 6.0 | 8.0 | 3.0 |
| Sentence length | 9.5 | 4.5 | 5.5 |
| Examples from interests | 10.0 | 1.5 | 0.0 |
| Avoided domains | 10.0 | 10.0 | 6.5 |
| Tone and feedback | 9.0 | 8.5 | 8.0 |
| Structure and format | 9.0 | 6.0 | 5.0 |
| Challenge and novelty | 8.5 | 3.0 | 1.5 |
| Interests used (judge) | 10.0 | 1.0 | 0.0 |
| Dislikes avoided (judge) | 10.0 | 10.0 | 6.5 |
| Age-appropriate reading level | 7.0 | 9.0 | 3.0 |
| Key-fact coverage | 10.0 | 9.0 | 9.5 |
| Accuracy | 10.0 | 10.0 | 10.0 |
| **Fit (mean)** | **8.8** | **6.1** | **4.4** |

### Priya: age 25, test-anxious, cooking, dislikes maths
Topics: two-step equations, Spanish greetings.

| Dimension | spec | legacy | generic |
|---|---|---|---|
| Lesson and chunk length | 9.0 | 4.0 | 3.0 |
| Pacing | 10.0 | 8.5 | 7.5 |
| Retrieval checks | 10.0 | 4.0 | 7.5 |
| Difficulty start and ramp | 9.5 | 8.0 | 7.5 |
| Scaffolding and hint size | 10.0 | 0.0 | 0.0 |
| Worked example to practice | 8.5 | 2.5 | 2.0 |
| Explanation modes | 10.0 | 8.5 | 5.5 |
| Vocabulary level | 8.0 | 7.5 | 6.0 |
| Sentence length | 8.5 | 6.5 | 4.5 |
| Examples from interests | 10.0 | 7.0 | 0.0 |
| Avoided domains | 10.0 | 9.5 | 9.5 |
| Tone and feedback | 9.5 | 8.5 | 4.0 |
| Structure and format | 10.0 | 7.0 | 5.5 |
| Challenge and novelty | 9.5 | 7.5 | 5.5 |
| Interests used (judge) | 10.0 | 8.0 | 0.0 |
| Dislikes avoided (judge) | 10.0 | 9.5 | 9.0 |
| Age-appropriate reading level | 9.0 | 8.0 | 6.5 |
| Key-fact coverage | 10.0 | 6.0 | 8.0 |
| Accuracy | 10.0 | 10.0 | 10.0 |
| **Fit (mean)** | **9.5** | **6.4** | **4.9** |

### Omar: age 8, almost no prior knowledge, loves cars
Topics: photosynthesis, two-step equations.

| Dimension | spec | legacy | generic |
|---|---|---|---|
| Lesson and chunk length | 6.0 | 2.0 | 2.0 |
| Pacing | 9.0 | 6.5 | 6.5 |
| Retrieval checks | 9.0 | 3.0 | 2.0 |
| Difficulty start and ramp | 8.5 | 5.5 | 6.5 |
| Scaffolding and hint size | 9.5 | 0.0 | 0.0 |
| Worked example to practice | 6.0 | 3.0 | 3.0 |
| Explanation modes | 8.0 | 5.5 | 3.0 |
| Vocabulary level | 8.5 | 3.0 | 1.5 |
| Sentence length | 5.5 | 2.0 | 1.5 |
| Examples from interests | 9.5 | 5.5 | 0.0 |
| Avoided domains | 10.0 | 10.0 | 10.0 |
| Tone and feedback | 9.0 | 5.5 | 2.0 |
| Structure and format | 8.0 | 3.0 | 3.0 |
| Challenge and novelty | 8.0 | 5.0 | 2.0 |
| Interests used (judge) | 10.0 | 6.5 | 0.0 |
| Dislikes avoided (judge) | 10.0 | 10.0 | 10.0 |
| Age-appropriate reading level | 8.0 | 3.0 | 2.0 |
| Key-fact coverage | 10.0 | 8.0 | 9.0 |
| Accuracy | 10.0 | 10.0 | 10.0 |
| **Fit (mean)** | **8.2** | **4.3** | **3.1** |

### Lena: age 60, knows most of it, art and gardening, long desk sessions
Topics: photosynthesis, causes of World War I.

| Dimension | spec | legacy | generic |
|---|---|---|---|
| Lesson and chunk length | 9.5 | 4.5 | 4.5 |
| Pacing | 9.0 | 8.5 | 8.0 |
| Retrieval checks | 10.0 | 4.0 | 4.0 |
| Difficulty start and ramp | 7.5 | 7.0 | 5.5 |
| Scaffolding and hint size | 10.0 | 9.5 | 9.0 |
| Worked example to practice | 9.0 | 1.5 | 2.0 |
| Explanation modes | 5.5 | 2.5 | 2.0 |
| Vocabulary level | 4.5 | 4.0 | 2.5 |
| Sentence length | 10.0 | 5.0 | 5.5 |
| Examples from interests | 9.5 | 0.5 | 1.5 |
| Avoided domains | 10.0 | 10.0 | 10.0 |
| Tone and feedback | 9.0 | 8.5 | 7.5 |
| Structure and format | 9.0 | 7.0 | 7.5 |
| Challenge and novelty | 7.0 | 7.5 | 4.0 |
| Interests used (judge) | 9.5 | 0.0 | 1.5 |
| Dislikes avoided (judge) | 10.0 | 10.0 | 10.0 |
| Age-appropriate reading level | 6.0 | 8.5 | 5.0 |
| Key-fact coverage | 10.0 | 8.0 | 10.0 |
| Accuracy | 10.0 | 10.0 | 10.0 |
| **Fit (mean)** | **8.5** | **5.7** | **5.3** |

### Diego: age 14, English learner (Spanish speaker), sports, visual
Topics: causes of World War I, two-step equations.

| Dimension | spec | legacy | generic |
|---|---|---|---|
| Lesson and chunk length | 8.5 | 3.5 | 3.0 |
| Pacing | 9.5 | 7.5 | 7.5 |
| Retrieval checks | 10.0 | 6.0 | 8.0 |
| Difficulty start and ramp | 9.0 | 7.5 | 7.5 |
| Scaffolding and hint size | 10.0 | 8.5 | 7.5 |
| Worked example to practice | 10.0 | 2.0 | 3.0 |
| Explanation modes | 7.0 | 7.0 | 2.5 |
| Vocabulary level | 7.5 | 6.5 | 2.0 |
| Sentence length | 6.5 | 6.5 | 2.5 |
| Examples from interests | 9.5 | 4.0 | 0.0 |
| Avoided domains | 10.0 | 10.0 | 10.0 |
| Tone and feedback | 9.0 | 8.5 | 7.5 |
| Structure and format | 7.0 | 7.0 | 4.0 |
| Challenge and novelty | 9.0 | 6.5 | 5.0 |
| Interests used (judge) | 10.0 | 5.0 | 0.0 |
| Dislikes avoided (judge) | 10.0 | 10.0 | 10.0 |
| Age-appropriate reading level | 9.0 | 7.5 | 3.5 |
| Key-fact coverage | 10.0 | 6.0 | 9.0 |
| Accuracy | 10.0 | 10.0 | 10.0 |
| **Fit (mean)** | **8.8** | **6.5** | **5.0** |

### Chloe: age 17, verbal, music, dislikes maths
Topics: causes of World War I, Spanish greetings.

| Dimension | spec | legacy | generic |
|---|---|---|---|
| Lesson and chunk length | 9.5 | 4.5 | 5.5 |
| Pacing | 9.5 | 9.0 | 8.5 |
| Retrieval checks | 8.5 | 7.0 | 6.0 |
| Difficulty start and ramp | 10.0 | 8.5 | 8.0 |
| Scaffolding and hint size | 10.0 | 10.0 | 8.5 |
| Worked example to practice | 8.5 | 3.0 | 3.0 |
| Explanation modes | 8.0 | 6.0 | 5.0 |
| Vocabulary level | 8.5 | 6.5 | 7.0 |
| Sentence length | 9.0 | 7.5 | 6.5 |
| Examples from interests | 10.0 | 7.5 | 0.0 |
| Avoided domains | 9.5 | 6.5 | 5.0 |
| Tone and feedback | 9.0 | 9.0 | 8.0 |
| Structure and format | 9.5 | 8.0 | 8.0 |
| Challenge and novelty | 9.5 | 6.5 | 4.0 |
| Interests used (judge) | 10.0 | 8.5 | 0.0 |
| Dislikes avoided (judge) | 10.0 | 6.5 | 5.0 |
| Age-appropriate reading level | 9.5 | 7.5 | 8.0 |
| Key-fact coverage | 10.0 | 7.5 | 9.0 |
| Accuracy | 10.0 | 10.0 | 10.0 |
| **Fit (mean)** | **9.2** | **7.1** | **5.9** |

### Ben: age 11, fast, gaming, dislikes reading
Topics: two-step equations, photosynthesis.

| Dimension | spec | legacy | generic |
|---|---|---|---|
| Lesson and chunk length | 5.5 | 2.0 | 2.0 |
| Pacing | 9.0 | 5.5 | 3.5 |
| Retrieval checks | 10.0 | 4.0 | 5.0 |
| Difficulty start and ramp | 8.5 | 7.0 | 6.5 |
| Scaffolding and hint size | 9.5 | 7.5 | 8.0 |
| Worked example to practice | 10.0 | 2.5 | 2.5 |
| Explanation modes | 7.5 | 3.5 | 3.0 |
| Vocabulary level | 9.0 | 4.0 | 6.0 |
| Sentence length | 7.5 | 3.0 | 2.5 |
| Examples from interests | 10.0 | 3.5 | 0.0 |
| Avoided domains | 10.0 | 10.0 | 10.0 |
| Tone and feedback | 9.0 | 4.5 | 2.5 |
| Structure and format | 7.5 | 2.5 | 2.5 |
| Challenge and novelty | 9.0 | 4.5 | 1.0 |
| Interests used (judge) | 10.0 | 4.0 | 0.0 |
| Dislikes avoided (judge) | 9.0 | 3.5 | 6.0 |
| Age-appropriate reading level | 9.0 | 4.0 | 4.5 |
| Key-fact coverage | 10.0 | 9.0 | 9.0 |
| Accuracy | 10.0 | 10.0 | 10.0 |
| **Fit (mean)** | **8.7** | **4.6** | **3.9** |

### Ruth: age 25, slow and careful, long desk sessions, cooking
Topics: causes of World War I, photosynthesis.

| Dimension | spec | legacy | generic |
|---|---|---|---|
| Lesson and chunk length | 7.5 | 2.5 | 2.5 |
| Pacing | 6.5 | 6.0 | 3.5 |
| Retrieval checks | 10.0 | 4.0 | 4.0 |
| Difficulty start and ramp | 9.5 | 7.5 | 7.5 |
| Scaffolding and hint size | 10.0 | 0.0 | 0.0 |
| Worked example to practice | 7.5 | 3.5 | 2.0 |
| Explanation modes | 9.0 | 8.0 | 6.5 |
| Vocabulary level | 6.5 | 5.0 | 4.0 |
| Sentence length | 8.5 | 7.5 | 5.5 |
| Examples from interests | 9.0 | 6.0 | 0.5 |
| Avoided domains | 10.0 | 10.0 | 10.0 |
| Tone and feedback | 9.0 | 8.5 | 7.5 |
| Structure and format | 9.5 | 7.0 | 6.0 |
| Challenge and novelty | 8.0 | 6.5 | 6.0 |
| Interests used (judge) | 9.5 | 7.0 | 0.5 |
| Dislikes avoided (judge) | 10.0 | 10.0 | 10.0 |
| Age-appropriate reading level | 7.5 | 6.5 | 7.0 |
| Key-fact coverage | 10.0 | 7.0 | 10.0 |
| Accuracy | 10.0 | 10.0 | 10.0 |
| **Fit (mean)** | **8.6** | **5.9** | **4.7** |

## What the spec was for each learner

| Learner / topic | Reading grade | Sentence cap | Sections x sentences | Checks | Worked : practice | Hints | Modes | Examples | Avoid |
|---|---|---|---|---|---|---|---|---|---|
| Maya / photosynthesis | 2 | 9 | 4 x 2 | 3 | 0.5 | partial | compact, visual-spatial, story, concrete-first | minecraft, drawing, building | none |
| Maya / Spanish greetings | 2 | 9 | 4 x 2 | 3 | 0.5 | partial | compact, visual-spatial, story, concrete-first | minecraft, drawing, building | none |
| Leo / two-step equations | 4 | 14 | 4 x 2 | 3 | 1.43 | partial | step-by-step, worked-examples, visual-spatial, concrete-first | soccer, fifa, plays striker | none |
| Leo / causes of World War I | 4 | 14 | 4 x 2 | 3 | 1.43 | partial | step-by-step, worked-examples, visual-spatial, concrete-first | soccer, fifa, plays striker | math |
| Ava / causes of World War I | 10 | 22 | 3 x 5 | 3 | 0.5 | partial | story, dialogue | piano, singing, songwriting, writing songs | none |
| Ava / photosynthesis | 10 | 22 | 3 x 5 | 3 | 0.5 | partial | story, dialogue | piano, singing, songwriting, writing songs | none |
| Noah / two-step equations | 14 | 23 | 2 x 6 | 2 | 0.31 | partial | compact, rule-first | cars, engines, formula 1, restoring motorbike | none |
| Noah / causes of World War I | 14 | 23 | 2 x 6 | 2 | 0.31 | partial | compact, rule-first | cars, engines, formula 1, restoring motorbike | none |
| Grace / photosynthesis | 9 | 17 | 4 x 2 | 3 | 1.43 | partial | step-by-step, visual-spatial, worked-examples, concrete-first | cooking, baking, food, trying new recipes | none |
| Grace / Spanish greetings | 9 | 17 | 4 x 2 | 3 | 1.43 | partial | step-by-step, visual-spatial, worked-examples, concrete-first | cooking, baking, food, trying new recipes | none |
| Frank / two-step equations | 11 | 21 | 5 x 3 | 3 | 1.56 | partial | worked-examples, concrete-first, big-picture, step-by-step | painting, museums, watercolor, gardening | none |
| Frank / Spanish greetings | 11 | 21 | 4 x 3 | 3 | 1.56 | partial | worked-examples, concrete-first, big-picture, step-by-step | painting, museums, watercolor, gardening | math |
| Sam / photosynthesis | 7 | 20 | 4 x 2 | 3 | 0.5 | partial | compact, visual-spatial, step-by-step | comics, drawing, skateboarding | long paragraphs |
| Sam / two-step equations | 7 | 20 | 4 x 2 | 3 | 0.5 | partial | compact, visual-spatial, step-by-step | comics, drawing, skateboarding | long paragraphs |
| Zoe / causes of World War I | 4 | 14 | 4 x 2 | 3 | 0.5 | partial | compact | roblox, dancing | none |
| Zoe / Spanish greetings | 4 | 14 | 4 x 2 | 3 | 0.5 | partial | compact | roblox, dancing | none |
| Ethan / photosynthesis | 14 | 23 | 2 x 4 | 2 | 0.31 | partial | compact, rule-first | guitar, music production, jazz theory, composing | none |
| Ethan / causes of World War I | 14 | 23 | 2 x 4 | 2 | 0.31 | partial | compact, rule-first | guitar, music production, jazz theory, composing | none |
| Priya / two-step equations | 12 | 21 | 4 x 2 | 3 | 1.43 | step | step-by-step, worked-examples, concrete-first | cooking, meal prep, baking bread | none |
| Priya / Spanish greetings | 12 | 21 | 4 x 2 | 3 | 1.43 | step | step-by-step, worked-examples | cooking, meal prep, baking bread | math |
| Omar / photosynthesis | 2 | 9 | 4 x 2 | 3 | 1.56 | partial | compact, worked-examples, story, concrete-first | cars, trucks, hot wheels | none |
| Omar / two-step equations | 2 | 9 | 4 x 2 | 3 | 1.56 | partial | compact, worked-examples, story, concrete-first | cars, trucks, hot wheels | none |
| Lena / photosynthesis | 14 | 22 | 3 x 5 | 2 | 0.16 | partial | dialogue, story | gardening, botany, ceramics, pottery | none |
| Lena / causes of World War I | 14 | 22 | 3 x 5 | 2 | 0.16 | partial | dialogue, story | gardening, botany, ceramics, pottery | none |
| Diego / causes of World War I | 6 | 17 | 4 x 3 | 3 | 0.61 | partial | visual-spatial, step-by-step, concrete-first, analogy | basketball, nba, sneakers, point guard | none |
| Diego / two-step equations | 6 | 17 | 4 x 3 | 3 | 0.61 | partial | visual-spatial, step-by-step, concrete-first, analogy | basketball, nba, sneakers, point guard | none |
| Chloe / causes of World War I | 13 | 22 | 3 x 5 | 3 | 0.5 | partial | story, dialogue | indie music, concerts, journaling | math, numbers |
| Chloe / Spanish greetings | 13 | 22 | 3 x 5 | 3 | 0.5 | partial | story, dialogue | indie music, concerts, journaling | math, numbers |
| Ben / two-step equations | 4 | 13 | 2 x 4 | 2 | 0.5 | partial | compact, visual-spatial, dialogue | fortnite, speedrunning, pokemon | none |
| Ben / photosynthesis | 4 | 13 | 2 x 4 | 2 | 0.5 | partial | compact, visual-spatial, dialogue | fortnite, speedrunning, pokemon | none |
| Ruth / causes of World War I | 12 | 21 | 5 x 2 | 2 | 1.43 | partial | step-by-step, worked-examples | cooking, gardening, podcasts, preserving food | none |
| Ruth / photosynthesis | 12 | 21 | 5 x 2 | 2 | 1.43 | partial | step-by-step, worked-examples | cooking, gardening, podcasts, preserving food | none |

## Systemic patterns

- Weakest dimensions for the spec arm: Lesson and chunk length 7.8 (generic 2.9); Vocabulary level 7.9 (generic 4.3); Sentence length 8.1 (generic 4.0); Explanation modes 8.4 (generic 4.3); Age-appropriate reading level 8.5 (generic 4.9).
- Smallest gain over generic: Accuracy +0.0; Key-fact coverage +1.0; Avoided domains +1.3; Dislikes avoided (judge) +1.7.
- Learners the spec fitted least well: Omar 8.2, Lena 8.5, Zoe 8.6.
- Spec problems still open after the one revision: interest_unused x3, too_long x3, sentence_length x2, coverage x1.
- Key facts the judge found missing: none reported.

## Hardening history: what the live runs found and what changed

Spec arm, mean over all lessons, 0 to 10, in the order the runs were made (run1, run2, run3). Each hardening round below fixed the general mechanism, then the whole proof was run again on the same sixteen learners and four topics.

| Dimension | run1 | run2 | run3 |
|---|---|---|---|
| Lesson and chunk length | 6.2 | 6.5 | 7.8 |
| Pacing | 7.4 | 8.3 | 8.8 |
| Retrieval checks | 6.0 | 9.6 | 9.8 |
| Difficulty start and ramp | 6.7 | 8.8 | 8.8 |
| Scaffolding and hint size | 4.2 | 9.8 | 9.9 |
| Worked example to practice | 6.0 | 7.6 | 9.0 |
| Explanation modes | 7.1 | 8.0 | 8.4 |
| Vocabulary level | 7.0 | 8.0 | 7.9 |
| Sentence length | 6.2 | 7.6 | 8.1 |
| Examples from interests | 7.8 | 9.6 | 9.7 |
| Avoided domains | 8.7 | 9.9 | 10.0 |
| Tone and feedback | 7.5 | 9.0 | 9.1 |
| Structure and format | 7.2 | 8.4 | 8.9 |
| Challenge and novelty | 6.5 | 8.7 | 8.6 |
| Interests used (judge) | 8.4 | 9.7 | 9.9 |
| Dislikes avoided (judge) | 8.7 | 9.7 | 9.8 |
| Age-appropriate reading level | 7.7 | 8.5 | 8.5 |
| Key-fact coverage | 8.4 | 10.0 | 10.0 |
| Accuracy | 10.0 | 10.0 | 10.0 |
| **Fit (mean)** | **6.8** | **8.6** | **8.9** |
| Lessons written and judged | 30 | 31 | 32 |
| Key facts missing (term overlap) | 17 of 150 | 0 of 155 | 1 of 160 |
| Lessons that left a spec problem open | 12 | 6 | 9 |

## Weaknesses the live runs found, and the general fix for each

Every fix is to the mechanism (the prompt contract, a field of the spec, a post-generation check, a guard), none to a learner, a topic or a test value, and each has a test in `scripts/learning-spec-test.js` or `scripts/learning-spec-wiring-test.js` that fails if the class comes back. Run 1 is the first complete live run, on the code as first built (its per-learner tables are kept in `docs/scorecard-proof-run1.md`); run 2 follows the first round of fixes; run 3 the second. The raw results of each run are `docs/scorecard-proof-run1.json`, `-run2.json` and `-run3.json`.

### Round 1 (run 1 to run 2: mean fit 6.8 to 8.6)

| # | What run 1 showed | Root cause | Fix | Test |
|---|---|---|---|---|
| 1 | Short-attention learners got 6 to 9 sentences in a section the spec said to keep to 2 (chunk length 6.2) | The block asked for "sections of up to N sentences" but nothing checked it, and the lesson validator cut a lesson at five sections, so the only way to obey was to drop content | The shape line now counts the section body and says to split a longer one into another section; a spec learner's section cap is 8 (a cap that dropped sections would drop content); the post-check measures sentences per section and revises once | "sections far longer than the spec are caught", "seven sections are kept for a spec learner" |
| 2 | Scaffolding and hint size 4.2: the lessons had no hints (generic 2.2) | The spec had a hint size but the lesson format has no hint field, so the writer had nowhere to put one | Where the learner needs support, each check question carries a one-line hint inside its prompt (a nudge, the idea, or the first step, never the answer); a check finds check questions with none | "a hint in each check question, and a draft with none is caught" |
| 3 | Retrieval checks 6.0: every check sat at the end although the spec asked for one after each piece | Same: no place in the format for a mid-lesson check | A closing line "Quick check: <question> Answer: <answer>" on every section (or every second), counted by a check | "a section with no Quick check is caught", "every second section" |
| 4 | Coverage fell below the generic lesson (8.4 against 9.1); ten spec lessons ended with a coverage problem still open (Imperialism and Nationalism missing from the WWI lesson) | A short, simple style invites cutting a fact, and the lesson writer's prompt did not list the facts that must stay | The key facts are named in the prompt as "the same for every learner, teach every one in full, do not cut any to keep it short"; the topic's syllabus text is passed in by `lessons.write`; the term-overlap check counts a fact as kept at half its terms, which stops a plain-word paraphrase from being read as a loss | "the key facts are named in the prompt for a spec learner, and not added for a default learner", "a revision that loses a key fact is thrown away" |
| 5 | "I hate long reading" became an avoided example domain, so the prompt said "never use examples from long reading" (judge: dislikes avoided 8.7) | One dislike list served two jobs: what to leave out of examples and how to deliver | Dislikes of a format or a way of teaching (reading, writing, tests and timers, repetition) are aversions that change the delivery and are never example domains; a disliked subject is an aversion only when it is what is being taught, an avoided domain otherwise; "never liked", "scared of", "dread" are read as dislikes | "disliked formats are not avoided domains", "a disliked subject other than the topic is still avoided in examples" |
| 6 | Sentence length 6.2 | The cap was 8 words for an 8-year-old, which no writer keeps, and the check allowed a 2.2x tail | Reading-level bases raised (10, 13, 17, 21 words); the prompt says "most sentences N words or fewer, none over N+6"; the check counts the share of sentences over N+6 | "sentences a word or two over the cap are not flagged, a text well over it is" |
| 7 | Common mistakes were long extra sections in lessons the spec said to keep short (judge: length and chunking) | The format always asked for up to 4 | The spec sets 1 to 4 and the validator enforces it | "at most 1 common mistake", `validateLesson` cap |

### Round 2 (run 2 to run 3: mean fit 8.6 to 8.9, worked-to-practice 7.6 to 9.0, chunk length 6.5 to 7.8)

| # | What run 2 showed | Fix | Test |
|---|---|---|---|
| 8 | Worked examples against practice 7.6: the spec's ratio could not be seen in a lesson with only end-of-lesson checks | The ratio becomes counts the page can show: N worked examples, then M lines "Try it: <question> Answer: <answer>" after them (never more than three); a check counts them | "a learner who learns by doing is asked for Try it lines, and a lesson with fewer is caught" |
| 9 | Lesson length 6.5: a 60-year-old was judged "under 1,600 words" and a short-attention child "over 290" | The word budget was read as a target and could be a book page | It is a ceiling, capped at 1,000 words, and the prompt says a shorter lesson that teaches every point is better; the check flags 30% over it (never at the cost of a key point) | "the spec states the words a learner has time for, and a lesson far over it is caught" |
| 10 | Interests used once and forgotten | The prompt said "wherever it fits" | Names how often by the learner's interest share: the worked example and every example (at least three), or about half (at least two), or one; the check counts uses | "a strong interest share names how often the interests are used, and a single passing mention is caught" |
| 11 | A learner a question opener engages got an intro that stated the topic | The sentence was one of ten and easy to lose | The shape line asks for the opening question; a check looks for it | "an intro without a question is caught" |

### What is still open

- Vocabulary 7.9 and explanation modes 8.4 are the lowest dimensions. The judge reads "define terms on every use" literally; the writers define a term where it matters. The spec is right to ask, and the check cannot tell a missing definition from a deliberate one.
- Sentence length stays at 8.1: long sentences survive in worked-example prompts and summaries, which the check counts only in the whole. A section-by-section check would catch them.
- Nine of 32 spec lessons still end a revision with a problem open (three too long, three interests used too rarely, two sentence length, one coverage). The revision is allowed once; a second pass would catch most of them at the price of a second model call on a quarter of the lessons.
- Difficulty start and ramp is judged from two to four check questions. The spec is right to carry it, but a lesson is too small a surface to show a ramp; a practice block does that better (see "Limits of this proof").

### Limits of this proof

- **Fit to the spec is not learning.** The judge scores how well a lesson follows what the spec asks for, and whether it teaches the same facts correctly. It cannot measure that a real learner understands more or remembers longer. The spec's rules carry their evidence ids (`03-M..`, `02-M..`); where a rule has none it is a design choice that follows the metric's definition. Only people learning from these lessons can show the outcome.
- **One writer family, one judge.** All 96 lessons per run were written by DeepSeek V4.1 Flash (Standard Compute, through the ledger) and judged by Gemini 3.8 Flash, a different family, blind to the arm. A second judge would show how much the scores depend on one model's taste. The free NVIDIA lineup, which is the app's own path, answered a tiny call in 272 s and a lesson call in 367 s, so the 100-odd lessons could not be written there; AIHubMix's free models refused after ten tries. The code's own measurements (sentences, sections, checks, domains, key-fact terms) are reported beside the judge for that reason.
- **Lessons only.** The study pack, notes, podcast, course builder, practice test, review timing, tutor plan and the quick-check clock read the same spec and are covered by `scripts/learning-spec-wiring-test.js` (prompts, numbers, grounding and coverage still enforced), but only the lesson writer was proven live.
- **The fixtures name few concrete dislikes.** Most dislikes in the sixteen learners are of a subject or a format (maths, long reading, being timed, repetition); the avoided-domain path is exercised mostly by "maths in a lesson that is not maths". The unit tests cover spiders, football and other concrete domains.
- **Generic and legacy rows in run 3 come from run 2** (those lessons do not depend on the spec). Run 1 and run 2 are complete runs of all three arms.


## Cost

- App-path generations: 51 calls, $0.0000 by the pool's own accounting (free NVIDIA lineup; paid slots switched off).
- Judges: 32 calls (google/gemini-3.8-flash x32); Standard Compute spend this run $0.6255 through the ledger with ceilingUsd 26.
- Across the 3 live runs: run1 $1.31, run2 $1.12, run3 $0.63; **$3.06 in all** at the ledger's deliberately high assumed prices (an upper bound on the bill), against a $4 limit. Standard Compute ledger at the start of run 1: spent $8.00882 (2110 calls); at the end of the last run: spent $11.067567 (2510 calls). Small probe runs that debugged the harness before run 1 cost under $0.30 more. The ledger moved by more than this work's spend because other jobs share the key.
- Standard Compute ledger: before spent $10.442083 (2427 calls, headroom $19.557917); after spent $11.067567 (2510 calls, headroom $18.932433).
