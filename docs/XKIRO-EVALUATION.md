# xKiro: evaluation (5 Nov 2026)

Provider: `services/providers/xkiro.js` (OpenAI-compatible gateway, $0 models only, pipeline only, daily token cap, usage in `data/xkiro-usage.json`). AI-judged; not a real-learner result.

## Headline: the MiniMax grant is no longer reachable
The owner's MiniMax M3.1 Flash grant (about 90M tokens, due to expire 6 Nov) could not be used. The key's `/models` now lists 94 models, none from MiniMax, and a direct call returns **404 "Model minimax/minimax-m3.1-flash does not exist"** (3 of 3 calls in the availability probe, 15:05 to 15:11 UTC on 5 Nov). The provider's own rule (only models marked free at $0) would also refuse it. The grant will most likely expire unused. Tell the owner, and xKiro if he wants it restored. I could not evaluate MiniMax on xKiro at all.

## What the free catalogue measured (fact-gate set, 5 Nov)
45 of 94 models are free. The planter, Mistral Large 2512, is free and built the whole set (excluded as a judge because it wrote the errors).

| model | planted caught | false alarms | answered | fact p50 | key caught / kept | notes |
|---|---|---|---|---|---|---|
| qwen/qwen3.8-max:free | 2/36 | 0/24 | 2/60 (fact), 8/48 (keys) | 89.6 s (n=2) | 5/24, 3/24 (answered only) | 58 of 60 fact calls failed: 503 "temporarily unavailable due to high demand" and timeouts |
| cohere/command-a-plus (36-case + 24-key subset) | 4/22 | 4/14 | 14/36 | 37.3 s / 63.2 s | 11/12, 11/12 (24 of 24 answered, p50 6.2 s) | 22 of 36 fact calls returned unusable structured output |

No 429s; 503s and unusable JSON dominate. The free models are not usable as the fact gate (catch rates 6 to 18% on small answered samples, high failure). Command A Plus is acceptable only for the blind key check (n=24, one run).

## Cost
$0 (free models only; counted against the 450,000-token daily cap).

## What we use it for / would change
Planting errors for evaluations, drafting and extra judges. Change: do not rely on xKiro for the first-lesson fact gate; re-read `/models` before every run (MiniMax vanished between 4 and 5 Nov); ask xKiro whether the grant is still attached to the account.

## Limits
Two models, one run each, 4 parallel; free models are shared and "high demand" 503s vary by hour (this round 15:00 to 15:40 UTC).
