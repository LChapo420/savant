# Local models vs the free NVIDIA lineup

Run: 2026-10-23T06:45:51.798Z, on Ryzen 9 6900HS, 31 GB RAM, RTX 3050 Laptop 4 GB. Produced by `node scripts/local-model-eval.js`; local answers are cached in `cache.json` here, NVIDIA answers are read from `curriculum-build/model-lineup/cache.json` (no NVIDIA calls are made by this script).

Same cases, prompts, schemas and scoring as `scripts/model-lineup-eval.js`. Accuracy is over the cases each model answered (the NVIDIA run may still be filling its cache; `answered` says how many). The headline is balanced accuracy where the task has one (facts, keys), else accuracy. Local latency is wall time on this laptop with one request at a time; NVIDIA latency includes queueing under its 40 RPM free tier.

## grading (48 cases) -> grade_free_response

| Model | answered | failed_calls | accuracy | median_ms | tok_s | false_accepts | false_rejects | wrong_answers | acceptable |
|---|---|---|---|---|---|---|---|---|---|
| local:gemma4-e4b@off | 5 | 0 | 1 | 14759 | 4.1 | 0 | 0 | 3 | 2 |
| nvidia:glm-5.3@max | 48 | 0 | 0.938 | 71336 |  | 0 | 3 | 34 | 14 |
| nvidia:lightning@off | 48 | 1 | 0.917 | 2206 |  | 1 | 2 | 34 | 14 |
| nvidia:ultra@medium | 48 | 0 | 0.917 | 12481 |  | 0 | 4 | 34 | 14 |
| local:qwen3.5-9b@off | 12 | 0 | 0.917 | 19365 | 4.1 | 0 | 1 | 8 | 4 |
| nvidia:glm-flash@high | 48 | 0 | 0.917 | 61013 |  | 0 | 4 | 34 | 14 |
| local:nemotron-nano-4b@off | 48 | 0 | 0.896 | 1908 | 32.2 | 5 | 0 | 34 | 14 |
| local:qwen3.5-4b@off | 48 | 0 | 0.854 | 2432 | 25.7 | 0 | 7 | 34 | 14 |
| nvidia:ds-flash@max | 48 | 8 | 0.771 | 76860 |  | 0 | 3 | 34 | 14 |
| nvidia:ds-flash@high | 48 | 7 | 0.771 | 82563 |  | 0 | 4 | 34 | 14 |

## blind (48 cases) -> blind_mc

| Model | answered | failed_calls | accuracy | median_ms | tok_s | by_group | false_flags |
|---|---|---|---|---|---|---|---|
| nvidia:ultra@medium | 48 | 0 | 1 | 10506 |  | {"reading":"12/12","english":"12/12","spanish":"12/12","math":"12/12"} | 0 |
| nvidia:glm-5.3@max | 48 | 0 | 1 | 51057 |  | {"reading":"12/12","english":"12/12","spanish":"12/12","math":"12/12"} | 0 |
| nvidia:glm-flash@high | 48 | 0 | 0.979 | 43091 |  | {"reading":"12/12","english":"12/12","spanish":"12/12","math":"11/12"} | 1 |
| local:qwen3.5-9b@off | 12 | 0 | 0.917 | 8959 | 3.9 | {"reading":"3/3","english":"3/3","spanish":"2/3","math":"3/3"} | 1 |
| nvidia:ds-flash@high | 48 | 6 | 0.875 | 94496 |  | {"reading":"12/12","english":"9/12","spanish":"11/12","math":"10/12"} | 6 |
| nvidia:lightning@off | 48 | 2 | 0.833 | 2528 |  | {"reading":"11/12","english":"10/12","spanish":"9/12","math":"10/12"} | 8 |
| nvidia:ds-flash@max | 48 | 8 | 0.813 | 89675 |  | {"reading":"8/12","english":"9/12","spanish":"11/12","math":"11/12"} | 9 |
| local:qwen3.5-4b@off | 48 | 0 | 0.75 | 1563 | 25.9 | {"reading":"12/12","english":"10/12","spanish":"7/12","math":"7/12"} | 12 |
| local:nemotron-nano-4b@off | 48 | 0 | 0.438 | 2043 | 31.7 | {"reading":"10/12","english":"6/12","spanish":"1/12","math":"4/12"} | 27 |

## keys (40 cases) -> placement_key_judge

| Model | answered | failed_calls | accuracy | median_ms | tok_s | bad_keys_caught | false_flags | balanced_accuracy |
|---|---|---|---|---|---|---|---|---|
| nvidia:ultra@medium | 40 | 0 | 1 | 7614 |  | 20/20 | 0/20 | 1 |
| local:qwen3.5-4b@off | 40 | 0 | 1 | 8693 | 25.2 | 20/20 | 0/20 | 1 |
| nvidia:glm-flash@high | 40 | 0 | 1 | 70548 |  | 20/20 | 0/20 | 1 |
| nvidia:lightning@off | 40 | 0 | 0.975 | 2385 |  | 19/20 | 0/20 | 0.975 |
| nvidia:glm-5.3@max | 40 | 1 | 0.975 | 81045 |  | 19/20 | 0/20 | 0.975 |
| local:nemotron-nano-4b@off | 40 | 0 | 0.85 | 3315 | 30.5 | 17/20 | 3/20 | 0.85 |
| local:qwen3.5-9b@off | 12 | 0 | 0.833 | 25741 | 3.3 | 5/6 | 1/6 | 0.833 |
| nvidia:ds-flash@max | 40 | 22 | 0.45 | 87451 |  | 0/20 | 0/20 | 0.5 |
| nvidia:ds-flash@high | 40 | 22 | 0.45 | 88904 |  | 0/20 | 0/20 | 0.5 |

## units (30 cases) -> placement_unit_judge

| Model | answered | failed_calls | accuracy | median_ms | tok_s | within_1 | mae | writer_baseline_exact |
|---|---|---|---|---|---|---|---|---|
| local:qwen3.5-9b@off | 12 | 0 | 0.917 | 52572 | 3.5 | 0.917 | 0.33 | 0.917 |
| nvidia:ultra@medium | 30 | 0 | 0.9 | 20501 |  | 0.967 | 0.22 | 0.933 |
| nvidia:glm-flash@high | 30 | 0 | 0.9 | 51887 |  | 0.967 | 0.22 | 0.933 |
| nvidia:ds-flash@max | 30 | 3 | 0.833 | 78312 |  | 0.867 | 0.2 | 0.933 |
| local:qwen3.5-4b@off | 30 | 0 | 0.8 | 6147 | 25.1 | 0.833 | 0.88 | 0.933 |
| nvidia:ds-flash@high | 30 | 4 | 0.8 | 71994 |  | 0.867 | 0.1 | 0.933 |
| nvidia:glm-5.3@max | 30 | 0 | 0.767 | 112902 |  | 0.867 | 0.58 | 0.933 |
| local:nemotron-nano-4b@off | 30 | 0 | 0.533 | 5640 | 29.9 | 0.567 | 2.15 | 0.933 |
| nvidia:lightning@off | 30 | 2 | 0.4 | 4258 |  | 0.567 | 2.2 | 0.933 |

## facts (40 cases) -> fact_verify, fact_read

| Model | answered | failed_calls | accuracy | median_ms | tok_s | errors_caught | false_alarms | balanced_accuracy |
|---|---|---|---|---|---|---|---|---|
| nvidia:ds-flash@high | 40 | 10 | 0.475 | 111584 |  | 8/20 | 4/20 | 0.6 |
| nvidia:ds-flash@max | 40 | 11 | 0.475 | 125120 |  | 6/20 | 3/20 | 0.575 |
| nvidia:glm-5.3@max | 40 | 4 | 0.55 | 125561 |  | 7/20 | 4/20 | 0.575 |
| nvidia:ultra@medium | 40 | 0 | 0.55 | 13072 |  | 13/20 | 11/20 | 0.55 |
| nvidia:lightning@off | 40 | 0 | 0.525 | 2083 |  | 9/20 | 8/20 | 0.525 |
| nvidia:glm-flash@high | 40 | 0 | 0.525 | 60957 |  | 7/20 | 6/20 | 0.525 |
| local:qwen3.5-4b@off | 40 | 0 | 0.5 | 2944 | 23.9 | 14/20 | 14/20 | 0.5 |
| local:nemotron-nano-4b@off | 40 | 0 | 0.425 | 2421 | 30.4 | 13/20 | 16/20 | 0.425 |
| local:qwen3.5-9b@off | 12 | 0 | 0.417 | 37859 | 3.6 | 3/6 | 4/6 | 0.417 |

## facts_rag (40 cases) -> fact_verify_grounded

| Model | answered | failed_calls | accuracy | median_ms | tok_s | errors_caught | false_alarms | balanced_accuracy |
|---|---|---|---|---|---|---|---|---|
| nvidia:ds-flash@high | 40 | 10 | 0.475 | 111584 |  | 8/20 | 4/20 | 0.6 |
| nvidia:ds-flash@max | 40 | 11 | 0.475 | 125120 |  | 6/20 | 3/20 | 0.575 |
| nvidia:glm-5.3@max | 40 | 4 | 0.55 | 125561 |  | 7/20 | 4/20 | 0.575 |
| nvidia:ultra@medium | 40 | 0 | 0.55 | 13072 |  | 13/20 | 11/20 | 0.55 |
| nvidia:lightning@off | 40 | 0 | 0.525 | 2083 |  | 9/20 | 8/20 | 0.525 |
| nvidia:glm-flash@high | 40 | 0 | 0.525 | 60957 |  | 7/20 | 6/20 | 0.525 |
| local:qwen3.5-4b@off | 40 | 0 | 0.475 | 7559 | 14.2 | 19/20 | 20/20 | 0.475 |
| local:nemotron-nano-4b@off | 40 | 0 | 0.45 | 3528 | 30.5 | 13/20 | 15/20 | 0.45 |

## facts_nli (40 cases) -> fact_verify, fact_read

| Model | answered | failed_calls | accuracy | median_ms | errors_caught | false_alarms | balanced_accuracy |
|---|---|---|---|---|---|---|---|
| nvidia:ds-flash@high | 40 | 10 | 0.475 | 111584 | 8/20 | 4/20 | 0.6 |
| nvidia:ds-flash@max | 40 | 11 | 0.475 | 125120 | 6/20 | 3/20 | 0.575 |
| nvidia:glm-5.3@max | 40 | 4 | 0.55 | 125561 | 7/20 | 4/20 | 0.575 |
| nvidia:ultra@medium | 40 | 0 | 0.55 | 13072 | 13/20 | 11/20 | 0.55 |
| local:factcg+minicheck | 40 | 0 | 0.525 | 765 | 20/20 | 19/20 | 0.525 |
| nvidia:lightning@off | 40 | 0 | 0.525 | 2083 | 9/20 | 8/20 | 0.525 |
| nvidia:glm-flash@high | 40 | 0 | 0.525 | 60957 | 7/20 | 6/20 | 0.525 |
