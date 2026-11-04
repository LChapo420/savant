# Evaluation of Coral fast inference by Savant

Written 4 November 2026 for Coral, in return for the $100 of API credit the owner received. Everything here was measured by a script in this repository and can be
re-run. Results labelled "AI-judged" or "simulated" are model output graded by a script against known keys, or a simulated learner; none of it is a real-learner result.

## 1. Summary of findings

- **Speed.** Both Coral models streamed fast. Time to first token (TTFT) was 120 to 200 ms at the median on every prompt length (one call at 790 ms, the slowest in 60).
  Decode speed (output tokens per second after the first token) was 340 to 575 tok/s at the median, above the advertised ~322 tok/s.
  A ~2,000-token answer took 3.6 s (Fast) and 3.8 s (Standard) at the median.
- **Fast vs Standard.** In this run Standard decoded as fast as Fast (long output: 575 vs 563 tok/s at the median; the medium and short prompts were within noise of each other),
  so on our prompts the extra speed of Fast was not visible. Fast has a 2.5x higher output price ($1.80 vs $0.60 per million tokens) and a wider tail (p95 total on the long prompt 8.7 s vs 4.9 s). n=10 per cell; a
  difference smaller than the p95 spread should not be read into these numbers. We do not know whether the two models share hardware at different times of day.
- **Reliability.** 0 errors, 0 timeouts, 0 rate-limit responses in the 90 benchmark calls per Coral model (30 latency, 20 JSON, 40 multiple choice).
- **Quality on our tasks (AI-judged).** 20 of 20 answers were valid, schema-conforming JSON on both models. Both answered 37 of 40 bank questions correctly (92.5%, the same three items missed).
- **Real workload.** Writing one full personalised lesson level (two calls: layout, then fill-out) took 8.1, 10.2 and 8.5 s wall time with Coral Fast as the only available writer (math, English, IQ), at $0.008 to $0.011 per level.
  The same math level on the app's current free chain (NVIDIA free tier, model nvidia/nemotron-3-ultra-550b-a55b at high reasoning effort, 3 attempts on a call) took 1,094.9 s (18.2 minutes), about 135 times longer, at $0.
- **Cost.** About $0.0036 per ~2,000-token generation on Fast and $0.0012 on Standard. The whole benchmark plus the lesson runs cost under $0.20 of the $100.

## 2. Method

Script: `scripts/coral-eval.js` (`--bench`, `--lesson coral|free`, `--probe`). Raw results: `curriculum-build/coral-eval/` (`coral-eval.json` has every call's TTFT, total time and token count).

- **Calls** go straight to the OpenAI-compatible `/chat/completions` endpoint with `stream: true` and `stream_options.include_usage`, one at a time (no concurrency, so latency is not queueing), from a
  residential connection in Nebraska, USA, Node 24 on Windows 11. Spend goes through our ledger (`services/coral-ledger.js`, hard $100 cap) before and after each call.
- **TTFT** is the time from sending the request to the first streamed content (or reasoning) token. **Decode tok/s** is reported output tokens divided by (total time minus TTFT); end-to-end tok/s (output tokens / total time)
  is in the raw file. Token counts are the API's reported usage (reported on 100% of calls).
- **Prompts** (temperature 0.7, n=10 each): short (a one-sentence science question, ~47 output tokens), medium (a ~300-word explanation, ~320 tokens), long (a ~1,500-word lesson, ~2,000 tokens).
- **JSON validity**: 20 calls with `response_format: json_object` asking for a mini lesson (title, exactly 3 points, a 4-choice question and answer index), validated against the schema.
- **Accuracy**: 40 of Savant's own verified bank items (10 each from Spanish, English, math, reading; four choices; order shuffled with a fixed seed), answered blind with the letter only, scored against the bank keys. Not learner data.
- **Lesson level**: `services/block-levels.js write()`, the app's real writer, for one simulated 14-year-old learner (scorecard values and interests set by the harness; a fresh temporary database, never the live one). Fact gate and self-check are switched off so only the writer is timed.
  In the Coral arm every other provider's key is removed from the process and the call is on the foreground (a learner waiting) lane, so the pool routes to Coral Fast.

## 3. Results

TTFT and total time in ms, decode in tokens per second, medians (p95 in brackets), n=10, all calls succeeded.

| Model | Prompt | TTFT | Total | Decode tok/s | Output tokens | USD per call |
|---|---|---|---|---|---|---|
| Fast | short | 155 (790) | 261 (954) | 480 (520) | 47 | 0.000092 |
| Fast | medium | 119 (292) | 1,057 (1,289) | 339 (507) | 315 | 0.00058 |
| Fast | long | 196 (518) | 3,620 (8,720) | 563 (698) | 1,960 | 0.0036 |
| Standard | short | 120 (186) | 252 (397) | 366 (438) | 46 | 0.000031 |
| Standard | medium | 123 (297) | 1,241 (2,031) | 297 (451) | 329 | 0.00020 |
| Standard | long | 123 (238) | 3,822 (4,913) | 576 (661) | 2,024 | 0.0012 |

Short-answer decode speeds are computed over very few tokens after the first and are the least reliable cells.

| Model | Valid JSON (n=20) | Bank multiple choice (n=40) | Errors / timeouts / 429 |
|---|---|---|---|
| Fast | 20 | 37 correct, 40 answered | 0 |
| Standard | 20 | 37 correct, 40 answered | 0 |

### Comparison models

- **Munito, deepseek-ai/deepseek-v4.1-flash-1017** (the same model family, run the same way): 0 of 90 calls succeeded. Every call returned HTTP 429, Munito's daily free limit for that model was already used by our earlier work that day. This is a quota result, not a measurement of Munito's speed; we have no Munito speed number to compare.
- **NVIDIA free tier, deepseek-ai/deepseek-v4.1-flash**: 0 of 75 calls (n=5 per length at a 25 s timeout) returned a first token; every call timed out. A separate direct request also timed out after 20 s. The free tier was not usable for this model at the time, so there is no number either.

The comparison with other providers is therefore not available from this run; we did not substitute remembered or advertised figures. The scripts will fill it in when those endpoints answer (`--only munito-v41,nvidia-v41`).

### Lesson level, end to end (simulated learner)

| Writer | Subject | Wall time | Blocks / checks | Coral spend |
|---|---|---|---|---|
| Coral Fast | math | 8.1 s | 4 / 3 | $0.0110 |
| Coral Fast | English | 10.2 s | 5 / 3 | $0.0084 |
| Coral Fast | IQ | 8.5 s | 7 / 3 | $0.0092 |
| Current free chain (NVIDIA) | math | 1,094.9 s | 4 / 3 | $0 |

The number of blocks and checks differs by level and learner profile; this table times the writer, it does not rate lesson quality. Quality was not AI-judged in this run.

## 4. Caveats

- n=10 per latency cell, one session, one location, one afternoon; no concurrency or load test. Tail latency (p95) from 10 calls is a rough indication only.
- Standard matching Fast may be specific to the time we ran; the two should be re-run side by side at different times of day before relying on the difference.
- Accuracy and JSON validity are AI output scored by script on a small set; 37/40 does not separate the two models.
- The lesson-level times use one simulated learner per subject and one run each; the free-chain comparison is a single run on one subject (two further free-chain runs, English and IQ, were cut off by our 700 s script timeout and have no result), and the free chain's time is dominated by the free tier's rate limits and slow high-effort reasoning model, not only by hardware speed. The comparison is therefore between two different models as well as two providers.
- Munito and NVIDIA comparisons failed for the reasons above and are reported as failures, not omitted.

## 5. How to re-run

```
node scripts/coral-eval.js --probe                       # two tiny calls
node scripts/coral-eval.js --bench [--n 10] [--only coral-fast,coral-standard,munito-v41,nvidia-v41] [--out FILE]
node scripts/coral-eval.js --lesson coral --subject math # and: --lesson free
```

Needs `CORAL_API_KEY` and `CORAL_BASE_URL` in the environment (the script reads our `.env`). The benchmark stops itself above $5 of Coral spend (`--budget`).

## 6. How Savant uses Coral

`services/providers/coral.js` and `services/coral-ledger.js` ($100 hard cap, a reservation before every call); the pool lists two slots in `config/model-lineup.json`: Standard wherever we allow Munito's DeepSeek V4.1 (its output
is cheaper, so it sorts first among paid slots), and Fast only for tasks a learner is waiting on (layout, fill-out, urgent lesson writing, the level editor), where it is the first paid slot a waiting learner's call hedges onto. Background work never uses Fast.
