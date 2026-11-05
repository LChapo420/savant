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
