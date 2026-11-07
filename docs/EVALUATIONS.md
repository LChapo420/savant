# Evaluations index: every API we use (5 Nov 2026)

Owner request: an evaluation for every API we use, adding no more than 2% to total API cost. Total API spend before this round was about $141.76 (highest ledger figure per provider, 5 Nov), so the cap was $2.80. **Spent: $2.16 (1.52% of $141.76), of which $0.06 is Anthropic calls that did not come from my processes** (my share about $2.10, 1.48%). Ledgers were snapshotted before the round and diffed after. Everything is AI-judged on model-planted errors or bank keys, or simulated: nothing is a real-learner result. Planted errors were written by Mistral Large (free on xKiro), a family none of the judges share.

Shared set: 36 planted + 24 clean fact cases, 24 planted + 24 true answer keys (`docs/fact-verifier-set.json`, built 5 Nov 03:02 UTC). Reused full-set rows were measured 5 Nov 03:02 (`docs/fact-verifier-eval.json`); fresh rows 5 Nov 14:50 to 15:45 UTC (`docs/evals-5nov-*.json`, `docs/availability-probe.json`). Some fresh rows use a seeded sub-sample (stated in each doc).

| Provider | Used for | Fact gate: planted caught / false alarms (n) | p50 / p95 | Failures this round | Real cost | Spent this round | Doc |
|---|---|---|---|---|---|---|---|
| Grokified (grok-4.3 / 4.7) | fact gate, blind check, hard writing | 22/36, 5/24 (reused) | 24.0 s / 38.3 s | **503 on 143 of 147 calls 14:50 to 15:45; down 15:05 to 15:36 in the probe (2 of 13 ok)** | $0.0015/call, $0.77/Mtok | $0.003 | GROKIFIED-EVALUATION.md |
| Lyceum (GLM-5.3, MiniMax M3, Kimi K3) | judges, calibration | MiniMax 17/36, 9/24; GLM-5.3 14/36, 2/24 (25/60 answered) | MiniMax 2.3 s / 145 s | no 429; GLM timeouts | GLM $0.020/call; Kimi $0.041 (0.071 fresh) | $1.76 | LYCEUM-EVALUATION.md |
| Gonka (DeepSeek V4 Flash, GLM-5.3 Flash) | pipeline, cheapest paid | DeepSeek 18/36, 10/24; GLM Flash 14/36, 0/24 (24/60 answered) | 14.5 s / 32.3 s | 1,146 of 8,694 ledger calls failed | $0.10/Mtok blended | $0.017 | GONKA-EVALUATION.md (probe only; numbers in LYCEUM doc) |
| ZeroGPU (GLM-5.3 Flash, gpt-oss-120b, Qwen3-30B, gpt-5.6 / 6 Luna) | fact gate (GLM only), pipeline | **GLM-5.3 Flash 22/36, 1/24; 27/36, 2/24; 28/36, 0/24 (3 runs, 55 to 57 of 60 answered)**; gpt-oss 21/36, 9/24; Qwen3-30B 6/36, 15/24; Luna 28 to 29/36 but 18 to 19/24 false alarms | GLM 11.7 to 16.5 s / 95 to 149 s | 0 x 429; GLM 3 to 5 of 60 calls 502 per run; gpt-6-luna needs the default temperature | $0.10/0.35 per Mtok (GLM) | $0.48 | ZEROGPU-EVALUATION.md (AI-judged, planted, 60 cases per run, one hour) |
| Coral (DeepSeek V4.1 Flash) | speed eval, lessons | 22/36, 11/24 (reused) | 1.2 s / 2.2 s | 4 cap refusals only (mine) | $0.35/Mtok std | $0.014 | CORAL-EVALUATION.md + CORAL-EVALUATION-UPDATE-5NOV.md |
| Munito (DeepSeek V4.1 Flash, GLM Flash, others) | pipeline | not re-run | Coral refresh: TTFT 479 to 1,106 ms | 3,111 of 4,946 ledger calls failed (rate limits) | $0.38/Mtok | $0.05 | MUNITO-EVALUATION.md |
| Standard Compute (DeepSeek V4.1 Flash 1017) | pipeline | 18/22, 9/14 (36-case subset) | 28.7 s / 118 s | 0 | $0.0050/call, $0.94/Mtok | $0.22 | STANDARD-COMPUTE-EVALUATION.md |
| Anthropic (Sonnet 5.5, Haiku 5.5) | last-resort paid, fact-check judge | **not measured: ANTHROPIC_API_KEY blank in .env** | n/a | 74 failed, 254 refused (ledger) | Sonnet $0.019 to 0.036/call, Haiku $0.001 | $0.06 (not mine) | ANTHROPIC-EVALUATION.md |
| NVIDIA free (Nemotron Ultra, GLM-5.3 Flash, DeepSeek V4.1) | first free slot, blind key check | keys 24/24 caught, 24/24 kept (reused); fact: GLM 0/60 answered (all 429); DeepSeek unfinished | keys 6.7 s / 37.9 s | 60/60 429; 7 timeouts | $0 | $0 | NVIDIA-EVALUATION.md |
| xKiro (free models; MiniMax grant) | planter, drafting | qwen3.8-max 2/36 (2/60 answered); command-a-plus 4/22, 4/14 | 37 to 90 s | 503 and unusable JSON; **MiniMax 404, grant unreachable** | $0 | $0 | XKIRO-EVALUATION.md |
| Crouton Alpha (OpenRouter free) | extra judge | 0 of 60 answered (key expired, HTTP 401) | n/a | 5 of 5 calls 401 | $0 | $0 | CROUTON-EVALUATION.md |
| Gladia | audio transcription | n/a | n/a | 0 of 1 | $0.0005 per call | $0 | GLADIA-EVALUATION.md |

Not given a doc: **Modelflare** is banned (owner, 3 Nov): no calls, no doc. **LLMGateway** (voice only, $0.069 of $5 over 33 calls: ElevenLabs v3 and Grok STT), **Jev** (a $0.13 pilot, locked), **OpenRouter paid models** (never spent), and the free-only or unused providers present in `services/providers/` (Gemini free tier, MiMo, Unorouter, Ollama local, OpenAI-credit) have no ledger activity in this round and were not evaluated; Crouton's OpenRouter key is expired, so every OpenRouter route is dead until a new key is issued.

## Questions asked
1. **Kimi K3:** about $0.04 to $0.07 per call and about $0.13 per planted error caught, against $0.007 (MiniMax M3) and under $0.002 (DeepSeek routes), with 144 s median latency and no measurable catch advantage (8 answered cases). **Recommend removing it from routine judge paths** (details and caveats in LYCEUM-EVALUATION.md). Lineup file untouched.
2. **Crouton:** not working; its OpenRouter key returns 401 "API key expired". Not a model fault.
3. **Non-DeepSeek verifiers that are fast and available now:** only Lyceum MiniMax M3 (2 to 3.5 s p50, 100% answered), with weak false-alarm control and a long p95. Grok 4.3 is slowest of the useful ones and was down 31 minutes. GLM variants are too slow or rate-limited.

## Limits of the whole round
Small samples (24 to 60 cases per row, 8 for Kimi), single runs, 4 parallel calls, one afternoon with Grokified, NVIDIA and xKiro congested; several rows are floors, not capabilities. Cost per task for lessons and other app tasks is in each provider's ledger section, not re-measured.

## Fact checking of whole lessons (6 Nov 2026, docs/FACT-GATE.md)
Held-out 117 planted errors and 87 clean levels, AI-judged. Kimi K3.1 Pro on Lyceum: 96% caught (90-98), 10% false-alarm levels, $0.065 to $0.073 a level (5,900 billed output tokens a read, reasoning included), 67 s, frequent 503s when Lyceum is busy. GLM-5.3 on Lyceum 95% (84-99, 42 plants), $0.057. Haiku 5.5 86%, $0.0015, 8 s. GLM-5.3 Flash on ZeroGPU 79%, $0.0008. DeepSeek V4.1 Flash on Coral 77%, 46% false alarms, 1 s. grok-4.3 73%, $0.002. DeepSeek V4 Flash on Gonka 30% (dev). Best gate: Kimi plus grok-4.3 with GLM-5.3 ruling, 96%, 8% false alarms. Kimi belongs on the shared-level build's read, nowhere a learner waits; not added to a live task. Crouton Alpha could not be measured: its key answered 401, expired.
