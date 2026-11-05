# Standard Compute: evaluation (5 Nov 2026)

Provider: `services/providers/standard-compute.js`, ledger `services/standard-compute-ledger.js` (cap $39.50, seed $0.50). Owner rule: only `deepseek/deepseek-v4.1-flash-1017`, and (3 Nov) DeepSeek V4.1 Flash now goes through Munito instead. AI-judged on model-planted errors; not a real-learner result.

## Fresh measurement (5 Nov 2026, `scripts/fact-verifier-eval.js --only standard-compute-deepseek-v4.1-flash --facts 36 --keys 24`, same labelled set as the other rows, seeded sub-sample)
- Fact gate, production prompt and schema: caught **18 of 22** planted errors (82%, n=22; 9 blocks and checks mixed), **false alarms 9 of 14** clean cases (64%, n=14), answered 36 of 36, 0 errors, 0 429s.
- Latency (fact): p50 **28.7 s**, p95 **118.3 s** (n=36). The reasoning model is slow here, unlike Coral and Munito's serving of the same family (Coral p50 1.2 s on the full set, measured 5 Nov 03:02).
- Blind key check: planted-wrong key caught 12 of 12, true key kept 12 of 12 (n=24), p50 2.8 s, p95 4.5 s.
Same family elsewhere (full 60 fact + 48 key set, 5 Nov 03:02): Coral 22/36 caught, 11/24 false alarms; Gonka DeepSeek 18/36, 10/24. All DeepSeek routes over-flag clean text (41 to 64%); Grok 4.3 flagged 21% (5/24).

## Cost (ledger, real)
$37.42 settled of the $39.50 cap, 5,553 calls, 20 failed. DeepSeek V4.1 Flash 1017: 4,820 calls, $25.71, **$0.0050 per call** and about **$0.94 per Mtok blended** (last 998 logged calls: avg 1,499 in / 3,767 out tokens). Earlier non-DeepSeek spend (removed by owner rule): Gemini 3.8 Flash $6.11 (478 calls), Sonnet 5.5 $4.15 (224), Opus 5.5 $1.08 (9), DeepSeek V4 Pro $0.73 (6). By task: material lessons 251 calls $1.86, game questions 82 calls $1.27, material verify 180 calls $0.26.
Cost per planted error caught in this run: about $0.005 x 36 calls / 18 catches = $0.010 (calls include clean cases).

## What we use it for / would change
Pipeline content and verification. Only about $2 of headroom remain; Munito/Coral serve the same model faster and cheaper (Coral $0.35/Mtok blended). Recommend leaving the remainder unspent and routing DeepSeek only through Munito/Coral.

## Limits
Sub-sample of 36 + 24 cases (single run, 4 parallel); the 14 clean cases make the false-alarm rate wide (+/- 25 points). Planted errors were written by Mistral Large, a family none of the verifiers share.
