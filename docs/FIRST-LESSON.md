# The first lesson after placement (4 Nov 2026)

Owner's rule: nothing a learner reaches should be slow; write about twice what is needed. Measured before this branch (full-walk, real
models): the first personalised lesson after a placement took 3 to 8.5 minutes, the fact gate and the blind check being most of it.
Everything below is AI-planted or simulated, never real-learner proof.

## 1. A faster fact gate and blind check, no weaker

`scripts/fact-verifier-eval.js` (set: `docs/fact-verifier-set.json`, results: `docs/fact-verifier-eval.json`). 36 real lesson blocks and checks
with one planted factual error (written by xKiro Mistral Large, a family none of the verifiers share), 24 left clean, plus 48 multiple-choice
keys (24 planted wrong). The verifier gets exactly what production sends (same prompt and schema); it is never told which are planted. Caught =
a claim quoting the planted words (or whose truth quotes the original) marked not verified.

| verifier | family | planted caught /36 | false alarms /24 | answered /60 | fact p50 (p95) | keys caught /24 | true keys kept /24 | key p50 (p95) |
|---|---|---|---|---|---|---|---|---|
| grok-4.3 (today's gate) | grok | 22 | 5 | 59 | 24 s (38) | 24 | 24 | 6.7 s (12) |
| Coral DeepSeek V4.1 Standard | deepseek | 22 | 11 | 58 | 1.2 s (2.2) | 23 | 20 | 0.3 s |
| Gonka DeepSeek V4 Flash | deepseek | 18 | 10 | 58 | 14.5 s (32) | 24 | 24 | 0.9 s |
| Gonka GLM 5.3 Flash | glm | 14 | 0 | 24 | 136 s (234) | 24 | 24 | 1.3 s (6.7) |
| Lyceum GLM 5.3 | glm | 14 | 2 | 25 | 52 s (273) | 24 | 24 | 1.2 s |
| Crouton Alpha | crouton | no answer | | 0 | | 0 | | |
| Nemotron Ultra (today's blind check) | nemotron | | | | | 24 | 24 | 6.7 s (38) |

Rule: keep a verifier only if it catches at least as many planted errors as today's and is a different family from the writer.
- `fact_verify`: Coral Standard ties grok-4.3 on catches (22) with more false alarms (11 against 5, which cost repair rounds, not missed errors),
  and at 1.2 s a block. It is DeepSeek, as is the first-lesson writer (Coral Fast), so the call now excludes the writer's family
  (`writerFamilies` in block-levels, `excludeFamilies` through ai.js and the pool): a DeepSeek-written level still goes to grok-4.3, a level
  written by another family can use Coral Standard. Added to the allow list, cheapest first. Nothing else reached today's catch count.
- Blind check (`blind_mc`): Gonka GLM 5.3 Flash equals Nemotron Ultra on the 48 keys (24 of 24 caught, 24 of 24 true kept) at 0.3 to 1.3 s a
  question against 6.7 s median and 38 s p95 (and 429s) on the free tier. Added; key-gate now asks the pool's blind_mc slots first (writer's
  family excluded, question text only) and keeps NVIDIA behind it (`KEY_GATE_POOL=off` restores the old order).
- Pool: the lane of a learner waiting (the first level after placement) now takes paid slots before free ones for every task, not only those
  with a fast slot. Before, `fact_verify` there sat on a busy free NVIDIA model first (92 to 312 s in the walk) and grok-4.3 only came in as the hedge.

Limits: the planted set is small (36 and 48), some of its plants are ambiguous or weak (a prompt reworded rather than made false, "14"
to "catorce"), so no verifier can reach 36 (I read 12 of the 36 pairs: 4 were weak); Spanish is over-represented (the stored plans are mostly Spanish and English). Crouton answered
nothing in this run (not diagnosed). Whole-level grok-4.3 reads measured 32 to 67 s in the server; a first lesson written and gated from
cold therefore takes about a minute, not 15 s.

## 2. Written during placement

`services/write-ahead.js prewrite`, called from `routes/placement.js` on each answer from the mode's `min` answers on: the two most likely start
levels from the belief so far (`unit-placement.likelyStarts`), at most 4 distinct levels per enrollment, in the first-level fast lane with
its own concurrency cap (2 at once in all, one per learner, `WRITE_AHEAD_PREWRITE_CONCURRENT`), the write's usual gate, no daily-cap charge. When the learner is placed
on one of those levels the request joins the finished or in-flight write (same plan key). `WRITE_AHEAD_PREWRITE_MAX=0` turns it off. The
learner's consent rule (`mayGenerate`) applies as for any write. The free ACT check's applicants get the same once they enrol in ACT and
place (the check result is the grade stage; the in-grade placement then writes ahead as above).

`scripts/prewrite-hit-sim.js` (simulated learners, random frontiers, holes, extremes at both ends): the start level was already written for 95%
(math 90, English 95, IQ 100, Spanish 93; extremes 98%), 2.8 writes a learner on average. Writing the first two units at the start of the grade
as well gave 82%, so that was dropped.

## 3. Time to first lesson (real models, DB copy, math Algebra 1 Part A; scripts/first-lesson-timing.js)

Real models (Coral Fast writer, grok-4.3 / free NVIDIA / Munito / Gonka behind it), a copy of the database, fresh adult test accounts, math
Algebra 1 Part A, the placement driven through the API, the clock started when `/api/placement/finish` returned, gates on (fact gate, blind
check, Sonnet check on the first-level free tier as shipped). Learner profiles are extremes on purpose: strong (answers right from the
DEV_TOOLS key, lands at level 465 after 10 answers), weak (always wrong, level 10), mid (60% right, level 10), random (5 to 95% right).
`THINK_MS` is the seconds a person takes per question (0 is a script). The machine was at 100% CPU for the whole session from other agents'
simulations (and `npm test` ran during the last runs), so absolute times are pessimistic.

| run | learners | placement | first poll | seconds from end of placement to open lesson |
|---|---|---|---|---|
| before (this branch's parent, prewrite off) | 1 mid | 6 s | 202 | 181 |
| before | 3 at once: strong, weak, random | 10 to 30 answers, seconds | 202 | 173, 381, 512 |
| after, first design (prior guess at start, up to 6 levels, uncapped) | 1 mid | 124 s | 200 | 0.1 |
| after, same | 3 at once | 39 to 124 s | 202 | 145, 122, 326 |
| after, no prior, 4 levels, 3 writes at once (THINK 9 s) | 3 at once | 94 to 279 s | 202 | 563, 274, 608 (one timed out at 600) |
| after, final (no prior, 4 levels, 2 writes at once, one per learner) | 1 mid | 284 s | 202 | 70 |
| after, final | 3 at once | 90 to 285 s | 202 | 605 (timed out), 80, 376 |

What this shows, honestly: the first lesson opened instantly in one run (single learner, 2-minute placement, the guessed level was the placed
level and the write finished during the quiz). It did not reproduce: with three learners placing at once, a busy CPU and shared providers, the
speculative writes and the learners' own write-ahead compete for Coral Fast (4 at once), and several calls fell onto slow slots (Munito GLM
465 s over 4 attempts, free NVIDIA 340 to 390 s). The target "under 15 s from the end of placement with the gates on" is NOT met: a first lesson
written and gated from cold takes about a minute alone (layout 10 s, fill 14 s, fact read 15 to 41 s on grok-4.3, blind check under 2 s) and
minutes under load, and the guess helps only when the quiz lasts longer than that. What would close it: a priority for waiting-learner calls
in the pool (today nothing outranks anything inside Coral Fast's 4 slots), a second fast paid provider, and dropping or shrinking the
write-ahead of levels 2 and 3 for a learner still placing. Not done here.

## 4. ACT check first impression

`/act-check` now opens mid-ladder (the 8th of 16 ACT grades, composite 23 to 25) instead of the lowest grade's place-value question;
`ACT_CHECK_START_INDEX=0` restores the old opening. `scripts/act-start-sim.js`, held-out seed 20261104 (the shipped tables use 20261030),
400 simulated learners (random abilities, "don't know" learners, extremes at both ends): placed within 1 grade 98.8% (opening at the lowest grade:
98.5%), mean 24.2 questions (24.5), worst 10% / 5% of individual errors 1 grade, worst 1% 2 grades; learners who miss the opening question 99%
within 1 grade. A second seed (777, 800 learners) gave 99.3% against 98.6%. Simulated, items taken at their calibrated positions: not a real-learner result.

## 5. Rounds 2 and 3 (5 Nov 2026): priority, deadlines, MiniMax M3 behind grok-4.3

Built (all in `services/pool.js`, `services/write-ahead.js`, config `fact_verify`):
- A prewrite is SPECULATIVE (`runForeground(fn, { fast: true, speculative: true })`). A speculative call never takes the last 2 permits of a fast slot
  (`POOL_SPECULATIVE_RESERVE`) and never starts on a paid slot while a waiting learner's call is pending anywhere (queued calls included). A learner who
  then waits on the same write promotes it (`promote()` clears the mark). A waiting call is fast lane, not speculative, with a cleared learner.
- A waiting call has a per-attempt deadline (`POOL_WAITING_DEADLINE_MS`, 45 s) and 3 attempts' worth in all; past it, the next slot takes the call. A deadline
  miss is `kind: 'deadline'`: counted in the slot's stats, never opens its breaker (a slow answer for one learner is not a broken slot).
- A waiting learner's `fact_verify` never lands on a free model: Coral Standard (a writer of another family only), grok-4.3, then Lyceum MiniMax M3
  (`lyceum:minimax/minimax-m3`, added to `fact_verify.allow`, behind grok-4.3 by price). If none answers in time the level is not served as checked, the
  standard session opens (public/js/block-level.js, 8 s) and the write finishes in the background lane (no deadline, free models allowed).
- Levels 2 and 3 of an enrollment are held until its first-level write is done (`WRITE_AHEAD_HOLD_BEHIND_FIRST=off` restores the old parallel write).
- `POOL_FIRST_WRITER=<slot id>` is an experiment switch only (a writer first for layout and fill). Not used in the runs below; the GLM Flash on Gonka cold
  path was NOT tested (Gonka GLM 5.3 Flash read facts at p50 136 s on 5 Nov, far over any 45 s deadline).
- Coral Fast "invalid" fill (cause found in the log): a fill block returned as a string that is not plain JSON (`$.blocks[1]: expected object, got string`),
  so the whole answer was refused and the call fell onto slow slots. `structured-json.js` now reads an object or array wrapped in a label or fence; the
  error text is now in the pool's warning. The fix is unit-tested; whether it removes the invalids in live fills is not measured.

Catch rate of the verifier path on `docs/fact-verifier-set.json` (36 planted, 24 clean; AI-planted, small set; figures from the 5 Nov evaluation,
`docs/fact-verifier-eval.json`, `docs/evals-5nov-grok.json`, `docs/evals-5nov-lyceum-minimax.json`, not re-run here because the path is a fallback chain,
not a union, so its catch rate is that of whichever verifier answers):
| path | planted caught /36 | false alarms /24 | p50 (p95) |
|---|---|---|---|
| grok-4.3 alone (grok up) | 22 | 5 | 24 s (38) |
| grok-4.3 then MiniMax M3 (grok up) | 22 | 5 | same |
| grok-4.3 down, MiniMax M3 answers | 17 | 9 | 2.3 s (145; a 145 s answer is cut at 45 s and the next slot or the standard session takes over) |
When grok-4.3 is down, catches fall from 22 to about 17 of 36, and false alarms rise from 21% to 38% of clean blocks; each false alarm is a repair round
(a grok-4.3 repair is 23 to 33 s, and the level is read again). Whether 17/36 is acceptable as the gate during an outage is the owner's call; this
branch does not decide it, and the gate is not weakened: with no verifier in time the level is not served as checked.

Timing (real models, DB copy, math Algebra 1 Part A, THINK_MS=7500 per question, gates on, PC at about 10% CPU, i.e. quiet):
| run | learners | Grokified | seconds from end of placement to open lesson | median | worst | personal within 8 s |
|---|---|---|---|---|---|---|
| 1 | 1 strong (78 s placement) | down (1 answer in the run) | 199 | 199 | 199 | 0 of 1 |
| 3 at once | strong, weak, mid (71 to 250 s) | down (0 answers), MiniMax M3 verified 6 | 288, 124, 47 | 124 | 288 | 0 of 3 |
| 10 at once | strong/weak/mid/random | up (16 answers; MiniMax M3 9) | 82, 115, 46, 56, 99, 31, 31, 542, 79, 113 | 80 | 542 | 0 of 10 |
Every first poll was 202 and no lesson opened in under 31 s, so none of the 14 first lessons would have been personal inside the 8 s fallback: all 14
would have opened the standard session. The gate (median under 15 s, worst under 60 s at 3 at once) is NOT met. Round 2 (same code before MiniMax M3, load
from other agents, network outage in one run): 1 learner 359 s, 3 at once timeout / 115 s / timeout, so this round is better (no timeouts at 1 and 3, one
at 10) but 5 to 10 times over the target. What limits it: a cold level is layout 10 s, fill 17 s (more on a retry), fact read 9 to 33 s, repair 23 to 33 s,
re-read, blind check, plus the Sonnet check: about 2 minutes written alone, and a prewrite started at answer 10 of a 75 s placement cannot finish before it
ends. Why learners placed late (230 s) still waited 31 to 115 s, and why one learner (random profile, level 10) took 542 s, was not diagnosed (I did not
trace those writes: a missed prewrite guess or a slow fill retry are the likely causes). Simulated learners, AI-judged: not real-learner proof.

## 6. Round 4: why 0 of 14 were ready, and what changed (5 Nov 2026)

Traced from `WRITE_AHEAD_TRACE_FILE` (a JSONL of every write-ahead event; the 10-learner run before the fixes) plus the timing table:
1. **No head start for short placements.** The prewrite fired from `min` answers (10 in balanced mode); the 4 strong learners (dev-key answers) end at 10 to 17 answers, so their
   first write started at the last answer. Before this round they, and everyone who ends at `min`, got nothing. Fix: the single best guess from `min - 3` answers
   (`PREWRITE_EARLY_ANSWERS`), two guesses from `min`. `scripts/prewrite-hit-sim.js --early 3 --top 1`: 97% of start levels written with 2.2 writes a learner (98% and
   2.7 from `min` on; `--early 5`: 92%, `--early 6`: 88%).
2. **Global cap of 2 prewrites at once starved 10 learners**: all 15 prewrite events came within about 6 s of each other and only 2 writes started, the next at 210 s and 316 s.
   Fix: cap 6 (`WRITE_AHEAD_PREWRITE_CONCURRENT`), still one per learner, and the speculative fast-slot reserve 2 to 1.
3. **A write takes 100 to 360 s under 10 learners at once** (209 and 362 s for the first two), not the 60 s of a healthy single write. A write started late cannot be ready.
4. Levels 2 and 3 (held behind level 1 since round 3) did not show as a cause; the background fill of level 2 (352 s on Gonka) ran beside the learner's write and shares the
   free and Gonka slots, which is unmeasured as a cause. The 'placed' trace note never appeared (not traced why), so "did the finish request join the write" is inferred from
   a 0.1 s open, not logged.

Re-measure (THINK_MS 7500, balanced mode, ~10% CPU; Grokified answered 0 / 3 / 14 calls in the 1 / 3 / 10 runs; MiniMax off):
| run | seconds to open lesson | ready within 8 s |
|---|---|---|
| 1 strong (78 s placement) | 382 | 0 of 1 |
| 3 at once | 327 (strong), 0.1 (weak, 240 s placement), 50 | 1 of 3 |
| 10 at once | 144, 118, 0.1, 102, 112, 0.1, 609 (timeout), 0.1, 56, 0.1 | 4 of 10 |
Share ready: 5 of 14 (36%), against 0 of 14 before; all five are 30-answer placements (220 to 240 s). Misses by cause: 4 strong learners placed after 10 to 17 answers (77 to 131 s; the
head start is under 30 s and a write is 100 s or more), 3 slow writes under load, 1 timeout (the same cold write as before), 1 single strong learner. Median at 3 at once 50 s, worst 327 s:
the gate is NOT met. A learner whose placement ends within about 100 s of the first guess cannot have a 100 s write ready; closing that needs either a faster cold write or an
earlier prior guess (82% hit with 6 levels in round 1, rejected as wasteful).

Cost of the prewrites (ledger deltas over each whole run on Coral, Gonka, Lyceum, Grokified, Munito: $0.09 for the 1-learner run, $0.32 for 3, $0.91 for 10): about $0.09 a learner including
the learner's own level 1 to 3 writes and checks, so the speculative part is at most the ~$0.05 of one cold write per guess; a learner who leaves after placement cost one to two
guesses (2.2 on average), roughly $0.05 to $0.10, with nothing further written for them (levels 2 and 3 wait for the first-level write, and a leaver triggers nothing after it).
Not measured separately from the rest.

`FACT_VERIFY_MINIMAX` (default off): the Lyceum MiniMax M3 verifier is refused unless set to `on`. With it off and grok-4.3 down, a waiting learner's fact check finds no verifier
(never a free model), the level is not served as checked, and the background write retries on the slower slots. That retry was not traced here.

## 6 Nov 2026 (fact-queue): part-by-part ZeroGPU fact read, hedge 8 s against 20 s, write reuse

All AI-judged or simulated, small samples, a machine at 60 to 100% CPU from other agents' sims for every run (CPU recorded per run in the
scratch files), providers shared with those agents. Not real-learner proof. Three new switches, all OFF by default; the gate was not met, so nothing is turned on.

**Switches:** `FACT_VERIFY_PARTS=1` (one fact read per block and per 4 checks, all at once, `FACT_PARTS_BLOCKS`/`_CHECKS`/`_CONCURRENCY`/`_MAX_TOKENS`, a
6 h cache of identical part texts); `WRITE_REUSE=1` (a layout or fill-out reply is reused when the whole prompt is identical to one already answered: nothing
personal is shared, since the prompt carries all of it); `BLOCK_FILL_LENIENT=1` (a block entry without index/data no longer fails a provider's schema check
and throws the paid reply away; seen 5 Nov as Coral Fast `$.blocks[1].index: required`, then 512 s on slow slots).

**Fact read, whole level against part by part** (`scripts/fact-parts-eval.js`: each case of docs/fact-verifier-set.json put back into its stored level, one planted
error per level, waiting-learner lane, 3 levels at once, 12 planted + 8 clean, excludeFamilies deepseek as for a Coral-written level):

| setting | read | caught /12 | false alarms /8 | p50 / p90 / max s |
|---|---|---|---|---|
| whole level, hedge 20 s | 18 to 20 of 20 | 6, 6 | 0, 0 | 40 to 44 / 51 to 54 / 52 to 65 |
| whole level, hedge 8 s | 20 | 5 | 0 | 29 / 42 / 42 |
| parts, ZeroGPU 10 at once, hedge 20 s | 20 | 9 | 0 | 29 / 66 / 72 |
| parts, ZeroGPU 10 at once, hedge 8 s | 20 | 6 | 2 | 61 / 82 / 83 |
| parts, ZeroGPU 4 at once, 1 block a part | 20 | 6 | 2 | 63 / 88 / 114 |
| parts, ZeroGPU 4 at once, 2 blocks a part | 20 | 7 | 2 | 40 / 64 / 68 |

Why parts do not win: ZeroGPU GLM answers a single block in 14.7 s alone but fails about half of its calls with 502 once 6 or more run at once
(`scripts/zerogpu-concurrency-probe.js`: 1 at once 1 of 1 ok; 6 at once 5 of 6; 12 at once 6 of 12; 24 at once 13 of 24, p50 19 to 25 s), so with its 4 slots
grok-4.3 answered 154 of 186 parts (83%) and a level costs the slowest of nine grok reads, as slow as one whole read. The 502s are about concurrency, not only prompt size.
Catch differences (5 to 9 of 12) are within the run-to-run noise of 12 cases. An 8 s hedge made parts worse (more grok duplicates) and gave one fewer catch on whole
levels: the 20 s hedge stays.

**Time to first lesson after placement** (`scripts/first-lesson-timing.js`, real models, DB copy, THINK_MS 7500, fresh adult accounts, one server per run, strong/weak/mid/random;
"ready" = lesson open within 8 s of the end of placement; a timeout is 600 s):

| run | at once | ready within 8 s | median s | worst s | CPU avg |
|---|---|---|---|---|---|
| main-like (fact-queue as it was) | 3 | 1 of 3 | 83 | timeout | 49% |
| nothing on | 3 | 1 of 3 | 360 | timeout | 87% |
| reuse + lenient fill | 1 | 0 of 1 | 157 | 157 | 60% |
| reuse + lenient fill | 3 | 0 of 3 | 331 | 443 | 63% |
| reuse + lenient fill | 10 | 0 of 10 | 167 | 256 | 95% |
| nothing on | 10 | 2 of 10 | 167 | timeout | 51% |
| parts + early prewrite + reuse + lenient | 3 | 1 of 3 | 188 | timeout | 98 to 100% |

The gate (median under 15 s, worst under 60 s at 3 at once, gates on, no drop in catches) is NOT met by any setting, and nothing here beats main's 5 of 14 within 8 s
(the nearest is 2 of 10 with nothing on). Lenient fill + reuse: no timeout in 14 runs against 4 in 19 without it (a hint, not significant); their ready-within-8-s share is lower
(0 of 14 against 4 of 19), which tracks prewrite hits (a guess that is not the placed level), not these switches. Reuse hit 3 of 34 fill/layout calls at 10 learners
(identical prompts are rare: interests differ).
Prewrite starting at answer 3 (`PREWRITE_EARLY_ANSWERS=7`): one run guessed 179 first for a strong learner, whose one-prewrite-per-learner cap then held the right level (465) for 145 s: not adopted.
The strong profile (placed on level 465 after 10 answers, 65 to 85 s): 11 such learners in 7 runs took 69 to 608 s to open, none within 8 s. In the logs the write of that level shows Coral Fast fill/layout calls needing 4 to 6 attempts (327 s once) and falling to Gonka/NVIDIA; the cause was not pinned down (a direct replay of the write outside the waiting lane did not reproduce it), and the pool's 5-invalid-answers breaker would take Coral Fast out for 2 minutes after a run of bad replies. That, not the fact read, looks like the largest delay left for fast placers.
Cost per learner from the cost tracker (list prices): about $0.03 whole-level, $0.07 with parts (grok duplicates and ZeroGPU); ledgers are shared, so deltas there are not attributable.

## 6 Nov 2026 (fact-queue, round 2): a different design, instant layer over a checked lesson

Six rounds of squeezing a whole personal lesson and its gates into 8 s failed (writing plus gates is minutes). New design, behind `INSTANT_LAYER=on` (default OFF, see "Decision"):
1. When placement ends the level's **shared (base) lesson**, already written and fact-checked (`block_plans`, no user), opens at once (`routes/base-lessons.js`; `meta.layer: true`).
2. Over it, within seconds, a **personal layer** (`services/lesson-layer.js`): a hook, a why and up to two analogies from the learner's interests and word level, written by the fastest fit model (pool task `part_layer`: Coral Fast first on the fast lane, hedge at 2.5 s to Coral Standard, Munito or Gonka DeepSeek; about $0.001 a layer). The page (`public/js/block-level.js`, `public-v2`) puts a slot after the FIRST block of the lesson, with its height reserved at once (290 px, 430 on a phone), and fills it in place; a slot above the viewport that grows is made up by the scroll position. A first version put the slot above the lesson and, measured in the Browser pane (1100 px wide), moved the first block 120 px when the layer arrived at 3.7 s; with the slot after the first block the same measurement shows no position changing (sections at 202, 1014 and 1856 px, scroll 0, before and after the fill at 4.5 s). If the layer is late or never comes, the plain lesson stays (nothing waits). The full personal level keeps being written in the background (`blockLevels.ensure`) and is what the learner opens next.
3. **No new facts, checked deterministically** (`lesson-layer.js check`, same spirit as `services/part-modify.js`): no number or number word the lesson does not show; no check answer given away (numbers, phrases; a single subject word the lesson teaches may appear); no claim words in the why or hook ("most", "decides", "stronger players", "rewards", ...: the judges found such claims in 15 of 182 first-gate layers, see below); the why speaks to the reader; analogies are marked comparisons that point back to a word of the lesson and bring no new name or number (`learning-spec analogyProblems`); no profile talk; avoided domains matched by their distinctive words; length caps; sentence length for plain-language learners. A failing draft is first cut down to the pieces that pass (`salvage`, milliseconds, nothing added; at least two of why/hook/analogies must survive), then asked again once, then not shown. The interest rule is a prompt rule and a judged fit, not a gate.
Data: `lesson_layers` rows (text only), registered for account export and deletion (`routes/consent.js`). The call goes through `ai.structuredDetail` with the learner's id, so the under-13 consent rule and `CORAL_LEARNER` clearance apply as for the tutor.

Not done: "length and order choices": only wording (word level, tone, interests) is personalised in the layer; the base lesson's own length and order are not changed (that needs new text). Not checked: the phone width and the scrolled case in a real browser (the code compensates the scroll position; one desktop run at scroll 0 was measured).

### 1. Base coverage: how many landing levels have a checked base lesson (`scripts/base-coverage.js`)
A learner lands on the first lesson level of one unit of one placeable grade. 150 placeable grades, 1,981 distinct start levels, **27 (1.4%) have a ready base lesson** (all Spanish and English; math: 0). Simulated learners (the placement walk of `prewrite-hit-sim`, extremes at both ends, seed 20261106, n=400 grades uniform): start level covered for 2.3%; with grades weighted as the database's enrolments are (test accounts included, a caveat), 18.2% (all of it Spanish entry); strong learners (the top of the ladder): 34 of 35 start levels uncovered uniform, 22 of 24 weighted.
Plan (`--plan`): the most likely levels first. 19 grades have 5 or more enrolments: 227 start levels, 220 to write. Strong learners need the top units of each grade: the last 3 units of the 150 grades are 450 levels, 442 to write. All 1,954 missing: full coverage.
**Cost, measured** (`scripts/prewrite-base.js`, math Algebra 1 Part A, 6 levels at 3 at once, gates as shipped on the owner's key: Sonnet fact sheet and read, strong repairs): **$0.43 a level from the paid ledgers' total delta (ledgers are shared with other agents' work, so an upper bound), of which the Anthropic key $0.30**; 198 s median a level, 476 s wall for 6; all 6 written and servable, including 465 (formula level). So: 220 launch-grade levels about $95; the 442 top-of-ladder levels about $190; everything about $840. That is the expensive gate. The cheap way (the write-ahead's free check: pool fact readers Coral/grok/ZeroGPU, then the Sonnet check in the background, `--tier free`) should cost about $0.07 to $0.10 a level (the cost tracker's per-learner figure), 1,954 levels about $140 to $200, but it could NOT be run here: for a pipeline (no learner) write the pool fails `fact_verify` at once with "no slot available" while NVIDIA's breakers are open (rate-limited by other agents' work), so `prewrite-base --tier free` failed 4 of 4 levels in 12 to 28 s. Not fixed; unmeasured cost. Other findings from running it: with no learner in the waiting lane `req.coral` is false, so a base write waits behind free NVIDIA (layout 186 s, fill 309 s, its 300 s hint read) and the first full base write took 35+ minutes a level on NVIDIA's queue; `FACT_PIPELINE=sonnet` (no NVIDIA hint read) plus `FACT_REPAIR_WRITER=strong` (repairs by Claude: NVIDIA's `fact_repair` also answered "no slot" and level 10 failed "too little survived the checks" once without it) is what finished in minutes. Plan to pre-write: launch grades first (math Algebra 1 Part A 12 levels: 6 done here, Spanish entry, IQ foundations, English), then the top 3 units of every grade, ahead, on the cheap path once the pool issue is fixed; not run here beyond the 6 levels.

### 2. The strong-learner delay (Coral Fast, level 465): diagnosed
Evidence: `ai.js` now prints each failed attempt (slot, kind, seconds, error); `CORAL_DEBUG_DIR` keeps bad replies (`services/providers/coral.js`); 2 timing runs with 3 strong learners (placed on 465 after 10 answers): 583 s, timeout, 123 s, 65 s, timeout. Three causes, in order of size:
1. **Coral Fast gets the 465 fill wrong at temperature 0**: the first block is a formula block with a long `tokens` array; after it the model derails: `"index=0 placeholder"],"checks":[]}`, a repetition loop (`"checksHintNotePlaceholderNotUsed:null},"` over and over) that runs to the 32,768-token cap (72 to 96 s), or blocks with no `checks`. Replay of the 2 kept prompts, 6 times each (`scripts/coral-fill-replay.js`): **3 of 12 usable, 7 "blocks[1] expected object, got string", 2 missing index, 1 cut off at the cap after 72 s**. The earlier fix (wrapped objects) does not cover it.
2. **Each failure then falls onto a slow slot**: free NVIDIA (300 s "no answer"), Gonka GLM and Munito GLM (45 s deadline, no answer), or NVIDIA 429 storms; 4 to 7 attempts, 135 to 541 s, one level 403 s (Munito at the end).
3. **Coral's account allows 5 requests in flight in all** ("Too many concurrent requests: this account may have 5 in flight at once"), while the pool let Fast (4) and Standard (6) each run: three learners' layout, fill and prewrites exceed 5 and get 429s, which count as failures. Seen in the diag run (8 lines) and in the replays when other jobs shared the key.
Fixes shipped (all unit-tested, `scripts/coral-ledger-test.js`): a fill (`block_fill`) on Coral gets a first output cap of 9,000 tokens (`CORAL_FIRST_MAX_TOKENS`; a real fill is 2 to 6k), and an unusable or cut-off reply is asked again warmer, at temperature 0.5 then 0.8, before the pool moves on (`CORAL_WARM_RETRY=off` restores one try at 32,768); Coral's two slots share one pool group, cap 5 (`group`, `group_max`, `group_reserve_bg`: background calls on Standard leave 2 of the 5 free for waiting learners). Replay after the first warm retry: **8 of 12 usable, none cut off** (median 6.6 s); with two warm retries 8 of 16 but 8 of the 8 failures were Coral's own 429s from other jobs on the key, so 8 of 9 real attempts usable. Not measured: the effect on a full live strong-learner run (the instant layer takes the write off the learner's path, so it matters for the background level and levels after it).

### 3. Measured with the real timing script (`scripts/first-lesson-timing.js`, now also polls the layer)
Real models, a copy of the database holding 6 shared Algebra 1 Part A lessons (the levels 10, 52, 95, 137, 423, 465), `INSTANT_LAYER=on`, fresh adult accounts, THINK_MS 7500, gates on for the base lessons; CPU 30 to 39% average (max 74%) from other agents' work. Simulated learners, strong/weak/mid/random; all placed within the written levels except one random learner (254) and one mid learner (296). `personal` = the layer, or the full personal level when it was already finished.
| run | learners | open (median / worst s) | personal shown (median / worst s) | personal within 8 s | layer ready | failures |
|---|---|---|---|---|---|---|
| 1 | mid | 0.1 / 0.1 | 3.8 / 3.8 | 1 of 1 | 1 | 0 |
| 3 at once | strong, weak, mid | 0.1 / 21.6 | 3.9 / 21.6 | 2 of 3 | 1 (+1 full personal level done) | 0 |
| 10 at once, earlier gate | strong, weak, mid, random | 0.2 / 0.4 | 4.6 / 14.3 | 7 of 10 | 10 | 0 |
| 10 at once, shipped gate | same | 0.3 / 68.6 | 4.1 / 68.6 | 7 of 10 | 8 (+1 full personal) | 0 |
Gate (median under 15 s to an open personal lesson, worst under 60 s at 3 at once): **met for learners whose landing level has a base lesson** (median 3.8 to 4.6 s; worst at 3 at once 21.6 s, a level with no base lesson that opened the old way once its personal write finished). The 68.6 s is the one uncovered learner of ten, and the 21.6 s the one of three: the gate is only as good as the coverage in section 1, which today is 1.4% of landing levels (18% weighted to enrolments), so as the database stands almost no real learner would be served. The layer itself: first run 10.2 s (first draft failed the gate and was asked again: 5 s a call), after salvage and the 2.5 s hedge 3.6 to 8.1 s typically, 14 to 25 s in 3 of 20 at 10 at once (Coral contention); before this round the same machine gave 0 of 14 within 8 s. Compare the 6 Nov fact-queue table above (nothing on: median 167 s at 10, 1 of 3 within 8 s).
Cost of these runs: the layers about $0.001 each; the paid ledgers' deltas over whole runs (shared with other agents) were $0.23 (1), $0.53 (3), $0.68 and $0.79 (10, the two runs), mostly the background personal writes.

### 4. Is the layer good, and did it add a fact? (`scripts/lesson-layer-proof.js`; SIMULATED extreme learners, AI judges, not real-learner proof)
24 extreme learners (`scripts/lib/extreme-learners.js`, held-out seed 6107: tails at both ends, contradictory mixes, young, old, second-language) by 4 shared lessons (basketball, chess, English, calculus) = 96 layers, written through the real path (`compose`: pool task `part_layer`, the gate, salvage). Two judge families, neither the writer's (DeepSeek): grok-4.3 and GLM-5.3 Flash. Fit: the judge sees one learner's profile and three layers for the same lesson (written for that learner and for two others, order shuffled) and picks the one written for them (chance 33%). Planted swap: same layers, ANOTHER learner's profile shown; a judge that reads the profile now picks the other layer. Added fact: lesson text plus one layer, "does it state any number, name or claim about the subject the lesson does not give?".
| judge | fit above chance (real, n) | planted swap: picks the shown learner's layer | fooled (picks the first learner's layer) | layers judged to add a fact |
|---|---|---|---|---|
| grok-4.3 | 75.0% (96) | 70.8% | 14.6% | 1 of 96 (1.0%) |
| GLM-5.3 Flash | 73.7% (95) | 80.2% | 7.3% | 0 of 95 |
By learner kind (real, both judges pooled): tail_both 100% (16), age_old 100% (16), tail_hi 79% (24), age_young 75% (16), contradict 73% (40), ell 69% (16), random 67% (39), tail_lo 54% (24: few traits and interests, so little to fit). Per individual (each learner has 8 judgements): worst 1% 12.5% right, worst 5% and 10% 25%; no learner's layer went unrecognised by every judge (0 of 24). The one fact flag (grok only) is an interest analogy ("like a redstone circuit: power, wire, and a component that actually fires"), a borderline flag, not a subject claim.
Write: 96 of 96 layers within 8 s alone on the machine (median 1.0 s, p90 3.8 s, max 7.1 s); 68 passed on the first draft, 22 after `salvage`, 6 after a second draft, 0 failed. The writer was Coral Fast 58, Coral Standard 33, Gonka 5.
History that matters: with the first gate (numbers, answers, avoided domains) the judges flagged **15 of 182** judgements as adding a fact (6.6% grok, 9.9% GLM), all of them claims in the why or the hook ("the piece you will use most", "the first thing stronger players check", "rewards attention more than athleticism"): the number and name checks cannot see those, so the claim words are now refused in the why (`CLAIM`), a narrower list in the hook, and the why must speak to the reader; that is the 1 of 191 above (`docs/instant-layer/layer-proof-ll3.json` is the first gate, `...ll6-final-gate.json` the shipped one). Other early false refusals fixed (not weakenings of the fact gate): the learning-spec `mentions` counts any word of 4 letters, so "jokes in lessons" refused every layer that said "lesson" (now a dislike must match all its distinctive words); an answer such as "two" or a subject word the lesson teaches blocked ordinary hooks; 35, then 29, of 96 layers failed the first gates; 0 of 96 fail the shipped one.

### 5. `FACT_VERIFY_PARTS` for background checks: not adopted, evidence
The 9 of 12 against 6 of 12 at the 20 s hedge was measured in the waiting-learner lane. For checks where nobody waits (the background lane: write-ahead of later levels, base levels) `scripts/fact-parts-eval.js` now has `bgwhole` and `bgparts` (12 planted, 8 clean, 3 levels at once, hedge 20 s, DB copy, two repeats each; the ZeroGPU slot caps at 4 in flight, below its limit of about 5, and `FACT_PARTS_CONCURRENCY` defaults to 4 in this mode):
| mode | caught /12 | false alarms /8 | p50 / p90 s |
|---|---|---|---|
| whole level, run 1 | 7 | 1 | 148 / 403 |
| whole level, run 2 | 8 | 0 | 20 / 112 |
| parts, run 1 | 8 | 3 | 75 / 125 |
| parts, run 2 | 8 | 2 | 48 / 127 |
Whole 15 of 24 with 1 false alarm in 16 clean; parts 16 of 24 with 5 in 16. One catch more in 24 is inside the noise of 12 cases; false alarms are five times as many (each is a repair round and can drop a block), and parts are not faster (the p50s overlap; the machine and providers were shared). The 9 of 12 did not reproduce. Gate not passed: `FACT_VERIFY_PARTS` stays off. `FACT_VERIFY_PARTS=background` (new value, `factPartsOn()` true only in the background lane, at most 4 parts at once) is there for a re-run on a larger set; `=1` is unchanged.

### Decision and what is on
- `INSTANT_LAYER`: **ON by default** (`=off` removes it): the gate (median to an open personal lesson under 15 s, worst under 60 s at 3 at once, facts no worse) passed on the levels that have a shared lesson (median 3.8 to 4.6 s; 21.6 s worst at 3 at once; the facts: the deterministic gate plus 1 of 191 judged, against 15 of 182 before the claim rule); for a level with no shared lesson nothing changes (the old path), and the holdout arm and non-tailored accounts are served as before. It is only as good as the coverage in section 1 (1.4% of landing levels today): **the merge value of this branch depends on pre-writing the base levels, which is the owner's spend call** (about $0.43 a level on the key's full gate as measured, $95 for the 220 launch-grade levels).
- `CORAL_WARM_RETRY` (default on; `=off` is the old behaviour) and the Coral account cap 5 (a pool group): on, unit-tested.
- `FACT_VERIFY_PARTS`, `WRITE_REUSE`, `BLOCK_FILL_LENIENT`: unchanged, off. `FACT_VERIFY_PARTS=background`: new, off.
- New scripts: `base-coverage.js`, `prewrite-base.js`, `lesson-layer-proof.js`, `lesson-layer-test.js` (in `npm test`), `coral-fill-replay.js`; raw results in `docs/instant-layer/`. `first-lesson-timing.js` now polls the layer and prints a summary line.
All simulated learners and AI judges; small samples (1, 3, 10 learners per run); other agents' work was on the machine (CPU 30 to 39% average) and on Coral's key (the 429s above).

## Phone width and scrolled reader (6 Nov 2026; real browser, 375 x 812, real layer texts from the proof run, model calls stubbed)

The desktop check above missed these. Before the fix: a reader past the slot moved 167 px when a long layer filled and 430 px when a layer failed, because the browser's scroll anchoring and the code both corrected. A short layer kept 325 px of empty card. After: the code measures what really moved and corrects only that, and the reserve ends when the layer arrives.

| case | before | after |
|---|---|---|
| long layer, reader past the slot | moved 167 px | 0 |
| failed layer, reader past the slot | moved 430 px | 0 |
| short layer, top of page | card 430 px, content 105 px | card 147 px, first block moved 0 |

Tested in Chromium only. Safari has no scroll anchoring, so the same measure-and-correct path should cover it, but that has not been run.

## 6 Nov 2026, round 3: the cheap base gate, its price, the lost levels, the strong learner again
All AI-judged or simulated, small samples, other agents on the machine and on the providers' keys.

**1. Why a base write found "no slot available" (fixed).** `verifyLevel` and `repairCall` called `ai.structuredDetail` with no `dataClass`; with no learner that defaults to the learner class, and the pool only adds the pipeline-only slots (ZeroGPU, grok-4.3, which `fact_verify`'s allow list names) for a pipeline-class request. So the candidate list was empty and the call ended at 0 s (a trace now names the blocked slots when nothing ran, `ai.js`). Fix: both calls carry `poolClass(userId)` (`services/block-levels.js`, tested in `scripts/base-gate-test.js`). Before: 4 of 4 base writes failed in 12 to 28 s; after, 6 of 6 written. New switch `BASE_GATE=pool` (OFF): a shared level is written on the pool's gate (free tier: ZeroGPU, then grok-4.3) and is not sent to the Sonnet check (`BASE_GATE_SONNET=on` brings it back); the plan is stamped `base_gate: 'pool'`.
**Catch rate against the Sonnet gate**, same 12 planted and 8 clean levels (`docs/fact-verifier-set.json` put back in stored levels, base-write path, whole-level read, 3 at once; `scripts/fact-parts-eval.js basecheap|sonnet`; AI-planted):
| gate | caught /12 | false alarms /8 | levels read /20 | p50 s | cost, 20 reads |
|---|---|---|---|---|---|
| pool gate (ZeroGPU, grok-4.3) | 8 | 1 | 20 | 32 | $0.42 ($0.021 a read) |
| Sonnet gate (`FACT_PIPELINE=sonnet`) | 9 | 3 | 19 | 43 | $2.69 ($0.135 a read) |
The pool gate catches one fewer of 12 (inside the noise of 12 cases, but fewer is fewer), with fewer false alarms. **Kept OFF.**

**2. Six new levels (Algebra 1 Part A 179, 221, 254, 296, 338, 380), 3 at once, pool gate** (`prewrite-base.js --fast --tier free`, spend from the process's own run-cap counter, not the shared ledgers): 6 of 6 written and servable, 165 s wall, 85 s median a level (42 to 115), **$0.052 a level** (Coral writes $0.082, grok-4.3 $0.167, ZeroGPU $0.049, Gonka $0.014 for the six). Then the Sonnet check of those same six (`--upgrade-only`, `FACT_PIPELINE=sonnet`): 6 of 6 verified, 2 to 4 rounds each, 10 to 21 claims not verified a level, 2 blocks dropped (296 and 380, 9 to 8), 144 to 314 s a level, **$2.22 Anthropic, $0.37 a level**. So levels that passed the pool gate still had claims Sonnet repaired or removed: the cheaper gate gives less assurance, and the true prices are $0.05 (pool gate), $0.37 (Sonnet after it), $0.43 (Sonnet from scratch, round 2). Levels that matter most (not built, not spent): the 220 missing launch-grade start levels (19 grades with 5 or more enrolments, test accounts included): Algebra 1 Part A (12, now written in a temp DB, see 3), then reading/foundations (20), reading/early_decoder (20), english/reading (20), the other reading grades (4 to 16 each); Spanish entry is covered. At $0.05 they cost about $11, at $0.43 about $95; the top 3 units of every grade for strong learners (442 levels) $23 or $190. No bulk build is proposed before the curriculum is tested.

**3. The 6 paid levels survive** in the round-2 temp DB (`C:/Users/admin/AppData/Local/Temp/fl3/db-base.json`; the server and `data/db.json` never had them). Exported with their fact-check results (Sonnet verified, 2 to 4 rounds, 74 to 141 claims, cost $0.18 to $0.45 each, $1.63 in all) to `docs/instant-layer/base-algebra-1-part-a-6-levels.export.json`; the 12 levels (those 6 plus the six above) to `...6-new-levels-pool-gate-then-sonnet.export.json` (named for the new six; it holds all 12). The format is `services/base-content.js`'s; to import, copy into `content/base-levels/` (the server adds what is missing on start, overwrites nothing). Not done here (the live server is not touched). `scripts/export-base-plans.js`.

**4. Strong learner at level 465 again, with the Coral fixes** (old path: `INSTANT_LAYER=off`, so the learner waits for the personal level; real models, simulated learners, 3 at once and 6 at once with a weak, a random and a mid learner):
Seconds to a usable personal level (strong learners are placed on 465 after 10 answers):
- before the fixes (two runs of 3 strong, 5 times known): 583.5, 608 (timeout), 601 (timeout), 123.5, 65.3: worst timeout.
- after, 3 strong at once: 41.8, 166.9, 340.5: median 167, worst 340.5.
- after, 6 at once (3 strong, weak, random, mid): strong 357.7, 40.8, 213.5; weak 278.8, random 139.0, mid 153.7: median 213.5, worst 357.7.
No timeout, no failure (against 2 timeouts in 5). Slots (cost tracker of each server): Coral Fast fills 9 calls in 13 attempts (6 in 7 in the 3-run), against 4 to 6 attempts a fill before; one bad Coral reply kept in all of it. Cost: $0.075 (3 learners) and $0.159 (6) at list price, about $0.025 a learner. Still slow: some layouts still fell to Gonka or NVIDIA after a Coral 429 (the account's 5 in flight is shared with other work) at 106 to 234 s, and a fact read at 45 s hedged to grok. The gate (median under 15 s) is NOT met on this path: the personal level takes minutes; what removes the wait is the instant layer, which needs a base lesson at the landing level.


## 7 Nov 2026: cold write, part by part (`COLD_FIRST_BLOCK=on`, default OFF)

All AI-planted or simulated, not real-learner proof. Other agents on the machine and on the same provider keys throughout.

**What it does.** The fill is streamed (Coral Fast); the first block goes to its own fact read the moment it is written, the page opens when that read passes, later parts appear below in order as each passes, with the earlier blocks as context. Each part goes through verifyAndRepair, key gate and blind re-solve; block_fill stays "downstream" of verifyLevel in the fact guard. A prewrite stops after the first part and parks (about a cent a guess, not five); a guess on top for 3 answers writes the rest. Nothing unchecked is shown (`scripts/first-block-test.js`). The wait shows the curriculum's topic and skills and the real stage, from no model.

**Part read against whole level** (`scripts/part-read-eval.js`, `docs/cold-write/part-read-summary.json`; 36 planted, 24 cross-part planted (only visible against an earlier block), 24 clean; same-against-same in the reps):

| route | planted /36 | cross /24 | false alarms /24 | p50 s |
|---|---|---|---|---|
| shipped route, whole level | 20 | 15 | 1 | 37 |
| shipped route, part with context, hedge 6 s | 24 | 21 | 5 | 19 |
| shipped route, part with context, hedge 20 s | 24 | 21 | 7 | 27 |
| grok-4.3 whole, twice | 20, 22 | 16, 15 | 2, 1 | 14, 19 |
| grok-4.3 part alone, twice | 21, 23 | 21, 19 | 9, 6 | 19, 8 |
| grok-4.3 part with context | 25 | 22 | 8 | 12 |
| ZeroGPU part alone, twice | 21, 27 | 21, 22 | 1, 2 | 20, 20 |
| ZeroGPU part with context | 25 | 22 | 1 | 7 (p90 50) |
| ZeroGPU whole | 8 (25 of 84 read) | 1 | 0 | 43 |

Paired on the shipped route: parts caught 11 to 12 errors the whole read missed, the whole read caught 1 to 2 parts missed. What must be true: one read at a time per part (ZeroGPU fails past about 5 at once, which is why `FACT_VERIFY_PARTS` lost), earlier blocks given as context, a read that fails holds the part back. The cost is false alarms, 21 to 29% against 4%: each is a repair and a re-read, so the later parts are slower, not weaker.

**Timing, seconds from end of placement to the first checked part open** (real models, a copy of the database with no shared Algebra 1 Part A lessons, strong learners at 465 after 10 answers, weak at 10, random 5 to 95% right, THINK_MS 7500, held-out timing seeds 20261117 to 22). Gate: median under 15, worst under 60, 3 at once.

| run | learners | open each | median, worst | next part appears, median | whole level, median, worst | CPU avg |
|---|---|---|---|---|---|---|
| before (6 Nov, whole level) | 3 strong; 6 mixed | | 167, 340; 213, 358 | | same | |
| h1 | strong (placed at 423) | 0.1 | 0.1 | 105 | 143 | 27% |
| h3a | strong, weak, mid | 0.1, 0, 15.8 | 0.1, 15.8 | 34 | 98 to 161 | 37% |
| h3b | strong, 2 random | 28, 12.7, 22.9 | **22.9**, 28 | 162 | 209 to 236 | 30% |
| h3c | 3 strong | 7.3, 0.6, 19.6 | 7.3, 19.6 | 139 | 104 to 299 | 36% |
| i10 | strong, weak, mid, random | 0 to 38.5 | 22.7, 38.5 | 85 | 180, 259 | 31% |

At 3 at once, 9 learners pooled: median 12.7, worst 28; one run of three misses the median alone. All 20 learners, per individual: median 10.4, worst 10% 28, worst 5% 31.9, worst 38.5 (n = 20, so worst 1% is the worst). No failure in these runs and no part shown unread. **Not met, stated plainly:** the next part. After the first part the learner can wait about 1 to 3 minutes (median 90.1 s, worst 172 s), most of it fact reads of 30 to 45 s on grok-4.3 with other agents on the same keys, and false alarms (each a repair and a re-read). Single reads measured alone: 8 to 12 s. So the page says so after 45 s and offers the standard session.

Cost: ledger deltas over each run, shared with other agents, so upper bounds: $0.17 (1), $0.38 to $0.50 (3), about $1.57 (10): about $0.16 a learner, including levels 2 and 3 written ahead, against about $0.09 for whole levels before; a wrong guess costs a layout, one small fill and one read, about a cent. All prepaid credits.

Causes found and fixed in these runs: the fast lane tried free NVIDIA first despite its paid order (2 to 64 s); checks that run to the output cap; a derail thrown to slow slots (112 s); a prewrite's read with no deadline (115 s), and a prewrite's fill sitting on a free slot (304 s); part reads falling to a free model in the background lane, now never for a part a learner will see; a holdout learner, whose write is the shared level, not seeing its parts (228 s). None of these is a change to what a check tests.

**Onboarding v2:** it opens lesson 1 of the found grade at once. A guest (no account yet) has no outside-AI consent, so this path does not run for them: `mayGenerate` and the consent rule send them to the standard session, unchanged, and that was read in the code, not run, because the branch is not merged. Those 150 or so lesson 1 levels are also the most predictable levels in the app: a shared lesson on each would open instantly for everyone, at $0.05 to $0.43 a level. That is a bulk build, the owner's decision.

**Default: OFF.** `COLD_FIRST_BLOCK=on` turns it on. The gate passes pooled and in two of three runs at 3 at once, so it stays off under the rule; recommended on for the beta: the alternative for these learners is the standard session at 8 s. Limits: 60 planted errors are AI-planted (some weak, 4 of 12 read earlier), Chromium only, small samples. Not real-learner proof.

**Also tested.** Coral derailing: stream with watchdog stops a loop at about 1000 characters instead of the cap and keeps the blocks already written; 465 replay 11 of 12 usable, first block 0.7 s, against the shipped warm retry 12 of 12 at 8 s on the same layout (this layout derailed little, so the 8 of 12 was not reproduced). Plan first: Coral Fast layout 2.6 s and first block 1 s, so writing is not the limit, the read is. Placement guesses: the rule on main already starts the level in time for 95% (simulated, 3 answers ahead, 2.3 guesses); from answer 3 with up to 10 guesses 99% for 6.0: not adopted. MiniMax writer with Coral Standard reader: 3.6 s, but flagged 8 of 9 clean first blocks: not adopted. Phone width, real browser (375 x 812, Chromium): the first block did not move when parts arrived at scroll 0 and at scroll 300; answering mid-way works, early finish refused, finish works; the slow-part note appeared at 45 s without moving the page; the failed notice was shown with the poll stubbed, not from a real failure.
