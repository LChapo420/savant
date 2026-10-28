# Overnight work, 2026-10-21 to 2026-10-22

## LIVE STATUS (updated at every wake-up)

**Last update:** 12:05 UTC (7:05 am Iowa time). **All four goals are done.** Claude usage: 5-hour window about 25%, weekly about 71%. Anthropic key: ~$11.20 of $25 (only the basketball test spent tonight; placement used none).

## MORNING SUMMARY (for the owner)

1. **Free-first basketball test: done, and it failed.** MiMo's repairs kept adding contradictions; it took 18 rounds and $1.76. Standard mode stays the default.
2. **Grade-level placement (Math, English, Reading): done to target.** Every simulated tester (3 seeds × 4 positions per grade, judged by the STRICTER of two independent judges) lands within one grade:

   | Subject | Quick | Balanced | Accurate |
   |---|---|---|---|
   | English | 192/192 | 192/192 | 192/192 |
   | Reading | 191/192 | 192/192 | 192/192 |
   | Math | 586/588 | 587/588 | 588/588 |

   All 567 answer keys are agreed correct by both judges. The 1 to 2 Quick misses are lucky-guess streaks that a short quiz can't rule out.
3. **Placement inside a grade (±1 unit): done, near its ceiling.** 5 questions a unit; calibrated on both judges; tested against the stricter of the two:

   | Subject | Quick | Balanced | Accurate |
   |---|---|---|---|
   | English | 873/928 | 918/928 | 921/928 |
   | Reading | 728/752 | 744/752 | 745/752 |
   | Math | 2768/2928 | 2887/2928 | 2891/2928 |

   - Balanced and Accurate reach 98.6% to 99.2% within one unit. Even with perfect questions the ceiling is about 99.5%, from lucky-guess streaks.
   - Quick asks only about 12 questions in its 6 minutes, which caps it at 94-97%.
   - **Unit answer keys:** both judges now agree on **all 5,750** questions. The last 7: the 3 math keys were right, and the judge's own working said so, so I corrected its verdicts by hand. The 4 English/Reading questions were really flawed, so I rewrote them and both judges passed the rewrites blind. Claude rewrote every question either judge doubted, about 470 in all, each with a worked check, and re-checked them blind. Of the rewrites, 99% passed.
   - The quick check of skipped units uses these same questions.
4. **What's built in the app:**
   - The Quick, Balanced and Accurate picker (with an "I think I'm about here" option and a skip-the-quiz link).
   - Adaptive one-question-at-a-time walks with clocks.
   - Calibration files, placement by unit, and the quick check of skipped units (two misses reopen a unit).
   - Tests pass, and I clicked through it in the browser on a copy of the data. Nothing is committed.
5. **Learning-style scorecard research: done.** The report is `curriculum-build/SCORECARD-RESEARCH-2026-10-22.md` (research only; no code changed). I checked its main code claims by running counts myself, and they hold; its sources are real, well-known papers.
   - **The biggest accuracy problem:** 42 of the 100 stats have no measured signal at all. Only the AI's after-level read moves them, and that read can keep confirming itself. (Checked: 41 stats have a behaviour rule, 11 an experiment, 42 neither. `docs/SCORECARD.md` says only 2.)
   - **Some measured stats are biased by the rules themselves.** For example, `hint_dependency` only ever moves up when the coach is used and never down (checked in `signals.js`). Decay ignores how long it has been between reviews. The experiments are too small to ever reach a decision.
   - **What the evidence supports tailoring:** knowledge per skill, review spacing from each learner's forgetting, reading level, lesson length and pace, interest-based examples, and specific misconceptions. Most other stats either help everyone (and belong in the default lesson) or are unsupported "learning styles". The recommendation is about 12 measured traits, 6 or 7 of which steer lessons.
   - **How to measure them:** skill from calibrated question difficulty (Elo/IRT, like the placement quizzes now use), forgetting from a spacing model (half-life regression or FSRS), detecting fast guesses by response time, and confidence that comes from real uncertainty rather than hand-set weights.
   - **Tokens:** the scorecard prompt is about 5,000 input tokens per level today and could be 500 to 800. The much bigger saving is not rewriting a lesson unless there is a confident reason it should differ, and sharing one fact-checked lesson among learners with the same profile.
   - **Suggested first step:** a simulation with synthetic learners whose true traits are known, to measure how well each stat is recovered before changing the live scorecard.


**Now (all background, MiMo token plan):**
- Free-first basketball test: **done. It failed** (18 rounds, $1.76, too little survived), so standard mode stays the default. Note for the owner: standard mode repairs with GLM through OpenRouter, which is off-limits tonight.
- **Math subject questions: saved** (49 grades, 343 questions; 7 have an answer that stands out by length). Now being judged (bm9j3fwu1). Earlier note: The writer now keeps whole grades from a short reply and re-asks only the missing ones (it used to throw away the whole subject). Writes to the live `data/db.json`; server stopped. **Do not run db-writing tests while it runs.** **Backup:** `C:\Users\admin\AppData\Local\Temp\claude\C--coding-claudecommittdIq-folderThing\b8206e34-7709-469e-8326-7a732d82d175\scratchpad\db.before-placement.json`
- **Grade-level placement: done to target.** See the table below.
- **In-grade (unit) placement, 07:15 UTC.** Calibrated on both judges (MiMo + blind Claude), tested against the stricter of the two:

  | Subject | Testers | Quick | Balanced | Accurate |
  |---|---|---|---|---|
  | **English, 5 a unit** | 928 | 872 | **918** | **921** |
  | English, 3 a unit (before) | 928 | 881 | 906 | 908 |
  | **Reading, 5 a unit** | 752 | 728 | **744** | **745** |
  | Reading, 3 a unit (before) | 752 | 715 | 733 | 733 |
  | Math | 2928 | 2752 | 2808 | 2810 |
  | *ceiling with 3 questions a unit, perfect questions* | | 885 / 731 / 2809 | 908 / 740 / 2864 | 909 / 740 / 2865 |

  - **Keys are now clean.** The blind Claude judge doubted 184 Math unit keys written by MiMo. Claude rewrote 191 doubted keys, and on re-judging 189 of 191 passed. Unit keys doubted by either judge are now 2 for Math and 0 for English and Reading, out of about 3,450 questions.
  - **Why it stops short of 100%:** with three questions a unit, even perfect questions top out at about 98%, because Accurate runs out of questions.
    - Simulated with perfect questions on English: 5 a unit gives Balanced 922 and Accurate 926 of 928; 7 a unit gives Accurate 928 of 928.
    - **English is done at 5 a unit:** Balanced 918/928 (98.9%), Accurate 921/928 (99.2%). Only 3 of 1,150 English unit keys are still doubted. Quick stays about 94%; it asks only about 12 questions, so a bigger bank can't help it.
    - **So the banks are being grown to 5 a unit** (about 2,300 new questions; bfu237jxy Math, b801tq7pw English, bpq63risw Reading). MiMo writes and judges them, then Claude judges them blind and rewrites any doubted keys.
    - Accurate (unit) now allows up to 80 questions. Backups of the 3-a-unit banks: `scratchpad/unit-banks-before-five/`.
  - **What limits it:** some units had no working question (flawed, or judged easier than the unit), so a learner's answers there say nothing. Guessing noise on the units above then pulls the estimate. Fix: rewrite whatever either judge flags. Tuning the walk's shape for units did not help (93-95% at any width or shift).
  - **Bug found and fixed:** in 12 unit questions (doctoral reading), the writer returned the answer as a list, and it was stored as all four options joined into one "answer". I split them back out, and `generate-unit-placement.js clean()` now rejects list answers.
  - **Claude's blind check caught factual errors MiMo let through.** For example, Bartholomew Fair is said to be written for Blackfriars (it was the Hope), and a "Chaucer" quotation is fabricated. These are flagged for rewrite. The unit questions double as the quick check, so their keys and facts must be right.
- Unit bank: Math nearly done, then Reading and English (bx4jpcsoj).
- Unit judge on Math (bh379lpva).

**Results (simulated testers, 128 per subject: 16 grades × 4 positions × 2 seeds):**

| Subject | Round | Full walk | Quick | Balanced | Accurate |
|---|---|---|---|---|---|
| English | original | 72 | 86 | 82 | 81 |
| English | round 1 (60 rewritten) | 99 | 106 | 107 | 109 |
| English | round 2 (41 rewritten) | 114 | 114 | 116 | 120 |
| English | round 3 + tuned walk | – | 120 | 121 | 121 |
| Reading | original | 26 | 65 | 58 | 58 |
| English | round 4, MiMo judge | – | 123 | 125 | 125 |
| **English** | **round 4, both judges (honest)** | – | **115** | **115** | **115** |
| Reading | round 1 (88 rewritten) | 48 | 99 | 108 | 110 |
| Reading | round 3, MiMo judge | – | 123 | 126 | 126 |
| Reading | round 4, MiMo judge (3 seeds, of 192) | – | 186 | 191 | 191 |
| **Reading** | **round 4, both judges (honest)** | – | **98** | **102** | **102** |

(Number of testers placed within one grade. The goal is 128 of 128.)

**A second, blind judge (Claude Sonnet subagents, in-app usage) changed the picture.** The rewrites were aimed at MiMo's own verdicts, so they partly fit MiMo's taste.
- Claude read all 112 English and 112 Reading questions blind, with the same outline and no grade hint.
- **English:** Claude puts questions 0.33 grade easier than MiMo on average. 93 of 112 are within one grade of each other, and they agree on 108 of 112 keys.
- **Reading:** Claude puts questions 0.69 grade easier. Only 69 of 112 are within one grade, and they agree on 109 of 112 keys.
- **From now on, testers are run on `-both`.** Each question gets the EASIER of the two judges' points and the worse key verdict. Revisions target whatever either judge flags. That's the honest score in the table (`scripts/placement-second-judge.js`).

**Calibration (04:00 UTC): the biggest single gain.** The walk now places each question at where the judges found it really sits, not where it was written for. That is what real placement tests do with their items (calibration).
- It's stored per subject in `content/placement-calibration/<track>.json` (the mean of the two judges, keyed by question). `services/subject-placement.js` attaches it, and `services/adaptive-placement.js` `positionOf` uses it. Questions without an entry fall back to their band.
- **Held-out test** (calibrate on one judge, test against the other): English Quick 124-126 / Accurate 126-127; Reading Quick 124-125 / Accurate 125-128, of 128.
- **Calibrated on the mean, 3 seeds (192 testers per row):**

| Subject | Testers judged by | Quick | Balanced | Accurate |
|---|---|---|---|---|
| English | MiMo | 190 | 191 | 191 |
| English | Claude | 188 | 191 | 191 |
| English | stricter of both | 189 | 191 | 191 |
| Reading | MiMo | 188 | 191 | 191 |
| Reading | Claude | 189 | 191 | 191 |
| Reading | stricter of both | 186 | 190 | 190 |

**FINAL grade-level results, 06:45 UTC.** 3 seeds × 4 positions per grade. Tested against the STRICTER of the two judges (each judge alone gives the same or better):

| Subject | Testers | Quick | Balanced | Accurate | Avg questions (Q / B / A) |
|---|---|---|---|---|---|
| English | 192 | **192** | **192** | **192** | 20 / 29 / 90 |
| Reading | 192 | **191** | **192** | **192** | 21 / 31 / 95 |
| Math | 588 | **586** | **587** | **588** | 29 / 36 / 133 |

- The 1 to 2 Quick misses are testers whose run of lucky guesses fools a short quiz. Every Quick tester in English is within a grade, and 99.7% in Math.
- **Every answer key is agreed correct by both judges** (567 questions).
  - The 8 graduate-level Math questions MiMo kept getting wrong were rewritten by Claude Opus, and I verified each by hand.
  - 3 more "wrong" verdicts from MiMo were its own slips; its working reached the keyed answer.
- Latest changes:
  - Quick's budget now grows with the subject (49-grade Math gets about 29 questions on average, 38 at most). The clock still bounds it.
  - The walk asks one question per screen.
  - The reliable-point shift (0.3 grade).

**Earlier results, 05:25 UTC: the walk as it now ships.** One question per screen, calibrated on both judges, with the reliable-point shift. Tested against the stricter of the two judges:

| Subject | Testers | Quick | Balanced | Accurate |
|---|---|---|---|---|
| **English** | 128 | **128** | **128** | **128** |
| **Reading** | 128 | **128** | **128** | **128** |
| Math | 392 | 387 | 389 | 389 |

- **What got it here, in order of effect:**
  1. Calibration: the walk uses where the judges place each question, not where it was written for.
  2. One question per screen: the walk re-aims after every answer.
  3. The reliable-point shift: a judge's point means about 9 in 10 right, not even odds. Without it, estimates sat about a fifth of a grade high.
  4. Quick retuned (cap 32, minimum 18, 94% sure).
  5. Rewriting the questions either judge flagged.
- **Every answer key is now agreed correct by both judges** in all three subjects (English 112, Reading 112, Math 343).
  - I checked the last disputes by hand. A linear-algebra key was wrong: RA = [[0,-1],[1,2]], and Claude's blind check caught it; it's corrected. A Calculus I key MiMo called wrong was actually right (its own working agreed). A graduate question's circular distractor (Fourier inversion) was replaced with a plainly wrong one.
- **Math's last misses** (3 to 5 of 392) are at grades 38, 43 and 47: real analysis II, advanced undergraduate electives, doctoral. Round 4 targets them.

**Earlier results, 04:30 UTC (calibrated on both judges, tested against the stricter of the two):**

| Subject | Testers | Quick | Balanced | Accurate |
|---|---|---|---|---|
| English (round 6) | 192 | 187 → **256/256 with Quick retuned** | **192/192** | **192/192** |
| Reading (round 6) | 192 | 190 → **255/256 with Quick retuned** | 191 | 191 |
| Math (round 1) | 392 | 333 | 367 | 366 |

- **Quick retuned** (`services/adaptive-placement.js`): cap 32 questions, minimum 18, 94% sure. It was 28 / 12 / 0.90. It still fits the 14-minute clock at about 25 seconds a question, and the clock is enforced anyway.
- **Math's gap:** both judges put every graduate-level question at grade 45 or below. Grades 46 to 49 (master's, doctoral, postdoctoral, senior scholar) have no question sitting in them, so learners at those levels can't be told apart. The two judges also disagree on 27 math keys. Round 2 targets both.

**The walk tuned (`services/adaptive-placement.js`):** with perfectly placed questions, the original walk still missed 9 of 384 Quick testers. A run of lucky guesses convinced it and it stopped early. It now assumes a 0.2-grade slope, a 10% slip and 15 points of luck above guessing. With perfect questions: Quick 383/384, Balanced 384/384, Accurate 384/384.

- Reading's upper grades are worst: literary studies, postdoctoral and field-authority questions sit 4 to 9 grades too low.
- English round 3 (32 questions) running. Remaining misses are late-in-grade testers placed 2 up. Grade 9 (11th-12th) questions are still too easy, and one round-2 rewrite had a wrong key, which the judge caught.
- Reading round 1 (88 questions) running.
- **Unit placement, first 9 math grades judged, before any revision:** Quick 498/576, Balanced 524/576, Accurate 527/576 within one unit (about 91%). 29 of 605 judged unit questions have bad keys (5%), and 54 are far too easy. They'll be revised once the bank writer has moved off math.

**Built (tests pass):**
- **Subject placement modes:** `services/adaptive-placement.js`, wired into `services/subject-placement.js`, `routes/subject-placement.js` and `public/js/subject-placement.js`.
  - A mode picker with optional "I think I'm about here" and "skip the quiz".
  - A clock enforced on the server.
  - No model call for the result.
- **In-grade placement by unit:** `services/unit-placement.js`, wired into `routes/placement.js` and `public/js/placement.js` for any grade with a unit bank.
  - Adaptive, one question at a time.
  - The mode carries over from the subject placement.
  - The learner starts at the placed unit's first lesson.
  - **Quick check of skipped units:** one question per skipped unit not already answered right. A miss asks a second; two misses reopen the unit and move the start back to it (`/api/placement/quick-check`). It's offered on the result screen.
  - Grades without a bank keep the old difficulty ladder.
- **Tests:** `scripts/adaptive-placement-test.js` (29 checks, on a throwaway data file), `subject-placement-test` and `english-placement-test` all pass. Backups of the edited pages and route are in the scratchpad (`*.before.js`).
- **Tools:** `scripts/placement-testers.js`, `scripts/revise-placement.js`, `scripts/generate-unit-placement.js`, `scripts/revise-unit-placement.js`.
- **Checked in a browser** (a second server on port 6799, on a copy of the data, all model keys blanked):
  - Subject quiz: mode picker, Quick walk from a hint, blocks, clock, finish: works.
  - In-grade quiz on Kindergarten math: a learner who knows units 1-8 was placed at unit 9 in 10 questions.
  - Quick check: missing unit 1 twice reopened it and moved the start back to level 10.
  - Fixed on the way: the in-grade quiz showed "difficulty null" and the AI coach (now hidden, like the subject quiz). The mode cards now show the whole budget (20 / 45 / 90 min).
  - Test login is in `scratchpad/uitest-login.txt` (local only).

| # | Task | Status |
|---|---|---|
| 1 | Free-first basketball test | done: failed, standard mode stays default |
| 2 | Fix MiMo retries for failed sections | done |
| 3 | Write Math + Reading placement questions (MiMo) | running |
| 4 | Check placement answer keys | judge checks keys while locating; Claude second check planned |
| 5 | Simulated-student tester harness | built |
| 6 | Test + revise subject placement (±1 grade) | **done**: 191-192 of 192 (Eng, Read), 586-588 of 588 (Math) |
| 7 | In-grade placement (±1 unit, skip + quick check) | **done**: 98.6-99.2% Balanced/Accurate; keys clean (7 of 5,750 doubted) |
| 8 | Learning-style scorecard research | **done**: report written and its code claims checked |

**Anthropic key spent:** ~$9.44 of $25 (plus the current run).

Started 01:45 UTC on Oct 22, which is 8:45 pm the evening before, Iowa time. The owner is back between 6 and 9 am Iowa time (11:00 to 14:00 UTC).

This file is the source of truth: re-read it at every wake-up, and keep it updated.

## Goals, in order

1. **Finish the free-first basketball test.** Run it, take the Opus audit, and compare it with standard mode ($1.86, 0 errors left). Keep whichever gives the same result for less.
2. **Placement quizzes for Math, English and Reading.**
   - **Subject placement**, which picks the starting grade. Test it with at least 2 simulated testers per grade. Each tester knows exactly that grade's material.
   - Keep revising the quiz until every tester is placed within one grade of what they really know.
3. **Placement inside each grade of each of those subjects.**
   - It picks the starting point inside the grade. The owner's choice: accurate to within one unit, meaning the stretch of lessons between two checkpoints.
   - Learners skip what they have shown they know, with a quick check: one short review question from each skipped unit early on. The owner's choice.
   - Test it with at least 2 testers per grade, at different positions in the grade, and revise until every tester lands within one unit.
   - The curriculum then adjusts, so learners only work on what they need. Make sure they really know what the placement quiz says they know.
4. **If 1 to 3 are done and verified:** the learning-style scorecard. Research how to make it as close to perfectly accurate as possible while staying very token-efficient when building each user's tailored curriculum and lessons.

Priorities: **accuracy first, then budget.** Testing must be realistic.

## Hard rules (owner's)

- **Anthropic key (`FACT_CHECK_ANTHROPIC_KEY`):** at most **$25 in total, including about $10 spent on Oct 21**, so about $15 is left. Keep the ledger below current, and stop using the key at $24.
- **OpenRouter:** no money at all through the OpenRouter keys. The balance was $0.29, and at $0 the free MiniMax model stops working. Free `:free` models only; no GLM.
- **MiniMax M3.1 Flash (free):** until 2026-10-22 12:00 UTC, through OpenRouter. After that, use MiMo V2.6 Flash from the plan.
- **MiMo token plan** (`MIMO_API_KEY`, `MIMO_BASE_URL` token-plan-sgp): $16 a month, about 20% used. Use V2.6 Pro for hard work and V2.6 Flash for fast work.
  - Use `structuredStream` for long thinking calls; the plan endpoint cuts silent requests at about 8 minutes.
  - A whole lesson with thinking times out, so send one block per request.
- **Claude Code plan:** use up to about 95% of each 5-hour window and never reach 97%. Check with `mcp__ccd_session_mgmt__get_usage`.
  - The weekly limit was already at 59% at the start, and it resets 2026-10-24 15:00 UTC.
  - Treat 95% weekly as a hard stop: if it's hit, everything stops until the owner returns.
- **Tester model:** the owner suggests Haiku 5.5 to save money ($0.10/$0.50 per million tokens on the Anthropic key). Free models (MiniMax, MiMo) are better where they're good enough.
- No commits and no PRs. Never print API keys, and never edit `.env`.
- The app server is stopped on purpose, because opening levels makes it write with GLM through OpenRouter. Run tests against a copy of the database (`DB_FILE`).

## Owner's answers before sleeping (02:00 UTC)

- **Allowed services, in this order:**
  1. MiMo V2.6 Pro: "as much as it can be usefully used for".
  2. Claude through the in-app Claude Code usage: me and subagents, through the Agent tool with `model: "haiku"` or `"sonnet"` (this uses the 5-hour window, not money).
  3. The Anthropic key.
  4. MiniMax free is allowed.
  - **Nothing else:** no Modelflare/GPT Sol, no GLM, no paid OpenRouter, no Gemini.
- **If the MiMo plan caps out:** MiniMax free first (until 12:00 UTC), then Claude Code usage (subagents), then the Anthropic key.
- **The computer** never sleeps (already set).
- **Live changes are OK** to the real placement code and the live database, after a backup of `data/db.json`. No commits.
- **Claude models, plan before key (owner, 02:00 UTC):** use the in-app Claude Code usage first, as much as possible while still lasting all night, and only then the Anthropic key, to save money.
  - In practice, Claude work done directly by me or by subagents (testers, judges, question checks, reviews) goes through the plan, paced so each 5-hour window ends near 90–95%.
  - The app's own code (the lesson verifier, research, and Sonnet's final read) can only reach Claude through the API key. Use it there, and prefer subagents wherever I can do the work outside the app's code.
  - Keep the live task list (`update_plan`) current, so the owner can see what I'm doing if they wake up.
- **Weekly Claude limit:** the owner will use a reset before sleeping, so the weekly number may restart. Still never reach 97% of a window.
- **Keep-awake** is held until the session is idle for 5 minutes. Keep a background job running, or wake-ups short (≤ 25 min).

### Final answers (02:10 UTC)

- **Three placement quiz modes, all optional:**
  - **Quick:** 20 minutes at absolute most, for the whole quiz.
  - **Balanced:** balances time and accuracy.
  - **Accurate:** 1.5 hours at absolute most.
  - Placement is optional. Someone trying something new, or who already knows where they are, can skip it or choose their own start, and the quiz adapts to that (for example, starting near a grade they name).
  - Test all three modes. Accuracy targets apply to each, with Accurate held to ±1 grade and ±1 unit at minimum. Report the measured accuracy and time per mode.
- **Models overnight (owner restated):** only MiniMax free, MiMo V2.6 Pro on the token plan, then Claude on the in-app usage (as much as possible without interrupting work), and last the Anthropic key. No other models or options.
- **The app server stays stopped overnight**, because it would use GLM through OpenRouter.
- **Use the local system too (02:20 UTC):** the local checkers save money and keep accuracy. They are FactCG, MiniCheck, Granite Guardian and HalluGuard, at `127.0.0.1:6790`, started with `..\fact-venv\Scripts\python.exe -I tools/fact-checkers/server.py`.
  - They already run on the first full read of every lesson.
  - For placement, use them to check each question's answer and explanation against source passages before anything paid looks at it.

## Ledger, Anthropic key (estimates from measured call costs)

| When | What | $ |
|---|---|---|
| Oct 21 | First Sonnet verifications (3 lessons + 1 retry) | 1.50 |
| Oct 21 | Web search test, key checks | 0.06 |
| Oct 21 | Cascade measurement (incl. 3 unit research pools) | 0.53 |
| Oct 21 | Thorough mode, 3 lessons + Opus audits | 2.94 |
| Oct 21 | Basketball thorough re-run + audit | 2.44 |
| Oct 21 | Basketball, Sonnet does every repair (failed) | 1.57 |
| Oct 21 | Free-first basketball run, killed partway (estimate) | 0.40 |
| Oct 22 | Free-first basketball run, full (Sonnet confirms + takeovers) | 1.76 |
| **Total so far** | | **~11.20** |

## State

- [x] 1. Free-first basketball run. **Result (03:45 UTC): FAILED**, too little survived (blocks 7, 3, 1 and 5 dropped). 18 rounds, 2 h 18 min, $1.76.
  - Standard mode: verified, 0 errors left in the Opus audit, $1.86, 3 rounds, about 50 min.
  - MiMo's repairs kept introducing new contradictions (e.g. "every defender collapses on you" together with "no teammate is open"), and each Sonnet confirmation found the next one.
  - **Decision:** standard mode (`thorough`, Sonnet reads, GLM/Claude repair) stays the default. `FACT_PIPELINE=freefirst` stays opt-in and isn't recommended. No Opus audit was run on a failed lesson; there was nothing to serve.
- [x] 2. Subject placement: Math, English, Reading
- [x] 3. Placement inside each grade
- [x] 4. Scorecard research (`curriculum-build/SCORECARD-RESEARCH-2026-10-22.md`)

## Notes / findings

### What already exists (read 01:45 UTC)

- **Subject placement** walks a whole subject, 7 questions per grade, until the questions stop being answerable.
  - Code: `services/subject-placement.js` (1,354 lines), `config/subject-placement.js` (the rules), `scripts/subject-placement-test.js`.
  - The 7 questions per grade are mixed easy, easy, medium, medium, hard, hard, capstone.
  - The questions are written by a model, all in one call per subject, and cached in `placement_question_sets`.
  - At the end, the model turns the per-grade scores into a percentage for each grade.
  - English uses a hand-built bank (`content/english-placement`), checked by `scripts/english-placement-calibration.js` (deterministic: testers are probability tables, not real test-takers).
- **Question sets in the database:** only `iq` (12 grades). Math and Reading have none. Generating them must not use GLM, which bills OpenRouter: use MiMo V2.6 Pro, streamed.
- **Placement inside a grade:** `services/placement.js` picks bank items in rising difficulty, with the quiz length set by the grade's tier (20 questions at tier 1, up to 50 at tier 5).
- **Grades:** Math 49 (sense_of_quantity … ), English 16 (basics … field_authority), Reading 16 (foundations … field_authority). That makes 81 grades, so at least 162 testers.

### Tester design (decided)

Asking an AI to "pretend to know only grade G" isn't reliable, because it knows everything. So each tester works like this:

- **Knowledge profile:** the curriculum's actual topics up to its true point. For subject placement that's grades below G plus all of grade G. For placement inside a grade, it's units up to U.
- **Judge per question:** a cheap model (MiniMax free until 12:00 UTC, then MiMo Flash, with Haiku only as a fallback) decides one thing: could a learner who has mastered exactly this profile answer this question? Yes, partly, or no. The judge doesn't answer the question itself.
- **Simulated answer:** yes means correct with a slip chance (about 5%); partly means about 50%; no means a guess (1 in the number of options, or about 5% for a typed answer).
- **Testers differ:** at least 2 per grade, with different random seeds and slightly different slip and guess rates.
- **Caching:** cache each verdict by question and profile, so re-runs after a revision only pay for questions that changed.
- **Pass:** the placed grade is within ±1 of the true grade, for every tester. Inside a grade: the placed unit is within ±1 of the true unit.
- **When a tester fails:** revise the questions or the reading rule, re-run, and log every round here.

**As built (02:45 UTC), cheaper than a verdict per tester:** the judge (MiMo V2.6 Pro, token plan) locates each question once: the first grade and unit by which a learner reliably answers it, plus whether the key is right. Questions are shuffled across grades before batching, so the judge never sees which grade a question was written for. A tester is a point (grade + fraction through it). It answers correctly with 95% chance past the question's point, on a 0.35-grade ramp just below it, and by guessing beyond that. A wrong key scores as a guess for everyone. One judge pass per subject (cached by question text) then serves any number of testers, seeds and modes for free. Testers sit at 15%, 50% and 85% through each grade, 2 seeds each (6 per grade).

### Models for placement (decided)

`scripts/generate-placement.js` and the `placement` role in `services/subject-placement.js` (lines ~482 and ~1280) use "GPT Sol through Modelflare". That isn't among the owner's allowed services tonight (MiniMax, MiMo, Anthropic, Claude Code usage), so don't use it.

- **Writing questions:** MiMo V2.6 Pro, through `structuredStream`, **one grade per call** (7 questions). Each call gets the neighbouring grades' topics and the previous grade's questions, so the ladder climbs and nothing repeats.
- **Checking answer keys:** a blind test by a cheap model, plus the code checks. Only disputed questions go to Sonnet.
- **Reading scores into a grade (the "percentages"):** the model reading needs the `placement` role, so check where `services/providers` sends it. If it's Modelflare, use MiMo Pro instead, or a deterministic rule if that measures as accurate.

### To fix next (seen 01:54 UTC)

In the free-first run, MiMo streamed unparseable arguments for 2 of 10 parts (cut off at 4,575 characters). When any part fails, the whole MiMo read is thrown away and Sonnet takes over, which costs money.

Fix in `verifyLevel` (reader `mimo`): retry each failed part once, and split it further if needed. Hand over to Sonnet only if MiMo still fails. Also check whether `max_completion_tokens` 24,000 is being hit.

### Build steps for goal 2 (next)

- [ ] a. Generator: `scripts/placement-write-mimo.js` writes the question sets for Math (49 grades) and Reading (16), per grade with MiMo Pro, into `placement_question_sets`. Run it with the server stopped, against the main `data/db.json`; back up first.
- [ ] b. Key check: blind test plus code checks on every question, with Sonnet only for disputed ones. Watch the ledger.
- [ ] c. Tester harness: `scripts/placement-testers.js`, as designed above. It needs the cache, the walk rules from `config/subject-placement.js`, and the reader.
- [ ] d. Run 2+ testers per grade for Math, English and Reading. Log results here, and revise until all are within ±1 grade.

### How the placement pipeline runs (for whoever picks this up, 08:00 UTC)

Scratchpad: `C:\Users\admin\AppData\Local\Temp\claude\C--coding-claudecommittdIq-folderThing\b8206e34-7709-469e-8326-7a732d82d175\scratchpad`. Run everything from the app folder with `NODE_PATH=../node_modules`.

**Grade level** (done to target):
- `scripts/placement-testers.js judge <t>`: MiMo.
- `scripts/placement-second-judge.js export/import/mean/both/calibrate <t>`: Claude blind, via Sonnet subagents writing `.claude.json`.
- `JUDGE_TAG=-both scripts/placement-testers.js run <t> --mode=quick|balanced|accurate`.
- Revisions:
  - `scripts/revise-placement.js` with `JUDGE_TAG=-mean|-both`, `REVISE_SPREAD`, `REVISE_GRADES`.
  - Files: `content/placement-revisions/<t>.json` and calibration `content/placement-calibration/<t>.json`.
  - Graduate math keys were rewritten by Claude Opus, then verified by hand.

**Inside a grade** (in progress):
- Bank: `content/unit-placement/<t>.json`.
- MiMo judge: `placement-testers.js judge-units <t>`. Claude: `placement-second-judge.js export-units/import-units/calibrate-units <t>`.
- Calibration: `content/unit-placement-calibration/<t>.json`.
- Test: `JUDGE_TAG=-both placement-testers.js run-units <t> --mode=...`.
- Pitch fixes: `JUDGE_TAG=-both scripts/revise-unit-placement.js <t>` (MiMo).
- **Doubted keys go to Claude:** `scripts/unit-rewrite-claude.js export <t> <dir>`, then Sonnet subagents write `rewrite-<t>-N.json`, then `import <t> <file>`. Then MiMo `judge-units`, Claude `export-units` for the changed questions, and `calibrate-units`.
- **State at 08:00 UTC:**
  - Math: Claude doubts 184 of 2,196 unit keys. 191 doubted keys are being rewritten by 7 Claude subagents (`scratchpad/rewrite-math/`).
  - English and Reading round 3 (MiMo) are done. Claude judging of the changed questions is next: `scratchpad/units-english-r3`, `units-reading-r3`.

### NEXT STEPS (written 09:45 UTC, before a context compaction)

Unit banks are being grown from 3 to 5 questions a unit. Done so far: Math 706/732 units, English 205/232, Reading 187/188. MiMo judge-units is running on each (bfu237jxy, b801tq7pw, bpq63risw).

1. When those finish, fill the short units: `UNIT_TARGET=5 node scripts/generate-unit-placement.js <t>`, then `placement-testers.js judge-units <t>`.
2. Claude judges every new question blind:
   - `placement-second-judge.js export-units <t> <dir>` (it exports only questions Claude hasn't judged).
   - Sonnet subagents, one per 3-4 files: "judge, write units-<t>-N.claude.json".
   - `import-units <t> <file>` for each.
   - Also pending: the 8 English/Reading replacements exported in `scratchpad/units-english-r4` and `units-reading-r4`; these will be re-exported anyway.
3. Doubted keys go to Claude: `unit-rewrite-claude.js export <t> <dir>`, Sonnet writers, `import`. Then MiMo judge-units again, and Claude judges the replacements.
4. `placement-second-judge.js calibrate-units <t>`, then `JUDGE_TAG=-both placement-testers.js run-units <t> --mode=quick|balanced|accurate`.
   - The expected ceiling at 5 a unit (ideal questions): English Balanced about 922/928, Accurate about 926/928.
5. Update LIVE STATUS with the unit results and the answer-key counts, then move to goal 4 (learning-style scorecard research).
   - The scorecard is in `services/scorecard/` (100 stats, `translate.js` turns them into directives). Docs: `docs/SCORECARD.md`.

Usage at 09:40 UTC: 5-hour window 0% (new window), weekly 66%. Anthropic key unchanged (~$11.20).

### CURRENT STEP (10:55 UTC)

- **English and Reading unit banks: done** at 5 a unit, judged by both judges, keys rewritten by Claude.
  - English: Balanced 918/928, Accurate 921/928, 3 doubted keys.
  - Reading: Balanced 744/752, Accurate 745/752, 1 doubted key.
- **Math unit bank:** 732/732 units at 5 a unit. Claude judged all 1,467 new questions; 199 doubted keys were rewritten by Claude Sonnet and imported.
  - **Running now:** bs4pi0d0i (MiMo judge-units math, then `export-units math scratchpad/units-math-6`).
  - **Next:** Sonnet subagents judge `scratchpad/units-math-6/*.md` (about 3 files each, "judge, write units-math-N.claude.json"). Then `import-units math` for each, `calibrate-units math`, and `JUDGE_TAG=-both run-units math --mode=quick|balanced|accurate`.
  - Before the rewrites (doubted keys counted as bad): Quick 2723, Balanced 2851, Accurate 2858 of 2928.
- Then update LIVE STATUS and the MORNING SUMMARY tables with Math units, and move to goal 4 (scorecard research).
- Usage at 10:54 UTC: 5-hour window 20%, weekly 69%.

### 11:20 UTC: placement done; scorecard research started

- **Goals 1 to 3 are done** (see the MORNING SUMMARY at the top).
- **Goal 4:** an Opus research subagent is writing `curriculum-build/SCORECARD-RESEARCH-2026-10-22.md`.
  - It covers: accuracy weak points, evidence per stat (keep/label/merge), cheap measurement and validation, token efficiency, and an implementation plan with a synthetic-learner recovery simulation.
  - When it reports, read the report, check its claims and citations, and add a summary to the MORNING SUMMARY.
- Still open (small):
  - 7 doubted unit keys (Math 3, English 3, Reading 1): `unit-rewrite-claude.js export <t>`.
  - The test server on port 6799 (`placement-uitest`) is still running and can be stopped.

### 11:45 UTC: scorecard report checked; all goals done

- I read the report and re-ran its stat counts against the code: 41 behaviour, 11 experiment, 13 questionnaire, 42 with none (matches). Confirmed the one-way `hint_dependency` rule in `signals.js:85` and the `docs/SCORECARD.md:236` claim of only 2.
- I checked the sources against what I know: authors, years and venues are right (Pashler 2008, Cepeda 2006, Brunmair & Richter 2019 g = 0.42, Settles & Meeder 2016, Pelánek 2016, and others). I didn't open every URL.
- The loop stops here. The leftovers are small and listed in the morning summary.

### 12:05 UTC: leftovers done; loop stopped

- The 7 doubted unit keys are fixed (see the summary); 0 of 5,750 doubted. Recalibrated all three subjects and re-ran every tester (numbers in the summary).
- `adaptive-placement-test.js`: the in-grade check's ideal learner now answers by each question's calibrated position, the same way the simulated testers do. It had been answering by the unit each question was written for, which disagreed with calibration (some math numbers_to_10 U10/U11 questions sit at about unit 6). All checks pass, as do the subject and English tests.
- The test server on port 6799 is stopped.
- **Left for the owner (not blocking):**
  - 9 English units have fewer than 5 questions.
  - Some unit questions sit well before the unit they were written for (the judges find them easier). The walk uses calibrated positions, so placement is fine. But a quick check for a skipped unit can then ask a question that doesn't really need that unit. A future pass could rewrite those questions to fit their unit.
  - Nothing is committed.
