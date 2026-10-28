# Staged: skills round 3, the chess, piano and basketball decisions as one-step patches

Round 2 (`../skills/`, `../../../ADAPTIVE-COVERAGE.md` section 6) proved in simulation that a stage gate keeps every stage's skills at the bar: two cold passes on different days, a belief model so lucky passes cannot prove anything, confirmed microphone or camera results only, and proofs older than 7 days passed again. It needed a store, stage tests on the path, the gate itself and a practice plan. This folder builds them, one patch per decision (ADAPTIVE-COVERAGE.md section 7, decision 10).

**Nothing here is live.** Each patch is off by default behind its own flag.

## How to apply (in number order; 01 first)

```
cd <repo root>
git apply --check -p1 curriculum-build/staged/adaptation/skills-round3/01-skill-record.patch   # dry run
git apply -p1 curriculum-build/staged/adaptation/skills-round3/01-skill-record.patch
# then 02, 03 and/or 04 the same way; set the flags in .env and restart
```

- **Dependencies:** 02, 03 and 04 need 01 (the store). 04's played drills are 02's checks played warm; without 02 it still plans, and sets are logged on the learner's word. 03 reads 02's "not built yet" list when 02 is there. 05 needs 01 and 02 (it changes their files; see its section).
- **Patch checks:** each of the four passes `git apply --check -p1` on today's live tree. All 15 non-empty subsets apply in number order on a clean copy, every changed file passes `node --check`, and each subset reverses cleanly with `git apply -R`.
- **How they fit together without touching each other's files:** 01 mounts `routes/skills.js` and draws the "This stage" rows on the path; it picks up `routes/skill-checks.js`, `routes/skill-gate.js` and `routes/skill-dose.js` when their patches have added them. 02 and 04 add only new files; 03 adds one hook to `services/mastery.js`.
- **New tests:** `scripts/skills-r3-{record,checks,gate,dose}-test.js`, one per patch. They are not added to `npm test`, so the patches do not collide on `package.json`. Add each to the chain when you apply it.
- **Undo:** `git apply -R -p1 <patch>`, in reverse order.

| patch | flag | default | files |
|---|---|---|---|
| 01 skill record | `SKILL_RECORD=on` | off | `config/db.js` (collection), `routes/consent.js` (export/deletion list), `server.js` (1 mount), `public/path.html`, `public/js/path.js`; new: `services/skill-record.js`, `services/skill-coverage.js`, `routes/skills.js`, `content/skill-progressions/*.json`, `public/js/skill-kit.js`, `public/css/skills.css`, `scripts/lib/skills-r3-fixture.js`, test |
| 02 stage tests | `SKILL_STAGE_TESTS=on` | off | new: `content/skill-stage-checks.js` (+ `.data.json`), `services/skill-checks.js`, `routes/skill-checks.js`, `public/stage-check.html`, `public/js/stage-check.js`, test |
| 03 stage gate | `SKILL_STAGE_GATE=on` | `shadow` (records only); `off` | `services/mastery.js` (graduation hook); new: `services/skill-gate.js`, `routes/skill-gate.js`, `public/stage-left.html`, `public/js/stage-left.js`, test |
| 05 chess sittings (2026-10-24) | `SKILL_CHESS_SITTINGS=on` | off | changes 02's `content/skill-stage-checks.js`, `services/skill-checks.js`, `routes/skill-checks.js`, `public/stage-check.html`, `public/js/stage-check.js` and 01's `services/skill-coverage.js`; new: `content/chess-endgame-tables.js` (+ `.data.json`), `content/skill-chess-sittings.js` (+ `.data.json`), `services/skill-chess-sittings.js`, `public/js/chess-sittings.js`, test |
| 04 practice dose | `SKILL_DOSE=on` | off | new: `services/skill-adaptation.js`, `services/skill-dose.js`, `routes/skill-dose.js`, `public/skill-practice.html`, `public/js/skill-practice.js`, test |

## 01 The skill record (`SKILL_RECORD=on`)

- **Store:** a new collection `skill_records`, added to `config/db.js` the way the others are, and to `KNOWN_COLLECTIONS` in `routes/consent.js` in this patch only, so a parent's export and a child's deletion reach it.
- **One row per learner per exit-battery metric.** Every sitting is kept with its time, UTC day, pass or fail, cold or warm, the source word (`board`, `midi`, `mic`, `count`, `camera`...), its class (exact or estimate), whether it was confirmed, whether it counted and why not, score, n and kind (stage, retention or re-sit test). Warm practice sets are kept too (time, at target or not).
- **The rules** are round 2's `skill-coverage.js`, unchanged, moved to `services/skill-coverage.js`. The stages come from `content/skill-progressions/*.json`, copies of the staged progressions.
  - Cold: the first sitting of that metric that day, 20 or more hours after it was last practised or sat.
  - Two different days, and a Bayes belief, so a pass, a miss and a pass does not prove anything.
  - Source honesty: a microphone or camera result counts only when confirmed. A source the metric does not list never counts; for example, on-screen keys do not count for "3 pieces cold", which lists MIDI and the microphone.
  - Retention test where the stage names one. A proof older than 7 days is "stale" and needs a fresh cold pass before the stage can be left.
- **Server:** `GET /api/skills/record/:enrollmentId` (the stage, every metric's state, the gate, and the knowledge side from `services/coverage.js`) and `GET /api/skills/path/:enrollmentId` (the path rows from the parts that are on). Both answer 404 while the flag is off.
- **Nothing learner-visible** comes from 01 alone.

## 02 Stage tests on the path (`SKILL_STAGE_TESTS=on`)

**What the learner sees**
- **A "Stage check" row** in a "This stage" section of the path.
  - It becomes the next step when the exit battery is due: the learner has reached the grade's Final, or, with 04 on, the practice plan calls a cold test early.
  - At other times it says "Opens at the Final; any check can be sat early".
- **The stage check page** (`/stage-check?enrollment=`) shows:
  - every machine-provable skill of the stage, what its test is, and its bar;
  - its state: cold passes so far out of 2 days, its retention check date, and its last sitting and whether it counted;
  - "Sit it" when it is cold now; otherwise "Cold tomorrow at 9:30", with a "Sit warm" option that is recorded and never counts.
- **A sitting** is a test: no answer is shown until it is over. Then the page shows the result, whether it counted, and the ones missed with their answers.

**How each metric is sat** (`content/skill-stage-checks.js`)

| | wired in round 3 | how |
|---|---|---|
| Chess | which squares a piece reaches (CH0); check, mate or stalemate, 20 (CH1); mate in one unannounced, 10 mates and 5 without (CH1); tactics unannounced, 30 (CH2, CH3); K+P v K win or draw, 20 (CH3); puzzle rating (CH4, CH5) | Positions computed with `content/chess-board`; tactics from the Stockfish-verified pool, with the motif hint removed; KPK answers from the table-proved staged drills, mirrored left to right at random; the rating is the trainer's Glicko-2, at least 10 rated puzzles after the sitting opens, against a cut [R] with RD of 80 or less. Moves are played on the board or typed. |
| Piano | find keys, steady beat, echo, a song from memory (PI0); five-finger pattern, pieces, a tune by ear (PI1); C scale, pieces, major/minor by ear (PI2); scales at random hands together, pieces (PI3); scales and arpeggios, I-IV-V7-I, pieces (PI4) | MIDI, the on-screen keys or the microphone through the existing piano engine. The page sends note events (key, time, velocity, source) and piano-core's `scorePerformance` scores them on the server against the target: notes, on the beat, evenness CV, stops. Chords are compared by pitch class. Pieces come from the song library. A microphone take is an estimate: a second passing take of each part confirms it. |
| Basketball | catch and bounce, low target, the safety rule (BB0); lay-ups each hand, dribbling eyes up, basic rules (BB1); form shots, lay-ups off the dribble (BB2); free throws, Mikan (BB3) | Logged counts. Make-rate bars use the Beta posterior P(rate >= bar) >= confidence, with a minimum n per sitting. The camera tracker's count is an estimate and counts only when the learner ticks that they watched and it is right. Growth metrics (Mikan, catch and bounce) measure against the learner's own first count. |
| **Not wired yet (listed with what each needs)** | chess play-outs against perfect defence (KQK, KRK, KPK, Lucena/Philidor), recorded games, star mazes, set-up from memory, full-line calculation (**all wired by patch 05, below**); piano sight-reading staircase; basketball decision clips (**wired by section 06, below, with every later piano and basketball stage**) | They stay unproven. With the gate on, a stage with any of them cannot be left until it is wired. Fully wired in round 3: PI0, PI1 and BB0; with 06, every PI and BB stage. |

**Consent:** camera and microphone stay on the device. The page's only network calls are to `/api/skills`, and it has no recorder, no `getUserMedia` of its own, no upload path, and no outside host (checked by the test). The microphone is used only through `PolymathPianoIO`, which turns sound into note events on the device. `scripts/consent-test.js` passes, including its no-upload scan.

## 03 The stage gate (`SKILL_STAGE_GATE=on`; default `shadow`)

- **Off:** nothing happens.
- **Shadow (the default):** a passed Final graduates as before, and what the gate would have said is written on the enrollment (`skill_gate_shadow`).
- **On:** a passed Final on a stage's last grade does not graduate while any machine-provable metric is unproven, waiting on its retention test, or stale.
  - **The path** says "Graduation waits on this stage's skills, 2 left".
  - **The page** `/stage-left?enrollment=` shows a "Measured skills proven" meter and lists what is not proven yet, what is waiting on the retention check, and what was proven over a week ago, each with when it can next be sat cold. It also lists the attested-only metrics (never a gate) and the stage's lesson objectives (held by the coverage gate, not this one).
  - **"Graduate"** appears once the stage is complete. It calls `mastery.clearCheckpoint` again, so the bar never moves. The Final is not sat again.
- **Only the performance side** is decided here. The knowledge side stays with `COVERAGE_GATE`. A grade that is not its stage's last does not leave the stage, so it is never held.

## 04 The practice-dose plan (`SKILL_DOSE=on`)

- **Today's practice** (`/skill-practice?enrollment=`, and a "Today" row on the path) runs `skill-adaptation.planSession` on the learner's record, in the stage's own session length. The plan is fixed for the day, and the sets count down.
  - **To prove:** sets go to unproven skills by how far the last warm sets are from the bar. Every unproven skill gets at least one set, and `checkPlan` proves none is dropped.
  - **Make it last (the maintenance share, new this round):** a proven skill keeps its share of the session until it has had twice the sets it took to prove it.
  - **Keep it:** after that, one maintenance set each session.
  - **Cold test first:** when the last three warm sets were at the bar, or every 5 days, the plan calls a cold test. It shows on the stage check, and the practice page says to sit it first, because practising makes it warm for 20 hours.
- **A set** is the skill's own check played warm with feedback, judged by the same bar: 5 questions with the answer after each, one piano part, or one logged basketball set. Skills not checkable in the app (games, play-outs) are practised where the app has them and logged on the learner's word. That only times the next cold test; warm sets never prove anything.

### The maintenance share, measured (`skill-audit.js`, 8 profiles × 6 learners, seed 20261023; full output `skill-audit.txt`)

Round 2 found that dose adaptation alone kept less 30 days after a stage than the gate's even practice (chess 0.71 vs 0.84), because it stopped drilling proven metrics. The audit now runs round 2's plan (`adaptive_r2`) beside the new one (`adaptive`).

| mean cold pass chance 30 days after leaving a stage, no practice meanwhile | round 2 plan | round 3 plan | gate (even practice) |
|---|---|---|---|
| chess CH0-CH5 | 0.706 | **0.774** | 0.844 |
| piano PI0-PI4 | 0.566 | **0.684** | 0.730 |
| basketball BB0-BB3 | 0.725 | **0.804** | 0.810 |
| practice minutes per stage: chess / piano / basketball | 2,810 / 2,985 / 2,398 | **2,807 / 2,983 / 2,424** | 3,210 / 3,047 / 2,682 |
| metrics truly at the bar at exit: chess / piano / basketball | 98.1 / 96.7 / 98.9% | 99.9 / 97.7 / 99.6% | 100 / 99.9 / 99.8% |

- **Recovered at no extra time:** the share recovers 49% (chess), 72% (piano) and 93% (basketball) of the gap to the gate, at the same minutes as round 2: 0%, 0% and +1%. That is still 13%, 2% and 10% fewer minutes than the gate.
- **Seed 7 agrees:** 0.704 → 0.773, 0.568 → 0.703 and 0.728 → 0.794 (`skill-audit.seed7.txt`).
- **Guarantee:** 0 violations. No stage was completed or skipped without every machine-provable metric proven on two cold days, re-derived from its sittings, and no plan dropped an unproven metric.
- **Why the rest of the chess gap is not closed inside the plan:** in the audit's truth model, retention at 30 days comes from practice volume after the bar. The gate's extra comes from the days it practises evenly after the lessons end, while it waits on proofs and retention tests. The adaptive plan proves skills during the lessons, so the stage ends sooner. Matching the gate means buying those minutes back by holding the exit, which is decision 10c below.
- **Tried and not adopted:**
  - **A fixed 30% share capped by the unproven sets:** too little in short chess sessions (0.722).
  - **Carry-over maintenance in later stages** (`SKILL_CARRY_DAYS`, off): in this truth model a sparse set restarts the sag clock, so it kept less (0.754) and cost about 1,800 minutes. The truth model has no spacing benefit; real learners probably do. Worth re-measuring on real data.
- **Knobs:**
  - `SKILL_MAINT_SHARE`: `-1`/`even` is the default; `0` is round 2's plan.
  - `SKILL_OVERLEARN`: default 2; `SKILL_OVERLEARN_MIN`: default 4.
  - `SKILL_CARRY_DAYS`: default 0; `SKILL_CARRY_MAX`: default 2.
  - The staged `../skills/skill-adaptation.js` is the source; `services/skill-adaptation.js` in patch 04 is the same code.

## 05 Chess sittings (`SKILL_CHESS_SITTINGS=on`; default off in the patch, **on in the live app since 12:20 UTC 2026-10-24**, with CH2-CH5 kept in gate shadow: LIVE-CHANGES-2026-10-24.md)

Built 2026-10-24 (night run, item 6a). It wires every chess check that 02 listed as "not built yet", so with it on all **20 of 20** machine-provable metrics of CH0-CH5 have a sitting (`skill-audit.js --checks=<app>`; before: 12 of 20, and every chess stage held in shadow).

- **Needs** 01 and 02 (both live since 03:30). It changes 02's `content/skill-stage-checks.js` (`checkFor` asks 05 first), `services/skill-checks.js` (opens, grades, records the new kinds; one move at a time per sitting), `routes/skill-checks.js` (two routes), `public/js/stage-check.js` and `public/stage-check.html` (one script), and 01's `services/skill-coverage.js` (`validate` can say which provable metrics have a sitting). New: `content/chess-endgame-tables.js` (+ `.data.json`), `content/skill-chess-sittings.js` (+ `.data.json`), `services/skill-chess-sittings.js`, `public/js/chess-sittings.js`, `scripts/skills-r3-chess-test.js`.
- **The live per-stage gate:** it holds a stage as soon as none of its checks is `not_wired`. With 05 on, a chess stage whose sittings this server can run starts holding by itself. A sitting this server cannot run (no Stockfish, or no measured bot in the band) still says `not_wired` with what it needs, so its stage stays in shadow. `SKILL_STAGE_GATE_SHADOW=CH0,...` keeps named stages in shadow.
- **Routes:** `POST /api/skills/checks/:enrollmentId/:metric/move` (`{move}` for play-outs and games, `{to}` for mazes) and `.../resign` (give up the current play-out, maze or game). Both answer 404 while the flag is off.

**How each metric is sat**

| metric | sitting | the machine's verdict |
|---|---|---|
| CH0 star mazes at par | 4 mazes (rook, bishop, queen, knight), 3-4 stars, 2-4 walls, par 3-7 | Par = the fewest moves that land on every star, by breadth-first search on the server; 3 of 4 at par |
| CH0 set-up from memory | Place the 32 pieces on an empty board | Exact placement against the start; all 32 right |
| CH1 K+Q v K play-outs | 5 random won starts (mate in 6-10) | Perfect defence and the verdict from the KQK table: mate within the fastest mate + 6, never stalemate |
| CH1 two legal games | 2 games against the lowest measured bot, recorded on the server | Both played to a result under the rules (resigned or abandoned games are not full games). The board refuses illegal moves; typed ones are refused and counted |
| CH2 K+R v K play-outs | 5 starts (mate in 8-16) | KRK table: mate within the fastest + 8, inside the 50-move rule, never stalemate |
| CH2 pieces left hanging | 12 rapid games (15+10, the server's clock) against the 600-800 bots | Stockfish review of each game: median at most 1 knight-or-bigger left en prise (a plain exchange wins 2 pawns or more and Stockfish agrees the move lost 1.5+), and 40% of the points |
| CH3 K+P v K play-outs | 4 won starts as White, 2 drawn starts as Black (mirrored at random) | KPK table with the distance to a winning promotion: perfect defence (the longest), and the table says when a win is thrown away or a draw lost |
| CH3 games | 12 rapid games, 900-1100 bots | 50% and median blunders at most 1 (a move that loses 20% or more of the winning chances, Lichess's formula) |
| CH4 calculation | 10 positions: type the whole line, every reply too | Exact against the line; a different mate on the last move is accepted; 7 of 10 |
| CH4 games | 12 rapid games, 1200-1400 bots | Performance rating 1250+ (maximum likelihood on the bots' measured ratings) and median blunders at most 1 |
| CH5 Lucena and Philidor | One Lucena as White, one Philidor as Black | Stockfish defends (or attacks) on our server and judges: promoted with Stockfish +6 or a mate = won; Stockfish +4 against the defender twice running, or no hold, = lost; 30 moves held = held |
| CH5 games | 12 rapid games, 1400-1600 bots | Performance 1450+ |

**The data, and how it was checked** (`tools/build-chess-sittings.js`)

- **Endgame tables:** KQK and KRK distance to mate from the staged, independent retrograde builder (`staged/skills/lib/endgame-tables.js`: KQK longest mate 10, KRK 16, the known values). KPK with the distance to a winning promotion, built by the tool and checked position by position against that builder's own KPK verdicts (0 disagreements; longest win 19 moves). Packed with brotli, 0.2 MB, a SHA-256 per table checked at load. The test checks 500 KQK/KRK and 400 KPK positions against the app's own rules engine.
- **Rook endings:** 109 Lucena starts (the pawn on the b- to g-file, its king on the queening square, Black's king cut off on either side; White to move), each a win for Stockfish 19 at 2M nodes (a mate or +5). 120 Philidor starts (Black to move), each within 0.6 pawns of equal, kept only when at least one natural rook move off the third rank loses (+3 or a mate). One of each is drawn at random per sitting.
- **Calculation lines:** 71 Lichess puzzles (CC0; rated 1100-1799, deviation 80 or less, popularity 90+, 2,000+ plays; none of them in the app's 3,726-puzzle import, so a learner cannot have seen them in the trainer). 65 have 3 learner moves and 6 have 4. Each learner move is Stockfish's best by 1.5 pawns or a mate and each reply its clear best (50 cp); 71 of 175 candidates survived.
- **The bots and their ratings:** measured in 390 games on this machine (CHESS-ENGINE-BAKEOFF.md, "A rating for our bot"). The bands use the Lichess-rapid scale, Maia-2's levels fixed at their own ratings:

| bot | rating (95% interval) | serves |
|---|---|---|
| our bot, strength 1 | 126 (-20 to 235) | CH1 legal games (the lowest bot) |
| our bot, strength 3 | 789 (570-932) | CH2 games, 600-800 |
| our bot, strength 5 | 973 (850-1089) | CH3 games, 900-1100 |
| our bot, strength 10 | 1040 (948-1122) | CH3 games |
| Maia-2 1100 | 1100 (anchor) | CH3 games, where installed |
| Maia-2 1300 | 1300 (anchor) | CH4 games, where installed |
| our bot, strength 7 | 1397 (1286-1511) | CH4 games, 1200-1400; CH5 (within 100 of the band) when Maia-2 is absent |
| Maia-2 1500 | 1500 (anchor) | CH5 games, 1400-1600, where installed |

A game's opponent is drawn from the bots inside the band (or the nearest within 100 points). The performance rating uses these numbers.

**What the page does** (`public/js/chess-sittings.js`): a board played against the server (moves by board or typed; the reply is drawn as the last move), the clock for rapid games, the review after each game (blunders, pieces left hanging, accuracy), a star-maze grid, a set-up board with a piece palette, and a non-movable board with a line field. It calls only `/api/skills/checks` through the page's own `post`; no camera, microphone, recorder or outside host (checked by the test).

**Tests:** `scripts/skills-r3-chess-test.js`, 61 checks (60 when Stockfish is not installed; one extra check runs real Stockfish on a stored Lucena start): off leaves 02's `not_wired`; on wires all 20; the tables against the rules engine (500 KQK/KRK, 400 KPK positions); KQK end to end through the API (illegal move refused, the defence is always a longest one, perfect play mates all 5 and passes cold, a hung queen fails, giving up fails); the KRK limit; KPK wins and holds by table play, a losing defence fails; Lucena and Philidor with a stand-in engine, and without Stockfish they say why and an open one is refused with 503; mazes (par equals the test's own search, walls refused, 3 of 4 at par passes); set-up grading (32 right, a swap is 30, an extra piece wrong); whole lines (with or without move numbers, a wrong reply or a short line fails, no key to the page); bands and availability; two legal games played to the end on the server (the second as Black, an illegal typed move counted); a 15+10 clock lost on time, a game abandoned after 6 hours, resignation, a series open after 12 hours and closed as failed after 21 days; the game review (Qxf7+?? is a blunder and a piece left hanging, a quiet opening is clean); the series rules (score, medians, performance, clean sweeps); the page script has no fetch, upload, recorder, camera or microphone of its own.

**Known limits**

- **Two-day rule on games:** a games check is a block of 12 games, so a proof is two passing blocks begun on different days (24 games). A rolling window of the last 12 would cost fewer games; that is a rule change for the owner.
- **Legal games:** the board refuses illegal moves, so on the board "no uncorrected illegal attempt" comes down to finishing two games under the rules.
- **Our bot's ladder is uneven:** strength 7 (1397) is stronger than strength 10 (1040), because strengths 8-10 hit the node-budget bug (CHESS-ENGINE-BAKEOFF.md). Strength 7 covers the 1200-1400 band and, within 100 points, 1400-1600 when Maia-2 is absent. If `bot.js` is fixed, the ratings must be measured again before the bands are trusted.
- **Rook endings, hanging pieces and blunders need Stockfish on the server**; without it they say `not_wired`.
- **Maia-2's worker stopped about 65 times during the 390 bench games** (it restarts on the next call). The sitting's game code asks twice, then plays that one move with the measured bot nearest the Maia level's rating.

## 06 Piano and basketball sittings (`SKILL_PIANO_BB_SITTINGS=on`; built and live 2026-10-24 evening, LIVE-CHANGES-2026-10-24.md)

Built 2026-10-24 (away run, task 5). It wires every piano and basketball check that 02 listed as "not wired", and the later stages 02 never listed (PI5-7, PI8-10, BB4-5, BB6-7, BB8-12). With it on, all **25 of 25** machine-provable piano metrics (PI0-PI16) and **19 of 19** basketball metrics (BB0-BB12) have a sitting (`skill-audit.js --checks=<app>`, "every stage" line). Not a patch file: applied straight to the live tree after the test copy passed, files backed up to scratchpad `before-skill-checks-2/`.

- **Files.** New: `content/piano-sight-reading.js` (excerpt generator, pedal passage, `scaleRun`), `content/basketball-scenes.js` (drawn decision scenes and the rule that reads them), `content/skill-piano-bb-sittings.js` (+ `.data.json`, built by `tools/build-piano-bb-data.js` from the staged drills), `services/skill-piano-bb-sittings.js`, `public/js/piano-notation.js`, `scripts/skills-r3-piano-bb-test.js`. Changed: `content/skill-stage-checks.js` (`checkFor` asks 06 after 05; titles), `services/skill-checks.js` (06's parts, scoring hooks, `ms` answer times, pedal moves, the learn-a-piece assignment, seen excerpts, a fix to `scaleMidis`), `services/skill-gate.js` (default shadow list), `services/skill-dose.js` and `routes/skill-checks.js` (pedal moves, answer times, grade context), `public/js/skill-kit.js`, `public/js/stage-check.js`, `public/js/skill-practice.js`, `public/stage-check.html`, `public/skill-practice.html`, `public/css/skills.css`, `content/skill-learner-text.js` (12 lines now state the numbers they are graded by), `scripts/lib/skills-r3-fixture.js` (06 off for 01-04's tests), `package.json`, `../skills/skill-audit.js` (reads 06; prints every stage).

**How each metric is sat**

| metric | sitting | the machine's verdict |
|---|---|---|
| PI2/PI3/PI4 sight-reading | 2 new excerpts at SR2/SR3/SR4, generated when the sitting opens and drawn in notation (treble, bass or grand staff, key signature, metre, ties, beams, triplets, two-note chords) | piano-core: notes 80% and on the beat 80% in both (pitch and rhythm scored separately, the staircase rule). Never-seen: the record keeps the learner's last 300 excerpt fingerprints and none repeats. A microphone take is confirmed by a second take, as for every piano take |
| PI5-7 sight-reading | 2 new excerpts at the learner's grade level (SR5, SR6, SR7) | as above |
| PI5-7 technique | 2 items of the grade's battery (PI5, PI6 or PI7), hands together, 120 notes a minute [R] | 97% notes (95% mic, one hand), 90% on the beat, evenness CV 0.09 |
| PI5-7 repertoire | the stage's library pieces (3, all Lower Intermediate), then 3 restarts of one piece from memory at random bars, 2 bars each; the page gets no notes for the restarts | PI3 rules in every part (97%/95%, 90%, no stops) |
| PI5-7 dynamics | a new 8-bar passage, p and f in turn | MIDI only: median f velocity at least 15 above median p, 90% notes; other inputs say why |
| PI8-10 technique | 2 items of PI8 (PI8 and PI10 at Pre-Professional; there is no PI9 battery), 160 notes a minute [R], 4-octave runs moved down to stay on the keyboard | MIDI: 97%, 90%, CV 0.06 |
| PI8-10 pedalling | 8 chords, one a bar, with pedal marks | MIDI with CC64: piano-core `scorePedal`, lift within 150 ms of each new chord (30 ms early allowed for jitter) and down again after it, at 90% of changes; 80% of chords right |
| PI8-10 a piece learned alone | a new 16-bar SR7-style piece made for the learner, kept on the record 14 days ("Get your piece", "See your piece"); then a cold take | PI3 rules; after 14 days a new piece |
| BB1 2v1 | 10 drawn plays on the court (2 frames, paused at the decision) | 8 of 10 |
| BB2 | 15: with the ball (open teammate, drive, hold) and without (cut, fill, stay) | 12 of 15 |
| BB3 | 18: 9 four-against-four passing scenes, each twice in two random blocks (Rösch 2021 design, drawn from above, not first-person) | 15 of 18; median answer time recorded and shown, not gated |
| BB4-5 | 24: ball screens (use, reject, roller, pull-up), drive-and-kick, fast break | 20 of 24 |
| BB6-7 | 30: transition, which defence (man, 2-3, 3-2, 1-3-1), late clock | 24 of 30 |
| BB4-5 spot shooting | makes and attempts at 5 spots, mid-range or the age's 3-point line | per zone: Beta P(rate >= mark) >= 0.8 with 17+ shots a zone (about 50 over 3 sessions); marks 45% / 33% [R]; each zone shown with its 80% interval; camera counts only when confirmed |
| BB4-5 free throws | FIBA line | 65% at 80% confidence, 50+ a sitting |
| BB6-7 shooting profile | as spot shooting, 25+ a zone | varsity marks 50% / 36% [R] |
| BB8-12 applied tasks | 8 box-score computations (bank `bb_stats`, keyed as numbers with a 0.05 tolerance, "52.4", "52.4%" or "52,4") and 2 rules calls | 8 of 10; the scouting report and game plan stay with a person |

**Why the decision keys can be trusted:** a scene is drawn for an intended read and kept only when `read()` — a rule over the players' positions alone (who is open by distance and passing lane, who helped, who is in the drive lane, how many defenders are back, the defence's shape, the shot clock) — gives that read, re-checked on the rounded positions the page draws. The test re-derives 2,040 keys (34 reads x 60) from the positions.

**A fix to 02, found here:** `scaleMidis` built arpeggios to the fifth below the top (PI3 "G major arpeggio" climbed G3...D6 and came back without the top G), so a correct performance came out one beat late on every note down and failed; and PI4 "chromatic from C" had no notes, so a sitting that drew it crashed. Both now go through `scaleRun` (top tonic, melodic minor down as natural, chromatic and whole-tone by pitch class). This is outside the 06 flag: turning 06 off keeps the fix.

**The gate.** 06 makes every PI and BB stage fully wired. The per-stage gate (03) therefore holds by itself on a fully wired stage unless it is in `SKILL_STAGE_GATE_SHADOW`; the code default is now `CH2,CH3,CH4,CH5,PI5-7,PI8-10,BB1,BB2,BB3,BB4-5,BB6-7,BB8-12`. **PI2, PI3 and PI4 now hold** (each of their metrics was sat through the API with MIDI or right answers on two cold days in the test, and graduation was held, then released). In shadow, with reasons:
- **PI5-7:** the repertoire check draws on 3 library pieces, all from the stage's first grade; tempo targets and CV cuts are [R] (exam-board tempo tables were not verified).
- **PI8-10:** no library pieces at these grades (the piece to learn is generated); tempo and CV cuts are [R].
- **BB1-BB7:** the decision scenes have no measured reliability; the progression asks split-half >= 0.8 after 100 learners before a clip set gates. BB4-BB7's zone marks are [R].
- **BB8-12:** only the computations in its applied tasks are machine-checked.

**Tests:** `scripts/skills-r3-piano-bb-test.js`, 88 checks, in `npm test` after the chess test: off leaves 02's `not_wired`; on wires 34 of 34 PI2-PI10/BB1-BB12 metrics; 1,050 excerpts at SR1-SR7 keep their level's keys, metres, key signatures, bars and hands, every bar adds up, every note head scored once (ties not again); one learner never gets the same excerpt in 40 sittings; 176 scores drawn without an error in a stand-in DOM; every battery item's run goes up to the top tonic and back; the arpeggio fix; PI2 sight-reading end to end (pass, wrong notes, off the beat, unconfirmed microphone); PI2, PI3 and PI4: every metric through the API on two cold days, held then graduated; PI5-7 levels by grade, technique CV pass/fail, repertoire with memory parts that send no notes, dynamics pass/fail/on-screen; PI8-10 technique, pedalling (clean, late lifts, none, unreadable), the piece to learn (assigned, due in 14 days, the same piece a week later, passes, renewed after 14 days); 2,040 scenes valid and re-derived; BB1 end to end (7/10 fails with reasons, 10/10 passes), BB3 blocks and answer time, BB2/BB4-5/BB6-7 set make-up; applied-task number grading; zone counts (pass, short, impossible, camera unconfirmed, intervals), free throws, the shooting profile, the Beta interval; the gate's modes and the shadow list; practice sets (a sight-reading piece with notation, a pedalling set with pedal moves); the page scripts have no fetch, upload, recorder, camera or microphone of their own.

**Known limits:** the sight-reading check sits the stage's level (two excerpts), not an adaptive staircase run; SR8-SR10 are not generated (no stage check asks for them). Days are UTC days. Scene sets are drawn from above. The notation is drawn by our own small SVG renderer: clear at phone width, not engraving quality.

## Owner decisions (not built: options written up)

### 10b. Should attested-only metrics need a person's sign-off to complete a stage?

**Which metrics:** the recital (PI3, PI5-7), the programme (PI8-10), the capstones (PI11-16), the warm-up habit (BB2), the filmed set (BB3), the game showcase (BB4-5), the film review (BB6-7), and imported ratings and stats. Today they are recorded and listed on the stage pages, and never hold a stage. PI11-16 has nothing machine-provable at all.

| option | what it means | cost / risk |
|---|---|---|
| A. Listed, never gating (today, recommended for now) | Shown as "Recorded, not machine-checked" | PI11-16 can be left on knowledge alone. Nobody has to review anything. |
| B. Completion required, not quality | The learner must submit the recital or film and self-rate it; no one grades it | Cheap; stops skipping. Proves nothing about musicality or film reads. |
| C. A named person signs off (teacher, coach, parent) | A sign-off flow: who may sign, what rubric, an audit trail; a parent signing a child's own work is weak evidence | Needs consent rules for any film or audio leaving the device (today nothing does), and a reviewer role. |
| D. Our own reviewers | Paid or volunteer reviewers rate against anchor clips | Cost, privacy and moderation; the consent gate is blocked until the owner decides. |

### 10c. A margin above the bar at exit

Adaptive leaves stages with 97.7-99.9% of metrics truly at the bar, against the gate's 99.8-100%, and with lower 30-day recall (table above). The options, measured with the audit's `SKILL_EXIT_DOSE` knob (audit only; nothing in the app):

| option | chess 30 days / min per stage | piano | basketball | notes |
|---|---|---|---|---|
| A. No margin (today: proof is the bar) | 0.774 / 2,807 | 0.684 / 2,983 | 0.804 / 2,424 | Fewest minutes |
| B. Exit dose 0.25: hold the stage until each metric has had a quarter of its proof's sets again after the proof (at least 2) | 0.844 / 3,280 | 0.831 / 5,016 | 0.865 / 2,846 | Chess matches the gate at +2% minutes; basketball beats it at +6%. Piano costs +65%, and fewer simulated learners finish all 5 piano stages in 900 days (44% vs 63%). |
| C. Exit dose 0.5 | 0.882 / 3,980 | 0.875 / 6,085 | 0.907 / 3,369 | Highest retention; +24-100% minutes |
| D. A score margin: pass at bar + x on the last cold sitting | not simulated | | | Needs per-metric margins (a make-rate, a rating, a note share). The Beta and rating rules already carry their own uncertainty. |
| E. Per subject: B for chess and basketball, A for piano until real data | as B and A | | | Recommended to try first. Piano's cost comes from long stages with many metrics. |

Measured with `SKILL_EXIT_DOSE=0.25` and `0.5`; outputs in `skill-audit.exit-dose-*.txt`.

## Test results, patch 05 (2026-10-24)

- **Where:** a fresh copy of the live tree (01-04 live since 03:30), 05 applied, a copy of `data/db.json`, keys blanked, `OLLAMA_ENABLED=0` (`tools/chain.js`).
- **Full chain plus `learner-path-test` and `skills-r3-chess-test`:** 47 of 49. The two failures, `self-test` (essay rubric) and `security-test` (the lesson script route now answers 410), fail the same way with 05 reversed: other agents' live work in progress, not this patch.
- **`skills-r3-chess-test`:** PASS, 60 checks (61 with Stockfish installed). With 05 on the copy: `skills-r3-{checks,gate,dose,record}-test`, `consent-test` (no-upload scan) and `coverage-test` pass.
- **`git apply --check -p1 05-chess-sittings.patch`** passes on today's live tree; `tools/mkpatch05.js` writes it from the scratch app, `tools/build-chess-sittings.js` builds its data.
- **Skill audit** with `--checks=<app with 05>`: chess 20 of 20 provable metrics in CH0-CH5 have a sitting, every chess stage fully checkable; PASS, 0 violations (`skill-audit.txt`).
- **Click-through** (port 6805, a DB copy, flag on, Stockfish installed): a KQK play-out move answered by the table defence, a rook maze solved at par, set-up from memory passed and counted cold, a Lucena move answered by Stockfish; no console errors.

## Test results (2026-10-23)

- **Full `npm test` chain plus `learner-path-test` and the four new tests:** 36 of 36 pass (`tools/chain.js`).
  - Where: a clean copy of the live tree with all four patches applied, a copy of `data/db.json`, every key blanked and `OLLAMA_ENABLED=0`.
  - Exception: `ollama-provider-test` runs without that variable, because it checks it itself.
- **Each patch on its own** (02-04 on top of 01), on the same kind of copy:
  - 01: its test, `coverage-test`, `self-test` and `consent-test` pass.
  - 01+02, 01+03, 01+04: each new test passes, with `record-test` and `coverage-test`. The dose test runs its no-02 branch here.

| test | checks | covers |
|---|---|---|
| `skills-r3-record-test.js` | 37 | collection and consent list; off gives 404; stage of a grade; ownership, 401, other subjects; cold, warm, day, source, kind stored; practice makes it warm; two days prove it; pass/miss/pass is not proof; unconfirmed microphone, unlisted on-screen keys, camera where not listed and attested metrics never count; retention, kept, stale; knowledge from coverage; child deletion removes skill rows |
| `skills-r3-checks-test.js` | 56 | off and flag gating; not-wired checks say what they need; due only at the Final; the path row; an items sitting end to end (no key to the page, resume, no changing answers, 18/20 pass, warm retake not counted, a miss then two passes prove it); every check/mate/stalemate and mate-in-one key re-checked with the rules engine; tactics keys legal; KPK set and mirror; a sitting left open closes as failed; piano MIDI pass, one wrong note fails, microphone unconfirmed then confirmed by a second take, pieces from the library, a stop fails, steady beat from the click, cadence chords; puzzle rating needs 10 rated puzzles and the cut; basketball each hand, minimum n, camera confirmed or not, bad numbers refused, ratio, baseline and growth; the Beta rule; the page scripts have no upload, recorder or camera/microphone of their own |
| `skills-r3-gate-test.js` | 22 | shadow graduates and records; off; on holds, page lists, path row, graduate refused; one day is not enough; two days complete; proofs re-derive; graduate goes through and releases; stale proofs hold until a fresh pass; retention holds; attested never holds; other subjects and a stage's non-last grade untouched; inert with the record off |
| `skills-r3-dose-test.js` | 24 | every metric gets practice; dose by distance; the maintenance share (`overlearn`) and `SKILL_MAINT_SHARE=0`; dose done drops to maintenance; ready warm sets call a cold test; off gives 404; today's plan and reasons; path row; logged set judged by the rule; recorded as warm practice, making a sitting warm; plan counts down; warm items set with immediate feedback; the plan's early test is due on the stage check before the Final; unwired skills logged on the learner's word; outside today's plan refused |

- **Skill audit:** PASS, guarantee 0 violations (`skill-audit.txt`).
- **Consent:** `consent-test` passes, including the no-upload scan of the camera and microphone modules and the collection list check.
- **Live tree:** untouched by this round, checked against an md5 snapshot taken at the start.
  - **Not changed:** `services/coverage.js` and `services/adaptation.js`, which this round owned.
  - **One file changed during the run, not by this round:** `services/game-payloads.js`, presumably another agent's work.
  - **Edited in staging:** `../skills/skill-adaptation.js` (the maintenance share, carry-over knob) and `../skills/skill-audit.js` (the `adaptive_r2` policy, the 30-day lines, `SKILL_EXIT_DOSE`).
  - **Backups:** scratchpad `before-skills-r3/`.

## Screenshots (`screenshots/`, each at 1280 and 375 px)

The click-through ran on the placement-uitest copy: port 6799, a copy of `db.uitest.json`, all four flags on, keys blanked. It used a seeded adult test learner (`tools/seed-ui.js`, `tools/shoot-all.sh`). No page overflowed horizontally, and no page logged a console error. The only log lines were the browser's autoplay notice when the headless run pressed a piano key without a real gesture.

| file | what it shows |
|---|---|
| `01-path-stage-rows` | Chess at the Final: "This stage" with the stage check, before you leave, today's practice |
| `02-stage-check-overview` | The chess checks: one proven waiting on retention, one ready cold, two not checkable yet with what they need |
| `03-stage-check-question`, `04-stage-check-result` | Mate in one on the board, and a result: below the bar, counted, the misses |
| `05-practice-plan` | Piano's plan: the cold check first, then the sets and why |
| `06-practice-set-keys`, `07-practice-set-verdict` | A warm set: find a key on the on-screen keys, marked at once |
| `08-piano-check-before-final` | The plan called a check before the Final |
| `09-basketball-count`, `10-basketball-count-result` | Lay-ups each hand from the camera tracker, not confirmed, so not counted |
| `11-stage-left-held`, `12-path-held` | Graduation held: what is left, and the path |

## Known limits and follow-ups (not blockers)

- **The held path's main button** still says "Take the Graduation exam" (as round 3's patch 05 had to change for coverage). The "Graduation waits on this stage's skills" row is just below it. Patch 03 could take over the hero action when applied.
- **Days are UTC days.** A learner's local midnight would be better for "different days".
- **Answer items heard by the microphone** (find keys, echo) are estimates with no confirmation step, so they never count. Use MIDI or, where the metric lists it, the on-screen keys.
- **Echo and chord-by-ear items send their notes to the page** so it can play them. A learner reading the page's data could see them.
- **Chess tactics sets lack their "nothing to find" positions**, which need Stockfish-checked quiet positions (a build job).
- **Basketball make-rate bars are judged per sitting** with a minimum n (for example 20 free throws), not pooled over 3 sessions. This is stricter than the progression's wording.
- **The puzzle-rating cuts (1590, 1790) are provisional [R]**: 80% expected on the progression's sets.
