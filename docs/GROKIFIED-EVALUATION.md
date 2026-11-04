# Grokified: evaluation notes (4 Nov 2026)

Factual notes from one probe round, not a recommendation. Provider: services/providers/grokified.js, ledger services/grokified-ledger.js ($135 hard cap, data/grokified-ledger.json). Probe: `node scripts/credit-probe.js grokified`.

## Prices (USD per Mtok in / out, Grokified's own prices as given by the owner on 2026-11-04)
grok-4.3, grok-4.20-0309 (reasoning, non-reasoning, multi-agent) 0.63 / 1.25; grok-4.5, 4.6, 4.7 1.00 / 3.00; grok-build-0.1 (code) 0.50 / 1.00. The models endpoint's raw integer prices were first read as 10,000 per USD (2 / 6 for 4.7) and over-stated these; the ledger uses the owner's figures. Only these Grok text models are priced or routed; Claude (402 until an add-on is bought), image and video models are never used.

## Probe results (one run; tiny prompts, NOT a quality measure)
| model | chat latency | prompt tokens | JSON call | JSON valid |
|---|---|---|---|---|
| grok-4.7 | 2.9 s | 1,253 | 3.8 s | yes |
| grok-4.6 | 3.3 s | 647 | 6.2 s | yes |
| grok-4.5 | 1.6 s | 505 | 2.8 s | yes |
| grok-4.3 | 4.5 s | 203 | 11.3 s | yes |
| grok-4.20 reasoning (dated and alias) | 3.2-3.8 s | 197 | 7.5-7.9 s | yes |
| grok-4.20 non-reasoning (dated and alias) | 0.7-0.8 s | 195 | 0.8-0.9 s | yes |
| grok-build-0.1 | 2.5 s | 197 | 5.5 s | yes |

- Reliability: 18 of 18 calls succeeded, 9 of 9 JSON answers validated. `response_format: json_object` accepted.
- Overhead: the same 12-token prompt cost 197 prompt tokens on 4.20 / 4.3 / build, 505 on 4.5, 647 on 4.6 and 1,253 on 4.7. Grokified (or the model's system prompt) adds that overhead; the ledger reserves 1,250 tokens per call and charges the reported usage.
- Cost: the probe was charged at the earlier, higher unit reading (grok-4.7 $0.0025 per trivial call, $0.014 in all); at the owner's prices it was about half that. The ledger holds the higher figure, which only over-counts.
- Output tokens read 1 on "Say OK" even for reasoning models, so reasoning tokens may not be reported in `completion_tokens`; if so, cost is under-counted in the ledger. UNVERIFIED: check against Grokified's dashboard balance after real use.

## Not measured
Quality on real tasks (judging, fact checks, hard writing), concurrency and rate limits, long-context behaviour, true billed cost versus the ledger.

## Routing
Slots (family `grok`): grokified:grok-4.3 (0.63/1.25, the cheapest capable Grok) on the judge/check tasks (fact_read/verify/repair/claims, blind_mc, placement_unit_judge, placement_key_judge, night_judge, material_verify); grokified:grok-4.7 (flagship) only on hard writing (lesson_write, lesson_write_urgent, night_write, block_fill, block_layout, level_editor, material_pack/outline/notes, author_items, game_questions). Dearest paid slots, tried last before the Anthropic key. Retries: only 429 and 5xx fall through to the next slot; 401/402/403 are config errors. Learner data only until GROKIFIED_LEARNER_UNTIL (default 2026-11-14T06:00:00Z) and with the consent clearance. Autobuild: writer grok-build-0.1 first, reviewer grok-4.3 for any non-Grok writer.
