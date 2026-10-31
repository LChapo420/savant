# Scorecard modification proof

Run `run1` (live models) on 2026-10-31. Written by `node scripts/scorecard-modification-proof.js`.

Sixteen synthetic learners, two topics each (32 lessons per arm), every topic covered by 6 to 9 learners. Three arms: **spec** (the learning spec in the prompt, with its check and one revision), **legacy** (what the app did before: the scorecard's gated directives and the survey), **generic** (a learner we know nothing about: the shared version). Each lesson was judged blind by a model from a different family than any writer of it, against the learner's spec. Writer path: Standard Compute DeepSeek V4.1 Flash through the ledger (the free NVIDIA lineup was not answering). Judges used: google/gemini-3.8-flash. Writers: deepseek/deepseek-v4.1-flash-1017 x84.

## Averages: spec against generic and legacy

| Dimension (0 to 10) | spec | legacy | generic | spec - generic | spec - legacy |
|---|---|---|---|---|---|
| Lesson and chunk length | 6.2 | 4.0 | 3.7 | 2.5 | 2.2 |
| Pacing | 7.4 | 6.6 | 5.3 | 2.2 | 0.8 |
| Retrieval checks | 6.0 | 4.7 | 3.5 | 2.5 | 1.3 |
| Difficulty start and ramp | 6.7 | 6.4 | 4.8 | 1.9 | 0.3 |
| Scaffolding and hint size | 4.2 | 3.9 | 2.2 | 2.0 | 0.4 |
| Worked example to practice | 6.0 | 5.7 | 4.7 | 1.3 | 0.3 |
| Explanation modes | 7.1 | 6.8 | 4.3 | 2.8 | 0.3 |
| Vocabulary level | 7.0 | 6.2 | 4.4 | 2.7 | 0.8 |
| Sentence length | 6.2 | 4.7 | 3.6 | 2.6 | 1.5 |
| Examples from interests | 7.8 | 5.3 | 0.3 | 7.5 | 2.5 |
| Avoided domains | 8.7 | 8.4 | 6.9 | 1.8 | 0.2 |
| Tone and feedback | 7.5 | 6.6 | 4.9 | 2.6 | 0.9 |
| Structure and format | 7.2 | 5.6 | 4.4 | 2.8 | 1.6 |
| Challenge and novelty | 6.5 | 5.8 | 3.3 | 3.3 | 0.8 |
| Interests used (judge) | 8.4 | 6.1 | 0.3 | 8.2 | 2.3 |
| Dislikes avoided (judge) | 8.7 | 8.4 | 6.9 | 1.8 | 0.3 |
| Age-appropriate reading level | 7.7 | 6.7 | 4.9 | 2.8 | 1.1 |
| Key-fact coverage | 8.4 | 8.1 | 9.1 | -0.7 | 0.3 |
| Accuracy | 10.0 | 10.0 | 10.0 | 0.0 | 0.0 |
| **Mean fit to the spec (14 dimensions)** | **6.8** | **5.8** | **4.0** | **2.7** | **1.0** |

Cells where the spec lesson fits better than the generic one by more than 0.25: 30 of 30; better than legacy: 24 of 30. Cells where it fits worse than generic: 0.

## What the code measured in the text (no model)

| Measure | spec | legacy | generic |
|---|---|---|---|
| Lessons | 30 | 32 | 32 |
| Mean sentence length (words) | 12.9 | 14.4 | 14.3 |
| Share of long words (11+ letters, not the topic's own) | 1.2% | 1.4% | 1.7% |
| Sections | 3.6 | 3.3 | 3.0 |
| Sentences per section | 6.4 | 10.1 | 7.0 |
| Check questions | 2.7 | 3.8 | 3.8 |
| Words in the lesson | 610 | 862 | 587 |
| Lessons that used a disliked domain | 1 | 6 | 2 |
| Lessons that used an interest (of those with interests) | 29 of 30 | 24 of 32 | 4 of 32 |
| Key facts missing (term overlap, of all) | 17 of 150 | 34 of 160 | 14 of 160 |
| Lessons revised once by the spec check | 22 | n/a | n/a |
| Lessons that left a spec problem open after the revision | 12 | n/a | n/a |

Spec followed, by the code's count (spec arm): sentence length within 25% of the cap 30 of 30; section count within 2 30 of 30; number of checks within 1 30 of 30; no disliked domain 29 of 30; interests used when the spec asks 29 of 30.

## Per learner

Averages over the learner's two topics, 0 to 10 (fit = mean of the 14 spec dimensions).

### Maya: age 8, short attention, loves Minecraft, dislikes reading
Topics: photosynthesis, Spanish greetings.

| Dimension | spec | legacy | generic |
|---|---|---|---|
| Lesson and chunk length | 5.0 | 3.0 | 1.0 |
| Pacing | 8.0 | 6.0 | 4.0 |
| Retrieval checks | 6.5 | 7.0 | 2.0 |
| Difficulty start and ramp | 7.0 | 6.0 | 3.5 |
| Scaffolding and hint size | 2.5 | 3.5 | 0.5 |
| Worked example to practice | 7.5 | 5.0 | 4.0 |
| Explanation modes | 6.0 | 5.5 | 2.0 |
| Vocabulary level | 8.0 | 4.0 | 2.5 |
| Sentence length | 3.5 | 1.5 | 0.5 |
| Examples from interests | 8.5 | 7.0 | 0.0 |
| Avoided domains | 8.5 | 2.5 | 0.5 |
| Tone and feedback | 6.0 | 6.5 | 2.5 |
| Structure and format | 6.0 | 4.0 | 2.5 |
| Challenge and novelty | 7.5 | 6.0 | 0.5 |
| Interests used (judge) | 9.5 | 7.5 | 0.0 |
| Dislikes avoided (judge) | 9.0 | 2.0 | 0.5 |
| Age-appropriate reading level | 6.5 | 3.5 | 2.0 |
| Key-fact coverage | 8.0 | 9.0 | 9.0 |
| Accuracy | 10.0 | 10.0 | 10.0 |
| **Fit (mean)** | **6.5** | **4.8** | **1.9** |

### Leo: age 11, soccer, visual and step-by-step, dislikes maths
Topics: two-step equations, causes of World War I.

| Dimension | spec | legacy | generic |
|---|---|---|---|
| Lesson and chunk length | 5.5 | 2.0 | 2.5 |
| Pacing | 8.0 | 6.5 | 5.0 |
| Retrieval checks | 5.0 | 3.0 | 3.5 |
| Difficulty start and ramp | 7.5 | 6.0 | 4.5 |
| Scaffolding and hint size | 3.5 | 2.5 | 1.5 |
| Worked example to practice | 7.0 | 6.0 | 6.0 |
| Explanation modes | 8.0 | 7.5 | 4.0 |
| Vocabulary level | 8.5 | 4.0 | 3.0 |
| Sentence length | 5.5 | 2.0 | 1.5 |
| Examples from interests | 6.0 | 6.0 | 0.0 |
| Avoided domains | 10.0 | 10.0 | 10.0 |
| Tone and feedback | 6.0 | 3.5 | 1.5 |
| Structure and format | 7.0 | 4.5 | 3.5 |
| Challenge and novelty | 7.0 | 6.0 | 3.0 |
| Interests used (judge) | 6.5 | 6.5 | 0.0 |
| Dislikes avoided (judge) | 9.5 | 10.0 | 10.0 |
| Age-appropriate reading level | 8.5 | 3.5 | 3.0 |
| Key-fact coverage | 10.0 | 10.0 | 9.0 |
| Accuracy | 10.0 | 10.0 | 10.0 |
| **Fit (mean)** | **6.8** | **5.0** | **3.5** |

### Ava: age 14, music, verbal, test-anxious
Topics: causes of World War I, photosynthesis.

| Dimension | spec | legacy | generic |
|---|---|---|---|
| Lesson and chunk length | 8.5 | 7.0 | 7.0 |
| Pacing | 8.5 | 7.0 | 7.5 |
| Retrieval checks | 5.0 | 5.0 | 4.0 |
| Difficulty start and ramp | 7.5 | 6.5 | 7.0 |
| Scaffolding and hint size | 4.5 | 4.5 | 2.5 |
| Worked example to practice | 5.5 | 5.5 | 4.5 |
| Explanation modes | 4.5 | 5.0 | 2.5 |
| Vocabulary level | 8.5 | 9.0 | 8.0 |
| Sentence length | 7.0 | 7.0 | 5.5 |
| Examples from interests | 3.5 | 5.5 | 0.0 |
| Avoided domains | 10.0 | 10.0 | 10.0 |
| Tone and feedback | 7.5 | 7.0 | 3.0 |
| Structure and format | 8.5 | 7.5 | 7.5 |
| Challenge and novelty | 5.5 | 5.0 | 3.5 |
| Interests used (judge) | 4.5 | 6.0 | 0.0 |
| Dislikes avoided (judge) | 10.0 | 10.0 | 10.0 |
| Age-appropriate reading level | 9.0 | 9.0 | 8.5 |
| Key-fact coverage | 8.0 | 10.0 | 9.5 |
| Accuracy | 10.0 | 10.0 | 10.0 |
| **Fit (mean)** | **6.8** | **6.5** | **5.2** |

### Noah: age 17, cars, fast and gifted-and-bored
Topics: two-step equations, causes of World War I.

| Dimension | spec | legacy | generic |
|---|---|---|---|
| Lesson and chunk length | 6.0 | 4.5 | 4.0 |
| Pacing | 6.0 | 7.0 | 4.0 |
| Retrieval checks | 6.0 | 5.0 | 4.0 |
| Difficulty start and ramp | 3.5 | 6.0 | 3.0 |
| Scaffolding and hint size | 5.5 | 5.5 | 4.0 |
| Worked example to practice | 4.0 | 4.5 | 3.0 |
| Explanation modes | 8.5 | 8.5 | 7.5 |
| Vocabulary level | 6.5 | 6.5 | 4.5 |
| Sentence length | 7.5 | 4.0 | 5.5 |
| Examples from interests | 7.0 | 2.0 | 0.0 |
| Avoided domains | 3.5 | 6.5 | 2.0 |
| Tone and feedback | 8.0 | 7.0 | 6.5 |
| Structure and format | 6.0 | 7.0 | 5.5 |
| Challenge and novelty | 2.0 | 3.0 | 1.0 |
| Interests used (judge) | 7.5 | 2.5 | 0.0 |
| Dislikes avoided (judge) | 3.5 | 6.5 | 2.0 |
| Age-appropriate reading level | 7.0 | 7.5 | 4.5 |
| Key-fact coverage | 10.0 | 9.5 | 9.5 |
| Accuracy | 10.0 | 10.0 | 10.0 |
| **Fit (mean)** | **5.7** | **5.5** | **3.9** |

### Grace: age 25, English is a second language, cooking, step-by-step
Topics: photosynthesis, Spanish greetings.

| Dimension | spec | legacy | generic |
|---|---|---|---|
| Lesson and chunk length | 7.0 | 3.0 | 3.0 |
| Pacing | 8.5 | 6.5 | 7.5 |
| Retrieval checks | 5.0 | 4.0 | 4.5 |
| Difficulty start and ramp | 7.5 | 6.0 | 6.5 |
| Scaffolding and hint size | 4.5 | 3.0 | 2.0 |
| Worked example to practice | 7.5 | 5.5 | 3.5 |
| Explanation modes | 9.0 | 8.0 | 6.5 |
| Vocabulary level | 8.0 | 8.0 | 5.5 |
| Sentence length | 7.0 | 8.0 | 3.0 |
| Examples from interests | 9.0 | 7.5 | 0.5 |
| Avoided domains | 10.0 | 10.0 | 10.0 |
| Tone and feedback | 7.5 | 7.5 | 8.0 |
| Structure and format | 8.5 | 7.0 | 4.0 |
| Challenge and novelty | 7.5 | 7.0 | 6.0 |
| Interests used (judge) | 9.5 | 9.0 | 0.5 |
| Dislikes avoided (judge) | 10.0 | 10.0 | 10.0 |
| Age-appropriate reading level | 8.5 | 8.5 | 6.5 |
| Key-fact coverage | 8.0 | 8.5 | 9.0 |
| Accuracy | 10.0 | 10.0 | 10.0 |
| **Fit (mean)** | **7.6** | **6.5** | **5.0** |

### Frank: age 60, art, slow pace, little background
Topics: two-step equations, Spanish greetings.

| Dimension | spec | legacy | generic |
|---|---|---|---|
| Lesson and chunk length | 7.0 | 7.0 | 6.0 |
| Pacing | 5.5 | 6.5 | 4.0 |
| Retrieval checks | 5.5 | 5.5 | 5.0 |
| Difficulty start and ramp | 7.0 | 7.5 | 6.5 |
| Scaffolding and hint size | 5.0 | 4.5 | 2.5 |
| Worked example to practice | 9.0 | 8.0 | 5.5 |
| Explanation modes | 8.5 | 8.0 | 5.0 |
| Vocabulary level | 7.5 | 7.5 | 3.5 |
| Sentence length | 6.0 | 7.0 | 6.0 |
| Examples from interests | 10.0 | 7.5 | 0.0 |
| Avoided domains | 10.0 | 10.0 | 10.0 |
| Tone and feedback | 9.0 | 8.0 | 7.5 |
| Structure and format | 8.0 | 7.5 | 4.5 |
| Challenge and novelty | 8.0 | 7.5 | 6.0 |
| Interests used (judge) | 10.0 | 9.0 | 0.0 |
| Dislikes avoided (judge) | 10.0 | 10.0 | 10.0 |
| Age-appropriate reading level | 8.5 | 8.5 | 7.5 |
| Key-fact coverage | 9.0 | 6.5 | 8.5 |
| Accuracy | 10.0 | 10.0 | 10.0 |
| **Fit (mean)** | **7.6** | **7.3** | **5.1** |

### Sam: age 14, dyslexia-like reading profile, art
Topics: photosynthesis, two-step equations.

| Dimension | spec | legacy | generic |
|---|---|---|---|
| Lesson and chunk length | 4.0 | 4.0 | 1.5 |
| Pacing | 8.0 | 7.5 | 5.5 |
| Retrieval checks | 5.0 | 4.5 | 3.5 |
| Difficulty start and ramp | 7.0 | 7.0 | 6.0 |
| Scaffolding and hint size | 3.0 | 3.0 | 1.5 |
| Worked example to practice | 3.0 | 6.5 | 4.0 |
| Explanation modes | 8.0 | 7.5 | 3.0 |
| Vocabulary level | 5.0 | 6.5 | 4.0 |
| Sentence length | 4.0 | 5.5 | 3.5 |
| Examples from interests | 5.0 | 6.5 | 0.0 |
| Avoided domains | 4.0 | 4.5 | 0.5 |
| Tone and feedback | 7.0 | 7.0 | 4.0 |
| Structure and format | 5.0 | 5.5 | 1.5 |
| Challenge and novelty | 6.0 | 7.0 | 4.0 |
| Interests used (judge) | 5.0 | 7.0 | 0.0 |
| Dislikes avoided (judge) | 4.0 | 4.5 | 0.5 |
| Age-appropriate reading level | 6.0 | 6.0 | 3.0 |
| Key-fact coverage | 9.0 | 8.0 | 9.0 |
| Accuracy | 10.0 | 10.0 | 10.0 |
| **Fit (mean)** | **5.3** | **5.9** | **3.0** |

### Zoe: age 11, attention difficulty, phone-only short sessions, gaming and dance
Topics: causes of World War I, Spanish greetings.

| Dimension | spec | legacy | generic |
|---|---|---|---|
| Lesson and chunk length | 4.0 | 3.0 | 1.5 |
| Pacing | 3.5 | 2.5 | 2.5 |
| Retrieval checks | 5.0 | 5.5 | 2.5 |
| Difficulty start and ramp | 6.0 | 6.5 | 4.5 |
| Scaffolding and hint size | 2.5 | 3.0 | 1.0 |
| Worked example to practice | 5.5 | 6.0 | 5.0 |
| Explanation modes | 7.5 | 7.0 | 3.5 |
| Vocabulary level | 8.5 | 6.0 | 3.0 |
| Sentence length | 6.0 | 3.0 | 1.0 |
| Examples from interests | 6.5 | 4.5 | 0.0 |
| Avoided domains | 10.0 | 10.0 | 10.0 |
| Tone and feedback | 6.5 | 6.5 | 2.5 |
| Structure and format | 6.0 | 4.0 | 2.0 |
| Challenge and novelty | 7.0 | 4.5 | 1.5 |
| Interests used (judge) | 7.0 | 4.5 | 0.0 |
| Dislikes avoided (judge) | 10.0 | 10.0 | 10.0 |
| Age-appropriate reading level | 8.5 | 6.0 | 3.0 |
| Key-fact coverage | 5.5 | 7.5 | 8.5 |
| Accuracy | 10.0 | 10.0 | 10.0 |
| **Fit (mean)** | **6.0** | **5.1** | **2.9** |

### Ethan: age 17, music, gifted-and-bored
Topics: photosynthesis, causes of World War I.

| Dimension | spec | legacy | generic |
|---|---|---|---|
| Lesson and chunk length | 5.0 | 3.5 | 3.0 |
| Pacing | 8.0 | 8.0 | 4.0 |
| Retrieval checks | 4.0 | 4.0 | 3.0 |
| Difficulty start and ramp | 3.0 | 7.5 | 2.0 |
| Scaffolding and hint size | 5.0 | 7.0 | 4.0 |
| Worked example to practice | 4.0 | 7.0 | 7.0 |
| Explanation modes | 9.0 | 9.0 | 8.5 |
| Vocabulary level | 8.0 | 8.5 | 3.0 |
| Sentence length | 7.0 | 5.0 | 5.5 |
| Examples from interests | 10.0 | 1.5 | 0.0 |
| Avoided domains | 8.0 | 9.5 | 3.5 |
| Tone and feedback | 8.0 | 7.0 | 6.5 |
| Structure and format | 8.0 | 5.5 | 5.0 |
| Challenge and novelty | 3.0 | 4.0 | 1.0 |
| Interests used (judge) | 10.0 | 1.0 | 0.0 |
| Dislikes avoided (judge) | 8.0 | 10.0 | 3.5 |
| Age-appropriate reading level | 8.0 | 9.0 | 3.5 |
| Key-fact coverage | 6.0 | 8.5 | 10.0 |
| Accuracy | 10.0 | 10.0 | 10.0 |
| **Fit (mean)** | **6.4** | **6.2** | **4.0** |

### Priya: age 25, test-anxious, cooking, dislikes maths
Topics: two-step equations, Spanish greetings.

| Dimension | spec | legacy | generic |
|---|---|---|---|
| Lesson and chunk length | 6.0 | 4.0 | 4.0 |
| Pacing | 8.0 | 8.5 | 7.0 |
| Retrieval checks | 6.0 | 7.0 | 4.5 |
| Difficulty start and ramp | 7.5 | 8.0 | 7.0 |
| Scaffolding and hint size | 5.5 | 6.0 | 3.5 |
| Worked example to practice | 8.0 | 7.5 | 6.0 |
| Explanation modes | 8.5 | 9.0 | 5.5 |
| Vocabulary level | 6.0 | 6.5 | 7.0 |
| Sentence length | 6.0 | 7.5 | 3.5 |
| Examples from interests | 8.0 | 6.5 | 0.0 |
| Avoided domains | 8.5 | 9.5 | 9.5 |
| Tone and feedback | 7.5 | 8.5 | 4.5 |
| Structure and format | 8.0 | 6.5 | 6.0 |
| Challenge and novelty | 8.0 | 7.5 | 6.5 |
| Interests used (judge) | 9.5 | 7.5 | 0.0 |
| Dislikes avoided (judge) | 8.5 | 10.0 | 10.0 |
| Age-appropriate reading level | 6.5 | 7.5 | 6.5 |
| Key-fact coverage | 8.5 | 6.5 | 8.0 |
| Accuracy | 10.0 | 10.0 | 10.0 |
| **Fit (mean)** | **7.3** | **7.3** | **5.3** |

### Omar: age 8, almost no prior knowledge, loves cars
Topics: photosynthesis, two-step equations.

| Dimension | spec | legacy | generic |
|---|---|---|---|
| Lesson and chunk length | 4.5 | 2.5 | 2.0 |
| Pacing | 8.0 | 6.5 | 4.5 |
| Retrieval checks | 7.0 | 6.0 | 3.0 |
| Difficulty start and ramp | 7.5 | 3.5 | 2.0 |
| Scaffolding and hint size | 3.5 | 3.0 | 1.0 |
| Worked example to practice | 6.0 | 5.5 | 5.0 |
| Explanation modes | 6.5 | 5.5 | 3.0 |
| Vocabulary level | 6.5 | 3.5 | 1.5 |
| Sentence length | 5.0 | 1.0 | 1.0 |
| Examples from interests | 5.5 | 6.5 | 0.0 |
| Avoided domains | 10.0 | 10.0 | 10.0 |
| Tone and feedback | 7.0 | 5.0 | 2.0 |
| Structure and format | 5.5 | 3.0 | 2.5 |
| Challenge and novelty | 6.0 | 5.0 | 1.5 |
| Interests used (judge) | 6.5 | 8.0 | 0.0 |
| Dislikes avoided (judge) | 10.0 | 10.0 | 10.0 |
| Age-appropriate reading level | 7.0 | 3.0 | 2.0 |
| Key-fact coverage | 10.0 | 8.0 | 9.0 |
| Accuracy | 10.0 | 10.0 | 10.0 |
| **Fit (mean)** | **6.3** | **4.8** | **2.8** |

### Lena: age 60, knows most of it, art and gardening, long desk sessions
Topics: photosynthesis, causes of World War I.

| Dimension | spec | legacy | generic |
|---|---|---|---|
| Lesson and chunk length | 8.5 | 8.0 | 7.5 |
| Pacing | 8.5 | 8.0 | 8.0 |
| Retrieval checks | 7.5 | 4.0 | 3.0 |
| Difficulty start and ramp | 5.5 | 6.0 | 3.0 |
| Scaffolding and hint size | 5.5 | 5.5 | 3.5 |
| Worked example to practice | 3.0 | 5.0 | 3.5 |
| Explanation modes | 1.5 | 2.5 | 0.5 |
| Vocabulary level | 4.0 | 5.5 | 3.0 |
| Sentence length | 5.5 | 4.0 | 6.5 |
| Examples from interests | 9.5 | 0.0 | 2.5 |
| Avoided domains | 10.0 | 10.0 | 10.0 |
| Tone and feedback | 9.0 | 8.0 | 8.0 |
| Structure and format | 9.0 | 6.0 | 7.0 |
| Challenge and novelty | 5.5 | 6.0 | 2.5 |
| Interests used (judge) | 9.5 | 0.0 | 2.5 |
| Dislikes avoided (judge) | 10.0 | 10.0 | 10.0 |
| Age-appropriate reading level | 8.0 | 8.5 | 4.5 |
| Key-fact coverage | 10.0 | 7.5 | 10.0 |
| Accuracy | 10.0 | 10.0 | 10.0 |
| **Fit (mean)** | **6.6** | **5.6** | **4.9** |

### Diego: age 14, English learner (Spanish speaker), sports, visual
Topics: causes of World War I, two-step equations.

| Dimension | spec | legacy | generic |
|---|---|---|---|
| Lesson and chunk length | 8.0 | 3.5 | 4.0 |
| Pacing | 9.0 | 7.5 | 6.0 |
| Retrieval checks | 5.5 | 3.5 | 3.5 |
| Difficulty start and ramp | 7.5 | 6.5 | 5.0 |
| Scaffolding and hint size | 3.5 | 2.5 | 1.5 |
| Worked example to practice | 6.5 | 4.0 | 5.5 |
| Explanation modes | 6.5 | 7.0 | 2.5 |
| Vocabulary level | 6.5 | 7.0 | 3.5 |
| Sentence length | 8.0 | 5.0 | 2.5 |
| Examples from interests | 8.5 | 5.5 | 0.0 |
| Avoided domains | 10.0 | 10.0 | 10.0 |
| Tone and feedback | 7.5 | 6.5 | 6.0 |
| Structure and format | 7.0 | 5.5 | 4.0 |
| Challenge and novelty | 7.0 | 6.5 | 4.5 |
| Interests used (judge) | 9.5 | 7.5 | 0.0 |
| Dislikes avoided (judge) | 10.0 | 10.0 | 10.0 |
| Age-appropriate reading level | 8.5 | 7.0 | 4.0 |
| Key-fact coverage | 6.0 | 6.0 | 9.5 |
| Accuracy | 10.0 | 10.0 | 10.0 |
| **Fit (mean)** | **7.2** | **5.8** | **4.2** |

### Chloe: age 17, verbal, music, dislikes maths
Topics: causes of World War I, Spanish greetings.

| Dimension | spec | legacy | generic |
|---|---|---|---|
| Lesson and chunk length | 8.0 | 4.5 | 7.5 |
| Pacing | 9.0 | 8.0 | 7.5 |
| Retrieval checks | 8.5 | 4.0 | 4.0 |
| Difficulty start and ramp | 8.0 | 6.5 | 6.5 |
| Scaffolding and hint size | 5.0 | 2.5 | 3.0 |
| Worked example to practice | 6.5 | 6.0 | 5.5 |
| Explanation modes | 7.0 | 5.5 | 4.0 |
| Vocabulary level | 7.0 | 7.0 | 7.0 |
| Sentence length | 7.5 | 7.0 | 4.5 |
| Examples from interests | 9.0 | 9.5 | 0.0 |
| Avoided domains | 8.5 | 9.0 | 4.0 |
| Tone and feedback | 8.0 | 7.0 | 6.5 |
| Structure and format | 8.5 | 6.5 | 8.0 |
| Challenge and novelty | 7.5 | 6.5 | 4.0 |
| Interests used (judge) | 9.5 | 9.5 | 0.0 |
| Dislikes avoided (judge) | 8.5 | 9.5 | 4.0 |
| Age-appropriate reading level | 8.0 | 7.5 | 8.0 |
| Key-fact coverage | 5.5 | 7.0 | 8.0 |
| Accuracy | 10.0 | 10.0 | 10.0 |
| **Fit (mean)** | **7.7** | **6.4** | **5.1** |

### Ben: age 11, fast, gaming, dislikes reading
Topics: two-step equations, photosynthesis.

| Dimension | spec | legacy | generic |
|---|---|---|---|
| Lesson and chunk length | 4.0 | 2.0 | 1.5 |
| Pacing | 7.0 | 3.5 | 3.5 |
| Retrieval checks | 7.0 | 3.5 | 3.0 |
| Difficulty start and ramp | 6.5 | 6.5 | 4.0 |
| Scaffolding and hint size | 4.0 | 2.5 | 1.0 |
| Worked example to practice | 4.0 | 4.0 | 3.0 |
| Explanation modes | 7.0 | 4.0 | 2.5 |
| Vocabulary level | 7.5 | 4.5 | 6.0 |
| Sentence length | 5.5 | 2.0 | 2.0 |
| Examples from interests | 10.0 | 3.0 | 0.0 |
| Avoided domains | 5.0 | 3.5 | 0.5 |
| Tone and feedback | 8.0 | 4.0 | 2.5 |
| Structure and format | 5.0 | 3.0 | 2.0 |
| Challenge and novelty | 8.0 | 4.5 | 1.0 |
| Interests used (judge) | 10.0 | 4.0 | 0.0 |
| Dislikes avoided (judge) | 5.5 | 2.5 | 0.5 |
| Age-appropriate reading level | 7.0 | 4.5 | 4.0 |
| Key-fact coverage | 10.0 | 9.5 | 9.0 |
| Accuracy | 10.0 | 10.0 | 10.0 |
| **Fit (mean)** | **6.3** | **3.6** | **2.3** |

### Ruth: age 25, slow and careful, long desk sessions, cooking
Topics: causes of World War I, photosynthesis.

| Dimension | spec | legacy | generic |
|---|---|---|---|
| Lesson and chunk length | 6.0 | 2.5 | 2.5 |
| Pacing | 5.5 | 6.5 | 3.5 |
| Retrieval checks | 6.0 | 3.0 | 3.5 |
| Difficulty start and ramp | 7.0 | 6.0 | 6.0 |
| Scaffolding and hint size | 4.5 | 3.5 | 2.5 |
| Worked example to practice | 7.0 | 5.0 | 4.0 |
| Explanation modes | 9.0 | 8.5 | 7.5 |
| Vocabulary level | 6.0 | 5.5 | 5.0 |
| Sentence length | 7.0 | 5.0 | 5.0 |
| Examples from interests | 8.5 | 6.5 | 1.0 |
| Avoided domains | 10.0 | 10.0 | 10.0 |
| Tone and feedback | 8.0 | 7.0 | 7.0 |
| Structure and format | 8.5 | 7.0 | 5.5 |
| Challenge and novelty | 7.0 | 6.5 | 5.5 |
| Interests used (judge) | 9.5 | 7.5 | 1.0 |
| Dislikes avoided (judge) | 10.0 | 10.0 | 10.0 |
| Age-appropriate reading level | 7.5 | 7.0 | 8.0 |
| Key-fact coverage | 9.5 | 7.0 | 9.5 |
| Accuracy | 10.0 | 10.0 | 10.0 |
| **Fit (mean)** | **7.1** | **5.9** | **4.9** |

## What the spec was for each learner

| Learner / topic | Reading grade | Sentence cap | Sections x sentences | Checks | Worked : practice | Hints | Modes | Examples | Avoid |
|---|---|---|---|---|---|---|---|---|---|
| Maya / photosynthesis | 2 | 8 | 4 x 2 | 3 | 0.5 | partial | compact, visual-spatial, story, concrete-first | minecraft, drawing, building | long reading |
| Maya / Spanish greetings | 2 | 8 | 4 x 2 | 3 | 0.5 | partial | compact, visual-spatial, story, concrete-first | minecraft, drawing, building | long reading |
| Leo / two-step equations | 4 | 13 | 4 x 2 | 3 | 1.43 | partial | step-by-step, worked-examples, visual-spatial, concrete-first | soccer, fifa, plays striker | none |
| Leo / causes of World War I | 4 | 13 | 4 x 2 | 3 | 1.43 | partial | step-by-step, worked-examples, visual-spatial, concrete-first | soccer, fifa, plays striker | math |
| Ava / causes of World War I | 10 | 21 | 3 x 5 | 3 | 0.5 | partial | story, dialogue | piano, singing, songwriting, writing songs | none |
| Ava / photosynthesis | 10 | 21 | 3 x 5 | 3 | 0.5 | partial | story, dialogue | piano, singing, songwriting, writing songs | none |
| Noah / two-step equations | 14 | 22 | 2 x 6 | 2 | 0.31 | partial | compact, rule-first | cars, engines, formula 1, restoring motorbike | when lessons repeat |
| Noah / causes of World War I | 14 | 22 | 2 x 6 | 2 | 0.31 | partial | compact, rule-first | cars, engines, formula 1, restoring motorbike | when lessons repeat |
| Grace / photosynthesis | 9 | 16 | 4 x 2 | 3 | 1.43 | partial | step-by-step, visual-spatial, worked-examples, concrete-first | cooking, baking, food, trying new recipes | none |
| Grace / Spanish greetings | 9 | 16 | 4 x 2 | 3 | 1.43 | partial | step-by-step, visual-spatial, worked-examples, concrete-first | cooking, baking, food, trying new recipes | none |
| Frank / two-step equations | 11 | 20 | 4 x 3 | 3 | 1.56 | partial | worked-examples, concrete-first, big-picture, step-by-step | painting, museums, watercolor, gardening | none |
| Frank / Spanish greetings | 11 | 20 | 4 x 3 | 3 | 1.56 | partial | worked-examples, concrete-first, big-picture, step-by-step | painting, museums, watercolor, gardening | none |
| Sam / photosynthesis | 7 | 19 | 4 x 2 | 3 | 0.5 | partial | compact, visual-spatial, step-by-step | comics, drawing, skateboarding | long paragraphs |
| Sam / two-step equations | 7 | 19 | 4 x 2 | 3 | 0.5 | partial | compact, visual-spatial, step-by-step | comics, drawing, skateboarding | long paragraphs |
| Zoe / causes of World War I | 4 | 13 | 4 x 2 | 3 | 0.5 | partial | compact | roblox, dancing | none |
| Zoe / Spanish greetings | 4 | 13 | 4 x 2 | 3 | 0.5 | partial | compact | roblox, dancing | none |
| Ethan / photosynthesis | 14 | 22 | 2 x 4 | 2 | 0.31 | partial | compact, rule-first | guitar, music production, jazz theory, composing | busywork, baby-steps explanations |
| Ethan / causes of World War I | 14 | 22 | 2 x 4 | 2 | 0.31 | partial | compact, rule-first | guitar, music production, jazz theory, composing | busywork, baby-steps explanations |
| Priya / two-step equations | 12 | 20 | 4 x 2 | 3 | 1.43 | step | step-by-step, worked-examples, concrete-first | cooking, meal prep, baking bread | freeze tests |
| Priya / Spanish greetings | 12 | 20 | 4 x 2 | 3 | 1.43 | step | step-by-step, worked-examples | cooking, meal prep, baking bread | math, freeze tests |
| Omar / photosynthesis | 2 | 8 | 4 x 2 | 3 | 1.56 | partial | compact, worked-examples, story, concrete-first | cars, trucks, hot wheels | none |
| Omar / two-step equations | 2 | 8 | 4 x 2 | 3 | 1.56 | partial | compact, worked-examples, story, concrete-first | cars, trucks, hot wheels | none |
| Lena / photosynthesis | 14 | 21 | 3 x 5 | 2 | 0.16 | partial | dialogue, story | gardening, botany, ceramics, pottery | none |
| Lena / causes of World War I | 14 | 21 | 3 x 5 | 2 | 0.16 | partial | dialogue, story | gardening, botany, ceramics, pottery | none |
| Diego / causes of World War I | 6 | 16 | 4 x 3 | 3 | 0.61 | partial | visual-spatial, step-by-step, concrete-first, analogy | basketball, nba, sneakers, point guard | none |
| Diego / two-step equations | 6 | 16 | 4 x 3 | 3 | 0.61 | partial | visual-spatial, step-by-step, concrete-first, analogy | basketball, nba, sneakers, point guard | none |
| Chloe / causes of World War I | 13 | 21 | 3 x 5 | 3 | 0.5 | partial | story, dialogue | indie music, concerts, journaling | math, numbers |
| Chloe / Spanish greetings | 13 | 21 | 3 x 5 | 3 | 0.5 | partial | story, dialogue | indie music, concerts, journaling | math, numbers |
| Ben / two-step equations | 4 | 12 | 2 x 4 | 2 | 0.5 | partial | compact, visual-spatial, dialogue | fortnite, speedrunning, pokemon | reading long |
| Ben / photosynthesis | 4 | 12 | 2 x 4 | 2 | 0.5 | partial | compact, visual-spatial, dialogue | fortnite, speedrunning, pokemon | reading long |
| Ruth / causes of World War I | 12 | 20 | 5 x 2 | 2 | 1.43 | partial | step-by-step, worked-examples | cooking, gardening, podcasts, preserving food | none |
| Ruth / photosynthesis | 12 | 20 | 5 x 2 | 2 | 1.43 | partial | step-by-step, worked-examples | cooking, gardening, podcasts, preserving food | none |

## Systemic patterns

- Weakest dimensions for the spec arm: Scaffolding and hint size 4.2 (generic 2.2); Retrieval checks 6.0 (generic 3.5); Worked example to practice 6.0 (generic 4.7); Lesson and chunk length 6.2 (generic 3.7); Sentence length 6.2 (generic 3.6).
- Smallest gain over generic: Key-fact coverage -0.7; Accuracy +0.0; Worked example to practice +1.3; Avoided domains +1.8.
- Learners the spec fitted least well: Sam 5.3, Noah 5.7, Zoe 6.0.
- Spec problems still open after the one revision: coverage x10, avoid_domain x1, interest_unused x1.
- Key facts the judge found missing: spec/causes of World War I: 3. Imperialism and rivalry between empires for colonies and power (x2); spec/causes of World War I: 4. Nationalism, especially in the Balkans and in Serbia (x2); generic/Spanish greetings: Mucho gusto means nice to meet you (x2); spec/causes of World War I: Imperialism and rivalry between empires for colonies and power (x2); spec/causes of World War I: Nationalism, especially in the Balkans and Serbia (x2); generic/two-step equations: Example form: 2x + 3 = 11 gives x = 4 (x2); legacy/causes of World War I: Imperialism and rivalry between empires for colonies and power (x2); legacy/photosynthesis: Fact 3 is incomplete: mentions chlorophyll in leaves, but chloroplasts are omitted..

## Cost

- App-path generations: 84 calls, $0.0000 by the pool's own accounting (free NVIDIA lineup; paid slots switched off).
- Judges: 88 calls (google/gemini-3.8-flash x88); Standard Compute spend this run $1.3139 through the ledger with ceilingUsd 26.
- Standard Compute ledger: before spent $8.00882 (2110 calls, headroom $21.99118); after spent $9.322707 (2282 calls, headroom $20.677293).
