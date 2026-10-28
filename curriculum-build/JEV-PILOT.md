# Jev pilot: can a decision model replace LLM calls here?

Run on 2026-10-22 with `scripts/jev-pilot.js`. The model was TypeSafe Jev 1.13 (`typesafe/jev-1.13`, which served as snapshot `typesafe/jev-1.13-20260917`), called through OpenRouter. The owner authorised up to $0.10 for this pilot. No other model and no other paid call was used. Content was read only, and nothing under `content/` or `data/` was written.

**Spend: $0.020042.** The key's usage went from $0.441235 to $0.461276. That is 540 calls and 477,186 input tokens. The cost OpenRouter reported for every call equalled the input tokens times the listed price ($0.000000042 per token), so there were no surprises. The most expensive call cost $0.00029, a unit-location call with a long outline.

## Verdict

| Task | Today | Jev result | Recommendation |
|---|---|---|---|
| 1. Typed-answer grading (yes/no) | `services/grading.js` rules. A model fallback (`ai.gradeFreeResponse`) runs only for `short_answer` answers the rules reject. | **0 false accepts out of 98** wrong answers, all near-misses. On the answers the rules reject, it rescued 32 of 40 acceptable ones at p ≥ 0.7. | **Adopt with a threshold, as the first fallback after the rules.** Rules first. Accept if p ≥ 0.7, reject if p ≤ 0.3. Anything in between goes to today's LLM fallback. Keep the LLM wherever learner feedback text is wanted. |
| 2. Placement-unit location (choice) | MiMo and blind Claude judges, then their mean | 85% exact and 89% within 1 unit of the mean. The writer's own unit, which costs nothing, scores 97% and 99%. Jev sided with the writer in **all 5** questions where the judges had moved it. | **Don't adopt.** It matches a question's topic to a unit title. It doesn't judge difficulty, so it adds no signal over the writer's label. |
| 3. Blind multiple-choice answering (cascade step 3) | The cheap model in `services/fact-cascade.js` (MiMo V2.6 Flash on the token plan, or Haiku 5.5 as the fallback) | English 100% and Reading 100% (50 items each). Spanish 90%, or 100% at confidence ≥ 0.8 (covering 42 of 50). Math 96% on 50 items, but **both** arithmetic checks were wrong at confidence 0.81 and 0.87. | **Adopt with a confidence threshold for English, Reading and Spanish.** A disagreement at confidence ≥ 0.8 is a flag. Below that, ask today's cheap model. **Don't use it for math**, or for any item that needs a calculation. |

The practical caveat comes before any of this. Jev bills the owner's OpenRouter account, and paid OpenRouter use is currently forbidden apart from this pilot (see the no-OpenRouter-spend rule). At this pilot's rates, about $0.00002 per graded answer or MC item, the whole run cost 2 cents. Adopting it still needs the owner's go-ahead and a funded balance. Today's cheap model runs on the prepaid MiMo plan, so on the blind test Jev gains latency and calibrated probabilities, not money.

## How Jev is called

From OpenRouter's docs (the TypeSafe SDK guide and the Jev tutorial) and docs.typesafe.ai (the System One API, Noul, Choice and Confidence pages):

- `POST https://openrouter.ai/api/alpha/decisions` (the Decisions API) with an OpenRouter Bearer key. `POST /api/v1/systemone` is the same thing, kept for the TypeSafe SDKs.
- Body: `{ model: "typesafe/jev-1.13", state: <string | object>, questions: { <id>: question } }`. Questions in one call are evaluated in parallel, each on its own, against the same state.
  - **noul** (yes/no): `{ type: "noul", instructions, criteria?: { true, false } }`. Returns `{ type: "noul", noul: p }`, where p is the probability of yes. There is no separate confidence; |2p − 1| is the equivalent.
  - **choice**: `{ type: "choice", instructions, criteria: { optionName: description, ... } }`, with 1 to 255 options. Returns `{ choice, confidence, probabilities: { optionName: p } }`. Confidence is (p_max − 1/n)/(1 − 1/n).
  - **score**: `criteria` is an ordered array of 1 to 10 level descriptions. Returns `{ score (probability-weighted), confidence, probabilities, legend }`.
- The response also carries `usage: { input_tokens, output_tokens, cost }`. Output tokens are free, so `cost` = input tokens × $0.000000042.
- The model's own page on openrouter.ai returned 404. The model and its price were confirmed from `GET /api/v1/models?output_modalities=all` and from the model's endpoints listing. Note that Jev 1.14 now exists, and `~typesafe/jev-latest` points to it.

## Budget guard (in the script)

- Before each task it reads `GET /api/v1/key` (`data.usage`). The first reading is kept as the pilot's start in `curriculum-build/jev-pilot/ledger.json`.
- Each call is counted at the largest of: the reported cost, the reported input tokens × the listed price, and (when a response has no usage) 1.5 × characters / 4 tokens × the listed price.
- A call is sent only if counted spend + calls in flight + this call's estimate stays under $0.08. A task also refuses to start if the key itself has moved $0.08.
- Any call reported at more than 3× the listed price, or above $0.0005, stops everything. An HTTP 401, 402 or 403 also stops everything.
- Answers are cached per case, so a re-run never pays twice.
- The first 5 calls (`probe`) confirmed the format and the cost per call before anything scaled up.

| Task | Calls | Input tokens | Cost |
|---|---|---|---|
| Probe | 5 | 3,748 | $0.000157 |
| 1. Grading | 186 | 92,540 | $0.003887 |
| 2. Units | 149 | 296,457 | $0.012451 |
| 3. Blind | 200 | 84,441 | $0.003547 |
| **Total** | **540** | **477,186** | **$0.020042** (key delta $0.020042) |

Per call, that is about $0.000021 for grading (~500 tokens, mostly the criteria), about $0.00008 for a unit location (~2,000 tokens of outline), and about $0.000018 for an MC item.

## Task 1: Typed-answer grading

**Cases.** There are 188, built from `content/bank.js` `generate()`: 90 acceptable answers and 98 wrong ones. The learner's answer and the truth label were set by construction:

- **Acceptable**
  - **Held-out alternates (40).** An accepted alternate is removed from the list the grader gets, then typed as the answer. Examples: "Las llaves están en el carro" when the key says coche; "leía cada noche"; "didn't" for "did not"; "son las cinco y quince". The rules reject these by construction, so these are the cases a model fallback exists for.
  - **Form variants (30).** No accents, capitals, stray spaces, "7 / 6", "x = 7".
  - **Keys typed (20).** The key of a fill-in-the-blank MC item, typed.
- **Wrong**
  - **Grammatical near-misses (42).**
    - Spanish: ser for location, wrong person, an indicative after *querer que*, article gender.
    - English: "did not packed", agreement left broken, the sentence copied back unfixed, the verb left in the wrong tense.
  - **Audited MC distractors typed (18).** These are near-misses by design: the wrong person, gender or tense, effect and affect.
  - **Siblings (15).** The answer to a sibling question of the same template.
  - **Math (23).** Off by one, sign flipped, numerator or denominator off by one.

Jev saw `{question, reference_answer, other_accepted_answers, learner_answer}`. These mirror what `ai.gradeFreeResponse` sends. The noul question was "is learner_answer acceptable…?", with true/false criteria that forgive form (accents, capitals, an optional pronoun, a contraction) and not substance.

| Grader | n | Accuracy | False accepts | False rejects | Confusion |
|---|---|---|---|---|---|
| Rules only (services/grading.js) | 188 | 78.7% | 0/98 = 0.0% | 40/90 = 44.4% | TP 50 FP 0 TN 98 FN 40 |
| Jev alone, accept if p >= 0.5 | 188 | 95.7% | 0/98 = 0.0% | 8/90 = 8.9% | TP 82 FP 0 TN 98 FN 8 |
| Jev alone, accept if p >= 0.7 | 188 | 95.2% | 0/98 = 0.0% | 9/90 = 10.0% | TP 81 FP 0 TN 98 FN 9 |
| Jev alone, accept if p >= 0.9 | 188 | 86.7% | 0/98 = 0.0% | 25/90 = 27.8% | TP 65 FP 0 TN 98 FN 25 |
| Rules, then Jev on rule rejects (p >= 0.5) | 188 | 96.3% | 0/98 = 0.0% | 7/90 = 7.8% | TP 83 FP 0 TN 98 FN 7 |
| Rules, then Jev on rule rejects (p >= 0.7) | 188 | 95.7% | 0/98 = 0.0% | 8/90 = 8.9% | TP 82 FP 0 TN 98 FN 8 |
| Rules, then Jev on rule rejects (p >= 0.9) | 188 | 88.8% | 0/98 = 0.0% | 21/90 = 23.3% | TP 69 FP 0 TN 98 FN 21 |
| Jev three-way: >=0.7 accept, <=0.3 reject (rest deferred) | 186 | 96.2% | 0/98 = 0.0% | 7/88 = 8.0% | TP 81 FP 0 TN 98 FN 7 |

The three-way band decided 186 of 188 answers and deferred 2.

**Where the app would call a model.** These are the answers the rules reject: 138 of them, 40 acceptable and 98 not.

| Threshold | Acceptable answers rescued | Wrong answers let through |
|---|---|---|
| p >= 0.5 | 33/40 | 0/98 |
| p >= 0.7 | 32/40 | 0/98 |
| p >= 0.9 | 19/40 | 0/98 |

| Group | Kind | n | Truth | Jev right at 0.5 | Jev right at 0.7 | Rules right | mean p |
|---|---|---|---|---|---|---|---|
| spanish translation | held-out alternate | 20 | accept | 19 | 19 | 0 | 0.89 |
| spanish translation | near-miss | 22 | reject | 22 | 22 | 22 | 0.05 |
| spanish translation | form variant | 5 | accept | 4 | 4 | 5 | 0.78 |
| spanish translation | sibling answer | 5 | reject | 5 | 5 | 5 | 0.01 |
| spanish type-in | form variant | 8 | accept | 8 | 8 | 8 | 0.97 |
| spanish type-in | sibling answer | 10 | reject | 10 | 10 | 10 | 0.01 |
| spanish type-in | held-out alternate | 2 | accept | 2 | 1 | 0 | 0.73 |
| spanish fill-in | key typed | 10 | accept | 10 | 10 | 10 | 0.96 |
| spanish fill-in | distractor typed | 10 | reject | 10 | 10 | 10 | 0.02 |
| english rewrite | key typed | 2 | accept | 2 | 2 | 2 | 0.99 |
| english rewrite | held-out alternate | 18 | accept | 12 | 12 | 0 | 0.64 |
| english rewrite | near-miss | 20 | reject | 20 | 20 | 20 | 0.02 |
| english fill-in | key typed | 8 | accept | 8 | 8 | 8 | 0.99 |
| english fill-in | distractor typed | 8 | reject | 8 | 8 | 8 | 0.03 |
| math | form variant | 17 | accept | 17 | 17 | 17 | 0.98 |
| math | near-miss | 23 | reject | 23 | 23 | 23 | 0.02 |

**The 8 false rejects at 0.5.**

- **"which" instead of "that" (6, p 0.12–0.17).** The prompt says "Join these into one sentence using 'that'", and the bank's accepts list allows "which". Jev holds the learner to the instruction. That is arguably right, and the accepts list arguably wrong.
- **"anoche trabaje mucho" for "trabajé" (p 0.28).** Without its accent this is a different form (the subjunctive). App policy forgives accents, and the rules already accept it, so this never reaches Jev in a rules-first setup.
- **"Quiero que venga mañana" (usted, p 0.36).** This is a real false reject. It lands in the deferred band at the three-way thresholds.

**Reading the result.**

- On these cases Jev never let a wrong answer through, at any threshold. The 95% upper bound on the false-accept rate is still about 3%, because the wrong answers are 98 constructed near-misses rather than real learner errors.
- The rules never false-accept either. Their weakness is false rejects, 44% here by construction.
- So the use is as a fallback after the rules, not a replacement for them.
- Today's LLM fallback was **not** run on the same cases, because no other model calls were allowed. Its false-accept rate is therefore unmeasured. A side-by-side on real `short_answer` rejects is the next step before switching.
- Jev returns no feedback sentence and no error tag. `gradeFreeResponse` returns both. An error tag could be a second Choice question in the same call; feedback cannot.

## Task 2: Placement-unit location

**Cases.** There are 150 unit questions, 50 each from English, Reading and Math. They come from `content/unit-placement/<track>.json`, round-robin across 74 grades, and include only questions with both judges' verdicts.

**What Jev saw.**

- **Choice options:** U0 ("before this grade starts") through Un, each described by its lesson titles plus up to 110 characters of `covers`. The units come from `unitsOf` in `scripts/placement-testers.js`.
- **State:** the question, its options and its keyed answer.
- **Instructions:** the judges' own wording.

"Exact" means within half a unit of the two-judge mean in `<track>-units-mean.json`, because the mean is often x.5.

| Comparison | n | Exact | Within 1 | Within 2 | Mean abs. error (units) | Bias |
|---|---|---|---|---|---|---|
| Jev (top choice) vs two-judge mean | 150 | 85.3% | 89.3% | 90.7% | 0.99 | -0.81 |
| Jev (probability-weighted unit) vs mean | 150 | 36.7% | 54.7% | 74.0% | 1.68 | -1.60 |
| Writer's unit (where it was written for) vs mean | 150 | 96.7% | 99.3% | 99.3% | 0.07 | +0.07 |
| MiMo vs Claude (judge-to-judge, same questions) | 150 | 94.0% | 97.3% | 99.3% | 0.13 | -0.05 |
| Jev (top choice) vs MiMo | 150 | 84.0% | 88.0% | 90.7% | 1.03 | -0.78 |
| Jev (top choice) vs Claude | 150 | 86.0% | 89.3% | 91.3% | 0.95 | -0.83 |

| Track | n | Jev exact | Jev within 1 | Jev within 2 | Jev MAE | MiMo-vs-Claude within 1 | Writer within 1 |
|---|---|---|---|---|---|---|---|
| english | 50 | 78.0% | 80.0% | 82.0% | 2.15 | 100.0% | 100.0% |
| reading | 50 | 84.0% | 92.0% | 94.0% | 0.52 | 94.0% | 100.0% |
| math | 50 | 94.0% | 96.0% | 96.0% | 0.31 | 98.0% | 98.0% |

**Confidence.** At confidence ≥ 0.5 (133 of 150 questions), 92.5% were within 1 and the MAE was 0.74.

**What Jev is doing.**

- It picked the writer's unit exactly on 130 of 150 questions. It reads the question's topic against the unit titles.
- 11 of its 16 misses by more than a unit are U0 ("everyday knowledge"). Examples: an English essay-revision question at grade "proficient" U10, and "misread" at U5.
- The judges moved 5 questions away from the writer's unit (for example, complex_analysis written for U11, which MiMo placed at U2). Jev agreed with the writer on **all 5**.
- As a flagger, its 20 disagreements with the writer didn't overlap with any of the judges' 5.
- It can't do what the judges are for, which is to notice that a question is easier or harder than its topic. The writer's label is free and beats it.

## Task 3: Blind multiple-choice answering (cascade step 3)

**Cases.** There are 200 MC items from `content/bank.js` `generate()`: 50 English, 50 Reading (with passages), 50 Spanish and 50 Math. The skills were rotated and difficulties ran from 1 to 10. Options were shuffled and labelled A to F, with the option text as each one's description. The state was `{passage?, question}`, and the key was never sent.

The keys are audited clean, so every disagreement is a false flag the cascade would pass on to Claude.

| Group | n | Accuracy (= 1 - false-flag rate) | Chance (1/options) | Accuracy at confidence >= 0.5 (coverage) | Accuracy at confidence >= 0.8 (coverage) |
|---|---|---|---|---|---|
| english | 50 | 100.0% | 25.0% | 100.0% (49/50) | 100.0% (46/50) |
| reading | 50 | 100.0% | 25.0% | 100.0% (50/50) | 100.0% (50/50) |
| spanish | 50 | 90.0% | 25.2% | 95.6% (45/50) | 100.0% (42/50) |
| math | 50 | 96.0% | 25.2% | 96.0% (50/50) | 95.8% (48/50) |
| all non-math | 150 | 96.7% | 25.1% | 98.6% (144/150) | 100.0% (138/150) |

**The misses.**

- **Spanish (5).**
  - "el espejo y la cama ___": Jev chose altas over altos, at confidence 0.71. Mixed-gender agreement is the trap.
  - Matching a subject to a form, 3 items: bebes, barrían and uniste.
  - "Which word is wrong: 'Nosotros estamos de Perú'": Jev chose the correction, somos, instead of the wrong word.
  - All but the first had confidence ≤ 0.51.
- **Math (2).** Both were "Is x = 7 a solution of 8x + 11 = 83?". Jev said Yes at confidence 0.81 and 0.87. That is a confident arithmetic error, the documented weak spot. The bank's math MC items are mostly conceptual (logs, quadratics, complex numbers) and few need arithmetic, so 96% here flatters it on math.

**Catching a wrong key.** No extra calls were made for this. Pretend each distractor were the key: Jev's existing answers would flag 591 of 598 such planted wrong keys (98.8%). Real wrong keys are subtler than a random distractor, so treat that as an upper bound.

**Comparison with today.** The cheap model's blind accuracy on the same items wasn't measured, because no other model was allowed. Its job is the same: a disagreement sends the item to Claude. Jev at confidence ≥ 0.8 would send no false flags on English, Reading or Spanish here, at about $0.00002 an item. The cascade's typed checks, which have no options, would need a noul "is this key right?" question instead. That was not tested.

## Files

- `scripts/jev-pilot.js` builds the cases, enforces the budget guard, makes the calls and produces the report. Run `node scripts/jev-pilot.js report` to recompute every table from the cached answers. It makes no calls.
- `curriculum-build/jev-pilot/` contains:
  - `ledger.json`: key readings, calls, tokens and cost by task
  - `grading.json`, `units.json`, `blind.json`: Jev's raw answers per case
  - `*-cases.json`: the exact cases and labels
