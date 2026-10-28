/**
 * The chess stage checks that patch 02 listed as "not wired", as sittings
 * (staged patch skills-round3/05-chess-sittings; SKILL_CHESS_SITTINGS=on, on top
 * of SKILL_RECORD and SKILL_STAGE_TESTS). services/skill-chess-sittings.js runs
 * them; content/skill-stage-checks.js hands them out in place of "not wired"
 * while the flag is on.
 *
 *   playout  the learner plays a position out against perfect defence on the
 *            server. K+Q v K, K+R v K and K+P v K: the defence and the verdict
 *            come from the endgame tables (content/chess-endgame-tables.js).
 *            Lucena and Philidor: Stockfish defends and judges, on our server.
 *   games    recorded games: the server holds the board, takes the learner's
 *            moves, answers with the band's bot and keeps the clock. Each game
 *            is analysed by Stockfish when it ends (blunders, pieces left
 *            hanging, accuracy); the opponents' ratings were measured
 *            (curriculum-build/skill-apps-bench/CHESS-ENGINE-BAKEOFF.md).
 *   maze     star mazes: one piece, stars and walls; the par is the fewest
 *            moves that collect every star (breadth-first search on the server).
 *   items    two new item kinds in patch 02's items sittings: `setup` (place
 *            the 32 pieces) and `line` (type the whole line, every reply too).
 *
 * Numbers marked [R] are provisional, as in the progressions.
 */
'use strict';

const RAPID = { base: 900, inc: 10 }; // 15+10, as the progression asks

const CHECKS = {
  'CH0:star_maze_par': { how: 'maze', pieces: ['R', 'B', 'Q', 'N'], stars: [3, 4], walls: [2, 4], rule: { at_par: 3 }, source: 'board', minutes: 10,
    says: 'Four star mazes, one each for the rook, bishop, queen and knight: collect every star in no more moves than the par. 3 of 4 at par.' },
  'CH0:setup_from_memory': { how: 'items', build: 'chess_setup', count: 1, rule: { right: 1 }, source: 'board', minutes: 4,
    says: 'Set up the starting position on an empty board, White at the bottom (a light square in your right-hand corner). All 32 pieces right.' },
  'CH1:kqk_playout': { how: 'playout', build: 'kxk', piece: 'Q', count: 5, dtm: [6, 10], slack: 6, rule: { all: true }, source: 'board', minutes: 15,
    says: 'Five queen-and-king against king positions, against perfect defence: checkmate in each within 6 moves of the fastest mate, and never stalemate.' },
  'CH1:legal_game': { how: 'games', games: 2, band: 'lowest', clock: null, analyse: false, rule: { completed: 2 }, source: 'games', minutes: 30,
    says: 'Two full games against the gentlest bot, recorded here. Every game played to its end under the rules; an illegal move you type is refused and you play another.' },
  'CH2:krk_playout': { how: 'playout', build: 'kxk', piece: 'R', count: 5, dtm: [8, 16], slack: 8, fifty: true, rule: { all: true }, source: 'board', minutes: 25,
    says: 'Five rook-and-king against king positions, against perfect defence: checkmate in each within 8 moves of the fastest mate, inside the 50-move rule, never stalemate.' },
  'CH2:hung_pieces_per_game': { how: 'games', games: 12, band: [600, 800], clock: RAPID, analyse: true, rule: { median_hung: 1, score: 0.4 }, source: 'games', minutes: 360,
    says: '12 rapid games (15+10) against the 600-800 bots, recorded here: at most 1 piece left hanging per game (the median), and 40% of the points.' },
  'CH3:kpk_playout': { how: 'playout', build: 'kpk', win: 4, draw: 2, moves: 40, rule: { all: true }, source: 'board', minutes: 20,
    says: 'King and pawn against king, against perfect defence: win 4 won positions as White (a queen that the table says wins), and hold 2 drawn ones as Black.' },
  'CH3:games': { how: 'games', games: 12, band: [900, 1100], clock: RAPID, analyse: true, rule: { score: 0.5, median_blunders: 1 }, source: 'games', minutes: 360,
    says: '12 rapid games against the 900-1100 bots: half the points, and at most 1 blunder a game (the median; a blunder loses 20% or more of your winning chances).' },
  'CH4:calculation': { how: 'items', build: 'chess_line', count: 10, rule: { right: 7 }, source: 'board', minutes: 30,
    says: '10 positions: type the whole winning line, your moves and every reply, without moving the pieces. 7 of 10.' },
  'CH4:games': { how: 'games', games: 12, band: [1200, 1400], clock: RAPID, analyse: true, rule: { performance: 1250, median_blunders: 1 }, source: 'games', minutes: 360,
    says: '12 rapid games against the 1200-1400 bots: a performance rating of 1250 or more, and at most 1 blunder a game (the median).' },
  'CH5:rook_endgame_playouts': { how: 'playout', build: 'rook', lucena: 1, philidor: 1, moves: 40, hold_moves: 30, rule: { all: true }, source: 'board', minutes: 25, engine: true,
    says: 'The Lucena position won as White and the Philidor position held as Black, against Stockfish. Both, on two different days.' },
  'CH5:games': { how: 'games', games: 12, band: [1400, 1600], clock: RAPID, analyse: true, rule: { performance: 1450 }, source: 'games', minutes: 360,
    says: '12 rapid games against the 1400-1600 bots: a performance rating of 1450 or more.' },
};

const GAMES = { open_days: 21, max_plies: 300, abandon_hours: 6 };

module.exports = { CHECKS, GAMES, RAPID };
