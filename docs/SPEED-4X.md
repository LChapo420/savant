# Four times faster? (SIMULATED; not proof about real learners)

Owner, 6 Nov 2026: at least 4 times faster learning the same material, with equal or more retention, than normal studying.

**Round 4, 7 Nov, is the latest: `docs/speed-real/ROUND4.md`: three plain bugs and massed retention levels were most of the real path's time, and the path about halves; against careful study still about x0.85 to x1.45.** Round 3, 6 Nov: `docs/speed-real/ROUND3.md`. ** It corrects "today" below: the real path takes about 2x the hours these rounds assumed, baselines now include rereaders, a typical student and tutors from published effect sizes, each lever has its own gate, and only SPEED_FAST_ITEM is on by default.**

**Answer: no. Not reached, and not reachable in this learning model.** Round 2 is below; this paragraph is round 1. The levers are built in the real code, each behind a switch, all off. On held-out seed 20261106 (160 learners: 120 extreme, 40 ordinary) the best configuration that keeps recall up throughout is 1.03x to 1.17x against dense self-study. The configuration that lets recall fall and rebuilds it at the end reaches 1.70x at most against dense self-study, and 1.85x against a schedule most learners complete. **No learner reaches 4x in any headline run.** The gate is missed. Not merge-ready.

## Round 2: attacking the floor (SIMULATED; gate MISSED)

**Straight answer: more levers will not close this. The model cannot show 4x without assuming it.** Everything added on the audited model takes a 1-year goal from x1.12 to x1.22 against dense self-study (safe arm, real stop). With an oracle stop and no pages at all, which nobody can run, it reaches x1.41. Reaching 4x needs the model's learning rate raised about 5x and its memory growth cubed, and only in that unrunnable arm. Those are the claim itself, not levers.

Held-out seed 20261107 (160 learners: 120 extreme, 40 ordinary), new because round 1's seed had been read. Arms frozen on design seed 777002 first. The rate per practice is unchanged in every headline run. `end` stays off and is not in these tables.

### The same table (mean, per learner)

safe3 = safe + one-tap items + two-skill review items. **It cannot run today: the banks have no two-skill items.** safe_fast is what the built code offers now, and its time saving is assumed.

| goal | today h | safe h | safe_fast h | safe3 h | safe3 x dense: mean / median / worst 10, 5, 1% (n) | safe3 x self-study at 95% | at 4x |
|---|---|---|---|---|---|---|---|
| 1 week | 15.1 | 14.9 | 14.1 | 13.7 | 1.14 / 1.13 / 0.94, 0.87, 0.75 (108) | 1.23 | 0 |
| 1 month | 17.9 | 17.3 | 16.3 | 15.8 | 1.14 / 1.13 / 0.98, 0.93, 0.89 (107) | 1.24 | 0 |
| 6 months | 21.4 | 21.1 | 19.8 | 19.3 | 1.19 / 1.18 / 1.05, 1.01, 0.92 (88) | 1.31 | 0 |
| 1 year | 23.1 | 22.6 | 21.2 | 20.7 | 1.22 / 1.21 / 1.09, 1.06, 0.97 (89) | 1.34 | 0 |
| no test day (3 y) | 25.8 | 25.5 | 23.8 | 23.4 | 1.28 / 1.28 / 1.16, 1.13, 1.05 (84) | 1.36 | 0 |
| dated test, 1 year | 24.0 | 22.6 | 21.2 | 20.7 | 1.22 / 1.21 / 1.09, 1.06, 0.97 (89) | 1.33 | 0 |

By kind and age band at 1 year, safe3: x dense 1.16 to 1.26 across kinds and 1.21 to 1.26 across bands; x today 1.08 to 1.15 and 1.11 to 1.14. On a dated test at 1 year, fixed-N cram (x0.78) and the typical tutor (x0.71) are still faster, in a model where understanding never fades. Every goal and arm: `docs/speed-4x/round2-report.txt`.

**Gate: MISSED, 8 misses for safe3, 8 for safe_fast, 32 for safe.** For safe3:

- All learners reach the target with all understood: 90% at 1 week, 98% at 1 month, 95% dated 1 week, 98% dated 1 month.
- Worst 10% against today: x0.95 at 1 week, x1.00 at 1 month and dated 1 week, which is not faster.
- tail_both at 1 week is no faster than today.
- From 6 months up, safe3 and safe_fast pass.

### Each lever at 1 year

| lever | h | x dense | all understood at 1 week | verdict |
|---|---|---|---|---|
| safe (baseline) | 22.6 | 1.12 | 88% | |
| 3. placement by skill | 23.0 | 1.10 | 85% | **slower** |
| 1. + implied mastery | 23.0 | 1.10 | 73% | **slower**, and wrong inferences slip past the sampling |
| 4. item at the edge | 23.3 | 1.08 | 88% | **slower** |
| 2. two-skill review items | 22.0 | 1.14 | 88% | small, and it needs items the banks do not have |
| 5. less friction (assumed 2 s + 2 s) | 21.2 | 1.19 | 89% | the largest; unmeasured |
| 2 + 5 (safe3) | 20.7 | 1.22 | 90% | |
| all of them (safe2) | 21.4 | 1.18 | 81% | worse than 2 + 5 |

**Why placement does not help.** Test-out already asks before teaching, so moving those questions to the start saves nothing, and hard-pitched items cost more misses. A skill that is known still has to be remembered. Review hours do not move.

### How much it depends on what learners already know

Every arm changes, baselines included. A 1-year goal:

| learners know | first-pass floor h (oracle, no pages) | today h | safe h (x dense) | safe3 h (x dense) | placement + implied h (x dense) | floor arm h (x dense) |
|---|---|---|---|---|---|---|
| nothing | 11.5 | 25.4 | 26.3 (1.03) | 24.2 (1.11) | 26.4 (1.02) | 21.7 (1.25) |
| less (-1) | 10.1 | 24.5 | 25.1 (1.06) | 23.0 (1.15) | 25.3 (1.04) | 20.3 (1.30) |
| audited | 7.8 | 23.1 | 22.6 (1.12) | 20.7 (1.22) | 23.0 (1.10) | 17.9 (1.41) |
| more (+1) | 4.8 | 21.2 | 18.8 (1.25) | 17.1 (1.39) | 19.2 (1.24) | 14.7 (1.59) |
| much more (+2) | 2.7 | 19.7 | 15.2 (1.46) | 13.6 (1.63) | 15.7 (1.42) | 12.3 (1.78) |
| nearly all (+3) | 1.9 | 19.1 | 13.5 (1.56) | 11.8 (1.77) | 13.8 (1.54) | 11.3 (1.87) |
| audited, hierarchical | 6.9 | 22.5 | 21.5 (1.15) | 19.7 (1.25) | 22.0 (1.13) | 16.9 (1.46) |
| +1, hierarchical | 4.0 | 20.6 | 17.5 (1.32) | 15.8 (1.47) | 18.1 (1.29) | 13.8 (1.66) |

Knowing more helps a lot, but a learner who knows nearly everything still spends about 10 h keeping it for a year. Placement beats plain test-out at no level. With no prior knowledge, safe is slower than today (26.3 h against 25.4 h).

### The new floor

| | first pass | total at 1 year, recall kept throughout | x dense |
|---|---|---|---|
| round 1 floor (oracle stop, no pages) | 7.3 h | 19.6 h | 1.29 |
| round 2 floor (+ two-skill items, less friction) | 7.8 h, which now also carries review | 17.9 h | 1.41 |

The first-pass floor did not fall. Two-skill first-pass items move review work into it. Review fell from 12.3 h to 10.1 h. The target of 4x of 24.6 h is about 6 h, and review alone is 10 h.

The cost per answer is the assumption that matters most (every arm): at 12 s per step the floor total is 6.0 h (x2.33), safe3 9.5 h (x1.47), today 12.7 h. Pages then dominate the baselines, so cutting them pays. At 20 s and 15 s: safe3 13.3 h (x1.33), floor 10.0 h (x1.77).

### Measured time: nothing usable yet

The logs hold 3,938 answers from 79 test-looking accounts, 96% at round half-seconds, so scripted. One other account has 298 answers (157 over 1.5 s, median about 8 s, p90 about 25 s), and the logged time does not include reading feedback. One person, possibly trying the app, is not evidence. So no measured value goes into a headline. **The 35 s may be far too high, and the sim's "right answer" time is a guess.** `scripts/speed-rate-check.js` reports this from a database copy, with the owner's learner account and test accounts left out.

### What rate 4x would need (what-ifs, never headlines)

Against dense self-study at 1 year. "Rate" is what a page or answer teaches; "memory" is a power on growth per spaced right answer (2 means x1.6 becomes x2.6).

| assumed for Savant only | safe3 (runnable) | floor (unrunnable) | floor learners at 4x |
|---|---|---|---|
| audited | 1.22 | 1.41 | 0 |
| rate x3 | 1.60 | 2.00 | 0 |
| rate x10 | 1.75 | 2.19 | 0 |
| memory power 2 | 1.65 | 1.98 | 0 |
| rate x3, memory 2 | 2.25 | 3.12 | 0 |
| rate x5, memory 2 | 2.42 | 3.40 | 1 of 89 |
| rate x5, memory 3 | 2.78 | 4.18 | 62 of 89 |
| rate x10, memory 3 | 2.90 | 4.36 | 74 of 89 |
| 12 s items, rate x2 | 1.87 | 3.01 | 0 |
| 12 s items, rate x3, memory 2 | 2.70 | 5.19 | 84 of 84 |

The runnable column understates these what-ifs, because its tracker is not told about the higher rate and keeps asking. A refitted tracker would land between the two columns. **Rate alone never reaches 4x, even at x10**, because review time is untouched.

**What would justify it.** The model already goes from 50% to 89% right in about 8 answers, about 0.26 logits per answer. Koedinger et al. 2023 (PNAS) reported about 0.1 logits per practice across 27 datasets, and about 7 to 8 attempts from 65% to 80%, with students' rates strikingly similar ([Stanford abstract](https://psychology.stanford.edu/events/colloquium-36), [Hechinger](https://hechingerreport.org/proof-points-the-myth-of-the-quick-learner/); the paper itself was not read). A [2026 re-analysis](https://arxiv.org/pdf/2605.01690) disputes how similar those rates are, not their size. So the model is already about 2.6x that figure, and rate x5 would be about 13x it. I found no evidence for that, or for cubing memory growth. It would take a controlled study showing it, not another lever.

**How real testers would check it** (needs 30 or more real learners, no simulation):

1. Rate: `scripts/speed-rate-check.js` fits gain per answer. Compare with 0.26 and 0.1.
2. Seconds: real seconds per answer from `items.ms`. Time on feedback is not logged yet and has to be added. With SPEED_FAST_ITEM on and off in random groups, the difference is the real saving.
3. Memory: delayed probes at 7, 30 and 90 days, unannounced, to fit growth per spaced right answer.
4. Skips: learners who skipped a page against those who read it, on later checkpoints and delayed probes, by item. This is what round 1 found to be the biggest risk.
5. The claim itself: hours to a delayed test against a control group studying the same material their own way. Only that can say 4x. The base-arm holdout (`services/beta-arm.js`) can supply the Savant comparison; a self-study group has to be recruited.

### Built in round 2 (all off; off is today's behaviour)

- `SPEED_SKILL_PLACEMENT=on` (`services/speed-placement.js`, `routes/speed-placement.js`, `/skill-check`): a check offered on the path. Settled levels are stepped over, never a checkpoint, and they are listed on the path with a way in.
- `SPEED_IMPLIED=on`: a pass settles what the skill builds on. One in three of those is asked, and a miss revokes that pass; a later miss puts the skill on a revisit list. **The built-in grades state no graph, so the previous skill in the grade stands in, and the one look taken inferred "shapes" from a number skill.** Uploaded courses have a real graph and already place on it (`services/material-path.js`). Not recommended on this evidence.
- `SPEED_EDGE=on`: picks difficulty by expected information. The mapping from the bank's 1 to 10 scale is assumed.
- `SPEED_COMPOSITE=on`: an item naming `also_skills` counts as an attempt on each. **No bank item names any, so it does nothing until such items are written.** The 12 word-problem skill slots in math are not mapped to the skills they use.
- `SPEED_FAST_ITEM=on`: one-tap multiple choice, no confidence row, and a right answer moves on after a tick. It removes a scorecard signal (stated confidence), and that cost is not measured. One-tap was not seen working in the browser, because the items shown were typed.

Tested: `scripts/speed-levers-test.js` (20 checks), and the skill check driven in the browser on a temp database. The two-skill items in the sim update each skill exactly as two separate answers would; only reading time is shared (half an item time, assumed; x1.20 and x1.21 at no saving and at a quarter).

Reproduce: `bash scripts/speed-4x-run2.sh RAW`, then `node scripts/speed-4x-report.js RAW/design.json RAW/held.json RAW/rule.json --arms=safe,safe_fast,safe3` and `SPEED_ARMS=safe,safe3,safe_implied,floor_first,floor_first2 node scripts/speed-4x-variants.js RAW`.

## Round 1

### The measure

Per learner: hours until all 50 skills are understood (k >= 0.85) and mean recall at the chosen horizon is at least 0.70. Ratio = baseline hours / Savant hours. It is counted only where both reach the target, and the Savant arm must also have every skill truly understood. A baseline that misses the target is never counted as a win.

Baselines come from docs/FASTER-BY-GOAL.md, with the design seed (777002, 80 learners) picking every fixed plan: dense and sparse generic self-study, normal fixed N, typical tutor fixed N. Added: self-study on a generic expanding schedule, the widest of nine ratios written before any run that reaches 95% on the design seed (1.15 to 1.2). "Today" is the round 3 rule, on by default since 5 Nov.

The two arms were frozen on the design seed before the held-out seed ran:

- **safe**: all levers; predicted recall is kept over the target on every day of the goal.
- **end**: all levers; reviewing only in a final window before the goal's last day. Recall between falls to about zero, so it is not "remembering for a year" in the owner's plain sense. It is shown because the requested measure is recall at the horizon.

## Result (held-out seed; mean, per learner)

| goal | today h | safe h | end h | safe x dense: mean / median / worst 10, 5, 1% (n) | end x dense: mean / median / worst 10, 5, 1% (n) | safe x self-study at 95% | end x self-study at 95% |
|---|---|---|---|---|---|---|---|
| 1 week | 14.7 | 14.6 | 15.8 | 1.06 / 1.03 / 0.90, 0.84, 0.74 (97) | 0.99 / 0.96 / 0.81, 0.74, 0.68 (105) | 1.13 | 1.06 |
| 1 month | 17.5 | 16.9 | 16.3 | 1.05 / 1.04 / 0.92, 0.88, 0.85 (102) | 1.10 / 1.08 / 0.88, 0.81, 0.73 (99) | 1.13 | 1.20 |
| 6 months | 20.9 | 20.6 | 16.6 | 1.08 / 1.07 / 0.99, 0.96, 0.86 (80) | 1.40 / 1.34 / 1.08, 1.01, 0.89 (77) | 1.20 | 1.53 |
| 1 year | 22.6 | 22.1 | 16.6 | 1.11 / 1.11 / 1.02, 0.98, 0.91 (83) | 1.55 / 1.48 / 1.17, 1.10, 0.96 (79) | 1.22 | 1.68 |
| no test day (3 y) | 25.2 | 24.9 | 24.5 | 1.17 / 1.16 / 1.09, 1.05, 0.99 (77) | 1.19 / 1.17 / 1.11, 1.08, 1.05 (77) | 1.24 | 1.26 |
| dated test, 1 year | 23.4 | 22.1 | 15.1 | 1.11 / 1.11 / 1.02, 0.98, 0.91 (83) | 1.70 / 1.65 / 1.32, 1.23, 1.11 (73) | 1.22 | 1.85 |

Dense self-study reaches the target for only 48% to 72% of learners, so its n is small. Against fixed-7-pass cram on a dated test, safe is slower (0.72x at a year) and end about level (1.08x), but only where end succeeds. Against the typical tutor, safe is 0.65x and end 0.98x at a year. Every goal and all per-learner numbers: `docs/speed-4x/held-report.txt`.

**By kind and age band** (mean ratio against dense self-study, 1 year): safe 1.06 to 1.17 across kinds, 1.07 to 1.13 across bands; end 1.42 to 1.98 across kinds, 1.42 to 1.69 across bands. Against today: safe 0.99 to 1.06 across kinds (age_young is slower), end 1.30 to 1.58.

## Gate: MISSED, both arms

Required at every goal: every learner reaches the target with all material understood; the worst 10% and every kind and age band faster than today.

| | safe | end |
|---|---|---|
| reach the target | 100% at every goal | 100% on horizons; **38%, 67%, 96%, 99% on dated tests** of 1 week, 1 month, 6 months, 1 year |
| reach it with every skill understood | 87% at 1 week, 93% dated 1 week, 100% elsewhere | 91% to 93% on horizons, 26% to 86% dated, 100% with no test day |
| worst 10% against today | 0.88 to 0.98, never above 1 | 0.79 and 0.91 at 1 week and 1 month, 0.97 with no test day, 1.00 to 1.25 elsewhere |
| recall on the day | 0.82 to 0.92 (today 0.87 to 0.99) | 0.86 to 0.89 |
| lowest course recall during the goal | about 0.8 | about 0 at a year |

The end arm's failures on short dated tests were not seen on the design seed, because the design sweep looked at horizon goals. It was not re-tuned after the held-out seed was read; doing so needs a new held-out seed.

## The ladder (held-out, mean h at 1 week / 1 year; lessons + practice + review at 1 year)

| arm | 1 week | 1 year | split at 1 year | note |
|---|---|---|---|---|
| today | 14.7 | 22.6 | 6.0 + 4.5 + 12.1 | its first pass stops on TRUE understanding, which no app can see |
| the page as today, stop on the tracker | 14.5 | 22.9 | 6.0 + 4.7 + 12.2 | the cost of not being an oracle |
| 1. test-out (true stop) | 13.9 | 22.4 | 4.8 + 4.9 + 12.7 | saves about 0.5 h; 20% of page time goes |
| 2. + short lesson (true stop) | 13.3 | 22.0 | 3.6 + 5.7 + 12.6 | saves about 0.5 h more; 40% of page time goes, practice rises |
| 3. + mastery stop on the tracker | 14.3 | 22.6 | 3.8 + 6.8 + 12.0 | **costs** about 0.6 to 1 h: it replaces an oracle with an honest estimate |
| 4. review to target only, alone (true stop) | 14.7 | 22.3 | 6.0 + 4.4 + 11.8 | little: at this line the miss penalty makes lower floors cost more |
| review in a final window only, alone (true stop) | 13.9 | 14.5 | 6.0 + 4.5 + 4.1 | the large saving, and the one that gives up remembering in between |

## What limits it

1. **The first pass has a floor.** In the audited model a skill needs about 9 minutes to go from its starting understanding (mean about 0.36) to 0.85, however it is delivered: a page closes half the gap for 7 minutes, and an answer closes a fifth of it for about a minute. Removing every page with an oracle stop still costs 7.3 h. A target of 6 h (4x of 24 h) is below the first pass alone. Pages are not padding in this model: cutting them mostly moves the time to practice.
2. **Prior knowledge is low.** For an average learner about 2% of skills start at 0.85 and about 9% at 0.7, so test-out has little to skip. How much a real learner already knows is an assumption of the model, and test-out would save more for someone who knows more.
3. **Keeping recall up has a floor too.** Holding recall through a year costs about 11.5 h at best (held-out) and 12 to 16 h across the review lines tried on the design seed (0.6 to 0.9). Lower lines cost more, not less, because a miss cuts memory by 60% and costs 98 s against 38 s. So the 93% to 98% overshoot in the brief is not free to remove while recall must hold throughout: it is mostly the shape of the sawtooth. Recall on the day fell from 0.88 to 0.83, and hours by 2%.
4. **Bound.** True-understanding stop, no pages at all, reviews only in a final window (nobody could run this): 10.7 h at 1 week, 11.3 h at 1 year, so about 1.4x and 2.1x against dense self-study's mean hours. **That is the most found in this model on these baselines**; it is a policy tried, not a proof of the optimum.

### What you would have to believe for 4x (what-if runs; never a headline)

Pages and answers teach this many times what the model says, Savant only, against dense self-study at 1 year (safe / end):

| teaching gain, review answer | safe | end | learners at 4x (end) |
|---|---|---|---|
| x1.3 (the typical-tutor guess) | 1.20 | 1.69 | 0 |
| x1.8 (the Bloom-like ceiling) | 1.31 | 1.85 | 0 |
| x3 | 1.43 | 2.10 | 0 |
| x3, 15 s review answers | 2.13 | 2.99 | 6 of 83 |
| x5, 15 s review answers | 2.32 | 3.33 | 13 of 83 |

## Which assumptions the ratio leans on (each varied, held-out seed; `docs/speed-4x/variants.txt`)

Hours are mean h at 1 year. Ratios are against dense self-study in the same variant.

| assumption | variant | safe h, x dense | end h, x dense | what it does |
|---|---|---|---|---|
| reading speed | pages take half the time | 20.2, 1.06 | 14.9, 1.52 | faster reading helps the baselines more; safe is then slower than today (x0.97) |
| | pages take 1.5x | 24.0, 1.15 | 18.4, 1.59 | slower reading helps the ratio |
| **a skipped page really was known** | checks miss 20% of a page's content | 22.1, 1.09 | 16.6, 1.21 | hours unchanged, but learners with every skill understood fall to **43%** (safe) and **7%** (end) |
| | checks miss 40% | 22.1, n/a | 16.6, n/a | **0%** with all understood; recall 0.76 to 0.81. The biggest risk found |
| answers teach without the page | half as much until read | 23.9, 1.02 | 18.1, 1.18 | at 1 week all-understood falls to 28%. Retrieval first depends on this |
| easy checks | guess chance 0.5, tracker assumes 0.25 | 17.5, 1.23 | 12.3, 1.80 | looks faster but stops early: all-understood at 1 week is 57% |
| tracker's belief in learning | 1.5x too high | 21.1, 1.16 | 13.7, 1.76 | stops too early: all-understood at 1 week 53%, end 57% at a year |
| | 0.7x | 23.4, 1.05 | 19.6, 1.33 | safe but slower than today |
| understanding never fades (the model's) | a deep lapse costs half of it | 22.3, 1.13 | 16.9, **reach 9%** | end collapses; safe holds |
| | costs all of it | 22.6, 1.14 | 17.2, **reach 4%** | end collapses; safe holds at a year, though all-understood at 1 week is 76% |
| forgetting | half-lives x0.5 | 24.4, 1.16 | 17.9, 1.77 | |
| | half-lives x2 | 20.5, 1.12 | 16.2, 1.48 | |
| shorter review answers | 15 s, Savant only | 15.5, 1.62 | 11.9, 2.20 | the largest single lever |
| | 15 s, baselines too | 15.5, 1.10 | 11.9, 1.49 | most of the gain goes if the self-studier also uses quick cards |

The end arm's whole advantage rests on understanding never fading. That is an assumption of the audited model and very unlikely to be true over a year, so **end must not be switched on for horizon goals on this evidence**.

## Changes to the model

None in the headline runs. The learning code is unchanged, and baselines and today use it as audited. All new parameters default to the audited behaviour.

- **Prerequisite credit (extension, off, shown both ways):** a right answer also counts as a part-review of a prerequisite (half the skills, credit 0.25 or 0.5). The argument is Math Academy's fractional implicit repetition, as described in [Hecker's review of *The Math Academy Way*](https://frankhecker.com/2025/02/14/math-academy-part-7/) and [Matuschak's notes](https://notes.andymatuschak.org/Math_Academy). Those sources describe a design and report no outcome data, and a search found no controlled evidence for the credit. Result at 1 year: safe 22.1 h without, 20.5 h at 0.25, 19.4 h at 0.5 (x dense 1.11, 1.20, 1.27), but all-understood falls to 96% at 0.5 and worse at 1 week; end fails more (66% reach at 0.5). **Not built in the app**: the built-in courses have no prerequisite graph.
- A staged first pass (stop early, finish by spaced practice) was tried on the design seed, prompted by successive relearning. [Rawson and Dunlosky 2011](https://doi.org/10.1037/a0023956) was confirmed to exist, but its findings were not retrieved, so it is not cited for a result. It is used only in the end arm, and it did not save time at short goals.

## What is built (all off; off is today's behaviour)

`services/speed-levers.js`, wired into `services/sessions.js`, `services/mastery.js`, `services/retention-goal.js`, `routes/learn.js`, `routes/profile.js`, `public/js/session.js`, `path.js`, `dashboard.js`. No new collection: new fields sit on the account's items, sessions and lessons rows. No restyle.

- `SPEED_TESTOUT=on`: a lesson opens on its check questions. All right skips the page, says so, and offers "Read the page anyway"; skipped pages are listed on the path.
- `SPEED_SHORT_LESSON=on`: a miss shows only the part it calls for; "See the whole lesson" is one tap away. A typed answer still being checked waits for its verdict; if the verdict is too slow, the whole page is shown.
- `SPEED_MASTERY_STOP=on`: once the tracker is confident, the rest of that skill's items in the block are set aside and marked, and following practice levels on it are passed over, with a message. Lessons and checkpoints are never passed over.
- `SPEED_REVIEW_TARGET=on` (`SPEED_REVIEW_MODE=through` by default): reviews only under target + margin, up to the goal's last day, on both the recall queue and the fitted-curve queue.
- `SPEED_ALL=off` turns all of them off. A base-arm learner reads them all off. A learner who chose feedback at the end keeps today's flow.

Tested: `scripts/speed-levers-test.js` (14 checks), and driven by hand on a temp database in the browser and over HTTP (skip, miss with a part, path list, read a skipped page).

**Not done or not proven:**

- No real learner has used it. The app's rule shares its constants with the simulation, unfitted to anyone.
- The app's tracker uses a flat learning rate of 0.8; the simulation's has a noisy per-learner one.
- Picking the page part is word overlap. In the one look taken it chose a poor section for the question.
- With test-out on, the current lesson opens in the session with its session lesson, not the generated base page.
- Uploaded courses are not wired.
- The effect on the scorecard's accuracy, with fewer answers, is unmeasured.
- Baselines still get a first pass that stops on true understanding, and they do retrieval practice. No re-reading student is modelled, so these baselines are stronger than much real studying, and the true gap to ordinary study could be larger. Nothing here measures that.

## Reproduce (no model calls, $0)

```
bash scripts/speed-4x-run.sh RAW            # design, held-out seed 20261106, all variants
node scripts/speed-4x-report.js RAW/design.json RAW/held.json RAW/rule.json --arms=safe,end
node scripts/speed-4x-variants.js RAW
```
