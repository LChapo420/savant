# Uploaded material against the 4x goal

Branch `upload-4x`. Round 1, 7 Nov 2026. **No real learner is in this file.** SIMULATED means the numbers come from a learning model and assumed seconds. MEASURED means counted from the code or the built courses. Nothing here used a model or spent money.

Round 2 (levers 2 to 4, question fit) is at the end of this file.

The target, per learner: time from Savant at most a quarter of the time to reach the same result studying the original, exam at the chosen horizon equal or higher, everything in the material covered.

## Plain answer

**4x is not shown, and nothing in this round points to it. Zero of 320 held-out learners reach 4x against either baseline at any goal (SIMULATED).** With expanding intervals on, the multiple against careful study of the original is about x0.8 to x1.1. Against a rereader who rereads on a well-chosen schedule, where that rereader reaches the same exam at all, Savant is **slower**: x0.11 to x0.30, so the rereader takes a third to a ninth of the time.

What expanding intervals did achieve: 38% to 43% less time on a test 6 to 12 months away, 29% with no test day, 10% at a year, 4% at 6 months, nothing at a month or less. The switch **stays off**: its gate failed, see below.

The limit is not scheduling. See "What limits it".

## What was wrong with the starting picture

- **"About 27 reviews a skill a year" was too high (SIMULATED).** That figure held the learner's multiplier `m` at 0. The real code moves `m` after each review, so a learner who keeps answering right gets longer gaps even with the count capped. Run through the real functions, today's intervals give 12.9 reviews a skill to a year and 21.4 to three years. The 15-day stop is real only at `m` = 0 (`CAP` = 15 in `services/scorecard/forgetting.js`, MEASURED: 15 days at 15 right answers and every count above).
- **The first pass is about twice the estimate once misses count (SIMULATED).** Section 18's 15 minutes for lean assumed every answer right. With misses (25 s feedback, 38 s retry) and failed checks sending the learner back, lean's first pass is about 30 minutes on these documents, and today's whole course about 69.
- **Questions, not words, are the time.** Lean reads in 3 minutes. Its practice takes 27. At a year, reviews are 83% of the time, 8 skills times 2 questions a look.
- **A test date was the most wasteful goal of all (SIMULATED).** `retention-goal.limitInterval` closes its gaps as the date nears, which costs 25 reviews a skill for a test in a year, against 13 for "a year" with no date.

## What was built

`UPLOAD_REVIEW_EXPAND`, off by default (`services/material-review-expand.js`; wired into `services/material-study.js` and `services/material-cards.js`). With it off, the code runs as before. Test: `scripts/material-review-expand-test.js`.

- Each skill and card keeps its own half-life, starting where the curve starts. A right review a day or more later multiplies it by 1.3 + 1.5 x (1 - predicted recall), the v2 model's own growth. A wobble cuts it by 0.6, a lapse by 0.4.
- The learner's `m` still scales every skill and falls when reviews miss, so a learner who forgets faster gets shorter gaps.
- The next review is the last day predicted recall is still 0.75.
- A horizon counts from finishing the course (`finished_on`, new, written the first time every skill is mastered, and each mastered skill is then re-timed). Until then reviews run. Once finished: no review if predicted recall on the last day holds at 0.85 (0.75 for a horizon of 30 days or less), otherwise a last look that holds it.
- A test more than 30 days away: one look on the eve, and before it only what 0.85 needs. A nearer test keeps today's rule on the wider interval, because dropping it cost the worst learners 8 points on the design seed and no floor brought them back.
- No test day runs on, with gaps up to 365 days.

Constants were frozen on design seed 777005 and design documents n1 to n4, before any held-out run. Rejected on the design seed: faster growth (`g0` 1.5: exam 7 points lower at a year; 1.8: up to 28 lower); a single review question, with a second only after a miss (best setting tried, target 0.9, floor 0.9: a further 5% to 13% less time on the horizon goals, but the worst 1% falls 6 to 12 points at most goals). The review-size change is not built.

Also found: `limitInterval` on an upload with `SR_GOAL_REVIEW` on has no finish date, so a horizon never ends reviews on uploads today (MEASURED, by reading: `scheduleReview` passes no `finishedOn`). The switch fixes that; off, it stays.

## The measurement

`scripts/upload-4x-sim.js`, report `scripts/upload-4x-report.js`, whole round `node scripts/upload-4x-run.js`. Held-out seeds 20261131 and 20261132, 160 learners each (120 extreme, 40 ordinary), documents h1 to h6, 6 documents per learner. Raw reports: `docs/upload-4x/report.txt`, `gate.txt`, `sens.txt`.

Savant's arms run the app's own functions (`path.intervalDays`, `updateForgetting`, `retention-goal.limitInterval`, the new `plan`). Document sizes are MEASURED from the 10 built courses (`docs/upload-4x/docs.json`).

**Baselines, on the original text, searched per learner for the cheapest plan reaching Savant's exam score.** This is generous: no real student knows which plan that is.

- **Careful:** reads, writes a self-test per point (30 s assumed), self-tests until truly understood (an oracle stop), then one question per point on an expanding schedule. It gets the same memory gain per question as Savant.
- **Reread:** reads, rereads at once, then rereads on a schedule. The schedule search includes 20 or more rereads.
- **Read 5:** the habit, five reads in a sitting, whatever that reaches.
- A baseline with no plan reaching the score is "cannot reach". It is not counted as a multiple, and n falls.
- On a horizon goal no one gets a look on the eve, because the day is unknown. On a test everyone may.

### Time and exam, today's intervals against the switch (SIMULATED; minutes at 35 s a question, 230 words a minute; lean reading both ways)

| goal | minutes, today > expand | reviews a skill | exam mean | exam worst 1% | weakest point, mean |
|---|---|---|---|---|---|
| 1 week | 65.2 > 65.4 | 2.5 > 2.5 | 0.75 > 0.77 | 0.55 > 0.55 | 0.51 > 0.54 |
| 1 month | 106.1 > 105.5 | 5.4 > 5.4 | 0.81 > 0.83 | 0.73 > 0.78 | 0.52 > 0.69 |
| 6 months | 168.2 > 160.8 | 10.2 > 9.8 | 0.89 > 0.93 | 0.82 > 0.91 | 0.64 > 0.86 |
| 1 year | 201.1 > 181.9 | 12.9 > 11.5 | 0.95 > 0.95 | 0.89 > 0.94 | 0.81 > 0.90 |
| no test day (exam at 3 y) | 296.8 > 209.7 | 21.4 > 13.9 | 0.99 > 0.96 | 0.99 > 0.95 | 0.99 > 0.92 |
| test in 1 week | 91.7 > 91.7 | 4.7 > 4.7 | 0.95 > 0.95 | 0.85 > 0.85 | 0.88 > 0.88 |
| test in 1 month | 167.7 > 168.3 | 11.0 > 11.0 | 0.99 > 0.99 | 0.97 > 0.98 | 0.98 > 0.98 |
| test in 6 months | 277.4 > 171.4 | 20.1 > 10.7 | 0.99 > 0.98 | 0.99 > 0.97 | 0.99 > 0.94 |
| test in 1 year | 338.2 > 192.6 | 25.4 > 12.5 | 0.99 > 0.99 | 0.99 > 0.98 | 0.99 > 0.97 |

Today's whole course (lessons and questions, not lean) costs 88, 123, 190, 223, 320 minutes on the five horizon goals. 1 week and 1 month horizons are not choices in the app (`retention-goal.HORIZONS` has months, year, years, forever, date). They are here because the owner's rule asks that lower goals be fastest.

### The multiple (SIMULATED). Baseline minutes over Savant minutes: above x1 Savant is faster, under x1 the baseline is

Mean, worst 1% in brackets, n both reach of 320. **No cell has a learner at 4x.**

| goal | expand against careful | expand against reread |
|---|---|---|
| 1 week | x0.79 (0.58), 320 | x0.17 (0.06), 187 |
| 1 month | x1.09 (0.82), 272 | x0.23 (0.10), 69 |
| 6 months | x1.10 (0.97), 117 | x0.23 (0.14), 89 |
| 1 year | x1.06 (0.65), 47 | x0.11 (0.09), 9 |
| no test day (3 y) | x1.10 (0.98), 36 | x0.24 (0.09), 71 |
| test in 1 week | x1.14 (1.03), 42 | none reach |
| test in 1 month | x0.83, 1 | none reach |
| test in 6 months | x0.91 (0.61), 111 | x0.30 (0.29), 5 |
| test in 1 year | x0.88 (0.63), 62 | x0.29 (0.23), 4 |

Small n means most of that baseline's learners cannot reach Savant's exam by any plan searched. That is a result too, but under the rules it is not a speed win, and the means above describe only the learners who can.

**Against the rereading habit, not matched (read 5 times in a sitting):** the habit takes 9.8 minutes on average, about a seventh to a twentieth of Savant's time, and scores 61 to 99 points lower at the horizon (worst 1% of learners 47 to 98 points lower). So Savant keeps far more and costs far more time. It is not faster than that habit. This is what the brief's "slower than reading it 5 times" looks like per learner.

**Worst individuals, against careful (SIMULATED):**

| goal | lowest multiple | learner | lowest exam |
|---|---|---|---|
| 1 week | x0.46 | English learner, 66, 61.0 min against 28.1 | 0.50, tail high, 46, in 94.9 min |
| 1 month | x0.76 | random, 61, 94.7 against 71.7 | 0.76, contradictory, 41, in 203.1 min |
| 6 months | x0.94 | ordinary, 29, 133.1 against 125.1 | 0.91, contradictory, 23, in 262.8 min |
| 1 year | x0.65 | random, 47, 78.5 against 50.8 | 0.94, contradictory, 23, in 303.0 min |
| 3 y | x0.98 | tail high, 26, 123.3 against 120.6 | 0.95, age 9, in 165.8 min |
| test in 6 months | x0.57 | random, 40, 129.1 against 74.2 | 0.97, contradictory, 16, in 195.3 min |
| test in 1 year | x0.63 | English learner, 58, 159.9 against 100.4 | 0.98, age 8, in 189.9 min |

Slowest learners, worst 1% of minutes with the switch on: 123 at 1 week, 327 at a year, 370 at 3 years.

### The gate (written before the held-out run; not lowered)

Against today's intervals on the same learners and first pass: exam mean and worst 1% difference at or above -5 points (the margin of `scripts/speed-gate.js`), nobody newly under 0.70, mean minutes at or below today's, no lower goal slower than the next. Adverse variants carry the exam lines. Full text: `docs/upload-4x/gate.txt`.

| line | result |
|---|---|
| Main, 7 goals of 9 | pass |
| Main, 1 week | **FAIL:** 5 learners newly under 0.70, and 0.2 minutes more |
| Main, test in 1 month | **FAIL** on time alone, 168.3 against 167.7 minutes |
| Lower goal slower than the next | 0 of 1,280, pass |
| Studying only every third day | **FAIL** at 1 week: worst 1% -12.4, 15 newly under 0.70. Other goals pass |
| Memory half as long | **FAIL:** 1 week -6.6, 1 month 1 newly under 0.70, 6 months -6.4. Others pass |
| Memory twice as long | **FAIL** at 1 month, -5.2 |
| A deep lapse costs half of understanding | **FAIL** at 1 week -6.1, 1 month -8.7, 6 months -7.8, 1 year -5.6 |
| FSRS memory | **FAIL** at no test day, -8.2 |

Noise for scale, today's intervals against themselves on another random stream: worst 1% -7.0 at 1 week, -4.9 at 1 month, -5.7 at 6 months, -4.9 at a year, under -3.2 on the rest. So several of those misses are the size of the noise, and the gate's worst-1% line is at or below its noise at those goals. That is a weakness in what the gate can resolve; the lines still count as failed.

**So the switch stays off.** The long goals on the main run are clean: months onward, including tests 6 months and more away. The failures are short goals, a hard variant or both.

### What moves the multiple (SIMULATED; 80 learners, seed 20261133, plan re-picked per row; full: `docs/upload-4x/sens.txt`)

Careful, then reread. Mean x (n of 80 reaching). No row has a learner at 4x.

| assumption | careful 1 month | careful 1 year | reread 1 month | reread 1 year |
|---|---|---|---|---|
| main settings | 1.06 (68) | 1.05 (16) | 0.22 (17) | 0.12 (2) |
| question 15 s, not 35 | 1.09 | 1.05 | 0.38 | 0.21 |
| question 8 s | 1.11 | 1.05 | 0.51 | 0.30 |
| writing a self-test costs nothing / 60 s | 1.01 / 1.10 | 1.02 / 1.08 | 0.22 | 0.12 |
| reading at 150 wpm | 1.05 | 1.05 | 0.34 | 0.18 |
| careful student reads at 0.7 speed | 1.07 | 1.06 | 0.22 | 0.12 |
| spaced rereading half as strong | 1.06 | 1.05 | none reach | none reach |
| document 3x less dense | 1.04 | 1.04 | 0.63 | 0.35 |
| 3x less dense, 15 s question | 1.06 | 1.04 | 1.04 | 0.61 |
| lean page teaches 0.75 of a full page | 0.99 | 0.99 | 0.21 | 0.11 |
| forgetting: half-lives x0.5 / x2 | 1.07 (31) / 0.98 (79) | 1.05 (1) / 0.91 (54) | 0.19 / 0.26 | 0.10 / 0.14 |
| deep lapse costs half of understanding | 1.12 (54) | 1.09 (10) | 0.20 | 0.10 |
| studies only every third day | 1.10 (69) | 1.07 (7) | 0.23 | 0.20 |
| **FSRS memory (fit on real Anki users' logs: real people, other material)** | **0.83 (80)** | **0.55 (80)** | 0.32 (7) | 0.27 (45) |
| FSRS memory, 15 s question | 0.91 | 0.63 | 0.57 | 0.49 |

The FSRS row is the largest move, and it goes the wrong way for Savant. FSRS grows memory far faster than v2, so a careful student can look far less often, while Savant's growth constant, fixed from v2, keeps asking. `m` cannot catch up: it moves about 0.15 of a doubling a review. Weights read from py-fsrs on 7 Nov; difficulty held at 5; reads have no FSRS form and keep the restudy rule.

## What limits it

1. **A careful student does the same work.** They read once and retrieve each point on a growing schedule, and memory follows the same law for both. No schedule can make Savant four times faster than that. Moving a question's seconds changes both sides alike (x1.05 at 35 s, 15 s and 8 s). What Savant saves is writing the questions and knowing the schedule, and in the model that is worth a few percent. A real careful student's cost may be far higher: nobody has measured it.
2. **Reading the material is the floor on the first pass, and it is cheap.** A 620-word handout takes 2.7 minutes. Lean is about the same length, because these fixture documents are dense. A reader who knows nothing cannot be taught everything in 40 seconds.
3. **Questions cost more than rereading.** One reread of the document takes about 2 minutes. One review round takes about 12. So an oracle rereader wins on time wherever spaced rereading is credited at all, and the answer depends on an assumed constant: halve spaced rereading's strength and no rereader reaches the exam. That is the softest number here. Published work favours retrieval over restudy per minute at a delay, which the model only partly reflects, and nobody rereads a handout 20 times. A real result is needed.
4. **Long goals need several looks.** To a year, on v2, 11.5 looks a skill with the switch on. On FSRS memory Savant still asks 9.0 looks of 2 questions, while the careful student gets there with 6.2 looks of 1 question. That spread is the largest open question and only real answers settle it.

**So what 4x can honestly mean:** against what students actually do, not against a perfect plan. Against the habit, Savant today costs more and keeps far more. Whether a learner reaches a given exam in a quarter of the time they would really spend is exactly what the study (lever 4) can show and this simulation cannot.

## Assumptions

Item 35 s, right 3 s, feedback 25 s, retry 38 s, 230 words a minute (all ASSUMED; no real timing exists), scaled by the learner's processing speed. Memory and learning v2 unchanged, or FSRS. A page teaches the same whatever its words (the lean-gain row tests this; section 18's AI-judged exam supports lean at about a third of today's lesson words, on 7 documents). Questions are all on topic. A learner comes back when due, except the every-third-day row. Exam score is mean understanding x recall, no guessing. `spec` is at its default in the simulation. Fixture documents are dense, about 80 words a skill; 3x less dense is a row, real textbooks are untested. First pass in one sitting.

## Not verified

- Anything on a real learner, or real seconds.
- A learner's non-default spec, except by the unit test.
- A course studied over many days: `noteFinished` is unit-tested, not simulated.
- A browser or the server: this is scheduling code with no screen. No screen says "skipped because your memory holds".
- The goal choices in the app with `SR_GOAL_REVIEW` off.

## Next

1. **Lever 4, the study (`UPLOAD_STUDY`).** It settles the three largest unknowns above: real seconds, memory growth, and what students really do.
2. **Learn memory growth per learner from their own reviews**, so a FSRS-like memory is not over-reviewed and a v2-like one not under-reviewed. The largest move in the sensitivity table.
3. **Test-first (lever 2):** practice is 27 of the first pass's 30 minutes. It can only remove what the learner already knows. An earlier sim put skipping known pages at 3% to 5%, on the old costs.
4. **Material (lever 3):** following and readability, unchanged by this round.

---

# Round 2 (branch `upload-4x-2`, 8 Nov 2026): levers 2 to 4 and question fit

**No real learner is in this section.** Labels: SIMULATED (the v2 model, assumed seconds), AI-JUDGED (a free NVIDIA model), MEASURED (counted from code). Nothing was spent: no paid model, no learner data. Everything new is behind a switch, default off.

## Plain answer

**4x is not reached, and lever 2 and lever 3 do not move it (SIMULATED, 320 held-out learners, 240 extreme or random, 9 goals).** Against a careful student the multiple stays about x0.65 to x1.1, with no learner at 4x at any goal (0 of 320 in every cell). Test-first skipping with proof makes the path about 4% to 11% **slower** on the lean page, and up to 6% slower on today's whole course, not faster, with 0.1 to 4.6 points less recall at short goals. Scorecard custom material adds nothing beyond that and, on a dated test 6 months or more away, costs up to 11 points for some learners. The own-control study (lever 4) is built so the real answer can come from testers from Nov 15. Question fit moves the AI-judged on-topic share from 2.8% to 6.4%, near the judge's noise; the bank cannot write questions it has no generator for.

Why 4x is out of reach in the model (held-out, 1 month, lean page): 105 minutes, of which 3 are reading, 27 practice, 75 reviews. A part skipped by test-first saves its first pass (about 30% of the time) and then needs the same review cycle as any other part, because the model gives prior knowledge no memory trace (a part known from before has recall 1 only at its first answer and decays from there). A careful student doing the same recall under the same memory model has the same floor. The limit is the model, and real testers settle it.

## Lever 2: test-first skipping with proof (`UPLOAD_TESTFIRST=1`)

The app's starting check (`material-path.nextPlacement`) already skips a part on one right answer, inferring through prerequisites. What was missing is proof and a recheck. Built (`services/material-testfirst.js`, wired into `material-study.js`, `routes/materials.js`, `public/js/my-material-study.js`):

- a part is skipped only on 2 right answers, no miss on it, and at least one given as "sure" (the starting check shows "Next, I am sure", "Next, not sure" and "I do not know"; a learner whose scorecard says they guess or rush needs 3);
- a wrong answer given as "sure" is a misconception: the part is never skipped and goes to remediation;
- the walk asks one more question on each part it would skip until it has the right answers, or the part has no unused question;
- a skipped part comes back for a recheck after 3 days (sooner than a learned part), and a failed recheck reopens it by the ordinary review rule.

Result (SIMULATED; `tf1` = today's one-answer rule, `tf` = with proof, `expand` = lean page without skipping; seeds 20261131 and 20261132; `docs/upload-4x-2/report-held.txt`):

| goal | tf1: minutes % of expand, exam diff (pts) | tf: minutes %, exam diff | tf exam diff, worst 1% | learners more than 5 pts lower with tf |
|---|---|---|---|---|
| 1 week | 97%, -10.5 | 108%, -4.6 | -18.6 | 136 of 320 |
| 1 month | 113%, -0.8 | 111%, -0.9 | -9.3 | 26 |
| 6 months | 112%, +0.1 | 109%, -0.2 | -3.6 | 2 |
| 1 year | 111%, -0.1 | 108%, -0.2 | -2.1 | 0 |
| no test day (3 y) | 110%, 0.0 | 107%, 0.0 | -1.7 | 0 |
| test in 1 week | 93%, -5.9 | 104%, -1.5 | -5.9 | 13 |
| test in 1 year | 104%, 0.0 | 107%, -0.1 | -1.9 | 0 |

- **The proof does what it is for:** against the one-answer rule, recall at a 1-week goal is 5.9 points higher and at a test in a week 4.4 points higher, for about 10% more time. The one-answer rule as it stands today loses 10.5 points at a 1-week goal in this model.
- **Skipping saves no time.** 28% of parts are skipped with proof (53% with one answer) and time still rises. On the lean page a question (35 s) costs more than reading the part (about 21 s). On today's whole course, where a part costs about 8 questions, `course_tf` is still 98% to 106% of `course`: practice minutes fall (60 to 49 with the one-answer rule) but reviews rise (54 to 74), because a skipped part starts its review cycle with 2 answers, not 8.
- By prior knowledge (1 month): the high-prior third skips 40% and is still 111% of expand; the low-prior third skips 17%. No third gets faster.
- Not modelled, so likely understated: prior knowledge that is already remembered for a long time. Real testers can show it.

## Lever 3: custom material from the scorecard (`UPLOAD_CUSTOM=1`)

`services/material-custom.js`. Only the four classes whose decision accuracy beats never-lean in `docs/SCORE-95.md` steer anything: habit 75.6, performance 73.4, contrast 69.3, memory 68.6 against 57 to 61. Benefit, preference and hidden (63.6, 54.7, 58.3 against 64.0, 57.7, 63.8) do not, and reasoning and scale are not in that table: they are excluded, and a test checks that every rule's measure is in an allowed class. A measure leans only past the card's hard edge (30 / 70, `decisions.decide`) and with confidence at least 0.5. 17 rules; votes on one knob add. Knobs that reach the app: practice questions per part (+-1), proof answers needed (2 or 3), review gap scale (0.8, 1, 1.2), starting tier bias, and whether a low-prior learner is asked first at all. Page depth, interleaving and sitting length are computed and not yet read by any page (no effect, said plainly).

Result (SIMULATED; estimated traits with shrink 0.55 and noise 9 points, which gives 71.4% decision accuracy on these learners, inside the doc's 68.6 to 75.6; `oracle` uses the true traits, an upper bound):

- Against `tf`: time within 1 point at most goals, exam 0.2 to 1.3 points lower. **On a test 6 months or a year away, 57 and 48 learners are more than 5 points lower** (worst -11.4). The oracle is no better than the estimate (1 month: -0.9 for both), so the loss is not estimate noise: the knobs themselves (longer gaps for good retainers, a third proof answer) do not pay in this model.
- I did not tune the knobs after seeing outcomes. The next step is learning which knob helps which learner from their own logs, not a fixed map.

## Lever 4: the own-control study (`UPLOAD_STUDY=1`)

`services/upload-study.js`, routes under `/api/materials/:id/study/own-control`, a card in `public/js/my-material-study.js`, collection `upload_studies`. Flow:

1. After the starting check the learner sees one plain offer (`CONSENT_TEXT`: what is split, what is recorded, "at most 24 questions", "does not change your grade or your scorecard", "you can stop at any time"). Only an exact `agree: true` starts it, and the account must pass `boosters.allowed` (age screen answered and, under the age of consent, a parent's agreement: the gate of the other extra measurements).
2. The parts still to learn are split into two **matched halves**: sorted by prior knowledge then size, neighbours paired, a seeded coin per pair, rebalanced when the halves' words would drift more than 3% apart. One half is Savant's way. The other is the learner's normal way: the original passages and an "I am done" button, no Savant lesson, questions or reviews.
3. Two questions per part, up to 6 parts a half, are held back from the Savant half's practice and checks (moved out of the questions the path sees) and used only in the test.
4. The test comes at the learner's own horizon after both halves are in (their retention goal: a horizon in days, a test date, or 90 days if they set none). Both halves are in one mixed order, same format, no feedback.
5. Time is logged for both halves by one rule: the gaps between a learner's actions on a part, each capped at 10 minutes, a part at 45. Result per learner: time ratio (normal minutes per 1,000 words over Savant minutes per 1,000 words) and the score difference in points.
6. `analyse()` pools learners with a seeded bootstrap interval: "equal or more" means the lower bound of the score difference is at or above -5 points; "4x" per learner is ratio at least 4 and difference at least -5. Under 30 learners it says "no claim".

The normal half's revision outside the app is not timed (this under-counts the normal side and is against Savant's ratio); the test is small; a tester may study the normal half more carefully because it is watched. These are stated in the code header. Not built: a staff view of the pooled result (call `upload-study.analyse(upload-study.allResults())`). The card is untested in a browser.

## Question fit (`SPEED_TOPIC_FIT=on`)

`services/topic-fit.js`, used in `services/sessions.js`. On a practice level, a focus or stretch question is the best of 24 bank draws for the lesson's skill and difficulty by word overlap with the lesson's title and what it covers (answer key and rationale excluded). It never does worse than the first draw, and when no draw overlaps it keeps one and says fit 0. AI-JUDGED with the round-4 judge and script (60 held-out first practice levels, 360 questions each way, `docs/upload-4x-2/on-topic-fit-*.json`): on topic **2.8% off, 6.4% on** (10 and 23 of 360). The difference is near the judge's noise (about 1.5 points on a difference of 3.6). The bank's generators write per-skill templates, so the ceiling is what a skill's generator can say. Where questions were written for the objective, on-topic is 59% (`SPEED_OBJECTIVE_PRACTICE`, 8 of 219 grades). **The fix that works is writing questions per objective for the other 211 grades** with the existing factory (`scripts/build-objective-items.js`, two blind judges); that needs a model batch and a fact check, not done here.

## Switches and what to turn on

| switch | does | recommendation |
|---|---|---|
| `UPLOAD_STUDY=1` | the own-control study, with consent | turn on for the Nov 15 testers: only it can show 4x |
| `UPLOAD_TESTFIRST=1` | proof and recheck on the starting check | optional: safer than today's one-answer rule (5.9 points at 1 week), not faster |
| `UPLOAD_CUSTOM=1` | scorecard knobs on practice, proof and review gaps | leave off: no gain, a loss on far tests |
| `SPEED_TOPIC_FIT=on` | topic-matched practice questions | harmless, small lift; the real fix is written questions |

## Not verified

Anything on a real learner; the study cards, the confidence buttons and the test in a browser; the pooled study view; page depth, interleaving and sitting length reaching any page; question fit on the live app (it ran on a throwaway database for 60 levels per arm); a time ratio from the study.
