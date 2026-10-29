# Model lineup: free NVIDIA build first, Claude last

Set up on 2026-10-22 for the owner's goal: "make everything 100% factual and perfect everywhere for the absolute lowest price possible".

## The lineup

| Tier | Model(s) on NVIDIA build (free) | Reasoning sent | Used for |
|---|---|---|---|
| instant | `nvidia/nemotron-3.5-lightning-30b-a3b` | thinking off | work that needs no thinking |
| light | `nvidia/nemotron-3-ultra-550b-a55b` | a little thinking (`medium_effort`) | conversation turns where some reasoning helps |
| fast_thinking | `z-ai/glm-5.3-flash` or `deepseek-ai/deepseek-v4.1-flash`, whichever measured better | high | fast work that needs thinking |
| hard | `z-ai/glm-5.3` at max, or `deepseek-ai/deepseek-v4.1-flash` at max (full V4.1 is not on NVIDIA) | max | hard work |
| free fallbacks (2026-10-23) | local Ollama standard models, then Gemini free tier (off until confirmed free), then OpenRouter `:free` models with a $0 server-side price cap (services/providers/ollama.js, free-apis.js) | as measured | only when the NVIDIA tiers fail a call; local first while NVIDIA is DOWN (15 confirmed minutes) |
| last resort | Claude on `ANTHROPIC_API_KEY` (services/providers/anthropic.js) | as before | only when every free model failed the call, inside the key's TOTAL ledger (services/anthropic-ledger.js, stop $24) |

- **Out of every chain:** MiMo (the owner said GLM 5.3 and DeepSeek at max match it), Gemini (not in the lineup), and OpenRouter, whose GLM, DeepSeek and Qwen routes bill the owner's account. Their code is kept. A provider re-enters only with `AI_LEGACY_PROVIDERS=<name>` **and** an `AI_PROVIDER_*` variable naming it.
- **Modelflare** stays exactly where it was: it alone writes the whole-subject placement quiz (`placement` role). Nothing else uses it.
- **Jev** (`typesafe/jev-1.13`, paid, OpenRouter) is off. It turns on for a task only where the eval shows it beats every free model, and only with `JEV_ENABLED=1`, inside a persistent $0.13 ledger.

Which model answers which work is data in `config/model-lineup.json`. `services/providers/nvidia.js` re-reads it whenever the file changes. `scripts/model-lineup-eval.js --write` puts the measured winners there.

## How a call is routed

`services/ai.js` → `services/providers/index.js` `chain(role, task)` gives **nvidia, then ollama, gemini_free, openrouter_free, then anthropic** for every role except `placement`, which is `modelflare` alone (updated 2026-10-23: see "Free fallbacks, the key ledger and the 15-minute rule" at the end). Inside nvidia, `plan(role, task)` builds the list of models to try:

1. The task's own models, if `config/model-lineup.json` `tasks.<task>.models` has them (the eval's ranking, winner first).
2. Then the rest of the task's or the role's tier.
3. Then the tiers it may spill into, never a weaker one: instant to light to fast_thinking, light to fast_thinking, fast_thinking to hard, and hard to nothing.

The list is de-duplicated and capped at `NVIDIA_MAX_MODELS` (default 4). Claude is reached only when every model in that list fails.

| Role | Tier | Role | Tier |
|---|---|---|---|
| fast (coach, help) | light | diagnose | hard |
| check | light | rewrite | hard |
| deep / author | hard | personalize | fast_thinking |
| regen | fast_thinking | games | hard |
| blocks | fast_thinking (tasks raise the fill-out and fact work to hard) | placement | modelflare (unchanged) |

### Env overrides

**Kept from before:**

- `AI_PROVIDER_<GROUP>` and `AI_PROVIDER_<GROUP>_FALLBACK`. Whatever these name, nvidia is in the chain and anthropic is last.
- `AI_PROVIDER_PLACEMENT` and its fallback still decide placement.

**New:**

| Variable | Effect |
|---|---|
| `AI_LEGACY_PROVIDERS=mimo,openrouter,gemini` | Opts legacy providers back in. |
| `AI_ANTHROPIC_FALLBACK=0` | Takes Claude out of every chain. The app then degrades to its deterministic floors. |
| ~~`AI_ANTHROPIC_DAILY_CENTS`~~ | **Removed 2026-10-23.** Replaced by the key's persistent TOTAL ledger (`data/anthropic-ledger.json`, `ANTHROPIC_LEDGER_STOP_USD` can only lower the $24 stop). The per-user `AI_DAILY_CENTS_PER_USER` and `AI_DAILY_CALLS_PER_USER` caps still apply. |
| `NVIDIA_TIER_<TIER>`, `NVIDIA_TASK_<TASK>` | `model@effort,model@effort`. |
| `NVIDIA_ROLE_<ROLE>` | A tier name. |
| `NVIDIA_RPM` (default 36), `NVIDIA_CONCURRENCY` (default 8), `NVIDIA_MODEL_CONCURRENCY` (default 4, per model), `NVIDIA_TIMEOUT_MS`, `NVIDIA_MAX_MODELS`, `NVIDIA_BASE_URL` | Pacing, timeouts and the endpoint. |
| `MODEL_LINEUP_FILE` | Path to a different lineup file. |

**Important for the owner's `.env`:** it still has these lines from before the lineup:

- `AI_PROVIDER_FAST=openrouter`, `AI_PROVIDER_FAST_FALLBACK=gemini,mimo`
- `AI_PROVIDER_DEEP=mimo`, `AI_PROVIDER_DEEP_FALLBACK=openrouter,gemini`
- `AI_PROVIDER_REGEN=mimo`, `AI_PROVIDER_REGEN_FALLBACK=openrouter,gemini`
- `AI_PROVIDER_DIAGNOSE=mimo`
- `OPENROUTER_MODEL_DEEP=z-ai/glm-5.3-flash` (paid)

The app now ignores the legacy names (it warns once per variable), so nothing is spent through them. The lines can be deleted. `AI_PROVIDER_PLACEMENT=modelflare` is still honoured.

## What NVIDIA build actually does (measured 2026-10-22 against the live endpoint)

- **Models.** `GET /v1/models` lists 83 models, including the five above.
- **Reasoning controls** go in `chat_template_kwargs`, and each family is different. These were probed per model.
  - **Nemotron** (Lightning and Ultra):
    - `{enable_thinking:false}` is honoured (0 reasoning tokens, about 0.25 s).
    - `{enable_thinking:true, medium_effort:true}` is a little thinking.
    - `{enable_thinking:true}` is full thinking.
  - **GLM 5.3 and GLM 5.3 Flash:** `{reasoning_effort: low|max}` works (Flash: 8 reasoning tokens at low against 42 at max on a toy question). `{enable_thinking:false}` is **not** honoured; the model still reasons (85 tokens). So "off" is sent as `low`. This matches the GLM-5.3 template, which has no non-thinking mode.
  - **DeepSeek V4.1 Flash:**
    - `{thinking:false}` gives 0 reasoning tokens.
    - `{thinking:true, reasoning_effort:"high"|"max"}` thinks. With no field set, it thinks by default.
  - **No thinking budget.** `reasoning_budget` and `nvext.max_thinking_tokens` are both rejected with HTTP 400 ("thinking_token_budget is not yet supported by the V2 model runner"). The budget is controlled through `max_tokens` instead.
- **Thinking counts against `max_tokens`** and comes back in `message.reasoning_content`. With `max_tokens` 10, a thinking model returns empty content, which is what the lead saw. The provider therefore adds headroom per effort: off +0, low +4k, medium +6k, high +16k, max +32k, capped at the model's output limit. An empty answer with `finish_reason: length` moves to the next model.
- **Structured output.**
  - `tools` with `tool_choice: auto` works on all five models.
  - `response_format: json_schema` works on Nemotron and GLM but returns **empty content on DeepSeek**.
  - `nvext.guided_json` is rejected.
  - So the provider uses one function tool and falls back to JSON in the content (`json_object`) for a model that rejects tools.
  - Every answer is validated against the caller's schema. Safe coercions are applied: `"3"` to 3, an enum's case, an array sent as a string, unknown keys pruned. A `<think>` block, a code fence, a trailing comma or a cut-off object is repaired locally.
  - Anything still invalid gets **one repair turn** on the same model, showing it its answer and the exact errors. If that also fails, the next model is tried.
- **Rate limits.**
  - No rate-limit headers are sent.
  - NVIDIA forum moderators and many users put the free tier at **40 requests per minute per key**. They say it varies by model and load, and that there is no increase on the free tier; higher limits are for self-deployed NIMs. There are no credits any more, only RPM.
  - The provider paces the whole key under 36 RPM with a priority queue (interactive work ahead of background work).
  - Backoff: `Retry-After`, or 3 s × 2ⁿ on 429, and 1.5 s × 2ⁿ on 5xx, timeouts and network errors.
  - Tries per model: 2 for interactive work, 4 for background work. Then the model rests for 60 to 90 s and the next model takes over.
  - A 401 or 403 stands NVIDIA down for 10 minutes; a 404 rests that model for an hour.
- **Latency is the real cost.** One-line probes, then eval medians in the results below:

| Model | Probe latency |
|---|---|
| Lightning, thinking off | 0.25 to 1 s |
| Ultra | 1 to 8 s, sometimes 30 s |
| GLM 5.3 Flash | 3 to 15 s |
| GLM 5.3 | 3 to 36 s |
| DeepSeek V4.1 Flash | 17 to 55 s, even for a one-word answer |

  Timeouts per effort: off 60 s, low and medium 120 s, high 300 s, max 310 s. The gateway itself answers 504 at about 300 s, and a 504 or timeout at max is retried at high.

Sources:

- [build.nvidia.com Nemotron 3 Ultra model card](https://build.nvidia.com/nvidia/nemotron-3-ultra-550b-a55b)
- [build.nvidia.com DeepSeek V4 Flash model card](https://build.nvidia.com/deepseek-ai/deepseek-v4-flash)
- [NVIDIA forum: 40 RPM free tier](https://forums.developer.nvidia.com/t/request-for-nvidia-build-api-rate-limit-increase-40-rpm-200-rpm/377433)
- [NVIDIA forum: credits to RPM](https://forums.developer.nvidia.com/t/credit-rate-limit-increase-request-1-000-5-000-credits-40-200-rpm/379108)
- [GLM-5.3 template discussion](https://huggingface.co/zai-org/GLM-5.3/discussions/21)
- [vLLM DeepSeek V4 Flash recipe](https://recipes.vllm.ai/deepseek-ai/DeepSeek-V4-Flash)

The live probes above are the authority where these sources disagree.

## Every model call site, by tier

The task names are passed as `task:` at each call, and `config/model-lineup.json` `tasks` maps each one to a tier and, after the eval, to measured models.

| Call site | Role / task | Tier | Why |
|---|---|---|---|
| `services/spanish/ai-activities.js` conversationTurn (role-play partner reply) | fast / `spanish_partner_turn` | instant | A short in-character reply at a fixed CEFR level, with someone waiting. Goals are checked against a closed list. |
| `services/spanish/ai-activities.js` reaction (one-sentence reply plus correction) | fast / `spanish_reaction` | light | Correcting a learner's Spanish must be right, but it is one sentence. |
| `services/ai.js` coachReply / coachReplyStream (the coach) | fast / `coach_turn` | light | Live conversation, so latency matters. Must not mislead, and the leak guard still runs. |
| `services/ai.js` tutorReply (explain an answered item) | fast / `tutor_explain` | light | Same as the coach. |
| `services/ai.js` remediationTeachReply | fast / `remediation_teach` | light | Conversational teaching. |
| `services/assist.js` onBlock / onPage (help on a lesson part); `services/tutor.js` home chat and memory fold | fast / `assist_help` | light | Conversational help. |
| `services/tutor-context.js` reply (the tutor dock on every page) | fast / `dock_help` | **Ultra @off only** (`"only": true`: no tier or spill behind it; a 429 or cooldown goes to the next provider, OpenRouter's free route of the same model) | Owner, 2026-10-29: fast with full context. Reasoning on took 2-35 s; off answers in 1-3 s with the same content. 4 s hedge, 15 s cap per attempt. |
| `services/ai.js` gradeFreeResponse (`services/grading.js` `needsAi`: short_answer the rules reject; called from `services/sessions.js`) | fast / `grade_free_response` | **hard: GLM 5.3 @max (eval winner)**, then Ultra, then GLM Flash | A false accept teaches a wrong answer, so it needs real judgement. Measured below (0.938, 71 s median: see open questions). |
| `services/spanish/ai-activities.js` conversationRubric, writing feedback, writing and speaking rubrics | fast / `spanish_rubric` | fast_thinking | Scores and corrections a learner acts on. |
| `services/ai.js` regenerateItems (remake a failed quiz) | regen / `regen_items` | fast_thinking | Bulk authoring against a fixed spec, validated in code. Learner waiting. |
| `services/ai.js` generateLesson, urgent (someone is waiting) | fast / `lesson_write_urgent` | fast_thinking | A correct lesson in seconds rather than minutes. |
| `services/ai.js` analyzeSession | deep / `analyze_session` | fast_thinking | Reads a finished session; validated schema. |
| `services/ai.js` generateEssayPrompt | deep / `essay_prompt` | fast_thinking | Topic and rubric; ids are validated. |
| `services/learner-record.js` review and debrief (personalize reads) | personalize / `personalize_read` | fast_thinking | Weighs a scorecard and recommendations. |
| `services/block-levels.js`, `services/block-checkpoints.js` layout | blocks / `block_layout` | fast_thinking | Picks blocks from a catalogue; schema-checked. |
| `services/ai.js` authorForKey (generateItems) | deep / `author_items` | hard | New questions must have exactly one correct answer. |
| `services/ai.js` generateLesson, prefetched | deep / `lesson_write` | hard | Teaching content: factual, worked examples. |
| `services/ai.js` gradeEssay | deep / `essay_grade` | hard | Decides a checkpoint. |
| `services/ai.js` diagnoseArea / diagnoseCheckpoint | diagnose / `diagnose` | hard | Decides what a learner practises; a weak answer is worse than the rule-based floor. |
| `services/level-editor.js` (a page for one learner) | personalize / `level_editor` | hard | Strict output contract; a bad page is thrown away. |
| `services/block-levels.js` fill-out and checks-only, `services/block-checkpoints.js` fill | blocks / `block_fill` | hard | This is the lesson content itself. |
| `services/game-payloads.js` (a game level's questions, repairs and tailored sets) | blocks / `game_questions` | hard | Questions must be right; written as one set. |
| `services/block-levels.js` verifyLevel with no fact key, and the free-first full reads | blocks / `fact_verify` | hard (eval decides between the two) | Catching errors is the whole job. Measured below. |
| `services/block-levels.js` repairCall (GLM path and free-first path) | blocks / `fact_repair` | hard | A repair that adds an error costs another round. |
| `services/fact-cascade.js` claim listing | check / `fact_claims` | light | Quoting claims verbatim is extraction. |
| `services/fact-cascade.js` read-through | check / `fact_read` | hard (eval: `facts`) | Contradictions and wrong keys. |
| `services/fact-cascade.js` blind test | check / `blind_mc` | **light: Nemotron Ultra (eval winner, 48/48)** | Answering the level's checks without the key. Measured below. |
| `services/fact-cascade.js` per-block verify (thorough-mode hints) | check / `fact_verify` | hard | As verifyLevel. |
| Placement judging (scripts) | `placement_key_judge` / `placement_unit_judge` | **light: Nemotron Ultra (eval winner for both)** | Offline. Measured so the scripts can move off MiMo. |
| `services/subject-placement.js`, `routes/placement.js` (whole-subject placement quiz) | placement | **modelflare, unchanged** | Placement-only. Left where it is. |

### Not moved

These call MiMo or OpenRouter directly, outside the chains:

| Call site | Status |
|---|---|
| `services/subject-placement.js` with `PLACEMENT_WRITER=mimo` (direct `mimo.structuredStream`) | Opt-in by env only. This file is owned by another agent, so it was not edited. Suggested change: route it through `require('./providers/nvidia').structured({ role: 'placement', task: 'placement_write', models: [{ model: 'z-ai/glm-5.3', effort: 'max' }] })`, or drop the option. |
| `services/spanish/voice.js` | MiMo ASR and Gemini TTS. Speech, not text models, and nothing in the lineup does speech. |
| `scripts/placement-testers.js`, `revise-placement.js`, `revise-unit-placement.js`, `generate-unit-placement.js`, `generate_blocks.js` | Call MiMo directly. Offline tools; they can be switched to `nvidia.structured` with the eval's placement winners. |
| `scripts/generate-base-lesson.js`, `send-lesson-prompt.js` | Call OpenRouter's paid GLM and DeepSeek routes directly. **Do not run them** under the no-OpenRouter-spend rule. Switch them to `nvidia.chatStream` with `models`. |

`scripts/generate-base-levels.js` and `generate-game-lab.js` use `providers.current('blocks')`, so they now run on NVIDIA for free.

## Jev, and the $0.13 ledger

`services/jev.js` is the only way to call Jev:

- Every call reads `data/jev-ledger.json` fresh from disk.
- It estimates the cost (1.5 × characters / 4 tokens × $0.000000042, with a floor) and refuses the call if settled spend + open reservations + the estimate would pass **$0.13**.
- It writes a reservation before sending and settles afterwards at the largest of three figures: the reported cost, input tokens × price, and the estimate.
- A server or network failure is counted as billed.
- It locks itself off on HTTP 401, 402 or 403, on a call over $0.0005, or on a call priced at more than 3× the listed rate.
- An unreadable ledger refuses rather than resetting.
- The environment can lower the budget (`JEV_BUDGET_USD`) but never raise it.
- Spend is logged to the console and in the ledger's `log` and `by_task`.

Hooks:

- **Grading.** Rules first. Then Jev, if the lineup enables it: accept at p ≥ 0.7, reject at p ≤ 0.3. Anything in between goes to the models.
- **Cascade blind test.** Non-math multiple choice only; a Jev answer stands at confidence ≥ 0.8.

Both are off unless the lineup's `jev.<task>` is true **and** `JEV_ENABLED=1`. The eval compares Jev from the pilot's cached answers and spends nothing. With `--jev` it may fill missing cases through the ledger.

The rule the eval applies: Jev is enabled for a task only if Jev, with the free winner taking its undecided cases, is **strictly** more accurate than every free model alone, with no more false accepts. Jev always costs more than the free models, so it can only earn its place on accuracy, where the alternative is Claude.

## Running the eval

```
# in the repo; NVIDIA_API_KEY in .env or ../.env; no other key is used
# (Anthropic, MiMo, Gemini and Modelflare keys are blanked; OpenRouter too unless --jev)
node scripts/model-lineup-eval.js                  # all tasks; resumes from curriculum-build/model-lineup/cache.json
node scripts/model-lineup-eval.js --report --write # recompute the report from the cache (no calls) and write the winners into config/model-lineup.json
node scripts/model-lineup-eval.js --tasks grading,blind --n 80   # more cases for some tasks
node scripts/model-lineup-eval.js --retry-errors   # re-ask cases whose call failed
node scripts/model-lineup-eval.js --jev            # also fill Jev answers through the $0.13 ledger
DB_FILE=<copy of data/db.json> node scripts/model-lineup-eval.js --build-fact-cases   # rebuild the fact cases
```

- A full run is about 1,240 calls and takes about an hour, bounded by DeepSeek's latency, not by the rate limit.
- Output goes to `curriculum-build/model-lineup/EVAL-REPORT.md` (and `.json`), with the raw `results.json`, `cache.json`, `key-cases.json` and `fact-cases.json`.
- `--write` updates `config/model-lineup.json`:
  - `tasks.<task>.models`, the ranking with the winner first;
  - `tasks.<task>.eval`;
  - the order inside the two either/or tiers, by average accuracy across tasks;
  - `jev.<task>`.

## Eval results (2026-10-22)

This is a real run against NVIDIA build: 1,236 answers over three passes. The full tables are in `curriculum-build/model-lineup/EVAL-REPORT.md`. Jev's numbers come from the pilot's cached answers to the same cases, so no new Jev calls were made and the ledger is still at $0.

Accuracy counts a failed call (a 429, or a 504 at the gateway's 5-minute cut-off) as wrong. In brackets is accuracy on the calls that answered.

| Task (n) | Winner, written to config | Accuracy | Median latency | Runner-up | Jev |
|---|---|---|---|---|---|
| grading: typed answers the rules reject (48) | **GLM 5.3 @max** (`grade_free_response`) | 0.938 (0 false accepts, 3 false rejects) | 71 s | Ultra @medium 0.917 (0 FA), 12 s. Lightning 0.917 but 1 false accept, 2 s | 0.917 with GLM deciding its undecided cases, so **off** |
| blind MC, the cascade's step 3 (48) | **Nemotron Ultra @medium** (`blind_mc`) | 1.000 (48/48, math 12/12) | 11 s | GLM 5.3 @max 1.000 at 51 s; GLM Flash 0.979 | 1.000, equal, so **off** |
| answer-key judging (20 agreed-correct + 20 planted wrong keys) | **Nemotron Ultra @medium** (`placement_key_judge`) | 1.000 (20/20 caught, 0/20 false flags) | 8 s | GLM 5.3 Flash 1.000 at 71 s; Lightning 0.975 | n/a |
| placement-unit location vs the two-judge mean (30) | **Nemotron Ultra @medium** (`placement_unit_judge`) | 0.900 exact, 0.967 within 1 | 21 s | GLM Flash 0.900 at 52 s. The writer's own unit: 0.933 | 0.767, so **off** |
| claim checking vs Sonnet's verdicts (20 errors + 20 verified) | **none written**: best balanced accuracy 0.575 (GLM 5.3 @max), below the 0.75 bar | 0.525 to 0.60 balanced for every model | | | n/a |

What the numbers say:

- **DeepSeek V4.1 Flash is the weakest link on the free tier, through availability, not quality.**
  - When it answered, it was as good as the others: 0.90 to 1.00 when answered on grading, blind, keys and units.
  - But it returned **429 Too Many Requests** on 15 to 55% of its calls. That happened even with only 2 or 3 in flight. Later, a single request on its own came back 429 within 0.4 s.
  - It is also the slowest model, at 70 to 125 s per call.
  - So **GLM leads both either/or tiers** (fast_thinking: GLM 5.3 Flash, then DeepSeek; hard: GLM 5.3 @max, then DeepSeek @max). DeepSeek stays as the fallback in each.
- **Nemotron Ultra at medium effort is the best value.** It tied or won on every judging task, at a quarter or less of GLM's latency. That is why `blind_mc` and the placement judges moved to it.
- **Lightning (thinking off)** works for yes/no judgements: grading 0.917 and keys 0.975, in about 2 s. It is poor at anything needing reasoning: blind MC 0.833 with 8 false flags, unit location 0.40. It stays only on `spanish_partner_turn`.
- **No free model can replace Sonnet as the fact verifier.**
  - Judging single claims against Sonnet's web-searched verdicts, every model was close to chance. GLM 5.3 @max caught 7/20 errors with 4/20 false alarms.
  - Caveat: the claims are judged without their lesson context, and the labels are Sonnet's.
  - Nothing was written for `fact_verify` / `fact_read`, so their hard-tier default stays. The Sonnet read stays the final gate in thorough and free-first modes.
- **Jev wins nowhere.** It is 0.917 against GLM's 0.938 on grading, equal on blind MC, and 0.767 against 0.900 on units. It stays off, and its $0.13 is untouched.
- **NVIDIA's gateway cuts a request at about 300 s** (every 504 arrived at 300 to 310 s). Max-effort thinking on GLM 5.3 and DeepSeek sometimes runs past that on long claim checks. So the provider now:
  - times max-effort calls out at 310 s;
  - retries a 504 or timeout at `high`;
  - caps each model at `NVIDIA_MODEL_CONCURRENCY` (4) requests in flight.

**Not measured:**

- Lesson writing, block fill-outs and game questions (writing quality cannot be auto-scored).
- The coach's tone.
- The Spanish rubrics.
- Claim listing.

These keep their tier defaults from the table above.

## Local models

Nothing new was downloaded or installed. The local fact checkers stay where they are: `tools/fact-checkers/server.py` (FactCG, MiniCheck, Granite Guardian, HalluGuard) in the fact cascade's step 4.

**Recommendation, not done:** a small local instruct model (around 3 to 4B parameters at 4-bit, about 2.5 GB, which fits the 4 GB GPU) could take `fact_claims` (claim listing) off the NVIDIA rate limit.

- **Why that task.** It is the cascade's highest-volume call (one per block). It is pure extraction, with no judgement.
- **Expected gain.** Throughput, not accuracy. It frees about a third of a lesson's NVIDIA requests for the reads that need GLM 5.3. It also keeps verification running when the 40-RPM key is saturated.
- **Not recommended for blind answering, placement or verification.** The eval shows the 30B Lightning model with thinking off already trails on those (blind MC 0.833, unit location 0.40), and a 4B model would be weaker still. A second candidate is a local fallback for yes/no grading when the key is rate limited. Lightning scores 0.917 there, but one false accept in 48 is the risk to weigh.


## Free fallbacks, the key ledger and the 15-minute rule (2026-10-23)

- **Order, every role but placement:** NVIDIA, then the free fallbacks, then Claude. The fallbacks answer only when the NVIDIA tiers fail a call.
  - `ollama`: local standard models (ollama.js refuses abliterated, derestricted and uncensored names). It answers the tasks `config/local-lineup.json` lists as measured good enough, and every task while NVIDIA is DOWN. It is skipped while free RAM is under 1.6 GB (the owner's 95% rule).
  - `gemini_free`: off until the free tier is confirmed (`GEMINI_FREE_TIER_CONFIRMED=1` after checking AI Studio, or a 429 whose quota names the free tier).
  - `openrouter_free`: `:free` ids only, each checked at $0 on `/api/v1/models` before use, one model per request, and every request carries `provider.max_price` all 0. With that cap OpenRouter itself refuses a paid endpoint (measured: 404 "No endpoints found that satisfy the max price", no charge). Any reported cost above $0 locks the tier off, persisted in `data/free-tier-evidence.json`.
  - `AI_FREE_FALLBACKS=0` removes the free APIs; `OLLAMA_ENABLED=0` removes local.
- **Anthropic key ledger** (`services/anthropic-ledger.js`, `data/anthropic-ledger.json`):
  - It is seeded with the $11.20 spent before it existed, and the hard stop is $24.00, open reservations included.
  - Every call reserves its worst case first, and the reservation is written before the call is sent. It is settled at the cost computed from the reported usage: $0 on an HTTP error, the full reservation on a network failure or timeout.
  - It guards both `ANTHROPIC_API_KEY` (`providers/anthropic.js`) and `FACT_CHECK_ANTHROPIC_KEY` (`fact-check-anthropic.js`).
  - A ledger that cannot be read refuses every call.
- **NVIDIA 15-minute rule** (`nvidia.outage()`):
  - Only availability failures count (429, 5xx, timeouts, network).
  - NVIDIA is DOWN only after all three hold: 15 minutes with no success; at least 8 failures over at least 3 different minutes, the latest within 3 minutes; and a one-token probe that also failed.
  - Before that, every call tries NVIDIA first.
  - While DOWN, local goes first and a probe retests every 60 s. The first success ends the outage.
- **Consent:** a learner whose consent does not cover outside AI (`routes/consent.js` `access().ai_free_text`) gets no outside model at all: no NVIDIA, Jev, Gemini, OpenRouter or Claude. Only the local tier and the deterministic floors serve them. Ollama on this machine is not outside processing; every other provider is.
- **Typed-answer grading:** see `curriculum-build/grading-cascade/REPORT.md` and `services/typed-grading.js`.


## The model pool (2026-10-27): all free slots at once, paid only to make a deadline

The sequential chain above is still the **preference order**, but calls no longer walk it one slot at a time. `services/pool.js` turns each model of each chain provider into a **slot** and runs them in parallel. `AI_POOL=0` restores the old walk (placement, Modelflare alone, is never pooled).

- **Slot** = provider + model + effort. It has a concurrency cap, an RPM budget (NVIDIA's one key is shared by its three model slots), an optional daily token cap (xKiro's free plan), a price per Mtok in and out ($0 = free), a data class, and live stats: latency EWMA, p75 and p90, error rate and a circuit breaker (opens after 3 failures in a row, a 429 or a refusal; one probe call when it half-opens).
- **`callHedged(req, opts)`** is what `services/ai.js` calls for every `structured` / `structuredDetail` / `talk` / `talkDetail`. The best free slot for the task starts; if there is no valid answer by `hedgeAfterMs` (that slot's p90, clamped to 20 to 90 s) the next free slot starts too (then a cheap paid one, only inside its budget); the first valid answer wins and the others are cancelled (AbortController, through the providers' `signal`). Every attempt has a **hard timeout**: 120 s by default, 180 to 300 s for the heavy tasks (`config/model-lineup.json` `pool.tasks.<task>.timeout_ms`), and the whole call is bounded at 2.5x that. A slot that is merely busy is waited for up to 3 s so the preference order holds. The caller's `validate` decides what is a valid answer; an invalid answer is a failure and the call goes elsewhere. This is what ends the "one lesson call succeeds 1 in 16 and each failure waits 25 minutes" case: each slot gets one try (`attempts: 1`) and a bounded wait, not four tries per model on four models. `BLOCK_WRITE_TIMEOUT_MS` (25 min) stays only as the outer guard for a whole multi-call level write.
- **`runBatch(items, opts)`** is for big jobs (the night runner, scripts). One shared queue; each slot's workers **pull** the next item when free (work stealing), so fast slots take more and the last items finish together. Free slots always pull. A paid slot pulls only when the free-only projected finish (remaining items / measured free throughput) is later than `opts.deadlineMs` / `opts.deadline` / `opts.targetMinutes`, adding it would finish at least 15% sooner, and its ledger can reserve the cost (plus `opts.budgetUsd` for the batch). A slow free slot holds back near the end of the queue (tail guard). **Tail hedging:** once the queue is empty, an idle slot re-issues the oldest in-flight item whose age is past its slot's p75 (fastest idle slot first, free before paid); the first valid result wins, the other copies are aborted, and an item has at most 2 extra copies. The report has per-slot counts, cost and the finish-time spread (first, p50, p90, last, and the spread of the last 10%).
- **Claude is not a pool helper.** The Anthropic slot is a last resort in `callHedged` (only after every free slot failed, only inside `data/anthropic-ledger.json`'s $24 stop) and takes nothing in a batch unless `opts.lastResort` is set.

### Which slots, per data class

| Class | Slots | Who may send to them |
|---|---|---|
| learner | the app's chain, in its order: NVIDIA (each model of the task's plan is a slot), local Ollama, Gemini free (once confirmed free), OpenRouter `:free` models (one slot each, $0 price cap), then Claude (paid, last resort) | any request. This is the default, and the only class a request with a user id can ever use. |
| pipeline | xKiro MiniMax M3.1 Flash (60M-token grant), xKiro Qwen3.8 Max and Mistral Large 3 (free plan, 500K tokens a day), UnoRouter `:free` models, and **Standard Compute** DeepSeek V4.1 Flash 1017 (paid, ledger-capped) | only a request with `dataClass: "pipeline"` **and no user id**, for a task whose `pool.tasks.<task>.allow` lists the slot, in a process that opted in (`XKIRO_PIPELINE=1`, `UNOROUTER_PIPELINE=1`, `STANDARD_COMPUTE_PIPELINE=1`; the app server sets none of them). |

LLM Gateway is not used for text (its credit is for Spanish speech). OpenRouter is never a paid slot.

### Rules enforced in code

- **Data:** a pipeline slot refuses any request that is not pipeline class (`refusal()` in pool.js), whatever the caller's lists say. Pipeline class needs `dataClass: "pipeline"` and no `userId`; a learner who has not consented to outside AI gets no outside slot at all. **Lesson writing:** a shared base level (no owner, "LEARNER: none") is written as pipeline class; a tailored level carries the learner's brief and stays on the app chain's learner-class slots. The pool does **not** strip a brief to send it on; it refuses instead. In the live app server (which sets no pipeline opt-in) every lesson write therefore uses the chain slots only; to let shared base levels use Standard Compute, the owner would start the server with `STANDARD_COMPUTE_PIPELINE=1` (not done).
- **Quality:** a slot outside the chain serves a task only if `pool.tasks.<task>.allow` lists it (glob on the slot id); `deny` removes a chain slot (Lightning for grading, blind MC and unit location, from the eval above). Task `allow` lists today: `night_write` / `night_judge` (xKiro MiniMax and Qwen, UnoRouter, Standard Compute), `night_read` (the same without Standard Compute), and `lesson_write`, `block_fill`, `block_layout`, `game_questions`, `author_items` (Standard Compute only: same family as the lineup's hard-tier head, no direct eval on lesson writing yet).
- **Spend:** Standard Compute only through `services/standard-compute-ledger.js`: `data/standard-compute-ledger.json`, **$15 total**, $0.50 already spent, each call reserves its worst case on disk first and is refused past the cap (`STANDARD_COMPUTE_CAP_USD` can only lower it). Its prices in the config (0.30 in, 1.20 out per Mtok) are an assumed upper bound; the API reports no cost. Anthropic only through `services/anthropic-ledger.js`.
- **Independence:** a request may carry `excludeFamilies` (for example the writer's family); no slot of that family serves it.

### Where it is wired

`services/ai.js` (every chain call), `services/block-levels.js` (level writes pass `dataClass`; the free-path fact reads and repairs go through the pool restricted to NVIDIA), `services/write-ahead.js` (how many levels are written at once follows the free parallelism, 4 to 8; each call inside a write is pooled), and the night runner through `curriculum-build/staged/night-runner/pool-batch.js` (`NIGHT_POOL=1` makes `core.write()` use the pool; `batch()` wraps `runBatch`; the runner's own lanes are unchanged when it is off). Env: `AI_POOL=0`, `POOL_TIMEOUT_MS`, `POOL_HEDGE_MIN_MS`, `POOL_HEDGE_MAX_MS`, `POOL_BUSY_WAIT_MS`, `POOL_BREAKER_THRESHOLD`, `POOL_BREAKER_OPEN_MS`, plus all the earlier overrides.

Tests: `node scripts/pool-test.js` (fake slots: work stealing vs a static split, hedging, hard timeout, paid slots idle under a met deadline, both ledgers stop at their caps, learner data never reaches a pipeline slot). `node scripts/pool-real-batch.js` runs 20 real short pipeline prompts through the free slots plus Standard Compute and compares them with the old path.
