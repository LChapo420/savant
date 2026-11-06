# ZeroGPU: evaluation (5 Nov 2026)

AI-judged on model-planted errors, small samples, a few runs within one hour (00:36 to about 01:10 UTC, 6 Nov; 5 Nov evening in Omaha). Not real-learner proof. Provider: services/providers/zerogpu.js (via services/providers/openai-credit.js), ledger services/zerogpu-ledger.js ($245 hard cap of the owner's $250 credit, data/zerogpu-ledger.json). Raw rows: docs/zerogpu-eval-run1.json, run2, run3 (scripts/fact-verifier-eval.js, set docs/fact-verifier-set.json: 36 planted + 24 clean fact cases, 24 planted + 24 true answer keys).

## Prices (USD per Mtok in / out, zerogpu.ai/models read 5 Nov)
deepseek-v4.1-flash 0.30/1.20, glm-5.3-flash 0.10/0.35, gpt-oss-120b 0.15/0.60, qwen3-30b-a3b 0.10/0.45, llama-3.1-8b 0.15/0.28, gpt-5.6-luna 0.20/1.20, gpt-6-luna 0.10/0.50. For comparison: Gonka GLM and DeepSeek 0.10/0.10, Munito GLM 0.13/0.45 (0.099/0.25 in the pool config), Coral DeepSeek 0.19/0.60. ZeroGPU is not the cheapest for any flash model; it is pooled for the one task where it cleared the bar.

## Access
`/models` lists deepseek-v4.1-flash, glm-5.3-flash, gpt-oss-120b, qwen3-30b-a3b, llama-3.1-8b-instruct, deberta-v3-small and four zlm classifiers. **gpt-5.6-luna and gpt-6-luna are not listed but both answer under those bare names** (an "openai/" prefix gives 404). gpt-6-luna rejects `temperature: 0` with HTTP 400 ("only the default (1) value is supported"): services/providers/openai-credit.js now retries without temperature and remembers it per model (the first run lost all 60 gpt-6-luna cases to this, no cost).

## Fact gate (fact_verify): planted caught / 36, false alarms / 24, answered / 60
| model | caught | false alarms | answered | p50 / p95 (fact, s) | keys: planted caught, true kept (of 24 / 24) | cost of a full run |
|---|---|---|---|---|---|---|
| GLM-5.3 Flash, run 1 (00:36) | 22 | 1 | 55 | 15.0 / 149 | 24, 24 | about $0.05 |
| GLM-5.3 Flash, run 2 (00:50) | 27 | 2 | 57 | 11.7 / 95 | 24, 24 | about $0.05 |
| GLM-5.3 Flash, run 3 (00:59) | 28 | 0 | 57 | 16.5 / 96 | 24, 24 | about $0.05 |
| gpt-oss-120b (run 1) | 21 | 9 | 60 | 13.9 / 29 | 24, 24 | about $0.07 |
| Qwen3-30B-A3B (run 1) | 6 | 15 | 53 | 5.9 / 65 | 24, 22 | about $0.02 |
| gpt-6-luna (run 2; run 1 invalid, see above) | 29 | 19 | 60 | 22.6 / 44 | 24, 24 | about $0.08 |
| gpt-5.6-luna (run 2) | 28 | 18 | 60 | 16.5 / 30 | 24, 24 | about $0.15 |

Baseline today: grok-4.3 22/36, 5/24, p50 24 s (down 31 minutes on 5 Nov). Bar set for adding a ZeroGPU model: at least 22/36 caught and at most 5/24 false alarms.
- **GLM-5.3 Flash clears the bar in all three runs** (22, 27, 28 of 36; 1, 2, 0 false alarms) and is a different family from the DeepSeek writer. Its weak point is the tail: 3 to 5 of 60 calls failed each run (HTTP 502 "Upstream inference request failed", no 429s) and p95 is 95 to 149 s. The waiting lane's deadline moves past a slow answer to the next slot.
- The Luna models catch the most (28 to 29) but flag 18 to 19 of 24 clean cases: unusable as a gate, not added. gpt-oss-120b: 21 caught, 9 false alarms, just under and over the bar: not added. Qwen3-30B: not added.
- Blind answer-key check: every model that answered caught 24 of 24 planted keys; GLM kept 24 of 24 true keys in all three runs (blind key check, p50 1.1 to 1.9 s).
- Availability: 0 HTTP 429 in 1,037 calls. Failures were 502s (GLM) and unusable JSON (Qwen). Runs were within one hour, so this says nothing about other hours.

## Routing
One slot, `zerogpu:z-ai/glm-5.3-flash`, allowed on `fact_verify` only (config/model-lineup.json). Paid slots sort by output price, so it sits ahead of grok-4.3 (0.35 vs 1.25) and Lyceum MiniMax and ahead of every free slot; when it fails or is slow the call falls through to grok-4.3. The writer-family exclusion in services/block-levels.js is unchanged (a GLM-written level skips it). Learner data until ZEROGPU_LEARNER_UNTIL (default 2026-11-14) under the consent rule; pipeline otherwise. Other models (gpt-oss, Qwen3, Luna, Llama) have no slot.

## Money
Spent $0.483 of the $250 (ledger settled total) across 1,037 ledger calls (including the failed gpt-6-luna calls that cost $0), under the $0.60 run cap. Cost tracker prices by model name only, and `z-ai/glm-5.3-flash` and `deepseek/deepseek-v4.1-flash` also exist in the Lyceum and Munito ledgers, so ZeroGPU GLM spend in the cost tracker uses whichever price it finds first (the per-provider ledger is exact).

## Not measured
Quality on lessons or grading (only fact check and answer keys), throughput under load, other hours of the day, the zlm classifiers and deberta (not text-generation models), llama models, DeepSeek V4.1 Flash on ZeroGPU (Coral and Munito are cheaper).
