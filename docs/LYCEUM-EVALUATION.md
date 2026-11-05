# Lyceum: evaluation (5 Nov 2026)

Provider: `services/providers/lyceum.js`, ledger `services/lyceum-ledger.js` ($250 cap, prices from Lyceum's page read 4 Nov). All quality numbers are AI-judged on model-planted errors (Mistral Large planted them; no verifier shares its family) or bank keys: nothing here is a real-learner result. Raw files: `docs/fact-verifier-eval.json` (full set, measured 5 Nov 03:02 UTC, REUSED), `docs/evals-5nov-lyceum-minimax.json`, `docs/evals-5nov-kimi.json`, `docs/evals-5nov-compare.json` (this round, 5 Nov about 15:00 to 15:40 UTC).

## Spend (ledger snapshot 5 Nov): $74.11 of $250, 2,590 calls, 8 failed, 0 refused
| model | calls | USD | per call | list price in/out per Mtok |
|---|---|---|---|---|
| z-ai/glm-5.3 | 1,355 | $26.63 | $0.0197 (logged avg 1,203 in / 3,680 out, blended $3.66/Mtok) | not in my snapshot |
| qwen/qwen3.8-2.4t (removed earlier) | 291 | $21.90 | $0.075 | |
| moonshotai/kimi-k3 | 355 | $14.46 | $0.041 | 3 / 15 |
| deepseek-v4-pro-0813 (removed earlier) | 431 | $8.58 | $0.020 | |
| minimax/minimax-m3 | 67 | $0.13 | $0.0020 | 0.4 / 2 |
| z-ai/glm-5.3-flash | 89 | $0.12 | $0.0014 (blended $0.46/Mtok) | |

By task: judge-calibration 1,393 calls $39.84; extreme-tailor-judge 79 calls $6.88 ($0.087 per call); other 1,116 calls $25.12.

## Quality on the shared fact-gate set (36 planted + 24 clean fact cases, 24 planted + 24 true keys; production prompt and schema)
| model | planted caught | false alarms | answered | fact p50 / p95 | key caught / kept | key p50 / p95 |
|---|---|---|---|---|---|---|
| GLM-5.3 (reused 03:02) | 14/36 | 2/24 | 25/60 | 51.6 s / 272.8 s | 24/24, 24/24 | 1.2 s / 2.3 s |
| MiniMax M3 (fresh, full set) | 17/36 | 9/24 | 60/60 | 2.3 s / 145.4 s | 24/24, 20/24 | 1.2 s / 147.7 s |
| Kimi K3 (fresh, 24-case subset only, below) | 6/14 | 0/10 | 8/24 | 144.4 s / 352.8 s | 1 key answered | 64 s |
| GLM-5.3 Flash via Lyceum | not run; 5 tiny probe calls all ok at about 1.3 s | | | | | |

GLM-5.3 answered only 25 of 60 fact calls (most reasoning calls hit the 240 s timeout), so its 14/36 is a catch rate over the whole set, not over answered cases. No 429s from Lyceum in this round.

## Kimi K3 versus cheaper second-family judges (owner: "running pretty expensive... look deeper")
One subset, same seed and cases for every row (24 fact cases: 14 planted, 10 clean; 12 key cases), run 5 Nov:

| judge | planted caught (of 14) | false alarms (of 10) | answered | p50 | USD per call | USD per planted error caught |
|---|---|---|---|---|---|---|
| Kimi K3 (Lyceum) | 6 | 0 | 8/24 (16 refused by my per-run cap, not by Lyceum) | 144 s | $0.071 (11 calls = $0.78) | about $0.13 |
| MiniMax M3 (Lyceum) | 6 | 5 | 23/24 | 3.5 s (p95 60 s) | $0.0019 | about $0.007 |
| DeepSeek V4 Flash (Gonka) | 5 | 6 | 23/24 | 21 s | $0.0001 | under $0.001 |
| DeepSeek V4.1 Flash (Coral) | 7 | 7 | 20/24 (4 refused by run cap) | 2.3 s | $0.0005 | about $0.002 |
| grok-4.3 (Grokified) | not measurable: 24 of 24 calls returned 503 "temporarily overloaded" in the re-run (16 of 24 in the first run). Full-set numbers reused from 03:02: 22/36 caught, 5/24 false alarms, p50 24 s, about $0.0015 per call | | | | | |

Reading it honestly: Kimi's 6 catches among 8 answered cases and 0 false alarms on 10 clean cases is the best precision in the table, but n is tiny and its answers came at 144 s median and 353 s p95. Its cost per catch is about 18 times MiniMax M3 and over 60 times the DeepSeek routes. Lyceum's per-call price is real ($0.071 here, $0.041 over its life; output is reasoning-heavy). Nothing we measured shows a Kimi advantage large enough to pay that: 6 of 14 caught (on 8 answered) is not distinguishable from 5 to 7 of 14 for the others.

**Recommendation: remove Kimi K3 from the routine judge paths (judge-calibration, extreme-tailor-judge); keep at most as a rare, capped tie-break.** That would have saved up to about $14.46 of the $74.11 so far. `config/model-lineup.json` is NOT changed by this round.

Which non-DeepSeek verifiers are fast AND available (5 Nov, this round): MiniMax M3 on Lyceum is the only one (answered 60/60 and 23/24, p50 2 to 3.5 s, but p95 60 to 145 s, and it over-flags clean text, 5/10 and 9/24). Grok 4.3 was fine on 4 Nov (404 ok of 425 ledger calls) but is slow (p50 24 s) and was 100% unavailable today. GLM-5.3 and GLM-5.3 Flash answer too rarely on real prompts (25/60 and 19 to 24/60) and take minutes.

## What we use it for / would change
GLM-5.3 first, Kimi as second family: the judge-calibration and tailoring judges. Change: drop Kimi; prefer MiniMax M3 ($0.002 per call) for second-family checks; cap GLM-5.3's output tokens (calls of 16,000 output tokens seen, up to $0.13 each); stop paying for calls that time out (13 stale reservations counted as spent in the last 1,000 log lines).

## Limits
Kimi's sample is 8 answered fact cases and 1 key case, cut short by my own $1.20 run cap (reserved plus settled spend), so its answer rate is under-stated. A 24-case subset means every rate has a wide interval (about +/- 25 points). Four calls in parallel may inflate the p95 tails. Full-set rows are from 03:02 UTC on the same set file.
