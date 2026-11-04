# Gonka broker: evaluation notes (4 Nov 2026)

Factual notes from one probe round, not a recommendation. Provider: services/providers/gonka.js (via services/providers/openai-credit.js), ledger services/gonka-ledger.js ($50 hard cap, data/gonka-ledger.json). Probe: `node scripts/credit-probe.js gonka` (one tiny chat call and one tiny JSON call per chat model, through the ledger).

## Prices (GET /v1/models, USD per Mtok in / out)
GLM-5.3-Flash 0.10/0.10, DeepSeek-V4-Flash-0731 0.10/0.10, MiniMax-M2.7 0.12/0.12, bge-m3 (embeddings, not wired) 0.02. Max output 16,384 tokens each. Models are fp8-quantised.

## Probe results (3 runs, 9 calls per call type; tiny prompts, so this is NOT a quality measure)
| model | chat latency | JSON call | JSON valid | notes |
|---|---|---|---|---|
| zai-org/GLM-5.3-Flash | 16.8 s, 4.3 s, 1.1 s | 8.2 s, 3.0 s, 0.6 s | 3 of 3 | chat reply leaks reasoning text ("Wait, I need to r..."), 166-174 output tokens for "Say OK" |
| deepseek-ai/DeepSeek-V4-Flash-0731 | 55 s, 34 s, 0.4 s | 1.0 s, 0.65 s, 0.18 s | 3 of 3 | chat never stops ("OK.OK.OK..." to the 300-token cap) |
| MiniMaxAI/MiniMax-M2.7 | 2.8 s, 3.9 s, 0.3 s | 3.5 s, 11 s, 3.0 s | 3 of 3 | repeats "OK." until the cap |

- Reliability: no HTTP errors in 18 calls; every JSON call validated against its schema (with `response_format: json_object` accepted, no fallback needed).
- Latency is very uneven: the first call to DeepSeek took 55 s; later identical calls took under a second with byte-identical output, which looks like response caching at the broker (temperature 0), so the fast numbers are probably cache hits, not real inference speed.
- Chat (non-JSON) calls on these models ramble past the answer on a trivial prompt; the pool's structured path (which most pipeline tasks use) was clean.
- Cost: total probe spend about $0.0003 (18 calls). Ledger spent $0.00032 of $50.

## Not measured
Output quality on real tasks (lessons, grading, fact checks), throughput under concurrency, rate limits, long-prompt behaviour, data policy beyond the owner's note that learner data is OK until 2026-11-14.

## Routing
Slots gonka:zai-org/GLM-5.3-Flash and gonka:deepseek-ai/DeepSeek-V4-Flash-0731 (config/model-lineup.json) are allowed on every task where Munito's GLM / DeepSeek slots are allowed, and sort ahead of them (price 0.10 out). Learner data only until GONKA_LEARNER_UNTIL (default 2026-11-14T06:00:00Z) and with the outside-AI consent clearance; `GONKA_LEARNER=off` or `GONKA_CAP_USD` lower it. Autobuild writers: Gonka DeepSeek then GLM (after grok-build-0.1).
