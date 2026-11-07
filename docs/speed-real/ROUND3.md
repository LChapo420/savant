# Speed round 3: real baselines, one gate per lever, new levers, proof check (SIMULATED unless it says browser)

Written 6 Nov 2026 for the owner's goal: at least 4x faster than normal studying or a personal tutor, same material, equal or more retention. Nothing here is a real-learner result. Raw reports are beside this file. Reproduce: `scripts/speed-gate.js`, `scripts/speed-range-run.sh`, `scripts/speed-range-report.js`, `scripts/speed-real-report.js`, `scripts/speed-calibrate.js`, `scripts/speed-proof-walk.js`.

## Plain answer

**4x is not shown, and against careful study or a tutor it is very unlikely.** In this model, against a rereader or a typical student, it is reached on goals of a month or more, once the mastery stop is on. That result leans on assumptions about how badly rereaders remember. The likely true figure is about 1.2x to 2.4x against careful self-study, massed problems or a tutor, and perhaps 2x to 6x against a real rereader. The strongest published course-level result found is about 2x (Lovett et al. 2008); the best case found in any tutor is about 3x (Anderson et al. 1995).

## The biggest finding: the old "today" was not the app

Rounds 1 and 2 compared against a "today" that stops practice the moment true understanding reaches 0.85, which no app can see. The real path, seen in the browser on all 219 grades: a page, three checks, whole levels of 14 answers until the objective is proven (`services/coverage.js`, `compressProven`), then two retention levels that are never stepped over. That is about 2x the hours the old sim said (38 h, not 22 h, at 1 year). **So the app as it stands is slower than careful self-study in this model (x0.5 to x0.75).**

Other bugs found in the browser, all fixed:
- A built-in grade has about 8 coarse skills over about 70 lessons. Test-out, mastery stop and the proof all read the coarse skill, so right answers on lesson 1 would have passed over every later lesson on that skill. They now read one lesson's stretch.
- The stop never fired in a sitting opened on a lesson, because that session's kind is `teach`, not `lesson`.
- Answers in a `teach` sitting's practice level did not count: 14 right answers read "0 of 12 answered" and the level was repeated. This is on main today. `SPEED_TEACH_COUNTS=off` restores it.
- The tutor button covered the check bar at phone width.

## 1. Baselines, side by side

Hours to recall 0.70 of the whole course on the day (the arm must also have every skill understood). x is baseline hours / Savant hours, mean / worst 1%, (n both reach, n at 4x). Seed 20261111, 160 learners, 3 in 4 extreme. Baseline plans are picked on the design seed. A baseline that misses is never counted as a win. Default is what ships after this round. Costs "audited": 7 minute page, 35 s item. Costs "logged": 2.5 minute page (median real page 420 words), 15 s item (a cautious guess: the one real account has a median of 2 s and p90 of 16 s, not generalisable).

| goal, cost | baseline | real path today | default (fast item) | stop + fast | stop + worked + one-tap + fast, low to high | all levers, low to high |
|---|---|---|---|---|---|---|
| 1 week, audited | careful self-study | 0.47 | 0.51 / 0.44 (157, 0) | 1.08 / 0.89 (118, 0) | 1.15 to 1.33 | 1.27 to 1.69 |
| | typical student | 0.74 | 0.81 / 0.62 (76, 0) | 1.85 / 1.47 (61, 0) | 1.96 to 2.28 | 2.25 to 3.07 |
| | rereader | 0.77 | 0.84 (19, 0) | 1.95 (16, 0) | 2.08 to 2.36 | 2.39 to 3.31 |
| | massed problems | 0.47 | 0.51 | 1.11 | 1.18 to 1.37 | 1.30 to 1.74 |
| | tutor d 0.37 / 0.79 | 0.46 / 0.44 | 0.49 / 0.47 | 1.06 / 1.02 | 1.13 to 1.31 / 1.09 to 1.26 | 1.24 to 1.66 / 1.20 to 1.61 |
| 1 year, audited | careful self-study | 0.70 | 0.76 / 0.69 (157, 0) | 1.25 / 1.07 (157, 0) | 1.42 to 1.90 | 1.51 to 2.29 |
| | typical student, rereader | no learner reaches 0.70 on any fixed plan | | | | |
| | massed problems | 0.74 | 0.80 | 1.33 | 1.51 to 2.04 | 1.61 to 2.47 |
| | tutor d 0.37 / 0.79 (n 4, 5 of 160) | 0.54 / 0.53 | 0.58 / 0.57 | 1.00 / 0.97 | 1.12 to 1.49 / 1.09 to 1.44 | 1.23 to 1.87 / 1.20 to 1.78 |
| 1 month, logged | careful self-study | 0.50 | 0.60 / 0.54 (152, 0) | 1.18 / 1.00 (144, 0) | 1.13 to 1.48 | 1.22 to 1.79 |
| | typical student | 2.41 | 2.92 / 1.67 (160, 16) | 5.82 / 2.46 (152, 131) | 5.54 to 7.27 | 5.99 to 8.85 |
| | rereader | 2.41 | 2.93 / 1.63 (149, 15) | 5.80 / 3.37 (145, 127) | 5.54 to 7.31 | 6.02 to 8.94 |
| | massed problems | 0.56 | 0.67 | 1.34 | 1.28 to 1.69 | 1.39 to 2.06 |
| | tutor d 0.37 / 0.79 | 0.55 / 0.53 | 0.66 / 0.64 | 1.29 / 1.25 | 1.23 to 1.62 / 1.19 to 1.57 | 1.33 to 1.96 / 1.29 to 1.90 |
| 1 year, logged | careful self-study | 0.75 | 0.91 / 0.83 (160, 0) | 1.51 / 1.28 (160, 0) | 1.43 to 2.08 | 1.48 to 2.40 |
| | typical student (n 104 of 160) | 4.87 | 5.90 / 4.26 (104, 104) | 9.91 / 6.95 (104, 104) | 9.34 to 13.67 | about 10 to 16 |
| | rereader (n 95 of 160) | 4.91 | 5.96 / 4.24 (95, 95) | 10.01 / 6.46 (95, 95) | 9.44 to 13.81 | about 10 to 16 |
| | massed problems | 0.72 | 0.88 | 1.46 | 1.38 to 2.01 | 1.43 to 2.32 |

Read half-life at its generous end (7 days, logged costs, range middle): typical student x5.6 and stop x9.5 at 1 year; x2.9 and x5.9 at 1 month; on a dated test in 1 month x1.35 and x2.6 (rereader x2.3 and x4.4). **Equal-retention reading** (`baselines-report.txt`, measure 2, audited costs): a student who reads, rereads, does a few problems and spends 5 days before the test spends about 18 h and recalls 0.07 at a month. The real path takes x0.56 of that habit's speed, about 1.8x its hours. With the stop it ties it (x1.1) with far more retention. The first pass alone costs about as much as the habit.

**By kind** (logged costs, middle of range): no kind stands out. Stop + worked + one-tap against the typical student at 1 month is 5.7 to 7.6 across all nine kinds and bands; against careful self-study 1.31 to 1.38. Learners who know more gain more against anyone who studies everything regardless (round 2's table still applies).

**Why the rereader figures are soft.** They rest on exponential forgetting and on a read half-life taken from short lab tests. Real forgetting is closer to a power curve, so real rereaders probably keep more at a year than this says, and a plan of 40 to 60 days of rereading is what it takes to reach 0.70 here, which no real student does. Treat anything above x6 as model output, not a claim.

### Sources (checked by search only, no file downloaded; the papers themselves were not read)

| claim used | source | status |
|---|---|---|
| About 83 to 84% reread, 54 to 55% as their top strategy | Karpicke, Butler, Roediger 2009, Memory | confirmed in two summaries, which differ slightly. The 11% for self-testing was NOT confirmed, not used |
| Rereading mostly did not raise scores | Callender, McDaniel 2009, Contemp. Ed. Psych. | confirmed |
| SSSS against STTT: 83, 78, 71% at 5 min, 40, 56, 61% at 1 week | Roediger, Karpicke 2006, Psych. Science | direction confirmed; **the numbers come only from a student paper**, the table was not read |
| 80% against 36% at 1 week | Karpicke, Roediger 2008, Science | design confirmed, **numbers from memory, unverified** |
| Spaced rereading helps more than massed | Rawson, Kintsch 2005 | **from memory, not checked** |
| Tutoring 0.37 SD; 0.79 SD; Bloom 2 SD | Nickow et al. 2020; VanLehn 2011; Bloom 1984 | from the 5 Nov check in FASTER-BY-GOAL; this round's search did not re-confirm 0.37 |
| Best-case tutor: same proficiency in a third of the time | Anderson et al. 1995, J. Learning Sciences | confirmed in the abstract. Best case, not typical |
| A semester's statistics in half the time, as well or better | Lovett, Meyer, Thille 2008, JIME | confirmed; the follow-up retention result was not retrieved |
| Tutoring systems 0.66 SD median | Kulik, Fletcher 2016 | confirmed |
| Digital Tutor 16 weeks | Fletcher | 16 weeks confirmed; **the 35-week comparison was not** |
| Computer-based instruction saves about a third of the time | Kulik; Fletcher | general claim confirmed, **the percentages not**; not used in a number |

Calibration, `scripts/speed-calibrate.js`: multipliers solved so the model shows that d, on ordinary learners. Tutor 1.2x for 0.37, 1.4x for 0.79; 2 SD needs over 6x. It is a translation: a published d is against its own control and test, so these are not measurements.

## 2. One gate per lever

The gate was written into `scripts/speed-gate.js` before any held-out run. Seeds 20261108, 09, 10: 480 learners, 360 extreme. Real path frame. Required at all nine goals: time saved beyond noise on at least 5, never slower; per-learner recall lever minus off at worst 1, 5, 10% at or above -5 points; knowledge worst 1% at or above -5; reach-with-all-understood no more than 1 point lower; the same on each adverse variant named for that lever. Noise control, same arm on another random stream: worst 1% about -2 points, except a dated test in 1 week at -7.2 points, where **the noise itself breaks the margin**. The margin was not moved.

| lever | hours 1 week | hours 1 year | recall worst 1 / 5 / 10% at 1 week | at 1 year | adverse | verdict |
|---|---|---|---|---|---|---|
| none | 32.5 | 37.9 | | | | |
| SPEED_FAST_ITEM | 29.9 | 34.9 | -1.8 / -1.0 / -0.7 | -2.1 / -1.4 / -1.2 | none: the saving is ASSUMED, 2 s + 2 s | **PASS, on by default** |
| SPEED_TESTOUT | 33.4 | 38.8 | -2.2 / -1.2 / -0.9 | -2.2 / -1.5 / -1.2 | fails all 3 | FAIL: slower. It only saves with a stop |
| SPEED_SHORT_LESSON | 33.7 | 39.1 | -2.1 / -1.0 / -0.6 | -2.9 / -1.6 / -1.3 | fails all 3 | FAIL: slower |
| SPEED_MASTERY_STOP | 14.8 | 22.7 | -19.5 / -15.5 / -13.8 | -3.0 / -2.2 / -1.7 | fails 2 at short goals | FAIL at goals of 1 month or less, passes from 6 months |
| SPEED_REVIEW_TARGET | 31.9 | 37.8 | -21.6 / -17.0 / -15.4 | -7.4 / -6.5 / -6.0 | fails all 3 | FAIL: gives up recall for almost no time |
| SPEED_SKILL_PLACEMENT | 31.8 | 37.2 | -4.7 / -2.7 / -1.9 | -2.1 / -1.7 / -1.3 | fails all 3 | FAIL. Also unsafe as built, from reading the code: it settles coarse skills, so one check can step over dozens of lessons |
| SPEED_COMPOSITE | | | | | | not testable: no bank has such items |

**Combinations** (every mix of test-out, short, stop, review, fast): only fast alone passes. All together is 13.6 h at 1 week and 20.5 h at 1 year, x2.4 and x1.85 of the real path, with recall -21 points worst 1% at 1 week. No interaction made a failing lever pass. Test-out and short add little even with the stop: 15.0 and 14.5 h against 14.8 h at 1 week.

**The mastery stop, on goals of 6 months or more only** (rule frozen in the script, then run on fresh seed 20261113): 36.8 > 21.0 h, 38.3 > 22.6 h, 40.9 > 25.3 h, x1.6 to x1.75, recall worst 1 / 5 / 10% -2.4 to -4.4 / -3.1 at most / -2.4 at most, passes the main gate. Adverse: est-gain 1.5 misses at -5.1 and guess 0.5 at -5.2, both at 6 months, over the line by 0.1 and 0.2 points. **So it stays off.** `SPEED_MASTERY_STOP=long` is built and tested. The owner may want it; see the end.

The gate compares with the path as it is, whose recall at 1 week is 0.96 against a target of 0.70. So the stop "loses" 15 points against an overshoot, and still ends near 0.80. A week is only reachable as a test date: the app's choices are a date, months (90 days), a year, years, forever. I think the margin is measuring the wrong thing at short goals, but it stays as it is: that call is the owner's.

## 3. In a real browser at phone width, on a local database copy, AI off

Each worked after the fixes above, with `SPEED_TESTOUT`, `SHORT`, `STOP`, `FAST`, `WORKED`, `QUICK` on:
- A right typed answer moves on by itself. A miss shows the verdict, then the part of the page it calls for, with "Back to the check" and "See the whole lesson".
- All checks right: "we skipped this page", with "Read the page anyway". The path lists it under "Pages you skipped", as a link, which opens the page at level 10 with the learner still on level 20.
- A reload mid-level keeps every answer. A read worked example stays read. The page part shown after a miss is not reshown on reload; the learner lands on the next question.
- Mastery stop: 9 right answers in a stretch set aside the rest of the level with the next level being the lesson.
- One-tap multiple choice: a tap answers and moves on, no Check bar. The one question in three that asks confidence keeps its Check, so the scorecard keeps that signal.

Not clicked: a one-tap review question (unit test only, no review came due), review target (no learner-facing screen), SPEED_SKILL_PLACEMENT beyond its offer. Seen and not changed: up to four prompts after each level (go deeper, how did it feel, does it connect, race your time). At 588 levels that is friction worth counting, but they feed the scorecard.

## 4. The missing rate

| what raises learning | evidence | in the product? | done here |
|---|---|---|---|
| Stop practising once it is shown | Cen, Koedinger, Junker 2007: same learning in less time (percentage not confirmed) | partly: `compressProven` on since 24 Oct, retention levels not | stop fixed, the largest lever by far |
| Worked examples for novices | McLaren et al. 2016: 46 to 69% less time at equal test scores; Barbieri et al. 2023 g 0.48. Math and science, not vocabulary | on the page only, not in practice | **`SPEED_WORKED`, built, off** |
| Fading, none for experts | Kalyuga (from memory, search returned nothing) | writer instructions only | in `SPEED_WORKED`: two, then problems, none past 0.55 |
| Retrieval format | Smith, Karpicke 2014: little or no advantage of short answer in 3 of 4 experiments; McDermott et al. 2014 | 73% of items are typed | **`SPEED_QUICK_REVIEW`, built, off** |
| Pretesting | Chan et al. 2018 g 0.44, method disputed; Pan, Carpenter 2023: often helps, varies | `SPEED_TESTOUT`, off | credited across a range |
| Interleaving | Brunmair, Richter 2019 g 0.42 overall, -0.39 on words, caution for expository text | **yes, on by default** since before this round | credited across a range, Savant only |
| Skipping what is known | placement, test-out | yes | scope fixed |
| Faster playback | Murphy et al. 2022: little cost up to 2x, then falling; scores disagree across reports | no playback control found | not built: helps only audio or video |
| AI tutor | Kestin et al. 2025: post-test 4.5 against 3.5, sources disagree on minutes, **no delayed test** | yes | not modelled |

**Gate on the new levers** (seed 20261111, low to high end of range, against off):
- `SPEED_WORKED` fails on time at every point of its range. The real path's levels are fixed, so an example adds time unless a stop follows. Retention holds, all adverse hold. Off.
- `SPEED_QUICK_REVIEW` passes main at every point: 37.6 > 35.7, 33.9, 32.9 h at 1 year, worst 1% -1.7 points. It **fails its own adverse**: if a one-tap review builds 0.7 of a typed review's memory growth, worst 1% is -7.1 at 1 week and -5.9 at 1 month. Off. The real answer needs learners.
- With the stop, worked and one-tap add real time: 1 year 22.7 > 18.7, 15.7, 14.1 h.

Range used: worked seconds 35, 26, 20 and teaching 0.5, 0.75, 1 of a right answer; one-tap seconds 25, 15, 10 (15, 11, 8 and 15, 9, 6 at logged costs); pretest page gain 1, 1.2, 1.35; interleaving half-life 1, 1.1, 1.2.

## What the rate would have to be

Nothing built changes the shape of round 2's finding: reaching 4x against careful study or a tutor needs a rate no controlled study supports. The levers cut about 2.4x off the real path, and most of that gets back to where the old sim thought the app already was.

## Owner decisions

1. **Mastery stop.** It is the one lever that matters. `SPEED_MASTERY_STOP=long` gives about x1.7 on long goals, at a miss of under a fifth of a point on two adverse variants. It also cuts answers a lot (practice hours fall about 7x in the model), and **the effect on scorecard accuracy is not measured**, which is your other goal.
2. **A self-study control group.** Only that can say 4x against normal studying. See docs/SPEED-PROOF.md.
