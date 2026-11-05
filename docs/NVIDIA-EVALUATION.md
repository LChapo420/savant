# NVIDIA free tier (integrate.api.nvidia.com): evaluation (5 Nov 2026)

Provider: `services/providers/nvidia.js` (free, no ledger; its own resting and cooldown rules). AI-judged only; nothing here is a real-learner result.

## Reused (5 Nov 03:02 UTC, `docs/fact-verifier-eval.json`): the blind key check in production (Nemotron Ultra, `key-gate.js`)
Planted-wrong keys caught 24/24, true keys kept 24/24, 48 of 48 answered, p50 **6.7 s**, p95 **37.9 s** (n=48). It was not run on the fact gate (**not measured**; the lineup's own eval on 23 Oct put free models at 0.575 quality on facts, 40 cases, none reaching 0.75).

## Fresh (5 Nov, fact-gate set, same prompts)
- **GLM-5.3 Flash on NVIDIA: 60 of 60 fact calls failed with 429 "Too Many Requests"** (each tried twice; the provider log shows 216 set-aside events of 60 s). 0 answers, nothing to score.
- **DeepSeek V4.1 Flash on NVIDIA:** I stopped the run after about 25 minutes without it finishing (4 calls in parallel, 240 s timeout, two attempts). In that window the log shows 3 429s and 7 timeouts at 240 s. No catch or false-alarm number exists. The Coral bench's NVIDIA arm started while this ran and shares the same free limit, so part of the failure is self-inflicted contention; a shared limit is itself the finding.
- NVIDIA arm of the Coral bench (DeepSeek V4.1 Flash, one call at a time): see `docs/CORAL-EVALUATION-UPDATE-5NOV.md`.

## Cost
$0. The real cost is time: one math level on the free chain took 1,094.9 s (18.2 minutes) on 4 Nov (`docs/CORAL-EVALUATION.md`).

## What we use it for / would change
First free slot for judges, writers and the blind key check. Change: treat 429 as the normal state for GLM-5.3 Flash (route straight past it), keep Nemotron Ultra for the key check where it is measured, and never put NVIDIA ahead of a paid route on a call a learner is waiting for.

## Limits
One round from one IP; the limit is shared across our own jobs. Fact-gate latency numbers do not exist. Key-check numbers come from the earlier round, n=24 per cell.
