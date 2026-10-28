# Where learning games go, and which ones

Written 2026-10-25 for the bank-fed games (`BANK_GAMES`, on by default).

- **Code:** `services/game-bank.js`, wired in through `config/game-assignments.js` `resolve()`.
- **Sources:** `curriculum-build/games-placement-sources.json`, 42 sources.
  - 26 were already verified in this repo's source lists.
  - 16 are new. Each was DOI-verified on Crossref (no contact or email parameter was sent).
  - Every quote is under 25 words. A script checked each one, word for word, against the abstract from Crossref, OpenAlex or PubMed, or against a quote that was already verified.
- **Tests:** `scripts/bank-games-test.js` (in `npm test`).

## What the games are

The app has two kinds of game. Only one of them can be a level.

| | The 40 level engines (`public/games/engines/*.html`) | The 26 game blocks (`public/engine/blocks/Game_*.js`) |
| --- | --- | --- |
| What it is | A whole level. A question gates every move or turn. | A block inside a lesson page that the model lays out. |
| Contract | One shape for all 40 (`public/games/schemas/*.question-schema.json`): up to 50 questions, each with 4 choices, an `answerIndex`, an explanation, a difficulty, a skill and a topic. | Different for each block (balance weights, crossword cells, bins and so on). |
| Scoring | Every answer goes to `game-answer`. It is recorded as an item and as a mastery attempt, and the finish goes through the mastery gate. | None. A block sends no result to the server. |
| Who fills it | Before today, a model (`game-payloads.js`). Now, the bank. | The model that writes the block plan (`services/block-levels.js`). |

The bank games are built on the **engines**, because only an engine is scored and can stand as a practice level.

The game blocks belong to block plans. Those come from `services/block-levels.js`, which another agent owns, and the blocks send nothing to the server. The second table below maps skill families to the best-fitting blocks for the day block plans are filled from the bank. Nothing wires them in yet.

## The rules

Each rule below has at least three sources. A rule is marked **mixed** where the evidence disagrees.

### R1. Which levels: practice after teaching, never first exposure, never a checkpoint

Games go on independent-practice levels, after the lesson and its guided practice. They never go on:

- a lesson (first exposure);
- a worked or guided activity;
- a checkpoint or essay;
- a placement tester;
- a retention level (those are retrieval blocks of their own);
- a production row: timed, spoken, written, drawn or proved work.

- **sweller1985** (10.1207/s1532690xci0201_3): "worked examples, as expected, require considerably less time to process than conventional problems". Novices first study the method, which is what the guided rows 1-3 are for.
- **kalyuga2003** (10.1207/s15326985ep3801_4): "Instructional techniques that are highly effective with inexperienced learners can lose their effectiveness and even have negative consequences when used with more experienced learners". So the support fades as the ladder goes on, and practice in game form comes once the procedure is known.
- **rowland2014** (10.1037/a0037559): "Engaging in a test over previously studied information can serve as a potent learning event". A game is retrieval practice on something already taught.
- **agarwal2021** (10.1007/s10648-021-09595-9): "the majority of which (57%) revealed medium or large benefits from retrieval practice".
- **Checkpoints stay plain. This is a design choice, and the evidence is mixed.** mavridis2017 (10.1111/jcal.12170): "the students' test anxiety was reduced during the game‐based assessment". A game can be a fair test. But the pass marks were set on the plain quiz, and a game form would change what they measure.

**In code (`placedAt`):**

- The lesson ladder is the nine activities that follow each lesson.
- Slots 4 and 6 of the ladder take a game.
- If one of those rows is a production task, slot 5 stands in for it.
- Grade Review ladders follow the same rule.
- In Spanish, the authored `Game` and `Review Game` rows take a game. Two kinds stay plain:
  - rows whose title names a production or listening task, such as a "Performance Task" review or "Listen and Tap" (the engines have no audio);
  - `Speaking Game` rows, which are timed speaking drills.

### R2. How often: at most two games in a lesson's seven practice levels, never two in a row

- **wouters2013** (10.1037/a0031311): learners gained more from games "when the game was supplemented with other instruction methods, when multiple training sessions were involved". So games repeat across the grade, and plain practice runs between them.
- **rodrigues2022** (10.1186/s41239-021-00314-6): "Supporting the novelty effect, the gamification’s effect started to decrease after four weeks". The same study found a familiarisation recovery later. Games on every level would wear out fastest.
- **adams2012** (10.1037/a0025595): "participants who learned by playing the game performed worse than students who learned from a matched slideshow presentation". Game time costs learning time (their learning-time d = 2.89), so games do not replace every plain level.
- **vogel2006** (10.2190/FLHV-K4WA-WPVQ-H0YM): "when the computer dictated the sequence of the program, results favored those in the traditional teaching method". The engines are self-paced, and the questions wait for the learner.

**The verdict is moderate.** Two games in seven practice levels is a design choice inside this evidence; no study fixes the exact ratio.

**In code:**

- At most two games per ladder.
- The 5-for-4-or-6 stand-in never leaves two game levels side by side.
- About 29% of a lesson's practice levels are games.

### R3. Ages and subjects: preschool to undergraduate, knowledge subjects; skill tracks only on knowledge rows

- **clark2016** (10.3102/0034654315582065), a K-16 meta-analysis: "digital games significantly enhanced student learning relative to nongame conditions".
- **tokac2019** (10.1111/jcal.12347): "video games are a slightly effective instructional strategy for teaching mathematics across PreK‐12th‐grade levels".
- **mayer2019** (10.1146/annurev-psych-010418-102744): "three promising areas where games may be more effective than conventional media: science, mathematics, and second-language learning".
- **chen2018vocab** (10.1111/bjet.12526): "the effects of DGBL on vocabulary learning may vary with game design features". The same abstract finds no moderation by learners' age.
- **ramani2008** (10.1111/j.1467-8624.2007.01131.x): preschoolers who played a number board game improved, and "The gains remained 9 weeks later."
- **For the physical skills, the evidence goes the other way.**
  - abadrobles2020 (10.3390/ijerph17020505), on game-based teaching: "they did not show significant improvements in skill execution".
  - zhu2024 (10.3390/bs14100919): the "transfer effect on real-game performance improvement (ES = 0.65) was inferior to laboratory performance improvement (ES = 1.51)".
  - So a quiz game never replaces the board, keyboard or court work.

**In code:**

- **Tracks:** math, reading, English, Spanish, IQ and ACT; chess, piano and basketball on knowledge skills only (`KNOWLEDGE_SKILLS`).
- **Grades:** no games in graduate grades and beyond (`graduate_core*`, `masters*`, `doctoral`, `postdoctoral*`, `senior_scholar`, `field_authority`), because the meta-analyses stop at K-16.
- **Bank items:** a level gets a game only when the bank fills at least 24 questions that fit it. Passages, chess boards and media prompts do not go into an engine, so reading-comprehension and chess-tactics levels stay plain.

### R4. Mechanics that fit the skill (intrinsic integration), and honest item writing

- **habgood2011** (10.1080/10508406.2010.508029): "children learned more from the intrinsic version of the game under fixed time limits and spent 7 times longer playing it".
- **siegler2008** (10.1111/j.1467-7687.2008.00714.x): number board games improved estimation, and "Playing games that substituted colors for numbers did not have this effect."
- **laski2014** (10.1037/a0034321): "The general importance of aligning learning activities and physical materials with desired mental representations is discussed." This is from the count-on study on a 0-100 board.
- **clark2016**: "effects varied across various game mechanics characteristics, visual and narrative characteristics, and research quality characteristics".
- **sailer2017** (10.1016/j.chb.2016.12.033): "gamification is not effective per se, but that specific game design elements have specific psychological effects".

**Honest limit:** all 40 engines are *extrinsically* integrated. The question gates the move; the move is not the skill. The only partial fits are these:

- the numbered board of snakes-and-ladders, for number skills (the Siegler and Laski boards);
- hangman spelling the answer word, for vocabulary (used only when every answer is one plain word);
- memory-match pairing, for paired facts.

The bank prefers these for those skill families. Otherwise it uses turn-based boards, where a question gates every turn, so the practice is most of the time spent.

Item writing:

- haladyna2002 (10.1207/s15324818ame1503_5) is the taxonomy behind putting numeric options in numerical order.
- attali2003 (10.1111/j.1745-3984.2003.tb01099.x): "questions with middle correct answers are easier and less discriminating than questions with extreme correct answers". So each set places its keys in all four positions.
- Interleaving earlier skills, one draw in four, happens on math, IQ and ACT only. rohrer2015 (10.1037/edu0000001) supports it for math, and brunmair2019 (10.1037/bul0000209) says "the setting and the type of learning material must be considered", so it is not done for words and texts.

### R5. No seductive details and no time pressure, especially for young and weaker learners

- **harp1998** (10.1037/0022-0663.90.3.414): readers given seductive details "recalled significantly fewer main ideas and generated significantly fewer problem-solving transfer solutions than those who read passages without seductive details".
- **mayer2001** (10.1037/0022-0663.93.1.187): "Lower transfer performance also occurred when the authors added interesting but irrelevant details to the narration".
- **noetel2022** (10.3102/00346543211052329): "Good design was more important for more complex materials, and in system-paced environments (e.g., lectures) than self-paced ones".
- **Time pressure. The evidence is mixed.**
  - kellogg1999 (10.1016/S0887-6185(99)00025-0): "the timing manipulation negatively affected arithmetic performance in both high and low anxious participants".
  - ashcraft2002 (10.1111/1467-8721.00196): "timed, on-line tests reveal math-anxiety effects on whole-number arithmetic problems".
  - ramirez2013 (10.1080/15248372.2012.664593), with first and second graders: "we found a negative relation between math anxiety and math achievement for children who were higher but not lower in WM".
  - Against: caviola2017 (10.3389/fpsyg.2017.01488): "currently there is not much evidence of clear associations".
  - The rule takes the safe side: a learner is never timed on an answer.
- **Success rate for weaker learners. The evidence is mixed.**
  - jansen2013 (10.1016/j.lindif.2012.12.014): "the higher the pre-set success rate, the more problems were attempted, and the larger the improvement in math performance".
  - lomas2013 (10.1145/2470654.2470668): "the most engaging design conditions produced the slowest rates of learning".
  - So the set leans slightly easy without being all easy. The draw offsets around the level's difficulty are -1.5, -1, -0.5, 0, 0, +0.5, 0 and +1.

**In code (the engine pools):**

- **Never used:**
  - countdowns (spot-it, 4.5 s);
  - answering by aiming at moving or thrown targets (duck-hunt, ring-toss), where a motor slip would be scored as a wrong answer;
  - timed taps (whack-a-mole);
  - a wrong answer that ends the run (dino-runner, flappy-bird);
  - wagering (coin-flip, blackjack);
  - engines that ask only on a tie, a duplicate or a forced draw (war, trash, uno);
  - real-time arcade play between rare questions (pinball, ping-pong, pong-breakout, air-hockey, snake, crossy-road, pac-man, mario, moto-x3m, tetris, hole-io, tiny-fishing, eight-ball-pool);
  - a colour-memory task between questions (simon-says).
- **The early band** (school grade 2 and below, and the first two grades of IQ, chess, piano and basketball) gets only the calm boards: snakes-and-ladders, memory-match, tug-of-war, connect-four, hot-air-balloon, tic-tac-toe and capture-the-flag.
- Every engine pauses for its question, so the learner answers at their own pace.

### R6. Scoring feeds mastery, the same way as a plain practice level

- **kulik1990** (10.2307/1170612), on mastery learning: "The effects appear to be stronger on the weaker students in a class".
- **bloom1984** (10.3102/0013189X013006004): "Formative tests (the same tests used with the conventional group) are given for feedback followed by corrective procedures".
- **wise2005** (10.1207/s15324818ame1802_2): "unmotivated examinees will answer too quickly (i.e., before they have time to read and fully consider the item)". Each answer's time in milliseconds is recorded and goes to the ability model, as it does for any item.
- **shute2008** (10.3102/0034654307313795): "formative feedback should be nonevaluative, supportive, timely, and specific". After an answer, the engine shows the key and the bank's own rationale.
- **deci1999** (10.1037/0033-2909.125.6.627): "Positive feedback enhanced both free-choice behavior (d = 0.33) and self-reported interest (d = 0.31)". The game's own points are not a reward the level hands out; the mastery gate settles the level.

**In code:**

- Each answer goes to `game-answer`, which:
  - records an item, with the bank's key, its difficulty and the time taken;
  - records a mastery attempt, on the **question's own skill** (before, the skill was taken in turn from the level's list);
  - adds one to the level's item count.
- At the end of a game, `game-finish` runs the same mastery gate as practice: `tryLevelUp`, and only on the level the learner stands on.

### R7. Gamification as a whole: the evidence is mixed

These are read as "games help modestly when designed well", not as "more game is better".

- **sailer2020** (10.1007/s10648-019-09498-w): "factors contributing to successful gamification are still somewhat unresolved, especially for cognitive learning outcomes".
- **hamari2014** (10.1109/hicss.2014.377): "the effects are greatly dependent on the context in which the gamification is being implemented, as well as on the users using it".
- **zeng2024** (10.1111/bjet.13471) is positive: "the results revealed a moderately positive effect of gamification on student academic performance (Hedges's g = 0.782".
- **deci1999**: "engagement-contingent, completion-contingent, and performance-contingent rewards significantly undermined free-choice intrinsic motivation".
- **byun2018** (10.1111/ssm.12271): the K-12 math pool is thin: "only 17 out of the 33 studies were analyzed to calculate the overall effect size".
- **wouters2013** (above): learning d = 0.29 and retention d = 0.36. The same abstract finds games "were not more motivating (d = 0.26, p > .05)".

## How the questions are made (accuracy and grade fit)

- **The bank's own items.** Every question is a `content/bank.js` item or a kept objective item:
  - its prompt is kept word for word, except a dropped "Give a whole number." line;
  - its key and its rationale are the item's own.
  - Objective items written for the lesson the level follows come first (M57, "games practise what the last lesson taught").
- **Wrong options:**
  - A multiple-choice item keeps three of its own wrong options. If the key would stand out by its length, the next three are tried.
  - A numeric type-in item, or one with three options, gets near-miss wrong numbers: one or two off, ten off, or the digits reversed. This happens only when its prompt asks for one exact number.
  - Nothing comparative or open is converted: "greater", "between", "even", "about", "round" and similar words skip the item.
- **Checks on every question:**
  - the length-cue rules (the objective-items rule and the game check's rule);
  - the explanation-key agreement check;
  - the math-claims check;
  - no media, no markup, no "type" or "enter" instructions, and no decimals or percentages.
- **Grade fit:**
  - Every draw goes through `config/grade-skills.js` `fitEntry`: the difficulty is capped to the grade's range and the school grade is passed on, so math serves that grade's standard.
  - A grade's largest number is enforced on the prompt, every option and the engine's own board:
    - preschool: 20;
    - Kindergarten: 99, so never a three-digit number;
    - grade 1: 120;
    - grade 2: 1,000;
    - grade 3: 10,000.
- **Deterministic:**
  - Seeded by track, grade and level, so a level always has the same set.
  - `content/bank.js` gained a `stable` option and `content/pool.js` gained `stably()`. Without them, the first 12 calls of a shape-rotating generator in a process could differ.
  - The set is computed in a few milliseconds, never stored and never written by a model.
- **The same for everyone.** Every account gets the same base set, the owner included. There is no tailoring and no model call.

## Table 1. Skill family to the engines the bank uses (wired), best fit first

| Skill family (bank skills) | Early band (K-2 and young) | Standard band |
| --- | --- | --- |
| Number sense and arithmetic (counting, place_value, facts_within_20, add_sub, mul_div, fractions, decimals, measurement, word problems, ratios, percents, integers, data) | **snakes-and-ladders** (number board), memory-match, tug-of-war, connect-four, hot-air-balloon, tic-tac-toe | **snakes-and-ladders**, yahtzee (dice sums), bingo (numerals to 75), bowling (pins and frames), connect-four, tug-of-war, capture-the-flag |
| Symbolic math (equations, functions, algebra, geometry, calculus and on) | — | connect-four, capture-the-flag, mancala, archery, free-throw, tic-tac-toe |
| Shapes and spatial | **memory-match**, connect-four, tic-tac-toe, capture-the-flag, tug-of-war | memory-match, connect-four, capture-the-flag, tic-tac-toe, mancala |
| Early literacy and phonics | **memory-match** (sound and letter pairs), snakes-and-ladders, tug-of-war, connect-four, hot-air-balloon, tic-tac-toe | memory-match, tug-of-war, connect-four, snakes-and-ladders, hot-air-balloon |
| Vocabulary (Spanish core vocabulary, gender, words in context) | as early literacy | **hangman** (only when every answer is one plain word), memory-match, tug-of-war, connect-four, hot-air-balloon |
| Grammar, usage, punctuation, writing conventions; Spanish grammar | tug-of-war, connect-four, memory-match, tic-tac-toe, hot-air-balloon | tug-of-war, connect-four, capture-the-flag, tic-tac-toe, mancala, hot-air-balloon |
| Literary analysis, rhetoric, linguistics | — | capture-the-flag, mancala, connect-four, tower-defense, tug-of-war |
| Reasoning (IQ: logic, syllogisms, matrices, analogies, odd one out) | tug-of-war, connect-four, memory-match, tic-tac-toe | mancala, connect-four, capture-the-flag, tower-defense, tic-tac-toe |
| ACT (test strategy) | — | tug-of-war, capture-the-flag, connect-four, archery, free-throw, tower-defense |
| Piano knowledge (reading, intervals, chords, keys) | memory-match, connect-four, tug-of-war | memory-match, connect-four, tug-of-war, bowling, hot-air-balloon |
| Basketball knowledge (rules, stats) | — | free-throw, capture-the-flag, connect-four, tug-of-war |
| Chess knowledge (board, history, openings) | — | mancala, capture-the-flag, connect-four, tic-tac-toe |

- A Spanish game row that names its mechanic gets that engine: "Memory Pairs" gets memory-match, a "race" gets tug-of-war, "Fix" gets connect-four, and "Builder" gets capture-the-flag.
- Neighbouring game levels in a grade rotate through the family's pool.

## Table 2. Skill family to the best-fitting of the 26 game blocks (in-lesson, not wired)

| Skill family | Best fit (intrinsic: the action is the skill) | Also fits (extrinsic) | Avoid for young or weaker learners |
| --- | --- | --- | --- |
| Number comparison, equality (K-2) | Game_CantileverBalance (more, less or equal as weight) | Game_TugOfWar, Game_MemoryMatch (numeral and quantity) | Game_AsteroidBlaster |
| Addition facts, making a total | Game_BlackjackThreshold (draw to a target sum) | Game_VaultCracker, Game_TicTacToe | Game_DuckHunt (moving targets) |
| Ratios and proportion | Game_ElevatorWeight (proportional loads) | Game_CantileverBalance | — |
| Linear equations | Game_CantileverBalance (an equation as a balance) | Game_VaultCracker, Game_EscapeRoom | — |
| Angles, reflection, vectors | Game_LaserMirror, Game_SpaceDocking | — | — |
| Sorting and classifying (shapes, parts of speech, categories) | Game_ConveyorSorter (route each item to its bin) | Game_ConnectFour | Game_WhackAMole (timed pops) |
| Vocabulary and spelling | Game_CrosswordMini (recall from a clue), Game_HangmanGallows | Game_MemoryMatch (word and meaning) | — |
| Grammar and usage | Game_ConveyorSorter (right and wrong sentences) | Game_TicTacToe, Game_ConnectFour | — |
| Argument, logic, fallacies | Game_CardBattler (argument strength), Game_HazardSweeper (fallacies as mines) | Game_EscapeRoom | — |
| Meter and rhythm | Game_RhythmTap (only where timing is the skill) | — | Game_RhythmTap in any other subject |
| Circuits and flow (science) | Game_CircuitBreaker, Game_PipelinePlumber | — | — |
| Valuation and finance | Game_AuctionBidder | — | — |
| Basketball knowledge | Game_FreeThrow | Game_TowerDefense | — |

## What each subject gets (2026-10-25)

Counted with the builder on 2026-10-25, across every grade.

- **Placed** means the rules put a game at the level.
- **Filled** means the bank produced at least 24 qualifying questions, so the level plays as a game.
- A placed level that does not fill stays an ordinary practice session.
- The build took 3 to 80 ms per level on average, depending on the subject; one level is computed once per process.

| Subject | Practice levels | Placed | Filled (games) | Engines used | Why some placed levels stay plain |
| --- | --- | --- | --- | --- | --- |
| Math | 24,435 | 3,449 | 3,436 | connect-four, capture-the-flag, tic-tac-toe, mancala, archery, free-throw, tug-of-war, snakes-and-ladders, bowling, yahtzee, bingo, memory-match, hot-air-balloon | A few rational-number and statistics levels have too few four-option or exact-number items |
| English (Proficient excluded) | about 6,600 | 1,011 | 991 | connect-four, tug-of-war, hot-air-balloon, mancala, tic-tac-toe, capture-the-flag, memory-match, snakes-and-ladders, tower-defense | Upper-grade writing skills are mostly passages |
| English Proficient | 450 | — | its own 73 authored games | unchanged | Authored grade: no bank games added |
| Reading | 5,544 | 968 | 854 | tug-of-war, connect-four, capture-the-flag, mancala, tower-defense, memory-match, snakes-and-ladders, hot-air-balloon, tic-tac-toe (and a few bingo, bowling, yahtzee) | Comprehension levels need their passage, which an engine cannot show (mostly upper-intermediate reader) |
| Spanish | 8,609 | 680 (`Game` and `Review Game` rows) | 595 | memory-match, connect-four, capture-the-flag, tug-of-war, hot-air-balloon, mancala, tic-tac-toe | Advanced grades (C1 and literature) have few four-option items. "Listen and Tap" rows need audio |
| IQ | 23,667 | 3,884 | 3,877 | connect-four, tic-tac-toe, capture-the-flag, mancala, tower-defense, memory-match, tug-of-war, snakes-and-ladders, hot-air-balloon | Working-memory items need the digits hidden, so they are never used |
| ACT | 8,442 | 1,317 | 1,314 | tug-of-war, capture-the-flag, connect-four, archery, free-throw, tower-defense | — |
| Piano (knowledge rows) | 14,700 | 2,661 | 1,247 | memory-match, connect-four, hot-air-balloon, tug-of-war, bowling, tic-tac-toe, snakes-and-ladders | Repertoire, technique and practice rows are played on the keyboard. Terms and repertoire facts have only 4 to 8 different items |
| Basketball (knowledge rows) | 12,177 | 2,237 | 387 | free-throw, capture-the-flag, connect-four, tug-of-war | Only the stats items vary enough. Rules, history, health and tactics have 2 to 9 different items each |
| Chess (knowledge rows) | 11,745 | 2,382 | 6 | (6 levels) | Moves, tactics, mates and endgames need a board. History, openings and strategy have about 8 different items |

**Kindergarten, Numbers to 20 and Teen Numbers** (the grade the owner played) has 82 game levels out of 378 practice levels:

- tug-of-war 17, memory-match 17, connect-four 13, tic-tac-toe 12, snakes-and-ladders 11, hot-air-balloon 8, capture-the-flag 4.
- In each lesson's ladder, levels 1-3 after the lesson stay plain on purpose (R1). The games are the 4th and 6th levels after each lesson: 14 and 16, 24 and 26, 36 and 38, and so on.
- Placement is computed at run time. The testers (levels 1-9), lessons, retention rows and checkpoints stay plain.

## Switches and rollback

- **`BANK_GAMES=off`** (then restart): `resolve()` is the old engine cycle exactly, with model-written sets, and no bank set is served. The test checks this.
- **`GAME_HOLDS`** is unchanged and still applies. A held level is never a bank game.
- **English Proficient** keeps its authored assignments. Nothing is added to it.
- **Full rollback:**
  1. Delete `services/game-bank.js`, `scripts/bank-games-test.js`, this file and `curriculum-build/games-placement-sources.json`.
  2. Restore the backups in the session scratchpad `before-games\`: `config/game-assignments.js`, `services/game-payloads.js`, `routes/base-lessons.js`, `content/bank.js`, `content/pool.js`, `scripts/spanish-csv-test.js`, `package.json`. Other agents may have edited the same files since; prefer reversing only the hunks named in `LIVE-CHANGES-2026-10-24.md`.
