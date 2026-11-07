# Closest to guaranteed facts, cheaply (7 Nov 2026)

Owner: "try as hard as you can to figure out a way that either guarantees or closest to guarantees 100% factuality that is cheap", and "it shouldn't be flagging anything that is fine".

All numbers are AI-judged on planted errors and stored text. None is real-learner proof. Everything here is behind switches, off by default, and no live path calls it. Nothing was pushed, merged or written to a live database.

## Answer

**A true 100% can't be had, and nothing here should claim it.** What works is a split:

1. **Each shared level is checked once, heavily:** Kimi K3.1 Pro and grok-4.3 read it, SymPy recomputes the math, and a flag stands only if three model families believe it. Otherwise the part stays and the flag goes to a log.
2. **Its facts freeze into a bank.** Every personal rewrite is checked against that bank: new numbers, names and formulas are rejected by code, and each sentence is compared with the facts it rests on.

| | Held-out catch | False alarms | $ | Time |
|---|---|---|---|---|
| **Shared level, once** (Kimi + grok-4.3, three families) | **70/82 = 85% (76-91)** | **4/52 clean levels = 8% (3-18)**; read by hand: 1 clearly false, 1 debatable, 2 real | **about $0.096 a level** | about 2 min, background |
| Same readers, no confirm step | 71/82 = 87% | 10/52 = 19% | $0.083 | |
| **Personal rewrite, each learner** (added errors only) | **74/82 = 90% (82-95)** | **4 of 1,037 sentences = 0.4%; 2 of 20 rewrites**, all 4 false | about $0.004 a rewrite | about 35 s on 8 CPU threads, background |
| **Part read, learner waiting** (GLM-5.3 Flash + DeepSeek, three families) | 44/48 = 92% (80-97), single-block plants only | 0/104 clean parts (0-4) | about $0.002 a part | 18 s read, 13 s more when flagged |

The new held-out set is harder than the old one. Against the old gate's 96%, Kimi + grok-4.3 with no confirm step reads 87-89% here (87% merged, 89% unmerged). Misleading simplifications are now 22/29 = 76% (was 3/7), wrong-but-plausible facts 39/43 = 91%.

**Estimated errors left, per level:** 0.14 (0-0.33) by a fresh reader, 0.37 to 0.46 (0.01-0.86) corrected for overlapping misses. Before repair, the English levels hold about 3.7 a level. All of these rest on models, so an error every model believes is invisible.

**The biggest finding is the gap between planted and real errors.** On real confirmed errors cheap readers catch 14-40%, where on plants they catch 51-82%. Kimi holds 94% of a list it mostly made, and a fresh reader puts the audit's recall at 87% (74-100). **Don't replace Kimi with cheap readers on shared levels on the strength of planted numbers.**

## What can be claimed

| Content | Guarantee it can carry | Share measured | What it can't say |
|---|---|---|---|
| Sums, steps, numeric keys, stated algebra and calculus | **Recomputed**: SymPy worked out the statement as transcribed | 12% of pilot facts; 20% of math claims are of this type; about 30 statements a math level, 88% decidable | That the transcription is faithful or complete, or that the set-up is right. A wrong formula used consistently recomputes "correctly" |
| Spanish word meanings and forms | **Sourced**: a Wiktionary passage is named and quoted | Spanish claims with a passage: 43-47% | A dictionary can be wrong or gloss loosely |
| Rules, definitions, facts | **Sourced where a passage exists**, otherwise "two independent readers found nothing wrong" | English 20%, algebra 35%, calculus 27%, chess 23%, piano 6%, basketball 0% | That the source is right, or that a true sentence isn't misleading |
| Personal rewrite: numbers, years, names, formulas, marked foreign words | **Nothing outside the verified facts**, checked by code on every rewrite | Every such token, when the check is on | Meaning. Swapping cause and effect uses the same words; only the sentence comparison sees that, at about 90% |
| Personal examples between `[[eg]]` marks | **Can't add a year, an outside name or a general claim** (pattern check) | All marked examples | An example can still misapply a rule: one writer's example of Spanish surnames did |
| Everything else | **Checked**, with an estimated remaining error rate | About 66% of pilot facts have only this | Nothing stronger |

**Can honestly be said:** "every shared lesson went through an independent fact check", "every calculation we could parse was recomputed by a program", "a personal version can't add numbers or names that weren't verified".

**Can't be said:** "100% accurate", "guaranteed correct", "every claim has a source". About two thirds of facts have no passage.

## False alarms: the trade-off (held-out, first read)

Every flag is a suspicion. A policy decides when it may change anything. Unconfirmed flags change nothing and go to `services/fact-confirm.js` `logFlag`.

| Policy, Kimi + grok-4.3 | Caught | Clean levels flagged |
|---|---|---|
| any flag acts | 71/82 = 87% | 10/52 = 19% |
| one other family's ruling | 70/82 = 85% | 8/52 = 15% |
| **three families believe it (recommended)** | **70/82 = 85% (76-91)** | **4/52 = 8% (3-18)** |
| recompute or source only | 26/82 = 32% | 1/52 = 2% |
| two readers raised it unprompted | 39/82 = 48% | 0/52 = 0% (0-7) |

| Policy, Kimi + grok-4.3 + DeepSeek + SymPy + code | Caught | Clean levels flagged |
|---|---|---|
| any flag acts | 73/82 = 89% | 19/52 = 37% |
| three families | 71/82 = 87% (78-92) | 5/52 = 10% (4-21) |
| recompute or source alone may confirm, or three families | 71/82 = 87% | 8/52 = 15% |

**How close to zero, honestly:**
- About 8% raw at 85% catch, and 2-4% once read by hand.
- A true 0 costs nearly half the catches (48%).
- Confirming cost 1 catch of 71 here.
- Recompute and source contradiction **do not earn the right to confirm alone**, which differs from the brief's list. They added 3 flags on clean levels and no catches. All 5 "contradicted" facts in the pilot bank read as bad retrievals (a rook passage from a different game, Bible translations). A transcription fault looks exactly like a recomputed error. So they stay as evidence, and a recompute that holds still clears a flag.
- A held-out flag that looks false comes from stale memory: readers doubted Ciudad de la Paz as Equatorial Guinea's capital while a passage supported it. Letting a supporting passage clear a flag looks worth testing. It isn't in these numbers.
- Rulers lose more on real errors than on plants: in the audit, 20 of 132 findings had only one of two rulers.

**Part-by-part reads** (`COLD_FIRST_BLOCK` reported 5-7 of 24): with the gate's hunt prompt, GLM-5.3 Flash raised nothing on 104 clean parts and DeepSeek raised 2, both rejected by all three rulers. So 0/104 (0-4) at 92% catch. Limits:
- Only 48 of 82 plants sit in one block.
- Clean parts come from stored, checked lessons, not freshly written ones, so this is not the same text as the 5-7 of 24.
- DeepSeek's part reads catch only 27% of real errors, so they don't replace the shared-level check.

**Rewrite check curve** (planted sentences against real rewrites' sentences). Threshold and mode were set on dev; held-out is below.

| Mode, t = 0.5 | Dev caught | Held-out caught | Fresh rewrite sentences flagged |
|---|---|---|---|
| local models alone | 104/110 = 95% | 80/82 = 98% | 382/1,037 = 37%, every rewrite: useless alone |
| ruling must find it contradicted (set on dev) | 96/110 = 87% | 62/82 = 76% (65-84) | 4/1,037 |
| contradicted or unsupported | 96/110 = 87% | 73/82 = 89% (80-94) | 4/1,037 |
| that plus the mechanical token check | | 74/82 = 90% (82-95) | adds token rejects (below) |

I chose "contradicted or unsupported" after seeing held-out, so its 90% is not a clean read; the mode set on dev reads 77% with the token check. Clean twins flagged: 0 and 1 of 82. The 4 flagged sentences: 3 are a chess "cannot" list, 1 a quoted example. A plant is a wrong sentence in a lesson's own words, a stand-in for what a rewrite adds.

**Token rejects are a separate false alarm:** 8 of 20 fresh rewrites fail the code check on first write, mostly math worked examples with new numbers outside the marks. Their numbers would need recomputing rather than rejecting, and that isn't built. The pilot's one retry took first-try passes from 10/29 to 15/29 under the older, stricter rule.

## 1. Frozen facts

- **Coverage:** tokens in a level's own extracted facts: Spanish 84%, math 70%, English 60%. Most of the gap is card titles and worked-example numbers, so the bank for a rewrite is the facts plus the verified lesson text.
- **A new level can't lean on a bank from its neighbours.** Sibling-level coverage: English 80%, Spanish 51%, math 40%. New levels still need their own check first.
- **Pilot bank, 10 levels (`docs/fact-100/bank-pilot.json`):** 450 facts: sourced 95 (21%), computed 52 (12%), read-only 298 (66%), needs a person 5 (1%, all bad retrievals). $0.006 a level for extraction and sourcing, about 40 s.

**What breaks in quality** (29 rewrites, extreme and random learners, two AI judges, blind; a judge's same-versus-same gap is 0.67 and 0.42):

| | Bank writer | Free writer |
|---|---|---|
| Mean of four criteria | 4.29, 4.18 | 3.70, 3.84 |
| Clarity | **3.55, 3.91** | 4.45, 4.14 |
| Fit to the learner | 4.38, 4.14 | 2.76, 3.17 |
| Engaging | 4.38, 3.90 | 2.93, 3.12 |
| Complete | 4.86, 4.78 | 4.66, 4.95 |
| Words (original 633) | 754 | 650 |

- Clarity drops and rewrites get longer. Fit rises, probably because the prompt asks for marked examples, not because of the facts. Nothing is lost in completeness.
- Worst single rewrite: -1.5 and -1.75. Worst learner on average: the second-language adult, +0.02.
- **The bank writer did not produce fewer errors on its own:** a reader flagged 0.21 a rewrite against 0.10 and 0.03 for free writers (n = 29, near noise). The protection comes from the check, not the prompt.

## 2. A source for every claim

**Hard no as a gate: dropping every claim without a passage would delete most lessons.**

| Subject and grade, seeded sample | Local models find support | Cheap reader, must quote, supports | Either |
|---|---|---|---|
| Spanish advanced | 17% | 40% | 47% |
| Spanish entry | 32% | 27% | 43% |
| Spanish intermediate | 23% | 33% | 43% |
| Algebra 1 Part A | 12% | 32% | 35% |
| Calculus I | 5% | 25% | 27% |
| Chess | 10% | 23% | 23% |
| English proficient | 7% | 20% | 20% |
| Numbers to 20 | 6% | 0% | 6% |
| Piano | 0% | 6% | 6% |
| Basketball | 0% | 0% | 0% |

- Teaching sentences ("a fragment can be a stylistic choice") rarely appear in an encyclopedia. Definitions source best (36%), facts worst (13%).
- Compared with Wikipedia and textbooks, wrong and true twins look alike: 96 and 98 of 110 "silent", and 3 versus 12 "supported".
- Contradictions are real but rare: 11 of 110 wrong twins and 0 of 110 true ones on dev. In the pilot bank, though, all 5 contradicted facts were bad retrievals.
- **The same local models are far better against a verified bank**, where the true fact is present: 85-92% of wrong twins fall below threshold against 15-23% of true ones. That is why bank-then-compare works and encyclopedia-then-compare doesn't.
- The cheap reader's support was never hand-audited. These shares are a ceiling, not a verified count.

## 3. Compute what can be computed

- **Why the code pass caught 9%:** 102 of 165 planted errors aren't in math at all, so there's nothing to compute. Within math it reads prose by pattern and catches a third.
- **Extended:** a cheap model transcribes assertions, told never to correct them, and SymPy decides. Dev math 26/61 = 43%, union with the code pass 32/61 = 52%. $0.002 and 10 s a math level.
- **Held-out math: 8/43 = 19%**, 7% of all plants, as these plants are mostly rules in words.
- **Limit, read in the misses:** "(s(3) + s(1))/2 = 5" is arithmetically right and conceptually wrong. A consistent wrong set-up recomputes clean.
- **Clean levels flagged, math:** first read 8/20. After fixing bug classes (definitions read as identities, named functions, marked-wrong lines, multi-number keys), 4/20. The fixes used what held-out showed as well as dev, so 4/20 isn't a clean read.
- **Chess:** rules and positions are already checked by `services/chess-checks.js`. No planted chess error is a position claim, so Stockfish was not used and python-chess wasn't installed.
- **Spanish gender against Wiktionary:** silent on both clean and planted text (0/40, 0/22). A pattern check of "word is meaning" caught 0/40 and flagged 16/16 clean levels, so it was removed. Meanings go through the passage reader instead.

## 4. Do layers multiply? Mostly not

Misses overlap, so layers of model readers don't multiply. Both-miss against chance, on 165 old plants: Kimi and GLM-5.3 14x, Kimi and Haiku 5x, Kimi and grok-4.3 3x, cheap pairs 2-3x. On held-out: Kimi and DeepSeek 4.3x, Kimi and grok-4.3 2x. Only code and SymPy are near independent (1.0-1.2x), and they catch too little to matter outside math. From five readers, 10 of 165 old plants fall to at most one.

| Held-out, raw, before confirm | Caught | Clean flagged | $ a level |
|---|---|---|---|
| Kimi | 73/82 = 89% (80-94) | 7/52 = 13% | 0.081 |
| part reads, DeepSeek | 66/82 = 80% (71-88) | 10/52 = 19% | 0.004 |
| DeepSeek V4.1 Flash | 65/82 = 79% (69-87) | 14/52 = 27% | 0.0008 |
| grok-4.3 | 42/82 = 51% (41-62) | 3/52 = 6% | 0.0025 |
| SymPy layer | 6/82 = 7% (3-15) | 4/52 = 8% | 0.002 |
| code pass | 5/82 = 6% (3-13) | 0/52 | 0 |
| cheap stack: grok-4.3 + DeepSeek + part reads + SymPy + code | 71/82 = 87% (78-92) | 19/52 = 37% | 0.010 |

| Real confirmed errors (88, on 33 levels) | Share flagged | |
|---|---|---|
| Kimi | 94% | helped make the list |
| GLM-5.3 Flash | 36% | helped make the list |
| grok-4.3 | 14% | helped make the list |
| GLM flash lens | 40% | fresh |
| DeepSeek | 31% | fresh |
| part reads, DeepSeek | 27% | fresh |
| Haiku | 26% | fresh |

The cheap stack matches Kimi on plants and is nowhere close on real errors. Haiku was not rerun: this brief had no Anthropic budget.

## 5. What's left

- **Calibrated on known plants:** Chapman's estimate on planted sets misses the truth by 1.04x (dev) and 1.11x (held-out), since misses overlap.
- **English levels, no check before:** 83 distinct errors found, about 108 to 115 estimated (range 93-145), about 3.7 a level.
- **Levels that passed a check:** 7 found, about 18 estimated (7-22), about 0.27 a level.
- **A list that made no part of the audit:** DeepSeek's flags confirmed by the other two families: 23; 20 already in the audit, 87% (74-100). 103 errors estimated (90-120): 0.14 a level left (0-0.33). Corrected for overlap: 0.37 to 0.46 (0.01-0.86).
- **Not in these ranges:** real errors harder than plants, and anything every model believes.
- **Learner reports:** "Report a problem" exists on generated questions only (`routes/learn.js`), not on lesson pages, and the database copy holds 0 reports. Reports can become an independent list for this estimate from the beta on, once lesson pages have the button.

## What runs where

Timed on 8 CPU threads with other jobs on the machine, as a stand-in for the beta server (no GPU). The server itself was not touched.

| Checker | Speed | Fit for | Earned its place? |
|---|---|---|---|
| Token check, illustration check | under 1 ms | waiting learner | Yes, but catches little alone (10%) |
| Code pass | 20 ms a level | waiting learner | Yes, free |
| SymPy on statements | 1-2 s a level, plus the transcribing model | background | Math only |
| FactCG + MiniCheck | **0.48 s a sentence**; 0.1-0.15 s on the GPU | a short part if it must; a whole rewrite takes about 25 s, background | Partly: useless alone (37% of sentences flagged), and saves about 60% of rulings as a free filter. **It can't remove the third-party step** |
| Offline Wikipedia and Wiktionary via kiwix | 1.9 s a claim | background | Yes as evidence, not as a gate. Needs 52.7 + 9.2 GB on the server; `tools/offline-sources/start-kiwix.sh`; about 297 GB is free there |
| HalluGuard | **78 s a sentence** | background only | **No.** 1/8 wrong and 0/8 true flagged on a sample. Drop it |
| Granite Guardian | **not measured** | | 8.7 GB, and this PC had 5-9 GB free. It can be tried on the server |

No small model writes or answers for learners anywhere here. Local models are checkers only.

## Added to the project

| What | Source | Size | License | Earned? |
|---|---|---|---|---|
| OpenStax Prealgebra, Elementary Algebra, Intermediate Algebra, College Algebra (first editions, text only) | OpenStax's own asset host, listed by its API; `offline-sources/openstax/get.sh` | 11 MB text | CC BY 4.0, read in each | Yes: 30 of the pilot's 95 sourced facts |
| OpenStax current editions, Calculus, Writing Guide | same | about 300 MB | **CC BY-NC-SA**, which I only read after downloading | Measured nothing with them; **deleted**. English stays at 20% sourced partly because of this |

Nothing else was installed. SymPy, llama-cpp and pdftotext were already on the machine.

## Switches, all off by default

- `FACT_CONFIRM=on`: in the gate, a flag stands only if three families believe it; otherwise it goes to the log. `FACT_CONFIRM_RULERS`, `FACT_FLAG_LOG`.
- `FACT_COMPUTE=on`: the SymPy layer on math levels in the gate. `FACT_COMPUTE_MODEL`.
- `FACT_BANK`, `FACT_SOURCE`, `FACT_DICTIONARY`: the checks are written and tested as functions, but **no path calls them yet**, and the personal writers don't use the bank.

The recommended gate needs `FACT_GATE=on`, `FACT_CONFIRM=on`, `FACT_COMPUTE=on`, `FACT_GATE_READERS=lyceum:moonshotai/kimi-k3.1-pro,grokified:grok-4.3`. That combination is unit-tested with stubs; it has not run end to end through `services/fact-gate.js` on a real level, as the measurements used the scripts in `scripts/fact-100/`.

## Not proven

- Planted errors come from a model and from me, and real errors behave differently. I read every plant while keeping it, so the split guards against tuning on results, not against having seen the sentences.
- Thresholds and policies were set on dev (the old 165, plus 28 new plants in dev2). The curves above are first reads of the held-out split, except where marked.
- Clean controls are levels with no confirmed error, so some flags on them are real. An earlier version chose them by "no reader flagged anything", which hid Kimi's false alarms; I caught that and fixed it before any policy read.
- Scoring is strict word matching, so a real catch can be missed. A pilot bank writer is one cheap model, not the production personal writers.
- Spent about $14 on prepaid credit: Lyceum $10.60 (Kimi $9.80), Coral about $1.70, Grokified about $1, Munito and ZeroGPU about $0.40. Nothing on the Anthropic key.

Evidence: `docs/fact-100/` (`heldout.json`, `confirm-heldout.json`, `rewrite-curve-heldout.json`, `parts.json`, `capture-recapture.json`, `real-recall.json`, `source-share.json`, `bank-coverage.json`, `bank-rewrite.json`, `bank-pilot.json`, `overlap.json`). Scripts: `scripts/fact-100/`.
