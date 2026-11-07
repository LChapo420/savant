# The fact gate: how much a check catches (6 Nov 2026)

All numbers are AI-judged on planted errors and stored text. None of this is real-learner proof. Whether a check runs at all is `services/fact-guard.js` (docs/FACT-COVERAGE.md); when it runs belongs to branch `cold-write`.

## Verdict

**Best gate: code pass + Kimi K3.1 Pro read + grok-4.3 read, GLM-5.3 ruling on the flags.**
Held-out planted errors caught **112 of 117 = 95.7%** (95% interval 90-98). False alarms **7 of 87 clean levels = 8%** (interval 4-16). Reads $0.067 a level, about $0.08 with the rulings, about 90 s a level on an in-use machine.
Against the gate (at least 95%, at most 10%): **met on the point estimates**, with the catch rate's lower bound (90%) and the false alarm's upper bound (16%) both outside it. The weak kind is misleading simplification, 3 of 7.
`FACT_GATE` stays **off** by default: this model's place in the lineup is a coordinator's and owner's call (below). Nothing a learner waits for uses it.

## Test bed (`docs/fact-gate/testbed.json`, `scripts/fact-gate/`)
- **165 planted errors**, in real written lessons, one fixture each (a level with one error, some self-consistent across parts): math 63, English 51, Spanish 40, chess 5, basketball 4, piano 2. By kind: wrong answer key 34, reversed cause 25, wrong number 21, key against its lesson 21, date or name 18, wrong worked example 18, formula step 17, misleading simplification 11.
- **55 clean levels**, plus 50 more shared levels for false alarms only.
- Planted by MiniMax M3 and Mistral Large (families no judge belongs to), by code (a block's key moved) and by hand (real names and dates, which these lessons rarely hold). 78 of 219 candidates were rejected on reading: fictional details, things still true, debatable points. Five kept plants that read as arguably not false were marked `soft` before any held-out result was read, and stay in every count.
- **Split by level, seeded: dev 48, held-out 117.** Prompts were written before any read. The only tuning was the code pass, on dev; its first held-out read is reported as it was.
- **Who sees what.** A judge gets its system prompt, the context line (subject, grade, level number), and the level's blocks and checks as JSON with the edit applied. Never: the plant list, its kind, planted or clean, the planter's reason, the stored verification, the writer's model. Every read is a fresh call, and its prompt hash is in the raw file. A decider sees that text plus the flags, nothing else. Sonnet, as the adjudicator of stored text, sees the same.
- **Caught** means a flag at the edited part naming the planted words or restoring the original ones, or quoting most of the plant from the other side of a contradiction; a flag the same judge also raised on the clean text does not count.
- **False alarm** means a clean level with a flag that the adjudicator (Sonnet, a different family from every pipeline stage here) rules false. Stored lessons hold real errors, so a raw flag is not a false alarm: 116 of 145 ruled flags were real. I read about 60 of them; the ones Sonnet ruled false read as pedantic or mistaken, and most it ruled real read as real.

## Why the old numbers looked worse (bridge, `scripts/fact-gate/bridge.js`)
Same 12 planted and 8 clean levels as round 3 (pool gate 8/12 and 1/8, Sonnet 9/12 and 3/8): GLM-5.3 Flash with the new prompt 8/12, 0/8; grok-4.3 8/12, 0/8; Kimi 8/10 (2 unread), 1/8. So the new prompt alone moves nothing there. On my read, 3 of those 12 (b6, b7, b16) and 12 of the whole set's 36 are not errors ("the lab closes at seven", "una mesa grande"). The planted set of 12 had a catch ceiling near 9 of 12; 8 of 9 real ones were caught. A small noisy set understated every checker. **The guard's "42% of subtle errors" comes from the same set, so it is understated too.**

## Comparison
Held-out unless marked. Cost and time are per level, reads only, at 3 to 5 at once, other agents on the machine and on the providers' keys (CPU read once at 29%; these are network waits, so provider load matters more).

| checker | caught | false-alarm levels | $ a level | s a level |
|---|---|---|---|---|
| code pass alone (free) | 11/117 = 9% (5-16) | 0/87 | 0 | 0.02 |
| GLM-5.3 Flash, ZeroGPU | 91/115 = 79% (71-86) | 4/82 = 5% | 0.0008 | 13 |
| DeepSeek V4.1 Flash, Coral | 89/116 = 77% (68-83) | 17/37 = 46% | 0.0008 | 1 |
| DeepSeek V4 Flash, Gonka (dev) | 14/47 = 30% | 0/18 | 0.0004 | 5 |
| grok-4.3 | 85/117 = 73% (64-80) | 6/87 = 7% | 0.0020 | 11 |
| Haiku 5.5 | 101/117 = 86% (79-91) | 3/37 = 8% | 0.0015 | 8 |
| Sonnet 5.5, no search (dev sample) | 27/32 = 84% (68-93) | 2/8 | 0.018 | - |
| GLM-5.3, Lyceum (partial, 42) | 40/42 = 95% (84-99) | 3/19 = 16% | 0.057 | 85 |
| **Kimi K3.1 Pro, Lyceum** | **112/117 = 96% (90-98)** | 9/87 = 10% | **0.065** | 67 |
| GLM flash lens on rules and facts | 72/116 = 62% (53-70) | 11/37 = 30% | 0.0009 | 12 |
| blind answers, DeepSeek | 30/117 = 26% (19-34) | 6/37 = 16% | 0.0006 | 1 |
| Today's claim prompt, GLM flash (dev) | 35/41 = 85% (72-93) | 4/17 = 24% | 0.0012 | 30 |

Combinations (union raises one flag from either; "must agree" needs both on the part; a ruling drops what the decider rejects):

| combination | caught | false-alarm levels | $ a level, reads |
|---|---|---|---|
| GLM flash + grok-4.3 | 99/115 = 86% (79-91) | 10/82 = 12% | 0.003 |
| GLM flash + grok-4.3, GLM-5.3 rules | 95/115 = 83% (75-88) | 3/82 = 4% | 0.003 + ruling |
| GLM flash + Haiku | 107/115 = 93% (87-96) | 6/37 = 16% | 0.002 |
| GLM flash + Haiku + DeepSeek + grok-4.3 | 109/114 = 96% (90-98) | 20/37 = 54% | 0.005 |
| Kimi alone, GLM-5.3 rules | 111/117 = 95% (89-98) | 5/87 = 6% | 0.065 + ruling |
| Kimi alone, Haiku rules | 110/117 = 94% (88-97) | 4/87 = 5% | 0.065 + ruling |
| **Kimi + grok-4.3, GLM-5.3 rules** | **112/117 = 96% (90-98)** | **7/87 = 8% (4-16)** | **0.067 + ruling** |
| GLM flash + grok-4.3, must agree with Kimi | 75/115 = 65% (56-73) | 1/82 = 1% | 0.062 |

Two families that must agree throw away a third of the catches; a ruling costs one or two. Deciders are weak at rejecting: they drop few real plants, and few false alarms, and Kimi's false alarms are mostly fair arguments.

**The best gate by kind** (held-out): date or name 12/12, formula step 13/13, key against lesson 17/17, wrong answer key 26/26, wrong number 12/12, wrong worked example 12/12, reversed cause 17/18, **misleading simplification 3/7 (16-75)**. All 11 across both splits: no reader over 64%; four readers together 73%. Some of these are close calls for any expert. Math 37/38, English 42/44, Spanish 22/24, self-consistent plants 14/14. Without the one soft held-out plant, which it caught: 111/116.

**Noise (same text, same judge, read twice):** Kimi 15 plants, same result on all 15; clean levels 3 then 3 of 6. GLM flash 45 plants, 93% the same; clean levels 6 then 5 of 21. A claim of a few points between the cheap checkers is inside the noise.

**Kimi K3.1 Pro, real cost:** about 3,200 input and 5,900 billed output tokens a level (reasoning bills as output): **$0.065 to $0.073 a level**, about half a Sonnet claim read with search ($0.135), 30 to 80 times the cheap readers' price for the jump from about 80% to 96%. It failed with 503 "inference capacity exhausted" often on Lyceum (9 of 30 in the busiest run). Fine for a background build with retries, not for anything a learner waits on.
**Where it belongs:** as the reader of shared (base) levels in the build pipeline, nowhere a learner waits, ahead of the Sonnet read for that job, with GLM-5.3 as its ruling, via `FACT_GATE_READERS=lyceum:moonshotai/kimi-k3.1-pro,grokified:grok-4.3`, `FACT_GATE_DECIDER=lyceum:z-ai/glm-5.3`. Not added to a live task here. For anything that must be fast and cheap: Haiku (86%, 8 s, $0.0015) or GLM flash (79%, 13 s, $0.0008); both prepaid.

**For the fact guard:** on lesson text the reader matters more than the prompt. Haiku and GLM flash, reading a whole level, are 79-86% here against 42-50% for the guard's per-piece read on a set whose ceiling is about 67%. Whole-level context is much of it: contradictions and keys need the lesson. `services/fact-gate.js` exports the hunt prompt for that mode.

## Repairs (`scripts/fact-gate/repair-test.js`, held-out, truth-aware Haiku reader, sample read by hand)
| repair writer | repairs | error fixed | new error | meaning kept | spent |
|---|---|---|---|---|---|
| GLM-5.3 Flash | 38 | 36 = 95% (83-99) | 2 = 5% (1-17) | 38 | $0.03 |
| grok-4.3 | 39 | 36 = 92% (80-97) | 3 = 8% (3-20) | 39 | $0.05 |
Both misses I read were real: a repair that "fixed" a sum to agree with the planted number, and one that fixed a sentence and left its feedback saying the wrong thing. So a repair must be read again, the whole level. See the live-lesson run below.

## The code pass (`services/fact-code-checks.js`, `FACT_CODE_CHECKS`, off)
Free, about 20 ms a level. Recomputes arithmetic, unit and percent chains, solve steps and inequalities, functions defined in the part, keys against choices, computed prompts against keys, slope and intercept, zeros, table rows, Spanish numbers, near-identical sentences that disagree.
- Dev 11/48 = 23%. Math across both splits 21/63 = 33%. All 22/165 = 13%: wrong number 38%, worked example 39%, the rest 0-12%. With suspicions 30/165 = 18%.
- **Its false alarms, as they were found.** First held-out read: flags on 7 of 37 clean levels, all false, from a few bugs (punctuation-only choices, chained "times", compound inequalities). After those: 0 on all 105 shared levels. Then the first read of 6,346 other stored rows: **48 "certain" flags, every one false** (a derivative f'(1), a rounded constant, "78 / 7 = 11 full teams with 1 left over"). Fixed; 0 now. So there is no untouched text left to claim a clean rate on, and "certain" did not earn its name: in the gate its findings go to the decider, and it should not count as wrong with no model asked in the fact guard yet.
- The recompute settled the stored re-check's "x = 7, not 17" as a checker mistake.

## Audit of what is written (`scripts/fact-gate/audit.js`, `docs/fact-gate/audit-live.json`; a copy, nothing written)
Readers: Kimi K3.1 Pro, grok-4.3, GLM-5.3 Flash. Rulers: Sonnet and GLM-5.3. **Confirmed means both rulers call it real.** About 60 findings read by hand, including every one Sonnet ruled false among Kimi's.

**93 live shared levels: 33 hold at least one confirmed error, 101 confirmed errors in all** (a further 17 had one ruler, 11 were false alarms). The 12 Algebra 1 export levels (not live): 0.

| grade | levels | passed a check before | levels with an error | confirmed errors |
|---|---|---|---|---|
| english/proficient | 29 | 2 | **26** | **94** |
| spanish/advanced | 33 | 33 | 3 | 3 |
| spanish/entry | 11 | 11 | 2 | 2 |
| spanish/intermediate | 9 | 9 | 1 | 1 |
| math/numbers_to_20 | 1 | 1 | 1 | 1 |
| math/calculus_i | 7 | 7 | 0 | 0 |
| chess, piano, basketball | 3 | 3 | 0 | 0 |

**The finding: nearly all errors sit in lessons that never had their own fact check.** 27 of the 29 English levels were imported with no verification record (16 carry a rewrite stamp). The 66 levels that passed a check hold 10 errors; the 27 that did not hold 91. Checks work; these skipped them.
Per level (confirmed): English level 49: 10, 40: 9, 50: 8, 95: 6, 19: 5; 10, 20, 28, 52, 80, 81, 82, 91: 4; 29, 30, 39, 70, 124: 3; 92: 2; 18, 38, 48, 62, 71, 72, 90: 1. Spanish advanced 80, 108, 163; entry 16, 42; intermediate 97; math numbers_to_20 level 20: 1 each. Each finding with its quote: `docs/fact-gate/audit-live.json`.
Mostly feedback that quotes or describes the wrong text, keys that do not fit their own question, and rule statements that do not hold: "Fix 4 of 3", "duct + or = conductor", a decision branch reversed, a model answer that breaks the rule it teaches. No arithmetic error in any of it: the code pass flags nothing on these levels.

**Fixes for review, nothing applied: `docs/fact-gate/audit-fixes.json`.** Repaired with the production prompt, GLM-5.3 Flash then grok-4.3, level read again by Kimi: **48 of 67 parts changed, same shape, read clean**; 19 are left for a person or a rewrite, on 15 levels. **Repair is weaker on real errors than on planted ones**: the first round fixed only 35 of 67 (planted: 95%), and 20 came back unchanged; a blunter instruction and grok-4.3 took it to 50. A corrected fact is a model's, so read it before applying; two I read were weak and were moved out. Cost $0.108 a level for the first round, $0.12 for the second, mostly Kimi's re-read, about 2 to 2.5 minutes a level.
The planted test measures the reader, not the loop: the first re-reads also raised 25 new flags elsewhere in those levels, so a level is not finished after one pass.

## Is the base "the most optimal broadly"? (`scripts/fact-gate/base-ready.js`)
**Verdict: not ready, and "most optimal" cannot be shown today.** No real learner has used these lessons, so nothing here measures learning or retention; the beta on 15 Nov can. What can be tested today, on the 105 shared levels, computed and AI-judged, not real-learner proof. The pass marks are mine, for the owner to change:

| test | pass mark | today | |
|---|---|---|---|
| Right: no confirmed error (best gate) | all levels | 60 of 93 live | fail |
| Checked: passed a fact check | all levels | 66 of 93 live | fail |
| Reachable: start levels of the grades with 5+ enrolments exist | 227 | 7 | fail |
| Teaching, two families, mean of 7 criteria out of 5 | at least 4 in both | DeepSeek 3.19, grok 3.86 | fail |
| Worked examples before practice | at least 3.5 in both | 2.4, 3.0 | fail |
| Checks test what was taught | at least 3.5 in both | 3.1, 4.4 | split |
| Every part needed | at least 3.5 in both | 2.8, 3.9 | split |
| Extreme learners: worst 5% of learner-levels | at least 2 | 2, 1 | split |

Six learner profiles in every read: a young weak reader, a second-language adult, a bored strong learner, an attention-limited skimmer, a career changer, a random mix. Worst are the weak reader (1.7, 1.8) and the bored strong learner (2.0, 1.8). Levels with a learner under 2: 27 and 67 of 105; worst 1% scores 1 in both, median 3. The base is not meant to fit them alone (the personal layer does), but it starts them low.
**The judge, measured before believing it:** same text twice moves a score 0.07 and 0.19. Checks from another level: validity drops 3.3 to 0.9 and 4.4 to 0.6, seen in 31 of 32. Teaching blocks removed: "covers" drops only 0.4 to 0.5, seen in 25 of 38. Blocks shuffled: seen in 14 of 34, drop near zero. **So this rubric sees bad checks, half-sees missing teaching, and cannot see bad order. It can say what is wrong, not that a level is optimal.**
Computed: median words and minutes a level: English 1,867 and 16.7, calculus 1,637 and 15.8, Algebra 1 1,508 and 11.9, Spanish 412 to 569 and 5.7 to 6.8. Flesch-Kincaid about 8 for English, 7 for math. Against the 4x goal, 17 minutes a level needs a real measure.

**Fix first, in order:**
1. **The English levels.** Review `audit-fixes.json`, then run all 29 through the gate: about $5.50 on Lyceum and Grokified. Almost all known errors are here.
2. **Worked examples.** The fix both judges name most (91 and 33 of 105). Change the writer's rule, then test on 5 levels with the rubric before anything is built.
3. **Spanish "advanced".** Its first levels teach subject pronouns and ser, and grok-4.3 scores them lowest as beginner material under an advanced label; no enrolment uses it yet. This may be a label only: an owner or curriculum call.
4. **A pilot, not the 220.** Build the 20 most-enrolled start levels through the gate and put them in the beta.

**True price of the 220 under the best gate** (measured a level: writing $0.016, Kimi and grok-4.3 reads $0.067, rulings about $0.03, first repair round $0.108, second $0.12 on about 60% of levels): **about $0.22 a level with one repair round, about $0.29 with the second: $48 to $64,** if every new level needs repair as the stored English ones did. Against $11 at $0.05 for the old cheap gate (GLM-5.3 Flash or grok-4.3 alone catch 73-79% here) and $95 at $0.43 for the Sonnet gate. All on prepaid credit: Lyceum has about $79 left, so it could carry this and little else; Grokified $116. Time: about 5 minutes a level; at 4 at once, about 5 hours, longer when Lyceum answers 503. On these repairs 15 of 33 levels still had a part left for a person. A pilot of 20 costs about $5.
**Recommendation for the owner:** hold the 220. Do 1 to 4; decide on the remaining 200 with beta results.

## Stored re-check of 6 Nov (`docs/fact-gate/recheck-fixes.json`)
90 findings sorted by reading each row: 84 real (22 stale option labels, fixed in code; 62 wrong text, corrections in the file), 4 checker mistakes, 2 unclear. The shared cause: `shuffleKey` in the English rewrite scripts moves the right option after the model writes "Option 0..."; some writers also number options. `services/game-ordinals.js` removes the place words and any numbering inside `inject()`, the one way a stored set reaches a learner: 74 stored questions served clean, nothing written, key and order unchanged. A place that means a wrong option is left alone and reported. The two plain-math findings (lesson 424) are deliberate wrong examples, loosely worded; the checker's "x = 7" is wrong.

## Switches
- `FACT_GATE=on`: a shared level is read by `services/fact-gate.js` instead of the claim read. A learner's own level keeps today's read. Off. Scheduling stays with `cold-write`.
- `FACT_GATE_READERS`, `FACT_GATE_DECIDER`: `provider:model` lists. Defaults are the cheap pair, so nothing touches Kimi unless these are set.
- `FACT_CODE_CHECKS=on`: the fact guard's recompute. Off.
- Game explanation cleaning: always on (a bug fix with its own test), no switch.

## Not proven
Planted errors come from models and one human, so a real writer's errors may be harder. The adjudicator is Sonnet, itself a checker that reached 84% here. Web search was off throughout; dates and rare facts rest on what each model knows.

## Checks on this work
`node scripts/fact-gate-test.js`, `node scripts/game-ordinals-test.js`, in the suite. Suite: 209 steps, 1 failure, `fact-coverage-test` (the new `fact_gate` task and direct calls), then fixed with a registry row and an allow-list entry for this checker, and passing alone; the full suite was not run again after that change. The bingo game with a cleaned set was loaded at phone width in a browser with the app's assets and no script errors, and the baked page holds the cleaned text; it was not played through to that question.
Spent: Lyceum about $34 (Kimi and GLM-5.3), Grokified about $2, Anthropic $2.13 of the $5 budget, ZeroGPU $0.60, Coral $0.48, Gonka $0.02.
