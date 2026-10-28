# Model lineup eval

Run: 2026-10-23T01:39:31.990Z. Produced by `node scripts/model-lineup-eval.js`; every answer is cached in `cache.json`, so `--report` recomputes this file without calls.

Accuracy is on the sampled cases; a failed call (timeout, rate limit after retries, unusable output) counts as wrong. Latency is the median wall time of successful calls, including queueing under the free tier's rate limit, so it is comparable between models in this run, not an absolute figure.

Ranking: models that failed more than 15% of their calls come after the rest (availability on the free tier is part of the result), then the task's accuracy measure, then latency. `accuracy_when_answered` shows quality apart from availability. `--write` does not hand a task to a model whose quality is under 0.75.

## grading (48 cases) -> grade_free_response

| Model | failed_calls | accuracy | accuracy_when_answered | median_ms | false_accepts | false_rejects | wrong_answers | acceptable |
|---|---|---|---|---|---|---|---|---|
| glm-5.3@max **(winner)** | 0 | 0.938 | 0.938 | 71336 | 0 | 3 | 34 | 14 |
| ultra@medium | 0 | 0.917 | 0.917 | 12481 | 0 | 4 | 34 | 14 |
| glm-flash@high | 0 | 0.917 | 0.917 | 61013 | 0 | 4 | 34 | 14 |
| lightning@off | 1 | 0.917 | 0.936 | 2206 | 1 | 2 | 34 | 14 |
| ds-flash@high | 7 | 0.771 | 0.902 | 82563 | 0 | 4 | 34 | 14 |
| ds-flash@max | 8 | 0.771 | 0.925 | 76860 | 0 | 3 | 34 | 14 |

Jev (with glm-5.3@max deciding its undecided cases): accuracy 0.917 on 48 of 48 cases (48 from the pilot's cache, 0 new calls). A free model is equal or better: Jev stays off.

## blind (48 cases) -> blind_mc

| Model | failed_calls | accuracy | accuracy_when_answered | median_ms | by_group | false_flags |
|---|---|---|---|---|---|---|
| ultra@medium **(winner)** | 0 | 1 | 1 | 10506 | {"reading":"12/12","english":"12/12","spanish":"12/12","math":"12/12"} | 0 |
| glm-5.3@max | 0 | 1 | 1 | 51057 | {"reading":"12/12","english":"12/12","spanish":"12/12","math":"12/12"} | 0 |
| glm-flash@high | 0 | 0.979 | 0.979 | 43091 | {"reading":"12/12","english":"12/12","spanish":"12/12","math":"11/12"} | 1 |
| ds-flash@high | 6 | 0.875 | 1 | 94496 | {"reading":"12/12","english":"9/12","spanish":"11/12","math":"10/12"} | 6 |
| lightning@off | 2 | 0.833 | 0.87 | 2528 | {"reading":"11/12","english":"10/12","spanish":"9/12","math":"10/12"} | 8 |
| ds-flash@max | 8 | 0.813 | 0.975 | 89675 | {"reading":"8/12","english":"9/12","spanish":"11/12","math":"11/12"} | 9 |

Jev (with ultra@medium deciding its undecided cases): accuracy 1 on 48 of 48 cases (48 from the pilot's cache, 0 new calls). A free model is equal or better: Jev stays off.

## keys (40 cases) -> placement_key_judge

| Model | failed_calls | accuracy | accuracy_when_answered | median_ms | bad_keys_caught | false_flags | balanced_accuracy |
|---|---|---|---|---|---|---|---|
| ultra@medium **(winner)** | 0 | 1 | 1 | 7614 | 20/20 | 0/20 | 1 |
| glm-flash@high | 0 | 1 | 1 | 70548 | 20/20 | 0/20 | 1 |
| lightning@off | 0 | 0.975 | 0.975 | 2385 | 19/20 | 0/20 | 0.975 |
| glm-5.3@max | 1 | 0.975 | 1 | 81045 | 19/20 | 0/20 | 0.975 |
| ds-flash@max | 22 | 0.45 | 1 | 87451 | 0/20 | 0/20 | 0.5 |
| ds-flash@high | 22 | 0.45 | 1 | 88904 | 0/20 | 0/20 | 0.5 |

## units (30 cases) -> placement_unit_judge

| Model | failed_calls | accuracy | accuracy_when_answered | median_ms | within_1 | mae | writer_baseline_exact |
|---|---|---|---|---|---|---|---|
| ultra@medium **(winner)** | 0 | 0.9 | 0.9 | 20501 | 0.967 | 0.22 | 0.933 |
| glm-flash@high | 0 | 0.9 | 0.9 | 51887 | 0.967 | 0.22 | 0.933 |
| ds-flash@max | 3 | 0.833 | 0.926 | 78312 | 0.867 | 0.2 | 0.933 |
| ds-flash@high | 4 | 0.8 | 0.923 | 71994 | 0.867 | 0.1 | 0.933 |
| glm-5.3@max | 0 | 0.767 | 0.767 | 112902 | 0.867 | 0.58 | 0.933 |
| lightning@off | 2 | 0.4 | 0.429 | 4258 | 0.567 | 2.2 | 0.933 |

Jev (with ultra@medium deciding its undecided cases): accuracy 0.767 on 30 of 30 cases (30 from the pilot's cache, 0 new calls). A free model is equal or better: Jev stays off.

## facts (40 cases) -> fact_verify, fact_read

| Model | failed_calls | accuracy | accuracy_when_answered | median_ms | errors_caught | false_alarms | balanced_accuracy |
|---|---|---|---|---|---|---|---|
| glm-5.3@max **(winner)** | 4 | 0.55 | 0.611 | 125561 | 7/20 | 4/20 | 0.575 |
| ultra@medium | 0 | 0.55 | 0.55 | 13072 | 13/20 | 11/20 | 0.55 |
| lightning@off | 0 | 0.525 | 0.525 | 2083 | 9/20 | 8/20 | 0.525 |
| glm-flash@high | 0 | 0.525 | 0.525 | 60957 | 7/20 | 6/20 | 0.525 |
| ds-flash@high | 10 | 0.475 | 0.633 | 111584 | 8/20 | 4/20 | 0.6 |
| ds-flash@max | 11 | 0.475 | 0.655 | 125120 | 6/20 | 3/20 | 0.575 |
