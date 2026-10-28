# Chess engine bake-off (2026-10-23)

Our practice bot vs Leorik 3.2.1 (MIT) vs Stockfish 19 (GPL-3, run as its own program) vs Maia-2 (MIT), on this laptop: Ryzen 9 6900HS, RTX 3050 Laptop 4 GB, Windows 11. Other jobs were using the CPU at the same time (load near 100%), so the speeds are on a busy machine.

- Script: `chess-engine-bakeoff.js` (`prepare`, `run`, `match`). Raw numbers: `chess-bakeoff-results.json`.
- Test sets (`chess-data/`, all CC0 Lichess data):
  - **tactics**: 300 Lichess puzzles rated 600-2599, held out from the app's import (RatingDeviation 81-150; the import takes 80 or less). Right means the engine's move is the solution's first move, or any mate.
  - **evals**: 300 positions from the Lichess cloud-evaluation database with evaluations at depth 30 or more.
  - **human**: 300 real moves that players made just before a puzzle (usually a mistake).

## Results

### Analysis strength, at a fixed time per position, one thread

| Engine | Tactics @100 ms | Tactics @1 s | Agrees with depth-30+ best move @100 ms / @1 s | Eval error, median (mean), @1 s | Nodes/s |
|---|---|---|---|---|---|
| Our bot (JS, in the browser) | 59.3% | 77.0% | 35.7% / 38.0% | 60 cp (120) | 21-36k |
| Leorik 3.2.1 | 97.7% | 99.7% | 56.3% / 61.7% | 35 cp (83) | ~1.0M |
| **Stockfish 19** | **99.7%** | **100%** | **67.3% / 75.0%** | **22 cp (81)** | 0.5-0.8M |
| Stockfish 19, 4 threads @1 s | | 99.7% | | | |
| Maia-2 (no search) | 61-63% | | | | 12-22 ms a move |

Our bot by puzzle rating @1 s: 30/30 under 800, 56/60 at 800-1199, 52/60 at 1200-1599, 43/60 at 1600-1999, 35/60 at 2000-2399 and 15/30 at 2400+. It is fine for beginners' puzzles and far too weak to judge a club player's game.

### Human-likeness: matching the move a real player made

| Engine | Top-1 match |
|---|---|
| Stockfish @100 ms | 3.0% |
| Leorik @100 ms | 7.0% |
| Our bot @1 s | 17.7% |
| Our bot, strength 3 (beginner slips) | 25.3% |
| **Maia-2 at 1100 / 1500 / 1900** | **41.3% / 39.7% / 39.7%** |

These are the moves that set up a puzzle, so most are mistakes. Strong engines almost never play them; Maia-2 predicts four in ten. Maia-2 was trained without the opening moves of games, and it predicts odd first moves (1.Nf3 31%, 1.Nc3 25% for a 1200 player), so the sparring bot plays from the CC0 opening book first.

### Speed

- Maia-2 (rapid model, 280 MB weights) median 22 ms a move on the GPU and 21 ms on the CPU (2 threads); first call 4-6 s to load, about 30 s on a cold disk. The GPU gives no gain for one position at a time.
- Stockfish: about 0.5-0.8M nodes/s per thread on this busy machine; the import's 800k-node checks took 1-2 s each.
- Our bot: 21-36k nodes/s; a depth-4 search takes 5-10 s.

### Matches

- Stockfish vs Leorik, 100 ms a move, 10 games from 5 openings with colours swapped: **Stockfish 8-2** (6 wins, 4 draws, no losses).
- Our bot (strength 10) vs Stockfish limited to its lowest setting (UCI_Elo 1320): the run was cut short by a pause after game 1, which our bot lost. Not enough to rate it. **Done properly on 2026-10-24: see "A rating for our bot" below (390 games).**

## A rating for our bot (2026-10-24)

390 games on this laptop (local CPU, nothing paid), against calibrated anchors: Stockfish 19 with `UCI_LimitStrength` at UCI_Elo 1320, 1500 and 1800 (200 ms a move, one thread; the Stockfish team calibrates UCI_Elo against CCRL 40/4 ratings), and Maia-2 rapid at 1100, 1300 and 1500 (Lichess rapid ratings), sampled the way the app's sparring partner plays it (moves under 3% left out). Script: `chess-bot-rating.js` (`run`, `fit`); every game: `chess-bot-rating-games.jsonl`; numbers: `chess-bot-rating-results.json`.

- **Games:** 24 named opening lines from the CC0 Lichess list (6-8 plies, Stockfish within 0.8 pawns), each played twice with colours swapped. A draw by stalemate, too little material, threefold repetition, the 50-move rule or 300 plies. Resign adjudication: full-strength Stockfish (depth 10) has one side 10 pawns up or mating on consecutive checks over 8 plies (235 of the 390 games ended that way; 120 by mate, 35 drawn).
- **Fit:** Bradley-Terry on the Elo scale (a draw counts half), maximum likelihood with the anchors fixed at their nominal ratings, a weak prior (1200 +- 800) so a player who won or lost everything stays finite; 95% intervals by bootstrap over games (2,000 resamples). Two fits: Stockfish levels fixed (CCRL-like scale), and Maia-2 levels fixed (Lichess rapid scale).
- **Harness failures removed, not counted:** 70 games cut short because Maia-2's worker stopped mid-game (it restarts on the next call) were thrown away and replayed, and games where a Stockfish process did not start within 15 s on the loaded machine were never saved and were played again; none of the 390 counted games has a missing move.

| Player | Games | Rating, Stockfish levels fixed (95% interval) | Rating, Maia-2 levels fixed (95% interval) |
|---|---|---|---|
| Our bot, strength 1 | 28 | **272** (111-398) | **126** (-20-235) |
| Our bot, strength 3 | 30 | **963** (719-1129) | **789** (570-932) |
| Our bot, strength 5 | 58 | **1131** (990-1259) | **973** (850-1089) |
| Our bot, strength 10 | 124 | **1163** (1065-1241) | **1040** (948-1122) |
| Maia-2 1100 | 118 | **1307** (1217-1395) | 1100 (anchor) |
| Stockfish UCI_Elo 1320 | 102 | 1320 (anchor) | **1210** (1115-1304) |
| Maia-2 1300 | 52 | **1365** (1251-1486) | 1300 (anchor) |
| Maia-2 1500 | 54 | **1392** (1282-1495) | 1500 (anchor) |
| Our bot, strength 7 | 56 | **1441** (1339-1546) | **1397** (1286-1511) |
| Stockfish UCI_Elo 1500 | 58 | 1500 (anchor) | **1536** (1426-1670) |
| Fixed candidate, strength 10 | 82 | **1651** (1562-1757) | **1637** (1530-1784) |
| Stockfish UCI_Elo 1800 | 18 | 1800 (anchor) | **1833** (1646-2160) |

**What it says**

- **Our bot at the app's top strength (10) is about 1040 on the Lichess scale (95%: 948-1122), about 1160 on the Stockfish/CCRL scale (1065-1241).** That is above the "below ~1000" estimate, but only just: it scored 6/30 against Maia-2 1100 and 11.5/30 against Stockfish 1320.
- **Strength 7 is stronger than strength 10** (about 1400 v 1040; strength 7 beat strength 10 9.5-0.5). The cause is a bug in `public/engine/chess/bot.js` `chooseMove`: once the node budget (40,000 x depth) runs out, every root move searched after that returns the search window's edge, scores +100000 ("mate"), and the first of them is played. Depth 4 (strengths 9-10) always runs out in a middlegame, depth 3 (6-8) sometimes; the bot then plays an arbitrary move (in the Italian Game test position it chose 7.b4 with score 100000). Strength 5 and below search 1-2 plies and never run out.
- **The fix, measured (bench only, `bot-candidate.js`; the live bot is untouched):** iterative deepening, keeping the last depth searched in full. The same strength 10 rates **about 1640 (Lichess scale 1530-1784; Stockfish scale 1651, 1562-1757)**: +600 over the live bot, 11.5/12 against it, 13/16 against Stockfish 1320, 2/10 against Stockfish 1800. Applying it to `bot.js` is a live change for the owner to approve; the kids' play-outs at strengths 1-5 would not change, and the strength-to-rating table below would have to be measured again.
- **The app's strength mapping is off.** `spar.js` and `POST /api/chess/bot/move` treat strength *s* as rating 300 + 100*s (strength 1 = 400, 5 = 800, 10 = 1300). Measured (Lichess scale): strength 1 = 126, 3 = 789, 5 = 973, 7 = 1397, 10 = 1040. Strength 1 is far weaker than its label (0/12 against strength 5) and strength 10 far weaker; until the bug is fixed, the ladder is not monotonic above 7.
- **Maia-2's sampled levels are compressed:** 1100, 1300 and 1500 come out at 1307, 1365 and 1392 on the Stockfish scale (overlapping intervals), so its 200-point steps are smaller in play than in name. Stockfish's own levels separate cleanly (1320 v 1500: 1-11; 1500 v 1800: 1.5-6.5).
- **Live since 12:20 UTC 2026-10-24 (owner approved):** the fix went into `bot.js` in a form that leaves strengths 1-5 move for move as before (each depth gets the full budget, root moves in the usual order; 0 of 431 test positions differ at strengths 1-5) and was rated again as `fix-s7` and `fix-s10` (80 more games, 470 in all): **strength 10 = 1663 (95% 1541-1797), strength 7 = 1386 (1275-1508)** on the Lichess scale (1651 and 1458 on the Stockfish scale). `bot.js` now carries these as `RATED` and `strengthForRating()`, which the sparring route and page use instead of 300 + 100 x strength. The first candidate (`bot-candidate-v1.js`, rows "Fixed candidate") shared one budget across depths.
- **Use:** patch 05's recorded-game bands (`staged/adaptation/skills-round3/README.md`, section 05) take these Lichess-scale numbers: strength 1 for the CH1 legal games, strength 3 for 600-800, strengths 5 and 10 (and Maia-2 1100) for 900-1100, strength 7 and Maia-2 1300 for 1200-1400, Maia-2 1500 for 1400-1600.

| Pairing | Games | Score for the first | W / D / L | Adjudicated |
|---|---|---|---|---|
| Fixed candidate, strength 10 v Maia-2 1100 | 16 | 14.5 | 13 / 3 / 0 | 7 |
| Fixed candidate, strength 10 v Maia-2 1500 | 12 | 10.5 | 10 / 1 / 1 | 6 |
| Fixed candidate, strength 10 v Our bot, strength 10 | 12 | 11.5 | 11 / 1 / 0 | 8 |
| Fixed candidate, strength 10 v Stockfish UCI_Elo 1320 | 16 | 13 | 12 / 2 / 2 | 8 |
| Fixed candidate, strength 10 v Stockfish UCI_Elo 1500 | 8 | 5.5 | 5 / 1 / 2 | 6 |
| Fixed candidate, strength 10 v Stockfish UCI_Elo 1800 | 10 | 2 | 2 / 0 / 8 | 7 |
| Maia-2 1100 v Maia-2 1300 | 8 | 2.5 | 2 / 1 / 5 | 4 |
| Maia-2 1100 v Stockfish UCI_Elo 1320 | 16 | 6.5 | 6 / 1 / 9 | 8 |
| Maia-2 1300 v Stockfish UCI_Elo 1320 | 16 | 9.5 | 9 / 1 / 6 | 8 |
| Maia-2 1300 v Stockfish UCI_Elo 1500 | 8 | 4 | 4 / 0 / 4 | 4 |
| Maia-2 1500 v Stockfish UCI_Elo 1320 | 12 | 7.5 | 7 / 1 / 4 | 6 |
| Maia-2 1500 v Stockfish UCI_Elo 1500 | 12 | 4.5 | 4 / 1 / 7 | 5 |
| Our bot, strength 1 v Maia-2 1100 | 8 | 0 | 0 / 0 / 8 | 5 |
| Our bot, strength 1 v Our bot, strength 5 | 12 | 0 | 0 / 0 / 12 | 10 |
| Our bot, strength 10 v Maia-2 1100 | 30 | 6 | 4 / 4 / 22 | 22 |
| Our bot, strength 10 v Maia-2 1300 | 20 | 7.5 | 6 / 3 / 11 | 11 |
| Our bot, strength 10 v Maia-2 1500 | 10 | 3 | 2 / 2 / 6 | 6 |
| Our bot, strength 10 v Our bot, strength 5 | 12 | 4.5 | 4 / 1 / 7 | 8 |
| Our bot, strength 10 v Stockfish UCI_Elo 1320 | 30 | 11.5 | 10 / 3 / 17 | 19 |
| Our bot, strength 3 v Maia-2 1100 | 12 | 0.5 | 0 / 1 / 11 | 9 |
| Our bot, strength 3 v Our bot, strength 1 | 8 | 8 | 8 / 0 / 0 | 8 |
| Our bot, strength 3 v Our bot, strength 5 | 10 | 3.5 | 3 / 1 / 6 | 6 |
| Our bot, strength 5 v Maia-2 1100 | 16 | 4 | 3 / 2 / 11 | 10 |
| Our bot, strength 7 v Fixed candidate, strength 10 | 8 | 1 | 1 / 0 / 7 | 5 |
| Our bot, strength 7 v Maia-2 1100 | 12 | 10 | 10 / 0 / 2 | 6 |
| Our bot, strength 7 v Maia-2 1500 | 8 | 3.5 | 3 / 1 / 4 | 4 |
| Our bot, strength 7 v Our bot, strength 10 | 10 | 9.5 | 9 / 1 / 0 | 9 |
| Our bot, strength 7 v Our bot, strength 5 | 8 | 8 | 8 / 0 / 0 | 4 |
| Our bot, strength 7 v Stockfish UCI_Elo 1500 | 10 | 2 | 1 / 2 / 7 | 5 |
| Stockfish UCI_Elo 1320 v Stockfish UCI_Elo 1500 | 12 | 1 | 1 / 0 / 11 | 6 |
| Stockfish UCI_Elo 1500 v Stockfish UCI_Elo 1800 | 8 | 1.5 | 1 / 1 / 6 | 5 |

## Choices, per use

| Use | Choice | Why | Licence handling |
|---|---|---|---|
| Game review (Chess_PlayOut "Review the game") | **Stockfish on our server** (`POST /api/chess/review`, depth 12); Leorik when Stockfish is absent; the in-browser bot in a Web Worker when the server has no engine or the learner is offline | Best accuracy by a wide margin (75% vs 38% agreement with deep analysis at 1 s) | GPL-3 Stockfish runs as a separate program on our machine and is never sent to browsers, so nothing is distributed |
| Puzzle and lesson verification (build time) | **Stockfish**, 800k-1M nodes, MultiPV 2-5 | 100% on held-out tactics; gives "only move" and "good move too" lists | Build machine only |
| Human-like sparring partner (`POST /api/chess/bot/move`, `spar.html`) | **CC0 opening book, then Maia-2** at the chosen rating (1100-2000+), sampled from its likely moves; **our bot** below 1000 and as the fallback | Maia-2 matches human moves 40% of the time against 3-7% for the engines | MIT; runs in a Python worker on our server (`tools/chess/maia2-worker.py`); Maia-3 (AGPL) not used |
| Lesson play-outs for young children (Chess_PlayOut) | **Our bot** (strength 1-10) | It is goal-aware, runs offline in the browser, and its slips suit 4-8-year-olds. Measured 2026-10-24: strength 1 about 130, 5 about 970, 10 about 1040 (Lichess scale); strengths 8-10 are held back by a node-budget bug (see the rating section) | Our own code |

Not chosen: stockfish.js in the browser (GPL-3; owner decision 1(b) not taken), Maia-3 (AGPL), any Lichess code (AGPL/GPL), the full 22.4 GB Lichess evaluation file (Stockfish on the server answers the same questions; a 16 MB prefix, 170,282 positions, was used as test data).
