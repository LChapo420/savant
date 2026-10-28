# Placement re-validation, 2026-10-24 (night run)

Agent: placement re-validation. No commits. Backups: scratchpad `34e6f487…\before-placement\` (code, content and judge caches as they were at 03:17 UTC, plus a full copy of `data/db.json` before each write). Tests ran on DB copies with every key blanked and `OLLAMA_ENABLED=0` (`ollama-provider-test` without it). Pipeline calls: MiniMax M3.1 Flash on xKiro (capped at 1 request at a time), NVIDIA (Nemotron Ultra, GLM-5.3, GLM-5.3 Flash), UnoRouter Gemini 3.6 Flash `:free`; no Anthropic calls, no learner data sent anywhere. Where every model lane was at capacity, I (Claude, in-app: lane 6 of tonight's order) wrote the replacement items, and two other families judged them.

## Summary

| Subject | Before tonight | After | Live? |
|---|---|---|---|
| Math | Subject 385/385/385 of 392 within one grade (Q/B/A); units 2794/2912/2915 of 2928 | Same numbers; 2 wrong keys fixed; "I don't know" fix | Yes (key fixes, code fix) |
| English | Subject 128/128/128 of 128; units 889/923/926 of 928 | Same | Code fix only |
| Reading | Subject 128/128/128 of 128; units 727/748/749 of 752 | Same | Code fix only |
| IQ | **The live set was the test fixture** ("easy question 1", keys "right"): 16/96 within one grade | 84 verified questions; 76-85 of 96 within one grade (by judge) | **Yes**, 13:10 UTC |
| ACT | No set: the first learner triggered an unchecked live model write | 112 verified questions; 112-113 of 128 within one grade | **Yes**, 14:14 UTC |
| Basketball, piano, chess | No set | Written (105 / 133 / 133) and code-checked; judge B done (chess 123/133); key check A 41/105, 0/133, 0/133 | Not yet: staged |
| Spanish | No set | Written (399 questions), code-checked; judging only started (B 28/399) | Not yet: staged |

Phonics is not a separate subject (it lives inside English and Reading). Subjects with in-grade unit banks: math, English and reading only; the other six use the older difficulty-ladder in-grade placement.

## 1. Re-validation after tonight's changes (cached verdicts, simulated testers)

Testers at four points in every grade (0.15, 0.5, 0.85, 0.99 through it), 2 seeds; in-grade testers at 0.2 and 0.8 through every unit. Judge: the default (MiMo) cache. Numbers are within one grade (within one unit for the unit banks), then exact.

| Suite | Quick | Balanced | Accurate |
|---|---|---|---|
| Math subject (392) | 385, 250 exact | 385, 251 | 385, 252 |
| English subject (128) | 128, 89 | 128, 92 | 128, 90 |
| Reading subject (128) | 128, 91 | 128, 91 | 128, 92 |
| Math units (2928) | 2794 (95.4%) | 2912 (99.5%) | 2915 (99.6%) |
| English units (928) | 889 | 923 | 926 |
| Reading units (752) | 727 | 748 | 749 |

Previous results (Oct 22): math units 2789/2909/2914, English 887/922/925, reading 727/748/749. So tonight's changes cost nothing; math and English gained 1-5.

Against the other judges: Claude judge math 388/392/392, stricter-of-two 390/392/392; English and reading 128/128 in every mode. Math's 7 misses against MiMo are MiMo's own outliers (for example it puts "the z-coordinate of (2, −3, 5)" in multivariable calculus).

Question counts stay inside the caps: subject walk max 38 (Quick), 70 (Balanced), 130 (Accurate); units max 14/30/80. The full climb (no mode) is no longer offered by any page; it still places math badly (101/392) and is reachable only through the API without `mode`.

## 2. Weak subjects found and fixed

### IQ (live bug)
`data/db.json` held the `subject-placement-test.js` fixture as the IQ set (row 69, 2026-10-06, written when that test still used the real data file). IQ "Find my grade" served "easy question 1 / right / wrong1".

Fix: a new 84-question set (12 grades × 7), written grade by grade with each grade's own unit list in the prompt (Nemotron Ultra; 3 grades by MiniMax), then:
- code checks: four distinct options, the key among them exactly once, no length giveaway, no "all/none of the above", nothing that refers to a missing picture, no repeats;
- key check A (MiniMax, blind) and judge B (a family other than the writer's: Gemini 3.6 Flash, or Nemotron for non-Nemotron items), both blind to the grade written for;
- 11 doubts source-checked by working each one: 8 confirmed and rewritten (three number-theory/probability keys were simply wrong, e.g. σ(360) keyed 2520 instead of 1170 and a Bayes update keyed 0.81 instead of 0.875; one divisor question had four right options; the rest were ambiguous or not answerable as written), 3 overruled with the working (judge B's own trace agreed with the key);
- calibration: each item's point is the mean of its location judges, kept only where two or more judges located it (62 of 84).

Simulated testers, within one grade of 96 (Quick / Balanced / Accurate): against judge B 83/84/85 (79/78/78 without calibration); against the stricter of the two 76/76/76 (49-51 without). Before: 16/96. IQ stays below math/English/reading because the judges disagree far more on where an IQ item sits (its "grades" are levels of one ability, not separate syllabuses).

### ACT (missing items)
Same pipeline: 112 questions. 13 doubts: 8 rewritten (none of the four subject–verb options was correct; a cone volume that depended on an unstated height; a revenue model whose right answer was not an option; three strategy items that relied on passages not given), 1 key fixed (marbles: (4/12)(5/11) = 20/132, keyed 12/132), 4 overruled (e.g. the enhanced ACT English test is 50 questions in 35 minutes, about 42 s an item, as keyed). Testers: 112/113/113 of 128 against judge B, 112/112/112 against the stricter of the two (91/88/87 and 88/77/74 without calibration).

### Math: two wrong keys (found by a third judge)
NVIDIA Nemotron judged all 567 math/English/reading subject items blind. It flagged 2 math keys; both confirmed by working them and fixed live:
- Grade 4, easy: the ten-frame described 5 + 2 boxes but was keyed 12. It now describes a full ten-frame plus 2.
- Calculus I, hard: balloon related rates keyed 3/(16π); the right answer 3/(64π) was not an option. Now it is, and it is keyed.

The calibration points and judge verdicts carry over (same difficulty); the testers are unchanged (385/392 quick).

### Math calibration: a better option, not applied
A median of three judges (MiMo, Claude, Nemotron) instead of the mean of two raises exact placement (math Quick, against MiMo, 250 → 275; against Claude 280 → 289; stricter-of-two 272 → 288) with within-one equal or +1/+2. It is not held-out (each tester's judge is one of the three), and Nemotron is the noisiest judge (mean 0.90 grades from the median in math, 1.43 in reading), so it stays a recommendation. The file is `curriculum-build/placement-judge/math-reval-cal-med3.json`.

### "I don't know" in unit placement (polish audit item 9)
Cause: an in-grade walk that ends after one answer. The first question is asked mid-grade, and one miss moved the flat prior's median only to unit 6 of 20 (with no answers it was unit 11). A blank answer was already graded wrong.

Fix (`services/unit-placement.js placedUnit`, plus `quantile` in `adaptive-placement.js`):
- with no right answer at all, place at unit 1;
- with fewer than 6 answers (the Quick minimum) and a wide belief, start at its 10% quantile.

Walks that reach their mode's minimum place exactly as before. The tester suites are unchanged in every row; applying the quantile at any length cost 4-20 Quick testers, which is why it is limited to short walks.

Checks added to `scripts/adaptive-placement-test.js`, all passing:
- all "I don't know" places at unit 1 in every grade and mode (math 49, English 16, reading 16 grades);
- stopping after one or two "I don't know" also places at unit 1;
- one right answer does not jump past the question's unit;
- the subject walk recommends grade 1 for all-"I don't know" and for a stop after one.

Checked through the real routes on the test copy: English Intermediate and Math Algebra 1A, 1 to 16 blank answers, always unit 1.

## 3. Keys in subjects not yet key-judged

| Subject | Items | A (MiniMax key check) | B (other family) | Doubts | Source-checked outcome |
|---|---|---|---|---|---|
| IQ | 84 | 84 | 84 | 11 | 8 rewritten, 3 overruled |
| ACT | 112 | 112 | 112 | 13 | 8 rewritten, 1 key fixed, 4 overruled |
| Math (third judge) | 343 | earlier MiMo + Claude | Nemotron | 2 | 2 fixed |
| English, reading (third judge) | 224 | earlier | Nemotron | 0 | none |
| Basketball | 105 | 41 | 105 | 17 so far | rewrite round not run |
| Piano | 133 | 0 | 133 | 18 so far (B only) | rewrite round not run |
| Chess | 133 | 0 | 123 | 25 so far (B only) | rewrite round not run |
| Spanish | 399 | not started | 28 | - | - |

The skill sets (Nemotron-written) have many real key errors among the doubts, for example: the D-major pentascale F♯ is finger 3, not 2; a thirty-second note in 4/4 is 1/8 of a beat; V4/3 has the fifth in the bass; Chopin Op. 59 No. 1 is in A minor; and a "Qh8#" with the black king on h8. None of these sets goes live until every doubt is rewritten or overruled and the replacement passes both judges again.

## 4. Placement choice and catch-up, end to end

Test copy: a scratchpad copy of `db.uitest.json`, keys blanked, `OLLAMA_ENABLED=0`. Port 6799 was held by the polish agent's server, so the copy ran on **6804** (the Log says so).

API, reading track, a simulated learner who knows grade 7 with holes in two units of grade 6: **46/46 checks in each of Quick, Balanced and Accurate**. The checks:
- probabilities sum to exactly 100, and the recommended grade has the highest one;
- `most_likely_grade_id` equals the recommendation, with model `posterior-v1`;
- the learner is placed within one grade, and `percent/mine` carries the probabilities;
- the catch-up quiz is offered over every lower grade, and a grade outside the subject is refused with 400;
- choose: 201, then 200 on a reuse;
- the catch-up runs across lower grades within its cap (23/46/92), a reload resumes the same question, and a stale answer gets a 409 with the current question;
- the planted holes are found, with no extra units;
- the route comes lowest grade first, accept-all creates the catch-up enrollments, and the catch-up path shows gaps as `learn` and the rest as `unchecked`, never `known`;
- decline is stored and remembered, and choosing a lower grade is recorded.

Browser click-through on the same copy:
- the result screen showed "How likely each grade is the right place to start" with rows summing to 100 (9/50/39/2) and all three actions;
- the catch-up quiz showed a grade chip and its timer;
- the plan screen read "Catch up: 3 units of Developing Reader, 5 units of Intermediate Reader, 3 units of Upper Intermediate Reader, then start Advanced Intermediate Reader";
- "Start the catch-up" landed on the first catch-up path with its banner.

A random-answer walk was placed in grade 1, and the catch-up action was correctly hidden.

## 5. Tests

Full `npm test` chain plus the placement suites (adaptive-placement, placement-choice, english-placement, gap-scan, learner-path, qa4-fixes) on a DB copy, keys blanked, `OLLAMA_ENABLED=0` (`ollama-provider-test` without it): **56/56** after the fixes (51/52 before, when `game-lab-integration-test` was failing on the apply agent's in-progress game holds; it passes now).

## Files

- Code: `services/unit-placement.js`, `services/adaptive-placement.js`, `scripts/adaptive-placement-test.js`.
- Live data: `data/db.json` (IQ row 70, ACT row 71); `content/placement-calibration/{iq,act,math}.json`; `content/placement-revisions/math.json`. md5s and undo steps are in LIVE-CHANGES-2026-10-24.md.
- Staged: `curriculum-build/staged/placement-sets/` holds:
  - `pipeline.js`: write, judge, key check, location judge C, merge and rewrite;
  - `<track>-set.json` for six subjects;
  - `calibration/`;
  - `review-<track>.json`: every source-check decision with its reason;
  - `math-key-fixes.json`.
- Judge caches: `curriculum-build/placement-judge/<track>-{minimax,nemotron,keysA,c,both,mean}.json`.
- Tools (scratchpad `reval\`): `apply-live.js` (the gate: complete set, every item checked by A and B, no doubted key, code clean; backup and md5 on every write), `finish.sh`, `e2e-choice.js`, `idk.js`.

## Not done / for the owner

- **Basketball, piano, chess and Spanish are staged, not live.** I stopped their background jobs at 14:31 UTC: from about 14:20 the night runner held both xKiro MiniMax lanes (limit 2, active 2), so a third request only ever got 429. Every verdict is cached, so a restart picks up where it stopped. To resume (with MiniMax free): `PS_DB=<staged DB copy> MM_CONC=1 node curriculum-build/staged/placement-sets/pipeline.js keycheck basketball piano chess spanish`, plus `judge chess spanish B`. Then, wait for `finish.sh <track>` to print PASS (or run it again), then `node apply-live.js apply <track>`. Spanish needs its two judges first, about 40 calls each. Tonight every lane was saturated: xKiro returned 429 or "at capacity", NVIDIA Nemotron returned 504 from 13:00 on, and Gemini `:free` allows 1 call a minute, shared with the night runner.
- The six non-core subjects have no unit banks, so their in-grade placement is still the difficulty ladder.
- Decide whether to adopt the median-of-three math calibration.
- Defensive guard (not built): `questionSet` could refuse a set whose prompts look like the test fixture. It was not added because `subject-placement-test.js` deliberately uses such a set; marking the fixture would be the clean way.
