# Anthropic key: evaluation from the ledger (5 Nov 2026)

Provider: `services/providers/anthropic.js`, ledger `services/anthropic-ledger.js` (`data/anthropic-ledger.json`, stop $24 of the $25 owner cap, seed $11.20 spent before the ledger existed). No fresh quality test was run: see "Not measured".

## Real usage and cost (ledger snapshot 5 Nov 2026, all calls since the ledger began on 23 Oct)
| model | calls | USD | per call |
|---|---|---|---|
| claude-sonnet-5-5 | 349 | $12.65 | about $0.036 (last 99 logged: $0.0186; avg 5,774 in / 662 out tokens) |
| claude-haiku-5-5 | 1,107 | $1.24 | about $0.0011 (last 901 logged: $0.0010; avg 3,779 in / 1,196 out) |
Ledger spend $13.89 plus the $11.20 seed = $25.09 against the $24 stop and $25 owner cap; 74 failed and 254 refused calls (refusals are the ledger stopping spend, not API errors). Prices in code (per Mtok in/out): Sonnet 5.5 $2/$10, Haiku 5.5 $0.5/$2.5. Blended real cost per Mtok on the logged calls: Sonnet $2.89, Haiku $0.20.
By task (ledger): fact-check verification 63 calls $3.63, fact sheets 51 calls $2.30, calc-game key checks 27 calls $0.19, evidence-article rechecks 7 calls $0.11 (the rest are small).

## What we use it for
The last-resort paid fallback and the fact-check gate's Claude judge; Haiku for cheap checks, Sonnet for hard writing and verification.

## Not measured (and why)
Planted-error catch, false alarms, blind key accuracy and latency on the shared set. `ANTHROPIC_API_KEY` is blank in the shared `.env`, so the provider has no client and my Haiku run returned "empty" on all 60 cases (no call left the machine, $0). A separate FACT_CHECK_ANTHROPIC_KEY exists, but it is a different key for a different purpose and not covered by this ledger, so I did not use it. One Sonnet call ($0.028) appeared on the ledger during my window; it did not come from my processes. Earlier Anthropic quality numbers live in `docs/SCORECARD-MEASURED.md` and the grading docs; none are redone here.

## What we'd change
Put a key in `.env` for scripts (or a documented env name) so Claude can serve as the reference judge in evaluations; at $0.001 per Haiku call a full 108-call round would cost about $0.12, a Sonnet round about $2.

## Limits
Cost figures are ledger totals (the log keeps the last 1,000 calls; per-model averages use those). Seeds and refusals are included as the ledger counts them.
