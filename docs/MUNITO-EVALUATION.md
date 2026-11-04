# Evaluation of Munito (api.munito.ai) by Savant

Written 4 November 2026 for Munito, in return for the $100 of free credit the owner received on 3 November 2026. It is meant to be fair and
re-runnable. Everything labelled "AI-judged" or "simulated" is model output graded by a script or another model; none of it is a real-learner result.

## 1. Summary

**Who we are.** Savant is a small adaptive-learning app (Node/Express). A solo founder builds it. Its content is generated and checked by a pipeline
of language models, so we call many models, often thousands of short calls a day.

**What we used Munito for.** Mostly build-pipeline work (content writing and AI judging). From the night of 3 November the app may also send a
learner's lesson writing to Munito when the free models are busy (accounts cleared for outside AI only); so far only test accounts have done so, no real learners. The workload so far (live ledger, all agents, 3 to 4 November 2026): about 4,300 calls and $3.6 of the $100.
Most calls (about 3,800) were an AI judge that checks whether generated lessons and notes follow the learner's scorecard ("material-judge"), the rest layout,
fill, regeneration and session analysis tasks. Table 4 in the appendix has the per-model and per-task counts.

**Verdict per model** (our workload, our tasks; one benchmark run on 4 November, see section 3 for the caveats):

| Model | Verdict |
|---|---|
| deepseek-v4.1-flash-1017 | Best judge we measured (90% planted-swap catch, 97% of decisive verdicts correct). Could not be re-benchmarked: the daily free limit was reached (HTTP 429, resets 5 Nov 00:00 UTC). |
| glm-5.3-flash | Same judge quality as v4.1 (91% / 97%). Also at its daily free limit during the benchmark. |
| deepseek-v4-flash | Cheapest capable model: 35 of 36 answers right when it answered (two runs), 10/10 valid JSON, fast (about 1 s). But frequent 429 "Too Many Requests" (29 to 38% of calls) even one request at a time. |
| qwen3.8-27b | Most accurate on the 40-question set (39/39 answered correct), valid JSON, but slower (5 s on 3k tokens), the most expensive per task, and it did not finish a long judging run. |
| kolibri-1 | Accurate when it answers (38/39), valid JSON, but returns "no text" on 20% of calls and on 4 of 5 long prompts. |
| cygnet | Very fast and very cheap, usable for letter answers (31/34), but 0/10 valid JSON (never stops generating the object) and invalid JSON on long structured prompts. |
| gemma-4-12b | Answers every question (34/40, 85%), but 0/10 valid structured JSON; the most expensive input price of the list ($1.00 per million input tokens). |
| pplx-decider-v1.2 | Not a chat model: HTTP 400 on chat completions. Not benchmarked. |

**In one line.** Munito's models are cheap and fast, and the OpenAI-compatible interface worked from day one. The things that most limited us were the per-model daily free limits and
429 rate limiting, not model quality.

## 2. What we measured and how (reproducible)

Run `node scripts/munito-eval.js` (add `--free-baseline` for the NVIDIA free tier comparison), then `node scripts/munito-eval-report.js` for the tables.
Raw results are committed in `curriculum-build/munito-eval/` (`munito-eval.json`, `munito-eval-v4flash-conc1.json`, `baseline.json`). The script goes
through our provider code and its spend ledger (hard cap $100), and stops itself above $3 of its own spend.

- **Latency.** Short prompt ("Why is the sky blue?", answer in one sentence), n=10; a prompt of about 3,400 tokens (about 12,500 characters of quiz questions
  plus a one-sentence task), n=5. Wall time per call including the network from the USA; p50 and p95. Output tokens per second is
  output tokens divided by wall time on the 3k prompt, so it includes prompt processing; it is not a pure decoding speed.
  With n=5 and n=10 the p95 is close to the maximum, so treat it as rough.
- **Reliability.** Over all 65 calls per model: HTTP errors, timeouts (120 s), empty replies ("no text"), 429s. We did not retry, so the rate is the raw first-attempt rate.
- **Structured output.** 10 calls with `response_format: json_object` and a small schema (`answer` number, `reason` string) asking for a multiplication.
  Valid means the reply parsed and matched the schema; we also record whether the number was right (it was whenever the JSON was valid).
- **Task quality.** 40 multiple-choice questions with known keys from Savant's own placement banks, 10 each from `content/unit-placement/`
  `spanish.json`, `english.json`, `math.json`, `reading.json`. They were drawn with a fixed seed (20261104), the choice order was shuffled, the model replied with a letter,
  and a script graded it against the key. These are our items, written and checked by our pipeline; a few may be easy or ambiguous. No learner data is involved.
  Accuracy is reported as right of answered, because a 429 leaves a question unanswered and should not count as a wrong answer.
- **Cost.** Tokens reported by the API times Munito's list prices (copied into `services/munito-ledger.js`), cached-input discounts ignored, so an upper bound.
- **Free baseline.** The same tasks on NVIDIA's free tier GLM 5.3 Flash and DeepSeek V4.1 Flash, for context only (section 3.4).

## 3. Results

The tables are in the appendix (generated by `scripts/munito-eval-report.js`); the findings:

### 3.1 Rate limits dominated the run
- `deepseek-v4.1-flash-1017` and `glm-5.3-flash` answered every one of 65 calls with 429: "The daily free limit of ... is reached. It resets at 2026-11-05 00:00 UTC."
  Our own judging runs earlier on 3 to 4 November probably used that allowance (we did not check), so we have no fresh latency or accuracy numbers for the two models we use most. Their quality numbers in section 4 come from the earlier, larger judging runs.
  The free-limit message is clear and says when it resets, which helped. We did not find where the daily amount is documented.
- `deepseek-v4-flash` returned plain "Too Many Requests" on 38% of calls with 4 requests in flight and still on 29% with one at a time. Other
  jobs of ours were using the same key at the same time, so the limit may be per key and not per request pattern; we cannot tell from the outside.
  When it answered, it was right 14 of 15 times in the first run and 21 of 21 in the second.

### 3.2 Quality and reliability of the models that answered
- Of the models that answered, `qwen3.8-27b` was the most accurate (39/39), `kolibri-1` close (38/39), `cygnet` 31/34, `gemma-4-12b` 34/40. The two weaker models are weaker mainly on math items
  (cygnet 4 of 10 on math; gemma 7 of 10); we did not investigate whether that is the model or our prompt (a bare letter, no reasoning).
- Empty replies: `kolibri-1` 13 of 65, `qwen3.8-27b` 2 of 65, mostly on long prompts or when thinking uses the token budget. `cygnet` and `gemma-4-12b` lost 10 of 65 calls each, all on the structured calls.
- Structured JSON: valid 10/10 for `deepseek-v4-flash`, `qwen3.8-27b`, `kolibri-1`; 0/10 for `cygnet` (cut off by the output cap, the object never closes) and `gemma-4-12b` (unusable object).
  We only tested `json_object` mode with the schema in the prompt; if these models support stricter schema modes we did not use them.

### 3.3 Latency and cost
See Table 1. Short-prompt p50 ranged from about 0.3 s (`cygnet`) to 2.5 s (`kolibri-1`). On the 3k-token prompt `deepseek-v4-flash` took about 1.1 to 1.6 s at 99 to 130 output tokens per second;
`qwen3.8-27b` 5 s. Cost per 1,000 multiple-choice tasks went from $0.007 (`cygnet`) to $0.37 (`qwen3.8-27b`, whose hidden reasoning tokens are billed as output).
At these prices the cost of everything we ran (4,300 calls) was $3.6; for our workload price is not the constraint, limits and reliability are.

### 3.4 Free baseline (NVIDIA free tier)
On 4 November 2026 (08:30 to 09:10 UTC) NVIDIA's free GLM 5.3 Flash timed out (120 s) on all 65 calls, and its free DeepSeek V4.1 Flash on 61 of 65 (the 4 that answered took about 92 s at the median). So this baseline gives no usable comparison for latency or accuracy that day; it only shows that the free tier was congested at that hour. We did not retry at another hour. Spend: $0 (free tier).

## 4. Real-workload numbers already measured (AI-judged, simulated learners)

From `docs/MATERIAL-DEPTH.md` section 10 (branch `depth-90b`): the judge calibration. A judge reads a lesson or note and decides whether it respects a learner trait; we plant a
swapped (wrong-trait) version and see whether the judge catches it. AI-judged, with simulated learners and texts written by another model, so not a real-learner result.

| Model (through Munito) | Planted swaps caught | Decisive verdicts correct |
|---|---|---|
| deepseek-v4.1-flash-1017 | 65/72 (90%) | 65/67 (97%) |
| glm-5.3-flash | 62/68 (91%) | 62/64 (97%) |
| deepseek-v4-flash | 73/80 (91%) | 73/78 (94%) |

Not usable as judges for long prompts: `kolibri-1` ("no text" on long prompts), `cygnet` (invalid JSON on long structured prompts), `qwen3.8-27b` (did not finish a long run).
`glm-5.3-flash` reached its daily free limit on 3 November. The benchmark above is consistent with these findings on short tasks, and the long-prompt failures reproduce for kolibri-1 (empty on 4 of 5)
and cygnet (structured output).

## 5. Developer experience
- **OpenAI-compatible chat completions** worked with our existing client; `Authorization: Bearer` and `/inference/v1/chat/completions`. Usage (prompt and completion tokens) is reported, which made exact cost accounting easy.
- **Base URL handling.** Our client accepts the host alone, the `/inference/v1` base, or the full `/chat/completions` URL because people paste any of them; the docs we had did not make clear which one is canonical.
- **`perplexity-ai/pplx-decider-v1.2`** is listed with the chat models but answers HTTP 400 on chat completions. It would help to mark non-chat models in the model list.
- **Document AI / OCR** (`lightonai/lightonocr-3-4b`, `munito/ocr-auto`, `munito/ocr-fast`): we found prices but no documented endpoint, so we could not try it.
- **Privacy / data policy.** The privacy page returned 404 on 3 November 2026. Our rule is to send no learner words until a retention and training policy is confirmed in writing, so Munito stayed pipeline-only. A reachable policy would let us use it more.
- **Errors.** The daily-limit 429 message names the model and the reset time, which is good. A plain "Too Many Requests" gives no hint whether it is a per-model, per-key or per-second limit and no Retry-After value that we used.

## 6. What would make it better for a user like us
1. Document the per-model daily free limits and the per-minute limits, and put the remaining quota in a response header.
2. Say whether rate limits are per key, per model or per IP; add a `Retry-After` header on 429.
3. Mark non-chat models (pplx-decider) in the model list, and document the OCR endpoint.
4. Publish the data-retention and training policy at a stable URL.
5. For `cygnet` and `gemma-4-12b`, document how to get strict JSON, or say it is unsupported.
6. For reasoning models (`qwen3.8-27b`, `kolibri-1`), report reasoning tokens separately and document a way to cap or switch off thinking, so "no text" replies stop happening when the budget runs out.

## 7. Limits of this evaluation
- One run, one day, from one location; models that were rate limited have no fresh numbers.
- 40 questions is a small sample (a model at 38/40 and one at 40/40 are not distinguishable); the items are our own and not an external benchmark.
- The benchmark shared the API key with other running jobs, which probably increased 429s; the latency figures were measured under that load.
- Prompts were short and simple; long-context and multi-turn quality are only covered by the section 4 judging numbers.
- Everything is AI output graded by a script or a model; we have not tested any of it with real learners.

## Appendix: tables (generated)


Benchmark run 2026-11-04T08:29:43.209Z. AI-model answers graded against Savant bank keys; not real-learner results. Own counted spend $0.0624; ledger moved $0.1044 over the run (includes any other process using the same ledger).

Item sources: spanish (content/unit-placement/spanish.json, 10 of 3388); english (content/unit-placement/english.json, 10 of 1620); math (content/unit-placement/math.json, 10 of 4763); reading (content/unit-placement/reading.json, 10 of 1307); seed 20261104.

### Munito models

| Model | Short p50 / p95 (s) | 3k-token p50 / p95 (s) | Out tok/s (3k) | Error rate (429s) | Timeouts | Empty | JSON valid /10 | MCQ right / answered (of 40) | Cost per 1,000 MCQ tasks |
|---|---|---|---|---|---|---|---|---|---|
| deepseek-v4.1-flash-1017 (rate limited (429) on most calls) | n/a / n/a | n/a / n/a | n/a | 100% (65/65) | 0 | 0 | 0 | 0 / 0 | $0.000 |
| deepseek-v4-flash | 1.1 / 1.6 | 1.6 / 2.0 | 99.0 | 39% (25/65) | 0 | 0 | 10 | 14 / 15 (93% of answered) | $0.047 |
| glm-5.3-flash (rate limited (429) on most calls) | n/a / n/a | n/a / n/a | n/a | 100% (65/65) | 0 | 0 | 0 | 0 / 0 | $0.000 |
| qwen3.8-27b | 1.2 / 1.7 | 5.0 / 5.0 | 65.9 | 3% (0/65) | 0 | 2 | 10 | 39 / 39 (100% of answered) | $0.369 |
| kolibri-1 | 2.5 / 3.5 | 3.3 / 3.3 | 109.2 | 20% (0/65) | 0 | 13 | 10 | 38 / 39 (97% of answered) | $0.218 |
| cygnet | 0.3 / 0.9 | 0.6 / 0.6 | 2.0 | 15% (0/65) | 0 | 10 | 0 | 31 / 34 (91% of answered) | $0.007 |
| gemma-4-12b | 0.7 / 1.2 | 1.3 / 1.4 | 32.0 | 15% (0/65) | 0 | 10 | 0 | 34 / 40 (85% of answered) | $0.139 |

MCQ accuracy by bank (right of 10):

| Model | spanish | english | math | reading | answered | avg output tokens |
|---|---|---|---|---|---|---|
| deepseek-v4.1-flash-1017 | 0 | 0 | 0 | 0 | 0 | n/a |
| deepseek-v4-flash | 10 | 4 | 0 | 0 | 15 | 118 |
| glm-5.3-flash | 0 | 0 | 0 | 0 | 0 | n/a |
| qwen3.8-27b | 10 | 10 | 10 | 9 | 39 | 142 |
| kolibri-1 | 10 | 9 | 10 | 9 | 39 | 386 |
| cygnet | 10 | 9 | 4 | 8 | 34 | 1 |
| gemma-4-12b | 10 | 9 | 7 | 8 | 40 | 49 |

### deepseek-v4-flash re-run, one request at a time (--conc 1)

| Model | Short p50 / p95 (s) | 3k-token p50 / p95 (s) | Out tok/s (3k) | Error rate (429s) | Timeouts | Empty | JSON valid /10 | MCQ right / answered (of 40) | Cost per 1,000 MCQ tasks |
|---|---|---|---|---|---|---|---|---|---|
| deepseek-v4-flash | 0.7 / 1.1 | 1.1 / 1.2 | 129.8 | 29% (19/65) | 0 | 0 | 10 | 21 / 21 (100% of answered) | $0.048 |

MCQ accuracy by bank (right of 10):

| Model | spanish | english | math | reading | answered | avg output tokens |
|---|---|---|---|---|---|---|
| deepseek-v4-flash | 10 | 10 | 1 | 0 | 21 | 119 |

### Free baseline (NVIDIA free tier, same tasks; context only)

| Model | Short p50 / p95 (s) | 3k-token p50 / p95 (s) | Out tok/s (3k) | Error rate (429s) | Timeouts | Empty | JSON valid /10 | MCQ right / answered (of 40) | Cost per 1,000 MCQ tasks |
|---|---|---|---|---|---|---|---|---|---|
| glm-5.3-flash | n/a / n/a | n/a / n/a | n/a | 100% (0/65) | 65 | 0 | 0 | 0 / 0 | $0.000 |
| deepseek-v4.1-flash | 91.9 / 102.2 | n/a / n/a | n/a | 94% (0/65) | 61 | 0 | 0 | 0 / 0 | $0.000 |

MCQ accuracy by bank (right of 10):

| Model | spanish | english | math | reading | answered | avg output tokens |
|---|---|---|---|---|---|---|
| glm-5.3-flash | 0 | 0 | 0 | 0 | 0 | n/a |
| deepseek-v4.1-flash | 0 | 0 | 0 | 0 | 0 | n/a |

### Live Munito ledger (all uses of the key, not only the benchmark)

Spent $3.60 of $100; 4409 calls, 2697 failed, 0 refused by the local cap.

| Model | Calls | Billed USD |
|---|---|---|
| deepseek-ai/deepseek-v4.1-flash-1017 | 915 | 1.409 |
| zai-org/glm-5.3-flash | 2186 | 0.695 |
| deepseek-ai/deepseek-v4-flash | 257 | 0.206 |
| qwen/qwen3.8-27b | 407 | 0.947 |
| aleph-alpha/kolibri-1 | 332 | 0.265 |
| blockbrain/cygnet | 244 | 0.020 |
| google/gemma-4-12b | 67 | 0.024 |
| perplexity-ai/pplx-decider-v1.2 | 1 | 0.000 |

| Task | Calls | Billed USD |
|---|---|---|
| munito_probe | 15 | 0.001 |
| material-judge | 3782 | 3.397 |
| other | 2 | 0.000 |
| block_layout | 25 | 0.082 |
| block_fill | 21 | 0.000 |
| regen_items | 3 | 0.004 |
| personalize_read | 2 | 0.001 |
| analyze_session | 3 | 0.002 |
| level_editor | 14 | 0.000 |
| material_verify | 2 | 0.000 |
| munito_eval | 540 | 0.077 |

Outcomes in the retained log (last 1000 calls): not_billed 602, unknown 4, ok 389, stale reservation counted as spent 5.

| Model | not_billed | unknown | ok | stale reservation counted as spent |
|---|---|---|---|---|
| zai-org/glm-5.3-flash | 228 | 0 | 0 | 1 |
| deepseek-ai/deepseek-v4.1-flash-1017 | 330 | 0 | 0 | 0 |
| deepseek-ai/deepseek-v4-flash | 44 | 4 | 109 | 4 |
| blockbrain/cygnet | 0 | 0 | 85 | 0 |
| google/gemma-4-12b | 0 | 0 | 65 | 0 |
| qwen/qwen3.8-27b | 0 | 0 | 65 | 0 |
| aleph-alpha/kolibri-1 | 0 | 0 | 65 | 0 |

"not_billed" means the API answered with an error (not billed); "unknown" means a timeout or network failure, counted at the reserved worst case.

