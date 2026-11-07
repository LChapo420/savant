# Speed round 4: what eats a learner's time on the real path, the fixes, and the real multiple

Written 7 Nov 2026. Branch `speed-nov7`. **No number here comes from a real learner.** Each one carries one of three labels:

- **MEASURED**: counted from the real code or the real text. Which levels the routes serve, answers asked, words on a page, server milliseconds.
- **SIMULATED**: comes from the v2 learning model. Right or wrong answers, recall, and every multiple.
- **AI-JUDGED**: a free NVIDIA model read the text.

Seconds per answer and per word are **ASSUMED** everywhere. No real timing exists: the database copy holds one real account and scripted test accounts.

## Plain answer

**4x is not shown against careful self-study or a tutor, and nothing here points to it.** With the set I recommend (spaced retention, proof passes, recheck, on top of the plain bug fixes), the simulated multiple against careful self-study is x0.85 at 1 week, x0.97 at 1 month, x1.27 at 6 months, x1.35 at 1 year and x1.45 with no test day. Against a tutor at d 0.79 it is x0.79 at 1 week, x1.04 at 1 month, and x0.59 to x0.63 on a test 6 months to a year away.

Against a rereader the model shows x2.0 at 1 week and x4.9 to x9.7 from a month on. That number is soft: it asks the rereader for 28 to 60 days of rereading, which nobody does. Against a rereader's or a typical student's actual habit, the same set is x1.0 to x1.6 faster in hours, with far more kept.

**What did change: the path takes about half the time, in the simulation.** Main before this round took 17.0 to 19.8 h across the five horizon goals. The recommended set takes 7.2 to 10.7 h, and every one of 320 held-out learners is faster than before (slowest x1.43). Careful self-study takes 6.1 to 15.4 h on the same model, so short goals are still a little slower than it and long goals a little faster. Round 3 found the real path at x0.5 to x0.75 of careful study. At these costs, with the stuck levels counted, it was x0.35 at 1 week and x0.78 with no test day.

On the real routes, MEASURED on 16 held-out grades (80 walks, 575 to 640 lessons per set), answers per lesson fell from 72 to 18, and minutes per lesson at the assumed seconds fell from 20.1 to 6.0. The plain bug fixes alone, on by default, take it to 48 answers and 13.9 minutes.

**The largest cause was bugs and order, not teaching.** Three plain bugs and one order mistake made up most of it.

**Every multiple above leans on one assumption that looks false today: that the app's questions practise the lesson.** The model credits every answer as teaching the lesson's topic. AI-judged on 58 held-out first practice levels, 4.9% of their questions do (17 of 348; 1.4% before this round), and my own reading of a sample agrees: "Average Rate of Change and Difference Quotients" practises range and median, "Rows, Columns and Diagonal Slides" asks square colours. In the model, if half the questions are on topic the recommended set falls to x0.70 at 1 month and x0.85 at 1 year; at a quarter, x0.51 and x0.48; at a tenth, recall 0.70 is out of reach at a month. So **the real path's largest sink is still there**: most of its answers teach little about the lesson, and the fix is new questions, not code. Questions written per objective exist on 8 of 219 grades. Where they exist, turning them on takes the same check from 11% to 59%. See section 7.

**One decision is yours.** The one form of spaced retention that passes the gate, `=long`, makes short goals slower than long ones (14 h at 1 week, 9.7 h at 1 year), against your rule that lower goals be fastest. The form that keeps your rule, `=on`, fails the gate at the 1-week horizon and when a learner studies only every third day. See section 7.

## 1. What was slow

**The walker.** `scripts/speed-r4-walk.js` drives the real routes over HTTP on a stripped database that holds no real account: `POST /api/sessions`, then the ordinary sitting, block page or bank game it sends the learner to. Right and wrong come from the v2 model (SIMULATED). It has five kinds of learner: weak, mid, strong, expert, random. Design: 15 grades, 75 walks. Held out by a hash fixed first: 16 grades, 80 walks, across all tracks but Spanish, which has its own player.

Main before this round, held-out grades, 575 lessons, 41,646 answers. MEASURED counts, assumed seconds (200 words a minute, 15 s an item, 12 s after a miss, 6 s a level close):

| where the time goes | minutes per lesson | share | answers per lesson | levels per lesson |
|---|---|---|---|---|
| ordinary practice levels | 10.6 | 53% | 41.5 | 2.85 |
| retention levels | 5.9 | 29% | 23.5 | 1.57 |
| lesson page (bank page, 210 words; see 8 below) | 1.0 | 5% | | |
| the lesson's checks | 0.9 | 4% | 3.0 | 1.00 |
| game levels (at their fewest, 12 answers) | 0.6 | 3% | 2.3 | 0.19 |
| level close screens | 0.6 | 3% | | |
| checkpoints | 0.6 | 3% | 2.1 | 0.17 |
| **total** | **20.1** | | **72** | |

82% of the time is massed answers, and those answers were 94% to 99% right in the model. An expert still answered 62 questions a lesson. Raw files: `docs/speed-real/r4/ledger-*.txt`, `composition.json`.

**What was found, largest first:**

1. **Practice levels asked another skill's questions (plain bug).** `curriculum.levelPlan` took a practice level's focus from the level's position in the skill bands, and only lessons, Spanish and ACT read the sheet. On the first practice level of 8,902 of 11,671 objectives (76%, MEASURED across all grades), the focus was not the lesson's skill. Example: after "Touch and Count One Thing at a Time", practice on shapes. Those answers did not count toward the objective's proof, so the path could not step over the rest. 20% of design stretches and 26% of held-out stretches were never proven, and those walked all seven levels: 139 answers against 56.
2. **The retention levels are massed (order).** Each stretch ends on "Free Recall and Mixed Review" and "Spaced Recall: a delayed check". Both come straight after the practice, with no gap at all: 30 more answers, 99% right, and up to 61% of all answers for a learner who proves early. The review queue already asks the real memory checks a day and a week later. A real retention page is worse where one is written: 1,455 visible words on average against 725 for a written lesson (MEASURED, 21 and 72 shared pages), about 7 minutes of reading each.
3. **Skills no lesson had taught held the level and filled its slots (plain bugs).** `levelProgress` averaged every "introduced" skill, and that list is the grade's skill order, not the lesson order. On ACT grade 1, a learner with every answer right stayed on level 21 for 26 sittings, objective already proven. The same list fed the support and interleaved slots, and a skill never met has mastery 0, so it ranked weakest: a lesson on independent clauses asked fractions.
4. **Proof could only come from a lesson's checks or a game.** An ordinary practice answer never counts as aligned evidence (`OBJ_MIN_ALIGNED`), so a learner who missed two of three lesson checks walked every level left, however well they did. On ACT, a re-tag gave a lesson one skill and its activities another, so right answers spoke for no objective (plain bug, fixed).
5. **Off-topic questions (not fixed; the largest thing left).** Even on the right coarse skill, the bank's questions are rarely about the lesson: after "Transformations of Functions" it asks "If f(x) = 4x - 3, what is f(-5)?". AI-JUDGED by a free NVIDIA model told to be strict, held-out grades, first practice level: 5 of 360 questions (1.4%) practised the lesson's own topic before this round, and 17 of 348 (4.9%) after the plain fixes, which put 53 of 58 levels on the lesson's skill against 13 of 60. A sample I read myself agrees. Questions written for one objective exist on 8 of 219 grades. 50% of answers repeat a question stem (numbers aside) from earlier in the same stretch, and 48% repeat one already answered right (MEASURED). It needs new questions.
6. **Level close.** Up to four optional questions sat above Continue. There is also one quick recall after each level, optional and not counted in the walk: at 15 s it would add about 8% in both the before and after columns.
7. **Waits are small once a level is written.** Server, real routes in process on a stripped database, this PC under other load (MEASURED, held-out): opening a level p50 29 ms, p95 70 ms; an answer p50 1 ms, p95 3 ms. The real wait is cold writing. docs/FIRST-LESSON.md measured 70 to 605 s from the end of placement to an open lesson, once per learner, under 100% CPU; another build owns it and I did not re-measure it. A level not written ahead waits at most 8 s and then shows "still writing": with no model here I could not measure how often that happens.
8. **Pages are not the sink.** Real AI lesson rows average 538 words (n 113, MEASURED), about 2.7 minutes at 200 words a minute. The walker's bank pages are shorter, so written pages weigh a little more than the table shows.

**Review scheduling:** reviews are not the sink until the massed levels go (2.5 of 18.9 h on the real path at 1 year). `SR_GOAL_REVIEW` is on by default, so nothing there needed changing. With the massed levels gone they become the largest block at long goals (3.9 of 9.9 h at 1 year), and in the model they earn their time.

## 2. What changed

**Plain bug fixes, on by default, each with a switch back:**
- `PRACTICE_FOLLOWS_LESSON` (`config/curriculum.js`, `services/coverage.js`): a practice level practises its own row's skill, and that answer counts for that row's objective.
- `PRACTICE_FOLLOWS_LESSON` also (`services/sessions.js`): support and interleaved slots read skills the learner has met, not skills no lesson has reached.
- `LEVEL_GATE_MET` (`services/mastery.js`): the level gate reads skills the learner has met, plus this level's focus. A met skill they are weak on still holds the level.

**Behind switches, all off** (`services/speed-levers.js`):
- `SPEED_SPACE_RETENTION=on|long`: once an objective is proven, its two retention levels are stepped over and the review queue asks the memory checks instead. An unproven objective keeps them. The learner is told, the levels stay open behind them, and graduation still needs every objective retained. `long`: only on goals of 6 months or more, or with no test day.
- `SPEED_PROOF_PASSES`: a practice level with its answers is passed once its objective is proven, whatever the coarse average says.
- `SPEED_RECHECK`: a practice level on an unproven objective opens on the lesson checks the learner missed, after at least 5 practice answers. The bar is unchanged, but **this is the same question a second time, weaker evidence than a new one.** The code's own comment says being re-asked teaches recognition. Its effect on proof quality is not measured.
- `SPEED_OBJECTIVE_PRACTICE`: a practice level's focus questions are the ones written for its lesson's objective, where a grade has them, and then the bank's. Only 8 grades can use it today. AI-JUDGED on five of them, 30 levels, 180 questions each way: on topic 11.1% off, 58.9% on. Support slots stay the bank's.
- `SPEED_ONE_PROMPT`: Continue comes first, with one optional question per level, taking turns. Scorecard taps of that kind fall by three quarters.
- `SPEED_TIGHT_PAGE`: the intro and recap (block plans: hook, takeaway, cheat sheet) start folded behind "See the whole page". **The AI-judged check below says it drops content. Leave it off.**

**Seen in a real browser at phone width, on a local throwaway database with AI off:** the tight page folded and showed its button; Continue sat above a single optional question; after the last practice level the card read "Continue to the level 20 lesson", stepping over retention levels 18 and 19, with the note shown. The server log had no errors.

**What the real routes do with them** (MEASURED counts, assumed seconds):

| | design grades, minutes / answers per lesson / never proven | held-out grades, minutes / answers per lesson / never proven |
|---|---|---|
| main before this round | 18.0 / 64 / 20% | 20.1 / 72 / 26% |
| plain bug fixes | 13.6 / 48 / 6% (72 of 75 walks; 3 cut by a time limit) | 13.9 / 48 / 7% |
| + space + proof + recheck | 5.7 / 17 / 0% | 6.0 / 18 / 0% |

Held-out, answers per lesson by learner (expert, strong, mid, random, weak): before 62, 63, 78, 71, 88; plain fixes 38, 39, 51, 49, 63; with the switches 14, 15, 19, 18, 23. Stuck walks (25 sittings on one level): 10 of 80 before, 0 after the plain fixes.

These walks are only the first pass of 8 lessons. Later reviews are in the simulation, not here. A long walk (30 lessons, 20 minutes a day, 3 learners) asked 1.4 to 2.3 review answers per lesson with the switches on; the sim assumes 4 looks per skill, so **the looks after the last lesson depend on the daily review, which I did not walk.**

**Held-out grades were read before two fixes.** The ACT attribution bug and the slots bug showed up on the held-out walk, and I fixed them and re-walked those grades. The held-out ledger is therefore not blind for those fixes. The simulation's arms were frozen before them, with the design rates (plain fixes: stuck 6%, 0.43 repeated sittings a lesson), and were not retuned. With the final held-out rates (stuck 7%, 0.11) the plain-fix hours barely move: 14.1 to 17.2 h, x0.42 to x0.90 against careful.

**AI-JUDGED, tight page, 52 held-out pages (22 shared levels, 30 simulated accounts' lessons; 8 more lost to rate limits).** A free model answered each page's checks from the whole page and from the tight page: 172 of 176 right against 174 of 176, one lost. So the checks do not need the folded text. But asked what the folded text states that the rest does not, it listed 66 points on 29 of the 52 pages, among them plain definitions ("A variable is a letter that stands for a number we do not know yet") and a table of four adjective forms, along with some it should not have counted, such as a warm-up story. That is 14.7% of the words for an assumed saving of 0.4 h. **It fails your "all the information" rule as built, so I took it out of the recommended set.** Raw: `docs/speed-real/r4/page-check.json`.

## 3. The multiple

**Baselines are not the app.** They run on the same model: careful self-study (reads once, practises until it truly understands, then a generic expanding schedule); a tutor (the same with learning raised to match d 0.37 and 0.79, plus a weekly recap); massed problems; the typical student (read, reread, 3 problems, cram rereading); a rereader. Each baseline's plan is picked on the design seed. A baseline or an arm that misses recall 0.70 with everything understood is not counted as a win.

**Held out:** seeds 20261121 and 20261122, 320 learners, 240 of them extreme (tails, contradictory mixes, random, ages 8 to 70, English learners). Design seed 777003. Arms were frozen on that design seed and design grades first. Costs "words": a 538-word page at 200 wpm, 15 s an item. Raw: `docs/speed-real/r4/multiples-*.txt`.

**Hours (SIMULATED), mean, recall on the day:**

| goal | main before | plain fixes | space alone | **recommended: space + proof + recheck** | + one prompt + tight (not recommended) | + mastery stop too |
|---|---|---|---|---|---|---|
| 1 week | 17.0, 0.96 | 14.0, 0.95 | 8.8, 0.94 | **7.2, 0.93** | 6.8, 0.92 | 5.6, 0.87 (15% miss) |
| 1 month | 17.5, 0.97 | 14.6, 0.97 | 9.5, 0.97 | **8.0, 0.96** | 7.6, 0.96 | 6.8, 0.95 |
| 6 months | 18.4, 0.88 | 15.6, 0.88 | 10.5, 0.88 | **9.2, 0.88** | 8.7, 0.88 | 8.1, 0.87 |
| 1 year | 18.9, 0.88 | 16.2, 0.88 | 11.1, 0.88 | **9.8, 0.88** | 9.3, 0.88 | 8.7, 0.87 |
| no test day (3 y) | 19.8, 0.92 | 17.1, 0.92 | 12.1, 0.92 | **10.7, 0.92** | 10.3, 0.92 | 9.7, 0.92 |
| test in 1 week | 16.1, 0.95 (28% miss) | 13.8, 0.96 (7% miss) | 8.9, 0.96 | **7.4, 0.96** | 7.0, 0.96 | 6.1, 0.94 |
| test in 1 month | 17.4, 0.98 | 14.6, 0.98 | 9.6, 0.98 | **8.2, 0.98** | 7.7, 0.98 | 7.0, 0.97 |
| test in 6 months | 18.6, 0.99 | 15.9, 0.99 | 10.8, 0.99 | **9.5, 0.99** | 9.0, 0.99 | 8.4, 0.99 |
| test in 1 year | 19.2, 0.99 | 16.5, 0.99 | 11.4, 0.99 | **10.1, 0.99** | 9.6, 0.99 | 9.0, 0.99 |

Lower goals are faster for every learner with `=on`: 0 inversions in 1,280 adjacent pairs. At audited costs (7-minute page, 35 s item) the recommended set takes 18.2 to 26.2 h.

**Recommended set, multiple by goal and baseline (SIMULATED).** Mean x, worst 1% in brackets, n both reach, of 320. "at 4x" is how many of those n reach it. Main before this round is beside it for careful self-study.

| goal | careful self-study: before > now | tutor d 0.37 | tutor d 0.79 | massed problems | typical student | rereader |
|---|---|---|---|---|---|---|
| 1 week | x0.35 > **x0.85** (0.72), n 299, 0 at 4x | x0.82 (0.67), 306 | x0.79 (0.63), 312 | x0.93 (0.72), 320 | x1.96 (1.14), 292 | x1.97 (1.34), 223 |
| 1 month | x0.44 > **x0.97** (0.84), 303, 0 | x1.07 (0.88), 320 | x1.04 (0.84), 320 | x1.10 (0.88), 298 | x4.71 (2.34), 320, 205 at 4x | x4.90 (2.42), 315, 217 |
| 6 months | x0.63 > **x1.27** (1.10), 320, 0 | x1.02 (0.82), 82 | x0.98 (0.79), 115 | x1.40 (1.13), 320 | x8.71 (5.01), 270, all | x8.83 (5.32), 250, all |
| 1 year | x0.69 > **x1.35** (1.16), 319, 0 | none reach | x1.02 (0.97), 8 | x1.31 (1.07), 319 | x8.96 (5.84), 196, all | x9.18 (6.22), 169, all |
| no test day | x0.78 > **x1.45** (1.26), 319, 0 | none reach | none reach | x1.19 (0.99), 304 | x9.63 (6.75), 83, all | x9.73 (6.66), 69, all |
| test in 1 week | x0.38 > **x0.87** (0.75), 312, 0 | x0.81 (0.67), 317 | x0.78 (0.64), 318 | x0.91 (0.72), 308 | x2.12 (1.38), 279 | x2.31 (1.62), 185 |
| test in 1 month | x0.45 > **x0.98** (0.86), 315, 0 | x0.76 (0.64), 311 | x0.73 (0.61), 313 | x0.85 (0.68), 305 | x2.70 (1.51), 304, 22 | x4.58 (2.34), 309, 185 |
| test in 6 months | x0.63 > **x1.24** (1.09), 320, 0 | x0.65 (0.56), 311 | x0.63 (0.53), 313 | x0.72 (0.60), 306 | x2.30 (1.33), 304, 4 | x3.90 (2.04), 309, 124 |
| test in 1 year | x0.68 > **x1.30** (1.14), 319, 0 | x0.61 (0.53), 311 | x0.59 (0.50), 313 | x0.68 (0.57), 306 | x2.16 (1.27), 304, 0 | x3.65 (1.92), 309, 103 |

Read these with care:
- **No learner reaches 4x against careful self-study, a tutor or massed problems at any goal.**
- **On a dated test, the tutor and massed problems win** (x0.59 to x0.91). They cram at the end, and in this model understanding never fades.
- **At long horizons few tutors reach 0.70**, because that arm has no spaced schedule. A tutor who does space is not modelled; careful self-study is the nearest arm to one, so against a real good tutor at a year expect at or below x1.35.
- **The habit reading is the fair one for rereaders.** The typical student's fixed habit is 10.3 h (recall 0.68 at 1 week, 0.13 at 1 month, 0.00 from 6 months). Against it: x1.56, x1.39, x1.21, x1.13 at 1 week, 1 month, 6 months, 1 year, with no learner's recall below the habit's. So about 1.1x to 1.6x faster, and with far more retained. The rereader's habit (9.3 h): x1.42, x1.26, x1.10, x1.03. Worst 1% is x0.62 at a year, so **some learners take more hours than that habit and keep far more.** Massed-problem habit (5.8 h): x0.83, x0.74, x0.65, x0.61, slower in hours, with far more retained.
- At audited costs: against careful x0.85, x0.98, x1.18, x1.23, x1.31; tutor d 0.79 at 1 month x0.95; at 1 year almost no rereader reaches 0.70.

**Worst individuals (SIMULATED; full tables in `docs/speed-real/r4/worst.txt`):**

| goal | slowest learner, hours | worst 1% hours | lowest recall | worst x against careful | learners under x1 | against main before: slowest x |
|---|---|---|---|---|---|---|
| 1 week | 15.4 | 14.3 | 0.85 | x0.71, two age 9 (7.3 h against 5.2 h, recall 0.94 against 0.83) | 299 of 299 | x1.63 |
| 1 month | 16.3 | 15.4 | 0.94 | x0.83, age 9 | 189 of 303 | x1.53 |
| 6 months | 18.6 | 17.5 | 0.81 | x1.08, age 9 and an English learner age 24 | 0 of 320 | x1.45 |
| 1 year | 19.5 | 18.5 | 0.83 | x1.15, age 9 | 0 of 319 | x1.43 |

All 320 reach recall 0.70 with everything understood at every horizon goal. No kind of learner stands out: at 1 year the mean by kind stays within a few hundredths of x1.35. Young learners and English learners are the slowest in hours.

**"Faster with more retention" for each learner is not fully met.** Every learner is faster than main before this round, but most keep slightly less. Recall, recommended minus main before: mean -3.2 points at 1 week, -1.1 at 1 month, -0.1 to 0.0 from 6 months; worst 1% -7.2 at 1 week, -3.4 at 1 month, -2.2 to -3.1 from 6 months on; single worst -9.5. Understanding stays at 100% reach. Against careful self-study, recall is usually higher at short goals (0.94 against 0.83 above) and lower at long ones (0.88 against 0.95), because each stops at its own schedule.

## 4. The gate (not lowered)

The same lines and margins as `scripts/speed-gate.js`, against main with the plain fixes. Noise, the same arm on another random stream: worst 1% -0.3 to -2.8 points. Full report: `docs/speed-real/r4/gate-report.txt`.

| lever | main gate | adverse variants |
|---|---|---|
| `space` alone | **FAIL at one goal of nine:** 1 week horizon, worst 1% -6.3 (others pass) | 1 week fails on all 8. Also 1 month and test in 1 month if the learner studies only every third day, -11.9 and -9.8. 6 months -5.5 on a noisier app estimate |
| **space + proof + recheck (`=on`)** | **FAIL:** 1 week, worst 1% -6.9, 5% -5.5. All else passes | fails on all 8, mostly 1 week. Every third day: -20.8 at 1 week, -14.4 at 1 month, -11.0 on a test in 1 month. Half as long a memory: -14.8 at 1 week |
| + one prompt + tight | **FAIL:** 1 week, worst 1% -7.2, 5% -5.6 | fails |
| + mastery stop, or everything | **FAIL** by a wide margin at short goals (-19.5) | fails |
| **`=long` + proof + recheck**, rule frozen after reading the above, then fresh seed 20261124, 160 learners | **PASS.** 15.8 > 9.1 h at 6 months, 16.4 > 9.7 h at 1 year, 17.4 > 10.7 h at 3 y, tests at 6 months and a year likewise; short goals unchanged. Worst 1% at or above -4.2 | 6 of 7 pass. **Misses one by 0.4:** massed answers worth 3x more, 6 months, -5.4 |

The same `=long` rule with one prompt and tight on, on seed 20261123, also passes main and misses that one line by 0.1. So **the only form that passes its main gate is `long`, and it misses one adverse line.** Every lever stays off by default, as the rule says.

**The every-third-day failure is the real warning.** Massed retention levels are a buffer for a learner who does not come back: without them, short-goal recall falls 15 to 21 points for the worst. The beta must watch this.

## 5. What each assumption does to the result

SIMULATED. Recommended set, one assumption moved at a time, 80 learners a row. Full: `docs/speed-real/r4/sens-report.txt`. Plans are re-picked per row on a 40-learner design sample, so a row can move about 0.13 from plan choice alone: the careful column does not read a reread half-life at all, yet moves from x1.35 to x1.22 in those rows. Treat that as the noise floor.

| assumption | careful 1 week | careful 1 month | careful 1 year | tutor d 0.79, 1 month | rereader 1 year |
|---|---|---|---|---|---|
| main run (320 learners) | 0.85 | 0.97 | 1.35 | 1.04 | 9.18 |
| an item takes 25 s, not 15 | 0.82 | 0.91 | 1.16 | 1.00 | 6.80 |
| an item takes 8 s | 0.94 | 1.04 | 1.29 | 1.11 | 15.00 |
| 7-minute page, 35 s item (audited) | 0.85 | 0.98 | 1.23 | 0.95 | almost none reach |
| reading at 150 wpm / 238 wpm | 0.86 / 0.86 | 0.98 / 0.96 | 1.20 / 1.36 | 1.04 / 1.04 | 11.17 / 9.01 |
| forgetting twice as fast / half as fast | 0.87 / 0.81 | 1.07 / 0.92 | 1.58 / 1.17 | 1.00 / 0.93 | 9.23 / 9.88 |
| a deep lapse costs half of understanding | 0.88 | 1.12 | 1.37 | 1.05 | 9.77 |
| massed answers worth 3x | 0.85 | 0.98 | 1.24 | 1.05 | 9.89 |
| learners know more / less (±1) | 0.92 / 0.86 | 1.02 / 0.95 | 1.28 / 1.18 | 1.16 / 0.98 | 10.50 / 9.24 |
| careful student stops 0.1 early (no oracle) | 0.83 | 1.00 | 1.33 | 1.03 | 9.79 |
| a read half-life of 1.6 / 7 days | 0.85 / 0.85 | 0.97 / 0.97 | 1.22 / 1.22 | 1.04 / 1.04 | 9.89 / 9.03 |
| studies every third day | 0.81 (n 14) | no fixed baseline reaches | no fixed baseline reaches | none | none |

**What this says:** against careful self-study, the range across all of these is x0.81 to x0.94 at 1 week, x0.91 to x1.12 at 1 month, x1.16 to x1.58 at 1 year. **No assumption tested moves it near 4x.** The rereader figure swings by more than 2x on item seconds alone, and rests on exponential forgetting and on 60 days of rereading: above x6 it is model output, not a claim.

**The assumption that matters most: every question is on the lesson's topic.** An off-topic answer here takes its time and teaches and tests nothing (`--on-topic`, the app's arms only; a careful student works their own book's problems). 160 learners, seed 20261121:

| share of questions on topic | main before, 1 month | recommended, 1 month | main before, 1 year | recommended, 1 year |
|---|---|---|---|---|
| 1 (the headline tables) | 17.5 h, x0.44 | 8.0 h, x0.97 | 18.9 h, x0.69 | 9.8 h, x1.35 |
| 0.5 (objective items reach 0.59 on the grades that have them) | 20.9 h, x0.38 | 11.4 h, x0.70 | 24.4 h, x0.54 | 15.8 h, x0.85 |
| 0.25 | 25.6 h, x0.31, 91% reach | 16.1 h, x0.51, 60% reach | 35.5 h, x0.38 | 28.3 h, x0.48 |
| 0.1 | 33.8 h, 0% reach | 24.5 h, 0% reach | 72.6 h, x0.19 | 65.0 h, x0.21, 89% reach |
| 0.034 (near the AI-judged share, 0.049) | 40.1 h, recall 0.18, 0% reach | 34.2 h, recall 0.22, 0% reach | 111 h, recall 0.34, 0% reach | 101 h, recall 0.37, 1% reach |

Do not read the bottom row as a forecast: pages teach more than the model's share, a bank question on the same coarse skill may help somewhat, and the judge was told to be strict. Read it as direction. **The whole multiple depends on this more than on anything else tested,** and fixing it is worth more than every switch here.

**Assumptions not moved here, with direction:**
- **Every first-pass answer teaches 20% of the gap.** It is not fitted to any real learner.
- **The walk's right or wrong rests on the same model**, so "levels until proven" is simulated on the real rules.
- **Learners answer every question and come back on schedule.** No attrition. Every-third-day above is the one test of it.
- **Checks prove what the page taught.** With off-topic bank checks, a right answer may prove little.
- **Rates from the walker were measured with AI off**, on bank pages and bank items. A tailored account gets written pages and may differ. Re-running with the held-out walker's rates left the recommended arm's rate about the same (0.06 repeated sittings a lesson against 0.09) and made main before slower: 18.5 to 21.2 h, x0.32 to x0.73.

## 6. What would have to be true for 4x

SIMULATED WHAT-IF, never a result. Careful self-study at its hours as they are. Each row keeps those above it. `docs/speed-real/r4/floor-report.txt`.

| on top of the recommended set | 1 week | 1 month | 6 months | 1 year | no test day |
|---|---|---|---|---|---|
| as measured | x0.85 | x0.97 | x1.28 | x1.35 | x1.45 |
| pages take a third of the time and teach as much | x1.10 | x1.23 | x1.55 | x1.62 | x1.70 |
| every review question takes 5 s | x1.32 | x1.59 | x2.21 | x2.40 | x2.68 |
| the mastery stop works, with no recall lost (it does lose recall today, and 12% miss at 1 week) | x1.81 | x2.10 | x2.80 | x3.01 | x3.29 |
| each answer and page teach 2x | x2.32 | x2.64 | x3.46 | x3.68 | x3.98 |
| spaced memory grows twice as fast (to the power 2) | x2.38 | x2.93 | **x4.19** | **x4.58** | **x5.15** |
| the learner already knows more (+1, baseline left alone, which favours the arm) | x2.52 | x3.09 | **x4.41** | **x4.80** | **x5.40** |

To scale: 4x against careful self-study means 2.0 h at 1 month and 3.3 h at 1 year. The recommended set spends 2.4 h on pages, 3.7 h on the first pass and friction, and 3.9 h on review at 1 year. So 4x needs all of these at once: a third of the page time, a review question at a third of the seconds, a stop that loses nothing, a learning rate 2x, and memory growth well above the model's. **Each of the last two is an effect no controlled study found (docs/speed-real/ROUND3.md; the best course-level result found is about 2x, the best tutor case about 3x).** Raising learning alone does not get there either (`sens-report.txt`, the grid).

**At 1 week and 1 month 4x is not reachable in this model at all,** even with everything above (x2.5, x3.1): a careful student's short-goal plan is cheap.

**Is a real-learner study the only way to know? Yes.** Every multiple here rests on a model whose learning rate, half-lives and item seconds have never met a real learner. Nothing in the app can supply it: the speed proof's plain arm is the app. docs/SPEED-PROOF.md has the design: same material, an unannounced test at 30 days, random assignment, about 250 per group for a 5-point retention margin, about 63 per group for a 10-point margin.

**Two cheap steps first, from the beta itself:**
1. Real seconds per item and per page from `items.ms` and `study_sessions.active_ms`. This replaces the largest assumption within days.
2. Randomise `SPEED_SPACE_RETENTION` across the 100 testers, with a delayed check at 1 and 4 weeks. With 50 per arm and an SD of 20 points (assumed) the 95% margin on the difference is about ±8 points: enough to see a large loss, and to measure the hours directly. It would not settle a 5-point margin.

## 7. Switches for the beta

| switch | recommendation | why |
|---|---|---|
| `PRACTICE_FOLLOWS_LESSON`, `LEVEL_GATE_MET` | **on (default)** | Plain bugs. Real-route cuts of about 25% to 30%, in every kind of learner, and no walk stuck |
| `SPEED_SPACE_RETENTION` | **your call between two; I would pick `=on` on half the testers** | See below |
| `SPEED_PROOF_PASSES` | **on** | Ends repeated sittings on a proven objective. Its bar is stricter than the average it replaces. Part of the gated set |
| `SPEED_RECHECK` | **on, with the caveat** | The one big cut for weak and mid learners (never proven 9% to 0%, with weak learners most helped). The same question twice is weaker proof. **The real fix is on-objective questions.** Off once those exist |
| `SPEED_OBJECTIVE_PRACTICE` | **on** | On-topic share 11% to 59% where it applies (AI-JUDGED, n 180 each way), and real evidence for proof. It only reaches 8 of 219 grades. Unit-tested; not in the walks or the simulated set |
| `SPEED_ONE_PROMPT` | **your call** | Under 0.1 h in the model, at an assumed 3 s saved per level, and it takes three quarters of those taps from the scorecard, your other goal. It is not in the recommended numbers |
| `SPEED_TIGHT_PAGE` | **off** | The AI-judged check found points only in the folded text on 29 of 52 pages. Against "all the information". A rewrite that keeps every point is the honest way to a shorter page, and that is not built |
| `SPEED_MASTERY_STOP` and the older levers | **off** | Still fail at short goals, and add little on top of spaced retention (about 0.6 h at 1 year) |

**`SPEED_SPACE_RETENTION`, the choice:**

| | `=long` | `=on` |
|---|---|---|
| The gate | **passes main**; misses one adverse line by 0.4 points | **fails** at the 1-week horizon (worst 1% -6.9 points, recall 0.93 against 0.95, target 0.70) and when studying only every third day |
| Your rule that lower goals are fastest | **broken**: about 14 h at 1 week and 1 month, 9.1 to 10.7 h from 6 months | **kept**: 7.2 < 8.0 < 9.2 < 9.8 < 10.7 h, no learner inverted |
| Short goals | no gain beyond the plain fixes | halved |

The app has no 1-week horizon except as a dated test, and "test in 1 week" passes main under `=on`. The gate names that goal, so it stands, and turning `=on` on is your decision. I would run `=on` on half the testers, because that is also the study that answers it (section 6, step 2), and watch learners who come back rarely.

**The biggest decision, and not a switch: questions written for each objective.** They exist on 8 of 219 grades. They are the honest answer to off-topic practice and the weak recheck, and they would make "proven" mean something. It is a bulk content build, against the current "no bulk base build until the curriculum is tested" rule, so I did not start it. About 16,582 lessons at 3 to 5 questions plus a blind check; I would guess low tens of dollars on the cheapest route, from token counts only. A sensible first step is the grades the first testers will use, then this round's judge again.

## 8. Tests, exact

Run one at a time, not the full suite, as asked. All of these exit 0:
`speed-r4-test` 14 passed; `speed-levers-test` all ok (updated: the exact-shape asserts now carry the new flags); `coverage-test`, `act-curriculum-test`, `curriculum-evidence-test`, `goal-path-test`, `grade-skills-test`, `learner-path-test`, `owner-base-test` 63, `review-schedule-test`, `speed-retention-test`, `study-goal-test`, `bank-games-test` 100, `self-test`, `spanish-path-test`, `speed-proof-test` 120, `speed-proof-http-test` 13, `block-adapt-test`, `block-levels-test`, `daily-plan-test` 78, `first-block-test`, `gap-scan-test`, `instant-test`, `objective-items-test`, `placement-choice-test`, `qa4-fixes-test`, `catchup-review-queue-test`, `learner-followups-test`.

**One fails, and not because of this branch:** `learning-spec-wiring-test` has 6 FAIL lines here and the same 6 at the branch's base commit 47c76d2.

**`npm test` has not been run on this branch.** RULES.md asks for it before a final commit and the brief says not to here. Merging needs one.

## 9. Spending

$0. Only NVIDIA free models, for the AI-judged checks (about 300 calls, some rate-limited; the on-topic runs also set off a few free background level writes for their synthetic account). Nothing went through the Anthropic key, Standard Compute, Lyceum, Coral, Gonka, Munito, Grokified, ZeroGPU, OpenRouter paid models, Modelflare or Higgsfield. The local browser check ran with no keys in its folder; its log shows free-model slots failing for lack of one. Account 6689 was not logged into and has no rows written: the database copy is read only for shared levels and aggregates, and the AI checks exclude it.

## 10. What I could not verify

- **Anything about a real learner.** Hours, recall, retention, scorecard effect, motivation, whether spacing feels worse.
- **The effect on scorecard accuracy.** Answers per lesson fall about 4x. That is less evidence for the scorecard, which is your other goal. Not measured.
- **Review delivery across a whole grade.** The sim assumes 4 looks per skill; the real queue delivered 1.4 to 2.3 per lesson in a 30-lesson walk that was too short for week-old checks. I did not walk the daily review or enforcers end to end. If those looks do not arrive, recall falls (every-third-day is a guide).
- **Written pages on the real walk.** AI off, so few stored block pages were served. Real retention pages would make the before column slower, and spaced retention saves more.
- **Spanish.** Its own player, not walked, and it has no "(retention)" levels.
- **Games.** Taken at their fewest, 12 answers. A real game has 24 to 50 questions, and how long a person plays is unknown. Favourable to the app.
- **Cold writing and "still writing" waits.** Not re-measured.
- **The closing recall question.** Not in the walk.
- **`SPEED_SPACE_RETENTION=long` on the walker** has no goal set, so it reads as on. The goal branch is code-read and not exercised end to end. `SPEED_RECHECK` on block-page lessons is unit-tested only on ordinary items.
- **The AI check's "only in the folded text" list** was not reviewed point by point. I read a sample of 12: most are real points, some are not.
- **The on-topic judge.** One free model at a time, no second judge, first practice level only, strict wording. A question on the right coarse skill may still help a learner. The share could be several times higher under a looser judge, and the direction would not change. Written pages, games and later levels were not judged. Tailored accounts may see other items at some levels: `ai.generateItems` is keyed by coarse skill, so I would not expect it to change much, but I did not walk one with models on.
- **Sources.** No new study was read. Citations are as in ROUND3.md, with its own confirmed and unconfirmed marks.

## Reproduce

```
node scripts/speed-r4-composition.js --out=docs/speed-real/r4/composition.json
node scripts/speed-r4-ledger.js run OUT --set=heldout --grades=2 --lessons=8 --db=DB_COPY [--env=SPEED_SPACE_RETENTION=on,SPEED_PROOF_PASSES=on,SPEED_RECHECK=on]
node scripts/speed-r4-ledger.js report OUT
node scripts/speed-r4-run.js run R4 --width=3 --only=main,gate,sens,long,rec,whatif
node scripts/speed-r4-run.js gate R4
node scripts/speed-real-report.js R4/words R4/words/arms --held=h1,h2 --arms="label=spec;..." --json=FILE
node scripts/speed-r4-sens-report.js R4 ; node scripts/speed-r4-worst.js R4 ; node scripts/speed-r4-floor.js R4
node scripts/speed-r4-page-check.js DB_COPY OUT.json --n=30 ; node scripts/speed-r4-on-topic.js OUT.json --n=60 --follows=on|off
```
