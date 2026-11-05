# Coral comparison refresh (5 Nov 2026): what was and was not re-measured

Command: `node scripts/coral-eval.js --bench --only munito-v41,nvidia-v41 --budget 0.3` (RUN_CAP_USD 0.30). The run was stopped by me before it finished, so no JSON file was written; the figures below are the script's own per-cell log lines. Coral's own models (Fast, Standard) were not re-run (the brief's refresh asked for the Munito and NVIDIA arms); their numbers stay as in `docs/CORAL-EVALUATION.md` (4 Nov: TTFT 120 to 200 ms, decode 340 to 575 tok/s, 37 of 40 bank items, 0 errors in 90 calls per model).

## Munito DeepSeek V4.1 Flash (the same model family as Coral Standard), 5 Nov, n=10 per prompt length, one call at a time, streaming
| cell | result |
|---|---|
| short | 10/10 ok; TTFT p50 479 ms; decode p50 188 tok/s |
| medium | 10/10 ok; TTFT p50 954 ms; decode p50 343 tok/s |
| long | 10/10 ok; TTFT p50 1,106 ms; decode p50 122 tok/s |
| JSON validity | 20/20 |
| blind multiple choice | 40/40 answered (the per-item accuracy line was in the unfinished JSON; **not recorded**) |
Against Coral on 4 Nov: Coral's TTFT was about 2 to 9 times lower (120 to 200 ms vs 479 to 1,106 ms) and long-prompt decode about 3 to 5 times faster (340 to 575 vs 122 tok/s) on the same model family. Different day and different load; a single comparison, n=10 per cell.

## NVIDIA free tier, same model (`deepseek-ai/deepseek-v4.1-flash`)
short prompt: **0 of 10 ok** (no answer, no TTFT). The run was stopped during the medium cell after the free tier kept timing out; it was also competing with my own fact-gate run on the same free limit, so this is a floor, not a clean measurement. On 4 Nov the same free chain needed 1,094.9 s for one lesson level.

## Cost
The Munito arm cost about $0.05 (90 calls); NVIDIA $0. Both counted against the evaluation cap.

## Limits
No JSON artefact for this refresh (killed before completion); the NVIDIA arm is a failure count, not a speed number; fixing that needs a quiet-hour re-run with nothing else using NVIDIA. Marketing use: the Coral-side numbers (4 Nov) are the ones to quote; this page only supports "Coral was faster than Munito for the same model in these runs."
