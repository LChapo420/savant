# The optimal free system: this laptop, the free APIs, Claude last

Written 2026-10-23 for the owner's request: use local apps and models and every free API so the
Anthropic key is needed as little as possible, build most of the site to a perfect MVP with no false
information, and optimise everything to each learner across every subject.

Read with `MODEL-LINEUP.md` (the NVIDIA lineup, built in parallel) and `local-models/LOCAL-EVAL-REPORT.md`
(the measurements behind this page).

## The short version

1. **Where the money goes is fact research and fact checking, not writing.** Claude is used for
   researching each unit's facts with web search, reading every claim, the final rulings, and the third
   repair. Lessons are already written by free models.
2. **The biggest lever is offline sources, not a local LLM.** English Wikipedia (every article, text
   only, 49 GB) and English Wiktionary (9 GB, which also covers Spanish words) are now on this laptop.
   `kiwix-serve` serves them on 127.0.0.1:8090. The local fact checkers judge facts against them on the GPU
   for free. On 32 hand-labelled facts:
   - **True facts:** 10 of 17 got a source quote.
   - **False facts:** 15 of 15 were refused in the final run. An earlier run let one through, an
     Italian-word mix-up, and that has been fixed.

   This can replace Claude's web search for most encyclopedic facts, so Claude researches only the facts
   the offline sources cannot settle. It does not help with claims about a lesson's own examples; see
   section 3.
3. **Local LLMs on a 4 GB card are a support tier, not a replacement for NVIDIA.**
   - **The best local model.** `qwen3.5:4b` fits fully on the GPU (36 tokens/s, about 2 s per graded answer).
   - **Grading.** It graded typed answers with 0 false accepts but lower accuracy than the NVIDIA models
     (0.854 against 0.917 to 0.938).
   - **Unit placement.** It placed questions in units better than three of the six NVIDIA candidates.
   - **Blind multiple choice.** It was weaker (0.75 against 1.0).
   - **Its jobs:** embeddings, retrieval, a second opinion that costs no rate limit, and a free fallback
     before Claude when NVIDIA is down or rate-limited.
4. **Closed-book claim checking is near chance for every model** on the repo's labelled fact cases:
   balanced accuracy 0.50 to 0.60, NVIDIA's 550B Ultra and GLM 5.3 included. Checking claims without evidence
   does not work. Evidence (offline passages, the unit's sourced pool, code checkers) plus a strong reader
   is the design.
5. **Expected Anthropic use** falls from every lesson (about $0.47 to $1.86 each in thorough mode) to only
   the flags no free layer can settle. That is estimated at a 70 to 90% cut once integrated. The method is
   measured below; the end-to-end lesson number is not measured yet.

## 1. What this laptop can run (measured)

| Resource | Total | Already taken by | Left for local AI |
|---|---|---|---|
| GPU | RTX 3050 Laptop, 4 GB | Windows and the fact checkers' stage 1 (FactCG, MiniCheck) when loaded: about 0.6 GB | about 3.3 GB |
| RAM | 31.2 GB. **The owner's rule (2026-10-23): total system use at most 95%, so at least about 1.6 GB stays free, measured live.** This replaced the earlier 20 GB cap. | Other processes use about 20 GB: the fact checkers server holds 11.6 GB private (Granite Guardian 8B Q8 and HalluGuard 4B for stage 2), Docker's VM 4 GB, plus browsers and agents. | Measured free: 0.9 to 10 GB, swinging with other agents' work. The provider's memory guard keeps 1.6 GB free (`OLLAMA_RAM_HEADROOM_GB`). |
| CPU | Ryzen 9 6900HS, 8 cores / 16 threads. May run at 100%. | Tonight: other agents' Stockfish runs held it at 100%. Every CPU-side figure on this page was measured under that load. | Embeddings, kiwix-serve, stage 2 checkers |
| Disk | 554 GB free | | 62 GB used by the new sources and models |

Consequences, all measured on 2026-10-23:

- **Full GPU offload is a 4.4× speed-up.**
  - **What Ollama does by default.** Its automatic fit kept a 1.7 GB free-memory margin, put only 13 of
    33 layers of `qwen3.5:4b` on the GPU, and ran at 8 tokens/s.
  - **Forcing every layer onto the GPU.** With `num_gpu: 999` the whole model is on the card and runs at
    36 tokens/s.
  - **In the provider.** `services/providers/ollama.js` sends `num_gpu: 999` for any model whose weights
    fit `OLLAMA_GPU_GB` (3.6). If that load fails, it falls back to the automatic split.
- **Ollama 0.40.5's runner keeps a prompt cache in RAM of up to 8 GB.**
  - **What `server.log` shows.** It reads "cache state: 38 prompts, 8028 MiB (limits: 8192 MiB)". After
    200 eval prompts, the runner for a 3.3 GB model held 13.4 GB of private memory.
  - **What frees it.** Only unloading the model does. Ollama exposes no setting for it.
  - **In the provider.** It recycles a model after `OLLAMA_RECYCLE_PROMPTS` (40) calls, or after 10
    calls when free RAM is under `OLLAMA_MIN_FREE_GB` (2).
- **Big models do not fit next to the fact checkers**, even under the owner's raised limit (95% of RAM), because other processes use about 20 GB.
  - **Mixture-of-experts models.** `gemma4:26b-a4b` is 16 GB and `qwen3.6:35b-a3b` is 23 GB.
    `nemotron-3.5-lightning:30b-a3b` is 19 to 25 GB; it is the same model as NVIDIA's instant tier.
    These are the right shape for GPU plus RAM offload, because only 3 to 4B parameters are active per
    token. But with the fact server resident there are only 4 to 9 GB left.
  - **Dense 27B models.** The installed `qwen3.8:27b` (17 GB) would run at an estimated 2 to 3 tokens/s.
  - **What the provider does.** Its memory guard checks live free RAM before loading and refuses a model
    that would leave less than 1.6 GB free (it was tested and works).
  - **Idle models are released.** Models are kept loaded only 2 minutes (`OLLAMA_KEEP_ALIVE`; the
    embedder 5 minutes), so idle ones free their RAM.
  - **The 06:31 UTC breach.** Free RAM fell to 1.3 GB when an eval had left `qwen3.5:9b` loaded. The
    coordinator unloaded it. After that the default keep-alive was cut from 5 to 2 minutes.
  - **To run a MoE model locally:** first shrink the fact checkers' stage 2 (see section 8). Locally it
    would gain no accuracy over NVIDIA, which serves larger versions of the same families for free; it
    would only add capacity outside the rate limit.
- **`qwen3-embedding:0.6b` runs on the GPU unless a chat model is loaded there.**
  - **Why not always the GPU.** The two do not fit together on the 4 GB card, and swapping them made one
    retrieval take 47 s.
  - **Measured, 16 passages.** On the GPU: 1.2 to 1.8 s. On the CPU: 14 to 21 s, with the CPU at 100%
    from other agents.
  - **A full retrieval** (title lookup, search, article fetches, embedding) against all of Wikipedia
    takes 3.5 to 8 s cold. Article, search and title lookups are cached.

## 2. Research: what was chosen and why (with sources)

### Small local LLMs for 4 GB of VRAM

The candidates were the Ollama library's current small models
([qwen3.5 tags](https://ollama.com/library/qwen3.5/tags), [gemma4 tags](https://ollama.com/library/gemma4/tags),
[nemotron-3-nano tags](https://ollama.com/library/nemotron-3-nano/tags),
[phi4-mini tags](https://ollama.com/library/phi4-mini/tags)). Third-party guides agree that about 3 GB of
weights is the practical ceiling for a 4 GB card, with Qwen 3.x 4B and Phi-4 Mini the usual picks
([promptquorum](https://www.promptquorum.com/prompt-bites/best-ollama-models-4gb-vram),
[localaimaster](https://localaimaster.com/vram/best-ollama-models-4gb-vram)).

| Model | Size | License | Why tried |
|---|---|---|---|
| `qwen3.5:4b` (Q4_K_M) | 3.3 GB | Apache-2.0 | Newest small Qwen. Thinking switch, 256K context, fits the card. |
| `nemotron-3-nano:4b` (Q4_K_M) | 2.8 GB | NVIDIA Open Model License | The small sibling of the NVIDIA models in the lineup. |
| `gemma4:e4b-it-qat` (Q4_0, QAT) | 6.1 GB | Apache-2.0 | Strongest "effective 4B". Too big for the card, so split with RAM. |
| Phi-4 Mini 3.8B | 2.5 GB | MIT | Not pulled: older than Qwen 3.5 4B and without its thinking mode. |
| MoE: `gemma4:26b-a4b`, `qwen3.6:35b-a3b`, `nemotron-3.5-lightning:30b-a3b` | 16 to 25 GB | | Not pulled: they do not fit next to the fact checkers (section 1). |

### Embeddings and reranking

- **Embedder: `qwen3-embedding:0.6b`** (Apache-2.0, 639 MB) in Ollama. It is small enough to run on the
  CPU, multilingual (English and Spanish), and has a 32K context.
- **Reranker: `Qwen/Qwen3-Reranker-0.6B`** (Apache-2.0, 1.2 GB,
  [model card](https://huggingface.co/Qwen/Qwen3-Reranker-0.6B)) is the optional next step. Published
  results conflict with `bge-reranker-v2-m3`: Qwen's own tables put Qwen3-Reranker ahead on multilingual
  sets ([Qwen3 Embedding paper](https://arxiv.org/pdf/2506.05176)), while a third-party BEIR table puts
  bge ahead on English ([Querit-Reranker paper](https://arxiv.org/pdf/2606.19037)).
- **Not installed yet.** Here the final judge is FactCG and MiniCheck, which are NLI checkers built for
  exactly the question "does this passage state this claim?". A reranker only decides which 4 passages they
  read, and embedding plus word-overlap ranking already found the right passage in every test so far.

### Offline fact sources

| Source | Size | License | Status |
|---|---|---|---|
| `wikipedia_en_all_nopic_2026-06.zim` (every English article, no images) | 49 GiB | Wikipedia text is CC BY-SA 4.0 (and GFDL) ([Wikimedia terms](https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use)) | Installed, checksum verified |
| `wiktionary_en_all_nopic_2026-08.zim` | 8.5 GiB | CC BY-SA 4.0 | Installed, checksum verified |
| kiwix-tools 3.8.1 (`kiwix-serve`) | 18 MB | GPL-3.0, run as a separate local server, not linked into the app | Installed |
| Wikidata | | CC0 ([licensing](https://www.wikidata.org/wiki/Wikidata:Licensing)) | Not downloaded (the dump is over 100 GB). Use the free public query service for structured figures (dates, populations, chemical data), cached. Limits: 60 s a query, 5 parallel queries, a descriptive User-Agent required ([WDQS manual](https://www.mediawiki.org/wiki/Wikidata_Query_Service/User_Manual)). |
| Topic ZIMs (`wikipedia_en_mathematics`, `physics`, `medicine`, `history`, and others) | 0.3 to 1 GB each | CC BY-SA | Not needed: the full Wikipedia contains them |

Listing and checksums are from [download.kiwix.org](https://download.kiwix.org/zim/wikipedia/). The ZIMs carry a
Xapian full-text index; `kiwix-serve` exposes `/search` (full text, `format=xml`), `/suggest` and the
article content ([kiwix-serve docs](https://kiwix-tools.readthedocs.io/en/latest/kiwix-serve.html)).

**What the license means for us:**

- Checking our own sentences against Wikipedia is fine.
- If a lesson shows a Wikipedia passage to learners, it needs attribution and that excerpt stays
  CC BY-SA.
- So pools store the public article URL (`https://en.wikipedia.org/wiki/...`) as `source_url`.

**Monthly refresh:** Kiwix publishes a new ZIM about every 3 months. There are no incremental updates, so
refreshing means downloading the whole file again (49 GB, about 30 minutes at the measured
10 to 32 MB/s).

### Self-hosted metasearch (SearXNG): not installed

- **Google.** SearXNG works by sending automated queries to search engines. Google's terms forbid
  "using automated means to access content from any of our services in violation of the machine-readable
  instructions on our web pages", for example robots.txt files that disallow crawling
  ([Google Terms](https://policies.google.com/terms)), and google.com/robots.txt disallows `/search`.
- **Brave.** Its free API tier was replaced in 2026 by monthly credits that need a card
  ([agentdeals](https://agentdeals.dev/vendor/brave-search-api)).
- **So:** no scraping metasearch. Facts that Wikipedia, Wiktionary, Wikidata and the code checkers
  cannot settle go to Claude's web search, which is licensed. That is the remaining Claude use, by design.

### Faster decoding and caching

- **Speculative decoding, or MTP (multi-token prediction).**
  - **Where it exists.** llama.cpp supports MTP heads (`--spec-type draft-mtp`), and Ollama ships `-mtp`
    tags, but only for the 27B and 35B Qwen models
    ([llama.cpp MTP write-up](https://victor-mtp-on-hf-endpoints.static.hf.space/index.html)). Reported
    gains are 1.1 to 2×, depending on the text.
  - **Why it is skipped here.** A 4B model already fully on the GPU is not decode-bound for our short
    structured answers (a grading answer is about 40 tokens, about 1 s). Revisit only if a MoE model is
    run locally.
- **Prompt-prefix caching** is automatic in the llama.cpp runner (`prompt_save` in the log), and it is what
  fills the 8 GB RAM cache above.
  - **Where it pays off.** Put the stable parts first: the system prompt, schema, and lesson or unit
    context. Put the per-item part last. The eval prompts already do this.
  - **How it repeats.** In the same process, the shared prefix is reused.
- **Batching.**
  - **The trade-off.** `OLLAMA_NUM_PARALLEL` (default 1) multiplies the KV cache by the number of slots
    ([Ollama FAQ](https://docs.ollama.com/faq)). On a 4 GB card holding 3.3 GB of weights there is no
    room for more slots.
  - **What is used instead.** The provider queues requests, one at a time, interactive work first.
  - **Optional server settings** (the owner's user environment, then restart Ollama):
    `OLLAMA_FLASH_ATTENTION=1` and `OLLAMA_KV_CACHE_TYPE=q8_0` halve the KV cache. They were not set here,
    because they are machine settings.
- **Result caching** is the large win: verified claims, retrieval results and verified lesson variants
  (section 6).

## 3. Benchmarks: local against NVIDIA, on the same labelled cases

`scripts/local-model-eval.js` loads the task definitions from `scripts/model-lineup-eval.js` itself. It
uses the same cases (same seeds, same `--n`), the same prompts and schemas, and the same scoring. It reads
the NVIDIA answers from that eval's cache, so it makes no NVIDIA calls. Full tables:
`local-models/LOCAL-EVAL-REPORT.md`.

All figures are on the full case sets (48, 48, 40, 30 and 40 cases).

- **Headline metric:** accuracy, or balanced accuracy where the task has one (keys, facts).
- **Latency:** the median per call. NVIDIA's includes queueing under its 40 RPM tier. Local is one call at a
  time on this laptop, with the CPU loaded by other agents.

| Model | Typed grading (false accepts) | Blind MC | Answer-key judging | Unit placement | Claim check (closed book) | Latency, tokens/s |
|---|---|---|---|---|---|---|
| NVIDIA GLM 5.3 @max | **0.938** (0) | **1.0** | 0.975 | 0.767 | 0.575 | 51 to 125 s |
| NVIDIA Ultra @medium | 0.917 (0) | **1.0** | **1.0** | **0.9** | 0.55 | 8 to 26 s |
| NVIDIA Lightning @off | 0.917 (1) | 0.833 | 0.975 | 0.4 | 0.525 | 2 to 4 s |
| NVIDIA DeepSeek V4.1 Flash @high | 0.771 (0) | 0.875 | 0.5 (22 failed calls) | 0.8 | **0.6** | 72 to 112 s |
| **local qwen3.5:4b, thinking off** | 0.854 (**0**) | 0.75 | **1.0** | 0.8 | 0.5 | **1.6 to 8.7 s, 25 to 36 tok/s** |
| local nemotron-3-nano:4b, off | 0.896 (**5**) | 0.438 | 0.85 | 0.533 | 0.425 | 1.9 to 5.6 s, 30 to 32 tok/s |

**Bigger local models, measured after the owner raised the RAM limit:**

- **`qwen3.5:9b`** (6.6 GB, Apache-2.0, pulled for this test):
  - **Speed.** It fits only partly on the 4 GB card. Ollama's own fit put 3 of 33 layers on the GPU
    (2.6 tok/s). Forcing 14 layers gave 3 to 4.3 tok/s with the CPU at 100% from other work, and
    9 to 53 s per answer.
  - **Accuracy on the 12-case subsets**, against `qwen3.5:4b` on the same cases:

    | Task | qwen3.5:9b | qwen3.5:4b |
    |---|---|---|
    | Grading | 0.917 (0 false accepts) | 0.917 (0 false accepts) |
    | Blind multiple choice | 0.917 | 0.917 |
    | Key judging | 0.833 | 1.0 |
    | Unit placement | 0.917 | 0.833 |
    | Claim check | 0.417 | 0.417 |

  - **Decision.** About 10x slower for no clear gain, so it is installed but not used.
- **`gemma4:e4b-it-qat`** (6.1 GB): 81% on the CPU, 4.1 tok/s, about 15 s an answer. It was stopped after
  5 answers and not used.
- **MoE models (16 to 25 GB)** still do not fit. Measured free RAM tonight was 0.9 to 10 GB.

**What the numbers say:**

- **`qwen3.5:4b` is the local model.**
  - **Grading.** It never accepted a wrong typed answer (0 of 34). That makes it a safe free fallback
    for grading, though it is less accurate overall.
  - **Key judging.** It equals the best NVIDIA model on answer-key judging, in about 9 s.
  - **Unit placement.** It places questions in units better than GLM 5.3 and Lightning.
- **Nemotron Nano 4B is not safe for grading.** It accepted 5 wrong answers.
- **Nobody checks claims well closed-book.** The best is 0.6 balanced, which is why evidence matters
  (below).
- **`config/local-lineup.json`** (written by `--write`):
  - **`first`:** `placement_key_judge` (offline scripts).
  - **`fallback`:** `grade_free_response`, using `qwen3.5:4b` only.
  - **Ranking rule.** A model is ranked only if it answered every case. For grading, fewest false
    accepts comes first, and a model with more false accepts than the NVIDIA winner is never listed.

**Agreement cascades** (from the two caches, no new calls): two fast models answer; if they agree, take
it, and otherwise ask GLM 5.3 at max.

| Task | Pair (agree, so accept) | Agreed | Right when agreed | Cascade accuracy | Sent to GLM 5.3 |
|---|---|---|---|---|---|
| Grading | local qwen 4B + Lightning | 41/48 | 39/41 | 0.917, 0 false accepts | 7 |
| Grading | Lightning + Ultra | 42/48 | 41/42 | **0.938, 0 false accepts** | 6 |
| Blind MC | local qwen 4B + Ultra | 36/48 | **36/36** | 1.0 | 12 |
| Unit placement | local qwen 4B + Ultra | 22/30 | 21/22 | **0.9** | 8 |

**What the cascades show:**

- **Grading.** Pairing two NVIDIA judges is best. Adding local saves one NVIDIA request per answer at a
  small accuracy cost.
- **The grading plan in `NIGHT-2026-10-23.md`.** Rules first, then two free judges, with GLM 5.3 on
  disagreement. That gives 0.938 with 0 false accepts on 48 cases, and only 6 in 48 escalated.
- **Local as the second judge.** It is the free choice when NVIDIA is rate-limited, because it alone
  never false-accepted.

### Grounded checks: what offline evidence does and does not do (measured)

**1. Building a fact pool (encyclopedic facts).**

- **The probe.** `services/offline-pool.js` was run on 32 hand-labelled facts
  (`local-models/pool-probe-facts.json`): 17 true and 15 false, across chess, piano, basketball,
  Spanish, science, history, math and English. Labels are by this agent: well-known facts and
  deliberate falsifications.
- **Stage 1 alone** (FactCG and MiniCheck both at 0.5 or above):
  - **True facts:** 10 of 17 were sourced.
  - **False facts:** 15 of 15 were refused, so 0 false facts got a source.
- **A second run found a failure.** One false fact got a source: "Librería means library" was matched
  to Venice's Italian "Libreria Sansoviniana".
- **The fix.** A drafted article that is a single lowercase word ("librería") now looks only in
  Wiktionary.
- **Final run, with the fix:** 10 of 17 true facts sourced, 15 of 15 false facts refused, 0 false
  sourced. That is 74 s per fact, under full CPU load.
- **Stage 2 tie-break: built but not measured.** Granite and HalluGuard are asked only when FactCG and
  MiniCheck split.
  - **What happened.** Its first try failed on Node's 300 s fetch limit, which is now fixed by using
    `http`. On the second try the fact-checker server's stage 2 did not answer within 30 minutes, with
    the CPU at 100% from other agents.
  - **What a failure does.** It fails safe: the split facts stay unsourced.
  - **Measure it on a quiet CPU** before relying on it. `OFFLINE_POOL_STAGE2=0` turns it off.
- **Why unsourced true facts are safe.** The 7 true facts left unsourced (for example the rook along
  ranks and files, 88 piano keys, a haiku's 5-7-5) are where stage 1 split. They are not lost: they go to
  the paid researcher, one by one, with a few searches.
- **Speed.** About 7 s per fact for retrieval plus stage 1, under full CPU load. Stage 2 adds 10 to 90 s
  per split fact.

**2. Checking claims from finished lessons (the 40 labelled fact cases, with Sonnet's verdicts).**

- **The result.** Offline evidence did not help:
  - **A local model reading the retrieved passages** scored 0.45 to 0.475 balanced.
  - **FactCG and MiniCheck on the passages** "supported" 1 of 20 true claims and 0 of 20 false ones, so
    they flagged nearly everything.
- **Why.** These claims are about the lesson's own examples, which no encyclopedia states (section 5).
- **How to use them.**
  - **"Supported" is reliable positive evidence.** No false claim was supported.
  - **"Unsupported" carries no information** for lesson claims. It must never be read as an error flag,
    or every lesson would be flagged.

## 4. Which tier does what

Tiers, cheapest first:

- **Code:** deterministic checks.
- **Local:** this laptop.
- **NVIDIA:** the free lineup, about 40 requests a minute.
- **Jev:** $0.13 in total, through its ledger.
- **Claude:** the Anthropic key, last.

### In the app (a learner is waiting)

| Work | Tier, in order | Why |
|---|---|---|
| Typed-answer grading | rules (`grading.js`), then NVIDIA (lineup winner), then **local `qwen3.5:4b` as fallback**, then Claude | Local is 0.854 with 0 false accepts in about 2 s. It is good enough to keep grading going when NVIDIA is rate-limited, and better than paying. Optional: run local in parallel as a veto, and escalate when local says "wrong" but NVIDIA says "right". This is the only way a false accept gets through, and it costs no rate limit. |
| Coach, tutor, help chat | NVIDIA light (Ultra), then Claude | A 4B coach is too weak to be the free fallback for a children's tutor. When NVIDIA is down, serve the lesson's own verified explanation (retrieved by embedding from the lesson) before paying. |
| Spanish partner turn and reactions | NVIDIA instant or light | Latency. Local `qwen3.5:4b` is an option offline, not measured for Spanish dialogue. |
| Blind check of a quiz (fact cascade step 3) | NVIDIA Ultra (1.0 on 48 cases) | Local 0.75: not used. |
| Embeddings: similar items, duplicate questions, misconception matching, cache lookups | **Local, always** | Free, private: about 0.1 to 2 s a batch on the GPU. |
| Personalised rewrite of a level | NVIDIA hard tier, checked locally (section 6) | The rewrite's claims are checked against the verified base lesson by FactCG and MiniCheck, so no Claude is needed. |
| After-level read, recommendations | NVIDIA fast_thinking | The scorecard maths is code; the read is judgement. |

### In the build pipeline (no one is waiting)

| Work | Tier, in order | Why |
|---|---|---|
| Unit fact pool (today: Claude with 10 web searches) | **NVIDIA GLM 5.3 drafts the facts, offline Wikipedia and Wiktionary retrieve the passages, and local FactCG and MiniCheck source them** (`services/offline-pool.js`). Only the facts left unsourced go to Claude research, with a few searches. | The main cost lever. |
| Claim listing (`fact_claims`) | NVIDIA light, then local fallback | Extraction. Local generates 25 to 30 tokens/s, so a long claim list takes 10 to 20 s per block. That is no faster than NVIDIA; local is for availability when NVIDIA is rate-limited, not for speed. |
| Grounded claim check | Code checkers, then local NLI against the unit pool plus offline passages, then NVIDIA hard reader on what stays unsupported | Section 5. |
| Whole-lesson read (contradictions, keys) | NVIDIA hard (GLM 5.3 or DeepSeek, by the lineup eval) | Needs a strong reader. No local model is close. |
| Repairs | NVIDIA hard twice, then Claude | As today. |
| Final ruling on remaining flags | **Claude, only these**, with the offline evidence attached | What no free layer could settle. |
| Placement unit judging (offline scripts) | NVIDIA Ultra, with local `qwen3.5:4b` as a free second opinion (0.8, ahead of 3 NVIDIA candidates) | |
| Jev | Off everywhere | The lineup eval enables Jev only where it strictly beats every free model, and on these tasks it did not. |

## 5. Retrieval-grounded fact checking against offline sources

Each claim (or drafted fact) goes through four steps:

1. **Code checkers first.** A chess move's legality, a chord's notes, a play's geometry and arithmetic:
   `services/chess-checks.js`, `piano-checks.js`, `basketball-checks.js`. Where code can decide, no model
   is asked.
2. **Retrieval** (`services/offline-facts.js` `retrieve(claim, { topic })`). Measured: 3.5 to 8 s cold,
   under full CPU load.
   - **Titles first.** Kiwix's title index (`/suggest`) is asked for the topic, quoted terms, names and
     word pairs. A title naming the topic wins: "pivot foot" finds "Pivot foot", and the topic "chess rook"
     finds "Rook (chess)". Redirects are followed.
   - **Then full-text queries.** Kiwix ANDs every word, so the most specific words go first (quoted, names,
     numbers, long words), relaxed from 4 words to 2, plus one query with the lesson topic.
   - **Passages.** Articles are split into passages of 2 to 4 sentences and ranked by word overlap, then
     re-ranked by `qwen3-embedding` cosine (65/35).
3. **Local NLI** (`tools/fact-checkers/server.py`):
   - **Stage 1.** FactCG and MiniCheck on the GPU, on the best passages plus the unit pool's quotes. Both
     at 0.5 or above means supported, and the passage becomes the evidence.
   - **Stage 2.** Granite Guardian and HalluGuard, only on what stage 1 doubts.
4. **What is still unsupported** goes to the NVIDIA hard reader with the passages attached. It is not a
   verdict on its own, because closed-book checking is near chance (section 3). Whatever stays flagged goes
   to the final ruling (Claude), with the passages attached, so it needs fewer searches.

**Where offline sources do not help:**

- **The known errors.** In the labelled fact cases, the known errors are mostly imprecise wording about the
  lesson's own examples. Examples: "rolls up the whole file" for d4 to d8, and "diagonals belong to the
  bishop" while forgetting the queen.
- **Why no source covers them.** No encyclopedia sentence covers such claims; that is why the 2026-10-21
  cascade caught only 18 of 50 known errors.
- **What does catch them.** Code checkers (geometry, notes), the blind test, and a strong whole-lesson
  reader. Offline sources cover the encyclopedic half: definitions, rules, names, dates, figures and
  vocabulary. For that half they replace web search.

## 6. Verification layers, so nothing false ships

Each layer only passes work forward; the gate stays as it is (a level is served only when verified).

1. **Fact pool, sourced before writing.** Every fact the writer may use has an offline (or Claude-found)
   source quote. Unsourced facts are not given to the writer as facts.
2. **Code checks** on every example that code can decide.
3. **Claim listing** (NVIDIA light).
4. **Grounded NLI** against the pool plus offline passages (local, free).
5. **Blind test** (NVIDIA Ultra, 1.0 measured). A key the model does not reproduce is a flag.
6. **Whole-lesson read for contradictions** (NVIDIA hard), until a read is clean.
7. **Final ruling on remaining flags** (Claude, with evidence attached). Confirmed errors are repaired;
   anything still uncertain is removed, not served.
8. **After serving:**
   - **Item statistics.** A question many strong learners miss, or one with a second answer that many
     choose, is re-queued for verification. This is free and measured from the existing
     `level_logs`/sessions.
   - **Learner reports.** Any learner report re-queues the item too.

**Personalised rewrites** never add unverified facts:

- **How they are checked.** Each factual sentence of a rewrite must be entailed by the verified base
  lesson. FactCG and MiniCheck run locally with the base lesson as the document.
- **If one fails.** The sentence is dropped or the base wording is used. No Claude is involved.

## 7. Caching and sharing verified work

| Cache | Key | Reuse |
|---|---|---|
| Verified base lesson (exists: `block_plans` with `verification`) | subject, grade, level | Every learner |
| Unit fact pool (exists: `fact_pools`) | `track:grade:unitStart` | Every level in the unit |
| **Claim verdicts (new)** | Normalised claim text hash; also an embedding (cosine 0.95 or above), confirmed by NLI both ways | The same claim in another lesson, grade or rewrite is not re-checked. Many claims recur ("the rook moves along ranks and files"). |
| **Retrieval (new)** | claim → passages | In memory now; persist next to the pool. |
| **Verified variants (new)** | level plus a profile bucket (the top 3 scorecard directives) | Learners with similar profiles share one verified variant. Fully individual rewrites go to paid tiers only; they are checked locally (section 6), so they cost NVIDIA time, not Claude. |

## 8. Per-learner optimisation across every subject, on this stack

- **No model in the scorecard.** The 100-stat scorecard, standings and directives are deterministic code
  (`services/scorecard/*`, `docs/SCORECARD.md`).
- **Local embeddings do the matching work.**
  - **Misconceptions.** A learner's wrong answers and coach messages are matched, by nearest neighbour,
    to the unit pools' `misconceptions` lists.
  - **Similar items across subjects.** Embeddings also find items that train the same skill in another
    subject.
  - **Cost.** All of this is free, instant and private, with no rate limit.
- **NVIDIA does the judgement.**
  - **Reading and rewriting.** It reads the after-level evidence and rewrites the level from the
    learner's directives.
  - **Checking a rewrite.** The rewrite is checked locally against the verified base, as in section 6.
- **Reuse comes from the variant cache.**
  - **Profile buckets.** It makes per-learner tailoring affordable: most learners get an
    already-verified variant for their profile bucket, and only unusual profiles need a new rewrite.
  - **Tokens.** This also matches "the fewest tokens that get that result" (`docs/PRODUCT-DECISIONS.md`).

## 9. Anthropic key use, before and after

| Step, per lesson | Before (thorough mode) | After (this design) |
|---|---|---|
| Fact research | Claude Sonnet, up to 10 web searches, per level or unit | NVIDIA draft, offline sources and local NLI. Claude only for the unsourced facts. |
| Reading every claim | Sonnet, up to 3 full reads, 10 searches each | NVIDIA hard reads, grounded NLI, blind test |
| Repairs | NVIDIA twice, then Sonnet | Unchanged |
| Final ruling | Sonnet | Sonnet on the remaining flags only, with evidence |
| App fallback | Claude when NVIDIA fails | Local fallback (grading, placement), then Claude |
| Cost | $0.47 to $1.86 a lesson (measured, 3 lessons) | **Estimate: $0.05 to $0.30 a lesson, a 70 to 90% cut** |

**How the after-figure is estimated:**

- **Research.** Encyclopedic facts are sourced offline; in tests the true facts were sourced and the false
  ones refused.
- **Escalation.** Escalation drops to flags only.
- **Not yet measured end to end.** The next step is to run `FACT_PIPELINE=freefirst` with the offline
  pool on the three original test lessons, and audit them as on 2026-10-21. Keep the change only if the
  audit still finds 0 or 1 problem left per lesson.

## 10. Integration steps for the lead

**Status, 2026-10-23:**

- **Done by the lead:** `providers/index.js` has `ollama` in the chain nvidia → ollama → gemini_free →
  openrouter_free → anthropic.
- **Done by this agent:**
  - The fact-cascade and block-levels steps below.
  - The offline-first wrapper is `offline-pool.offlineFirst`.
  - The offline evidence is a second chance that can only clear a claim, never flag one.
  - Tests: `scripts/offline-integration-test.js`.
- **Everything is off unless `FACT_POOL=offline`.**
- **Backups** are in the scratchpad's `before-offline-integration/`.


Do these after the lineup agent finishes. Nothing below has been changed in those files.

**Start-up:**

1. **Start Ollama** (it is already running) and kiwix-serve:
   `tools\offline-sources\start-kiwix.bat` (or `.sh`). It serves every ZIM that `download.sh` verified, on
   127.0.0.1:8090.
2. **Start the fact checkers** (unchanged): `..\fact-venv\Scripts\python.exe -I tools/fact-checkers/server.py`
3. **Write the local lineup:** `node scripts/local-model-eval.js --report --write --tasks grading,blind,keys,units,facts,facts_rag,facts_nli` writes
   `config/local-lineup.json` from the measured results. Re-run the eval after any model change.
   - **What it writes.** Per task, which local models answer.
   - **`first`.** Local goes before NVIDIA. Today that is `placement_key_judge` (offline scripts).
   - **`fallback`.** Local goes after NVIDIA and before Claude.

**`services/providers/index.js`:**

```js
const ollama = require('./ollama');
const ALL = { nvidia, mimo, openrouter, gemini, anthropic, modelflare, ollama };
// order(role) -> order(role, task); current(role, task) and the "every provider" function pass task through.
// In order(), for every non-placement role, after `if (!list.includes('nvidia')) list.push('nvidia');`:
if (ollama.takesFirst(task)) list.unshift('ollama');   // measured as good as NVIDIA: local first
else list.push('ollama');                               // isEnabled(role, task) is false unless the task is a measured fallback
// then, as now: if (anthropicAllowed()) list.push('anthropic');
```

`ollama.isEnabled(role, task)` is true only when the server answered and the task is in
`config/local-lineup.json` `first`/`fallback` (or `OLLAMA_FALLBACK_ALL=1`). So listing it everywhere is safe:
it answers nothing it was not measured for.

**`services/fact-cascade.js`:**

- **`unitPool`.** Before `blockLevels.researchFacts(...)`:

  ```js
  const pool = await require('./offline-pool').buildUnitPool({ context, coverage, maxFacts: 45 }).catch(() => null);
  let sheet = pool;
  if (pool && pool.offline.unsourced) {
    // Only the facts the offline sources could not settle go to the paid researcher.
    const rest = await blockLevels.researchFacts({ context, coverage: pool.facts.filter((f) => f.unsourced).map((f) => f.fact), maxFacts: pool.offline.unsourced, maxSearches: 4 });
    if (rest) sheet = { ...pool, facts: [...pool.facts.filter((f) => !f.unsourced), ...rest.facts], cost: rest.cost, searches: rest.searches };
    else sheet = { ...pool, facts: pool.facts.filter((f) => !f.unsourced) };   // unsourced facts are not given to the writer
  }
  if (!sheet) sheet = await blockLevels.researchFacts({ context, coverage, maxFacts: 45, maxSearches: 10 }); // as today
  ```

  Gate this behind `FACT_POOL=offline` first, and compare pools on a few units.
- **`documentFor(claim, poolRow)`.** Make it async and append offline passages:

  ```js
  const off = await require('./offline-facts').documentFor(claim, { topic: poolRow.topic || '' });
  return [poolDoc, off.doc].filter(Boolean).join('\n');
  ```

  Then `await Promise.all(...)` where it builds `pairs` (around lines 369 and 513).
- **`cheap()`.** When NVIDIA returns null and before `haikuFallback`:

  ```js
  const local = require('./providers/ollama');
  if (local.isEnabled('check', task)) { const r = await local.structured({ role: 'check', task, system, user, schema, schemaName, maxTokens: 8000 }).catch(() => null); if (r && r.data) return { data: r.data, cost: 0, model: r.model }; }
  ```

**`services/block-levels.js`** (line 1937, the per-level research outside the cascade): the same
offline-first wrapper as `unitPool`.

**`services/grading.js`** (optional veto): after the model grade says correct, ask
`ollama.structured({ task: 'grade_free_response', ... })` in parallel. If local says wrong, re-ask the
lineup's hard model. This needs no index.js change.

**Environment** (all optional; the defaults are the measured ones):

`OLLAMA_ENABLED`, `OLLAMA_BASE_URL`, `OLLAMA_GPU_GB=3.6`, `OLLAMA_MAX_MODEL_GB=18`,
`OLLAMA_RAM_HEADROOM_GB=1.6`, `OLLAMA_MIN_FREE_GB=2`, `OLLAMA_RECYCLE_PROMPTS=40`, `OLLAMA_KEEP_ALIVE=2m`, `OLLAMA_EMBED_MODEL`,
`OLLAMA_EMBED_GPU` (unset means the GPU unless a chat model is loaded), `OLLAMA_TASK_<TASK>=model@effort`, `OLLAMA_FALLBACK_ALL`, `KIWIX_URL`,
`KIWIX_BOOKS`, `OFFLINE_FACTS_EMBED`.

**Tests:** `node scripts/ollama-provider-test.js`. It mocks HTTP and covers 17 checks: format/think,
repair, no-think retry, GPU layers, memory guard, unsafe-model refusal and task gating.

**To free RAM for a local MoE model later:**

- **Option 1.** Load the fact checkers' stage 2 on demand and unload it when idle.
- **Option 2.** Swap Granite Guardian 8B Q8 (about 8.5 GB) for its Q4_K_M (about 4.9 GB).

That is a change to `tools/fact-checkers/server.py`, which belongs to the fact-check work; measure its
stage-2 agreement before switching.

## 11. What was installed (official sources only)

| What | Source | Size |
|---|---|---|
| `qwen3.5:4b` | Ollama library (ollama.com/library/qwen3.5) | 3.3 GB |
| `nemotron-3-nano:4b` | Ollama library | 2.8 GB |
| `gemma4:e4b-it-qat` | Ollama library | 6.1 GB |
| `qwen3-embedding:0.6b` | Ollama library | 639 MB |
| `qwen3.5:9b` | Ollama library (tested, not used: see section 3) | 6.6 GB |
| kiwix-tools 3.8.1 for Windows x86_64 (`kiwix-serve`, `kiwix-search`, `kiwix-manage`) | download.kiwix.org/release/kiwix-tools (md5 verified) | 18.3 MB zip, in `folderThing/local-tools/kiwix-tools` |
| `wiktionary_en_all_nopic_2026-08.zim` | download.kiwix.org (sha256 verified) | 9.16 GB, in `folderThing/offline-sources` |
| `wikipedia_en_all_nopic_2026-06.zim` | download.kiwix.org (sha256 verified) | 52.7 GB, in `folderThing/offline-sources` |

**Not used, and blocked in the provider:** the abliterated and derestricted models already on the
machine (Qwen3.8-27B "abliterated", Llama-3.1-8B "abliterated", gpt-oss "derestricted"). The provider
refuses any model whose name says abliterated, derestricted, uncensored, jailbreak or nsfw, whatever the
configuration says.

## Files

**New** (no existing file was edited):

- `services/providers/ollama.js`: the local provider.
- `services/offline-facts.js`: retrieval from the offline sources.
- `services/offline-pool.js`: the offline unit fact pool.
- `scripts/local-model-eval.js`: the eval.
- `scripts/ollama-provider-test.js`: the provider tests.
- `tools/offline-sources/start-kiwix.sh` and `.bat`: start kiwix-serve.
- `curriculum-build/local-models/`: the report, the cache and the retrieval cache.
- `config/local-lineup.json`: written by `--write`.

**Outside the repo:** `folderThing/offline-sources/` (the ZIMs and `download.sh`) and
`folderThing/local-tools/kiwix-tools/`.
